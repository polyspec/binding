// GN-14: the npm packages of a run of the end-to-end check. The generated entry of a contract that names the types of
// another repository imports the npm package of that repository, for Node and through the subpath ./wasm, so the run
// packs and installs the package of each such dependency beside the one of the repository, as it installs the wheel,
// the extension and the static library of a dependency for the other targets.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { npmPacked, type NpmSource } from '../../../scripts/e2e-npm.mts';

const all = ['php', 'python', 'node', 'go', 'wasm'];
const source = (library: string, names: string[] = [], targets: string[] = all): NpmSource => ({ library, targets, names });

test('a run packs the npm package of the repository alone when its contract names no other library (GN-14)', () => {
  const sample = source('sample');
  assert.deepEqual(npmPacked([sample], []), [{ source: sample, addon: true, wasm: true }]);
});

test('a run packs the addon and the WASM module of a dependency that the contract names, before those of the repository (GN-14)', () => {
  const json = source('json');
  const relay = source('relay', ['json']);
  assert.deepEqual(npmPacked([relay], [json]), [
    { source: json, addon: true, wasm: true },
    { source: relay, addon: true, wasm: true },
  ]);
});

test('a dependency that no packed contract names is not packed, and one that a packed dependency names is (GN-14)', () => {
  const base = source('base');
  const middle = source('middle', ['base']);
  const other = source('other');
  const top = source('top', ['middle']);
  assert.deepEqual(npmPacked([top], [base, middle, other]).map((p) => p.source.library), ['base', 'middle', 'top']);
});

test('the build of a dependency follows the targets of the repository: no WASM module for a repository without wasm (GN-14)', () => {
  const json = source('json');
  const relay = source('relay', ['json'], ['php', 'python', 'node', 'go']);
  assert.deepEqual(npmPacked([relay], [json]), [
    { source: json, addon: true, wasm: false },
    { source: relay, addon: true, wasm: false },
  ]);
  const browser = source('browser', ['json'], ['wasm']);
  assert.deepEqual(npmPacked([browser], [json]), [
    { source: json, addon: false, wasm: true },
    { source: browser, addon: false, wasm: true },
  ]);
});

test('a contract without node and wasm is not packed, and neither is a dependency that only it names (GN-14)', () => {
  const json = source('json');
  const plain = source('plain', ['json'], ['php', 'python', 'go']);
  assert.deepEqual(npmPacked([plain], [json]), []);
});

test('a dependency that lacks a target of the repository that names it is a named failure (GN-14)', () => {
  const json = source('json', [], ['php', 'python', 'node', 'go']);
  const relay = source('relay', ['json']);
  assert.throws(() => npmPacked([relay], [json]), /the library json has no target wasm, which relay names it for \(GN-14\)/);
});

test('the script of the end-to-end check builds and packs what npmPacked plans, not the contracts of the repository alone (GN-14)', () => {
  const script = String(readFileSync(new URL('../../../scripts/e2e.mts', import.meta.url)));
  assert.match(script, /npmPacked\(/);
  // The WASM step and the npm step each read the plan: a list of the contracts of the repository alone would leave the
  // package of a dependency out of the install.
  assert.doesNotMatch(script, /const packed = mains\.filter\(/);
  assert.doesNotMatch(script, /for \(const p of mainsOf\('wasm'\)\) \{\n\s*const wanted = /);
});
