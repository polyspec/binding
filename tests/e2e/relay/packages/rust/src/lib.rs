//! A sample library for the end-to-end check of binding (B2.87): its one function takes and gives the value class of
//! json, so a json value enters a core through `polyspec_json::value_in` and leaves through `polyspec_json::value_out`
//! in every language (GN-6x).

use polyspec_json::Value;

/// The value, unchanged: the binding converts it in and out, and the comparison of the two is the check.
#[must_use]
pub fn carry(value: &Value) -> Value {
    value.clone()
}
