//! The error type of a core function that calls back into language code (design E-1c).

use crate::raised::Raised;
use std::fmt;

/// The failure of a core function that calls a callback (E-1c): a kind of the core's error enum `E`, or the language
/// exception that the callback raised, which goes back to the caller unchanged (U-3).
///
/// The split keeps [`crate::Kinds`] true of every variant of `E`: a raised exception has no kind, so it is not a
/// variant of `E`. Generated code matches both arms without a wildcard (I-2 (3)).
#[derive(Debug, Clone, PartialEq)]
pub enum Failure<E> {
    /// A failure of the library, with its kind.
    Kind(E),
    /// An exception of the callback's language code.
    Raised(Raised),
}

impl<E> From<Raised> for Failure<E> {
    fn from(raised: Raised) -> Self {
        Self::Raised(raised)
    }
}

impl<E: fmt::Display> fmt::Display for Failure<E> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Kind(error) => error.fmt(f),
            Self::Raised(raised) => raised.fmt(f),
        }
    }
}

impl<E: fmt::Debug + fmt::Display> std::error::Error for Failure<E> {}

#[cfg(test)]
mod tests {
    use super::Failure;
    use crate::error::{BindingError, Kinds};

    fn calls_back(fail: bool) -> Result<u8, Failure<BindingError>> {
        if fail {
            return Err(Failure::Kind(BindingError::Internal {
                detail: String::from("x"),
            }));
        }
        Ok(1)
    }

    #[test]
    fn a_kind_keeps_its_kind_and_message() {
        match calls_back(true) {
            Err(Failure::Kind(error)) => assert_eq!(error.kind(), "internal"),
            other => panic!("expected a kind, got {other:?}"),
        }
        assert_eq!(calls_back(false), Ok(1));
    }
}
