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
  usage line would say that the command was written wrong when it was not. The command generates each target on a
  thread of its own with a stack of 1 GiB and waits for it, so a case value nested past the depth limit of its core
  (hundreds of levels, each several frames of the generator) is generated as the case gives it; the stack of the main
  thread holds less, and a generation that overflowed it would fail by chance of the depth.
- **GN-1d** Every call of Cargo by binding runs the cargo command that the repository gives, with the arguments of a
  build that the repository gives, and never the `cargo` of `PATH`. The commands that run Cargo, `binding check`,
  `binding scaffold` and `binding generate` (`cargo metadata --locked --offline`, GN-15f) and `binding go-link`
  (`cargo rustc`, GN-15k), require `--cargo <command>`, the value of `$(CARGO)` of the repository, and run
  `<command> <subcommand> ...`; a command without it fails with the usage. `binding go-link` also takes
  `--cargo-flags <arguments>`, the value of `$(CARGOFLAGS)` of the repository, which may be empty, and passes them
  right after the subcommand `rustc`; `cargo metadata` takes no argument of a build, such as `--ignore-rust-version`,
  so the other commands take no flags. Each value is split into words at white space, as the shell splits
  `$(CARGO)` in a recipe line; a value that holds a quote or a backslash, which the shell would read otherwise, and a
  `--cargo` without a word are errors of the command line. The release recipes (GN-19h) run Cargo as `$(CARGO)
  <subcommand>`, with `$(CARGOFLAGS)` right after the subcommand of a build (`rustc`, `build`), and pass `--cargo
  "$(CARGO)"` to each command of binding that they run that runs Cargo; `binding check` reports a file of recipes that
  runs Cargo in another way (CK-94). A recipe of the repository that runs `binding go-link` passes `--cargo "$(CARGO)"
  --cargo-flags "$(CARGOFLAGS)"`. `maturin build` and `napi build` start Cargo themselves and are no
  call of binding. The go command is given in the same way, and is no requirement of a command: `binding check`,
  `binding scaffold` and `binding release-go-module` take `--go <command>`, the value of `$(GO)`, split into words as
  `--cargo` is, and without it they run the `go` of `PATH` (GN-15l, GN-19f). Why: php-serialization and session-store found that `binding go-link` and the release recipes ran
  the `cargo` of `PATH`, so they missed the `$(CARGO)` and the `CARGOFLAGS` of the repository and with them the Rust
  link of kit, and in a development link the core was built from the tag of the lock; hyper found the same of the read
  of the contracts of its providers, whose `cargo metadata` gave the crate of the tag of the lock, so its generator read
  the contract of that release and not the one of the linked checkout. In a development link `$(CARGO)` is `node
  $(KIT)/link.mjs cargo $(CURDIR)`, which runs Cargo with a copy of the lock under `var/link/cargo` and a `patch` of
  each linked crate to its checkout, so `cargo metadata` gives the manifest of that checkout, beside which binding
  reads `interface.json` (GN-15f). The command is required, because a default to the `cargo` of `PATH` is the bypass
  itself. It is an option and not the variable `CARGO` of the environment, because Cargo sets `CARGO` to the path of
  its own program for each build script, test and `cargo run` that it starts, so a binding started there would read
  that program without a sign, and make exports no variable that it is not told to export.
- **GN-2** The result depends only on the contract, the case files that `cases` names, the version and library name of
  the core crate (read from its manifest as TOML) and binding itself; it holds no time, path or host, and lists are in
  contract order (I-5). `--out` writes the same files under another directory; the tests of `packages/ts` generate twice
  in two directories and compare the bytes. The consumers of `config/consumers.json` are a test of a release of
  binding, never an input of the generator: no file of the list or of a consumer enters a result (GN-14m).

## Layout (L-1, L-2)

- **GN-3** binding owns five directories and writes each whole through a staging directory, so no file of an earlier
  generation stays and a reader never sees a part: `packages/php-ext/generated`, `packages/python/generated`,
  `packages/ts/generated`, `packages/go/internal/ffi/generated`, `packages/ts/wasm/generated`. In the Go module, which
  holds hand-written folders beside the generated packages (L-1), binding owns the files `zz_generated_*.go` rather
  than a directory: a generation removes every one of them under `packages/go` and writes its own. No tracked tree
  holds one (GN-15g): a repository ignores them, and `binding release-go-module` refuses the commit of a tag that
  tracks one (GN-19f). No source of binding is copied into the repository: the core and the binding crates depend on
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
    and publishes; and in `dependencies` the npm package of each other library that the generated Node and WASM code
    imports or requires (GN-3e), with the version that the host chooses, because the host package installs them for
    the generated entry; host code imports `native/generated/index.mjs`
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
  (L-2a), holds no addon; the release of the repository that holds the binding builds and publishes the platform
  packages (K-3). Neither the tracked manifest of the package nor the manifest that the release packs names a
  platform package: the release writes no `optionalDependencies`. The consumer names them. Its root `package.json`
  has `dependencies` with `<npm package>` at the asset URL of the package and `optionalDependencies` with each
  `<npm package>-<platform>` at the asset URL of its platform package, all of one release, and the consumer gives npm
  `allow-remote=root`; where it gives it, a `.npmrc` that it tracks or the tool that runs its installs, is a matter of
  the consumer. The package of another library that the packed manifest requires is named in the same root manifest
  (GN-3h). An asset URL is
  `https://github.com/<owner>/<repository>/releases/download/v<version>/<file>`, where `<file>` is the name that
  `npm pack` gave (GN-19e): `<scope>-<name>-<version>.tgz` for the package and `<scope>-<name>-<platform>-<version>.tgz`
  for a platform package, the scope without `@`. For `@polyspec/sample` 0.0.3 of `polyspec/sample`:

  ```json
  {
    "dependencies": {
      "@polyspec/sample": "https://github.com/polyspec/sample/releases/download/v0.0.3/polyspec-sample-0.0.3.tgz"
    },
    "optionalDependencies": {
      "@polyspec/sample-linux-x64-gnu": "https://github.com/polyspec/sample/releases/download/v0.0.3/polyspec-sample-linux-x64-gnu-0.0.3.tgz",
      "@polyspec/sample-linux-arm64-gnu": "https://github.com/polyspec/sample/releases/download/v0.0.3/polyspec-sample-linux-arm64-gnu-0.0.3.tgz",
      "@polyspec/sample-darwin-arm64": "https://github.com/polyspec/sample/releases/download/v0.0.3/polyspec-sample-darwin-arm64-0.0.3.tgz"
    }
  }
  ```

  npm installs the platform package whose `os`, `cpu` and `libc` match the machine and skips the others, and its lock
  records every one with its resolved URL and its `sha512` integrity, so the lock is the same on every platform and
  `npm ci` checks each download against it. Why: until version 0.1 no registry holds a polyspec package (AGENTS), so
  a version range in `optionalDependencies` of the packed manifest names nothing that npm can resolve, and npm skips
  an optional dependency that it cannot resolve without an error: a consumer that installed the package from its URL
  got no addon. npm takes a URL only for a root dependency under `allow-remote=root` (its default `allow-remote=none`
  refuses every URL), so a transitive dependency of the packed manifest could not name the URL either. The generated
  entry loads `<npm package>-<platform>` and, when it is not installed, the file `<name>.<platform>.node` beside the
  entry, which a build in a checkout puts there. The recipe `checkout-node-addon` of the file of recipes (GN-19h) is
  that build: it generates the binding of the target `node`, runs `$(CARGO) build $(CARGOFLAGS) --locked
  --all-features -p polyspec-<library>-node` (GN-1d), and copies the cdylib from the target directory that `$(CARGO)
  metadata` names to `<name>.<platform>.node` beside the generated entry, where `<platform>` is the name of T-2 that the
  release recipes give the triple of the host (GN-19a), from the one table of the platforms that the generator holds; a
  consumer writes none of these lines. It is a debug build with every feature of the crate, which are the test
  features of GN-5, as the end-to-end check builds the addon, because the build of a checkout is the one that the
  generated tests and a consumer linked to the checkout load; the addon of a release is built by
  `release-npm-platform` alone. Why: each consumer wrote the build, the platform name and the copy by hand,
  php-serialization lacked them, and a consumer that linked its checkout failed to load the addon (T2.43); the side
  that states the path gives the recipe that fills it, so the name of the file has one rule. The end-to-end check packs the platform package of its machine as a
  release does, serves the tarballs over HTTP on the loopback, and installs them through one root `package.json` of
  the form above with `allow-remote=root`, which it gives in a `.npmrc` beside that manifest. The `package.json` that `scaffold` writes for a library with the target
  `node` names the configuration that the napi CLI of a release reads: `napi.binaryName`, the npm name without scope,
  which is the `<name>` of the addon file that the entry loads, and `napi.targets`, the Rust triples of the platforms
  in the order above (`x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `aarch64-apple-darwin`). A release reads
  both from the manifest: the napi CLI names the addon file by `napi.binaryName`, and `napi.targets` names the
  platforms whose packages the release builds. Every manifest of an npm package that `scaffold` writes has `"type":
  "module"`: the only `.js` files of the package are the glue of `wasm-bindgen --target web`, which is an ES module,
  and the Node entries are `.cjs` and `.mjs`, whose extension decides their form. Without the field Node reads a
  `.js` file that is an ES module with the warning `MODULE_TYPELESS_PACKAGE_JSON`. The `composer.json` of a PHP
  extension (type `php-ext`, also `<host package>-native` of GN-3b) names `php-ext.extension-name` and
  `php-ext.download-url-method` `["pre-packaged-binary"]`, so that PIE installs the binary of the release for the PHP
  and the platform of the machine. `binding check` compares these fields as it compares the whole file
  (CK-19). The steps of such a release are recipes of the repository that holds the binding (GN-19): the release utility of
  the shared tools (`@polyspec/kit`) tags `vX.Y.Z` and packs the archives that one package manager packs on one
  machine, and it builds no platform package, no binary of a PHP extension and no commit of a Go module (GN-15g).
  Why: which files the release of a binding carries is a rule of this specification and of that repository, and a
  tool that runs the recipes of a repository holds no rule of it.
  An entry of `packages.node.entries` other than `.` and `./wasm` that names `types`, `import` or `require` is an export
  of files that the repository writes itself: scaffold writes those conditions as the export of the entry in
  `package.json` and adds its `files` to the files of the package, so CK-19 accepts the manifest (B2.303).
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
- **GN-3j** The PHP of the build is an input of the PHP binding crate, and a build whose ext-php-rs is built for another
  PHP fails (B2.470). The `build.rs` of the crate finds `php` and `php-config` as the build script of ext-php-rs does
  (the path that `PHP` or `PHP_CONFIG` names, or the first file of that name in `PATH`), emits
  `cargo:rerun-if-changed` for both files and for itself and `cargo:rerun-if-env-changed` for `PHP`, `PHP_CONFIG`,
  `PATH` and `POLYSPEC_PHP_API`, reads the lines `PHP Extension` (the module API), `Thread Safety` and `Debug Build` of
  `php -n -i`, and writes `php_build.rs` in `OUT_DIR`: a constant assertion that `ext_php_rs::ffi::ZEND_MODULE_API_NO`,
  `ext_php_rs::PHP_ZTS` and `ext_php_rs::PHP_DEBUG` are those three values. The entry `src/lib.rs` of the crate
  includes that file. When they differ the compilation of the crate fails with a sentence that names the PHP, its
  module API and the command `cargo clean -p ext-php-rs`, with the profile and the target of the build, since that
  command removes the output of one profile. `POLYSPEC_PHP_API` is read for no value: a recipe gives it any text that
  names its PHP, such as the output of `php -n -r 'echo PHP_VERSION_ID, PHP_ZTS, PHP_DEBUG;'`. Why: the build script of
  ext-php-rs 0.16.4 emits `rerun-if-env-changed` for `PHP`, `PHP_CONFIG`, `PATH` and two variables of its own and reads
  PHP by its path, so when the PHP behind one path changes Cargo keeps the bindings of the PHP before; hyper built
  with 8.5 behind the `php` of its tools, built again with 8.4 behind the same path, and PHP refused the extension
  with `Module compiled with module API=20250925`, `PHP compiled with module API=20240924`. No crate can make Cargo
  build a dependency again, so the crate cannot build ext-php-rs for the new PHP; it can fail before the load, with
  the command. Cargo compares a file by its time and a variable by its value: a wrapper that is written again, as the
  `php` of the tools of a checkout is when its PHP changes, or a binary that is installed again runs the script
  again, and a link that moves to a file older than the last build does not, which the variable of a recipe covers.
  A script that runs in every build (`rerun-if-changed` of a file that never exists) would see every change with no
  variable, and Cargo compiles the crate again after each run of its build script, so every build would compile the
  extension. A plain `cargo build` has the two files and the three variables of ext-php-rs as its inputs. The release
  recipe builds each PHP minor and build in a target directory of its own (GN-19d), so it meets no stale ext-php-rs.
  The check does not catch one case: the wrapper and the three variables stay as they were and only the link behind
  the wrapper moves to a file older than the last build, which the time comparison of Cargo reads as unchanged; a
  recipe that gives `POLYSPEC_PHP_API` catches it. Not verified: a run with the real ext-php-rs in which PHP changes
  from one minor to another. The script was run in a crate with a stand-in for ext-php-rs and for PHP, and the
  assertion compiles against the constants of the real ext-php-rs in the lint of the end-to-end check. The end-to-end
  check has no step for it: such a step needs two PHP minors in one job behind one path, since a changed value of
  `PHP` runs the build script of ext-php-rs again by itself, and a second build of ext-php-rs.
- **GN-3e** A manifest that `scaffold` writes names another polyspec library (T-3) in the form of the dependency line of
  the core on `polyspec-<library>`. The libraries that the manifests name are the libraries whose types the generated
  code names: each library that the contract names in its units and its types, each library whose error a row of
  `errors.kinds` passes on (its `library`, E-1b (a)), because the generated code matches the variant of that error by
  its path in the crate of that library (GN-7c), and each library that the members of a callback unit of another
  library name when the contract takes that unit, because the binding wraps the callback and converts the values of
  its members (GN-6s). A library that a row names only as the `source` of a variant of the core error (E-1b (b)) or
  that `errors.wrapped` names is not named by the generated code and adds no line. The Cargo manifest of each binding crate has the dependency line of each of them, which the
  core names too, and `pyproject.toml` has the Python package of each; `go.mod` requires those of them that own a
  record or a value class among those types (GN-15f). A manifest also names the package of another library that the
  generated code of its ecosystem imports or needs when it is loaded: `package.json` has in `dependencies` the npm
  package of each library that owns a value class or a callback unit among those types, because the generated Node
  and WASM code imports or requires every such package: the entries import the package of a value class for its
  classes (GN-6x), the declarations name the interface of a callback unit of another repository from the package of
  its owner (GN-6s), and the Node entry requires that package for the error classes that a member of the unit
  recognizes (GN-6d). The `package.json` of a host package declares each of them in its `dependencies`, which `check`
  reads (GN-3b, CK-19), because the host package is the package that installs and loads the generated entry; and `composer.json` has in `require` the extension
  `ext-<extension name>` of every other library whose extension the generated extension looks into, because PHP
  must load that extension first. The generated extension finds a class of another extension by its name, and it
  does so for three kinds of unit among those types: a record, whose class it makes and reads (T-3); a value class,
  whose class, static members and map classes it reads and calls (GN-6x); and a callback unit with a member that
  recognizes error units, whose error classes and category classes it reads (GN-6s). The owner of a record or of a
  value class has its Composer package in `require` beside its extension. A value alias of another library, which
  the core of its owner converts without a class of its extension, and a callback unit whose members recognize no
  error, which is called on the object that the caller gave, add no requirement. One function of the generator names
  these kinds, and both the model that the PHP emitter reads and `scaffold` take them from it. The emitters of the
  extension take the PHP name of a class of another library from one function, which refuses, by the name of the
  library and of the unit, a unit of a kind that the first function does not know, and an owner that names no PHP
  namespace; a map class of a value class and an error unit that a callback unit recognizes are named through that
  value class or callback unit (B2.454). So a lookup of a class cannot be written without the requirement of its
  extension, where before only a test that compares the two sets on the generated text stood between them. Why: in crud-ui the
  generator takes the callback unit `file_loader` of its validator, and its tests failed with
  `Class "Polyspec\CrudUi\Validator\Errors\ComposeLoadError" not found` until the generator loaded the validator
  extension (`BINDING_PHP_REQUIRES_generator = validator` of its Makefile), while the composer.json of the generator
  required no extension but its own (B2.441). A
  library that only the contract of another library names in another place, such as the type of a member of a class
  that this contract does not take, is in no manifest. `scaffold` reads the contract of a library by the `path` of its
  dependency line, from the core of the library that names it, and the others through `cargo metadata`; when Cargo
  fails, it writes no file and fails with status 1, the error of Cargo and the instruction of GN-15f, because the
  libraries that only a callback unit names and the Go modules of the libraries are then not known, and a manifest
  written without them (a `go.mod` without the requirement of a library) would read as complete. A line that names the version `=X.Y.Z` or the tag `vX.Y.Z` and no branch or commit
  is the release form, and the manifest names that version (`go.mod` `vX.Y.Z`, GN-15f; `pyproject.toml` the
  dependency `polyspec-<library>==X.Y.Z`; `package.json` and `composer.json` the version `X.Y.Z` of the package). A
  line with a `path` that stays inside the root of the repository, which is the place of the core (`core.path`) joined
  to the path, names a library of the same repository and no other repository, and it is a release form too when the
  one version of that library stands beside the path: `version = "=X.Y.Z"`, or `version = "0.0.Z"`, which Cargo reads
  as that one version, because a caret requirement of `0.0.Z` holds no other; the manifests name that version as they
  name the version of a tag, and each binding crate keeps the line with its path and its version. Such a path with no
  version or with a range that holds several versions (`0.1.2`, `^0.0.20`) is a development form, because no manifest
  can name the version of the library from it, and the finding of CK-70 says that the version is missing; a path that
  leaves the repository and an absolute path are development forms with a version too, because they name a checkout
  of another repository. Why: the generator of crud-ui names its validator, a library of the same repository, by
  `polyspec-crud-ui-validator = { path = "../../validator/rust", version = "0.0.20" }`, the only form by which Cargo
  builds two crates of one tree, and the check of a release refused the line as a path, so that repository could
  pass no check of a release (B2.460). A line that the core inherits from the workspace (`workspace = true`) has the
  form of the line of `[workspace.dependencies]` of the root manifest: the manifests name the version of that line,
  a `path` of it is read from the root of the repository, and each binding crate, a member of the same workspace,
  inherits the line as the core does (`polyspec-<library> = { workspace = true }`, and for `polyspec-binding-core`
  `workspace = true` with the features of the binding crate). A line that inherits where the workspace holds no line
  of the crate names no version. Before, such a line was read as a line without a version, so a core that inherited a
  tag got the manifests of a development form, and its binding crates a line on `polyspec-binding-core` without a
  source (B2.457). Every other line (a path that leaves the repository, a
  branch, a commit, a version range) is a development form, which a repository uses until the library has a release:
  the manifest names the library without the version of a release (`go.mod` `v0.0.0`; `pyproject.toml` the name
  `polyspec-<library>` alone; `package.json` and `composer.json` the package with `*`), and the development checkout
  resolves it through its development links and its development install. No form of the line stops `scaffold`, `generate` or `check`;
  `binding check --release` reports each development form (CK-70). A committed tree of a repository, on any branch,
  holds the release forms alone, and its CI runs that check (GN-19i): a checkout is developed against the checkout of
  another repository through its untracked links, and the development forms remain what `scaffold` writes for a tree
  that no release is cut from, such as the repositories of the end-to-end check of binding (`tests/e2e`). The dependency line of each binding crate on
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
- **GN-3h** The install of a release form (GN-3e, B2.458). Until version 0.1 no registry holds a polyspec package
  (AGENTS): each is an asset of the GitHub Release of its repository (GN-3c), so the requirement of a released
  manifest on the package of another library names a version that no registry answers, and the consumer gives the
  package manager that package itself. The Go module is fetched from its remote at its tag (GN-15l, GN-14f, GN-19f);
  for the other three:
  - npm: the consumer names, in its own root `package.json`, the npm package of every polyspec library of its graph
    by the URL of its release asset (GN-3c), also a package that only another package requires, and each platform
    package of each; it writes no `overrides`, and it installs with its lock (`package-lock.json`). The release that
    each URL names is the one whose version the packed manifests require. Why: npm satisfies a requirement `X.Y.Z` of
    a packed manifest with the root dependency of that name when the package at its URL has that version, and
    installs one copy of it; otherwise it asks the registry for that version, which holds none. A URL in the packed
    manifest is refused under `allow-remote=root` (GN-3c), and an `overrides` entry would state a second time the
    version that the manifest of the package already states. Why the lock, as measured with npm 12 in hyper: an
    install with no lock at all resolves the graph from scratch and stops under `allow-remote=root` with
    `EALLOWREMOTE … Refusing to fetch "https://registry.npmjs.org/…"`, because a package of the registry that is not
    a dependency of the root cannot be fetched; with a lock, a workspace package that requires a sibling by its name
    and the exact version is resolved by the URL entry of the root with no `overrides`, the lock is byte for byte
    the one that an install with `overrides` writes, and no registry is asked.
  - Python: the consumer gives the installer the wheel of every polyspec library of its graph, the one of its
    platform, by the URL of its release asset, all in one install (a requirement `polyspec-<library> @ <URL>` of its
    project, or the URL as an argument of `pip install`). The release that each URL names is the one whose version
    the metadata of the wheels require. Why: pip and uv satisfy `polyspec-<library>==X.Y.Z` of the metadata of a wheel
    with a wheel of that name and version that the same install was given by a URL, and pip fails when none was given
    or its version differs; a release has no index page that an installer reads, so no `--find-links` names it; and
    the file name of a wheel differs by platform (GN-19c), so the metadata of a wheel cannot name one URL. The
    tests of a library are a consumer too: a repository whose Python package requires the wheel of another library
    declares the source of that wheel in its own root, a uv project with its lock or requirements with hashes, by
    the URL of the release asset, and does not build that wheel from a clone of the other repository. Why: the
    generator cannot write the source, since no contract names the owner and the repository of a library and the
    file name of a wheel holds constants of the binding that released it, and the metadata of a wheel carries no
    source to the one that installs it; session-store built the wheel of php-serialization from a clone and
    installed it with `pip --no-index`, because nothing declared where it comes from.
  - PHP: the consumer adds `packages.json` of the release of each library of its graph, the Composer repository that
    the release utility writes beside the archives
    (`https://github.com/<owner>/<repository>/releases/download/v<version>/packages.json`), as a `composer`
    repository of PIE (`pie repository:add composer <URL>`), and installs the extensions in the order of their
    dependencies, each with `pie install <package>:X.Y.Z`; its own project requires `ext-<extension name>` alone.
    Why: Composer does not load a package of type `php-ext`, so only PIE resolves the requirement
    `<vendor>/<package>: X.Y.Z` of the `composer.json` of an extension, and it resolves it from the repositories that
    it was given; PIE installs the extension that was asked for and no other, and it refuses an extension whose
    `ext-<extension name>` requirement the PHP of the machine does not load, so the extension of a dependency is
    installed first. PIE finds the binary of a release through the API of GitHub, which no loopback stands for, so
    the end-to-end check has no step of this install: its evidence is the PIE step of a real release, and a step that
    expects PIE to fail where the loopback ends would be no evidence.
  The end-to-end check installs the npm packages and the wheels of a run in these two forms (GN-3c, GN-14a). Before
  npm starts it reads the manifest of each tarball: a requirement `X.Y.Z` on another package of the run whose tarball
  of that version the run does not hold fails with the two names (`scripts/e2e-npm-install.mts`), because npm would
  ask the registry for it and name neither. Every repository of `tests/e2e` names its dependency by a path, so the
  requirements that these installs satisfy first are development forms (GN-3e); the run then writes the release form
  of the copy and installs it in the same two forms (GN-14l), and a test of `packages/ts` packs two packages and
  runs that script on them. The npm install of a run has no lock: the packages that the generator writes require no
  package of a registry, so the resolution from scratch meets none.
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
- **GN-3i** The library of the Python binding crate is named after its crate: `[lib] name` of its manifest is
  `polyspec_<library>_python`, the library with `_` for each `-`, as the libraries of the other binding crates are
  named after theirs. The name of the library is not the name of the module that Python imports. That module stays
  `<module>._native` (`<module>._binding._native` of a host package, GN-3b), and two items name it: the generated
  source declares it with `#[pymodule(name = "_native")]`, which gives the symbol `PyInit__native` that CPython asks
  the extension file for, and `tool.maturin.module-name` of `pyproject.toml` names the file that maturin copies the
  library to (`_native.abi3.so`) in a wheel and in a development install. No recipe and no step of the end-to-end
  check reads the library of the Python crate by its file name: maturin takes it from the build that it runs. Why:
  Cargo writes the library of every member of a workspace into one directory, `target/<profile>/deps/lib<name>`, so
  two Python crates of one workspace that are both named `_native` (crud-ui: `packages/validator/python` and
  `packages/generator/python`) wrote one file, a build of both warned of an output filename collision, which Cargo
  states may become an error, and the library of one crate replaced that of the other (B2.352).
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
  `free_<unit>` of the module of the exports, whose export is `__free_<Class>`. The entry of the constructor is the
  function `construct` of the module of its class, which is the name of no member, since each has the prefix, and of
  no helper of the crate, so a class with a constructor and a member `new` has two functions (B2.478). Why: a name that joins the class and
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
- **GN-4d** The helpers of a crate of PHP, Python, Node and WASM are chosen from the text of the whole crate: the
  generator writes the crate once without its helpers, and the names that this text reads (GN-4) select the helpers
  that the crate holds, which it then writes with them. A call that any part of the crate makes, such as the
  constructor of a library class (GN-7a) or the conversion of a number (GN-12a), so keeps the helper that it calls,
  and no list of the parts of the crate that call helpers is kept beside the code. Why: the parts were listed by hand,
  and a call added outside them, `text_in` and `type_error` in the constructor of a library class of PHP, compiled
  only for a contract that also had a text parameter; a contract without one failed the build. The Go crate keeps
  its list, because a helper that only a test feature uses is compiled under that feature (GN-4). The same rule holds
  in these four crates: an item or a statement of the text under one feature (`#[cfg(feature = "<feature>")]`), such as
  a `codec-test` entry point of an alias (`_alias_in_<alias>`, `alias_in_<alias>`), reads for that feature alone, so a
  helper that only such items read, directly or through another helper, is compiled under their features, and one
  that any other part of the text reads stays without a feature. The `in` conversion of an alias with kinds that no
  member takes (only a result gives it) is such a helper. Why: the sample of B2.421 had such an alias, `blob`, whose
  `in_blob` the crates held without a feature, and cargo clippy of the PHP, Python, Node and WASM crates without
  features failed with "function `in_blob` is never used" (B2.430).
- **GN-4e** A `use` declaration of a generated crate (`lib.rs` of each of the five targets) imports a name exactly
  when the crate writes that name bare: a token of the name, read as GN-4 reads tokens, that no `::` precedes, outside
  the `use` declarations. A name that the crate writes only by its path, such as `pyo3::types::PyDict`, is not
  imported. The one exception is a trait that the crate imports for its methods alone, because a method call names no
  trait: `ext_php_rs::convert::FromZval`, `ext_php_rs::convert::IntoZval`, `napi::JsValue`,
  `napi::bindgen_prelude::JsObjectValue` and `wasm_bindgen::JsCast`, a closed list that the generator imports where the
  crate calls their methods. One pass over each generated `lib.rs` applies the rule after the crate is written: it
  removes from each list a name that is neither written bare nor such a trait, and removes a declaration with no name
  left together with its attributes. Why: each list chose its names by a word match over a part of the crate
  (`\bPyDict\b`), and a path matches a word, so the constructor that refuses a direct construction (GN-6b), which
  writes `pyo3::types::PyDict`, imported `PyDict` into a crate that wrote it nowhere bare, and a consumer whose lints
  deny warnings failed with `unused import: PyDict`. A pass over the written crate reads the whole text, which no
  condition over one part of it does.
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
  core inside this crate does not read. So a kind of a row with `through` (GN-7c) is no point of this crate: it is
  an exception that the object of the package of that library raised, which the core passes on as
  `Failure::Raised`, the point that gives it fires in that package, and `binding check` refuses a case that arms
  such a point (CK-22). A point that the call does not reach stays in `_fault_left`, which fails the
  test (GN-13), and `binding check` compares its name with the contract of its library (CK-22). Not generated yet,
  refused by name (G-4): a case that arms a point of another library in a contract without `faults` of its own,
  because the items of GN-8a are written only for a contract with `faults`. A core with
  points has itself as a dev-dependency, `<core crate> = { path = ".", features = ["fault-test"] }`, so that
  `cargo test` of the core without flags arms them, in every repository in the same form (CK-65). The tests of a WASM crate reach the entry points of `fault-test` and of `codec-test`
  (`__aliasIn<Alias>`, which the table names for Node) through the module that wasm-bindgen writes. The Go tests reach
  them through functions of `internal/binding` with the build tags `polyspec_<library>_fault_test` and `polyspec_<library>_codec_test`
  (GN-13b).

## The core boundary (T-1, I-2 (1))

- **GN-6** Each argument is converted into a `let` of the Rust type of T-1. A parameter of a type with two forms (text,
  latin1, bytes, source, path) is passed borrowed (`&String` and `&Vec<u8>` coerce to `&str` and `&[u8]`), an
  `optional<T>` of one with `as_deref()`, an `optional<T>` of a record or a value class (also of another repository)
  with `as_ref()` (`Option<&T>`), a Copy type (bool, the numbers, an enum) by value, any other type (a list, a
  record) by reference. A record is built from its expanded fields, which are owned. A return has the form that is usual for its Rust function
  (an accessor borrows, a computed value is owned), so the generated code binds it without a type and reads either
  form the same way (`AsRef`, `Borrow`, `IntoIterator`, a reference to a tuple field), except a return of `none`, which
  it binds as the unit (`let (): () = …`): a core that returns anything else there, a `Result` too, does not compile, so
  its `Err` is not dropped (E-1c), and the unit pattern leaves no variable unused, which the lints deny. An integer return (uint, int,
  int64) may be a narrower Rust integer, which the generated code widens with `From` (traits `WideUint` and `WideInt`
  for the integer and a reference to it; `usize` and `isize` widen as GN-6ac states); a parameter is converted into
  the type of the table and then into the core's own type (GN-6ac). A contract name that is a Rust keyword
  is a raw identifier (`r#type`). A name that the generator joins from a contract name and a prefix or a suffix
  (`check_box`, `in_type`) holds the name without `r#`, because the joined name is no keyword and `r#` inside a name
  is no Rust token (unit `box` of the end-to-end sample).
- **GN-6a** A record that a function returns, or that is an element of a parameter, has its result form (T-4) in each
  language: Python a frozen keyword-only `dataclass` in `<root>._types`, Node a plain object of its members, PHP a
  final class of public readonly properties whose constructor takes every field by name. Each binding converts it both
  ways (`in_<record>`, `out_<record>`); a value of another type in its place is kind `invalid_argument_type`.
  An `optional` field whose default is `{literal: null}` (T-4) may be left out of the result form, as a field of a
  case of a variant (GN-6v): Python gives the dataclass field the default `None`, Node and WASM read a missing or
  `undefined` member as null and declare the member optional, PHP takes null at its place in the constructor, Go
  leaves the pointer of the field nil, and a case value may leave out its key, which is then null. Such a field
  always leaves with its value or null. Why: the core gets `None` for a null and for a value that was not given
  alike (GN-6i), so a caller that has no value writes none.
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
  A part of a tuple that leaves is read from the reference that the code already holds (`parts2(&value.span)`), never
  from a reference to a temporary of it, which Rust drops before the parts are used (B2.301).
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
  `impl CoreForm<T>`, which keeps an owned value and clones a borrowed one, so the instance never borrows the core. A
  crate writes `out_<class>` when its code names it: a call, or the conversion of a record, a variant or an alias, that
  gives the class, also as the function that a list conversion takes (`list_out(py, items, out_<class>)`) for a list
  inside a tuple, and no other time, because the lints deny dead code. `constructible: false` leaves no constructor that makes an instance: the binding makes
  every instance itself from a result of the core, and a direct construction by language code fails with the kind
  `direct_construction` (category `type`) whose message names the class, as any binding failure of that category does.
  Python's `#[new]` fails so, PHP declares a public `__construct` that fails so, the `Proxy` of the Node entry calls the
  static `__binding_new`, which fails so, and the WASM constructor calls the export `__new_<Class>`, which fails so,
  unless the module makes the instance (T-5). Go has no direct construction to refuse: a struct literal or the zero value of
  `<Class>` runs no code of the binding and holds no value, so a call that takes it fails with kind
  `invalid_argument_type` (GN-15a). Why: the json repository found (T3.25-1) that a direct construction failed without a
  kind, in Node with the plain Error of napi-rs, in Python with the TypeError of pyo3 and in PHP with the Error of the
  engine for a private constructor, while the core defines `direct_construction` for it; a private PHP constructor
  cannot carry the kind, because the Error that the engine throws for it carries none. A property is a
  getter in Python and Node and a method in PHP (I-3). napi-rs defines a class's methods as not configurable, so a
  Node method or static member that takes arguments is the addon's `__<name>`, not enumerable and absent from the
  declarations, and the entry defines `<name>` over it with the checks of G-7. The entry writes that function as a
  method with the computed key `<name>`, not as a function expression named `<name>`: a member may take a name that
  JavaScript reserves (`null`, `delete`), which names no function, and the method keeps `<name>` as its `name`. napi-rs keeps the classes it parsed in
  the state of its macro process, which rustc does not keep between the expansions of a struct and its impl, so a
  Node constructor is the static `__binding_new` and the entry exports the class in a `Proxy` whose `construct` checks the
  arguments and calls it; `instanceof` reads the class's prototype through the proxy. A hidden name of a class that
  is no member of it is a name that no member takes. The JavaScript name of a member holds letters and digits alone
  and starts with a small letter (N-1: a word is `[a-z][a-z0-9]*`), so the addon's name of a member, `__<name>`, has
  no `_` after its first two: the construction of a Node class is `__binding_new` and its iteration (N-4) is
  `__binding_iterate`. The export of a member of a WASM class, `__<Class>_<member>`, has the capital letter of its
  class after `__`: the construction is the export `__new_<Class>` and the iteration `__iterate_<Class>`, as the
  release is `__free_<Class>` (GN-4c). Why: orm has a static member `new` of a class without a constructor
  (`query.new`, `step_runner.new`), and the Node addon wrote that member and the refusal of a direct construction as
  one static `__new`, so `new Query()` ran the member and failed with its argument error in place of the kind
  `direct_construction`; a method named `iterate` took the place of the iteration in the same way (B2.478). A parameter of a class takes an
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
- **GN-6aw** A crate holds only the code that it uses (GN-4): the dispatch of Go, the table of thrown values and the
  variants of `Thrown` exist only where language code runs: a callback unit that a member takes (GN-6d), a function
  type, a value alias or a machine. A callback interface that only a class implements (GN-6w) calls no language code,
  so a member whose Failure comes from its trait converts a `Raised` into a failure of kind internal, which no table
  holds. Why: an item that nothing uses fails the lints of the workspace, which deny warnings.
  WASM writes no module of members for a class without members of its own, and Go writes the dispatch of a call
  (`go_callback`, `Thrown::Go`) only for a callback that a member takes without keeps (B2.301).
- **GN-6ax** The names that the generated Rust binds itself never equal a name of the contract. A name of the contract
  is snake_case words without a trailing underscore, so the token of the runtime that every function of the Python
  crate takes is `py_` (`py_: Python<'py>`) and that of the Node crate is `env_` (`env_: &'env Env`). A parameter named
  `py` or `env` keeps its name, which Python takes as its keyword. Go binds its contract names in the C ABI, where no
  name is public, so a parameter of the name of a local of an entry point takes the trailing underscore there
  (GN-15j). Why: a parameter that shadows the token makes every conversion after it take the parameter, which does
  not compile, and the name of a parameter is public in Python and PHP.
  The conversion in of a record binds `value`, `subject` and `class` itself, so the local of a field of such a name
  takes the trailing underscore and the literal of the record names the field (`Stride { ends, value: value_ }`)
  (B2.301).
- **GN-6ay** A callback unit with `thread: "owner"` (U-3) is called by the host on the thread that made it, one call at a
  time, so its adapter in PHP and Node is `Send` and `Sync` (`unsafe impl`), whatever bound the core trait has: every
  call first compares the thread with the owner and fails with kind `wrong_thread` on another, and a drop on another
  thread does not touch the language object (PHP keeps the `Zval` in `ManuallyDrop` and releases it only on the owner;
  the Node adapter holds a borrowed handle of the call, which has no drop). Python (`Py`) and Go (a handle) are `Send`
  and `Sync` already, and WASM has one thread. Why: a core trait such as `Loader: Send + Sync` lets a core keep the
  callback in a shared value, and the host objects of PHP and Node are raw pointers, which Rust does not send; the owner
  check makes each use sound, so the bound is met without a second form of the trait.
- **GN-6av** Node calls a language function, a member of a callback (U-3) or a function value (GN-6z), as a napi
  `Function` whose arguments are `FnArgs` of the converted values, and a function without arguments as a `Function`
  of `()` that it calls with `()`. Why: napi implements the arguments of a call for `FnArgs` of one or more values and
  for `()`, which it passes as no argument, and not for `FnArgs<()>`.
- **GN-6d** A callback interface (U-3) is a struct that holds the language object and implements the core trait; a
  member that takes one returns `Result<T, Failure<E>>` (E-1c) and the core takes it as `&mut dyn` of its trait when a member of the unit takes `&mut self`, and as
  `&dyn` otherwise, which the binding passes as `&mut` and `&` (B2.252); a `&mut` where the core takes `&` is refused by
  `clippy::unnecessary_mut_passed`.
  When the object enters, each member must be callable (kind `invalid_callback`), except a member with a `default`
  (B2.379, CK-98): `"default": {"literal": <value>}` on a member of a callback interface, the U-2 form of a parameter
  default, states the value that the trait method returns when the object has no such member, and the object is
  refused for that member only when it has the member and the member is not callable. A member that is given one
  argument or more must also take them, with the same kind (GN-6bu). Each call of the trait method
  first looks for the member on the object (Node and WASM a property that is not `undefined`, Python `hasattr`, PHP a
  method of its class) and returns the literal without a call when it is missing; Go leaves the member out of the
  interface of the callback, and its dispatch calls the method when the object has it (a type assertion to an
  interface of the one method) and encodes the literal otherwise. The declarations leave the member out of the PHP
  interface and of the Python `Protocol`, and declare it optional in TypeScript (`blockingIo?(): boolean`). A class
  that `implements` the interface (GN-6w) calls its own trait method, as before. A case fixture (G-5) whose rows and
  calls name no row of such a member leaves it out of the object, so the core gets the default; the Go fixture, one
  type for every case, answers the default when no row of the case names the member, and the raising and panicking
  objects of the tests leave it out. A literal of a type other than a bool, a number, a text or an `optional` of one
  is refused by name (G-4). Why: a core trait method with a default body, such as `fn blocking_io(&self) -> bool {
  false }` of `polyspec_template::Loader`, needs no host object to implement it, but a Rust impl that overrides the
  method cannot call the body of the trait, and the generator reads no Rust (I-2), so the contract states the value.
  A call converts the arguments out
  (borrowed per T-1) and the result in; an exception of the language code, or a failure of the binding in the call
  (a result of another type, a call from another thread with `thread: owner` on Node and PHP, kind `wrong_thread`), goes to the core
  as a `Raised` whose `Native` names it in the binding's table, and the generated caller throws the same object again.
  The last drop of a `Raised` that no caller threw again removes its entry, as GN-6u states.
  The interface is declared as a Python `typing.Protocol` in `<root>._types`, a Node interface and a PHP interface
  that the extension registers. The binding crates depend on `polyspec-binding-core` with the feature `construct`.
  The crate of a target writes the struct of a callback unit of this contract, its conversion (`in_<unit>`, and
  `kept_<unit>` of GN-6aa) and its trait implementation only when a value of the unit enters a member of this
  contract: as a parameter, as a field of a record, or as an item of a list, an `optional`, a map or a tuple of one.
  A unit that only a class implements (GN-6w), or that only another repository takes (GN-6s), keeps its declaration,
  which a user and the other repository name, and has no wrapper in the crate. Why: no code of the crate would call
  that wrapper, and the build of the crate refuses dead code (`clippy -D warnings`); the class calls the trait
  method on its held value, and the other repository wraps the unit in its own crate. A unit whose values enter
  only parameters with `keeps` (GN-6aa) has no trait implementation on that struct in Node, PHP and WASM: the
  methods of the struct are its own (`impl CbFeed { fn get(…) }`), which the kept wrapper calls on the struct that it
  borrows for a call, and Go, whose kept wrapper calls a kept func, has neither the struct nor `in_<unit>`. Why: a
  trait that the core keeps is usually `Send + Sync`, which the struct of a call, holding a value of the environment
  of the language, is not, and code that no member reaches is dead code. Python keeps the trait implementation,
  because it holds the object as a `Py<PyAny>` with or without `keeps`. A unit that a parameter with `keeps` holds
  and a parameter without it lends (`sample.ask` of the end-to-end sample) has no trait implementation on that
  struct in Node, PHP and WASM either: these targets convert each of its values through the kept wrapper
  (`kept_<unit>`), at a place without `keeps` too, where the value is the kept wrapper itself (`KeptCbFeed`) or its
  box with the lifetime of the call. Go keeps the struct of a call and its trait implementation at a place without
  `keeps`, because that struct holds two numbers and a thread id, which are `Send` and `Sync`. Why: the generator
  reads no Rust, so it cannot tell whether a kept trait requires `Send` and `Sync`, and a trait that requires them
  does not take the struct of a call at any place, while the kept wrapper holds only a `Native`.
- **GN-6z** A function type (T-2) is taken by the core as
  `Box<dyn Fn(<parameter>…) -> Result<R, binding_core::Failure<E>> + Send + Sync>`, by value: each parameter is
  borrowed as an argument of a callback member is (T-1, GN-6d), `R` is the Rust type of the return (`()` for `none`)
  and `E` is the core error. A generated crate names this type by a type alias, `Function` and eight hexadecimal
  digits of the SHA-256 of the type, and writes the type once, in the definition of the alias at the end of the
  crate, because the lints deny the boxed type at a `let` and as the result of a closure
  (`clippy::type_complexity`). The core may keep the function after the call (template `engine.register`), so the form
  is `'static`, `Send` and `Sync`. The form returns its result when the call returns, so the binding awaits nothing
  that such a function returns: its type states `async_allowed: false`, with `keeps` and without, and a type of this
  form that states `async_allowed: true` is refused by `binding check` (CK-17) and by the generator of every target
  with one sentence, which both read from one function (`asyncFunctionRefusal`). Only the function of a machine
  (GN-6ae), whose return is `passthrough`, is awaited. A Node or WASM function of this form that returns a promise
  is not awaited: the promise is the value that the binding converts as the declared return, which is kind
  `invalid_argument_type` of the conversion for a return that a promise is no value of, a `Raised` for the core;
  where the return is `none` the promise is dropped, and its rejection reaches no caller. Awaiting a kept function is
  not designed yet (B2.483). When the value enters it must be callable (kind `invalid_argument_type`) and, where
  the function is given one argument or more, take them (kind `invalid_callback`, GN-6bu). A call
  converts the arguments out and the result in, and an exception of the language code, or a failure of the binding in
  the call, goes to the core as a `Raised`, as GN-6d states. A record of another library among the parameters or the
  return of a function type, also inside a list, a map or an optional, is converted by `out_<record>` and `in_<record>`
  of the module `library_<library>` (GN-4c), which the crate defines as it does for a parameter of a member: a crate
  calls only the conversions that it defines. Python holds the callable in the function and declares
  the parameter as `collections.abc.Callable`. Node, PHP and WASM hold a language value that belongs to one thread and
  one environment, so the function holds it as a `Native` (GN-6u) and declares the parameter as a function type
  (TypeScript `(…) => R`, PHP `\Closure`): a call on a thread other than the owner of the `Native` is kind
  `wrong_thread`, and a call after the cleanup of the owner (the env of Node, the request of PHP) is kind `internal`;
  either goes to the core as a `Raised` whose `Native` holds its `BindingError`, which any thread may hold, because the
  error object of the language is made on the owner thread only, where the failure is converted. Go declares the
  parameter as `func(<parameters>) (<R>, error)`, and as `func(<parameters>) error` for `none`; where a func is required, a nil func is kind
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
  is the panic of the call. A parameter with `keeps` (GN-6aa) is a function that the member only stores, so a row of
  its case shows no call of the member, and the member has no such test; the later call that runs the function has it.
  Why: the member returns before the core calls the function, so the test required an error that the member cannot
  return (template `engine.register`, a func the test never ran). For a case whose receiver was given a func with a row in an earlier call and whose
  member names `core.failure`, the test requires the same of that later call, and that the count of
  `thrown-count-test` is 0 after the error. No Go test gives a result of another type, because the Go type of the
  func fixes its result.
- **GN-6aa** A callback inside another type (a field of a record, an item of a list, an `optional`) is taken as
  `Box<dyn <core trait> + 'a>`, where `'a` lasts for the call; `Send` and `Sync` are what the trait requires. A list,
  an `optional` or a record that holds a callback is passed to the core by value, an exception to T-1, because the
  binding makes the value for each call, so it has nothing to keep, and a borrowed list would not let the core call a
  member with the receiver `&mut self`. The core type of a record with a callback field has one lifetime parameter
  (`polyspec_x::Options<'a>`); the contract names it by its path in `core_type`, and the generator writes the lifetime
  where it names the type: the lifetime of the call in every target, `'env` in Node, whose callback lives in the
  environment of the call, and `'call` in Python, PHP, WASM and Go, where the struct of the call of a callback
  (`Cb<Unit><'call>`) holds a `PhantomData<&'call ()>` that borrows `call_`, a local of the entry point, so the
  compiler cannot read it as `'static` (B2.402). A value that the core keeps, a field of a record parameter with `keeps` and its default too, has no anchor and stays `'static`; the crate defines each anchor that it calls, also of a unit that a target converts through its kept wrapper. Why: with `'static` a core could keep a callback of a parameter without
  `keeps` and call it after the call; Go then ran it through the `cgo.Handle` of a call that had ended, which crashes
  or silently reaches the objects of another call, and the other targets held a language object that no call
  guarded. Such a record is generated where the binding makes it from the arguments of the call, as a record
  parameter (T-4), and refused by name at another place. A callback that the core keeps after the call is `Box<dyn <core trait> + Send + Sync>` (`'static`), which
  Node, PHP and WASM give on the native lifetime as GN-6z states. The contract states it on the parameter whose value
  the core keeps, with `keeps: true` (U-2): the parameter is a callback unit or a function type, or a record, a list
  or an `optional` that holds one, and `binding check` reports the attribute at any other parameter (CK-90). A
  function is `'static` with or without `keeps` (GN-6z), so at a function `keeps` changes only where its failure
  goes (GN-7). The contract has to
  state it, because the lifetime is no part of the path in `core_type` and the generator reads no Rust: for a
  parameter with `keeps` the generator writes `'static` where it names the box and the core type of the record
  (`polyspec_x::Options<'static>`) in every target, and for a parameter without it the lifetime of the call. The
  compiler judges the core (I-2): a core that keeps the value of a parameter without `keeps` does not compile in any
  target, whose box lasts for `'env` or `'call`. A callback inside a parameter with `keeps` outlives the call, so the
  wrapper that holds the language object for the call does not suffice: Node, PHP and WASM hold the object as a
  `Native` of its owner thread (GN-6u), as a function type is held (GN-6z), and Go asks package `binding` for the
  `cgo.Handle` of a kept func (`Call.Keep`) that reads the number of the member first and runs that member of the
  object. A call of a member on the owner thread converts as GN-6d states; a call on another thread is kind
  `wrong_thread`, and a call after the cleanup of the owner (the env of Node, the request of PHP) is kind `internal`,
  each a `Raised` whose `Native` holds its `BindingError`. The wrapper holds only the `Native`, so it is `Send` and
  `Sync`, and a trait that requires them takes it. Python holds the object as a `Py<PyAny>` with or without `keeps`.
  A member of a kept callback that recognizes an error unit (U-3) gives the core the kind of such an error in every
  target, as the member of a callback of a call does (GN-6d): Node, PHP and WASM call the member of the struct of the
  call, which recognizes it, and in Go the run of the kept func gives status 2 with the key under which the table of
  no call holds the error that the recognized value wraps, its kind and its message; a kind of the unit is the core
  error of the kind and removes the entry through `<prefix>__go_release_raised`, and any other kind goes back to the
  caller as the same error. Why: whether the core keeps a callback is no part of how its error is classified, so a
  kept callback that gave its error back unclassified would make the core see a raised error where the contract
  names a kind (the case `a_kept_source_that_raises_a_recognized_error_refuses_the_key_in_a_later_call` of `index.get`).
  The end-to-end sample keeps a list of callbacks in an instance of a class and calls them in a later call
  (the class `index` of `tests/e2e/sample`). A callback parameter with `keeps` that is no item of a list or an
  `optional` moves into the core as its box, by value (`index.single`). A record parameter with `keeps` is made from
  its fields with the conversion of a kept callback, and its core type is `'static` (`index.supplied`); Go reads the
  fields of that record in the entry point itself, not through the reader of the record, whose callbacks last for the
  call only.
  A record whose field holds a callback, also inside an optional, a list, a map or a tuple of the field, moves into the
  core as a parameter with such a type does; and a field with a default of a record parameter with keeps is read as
  any argument with a default, through the conversions of its kept callbacks (B2.301).
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
  class implements with a receiver other than `&self`, and an abstract class (U-1). A member that the class declares
  itself, whose core path is a method of the trait of such an interface (`<trait>::<method>`), calls that trait and
  raises the `Failure<E>` that it returns as well: the kind goes to the error of its variant (E-1), and the other
  failures go the way of the failure of a callback (E-1c), without `core.failure`, which CK-21 keeps for members that
  reach language code.
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
  the core, because an instance that language code makes has none (GN-7a). A callback unit of this contract that
  recognizes an error unit of another library is refused by name (G-4); a callback unit of another repository
  recognizes the error units of its owner as GN-6s states.
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
  - Go: a `context.Context`, the first argument `ctx` of the function wherever the parameter stands in the contract
    (an `optional` is a nil `ctx`), because Go passes a context first; the other arguments keep the order of the
    contract, and the binding gives the core the cancellation at its place in the contract. A member with more than
    one parameter of the type is refused by name for Go, which takes one context. The
    binding reads `ctx.Err()` and otherwise registers `context.AfterFunc`, which fires the trigger on the goroutine
    that the context starts; no goroutine waits or polls. The handle of the trigger is released when the Go value that
    keeps it is unreachable (`runtime.AddCleanup`): the context keeps the func of `context.AfterFunc` until it runs
    it, and a context that is never done, such as `context.Background()`, keeps nothing.
  - PHP: the generated final class `Cancellation` of the namespace of the extension, with `__construct()`,
    `cancel(): void`, which is idempotent, and `isCancelled(): bool`. It is not of the root namespace, because a
    process registers a class name once and two extensions that take the type are loaded together. One PHP process runs no language code while a core call runs, so
    `cancel()` is called between calls: by a signal handler (`pcntl_async_signals`), by a callback of the core, or by
    host code that reads a state shared with another process before a call and calls `cancel()` when that state says
    so. The binding knows no such state; the repository that needs it writes that host code (GN-6ag).
  In a case a value of the type is `{"cancel": "fired"}` or `{"cancel": "open"}` (GN-13, CK-22): the generated test
  makes a language value that has fired, or one that never fires, and passes it. Why: the caller alone cancels, by
  the cancellation that its language already has, and the core observes it through one type.
- **GN-6e** A value alias with `core: {in, out}` (U-7) enters as the `HostValue` that the binding describes one level
  at a time (B-1) and the core's `in` function judges through `HostValues`; its failure is the core's kind or the
  exception that language code raised while the core walked the value (a getter, an iterator), thrown again unchanged.
  What a language value is as a `HostValue` is binding's rule: Python takes the exact built-in types (a subclass of
  `int`, `float`, `str` or `bytes` is `Other`), a `str` as its UTF-8 bytes and a `str` that holds a surrogate as its
  code points; WASM takes a string that `isWellFormed` as its UTF-8 bytes and any other string as its UTF-16 units, so
  that a common text crosses the boundary once, as one text (B2.89); Node takes a number as `UntypedNumber`, a bigint as `Int` (its decimal
  token outside `i64`), a string as its UTF-16 units, an Array, a Map, a plain object (prototype `Object.prototype` or
  `null`, own enumerable string keys), a Date, a function, a `Uint8Array` as `Bytes`, because the out row `bytes` makes
  a `Uint8Array` and a value that the binding gives must enter again as the same value, and a typed array of another
  element type or a symbol as `Other`; PHP takes an
  element that is a reference as `PhpReference` with its identity, an array with `array_is_list` (the binding reads
  each key as an int or as the bytes of a string, so a string key that is no UTF-8 is a key like any other; the list
  test of ext-php-rs reads a string key only as UTF-8 and panics on another, so the binding does not call it), a stdClass under one
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
  The content of the kind `int` is an i64, so a member whose one parameter is `int64` also takes it as it is (B2.305).
- **GN-6at** During one incoming host-value walk, each Python list or dict and each JavaScript Array, Map or plain
  object has one handle and one description. Repeated descriptions of the same container reuse that description;
  distinct containers retain distinct handles. The walk holds the original container until it ends, so an identity
  cannot be reused after a container is collected. This lets the core recognize shared containers and cycles by
  their handles, and avoids reading an iterator or property list again at a repeated position. The core still
  decides whether a cycle is accepted and which error kind rejects it.
  The sample fixture rejects an already open container handle with kind `unsupported` and the description
  `a container cycle`, while distinct handles beyond its depth limit give `a value nested too deep`; a shared
  container outside the current open path is accepted. Native tests exercise those distinctions in Python,
  JavaScript and PHP, and require one iterator read when a JavaScript Map is shared (B2.270-1).
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
    takes that alias as its one parameter and returns it: after one warm-up call (in Node followed by one turn of the
    event loop), the test counts what the binding holds, gives that function a new instance of a class of the test,
    checks that the result is the same object, drops it, makes one more call, which empties the release queue, and
    counts again, which must give the first count. The test awaits nothing from the first count to the second, because
    an await there lets the engine release objects of earlier tests, whose Natives the table holds, and the count
    would then belong to those objects: Node runs the napi finalizers of wrapped objects in a `SetImmediate`, and WASM
    runs its `FinalizationRegistry` between tasks. A `Native` that the subject entered as is dropped on the owner
    thread in the call, which releases it at once, so no turn is needed between the counts; WASM takes its glue module
    before the first count. The count is the number of live references of the subject
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
  and of the WASM module hands the classes over when the module loads, after the classes of GN-6x; WASM checks an
  instance by the `Symbol.hasInstance` of the class and makes one by `Reflect.construct`. Out: the constructor has one parameter. A
  bool, an integer or a float of the kind of the row is passed to it (Node and WASM: a bool or a float); a keyed map of the
  alias takes the entries of the kind `object` or `map` as a new map of the language (a `dict`, a `Map`), which the
  instance keeps (GN-6af), so the binding makes the instance on the empty map and then gives the map each made entry;
  the alias itself takes the value of the kind `reference`: the binding makes the instance on the null of the
  language and sets the made value through the writable property of the class that has the name of the parameter,
  as an assignment of the language does (WASM: `Reflect.set`).
  An object and a reference are therefore made before their content and are the same instance at every position of
  their handle (U-7 (d)), so a cycle through them is made. In: an instance of the class is `HostValue::Value` with
  the kind of the one case of the row, which has no `when`, and `read` of `HostValues` gives the public property that
  the case names: a property of the type bool, an integer or float is the `HostValue` of that type, because a number
  of JavaScript alone does not tell an integer from a float, and any other property is described again by the rules
  of the language. An instance whose property is described again has one handle within one walk of the core (Python
  by its address, Node and WASM by a `Map` of the walk); an instance that holds a bool or a number is a value and needs none.
  A row whose type has the name of a class that `only` leaves out for the target (GN-6af) names the type of the
  language there, as the `reference` of PHP does. `package.json` names the npm package of the owner (GN-3e). Refused
  by name (G-4): a member that is no public constructor, a constructor with another parameter, a reference whose
  class has no such writable property, an `in` row with several cases or a `when`, and a `read` that is no public
  property of the class. Go takes such a class when it is a value class without core_type (GN-6af), the struct of
  the package of the owner, whose Go module go.mod requires (GN-15f): an `in` row reads the property of the pointer,
  its field when the property is writable and its method otherwise, as node 11 with one handle per pointer of a call,
  and describes the keyed map of the owner that such an instance keeps as a map of its entries; an `out` row is node
  14 of the result (GN-15c) with the position of the class, whose decoder makes the instance by the constructor of the
  owner on an empty keyed map or on nil and then sets its entries or its writable property. An `in` row of Go may
  also name a class with core_type of the owner, as Node and WASM read it: node 11 with the kind of the row, whose
  read calls the method of the property, which gives its value and an error (B2.497). Refused by name in Go (G-4): an
  `out` row that makes a class with core_type, and a constructor that takes a bool, an integer or a float. PHP has no such class (GN-6af, CK-78), so a PHP row
  that names one is refused by name too. The generated tests of Python, Node and Go write a case value of the kind of
  such a row as an instance of the class of the owner, and read a result by the classes of the owner, both through
  the package of the owner, which the test imports (GN-13, GN-13e). Go makes the instance by `New<Class>` of the
  package of the owner on nil and then sets its entries or its writable property, and compares a result by
  `reflect.DeepEqual` and by the places of the pointers of the classes of this repository and of the owner. The
  fixture of the end-to-end check is `tests/e2e/sample` with `tests/e2e/consumer`: the alias `data` of the sample makes a map whose keys are the indexes
  of its entries as the class `box` and a reference as the class `cell`, and reads an instance of the class `ratio`
  as its float in Node and WASM; the cases of `consumer.pair` pass a reference and such a map both ways. No row makes
  an instance of `ratio`, because the row of the kind float would then change every float of the fixture, so the
  constructor that takes a float runs in no end-to-end check. Why: the owner's core gives and takes the value, and
  its class of the language is the only form in which a user of both packages can pass an instance from one to the
  other.
- **GN-6bb** An `out` row of a value alias of this contract may have the kind `nested:<value type>`, where the value
  type is a named type (T-3) of another repository that `binding_core::ValueType` has (`json_value`,
  `template_value`, `php_value`), with the make `{value: <value type>}` for each target, in one row without `when`
  (CK-8). The core gives `OutValue::Nested { value_type, value }`, where `value` is described in the kinds of the
  `out` table of the value type and its children come from the same source, so the arm calls the make function of the
  value alias or value class of that repository, which the binding converts as it converts a named type that a member
  names, with the source and, for a value alias without an owner class, the made containers of the walk. The five
  targets generate the row. Refused by name (G-4): another make of the kind, a row with `when`, and a value type that
  `ValueType` does not have. Why: the core keeps a value of another repository inside its own value, and only the
  binding of that repository's value type knows how a language holds it.
  The source is a parameter of the function that opens a level of the walk, in Go as in the other targets, because a
  nested fn item of Rust captures no local of the function around it. Why: the Go crate of orm, whose value alias
  `orm_value` makes a list, a map and a nested `json_value`, read the source of the make function inside its
  `open_level` and failed with E0434.
- **GN-6bc** An `out` row of a value alias whose make is a member of a class of this contract that takes one parameter
  of the type `list<alias>` (kind `list`) or `map<alias>` (kind `map`) is made in two steps: the walk makes the
  children by the rows of the alias into the array of the language, as the built-in form does, and when the last
  child is made the conversion of the parameter takes that array, the member's core path makes the core value and the
  instance of the class leaves. PHP generates it; the other targets refuse it by name (G-4), because no contract
  makes such a row for them. Why: the core value of the class holds core values of the alias, which the binding
  only gets back from the made children through the `in` function of the alias.
- **GN-6be** A Go value alias whose `out` rows make an instance of a class of another module makes it through the
  exported `<Class>FromHandle` of that module's package (GN-15a), which `aliasInstance` of the decoding package calls;
  a class of the same package is still made by its handle. Why: the handle and the constructor of a class are
  unexported, and `binding.Token` keeps the exported function to the packages of the binding.
- **GN-6bf** A member of a callback unit of another repository names the types of the contract of its owner, so a
  case value of a fixture of that unit, an argument or a result of a row or of an expected call, is written with the
  named types of that contract resolved to units of their libraries (T-3), in the five targets. Why: a named type is
  a name of its contract, and the value alias that it names is the one that this contract converts.
- **GN-6bg** A Node method or property whose name is a Rust keyword is the Rust function `method_<name>` without the
  raw identifier, and its JavaScript name stays the attribute `js_name`. Why: the macro `napi` joins the Rust name of
  a method with a suffix, and `r#where_c_callback` is no identifier, so the macro panics.
- **GN-6bh** A parameter of a constructor of a class that holds a callback, directly or in a field of its record,
  keeps it, as `keeps` declares (GN-6aa), without `keeps` in the contract. Why: the instance owns its core value
  (GN-6au), so a callback that the constructor gives the core outlives the call, and in Node a callback that borrows
  the env of the call escapes the body of the constructor (E0521).
- **GN-6bi** Go encodes a field or a value of the type `optional` of a `tuple` through the pointer in parentheses,
  `(*options.Range)[0]`. Why: an index binds before the star, so `*options.Range[0]` indexes the pointer, which Go
  refuses (cannot indirect). An `optional` of a function type has no pointer to dereference (GN-15e).
- **GN-6bj** The Go entry point gives the core the local of a record parameter by the same name that its decoder
  binds, `input_` for a parameter named `input` (GN-15). Why: the entry point binds `input` to the bytes of the call,
  so a core call that names the parameter by its plain name passes those bytes.
- **GN-6bk** A Python name of a parameter, a field or a callable that is a keyword of Python, such as `else`, takes a
  trailing underscore, `else_`, in every place that names it: the dataclass, the stub, the native module and the
  tests. Why: a keyword is no identifier, so `else: list[Node] | None` is a SyntaxError, and PEP 8 names the trailing
  underscore for this case, which no name of the contract has. A key of a case file stays the snake_case name of
  the contract, `else`, because a case file belongs to no language, and every target reads a field of a case value
  by that key: the Go tests named the field `Else` but looked its value up by the Python name `else_`, so a case
  value of the case `Ternary` of template was refused as one without the field.
- **GN-6bl** The trait of a callback unit of another library fails with the core error of its owner: the struct
  that `errors.code` of the owner names (GN-7b), or the error enum of its kinds when it names none. Why: the core of
  the owner declares its trait with that error, as the binding of the owner writes it, so a consumer that wrote the
  code enum (`Failure<ValidateErrorCode>` for `Failure<ValidateError>`) implemented another trait, which does not
  compile.
- **GN-6bm** Go writes no output conversion `out_<record>` for a record whose field holds a function type, in an
  `optional`, a `list`, a `map` or a `tuple` too, and reads the field as every function enters (GN-6z): its return
  value goes from the Go func into the core. Why: a function only enters, so such a record is a value that the
  binding makes from the arguments of a call and never gives back, and a function type has no output conversion, so
  the writer of the record was refused (G-4) where no member needs it.
- **GN-6bn** The end of a machine (GN-6ab) in Node and WASM binds the result of the core only when its output
  conversion reads it: a fallible member that returns none checks the result with `?` and binds nothing, and a
  member that is not fallible and reads no result names it `_result`. Why: the conversion of none reads no value, so a
  bound result is an unused variable, which `-D warnings` refuses.
- **GN-6bo** The manifest that `binding scaffold` writes for Node and PHP declares the feature `thread-test` (U-3)
  whenever the generated crate writes the entry point of that feature: when a parameter holds a function type that is
  no function of a machine (GN-6z, GN-6ae), in an `optional`, a `list`, a `map`, a `tuple` or a field of a record of
  the contract at any depth. CK-19 compares the manifest of a repository with that text, so a manifest without the
  feature is reported. Why: the crate gates the entry point with `#[cfg(feature = "thread-test")]`, and a feature that
  the manifest does not declare is an `unexpected_cfgs` warning, which `-D warnings` refuses; a scaffold that judged the
  parameters alone left out the function in a field (orm `config.audit_source`).
- **GN-6bp** The failure conversions of the owner of a value alias of another repository, `error_of_<library>` and
  `failure_of_<library>` (U-7 (a')), are helpers of the crate in every target: a crate writes them where a conversion
  into the core of that owner calls them, and a crate whose alias of that owner only leaves has none. Why: only the
  `in` of the owner fails with its error, so a crate that gives the alias only as a result, such as orm with
  `json_value`, held both functions without a caller, which `-D dead_code` refuses.
- **GN-6bq** A make of a list or a map of a value alias by a member of a class (GN-6bc) calls the core path of that
  member with its argument in the form that the entry point of the member passes it, the borrow of the made list or
  map by T-1. Why: the constructor and
  the make call the same path, so one signature of the core must take both; the make passed the value where the
  constructor passed the borrow (orm `map_value`), and no signature compiled both.
- **GN-6br** A case value `{"kind": "text", "value": <text>}` of a value class of another repository (GN-6x) whose text
  holds an unpaired surrogate is made by the out row of the kind `text16` of the owner, from the UTF-16 code units of
  the text, in every target, where the owner has such a row; another text is made by the row of the kind `text`.
  Why: the make of a text takes a text of the language, which an unpaired surrogate is not in every language: json
  refused `Value.string("\ud800")` before the core ran, Go does not compile it, and PHP wrote U+FFFD, so the case
  passed without the refusal that it states; the row of `text16` (B2.81) gives the owner the text as the case states it.
- **GN-6bs** Python: every module `m` of the contract is the one private module `<root>._module_m` (a `/` of `m`
  is `__`), and the root module is `<root>._root`; each holds the public and the internal names of its module, its
  `__all__` the public ones, and `<root>/__init__.py` re-exports them by `from ._module_m import *`. No module of the
  package has the name of a module of the contract, and the module of a public unit, which its class names, is
  `<root>`. The rule holds for every module, not only for one whose name a member takes. Why: a submodule that Python
  imports rebinds the attribute of its name in the package, so the file `format.py` of the module `format` of
  template replaced the function `format` that `__init__.py` re-exported by the module, and `pkg.format(...)` failed
  with `'module' object is not callable`; a name that changed only where a member takes it would make the path of a
  module depend on the names of the members, and the prefix `_module_` keeps the fixed modules `_errors`, `_types`,
  `_native` and `_root` apart from a module of the contract of the same name. The legacy package of template exported
  its API from `polyspec.template` alone (`__init__.py`) and no submodule `format`, so the package root is the public
  path that this keeps.
- **GN-6bt** The conversions of a record or a variant of a cycle, a set of records and variants of which one
  reaches itself through the types of their fields, use no native stack in proportion to the depth of the value, on
  the five targets. `out_<unit>` and `in_<unit>` neither call themselves nor a conversion of another unit of the
  cycle: each walks the value in a loop with a work stack on the heap, which holds one frame for each level. Out walks
  the core value: the values of units of the cycle that a value holds are listed in the order of its fields
  (`cycle<k>_kids`), each is made before the value that holds it, and `node_out_<unit>` makes the value with the made
  ones at its places. In first judges a value of the language as `node_in_<unit>` does and keeps the values of the
  language at its places of units of the cycle (`kids_<unit>`), converts them, and then converts the value with them;
  a failure of a field of the value after such a place is raised after the places before it are converted, so the
  first failure in the order of the fields is raised, as before. Go reads its bytes up to the first place whose bytes
  are not converted yet, converts that place first and reads the value again past the bytes of the converted places,
  so a value with `n` such places is read `n + 1` times. A cycle whose fields hold a callback or a function, whose core
  types carry a lifetime of the call, or a tuple that holds a unit of the cycle, keeps the conversions that call each
  other. A narrowing of a field (GN-12a) is judged when the value is converted, after its places. The walk of the core
  values loops over a list or a map of a record field by the field itself, `value.<field>.iter()`, and borrows the
  field only where a reference is needed, at an `optional` and at a unit of the cycle (`&value.<field>`); a field of a
  case of a variant and an item of a loop are references already. Why of the borrow: `&value.body.iter()` borrows the
  iterator, and a reference to an iterator is no iterator (E0277), so the `body` of template, a list of `Node`, failed
  the build of every target (B2.390). Why: a debug WASM
  module has 1 MiB of stack, and the case `parse depth-limit-unary` of template, a `Unary` expression nested 62 deep,
  trapped with "memory access out of bounds" in `out_expr`, which called itself at each level; the binding cannot
  enlarge the stack of a host, a larger stack only moves the depth at which the process ends, and the value alias
  conversions take the same approach (GN-6as).
- **GN-6bu** A callback takes the arguments that the binding calls it with (U-3, T-2, B2.467). A callback place is a
  member of a callback unit (GN-6d, GN-6s), the function of a member with `machine` (GN-6ae) or a value of a function
  type (GN-6z), at a parameter and at any place of a record field, a list, a map, an optional or a tuple, because every
  place enters through the same helper (`in_<unit>`, `callable_in`, `kept_function_in`). Every place that is given one
  argument or more is checked, with no mark in the contract; a place that is given no argument has no check. The check
  runs when the value enters, which is before the locks and the core call of the entry point (GN-8a), so a refused
  callback is never called, the member does nothing, and an arming of the member stays for its next call. The refusal
  is kind `invalid_callback` of the category `type` (E-1a), the kind of a callback that lacks a member; a value of a
  function type that is no function stays kind `invalid_argument_type` (GN-6z). The message names the call that
  received the callback, the parameter, the member of a callback unit, what the callback declares and the arguments
  that the binding gives: `Db.transaction(): callback takes 0 arguments, and the binding calls it with 1 (tx)`
  (`BindingError::InvalidCallback` with `arguments`, docs/core-api.md). The arguments of a member of a callback unit
  have their names of the contract in the language, and those of a function type, which names none, their types of
  the contract. The subject of a parameter, or of a field of the record parameter, whose type holds a callback place
  is `<call>: <name>` in every message of that parameter, where `<call>` is the member as the caller writes it:
  `name()`, `Class.name()` and `new Class()`, in PHP `Class::name()`, and in Python `Class()` for a constructor. A
  callback in a field of a record that is converted as a value has the subject that the conversion of its record
  gives it.
  What each target reads:
  - Go: nothing. A `func` type and an interface state the arguments, and the compiler refuses a value that does not
    take them, so Go has no check and no test.
  - Python: `inspect.signature(<callable>).bind(…)` with one positional value for each argument; for a member of a
    callback unit the callable is the bound method. A `TypeError` of `bind` refuses the callable, in both directions:
    one that takes fewer arguments, and one that requires more than it is given. When `inspect.signature` itself
    raises `ValueError` or `TypeError` (a callable of C without a signature) the value passes and is left to its call.
    The message holds the reason of `bind`. The signature is read as `inspect` gives it, with no path of its own for
    a plain function.
  - PHP: the engine is asked through Reflection: `new ReflectionMethod(<object>, <member>)` for a member of a callback
    unit, `new ReflectionFunction(<Closure>)` for a value of a function type, and
    `new ReflectionFunction(Closure::fromCallable(<callable>))` for the callable of a member with `machine`. The
    extension makes the instance and calls `getNumberOfParameters`, `getNumberOfRequiredParameters` and `isVariadic`
    through ext-php-rs, as it calls any method of PHP, so it reads no field of `zend_function` and depends on no
    layout of it. The callable passes when it declares at least as many parameters as the arguments or is variadic,
    and requires no more than the arguments; it is refused when it declares fewer and is not variadic, and when it
    requires more. A callable that Reflection does not describe, whose exception the extension takes, is left to its
    call.
  - Node and WASM: the `length` of the function, the only fact that JavaScript tells of what a function takes: the
    count of the parameters before the first one with a default or a rest. A function whose `length` is below the
    count of the arguments is refused, and so is one whose `length` cannot be read or is no non-negative integer.
    Node reads the property through napi; WASM reads it in Rust (`Reflect::get` of `length`), not in the ES module.
    The generated JavaScript entry of a function and of a method of a class declares its parameters
    (`function name(arg0, arg1) { const args = arguments; … }`), so its `length` is their count, and counts the
    arguments that it was given in `arguments` (G-7): an entry that took them as a rest alone had the length 0, and an
    instance of a class that implements a callback unit (GN-6w) would be refused at the place of that callback.
  The targets differ in two ways, each for a reason. JavaScript is stricter than PHP and Python about a rest and a
  default: `(...args) => …` and `(tx = null) => …` are refused where `fn (...$args)`, `fn ($tx = null)`,
  `lambda *args: …` and `lambda tx=None: …` pass, because `length` is all that can be read, and a function that names
  no argument cannot be told from one that ignores them; the message tells the remedy, to name each argument before a
  default or a rest, as in `(tx, ...rest)`. JavaScript is looser about the opposite mistake: a function that names
  more parameters than the arguments passes, because a parameter after the arguments may be optional by the code of
  the function, which `length` does not tell, so such a function would be refused wrongly; PHP and Python know which
  parameters are required and refuse a callback that requires more.
  Generated tests (G-5): for the first parameter of a callback unit with a member that every object has and that is
  given an argument, for each function parameter of a member with `machine` and for the first parameter of a function
  type, each with one argument or more, the tests of Node, WASM, PHP and Python refuse a callback that takes no
  argument: kind `invalid_callback`, the class of the category `type` (in Python the exact class is not
  `TypeError`), a message that holds the names of the arguments, and an empty record of the calls of the callback.
  PHP and Python also refuse a callback that requires one argument more than it is given. Where the core call of the
  member holds a fault injection point that fills one kind, the first test arms it before the refused call and
  requires the next call, with a callback that takes the arguments, to fail with that kind and to leave no fault
  (GN-8a); `tests/e2e/sample` has the point `resolve` of `sample.resolve` for it, a member that takes a callback
  unit, because the sample has no member of a function type that the core calls. A member with `machine` arms each
  wait and not its entry (GN-8a), so its test has no such part. The fixtures of the generated tests of Node and WASM
  declare their arguments, since a fixture that named none would be refused: a member of a callback fixture is
  `[<name>, (call) => (arg0, …) => call(arg0, …)]`, a function fixture is `(arg0, …) => { … }`, and a placeholder
  callback is `(arg0, …) => null`; those of PHP (`mixed ...$args`) and Python (`*args`) are variadic and pass.
  Why: orm `db.transaction(callback)` gives the callback the `Tx` of the transaction. A callback written without it,
  `() => db.execute(…)`, ran in Node and PHP with the argument dropped, so every statement ran outside the
  transaction, on the connection of `db`, and nothing said so; Python raised its own `TypeError` from inside the
  member, after the transaction began. A check of marked places would leave every unmarked place with the same
  silent loss, so every place with an argument is checked.
- **GN-6as** A conversion of a value alias (U-7), of a value alias of another repository (GN-6k) and of a value class
  of another repository (GN-6x) uses no native stack in proportion to the depth of the value. The function
  `make_<name>`, which makes the value of the language from the `OutValue` of the core, never calls itself or a
  conversion of the alias. When a row makes a container, it walks the value in a loop with a work stack on the heap;
  when no row makes a container, the value has no children and a depth of one, and the function is one match over
  the rows, with no loop and no stack, which would never hold a level. The stack holds one level for
  each container whose children are not all made: the handle of the container, its length and the index of its next
  child, the container of the language that takes the made children, and, for an entry of a map, the made key until
  its value is made. A container that a later position may name again (U-7 (d)) is made and kept under its handle
  before its children, so a cycle is made as before; an instance that a member of the owner makes from its made
  children (GN-6x) is made when its last child is made. The children are asked for in the order of the value, each
  entry once, its key made before its value. The binding describes a value of the language one level at a time
  (B-1), so the walk of an incoming value is the loop of the `in` function of the core, and the binding adds no level
  of its own to it. Why: a value within the depth limit that a contract states has the same result on the five
  targets; the binding cannot enlarge the stack of a host, such as the main thread of Node or the stack of a WASM
  module; and a larger stack only moves the depth at which the process ends. PHP makes an array, which is a value,
  when its last child is made, and keeps the key of an entry of an array or of a stdClass as the `OutValue` that it
  is until the value of the entry is made. Go writes the node of a container before its children, in the order in
  which package binding reads the nodes, so a level of Go holds no container of the language: it names which
  children of the container are written next. Generated for the five targets.
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
  the tests of every other target; for a constant that is also its assertion against the constant of the core, and the
  default of a field or a parameter that names it is asserted only where that field or parameter is generated. Why:
  orm states `only` without `wasm` at `default_retry` and `default_pool_acquire_timeout_ms`, whose constants its core
  defines only with the feature `runtime`, which the WASM build lacks, and the WASM crate asserted them (E0425). A value alias (U-7) is an
  alias of a target only when a generated member, record, variant, class, callback, interface or error unit of that
  target names it, directly or through an alias that it names, by a type or by a row of the kind `nested:<value type>`
  (GN-6bb): a target where no such unit names it has none of its
  conversions, its host, the imports and the throw table that they need, its entry of `codec-test` and its cases, the
  way every target has none of the alias of a unit with `only` without that target. Why: every member of orm that
  names `orm_value` states `only` without `wasm`, while the alias has none, so the WASM crate kept the imports of the
  host values and the throw table, unused, and the entry `__aliasInValue` of `codec-test`, whose conversions were left
  out as unused (E0425). The units that name it are those of this contract and of other repositories alike, such as a
  callback or an interface of another repository that a parameter takes, a record or a variant, and a unit of another
  repository is read as its contract writes it: a unit of its own library without the library, or by a named type of
  its contract (T-3). Why: hyper reaches `php_value` of php-serialization
  only through the interface `store` of session-store, whose members name it by a named type of session-store, and every target dropped the alias
  (`no <lang> input conversion for php_value`). A parameter with `only` is a parameter of the targets that it lists alone: every
  other target has no such parameter in its signature, its declarations and its rules of place, and its binding gives
  the core the parameter
  as left out (`None`). The parameter therefore has a default or an `optional` type, whose core parameter is an
  `Option`; one without either is refused by name (G-4). A case that gives the parameter a value is a case of the
  targets of the `only` alone, because another target cannot pass that value. Why: a parameter that one language has
  no form of, such as the cancellation of a member that only Python and Node can give, would otherwise refuse the
  whole member, or the whole target, where the language could call it without that parameter. A field of a record with
  `only` is in the same way a field of the targets that it lists alone: every other target has no such field in its
  class, its declarations and its reading of the record, and its binding gives the core the field as left out
  (`None`), so the field has a default or an `optional` type; a field without either, and `only` at a field of a case of
  a variant, are refused by name (G-4). A case that gives a value to a parameter or a field with `only` is left out of
  the tests of the other targets, so that those tests still build, and the contract check reports the case (CK-93)
  until its row of `cases` has an `only` without those targets (GN-13h). Why: a case leaves a target only through the
  `only` of its row, which a reader of the contract sees; a case that the generator left out by itself would hide that
  the test of a target lost it, which CK-92 already reports for the members that instance values call.
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
  and the declarations make it optional. A parameter or a field of a value alias (U-7), or of a value alias or a value
  class of another repository (U-7 (a'), GN-6x), may have the default `{empty: "object"}`: its core parameter is the
  `Option` of its form, the binding passes `None` when it is left out, and the core decides that no value is the empty
  object. The declarations show `...` in Python, `null` in PHP, which a value class does not take as an array, and an
  optional parameter in TypeScript. The U-2 test of GN-13d and of Go gives in its place the case value
  `{"kind": "map", "value": []}`: an empty `dict`, array (a `stdClass` by GN-13v), `Map` or Go `map` for a value alias, and for a value class of
  another repository the instance that the member of the out row of the kind `map` makes from an empty map of its
  owner. Why: an options object of a value type, such as a json value, has an empty object as its natural absence, and
  the core already decides what `None` means. Refused by name (G-4): a record parameter with `{empty: "object"}` that has a
  field without a default, any other `{empty}` default of a value type, any other default of a record parameter, a default of an `optional` type other than
  `{literal: null}` and `{computed}`, a default of a type that is no number, bool, text, latin1, bytes, source, list,
  map, enum, value type or `optional`, a `{literal}` or `{const}` default without `default_core` other than
  `{literal: null}` of an `optional` or a value type,
  a required parameter after a parameter with a default, a `rest` parameter, and a field default of a record that
  also has the result form, other than a default of an `optional` type: the result form of such a field is the value of
  its optional type, so a `None` of the core is the null of the language.
  The PHP stub writes an optional whose PHP type is `mixed` as `mixed`, because `mixed` already includes null and PHP
  refuses `?mixed` and `mixed|null`; its docblock keeps `mixed|null` (B2.302).
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
  Every slash-separated component also refuses a drive prefix matching
  `^[A-Za-z]:`, because a Windows path join can replace its preceding root with a drive-qualified component,
  even when that component is nested or drive-relative. Other colons, such as `report:2026/file`, remain accepted by this validator.
  This lexical rule applies on every host; it does not establish Windows filesystem verification.
  A case writes its files into the same directory before its values are made (GN-13i).
- **GN-7** Whether the core path of a member returns a `Result` is its `core.result` (E-1c); without it, the path
  does when `raises` names a variant of the contract's own core error or a parameter without `keeps` holds a callback
  or a function. The error of such a path is `binding_core::Failure<E>`, a kind or what language code raised, when
  `core.failure` is true, and without it when a parameter without `keeps` holds a callback or a function. A parameter
  with `keeps` (GN-6aa) does not count, because the core keeps that value for a later call (`index.new` of the
  end-to-end sample returns the index itself); a member that calls such a value during the call states
  `core.failure: true`. A function that a member only stores for a later member to call (`registry.register` of the
  end-to-end functions, which `registry.call` calls; hyper `pages.register`, which `page_request.next` calls) is a
  parameter with `keeps` as well: the member that stores it returns the core error without `Failure`, and the member
  that calls it states `core.failure: true`, whose receiver carries the function by GN-6h. The contract states the
  two members and no link between them, because which member calls a stored function is a fact of the core that the
  compiler judges (I-2): a core whose path of either member has another error does not compile. `core.failure: true` names a member that calls language
  code that its receiver keeps (template `engine.render`, sample `index.get`), whose error the generated code converts as that of a member
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
  PHP. An instance that language code makes itself has no value: Python and PHP give `None` and `null`. The
  constructor of a category class and of an error unit, by which language code makes an error with the message, the
  kind, the status and the errno (GN-10), judges its arguments before it makes the error: the message is a text
  (B-3), the kind is a text and one of the kinds of the class, and the status and the errno are each absent, null
  (`None`, `undefined`) or an integer, not a bool. The `.d.ts` of Node and WASM declares that constructor on each
  category class as `constructor(message: string, kind: string, status?: number | null, errno?: number | null)`, and an
  error unit inherits it. Why: the `.d.ts` declared no constructor, so TypeScript took the one of `Error` or
  `RangeError` and refused a consumer's `new XValueError(message, kind)`, which runs (B2.514). The kinds of a class are those that the binding raises as an
  instance of that class itself: for an error unit, the kinds of the rows of `errors.kinds` whose `class` names it,
  without those of the units that extend it, which the binding raises as instances of those units; for a category
  class, the kinds of the rows of its category without `class` (own rows and rows with `library`), the kinds of E-1a
  of its category, and the kinds of the `in` of a value alias of another repository whose category is its (U-7 (a')).
  A kind whose row names an error unit is no kind of the category class, and a unit without a row of its own takes no
  kind. The constructor reads the kinds of the class that is made (`new.target`, `type(self)`, the class of `$this`),
  or of its nearest generated ancestor for a class of language code that extends one, because the constructor of a
  unit calls that of its parent with the same kind. A value of another type, and a kind that is no kind of the class,
  is kind `invalid_argument_type` in the class of category `type`; a message that breaks a rule of text is kind
  `invalid_text` (B-3). Go makes an error unit by `Raised<Unit>(kind, message)` (GN-15d), which returns `(*<Unit>,
  error)` and gives the same errors for a kind that is no kind of the unit and a message that is not UTF-8. Every
  error that the binding raises has a kind of its class, so its raises, made with the constructor or without it
  (B-4), are not refused. Why: the json repository (T3.25-1) found that `new ParseError('Expected JSON value', 0)`
  made an error in Node whose kind was the number 0; no target judged the arguments, Python had type hints only, and
  PHP without strict_types turned 0 into "0". A wrong kind is kind `invalid_argument_type` and no kind of category
  `value`: E-1a gives `invalid_argument_type` to a value that is no language form of the type of its parameter, and
  the type of `kind` is the closed set of the kinds of the class, as a string that is no case of an enum is kind
  `invalid_argument_type` (T-6); the kinds of category `value` of E-1a are each the failure of a rule of numbers or of
  text (B-2, B-3), which a kind text keeps. The kinds of a class are those of its own raises, because an error that
  the binding gives of a kind whose row names a unit is always an instance of that unit, so an instance of the
  category class or of a parent of that kind would escape the `catch` of the unit that every such error of the binding
  meets. The type of a
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
  A contract that has a callback unit (U-1, origin `callback`) has, for each of its category classes and error
  units, an internal maker that makes an instance with a message, a kind, a status, an errno and a value for each
  property, judging the message, the kind, the status and the errno as the constructor does (B2.489): Python
  `<root>._errors._polyspec_make(cls, kind, message, status, errno, properties)`, a dict of the snake_case property
  names; PHP the `@internal` static method `polyspec_make($kind, $message, $status, $errno, $properties)` of each
  class, an array by the same names; Node and WASM the function under `Symbol.for('polyspec.binding.make')` on each
  class, `(kind, message, status, errno, properties)` with an object of the property names of the language; Go
  `Make<Type>` (GN-15d). It is no API for users. It is derived from this contract alone (GN-2): a contract of another
  repository takes an object of this library only through a callback unit of this library, so the binding needs
  not know which contracts name its rows, and a library without a callback unit gives no exception to another
  contract. Why: an instance that language code makes has no property value, so a fixture of another repository
  that raises an error of this library had only null to compare (CK-106). The generated test of the other contract
  writes a raise row `{"library": L, "kind", "message", "status", "errno", "properties"}` (CK-22) as one call of the
  maker of L: on the error unit of L's row of the kind, or on the class of its category, with the values of the row
  and null for an absent `status` or `errno`; Go passes `ptr(<n>)` or `nil` and a `<Type><Property>` for each property.
  The test then reads the converted instance of the member as for any case of a kind.
- **GN-7b** PHP: the binding stores a property `p` of an error unit in the private property `polyspec_p` of the class
  that declares it, and the method `p()` of the class reads it (I-3). Why: the PHP API of the property is its method,
  and `Exception` has properties of its own (`message`, `code`, `file`, `line`, `trace`, `previous`), whose private
  `trace` refused the write of the property `trace` of crud-ui `compose_load_error`, so every raise of the error failed
  with "Cannot access private property" (255 tests); a name of the binding meets no property of `Exception`.
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
  variant has no `<outer>/`, and a row without `library` whose variant has one, are refused by name (G-4, CK-10). A
  row with `library` may name in `through` the callback unit of that library through whose object the kind reaches
  a member, `{"unit": "<unit>", "library": "<library>"}`; the generated code is the same with and without the key,
  which `binding check` reads (CK-10, CK-22). Why:
  the core error holds the error of the library inside one of its own variants, so only the path down to the inner
  variant gives a pattern that the compiler checks against the core error (E-1b (a)).
  The conversion of an exception of L's package (B2.489, CK-105): a member that takes a callback unit of L (GN-6s)
  converts an exception O when its core returned `Failure::Raised` holding O, O is an instance of one of L's six
  category classes or of an error unit of L, found by name in L's package as GN-6s finds them, and O's `kind` is the
  inner kind of a row of L that the member names in `raises`. The converted error is an instance of that row's class
  with the same kind; its message, status and errno are those of O, each property of the row's unit is the value of
  the property of O that the `wrapped` row forwards to it (CK-107), and its cause is O: `previous` in PHP, set by
  `zend_exception_set_previous`, a ZEND_API function of `Zend/zend_exceptions.h` (the same signature in PHP 8.4 and
  8.5) that checks the chain for a cycle and takes over the reference, which the crate declares in an `extern "C"`
  block typed with the `zend_object` of ext-php-rs, since ext-php-rs 0.16.4 binds it not, `__cause__` in Python, the own property `cause` in Node and WASM, and `Cause()` in
  Go (GN-15d). An exception of L of a kind that the member does not name, any other exception and a `Failure::Kind`
  are as before: the first two are thrown again unchanged, and a kind of L that recognition gave (GN-6s) is already
  a variant of the core error and so of this contract's class. PHP, Python, Node and WASM convert in the crate: the
  error path of the member calls `converted_<member>`, which holds the table of the member and gives every other
  failure to `failure_error`; Node converts where the failure is thrown, the one place that holds the environment
  and the pending exception, and Node and WASM register L's classes after the library classes, required from L's
  npm package or imported from its `./wasm` subpath. Go converts at the entry of the member: the dispatch keeps the
  error of the Go value in the table of the call (GN-6d), the entry finds it with `errors.As` against the category
  types and error units of L's package `errors`, and it returns this contract's type, made in `internal/binding`. The
  row gives only the class and the kind. Why: hyper's core passes an exception of a session-store object on as
  `Failure::Raised`, and `failure_error` threw it again, so a user caught session-store's `RecordError` where the
  contract promises hyper's (H35.38); the errno of `Io` is the one that the OS gave L's core, which no row can give.
  Limit: a recognized kind of L that the member does not name gets no class check here either. The generated test of
  a raising case whose fixtures hold one raise row with values of L (GN-7a) compares the cause of the error that the
  member raised with the instance of that row: its class, kind, message, status and errno, through `previous`,
  `__cause__`, `cause` or `Cause()`; a case with no such row, or with several, compares no cause.
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
  its machine instead: its entry takes the arming of the member once, by `armed_waits("<member id>", …)`, and every
  wait of the machine installs that one arming around each of its polls (`binding_core::fault::Armed::wait`), so the
  arming of a call covers every wait of the call and each entry of a member holds one arming and one shield (B2.477).
  The waits share the record of what fired, so `nth` counts the visits of a point over the whole call. Why: a take
  removes the arming, and the generated code took it at each wait (`armed_future("<member id>", io)`), so only the
  first wait ran armed and a fault of a later wait, such as the rollback of orm `db.transaction` after its callback
  raised, never stood. The `advance` of a `Driven` object of Node and WASM (GN-6ab) is an entry point without a core call of
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
  API. The constructor takes each argument as any value (`&Zval`) and judges it by GN-7a, so that no conversion
  turns a value of another type into a string or an integer: the parsed `string $kind` took the kind `0` as `"0"`. The object of an error that the extension raises is made without the constructor (B-4). An enum is a backed
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
- **GN-11a** Python: the shape of a call (a keyword-only argument passed by position, the count of the arguments, a
  missing or an unknown argument) is the calling rule of the language, so a generated function leaves it to the
  `TypeError` of Python, which has no kind; a kind of the contract judges only the values of a call of the right shape.
  So `parse("1", "options")` with `options` keyword-only is the `TypeError` of Python, as a call of TypeScript with
  the wrong number of arguments is no kind (G-7). The generated test passes the keyword-only arguments by position
  and expects that `TypeError`. This rule is of the call of a generated function. What a callback value takes is no
  shape of that call: it is the shape of a value that the binding calls, which is judged when the value enters and is
  kind `invalid_callback` (GN-6bu), not the `TypeError` that Python would raise where the binding calls it.
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
  WASM, whose number holds no larger integer exactly. A negative zero at an `int` or `uint` place is kind
  `invalid_number` in Node and WASM too, which tell it from 0 by its sign, as PHP and Python refuse the float `-0.0`
  there (B2.360); an integral float such as `403.0` is the number 403 of Node and WASM, which no target can tell from
  the integer, so only that difference stays (GN-13bc). Why: one contract gives the same result in every target, and an
  integer that one target takes and another refuses would give two. An `int64` takes the range of i64 in every
  target. An integer key of a `keyed_map` whose contract lists `int` keys is a safe integer too: an integer key
  outside that range, and in Node and WASM a number key that is no integer, is kind `invalid_number` in every target,
  where Node and WASM gave `invalid_argument_type` before; a key of a kind that the contract does not list stays kind
  `invalid_argument_type` (T-2). Why: a refused number has the kind of B-2 at every place, so the same key gives the
  same kind in every target.
  The kind of a refused value at an `int`, `uint`, `int64` or `float` place, in every target, follows one rule, as at
  every primitive place: a value that is no number of the language type that the place takes is kind
  `invalid_argument_type` (category `type`), as a value of another type at a `bool`, bytes or path place is, and a
  number that breaks the rule of its type (a fraction, NaN, an infinity, a negative zero at an integer place, a value
  outside the range) is kind `invalid_number` (B-2). The number types of the languages are a `number` in Node and WASM,
  and for `int64` a `bigint` too; an `int` or a `float` in Python, where a `bool` is no number although it is a
  subclass of `int`; an `int` or a `float` in PHP. So a string, a null or an undefined where a value is required, a
  boolean, an object, and in Node and WASM a `bigint` at an `int`, `uint` or `float` place are kind
  `invalid_argument_type`, while a Python or PHP float at an integer place, and a Python or PHP integer at a `float`
  place, are numbers and stay kind `invalid_number`. A null at an optional number place is the absent value (GN-6i), no refusal.
  Go: a parameter, a field, an item and an optional of a number type hold only values of its Go type, so no value of
  another type reaches the binding through a call; nil at an optional is the absent value, and a value of another
  type reaches the conversion only through `<Type>In` of GN-13g. Why: the core states `invalid_number` as a number
  that breaks the number rule of its contract type (B-2), and every target gave it for any refused value, also for a
  value of another type, which the other primitive places refuse as kind `invalid_argument_type`; the json
  repository reported the difference (T3.25-1).
  A refused value has two layers, and the binding checks only the first (B2.425): the binding checks the contract type
  of the place and gives the kind of the rule of that type, as above, and a kind that the contract states for a value
  of a right type, such as the `invalid_code_unit` of a code unit outside 0 to 0xFFFF at a `list` of `uint`, is
  raised by the core alone, for a value that passed the type. So -1 at a `uint` item is kind `invalid_number`, `"a"`
  there is kind `invalid_argument_type`, and 0x10000 reaches the core, which judges it. Why: the contract types of a
  place hold no rule of the core, and a binding that judged one would state the rule of the core twice; a wrong call
  shape stays the error of the language for the same reason (B2.426).
  Node and WASM: an `int64` parameter takes a `bigint` of the range of i64 or a number of the safe
  integers; a `bigint` outside that range or a number that is no safe integer is kind `invalid_number` (B-2), and
  any other value is kind `invalid_argument_type`; an `int64` result is a `bigint`, so that the whole range
  of i64 leaves, as the declarations say (`number | bigint` in, `bigint` out). A case file gives an integer outside
  the safe integers as its JSON token, which `binding` reads as a `bigint` and every test writes by its decimal
  token, a Node test as a `bigint` literal (G-5). An argument of the type `int` or `uint` outside the safe integers,
  which only a case that raises `invalid_number` gives (CK-64), is the decimal token in every test: a number literal
  in Node and WASM, which a caller of the type passes and which stays outside the safe integers, and a Go integer
  literal, which the compiler takes, so the binding refuses it at run time (B2.359).
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
    it must not wait. The token `Io` carries no cancellation; a member that also takes the type `cancel` takes the
    `context.Context` of GN-6aq.
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
- **GN-6au** The core type of a class is owned (`'static`): each crate asserts it of the `core_type` of each class
  (`const _: fn() = owned::<core_type>;` with `const fn owned<T: 'static>() {}`), so a core type that borrows fails
  the build at that assertion with the reason in its comment; a `core_type` that names a lifetime is no Rust path of
  the schema (CK-1). Why: the instance keeps its core value beyond every call, and the generated struct names no
  lifetime; the generator reads no Rust (I-2), so the build of the crate is where a borrowing core type is found.
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
  path of the property returns (a bool, an integer or a float). This holds in every target that generates the class,
  PHP included: PHP tells the instance by its class, and `read` calls the PHP method of the property and describes its
  result again by the rules of PHP, so a property of any kind (bytes, a map) is read as PHP gives it (B2.492). Before
  B2.492 the PHP host had no such arm, so an instance that a case value or the code of the user passed entered as
  `HostValue::Object`, which orm's core refuses as "an object of the language". Go reads a class with `core_type` the
  same way: package binding cannot name a struct of a module, which imports it, so each module gives
  `binding.ReadValues`, when it is loaded, the kind of the row of each such class of its own and a read that calls the
  method of the property, whose result is described again (B2.497: before, Go passed such a row over, and the instance
  entered as a native or was refused as unsupported). An `out` row whose make names the constructor of a
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
    `<root>._root`, and those of the module `m` in `<root>._module_m` (GN-6bs), whose `__all__` holds only its public
    names; the generated tests call them there.
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
  members are checked when the object enters, and the arguments that each takes (kind `invalid_callback`, GN-6bu),
  `thread: owner` holds, and each trait method
  calls the method of the language object through the API of its language, so the binding never takes the native
  object of another binding out. A trait method returns the failure of the core error of the owning repository
  (`binding_core::Failure<<owner error>>`, the one error enum of the owner's `errors.kinds`), and an exception of the
  language code is `Failure::Raised`, which the core of this repository passes on. The binding declares no type of
  the unit: the declarations name the type of the owning package (PHP the interface of its namespace, Python the
  Protocol of `<owner root>._types`, Node the type that the owning npm package exports, WASM the type that the subpath
  `./wasm` of that package exports, Go the interface of the package of the unit's module in the owning Go module, which
  go.mod requires), and a user implements that type. Go writes the dispatch of the unit, which decodes the arguments
  of a member and calls the method of the Go value, in each package whose members take the unit, as it writes the
  dispatch of a callback unit of this repository in the package of that unit. A case value at its place is a fixture
  of the callback, whose type has the methods of the owning type, or an instance value, which the class that its make
  member returns gives, as in a case of this repository (G-5, GN-6aa, GN-13f). A member that such an instance value
  names (its `new` or `from`, and the members of its `receiver` and of its `then`) is a member of this contract or,
  when this contract has no member of that id, a member of the owner's contract: the test calls a member of the owner
  through the owner's package as language code calls it (Python the module of the owner's package, Node its npm
  package, WASM the subpath `./wasm` of that package, PHP the namespace of the owner, Go the package of the member's
  module in the owner's Go module), and the class that the member gives implements the unit (GN-6w). A parameter of
  such a member is of a type that holds no unit, because the test reads a case value with the contract of this
  repository; a member that takes a unit is refused by name, which fails the test of its case (G-4, GN-13e). The name of such a unit differs from the
  name of every unit of this contract, which the generator refuses by name otherwise (G-4). A member of such a unit
  whose `errors.recognize` names error units of its owner reads an exception of language code, or the error that a
  Go method returns, as GN-6d states, with the contract of the owner: the classes are those of the owner's package
  (Python the module `<owner root>._errors`; Node the classes that the entry requires from the owner's npm package
  and registers after the library classes; WASM the classes that the entry imports from the subpath `./wasm` of that
  package and registers after the library classes; PHP the classes of the owner's namespace, found by name and read
  in the scope of the owner's category class; Go the types of the package `errors` of the owner's Go module, which
  the dispatch imports under the name `<owner package>errors` and finds with `errors.As` through
  `binding.RecognizeAs`), the kinds are the rows of the owner's `errors.kinds` whose class is a
  recognized unit or extends one, and the core error is the owner's `errors.recognized` on the variant of the row,
  which the trait method returns as `Failure::Kind`. A raise row of a fixture of such a unit (GN-13) throws an
  instance of the owner's class; in Go it returns `Raised<Unit>(kind, message)` of the owner's package `errors`.
  Refused by name (G-4): an error unit of a third library, an owner without
  `errors.recognized`, and a recognized variant of two or more kinds. Why: the owner's core decides what its error
  means, and its contract names the classes and the function that makes the error, so the binding of this repository
  reads no source of the owner.
  The PHP extension declares no module dependency on the extension of the owning package (`ZEND_MOD_REQUIRED`), so
  the configuration of PHP loads that extension first; the generator refuses nothing for it. Why: a
  native object of another binding lives in another module, so the binding of this repository can reach it only
  through the methods that the language gives every object (T-3).
- **GN-6ab** A member with `wait: async_driver` that reaches language code (GN-6q: the type of a parameter or the class
  of its receiver carries language code) names `"machine": true` in its `core` (CK-68), and its core path returns a
  state machine without I/O in place of a future (c6 6.2): a value of `binding_core::machine::Machine`, which owns the
  arguments, so the core path takes each argument by value: a callback as the generated struct (`impl <Trait> +
  'static`), a text as a `String`, and a class parameter only with the borrow `value` (GN-6h). A parameter or a field
  with a default is left out by the rule of GN-6i in each language, and the core path takes its `Option<T>` by value
  too, with no borrowed form: `Option<String>` for a text, `Option<Vec<T>>` for a list, and the record of a record
  parameter, each field `None` when the record is left out as a whole (`{empty: "object"}`). `resume(io)` advances the machine with the output of its last wait (`None` at the start and after a call)
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
    the build tag `polyspec_<library>_thrown_count_test` and runs the call of each such case again, and a case that arms faults
    is in `zz_generated_thrown_count_fault_test.go`, which also needs `polyspec_<library>_fault_test`.
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
    That exception is one value that the test makes before the call, with the message `raised by the function of the
    case`, in every test that calls the member with such a fixture: the test of a case that raises `"callback"`,
    which requires that very value, and the B-4 test of a case that raises a kind after its function raised, such as
    a rollback that fails (B2.476). Why: the function throws the value that the test holds, and the B-4 test of
    Python, Node, WASM and PHP did not set it, so the callback failed with `IndexError` or `ReferenceError` in
    place of its exception (orm `db.transaction`), where the Go test set it.
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
  class, a callback unit or a variant through functions of its package whose first parameter is `binding.Token` of
  `internal/binding`, a type that only the packages of the Go module can name: `<Class>Handle` gives the handle of an
  instance, `<Class>FromHandle` makes the instance of a handle, and `Dispatch<Callback>` gives the dispatch of a Go
  value of the callback, and `Encode<Variant>` and `Decode<Variant>` encode and decode a value of the variant (GN-6v),
  whose own functions are unexported. A package has them only for a unit that another module names, and CK-13 counts their names.
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
  the C ABI read from the core error. A kind whose row names the unit is created as that struct. For each error unit
  that a member of a callback unit of the library recognizes, package `errors` also has `Raised<Unit>(kind,
  message)`, which gives `Raised<Unit>` of `internal/binding`, both returning `(*<Unit>, error)` (GN-7a), because Go code of another module, which implements
  that callback unit as a callback unit of another repository (GN-6s), cannot import `internal/binding` and makes the
  error that the owner's core recognizes through this function. The function is public API of the library, as the
  types of package `errors` are. For each category type and error unit, the package `errors` of a library whose
  contract has a callback unit also has `Make<Type>(kind, message string, status, errno *int, properties
  ...<Type>Property) (*<Type>, error)`, which judges its arguments as GN-7a does, with `<Type><Property>(value)` for
  each property of the unit and its parents; a category type, which has no property, takes no `properties`. It is
  public API because a test of another Go module must call it, and it is the only way such a module makes an error
  of that library with values (GN-7a). Package `binding` of that library has the generated test
  `zz_generated_maker_test.go`, which makes each type that has a kind with its first kind and each of its properties
  and requires that the maker of every type, one without a kind too, refuses a kind of no type. Why: only a test of another module calls `Make<Type>` otherwise, so the
  `deadcode -test` of the module itself (GN-14) would report it. A contract with a member that converts an exception of another library
  (GN-7c) gives its category types the method `Cause() error`, the error that the converted error came from, nil for
  every other error; `Unwrap` keeps giving the category or the parent, so `errors.As` does not find the type of the
  other library in a converted error, as `instanceof` does not in the other targets.
- **GN-15e** Go `source` and defaults (T-1, U-2, T-4): a `source` parameter is a `[]byte`, which holds the bytes of a
  text too, and its bytes go to the core. A parameter or record field with a default is a pointer `*T`: nil leaves
  it out, and the core decides its value. An `optional` type with a default keeps its one pointer `*T`, because nil
  already means no value (GN-6i). A Go type that is a pointer whose nil is no value of the type takes no second
  pointer, as an `optional` and as a parameter or field with a default: a `map<T>` (`*Map[T]`), a `keyed_map<T>`
  (`*KeyedMap[T]`), a function type (`func(...)`, GN-6z), an instance of a class (`*<Class>`) and a value class of
  another repository (GN-6x). Its nil is the missing value, and the C ABI writes the tag of an absent value for it, so
  `optional<keyed_map<T>>` is `*KeyedMap[T]` and an `optional` of a function type, such as orm `config.audit_source`,
  is `func() (*Map[any], error)`, called as `cfg.AuditSource()`. A `list<T>` keeps its pointer, because a nil slice is
  the empty list, and a text, a number or a bool keeps it, because its zero value is a value. Why: a func of Go is
  nillable and its nil is no func, as the nil of a `*Map[T]` or of an instance is no map or instance, so a pointer
  around it gave none two forms, a nil pointer and a nil func behind a pointer, which GN-6z made kind
  `invalid_argument_type`; a Go caller leaves a func out as nil. An `optional` of an `optional` keeps its second
  pointer, because the nil of the inner pointer is a value of the outer type.
- **GN-15j** The locals of the generated Rust of Go (GN-15): an entry point binds `args`, `len`, `result`, `input`,
  `outcome`, `held` and `this`, and `in_<record>` takes `input`; the fields of a record are bound in both scopes. A
  parameter or a field of the contract with one of these names is bound as that name with a trailing underscore (`input_`), and a record
  literal writes `field: field_`. Why: a parameter of that name would shadow the local, so the reader of the arguments
  or the buffer of the result would take the value of the parameter, which does not compile.
- **GN-15f** Go records of another repository (T-3, GN-6c): a record of another repository is the struct `<Record>` of the package of its
  module in the Go module of that repository, the module of `packages.go` of its contract, which the package imports
  under a name. The name of the package of a root module is the name of its library in lowercase letters and digits
  (`crud-ui-validator` gives `cruduivalidator`), and that of another module is its package name; an import whose name
  differs from the package name writes the name. Why: the package of a root module is named after the repository
  (GN-15), so two libraries of one repository have packages of the same name, and the name of the library tells them
  apart. The same name applies to every package of another repository that the code names: a callback unit (GN-6s),
  a value class (GN-6x) and the package `<name>errors` (GN-15d); the C ABI writes and reads it field by field as a record of this repository, through
  `library_<library>::in_<record>` and `library_<library>::out_<record>` (GN-4c); a record of another repository with a field of a unit type, and
  one whose package has the name of a package of this repository, are refused by name. A library whose contract names no
  Go module (`packages.go`) refuses the Go target of `generate` with the library and that reason, and the other
  targets are generated (GN-1c), as `scaffold` names the Go module alone as not written (GN-3e). `binding scaffold` reads the contract of each library that the
  contract names, as `binding generate` does: the contract of a `path` dependency of the core is the `interface.json`
  of that path, which needs no Cargo, and the contract of any other dependency is found through
  `cargo metadata --locked --offline`, which reads the `Cargo.lock` of the repository as it is and never writes it, and
  reads only the crates that the machine fetched, so a command of binding depends on no network.
  `cargo metadata` resolves the workspace, so it fails where Cargo cannot resolve it: without network for a Git
  dependency that the machine has not fetched, or for a manifest that names a crate that no longer exists. `scaffold`
  then names the Go module as not written (GN-3e), with the status of Cargo and the instruction to run the install
  target of the repository that fetches the crates of its `Cargo.lock` (`cargo fetch --locked`) and to run `scaffold`
  again, and writes the packages of the other targets, which do not read those contracts; `check` and `generate` read
  them for every target, so they fail with the same instruction. For
  each library whose records, value classes (GN-6x) or callback units (GN-6s) the contract names, or the value
  aliases whose Go rows name a class of their owner (GN-6ar), or the members of a callback unit of another library that
  the contract takes name (GN-3e), it writes a line `require <module> <version>`
  in `go.mod`, because the Go binding imports the package of each (B2.87): the version
  is `vX.Y.Z` when the dependency line of the core on `polyspec-<library>` names the version `=X.Y.Z` or the tag
  `vX.Y.Z`, or a `path` inside this repository with the one version `X.Y.Z` of that library beside it (GN-3e,
  B2.460), which gives no `replace` line, because a consumer of the tag of the Go module cannot resolve one (GN-19f);
  any other `path` dependency gives `v0.0.0` and a line `replace <module> => <path>` from the Go module of this
  repository to the Go module of that one, where the path joined to the core is the core of that library, in another
  repository or in this one; every other dependency line (a branch, a commit, a version
  range) is a development form too (GN-3e) and gives `v0.0.0` without a `replace` line, which the development
  checkout resolves through its development link, an untracked `go.work` that names the checkout of that repository
  (`make link` of kit writes it). The Go program then also links the static library of that repository, which the
  end-to-end run builds into the same directory as the one of this repository (GN-14).
  The file of the generated tests imports each package of another repository that its helper `places` names for the
  value classes of a value alias of that repository, also when no test names the package (B2.304).
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
  file, and `binding release-go-module` refuses the commit of a tag that tracks a generated file (GN-19f). A checkout builds its library and names its directory by `CGO_LDFLAGS` (GN-14), which the linker searches
  before the directory of the directive.
  A release carries the Go module, because Go fetches a module as the source of a tag. From the commit of the tag
  `vX.Y.Z` the release of the repository (GN-3c) writes the files of `binding generate` for the target go, builds the crate
  `polyspec-<repository>-go` for each platform with the release profile and without a feature (the library of
  `linux_<arch>_musl` with `--target <arch>-unknown-linux-musl` on the Linux machine of that arch, whose Rust
  toolchain lists that target in `rust-toolchain.toml`; a static library needs no linker, so the crate itself needs no C
  compiler of musl; a dependency whose build script compiles C needs one, which the repository declares, GN-19b), removes the debug
  sections of each library with `llvm-strip --strip-debug` of the component `llvm-tools` of the Rust toolchain that
  the repository pins (the `strip` of a Cargo profile does not change a static library, whose third is the debug
  sections of the Rust standard library), and runs `binding release-go-module` (GN-19f), which creates one
  commit whose parent is that commit and whose tree adds, below the directory of the Go module, the generated
  files that the released form can build and the library of each platform, and removes the tests of the repository
  and the Go files of the programs. The commit carries each generated file
  except two kinds: a file whose build constraint names a build tag of a test feature
  (`polyspec_<library>_<feature>`, GN-13ba), whether it is a test or not (such as
  `internal/binding/zz_generated_panic.go`), and the guard of those tags, `zz_generated_tags_test.go` (GN-13bf). A
  file with a constraint of other tags alone, such as `//go:build musl` of a link file, is carried. Of the files that the commit of
  the tag tracks, the released form leaves out two kinds as well: a test of the repository, which is every file
  `_test.go` that the generator did not write, the files that the overlay of GN-14h treats as absent, and a Go file
  of a program, which is every Go file whose package clause is `main`, in whatever directory. Every other tracked
  file is carried as that commit holds it: a hand-written package such as a host, and a file that is no Go file. One
  function gives, of the files of the module, generated and hand-written, those that the released form carries; it
  reads the name of each file, the build constraint of a generated file and the package clause of a Go file, and
  both `binding release-go-module` and the released form of the end-to-end check (GN-14f) read it and remove a file
  by no other rule (B2.459). The released form of the end-to-end check makes the tags as the release makes them
  (B2.488): a module after the modules of its repository that it requires, with the two `go.sum` lines of each of
  them from `go mod download -json` of their tags in a commit of its own (the function of `binding
  release-go-module`), and then each module builds alone in the tree of its tag with `go build -mod=readonly` and no
  workspace; it holds no list of file names and no name of a directory. Why the tests and the
  programs are left out: what the check proves and what the tag carries are one form. A test of the repository
  reads inputs that the runner of the repository gives (GN-14h), so the `go test` of a consumer over the fetched
  module would fail on it, and the end-to-end check runs a form without it. A program is imported by no consumer,
  since Go imports no package `main`, and it is no part of the library; the programs of the Go module of a binding
  serve its tests, such as a probe that a test starts. Why the package clause and not a directory `tests`: the
  clause is what Go reads to tell a program from a package, while the name of a directory would leave out a
  package that a consumer can import and carry a program placed elsewhere. A repository that publishes a command
  for `go install` gives it a Go module of its own. The `go.mod` of the released form is the one
  of the commit of the tag, byte for byte. Its `go.sum` holds the lines of the `go.sum` of the commit of the tag
  and, for each Go module of the same repository that the `go.mod` requires at a release version and each one that
  such a module requires in turn, the two lines of that module, its hash and the hash of its `go.mod`, sorted in as
  binding sorts a `go.sum` (GN-15l); a released form whose `go.mod` requires no module of its own repository has
  the `go.sum` of the commit of the tag, byte for byte, or none when that commit tracks none (B2.479). Why the
  command writes those lines: a module builds alone inside the commit of its tag (GN-15l), and `go build` in the
  generator module of crud-ui at its tag failed with `missing go.sum entry for module providing package` of the
  validator module that it requires. Why no tracked file holds them: they are the hashes of the commit that the
  release of the required module makes, with its static libraries, so they exist only after that run (GN-19f). The
  `go.mod` of a release requires only what the released form uses (B2.473): each requirement, a line that is not
  `// indirect`, is of a module of which a carried Go file imports a package, the module path or a path below it,
  where an import belongs to the required module with the longest path that holds it. A carried Go file is a
  hand-written file of a package or a generated file that the form carries, a generated test without a tag of a
  test feature among them; a requirement of a module of the same repository is used in the same way. A requirement
  that only files that the form leaves out import, a test of the repository, a program or a generated file behind
  a tag of a test feature, is refused with those files, and one that no Go file imports is refused; a line
  `// indirect` is not judged, and the command says so. The check reads the import declarations of the files and
  starts no Go; `binding release-go-module` runs it (GN-19f), and `binding check --release` runs it before a tag
  (docs/spec/contract-check.md CK-102). A dependency of tests or programs alone lives in a Go module of its own,
  with its own `go.mod`, in the same repository or not, as a command for `go install` does. Why it is refused:
  such a requirement takes part in the version selection of every consumer of the tag, which fetches its
  `go.mod`, while no package of the form imports it. Why the command writes no `go.mod` without it: the result
  would be a file that no commit of the repository holds and no check of the repository read. Before B2.473 the
  requirement stayed in the `go.mod` of the tag and no command named it. Why the generated files are left out: the released form carries only what can be built in it. A file behind a tag of a test feature
  calls test entry points, which the library of a release may not hold (GN-19f), so no build of the released form
  can compile it with its tag, and the guard would ask a run for tags that the form does not carry, so the untagged
  `go test` of a fetched module, the right run of that form, would fail on it. The releases before B2.446 carried
  those files. The command tags that commit `<directory of the Go module>/vX.Y.Z`
  (`packages/go/vX.Y.Z`), the tag that Go reads for a module in a subdirectory of its repository. It creates no
  commit and no tag when the library of a platform is missing, holds a test entry point (GN-13b) or holds a debug
  section, or when another check of GN-19f fails. No branch holds
  the commit, and no such commit or tag is made by hand. A consumer needs the line `require <module> vX.Y.Z` alone:
  no `CGO_LDFLAGS` and no `replace`, and its `go.sum` pins the module with its libraries. A build for another
  platform compiles no file that names a directory, so its link fails with the library that is not found.
  A program that imports the Go modules of several libraries (GN-15f) links the static library of each, and each
  holds its own copy of `binding_core` and of the Rust standard library. The end-to-end check builds and tests such
  a program in the released form on the platform of its run (GN-14f), which is the evidence that the copies link in
  one program. It has run on `darwin_arm64` and on `linux_arm64`.
- **GN-15k** The libraries that the Go binding links beside the static library of a platform are the
  `native-static-libs` that rustc prints for the build of that library on that platform
  (`cargo rustc --lib --crate-type staticlib -- --print native-static-libs`), in their order, and no list that the
  generator fixes. A release builds the library of each platform (GN-15g) with that print and writes the libraries
  into the directive of the link file of that platform, `#cgo LDFLAGS: -L${SRCDIR}/../ffi/lib/<platform> <libraries>`,
  so a consumer that fetches the module links them with no flag of its own: `release-go-static` writes the libraries
  of each platform that it builds into the file `native-static-libs` beside its library in `RELEASE_ASSETS/go/<platform>`,
  and `binding release-go-module` refuses a platform without that file, or whose file names no library, and writes the
  directive of its link file from it into the commit of the module. A library that the libraries name and that the
  Rust toolchain ships for the target in `lib/rustlib/<triple>/lib/self-contained`, which no C compiler of the
  platform brings, is carried beside the static library of the platform in `internal/ffi/lib/<platform>`, where the
  `-L` of the directive finds it: `libunwind.a`, the LLVM unwinder that the std of a musl target links with `-bundle`
  and that rustc names as `-lunwind`. `release-go-static` copies it from the toolchain that built the library beside
  that library, and `binding release-go-module` refuses a platform whose libraries name it while the file is not there
  and puts it into the commit. Why: gcc and musl-dev of Alpine bring no libunwind, so the link of a consumer on musl
  stopped at `ld: cannot find -lunwind` (B2.415); the unwinder of the toolchain is the one that the std was built
  against, and a package of the machine would ask the consumer for a step of its own. The end-to-end check builds the libraries of its
  released form (GN-14f) with the print in the same way, carries the same libraries and writes the same directive. A checkout, whose tree holds no library,
  gets them from one command of the CLI: `binding go-link --cargo <command> [--cargo-flags
  <arguments>] --manifest <Cargo.toml of the Go crate> --target-dir <dir> [--features <features>]` builds the static
  library of the host with `<command> rustc <arguments> --locked --offline --lib --crate-type staticlib` (GN-1d) and
  the given features into `<dir>`, with the print, and writes to its standard output the
  value of `CGO_LDFLAGS` for the Go tests of that checkout, `-L<dir>/debug -l<library> <libraries>`, with `<dir>` made absolute, because
  cgo reads a relative `-L` from the directory of each package, and with `<library>` the name of `[lib]` of the
  manifest before the libraries that it needs, because cgo puts `CGO_LDFLAGS` before every `#cgo LDFLAGS` of a package
  and a linker that reads its arguments in order, GNU ld with `--as-needed`, drops a library that stands before the
  static library that needs it (B2.414: `undefined reference to pow` of the consumer on linux glibc); the diagnostics of Cargo go to
  its standard error, and a failed build fails the command with the status of Cargo. A recipe that runs the Go tests
  calls it in place of its own build of the library, `CGO_LDFLAGS="$$($(BINDING) go-link --cargo "$(CARGO)" --cargo-flags
  "$(CARGOFLAGS)" ...)"` in the recipe line
  (GN-14), and `make e2e` calls the same command. The main link file names only `-l<library>`. Why the command builds
  and does not read an output of a build: rustc prints the libraries only while it links the static library, to its
  diagnostics, and writes them to no file, so a command that only read them would need every recipe to ask for the
  print and keep it, the logic that the command holds once; and the build of the command is the one build of the
  library, not a second one.
  Why: the libraries that a static library needs follow the crates that it holds, which the generator does not read;
  the fixed lists `-lgcc_s -lutil -lrt -lpthread -lm -ldl -lc` and `-lSystem -lc -lm` missed
  `-framework Security -framework CoreFoundation -liconv` of session-store, whose crate security-framework refers to
  them, so its Go tests did not link, and `-liconv` of json, which links only while no object that it holds is pulled
  in.
- **GN-15l** The `go.sum` of the Go module: binding scaffold writes `packages/go/go.sum` beside the `go.mod` that it
  writes (L-2) when that `go.mod` requires a release (`<module> vX.Y.Z`, GN-15f), and CK-19 compares it as it compares
  the `go.mod`. It holds the hash of each module that `go.mod` requires and the hash of the `go.mod` of each module of
  its build list, sorted as Go writes them; a requirement at `v0.0.0`, the development form, has no sum and no line,
  and a `go.mod` without a release requirement has no `go.sum`. A requirement of a module of the same repository
  (a module path with the same first three elements, GN-14f), which a `path` inside the repository with a version
  gives (GN-15f, B2.460), has no line either, and binding does not ask Go for it: the commit that carries that module
  at this version is made by the release (GN-19f), with the static libraries that the release builds, so no tracked
  file can hold its hash, and a development checkout resolves the module through its `go.work`. A `go.mod` whose only
  release requirements are of its own repository has no `go.sum` and starts no Go. The hashes are the `Sum` and `GoModSum` that
  `go mod download -json all` gives for a module of those requirements, run with `GOWORK=off` and the `GOPROXY`,
  `GOFLAGS` and module cache of the environment: they are the hashes that Go verifies against the checksum database
  when it downloads, so binding computes none of its own, and offline (`GOPROXY=off`) Go reads the module cache alone.
  A module that Go cannot give, offline or missing, refuses the `go.sum` with the error of Go: scaffold writes no
  `go.sum` and names it as not written, and CK-19 names it as not written, never an empty or partial `go.sum`. Why: a
  `go.mod` with a requirement builds only with its sums, and the generated module is checked and released outside the
  `go.work` of its repository (GN-14i); template and crud-ui had to commit a `go.sum` by hand beside the generated
  `go.mod`, and session-store, whose `go.mod` requires php-serialization, had none, so its module did not build alone.
  The graph of the requirements (B2.488): Go builds a module with `-mod=readonly` only when its `go.mod` requires every
  module that provides a package of its build, `// indirect` for one that it does not import itself, and its `go.sum`
  holds the hash of each. So the `go.mod` that scaffold tracks is the generated one followed by a block `require ( …
  // indirect )` of each module of the build list that it does not require, at the version that the build list
  selects, and the `go.sum` holds the hash of each of them. binding reads no import graph of another module, so it
  requires every module of the build list, which selects no other version and adds no module to the module graph.
  Go is asked again with each module that it gave, until it gives no new one, because the graph of a required
  module holds that module's requirements alone (graph pruning). A requirement of a module of the same repository
  adds to that graph the requirements of its tracked `go.mod`, read from its directory in the checkout, and each
  module of the same repository that it requires in turn is required `// indirect` too, with no line in the `go.sum`
  (the release writes its hash, GN-19f). A module of the same repository whose `go.mod` is not there, and a
  requirement below the version that the build list selects, refuse the files with the module named. Before B2.488
  the tag of a module that required session-store v0.0.4 failed `go build -mod=readonly` with `GOWORK=off`, first with
  `missing go.sum entry for module providing package github.com/polyspec/php-serialization/packages/go` and, with
  that hash, with `updates to go.mod needed`. CK-102 does not judge the lines `// indirect` (B2.473).
  The go command: `binding check` and `binding scaffold` take `--go <command>`, the value of `$(GO)` of the release
  recipes (GN-19h), and without it the command is the `go` of `PATH`. The value is split into words at white space, as
  the value of `--cargo` is (GN-1d), and the commands run `<command> mod download -json all`; a value that holds a quote
  or a backslash and a `--go` without a word are errors of the command line. `binding generate` and `binding go-link`
  start no Go and take no `--go`. The need is decided by the `go.mod` that the scaffold writes, at each run: only a
  `go.mod` that requires a release starts Go, so a contract whose `go.mod` requires none, or that has no target `go`,
  runs on a machine without Go, and binding does not look for the command then, even when `--go` names one that is
  not there. When the `go.mod` requires a release, binding looks for the command before it starts it: a name without a
  directory in a directory of `PATH`, and a path as that file, each a file that can be executed. When it is not found,
  the command ends with status 1 before it writes or compares a file, with one sentence that says why Go is needed and
  names the tool and how to give it: ``<path of the go.mod> requires the release <module> vX.Y.Z of another polyspec Go
  module, so its go.sum is written from `go mod download` (GN-15l), and the go command `go` is not found on PATH:
  install Go, or name the go command with --go <command>, the value of $(GO) of the release recipes (GN-19h)``. Why:
  the first run that needed Go was a release run. While a library required other Go modules only in the development
  form, no check started Go; the release of the modules that it requires turned its `go.mod` into one that requires a
  release, and `release-binding-check` of the release workflow, in a job without Go, failed with ``go mod download did
  not start: spawnSync go ENOENT``, which names neither the tool as a need nor a variable or an option that gives it.
  template, http-negotiation and session-store each lost a release tag on it.
- **GN-15h** The Go packages of a generation hold only the helpers that the contract uses. Package `binding` writes a
  method of `Writer` or `Reader` (`Bool`, `Tag`, `Uint`, `Int`, `Float`, `Len`, `Text`, `Bytes`, `Key`) only when the Go
  code of the generation calls it through a value of its type, and the type `Key` with `IntKey`, `BytesKey`, `TextKey`
  and its methods, and the type `KeyedMap` with its methods, only when that code names them; an import that only a
  dropped helper used is dropped with it. The uses are counted per build: `zz_generated_binding.go` holds the helpers
  that the Go code without a build tag calls, and a helper that only the files behind build tags call, such as
  `Writer.Int` in a contract without an integer, whose only caller is the number test of the codec behind
  `polyspec_<library>_codec_test`, is written in the file `zz_generated_<tags>_helpers.go` of package `binding` behind those tags
  joined by `||`. Why: a run of deadcode or of the unused lint without a build tag compiles no file behind a tag, so a
  helper that only such a file calls is unreachable in it, and a repository whose lint takes its build tags from its
  tracked files runs only that untagged run on the generated module, whose files it does not track. The generator reads the uses from the generated Go code without its comments
  and the contents of its literals, and repeats until no further helper is kept, because a kept helper may call
  another. The generated code calls a method of a `Writer` only through a value named `enc`, `tenc` or `w` and a
  method of a `Reader` only through a value named `dec`, `r` or `properties`; a call of the same name through another
  value is a method of another type, such as a member of a class of the contract (`made0.Key`) or of a
  `reflect.Value` (`v.Float`), and no use of a helper. Why: a function that no main package and no test reaches fails the
  deadcode and unused lints of the repository that consumes the module, and that repository cannot change a generated
  file. A contract without a `keyed_map<T>` therefore gets no keyed-map helper. The end-to-end check (GN-14) runs the
  `deadcode -test` that mise.toml pins on the generated Go module, untagged and with each tag that the `//go:build`
  lines of its files name, without the tags of the test features of the run, and fails on a function that every run
  compiling its file reports and on any line that is no finding, because the lint of a consuming repository judges
  the module the same way.
  The static library calls each export of package `binding` (`//export <prefix>__go_<name>`) through C, which the
  call graph of deadcode does not hold: its roots are the main and init functions of the programs of the module and
  of its tests, so it reaches neither an export nor a function that only an export calls. Package `binding`
  therefore names every export that it writes in the initializer of a blank variable (`var _ = [...]any{…}`), which
  the init of the package runs: deadcode counts a function whose address a reached function takes as reached in a
  program that holds `reflect.Value.Call`, as every program that imports `fmt` does. A Go value of a call is a
  `*KeyedMap[any]` only when a type of the contract names a `keyed_map<T>`, whose Go type the root package exports
  with its keys, or when the contract has a value alias, whose decoder makes one (GN-6e); otherwise no code outside
  package `binding` can make one, so `describeOwn` has no case of it, and `describeOwn` is not written when it has no
  case. `zz_generated_thrown_count.go` is written only with the Go tests of the count (GN-6ae), which run the cases
  of a member that takes a callback or a function type. A method of `Call` that only an export calls is written
  with that export alone: `host` with `<prefix>__go_host` (a value alias), and `run` and `raise` with
  `<prefix>__go_callback` (a callback, or a function of a member with `machine`). The type `panicked` is written only
  when Go code that the static library runs can panic into a call: `run`, or `keepRaised` of a kept func (GN-6z,
  GN-15b). Why: an export is reached at run time through the static
  library, which no Go analysis sees, while a case of a type that no caller can make, or a function that no test
  calls, is unreachable in every program.
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
  `polyspec_<repository>_`, the repository with `_` for each `-` and one underscore after it, and `<symbol>` is
  `<prefix>_`, then each segment of the module of the unit in snake_case
  followed by `___`, then for a member of a class the name of the class followed by `__`, then the name of the
  member, `new` for the constructor: `<prefix>_<function>`, `<prefix>_<unit>__<member>`,
  `<prefix>_<segment>___<function>` and `<prefix>_<segment>___<unit>__<member>`. The function of package `binding`
  that calls it has the same parts in CamelCase with one underscore less in each separator: `<Function>`,
  `<Unit>_<Member>`, `<Segment>__<Function>` and `<Segment>__<Unit>_<Member>`. No two names of the contract are
  joined by one underscore, so no two members of a contract have one symbol or one function (GN-4c). The name of a
  repository holds no two underscores in a row and ends with no underscore (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`), so the
  first two underscores of a symbol end the name of its repository, and two libraries have no C symbol in common,
  also when neither names the other and a Go program links the static libraries of both. Why: with one underscore
  after `polyspec_<repository>`, the function `b_c` of the library `a` and the function `c` of the library `a_b` were
  both `polyspec_a_b_c`, and no check of one contract sees a library that it does not name (B2.125, CK-79).
  Go encodes the arguments into one buffer in parameter order: a bool or a presence tag one byte 0 or 1, a number eight
  bytes little endian (int64 two's complement, float64 its IEEE 754 bits), a string or byte slice its length (eight
  bytes) and bytes, a list its length and items, a record its fields in contract order, an enum its value text. The C
  ABI decodes and judges them (T-8), and the arguments must end where the last parameter ends; the core's result, or
  the failure (category index of E-1, message, kind, status, errno), is encoded the same way into a buffer that Rust
  allocates, writes into `result` and Go frees with `<prefix>__free`; the return is 0 for a result and 1
  for a failure. A buffer that does not follow the encoding is kind `internal`. The symbols that are not members
  (`__free`, `__panic_test`, `__echo_<type>`) have two underscores after the prefix, three after the name of the
  repository, which no symbol of a member has, because a name of the contract follows the one underscore after its
  prefix. Every function runs under
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
  `__<Class>_<member>`, which is not part of the API: `__new_<Class>` (GN-6b) gives the handle of the new value, and a method, a
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
  of `Object.keys`), a Date, a function, a `Uint8Array` as `Bytes` (B-1), a symbol, a typed array of another element
  type and any other object (with the name of its constructor). A Date and a Map are found by `instanceof` of the global class. A core value leaves by the alias's
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
  of G-5 (NaN, the infinities, 1.5, -1 for uint, 2^53 for uint and int and −2^53 for int, GN-12a, and an integer for
  float in Python and PHP) as kind `invalid_number` of the value class, and true, "7" and, where the place takes no
  absent value, null as kind `invalid_argument_type` of the type class (GN-12a), and for every `keyed_map` parameter whose contract lists `int` keys the key
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
  writes it as an integer (`0` is `0.0`, `1e20` is `1e+20`), and a negative zero keeps its sign (`-0.0`). PHP
  writes the least `int64`, -9223372036854775808, as `\PHP_INT_MIN` at every place where a case gives an integer: an
  argument, an expected result, an integer key of a keyed map and a value of a value alias (B2.464). Why: PHP reads
  the literal as the negation of the float 9223372036854775808, so the binding took a float, which is no `int64`.
  Values that JSON
  cannot write: bytes are `{"hex": "<two lower-case hex digits per byte>"}`; a `source` is its text, or the same
  `{"hex": ...}` for bytes that are no text; a text that is not well formed is `{"ill_formed": "<text>"}`, the text
  and then one code unit that no well-formed text holds: an unpaired surrogate (U+D800) in Python, Node and WASM,
  whose texts are code points or UTF-16, and the byte 0xFF in PHP and Go, whose texts are bytes; a float that is not finite is `{"float": "nan" | "inf" | "-inf"}`; a
  value of a value type (`json_value`, `php_value`, `template_value`) is `{"kind": <value kind>, "value": ...}` with
  the kinds of the value table: `null` has no `value`; `bool`, `int`, `int64` (an integer of the range of i64, a
  number or, outside the safe integers, its decimal text; B2.465), `float` (a number or the form above), `text` and
  `bytes` (`{"hex": ...}`) hold that value; `number` holds its literal as a text and has a form only where a class of
  origin value represents the value type, whose member takes that text (below): no built-in form of a language makes
  the kind (`BUILTIN_FORMS`), so a value alias gives it no case value, and `binding check` refuses one (CK-22);
  `list` holds an array of such values,
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
  `invalid_argument_type` and Go does not compile it. A result that holds an instance of such a class, at any place
  of a list, an optional, a map, a tuple, a record or a variant, is compared with the instance that its case value
  makes by the same rule (GN-13e, B2.121): the comparison of each target reads both through the members of the in row
  of the owner in the language, the `by` member, whose value names the case, the `read` member of the case and, for a
  read that gives no text, its `units` member, and reads the content again, so a list of instances and an instance of
  a map class of the owner, whose iteration gives its entries, are read as far as they go. The read of an instance is
  `[is]`, `[is, content]` or `[is, null, units]`, which `_same` of Python, `ordered` of Node and WASM, `same` of PHP
  and `foreignRead` of Go compare in place of the instance. Why: an instance holds a handle of its core, so a
  comparison of the language compares two instances by their identity (Python), by no property (Node, WASM, PHP) or by
  their handles (Go), and two instances that hold one value were not one result. A kind that no row makes by such a member (a member of two parameters, a built-in form, or
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
  arguments are placeholders whose lists have one item. The return type of a member of a callback unit of another
  repository (GN-6s) is a type of the owner, so the generator reads it in the contract of the owner, and a value alias
  of the owner is such an alias. Why: Node read `php_value` of store.get in the contract of the consumer, where it
  names no unit, and generated the test, while the call raised `unsupported_value` of
  php-serialization (B2.513). The tests of the raised exception and of the result of
  another type are generated only for a member whose core path gives back the failure of the callback (GN-7,
  `core.failure`), because only such a member calls the callback during the call: a member that takes the callback
  by a parameter with `keeps` and fails in no other way keeps it for a later member, so the call returns before the
  callback runs.
  K-2 is binding's own requirement and does not depend on a case. A case gives a callback parameter as a fixture,
  `{"callback": {"<callback member id>": [<row>]}, "calls": [{"member": "<id>", "args": {...}}]}`: a row is
  `{"args": {<parameter in snake_case>: <case value>}}` with `"result": <case value>` (absent when the member returns
  none) and `"once": true` for a row that answers one call, which the case expects (GN-13bi). A row with
  `"raise": {"error": <error unit>, "kind": <kind>}` throws, in place of a result, an instance of the class of that error unit with the kind and the message
  `G-5: <kind>`, as language code makes one (GN-7a): Python, Node, PHP and WASM by the constructor of the class with the
  message and the kind (GN-10); Go by
  `Raised<Unit>(kind, message)` of package `internal/binding`, which makes the struct of the unit with no property
  value, and whose error fails the test (GN-7a). A row with `"raise": "exception"` throws, in place of a result, an exception of the
  language that is no error of the library, with the message `G-5: exception`: a Python `RuntimeError`, a Node and
  WASM `Error`, a PHP `\RuntimeException`, a Go `errors.New`. Why: a row shows by it a failure of language code that
  the member does not recognize (U-3); the end-to-end sample showed it by an instance of `refused_error` with the kind
  `unlisted`, which the constructor refuses since GN-7a. The generated test of each language makes the fixture
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
  safe integers: a Node `bigint`, a Python `int`), `int64` (an integer of the range of i64, given as `int` is: a Node
  and WASM `bigint`, a Python and PHP `int`, a Go `int64`; a value outside that range is refused by name; B2.465),
  `float`, `text`, `bytes`, `list` and `map`, each as the value that
  the built-in form of the kind makes. Why `int64` is a kind of a case value: a row of an alias may have the kind
  (`VALUE_KINDS`, the schema), and an alias of orm reads a PHP and a Python `int` as `int64` and a class as `int`, so a
  case could not state the value that such a row reads, and its test failed with "is not generated yet". PHP gives the least int as `\PHP_INT_MIN`, because PHP reads
  `-9223372036854775808` as the negation of a float, and Go gives a negative zero as `math.Copysign(0, -1)`, because
  the Go constant `-0.0` is 0. A value whose out row of the alias in the target, the row of its
  kind whose `when` the value holds, makes an instance of a value class (`<unit>.constructor`) is that instance made
  from the built-in value, for every kind that a row makes so (`int`, `int64`, `float`, `text`, `bytes`, `list`,
  `map`) and in PHP, Python, Node and WASM, as an argument and as the expected value inside another type (B2.465).
  An `int` outside the range of i64 is the built-in value: an out row makes an `OutValue` int, an i64, so no out
  row makes it, and a Node `bigint` outside i64 enters as a large integer, which the in function judges (U-7 (f),
  B2.493; orm: `IntegerValue(9223372036854775808n)` was refused by its `int64` parameter before the in function ran).
  Why: the binding takes back the form that it gives. A Node number would carry an integral float as an `int`; an
  alias of orm reads a PHP `int` as `int64` and an instance of `integer_value` as `int`, and reads a PHP array with
  sequence keys, the empty array among them, as a list and an instance of `map_value` as a map, so the built-in value
  entered as another kind. GN-13v stays the rule of an alias whose row makes no class for the empty map. A value of the
  language that is no value of the value type is `{"host": <sort>}`
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
  compares by value (no class, no result of `none`) and that takes no callback and is no hook. A member with
  `machine` (GN-6ab) is such a member too: both calls take the function of that case, and its result `passthrough`
  is compared as the value that the function returned. A `{computed}` default
  has no declared value, because the core makes the value at each call, so two calls may give two results. For a
  `{computed}` default of an `optional` type the test, of the same members and in Go too, runs the call without the
  parameter or field and the call with null, drops the result of each and requires the same outcome: both without a
  failure, or the same class and kind of failure. It compares no value, and its name states the rule id of the
  default (`U-2: Form.addRow without key leaves its value to the core (CURT-004)` in Node and WASM, the same words in
  the naming style of each other target). Go gives nil for both, so its two calls are the same call. A `{computed}`
  default of another type has no second call and no test of U-2. The value of a `{computed}` default is proven by the
  case of its rule, which `binding check` requires (contract-check CK-103). In Python and Node an
  explicit `None` or `null` for such a parameter is tested as a value that is refused, except where the default is
  `{literal: null}`, whose declared value is that null, and except for an `optional` or a value type, which takes it
  as a value (GN-6i). T-1: a `source` parameter gives
  the same for a text and for the bytes of its UTF-8 (Python, Node), a text with an unpaired surrogate is kind
  `invalid_text`, and a value that is neither is kind `invalid_argument_type`. T-7: a `bytes` parameter refuses a
  value that is no bytes, in Node a string too. B-4: a case whose kind names a `class` expects that exact class and is
  caught as the class of its category. A case may leave out the key of a parameter with a default, which is then left
  out of the call.
  A case value of another JSON kind than the type of its place, which a case of B-4 gives for the binding to refuse
  (a text or a bool for a number, a number or a bool for a text, a number or a text for a bool), is written as the
  value of its JSON kind and never converted to the type (B2.306). A value that is no number at a place of a number type (`int`,
  `int64`, `uint`, `float`), a text or a bool included, is kind `invalid_argument_type` in every target, and a fraction
  or a negative number for a `uint` is kind `invalid_number` of B-2 (GN-12a), so a case that gives a text or a bool
  there expects `invalid_argument_type`. Why: B-2 states `invalid_number` for a number that breaks the rule of its
  type, and a value of another type has the kind of every other primitive place (T3.25-1).

- **GN-13e** Every target runs each contract case of a member that does not raise, has no `faults` and is no hook
  (N-4), and compares its result with the value of the case: Node and WASM with `assert.deepStrictEqual` after a
  `Map` becomes its entries in order, Python by type and value with the items of a `dict` in order and NaN equal to
  NaN, PHP with `assertSame` after an object becomes its class and properties, and Go with `reflect.DeepEqual` for
  each part of a tuple return, or, when the case holds a NaN or either zero sign, with `sameValue`, which treats a NaN
  as equal to a NaN and distinguishes negative zero from positive zero at every nested float. A private generated
  comparison test independently constructs both zero signs and requires a sign-changing result to be unequal;
  the existing sample Go tests also compare transported float bits. This checks the result assertion, because
  `reflect.DeepEqual` finds a NaN unequal to itself and the two zero signs equal. NaN payloads remain unexamined.
  In Python an instance of a value class of the contract (origin `value`, with or without `core_type`) is the same
  as another when both are of its class and the values of its properties are the same by this rule, so a list, a
  map or a value class inside it is compared as far as it goes. Why: such a class has no `__eq__`, so `==` compared
  two instances by identity, and orm's result `[{"qty": {"kind": "int", "value": 1}}]` of `list<map<orm_value>>`
  failed in Python (B2.507). In Node and WASM `ordered` makes such an instance its class name and the values of its
  properties, each ordered again, before `assert.deepStrictEqual` compares them. Why: a napi or wasm-bindgen class has
  its getters on the prototype and no own property, so two instances that hold other values compared equal (B2.510).
  The key of the case that holds the result is the `result` of its `cases` row, or
  `result` (CK-22). A value is written as the case gives it: an `int64` result is a Node `bigint`, a tuple is a Python
  tuple and a Go array or the results of a Go function, `bytes` is `{"hex": ...}`. A case without the key runs the
  call alone and fails when it raises. The result of a member that returns none is `null` wherever a case writes it:
  under the result key of the case, in a call of `after`, in a step of a function fixture and in a row of a callback
  fixture (B2.466). It is tested as no value: the test requires Python `None`, PHP `null` and `undefined` in Node and
  WASM, and Go runs the call alone, whose function gives its error and no value. A case of such a member may leave the
  key out, and a call of `after` writes `result` or `raises`. Another value there is refused by `binding check`
  (CK-22), and the test of the case fails with that reason. Why: a result that does not exist had two rules, a test
  that failed for `"result": null` at the top of a case and a check that required it in `after` (B2.374), so the 36
  cases of orm that state `"result": null` of a member that returns none passed the check and failed their tests.
  The result `null` of an optional has a case form whatever the optional holds,
  a class too: each target compares the result with its null (Python `None`, Node, WASM and PHP `null`, and Go `nil`
  of the type of the result). A result that is a value alias of the contract (not inside another type, and
  not a property of a value class, which gives the value that its constructor took) is compared as the texts of its
  places in pre-order, depth first, which a loop writes on both sides, so a value nested deeper than a recursion
  takes is compared too. The generator writes the texts of the case value by the out rows of the alias: for each
  place, the row of its kind whose predicate the value has (`utf8`, `safe_integer`, `integral_float`,
  `sequence_keys`, whose keys are those of the form that the alias states, texts or ints, CK-104; a case value of the
  kind `list` or `text` takes the rows of `map` or `bytes` when the alias has no row of its kind) and the form of the
  row in the language. The test writes the texts of the result by the type of
  each place. A text names the form: `null`; `bool true` or `bool false`; `int <decimal>` in Python and PHP; `number
  <bits>` in Node and WASM, the hex of the IEEE 754 bits or `nan`; `bigint <decimal>`; `float <bits>` in Python and
  PHP; `text <hex>` and `bytes <hex>` of the UTF-8 or the bytes in Python, Node and WASM, `string <hex>` in PHP;
  `list <n>`, then its items; `map <n>`, then each key and its value, a key in the form of its keyed map (a PHP key
  that is the decimal text of an integer is that integer); a value of the kind `int64` has the text of an integer in
  the form of its row; and an instance of a value class that an out row names as
  `<unit>.constructor`, of every kind that a row makes so (`int`, `int64`, `float`, `text`, `bytes` and `map`;
  B2.465, where only `float` and `map` had it, so an `int` or a byte string that orm gives as an instance of
  `integer_value` or `bytes_value` was expected as the bare value), a PHP `stdClass` and a PHP reference, numbered
  together by their first place: `<unit> #k`,
  then its one field, `php_object #k <n>`, then its pairs, and `php_reference #k`, then its value, and
  `<form> again k` at a later place, so the identity of each place and each cycle is compared. The texts of a result
  write such an instance in the same way in every language, PHP included, where the method of the property gives the
  field and a field that is a map is `map <n>` even when its keys are 0 to n-1 (B2.492, where the PHP texts wrote
  `other <class>` for it, so orm's PHP results of `bytes_value` and `map_value` never matched). A PHP reference whose
  id has one place in the case value has no text of its own, only its value: PHP does not keep a reference that one
  place holds, because `ReflectionReference::fromArrayElement` gives null for it and `zend_array_dup` copies its
  value, so the reference that the binding makes for that place cannot be seen. The result of an
  alias with the entry points of `codec-test` (`in_raises`, GN-5) also goes through the round trip of the rows of the
  alias (U-1): the test gives the result to `_alias_round_<alias>` (Python), `__aliasRound<Alias>` (Node, WASM) or
  `Internal\aliasRound<Alias>` (PHP), which takes it by the `in` function of the alias and gives the core value back
  by its `out` function, and requires the same texts, so each form that the `out` rows make enters again as the same
  value. Go compares a result that holds a value alias with `reflect.DeepEqual`, and the generator writes the expected
  value by the Go forms of the same out rows, because the result takes those forms and not the kinds of the case: a
  byte string whose row makes `text` is a `string` (a text whose row makes `bytes` is a `[]byte`), a map whose row
  makes `list` is a `[]any` of its values, and a map or a list whose row makes `keyed_map` is a `*KeyedMap[any]`. A
  key of that keyed map, or of the keyed map of the field of a value class, is a text only where the keyed map takes
  texts and the bytes of the key are UTF-8, and else bytes. A case whose result
  has no case form (a class, another value than `null` for a result of `none`), whose value alias has no out row that makes the built-in form of
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
  and `{"tuple": n}` of a tuple, and `"?"` takes the value of an `optional`, which the test requires to be present
  (`{"from": "value.get", "receiver": ..., "args": {"key": "a"}, "pick": ["?"]}`); Go dereferences the pointer of an
  optional whose absence is no nil pointer. A type named in `types` whose library is this repository is the class of
  this contract that it names (T-3), at the member and at each step, so a factory that returns `json_value` of the
  library json makes the class `value`. `receiver` is given when the member is a method, and is an instance value
  itself.
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
  a callback that a class of the case implements (GN-6w). An instance value is the one form of the value of a class of
  origin `generated` in a case, also an item of a list or a part of a tuple (`{"new": "uploaded_file.new", "args":
  {...}}`); another form, such as an object of the arguments of its constructor, fails the test of the case by name
  with that rule. Why: one form for every place keeps one rule of how a case makes an instance (P-1). Each call of `then` is a method of the class, called on the instance in order, and its result is not
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
  An instance value at the place of a callback unit of another repository (GN-6s) names members of the owning
  repository: `new` or `from` names a member of the contract of the owner that gives a class of the owner that
  implements the unit, and its `receiver`, its `args` and its calls of `then` are members and values of the owner. The
  test of Python, Node and PHP calls them through the package of the owner, which it imports as it does for a value
  class of the owner (GN-6x), and Node awaits a member of the owner that waits. The members are those that the generator
  takes from the contract of the owner for the target: a member that the owner leaves out of the target by `only`, or
  that the generator refuses in the contract of the owner, gives a test of the case that fails with that reason
  (GN-13e). A parameter that the owner leaves out of the target by `only` (Q-4) is no argument of the call in that
  target, by the same rule as for a member of this contract, so a key of the case that gives it is not written there.
  Why: a consumer's Go test called `Open(nil, cookie)` of session-store, whose cancellation only Python and Node take,
  against `Open(cookie)` (B2.512). Not generated yet, each a test of the case that fails by name: a function of the owner, a member of an
  internal unit of the owner, an argument that is an enum, a record, a variant or a callback of the owner, and the
  faults of a call of `then`. Go and WASM refuse the parameter itself (GN-6s), so they write no such instance.
  `binding check` does not judge such a value, because CK-22 reads the members of this contract alone. Why: the class
  that implements the unit is a class of the binding of the owner, so only the package of the owner makes it, and an
  object that the test made in another way would not be the object that a user passes.

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
  that arm faults are `zz_generated_fault_test.go` with the build tag `polyspec_<library>_fault_test`, and they lock the
  goroutine to its thread, because the arming is of the thread; the poison tests of B-5c are
  `zz_generated_held_test.go` with the build tag `polyspec_<library>_panic_test`. The end-to-end check runs `go test` with the
  tag `polyspec_<library>_<feature>` of each test feature of the crate. B-7 is
  `internal/binding/zz_generated_panic_test.go` with the build tag `polyspec_<library>_panic_test`, which also declares the C
  ABI's panic entry point, so the static library needs the feature `panic-test` only with that tag.
  `internal/binding/zz_generated_map_test.go` checks the order of `Map` and that the encoding keeps it both ways.
  Every latin1 parameter or field is tested with U+0100 and the bytes FF as kind `invalid_text`. The features
  `panic-test`, `codec-test`, `native-count-test` and `thrown-count-test` are for tests only: the manifest that `binding scaffold` writes
  turns none on by default and `binding check` refuses any other manifest (CK-19), and the end-to-end check builds the static library
  without features and fails if it holds a test entry point (`__panic_test`, `__echo_`, `__arm_faults`,
  `__fault_left`, `__alias_in_`, `__number_in`, `__native_count`, `__thrown_count`). With the build tag
  `polyspec_<library>_codec_test` and the feature `codec-test` of the C ABI crate, test entry points give back a latin1 value
  (when the contract takes and gives latin1), a `map<text>` and a `keyed_map<text>` with every key kind (when it takes
  and gives such a map) through the conversions of the binding; `zz_generated_codec_test.go` checks that U+0000 to
  U+00FF, the order of a map and the order and kinds of the keys of a keyed map come back the same and that U+0100 is
  refused; the cases of an alias of this repository run its `in` function alone through `AliasIn<Alias>`. A `keyed_map` parameter or field whose contract does not list every key kind is tested with a key of a
  missing kind as kind `invalid_argument_type`. A case's latin1 value is a Go string of its runes; a case gives a `map` as
  an object of its entries in order and a `keyed_map` as GN-13 does.
- **GN-13ba** Go: the build tag of a test feature is `polyspec_<library>_<feature>`, the library in snake case and
  the feature with `_` for `-` (`polyspec_template_fault_test`), on every tagged file of the module, test or not, and
  the end-to-end check gives the tags of the library under test alone. Why: a build tag holds in the whole build, so
  the tag `polyspec_fault_test` of template turned on the tagged files of `internal/binding` of the json module that
  template imports, which call the test entry points of a json library that its release does not have, and the Go
  tests of template did not link. A repository that runs its Go tests gives the tags of its own library:
  `GOFLAGS=-tags=polyspec_<library>_<feature>,...`.
- **GN-13bf** Go: a package of the module with build-tagged generated tests also has the untagged generated test
  `zz_generated_tags_test.go`, which declares `var builtTags = map[string]bool{}` and the test
  `TestGN13bfEveryBuildTagOfThePackageIsBuilt`. The generator writes into it the tags of the tagged generated test
  files of that package, and each such file registers its tags in an `init` (`builtTags["<tag>"] = true`). The test
  fails unless every tag of the list was registered, and its message names the missing tags and gives the line
  `go test -tags=<every tag of the module> ./...`. So a run with a wrong tag (such as `polyspec_panic_test`, the form before
  GN-13ba) or with no tag fails and names the tags, a run with the tags passes, and a build that only compiles
  (`go test -c`, `go vet`, deadcode) is unchanged. That holds in the generated tree, the files that
  `binding generate` writes: there the rule has no exception. The released form of the module (GN-15g) holds no
  tagged generated test and so no guard, because its library has no test entry point; an untagged `go test` of a
  module fetched at its tag is the right run of that form and leaves out no test that the form holds. Why: a run without the tags compiles none of the tagged files, so
  `go test` passed with those generated tests left out, which a consumer cannot see (HR-84): two consumers released
  that way with the tags of before GN-13ba.
- **GN-13bb** A callback or function fixture of a generated test (G-5) finds the row of a call by comparing the
  arguments of the call with those of the row by the rule by which the test compares a result: PHP by `same` of the
  test class (an object by its class and its properties, an instance of a value class of another repository by its in
  row, B2.121), which the fixture takes as `self::same(...)`, and Python by `_same`. Node and WASM compare by
  `isDeepStrictEqual` and Go by `reflect.DeepEqual`, which compare values already; Go reads arguments that hold an
  instance of a value class of another repository by `foreignRead` first, and Node and WASM by `ordered`, which the
  fixture is given as its reader (GN-13bg). Why: PHP `===` of two objects holds
  for one instance alone and Python `==` of a class without `__eq__` is its identity, so an argument that the binding
  made, equal to the value of the row, matched no row: the three host functions of template, whose second argument is
  an `Environment`, raised `UnexpectedCall` at every call; the same comparison of results was B2.358.
- **GN-13bc** A case value `{"float": "<decimal>"}` is a float that JSON writes as an integer, such as `{"float": "403.0"}`
  or `{"float": "-0.0"}`, at any number place: PHP and Python write their float literal, Node and WASM the number
  (`-0` for a negative zero), and Go writes the float at a float place and no test at an integer place, where its
  compiler refuses the conversion, with a comment that names the case and the reason (GN-13w). A case may have
  `targets`, a list of targets of its member: it is a test of those targets alone, and the cases of its group with the
  same arguments, each with `targets`, together list every target of the member (CK-97). Why: the targets differ by the
  model of numbers of their language, where the binding cannot make them the same: a PHP or Python float is a type of
  its own, which an integer place refuses (B-2), while a Node or WASM number has no float type, so `403.0` is the
  number 403, which the binding takes; JSON writes `403.0` as `403` and `-0.0` as `-0`, so no case could give the
  float, and one case cannot state the two results. A negative zero, which Node and WASM can tell apart, is refused
  there as in PHP and Python (GN-12a), so it needs no `targets`. The pair keeps every target tested on the input.
- **GN-13bd** The `raises` of a case may leave out `category`: the generated test takes the category of its kind from
  `errors.kinds` of the contract, which gives every kind its category (E-1), and a case that writes it writes the
  category of its kind (GN-13bh).
  Why: the contract check takes `{"kind": <kind>}` alone, and the tests named the class of the category of the case, so
  hyper `csrf.mask`, whose cases give the kind alone, made Node write `error.constructor === pkg. &&` 180 times, which
  does not parse; Python, PHP, WASM and Go read the same empty category. A kind that the binding raises itself (E-1a:
  `invalid_number`, `invalid_argument_type` and the others of `binding_core::BindingError`) is in no row of
  `errors.kinds` and takes its fixed category of E-1a. A `raises` without `category` whose kind is neither of
  `errors.kinds` nor of E-1a names no class; `binding check` refuses it (CK-22), and the generator refuses it by name
  and never writes an empty class name. Why: the crud-ui list-render cases that expect `invalid_number` or
  `invalid_argument_type` gave the kind alone, took no category from `errors.kinds`, and the Python test wrote
  `self.assertRaises(pkg.) as caught`, which does not parse, at twelve places (B2.433).
- **GN-13be** A result of a value alias that a test compares as a value (a step of a function fixture, a call of
  `after`, or a place of a type that holds the alias) takes the out row of each place that the value meets: the row of
  its kind whose predicate the value holds, or its row without a predicate. A byte string whose row makes a text, the
  UTF-8 bytes of a row `{"predicate": "utf8", "is": true}`, is the text of its bytes in the language; another form than
  the built-in form of the kind stays refused by name. Why: the generator refused every byte string of an alias with
  such a row, though the value meets the row that makes bytes or the one that makes a text, and the text is what the
  language gives: session-store `memory_store.get`, whose result is an optional `php_value`, was not compared in
  Python (2 tests). The Go test took the out rows only for the result of the case, so after `Set("a", []byte("y"))`
  it expected `[]byte("y")` from `Get("a")` in `after`, which gives a `*any` that holds the string "y"; a step of a
  function fixture was written the same way (B2.420). A value that the binding hands to a callback leaves the binding
  as a result does, so it takes the out rows the same way in each target: an argument of a row of a callback fixture
  or of a function value, and an argument of an expected call of a fixture. Why: these were written as an argument of
  a call is, so an argument of an alias whose row makes UTF-8 bytes a text was expected as bytes, and the call that the
  binding made with the text matched no row (B2.422).
- **GN-13bg** A generated test reads both sides of these comparisons through the in row of the owner, by the helper of
  GN-13e (`foreignRead` of Go, `ordered` of Node and WASM, `same` of PHP, `_same` of Python), where a side holds an
  instance of a value class of another repository (GN-6x), as it reads the result of a case and its value: the two
  results of a U-2 or T-1 test in the five targets (Python by GN-13z), and in Go also the result of a call of `after`
  or of a step of a function fixture (GN-6ae), the arguments by which a callback fixture finds its row, and the
  expected calls of a fixture (GN-13bb). The helper is written where the type of the result, or of a parameter of the
  callback, holds such an instance at any place of a list, an optional, a map, a tuple, a record or a variant; a
  comparison of any other type is written as it was. In PHP the result goes through `same` before `outcome` writes it
  as a text. The statements that make an argument of an expected call of a Go fixture stand in the test, before the
  check of the calls. Why: an instance holds a handle of its core, so `reflect.DeepEqual` compared the handles of the
  two results, and the Go U-2 test of every member that gives a `json.Value` failed with `&json.Value{ref:(*binding.Ref)(0x…)}
  is not &json.Value{…}`: 29 tests of crud-ui (`build_list` 8, `build_detail` 8, `bind_buttons` 6, `bind_form` 5, the
  add and the copy of a form 1 each), whose parameters have defaults, among them a record whose fields have defaults
  of JSON values. `assert.deepStrictEqual` of Node and WASM and `var_export` of PHP compared the same two instances by
  no property, so their U-2 tests passed for any two JSON values and checked nothing of the result. The Go test
  compared the result of a call of `after` and the arguments of a fixture by their handles too, and it added the
  statements that make an instance of an expected call to the lines of the test after it had written them, so the
  test named a local that it did not declare (B2.445). Node and WASM read through `ordered` the arguments by which a
  callback fixture or the fixture of a function value finds its row, and the expected calls of a fixture, where a
  parameter of a member of the callback, or of the function, holds such an instance: the test gives the fixture
  `ordered` as its reader, at a parameter and inside another value, and compares `ordered` of the calls. A fixture
  whose arguments hold no such instance is written as it was. Why: `isDeepStrictEqual` and `assert.deepEqual`
  compared two instances by no property, so a call with any JSON value took the row of another value and the
  expected calls held for any value, where Go and PHP read what the instance holds (B2.452).
- **GN-13bh** The `category` that the `raises` of a case writes is one of the six categories of E-1 (`value`, `type`,
  `io`, `store`, `busy`, `internal`), and it is the category of the kind where the kind has one: the category that
  `errors.kinds` gives the kind (its own rows and the rows with `library`), or the fixed category of a kind of E-1a.
  `binding check` refuses another `category` (CK-22), and the generator refuses it with a sentence that names the
  case, the kind and the category. The form of the case does not change the rule: a case with `raises` may also name
  `receiver`, `with` and `after`. Every generated file names the class of a category through one function for the
  class table of the language (`categoryClass`) and one for the Go error types (`categoryType`); both refuse a text
  that is no category and a category without a class by name, so no emitter holds a fallback of its own and none
  writes an empty class name. Why: two cases of orm `query.update` wrote `"category": "state"`, which is no
  category. The check read only `kind` and `errno` of a `raises` and passed, each test generator looked the category
  up in its class table and took an empty text for a category that the table does not have, and the Go test wrote
  `failure, ok := err.(*liberrors.)` and the PHP test `catch (\Polyspec\Orm\ $error)`: neither file compiles or
  parses, so no generated test of those two targets ran, and Python, Node and WASM wrote `pkg.` in the same place. A
  category that is one of the six but not that of the kind names the class of another category, which the test of
  the case then fails at run time for a reason that the contract already shows (B2.448).
- **GN-13bi** The rows of a callback fixture and of a function value of a case (G-5, GN-6z, CK-22) are a table of
  answers, and a row with `"once": true` is also a call that the case expects. A call takes the first row of its
  member that is left and whose arguments equal the call's (GN-13bb). A row without `once` stays: it answers any
  number of calls, none included, and requires no call. A row with `once` answers one call and is then taken out, so
  it answers exactly one. At the end of the test of a case, after the call of the case and its calls of `after`, the
  generated test of each of the five targets requires that every row with `once` of every fixture that the test made
  answered a call: a row with `once` that is left fails the test, which names the fixture by its place among the
  fixtures of the test, the row by its place among the rows of the fixture, the member and the arguments. The rule
  holds when the member returns and when it raises, so a case whose member fails before it calls the callback gives
  that callback no row with `once`. The fixtures of the test are those at every place of the case: a parameter of a
  callback or of a function type, a field of a record, an item of a list, an `optional`, the receiver and its calls
  of `then`, a call of `after` and a step of a function fixture. So a callback or a function that the core keeps
  (GN-6aa) and a later member calls is judged at the end of the case, not after the member that stored it. A contract
  that requires a call writes its row with `once`, one row for each call; a contract that requires the calls of a
  callback in their order names `calls` too. A function fixture of GN-6ae has no rows and is not judged here: its
  steps run when the function is called. Python, Node and WASM hold the fixtures of the running test in a list of
  the test module, which is emptied before each test (`setUp`, `test.beforeEach`), and require `_unanswered()` or
  `unanswered()` to be empty. PHP makes a fixture with such a row through `self::made` of the test class, which
  `setUp` empties, and requires `self::unanswered()` to be empty. Go adds each fixture with such a row to the slice
  `onceFixtures` of the test where the fixture is made, also inside a block, and requires `unanswered()` of each to
  be empty. The test of a case whose fixtures have no row with `once` is written as it was. Why: a fixture failed
  only on a call that no row answers, so the test of a case passed for a core that never calls the callback or the
  function, and no case could state that a call must come (orm, B2.482).
- **GN-13g** Go: a parameter of a number type holds only values of its Go type, so the B-2 values of GN-13 of another
  Go type (true, "7", 1.5, NaN and the infinities at an `int`, `uint` or `int64`, -1 at a `uint`, true, "7" and an
  integer at a `float`) cannot be the argument of a call. For each number type of a parameter of the contract, the
  feature `codec-test` and the build tag `polyspec_<library>_codec_test` give the function `<Type>In(value any, subject string)
  error` of `internal/binding` (`UintIn`, `IntIn`, `Int64In`, `FloatIn`) over the entry point `<prefix>__number_in`.
  The function encodes the Go value as a host value: a bool, a Go integer in the range of int64, a Go integer above
  it, a Go float, a Go string, or any other value. The entry point judges it by the conversion of that number type
  of the binding: a value of the Go type of the number type passes the range of GN-12a, another Go number (an
  integer at a `float`, a float at an integer type, an integer above the range of i64) is kind `invalid_number` of
  B-2, and a bool, a string or any other value is kind `invalid_argument_type` (GN-12a), each with the subject. So the error is the one that a call with that argument gives in
  the other targets. `zz_generated_codec_test.go` checks the B-2 values of GN-13 for each such type, and a value of
  the type (7, or 1.5 and NaN for a float) passes. A test of another repository that has a host value of another type
  for a number parameter, such as a legacy case with an input type, passes it through this function, because the Go
  call cannot take it.
- **GN-13c** WASM: `packages/ts/wasm/generated/tests/generated.test.mjs` runs the tests of GN-13 for Node, those of the
  members of a class among them, the tests of K-2 and the callback fixtures of a case among them, and the U-7 tests of
  an alias (GN-18b), with `node --test` against the subpath `./wasm` of the installed package. The B-7 test runs last: it runs the panic entry
  point through `state.mjs` and expects kind `internal`, then a later call that is kind `internal` when the instance
  trapped and that works when the module unwinds (GW-7).
- **GN-13h** A row of `cases` that names a member may have `only` (Q-4): the cases of its group are generated, as tests
  and as values that another test reads, only for the targets that it lists, and the tests of every other target
  leave them out; a row without `only` holds for every target of its member. A row with `only` names at least one
  target where its member is generated. Why: a case may state a behaviour that a target does not have, such as a
  render that needs a loader that reads files, which WebAssembly has no file system for, while the member itself is
  generated there; the row keeps the case for the targets that have the behaviour, instead of an `only` of the member
  that would leave every other case of the member out of that target too. A row of `cases` that names an alias
  may have `only` too, with the same meaning for the cases of the in function of the alias (U-7), and names at least
  one target where the alias is generated. Why: a case of an alias may state a value that a target cannot make, such
  as an integer outside the 64-bit int of PHP, while the core refuses that value in the other targets.
- **GN-13i** A case may have `@files`, the files that its test writes before it makes any value of the case: an object
  from a relative path, in the form of a case value of `path` (GN-6y), to the bytes of the file, a text for its UTF-8
  or `{"hex": ...}` as bytes are written (GN-13). The test of B-4, GN-6ae, GN-6m, GN-6z and GN-13e of the case writes each
  file, in the order of the object, inside the directory of the test of GN-6y, after it makes the directories of the
  path, with the mode 0600 for a file and 0700 for a directory, and before it makes the receiver, the arguments and
  the fixtures of the case; the directory is removed with the test as GN-6y states. A case value of `path` names a
  file of the case or the directory itself (`.`), so a member that reads a stored file reads the bytes of the case.
  Each target gives the relative path and the hex of the bytes to a helper of its test file: Python
  `self._case_file`, Node `caseFile`, PHP `$this->caseFile`, Go `caseFile(t, ...)`, and WASM `caseFile` with
  `node:fs` of the Node.js that runs its tests (GN-13c), whose directory `afterEach` removes as in Node. The core of
  WASM has no file system (`wasm32-unknown-unknown`), so a member whose core reads the files has an `only` without
  `wasm` (Q-4, GN-6y); WASM still writes the files of every case that it runs, so a case means the same in each
  target. `@files` of another form, a path that GN-6y refuses, or content that is neither a text nor `{"hex": ...}`
  fails the test of the case with the reason in every target, and the other tests are written (G-4, GN-13e). A test
  that needs any receiver (B-2, B-3, G-7) takes none from a case with `@files`, because it writes no files; a case of
  a hook (N-4) with `@files` is refused by name, because the tests of a hook write none; and a case that runs through
  an entry point of `case-test` (GN-13) writes no files, because that entry point runs a conversion alone. Why: a
  stored file that holds given bytes is an input of a case, as an argument is, while a fault injection point imitates
  a condition of the system (G-5); bytes that a point gave in place of a file would run a path that no stored file
  takes, so the case carries the bytes and the test writes them where the member reads. The key begins with `@`, which
  no name in snake_case has, so it is outside the names of the contract and of its cases: a parameter, a field or an
  expected value of a case may be named `files` and keeps its meaning, and the generator reads no key of the contract's
  own names as the files of a case.
  A path of `@files` names a file whose name is no Unicode text by the escape `\xHH`, two lower-case hex digits of one
  byte from `80` to `ff`, such as `"sets/\\xff.dbs"` in the JSON of the case for the bytes `sets/`, `0xff` and `.dbs`.
  A backslash is no part of a path of GN-6y, so the escape gives no path of a text another meaning. A path with the
  escape holds no other backslash, and its bytes are no well-formed UTF-8, because a name that is UTF-8 is written as
  its text, so that each name has one spelling. A test writes such a file by the bytes of its path: Python
  `self._case_byte_file` with the str that `os.fsdecode` gives on Linux, Node and WASM `caseByteFile` with a Buffer path,
  and PHP and Go `$this->caseFile` and `caseFile(t, ...)` with a string of the bytes. A file system of macOS and Windows stores a name as Unicode and
  refuses such a name, and Linux stores the bytes of a name as they are, so the test of a case with such a path runs
  only on Linux: on another system it is skipped with the reason before it writes a file (Python `self.skipTest`, Node
  and WASM `t.skip`, PHP `self::markTestSkipped`, Go `t.Skip`). A case value of `path` names no such file, because a
  value of `path` is a text; it names the directory that holds it. An escape of another form, a byte below `80` or a
  path whose bytes are UTF-8 fail the test of the case with the reason in every target. Why: a core that lists a
  directory meets a name that is not Unicode on Linux, such as the refusal of a set whose directory holds one, and
  only a file of that name on the disk gives the core that listing.
- **GN-13j** A case may run against a service that the test run of the repository provides, such as a database
  server, through `"service": {"id": "<service id>", "setup": <JSON>, "check": <JSON>}`, of which `setup` and `check`
  are optional. The contract declares each such service in `services` (contract check CK-95):
  `{"id", "address", "state", "reason"}`, where `address` is the name of the environment variable that holds the
  address of the service, `state`, when given, the name of the environment variable that holds the absolute path of a
  program that writes and reads the state of the service, and `reason` the rule whose behaviour needs the service.
  The test run owns the service: it starts the service before the tests of a target, sets the variables, and removes
  the service at its end; the generated test neither starts nor stops it. A case value at a place of the type `text`
  or `latin1`, also inside an `optional` or a list and in the receiver of the case, may be `{"service": "address"}`,
  the text of the variable `address`, or `{"service": "scope"}`, the scope of the case:
  `<target>:<member id>:<case id>:`, the name of the space of the service that the case alone uses, such as the
  prefix of its keys or the name of its database. So two cases, of one target or of two targets that run at once
  against one service, never share state. Each case test of GN-13 (B-4, GN-6ae, GN-6m, GN-6z, GN-13e) of a case with
  `service`, after it writes the files of GN-13i, reads the variable `address`, and a variable that is not set or
  is empty fails the test with the service and the variable: a missing service is a failure of the test run, never a
  skipped test. Then, with `setup`, it runs the program of the variable `state` with the arguments `setup` and the
  scope and the JSON text of `setup` on its standard input, after which the scope holds that state and nothing else,
  and only then makes the receiver, the arguments and the fixtures of the case. After the call and its checks, with
  `check`, it runs the program with `check`, the scope and the JSON text of `check`, which exits with 0 when the
  scope holds that state. A call of `then` of an instance value (GN-13f) may have `"service": <JSON>`: after that
  call, the test runs the program with `change`, the scope and that JSON text, so a state that another client of the
  service makes while the receiver lives (a lock that another holder takes) has a case. The program runs with the
  environment of the test, so it reads the address itself; the test waits for its exit without a time limit and
  fails with the step, the status and the output of the program when the status is not 0, or when `state` is not
  set. Each target runs the program with a helper of its test file: Python `_service_state` with `subprocess.run`,
  Node `serviceState` with `spawnSync` of `node:child_process`, PHP `self::serviceState` with `proc_open`, Go
  `serviceState(t, ...)` with `os/exec`, and WASM `serviceState` with `node:child_process` of the Node.js that runs its
  tests (GN-13c); the address is read by `_service_address`, `serviceAddress`, `self::serviceAddress` and
  `serviceAddress(t, ...)`. The tests of a target run one after another, so the setup of a case is not changed by
  another case of the target before its call. A test that needs any receiver or takes the values of the first case
  without its own lines (B-2, B-3, G-7, U-2, and the Go tests of the error and the panic of a func, GN-6z) takes none from a
  case with `service`; a case of a hook (N-4) with `service` is refused by name, because the tests of a hook run no
  lines of a case; and a case that runs through an entry point of `case-test` (GN-13) runs none, because that entry
  point runs a conversion alone. A `service` of another form, an id that `services` does not declare, `setup`,
  `check` or the `service` of a call of `then` of a service without `state`, and a value `{"service": ...}` in a case
  without `service` fail the test of the case with the reason in every target, and the other tests are written (G-4,
  GN-13e). The core of WASM (`wasm32-unknown-unknown`) has no socket, so it reaches no service: the WASM test of a
  case with `service` fails with that reason, and the row of `cases` of such a case has an `only` without `wasm`
  (GN-13h), which `binding check` requires (CK-95). Why: the state of a server, such as a lock that another holder
  took or a record stored in it, is an input of the case, as a stored file is (GN-13i), while a fault injection point
  imitates a condition of the system (G-5); a point that gave a reply in place of the server would run a path that no
  server takes. The meaning of a state belongs to the repository that owns the service, so binding passes the JSON of
  the case to the program of that repository and speaks no protocol of a service.
- **GN-13q** A case may run a second session of its service at the same time as its own, the peer, through `peer` of
  its `service`: `"service": {"id": "<service id>", "setup": <JSON>, "peer": <JSON>, "check": <JSON>}`, and a call of
  `then` of an instance value (GN-13f) may have `"peer": <JSON>`. The peer is a process of the program of the variable
  `state` (GN-13j), which the test starts with the arguments `peer` and the scope after `setup` and before the receiver,
  the arguments and the fixtures of the case. The test writes the JSON text of `peer` as one line to the standard
  input of the peer and reads one line from its standard output, which is `ready` when the session of the peer holds
  the state that the JSON states. After a call of `then` with `peer`, the test writes the JSON text of that `peer` as
  one line and reads the line `ready` again. After the call of the case and its checks, and before `check`, the test
  closes the standard input of the peer and waits for its exit, whose status is 0 when the session of the peer ended
  as the JSON of the case states. The standard error of the peer is the standard error of the test. A line other than
  `ready`, the end of the output before `ready`, a peer that does not start and a status that is not 0 fail the test
  with the step, the service, the scope and the line or the status. The test waits for each line and for the exit
  without a time limit. A test that ends before it waited for the exit of its peer, by a failure or by an exception,
  kills the peer and waits for its exit in its cleanup, so no peer outlives its test and no lock of a peer stays on
  the server: Go `t.Cleanup`, Python `addCleanup`, PHP a method with the attribute `After`, and Node `afterEach`. Each
  target runs the peer with helpers of its test file, which find the peer of the test by its scope: Python
  `_service_peer`, `_service_peer_next` and `_service_peer_end` with `subprocess.Popen`, Node `servicePeer`,
  `servicePeerNext` and `servicePeerEnd` with `spawn` of `node:child_process`, which the test awaits, PHP
  `self::servicePeer`, `self::servicePeerNext` and `self::servicePeerEnd` with `proc_open`, and Go
  `servicePeer(t, ...)`, `servicePeerNext(t, ...)` and `servicePeerEnd(t, ...)` with `os/exec`. WASM reaches no service
  (GN-13j), so its test of such a case fails with that reason. `peer` of a service without `state`, a `peer` of a call
  of `then` in a case whose service has no `peer`, and a `peer` of a call of `then` in a case without `service` fail
  the test of the case with the reason in every target, and the other tests are written (G-4, GN-13e); `binding check`
  reports them (CK-95). The order of the statements of the two sessions is the order of the case, and the JSON of each
  step states the statements that the peer runs. A deadlock between two row locks is such a case:

  ```json
  {"id": "a_deadlock_between_two_row_locks", "rule": "SVC-9",
   "service": {"id": "postgres", "setup": {"table": "service_deadlock_row", "rows": [[1], [2]]},
               "peer": {"lock": 1, "victim": false}, "check": {"released": true}},
   "receiver": {"new": "transaction.begin", "args": {"dsn": {"service": "address"}},
                "then": [{"call": "transaction.lock_row", "args": {"row": 2}, "peer": {"lock": 2}}]},
   "row": 1, "raises": {"kind": "deadlock"}}
  ```

  The peer locks row 1 and writes `ready`; the receiver locks row 2, after which the peer requests row 2 and writes
  `ready` when its statement waits for the lock; the call of the case requests row 1, which closes the cycle, and the
  server ends one of the two transactions with the deadlock. The program of the repository makes the transaction that
  the case names the one that the server ends, for example by the deadlock timeout of the session of the peer on
  PostgreSQL and by the number of rows that the transaction of the peer changed on MySQL, and the exit status of the
  peer states whether its session ended as the JSON states: with `"victim": false` its transaction commits, and the
  case raises `deadlock`. Why: a deadlock needs two sessions that each hold a lock that the other requests, so a second
  client must run while the call of the case waits; a `change` of GN-13j runs the program to its end before the next
  statement of the test and cannot wait inside a lock. The peer is a child process of the test, so the test owns it
  and ends it; the session and its statements belong to the repository that owns the service, and binding passes the
  JSON of the case to its program as GN-13j does and reads no line other than `ready`.

- **GN-13k** Every alias-case test checks the declared error status, including an explicit `null`, and the errno
  as well as the exact error class and kind. A case without `status` declares no status expectation. An absent or
  null errno expects no errno; a numeric errno expects that number, and a symbol is resolved as in the member
  tests of GN-13 (WASM expects no platform errno for a symbol). These checks also apply when PHP runs a value
  without a PHP form through `case-test`. Alias normalization retains these expectations because discarding
  them would allow an incorrect error payload to pass the test.

- **GN-13ka** A member case that raises and names no `status` declares no status expectation, as an alias case
  does (GN-13k): no target checks the status of its error. Why: the status of a kind belongs to the core, and a
  check of an undeclared value writes `undefined` into the test, which Go does not compile.
- **GN-13n** A function fixture (GN-6ae) may have `"names": ["<name>", ...]`, a snake_case name for each of its
  first parameters by position, each of a class or an interface of this contract. In the steps of that fixture and of
  every fixture inside it, `on` may be such a name as well as a position, and the case value `{"bound": "<name>"}` at
  a parameter of a step is the argument of that name, of the class of the parameter or of a class that implements it.
  A name is given once among the fixtures around a step. The function keeps each named argument when it is called:
  Python and PHP in a store of the test, Node, WASM and Go in a variable of the function, which the functions inside
  it close over. Why: a member may take a value that the function got, such as the scope of a transaction that a step
  of a nested scope writes into, and a position names only an argument of the innermost function.
- **GN-13o** A step of a function fixture and a call of `after` may name `"raises": {"kind": <kind>}` in place of
  `result`, a kind of the raises of the member of the call: the call must fail with that kind, which the test or the
  function requires before its next call. An instance value `{"new": "<static>", ...}` among the args of such a call
  is made by its static, with the failure check of GN-13f, before the call, in every target, as for a call that
  names `result` (B2.506): outside the outcome of the call, which holds the call alone, so a failure of the static
  fails the test even with the kind that the call expects, and is never taken as the failure of the call (B2.509). A call of `after` may name `"on": "<name>"`, a name that a function fixture
  of the case gives (GN-13n), and is then a call on the argument that the function kept, after the function returned,
  in place of the receiver of the case; a member without a receiver takes such a call too. Python and PHP keep the
  argument in the store of the test, Node and WASM in the store of the module, and Go in a variable of the test. A
  kind that such a call raises counts as a case of the member of the call for CK-22. Why: a kind that a value reaches
  only after the callback that got it ended, such as a transaction that ended, or only while another call runs, has
  no case of the member itself, because the case of the member cannot make that value.
- **GN-13p** In a case of a method, a step of a function fixture at any depth may name `"on": "receiver"`, and a
  step argument may be `{"bound": "receiver"}`: the receiver of the case, which the test keeps under the name
  `receiver` when it makes it, as a name of GN-13n; no fixture gives that name itself. With `raises` (GN-13o) such a
  step shows a kind that the receiver gives only while its own call runs. Why: a member may refuse a call on its
  receiver while the callback of another of its calls runs, such as a pool whose one connection the transaction of
  the callback holds, and that kind has a case only when the callback reaches the receiver.
  In Node and WASM the step reads the outcome of its call at once unless that call awaits, because the function of
  the step is an async function only when one of its calls awaits, and `await` in another function is a syntax error.
- **GN-13pa** A case of a method may name `"with": {"<name>": <instance value>, ...}`: each value is an instance
  value of GN-13f of the form `{"new": "<member id>", ...}`, whose member makes a class of this contract, and its name
  is a snake_case name other than `receiver`. The test makes each value after the receiver of the case, in the order of
  `with`, and keeps it under its name as a name of GN-13n: a step of a function fixture at any depth may name it as
  `on`, a step argument may be `{"bound": "<name>"}`, and a call of `after` may name it as `on` (GN-13o). No function
  fixture of the case gives that name too. A step that raises (GN-13o) is followed by the next step of its function,
  so a case shows a kind that a step raises and then the state that the next step reads.
  Why: a class that only a callback gives, such as the transaction of an ORM, is reached by a value that the case
  makes outside the callback, such as a query that a step connects to the transaction and a call of `after` runs
  after the transaction ended; without a name that value is made inside each call that takes it and is not the same
  value in the next call. A member that such a step or call of `after` calls has its case there (CK-22).
- **GN-13l** A case value at a place of type `text` may be
  `{"text": [<literal>, {"case_path": "<relative>", "as": "json-string"}, ...]}`. The outer object has only `text`,
  whose nonempty array contains only Unicode strings, path objects with only `case_path` and optional `as`, and the
  port of the listener of the case, `{"listener": "port"}` (GN-13r).
  A path object omitting `as` inserts the raw resolved path; its only explicit mode is `json-string`, which inserts
  a complete quoted JSON string token. A relative path obeys GN-6y and contains no NUL or unpaired surrogate.
  Literal strings and the private JSON quoting helper permit every Unicode control character, including NUL.
  Every path uses the same case-owned root as GN-13i files, initialized before receiver, argument and callback
  construction; a referenced file need not exist. No observed result, environment expansion, general formatter or executable expression supplies a part.
  Expected text keeps every literal byte, whitespace and key order and is compared as text, never as parsed JSON.
  This form is interpreted only at typed text places; genuine record and map data is unchanged. It fails by name
  in unsupported scalar places and every aliased constructor projection instead of coercing the object to a string.
  This includes typed text reached through optional, list, map or record parameters, regardless of alias kind;
  genuine map and record data remains data. Alias-token expansion is not added.
  Existing plain text, `ill_formed` and typed `path` keep their meanings. Private helpers that defer a new text
  conversion carry the same case owner through a hidden argument or a private closure; they resolve no global
  root and add no lifetime beyond the existing case. Helpers that do not use this form remain unchanged.
  Each test sets the root in its own body when an expression of that test takes it, and only then: a target makes the
  expressions of a test as it writes that test, so no test takes a root that another test set (B2.493). Why: the B-5c
  tests of orm were all made before the first was written, so the instance of `StepRunner` took a root that only the
  test of `Query` set (PHP: `caseTextPath()` with a null root; Node: `_caseTextRoot is not defined`).

  A JSON string token escapes quote, backslash and U+0000–001F, using `\b`, `\t`, `\n`, `\f`, `\r` for their named
  controls and lower-case `\u00xx` for the others. Slash, non-ASCII Unicode, `<`, `>`, `&`, U+2028 and U+2029 remain
  literal UTF-8; malformed Unicode is refused, never replaced. Fixed native input and expected UTF-8 hex vectors
  verify this exact spelling independently of each helper, including literal backslash-u sequences. An independent
  witness writes through the old GN-13i helper and reads through the composed path using standard filesystem I/O,
  so matching wrong input and expected callbacks cannot confirm one another's root.
  WASM may compose text from the root owned by its Node test host; this adds no typed OS path or Rust filesystem
  access. GN-6y and CK-15 remain in force; real filesystem or database cases retain their declared applicability.

- **GN-13m** The directory of a case (GN-6y, GN-13i, GN-13l) is named by its real path: each target resolves the
  symbolic links of the path of the directory that it makes, once, before it names a path inside it (Python
  `os.path.realpath`, Node and WASM `realpathSync`, PHP `realpath`, Go `filepath.EvalSymlinks`), and a failure to
  resolve it fails the test with the path. So a path of a case in an argument, in the text of an address of a service
  (GN-13j, such as `{"text": ["sqlite://", {"case_path": "a.db"}]}`) and in an expected result is the same text as the
  path that a core gives back after it resolved the directory itself. A case names the directory only through
  `case_path` and a value of `path`; no placeholder inside a text stands for it. Why: the temporary directory of a
  system can be reached through a symbolic link (`/var` and `/private/var` of macOS), so a core that resolves the path
  gives a text that differs from the path the test made, and an expected text with the unresolved path would fail a
  correct result; one resolved form makes the expected text exact without a rule that rewrites results.
- **GN-13r** A case may have `"@listener": "accept_and_close"`, a server that its test runs for the case alone: a TCP
  listener on `127.0.0.1` at a port that the system assigns, which accepts each connection and closes it at once,
  without reading from it. A part `{"listener": "port"}` of a composed case text (GN-13l) is the port of that listener
  in decimal, such as `{"text": ["postgres://orm@127.0.0.1:", {"listener": "port"}, "/orm_test"]}`. The test of B-4,
  GN-6ae, GN-6m, GN-6z and GN-13e of the case starts the listener after it writes the files of GN-13i and before the
  service of GN-13j, the receiver, the arguments and the fixtures of the case, and it stops the listener and waits for
  its end when the test ends, also when the test fails. The listener runs beside the call, because a call that blocks
  its thread would otherwise hold the connection open: Python and PHP start it as a child process of the interpreter of
  the test (`sys.executable`, `PHP_BINARY`), which writes its port as one line and which the test reads before it goes
  on; Node and WASM start it in a `Worker` of `node:worker_threads`, which gives its port through a
  `SharedArrayBuffer` that the test waits on with `Atomics.wait`; Go starts it in a goroutine. Each target starts it
  with a helper of its test file: Python `self._case_listener`, Node and WASM `caseListener`, PHP
  `$this->caseListener`, and Go `caseListener(t)`, and a value names the port through `_case_listener_port`,
  `caseListenerPort`, `GeneratedTest::$caseListenerPort` and `caseListenerPort`. A listener that cannot be made fails
  the test with the reason; no step waits with a time limit, and none sleeps. WASM starts the listener of every case
  that it runs too, so a case means the same in each target; the core of WASM has no socket (GN-13j), so a member
  whose core connects has an `only` without `wasm` (GN-13h). `@listener` of another value, and a part
  `{"listener": ...}` of another form or in a case without `@listener`, fail the test of the case with the reason in
  every target, and the other tests are written (G-4, GN-13e). A test that needs any receiver or takes the values of a
  case without its lines (B-2, B-3, G-7, U-2, GN-6z) takes none from a case with `@listener`, a case of a hook (N-4)
  with `@listener` is refused by name, and a case that runs through an entry point of `case-test` (GN-13) starts no
  listener, as for a case with `service`. Why: a server that accepts a connection and then closes it is a state of the
  network that a core meets during its handshake, such as the lost connection of a database client, which a closed
  port does not give, because the system refuses a connection to a closed port before any handshake; a fault
  injection point in its place would run a path that no socket takes.
- **GN-13w** A target whose language is statically typed (Go) writes no test for a case that raises and whose
  argument, or an argument of the factory of its receiver, is no value of the declared type of its parameter, or holds
  such a value anywhere inside it (an item of a list or of its repeat form, a part of a tuple, an entry of a map, a field
  of a record or of a case of a variant), since Go writes the whole argument as one literal of its type: a number or a bool for a text, a text or a bool for a
  number, a negative number for a `uint`, a fraction for an integer, a number or a text for a bool. The test file
  names each such case with a comment that gives the case, the member and the reason; the dynamic targets (Python,
  Node, WASM, PHP) keep the case and give the value as its JSON kind for the binding to refuse (GN-13d). Why: such a
  case states the refusal of a binding that takes any value, and the Go compiler refuses the value at the call before
  the binding runs, so the case has no Go call; `binding check` does not report it, because the case is right for
  the dynamic targets, where it is the only test of that refusal. A value nested in the argument is judged the same way
  (B2.397), because every dynamic target converts an item, an entry and a field with the same conversion as an argument
  and refuses it with the same kind before the core runs, and session-store states that refusal for the uint fields of
  the record `options` of `redis_sessions.new`; Go wrote `[]uint64{2, -1}` for a list item, which its compiler refuses.
- **GN-13x** The Go tests declare the type `fixture`, with the imports that it uses, whenever they declare the double
  `fixture<Name>` of a callback unit, which embeds it. Why: every callback unit of the contract has its doubles, also
  when no case of it names a fixture, and a double without its type does not compile.
- **GN-13y** The K-2 tests of a member that takes a callback (a callback without its members, the exception of a
  callback, a callback result of another type) give the other arguments of the first case of the member whose callback
  fixture lists calls, and give placeholders only where no such case exists, in every target. Why: a core may judge
  another argument before it calls the callback, and the crud-ui validator refused a placeholder `data` with
  `invalid_form_input`, so the test expected a callback that the core never reached; a case whose fixture lists calls
  states arguments with which the core calls it. A case whose callback rows all give a result comes before one whose
  callback raises (B2.385). Why: a core may answer a raise of the callback itself, and sample `tolerant` swallows it
  for a key `?a`, so the tests of an exception and of a result of another type failed with the first case.
- **GN-13t** A test of a member that gives one argument a value of its own and the others placeholders (B-2, B-3, B-8,
  T-1, T-2, U-2 with null, GN-6z, and the K-2 tests without a case of GN-13y) gives an argument of a class (T-5) the
  case value of that argument in the first case of the member that gives every argument and arms no faults, writes
  no files and runs against no service, a case that does not raise before one that raises, in every target; the
  placeholder of GN-13 stands there only when no such case exists. The case of the member, and not one of the
  constructor of the class, supplies the value, because only it states an instance that the member takes. Why: the
  core of a class may refuse the placeholder arguments of its first constructor, and crud-ui refused
  `FormTemplate.from_json` of a JSON null with `invalid_form_input`, so the B-3 test failed in its argument before the
  call that it checks. A case value that the generator does not write in a target supplies no value there, and the
  placeholder stands: that case fails its own test by name (G-4, GN-13e), and the tests of the other rules are written.
  The G-7 test of a member, and the Python test of GN-11a, give an argument of a class by the same rule (B2.463).
  An argument of a generated interface (GN-6ap) takes the case value by the same rule, because its placeholder is an
  instance that the first factory of a class that implements it makes of placeholders (B2.493). Why: the connection of
  orm `Query.connect` and `StepRunner.new` is an interface, whose placeholder was `Db::connect("a", 0, …)` with a
  cache size 0, which the core refuses with `config: cache sizes must be positive` before the argument count that
  the G-7 test checks. A B-5c test makes each instance of a class that it needs (the instance that it poisons or gives
  at two places, the receiver of the call that takes that instance as an argument, and the other instance of GN-8a)
  as the tests that need any receiver do: from the factory arguments of the first case of the class that does not
  raise, arms no faults, writes no files and runs against no service (GN-13f); the placeholder of GN-13 stands there
  only when no case of the class makes an instance. Why: the core of orm refuses `Schema.load` of three texts `a`, so
  the tests of G-7 and B-5c of `Query` and `StepRunner` failed in an argument or in the instance, before the argument
  count or the poison entry point that they check.
  The G-7 test of a method makes its receiver once, as a local of the test, and runs every call of the test on that
  local (PHP, Python, Node, WASM; B2.463). Why: a receiver that holds state cannot be made twice in one case folder,
  and the three calls of the G-7 test of orm `StepRunner.run` each made the receiver, so the second failed with
  `table owner already exists`; the calls of G-7 fail before the core runs, so they leave the one receiver as it was.
  So does every argument of a class or of a generated interface of the G-7 test: the test makes it once, as a local
  `argument<i>` after the receiver, and every call of the test takes that local (PHP, Python, Node, WASM; B2.508). Go
  has no G-7 test, since its calls of the wrong shape do not compile. Why: the G-7 test of orm `StepRunner.new` made
  its arguments in each call over the one case folder, so the second failed with `table owner already exists`.
- **GN-13z** The Python U-2 and T-1 tests compare the two outcomes by `_same`, which compares an instance of a value
  class of another repository by what the members of its in row read (B2.121), and not by `assertEqual`. Why: the class
  of the owner need not declare `__eq__`, and `polyspec.json.Value` does not, so two equal results compared by identity
  and differed (crud-ui validator), where Node and WASM, which compare by their tokens, passed.
- **GN-13s** A Python function of the module that makes a receiver (GN-13f) takes the test case as its first
  parameter `self`, and its call passes `self`, when one of its steps calls a helper of the test case, such as
  `self._case_path` for a `path` argument or `self._future`. Why: a function of the module has no `self` of its own,
  so the step raised NameError before the case ran.
- **GN-13u** A Python or PHP test closes each instance that it made for a case (GN-13f) whose class has a cleanup
  member (B-10) at the end of the test, apart from the assertions of the case: Python by `self.addCleanup`, PHP by a
  method with the attribute `After`. The call of the cleanup member gives no result and no failure to the test, and
  an instance that the case already closed is closed again without effect. The instance of the B-10 test of a class
  is not closed: that test drops it without its cleanup call to see the warning. Why: an instance dropped without its
  cleanup call warns by B-10 (ResourceWarning, E_WARNING), which is a defect of the test and not of the binding, and a
  warning that a test suppressed would hide the same warning of a real defect.


## End-to-end check

- **GN-13v** A PHP test gives the case value of an empty map, `{"kind": "map", "value": []}`, of a value alias as
  `new \stdClass()` when the PHP `in` rows of the alias read an array with sequence keys as a list and a `stdClass`
  as a map; a map with entries stays an array, and another alias keeps the empty array. Why: the keys of an empty
  PHP array are sequence keys, so the row of `array` reads it as an empty list and the core refuses it as no map
  (template `engine.render`, `data_unsupported_type`), while the row of `stdClass` reads the empty map that the case
  states.
- **GN-14** `make e2e REPO=<checkout> [WORK=<directory>] [BINDING=<commit>] [DEPS="<checkout>..."]`,
  which runs `scripts/e2e.mts` of the commit `BINDING` (GN-14b) on the Node.js of the checkout in the directory `WORK`,
  or, without `WORK`, in a directory that the run makes under the temporary directory of the system, named by its real
  path, and removes when it ends, when it fails and on SIGINT and SIGTERM, after every process of the run has exited, so
  a run without `WORK` writes nothing into the checkout but its record; the real path is the name because npm reads a
  package under a path through a symbolic link, such as `/var` of macOS, as a link that its lock does not hold (`tests/e2e/sample` and `tests/e2e/shapes` are repositories of the items that no polyspec repository generates alone yet,
  the first among them the two forms of a call of `then` (GN-13f: the tally of a counter that arms its own fault and
  leaves its failure for settle, and the clear of a shelf that a slip made from it then misses), the second those of GN-6i, GN-6j and GN-7a for Python, Node and PHP with a member of the receiver `&mut self` that
  takes a `source` and a default (GN-6h); `tests/e2e/classes` is one of a class unit with every kind of member and
  no unit that WASM refuses (GN-18a); and `tests/e2e/consumer` is one that names the
  value alias of the sample, whose rows name classes of the sample (GN-6ar), and has an error unit with properties (GN-6k, GN-7a), run with `--dep tests/e2e/sample`;
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
  for python (maturin builds the wheel for the Python of a venv of that Python, into which one `pip install
  --no-index` installs every wheel of the run, each by its URL on the loopback, where the run serves the directory of
  the wheels, GN-3h), npm of `mise.toml` and the package of the Node addon for node, the wasm-bindgen CLI of `mise.toml` of the release
  of the crate and the Rust target `wasm32-unknown-unknown` of `rust-toolchain.toml` for wasm, the PHP of `.php-version`
  (its minor is compared, because the PHP of the machine is wrapped as it is) the PHPUnit of `config/phpunit` and `llvm-nm` of the component
  `llvm-tools` for php (GN-8a) with the libclang and the clang of the LLVM whose major release `config/toolchain.json`
  pins, which the run gives to the bindgen of ext-php-rs (`LIBCLANG_PATH`, `CLANG_PATH`) because clang-sys otherwise
  loads the highest libclang of the machine while bindgen takes its headers from the clang of `PATH`, and Go of `mise.toml` with that `llvm-nm` for go (BD-10 (d)); the check itself runs on the
  Node.js of `mise.toml`, and every command of the run uses the Rust toolchain of `rust-toolchain.toml` of the checkout
  (`RUSTUP_TOOLCHAIN`), because rustup otherwise reads the toolchain file of the directory of a command, and a command
  that runs in a copy would build with the toolchain of the copy or the default of the machine. When a tool is missing, the check fails before it copies anything and names the target, the
  tool, the file that pins it and `make install`. No switch, option or environment variable leaves a target out or runs
  it on another tool, and no generated or case test of a target is skipped: a test that needs a setting of its runner,
  such as the collector of GN-18a, gets it from the check and fails without it. Why: a target that did not run is not
  verified while the run would look passed, and a result of a tool that the checkout does not pin cannot be repeated.
  The run ends with what it did for each target, a lint apart from the tests: the lint of the crates on the host, `php
  -l`, `gofmt -l`, `go vet`, `llvm-nm` and `tsc` read the code and run nothing, so they verify no target. `tsc --strict`
  reads the declarations of each package where npm installed it, with `--module nodenext` in the directory of the
  installed packages, because the declarations import the packages that the package depends on (GN-6s), which only
  that directory holds, by the exports of their manifests (`@polyspec/sample/wasm`); a run of PHPUnit
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
  the version of the core of that module, of the repository or of a dependency. A run that writes the release form
  (GN-14l) makes these repositories in two parts, among the steps of that form: the one of each dependency before
  `binding scaffold` of the release form, which writes `go.sum` from its tag (GN-15l), and the one of the repository
  after it, so its commit holds the `go.mod` and the `go.sum` of a release; the consumer below is then the last step
  of the run. A run that writes no release form, the one of a repository without a dependency among them, makes them
  all in one step after the Go tests, and tags a dependency that its `go.mod` requires at `v0.0.0`, a development
  form that the run does not rewrite, at `v0.0.0`. What B2.458 changed: before it a dependency always had the tag of
  the version that the `go.mod` required, `v0.0.0` for a path, so the consumer of a repository of `tests/e2e` with a
  dependency fetched a module whose `go.mod` required `v0.0.0`, which no release holds (GN-19f refuses it); the
  released form of such a repository is now proven in the release form alone, and no longer with the `go.mod` of the
  development form. Git reads `https://github.com/` as the directory of these repositories (`url.<base>.insteadOf`
  of a configuration file of the run, the one configuration that the Git of these commands reads: `GIT_CONFIG_GLOBAL`
  names it, with no system file and none of the variables of the Git dependency of Cargo) and opens no transport but
  a file (`GIT_ALLOW_PROTOCOL=file`), so `go` fetches each module by its module path and its tag without a network: a
  repository or a tag that the run did not make fails by the directory of the run, and a URL that the configuration
  does not turn into that directory is refused before a connection. A consumer module, whose `go.mod` holds the line `require` of the Go
  module of each contract and nothing else of them, imports every package of those modules in a test; the run writes
  its `go.sum` with `go mod tidy`, then runs `go test` of the consumer and of every package of the fetched modules
  from the module cache of the run, whose directories Go keeps read-only, with `GOPROXY=direct`, `GOSUMDB=off`,
  `GOENV=off`, `GOFLAGS` empty and no `CGO_LDFLAGS`. The run fails when the `go.mod` of the consumer holds a `replace`, and it counts the tests as
  GN-14a states. It removes the module cache with `go clean -modcache` when the step ends. The tree of the commit
  holds the files that the commit of a release carries, which the run reads from the function of GN-15g that
  `binding release-go-module` reads, and the run removes a file of the module by no other rule: no generated file
  behind a build tag of a test feature and no guard of those tags (GN-13bf), no test of the repository, among them
  the contract cases that the run copied into the module (GN-14h), and no Go file of a program. The packages that
  the test of the consumer imports are the public packages of GN-19f, from the function of the command. So the `go test` with no tag is the right run of the released form: it runs every generated
  test that the form holds, and none of them is `TestGN13bfEveryBuildTagOfThePackageIsBuilt`. Why: the generated tests
  of the copy link the library of the build by `CGO_LDFLAGS`, so only this step shows that a module fetched at its
  tag links the library that it carries.
  On Linux the commit also carries the library of musl of the arch of the run in `internal/ffi/lib/linux_<arch>_musl`,
  built with `--target <arch>-unknown-linux-musl` and stripped as the other, and the run keeps the consumer of the
  step and the downloads of its module cache, the layout of a module proxy, in `<work>/go-release`.
  `make go-musl-check WORK=<work>` then runs the consumer on musl: in a container of the Alpine image of `goMusl` of
  `config/toolchain.json`, with the Go of `mise.lock` checked by its sha256 and `gcc` and `musl-dev` of Alpine at the
  exact versions of `goMusl` (`docs/operations/dependencies.md`), it runs `go test -tags musl` of the consumer and of
  every package of the fetched modules with that proxy as `GOPROXY`, prints the output of every `build-output` event of
  `go test -json`, where go reports the error of a build such as one of the linker (B2.416), and fails unless a test
  ran and none failed. A work directory without the consumer of a released form, such as the one of a refusal fixture
  (GN-14k), fails with its name before the container starts (B2.417). The
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
  treats each as absent and the run prints their paths, so no file of the copy changes. The released form leaves the same files
  out, in the end-to-end check (GN-14f) and in the commit of a release (GN-15g): one rule says what a test of the
  repository is, a file `_test.go` that the generator did not write, and the overlay and the released form both
  read it (B2.459). The test of the core (GN-14) is a step of every target and stays. Why: a
  test of the repository reads inputs that the runner of the repository gives, such as the path of its case file in
  an environment variable, which the run does not know, and one target that runs more than the others gives another
  result for the same contract.
- **GN-14k** A repository of `tests/e2e` with `refused.json` is a check that the compiler refuses its binding
  (B2.402): `refused.json` names, for each target, one rustc code, and after the generation the run checks the
  binding crate of each target with `cargo check -p <crate>` (`--target wasm32-unknown-unknown` for WASM), which must
  fail with that code and no other error; that refusal is the test of the target, and the run ends there. A check
  that passes, or that fails without the code or with another error, fails the target (`scripts/e2e-refusal.mts`).
  `tests/e2e/lent` is such a repository: its core keeps a lent record beyond the call (GN-6d), and every target is
  refused, with E0597 and in Node with E0521. Why: a one-time check proves the lifetime of the call once, and a run in
  CI keeps a change of the generator from giving a lent record `'static` again.
- **GN-14n** A repository of `tests/e2e` with `expected-failures.json` is a check that its generated tests fail where
  its contract makes them fail (B2.509): the file names, for each of the five targets, the generated tests that must
  fail, each with a text that its failure holds. Each run of tests of the target, in the development form and in the
  release form, passes only when exactly those tests fail and each failure holds its text; those tests then count
  as its passed tests. A named test that passes or does not run, a failure without its text, a failure of another
  test and a run that fails without a failed test fail the target (`scripts/e2e-expected.mts`). The file is no list
  of refusals: a target that the generator or the contract check refuses stays a named failure, and a test that the
  file names fails by the design of its fixture. `tests/e2e/falsepass` is such a repository: the argument of a call
  of `after` is made by a static that fails with the kind that the call expects, so the test of that call fails on
  the static in every target (GN-13f, GN-13o). Why: a test that passes having checked nothing looks like one that
  checks, and only a run that requires its failure shows it. A run reads `expected-failures.json` only when its
  repository is `tests/e2e/falsepass` of the tree of binding that it checks, compared by real path, and the run of
  any other repository that holds the file fails, naming the file. Why: a repository outside binding, such as one of
  a consumer, would otherwise hide any failure of its tests with that one file. A failed test of unittest is named
  `<class>.<method>`, read from the header of its failure in the form of Python 3.11 and later
  (`<module>.<class>.<method>`) and in the earlier one (`<module>.<class>`). Why: methods of two classes may share a
  name, and a failure of one would otherwise stand for the expected failure of the other. A failed test of go test
  whose name holds no `.Test`, such as an example, fails the read with a failure that names it. Why: that name is no
  name that the file can hold, and it must neither match an expected test nor be dropped.
- **GN-14l** The release form of a run (B2.458; GN-3e, GN-3h). A run whose repository names a repository of `DEPS`
  by a `path` on one line of the `[dependencies]` of a core, which every repository of `tests/e2e` with a dependency
  does, ends with the steps of the release form, after every step of the development form. The steps are added to
  the run and stand in place of none: the development form is what a repository holds until its dependency has a
  release, and no other run of CI checks it. No option turns the steps on or off; a run of a repository without
  such a line, and one with `--until lint`, has none, and a repository with a host package (L-2a) is left out and
  named, because the manifest of a host package is written by hand and no scaffold of the run writes its release
  form. The four ecosystems are in the release form together, in one order, which one function of
  `scripts/e2e-release-form.mts` gives:
  - The Go module of each dependency that a `go.mod` of the repository requires stands at the tag of its own
    version in a remote of the run (GN-14f). Before the run makes that repository it asks Go for the module at that
    tag, and the step fails unless Go fails and names the directory of the remotes of the run, which shows in each
    run that these commands read that directory and no network.
  - In the copy, each such line of a core becomes `version = "=X.Y.Z"` with the version of the core of that
    dependency, every other field kept, and the root workspace gets a `[patch.crates-io]` with the path of the copy
    of each; the run prints each change (GN-14d). A line that is not one inline table and a root manifest that
    already patches crates.io are named failures.
  - `binding scaffold` of each contract writes the manifests of a release, the `go.sum` from the tag of the first
    step among them (GN-15l), and `binding check` passes on them; both get `--go` and the settings of Git and Go of
    GN-14f. The step fails unless both end with status 0, `Cargo.lock` is byte for byte what it was, and each
    manifest that named a dependency in the development form names it at its version: `package.json` and
    `composer.json` `X.Y.Z`, `pyproject.toml` `polyspec-<library>==X.Y.Z`, `go.mod` `require <module> vX.Y.Z` with no
    `replace` line, and `go.sum` the two hashes of that module.
  - Python: the wheel of the repository is built again, because its metadata hold the requirements of
    `pyproject.toml`, and installed with the wheels of the dependencies of the run in one `pip install --no-index`,
    each by its URL on the loopback, into a venv of its own (GN-3h); the step fails unless the installed
    distribution requires `polyspec-<library>==X.Y.Z`. The generated tests then run on unittest in that venv.
  - npm: the package of the repository is packed again and installed with the tarballs of the run, those of the
    dependencies and of the platforms, through one root manifest that names each by its URL (GN-3c, GN-3h), after
    the check that the tarball of each requirement `X.Y.Z` of a packed manifest is among them. The generated tests
    of Node and of WASM then run in that directory. When no packed manifest requires the package of a dependency,
    which a manifest names only for a value class or a callback unit (GN-3e), the run says so and installs nothing.
  - Go: the Go module of the repository, with the `go.mod` and the `go.sum` that the scaffold wrote, is carried at
    its tag in a remote of the run, and the consumer of GN-14f fetches it with the module of each dependency at the
    version that its `go.mod` requires, and runs its test and the tests of every fetched module.
  - PHP has no install here: its evidence is the PIE step of a real release (GN-3h). Its `composer.json` is
    written and checked with the other manifests.
  Cargo has no release form of its own in the run: a release names a dependency by its tag, whose requirement is
  `*`, so Cargo would take a crate of any version at that tag, and it needs the remote of the dependency; the run
  uses the form `=X.Y.Z` with the patch, which Cargo refuses when the version of the crate at the path differs and
  which resolves to the crates that the lock already names.
  What runs in the release form is what the form changes: the manifests, the install of each package manager and
  the load of the package of a dependency by the installed package, which the generated tests exercise on each
  target. The run does not repeat what the form leaves as it was: the contract cases, the measurements, the lints
  (`cargo clippy`, `tsc`, `gofmt`, `go vet`, `deadcode`), the checks of `llvm-nm`, the test of the core and the test
  of the tag guard (GN-13bf); the generation, since `binding check` reads the contract of each dependency through
  Cargo as `binding generate` does (GN-15f), so the generated files are those of the development form; the builds
  of the Node addon, the WASM module and the PHP extension, whose crates resolve to the same crates under the same
  lock, so the tarballs of the platforms and the module inside the package are those of the development form; and
  the tests of PHP, whose extension the run loads by its path and not by `composer.json`. The wheel and the static
  library of Go are built in the release form, because the wheel carries the requirement and the tag carries the
  library.
  No command of these steps opens a network: Cargo runs offline (`CARGO_NET_OFFLINE=true`), Git and Go read the
  remotes of the run alone (GN-14f), pip reads no index, and npm takes each package from the loopback after the
  check of the tarballs. Why: every repository of `tests/e2e` names its dependency by a path, so before these steps
  no run installed a manifest of the release form, and the first install of one was the release of a consumer. The
  first attempt at the scaffold of the release form ended with status 1 and reached out to github.com: the `go.mod`
  required a release, `go mod download` ran (GN-15l), and no tag of the dependency stood anywhere, so the remote of
  the dependency comes first.
- **GN-14g** The contracts of `tests/e2e` that CI runs: the job `e2e` of `.github/workflows/ci.yml` runs every
  repository of `tests/e2e` whose core depends only on repositories of `tests/e2e`, each with those repositories as
  `DEPS`, and no entry of the job names a directory that the checkout does not hold. A contract whose core depends on
  a repository that is not in `tests/e2e` is run by the job only when a tracked file of the contract names a release
  tag of that repository and the run takes the packages of that release from its assets. The run has no such step
  yet: it takes the packages of a dependency from the copies of `DEPS` alone (GN-14d) and reads
  `https://github.com/polyspec/` as the directory beside the checkout, so a core that names the tag does not build in
  the job, and the release tag alone ends nothing (B2.451). The steps of the release form (GN-14l, B2.458) install
  the release form of the copies of `DEPS`, not the assets of a release: the step that downloads those assets is
  not written. Until then `tests/e2e/not-in-ci.json` lists the contract with its reason and the condition
  that ends it, and the job has no entry of it. At least one entry of the job runs the steps of the release form,
  by a core that names a repository of its `DEPS` by a path, and `packages/ts/tests/ci-workflow.test.ts` fails when
  none does. `packages/ts/tests/ci-workflow.test.ts` fails a contract that is
  neither in the job nor in the list, one that is in both, and a listed contract whose core no longer names by a
  path a repository that `tests/e2e` does not hold. `tests/e2e/relay`, whose core depends on the repository json, is
  listed until the run installs the release of json from its assets; json has a release tag since v0.0.35. A listed contract is still checked by `make e2e` with a checkout of
  its dependency as `DEPS`, before a commit is pushed or merged. Why: a job cannot check out a repository at a
  release that does not exist, an entry that names a missing directory fails for a reason that is no defect of the
  commit, and a contract that is silently left out of the job would look checked.
  Each entry of the job `e2e` runs `make ci-e2e REPO=<repository> DEPS="<repositories>"`, which installs every tool,
  runs the end-to-end check in a work directory of its own and, when the check passed, `make go-musl-check` on that
  directory, except for a refusal fixture (GN-14k), whose run ends at the refusal and makes no released form, so the released form of each Go module (GN-14f) also links and runs on musl of linux/arm64 (GN-15g); it
  removes the work directory at its end. The job `e2e-amd64` runs `make ci-e2e-amd64`, the same recipe for
  `tests/e2e/sample`, on `ubuntu-26.04`, the one job that does not
  run on `ubuntu-26.04-arm`, because a release carries the libraries of `linux_amd64` and `linux_amd64_musl` and only
  an amd64 machine links and runs them. A local run of either job is the same call. Before their recipe, whose
  `make install-tools` comes first, both jobs set up the PHP of `.php-version` with
  the pinned `shivammathur/setup-php`, with the extensions that the PHPUnit of `config/phpunit` requires (`dom`,
  `filter`, `json`, `libxml`, `mbstring`, `phar`, `tokenizer`, `xmlwriter`), because `make install-tools` wraps the
  `php` of the PATH as it is and the run compares its minor with `.php-version`: the PHP of the runner image is
  another minor, and with it the run stops before any target. The workflow runs on the push of `main` and on a manual run; a development
  branch such as `v1/rust-core` is checked by a manual run of its head (`gh workflow run ci.yml --ref <branch>`),
  because a run on every push of that branch would start the whole suite for each merge of a lane.
- **GN-14i** `make consumers-check DIRS="<dir>..."` (`scripts/consumers-check.mts`, its steps and its table in
  `scripts/consumers.mts`) compiles the generated bindings of consumer repositories with the CLI and the
  `binding_core` of this tree, in one run. A directory is a checkout, whose contract is
  `packages/rust/interface.json`, or a package directory `packages/<component>` inside one, whose contract is
  `packages/<component>/rust/interface.json` (L-1). For each directory the run copies the committed tree of its
  checkout (`git archive HEAD`) into a work directory of the run under the temporary directory, outside the
  checkout, and runs in the copy, in this order: `cargo fetch --locked` of the lock of the consumer, with the network, the
  prerequisites of the target `bindings-check` (or `binding-check`) of the
  consumer's Makefile, each by `make -C <copy> <goal> NODE=<node of the run>`, such as `binding-cases` of hyper, which
  writes the case files that its contract names, then `binding scaffold`, the path patch
  `[patch."https://github.com/polyspec/binding.git"]` of `polyspec-binding-core` to `packages/core/rust` of this
  tree in the root `Cargo.toml`, `cargo update -p polyspec-binding-core --offline`, naming each release of it that the lock holds
  (or `cargo generate-lockfile --offline` without a lock), `binding check`, and `binding generate --target <t>` for each target of the contract.
  A failed `binding check` is a failure of the cell `prepare`, and the targets still generate and compile to their
  end, as `-k` runs (HR-86): each other cell of that consumer states "generated from a contract that failed the
  check" in the table and the report, a refusal of the generator is the failure of its cell, which stops there, and
  the run fails. Why: a run that stopped at the check hid the defects of every target until the contract was fixed.
  The run is evidence of one commit of binding: `EXPECT=<commit>`, the commit that the line `binding commit <commit>`
  of `MANIFEST.txt` of `DIST=<directory>` names, or else the HEAD of the checkout that runs the target. Before
  the first consumer, and before any copy, it stops with a named error when the CLI of this tree is another commit or
  its tree has a change, and the first line of the table and of the report names the commit and that the tree is clean.
  Why: a run on a tree that lacked four fixes of the lane (B2.367, B2.386, B2.387, B2.390) gave cells that looked like
  defects of the lane, which were no evidence of it.
  The path patch is the way that Cargo documents for a dependency that is not released, and it changes only the
  source of `binding_core`: a cell is evidence of the commit of the consumer with the generator and the `binding_core`
  of this tree, not of the consumer with a released tag of binding. The two agree only when this commit is tagged
  unchanged, and the CI of each consumer after the tag is the final evidence; the second line of the table and
  `evidence` of the report state it. Why: a reader of a table that passed would otherwise take it for the release.
  Before it compiles, it records the connections of the copy: `cargo tree -i polyspec-binding-core`, which must name
  the path of this tree, the path of the CLI, and the Go build tags of the generated files. Then each binding crate
  runs `cargo check --all-targets` with the test features of its manifest (GN-5) and without them, WASM on
  `wasm32-unknown-unknown`; the Go target gets `CGO_LDFLAGS` from `binding go-link` (GN-15k) and runs `go vet` and
  `go test -c -o /dev/null`, which links, without tags and with the tags of the generated files (`goBuildTags`).
  Every Go command runs with `GOWORK=off`, for every consumer alike. Why: the generated Go module is released on its
  own, outside the `go.work` of its repository, and each consumer checks it so (orm `test-go-bindings`); a module that
  builds only through that `go.work` fails for whoever requires it.
  A tree without `binding go-link` fails the Go cell by name, and the Go commands run without a link flag of the run.
  Every command but the fetch runs offline (`CARGO_NET_OFFLINE`, `GOPROXY=off`): the other polyspec repositories that a
  consumer depends on resolve as its `Cargo.toml` and `go.mod` resolve them, and a dependency that the fetch cannot get
  is a named failure with its cause. Why the run fetches: a consumer installs the crates of its lock with `cargo fetch
  --locked` before its offline steps, and an offline run without it would state what the cache of the machine holds,
  not what the consumer or binding gives. Each consumer and target runs to its end; the consumers run in
  parallel, a bounded number at a time, and each cargo and go command takes its share of the processors. The run
  prints the table of each consumer and target (`prepare`, `php`, `python`, `node`, `go`, `wasm`), each failed cell
  with its failed steps, their first error lines and its log, writes the logs, `table.txt` and `report.json` into
  `var/report/consumers/<run>/`, and fails when a cell failed. It removes the copy of a consumer as soon as the cells of that consumer end, and
  the work directory at its end, so only the report and the logs stay. The copy gets only the changes that take this binding,
  as in GN-14d: a defect of a consumer is a named failure, never repaired in the copy, and whether a failure is the
  consumer's or binding's is read from the failed step and its errors. Why: a change of the generator or of
  `binding_core` reaches every consumer, and a defect that only a consumer's contract shows is found by a compile of
  its bindings, which `make e2e` does only for the repository that it runs; one run over the consumers shows them
  together before a release, and a run that changed the checkout or fetched what the consumer did not lock would
  show another tree than the consumer's.

- **GN-14j** `make dist` writes `packages/ts/dist` with the tsc of the checkout (`npm run build` of `packages/ts`)
  and then gives `dist/cli.js`, the `bin` of the package, the mode 0755, as npm install gives the bin of a release.
  Why: the other repositories link `node_modules/@polyspec/binding` to a checkout of this repository and run the
  tool as `node_modules/.bin/binding`, the bin link of npm (php-serialization `bindings-php`, session-store); tsc
  writes `dist/cli.js` with the mode 0644 and a link takes the file as it is, so the bin failed with "Permission
  denied" (127). The mode belongs to the output of the build, not to each consumer.

- **GN-14m** The consumer gate of a release (B2.494). `config/consumers.json` lists the consumers of binding, each a
  repository `{repo, tag}` at a release tag `vX.Y.Z` and the job that runs it, and in `pending` each consumer that has
  no release tag on a layout of binding yet, with its reason. The job `consumers` of `.github/workflows/ci.yml` has one
  entry for each job of the consumers with a tag: the eight small consumers (fsm, http-cookie, http-form,
  http-media-type, http-negotiation, json, php-serialization, session-store) share the job `small`, and template,
  crud-ui (its validator and its generator), hyper and orm each have a job of their own. Each entry runs `make
  ci-consumers JOB=<job>`, which builds `dist` (GN-14j) and runs `make consumer-gate` (`scripts/consumer-gate-run.mts`,
  its list, steps and table in `scripts/consumer-gate.mts`). For each consumer of the job, one after the other, the
  run clones the tag alone (`git clone --depth 1 --branch <tag>`), runs `cargo fetch --locked` of the lock of the tag,
  writes the path patch of `polyspec-binding-core` to `packages/core/rust` of the run in the root `Cargo.toml`, as in
  GN-14i, runs `cargo update -p polyspec-binding-core --offline` and `binding scaffold` of the run (GN-14d), and then
  only goals of the consumer's own Makefile, each with `BINDING` (the executable `dist/cli.js`), `BINDING_RUN` (node
  with it) and `NODE` of the run: its install (`install`, or the goals that `install` of its entry names when its
  Makefile has no goal `install`), with the network, and with the directories of the clone that `path` of its entry
  names first on the `PATH` of every goal, as its own CI puts them there (`var/tools/bay` of session-store, whose
  goals `install-bay` and `setup-bay` install bay and its machine setup on the runner for the Redis servers of its
  generated tests); `bindings`, which generates; `test-bindings`, the generated tests
  of the targets of its contract on their runners, offline (`CARGO_NET_OFFLINE`, `GOPROXY=off`, `GOFLAGS=-mod=readonly`,
  `npm_config_offline`, `UV_OFFLINE`, `PIP_NO_INDEX`); and the release rehearsal, `release-recipes`, the release
  builds of the host (`release-go-static`, `release-wheel`, `release-php-ext`, by the targets of the contract) and
  `rehearse-go-module TAG=<tag>` (GN-19f), with no cache: a new Go build cache, `GOFLAGS=-mod=readonly`, `GOWORK=off`,
  `CARGO_INCREMENTAL=0`, no compiler wrapper, the release target of a fresh clone, and no job of the workflow restores
  a cache, so each Go module builds alone at its tag. A failed step of the clone, the patch, the install or `bindings`
  stops that consumer, since every later step reads what they write; `test-bindings` and the rehearsal each run to
  their end, and every consumer runs. The run prints the table of each consumer with its tag and its phases
  (`prepare`, `generate`, `test`, `rehearsal`), each failure with its first error lines and its log, writes the logs,
  `table.txt` and `report.json` into `var/report/consumer-gate/<job>/`, which the job uploads, and fails when a phase
  of a consumer did not pass. A failed entry fails `ci-passed`, so `release.yml`, which starts only from a successful
  run of ci, does not release that commit: any failure blocks the release. A test of `packages/ts` fails when the
  matrix of the job is not the jobs of the list.
  No copy of a consumer is kept in binding: a tag is a fixed input that the consumer released, and a copy grows stale.
  A consumer's release raises its tag in the list, in a commit of binding, and a pending consumer moves to `consumers`
  with the tag of its first release on a layout of binding; a branch or a commit is never an entry. What the gate is
  evidence of is GN-14i's reading: the release tag of each consumer with the generator and the `binding_core` of this
  commit, not the consumer with a release of binding; the CI of each consumer after it takes the release is the final
  evidence.
  How this agrees with GN-2: the consumers are a test of the release, never an input of the generator. The generator
  reads no file of the list and no consumer, the list changes no generated byte of any repository, and the gate runs
  the CLI of the commit that it tests, unchanged; a raised tag changes only which code the test runs. Why: a change of
  the generator or of `binding_core` reaches every consumer, and four defects of the lane of 0.0.21 (B2.486, B2.488,
  B2.491, B2.492) were shown by consumers or by their releases, not by a check of binding; a gate that runs the
  released consumers shows such a defect before the tag.

## The release of a repository that holds a binding

- **GN-19** A repository that holds a binding releases it by recipes of make, and the work is divided by one rule. A
  step that a standard tool of an ecosystem performs (Cargo, maturin, the napi CLI, npm, `zip`,
  `llvm-strip`) is a line of a recipe that starts that tool with the arguments of GN-19b to GN-19e; binding gives no
  command that wraps such a call. Those recipes are the same in every repository but for the names that its contract
  gives, so binding writes them for the contract as a file of make that the Makefile of the repository includes
  (`binding release-recipes`, GN-19h); `binding scaffold` writes no recipe. The same file holds the recipe that puts
  the Node addon of a checkout beside the generated entry (`checkout-node-addon`, GN-3c), because binding states that
  path: the side that states a path gives the recipe that fills it (T2.43). A step that no tool performs and that
  follows from the form of a binding alone, the commit and the tag of a Go module with their checks, is the command
  `binding release-go-module` (GN-19f). Why: a command that wraps the call of a standard tool would hide the call that
  a reader of a recipe needs to see, and recipes that every repository copies by hand were wrong in all of them at
  once: two repositories copied the same recipes and had the same defects, which GN-19h names.
- **GN-19a** The platforms of a release are `linux-x64-gnu`, `linux-arm64-gnu` and `darwin-arm64` (GN-3c), and each
  asset of a platform is built on a runner of that platform, because no tool of GN-19b to GN-19e compiles for another
  platform. The release workflow of the repository names the runners in its own matrix (`include`):

  | Platform | Runner | Rust triple | PIE name part | Go directory |
  |---|---|---|---|---|
  | none (the archives of npm, Composer and the root package of GN-19e) | `ubuntu-26.04-arm` | | | |
  | `linux-x64-gnu` | `ubuntu-26.04` | `x86_64-unknown-linux-gnu` | `x86_64-linux-glibc` | `linux_amd64` |
  | `linux-arm64-gnu` | `ubuntu-26.04-arm` | `aarch64-unknown-linux-gnu` | `arm64-linux-glibc` | `linux_arm64` |
  | `darwin-arm64` | `macos-15` | `aarch64-apple-darwin` | `arm64-darwin-bsdlibc` | `darwin_arm64` |

  A PHP extension has one entry for each platform and each PHP minor that it supports, and that entry installs the PHP
  of that minor before it builds. The PHP minors that an extension supports are the list
  `phpExtension.minors` of `config/toolchain.json` of the repository (such as `["8.4", "8.5"]`), and no other file of
  the repository names them: its workflow builds the extension for each of them (GN-19i), and `release-platform-assets`
  reads the list and requires the extension of each platform for each of them (GN-19g). The first is the minor of the
  requirement `php >=8.4` of the `composer.json` of the extension (GN-3c), and the list ends with the latest minor that
  the extension builds for. Why a list in the repository: the requirement of `composer.json` has no upper bound, so it
  does not name the minors to build, and the minors that PIE can install are those whose archive the release holds;
  `config/toolchain.json` is the file of the toolchains of the repository that the recipes read already (`llvm.version`).
  Every build runs in a copy of the tree of the tag `vX.Y.Z` with a `CARGO_TARGET_DIR`
  of the run, so that an asset holds nothing of an earlier build. The workflow of CI builds the same assets of its
  commit with the same matrix, and its last job requires those jobs: a release tags only a commit whose CI run
  passed, so an asset that does not build stops the release before a tag exists.
- **GN-19b** The static library of the Go module (GN-15g), on each platform: `$(CARGO) rustc $(CARGOFLAGS) --release
  --locked -p polyspec-<repository>-go` (GN-1d, GN-15k), then `llvm-strip --strip-debug` on a copy of `libpolyspec_<repository>_go.a`, with the
  `llvm-strip` of `<sysroot>/lib/rustlib/<host>/bin` of the pinned toolchain (`rustc --print sysroot`, `rustc --print
  host-tuple`; the component `llvm-tools` of `rust-toolchain.toml`), never the `strip` of `PATH`, which differs by
  machine. The job hands the library to the job that runs GN-19f as the file `<Go directory>/libpolyspec_<repository>_go.a`.
  A Linux entry also builds the library of `linux_<arch>_musl` of its arch with `--target <arch>-unknown-linux-musl`
  (GN-15g) and hands it as `linux_<arch>_musl/libpolyspec_<repository>_go.a`, so the release carries five libraries.
  The build of the musl target, and no other command of the recipe, takes the C compiler and the archiver of that
  target, which the Makefile of the repository declares before the include (GN-19h) in `CC_<target>` and
  `AR_<target>`, where `<target>` is the target with its dashes as underscores: `CC_x86_64_unknown_linux_musl`,
  `AR_x86_64_unknown_linux_musl`, `CC_aarch64_unknown_linux_musl` and `AR_aarch64_unknown_linux_musl`. The recipe
  exports each of the two of the arch of the run that is not empty, under its own name, to the `$(CARGO) rustc` of
  the musl target alone. These are names that the crate `cc` reads, with which the build script of a dependency
  compiles C: for the compiler it takes the first that is set of `CC_<target>` with the dashes of the target,
  `CC_<target>` with underscores, `TARGET_CC` (the build is a cross compilation, because the host is the target of
  the GNU C library) and `CC`, and for the archiver the same four of `AR`; with none of them it starts
  `aarch64-linux-musl-gcc` for the arm64 target and, for the x86_64 target, the first that `PATH` holds of
  `x86_64-linux-musl-gcc` and `musl-gcc`. A repository whose Go crate has no dependency that builds C declares
  nothing. When one of the two variables of the arch of the run is empty, the recipe runs `$(CARGO) tree --locked -p
  polyspec-<repository>-go --target <arch>-unknown-linux-musl -e normal,build --prefix none --format '{p}'` before it
  builds a library, and when a line of its output names the crate `cc`, a dependency builds C for that target: the
  recipe ends with status 2 and names each empty variable (``release-go-static needs
  CC_x86_64_unknown_linux_musl AR_x86_64_unknown_linux_musl: the C compiler CC_x86_64_unknown_linux_musl and the
  archiver AR_x86_64_unknown_linux_musl of the target x86_64-unknown-linux-musl, which the crate cc reads, because a
  dependency of polyspec-<repository>-go builds C with that crate; define them before the include of
  packages/release.mk (GN-19b)``). When both are declared it does not ask Cargo. The recipe does not start a declared
  compiler before the build, so a wrong path fails in the build script, with the message of the crate `cc`. Two cases
  are outside this rule: a build script that compiles C without the crate `cc` is not seen, and fails in Cargo as
  before; and a crate `cc` in the build whose build script compiles nothing for the musl target asks for a
  declaration that no build reads. Why: session-store depends on rustls, whose cryptography, ring 0.17.14, compiles C
  in its build script, and `release-go-static` failed in its Linux CI because the crate `cc` looked for
  `x86_64-linux-musl-gcc`, which no runner holds; it went around the recipe by exporting the four variables from its
  own Makefile to every command, and each next repository with such a dependency would have failed at the same place
  with a message of Cargo that names no variable. Why the names of the crate `cc` and no names of binding: the
  declaration that session-store wrote stays valid, and a variable of the environment of a job with that name is a
  variable of make as well. Why the recipe asks and not `binding check --release`: the variables are of the Makefile,
  which a command does not read (docs/spec/contract-check.md CK-102), and `release-go-static` runs in CI, as a build
  of the job `platform` (GN-19i), so the missing declaration fails before a tag in either place.
- **GN-19c** The Python wheel, on each platform: `$(MISE) install --locked github:PyO3/maturin`, then
  `SOURCE_DATE_EPOCH=<commit time of the tag> $(MATURIN) build --release --locked --compatibility manylinux_2_34
  --interpreter python3 --manifest-path <package directory>/Cargo.toml --out <assets>`. `MATURIN` is the maturin of
  `mise.toml` of the repository, the shim of the mise of the checkout unless the Makefile gives another path to the same
  tool, such as `link.mjs maturin` of kit; the recipe requires that `$(MATURIN) --version` prints the release of maturin
  that binding pins (`MATURIN` of `packages/ts/src/generate/packages.ts`, the release of `mise.toml` of binding) and
  ends with status 2 before a build otherwise. Why not `uv build`: a PEP 517 frontend builds with the backend that it
  resolves from `requires` of the `[build-system]` table of `pyproject.toml`, at the time of the build and with no hash,
  so the maturin of a release wheel was the one that the registry gave that day, not the one whose digest `mise.lock`
  pins and with which the tests of the bindings build (B2.491). `requires` of the generated `pyproject.toml` names the
  same release exactly, `maturin==<release>`, for a frontend that builds the package from source. maturin names the
  wheel with the platform tag (`manylinux_2_34_x86_64`, `manylinux_2_34_aarch64`, `macosx_11_0_arm64`), and the wheel
  is abi3 (GN-1), so one wheel of a platform serves every supported Python. Why the compatibility is named: without it
  a Linux wheel can be tagged `linux_<arch>`, as the PEP 517 backend of maturin does with `--compatibility off`, which
  PyPI refuses and pip installs on no other system. Why
  `manylinux_2_34`: Rust std links `pthread_key_create`, `pthread_key_delete` and `pthread_setspecific` at
  `GLIBC_2.34` against the glibc of the `ubuntu-26.04` runners (GN-19a), so a library built there needs at least that
  policy, and maturin checks the library against the policy and refuses one that needs a later symbol or a library
  outside it. The libraries of a release run need `libc.so.6`, `libgcc_s.so.1` and `ld-linux`, and symbols up to
  `GLIBC_2.34`. macOS ignores the option.
- **GN-19d** The PHP extension, on each platform and PHP minor: `PHP=<php> PHP_CONFIG=<php-config> $(CARGO) build
  $(CARGOFLAGS) --release --locked -p polyspec-<repository>-php-ext` (GN-1d), then the cdylib is copied as `<extension-name>.so`, and the
  recipe requires that `php -n -d extension=<path> -r 'exit(extension_loaded("<extension-name>") ? 0 : 1);'` ends
  with 0 (GN-3g) before it packs `zip -q -9 -X php_<extension-name>-v<version>_php<X.Y>-<PIE name
  part>[-debug]-<zts|nts>.zip <extension-name>.so`, the name by which PIE finds a pre-packaged binary (GN-3c). The
  recipe reads `zts` and `debug` from that PHP (`PHP_ZTS`, `PHP_DEBUG`).
  `release-php-ext` accepts optional `EXPECTED_PHP_MINOR` in `major.minor`
  form and refuses a different actual runtime minor before Cargo builds. It always compares the minor of the
  selected `php-config --version` with the runtime and records both full versions. This checks the header minor,
  not every ABI or patch flag; the native extension-load check remains required.
- **GN-19e** The npm platform package (GN-3c), on each platform, with the napi CLI that the repository pins as the
  devDependency `@napi-rs/cli`: `napi build --platform --release --no-js --manifest-path <Cargo.toml>
  --package-json-path <package.json> --target-dir <target> --output-dir <addons> --target <Rust triple> -- --locked`;
  then, with a configuration file of the run that names the Rust triple of that platform alone (`{"targets":
  ["<Rust triple>"]}`, because `napi artifacts` fails for a configured platform whose addon another runner builds),
  `napi create-npm-dirs --package-json-path <package.json> --config-path <config> --npm-dir <directory inside the
  package>` and `napi artifacts --package-json-path <package.json> --config-path <config> --output-dir <addons>
  --npm-dir <the same directory>`; then `npm pack --ignore-scripts --pack-destination <assets>` in `<npm-dir>/<platform>`.
  The entry without a platform packs the package of the library itself with `npm pack --ignore-scripts` from a copy
  whose manifest is the tracked one: it names no platform package, which the consumer names by its asset URL (GN-3c). The copy holds the files that
  `npm pack --dry-run --json --ignore-scripts` of the package lists. The npm that `devEngines` of the repository pins
  (12.2.0) writes that list as an object keyed by the name of the package (`{"<name>": {"id": …, "filename":
  "<scope>-<name>-<version>.tgz", "files": [{"path": …}]}}`), and the recipe reads that form alone and refuses a list
  that does not hold the package by name: the release of npm is fixed by the repository, so a second form would be a
  path that no run takes.
- **GN-19f** `binding release-go-module (--root <repository> | --contract <interface.json>) --tag vX.Y.Z --libraries
  <directory> --work <directory> [--remote <name>] [--go <command>] [--rehearsal]` makes the commit and the tag of GN-15g in the
  repository of the contract. Its inputs: the checkout is at the commit of the tag `vX.Y.Z`; `binding generate --target
  go` wrote the files `zz_generated_*.go` of the Go module into the work tree; `--libraries` holds
  `<Go directory>/libpolyspec_<repository>_go.a` of each platform (GN-19b); `--work` is a directory of the run, in
  which the command keeps its index, the repository and the consumer of the proof and the caches of Go; `--remote`
  is the Git remote of the repository, `origin` when it is not given; `--go` is the go command, the value of `$(GO)`
  of the release recipes (GN-19h), read as `--go` of `binding check` is (GN-15l), and the `go` of `PATH` when it is not
  given. The command always starts Go, for the consumer below, so it looks for the go command before it reads the
  repository; when it is not found, it creates no commit and no tag and ends with status 1 and the sentence ``binding
  release-go-module proves the commit of the Go module with a consumer that Go builds (`go mod tidy`, `go test`,
  GN-19f), and the go command `go` is not found on PATH: install Go, or name the go command with --go <command>, the
  value of $(GO) of the release recipes (GN-19h)``. The command runs every check below to its end
  and then names each failed one; with a failed check it creates no commit and no tag.
  - The tag is `vX.Y.Z`, and `HEAD` is the commit that it names: the parent of the commit is the commit that the
    release checked.
  - The module path of `packages.go` is `github.com/<owner>/<repository>/<directory of the Go module>` (GN-14f), so
    the tag `<directory>/vX.Y.Z` is the one that Go reads for it.
  - The `go.mod` of that commit holds no `replace` line and requires no module at `v0.0.0`: both are development
    forms (GN-15f), which a consumer of a tag cannot resolve.
  - The repository holds the tag `<directory of that module>/vA.B.C` of each Go module of the same repository (a
    module path with the same first three elements, GN-14f) that the `go.mod` requires at a release version
    `vA.B.C`, and of each one that the `go.mod` of such a module at its tag requires in turn (B2.479). The command
    names each module whose tag is missing and the `go.mod` that requires it, and says to run `binding
    release-go-module` of that module first. So the modules of one repository are released in the order of their
    requirements: the required module first.
  - Each requirement of that `go.mod` that is not `// indirect` is imported by a Go file that the released form
    carries (GN-15g, B2.473). The command names a requirement that only files that the form leaves out import,
    with those files, and one that no Go file imports, and it tells the reader of the run each line `// indirect`,
    which it does not judge. It reads a tracked file from the commit of the tag and a generated one from the work
    tree, and the files that the form leaves out only when a requirement is not used.
  - The work tree holds, for each platform, `internal/binding/zz_generated_link_<platform>.go` and
    `internal/ffi/lib/<platform>/zz_generated_lib.go`: without them the generation did not run, and no file names
    the directory of a library.
  - The library of each platform is a file that is not empty and an `ar` archive whose every member is an object of
    that platform (ELF x86-64 for `linux_amd64` and `linux_amd64_musl`, ELF AArch64 for `linux_arm64` and
    `linux_arm64_musl`, Mach-O arm64 for `darwin_arm64`): a
    library placed in the directory of another platform would fail only in the link of a consumer.
  - `llvm-nm --defined-only` of the pinned toolchain (GN-19b) names no test entry point in a library (GN-13b), and
    `llvm-size -A` names no debug section whose size is not 0.
  - The commit of the tag tracks no generated file (GN-15g): no file `zz_generated_*.go` below the directory of the
    Go module (`git ls-tree`), whatever its build constraint and whether the work tree holds a file of that name or
    not. The command names each one with what the repository does, which is to remove it from the index (`git rm
    --cached`) and to ignore it. Why: the command writes the files of the work tree over the tracked ones and
    keeps a tracked one that the generation no longer writes, so the released form would differ from the commit
    that the release checked, in each release, and no output would say so. Before B2.459 the command refused only
    a tracked file behind a build tag of a test feature and a tracked guard of those tags (B2.446).

  The commit is made without a change of the checkout: with an index file of `--work` (`GIT_INDEX_FILE`), `git
  read-tree` of the commit of the tag, `git update-index --force-remove` for each tracked file that the released
  form leaves out (GN-15g), a test of the repository or a Go file of a program, which the command tells by the name
  of the file and by its package clause in the commit of the tag (`git show`) and names to the reader of the run,
  `git update-index --add --cacheinfo` with mode 100644 for each generated file
  that a release carries (GN-15g) and for `internal/ffi/lib/<platform>/libpolyspec_<repository>_go.a` of each platform, whose objects `git
  hash-object -w --no-filters` writes, in the same way for the `go.sum` of the released form when the `go.mod`
  requires a module of the same repository (GN-15g, B2.479), `git write-tree`, and `git commit-tree -p <commit of the tag>` with the
  message `chore(release): Carry the Go module of vX.Y.Z`. Its author and committer dates are the committer date of
  the commit of the tag and its identity is the one of the Git of the run, so the same inputs under the same
  identity give the same commit. A tag `<directory>/vX.Y.Z` of the repository or of the remote that names another
  commit fails the command; one that names this commit is the result of an earlier run, which the command leaves as
  it is.
  Before the tag, a consumer proves the commit: the command pushes it as the tag into a bare repository of `--work`,
  which Git reads in place of `https://github.com/<owner>/<repository>` (`url.<path>.insteadOf` of a configuration
  file of the run), and writes a module whose `go.mod` requires the Go module at `vX.Y.Z` and whose test imports
  every public package of it. A public package is a directory of the released form outside every directory
  `internal` with a Go file that is no test and whose package clause is not `main`; the command reads the clause
  from the commit of the tag for a tracked file (`git show`) and from the work tree for a generated one. A
  directory of tests alone holds no package to import and Go imports no program, so neither is one (B2.459). `go mod tidy` and `go test -count=1 .` run with `GOPROXY=direct`, `GOSUMDB=off`,
  `GOENV=off`, `GOTOOLCHAIN=local`, `GOWORK=off`, `GOFLAGS` and `CGO_LDFLAGS` empty, `CGO_ENABLED=1` and the module
  and build caches of `--work`, and the command fails when the `go.mod` of the consumer then holds a `replace`. Then the module builds alone in
  the tree of the commit (B2.488): the command checks the directory of the module out of the bare repository into
  `--work/alone` with an index of `--work`, and runs `go build -mod=readonly ./...` there with the same settings; a
  failure names the commit and says to run `binding scaffold` of this version (GN-15l). Why: `go mod tidy` of the
  consumer writes what the `go.mod` of the module lacks, so a tag whose `go.mod` lacked a module of its graph passed the
  consumer and failed every build inside the module. It
  removes the module cache with `go clean -modcache`. A Go module of another repository that the `go.mod` requires is
  fetched from its own remote, so the repositories are released in the order of their Go requirements. A Go module
  of the same repository that the `go.mod` requires at a release version, a sibling, is fetched from the bare
  repository of `--work`, because Git reads that repository for every module of
  `https://github.com/<owner>/<repository>`: before the commit, the command pushes the commit of the tag of each
  sibling of the check above into it under that tag, and runs `go mod download -json <module>@<version>` for each
  in a module of `--work` with the settings of the consumer, whose `Sum` and `GoModSum` are the lines of the
  `go.sum` of the commit (GN-15g); it removes the module cache after it, so the consumer fetches each sibling
  again. A tracked `go.sum` that gives a sibling another hash is refused with its line, before the commit. Before
  B2.479 that repository held the tag of the module of the run alone: the release of the generator module of
  crud-ui, which requires the validator module of the same repository, failed in `go mod tidy` of the consumer
  with `unknown revision packages/validator/go/v0.0.1` in either order of the two runs, with no word of the cause.
  A release that stopped between two modules of a repository is run again as it is: the command leaves the tag of
  the first module, which names the commit of this run, as it is and gives no reference when the remote holds it,
  and the run of the second module finds that tag in the repository. The proof
  links the library of the platform of the run alone; the libraries of the other platforms are checked by their
  objects.
  Then the command creates the annotated tag `<directory>/vX.Y.Z` at the commit (`git tag -a`, with the same date)
  and writes to its standard output the one line `refs/tags/<directory>/vX.Y.Z`, the reference that the recipe
  pushes to the remote, or nothing when the remote holds the tag already. The command pushes nothing to the remote.
  Why: what a run publishes is the decision of the recipe that started it, and a command that is run again after a
  failed push gives the same reference. The recipe `release-go-module` adds that reference to
  `$(RELEASE_TARGET)/go-module-refs`, and `release-go-module-push` pushes every reference of that file with one `git
  push --atomic` (GN-19h, B2.488), so the remote takes the tags of all the Go modules of a release or none: before
  B2.488 each recipe pushed its own tag, and a release whose second module failed left the first tag on the remote.
  The rehearsal (B2.479): with `--rehearsal`, an option without a value, the command runs the checks and the proof
  before a release has a tag, and makes no commit and no tag: it writes no object and no reference into the
  repository, asks the remote nothing and pushes nothing. `--tag vX.Y.Z` is then the tag that the release will
  make, which need not exist: the rehearsal reads `HEAD` in place of the commit of the tag, and the generated
  files of the work tree. A platform is absent when its library, its `native-static-libs` or one of its two
  generated files is not there; the rehearsal names each absent platform with what is missing and checks the
  others as a release does, so a library that is there and fails a check fails the rehearsal. The proof links the
  library of the platform of the run, `<GOOS>_<GOARCH>` of `go env`, so the rehearsal is refused when that platform
  is absent or is no platform of a Go module. The commit of the proof is made in a bare repository of `--work`,
  `rehearsal.git`, whose alternates are the objects of the repository (`objects/info/alternates`): every command
  that writes an object or the index runs with `git --git-dir` of that repository, the commit has the identity
  `binding rehearsal` and the message `chore(release): Rehearse the Go module of vX.Y.Z`, and `git update-ref`
  sets the tag `<directory>/vX.Y.Z` there. That repository is kept between runs, and `git prune` removes the
  objects of the earlier rehearsals from it. A sibling module of the check above is taken from its tag of the
  repository when it has one, which the rehearsal pushes into that repository over a rehearsal of an earlier run;
  a sibling without a tag, which is every sibling before the first release of a version, is taken from the
  rehearsal of that module in the same `--work`, when the parent of its commit is the `HEAD` of this run. So the
  modules of one repository are rehearsed in the order of their requirements with one `--work`; a sibling with
  neither, or one rehearsed from another commit, is refused with the name of the module and the run that makes
  it. A rehearsal writes nothing to its standard output, so no recipe pushes a reference, and the last lines of
  its error output are the list of what it did not see: that it read `HEAD` and not a tag, each sibling that it
  took from a rehearsal, each absent platform, that it compared no earlier tag of the repository or of the remote,
  and last that it made no commit and no tag. Why the list ends the output: a rehearsal that passed on one
  platform reads like a release that passed unless its last lines say what is still unproved. Why a form of the
  command and not a script of a repository: crud-ui could not rehearse its release, because the command asked for
  the libraries of the five platforms and their generated files before it reached the proof, and the defect of
  B2.479 was found by a release that had already pushed a tag.
- **GN-19g** Before a recipe of a release builds an archive, it runs `binding check <interface.json> --release` for
  each contract of the repository, every one to its end, and stops when one fails (CK-70). The recipe
  `release-binding-check` is that call, and each build recipe of the assets runs it first, in CI as in a release
  (GN-19i). An asset of the GitHub
  Release has the label `<vendor>-<product>-<runtime>-<version>`, followed by `-<platform>` for an asset of a
  platform and by `-php<X.Y>-<platform>` for a PHP extension. Before it uploads, `release-platform-assets` requires
  the whole set of the targets of the contract, one asset of each label: the wheel of each platform of GN-19a, the npm
  package and, for the target `node`, the platform package of each platform, and the PHP extension of each platform
  for each PHP minor of GN-19a. It fails and names the label of each missing asset, a file that names no platform or no
  supported PHP minor, and two files of one label. Why: a release whose assets miss a platform or a
  PHP minor publishes a package that does not install there, and a count of the files does not see two files of one
  platform in place of two platforms. It also fails for an empty asset and for one of 2 GiB or more, naming it, since
  GitHub takes neither. `make release-platform-assets TAG=<tag> REHEARSAL=1 WORK=<directory>` is its rehearsal before
  the tag (B2.496): it runs the same checks, writes the list of the upload, one line `<size> <file>#<label>` for each
  asset, to `WORK/platform-assets.txt`, writes nothing outside `WORK`, calls neither `gh` nor `git`, and ends with the
  line `no upload`; `REHEARSAL=1` without `WORK` is refused. Why: the upload followed the check of the labels at once,
  so a rehearsal could not reach the step, and template 0.0.28 was lost in its asset job. The check of the sizes runs
  in the real upload too, and there it runs after the tag: the release job runs `release-tag` of kit first, which
  creates the tag and pushes it, and the upload goes to the draft GitHub Release of that tag, so a check that fails
  in the upload cannot save the tag. The check of the sizes is the command `binding asset-sizes [--step <recipe>]
  <path>...`, which names each empty file and each file of 2 GiB or more under the paths after the name of the recipe
  and then fails. It also runs at the end of the build recipes that CI runs on the same tree before any tag: each
  `release-assets-<job>` checks the assets that it built (GN-19i), and `release-candidate-assets` of binding checks
  its archives. `release-platform-assets` keeps the check before its upload. Why: every asset of a release is built
  after the tag (binding's release runs `release-tag`, `release-checkout`, then `release-assets`, and the release
  workflow of a repository builds its assets from the ref of the tag), so no order of the release can catch such an
  asset before the tag; CI builds the same recipe on the same tree before it, and a release requires that CI run
  (B2.505).
- **GN-19h** `binding release-recipes (--root <repository> | --contract <interface.json>) [--out <directory>]` writes
  the release recipes of the contract into `<packages of the contract>/release.mk`: `packages/release.mk` for a core
  at `packages/rust`, and `packages/<component>/release.mk` for a core at `packages/<component>/rust`, whose targets
  end in `-<component>` so that the recipes of two contracts of one repository do not meet. It checks the schema and
  the names of the contract (CK-1, CK-18) and nothing else, because the recipes depend on the names alone, and it
  writes the file under another name beside it and renames it into place. The file is generated and not tracked: the
  repository ignores it, and a release writes it before it runs a recipe. It defines, for the targets of the contract:

  | Target | Target of the contract | What it does |
  |---|---|---|
  | `release-go-static` | `go` | GN-19b, with the library of `linux_<arch>_musl` on a Linux host |
  | `release-wheel` | `python` | GN-19c |
  | `release-php-ext` | `php` | GN-19d, for the PHP of `PHP` |
  | `release-npm-platform` | `node` | GN-19e, the platform package of the host |
  | `release-npm` | `node` or `wasm` | GN-19e, the package itself |
  | `release-go-module` | `go` | GN-19f, for the tag of `TAG`, whose reference waits in `$(RELEASE_TARGET)/go-module-refs` |
  | `release-go-module-push` | `go` | GN-19f, one `git push --atomic` of the tags that wait, shared by the contracts of a repository (B2.488) |
  | `release-binding-check` | every contract | GN-19g |
  | `release-platform-assets` | every contract | GN-19g, the upload of the assets of `TAG` |
  | `release-assets-platform` | `go`, `python` or `node` | GN-19i, the builds of the job `platform` |
  | `release-assets-php` | `php` | GN-19i, the build of an entry of the job `php` for `EXPECTED_PHP_MINOR` |
  | `release-assets-npm` | `node` or `wasm` | GN-19i, the build of the job `npm` |
  | `install-wasm-bindgen` | `wasm` | installs the wasm-bindgen CLI of `mise.toml` alone |
  | `checkout-node-addon` | `node` | GN-3c, the addon of the checkout beside the generated entry |
  | `rehearse-go-module` | `go` | GN-19f, the rehearsal for the tag of `TAG`, with no commit and no tag |

  `rehearse-go-module` is no step of a release: a repository runs it before it makes the tag `TAG`. Its
  prerequisite is `release-go-static`, which builds the library of the host, and it runs `binding
  release-go-module --rehearsal` with `--work $(RELEASE_TARGET)/go-module-rehearsal`, a folder without the name of
  a component, which the contracts of one repository share, so the rehearsal of a module finds the one of the
  module that it requires (GN-19f, B2.479); the required module is rehearsed first, and two rehearsals do not run
  at once.
  A repository with two contracts of which the Go module of one requires the Go module of the other at a release
  version (crud-ui: the generator requires the validator) runs `release-go-module-<component>` of the required
  module before that of the module that requires it (GN-19f, B2.479): the second run reads the tag of the first in
  the repository, and a run in the other order is refused with the name of the module whose tag is missing.

  The Makefile of the repository defines, before its line `include <path of the file>`, the variables that the
  recipes read: `BINDING_RUN`, the command that starts binding (such as `$(NODE) $(BINDING)` or the bin link of the
  installed package), `CARGO`, the cargo command of the repository, and `CARGOFLAGS`, the arguments of its builds, which
  may be empty (GN-1d), `NODE` and `NPM`, the tools of the checkout by their absolute paths, and `BINDING_DEP`, the
  target that installs binding, when it has one (`MATURIN` has a default, GN-19c); a recipe that reads one that is empty fails and names it, and
  `release-binding-check` requires each one that a release recipe of the contract reads, so a variable that only a
  recipe after the tag reads is missed before the tag (docs/spec/contract-check.md CK-102, B2.471). `GO`, the
  go command that binding starts, has the default `go`, the go of `PATH`: the recipes pass `--go "$(GO)"` to each
  command of binding that may start Go, `binding check --release` of `release-binding-check` (GN-15l) and `binding
  release-go-module` of `release-go-module` (GN-19f), and start no Go themselves, so a Makefile defines `GO` only when
  its go is not the `go` of `PATH`, and the job that runs one of the two recipes has Go, which is every job that runs
  a `release-assets-<job>`, whose first step is `release-binding-check` (GN-19i); a command that needs Go and
  does not find it names the tool, `--go` and `GO` (GN-15l). A repository whose Go crate has a dependency that
  builds C also defines `CC_<target>` and `AR_<target>` of each musl target, the C compiler and the archiver that
  `release-go-static` passes to the build of that target and requires on a Linux host when the crate `cc` is in that
  build (GN-19b); `release-binding-check` does not require them, because the need follows from the host and from the
  dependencies of the build, which `release-go-static` reads. `NAPI`,
  `WASM_BINDGEN`, `MISE`, `RELEASE_ASSETS`, `RELEASE_TARGET` and `LLVM_ROOT` have defaults that a Makefile or a command
  line can override. The repository pins `@napi-rs/cli` as a devDependency, the major release of LLVM in
  `llvm.version` of `config/toolchain.json` and the PHP minors of its extension in `phpExtension.minors` of that file
  (GN-19a), and the musl targets of its arches in `rust-toolchain.toml`, and ignores
  the file of recipes and the folder `npm/` of its npm package. The recipes hold the four rules that copies by hand
  broke:
  - Each recipe that builds a binding first runs `binding generate --contract <interface.json> --target <target>
    --cargo "$(CARGO)"` of its target, because the generated files are not tracked, so a checkout of a tag holds none of them.
  - `release-php-ext` builds with `LIBCLANG_PATH` and `CLANG_PATH` of the LLVM of `LLVM_ROOT`, which is
    `/usr/lib/llvm-<major>` on Linux and the Homebrew formula `llvm@<major>` on macOS by default, and fails before
    Cargo builds when that LLVM has no clang or no libclang or its clang is of another major release (GN-14a). No recipe
    installs LLVM or runs `sudo`: the job provisions the LLVM before its recipe (GN-19i). Each PHP
    minor and build of PHP builds in its own `CARGO_TARGET_DIR`, because the extension is compiled against the headers
    of that PHP.
  - `release-npm-platform` gives `napi create-npm-dirs` and `napi artifacts` the folder
    `<npm package>/npm/<platform>/npm`, inside the npm package: the napi CLI refuses a folder outside the package of
    `--package-json-path`.
  - The recipes are tested in binding (`packages/ts/tests/release-recipes.test.ts`, which `make typecheck-ts` checks
    with the other tests), with stand-ins of the tools that they start; a repository keeps no test of its own copy.

  `binding check` reports the Makefile of the repository that does not include the file, a recipe of the Makefile for
  a target of the file, and a file of recipes that differs from what this binding writes (CK-94). Why: the names that
  the recipes take are in the contract, which binding reads already, and a recipe that each repository keeps by hand
  gets each defect once in each repository; a generated file that is not tracked cannot drift from the binding that a
  repository pins, and the check finds a Makefile that still holds a copy.
- **GN-19i** The workflow that builds the assets of each platform is a workflow of the repository (`assets.yml`), which
  its workflows of CI and of the release call (`workflow_call`, with the input `ref` of the tag). The workflow has no
  input that tells a release from CI, and the Makefile of the repository has no condition on one: each build recipe
  `release-assets-<job>` of the file of GN-19h runs `release-binding-check` (GN-19g) as its first step and stops when it
  fails, so the run of CI and the run of a release are the same recipe on the same tree, and each job has Go, which
  the check may start (GN-15l). A committed tree of a repository, on any branch, holds the release forms alone
  (docs/spec/contract-check.md CK-70), so the check passes in CI wherever it passes in the release, and there is no
  declaration of a development tree. Why: the check ran only with an input `release`, by a condition that each
  repository wrote into its own Makefile (`$(if $(filter true,$(RELEASE)),…)`), so it first ran in the run of the
  release, after the tag: template, http-negotiation and session-store each lost a tag to a check that CI had never
  run (B2.457). Independent jobs build the non-PHP assets once per platform and the
  PHP extensions once per platform and PHP minor of GN-19a. Every job runs on the runner of its platform
  (`ubuntu-26.04`, `ubuntu-26.04-arm`, `macos-15`) and has one run step, `make ci-assets-<job>` with the values of its
  matrix entry as make variables; every other step is a `uses:` step that provisions the runner (the checkout, the
  bootstrap, the PHP of the entry, the LLVM of `config/toolchain.json` for the job `php`) or carries a result
  (`actions/upload-artifact` under `if: ${{ !cancelled() }}`). A local run of a job is the same call.
  The recipe `ci-assets-<job>` is a fixed recipe of the Makefile of the repository, because the file of GN-19h does
  not exist in a fresh checkout before `make release-recipes` writes it: it installs the tools of the repository and
  stops when an install fails, runs `make release-recipes`, and then the build recipe `release-assets-<job>` of that
  file, a make of its own that reads the file just written. The build recipe holds the order and the conditions of the
  job; no recipe runs `sudo` or installs into the machine.
  - Each `release-assets-<job>` starts with `make release-binding-check` of its contract, a make of its own, and ends
    with `binding asset-sizes` on the assets that it built, the files that `release-platform-assets` uploads: the
    wheels and the npm platform packages for `platform`, the PHP extensions for `php`, and the npm packages for `npm`
    (GN-19g, B2.505).
  - `ci-assets-platform` ends with `make release-assets-platform`, which then runs `release-go-static`, `release-wheel` and
    `release-npm-platform` of the targets of the contract, each to its end, and fails naming each failed build; the job
    uploads `var/release/assets` as the artifact `assets-<platform>`.
  - `ci-assets-php PHP_MINOR=${{ matrix.minor }}` ends with `make release-assets-php EXPECTED_PHP_MINOR=<minor>`, which
    runs `release-php-ext` for the `php` of PATH, the native runtime that the entry selected before the recipe; the
    job uploads `var/release/assets` as the distinct artifact `assets-php-<platform>-<minor>`. A setup action
    declaration alone does not prove which native runtime a build used.
  - `ci-assets-npm` ends with `make release-assets-npm`, which installs the wasm-bindgen CLI first (`install-wasm-bindgen`,
    for a contract with `wasm`) and stops when that fails, then runs `release-npm`; the job uploads the artifact
    `assets-npm`.

  Each PHP matrix entry supplies `EXPECTED_PHP_MINOR`; the generated recipe checks and records its native
  selection as GN-19d specifies, so no repository copies this check into a wrapper target.

  The release workflow downloads every asset artifact into `var/release/assets`, then runs `make release-go-module` of each
  Go module, then `make release-go-module-push` (B2.488),
  and `make release-platform-assets` after the draft release exists; the latter validates the complete required asset
  set. binding writes no workflow and no recipe `ci-assets-<job>`: GitHub reads a workflow only from the tracked tree, and
  the installs of a job are those of the repository. Why: each PHP job owns one runtime selection and one artifact, so parallel minor
  builds cannot replace one another's results, while the non-PHP assets are built only once per platform. The recipes
  of GN-19h keep the build commands in binding when a repository changes its workflow layout.
