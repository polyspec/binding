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

`binding check <interface.json> --release` also runs the check of a release, CK-70. The tool that builds a release
passes the option; a check without it does not run CK-70, because a development checkout holds the development forms
that a release may not hold.

## Checks

The schema is part of the npm package `@polyspec/binding` and is exported as `./schema/interface.schema.json` (S15).

- **CK-1** Schema: the contract passes `packages/ts/schema/interface.schema.json` (JSON Schema 2020-12, Ajv). Every reason is a rule
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
  `library` names no `/` (GN-7c). A variant
  of `kinds`, `raises` and `in_raises` is a Rust path or the nested path `<outer>/<inner>` of GN-7c, and `errors.code`
  names the core error type and its projection to the code enum of the kinds (`{error, path}`, generator GN-7b); whether
  they name a variant, a type and a function of the core is judged by the compiler on the generated crate (I-2).
- **CK-11** Wrapped dependency errors (E-1b, P-4): every property of every error unit of a library whose kinds the
  contract passes on (`library`, E-1b (a)) or holds as the source of its own kinds (`source`, E-1b (b)) has one
  `wrapped` row; `forward` names an error unit with a property of the same name and type; a row
  that matches no property is refused.
- **CK-12** Record parameters (T-4): a member takes at most one record, as its last parameter; in PHP and Python the
  record's field names, after conversion and exceptions, differ from the member's other parameter names.
- **CK-13** Go names (E-7, P-2): an error unit's Go name is not a category error type (`ValueError`, `TypeError`,
  `IoError`, `StoreError`, `BusyError`, `InternalError`); in one Go package (a module), the type names, the functions of
  `functions` units, the `New<Unit>` constructors, the functions `<Class><Member>` of static members, and the functions
  `<Class>Handle`, `<Class>FromHandle` and `Dispatch<Callback>` that another module reaches a unit through (GN-15a)
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
  (docs/spec/generator.md GN-3a) with what `binding scaffold` writes; a missing or different file is a finding. For
  a host package (L-2a, GN-3b) it reads only the items of the host's manifest that the native module and its release
  need, and names each item that is missing or differs with the value it must have.
- **CK-21** The build of the core, exclusive members and the result of a core path (I-1, U-6, E-1c): `core.features`
  names targets only; `exclusive` is on a member with the receiver `&self` of a generated class only. A member whose
  `core.result` is `false` has no `raises` and no parameter that holds a callback or a function, because a core that
  returns no `Result` has no variant to return and no place for the failure of a callback; without `core.result`, a
  core path returns a `Result` when `raises` names a variant of the contract's own core error or a parameter is a
  callback or a function. Whether `core.result` is true of the core is judged by the compiler on the generated crate
  (I-2), not here. `core.failure: true` is on a member whose receiver unit holds language code (GN-6h), because no
  other member reaches language code that can fail; `core.failure: false` is on no member with a parameter that holds
  a callback or a function, and a member with `core.result: false` has no `core.failure: true`, because the failure of
  language code is returned in a `Result` as `Failure<E>`. A function type (T-2) states `async_allowed` and
  its `recognize` names error units, as a callback member does (CK-17).
- **CK-63** The WASM core (GN-4b): `core.features.wasm` names none of the features of platform I/O, `fs`,
  `blocking-io`, `process` and `net`.
- **CK-64** An integer of a case at a place of the type `int` or `uint` (an argument, an item of a list, tuple,
  map or optional of it, and the result) is a safe integer, the range of T-1 that every target gives (a Node
  `number`). A larger integer is an `int64` in one target and no `int` in another, so the case would expect two
  results; a member that takes or gives the range of i64 declares `int64` (GN-12a).
- **CK-65** A core with fault injection points (`faults`, G-5) has itself as a dev-dependency with `fault-test`,
  `<core crate> = { path = ".", features = ["fault-test"] }` in the `[dev-dependencies]` of its manifest, so that
  `cargo test` of the core without flags arms its points; `binding check` reports the core manifest otherwise
  (GN-5).
- **CK-70** The dependencies of a release (generator GN-3e), run by `binding check --release` alone: the dependency
  line of the core on each `polyspec-<library>` whose types the contract names or whose fault injection points a case
  arms names the version `=X.Y.Z` or the tag `vX.Y.Z` and no branch or commit, and so does the dependency line on
  `polyspec-binding-core` of the core, when it has one, and of each tracked binding crate. A development form (a path, a branch, a
  commit, a version range) is a finding that names the manifest of the line, the crate and the form, because the manifests
  that `scaffold` writes from it name no version of a release (`go.mod` `v0.0.0`, a dependency of
  `pyproject.toml` without a version). It is a check of its own and no
  part of CK-19: the tracked files of a development checkout are what `scaffold` writes, so CK-19 passes them, and the
  question of CK-70 is what a release may hold.
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
- **CK-22** Every member names its cases (K-1): each public member, other than a constant, of a public unit that is
  not an error unit, a callback interface (U-3) or a host unit (L-2a) is the `member` of at least one entry of
  `cases`; G-5 then fails the e2e when the file or group of that entry leaves the member out. `binding check` also
  reads the case files: every group that `cases` names is in its file, and a member has a case that raises each kind
  that the rows of its `raises` give. The `cases` row of a member may name `result`, the snake_case key of its cases
  that holds the result of the member (GN-13e); a row without it reads the key `result`, and the row of an alias has
  none (CK-1). The `receiver` of a case and an argument of a class type may be an instance value of GN-13f: its member exists and
  gives the class, through its `pick`; a method has its `receiver`; `args` are the parameters of the member; each call
  of `then` is a method of the class, or, with `"on": "receiver"`, a method of the class of the `receiver` of a value
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
  such a symbol. A kind of the category `internal` needs no case of each member (X-1), because the match that maps the
  core error is one for every member: each error enum that has such a kind, the contract's own and that of each
  library whose kinds it passes on (E-1b (a)), has one case of any member that arms `<library>.internal` as `broken`
  and raises a kind of the category `internal`. The kinds of `in_raises` of a value alias have their cases in the
  group of a `cases` row that names the alias (U-7), a group that no row of a member names: such a case is
  `{"id", "value", "raises"}` (and `note`, `rule`) whose `raises.kind` is a kind of `in_raises`, and every kind of
  `in_raises` has one. A case of a member that takes a callback interface as a parameter gives it as a callback fixture (G-5, GN-13):
  `{"callback": {<member id>: [<row>]}}` whose member ids are members of that interface, whose rows and `calls` give
  in `args` exactly the parameters of their member, and whose rows have no key but `args`, `result`, `raise`, `once`
  and `async`; a row with a `result` and a `raise`, a `raise` of an error unit that the member does not recognize
  (U-3), an `async` row of a member without `async_allowed`, and a row of a member that takes an object of the
  language (a class, a callback, a function, a host value), which a row cannot give, are reported. The same holds at
  every other place of a callback interface: a field of a record, an item of a list and an `optional`, where an
  instance value (GN-13f) of a class of the contract that `implements` the interface may stand for the fixture. A
  value of a function type is `{"function": [<row>]}`, whose rows have no key but `args`, `result` and `once` and
  give in `args` the positions of the parameters, `"0"`, `"1"` and so on; a function that takes an object of the
  language has no row.
- **CK-23** Reserved words (N-2): the name that a target language gives a public or internal unit (GN-6r), a member, a parameter or a field is
  not a word that the language reserves where the binding writes the name: PHP its keywords and built-in type names,
  case-insensitively, for a class and a function (a method, a property and a variable may take them); Python its
  keywords everywhere; JavaScript (Node, WASM) its reserved words and `eval` and `arguments` for a class, a function
  and a parameter (a property may take them). Go capitalizes every name, which no keyword is, and the generated Rust
  escapes a keyword. A naming exception (N-3) gives the language another name.
- **CK-20** One release (L-2): the repository's `Cargo.lock` pins exactly one `polyspec-binding-core`, of the version
  of the running binding, because one release gives the CLI (npm package `@polyspec/binding`, bin `binding`) and the
  crate and the generated code is written for that crate; no `Cargo.lock`, no pin or another version is a finding.
  A git dependency is also pinned at the commit of the running binding: the commit that `git archive` wrote into
  `packages/ts/archive-commit` of a tree that it wrote (the attribute `export-subst` of `.gitattributes`; a checkout keeps
  the placeholder `$Format:%H$`), the HEAD of its checkout, or the commit that the npm lock of the project that
  installed it from git resolved; another or an unknown commit is a finding.

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
- Predicates and their kinds: `utf8` (bytes), `sequence_keys` (map), `safe_integer` (int), `integral_float` (float)
  (`Predicate`). A row writes `when: {predicate, is}`.
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
