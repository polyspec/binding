//! The error type of a core function that calls back into language code (design E-1c).

use crate::raised::Raised;
use std::fmt;

/// The failure of a core function that calls a callback (E-1c): a kind of the core's error enum `E`, the language
/// exception that the callback raised, which goes back to the caller unchanged (U-3), or the error of a Rust callback.
///
/// The split keeps [`crate::Kinds`] true of every variant of `E`: a raised exception has no kind, so it is not a
/// variant of `E`. Generated code matches its arms without a wildcard (I-2 (3)).
#[derive(Debug)]
pub enum Failure<E> {
    /// A failure of the library, with its kind.
    Kind(E),
    /// An exception of the callback's language code.
    Raised(Raised),
    /// The error of a callback that Rust code gave the core, returned to that Rust caller unchanged. Generated
    /// bindings never give a Rust callback, so they never see this arm; it is built without the `construct` feature.
    Callback(Box<dyn std::error::Error + Send + Sync>),
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
            Self::Callback(error) => error.fmt(f),
        }
    }
}

impl<E: fmt::Debug + fmt::Display> std::error::Error for Failure<E> {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Kind(_) | Self::Raised(_) => None,
            Self::Callback(error) => Some(error.as_ref()),
        }
    }
}

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
        assert!(matches!(calls_back(false), Ok(1)));
    }

    #[derive(Debug)]
    struct Refused;

    impl std::fmt::Display for Refused {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.write_str("refused by the Rust callback")
        }
    }

    impl std::error::Error for Refused {}

    #[test]
    fn a_rust_callback_error_comes_back_unchanged() {
        let failure: Failure<BindingError> = Failure::Callback(Box::new(Refused));
        assert_eq!(failure.to_string(), "refused by the Rust callback");
        let source = std::error::Error::source(&failure);
        assert!(
            source.is_some_and(|error| error.is::<Refused>()),
            "the source is {source:?}"
        );
    }
}
