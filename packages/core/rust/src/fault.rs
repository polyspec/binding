//! Fault injection points (design G-5, X-1).
//!
//! A core marks a place where a failure of its surroundings is imitated with [`point`], which names the place as
//! `<library>.<id>`. The macro is always there and does nothing where the crate that writes it lacks its own feature
//! `fault-test`, so a core writes it without a condition (GN-5). With the feature, which a core turns on together with
//! binding_core's `fault-test`, a generated
//! test arms a list of faults for one call of one member ([`arm`]); the generated entry point of that member takes the
//! arming ([`take`]) and installs it while its work runs ([`Armed::run`]); `point` reads only the arming that is
//! installed on its thread. A point reached without an arming for it gives `None`, so the core goes on unchanged.
//!
//! An arming is handed over by the member id and the thread of the caller, so a call that makes the receiver or an
//! argument of the member under test does not take it, and neither does a test on another thread. An entry point with
//! no arming of its own installs an empty one, so an entry point that a callback enters does not see the arming of
//! the call around it. A task or a thread that the core starts itself does not inherit the arming.

/// What an armed point does where the core reaches it (G-5).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Injected {
    /// The I/O call of the place fails, with the errno of the target when the fault names one; a point whose failure
    /// has no errno is armed without one.
    Io {
        /// The value that the symbol of the fault has on the target.
        errno: Option<i32>,
    },
    /// The read or write of the place handles `bytes` bytes and ends.
    Short {
        /// The count of bytes that the call handles.
        bytes: u64,
    },
    /// The invariant of the place is treated as broken.
    Broken,
}

/// Asks whether a fault is armed for the point `$name` (`<library>.<id>`) on this thread, and counts the visit; it
/// gives an `Option<Injected>`.
///
/// The point is judged by the feature `fault-test` of the crate that writes it, not by that of binding_core: Cargo
/// unifies the features of binding_core, so one core with `fault-test` turns it on for every core of the build, and a
/// point that binding_core judged would be live in a core whose own feature nobody turned on (GN-5). A crate that
/// writes a point declares `fault-test = ["polyspec-binding-core/fault-test"]`; without its feature the point is
/// `None` and compiles to nothing.
#[macro_export]
#[doc(hidden)]
macro_rules! __fault_point {
    ($name:expr) => {{
        #[cfg(feature = "fault-test")]
        {
            $crate::fault::reach($name)
        }
        #[cfg(not(feature = "fault-test"))]
        {
            let _unused: &'static str = $name;
            ::core::option::Option::<$crate::fault::Injected>::None
        }
    }};
}

#[doc(inline)]
pub use crate::__fault_point as point;

/// The visit of a point whose crate has the feature `fault-test`; [`point`] calls it, and nothing else does.
#[cfg(feature = "fault-test")]
#[doc(hidden)]
#[must_use]
pub fn reach(name: &'static str) -> Option<Injected> {
    armed::reach(name)
}

#[cfg(feature = "fault-test")]
pub use armed::{arm, left, take, ArmError, Armed, Around};

#[cfg(feature = "fault-test")]
mod armed {
    use super::Injected;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::fmt;
    use std::future::Future;
    use std::pin::Pin;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Arc, Mutex};
    use std::task::{Context, Poll};
    use std::thread::{self, ThreadId};

    /// One fault of an arming: it fires at the `nth` visit of its point, once.
    #[derive(Debug)]
    struct Slot {
        point: String,
        injected: Injected,
        nth: u64,
        visits: AtomicU64,
        fired: AtomicBool,
    }

    /// The faults armed for one call of one member (G-5). A clone is the same arming.
    #[derive(Debug, Clone)]
    pub struct Armed {
        slots: Arc<[Slot]>,
    }

    /// The future of [`Armed::around`].
    pub struct Around<F> {
        armed: Armed,
        future: Pin<Box<F>>,
    }

    impl<F: Future> Future for Around<F> {
        type Output = F::Output;

        fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<F::Output> {
            let this = self.get_mut();
            let future = this.future.as_mut();
            this.armed.run(|| future.poll(cx))
        }
    }

    thread_local! {
        /// The arming that is installed on this thread, which `point` reads.
        static INSTALLED: RefCell<Option<Armed>> = const { RefCell::new(None) };
    }

    /// Puts the earlier arming back when the work ends, also when it unwinds.
    struct Restore(Option<Armed>);

    impl Drop for Restore {
        fn drop(&mut self) {
            let earlier = self.0.take();
            INSTALLED.with(|installed| *installed.borrow_mut() = earlier);
        }
    }

    impl Armed {
        /// An arming without a fault, which an entry point installs when no test armed its member.
        #[must_use]
        pub fn empty() -> Self {
            Self {
                slots: Arc::from(Vec::new()),
            }
        }

        /// Runs `work` with this arming installed on the thread, and puts the earlier arming back after it. An entry
        /// point moves the arming with its work and calls `run` where the work runs.
        pub fn run<T>(&self, work: impl FnOnce() -> T) -> T {
            let earlier = INSTALLED.with(|installed| installed.borrow_mut().replace(self.clone()));
            let _restore = Restore(earlier);
            work()
        }

        /// A future that installs this arming around each poll of `future` (GN-6n), so that the points of an
        /// `async fn` see the arming of their call on whichever thread polls it.
        pub fn around<F: Future>(self, future: F) -> Around<F> {
            Around {
                armed: self,
                future: Box::pin(future),
            }
        }

        /// The names of the faults that did not fire, in the order of the arming.
        fn left(&self) -> Vec<String> {
            self.slots
                .iter()
                .filter(|slot| !slot.fired.load(Ordering::SeqCst))
                .map(|slot| slot.point.clone())
                .collect()
        }
    }

    pub(super) fn reach(name: &str) -> Option<Injected> {
        INSTALLED.with(|installed| {
            let installed = installed.borrow();
            let armed = installed.as_ref()?;
            let mut injected = None;
            for slot in armed.slots.iter().filter(|slot| slot.point == name) {
                if slot.fired.load(Ordering::SeqCst) {
                    continue;
                }
                let visit = slot.visits.fetch_add(1, Ordering::SeqCst) + 1;
                if visit == slot.nth && injected.is_none() {
                    slot.fired.store(true, Ordering::SeqCst);
                    injected = Some(slot.injected);
                }
            }
            injected
        })
    }

    /// Why a list of faults was not armed, or its result not read.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum ArmError {
        /// The list is not `[{"point", "kind", "errno"?, "bytes"?, "nth"?}]`.
        Form(String),
        /// The target has no errno of this symbol, or no errno at all.
        Errno(String),
        /// No arming has this id; an id is read once.
        Id(u64),
        /// A panic left the tables of this module locked.
        Poisoned,
    }

    impl fmt::Display for ArmError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                Self::Form(detail) => write!(f, "the faults are not armed: {detail}"),
                Self::Errno(symbol) => write!(f, "the faults are not armed: the target has no errno {symbol}"),
                Self::Id(id) => write!(f, "no arming has the id {id}"),
                Self::Poisoned => f.write_str("a panic left the fault tables locked"),
            }
        }
    }

    impl std::error::Error for ArmError {}

    /// The armings that wait for the entry point of their member on the thread that armed them, and every arming
    /// by its id until its result is read.
    #[derive(Default)]
    struct Tables {
        handed: HashMap<(String, ThreadId), Armed>,
        ids: HashMap<u64, (String, ThreadId, Armed)>,
        next: u64,
    }

    static TABLES: Mutex<Option<Tables>> = Mutex::new(None);

    fn tables<T>(read: impl FnOnce(&mut Tables) -> T) -> Result<T, ArmError> {
        let mut guard = TABLES.lock().map_err(|_poisoned| ArmError::Poisoned)?;
        Ok(read(guard.get_or_insert_with(Tables::default)))
    }

    /// Arms the faults of `faults`, the JSON list of a case, for the next call of `member` from this thread, and gives
    /// the id under which [`left`] reports the arming. An arming that the member did not take is replaced.
    ///
    /// # Errors
    ///
    /// The list does not have the form of a case's `faults`, or names an errno that the target does not have.
    pub fn arm(member: &str, faults: &str) -> Result<u64, ArmError> {
        let armed = Armed {
            slots: Arc::from(parse(faults)?),
        };
        let thread = thread::current().id();
        tables(|tables| {
            tables.next += 1;
            let id = tables.next;
            tables.handed.insert((member.to_owned(), thread), armed.clone());
            tables.ids.insert(id, (member.to_owned(), thread, armed));
            id
        })
    }

    /// Takes the arming that this thread armed for `member`, or an empty arming when there is none. Every generated
    /// entry point calls it in its synchronous part.
    #[must_use]
    pub fn take(member: &str) -> Armed {
        let taken = tables(|tables| tables.handed.remove(&(member.to_owned(), thread::current().id())));
        match taken {
            Ok(Some(armed)) => armed,
            // A poisoned table leaves the arming where it is, and `left` reports the poisoning to the test.
            Ok(None) | Err(ArmError::Form(_) | ArmError::Errno(_) | ArmError::Id(_) | ArmError::Poisoned) => {
                Armed::empty()
            }
        }
    }

    /// The points of the arming `id` whose fault did not fire, and forgets the arming: a test requires the list to be
    /// empty after its call. An arming that no entry point took has every point left.
    ///
    /// # Errors
    ///
    /// No arming has the id, or a panic left the tables locked.
    pub fn left(id: u64) -> Result<Vec<String>, ArmError> {
        let (member, thread, armed) = tables(|tables| tables.ids.remove(&id))?.ok_or(ArmError::Id(id))?;
        tables(|tables| {
            // The arming is still handed over when its member was never called; another arming of the same member
            // and thread, made later, stays.
            let key = (member, thread);
            if tables
                .handed
                .get(&key)
                .is_some_and(|waiting| Arc::ptr_eq(&waiting.slots, &armed.slots))
            {
                tables.handed.remove(&key);
            }
        })?;
        Ok(armed.left())
    }

    fn form(detail: impl Into<String>) -> ArmError {
        ArmError::Form(detail.into())
    }

    fn parse(faults: &str) -> Result<Vec<Slot>, ArmError> {
        let list: serde_json::Value = serde_json::from_str(faults).map_err(|error| form(error.to_string()))?;
        let items = list.as_array().ok_or_else(|| form("the faults are not a list"))?;
        items.iter().map(slot).collect()
    }

    fn slot(item: &serde_json::Value) -> Result<Slot, ArmError> {
        let fault = item.as_object().ok_or_else(|| form("a fault is not an object"))?;
        let mut point = None;
        let mut kind = None;
        let mut errno = None;
        let mut bytes = None;
        let mut nth = 1;
        for (key, value) in fault {
            match key.as_str() {
                "point" => point = Some(value.as_str().ok_or_else(|| form("point is not a text"))?),
                "kind" => kind = Some(value.as_str().ok_or_else(|| form("kind is not a text"))?),
                "errno" => errno = Some(value.as_str().ok_or_else(|| form("errno is not a symbol"))?),
                "bytes" => bytes = Some(value.as_u64().ok_or_else(|| form("bytes is not a count"))?),
                "nth" => {
                    nth = value
                        .as_u64()
                        .filter(|nth| *nth >= 1)
                        .ok_or_else(|| form("nth does not count from 1"))?
                }
                other => return Err(form(format!("a fault has no key {other}"))),
            }
        }
        let point = point.ok_or_else(|| form("a fault names its point"))?;
        let injected = match (kind, errno, bytes) {
            (Some("io"), None, None) => Injected::Io { errno: None },
            (Some("io"), Some(symbol), None) => Injected::Io {
                errno: Some(errno_of(symbol).ok_or_else(|| ArmError::Errno(symbol.to_owned()))?),
            },
            (Some("short"), None, Some(bytes)) => Injected::Short { bytes },
            (Some("broken"), None, None) => Injected::Broken,
            (kind, _, _) => {
                return Err(form(format!(
                    "the fault of {point} is no io, short with bytes or broken: {kind:?}"
                )))
            }
        };
        Ok(Slot {
            point: point.to_owned(),
            injected,
            nth,
            visits: AtomicU64::new(0),
            fired: AtomicBool::new(false),
        })
    }

    /// The value of an errno symbol on the target; a target without errno has none.
    #[cfg(unix)]
    fn errno_of(symbol: &str) -> Option<i32> {
        macro_rules! table {
            ($($name:ident)*) => {
                match symbol {
                    $(stringify!($name) => Some(libc::$name),)*
                    _ => None,
                }
            };
        }
        table!(
            E2BIG EACCES EADDRINUSE EADDRNOTAVAIL EAGAIN EALREADY EBADF EBUSY ECANCELED ECHILD ECONNABORTED ECONNREFUSED
            ECONNRESET EDEADLK EDQUOT EEXIST EFAULT EFBIG EHOSTUNREACH EINTR EINVAL EIO EISDIR ELOOP EMFILE EMLINK
            EMSGSIZE ENAMETOOLONG ENETDOWN ENETUNREACH ENFILE ENOBUFS ENODEV ENOENT ENOEXEC ENOLCK ENOMEM ENOSPC ENOSYS
            ENOTCONN ENOTDIR ENOTEMPTY ENOTSOCK ENOTSUP ENOTTY ENXIO EPERM EPIPE ERANGE EROFS ESPIPE ESRCH ESTALE
            ETIMEDOUT ETXTBSY EXDEV
        )
    }

    #[cfg(not(unix))]
    fn errno_of(_symbol: &str) -> Option<i32> {
        None
    }

    #[cfg(test)]
    mod tests {
        use super::super::{point, Injected};
        use super::{arm, errno, left, take, ArmError, Armed};

        const COPY: &str = "sample.copy";
        const RENAME: &str = "sample.rename";

        fn armed(member: &str, faults: &str) -> Result<(u64, Armed), ArmError> {
            let id = arm(member, faults)?;
            Ok((id, take(member)))
        }

        #[test]
        fn a_point_without_an_arming_does_nothing() {
            assert_eq!(point!(COPY), None);
            assert_eq!(Armed::empty().run(|| point!(COPY)), None);
        }

        #[test]
        fn a_fault_fires_once_at_its_point_and_only_while_installed() -> Result<(), ArmError> {
            let (id, armed) = armed(
                "a.once",
                r#"[{"point": "sample.copy", "kind": "io", "errno": "ENOSPC"}]"#,
            )?;
            assert_eq!(point!(COPY), None);
            let seen = armed.run(|| (point!(RENAME), point!(COPY), point!(COPY)));
            assert_eq!(
                seen,
                (
                    None,
                    Some(Injected::Io {
                        errno: Some(libc::ENOSPC)
                    }),
                    None
                )
            );
            assert_eq!(point!(COPY), None);
            assert_eq!(left(id)?, Vec::<String>::new());
            Ok(())
        }

        #[test]
        fn nth_counts_the_visits_of_the_point() -> Result<(), ArmError> {
            let faults = r#"[{"point": "sample.copy", "kind": "short", "bytes": 3, "nth": 2}, {"point": "sample.rename", "kind": "broken"}]"#;
            let (id, armed) = armed("a.nth", faults)?;
            let seen = armed.run(|| (point!(COPY), point!(COPY), point!(COPY)));
            assert_eq!(seen, (None, Some(Injected::Short { bytes: 3 }), None));
            assert_eq!(left(id)?, vec![String::from(RENAME)]);
            Ok(())
        }

        #[test]
        fn an_arming_goes_to_its_member_on_its_thread_only() -> Result<(), ArmError> {
            let id = arm("a.member", r#"[{"point": "sample.copy", "kind": "io"}]"#)?;
            assert_eq!(take("a.other").run(|| point!(COPY)), None);
            let other = std::thread::spawn(|| take("a.member").run(|| point!(COPY)));
            assert!(matches!(other.join(), Ok(None)));
            assert_eq!(
                take("a.member").run(|| point!(COPY)),
                Some(Injected::Io { errno: None })
            );
            assert_eq!(take("a.member").run(|| point!(COPY)), None);
            assert_eq!(left(id)?, Vec::<String>::new());
            Ok(())
        }

        #[test]
        fn an_entry_point_inside_another_does_not_see_the_outer_arming() -> Result<(), ArmError> {
            let (id, outer) = armed("a.outer", r#"[{"point": "sample.copy", "kind": "broken"}]"#)?;
            let seen = outer.run(|| (take("a.inner").run(|| point!(COPY)), point!(COPY)));
            assert_eq!(seen, (None, Some(Injected::Broken)));
            assert_eq!(left(id)?, Vec::<String>::new());
            Ok(())
        }

        #[test]
        fn the_earlier_arming_comes_back_after_a_panic() -> Result<(), ArmError> {
            let (id, outer) = armed("a.panic", r#"[{"point": "sample.copy", "kind": "broken"}]"#)?;
            let seen = outer.run(|| {
                let inner = std::panic::catch_unwind(|| Armed::empty().run(|| panic!("the work panics")));
                (inner.is_err(), point!(COPY))
            });
            assert_eq!(seen, (true, Some(Injected::Broken)));
            assert_eq!(left(id)?, Vec::<String>::new());
            Ok(())
        }

        #[test]
        fn an_arming_that_no_entry_point_took_is_left_whole_and_forgotten() -> Result<(), ArmError> {
            let id = arm("a.never", r#"[{"point": "sample.copy", "kind": "broken"}]"#)?;
            assert_eq!(left(id)?, vec![String::from(COPY)]);
            assert_eq!(take("a.never").run(|| point!(COPY)), None);
            assert_eq!(left(id), Err(ArmError::Id(id)));
            Ok(())
        }

        #[test]
        fn a_list_that_is_not_the_form_of_a_case_is_not_armed() {
            let bad = [
                ("{}", "not a list"),
                ("[1]", "not an object"),
                (r#"[{"kind": "io"}]"#, "names its point"),
                (
                    r#"[{"point": "sample.copy", "kind": "slow"}]"#,
                    "no io, short with bytes or broken",
                ),
                (
                    r#"[{"point": "sample.copy", "kind": "short"}]"#,
                    "no io, short with bytes or broken",
                ),
                (
                    r#"[{"point": "sample.copy", "kind": "broken", "errno": "EIO"}]"#,
                    "no io, short with bytes or broken",
                ),
                (
                    r#"[{"point": "sample.copy", "kind": "io", "nth": 0}]"#,
                    "nth does not count from 1",
                ),
                (
                    r#"[{"point": "sample.copy", "kind": "io", "times": 2}]"#,
                    "no key times",
                ),
            ];
            for (faults, expected) in bad {
                match arm("a.bad", faults) {
                    Err(ArmError::Form(detail)) => assert!(detail.contains(expected), "{faults}: {detail}"),
                    other => panic!("{faults}: expected a form error, got {other:?}"),
                }
            }
            assert_eq!(
                arm(
                    "a.bad",
                    r#"[{"point": "sample.copy", "kind": "io", "errno": "ENOTANERRNO"}]"#
                ),
                Err(ArmError::Errno(String::from("ENOTANERRNO")))
            );
        }

        /// GN-8a: the value of an errno symbol is that of the table that arms the faults, which a PHP test reads.
        #[test]
        fn an_errno_symbol_has_the_value_of_the_target() {
            assert_eq!(errno("EIO"), Ok(libc::EIO));
            assert_eq!(errno("ENOSPC"), Ok(libc::ENOSPC));
            assert_eq!(errno("ENOTANERRNO"), Err(ArmError::Errno(String::from("ENOTANERRNO"))));
        }
    }
}

#[cfg(all(test, not(feature = "fault-test")))]
mod tests {
    #[test]
    fn a_point_is_nothing_without_the_feature() {
        assert_eq!(super::point!("sample.copy"), None);
    }
}
