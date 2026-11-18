// B2.552, GN-15f: when cargo metadata fails, the refusal gives the error of Cargo first and names the fetch of the
// crates of Cargo.lock only when Cargo says that a crate is missing offline. In tests/e2e/plot the cause was a
// workspace member with no Cargo.toml, which no fetch fixes.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cargoMetadataFailure } from '../src/cargo-metadata.ts';

const fetchAdvice = 'cargo fetch --locked';

test('B2.552: a missing member manifest gives the error of Cargo and no fetch advice', () => {
  const stderr = 'error: failed to load manifest for workspace member `/repo/crates/gone`\n'
    + 'referenced by workspace at `/repo/Cargo.toml`\n\n'
    + 'Caused by:\n  failed to read `/repo/crates/gone/Cargo.toml`\n\nCaused by:\n  No such file or directory (os error 2)\n';
  const message = cargoMetadataFailure(101, stderr);
  assert.match(message, /status 101/);
  assert.ok(message.includes('failed to load manifest for workspace member `/repo/crates/gone`'), message);
  assert.ok(message.includes('No such file or directory'), message);
  assert.ok(!message.includes(fetchAdvice), message);
});

test('B2.552: a crate missing offline gives the error of Cargo and the fetch advice', () => {
  const stderr = 'error: failed to download `points v0.1.0`\n\nCaused by:\n'
    + '  attempting to make an HTTP request, but --offline was specified\n';
  const message = cargoMetadataFailure(101, stderr);
  assert.ok(message.includes('failed to download `points v0.1.0`'), message);
  assert.ok(message.includes(fetchAdvice), message);
  assert.ok(message.indexOf('failed to download') < message.indexOf(fetchAdvice), message);
});

test('B2.552: a Git dependency not fetched offline gives the fetch advice', () => {
  const stderr = 'error: failed to get `polyspec-points` as a dependency of package `plot v0.1.0`\n\nCaused by:\n'
    + '  can\'t checkout from \'https://example.test/points\': you are in the offline mode (--offline)\n';
  assert.ok(cargoMetadataFailure(101, stderr).includes(fetchAdvice));
});
