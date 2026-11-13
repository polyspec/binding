//! A language value that the core moves without reading (design T-2 `passthrough`, generator GN-6ae).

use crate::value::Handle;
use std::fmt;

/// A language value that the binding holds in its table (B-3) under a handle, which the core moves and never reads:
/// the value that a function of language code returned, which a member with the result `passthrough` returns to
/// language code unchanged.
///
/// Only generated code makes a `Passthrough` and takes its handle (feature `construct`). A `Passthrough` that the core
/// drops gives its handle to the release function of the binding, which removes the value from its table.
pub struct Passthrough {
    handle: Option<Handle>,
    release: fn(Handle),
}

#[cfg(feature = "construct")]
impl Passthrough {
    /// Holds the value that the binding stored under `handle`; `release` removes it from the table of the binding.
    #[must_use]
    pub fn from_generated(handle: Handle, release: fn(Handle)) -> Self {
        Self {
            handle: Some(handle),
            release,
        }
    }

    /// The handle under which the binding stored the value, which the binding then removes itself; the value is not
    /// released when this `Passthrough` ends.
    #[must_use]
    pub fn into_handle(mut self) -> Handle {
        match self.handle.take() {
            Some(handle) => handle,
            // A Passthrough holds its handle until into_handle or drop takes it, and both take self.
            None => unreachable!("a Passthrough holds its handle until it ends"),
        }
    }
}

impl Drop for Passthrough {
    fn drop(&mut self) {
        if let Some(handle) = self.handle.take() {
            (self.release)(handle);
        }
    }
}

impl fmt::Debug for Passthrough {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Passthrough")
    }
}
