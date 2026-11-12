<!-- doc-id: core-api -->
# bindgen_core public API

[한국어](core-api.ko.md)

The crate `bindgen_core` is the runtime support that generated binding crates and core crates share. It holds only the
types of the design rules named below and no rule of any library.

## Crate

- Path: `packages/core/rust` of this repository; package `polyspec-bindgen-core`, library name `bindgen_core`, version
  0.0.1, edition 2021, rust-version 1.99.0, toolchain 1.99.0 (`rust-toolchain.toml`).
- Dependencies: `tokio-util` 0.7.20 without default features (the state of `Cancel`), `indexmap` 2.14.2 with `std` only
  (the entries of `OrderedMap`).
- Feature `construct`: makes the wait tokens and `Raised` constructible, and the handle of a `Raised` readable. A generated binding crate enables it; a core crate enables it
  only in its `[dev-dependencies]`, so that its library, built on its own, cannot make a token (I-2 (4)).
- Use from another repository during development: a path dependency on this folder,
  `bindgen_core = { package = "polyspec-bindgen-core", path = "<checkout>/packages/core/rust" }`, named by a local link
  and never by a tracked manifest (PRINCIPLES P30).

## Items

| Item | Design rule | Summary |
|---|---|---|
| `Io` | I-2 (4), B-5 (a) | Token of `wait: blocking_io`, first argument of a core function that does short blocking I/O. `Io::for_generated_call()` with `construct`. |
| `ProcessWait` | I-2 (4), B-5 (b) | Token of `wait: process_wait`, first argument of a core function that waits on another process. Not convertible to or from `Io`. `ProcessWait::for_generated_call()` with `construct`. |
| `cancel_pair() -> (CancelTrigger, Cancel)` | T-1 `cancel` | Generated code keeps the trigger; the core gets the `Cancel`. |
| `Cancel` | T-1 `cancel` | `is_cancelled(&self) -> bool`, `async cancelled(&self)`; `Clone`. A dropped trigger never cancels. |
| `CancelTrigger` | T-1 `cancel` | `cancel(&self)`, idempotent. |
| `Cleanup` | U-1 `cleanup`, B-10 | Marker trait without methods or blanket implementation; implemented by the core type of a unit with `cleanup`. |
| `OrderedMap<T>` | T-2 `map<T>` | Insertion-ordered map with text keys: `new`, `with_capacity`, `insert -> Option<T>` (replaces in place, returns the old value), `get`, `len`, `is_empty`, `iter`, `IntoIterator`, `Default`; equality depends on order; no `FromIterator`, which would drop repeated keys. |
| `KeyedMap<T>`, `Key` | T-2 `keyed_map<T>`, U-7 (c) | Insertion-ordered map whose keys are `Key::Int(i64)`, `Key::Bytes(Vec<u8>)` or `Key::Text(String)`; the same API and rules as `OrderedMap`. |
| `Raised` | U-3, E-7 | A language exception raised in a callback, held as a handle that the core does not open; `Raised::from_generated(Handle)` and `handle()` only with `construct`; `Display`, `std::error::Error`; no kind. |
| `Failure<E>` | E-1c | `Kind(E)` or `Raised(Raised)`: the error type of a core function that calls a callback; `From<Raised>`, `Display`, `std::error::Error`. |
| `ValueType` | T-3 | `Json`, `Template`, `Php`; `ALL`, `as_str()`. |
| `naming::{convert, Word, Lang, Role}` | N-2 | The name conversion, public for generators outside bindgen; `naming::Lang` is `Php`, `Python`, `Js`, `Go`, `Rust`; `naming::Role` is `Class`, `Callable`, `Variable`, `Constant`. Its vectors are shared with bindgen's TypeScript conversion. |
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
| `HostValue` | B-1, T-2 `host_value` | `Number` is a Python `int` outside `i64` as its decimal token; `Bytes` is a Python `bytes`; every JavaScript number is `Float` and the core decides whether it is an integer; `PhpReference` names a reference element and its identity. One level of an incoming value: `Null`, `Undefined`, `Bool`, `Int(i64)`, `Number(String)`, `Float(f64)`, `Text(HostText)`, `Bytes(Vec<u8>)`, `List`, `PhpArray { is_list }`, `Map`, `PlainObject { prototype }`, `PhpReference { identity, target }`, `StdClass`, `Date`, `Callable`, `Object { type_name, json_serializable }`, `Value { kind, handle }`, `Other { type_name, handle }`. |
| `HostText` | B-1, B-3 | `Bytes(Vec<u8>)` (PHP, Go), `Utf16(Vec<u16>)` (JavaScript), `CodePoints(Vec<u32>)` (Python). |
| `Prototype` | B-1 | `Object`, `Null`. |

## Not yet in the crate

The protocol through which a core asks the binding for the children of a `HostValue` handle, and the binding asks the
core for the children of an `OutValue` handle, is not defined: the design names the handles but not the calls.

