//! The owning handle of a language object that a core may keep (design B-1, U-7 (d)).

use std::any::Any;
use std::fmt;
use std::sync::Arc;

/// What a binding keeps for a language object: a Python reference, or the key of a table of the thread that owns the
/// object (Node, PHP, WASM). Its drop releases the object, or queues the release for the owner thread.
pub trait NativeObject: Any + Send + Sync + fmt::Debug {}

/// A language object that enters a core and may stay in it: the core copies, keeps and drops it as any Rust value, and
/// the object is released when the last `Native` that holds it is dropped. Two are equal when they are the same object,
/// which is the same language object (U-7 (d)). Only generated code makes one and opens it (feature `construct`).
#[derive(Clone)]
pub struct Native(Arc<dyn NativeObject>);

#[cfg(feature = "construct")]
impl Native {
    /// Holds what the binding keeps for an object.
    #[must_use]
    pub fn new(object: impl NativeObject) -> Self {
        Self(Arc::new(object))
    }

    /// What the binding keeps for the object, when it is of the type `T`.
    #[must_use]
    pub fn downcast<T: NativeObject>(&self) -> Option<&T> {
        let object: &dyn Any = &*self.0;
        object.downcast_ref::<T>()
    }
}

impl PartialEq for Native {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for Native {}

impl fmt::Debug for Native {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("Native").field(&self.0).finish()
    }
}
