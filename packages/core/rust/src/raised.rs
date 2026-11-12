//! A language exception that a callback raised (design U-3, E-7, plan B-4).

use crate::value::Handle;
use std::fmt;

/// An exception that language code raised in a callback, held as a handle that the core does not open (U-3).
///
/// The exception is not an error of the library, so it is neither wrapped nor converted: the core stops what it was
/// doing and returns the `Raised` to the generated code, which throws the same language object again. Only generated
/// code makes a `Raised` and reads its handle (feature `construct`, like the wait tokens), so a core can carry it but
/// cannot look inside. A `Raised` has no kind, status or category: the caller catches the original object.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Raised {
    handle: Handle,
}

#[cfg(feature = "construct")]
impl Raised {
    /// Holds the exception that the binding stored under `handle`.
    #[must_use]
    pub const fn from_generated(handle: Handle) -> Self {
        Self { handle }
    }

    /// The handle under which the binding stored the exception, to throw it again.
    #[must_use]
    pub const fn handle(&self) -> Handle {
        self.handle
    }
}

impl fmt::Display for Raised {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("a callback raised an exception")
    }
}

impl std::error::Error for Raised {}

#[cfg(test)]
mod tests {
    use super::Raised;
    use crate::value::Handle;

    #[test]
    fn the_handle_travels_unchanged() {
        let raised = Raised { handle: Handle::new(7) };
        let moved = std::thread::spawn(move || raised)
            .join()
            .map_err(|panic| format!("the thread panicked: {panic:?}"));
        assert_eq!(moved, Ok(Raised { handle: Handle::new(7) }));
    }
}
