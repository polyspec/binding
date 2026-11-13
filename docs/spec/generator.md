<!-- doc-id: generator -->
# Generator

[한국어](generator.ko.md)

`binding generate [--root <repository>] [--out <directory>]` checks `packages/rust/interface.json` (docs/spec/contract-check.md)
and writes the bindings of its targets. This document states the rules of the generator that the design leaves to it;
the design ids are those of the binding design.

## Scope

- **GN-1** The generator writes PHP (ext-php-rs 0.16.4), Python (PyO3 0.30.1, abi3-py314), Node (napi 3.16.2), Go
  (cgo over a C ABI static library, GN-15) and WASM (wasm-bindgen 0.2.130, GN-18) for public and internal units
  (GN-6r), and nothing for a host unit (GN-6ag):
  functions units, class units (constructor, static members, methods and properties with the receiver `&self` or `&mut self` (GN-6h), and
  the members of kind `iterate`, `stringify` and `to_json`, GN-6f, GN-6g),
  records (as parameters and in their result form, also of another repository), value aliases (also of another
  repository, GN-6k), enums, constants, error classes and error units (GN-7a), variant units (GN-6v), the callback
  interfaces of this contract that a class implements (GN-6w),
  and for Python, Node, PHP and WASM the type `source` of a parameter (GN-6j) and the defaults of parameters and record
  fields (GN-6i), and for Python, Node and PHP a method with the receiver `self` (GN-6o), a class unit with
  `cleanup` (GN-6p) and a member with `blocking_io` that reaches language code (GN-6q).
  callback interfaces (U-3, synchronous members with the receiver in `core.receiver`), Any other item (an async
  callback, a function type in Go (GN-6z), a value unit, a wait other than `none`, `blocking_io` (GN-6m) and `async_driver` (GN-6n), a default
  that GN-6i does not list, an abstract class, `native`, a naming exception, a kind of another library without its outer variant (GN-7c), the
  type `source` outside a parameter, an internal member of a public unit) is refused by name
  before anything of that target is written (G-4, P-4, GN-1c). Go generates a class unit, a callback unit, a value alias, also of another repository, the type `source`, a default, an error unit and a record of another repository as GN-15a to GN-15f state, and Go
  refuses modules whose packages would import each other (GN-15a); WASM generates a class unit as GN-18a states, and a value alias, also of another repository, and a callback unit as GN-18b and GN-18c state.
  Go generates a variant unit and a class that implements an interface as GN-6v and GN-6w state.
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
  needs beside the crate, and a file of the crate that does not depend on the contract (the `build.rs` of Python, of Node and of
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
    fields of a release of GN-3c: `"type":
    "module"`, `napi.binaryName` and `napi.targets`, because the host package is the package that a release builds
    and publishes; host code imports `native/generated/index.mjs`
    (or `index.cjs`) by its relative path, and so do the generated tests, from `native/generated/tests/`. The WASM
    crate is `native/wasm/`, its module, glue and declarations are `native/wasm/generated/`, which the host's `files`
    names (`native/wasm/generated/*.mjs`, `*.js`, `*.d.ts` and `*.wasm`), and its tests import
    `native/wasm/generated/index.mjs` by its relative path.
  - PHP: an extension is a Composer package of its own (type `php-ext`), named `<host package>-native`, at
    `packages/<component>/php/native/`: `scaffold` writes its crate and its `composer.json` there, and `generated/`
    is beside them. The host library `packages/<component>/php/composer.json` requires `ext-<extension name>` (`*`);
    the extension registers the classes and functions when PHP loads it. A host layout has no `php-ext/` directory.
    The `composer.json` of the extension is written by `scaffold`, so `check` compares it whole, its
    `php-ext.download-url-method` of GN-3c included.
- **GN-3c** The Node addon is in one npm package per platform of T-2 (plan), named `<npm package>-<platform>` with the
  napi-rs platform names `linux-x64-gnu`, `linux-arm64-gnu` and `darwin-arm64`; it holds `<npm name without scope>.
  <platform>.node` as its `main`, with `os`, `cpu` and `libc`. The npm package of the library, or its host package
  (L-2a), holds no addon; release tooling builds and publishes the platform packages (K-3), and when it packs the
  package it writes every platform package into `optionalDependencies` of the packed manifest at the version of the
  release, so npm installs the one of the machine. The source manifest and the lock of a workspace do not name them:
  the platform packages of a version are made by the release of that version, so a lock that named them could not be
  installed before that release, and `npm ci` refuses a manifest whose dependencies its lock lacks. The generated
  entry loads `<npm package>-<platform>` and, when it is not installed, the file `<name>.<platform>.node` beside the
  entry, which a build in a checkout puts there. The end-to-end check packs the platform package of its machine as a
  release does and installs both tarballs, so the entry finds the platform package without `optionalDependencies`. The `package.json` that `scaffold` writes for a library with the target
  `node` names the configuration that the napi CLI of a release reads: `napi.binaryName`, the npm name without scope,
  which is the `<name>` of the addon file that the entry loads, and `napi.targets`, the Rust triples of the platforms
  in the order above (`x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `aarch64-apple-darwin`). Without them
  the release refuses the package (kit K1189). Every manifest of an npm package that `scaffold` writes has `"type":
  "module"`: the only `.js` files of the package are the glue of `wasm-bindgen --target web`, which is an ES module,
  and the Node entries are `.cjs` and `.mjs`, whose extension decides their form. Without the field Node reads a
  `.js` file that is an ES module with the warning `MODULE_TYPELESS_PACKAGE_JSON`. The `composer.json` of a PHP
  extension (type `php-ext`, also `<host package>-native` of GN-3b) names `php-ext.extension-name` and
  `php-ext.download-url-method` `["pre-packaged-binary"]`, so that PIE installs the binary of the release for the PHP
  and the platform of the machine (kit K1189). `binding check` compares these fields as it compares the whole file
  (CK-19).
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
  code holds only the helper functions it uses, because the lints deny dead code. A helper of the Go C ABI that only
  the entry points of a test feature (`panic-test`, `fault-test`, `codec-test`) use is compiled under those features
  alone (`#[cfg(any(feature = ...))]`), because the static library without them has no such entry point and would
  hold the helper unused.
  A helper is used where the code calls it or passes it by its name; a method of the same name
  (`map.insert(...)`) is no use of the helper `insert`, because a helper that only a method names is dead code that
  may name types the crate does not declare.
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
  | `panic-test` | B-7; the poison of B-5c (GN-6h); the errno of a symbol in a PHP test (GN-8a) | `_panic_test`, `_panic_test_held` | `__panicTest`, `__panicTestHeld` | `<namespace>\Internal\panicTest`, `panicTestHeld`, `errnoOf` | `<prefix>__panic_test`, `<prefix>__panic_test_held` |
  | `codec-test` | the round trip of Go's conversions (GN-13b); the `in` function of a value alias alone (U-7), and its `in` function and then its `out` function (GN-13e); a Go value of another type at a number parameter (GN-13g) | `_alias_in_<alias>`, `_alias_round_<alias>` | `__aliasIn<Alias>`, `__aliasRound<Alias>` | `<namespace>\Internal\aliasIn<Alias>`, `<namespace>\Internal\aliasRound<Alias>` | `<prefix>__echo_<type>`, `<prefix>__alias_in_<alias>`, `<prefix>__number_in`; WASM `__aliasIn<Alias>`, `__aliasRound<Alias>` |
  | `fault-test` | fault injection (GN-8a) | `_arm_faults`, `_fault_left` | `__armFaults`, `__faultLeft` | `<namespace>\Internal\armFaults`, `faultLeft` | `<prefix>__arm_faults`, `<prefix>__fault_left`; WASM `__armFaults`, `__faultLeft` |
  | `case-test` | a case whose argument has no form in the language (GN-13) | none yet | none yet | `<namespace>\Internal\caseTest<n>` | none yet; WASM none yet |
  | `thread-test` | the kind `wrong_thread` of a function called on another thread (GN-6z) | — | `__threadTest` | `<namespace>\Internal\threadTest` | — |
  | `native-count-test` | the count of the language objects that the owner table holds (GN-6u) | — | `__nativeCount` | `<namespace>\Internal\nativeCount` | `<prefix>__native_count`; WASM `__nativeCount` |

  For a contract with a class that has a write place (GN-6h), `panic-test` also adds the poison entry point of the
  B-5c test, which takes an instance, takes its write guard and panics. These entry points panic on purpose, so each
  carries `#[allow(clippy::panic)]` with a reason that names B-7; a repository that denies `clippy::panic` keeps the
  deny for every other item, and no other generated item panics.
  An import, a helper and a type that only the entry points of a test feature use is generated under that feature
  (`#[cfg(feature = "<feature>")]` on the `use` line or on the item), because a build without the feature does not
  compile those entry points, so the item would be unused there and the lints deny an unused import and dead code
  (GN-4).
  It takes the instances of the classes that the
  target makes, by a constructor or a static member that returns the class, because the test of a class that the target
  cannot make has no instance to give it, and the Go entry point would read the instance table of such a class only
  under `panic-test`, which leaves its reader unused without the feature.
  A Python, Node, PHP or WASM crate has `codec-test` when an alias of the contract has `in_raises`, the Go crate always
  (for its round-trip entry points); a Node or PHP crate has `thread-test` when a member takes a function type, because
  those targets hold a function on its owner thread, and its entry point calls the function on another thread and
  gives the kind of the failure; and every crate has
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
  The crate of the Go C ABI converts in the same way, after it reads each parameter from the encoded arguments. The
  compile test of GN-6ad covers these forms: a tuple parameter as `[usize; 2]`, `u32` and `u8` parameters, a tuple
  result of `[u32; 2]`, a record parameter whose struct literal takes `[usize; 2]` and `u32` fields, and `usize` and
  `isize` results.
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
  the parameter of the core fixes, without a deref coercion at the call. A unit test compiles the bodies of the WASM
  entry points that the generator writes for `tests/e2e/shapes`, with the helpers of GN-6ac and the core functions of
  that fixture, for the host and for wasm32, so the compiler checks the generated calls and the inference.
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
  each case that implements the interface `<Variant>`; Go an interface `<Variant>` of the package of its module, whose
  one method is the unexported `is<Variant>()`, and a struct `<Variant><Case>` of the fields of each case, of the Go
  types of their contract types, which implements it with a value receiver, so a field that holds the variant is the
  interface. The C ABI of Go reads and writes a variant as the number of its case in the contract followed by its
  fields in order, and Go encodes a value that is no case struct, nil or a pointer to a case struct, as the number
  2^64 - 1. A value that is no case (an object without the tag, a tag that names no case, an instance of another
  class, a Go value that is no case struct) is kind `invalid_argument_type`. In a case file a variant value is an
  object whose tag key holds the case value and whose other keys are the fields by their snake_case names (G-5).
  An `optional` field whose default is `{literal: null}` (T-4) may be left out, and a field left out is null, which the
  core gets as `None`: Python gives the dataclass field the default `None`, Node and WASM read a missing or `undefined`
  member as null and declare the member optional, PHP takes null at its place in the constructor (GN-6i), Go leaves
  the pointer of the field nil, and a case value may leave out its key. Such a field always leaves with its value or null.
  Refused by name: a variant without `core_type`, two cases with one Rust name, a field with the name of the tag, and,
  not generated yet, any other field default of a case and a field that holds a class, a callback, a value alias or a
  unit of another repository.
  Why: the language value of a case says which case it is, so the binding converts it without a guess, and a match
  without a wildcard makes a case that one side lacks a compile error instead of a value lost at run time.
- **GN-6b** A class unit (T-5) is a final language class that holds the core value: Python a frozen `pyclass` of the
  native module, Node a napi class exported by its JavaScript name, PHP a `php_class` with the flag final. A method or
  property calls the core path with the held value as its receiver; a static member or the constructor that returns
  the class wraps the value. A result of the class is a new instance whether the core gives it owned or borrowed (an
  accessor gives `&T`, and an item of an optional or a list a reference to either): the conversion `out_<class>` takes
  `impl CoreForm<T>`, which keeps an owned value and clones a borrowed one, so the instance never borrows the core. `constructible: false` leaves no constructor (PHP declares it private). A property is a
  getter in Python and Node and a method in PHP (I-3). napi-rs defines a class's methods as not configurable, so a
  Node method or static member that takes arguments is the addon's `__<name>`, not enumerable and absent from the
  declarations, and the entry defines `<name>` over it with the checks of G-7. The entry writes that function as a
  method with the computed key `<name>`, not as a function expression named `<name>`: a member may take a name that
  JavaScript reserves (`null`, `delete`), which names no function, and the method keeps `<name>` as its `name`. napi-rs keeps the classes it parsed in
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
  `self`, or a parameter whose `core` is `&mut`; every other place is a read place. A
  class unit holds its core value in a lock that is only tried when (1) a member of it has a write place, (2) a value
  of the class comes in from the language (a parameter, a field of a record or an element of a list in one, or the
  return of a callback), or (3) a member of it reaches language code. A type carries language code when it is a
  callback unit, also of another repository (GN-6s), a function type, `host_value`, a value alias with an `out` row of kind `native`, or a class that
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
  gets `&*guard` for a read place and `&mut *guard` for a write place, which the generated code binds under the name of
  the place once every lock is taken, so a core path of a trait (`std::string::ToString::to_string`), which takes `&T`
  of any `T` and therefore does not deref a borrow of the guard, gets the value as well. Where the core call runs in a future or a
  closure that the call moves to another thread (Node: `driving` of GN-6n and the pool of GN-6m; WASM: the future of GN-6n), the guards move into
  it and the borrows are bound inside it, because a borrow of a local of the call lives no longer than the call. A parameter of a class gives
  the core `CoreForm::core_form` of that borrow (GN-6b): the type of the core parameter selects the borrow where the
  core takes `&T` and a copy where it takes `T` (`OrderedMap::insert(&mut self, key: Value, value: Value)`); so
  a parameter of a value class, whose form the contract does not name (CK-67), gets the form that its core takes. A
  parameter whose type is a generated class or an
  `optional` of one names in `core` the borrow that the core takes (`&`, `&mut` or `value`), and a parameter without it is
  refused by name (G-4): a default would claim a borrow that nobody wrote, and the call alone does not find a wrong
  one. A parameter whose `core` is `value` gets a clone of the value under its read guard, `(*<place>).clone()`, so
  that class is `Clone`. Every binding crate holds, for each
  member with a parameter that names its borrow, the assertion `const _: () = { let _: fn(<receiver>, <param>, ...) ->
  _ = <core path>; };`, in which the receiver is `&T`, `&mut T` or `T` of the core type of its class, a parameter that
  names its borrow is `&T`, `&mut T` or `T` of the core type of its class and every other parameter is `_`, so a
  borrow that differs from the core does not compile (I-2). Why: binding reads no Rust source, so the contract names
  the borrow, and the call alone does not find a contract `&mut` over a core that takes `&`, because `&mut` coerces to
  `&`. A `core` of a parameter whose type is an `optional` of a class is refused by name (G-4). A value of the class
  inside another type (an
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
  as a `Raised` whose `Native` names it in the binding's table, and the generated caller throws the same object again.
  The last drop of a `Raised` that no caller threw again removes its entry, as GN-6u states.
  The interface is declared as a Python `typing.Protocol` in `<root>._types`, a Node interface and a PHP interface
  that the extension registers. The binding crates depend on `polyspec-binding-core` with the feature `construct`.
- **GN-6z** A function type (T-2) is taken by the core as
  `Box<dyn Fn(<parameter>…) -> Result<R, binding_core::Failure<E>> + Send + Sync>`, by value: each parameter is
  borrowed as an argument of a callback member is (T-1, GN-6d), `R` is the Rust type of the return (`()` for `none`)
  and `E` is the core error. The core may keep the function after the call (template `engine.register`), so the form
  is `'static`, `Send` and `Sync`. When the value enters it must be callable (kind `invalid_argument_type`). A call
  converts the arguments out and the result in, and an exception of the language code, or a failure of the binding in
  the call, goes to the core as a `Raised`, as GN-6d states. Python holds the callable in the function and declares
  the parameter as `collections.abc.Callable`. Node, PHP and WASM hold a language value that belongs to one thread and
  one environment, so the function holds it as a `Native` (GN-6u) and declares the parameter as a function type
  (TypeScript `(…) => R`, PHP `\Closure`): a call on a thread other than the owner of the `Native` is kind
  `wrong_thread`, and a call after the cleanup of the owner (the env of Node, the request of PHP) is kind `internal`;
  either goes to the core as a `Raised` whose `Native` holds its `BindingError`, which any thread may hold, because the
  error object of the language is made on the owner thread only, where the failure is converted. Go refuses it (G-4).
- **GN-6aa** A callback inside another type (a field of a record, an item of a list, an `optional`) is taken as
  `Box<dyn <core trait> + 'a>`, where `'a` lasts for the call; `Send` and `Sync` are what the trait requires. A list,
  an `optional` or a record that holds a callback is passed to the core by value, an exception to T-1, because the
  binding makes the value for each call, so it has nothing to keep, and a borrowed list would not let the core call a
  member with the receiver `&mut self`. The core type of a record with a callback field has one lifetime parameter
  (`polyspec_x::Options<'a>`); the contract names it by its path in `core_type`, and the generator writes the lifetime
  where it names the type: `'env` in Node, whose callback lives in the environment of the call, and `'static` in the
  other targets. Such a record is generated where the binding makes it from the arguments of the call, as a record
  parameter (T-4), and refused by name at another place. A callback that the core keeps after the call is `Box<dyn <core trait> + Send + Sync>` (`'static`), which
  Node, PHP and WASM give on the native lifetime as GN-6z states.
- **GN-6w** A class unit that `implements` a callback interface of this contract (U-1, U-3) has, for each member of
  the interface that it does not declare under the same name, a method that calls the trait method on the held
  value, `<core_type as <trait>>::<method>`, and raises the `Failure<E>` that it returns (GN-6d). The declarations
  name the interface: Node and WASM `class <Class> implements <Interface>`, and PHP the interface that the extension
  registers, in the stub and in the entry of the class; Python has the method that the `Protocol` names; Go has the
  method of the Go interface of the callback on the pointer to the class, so the pointer satisfies that interface,
  which `var _ <Interface> = (*<Class>)(nil)` asserts, and the call of the callback runs the method through the
  dispatch of U-3, which calls the trait method through the C ABI. An instance
  of the class therefore enters where the callback is taken as any language object with those members does, and the
  call of the callback reaches the held value through the method. In a case an instance value (GN-13f) may stand at
  a place of the callback. Refused by name, not generated yet: an interface of another repository, a member that the
  class implements with a receiver other than `&self`, and an abstract class (U-1).
  Why: a class whose core type implements the trait is a callback already, so a caller passes its instance where the
  callback is taken instead of an object of its own that forwards each call.
  A member whose `errors.recognize` names error units (U-3) reads an exception of its language code that is an
  instance of one of them (Python `isinstance`, PHP `instanceof`, the prototype chain in Node and WASM, `errors.As` in
  Go): its `kind` and its message. When the kind is that of a row of `errors.kinds` whose `class` is that unit or a
  unit that extends it, the core gets `Failure::Kind(<recognized>(<kind value>, &message))`: `errors.recognized`
  names the core function `fn(<kind value>, &str) -> E`, and the kind value is the variant path of the row as an
  expression, `<path>` or `<outer>(<inner>)` for a nested path (GN-7b), which is a value of the code enum when
  `errors.code` names one. Any other exception, and an instance whose kind is no kind of those rows, goes to the core
  as a `Raised`, and the caller throws the same object. Node takes the pending exception to read it and throws it
  again when it is not recognized; Go passes the kind and the message of a recognized error to the C ABI in place of
  the index of the error. Why: the core decides what a recognized failure means (U-3), and binding reads no Rust
  source, so the contract names the function that makes the core error; the properties of the instance do not reach
  the core, because an instance that language code makes has none (GN-7a). A recognized error unit of another
  library is refused by name (G-4).
- **GN-6e** A value alias with `core: {in, out}` (U-7) enters as the `HostValue` that the binding describes one level
  at a time (B-1) and the core's `in` function judges through `HostValues`; its failure is the core's kind or the
  exception that language code raised while the core walked the value (a getter, an iterator), thrown again unchanged.
  What a language value is as a `HostValue` is binding's rule: Python takes the exact built-in types (a subclass of
  `int`, `float`, `str` or `bytes` is `Other`), a `str` as its UTF-8 bytes and a `str` that holds a surrogate as its
  code points; WASM takes a string that `isWellFormed` as its UTF-8 bytes and any other string as its UTF-16 units, so
  that a common text crosses the boundary once, as one text (B2.89); Node takes a number as `UntypedNumber`, a bigint as `Int` (its decimal
  token outside `i64`), a string as its UTF-16 units, an Array, a Map, a plain object (prototype `Object.prototype` or
  `null`, own enumerable string keys), a Date, a function, and a typed array or a symbol as `Other`; PHP takes an
  element that is a reference as `PhpReference` with its identity, an array with `array_is_list`, a stdClass and a
  Closure. A core value leaves as the `OutValue` of the core's `out` function, made by the alias's `out` rows of
  built-in forms or by a member: a constructor or static member of a generated class of the contract whose one
  parameter is the content of the kind (bool, int, int64, float, text or bytes) and which cannot fail is called on that
  content by its core path, and its value leaves as an instance of the class; any other member, and a member in an
  alias of another repository, is refused by name (G-4); the form `{"keyed_map": {"key": [...]}}` is made as a
  map, each key of the kinds it lists made by the rows as its items are (T-2); in Python and Node the same handle is the same object,
  and in PHP, whose arrays are values, a handle inside its own making is kind `internal`. A language object
  that a core may keep, an `Object` or a `Callable`, enters as a `Native` (B-1), which the core copies, keeps and
  drops as any value, and the `native` row gives back the same object; the handle of a container, a `Date` or an
  `Other` value is valid only inside the `in` or `out` call that gave it: the binding numbers a `Date` and an `Other`
  value in the order of the call, which no later call reads. What a `Native` holds, and what its last drop does, is the rule of the target (GN-6u).
- **GN-6u** What a `Native` (B-1) holds, and what its last drop does, by target:
  - Python holds the `Py<PyAny>`, released at the drop; PyO3 defers a drop without the GIL to its next acquisition,
    so the crate does not compile with `pyo3_disable_reference_pool`. The `build.rs` of the crate declares that cfg
    (`cargo::rustc-check-cfg`), because rustc refuses a cfg that no crate declares and the manifest of the crate takes
    its lints from the workspace.
  - WASM holds the key of the table of its one thread, which holds the `JsValue`; the drop removes it.
  - Node and PHP hold the owner, its generation and the key of the owner table, which holds the language reference on
    the thread that owns it, because a reference of that thread cannot be released on another one. A drop on the
    owner thread releases at once; a drop on another thread puts the key in the release queue of the owner, which every
    generated entry point of that owner empties at the start of its synchronous part. In Node a drop on another
    thread also calls the threadsafe function of the owner, which empties the queue on the owner thread when no entry
    point runs for a while, so the release does not wait for the next entry point. The owner makes that function when
    it makes its table, without a JavaScript function, and unrefs it, so that it does not keep the event loop alive.
    The Node env cleanup hook and the PHP request shutdown release what the table holds and raise its generation, and
    the Node hook releases the threadsafe function with abort under the lock of the owners. A drop compares the
    generation under that lock; a drop of an older generation discards its key and touches nothing of the language,
    whose environment is gone, neither a reference nor the threadsafe function, and the `out` of such a `Native` is
    kind `internal`.
  - Go holds the `cgo.Handle` of the func, which the drop deletes on any thread.
  - The `Native` of a `Raised` (GN-6d) holds the key of the table of thrown objects; its last drop removes the entry,
    so an exception that the core drops instead of returning is not kept. Python, Go and WASM remove it at the drop.
    Node and PHP keep the table on the thread that threw, with the number of that thread: a drop on that thread
    removes the entry at once, and a drop on another thread queues the key for that thread while it lives, which
    removes the queued keys when it next keeps or throws again an exception and discards its queue when it ends. The
    `Native` of a failure of the binding on another thread (GN-6z) holds the `BindingError` itself, which the drop
    discards.
  - The round trip and the release are tested where a value alias has a `native` row in the target and a function
    takes that alias as its one parameter and returns it: after one warm-up call, the test counts what the binding
    holds, gives that function a new instance of a class of the test, checks that the result is the same object,
    drops it, makes one more call, which empties the release queue (Node first lets the event loop turn once), and
    counts again, which must give the first count. The count is the number of live references of the subject
    (`sys.getrefcount`) in Python, with a weak reference that is dead after the subject is deleted, and the entry point
    of `native-count-test` in the other targets: the entries of the owner table in Node, PHP and WASM, the live
    `cgo.Handle` of the Natives in Go, where a func is not comparable, so the test checks the count only. The bytes of an `out` outlive the
    `Native`, so its `native` row gives a new `cgo.Handle` of the func. Every buffer that Rust gives Go (a result, a
    failure, the arguments of a callback) starts with the list of the handles that it gives, and the node of a func
    is the index of its handle in that list. Go reads the list before it decodes anything else: it takes the func of
    each handle and deletes the handle at once, so no handle outlives its buffer, whatever the decoding then finds
    (a value without a Go form, a malformed node) and whether the caller decodes the buffer at all.
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
- **GN-6x** A value class of another repository (T-3, U-1) is taken and given as a value alias of another repository
  (GN-6k), through the two functions that the owner names in the class as `core: {in, out}`, with the core type that
  it names in `core_type` (CK-8); a value class of another repository without them is refused by name (G-4), because a
  description of its instance that the generated code turned into the core value itself would be a second
  implementation of the owner's rules (P-1). In: the parameter takes an instance of the owner's language class,
  imported from the owner's package (T-3); any other value is kind `invalid_argument_type`. The generated code calls
  the `by` member of the `in` row of its language through the language API of the owner, and describes the instance as
  `HostValue::Value` with the kind of the case whose `is` is the result, without opening it. `HostValues::read` of its
  handle calls the `read` member of that case and describes the result one level at a time: a list as a list, each
  item again by these rules; an instance of a generated class of the owner whose `iterate` member yields `{key,
  value}` as a map of the entries of that iteration, a snapshot taken when the map is described (GN-6f); an instance
  of the value class again as `HostValue::Value`; a text or a bool as the `HostValue` of that kind; and for a case of
  the kind `text16`, whose `read` member gives a list of `uint`, the UTF-16 code units of a text as
  `HostValue::Text(HostText::Utf16)`, unpaired surrogates included, in every language. A case of the kind `text`
  with `units` calls its `read` member once: a text is described as the text of the language (UTF-8 bytes in PHP, Go,
  Node and WASM, the code points in Python), and none calls `units` and describes its code units as
  `HostText::Utf16`, so the code units of a text cross the boundary only when it holds an unpaired surrogate (B2.89).
  The owner's
  `in` function judges the description; its failure and an exception of language code are reported as GN-6k states.
  Out: the owner's `out` function gives the core value as `OutValue`, and the generated code makes the language value
  by the `out` rows of the class for its language, each `make` a public `constructor` or `static` member of the owner
  called through the language API of the owner's package: a member whose one parameter is the content of the kind is
  called on that content (a bool, a text, for the kind `number` the literal of `OutValue::Number`, and for the kind
  `text16` the code units of `OutValue::Text16` as a list of integers of the language, so that a text with an unpaired
  surrogate leaves as the owner holds it, also where the string of the language cannot hold it); a member of
  the kind `list` whose one parameter is a list of the value type is called on the items, each made by these rows; and
  a member of the kind `map` whose one parameter is a generated class of the owner is called on an instance of that
  class made by its public constructor without parameters, to which the generated code gives each entry in order
  through its public method that takes a key and a value of the value type, the key made by the row of its kind
  (`text` or `text16`). Any other `make` is refused by name (G-4). Python, Node and PHP take and give it so; WASM takes and gives it
  as Node does, through the JavaScript class of the owner's WASM package (GN-18b); Go takes it as the Go type of the
  owner's class, whose `by` and `read` members the answers of the host questions of GN-15c call, and gives it by the
  exported functions of the owner's Go package that the `out` rows name, as GN-15c states.
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
  implements `\JsonSerializable`, and `MarshalJSON` in Go (GN-15a); Python has no JSON hook, so the member is absent there. A primitive, which returns a
  number, is `valueOf` in Node and WASM; Python, PHP and Go have no such hook, so the member is absent there. The PHP extension names no
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
  with the rule id of a `{computed}` default in the comment. A default of an `optional` type is `{literal: null}`
  or `{computed}`: its core parameter or field is the `Option<T>` of the optional type itself, with no second
  `Option`, and the binding passes `None` for a value that was left out as for a null, because both mean that no
  value was given. A `{literal}` default of an enum names in `default_core` a constant of the core enum, and the
  crate asserts at compile time with `matches!` that the constant is the variant of the declared value. A
  `{literal: null}` default of a value type passes `None` and names no constant, so the crate asserts nothing: the
  core decides what no value means. What "left out" is in each language: Python, an argument
  that the call does not give, so an explicit `None` is a value and is judged as one; Node, a missing trailing
  argument, a missing member of the options record, or `undefined`, so `null` is a value and is judged as one; PHP,
  an argument that the call does not give, or `null`, because the engine gives `null` for a parameter that a call
  with named arguments skips and the extension cannot tell the two apart. A record parameter with the default
  `{empty: "object"}` may be left out as a whole when every field of the record has a default: the core takes the
  record, whose every field is then `None`. Python and PHP take the fields as keywords and named arguments, which are
  then all left out; Node and WASM take the options record as a trailing argument that may be missing or `undefined`,
  and the declarations make it optional. Refused by name (G-4): a record parameter with `{empty: "object"}` that has a
  field without a default, any other default of a record parameter, a default of an `optional` type other than
  `{literal: null}` and `{computed}`, a default of a type that is no number, bool, text, latin1, bytes, source, list,
  map, enum, value type or `optional`, a `{literal}` or `{const}` default without `default_core` other than
  `{literal: null}` of an `optional` or a value type,
  a required parameter after a parameter with a default, a `rest` parameter, and a field default of a record that
  also has the result form, other than a default of an `optional` type: the result form of such a field is the value of
  its optional type, so a `None` of the core is the null of the language.
- **GN-6j** A parameter of type `source` (T-1), also inside `optional`, takes a text or bytes and reaches the core as
  `&[u8]`, which the core judges: Python takes a `str` as its UTF-8, or a value that PyO3 reads as bytes; Node takes a
  string as its UTF-8, or a `Uint8Array`; PHP takes a string, whose bytes are passed as they are, because a PHP string
  is its bytes. A text with an unpaired surrogate is kind `invalid_text` (B-3), and any other value is kind
  `invalid_argument_type`. A `source` in any other place (a result, a field, an element) is refused by name (G-4).
  In Node the type `bytes` is a `Uint8Array` both ways (T-7): a parameter takes a `Uint8Array` and refuses any other
  value, a string too, as kind `invalid_argument_type`, and a result is a new `Uint8Array` of a copy.
- **GN-6y** The type `path` (T-1, B-3) is the bytes of an OS path, in every place: a parameter, a result, a field
  and an element, also inside `optional`. The core takes a parameter as `&std::path::Path`, an `optional<path>` as
  `Option<&Path>`, and gives a result or a field as `std::path::PathBuf`. In each language the input is: Python a
  `str`, `bytes` or `os.PathLike`, as the bytes of `os.fsencode`; Node a string as its UTF-8, or a `Uint8Array`; PHP a
  string, whose bytes are passed as they are; Go a `string`, whose bytes are passed as they are. The output is: Python
  the `str` of `os.fsdecode`; Node a string when the bytes are UTF-8, and a `Uint8Array` when they are not, so that no
  byte is replaced; PHP a string of the bytes; Go a `string` of the bytes. The kinds are the same in every language: a
  value of another type, and a Python value that `os.fsencode` refuses with `TypeError`, is kind
  `invalid_argument_type`; a Node string with an unpaired surrogate is kind `invalid_text` (B-3); a path with a NUL
  byte, a Python `str` that `os.fsencode` cannot encode, and, where the OS path is no bytes (Windows), bytes that are
  not UTF-8, are kind `invalid_path`. `binding_core::path_from_bytes` and `binding_core::path_bytes` convert the bytes,
  so every target judges them by one function. WASM has no OS path: the contract gives a member with `path` an `only`
  without `wasm` (Q-4, CK-15), and a `path` that reaches the WASM target is refused by name. A case value of type
  `path` (G-5) is a relative path with `/` between its parts, which the generated test resolves inside a new temporary
  directory of each test and removes with it: Python `tempfile.TemporaryDirectory` of the test, Node `mkdtempSync`
  with `afterEach`, PHP a directory under `sys_get_temp_dir()` with `tearDown`, Go `t.TempDir()`. An input and the
  expected result of one test resolve in the same directory, so a result that names the path is compared as the path
  in that directory. An empty path, an absolute path and a path with a part `..` are refused by name (G-4), because
  they would leave the directory of the test: the test of the case fails with that reason in every target (GN-13e).
- **GN-7** Whether the core path of a member returns a `Result` is its `core.result` (E-1c); without it, the path
  does when `raises` names a variant of the contract's own core error or the member takes a callback. The error of
  such a path is `binding_core::Failure<E>`, a kind or what language code raised, when `core.failure` is true, and
  without it when a parameter holds a callback or a function; `core.failure: true` names a member that calls language
  code that its receiver keeps (template `engine.render`), whose error the generated code converts as that of a member
  that takes a callback (GN-6d, GN-6z). The generated
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
  property is bool, int, int64, uint, float, text or bytes, an optional of one, or `list<text>`, whose function returns
  any iterable of text items, as the output of a list does (T-2). A property with `raises` names a function that
  returns `Result<T, E>` of the core error `E`. The generated code reads every property when it makes the error, so an
  `Err` of that function is raised, as the error of its own kind, in place of the error that the core returned, as a
  property value that fails its conversion is. Each variant of the `raises` of a property is a kind of `errors.kinds`
  whose class is no error unit with a property that raises, so that making one error makes at most one other; another
  variant is refused by name. The Node addon keeps the class
  after the six classes of the categories, and the PHP extension reads and writes `kind`, `status` and `errno` in the
  scope of the category class that the class extends. The generated test of a raising case (B-4) names the class of
  the unit as the exact class; it finds the row by the kind of the case, which is the snake_case of the last segment
  of the variant (CK-22). A member of another kind, a property of another type, a property named `kind`, `status`,
  `errno` or `message`, a `class` that names no error unit of the category of its row are refused by name (G-4); a row
  with `library` (E-1b (a)) is generated as GN-7c states. An error unit of a module other than the root is a class of the
  namespace of its module in PHP (GN-10), a class of `<root>._errors` that `<root>.<module>` imports in Python (GN-11),
  and an export of the entry by its name in Node and WASM, as every other name of a module is. Go generates an error
  unit as GN-15d states, in package `errors` whatever its module. WASM generates an
  error unit as Node does: a class of the ES module that extends its parent, handed to the module after the classes of
  the categories, whose properties the module defines on the instance as read-only own properties (GN-18).
- **GN-7b** Every binding crate holds, for each variant that a member names in `raises`, the assertion
  `const _: fn(&<error>) -> bool = |error| matches!(<scrutinee>, <pattern>);` against the core error that the
  member's core path returns (the `E` of `Failure<E>`), so a path that is no variant of that type does not compile
  (E-5, I-2). Every member of a contract returns the one core error of E-1, so a variant that several members raise is
  asserted once. The scrutinee is `error`, or `<projection>(error)` when `errors.code` names one. The pattern of a
  path is `<path> { .. }`; the nested path `<outer>/<inner>` names the variant of a dependency that the core passes on
  (E-1b (a)), which GN-7c states with its pattern `<outer>(<inner> { .. })`; its kind is the snake_case of the last
  segment of `<inner>`. The `core_error` match of every target, its second match for the properties of an error unit
  (GN-7a) and the assertions of `in_raises` (U-7) use the same scrutinee and the same pattern. `errors.code` is
  `{error, path}` for a core error that is a struct holding a code enum whose variants `errors.kinds` names: `error` is
  the type that the core paths return, and `path` is the projection `fn(&E) -> &Code` (or `-> Code`) that the
  generated code calls with the error. The error enum of a kind is then the enum of its code, of the outer path when it
  is nested, and one is generated. Why: binding reads no Rust source, so the contract names the type of the error and
  the function that gives its code.
- **GN-7c** A kind of a dependency that the core passes on as it is (E-1b (a)): the row of `errors.kinds` names the
  library and the path `<outer>/<inner>`, where `<outer>` is the variant of the core error of this repository that
  holds the error of the library and `<inner>` the variant of that error as the row of the library's contract names
  it; a member names the same path in `raises`. Every match of the core error (the class, the properties) and the
  assertion of GN-7b take the pattern `<outer>(<inner> { .. })`, on the scrutinee of GN-7b, so a path whose outer variant does not hold that
  inner variant does not compile (I-2). The category is that of the row of `<inner>` in the library's contract, the
  class is the class of that category in this repository's table of E-2, or the error unit that the row names in
  `class`, and the kind, status and errno are those that the core error gives (`Kinds`), as for its own rows. The
  generated test of a raising case of such a kind is the test of GN-13 with that class. A row with `library` whose
  variant has no `<outer>/`, and a row without `library` whose variant has one, are refused by name (G-4, CK-10). Why:
  the core error holds the error of the library inside one of its own variants, so only the path down to the inner
  variant gives a pattern that the compiler checks against the core error (E-1b (a)).
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
  gives the names of the points whose fault did not fire. The PHP extension of every contract has, with the feature
  `panic-test` that every test build turns on (GN-5), `Internal\errnoOf(symbol)`, the value of an errno symbol on the
  machine that the extension runs on, read from the table that arms the faults (`binding_core::errno::value`, which
  needs no feature), and kind `internal` for a symbol that the machine does not have: PHP has no table of the errno
  symbols of its machine, so its test reads the value from the binding, as Python and Node read it from their
  language, also in a contract without fault injection points. The end-to-end check builds the PHP extension without
  features and fails if `llvm-nm` finds a test entry point in it (`panic_test`, `arm_faults`, `fault_left`,
  `errno_of`, `alias_in_`): the same check shows that a build without features holds neither `errno_of` nor
  `panic_test`, the entry point of B-7, because both are of the feature `panic-test`. A member that waits is not generated yet (GN-1), so the
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
  the file, line and trace of its call. Startup finds every class of PHP that a library class extends or implements
  before it registers anything, and a class that the engine lacks fails the start of the module (startup returns
  failure), as does a library class whose registration fails; so every class that a registration or a call reads is
  there, and the extension has no panic for a missing one; `kind()`, `status()` and `errno()` read private properties. Each category
  class has the public constructor `__construct(string $message, string $kind, ?int $status = null, ?int $errno =
  null)`, which every error unit inherits, so that PHP code makes an error with its kind as Python, Node and WASM code
  does (GN-7a); without it a kind could be set only in the scope of the class that declares it, which is no public
  API. The object of an error that the extension raises is made without the constructor (B-4). An enum is a backed
  enum (T-6). PHP takes a keyword or a type name as the name of an enum case, but the macro `php_enum` of ext-php-rs
  refuses them case-insensitively, also as the name that `#[php(name)]` gives, so such a case takes a trailing `_`
  (`Kind::Object_`, `Kind::List_`); the backed value stays the value of the contract. The `php_function` and `php_module` expansions of ext-php-rs call `Option::map_or` and
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
  generated code runs the future on a tokio runtime, so that a core of tokio (redis-rs) finds the runtime that it needs;
  WASM, which has no tokio runtime, runs it on the event loop of JavaScript.
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
  - WASM returns a `Promise` of `wasm_bindgen_futures::future_to_promise`: the event loop of JavaScript polls the
    future on the thread of the module, in a browser as in Node, and its result or error is converted when it ends,
    so a failure rejects the promise. The WASM crate depends on `wasm-bindgen-futures` of the release that pins its
    `wasm-bindgen` and `js-sys`, and not on the driver of binding_core: no tokio runtime runs in a WebAssembly
    module, so a core whose future needs one fails there with the error that its core gives, and such a member names
    the targets that it supports in `only`. A panic of a poll is kind `internal` where the module unwinds, and it traps
    the instance where the module aborts (GN-18). The ES entry is an async function, as for Node.
  A member with `async_driver` is refused by name where GN-6m refuses a member that waits. A member with
  `async_driver` that reaches language code is generated as GN-6ab states, because a future that a runtime polls on
  its own threads would call the language code there.
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
- **GN-6af** A unit with `only` (Q-4) is generated for the targets that it lists, as a member with `only` is, and the
  binding, the declarations and the tests of every other target hold nothing of it. A class of origin `value` without
  `core_type` (U-1, T-5) is a class of the language that keeps the language values that it was given; no core value is
  behind it. Its constructor names in `core` a function of the core that judges the arguments and returns
  `Result<(), Failure<E>>`: its first parameter is `&mut dyn HostValues`, and a parameter of a value alias, or a list or
  a keyed map of one, is the `HostValue` that the binding describes (a `Vec` or a `KeyedMap` of them), an `Option` of it
  when the parameter has a default, `None` when the call leaves it out. A failure is thrown as the failure of any
  member (E-2). The instance keeps each argument as the language gave it, or, when it was left out, its default as a
  value of the language: `{literal: null}` is the null of the language, `{empty: "map"}` a new empty map (a `Map`, a
  `dict`); such a default needs no `default_core`, because the core takes `None`. A property without `core` gives the
  kept value of the constructor parameter with its name; a writable property (U-1 `writable`) also sets it, and the
  value that it sets is judged where it is used, when a member reads it through its value alias. A keyed map that the
  constructor takes gives the core each key of the kinds that the type lists, a byte string key of Node and WASM
  being a `Uint8Array`; the instance keeps the `Map` itself, so GN-12, which refuses such keys where the entry makes a
  `Map` of entries, does not apply. Python defines the class in the native module, with a field per value; Node and
  WASM define it in the JavaScript entry, with an own enumerable data property per value (writable when the property
  is), and the addon judges the arguments. An `in` row of a value alias that names a class (U-1) describes an
  instance of it as `HostValue::Value` with the kind of the row; the handle is the same for the same instance within
  one walk of the core, so that the core sees one object at each of its positions. `read` of `HostValues` gives, for
  the handle, the property that the row names as `read`: the kept value, described again, or the value that the core
  path of the property returns (a bool, an integer or a float). An `out` row whose make names the constructor of a
  class without `core_type` makes an instance without calling the core: an `object` or a `map` is the map of its
  entries and a `reference` the value that it holds, which a writable property keeps. The instance is made before its
  content and is the same instance at every position of its handle (U-7 (d)). Python, Node and WASM generate these
  classes; Go refuses them by name (G-4), and PHP takes its own `stdClass` and references (GN-6e). PHP makes the form
  `php_object` as a new `stdClass` whose properties are the entries, each name the bytes of its key, which may hold any
  byte, and the form `php_reference` as a new reference whose value is the made value; an array key of bytes is a
  string key of those bytes. An object and a reference are made before their content and are the same object or
  reference at every position of their handle, so a cycle through them is made; an array, which is a value, stays
  kind `internal` inside its own making.
- **GN-6ag** A unit of origin `host` (U-1: a class, a functions unit or a record) is code that the repository writes by
  hand, and its source is its declaration (I-1, L-3). The generator writes nothing of it in any target: no entry
  point, conversion, declaration, re-export or generated test, and the contract check requires no case of it (CK-22).
  The host package exports it with its own entry (L-2a). A host unit takes a generated unit as a parameter (U-2 of the
  design: a host operation on a generated unit is a function of a host functions unit), and a generated unit that
  names a host unit in a type is refused by name (G-4), because the binding converts only the types that it
  generates. Why: the host code calls the binding and the binding never calls the host code, so a generated copy of a
  host unit would be a second declaration that could differ from its source.
- **GN-6r** An internal unit (U-1, `visibility: "internal"`) is generated as a public unit of its kind is, with the
  same conversions, refusals and generated tests, and each language marks it as no public API:
  - PHP: the docblock of each of its declarations in the stub holds the tag `@internal`.
  - Python: its names are in no `__all__`, so `<root>` does not re-export them. The names of the root module are in
    `<root>._root`, and those of the module `m` in `<root>._m`, a module of the internal names alone; the generated
    tests call them there.
  - Node and WASM: the JSDoc of each of its declarations holds the tag `@internal`, which a package that builds its
    declarations with `stripInternal` leaves out.
  - Go: the doc comment of each of its declarations ends with the sentence `It is internal to <library> (U-1) and is
    no public API.`, because Go has no marker of an exported name that only one module uses.
  Every member of an internal unit is internal with its unit. An internal member of a public unit is refused by name
  (G-4), because its forms differ by language and no contract has one yet. The contract check judges the names of an
  internal unit as those of a public one (CK-23), because the generated code declares them. Why: the code of the
  repository (its hosts, its command tool and its cases) calls an internal unit through the binding as it calls a
  public one, while a user of a package reads it as no API (U-1, P-3).
- **GN-6s** A callback unit of another repository as a parameter (T-3, U-3): the binding wraps the language object as
  an implementation of the core trait of that unit (its `core`), as it wraps a callback unit of this repository: the
  members are checked when the object enters (kind `invalid_callback`), `thread: owner` holds, and each trait method
  calls the method of the language object through the API of its language, so the binding never takes the native
  object of another binding out. A trait method returns the failure of the core error of the owning repository
  (`binding_core::Failure<<owner error>>`, the one error enum of the owner's `errors.kinds`), and an exception of the
  language code is `Failure::Raised`, which the core of this repository passes on. The binding declares no type of
  the unit: the declarations name the type of the owning package (PHP the interface of its namespace, Python the
  Protocol of `<owner root>._types`, Node the type that the owning npm package exports), and a user implements that
  type. The name of such a unit differs from the name of every unit of this contract, which the generator refuses by
  name otherwise (G-4). Not generated yet, each refused by name (G-4): the Go and WASM forms; a case value that a member
  of the owning repository makes (`new` of its member, GN-13f), whose generated test fails with that reason (GN-13).
  The PHP extension declares no module dependency on the extension of the owning package (`ZEND_MOD_REQUIRED`), so
  the configuration of PHP loads that extension first; the generator refuses nothing for it. Why: a
  native object of another binding lives in another module, so the binding of this repository can reach it only
  through the methods that the language gives every object (T-3).
- **GN-6ab** A member with `wait: async_driver` that reaches language code (GN-6q: the type of a parameter or the class
  of its receiver carries language code) names `"machine": true` in its `core` (CK-68), and its core path returns a
  state machine without I/O in place of a future (c6 6.2): a value of `binding_core::machine::Machine`, which owns the
  arguments. `resume(io)` advances the machine with the output of its last wait (`None` at the start and after a call)
  and gives one step:
  - `Step::Io(future)`: a future of the core that touches no language code, which the driver polls on a tokio runtime
    and whose output it gives to the next `resume`;
  - `Step::Call`: the driver calls `call()` of the machine on the thread that owns the language code, and the machine
    calls its callbacks (U-3) or touches its `Native` values there;
  - `Step::Done(result)`: the result of the member, a `Result<T, Failure<E>>` when the member is fallible (E-1c).
  The faults of the member are installed around each poll of an Io future, as GN-6n states. Each language drives the
  machine in its own form:
  - PHP drives the machine on the calling thread with `binding_core::machine::drive`, which waits for each Io future in
    `binding_core::driver::block_on`, so a callback runs on the thread of its objects.
  - Python: `<name>` drives the machine as PHP does and waits for each Io future in `py.detach`, so other Python threads
    run while it waits; `a<name>` runs `<name>` in `asyncio.to_thread`, as GN-6m states. A callback is called with the
    GIL on the thread that drives the machine, which GN-6q allows, because a Python reference is bound to the GIL and
    not to a thread.
  - Node: the entry makes the machine on the JavaScript thread and returns a `Driven` object of the addon, and the
    JavaScript entry, an async function, calls its `advance()` until the machine ends. Each `advance()` gives the output
    of the last wait to the machine, makes its calls on the JavaScript thread and returns `[false, promise]` for an Io
    future, which runs on the tokio runtime of napi and which the entry awaits, or `[true, result]` at the end, converted
    on the JavaScript thread. A failure of the member throws from `advance()` and rejects the promise of the entry.
  - Go refuses such a member by name, as it refuses every member with `async_driver` (GN-6n): the completion channel of
    GN-6m, which would wait for an Io future, is not generated, and Go needs no owner thread for a callback, because a
    cgo call from any thread may call Go (c6 6.4).
  - WASM: as for Node, the entry makes the machine on the thread of the module and returns a `Driven` object of the
    module, and the ES entry, an async function, calls its `advance()` until the machine ends and then frees it. Each
    `advance()` gives the output of the last wait to the machine, makes its calls on the thread of the module and
    returns `[false, promise]` for an Io future, the promise of GN-6n, or `[true, result]` at the end. A browser and
    Node run the same steps, because the event loop of JavaScript polls each Io future on the thread of the module in
    both and no tokio runtime is used.
  A method with `machine` is refused by name: a machine that borrowed its receiver across its steps would borrow from
  the guard that the driver holds, a type that the core cannot name; a function and a static member are generated. A
  callback with `async_allowed: true`, whose call would give an awaitable to the machine, and `core.reaches` (c6 6.3)
  are not generated yet (G-4). Why: a future that a runtime polls on its own threads would call language code there,
  against the owner of a Node or PHP reference, and a callback that calls another member with `async_driver` would run
  `block_on` inside the runtime, which tokio refuses; a machine without I/O lets the runtime of each language decide
  where each step runs, and the core keeps its I/O on tokio.
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
  this repository alone. A value class of another repository (GN-6x) is the pointer to the Go type of the owner's class
  in the package of its module, which `internal/binding` imports. Package binding describes an instance by the `in` row
  of the class for Go: it calls the `by` member and writes node 11 with the kind of the case whose `is` the result is
  and a handle; the question read (op 2) of that handle calls the `read` member of the case and describes its result
  by these rules, except for a case of the kind `text16`, whose result, a slice of unsigned integers, is node 13 with
  its length and its UTF-16 code units, which the static library reads as `HostText::Utf16`, and for a case of the
  kind `text` with `units`, whose `read` gives a nil pointer, which is node 13 of the code units that `units` gives;
  an instance of a class of
  the owner whose `iterate` member yields `{key, value}` is a map of the entries of that iteration. An error that a member of the owner returns is node 12 with the call and its index, so
  the Go function returns that error unchanged, as it returns the error of a callback (U-3). A core value of the class
  leaves as node 11 of the result with the number of the value class and the number of its Go `out` row, followed by
  the content of the kind of the row: nothing for `null`, a bool, the literal of a number, a text, the code units of
  `text16` as a list of `uint64`, the items, or the entries of a map; package binding calls the exported function of the owner that the row names on that content, a map
  as an instance of the map class that its constructor makes and its insert method fills, and an error of that
  function is the error of the call. A Go value of another type is described by the rules above, so the owner's `in`
  function judges it.
- **GN-15d** Go error units (E-2, E-7, I-3): an error unit is a struct `<Unit>` of `internal/binding` that embeds a
  pointer to its parent (its parent unit, or the category type), so `errors.As` finds the parent and the category
  through `Unwrap`; package `errors` names it as an alias, and each property is a method that returns the value that
  the C ABI read from the core error. A kind whose row names the unit is created as that struct.
- **GN-15e** Go `source` and defaults (T-1, U-2, T-4): a `source` parameter is a `[]byte`, which holds the bytes of a
  text too, and its bytes go to the core. A parameter or record field with a default is a pointer `*T`: nil leaves
  it out, and the core decides its value. An `optional` type with a default keeps its one pointer `*T`, because nil
  already means no value (GN-6i).
- **GN-15f** Go records of another repository (T-3, GN-6c): a record of another repository is the struct `<Record>` of the package of its
  module in the Go module of that repository, the module of `packages.go` of its contract, which the package imports
  by its package name; the C ABI writes and reads it field by field as a record of this repository, through
  `in_<library>_<record>` and `out_<library>_<record>`; a record of another repository with a field of a unit type, and
  one whose package has the name of a package of this repository, are refused by name. `binding scaffold` reads the contract of each library that the
  contract names, as `binding generate` does: the contract of a `path` dependency of the core is the `interface.json`
  of that path, which needs no Cargo, and the contract of any other dependency is found through `cargo metadata`. For
  each library whose records or value classes (GN-6x) the contract names it writes a line `require <module> <version>`
  in `go.mod`, because the Go binding imports the package of each (B2.87): the version
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
  `Raised` of U-3. A language object that a core may keep is a `Native` (GN-6u). The in function of
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
  name (PHP named argument, Python keyword, a member of the Node options record, and a missing member). In Python a
  function or method without parameters is a function of no arguments, which CPython reports as `takes no arguments`
  and `takes no keyword arguments`, while a constructor without parameters is the `__new__` of PyO3, which reports
  `takes 0 positional arguments` and `unexpected keyword argument`, and each test expects the words of its form. The arguments
  of a case are its keys in snake_case, a record parameter an object of its fields, an enum its value text and a latin1
  value a text of U+0000 to U+00FF; a case without the key of a parameter that has no default is refused by its id. A
  number of the type `float` is a float literal in Python and PHP, which refuse an integer there (B-2), also when JSON
  writes it as an integer (`0` is `0.0`, `1e20` is `1e+20`), and a negative zero keeps its sign (`-0.0`). Values that JSON
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
  `{"hex": ...}` for a keyed map; `reference` holds `{"id": n, "value": ...}` at the first place of its id and
  `{"id": n}` at every later place, the same reference; an `object` with `"id": n` beside its kind is named at every
  later place by `{"kind": "object", "id": n}`, the same object. Places are ordered as the value is written, depth
  first, so a later place may lie inside the value of the first, which makes a cycle; the ids of objects and those of
  references are separate. An object nested deeper than a JSON reader takes is
  `{"kind": "object", "repeat": <n>, "key": <key>, "value": <value>}`: n objects (at least 1), each the one property
  `key` of the one around it, the innermost holding the value.
  A value of a value type that a class of origin value represents (U-1) is the call of the static member or
  constructor that the `out` row of its kind names for the language: a member without parameters for a kind without
  `value`, and a member of one parameter, which takes the case's `value` as a case value of its type, so `list` holds
  the values of the class. When that one parameter is another class of the contract, the `[key, value]` pairs of a
  kind `map` fill it: its constructor without parameters makes it, and its one member with the receiver `&mut self`
  and two parameters takes each pair in order, a text key as a value of kind `text` where that parameter is a class
  of origin value (`Value.object` of an `OrderedMap` that `OrderedMap.insert` fills). A case value of such a class at
  any other place is the same list of pairs. A kind that no row makes by such a member (a member of two parameters, a built-in form, or
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
  and G-7 tests of a method use the factory arguments of the first case of the class that does not raise. A value
  class without `core_type` (GN-6af) is such a class in Python, Node and WASM: its constructor and its properties have
  these tests, and a property is read on an instance that the constructor makes from the case's keys of its
  parameters. A member
  that takes a callback has the tests of K-2: an object without the
  members is kind `invalid_callback`, the exception that the callback raises reaches the caller as the same object,
  and a result of another type is a binding kind, unless a member of the callback returns a value alias: the alias's
  core judges every value (B-1), so a refused result has the alias's kind and this test is not generated; its other
  arguments are placeholders whose lists have one item.
  K-2 is binding's own requirement and does not depend on a case. A case gives a callback parameter as a fixture,
  `{"callback": {"<callback member id>": [<row>]}, "calls": [{"member": "<id>", "args": {...}}]}`: a row is
  `{"args": {<parameter in snake_case>: <case value>}}` with `"result": <case value>` (absent when the member returns
  none) and `"once": true` for a row that answers one call. A row with `"raise": {"error": <error unit>, "kind":
  <kind>}` throws, in place of a result, an instance of the class of that error unit with the kind and the message
  `G-5: <kind>`, as language code makes one (GN-7a): Python, Node, PHP and WASM by the constructor of the class with the
  message and the kind (GN-10); Go by
  `Raised<Unit>(kind, message)` of package `internal/binding`, which makes the struct of the unit with no property
  value. The generated test of each language makes the fixture
  from one implementation that binding writes into the test module, so a repository writes no fixture code: a call
  takes the first row of its member that is left and whose arguments equal the call's, and a call that no row answers
  is recorded and throws `UnexpectedCall`. After the call under test, the test requires that record to be empty, so a
  core that swallows the exception still fails, and the calls to be those of `calls`, in order, when the case names
  them. A callback inside another type (a field of a record, an item of a list, an `optional`) is given as the same
  fixture, and a function as `{"function": [<row>]}`, whose `args` are the positions of its parameters (`"0"`, `"1"`,
  ...). `binding check` judges the form (CK-22). The B-4 test of a member that takes a callback runs its raising cases
  with their fixtures. A stringify and a to_json are run as the language runs the hook
  (GN-6g): a stringify has a test for each of its cases that does not raise, in which the string form of the instance
  (`str`, `String`, a `(string)` cast) is the case's `result` and, in PHP, the instance is a `\Stringable`; a
  primitive has a test for each of its cases that does not raise, in which the number form of the instance
  (`Number(instance)` in Node and WASM) is the case's `result`, or is taken alone when the case gives no `result`; the B-4
  test of a to_json calls `JSON.stringify`, `json_encode` or the unexported `toJSON` in Go, as the Go test of a stringify calls `stringify`; none has a G-7 test. B-5c (GN-6h): for every class with a write place, a test makes an instance, runs the poison
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
  the language gives it on the machine (Python `errno.<symbol>`, Node `os.constants.errno.<symbol>`, Go `syscall.<symbol>`, PHP
  `Internal\errnoOf("<symbol>")` of GN-8a), and no errno when
  the case names none. The Go test compares the symbol as `int(syscall.<symbol>)`, the type that `Errno()` gives. The
  target of WASM has no errno (`binding_core::errno::value` gives none, and an arming that names a symbol is refused,
  GN-8a), so the WASM test arms the faults of a case and of a call of `then` without their `errno` and requires no
  errno where the case names a symbol; a number is compared as it is. A value alias with `in_raises` has, with the feature `codec-test`, an entry point that runs its
  `in` function alone; each case of the alias (CK-22) calls it with the case's `value` and requires the class of the
  kind's category and the kind. Each member with a parameter that is the alias, an optional of it or a list of it has
  one more test: the value of the alias's first case at that place, as the parameter or as the one item of the list,
  with placeholders for the other arguments, gives the same class and kind through the member. A case gives a value
  of a value type as `{"kind", "value"}` of the kinds `null`, `bool`, `int` (a number, or its decimal text outside the
  safe integers: a Node `bigint`, a Python `int`), `float`, `text`, `bytes`, `list` and `map`, each as the value that
  the built-in form of the kind makes. A value of the language that is no value of the value type is `{"host": <sort>}`
  of a closed table of sorts, so that each language makes the same value for it: `callable`, a function (Python
  `lambda: None`, Node and WASM `() => null`, PHP `static fn (): null => null`, Go `func() {}`); `date`, a date (Python
  `datetime.date(1970, 1, 1)`, which the test imports, Node and WASM `new Date(0)`, PHP `new \DateTimeImmutable('@0')`,
  Go `time.Unix(0, 0).UTC()`); and `object`, an instance of a class of the test (Python `object()`, Node and WASM
  `new (class Other {})()`, PHP `new class {}`, Go `struct{}{}`). Another sort is refused. A PHP reference is a place of an array or of a property, so a case value of
  PHP whose places hold `{"kind": "reference", "value": {"id", "value"}}` or an object with an id is made in a closure
  that names one variable per id, a new `stdClass` for an object, then fills each object and sets each reference, and
  returns the value whose places take the reference variables by reference and the object variables. Python, Node and
  WASM make, per id, one instance of the class of a reference or of an object (GN-6af) without content, then set its
  value or fill its map, in an expression that names each instance (an assignment expression of a tuple in Python, an
  arrow function in Node and WASM), so every place of an id holds the same instance and a cycle is made. A repeated
  object is made from the outermost in, each object filled after it is made, so no constructor judges the objects
  inside it again; PHP makes it from the innermost out with `(object)` casts. A case-test entry point (GN-5) describes
  the later place of an id by the identity of the first, which the core does not read again. A case whose argument has no form in the
  language of a target, so that no call of that language can give it, runs through an entry point of the feature
  `case-test` of that target (GN-5), beside `panic-test` and `fault-test`: the entry point makes the argument in the
  binding's own encoding, as the host values that the binding describes (B-1) or as the value stream of the C ABI of
  Go (B-8), gives it to the same conversion that a call uses (the `in` function of a value alias, the decode of the
  arguments), and its test requires the class and the kind of the case, or no failure for a case that does not raise;
  the doc comment of the entry point and of its test names why the language has no form. A case is neither left out
  nor generated as a test that fails: left out, the rule of the core stays unverified in that target, and failing,
  the end-to-end check never passes. A crate has `case-test = []` when its target has such a case, and no build
  without the feature holds the entry point (the end-to-end check reads the symbols with `llvm-nm`). So far: in PHP, a
  reference that is no place of an array or of a property (the value itself, or the value of a reference), and an
  integer outside 64 bits, which PHP has no form of, given as the decimal token that Python and JavaScript describe
  for it (`HostValue::Number`), each given as host values to the `in` function of its alias, the value of a case of a
  member and the value of a case of the alias alike; Go (the argument of a kind that the Go type of the parameter does not
  hold, such as a text for an `int64`) is generated by the Go generator and refused by name until then; Python, Node
  and WASM have no such case yet.
- **GN-13a** Open items of G-5, not generated yet: B-5b and B-6; B-10 in Go and WASM, which refuse a class unit
  with `cleanup` by name (PHP, Python and Node generate it, GN-6p); of B-5c, the tests of a call that
  overlaps a waiting call and of a call that re-enters an object from a callback, and the tests of a class that no
  constructor or static member makes; the identity of a default of a member that GN-13d leaves out; the round trip
  of the rows of a value unit without the entry points of `codec-test`, which GN-13e runs for an alias with them; and, of the callback fixture, an `async` row, a function value
  and a callback inside another type, each refused by name when a case gives it (G-4). Of fault injection and the
  kinds of an alias, each refused by name when a case gives it: a point of another library; and a value of a value type of another kind
  than those of GN-13. Not generated and not refused: the test of a case with `faults` that does not raise, because the test of
  GN-13e arms no faults yet; the test of a member that takes an alias inside a map, a record field or the
  return of a callback; and the check that no release build has a test feature (the resolved features of
  `cargo tree`, and the export list of each installed package), of which the end-to-end check has the part of Go
  (GN-13b).
- **GN-13d** Python, Node, PHP and WASM also check, for the shapes of GN-6i, GN-6j and GN-7a: U-2, for every parameter or
  field with a `{literal}`, `{const}` or `{empty}` default, that the call without it and the call with its declared
  value give the same result, or the same class and kind of failure; the other arguments are those of the first case
  of the member that does not raise, or placeholders. The test is written for a member whose result the language
  compares by value (no class, no result of `none`) and that takes no callback and is no hook. In Python and Node an
  explicit `None` or `null` for such a parameter is tested as a value that is refused, except where the default is
  `{literal: null}`, whose declared value is that null, and except for an `optional` or a value type, which takes it
  as a value (GN-6i). T-1: a `source` parameter gives
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
  call alone and fails when it raises. The result `null` of an optional has a case form whatever the optional holds,
  a class too: each target compares the result with its null (Python `None`, Node, WASM and PHP `null`, and Go `nil`
  of the type of the result). A result that is a value alias of the contract (not inside another type, and
  not a property of a value class, which gives the value that its constructor took) is compared as the texts of its
  places in pre-order, depth first, which a loop writes on both sides, so a value nested deeper than a recursion
  takes is compared too. The generator writes the texts of the case value by the out rows of the alias: for each
  place, the row of its kind whose predicate the value has (`utf8`, `safe_integer`, `integral_float`,
  `sequence_keys`; a case value of the kind `list` or `text` takes the rows of `map` or `bytes` when the alias has no
  row of its kind) and the form of the row in the language. The test writes the texts of the result by the type of
  each place. A text names the form: `null`; `bool true` or `bool false`; `int <decimal>` in Python and PHP; `number
  <bits>` in Node and WASM, the hex of the IEEE 754 bits or `nan`; `bigint <decimal>`; `float <bits>` in Python and
  PHP; `text <hex>` and `bytes <hex>` of the UTF-8 or the bytes in Python, Node and WASM, `string <hex>` in PHP;
  `list <n>`, then its items; `map <n>`, then each key and its value, a key in the form of its keyed map (a PHP key
  that is the decimal text of an integer is that integer); and an instance of a value class that an out row names as
  `<unit>.constructor`, a PHP `stdClass` and a PHP reference, numbered together by their first place: `<unit> #k`,
  then its one field, `php_object #k <n>`, then its pairs, and `php_reference #k`, then its value, and
  `<form> again k` at a later place, so the identity of each place and each cycle is compared. The result of an
  alias with the entry points of `codec-test` (`in_raises`, GN-5) also goes through the round trip of the rows of the
  alias (U-1): the test gives the result to `_alias_round_<alias>` (Python), `__aliasRound<Alias>` (Node, WASM) or
  `Internal\aliasRound<Alias>` (PHP), which takes it by the `in` function of the alias and gives the core value back
  by its `out` function, and requires the same texts, so each form that the `out` rows make enters again as the same
  value. A case whose result
  has no case form (a class, a result of `none`), whose value alias has no out row that makes the built-in form of
  its kind in the language or a form of the texts, or that gives no argument of a parameter or of the factory of its
  receiver fails its test with that reason, so the case is never left out.
  The name of the test of a case in a language whose tests are functions or methods (Python, PHP, Go) holds the id of
  the case as its words: the id is split at every run of characters other than ASCII letters and digits
  (`document-order` is `document`, `order`), and the words are joined by `_` in Python and capitalized and joined in
  PHP and Go (`DocumentOrder`). Node and WASM name a test by a string, which holds the id as it is. Two ids of the
  cases of one member, or of one value alias, that give the same name refuse the target by name, PHP comparing names
  without case as it does for its methods, so no test hides another. The parser of Python refuses an expression whose
  brackets nest 200 deep ("too many nested parentheses"), and a case may nest a value deeper (a list past the depth
  limit of its core). A Python case value whose brackets would nest more than 50 deep is therefore made step by step:
  each value of it that reaches that depth is a local variable of a function of the test module, the next step takes
  the variable, and the test calls the function, so the value of the case stays whole.
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
  requires before the next step, so a kind that only an instance after a failed call reaches has a case. A call of
  `then` may hold `"faults": [...]`, the fault injection points of its own call in the form of the faults of a case
  (CK-22): the test arms them for the member of that call just before it and requires every armed fault to have
  fired just after it, so a kind that a failure of an earlier call leaves for a later call to give has a case (a body
  whose feed failed to store gives that failure again from its finish). A call of `then` with `"on": "receiver"` is a
  method of the class of the `receiver` of the instance value, called on that receiver in its order among the calls
  of `then`, after the pick; so a kind that the instance reaches only after a call of the instance it was picked from
  has a case (a stored file whose body was removed). A test that needs any receiver (B-2, B-3, G-7) takes none that
  arms faults, and Go puts a test whose instance values arm faults with the cases that arm faults (GN-13b). A test makes every instance of the value as a local of the test, the receivers and the results that a
  pick reads from included, so none is reclaimed before the test ends; the tests that need any receiver (B-2, B-3,
  G-7) call a function of the test file that makes it. `binding check` reports a value that breaks this (CK-22).

- **GN-13b** Go: the tests of a package are `zz_generated_test.go` in the package itself, so that a test reads the
  handle of an instance, run by `go test`: B-2 for every `int` parameter (2^53 and −2^53) and every `uint` parameter
  (2^53) as kind `invalid_number` (GN-12a), the key 2^53 of every `keyed_map` parameter with `int` keys as kind
  `invalid_number` (GN-12a), B-3 for every text parameter or field (the bytes FF), the enum check of
  GN-16 for every enum parameter or field, U-2 (a call without an argument with a default gives the call with its
  default), U-7 (a kind of an alias through the member), K-2 (a nil callback, and the error of a callback is the error
  of the call), B-4 for every contract case that raises (the exact type of E-2 and E-7, `errors.As` of its category,
  the kind, the status and the errno), GN-13e for every case that does not raise, and N-4 for a stringify. A case
  value of a class is written as in the other targets: an instance value (GN-13f), the call of the make member of a
  class of origin value, or the pairs that fill another class (U-1, GN-13), each a local of the test; a case whose
  receiver, argument or result is not written has a test that fails with the reason, and the other tests are written
  (GN-13e). The cases
  that arm faults are `zz_generated_fault_test.go` with the build tag `polyspec_fault_test`, and they lock the
  goroutine to its thread, because the arming is of the thread; the poison tests of B-5c are
  `zz_generated_held_test.go` with the build tag `polyspec_panic_test`. The end-to-end check runs `go test` with the
  tag `polyspec_<feature>` of each test feature of the crate. B-7 is
  `internal/binding/zz_generated_panic_test.go` with the build tag `polyspec_panic_test`, which also declares the C
  ABI's panic entry point, so the static library needs the feature `panic-test` only with that tag.
  `internal/binding/zz_generated_map_test.go` checks the order of `Map` and that the encoding keeps it both ways.
  Every latin1 parameter or field is tested with U+0100 and the bytes FF as kind `invalid_text`. The features
  `panic-test`, `codec-test` and `native-count-test` are for tests only: the manifest that `binding scaffold` writes
  turns none on by default and `binding check` refuses any other manifest (CK-19), and the end-to-end check builds the static library
  without features and fails if it holds a test entry point (`__panic_test`, `__echo_`, `__arm_faults`,
  `__fault_left`, `__alias_in_`, `__number_in`, `__native_count`). With the build tag
  `polyspec_codec_test` and the feature `codec-test` of the C ABI crate, test entry points give back a latin1 value
  (when the contract takes and gives latin1), a `map<text>` and a `keyed_map<text>` with every key kind (when it takes
  and gives such a map) through the conversions of the binding; `zz_generated_codec_test.go` checks that U+0000 to
  U+00FF, the order of a map and the order and kinds of the keys of a keyed map come back the same and that U+0100 is
  refused; the cases of an alias of this repository run its `in` function alone through `AliasIn<Alias>`. A `keyed_map` parameter or field whose contract does not list every key kind is tested with a key of a
  missing kind as kind `invalid_argument_type`. A case's latin1 value is a Go string of its runes; a case gives a `map` as
  an object of its entries in order and a `keyed_map` as GN-13 does.
- **GN-13g** Go: a parameter of a number type holds only values of its Go type, so the B-2 values of GN-13 of another
  Go type (true, "7", 1.5, NaN and the infinities at an `int`, `uint` or `int64`, -1 at a `uint`, true, "7" and an
  integer at a `float`) cannot be the argument of a call. For each number type of a parameter of the contract, the
  feature `codec-test` and the build tag `polyspec_codec_test` give the function `<Type>In(value any, subject string)
  error` of `internal/binding` (`UintIn`, `IntIn`, `Int64In`, `FloatIn`) over the entry point `<prefix>__number_in`.
  The function encodes the Go value as a host value: a bool, a Go integer in the range of int64, a Go integer above
  it, a Go float, a Go string, or any other value. The entry point judges it by the conversion of that number type
  of the binding: a value of the Go type of the number type passes the range of GN-12a, and a value of another type
  is kind `invalid_number` of B-2 with the subject. So the error is the one that a call with that argument gives in
  the other targets. `zz_generated_codec_test.go` checks the B-2 values of GN-13 for each such type, and a value of
  the type (7, or 1.5 and NaN for a float) passes. A test of another repository that has a host value of another type
  for a number parameter, such as a legacy case with an input type, passes it through this function, because the Go
  call cannot take it.
- **GN-13c** WASM: `packages/ts/wasm/generated/tests/generated.test.mjs` runs the tests of GN-13 for Node, those of the
  members of a class among them, the tests of K-2 and the callback fixtures of a case among them, and the U-7 tests of
  an alias (GN-18b), with `node --test` against the subpath `./wasm` of the installed package. The B-7 test runs last: it runs the panic entry
  point through `state.mjs` and expects kind `internal`, then a later call that is kind `internal` when the instance
  trapped and that works when the module unwinds (GW-7).

## End-to-end check

- **GN-14** `make e2e REPO=<checkout> [WORK=<directory>] [BINDING=<commit>] [DEPS="<checkout>..."]`,
  which runs `scripts/e2e.mts` of the commit `BINDING` (GN-14b) on the Node.js of the checkout in the directory `WORK`,
  or, without `WORK`, in a directory that the run makes under the temporary directory of the system and removes when it
  ends, when it fails and on SIGINT and SIGTERM, after every process of the run has exited, so a run without `WORK`
  writes nothing into the checkout but its record (`tests/e2e/sample` and `tests/e2e/shapes` are repositories of the items that no polyspec repository generates alone yet,
  the first among them the two forms of a call of `then` (GN-13f: the tally of a counter that arms its own fault and
  leaves its failure for settle, and the clear of a shelf that a slip made from it then misses), the second those of GN-6i, GN-6j and GN-7a for Python, Node and PHP with a member of the receiver `&mut self` that
  takes a `source` and a default (GN-6h); `tests/e2e/classes` is one of a class unit with every kind of member and
  no unit that WASM refuses (GN-18a); and `tests/e2e/consumer` is one that names the
  value alias of the sample and has an error unit with properties (GN-6k, GN-7a), run with `--dep tests/e2e/sample`;
  `tests/e2e/plot` is one that takes and gives the record `point` of `tests/e2e/points` (GN-6c, GN-15f), run with
  `--dep tests/e2e/points`, whose Go static library the run builds with its test features beside the one of the
  repository, because the Go program of the repository imports its Go module (GN-15f);
  `DEPS` names each repository whose types the contract names; its packages are built and installed first)
  copies the committed tree of a repository, makes the changes that take the binding of the run and prints each
  (GN-14d), runs `binding check`, tests the core without the generator, checks that the case files follow the case
  convention (GN-14d), generates for each target, lints the core and, on the host, each binding crate with the test features of its manifest
  and without a feature, because an import or a helper that only an entry point of a test feature uses is unused in
  the build without features alone (GN-5),
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
  (its minor is compared, because the PHP of the machine is wrapped as it is) the PHPUnit of `config/phpunit` and `llvm-nm` of the component
  `llvm-tools` for php (GN-8a), and Go of `mise.toml` with that `llvm-nm` for go (BD-10 (d)); the check itself runs on the
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
  test is named and fails the run, because it verifies nothing. A package that does not build ends the events of its
  build with `build-output` and `build-fail`; the run writes that output and names it as the cause of the failure of
  the package, because a link error is seen only there. On macOS the PHP extension links by the `build.rs` of its
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
  (GN-18a), and `CASES` with the case file. Where `tests/e2e/<library>` holds `bench.mjs`, `bench.py` or `bench.php`,
  the run measures with each after the cases of Node, Python or PHP and gives it `BENCH_REPORT`, the file
  `var/report/bench/<library>-<language>.json` of the checkout (ignored), where it writes the median of a fixed number of
  runs of each measurement with the load average when it was taken; a measurement prints a `WARNING` above its limit
  and never fails, and its builds are the debug builds of the tests, so a ratio of two paths of the same build is what
  it reports (B2.87). The repositories of `tests/e2e` have the binding crates as members of
  their workspace, as every repository has, and track no binding package, which the scaffold of the run writes. Why: a
  change of the copy that the repository has not made would verify a repository that no commit holds, and a repaired
  defect then passes in the run and stays in the repository.

- **GN-14e** A run takes every contract of the repository (L-1): `packages/rust/interface.json` and each
  `packages/<component>/rust/interface.json`, in the order of their paths, and a repository without one fails. Each
  contract is scaffolded, checked, generated, built and tested in its own layout (`place`, L-2a), and the run records
  the paths of the contracts. The generated tests of a host Node package import the generated entry beside them, so
  the run puts them in the installed package where the copy has them.