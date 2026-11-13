<!-- doc-id: generator -->
# Generator

[한국어](generator.ko.md)

`binding generate [--root <repository>] [--out <directory>]` checks `packages/rust/interface.json` (docs/spec/contract-check.md)
and writes the bindings of its targets. This document states the rules of the generator that the design leaves to it;
the design ids are those of the binding design.

## Scope

- **GN-1** The generator writes PHP (ext-php-rs 0.16.4), Python (PyO3 0.30.1, abi3-py314), Node (napi 3.16.2), Go
  (cgo over a C ABI static library, GN-15) and WASM (wasm-bindgen 0.2.130, GN-18) for
  functions units, class units (constructor, static members, methods and properties with the receiver `&self` or `&mut self` (GN-6h), and
  the members of kind `iterate`, `stringify` and `to_json`, GN-6f, GN-6g),
  records (as parameters and in their result form, also of another repository), value aliases (also of another
  repository, GN-6k), enums, constants, error classes and error units (GN-7a),
  and for Python, Node and PHP the type `source` of a parameter (GN-6j) and the defaults of parameters and record fields
  (GN-6i).
  callback interfaces (U-3, synchronous members with the receiver in `core.receiver`), Any other item (an async or
  recognizing callback, a function type, a value unit, a wait other than `none`, a default
  that GN-6i does not list, `cleanup`, a receiver
  `self`, `only` of a unit, `native`, a naming exception, a kind of another library, the
  type `source` outside a parameter) is refused by name
  before anything is written (G-4, P-4). Go refuses a class unit (T-5); Go and WASM refuse a callback unit, a record of
  another repository and a value alias of another repository (T-3, U-3, GN-6k), and the type `source`, a default and an error unit (GN-7a); WASM refuses a value alias (U-7) and generates a class unit as GN-18a states; Go also refuses a tuple of different types inside another type (a Go array has one element type) and a tuple
  parameter.
- **GN-1a** The generator reads the whole contract before it fails: it names every refused item, one line each, and
  then fails without writing anything (G-4). An item (a unit, a member, a field, a row of the kinds) is named with the
  first reason that its checks find, because a later check of the same item reads what an earlier one refused; a unit
  refused as a whole is not named again for the items that depend on it. A refusal that a target finds only while it
  writes its files (a type that its conversions do not take) is named after the refusals of the contract are none,
  and every target is emitted before the generation fails, so the refusal of one target does not hide that of another.
  Why: a generator that stops at the first refusal shows one defect at a time, so a contract is fixed by as many runs as
  it has refused items.
- **GN-1b** A generation of some targets of the contract (`generate` with `targets`) writes for them the same files
  that the generation of every target writes, and checks the refusals of those targets alone; the refusals of the
  contract are refusals of every target. Why: one target that the generator refuses does not stop the generation of
  another.
- **GN-2** The result depends only on the contract, the case files that `cases` names, the version and library name of
  the core crate (read from its manifest as TOML) and binding itself; it holds no time, path or host, and lists are in
  contract order (I-5). `--out` writes the same files under another directory; the tests of `packages/ts` generate twice
  in two directories and compare the bytes.

## Layout (L-1, L-2)

- **GN-3** binding owns five directories and writes each whole through a staging directory, so no file of an earlier
  generation stays and a reader never sees a part: `packages/php-ext/generated`, `packages/python/generated`,
  `packages/ts/generated`, `packages/go/internal/ffi/generated`, `packages/ts/wasm/generated`. In the Go module, which
  holds hand-written folders beside the generated packages (L-1), binding owns the files `zz_generated_*.go` rather
  than a directory: a generation removes every one of them under `packages/go` and writes its own; they are tracked
  (G-6). No source of binding is copied into the repository: the core and the binding crates depend on
  `polyspec-binding-core`, a Git dependency of the binding repository before its first release, whose commit the
  repository's `Cargo.lock` pins.
- **GN-3a** Each binding is a tracked thin package at its final place: `packages/<python|ts|php-ext>/Cargo.toml`, the
  entry `src/lib.rs`, which holds the crate's attributes and includes `generated/lib.rs` (an included file cannot hold
  them), the language's manifest (`pyproject.toml`, `package.json`, `composer.json`), which a language's packager
  needs beside the crate, and a file of the crate that does not depend on the contract (the Node `build.rs`, which the
  manifest names), so `cargo fmt --all` and the workspace's metadata work before a generation. A core at
  `packages/<component>/rust` (L-1) has its binding packages and generated directories at
  `packages/<component>/<python|ts|php-ext>`; `scaffold` and `generate` take its contract with `--contract`.
  `scaffold` writes under `--out` when it is given, and a unit that is still `todo` (CK-2) does not stop it, because the
  thin packages depend only on the package and name items; `check` and `generate` report it. `scaffold` stops only
  for a finding of the schema (CK-1) or of the names (CK-18), and it does not ask Cargo for the workspace, so a binding
  manifest of an earlier scaffold that no longer resolves (a renamed core crate) does not stop the rewrite.
- **GN-3b** A language whose package is a hand-written host package (L-2a, `packages.<lang>.host: true`) holds the
  binding in one form, which `scaffold`, `generate` and `check` (CK-19) share; `scaffold` does not write the host's
  manifest, and `check` reads from it only the items below.
  - Python: the binding crate is `packages/<component>/python/native/` (`Cargo.toml`, `src/lib.rs`, `generated/`
    with the Rust source and the tests; its path dependencies climb one directory more). The generated Python
    package is the subpackage `<module>._binding` in the host's source root, `src/<module path>/_binding/`, a
    directory that binding owns and writes whole; its native module is `<module>._binding._native`, and host code
    imports the API from `<module>._binding`. The host's `pyproject.toml` has `build-system.build-backend`
    `maturin`, `tool.maturin.manifest-path` `native/Cargo.toml`, `tool.maturin.python-source` `src` and
    `tool.maturin.module-name` `<module>._binding._native`.
  - Node: the binding crate is `packages/<component>/ts/native/` with the Node `build.rs`; the generated entry and
    declarations are `native/generated/`. The host's `package.json` has its `name`, in `files`
    `native/generated/index.cjs`, `native/generated/index.mjs` and `native/generated/index.d.ts`, and the platform
    packages of GN-3c in `optionalDependencies` at its own `version`; host code imports `native/generated/index.mjs`
    (or `index.cjs`) by its relative path.
  - PHP: an extension is a Composer package of its own (type `php-ext`), named `<host package>-native`, at
    `packages/<component>/php/native/`: `scaffold` writes its crate and its `composer.json` there, and `generated/`
    is beside them. The host library `packages/<component>/php/composer.json` requires `ext-<extension name>` (`*`);
    the extension registers the classes and functions when PHP loads it. A host layout has no `php-ext/` directory.
- **GN-3c** The Node addon is in one npm package per platform of T-2 (plan), named `<npm package>-<platform>` with the
  napi-rs platform names `linux-x64-gnu`, `linux-arm64-gnu` and `darwin-arm64`; it holds `<npm name without scope>.
  <platform>.node` as its `main`, with `os`, `cpu` and `libc`. The npm package of the library, or its host package
  (L-2a), holds no addon and names every platform package in `optionalDependencies` at its own version, so npm
  installs the one of the machine; release tooling builds and publishes the platform packages (K-3). The generated
  entry loads `<npm package>-<platform>` and, when it is not installed, the file `<name>.<platform>.node` beside the
  entry, which a build in a checkout puts there. The end-to-end check packs the platform package of its machine as a
  release does and installs both tarballs.
- **GN-4** Each binding crate is a member of the repository's workspace (L-2) and carries the lints of R-1 itself,
  with `unsafe_code` deny rather than forbid: the macros of ext-php-rs and napi-rs expand to unsafe code, which a core's
  workspace may forbid, and each unsafe block of the generated code carries an allow with its reason. The generated
  code holds only the helper functions it uses, because the lints deny dead code.
- **GN-4a** A target with a row in `core.features` (I-1) builds the core with those features only: its binding
  manifest depends on the core with `default-features = false` and the row's features.
- **GN-5** Every crate has `rust-version = "1.99.0"` and the feature `panic-test`, which adds the entry point of the
  B-7 test. The test features of a binding crate are the features of this table and no other; each adds entry points
  of the names below, the manifest that `binding scaffold` writes turns none on by default, and no release build has
  one (G-5). `<Alias>` and `<alias>` are the name of the alias in the class form of the language and in snake_case.

  | Feature | Use | Python | Node | PHP | Go C symbol |
  |---|---|---|---|---|---|
  | `panic-test` | B-7; the poison of B-5c (GN-6h) | `_panic_test`, `_panic_test_held` | `__panicTest`, `__panicTestHeld` | `<namespace>\Internal\panicTest`, `panicTestHeld` | `<prefix>__panic_test` |
  | `codec-test` | the round trip of Go's conversions (GN-13b); the `in` function of a value alias alone (U-7) | `_alias_in_<alias>` | `__aliasIn<Alias>` | `<namespace>\Internal\aliasIn<Alias>` | `<prefix>__echo_<type>` |
  | `fault-test` | fault injection (GN-8a) | `_arm_faults`, `_fault_left` | `__armFaults`, `__faultLeft` | `<namespace>\Internal\armFaults`, `faultLeft` | none yet |

  For a contract with a class that has a write place (GN-6h), `panic-test` also adds the poison entry point of the
  B-5c test, which takes an instance, takes its write guard and panics.
  A Python, Node or PHP crate has `codec-test` when an alias of the contract has `in_raises`, and
  `fault-test = ["<core crate>/fault-test"]` when the contract has `faults`: the feature of the core, which is
  `fault-test = ["polyspec-binding-core/fault-test"]`, compiles the arming. Go and WASM have neither of the two yet: a
  contract with `faults` or `in_raises` and one of these targets is refused by name (G-4).

## The core boundary (T-1, I-2 (1))

- **GN-6** Each argument is converted into a `let` of the Rust type of T-1. A parameter of a type with two forms (text,
  latin1, bytes, source, path) is passed borrowed (`&String` and `&Vec<u8>` coerce to `&str` and `&[u8]`), an
  `optional<T>` of one with `as_deref()`, a Copy type (bool, the numbers, an enum) by value, any other type (a list, a
  record) by reference. A record is built from its expanded fields, which are owned. A return has the form that is usual for its Rust function
  (an accessor borrows, a computed value is owned), so the generated code binds it without a type and reads either
  form the same way (`AsRef`, `Borrow`, `IntoIterator`, a reference to a tuple field), except a return of `none`, which
  it binds as the unit (`let (): () = …`): a core that returns anything else there, a `Result` too, does not compile, so
  its `Err` is not dropped (E-1c), and the unit pattern leaves no variable unused, which the lints deny. An integer return (uint, int,
  int64) may be a narrower Rust integer, which the generated code widens with `From` (traits `WideUint` and `WideInt`
  for the integer and a reference to it); a parameter is the type of the table. A contract name that is a Rust keyword
  is a raw identifier (`r#type`).
- **GN-6a** A record that a function returns, or that is an element of a parameter, has its result form (T-4) in each
  language: Python a frozen keyword-only `dataclass` in `<root>._types`, Node a plain object of its members, PHP a
  final class of public readonly properties whose constructor takes every field by name. Each binding converts it both
  ways (`in_<record>`, `out_<record>`); a value of another type in its place is kind `invalid_argument_type`.
- **GN-6b** A class unit (T-5) is a final language class that holds the core value: Python a frozen `pyclass` of the
  native module, Node a napi class exported by its JavaScript name, PHP a `php_class` with the flag final. A method or
  property calls the core path with the held value as its receiver; a static member or the constructor that returns
  the class wraps the value. `constructible: false` leaves no constructor (PHP declares it private). A property is a
  getter in Python and Node and a method in PHP (I-3). napi-rs defines a class's methods as not configurable, so a
  Node method or static member that takes arguments is the addon's `__<name>`, not enumerable and absent from the
  declarations, and the entry defines `<name>` over it with the checks of G-7. napi-rs keeps the classes it parsed in
  the state of its macro process, which rustc does not keep between the expansions of a struct and its impl, so a
  Node constructor is the static `__new` and the entry exports the class in a `Proxy` whose `construct` checks the
  arguments and calls it; `instanceof` reads the class's prototype through the proxy. A parameter of a class takes an
  instance of it (another value is kind `invalid_argument_type`) and the core borrows the held value (GN-6h). In Node
  the instance is unwrapped as a `ClassInstance`, which checks the type tag of the class: napi-rs gives a reference
  `&T` only in the argument conversion that it generates and refuses one that the body of a call makes, and the
  generated functions take the raw values, which they judge themselves (T-8). A class of origin `value` whose `in` rows name only the class itself (U-1) is
  generated as such a class, and a value type named in `types` is that unit.
- **GN-6h** The lock of a class unit (U-2 busy, B-5c). A place of a class is where a call takes an instance of it: the
  receiver of a member, or a parameter whose type is the class itself. A write place is a receiver `&mut self` or
  `self`; every other place is a read place, and a parameter is a read place until the contract names its borrow. A
  class unit holds its core value in a lock that is only tried when (1) a member of it has a write place, (2) a value
  of the class comes in from the language (a parameter, a field of a record or an element of a list in one, or the
  return of a callback), or (3) a member of it reaches language code. A type carries language code when it is a
  callback unit, a function type, `host_value`, a value alias with an `out` row of kind `native`, or a class that
  carries it, also through a field of a record, an `optional`, a `list`, a `tuple` or the value of a map. A class
  carries language code when a member with a receiver of it has a parameter of a type that carries it, or when a
  member that returns the class has such a parameter or is a member, with a receiver, of another class that carries
  it; the generator computes the least set that satisfies both definitions. A member reaches language code when the
  type of one of its parameters or the class of its receiver carries it. A class without a write place is held in
  `binding_core::Shared` (an `Arc<tokio::sync::RwLock<_>>`) and only read, so it never gives kind `busy`. A class with
  a write place is held in `binding_core::Shared` when a member of it with the receiver `&self` waits or reaches
  language code, or when a member that waits takes the class as a parameter; any other class with a write place is
  held in `binding_core::Exclusive` (an `Arc<tokio::sync::Mutex<_>>`). The core type of a class in `Shared` is `Sync`,
  which a constant of the generated crate asserts. Every lock is taken with a `try` operation and never awaited: a
  call that does not get the lock fails with kind `busy`, so a call that re-enters an object from a callback fails
  rather than waits for itself (P-2). A read place reads (`try_read_owned`, or `try_lock_owned` of the mutex) and a
  write place writes (`try_write_owned`, or `try_lock_owned`). A call takes the locks of all its places before it
  calls the core and holds them until its result is converted; the read places of one call that are the same
  instance share one lock (`Arc::ptr_eq`), and an instance that the call takes at a write place and at another place
  fails with kind `busy`, because the core cannot get `&mut` of a value together with another borrow of it. The core
  gets `&*guard` for a read place and `&mut *guard` for a write place. A value of the class inside another type (an
  element of a list, a field of a record, the return of a callback) is read, cloned and released at once, so such a
  class is `Clone`. The lock of a class with a write place holds a flag `poisoned`: a panic while the guard of a write
  place is held sets it before the guard is released, and every later call that takes the object at any place fails
  with kind `internal`, because the lock of tokio does not poison and the panic may have left the value half changed
  (P-2). The locks are those of `polyspec-binding-core` with the feature `lock`, which the manifests of the Python,
  Node and PHP binding crates turn on.
- **GN-6c** A record of another repository (T-3) is that repository's class: Python imports it from that package
  (which the `pyproject.toml` lists as a dependency), PHP finds it in the class table by name (its extension is
  loaded), Node takes and gives a plain object, which the declarations write by its fields. Each binding crate depends
  on that repository's crate with the core's own dependency line, which `binding scaffold` copies.
- **GN-6d** A callback interface (U-3) is a struct that holds the language object and implements the core trait; a
  member that takes one returns `Result<T, Failure<E>>` (E-1c) and the core takes it as `&mut` (or, by coercion, `&`).
  When the object enters, each member must be callable (kind `invalid_callback`). A call converts the arguments out
  (borrowed per T-1) and the result in; an exception of the language code, or a failure of the binding in the call
  (a result of another type, a call from another thread with `thread: owner`, kind `wrong_thread`), goes to the core
  as a `Raised` whose handle names it in the binding's table, and the generated caller throws the same object again.
  The interface is declared as a Python `typing.Protocol` in `<root>._types`, a Node interface and a PHP interface
  that the extension registers. The binding crates depend on `polyspec-binding-core` with the feature `construct`.
- **GN-6e** A value alias with `core: {in, out}` (U-7) enters as the `HostValue` that the binding describes one level
  at a time (B-1) and the core's `in` function judges through `HostValues`; its failure is the core's kind or the
  exception that language code raised while the core walked the value (a getter, an iterator), thrown again unchanged.
  What a language value is as a `HostValue` is binding's rule: Python takes the exact built-in types (a subclass of
  `int`, `float`, `str` or `bytes` is `Other`); Node takes a number as `UntypedNumber`, a bigint as `Int` (its decimal
  token outside `i64`), a string as its UTF-16 units, an Array, a Map, a plain object (prototype `Object.prototype` or
  `null`, own enumerable string keys), a Date, a function, and a typed array or a symbol as `Other`; PHP takes an
  element that is a reference as `PhpReference` with its identity, an array with `array_is_list`, a stdClass and a
  Closure. A core value leaves as the `OutValue` of the core's `out` function, made by the alias's `out` rows of
  built-in forms (a form by a member is refused by name, G-4); in Python and Node the same handle is the same object,
  and in PHP, whose arrays are values, a handle inside its own making is kind `internal`. A value that enters as a
  handle (`native`, `Other`, a callable) is kept for the life of the thread, which U-7 (d) has yet to bound. In PHP
  it is kept until its request ends: the engine frees the values of a request when the request ends, so the extension
  releases them at its request shutdown, while the engine is alive, and a handle of an ended request finds no value
  (kind `internal`). A value kept beyond the request is released by the thread after the engine is gone, which ends
  the process with a fault.
- **GN-6k** A value alias of another repository (T-3, U-7 (a')) is taken and given as the repository's own alias is
  (GN-6e): the binding describes the language value as a `HostValue` and calls the `in` function of the owner's core,
  and it makes the `OutValue` of the owner's `out` function by the `out` rows of the alias, which it reads from the
  owner's contract. The two core functions of the owner are the only conversion (P-1). The conversions are named
  `in_<library>_<alias>` and `out_<library>_<alias>`, so that the aliases of two libraries with one name do not meet.
  A failure of `in` is a variant of the owner's error enum: its kind, status and errno are the owner's (`Kinds`), and
  its class is this repository's class of the category that the owner's E-1 gives the variant (E-2), chosen by a
  match over the owner's kinds without a wildcard, so a variant that the owner's contract lacks does not compile
  (I-2 (3)). An exception that language code raised while the owner's core walked the value is thrown again unchanged.
  The binding crate depends on the owner's crate, and the Python package on the owner's package (GN-6c). An alias
  whose owner forwards the kinds of a third library (E-1b (a)) or names two error enums is refused by name, as is an
  `out` row by a member (GN-6e) and the targets Go and WASM (G-4). The `in_raises` of an alias of another repository
  give this repository nothing to generate: the cases of the alias, the assertions of its kinds and the entry point
  of the feature `codec-test` (GN-5, GN-13) belong to the binding of the owner, which runs them once, and the crate of
  this repository has that feature only for an alias of its own.
- **GN-6f** A member of kind `iterate` (N-4) of a class calls its core with `&self`, which gives an iterator of
  borrowed items, or of borrowed keys and values for `yields: {key, value}`; the binding converts every item when the
  iteration starts, a snapshot of the class's value (a value type by value, a class by a copy of its core value).
  Python gives the items by `__iter__`, or the keys by `__iter__` and the pairs by `items()`, as a dict does; Node makes
  the class iterable by `Symbol.iterator` over the items or `[key, value]`; PHP makes it an `IteratorAggregate` whose
  `getIterator` gives the items under their positions, or the values under their keys, through the extension's
  iterator `<namespace>\Internal\Pairs`, because a key may be an object. `getIterator` declares that class as its
  return type, and the extension registers the class first: PHP deprecates a `getIterator` whose return type is not
  a `Traversable`, the return type of `IteratorAggregate::getIterator`. An iterate that raises, or a second
  iterate of a class, is refused by name (G-4).
- **GN-6g** A member of kind `stringify` or `to_json` (N-4) of a class is a method without parameters under the name
  of the language's hook, and calls its core with `&self`. A stringify, which returns text, is `__str__` in Python,
  `toString` in Node and `__toString` in PHP. A to_json is `toJSON` in Node and `jsonSerialize` in PHP, whose class
  implements `\JsonSerializable`; Python has no JSON hook, so the member is absent there. The PHP extension names no
  `\Stringable` for a class with a stringify, because PHP gives that interface to every class that has `__toString`
  and refuses a class that names it a second time when the extension loads; the stub declares it. A Node hook is the
  addon's method under its own name, without the argument check of the entry (G-7), because the language calls a hook
  with the arguments of its protocol (`JSON.stringify` passes the key to `toJSON`), which the method does not read. A
  second stringify or to_json of a class, one with a parameter, and a stringify that does not return text are refused
  by name (G-4). A member that returns `never` (T-1) calls a core that returns `Result<Infallible, E>`: the generated
  code returns the failure and matches the value, which has no variant, without an arm; the declarations say `never`
  in PHP and TypeScript and `NoReturn` in Python, and a `never` return without `raises` is refused by name. A member
  with `only` (Q-4) is generated for the targets that it lists and is absent from the binding, the declarations and
  the tests of every other target.
- **GN-6i** A parameter, or a field of a record parameter, with a default (U-2, T-4) may be left out. Its core
  parameter or field is `Option<T>`, and the binding passes `None` for a value that was left out and fills no value
  in, so the core alone decides the value (B-1). The borrowed forms are `Option<&str>` for text, `Option<&[u8]>` for
  latin1, bytes and source, `Option<&[T]>` for a list, `Option<&Map>` for a map, and the value itself for a number or
  a bool. A `{literal}` or `{const}` default names in `default_core` the constant of the core that the core uses for
  `None`; the generated crate asserts at compile time that the constant equals the declared value (a text by its
  bytes, a float by its bits), and the declarations show the value. A `{computed}` or `{empty}` default has no
  constant; the declarations show `...` in Python, `null` or `[]` in PHP, and an optional parameter in TypeScript,
  with the rule id of a `{computed}` default in the comment. What "left out" is in each language: Python, an argument
  that the call does not give, so an explicit `None` is a value and is judged as one; Node, a missing trailing
  argument, a missing member of the options record, or `undefined`, so `null` is a value and is judged as one; PHP,
  an argument that the call does not give, or `null`, because the engine gives `null` for a parameter that a call
  with named arguments skips and the extension cannot tell the two apart. Refused by name (G-4): a default of the
  record parameter itself (`{empty: "object"}`), a default of an `optional` type, a default of a type that is no
  number, bool, text, latin1, bytes, source, list or map, a `{literal}` or `{const}` default without `default_core`,
  a required parameter after a parameter with a default, a `rest` parameter, and a field default of a record that
  also has the result form.
- **GN-6j** A parameter of type `source` (T-1), also inside `optional`, takes a text or bytes and reaches the core as
  `&[u8]`, which the core judges: Python takes a `str` as its UTF-8, or a value that PyO3 reads as bytes; Node takes a
  string as its UTF-8, or a `Uint8Array`; PHP takes a string, whose bytes are passed as they are, because a PHP string
  is its bytes. A text with an unpaired surrogate is kind `invalid_text` (B-3), and any other value is kind
  `invalid_argument_type`. A `source` in any other place (a result, a field, an element) is refused by name (G-4).
  In Node the type `bytes` is a `Uint8Array` both ways (T-7): a parameter takes a `Uint8Array` and refuses any other
  value, a string too, as kind `invalid_argument_type`, and a result is a new `Uint8Array` of a copy.
- **GN-7** Whether the core path of a member returns a `Result` is its `core.result` (E-1c); without it, the path
  does when `raises` names a variant of the contract's own core error or the member takes a callback. The generated
  code calls such a path with `match … { Ok(value) => …, Err(error) => … }` and any other path without it, so a
  `core.result` that is not true of the core does not compile (I-2). A `core.result: true` in a contract whose
  `errors.kinds` names no core error is refused by name. The error is matched without a wildcard into the
  library class of its kind's category (I-2 (3)), with the kind, status and errno of `binding_core::Kinds`. The pattern
  `Variant { .. }` matches a variant with or without data, because binding reads no Rust source; the lint against it is
  allowed with the reason I-2.
- **GN-7a** An error unit (E-2) is a class of Python, Node and PHP that extends the class of its `parent`, or the
  library class of its category when it has none; a parent is declared and registered before the units that extend it
  (P-4), a `final` unit is a final class in PHP, and a cycle of parents is refused by name. A kind whose row of `errors.kinds` names the unit in `class` is an instance of that class, with the kind, status
  and errno of GN-7; a row with `source` (E-1b (b)) is a variant of the core error of this repository and is generated as
  any other row. A member of the unit is a read-only property (I-3): its `core.path` names a function of the core error
  with the receiver `&self`, which the generated code calls with the error that the core returned, by a second match
  without a wildcard. The property is a `@property` over a private attribute in Python, a read-only own property of the
  instance in Node, as `kind`, `status` and `errno` are, and a method over a private property of the declaring class in
  PHP. An instance that language code makes itself has no value: Python and PHP give `None` and `null`. The type of a
  property is bool, int, int64, uint, float, text or bytes, or an optional of one. The Node addon keeps the class
  after the six classes of the categories, and the PHP extension reads and writes `kind`, `status` and `errno` in the
  scope of the category class that the class extends. The generated test of a raising case (B-4) names the class of
  the unit as the exact class; it finds the row by the kind of the case, which is the snake_case of the last segment
  of the variant (CK-22). A member of another kind, a property of another type, a property named `kind`, `status`,
  `errno` or `message`, a row with `library` (E-1b (a)), a `class` that names no error unit of the category of its row,
  an error unit in a module other than the root, and an error unit for Go or WASM are refused by name (G-4).
- **GN-7b** Every binding crate holds, for each variant that a member names in `raises`, the assertion
  `const _: fn(&<error>) -> bool = |error| matches!(error, <variant> { .. });` against the error type that the member's
  core path returns, so a path that is no variant of that type does not compile (E-5, I-2). Every member of a contract
  returns the one core error enum of E-1, so a variant that several members raise is asserted once. Not generated yet:
  the path of a variant that holds the error of a dependency
  (`<outer>/<inner path>`, E-1b), and the projection function of an error struct that holds a code enum.
- **GN-8a** Fault injection (G-5, X-1): for a contract with `faults`, each binding crate names every constant of
  `faults[].core` as `const _: &str = <core>;`, so a point that the core does not have does not compile (I-2), and
  every entry point of a member, a hook and an iterate too, runs its core call in `with_faults("<member id>", …)`
  and its whole work in `shielded(…)`. With the feature `fault-test`, `with_faults` takes the arming that a test
  made for the member on this thread (`binding_core::fault::take`), or an empty one, and installs it while the core
  call runs, and `shielded` installs an empty arming while the work runs; without the feature each only runs what it
  is given. An arming applies to the core call alone: the entry point converts its arguments and takes the locks of
  its places (GN-6h) before `with_faults`, so a call that fails before the core, with a refused argument or with
  kind `busy`, leaves the arming for the next call of the member, and the core call of an iterate is the whole
  iteration, whose items the entry point collects inside `with_faults`. So the call that makes a receiver or an
  argument does not take the arming of the member under test, and an entry point that a callback enters, the
  conversion of its arguments too, does not see the arming around it. `_arm_faults(member, faults)` takes
  the member id and the JSON list of a case's `faults` and gives the id of the arming; a list that is not armed, such
  as one with an errno symbol that the target does not have, is kind `internal` with the reason. `_fault_left(id)`
  gives the names of the points whose fault did not fire. A member that waits is not generated yet (GN-1), so the
  arming is installed for synchronous work only.
- **GN-8** Every entry point runs its body under `catch_unwind`; a panic reaches the caller as kind `internal` of the
  internal category class (B-7), not as the framework's own panic error.

## Languages

- **GN-9** Names follow N-2; a constant is UPPER_SNAKE_CASE in PHP, Python and JavaScript (PSR-1, PEP 8) and PascalCase
  in Go, in both name conversions (TypeScript and `binding_core::naming`), which share their test vectors.
- **GN-10** PHP: one function per member in the namespace of its module (P-2), whose parameters take any value (`&Zval`)
  that the extension judges (T-8); the engine counts the arguments and checks their names by the arginfo (G-7). Because
  the arginfo declares no type, the stub declares `mixed` and states the contract type in `@param`. The record fields
  follow the parameters as named parameters. The category classes are registered at module startup by `ClassBuilder`,
  extend the class of E-2 found in the engine's class table, and keep the class's own object handler, so an error has
  the file, line and trace of its call; `kind()`, `status()` and `errno()` read private properties. An enum is a backed
  enum (T-6). The `php_function` and `php_module` expansions of ext-php-rs call `Option::map_or` and
  `Result::unwrap_or`, so the functions and the module entry are in one module that holds that one allow.
  `keyed_map<T>{key}` is an array in its order (T-2). An int key is an integer key, or its decimal text when the
  contract lists text and not integers, because PHP makes a decimal string key an int; a string key is a text when it
  is UTF-8 and text is listed, else a byte string when bytes are listed; any other key is kind
  `invalid_argument_type`. A map leaves with the same rule: a decimal text or byte string key becomes an int key, and
  a map with two keys that PHP makes one (`Int(1)` and `Text("1")`) is kind `internal`, not a lost entry (P-4). The
  int key as text is the inverse of PHP's own conversion of a decimal string key, so a text key `"1"` that leaves as
  the int key 1 comes back as the text `"1"` and keeps its value (P-3). `map<T>` is an array in its order by the same
  rule for its text keys: a string key is its UTF-8 text (other bytes are kind `invalid_text`), an int key its decimal
  text, and a decimal text key leaves as an int key.
- **GN-11** Python: the native module `<root>._native` takes the raw values (T-8) with the record fields keyword-only;
  the runtime counts and names the arguments (G-7). The category classes are in `<root>._errors` and the enums in
  `<root>._types`, which the native module imports when it loads (B-4); a module of the contract is `<root>.<module>`
  and `<root>` re-exports every public name (P-3). An enum is an `enum.StrEnum` (T-6); the package needs Python 3.14
  (abi3-py314). A list parameter takes a list or a tuple. `keyed_map<T>{key}` is a `dict` in its order whose keys are
  `int` (not a `bool`), `bytes` or `str` of the listed kinds; any other key is kind `invalid_argument_type`, and the
  map leaves as such a `dict` (T-2). `map<T>` is a `dict` in its order whose keys are `str`; any other key is kind
  `invalid_argument_type`. `polyspec` has no `__init__.py` (P-1).
- **GN-12** Node: the addon takes the raw values (T-8); the generated CommonJS entry checks the count of the arguments,
  the names and the presence of the options record's members (G-7, T-4) and turns any iterable but a string into an
  array for a list parameter (T-7). When it loads, the entry hands the library classes to the addon, which keeps a
  reference to each (napi `FunctionRef`); a failure is an instance of its class that the addon makes with the message,
  kind, status and errno and throws (B-4). The ESM entry re-exports the CommonJS one, so both share their classes.
  `map<T>` is a `Map` whose keys are strings, and `keyed_map<T>{key}` a `Map` whose keys are safe integers or strings
  of the listed kinds (T-2): the entry passes the entries of a `Map` to the addon, which judges each key (any other key
  or value is kind `invalid_argument_type`), and makes a `Map` of the entries that the addon gives back. Because the
  entry does it, such a map is a whole parameter or return, or an optional one; one inside another type, and byte
  string keys, which a `Map` compares by identity, are refused by name (G-4), so nothing is left out silently; the
  generator takes them when a contract needs them.

- **GN-15** Go (E-7, B-8, L-1): `packages/go` is the Go module (`go.mod` with the module of `packages.go` and
  `go 1.27.3`). A contract module is the package `packages/go/<module>`, named by its last segment in lower case without
  separators; the empty module is the module root, whose package name is the repository name without `-` (P-1,
  `httpcookie`): the last element of its import path, `go`, cannot be an identifier, so the package name differs from
  it, which Go allows without an import alias. Its file `zz_generated_<package>.go` holds the functions, records (structs of
  exported fields), enums (a typed string and a constant `<Enum><Variant>` per value) and constants (typed `const`) of
  the module. Package `errors` names the six category types of E-7, named as the classes of E-2 with the Go capitals of
  N-2 (`HTTPCookieValueError` to `HTTPCookieInternalError`), each with
  `Error()`, `Kind() string`, `Status() (int, bool)`, `Errno() (int, bool)` and `Unwrap() error`; they are aliases of
  the types of `internal/binding`, which also holds the cgo calls and the encoding, so their constructor is not public
  API (L-3). The C ABI crate `polyspec-<repository>-go` is the tracked thin package `packages/go/internal/ffi`
  (crate-type `staticlib`, lib `polyspec_<repository>_go`), which Go links with `-lpolyspec_<repository>_go`; the
  directory of the library is given by `CGO_LDFLAGS=-L<dir>`, because a Go module is fetched as source and how a
  consumer gets the platform's static library is not decided yet (plan T-2). A parameter is lower camel case; one that
  is a Go keyword or a name of the generated body takes a trailing `_`.
- **GN-16** Go types (T-1, T-2, B-8): bool `bool`, int and int64 `int64`, uint `uint64`, float `float64`, text and latin1
  `string`, bytes `[]byte`, `list<T>` `[]T`, `map<T>` `*Map[T]` (below), `optional<T>` `*T`, a tuple inside another type `[N]T` (one element
  type), a tuple return several results. A Go string is bytes: text is passed as its bytes and the C ABI refuses bytes
  that are not UTF-8 as kind `invalid_text` (B-3); latin1 is a Go string of runes U+0000 to U+00FF, one per byte,
  because Go reads a string as UTF-8: the C ABI takes it as UTF-8 and refuses a rune above U+00FF as kind
  `invalid_text`, and a byte leaves as the rune of the same code point (B-8, the rule of every language); a string of
  the core leaves as its UTF-8 bytes. An enum value that is not one of the
  constants is kind `invalid_argument_type`. A function that calls the core returns `error` last (E-7); B-2 and G-7
  hold by the Go types and the compiler. `Map[T]` is the ordered map of T-2, an alias of `internal/binding.Map` that a
  package declares when it names one, and not a Go map, whose iteration order is random: `Set` puts a new key after the
  others and keeps the place of a key that is there, `Keys` gives them in order, and a zero or nil `*Map` is empty; it
  crosses the C ABI as its length and its entries in order (a key twice is kind `internal`, a key that is not UTF-8
  `invalid_text`). `keyed_map<T>{key}` is `*KeyedMap[T]` of the same order, whose `Key` is an integer, a byte string or
  a text (`IntKey`, `BytesKey`, `TextKey`, functions of the package), different keys even with the same digits; a key
  crosses the C ABI as its kind and value, and a key of a kind that the contract does not list is kind
  `invalid_argument_type`. `map<T>` and `keyed_map<T>` are generated for every target (GN-10, GN-11, GN-12, GN-18).
- **GN-17** The C ABI (B-8): each function is `polyspec_<repository>_<module>_<member>(args, len, result) -> int32`.
  Go encodes the arguments into one buffer in parameter order: a bool or a presence tag one byte 0 or 1, a number eight
  bytes little endian (int64 two's complement, float64 its IEEE 754 bits), a string or byte slice its length (eight
  bytes) and bytes, a list its length and items, a record its fields in contract order, an enum its value text. The C
  ABI decodes and judges them (T-8), and the arguments must end where the last parameter ends; the core's result, or
  the failure (category index of E-1, message, kind, status, errno), is encoded the same way into a buffer that Rust
  allocates, writes into `result` and Go frees with `polyspec_<repository>__free`; the return is 0 for a result and 1
  for a failure. A buffer that does not follow the encoding is kind `internal`. The symbols that are not members
  (`__free`, `__panic_test`, `__echo_<type>`) have two underscores after the prefix, which no member name has. Every function runs under
  `catch_unwind`, so a panic never crosses the C ABI (B-7). A call of a member with wait `none` returns when the core
  returns.

- **GN-18** WASM (P-5, B-9): the crate `polyspec-<repository>-wasm` is the tracked thin package `packages/ts/wasm`
  (crate-type `cdylib`, wasm-bindgen 0.2.130 and js-sys 0.3.107) in the npm package of Node, and
  `packages/ts/wasm/generated` holds its source, the ES module `index.mjs`, its declarations and its tests;
  `wasm-bindgen --target web` of the same release writes the module `<library>_wasm_bg.wasm` and its glue
  `<library>_wasm.js` there. A `map<T>` and a `keyed_map<T>` are a `Map`, with the rules of GN-12 for Node. The npm manifest exports the WASM entry at the subpath `./wasm` always and, for an entry
  whose conditions are `{node: napi, browser: wasm}`, under the condition `browser` of that entry. The ES module
  loads the WebAssembly module when it is imported, with a top-level await (GW-5), so no export can run before the
  module is ready and there is no `init()`: a `file:` URL is read with `node:fs/promises` (Node), any other URL is
  fetched (a browser); the library classes, which it defines as the Node entry does, are handed to the module
  when it loads. The values are those of Node (T-7, B-2), a string with an unpaired surrogate is kind `invalid_text`
  (B-9, `JsString::is_valid_utf16`), and the ES module checks the count and names of the arguments (G-7). The
  expansion of `wasm_bindgen` calls `Option::unwrap_or_default`, so the exports are in one module that holds that one
  allow. The standard library of `wasm32-unknown-unknown` is built with `panic=abort`, so `catch_unwind` catches no
  panic there and a panic traps (GW-7): every export runs its call through `state.mjs`, a module that the package does
  not export, which turns a `WebAssembly.RuntimeError` into kind `internal` of the internal class and marks the
  instance broken; every later call fails with the same kind. The module is not instantiated again, because the state
  that earlier handles point to would be gone. Where the module unwinds, `catch_unwind` gives kind `internal` as in
  every binding (B-7).
- **GN-18a** WASM, a class unit (T-5): a class that the ES module defines, with the members of the Node class (GN-6b,
  GN-6f, GN-6g: the constructor, static members, methods, getters, `Symbol.iterator`, `toString` and `toJSON`) and the
  same argument checks (G-7). The WebAssembly module keeps the core values of the instances of a class in a table of
  that class, and an instance keeps the handle of its value in a private field, which no other code reads or forges: a
  value is an instance of the class exactly when it has that field. The module exports each member as
  `__<Class>_<member>`, which is not part of the API: `__<Class>_new` gives the handle of the new value, and a method, a
  getter or a hook takes the handle of its instance first. When the module loads, the ES module hands over for each
  class a function that makes an instance around a handle, by which a value of the class leaves, and one that reads the
  handle of an instance and answers `undefined` for any other value, which is kind `invalid_argument_type`. A call
  shares the value that it reads, so no table is borrowed while the core runs, and a parameter of a class gives the core
  a copy of the value (GN-6b). A `FinalizationRegistry` drops the value of an instance that the engine collected, and its
  handle is used again; an instance has no `free()`, so no call meets a released value. The class is not a class of
  wasm-bindgen: wasm-bindgen gives up the instance when Rust takes its value from a `JsValue`, and after its `free()` a
  call of the instance fails with an error that has no kind (P-2). A member with the receiver `&mut self` is refused
  by name: a call shares the value that it reads, which the core cannot write, and the form that holds a written
  value and refuses its second place as kind `busy` (B-5c, GN-6h) is not generated for WASM yet. A class unit with
  `cleanup` (B-10) is refused by name, as for every target (GN-1).

## Generated tests (G-5)

- **GN-13** For every function, each language's test module checks: B-2, every number parameter or field with the values
  of G-5 (NaN, the infinities, 1.5, true, "7", -1 for uint, 2^53 in Node) as kind `invalid_number` of the value class;
  B-3, a text with an unpaired surrogate (PHP: bytes that are not UTF-8) and a latin1 text with U+0100 as kind
  `invalid_text`; B-4, every contract case that raises, with the exact class (GN-13d), the base class of E-2, the kind, the status
  and errno; B-7, the panic entry point as kind `internal`; G-7, a missing argument, one argument more and an unknown
  name (PHP named argument, Python keyword, a member of the Node options record, and a missing member). The arguments
  of a case are its keys in snake_case, a record parameter an object of its fields, an enum its value text and a latin1
  value a text of U+0000 to U+00FF; a case without the key of a parameter that has no default is refused by its id. Values that JSON
  cannot write: bytes are `{"hex": "<two lower-case hex digits per byte>"}`; a `source` is its text, or the same
  `{"hex": ...}` for bytes that are no text; a float that is not finite is `{"float": "nan" | "inf" | "-inf"}`; a
  value of a value type (`json_value`, `php_value`, `template_value`) is `{"kind": <value kind>, "value": ...}` with
  the kinds of the value table: `null` has no `value`; `bool`, `int`, `float` (a number or the form above), `number`
  (its literal as text), `text` and `bytes` (`{"hex": ...}`) hold that value; `list` holds an array of such values;
  `map` and `object` hold an array of `[key, value]` pairs in order, a key being a text, or `{"int": n}` or
  `{"hex": ...}` for a keyed map; `reference` holds `{"id": n, "value": ...}`, and the same `id` is the same reference.
  The end-to-end check fails a run in which a case was left out. A `keyed_map` parameter whose contract does not list
  every key kind is tested with a key of a missing kind as kind `invalid_argument_type`; a case gives a keyed map as
  that array of `[key, value]`. The members of a
  class have the same tests; a method or property is called on an instance that a factory of the class (a static
  member or the constructor that returns it) makes from the case's keys of that factory's parameters, and the B-2, B-3
  and G-7 tests of a method use the factory arguments of the first case of the class that does not raise. A member
  that takes a callback has the tests of K-2: an object without the
  members is kind `invalid_callback`, the exception that the callback raises reaches the caller as the same object,
  and a result of another type is a binding kind, unless a member of the callback returns a value alias: the alias's
  core judges every value (B-1), so a refused result has the alias's kind and this test is not generated; its other
  arguments are placeholders whose lists have one item.
  K-2 is binding's own requirement and does not depend on a case. A case gives a callback parameter as a fixture,
  `{"callback": {"<callback member id>": [<row>]}, "calls": [{"member": "<id>", "args": {...}}]}`: a row is
  `{"args": {<parameter in snake_case>: <case value>}}` with `"result": <case value>` (absent when the member returns
  none) and `"once": true` for a row that answers one call. The generated test of each language makes the fixture
  from one implementation that binding writes into the test module, so a repository writes no fixture code: a call
  takes the first row of its member that is left and whose arguments equal the call's, and a call that no row answers
  is recorded and throws `UnexpectedCall`. After the call under test, the test requires that record to be empty, so a
  core that swallows the exception still fails, and the calls to be those of `calls`, in order, when the case names
  them. `binding check` judges the form (CK-22). The B-4 test of a member that takes a callback runs its raising cases
  with their fixtures. A stringify and a to_json are run as the language runs the hook
  (GN-6g): a stringify has a test for each of its cases that does not raise, in which the string form of the instance
  (`str`, `String`, a `(string)` cast) is the case's `result` and, in PHP, the instance is a `\Stringable`; the B-4
  test of a to_json calls `JSON.stringify` or `json_encode`; neither has a G-7 test. B-5c (GN-6h): for every class with a write place, a test makes an instance, runs the poison
  entry point of GN-5 on it, which panics while it holds the write guard, and requires kind `internal` from that call,
  from a member that takes the instance as its receiver and, when a member takes the class as a parameter, from that
  member with the instance as the argument; for every member with a write receiver that takes its own class as a
  parameter, a test passes the instance as that argument and requires kind `busy` of the busy class, and then calls a member on
  the instance, which works because the refused call holds no lock. Where the core function of that member is the
  `place` of a fault injection point that fills one kind of a category class, the test arms the point for the member
  before the refused call, then calls the member with the instance and another one, and requires the kind that the
  point fills and no fault left: the refused call did not take the arming (GN-8a). The instance of these tests is made by the first
  constructor or static member of the class that returns it, with placeholder arguments.
  A case that raises and has `faults` (CK-22) is run with them armed: the test makes the receiver and every argument
  as local values first, arms the faults for the member (`_arm_faults`), calls the member at once, and requires
  `_fault_left` to be empty after the expected failure, so a fault that the call never reached fails the test. The
  `errno` of a case's `raises` is compared with the failure's errno: a number as it is, a symbol as the value that
  the language gives it on the machine (Python `errno.<symbol>`, Node `os.constants.errno.<symbol>`), and no errno when
  the case names none. A value alias with `in_raises` has, with the feature `codec-test`, an entry point that runs its
  `in` function alone; each case of the alias (CK-22) calls it with the case's `value` and requires the class of the
  kind's category and the kind. Each member with a parameter that is the alias, an optional of it or a list of it has
  one more test: the value of the alias's first case at that place, as the parameter or as the one item of the list,
  with placeholders for the other arguments, gives the same class and kind through the member. A case gives a value
  of a value type as `{"kind", "value"}` of the kinds `null`, `bool`, `int` (a number, or its decimal text outside the
  safe integers: a Node `bigint`, a Python `int`), `float`, `text`, `bytes`, `list` and `map`, each as the value that
  the built-in form of the kind makes.
- **GN-13a** Open items of G-5, not generated yet: B-5b, B-6 and B-10; of B-5c, the tests of a call that
  overlaps a waiting call and of a call that re-enters an object from a callback, and the tests of a class that no
  constructor or static member makes; the identity of a default of a member that GN-13d leaves out; the round trip
  of a value unit's rows; and, of the callback fixture, a row that raises (`raise`), an `async` row, a function value
  and a callback inside another type, each refused by name when a case gives it (G-4). Of fault injection and the
  kinds of an alias, each refused by name when a case gives it: a point of another library; an errno symbol in a PHP
  test, because PHP has no table of the errno symbols of its machine; a value of the language by its kind
  (`{"host": ...}`), whose kinds have no closed table; and a value of a value type of another kind than those of
  GN-13. Not generated and not refused: the test of a case with `faults` that does not raise, because no test
  compares the result of a case yet; the test of a member that takes an alias inside a map, a record field or the
  return of a callback; and the check that no release build has a test feature (the resolved features of
  `cargo tree`, and the export list of each installed package), of which the end-to-end check has the part of Go
  (GN-13b).
- **GN-13d** Python, Node and PHP also check, for the shapes of GN-6i, GN-6j and GN-7a: U-2, for every parameter or
  field with a `{literal}`, `{const}` or `{empty}` default, that the call without it and the call with its declared
  value give the same result, or the same class and kind of failure; the other arguments are those of the first case
  of the member that does not raise, or placeholders. The test is written for a member whose result the language
  compares by value (no class, no result of `none`) and that takes no callback and is no hook. In Python and Node an
  explicit `None` or `null` for such a parameter is tested as a value that is refused. T-1: a `source` parameter gives
  the same for a text and for the bytes of its UTF-8 (Python, Node), a text with an unpaired surrogate is kind
  `invalid_text`, and a value that is neither is kind `invalid_argument_type`. T-7: a `bytes` parameter refuses a
  value that is no bytes, in Node a string too. B-4: a case whose kind names a `class` expects that exact class and is
  caught as the class of its category. A case may leave out the key of a parameter with a default, which is then left
  out of the call.

- **GN-13b** Go: the tests of a package are its external test package `zz_generated_test.go`, run by `go test`: B-3 for
  every text parameter or field (the bytes FF), the enum check of GN-16 for every enum parameter or field, B-4 for every
  contract case that raises (the exact type of E-7, the kind, the status and the errno). B-7 is
  `internal/binding/zz_generated_panic_test.go` with the build tag `polyspec_panic_test`, which also declares the C
  ABI's panic entry point, so the static library needs the feature `panic-test` only with that tag.
  `internal/binding/zz_generated_map_test.go` checks the order of `Map` and that the encoding keeps it both ways.
  Every latin1 parameter or field is tested with U+0100 and the bytes FF as kind `invalid_text`. The features
  `panic-test` and `codec-test` are for tests only: the manifest that `binding scaffold` writes turns neither on by
  default and `binding check` refuses any other manifest (CK-19), and the end-to-end check builds the static library
  without features and fails if it holds a test entry point (`__panic_test`, `__echo_`). With the build tag
  `polyspec_codec_test` and the feature `codec-test` of the C ABI crate, test entry points give back a latin1 value
  (when the contract takes and gives latin1), a `map<text>` and a `keyed_map<text>` with every key kind (when it takes
  and gives such a map) through the conversions of the binding; `zz_generated_codec_test.go` checks that U+0000 to
  U+00FF, the order of a map and the order and kinds of the keys of a keyed map come back the same and that U+0100 is
  refused. A `keyed_map` parameter or field whose contract does not list every key kind is tested with a key of a
  missing kind as kind `invalid_argument_type`. A case's latin1 value is a Go string of its runes; a case gives a `map` as
  an object of its entries in order and a `keyed_map` as GN-13 does.
- **GN-13c** WASM: `packages/ts/wasm/generated/tests/generated.test.mjs` runs the tests of GN-13 for Node, those of the
  members of a class among them, with `node --test` against the subpath `./wasm` of the installed package; it has no
  test of K-2, because WASM generates no callback unit. The B-7 test runs last: it runs the panic entry
  point through `state.mjs` and expects kind `internal`, then a later call that is kind `internal` when the instance
  trapped and that works when the module unwinds (GW-7).

## End-to-end check

- **GN-14** `make e2e REPO=<checkout> WORK=<directory> [BINDING=<commit>] [DEPS="<checkout>..."] [ADD_TARGETS=go,wasm]`,
  which runs `scripts/e2e.mts` of the commit `BINDING` (GN-14b) on the Node.js of the checkout (`tests/e2e/sample` and `tests/e2e/shapes` are repositories of the items that no polyspec repository generates alone yet,
  the second those of GN-6i, GN-6j and GN-7a for Python, Node and PHP with a member of the receiver `&mut self` that
  takes a `source` and a default (GN-6h); `tests/e2e/classes` is one of a class unit with every kind of member and
  no unit that WASM refuses, whose contract has the target wasm (GN-18a); and `tests/e2e/consumer` is one that names the
  value alias of the sample and has an error unit with properties (GN-6k, GN-7a), run with `--dep tests/e2e/sample`;
  `DEPS` names each repository whose types the contract names; its packages are built and installed first)
  copies the committed tree of a repository, makes the changes that the repository has not made yet and prints each
  (the root workspace and its members, the dependency on binding_core and `Kinds`, the tracked packages of `binding
  scaffold`), runs `binding check`, tests the core without the generator, rewrites a case file that does not follow
  GN-13 (camelCase keys, a record as an array of its field values) and prints it, generates, lints the workspace,
  builds each binding crate with the test features of its manifest (GN-5) and installs each package, and runs the generated tests and, where `tests/e2e/<library>` holds them, the
  contract cases on unittest, `node --test` and PHPUnit, and for the targets go and wasm on `go test` (after `gofmt -l`
  and `go vet`) and on `node --test --expose-gc` through the subpath `./wasm`. `ADD_TARGETS` adds those targets to the copy
  with the package entries of P-1 and P-5 and the WASM classes of E-2, and says so. The Git dependency on binding resolves to the commits of the checkout (`url.<base>.insteadOf` for the
  run's commands). Before Cargo first resolves the copy, the check writes the commit of the run into the entry of
  `polyspec-binding-core` in `Cargo.lock`, or writes a lock of that entry alone when the copy has none: Cargo asks
  GitHub for the head of the branch first, which is the pushed commit, and a manifest that `binding scaffold` writes may
  need a feature of `binding_core` that only the checkout has.
- **GN-14a** The end-to-end check runs every target of the contract. Before any step it finds the tool of each target
  among the tools that the checkout pins and `make install` installs (AGENTS.md): Python 3.14 and maturin of `mise.toml`
  for python (maturin builds the wheel for the Python of a venv of that Python, into which the wheel is installed from
  its local directory alone), npm of `mise.toml` and the package of the Node addon for node, the wasm-bindgen CLI of `mise.toml` of the release
  of the crate and the Rust target `wasm32-unknown-unknown` of `rust-toolchain.toml` for wasm, the PHP of `.php-version`
  (its minor is compared, because the PHP of the machine is wrapped as it is) and the PHPUnit of `config/phpunit` for php,
  and Go of `mise.toml` with `llvm-nm` of the component `llvm-tools` for go (BD-10 (d)); the check itself runs on the
  Node.js of `mise.toml`, and every command of the run uses the Rust toolchain of `rust-toolchain.toml` of the checkout
  (`RUSTUP_TOOLCHAIN`), because rustup otherwise reads the toolchain file of the directory of a command, and a command
  that runs in a copy would build with the toolchain of the copy or the default of the machine. When a tool is missing, the check fails before it copies anything and names the target, the
  tool, the file that pins it and `make install`. No switch, option or environment variable leaves a target out or runs
  it on another tool, and no generated or case test of a target is skipped: a test that needs a setting of its runner,
  such as the collector of GN-18a, gets it from the check and fails without it. Why: a target that did not run is not
  verified while the run would look passed, and a result of a tool that the checkout does not pin cannot be repeated.
  The run ends with what it did for each target, a lint apart from the tests: the lint of the workspace on the host, `php
  -l`, `gofmt -l`, `go vet`, `llvm-nm` and `tsc` read the code and run nothing, so they verify no target; a run of PHPUnit
  counts as a test only when its JUnit log names a test, a run of `go test` runs with `-json` and counts the tests
  that passed, failed and were skipped from its events, and a target for which no test ran fails the run; a skipped Go
  test is named and fails the run, because it verifies nothing. On macOS the PHP extension links only when the linker leaves the PHP symbols to the
  load (`-undefined dynamic_lookup`); until the PHP binding crate has the `build.rs` of BD-9, that setting is not in a
  tracked file and a run on macOS gives it by hand, which the report of the run states.
- **GN-14b** A run checks one commit of binding: `BINDING`, `HEAD` by default. The check writes the tree of that commit
  into `<work>/binding` with `git archive`, installs the packages of the generator from the lock of that tree and runs
  the script of that tree, so the generator, `binding_core` (the lock of each copy pins that commit), the case runners of
  `tests/e2e` and the script are of one commit; a repository inside the checkout (`tests/e2e/<library>`) is read from
  that tree too. The run writes its record into `var/report/e2e/<library>.json` of the checkout, which Git ignores: the
  commit, whether the run is evidence or a diagnosis and why, the commits of the repositories and what ran for each
  target. The run is evidence of the commit only when the files that it reads from the checkout (the `Makefile`,
  `scripts/e2e.mts`, the tool pins of AGENTS.md, `package.json`, `package-lock.json` and `.npmrc`) have no change against
  the commit, committed, uncommitted or untracked, and no variable that changes a build or a runner (`RUSTFLAGS`, the
  `CARGO_TARGET_*`, `CARGO_BUILD_*` and `CARGO_PROFILE_*` variables, `CGO_*`, `GOFLAGS`, `NODE_OPTIONS`, `PYTHONPATH`, `PHPRC`
  and the like) is given by hand; otherwise the record names the run a diagnosis (`diagnosis (not a commit)` for a
  change of those files) and states why. Why: a run of the working tree checks a generator that no commit holds,
  against a `binding_core` of another commit, so the result belongs to no commit that a push or a merge carries.
