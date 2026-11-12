//! A sample library for the end-to-end check of binding: a callback interface that language code implements (U-3).

use binding_core::{Failure, Kinds};
use std::fmt;

/// The errors of the sample.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The lookup holds no value for the key.
    Missing {
        /// The key.
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

/// A source of values by key, which language code implements.
pub trait Lookup {
    /// The value of a key, or `None` when it has none.
    ///
    /// # Errors
    ///
    /// The failure of the implementation.
    fn find(&mut self, key: &str) -> Result<Option<String>, Failure<Error>>;
}

/// The value of a key, which the lookup must hold.
///
/// # Errors
///
/// Kind `missing` when the lookup holds no value, and the failure of the lookup.
pub fn resolve(lookup: &mut dyn Lookup, key: &str) -> Result<String, Failure<Error>> {
    match lookup.find(key)? {
        Some(value) => Ok(value),
        None => Err(Failure::Kind(Error::Missing { key: key.to_owned() })),
    }
}

/// The number of the keys that the lookup holds.
///
/// # Errors
///
/// The failure of the lookup.
pub fn count(lookup: &mut dyn Lookup, keys: &[String]) -> Result<u64, Failure<Error>> {
    let mut found = 0;
    for key in keys {
        if lookup.find(key)?.is_some() {
            found += 1;
        }
    }
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::{count, resolve, Error, Lookup};
    use binding_core::Failure;

    struct Fixed;

    impl Lookup for Fixed {
        fn find(&mut self, key: &str) -> Result<Option<String>, Failure<Error>> {
            Ok((key == "a").then(|| String::from("1")))
        }
    }

    #[test]
    fn resolve_finds_and_misses() {
        assert!(matches!(resolve(&mut Fixed, "a"), Ok(value) if value == "1"));
        assert!(matches!(resolve(&mut Fixed, "b"), Err(Failure::Kind(Error::Missing { .. }))));
        assert!(matches!(count(&mut Fixed, &[String::from("a"), String::from("b")]), Ok(1)));
    }
}
