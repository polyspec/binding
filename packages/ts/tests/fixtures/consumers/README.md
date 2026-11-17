<!-- doc-id: fixture-consumers -->
# Consumer contracts

[한국어](README.ko.md)

These are copies of the contracts of the consumer repositories. The copies are here because a unit test reads no other
checkout. Two kinds of copy are here.

## Cut copies

The unit test of B2.418 generates every target of each one and checks its `use` declarations (GN-4e).

- `json/interface.json` is json v0.0.32, packages/rust/interface.json. `json/contracts/core.json` is its
  contracts/core.json, cut to the first case of each group.
- `session-store/interface.json` is the contract of session-store 0.0.1, in development, packages/rust/interface.json.
  `session-store/contracts/sessions.json`, `file-sessions.json` and `redis-sessions.json` are its case files of the
  same names, each cut to the first case of each group. `session-store/php-serialization.json` is php-serialization
  v0.0.11, packages/rust/interface.json. The contract of session-store names php-serialization, so generation needs
  that contract as its foreign contract.

The case files are cut because the generated Rust files of every target are byte for byte the same with the full case
files and with the cut ones. This was checked once for both contracts when the copies were taken. The case files
change only the generated tests of each language, which the unit test does not read. The check refuses a cut copy,
because CK-22 reads a case of every kind that a member raises, so no test runs the check over these two.

## Whole copies

The unit test of B2.363 runs the check of this tree over each whole copy and generates each of its targets; the test of
B2.418 reads their `use` declarations too. The directory of a copy stands for the root of its repository:
`interface.json` is the contract, and each case file that the contract names is at its path from that root. Every file
is byte for byte the file of its source, and no case is left out, because the check reads every case.

| Copy | Source | Contract in the source |
|---|---|---|
| `php-serialization/` | php-serialization v0.0.15 | packages/rust/interface.json |
| `http-media-type/` | http-media-type v0.0.8 | packages/rust/interface.json |
| `http-cookie/` | http-cookie v0.0.8 | packages/rust/interface.json |
| `http-negotiation/` | http-negotiation v0.0.5 | packages/rust/interface.json |
| `http-form/` | http-form v0.0.1 | packages/rust/interface.json |
| `fsm/` | fsm v0.0.16 | packages/rust/interface.json |
| `template/` | template v0.0.28 | packages/rust/interface.json |
| `orm/` | orm, the branch models/declare-in-core on 2026-11-17 | packages/rust/interface.json |
| `crud-ui-validator/` | crud-ui, the branch lane/cases on 2026-11-17 | packages/validator/rust/interface.json |
| `crud-ui-generator/` | crud-ui, the branch lane/cases on 2026-11-17 | packages/generator/rust/interface.json |
| `hyper/` | hyper, the branch lane/d2-http-form on 2026-11-17 | packages/rust/interface.json |

orm, crud-ui and hyper have no release tag that holds a contract of binding (orm v0.0.33, crud-ui v0.0.20 and hyper
v0.0.40 hold none), so each copy is of the newest commit of a branch that held one on that day. A copy is taken again
from the first release tag that holds the contract.

hyper tracks only `packages/rust/tests/cases/faults.json` of its case files. The five files of
`hyper/var/binding-cases/` are what `scripts/binding-cases.mts` of hyper writes from `config/binding-cases.json` and
`contracts/` of the same commit (its target `make binding-cases`), run outside the checkout of hyper.

A contract that names another library takes the contract of that library from the copies of this directory:

| Copy | Contracts that it reads |
|---|---|
| `http-negotiation/` | `http-media-type/` |
| `template/`, `orm/`, `crud-ui-validator/` | `json/` |
| `crud-ui-generator/` | `json/`, `crud-ui-validator/` |
| `hyper/` | `template/`, `json/`, `http-negotiation/`, `http-media-type/`, `http-cookie/`, `session-store/`, `php-serialization/` |

The copy `json/` is json v0.0.32, and template, orm, crud-ui and hyper depend on json v0.0.34; hyper depends on
session-store v0.0.4 and on the branch v1/rust-core of template, and the copies are session-store 0.0.1 and template
v0.0.28.

`findings.json` records the findings that the check of this tree gives a whole copy, each with its reason and the
condition that ends it. Such a finding is a task of the repository of the copy. The test fails a finding that
`findings.json` does not record, and an entry whose finding is gone.
