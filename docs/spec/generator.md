<!-- doc-id: generator -->
# Generator

[한국어](generator.ko.md)

`binding generate [--root <repository>] [--out <directory>]` checks `packages/rust/interface.json` (docs/spec/contract-check.md)
and writes the bindings of its targets. This document states the rules of the generator that the design leaves to it;
the design ids are those of the binding design.

## Scope

- **GN-1** The generator writes PHP (ext-php-rs 0.16.4), Python (PyO3 0.30.1, abi3-py314), Node (napi 3.16.2), Go
  (cgo over a C ABI static library, GN-15) and WASM (wasm-bindgen 0.2.130, GN-18) for
  functions units, class units (constructor, static members, methods and properties with the receiver `&self`),
  records (as parameters and in their result form, also of another repository), enums, constants and error classes.
  callback interfaces (U-3, synchronous members with the receiver in `core.receiver`), Any other item (an async or
  recognizing callback, a function type, a value unit, an error unit, a wait other than `none`, a default, `cleanup`, a receiver
  `&mut self` or `self`, a parameter of a class, `only`, `native`, a naming exception, a dependency kind, the type
  `source`) is refused by name
  before anything is written (G-4, P-4). Go and WASM refuse a class unit, a callback unit and a record of another
  repository (T-3, T-5, U-3); Go also refuses a tuple of different types inside another type (a Go array has one element type) and a tuple
  parameter.
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
  declarations, and the entry defines `<name>` over it with the checks of G-7. napi-rs keeps the classes it parsed in
  the state of its macro process, which rustc does not keep between the expansions of a struct and its impl, so a
  Node constructor is the static `__new` and the entry exports the class in a `Proxy` whose `construct` checks the
  arguments and calls it; `instanceof` reads the class's prototype through the proxy. A parameter of a class takes an
  instance of it (another value is kind `invalid_argument_type`) and the core gets a copy of the value it holds, so a
  class that a member takes is `Clone`. A class of origin `value` whose `in` rows name only the class itself (U-1) is
  generated as such a class, and a value type named in `types` is that unit.
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
  handle (`native`, `Other`, a callable) is kept for the life of the thread, which U-7 (d) has yet to bound.
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
  `keyed_map<T>{key}` is an array in its order (T-2). An int key is an integer key, or its decimal text when the
  contract lists text and not integers, because PHP makes a decimal string key an int; a string key is a text when it
  is UTF-8 and text is listed, else a byte string when bytes are listed; any other key is kind
  `invalid_argument_type`. A map leaves with the same rule: a decimal text or byte string key becomes an int key, and
  a map with two keys that PHP makes one (`Int(1)` and `Text("1")`) is kind `internal`, not a lost entry (P-4). The
  int key as text is the inverse of PHP's own conversion of a decimal string key, so a text key `"1"` that leaves as
  the int key 1 comes back as the text `"1"` and keeps its value (P-3).
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
  `invalid_argument_type`. `map<T>` is generated for Go, Python, Node and WASM (GN-11, GN-12, GN-18) so far, so a contract with
  a map and another target is refused by name; `keyed_map<T>` is generated for every target (GN-10, GN-11, GN-12, GN-18).
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

## Generated tests (G-5)

- **GN-13** For every function, each language's test module checks: B-2, every number parameter or field with the values
  of G-5 (NaN, the infinities, 1.5, true, "7", -1 for uint, 2^53 in Node) as kind `invalid_number` of the value class;
  B-3, a text with an unpaired surrogate (PHP: bytes that are not UTF-8) and a latin1 text with U+0100 as kind
  `invalid_text`; B-4, every contract case that raises, with the exact class, the base class of E-2, the kind, the status
  and errno; B-7, the panic entry point as kind `internal`; G-7, a missing argument, one argument more and an unknown
  name (PHP named argument, Python keyword, a member of the Node options record, and a missing member). The arguments
  of a case are its keys in snake_case, a record parameter an object of its fields, an enum its value text and a latin1
  value a text of U+0000 to U+00FF; a case without the key of a parameter is refused by its id. Values that JSON
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
  that takes a callback has no B-4 tests (a case cannot give a callback) and the tests of K-2: an object without the
  members is kind `invalid_callback`, the exception that the callback raises reaches the caller as the same object,
  and a result of another type is a binding kind; its other arguments are placeholders whose lists have one item.
  No B-4 test is generated for a member that takes a callback: B-4 runs a contract case, and a case is JSON, which
  cannot give the object that implements the callback, so the case's failure cannot be reached from its keys. K-2 is
  another requirement and does not stand in for it.
- **GN-13a** Open items of G-5, not generated yet: B-5b, B-5c, B-6 and B-10; the identity of a default; the round trip
  of a value unit's rows; and B-4 for members that take a callback, for which a case names a callback fixture of a
  closed set that each language's generated test implements.

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
- **GN-13c** WASM: `packages/ts/wasm/generated/tests/generated.test.mjs` runs the tests of GN-13 for Node with
  `node --test` against the subpath `./wasm` of the installed package. The B-7 test runs last: it runs the panic entry
  point through `state.mjs` and expects kind `internal`, then a later call that is kind `internal` when the instance
  trapped and that works when the module unwinds (GW-7).

## End-to-end check

- **GN-14** `node scripts/e2e.mts --repo <checkout> --work <directory> --phpunit <phpunit> [--python <python3.14>]
  [--add-targets go,wasm]` (`tests/e2e/sample` is a repository of the items that no polyspec repository generates alone yet;
  `--dep <checkout>` for each repository whose types the contract names; its packages are built and installed first)
  copies the committed tree of a repository, makes the changes that the repository has not made yet and prints each
  (the root workspace and its members, the dependency on binding_core and `Kinds`, the tracked packages of `binding
  scaffold`), runs `binding check`, tests the core without the generator, rewrites a case file that does not follow
  GN-13 (camelCase keys, a record as an array of its field values) and prints it, generates, lints the workspace,
  builds and installs each package, and runs the generated tests and, where `tests/e2e/<library>` holds them, the
  contract cases on unittest, `node --test` and PHPUnit, and for the targets go and wasm on `go test` (after `gofmt -l`
  and `go vet`) and on `node --test` through the subpath `./wasm`. `--add-targets` adds those targets to the copy
  with the package entries of P-1 and P-5 and the WASM classes of E-2, and says so. The Git dependency on binding resolves to the commits of the checkout (`url.<base>.insteadOf` for the
  run's commands).
