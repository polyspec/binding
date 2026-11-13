<!-- doc-id: checklist-execution -->
# Execution checklist

## Wave 1 — The document structure of a polyspec repository

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B1.1 | `make docs-check` runs the document check of the installed kit on the documents that `config/documents.json` selects, the changelogs and the checklists that `config/checklist.json` declares, and `make documents-stamp` writes the revision marker of a reviewed Korean twin | `Makefile`, `config/documents.json`, `config/checklist.json` | `make docs-check` | [o] |
| B1.2 | The plan and this checklist with their Korean twins, and the rule of the checklist in `AGENTS.md` | `docs/plans/execution/`(.ko), `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make docs-check` | [o] |
| B1.3 | Each Korean twin states what its English source states and carries its `source-sha256` | the Korean twins of `config/documents.json` | `make documents-stamp` lists no twin whose source moved | [o] |

## Wave 2 — Defects of the generator

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B2.38 | A value class of another repository is taken and given through the core functions of its owner (GN-6x, CK-8): a parameter or a result of the class `value` of json, such as `engine.render_json.assign` of template, was refused in every target as "the type {"unit":"value","library":"json"} is not generated yet"; the owner names `core: {in, out}` and `core_type` in the class, the consumer describes an instance by the `in` row of the class and makes a value by its `out` rows in Python, Node, PHP, WASM and Go | `docs/spec/generator.md`(.ko), `docs/spec/contract-check.md`(.ko), `packages/ts/src/check.ts`, `packages/ts/src/generate/`, `packages/ts/tests/`, `CHANGELOG.md`(.ko) | `make test-ts`; `make e2e` of template with json as a dependency, whose record has `evidence: true` | [~] |
| B2.80 | A value class of another repository is generated for Go (GN-6x, GN-15c): the generator refuses it by name, because the call of GN-15c has no description of an instance, no host question that reads it and no node that makes one; the Go branch adds the three | `packages/ts/src/generate/go.ts`, `packages/ts/src/generate/go_rust.ts`, `packages/ts/tests/generate.test.ts`, `docs/spec/generator.md`(.ko), `CHANGELOG.md`(.ko) | `make test-ts`; `make e2e` of template with json as a dependency, whose record has `evidence: true` | [ ] |
