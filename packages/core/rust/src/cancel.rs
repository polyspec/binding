//! Cancellation (design T-1 `cancel`, plan B-5).
//!
//! A member with a `cancel` parameter receives the language's cancellation (Node `AbortSignal`, Python
//! `asyncio.Future`, Go `context.Context`, PHP generated class `Cancellation`). Generated code keeps the
//! [`CancelTrigger`] and fires it when the language signal fires; the core receives the [`Cancel`] and can only observe
//! it, so cancellation comes from the caller alone. The state is a `tokio_util::sync::CancellationToken`.

use std::collections::BTreeMap;
use std::fmt;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use tokio_util::sync::CancellationToken;

/// The core's view of a cancellation: it can be asked, awaited and watched by a blocking wait, never fired (T-1
/// `cancel`).
#[derive(Debug, Clone)]
pub struct Cancel {
    token: CancellationToken,
    watchers: Arc<Mutex<Watchers>>,
}

/// The generated code's side of a cancellation: it fires the [`Cancel`] it was made with (T-1 `cancel`).
#[derive(Debug)]
pub struct CancelTrigger {
    token: CancellationToken,
    watchers: Arc<Mutex<Watchers>>,
}

/// The functions that a blocking wait registered to be woken by the cancellation (B-5 (b)).
#[derive(Default)]
struct Watchers {
    fired: bool,
    next: u64,
    waiting: BTreeMap<u64, Box<dyn FnOnce() + Send>>,
}

impl fmt::Debug for Watchers {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Watchers")
            .field("fired", &self.fired)
            .field("waiting", &self.waiting.len())
            .finish()
    }
}

/// The registration of a function with [`Cancel::on_cancel`]; dropping it removes the function if the cancellation
/// has not called it yet, so a wait that ended no longer gets woken.
#[derive(Debug)]
#[must_use = "dropping the guard removes the function at once"]
pub struct CancelGuard {
    watchers: Arc<Mutex<Watchers>>,
    id: Option<u64>,
}

/// The lock of the watchers. A panic of another thread while it held the lock leaves the list consistent, because
/// the functions run after the lock is released and the list only changes by whole insertions and removals.
fn lock(watchers: &Mutex<Watchers>) -> MutexGuard<'_, Watchers> {
    watchers.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Makes a trigger and the cancellation it fires (T-1 `cancel`).
#[must_use]
pub fn cancel_pair() -> (CancelTrigger, Cancel) {
    let token = CancellationToken::new();
    let watchers = Arc::new(Mutex::new(Watchers::default()));
    (
        CancelTrigger {
            token: token.clone(),
            watchers: Arc::clone(&watchers),
        },
        Cancel { token, watchers },
    )
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

    /// Calls `wake` once when the caller cancels, on the thread that fires the trigger, or at once on this thread if
    /// the caller already cancelled (B-5 (b)). A blocking wait registers the function that wakes it (it notifies a
    /// `Condvar`, unparks a thread, writes to a pipe) before it waits, asks [`Cancel::is_cancelled`] each time it
    /// wakes, and drops the guard when it ends. No cancellation is lost between the check and the wait: a function
    /// registered after the trigger fired runs at once. `wake` must not block, because the trigger's thread runs it.
    pub fn on_cancel(&self, wake: impl FnOnce() + Send + 'static) -> CancelGuard {
        let mut watchers = lock(&self.watchers);
        if watchers.fired {
            drop(watchers);
            wake();
            return CancelGuard {
                watchers: Arc::clone(&self.watchers),
                id: None,
            };
        }
        let id = watchers.next;
        watchers.next += 1;
        watchers.waiting.insert(id, Box::new(wake));
        CancelGuard {
            watchers: Arc::clone(&self.watchers),
            id: Some(id),
        }
    }
}

impl Drop for CancelGuard {
    fn drop(&mut self) {
        if let Some(id) = self.id {
            let removed = lock(&self.watchers).waiting.remove(&id);
            drop(removed);
        }
    }
}

impl CancelTrigger {
    /// Fires the cancellation. A second call has no further effect, because the language signal can fire once.
    pub fn cancel(&self) {
        self.token.cancel();
        let waiting = {
            let mut watchers = lock(&self.watchers);
            watchers.fired = true;
            std::mem::take(&mut watchers.waiting)
        };
        for wake in waiting.into_values() {
            wake();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::cancel_pair;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Condvar, Mutex, PoisonError};
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

    #[test]
    fn a_condvar_wait_wakes_when_the_trigger_fires() {
        let (trigger, cancel) = cancel_pair();
        let pair = Arc::new((Mutex::new(()), Condvar::new()));
        let waker = Arc::clone(&pair);
        let waiter = std::thread::spawn(move || {
            let (mutex, condvar) = &*pair;
            let mut held = mutex.lock().unwrap_or_else(PoisonError::into_inner);
            let _guard = cancel.on_cancel(move || {
                let (mutex, condvar) = &*waker;
                let _held = mutex.lock().unwrap_or_else(PoisonError::into_inner);
                condvar.notify_all();
            });
            // No timeout: only the cancellation can end this wait.
            while !cancel.is_cancelled() {
                held = condvar.wait(held).unwrap_or_else(PoisonError::into_inner);
            }
        });
        std::thread::sleep(Duration::from_millis(50));
        trigger.cancel();
        let joined = waiter.join();
        assert!(joined.is_ok(), "the waiting thread ended with {joined:?}");
    }

    #[test]
    fn a_function_registered_after_the_cancellation_runs_at_once() {
        let (trigger, cancel) = cancel_pair();
        trigger.cancel();
        let calls = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&calls);
        let _guard = cancel.on_cancel(move || {
            counted.fetch_add(1, Ordering::SeqCst);
        });
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        trigger.cancel();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_dropped_guard_is_not_called() {
        let (trigger, cancel) = cancel_pair();
        let calls = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&calls);
        let kept = Arc::clone(&calls);
        let guard = cancel.on_cancel(move || {
            counted.fetch_add(1, Ordering::SeqCst);
        });
        let _kept = cancel.on_cancel(move || {
            kept.fetch_add(10, Ordering::SeqCst);
        });
        drop(guard);
        trigger.cancel();
        assert_eq!(calls.load(Ordering::SeqCst), 10);
    }
}
