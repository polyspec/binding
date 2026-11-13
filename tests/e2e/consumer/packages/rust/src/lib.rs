//! A sample library for the end-to-end check of binding: it takes and gives the value alias `data` of the sample
//! library, in its functions and through a callback interface (T-3, U-7 (a')).

use binding_core::{Failure, Kinds};
use polyspec_sample::Data;
use std::fmt;

/// The errors of the library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The holder has no value for the key.
    Absent {
        /// The key.
        key: String,
    },
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Absent { .. } => "absent",
        }
    }

    /// The key that the error names.
    #[must_use]
    pub fn key(&self) -> &str {
        match self {
            Self::Absent { key } => key,
        }
    }

    /// The length of the key in bytes, or `None` when the key is empty.
    #[must_use]
    pub fn length(&self) -> Option<u64> {
        match self {
            Self::Absent { key } => u64::try_from(key.len()).ok().filter(|length| *length > 0),
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Absent { key } => write!(f, "the holder has no {key}"),
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

/// A holder of data by key, which language code implements.
pub trait Holder {
    /// The data of a key, or `None` when the holder has none.
    ///
    /// # Errors
    ///
    /// The failure of the implementation.
    fn get(&mut self, key: &str) -> Result<Option<Data>, Failure<Error>>;

    /// Holds the data under the key.
    ///
    /// # Errors
    ///
    /// The failure of the implementation.
    fn set(&mut self, key: &str, value: &Data) -> Result<(), Failure<Error>>;
}

/// The size of the data, as the sample library counts it.
#[must_use]
pub fn measure(value: &Data) -> u64 {
    polyspec_sample::size(value)
}

/// A list that holds the data twice.
#[must_use]
pub fn pair(value: &Data) -> Data {
    Data::List(vec![value.clone(), value.clone()])
}

/// The data that the holder has for the key.
///
/// # Errors
///
/// Kind `absent` when the holder has none, and the failure of the holder.
pub fn fetch(holder: &mut dyn Holder, key: &str) -> Result<Data, Failure<Error>> {
    match holder.get(key)? {
        Some(value) => Ok(value),
        None => Err(Failure::Kind(Error::Absent { key: key.to_owned() })),
    }
}

/// Holds the data of one key under another key too, and says whether the first key had data.
///
/// # Errors
///
/// The failure of the holder.
pub fn copy(holder: &mut dyn Holder, source: &str, target: &str) -> Result<bool, Failure<Error>> {
    match holder.get(source)? {
        Some(value) => {
            holder.set(target, &value)?;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::{copy, fetch, measure, pair, Error, Holder};
    use binding_core::Failure;
    use polyspec_sample::Data;

    struct One(Vec<(String, Data)>);

    impl Holder for One {
        fn get(&mut self, key: &str) -> Result<Option<Data>, Failure<Error>> {
            Ok(self.0.iter().find(|(held, _value)| held == key).map(|(_key, value)| value.clone()))
        }

        fn set(&mut self, key: &str, value: &Data) -> Result<(), Failure<Error>> {
            self.0.push((key.to_owned(), value.clone()));
            Ok(())
        }
    }

    #[test]
    fn data_of_the_sample_crosses_the_functions_and_the_holder() {
        assert_eq!(measure(&pair(&Data::Null)), 2);
        let mut holder = One(vec![(String::from("a"), Data::Bool(true))]);
        assert!(matches!(fetch(&mut holder, "a"), Ok(Data::Bool(true))));
        assert!(matches!(fetch(&mut holder, "b"), Err(Failure::Kind(Error::Absent { .. }))));
        assert!(matches!(copy(&mut holder, "a", "b"), Ok(true)));
        assert!(matches!(copy(&mut holder, "c", "d"), Ok(false)));
        assert!(matches!(fetch(&mut holder, "b"), Ok(Data::Bool(true))));
    }
}
