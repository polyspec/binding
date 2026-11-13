// GN-14, GN-5: the end-to-end check lints each binding crate twice, with the test features of its manifest and without
// a feature. A crate that is only ever built with its test features hides an import or a helper whose only users are
// entry points of a feature, which the lints of the workspace deny in the build that a release makes.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindingLints } from '../../../scripts/e2e-lint.mts';

test('each binding crate is linted with its test features and without a feature, both with -D warnings (GN-14, GN-5)', () => {
  const lints = bindingLints('/copy/Cargo.toml', 'polyspec-sample-node', 'panic-test,codec-test');
  assert.deepEqual(lints.map((lint) => lint.what), ['with its test features', 'without features']);
  const [withFeatures, plain] = lints;
  assert.deepEqual(withFeatures?.argv, ['clippy', '--manifest-path', '/copy/Cargo.toml', '-p', 'polyspec-sample-node', '--all-targets', '--features', 'panic-test,codec-test', '--', '-D', 'warnings']);
  assert.deepEqual(plain?.argv, ['clippy', '--manifest-path', '/copy/Cargo.toml', '-p', 'polyspec-sample-node', '--all-targets', '--', '-D', 'warnings']);
  for (const lint of lints) assert.deepEqual(lint.argv.slice(-3), ['--', '-D', 'warnings'], lint.what);
  assert.ok(!(plain?.argv ?? []).includes('--features'));
});

test('the script of the end-to-end check runs the lints of bindingLints and names each in the outcome of its target (GN-14)', () => {
  const script = new URL('../../../scripts/e2e.mts', import.meta.url);
  const source = String(readFileSync(script));
  assert.match(source, /for \(const lint of bindingLints\(/);
  // No lint of a binding crate is written beside the list, where it could keep one form only.
  assert.doesNotMatch(source, /run\('cargo', \['clippy'[^\n]*crateSuffix/);
});
