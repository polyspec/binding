<!-- doc-id: checklist-execution -->
# Execution checklist

## Wave 1 — The document structure of a polyspec repository

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B1.1 | `make docs-check` runs the document check of the installed kit on the documents that `config/documents.json` selects, the changelogs and the checklists that `config/checklist.json` declares, and `make documents-stamp` writes the revision marker of a reviewed Korean twin | `Makefile`, `config/documents.json`, `config/checklist.json` | `make docs-check` | [o] |
| B1.2 | The plan and this checklist with their Korean twins, and the rule of the checklist in `AGENTS.md` | `docs/plans/execution/`(.ko), `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make docs-check` | [o] |
| B1.3 | Each Korean twin states what its English source states and carries its `source-sha256` | the Korean twins of `config/documents.json` | `make documents-stamp` lists no twin whose source moved | [o] |
| B1.4 | No tracked file names a Git commit, except the commit pin of a GitHub action and a lock; the rule is in `AGENTS.md` and a test fails a commit name in a tracked file | `AGENTS.md`(.ko), `packages/ts/tests/tracked-commits.test.ts`, `CHANGELOG.md`(.ko) | `npm test` in `packages/ts` | [o] |

## Wave 2 — Function parameters and passthrough results of a member with a state machine

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B2.86 | A member with `machine` is a method, takes a parameter of a function type and returns `passthrough` on the five targets, and the end-to-end check of the sample runs a method, a function and a static member that take a function on each (GN-6ae). PHP, Python and Go generate it; Node and WASM refuse it by name | `packages/ts/src/generate/`, `packages/core/rust`, `tests/e2e/sample`, `docs/spec/generator.md`(.ko), `docs/spec/contract-check.md`(.ko), `CHANGELOG.md`(.ko) | `make e2e REPO=tests/e2e/sample WORK=<directory>` | [~] |
| B2.86-1 | The helpers of the error of another library are `error_of_<library>` and `failure_of_<library>`, two families of GN-4c, so the crate of a contract that names a library `core`, `binding`, `failure` or `library` defines no function twice; before, `<library>_error` of the library `core` was the helper `core_error` | `packages/ts/src/generate/`, `packages/ts/tests/generate.test.ts`, `docs/spec/generator.md`(.ko), `CHANGELOG.md`(.ko) | `npm test` in `packages/ts` | [v] |
| B2.86-2 | The conversion of a unit of another repository and the conversion of an own unit share no name. Now both are `in_<library>_<name>` and `out_<library>_<name>` when the contract has an own unit named `<library>_<name>`, and the units `<a>_<b>` of the library `<c>` and `<b>` of the library `<c>_<a>` give one name too, so a family prefix alone does not part them: the name needs a form in which the library and the unit cannot be read as one another. The same name is in `make_`, `held_` and `alias_in_` of such a unit | `packages/ts/src/generate/`, `packages/ts/tests/generate.test.ts`, `docs/spec/generator.md`(.ko), `CHANGELOG.md`(.ko) | `npm test` in `packages/ts` | [ ] |
