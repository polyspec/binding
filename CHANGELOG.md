<!-- doc-id: changelog -->
# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- The generator refused the type `path` with "the type path is not generated yet", so a member or a record field with a
  path, such as `host_options.files: optional<path>`, had no binding. A `path` is now the bytes of an OS path in
  Python, Node, PHP and Go, in every place: the core takes `&Path` and gives `PathBuf`. Python takes a `str`, `bytes`
  or `os.PathLike` through `os.fsencode` and gives the `str` of `os.fsdecode`; Node takes a string as its UTF-8 or a
  `Uint8Array` and gives a string, or a `Uint8Array` for bytes that are not UTF-8; PHP and Go take and give a string of
  the bytes. A NUL byte, a Python `str` that `os.fsencode` cannot encode, and on Windows bytes that are not UTF-8 are
  kind `invalid_path`; a Node string with an unpaired surrogate is kind `invalid_text`; any other value is kind
  `invalid_argument_type`. The new functions `binding_core::path_from_bytes` and `binding_core::path_bytes` convert the
  bytes for every target. WASM refuses a path by name, because the contract leaves such a member out of WASM (CK-15).
  A case value of a path is a relative path, which each generated test resolves in its own temporary directory and
  removes; an empty or absolute path or a part `..` is refused by name (GN-6y). `tests/e2e/shapes` has the functions
  `joined` and `parent_of`. Verified by `npm test` in `packages/ts` (290 tests); the unit tests of `binding_core::path`
  are not run yet, because no build ran with the free disk of this change.
- The commit 9977442, which states in the spec the result form of a field of an optional type with a default, also
  holds part of the Green of the defaults of an optional type (`defaults.ts`, `model.ts`, `node.ts`, `php.ts`, `python.ts`, `wasm.ts`), which the staging of a patch put
  into it; 3a19444 holds the rest.
- The generator refused a default of an `optional` type with "a default of an optional type is not generated yet
  (U-2)", a `{literal}` default of an enum, and a `{literal: null}` default of a value type with "a {literal} or
  {const} default names the constant of the core in default_core (U-2)", so a record field such as
  `format_options.delimiters: optional<text> = {literal: null}`, a field `optional<uint> = {computed}`, an enum field
  `= {literal: "indent"}` and a parameter `assign: template_value = {literal: null}` had no binding. A default of an
  optional type that is `{literal: null}` or `{computed}` is now the `Option<T>` of the type itself: the binding passes
  `None` for a value that was left out and for a null, Go keeps its one pointer `*T`, and a record that a member also
  returns gives the null of the language for `None`. An enum `{literal}` default names its constant in
  `default_core`, which the crate asserts with `matches!` to be the variant of the value. A `{literal: null}` default
  of a value type passes `None` without a constant. The test that an explicit null is refused leaves out an optional
  and a value type, which take null as a value (GN-6i, GN-13d, GN-15e). `tests/e2e/shapes` has the function `pad` with
  these defaults and `tests/e2e/sample` the function `describe`. Verified by `npm test` in `packages/ts` (289 tests).
- The Go test of B-2 wrote an integer above the safe integers as `1 << 53`, which gofmt rewrites as `1<<53` where it
  is one of several arguments, so `gofmt -l` of the Go module of `tests/e2e/points` named `zz_generated_test.go`
  (`Shift(1 << 53, Point{X: 0, Y: 0})`). The test now writes the number `9007199254740992`, which gofmt keeps at any
  place. Verified by `npm test` in `packages/ts` and `gofmt -l` of the generated Go modules of every repository of
  tests/e2e.
- The generator refused the Go binding of a contract that names a record of another repository, with "a record of
  another repository is not generated for Go yet (GN-15f)", so `tests/e2e/plot`, which takes and gives the record
  `point` of `tests/e2e/points`, had no Go binding. Go now names the struct `points.Point` of the Go module of that
  repository, which the package and its tests import, and the C ABI converts it through `in_points_point` and
  `out_points_point`. `binding scaffold` of a contract with the target go reads the contract of a path dependency of
  the core from that path without Cargo, and of any other dependency through Cargo, and writes in `go.mod` a
  `require` line for the Go module of each library whose records the contract names: the exact version or the tag of
  the dependency line, or `v0.0.0` with a `replace` line to the Go module of a path dependency; a branch, a commit or
  a version range is refused by name. The end-to-end run builds the Go static library of such a dependency beside the
  one of the repository (GN-15f, GN-14). Verified by `npm test` in `packages/ts` and `gofmt` and `go vet` of the
  generated Go modules of the points and the plot.
- The Go C ABI of a contract without a class unit kept the helper `insert` of the table of instances, because the
  helper pruning took the map call `made.insert(` of a value alias for a call of it, so `cargo clippy` of
  `polyspec-consumer-go` failed with "cannot find type `Table`" and "cannot find type `Arc`". The helper is now
  `insert_held`, which only an instance that leaves names. Verified by `npm test` in `packages/ts` and `cargo clippy`
  of the Go crate of `tests/e2e/consumer`.
- The e2e run of `tests/e2e/classes` failed in three targets after the class unit `lease` (GN-6p). Python: a `Lease`
  that a failed call left as a temporary warned while the `TypeError` of the call was set, so the call ended with
  `SystemError`; the destructor now takes that exception and sets it again after the warning. PHP: the warning reads
  `<function>(): Lease was destroyed …`, because PHP puts the running function before the message, so the B-10 test
  requires a message that ends with the text. Go: the poison entry point of B-5c called `held_lease`, which the helper
  block had dropped because only that test entry uses it; the helper is now kept.
- A member with `wait: blocking_io` whose parameter or receiver carries language code was refused by every target
  ("a member with wait blocking_io that reaches language code is not generated (GN-6m)"), so `engine.load`, `prepare`
  and `prepare_bound` of a template engine with a host loader had no binding. PHP and Python now generate it as GN-6m
  states, and each Python callback call takes the GIL on the thread on which the core calls it, without the check of
  kind `wrong_thread`, so the callback also runs on the worker thread of `a<name>`. Node runs the call synchronously
  on the JavaScript thread, which owns the callback objects, and returns a settled promise. A member with
  `async_driver` that reaches language code stays refused by name. `sample.resolve_slowly` of `tests/e2e/sample`
  covers it, with a Python test that awaits `aresolve_slowly` with a callback that raises (GN-6q).
- A method with the core receiver `self` and a class unit with `cleanup` were refused by every target ("a receiver
  self is not generated yet", "cleanup is not generated yet"), so a resource that its close call consumes had no
  binding. PHP, Python and Node now take the value out of the lock of the class (`take` of `Exclusive` and `Shared`,
  which leaves the object kind `consumed`, GN-6o), assert that the core type of a unit with `cleanup` implements
  `binding_core::Cleanup` and that of another class unit does not, and warn when an object is destroyed without its
  cleanup call: `E_WARNING`, `ResourceWarning`, or `process.emitWarning` of type `ResourceWarning` (GN-6p, B-10). The
  generated tests require kind `consumed` after the call and the warning. Go and WASM refuse such members and units by
  name. Verified by `make check`.
- The end-to-end check of `tests/e2e/classes` at 8d9ed8c failed for Python, because `a<name>` built its tuple of
  arguments from a chained iterator, which `PyTuple::new` does not take (it needs an exact size), and for Node and
  WASM, because the conversion of the result of a member that waits was a closure that only called a function, which
  clippy denies (`redundant_closure`). Python now builds the tuple from a vector, and Node passes the function itself
  (GN-6m, GN-6n). Verified by `make e2e` of `tests/e2e/classes`.
- The Go C ABI of fsm did not compile (E0283, type annotations needed): `out_optional` took `impl Into<Option<T>>`, which
  an `Option<i64>` of an optional property of an error unit and the `&Option<String>` of an optional text field meet
  for two types `T`, and the generic `out_int` and `out_text` left `T` unknown. `out_optional` now takes `Option<T>`,
  given the `as_ref` of the value of the core, as in PHP, Python and Node (GN-16). Verified by `npm test` in
  `packages/ts`: 280 of 280 pass.
- The test of a Go tuple parameter required `in_uint` for its `uint` part, while GN-12a holds a `uint` part to the
  safe integers with `in_safe_uint`; the test now requires `in_safe_uint`. Verified by `npm test` in `packages/ts`:
  277 of 277 pass.
- The same integer key of a `keyed_map` gave two results: Node and WASM refused a number key that is no safe integer
  as `invalid_argument_type`, and PHP, Python and Go took any key of the range of i64. A key of a listed `int` is now
  a safe integer in every target, and a key outside is kind `invalid_number` (GN-12a); a key of a kind that the
  contract does not list stays `invalid_argument_type`, and that kind is judged first. The generated tests give the
  key 2^53 in every target (GN-13, GN-13b). Verified by `npm test` in `packages/ts`: 269 pass; the 7 failures are the
  tests of GN-6m (wait `blocking_io`), which this change does not touch.
- PHP and Python took an `int` argument of the range of i64 and the Go C ABI any `int64`, so a contract case with
  9223372036854775807 for an `int` gave `invalid_number` in Node and the error of the core in PHP and Python. An `int`
  is now a safe integer and a `uint` 0 to 2^53 - 1 in every target and at every place that the binding takes (an
  argument, an item, a field), and an integer outside is kind `invalid_number` (GN-12a); an `int64` and a key of a
  `keyed_map` keep the range of i64 (`in_int64`). The generated tests of B-2 give 2^53 and -2^53 in PHP, Python and Go
  (GN-13, GN-13b). Verified by `npm test` in `packages/ts`: 268 pass; the 7 failures are the tests of GN-6m (wait
  `blocking_io`), which this change does not touch.
- A member with `wait: async_driver` was refused by every target ("wait async_driver is not generated yet"), so the
  `async fn` members of a core of tokio had no binding. The generator now runs the future of such a member on a tokio
  runtime (GN-6n): PHP blocks on `binding_core::driver::block_on`, Python runs it in `py.detach` and adds `a<name>`,
  and Node returns a `Promise` of `Env::spawn_future_with_callback` on the runtime of napi (`tokio_rt`). The future
  owns the converted arguments and guards, its faults are installed around each poll (`fault::Armed::around`), and a
  panic of a poll is kind `internal` (`driver::Caught`). Go and WASM refuse such a member by name. binding_core has the
  new feature `driver`. Verified by `make check`.
- A member with `wait: blocking_io` was refused by every target ("wait blocking_io is not generated yet"), so
  `classes.read` and `gate.enter_slowly` of `tests/e2e/classes` had no binding. The generator now passes
  `binding_core::Io::for_generated_call()` to the core and waits in the form of each language (GN-6m): PHP blocks the
  calling thread; Python runs the core call in `py.detach` and adds the awaitable `a<name>` over `asyncio.to_thread`;
  Node returns a `Promise` whose work runs on the libuv pool through a `ScopedTask`, and its entry is an async
  function, so every failure rejects the promise. Go refuses such a member by name, and a constructor, property,
  iterate or hook that waits is refused by name. CK-16 also reports an awaitable name that is a reserved word of
  Python. Verified by `make test-ts`.
- The Go C ABI of a contract with fault injection points gave the points left through the closure
  `|output, item| out_text(output, item)`, so `cargo clippy -D warnings` of `polyspec-sample-go` failed with
  `redundant_closure` and the Go target of `tests/e2e/sample` ran no test. The entry now passes `out_text` itself.
  Verified by `npm test` in `packages/ts` and `cargo clippy` of the Go crate of the sample with its test features.
- The Go refusal of a record of another repository named no row that states how Go would generate it. GN-15f now
  states the design, in which `binding scaffold` writes the Go module of that repository in `go.mod` by the dependency
  line of the core, and marks it as not implemented; the refusal names GN-15f. Verified by `npm test` in
  `packages/ts`.
- The generator refused the Go binding of a member that names a class or a callback unit of another module, with "a
  class unit of the module tags in the module (the root) is not generated for Go yet". Go now reaches such a unit
  through `<Class>Handle`, `<Class>FromHandle` and `Dispatch<Callback>` of the package of its module, whose first
  parameter `binding.Token` only the packages of the Go module can name; a package has them only for a unit that
  another module names, CK-13 counts their names, a parameter that has the name of a package of the contract takes a
  trailing `_`, a test calls a constructor of another module by its package, and modules whose packages would import
  each other are refused by name (GN-15a). Verified by `npm test` in `packages/ts` and `gofmt` and `go vet` of the
  generated packages of the sample with its class and its callback in two other modules.
- The generator refused the Go binding of a value alias whose Go `out` row makes the value by a member, such as
  `"go": "tag.new"`, with "a Go make by a member (tag.new) is not generated yet (U-7)". Go now gives such a value as
  the instance of the class: the C ABI writes the number of the class in the contract and the handle of the value,
  `Reader.ValueWith` of `internal/binding` reads them, and `aliasInstance` of the package of the class makes the
  instance; a member of another module that gives the value is refused by name (GN-15c). Verified by `npm test` in
  `packages/ts` and `gofmt` and `go vet` of the generated packages.
- The generator refused the Go binding of a class with a member `to_json`, so `tag.to_json` of `tests/e2e/sample`
  and `tests/e2e/classes` named only PHP and Node and the Go binding had no JSON form. Go now gives a to_json as
  `MarshalJSON` of `json.Marshaler` over the unexported `toJSON`, which marshals the value of the core with
  `encoding/json` and returns the error of the core; a to_json that returns `never` returns the error alone, and the
  B-4 test calls `toJSON` (GN-15a). Both contracts name Go for `tag.to_json`. Verified by `npm test` in `packages/ts`
  and `gofmt` and `go vet` of the generated packages.
- The generator refused the Go binding of a contract with a tuple of different part types inside another type or with
  a tuple parameter, so the fixture, whose `words.split` returns a list of a tuple of text and uint, had no Go
  binding. Go now gives such a tuple as `Tuple<N>[T0, ...]`, a generic struct of `internal/binding` with the fields
  `P0` to `P<N-1>` that a package names by an alias, keeps `[N]T` for a tuple of one part type, and reads a tuple
  argument part by part (GN-16). Verified by `npm test` in `packages/ts` and `go vet` of the generated packages.
- The Go tests made the instance of a case whose call of `then` has `"raises": {"kind": <kind>}` by requiring that
  call to succeed, so `TestB4GateEnterAGateClosedTwiceLetsNothingPass` of `tests/e2e/classes` failed with "the gate of
  a is closed" where the case expects that failure. The Go test now requires the kind of that call and goes on to the
  next step, as the other targets do (GN-13f). Verified by `npm test` in `packages/ts`.
- The files of the CI and release workflows and `config/release.json` were in neither list of GN-14b, so the test of
  the inputs of an end-to-end run failed after they were added. They are now listed as files that a run does not read,
  each with its reason (GN-14b).
- A case of a member that takes a class of origin value gave the value as `{"kind": "text", "value": ...}`, and the
  generator ended with the exception "no case value of the type {"unit":"value"}", which named no item, so json
  generated no target. The value is now the call of the member that the `out` row of its kind names (`Value.string`,
  `Value.array` of the values of its list), and a case whose value the generator does not write, such as a kind made
  by a member of two parameters, has a test that fails with the reason while the other tests of the target are
  written. Every other value that the generator does not write refuses the target by name in place of an exception
  (GN-13). Verified by `npm test` in `packages/ts`.
- binding had no CI and no release. `.github/workflows/ci.yml` runs every target of `make check` and `make
  release-coverage` on `ubuntu-26.04-arm` for the push of `main` and a manual run, in the jobs `ts` and `rust`, and its
  last job `ci-passed` passes only when both passed. `.github/workflows/release.yml` tags the commit of such a run with
  the version of the top section of `CHANGELOG.md` and creates its GitHub Release with the npm archive of `packages/ts`;
  the tag also releases `binding_core` as a Git tag (`config/release.json`). The Makefile adds `ci-targets`,
  `ci-summary`, `ci-passed`, `release-tag`, `release-checkout`, `release-prepare`, `release-tools`, `release-tools-path`,
  `release-assets`, `release-publish`, `release-undraft` and `release-coverage`.
- A core with fault injection points ran `cargo test` with its points off unless the repository gave a flag or a
  dev-dependency of its own, and repositories did it in two forms. The core now has itself as a dev-dependency with
  `fault-test`, so `cargo test` without flags arms its points, and `binding check` reports a core manifest without it
  (CK-65, GN-5). The sample core of tests/e2e has that dev-dependency.
- A case that gave an instance value as an item of a list of a class, or as an argument of a class type of the call
  under test, stopped the generator with "no case value of the type". The value of a class at any place of a case is
  now an instance value, which each target makes at its place (GN-13f). `tests/e2e/classes` has such cases of
  `classes.join` and `tag.same`. Verified by `npm test` in `packages/ts`.
- The generator refused the Go binding of a contract with a class unit, a callback unit, a value alias (also of
  another repository), a value alias with `in_raises`, a `source` parameter, a parameter or field with a default, an
  error unit, or fault injection points, so `tests/e2e/classes`, `tests/e2e/shapes`, `tests/e2e/sample` and
  `tests/e2e/consumer` failed on Go before anything was built. Go now generates each of them: a class as a struct over a handle of a locked table with `New<Class>`, static functions
  `<Class><Member>`, methods, an iterator and `String()` (GN-15a); a callback as an interface whose error comes back as
  the same value (GN-15b); a value alias as `any` that the core reads through questions to Go (GN-15c); an error unit
  as a struct that embeds its parent (GN-15d); a `source` as `[]byte` and a default as a nil pointer (GN-15e); and the
  entry points of `fault-test`, of `codec-test` for an alias and of the poison test. The generated Go tests are in the
  package itself and cover U-2, U-7, K-2, B-4 with the exact error unit, GN-13e, N-4 and B-5c, the cases that arm faults
  with the build tag `polyspec_fault_test` (GN-13b). `binding check` names a static member of a class among the names
  of its Go package (CK-13), and the end-to-end check runs `go test` with a tag for each test feature of the crate and
  finds every test entry point in a library built without features. Verified by `npm test` in `packages/ts`.
- `binding scaffold` wrote an allow attribute wider than 70 columns with each argument on a line of its own, the form of
  the defaults of rustfmt, so `cargo fmt --check` of a repository with `use_small_heuristics = "Max"` and `max_width =
  120` failed on the `src/lib.rs` of each binding crate, which those settings join into one line. An allow attribute
  is now one line of at most 80 columns, which both forms keep, and a reason that does not fit is the comment above it;
  the reason of the Node addon names its rule id (GN-3a, GN-4).
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
