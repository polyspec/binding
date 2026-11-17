<!-- doc-id: contract-check -->
# Contract check

[한국어](contract-check.ko.md)

`binding check <interface.json>` and `checkContract(contract, { dependencies })` of `packages/ts` judge every rule of an interface contract that the Rust
compiler cannot judge (design I-2) and every rule that the design gives to the contract check. A contract with a
finding is refused. Each finding names one check id below, the JSON pointer of the item and the rule. `dependencies`
holds the contracts of the libraries the contract names (T-3, E-1b). The command reads them from the packages that
Cargo resolved for the crate beside the contract (`cargo metadata`): the crate of a library is `polyspec-<library>`
(P-1) and holds its `interface.json` (I-1); no other checkout is read (S15). A check that needs a missing contract
reports it.

The schema and the todo checks run first; the other checks run only on a contract that passes both, because they read
its shape.

`binding check` then runs the checks of the repository files, CK-19 and CK-20, whatever the checks of the contract
found, and reports every finding before it fails. A check stops only where it reads what a failed check would give:
CK-20 reads `core.path` and the `Cargo.lock` of the repository, so it runs on a contract that passes the schema (CK-1);
CK-19 compares with what `binding scaffold` writes, which reads the package and name items alone, so it runs on a
contract that passes the schema and the package names (CK-1, CK-18). A check that does not run is named with the check
that stopped it. Why: a run that stops at the first failed check hides the findings of the others, such as a pin of
another binding behind a finding of the contract.

`binding check <interface.json> --release` also runs the checks of a release, CK-70 and CK-102. The recipe `release-binding-check`
(generator GN-19g) passes the option, and each build recipe of the assets runs that recipe as its first step, in CI as in
a release (generator GN-19i). The rule that it checks: a committed tree of a repository, on any branch, holds release
forms only. A tracked file names another polyspec repository by a tag or by a version of a release, never by a branch, a
commit or a checkout beside the repository, and a checkout is developed against the checkout of another repository
through links that are not tracked. So there is no declaration of a development tree and no mode in which CK-70 passes
a development form. A check without the option does not run CK-70: the option remains for the trees that no release is
cut from, such as the repositories of the end-to-end check of binding, and for a repository that has not yet moved its
lines. Why: while the check ran in the release alone, a development form that a branch had committed was first found
after the tag (generator GN-19i, B2.457).

## Checks

The schema is part of the npm package `@polyspec/binding` and is exported as `./schema/interface.schema.json` (S15).

- **CK-1** Schema: the contract passes `packages/ts/schema/interface.schema.json` (JSON Schema 2020-12, Ajv). The schema compiles in
  Ajv strict mode with no strict option turned off, so a consumer can validate a contract with it: a subschema that
  requires a property also names it under `properties` (`true` when the outer schema states its form), and a value of
  more than one type is an `anyOf` of single types. Every reason is a rule
  id (`^[A-Z][A-Za-z]*-?[0-9]+[a-z]?(\.[0-9]+)*$`), so a reason in prose, such as "the current name", is refused (N-3,
  P-10). A `native` entry without its `reason` is refused (I-3). A callback member's `errors` is only
  `{recognize, reason}` (U-3).
- **CK-2** Todo: a `"todo"` string or an object with a `todo` key, which `binding import` leaves, fails the contract
  (M-2). A schema error at or around a todo is not reported separately.
- **CK-3** References: unit and member ids are unique; `parent`, `implements` (an `interface` unit), `cleanup` (a member
  of the same unit), unit types, `{const}` defaults (a constant), `cases[].member`, `changes[].to` resolve; `only`,
  `native` and `changes[].from` name targets; every target has its `packages` entry (P-1; `wasm` uses `node`); a value
  type that a type names (`json_value`, `template_value`, `php_value`) has its owner in `types` (T-3). The ids of
  `faults` are unique and each kind of their `fills` is a kind of `errors.kinds` (G-5, E-1): a row of `errors.kinds`
  gives the kinds of its `kinds`, or the one kind of its variant's name in snake_case. A row of `cases` names a
  `member` or an `alias`, a value alias with `core: {in, out}` of the contract (U-7).
- **CK-4** Naming exceptions (N-3): the exception names a target, an existing unit, member of that unit, parameter of
  that member or field of that record; one exception per symbol and language; and the exception differs from the
  converted name (N-2), since an exception that changes nothing has no ground.
- **CK-5** Optional returns and fields (T-5, T-4): a member that returns `optional<T>` has `optional_reason`, and only
  such a member; a record field of type `optional<T>` has a `reason`, and only such a field.
- **CK-6** Cycles (P-4): `implements` and error `parent` form no cycle.
- **CK-8** Value units (U-1, U-7):
  - a value alias names in `core: {in, out}` the core functions that judge a language value described as `HostValue`
    (`fn(&mut dyn HostValues, HostValue) -> Result<T, Failure<E>>`) and give a core value as `OutValue`
    (a function from `&T` to `(OutValue, V)` where `V: OutValues` may borrow the value); a value class that represents its value type
    may name such a `core` with its `core_type`, through which another repository takes and gives its values (GN-6x);
    its own binding does not call them, because its `in` rows read its members and its own repository takes out the
    native object (T-3); no other unit has `core: {in, out}`;
  - the unit that represents a value type holds `out` and `in`: a `value` class that no alias gathers, or an `alias`
    (whose origin is `value`); a class that an alias gathers (an `in` row of the alias names it) holds neither; the
    members of an alias are the language types of its `in` rows (U-7 (a));
  - an `in` row names a target and a language type that is a built-in type of the table below, or the representing
    class itself, or a class that the representing alias gathers; one row per language and type;
  - with `by`, `by` is a public member that returns an `enum` unit of the contract, every case has `is` and no `when`,
    and every value of the enum is the `is` of exactly one case; without `by`, a row of a class has one case and no
    `is`, and a row of a built-in type may split its cases by `when` as the rows of one kind are split (below), the
    predicate being the core's judgement (U-7 (f));
  - a case of a class names `read`, a public member; a case of a built-in type has `read: builtin` (U-7 (e)); a case of kind `null` or `native` has no `read`, because it has no content or the core never opens it (U-1, VAL-18); the kind `native` is made by the form `native` and the form makes no other kind, because a native value is the language object that entered as the handle of `OutValue::Native` (VAL-18);
  - a case of the kind `text` of a class with `by` may name `units`, a public member that gives a list of `uint`; its
    `read` then gives an optional `text`, and none means that the text is no Unicode text and is read as the UTF-16
    code units that `units` gives (GN-6x). One call of `read` so judges every text of the language once, and the
    code units cross the boundary only for a text with an unpaired surrogate (B2.89);
  - an `out` row makes a value in every target; `make` is a built-in form that the language has (`keyed_map` written
    `{keyed_map: {key: [...]}}`), a public `constructor` or `static` member of the representing class or of a class the
    alias gathers, or `{value: X}` for the kind `nested:X`;
  - `when` names a predicate of the row's kind, or is `else`; the rows of one kind, and the cases of one built-in `in`
    row, are one without `when`, or a predicate's `is: true` and `is: false`, or distinct predicate values and one
    `else` for the rest (U-7 (b));
  - round trip (P-3): the language type that a `make` produces has an `in` row in that language, and that row
    classifies the value as the row's kind. For a built-in form, binding's closed table gives the predicates of the
    made value (the row's own `when`; for an `else` row, the other value of a predicate that its sibling rows select
    with one value; `text` is UTF-8; `int` is an integral safe integer; `list` has the keys 0 to n-1), the first case
    whose `when` holds is the case, and a predicate that the table does not give is a finding. For a class with `by`,
    whose `is` is known only at run time, the row's kind names exactly one case, and a case of the kind `text` with `units` is also the
    case of the kind `text16`, because it reads a text with an unpaired surrogate as its UTF-16 code units (GN-6x).
    A check that passes when any case
    matches is not used, because it passes a wrong classification; the generated round-trip test of G-5 remains;
  - only a property of a `value` unit is `writable` (U-2);
  - `in_raises` is on a value alias with `core: {in, out}` only and names variants of `errors.kinds` of the contract:
    the kinds that its `in` function can give, which join every member that takes the alias and are not written in
    `raises` (U-7, E-5).
- **CK-9** Units of other repositories (T-3): a unit of another library in a type is a `value`, `callback`, `enum`,
  `record` or `variant` unit of that library's contract; each unit that a callback, a record or a variant of another
  library uses, of its own library or of a third one, by a type or by a named type of its contract (`types`), is
  checked by the same rule against the contract of the library that owns it, recursively; a value type in `types`
  names a `value` unit of its owner. `binding` reads the contracts to the closure: the contract of each library that
  the contract names, and of each library that one of those contracts names, among the packages that Cargo resolved
  for the core. A unit that its library does not have, and a library whose contract is not found, are findings.
  Libraries whose contracts name each other in a cycle are refused with their names, because Cargo resolves no cycle
  of crates.
- **CK-10** Errors (E-1, E-1a, E-2, U-1): an error unit has a category and only an error unit has a category or a
  parent; a parent is an error unit of the same category and not `final`; `errors.classes` has a class for every
  category in every target but Go, whose category types E-7 fixes; a category class is named `<Library><Category>Error`,
  where `<Library>` is the repository name in the class form of each language (N-2: an acronym word is one capital
  word in PHP and Node and all capitals in Python and Go, so `HttpCookieValueError` and `HTTPCookieValueError`; the
  acronym words of a repository name are binding's table, below), and a PHP class is in the namespace of
  `packages.php`; `errors.fixed` has no Go row (G-7 is a compile
  error in Go); a `class` override in `kinds` or `binding` is an error unit of the kind's category (a dependency kind
  takes its category from the dependency's contract, E-1b); a variant or a binding kind is declared once. A row with
  `library` names the variant `<outer>/<inner>`, whose `<inner>` the library's contract declares, and a row without
  `library` names no `/` (GN-7c). A row with `library` may hold `"through": {"unit": "<unit>", "library":
  "<library>"}`: the kind reaches a member only through an object of that unit, which the package of the library
  makes, and by no call of the core of this contract (CK-22 states what the check then asks). A kind that reaches a
  member both ways has no `through`. The schema allows the
  key only on a row with `library`. Its `library` is the library of the row and its `unit` a callback unit of the
  contract of that library, and each member that states the row in its `raises` takes that unit as an argument, also
  inside a record; each other form is refused with the row, or with the member and the variant. A variant
  of `kinds`, `raises` and `in_raises` is a Rust path or the nested path `<outer>/<inner>` of GN-7c, and `errors.code`
  names the core error type and its projection to the code enum of the kinds (`{error, path}`, generator GN-7b); whether
  they name a variant, a type and a function of the core is judged by the compiler on the generated crate (I-2).
- **CK-11** Wrapped dependency errors (E-1b, P-4): every property of every error unit of a library whose kinds the
  contract passes on (`library`, E-1b (a)) or holds as the source of its own kinds (`source`, E-1b (b)) has one
  `wrapped` row; `forward` names an error unit with a property of the same name and type; a row
  that matches no property is refused.
- **CK-105** The conversion of an error of another library's package (generator GN-7c; B2.489, not yet run): for a
  member that takes a callback unit of a library L at any depth of its parameters (GN-6s), the rows with `library:
  L` that it names in `raises` are its conversion table for L, and the generated code converts an exception of L's
  package by identity of the inner kind. A member that names rows of L and takes no callback unit of L has no table.
  Refused: (a) two rows of one member with the same `library` and the same inner variant under different outer
  variants, because the kind of the exception would pick two classes; (b) a row whose `class` names an error unit of
  another category than the category of its inner variant in L's contract, as CK-10 refuses it for every row; (c) a
  conversion from a unit of this contract: a row without `library` has no table, and a callback unit of this
  contract raises its own kinds through recognition (U-3), so an exception of this contract's own classes is thrown
  again unchanged; (d) a row with `through` whose unit is no parameter of the member, also inside a record, which
  CK-10 refuses for every member that states the row and which this table states again for the converted path. The
  conversion does not read `through`: it decides only which cases CK-22 asks, so a row with or without it converts
  by the same rule. The message names the member, the rows, the library and the kind: `the member <id> names
  <variant> and <variant> of <library>, whose inner kind <kind> converts to two classes (CK-105)`. Why: the
  conversion is derived from `raises`, so a kind that arrives as an exception of L and as a kind of the core
  (session-store `Random` of hyper, through `store.renew` and through `random_hex`) takes one class by one rule, and
  the contract writes nothing new. A rename has no form: the kind does not change, and so the category does not.
  Limit: a kind of L that the member does not name is thrown again unchanged, as L's class, outside the classes that
  the member's `raises` states; nothing checks it at run time, and the check cannot see it, because the kinds that a
  callback object throws are not stated by the member.
- **CK-106** A case proves each converted row with values (generator GN-7c, GN-13; B2.489, not yet run): each row of
  a conversion table of CK-105 has one case of its member, one case for each row, whose callback fixture of the unit
  of L raises the row's inner kind with values, `{"library": L, "kind": <kind>, "message": <text>, "status": <int>,
  "errno": <int>, "properties": {<property>: <value>}}` (CK-22), and whose `raises` names the kind. The fixture gives
  `status`, `errno` and each property of CK-107 that the row's class holds, non-null and with a value other than
  the one that the row would give by default. The case arms no fault point: the refusal of CK-22 of a case that arms
  a point of another library whose kinds reach the member only through its object stays. Why: each row is an arm of the generated match, so a dropped arm passes
  the case of a sibling row, and a value that is null on both sides compares nothing.
- **CK-107** The properties of a converted row (generator GN-7c; B2.489, not yet run): when the class of a row of a
  conversion table is an error unit with properties, (a) L's row of the same inner variant names an error unit U of
  L in `class`, and (b) `errors.wrapped` has a row `{"library": L, "unit": U, "property": [...], "forward": <the
  row's unit>}` for every property of the row's unit, as CK-11 asks. A row whose class has a property while L's row
  names no unit is refused, because no value exists to copy: `the row <variant> names <unit> with the property <p>,
  which the class of <library> for <kind> does not have (CK-107)`.
- **CK-12** Record parameters (T-4): a member takes at most one record, as its last parameter; in PHP and Python the
  record's field names, after conversion and exceptions, differ from the member's other parameter names.
- **CK-13** Go names (E-7, P-2): an error unit's Go name is not a category error type (`ValueError`, `TypeError`,
  `IoError`, `StoreError`, `BusyError`, `InternalError`); in one Go package (a module), the type names, the functions of
  `functions` units, the `New<Unit>` constructors, the functions `<Class><Member>` of static members, and the functions
  `<Class>Handle`, `<Class>FromHandle`, `Dispatch<Callback>`, `Encode<Variant>` and `Decode<Variant>` that another module reaches a
  unit through (GN-15a)
  are distinct. Host units are not counted, because their Go code is
  a package of its own (L-1).
- **CK-14** Modules (L-1): the first segment of a module is not `host` or `tests`, the folders of hand-written Go code,
  nor `internal`, the folder of the C ABI layer of the Go binding (GN-15). The empty module is the root of the package
  (P-2).
- **CK-15** WASM (Q-4): when `wasm` is a target, a member whose parameters, return or yields contain `path` (through
  records and variants too) or whose wait is `blocking_io` or `process_wait` has an `only` without `wasm`, on itself or
  on its unit, with its rule id.
- **CK-16** Python awaitables (N-5, U-3): the name `a<name>` of a member whose wait is not `none`, or of a callback
  member with `async_allowed: true`, is not the Python name of another member of the unit and is no reserved word of
  Python, so that the awaitable of GN-6m can be generated.
- **CK-17** Callbacks (U-3, T-3): only callback members have `async_allowed` and `errors`, and every callback member
  states `async_allowed` and names its trait method and receiver in `core: {path, receiver}` with the receiver `&self`
  or `&mut self`, because the generated struct implements the trait and binding reads no Rust source; `recognize`
  names error units, and a contract whose callback member recognizes an error unit of its own names in
  `errors.recognized` the core function that makes the core error of a recognized kind (generator GN-6d); a generated class of this contract that implements a callback
  of this contract with a member whose wait is not `none` makes the callback member of the same name
  `async_allowed: true`.

- **CK-18** Package names (P-1): the core crate is `polyspec-<library>`; Composer `polyspec/<library>`, the PHP
  namespace `Polyspec\<Repository>`, PyPI `polyspec-<library>`, the Python root `polyspec.<repository with _>`, npm
  `@polyspec/<library>`, where `<Repository>` is the repository name in the PHP class form. A core at
  `packages/<component>/rust` (L-1) is the library `<repository>-<component>`, whose namespace and module are below the
  repository's: `Polyspec\CrudUi\Validator`, `polyspec.crud_ui.validator`.

- **CK-19** Tracked binding packages (L-2): `binding check` compares each tracked file of the binding packages
  (docs/spec/generator.md GN-3a) with what `binding scaffold` writes; a missing or different file is a finding, so a
  Cargo manifest of a binding crate that lacks the dependency line of a library whose path the generated code names
  (GN-3e), such as a library whose error a row of `errors.kinds` passes on, is a finding. For
  a host package (L-2a, GN-3b) it reads only the items of the host's manifest that the native module and its release
  need, and names each item that is missing or differs with the value it must have; among them is each npm package
  that the generated Node and WASM code imports or requires (GN-3e), which the `dependencies` of the host's
  `package.json` declare at any version. Of the Go
  module it compares `go.mod`, `internal/ffi/Cargo.toml` and `internal/ffi/src/lib.rs`, the files that the source tree
  tracks; the generated files `zz_generated_*.go`, `internal/ffi/generated/` and the static libraries of
  `internal/ffi/lib/` are no tracked files, so the check does not read them: a release adds them in the commit of
  its Go tag (GN-15g).
- **CK-21** The build of the core, exclusive members and the result of a core path (I-1, U-6, E-1c): `core.features`
  names targets only; `exclusive` is on a member with the receiver `&self` of a generated class only. A member whose
  `core.result` is `false` has no `raises` and no parameter without `keeps` that holds a callback or a function,
  because a core that returns no `Result` has no variant to return and no place for the failure of a callback;
  without `core.result`, a core path returns a `Result` when `raises` names a variant of the contract's own core error
  or a parameter without `keeps` is a callback or a function (generator GN-7). Whether `core.result` is true of the
  core is judged by the compiler on the generated crate (I-2), not here. `core.failure: true` is on a member whose
  receiver unit holds language code (GN-6h) or that has a parameter that holds a callback or a function, also with
  `keeps`, because no other member reaches language code that can fail; `core.failure: false` is on no member with a
  parameter without `keeps` that holds a callback or a function, and a member with `core.result: false` has no
  `core.failure: true`, because the failure of
  language code is returned in a `Result` as `Failure<E>`. A function type (T-2) states `async_allowed` and
  its `recognize` names error units, as a callback member does (CK-17). A function type states `async_allowed: true`
  only when its return is `passthrough`: the binding awaits what a function returns only through the machine of a
  member (generator GN-6ae), and any other function type is the function of generator GN-6z, which the core calls as
  a value or keeps (`keeps`, CK-90) and which no target awaits. `async_allowed: true` on such a type, with `keeps` or
  without, is reported under CK-17 with the return of the type, and the generator of every target refuses the same
  type with the same sentence, because both read one function. Why: the check accepted `async_allowed: true` of a
  function that the core keeps while every generator wrote that function as one that is never awaited, so a contract
  stated an awaiting that no binding does (orm, B2.480). Awaiting a kept function is not designed yet (B2.483).
- **CK-63** The WASM core (GN-4b): `core.features.wasm` names none of the features of platform I/O, `fs`,
  `blocking-io`, `process` and `net`.
- **CK-64** An integer of a case at a place of the type `int` or `uint` (an argument, an item of a list, tuple,
  map or optional of it, a field of a record or of a case of a variant, and the result) is a safe integer, the range of T-1 that every target gives (a Node
  `number`). A larger integer is an `int64` in one target and no `int` in another, so the case would expect two
  results; a member that takes or gives the range of i64 declares `int64` (GN-12a). An argument of a case that raises
  the kind `invalid_number` is an integer of the range of i64 outside the safe integers too: every target refuses it
  with that kind (GN-12a), so the case states the refusal of the binding with one result (B2.359, hyper
  `rules.reply_status`); a larger integer is no integer of every target and stays reported.
- **CK-65** A core with fault injection points (`faults`, G-5) has itself as a dev-dependency with `fault-test`,
  `<core crate> = { path = ".", features = ["fault-test"] }` in the `[dev-dependencies]` of its manifest, so that
  `cargo test` of the core without flags arms its points; `binding check` reports the core manifest otherwise
  (GN-5).
- **CK-70** The dependencies of a release (generator GN-3e), run by `binding check --release` alone: the dependency
  line of the core on each `polyspec-<library>` whose types the contract names or whose fault injection points a case
  arms names the version `=X.Y.Z` or the tag `vX.Y.Z` and no branch or commit, and so does the dependency line on
  `polyspec-binding-core` of the core, when it has one, and of each tracked binding crate. A line with a `path` that
  stays inside the root of the repository and the one version of that library beside it (`version = "=X.Y.Z"`, or
  `"0.0.Z"`) is a release form too, because it names a library of the same repository (generator GN-3e, B2.460); such
  a path without that version is a finding whose sentence says that the version is missing, ``names the path <path>,
  which stays inside the repository, with no version beside it, and a release names beside such a path the one version
  of that library``. A development form (a path that leaves the repository, a branch, a
  commit, a version range) is a finding that names the manifest of the line, the crate and the form, because the manifests
  that `scaffold` writes from it name no version of a release (`go.mod` `v0.0.0`, a dependency of
  `pyproject.toml` without a version). Those are the lines from which `scaffold` writes the manifests. The check also
  reads every other line that names a polyspec crate in the Cargo manifests of the contract, which are the manifest
  of the core, the manifest of each tracked binding crate and the root manifest (B2.457). A line names a polyspec
  crate when its crate, which is its `package` when it has one and its key otherwise, is `polyspec-<name>`; no contract
  names the crates of `[dev-dependencies]`, so the name decides. The tables are those in which a manifest names a
  crate with its source: `[dependencies]`, `[dev-dependencies]` and `[build-dependencies]`, the same three of each
  `[target.<target>]`, and `[patch.<source>]`, which replaces the source of a crate for every member. In them a line
  that names a branch, a commit, a version range or a path that leaves the repository is a finding that names the
  table (``the dependency line of polyspec-json in [dev-dependencies] names the branch main, a development form``); a
  line of the crate on itself (CK-65) and a path that stays inside the repository are none, with or without a version,
  because they name no other repository and no manifest of a binding package names a version from them. A line with
  `workspace = true` is judged by the line of `[workspace.dependencies]` of the root manifest that it inherits, in
  every table (generator GN-3e), and the finding says so (``names the branch main, by the line of
  [workspace.dependencies] of the root manifest``); a line of `[workspace.dependencies]` that no read manifest inherits
  is not read. The manifests of other crates of the repository and the manifests of the other ecosystems that
  `scaffold` does not write are not read. Why: a consumer held a branch line in `[dev-dependencies]`, which the check
  of the lines that the contract names passed. CK-70 does not ask whether the tag of a line exists, because the side
  that fetches says so in its own words and before the tag of the repository: Cargo resolves every line of the
  workspace for any build, so `cargo fetch --locked` of the install of the repository and the first `$(CARGO)` build
  of a job end with ``failed to find tag `vX.Y.Z` `` under the name of the crate and the URL of its repository, and
  `binding check` itself ends with the same error of Cargo and the instruction of generator GN-15f when it reads the
  contract of that crate through `cargo metadata`; for a Go module `go mod download` names the unknown revision, which
  is the finding of CK-19 on `go.sum` (generator GN-15l). Since CI runs the build recipes of the release (generator
  GN-19i), these fail in CI. It is a check of its own and no
  part of CK-19: the tracked files of a development checkout are what `scaffold` writes, so CK-19 passes them, and the
  question of CK-70 is what a release may hold.
- **CK-102** The settings of the release recipes (generator GN-19h), run by `binding check --release` alone: the check
  of a release reads each setting of the repository that a release recipe of the contract reads, with the reader of
  the recipe itself, and reports each that is missing with its file, its key, the recipe that reads it and the id of
  its rule. Only the settings of the targets of the contract are read. For the target `php`: `phpExtension.minors` of
  `config/toolchain.json`, a list of `<major>.<minor>` that is not empty, which `release-platform-assets` reads to
  require the extension of each PHP minor (generator GN-19a), read by the script of Node.js of that recipe
  (``release-platform-assets: config/toolchain.json names no PHP minor of the extension in phpExtension.minors``); and
  `llvm.version` of the same file, which `release-php-ext` reads (generator GN-19d), read by the script of `sed` of
  the recipes, which takes the value of a line `"version": "<major>"` under a line `"llvm": {`, so a file on one line
  pins none. For the target `go`: the module path of `packages.go`, which is
  `github.com/<owner>/<repository>/<directory of the Go module>` (generator GN-15, GN-19f), read by the function with
  which `binding release-go-module` refuses another path; and the requirements of the `go.mod` of the Go module,
  each of which a Go file that the released form carries imports (generator GN-15g, B2.473), judged by the function
  of `binding release-go-module` on the hand-written Go files of the checkout and on the generated files as
  `binding generate` writes them, which the check generates in memory, so it needs none in the work tree. It
  reports a requirement that only files that the form leaves out import, with those files, and one that no Go file
  imports, with the path of the `go.mod` and `release-go-module`; it writes a line `// indirect` to its output and
  does not fail on it, and it fails when the Go binding is not generated, with the refusal of the generator. The recipe `release-binding-check` itself first requires
  every variable of the Makefile that a release recipe of the contract reads (`BINDING_RUN`, `CARGO`, and `NPM`
  and `NODE` by its targets), which the check, a command, cannot read. Why: the release of session-store passed
  `binding check --release` and would then have stopped in `release-platform-assets`, after the tag, on a
  `config/toolchain.json` without `phpExtension.minors`, which a rehearsal found; with the check as the first step of
  each build recipe of CI (generator GN-19i) such a setting fails before a tag. One reader for the recipe and the
  check, because a second reader would pass a file that the recipe refuses. What the check does not read: the tools
  that a recipe starts and the files that those tools read themselves (the napi CLI of the devDependency
  `@napi-rs/cli`, the wasm-bindgen of `mise.toml`, the targets and components of `rust-toolchain.toml`, the LLVM of
  `LLVM_ROOT`), which the build recipes of CI start and so fail on before a tag, and the inputs of one run (`TAG`,
  `EXPECTED_PHP_MINOR`, the assets, `gh`, the Git remote), which no tree holds.
- **CK-71** The licence of the core (generator GN-3f): the manifest of the core names `package.license`, by itself or
  from `workspace.package.license` of the root manifest; a core without it is a finding that names the core manifest,
  because every manifest of its binding packages carries that licence.
- **CK-67** The borrow of a class parameter (GN-6h): `core` of a parameter (`&`, `&mut` or `value`) is on every
  parameter of a member, other than a member of a callback interface, whose type is a class unit of this contract with the
  origin `generated` or an `optional` of one, and on no other parameter, because only an instance of a class is a place whose borrow the
  core takes, and binding reads no Rust source to find it.
- **CK-68** The state machine of a member that reaches language code (generator GN-6ab, c6 6.2): a member with `wait:
  async_driver` that reaches language code, when the type of a parameter or the class of its receiver carries language
  code (generator GN-6q), names `"machine": true` in its `core` object, and no other member names `machine`, because
  the generated code drives such a core path as a state machine and any other as a future, and binding reads no Rust
  source to tell them apart.
- **CK-69** The receiver of a method with a state machine (generator GN-6ae): a method whose `core` names `"machine":
  true` names the receiver `&self`, because the generated code gives the core a clone of the value of the instance,
  which neither writes back into the instance as `&mut self` would nor consumes it as `self` would. The check reads
  the receiver that the contract names, not the Rust source of the core, so the generated call lends the receiver by
  `lent_receiver`, whose trait names this rule: a core path that takes `self` or `&mut self` fails to compile with the
  sentence of CK-69. Why: orm's machine took `self` under a contract that named `&self`, the check passed it, and the
  generated crate stopped on E0308, which named no rule (B2.501).
- **CK-72** The tag of a variant (T-9, generator GN-6v): no field of a case of a variant has the name of the `tag` of
  the variant, compared by their words, because the value of a case in Node, WASM and a case file is an object whose
  tag member holds the case value, so a field of that name would take the place of the tag. The finding names the
  field and the remedy: rename the field or the tag.
- **CK-73** Members that do not wait (generator GN-6m, GN-6n, N-4): a `constructor`,
  a `property`, an `iterate` and a hook (`stringify`, `to_json`, `primitive`) have no `wait` other than `none`,
  because no language has an awaited form of a constructor, of a property or of an iteration, and a language calls a
  hook in its own protocol, which awaits nothing. The finding names the member, its wait and the member that can
  wait in its place: a `static` member that makes the instance for a constructor, and a `method` that gives the value
  or the items for the others. A host unit is judged as any other unit: its code is written by hand (L-2a), and the
  language has no awaited form of these members there either, so the check reports it before any code is written.
- **CK-74** Constructible classes (U-1): a class of the origin `generated` or `value` that names `core_type` and is
  not `abstract` has a `constructor` member exactly when it is constructible, and it is constructible unless it
  declares `constructible: false`. A class without a constructor, whose instances its `static` members make, so
  declares `constructible: false`, and a class with `constructible: false` has no constructor, because every
  language writes the class either with a constructor or closed to construction.
- **CK-75** The core enum of a variant (T-9): a `variant` unit of the origin `generated` names its Rust enum in
  `core_type`, because each case is generated as a struct variant of that enum and binding reads no Rust source to
  find it.
- **CK-76** A cleanup that leaves its object (generator GN-6p): when the `cleanup` of a class unit is a method whose
  core receiver is `&mut self`, a case of that member has a receiver whose `then` calls the same member without
  `raises`, and the case itself names no `raises`, so that the case calls the cleanup a second time and requires that
  it does nothing. Why: the object stays after such a cleanup, so a caller, or a wrapper that closes what its caller
  closed, calls it again, and a core that fails or releases twice there is found by its own case. The core type of
  a class with `cleanup` releases its resources in its `Drop` (generator GN-6p), because no destructor calls the
  cleanup member. `binding check` reads no Rust source, so it does not verify that `Drop`: it is the duty of the
  core, and the finding of this check says so.
- **CK-77** A generated interface (generator GN-6ap): an interface unit of origin `generated` names `core_type`,
  declares no `core`, and at least one class of this contract `implements` it; each such class has the origin
  `generated` and a `core_type`. A parameter typed by the interface, or by an `optional` of it, names no `core`
  borrow, and no return, field, `yields` or member of a callback interface names the interface, because the binding
  converts an instance of an implementing class to the `core_type` only as it enters a call. In a case an argument at
  such a parameter is an instance value (GN-13f) of a class that implements the interface, or `null` in an `optional`;
  an argument of a step or of a call of `after` may also be `{"bound": <name>}` of such a class, which a function
  fixture around it or a `with` of the case names (GN-13n, GN-13pa, B2.383). Why: the bound value is an instance that
  the call made, so it is already of the class, and orm passes the `tx` of `db.transaction` to `query.connect` so.
- **CK-78** A class without `core_type` on a target that does not generate it (generator GN-6af): a class of the
  origin `generated` or `value` that names no `core_type` names `only` (Q-4) with none of the targets that generate
  no such class. Python, Node, WASM and Go generate it. PHP takes its own `stdClass` and references (generator GN-6e) and
  generates no such class: that is the rule of the target and no state of the generator, so a class of either origin
  never names PHP. The finding names the unit and each such target. Why: the generator refuses the
  unit for such a target, and a contract error is reported by the check before the generator runs.
- **CK-79** Retired (B2.125). It compared the C symbols of the target `go` of a contract with those of the
  libraries that the contract names, because a symbol had one underscore after `polyspec_<library>`, and it saw no
  two libraries of which neither names the other. The symbol of generator GN-17 has two underscores after the name of
  its library, which holds no two in a row, so the symbols of two libraries differ and no check compares them. The
  id names no other check.
- **CK-80** A function with the name of a C type of the C ABI (generator GN-17): for the target `go`, no function of
  the root module is named `buffer`, because its symbol `<prefix>_buffer` is the C type of the result of every call of
  the C ABI. The finding names the function and the symbol.
- **CK-81** A function with the name of a declaration of package `binding` (generator GN-17): for the target `go`, the
  function of package `binding` of a function of the root module, its name in CamelCase, is no name that package
  `binding` declares itself: one of its own types and functions (`Reader`, `Writer`, `NewReader`, `NewWriter`, `Call`,
  `NewCall`, `Map`, `KeyedMap`, `Key`, `IntKey`, `BytesKey`, `TextKey` and the others of the generator), or
  `Release<Class>` of a class of the contract. The finding names the function and the declaration.
- **CK-90** A parameter whose callback or function the core keeps (generator GN-6aa): a parameter names `keeps: true`
  only when its type holds a callback unit of this contract or of another repository: the unit itself, or a record, a list, an
  `optional` or a map that holds one, also inside one another, or a function type in the same places. `keeps` at any
  other parameter is reported with the member and the parameter. At a function, `keeps` states that the member stores
  the function for a later member to call, so its core error is no `Failure` and the member that calls it states
  `core.failure: true` (generator GN-7, CK-21). Why: the attribute changes the lifetime that the generator writes for
  the callback and the place of the failure of the callback or the function, and at a parameter without either it
  would state nothing, which a reader takes for a rule of the member.
- **CK-92** The members that the instance values of a case call are generated where the member of the case is
  (generator GN-13f): each member that a `new`, a `from` or a call of `then` of an instance value of the case names,
  also inside the receiver or an argument of another and inside a list, an `optional`, a map or a field of a record at
  the place of a class or an interface, is generated for every target of the contract that the `only` of the unit
  and of the member of the case and the `only` of its row of `cases` (generator GN-13h) keep. A member that an `only`
  keeps out of such a target is reported with the case, the member and the targets; the contract resolves it by an
  `only` without those targets of the member of the case, of its unit, or of the row of `cases` that holds the case.
  A row whose `only` names no target where its member, or its alias, is generated is reported too. Why: the test of a case is
  generated for each target of its member and its row, and a test that cannot make its instance in a target would
  either refuse the target or leave the case out silently, so that what was not verified there would not show.
- **CK-93** A case gives no parameter and no field that an `only` keeps out of a target of the case (generator GN-6g,
  GN-13h): for each case, a parameter of its member with `only` that the case gives a value, and a field with `only`
  of a record that a value of the case gives, also inside a list, an `optional`, a map, a keyed map or a tuple, lists
  every target where the case is generated, which are the targets of its member that the `only` of its row of `cases`
  keeps. Another such parameter or field is reported with the case and the targets that its `only` leaves out; the
  contract resolves it by an `only` of the row of `cases` that holds the case. Why: the other targets have no such
  parameter or field and cannot pass its value, so the generator leaves the case out of their tests; the row states
  that drop where a reader of the contract sees it, as CK-92 asks for the members that instance values call.
- **CK-91** The release profile of the Go static library (generator GN-15i): for a contract with the target `go`,
  `binding check` reports `[profile.release]` of the root manifest or of `.cargo/config.toml` of the repository that
  sets `lto` to any value but `false` or `"off"`, with the file and the value, because a Go program then cannot link
  that static library with the static library of another repository.
- **CK-94** The release recipes of the repository (generator GN-19h): when the root of the repository holds a
  `Makefile`, `binding check` reports a Makefile that has no line `include` or `-include` of the file of recipes of
  the contract (`packages/release.mk`, or `packages/<component>/release.mk`, also by a path that ends in it), and a
  rule of the Makefile with a recipe of its own for a target that the file defines, with the target; a rule that only
  adds a prerequisite to such a target is no finding. It also reports the file of recipes when it is there and differs
  from what `binding release-recipes` of this binding writes, and each line of it that runs Cargo in another way than
  GN-1d states: `cargo` of `PATH` and not `$(CARGO)`, a build (`$(CARGO) rustc` or `$(CARGO) build`) without
  `$(CARGOFLAGS)` right after its subcommand, and a command of binding that runs Cargo without `--cargo "$(CARGO)"`,
  with the line. A file that is not there is no finding, because it is
  generated and not tracked, and a release writes it before it runs a recipe. Why: a recipe copied by hand keeps the
  defects of the copy that GN-19h fixed, and a file of recipes of another binding builds what that binding builds.
- **CK-95** The services of the test run (generator GN-13j): `services` lists `{"id", "address", "state", "reason"}`,
  whose `address` and `state` are names of environment variables (`^[A-Z][A-Z0-9_]*$`) and whose `state` is
  optional; the ids are unique. `binding check` reports a case whose `service` is not `{"id", "setup", "peer",
  "check"}`, with `setup`, `peer` and `check` optional, of an id of `services`; `setup`, `peer`, `check` or the
  `service` of a call of `then` of a service without `state`; a case value `{"service": ...}` or a call of `then` with
  `service` or `peer` in a case without `service`; a call of `then` with `peer` in a case whose service has no `peer`
  (GN-13q); and a row of `cases` whose group holds a case with `service` and that holds for WASM: its member is
  generated for WASM and the row has no `only` without `wasm` (GN-13h). Why: a case that names a service that the run
  does not provide, or a state that no program writes, fails only when the tests run, and the core of WASM has no
  socket, so its test of such a case can only fail.
- **CK-22** Every member names its cases (K-1): each public member, other than a constant, of a public unit that is
  not an error unit, a callback interface (U-3) or a host unit (L-2a) is the `member` of at least one entry of
  `cases`, or is called by a step of a function fixture or a call of `after` of a case (generator GN-13o, GN-13pa),
  which is its case: a member of a class that only a callback gives, such as the transaction of an ORM, has no
  receiver that a case of its own makes, so its cases are the calls that reach it (B2.365); G-5 then fails the e2e when the file or group of that entry leaves the member out. `binding check` also
  reads the case files: every group that `cases` names is in its file, and each kind that the rows of the `raises` of
  a member give has a case that raises it on the path of that member: a case of any member whose `raises` gives the
  kind from the same library (the library itself, or its owner, GN-7c) with the same form of call (`wait` `none`, or
  another `wait`) (B2.376). Why: the generated code gives a kind its class, message, status and errno by one
  conversion of the core error of each library, which every member of that form of call shares (B-4), so one case of
  the path shows the conversion for all of them, while whether the core of each member gives the kind is what the
  tests of the core show; a call with `wait` rejects by another path than a throw, and the kind of another library
  leaves by the conversion of its owner, so each of those is a path of its own. The kinds of another library are
  one path for each form of call: a case of any kind of that library shows them all (B2.382). Why: the owner
  converts each of its kinds, which the CK-22 of the owner's contract shows kind by kind; what the case of this
  repository shows is that the call takes the owner's conversion, which is the same for every kind of it, so a case
  for each kind repeated the owner's cases (hyper `rules.template_reads`, 19 kinds of template). A row of a kind of another library
  takes its category and its kinds from the row of that library (GN-7c); CK-22 skipped such a row, which has no
  category of its own, so no kind of another library was asked a case. The `cases` row of a member may name `result`, the snake_case key of its cases
  that holds the result of the member (GN-13e); a row without it reads the key `result`, and the row of an alias has
  none (CK-1). The `receiver` of a case and an argument of a class type may be an instance value of GN-13f: its member exists and
  gives the class, through its `pick`; a method has its `receiver`; `args` are the arguments of a call of the member (CK-101); each call
  of `then`, whose `args` are again those of a call (CK-101), is a method of the class, or, with `"on": "receiver"`, a method of the class of the `receiver` of a value
  that has one, and its `raises`, when given, is `{"kind": <kind>}` of a kind of that method's `raises`; its
  `faults`, when given, are faults of a case of that method, and a call with both `faults` and `raises` expects a kind
  that its points fill. A case whose instance values arm faults fills, as a case with `faults` does, only the kinds
  that the points of the case and of those calls have in `fills`. An argument of the type `cancel` is `{"cancel": "fired"}`, a cancellation that
  fired before the call, or `{"cancel": "open"}`, one that does not fire; an `optional<cancel>` may be `null`. A case may arm fault injection points (G-5) in
  `"faults": [{"point": "<library>.<id>", "kind": "io" | "short" | "broken", "errno": "<symbol>", "bytes": <n>,
  "nth": <n>}]`: `<library>` is the library name in snake_case, of this contract or of a library that the check was
  given, and `<id>` a point of that contract's `faults`; `kind` is one of the point's `inject`; `bytes` is given with
  `short` and only with it; `errno`, the symbol of an errno (`ENOSPC`), only with `io`; `nth` counts from 1; a fault has
  no other key. A case with `faults` fills only the kinds that its points have in `fills`, and one that expects another
  kind is refused, so the case of an input rule is an input. The `errno` of a case's `raises`, when it is a text, is
  such a symbol. A case's `raises` that leaves out `category` gives a kind of `errors.kinds` (its own rows and the
  rows with `library`) or of E-1a, whose category the generated test takes (generator GN-13bd); another kind is
  refused by name, because its test would name no class (B2.433). A `category` that the `raises` of a case writes is
  one of the six categories of E-1 and the category of its kind, where `errors.kinds` or E-1a gives the kind one;
  another is refused with the case, the kind and the category (generator GN-13bh, B2.448). The kind of the `raises`
  of a case is a kind that the call of the case can give: a kind of the `raises` of its member (a row with `library`
  gives the kinds of the row of that library, GN-7c); a kind of E-1a, which the binding raises itself before or
  around the core and no member declares; a kind of `in_raises` of a value alias that the type of a parameter holds,
  which the in function of the argument gives (U-7); for a case of a member with a receiver that gives no `receiver`,
  `faults` or `after`, also a kind of the `raises` of a factory of the class, a constructor or a member without a
  receiver, or of `in_raises` of an alias of its parameters, because the failure of such a case is that of making the
  receiver or of the call (generator GN-13f); and for a case that arms a fault injection point, a kind of the
  category `internal` (X-1). A case that raises another kind is refused with the case, the kind and the member. Why:
  the check compared the kind of a step, of a call of `after` and of a call of `then` with the `raises` of the member
  of that call, and read the kind of the case itself only to count it as a case of a kind, so a case that expects a
  kind that its member does not declare passed, and its test could only fail on every target (B2.449). A kind of the category `internal` needs no case of each member (X-1), because the match that maps the
  core error is one for every member: each error enum that has such a kind, the contract's own and that of each
  library whose kinds it passes on by a call of its core (E-1b (a)), a row without `through` (CK-10), has one case of
  any member that arms `<library>.internal` as `broken` and raises a kind of the category `internal`. A row with
  `through` states that its kind reaches a member only through an object that the package of its library makes, the
  callback unit that the row names. Such a row is asked neither the case of X-1 nor the case of its path (the case of
  a kind above, which one case of any kind of a library shows for the rows of that library without `through`), and a
  case of a kind of such a row shows no path for another row: its proof is the case of the contract of that library
  itself and the tests of the core of this library. A case, or a call of `then`, that arms a point of another
  library is refused when every row of this contract that passes on a kind that the point fills has `through`:
  `the case <id> of <member> arms the point <library>.<point>, which fills only kinds that the contract states reach
  it through the unit <unit> of <library> (through): the point fires in the package of <library>, whose arming a
  generated test of this contract does not make, so the case is a test of the core (GN-5, X-1)`. Why: hyper takes
  the callback unit `store` of session-store in `open_page`, and 16 of the 17 kinds of session-store that it passes
  on reach it only as what that object raised. `Random` reaches it both ways: as what `renew` of the store raised,
  and from the call of `polyspec_session_store::random_hex` by the core of hyper; so its row has no `through`, and
  its case, which arms `session_store.random` for that call, is asked. A kind that reaches a member both through an
  object of the package of its library and by a call of the core of this contract keeps no `through`: the call of
  the core reaches the point, so its X-1 case and its path case are asked as for any row without the key, and the
  generated test proves the call of the core alone, not the way through the object. The package of session-store links a `binding_core` of its own
  (generator GN-5), so a test of hyper that armed `session_store.internal` armed nothing that the store read: with
  the case the generated Node test failed with "Missing expected rejection", and without it the check reported the
  missing case, and the missing case of the path for each of those rows. What stays unproven: the check does not
  guess from the Cargo dependencies whether a kind arrives by a call of the core, so a `through` on a row whose kind
  the core does reach by a call is not caught, and its X-1 case and its path case are then asked of no one here; what
  still guards such a row is the X-1 case of the contract of that library, the compile check of GN-7c and the tests
  of the core of the consumer. And the `class` of a row with `through` that overrides its class (`record_error` on
  `Record` and `RecordWrite` of hyper) is proven by no generated test. The kinds of `in_raises` of a value alias have their cases in the
  group of a `cases` row that names the alias (U-7), a group that no row of a member names: such a case is
  `{"id", "value", "raises"}` (and `note`, `rule`) whose `raises.kind` is a kind of `in_raises`, and every kind of
  `in_raises` has one. A case of a member that takes a callback interface as a parameter gives it as a callback fixture (G-5, GN-13):
  `{"callback": {<member id>: [<row>]}}` whose member ids are members of that interface, whose rows and `calls` give
  in `args` the arguments that the core passes to their member (CK-101), and whose rows have no key but `args`, `result`, `raise`, `once`
  and `async`; a `raise` is `{"error": <error unit>, "kind": <kind>}` or `"exception"`, and on a callback unit of
  another library L also `{"library": L, "kind": <kind>, "message": <text>}` with the optional keys `status` and
  `errno`, each an integer, and `properties`, an object of the snake_case names of the properties of L's class of the
  kind (B2.489, CK-106): the kind is a kind of a row of L's `errors.kinds`, and the row needs no recognition, because
  the fixture throws the instance that L's internal maker makes (generator GN-7a); a row with a `result` and a
  `raise`, a `raise` of an error unit that the member does not recognize (U-3), a `raise` of a function fixture or of
  a row whose kind is no kind of its error unit, that is of no row of `errors.kinds` whose `class` is that unit,
  which the constructor of the unit refuses (generator GN-7a), an `async` row of a member without `async_allowed`, and a row of a member that takes an object of the
  language (a class, a callback, a function, a host value), which a row cannot give, are reported. The same holds at
  every other place of a callback interface: a field of a record, an item of a list and an `optional`, where an
  instance value (GN-13f) of a class of the contract that `implements` the interface may stand for the fixture. A
  value of a function type is `{"function": [<row>]}` (generator GN-6z), whose rows have no key but `args`, `result`
  and `once` and give in `args` the positions of the parameters, `"0"`, `"1"` and so on; a function that takes an
  object of the language has no row. A value of a function type whose return is `passthrough`, the function of a
  member with a state machine, is a function fixture (generator GN-6ae), `{"function": {"calls": [<step>], "result":
  <value>}}` or with `"raise"` in place of `"result"`: the fixture has no key but `function`, whose object has the
  list `calls`, one of `result` and `raise`, and no other key but `awaits`. `"awaits": true` states that the function
  returns an awaitable of its language, whose outcome is the `result` or the `raise` of the fixture (generator
  GN-6ae): only a fixture of a function type with `async_allowed: true` names it, its value is `true`, and a fixture
  of an argument of a step names it only when the fixture of that step names it, because a function that does not
  await cannot await the call of its step. A step is `{"on": "<position>", "call": "<member id>",
  "args": {...}}` with no other key but `result`: `on` is the position of a parameter of the function, `"0"`, `"1"` and so on,
  because a parameter of a function type has no name, and the type of that parameter is a class unit of this
  contract; `call` is a method of that class; `args` are the arguments of a call of that method (CK-101), and an argument of
  a function type of a step is again a function fixture. A step may also name `"result": <value>`, the value that
  its call returns: the generated function requires it before its next step, so a case verifies what a class
  argument holds while the function runs. `raise` is the text `"exception"`, an exception of the
  language, or `{"error": <unit>, "kind": <kind>}` of an error unit that the function recognizes (U-3). The `raises`
  of a case may be the text `"callback"`: the case expects the exception that a function fixture of its arguments
  raises by `"raise": "exception"`, and a case without such a fixture, at any depth of its steps, is refused. A case
  of a method may name `after`, a list of `{"call": "<member id>", "args": {...}, "result": <value>}` with no other
  key: each `call` is a method or a property of the class of the receiver (a property, which each
  language reads as it reads a property, B2.361), `args` are the arguments of a call of it (CK-101), the `result` of a member without
  a result is `null`, which each language tests as no value (`undefined` in Node and WASM, B2.374), and the generated
  test calls it on the receiver after the call of the case, also after a call that raised, and requires `result`.
  The result of a member without a result has that one rule wherever a case writes it (generator GN-13e, B2.466):
  under the result key of the case, which such a case may leave out, in a call of `after`, which writes `result` or
  `raises`, in a step of a function fixture and in a row of a callback fixture it is `null`, and another value there
  is reported. Why: the generator tests it as no value at each of these places, so a case that states a value for it
  would have a test that fails, which the check says first.
  A case value of a value alias of the contract, `{"kind": <kind>, "value": ...}` (generator GN-13), is read wherever
  a case of a member gives one (B2.465): at an argument of the case and of every call that the case writes (an
  instance value, a call of `then`, a step of a function fixture, a call of `after`), at the result, at an item of a
  list, a map, a tuple, an optional or a field of a record or a variant at any depth, and at each value inside it. Reported are a kind that the
  generator gives no form, which is another kind than `null`, `bool`, `int`, `int64`, `float`, `text`, `bytes`,
  `list`, `map`, `object` and `reference`; a `list` whose `value` is no array and that is no repeat form; and a `map`
  or an `object` whose `value` is no array of `[key, value]` pairs and that is no repeat form, an `object` that its
  `id` names again having no `value`. A value that is no `{"kind": ...}` object, such as `{"host": <sort>}` or a value
  of another JSON kind that a case gives for the binding to refuse, is not judged here. Why: the generator answers
  such a value with a test that fails with "is not generated yet" and the check said nothing, so 19 places of 12 cases
  of orm gave a map as a JSON object, whose order JSON does not keep, and passed the check.
  A case of a method may name `with`, `{"<name>": <instance value>}` (generator GN-13pa): each value is `{"new":
  <member id>, ...}` of a member that makes a class of this contract and is judged as an instance value of that class,
  each name is snake_case and not `receiver`, and no function fixture of the case gives the name again; a step of a
  function fixture and a call of `after` may then name it as `on`, a step argument may be `{"bound": <name>}`, and a
  `with` of a case of a member without a receiver is reported.
- **CK-108** A case id is unique within its member (K-1, G-5), across all the groups that the rows of `cases` name for
  that member: two groups of one member do not hold the same id. `binding check` reports the id, the member and both
  groups, each with its file; a row that names a group again reads the same cases and is no finding. Why: a case id is
  the name that picks one case within a member, and the `CASES` selection, the reports and the name of each
  generated test (GN-13e) find a case by its id, so an id that two groups hold picks two cases, and the Go test of
  each is defined twice.
- **CK-101** The `args` of a call (G-5) follow one rule in every form. A call that the test makes, `new` and `from`
  of an instance value and each call of its `then` (generator GN-13f), a step of a function fixture and a call of
  `after` (CK-22), names in `args` only parameters of its member in snake_case and every parameter without a
  `default`; a parameter with a `default` may be left out, which the generated call leaves out (U-2), and `args` may be
  left out, which is `{}`, so a call of a property or of a member whose parameters all have a default needs none. The
  arguments that the core passes, a row of a callback fixture and a call of its `calls` (CK-22), are what the core
  gives to the callback, every parameter, so their `args` are exactly the parameters of the member, and are left out
  only when the member takes none. Every form reports a key that is no parameter, a missing parameter and `args` that
  are not an object with the same message. Why: the forms had two rules, and a step or a call of `after` refused the
  form without `args` that the cases of consumer contracts give to `new` and `from` at about 2000 places; one rule
  keeps that form valid, and the rows of a callback differ only because a fixture compares them with the arguments it
  receives (B2.408).
- **CK-96** Every key of a member case has a meaning (G-5): a parameter of the member in snake_case; for a member
  with a receiver whose case gives no `receiver`, a parameter of a constructor or a static member of its class, which
  makes the receiver; the key of its result (CK-22); or a key of a case: `id`, `rule`, `note`, `receiver`, `raises`,
  `with` (generator GN-13pa), `after`, `then`, `faults`, `service`, `@files`, `@listener`, `repeat`, `awaits` and `targets` (CK-97); or a key that the row of `cases` names in
  `reads`. `reads` is a list of snake_case keys of the cases of the group that the tests of the repository itself
  read and no generator reads, such as the input bytes and the expected tree that its core tests and its hand-written
  host tests compare: `{"member": "serialize", "file": "contracts/php-serialize.json", "group": "cases", "result":
  "serialized", "reads": ["bytes", "data", "tree"]}`. `binding check` reports any other key with the key, the case and
  the member. Why: the generator reads only the keys that it knows, so a key of another name, such as `files` for
  `@files` or a result under a key that the row of `cases` does not name, is left out of every test without a word,
  and the case checks less than it says; a case file is also read by the tests of the repository, so the row
  declares the keys that those tests read. `reads` is a field of the row and not of the contract, because the row
  already names the group and its `result`, and two groups of one member hold different keys (`bytes` in one,
  `written` in another).
- **CK-97** The `targets` of a case (generator GN-13bc) is a non-empty list of targets where its member is generated (and
  that the `only` of its row lists), and the cases of its group with the same arguments, each with `targets`, together
  list every such target; `binding check` reports a case whose targets name another target or whose input leaves a
  target without a case. Why: a case with `targets` states a result that differs by the model of numbers of the
  languages, and a target that no case of the input lists would leave that input untested while the run passes.
- **CK-98** A `default` of a member (generator GN-6d, B2.379) is `{"literal": <value>}` on a member of a callback
  interface (U-3), and the literal is a value of the type that the member returns: a bool, an integer (not negative
  for `uint`), a number, a text, a value of a variant of an enum of this contract, or `null` or such a value for an
  `optional`. `binding check` reports a default on a member of any other unit and a literal that is no value of the
  return type, a return of `none` among them. Why: the default is what the trait method returns to the core when the
  host object leaves the member out, so a default on a member that the core does not call through a host object
  states nothing, and a literal of another type would not compile in the trait method or would give the core a value
  that its type does not hold. A parameter of a member of a callback interface has no `default` (B2.409), and `binding
  check` reports one with the unit, the member and the parameter. Why: the core passes every argument to a callback,
  so a default of its parameter is never taken, and a row of a callback fixture gives exactly the parameters (CK-101),
  so the default would state a form of call that no row and no target has.
- **CK-99** The core signatures (I-1, I-2, generator GN-4a, GN-6g, GN-7; B2.398, not yet run): `binding check` compares
  the contract with the public API of the core as the compiler describes it, per target. Source: for each target, the
  rustdoc JSON of the core crate at `core.path`, built with `cargo rustdoc --lib --locked --offline` and the features of
  the target's build (GN-4a: `--no-default-features --features <core.features.<target>>` for a target with a row, the
  default features otherwise), `--target wasm32-unknown-unknown` for `wasm` and the host for the other four, and the
  rustdoc options `--cap-lints warn -Zunstable-options --output-format json`; one build serves the targets whose
  features and Rust target are the same. The check reads the JSON only at the `format_version` that it names, and
  another version is a finding. Facts compared:
  - each core path of a member that the target generates (not left out by `only`), and each constant named by such a
    member or by a `default_core`, resolves in that target's JSON from the crate root through its modules and
    re-exports (`use`, glob `use`) to an item, and a method through the inherent and trait impls of its type; a path
    that does not resolve is a finding with the member, the path and the target, so a constant that the core
    defines under a feature the target's build lacks is reported for that target alone;
  - a path of another crate, such as `std::string::ToString::to_string`, is resolved through the trait impls of the
    receiver type in the core's JSON, which list the trait by its path; its signature is not in that JSON, so only
    its existence is compared;
  - the return type of each resolved function, through type aliases, is `core::result::Result` exactly when the
    member's `core.result` holds (stated, or derived by GN-7), and its error type is `binding_core::Failure<_>`
    exactly when `core.failure` holds (stated, or derived by GN-7 from a parameter without `keeps` that holds a
    callback or a function); each disagreement is a finding with the member, the target, the contract's fact and the
    core's type.

  A core that cannot be read is a finding, never a pass: the pinned toolchain or its `wasm32-unknown-unknown` target
  is missing, a dependency is not in the local Cargo cache (`--offline`), the build fails, or the JSON has another
  `format_version`. The finding is `CK-99 core unreadable` with the target, the command and its error, and it names
  `make install`. Why: the check read only the contract, so a `keeps` member whose core returns `Failure` without
  `core.failure: true` (template, E0053 and E0308) and a constant of a feature that the WASM build turns off (orm,
  E0425) passed it and failed only when a generated crate compiled; the compiler's description of the core is the one
  source that states the same signatures and the same features as that compile, and binding still parses no Rust
  source (R5). The JSON output of rustdoc is unstable in Rust 1.99 (`-Zunstable-options`, and `cargo
  --output-format json` is refused on stable), so the check runs it with a nightly toolchain that the repository pins
  with its components and the `wasm32-unknown-unknown` target, never with `RUSTC_BOOTSTRAP` on the stable toolchain,
  which would turn on an unstable feature behind the back of the channel (P7); a new nightly is a pin change whose
  `format_version` the check is changed to read in the same commit. `--cap-lints warn` keeps the lints of the core's
  documentation out of the check: a core whose workspace denies warnings fails rustdoc on an ambiguous doc link (the
  json core, `stringify` is a function and a macro), which says nothing of its signatures. Until B2.398 is done the
  check does not run CK-99, and the build of every consumer (`make consumers-check`, B2.391) catches these mismatches
  when it compiles.
- **CK-100** A case value is a value of the type of its place (T-1), at every place where a case gives one: an
  argument, the result, an item of a list (also the value of its repeat form `{"kind": "list", "value": ...}`), a part
  of a tuple, an entry of a map or keyed map, the value of an optional, and a field of a record or of the case of a
  variant that its tag names. At a place of `uint` it is an integer that is not negative, of `int` an integer, of
  `int64` an integer of the range of i64, of `float` a number, of `bool` a bool, and of `text` or `latin1` a text;
  `binding check` reports any other value with the case, the place, the value and the type. A value in an object form
  (`{"float": ...}`, `{"ill_formed": ...}`, a service value, a composed text) is judged by the rule of its form
  (GN-13bc, GN-13j, GN-13l). A value anywhere inside an argument (the argument itself, the value of its optional, an
  item, an entry or a field inside it) may be outside its type in a case that raises the kind `invalid_number` or
  `invalid_argument_type`: the binding refuses such a value with that kind before the core runs, at every place of an
  input, the dynamic targets give it as its JSON kind and Go writes no test of the case (GN-13w), so the case is the
  one test of that refusal. A result, and an argument of a case that raises another kind, stay reported, because a
  target writes them as literals of their type. Why: the crud-ui generator
  case `list-options-ignored` gave the field `total` of `ListOptions`, an `optional` of `uint`, the value -1;
  `binding check` passed it, and the Go test held `ptr(uint64(-1))`, which `go vet` refused as a constant that
  overflows `uint64`. A value outside its type at a place that a target writes is a defect of the case, and the
  check names it before a target fails to build. The allowance holds inside an argument as at the argument itself
  because session-store refuses `-1`, `1.5`, `"60"` and `true` in the uint fields `lifetime` and `lock_expire` of the
  record argument `options` of `redis_sessions.new` with `invalid_number`; a check that took the top level alone
  would refuse the one test of that refusal of the binding.
- **CK-104** A value alias with a row, in or out, whose `when.predicate` is `sequence_keys` states the key form that
  the predicate means, `"sequence_keys": {"keys": "text"}` or `{"keys": "int"}`: `text`, the keys are the texts `"0"`
  to `"n-1"` in order; `int`, the ints `0` to `n-1` in order. The empty map has sequence keys under both. An alias
  that has such a row and no statement is refused, with the alias and the row; there is no default. The generator
  judges `sequence_keys` of a case map by the stated form (GN-13e). Why: the core computes the predicate from its own
  keys, and the generator guessed it from the shape of the case keys, as ints. orm's core means the texts
  (`orm_value.rs` compares a key with the text of its position), so its maps with the keys `"0"`, `"1"` were judged
  without sequence keys: the PHP test of `codec.decode` / `sequence_map_kind` expected a bare map where the core gives
  the `map_value` of the row, and `map_value.constructor` / `kinds` and `map_value.entries` / `kinds` gave the value
  as a bare array, which PHP reads as a list, since PHP turns the key `"0"` into the int `0` (B2.490). A default
  would be that guess, wrong for orm and template and passing silently.
- **CK-103** A `{computed}` default has a case that leaves it to the core (U-2, generator GN-13d): for each public
  member of a public unit that takes a parameter with a `{computed}` default, or a record of this contract (also as
  an `optional`) with a field that has one, the contract has a case of that member that names no `raises`, arms no
  fault (no `faults`, and no fault in a call of `then` of its instance values) and leaves that parameter or field to
  the core: the key is missing or null, or, for a field, the record is missing or null or has no such key or null
  under it. `binding check` reports each parameter and field without such a case, with the member, the place and the
  rule id of the default. A member of a callback unit, of a host unit and of an error unit, and a constant, are not
  asked, as in CK-22. A member whose only cases are steps of a function fixture or calls of `after` is reported: the
  case is a case of the member itself. Why: a `{computed}` default is a value that the core makes at the call, such
  as the random key of a new row of crud-ui (`Form.addRow`), so the test of U-2 compares no value of it and only the
  outcome of the two calls (GN-13d). The proof of what the core makes is then the case of the rule that the default
  names; without this check a declaration of `{computed}` would switch the test of the default off and put nothing
  in its place.
- **CK-23** Reserved words (N-2): the name that a target language gives a public or internal unit (GN-6r), a member, a parameter or a field is
  not a word that the language reserves where the binding writes the name: PHP its keywords and built-in type names,
  case-insensitively, for a class and a function (a method, a property and a variable may take them); Python its
  keywords everywhere; JavaScript (Node, WASM) its reserved words and `eval` and `arguments` for a class, a function
  and a parameter (a property may take them). Go capitalizes every name, which no keyword is, and the generated Rust
  escapes a keyword. A naming exception (N-3) gives the language another name, and the check accepts the name that it
  gives; the generator does not generate a naming exception yet, so the finding names the remedy that works with it:
  rename the unit, the member, the parameter or the field in the contract.
- **CK-20** One release (L-2): the repository's `Cargo.lock` pins exactly one `polyspec-binding-core`, of the version
  of the running binding, because one release gives the CLI (npm package `@polyspec/binding`, bin `binding`) and the
  crate and the generated code is written for that crate; no `Cargo.lock`, no pin or another version is a finding.
  A git dependency is also pinned at the commit of the running binding: the commit that `git archive` wrote into
  `packages/ts/archive-commit` of a tree that it wrote (the attribute `export-subst` of `.gitattributes`; a checkout keeps
  the placeholder `$Format:%H$`), the HEAD of its checkout, or the commit that the npm lock of the project that
  installed it from git resolved; another commit is a finding. A binding that knows none of these commits is the npm
  archive of a release (`polyspec-binding-X.Y.Z.tgz` of the GitHub Release), which carries no commit, and the release of
  the version X.Y.Z is the annotated tag `vX.Y.Z`, which no step moves: a Git source that names the tag `v<version>` of
  the running binding (`?tag=vX.Y.Z`) is then its commit, and any other source is a finding.
- **CK-109** The line of the core on `polyspec-binding-core` (generator GN-3e): a line of the core's manifest on
  `polyspec-binding-core` that names a tag, by itself or by the line of `[workspace.dependencies]` that it inherits,
  names the tag `v<version>` of the version of the running binding, the version of its package. That is the version of
  a release generator and of a development generator alike: between two releases the manifests of a checkout hold the
  last released version, so a development generator compares a tag with that version as well, and CK-20 compares its
  commit. A tag of another version is a finding that names the line, the version of its tag and the version of the
  binding. A line without a tag is no finding of CK-109 (CK-70 reports a branch in a release), and a core without the
  line is none, because scaffold then writes the line of the generator itself. The migration is to change the line of
  the core and run `make bindings` again. Why: scaffold copies the line into each binding crate, so a core on the tag of
  an older release kept that core runtime under a newer generator, or its binding crates were edited by hand, which
  CK-19 then reported (B2.503).

## Tables of binding

These closed sets are binding's own; the Rust names are those of `binding_core` (`docs/core-api.md`).

- Acronym words of a repository name (P-1, E-2, N-2): `api`, `crud`, `csrf`, `css`, `fsm`, `html`, `http`, `id`, `io`,
  `json`, `orm`, `php`, `sql`, `ui`, `uri`, `url`, `xml`. A new acronym of a repository name is added to this table
  (`LIBRARY_ACRONYMS` in `packages/ts/src/names.ts`), the one place that holds it.
- Value kinds: `null`, `bool`, `int`, `int64`, `float`, `number`, `text`, `text16`, `bytes`, `list`, `map`, `object`,
  `reference`, `safe_text`, `native`, `nested:json_value`, `nested:template_value`, `nested:php_value` (`ValueKind`). `int` and
  `int64` have the forms of the contract types of the same names (Node `number` and `bigint`, T-1). `text16` is a text
  as UTF-16 code units, unpaired surrogates included, which a value class gives and makes by a member that reads or
  takes a list of `uint` (GN-6x); no built-in form makes it, because the string of PHP and Go cannot hold an unpaired
  surrogate.
- Predicates and their kinds: `utf8` (bytes), `sequence_keys` (map), `safe_integer` (int and float), `integral_float` (float)
  (`Predicate`). A row writes `when: {predicate, is}`.
  For float, `safe_integer` is true exactly for finite integral
  values in the inclusive range ±(2^53−1), including negative zero. An ordered incoming case list is sound only
  when every branch consistent with the outgoing row classifies the value as its outgoing kind. An unknown
  applicable predicate may take either branch; an uncovered branch or different resulting kinds fail CK-8. A predicate
  outside the kind's domain remains refused. In particular,
  `safe_integer=false` leaves `integral_float` unknown: both a fraction and 1e16 satisfy the former condition.
- Built-in forms and the language type each makes:

  | Form | php | python | node, wasm | go |
  |---|---|---|---|---|
  | `null` | `null` | `None` | `null` | `nil` |
  | `bool` | `bool` | `bool` | `boolean` | `bool` |
  | `int` | `int` | `int` | `number` | `int64` |
  | `bigint` | none | `int` | `bigint` | none |
  | `float` | `float` | `float` | `number` | `float64` |
  | `text` | `string` | `str` | `string` | `string` |
  | `bytes` | `string` | `bytes` | `Uint8Array` | `[]byte` |
  | `list` | `array` | `list` | `Array` | `[]any` |
  | `map` | `array` | `dict` | `Map` | `map[string]any` |
  | `keyed_map` | `array` | `dict` | `Map` | `*KeyedMap[any]` (GN-15) |
  | `php_object` | `stdClass` | none | none | none |
  | `php_reference` | `reference` | none | none | none |
  | `native` | `object` | `object` | `object` | `any` |

  `keyed_map` is written `{keyed_map: {key: [...]}}` with the key kinds it mixes (`int`, `bytes`, `text`, U-7 (c)).

  The built-in types an `in` row may name are the types of this table. The contract type `keyed_map<T>` is written
  `{keyed_map: T, key: [...]}` (T-2).
- `types` names the owner of each value type the contract uses: `{library, unit}` for `json_value`, `template_value`
  and `php_value`; `host_value` belongs to binding (T-2).
