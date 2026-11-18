//! A sample library for the end-to-end check of binding: a value alias, quantity, whose Go out row of a float makes an
//! instance of the value class ratio, which has core_type. Its results give such an instance back inside a map, inside
//! a record and bare, and the generated Go tests compare them by what the instances hold (GN-13e, B2.543).

use binding_core::{
    Failure, FloatOut, Handle, HostText, HostValue, HostValues, Kinds, MapOut, OutValue,
    OutValues, ValueKind,
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

/// The errors of the library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// A language value that is not a quantity.
    Unsupported {
        /// What the value is.
        what: String,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unsupported { what } => write!(f, "not a quantity: {what}"),
        }
    }
}

impl std::error::Error for Error {}

impl Kinds for Error {
    fn kind(&self) -> &'static str {
        match self {
            Self::Unsupported { .. } => "unsupported",
        }
    }

    fn status(&self) -> Option<u16> {
        None
    }

    fn errno(&self) -> Option<i32> {
        None
    }
}

/// A value of a quantity: the null, a number, a text, a list or a map with text keys (U-7: a value alias whose core
/// judges the language values and gives its own).
#[derive(Debug, Clone, PartialEq)]
pub enum Quantity {
    /// No value.
    Null,
    /// A number, which Go gives as an instance of ratio.
    Float(f64),
    /// A text.
    Text(String),
    /// A list.
    List(Vec<Quantity>),
    /// A map with text keys, in order.
    Map(Vec<(String, Quantity)>),
}

/// The deepest nesting of a quantity that the library takes.
const MAX_DEPTH: usize = 64;

/// The failure of a value that is not a quantity.
fn unsupported(what: &str) -> Failure<Error> {
    Failure::Kind(Error::Unsupported {
        what: what.to_owned(),
    })
}

/// The quantity that a language value describes (U-7 `in`): what is not a quantity is kind `unsupported`.
///
/// # Errors
///
/// Kind `unsupported` for a value that is not a quantity, and the exception that the language raised.
pub fn quantity_from_host(
    host: &mut dyn HostValues,
    value: HostValue,
) -> Result<Quantity, Failure<Error>> {
    quantity_at(host, value, 0)
}

fn quantity_at(
    host: &mut dyn HostValues,
    value: HostValue,
    depth: usize,
) -> Result<Quantity, Failure<Error>> {
    if depth > MAX_DEPTH {
        return Err(unsupported("a value nested too deep"));
    }
    match value {
        HostValue::Null => Ok(Quantity::Null),
        #[allow(
            clippy::as_conversions,
            clippy::cast_precision_loss,
            reason = "U-7: a quantity holds every number as a float, the nearest one to an integer"
        )]
        HostValue::Int(value) => Ok(Quantity::Float(value as f64)),
        HostValue::Float(value) | HostValue::UntypedNumber(value) => Ok(Quantity::Float(value)),
        HostValue::Text(text) => match text {
            HostText::Bytes(bytes) => String::from_utf8(bytes)
                .map(Quantity::Text)
                .map_err(|_bytes| unsupported("bytes that are no text")),
            HostText::Utf16(units) => String::from_utf16(&units)
                .map(Quantity::Text)
                .map_err(|_units| unsupported("an unpaired surrogate")),
            HostText::CodePoints(points) => points
                .into_iter()
                .map(char::from_u32)
                .collect::<Option<String>>()
                .map(Quantity::Text)
                .ok_or_else(|| unsupported("an unpaired surrogate")),
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
                items.push(quantity_at(host, item, depth + 1)?);
            }
            Ok(Quantity::List(items))
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
                let Quantity::Text(key) = quantity_at(host, key, depth + 1)? else {
                    return Err(unsupported("a key that is no text"));
                };
                entries.push((key, quantity_at(host, value, depth + 1)?));
            }
            Ok(Quantity::Map(entries))
        }
        // GN-6ar: an instance of ratio gives its float when it is read.
        HostValue::Value {
            kind: ValueKind::Float,
            handle,
        } => match host.read(handle).map_err(Failure::Raised)? {
            HostValue::Float(value) | HostValue::UntypedNumber(value) => Ok(Quantity::Float(value)),
            _other => Err(unsupported("a ratio whose value is no float")),
        },
        other => Err(Failure::Kind(Error::Unsupported {
            what: format!("{other:?}"),
        })),
    }
}

/// A float that a class of the language holds (GN-6ar): the class ratio.
#[derive(Debug, Clone, PartialEq)]
pub struct Ratio {
    value: f64,
}

impl Ratio {
    /// The ratio of a float.
    #[must_use]
    pub fn new(value: f64) -> Self {
        Self { value }
    }

    /// The float of the ratio.
    #[must_use]
    pub fn value(&self) -> f64 {
        self.value
    }
}

/// The language form of a quantity (U-7 `out`): the root and the children of its containers by their handles.
pub struct QuantityOut<'a> {
    held: Vec<&'a Quantity>,
}

impl<'a> QuantityOut<'a> {
    fn describe(&mut self, value: &'a Quantity) -> OutValue {
        match value {
            Quantity::Null => OutValue::Null,
            Quantity::Float(value) => OutValue::Float(FloatOut::new(*value)),
            Quantity::Text(value) => OutValue::Text(value.clone()),
            Quantity::List(items) => {
                self.held.push(value);
                OutValue::List {
                    handle: Handle::new(widen(self.held.len() - 1)),
                    len: widen(items.len()),
                }
            }
            Quantity::Map(entries) => {
                self.held.push(value);
                OutValue::Map(MapOut::new(
                    Handle::new(widen(self.held.len() - 1)),
                    widen(entries.len()),
                    false,
                ))
            }
        }
    }
}

impl OutValues for QuantityOut<'_> {
    fn item(&mut self, list: Handle, index: u64) -> OutValue {
        let held = usize::try_from(list.raw())
            .ok()
            .and_then(|at| self.held.get(at))
            .copied();
        match held {
            Some(Quantity::List(items)) => {
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
            Some(Quantity::Map(entries)) => {
                match usize::try_from(index).ok().and_then(|at| entries.get(at)) {
                    Some((key, value)) => (OutValue::Text(key.clone()), self.describe(value)),
                    None => (OutValue::Null, OutValue::Null),
                }
            }
            _ => (OutValue::Null, OutValue::Null),
        }
    }
}

/// The language form of a quantity (U-7 `out`).
#[must_use]
pub fn quantity_to_out(value: &Quantity) -> (OutValue, QuantityOut<'_>) {
    let mut out = QuantityOut { held: Vec::new() };
    let root = out.describe(value);
    (root, out)
}

/// A record that holds a quantity in a field.
#[derive(Debug, Clone, PartialEq)]
pub struct Holder {
    /// The quantity.
    pub qty: Quantity,
}

/// The quantity itself, which crosses the boundary in and out.
#[must_use]
pub fn echo(value: &Quantity) -> Quantity {
    value.clone()
}

/// The record itself, whose field crosses the boundary in and out.
#[must_use]
pub fn hold(holder: &Holder) -> Holder {
    holder.clone()
}

#[cfg(test)]
mod tests {
    use super::{echo, hold, Holder, Quantity, Ratio};

    #[test]
    fn a_quantity_and_a_holder_come_back() {
        let map = Quantity::List(vec![Quantity::Map(vec![(
            String::from("qty"),
            Quantity::Float(1.5),
        )])]);
        assert_eq!(echo(&map), map);
        let holder = Holder {
            qty: Quantity::Float(1.5),
        };
        assert_eq!(hold(&holder), holder);
        assert!((Ratio::new(1.5).value() - 1.5).abs() < f64::EPSILON);
    }
}
