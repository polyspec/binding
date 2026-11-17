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
import { CONSUMER_NPMRC, consumerManifest, missingSiblingAssets, npmPacked, packFile, siblingReleaseForms, type NpmSource } from '../../../scripts/e2e-npm.mts';

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

test('B2.458: a packed manifest that requires another package of the run at X.Y.Z needs the tarball of that version, and other forms are not judged (GN-3h, GN-3e)', () => {
  const packages = [{ name: '@polyspec/sample', version: '0.0.3' }, { name: '@polyspec/sample', version: '0.0.3', platform: 'darwin-arm64' }, { name: '@polyspec/consumer', version: '0.0.1' }];
  const requires = (version: string) => [{ name: '@polyspec/sample' }, { name: '@polyspec/consumer', dependencies: { '@polyspec/sample': version, typescript: '7.0.2' } }];
  // The release form at the version of the run, and the development form.
  assert.deepEqual(missingSiblingAssets(requires('0.0.3'), packages), []);
  assert.deepEqual(missingSiblingAssets(requires('*'), packages), []);
  assert.deepEqual(siblingReleaseForms(requires('0.0.3'), packages), ['@polyspec/consumer requires @polyspec/sample 0.0.3']);
  assert.deepEqual(siblingReleaseForms(requires('*'), packages), []);
  // Another version: npm would ask the registry for it.
  assert.deepEqual(missingSiblingAssets(requires('0.0.4'), packages), ['@polyspec/consumer requires @polyspec/sample 0.0.4, and the run holds polyspec-sample-0.0.3.tgz, not polyspec-sample-0.0.4.tgz (GN-3h)']);
  // A platform package of that version alone is not the package: its tarball does not satisfy the requirement.
  assert.deepEqual(missingSiblingAssets(requires('0.0.4'), [...packages, { name: '@polyspec/sample', version: '0.0.4', platform: 'darwin-arm64' }]).length, 1);
});

// A consumer and two tarballs of the run: `top` requires `dep` as its packed manifest names it.
function siblingInstall(t: { after: (cleanup: () => void) => void }, required: string, depVersion: string): { status: number | null; output: string; consumer: string } {
  const root = mkdtempSync(join(tmpdir(), 'e2e-npm-sibling-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const assets = join(root, 'assets');
  const consumer = join(root, 'consumer');
  mkdirSync(assets);
  mkdirSync(consumer);
  const pack = (dir: string, manifest: Record<string, unknown>, text: string): void => {
    mkdirSync(join(root, dir));
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ main: 'index.js', ...manifest }));
    writeFileSync(join(root, dir, 'index.js'), text);
    const packed = spawnSync('npm', ['pack', '--pack-destination', assets], { cwd: join(root, dir), encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
  };
  pack('dep', { name: '@polyspec/b2458dep', version: depVersion }, 'module.exports = "dep";\n');
  pack('top', { name: '@polyspec/b2458top', version: '0.0.7', dependencies: { '@polyspec/b2458dep': required } }, 'module.exports = "top+" + require("@polyspec/b2458dep");\n');
  const list = join(root, 'packages.json');
  writeFileSync(list, JSON.stringify([{ name: '@polyspec/b2458dep', version: depVersion }, { name: '@polyspec/b2458top', version: '0.0.7' }]));
  const script = new URL('../../../scripts/e2e-npm-install.mts', import.meta.url).pathname;
  // The registry is unreachable, so a requirement that the root manifest does not satisfy fails the install.
  const ran = spawnSync(process.execPath, [script, assets, consumer, 'npm', list], { encoding: 'utf8', env: { ...process.env, npm_config_registry: 'http://127.0.0.1:9/', npm_config_cache: join(root, 'cache'), npm_config_fetch_retries: '0' } });
  return { status: ran.status, output: ran.stdout + ran.stderr, consumer };
}

test('B2.458: npm satisfies the requirement X.Y.Z of a packed manifest with the root dependency of that name by its URL, and asks no registry (GN-3h)', (t) => {
  const ran = siblingInstall(t, '0.0.3', '0.0.3');
  assert.equal(ran.status, 0, ran.output);
  assert.match(ran.output, /release form: @polyspec\/b2458top requires @polyspec\/b2458dep 0\.0\.3, which the root manifest satisfies by its URL \(GN-3h\)/);
  const root = JSON.parse(readFileSync(join(ran.consumer, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; overrides?: unknown };
  assert.match(root.dependencies['@polyspec/b2458dep'] ?? '', /^http:\/\/127\.0\.0\.1:\d+\/polyspec-b2458dep-0\.0\.3\.tgz$/);
  assert.equal(root.overrides, undefined);
  const lock = JSON.parse(readFileSync(join(ran.consumer, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version?: string; resolved?: string; dependencies?: Record<string, string> }> };
  assert.deepEqual(lock.packages['node_modules/@polyspec/b2458top']?.dependencies, { '@polyspec/b2458dep': '0.0.3' });
  assert.equal(lock.packages['node_modules/@polyspec/b2458dep']?.version, '0.0.3');
  assert.match(lock.packages['node_modules/@polyspec/b2458dep']?.resolved ?? '', /^http:\/\/127\.0\.0\.1:\d+\/polyspec-b2458dep-0\.0\.3\.tgz$/);
  // One copy of the sibling, the one of the root, which the package loads.
  assert.ok(!existsSync(join(ran.consumer, 'node_modules/@polyspec/b2458top/node_modules')));
  const loaded = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("@polyspec/b2458top"))'], { cwd: ran.consumer, encoding: 'utf8' });
  assert.equal(loaded.stdout, 'top+dep', loaded.stderr);
});

test('B2.458: a requirement X.Y.Z whose tarball the run does not hold fails by its name before npm starts (GN-3h)', (t) => {
  const ran = siblingInstall(t, '0.0.4', '0.0.3');
  assert.equal(ran.status, 1, ran.output);
  assert.match(ran.output, /e2e-npm-install: @polyspec\/b2458top requires @polyspec\/b2458dep 0\.0\.4, and the run holds polyspec-b2458dep-0\.0\.3\.tgz, not polyspec-b2458dep-0\.0\.4\.tgz \(GN-3h\)/);
  assert.doesNotMatch(ran.output, /npm install/);
  assert.ok(!existsSync(join(ran.consumer, 'package.json')));
});
