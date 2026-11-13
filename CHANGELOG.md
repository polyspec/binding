<!-- doc-id: changelog -->
# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- A case value of the language that is no value of a value type is `{"host": <sort>}` of a closed table (G-5, GN-13):
  `callable`, `date` and `object`, which Python makes as `lambda: None`, `datetime.date(1970, 1, 1)` and `object()`,
  Node and WASM as `() => null`, `new Date(0)` and `new (class Other {})()`, and PHP as `static fn (): null => null`,
  `new \DateTimeImmutable('@0')` and `new class {}`; the specification gives Go `func() {}`, `time.Unix(0, 0).UTC()`
  and `struct{}{}`, whose tests of the kinds of an alias stay refused by name (U-7). A PHP case value with an integer
  outside 64 bits runs through the entry point of the feature `case-test` as the decimal token
  (`HostValue::Number`), for the cases of an alias as for those of a member. Before, a case `{"host": ...}` of an alias
  refused the generation of every target, and PHP refused the generation for an integer outside 64 bits, so the cases
  of such an alias were in no generated test. Verified by `make test-ts` (274 tests).
- The case convention (G-5) gives an object an identity, a reference a place inside its own value and an object nested
  deeper than a JSON reader takes a form: a `reference` holds `{"id": n, "value": ...}` at the first place of its id
  and `{"id": n}` at every later place; an `object` with `"id": n` is named at a later place by
  `{"kind": "object", "id": n}`; `{"kind": "object", "repeat": n, "key": <key>, "value": <value>}` is n objects,
  each the one property `key` of the one around it. Before, a case of a stdClass held twice, of a reference cycle or
  of the deepest objects that PHP reads had no value. A generated case value makes each id once without content and
  fills it after, in a PHP closure, a Python tuple of assignment expressions or a Node and WASM arrow function, so a
  later place inside the first makes a cycle; a repeated object is made from the outermost in, so no constructor
  judges the objects inside it again, and from the innermost out with `(object)` in PHP. A case-test entry point
  reserves the handle of an object with an id before the value and describes a later place of a reference by its
  identity. A later place that repeats the value of its id is refused by name. Verified by `make test-ts` (273 tests).
- A case value of Python, Node and WASM made a new instance of the class of a reference (GN-6m) at each place of a
  reference, so two places of the same id held two references, and `serialize` wrote two values where the case names
  one shared reference (G-5: the same id is the same reference). The value now makes one instance per id, before the
  value that holds it, in an expression that names each instance: `(r0 := pkg.Reference(...), [r0, r0])[-1]` in
  Python and `(() => { const r0 = new pkg.Reference(...); return [r0, r0]; })()` in Node and WASM. Verified by
  `make test-ts` (273 tests).
- The generated tests of Python, Node and WASM held no test of a value class without `core_type` (GN-6m): its
  constructor and its properties were absent from the members that the tests call, so their cases ran in no target.
  They now have the tests of the members of a class (GN-13): B-4 for each case that raises, GN-13e for each other
  case, with a property read on an instance that the constructor makes from the case's keys and compared with the
  value written as the argument was, since the property gives the value of the language that the constructor was
  given (an int of Node stays a number), and the tests of their parameters, G-7 among them. A primitive (N-4, `valueOf` of Node and WASM) has a test for each case that does not
  raise, which compares `Number(instance)` with the case's `result` by `assert.strictEqual`, or takes the number form
  alone when the case gives no `result`; before, its cases ran nowhere. A case float `-0` is written as a negative
  zero (`-0`, `-0.0`); before, it was written as `0`. The test that an explicit null is refused is not written for a
  parameter whose default is `{literal: null}`, whose declared value is that null (GN-13d). Verified by
  `make test-ts` (272 tests).
- The PHP test of a case whose value is a reference that is no place of an array or of a property, such as the top
  value of `serialize`, failed with `self::fail`, because no PHP call can give that value, so the refusal of the core
  was never run in PHP. Such a case now runs through the entry point `<namespace>\Internal\caseTest<n>` of the feature
  `case-test`, which makes the value as the host values that PHP would describe and gives them to the `in` function of
  the alias; the test requires the class and the kind of the case. binding scaffold writes `case-test = []` into the
  PHP crate of a contract with such a case, and the end-to-end check requires with `llvm-nm` that the extension built
  without features holds no such entry point and the one built with them holds it (GN-13, GN-5). Go, whose case of an
  argument of another kind needs the same entry point in its C ABI, is generated by the Go generator. Verified by
  `npm test` in `packages/ts`.
- The PHP extension panicked when a class of PHP that a library class extends was missing ("B-4: the class {name} is
  missing") and when a library class was not registered, so a repository that denies `clippy::panic` failed its
  clippy of the bindings. Startup now finds every class of PHP that a library class extends or implements before it
  registers anything, and a missing one fails the start of the module (GN-10). The entry points of the panic test of
  every target, which panic on purpose, carry `#[allow(clippy::panic)]` with the reason B-7, so the deny holds for
  every other item (GN-5). Verified by `npm test` in `packages/ts` and by clippy of the binding crates of
  php-serialization with the features `panic-test` and `fault-test`.
- A unit with `only` and a class of origin `value` without `core_type` were refused ("only and native are not
  generated yet"), so a contract whose value alias makes such classes, as php-serialization's `StdClass` and
  `Reference`, generated no target. A unit with `only` is now generated for the targets that it lists only. Python,
  Node and WASM generate the class as a class of the language that keeps the values it was given: its constructor
  calls the core's check function on the described arguments, a writable property sets its value, the in row of the
  alias describes an instance with an identity per walk and `read` gives its kept value, and the out row makes the
  instance before its content. The primitive hook of a class is `valueOf` in Node and WASM (GN-6g). The PHP binding
  now makes the form `php_reference` as a reference, makes `php_object` from property names of any bytes, makes a
  bytes array key, and gives an object and a reference one value at every position of its handle, cycles included.
  A PHP case value with references is made in a closure, and a case whose reference has no PHP place fails its test
  with the reason instead of refusing the target (GN-6m, GN-13). A property of a class without a lock is read without
  one, a large integer is made as a BigInt of napi 3, and the generated Node and PHP code holds no `thrown` function
  and no `Thrown::Php` variant when the contract has no callback, which `-D warnings` refused as dead code. Verified
  by `npm test` in `packages/ts` and by clippy of the four binding crates of php-serialization.
- The generator refused an error unit of a module other than the root for every target. It now generates it: PHP
  registers the class in the namespace of its module, Python gives it from `<root>.<module>` and `<root>`, and Node and
  WASM export it by its name (GN-7a, GN-11). The error unit `utf8_error` of tests/e2e/shapes is in the module
  `errors`, so the end-to-end check raises it through each target.
- A record parameter with the default `{empty: "object"}` was refused for every target ("a default of a record
  parameter is not generated yet"), so a contract with one, such as `parse(source, options = {})`, generated no
  target. Such a parameter is generated when every field of the record has a default: the core takes the record with
  every field `None`, Python and PHP leave out the keywords and named arguments of the fields, and Node and WASM take
  the options record as a trailing argument that may be missing or `undefined`; a record with a field without a
  default is refused by name (GN-6i). `tests/e2e/shapes` has the member `shapes.wrap` of this form. Verified by
  `npm test` in `packages/ts` and `make e2e` of `tests/e2e/shapes`.
- The Makefile had no target for the unit tests, so the tests of packages/ts and of binding_core ran only as commands
  of their packages. `make test-ts` type-checks packages/ts and runs its tests, `make test-rust` tests binding_core
  with all features and with none, `make lint-rust` runs clippy in both forms and checks the format, and `make check`
  runs the three to their end and names each failed one.
- `binding generate` ended a refused target, after it had written the other targets, with the usage line and status 2,
  as if the command line were wrong, so a repository could not tell the refusal from a usage error. A refusal, a core
  manifest that is not the crate of the contract and a failed `cargo metadata` now end with status 1 and no usage
  line; only an error of the command line prints the usage with status 2 (GN-1c).
- A fault injection point was judged by the feature `fault-test` of binding_core, which Cargo unifies across a build,
  so one core with `fault-test` turned on the points of every core: a binding crate that left
  `polyspec-<library>/fault-test` out of its feature passed the cases that arm the points of that library. A point
  is now the macro `fault::point!`, which is judged by the feature `fault-test` of the crate that writes it, and
  `tests/point.rs` builds two cores and a binding that turns on the feature of one of them (GN-5). A core writes
  `binding_core::fault::point!(NAME)` in place of `binding_core::fault::point(NAME)`.
- A member that raises and takes a function, or a callback inside another type, was reported as waiting for a case
  form, so its kinds had no case (CK-22). A case gives a function as `{"function": [<row>]}`, whose `args` are the
  positions of its parameters, and a callback at any place of a callback type as its fixture, or as an instance value
  of a class that implements the interface; `binding check` judges each as it judges a fixture (CK-22, GN-13). The
  generator still refuses a function type and a callback inside another type by name (GN-13a). Verified by `npm test`
  in `packages/ts`.
- A call of `then` in an instance value that fails stopped the test as a failure of its preparation, so a kind that
  only an instance after a failed call reaches, such as a failure that a body gives again, had no case. A call of
  `then` may name `"raises": {"kind": <kind>}`, a kind of its member's `raises`, which `binding check` judges and every
  target requires before the next step (GN-13f, CK-22). `tests/e2e/classes` has such a case of `gate.enter`. Verified
  by `npm test` in `packages/ts`.
- A case gave any value at a place of the type `cancel` without a finding, so a kind that only a cancellation that
  fired before the call reaches had no case form. A case gives it as `{"cancel": "fired"}`, or `{"cancel": "open"}`
  for one that does not fire, and `binding check` reports any other value (CK-22). Verified by `npm test` in
  `packages/ts`.
- An `out` row of a value alias whose `make` names a member was refused, so a value whose language form is an
  instance of a class of the contract had no binding. A row by a constructor or static member of a generated class
  whose one parameter is the content of the kind and which cannot fail now calls its core path on that content, and
  the value leaves as an instance of the class; any other member is refused by name (GN-6e). Verified by `npm test`
  in `packages/ts`.
- An `out` row of a value alias whose `make` is `{"keyed_map": {"key": [...]}}` was refused as a form that is not
  generated, so a value alias that gives a map of keys that are no sequence as a keyed map had no binding in any
  language. The row is now made as a map whose keys, of the kinds it lists, are made by the rows of the alias as its
  items are (GN-6e). Verified by `npm test` in `packages/ts`.
- The check did not judge the integers of a case at a place of the type `int` or `uint`, so a case that gave
  9223372036854775807 to an `int` parameter passed the check, which Python and PHP took as an i64 and Node and WASM
  refused as kind `invalid_number`. The check now reports an integer of a case outside the safe integers at such a
  place (CK-64).
- The Node and WASM declarations named an `int64` parameter `number | bigint` and an `int64` result `bigint`, but the
  binding took and gave a number of the safe integers only, so the case 9223372036854775807 was refused as an
  argument, and `binding` read that integer of a case file as the nearest double. The binding now takes a `bigint` of
  the range of i64 and gives a `bigint`, and `binding` reads an integer outside the safe integers as a `bigint`
  (GN-12a). A method whose name meets a lint convention (`from_end`) failed clippy in the Python and PHP crates, and a
  bool field went to a WASM conversion by a needless borrow; a method has the Rust name `member_<name>` with its
  language name as an attribute, and a scalar field is passed by value (GN-6l). `tests/e2e/shapes` has the members
  `shapes.measure`, `shapes.negate` and `buffer.from_end` for these forms. Verified by `npm test` in `packages/ts` and
  `make e2e` of `tests/e2e/shapes`.
- A case could give a value of a value type only as JSON nested once per level, so a value deeper than the default
  limit of a JSON reader (PHP 512, serde_json 128) could not be written, and a kind that only such a value raises had
  no case (CK-22). A case gives it as `{"kind": "list", "repeat": <n>, "value": <value>}`, which each test makes in a
  loop (G-5). The table of built-in forms named no Go type of `keyed_map`, so the contract check reported that Go has
  no built-in keyed_map value (CK-8) although Go has `*KeyedMap[T]` (GN-15); the table names `*KeyedMap[any]`.
  Verified by `npm test` in `packages/ts`.
- A case could not give a text that is not well formed, because a JSON text holds only well-formed text, so a kind
  that only such a text raises had no case (CK-22). A case gives it as `{"ill_formed": "<text>"}`: the text and an
  unpaired surrogate in Python, Node and WASM, or the byte 0xFF in PHP and Go (G-5). Verified by `npm test` in
  `packages/ts`.
- `tests/e2e/consumer` had no runner of its contract cases for WASM, so the end-to-end run checked the value alias of
  another repository and the callback on WASM by the generated tests alone, while Node ran the contract cases too.
  `tests/e2e/consumer/cases.wasm.test.mjs` runs the same cases through the subpath `./wasm`. Verified by `make e2e` of
  `tests/e2e/consumer` with `DEPS=tests/e2e/sample`.
- The generator refused the WASM binding of a contract with a value alias (U-7), with a value alias of another
  repository, with an alias that has `in_raises`, or with a callback unit (U-3), so `tests/e2e/sample` and
  `tests/e2e/consumer` failed on WASM before anything was built. The WASM module now describes a JavaScript value as the
  `HostValue` of the rule of Node and makes a core value by the alias's `out` rows (GN-18b), calls every JavaScript
  operation of the description that may run code of the value with `catch`, so its exception is thrown again unchanged
  and never unwinds through the module, runs the `in` function of an alias alone through `__aliasIn<Alias>` of the
  feature `codec-test`, which the WASM crate now has, and generates a callback as a struct over the JavaScript object
  whose exception reaches the caller as the same object (GN-18c). The generated WASM tests have the tests of K-2, the
  callback fixtures of a case and the U-7 tests of an alias (GN-13c). Verified by `npm test` in `packages/ts`.
- The cores of `tests/e2e/shapes` and `tests/e2e/sample` converted lengths and indexes with `as`, which the lints of
  R-1 that their workspaces now hold deny, so the lint of the core failed every target. A length widens through one
  function with the reason of its conversion, an index converts with `usize::try_from`, and the integer of a data
  value is the nearest float with the reason of U-7.
- A case that armed a fault injection point of another library (`<library>.<id>`) ran against a binding crate whose
  `fault-test` turned on the feature of its own core alone, so the point of the other core was not compiled and the
  case could not arm it, and `binding check` did not report the manifest. `binding scaffold` now reads the libraries
  of the points that the case files arm, names `polyspec-<library>/fault-test` of each in `fault-test` with the
  dependency on that core, stops with the name of a library that the core does not depend on, and `binding check`
  compares the manifests with that (GN-5, CK-19). The end-to-end run builds each binding crate with the features of
  its manifest. Verified by `npm test` in `packages/ts`.
- A contract whose `core.features.wasm` named a feature of platform I/O (`fs`, `blocking-io`, `process`, `net`) passed
  the contract check, and its WASM build failed later or built I/O that a browser does not have. `binding check` now
  reports it (CK-63), and the form of those features in a core is a row of the specification (GN-4b). Verified by
  `npm test` in `packages/ts`.
- The Python test of the argument count (G-7) of a member without parameters expected the words of a function with
  parameters, which CPython does not give for a function of no arguments, and WASM bound the unit result of a fallible
  member that returns nothing, which the lints deny. The test expects "takes no arguments" and "takes no keyword
  arguments" there, and WASM returns the error of such a member alone. Verified by `make e2e` of `tests/e2e/classes`.
- The generator refused the WASM binding of a host Node package, the generated Node tests of a host package imported
  the package's own entry, which is the host's code, and the end-to-end run read only `packages/rust/interface.json` at
  the paths of the plain layout. The WASM crate of a host Node package is now `native/wasm/`, the tests of a host
  package import the generated entry beside them, `binding check` asks the host's `files` for the WASM module (GN-3b),
  and the run takes every contract of the repository, `packages/rust` and `packages/<component>/rust`, each in its
  own layout (GN-14e). Verified by `npm test` in `packages/ts` and `make e2e` of `tests/e2e/classes`.
- The scaffold wrote a `[lints]` table of its own into each binding manifest, and a repository whose packages must take
  the lints of their workspace (`lints.workspace = true`) refused those manifests. Each binding manifest now says
  `lints.workspace = true`, so the workspace table states the lints of R-1 for the core and the bindings, and an
  exception of one crate is an attribute of its source with its reason (GN-4). The workspaces of `tests/e2e` hold the
  lints of R-1. Verified by `npm test` in `packages/ts`.
- The end-to-end run left out a raising case that gave its receiver as an instance value (GN-13f) or whose
  arguments did not have the shape of their types, and failed only at its end; so the classes contract failed CK-22.
  Every case of the repository now runs, and a case that a target cannot write is a refusal of that target. The
  scaffold wrote the core path of the WASM crate of a host Node package (`packages/ts/native/wasm`) as `../../rust`,
  one directory short, and the WASM and Go crates did not depend on the cores of the other libraries whose types the
  contract names; each binding crate now names those cores with its path climbed by its depth below the core (L-2a,
  T-3). Verified by `npm test` in `packages/ts`.
- A case could make the receiver of a method only by a constructor or a static member of its own class, so a kind that
  only a receiver of earlier calls reaches had no case, and `binding check` refused the contract (CK-22). A case now
  gives its receiver as an instance value: the member that makes it (`new`), or the member whose result holds it with
  the steps to it (`from`, `pick`), its own receiver, its arguments and the calls that prepare it (`then`). Every target
  makes the instances as locals of the test, and `binding check` reports a value that breaks the form (GN-13f, CK-22).
  WASM wrote an optional field of a record through a generic conversion whose type the compiler could not infer; it
  matches the optional where it is. Verified by `npm test` in `packages/ts` and `make e2e` of `tests/e2e/classes`.
- WASM refused a contract with fault injection points and a record of another repository. The WASM crate now has the
  feature `fault-test` with the entry points `__armFaults` and `__faultLeft`, each core call runs with the faults that a
  test armed, the B-4 test of a case with `faults` arms them, and a record of another repository is a plain object
  converted through the core of its owner, on which the crate depends (GN-5, GN-6c). Verified by `npm test` in
  `packages/ts` and `make e2e`.
- `binding generate` wrote nothing when one target refused an item, so a contract that Go cannot take yet gave no
  binding of any target. It now generates each target by itself, writes every target that refuses nothing, names each
  refused target with its items and fails with status 2 (GN-1c). Verified by `npm test` in `packages/ts`.
- The value alias `data` of `tests/e2e/sample` declared the targets Go and WASM but its out rows made no Go and no
  WASM value and no in row classified one, so `binding check` failed every target of `tests/e2e/sample` and `tests/e2e/consumer` (CK-8). Each out
  row now makes the Go and the WASM value of its kind, and in rows classify those values. Verified by `npm test` in `packages/ts` and `make e2e`.
- The generated tests ran only the contract cases that raise and compared no result: a member whose cases do not
  raise was called by no test. Every target now runs each such case and compares its result with the value of the
  case; the key of that value is the new `result` of the `cases` row, or `result`, and a case whose result has no
  case form fails its test by name (GN-13e, CK-22). Verified by `npm test` in `packages/ts`.
- WASM generates the type `source` of a parameter, `bytes`, the defaults of parameters and record fields and error
  units, and a member with the receiver `&mut self`: the table of a class with a lock holds its value in that lock,
  and each place of a call takes its guard (GN-6h, GN-6i, GN-6j, GN-7a, GN-18, GN-18a). Every binding crate turns on
  the feature `lock` of `binding_core`. The WASM tests check a default, a source and the exact class of an error unit
  as the Node tests do (GN-13d). Verified by `npm test` in `packages/ts` and `make e2e` of `tests/e2e/shapes`.
- The entry `src/lib.rs` of the Go C ABI crate wrote its allow attribute on one line of 125 characters, which
  `cargo fmt --all --check` of a repository refuses; `binding scaffold` writes each allow attribute in the form of
  rustfmt (GN-3a). Verified by `npm test` in `packages/ts`.
