//! Wait tokens (design I-2 (4), B-5).
//!
//! A core function that blocks takes a token as its first argument, and the token says how it blocks: `Io` for short
//! blocking I/O (`wait: blocking_io`), which a Node binding runs on the libuv pool, and `ProcessWait` for waiting on
//! another process (`wait: process_wait`), which a Node binding runs on a dedicated thread. The two are distinct types
//! with no conversion between them, so a contract that declares a lock wait as `blocking_io` does not compile against
//! a core that asks for `ProcessWait` (B-5 (b): the libuv pool would block on another process).
//!
//! Only generated code makes a token: the constructors exist only with the feature `construct`, which generated binding
//! crates enable and a core crate enables only for its tests (a dev-dependency). Rust cannot restrict a public function
//! to one caller, so the guarantee is that the library of a core crate, built on its own, does not compile when it
//! makes a token; `tests/construct.rs` builds both cases.

/// Proof that the call runs where short blocking I/O is allowed (`wait: blocking_io`, design I-2 (4), B-5 (a)).
///
/// A core function that does short blocking I/O, such as reading or writing a file, takes `Io` as its first argument.
///
/// ```compile_fail
/// fn read(_io: bindgen_core::Io) {}
/// fn wait_lock(token: bindgen_core::ProcessWait) {
///     read(token); // a ProcessWait is not an Io
/// }
/// ```
#[derive(Debug)]
pub struct Io {
    _private: (),
}

/// Proof that the call runs where waiting on another process is allowed (`wait: process_wait`, design I-2 (4),
/// B-5 (b)).
///
/// A core function that blocks until another process acts, such as `flock(LOCK_EX)`, takes `ProcessWait` as its first
/// argument.
///
/// ```compile_fail
/// fn wait_lock(_token: bindgen_core::ProcessWait) {}
/// fn read(io: bindgen_core::Io) {
///     wait_lock(io); // an Io is not a ProcessWait
/// }
/// ```
#[derive(Debug)]
pub struct ProcessWait {
    _private: (),
}

#[cfg(feature = "construct")]
impl Io {
    /// Makes the token for one call. Generated code calls it on the thread that runs the blocking work (I-2 (4)).
    #[must_use]
    pub const fn for_generated_call() -> Self {
        Self { _private: () }
    }
}

#[cfg(feature = "construct")]
impl ProcessWait {
    /// Makes the token for one call. Generated code calls it on the dedicated thread of the wait (I-2 (4), B-5 (b)).
    #[must_use]
    pub const fn for_generated_call() -> Self {
        Self { _private: () }
    }
}

#[cfg(test)]
mod tests {
    use super::{Io, ProcessWait};

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn tokens_move_to_the_thread_that_waits() {
        // I-2 (4): Node runs blocking_io in an AsyncTask and process_wait on a dedicated thread, so the token moves
        // to that thread.
        assert_send_sync::<Io>();
        assert_send_sync::<ProcessWait>();
    }

    #[test]
    fn tokens_carry_no_data() {
        assert_eq!(std::mem::size_of::<Io>(), 0);
        assert_eq!(std::mem::size_of::<ProcessWait>(), 0);
    }
}
