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
- Own: Every check of the contract check has a test that fails for its own reason (PRINCIPLES P19).
  Enforced by: `npm test` in `packages/ts`
- Own: A change of the generator runs the end-to-end check of `docs/spec/generator.md` (GN-14) before its commit.
  Enforced by: none, the end-to-end check needs PHP, Python and Node with their runners, which no unit test owns.
