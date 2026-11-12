<!-- doc-id: rebuild-bindgen -->
# Rebuild record: bindgen

[한국어](bindgen.ko.md)

PRINCIPLES S1 and P14 require an existing tool to be used when one fits. This record states what bindgen must do, the
tools judged against those requirements, the verdict for each, and the implementation language that follows (S9).

## Requirements

bindgen reads one interface contract per repository (`contracts/interface.json`, schema `schema/interface.schema.json`)
and the core crate, and produces the bindings and their declarations. A tool fits only when it meets all of the
following, because each one is a rule that every repository's bindings must keep (design ids of `docs/spec/`):

- R1 Targets: one contract yields PHP (ext-php-rs), Python (PyO3, abi3), Node (napi-rs), Go (cgo over a C ABI layer)
  and browser WASM (wasm-bindgen) bindings, each with its declarations: PHP stub, `.pyi`, `.d.ts` (I-1, I-4).
- R2 Error classes: every category (`value`, `type`, `io`, `store`, `busy`, `internal`) has one base class per language
  from the contract's table, error units extend a declared `parent` or that base class, a kind overrides its class only
  with an error unit of the same category, every error exposes `kind`, `status` and `errno` in one form per language,
  and Go errors match through `As` along the same chain (E-1 to E-7, B-4).
- R3 Callbacks: language objects implement core traits; the contract states for each member whether it may return a
  Promise or awaitable (`async_allowed`), how a language exception crosses the core (`propagate`, `{kind}`,
  `{recognize}`), and the thread rule (`owner` refuses another thread with kind `wrong_thread`); a callback object is
  checked when it is received (U-3, B-5b).
- R4 Wait forms: `none`, `blocking_io`, `process_wait` and `async_driver` are four distinct forms per language (Node
  `AsyncTask` on the libuv pool versus a dedicated thread with a `ThreadsafeFunction`; Python `py.detach` plus a
  generated `a<name>` awaitable), proven by distinct token types in the core signature, and the busy rule B-5c is
  generated from the receiver (U-2).
- R5 Contract first: the language-neutral contract, not the Rust source, is the declaration of the public API. Names are
  word lists converted by one rule per language, and an exception needs a rule id; the package layout, inheritance,
  `changes` and `cases` are in the contract; bindgen does not parse Rust source, and the agreement of contract and core
  is decided by compiling the generated crate (I-2, I-3, N-1 to N-3).

## Tools judged

Versions are the latest releases on crates.io, npm or the project's tags on 2026-11-12. "Yes" means the tool meets the
requirement as shipped; "no" names the part that is missing.

| Tool and version | R1 targets | R2 error classes | R3 callbacks | R4 wait forms | R5 contract first | Verdict |
|---|---|---|---|---|---|---|
| uniffi 0.32.2, with uniffi-bindgen-go 0.7.1+v0.31.0, uniffi-bindgen-react-native 0.31.0-7, uniffi-bindgen-node 0.1.5 | No: Kotlin, Swift, Python (ctypes, not PyO3) and Ruby are built in; Go, WASM and Node are third-party, the Node one is in early development; no PHP | No: one exception class per error enum with a subclass per variant; no base class per category and no declared parent | Partly: callback interfaces and foreign traits exist; no thread rule, no recognize mode | No: sync or `async fn`; no distinction of short blocking I/O from waiting on another process, no busy rule | No: the API is read from Rust proc macros or UDL | Not usable |
| diplomat 0.17.0, diplomat-tool 0.17.0 | No: C, C++, JS (WASM), Dart, Kotlin, Python (nanobind); no PHP, Go or Node addon | No: a `Result` becomes one exception per backend; no hierarchy | Partly: traits on some backends only | No: no async model | No: the API is a `#[diplomat::bridge]` Rust module | Not usable |
| interoptopus 0.16.6 | No: C# is the only maintained backend; C and Python (CPython) are suspended | No | Partly: callbacks and services | Partly: async services through Tokio for C# | No: `#[ffi]` attributes on Rust items | Not usable |
| cbindgen 0.29.4 with a hand-written wrapper per language | No: it writes a C header only; every language layer would be written by hand, which L-2 and G-5 forbid | No | No | No | No: it reads Rust source | Not usable as the generator; a C header writer is a candidate for the Go C ABI layer (see below) |
| alef 0.129.1 | Yes in name: PyO3, napi-rs, a PHP extension on ext-php-rs, cgo over a C FFI layer, wasm-bindgen, with stubs and `.d.ts` | No: one Python exception per Rust error variant under one base per error enum (`create_exception!`); no category base table, no declared parent, no `kind`/`status`/`errno` form | Partly: a "trait bridge" exists; no `owner` thread rule, no `async_allowed` per member, no recognize mode | No: sync wrappers release the GIL and async functions get generic wrappers, but a call is either sync or async: there is no distinction of short blocking I/O (libuv pool) from waiting on another process (dedicated thread), no `Io`/`ProcessWait` proof in the core signature, and no busy rule | No: `alef extract` reads Rust source with `syn` into its own IR, and per-language config sections rename and reshape items | Not usable; adopting it would mean replacing its extractor, its error model and its wait model, which is the whole generator |
| boltffi 0.32.1 | No: Swift, Kotlin, Java, C#, WASM/TypeScript, Python, C; Go planned; no PHP, no Node addon | No: errors become native exceptions without a hierarchy | Partly: functional interfaces | Partly: async maps to each runtime's future type; no blocking distinction | No: `#[export]`/`#[data]` on Rust items | Not usable |
| flapigen 0.12.3 | No: Java and C++ | No | Partly | No | No: `foreign_class!` in Rust | Not usable |
| safer-ffi 0.1.13 | No: a C ABI and C header | No | No | No | No | Not usable as the generator |
| ext-php-rs 0.16.4 | PHP only | Partly: an exception class can be registered with a parent; the hierarchy must still be generated | Partly: zval calls | n/a | No: Rust macros | Used as the PHP target runtime (I-4); it is what the generated code calls |
| PyO3 0.30.1 | Python only | Partly: `create_exception!` with a base | Yes: `Py<PyAny>` calls | Partly: `py.detach`; pyo3-async-runtimes for awaitables | No: Rust macros | Used as the Python target runtime (I-4) |
| napi 3.16.2, napi-derive 3.7.1 | Node only (its WASI target is not the browser wasm-bindgen target of I-4) | Partly: errors carry a status, no class hierarchy | Yes: `ThreadsafeFunction` | Yes: `AsyncTask`, `async fn` | No: Rust macros; it writes `.d.ts` from Rust items | Used as the Node target runtime (I-4) |
| wasm-bindgen 0.2.130 | Browser only | No | Partly: JS imports | Partly: Promise through wasm-bindgen-futures | No: Rust macros | Used as the WASM target runtime (I-4) |
| typeshare 1.0.5 | Types only: Swift, Go, Python, Kotlin, Scala, TypeScript | No | No | No | No: reads Rust source | Not usable: it declares data types and generates no binding |
| specta 1.0.5, tsify 0.5.8 | Types only: TypeScript | No | No | No | No: Rust derive | Not usable for the same reason |

## Verdict

No surveyed tool meets the five requirements. The nearest, alef, covers the targets, but its input is the Rust source,
its error model is a class per Rust variant, and its wait model has no distinction between short blocking I/O and
waiting on another process; each of these is a rule of R2, R4 and R5, so using it would mean replacing those parts of
it. bindgen is therefore built, and it uses the per-language frameworks as they are: the generated code calls
ext-php-rs, PyO3, napi-rs, wasm-bindgen and cgo, and bindgen does not reimplement any of them (P14). A C header writer
for the Go C ABI layer (cbindgen 0.29.4) is judged again when the Go target is built; that layer is generated from the
contract, so the header can be generated with it.

## Implementation language

bindgen is written in TypeScript, checked by `tsc` with `erasableSyntaxOnly`, and run by Node:

- S9 states that cross-language orchestration and checks are TypeScript. bindgen reads one contract and writes code for
  five languages and the contract check judges rules that span them (inheritance, Go names, value round trips), so it
  is cross-language orchestration and a cross-language check.
- The S9 exceptions keep their own languages: the symbol extractors of `check-host` (I-1) run each ecosystem's tool
  (`tsc`, Python `inspect`, PHP Reflection), and the per-language generated tests run on each standard runner (S3).
- The runtime support that generated Rust code links against is a Rust crate, `bindgen_core` (packages/core/rust),
  because it is a dependency of the generated crates and of the core crates, not orchestration.
- The schema is validated with Ajv (JSON Schema 2020-12) rather than a validator of bindgen's own (P14).
