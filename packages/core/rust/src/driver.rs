//! The driver of a member with wait async_driver (design I-2 (4), GN-6n).
//!
//! A core that speaks a network protocol is an `async fn` of tokio, which needs a runtime where it is polled. The
//! generated code of PHP and Python waits for the future on the calling thread with [`block_on`], on the runtime of the
//! process, and every target ends the future at a panic of a poll with [`Caught`], so that the panic is a failure of
//! kind `internal` (B-7) and not an unwinding across the runtime.

use crate::BindingError;
use std::any::Any;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};

/// The runtime of the process, which the first call makes, or why it could not be made.
static RUNTIME: OnceLock<Result<tokio::runtime::Runtime, String>> = OnceLock::new();

/// Runs `future` on the runtime of the process, a multi-thread tokio runtime with every driver of the build, and waits
/// for it on the calling thread.
///
/// # Errors
///
/// `BindingError::Internal` when the runtime cannot be made.
pub fn block_on<F: Future>(future: F) -> Result<F::Output, BindingError> {
    let made = RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .map_err(|error| error.to_string())
    });
    match made {
        Ok(runtime) => Ok(runtime.block_on(future)),
        Err(detail) => Err(BindingError::Internal {
            detail: format!("the tokio runtime of the process: {detail}"),
        }),
    }
}

/// A future that ends with the message of a panic of a poll of its future, instead of unwinding (B-7).
pub struct Caught<F> {
    future: Pin<Box<F>>,
}

impl<F: Future> Caught<F> {
    /// Wraps `future`.
    pub fn new(future: F) -> Self {
        Self {
            future: Box::pin(future),
        }
    }
}

impl<F: Future> Future for Caught<F> {
    type Output = Result<F::Output, String>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let future = self.get_mut().future.as_mut();
        match catch_unwind(AssertUnwindSafe(|| future.poll(cx))) {
            Ok(Poll::Ready(output)) => Poll::Ready(Ok(output)),
            Ok(Poll::Pending) => Poll::Pending,
            Err(payload) => Poll::Ready(Err(message(payload.as_ref()))),
        }
    }
}

/// The message of a panic.
fn message(payload: &(dyn Any + Send)) -> String {
    match (payload.downcast_ref::<&str>(), payload.downcast_ref::<String>()) {
        (Some(text), _) => (*text).to_owned(),
        (None, Some(text)) => text.clone(),
        (None, None) => String::from("a panic without a message"),
    }
}
