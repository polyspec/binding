// GN-19h, CK-94: the release recipes that binding writes for a repository that holds a binding. A case writes the recipes of
// the fixture contract, includes them from a Makefile of its own and runs a target with make, with stand-ins of the tools
// that the target starts, so it builds nothing: each stand-in records its arguments and the variables of the environment
// that choose what a build takes, and writes the files that the real tool writes.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import type { Contract } from '../src/contract.ts';
import { WASM_BINDGEN } from '../src/generate/packages.ts';
import { releaseRecipes, RELEASE_STEPS } from '../src/release/recipes.ts';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const fixture = new URL('./fixtures/repo/', import.meta.url).pathname;
const fixtureContract = (): Contract => JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8')) as Contract;
// The major release of LLVM that a repository pins in config/toolchain.json for the bindgen of ext-php-rs.
const LLVM_MAJOR = '21';

test('the recipes of a contract name its crates, packages and targets, and a component has its own file and targets (GN-19h)', () => {
  const contract = fixtureContract();
  const recipes = releaseRecipes(contract);
  assert.equal(recipes.path, 'packages/release.mk');
  assert.deepEqual(recipes.targets, ['release-go-static', 'release-wheel', 'release-php-ext', 'release-npm-platform', 'release-npm', 'release-go-module', 'release-binding-check', 'release-platform-assets']);
  for (const target of recipes.targets) assert.match(recipes.text, new RegExp(`^${target}:`, 'm'), target);
  assert.match(recipes.text, /-p polyspec-sample-go\b/);
  assert.match(recipes.text, /-p polyspec-sample-php-ext\b/);
  assert.match(recipes.text, /-p polyspec-sample-wasm\b/);
  assert.match(recipes.text, /--manifest-path packages\/ts\/Cargo\.toml/);
  assert.match(recipes.text, /libpolyspec_sample_go\.a/);
  assert.match(recipes.text, /php_polyspec_sample-v/);
  assert.match(recipes.text, /--out-name sample_wasm/);
  assert.match(recipes.text, new RegExp(`wasm-bindgen ${WASM_BINDGEN.replaceAll('.', '\\.')}`));
  assert.match(recipes.text, /polyspec-sample-ts-/);
  // Make reads no ${ of the shell, which a template literal of binding would take for its own.
  assert.doesNotMatch(recipes.text, /\$\{/);
  // A contract without a target has none of its recipes; a component has its file beside its packages and its targets
  // carry its name, so that two contracts of one repository give two sets of targets.
  const php = releaseRecipes({ ...contract, targets: ['php'] });
  assert.deepEqual(php.targets, ['release-php-ext', 'release-binding-check', 'release-platform-assets']);
  assert.doesNotMatch(php.text, /^(release-wheel|release-npm|release-go|install-wasm-bindgen)/m);
  const component = releaseRecipes({ ...contract, core: { ...contract.core, path: 'packages/forms/rust' } });
  assert.equal(component.path, 'packages/forms/release.mk');
  assert.ok(component.targets.every((target) => target.endsWith('-forms')), component.targets.join(' '));
  assert.match(component.text, /--manifest-path packages\/forms\/ts\/Cargo\.toml/);
  assert.match(component.text, /\$\(CURDIR\)\/packages\/forms\/rust\/interface\.json/);
  // Every step of a release that GN-19h names is a target of a contract with every target.
  assert.deepEqual([...RELEASE_STEPS].sort(), [...recipes.targets].sort());
});

/** A copy of the fixture repository with its recipes, a Makefile that includes them and the stand-ins of one case. */
interface Sandbox {
  root: string;
  bin: string;
  llvm: string;
  env: NodeJS.ProcessEnv;
  calls: () => { tool: string; args: string[]; env: Record<string, string> }[];
  make: (...args: string[]) => { status: number | null; output: string };
}

/** Writes the stand-in `name` into `dir`: a Node.js script that records its call and then runs `body`. */
function standIn(dir: string, name: string, body: string): void {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, `#!${process.execPath}
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const kept = Object.fromEntries(['CARGO_TARGET_DIR', 'LIBCLANG_PATH', 'CLANG_PATH', 'PHP', 'PHP_CONFIG', 'SOURCE_DATE_EPOCH', 'MATURIN_PEP517_ARGS'].filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
fs.appendFileSync(process.env.CALLS, JSON.stringify({ tool: ${JSON.stringify(name)}, args, env: kept }) + '\\n');
const option = (name) => args[args.indexOf(name) + 1];
${body}
`);
  chmodSync(file, 0o755);
}

function sandbox(t: TestContext, host: string, change: (contract: Contract) => void = () => {}): Sandbox {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'binding-recipes-')));
  t.after(() => { rmSync(root, { recursive: true, force: true }); });
  cpSync(fixture, root, { recursive: true });
  const contract = fixtureContract();
  change(contract);
  writeFileSync(join(root, 'packages/rust/interface.json'), JSON.stringify(contract));
  execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
  execFileSync(process.execPath, [cli, 'release-recipes', '--root', root]);
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, 'config/toolchain.json'), `{\n  "schema": 1,\n  "llvm": {\n    "version": "${LLVM_MAJOR}"\n  }\n}\n`);
  const bin = join(root, '.stand-ins');
  const sysroot = join(root, '.sysroot');
  const llvm = join(root, '.llvm');
  standIn(bin, 'rustc', `if (args.join(' ') === '--print host-tuple') console.log(${JSON.stringify(host)});\nelse if (args.join(' ') === '--print sysroot') console.log(${JSON.stringify(sysroot)});\nelse process.exit(1);`);
  standIn(join(sysroot, 'lib/rustlib', host, 'bin'), 'llvm-strip', `fs.writeFileSync(args[args.length - 1], 'stripped');`);
  // cargo writes the library of the crate of -p into the target directory of CARGO_TARGET_DIR, under the target of --target.
  standIn(bin, 'cargo', `const crate = option('-p');
if (args[0] === 'pkgid') { console.log('path+file:///repository#' + crate + '@0.0.3'); process.exit(0); }
const lib = crate.replaceAll('-', '_');
const name = crate.endsWith('-go') ? 'lib' + lib + '.a' : crate.endsWith('-wasm') ? lib + '.wasm' : crate.endsWith('-php-ext') ? 'libpolyspec_sample.' + (process.platform === 'darwin' ? 'dylib' : 'so') : 'lib' + lib;
const dir = path.join(process.env.CARGO_TARGET_DIR, args.includes('--target') ? option('--target') : '', 'release');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, name), 'built');`);
  standIn(bin, 'binding', '');
  standIn(bin, 'git', `console.log('1767323045');`);
  standIn(bin, 'uv', '');
  standIn(bin, 'php', `const code = option('-r');
if (code.includes('PHP_MAJOR_VERSION')) process.stdout.write(process.env.PHP_MINOR ?? '8.4');
else if (code.includes('PHP_DEBUG')) process.stdout.write('-nts');`);
  standIn(bin, 'php-config', '');
  standIn(bin, 'zip', `fs.writeFileSync(args[3], 'zipped');`);
  standIn(join(llvm, 'bin'), 'clang', `if (args[0] === '-dumpversion') console.log((process.env.CLANG_MAJOR ?? ${JSON.stringify(LLVM_MAJOR)}) + '.1.8');`);
  mkdirSync(join(llvm, 'lib'));
  writeFileSync(join(llvm, 'lib/libclang.so'), '');
  // napi create-npm-dirs writes the folder of each platform of its configuration under --npm-dir, and refuses a folder
  // outside the package of --package-json-path, as the napi CLI does.
  standIn(bin, 'napi', `if (args[0] === 'build') fs.mkdirSync(option('--output-dir'), { recursive: true });
if (args[0] === 'create-npm-dirs') {
  const pkg = path.dirname(path.resolve(option('--package-json-path')));
  const dir = path.resolve(option('--npm-dir'));
  if (!dir.startsWith(pkg + path.sep)) { console.error('napi: ' + dir + ' is outside the package ' + pkg); process.exit(1); }
  const config = JSON.parse(fs.readFileSync(option('--config-path'), 'utf8'));
  const name = JSON.parse(fs.readFileSync(option('--package-json-path'), 'utf8')).name;
  for (const triple of config.targets) {
    const platform = { 'x86_64-unknown-linux-gnu': 'linux-x64-gnu', 'aarch64-unknown-linux-gnu': 'linux-arm64-gnu', 'aarch64-apple-darwin': 'darwin-arm64' }[triple];
    fs.mkdirSync(path.join(dir, platform), { recursive: true });
    fs.writeFileSync(path.join(dir, platform, 'package.json'), JSON.stringify({ name: name + '-' + platform, version: '0.0.3' }));
  }
}`);
  // npm pack --dry-run --json lists the files of the package, and npm pack writes the archive of the manifest of its folder.
  standIn(bin, 'npm', `if (args.includes('--dry-run')) { console.log(JSON.stringify([{ files: [{ path: 'package.json' }] }])); process.exit(0); }
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
fs.writeFileSync(path.join(option('--pack-destination'), manifest.name.replace('@', '').replace('/', '-') + '-' + manifest.version + '.tgz'), JSON.stringify(manifest));`);
  standIn(bin, 'wasm-bindgen', `if (args[0] === '--version') { console.log('wasm-bindgen ${WASM_BINDGEN}'); process.exit(0); }
fs.mkdirSync(option('--out-dir'), { recursive: true });
fs.writeFileSync(path.join(option('--out-dir'), option('--out-name') + '_bg.wasm'), 'bound');`);
  writeFileSync(join(root, 'Makefile'), `NODE := ${process.execPath}\nNPM := ${join(bin, 'npm')}\nUV := ${join(bin, 'uv')}\nBINDING_RUN := ${join(bin, 'binding')}\nNAPI := ${join(bin, 'napi')}\nWASM_BINDGEN := ${join(bin, 'wasm-bindgen')}\ninclude packages/release.mk\n`);
  const callsFile = join(root, '.calls');
  writeFileSync(callsFile, '');
  const env: NodeJS.ProcessEnv = { PATH: `${bin}:/usr/bin:/bin`, CALLS: callsFile, HOME: root };
  const make = (...args: string[]): { status: number | null; output: string } => {
    const run = spawnSync('make', ['--no-print-directory', '-C', root, ...args], { env, encoding: 'utf8' });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  };
  const calls = (): ReturnType<Sandbox['calls']> => readFileSync(callsFile, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as ReturnType<Sandbox['calls']>[number]);
  return { root, bin, llvm, env, calls, make };
}

/** The index of the first call of `tool` whose arguments start with `start`, which the case requires. */
function callIndex(calls: ReturnType<Sandbox['calls']>, tool: string, ...start: string[]): number {
  const index = calls.findIndex((call) => call.tool === tool && start.every((word, i) => call.args[i] === word));
  assert.notEqual(index, -1, `no call of ${tool} ${start.join(' ')} in ${JSON.stringify(calls.map((c) => [c.tool, ...c.args].join(' ')))}`);
  return index;
}

const generation = (root: string, target: string): string[] => ['generate', '--contract', join(root, 'packages/rust/interface.json'), '--target', target];

// Defect 1: the generated files are not tracked, so a recipe that builds a binding generates it first.
test('each recipe of a build generates the binding of its target before it builds (GN-19h)', (t) => {
  const box = sandbox(t, 'x86_64-unknown-linux-gnu');
  const steps: [string, string, string, ...string[]][] = [
    ['release-go-static', 'go', 'cargo', 'build'],
    ['release-wheel', 'python', 'uv', 'build'],
    ['release-php-ext', 'php', 'cargo', 'build'],
    ['release-npm-platform', 'node', 'napi', 'build'],
  ];
  for (const [target, lang, tool, ...start] of steps) {
    writeFileSync(box.env['CALLS'] as string, '');
    const run = box.make(target, `PHP=${join(box.bin, 'php')}`, `LLVM_ROOT=${box.llvm}`);
    assert.equal(run.status, 0, `${target}: ${run.output}`);
    const calls = box.calls();
    assert.ok(callIndex(calls, 'binding', ...generation(box.root, lang)) < callIndex(calls, tool, ...start), target);
  }
  writeFileSync(box.env['CALLS'] as string, '');
  const npm = box.make('release-npm');
  assert.equal(npm.status, 0, npm.output);
  const calls = box.calls();
  const build = callIndex(calls, 'cargo', 'build');
  assert.ok(callIndex(calls, 'binding', ...generation(box.root, 'node')) < build);
  assert.ok(callIndex(calls, 'binding', ...generation(box.root, 'wasm')) < build);
});

test('the static library of the Go module is built for the GNU C library and for musl on Linux, stripped, and for one platform on macOS (GN-19b)', (t) => {
  const linux = sandbox(t, 'aarch64-unknown-linux-gnu');
  const run = linux.make('release-go-static');
  assert.equal(run.status, 0, run.output);
  const builds = linux.calls().filter((call) => call.tool === 'cargo' && call.args[0] === 'build');
  assert.deepEqual(builds.map((call) => call.args.includes('--target') ? call.args[call.args.indexOf('--target') + 1] : 'host'), ['host', 'aarch64-unknown-linux-musl']);
  for (const dir of ['linux_arm64', 'linux_arm64_musl']) {
    assert.equal(readFileSync(join(linux.root, 'var/release/assets/go', dir, 'libpolyspec_sample_go.a'), 'utf8'), 'stripped', dir);
  }
  const mac = sandbox(t, 'aarch64-apple-darwin');
  assert.equal(mac.make('release-go-static').status, 0);
  assert.deepEqual(readdirSync(join(mac.root, 'var/release/assets/go')), ['darwin_arm64']);
  const other = sandbox(t, 'x86_64-apple-darwin');
  const refused = other.make('release-go-static');
  assert.equal(refused.status, 2);
  assert.match(refused.output, /the host x86_64-apple-darwin is no platform of the release/);
});

// Defect 2: the bindgen of ext-php-rs takes the libclang and the clang of the pinned LLVM, which the recipe checks first.
test('the PHP extension is built with the libclang and the clang of the LLVM of config/toolchain.json, each PHP minor in its own target directory (GN-19d)', (t) => {
  const box = sandbox(t, 'x86_64-unknown-linux-gnu');
  const php = `PHP=${join(box.bin, 'php')}`;
  const run = box.make('release-php-ext', php, `LLVM_ROOT=${box.llvm}`);
  assert.equal(run.status, 0, run.output);
  const build = box.calls().find((call) => call.tool === 'cargo' && call.args[0] === 'build');
  assert.equal(build?.env['LIBCLANG_PATH'], join(box.llvm, 'lib'));
  assert.equal(build?.env['CLANG_PATH'], join(box.llvm, 'bin/clang'));
  assert.equal(build?.env['PHP'], join(box.bin, 'php'));
  assert.equal(build?.env['PHP_CONFIG'], join(box.bin, 'php-config'));
  assert.match(build?.env['CARGO_TARGET_DIR'] ?? '', /var\/release\/target\/php8\.4-nts$/);
  assert.ok(existsSync(join(box.root, 'var/release/assets/php-ext/php_polyspec_sample-v0.0.3_php8.4-x86_64-linux-glibc-nts.zip')));
  // PHP 8.5 builds in its own target directory, so cargo takes no build of the headers of 8.4.
  writeFileSync(box.env['CALLS'] as string, '');
  box.env['PHP_MINOR'] = '8.5';
  assert.equal(box.make('release-php-ext', php, `LLVM_ROOT=${box.llvm}`).status, 0);
  assert.match(box.calls().find((call) => call.tool === 'cargo' && call.args[0] === 'build')?.env['CARGO_TARGET_DIR'] ?? '', /php8\.5-nts$/);
  delete box.env['PHP_MINOR'];
  // An LLVM that is not there, or a clang of another major release, stops the recipe before cargo builds.
  for (const [llvmRoot, env, message] of [
    [join(box.root, '.no-llvm'), {}, /needs the libclang and the clang of LLVM 21 \(config\/toolchain\.json\) in .*\.no-llvm; make install-llvm installs it/],
    [box.llvm, { CLANG_MAJOR: '22' }, /bin\/clang is clang 22\.1\.8, not 21 \(config\/toolchain\.json\)/],
  ] as const) {
    writeFileSync(box.env['CALLS'] as string, '');
    Object.assign(box.env, env);
    const refused = box.make('release-php-ext', php, `LLVM_ROOT=${llvmRoot}`);
    delete box.env['CLANG_MAJOR'];
    assert.equal(refused.status, 2, refused.output);
    assert.match(refused.output, message);
    assert.equal(box.calls().filter((call) => call.tool === 'cargo').length, 0);
  }
  // A recipe without the PHP to build for names it.
  const noPhp = box.make('release-php-ext', 'PHP=', `LLVM_ROOT=${box.llvm}`);
  assert.equal(noPhp.status, 2);
  assert.match(noPhp.output, /release-php-ext needs PHP/);
});

// Defect 3: napi create-npm-dirs takes only a folder inside the package of --package-json-path.
test('the npm platform package is written in npm/<platform> of the npm package and packed into the assets (GN-19e)', (t) => {
  const box = sandbox(t, 'aarch64-apple-darwin');
  const run = box.make('release-npm-platform');
  assert.equal(run.status, 0, run.output);
  const calls = box.calls();
  const dirs = calls[callIndex(calls, 'napi', 'create-npm-dirs')]?.args ?? [];
  assert.equal(dirs[dirs.indexOf('--npm-dir') + 1], join(box.root, 'packages/ts/npm/darwin-arm64/npm'));
  const configPath = dirs[dirs.indexOf('--config-path') + 1] ?? '';
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), { targets: ['aarch64-apple-darwin'] });
  assert.deepEqual(readdirSync(join(box.root, 'var/release/assets/npm')), ['polyspec-sample-darwin-arm64-0.0.3.tgz']);
});

test('the npm package names its platform packages in optionalDependencies of the packed copy and holds the bound WASM module (GN-19e)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  const run = box.make('release-npm');
  assert.equal(run.status, 0, run.output);
  const packed = JSON.parse(readFileSync(join(box.root, 'var/release/assets/npm/polyspec-sample-0.0.3.tgz'), 'utf8')) as { optionalDependencies?: Record<string, string> };
  assert.deepEqual(packed.optionalDependencies, { '@polyspec/sample-linux-x64-gnu': '0.0.3', '@polyspec/sample-linux-arm64-gnu': '0.0.3', '@polyspec/sample-darwin-arm64': '0.0.3' });
  // The tracked manifest names none (GN-3c).
  assert.equal((JSON.parse(readFileSync(join(box.root, 'packages/ts/package.json'), 'utf8')) as { optionalDependencies?: unknown }).optionalDependencies, undefined);
  const bound = box.calls().find((call) => call.tool === 'wasm-bindgen' && call.args[0] === '--target');
  assert.match(bound?.args.join(' ') ?? '', /--out-dir \S*\/var\/release\/target\/npm\/package\/package\/wasm\/generated --out-name sample_wasm \S*\/wasm32-unknown-unknown\/release\/polyspec_sample_wasm\.wasm$/);
  // A wasm-bindgen of another release than the crate of the generated manifests is refused before cargo builds.
  standIn(box.bin, 'wasm-bindgen', `console.log('wasm-bindgen 0.0.1');`);
  writeFileSync(box.env['CALLS'] as string, '');
  const refused = box.make('release-npm');
  assert.equal(refused.status, 2, refused.output);
  assert.match(refused.output, new RegExp(`is wasm-bindgen 0\\.0\\.1, not the release ${WASM_BINDGEN.replaceAll('.', '\\.')}`));
  assert.equal(box.calls().filter((call) => call.tool === 'cargo').length, 0);
});

test('a recipe names a variable that the Makefile of the repository does not define (GN-19h)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  const run = box.make('release-wheel', 'UV=');
  assert.equal(run.status, 2);
  assert.match(run.output, /release-wheel needs UV: the uv of the checkout; define it before the include of packages\/release\.mk \(GN-19h\)/);
});

test('the release check and the Go module run the commands of binding on the contract (GN-19f, GN-19g)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  assert.equal(box.make('release-binding-check').status, 0);
  callIndex(box.calls(), 'binding', 'check', join(box.root, 'packages/rust/interface.json'), '--release');
  const noTag = box.make('release-go-module');
  assert.equal(noTag.status, 2);
  assert.match(noTag.output, /release-go-module: TAG is required/);
  writeFileSync(box.env['CALLS'] as string, '');
  assert.equal(box.make('release-go-module', 'TAG=v0.0.3').status, 0);
  const calls = box.calls();
  assert.ok(callIndex(calls, 'binding', ...generation(box.root, 'go')) < callIndex(calls, 'binding', 'release-go-module', '--contract', join(box.root, 'packages/rust/interface.json'), '--tag', 'v0.0.3'));
});

test('the assets of each platform are counted and labelled before an upload (GN-19g)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  standIn(box.bin, 'gh', '');
  const assets = join(box.root, 'var/release/assets');
  const put = (path: string): void => {
    mkdirSync(join(assets, path, '..'), { recursive: true });
    writeFileSync(join(assets, path), '');
  };
  put('wheel/polyspec_sample-0.0.3-cp314-abi3-manylinux_2_39_x86_64.whl');
  put('wheel/polyspec_sample-0.0.3-cp314-abi3-manylinux_2_39_aarch64.whl');
  put('npm/polyspec-sample-0.0.3.tgz');
  for (const platform of ['linux-x64-gnu', 'linux-arm64-gnu', 'darwin-arm64']) put(`npm/polyspec-sample-${platform}-0.0.3.tgz`);
  for (const pie of ['x86_64-linux-glibc', 'arm64-linux-glibc', 'arm64-darwin-bsdlibc']) put(`php-ext/php_polyspec_sample-v0.0.3_php8.4-${pie}-nts.zip`);
  const missing = box.make('release-platform-assets', 'TAG=v0.0.3');
  // make ends with 2 for a recipe that fails, whatever status the recipe gave.
  assert.equal(missing.status, 2, missing.output);
  assert.match(missing.output, /holds 2 wheels, not one of each of the 3 platforms/);
  assert.equal(box.calls().filter((call) => call.tool === 'gh').length, 0);
  put('wheel/polyspec_sample-0.0.3-cp314-abi3-macosx_11_0_arm64.whl');
  const run = box.make('release-platform-assets', 'TAG=v0.0.3');
  assert.equal(run.status, 0, run.output);
  const upload = box.calls().find((call) => call.tool === 'gh')?.args ?? [];
  assert.deepEqual(upload.slice(0, 3), ['release', 'upload', 'v0.0.3']);
  const labels = upload.slice(3).map((arg) => arg.slice(arg.indexOf('#') + 1)).sort();
  assert.deepEqual(labels, [
    'polyspec-sample-php-ext-0.0.3-php8.4-darwin-arm64',
    'polyspec-sample-php-ext-0.0.3-php8.4-linux-arm64-gnu',
    'polyspec-sample-php-ext-0.0.3-php8.4-linux-x64-gnu',
    'polyspec-sample-python-0.0.3-darwin-arm64',
    'polyspec-sample-python-0.0.3-linux-arm64-gnu',
    'polyspec-sample-python-0.0.3-linux-x64-gnu',
    'polyspec-sample-ts-0.0.3',
    'polyspec-sample-ts-0.0.3-darwin-arm64',
    'polyspec-sample-ts-0.0.3-linux-arm64-gnu',
    'polyspec-sample-ts-0.0.3-linux-x64-gnu',
  ]);
});

test('binding check reports a Makefile that does not include the recipes, a recipe copied by hand and recipes that binding writes otherwise (CK-94)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  const contractPath = join(box.root, 'packages/rust/interface.json');
  const check = (): string => String(spawnSync(process.execPath, [cli, 'check', contractPath], { encoding: 'utf8' }).stderr);
  const makefile = join(box.root, 'Makefile');
  const fragment = join(box.root, 'packages/release.mk');
  const including = readFileSync(makefile, 'utf8');
  assert.doesNotMatch(check(), /CK-94/);
  // The Makefile includes the recipes also as -include or by the path of the checkout.
  writeFileSync(makefile, including.replace('include packages/release.mk', '-include $(CURDIR)/packages/release.mk'));
  assert.doesNotMatch(check(), /CK-94/);
  writeFileSync(makefile, including.replace('include packages/release.mk', ''));
  assert.match(check(), new RegExp(`${makefile}: CK-94 includes no packages/release\\.mk`));
  // A recipe of the Makefile for a target of the recipes is a copy by hand; a prerequisite that it adds is none.
  writeFileSync(makefile, `${including}release-wheel: build-ts\n\nrelease-npm-platform: bindings-node\n\t$(NAPI) build\n`);
  const copied = check();
  assert.match(copied, new RegExp(`${makefile}: CK-94 defines the recipe of release-npm-platform`));
  assert.doesNotMatch(copied, /CK-94 defines the recipe of release-wheel/);
  writeFileSync(makefile, including);
  // The recipes of another binding, or edited by hand, are stale; recipes that are not there are written by a release.
  writeFileSync(fragment, `${readFileSync(fragment, 'utf8')}# edited\n`);
  assert.match(check(), new RegExp(`${fragment}: CK-94 differs from what binding release-recipes writes`));
  rmSync(fragment);
  assert.doesNotMatch(check(), /CK-94/);
  // A repository without a Makefile has no recipes of make to check.
  rmSync(makefile);
  assert.doesNotMatch(check(), /CK-94/);
});
