// GN-14, GN-5: the end-to-end check lints each binding crate twice, with the test features of its manifest and without
// a feature. A crate that is only ever built with its test features hides an import or a helper whose only users are
// entry points of a feature, which the lints of the workspace deny in the build that a release makes.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindingLints, testEntrySymbol } from '../../../scripts/e2e-lint.mts';

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

test('a test entry point of the Go static library is the prefix of its contract, two underscores and the entry, and no symbol of a member is one (GN-5, GN-17)', () => {
  const entry = testEntrySymbol('polyspec_sample');
  for (const name of ['panic_test', 'panic_test_held', 'echo_latin1', 'arm_faults', 'fault_left', 'alias_in_data', 'native_count', 'thrown_count', 'number_in']) {
    assert.match(`0000000000000000 T _polyspec_sample__${name}`, entry, name);
    assert.match(`0000000000000000 T polyspec_sample__${name}`, entry, name);
  }
  // The member echo_x of the class tag, the member panic_test of the class tag and the function echo_x of the module
  // tag are symbols of members: a name of the contract follows the one underscore after the prefix.
  for (const symbol of ['polyspec_sample_tag__echo_x', 'polyspec_sample_tag__panic_test', 'polyspec_sample_tag___echo_x', 'polyspec_sample_tag___gate__native_count', 'polyspec_sample_echo_x']) {
    assert.doesNotMatch(`0000000000000000 T _${symbol}`, entry, symbol);
  }
  // The entries that every build holds are no test entry points.
  for (const name of ['free', 'alloc', 'release_tag']) assert.doesNotMatch(`0000000000000000 T _polyspec_sample__${name}`, entry, name);
  // The prefix is that of the contract alone: the library sample_two is not read as the library sample.
  assert.doesNotMatch('0000000000000000 T _polyspec_sample_two__panic_test', entry);
  const script = String(readFileSync(new URL('../../../scripts/e2e.mts', import.meta.url)));
  assert.match(script, /testEntrySymbol\(extensionOf\(p\.contract\)\)/);
  assert.doesNotMatch(script, /polyspec_\[a-z0-9_\]\*__/);
});
