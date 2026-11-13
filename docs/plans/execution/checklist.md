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
| B2.86 | A member with `machine` is a method, takes a parameter of a function type and returns `passthrough` on the five targets, and the end-to-end check of the sample runs a method, a function and a static member that take a function on each (GN-6ae). The five targets generate it | `packages/ts/src/generate/`, `packages/core/rust`, `tests/e2e/sample`, `docs/spec/generator.md`(.ko), `docs/spec/contract-check.md`(.ko), `CHANGELOG.md`(.ko) | `make e2e REPO=tests/e2e/sample WORK=<directory>` | [~] |
| B2.86-1 | The helpers of the error of another library are `error_of_<library>` and `failure_of_<library>`, two families of GN-4c, so the crate of a contract that names a library `core`, `binding`, `failure` or `library` defines no function twice; before, `<library>_error` of the library `core` was the helper `core_error` | `packages/ts/src/generate/`, `packages/ts/tests/generate.test.ts`, `docs/spec/generator.md`(.ko), `CHANGELOG.md`(.ko) | `npm test` in `packages/ts` | [v] |
| B2.86-2 | The conversion of a unit of another repository and the conversion of an own unit share no name: the conversions of a unit of another repository are the functions `in_<name>`, `out_<name>` and `make_<name>` of the module `library_<library>`, named by their path, so the unit `<a>_<b>` of the library `<c>`, the unit `<b>` of the library `<c>_<a>` and an own unit `<c>_<a>_<b>` are three functions. The entry of a member of a class of the WASM crate is `member_<member>` of the module `class_<unit>`, and the release of a class is `free_<unit>` with the export `__free_<Class>`, so two classes and a member `free` share no name (GN-4c) | `packages/ts/src/generate/`, `packages/ts/tests/generate.test.ts`, `docs/spec/generator.md`(.ko), `CHANGELOG.md`(.ko) | `npm test` in `packages/ts` | [v] |
| B2.86-3 | The C symbol of a member of a class of the Go crate, `polyspec_<library>_<unit>_<member>`, and its function of package `binding` read in two ways: the member `new_x` of the class `tag` and the member `x` of the class `tag_new` are both `polyspec_sample_tag_new_x` and `TagNewX`, two definitions. The symbol needs a form in which the class and the member cannot be read as one another (GN-4c, B-8) | `packages/ts/src/generate/`, `packages/ts/tests/generate.test.ts`, `docs/spec/generator.md`(.ko), `CHANGELOG.md`(.ko) | `npm test` in `packages/ts` | [ ] |
