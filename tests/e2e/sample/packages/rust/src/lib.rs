//! A sample library for the end-to-end check of binding: a callback interface that language code implements (U-3).

use binding_core::{FloatOut, Handle, HostText, HostValue, HostValues, Failure, Kinds, MapOut, Native, OutValue, OutValues};
use std::fmt;

/// The count of a length, which widens: usize is at most 64 bits wide on every target of the workspace.
#[allow(clippy::as_conversions, reason = "usize is at most 64 bits wide on every target of the workspace, so the conversion is lossless")]
const fn widen(length: usize) -> u64 {
    length as u64
}

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
    /// The text could not be read (category io; a fault injection point gives it, G-5).
    Unreadable {
        /// The errno of the read that failed.
        errno: Option<i32>,
    },
    /// An invariant of the sample does not hold (X-1).
    Internal {
        /// What does not hold.
        detail: String,
    },
}

/// The fault injection points of the sample (G-5), which the contract names in `faults`.
pub mod fault {
    /// The read of the text of `measure`.
    #[doc(hidden)]
    pub const READ: &str = "sample.read";
    /// The invariant of `measure`.
    #[doc(hidden)]
    pub const INTERNAL: &str = "sample.internal";
    /// The invariant of `Counter::draw`.
    #[doc(hidden)]
    pub const DRAW: &str = "sample.draw";
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Missing { .. } => "missing",
            Self::Unsupported { .. } => "unsupported",
            Self::Unreadable { .. } => "unreadable",
            Self::Internal { .. } => "internal",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { key } => write!(f, "no value for {key}"),
            Self::Unsupported { what } => write!(f, "not data: {what}"),
            Self::Unreadable { .. } => f.write_str("the text could not be read"),
            Self::Internal { detail } => write!(f, "the sample is broken: {detail}"),
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
        match self {
            Self::Unreadable { errno } => *errno,
            Self::Missing { .. } | Self::Unsupported { .. } | Self::Internal { .. } => None,
        }
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

/// The value of a key in the first lookup that holds it (GN-6aa: callbacks in a list, which the core takes by value).
///
/// # Errors
///
/// Kind `missing` when no lookup holds a value, and the failure of a lookup.
pub fn first(lookups: Vec<Box<dyn Lookup + '_>>, key: &str) -> Result<String, Failure<Error>> {
    for mut lookup in lookups {
        if let Some(value) = lookup.find(key)? {
            return Ok(value);
        }
    }
    Err(Failure::Kind(Error::Missing { key: key.to_owned() }))
}

/// The value of a key in the lookup, and `None` without a lookup (GN-6aa: an optional callback).
///
/// # Errors
///
/// The failure of the lookup.
pub fn maybe(lookup: Option<Box<dyn Lookup + '_>>, key: &str) -> Result<Option<String>, Failure<Error>> {
    match lookup {
        Some(mut lookup) => lookup.find(key),
        None => Ok(None),
    }
}

/// A search for the value of a key (GN-6aa: a record with a callback field, whose type has one lifetime).
pub struct Search<'a> {
    /// The lookup that holds the value.
    pub lookup: Box<dyn Lookup + 'a>,
    /// The key.
    pub key: String,
}

/// The value of the key of the search, which its lookup must hold.
///
/// # Errors
///
/// Kind `missing` when the lookup holds no value, and the failure of the lookup.
pub fn seek(mut search: Search<'_>) -> Result<String, Failure<Error>> {
    resolve(&mut *search.lookup, &search.key)
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

    /// The string form of the tag (N-4: stringify).
    #[must_use]
    pub fn label(&self) -> String {
        format!("#{}", self.name)
    }

    /// The JSON hook of the tag, which refuses (N-4: to_json; T-2: never).
    ///
    /// # Errors
    ///
    /// Always kind `unsupported`: a tag has no JSON form.
    pub fn host_json(&self) -> Result<std::convert::Infallible, Error> {
        Err(Error::Unsupported { what: format!("the JSON form of the tag {}", self.name) })
    }

    /// The entries of the tag, its name with the tag itself (N-4: iterate with a key and a value).
    pub fn entries(&self) -> impl Iterator<Item = (&String, &Self)> {
        std::iter::once((&self.name, self))
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

/// A value of data: the null, a boolean, a number, a text, a list, a map with text keys or an object of the language
/// (U-7: a value alias whose core judges the language values and gives its own).
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
    /// An object or a function of the language, which data keeps and gives back as the same object (GN-6u).
    Native(Native),
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
        // U-7: an integer of the language is the float nearest to it, as JSON reads a number.
        #[allow(clippy::as_conversions, clippy::cast_precision_loss, reason = "U-7: data holds every number as a float, the nearest one to an integer")]
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
        HostValue::Callable(native) | HostValue::Object { native, .. } => Ok(Data::Native(native)),
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
                OutValue::List { handle: Handle::new(widen(self.held.len() - 1)), len: widen(items.len()) }
            }
            Data::Map(entries) => {
                self.held.push(value);
                let sequence = entries.iter().enumerate().all(|(index, (key, _value))| *key == index.to_string());
                OutValue::Map(MapOut::new(Handle::new(widen(self.held.len() - 1)), widen(entries.len()), sequence))
            }
            Data::Native(native) => OutValue::Native(native.clone()),
        }
    }
}

impl OutValues for DataOut<'_> {
    fn item(&mut self, list: Handle, index: u64) -> OutValue {
        let held = usize::try_from(list.raw()).ok().and_then(|at| self.held.get(at)).copied();
        match held {
            Some(Data::List(items)) => match usize::try_from(index).ok().and_then(|at| items.get(at)) {
                Some(item) => self.describe(item),
                None => OutValue::Null,
            },
            _ => OutValue::Null,
        }
    }

    fn entry(&mut self, map: Handle, index: u64) -> (OutValue, OutValue) {
        let held = usize::try_from(map.raw()).ok().and_then(|at| self.held.get(at)).copied();
        match held {
            Some(Data::Map(entries)) => match usize::try_from(index).ok().and_then(|at| entries.get(at)) {
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
        Data::List(items) => widen(items.len()),
        Data::Map(entries) => widen(entries.len()),
        _ => 1,
    }
}

/// A counter, which its members change (U-2: a receiver `&mut self`, held in the mutex of B-5c).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Counter {
    total: u64,
}

impl Counter {
    /// A counter that starts at a total.
    #[must_use]
    pub fn new(start: u64) -> Self {
        Self { total: start }
    }

    /// The total.
    #[must_use]
    pub fn total(&self) -> u64 {
        self.total
    }

    /// Adds an amount and gives the new total; a total above the range of `u64` stays at its end.
    pub fn add(&mut self, amount: u64) -> u64 {
        self.total = self.total.saturating_add(amount);
        self.total
    }

    /// Adds the total of another counter.
    pub fn absorb(&mut self, other: &Self) {
        self.total = self.total.saturating_add(other.total);
    }

    /// Adds the total of another counter and gives the new total (GN-8a: a member that takes two locks before a
    /// core that holds a fault injection point).
    ///
    /// # Errors
    ///
    /// Kind `internal` when the invariant of the sample is broken.
    pub fn draw(&mut self, other: &Self) -> Result<u64, Error> {
        if binding_core::fault::point!(fault::DRAW).is_some() {
            return Err(Error::Internal { detail: String::from("the total of a counter is unknown") });
        }
        self.total = self.total.saturating_add(other.total);
        Ok(self.total)
    }
}

/// The keys that were noted, which a member reads while it calls language code (B-5c: a class with a write place and
/// a `&self` member that reaches language code is held in the read-write lock).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ledger {
    keys: Vec<String>,
}

impl Ledger {
    /// A ledger that starts with a key.
    #[must_use]
    pub fn new(key: &str) -> Self {
        Self { keys: vec![key.to_owned()] }
    }

    /// Notes a key.
    pub fn note(&mut self, key: &str) {
        self.keys.push(key.to_owned());
    }

    /// The number of the noted keys.
    #[must_use]
    pub fn size(&self) -> u64 {
        widen(self.keys.len())
    }

    /// The number of the noted keys that the lookup holds.
    ///
    /// # Errors
    ///
    /// The failure of the lookup.
    pub fn known(&self, lookup: &mut dyn Lookup) -> Result<u64, Failure<Error>> {
        count(lookup, &self.keys)
    }
}

/// The number of the bytes of a text that a read gives (G-5: the read is a fault injection point).
///
/// # Errors
///
/// Kind `unreadable` when the read fails, and kind `internal` when the invariant of the sample is broken.
pub fn measure(text: &str) -> Result<u64, Error> {
    if binding_core::fault::point!(fault::INTERNAL).is_some() {
        return Err(Error::Internal { detail: String::from("the length of a text is unknown") });
    }
    let length = widen(text.len());
    match binding_core::fault::point!(fault::READ) {
        Some(binding_core::fault::Injected::Io { errno }) => Err(Error::Unreadable { errno }),
        Some(binding_core::fault::Injected::Short { bytes }) => Ok(length.min(bytes)),
        Some(binding_core::fault::Injected::Broken) | None => Ok(length),
    }
}

/// The number of the bytes of a text, from a core that returns a `Result` and gives no kind (E-1c `core.result`).
///
/// # Errors
///
/// None.
pub fn checked(text: &str) -> Result<u64, Error> {
    Ok(widen(text.len()))
}

/// Takes a text and gives nothing (E-1c: a core that returns no `Result` and no value).
pub fn touch(_text: &str) {}
