<!-- doc-id: development -->
# Development

[한국어](AGENTS.ko.md)

The working principles of every polyspec repository are in [PRINCIPLES.md](PRINCIPLES.md). This file states only the
rules of this repository.

- Own: binding generates the bindings of every polyspec repository from its interface contract. The contract format is
  `packages/ts/schema/interface.schema.json`, and the rules of the generator and of the contract check are in `docs/spec/`. Why
  binding is built and in which language is in `docs/rebuild/binding.md`.
  Enforced by: none, which document owns a topic is a judgement.
- Own: `packages/core/rust` is the crate `binding_core`, the runtime support that generated crates and core crates
  depend on; `packages/ts` is the generator and the contract check. A change of the public API of `binding_core` changes
  `docs/core-api.md` in the same commit.
  Enforced by: none, no tool compares the crate with the document.
- Own: Rust code follows the lints of R-1: `unwrap_used`, `expect_used`, `let_underscore_must_use` and
  `let_underscore_untyped` deny, and `clippy.toml` disallows the `unwrap_or` and `map_or` families of `Option` and
  `Result::ok`; a remaining use carries `#[allow(..., reason = "<rule id>")]`.
  Enforced by: `cargo clippy --all-targets -- -D warnings` in `packages/core/rust`
- Own: Every tool whose release changes a result of a check is pinned in a tracked file and installed into the
  checkout: Node.js, npm, Go, Python, Composer, the wasm-bindgen CLI and maturin in `mise.toml` with their digests in `mise.lock`
  (npm also in `devEngines` of `package.json`), Rust with its components (`llvm-tools`, whose `llvm-nm` reads symbols) and the target
  `wasm32-unknown-unknown` in `rust-toolchain.toml`, PHP by its minor in `.php-version`, PHPUnit in `config/phpunit`, the LLVM whose libclang and clang the bindgen of
  the PHP target uses by its major release in `config/toolchain.json`, and mise in `config/toolchain.json`
  with the sha256 of each platform of the deployment targets. `make install` installs them with the utilities of
  `@polyspec/kit` into `var/tools` (rustup, the one tool of the machine, keeps the Rust toolchain, and the PHP of the
  machine is wrapped as it is, and `make install-tools` fails when its minor is not that of `.php-version` (`scripts/php-minor.mts`); the LLVM of the machine is used as it is, and `make e2e` checks its major release), downloads only at the pinned digests, and no tool installs another tool on first use. The
  wasm-bindgen CLI is the release of the `wasm-bindgen` crate of the generated manifests (GN-18), because the CLI reads only
  a module of its own release. Why: a result of a tool that the repository does not pin cannot be repeated, so it is a
  diagnosis and not evidence.
  Enforced by: `make install`, whose `mise install --locked` fails a tool that `mise.lock` does not pin.
- Own: A link setting of a binding crate is in a build script of that crate, and never in `RUSTFLAGS` or
  `.cargo/config.toml`: the PHP extension links on macOS by its `build.rs` (GN-3d, BD-9). Why: a build script applies to
  that crate wherever Cargo starts, while `rustflags` apply to every crate, and `.cargo/config.toml` holds only below the
  directory where Cargo starts and gives way to `RUSTFLAGS`, so the same tree would link differently by how it is built.
  Enforced by: `npm test` in `packages/ts`, whose test of BD-9 compares the scaffold with the build script; CK-19 compares
  a repository's build script with it.
- Own: Every check of the contract check has a test that fails for its own reason (PRINCIPLES P19).
  Enforced by: `npm test` in `packages/ts`
- Own: The end-to-end check runs every target of the contract on the tools of the checkout, and a target whose tool
  is missing fails the run with the target, the tool and `make install` (GN-14a). Each target generates, builds and
  tests on its own to its end, and the run names every failed target with its causes (GN-14c). No switch leaves a
  target out or adds one, and a report of a run names a lint apart from a test: a lint runs no code, so it verifies no
  target. The copy of a repository gets only the changes that take the binding of the run (GN-14d), and a defect of
  the repository is a named failure of the run, never repaired in the copy. Why: a target that did not run is not
  verified while the run would look passed, and a defect that the copy repairs passes the run and stays in the
  repository.
  Enforced by: `make e2e`, which fails before its first step when a tool is missing and at its end when a target ran no test.
- Own: Every contract of `tests/e2e` and the contract of the fixture repository of the unit tests
  (`packages/ts/tests/fixtures/repo`) name the five targets (BD-27). A target that the generator or the contract check
  refuses stays a named failure of the end-to-end check, and a refusal of the fixture is asserted by its unit test,
  until the generator takes it; no target is left out of a
  contract, skipped or listed as an expected failure. Why: a target left out of a contract hides that the generator
  does not take its form, and a run that passes then verifies less than the rule asks.
  Enforced by: none, which targets a contract names is read in review; the end-to-end check names each refused target.
- Own: A commit that changes the generator, `binding_core` or the end-to-end check passes the end-to-end check of that
  commit (`make e2e BINDING=<commit>`, GN-14 and GN-14b) before it is pushed or merged, and a failure is fixed by a new
  commit, which is checked the same way. Only a run whose record (`var/report/e2e/`) names it evidence of the commit
  counts: no file of the closed list `READ_FROM_CHECKOUT` of `scripts/e2e-inputs.mts` differs from the commit, and a
  tracked file that a run reads is added to that list in the change that adds it. Why: a run of the working tree checks a generator that no commit holds against the `binding_core` of another
  commit, so the two can differ and the result belongs to no commit that a push or a merge carries.
  Enforced by: none, the end-to-end check needs every target with its runner, which no unit test owns; the record names
  the commit of each run.
- Own: `.github/workflows/ci.yml` runs on the push of `main` and on a manual run, one job per matrix entry: `ts` runs
  `typecheck-ts`, `unit-ts` and `release-coverage`, and `rust` runs `test-rust-features`, `test-rust-plain`,
  `clippy-rust-features`, `clippy-rust`, `fmt-rust` and `fmt-e2e`, so the jobs run every target of `make check` once. Each job runs
  them with `make ci-check`, whose `make ci-targets` runs every target to its end and writes the report `var/ci/<name>/`, and the last
  job `ci-passed` passes only when every other job passed. The jobs run on `ubuntu-26.04-arm`, except `e2e-amd64` on
  `ubuntu-26.04` (GN-14g), pin every action by its
  commit and set no `timeout-minutes`, and `.github/actions/bootstrap` is
  the bootstrap of every job. The job `e2e` runs the end-to-end check of each repository of `tests/e2e`, one entry of its
  matrix per repository with the repositories that its core depends on (`DEPS`): `make ci-e2e` installs every tool with
  `make install-tools`, runs `make e2e` in a work directory of its own outside the checkout, then runs `make go-musl-check` on it
  when the check passed and the repository is no refusal fixture (GN-14k), whose run makes no released form, and the job uploads
  the record `var/report/e2e/`; the job `e2e-amd64` does the same for `tests/e2e/sample` on linux/amd64 (`make ci-e2e-amd64`); an entry
  whose run fails stays in the matrix. A contract of `tests/e2e` whose core depends on a repository that is not in
  `tests/e2e` has no entry until a tracked file of the contract names a release tag of that repository, and
  `tests/e2e/not-in-ci.json` lists it with its reason and the condition that ends it (GN-14g). The end-to-end check of another repository is no job of the workflow: it needs a
  checkout of that repository, and the rule above requires its run of a commit before that commit is pushed or merged.
  Why: a release takes the id of a run whose every job passed, a step that runs a tool directly would miss the settings
  of the Makefile, and a release is built and used on Linux, where only the job `e2e` runs the five targets and the
  released form of the Go module (GN-14f).
  Enforced by: `npm test` in `packages/ts`, whose `tests/ci-workflow.test.ts` reads the workflow; `make ci-passed` judges
  the jobs of a run.
- Own: Every job of a workflow of this repository (`.github/workflows/ci.yml`, a workflow that it calls, and
  `.github/workflows/release.yml`) has exactly one
  `run:` step, `make ci-<job>` with make variables only, and the recipe `ci-<job>` of the Makefile holds the order and
  the conditions of the job: it installs first and stops when an install fails, then runs its checks, each to its end,
  then cleans up and reports in every case, and its status is that of its installs and its checks. A value of the
  matrix is passed as `NAME=${{ matrix.key }}`, and no other expression appears in a run line, except
  `${{ toJSON(needs) }}` in the one run step of `ci-passed`, the job that judges the results of the other jobs and
  exists only in CI. A value that the trigger gives, such as the run id of `release`, is a job-level `env:` that the recipe reads. Every other step is a `uses:` step that provisions the runner or carries a result (the checkout,
  a setup action, `.github/actions/bootstrap`, `actions/upload-artifact`), and only a `uses:` step has an `if:`. What
  a step would compute from `steps` or from the outcome of another step, such as the outcome of a setup step in the
  summary or whether `make go-musl-check` runs, the recipe computes itself. A local run of a job is the same call, such
  as `make ci-check NAME=ts TOOLS=rust TARGETS="typecheck-ts unit-ts release-coverage"` or `make ci-e2e
  REPO=tests/e2e/sample`; a release is `make ci-release RUN=<id>`. A recipe runs no `sudo` and changes no setting of
  the machine. Why: an expression or a
  condition of a step is evaluated by the runner of GitHub, so a job whose content is in its YAML cannot run the same
  way on another machine, and a run that differs from CI is a diagnosis and not evidence of CI; a step that runs a
  tool directly would also miss the settings of the Makefile.
  Enforced by: `npm test` in `packages/ts`, whose `tests/ci-workflow.test.ts` reads the steps of each job and runs the
  recipes `ci-check`, `ci-e2e`, `ci-e2e-amd64` and `ci-release` with a stand-in of make, and reads the job of `release.yml`.
- Own: `config/release.json` classifies every package file (`make release-coverage`). A tag `vX.Y.Z` releases the
  generator `packages/ts` as the npm archive `polyspec-binding-X.Y.Z.tgz` of the GitHub Release, which `npm pack` builds
  with the prepack script `npm run build`, and the crate `binding_core` of `packages/core/rust` as the Git tag, which a
  Cargo dependency names with `tag = "vX.Y.Z"`; no registry holds either, because until version 0.1 a repository takes
  another polyspec repository by a GitHub tag or a release asset. The version-bump commit `chore(release): Release X.Y.Z`
  sets X.Y.Z in `packages/ts/package.json` with its lock and in `packages/core/rust/Cargo.toml`, and renames
  `## Unreleased` of both changelogs to `## X.Y.Z`, with a new empty `## Unreleased` above it. When the CI run of that
  push to `main` succeeds, `.github/workflows/release.yml` starts by itself, and `gh workflow run release.yml -f run=<id>`
  starts it again: its one step `make ci-release` runs `make release-tag`, which creates and pushes the annotated tag `vX.Y.Z` at that commit, and `make
  release-assets`, `make release-publish` and `make release-undraft` build the archive and create the GitHub Release. No
  tag is created by hand. Why: the release is the commit that a successful run checked, and its version is the version of
  every manifest that it releases.
  Enforced by: `make release-coverage`, which fails a package file that `config/release.json` does not classify; `make
  release-tag`, which tags only the commit of a successful run.
- Own: `make docs-check` reads each document that `config/documents.json` selects on its own with the document check of
  the installed `@polyspec/kit`: its links, anchors and fences, the changelogs, and the checklists of `docs/plans/<plan>/`
  that `config/checklist.json` declares. Every English document has a Korean twin `.ko.md` with the same `doc-id`, and the
  twin holds `source-sha256`, the sha256 of its English file, which `make documents-stamp PATHS=<twin>` writes after the
  translation is reviewed. Run `make docs-check` before a commit. Why: every polyspec repository keeps the same structure
  of documents, and a broken link or a twin that says another thing than its source misleads its reader.
  Enforced by: `make docs-check`; whether a twin says what its source says is judged by review.
- Own: This repository has one checklist, `docs/plans/execution/checklist.md`, with its twin; `docs/plans/execution/plan.md`
  holds the background and the dependencies of each wave. A task ID has the form `B<wave>.<number>`, a sub-task adds
  `-<number>`, and a row holds the ID, the task, its deliverables, its verification command and its state. Split a task
  into sub-items or add tasks to it; do not create another checklist. Why: one list of tasks with their verification
  commands shows what is done and how it was checked.
  Enforced by: `make docs-check`
- Own: No tracked file names a Git commit, of this repository or of another, except where a tool requires the commit:
  a GitHub action is pinned by its commit on its `uses:` line, and a lock records what its package manager resolved. A
  copy of a consumer contract, a `.json` file under `packages/ts/tests/fixtures/consumers/`, is that contract's data as
  it is and names no commit; the README beside it is held to this rule. The
  evidence of a run, such as the commit that an end-to-end run checked, is in its record under the ignored
  `var/report/`; a changelog entry or a document states what was verified, by which command, on which inputs. Why: a
  commit name says nothing to a reader who does not look it up, it does not survive a history that is rewritten or
  shallow, and a fact that a reader needs belongs in the sentence itself.
  Enforced by: `npm test` in `packages/ts`, whose `tests/tracked-commits.test.ts` fails a token of a commit name in a
  tracked file.
- Own: A commit message holds no footer and no identity line of an AI tool, such as a co-author trailer. The hook
  `commit-msg` of `.githooks` refuses such a message before the commit exists, through the rules `commit-ai-footer` and
  `commit-ai-identity` of `check-commits` of kit (`make commit-msg-hook`); `make hooks` points `core.hooksPath` of a
  checkout, and so of its worktrees, at `.githooks`, and a checkout runs it once. Why: a push publishes what a commit
  holds, and a commit that was pushed is not written again.
  Enforced by: the hook `commit-msg` in a checkout where `make hooks` ran; `make hooks-check` fails a checkout without it.
