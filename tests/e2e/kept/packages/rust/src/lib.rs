//! A sample library for the end-to-end check of binding: data whose objects and references are instances of value
//! classes without `core_type` (GN-6af), which the language keeps and this core only judges.

use binding_core::{
    Failure, FloatOut, Handle, HostText, HostValue, HostValues, Key, KeyedMap, Kinds, OutValue,
    OutValues, ValueKind,
};
use std::collections::BTreeMap;
use std::fmt;

/// The count of a length, which widens: usize is at most 64 bits wide on every target of the workspace.
#[allow(
    clippy::as_conversions,
    reason = "usize is at most 64 bits wide on every target of the workspace, so the conversion is lossless"
)]
const fn widen(length: usize) -> u64 {
    length as u64
}

/// The errors of the library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
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
            Self::Unsupported { .. } => "unsupported",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
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

fn unsupported(what: &str) -> Failure<Error> {
    Failure::Kind(Error::Unsupported {
        what: what.to_owned(),
    })
}

/// One place of data, which names the places that it holds by their numbers.
#[derive(Debug, Clone, PartialEq)]
enum Node {
    Null,
    Bool(bool),
    Float(f64),
    Text(String),
    List(Vec<usize>),
    /// An object: its properties in order. One object of the language is one node (U-7 (d)).
    Object(Vec<(String, usize)>),
    /// A reference to a place that is no reference. One reference of the language is one node (U-7 (d)).
    Reference(usize),
}

/// Data: the null, a boolean, a number, a text, a list, an object with text keys or a reference to data. An object
/// and a reference keep their identity, so data may hold one at two places and may hold itself.
#[derive(Debug, Clone, PartialEq)]
pub struct Data {
    nodes: Vec<Node>,
    root: usize,
}

/// The deepest nesting of data that the library takes.
const MAX_DEPTH: usize = 64;

/// The walk of a language value into the places of data.
struct Walk<'h> {
    host: &'h mut dyn HostValues,
    nodes: Vec<Node>,
    /// U-7 (d): the place of each object of the language, by its handle.
    objects: BTreeMap<u64, usize>,
    /// U-7 (d): the place of each reference of the language, by its handle.
    references: BTreeMap<u64, usize>,
}

impl<'h> Walk<'h> {
    fn new(host: &'h mut dyn HostValues) -> Self {
        Self {
            host,
            nodes: Vec::new(),
            objects: BTreeMap::new(),
            references: BTreeMap::new(),
        }
    }

    fn push(&mut self, node: Node) -> usize {
        self.nodes.push(node);
        self.nodes.len() - 1
    }

    fn set(&mut self, at: usize, node: Node) {
        if let Some(slot) = self.nodes.get_mut(at) {
            *slot = node;
        }
    }

    fn text(text: HostText) -> Result<String, Failure<Error>> {
        match text {
            HostText::Bytes(bytes) => {
                String::from_utf8(bytes).map_err(|_bytes| unsupported("bytes that are no text"))
            }
            HostText::Utf16(units) => {
                String::from_utf16(&units).map_err(|_units| unsupported("an unpaired surrogate"))
            }
            HostText::CodePoints(points) => points
                .into_iter()
                .map(char::from_u32)
                .collect::<Option<String>>()
                .ok_or_else(|| unsupported("an unpaired surrogate")),
        }
    }

    /// The properties of the object at `at`, which the entries of the map of `handle` give.
    fn fill(
        &mut self,
        at: usize,
        handle: Handle,
        len: u64,
        depth: usize,
    ) -> Result<usize, Failure<Error>> {
        let mut entries = Vec::new();
        for index in 0..len {
            let (key, value) = self.host.entry(handle, index).map_err(Failure::Raised)?;
            let HostValue::Text(key) = key else {
                return Err(unsupported("a key that is no text"));
            };
            let key = Self::text(key)?;
            entries.push((key, self.place(value, depth + 1)?));
        }
        self.set(at, Node::Object(entries));
        Ok(at)
    }

    /// The reference at `at` holds the place `held`, which is no reference.
    fn refer(&mut self, at: usize, held: usize) -> Result<usize, Failure<Error>> {
        if held == at || matches!(self.nodes.get(held), Some(Node::Reference(_))) {
            return Err(unsupported("a reference that holds a reference"));
        }
        self.set(at, Node::Reference(held));
        Ok(at)
    }

    /// The place of a language value. An object and a reference take their place before their content, so a value
    /// that holds itself ends at the place that it already has.
    fn place(&mut self, value: HostValue, depth: usize) -> Result<usize, Failure<Error>> {
        if depth > MAX_DEPTH {
            return Err(unsupported("a value nested too deep"));
        }
        match value {
            HostValue::Null => Ok(self.push(Node::Null)),
            HostValue::Bool(value) => Ok(self.push(Node::Bool(value))),
            // U-7: an integer of the language is the float nearest to it, as JSON reads a number.
            #[allow(
                clippy::as_conversions,
                clippy::cast_precision_loss,
                reason = "U-7: data holds every number as a float, the nearest one to an integer"
            )]
            HostValue::Int(value) => Ok(self.push(Node::Float(value as f64))),
            HostValue::Float(value) | HostValue::UntypedNumber(value) => {
                Ok(self.push(Node::Float(value)))
            }
            HostValue::Text(text) => {
                let text = Self::text(text)?;
                Ok(self.push(Node::Text(text)))
            }
            HostValue::List { handle, len }
            | HostValue::PhpArray {
                handle,
                len,
                is_list: true,
            } => {
                let at = self.push(Node::Null);
                let mut items = Vec::new();
                for index in 0..len {
                    let item = self.host.item(handle, index).map_err(Failure::Raised)?;
                    items.push(self.place(item, depth + 1)?);
                }
                self.set(at, Node::List(items));
                Ok(at)
            }
            // GN-6af: an instance of the value class of an object, whose read gives the map that it keeps.
            HostValue::Value {
                kind: ValueKind::Object,
                handle,
            } => {
                if let Some(at) = self.objects.get(&handle.raw()) {
                    return Ok(*at);
                }
                let at = self.push(Node::Null);
                self.objects.insert(handle.raw(), at);
                let HostValue::Map {
                    handle: entries,
                    len,
                } = self.host.read(handle).map_err(Failure::Raised)?
                else {
                    return Err(unsupported("an object whose properties are no map"));
                };
                self.fill(at, entries, len, depth)
            }
            HostValue::StdClass { handle, len } => {
                if let Some(at) = self.objects.get(&handle.raw()) {
                    return Ok(*at);
                }
                let at = self.push(Node::Null);
                self.objects.insert(handle.raw(), at);
                self.fill(at, handle, len, depth)
            }
            // GN-6af: an instance of the value class of a reference, whose read gives the value that it keeps.
            HostValue::Value {
                kind: ValueKind::Reference,
                handle,
            } => {
                if let Some(at) = self.references.get(&handle.raw()) {
                    return Ok(*at);
                }
                let at = self.push(Node::Null);
                self.references.insert(handle.raw(), at);
                let held = self.host.read(handle).map_err(Failure::Raised)?;
                let held = self.place(held, depth + 1)?;
                self.refer(at, held)
            }
            HostValue::PhpReference { identity, target } => {
                if let Some(at) = self.references.get(&identity.raw()) {
                    return Ok(*at);
                }
                let at = self.push(Node::Null);
                self.references.insert(identity.raw(), at);
                let held = self.place(*target, depth + 1)?;
                self.refer(at, held)
            }
            _other => Err(unsupported("a value of another type")),
        }
    }
}

/// The data that a language value describes (U-7 `in`): what is not data is kind `unsupported`.
///
/// # Errors
///
/// Kind `unsupported` for a value that is not data, and the exception that the language raised.
pub fn data_from_host(host: &mut dyn HostValues, value: HostValue) -> Result<Data, Failure<Error>> {
    let mut walk = Walk::new(host);
    let root = walk.place(value, 0)?;
    Ok(Data {
        nodes: walk.nodes,
        root,
    })
}

/// The judgement of the entries that the constructor of the language class `Bag` takes (GN-6af): each key is a text
/// and each value is data. The language object keeps the entries; none is the empty map.
///
/// # Errors
///
/// As [`data_from_host`].
pub fn check_bag(
    host: &mut dyn HostValues,
    entries: Option<KeyedMap<HostValue>>,
) -> Result<(), Failure<Error>> {
    let Some(entries) = entries else {
        return Ok(());
    };
    let mut walk = Walk::new(host);
    for (key, value) in entries {
        let Key::Text(_name) = key else {
            return Err(unsupported("a key that is no text"));
        };
        walk.place(value, 1)?;
    }
    Ok(())
}

/// The judgement of the value that the constructor of the language class `Boxed` takes (GN-6af): data that is no
/// reference. The language object keeps the value; none is null.
///
/// # Errors
///
/// As [`data_from_host`], and kind `unsupported` for a reference.
pub fn check_boxed(
    host: &mut dyn HostValues,
    value: Option<HostValue>,
) -> Result<(), Failure<Error>> {
    let Some(value) = value else {
        return Ok(());
    };
    let mut walk = Walk::new(host);
    let held = walk.place(value, 1)?;
    if matches!(walk.nodes.get(held), Some(Node::Reference(_))) {
        return Err(unsupported("a reference that holds a reference"));
    }
    Ok(())
}

/// The walk of data for a language (U-7 `out`): the handle of a list, an object or a reference is its place plus 1.
pub struct DataOut<'a> {
    data: &'a Data,
}

impl DataOut<'_> {
    fn handle(at: usize) -> Handle {
        Handle::new(widen(at).saturating_add(1))
    }

    fn node(&self, handle: Handle) -> Option<&Node> {
        let at = usize::try_from(handle.raw()).ok()?.checked_sub(1)?;
        self.data.nodes.get(at)
    }

    fn describe(&self, at: usize) -> OutValue {
        match self.data.nodes.get(at) {
            None | Some(Node::Null) => OutValue::Null,
            Some(Node::Bool(value)) => OutValue::Bool(*value),
            Some(Node::Float(value)) => OutValue::Float(FloatOut::new(*value)),
            Some(Node::Text(value)) => OutValue::Text(value.clone()),
            Some(Node::List(items)) => OutValue::List {
                handle: Self::handle(at),
                len: widen(items.len()),
            },
            Some(Node::Object(entries)) => OutValue::Object {
                handle: Self::handle(at),
                len: widen(entries.len()),
            },
            // A reference holds no reference, so this description ends at the place that it holds.
            Some(Node::Reference(held)) => OutValue::Reference {
                handle: Self::handle(at),
                value: Box::new(self.describe(*held)),
            },
        }
    }
}

impl OutValues for DataOut<'_> {
    fn item(&mut self, list: Handle, index: u64) -> OutValue {
        let Some(Node::List(items)) = self.node(list) else {
            return OutValue::Null;
        };
        match usize::try_from(index).ok().and_then(|at| items.get(at)) {
            Some(item) => self.describe(*item),
            None => OutValue::Null,
        }
    }

    fn entry(&mut self, map: Handle, index: u64) -> (OutValue, OutValue) {
        let Some(Node::Object(entries)) = self.node(map) else {
            return (OutValue::Null, OutValue::Null);
        };
        match usize::try_from(index).ok().and_then(|at| entries.get(at)) {
            Some((key, value)) => (OutValue::Text(key.clone()), self.describe(*value)),
            None => (OutValue::Null, OutValue::Null),
        }
    }
}

/// The root of data and the walk of its places (U-7 `out`).
#[must_use]
pub fn data_to_out(value: &Data) -> (OutValue, DataOut<'_>) {
    let out = DataOut { data: value };
    (out.describe(value.root), out)
}

/// The data itself: every object and reference keeps its places.
#[must_use]
pub fn echo(value: &Data) -> Data {
    value.clone()
}

/// The count of the objects and of the references of data, each counted once whatever the count of its places.
#[must_use]
pub fn count(value: &Data) -> u64 {
    widen(
        value
            .nodes
            .iter()
            .filter(|node| matches!(node, Node::Object(_) | Node::Reference(_)))
            .count(),
    )
}
