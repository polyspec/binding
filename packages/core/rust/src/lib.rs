//! Runtime support shared by the binding crates that bindgen generates and the core crates they wrap.
//!
//! Every item carries the id of the design rule that defines it. The crate holds no rule of a library: it holds the
//! types through which a generated binding and a core agree on waiting (I-2 (4)), cancellation (T-1 `cancel`),
//! resource cleanup (U-1 `cleanup`), the map of the contract type `map<T>` (T-2), the language exceptions
//! that callbacks raise (U-3), the errors that generated code raises itself (E-1a) and the failure of a core that calls back (E-1c), the name
//! conversion (N-2), and the description of
//! language values in both directions (T-3, B-1).

mod cancel;
mod cleanup;
mod error;
mod failure;
mod host;
mod keyed;
mod map;
pub mod naming;
mod raised;
mod value;
mod wait;

pub use cancel::{cancel_pair, Cancel, CancelGuard, CancelTrigger};
pub use cleanup::Cleanup;
pub use error::{BindingError, Category, Kinds, NumberType, TextCause};
pub use failure::Failure;
pub use host::HostValues;
pub use keyed::{Key, KeyedMap};
pub use map::OrderedMap;
pub use raised::Raised;
pub use value::{
    BytesOut, FloatOut, Handle, HostText, HostValue, IntOut, MapOut, OutValue, Predicate, Prototype, ValueKind,
    ValueType,
};
pub use wait::{Io, ProcessWait};
