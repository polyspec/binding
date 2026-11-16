// GN-14: the npm packages of a run of the end-to-end check. The generated entry of a contract that names the types of
// another repository imports the npm package of that repository, for Node and through the subpath ./wasm, so the run
// packs and installs the package of each such dependency beside the one of the repository, as it installs the wheel,
// the extension and the static library of a dependency for the other targets.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSUMER_NPMRC, consumerManifest, npmPacked, packFile, type NpmSource } from '../../../scripts/e2e-npm.mts';

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

test('a consumer names the package of a release in dependencies and each platform package in optionalDependencies by its asset URL (GN-3c)', () => {
  assert.equal(packFile('@polyspec/sample', '0.0.3'), 'polyspec-sample-0.0.3.tgz');
  assert.equal(packFile('@polyspec/sample', '0.0.3', 'linux-x64-gnu'), 'polyspec-sample-linux-x64-gnu-0.0.3.tgz');
  const base = 'https://github.com/polyspec/sample/releases/download/v0.0.3/';
  assert.deepEqual(consumerManifest([
    { name: '@polyspec/sample', version: '0.0.3', platform: 'linux-x64-gnu' },
    { name: '@polyspec/sample', version: '0.0.3', platform: 'darwin-arm64' },
    { name: '@polyspec/sample', version: '0.0.3' },
  ], base), {
    private: true,
    dependencies: { '@polyspec/sample': `${base}polyspec-sample-0.0.3.tgz` },
    optionalDependencies: {
      '@polyspec/sample-linux-x64-gnu': `${base}polyspec-sample-linux-x64-gnu-0.0.3.tgz`,
      '@polyspec/sample-darwin-arm64': `${base}polyspec-sample-darwin-arm64-0.0.3.tgz`,
    },
  });
  // npm takes a URL for a root dependency alone; its default allow-remote=none takes none.
  assert.equal(CONSUMER_NPMRC, 'allow-remote=root\n');
});

test('the run installs the package and the platform package of this machine from their URLs on the loopback, and skips another platform (GN-3c, GN-14)', (t) => {
  // The npm of PATH, which make unit-ts sets to var/tools/bin, the npm that devEngines pins.
  const npm = 'npm';
  const root = mkdtempSync(join(tmpdir(), 'e2e-npm-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const assets = join(root, 'assets');
  const consumer = join(root, 'consumer');
  mkdirSync(assets);
  mkdirSync(consumer);
  const pack = (name: string, manifest: Record<string, unknown>, files: Record<string, string>): void => {
    const dir = join(root, name);
    mkdirSync(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.0.3', ...manifest }));
    for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
    const packed = spawnSync(npm, ['pack', '--pack-destination', assets], { cwd: dir, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
  };
  const here = `${process.platform}-${process.arch}`;
  const other = process.platform === 'darwin' ? { platform: 'linux-x64-gnu', os: 'linux', cpu: 'x64' } : { platform: 'darwin-arm64', os: 'darwin', cpu: 'arm64' };
  pack('main', { name: '@polyspec/sample', main: 'index.js' }, { 'index.js': 'module.exports = 1;\n' });
  pack('here', { name: `@polyspec/sample-${here}`, os: [process.platform], cpu: [process.arch], main: 'addon.js' }, { 'addon.js': 'module.exports = 2;\n' });
  pack('other', { name: `@polyspec/sample-${other.platform}`, os: [other.os], cpu: [other.cpu], main: 'addon.js' }, { 'addon.js': 'module.exports = 3;\n' });
  const list = join(root, 'packages.json');
  writeFileSync(list, JSON.stringify([
    { name: '@polyspec/sample', version: '0.0.3' },
    { name: '@polyspec/sample', version: '0.0.3', platform: here },
    { name: '@polyspec/sample', version: '0.0.3', platform: other.platform },
  ]));
  const script = new URL('../../../scripts/e2e-npm-install.mts', import.meta.url).pathname;
  // The registry is unreachable, so every package comes from its URL.
  const ran = spawnSync(process.execPath, [script, assets, consumer, npm, list], { encoding: 'utf8', env: { ...process.env, npm_config_registry: 'http://127.0.0.1:9/', npm_config_cache: join(root, 'cache') } });
  assert.equal(ran.status, 0, ran.stdout + ran.stderr);
  assert.equal(readFileSync(join(consumer, '.npmrc'), 'utf8'), 'allow-remote=root\n');
  assert.ok(existsSync(join(consumer, 'node_modules/@polyspec/sample/index.js')));
  assert.ok(existsSync(join(consumer, `node_modules/@polyspec/sample-${here}/addon.js`)));
  assert.ok(!existsSync(join(consumer, `node_modules/@polyspec/sample-${other.platform}`)));
  const lock = JSON.parse(readFileSync(join(consumer, 'package-lock.json'), 'utf8')) as { packages: Record<string, { resolved?: string; integrity?: string; optional?: boolean }> };
  for (const name of ['@polyspec/sample', `@polyspec/sample-${here}`, `@polyspec/sample-${other.platform}`]) {
    const entry = lock.packages[`node_modules/${name}`];
    assert.match(entry?.resolved ?? '', /^http:\/\/127\.0\.0\.1:\d+\/polyspec-sample-.*0\.0\.3\.tgz$/, name);
    assert.match(entry?.integrity ?? '', /^sha512-/, name);
  }
  assert.equal(lock.packages[`node_modules/@polyspec/sample-${other.platform}`]?.optional, true);
});
