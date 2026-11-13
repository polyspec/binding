//! The state machine of a member with wait async_driver that reaches language code (GN-6ab).
//!
//! A future that a runtime polls on its own threads would call language code there, against the owner of a Node or
//! PHP reference, and a callback that calls another member with async_driver would run `block_on` inside the runtime.
//! Such a core gives a [`Machine`] without I/O instead: each step is an I/O future that touches no language code, a
//! call of language code that the driver makes on the thread that owns it, or the end of the member.

use crate::{BindingError, Passthrough, Raised};
use std::future::Future;
use std::pin::Pin;

/// A future of the core that touches no language code, which the driver polls on a tokio runtime.
pub type Wait<I> = Pin<Box<dyn Future<Output = I> + Send + 'static>>;

/// One step of a [`Machine`].
pub enum Step<I, D> {
    /// The machine waits for the output of this future, which the driver gives to the next [`Machine::resume`].
    Io(Wait<I>),
    /// The driver calls [`Machine::call`] on the thread that owns the language code.
    Call,
    /// A function of language code that the machine called returned this value, which may be an awaitable (GN-6ae):
    /// the driver awaits it where its language can and gives the outcome to [`Machine::settle`] before the next
    /// [`Machine::resume`].
    Await(Passthrough),
    /// The member ends with this result.
    Done(D),
}

/// The state machine of a member, which owns its arguments.
pub trait Machine {
    /// The output of an I/O future of the machine.
    type Io: Send + 'static;
    /// The result of the member.
    type Done;

    /// Advances the machine with the output of its last wait: `None` at the start and after a call.
    fn resume(&mut self, io: Option<Self::Io>) -> Step<Self::Io, Self::Done>;

    /// Calls the language code that the machine waits for (its callbacks, its `Native` values), on the thread that
    /// owns it. A failure of the language code is kept by the machine and ends it at a later step.
    fn call(&mut self);

    /// Takes the outcome of the value of the last [`Step::Await`]: the value that the awaitable gave, or the exception
    /// that it raised (GN-6ae). A language without an awaitable (PHP, Go) settles the value itself at once.
    fn settle(&mut self, outcome: Result<Passthrough, Raised>);
}

/// Drives `machine` on the calling thread to its end: `wait` waits for each I/O future, each call is made on the
/// calling thread, and `awaited` gives the outcome of each awaited value (PHP, Go, the blocking form of Python).
///
/// # Errors
///
/// The error of `wait` or of `awaited`, which ends the machine without another step.
pub fn drive<M: Machine>(
    machine: &mut M,
    mut wait: impl FnMut(Wait<M::Io>) -> Result<M::Io, BindingError>,
    mut awaited: impl FnMut(Passthrough) -> Result<Result<Passthrough, Raised>, BindingError>,
) -> Result<M::Done, BindingError> {
    let mut io = None;
    loop {
        match machine.resume(io.take()) {
            Step::Io(future) => io = Some(wait(future)?),
            Step::Call => machine.call(),
            Step::Await(value) => machine.settle(awaited(value)?),
            Step::Done(done) => return Ok(done),
        }
    }
}

/// Where [`Driving::advance`] stops.
pub enum Next<I, D> {
    /// The machine waits for this future; its output goes to [`Driving::give`].
    Wait(Wait<I>),
    /// The machine awaits this value of language code; its outcome goes to [`Driving::settle`] (GN-6ae).
    Await(Passthrough),
    /// The member ends with this result.
    Done(D),
}

/// A machine that the runtime of a language advances (Node, WASM): each advance makes the calls of the machine on the
/// calling thread and stops at a wait, whose future the runtime polls elsewhere, at an awaited value, which the runtime
/// awaits, or at the end.
pub struct Driving<M: Machine> {
    machine: M,
    io: Option<M::Io>,
}

impl<M: Machine> Driving<M> {
    /// Drives `machine` from its start.
    pub fn new(machine: M) -> Self {
        Self { machine, io: None }
    }

    /// Gives the output of the last wait to the next step.
    pub fn give(&mut self, io: M::Io) {
        self.io = Some(io);
    }

    /// Gives the outcome of the last awaited value to the machine before the next step.
    pub fn settle(&mut self, outcome: Result<Passthrough, Raised>) {
        self.machine.settle(outcome);
    }

    /// Makes the calls of the machine on the calling thread until it waits or ends.
    pub fn advance(&mut self) -> Next<M::Io, M::Done> {
        loop {
            match self.machine.resume(self.io.take()) {
                Step::Io(future) => return Next::Wait(future),
                Step::Call => self.machine.call(),
                Step::Await(value) => return Next::Await(value),
                Step::Done(done) => return Next::Done(done),
            }
        }
    }
}
