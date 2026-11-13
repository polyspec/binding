<!-- doc-id: checklist-execution -->
# Execution checklist

## Wave 1 — The document structure of a polyspec repository

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B1.1 | `make docs-check` runs the document check of the installed kit on the documents that `config/documents.json` selects, the changelogs and the checklists that `config/checklist.json` declares, and `make documents-stamp` writes the revision marker of a reviewed Korean twin | `Makefile`, `config/documents.json`, `config/checklist.json` | `make docs-check` | [o] |
| B1.2 | The plan and this checklist with their Korean twins, and the rule of the checklist in `AGENTS.md` | `docs/plans/execution/`(.ko), `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make docs-check` | [o] |
| B1.3 | Each Korean twin states what its English source states and carries its `source-sha256` | the Korean twins of `config/documents.json` | `make documents-stamp` lists no twin whose source moved | [o] |
| B1.4 | No tracked file names a Git commit, except the commit pin of a GitHub action and a lock; the rule is in `AGENTS.md` and a test fails a commit name in a tracked file | `AGENTS.md`(.ko), `packages/ts/tests/tracked-commits.test.ts`, `CHANGELOG.md`(.ko) | `npm test` in `packages/ts` | [~] |
