//! B-5c: the locks of a class unit are tried and never awaited, the read places of one call share a guard, and a panic
//! under a write guard poisons the object.
#![cfg(feature = "lock")]

use binding_core::{BindingError, Exclusive, Shared};
use std::panic::{catch_unwind, AssertUnwindSafe};

fn kind<T>(result: &Result<T, BindingError>) -> &'static str {
    match result {
        Ok(_value) => "ok",
        Err(error) => binding_core::Kinds::kind(error),
    }
}

#[test]
fn an_exclusive_value_is_busy_while_a_guard_is_held() -> Result<(), BindingError> {
    let cell = Exclusive::new(1_u32);
    let mut writing = cell.write("Counter")?;
    *writing += 1;
    assert_eq!(kind(&cell.write("Counter")), "busy");
    assert_eq!(kind(&cell.read("Counter", &[])), "busy");
    drop(writing);
    let reading = cell.read("Counter", &[])?;
    assert_eq!(*reading, 2);
    assert_eq!(kind(&cell.read("Counter", &[])), "busy");
    assert_eq!(kind(&cell.write("Counter")), "busy");
    Ok(())
}

#[test]
fn the_read_places_of_one_instance_share_a_guard() -> Result<(), BindingError> {
    let cell = Exclusive::new(String::from("a"));
    let other = Exclusive::new(String::from("b"));
    let first = cell.read("Tag", &[])?;
    let again = cell.clone().read("Tag", &[None, Some(&first)])?;
    let third = other.read("Tag", &[Some(&first), Some(&again)])?;
    assert_eq!((first.as_str(), again.as_str(), third.as_str()), ("a", "a", "b"));
    drop(first);
    // The guard is held until its last place is dropped.
    assert_eq!(kind(&cell.write("Tag")), "busy");
    drop(again);
    assert_eq!(kind(&cell.write("Tag")), "ok");
    Ok(())
}

#[test]
fn a_shared_value_is_read_together_and_written_alone() -> Result<(), BindingError> {
    let cell = Shared::new(1_u32);
    let first = cell.read("Counter", &[])?;
    let second = cell.read("Counter", &[])?;
    let same = cell.read("Counter", &[Some(&first)])?;
    assert_eq!(*first + *second + *same, 3);
    assert_eq!(kind(&cell.write("Counter")), "busy");
    drop((first, second, same));
    let mut writing = cell.write("Counter")?;
    *writing = 5;
    assert_eq!(kind(&cell.read("Counter", &[])), "busy");
    assert_eq!(kind(&cell.write("Counter")), "busy");
    drop(writing);
    assert_eq!(*cell.read("Counter", &[])?, 5);
    Ok(())
}

#[test]
fn a_panic_under_a_write_guard_poisons_the_object() -> Result<(), BindingError> {
    let exclusive = Exclusive::new(0_u32);
    let shared = Shared::new(0_u32);
    let writing = (exclusive.write("Counter")?, shared.write("Counter")?);
    let caught = catch_unwind(AssertUnwindSafe(move || {
        let _held = writing;
        panic!("panic-test");
    }));
    assert!(caught.is_err());
    for result in [
        kind(&exclusive.write("Counter")),
        kind(&exclusive.read("Counter", &[])),
        kind(&shared.write("Counter")),
        kind(&shared.read("Counter", &[])),
    ] {
        assert_eq!(result, "internal");
    }
    assert_eq!(kind(&exclusive.clone().read("Counter", &[])), "internal");
    Ok(())
}

#[test]
fn a_panic_under_a_read_guard_or_without_a_guard_leaves_the_object_sound() -> Result<(), BindingError> {
    let exclusive = Exclusive::new(0_u32);
    let shared = Shared::new(0_u32);
    let reading = (exclusive.read("Counter", &[])?, shared.read("Counter", &[])?);
    let caught = catch_unwind(AssertUnwindSafe(move || {
        let _held = reading;
        panic!("panic-test");
    }));
    assert!(caught.is_err());
    let written = (exclusive.write("Counter")?, shared.write("Counter")?);
    drop(written);
    assert_eq!(kind(&exclusive.write("Counter")), "ok");
    assert_eq!(kind(&shared.write("Counter")), "ok");
    Ok(())
}

#[test]
fn a_guard_goes_to_another_thread_with_its_work() -> Result<(), BindingError> {
    let cell = Exclusive::new(1_u32);
    let mut writing = cell.write("Counter")?;
    let done = std::thread::spawn(move || {
        *writing += 1;
    });
    assert!(done.join().is_ok());
    assert_eq!(*cell.read("Counter", &[])?, 2);
    Ok(())
}
