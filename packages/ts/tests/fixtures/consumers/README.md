<!-- doc-id: fixture-consumers -->
# Consumer contracts

[한국어](README.ko.md)

These are copies of the contracts of two consumer repositories. The unit test of B2.418 generates every target of
each one and checks its `use` declarations (GN-4e). The copies are here because a unit test reads no other checkout.

- `json/interface.json` is json v0.0.32, packages/rust/interface.json. `json/contracts/core.json` is its
  contracts/core.json, cut to the first case of each group.
- `session-store/interface.json` is the contract of session-store 0.0.1, in development, packages/rust/interface.json.
  `session-store/contracts/sessions.json`, `file-sessions.json` and `redis-sessions.json` are its case files of the
  same names, each cut to the first case of each group. `session-store/php-serialization.json` is php-serialization
  v0.0.11, packages/rust/interface.json. The contract of session-store names php-serialization, so generation needs
  that contract as its foreign contract.

The case files are cut because the generated Rust files of every target are byte for byte the same with the full case
files and with the cut ones. This was checked once for both contracts when the copies were taken. The case files
change only the generated tests of each language, which the unit test does not read.
