//! A sample library for the end-to-end check of binding: a callback interface that language code implements (U-3).

use binding_core::{FloatOut, Handle, HostText, HostValue, HostValues, Failure, Kinds, MapOut, OutValue, OutValues};
use std::fmt;

/// The errors of the sample.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The lookup holds no value for the key.
    Missing {
        /// The key.
        key: String,
    },
    /// A language value that is not data.
    Unsupported {
        /// What the value is.
        what: String,
    },
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Missing { .. } => "missing",
            Self::Unsupported { .. } => "unsupported",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { key } => write!(f, "no value for {key}"),
            Self::Unsupported { what } => write!(f, "not data: {what}"),
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

/// A tag of a name, which the language makes and gives back to the core (T-5: a class as a parameter).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tag {
    name: String,
}

impl Tag {
    /// A tag of the name.
    #[must_use]
    pub fn new(name: &str) -> Self {
        Self { name: name.to_owned() }
    }

    /// The name of the tag.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }
}

/// The names of the tags, joined by commas.
#[must_use]
pub fn join(tags: &[Tag]) -> String {
    tags.iter().map(Tag::name).collect::<Vec<_>>().join(",")
}

/// The tag with the name in upper case.
#[must_use]
pub fn shout(tag: &Tag) -> Tag {
    Tag { name: tag.name.to_uppercase() }
}

/// A value of data: the null, a boolean, a number, a text, a list or a map with text keys (U-7: a value alias whose
/// core judges the language values and gives its own).
#[derive(Debug, Clone, PartialEq)]
pub enum Data {
    /// No value.
    Null,
    /// A boolean.
    Bool(bool),
    /// A number.
    Float(f64),
    /// A text.
    Text(String),
    /// A list.
    List(Vec<Data>),
    /// A map with text keys, in order.
    Map(Vec<(String, Data)>),
}

/// The deepest nesting of data that the sample takes.
const MAX_DEPTH: usize = 64;

/// The data that a language value describes (U-7 `in`): what is not data is kind `unsupported`.
///
/// # Errors
///
/// Kind `unsupported` for a value that is not data, and the exception that the language raised.
pub fn data_from_host(host: &mut dyn HostValues, value: HostValue) -> Result<Data, Failure<Error>> {
    data_at(host, value, 0)
}

fn data_at(host: &mut dyn HostValues, value: HostValue, depth: usize) -> Result<Data, Failure<Error>> {
    if depth > MAX_DEPTH {
        return Err(Failure::Kind(Error::Unsupported { what: String::from("a value nested too deep") }));
    }
    match value {
        HostValue::Null => Ok(Data::Null),
        HostValue::Bool(value) => Ok(Data::Bool(value)),
        HostValue::Int(value) => Ok(Data::Float(value as f64)),
        HostValue::Float(value) | HostValue::UntypedNumber(value) => Ok(Data::Float(value)),
        HostValue::Text(text) => match text {
            HostText::Bytes(bytes) => String::from_utf8(bytes)
                .map(Data::Text)
                .map_err(|_bytes| Failure::Kind(Error::Unsupported { what: String::from("bytes that are no text") })),
            HostText::Utf16(units) => String::from_utf16(&units)
                .map(Data::Text)
                .map_err(|_units| Failure::Kind(Error::Unsupported { what: String::from("an unpaired surrogate") })),
            HostText::CodePoints(points) => points
                .into_iter()
                .map(char::from_u32)
                .collect::<Option<String>>()
                .map(Data::Text)
                .ok_or_else(|| Failure::Kind(Error::Unsupported { what: String::from("an unpaired surrogate") })),
        },
        HostValue::List { handle, len } | HostValue::PhpArray { handle, len, is_list: true } => {
            let mut items = Vec::new();
            for index in 0..len {
                let item = host.item(handle, index).map_err(Failure::Raised)?;
                items.push(data_at(host, item, depth + 1)?);
            }
            Ok(Data::List(items))
        }
        HostValue::Map { handle, len } | HostValue::PhpArray { handle, len, is_list: false } | HostValue::PlainObject { handle, len, .. } | HostValue::StdClass { handle, len } => {
            let mut entries = Vec::new();
            for index in 0..len {
                let (key, value) = host.entry(handle, index).map_err(Failure::Raised)?;
                let Data::Text(key) = data_at(host, key, depth + 1)? else {
                    return Err(Failure::Kind(Error::Unsupported { what: String::from("a key that is no text") }));
                };
                entries.push((key, data_at(host, value, depth + 1)?));
            }
            Ok(Data::Map(entries))
        }
        other => Err(Failure::Kind(Error::Unsupported { what: format!("{other:?}") })),
    }
}

/// The language form of data (U-7 `out`): the root and the children of its containers by their handles.
pub struct DataOut<'a> {
    held: Vec<&'a Data>,
}

impl<'a> DataOut<'a> {
    fn describe(&mut self, value: &'a Data) -> OutValue {
        match value {
            Data::Null => OutValue::Null,
            Data::Bool(value) => OutValue::Bool(*value),
            Data::Float(value) => OutValue::Float(FloatOut::new(*value)),
            Data::Text(value) => OutValue::Text(value.clone()),
            Data::List(items) => {
                self.held.push(value);
                OutValue::List { handle: Handle::new((self.held.len() - 1) as u64), len: items.len() as u64 }
            }
            Data::Map(entries) => {
                self.held.push(value);
                let sequence = entries.iter().enumerate().all(|(index, (key, _value))| *key == index.to_string());
                OutValue::Map(MapOut::new(Handle::new((self.held.len() - 1) as u64), entries.len() as u64, sequence))
            }
        }
    }
}

impl OutValues for DataOut<'_> {
    fn item(&mut self, list: Handle, index: u64) -> OutValue {
        let held = self.held.get(list.raw() as usize).copied();
        match held {
            Some(Data::List(items)) => match items.get(index as usize) {
                Some(item) => self.describe(item),
                None => OutValue::Null,
            },
            _ => OutValue::Null,
        }
    }

    fn entry(&mut self, map: Handle, index: u64) -> (OutValue, OutValue) {
        let held = self.held.get(map.raw() as usize).copied();
        match held {
            Some(Data::Map(entries)) => match entries.get(index as usize) {
                Some((key, value)) => (OutValue::Text(key.clone()), self.describe(value)),
                None => (OutValue::Null, OutValue::Null),
            },
            _ => (OutValue::Null, OutValue::Null),
        }
    }
}

/// The language form of data (U-7 `out`).
#[must_use]
pub fn data_to_out(value: &Data) -> (OutValue, DataOut<'_>) {
    let mut out = DataOut { held: Vec::new() };
    let root = out.describe(value);
    (root, out)
}

/// The data itself, which crosses the boundary in and out.
#[must_use]
pub fn echo(value: &Data) -> Data {
    value.clone()
}

/// The number of the items of a list, the entries of a map, and 1 for any other data.
#[must_use]
pub fn size(value: &Data) -> u64 {
    match value {
        Data::List(items) => items.len() as u64,
        Data::Map(entries) => entries.len() as u64,
        _ => 1,
    }
}
