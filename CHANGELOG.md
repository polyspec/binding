<!-- doc-id: changelog -->
# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

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
