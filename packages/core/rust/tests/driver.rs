//! The driver of a member with wait async_driver (GN-6n): the runtime of the process, a panic of a poll, and the
//! arming of the faults of the call around each poll.

use binding_core::driver::{block_on, Caught};
use binding_core::BindingError;

#[test]
fn a_future_runs_on_a_tokio_runtime() -> Result<(), BindingError> {
    // A core of tokio finds the runtime of its call.
    let found = block_on(async {
        tokio::task::yield_now().await;
        tokio::runtime::Handle::try_current().is_ok()
    })?;
    assert!(found);
    Ok(())
}

#[test]
fn a_panic_of_a_poll_ends_the_future_with_its_message() -> Result<(), BindingError> {
    let ended = block_on(Caught::new(async {
        tokio::task::yield_now().await;
        panic!("a panic of the core");
    }))?;
    let message: Result<(), String> = ended;
    assert_eq!(message, Err(String::from("a panic of the core")));
    assert_eq!(block_on(Caught::new(async { 7 }))?, Ok(7));
    Ok(())
}

#[cfg(feature = "fault-test")]
mod faults {
    use binding_core::driver::block_on;
    use binding_core::fault::{arm, left, point, take, ArmError, Injected};

    const COPY: &str = "sample.copy";

    #[test]
    fn the_arming_of_the_call_is_installed_around_each_poll() -> Result<(), ArmError> {
        let id = arm("a.member", r#"[{"point": "sample.copy", "kind": "io", "nth": 2}]"#)?;
        let armed = take("a.member");
        let seen = block_on(armed.around(async {
            let first = point!(COPY);
            // The next poll installs the arming again.
            tokio::task::yield_now().await;
            let second = point!(COPY);
            (first, second)
        }));
        assert!(
            matches!(seen, Ok((None, Some(Injected::Io { errno: None })))),
            "{seen:?}"
        );
        assert_eq!(left(id)?, Vec::<String>::new());
        // Outside the future, the thread has no arming.
        assert_eq!(point!(COPY), None);
        Ok(())
    }
}
