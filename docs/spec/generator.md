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
  repository, GN-6k), enums, constants, error classes and error units (GN-7a), variant units (GN-6v), the callback
  interfaces of this contract that a class implements (GN-6w),
  and for Python, Node, PHP and WASM the type `source` of a parameter (GN-6j) and the defaults of parameters and record
  fields (GN-6i), and for Python, Node and PHP a method with the receiver `self` (GN-6o), a class unit with
  `cleanup` (GN-6p) and a member with `blocking_io` that reaches language code (GN-6q).
  callback interfaces (U-3, synchronous members with the receiver in `core.receiver`), Any other item (an async or
  recognizing callback, a function type, a value unit, a wait other than `none`, `blocking_io` (GN-6m) and `async_driver` (GN-6n), a default
  that GN-6i does not list, an abstract class, `only` of a unit, `native`, a naming exception, a kind of another library, the
  type `source` outside a parameter) is refused by name
  before anything of that target is written (G-4, P-4, GN-1c). Go generates a class unit, a callback unit, a value alias, also of another repository, the type `source`, a default, an error unit and a record of another repository as GN-15a to GN-15f state, and Go
  refuses modules whose packages would import each other (GN-15a); WASM generates a class unit as GN-18a states, and a value alias, also of another repository, and a callback unit as GN-18b and GN-18c state.
  Go refuses a variant unit and a class that implements an interface (GN-6v, GN-6w).
- **GN-1a** The generator reads the whole contract before it fails: it names every refused item, one line each, and
  then fails without writing anything of the refused target (G-4, GN-1c). An item (a unit, a member, a field, a row of the kinds) is named with the
  first reason that its checks find, because a later check of the same item reads what an earlier one refused; a unit
  refused as a whole is not named again for the items that depend on it. A refusal that a target finds only while it
  writes its files (a type that its conversions do not take) is named after the refusals of the contract are none,
  and every target is emitted before the generation fails, so the refusal of one target does not hide that of another.
  Why: a generator that stops at the first refusal shows one defect at a time, so a contract is fixed by as many runs as
  it has refused items.
- **GN-1b** A generation of some targets of the contract (`generate` with `targets`) writes for them the same files
  that the generation of every target writes, and checks the refusals of those targets alone; the refusals of the
  contract are refusals of every target. Why: one target that the generator refuses does not stop the generation of
  another (GN-14c).
- **GN-1c** `binding generate` generates each target that it is given, or each target of the contract, by itself
  (GN-1b). It writes the files of every target that refuses nothing, names each refused target with its refused
  items and the targets that it generated, keeps the files of a refused target as they are, and then fails with
  status 1 when a target was refused. A refusal, like any failure that is no error of the command line, prints no
  usage line; only an error of the command line prints it, with status 2. A repository that builds and tests one
  target generates it alone with `--target`, so a refusal of another target does not stop it. Why: a contract that
  one target cannot take yet still gives the bindings of the other targets, every target that fails is named, and a
  usage line would say that the command was written wrong when it was not.
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
  needs beside the crate, and a file of the crate that does not depend on the contract (the `build.rs` of Node and of
  PHP, which the manifest names), so `cargo fmt --all` and the workspace's metadata work before a generation. Each Rust
  file is in a form that rustfmt keeps with its defaults and with the settings of a repository (`use_small_heuristics =
  "Max"`, a wider `max_width`), so `cargo fmt --all --check` of the repository passes whatever its `rustfmt.toml`
  holds of these: an allow attribute is one line of at most 80 columns, narrower than the width of a function-like
  attribute of either, and a reason that does not fit is the comment above it, the attribute naming its rule id alone. A core at
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
    (or `index.cjs`) by its relative path, and so do the generated tests, from `native/generated/tests/`. The WASM
    crate is `native/wasm/`, its module, glue and declarations are `native/wasm/generated/`, which the host's `files`
    names (`native/wasm/generated/*.mjs`, `*.js`, `*.d.ts` and `*.wasm`), and its tests import
    `native/wasm/generated/index.mjs` by its relative path.
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
- **GN-3d** The PHP binding crate links on macOS by its `build.rs` alone (BD-9): the script emits
  `cargo:rustc-cdylib-link-arg=-undefined` and `cargo:rustc-cdylib-link-arg=dynamic_lookup` when `CARGO_CFG_TARGET_OS`
  is `macos`, emits nothing for another target, and fails when that variable cannot be read (P-3). The crate's `[lib]`
  has `test = false` and `doctest = false`. No tracked file of binding or of a repository and no run of the end-to-end
  check gives a link setting in `RUSTFLAGS` or `.cargo/config.toml`. Why: PHP resolves the symbols of an extension when
  it loads it, so the macOS linker has to leave them undefined, and ext-php-rs 0.16.4 gives no such argument to a crate
  that depends on it. `cargo:rustc-cdylib-link-arg` applies to the cdylib of this crate alone, so the test executables
  of the core and of the other crates still fail on a symbol that does not resolve, which `rustflags` would let through
  for every crate; `.cargo/config.toml` is read only below the directory where Cargo starts, and `RUSTFLAGS` replaces
  it, so the same tree would link differently by where and how Cargo starts; a build script runs on the host, so the OS
  of the target is `CARGO_CFG_TARGET_OS` and not `cfg!(target_os)`. A Rust test executable of the crate would need the
  symbols of PHP, which only the loaded extension has, so the generated tests run in PHP.
- **GN-4** Each binding crate is a member of the repository's workspace (L-2) and takes its lints by
  `lints.workspace = true`, as every package of the repository does, so one table states the lints of R-1 for the core
  and the bindings. That table denies `unsafe_code` rather than forbidding it: the macros of ext-php-rs, napi-rs, PyO3
  and wasm-bindgen expand to unsafe code, and each unsafe block of the generated code carries an allow with its reason.
  An exception of one crate is an attribute of its source with its reason (`#![allow(<lint>, reason = "...")]`),
  because Cargo applies the workspace table to every member alike. The generated
  code holds only the helper functions it uses, because the lints deny dead code.
- **GN-4a** A target with a row in `core.features` (I-1) builds the core with those features only: its binding
  manifest depends on the core with `default-features = false` and the row's features.
- **GN-4b** A core gives each operation of platform I/O a Cargo feature: `fs` (paths of a file system),
  `blocking-io` (I/O that blocks the calling thread), `process` (waiting for another process) and `net` (network
  sockets). A dependency that only that operation uses is an `optional` dependency of the feature, and the module of
  the operation and the items that use it are `#[cfg(feature = "<feature>")]`. The `default` feature turns all four
  on. `core.features.wasm` names none of them, because WebAssembly in a browser has none of these operations; `binding
  check` reports one (CK-63). A core does not divide its dependencies by target (`[target.'cfg(...)'.dependencies]`),
  because `core.features` is the one place that states what a target builds; a check of an OS constraint, such as a
  `compile_error!`, is inside the module of its feature, so a WASM build without the feature does not compile it and
  an unsupported OS with the feature stops there. A member or unit that uses an item of a feature that WASM turns off
  is `only` of the other targets; the WASM build, not the contract check, judges that, because the check reads no Rust
  source.
- **GN-5** Every crate has `rust-version = "1.99.0"` and the feature `panic-test`, which adds the entry point of the
  B-7 test. The test features of a binding crate are the features of this table and no other; each adds entry points
  of the names below, the manifest that `binding scaffold` writes turns none on by default, and no release build has
  one (G-5). `<Alias>` and `<alias>` are the name of the alias in the class form of the language and in snake_case.

  | Feature | Use | Python | Node | PHP | Go C symbol |
  |---|---|---|---|---|---|
  | `panic-test` | B-7; the poison of B-5c (GN-6h) | `_panic_test`, `_panic_test_held` | `__panicTest`, `__panicTestHeld` | `<namespace>\Internal\panicTest`, `panicTestHeld` | `<prefix>__panic_test`, `<prefix>__panic_test_held` |
  | `codec-test` | the round trip of Go's conversions (GN-13b); the `in` function of a value alias alone (U-7) | `_alias_in_<alias>` | `__aliasIn<Alias>` | `<namespace>\Internal\aliasIn<Alias>` | `<prefix>__echo_<type>`, `<prefix>__alias_in_<alias>`; WASM `__aliasIn<Alias>` |
  | `fault-test` | fault injection (GN-8a) | `_arm_faults`, `_fault_left` | `__armFaults`, `__faultLeft` | `<namespace>\Internal\armFaults`, `faultLeft` | `<prefix>__arm_faults`, `<prefix>__fault_left`; WASM `__armFaults`, `__faultLeft` |

  For a contract with a class that has a write place (GN-6h), `panic-test` also adds the poison entry point of the
  B-5c test, which takes an instance, takes its write guard and panics.
  A Python, Node, PHP or WASM crate has `codec-test` when an alias of the contract has `in_raises`, the Go crate always
  (for its round-trip entry points), and every crate has
  `fault-test = ["<core crate>/fault-test"]` when the contract has `faults`: the feature of the core, which is
  `fault-test = ["polyspec-binding-core/fault-test"]`, compiles the arming. A case may arm a point of another
  library (`<library>.<id>`, G-5): then the feature of each binding crate also names `polyspec-<library>/fault-test`
  of each such library, and the crate depends on that core as the core does (T-3), because a Cargo feature turns on a
  feature of a direct dependency only; the core of the contract need not name it. `binding scaffold` reads the
  libraries from the points of the case files, a point of a library that the core does not depend on stops it with
  its name, and `binding check` compares the manifests with them (CK-19). A point (`fault::point!`) is live only in a
  crate whose own feature `fault-test` is on, because Cargo unifies the feature of binding_core across the build;
  so the feature that this list leaves out keeps the points of that library off, and its cases fail. A core with
  points has itself as a dev-dependency, `<core crate> = { path = ".", features = ["fault-test"] }`, so that
  `cargo test` of the core without flags arms them, in every repository in the same form (CK-65). The tests of a WASM crate reach the entry points of `fault-test` and of `codec-test`
  (`__aliasIn<Alias>`, which the table names for Node) through the module that wasm-bindgen writes. The Go tests reach
  them through functions of `internal/binding` with the build tags `polyspec_fault_test` and `polyspec_codec_test`
  (GN-13b).

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
  for the integer and a reference to it; `usize` and `isize` widen as GN-6ac states); a parameter is converted into
  the type of the table and then into the core's own type (GN-6ac). A contract name that is a Rust keyword
  is a raw identifier (`r#type`).
- **GN-6a** A record that a function returns, or that is an element of a parameter, has its result form (T-4) in each
  language: Python a frozen keyword-only `dataclass` in `<root>._types`, Node a plain object of its members, PHP a
  final class of public readonly properties whose constructor takes every field by name. Each binding converts it both
  ways (`in_<record>`, `out_<record>`); a value of another type in its place is kind `invalid_argument_type`.
- **GN-6t** A tuple (T-1) enters as a sequence of exactly its parts, and each part is converted as its type, so the
  core gets the Rust tuple of the parts: Python takes a `tuple`, Node and WASM an `Array`, and PHP a list (an array
  whose keys are 0 to n-1 in order). A value of another type, or a sequence with another number of items, is kind
  `invalid_argument_type`. A tuple is taken at every place of an input: a parameter, an item of a list, a field of a
  record parameter and inside an `optional`; the core takes a tuple parameter by reference (T-1). Go takes a tuple as
  GN-16 states.
  Why: a tuple leaves each language as that sequence, so a value that one call returns enters another call as it is.
- **GN-6ac** A value enters the core in the core's own Rust type and leaves it from that type, which the contract does
  not name (T-1). An integer of a parameter, of a field, of an item or of a part of a tuple is first converted into the
  type of the table (u64 for `uint`, i64 for `int` and `int64`) and then given to the core through the trait
  `IntoCore<T>` of the generated crate, and the place that takes the value, the core call or the field of a struct
  literal, chooses `T`. `IntoCore` narrows an integer with `TryFrom` to the integer that the core takes (u8, u16, u32
  and usize for `uint`; i8, i16, i32 and isize for `int`), takes a list and an optional item by item, and takes a tuple
  to the Rust tuple of its parts or, when its parts have one type, to an array (`[T; n]`); a value outside the range of
  the core's type is kind `invalid_number` (B-2) with the name of the argument as its subject, so on wasm32, where
  `usize` has 32 bits, 2^32 is refused as it is for a core `u32` on every target. A tuple that leaves the core is read
  through `partsN` (traits `Parts1` to `Parts8`), which gives a reference to each part of a Rust tuple, of an array and
  of a reference to either. An integer result of `usize` or `isize` widens with `as`, after the assertion
  `const _: () = assert!(usize::BITS <= 64);` (and the same for `isize`), which fails the build for a target where it
  is wider, because the standard library implements `From` for neither; the widened value then leaves by the rules of a
  result of its contract type in each language, as a u64 or i64 does. A list parameter is passed as GN-6ad states.
  The crate of the Go C ABI converts in the same way, after it reads each parameter from the encoded arguments.
  Why: the core keeps the integer type that its own code needs, such as `usize` for an index or a length, and the
  contract states only the range of the value. A trait whose target the core's signature chooses converts without a
  core type in the contract, so the contract stays the same for every core that holds the value.
- **GN-6ad** A list parameter whose items narrow (GN-6ac), a list of integers or of tuples that hold them, is converted
  into a local `Vec` of the table's types, which `IntoCore` turns into a `Vec` of the core's item type, and the core
  call takes `&values[..]`, so a core that borrows a slice of a narrower item, such as `&[usize]`, `&[u32]` or
  `&[[usize; 2]]`, gets one. An item outside the range of the core's type is kind `invalid_number` (B-2) with the name
  of the parameter as its subject. A list of other items is passed as `&values`, as GN-6 states. Go converts in the
  same way.
  Why: the core borrows a list as a slice, and `&values[..]` is that slice by its own type, `&[T]`, whose item type
  the parameter of the core fixes, without a deref coercion at the call. A unit test compiles the helpers of GN-6ac
  with such call sites against a core of narrower types for the host and for wasm32, so the inference is checked by
  the compiler and not assumed.
- **GN-6v** A variant unit (T-9) is the Rust enum that its `core_type` names, and each case is a struct variant of
  that enum: the Rust name of a case is its value in UpperCamelCase, and each field is matched and built by its
  contract name, so a case without fields is `Case {}`. A field whose type, or the type inside its `optional`, is a
  unit that reaches the variant that owns it again through fields of units and `optional`s alone is `Box<T>` (or
  `Option<Box<T>>`), because a Rust enum cannot hold itself; a `list` holds the variant without a box. Each binding
  converts the variant both ways (`in_<variant>`, `out_<variant>`) with a match of its cases that has no wildcard,
  so a case that the core or the contract lacks does not compile. Each case has the result form (GN-6a) of the record
  of its fields, named `<Variant><Case>`: Python a frozen keyword-only `dataclass` in `<root>._types` and the alias
  `type <Variant> = <Variant><Case> | ...`; Node and WASM a plain object whose tag member (the `tag` of the unit, by its
  language name) holds the case value, and the declarations the union of the case interfaces; PHP a final class of
  each case that implements the interface `<Variant>`. A value that is no case (an object without the tag, a tag that
  names no case, an instance of another class) is kind `invalid_argument_type`. In a case file a variant value is an
  object whose tag key holds the case value and whose other keys are the fields by their snake_case names (G-5).
  An `optional` field whose default is `{literal: null}` (T-4) may be left out, and a field left out is null, which the
  core gets as `None`: Python gives the dataclass field the default `None`, Node and WASM read a missing or `undefined`
  member as null and declare the member optional, PHP takes null at its place in the constructor (GN-6i), and a case
  value may leave out its key. Such a field always leaves with its value or null.
  Refused by name: a variant without `core_type`, two cases with one Rust name, a field with the name of the tag, and,
  not generated yet, any other field default of a case and a field that holds a class, a callback, a value alias or a
  unit of another repository.
  Why: the language value of a case says which case it is, so the binding converts it without a guess, and a match
  without a wildcard makes a case that one side lacks a compile error instead of a value lost at run time.
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
  loaded), Node and WASM take and give a plain object, which the declarations write by its fields. Each binding crate depends
  on that repository's crate with the core's own dependency line, which `binding scaffold` copies.
- **GN-6d** A callback interface (U-3) is a struct that holds the language object and implements the core trait; a
  member that takes one returns `Result<T, Failure<E>>` (E-1c) and the core takes it as `&mut` (or, by coercion, `&`).
  When the object enters, each member must be callable (kind `invalid_callback`). A call converts the arguments out
  (borrowed per T-1) and the result in; an exception of the language code, or a failure of the binding in the call
  (a result of another type, a call from another thread with `thread: owner` on Node and PHP, kind `wrong_thread`), goes to the core
  as a `Raised` whose handle names it in the binding's table, and the generated caller throws the same object again.
  The interface is declared as a Python `typing.Protocol` in `<root>._types`, a Node interface and a PHP interface
  that the extension registers. The binding crates depend on `polyspec-binding-core` with the feature `construct`.
- **GN-6w** A class unit that `implements` a callback interface of this contract (U-1, U-3) has, for each member of
  the interface that it does not declare under the same name, a method that calls the trait method on the held
  value, `<core_type as <trait>>::<method>`, and raises the `Failure<E>` that it returns (GN-6d). The declarations
  name the interface: Node and WASM `class <Class> implements <Interface>`, and PHP the interface that the extension
  registers, in the stub and in the entry of the class; Python has the method that the `Protocol` names. An instance
  of the class therefore enters where the callback is taken as any language object with those members does, and the
  call of the callback reaches the held value through the method. In a case an instance value (GN-13f) may stand at
  a place of the callback. Refused by name, not generated yet: an interface of another repository, a member that the
  class implements with a receiver other than `&self`, and an abstract class (U-1).
  Why: a class whose core type implements the trait is a callback already, so a caller passes its instance where the
  callback is taken instead of an object of its own that forwards each call.
- **GN-6e** A value alias with `core: {in, out}` (U-7) enters as the `HostValue` that the binding describes one level
  at a time (B-1) and the core's `in` function judges through `HostValues`; its failure is the core's kind or the
  exception that language code raised while the core walked the value (a getter, an iterator), thrown again unchanged.
  What a language value is as a `HostValue` is binding's rule: Python takes the exact built-in types (a subclass of
  `int`, `float`, `str` or `bytes` is `Other`); Node takes a number as `UntypedNumber`, a bigint as `Int` (its decimal
  token outside `i64`), a string as its UTF-16 units, an Array, a Map, a plain object (prototype `Object.prototype` or
  `null`, own enumerable string keys), a Date, a function, and a typed array or a symbol as `Other`; PHP takes an
  element that is a reference as `PhpReference` with its identity, an array with `array_is_list`, a stdClass and a
  Closure. A core value leaves as the `OutValue` of the core's `out` function, made by the alias's `out` rows of
  built-in forms or by a member: a constructor or static member of a generated class of the contract whose one
  parameter is the content of the kind (bool, int, int64, float, text or bytes) and which cannot fail is called on that
  content by its core path, and its value leaves as an instance of the class; any other member, and a member in an
  alias of another repository, is refused by name (G-4); the form `{"keyed_map": {"key": [...]}}` is made as a
  map, each key of the kinds it lists made by the rows as its items are (T-2); in Python and Node the same handle is the same object,
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
  `out` row by a member (GN-6e) (G-4); WASM takes it as GN-18b states and Go as GN-15c states. The `in_raises` of an alias of another repository
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
  `toString` in Node and `__toString` in PHP. A to_json is `toJSON` in Node, `jsonSerialize` in PHP, whose class
  implements `\JsonSerializable`, and `MarshalJSON` in Go (GN-15a); Python has no JSON hook, so the member is absent there. The PHP extension names no
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
  with named arguments skips and the extension cannot tell the two apart. A record parameter with the default
  `{empty: "object"}` may be left out as a whole when every field of the record has a default: the core takes the
  record, whose every field is then `None`. Python and PHP take the fields as keywords and named arguments, which are
  then all left out; Node and WASM take the options record as a trailing argument that may be missing or `undefined`,
  and the declarations make it optional. Refused by name (G-4): a record parameter with `{empty: "object"}` that has a
  field without a default, any other default of a record parameter, a default of an `optional` type, a default of a type that is no
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
  `errno` or `message`, a row with `library` (E-1b (a)), a `class` that names no error unit of the category of its row
  are refused by name (G-4). An error unit of a module other than the root is a class of the
  namespace of its module in PHP (GN-10), a class of `<root>._errors` that `<root>.<module>` imports in Python (GN-11),
  and an export of the entry by its name in Node and WASM, as every other name of a module is. Go generates an error
  unit as GN-15d states, in package `errors` whatever its module. WASM generates an
  error unit as Node does: a class of the ES module that extends its parent, handed to the module after the classes of
  the categories, whose properties the module defines on the instance as read-only own properties (GN-18).
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
  `<root>._types`, which the native module imports when it loads (B-4); a module of the contract is `<root>.<module>`,
  which imports the error units of the module from `<root>._errors`, and `<root>` re-exports every public name (P-3). An enum is an `enum.StrEnum` (T-6); the package needs Python 3.14
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
  of the listed kinds (T-2): the entry passes the entries of a `Map` to the addon, which judges each key (a number key
  that is no safe integer is kind `invalid_number` (GN-12a), any other key or value is kind `invalid_argument_type`), and makes a `Map` of the entries that the addon gives back. Because the
  entry does it, such a map is a whole parameter or return, or an optional one; one inside another type, and byte
  string keys, which a `Map` compares by identity, are refused by name (G-4), so nothing is left out silently; the
  generator takes them when a contract needs them.

- **GN-12a** Every target (T-1, CK-64): an `int` value that the binding takes, as an argument, an item of a list, a
  tuple, a map or an optional, or a field of a record, is a safe integer, −(2^53 − 1) to 2^53 − 1, and a `uint` value is
  0 to 2^53 − 1; an integer outside that range is kind `invalid_number` (B-2) in PHP, Python and Go as in Node and
  WASM, whose number holds no larger integer exactly. Why: one contract gives the same result in every target, and an
  integer that one target takes and another refuses would give two. An `int64` takes the range of i64 in every
  target. An integer key of a `keyed_map` whose contract lists `int` keys is a safe integer too: an integer key
  outside that range, and in Node and WASM a number key that is no integer, is kind `invalid_number` in every target,
  where Node and WASM gave `invalid_argument_type` before; a key of a kind that the contract does not list stays kind
  `invalid_argument_type` (T-2). Why: a refused number has the kind of B-2 at every place, so the same key gives the
  same kind in every target.
  Node and WASM: an `int64` parameter takes a `bigint` of the range of i64 or a number of the safe
  integers, and anything else is kind `invalid_number` (B-2); an `int64` result is a `bigint`, so that the whole range
  of i64 leaves, as the declarations say (`number | bigint` in, `bigint` out). A case file gives an integer outside
  the safe integers as its JSON token, which `binding` reads as a `bigint` and every test writes by its decimal
  token, a Node test as a `bigint` literal (G-5).
- **GN-6l** A method of a class has the Rust name `member_<name>` in the generated crates of Python and PHP, and its
  name in the language is an attribute (`#[pyo3(name = ...)]`, `#[getter(...)]`, `#[php(name = ...)]`), so that no
  name of a member meets a naming convention that the lints judge for methods (`from_*` with `self`, the names of the
  methods of std traits); a hook keeps the name the language calls (N-4). A field of a scalar of T-1 is passed to its
  WASM conversion by value, because a borrow of a `Copy` value is needless.
- **GN-6m** A member with `wait: blocking_io` (B-5 (a)) passes `binding_core::Io::for_generated_call()` to its core
  function as the first argument after the receiver (I-2 (4)), and each language waits in its own form:
  - PHP calls the core on the calling thread, which blocks until the core returns.
  - Python: `<name>` converts the arguments with the GIL held and runs the core call in `py.detach`, so other Python
    threads run while the core waits. The object or module also has `a<name>`, an awaitable that runs `<name>` with the
    same arguments in `asyncio.to_thread`, so an event loop does not block; its arguments are judged when `<name>` runs
    in that thread (CK-16 keeps the name apart from the other members and from the reserved words).
  - Node returns a `Promise`. The entry point converts the arguments, takes the locks of its places and the arming of
    its faults on the JavaScript thread, runs the core call on the libuv pool (`Env::spawn` of a `ScopedTask`) and
    converts the result or the error on the JavaScript thread; a panic of the call rejects the promise with kind
    `internal` (B-7). The JavaScript entry of the member is an async function, so that every failure, also one of the
    arguments, rejects the promise and none is thrown at the call. The declarations name `Promise<T>`, and the
    generated tests await the call.
  - Go hands the work to the core in a cgo call that returns at once; the calling goroutine waits on the completion
    channel of the work, which the core fills through an exported Go function, so that a waiting call holds no OS
    thread (B-8). It is not generated yet, and a Go member with `wait: blocking_io` is refused by name (G-4).
  - WASM has no such member: the contract gives it `only` without `wasm` (Q-4, CK-15).
  A member with `blocking_io` that reaches language code is generated as GN-6q states. A constructor, a property, an
  iterate or a hook (N-4) that waits is refused by name, because the language has no awaited form of them, or calls a
  hook in its own protocol, which awaits nothing; `process_wait` is refused by name (G-4).
- **GN-6n** A member with `wait: async_driver` (I-2 (4)) calls an `async fn` of the core, which takes no token, and its
  generated code runs the future on a tokio runtime, so that a core of tokio (redis-rs) finds the runtime that it needs.
  The entry point converts the arguments and takes the locks and the arming of its faults on the calling thread, as
  GN-6m states, and the future owns them: it is `async move` over the converted values and the owned guards, so it is
  `Send + 'static`. Its faults are installed around each poll (`fault::Armed::around`), and a panic of a poll is a
  failure of kind `internal` (`driver::Caught`, B-7). Each language waits in the form of GN-6m:
  - PHP runs the future in `binding_core::driver::block_on`, on the runtime of binding_core, and the calling thread
    blocks until it ends.
  - Python: `<name>` runs `binding_core::driver::block_on` in `py.detach`, and `a<name>` runs `<name>` in
    `asyncio.to_thread`, as GN-6m states.
  - Node returns a `Promise`: the future runs on the tokio runtime of napi (`Env::spawn_future_with_callback`, the
    napi feature `tokio_rt`, which the binding crate turns on when its contract has such a member), and its result or
    error is converted on the JavaScript thread. The JavaScript entry is an async function, as GN-6m states.
  - Go refuses such a member by name until the completion channel of GN-6m is generated (G-4).
  - WASM refuses such a member by name until its Promise form (`wasm-bindgen-futures`) is generated (G-4).
  A member with `async_driver` is refused by name where GN-6m refuses a member that waits, and also when it reaches
  language code, because a future that a runtime polls on its own threads would call the language code there; such a
  member needs a core that gives a state machine without I/O, which is not generated yet (G-4).
  Why: a core that speaks a network protocol is async, and a future that borrows nothing of the caller can run on any
  thread of a runtime, while the caller of each language waits in the form that its language has.
- **GN-6o** A method whose core receiver is `self` consumes the core value of its object (E-1a, B-5c). Its receiver is a
  write place, and the generated code takes the value out of the lock of the class (`take` of `binding_core::Exclusive`
  or `Shared`), so the lock holds no value after the call, also when the core fails, because the core owns the value
  from the call on. Every later place of that object, as the receiver or as a parameter, fails with kind `consumed` of
  category `type` (E-1a), before any argument reaches the core. A member that waits takes the value on the calling
  thread and moves it into its work or its future (GN-6m, GN-6n). G-5 generates for each such member a test that calls
  it and then another member of the same object, which fails with kind `consumed`. PHP, Python and Node generate it;
  Go and WASM refuse such a member by name until their wrapper takes the value (G-4). Why: a value that the core owns
  after the call cannot be reached through the object again, and the kind tells the caller why the object refuses.
- **GN-6p** A class unit with `cleanup` (B-10) names a method of the unit whose core receiver is `self` (GN-6o); another
  member is refused by name. The binding crate asserts at compile time that the core type of such a unit implements
  `binding_core::Cleanup` and that the core type of every other class unit does not (an ambiguous trait implementation,
  which fails to compile when the type implements it), so that a resource that needs a cleanup call is not missing
  from the contract. When an object whose value was not consumed is destroyed, its destructor drops the core value,
  whose `Drop` releases the resource, and warns that the cleanup call was not made, with the message
  `<Class> was destroyed without <cleanup>(), so its destructor released it (B-10)`:
  - PHP raises `E_WARNING` when the object is freed, and PHP puts the name of the running function before the message
    (`php_error_docref`), so the B-10 test requires a message that ends with it;
  - Python warns with `ResourceWarning` when the object is finalized; the destructor keeps an exception that is being
    raised while it runs (the object may be a temporary of the failed call) and sets it again after the warning, because
    a warning call with an exception set fails;
  - Node emits the warning with `process.emitWarning` and the type `ResourceWarning` when the class is finalized.
  Go and WASM refuse such a unit by name until their finalizer (`runtime.SetFinalizer`, `FinalizationRegistry`) is
  generated (G-4). G-5 generates for each such unit a B-10 test that makes an object through its sample receiver,
  drops it without the cleanup call and requires the warning, and in PHP and Python a test that calls the cleanup
  member, drops the object and requires no warning: PHP unsets the object under an error handler; Python deletes it
  under `warnings.catch_warnings(record=True)`; Node turns on `gc()` (`v8.setFlagsFromString('--expose-gc')` and
  `vm.runInNewContext('gc')`), calls it and awaits the `warning` event of the process. Node has no test of the absent
  warning, because the absence of an event is seen only by a time limit; `taken` of the lock, which the destructor
  reads, is tested in binding_core. Why: a resource that the caller forgot to close is still released, and the warning
  names the call that the caller left out.
- **GN-6q** A member with `wait: blocking_io` reaches language code when the type of a parameter or the class of its
  receiver carries language code (GN-6h): during the call the core may call a callback (U-3) or touch a `Native` of a
  value of language code. The core calls that code on the thread on which it runs the call, so each language runs the
  call where its language references may be used, as the owner table of the `Native` lifetime requires (a Node or PHP
  `Native` names an entry of the owner table of its thread, and a Python `Native` is a `Py<PyAny>`):
  - PHP calls the core on the calling thread, as GN-6m states, so a callback and a `Native` are used on their thread.
  - Python runs `<name>` and `a<name>` as GN-6m states. Each call of a callback acquires the GIL on the thread on which
    the core calls it (`Python::attach`), and a `Py<PyAny>` is released on any thread (the reference pool of PyO3), so
    the core may call language code on the thread of `py.detach` and on the worker thread of `asyncio.to_thread`. A
    Python reference is bound to the GIL and not to a thread, so a Python callback with `thread: owner` has no check of
    kind `wrong_thread`; `thread: owner` is enforced on Node, PHP and WASM (GN-6d, GN-18c).
  - Node runs the call synchronously on the JavaScript thread, which owns the callback objects and the entries of the
    owner table, and the entry returns a promise that the result or the failure of that call settles. The JavaScript
    entry is an async function, and the declarations name `Promise<T>`, as GN-6m states, so the language form of the
    member does not depend on whether it reaches language code. The JavaScript thread waits while the core waits for
    I/O; the specification of each core states this cost for such a member.
  - Go refuses a member with `blocking_io` by name (GN-6m), and WASM has no such member (GN-6m).
  Why not another thread of Node: a callback object of napi is valid only on the JavaScript thread, and a pool thread
  that hands each callback call to that thread through a thread-safe function and waits for its answer holds a thread
  of the libuv pool for the whole call, and it never ends when the JavaScript thread waits for that pool. A core that
  judges per call whether it reaches language code (`core.reaches`) would let the call run on the pool when it does
  not; it is not generated yet. G-5 generates for such a member in Python a test that awaits `a<name>` in
  `asyncio.run` with a callback that raises (K-2) and requires the exception of the callback, so a callback that the
  core calls on the worker thread of `asyncio.to_thread` runs there.
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
  is a Go keyword, a name of the generated body or the package name of a module of the contract takes a trailing `_`.
- **GN-15a** Go class units (T-5, GN-6h): a class unit is the struct `<Class>` of the package of its module, which
  holds a handle of the C ABI in an unexported reference; the C ABI keeps the core value in a table under that handle
  (handle 0 is no value, kind `invalid_argument_type`) behind the lock of GN-6h, and `runtime.AddCleanup` releases it
  through `<prefix>__release_<class>` when Go collects the struct. A constructor is `New<Class>` (none when
  `constructible` is false), a static member the function `<Class><Member>` (CK-13), a method or property a method of
  `*<Class>` that keeps the receiver alive until the call returns (`runtime.KeepAlive`); an iterate returns an
  `iter.Seq[T]` or `iter.Seq2[K, V]` over the items that the C ABI collected, and a stringify is `String()`, which
  panics with the error of the core because `fmt.Stringer` has no error result. A member of another module reaches a
  class or a callback unit through functions of its package whose first parameter is `binding.Token` of
  `internal/binding`, a type that only the packages of the Go module can name: `<Class>Handle` gives the handle of an
  instance, `<Class>FromHandle` makes the instance of a handle, and `Dispatch<Callback>` gives the dispatch of a Go
  value of the callback. A package has them only for a unit that another module names, and CK-13 counts their names.
  Modules whose packages would import each other are refused by name, because Go refuses an import cycle. A to_json is `MarshalJSON` of `json.Marshaler`,
  which marshals the value that the core gives with `encoding/json` and returns the error of the core, so
  `json.Marshal` of an instance gives the JSON form that the core decides; a to_json that returns `never` returns the
  error alone. A member that returns `never` has no result before its `error`.
- **GN-15b** Go callback units (U-3, K-2): a callback unit is a Go interface whose methods return their result and
  `error`. The C ABI holds a callback as the handle of the call and of the Go value, calls back through the export
  `<prefix>__go_callback`, and a nil callback is kind `invalid_callback`. An error that a method returns stops the
  core and comes back to the caller as the same error value, which the call keeps by its index until it returns.
- **GN-15c** Go value aliases (U-7, T-3): a value alias, also of another repository, is `any`. The C ABI reads the Go
  value through questions to the export `<prefix>__go_host` (its kind, its items, the keys of a map in the order of
  `fmt.Sprint`), so the `in` function of the core walks the value without a copy; a kind of the `in` function is the
  error of its category, for an alias of another repository by the E-1 of its owner. A core value leaves as the Go
  value of the first `out` row of a built-in form: `nil`, `bool`, `int64`, `float64`, `string`, `[]byte`, `[]any`,
  `map[string]any`, or `*KeyedMap[any]`. A row that makes the value by a member (GN-6e) gives the instance of the
  class: the C ABI writes the number of the class in the contract and the handle of the value, and the package of the
  module of the class makes the instance by that number, because `internal/binding` does not import that package. A
  member of another module that gives such a value is refused by name, because only the package of the class makes
  its instance. `AliasIn<Alias>` of `internal/binding` (feature `codec-test`) runs the `in` function of an alias of
  this repository alone.
- **GN-15d** Go error units (E-2, E-7, I-3): an error unit is a struct `<Unit>` of `internal/binding` that embeds a
  pointer to its parent (its parent unit, or the category type), so `errors.As` finds the parent and the category
  through `Unwrap`; package `errors` names it as an alias, and each property is a method that returns the value that
  the C ABI read from the core error. A kind whose row names the unit is created as that struct.
- **GN-15e** Go `source` and defaults (T-1, U-2, T-4): a `source` parameter is a `[]byte`, which holds the bytes of a
  text too, and its bytes go to the core. A parameter or record field with a default is a pointer `*T`: nil leaves
  it out, and the core decides its value.
- **GN-15f** Go records of another repository (T-3, GN-6c): a record of another repository is the struct `<Record>` of the package of its
  module in the Go module of that repository, the module of `packages.go` of its contract, which the package imports
  by its package name; the C ABI writes and reads it field by field as a record of this repository, through
  `in_<library>_<record>` and `out_<library>_<record>`; a record of another repository with a field of a unit type, and
  one whose package has the name of a package of this repository, are refused by name. `binding scaffold` reads the contract of each library that the
  contract names, as `binding generate` does: the contract of a `path` dependency of the core is the `interface.json`
  of that path, which needs no Cargo, and the contract of any other dependency is found through `cargo metadata`. For
  each library whose records the contract names it writes a line `require <module> <version>` in `go.mod`: the version
  is `vX.Y.Z` when the dependency line of the core on `polyspec-<library>` names the version `=X.Y.Z` or the tag
  `vX.Y.Z`; a `path` dependency gives `v0.0.0` and a line `replace <module> => <path>` from the Go module of this
  repository to the Go module of that one; a dependency line that names a branch, a commit or a version range has no
  Go version and is refused by name. The Go program then also links the static library of that repository, which the
  end-to-end run builds into the same directory as the one of this repository (GN-14).
- **GN-16** Go types (T-1, T-2, B-8): bool `bool`, int and int64 `int64`, uint `uint64`, float `float64`, text and latin1
  `string`, bytes `[]byte`, `list<T>` `[]T`, `map<T>` `*Map[T]` (below), `optional<T>` `*T`, a tuple inside another type or as a parameter
  `[N]T` when its parts have one Go type, and else `Tuple<N>[T0, T1, ...]`, the generic struct of `internal/binding`
  whose fields `P0` to `P<N-1>` hold the parts in order and which a package that names it declares as an alias, as it
  does `Map` (a Go array has one element type), a tuple return several results. A Go string is bytes: text is passed as its bytes and the C ABI refuses bytes
  that are not UTF-8 as kind `invalid_text` (B-3); latin1 is a Go string of runes U+0000 to U+00FF, one per byte,
  because Go reads a string as UTF-8: the C ABI takes it as UTF-8 and refuses a rune above U+00FF as kind
  `invalid_text`, and a byte leaves as the rune of the same code point (B-8, the rule of every language); a string of
  the core leaves as its UTF-8 bytes. An enum value that is not one of the
  constants is kind `invalid_argument_type`. A function that calls the core returns `error` last (E-7); B-2 and G-7
  hold by the Go types and the compiler, except the range of GN-12a: the C ABI refuses an `int` or a `uint` outside the
  safe integers as kind `invalid_number`. An optional value leaves the C ABI as a tag and its value, and the C ABI
  takes it as an `Option` of a reference to the value of the core (`as_ref`), as PHP, Python and Node do, so the type
  of the value is the type of the core: a generic output conversion of the value, such as that of an int or a text,
  then has one type to take. `Map[T]` is the ordered map of T-2, an alias of `internal/binding.Map` that a
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
  instance broken; every later call fails with the same kind. `bytes` is a `Uint8Array` both ways and a `source` takes a
  string, as its UTF-8, or a `Uint8Array`, as in Node (GN-6j, T-7). A parameter or a field with a default (GN-6i) is left
  out as in Node: a missing trailing argument, a missing member of the options record, or `undefined`, which the module
  passes as `None`; the ES module counts the arguments from the required ones to all of them. The module is not instantiated again, because the state
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
  call of the instance fails with an error that has no kind (P-2). The table holds the value of a class that has a lock
  (GN-6h) in that lock (`binding_core::Exclusive` or `Shared`, of the feature `lock` that every binding crate turns on),
  and each place of a call takes its guard for the call, so a member with the receiver `&mut self` writes the value
  and a second place of the same value is kind `busy` (B-5c). A panic traps (GW-7), so no WASM test poisons a lock. A
  class unit with
  `cleanup` (B-10) and a method with the receiver `self` are refused by name (GN-6o, GN-6p).
- **GN-18b** WASM, a value alias with `core: {in, out}` (U-7), also of another repository (GN-6k): the value is taken
  and given as in Node (GN-6e). The module describes a JavaScript value one level at a time as the `HostValue` of the
  rule of Node: a number is `UntypedNumber`, a bigint `Int` (its decimal token outside `i64`), a string its UTF-16
  units, an Array, a Map (its entries by `Array.from`), a plain object (prototype `Object.prototype` or `null`, the keys
  of `Object.keys`), a Date, a function, a symbol, a typed array and any other object (with the name of its
  constructor). A Date and a Map are found by `instanceof` of the global class. A core value leaves by the alias's
  `out` rows of built-in forms, and the same handle is the same object. Every JavaScript operation of the description
  that may run code of the value (a getter, a trap of a proxy, an iterator) is called with `catch` (`Reflect`, and
  `Array.isArray`, `Array.from` and `Object.keys` imported with `catch`), so its exception is a value that the call
  throws again unchanged; an exception never unwinds through the frames of the WebAssembly module, which would leave
  its stack and its tables in a broken state. A failure (`Fail`) carries that exception, and the core keeps it as the
  `Raised` of U-3. A value that enters as a handle is kept for the life of the instance (U-7 (d)). The in function of
  an alias with `in_raises` runs alone through `__aliasIn<Alias>` of the feature `codec-test` (GN-5); the generated
  test calls it on the module that wasm-bindgen writes, as the tests of `fault-test` call `__armFaults`, and expects the
  class of the category and the kind of each case of the alias (U-7).
- **GN-18c** WASM, a callback unit (U-3): as GN-6d states, a struct that holds the JavaScript object, checked when it
  enters (an object whose members are functions, else kind `invalid_callback`), that implements the core trait. A call
  takes the member by `Reflect::get`, converts the arguments out, calls it with `Function::apply` and converts its
  result in; the exception of the JavaScript code, which `apply` returns, or a failure of the module goes to the core as
  a `Raised`, and the member that took the callback, whose core returns `Failure<E>`, throws the same object again. A
  WebAssembly instance runs on the thread that loaded it, so a callback with `thread: owner` is always called on its
  thread and has no check of kind `wrong_thread`. The declarations write the interface as for Node.

## Generated tests (G-5)

- **GN-13** For every function, each language's test module checks: B-2, every number parameter or field with the values
  of G-5 (NaN, the infinities, 1.5, true, "7", -1 for uint, 2^53 for uint and int and −2^53 for int, GN-12a) as kind
  `invalid_number` of the value class, and for every `keyed_map` parameter whose contract lists `int` keys the key
  2^53 as kind `invalid_number` (GN-12a);
  B-3, a text with an unpaired surrogate (PHP: bytes that are not UTF-8) and a latin1 text with U+0100 as kind
  `invalid_text`; B-4, every contract case that raises, with the exact class (GN-13d), the base class of E-2, the kind, the status
  and errno; B-7, the panic entry point as kind `internal`; G-7, a missing argument, one argument more and an unknown
  name (PHP named argument, Python keyword, a member of the Node options record, and a missing member). The arguments
  of a case are its keys in snake_case, a record parameter an object of its fields, an enum its value text and a latin1
  value a text of U+0000 to U+00FF; a case without the key of a parameter that has no default is refused by its id. Values that JSON
  cannot write: bytes are `{"hex": "<two lower-case hex digits per byte>"}`; a `source` is its text, or the same
  `{"hex": ...}` for bytes that are no text; a text that is not well formed is `{"ill_formed": "<text>"}`, the text
  and then one code unit that no well-formed text holds: an unpaired surrogate (U+D800) in Python, Node and WASM,
  whose texts are code points or UTF-16, and the byte 0xFF in PHP and Go, whose texts are bytes; a float that is not finite is `{"float": "nan" | "inf" | "-inf"}`; a
  value of a value type (`json_value`, `php_value`, `template_value`) is `{"kind": <value kind>, "value": ...}` with
  the kinds of the value table: `null` has no `value`; `bool`, `int`, `float` (a number or the form above), `number`
  (its literal as text), `text` and `bytes` (`{"hex": ...}`) hold that value; `list` holds an array of such values,
  or, for a value nested deeper than a JSON reader takes, `{"kind": "list", "repeat": <n>, "value": <value>}`: n
  lists (at least 1), each the one item of the one around it, the innermost holding the value, which the test makes
  in a loop;
  `map` and `object` hold an array of `[key, value]` pairs in order, a key being a text, or `{"int": n}` or
  `{"hex": ...}` for a keyed map; `reference` holds `{"id": n, "value": ...}`, and the same `id` is the same reference.
  A value of a value type that a class of origin value represents (U-1) is the call of the static member or
  constructor that the `out` row of its kind names for the language: a member without parameters for a kind without
  `value`, and a member of one parameter, which takes the case's `value` as a case value of its type, so `list` holds
  the values of the class; a kind that no row makes by such a member (a member of two parameters, a built-in form, or
  two rows of the kind that name two members) is not written. A case whose receiver or argument the generator does not
  write has a test that fails with the reason, the case and the member, and the other tests of the target are written
  (G-4, GN-13e); every other value that no test can make, such as the placeholder of a class without a factory, is a
  refusal of the target by name, and the generator ends with no exception that names no item.
  A value of the type `cancel` is `{"cancel": "fired"}`, a cancellation that fired before the call, or
  `{"cancel": "open"}`, one that does not fire (CK-22); the type is not generated yet, so a member that takes it is
  refused by name (G-4).
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
  them. A callback inside another type (a field of a record, an item of a list, an `optional`) is given as the same
  fixture, and a function as `{"function": [<row>]}`, whose `args` are the positions of its parameters (`"0"`, `"1"`,
  ...). `binding check` judges the form (CK-22). The B-4 test of a member that takes a callback runs its raising cases
  with their fixtures. A stringify and a to_json are run as the language runs the hook
  (GN-6g): a stringify has a test for each of its cases that does not raise, in which the string form of the instance
  (`str`, `String`, a `(string)` cast) is the case's `result` and, in PHP, the instance is a `\Stringable`; the B-4
  test of a to_json calls `JSON.stringify`, `json_encode` or or the unexported `toJSON` in Go, as the Go test of a stringify calls `stringify`; neither has a G-7 test. B-5c (GN-6h): for every class with a write place, a test makes an instance, runs the poison
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
  GN-13. Not generated and not refused: the test of a case with `faults` that does not raise, because the test of
  GN-13e arms no faults yet; the test of a member that takes an alias inside a map, a record field or the
  return of a callback; and the check that no release build has a test feature (the resolved features of
  `cargo tree`, and the export list of each installed package), of which the end-to-end check has the part of Go
  (GN-13b).
- **GN-13d** Python, Node, PHP and WASM also check, for the shapes of GN-6i, GN-6j and GN-7a: U-2, for every parameter or
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

- **GN-13e** Every target runs each contract case of a member that does not raise, has no `faults` and is no hook
  (N-4), and compares its result with the value of the case: Node and WASM with `assert.deepStrictEqual` after a
  `Map` becomes its entries in order, Python by type and value with the items of a `dict` in order and NaN equal to
  NaN, PHP with `assertSame` after an object becomes its class and properties, and Go with `reflect.DeepEqual` for
  each part of a tuple return. The key of the case that holds the result is the `result` of its `cases` row, or
  `result` (CK-22). A value is written as the case gives it: an `int64` result is a Node `bigint`, a tuple is a Python
  tuple and a Go array or the results of a Go function, `bytes` is `{"hex": ...}`. A case without the key runs the
  call alone and fails when it raises. A case whose result has no case form (a class, a result of `none`), whose
  value alias has no out row that makes the built-in form of its kind in the language, or that gives no argument of
  a parameter or of the factory of its receiver fails its test with that reason, so the case is never left out.
- **GN-13f** A case of a method gives its receiver either as the arguments of a factory of its class among its own
  keys, or under the key `receiver` as an instance value, which earlier calls make:
  `{"new": "<member id>", "receiver": <instance value>, "args": {...}, "then": [{"call": "<member id>", "args": {...}}]}`
  or `{"from": "<member id>", "receiver": ..., "args": {...}, "pick": [<step>], "then": [...]}`. `new` names a member
  that returns the class: a constructor, a static member, a function, or a method of any class; `from` names a member
  whose result holds the class, and `pick` reaches it by steps: a field name in snake_case, `{"index": n}` of a list
  and `{"tuple": n}` of a tuple. `receiver` is given when the member is a method, and is an instance value itself.
  `args` holds the parameters of the member by their snake_case keys; the value of a class at any place of a case (a
  parameter, an item of a list, a field of a record, an `optional`) may be an instance value, and so may the value of
  a callback that a class of the case implements (GN-6w). Each call of `then` is a method of the class, called on the instance in order, and its result is not
  compared; a call with `"raises": {"kind": <kind>}` must fail with that kind of its member's raises, which the test
  requires before the next step, so a kind that only an instance after a failed call reaches has a case. A test makes every instance of the value as a local of the test, the receivers and the results that a
  pick reads from included, so none is reclaimed before the test ends; the tests that need any receiver (B-2, B-3,
  G-7) call a function of the test file that makes it. `binding check` reports a value that breaks this (CK-22).

- **GN-13b** Go: the tests of a package are `zz_generated_test.go` in the package itself, so that a test reads the
  handle of an instance, run by `go test`: B-2 for every `int` parameter (2^53 and −2^53) and every `uint` parameter
  (2^53) as kind `invalid_number` (GN-12a), the key 2^53 of every `keyed_map` parameter with `int` keys as kind
  `invalid_number` (GN-12a), B-3 for every text parameter or field (the bytes FF), the enum check of
  GN-16 for every enum parameter or field, U-2 (a call without an argument with a default gives the call with its
  default), U-7 (a kind of an alias through the member), K-2 (a nil callback, and the error of a callback is the error
  of the call), B-4 for every contract case that raises (the exact type of E-2 and E-7, `errors.As` of its category,
  the kind, the status and the errno), GN-13e for every case that does not raise, and N-4 for a stringify. The cases
  that arm faults are `zz_generated_fault_test.go` with the build tag `polyspec_fault_test`, and they lock the
  goroutine to its thread, because the arming is of the thread; the poison tests of B-5c are
  `zz_generated_held_test.go` with the build tag `polyspec_panic_test`. The end-to-end check runs `go test` with the
  tag `polyspec_<feature>` of each test feature of the crate. B-7 is
  `internal/binding/zz_generated_panic_test.go` with the build tag `polyspec_panic_test`, which also declares the C
  ABI's panic entry point, so the static library needs the feature `panic-test` only with that tag.
  `internal/binding/zz_generated_map_test.go` checks the order of `Map` and that the encoding keeps it both ways.
  Every latin1 parameter or field is tested with U+0100 and the bytes FF as kind `invalid_text`. The features
  `panic-test` and `codec-test` are for tests only: the manifest that `binding scaffold` writes turns neither on by
  default and `binding check` refuses any other manifest (CK-19), and the end-to-end check builds the static library
  without features and fails if it holds a test entry point (`__panic_test`, `__echo_`, `__arm_faults`,
  `__fault_left`, `__alias_in_`). With the build tag
  `polyspec_codec_test` and the feature `codec-test` of the C ABI crate, test entry points give back a latin1 value
  (when the contract takes and gives latin1), a `map<text>` and a `keyed_map<text>` with every key kind (when it takes
  and gives such a map) through the conversions of the binding; `zz_generated_codec_test.go` checks that U+0000 to
  U+00FF, the order of a map and the order and kinds of the keys of a keyed map come back the same and that U+0100 is
  refused; the cases of an alias of this repository run its `in` function alone through `AliasIn<Alias>`. A `keyed_map` parameter or field whose contract does not list every key kind is tested with a key of a
  missing kind as kind `invalid_argument_type`. A case's latin1 value is a Go string of its runes; a case gives a `map` as
  an object of its entries in order and a `keyed_map` as GN-13 does.
- **GN-13c** WASM: `packages/ts/wasm/generated/tests/generated.test.mjs` runs the tests of GN-13 for Node, those of the
  members of a class among them, the tests of K-2 and the callback fixtures of a case among them, and the U-7 tests of
  an alias (GN-18b), with `node --test` against the subpath `./wasm` of the installed package. The B-7 test runs last: it runs the panic entry
  point through `state.mjs` and expects kind `internal`, then a later call that is kind `internal` when the instance
  trapped and that works when the module unwinds (GW-7).

## End-to-end check

- **GN-14** `make e2e REPO=<checkout> WORK=<directory> [BINDING=<commit>] [DEPS="<checkout>..."]`,
  which runs `scripts/e2e.mts` of the commit `BINDING` (GN-14b) on the Node.js of the checkout (`tests/e2e/sample` and `tests/e2e/shapes` are repositories of the items that no polyspec repository generates alone yet,
  the second those of GN-6i, GN-6j and GN-7a for Python, Node and PHP with a member of the receiver `&mut self` that
  takes a `source` and a default (GN-6h); `tests/e2e/classes` is one of a class unit with every kind of member and
  no unit that WASM refuses (GN-18a); and `tests/e2e/consumer` is one that names the
  value alias of the sample and has an error unit with properties (GN-6k, GN-7a), run with `--dep tests/e2e/sample`;
  `tests/e2e/plot` is one that takes and gives the record `point` of `tests/e2e/points` (GN-6c, GN-15f), run with
  `--dep tests/e2e/points`, whose Go static library the run builds with its test features beside the one of the
  repository, because the Go program of the repository imports its Go module (GN-15f);
  `DEPS` names each repository whose types the contract names; its packages are built and installed first)
  copies the committed tree of a repository, makes the changes that take the binding of the run and prints each
  (GN-14d), runs `binding check`, tests the core without the generator, checks that the case files follow the case
  convention (GN-14d), generates for each target, lints the core and each binding crate on the host,
  builds each binding crate with the test features of its manifest (GN-5) and installs each package, and runs the generated tests and, where `tests/e2e/<library>` holds them, the
  contract cases on unittest, `node --test` and PHPUnit, and for the targets go and wasm on `go test` (after `gofmt -l`
  and `go vet`) and on `node --test --expose-gc` through the subpath `./wasm`. Every contract of `tests/e2e` names the five targets (BD-27), and a target that the
  generator refuses for one of them is a named failure of that target (GN-14c); the run checks the targets of the
  contract and no option adds one, because an added target would hide that the contract lacks it. The Git dependency on binding resolves to the commits of the checkout (`url.<base>.insteadOf` for the
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
  The run ends with what it did for each target, a lint apart from the tests: the lint of the crates on the host, `php
  -l`, `gofmt -l`, `go vet`, `llvm-nm` and `tsc` read the code and run nothing, so they verify no target; a run of PHPUnit
  counts as a test only when its JUnit log names a test, a run of `go test` runs with `-json` and counts the tests
  that passed, failed and were skipped from its events, and a target for which no test ran fails the run; a skipped Go
  test is named and fails the run, because it verifies nothing. On macOS the PHP extension links by the `build.rs` of its
  crate (GN-3d), so a run gives no link setting by hand.
- **GN-14b** A run checks one commit of binding: `BINDING`, `HEAD` by default. The check writes the tree of that commit
  into `<work>/binding` with `git archive`, installs the packages of the generator from the lock of that tree and runs
  the script of that tree, so the generator, `binding_core` (the lock of each copy pins that commit), the case runners of
  `tests/e2e` and the script are of one commit; a repository inside the checkout (`tests/e2e/<library>`) is read from
  that tree too. The run writes its record into `var/report/e2e/<library>.json` of the checkout, which Git ignores: the
  commit, whether the run is evidence or a diagnosis and why, the commits of the repositories and what ran for each
  target. The run is evidence of the commit only when the files that it reads from the checkout have no change against
  the commit, committed, uncommitted or untracked, and no variable that changes a build or a runner (`RUSTFLAGS`, the
  `CARGO_TARGET_*`, `CARGO_BUILD_*` and `CARGO_PROFILE_*` variables, `CGO_*`, `GOFLAGS`, `NODE_OPTIONS`, `PYTHONPATH`, `PHPRC`
  and the like) is given by hand; otherwise the record names the run a diagnosis (`diagnosis (not a commit)` for a
  change of those files) and states why. Why: a run of the working tree checks a generator that no commit holds,
  against a `binding_core` of another commit, so the result belongs to no commit that a push or a merge carries.
  The files that a run reads from the checkout are one closed list, `READ_FROM_CHECKOUT` of `scripts/e2e-inputs.mts`,
  each with its reason:

  | File | Why the run reads it |
  | --- | --- |
  | `Makefile` | `make e2e` runs its recipe, which sets the environment of mise and the `PATH` of `var/tools` |
  | `scripts/e2e.mts` | the script of the checkout writes the tree of the commit and starts the script of that tree |
  | `scripts/e2e-inputs.mts` | the script of the checkout reads this list |
  | `mise.toml` | mise runs the tools of `var/tools` that it declares, and the run reads it as the global configuration of mise |
  | `mise.lock` | it pins the digests of the tools of `mise.toml` that `var/tools` holds |
  | `.mise/locks/npm-npm/12.2.0/package.json`, `.mise/locks/npm-npm/12.2.0/aube-lock.yaml` | mise installs the npm of `mise.toml` from them, at the integrity that the second pins |
  | `rust-toolchain.toml` | its channel is the Rust toolchain of every command (`RUSTUP_TOOLCHAIN`), with the components and targets that `make install` installs |
  | `.php-version` | the run compares the minor of `var/tools/bin/php` with it |
  | `config/toolchain.json` | it pins the mise of `var/tools` and the release of PHPUnit |
  | `config/phpunit/composer.json`, `config/phpunit/composer.lock` | they declare and pin the PHPUnit of `var/tools/phpunit` |
  | `package.json`, `package-lock.json` | `devEngines` names the npm, and they declare and pin `@polyspec/kit`, which installs the tools of `var/tools` |
  | `.npmrc` | it sets the npm that installs the packages of the checkout |
  | `.gitignore` | the run finds an untracked file of this list with `git ls-files --exclude-standard`, which reads it |

  `NOT_READ` of the same file names the tracked files that a run does not read, with the reason (`.gitattributes`: `git
  archive` reads the attributes of the tree of the commit, and `git diff --name-only` names a file whatever its
  attributes). The test of the list in `packages/ts` fails a tracked file outside `packages/`, `tests/` and `docs/` that
  is not a document and is in neither list, and a listed file that is not tracked. The script of the checkout imports
  no source of the generator: the script of the tree of the commit loads them after the start. Why: a list that a
  new file can pass unseen does not say which runs are evidence, and a directory in the list would compare files that
  no run reads. The tools that `var/tools` holds are not a tracked file; the run finds each by the pin of this list
  (GN-14a), and a tool that differs from its pin while the pin does not change is not seen by this check.
- **GN-14c** Each target generates its files (`binding generate --target`, GN-1b), builds and runs its tests on its
  own, to its end: a step that fails is a cause of its target, the later steps of that target, which read what the
  failed step gives, do not run, and the other targets go on. The lint of the core and the steps of a repository that
  every target needs (the copy and its changes, the test of the core, `binding check`, the cases) fail every target.
  The WASM tests run in the npm package that the Node steps pack and install, so a failure of those steps is a cause
  of wasm too. Every runner is counted: the JUnit log of `node --test` and of PHPUnit, the events of `go test -json` and
  the summary of unittest; a run with no test, a failed test or a skipped test fails its target. The run ends with each
  target, its lint, its tests with their counts and the causes of its failure, one line each, and fails when a target
  failed; the cause of a failed `binding check`, `scaffold` or `generate` names each of its findings or refusals. Why: a run that stops at the first failure hides whether the other targets pass, and a refusal of one target
  then reads as a failure of all.
- **GN-14d** The copy of a repository gets only the changes that take the binding of the run, the changes that the
  repository makes itself when it takes that binding, and the run prints each: `binding scaffold` of the run writes the
  tracked binding packages, because their files are of the binding that writes them (CK-19 compares a repository's
  files with the binding that its lock pins, which is not the binding of the run); and the entry
  `polyspec-binding-core` of `Cargo.lock` names the commit of the run, or a lock of that entry alone is written,
  because the lock of a repository pins the binding that it took (GN-14). A defect of the repository is not repaired
  in the copy and is a named failure of every target: a root workspace that lacks the binding crate of a target as a
  member (GN-4; the run reads the members with `cargo metadata --no-deps`); a key of a case that is not in
  snake_case or a record value that is not the object of its fields (G-5), one line for each group with its keys and
  values; a core that does not depend on `binding_core`, does not implement `Kinds` (F-2, E-3) or names the crate of
  binding by an earlier name, which the compiler names, and the cause of a failed command carries the lines of its
  stderr that start with `error`; an error class of another name than `<Library><Category>Error`, which `binding
  check` names (CK-10). A raising case that lacks the arguments of its member in the form of their types, or the
  arguments of a factory of its class, is left out of the copy and printed, and a run that left a case out fails at its
  end: whether such a case is a defect of the repository or a form that the case convention lacks, such as the value
  of a class as an argument, is not settled, so the run neither drops it unseen nor refuses the other cases of its
  repository. The preparation of the tests changes no file of the repository: the case runners of
  `tests/e2e/<library>` are copied beside the generated tests (`cases_test.go` into `packages/go/tests`), the npm
  package of the platform is packed from the built addon and installed with the package of the library from their
  tarballs without the optional packages of other platforms (T-2), and the runners get the settings that the
  generated tests need: the test features of each crate (GN-5, GN-13b), `CGO_LDFLAGS` with the directory of the
  static library, `GOFLAGS` with the tags of those features and `GOTOOLCHAIN=local` for Go, `--expose-gc` for WASM
  (GN-18a), and `CASES` with the case file. The repositories of `tests/e2e` have the binding crates as members of
  their workspace, as every repository has, and track no binding package, which the scaffold of the run writes. Why: a
  change of the copy that the repository has not made would verify a repository that no commit holds, and a repaired
  defect then passes in the run and stays in the repository.

- **GN-14e** A run takes every contract of the repository (L-1): `packages/rust/interface.json` and each
  `packages/<component>/rust/interface.json`, in the order of their paths, and a repository without one fails. Each
  contract is scaffolded, checked, generated, built and tested in its own layout (`place`, L-2a), and the run records
  the paths of the contracts. The generated tests of a host Node package import the generated entry beside them, so
  the run puts them in the installed package where the copy has them.