//! A library for the end-to-end check of binding: a class unit with a constructor, a static member, methods, a
//! property, an iteration and the hooks of N-4 (T-5, U-2), without a unit that the WASM generator refuses.

use binding_core::Kinds;
use std::fmt;

/// The errors of the library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// A text that must not be empty is empty.
    Missing {
        /// What is empty.
        key: String,
    },
    /// A value that has no such form.
    Unsupported {
        /// What the value is.
        what: String,
    },
    /// A gate that is closed lets nothing pass and does not close again.
    Closed {
        /// The name of the tag of the gate.
        tag: String,
    },
}

impl Error {
    /// The kind of the error.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Missing { .. } => "missing",
            Self::Unsupported { .. } => "unsupported",
            Self::Closed { .. } => "closed",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { key } => write!(f, "no value for {key}"),
            Self::Unsupported { what } => write!(f, "not data: {what}"),
            Self::Closed { tag } => write!(f, "the gate of {tag} is closed"),
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

/// A tag of a name, which the language makes and gives back to the core (T-5: a class as a parameter).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tag {
    name: String,
}

impl Tag {
    /// A tag of the name.
    #[must_use]
    pub fn new(name: &str) -> Self {
        Self { name: name.to_owned() }
    }

    /// A tag of a text that is not empty (U-2: a static member that returns the class).
    ///
    /// # Errors
    ///
    /// Kind `missing` for the empty text.
    pub fn parse(text: &str) -> Result<Self, Error> {
        if text.is_empty() {
            return Err(Error::Missing { key: String::from("text") });
        }
        Ok(Self::new(text))
    }

    /// The name of the tag.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// The tag with a suffix after its name.
    ///
    /// # Errors
    ///
    /// Kind `missing` for the empty suffix.
    pub fn with_suffix(&self, suffix: &str) -> Result<Self, Error> {
        if suffix.is_empty() {
            return Err(Error::Missing { key: String::from("suffix") });
        }
        Ok(Self { name: format!("{}{suffix}", self.name) })
    }

    /// Whether the tag has the name of another (T-5: a method that takes the class).
    #[must_use]
    pub fn same(&self, other: &Self) -> bool {
        self.name == other.name
    }

    /// The tag, count times (T-5: a list of the class as a result).
    #[must_use]
    pub fn repeat(&self, count: u64) -> Vec<Self> {
        (0..count).map(|_index| self.clone()).collect()
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
        Err(Error::Unsupported { what: format!("the JSON form of the tag {}", self.name) })
    }

    /// The entries of the tag, its name with the tag itself (N-4: iterate with a key and a value).
    pub fn entries(&self) -> impl Iterator<Item = (&String, &Self)> {
        std::iter::once((&self.name, self))
    }

    /// The open gate of the tag (G-5: a class that only a method of another class makes).
    #[must_use]
    pub fn gate(&self) -> Gate {
        Gate { tag: self.name.clone(), open: true }
    }

    /// Open gates of the tag, the name of the n-th with n dots after it (G-5: a class inside a result).
    #[must_use]
    pub fn gates(&self, count: u64) -> Vec<Gate> {
        let mut dots = String::new();
        (0..count)
            .map(|_index| {
                let gate = Gate { tag: format!("{}{dots}", self.name), open: true };
                dots.push('.');
                gate
            })
            .collect()
    }
}

/// A gate of a tag, which a call closes (G-5: a receiver that an earlier call prepares).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Gate {
    tag: String,
    open: bool,
}

impl Gate {
    /// What enters the gate.
    ///
    /// # Errors
    ///
    /// Kind `closed` when the gate is closed.
    pub fn enter(&self) -> Result<String, Error> {
        if !self.open {
            return Err(Error::Closed { tag: self.tag.clone() });
        }
        Ok(format!("{} passes", self.tag))
    }

    /// Closes the gate.
    ///
    /// # Errors
    ///
    /// Kind `closed` when the gate is closed already.
    pub fn close(&mut self) -> Result<(), Error> {
        if !self.open {
            return Err(Error::Closed { tag: self.tag.clone() });
        }
        self.open = false;
        Ok(())
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
    Tag { name: tag.name.to_uppercase() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tag_and_its_members() {
        let tag = Tag::new("a");
        assert_eq!(Tag::parse("a"), Ok(tag.clone()));
        assert_eq!(Tag::parse(""), Err(Error::Missing { key: String::from("text") }));
        assert_eq!(tag.with_suffix("b").map(|tag| tag.name().to_owned()), Ok(String::from("ab")));
        assert_eq!(tag.with_suffix(""), Err(Error::Missing { key: String::from("suffix") }));
        assert!(tag.same(&Tag::new("a")));
        assert_eq!(tag.repeat(2).len(), 2);
        assert_eq!(tag.label(), "#a");
        assert_eq!(join(&[tag.clone(), shout(&tag)]), "a,A");
        let mut gate = tag.gate();
        assert_eq!(gate.enter(), Ok(String::from("a passes")));
        assert_eq!(gate.close(), Ok(()));
        assert_eq!(gate.enter(), Err(Error::Closed { tag: String::from("a") }));
        assert_eq!(gate.close(), Err(Error::Closed { tag: String::from("a") }));
        assert_eq!(tag.gates(2).iter().map(Gate::enter).collect::<Vec<_>>(), vec![Ok(String::from("a passes")), Ok(String::from("a. passes"))]);
    }
}
