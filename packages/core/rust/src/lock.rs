//! B-5c: the lock that holds the core value of a class unit. Every lock is tried and never awaited, so a call that
//! does not get it fails with kind `busy` rather than waits for a call of its own thread.

use crate::BindingError;
use std::ops::{Deref, DerefMut};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{
    Mutex, OwnedMappedMutexGuard, OwnedMutexGuard, OwnedRwLockMappedWriteGuard, OwnedRwLockReadGuard,
    OwnedRwLockWriteGuard, RwLock,
};

/// The guard of a place of an `Exclusive` value.
type ExclusiveGuard<T> = OwnedMappedMutexGuard<Option<T>, T>;
/// The guard of a read place of a `Shared` value.
type SharedRead<T> = OwnedRwLockReadGuard<Option<T>, T>;
/// The guard of a write place of a `Shared` value.
type SharedWrite<T> = OwnedRwLockMappedWriteGuard<Option<T>, T>;

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

/// GN-6o: an object whose value a receiver `self` took.
fn consumed(class: &str) -> BindingError {
    BindingError::Consumed {
        class: class.to_owned(),
    }
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
    lock: Arc<Mutex<Option<T>>>,
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
            lock: Arc::new(Mutex::new(Some(value))),
            poisoned: Arc::new(AtomicBool::new(false)),
        }
    }

    /// The guard of a read place. `beside` holds the read guards that the call already has: the guard of the same
    /// instance is shared.
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when the lock is held, kind `consumed` when the value was
    /// taken.
    pub fn read(
        &self,
        class: &str,
        beside: &[Option<&Reading<ExclusiveGuard<T>>>],
    ) -> Result<Reading<ExclusiveGuard<T>>, BindingError> {
        sound(&self.poisoned, class)?;
        if let Some(held) = shared(&self.poisoned, beside) {
            return Ok(held);
        }
        Ok(Reading {
            guard: Arc::new(self.place(class)?),
            cell: Arc::clone(&self.poisoned),
        })
    }

    /// The guard of a write place.
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when the lock is held, kind `consumed` when the value was
    /// taken.
    pub fn write(&self, class: &str) -> Result<Writing<ExclusiveGuard<T>>, BindingError> {
        sound(&self.poisoned, class)?;
        Ok(Writing {
            guard: self.place(class)?,
            poisoned: Arc::clone(&self.poisoned),
        })
    }

    /// The value of the place of a receiver `self`, which leaves the object consumed (GN-6o).
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when the lock is held, kind `consumed` when the value was
    /// taken.
    pub fn take(&self, class: &str) -> Result<T, BindingError> {
        sound(&self.poisoned, class)?;
        let mut guard = Arc::clone(&self.lock).try_lock_owned().map_err(|_held| busy(class))?;
        guard.take().ok_or_else(|| consumed(class))
    }

    /// Whether a receiver `self` took the value; a lock that is held is not taken (GN-6p).
    pub fn taken(&self) -> bool {
        match self.lock.try_lock() {
            Ok(guard) => guard.is_none(),
            Err(_held) => false,
        }
    }

    fn place(&self, class: &str) -> Result<ExclusiveGuard<T>, BindingError> {
        let guard = Arc::clone(&self.lock).try_lock_owned().map_err(|_held| busy(class))?;
        OwnedMutexGuard::try_map(guard, Option::as_mut).map_err(|_empty| consumed(class))
    }
}

/// The value of a class unit that calls may read at the same time (B-5c): an `Arc<tokio::sync::RwLock<T>>` with the
/// mark `poisoned`. `Clone` gives another handle of the same value.
pub struct Shared<T> {
    lock: Arc<RwLock<Option<T>>>,
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
            lock: Arc::new(RwLock::new(Some(value))),
            poisoned: Arc::new(AtomicBool::new(false)),
        }
    }

    /// The guard of a read place. `beside` holds the read guards that the call already has: the guard of the same
    /// instance is shared.
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when a write guard is held, kind `consumed` when the value
    /// was taken.
    pub fn read(
        &self,
        class: &str,
        beside: &[Option<&Reading<SharedRead<T>>>],
    ) -> Result<Reading<SharedRead<T>>, BindingError> {
        sound(&self.poisoned, class)?;
        if let Some(held) = shared(&self.poisoned, beside) {
            return Ok(held);
        }
        let guard = Arc::clone(&self.lock).try_read_owned().map_err(|_held| busy(class))?;
        let guard = OwnedRwLockReadGuard::try_map(guard, Option::as_ref).map_err(|_empty| consumed(class))?;
        Ok(Reading {
            guard: Arc::new(guard),
            cell: Arc::clone(&self.poisoned),
        })
    }

    /// The guard of a write place.
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when a guard is held, kind `consumed` when the value was
    /// taken.
    pub fn write(&self, class: &str) -> Result<Writing<SharedWrite<T>>, BindingError> {
        sound(&self.poisoned, class)?;
        let guard = Arc::clone(&self.lock).try_write_owned().map_err(|_held| busy(class))?;
        let guard = OwnedRwLockWriteGuard::try_map(guard, Option::as_mut).map_err(|_empty| consumed(class))?;
        Ok(Writing {
            guard,
            poisoned: Arc::clone(&self.poisoned),
        })
    }

    /// The value of the place of a receiver `self`, which leaves the object consumed (GN-6o).
    ///
    /// # Errors
    ///
    /// Kind `internal` for a poisoned object, kind `busy` when a guard is held, kind `consumed` when the value was
    /// taken.
    pub fn take(&self, class: &str) -> Result<T, BindingError> {
        sound(&self.poisoned, class)?;
        let mut guard = Arc::clone(&self.lock).try_write_owned().map_err(|_held| busy(class))?;
        guard.take().ok_or_else(|| consumed(class))
    }

    /// Whether a receiver `self` took the value; a lock that is held is not taken (GN-6p).
    pub fn taken(&self) -> bool {
        match self.lock.try_read() {
            Ok(guard) => guard.is_none(),
            Err(_held) => false,
        }
    }
}
