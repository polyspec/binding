<!-- doc-id: contract-check -->
# Contract check

[한국어](contract-check.ko.md)

`checkContract(contract, { dependencies })` of `packages/ts` judges every rule of an interface contract that the Rust
compiler cannot judge (design I-2) and every rule that the design gives to the contract check. A contract with a
finding is refused. Each finding names one check id below, the JSON pointer of the item and the rule. `dependencies`
holds the contracts of the libraries the contract names (T-3, E-1b), which bindgen reads from the packages that Cargo
resolved; a check that needs a missing one reports it.

The schema and the todo checks run first; the other checks run only on a contract that passes both, because they read
its shape.

## Checks

The schema is part of the npm package `@polyspec/bindgen` and is exported as `./schema/interface.schema.json` (S15).

- **CK-1** Schema: the contract passes `packages/ts/schema/interface.schema.json` (JSON Schema 2020-12, Ajv). Every reason is a rule
  id (`^[A-Z][A-Za-z]*-?[0-9]+[a-z]?(\.[0-9]+)*$`), so a reason in prose, such as "the current name", is refused (N-3,
  P-10). A `native` entry without its `reason` is refused (I-3). A callback member's `errors` is only
  `{recognize, reason}` (U-3).
- **CK-2** Todo: a `"todo"` string or an object with a `todo` key, which `bindgen import` leaves, fails the contract
  (M-2). A schema error at or around a todo is not reported separately.
- An `alias` unit (U-7 (a)) names the union `of` two or more types; it has no members.
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
- **CK-8** Value units (U-1):
  - an `in` row names a target and a language type that is either a built-in type of the table below or a `value` unit;
    one row per language and type;
  - with `by`, `by` is a public member that returns an `enum` unit of the contract, every case has `is`, and every value
    of the enum is the `is` of exactly one case; without `by`, the row has one case and no `is`;
  - a case of a `value` unit type names `read`, a public member; a case of a built-in type has `read: builtin`, because
    bindgen reads built-in values itself (U-7 (e));
  - an `out` row makes a value in every target; `make` is a built-in form that the language has, or a public
    `constructor` or `static` member of a `value` unit;
  - `when` names a predicate of the row's kind, or is `else`; the rows of one kind are one row without `when`, or two
    rows with the same predicate, one `is: true` and one `is: false`, or rows with distinct predicate values and one
    `else` row for the rest (U-7 (b));
  - round trip (P-3): the language type that a `make` produces has an `in` row in that language, and that row
    classifies it as the row's kind: exactly, for a row without `by`; as one of its cases, for a row with `by`, whose
    `is` is known only at run time, which is why the generated round-trip test of G-5 remains the proof;
  - a `make` of `{value: X}` belongs to a row of kind `nested:X`, and a row of kind `nested:X` makes every value with
    `{value: X}`; the owning repository's contract proves the round trip of such a value;
  - only a property of a `value` unit is `writable` (U-2).
- **CK-9** Units of other repositories (T-3): a unit of another library in a type is a `value`, `callback`, `enum`,
  `record` or `variant` unit of that library's contract; a callback, record or variant of another library uses only
  units of its own library, checked recursively; a value type in `types` names a `value` unit of its owner.
- **CK-10** Errors (E-1, E-1a, E-2, U-1): an error unit has a category and only an error unit has a category or a
  parent; a parent is an error unit of the same category and not `final`; `errors.classes` has a class for every
  category in every target but Go, whose category types E-7 fixes; a category class is named `<Library><Category>Error`
  (ending in the category's `<Category>Error` and longer than it), with the same name in every language, and a PHP class
  is in the namespace of `packages.php`; `errors.fixed` has no Go row (G-7 is a compile
  error in Go); a `class` override in `kinds` or `binding` is an error unit of the kind's category (a dependency kind
  takes its category from the dependency's contract, E-1b); a variant or a binding kind is declared once.
- **CK-11** Wrapped dependency errors (E-1b, P-4): every property of every error unit of a library whose kinds the
  contract wraps has one `wrapped` row; `forward` names an error unit with a property of the same name and type; a row
  that matches no property is refused.
- **CK-12** Record parameters (T-4): a member takes at most one record, as its last parameter; in PHP and Python the
  record's field names, after conversion and exceptions, differ from the member's other parameter names.
- **CK-13** Go names (E-7, P-2): an error unit's Go name is not a category error type (`ValueError`, `TypeError`,
  `IoError`, `StoreError`, `BusyError`, `InternalError`); in one Go package (a module), the type names, the functions of
  `functions` units and the `New<Unit>` constructors are distinct. Host units are not counted, because their Go code is
  a package of its own (L-1).
- **CK-14** Modules (L-1): the first segment of a module is not `host` or `tests`. The empty module is the root of the
  package (P-2).
- **CK-15** WASM (Q-4): when `wasm` is a target, a member whose parameters, return or yields contain `path` (through
  records and variants too) or whose wait is `blocking_io` or `process_wait` has an `only` without `wasm`, on itself or
  on its unit, with its rule id.
- **CK-16** Python awaitables (N-5, U-3): the name `a<name>` of a member whose wait is not `none`, or of a callback
  member with `async_allowed: true`, is not the Python name of another member of the unit.
- **CK-17** Callbacks (U-3, T-3): only callback members have `async_allowed` and `errors`, and every callback member
  states `async_allowed`; `recognize` names error units; a generated class of this contract that implements a callback
  of this contract with a member whose wait is not `none` makes the callback member of the same name
  `async_allowed: true`.

## Tables of bindgen

These closed sets are bindgen's own; the Rust names are those of `bindgen_core` (`docs/core-api.md`).

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

  `keyed_map` is written `{keyed_map: {key: [...]}}` with the key kinds it mixes (`int`, `bytes`, `text`, U-7 (c)).

  The built-in types an `in` row may name are the types of this table.
- `types` names the owner of each value type the contract uses: `{library, unit}` for `json_value`, `template_value`
  and `php_value`; `host_value` belongs to bindgen (T-2).
