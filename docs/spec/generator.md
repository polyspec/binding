<!-- doc-id: generator -->
# Generator

[한국어](generator.ko.md)

`binding generate [--root <repository>] [--out <directory>]` checks `packages/rust/interface.json` (docs/spec/contract-check.md)
and writes the bindings of its targets. This document states the rules of the generator that the design leaves to it;
the design ids are those of the binding design.

## Scope

- **GN-1** The generator writes PHP (ext-php-rs 0.16.4), Python (PyO3 0.30.1, abi3-py314) and Node (napi 3.16.2) for
  functions units, class units (constructor, static members, methods and properties with the receiver `&self`),
  records (as parameters and in their result form, also of another repository), enums, constants and error classes.
  callback interfaces (U-3, synchronous members with the receiver in `core.receiver`), Any other item (an async or
  recognizing callback, a function type, a value unit, an error unit, a wait other than `none`, a default, `cleanup`, a receiver
  `&mut self` or `self`, a parameter of a class, `only`, `native`, a naming exception, a dependency kind, the type
  `source`) is refused by name
  before anything is written (G-4, P-4); Go and WASM are not generated yet.
- **GN-2** The result depends only on the contract, the case files that `cases` names, the version and library name of
  the core crate (read from its manifest as TOML) and binding itself; it holds no time, path or host, and lists are in
  contract order (I-5). `--out` writes the same files under another directory; the tests of `packages/ts` generate twice
  in two directories and compare the bytes.

## Layout (L-1, L-2)

- **GN-3** binding owns three directories and writes each whole through a staging directory, so no file of an earlier
  generation stays and a reader never sees a part: `packages/php-ext/generated`, `packages/python/generated`,
  `packages/ts/generated`. No source of binding is copied into the repository: the core and the binding crates depend on
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
  thin packages depend only on the package and name items; `check` and `generate` report it.
- **GN-3b** A language whose package is a hand-written host package (L-2a, `packages.<lang>.host: true`) has its
  binding crate in `native/` of that package (`packages/<component>/<lang>/native/`: `Cargo.toml`, `src/lib.rs`, the
  Node `build.rs` and `generated/`), whose path dependencies climb one directory more. `scaffold` does not write the
  host's manifest; `check` reads only what the native module needs from it (CK-19): Python `build-system.build-backend`
  `maturin`, `tool.maturin.module-name` `<module>._native` and `tool.maturin.manifest-path` `native/Cargo.toml`; Node
  `name` and `native/generated/*.node` in `files`; PHP `php-ext.extension-name`. `binding scaffold` writes them and `binding check` compares them with what it would write
  (CK-19), so a change of binding that changes them shows in the repository's diff. They depend only on the library
  name, the targets and the core version. The core builds and tests without the generator; only the binding crates
  need `make bindings`.
- **GN-4** Each binding crate is a member of the repository's workspace (L-2) and carries the lints of R-1 itself,
  with `unsafe_code` deny rather than forbid: the macros of ext-php-rs and napi-rs expand to unsafe code, which a core's
  workspace may forbid, and each unsafe block of the generated code carries an allow with its reason. The generated
  code holds only the helper functions it uses, because the lints deny dead code.
- **GN-5** Every crate has `rust-version = "1.99.0"` and the feature `panic-test`, which adds the entry point of the
  B-7 test.

## The core boundary (T-1, I-2 (1))

- **GN-6** Each argument is converted into a `let` of the Rust type of T-1. A parameter of a type with two forms (text,
  latin1, bytes, source, path) is passed borrowed (`&String` and `&Vec<u8>` coerce to `&str` and `&[u8]`), an
  `optional<T>` of one with `as_deref()`, a Copy type (bool, the numbers, an enum) by value, any other type (a list, a
  record) by reference. A record is built from its expanded fields, which are owned. A return has the form that is usual for its Rust function
  (an accessor borrows, a computed value is owned), so the generated code binds it without a type and reads either
  form the same way (`AsRef`, `Borrow`, `IntoIterator`, a reference to a tuple field). An integer return (uint, int,
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
  declarations, and the entry defines `<name>` over it with the checks of G-7.
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
- **GN-7** A member with `raises` calls a core that returns `Result`; its error is matched without a wildcard into the
  library class of its kind's category (I-2 (3)), with the kind, status and errno of `binding_core::Kinds`. The pattern
  `Variant { .. }` matches a variant with or without data, because binding reads no Rust source; the lint against it is
  allowed with the reason I-2.
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
- **GN-11** Python: the native module `<root>._native` takes the raw values (T-8) with the record fields keyword-only;
  the runtime counts and names the arguments (G-7). The category classes are in `<root>._errors` and the enums in
  `<root>._types`, which the native module imports when it loads (B-4); a module of the contract is `<root>.<module>`
  and `<root>` re-exports every public name (P-3). An enum is an `enum.StrEnum` (T-6); the package needs Python 3.14
  (abi3-py314). A list parameter takes a list or a tuple. `polyspec` has no
  `__init__.py` (P-1).
- **GN-12** Node: the addon takes the raw values (T-8); the generated CommonJS entry checks the count of the arguments,
  the names and the presence of the options record's members (G-7, T-4) and turns any iterable but a string into an
  array for a list parameter (T-7). When it loads, the entry hands the library classes to the addon, which keeps a
  reference to each (napi `FunctionRef`); a failure is an instance of its class that the addon makes with the message,
  kind, status and errno and throws (B-4). The ESM entry re-exports the CommonJS one, so both share their classes.

## Generated tests (G-5)

- **GN-13** For every function, each language's test module checks: B-2, every number parameter or field with the values
  of G-5 (NaN, the infinities, 1.5, true, "7", -1 for uint, 2^53 in Node) as kind `invalid_number` of the value class;
  B-3, a text with an unpaired surrogate (PHP: bytes that are not UTF-8) and a latin1 text with U+0100 as kind
  `invalid_text`; B-4, every contract case that raises, with the exact class, the base class of E-2, the kind, the status
  and errno; B-7, the panic entry point as kind `internal`; G-7, a missing argument, one argument more and an unknown
  name (PHP named argument, Python keyword, a member of the Node options record, and a missing member). The arguments
  of a case are its keys in snake_case, a record parameter an object of its fields, an enum its value text and a latin1
  value a text of U+0000 to U+00FF; a case without the key of a parameter is refused by its id. The members of a
  class have the same tests; a method or property is called on an instance that a factory of the class (a static
  member or the constructor that returns it) makes from the case's keys of that factory's parameters, and the B-2, B-3
  and G-7 tests of a method use the factory arguments of the first case of the class that does not raise. A member
  that takes a callback has no B-4 tests (a case cannot give a callback) and the tests of K-2: an object without the
  members is kind `invalid_callback`, the exception that the callback raises reaches the caller as the same object,
  and a result of another type is a binding kind; its other arguments are placeholders whose lists have one item.

## End-to-end check

- **GN-14** `node scripts/e2e.mts --repo <checkout> --work <directory> --phpunit <phpunit> [--python <python3.14>]`
  (`tests/e2e/sample` is a repository of the items that no polyspec repository generates alone yet;
  `--dep <checkout>` for each repository whose types the contract names; its packages are built and installed first)
  copies the committed tree of a repository, makes the changes that the repository has not made yet and prints each
  (the root workspace and its members, the dependency on binding_core and `Kinds`, the tracked packages of `binding
  scaffold`), runs `binding check`, tests the core without the generator, rewrites a case file that does not follow
  GN-13 (camelCase keys, a record as an array of its field values) and prints it, generates, lints the workspace,
  builds and installs each package, and runs the generated tests and, where `tests/e2e/<library>` holds them, the
  contract cases on unittest, `node --test` and PHPUnit. The Git dependency on binding resolves to the commits of the checkout (`url.<base>.insteadOf` for the
  run's commands).
