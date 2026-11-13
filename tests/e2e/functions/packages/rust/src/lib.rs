//! A sample library for the end-to-end check of binding: functions of the language (T-2, GN-6z), which the core calls
//! during the call that receives them, and which a class keeps after the call and calls later.

use binding_core::{Failure, Kinds};
use std::fmt;

/// The count of a length, which widens: usize is at most 64 bits wide on every target of the workspace.
#[allow(clippy::as_conversions, reason = "usize is at most 64 bits wide on every target of the workspace, so the conversion is lossless")]
const fn widen(length: usize) -> i64 {
    length as i64
}

/// The errors of the sample.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// A value without a character.
    Empty,
    /// No function is registered under the name.
    Missing {
        /// The name.
        name: String,
    },
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Empty => "empty",
            Self::Missing { .. } => "missing",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(f, "no character"),
            Self::Missing { name } => write!(f, "no function {name}"),
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

/// A function of the language that converts a text, given with the lengths of its words (GN-6z).
pub type Convert = Box<dyn Fn(&str, &[i64]) -> Result<String, Failure<Error>> + Send + Sync>;

/// The lengths of the words of a text, separated by spaces.
fn lengths(value: &str) -> Vec<i64> {
    value.split(' ').map(|word| widen(word.chars().count())).collect()
}

/// The value as the function converts it, which the core calls once during the call.
///
/// # Errors
///
/// Kind `empty` for a value without a character, and the failure of the function.
pub fn apply(convert: Convert, value: &str) -> Result<String, Failure<Error>> {
    if value.is_empty() {
        return Err(Failure::Kind(Error::Empty));
    }
    convert(value, &lengths(value))
}

/// The functions that the registry keeps by name after the call that registers them.
pub struct Registry {
    functions: Vec<(String, Convert)>,
}

impl Registry {
    /// A registry without a function.
    #[must_use]
    pub const fn new() -> Self {
        Self { functions: Vec::new() }
    }

    /// Keeps the function under the name; a later function of the same name replaces it.
    ///
    /// # Errors
    ///
    /// Kind `empty` for a name without a character.
    pub fn register(&mut self, name: &str, convert: Convert) -> Result<(), Failure<Error>> {
        if name.is_empty() {
            return Err(Failure::Kind(Error::Empty));
        }
        self.functions.retain(|(kept, _)| kept != name);
        self.functions.push((name.to_owned(), convert));
        Ok(())
    }

    /// The value as the function of the name converts it, which the registry kept.
    ///
    /// # Errors
    ///
    /// Kind `missing` when no function has the name, and the failure of the function.
    pub fn call(&self, name: &str, value: &str) -> Result<String, Failure<Error>> {
        match self.functions.iter().find(|(kept, _)| kept == name) {
            Some((_, convert)) => convert(value, &lengths(value)),
            None => Err(Failure::Kind(Error::Missing { name: name.to_owned() })),
        }
    }
}

impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}
