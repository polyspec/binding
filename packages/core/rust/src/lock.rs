//! B-5c: the lock that holds the core value of a class unit. Every lock is tried and never awaited, so a call that
//! does not get it fails with kind `busy` rather than waits for a call of its own thread.

use crate::BindingError;
use std::ops::{Deref, DerefMut};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{Mutex, OwnedMutexGuard, OwnedRwLockReadGuard, OwnedRwLockWriteGuard, RwLock};

/// The guard of a read place (B-5c). The read places of one call that are the same instance share one guard, and the
/// guard is released when the last of them is dropped.
pub struct Reading<G> {
    guard: Arc<G>,
    cell: Arc<AtomicBool>,
}

impl<G> Clone for Reading<G> {
    fn clone(&self) -> Self {
        Self {
            guard: Arc::clone(&self.guard),
            cell: Arc::clone(&self.cell),
        }
    }
}

impl<G: Deref> Deref for Reading<G> {
    type Target = G::Target;

    fn deref(&self) -> &Self::Target {
        &self.guard
    }
}

/// The guard of a write place (B-5c). A panic that unwinds through it marks the object poisoned before the lock is
/// released, because the lock of tokio does not poison.
pub struct Writing<G> {
    guard: G,
    poisoned: Arc<AtomicBool>,
}

impl<G: Deref> Deref for Writing<G> {
    type Target = G::Target;

    fn deref(&self) -> &Self::Target {
        &self.guard
    }
}

impl<G: DerefMut> DerefMut for Writing<G> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.guard
    }
}

impl<G> Drop for Writing<G> {
    fn drop(&mut self) {
        // The body runs before the field `guard` is dropped, so the mark is set while the lock is still held.
        if std::thread::panicking() {
            self.poisoned.store(true, Ordering::SeqCst);
        }
    }
}

fn sound(poisoned: &AtomicBool, class: &str) -> Result<(), BindingError> {
    if poisoned.load(Ordering::SeqCst) {
        return Err(BindingError::Internal {
            detail: format!("{class} is poisoned: a call panicked while it changed the object"),
        });
    }
    Ok(())
}

fn busy(class: &str) -> BindingError {
    BindingError::Busy {
        class: class.to_owned(),
    }
}

/// The guard of the same instance among the read guards that the call already holds.
fn shared<G>(cell: &Arc<AtomicBool>, beside: &[Option<&Reading<G>>]) -> Option<Reading<G>> {
    beside
        .iter()
        .flatten()
        .find(|held| Arc::ptr_eq(&held.cell, cell))
        .map(|held| Reading::clone(held))
}

/// The value of a class unit that has a write place and no member that reads it while another call is in progress
/// (B-5c): an `Arc<tokio::sync::Mutex<T>>` with the mark `poisoned`. `Clone` gives another handle of the same value.
pub struct Exclusive<T> {
    lock: Arc<Mutex<T>>,
    poisoned: Arc<AtomicBool>,
}

impl<T> Clone for Exclusive<T> {
    fn clone(&self) -> Self {
        Self {
            lock: Arc::clone(&self.lock),
            poisoned: Arc::clone(&self.poisoned),
        }
    }
}

impl<T> Exclusive<T> {
    /// Holds a value.
    pub fn new(value: T) -> Self {
        Self {
            lock: Arc::new(Mutex::new(value)),
            poisoned: Arc::new(AtomicBool::new(false)),
        }
    }

    /// The guard of a read place. `beside` holds the read guards that the call already has: the guard of the same
    /// instance is shared.
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when the lock is held.
    pub fn read(
        &self,
        class: &str,
        beside: &[Option<&Reading<OwnedMutexGuard<T>>>],
    ) -> Result<Reading<OwnedMutexGuard<T>>, BindingError> {
        sound(&self.poisoned, class)?;
        if let Some(held) = shared(&self.poisoned, beside) {
            return Ok(held);
        }
        match Arc::clone(&self.lock).try_lock_owned() {
            Ok(guard) => Ok(Reading {
                guard: Arc::new(guard),
                cell: Arc::clone(&self.poisoned),
            }),
            Err(_held) => Err(busy(class)),
        }
    }

    /// The guard of a write place.
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when the lock is held.
    pub fn write(&self, class: &str) -> Result<Writing<OwnedMutexGuard<T>>, BindingError> {
        sound(&self.poisoned, class)?;
        match Arc::clone(&self.lock).try_lock_owned() {
            Ok(guard) => Ok(Writing {
                guard,
                poisoned: Arc::clone(&self.poisoned),
            }),
            Err(_held) => Err(busy(class)),
        }
    }
}

/// The value of a class unit that calls may read at the same time (B-5c): an `Arc<tokio::sync::RwLock<T>>` with the
/// mark `poisoned`. `Clone` gives another handle of the same value.
pub struct Shared<T> {
    lock: Arc<RwLock<T>>,
    poisoned: Arc<AtomicBool>,
}

impl<T> Clone for Shared<T> {
    fn clone(&self) -> Self {
        Self {
            lock: Arc::clone(&self.lock),
            poisoned: Arc::clone(&self.poisoned),
        }
    }
}

impl<T> Shared<T> {
    /// Holds a value.
    pub fn new(value: T) -> Self {
        Self {
            lock: Arc::new(RwLock::new(value)),
            poisoned: Arc::new(AtomicBool::new(false)),
        }
    }

    /// The guard of a read place. `beside` holds the read guards that the call already has: the guard of the same
    /// instance is shared.
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when a write guard is held.
    pub fn read(
        &self,
        class: &str,
        beside: &[Option<&Reading<OwnedRwLockReadGuard<T>>>],
    ) -> Result<Reading<OwnedRwLockReadGuard<T>>, BindingError> {
        sound(&self.poisoned, class)?;
        if let Some(held) = shared(&self.poisoned, beside) {
            return Ok(held);
        }
        match Arc::clone(&self.lock).try_read_owned() {
            Ok(guard) => Ok(Reading {
                guard: Arc::new(guard),
                cell: Arc::clone(&self.poisoned),
            }),
            Err(_held) => Err(busy(class)),
        }
    }

    /// The guard of a write place.
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when a guard is held.
    pub fn write(&self, class: &str) -> Result<Writing<OwnedRwLockWriteGuard<T>>, BindingError> {
        sound(&self.poisoned, class)?;
        match Arc::clone(&self.lock).try_write_owned() {
            Ok(guard) => Ok(Writing {
                guard,
                poisoned: Arc::clone(&self.poisoned),
            }),
            Err(_held) => Err(busy(class)),
        }
    }
}
