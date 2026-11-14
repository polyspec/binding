//! A sample library for the end-to-end check of binding: it takes and gives the value alias `data` of the sample
//! library, in its functions and through a callback interface (T-3, U-7 (a')).

use binding_core::{Failure, Kinds, OrderedMap};
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
        None => Err(Failure::Kind(Error::Absent {
            key: key.to_owned(),
        })),
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

/// The value that the source of the sample library, a callback unit of another repository, has for the key (T-3,
/// GN-6s).
///
/// # Errors
///
/// An exception of the source, which goes back to the caller as it was thrown. The source recognizes no error unit, so
/// no kind of the sample library comes back; a function of this library fails with the errors of this library alone.
pub fn read(
    source: &mut dyn polyspec_sample::Source,
    key: &str,
) -> Result<Option<String>, Failure<Error>> {
    match source.read(key) {
        Ok(value) => Ok(value),
        Err(Failure::Kind(error)) => Err(Failure::Callback(Box::new(error))),
        Err(Failure::Raised(raised)) => Err(Failure::Raised(raised)),
        Err(Failure::Callback(error)) => Err(Failure::Callback(error)),
    }
}

/// The value that the lookup of the sample library holds for the key, `none` when it holds none, and `kind <kind>` when
/// the lookup fails with an error of the sample library: an exception of the lookup that is an instance of an error
/// unit that it recognizes is that error (U-3, GN-6s, GN-6d, B2.173).
///
/// # Errors
///
/// Any other exception of the lookup, which goes back to the caller as it was thrown.
pub fn consult(
    lookup: &mut dyn polyspec_sample::Lookup,
    key: &str,
) -> Result<String, Failure<Error>> {
    match lookup.find(key) {
        Ok(Some(value)) => Ok(value),
        Ok(None) => Ok(String::from("none")),
        Err(Failure::Kind(error)) => Ok(format!("kind {}", error.kind())),
        Err(Failure::Raised(raised)) => Err(Failure::Raised(raised)),
        Err(Failure::Callback(error)) => Err(Failure::Callback(error)),
    }
}

/// A note (T-9, GN-6v: a variant whose cases hold the data of the sample library, a unit of another repository, as a
/// field and as the values of a map).
#[derive(Debug, Clone, PartialEq)]
pub enum Note {
    /// A note without data.
    Blank,
    /// A note of one value.
    Single {
        /// The value.
        value: Data,
    },
    /// A note of a page: its status and its data by name.
    Page {
        /// The status.
        status: u64,
        /// The data by name, in order.
        data: OrderedMap<Data>,
    },
}

/// The note turned once: a blank stays, a single becomes the page of status 1 that holds its value as `value`, and a
/// page counts its status up.
#[must_use]
pub fn turned(note: &Note) -> Note {
    match note {
        Note::Blank => Note::Blank,
        Note::Single { value } => {
            let mut data = OrderedMap::new();
            let _replaced: Option<Data> = data.insert(String::from("value"), value.clone());
            Note::Page { status: 1, data }
        }
        Note::Page { status, data } => Note::Page {
            status: status.saturating_add(1),
            data: data.clone(),
        },
    }
}

/// The weight of the notes: nothing for a blank, the size of the value of a single, and the number of the entries of
/// a page.
#[must_use]
pub fn weight(notes: &[Note]) -> u64 {
    notes
        .iter()
        .map(|note| match note {
            Note::Blank => 0,
            Note::Single { value } => measure(value),
            Note::Page { data, .. } => data
                .iter()
                .fold(0, |count: u64, _entry| count.saturating_add(1)),
        })
        .fold(0, u64::saturating_add)
}

#[cfg(test)]
mod tests {
    use super::{copy, fetch, measure, pair, turned, weight, Error, Holder, Note};
    use binding_core::{Failure, OrderedMap};
    use polyspec_sample::Data;

    struct One(Vec<(String, Data)>);

    impl Holder for One {
        fn get(&mut self, key: &str) -> Result<Option<Data>, Failure<Error>> {
            Ok(self
                .0
                .iter()
                .find(|(held, _value)| held == key)
                .map(|(_key, value)| value.clone()))
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
        assert!(matches!(
            fetch(&mut holder, "b"),
            Err(Failure::Kind(Error::Absent { .. }))
        ));
        assert!(matches!(copy(&mut holder, "a", "b"), Ok(true)));
        assert!(matches!(copy(&mut holder, "c", "d"), Ok(false)));
        assert!(matches!(fetch(&mut holder, "b"), Ok(Data::Bool(true))));
    }

    #[test]
    fn a_note_holds_the_data_of_the_sample() {
        assert_eq!(turned(&Note::Blank), Note::Blank);
        let single = Note::Single { value: Data::Null };
        let mut data = OrderedMap::new();
        assert_eq!(data.insert(String::from("value"), Data::Null), None);
        let page = Note::Page {
            status: 1,
            data: data.clone(),
        };
        assert_eq!(turned(&single), page);
        assert_eq!(turned(&page), Note::Page { status: 2, data });
        assert_eq!(
            weight(&[
                Note::Blank,
                Note::Single {
                    value: pair(&Data::Null)
                },
                page
            ]),
            3
        );
    }
}
