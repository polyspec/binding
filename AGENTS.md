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
  `wasm32-unknown-unknown` in `rust-toolchain.toml`, PHP by its minor in `.php-version`, PHPUnit in `config/phpunit` and mise in `config/toolchain.json`
  with the sha256 of each platform of the deployment targets. `make install` installs them with the utilities of
  `@polyspec/kit` into `var/tools` (rustup, the one tool of the machine, keeps the Rust toolchain, and the PHP of the
  machine is wrapped as it is), downloads only at the pinned digests, and no tool installs another tool on first use. The
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
  target. Why: a target that did not run is not verified while the run would look passed.
- Own: Every contract of `tests/e2e` names the five targets (BD-27). A target that the generator or the contract check
  refuses stays a named failure of the end-to-end check until the generator takes it; no target is left out of a
  contract, skipped or listed as an expected failure. Why: a target left out of a contract hides that the generator
  does not take its form, and a run that passes then verifies less than the rule asks.
  Enforced by: none, which targets a contract names is read in review; the end-to-end check names each refused target.
  Enforced by: `make e2e`, which fails before its first step when a tool is missing and at its end when a target ran no test.
- Own: A commit that changes the generator, `binding_core` or the end-to-end check passes the end-to-end check of that
  commit (`make e2e BINDING=<commit>`, GN-14 and GN-14b) before it is pushed or merged, and a failure is fixed by a new
  commit, which is checked the same way. Only a run whose record (`var/report/e2e/`) names it evidence of the commit
  counts. Why: a run of the working tree checks a generator that no commit holds against the `binding_core` of another
  commit, so the two can differ and the result belongs to no commit that a push or a merge carries.
  Enforced by: none, the end-to-end check needs every target with its runner, which no unit test owns; the record names
  the commit of each run.
