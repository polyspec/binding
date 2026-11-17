//! A library for the end-to-end check of binding whose generated tests must fail (GN-14n, B2.509): the argument of a
//! call of after is made by a static that fails with the kind that the call of after expects, so a test that makes
//! the argument inside the outcome of the call passes having checked nothing, and a test that makes it before the
//! call fails on the static.

use binding_core::Kinds;
use std::fmt;

/// The errors of the library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// A text that must not be empty is empty.
    Missing {
        /// What is empty.
        key: String,
    },
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Missing { .. } => "missing",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { key } => write!(f, "no value for {key}"),
        }
    }
}

impl std::error::Error for Error {}

impl Kinds for Error {
    fn kind(&self) -> &'static str {
        Error::kind(self)
    }

    fn status(&self) -> Option<u16> {
        None
    }

    fn errno(&self) -> Option<i32> {
        None
    }
}

/// A seal of a name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Seal {
    name: String,
}

impl Seal {
    /// A seal of the name, which may be empty.
    #[must_use]
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_owned(),
        }
    }

    /// A seal of a text that is not empty.
    ///
    /// # Errors
    ///
    /// Kind `missing` for the empty text.
    pub fn parse(text: &str) -> Result<Self, Error> {
        if text.is_empty() {
            return Err(Error::Missing {
                key: String::from("text"),
            });
        }
        Ok(Self::new(text))
    }

    /// Checks that another seal has a name.
    ///
    /// # Errors
    ///
    /// Kind `missing` for a seal of the empty name.
    pub fn check(&self, other: &Self) -> Result<(), Error> {
        if other.name.is_empty() {
            return Err(Error::Missing {
                key: String::from("other"),
            });
        }
        Ok(())
    }
}
