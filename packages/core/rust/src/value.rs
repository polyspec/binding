//! The closed description types of language values (design T-2 `host_value`, T-3, U-1 `value`, plan B-1).
//!
//! A value that enters a core is described one level at a time as a [`HostValue`]: a container gives its kind, its
//! length and a [`Handle`], and the core asks for each child through the handle. A value that leaves a core is
//! described as an [`OutValue`] in the same way. Neither description judges: the generated code names what the
//! language value is, and the core that receives it decides what it accepts (B-1). The predicates of an `OutValue`
//! (U-1 `when`) are computed here, in Rust, so the generated code selects a row of the `out` table without judging.

/// An opaque reference to a language value or a core value that the side holding it resolves (B-1, T-3).
///
/// The number means something only to the side that made it: a binding's table of language objects for a
/// [`HostValue`], a core's table of children for an [`OutValue`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Handle(u64);

impl Handle {
    /// Wraps the number that the making side chose.
    #[must_use]
    pub const fn new(raw: u64) -> Self {
        Self(raw)
    }

    /// The number that the making side chose.
    #[must_use]
    pub const fn raw(self) -> u64 {
        self.0
    }
}

/// The kind of a value in the `out` and `in` tables of a `value` unit (U-1), the closed set that both
/// [`OutValue::kind`] and the contract check use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ValueKind {
    /// No value.
    Null,
    /// A boolean.
    Bool,
    /// An integer of the contract type `int` (T-1): a JavaScript `number`, so it is a safe integer.
    Int,
    /// An integer of the contract type `int64` (T-1): a JavaScript `bigint`.
    Int64,
    /// A binary64 floating point number.
    Float,
    /// A number kept as its literal token (F-1 (a)).
    Number,
    /// A Unicode text.
    Text,
    /// A byte string (F-1 (c)).
    Bytes,
    /// A sequence of values.
    List,
    /// An ordered map with text keys or the keys of a PHP array.
    Map,
    /// An object with named properties, such as PHP `stdClass` (F-1 (c)).
    Object,
    /// A PHP reference (`&`) that several places share (F-1 (c), U-7 (c)).
    Reference,
    /// A text that is already escaped (F-1 (b), VAL-6).
    SafeText,
    /// A language object that passes through the core unopened (F-1 (b), VAL-18).
    Native,
    /// A value of the value type of another repository, made by that repository's binding (U-1 `nested:<type>`).
    Nested(ValueType),
}

/// A value type that one repository owns and another nests (T-3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ValueType {
    /// `json_value` (F-1 (a)).
    Json,
    /// `template_value` (F-1 (b)).
    Template,
    /// `php_value` (F-1 (c)).
    Php,
}

impl ValueType {
    /// Every value type.
    pub const ALL: [Self; 3] = [Self::Json, Self::Template, Self::Php];

    /// The contract name of the value type.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Json => "json_value",
            Self::Template => "template_value",
            Self::Php => "php_value",
        }
    }
}

impl ValueKind {
    /// Every kind, in declaration order.
    pub const ALL: [Self; 17] = [
        Self::Null,
        Self::Bool,
        Self::Int,
        Self::Int64,
        Self::Float,
        Self::Number,
        Self::Text,
        Self::Bytes,
        Self::List,
        Self::Map,
        Self::Object,
        Self::Reference,
        Self::SafeText,
        Self::Native,
        Self::Nested(ValueType::Json),
        Self::Nested(ValueType::Template),
        Self::Nested(ValueType::Php),
    ];

    /// The name that contracts use.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Null => "null",
            Self::Bool => "bool",
            Self::Int => "int",
            Self::Int64 => "int64",
            Self::Float => "float",
            Self::Number => "number",
            Self::Text => "text",
            Self::Bytes => "bytes",
            Self::List => "list",
            Self::Map => "map",
            Self::Object => "object",
            Self::Reference => "reference",
            Self::SafeText => "safe_text",
            Self::Native => "native",
            Self::Nested(ValueType::Json) => "nested:json_value",
            Self::Nested(ValueType::Template) => "nested:template_value",
            Self::Nested(ValueType::Php) => "nested:php_value",
        }
    }
}

/// A predicate of an [`OutValue`] that a row of the `out` table may select on (U-1 `when`). Each applies to one kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Predicate {
    /// Bytes that are valid UTF-8.
    Utf8,
    /// A map whose keys are the integers 0 to n-1 in order.
    SequenceKeys,
    /// An integer from -(2^53 - 1) to 2^53 - 1, which a JavaScript number holds exactly.
    SafeInteger,
    /// A finite float with no fractional part, which a JavaScript number cannot tell from an integer.
    IntegralFloat,
}

impl Predicate {
    /// Every predicate, in declaration order.
    pub const ALL: [Self; 4] = [Self::Utf8, Self::SequenceKeys, Self::SafeInteger, Self::IntegralFloat];

    /// The name that contracts use.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Utf8 => "utf8",
            Self::SequenceKeys => "sequence_keys",
            Self::SafeInteger => "safe_integer",
            Self::IntegralFloat => "integral_float",
        }
    }

    /// The kind that the predicate applies to.
    #[must_use]
    pub const fn kind(self) -> ValueKind {
        match self {
            Self::Utf8 => ValueKind::Bytes,
            Self::SequenceKeys => ValueKind::Map,
            Self::SafeInteger => ValueKind::Int,
            Self::IntegralFloat => ValueKind::Float,
        }
    }
}

const MAX_SAFE_INTEGER: i64 = (1_i64 << 53) - 1;

/// An outgoing integer with its predicate `safe_integer`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IntOut {
    value: i64,
}

impl IntOut {
    /// Wraps an integer.
    #[must_use]
    pub const fn new(value: i64) -> Self {
        Self { value }
    }

    /// The integer.
    #[must_use]
    pub const fn value(self) -> i64 {
        self.value
    }

    /// Whether a JavaScript number holds the integer exactly.
    #[must_use]
    pub const fn safe_integer(self) -> bool {
        -MAX_SAFE_INTEGER <= self.value && self.value <= MAX_SAFE_INTEGER
    }
}

/// An outgoing float with its predicate `integral_float`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FloatOut {
    value: f64,
}

impl FloatOut {
    /// Wraps a float, NaN and the infinities included.
    #[must_use]
    pub const fn new(value: f64) -> Self {
        Self { value }
    }

    /// The float.
    #[must_use]
    pub const fn value(self) -> f64 {
        self.value
    }

    /// Whether the float is finite and has no fractional part; `-0.0` is integral.
    #[must_use]
    pub fn integral_float(self) -> bool {
        self.value.is_finite() && self.value.fract() == 0.0
    }
}

/// An outgoing byte string with its predicate `utf8`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BytesOut {
    value: Vec<u8>,
    utf8: bool,
}

impl BytesOut {
    /// Wraps a byte string and records whether it is UTF-8.
    #[must_use]
    pub fn new(value: Vec<u8>) -> Self {
        let utf8 = std::str::from_utf8(&value).is_ok();
        Self { value, utf8 }
    }

    /// The bytes.
    #[must_use]
    pub fn value(&self) -> &[u8] {
        &self.value
    }

    /// Takes the bytes.
    #[must_use]
    pub fn into_value(self) -> Vec<u8> {
        self.value
    }

    /// Whether the bytes are valid UTF-8.
    #[must_use]
    pub const fn utf8(&self) -> bool {
        self.utf8
    }
}

/// An outgoing map with its predicate `sequence_keys`, which the core states because only it sees the keys.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MapOut {
    handle: Handle,
    len: u64,
    sequence_keys: bool,
}

impl MapOut {
    /// Describes a map by its handle, its number of entries and whether its keys are 0 to n-1 in order.
    #[must_use]
    pub const fn new(handle: Handle, len: u64, sequence_keys: bool) -> Self {
        Self {
            handle,
            len,
            sequence_keys,
        }
    }

    /// The handle through which the generated code asks for each entry.
    #[must_use]
    pub const fn handle(self) -> Handle {
        self.handle
    }

    /// The number of entries.
    #[must_use]
    pub const fn len(self) -> u64 {
        self.len
    }

    /// Whether the map has no entry.
    #[must_use]
    pub const fn is_empty(self) -> bool {
        self.len == 0
    }

    /// Whether the keys are the integers 0 to n-1 in order.
    #[must_use]
    pub const fn sequence_keys(self) -> bool {
        self.sequence_keys
    }
}

/// One level of a value that leaves a core (T-3). The generated code makes the language value from the `out` table of
/// the value unit, selecting a row by [`OutValue::kind`] and [`OutValue::predicate`].
///
/// One handle is one language object: the generated code makes a container once, before its children, and gives
/// every later occurrence of the same handle that object, so shared and cyclic values leave the core as they are
/// (U-7 (d)).
#[derive(Debug, Clone, PartialEq)]
pub enum OutValue {
    /// Kind `null`.
    Null,
    /// Kind `bool`.
    Bool(bool),
    /// Kind `int`.
    Int(IntOut),
    /// Kind `int64`.
    Int64(i64),
    /// Kind `float`.
    Float(FloatOut),
    /// Kind `number`: the literal token of a number (F-1 (a)).
    Number(String),
    /// Kind `text`.
    Text(String),
    /// Kind `bytes`.
    Bytes(BytesOut),
    /// Kind `list`: the children are asked for through the handle.
    List {
        /// The handle of the list.
        handle: Handle,
        /// The number of items.
        len: u64,
    },
    /// Kind `map`.
    Map(MapOut),
    /// Kind `object`: the properties are asked for through the handle.
    Object {
        /// The handle of the object.
        handle: Handle,
        /// The number of properties.
        len: u64,
    },
    /// Kind `reference`: a reference that every place holding this handle shares.
    Reference {
        /// The handle of the reference.
        handle: Handle,
        /// The value it holds.
        value: Box<OutValue>,
    },
    /// Kind `safe_text`.
    SafeText(String),
    /// Kind `native`: the language object that entered as this handle goes back unchanged.
    Native(Handle),
    /// Kind `nested:<value type>`: a value of another repository's value type, which that repository's binding makes
    /// from its own `out` table (U-1).
    Nested {
        /// The value type.
        value_type: ValueType,
        /// The value, described by the owning repository's core.
        value: Box<OutValue>,
    },
}

impl OutValue {
    /// The kind of the value.
    #[must_use]
    pub const fn kind(&self) -> ValueKind {
        match self {
            Self::Null => ValueKind::Null,
            Self::Bool(_) => ValueKind::Bool,
            Self::Int(_) => ValueKind::Int,
            Self::Int64(_) => ValueKind::Int64,
            Self::Float(_) => ValueKind::Float,
            Self::Number(_) => ValueKind::Number,
            Self::Text(_) => ValueKind::Text,
            Self::Bytes(_) => ValueKind::Bytes,
            Self::List { .. } => ValueKind::List,
            Self::Map(_) => ValueKind::Map,
            Self::Object { .. } => ValueKind::Object,
            Self::Reference { .. } => ValueKind::Reference,
            Self::SafeText(_) => ValueKind::SafeText,
            Self::Native(_) => ValueKind::Native,
            Self::Nested { value_type, .. } => ValueKind::Nested(*value_type),
        }
    }

    /// The value of a predicate, or `None` when the predicate does not apply to the kind of the value (U-1 `when`).
    #[must_use]
    pub fn predicate(&self, predicate: Predicate) -> Option<bool> {
        match (self, predicate) {
            (Self::Int(int), Predicate::SafeInteger) => Some(int.safe_integer()),
            (Self::Float(float), Predicate::IntegralFloat) => Some(float.integral_float()),
            (Self::Bytes(bytes), Predicate::Utf8) => Some(bytes.utf8()),
            (Self::Map(map), Predicate::SequenceKeys) => Some(map.sequence_keys()),
            (_, Predicate::SafeInteger | Predicate::IntegralFloat | Predicate::Utf8 | Predicate::SequenceKeys) => None,
        }
    }
}

/// The units of a language string, kept as the language holds them so that the core judges them (B-1, B-3).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostText {
    /// A PHP or Go string: bytes that may or may not be UTF-8.
    Bytes(Vec<u8>),
    /// A JavaScript string: UTF-16 code units, unpaired surrogates included.
    Utf16(Vec<u16>),
    /// A Python `str`: code points, surrogates included.
    CodePoints(Vec<u32>),
}

/// The prototype of a JavaScript plain object.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Prototype {
    /// `Object.prototype`.
    Object,
    /// `null`, as from `Object.create(null)`.
    Null,
}

/// One level of a language value that enters a core (B-1, T-3).
///
/// The set is closed: a language value outside it is [`HostValue::Other`] with its type name and a handle, never left
/// out and never refused by the binding. A container gives its handle and length, and the core asks for each child
/// through the handle; the order of the walk, the depth limit and cycles are the core's rules.
#[derive(Debug, Clone, PartialEq)]
pub enum HostValue {
    /// PHP `null`, JavaScript `null`, Python `None`, Go `nil`.
    Null,
    /// JavaScript `undefined`.
    Undefined,
    /// A boolean of any language; a Python `bool` is this and never an integer.
    Bool(bool),
    /// PHP `IS_LONG`, a Python `int` (exactly, not a subclass) in the range of `i64`, a JavaScript `bigint` in the range
    /// of `i64`, a Go integer.
    Int(i64),
    /// A Python `int` (exactly) or a JavaScript `bigint` outside the range of `i64`, as its decimal token, without loss.
    /// Whether it is accepted is the core's rule (B-1).
    Number(String),
    /// PHP `IS_DOUBLE`, a Python `float` (exactly), a Go float: a float of a language that has integers apart, which
    /// stays a float whatever its value; the core does not make it an integer (U-7 (f)).
    Float(f64),
    /// A JavaScript number: a number of a language with one number type for integers and floats. Whether it is an
    /// integer is the core's rule (U-7 (f)).
    UntypedNumber(f64),
    /// A string of any language, in its own units.
    Text(HostText),
    /// A Python `bytes` (exactly).
    Bytes(Vec<u8>),
    /// A JavaScript `Array`, a Python `list`, a Go slice.
    List {
        /// The handle of the list.
        handle: Handle,
        /// The number of items.
        len: u64,
    },
    /// A PHP array, with whether its keys are 0 to n-1 in order (`array_is_list`).
    PhpArray {
        /// The handle of the array.
        handle: Handle,
        /// The number of entries.
        len: u64,
        /// Whether `array_is_list` holds.
        is_list: bool,
    },
    /// A JavaScript `Map`, a Python `dict` (exactly), a Go map.
    Map {
        /// The handle of the map.
        handle: Handle,
        /// The number of entries.
        len: u64,
    },
    /// A JavaScript object whose prototype is `Object.prototype` or `null`.
    PlainObject {
        /// The handle of the object.
        handle: Handle,
        /// The number of own enumerable string keys.
        len: u64,
        /// The prototype.
        prototype: Prototype,
    },
    /// An element of a PHP array that is a reference (`&`), with the identity of the reference, so that elements that
    /// share one reference share one identity (U-7 (g)).
    PhpReference {
        /// The identity of the reference.
        identity: Handle,
        /// The value the reference holds.
        target: Box<HostValue>,
    },
    /// A PHP `stdClass`.
    StdClass {
        /// The handle of the object.
        handle: Handle,
        /// The number of properties.
        len: u64,
    },
    /// A JavaScript `Date`.
    Date(Handle),
    /// A JavaScript function, a PHP `Closure`, a Python function or method.
    Callable(Handle),
    /// An instance of a class of the language or of the application.
    Object {
        /// The handle of the object.
        handle: Handle,
        /// The class name as the language reports it.
        type_name: String,
        /// Whether a PHP object implements `JsonSerializable`; false in other languages.
        json_serializable: bool,
    },
    /// An instance of a `value` unit's language class, classified by the `in` table of that unit (U-1).
    Value {
        /// The kind that the `in` table gives.
        kind: ValueKind,
        /// The handle of the object.
        handle: Handle,
    },
    /// Any value outside the closed set: a PHP resource, a JavaScript `Symbol`, `BigInt` or typed array, a Python
    /// subclass of `int`, `str` or `bytes`.
    Other {
        /// The type name as the language reports it.
        type_name: String,
        /// The handle of the value.
        handle: Handle,
    },
}

#[cfg(test)]
mod tests {
    use super::{
        BytesOut, FloatOut, Handle, IntOut, MapOut, OutValue, Predicate, ValueKind, ValueType, MAX_SAFE_INTEGER,
    };

    #[test]
    fn safe_integer_is_the_exact_range_of_a_javascript_number() {
        assert!(IntOut::new(MAX_SAFE_INTEGER).safe_integer());
        assert!(IntOut::new(-MAX_SAFE_INTEGER).safe_integer());
        assert!(!IntOut::new(MAX_SAFE_INTEGER + 1).safe_integer());
        assert!(!IntOut::new(-MAX_SAFE_INTEGER - 1).safe_integer());
        assert!(!IntOut::new(i64::MIN).safe_integer());
    }

    #[test]
    fn integral_float_is_finite_without_a_fraction() {
        assert!(FloatOut::new(1.0).integral_float());
        assert!(FloatOut::new(-0.0).integral_float());
        assert!(!FloatOut::new(1.5).integral_float());
        assert!(!FloatOut::new(f64::NAN).integral_float());
        assert!(!FloatOut::new(f64::INFINITY).integral_float());
    }

    #[test]
    fn utf8_is_computed_from_the_bytes() {
        assert!(BytesOut::new(b"caf\xc3\xa9".to_vec()).utf8());
        assert!(!BytesOut::new(b"caf\xe9".to_vec()).utf8());
    }

    #[test]
    fn each_predicate_applies_to_its_kind_only() {
        let values = [
            OutValue::Int(IntOut::new(1)),
            OutValue::Float(FloatOut::new(1.0)),
            OutValue::Bytes(BytesOut::new(vec![0x61])),
            OutValue::Map(MapOut::new(Handle::new(1), 0, true)),
            OutValue::Text(String::from("a")),
        ];
        for value in &values {
            for predicate in Predicate::ALL {
                let applies = predicate.kind() == value.kind();
                assert_eq!(
                    value.predicate(predicate).is_some(),
                    applies,
                    "{:?} {:?}",
                    value.kind(),
                    predicate
                );
            }
        }
        assert_eq!(values[3].predicate(Predicate::SequenceKeys), Some(true));
    }

    #[test]
    fn kinds_and_predicates_have_distinct_names() {
        let mut names: Vec<&str> = ValueKind::ALL.iter().map(|k| k.as_str()).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), ValueKind::ALL.len());
        let mut names: Vec<&str> = Predicate::ALL.iter().map(|p| p.as_str()).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), Predicate::ALL.len());
    }

    #[test]
    fn a_nested_value_has_the_kind_of_its_value_type() {
        let nested = OutValue::Nested {
            value_type: ValueType::Json,
            value: Box::new(OutValue::Null),
        };
        assert_eq!(nested.kind(), ValueKind::Nested(ValueType::Json));
        assert_eq!(nested.kind().as_str(), "nested:json_value");
        assert_eq!(OutValue::Int64(1).kind().as_str(), "int64");
    }

    #[test]
    fn a_text_of_code_units_keeps_its_unpaired_surrogates() {
        // B2.81: the units of "\ud800", "\udc00", a paired pair and a text that mixes them leave as they are.
        for units in [
            vec![0xd800],
            vec![0xdc00],
            vec![0xd83d, 0xde00],
            vec![0x61, 0xdc00, 0xd83d, 0xde00, 0xd800],
        ] {
            let value = OutValue::Text16(units.clone());
            assert_eq!(value.kind(), ValueKind::Text16);
            assert_eq!(value, OutValue::Text16(units));
        }
        assert_eq!(ValueKind::Text16.as_str(), "text16");
        assert!(ValueKind::ALL.contains(&ValueKind::Text16));
        assert_eq!(OutValue::Text16(vec![0xd800]).predicate(Predicate::Utf8), None);
    }

    #[test]
    fn a_handle_keeps_its_number() {
        assert_eq!(Handle::new(42).raw(), 42);
    }
}
