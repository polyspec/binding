<!-- doc-id: changelog -->
# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- `tests/e2e/relay` has the variant `packet`, whose cases hold the value class of json as a field and in a list,
  with the members `passed` and `count` and their cases, so that a value class of another repository in a case has
  a contract of the end-to-end check (T-9, GN-6v, GN-6x). Not verified by an end-to-end run. The generated tests of
  the relay write a case value of the value class as a built-in value (`Carry("name")` where Go takes `*json.Value`),
  for `carry` as for the new members, so the Go tests of the relay do not compile until a case value of a value class
  of another repository is written by the make members of its owner (GN-13b). Verified by `make test-ts` alone: 417
  of 417 pass.
- `binding check` has the check CK-72: a field of a case of a variant with the name of the `tag` of the variant,
  compared by their words, is a finding at that field with the remedy "rename the field or the tag", because the
  value of a case is an object whose tag member holds the case value (T-9, GN-6v). The finding of CK-23 for a name
  that a target language reserves named a naming exception as its remedy, which the generator does not generate; it
  now names the rename of the unit, the member, the parameter or the field in the contract (N-2). Verified by the
  tests of `packages/ts/tests/contract-check.test.ts`: the two new tests failed without the check and with the old
  message, and 232 of 232 pass.
- A field of a case of a variant that holds a unit of another repository was refused by name (`a unit of another
  repository in a case of a variant is not generated yet`). Such a field is now generated in the five targets for a
  record, a value alias and a value class of another repository, also inside a list, an optional, a map, a keyed map
  or a tuple: the conversions of the variant call the conversions of that unit. Two conversions took less than those
  need. In Node the `in` conversion of a record and of a variant had no env, which the conversion of a value alias or
  a class reads, so every such conversion now takes the env as its first parameter. In Go the function
  `encode<Variant>` had no call, which walks the value of a value alias, so the function of a variant with a value
  alias or a callback in a case now takes the call of the member first. `tests/e2e/consumer` has the variant `note`,
  whose cases hold the value alias `data` of `tests/e2e/sample` as a field and as the values of a map, with the
  members `turned` and `weight` and their cases; `tests/e2e/plot` has the variant `mark`, whose cases hold the record
  `point` of `tests/e2e/points` as a field, in a list and in an optional, with the member `flipped` and its cases. A
  class, a callback and a value alias of the contract itself in a case stay refused by name (T-9, T-3, GN-6v,
  GN-6c). Verified by `make test-ts`: 414 of 414 pass.
- The check of a class without `core_type` on a target that does not generate it has the id CK-78; it had the id of
  another check. The specification, the finding and the tests name CK-78, and the rule of the check is unchanged.
  Verified by `make test-ts`: the two tests of its finding failed before the check reported the new id.
- The generated Node and WASM tests of B-10 took the first `ResourceWarning` of the process after `gc()` and
  compared its message, so a contract with two classes with `cleanup` failed when the collection finalized an
  object of an earlier test first: the end-to-end check of `tests/e2e/classes` failed once on Node with the warning
  of `Stall` in the test of `Lease`. Each test now awaits the warning whose message is the warning of its class
  (GN-6p). Verified by `make test-ts`, whose test reads the generated tests of both targets.
- A member with `wait: process_wait` was refused by name on every target. The generator now takes it (GN-6m): the
  core call gets `binding_core::ProcessWait::for_generated_call()` in the place of the `Io` token; PHP, Python
  `<name>` and Go wait on the calling thread as for `blocking_io`; Python `a<name>` runs `<name>` on a thread of its
  own, which settles a future of the running loop, and not in `asyncio.to_thread`, whose executor every `to_thread`
  shares; Node runs the core call on a thread of its own and settles the promise on the JavaScript thread
  (`Env::create_deferred`), and not on the libuv pool. WASM has no such member, which the specification states as
  the rule of that target, and CK-15 requires `only` without `wasm`. A constructor, a property, an iterate or a hook
  with `process_wait` is refused as one with `blocking_io` is. Verified by `make test-ts`: the test that required
  the refusal of `process_wait` held before the change, and the new test reads the token and the form of each
  language; 436 of 436 pass. The function `classes.attend` and the method `gate.enter_after` of `tests/e2e/classes`
  wait with `process_wait` on PHP, Python, Node and Go, each with a case of its result and a case of its failure;
  the Node and Python forms are compiled only by the end-to-end check of that repository.
- The generated Go test of B-10 received one message of the standard logger from a channel after `runtime.GC()`: an
  object that the collection left made it wait without an end, a warning of an object of an earlier test failed
  it, and a second message blocked the logger, which holds its lock while it writes. The test now takes a
  `weak.Pointer` of its object and fails at once when the collection left the object, the writer keeps every
  message and never blocks, and the test reads the messages until the warning of its class (GN-6p). A cleanup
  function that ran without its warning would still leave the test waiting; the unit test of the generator reads
  that function. `make test-rust` and `make lint-rust` pass with `clean` and `cleaned` of the locks of
  binding_core. Verified by `make test-ts`: the test of the generated Go test failed before the change.
- The contract check reported less than the generator refused, and the checks of the waiting constructor, of a
  constructible class, of the core enum of a variant and of a cleanup that leaves its object have the ids CK-73,
  CK-74, CK-75 and CK-76. CK-73 now judges a host unit too: a `constructor`, a `property`, an `iterate` or a hook of
  a host unit with a `wait` other than `none` is a finding, because the language has no awaited form of them in
  code written by hand either; the test that held the exemption read a contract that failed the schema, so it
  judged nothing. CK-78 is new: a class without `core_type` whose targets, those of its `only` or of the contract,
  hold PHP or Go is a finding that names the unit and those targets, because only Python, Node and WASM generate
  such a class (GN-6af). The specification states that the core type of a class with `cleanup` releases its
  resources in its `Drop`, and that the contract check, which reads no Rust source, does not verify it (GN-6p,
  CK-76); the finding of CK-76 says so. The classes without `core_type` of the fixture of the contract check name
  `only` or their `core_type`. Verified by `make test-ts`: the five changed or new tests of a finding failed before
  the change, and 419 of 419 pass.
- A class unit whose `cleanup` names a method with the core receiver `&mut self` was refused by every target as "no
  method with the receiver self". The generator now takes both forms (GN-6p): a cleanup with `self` consumes its
  object as before, and a cleanup with `&mut self` leaves the object, whose core decides what a later member gives.
  The call of such a cleanup marks the lock of the object when it holds the write guard (`clean` of
  `binding_core::Exclusive` and `Shared`, with `cleaned`), and the destructor of each of the five targets warns only
  for an object that is neither consumed nor marked. No destructor calls the cleanup member, so a cleanup that waits
  is never called where nothing can wait; the `Drop` of the core type releases the resource. The contract check
  requires a case that calls such a cleanup a second time without a failure (CK-76). The class `stall` of
  `tests/e2e/classes` has such a cleanup, a case of its second call and a case of a member that fails with kind
  `shut` after it. Verified by `make test-ts`: the two tests of the finding of CK-76 failed before the check was
  written, and 414 of 414 pass.
- Go and WASM refused a method with the receiver `self` and a class unit with `cleanup` by name. Both now generate
  them as PHP, Python and Node do: the place of the receiver takes the value out of the lock that the table of the
  class keeps under the handle, a later place of that object is kind `consumed`, and the binding crate asserts
  `binding_core::Cleanup` (GN-6o, GN-6p). An object collected without its cleanup call warns with the message of
  B-10: the function of `runtime.AddCleanup` in Go through `log.Print` of the standard logger, and the callback of the
  `FinalizationRegistry` in WASM through `process.emitWarning` with the type `ResourceWarning`, or `console.warn` in a
  host without it; the cleanup member is the explicit release, and no second member is generated. The Go `Ref` of an
  instance holds a pointer, because the cleanup of an object without one runs only when every object of its
  allocation block is unreachable. G-5 generates the test of kind `consumed` and the B-10 test for both targets. The
  members of `lease` of `tests/e2e/classes` name the five targets. Verified by `make test-ts`: the test of GN-6o and
  GN-6p failed with the four refusals before the change.
- A Go member with `wait: async_driver` was refused by name. Go now generates it as PHP does: the cgo call of the
  member runs the future in `binding_core::driver::block_on` on the OS thread of the calling goroutine, the entry
  point holds the guards of its places until the result is converted, and a member with `machine` is driven by
  `binding_core::machine::drive` on that thread; the runtime is the one of the process, which no object owns (GN-6n,
  GN-6ab). The Go crate of a contract with such a member turns on the feature `driver` of binding_core. The members
  `classes.fetch`, `classes.settle` and `gate.enter_later` of `tests/e2e/classes` name Go. Verified by `make test-ts`.
- A Go member with `wait: blocking_io` was refused by name. Go now generates it: the cgo call of the member calls
  the core on the OS thread of the calling goroutine and returns when the core returns, the entry point of the C ABI
  holds the locks of its places across the wait, and the member has the form of a member that does not wait (GN-6m);
  a member that reaches language code calls its callback on that thread (GN-6q). The members `classes.read` and
  `gate.enter_slowly` of `tests/e2e/classes` name Go, and the class `usher` with the callback `guide` is a member with
  `blocking_io` that reaches language code; `cases_test.go` of that repository calls one usher from two goroutines,
  the second while the guide of the first holds its call inside the core, and requires both results. Verified by
  `make test-ts`: the tests of GN-6m and GN-6q failed with the refusal before the change. The end-to-end check of
  `tests/e2e/classes` is the evidence of the five targets.
- A contract error that `binding check` passed was first reported by `binding generate` as a refusal. The contract
  check now reports three of them. CK-73: a `constructor`, a `property`, an `iterate` or a hook (`stringify`,
  `to_json`, `primitive`) of a unit that is no host unit with a `wait` other than `none` is a finding that names the
  member, its wait and the member that can wait in its place, a static member that makes the instance or a method
  that gives the value or the items (GN-6m, GN-6n, N-4). CK-74: a class with `core_type` that has no constructor and
  no `constructible: false`, or `constructible: false` and a constructor, is a finding (U-1). CK-75: a `variant` unit
  of the origin `generated` without `core_type` is a finding (T-9). The refusals of the generator stay. Verified by
  `npm test` in `packages/ts`: the 12 new tests of a finding failed before the change, each for its missing finding,
  and `tests/contract-check.test.ts` passes 246 of 246 with it.
- The end-to-end check ran on macOS alone: `.github/workflows/ci.yml` ran no end-to-end check, so no run tested the five
  targets, or the released form of the Go module, on Linux, where a release is built and used. The workflow now has the
  job `e2e`, which runs `make e2e` of each repository of `tests/e2e` (classes, consumer with sample, plot with points,
  sample, shapes) with every tool of the checkout and uploads the record `var/report/e2e/`, and `ci-passed` needs it;
  `tests/ci-workflow.test.ts` requires the entries and the rules of a workflow. The entry plot fails while its targets
  php, python and wasm fail. Verified by `make test-ts` (314 tests passed). Not run: the job in CI, which runs on the
  push of `main`.
- The static library of the released form of a Go module held the debug sections of the Rust standard library, a
  third of its size, and the `strip` of a Cargo profile does not change a static library (19402832 bytes of the
  sample on darwin/arm64 with `strip = "debuginfo"` and without it). The specification states that a release removes
  them with `llvm-strip --strip-debug` of the pinned toolchain (GN-15g), and the step of the released form of the
  end-to-end check does so and fails when `llvm-size -A` still names a debug section (GN-14f). Verified by
  `make test-ts` and by `make e2e` of `tests/e2e/plot` with `tests/e2e/points` on darwin/arm64, whose record is
  evidence: the library of plot went from 19046784 to 12618176 bytes and the one of points from 19043472 to 12614864,
  and the 18 tests of the released form passed with them (the targets php, python and wasm of that run failed as
  before). Not run: `make e2e` of `tests/e2e/sample` with the libraries without debug sections.
- No consumer could take the Go module of a library: a Go module is fetched as the source of a tag, the generated Go
  files and the static library are no tracked files, and the generated code named no directory of the library, so a
  build needed `CGO_LDFLAGS`. `binding generate` now writes, for each platform of a Go module (`linux_amd64`,
  `linux_arm64`, `darwin_arm64`), `internal/binding/zz_generated_link_<platform>.go` with the directive
  `#cgo LDFLAGS: -L${SRCDIR}/../ffi/lib/<platform>` and the package `internal/ffi/lib/<platform>` that it imports, and
  the specification states the commit and the tag `packages/go/vX.Y.Z` with which a release carries the module and
  the library of each platform (GN-15g), that musl is not supported, and the files of the Go module that CK-19 compares. A checkout builds as
  before, with the directory of its library in `CGO_LDFLAGS`. The end-to-end check has the step of the released form
  (GN-14f): it makes that commit and tag for the platform of the run in a repository of the work directory, and a
  consumer module that requires the module alone runs its test and the tests of the fetched modules from the
  read-only module cache without `CGO_LDFLAGS` and without `replace`. Verified by `make test-ts` (309 tests passed)
  and by `make e2e` of `tests/e2e/plot` with `tests/e2e/points` on darwin/arm64, whose record is evidence: the target
  go passed with 8 generated tests and 18 tests of the released form, in which one program links the static
  libraries of plot and of points; the targets php, python and wasm of that run failed in steps that this change
  does not touch, and by `make e2e` of `tests/e2e/sample` on darwin/arm64, whose record is evidence and passed in
  every target (PHP 67 generated tests, Python 66, Node 67, WASM 54, Go 41 and 35 tests of the released form). Not
  run: the released form on Linux.
- A contract that takes a callback unit of another library whose member names a unit of a third library, by a named
  type of that library's contract (`types`), was refused for every target as "`<library>.<member>` returns: `<third>`
  has no unit `<unit>` (T-3)", although the third library has the unit: `binding` read only the contracts of the
  libraries that the contract itself names. A member that named the third library by a type instead was a finding of
  CK-9, "it may use only units of" its own library. `binding` now reads the contracts to the closure, the contract
  of each library that a read contract names, among the packages that Cargo resolved for the core, and `scaffold`
  follows the `path` of each dependency line from the core that names it. CK-9 checks a unit of a third library, also
  one that a named type names, against the contract of its owner, and reports a unit that the owner does not have.
  Libraries whose contracts name each other in a cycle are refused with their names. The manifests name the
  libraries whose types the generated code names (GN-3e, GN-15f): also a library that the members of such a callback
  unit name gets its dependency line in the Cargo manifest of each binding crate and its package in `pyproject.toml`,
  and `go.mod` requires it when the type is a record or a value class; the core names that library in its own
  manifest. `scaffold` now asks Cargo for the contracts of the dependencies without a `path` for every target, and a
  failure of Cargo writes the packages with the libraries that the contract itself names and fails with status 1 and
  a sentence that says so. No contract of `tests/e2e` takes a callback unit of another library, so no end-to-end run
  compiles this form; Go and WASM refuse a callback unit of another library by name (GN-6s). Verified by
  `make test-ts`: the two new tests and the changed test of the failing `cargo metadata` failed before the change (3
  of 425), and 425 of 425 pass with it; `binding generate` of a repository whose callback of another library gives a
  value of a third one no longer names the refusal.
- `binding generate` of a contract with the target go that names a record or a value class of a library whose
  contract names no Go module (`packages.go`) stopped with a stack trace ("Cannot read properties of undefined"),
  because the Go generator read the module of that contract without asking whether it has one; `scaffold` and `check`
  already named the Go module with this reason. `generate` now refuses the Go target with the library and the reason
  and generates the other targets (GN-15f, GN-1c). Found by `binding generate --target go` in a repository whose
  `Cargo.lock` pins a commit of the other library from before it had a Go module. Verified by `make test-ts`: the new
  test failed with the stack trace before the change, and 423 of 423 pass with it.
- For a core that names no line on `polyspec-binding-core`, such as a core that only passes the values of another
  library on, `binding scaffold` wrote the development line of binding, the branch `v1/rust-core`, into every binding
  crate, whichever generator ran, so the binding crates of a repository that a released generator scaffolded named a
  branch and `binding check --release` reported each of them. Such a core now gets the line of the generator itself
  (GN-3e): a generator that knows no commit of itself, which is the generator of a release installed at its version
  (CK-20), writes the tag `vX.Y.Z` of its own version, a release form, and a generator that knows its commit (a
  checkout, a tree of `git archive`, an install from Git) keeps the branch `v1/rust-core`. A line that the core names
  is followed as before. Verified by `make test-ts`: the new test failed before the change, because the manifest named
  the branch for the generator of a release, and 422 of 422 pass with it.
- `binding scaffold` of a contract with the target go whose core names another library by a dependency that is no
  `path` asks `cargo metadata` for the contract of that library, and a failure of Cargo stopped the scaffold for every
  target. Only `go.mod` reads those contracts, so a failure now names the Go module alone as not written, with the
  status of Cargo and the instruction to run the install target of the repository that fetches the crates of its
  `Cargo.lock` (`cargo fetch --locked`), and the packages of the other targets are written (GN-15f, GN-3e). `check`
  and `generate`, which read the contracts for every target, fail with the same instruction. `cargo metadata` fails
  where Cargo cannot resolve the workspace: without network for a Git dependency that the machine has not fetched, or
  for a manifest that names a crate that no longer exists. Verified by `make test-ts`: the new test failed before the
  change (1 of 401), and 401 of 401 pass with it.
- `binding check` did not read the licence of the hand-written manifest of a host package (L-2a), so a host package
  could name another licence than its core or none. It now reads the licence of the core as an item of the host's
  manifest (GN-3f, CK-19): `project.license` of the host's `pyproject.toml`, and `license` of the host's `package.json`
  and of the host library's `composer.json`; a missing or different value is a finding with the value it must have.
  A host package adds the licence of its core to these manifests. Verified by `make test-ts`: the changed test of
  L-2a failed before the change (1 of 400), and 400 of 400 pass with it.
- `binding scaffold` wrote the dependency line of every binding crate on `polyspec-binding-core` as a fixed value, the
  Git repository of binding at the branch `v1/rust-core`, whatever the core named. The line now follows the line of
  the core on `polyspec-binding-core` (GN-3e): its `git` with its `branch` or `tag`, its `version`, or its `path`,
  which climbs to the place of the binding crate, with the features of the binding crate. A core without the line
  keeps the development line of binding. `binding check --release` also reports a development form of that line in
  the core and in each tracked binding crate (CK-70). A repository whose core names another line than the branch
  `v1/rust-core` runs `binding scaffold` again. Verified by `make test-ts`: the new test and the changed test of CK-70
  failed before the change (2 of 400), and 400 of 400 pass with it.
- The generated PHP extension registered under the name of its crate, `polyspec-<library>-php-ext`, because
  `#[php_module]` of ext-php-rs 0.16.4 names a module after the crate, while its `composer.json` names
  `php-ext.extension-name` `polyspec_<library>`; `extension_loaded('polyspec_<library>')` was false for a loaded
  extension. The module now names itself `polyspec_<library>` with `ModuleBuilder::name` (GN-3g). The end-to-end check
  did not find this, because PHP registers the classes and functions of an extension whatever its module is named and
  no step asked PHP for the extension by name. Each PHP process of the end-to-end check that runs tests now first
  asks `extension_loaded` for the `extension-name` of each `composer.json` of the run and fails with the name before
  a test runs. A repository runs `binding generate` again. Verified by `make test-ts`: the new test failed before the
  change (1 of 399), and 399 of 399 pass with it.
- `binding scaffold` wrote the licence `MIT` as a fixed value into `package.json` and `composer.json`, whatever the
  licence of the core was, and wrote no licence into the Cargo manifests of the binding crates and into
  `pyproject.toml`. Every manifest with a licence field now carries the licence of the core crate (GN-3f):
  `package.license` of the core, or `workspace.package.license` when the core names `license.workspace = true`, as
  `license` of each binding crate, of `package.json` and of `composer.json` and as `project.license` of
  `pyproject.toml`. A core that names no licence is a finding of `binding check`, the new check CK-71, and `scaffold`
  then writes the manifests without the field. Every repository runs `binding scaffold` again, because CK-19 compares
  the manifests, and a core without a licence adds one first. The cores of `tests/e2e` and of the fixture of the unit
  tests name `MIT`. Verified by `make test-ts`: the new test failed before the change (1 of 398), and 398 of 398 pass
  with it.
- `binding scaffold` wrote the dependency of `pyproject.toml` on the Python package of another polyspec library as the
  name alone, `dependencies = ["polyspec-<library>"]`, whatever the dependency line of the core named, so the package
  of a release required no version of that library. The dependency now follows the form of the line (GN-3e): a tag
  `vX.Y.Z` or the version `=X.Y.Z` gives `polyspec-<library>==X.Y.Z`, and a development form (a path, a branch, a
  commit, a version range) keeps the name alone, which the development install resolves and which
  `binding check --release` reports with its line (CK-70). A repository whose core names a tag or an exact version of
  another library runs `binding scaffold` again, because CK-19 compares `pyproject.toml`. Verified by `make test-ts`:
  the new test failed before the change (1 of 397), and 397 of 397 pass with it.
- When the dependency line of the core on another polyspec library named a branch, a commit or a version range,
  `binding check`, `binding scaffold` and `binding generate` stopped for every target with a stack trace, because the
  Go module of that library had no version for `go.mod`. Such a line is now a development form (GN-3e): `go.mod`
  requires the module at `v0.0.0` without a `replace` line, which the development checkout resolves through its
  untracked `go.work`; a `path` keeps `v0.0.0` with its `replace` line and a tag or an exact version keeps `vX.Y.Z`
  (GN-15f). `binding check <interface.json> --release`, the option that a release tool passes, reports each
  development form as a finding of the new check CK-70, which names the core manifest, the crate and the form. A
  tracked package that `scaffold` cannot write (the core does not depend on a named library, a library has no Go
  module, a path is not the core of its library, a contract is not found) is named with its reason: `scaffold` writes
  the other packages and fails with status 1, `check` reports it as CK-19 and compares the others, and `generate` no
  longer reads the tracked packages. A failure of `generate` that a contract or a case file causes is a refused target
  with its sentence and no stack trace, so it does not stop another target (GN-1c). Verified by `make test-ts`: the
  three new tests and the changed test of GN-15f failed before the change (4 of 396), and 396 of 396 pass with it.
- More texts of the generator that the relay of the end-to-end check shows with the contract of json, each dead
  code, which the lints deny. The enum `ReadAs` of the PHP, Python, Node and WASM hosts had every variant and
  the read every arm, while the in cases of json construct no `Units`; a host now has the variants that an in case of
  its contract constructs, with their arms (GN-6x). PHP wrote the struct `PhpMaking` for a contract whose only alias
  is a value class of another repository, which the members of its owner make; it is now written for an alias of the
  contract itself (U-7). Python reads the object of a `PyNative` only where an out row gives a native value back, so
  without such a row the field was never read; the struct then carries an allow of `dead_code` with its reason,
  because the field keeps the object for the core that holds the Native (GN-6u). The Go crate wrote the helper `give`
  and declared the function `__go_native` of package binding for every contract with an alias, while only an out row
  that gives a native value back calls them; they are now written for such a row. The Node helper `units` was kept in
  every crate whose host has a variable of that name, because a helper counts as used where its name is a word of the
  code; it is now `string_units`. The message of the kind of `failure_error` of a library without kinds named a
  member in words, which kept the Node and WASM helper `member`; it now names a call. Verified by `make test-ts`: the
  test of the variants failed for `Units` and the test of the uncalled functions for `give`, `__go_native` and
  `member`, and both pass with the change.
- The tests of the work directory of a run (GN-14) called `workOf` and `runIn` and read the text of the recipe, and none
  ran the script of the run without a work directory. A new test makes a checkout of its own from the tracked files,
  runs `scripts/e2e.mts` in it without `--work`, and fails unless `git status --porcelain --ignored
  --untracked-files=all` of that checkout is the same after the run as before it and the temporary directory of the
  run is empty. Verified by `make test-ts`: 414 of 414 pass, and the same steps on a copy whose `workOf` gives the
  directory of the caller for no name left the 195 files of the tree of the commit in the checkout, which the
  comparison of the test fails.
- The helpers `handle_count` and `handle_position` of the PHP, Python, Node and WASM crates matched the result of
  `try_from` by hand under an allow of `clippy::manual_unwrap_or`, whose reason named `unwrap_or` disallowed; R-1
  disallows that family for `Option` only, and the generated code calls `Result::unwrap_or` elsewhere. The eight
  helpers are now `try_from(value).unwrap_or(MAX)` without the allow, which gives the same value for every input.
  Verified by `make test-ts`: the new test failed for the allow, and 413 of 413 pass with the change.
- The contract case "refused by the owner" of the consumer sample gave the alias a callable and expected kind
  `unsupported`, while the core of the sample takes a callable as a Native (GN-6u), so the case failed on PHP, Python,
  Node and WASM. The case now gives two values that the owner refuses on every target, each through `measure`, `pair`
  and the callback of `fetch`: a map with a key that is no text, and a text that is no Unicode text (bytes that are no
  UTF-8 in PHP and Go, an unpaired surrogate in Python, Node and WASM). Go had no contract cases of consumer:
  `tests/e2e/consumer/cases_test.go` now runs the same cases as the other four runners.
- Four texts of the generator that the relay of the end-to-end check shows, which takes and gives the value class of
  another repository and names no kind. Every crate but the Go one wrote `failure_error` with a call of `core_error`,
  a function that a contract without kinds does not have, so the crate did not compile; the kind of
  `binding_core::Failure<()>` is the unit, which no member gives, and that arm is now kind `internal` (E-1c, GN-6x).
  PHP wrote the class name of the owner with its namespace into two Rust strings without escaping the backslash
  ("unknown character escape"); the strings are now written as Rust strings. PHP named the bit of a handle that the
  host owns `OWNED`, the name of the table of GN-6u in the same module; the bit is now `HOST_OWNED`. Go wrote the
  numbers of a value class and of its out row as bare literals, which are `i32` for `out_uint(…, impl WideUint)`;
  they are now `u64` literals (GN-15c). Found by the end-to-end run of relay with the contract of json. Verified by
  `make test-ts`: each of the three new tests failed for its text, and 412 of 412 pass with the change.
- The generated Node and WASM tests left a parameter with a default out of the middle of a call by dropping it, so
  the options record stood in its place: `pkg.pad('ab', { end: '!' })` gave the record as `fill`, and three tests of
  `pad` of `tests/e2e/shapes` failed in each of the two targets with kind `invalid_argument_type`; the tests of the
  commit before this work wrote the same calls. GN-6i now states the one form of such a call in each language:
  keywords in Python, named arguments in PHP, `undefined` in the place in Node and WASM, and nil in Go, each of which
  its declaration takes. The tests of Node and WASM write `pkg.pad('ab', undefined, { end: '!' })` and drop only the
  `undefined` arguments at the end of a call (U-2, GN-6i, GN-13d, GN-13e). Verified by `make test-ts`: the test failed
  with the call `pkg.pad('ab', { side: 'left' })`, and 397 of 397 pass.
- Go wrote an `optional` of a type that is already a pointer with a second pointer: `optional<keyed_map<T>>` was
  `**KeyedMap[T]`, `optional<map<T>>` was `**Map[T]`, and an `optional` of a class was `**<Class>`; a parameter or a
  field of such a type with a default got the second pointer too. A pointer whose nil is no value of its type now
  takes no second pointer: its nil is the missing value, for which the C ABI writes the tag of an absent value. This
  holds for a `map<T>`, a `keyed_map<T>`, an instance of a class and a value class of another repository; an
  `optional` of an `optional` keeps its second pointer (GN-15e). Verified by `make test-ts`: the test of the Go
  binding of `tests/e2e/shapes` failed with `[]**KeyedMap[string]` of `Present` and now requires that the binding and
  its tests hold no `**`, and 397 of 397 pass.
- The first cases with a map of `tests/e2e/shapes` showed two defects. The Node addon read the global `Array` as an
  object, which napi refuses for a function, so every call with a map failed with kind `internal`; it now reads it
  without that check. The Go tests wrote a map value as a function literal on one line, which gofmt breaks when its
  body is longer than a line, so `gofmt -l` named `zz_generated_test.go`; a map value is now a call of the helper
  `mapWith` or `keyedWith` for each entry (T-2, GN-12, GN-13f). Verified by `make test-ts`: 397 of 397 pass.
- A record that a member gives only as the value of a `map<T>` or a `keyed_map<T>` got no result form: the walk
  that collects the records with a result form did not enter a map, so the Python, Node, PHP and WASM crates called a
  conversion `out_<record>` that they did not hold. The walk now enters a map and a keyed map (T-2, T-4, GN-6a).
  Verified by `make test-ts`: the new test failed with the missing `out_text_measure` of the Python crate, and 397 of
  397 pass.
- The generated Python and PHP tests of a contract that names a record of another repository named the record in
  the package of the contract itself (`pkg.Point`, `\Polyspec\Plot\Point`), where no such class exists, so the tests
  of `tests/e2e/plot` failed in Python with `module 'polyspec.plot' has no attribute 'Point'`. The rule of GN-6c now
  states for every target that a unit of another repository is the unit of the package of that repository: the Python
  test imports the module of that package as `foreign_<library>` and the PHP test names the class of the namespace of
  that repository, as the Go test names the struct of the Go module of that repository and the Node and WASM tests
  give a plain object (T-3, GN-6c). The WASM crate of a contract without a list, a tuple or a map, such as
  `tests/e2e/points` and `tests/e2e/plot`, used `Array::of4` for the arguments of the constructor of a failure and
  did not import `js_sys::Array`; the crate now imports it always (GN-18). Verified by `make test-ts`: the two new
  tests failed for these reasons, and 396 of 396 pass.
- A `map<T>` or a `keyed_map<T>` inside another type (a field of a record, an item of a list, of an optional or of
  another map) was refused by name for Node and WASM, because the JavaScript entry turned a `Map` into its entries and
  so took one only as a whole parameter or return. The addon and the WASM module now read the `Map` where they judge
  the value and build the `Map` that they give back, so both targets take a map at every place of a type, and the
  entries hand the value on as it is (T-2, GN-12, GN-18). A value that is no `Map` stays kind `invalid_argument_type`,
  and byte string keys stay refused by name, now at every place. `tests/e2e/shapes` has the record `tally` and the
  members `tally_of`, `tally_total`, `merged`, `split_counts`, `doubled` and `present` with their cases: a map in a
  record, in a list, in an optional and in a map, both ways. Verified by `make test-ts`: 394 of 394 pass.
- A helper of a generated crate that is an `async fn` was kept in every crate: `usedHelpers` read the name of a
  helper after `fn` or `trait` at the start of its item only, so `async fn caught` of the WASM crate had no name and
  counted as used, and a WASM crate without a member with `wait: async_driver` (variants, sample) had dead code,
  which the lints deny. `usedHelpers` now reads the name of an `async fn` too (GN-4, GN-6n). Found by the end-to-end
  run of variants and of sample ("function `caught` is never used"). Verified by `make test-ts`: the test of `caught`
  failed for the WASM crate of variants, and 409 of 409 pass with the change.
- Three texts of the generator that no contract of `tests/e2e` shows. PHP wrote the helper `thrown` for every contract
  with a failing member or a value alias, while only a callback or a function type calls it, so the crate of a
  contract with an alias and no callback (the relay fixture) had dead code, which the lints deny; PHP now writes it
  where `keepsThrown` holds, as Node does (U-3, GN-6z). The assertion of the borrows of a member (GN-6h, I-2) left the
  `Io` token of `wait: blocking_io` out of the type of the function pointer and wrote the receiver `self` as `&`, so a
  correct core did not compile against it; the assertion now has `_` for the token after the receiver and the value
  of the class for the receiver `self` (GN-6m, GN-6o). A Node or WASM member with `machine` and a class parameter gave
  the core the guard of the parameter, because the entry left the borrow of the guard to a future that a machine does
  not have; the entry now binds the borrow before its core makes the machine (GN-6ab). Verified by `make test-ts`:
  each of the three new tests failed for its text, and 409 of 409 pass with the change.
- `make e2e` without `WORK` gave the script an empty `--work`, which it resolved to the root of the checkout, so the
  run wrote the tree of the commit, the copies of the repositories and the build directory into the checkout; with
  `DEPS` the empty value also took `--dep` as the directory. `WORK` is now optional: the recipe gives `--work` only for
  a named directory, and a run without one makes a directory under the temporary directory of the system and removes
  it when it ends, when it fails and on SIGINT and SIGTERM. The commands of the run are in a process group of their
  own and write to one pipe of the script, so a signal stops the group and the directory is removed when the pipe
  closes, after the last process has exited (GN-14, HR-87); the errors of the run are printed with its output, in the
  order written. The end-to-end check linted each binding crate with its test features only, so an import that only
  an entry point of a test feature uses was unused in the build without features and no run saw it. The check now
  lints each binding crate also without a feature, with `-D warnings`, and names both lints in the outcome of the
  target (GN-14, GN-5). `scripts/e2e-work.mts` and `scripts/e2e-lint.mts` are files that a run reads from the checkout
  (GN-14b). Verified by `make test-ts`: the new tests failed without the two modules, and 406 of 406 pass with them.
- The end-to-end check compiled the generated crates of this tree for the first time and refused six texts. PHP and
  Node: `thrown_thread` read the number of the thread through a `match` whose `Err` arm gives 0, which clippy names
  `manual_unwrap_or_default`; it now reads it with `let ... else` (U-3, GN-6u). Python: the generated code reads the
  cfg `pyo3_disable_reference_pool`, which no crate declared, so rustc refused it (`unexpected_cfgs`); the Python crate
  now has a `build.rs` that declares the cfg, which its manifest names (GN-3a, GN-6u). WASM: `caught` returned
  `impl Future` around one `async` block, which clippy names `manual_async_fn`; it is now an `async fn` (GN-6n). Go: for
  a contract with a callback unit and no value alias, package binding read the list of the handles of a buffer that
  the Rust crate writes only for a contract with an alias, so every call failed with "the encoded result does not
  follow the encoding of the binding" or with a misuse of a `cgo.Handle`; Go now reads the list exactly when the crate
  writes it (GN-6u). Go: a test gave an optional callback as a pointer to the struct of its fixture, which `go vet`
  refuses for a parameter that is a pointer to the interface; the test now gives `ptr[<interface>](...)` (GN-6aa).
  Node and WASM: a test left an argument out before the options record by dropping it, so the record took its place;
  the test now passes `undefined` there, and only a trailing argument is missing (U-2, GN-6i). Verified by
  `make test-ts`: the six new tests failed, each for its text; with the change 399 of 399 pass.
- For a contract with a class that has a write place and no member that takes a class as an argument, the generated
  Node crate imported napi's `ClassInstance` and `FromNapiValue` without a condition, while their only user was the
  poison entry point of the feature `panic-test`, so a build without features had unused imports, which the lints of
  the workspace deny. The generator now writes a name that only that entry point uses in a `use` line under
  `#[cfg(feature = "panic-test")]`, and a name that other code uses stays in the unconditional line (GN-5, GN-4). The
  Python, PHP, Go and WASM crates had no such import. Verified by `make test-ts`: the new test reads the 47 generated
  crates of 10 contracts without the items of a feature and failed with `ClassInstance` and `FromNapiValue` of the
  Node crate of shapes and `ClassInstance` of that of functions (392 of 393 passed); with the change 393 of 393 pass.
- A case value of a path that would leave the directory of its test (an empty path, an absolute path, a part `..`)
  refused the whole Go target, while Python, Node and PHP wrote a test of the case that fails with the reason. Go now
  writes that failing test too, as for every case that the generator does not write, so the other tests of the target
  are written (G-4, GN-6y, GN-13e). Verified by `make test-ts`.
- A contract with a function type and no callback unit made bindings that did not compile: the call of the function
  gives what it threw to `thrown`, which Node, Python and WASM generated only for a contract with a callback unit, and
  PHP left out the variant `Thrown::Php` that the call of a Closure makes. WASM also generated no `Thrown`, no
  `failure_error` and no field `thrown` of its failure for such a contract. Each target now generates them for a
  contract with a callback unit or a function type (U-3, GN-6z). The test file `tests/native.rs` of binding_core had
  the crate-level `#![cfg(feature = "construct")]`, so a run without the feature passed a target that ran no test; it
  is now a test target with `required-features = ["construct"]` (HR-84). The Rust cores of `tests/e2e/functions` and
  `tests/e2e/sample` are in the form of rustfmt, which `make fmt-e2e` checks. Verified by `make test-ts`: 335 of 335
  pass.

- The rule of a unit with `only` and of a value class without `core_type` had the id GN-6m, which also names the rule
  of a member with `wait: blocking_io`. The rule of the unit with `only` is now GN-6af in the specification, the code
  and the tests. A value of the language that is no value of a value type (`{"host": <sort>}`) was refused in Go, which
  writes the tests of the kinds of an alias; Go now makes `func() {}`, `time.Unix(0, 0).UTC()` and `struct{}{}` for
  the sorts `callable`, `date` and `object` (GN-13). A case value without a form in PHP that no entry point of
  `case-test` takes fails its test through the same check as every case that the generator does not write, with the
  case and the member in the reason (G-4, GN-13e). Verified by `make test-ts`: 319 of 319 pass.
- The e2e run of `tests/e2e/sample` failed in Go and WASM once a case armed a fault with an errno symbol (`EIO` at
  `sample.tally`). Go: the generated test compared the errno with `int64(syscall.<symbol>)`, while `Errno()` gives an
  `int`, so `go vet` refused the test file (mismatched types); the test now compares with `int(syscall.<symbol>)`.
  WASM: the generated test armed the faults with their errno symbol and required the value that Node gives the symbol,
  but the target of WASM has no errno, so `__armFaults` refused the arming with kind `internal`; the WASM test now arms
  the faults of a case and of a call of `then` without their `errno` and requires no errno where the case names a
  symbol (G-5). Verified by `npm test` in `packages/ts`: 310 of 310 pass, with the test that requires both forms.
- The Node binding of `tests/e2e/classes` did not compile (E0515, E0597): the call bound the borrow of the guard of its
  receiver (`let receiver = &*receiver;`) before it moved the guard into the future of `Gate.enter_later` (async_driver)
  and into the closure of the pool of `Gate.enter_slowly` (blocking_io), so the future and the closure held a borrow of
  a local of the call. The future and the closure of the pool now own the guards and bind the borrows inside them
  (GN-6h). Verified by `make e2e` of `tests/e2e/classes`, whose record is evidence and passed in every target (PHP 60
  generated tests and 4 contract cases, Python 58 and 4, Node 63, Go 27 and WASM 42), and of `tests/e2e/sample`,
  `tests/e2e/shapes` and `tests/e2e/consumer`, whose records are evidence and passed in every target.
- A Go parameter of a number type holds only values of its Go type, so the Go binding had no way to give a host value
  of another type, such as true, "7" or 1.5 at an `int` parameter, to the conversion of the binding, and a test of
  such a value, which the other targets refuse as kind `invalid_number`, had no Go form. The feature `codec-test` and
  the build tag `polyspec_codec_test` now give, for each number type of a parameter, `<Type>In(value any, subject
  string) error` of `internal/binding` over the entry point `<prefix>__number_in`, which judges the Go value by the
  conversion of that number type: a value of its Go type passes the range of GN-12a, and any other value is kind
  `invalid_number`. `zz_generated_codec_test.go` checks the B-2 values of GN-13 for each such type, and the end-to-end
  check refuses a release library that holds `__number_in` (GN-13g). Verified by `npm test` in `packages/ts`.
- The generator refused the Go binding of a contract with a class that implements a callback interface, with "a class
  that implements an interface is not generated for Go yet (GN-6w)", so the class `ribbon` of `tests/e2e/variants`,
  which implements `tail`, had no Go binding. Go now gives the pointer to the class the method of each member of the
  interface that the class does not declare, which calls the trait method through the C ABI, asserts
  `var _ Tail = (*Ribbon)(nil)`, and writes the instance value of a case at the place of the callback as the instance
  that its factory makes (GN-6w, GN-13f). The search for the class of such an instance value is now one function of
  the case samples, `implementerInstance`, which the Go tests and the other targets share. Verified by `npm test` in
  `packages/ts` and `gofmt` of the generated Go module of `tests/e2e/variants`.
- The generator refused the Go binding of a contract with a variant unit, with "a variant unit is not generated for Go
  yet (GN-6v)", so `tests/e2e/variants` had no Go binding. Go now declares the variant as an interface of the package
  of its module, whose one method is unexported, and each case as a struct of its fields that implements it; the
  functions `encode<Variant>` and `decode<Variant>` of the package write and read the number of the case and its
  fields, and a value that is no case struct is the number 2^64 - 1, which the C ABI judges kind
  `invalid_argument_type`. The C ABI converts the variant with a match of its cases without a wildcard, its fields
  boxed as the core holds them, and the Go tests write a case value as the struct of its case (GN-6v). Verified by
  `npm test` in `packages/ts` and `gofmt` of the generated Go module of `tests/e2e/variants` without the class that
  implements `tail`.
- `cargo test` of binding_core without features ran `tests/lock.rs` and `tests/driver.rs` with no test, because each
  file was gated by a crate-level `#![cfg(feature = ...)]`, and passed while it checked nothing. The two files are
  now `[[test]]` targets with `required-features`, which a run without the feature does not build (HR-84). Verified by
  `make check`: test-ts ran 290 tests, all passed, with the test of `tests/core-tests.test.ts`; test-rust ran lock and
  driver with all features and listed neither without features.
- The e2e run of `tests/e2e/sample` failed in Node and Go. Node: of the K-2 tests of `resolveSlowly`, only the first
  test of the block became an async function, so the module of the generated tests did not parse (`await` in a
  function that is not async); every test of a block that awaits is now async. Go: `out_list`, which only the entry
  point of the feature `fault-test` uses, was compiled in the static library without features, which then denied it
  as dead code; a helper that only the entry points of a test feature use is now compiled under those features (GN-4).
  Verified by `make e2e` of `tests/e2e/sample`: every target passed, node with 67 tests and go 41, and by `npm test` in
  `packages/ts`: 289 of 289 pass.
- A changelog entry named the commit that an end-to-end run had checked, which tells a reader nothing without a lookup
  and is lost in a shallow history. No tracked file now names a Git commit, except the commit pin of a GitHub action
  and a lock; `tests/tracked-commits.test.ts` fails any other token of a commit name, and the entry states the run
  that verified it (B1.4). Verified by `npm test` in `packages/ts`.
- GN-13a listed B-10 among the tests that G-5 does not generate, while GN-6p states that PHP, Python and Node generate
  a B-10 test for each class unit with `cleanup`. GN-13a now names B-10 as open only in Go and WASM, which refuse such
  a unit by name (GN-6p, GN-13a). Verified by reading the B-10 tests that `npm test` in `packages/ts` requires of PHP,
  Python and Node.
- binding had no document check: no `make docs-check`, no `config/documents.json` and no checklist, so a broken link,
  a Korean twin without the revision of its source or a checklist row of a wrong form went unnoticed. `make docs-check`
  now runs the document check of the installed `@polyspec/kit` on every Markdown document, the changelogs and the
  checklist `docs/plans/execution/checklist.md` that `config/checklist.json` declares, and `make documents-stamp`
  writes the `source-sha256` of a reviewed Korean twin (B1.1, B1.2). Verified by `make docs-check`.
- A Go case value of a class that was not an instance value, such as `{"kind": "text", "value": "a"}` of a `Value` of
  json, refused the whole Go target with "a case value of the class value is an instance value". Go now writes it as
  the other targets do: a class of origin value by the make member of the kind, another class by its constructor and
  the inserts of its pairs, each a local of the test; a case whose receiver or argument is not written fails its test
  by name, and the other tests of the target are written (U-1, GN-13, GN-13e, GN-13f). Verified by `npm test` in
  `packages/ts`.
- The Python G-7 test of a constructor without parameters, such as `OrderedMap()` of json, expected `takes no
  arguments`, the words of a CPython function of no arguments, but the constructor is the `__new__` of PyO3, which
  reports `takes 0 positional arguments` and `unexpected keyword argument`. The test now expects the words of each
  form (G-7). Verified by `npm test` in `packages/ts`.
- A float case value that JSON writes as an integer, such as `0`, `100` and `1e20` of `value.from_float` of json, was
  written as an integer in Python and PHP, which refuse an integer for a float (kind `invalid_argument_type`), and a
  negative zero lost its sign in every language. A float is now a float literal in Python and PHP (`0.0`, `1e+20`),
  and a negative zero is `-0.0`, or `-0` in Node and WASM (B-2, G-5). Verified by `npm test` in `packages/ts`.
- A case whose result is `null` of an optional of a class, such as `get_absent` of `ordered_map.get` of json, failed
  its test with "a class has no case value form". The result `null` of an optional now has a case form whatever the
  optional holds, and each target compares the result with its null (Python `None`, Node, WASM and PHP `null`, Go
  `nil` of the type of the result); a result that is a class still fails with the reason (GN-13e). Verified by `npm
  test` in `packages/ts`.
- A Node class member named by a word that JavaScript reserves, such as the static member `null` of `Value` of json,
  gave an entry that did not parse, because the entry defined it as `function null(...args)` (SyntaxError). The entry
  now writes each member over the addon as a method of the computed key `<name>`, which keeps `<name>` as its `name`,
  and every reserved word of JavaScript is tested against the Node entry and the WASM module (GN-6b). Verified by `npm
  test` in `packages/ts`.
- A Python case value nested deeper than the parser of Python takes, such as `array_past_limit` of `value.array` of
  json, gave a test module that did not import ("too many nested parentheses"). A case value whose brackets would nest
  more than 50 deep is now made step by step in the local variables of a function of the test module, which the test
  calls, so the case stays whole (GN-13e). Verified by `npm test` in `packages/ts`.
- A case whose id holds a character that no identifier takes, such as `document-order` of json, gave the PHP method
  `testGn13eparseDocument-order` and the Python method `test_gn13e_parse_document-order`, so PHPUnit and unittest
  could not read the generated tests. The name of the test of a case now holds the words of its id, split at every
  run of characters other than ASCII letters and digits (`DocumentOrder`, `document_order`), as Go already did, and
  two ids of one member or one value alias that give one name refuse the target by name, PHP comparing without case
  (GN-13e). Verified by `npm test` in `packages/ts`.
- A case value of kind map of a class of origin value whose make member takes another class, such as `Value.object`
  of json, which takes an `OrderedMap`, failed its test with "takes more than one value" or "no case value of the
  type", because the `[key, value]` pairs of the case are no value of that class. The pairs now fill the class: its
  constructor without parameters makes it, and its one member with the receiver `&mut self` and two parameters takes
  each pair, a text key as a value of kind text where the parameter is a class of origin value; a case value of such a
  class at another place, such as `members` of `value.object`, is the same list of pairs (GN-13). Verified by
  `npm test` in `packages/ts`.
- A PHP enum with a case named by a keyword or a type name, such as `object`, `array`, `string` and `null` of the
  enum `kind` of json, did not compile: the macro `php_enum` of ext-php-rs refuses those names, also as the name of
  `#[php(name)]`, and the enum type that the module registers was then missing (E0425). Such a case now takes a
  trailing `_` in the extension and the stub (`Kind::Object_`); its backed value is the value of the contract (GN-10).
  Verified by `npm test` in `packages/ts` and by clippy of the json PHP binding.
- A parameter of a class that the core takes by value, such as `key` and `value` of `OrderedMap::insert(&mut self, key:
  Value, value: Value)`, did not compile, because the call gave a borrow of the guard (E0308). The argument is now
  `CoreForm::core_form` of the borrow of the value, which the type of the core parameter turns into the borrow or a
  copy (GN-6h). Verified by `npm test` in `packages/ts` and by clippy of the json bindings of Node, Python and WASM.
- A member of a locked class whose core path is a trait function, such as `value.to_string` with the path
  `std::string::ToString::to_string`, did not compile, because the call gave it a borrow of the guard, which a generic
  path does not deref (E0277). The generated code now binds `&*guard` or `&mut *guard` under the name of each place
  once every lock is taken, and the core call takes those names (GN-6h). Verified by `npm test` in `packages/ts`.
- A class result that the core gives by reference, such as `&OrderedMap` of `Value::members` or the `&Value` items of
  `Value::items` and `Value::get`, did not compile, because `out_<class>` took the value owned (E0308, E0631). The
  conversion now takes `impl CoreForm<T>`, which keeps an owned value and clones a borrowed one, also behind the
  reference that an optional or a list adds (GN-6b). Verified by `npm test` in `packages/ts`.
- Go deleted the `cgo.Handle` of a func that a value gave only when its decoder reached the node of the func, so a
  decoding that failed before it (a value without a Go form, a malformed node) or a result that the caller did not
  decode kept the handle and its func. Every buffer that Rust gives Go now starts with the list of the handles that it
  gives, the node of a func is the index of its handle in that list, and `invoke` and the arguments of a callback read
  the list first, take each func and delete each handle before anything else is decoded (GN-6u).
- In Node, a `Native` dropped on another thread was released only at the next entry point of its owner, so a
  program that made no further call kept the reference until the env ended. The owner now makes an unref threadsafe
  function with its table, which a drop on another thread calls under the lock of the owners, and which empties the
  queue on the owner thread; the env cleanup hook aborts it under the same lock after it raises the generation, so a
  drop of an older generation calls nothing (GN-6u).
- A `Raised` held a bare handle, so the exception under it stayed in the table of the binding when the core dropped
  the `Raised` instead of returning it, and a failure of the binding on another thread stayed in its own table. A
  `Raised` now holds a `Native` (`Raised::from_generated(Native)`, `native()`), whose last drop removes the entry
  (GN-6u): Python, Go and WASM at the drop; Node and PHP on the thread that threw, at once, or, after a drop on another
  thread, when that thread next keeps or throws again an exception, and the end of the thread discards its queue. A
  failure of the binding on another thread is held by its `Raised` as its `BindingError`. `Raised::from_generated`
  takes a `Native` instead of a `Handle` and `handle()` is replaced by `native()`, so the generated code of every
  repository that depends on binding_core is generated again with this version; code generated before it does not
  compile against it.
- No generated test gave a language object through a `native` row and back, so a binding that kept or lost the
  object passed. For a value alias with a `native` out row and a function that takes it and gives it back, each target
  now tests that the object comes back as the same object and that the binding keeps no reference to it (GN-6u):
  Python by `sys.getrefcount` and a `weakref`, Node, PHP and WASM by the count of their owner table, which the entry
  point of the new feature `native-count-test` gives (`__nativeCount`, `Internal\nativeCount`), and Go by the count of
  its live handles (`binding.NativeCount`, build tag `polyspec_native_count_test`). A Go func that enters is now a
  `Native` that the static library counts. The end-to-end check fails a static library without features that holds
  `__native_count`.
- `tests/e2e/functions` checked a function type in Python only. It now declares the targets PHP, Node and WASM as
  well, so the end-to-end check runs the stored functions of every target that takes one (GN-6z).
- WASM refused a member that takes a function type (GN-6z). It now holds the function as a `Native` of the table of
  the one thread of the module (GN-6u) and declares the parameter as a TypeScript function type; a value that is not a
  function is kind `invalid_argument_type`. The generated tests of WASM wrote the names of the members of a function
  fixture as PHP strings; they write them as JavaScript strings.
- PHP refused a member that takes a function type (GN-6z). It now holds the Closure as a `Native` of its owner table
  (GN-6u), declared `\Closure`; a call on another thread is kind `wrong_thread`, which `Internal\threadTest` of the
  feature `thread-test` shows, and a value that is not a Closure is kind `invalid_argument_type`. In Node and PHP a
  failure of the binding in a call on another thread is kept as its `BindingError` in a table that every thread
  reaches, because a language error object is made on the owner thread only, which makes it when the call fails.
- Node refused a member that takes a function type (GN-6z). It now holds the JavaScript function as a `Native` of
  its owner table (GN-6u) and declares the parameter as a TypeScript function type; a call runs on the owner thread in
  the env of the table, and a call on another thread is kind `wrong_thread`, which the entry point `__threadTest` of
  the new feature `thread-test` shows. A value that is not a function is kind `invalid_argument_type`. The generated
  tests give a function value of a case as the call of a fixture.
- The generated bindings kept every language object that entered as a handle in a table that only grew: Python and
  WASM for the life of the process, Node for the life of the thread, PHP until the request ended. A `Date` and an
  `Other` value were kept the same way, and Go walked a func only inside its call. A language object that a core may
  keep now enters as a `Native` whose last drop releases it by the rule of its target (GN-6u): Python holds the
  `Py<PyAny>` and refuses `pyo3_disable_reference_pool`; WASM holds the key of its table; Node and PHP hold the owner,
  its generation and the key, queue a drop on another thread for the owner, empty that queue in `guard` at every entry
  point, and release the table and raise the generation at the env cleanup hook and at the request shutdown; Go holds
  the `cgo.Handle` of the func and gives a new one for each `out`. A `Date` and an `Other` value get a handle numbered
  in the order of the call. The data alias of `tests/e2e/sample` keeps an object or a function as `Data::Native` and
  gives it back by the `native` row in every target; `generate.test.ts` checks the form of each target.
- binding_core gave a language object that a core may keep, a `HostValue::Object`, a `HostValue::Callable` or an
  `OutValue::Native`, as a `Handle` into a table of the binding that kept every object until the end of the process
  or the request, because nothing told the binding when the core dropped the handle. It now gives it as a `Native`,
  an `Arc<dyn NativeObject>` that is equal by its object and releases what the binding keeps for the object when the
  core drops the last one (B-1, U-7 (d)). `HostValue::Object` names the field `native`. `tests/native.rs` checks the
  equality, a clone and the release on another thread. Verified by `make test-rust lint-rust`.
- A member that calls language code that its receiver keeps, such as `registry.call` of `tests/e2e/functions`,
  whose core returns `Result<T, Failure<E>>`, was generated as if its core error were `E`, so the binding crate did
  not compile (E0308). The contract now names such a member with `core.failure: true`, whose error the generated code
  converts as that of a member that takes a callback; `binding check` refuses `core.failure: true` on a member whose
  receiver keeps no language code, `core.failure: false` on a member that takes a callback or a function, and
  `core.failure: true` with `core.result: false` (E-1c, GN-7, CK-21). Verified by `npm test` in `packages/ts`.
- A parameter that held a callback inside another type, an item of a list, an `optional` or a field of a record
  parameter, was refused for every target ("the type {"unit": ...} is not generated yet"). Each target now gives the
  core such a callback as `Box<dyn <core trait> + 'a>` and the list, the `optional` or the record by value, `'a` being
  `'env` in Node and `'static` elsewhere; the core type of a record with a callback field has that lifetime, and such a
  record is refused by name at a place other than a record parameter (GN-6aa). A generated test gives a callback value
  inside another value as the object of a fixture, or an instance value of a class that implements the callback.
  `tests/e2e/sample` has `sample.first` (a list), `sample.maybe` (an `optional`) and `sample.seek` (a record field).
  Verified by `npm test` in `packages/ts`.
- A case that gave a function value `{"function": [<row>]}` stopped the generator with "no case value of the type".
  A Python test now gives it as a fixture of the call itself, whose record of calls the test reads after the call, or,
  inside another value such as an argument of a `then` call, as the callable of such a fixture; and it checks that a
  value that is not callable is kind `invalid_argument_type` (G-5, GN-6z). `tests/e2e/functions` is a Python
  repository whose core calls a function during the call (`functions.apply`) and keeps one in a class
  (`registry.register`, `registry.call`).
- A member with a parameter of a function type was refused for every target ("the type {"function": ...} is not
  generated yet"), so a contract with one, such as template `engine.register`, generated no target. Python now
  generates it: the core takes `Box<dyn Fn(<parameter>…) -> Result<R, binding_core::Failure<E>> + Send + Sync>` by
  value, the callable is checked as it enters (kind `invalid_argument_type`), and a call converts the arguments out
  and the result in, with an exception of the Python code going to the core as a `Raised` (GN-6z). Node, PHP and WASM
  refuse it by name until binding_core has the native lifetime, and Go refuses it. The callback members and the
  function types share one rule of borrowed parameters (T-1). Verified by `npm test` in `packages/ts`.
- WASM refused every member with `wait: async_driver` ("wait async_driver is not generated for WASM yet"), a member
  with `machine` (GN-6ab) with them, so such a contract generated no WASM module. WASM now returns a promise of
  `wasm_bindgen_futures::future_to_promise`: the event loop of JavaScript polls the future on the thread of the module,
  in a browser as in Node, and no tokio runtime is used; the WASM crate depends on `wasm-bindgen-futures` 0.4.80, the
  release of its `wasm-bindgen` 0.2.130 and `js-sys` 0.3.107, and not on the driver of binding_core (GN-6n). A member
  with `machine` returns a `Driven` object whose `advance()` makes the calls of the machine on that thread and gives
  `[false, promise]` for a wait or `[true, result]`, which the ES entry `drive` awaits and then frees (GN-6ab). The
  ES entry of such a member is an async function, its declaration a `Promise`, and its generated tests await it.
  `tests/e2e/classes` has `classes.settle`, whose future is pending once and needs no tokio runtime, and a unit test
  compiles its generated WASM entry with its core with rustc for the host and for wasm32. Verified by `npm test` in
  `packages/ts`.
- A member with `wait: async_driver` that reaches language code, such as a function that takes a callback, was refused
  with "a member with wait async_driver that reaches language code is not generated", because a future that a runtime
  polls on its own threads would call the language code there. Such a member now names `"machine": true` in its
  `core`, and its core path returns a state machine without I/O, `binding_core::machine::Machine`, whose steps are an
  I/O future that touches no language code, a call of language code and the result. PHP drives the machine on the
  calling thread, Python `<name>` drives it with each wait outside the GIL and `a<name>` runs `<name>` in
  `asyncio.to_thread`, and Node returns a `Driven` object that the JavaScript entry advances, each call on the
  JavaScript thread and each wait on the tokio runtime of napi. `binding check` reports such a member without
  `machine` and `machine` on any other member (CK-68); the generator refuses a method with `machine`, whose machine
  would borrow its receiver, and Go and WASM refuse it with every member with `async_driver` (GN-6ab). Verified by
  `make test-ts` and `make test-rust`, whose `tests/machine.rs` drives a machine with `drive` and with `Driving`.
- A property of an error unit with `raises`, such as `partial_target_error.removal_kind`, whose core function returns
  `Result<String, Error>`, and a property of type `list<text>`, such as a trace of the error, were refused with "a
  property of an error unit that raises is not generated yet" and "a property of an error unit of type
  {\"list\":\"text\"} is not generated yet", so no target of such a contract was generated. Every target now
  generates both: the generated code reads every property when it makes the error, so the `Err` of a property that
  raises is raised as the error of its own kind in place of the error that the core returned, and a `list<text>`
  property is a list of strings. A variant of the `raises` of a property that is no kind, or whose class has a property
  that raises, is refused by name (GN-7a). Verified by `npm test` and `npm run typecheck` in `packages/ts`.
- No constructor of the generated PHP error classes took a kind, so PHP code could make an error with its kind only
  by writing the private property `kind` in the scope of the category class, which is no public API, and the fixture
  of a raise row did so. Each category class now has the public constructor `__construct(string $message, string
  $kind, ?int $status = null, ?int $errno = null)`, which every error unit inherits, and the fixture of a raise row
  makes its error by it, as Python, Node and WASM do (GN-10, GN-13). Verified by `npm test` and `npm run typecheck` in
  `packages/ts`.
- A case whose callback fixture has a raise row, such as a loader that reports a missing file, was refused with "a
  raise row of a callback fixture is not generated yet". The fixture of every target now throws, for such a row, an
  instance of the error unit of the row with its kind and the message `G-5: <kind>`, as language code makes one; Go
  makes it with `Raised<Unit>` of `internal/binding` (GN-13). Verified by `npm test` in `packages/ts`.
- A callback member with `errors.recognize`, such as `file_loader.load` of a loader that reports a missing file, was
  refused with "recognized callback errors are not generated yet", so no target of such a contract was generated. An
  exception of the member that is an instance of a recognized error unit, with a kind of a row of that unit, now
  reaches the core as that kind: `errors.recognized` names the core function that makes the core error from the value
  of the kind and the message, and Python, Node, PHP, WASM and Go read the kind and the message of the instance; any
  other exception goes back to the caller as the same object. `binding check` reports a contract whose callback
  recognizes its own error unit without `errors.recognized` (CK-17), and the generator refuses a recognized unit of
  another library by name (GN-6d). Verified by `npm test` in `packages/ts`.
- A class parameter always gave the core a shared borrow (`&guard`), so a core that takes `&mut Form` did not
  compile, and a core that takes the class by value got no value. A parameter now names the borrow of the core in
  `core` (`&`, `&mut` or `value`), which every parameter of a generated class or an optional of one names: `&mut` is a
  write place, `value` gives a clone under the read guard, and every crate asserts the borrows of such a member as the
  fn pointer type of its core path. `binding check` reports a class parameter without `core` and a `core` of a
  parameter that is no class (CK-67), and the generator refuses both and the borrow of an optional class by name
  (GN-6h); the contracts of `tests/e2e/classes` and `tests/e2e/sample` name the borrow `&` of their class parameters. Verified by `npm test` in `packages/ts`.
- A contract whose core error is a struct that holds a code enum, such as `FormError { code: FormErrorCode, .. }`,
  named the variants of the code in `errors.kinds`, and the generator refused it with "the kinds name 2 error enums"
  when a variant of the code held a code of a dependency, or wrote `match error` against the code variants, which does
  not compile. `errors.code` now names the type of the error and its projection to the code, and every crate matches
  and asserts the code (`match <projection>(&error)`); a variant that holds a value of another enum is written
  `<outer>/<inner>` and matched as `Outer(Inner { .. })` (GN-7b). Verified by `npm test` in `packages/ts`.
- A WASM member with
  `wait: async_driver` whose receiver or parameter is a class bound the borrows of its guards outside its future, which
  does not own them; the future now owns the guards and binds the borrows inside it, as the Node future does (GN-6h,
  GN-6n). A row of a function value of a case had four values and a row of a callback fixture five, so the fixture
  object read a missing value as an error to throw; a function row now holds the fifth value, which is no error
  (GN-13, GN-6z). A parameter whose `core` is `value` gives the core `(*<place>).clone()` and every other class
  parameter `CoreForm::core_form` of its borrow (GN-6h). A nested variant `<outer>/<inner>` is the row of a dependency
  with its `library` (GN-7c) also under `errors.code`, whose projection its match and its assertion read (GN-7b); a
  nested variant without `library` stays refused by name. Verified by `make test-ts`.
- The Go C ABI of `tests/e2e/classes` did not build without `panic-test`: its poison entry point had an arm for every
  class with a write place, also `lease`, which Go does not make, and the reader `held_lease` that only that arm used
  was unused when the feature was off. The entry point now takes the classes that Go makes by a constructor or a static
  member, as the Go poison test does, and a package without such a class has no entry point (GN-6h). Verified by `make
  e2e` of `tests/e2e/classes`: every target passed, go with 27 tests, and by `npm test` in `packages/ts`: 289 of 289
  pass.
- `make e2e` read `go test -json` without its `build-output` events, so a Go package that failed to link was named
  only as "go test failed the packages …" without the linker output. The events are read in
  `scripts/go-test-events.mts`, which prints the output of each build and names it in the cause (GN-14a). Verified by
  `npm test` in `packages/ts`: 289 of 289 pass, with the two tests of `tests/go-test-events.test.ts`; no e2e run since
  had a Go package that does not build.
- `binding scaffold` wrote the platform packages `<npm package>-<platform>` into `optionalDependencies` of `package.json` at its own version, and `binding check` required them of a hand-written host `package.json` (CK-19), so the lock of an npm workspace could not hold them before the release of that version and `npm ci` refused the manifest ("Missing: @polyspec/hyper-darwin-arm64@ from lock file"). The source manifest and the workspace lock no longer name them: release tooling writes them into `optionalDependencies` of the manifest it packs, at the version of the release (GN-3b, GN-3c). The end-to-end check installs the platform package and the package as two tarballs, so the entry finds the addon without the field. Verified by `make test-ts` (291 tests).
- `binding check` read from a hand-written host `package.json` (L-2a) only its name, its `files` and its platform
  packages, so a host package without `"type"`, `napi.binaryName` or `napi.targets`, which a release reads (kit
  K1189), passed the check. It now also reads these three items, compares each deeply with the value of GN-3c, and
  names a missing or different item with that value, such as `CK-19 napi.targets is missing, not
  ["x86_64-unknown-linux-gnu","aarch64-unknown-linux-gnu","aarch64-apple-darwin"]`. The `composer.json` of a host PHP
  extension is written by scaffold and compared whole, its `php-ext.download-url-method` included (GN-3b, CK-19).
  Verified by `make test-ts` (291 tests).
- `binding scaffold` wrote a `package.json` without `napi.binaryName`, `napi.targets` and `type`, and a PHP extension
  `composer.json` without `php-ext.download-url-method`, so the release of kit (K1189) refused the npm-native package
  ("names no napi.binaryName") and the php-ext package ("lists no pre-packaged-binary in php-ext.download-url-method"),
  and Node read the ES module glue of WASM with the warning `MODULE_TYPELESS_PACKAGE_JSON`. The `package.json` of a
  library with the target `node` now names `napi.binaryName`, the npm name without scope, and `napi.targets`, the Rust
  triples `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` and `aarch64-apple-darwin`; every `package.json` that
  scaffold writes has `"type": "module"`; and the `composer.json` of a PHP extension, also `<host package>-native`,
  names `php-ext.download-url-method` `["pre-packaged-binary"]`. `binding check` compares them as part of each file
  (GN-3c, CK-19). Verified by `make test-ts` (291 tests).
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
  `joined` and `parent_of`. Verified by `npm test` in `packages/ts` (290 tests), `make test-rust-features` (64 tests,
  the 3 of `binding_core::path` among them), `make test-rust-plain` (46 tests), `make clippy-rust`,
  `make clippy-rust-features` and `make fmt-rust`.
- The commit that states in the spec the result form of a field of an optional type with a default (GN-6i) also holds
  part of the Green of the defaults of an optional type (`defaults.ts`, `model.ts`, `node.ts`, `php.ts`, `python.ts`,
  `wasm.ts`), which the staging of a patch put into it; the commit that generates the defaults of an optional type, of
  an enum and of a value type holds the rest.
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
  block had dropped because only that test entry uses it; the helper is now kept. Verified by `make e2e` of
  `tests/e2e/classes`, whose record is evidence and passed in every target: PHP 60 generated tests and 4 contract
  cases, Python 58 and 4, and Go 27.
- A member with `wait: blocking_io` whose parameter or receiver carries language code was refused by every target
  ("a member with wait blocking_io that reaches language code is not generated (GN-6m)"), so `engine.load`, `prepare`
  and `prepare_bound` of a template engine with a host loader had no binding. PHP and Python now generate it as GN-6m
  states, and each Python callback call takes the GIL on the thread on which the core calls it, without the check of
  kind `wrong_thread`, so the callback also runs on the worker thread of `a<name>`. Node runs the call synchronously
  on the JavaScript thread, which owns the callback objects, and returns a settled promise. A member with
  `async_driver` that reaches language code stays refused by name. `sample.resolve_slowly` of `tests/e2e/sample`
  covers it, with a Python test that awaits `aresolve_slowly` with a callback that raises (GN-6q). Verified by `make
  e2e` of `tests/e2e/sample`: every target passed, php with 67 tests, python 66, node 67, go 41 and wasm 54, and by `npm
  test` in `packages/ts`: 289 of 289 pass.
- The Rust cores of the repositories of the end-to-end check (`tests/e2e/*/packages/rust`) were in no checked form,
  because `fmt-rust` read `binding_core` alone. `make fmt-e2e`, a target of `lint-rust` and of the `rust` job of CI,
  checks them with the defaults of rustfmt, and the four cores are in that form now.

- The PHP test of a case whose `raises` names an errno symbol, such as `EIO`, was refused ("the errno symbol EIO is
  not compared in PHP yet"), because PHP has no table of the errno symbols of its machine. `binding_core::errno::value`
  gives the value of a symbol from the table that arms the faults, without a feature and with `libc` a dependency on
  Unix; the PHP extension of every contract gives it with the feature `panic-test`, which every test build turns on, as
  `Internal\errnoOf`, and the PHP test compares the errno of the failure with it, as Python, Node and Go compare it with
  the value of their language, also in a contract without fault injection points (GN-8a). The end-to-end check builds
  the PHP extension without features and fails if `llvm-nm` finds a test entry point in it, after it found `errno_of`
  in the extension built with the test features. The cases of the tally of the sample name `EIO` again.

- The two forms of a call of `then` (GN-13f) had only unit tests, so no run showed that the generated tests of
  either form pass in a target. The end-to-end sample `tests/e2e/sample` now holds both: `counter.tally` arms the fault
  `sample.tally` and leaves its failure `unreadable` for `counter.settle`, whose case arms the fault in a call of
  `then`, and `slip.read` of a slip that `shelf.slip` made fails with `missing` after the call `shelf.clear` with
  `"on": "receiver"`. The test of a contract without fault injection points leaves out the cases of the tally that
  arm faults.

- A kind that a failure of an earlier call leaves for a later call to give, and a kind that an instance reaches only
  after a call of the instance it was picked from, had no case form, so a contract that gives them could not pass
  CK-22: the arming of a case holds for its own call alone, and every call of `then` ran on the instance itself. A
  call of `then` may now hold `faults`, armed for the member of that call just before it and required to have fired
  just after it, and `"on": "receiver"`, which calls a method of the class of the `receiver` of the value on that
  receiver after the pick (GN-13f). `binding check` takes both keys: the faults of such a call are the faults of a
  case, a failure that it expects is a kind of its points, and a case whose instance values arm faults fills only the
  kinds of their points (CK-22). The tests of PHP, Python, Node and WASM arm and check the faults of the call (WASM
  through the glue module that a hook before the tests loads), and Go puts such a test with the cases that arm faults,
  its goroutine locked to its thread. A test that needs any receiver takes none that arms faults.

- The Go C ABI of a contract with a callback unit and no class unit did not compile (E0425 `Table`, E0433 `Arc`, in
  `tests/e2e/consumer`): the generator counted a helper as used where its name was a word of the code, so
  the method call `lock(&THROWN).insert(handle, error)` brought in the table helper `insert`, which names the `Table`
  and `Arc` of class units. A method of the name of a helper (`.insert(`) is now no use of it, in the helpers of every
  target, which all select them through `usedHelpers` (GN-4). Verified by `make test-ts`: 293 pass.
- A class or a member that took a callback unit of another repository was judged as one that reaches no language
  code: the computation of the types that carry language code (GN-6h) returned false for every type of another
  repository, so a member with wait `blocking_io` or `async_driver` that took such a callback was generated, and the
  lock of its class did not count it. Such a callback unit now carries language code, so the lock counts it, a member
  with `async_driver` that takes it is refused with "a member with wait async_driver that reaches language code is not
  generated", and a member with `blocking_io` that takes it is generated as a member that reaches language code
  (GN-6s). Verified by `make test-ts`.
- A member whose parameter is a callback unit of another repository (a `{unit, library}` type whose unit has origin
  `callback`) generated no target: it was refused with "the type ... is not generated yet". PHP, Python and Node now
  wrap the language object as an implementation of the owner's core trait, whose methods return
  `binding_core::Failure<<owner error>>`, and the declarations name the type of the owning package: the PHP interface
  in the owner namespace, the Python Protocol imported from the owner package, and `import("<owner npm>").<Name>` in
  TypeScript. Go and WASM refuse such a parameter by name, and a callback unit whose id is a unit of this contract is
  refused (GN-6s). Verified by `make test-ts`.
- A contract whose core passes on the kinds of a dependency (E-1b (a)) generated no target: every such row of
  `errors.kinds` was refused with "a kind of another library (E-1b (a)) is not generated yet". Such a row now names
  `<outer>/<inner>`, the variant of the core error that holds the error of the library and the variant of that error,
  and a member names the same path in `raises`. Every target matches it as `<outer>(<inner> { .. })` in the class and
  property matches of the core error and in the assertion of `raises`, with the category of the library's row of
  `<inner>`, and a member that raises only such a kind calls its core as fallible. The schema takes the path in
  `errors.kinds` and `raises`, and the contract check reports a row with `library` without `<outer>/` and a row without
  `library` with it (CK-10, GN-7c). Verified by `npm test` in `packages/ts`.
- A contract with a unit of origin `host` generated no target: a host class and a host functions unit were refused
  with "a host class unit is not generated yet" and "a host functions unit is not generated yet", and the fields of a
  host record were judged as those of a generated one. The generator now writes nothing of a host unit in any
  target, because its source is its declaration and the host package exports it, and a generated unit that names a
  host unit in a type is refused with that reason (GN-6ag). Verified by `npm test` in `packages/ts`.
- A contract with a unit of visibility `internal` generated no target: every such unit was refused with "an internal
  unit is not generated yet". An internal unit is now generated as a public unit of its kind and marked as no public
  API: `@internal` in the PHP stub and in the Node and WASM declarations, its Python names in no `__all__` (the root
  module keeps them in `<root>._root`, another module `m` in `<root>._m`), and a sentence of U-1 in its Go doc comment.
  An internal member of a public unit, which the generator generated as a public one, is refused by name, and the
  contract check judges the reserved words of an internal unit (CK-23) (GN-6r). Verified by `npm test` in
  `packages/ts`.
- A method with the core receiver `self` and a class unit with `cleanup` were refused by every target ("a receiver
  self is not generated yet", "cleanup is not generated yet"), so a resource that its close call consumes had no
  binding. PHP, Python and Node now take the value out of the lock of the class (`take` of `Exclusive` and `Shared`,
  which leaves the object kind `consumed`, GN-6o), assert that the core type of a unit with `cleanup` implements
  `binding_core::Cleanup` and that of another class unit does not, and warn when an object is destroyed without its
  cleanup call: `E_WARNING`, `ResourceWarning`, or `process.emitWarning` of type `ResourceWarning` (GN-6p, B-10). The
  generated tests require kind `consumed` after the call and the warning. Go and WASM refuse such members and units by
  name. Verified by `make check`.
- The end-to-end check of `tests/e2e/classes` failed for Python, because `a<name>` built its tuple of
  arguments from a chained iterator, which `PyTuple::new` does not take (it needs an exact size), and for Node and
  WASM, because the conversion of the result of a member that waits was a closure that only called a function, which
  clippy denies (`redundant_closure`). Python now builds the tuple from a vector, and Node passes the function itself
  (GN-6m, GN-6n). Verified by `make e2e` of `tests/e2e/classes`.
- The Go C ABI of fsm did not compile (E0283, type annotations needed): `out_optional` took `impl Into<Option<T>>`, which
  an `Option<i64>` of an optional property of an error unit and the `&Option<String>` of an optional text field meet
  for two types `T`, and the generic `out_int` and `out_text` left `T` unknown. `out_optional` now takes `Option<T>`,
  given the `as_ref` of the value of the core, as in PHP, Python and Node (GN-16). Verified by `npm test` in
  `packages/ts`: 280 of 280 pass, and by `make e2e` of fsm, whose record is evidence: PHP, Python, Node and WASM passed
  (557, 556, 557 and 556 tests), and Go compiled and failed only the 20 named `from_code` tests of defect 88, whose
  input has no form in Go until the case-test entry point of GN-13 is generated.
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
  each with its reason (GN-14b). Verified by `npm test` in `packages/ts`: 289 of 289 pass, with the test of
  `tests/e2e-inputs.test.ts`.
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
  `release-assets`, `release-publish`, `release-undraft` and `release-coverage`. Verified by `make check`, whose
  test-ts, test-rust and lint-rust passed, and by `make release-coverage`, which classified every package file; the
  workflows run only after the push of `main`, so no run of them has verified them yet.
- A core with fault injection points ran `cargo test` with its points off unless the repository gave a flag or a
  dev-dependency of its own, and repositories did it in two forms. The core now has itself as a dev-dependency with
  `fault-test`, so `cargo test` without flags arms its points, and `binding check` reports a core manifest without it
  (CK-65, GN-5). The sample core of tests/e2e has that dev-dependency. Verified by `npm test` in `packages/ts`: 289 of
  289 pass, with the test of CK-65, and by `make e2e` of `tests/e2e/sample`, whose core has that dev-dependency: every
  target passed.
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
  the reason of the Node addon names its rule id (GN-3a, GN-4). Verified by `npm test` in `packages/ts`: 289 of 289
  pass, with the test that runs rustfmt on the binding crates with its defaults and with the settings of a repository.
- The result of a value alias with the entry points of `codec-test` (`in_raises`, GN-5) goes back through the rows of
  the alias (GN-13e, U-1): each target generates the entry point `_alias_round_<alias>` (Python),
  `__aliasRound<Alias>` (Node, WASM) or `<namespace>\Internal\aliasRound<Alias>` (PHP), which takes a value by the in
  function of the alias and gives the core value back by its out function, and the test of a case requires the texts of
  what it gives back to equal those of the result. Before, a result that the in function refuses or reads as another
  value passed its test, because only the out direction was compared. The round trip of a value unit without the entry
  points of `codec-test` stays open (GN-13a). Verified by `make test-ts` (276 tests); the generated tests of
  php-serialization call the entry point in each of the 601 cases that give a result, for Python, Node, WASM and PHP.
- A result that is a value alias (GN-13e) is compared as the texts of its places in pre-order, which a loop writes on
  both sides: the generator writes those of the case value by the out rows of the alias, the row whose kind and
  predicate (`utf8`, `safe_integer`, `integral_float`, `sequence_keys`) the place has and its form in the language,
  and the test writes those of the result by the type of each place with the helper `tokens` (Node, WASM, PHP) or
  `_tokens` (Python). A text names the form and the identity: an instance of a class that an out row names as
  `<unit>.constructor` (its constructor takes one value that a property of its name gives back), a PHP `stdClass` and a
  PHP reference are numbered by their first place and named again by their number. Before, a result whose out rows
  make another form than the built-in one of its kind (text for bytes, `bigint`, a value class, a list for a map, a
  `stdClass`) failed its test as not compared. Verified by `make test-ts` (275 tests), and by PHP: the texts of the
  value that PHP's own `unserialize` reads from the data of each of the 601 cases of php-serialization that give a
  result equal the texts that the generator writes.
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
- A case value of Python, Node and WASM made a new instance of the class of a reference (GN-6af) at each place of a
  reference, so two places of the same id held two references, and `serialize` wrote two values where the case names
  one shared reference (G-5: the same id is the same reference). The value now makes one instance per id, before the
  value that holds it, in an expression that names each instance: `(r0 := pkg.Reference(...), [r0, r0])[-1]` in
  Python and `(() => { const r0 = new pkg.Reference(...); return [r0, r0]; })()` in Node and WASM. Verified by
  `make test-ts` (273 tests).
- The generated tests of Python, Node and WASM held no test of a value class without `core_type` (GN-6af): its
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
  with the reason instead of refusing the target (GN-6af, GN-13). A property of a class without a lock is read without
  one, a large integer is made as a BigInt of napi 3, and the generated Node and PHP code holds no `thrown` function
  and no `Thrown::Php` variant when the contract has no callback, which `-D warnings` refused as dead code. Verified
  by `npm test` in `packages/ts` and by clippy of the four binding crates of php-serialization.
- The generator refused an error unit of a module other than the root for every target. It now generates it: PHP
  registers the class in the namespace of its module, Python gives it from `<root>.<module>` and `<root>`, and Node and
  WASM export it by its name (GN-7a, GN-11). The error unit `utf8_error` of tests/e2e/shapes is in the module
  `errors`, so the end-to-end check raises it through each target. Verified by `make e2e` of `tests/e2e/shapes`: every
  target passed, php with 66 tests, python 78, node 79, go 50 and wasm 77.
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
  runs the three to their end and names each failed one. Verified by `make check`: test-ts ran 289 tests, all passed,
  and test-rust and lint-rust passed with all features and with none.
- `binding generate` ended a refused target, after it had written the other targets, with the usage line and status 2,
  as if the command line were wrong, so a repository could not tell the refusal from a usage error. A refusal, a core
  manifest that is not the crate of the contract and a failed `cargo metadata` now end with status 1 and no usage
  line; only an error of the command line prints the usage with status 2 (GN-1c). Verified by `npm test` in
  `packages/ts`: 289 of 289 pass, with the test of GN-1c.
- A fault injection point was judged by the feature `fault-test` of binding_core, which Cargo unifies across a build,
  so one core with `fault-test` turned on the points of every core: a binding crate that left
  `polyspec-<library>/fault-test` out of its feature passed the cases that arm the points of that library. A point
  is now the macro `fault::point!`, which is judged by the feature `fault-test` of the crate that writes it, and
  `tests/point.rs` builds two cores and a binding that turns on the feature of one of them (GN-5). A core writes
  `binding_core::fault::point!(NAME)` in place of `binding_core::fault::point(NAME)`. Verified by `make test-rust`:
  `tests/point.rs` passed with all features and with none.
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
  place (CK-64). Verified by `npm test` in `packages/ts`: 289 of 289 pass, with the tests of CK-64 in
  `tests/contract-check.test.ts`.
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
  value is the nearest float with the reason of U-7. Verified by `make e2e`
  of `tests/e2e/shapes`, whose record is evidence and passed in every target (PHP 66, Python 78, Node 79, Go 50 and
  WASM 77 tests), and of `tests/e2e/sample`, whose record is evidence and passed the lint of the core in every target.
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
- No run converted a json value through a consumer of json, so `value_in` and `value_out` of json ran in no language,
  and `go.mod` required the Go module of another repository only for its records, so the Go binding of a contract that
  names the value class of json imported the package of json, which its module did not require. `tests/e2e/relay` is
  that consumer: its function `carry` takes and gives the value class of json, which is a path dependency beside it,
  and its case runners of Node, WASM, Python, PHP and Go compare the text of the value that comes back with the text of
  the value that went in, for unpaired surrogates, a paired pair, a mixed text, a key with an unpaired surrogate, a big
  integer token, a document of every kind and a value at the depth limit 256. `go.mod` now requires the Go module of
  each library whose records or value classes the contract names. The run measures with `bench.mjs`, `bench.py` and
  `bench.php` of `tests/e2e/<library>`, the median of 21 runs of carry against `parse(stringify(value))` of json with the
  load average, into `var/report/bench/`, as a warning only. Red: `make test-ts` failed 1 of 319 (the go.mod of the
  relay); Green: 319 of 319 pass (B2.87).
- A string of a value class of another repository entered a core as a list of integers: the in case of json read every
  string by `value.string_units`, so each string crossed the boundary of the language as its UTF-16 code units, and
  WASM read a built-in string unit by unit and Python by an encoding to UTF-32. A case of the kind `text` may now name
  `units`, a member that gives a list of `uint`; its `read` gives an optional `text`, which the generated code takes
  as the text of the language, and only its none, a text with an unpaired surrogate, reads the code units by `units`.
  Such a case is also the case of the kind `text16` in the round trip of CK-8, which replaces the rule that let a
  `text` row come back by a case of the kind `text16`. Python takes a `str` without a surrogate and WASM a string that
  `isWellFormed` as UTF-8 bytes. Red: `make test-ts` failed 7 of 318 (the CK-8 tests of `units` and the value class
  tests of the five targets); Green: 318 of 318 pass (B2.89).
- A text with an unpaired surrogate had no form in which it leaves a core: `binding_core::OutValue` held a text only as
  a Rust `String`, so the `out` function of json could not give the string `"\ud800"` that `polyspec_json::Value`
  holds, and a value class read a string by a member that gives a text, which json refuses for such a string.
  `OutValue::Text16(Vec<u16>)` and the kind `text16` give a text as its UTF-16 code units, unpaired surrogates
  included. An `out` row of the kind `text16` makes the value by a member of the class that takes a list of `uint`
  (json `value.from_units`), and an `in` case of the kind `text16` reads it by a member that gives one (json
  `value.string_units`) as `HostText::Utf16`, in Python, Node, PHP and WASM. A value class keeps its `text` row, so
  that a case value of the kind `text` is still made, and CK-8 lets that row come back by the case of the kind
  `text16`, because a Unicode text is the same value as its UTF-16 code units; no other pair of kinds is accepted. No built-in form makes the kind, because
  the string of PHP and Go cannot hold an unpaired surrogate (CK-8). Red:
  `make test-ts` failed 2 of 301 (CK-1 for the kind, and the refusal of the make `value.from_units` and of the case of
  the kind `text16`), and `make test-rust` failed to compile the test of `OutValue::Text16`; Green: both pass
  (B2.81). Go reads the string of a value class as node 13 of its code units and makes one from them by the function
  of the `text16` row, now that Go takes a value class (B2.80). Red: `make test-ts` failed the Go assertions of the
  kind `text16` in the generate test; Green: it passes 314 of 314.
- The generator refused the Go binding of a contract that takes or gives a value class of another repository, with
  "a value class of another repository is not generated for Go yet: the call of GN-15c has no description, read and
  making of an instance (GN-6x)", so a function that takes and gives the value class of the owner had no Go binding.
  Go now names the pointer to the owner's Go type, which package binding imports. Package binding describes an
  instance by the Go in row of the class as node 11, with the kind of its case and a handle whose question read (op 2)
  calls the read member of the case, and an instance of a class of the owner that iterates keys and values as a map
  of its entries; an error of a member of the owner is node 12, which the Go function returns unchanged. A core value
  leaves as node 11 of the result with the numbers of the class and of its out row and the content of the row, from
  which package binding makes the instance through the owner's exported function (GN-6x, GN-15c). Verified by
  `npm test` in `packages/ts` and `gofmt` and `go vet` of the generated Go module of the consumer sample with the
  owner fixture, beside the Go package generated from the owner's contract.
- The unit test of GN-6ac required nothing of the Go C ABI for `shapes.stride_count`, whose record `stride` the core
  holds with a `[usize; 2]` and a u32 field, and for `shapes.offset`, which takes u8 parameters and gives an isize. It
  now requires that the Go crate gives each field through `IntoCore` before the struct literal, narrows both u8
  parameters, and widens the isize result as an int after the assertion of its width. The generator already wrote
  these forms (the record fields since the Go change of GN-6ac); without the narrowing of the fields the test fails.
  Verified by `npm test` in `packages/ts`.
- The crate of the Go C ABI gave a list parameter to the core as a `Vec` of the table's type, u64 or a tuple of u64,
  while the core call took `&values[..]`, so the Go binding of `tests/e2e/shapes`, whose core borrows `&[usize]` in
  `width_sum` and `&[u32]` in `largest`, did not compile. The crate now turns such a list through `IntoCore` into a
  `Vec` of the core's item type, as the other crates do (GN-6ad); an item outside the core's type is kind
  `invalid_number`. Verified by `npm test` in `packages/ts`.
- The crate of the Go C ABI gave a parameter to the core in the type of the table, u64 or a tuple of u64, and read a
  tuple result by its fields `.0` and `.1`, so the Go binding of `tests/e2e/shapes`, whose core takes `[usize; 2]` in
  `span_width` and u32 in `span_at` and gives `[u32; 2]`, did not compile. The crate now gives each integer parameter
  and each integer field of a record to the core through `IntoCore`, reads a tuple result through `partsN`, and
  widens a usize result after the assertion of its width, as the other crates do (GN-6ac); a start of 2^32 is kind
  `invalid_number`. Verified by `npm test` in `packages/ts`.
- A parameter or a result of a value class of another repository, such as the class `value` of json that
  `engine.render_json.assign` of template takes, was refused in every target as "the type
  {"unit":"value","library":"json"} is not generated yet". When the owner names `core: {in, out}` and `core_type` in
  the class (CK-8), Python, Node, PHP and WASM now take an instance of the owner's class, describe it as
  `HostValue::Value` by the `by` member of its `in` row and read its content through the `read` members, an instance
  of the owner's map class as the entries of its iteration, and make a core value by the static and constructor
  members of its `out` rows through the owner's package; the owner's `in` and `out` functions are the only conversion
  (GN-6x). Go refuses it by name, because the call of GN-15c has no form of an instance yet, and a value class of
  another repository without those functions is refused by name. Verified with `make test-ts` (300 passed).
- A list parameter was given to the core as a `Vec` of the table's type, so a core that borrows `&[usize]`, `&[u32]`
  or a slice of tuples of narrower integers did not compile. Such a list now enters through `IntoCore` as a `Vec` of
  the core's item type, and the core call takes `&values[..]`; an item outside the core's type is kind
  `invalid_number` (GN-6ad). Go does not convert yet. `tests/e2e/shapes` has `shapes.width_sum` over `&[usize]` and
  `shapes.largest` over `&[u32]`, and a unit test compiles the generated WASM entry points of that fixture with its
  core with rustc for the host and for wasm32. Verified by `npm test` in `packages/ts`.
- PHP, Python, Node and WASM gave each integer to the core in the type of the table (u64 or i64), and widened a result
  only from u8, u16 and u32, so a core that takes `u32`, `usize` or `[usize; 2]`, or returns `usize`, did not compile.
  An argument, a field of a record or of a case, and a part of a tuple now enter the core through `IntoCore`, whose
  target the core call chooses: an integer narrows with `TryFrom`, and a value outside the core's type is kind
  `invalid_number`, so 2^32 is refused for a core `u32` and for `usize` on wasm32; a tuple enters as a Rust tuple or an
  array. A tuple result is read by `partsN` from a Rust tuple or an array, and `usize` and `isize` widen with `as`
  after `const _: () = assert!(usize::BITS <= 64);` (GN-6ac). A list parameter is passed as GN-6ad states, and Go does
  not convert yet. `tests/e2e/shapes` has
  `shapes.span_width` over `[usize; 2]`, `shapes.span_at` of `u32` parameters with a `[u32; 2]` result,
  `shapes.stride_count` of the record `stride`, whose core struct holds `ends: [usize; 2]` and `step: u32`, and
  `shapes.offset` of `u8` parameters with an `isize` result; a step of 2^32 and a start of 256 are kind
  `invalid_number`. The compile test of GN-6ad compiles their generated WASM entry points with the core for the host
  and for wasm32, and fails with the generator before this change. Verified by `npm test` in `packages/ts`.
- A case field of an `optional` type with the default `{literal: null}` was refused ("a field default of a case is not
  generated yet"), so a variant whose cases leave such fields out, as the template AST does, generated no target. Such
  a field may now be left out and is then null: a Python dataclass field with the default `None`, a Node and WASM
  member that is missing or `undefined` and declared optional, and null at its place in the PHP constructor; a case
  value may leave out its key (GN-6v). Any other default of a case field stays refused by name. `tests/e2e/variants`
  has the field `at` of the case `label` with this default. Verified by `npm test` in `packages/ts`.
- PHP, Python, Node and WASM refused a member that takes a tuple ("no input conversion"), while Go took it, so a
  contract with such a member generated those targets of nothing. A tuple now enters as the sequence of exactly its
  parts, a Python `tuple`, a Node and WASM `Array` and a PHP list, each part converted as its type; another value or
  another number of items is kind `invalid_argument_type` (GN-6t). `tests/e2e/shapes` has `shapes.span_length`,
  `shapes.spans_total` and `shapes.labelled`, a tuple parameter, a list of tuples and a tuple of different part
  types. Verified by `npm test` in `packages/ts` and `make e2e` of `tests/e2e/shapes`.
- The generator refused a variant unit (T-9) and a class unit with `implements`, so a contract with either generated
  no target. A variant is now the Rust enum of its `core_type`, converted both ways by a match of its cases without a
  wildcard; a field that holds the variant again is boxed; each case is a Python dataclass, a Node and WASM object of
  its tag, and a PHP final class of the variant's interface (GN-6v). A class that implements a callback interface of
  the contract has the members of the interface, which call the trait on the held value, and its instance stands for
  the callback, also in a case (GN-6w). Go refuses both by name. `tests/e2e/variants` has the variant `figure`, whose
  case `group` holds figures in a list, a box and an optional box, and the class `ribbon` that implements `tail`.
  Verified by `npm test` in `packages/ts` and `make e2e` of `tests/e2e/variants`.
- The host of Python, Node and WASM read an instance of a value class of this contract (a class without `core_type`,
  or a class that an `in` row of a value alias names) and had no form for an instance of a value class of another
  repository in the same contract. One host now holds both: an instance of a class of this contract as
  `Held::Value` with the number of its read, and an instance of a class of another repository as `Held::Foreign` with
  the read member of its `in` case, and `read` gives the content of either. The conversions of a value class of another
  repository make the host by `JsHost::new`, `PyHost::new` and, in PHP, with the field `marked`. A PHP binding of a
  contract with a value class of another repository and no callback unit and no function type did not compile,
  because a member of the owner gives its exception as `Thrown::Php`, a variant that was generated only for a callback
  or a function type; the variant is now generated for such a contract too. The PHP functions that give the interface
  of a variant and the interface of a callback that a class implements (`variant_<unit>`, `interface_<unit>`) ended
  with `panic!` when the class table did not hold the interface. They now read it through `own_interface`, which has
  no panic, and `startup` fails the start when it does not find the interface of a variant before the classes of its
  cases are registered, or the interface of a callback after the interfaces are registered (B-1, B-4, GN-6af, GN-6v,
  GN-6w, GN-6x). The function of GN-6v that tells whether an optional field of a case may be left out is
  `caseLeftOut`, because `leftOut` is the conversion of an argument that may be left out (GN-6i). The Rust cores of
  `tests/e2e/shapes` and `tests/e2e/variants` are in the form of rustfmt, which `make fmt-e2e` checks. Verified by
  `make test-ts`: 373 tests pass.
