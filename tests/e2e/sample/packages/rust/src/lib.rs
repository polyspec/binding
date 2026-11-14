//! A sample library for the end-to-end check of binding: a callback interface that language code implements (U-3).

use binding_core::{
    Failure, FloatOut, Handle, HostText, HostValue, HostValues, Kinds, MapOut, Native, OutValue,
    OutValues,
};
use std::fmt;

/// The count of a length, which widens: usize is at most 64 bits wide on every target of the workspace.
#[allow(
    clippy::as_conversions,
    reason = "usize is at most 64 bits wide on every target of the workspace, so the conversion is lossless"
)]
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
    /// The lookup refused the key: language code raised the error unit `refused_error`, which `find` recognizes (U-3).
    Refused,
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
    /// The read of the total of `Counter::tally`.
    #[doc(hidden)]
    pub const TALLY: &str = "sample.tally";
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Missing { .. } => "missing",
            Self::Unsupported { .. } => "unsupported",
            Self::Unreadable { .. } => "unreadable",
            Self::Refused => "refused",
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
            Self::Refused => f.write_str("the lookup refused the key"),
            Self::Internal { detail } => write!(f, "the sample is broken: {detail}"),
        }
    }
}

impl std::error::Error for Error {}

impl Error {
    /// The core error of a kind that a callback member recognizes (U-3): the kind is the error, and the message of the
    /// exception of language code is not kept, because the error states its own.
    #[must_use]
    pub fn recognized(kind: Self, _message: &str) -> Self {
        kind
    }
}

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
            Self::Missing { .. }
            | Self::Unsupported { .. }
            | Self::Refused
            | Self::Internal { .. } => None,
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

/// A source of values by key that recognizes no error, which language code implements and the consumer library takes
/// as a callback unit of another repository (GN-6s).
pub trait Source {
    /// The value of a key, or `None` when it has none.
    ///
    /// # Errors
    ///
    /// The failure of the implementation.
    fn read(&mut self, key: &str) -> Result<Option<String>, Failure<Error>>;
}

/// The value of a key, which the lookup must hold.
///
/// # Errors
///
/// Kind `missing` when the lookup holds no value, and the failure of the lookup.
pub fn resolve(lookup: &mut dyn Lookup, key: &str) -> Result<String, Failure<Error>> {
    match lookup.find(key)? {
        Some(value) => Ok(value),
        None => Err(Failure::Kind(Error::Missing {
            key: key.to_owned(),
        })),
    }
}

/// The value of a key, which the lookup must hold, resolved as a blocking I/O call would be (B-5 (a): the token of wait
/// blocking_io); the lookup is language code that the core calls during the call (GN-6q).
///
/// # Errors
///
/// Kind `missing` when the lookup holds no value, and the failure of the lookup.
pub fn resolve_slowly(
    _io: binding_core::Io,
    lookup: &mut dyn Lookup,
    key: &str,
) -> Result<String, Failure<Error>> {
    resolve(lookup, key)
}

/// The value of a key, which the lookup must hold, resolved by a state machine without I/O (GN-6ab): it reads the key
/// by an I/O future, which fails with kind `unreadable` for an empty key, then finds its value through the lookup,
/// which is language code that the driver calls on the thread that owns it, and ends.
pub fn resolve_driven<L: Lookup>(lookup: L, key: String) -> ResolveDriven<L> {
    ResolveDriven {
        lookup,
        key,
        read: false,
        found: None,
    }
}

/// The state machine of [`resolve_driven`], which owns its lookup and its key.
pub struct ResolveDriven<L> {
    lookup: L,
    key: String,
    read: bool,
    found: Option<Result<Option<String>, Failure<Error>>>,
}

impl<L: Lookup> binding_core::machine::Machine for ResolveDriven<L> {
    type Io = Result<(), Error>;
    type Done = Result<String, Failure<Error>>;

    fn resume(
        &mut self,
        io: Option<Result<(), Error>>,
    ) -> binding_core::machine::Step<Self::Io, Self::Done> {
        use binding_core::machine::Step;
        if let Some(found) = self.found.take() {
            return Step::Done(match found {
                Ok(Some(value)) => Ok(value),
                Ok(None) => Err(Failure::Kind(Error::Missing {
                    key: self.key.clone(),
                })),
                Err(failure) => Err(failure),
            });
        }
        if !self.read {
            self.read = true;
            let empty = self.key.is_empty();
            return Step::Io(Box::pin(async move {
                if empty {
                    Err(Error::Unreadable { errno: None })
                } else {
                    Ok(())
                }
            }));
        }
        match io {
            Some(Err(error)) => Step::Done(Err(Failure::Kind(error))),
            Some(Ok(())) | None => Step::Call,
        }
    }

    fn call(&mut self) {
        self.found = Some(self.lookup.find(&self.key));
    }

    /// The machine calls no function that returns a value of language code, so it awaits none (GN-6ae).
    fn settle(&mut self, _outcome: Result<binding_core::Passthrough, binding_core::Raised>) {}
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

/// The value of a key, as the lookup gives it. A key written `?<name>` is asked as `<name>` and tolerates a lookup that
/// fails: the core answers the exception of the language code and drops it, so the call gives `None` and ends without
/// the exception (U-3, GN-6u). Any other key lets the failure of the lookup through.
///
/// # Errors
///
/// The failure of the lookup of a key without `?`, and the failure of a lookup that is a kind of this library.
pub fn tolerant(lookup: &mut dyn Lookup, key: &str) -> Result<Option<String>, Failure<Error>> {
    let Some(name) = key.strip_prefix('?') else {
        return lookup.find(key);
    };
    match lookup.find(name) {
        Ok(found) => Ok(found),
        Err(Failure::Raised(raised)) => {
            drop(raised);
            Ok(None)
        }
        Err(failure) => Err(failure),
    }
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
    Err(Failure::Kind(Error::Missing {
        key: key.to_owned(),
    }))
}

/// The value of a key in the lookup, and `None` without a lookup (GN-6aa: an optional callback).
///
/// # Errors
///
/// The failure of the lookup.
pub fn maybe(
    lookup: Option<Box<dyn Lookup + '_>>,
    key: &str,
) -> Result<Option<String>, Failure<Error>> {
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
        assert!(matches!(
            resolve(&mut Fixed, "b"),
            Err(Failure::Kind(Error::Missing { .. }))
        ));
        assert!(matches!(
            count(&mut Fixed, &[String::from("a"), String::from("b")]),
            Ok(1)
        ));
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
        Self {
            name: name.to_owned(),
        }
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
        Err(Error::Unsupported {
            what: format!("the JSON form of the tag {}", self.name),
        })
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
    Tag {
        name: tag.name.to_uppercase(),
    }
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

fn data_at(
    host: &mut dyn HostValues,
    value: HostValue,
    depth: usize,
) -> Result<Data, Failure<Error>> {
    if depth > MAX_DEPTH {
        return Err(Failure::Kind(Error::Unsupported {
            what: String::from("a value nested too deep"),
        }));
    }
    match value {
        HostValue::Null => Ok(Data::Null),
        HostValue::Bool(value) => Ok(Data::Bool(value)),
        // U-7: an integer of the language is the float nearest to it, as JSON reads a number.
        #[allow(
            clippy::as_conversions,
            clippy::cast_precision_loss,
            reason = "U-7: data holds every number as a float, the nearest one to an integer"
        )]
        HostValue::Int(value) => Ok(Data::Float(value as f64)),
        HostValue::Float(value) | HostValue::UntypedNumber(value) => Ok(Data::Float(value)),
        HostValue::Text(text) => match text {
            HostText::Bytes(bytes) => String::from_utf8(bytes).map(Data::Text).map_err(|_bytes| {
                Failure::Kind(Error::Unsupported {
                    what: String::from("bytes that are no text"),
                })
            }),
            HostText::Utf16(units) => {
                String::from_utf16(&units)
                    .map(Data::Text)
                    .map_err(|_units| {
                        Failure::Kind(Error::Unsupported {
                            what: String::from("an unpaired surrogate"),
                        })
                    })
            }
            HostText::CodePoints(points) => points
                .into_iter()
                .map(char::from_u32)
                .collect::<Option<String>>()
                .map(Data::Text)
                .ok_or_else(|| {
                    Failure::Kind(Error::Unsupported {
                        what: String::from("an unpaired surrogate"),
                    })
                }),
        },
        HostValue::List { handle, len }
        | HostValue::PhpArray {
            handle,
            len,
            is_list: true,
        } => {
            let mut items = Vec::new();
            for index in 0..len {
                let item = host.item(handle, index).map_err(Failure::Raised)?;
                items.push(data_at(host, item, depth + 1)?);
            }
            Ok(Data::List(items))
        }
        HostValue::Map { handle, len }
        | HostValue::PhpArray {
            handle,
            len,
            is_list: false,
        }
        | HostValue::PlainObject { handle, len, .. }
        | HostValue::StdClass { handle, len } => {
            let mut entries = Vec::new();
            for index in 0..len {
                let (key, value) = host.entry(handle, index).map_err(Failure::Raised)?;
                let Data::Text(key) = data_at(host, key, depth + 1)? else {
                    return Err(Failure::Kind(Error::Unsupported {
                        what: String::from("a key that is no text"),
                    }));
                };
                entries.push((key, data_at(host, value, depth + 1)?));
            }
            Ok(Data::Map(entries))
        }
        HostValue::Callable(native) | HostValue::Object { native, .. } => Ok(Data::Native(native)),
        other => Err(Failure::Kind(Error::Unsupported {
            what: format!("{other:?}"),
        })),
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
                OutValue::List {
                    handle: Handle::new(widen(self.held.len() - 1)),
                    len: widen(items.len()),
                }
            }
            Data::Map(entries) => {
                self.held.push(value);
                let sequence = entries
                    .iter()
                    .enumerate()
                    .all(|(index, (key, _value))| *key == index.to_string());
                OutValue::Map(MapOut::new(
                    Handle::new(widen(self.held.len() - 1)),
                    widen(entries.len()),
                    sequence,
                ))
            }
            Data::Native(native) => OutValue::Native(native.clone()),
        }
    }
}

impl OutValues for DataOut<'_> {
    fn item(&mut self, list: Handle, index: u64) -> OutValue {
        let held = usize::try_from(list.raw())
            .ok()
            .and_then(|at| self.held.get(at))
            .copied();
        match held {
            Some(Data::List(items)) => {
                match usize::try_from(index).ok().and_then(|at| items.get(at)) {
                    Some(item) => self.describe(item),
                    None => OutValue::Null,
                }
            }
            _ => OutValue::Null,
        }
    }

    fn entry(&mut self, map: Handle, index: u64) -> (OutValue, OutValue) {
        let held = usize::try_from(map.raw())
            .ok()
            .and_then(|at| self.held.get(at))
            .copied();
        match held {
            Some(Data::Map(entries)) => {
                match usize::try_from(index).ok().and_then(|at| entries.get(at)) {
                    Some((key, value)) => (OutValue::Text(key.clone()), self.describe(value)),
                    None => (OutValue::Null, OutValue::Null),
                }
            }
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

/// The kind of the data, and `null` for no data (U-2: a `{literal: null}` default of a value type, so `None` is
/// what the core decides it is).
#[must_use]
pub fn describe(value: Option<&Data>) -> String {
    let kind = match value {
        None | Some(Data::Null) => "null",
        Some(Data::Bool(_)) => "bool",
        Some(Data::Float(_)) => "float",
        Some(Data::Text(_)) => "text",
        Some(Data::List(_)) => "list",
        Some(Data::Map(_)) => "map",
        Some(Data::Native(_)) => "native",
    };
    String::from(kind)
}

/// A counter, which its members change (U-2: a receiver `&mut self`, held in the mutex of B-5c).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Counter {
    total: u64,
    /// The failure of a tally, which every later settle gives again (GN-13f: a kind that a failure of an earlier call
    /// leaves for a later call to give).
    failure: Option<Error>,
}

impl Counter {
    /// A counter that starts at a total.
    #[must_use]
    pub fn new(start: u64) -> Self {
        Self {
            total: start,
            failure: None,
        }
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
            return Err(Error::Internal {
                detail: String::from("the total of a counter is unknown"),
            });
        }
        self.total = self.total.saturating_add(other.total);
        Ok(self.total)
    }

    /// Reads the total and gives it (G-5: the read is a fault injection point).
    ///
    /// # Errors
    ///
    /// Kind `unreadable` when the read fails; the counter keeps that failure for `settle`.
    pub fn tally(&mut self) -> Result<u64, Error> {
        if let Some(binding_core::fault::Injected::Io { errno }) =
            binding_core::fault::point!(fault::TALLY)
        {
            let failure = Error::Unreadable { errno };
            self.failure = Some(failure.clone());
            return Err(failure);
        }
        Ok(self.total)
    }

    /// The total of a counter whose tallies did not fail.
    ///
    /// # Errors
    ///
    /// The failure of an earlier tally, kind `unreadable` with its errno.
    pub fn settle(&self) -> Result<u64, Error> {
        match &self.failure {
            Some(failure) => Err(failure.clone()),
            None => Ok(self.total),
        }
    }
}

/// A shelf of a count, whose slips read the count until the shelf is cleared (GN-13f: a kind that an instance reaches
/// only after a call of the instance that it was made from).
#[derive(Debug, Clone, Default)]
pub struct Shelf {
    count: std::sync::Arc<std::sync::Mutex<Option<u64>>>,
}

impl Shelf {
    /// A shelf that holds a count.
    #[must_use]
    pub fn new(count: u64) -> Self {
        Self {
            count: std::sync::Arc::new(std::sync::Mutex::new(Some(count))),
        }
    }

    /// A slip that reads the count of this shelf.
    #[must_use]
    pub fn slip(&self) -> Slip {
        Slip {
            count: std::sync::Arc::clone(&self.count),
        }
    }

    /// Removes the count, which every slip of the shelf then misses.
    pub fn clear(&mut self) {
        let mut count = self
            .count
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *count = None;
    }
}

/// A slip of a shelf, which reads the count of that shelf.
#[derive(Debug, Clone)]
pub struct Slip {
    count: std::sync::Arc<std::sync::Mutex<Option<u64>>>,
}

impl Slip {
    /// The count of the shelf.
    ///
    /// # Errors
    ///
    /// Kind `missing` when the shelf was cleared.
    pub fn read(&self) -> Result<u64, Error> {
        let count = self
            .count
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        count.ok_or_else(|| Error::Missing {
            key: String::from("slip"),
        })
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
        Self {
            keys: vec![key.to_owned()],
        }
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
        return Err(Error::Internal {
            detail: String::from("the length of a text is unknown"),
        });
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

/// The entries of a store or of a scope, shared by the clones of its handle.
type Entries = std::sync::Arc<std::sync::Mutex<std::collections::BTreeMap<String, String>>>;

/// The entries of `entries`, also after a panic of another holder, whose writes are whole entries.
fn entries_of(
    entries: &Entries,
) -> std::sync::MutexGuard<'_, std::collections::BTreeMap<String, String>> {
    match entries.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

/// A store of committed entries, a handle whose clones share one state (GN-6ae): a transaction gives language code a
/// scope of pending entries, which it commits when the code returns and drops when the code raises.
#[derive(Debug, Clone, Default)]
pub struct Store {
    entries: Entries,
}

impl Store {
    /// An empty store.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The committed value of a key.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<String> {
        entries_of(&self.entries).get(key).cloned()
    }

    /// Runs `function` with a new scope over the store, as a state machine (GN-6ab): the scope is begun by an I/O
    /// future, the function is language code that the driver calls on its thread, and its value, which may be an
    /// awaitable, is settled by the driver. The pending entries of the scope are committed when the function returns,
    /// and dropped when it raises, whose exception the machine returns.
    pub fn transaction<F>(self, function: F) -> Scoped<F>
    where
        F: FnMut(Scope) -> Result<binding_core::Passthrough, Failure<Error>>,
    {
        Scoped::new(self.entries, function)
    }

    /// Runs `function` as [`Store::transaction`] does and then writes the entry `audited` of the store by an I/O
    /// future, also when the function raised: the machine goes on to a wait after language code raised, and returns
    /// the exception when the wait is over (GN-6ae).
    pub fn audited<F>(self, function: F) -> Scoped<F>
    where
        F: FnMut(Scope) -> Result<binding_core::Passthrough, Failure<Error>>,
    {
        Scoped {
            audit: true,
            ..Scoped::new(self.entries, function)
        }
    }

    /// Runs `function` with a new scope whose entries are dropped, and gives whether it returned: the core drops the
    /// value that it returned. A function that raised after it wrote an entry is an attempt that did not hold: the
    /// core answers its exception by dropping the `Raised`, on another thread where the target has one, so the call
    /// gives `false` and ends without the exception (U-3, GN-6u). A function that raised before it wrote an entry
    /// made no attempt, and its exception returns.
    pub fn attempt<F>(self, function: F) -> Attempted<F>
    where
        F: FnMut(Scope) -> Result<binding_core::Passthrough, Failure<Error>>,
    {
        Attempted {
            scope: Scope {
                parent: self.entries,
                pending: Entries::default(),
            },
            function,
            begun: false,
            called: None,
        }
    }

    /// Runs `function` with a scope over a store of this one call, as [`Store::transaction`] does: a static member
    /// that takes a function (GN-6ae).
    pub fn once<F>(function: F) -> Scoped<F>
    where
        F: FnMut(Scope) -> Result<binding_core::Passthrough, Failure<Error>>,
    {
        Scoped::new(Entries::default(), function)
    }
}

/// Runs `function` with a scope over entries that end with the call, as [`Store::transaction`] does: a function of a
/// functions unit that takes a function (GN-6ae).
pub fn scoped<F>(function: F) -> Scoped<F>
where
    F: FnMut(Scope) -> Result<binding_core::Passthrough, Failure<Error>>,
{
    Scoped::new(Entries::default(), function)
}

/// The pending entries of a transaction over the entries of its parent, a handle whose clones share one state.
#[derive(Debug, Clone)]
pub struct Scope {
    parent: Entries,
    pending: Entries,
}

impl Scope {
    /// Writes a pending entry.
    pub fn put(&self, key: &str, value: &str) {
        entries_of(&self.pending).insert(key.to_owned(), value.to_owned());
    }

    /// The pending value of a key, or the value of the parent.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<String> {
        if let Some(value) = entries_of(&self.pending).get(key) {
            return Some(value.clone());
        }
        entries_of(&self.parent).get(key).cloned()
    }

    /// Runs `function` with an inner scope over the pending entries of this scope, as [`Store::transaction`] does: the
    /// entries of the inner scope become pending entries of this scope when the function returns.
    pub fn nested<F>(self, function: F) -> Scoped<F>
    where
        F: FnMut(Scope) -> Result<binding_core::Passthrough, Failure<Error>>,
    {
        Scoped::new(self.pending, function)
    }
}

/// The steps of [`Scoped`].
enum Stage {
    /// The scope is not begun.
    Begin,
    /// The scope is begun; the function is not called.
    Call,
    /// The function was called; its result is in `called`.
    Called,
    /// The driver settles the value of the function.
    Settle,
    /// The entries are committed; the machine ends with `outcome`.
    Commit,
    /// The machine ended.
    Ended,
}

/// The state machine of a transaction and of a nested scope (GN-6ab, GN-6ae), which owns its function.
pub struct Scoped<F> {
    scope: Scope,
    function: F,
    stage: Stage,
    called: Option<Result<binding_core::Passthrough, Failure<Error>>>,
    outcome: Option<Result<binding_core::Passthrough, Failure<Error>>>,
    /// Whether the machine writes the entry `audited` of its parent before it ends ([`Store::audited`]).
    audit: bool,
}

impl<F> Scoped<F> {
    fn new(parent: Entries, function: F) -> Self {
        Self {
            scope: Scope {
                parent,
                pending: Entries::default(),
            },
            function,
            stage: Stage::Begin,
            called: None,
            outcome: None,
            audit: false,
        }
    }

    /// Ends with `failure` at once, or, with an audit, after the wait that writes the entry `audited`.
    fn failed(
        &mut self,
        failure: Failure<Error>,
    ) -> binding_core::machine::Step<(), Result<binding_core::Passthrough, Failure<Error>>> {
        if !self.audit {
            self.stage = Stage::Ended;
            return binding_core::machine::Step::Done(Err(failure));
        }
        let parent = self.scope.parent.clone();
        self.outcome = Some(Err(failure));
        self.stage = Stage::Commit;
        binding_core::machine::Step::Io(Box::pin(async move {
            entries_of(&parent).insert(String::from("audited"), String::from("yes"));
        }))
    }

    /// Ends with the failure of an invariant of the machine.
    fn broken(
        &mut self,
        detail: &str,
    ) -> binding_core::machine::Step<(), Result<binding_core::Passthrough, Failure<Error>>> {
        self.stage = Stage::Ended;
        binding_core::machine::Step::Done(Err(Failure::Kind(Error::Internal {
            detail: detail.to_owned(),
        })))
    }
}

impl<F> binding_core::machine::Machine for Scoped<F>
where
    F: FnMut(Scope) -> Result<binding_core::Passthrough, Failure<Error>>,
{
    type Io = ();
    type Done = Result<binding_core::Passthrough, Failure<Error>>;

    fn resume(&mut self, _io: Option<()>) -> binding_core::machine::Step<(), Self::Done> {
        use binding_core::machine::Step;
        match self.stage {
            Stage::Begin => {
                self.stage = Stage::Call;
                Step::Io(Box::pin(async {}))
            }
            Stage::Call => {
                self.stage = Stage::Called;
                Step::Call
            }
            Stage::Called => match self.called.take() {
                Some(Ok(value)) => {
                    self.stage = Stage::Settle;
                    Step::Await(value)
                }
                // The function raised: its pending entries are dropped and its failure ends the scope.
                Some(Err(failure)) => self.failed(failure),
                None => self.broken("the function of the scope was not called"),
            },
            Stage::Settle => match self.outcome.take() {
                Some(Ok(value)) => {
                    let pending = std::mem::take(&mut *entries_of(&self.scope.pending));
                    let parent = self.scope.parent.clone();
                    self.outcome = Some(Ok(value));
                    self.stage = Stage::Commit;
                    let audit = self.audit;
                    Step::Io(Box::pin(async move {
                        let mut entries = entries_of(&parent);
                        entries.extend(pending);
                        if audit {
                            entries.insert(String::from("audited"), String::from("yes"));
                        }
                    }))
                }
                // The awaitable raised: the pending entries are dropped and its exception ends the scope.
                Some(Err(failure)) => self.failed(failure),
                None => self.broken("the value of the function of the scope was not settled"),
            },
            Stage::Commit => match self.outcome.take() {
                Some(done) => {
                    self.stage = Stage::Ended;
                    Step::Done(done)
                }
                None => self.broken("the committed scope has no value"),
            },
            Stage::Ended => self.broken("the scope ended"),
        }
    }

    fn call(&mut self) {
        self.called = Some((self.function)(self.scope.clone()));
    }

    fn settle(&mut self, outcome: Result<binding_core::Passthrough, binding_core::Raised>) {
        self.outcome = Some(outcome.map_err(Failure::Raised));
    }
}

/// The state machine of [`Store::attempt`] (GN-6ab, GN-6ae), which owns its function.
pub struct Attempted<F> {
    scope: Scope,
    function: F,
    begun: bool,
    called: Option<Result<binding_core::Passthrough, Failure<Error>>>,
}

/// Drops a `Raised` on another thread where the target has threads, as a core does that answers a failure on a worker
/// of its own; the binding releases what was thrown all the same (GN-6u).
fn dropped_elsewhere(raised: binding_core::Raised) -> Result<(), Error> {
    #[cfg(not(target_family = "wasm"))]
    {
        std::thread::spawn(move || drop(raised))
            .join()
            .map_err(|_panic| Error::Internal {
                detail: String::from("the drop of a Raised panicked"),
            })
    }
    #[cfg(target_family = "wasm")]
    {
        drop(raised);
        Ok(())
    }
}

impl<F> binding_core::machine::Machine for Attempted<F>
where
    F: FnMut(Scope) -> Result<binding_core::Passthrough, Failure<Error>>,
{
    type Io = ();
    type Done = Result<bool, Failure<Error>>;

    fn resume(&mut self, _io: Option<()>) -> binding_core::machine::Step<(), Self::Done> {
        use binding_core::machine::Step;
        if !self.begun {
            self.begun = true;
            return Step::Io(Box::pin(async {}));
        }
        match self.called.take() {
            None => Step::Call,
            // The value of the function is dropped, which releases it in the table of the binding.
            Some(Ok(value)) => {
                drop(value);
                Step::Done(Ok(true))
            }
            Some(Err(Failure::Raised(raised))) if !entries_of(&self.scope.pending).is_empty() => {
                Step::Done(
                    dropped_elsewhere(raised)
                        .map(|()| false)
                        .map_err(Failure::Kind),
                )
            }
            Some(Err(failure)) => Step::Done(Err(failure)),
        }
    }

    fn call(&mut self) {
        self.called = Some((self.function)(self.scope.clone()));
    }

    /// The machine awaits no value of its function.
    fn settle(&mut self, _outcome: Result<binding_core::Passthrough, binding_core::Raised>) {}
}
