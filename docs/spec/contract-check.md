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
  type that a type names (`json_value`, `template_value`, `php_value`) has its owner in `types` (T-3).
- **CK-4** Naming exceptions (N-3): the exception names a target, an existing unit, member of that unit, parameter of
  that member or field of that record; one exception per symbol and language; and the exception differs from the
  converted name (N-2), since an exception that changes nothing has no ground.
- **CK-5** Optional returns and fields (T-5, T-4): a member that returns `optional<T>` has `optional_reason`, and only
  such a member; a record field of type `optional<T>` has a `reason`, and only such a field.
- **CK-6** Cycles (P-4): `implements` and error `parent` form no cycle.
- **CK-8** Value units (U-1, U-7):
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
    whose `is` is known only at run time, the row's kind names exactly one case. A check that passes when any case
    matches is not used, because it passes a wrong classification; the generated round-trip test of G-5 remains;
  - only a property of a `value` unit is `writable` (U-2).
- **CK-9** Units of other repositories (T-3): a unit of another library in a type is a `value`, `callback`, `enum`,
  `record` or `variant` unit of that library's contract; a callback, record or variant of another library uses only
  units of its own library, checked recursively; a value type in `types` names a `value` unit of its owner.
- **CK-10** Errors (E-1, E-1a, E-2, U-1): an error unit has a category and only an error unit has a category or a
  parent; a parent is an error unit of the same category and not `final`; `errors.classes` has a class for every
  category in every target but Go, whose category types E-7 fixes; a category class is named `<Library><Category>Error`,
  where `<Library>` is the repository name in the class form of each language (N-2: an acronym word is one capital
  word in PHP and Node and all capitals in Python and Go, so `HttpCookieValueError` and `HTTPCookieValueError`; the
  acronym words of a repository name are binding's table, below), and a PHP class is in the namespace of
  `packages.php`; `errors.fixed` has no Go row (G-7 is a compile
  error in Go); a `class` override in `kinds` or `binding` is an error unit of the kind's category (a dependency kind
  takes its category from the dependency's contract, E-1b); a variant or a binding kind is declared once.
- **CK-11** Wrapped dependency errors (E-1b, P-4): every property of every error unit of a library whose kinds the
  contract passes on (`library`, E-1b (a)) or holds as the source of its own kinds (`source`, E-1b (b)) has one
  `wrapped` row; `forward` names an error unit with a property of the same name and type; a row
  that matches no property is refused.
- **CK-12** Record parameters (T-4): a member takes at most one record, as its last parameter; in PHP and Python the
  record's field names, after conversion and exceptions, differ from the member's other parameter names.
- **CK-13** Go names (E-7, P-2): an error unit's Go name is not a category error type (`ValueError`, `TypeError`,
  `IoError`, `StoreError`, `BusyError`, `InternalError`); in one Go package (a module), the type names, the functions of
  `functions` units and the `New<Unit>` constructors are distinct. Host units are not counted, because their Go code is
  a package of its own (L-1).
- **CK-14** Modules (L-1): the first segment of a module is not `host` or `tests`, the folders of hand-written Go code,
  nor `internal`, the folder of the C ABI layer of the Go binding (GN-15). The empty module is the root of the package
  (P-2).
- **CK-15** WASM (Q-4): when `wasm` is a target, a member whose parameters, return or yields contain `path` (through
  records and variants too) or whose wait is `blocking_io` or `process_wait` has an `only` without `wasm`, on itself or
  on its unit, with its rule id.
- **CK-16** Python awaitables (N-5, U-3): the name `a<name>` of a member whose wait is not `none`, or of a callback
  member with `async_allowed: true`, is not the Python name of another member of the unit.
- **CK-17** Callbacks (U-3, T-3): only callback members have `async_allowed` and `errors`, and every callback member
  states `async_allowed`; `recognize` names error units; a generated class of this contract that implements a callback
  of this contract with a member whose wait is not `none` makes the callback member of the same name
  `async_allowed: true`.

- **CK-18** Package names (P-1): the core crate is `polyspec-<library>`; Composer `polyspec/<library>`, the PHP
  namespace `Polyspec\<Repository>`, PyPI `polyspec-<library>`, the Python root `polyspec.<repository with _>`, npm
  `@polyspec/<library>`, where `<Repository>` is the repository name in the PHP class form. A core at
  `packages/<component>/rust` (L-1) is the library `<repository>-<component>`, whose namespace and module are below the
  repository's: `Polyspec\CrudUi\Validator`, `polyspec.crud_ui.validator`.

- **CK-19** Tracked binding packages (L-2): `binding check` compares each tracked file of the binding packages
  (docs/spec/generator.md GN-3a) with what `binding scaffold` writes; a missing or different file is a finding.
- **CK-20** One release (L-2): the repository's `Cargo.lock` pins exactly one `polyspec-binding-core`, of the version
  of the running binding, because one release gives the CLI (npm package `@polyspec/binding`, bin `binding`) and the
  crate and the generated code is written for that crate; no `Cargo.lock`, no pin or another version is a finding.

## Tables of binding

These closed sets are binding's own; the Rust names are those of `binding_core` (`docs/core-api.md`).

- Acronym words of a repository name (P-1, E-2, N-2): `api`, `crud`, `csrf`, `css`, `fsm`, `html`, `http`, `id`, `io`,
  `json`, `orm`, `php`, `sql`, `ui`, `uri`, `url`, `xml`. A new acronym of a repository name is added to this table
  (`LIBRARY_ACRONYMS` in `packages/ts/src/names.ts`), the one place that holds it.
- Value kinds: `null`, `bool`, `int`, `int64`, `float`, `number`, `text`, `bytes`, `list`, `map`, `object`,
  `reference`, `safe_text`, `native`, `nested:json_value`, `nested:template_value`, `nested:php_value` (`ValueKind`). `int` and
  `int64` have the forms of the contract types of the same names (Node `number` and `bigint`, T-1).
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
  | `keyed_map` | `array` | `dict` | `Map` | none |
  | `php_object` | `stdClass` | none | none | none |
  | `php_reference` | `reference` | none | none | none |
  | `native` | `object` | `object` | `object` | `any` |

  `keyed_map` is written `{keyed_map: {key: [...]}}` with the key kinds it mixes (`int`, `bytes`, `text`, U-7 (c)).

  The built-in types an `in` row may name are the types of this table. The contract type `keyed_map<T>` is written
  `{keyed_map: T, key: [...]}` (T-2).
- `types` names the owner of each value type the contract uses: `{library, unit}` for `json_value`, `template_value`
  and `php_value`; `host_value` belongs to binding (T-2).
