<!-- doc-id: changelog -->
# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- The generated Node and WASM crates of a contract with a unit named `default`, `text`, `list` or another word of a
  helper defined the function `in_<word>` or `out_<word>` twice, and a function member named `guard`, `pass`,
  `called`, `throw` or `internal` took the name of a helper of the crate: a second definition in the Node crate, and
  in the WASM crate an export that hides the helper in the module of the exports. The helpers of the Node and WASM
  crates now state their direction last (`text_in`, `list_out`, `default_in`, `function_in`, `passed_out`), and the
  entry point of a function member is `entry_<member>`, exported under the name of the member (GN-4c). Verified by
  `npm test` in `packages/ts`: the test of the sample with the enums `default`, `callable` and `text` found two
  definitions of `in_default` in the Node crate before the change, and the test of the functions `guard`, `pass`,
  `called`, `throw` and `internal` found two definitions of `guard`; both pass, and the two tests that compile
  generated WASM entry points with `rustc` pass with the new names. The 20 tests that generate the sample for Python
  or Go still fail with the refusal of those targets.
- The Node and WASM tests did not write the result of a step of a function fixture nor the marker `awaits`. A step
  that names a result is now `assert.deepStrictEqual` of its call inside the function, and a fixture with `awaits` is
  an async function, so the two cases of the sample that await run the awaited step of the machine with a promise
  that is fulfilled and with one that is rejected (GN-6ae, CK-22). Verified by `npm test` in `packages/ts`, whose
  tests of the Node and WASM fixtures pass; the 20 tests that generate the sample for Python or Go still fail with the
  refusal of those targets.
- The WASM binding refused a member with a parameter of a function type or a result `passthrough` by name. It now
  generates the member as Node does (GN-6ae): the machine owns the function as a `js_sys::Function` and calls it on
  the thread of the module with a new instance of the class of each class argument; the value that the function
  returned is held in a thread-local table of `JsValue` under a handle that is never given again; the value that the
  function threw is kept under the handle of its `Raised` and thrown again, so the caller gets the same object.
  `advance(settled)` of the `Driven` object and `drive` of the ES module take the steps of Node, `[0, promise]`,
  `[1, value]` and `[2, result]`, each advance through `state.mjs`, and the machine is freed at its end, also after
  a rejected wait. The declarations and the generated test are those of Node. Verified by `npm test` in
  `packages/ts`: the three tests of the WASM closure, of `drive` run against a played machine and of the WASM test
  pass, and the test of the WASM value alias, which generates the sample for WASM, passes again; the 20 tests that
  generate the sample for Python or Go still fail with the refusal of those targets.
- The Node binding refused a member with a parameter of a function type or a result `passthrough` by name. It now
  generates the member (GN-6ae): the machine owns the function as a reference of napi and calls it on the JavaScript
  thread with a new instance of the class of each class argument; the value that the function returned is held in a
  thread-local table under a handle that is never given again and leaves it unchanged as the result; an exception of
  the function is taken out of the environment, held, and thrown again at the end of the member, so the caller gets
  the same object. `advance(settled)` of the `Driven` object returns `[0, promise]` for a wait, `[1, value]` for a
  value that the machine awaits and `[2, result]` at the end, and `drive` of the JavaScript entry awaits the value of
  step `1`, a promise or any other value, and gives `[true, value]` or `[false, rejection]` to the next advance; a
  rejection of the promise of a wait rejects the call and is not given to the machine. The declarations name each
  `passthrough` as a type parameter, `transaction<T>(work: (arg0: Scope) => T): Promise<Awaited<T>>`. The Node test
  writes the function fixture, the case of `raises: "callback"` with the same exception object, the calls of `after`,
  and a test that a value that is no function is kind `invalid_callback`. Verified by `npm test` in `packages/ts`: the
  three tests of the Node closure, of `drive` run against a played machine (a value, a promise, a thenable, a
  rejected awaited value and a rejected wait) and of the Node test pass; the 21 tests that generate the sample for
  Python, Go or WASM still fail with the refusal of those targets.
- The generated crate of a contract with a unit named `default`, `callable`, `text`, `list` or another word of a
  helper did not compile: the conversion of the unit, `in_<unit>` or `out_<unit>`, had the name of the helper
  `in_<word>` or `out_<word>`, so the function was defined twice. The names `in_<...>` and `out_<...>` now belong to
  the conversions of units alone, and a helper states its direction last: `text_in`, `list_out`, `default_in`,
  `callable_in`, `passed_out` (GN-4c). The crates of PHP and Python apply the rule; those of Node, WASM and Go do
  not yet. Verified by `npm test` in `packages/ts`, whose test generates the PHP crate of the sample with the enums
  `default`, `callable` and `text` and requires one definition of each conversion and no other function named
  `in_<...>` or `out_<...>`; before the change that test found two definitions of `in_default`.
- No case could give a function that returns an awaitable, so the path of `Step::Await` whose awaitable settles later,
  or raises, had no case. A function fixture may now name `"awaits": true`: the function returns an awaitable of its
  language whose outcome is the `result` or the `raise` of the fixture. The contract check accepts the marker only
  with the value `true`, only for a function type with `async_allowed: true`, and inside a step only where the
  fixture of that step names it. PHP and Go have no awaitable, so there the same fixture is a plain function and a
  case with the marker runs on the five targets; the PHP test writes it so. The sample has two such cases of
  `store.transaction`: a function and a nested function that await and commit, and an awaitable that raises and
  drops its entries (CK-22, GN-6ae). Verified by `npm test` in `packages/ts`, whose tests of the marker pass.
- A step of a function fixture could not state what its call returns, so the cases of `store.transaction` called
  `scope.get` inside the function without verifying its value, and a scope that held nothing would have passed. A
  step may now name `result`, which the contract check accepts and the generated function requires before its next
  step; the PHP test writes it as an assertion inside the function. The three cases of the sample now require what
  the scope holds: the pending entry before the commit and before the raise, the entry of the outer scope inside the
  nested scope, and the entry of the nested scope in the outer one (CK-22, GN-6ae). Verified by `npm test` in
  `packages/ts`, whose tests of the function fixture pass.
- The tests of Python, Node, Go and WASM would have left out a case with `after` or `raises: "callback"` without a
  word once their target generates a function parameter, because only the PHP test writes them. Each of those test
  generators now refuses such a case by name, "after and raises "callback" are not written in the test of <Target>
  yet", until it writes them (GN-6ae, G-4). Verified by `npm test` in `packages/ts`, whose test of the refusal passes;
  the 21 tests that generate the sample for those targets still fail with the refusal of the members.
- The generated PHP extension of a contract with the classes `store` and `scope` did not compile: the conversion of a
  class named `scope` had the name `in_scope` of the helper that reads a property in the scope of a class, and a
  method with `machine` gave the core `Clone::clone(&*receiver)`, a clone of a borrow of the borrow that the lock
  gives, while the core path of the sample took `&self`. The helper is now `with_scope`; the receiver of a method with
  `machine` is `Clone::clone(receiver)`; and `Store::transaction` and `Scope::nested` of the sample core take `self`,
  as GN-6ae states (GN-6h). Found by `make e2e` of the sample, where clippy of the PHP crate failed with E0428 and
  E0308; verified by `make e2e` of the sample for PHP.
- No generated test ran a member with a parameter of a function type, and the contract of the end-to-end sample held
  no such member. The PHP test now writes the function of a function fixture, whose steps call methods on its
  arguments and which returns its result or throws; a case with `raises: "callback"` requires the same exception
  object; the calls of `after` observe the receiver after the call; and a value that is no callable is required to be
  kind `invalid_callback`. A case gives a value `passthrough` as a value of GN-13. The contract of `tests/e2e/sample`
  now holds `store` (`new`, `get`, `transaction`) and `scope` (`put`, `get`, `nested`) with three cases of
  `store.transaction`: a commit, a rollback after the function raises, and a nested scope (GN-6ae, CK-22). Python,
  Node, Go and WASM still refuse these members, so `npm test` in `packages/ts` fails 21 tests that generate the
  sample for those targets, each with that refusal, and the end-to-end check of the sample names those targets as
  failed, until each target generates the members.
- `binding_core::Passthrough` was `Send`, so a core could move it to another thread, where its drop would call the
  release function of a table that is bound to the thread of the language code, and the value would stay in the
  table. A `Passthrough` is now not `Send` (GN-6ae). `docs/core-api.md` now holds `Passthrough`, `Step::Await`,
  `Machine::settle`, the `awaited` argument of `machine::drive`, `Next::Await` and `Driving::settle`, which the crate
  had and the document did not. Verified by `make test-rust`, whose `tests/construct.rs` requires that a crate that
  sends a `Passthrough` to another thread does not compile.
- The contract check read a value of a function type as `{"function": [<row>]}`, a form that no generator wrote and
  that could not give a class argument, while GN-6ae names the function fixture. The check now reads only the function
  fixture `{"function": {"calls": [<step>], "result" | "raise"}}`: a step `{"on", "call", "args"}` calls a method of
  the class of the parameter at the position `on` with exactly its parameters, an argument of a function type of a
  step is again a fixture, and `raise` is `"exception"` or an error unit that the function recognizes. A case may
  expect `raises: "callback"`, which needs a fixture that raises `"exception"`, and a case of a method may name
  `after`, calls of methods of the receiver with their `result` (CK-22, GN-6ae). No contract or case file held the form
  of rows. Verified by `npm test` in `packages/ts`.
- PHP refused a member with a parameter of a function type or a result `passthrough` by name. The PHP binding now
  generates it: the parameter takes a `callable` (any other value is kind `invalid_callback`), from which the entry
  makes the closure that the machine calls, with each class argument as a new instance of its class; the value that
  the callable returned is held in a thread-local table under the handle of its `Passthrough`, released when the core
  drops it and returned unchanged as the result of the member; an exception of the callable is a `Raised`, which the
  caller gets as the same object; and the driver settles an awaited value at once. The stub declares `@param
  callable(<parameters>): mixed` and the result `mixed`. Python, Node, Go and WASM still refuse the member by name
  (GN-6ae). Verified by `npm test` in `packages/ts`; the generated extension is not compiled yet, because no contract
  of an end-to-end repository holds such a member until every target generates it.
- A parameter of a function type and a result `passthrough` were refused as "the type ... is not generated yet" for
  every member, so the refusal named neither the rule nor the target. The model now takes them on a member with
  `machine` only, requires the function to return `passthrough` and checks the types of its parameters; another
  member is refused with "a parameter of a function type is generated for a member with machine only" or "a result
  passthrough is generated for a member with machine only", and each target refuses such a member by name with "a
  parameter of a function type and a result passthrough are not generated for <Target> yet" until it generates them
  (GN-6ae, G-4). Verified by `npm test` in `packages/ts`.
- Two generated tests failed in `make e2e` of `tests/e2e/sample` for a reason of the generator: the Node test file
  did not load, because only the first test of a block that awaits was an async function, and the K-2 test
  `resolveSlowly lets the exception of a callback through` used `await` in a plain function; and the Go test of a
  fixture that expects no call compared its nil calls with an empty slice by `reflect.DeepEqual`, which tells them
  apart. Each test of a Node block is now async when it awaits, and a Go fixture that expects no call requires the
  length 0 of its calls (GN-6m, G-5). Verified by `npm test` in `packages/ts` and by `make e2e` of the sample.
- The end-to-end sample had no core for a transaction, so no case could show what GN-6ae generates. The sample core
  now has `Store` and `Scope`, handles whose clones share one state, with `Store::transaction` and `Scope::nested`,
  whose state machine `Scoped` begins the scope by an I/O future, calls its function on the thread of the driver,
  awaits the value of the function through `Step::Await`, commits the pending entries by an I/O future when the
  value settles, and drops them when the function or its awaitable raises. The contract members `store.transaction`
  and `scope.put/get/nested` and their cases are not added yet, because no target generates a function parameter yet
  (defect 86). Verified by `cargo clippy --all-targets` of the sample core against the binding_core of this branch.
- Two more defects kept `make e2e` of `tests/e2e/sample` from running the tests of Node, WASM and Go: the Node
  `Driven` object was made by a function `new` that returns no `Self` (clippy `new_ret_no_self`), and the Go binding
  crate held the helper `out_list`, which only the entry point `_fault_left` of the feature `fault-test` uses, in the
  build without features, which denies dead code. The Node function is `Driven::start`, and a Go helper that only the
  test entry points of a feature use carries `#[cfg(feature = ...)]` of each such feature (GN-6ab, GN-15). Verified
  by `npm test` in `packages/ts` and by `make e2e` of the sample.
- No binding crate of a contract with a member with `machine` compiled or passed its lints, so `make e2e` of
  `tests/e2e/sample` failed in every target before any test ran: PHP, Python and Go made the machine in a block that
  was the scrutinee of the match of its result (clippy `blocks_in_conditions`) and wrapped each Io future in
  `async move { io.await }` (clippy `redundant_async_block`); the WASM function `caught` returned `impl Future` from an
  `async move` block (clippy `manual_async_fn`); and the Node machine owned the callback struct that borrows the
  `Env` of the call, which the `Driven` object outlives (E0521). The machine is now a temporary of the call of
  `drive`, each Io future is polled as the machine gave it, in `armed_future` when the contract names faults,
  `caught` is an `async fn`, and a Node callback that a machine owns is the struct `Owned<Callback>`, which holds a
  reference of napi to its object and deletes it when it is dropped (GN-6ab). Verified by `npm test` in
  `packages/ts`, whose test of the WASM future compiles `caught` with rustc, and by `make e2e` of the sample.
- The generated driver of a machine passed `machine::drive` two functions and matched no `Next::Await`, so no
  binding crate compiled against the binding_core that awaits a passthrough value. PHP, Python and Go now give
  `drive` the function `|value| Ok(Ok(value))`, which settles a value at once; Node and WASM answer `Next::Await` of a
  member without a function parameter with kind `internal` that names the member, because the core makes a
  `Passthrough` only from a value that the binding gave it; the machine of the sample implements `settle` (GN-6ae).
  Verified by `make test-ts`.
- binding_core had no form for a value of language code that a machine of a member receives from a function and
  returns unchanged, and no step at which a machine hands an awaitable to its driver, so a machine of a transaction
  could neither return the value of its function nor wait for an async function. binding_core now has
  `Passthrough`, a handle of the table of the binding that the core moves without reading and whose drop gives the
  handle to the release function of the binding, `Step::Await(Passthrough)`, `Machine::settle(Result<Passthrough,
  Raised>)`, `Next::Await` and `Driving::settle`; `machine::drive` takes a third function `awaited`, which gives the
  outcome of each awaited value, and ends with its error (GN-6ae). Verified by `cargo test --all-features` and
  `cargo test` of binding_core and their clippy runs.
- A method with `wait: async_driver` that reaches language code was refused ("a method with machine is not generated,
  because its machine would borrow its receiver"), so `db.transaction`, `tx.savepoint` and `db.close` of orm were
  generated in no target. Such a method now names the receiver `&self`, and every target gives its core path a clone
  of the value of the instance, `Clone::clone(&*receiver)`, by value before its arguments, so the machine owns a
  handle whose clones share one state; `binding check` reports another receiver of a method with machine (CK-69,
  GN-6ae). A parameter of a function type, a result `passthrough` and an awaited `async_allowed` function, which GN-6ae
  states with the function fixture of a case, are not generated yet (defect 86). Verified by `npm test` in
  `packages/ts`.
- The end-to-end sample had no contract case of a callback that raises, so only the generated test K-2 of each
  target showed what a member that takes a callback does with an exception of language code. The sample now has the
  error unit `refused_error` of the kind `refused`, which `lookup.find` recognizes through `Error::recognized` (U-3),
  and the case `a_lookup_that_raises_a_recognized_error_refuses_the_key` of `sample.resolve_driven`, whose lookup
  raises that error unit in its call, so that every target expects the kind `refused` from the machine. Verified by
  `make test-ts`; the targets run the case in `make e2e`.
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
- A member with `wait: async_driver` that reaches language code, such as a function that takes a callback, was refused
  with "a member with wait async_driver that reaches language code is not generated", because a future that a runtime
  polls on its own threads would call the language code there. Such a member now names `"machine": true` in its
  `core`, and its core path returns a state machine without I/O, `binding_core::machine::Machine`, whose steps are an
  I/O future that touches no language code, a call of language code and the result. PHP drives the machine on the
  calling thread, Python `<name>` drives it with each wait outside the GIL and `a<name>` runs `<name>` in
  `asyncio.to_thread`, and Node returns a `Driven` object that the JavaScript entry advances, each call on the
  JavaScript thread and each wait on the tokio runtime of napi. `binding check` reports such a member without
  `machine` and `machine` on any other member (CK-68). Go drives the machine on the calling thread inside the call of
  its C ABI, each wait blocked on and each callback called through cgo. A machine takes its arguments by value, so
  the generated code passes a class parameter as a clone of its value. The generator refuses a method with `machine`,
  whose machine would borrow its receiver, and a parameter with a default of such a member (GN-6ab). The end-to-end sample adds `sample.resolve_driven`, whose
  machine passes an I/O step, a call of the lookup and its result, with the cases of a found key, a missing key and a
  failed read; a lookup that throws is the generated test of each member that takes a callback. Verified by
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
- The Node binding of `tests/e2e/classes` did not compile (E0515, E0597): the call bound the borrow of the guard of its
  receiver (`let receiver = &*receiver;`) before it moved the guard into the future of `Gate.enter_later` (async_driver)
  and into the closure of the pool of `Gate.enter_slowly` (blocking_io), so the future and the closure held a borrow of
  a local of the call. The future and the closure of the pool now own the guards and bind the borrows inside them
  (GN-6h). Verified by `make e2e` of `tests/e2e/classes`, whose record is evidence and passed in every target (PHP 60
  generated tests and 4 contract cases, Python 58 and 4, Node 63, Go 27 and WASM 42), and of `tests/e2e/sample`,
  `tests/e2e/shapes` and `tests/e2e/consumer`, whose records are evidence and passed in every target.
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
