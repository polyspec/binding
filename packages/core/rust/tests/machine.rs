//! The state machine of a member with wait async_driver that reaches language code (GN-6ab): the driver gives the
//! output of each wait to the next step, makes each call of language code where it drives, and ends with the result.

use binding_core::machine::{drive, Driving, Machine, Next, Step, Wait};
use binding_core::{BindingError, Passthrough, Raised};
use std::task::{Context, Poll, Waker};

/// A machine that reads one value by I/O and one by a call of language code, and ends with their sum.
#[derive(Default)]
struct Sum {
    stage: u8,
    read: Option<u32>,
    called: u32,
    calls: u32,
}

impl Machine for Sum {
    type Io = u32;
    type Done = Option<u32>;

    fn resume(&mut self, io: Option<u32>) -> Step<u32, Option<u32>> {
        match self.stage {
            0 => {
                self.stage = 1;
                Step::Io(Box::pin(async { 2 }))
            }
            1 => {
                self.read = io;
                self.stage = 2;
                Step::Call
            }
            _ => Step::Done(self.read.map(|read| read + self.called)),
        }
    }

    fn call(&mut self) {
        self.called = 40;
        self.calls += 1;
    }

    fn settle(&mut self, _outcome: Result<Passthrough, Raised>) {}
}

/// The output of a future that is ready at its first poll.
fn ready<T>(mut wait: Wait<T>) -> Result<T, BindingError> {
    match wait.as_mut().poll(&mut Context::from_waker(Waker::noop())) {
        Poll::Ready(output) => Ok(output),
        Poll::Pending => Err(BindingError::Internal {
            detail: String::from("the future is pending"),
        }),
    }
}

#[test]
fn drive_gives_the_output_of_a_wait_to_the_next_step_and_makes_each_call() -> Result<(), BindingError> {
    let mut machine = Sum::default();
    assert_eq!(drive(&mut machine, ready, |value| Ok(Ok(value)))?, Some(42));
    assert_eq!(machine.calls, 1);
    Ok(())
}

#[test]
fn drive_ends_with_the_failure_of_a_wait() {
    let mut machine = Sum::default();
    let failed = drive(
        &mut machine,
        |_wait| {
            Err(BindingError::Internal {
                detail: String::from("no runtime"),
            })
        },
        |value| Ok(Ok(value)),
    );
    assert!(matches!(failed, Err(BindingError::Internal { .. })));
    assert_eq!(machine.calls, 0);
}

#[test]
fn driving_returns_at_each_wait_and_takes_its_output() -> Result<(), BindingError> {
    let mut driving = Driving::new(Sum::default());
    let Next::Wait(wait) = driving.advance() else {
        return Err(BindingError::Internal {
            detail: String::from("the machine did not wait"),
        });
    };
    driving.give(ready(wait)?);
    let Next::Done(done) = driving.advance() else {
        return Err(BindingError::Internal {
            detail: String::from("the machine did not end"),
        });
    };
    assert_eq!(done, Some(42));
    Ok(())
}

/// GN-6ae: a function that the machine called returned an awaitable, which the driver settles before the next step.
#[cfg(feature = "construct")]
mod awaits {
    use super::ready;
    use binding_core::machine::{drive, Driving, Machine, Next, Step};
    use binding_core::{BindingError, Handle, Passthrough, Raised};

    /// The handles that the release function of a [`Passthrough`] released, as the table of a binding would remove them.
    static RELEASED: std::sync::Mutex<Vec<u64>> = std::sync::Mutex::new(Vec::new());

    /// Removes `handle` from the table of the test binding.
    fn release(handle: Handle) {
        if let Ok(mut released) = RELEASED.lock() {
            released.push(handle.raw());
        }
    }

    /// A machine that calls a function, which returns an awaitable, and ends with the outcome that the driver settled
    /// (GN-6ae).
    #[derive(Default)]
    struct Awaits {
        stage: u8,
        settled: Option<Result<Passthrough, Raised>>,
    }

    impl Machine for Awaits {
        type Io = u32;
        type Done = Option<Result<Passthrough, Raised>>;

        fn resume(&mut self, _io: Option<u32>) -> Step<u32, Self::Done> {
            match self.stage {
                0 => {
                    self.stage = 1;
                    Step::Call
                }
                1 => {
                    self.stage = 2;
                    Step::Await(Passthrough::from_generated(Handle::new(5), release))
                }
                _ => Step::Done(self.settled.take()),
            }
        }

        fn call(&mut self) {}

        fn settle(&mut self, outcome: Result<Passthrough, Raised>) {
            self.settled = Some(outcome);
        }
    }

    #[test]
    fn drive_gives_the_awaited_value_to_settle_before_the_next_step() -> Result<(), BindingError> {
        let mut machine = Awaits::default();
        let done = drive(&mut machine, ready, |value| Ok(Ok(value)))?;
        let Some(Ok(value)) = done else {
            return Err(BindingError::Internal {
                detail: String::from("the machine did not settle a value"),
            });
        };
        assert_eq!(value.into_handle().raw(), 5);
        Ok(())
    }

    #[test]
    fn drive_settles_the_failure_of_an_awaitable() -> Result<(), BindingError> {
        let mut machine = Awaits::default();
        let done = drive(&mut machine, ready, |_value| {
            Ok(Err(Raised::from_generated(Handle::new(9))))
        })?;
        assert!(matches!(done, Some(Err(raised)) if raised.handle().raw() == 9));
        Ok(())
    }

    #[test]
    fn drive_ends_with_the_error_of_an_await() {
        let mut machine = Awaits::default();
        let failed = drive(&mut machine, ready, |_value| {
            Err(BindingError::InvalidCallback {
                subject: String::from("scope"),
                member: String::from("an awaitable"),
            })
        });
        assert!(matches!(failed, Err(BindingError::InvalidCallback { .. })));
    }

    #[test]
    fn driving_returns_at_an_await_and_settles_its_outcome() -> Result<(), BindingError> {
        let mut driving = Driving::new(Awaits::default());
        let Next::Await(value) = driving.advance() else {
            return Err(BindingError::Internal {
                detail: String::from("the machine did not await"),
            });
        };
        driving.settle(Ok(value));
        let Next::Done(Some(Ok(value))) = driving.advance() else {
            return Err(BindingError::Internal {
                detail: String::from("the machine did not end with the settled value"),
            });
        };
        assert_eq!(value.into_handle().raw(), 5);
        Ok(())
    }

    #[test]
    fn a_dropped_passthrough_releases_its_value_and_a_taken_one_does_not() {
        drop(Passthrough::from_generated(Handle::new(11), release));
        let taken = Passthrough::from_generated(Handle::new(12), release).into_handle();
        let released = match RELEASED.lock() {
            Ok(released) => released.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        };
        assert!(released.contains(&11), "released {released:?}");
        assert!(!released.contains(&taken.raw()), "released {released:?}");
    }
}
