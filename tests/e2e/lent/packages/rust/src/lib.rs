//! A library for the end-to-end check of binding whose core keeps a lent record beyond the call (GN-6d, B2.402).
//!
//! `keep` asks for `Search<'static>` and stores it, so its callback outlives the call. The binding gives a lent record
//! the lifetime of the call in every target, so the generated crate of each target must not compile against this core.

use binding_core::{Failure, Kinds};
use std::cell::RefCell;
use std::fmt;

/// The errors of the library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The lookup holds no value for the key.
    Missing {
        /// The key.
        key: String,
    },
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Missing { .. } => "missing",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { key } => write!(f, "no value for {key}"),
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

/// A source of values by key, which language code implements.
pub trait Lookup {
    /// The value of a key, or `None` when it has none.
    ///
    /// # Errors
    ///
    /// The failure of the implementation.
    fn find(&mut self, key: &str) -> Result<Option<String>, Failure<Error>>;
}

/// A search for the value of a key: a record with a callback field, whose type has one lifetime.
pub struct Search<'a> {
    /// The lookup that holds the value.
    pub lookup: Box<dyn Lookup + 'a>,
    /// The key.
    pub key: String,
}

/// A holding of a lookup that the core keeps: the record of a parameter with keeps whose callback field is optional with
/// a default, the shape of the options of an engine whose constructor keeps its loader (B2.402).
pub struct Holding<'a> {
    /// The key.
    pub key: String,
    /// The lookup that holds the value, if any.
    pub lookup: Option<Box<dyn Lookup + 'a>>,
}

thread_local! {
    /// The searches that `keep` kept beyond their calls.
    static KEPT: RefCell<Vec<Search<'static>>> = const { RefCell::new(Vec::new()) };
    /// The holdings that `hold` kept, as its parameter with keeps allows.
    static HELD: RefCell<Vec<Holding<'static>>> = const { RefCell::new(Vec::new()) };
}

/// The value of the key of the search, which its lookup must hold; the search is kept after the call.
///
/// # Errors
///
/// Kind `missing` when the lookup holds no value, and the failure of the lookup.
pub fn keep(mut search: Search<'static>) -> Result<String, Failure<Error>> {
    let value = match search.lookup.find(&search.key)? {
        Some(value) => Ok(value),
        None => Err(Failure::Kind(Error::Missing {
            key: search.key.clone(),
        })),
    };
    KEPT.with(|kept| kept.borrow_mut().push(search));
    value
}

/// The key of the holding; the holding is kept after the call, as its parameter with keeps states, so its binding
/// compiles in every target (B2.402).
#[must_use]
pub fn hold(holding: Holding<'static>) -> String {
    let key = holding.key.clone();
    HELD.with(|held| held.borrow_mut().push(holding));
    key
}
