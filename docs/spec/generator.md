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
  interfaces of this contract that a class implements (GN-6w), the generated interfaces without members (GN-6ap),
  and for Python, Node, PHP and WASM the type `source` of a parameter (GN-6j) and the defaults of parameters and record
  fields (GN-6i), a method with the receiver `self` (GN-6o) and a class unit with
  `cleanup` (GN-6p), and for Python, Node, PHP and Go a member with `blocking_io` that reaches language code (GN-6q).
  callback interfaces (U-3, synchronous members with the receiver in `core.receiver`), Any other item (an async
  callback, a value unit, a wait other than `none`, `blocking_io` (GN-6m) and `async_driver` (GN-6n), a default
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
  usage line; only an error of the command line prints it, with status 2. A failure that a contract, a case file or a
  manifest causes prints its sentence and no stack trace, and a target whose generation fails with such a sentence is
  a refused target with that item, so it does not stop another target; only a defect of binding itself prints a
  stack trace. A repository that builds and tests one
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
- **GN-3e** A manifest that `scaffold` writes names another polyspec library (T-3) in the form of the dependency line of
  the core on `polyspec-<library>`. The libraries that the manifests name are the libraries whose types the generated
  code names: each library that the contract names, and each library that the members of a callback unit of another
  library name when the contract takes that unit, because the binding wraps the callback and converts the values of
  its members (GN-6s). The Cargo manifest of each binding crate has the dependency line of each of them, which the
  core names too, and `pyproject.toml` has the Python package of each; `go.mod` requires those of them that own a
  record or a value class among those types (GN-15f). A manifest also names the package of another library that the
  generated code of its ecosystem imports or needs when it is loaded: `package.json` has in `dependencies` the npm
  package of each library that owns a value class among those types, because the entries of the Node addon and of the
  WASM module import that package for its classes (GN-6x), and `composer.json` has in `require` the extension
  `ext-<extension name>` and the Composer package of each library that owns a record or a value class among those
  types, because the extension makes and reads instances of the classes of that extension, which PHP loads first. A
  library that only the contract of another library names in another place, such as the type of a member of a class
  that this contract does not take, is in no manifest. `scaffold` reads the contract of a library by the `path` of its
  dependency line, from the core of the library that names it, and the others through `cargo metadata`; when Cargo
  fails, it writes the packages with the libraries that the contract itself names and fails with status 1 and the
  instruction of GN-15f, because the libraries that only a callback unit names are then not known. A line that names the version `=X.Y.Z` or the tag `vX.Y.Z` and no branch or commit
  is the release form, and the manifest names that version (`go.mod` `vX.Y.Z`, GN-15f; `pyproject.toml` the
  dependency `polyspec-<library>==X.Y.Z`; `package.json` and `composer.json` the version `X.Y.Z` of the package). Every other line (a path, a
  branch, a commit, a version range) is a development form, which a repository uses until the library has a release:
  the manifest names the library without the version of a release (`go.mod` `v0.0.0`; `pyproject.toml` the name
  `polyspec-<library>` alone; `package.json` and `composer.json` the package with `*`), and the development checkout
  resolves it through its development links and its development install. No form of the line stops `scaffold`, `generate` or `check`;
  `binding check --release` reports each development form (CK-70). The dependency line of each binding crate on
  `polyspec-binding-core` follows the line of the core on it in the same way: `scaffold` writes the source that the
  core names (its `git` with its `branch` or `tag`, its `version`, or its `path`, which climbs to the place of the
  binding crate) with the features that the binding crate needs, and pins none by itself, so a core that names the
  tag of a release of binding gives binding crates of that release. For a core that names no line on
  `polyspec-binding-core`, such as a core that only passes the values of another library on, `scaffold` writes the
  line of the generator itself: the generator of a release, which was installed at its version and knows no commit of
  itself (docs/spec/contract-check.md CK-20), writes the Git repository of binding at the tag `vX.Y.Z` of its own
  version, a release form; a development generator, which knows its commit (a checkout, a tree that `git archive`
  wrote, an install from Git), writes the Git repository of binding at the development branch `v1/rust-core`, which
  the check of a release reports in each binding crate. The generated code is written for the `binding_core` of the
  generator that writes it (L-2), so the line of the generator is the one line that fits when the core names none. A tracked package that `scaffold` cannot write,
  such as the Go module of a contract that names a record of a library without a Go module, is named with its reason:
  `scaffold` writes the other packages and then fails with status 1, `check` reports it as a finding of CK-19 and
  compares the other packages, and `generate` does not read the tracked packages. Why: the version of a Go module is a
  question of one manifest of one target, so it does not stop the other targets, and what a release may not hold is a
  finding that names the line, which a thrown error did not.
- **GN-3f** Every manifest that `scaffold` writes and that has a licence field carries the licence of the core crate:
  `package.license` of the manifest of the core, or `workspace.package.license` of the root manifest when the core
  names `license.workspace = true`. The Cargo manifest of each binding crate has it as `license`, `pyproject.toml` as
  `project.license`, and `package.json` and `composer.json` as `license`; `go.mod` has no such field. A core that
  names no licence is a finding of `binding check` (CK-71), and `scaffold` then writes the manifests without the
  field. The hand-written manifest of a host package (GN-3b) names the same licence, which `check` reads as an item of
  the host's manifest (CK-19): `project.license` of the host's `pyproject.toml`, and `license` of the host's
  `package.json` and of the host library's `composer.json`. Why: a binding package is the
  core in another language, so it has the licence of the core, and a licence that binding wrote by itself would state
  terms that the repository did not choose.
- **GN-3g** The generated PHP extension registers under the name `php-ext.extension-name` of its `composer.json`
  (GN-3c), `polyspec_<library>`: its module names itself with `ModuleBuilder::name`, because `#[php_module]` of
  ext-php-rs 0.16.4 names a module after the crate, `polyspec-<library>-php-ext`. PHP registers the classes and
  functions of an extension whatever the module is named, so the tests of a binding pass under either name; the
  end-to-end check therefore asks, in each PHP process that runs tests, whether `extension_loaded` is true for the
  `extension-name` of each `composer.json` of the run, and the process fails with the name before a test runs when it
  is not. Why: PIE and a release tool load the binary and ask PHP for the extension by `extension-name`, so an
  extension under another name is installed and reported as not loaded.
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
  may name types the crate does not declare. The generator reads the uses from the tokens of the Rust code, not from
  its words: a string, a comment and an attribute name no helper, and neither does a field (`name:`), a macro of the
  name, an associated item of another path (`Type::name`), or a local of the function around it, which is a
  parameter, a `let`, the pattern of a `for`, of an `if let` or of a match arm, or a parameter of a closure. The
  helpers are groups of items, separated by the blank lines outside every bracket, so a function with a blank line in
  its body and an `impl` block with its methods are each one group. A group is kept when the code, or a group that is
  kept, uses a name that it declares (a function, a trait, a type, a static, a constant or a macro); a group of
  `impl` blocks is kept with the type of the block that it is of, or with its trait when the block is of a type of the
  code; and a group stays when an item of it is named from outside the Rust code that is read, because it is `pub`,
  has an ABI (`extern "C" fn`) or carries an attribute of a macro, or when it declares no name.
  The generated Rust calls none of the methods that the `clippy.toml` of a repository disallows, because each turns an
  error or an absence into a plausible value: `Result::ok`, and `unwrap_or`, `unwrap_or_default`, `unwrap_or_else`,
  `map_or` and `map_or_else` of a `Result` or an `Option`. It matches the value (`match`, `let ... else`) or passes the
  error on with `?`, and an arm that gives nothing or a fixed value carries a comment that states why that is the
  meaning: a poisoned lock or a borrowed table that keeps what it holds until the cleanup of its thread, an exception
  whose kind cannot be read and so is no recognized one, a handle beyond `usize` that names no position. The count of
  a test entry point that does not fit the integer of the language is an error, not the largest integer. No allow
  covers such a call, because an allow would hide the next one; the allow of `clippy::disallowed_methods` stays only
  on the module that holds the expansion of a macro of a dependency, which the generator does not write.
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
- **GN-4c** The names of the functions of a generated crate: `in_<name>` and `out_<name>` are the conversions of
  the units of the contract, where `<name>` is the snake_case name of the unit, and no other function of the crate
  has a name that starts with `in_` or `out_`. The conversions of a unit of another repository, `in_<name>`,
  `out_<name>` and `make_<name>` of a value alias, are functions of the module `library_<library>` of the crate,
  which holds `use super::*;`, and the code of every module names them by their path, `library_<library>::in_<name>`.
  Why: a name that joins the library and the unit with `_` reads in two ways, so the unit `a_b` of the library `c`
  and the unit `b` of the library `c_a` were one function `in_c_a_b`, and an own unit `c_a_b` a third; `::` is in no
  name, so the path reads in one way. The module states its family first, as a function does, because a library
  takes any name, also `std`, `core`, `exports` or the name of a crate that the generated code uses, and a module of
  that bare name would hide the crate or be a second definition of a module of the generated code. A helper
  states its direction last: the conversion of a built-in type is `<type>_in` and `<type>_out` (`text_in`,
  `list_out`), and the helpers of a default, of a callable and of a passthrough are `default_in`, `callable_in` and
  `passed_out`; the helper that makes the function of GN-6z, which the core may keep, is `kept_function_in`, because
  `function_` is the family of the entries and `callable_in` checks the function of a machine (GN-6ae). A new helper
  follows the same rule. Why: a unit takes any name, also `default`, `callable`, `text`,
  `list` or `scope`, and a helper named `in_<word>` is defined a second time in the crate of a contract that has a
  unit of that name, which does not compile. The same holds for every function whose name comes from the contract: a
  name of the contract and a helper of the crate share no name. Such a function states its family first, and no
  helper starts with the prefix of a family: `in_` and `out_` (a unit), `held_` (a class at a parameter), `make_` (a
  value alias), `alias_in_` (the entry of `codec-test`), `recognized_<callback>_<member>`, `error_of_<library>` and
  `failure_of_<library>` (the error of another library, U-7), `check_<unit>` (the check of a value class without
  `core_type`, GN-6af), `alias_round_<unit>` (the entry of the round trip of an alias, GN-13e), and `function_`, the
  entry of a function of a functions unit, to which an attribute gives the name of its language (`#[php(name =
  ...)]`, `#[pyfunction(name = ...)]`, `#[napi(js_name = ...)]`, `#[wasm_bindgen(js_name = ...)]`); the Python entry of a function with an event loop (GN-6ae) is
  `loop_function_<name>`. The members of a class are functions of its `impl` block, which holds no helper. The
  entry takes a prefix rather than a module of its own, because the prefix changes the name of the entry alone,
  where the attribute already gives the name of the language, while a module would change every path from an entry
  to a helper and the form in which each framework registers the entry. The entry of a function or of a member of the Go
  crate is the C symbol of GN-17 (B-8), `<prefix>_<member>` with the module and the class before the member, which
  Go code calls by that name, so its family is `polyspec_`, with which no helper starts. The helper of a
  function parameter of Node and WASM is `callable_in`, as that of PHP and Python is. A function takes any name, also
  `guard`, `pass`, `called`, `throw` or `in`, and an entry of the bare name is a second definition of the helper in
  the Node crate and hides the helper in the module of the exports of the WASM crate. The entry of a member of a
  class of the WASM crate, which has no `impl` block of the class, is the function `member_<member>` of the module
  `class_<unit>` of that module, which holds `use super::*;`, and the release of a class is the function
  `free_<unit>` of the module of the exports, whose export is `__free_<Class>`. Why: a name that joins the class and
  the member with `_` reads in two ways, so the member `new_x` of the class `a` and the member `x` of the class
  `a_new` were one function `class_a_new_x`, and a member `free` was the release `class_<unit>_free` with its export
  `__<Class>_free`; a separator of two underscores is no snake_case name, which the lints deny. The member keeps a
  prefix inside the module of its class, because a member named as a helper, such as `guard`, would hide the helper
  there; no export of a member is `__free_<Class>`, because the name of a class starts with a capital letter. The
  five crates apply the rule. The C symbol of a member of a class of the Go crate is `<prefix>_<unit>__<member>`,
  with two underscores between the class and the member, and its function of package `binding` is
  `<Unit>_<Member>`, with one underscore between the two names in CamelCase; a segment of a module ends with three
  underscores in the symbol and with two in the function of package `binding` (GN-17). Why: the symbol
  `<prefix>_<unit>_<member>` and the function `<Unit><Member>` read in two ways, so the two classes above gave one
  symbol `<prefix>_tag_new_x` and one function `TagNewX`, and the function `x` of the module `tag` gave the symbol
  of the member `x` of the class `tag`. A snake_case name has no empty word, so it holds no two underscores in a
  row, and a name in CamelCase holds no underscore, so each separator is read in one way; the separator of a module
  differs from that of a class, because a function of a module and a member of a class of the root both have two
  names. The symbol is a `#[no_mangle]` function of the C ABI, which the lint `non_snake_case` does not read. The
  release of a class is the symbol `<prefix>__release_<class>` and the function `Release<Class>` of package
  `binding`, which name the class alone: with the words of the module before those of the class, the class `k` of
  the module `tag` and the class `tag_k` of the root had one function `ReleaseTagK`.
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
  | `thrown-count-test` | the count of the entries of the table that keeps what was thrown (GN-6ae), in a crate of a contract in which a member takes a callback or a function type, or which has a value alias | `_thrown_count` | `__thrownCount` | `<namespace>\Internal\thrownCount` | `<prefix>__thrown_count`; WASM `__thrownCount` |

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
  so the feature that this list leaves out keeps the points of that library off, and its cases fail. Such a point is
  armed by the arming of the member (GN-8a), in the five targets alike: a binding crate links one `binding_core` with
  the core of the contract and the core of that library, so the entry of `fault-test` of this crate (`_arm_faults`
  and the names of the table above) arms the point for a member of this contract, the entry point of the member
  installs the arming, and the point reads it where the core of this contract calls the core of that library. The
  binding package of that library is not used for it: its crate links a `binding_core` of its own, whose arming the
  core inside this crate does not read. A point that the call does not reach stays in `_fault_left`, which fails the
  test (GN-13), and `binding check` compares its name with the contract of its library (CK-22). Not generated yet,
  refused by name (G-4): a case that arms a point of another library in a contract without `faults` of its own,
  because the items of GN-8a are written only for a contract with `faults`. A core with
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
  not generated yet, any other field default of a case and a field that holds a class, a callback or a value alias
  of this contract.
  A field of a case holds a unit of another repository (T-3, GN-6c) as a field of a record does: a record with
  fields of built-in types, a value alias or a value class of that repository, also inside a `list`, an `optional`,
  a `map`, a `keyed_map` or a tuple. The conversions of the variant call the conversions of that unit
  (`library_<library>::in_<unit>`, `library_<library>::out_<unit>`, GN-4c) and take what those need: in Node the `in` conversion of every
  record and variant takes the env first, which a value alias and a class read, and in Go the function `encode<Variant>`
  of a variant with a value alias or a callback in a case takes the call of the member first, which walks the value.
  The result form of the case names the unit as GN-6c states for each target.
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
- **GN-6c** A unit of another repository (T-3) is the unit of the package of that repository in every target: the
  package of this contract exports no name of it, a caller and a generated test take it from the package of its
  repository, and the package of this contract needs that package when it loads. A record: Python imports the class
  from that package (which the `pyproject.toml` lists as a dependency), and a generated test imports the module of
  that package as `foreign_<library>` and names the class there; PHP finds the class in the class table by its name
  in the namespace of that repository (its extension is loaded before), and a test names that class; Go imports the
  struct of the package of the Go module of that repository (GN-15f); Node and WASM take and give a plain object,
  which the declarations write by its fields, so they import nothing. Each binding crate depends on that repository's
  crate with the core's own dependency line, which `binding scaffold` copies. Why: a second class of the record in
  the package of this contract would be another type, which a function of the repository of the record refuses, so
  one value could not pass through both packages.
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
  and `E` is the core error. A generated crate names this type by a type alias, `Function` and eight hexadecimal
  digits of the SHA-256 of the type, and writes the type once, in the definition of the alias at the end of the
  crate, because the lints deny the boxed type at a `let` and as the result of a closure
  (`clippy::type_complexity`). The core may keep the function after the call (template `engine.register`), so the form
  is `'static`, `Send` and `Sync`. When the value enters it must be callable (kind `invalid_argument_type`). A call
  converts the arguments out and the result in, and an exception of the language code, or a failure of the binding in
  the call, goes to the core as a `Raised`, as GN-6d states. Python holds the callable in the function and declares
  the parameter as `collections.abc.Callable`. Node, PHP and WASM hold a language value that belongs to one thread and
  one environment, so the function holds it as a `Native` (GN-6u) and declares the parameter as a function type
  (TypeScript `(…) => R`, PHP `\Closure`): a call on a thread other than the owner of the `Native` is kind
  `wrong_thread`, and a call after the cleanup of the owner (the env of Node, the request of PHP) is kind `internal`;
  either goes to the core as a `Raised` whose `Native` holds its `BindingError`, which any thread may hold, because the
  error object of the language is made on the owner thread only, where the failure is converted. Go declares the
  parameter as `func(<parameters>) (<R>, error)`, and as `func(<parameters>) error` for `none`; a nil func is kind
  `invalid_argument_type`. A Go value is bound to no thread, so Go has no kind `wrong_thread` and no feature
  `thread-test`. The func enters as a func of the call and its index in it, and the C ABI asks the export
  `<prefix>__go_keep` for the `cgo.Handle` under which package `binding` holds the dispatch of the func from then
  on, and holds that handle as a `Native` (GN-6u), which outlives the call and whose last drop deletes the handle on
  any thread; a func of a call that fails before the C ABI reads it is held by the call alone, which ends. The
  function calls the func through the export `<prefix>__go_function`, which takes the handle of the `Native` and
  not the handle of a call, because the core calls a kept function in a later call or on a thread of its own; the
  export decodes the arguments, calls the func and encodes its result. The export runs the func in a call of package
  `binding` of its own, which no member made, and the result starts with the handle of that call: the C ABI reads a
  value alias of the result through that call (GN-15c), as it reads the result of a callback through the call of the
  member, and a func of the result through `<prefix>__go_keep`, and then ends the call through the export
  `<prefix>__go_end`; a run that fails ends its call in package `binding`. So the result of a kept function converts as
  the result of the function of the other targets does, by the `in` function of its alias. An error that a member of
  the owner of a value class returns while that call is read (node 12, GN-15c) is kept in the table of no call
  described next, and node 12 names the call 0 and its key, because the member in whose call the function ran returns that
  error after the call of the run ended. The `error` that the func returns, and the
  value of a panic, which the export recovers as a call recovers the panic of a callback (GN-15b), are kept in a
  table of package `binding` behind a mutex, which is the table of no call, under a key that is a count of the
  table, and the `Raised` names that key: the member in whose call the function ran takes the entry out and returns
  the same error value, or panics with the same value after the call of the C ABI returned, and the last drop of a
  `Raised` that no member returned removes the entry through the export `<prefix>__go_release_raised`, on any
  thread, and so does the last drop of a `Raised` of a failure of the binding that names the call 0 and a key. The
  entry point of `thrown-count-test` counts such a `Raised` as any other. A result of a function type holds no
  callback of the call of the run, which ends once the C ABI read the result: a callback unit and the function of a
  machine (GN-6ae) are no result of any type (T-2). The Go test of a member that takes a function
  type requires kind `invalid_argument_type` for a nil func; a function value of a case is a func that answers by
  the rows of the case and records a call that no row answers, which the test requires to be none; with the
  arguments of a case whose function value has a row, which shows that the core calls the func in that call, the
  test requires that the error that the func returns is the error of the call, the same value, and that its panic
  is the panic of the call. For a case whose receiver was given a func with a row in an earlier call and whose
  member names `core.failure`, the test requires the same of that later call, and that the count of
  `thrown-count-test` is 0 after the error. No Go test gives a result of another type, because the Go type of the
  func fixes its result.
- **GN-6aa** A callback inside another type (a field of a record, an item of a list, an `optional`) is taken as
  `Box<dyn <core trait> + 'a>`, where `'a` lasts for the call; `Send` and `Sync` are what the trait requires. A list,
  an `optional` or a record that holds a callback is passed to the core by value, an exception to T-1, because the
  binding makes the value for each call, so it has nothing to keep, and a borrowed list would not let the core call a
  member with the receiver `&mut self`. The core type of a record with a callback field has one lifetime parameter
  (`polyspec_x::Options<'a>`); the contract names it by its path in `core_type`, and the generator writes the lifetime
  where it names the type: `'env` in Node, whose callback lives in the environment of the call, and `'static` in the
  other targets. Such a record is generated where the binding makes it from the arguments of the call, as a record
  parameter (T-4), and refused by name at another place. A callback that the core keeps after the call is `Box<dyn <core trait> + Send + Sync>` (`'static`), which
  Node, PHP and WASM give on the native lifetime as GN-6z states. The contract states it on the parameter whose value
  the core keeps, with `keeps: true` (U-2): the parameter is a callback unit, or a record, a list or an `optional`
  that holds one, and `binding check` reports the attribute at any other parameter (CK-90). The contract has to
  state it, because the lifetime is no part of the path in `core_type` and the generator reads no Rust: for a
  parameter with `keeps` the generator writes `'static` where it names the box and the core type of the record
  (`polyspec_x::Options<'static>`) in every target, and for a parameter without it the lifetime of the call. The
  compiler judges the core (I-2): a core that keeps the value of a parameter without `keeps` does not compile in
  Node, whose box lasts for `'env`. Python, PHP, WASM and Go write `'static` for every callback inside another type,
  so `keeps` changes no text of their crates. Not generated yet (G-4): Node refuses a parameter with `keeps: true` by
  name, because the wrapper of a callback inside another type holds the JavaScript object for the environment of the
  call and none holds it as a `Native` of its owner thread (GN-6u); and no run shows yet that the wrappers of PHP and
  WASM outlive their call, which a contract of the end-to-end check that keeps such a callback has to show.
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
- **GN-6ap** An interface unit of origin `generated` (U-1) is an interface that the core never calls: it names the
  classes of the contract that one parameter takes. Its `core_type` is the Rust type that the core takes at a
  parameter typed by the interface, and for the core type `C` of each class of the contract that `implements` it, an
  implementing class, the core has `impl From<&C> for <core_type>`; whether the core type is an enum of the
  implementing classes or a box of a trait object is behind that `From`, so the contract states only the type and the
  generated crate does not compile when a `From` is missing. A value typed by the interface enters as a parameter of
  a function or of a member of a class, also in an `optional`; at any other place (a return, a field, a list, a
  member of a callback) the type is refused by name. The binding finds the implementing class whose instance the
  language value is, in contract order, reads the value of that instance as a class value inside another type is
  read (GN-6h: read, cloned and released), and gives the core `<core_type as From<&C>>::from` of it; the core type of
  an implementing class is therefore `Clone`, and the parameter names no `core` borrow, because the core takes the
  value. Any other language value is `InvalidArgumentType`, whose `expected` is the language name of the interface.
  The declarations name the interface: PHP an interface that the extension registers, which the entry and the stub of
  each implementing class name with `implements`; Python a class of `abc.ABC` in the types module, with which the
  package registers each implementing class (`<Interface>.register(<Class>)`) and which the stub of the class has as
  its base, because a `Protocol` without a member accepts every value; Node and WASM `export interface <Interface>`
  in the declaration file, which each implementing class names with `implements`; Go an interface with one
  unexported method, so no other package implements it, which the pointer to each implementing class has and `var _
  <Interface> = (*<Class>)(nil)` asserts, and the method gives the position of the class among the implementing
  classes and the handle of the value, which the call encodes. In Go an implementing class is in the module of the
  interface, and another module is refused by name for Go alone. In a case an argument at such a parameter is an
  instance value (GN-13f) of an implementing class, and a test that needs any value takes an instance of the first
  implementing class that has a factory. Refused by name, not generated yet: a generated interface that declares
  members, and a generated interface of another repository. Why: a core that runs on one of several handles takes one
  type for them, and a caller passes the instance it has without a conversion of its own.
- **GN-6aq** A parameter of the type `cancel` (T-1), or of an `optional` of it, takes the cancellation of the
  language, and the core takes a `binding_core::Cancel` by value (an `Option` of it for an `optional`). The generated
  code makes the pair of `binding_core::cancel_pair()`, gives the core the `Cancel`, and binds the `CancelTrigger` to
  the language value, so that the trigger fires when the language value fires and at no other time: a core that keeps
  the `Cancel` after the call (a handle that carries it) is cancelled for as long as the language value lives, and a
  language value that is dropped without firing drops the trigger, which cancels nothing. A language value that has
  fired before the call fires the trigger before the core is called. Any other value is `InvalidArgumentType`. The
  type is a parameter only; at any other place it is refused by name. The language values are those of T-1:
  - Node and WASM: an `AbortSignal`. The binding reads `aborted` and otherwise adds a listener of `abort` with
    `once`, which fires the trigger on the thread of the signal. Another thread cancels by having the owner thread
    call `abort()` of the `AbortController`, because a signal belongs to its thread.
  - Python: a future, an object with `cancelled()` and `add_done_callback` (`asyncio.Future`,
    `concurrent.futures.Future`). The binding reads `cancelled()` and otherwise adds a done callback, which fires the
    trigger when the future is cancelled and not when it has a result. Another thread cancels a
    `concurrent.futures.Future` by `cancel()`, and an `asyncio.Future` by `loop.call_soon_threadsafe(future.cancel)`.
  - Go: a `context.Context`, the first parameter `ctx` of the member (an `optional` is a nil `ctx`). The binding reads
    `ctx.Err()` and otherwise registers `context.AfterFunc`, which fires the trigger on the goroutine that the
    context starts; no goroutine waits or polls. The handle of the trigger is released when the Go value that keeps
    it is unreachable (`runtime.AddCleanup`).
  - PHP: the generated final class `Cancellation` of the root namespace, with `__construct()`, `cancel(): void`,
    which is idempotent, and `isCancelled(): bool`. One PHP process runs no language code while a core call runs, so
    `cancel()` is called between calls: by a signal handler (`pcntl_async_signals`), by a callback of the core, or by
    host code that reads a state shared with another process before a call and calls `cancel()` when that state says
    so. The binding knows no such state; the repository that needs it writes that host code (GN-6ag).
  In a case a value of the type is `{"cancel": "fired"}` or `{"cancel": "open"}` (GN-13, CK-22): the generated test
  makes a language value that has fired, or one that never fires, and passes it. Why: the caller alone cancels, by
  the cancellation that its language already has, and the core observes it through one type.
  Not implemented: the generator refuses a member that takes the type by name (`the type cancel is not generated
  yet`) for every target.
- **GN-6e** A value alias with `core: {in, out}` (U-7) enters as the `HostValue` that the binding describes one level
  at a time (B-1) and the core's `in` function judges through `HostValues`; its failure is the core's kind or the
  exception that language code raised while the core walked the value (a getter, an iterator), thrown again unchanged.
  What a language value is as a `HostValue` is binding's rule: Python takes the exact built-in types (a subclass of
  `int`, `float`, `str` or `bytes` is `Other`), a `str` as its UTF-8 bytes and a `str` that holds a surrogate as its
  code points; WASM takes a string that `isWellFormed` as its UTF-8 bytes and any other string as its UTF-16 units, so
  that a common text crosses the boundary once, as one text (B2.89); Node takes a number as `UntypedNumber`, a bigint as `Int` (its decimal
  token outside `i64`), a string as its UTF-16 units, an Array, a Map, a plain object (prototype `Object.prototype` or
  `null`, own enumerable string keys), a Date, a function, and a typed array or a symbol as `Other`; PHP takes an
  element that is a reference as `PhpReference` with its identity, an array with `array_is_list`, a stdClass under one
  handle at every place of the object, by which the core knows an object that it has seen, and a Closure. A core value leaves as the `OutValue` of the core's `out` function, made by the alias's `out` rows of
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
  - Go holds the `cgo.Handle` of the func of a value alias, or of the dispatch of the func of a function type
    (GN-6z), which the drop deletes on any thread. A `Native` that leaves in a result is node 13 of the result, a
    number that no other node of a result has (11 is GN-6x, 12 is GN-6af).
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
  `in_<alias>` and `out_<alias>` of the module `library_<library>` (GN-4c), so that the aliases of two libraries
  with one name do not meet.
  A failure of `in` is a variant of the owner's error enum: its kind, status and errno are the owner's (`Kinds`), and
  its class is this repository's class of the category that the owner's E-1 gives the variant (E-2), chosen by a
  match over the owner's kinds without a wildcard, so a variant that the owner's contract lacks does not compile
  (I-2 (3)). An exception that language code raised while the owner's core walked the value is thrown again unchanged.
  The binding crate depends on the owner's crate, and the Python package on the owner's package (GN-6c). An alias
  whose owner forwards the kinds of a third library (E-1b (a)) or names two error enums is refused by name (G-4); a
  row that names a class of the owner is generated as GN-6ar states; WASM takes the alias as GN-18b states and Go as GN-15c states. The `in_raises` of an alias of another repository
  give this repository nothing to generate: the cases of the alias, the assertions of its kinds and the entry point
  of the feature `codec-test` (GN-5, GN-13) belong to the binding of the owner, which runs them once, and the crate of
  this repository has that feature only for an alias of its own.
- **GN-6ar** A row of a value alias of another repository may name a class of the owner (U-1, GN-6af): an `out` row
  whose `make` is the public constructor of a public class of the owner, and an `in` row whose language type is such
  a class. The binding makes and reads the instance through the language API of the owner's package, as it calls the
  members of a value class of another repository (GN-6x), and never takes the native object of the owner's binding
  out: Python reads the class from the module of the owner's package, and the JavaScript entry of the Node addon
  hands the classes over when the module loads, after the classes of GN-6x. Out: the constructor has one parameter. A
  bool, an integer or a float of the kind of the row is passed to it (Node: a bool or a float); a keyed map of the
  alias takes the entries of the kind `object` or `map` as a new map of the language (a `dict`, a `Map`), which the
  instance keeps (GN-6af), so the binding makes the instance on the empty map and then gives the map each made entry;
  the alias itself takes the value of the kind `reference`: the binding makes the instance on the null of the
  language and sets the made value through the writable property of the class that has the name of the parameter.
  An object and a reference are therefore made before their content and are the same instance at every position of
  their handle (U-7 (d)), so a cycle through them is made. In: an instance of the class is `HostValue::Value` with
  the kind of the one case of the row, which has no `when`, and `read` of `HostValues` gives the public property that
  the case names: a property of the type bool, an integer or float is the `HostValue` of that type, because a number
  of JavaScript alone does not tell an integer from a float, and any other property is described again by the rules
  of the language. An instance whose property is described again has one handle within one walk of the core (Python
  by its address, Node by a `Map` of the walk); an instance that holds a bool or a number is a value and needs none.
  A row whose type has the name of a class that `only` leaves out for the target (GN-6af) names the type of the
  language there, as the `reference` of PHP does. `package.json` names the npm package of the owner (GN-3e). Refused
  by name (G-4): a member that is no public constructor, a constructor with another parameter, a reference whose
  class has no such writable property, an `in` row with several cases or a `when`, and a `read` that is no public
  property of the class. Not generated yet, refused by name (G-4): the WASM and Go forms, because the WASM module has
  no instance check and constructor call for a class of a row yet and the Go call of GN-15c has no node that makes an
  instance of a class of another module by its constructor; PHP has no such class (GN-6af, CK-78), so a PHP row
  that names one is refused by name too. Why: the owner's core gives and takes the value, and its class of the
  language is the only form in which a user of both packages can pass an instance from one to the other.
- **GN-6as** A conversion of a value alias (U-7), of a value alias of another repository (GN-6k) and of a value class
  of another repository (GN-6x) uses no native stack in proportion to the depth of the value. The function
  `make_<name>`, which makes the value of the language from the `OutValue` of the core, walks the value in a loop
  with a work stack on the heap and never calls itself or a conversion of the alias. The stack holds one level for
  each container whose children are not all made: the handle of the container, its length and the index of its next
  child, the container of the language that takes the made children, and, for an entry of a map, the made key until
  its value is made. A container that a later position may name again (U-7 (d)) is made and kept under its handle
  before its children, so a cycle is made as before; an instance that a member of the owner makes from its made
  children (GN-6x) is made when its last child is made. The children are asked for in the order of the value, each
  entry once, its key made before its value. The binding describes a value of the language one level at a time
  (B-1), so the walk of an incoming value is the loop of the `in` function of the core, and the binding adds no level
  of its own to it. Why: a value within the depth limit that a contract states has the same result on the five
  targets; the binding cannot enlarge the stack of a host, such as the main thread of Node or the stack of a WASM
  module; and a larger stack only moves the depth at which the process ends. Generated for Node and WASM. Not
  generated yet: the make functions of Python, PHP and Go, which still call themselves once for each level.
- **GN-6x** A value class of another repository (T-3, U-1) is taken and given as a value alias of another repository
  (GN-6k), through the two functions that the owner names in the class as `core: {in, out}`, with the core type that
  it names in `core_type` (CK-8); a value class of another repository without them is refused by name (G-4), because a
  description of its instance that the generated code turned into the core value itself would be a second
  implementation of the owner's rules (P-1). In: the parameter takes an instance of the owner's language class,
  imported from the owner's package (T-3); any other value is kind `invalid_argument_type`. The generated code calls
  the `by` member of the `in` row of its language through the language API of the owner, and describes the instance as
  `HostValue::Value` with the kind of the case whose `is` is the result, without opening it. `HostValues::read` of its
  handle calls the `read` member of that case and describes the result one level at a time: a list as a list, each
  item again by these rules (in PHP the array that the `read` member of a case of the kind `list` gives, whose keys
  are 0 to n-1 in order, as `HostValue::List` and not as a PHP array, because the walk of the owner reads the kind
  that the case names); an instance of a generated class of the owner whose `iterate` member yields `{key,
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
  with named arguments skips and the extension cannot tell the two apart. A parameter with a default that another
  parameter or the options record follows is left out in the middle of a call, and each language has one form of
  that call, which the declarations allow and the generated tests write (GN-13d, GN-13e): Python gives every later
  argument as a keyword, and its declaration `name: T = <default>` takes it; PHP gives every later argument as a
  named argument, and its stub `mixed $name = <default>` takes it; Node and WASM give `undefined` in the place of
  the parameter, because an argument of JavaScript has only its place, and the declaration `name?: T` takes it, so
  an options record is never read in the place of a parameter before it; Go gives nil, the pointer of GN-15e. A
  record parameter with the default
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
  `errors.kinds` names no core error is refused by name. A contract that names no kind and takes a value alias or a
  value class of another repository has the function `failure_error` for `binding_core::Failure<()>`: the failure
  function of the owner gives it what language code raised and the failure of a callback, and its kind is the unit,
  which no member gives, so that arm is kind `internal` and calls no conversion of a core error, which such a crate
  does not have (E-1c, GN-6x). The error is matched without a wildcard into the
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
  conversion of its arguments too, does not see the arming around it. A member with `machine` arms each wait of
  its machine instead, with `armed_future("<member id>", …)` (GN-6n), so each entry of a member holds one arming and
  one shield. The `advance` of a `Driven` object of Node and WASM (GN-6ab) is an entry point without a core call of
  its own: its work runs in `shielded(…)`, because language code may call it inside the call of another member, and
  it arms nothing. `_arm_faults(member, faults)` takes
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
  (`Kind::Object_`, `Kind::List_`); the backed value stays the value of the contract. The `php_function` and
  `php_module` expansions of ext-php-rs call `Option::map_or` and
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
  of the listed kinds (T-2), at every place of a type: a parameter, a return, a field of a record or of a case of a
  variant, and an item of a list, a tuple, an optional or another map. The addon reads the `Map` where it judges the
  value: a value that is no `Map` (an array of pairs, a plain object) is kind `invalid_argument_type`, it takes the
  entries in the order of the `Map` and judges each key (a number key that is no safe integer is kind
  `invalid_number` (GN-12a), any other key or value is kind `invalid_argument_type`), and it gives a new `Map` of the
  entries of the core in their order. The entry hands such a value on as it is. Why: the value is converted where
  its type is known, so a map inside another type follows the rule of a whole one. Byte string keys, which a `Map`
  compares by identity, are refused by name at every place (G-4).

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
  - Go calls the core in the cgo call of the member, on the OS thread of the calling goroutine, and the call returns
    when the core returns (B-8). The Go runtime treats a cgo call as a blocking call: the goroutine keeps its thread
    until the call returns, and the runtime runs the other goroutines on other threads, so a call that waits holds one
    OS thread and stops no other goroutine. The entry point of the C ABI takes the locks of its places on that thread
    before the core call and holds them until the result is converted (GN-6h): the class of a member with the receiver
    `&self` that waits is held in `Shared`, so two goroutines wait in one object at the same time, and a call that
    needs a write place of that object while a call waits in it fails with kind `busy`. Go has one form of a function,
    so the member has the name and the results of a member that does not wait, and its caller starts a goroutine where
    it must not wait. No call is cancelled: the token `Io` carries no cancellation, and the type `cancel` is not
    generated (GN-13), so the member takes no `context.Context`.
  - WASM has no such member: the contract gives it `only` without `wasm` (Q-4, CK-15).
  A member with `blocking_io` that reaches language code is generated as GN-6q states. A constructor, a property, an
  iterate or a hook (N-4) that waits is refused by name, because the language has no awaited form of them, or calls a
  hook in its own protocol, which awaits nothing.
  A member with `wait: process_wait` (B-5 (b)) waits until another process acts, so its wait may last as long as that
  process. It passes `binding_core::ProcessWait::for_generated_call()` in the place of the `Io` token and has the
  forms of a member with `blocking_io`, also where it reaches language code (GN-6q), except where that form waits on a
  thread of a pool that other calls share:
  - Python: `a<name>` runs `<name>` on a thread of its own (`threading.Thread`), which gives its result or its
    exception to a future of the running loop through `loop.call_soon_threadsafe`, and not in `asyncio.to_thread`,
    because every `to_thread` of the program shares the threads of the default executor, and a wait that lasts as long
    as a process would hold one of them. A future that was cancelled takes no result. When the loop was closed
    before `<name>` ended, `call_soon_threadsafe` raises `RuntimeError` in that thread: the thread catches that
    failure only while `loop.is_closed()` holds and drops the result or the exception, because nothing awaits the
    future of a closed loop; any other exception leaves the thread. The thread is no daemon thread, so the
    interpreter waits for the call of the core at its end and never ends while the core runs. The generated test of
    each such member keeps the thread of the call from starting until its loop is closed, then starts and joins it,
    and requires that no exception escaped a thread (`threading.excepthook`).
  - Node: the core call runs on a thread of its own (`std::thread`), and its result or error settles the promise on
    the JavaScript thread (`Env::create_deferred`), and not on the libuv pool, whose threads the file system and DNS
    calls of the program share. A panic of the call rejects the promise with kind `internal` (B-7).
  - PHP, Python `<name>` and Go wait on the calling thread, as for `blocking_io`.
  - WASM has no such member, and this is the rule of that target and no gap of the generator: a WebAssembly module
    has no processes and cannot block its one thread, so the contract gives the member `only` without `wasm` (Q-4,
    CK-15).
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
  - Go runs the future in `binding_core::driver::block_on` in the cgo call of the member, on the OS thread of the
    calling goroutine, as PHP does: that thread polls the future, the tasks that the core starts run on the worker
    threads of the runtime, and the call returns when the future ends, so the goroutine keeps its thread as GN-6m
    states. The entry point holds the guards of its places until the result is converted. The runtime is the one of
    the process, which `block_on` makes at the first such call and which lives until the process ends: no object owns
    it, so the release of the last object stops no thread, and a connection that a core keeps is closed by the drop of
    the core value that holds it. No call is cancelled, as GN-6m states.
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
  it and then another member of the same object, which fails with kind `consumed`. Every target generates it: in Go
  and WASM the table of the class keeps the emptied lock under the handle of the object until the object is
  collected, so a later place of that handle is kind `consumed`. Why: a value that the core owns
  after the call cannot be reached through the object again, and the kind tells the caller why the object refuses.
- **GN-6p** A class unit with `cleanup` (B-10) names a method of the unit whose core receiver is `self` (GN-6o) or
  `&mut self`; another member is refused by name. A cleanup with `self` consumes the object, and every later use of it
  is kind `consumed` (GN-6o). A cleanup with `&mut self` leaves the object: the core keeps that the cleanup was made
  and decides what each later member gives, by a kind of its own, and a caller may call the cleanup again, so the
  contract holds a case in which a second call of the cleanup does nothing (CK-76). The generated call of such a
  cleanup marks the lock of the object (`clean` of `binding_core::Exclusive` or `Shared`) when it holds the write
  guard of the receiver, before the core call and whatever the core then gives. The destructor of no target calls the
  cleanup member: a cleanup may wait (`blocking_io`), and a destructor has no place to wait, because PHP frees an
  object inside any statement, Python and Node finalize where the interpreter must not block, the Go runtime runs
  every cleanup function on one goroutine, and the callback of a `FinalizationRegistry` is a task of the event loop.
  The release at destruction is the `Drop` of the core type, which takes no token, and a cleanup that waits is called
  as any member that waits (GN-6m). So the core type of a class with `cleanup` releases in its `Drop` every resource
  that the cleanup member would release, when the cleanup was not called; this is the duty of the core, which the
  contract check does not verify, because it reads no Rust source (CK-76). The binding crate asserts at compile time that the core type of such a unit implements
  `binding_core::Cleanup` and that the core type of every other class unit does not (an ambiguous trait implementation,
  which fails to compile when the type implements it), so that a resource that needs a cleanup call is not missing
  from the contract. When an object whose value was not consumed and whose lock is not marked is destroyed, its destructor drops the core value,
  whose `Drop` releases the resource, and warns that the cleanup call was not made, with the message
  `<Class> was destroyed without <cleanup>(), so its destructor released it (B-10)`:
  - PHP raises `E_WARNING` when the object is freed, and PHP puts the name of the running function before the message
    (`php_error_docref`), so the B-10 test requires a message that ends with it;
  - Python warns with `ResourceWarning` when the object is finalized; the destructor keeps an exception that is being
    raised while it runs (the object may be a temporary of the failed call) and sets it again after the warning, because
    a warning call with an exception set fails;
  - Node emits the warning with `process.emitWarning` and the type `ResourceWarning` when the class is finalized.
  - Go: the function that `runtime.AddCleanup` runs when the struct is collected (GN-15a) releases the value through
    `<prefix>__release_<class>`, which answers whether the lock still held its value, and then warns with `log.Print`
    of the standard logger, whose output a program sets with `log.SetOutput`. Go collects an object at a time that the
    program does not choose, and a program may end before it, so the cleanup member is the explicit release of the
    class; no second member such as `Close` is generated.
  - WASM: the callback of the `FinalizationRegistry` of the ES module (GN-18a) drops the value through
    `__<Class>_free`, which answers whether the lock still held its value, and then warns with `process.emitWarning`
    and the type `ResourceWarning` where the host has that function (Node), as the Node binding does, and with
    `console.warn` where it has not (a browser). An engine may never run the callback, so the cleanup member is the
    explicit release there too.
  G-5 generates for each such unit a B-10 test that makes an object through its sample receiver,
  drops it without the cleanup call and requires the warning, and in PHP and Python a test that calls the cleanup
  member, drops the object and requires no warning: PHP unsets the object under an error handler; Python deletes it
  under `warnings.catch_warnings(record=True)`; Node turns on `gc()` (`v8.setFlagsFromString('--expose-gc')` and
  `vm.runInNewContext('gc')`), calls it and awaits the `warning` event of the process whose message is the warning of its class, because the
  objects of earlier tests warn in the same collection, and WASM does the same with the `gc()` of its test run; Go sets the output of the standard logger to a writer that keeps each message and
  never blocks, because the logger holds its lock while it writes, takes a `weak.Pointer` of the object, calls
  `runtime.GC()` once and fails at once when the weak pointer still gives the object, because the cleanup of an
  object that the collection left never runs; then it reads the messages until the warning of its class, which the
  cleanup of the collected object writes, the objects of earlier tests warning before it. Node, WASM and Go have no test of the absent
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
  - Go calls the core on the thread of the calling goroutine, as GN-6m states, and the core calls a callback through
    the export `<prefix>__go_callback` on that thread (GN-15b), which is the thread that gave the callback, so a
    callback with `thread: owner` is called on its thread as in a call that does not wait. A callback that waits for
    another goroutine holds the locks of its call until it returns.
  - WASM has no such member (GN-6m).
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
  content and is the same instance at every position of its handle (U-7 (d)). Python, Node, WASM and Go generate these
  classes, Go as GN-15c states. PHP generates no such class, because it takes its own `stdClass` and references
  (GN-6e); that is the rule of the target and no state of the generator, so the contract check requires that such a
  class names `only` without PHP (CK-78). PHP makes the form
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
  arguments, so the core path takes each argument by value: a callback as the generated struct (`impl <Trait> +
  'static`), a text as a `String`, and a class parameter only with the borrow `value` (GN-6h); a parameter with a
  default is refused by name (G-4). `resume(io)` advances the machine with the output of its last wait (`None` at the start and after a call)
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
    JavaScript entry, an async function, calls its `advance(settled)` until the machine ends. Each advance gives the
    output of the last wait to the machine, makes its calls on the JavaScript thread and returns `[step, value]`:
    `[0, promise]` for an Io future, which runs on the tokio runtime of napi and which the entry awaits, `[1, value]`
    for a value that the machine awaits (GN-6ae), or `[2, result]` at the end, converted on the JavaScript thread. A
    failure of the member throws from the advance and rejects the promise of the entry.
    The machine outlives the call that made it, so a callback that it owns is the generated struct
    `Owned<Callback>`, which holds a reference of napi (`napi_ref`) to the object and the environment of the
    JavaScript thread, makes the borrowed callback struct from them at each call, and deletes the reference when it
    is dropped, which happens on the JavaScript thread, where the `Driven` object ends.
    An exception of a callback that the machine owns is taken out of the environment
    (`napi_get_and_clear_last_exception`) and held as an `Owned` (GN-6ae) under the key of its `Raised`, because
    the machine goes on after the call and an exception that stays pending fails each later call of Node-API in the
    advance, such as the promise of the next Io future; `failure_error` throws the held value again, so the caller
    gets the same object. An exception that the callback recognizes as an error unit (U-3) is the core error of its
    kind and is not held.
    The callback of a member without a machine holds its exception in the same way, where the callback is called:
    the core may answer the `Raised` and return a value (U-3), and an exception that stayed pending in the environment
    would end that call with it, although the core returned no failure.
  - Go drives the machine in the call of the C ABI with `binding_core::machine::drive`, as PHP does: the calling
    goroutine holds its thread for the call, as every call of the C ABI does, each Io future waits in
    `binding_core::driver::block_on`, and each call of a Go callback goes through cgo, which any thread may make (c6
    6.4), so a callback is called on the thread that gave it (GN-6q).
  - WASM: as for Node, the entry makes the machine on the thread of the module and returns a `Driven` object of the
    module, and the ES entry, an async function, calls its `advance(settled)` until the machine ends and then frees it.
    Each advance gives the output of the last wait to the machine, makes its calls on the thread of the module and
    returns `[0, promise]` for an Io future, the promise of GN-6n, `[1, value]` for a value that the machine awaits
    (GN-6ae), or `[2, result]` at the end. A browser and
    Node run the same steps, because the event loop of JavaScript polls each Io future on the thread of the module in
    both and no tokio runtime is used.
  A method with `machine` takes a clone of its receiver, a parameter of a function type and a result `passthrough`
  are generated, and a function with `async_allowed: true` is awaited, as GN-6ae states. `core.reaches` (c6 6.3) is
  not generated yet (G-4). Why: a future that a runtime polls on its own threads would call language code there,
  against the owner of a Node or PHP reference, and a callback that calls another member with `async_driver` would run
  `block_on` inside the runtime, which tokio refuses; a machine without I/O lets the runtime of each language decide
  where each step runs, and the core keeps its I/O on tokio.
- **GN-6ae** A member with `machine` (GN-6ab) may be a method, take a parameter of a function type (T-2) and return
  `passthrough`, which the scope of a transaction needs: the member calls language code with a class instance that its
  machine made, and returns what that code returned. Defect 86. A function type whose return is `passthrough` is the
  function of this rule and belongs to a member with `machine`; any other function type is the value of GN-6z, which
  the core may keep, and a member with `machine` that takes one is refused by name, because the machine settles what
  its function returned as a `Passthrough`. A case gives the function of this rule as a function fixture and the
  value of GN-6z by its rows (CK-22).
  - Receiver: a method with `machine` names the receiver `&self`, and the generated code gives the core path a clone of
    the value that the instance holds, `Clone::clone(<receiver>)` of the borrow that the lock of the instance gives
    (GN-6h), by value before its arguments, so the core path takes `self`; the core type of
    the class implements `Clone` as a handle whose clones share one state, so the machine owns what it uses and the
    instance stays usable in language code while the machine runs. `&mut self` and `self` are refused by name with
    `machine` (CK-68), because a clone neither writes back nor consumes the instance.
  - Function parameter: the core takes a closure `FnMut(<arguments>) -> Result<binding_core::Passthrough,
    Failure<E>>`, generic in the core path, which the generated code makes from the language function (a Python
    callable, a Node and WASM `Function`, a PHP `callable`, a Go `func` of the generated signature). Its machine calls
    it only from `Machine::call`, on the thread of the language code (GN-6ab). The closure converts each argument out:
    a class argument is the core value that the machine made, which becomes a new instance of the generated class (the
    `tx` that `db.transaction` makes); it calls the function and gives the value that the function returned as a
    `Passthrough`, or an exception of the function as `Failure::Raised`, which the core may answer, by a rollback, and
    then return, so that the caller gets the same exception object.
  - `passthrough`: `binding_core::Passthrough` holds a language value in the table of the binding (B-3) without
    converting it; the core moves it and never reads it. A result `passthrough` of the member returns that value to
    language code unchanged, and a `Passthrough` that the core drops releases its value. A `Passthrough` is not `Send`:
    the table is bound to the thread of its language code, and a value that ended on another thread would release
    nothing there and stay in the table. A handle of the table is a
    count that is never given again, so the handle of a released value names no value and never another value; a
    result whose handle names no value is kind `internal`.
  - `Raised`: a `Raised` is released by its last drop, as GN-6u states for the `Native` that it holds. The core may
    answer a `Raised` and drop it, as a scope does that rolls back and then returns another failure, and what was
    thrown leaves the table of the binding at that drop, on any thread: a drop on the thread of the table removes
    the entry at once, and a drop on another thread, where the core calls a callback of Python or Go from a thread
    of its own while the entry point waits, removes it behind the mutex of the Python and Go tables or queues its
    key for the thread that keeps it (Node, PHP). So no entry point records the `Raised` values of its call, and a
    machine of Node and WASM, which several entry points advance, keeps no list of them. A function of a machine
    makes its `Raised` by the function that a callback uses (`thrown`), and `failure_error` takes what was thrown
    out of the table by the key of the `Raised`. The entry point of the feature `thrown-count-test` (GN-5) gives the
    count of the entries of the table, in Node and PHP after it has removed the queued keys. The generated test of
    every case of a member that takes a callback or a function type requires, after the call of the case and the
    calls of its `after`, that the count is 0; the Go test of the count is in `zz_generated_thrown_count_test.go` with
    the build tag `polyspec_thrown_count_test` and runs the call of each such case again, and a case that arms faults
    is in `zz_generated_thrown_count_fault_test.go`, which also needs `polyspec_fault_test`.
  - PHP: the parameter takes a `callable` (`is_callable`; any other value is kind `invalid_callback`), declared in the
    stub as `@param callable(<parameters>): mixed`, and the result is `mixed`. The closure keeps a reference to the
    callable and calls it through `ZendCallable`; an exception of its code is taken from the executor and kept as the
    `Raised` of U-3, so `failure_error` throws the same object again. The table of the values is a thread-local map
    from a handle to a `Zval`; the release function takes the value out of the table and ends it after the table is
    released, because the destructor of a PHP value may run PHP code that enters the binding again.
  - Python: the parameter takes a callable (`callable()`; any other value is kind `invalid_callback`), declared in
    `_native.pyi` as `Callable[[<parameters>], object]`, and the result is `object`. The closure keeps a reference to
    the callable and calls it with the GIL of the thread on which the machine calls it (`Python::attach`); an
    exception of its code is kept as the `Raised` of U-3, so the caller gets the same exception object. The table of
    the values is a thread-local map from a handle to a `Py<PyAny>`: the machine runs on the thread of its call from
    its start to its end, `<name>` on the thread of the caller and `a<name>` on its worker thread, so a value enters
    and leaves the table of one thread, and a released value ends with the GIL. A member whose function may return an
    awaitable has the entry `_<name>_on_loop(<event loop>, /, <parameters>)`: `<name>` calls it with no loop, and
    `a<name>` is a coroutine that runs it in `asyncio.to_thread` with the running event loop of its caller. The
    driver asks `inspect.isawaitable` of each value that the function returned: a value that is no awaitable is
    settled at once; an awaitable is wrapped in a coroutine, given to that loop with
    `asyncio.run_coroutine_threadsafe`, and the worker thread waits for the outcome of its future, which releases the
    GIL; without a loop a coroutine is closed, so that Python does not warn that it was never awaited, and the call
    fails with kind `invalid_callback`. The two coroutine functions are a module that the crate makes from its own
    source when it first needs one, because Rust code writes no `async def`.
  - Go: the parameter is a Go `func` of the generated signature, `func(<parameters>) (any, error)`, and the result
    `passthrough` is `any`, because a method of Go has no type parameter. A nil `func` is kind `invalid_callback`. The
    function enters as a callback of the call (GN-15b), the handle of the call (`cgo.Handle`) and its index in it, and
    the closure of the C ABI calls it through the export `<prefix>__go_callback`, the trampoline of every Go
    callback. It runs on the goroutine of the member, on its thread: the goroutine holds its thread for the call of
    the C ABI, `machine::drive` makes each call of the machine there (GN-6ab), and Go runs an exported function on the
    thread that calls it, so no `Passthrough` leaves the thread that made it. The dispatch of the function decodes
    each argument, a class argument as a new instance around the handle that the closure wrote (GN-15a), calls the
    function and holds what it returned in the table of package `binding`: a map from a handle to the value behind a
    mutex, which keeps the value reachable for the garbage collector until its `Passthrough` ends, and whose handle
    is a count of the table. The closure makes the `Passthrough` of that handle; its release function removes the
    value through the export `<prefix>__go_release_passed`, on any thread, because a Go value is bound to no thread.
    A result `passthrough` crosses the C ABI as its handle, and the member takes the value out of the table. An
    `error` that the function returns is kept by the call under its index and is the `Raised` of U-3 (GN-15b), so the
    member returns the same error value. A panic of the function is recovered by the call, as the panic of a method of a callback
    is (GN-15b), because a panic that
    unwinds through the frames of the C ABI skips the destructors of the core, its guards and its machine: the call
    keeps the value of the panic as the `Raised`, the core ends as for an error, and the member panics with the same
    value after the call of the C ABI returned.
  - Node: the parameter takes a function (a value whose `typeof` is `function`; any other value is kind
    `invalid_callback`), and the declarations name each `passthrough` as a type parameter of the member,
    `transaction<T>(work: (arg0: Scope) => T): Promise<Awaited<T>>`: the entry is an async function, so its promise
    takes the state of a result that is a thenable. The machine owns the function as an `Owned` (GN-6ab), whose
    reference of napi is deleted on the JavaScript thread, where the `Driven` object ends, and the closure calls it
    with `napi_call_function` and the receiver `undefined`. An `Owned` of a value of the table and of an exception
    holds its value as the one element of an array, because Node-API version 8 makes a reference only to an object, a
    function or a symbol, while a function returns and throws any value. An exception of the
    function is taken out of the environment (`napi_get_and_clear_last_exception`) and held as such an `Owned` under
    the key of its `Raised`, because the machine goes on after the call and no promise of an Io future can be made
    while an exception is pending; `failure_error` throws the held value again (`napi_throw`), so the caller gets the
    same object. The table of the values is a thread-local map from a handle to an `Owned`; the release function
    removes the entry, and its drop deletes the reference.
    Await: `[1, value]` of an advance is the value of a `Step::Await`, which leaves the table. The function `drive`
    of the JavaScript entry awaits it, a value that is no thenable included, and gives the outcome to the next advance
    as `settled`, `[true, <value>]` or `[false, <rejection>]`: that advance stores the value in the table again, or
    holds the rejection as a `Raised`, and calls `Driving::settle` before the machine resumes. `settled` is
    `undefined` at the start and after a wait, and an advance that gets an outcome while its machine awaits no value,
    or none while it awaits one, is kind `internal`. `drive` tells the promise of an Io future from an awaited value
    by the step of the advance that returned it and never by the value: a rejection of the promise of step `0` is a
    failure of the binding (a panic of a poll, kind `internal`), which `drive` does not catch, so it rejects the
    promise of the entry and the machine is not advanced again; a rejection of the value of step `1` is the outcome
    of the function, which goes to the machine, and the core decides what it means.
  - WASM: the parameter takes a function (any other value is kind `invalid_callback`), and the declarations are those
    of Node. The machine owns the function as a `js_sys::Function`, a value of the module that lives until the ES
    entry frees the `Driven` object, and the closure calls it with `apply` and the receiver `undefined`, on the thread
    of the module. An exception of the function is the value that the call gives back to the module (the import
    catches it, GN-18b), kept under the key of its `Raised`, so the caller gets the same value. The table of the
    values is a thread-local map from a handle to a `JsValue`; the release function removes the entry. Await: as for
    Node, `[1, value]` of an advance is the value of a `Step::Await`, which leaves the table; the function `drive` of
    the ES module awaits it, a value that is no thenable included, and gives `[true, <value>]` or `[false,
    <rejection>]` to the next advance, which stores the value in the table again, or keeps the rejection as a
    `Raised`, and calls `Driving::settle` before the machine resumes; an advance that gets an outcome while its machine
    awaits no value, or none while it awaits one, is kind `internal`. `drive` tells the promise of an Io future from
    an awaited value by the step of the advance, as for Node: a rejection of the promise of step `0` rejects the
    promise of the entry and the machine is freed without another advance. Each advance runs through `state.mjs`
    (GN-18), also the advance in which the function calls a member of the module again.
  - `async_allowed: true`: the function may return an awaitable, which `Step::Await(Passthrough)` of the machine gives
    to the driver after its call; the driver gives the outcome to `Machine::settle(Result<Passthrough, Raised>)` before
    the next `resume`. Node and WASM await the value in their JavaScript entry, as their items below state. Python:
    `a<name>`
    awaits a coroutine or another awaitable on the event loop of the caller with `asyncio.run_coroutine_threadsafe`
    from its worker thread, and `<name>` gives an awaitable result kind `invalid_callback` with the message that names
    `a<name>`, because no event loop of the caller runs. PHP and Go have no awaitable: the driver settles the value at
    once, so a PHP or Go function returns its result.
  - Case: an argument of a function type is a function fixture, `{"function": {"calls": [<step>], "result": <case
    value>}}` or with `"raise"` in place of `"result"`: the generated function makes each step on its arguments in
    order, `{"on": "<position>", "call": "<member id>", "args": {...}}`, where `on` is the position of the parameter
    (`"0"`, `"1"`, ...; CK-22) and an argument of a function type of a step is again a function fixture; a step that names `result` requires
    that its call returns that value (CK-22), by an assertion of the test, whose failure is an exception of the
    function. The function then returns `result`, raises the error unit of `raise` (GN-13) or, with
    `"raise": "exception"`, raises an exception of the language, which the case expects by `raises: "callback"`.
    `after` (CK-22) observes the receiver after the call, so a case shows a commit, a rollback after a raise and a
    nested scope. A fixture with `"awaits": true` (CK-22) is a function that returns an awaitable: a Python `async
    def` and a Node and WASM `async` function, whose steps run when the binding awaits the awaitable and whose
    `result` or `raise` is the outcome of that awaitable; a step of such a function awaits the call of a member that
    waits (`await <argument>.a<name>(...)` in Python), and the Python test of the case calls `a<name>` on an event
    loop. PHP and Go have no awaitable, so there the same fixture is a plain function, whose value the driver
    settles at once: a case with the marker runs on the five targets and requires the same result, exception and
    `after` on each.
  The five targets generate the member. The PHP and Python tests write the function fixture, the test of a
  case with `raises: "callback"`, which requires the same exception object, the calls of `after`, and a test that a
  value that is no callable is kind `invalid_callback`. A Python function fixture
  is a function of the test module, because a lambda holds no statement, and the Python test also requires that
  `<name>` given a function that returns an awaitable is kind `invalid_callback` with a message that names
  `a<name>`. The Go test writes the function fixture as a `func` whose steps return their
  error, and a step that names `result` returns an error that names its member when the call returned another value;
  a fixture with `"awaits": true` is the same `func`; it writes the test of a case with `raises: "callback"`, whose `func` returns the error value that the test holds and
  which requires that same value, the calls of `after`, and for each parameter of a function type a test that a nil
  `func` is kind `invalid_callback`, a test that the member returns the error value that the `func` returned, and a
  test that the member panics with the value of a panic of the `func`; package `binding` tests that a handle of its
  table is not given again and that a result whose handle names no value is kind `internal`. A function fixture that
  raises an error unit fails its Go test by name, because no function recognizes an error yet. The Node test and the WASM test write the same tests as the PHP test, with a value that is no function for the value that is no callable. The function of a Node or WASM fixture is an arrow function, whose step that
  names a result requires it with `assert.deepStrictEqual` inside the function, an async one when the fixture names
  `awaits` or a step of it calls a member that waits,
  so the nested case of the sample runs the awaited step with a promise and its other cases with a value that is no
  thenable. The contract of the end-to-end sample
  holds `store` and `scope`, so the end-to-end check of the sample names each target that refuses them as failed
  until that target generates them (GN-14c).
  The end-to-end sample has the class `store`, whose `transaction` takes a function of a `scope` and returns
  `passthrough`, and the class `scope`, whose `put` and `get` write and read the pending entries and whose `nested`
  takes a function of an inner `scope`; its cases commit, roll back after a raise, and nest. The function `scoped`
  of its functions unit and the static member `store.once` take the same function, over entries that end with the
  call, and their cases return, raise and await, so the end-to-end check compiles and runs the entry of each kind of
  member that takes a function: a method, a function and a static member. Why: a transaction is a
  scope that the core opens, hands to language code and closes after that code returns, so the core decides when the
  language code runs and what its failure means, and the machine keeps the I/O of the scope on tokio (GN-6ab).
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
  directory of the library is the one of the platform inside the Go module, which a release fills (GN-15g), and a
  checkout, whose tree holds no library, gives the directory of its build by `CGO_LDFLAGS=-L<dir>`. A parameter is lower camel case; one that
  is a Go keyword, a name of the generated body or the package name of a module of the contract takes a trailing `_`.
- **GN-15a** Go class units (T-5, GN-6h): a class unit is the struct `<Class>` of the package of its module, which
  holds a handle of the C ABI in an unexported reference; the C ABI keeps the core value in a table under that handle
  (handle 0 is no value, kind `invalid_argument_type`) behind the lock of GN-6h, and `runtime.AddCleanup` releases it
  through `<prefix>__release_<class>` when Go collects the struct; the reference holds a pointer, because the cleanup
  of an object without one, which shares its allocation block with other small objects, runs only when every object
  of the block is unreachable. A constructor is `New<Class>` (none when
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
  A panic of a method is recovered by the call (`Call.run`), which runs every Go callback and every Go `func`
  (GN-6ae), because a panic that unwinds through the frames of the C ABI skips the destructors of the core, its
  guards and the locks of the places (GN-6h), so an instance that the member borrowed would stay locked: the call
  keeps the value of the panic as the `Raised` of U-3, the core ends as for an error, and the member panics with the
  same value after the call of the C ABI returned. The Go test of a member that takes a callback requires that
  value at the caller, that the member runs again on the same instance, and that a member that writes the instance
  is not kind `busy` after the panic.
- **GN-15c** Go value aliases (U-7, T-3): a value alias, also of another repository, is `any`. The C ABI reads the Go
  value through questions to the export `<prefix>__go_host` (its kind, its items, the keys of a map in the order of
  `fmt.Sprint`), so the `in` function of the core walks the value without a copy; a kind of the `in` function is the
  error of its category, for an alias of another repository by the E-1 of its owner. A core value leaves as the Go
  value of the first `out` row of a built-in form: `nil`, `bool`, `int64`, `float64`, `string`, `[]byte`, `[]any`,
  `map[string]any`, or `*KeyedMap[any]`. Package binding describes an integer of any Go integer type, and a `*big.Int`:
  one in `int64` as an integer, and one beyond it (a `uint64` above `math.MaxInt64`, a `*big.Int` outside `int64`)
  as its decimal text, which the core reads as `HostValue::Number`, the token that Python and JavaScript describe for
  such an integer. A row that makes the value by a member (GN-6e) gives the instance of the
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
  function judges it. A value class without `core_type` (GN-6af) is a struct `<Class>` of `internal/binding`, which the package
  of its module names as an alias, because package binding describes and makes its instances and does not import
  that package. A writable property is an exported field of the struct, and a property that is not writable is an
  unexported field with a method of its name. `New<Class>` takes each parameter by its Go type (`any`, `[]any`,
  `*KeyedMap[any]`). A parameter with a default has no pointer form (GN-15e): its nil is the argument left out,
  because nil is the null of Go and a nil list or keyed map is empty, which is what the defaults of GN-6af give; the
  instance then keeps nil, a new empty slice or a new empty `*KeyedMap[any]`. The constructor writes the call and, per
  parameter, the description of the value, of each item of a list, or of each key and value of a keyed map, to an
  entry of the C ABI, which calls the judging function of the core and returns nothing. Package binding describes a
  pointer to such a struct by the `in` row of the class for Go as node 11 with the kind of the row and a handle,
  which is the same for the same pointer within one call, and the question read (op 2) of that handle describes the
  kept value of the property that the row names. A `*KeyedMap[any]` is described as a map of its entries in their
  order, each key an integer, a text or a byte string. An `out` row whose make names the constructor is node 12 of
  the result with the number of the class among the value classes without `core_type` of the contract, then the
  value of a reference, or the count and the entries of an object or a map. Package binding makes the struct before
  it reads the content, and a later position of the same handle is node 8, so it is the same pointer. A value class
  whose Go name is the name of a type of package binding is refused by name. The generated tests run the cases of
  the constructor and of the properties, read a property on an instance that the constructor makes, and compare a
  result that holds such instances by `reflect.DeepEqual` and by the order in which each pointer first appears, so a
  result that holds two instances where the case names one fails. A map, a keyed map, a repeated list and an
  instance of a case value are locals that statements of the test make and fill, because `gofmt` keeps a function
  literal on one line only while it is short, and the end-to-end check fails a generated file that `gofmt` would
  change.
- **GN-15d** Go error units (E-2, E-7, I-3): an error unit is a struct `<Unit>` of `internal/binding` that embeds a
  pointer to its parent (its parent unit, or the category type), so `errors.As` finds the parent and the category
  through `Unwrap`; package `errors` names it as an alias, and each property is a method that returns the value that
  the C ABI read from the core error. A kind whose row names the unit is created as that struct.
- **GN-15e** Go `source` and defaults (T-1, U-2, T-4): a `source` parameter is a `[]byte`, which holds the bytes of a
  text too, and its bytes go to the core. A parameter or record field with a default is a pointer `*T`: nil leaves
  it out, and the core decides its value. An `optional` type with a default keeps its one pointer `*T`, because nil
  already means no value (GN-6i). A Go type that is a pointer whose nil is no value of the type takes no second
  pointer, as an `optional` and as a parameter or field with a default: a `map<T>` (`*Map[T]`), a `keyed_map<T>`
  (`*KeyedMap[T]`), an instance of a class (`*<Class>`) and a value class of another repository (GN-6x). Its nil is
  the missing value, and the C ABI writes the tag of an absent value for it, so `optional<keyed_map<T>>` is
  `*KeyedMap[T]`. An `optional` of an `optional` keeps its second pointer, because the nil of the inner pointer is a
  value of the outer type.
- **GN-15f** Go records of another repository (T-3, GN-6c): a record of another repository is the struct `<Record>` of the package of its
  module in the Go module of that repository, the module of `packages.go` of its contract, which the package imports
  by its package name; the C ABI writes and reads it field by field as a record of this repository, through
  `library_<library>::in_<record>` and `library_<library>::out_<record>` (GN-4c); a record of another repository with a field of a unit type, and
  one whose package has the name of a package of this repository, are refused by name. A library whose contract names no
  Go module (`packages.go`) refuses the Go target of `generate` with the library and that reason, and the other
  targets are generated (GN-1c), as `scaffold` names the Go module alone as not written (GN-3e). `binding scaffold` reads the contract of each library that the
  contract names, as `binding generate` does: the contract of a `path` dependency of the core is the `interface.json`
  of that path, which needs no Cargo, and the contract of any other dependency is found through `cargo metadata`.
  `cargo metadata` resolves the workspace, so it fails where Cargo cannot resolve it: without network for a Git
  dependency that the machine has not fetched, or for a manifest that names a crate that no longer exists. `scaffold`
  then names the Go module as not written (GN-3e), with the status of Cargo and the instruction to run the install
  target of the repository that fetches the crates of its `Cargo.lock` (`cargo fetch --locked`) and to run `scaffold`
  again, and writes the packages of the other targets, which do not read those contracts; `check` and `generate` read
  them for every target, so they fail with the same instruction. For
  each library whose records or value classes (GN-6x) the contract names, or the members of a callback unit of
  another library that the contract takes name (GN-3e), it writes a line `require <module> <version>`
  in `go.mod`, because the Go binding imports the package of each (B2.87): the version
  is `vX.Y.Z` when the dependency line of the core on `polyspec-<library>` names the version `=X.Y.Z` or the tag
  `vX.Y.Z`; a `path` dependency gives `v0.0.0` and a line `replace <module> => <path>` from the Go module of this
  repository to the Go module of that one; every other dependency line (a branch, a commit, a version
  range) is a development form too (GN-3e) and gives `v0.0.0` without a `replace` line, which the development
  checkout resolves through its development link, an untracked `go.work` that names the checkout of that repository
  (`make link` of kit writes it). The Go program then also links the static library of that repository, which the
  end-to-end run builds into the same directory as the one of this repository (GN-14).
- **GN-15g** The static library of the Go module (B-8, L-1, K-3): the platforms of a Go module are `linux_amd64`
  and `linux_arm64`, whose library is built for the GNU C library (`<arch>-unknown-linux-gnu`), `linux_amd64_musl`
  and `linux_arm64_musl`, whose library is built for musl (`<arch>-unknown-linux-musl`), and `darwin_arm64`; the
  platforms without `_musl` are the `<GOOS>_<GOARCH>` of the platforms of GN-3c. A library of the GNU C library does
  not link with musl, which does not define some of the symbols that it names, so a Linux machine of each C library
  needs a library of its own. A build constraint of Go does not tell the C library of a Linux apart, so the build tag
  `musl` selects the library of musl: a consumer on musl builds with `go build -tags musl` (and `go test -tags musl`),
  and a consumer on the GNU C library builds without it. Why a tag and not another way: Go reads no fact of the C
  library before it compiles, and a cgo directive is no C preprocessor line, so no file can name the directory of a
  library by the C library that the C compiler finds; the tag is the one choice that a consumer gives Go.
  For each platform `binding generate` writes two files. `internal/binding/zz_generated_link_<file>.go` holds the
  directive `#cgo LDFLAGS: -L${SRCDIR}/../ffi/lib/<platform>` and imports the package `internal/ffi/lib/<platform>`;
  `<file>` is the platform, except `musl_linux_<arch>` for `linux_<arch>_musl`, so Go compiles each file for its
  `<GOOS>_<GOARCH>` alone by its name. The file of `linux_<arch>` has the constraint `//go:build !musl` and the file of
  `linux_<arch>_musl` the constraint `//go:build musl`, so a build compiles one of them. The preamble of each Linux
  file checks the C library that the C compiler of cgo finds, before the link: the file of the GNU C library includes
  `<stdlib.h>` and stops the C compiler with `#error` when `__GLIBC__` is not defined, with a message that names the
  Go module, the library, the platform and the remedy `go build -tags musl`; the file of musl stops it when
  `__GLIBC__` is defined, with the remedy to build without the tag `musl`. So a consumer that gives the wrong tag gets
  that message in place of the undefined symbols of a link. `internal/ffi/lib/<platform>/zz_generated_lib.go` is the
  one file of that package. The library of a platform is `internal/ffi/lib/<platform>/libpolyspec_<repository>_go.a`, beside that
  file. Why the directory is a package that the binding imports: `go mod vendor` copies only the directories of the
  packages that a build imports, so a consumer that vendors its modules gets the library of every platform, and the
  directory of the directive exists in a tree without a library. No tracked tree holds a library or a generated
  file. A checkout builds its library and names its directory by `CGO_LDFLAGS` (GN-14), which the linker searches
  before the directory of the directive.
  A release carries the Go module, because Go fetches a module as the source of a tag. From the commit of the tag
  `vX.Y.Z` the release tooling writes the files of `binding generate` for the target go, builds the crate
  `polyspec-<repository>-go` for each platform with the release profile and without a feature (the library of
  `linux_<arch>_musl` with `--target <arch>-unknown-linux-musl` on the Linux machine of that arch, whose Rust
  toolchain lists that target in `rust-toolchain.toml`; a static library needs no linker, so no C compiler of musl
  takes part), removes the debug
  sections of each library with `llvm-strip --strip-debug` of the component `llvm-tools` of the Rust toolchain that
  the repository pins (the `strip` of a Cargo profile does not change a static library, whose third is the debug
  sections of the Rust standard library), and creates one
  commit whose parent is that commit and whose tree adds, below the directory of the Go module, those generated
  files and the library of each platform. It tags that commit `<directory of the Go module>/vX.Y.Z`
  (`packages/go/vX.Y.Z`), the tag that Go reads for a module in a subdirectory of its repository. It creates no
  commit and no tag when the library of a platform is missing, holds a test entry point (GN-13b) or holds a debug
  section. No branch holds
  the commit, and no such commit or tag is made by hand. A consumer needs the line `require <module> vX.Y.Z` alone:
  no `CGO_LDFLAGS` and no `replace`, and its `go.sum` pins the module with its libraries. A build for another
  platform compiles no file that names a directory, so its link fails with the library that is not found.
  A program that imports the Go modules of several libraries (GN-15f) links the static library of each, and each
  holds its own copy of `binding_core` and of the Rust standard library. The end-to-end check builds and tests such
  a program in the released form on the platform of its run (GN-14f), which is the evidence that the copies link in
  one program. It has run on `darwin_arm64` and on `linux_arm64`.
- **GN-15h** The Go packages of a generation hold only the helpers that the contract uses. Package `binding` writes a
  method of `Writer` or `Reader` (`Bool`, `Tag`, `Uint`, `Int`, `Float`, `Len`, `Text`, `Bytes`, `Key`) only when the Go
  code of the generation calls it through a value of its type, and the type `Key` with `IntKey`, `BytesKey`, `TextKey`
  and its methods, and the type `KeyedMap` with its methods, only when that code names them; an import that only a
  dropped helper used is dropped with it. The generator reads the uses from the generated Go code without its comments
  and the contents of its literals, and repeats until no further helper is kept, because a kept helper may call
  another. The generated code calls a method of a `Writer` only through a value named `enc`, `tenc` or `w` and a
  method of a `Reader` only through a value named `dec`, `r` or `properties`; a call of the same name through another
  value is a method of another type, such as a member of a class of the contract (`made0.Key`) or of a
  `reflect.Value` (`v.Float`), and no use of a helper. Why: a function that no main package and no test reaches fails the
  deadcode and unused lints of the repository that consumes the module, and that repository cannot change a generated
  file. A contract without a `keyed_map<T>` therefore gets no keyed-map helper.
- **GN-15i** The Go static library is built without link-time optimization: `[profile.release]` of the root manifest
  and of `.cargo/config.toml` of a repository with the target `go` turns on no `lto` (absent, `false` or `"off"`),
  and `binding check` reports any other value (CK-91). Why: LTO puts the standard library and `binding_core` into the
  one object of the static library, so a Go program that links the static libraries of two repositories, which a
  contract that names the types of another repository makes (GN-15f), fails with duplicate symbols such as
  `rust_eh_personality`; without LTO each copy is a member of its own archive, which the linker takes only when a
  symbol is missing, and the copies link in one program (GN-14f).
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
- **GN-17** The C ABI (B-8): each function is `<symbol>(args, len, result) -> int32`, where `<prefix>` is
  `polyspec_<repository>` and `<symbol>` is `<prefix>_`, then each segment of the module of the unit in snake_case
  followed by `___`, then for a member of a class the name of the class followed by `__`, then the name of the
  member, `new` for the constructor: `<prefix>_<function>`, `<prefix>_<unit>__<member>`,
  `<prefix>_<segment>___<function>` and `<prefix>_<segment>___<unit>__<member>`. The function of package `binding`
  that calls it has the same parts in CamelCase with one underscore less in each separator: `<Function>`,
  `<Unit>_<Member>`, `<Segment>__<Function>` and `<Segment>__<Unit>_<Member>`. No two names of the contract are
  joined by one underscore, so no two members of a contract have one symbol or one function (GN-4c).
  Go encodes the arguments into one buffer in parameter order: a bool or a presence tag one byte 0 or 1, a number eight
  bytes little endian (int64 two's complement, float64 its IEEE 754 bits), a string or byte slice its length (eight
  bytes) and bytes, a list its length and items, a record its fields in contract order, an enum its value text. The C
  ABI decodes and judges them (T-8), and the arguments must end where the last parameter ends; the core's result, or
  the failure (category index of E-1, message, kind, status, errno), is encoded the same way into a buffer that Rust
  allocates, writes into `result` and Go frees with `polyspec_<repository>__free`; the return is 0 for a result and 1
  for a failure. A buffer that does not follow the encoding is kind `internal`. The symbols that are not members
  (`__free`, `__panic_test`, `__echo_<type>`) have two underscores after the prefix, which no symbol of a member has, because a name of the contract follows the one underscore after its prefix. Every function runs under
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
  `cleanup` (B-10) and a method with the receiver `self` are generated as GN-6o and GN-6p state.
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
  any other place is the same list of pairs. A case value of a value class of another repository (GN-6x), at a
  parameter, in a list and in a field, is written by the same rule in the five targets, with the members of the
  owner's contract that the out rows of the language name and through the owner's package, which the test imports
  (the Go module of the owner in Go, where each made value is a local of the test whose error fails it): the content
  of a kind is the value of the one parameter of its member, a text for `number` and the list of the UTF-16 code units
  for `text16`; a key of a pair is a text or a case value `{kind, value}` of the class; and `{"kind": "list",
  "repeat": n, "value": <value>}` is the member of `list` called n times, each on the list of the one value before
  it. No built-in value of the language stands at the place of such a class, because the binding refuses it as
  `invalid_argument_type` and Go does not compile it. A result that holds an instance of such a class has no case
  value to be compared with, and its case has a test that fails with that reason (GN-13e). A kind that no row makes by such a member (a member of two parameters, a built-in form, or
  two rows of the kind that name two members) is not written. A case whose receiver or argument the generator does not
  write has a test that fails with the reason, the case and the member, and the other tests of the target are written
  (G-4, GN-13e); every other value that no test can make, such as the placeholder of a class that no member without
  a receiver makes, is a refusal of the target by name, and the generator ends with no exception that names no item.
  The placeholder of a class is the instance that the first constructor or static member of the class that returns it
  makes, or, for a class without one, the first function and then the first static member of another class that
  returns it, each with placeholder arguments, as `new` of GN-13f names any member that returns the class (template
  `bind`, which makes `bound_map`). A method is not taken, because it needs an instance of its own class first.
  A value of the type `cancel` is `{"cancel": "fired"}`, a cancellation that fired before the call, or
  `{"cancel": "open"}`, one that does not fire (CK-22), which the generated test gives as GN-6aq states.
  The end-to-end check fails a run in which a case was left out. A `keyed_map` parameter whose contract does not list
  every key kind is tested with a key of a missing kind as kind `invalid_argument_type`; a case gives a keyed map as
  that array of `[key, value]`. A case gives a `map<T>` as an object of its entries, or as an array of `[key, value]`
  whose keys are texts: an object of JSON gives a key that is an integer before its other keys, so a case whose order
  matters gives the array, and the test makes the entries in that order; an entry of another form is refused by name
  (G-4), and `binding check` judges the items of both forms (CK-64). The members of a
  class have the same tests; a method or property is called on an instance that a factory of the class (a static
  member or the constructor that returns it) makes from the case's keys of that factory's parameters, and the B-2, B-3
  and G-7 tests of a method use the factory arguments of the first case of the class that does not raise. A value
  class without `core_type` (GN-6af) is such a class in Python, Node and WASM: its constructor and its properties have
  these tests, and a property is read on an instance that the constructor makes from the case's keys of its
  parameters; Go runs the cases of the constructor and of the properties as GN-15c states. A member
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
  fixture, and a function as the function fixture of GN-6ae. `binding check` judges the form (CK-22). The B-4 test of a member that takes a callback runs its raising cases
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
  `in` function alone; each case of the alias (CK-22) calls it with the case's `value` and requires the exact class of the
  kind, the class of the error unit that its row names or else of its category (E-2), and the kind. Each member with a parameter that is the alias, an optional of it or a list of it has
  one more test: the value of the alias's first case at that place, as the parameter or as the one item of the list,
  with placeholders for the other arguments, gives the same class and kind through the member. A case gives a value
  of a value type as `{"kind", "value"}` of the kinds `null`, `bool`, `int` (a number, or its decimal text outside the
  safe integers: a Node `bigint`, a Python `int`), `float`, `text`, `bytes`, `list` and `map`, each as the value that
  the built-in form of the kind makes; PHP gives the least int as `\PHP_INT_MIN`, because PHP reads
  `-9223372036854775808` as the negation of a float. A value of the language that is no value of the value type is `{"host": <sort>}`
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
  inside it again; PHP makes it from the innermost out with `(object)` casts. The host of the PHP case-test entry
  points has the methods that reserve and fill an object with an id only when a case has such an object, because the
  lints deny dead code (GN-4). A case-test entry point (GN-5) describes
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
  member and the value of a case of the alias alike; Go gives an integer outside `int64` and `uint64` as a
  `*big.Int` (GN-15c), which the generated test makes from the decimal token of the case and package binding describes
  as that token, so the case runs as a call and needs no entry point; Go (the argument of a kind that the Go type of the parameter does not
  hold, such as a text for an `int64`) is generated by the Go generator and refused by name until then; Python, Node
  and WASM have no such case yet.
- **GN-13a** Open items of G-5, not generated yet: B-5b and B-6; of B-5c, the tests of a call that
  overlaps a waiting call and of a call that re-enters an object from a callback, and the tests of a class that no
  constructor or static member makes; the identity of a default of a member that GN-13d leaves out; the round trip
  of the rows of a value unit without the entry points of `codec-test`, which GN-13e runs for an alias with them; and, of the callback fixture, an `async` row, a function value
  and a callback inside another type, each refused by name when a case gives it (G-4). Of fault injection and the
  kinds of an alias, each refused by name when a case gives it: a point of another library in a contract without `faults` (GN-5); and a value of a value type of another kind
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
  Among its own keys a case gives the arguments of the first factory, in contract order, whose every parameter has a
  key that is no key of a parameter of the member of the case: such a key holds an argument of that member, as `units`
  of a case of a method `get_units` does beside a factory `from_units`, and a receiver made from it is another value
  than the case names. A factory that takes no key of the case fits every case, so it makes the receiver only when no
  factory that takes a key does. The test of a case that raises makes the receiver as a local before the call that
  must fail: a receiver that cannot be made fails the test, and its failure is not taken for the failure that the
  case expects. When the factory that makes the receiver from the keys of the case raises a variant whose row of
  `errors.kinds` gives the kind that the case expects, and the case has neither `faults` nor `after`, the failure of
  the case is the failure of making the receiver or of the call: the test expects it from both, and Go takes the
  error of the factory as the error of the case and calls the member only on a receiver that it made. Why: a group
  of cases that both the factory and a member of its class run, such as the invalid fields of a parser and its
  property, names the failure of the parse for both, and the runner of the repository makes the receiver and calls
  the member as one step.
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
  `panic-test`, `codec-test`, `native-count-test` and `thrown-count-test` are for tests only: the manifest that `binding scaffold` writes
  turns none on by default and `binding check` refuses any other manifest (CK-19), and the end-to-end check builds the static library
  without features and fails if it holds a test entry point (`__panic_test`, `__echo_`, `__arm_faults`,
  `__fault_left`, `__alias_in_`, `__number_in`, `__native_count`, `__thrown_count`). With the build tag
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
  `DEPS` names each repository whose types the contract names; its packages are built and installed first, each in
  the copy of the run and none in a checkout: for Python its wheel, for PHP its extension, for Go the static library
  of a Go module that `go.mod` requires, and for Node and WASM its npm package, with its addon as the package of the
  platform and its WASM module with the glue, for each repository of `DEPS` that a contract whose npm package the run
  packs names, directly or through another such repository, because the generated entry of that contract imports the
  npm package of the owner on Node and through the subpath `./wasm`; a repository of `DEPS` that lacks the target
  `node` or `wasm` for which a contract names it is a named failure of the targets `node` and `wasm`)
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
  static library, `GOFLAGS` with the tags of those features, `GOTOOLCHAIN=local` and `GOWORK` for Go, `--expose-gc` for WASM
  (GN-18a), and `CASES` with the case file. `GOWORK` names a `go.work` of the work directory that uses the Go module of
  the copy and the Go module of the copy of each repository of `DEPS` that its `go.mod` requires at `v0.0.0` without a
  `replace`, the development form of GN-15f, and the run prints the modules that it uses; with no such dependency
  `GOWORK` is `off`, so no `go.work` of a directory above the copy is read. Why: a development checkout resolves that
  form through its untracked `go.work`, which no copy holds, and the run resolves every dependency of every target to
  the packages of the copies of `DEPS`. Where `tests/e2e/<library>` holds `bench.mjs`, `bench.py` or `bench.php`,
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
- **GN-14f** The released form of the Go module (GN-15g): after the Go tests, the run builds the static library of
  each contract of the repository, and of each dependency whose Go module its `go.mod` requires, with the release
  profile and without a feature, removes its debug sections with `llvm-strip --strip-debug` of `llvm-tools` and
  fails when `llvm-size -A` still names a debug section in it, and makes for each a Git repository in the work
  directory that stands for the
  remote: one commit whose tree is the Go module at its place with the library of the platform of the run in
  `internal/ffi/lib/<platform>`, and the tag `<directory of the Go module>/<version>`, where the version is `v` and
  the version of the core, and for a dependency the version that the `go.mod` requires. Git reads
  `https://github.com/<owner>/` as the directory of these repositories (`url.<base>.insteadOf` of a configuration
  file of the run, the one configuration that the Git of these commands reads), so `go` fetches each module by its
  module path and its tag without a network. A consumer module, whose `go.mod` holds the line `require` of the Go
  module of each contract and nothing else of them, imports every package of those modules in a test; the run writes
  its `go.sum` with `go mod tidy`, then runs `go test` of the consumer and of every package of the fetched modules
  from the module cache of the run, whose directories Go keeps read-only, with `GOPROXY=direct`, `GOFLAGS` empty and
  no `CGO_LDFLAGS`. The run fails when the `go.mod` of the consumer holds a `replace`, and it counts the tests as
  GN-14a states. It removes the module cache with `go clean -modcache` when the step ends. Why: the generated tests
  of the copy link the library of the build by `CGO_LDFLAGS`, so only this step shows that a module fetched at its
  tag links the library that it carries.
  On Linux the commit also carries the library of musl of the arch of the run in `internal/ffi/lib/linux_<arch>_musl`,
  built with `--target <arch>-unknown-linux-musl` and stripped as the other, and the run keeps the consumer of the
  step and the downloads of its module cache, the layout of a module proxy, in `<work>/go-release`.
  `make go-musl-check WORK=<work>` then runs the consumer on musl: in a container of the Alpine image of `goMusl` of
  `config/toolchain.json`, with the Go of `mise.lock` checked by its sha256 and `gcc` and `musl-dev` of Alpine at the
  exact versions of `goMusl` (`docs/operations/dependencies.md`), it runs `go test -tags musl` of the consumer and of
  every package of the fetched modules with that proxy as `GOPROXY`, and fails unless a test ran and none failed. The
  modules are those that `go.sum` of the consumer pins, so no Git takes part. The container runs on the machine of
  the Docker of `DOCKER_HOST`, which holds the work directory at `WORK`, and has a name that starts with `polyspec-`.
  Why a container: the end-to-end check runs on a machine of the GNU C library, and only a program that a C compiler
  of musl links and a musl machine runs shows that the library of musl links and runs.
- **GN-14h** On each target the run tests what the generator writes and the contract cases of `tests/e2e/<library>`,
  and no test of the repository: unittest discovers `packages/python/generated/tests` and the case runners, `node
  --test` runs `generated.test.mjs` of Node and of WASM and the case runners, PHPUnit runs
  `packages/php-ext/generated/tests` and `CasesTest.php`, and `go vet` and `go test` of the Go module read the files
  `zz_generated*_test.go` (GN-13b) and the `tests/cases_test.go` that the run copied. Every other test file of the Go
  module is a test of the repository; an overlay of `go vet` and `go test` (`-overlay`, a file of the work directory)
  treats each as absent and the run prints their paths, so no file of the copy changes. The source of the released
  form (GN-14f) leaves the same files out. The test of the core (GN-14) is a step of every target and stays. Why: a
  test of the repository reads inputs that the runner of the repository gives, such as the path of its case file in
  an environment variable, which the run does not know, and one target that runs more than the others gives another
  result for the same contract.
- **GN-14g** The contracts of `tests/e2e` that CI runs: the job `e2e` of `.github/workflows/ci.yml` runs every
  repository of `tests/e2e` whose core depends only on repositories of `tests/e2e`, each with those repositories as
  `DEPS`, and no entry of the job names a directory that the checkout does not hold. A contract whose core depends on
  a repository that is not in `tests/e2e` is run by the job only when a tracked file of the contract names a release
  tag of that repository. Until then `tests/e2e/not-in-ci.json` lists the contract with its reason and the condition
  that ends it, and the job has no entry of it. `packages/ts/tests/ci-workflow.test.ts` fails a contract that is
  neither in the job nor in the list, one that is in both, and a listed contract whose core no longer names by a
  path a repository that `tests/e2e` does not hold. `tests/e2e/relay`, whose core depends on the repository json, is
  listed until the first release tag of json. A listed contract is still checked by `make e2e` with a checkout of
  its dependency as `DEPS`, before a commit is pushed or merged. Why: a job cannot check out a repository at a
  release that does not exist, an entry that names a missing directory fails for a reason that is no defect of the
  commit, and a contract that is silently left out of the job would look checked.
  After the end-to-end check each entry of the job `e2e` runs `make go-musl-check` on its work directory, so the
  released form of each Go module (GN-14f) also links and runs on musl of linux/arm64 (GN-15g). The job `e2e-amd64`
  runs `make e2e` of `tests/e2e/sample` and then `make go-musl-check` on `ubuntu-26.04`, the one job that does not
  run on `ubuntu-26.04-arm`, because a release carries the libraries of `linux_amd64` and `linux_amd64_musl` and only
  an amd64 machine links and runs them. The workflow runs on the push of `main` and on a manual run; a development
  branch such as `v1/rust-core` is checked by a manual run of its head (`gh workflow run ci.yml --ref <branch>`),
  because a run on every push of that branch would start the whole suite for each merge of a lane.
