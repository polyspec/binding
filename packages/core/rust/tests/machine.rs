//! The state machine of a member with wait async_driver that reaches language code (GN-6ab): the driver gives the
//! output of each wait to the next step, makes each call of language code where it drives, and ends with the result.

use binding_core::machine::{drive, Driving, Machine, Next, Step, Wait};
use binding_core::BindingError;
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
    assert_eq!(drive(&mut machine, ready)?, Some(42));
    assert_eq!(machine.calls, 1);
    Ok(())
}

#[test]
fn drive_ends_with_the_failure_of_a_wait() {
    let mut machine = Sum::default();
    let failed = drive(&mut machine, |_wait| {
        Err(BindingError::Internal {
            detail: String::from("no runtime"),
        })
    });
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
