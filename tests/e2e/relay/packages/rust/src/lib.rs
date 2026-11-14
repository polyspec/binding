//! A sample library for the end-to-end check of binding (B2.87): its one function takes and gives the value class of
//! json, so a json value enters a core through `polyspec_json::value_in` and leaves through `polyspec_json::value_out`
//! in every language (GN-6x).

use polyspec_json::Value;

/// The value, unchanged: the binding converts it in and out, and the comparison of the two is the check.
#[must_use]
pub fn carry(value: &Value) -> Value {
    value.clone()
}

/// A packet of json values (T-9, GN-6v: a variant whose cases hold the value class of json, a unit of another
/// repository, as a field and in a list).
#[derive(Debug, Clone)]
pub enum Packet {
    /// One value.
    One {
        /// The value.
        value: Value,
    },
    /// Values in order.
    Many {
        /// The values.
        values: Vec<Value>,
    },
}

/// The packet, unchanged: the binding converts each value of a case in and out.
#[must_use]
pub fn passed(packet: &Packet) -> Packet {
    packet.clone()
}

/// The number of the values of the packet.
#[must_use]
pub fn count(packet: &Packet) -> u64 {
    match packet {
        Packet::One { .. } => 1,
        Packet::Many { values } => values
            .iter()
            .fold(0, |count: u64, _value| count.saturating_add(1)),
    }
}

/// The number of the members of an object, and 0 for a value of another kind; a value that the caller leaves out is
/// the empty object (U-2 `{empty: "object"}`, B2.172).
#[must_use]
pub fn width(value: Option<&Value>) -> u64 {
    match value.map(Value::members) {
        Some(Ok(members)) => members.len(),
        Some(Err(_)) | None => 0,
    }
}
