//! Errors that generated code raises itself, their categories, and the kind interface of every error (design E-1,
//! E-1a, E-3, plan F-2, F-3).

use std::fmt;

/// The category of an error (design E-1, plan F-3): it selects the base class of each language (E-2) and the
/// `category` of a contract case's `raises`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Category {
    /// A value outside what the operation accepts.
    Value,
    /// A wrong use of the API: a type, a construction or a call order.
    Type,
    /// An operating system I/O failure.
    Io,
    /// A failure of a store that a callback implements.
    Store,
    /// A call that overlaps another call on the same object (B-5c).
    Busy,
    /// A broken invariant of the core or the binding, a panic included (B-7).
    Internal,
}

impl Category {
    /// Every category, in the order of design E-1.
    pub const ALL: [Self; 6] = [
        Self::Value,
        Self::Type,
        Self::Io,
        Self::Store,
        Self::Busy,
        Self::Internal,
    ];

    /// The name that contracts and contract cases use (E-1).
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Value => "value",
            Self::Type => "type",
            Self::Io => "io",
            Self::Store => "store",
            Self::Busy => "busy",
            Self::Internal => "internal",
        }
    }
}

impl fmt::Display for Category {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The kind interface of an error (plan F-2, design E-3): a kind string that never changes for a variant, the HTTP
/// status where the variant has one, and the OS error number of an I/O failure.
///
/// Every core error enum implements it, and so does [`BindingError`]. Generated code reads the three values from it
/// and exposes them in the one form of each language (E-3); it writes no kind, status or errno of its own (I-2 (3)).
/// Each method is required, so an error type states the absence of a status or an errno explicitly.
pub trait Kinds {
    /// The kind string of the variant, such as `invalid_number`.
    fn kind(&self) -> &'static str;
    /// The HTTP status of the variant, or `None` when the variant has none.
    fn status(&self) -> Option<u16>;
    /// The OS error number of an I/O failure, or `None` for every other variant.
    fn errno(&self) -> Option<i32>;
}

/// The contract type whose number rule an argument broke (B-2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NumberType {
    /// Contract `int`.
    Int,
    /// Contract `int64`.
    Int64,
    /// Contract `uint`.
    Uint,
    /// Contract `float`.
    Float,
}

impl NumberType {
    /// The contract name of the type (T-1).
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Int => "int",
            Self::Int64 => "int64",
            Self::Uint => "uint",
            Self::Float => "float",
        }
    }
}

/// The text rule that an argument broke (B-3).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextCause {
    /// A JavaScript or Python string held an unpaired surrogate.
    UnpairedSurrogate,
    /// A byte string that must be UTF-8 was not.
    NotUtf8,
    /// A `latin1` text held a character above U+00FF (T-1 `latin1`).
    AboveLatin1,
}

impl TextCause {
    const fn describe(self) -> &'static str {
        match self {
            Self::UnpairedSurrogate => "holds an unpaired surrogate",
            Self::NotUtf8 => "is not UTF-8",
            Self::AboveLatin1 => "holds a character above U+00FF",
        }
    }
}

/// An error that generated code raises itself, never a core (design E-1a).
///
/// Its kind and category are fixed by binding; its message is its `Display`, to which a binding adds nothing (E-4).
/// A `subject` or `class` is the name that the caller sees in its own language, which the generated code passes.
#[derive(Debug, Clone, PartialEq)]
pub enum BindingError {
    /// An argument broke the number rule of its contract type (B-2). Kind `invalid_number`, category `value`.
    InvalidNumber {
        /// The parameter or field.
        subject: String,
        /// The contract type of the parameter or field.
        expected: NumberType,
    },
    /// A text argument broke a text rule (B-3). Kind `invalid_text`, category `value`.
    InvalidText {
        /// The parameter or field.
        subject: String,
        /// The rule that it broke.
        cause: TextCause,
    },
    /// A path argument has no OS byte form (B-3), such as a Python `str` that `os.fsencode` refuses. Kind
    /// `invalid_path`, category `value`.
    InvalidPath {
        /// The parameter or field.
        subject: String,
    },
    /// A class without a public constructor was constructed (U-1 `constructible: false`). Kind
    /// `direct_construction`, category `type`.
    DirectConstruction {
        /// The class.
        class: String,
    },
    /// A callback object or function does not provide a declared member, or it is not callable (U-3). Kind
    /// `invalid_callback`, category `type`.
    InvalidCallback {
        /// The parameter that received the callback.
        subject: String,
        /// The missing or uncallable member, or the function itself.
        member: String,
    },
    /// An argument of a unit-typed parameter is not an object of that unit (E-1a). Kind `invalid_argument_type`,
    /// category `type`.
    InvalidArgumentType {
        /// The parameter or field.
        subject: String,
        /// The language class that the parameter takes.
        expected: String,
    },
    /// A call reached an object that a `self` member already consumed (E-1a). Kind `consumed`, category `type`.
    Consumed {
        /// The class of the consumed object.
        class: String,
    },
    /// A call overlapped an unfinished call or re-entered the object from a callback (B-5c). Kind `busy`, category
    /// `busy`.
    Busy {
        /// The class of the busy object.
        class: String,
    },
    /// A callback or native object with `thread: owner` was called from another thread (U-3, B-5b). Kind
    /// `wrong_thread`, category `busy`.
    WrongThread {
        /// The callback unit or the object.
        subject: String,
    },
    /// A panic, a poisoned object or a core value outside the range of its language type (B-2, B-7, U-2). Kind
    /// `internal`, category `internal`.
    Internal {
        /// What broke, such as the panic message.
        detail: String,
    },
}

impl BindingError {
    /// Every kind of this enum with its fixed category (E-1a), the table from which the kind to category table of
    /// contract cases is generated (F-3).
    pub const KINDS: [(&'static str, Category); 10] = [
        ("invalid_number", Category::Value),
        ("invalid_text", Category::Value),
        ("invalid_path", Category::Value),
        ("direct_construction", Category::Type),
        ("invalid_callback", Category::Type),
        ("consumed", Category::Type),
        ("invalid_argument_type", Category::Type),
        ("busy", Category::Busy),
        ("wrong_thread", Category::Busy),
        ("internal", Category::Internal),
    ];

    /// The fixed category of the variant (E-1a).
    #[must_use]
    pub const fn category(&self) -> Category {
        match self {
            Self::InvalidNumber { .. } | Self::InvalidText { .. } | Self::InvalidPath { .. } => Category::Value,
            Self::DirectConstruction { .. }
            | Self::InvalidCallback { .. }
            | Self::Consumed { .. }
            | Self::InvalidArgumentType { .. } => Category::Type,
            Self::Busy { .. } | Self::WrongThread { .. } => Category::Busy,
            Self::Internal { .. } => Category::Internal,
        }
    }
}

impl Kinds for BindingError {
    fn kind(&self) -> &'static str {
        match self {
            Self::InvalidNumber { .. } => "invalid_number",
            Self::InvalidText { .. } => "invalid_text",
            Self::InvalidPath { .. } => "invalid_path",
            Self::DirectConstruction { .. } => "direct_construction",
            Self::InvalidCallback { .. } => "invalid_callback",
            Self::Consumed { .. } => "consumed",
            Self::InvalidArgumentType { .. } => "invalid_argument_type",
            Self::Busy { .. } => "busy",
            Self::WrongThread { .. } => "wrong_thread",
            Self::Internal { .. } => "internal",
        }
    }

    /// No binding error has an HTTP status: none of them is a response of a library (F-2).
    fn status(&self) -> Option<u16> {
        None
    }

    /// No binding error is an OS failure.
    fn errno(&self) -> Option<i32> {
        None
    }
}

impl fmt::Display for BindingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidNumber { subject, expected } => {
                write!(f, "{subject} is not a value of the type {}", expected.as_str())
            }
            Self::InvalidText { subject, cause } => write!(f, "{subject} {}", cause.describe()),
            Self::InvalidPath { subject } => write!(f, "{subject} has no byte form of an OS path"),
            Self::DirectConstruction { class } => write!(f, "{class} has no public constructor"),
            Self::InvalidCallback { subject, member } => {
                write!(f, "{subject} does not provide a callable {member}")
            }
            Self::Consumed { class } => write!(f, "{class} was consumed by an earlier call"),
            Self::InvalidArgumentType { subject, expected } => write!(f, "{subject} is not an instance of {expected}"),
            Self::Busy { class } => write!(f, "{class} has a call in progress"),
            Self::WrongThread { subject } => write!(f, "{subject} was called from a thread other than its owner"),
            Self::Internal { detail } => write!(f, "internal error: {detail}"),
        }
    }
}

impl std::error::Error for BindingError {}

#[cfg(test)]
mod tests {
    use super::{BindingError, Category, Kinds, NumberType, TextCause};

    fn every_variant() -> Vec<BindingError> {
        let s = || String::from("limit");
        vec![
            BindingError::InvalidNumber {
                subject: s(),
                expected: NumberType::Uint,
            },
            BindingError::InvalidText {
                subject: s(),
                cause: TextCause::AboveLatin1,
            },
            BindingError::InvalidPath { subject: s() },
            BindingError::DirectConstruction { class: s() },
            BindingError::InvalidCallback {
                subject: s(),
                member: s(),
            },
            BindingError::Consumed { class: s() },
            BindingError::InvalidArgumentType {
                subject: s(),
                expected: s(),
            },
            BindingError::Busy { class: s() },
            BindingError::WrongThread { subject: s() },
            BindingError::Internal { detail: s() },
        ]
    }

    #[test]
    fn each_variant_has_the_kind_and_category_of_e_1a() {
        let variants = every_variant();
        assert_eq!(variants.len(), BindingError::KINDS.len());
        for (error, (kind, category)) in variants.iter().zip(BindingError::KINDS) {
            assert_eq!(error.kind(), kind);
            assert_eq!(error.category(), category, "{kind}");
        }
    }

    #[test]
    fn the_kinds_are_distinct() {
        let mut kinds: Vec<&str> = BindingError::KINDS.iter().map(|(kind, _)| *kind).collect();
        kinds.sort_unstable();
        kinds.dedup();
        assert_eq!(kinds.len(), BindingError::KINDS.len());
    }

    #[test]
    fn binding_errors_have_no_status_and_no_errno() {
        for error in every_variant() {
            assert_eq!(error.status(), None, "{}", error.kind());
            assert_eq!(error.errno(), None, "{}", error.kind());
        }
    }

    #[test]
    fn the_message_is_the_display_with_no_prefix() {
        // E-4: the binding adds nothing to the message, so the Display is the whole message.
        let error = BindingError::InvalidNumber {
            subject: String::from("limit"),
            expected: NumberType::Int,
        };
        assert_eq!(error.to_string(), "limit is not a value of the type int");
        let error = BindingError::InvalidText {
            subject: String::from("name"),
            cause: TextCause::UnpairedSurrogate,
        };
        assert_eq!(error.to_string(), "name holds an unpaired surrogate");
        let error = BindingError::Busy {
            class: String::from("Session"),
        };
        assert_eq!(error.to_string(), "Session has a call in progress");
    }

    #[test]
    fn categories_have_the_names_of_e_1() {
        let names: Vec<&str> = Category::ALL.iter().map(|c| c.as_str()).collect();
        assert_eq!(names, ["value", "type", "io", "store", "busy", "internal"]);
    }
}
