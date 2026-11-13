//! Design B-1, U-7 (d): a `Native` owns what the binding keeps for a language object. Two are equal when they are the
//! same object, a clone shares it, it crosses threads, and the object is released when the last `Native` is dropped.
#![cfg(feature = "construct")]

use binding_core::{HostValue, Native, NativeObject, OutValue, ValueKind};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// What a binding keeps for an object: here a key, and a count of the releases that the test reads.
#[derive(Debug)]
struct Kept {
    key: u64,
    released: Arc<AtomicUsize>,
}

impl NativeObject for Kept {}

impl Drop for Kept {
    fn drop(&mut self) {
        self.released.fetch_add(1, Ordering::SeqCst);
    }
}

fn kept(key: u64, released: &Arc<AtomicUsize>) -> Native {
    Native::new(Kept { key, released: Arc::clone(released) })
}

#[test]
fn two_natives_are_equal_when_they_are_the_same_object() {
    let released = Arc::new(AtomicUsize::new(0));
    let first = kept(1, &released);
    let same = first.clone();
    let other = kept(1, &released);
    assert_eq!(first, same);
    assert_ne!(first, other);
    assert_eq!(HostValue::Callable(first.clone()), HostValue::Callable(same));
    assert_eq!(first.downcast::<Kept>().map(|k| k.key), Some(1));
}

#[test]
fn the_object_is_released_when_the_last_native_is_dropped() {
    let released = Arc::new(AtomicUsize::new(0));
    let native = kept(2, &released);
    let held = OutValue::Native(native.clone());
    assert_eq!(held.kind(), ValueKind::Native);
    let object = HostValue::Object { native, type_name: String::from("Kept"), json_serializable: false };
    drop(object);
    assert_eq!(released.load(Ordering::SeqCst), 0, "the out value still holds it");
    // A core may drop the value on another thread.
    let dropped = std::thread::spawn(move || drop(held)).join();
    assert!(dropped.is_ok(), "the thread panicked");
    assert_eq!(released.load(Ordering::SeqCst), 1);
}
