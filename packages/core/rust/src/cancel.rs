//! Cancellation (design T-1 `cancel`, plan B-5).
//!
//! A member with a `cancel` parameter receives the language's cancellation (Node `AbortSignal`, Python
//! `asyncio.Future`, Go `context.Context`, PHP generated class `Cancellation`). Generated code keeps the
//! [`CancelTrigger`] and fires it when the language signal fires; the core receives the [`Cancel`] and can only observe
//! it, so cancellation comes from the caller alone. The state is a `tokio_util::sync::CancellationToken`.

use tokio_util::sync::CancellationToken;

/// The core's view of a cancellation: it can be asked and awaited, never fired (T-1 `cancel`).
#[derive(Debug, Clone)]
pub struct Cancel {
    token: CancellationToken,
}

/// The generated code's side of a cancellation: it fires the [`Cancel`] it was made with (T-1 `cancel`).
#[derive(Debug)]
pub struct CancelTrigger {
    token: CancellationToken,
}

/// Makes a trigger and the cancellation it fires (T-1 `cancel`).
#[must_use]
pub fn cancel_pair() -> (CancelTrigger, Cancel) {
    let token = CancellationToken::new();
    (CancelTrigger { token: token.clone() }, Cancel { token })
}

impl Cancel {
    /// Whether the caller cancelled. A blocking wait that cannot be interrupted (B-5 (b), `flock`) asks after it
    /// returns and gives up what it acquired.
    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.token.is_cancelled()
    }

    /// Completes when the caller cancels; it never completes when the trigger is dropped without firing, because a
    /// dropped language signal is no cancellation.
    pub async fn cancelled(&self) {
        self.token.cancelled().await;
    }
}

impl CancelTrigger {
    /// Fires the cancellation. A second call has no further effect, because the language signal can fire once.
    pub fn cancel(&self) {
        self.token.cancel();
    }
}

#[cfg(test)]
mod tests {
    use super::cancel_pair;
    use std::time::Duration;

    #[test]
    fn a_new_cancellation_is_not_cancelled() {
        let (_trigger, cancel) = cancel_pair();
        assert!(!cancel.is_cancelled());
    }

    #[test]
    fn the_trigger_cancels_every_copy() {
        let (trigger, cancel) = cancel_pair();
        let copy = cancel.clone();
        trigger.cancel();
        assert!(cancel.is_cancelled());
        assert!(copy.is_cancelled());
        trigger.cancel();
        assert!(cancel.is_cancelled());
    }

    #[tokio::test]
    async fn cancelled_completes_after_the_trigger_fires() {
        let (trigger, cancel) = cancel_pair();
        let waiter = tokio::spawn(async move { cancel.cancelled().await });
        trigger.cancel();
        let joined = waiter.await;
        assert!(joined.is_ok(), "the waiting task ended with {joined:?}");
    }

    #[tokio::test(start_paused = true)]
    async fn a_dropped_trigger_is_no_cancellation() {
        let (trigger, cancel) = cancel_pair();
        drop(trigger);
        assert!(!cancel.is_cancelled());
        let outcome = tokio::time::timeout(Duration::from_secs(3600), cancel.cancelled()).await;
        assert!(outcome.is_err(), "cancelled() completed without a cancellation");
    }
}
