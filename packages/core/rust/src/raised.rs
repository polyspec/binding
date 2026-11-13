//! A language exception that a callback raised (design U-3, E-7, plan B-4).

use crate::native::Native;
use std::fmt;

/// An exception that language code raised in a callback, held as a `Native` that the core does not open (U-3).
///
/// The exception is not an error of the library, so it is neither wrapped nor converted: the core stops what it was
/// doing and returns the `Raised` to the generated code, which throws the same language object again. Only generated
/// code makes a `Raised` and reads its `Native` (feature `construct`, like the wait tokens), so a core can carry it but
/// cannot look inside. A core that drops a `Raised` instead of returning it releases the exception, because the last
/// drop of the `Native` releases what the binding keeps for it (GN-6u). A `Raised` has no kind, status or category:
/// the caller catches the original object.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Raised {
    native: Native,
}

#[cfg(feature = "construct")]
impl Raised {
    /// Holds the exception that the binding keeps under `native`.
    #[must_use]
    pub const fn from_generated(native: Native) -> Self {
        Self { native }
    }

    /// What the binding keeps for the exception, to throw it again.
    #[must_use]
    pub const fn native(&self) -> &Native {
        &self.native
    }
}

impl fmt::Display for Raised {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("a callback raised an exception")
    }
}

impl std::error::Error for Raised {}

#[cfg(all(test, feature = "construct"))]
mod tests {
    use super::Raised;
    use crate::native::{Native, NativeObject};

    #[derive(Debug, PartialEq)]
    struct Key(u64);

    impl NativeObject for Key {}

    #[test]
    fn the_native_travels_unchanged() {
        let raised = Raised::from_generated(Native::new(Key(7)));
        let copy = raised.clone();
        let moved = std::thread::spawn(move || raised)
            .join()
            .map_err(|panic| format!("the thread panicked: {panic:?}"));
        assert_eq!(moved, Ok(copy.clone()));
        assert_eq!(copy.native().downcast::<Key>(), Some(&Key(7)));
    }
}
