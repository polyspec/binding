//! A library for the end-to-end check of binding: a class unit with a constructor, a static member, methods, a
//! property, an iteration and the hooks of N-4 (T-5, U-2), without a unit that the WASM generator refuses.

use binding_core::{Failure, Kinds};
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
    /// A stall that is shut has no keeper.
    Shut {
        /// The name of the tag of the stall.
        tag: String,
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
            Self::Shut { .. } => "shut",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { key } => write!(f, "no value for {key}"),
            Self::Unsupported { what } => write!(f, "not data: {what}"),
            Self::Closed { tag } => write!(f, "the gate of {tag} is closed"),
            Self::Shut { tag } => write!(f, "the stall of {tag} is shut"),
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
        Self {
            name: name.to_owned(),
        }
    }

    /// A tag of a text that is not empty (U-2: a static member that returns the class).
    ///
    /// # Errors
    ///
    /// Kind `missing` for the empty text.
    pub fn parse(text: &str) -> Result<Self, Error> {
        if text.is_empty() {
            return Err(Error::Missing {
                key: String::from("text"),
            });
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
            return Err(Error::Missing {
                key: String::from("suffix"),
            });
        }
        Ok(Self {
            name: format!("{}{suffix}", self.name),
        })
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

    /// Whether the value has the name of the tag (GN-6ap: a method that takes a generated interface).
    #[must_use]
    pub fn names(&self, named: Named) -> bool {
        named.name() == self.name
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
        Err(Error::Unsupported {
            what: format!("the JSON form of the tag {}", self.name),
        })
    }

    /// The entries of the tag, its name with the tag itself (N-4: iterate with a key and a value).
    pub fn entries(&self) -> impl Iterator<Item = (&String, &Self)> {
        std::iter::once((&self.name, self))
    }

    /// The open gate of the tag (G-5: a class that only a method of another class makes).
    #[must_use]
    pub fn gate(&self) -> Gate {
        Gate {
            tag: self.name.clone(),
            open: true,
        }
    }

    /// The lease of the tag, a resource whose release call ends it (B-10).
    #[must_use]
    pub fn lease(&self) -> Lease {
        Lease {
            tag: self.name.clone(),
        }
    }

    /// A stall of the tag, which a call shuts (GN-6p).
    #[must_use]
    pub fn stall(&self) -> Stall {
        Stall {
            tag: self.name.clone(),
            shut: false,
        }
    }

    /// Open gates of the tag, the name of the n-th with n dots after it (G-5: a class inside a result).
    #[must_use]
    pub fn gates(&self, count: u64) -> Vec<Gate> {
        let mut dots = String::new();
        (0..count)
            .map(|_index| {
                let gate = Gate {
                    tag: format!("{}{dots}", self.name),
                    open: true,
                };
                dots.push('.');
                gate
            })
            .collect()
    }
}

/// A lease of a tag, a resource that its release call ends (B-10: a class unit with `cleanup`).
#[derive(Debug, PartialEq, Eq)]
pub struct Lease {
    tag: String,
}

impl binding_core::Cleanup for Lease {}

impl Lease {
    /// The name of the tag that holds the lease.
    #[must_use]
    pub fn holder(&self) -> String {
        self.tag.clone()
    }

    /// Releases the lease, which consumes it (GN-6o).
    #[must_use]
    pub fn release(self) -> String {
        format!("the lease of {} is released", self.tag)
    }
}

/// A stall of a tag, whose cleanup shuts it and leaves the object (GN-6p: a cleanup with the receiver `&mut self`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stall {
    tag: String,
    shut: bool,
}

impl binding_core::Cleanup for Stall {}

impl Stall {
    /// The name of the tag that keeps the stall.
    ///
    /// # Errors
    ///
    /// Kind `shut` when the stall is shut.
    pub fn keeper(&self) -> Result<String, Error> {
        if self.shut {
            return Err(Error::Shut {
                tag: self.tag.clone(),
            });
        }
        Ok(self.tag.clone())
    }

    /// Shuts the stall; a second call does nothing.
    pub fn shut(&mut self) {
        self.shut = true;
    }
}

/// Who leads a guest to a seat, which language code implements (U-3).
pub trait Guide {
    /// The guest that the guide leads for a name.
    ///
    /// # Errors
    ///
    /// The failure of the implementation.
    fn lead(&mut self, tag: &str) -> Result<String, Failure<Error>>;
}

/// An usher, whose guide is language code that the core calls while the call waits (GN-6q): calls of one usher only
/// read it, so they run at the same time (GN-6h).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Usher {
    name: String,
}

impl Usher {
    /// An usher with a name.
    #[must_use]
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_owned(),
        }
    }

    /// The name of the usher.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Whom the usher seats: the guest that the guide leads, asked as a blocking I/O call would be (B-5 (a): the
    /// token of wait blocking_io).
    ///
    /// # Errors
    ///
    /// Kind `missing` when the guide leads nobody, and the failure of the guide.
    pub fn seat(
        &self,
        _io: binding_core::Io,
        guide: &mut dyn Guide,
    ) -> Result<String, Failure<Error>> {
        let guest = guide.lead(&self.name)?;
        if guest.is_empty() {
            return Err(Failure::Kind(Error::Missing {
                key: String::from("guest"),
            }));
        }
        Ok(format!("{} seats {guest}", self.name))
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
            return Err(Error::Closed {
                tag: self.tag.clone(),
            });
        }
        Ok(format!("{} passes", self.tag))
    }

    /// What enters the gate, read as a blocking I/O call would be (B-5 (a): the token of wait blocking_io).
    ///
    /// # Errors
    ///
    /// Kind `closed` when the gate is closed.
    pub fn enter_slowly(&self, _io: binding_core::Io) -> Result<String, Error> {
        self.enter()
    }

    /// What enters the gate, awaited as a wait for another process would be (B-5 (b): the token of wait
    /// process_wait).
    ///
    /// # Errors
    ///
    /// Kind `closed` when the gate is closed.
    pub fn enter_after(&self, _wait: binding_core::ProcessWait) -> Result<String, Error> {
        self.enter()
    }

    /// What enters the gate, awaited as an async driver would be (I-2 (4): wait async_driver).
    ///
    /// # Errors
    ///
    /// Kind `closed` when the gate is closed, and kind `unsupported` when the call runs on no tokio runtime (GN-6n).
    pub async fn enter_later(&self) -> Result<String, Error> {
        on_runtime().await?;
        self.enter()
    }

    /// Closes the gate.
    ///
    /// # Errors
    ///
    /// Kind `closed` when the gate is closed already.
    pub fn close(&mut self) -> Result<(), Error> {
        if !self.open {
            return Err(Error::Closed {
                tag: self.tag.clone(),
            });
        }
        self.open = false;
        Ok(())
    }
}

/// The text of a name, read as a blocking I/O call would be (B-5 (a): the token of wait blocking_io).
///
/// # Errors
///
/// Kind `missing` when the name is empty.
pub fn read(_io: binding_core::Io, name: &str) -> Result<String, Error> {
    if name.is_empty() {
        return Err(Error::Missing {
            key: String::from("name"),
        });
    }
    Ok(format!("the text of {name}"))
}

/// The name, attended as a wait for another process would be (B-5 (b): the token of wait process_wait).
///
/// # Errors
///
/// Kind `missing` when the name is empty.
pub fn attend(_wait: binding_core::ProcessWait, name: &str) -> Result<String, Error> {
    if name.is_empty() {
        return Err(Error::Missing {
            key: String::from("name"),
        });
    }
    Ok(format!("{name} was attended"))
}

/// The exit status of a child process that the call starts and waits for (B-5 (b): wait `process_wait`): the program
/// `shell` runs `exit <code>`, so the wait lasts until another process ends.
///
/// # Errors
///
/// Kind `missing` when `shell` cannot be started, or when the child ended without an exit status.
pub fn outlast(_wait: binding_core::ProcessWait, shell: &str, code: u64) -> Result<u64, Error> {
    let missing = || Error::Missing {
        key: shell.to_owned(),
    };
    let status = std::process::Command::new(shell)
        .arg("-c")
        .arg(format!("exit {code}"))
        .status()
        .map_err(|_error| missing())?;
    let exit = status.code().ok_or_else(missing)?;
    u64::try_from(exit).map_err(|_negative| missing())
}

/// The text of a name, awaited as an async driver would be (I-2 (4): wait async_driver).
///
/// # Errors
///
/// Kind `missing` when the name is empty, and kind `unsupported` when the call runs on no tokio runtime (GN-6n).
pub async fn fetch(name: &str) -> Result<String, Error> {
    on_runtime().await?;
    if name.is_empty() {
        return Err(Error::Missing {
            key: String::from("name"),
        });
    }
    Ok(format!("the fetched text of {name}"))
}

/// The text of a name, awaited as an async driver would be, on any executor (GN-6n): the future is pending once
/// before it ends, so the driver polls it again, and it needs no tokio runtime, which a WebAssembly module has not.
///
/// # Errors
///
/// Kind `missing` when the name is empty.
pub async fn settle(name: &str) -> Result<String, Error> {
    Pending::default().await;
    if name.is_empty() {
        return Err(Error::Missing {
            key: String::from("name"),
        });
    }
    Ok(format!("the settled text of {name}"))
}

/// A future that is pending once, after it wakes its task, and then ready (GN-6n).
#[derive(Default)]
struct Pending {
    polled: bool,
}

impl std::future::Future for Pending {
    type Output = ();

    fn poll(
        mut self: std::pin::Pin<&mut Self>,
        context: &mut std::task::Context<'_>,
    ) -> std::task::Poll<()> {
        if self.polled {
            return std::task::Poll::Ready(());
        }
        self.polled = true;
        context.waker().wake_by_ref();
        std::task::Poll::Pending
    }
}

/// GN-6n: a core of tokio needs the runtime of its call, so an async member fails where the binding gives none. The
/// call yields once, so that the future is polled again.
async fn on_runtime() -> Result<(), Error> {
    tokio::task::yield_now().await;
    match tokio::runtime::Handle::try_current() {
        Ok(_handle) => Ok(()),
        Err(error) => Err(Error::Unsupported {
            what: format!("a call outside a tokio runtime: {error}"),
        }),
    }
}

/// What has a label: a tag or a gate (GN-6ap: the type that the core takes for the classes of a generated interface).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Named {
    /// A tag, whose label is its string form.
    Tag(Tag),
    /// A gate, whose label names its tag.
    Gate(Gate),
}

impl From<&Tag> for Named {
    fn from(tag: &Tag) -> Self {
        Self::Tag(tag.clone())
    }
}

impl From<&Gate> for Named {
    fn from(gate: &Gate) -> Self {
        Self::Gate(gate.clone())
    }
}

impl Named {
    /// The name that the value has: that of the tag, or of the tag of the gate.
    fn name(&self) -> &str {
        match self {
            Self::Tag(tag) => &tag.name,
            Self::Gate(gate) => &gate.tag,
        }
    }
}

/// Whether the cancellation of the caller fired (T-1 cancel, GN-6aq): a cancellation that fired before the call is
/// cancelled when the core is called.
#[must_use]
#[allow(
    clippy::needless_pass_by_value,
    reason = "GN-6aq: the core takes a Cancel by value"
)]
pub fn halted(cancel: binding_core::Cancel) -> bool {
    cancel.is_cancelled()
}

/// The label of a tag or of a gate (GN-6ap: a parameter typed by a generated interface).
#[must_use]
pub fn label_of(named: Named) -> String {
    match named {
        Named::Tag(tag) => tag.label(),
        Named::Gate(gate) => format!("gate of {}", gate.tag),
    }
}

/// The label of a tag or of a gate, or the fallback when there is none (GN-6ap: an optional of a generated interface).
#[must_use]
pub fn label_or(named: Option<Named>, fallback: &str) -> String {
    match named {
        Some(named) => label_of(named),
        None => fallback.to_owned(),
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
    Tag {
        name: tag.name.to_uppercase(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tag_and_its_members() {
        let tag = Tag::new("a");
        assert_eq!(Tag::parse("a"), Ok(tag.clone()));
        assert_eq!(
            Tag::parse(""),
            Err(Error::Missing {
                key: String::from("text")
            })
        );
        assert_eq!(
            tag.with_suffix("b").map(|tag| tag.name().to_owned()),
            Ok(String::from("ab"))
        );
        assert_eq!(
            tag.with_suffix(""),
            Err(Error::Missing {
                key: String::from("suffix")
            })
        );
        assert!(tag.same(&Tag::new("a")));
        assert_eq!(tag.repeat(2).len(), 2);
        assert_eq!(tag.label(), "#a");
        assert_eq!(join(&[tag.clone(), shout(&tag)]), "a,A");
        let mut gate = tag.gate();
        assert_eq!(gate.enter(), Ok(String::from("a passes")));
        assert_eq!(gate.close(), Ok(()));
        assert_eq!(
            gate.enter(),
            Err(Error::Closed {
                tag: String::from("a")
            })
        );
        assert_eq!(
            gate.close(),
            Err(Error::Closed {
                tag: String::from("a")
            })
        );
        assert_eq!(
            tag.gates(2).iter().map(Gate::enter).collect::<Vec<_>>(),
            vec![Ok(String::from("a passes")), Ok(String::from("a. passes"))]
        );
    }
}
