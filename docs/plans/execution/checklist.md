<!-- doc-id: checklist-execution -->
# Execution checklist

## Wave 1 — The document structure of a polyspec repository

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B1.1 | `make docs-check` runs the document check of the installed kit on the documents that `config/documents.json` selects, the changelogs and the checklists that `config/checklist.json` declares, and `make documents-stamp` writes the revision marker of a reviewed Korean twin | `Makefile`, `config/documents.json`, `config/checklist.json` | `make docs-check` | [o] |
| B1.2 | The plan and this checklist with their Korean twins, and the rule of the checklist in `AGENTS.md` | `docs/plans/execution/`(.ko), `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make docs-check` | [o] |
| B1.3 | Each Korean twin states what its English source states and carries its `source-sha256` | the Korean twins of `config/documents.json` | `make documents-stamp` lists no twin whose source moved | [o] |
| B1.4 | No tracked file names a Git commit, except the commit pin of a GitHub action and a lock; the rule is in `AGENTS.md` and a test fails a commit name in a tracked file | `AGENTS.md`(.ko), `packages/ts/tests/tracked-commits.test.ts`, `CHANGELOG.md`(.ko) | `npm test` in `packages/ts` | [o] |

## Wave 2 — Defects of the generator

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| B2.96 | A release carries the Go module of a library (GN-15g, GN-14f, CK-19): no consumer could take a Go module, because the generated Go files and the static library are no tracked files and the generated code named no directory of the library; `binding generate` names the directory of the library of each platform inside the module, the specification states the commit and the tag `packages/go/vX.Y.Z` of a release and the files that CK-19 compares, and the end-to-end check tests a consumer that requires the module at its tag. Open: the link of several static libraries in one program on Linux, and the size of a library | `docs/spec/generator.md`(.ko), `docs/spec/contract-check.md`(.ko), `packages/ts/src/generate/go.ts`, `scripts/e2e.mts`, `scripts/go-release.mts`, `packages/ts/tests/`, `CHANGELOG.md`(.ko) | `make test-ts`; `make e2e` of `tests/e2e/sample`, and of `tests/e2e/plot` with `tests/e2e/points`, whose records have `evidence: true` | [~] |
| B2.97 | The Go module links on musl (GN-15g): a consumer on musl compiles the file of its `<GOOS>_<GOARCH>` and fails to link the library of the GNU C library, because a build constraint of Go does not tell the C library apart; expected is a library that links on both, or a named refusal | `docs/spec/generator.md`(.ko), `packages/ts/src/generate/go.ts`, `packages/ts/tests/generate.test.ts`, `CHANGELOG.md`(.ko) | `make test-ts`; `make e2e` of `tests/e2e/sample` on a Linux with musl | [ ] |
| B2.98 | The end-to-end check of `tests/e2e/plot` with `tests/e2e/points` runs in CI, so the released form of the Go module (GN-14f) is tested on Linux: `.github/workflows/ci.yml` runs no end-to-end check, so the link of the static libraries of two Go modules in one program is tested on `darwin_arm64` alone. Needs first: the targets php, python and wasm of plot pass, and the checkout of a CI job holds the branch that the manifests of `tests/e2e` name for `polyspec-binding-core` | `.github/workflows/ci.yml`, `Makefile`, `packages/ts/tests/`, `AGENTS.md`(.ko), `CHANGELOG.md`(.ko) | `make test-ts`; `make ci-passed` of the run of the push | [ ] |
