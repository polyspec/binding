<!-- doc-id: core-api -->
# binding_core public API

[한국어](core-api.ko.md)

The crate `binding_core` is the runtime support that generated binding crates and core crates share. It holds only the
types of the design rules named below and no rule of any library.

## Crate

- Path: `packages/core/rust` of this repository; package `polyspec-binding-core`, library name `binding_core`, version
  0.0.1, edition 2021, rust-version 1.99.0, toolchain 1.99.0 (`rust-toolchain.toml`).
- Dependencies: `tokio-util` 0.7.20 without default features (the state of `Cancel`), `indexmap` 2.14.2 with `std` only
  (the entries of `OrderedMap`) and, on Unix, `libc` 0.2.191 without default features (the value of an errno symbol,
  `errno::value`).
- Feature `lock`: adds `Exclusive`, `Shared`, `Reading` and `Writing` and the dependency `tokio` 1.54.1 with `sync`
  only. The binding crates of Python, Node and PHP enable it; a core crate does not (B-5c).
- Feature `driver`: adds `driver::block_on` and `driver::Caught` and the dependency `tokio` 1.54.1 with `rt-multi-thread`.
  The binding crates of PHP, Python and Node of a contract with a member of `wait: async_driver` enable it (GN-6n); a
  core crate does not.
- Feature `construct`: makes the wait tokens and `Raised` constructible, and the handle of a `Raised` readable. A generated binding crate enables it; a core crate enables it
  only in its `[dev-dependencies]`, so that its library, built on its own, cannot make a token (I-2 (4)).
- Feature `fault-test`: compiles the arming of fault injection points (`fault::Armed`, `arm`, `take`, `left`) with the
  optional dependency `serde_json` 1.0.154 (the list of faults of a case). A core that has points declares `fault-test = ["polyspec-binding-core/fault-test"]` and nothing
  else of it; a binding turns on the feature of each core whose points its cases name. No release build has it (G-5).
- Tests: a test file of the crate that needs a feature (`tests/lock.rs`, `tests/driver.rs`) is a `[[test]]` target
  with that feature in `required-features`, so `cargo test` without the feature does not build it, and a run of the
  target runs its tests; a target that ran no test would pass while it checked nothing (HR-84).
- Use from another repository during development: a path dependency on this folder,
  `binding_core = { package = "polyspec-binding-core", path = "<checkout>/packages/core/rust" }`, named by a local link
  and never by a tracked manifest (PRINCIPLES P30).

## Items

| Item | Design rule | Summary |
|---|---|---|
| `Io` | I-2 (4), B-5 (a) | Token of `wait: blocking_io`, first argument of a core function that does short blocking I/O. `Io::for_generated_call()` with `construct`. |
| `ProcessWait` | I-2 (4), B-5 (b) | Token of `wait: process_wait`, first argument of a core function that waits on another process. Not convertible to or from `Io`. `ProcessWait::for_generated_call()` with `construct`. |
| `cancel_pair() -> (CancelTrigger, Cancel)` | T-1 `cancel` | Generated code keeps the trigger; the core gets the `Cancel`. |
| `Cancel` | T-1 `cancel` | `is_cancelled(&self) -> bool`, `async cancelled(&self)`; `Clone`. A dropped trigger never cancels. |
| `Cancel::on_cancel(&self, wake: impl FnOnce() + Send + 'static) -> CancelGuard` | B-5 (b) | Calls `wake` once on the trigger's thread when the caller cancels, or at once if it already did, so a blocking wait (a `Condvar`, a parked thread) wakes without polling; `wake` must not block. |
| `CancelGuard` | B-5 (b) | Dropping it removes the function if it has not run. |
| `CancelTrigger` | T-1 `cancel` | `cancel(&self)`, idempotent; runs the registered functions after the state is cancelled. |
| `Exclusive<T>`, `Shared<T>` | U-2 busy, B-5c | With `lock`. The core value of a class unit behind a lock that is only tried: `Exclusive` is an `Arc<tokio::sync::Mutex<T>>`, `Shared` an `Arc<tokio::sync::RwLock<T>>`, each with the mark `poisoned`. `new(T)`, `Clone` (another handle of the same value), `read(&self, class, beside: &[Option<&Reading<_>>]) -> Result<Reading<_>, BindingError>` (the guard of a read place; the guard in `beside` of the same instance is shared), `write(&self, class) -> Result<Writing<_>, BindingError>` (the guard of a write place), `take(&self, class) -> Result<T, BindingError>` (the value of a place of the receiver `self`, which leaves the lock empty, GN-6o). A lock that is held is kind `busy`, a poisoned object kind `internal`, and an object whose value was taken kind `consumed` at every later `read`, `write` and `take`; no call waits. `taken(&self) -> bool` tells a destructor whether the value was taken (GN-6p). |
| `Reading<G>`, `Writing<G>` | B-5c | With `lock`. The owned guards (`Send` with their value) of a read place (`Deref`, `Clone`, released with its last clone) and of a write place (`Deref`, `DerefMut`); a `Writing` that a panic unwinds through sets `poisoned` before the lock is released. |
| `Cleanup` | U-1 `cleanup`, B-10 | Marker trait without methods or blanket implementation; implemented by the core type of a unit with `cleanup`. |
| `OrderedMap<T>` | T-2 `map<T>` | Insertion-ordered map with text keys: `new`, `with_capacity`, `insert -> Option<T>` (replaces in place, returns the old value), `get`, `len`, `is_empty`, `iter`, `IntoIterator`, `Default`; equality depends on order; no `FromIterator`, which would drop repeated keys. |
| `KeyedMap<T>`, `Key` | T-2 `keyed_map<T>`, U-7 (c) | Insertion-ordered map whose keys are `Key::Int(i64)`, `Key::Bytes(Vec<u8>)` or `Key::Text(String)`; the same API and rules as `OrderedMap`. |
| `Raised` | U-3, E-7 | A language exception raised in a callback, held as a handle that the core does not open; `Raised::from_generated(Handle)` and `handle()` only with `construct`; `Display`, `std::error::Error`; no kind. |
| `Failure<E>` | E-1c | `Kind(E)`, `Raised(Raised)` or `Callback(Box<dyn std::error::Error + Send + Sync>)`: the error type of a core function that calls a callback; the last arm returns a Rust callback's error to its Rust caller unchanged, is built without `construct` and never reaches generated code. `From<Raised>`, `Display`, `std::error::Error` (its source is the Rust callback's error); it derives `Debug` and no other trait. |
| `ValueType` | T-3 | `Json`, `Template`, `Php`; `ALL`, `as_str()`. |
| `naming::{convert, Word, Lang, Role}` | N-2 | The name conversion, public for generators outside binding; `naming::Lang` is `Php`, `Python`, `Js`, `Go`, `Rust`; `naming::Role` is `Class`, `Callable`, `Variable`, `Constant`. Its vectors are shared with binding's TypeScript conversion. |
| `Kinds` | F-2, E-3, I-2 (3) | `kind(&self) -> &'static str`, `status(&self) -> Option<u16>`, `errno(&self) -> Option<i32>`, all required; implemented by every core error enum and by `BindingError`. |
| `Category` | E-1, F-3 | `Value`, `Type`, `Io`, `Store`, `Busy`, `Internal`; `ALL`, `as_str()`. |
| `BindingError` | E-1a | `InvalidNumber { subject, expected: NumberType }`, `InvalidText { subject, cause: TextCause }`, `InvalidPath { subject }`, `DirectConstruction { class }`, `InvalidCallback { subject, member }`, `Consumed { class }`, `InvalidArgumentType { subject, expected }`, `Busy { class }`, `WrongThread { subject }`, `Internal { detail }`; `category()`, `KINDS` (kind and category table), `Kinds`, `Display` (the whole message, E-4), `std::error::Error`. |
| `NumberType` | B-2 | `Int`, `Int64`, `Uint`, `Float`. |
| `TextCause` | B-3 | `UnpairedSurrogate`, `NotUtf8`, `AboveLatin1`. |
| `Handle` | B-1, T-3 | Opaque `u64` of the side that made it: `new(u64)`, `raw()`. |
| `ValueKind` | U-1 `value`, T-3 | `null`, `bool`, `int`, `int64`, `float`, `number`, `text`, `bytes`, `list`, `map`, `object`, `reference`, `safe_text`, `native`, `nested:<value type>`; `ALL`, `as_str()`. The `kind` of `out` and `in` rows. |
| `Predicate` | U-1 `when` | `utf8` (bytes), `sequence_keys` (map), `safe_integer` (int), `integral_float` (float); `ALL`, `as_str()`, `kind()`. |
| `OutValue` | T-3 | One level of an outgoing value: `Null`, `Bool`, `Int(IntOut)`, `Int64(i64)`, `Float(FloatOut)`, `Number(String)`, `Text(String)`, `Bytes(BytesOut)`, `List { handle, len }`, `Map(MapOut)`, `Object { handle, len }`, `Reference { handle, value }`, `SafeText(String)`, `Native(Handle)`, `Nested { value_type, value }`; `kind()`, `predicate(Predicate) -> Option<bool>` (`None` when the predicate does not apply to the kind). |
| `IntOut`, `FloatOut`, `BytesOut`, `MapOut` | U-1 `when` | Wrappers whose predicate is computed here (`MapOut::new` takes `sequence_keys` from the core, which sees the keys). One handle is one language object: a container is made before its children, so shared and cyclic values keep their shape (U-7 (d)). |
| `HostValue` | B-1, T-2 `host_value` | `Int` is also a JavaScript `bigint` in `i64`; `Number` is a Python `int` or a JavaScript `bigint` outside `i64` as its decimal token; `Bytes` is a Python `bytes`; `Float` is a float of PHP, Python or Go, which stays a float; every JavaScript number is `UntypedNumber` and the core decides whether it is an integer (U-7 (f)); `PhpReference` names a reference element and its identity. One level of an incoming value: `Null`, `Undefined`, `Bool`, `Int(i64)`, `Number(String)`, `Float(f64)`, `UntypedNumber(f64)`, `Text(HostText)`, `Bytes(Vec<u8>)`, `List`, `PhpArray { is_list }`, `Map`, `PlainObject { prototype }`, `PhpReference { identity, target }`, `StdClass`, `Date`, `Callable`, `Object { type_name, json_serializable }`, `Value { kind, handle }`, `Other { type_name, handle }`. |
| `HostText` | B-1, B-3 | `Bytes(Vec<u8>)` (PHP, Go), `Utf16(Vec<u16>)` (JavaScript), `CodePoints(Vec<u32>)` (Python). |
| `Prototype` | B-1 | `Object`, `Null`. |
| `OutValues` | B-1, U-7 (d) | The trait through which generated code asks the core for the children of the handles of an `OutValue`; the core's `out` function of a value alias returns it beside the root. `item(&mut self, list, index) -> OutValue`, `entry(&mut self, map, index) -> (OutValue, OutValue)` (a map or an object, in order). The same handle is the same language object. |
| `HostValues` | B-1 | The trait through which a core asks the binding for the children of the handles of a `HostValue`; generated code implements it. `item(&mut self, list, index) -> Result<HostValue, Raised>`, `entry(&mut self, map, index) -> Result<(HostValue, HostValue), Raised>` (a map, a PHP array, a plain object, a `stdClass`, in the language's order), `read(&mut self, value) -> Result<HostValue, Raised>` (the `read` member of a value table's class). A question may run language code, so its failure is that code's exception. |
| `fault::point!(name) -> Option<fault::Injected>` | G-5, X-1, GN-5 | A fault injection point of a core, named `<library>.<id>` by a `#[doc(hidden)] pub const` of the core that the contract's `faults` names. A macro, always there, so that the point is judged by the feature `fault-test` of the crate that writes it: Cargo unifies the features of binding_core, and one core with `fault-test` turns on binding_core's for every core of the build. `None` where that crate lacks its own `fault-test` and where no fault is armed for the point on this thread. Each use is a visit of the point. |
| `fault::Injected` | G-5 | `Io { errno: Option<i32> }` (the I/O call of the place fails, with the target's value of the fault's errno symbol), `Short { bytes: u64 }` (the read or write handles that many bytes and ends), `Broken` (the invariant of the place is broken). |
| `fault::arm(member, faults) -> Result<u64, ArmError>` | G-5 | With `fault-test`. Arms the JSON list of a case's `faults` (`point`, `kind`, `errno`, `bytes`, `nth`) for the next call of the member id from this thread and gives the id of the arming. A fault fires once, at the `nth` visit of its point (1 without `nth`). An errno symbol is one of POSIX that Linux and macOS both have; a symbol that the target does not have, or a target without errno, is `ArmError::Errno`. |
| `fault::take(member) -> Armed`, `fault::Armed::{empty, run}` | G-5 | With `fault-test`. A generated entry point takes the arming of its member and thread, or an empty one, in its synchronous part, moves it with its work and runs the work in `run`, which installs the arming on the thread and puts the earlier one back, also after a panic. `point` reads only the installed arming, so an entry point that a callback enters does not see the outer arming, and a task or thread that the core starts does not inherit it. |
| `fault::Armed::around(self, future) -> Around<F>` | G-5, GN-6n | With `fault-test`. A future that installs the arming around each poll of `future` and puts the earlier one back after it, also after a panic, so that the points of an `async fn` see the arming of their call on any thread of the runtime. |
| `driver::block_on(future) -> Result<F::Output, BindingError>` | GN-6n | With `driver`. Runs `future` on the runtime of the process, a multi-thread tokio runtime with every driver of the build, which the first call makes; the calling thread waits until the future ends. A runtime that cannot be made is `BindingError::Internal`. A thread of that runtime does not call it. |
| `driver::Caught<F>`, `driver::Caught::new(future)` | GN-6n, B-7 | With `driver`. A future whose output is `Result<F::Output, String>`: a panic of a poll of `future` ends it with the message of the panic, which generated code gives as kind `internal`. |
| `fault::left(id) -> Result<Vec<String>, ArmError>` | G-5 | With `fault-test`. The points of the arming whose fault did not fire, and forgets the arming; a generated test requires it to be empty. |
| `errno::value(symbol) -> Option<i32>` | G-5 | Without a feature. The value of an errno symbol on the target, from the table that `arm` reads, and none for a symbol that the target does not have; the PHP extension gives it to its tests as `Internal\errnoOf` (GN-8a). |
| `fault::ArmError` | G-5 | `Form(String)`, `Errno(String)`, `Id(u64)`, `Poisoned`; `Display`, `std::error::Error`. |

## Not yet in the crate

Every protocol of the design is in the crate.

