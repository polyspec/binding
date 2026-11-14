// GN-14, GN-5: the end-to-end check lints each binding crate twice, with the test features of its manifest and without
// a feature. A crate that is only ever built with its test features hides an import or a helper whose only users are
// entry points of a feature, which the lints of the workspace deny in the build that a release makes.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { bindingLints, deadcodeFindings, declarationCheck, goBuildTags } from '../../../scripts/e2e-lint.mts';
import { testEntrySymbol } from '../src/release/go-module.ts';

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
  const entry = testEntrySymbol('polyspec_sample_');
  for (const name of ['panic_test', 'panic_test_held', 'echo_latin1', 'arm_faults', 'fault_left', 'alias_in_data', 'native_count', 'thrown_count', 'number_in']) {
    assert.match(`0000000000000000 T _polyspec_sample___${name}`, entry, name);
    assert.match(`0000000000000000 T polyspec_sample___${name}`, entry, name);
  }
  // The member echo_x of the class tag, the member panic_test of the class tag and the function echo_x of the module
  // tag are symbols of members: a name of the contract follows the one underscore after the prefix (B2.125).
  for (const symbol of ['polyspec_sample__tag__echo_x', 'polyspec_sample__tag__panic_test', 'polyspec_sample__tag___echo_x', 'polyspec_sample__tag___gate__native_count', 'polyspec_sample__echo_x']) {
    assert.doesNotMatch(`0000000000000000 T _${symbol}`, entry, symbol);
  }
  // The entries that every build holds are no test entry points.
  for (const name of ['free', 'alloc', 'release_tag']) assert.doesNotMatch(`0000000000000000 T _polyspec_sample___${name}`, entry, name);
  // The prefix is that of the contract alone: the library sample_two is not read as the library sample.
  assert.doesNotMatch('0000000000000000 T _polyspec_sample_two___panic_test', entry);
  const script = String(readFileSync(new URL('../../../scripts/e2e.mts', import.meta.url)));
  assert.match(script, /testEntrySymbol\(`\$\{extensionOf\(p\.contract\)\}_`\)/);
  assert.doesNotMatch(script, /polyspec_\[a-z0-9_\]\*__/);
});

test('the build tags of the generated Go module are those of its //go:build lines that the go tool does not set (GN-15h)', () => {
  const files = [
    '//go:build polyspec_panic_test\n\npackage sample\n',
    '//go:build !polyspec_codec_test && (linux || darwin) && go1.24 && cgo\n\npackage sample\n',
    'package sample\n// //go:build polyspec_not_a_line\n',
  ];
  assert.deepEqual(goBuildTags(files), ['polyspec_codec_test', 'polyspec_panic_test']);
  assert.deepEqual(goBuildTags(['package sample\n']), []);
  // GN-15g: the tag musl selects the C library, which only a machine of musl builds (make go-musl-check).
  assert.deepEqual(goBuildTags(['//go:build musl\n\npackage binding\n', '//go:build !musl\n\npackage binding\n']), []);
});

test('a function stands as unreachable when every run of deadcode that compiles its file reports it, and any other line stands (GN-15h)', () => {
  const module = '/work/copy/packages/go';
  const a = `${module}/zz_generated_sample.go`;
  const b = `${module}/zz_generated_panic_test.go`;
  // helper is unreachable untagged and with the tag; held is reached by the file of the tag, which only that run
  // compiles; probe is in that file, which the untagged run does not compile, so the tagged run alone judges it.
  const untagged = { lines: ['zz_generated_sample.go:10:6: unreachable func: helper', 'zz_generated_sample.go:20:6: unreachable func: held'], compiled: new Set([a]) };
  const tagged = { lines: ['zz_generated_sample.go:10:6: unreachable func: helper', 'zz_generated_panic_test.go:5:6: unreachable func: probe'], compiled: new Set([a, b]) };
  assert.deepEqual(deadcodeFindings([untagged, tagged], module), [
    'zz_generated_panic_test.go:5:6: unreachable func: probe',
    'zz_generated_sample.go:10:6: unreachable func: helper',
  ]);
  // A line that is no finding, such as an error of the loading of the packages, fails the step too.
  assert.deepEqual(deadcodeFindings([{ lines: ['deadcode: packages contain errors'], compiled: new Set() }], module), ['deadcode: packages contain errors']);
  assert.deepEqual(deadcodeFindings([{ lines: [], compiled: new Set([a]) }], module), []);
});

test('the end-to-end check runs deadcode -test on the generated Go module, untagged and with each of its build tags, and names it in the outcome of go (GN-15h)', () => {
  const script = String(readFileSync(new URL('../../../scripts/e2e.mts', import.meta.url)));
  assert.match(script, /const tags = goBuildTags\(/);
  assert.match(script, /\[undefined, \.\.\.tags\]\.map\(/);
  assert.match(script, /output\(deadcode, \['-test', \.\.\.flags, '\.\/\.\.\.'\]\)/);
  assert.match(script, /deadcodeFindings\(runs, /);
  assert.match(script, /lintOf\('go', `deadcode -test\$\{of\}`\)/);
  const mise = String(readFileSync(new URL('../../../mise.toml', import.meta.url)));
  assert.match(mise, /^"go:golang\.org\/x\/tools\/cmd\/deadcode" = "\d+\.\d+\.\d+"$/m);
});

// GN-14, GN-6s, B2.249: tsc --strict reads the declarations of each package where npm installed it, beside the packages
// that it depends on, and resolves their entries by the exports of their manifests: the declarations of the consumer
// name the interface of a callback unit of the sample by import("@polyspec/sample") and import("@polyspec/sample/wasm"),
// which no node_modules beside the copy of the repository holds.
test('tsc --strict reads the installed declarations of a package, which import the packages that it depends on (GN-14, GN-6s, B2.249)', (t) => {
  const tsc = new URL('../node_modules/.bin/tsc', import.meta.url).pathname;
  const nodeDir = mkdtempSync(join(tmpdir(), 'binding-declarations-'));
  t.after(() => rmSync(nodeDir, { recursive: true, force: true }));
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(nodeDir, path)), { recursive: true });
    writeFileSync(join(nodeDir, path), text);
  };
  const exports = { '.': { types: './generated/index.d.ts', import: './generated/index.mjs' }, './wasm': { types: './wasm/generated/index.d.ts', default: './wasm/generated/index.mjs' } };
  write('node_modules/@polyspec/sample/package.json', JSON.stringify({ name: '@polyspec/sample', version: '0.0.0', type: 'module', exports }));
  for (const path of ['generated/index.d.ts', 'wasm/generated/index.d.ts']) write(`node_modules/@polyspec/sample/${path}`, 'export interface Source {\n  read(key: string): string | null;\n}\n');
  write('node_modules/@polyspec/consumer/package.json', JSON.stringify({ name: '@polyspec/consumer', version: '0.0.0', type: 'module', exports, dependencies: { '@polyspec/sample': '0.0.0' } }));
  write('node_modules/@polyspec/consumer/generated/index.d.ts', 'export declare function read(source: import("@polyspec/sample").Source, key: string): string | null;\n');
  write('node_modules/@polyspec/consumer/wasm/generated/index.d.ts', 'export declare function read(source: import("@polyspec/sample/wasm").Source, key: string): string | null;\n');
  for (const declarations of ['generated/index.d.ts', 'wasm/generated/index.d.ts']) {
    const check = declarationCheck(nodeDir, '@polyspec/consumer', declarations);
    assert.equal(check.at(-1), join(nodeDir, 'node_modules/@polyspec/consumer', declarations));
    assert.deepEqual(check.slice(0, 2), ['--noEmit', '--strict']);
    const ran = spawnSync(tsc, check, { cwd: nodeDir, encoding: 'utf8' });
    assert.equal(ran.status, 0, `tsc ${check.join(' ')}:\n${ran.stdout}${ran.stderr}`);
  }
});
