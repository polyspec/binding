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
import { generate } from '../src/generate/index.ts';
import { MATURIN, NODE_PLATFORMS, WASM_BINDGEN } from '../src/generate/packages.ts';
import { ASSET_JOBS, cargoFindings, CHECKOUT_STEPS, REHEARSAL_STEPS, releaseRecipes, RELEASE_STEPS } from '../src/release/recipes.ts';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const fixture = new URL('./fixtures/repo/', import.meta.url).pathname;
const fixtureContract = (): Contract => JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8')) as Contract;
// The major release of LLVM that a repository pins in config/toolchain.json for the bindgen of ext-php-rs.
const LLVM_MAJOR = '21';
// The PHP minors of the extension that a repository names in phpExtension.minors of config/toolchain.json (GN-19a).
const PHP_MINORS = ['8.4', '8.5'];

test('the recipes of a contract name its crates, packages and targets, and a component has its own file and targets (GN-19h)', () => {
  const contract = fixtureContract();
  const recipes = releaseRecipes(contract);
  assert.equal(recipes.path, 'packages/release.mk');
  assert.deepEqual(recipes.targets, ['release-go-static', 'release-wheel', 'release-php-ext', 'release-npm-platform', 'release-npm', 'release-go-module', 'release-binding-check', 'release-platform-assets', 'release-assets-platform', 'release-assets-php', 'release-assets-npm', 'checkout-node-addon', 'rehearse-go-module']);
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
  assert.deepEqual(php.targets, ['release-php-ext', 'release-binding-check', 'release-platform-assets', 'release-assets-php']);
  assert.doesNotMatch(php.text, /^(release-wheel|release-npm|release-go|install-wasm-bindgen)/m);
  const component = releaseRecipes({ ...contract, core: { ...contract.core, path: 'packages/forms/rust' } });
  assert.equal(component.path, 'packages/forms/release.mk');
  assert.ok(component.targets.every((target) => target.endsWith('-forms')), component.targets.join(' '));
  assert.match(component.text, /--manifest-path packages\/forms\/ts\/Cargo\.toml/);
  assert.match(component.text, /\$\(CURDIR\)\/packages\/forms\/rust\/interface\.json/);
  // Every step of a release that GN-19h names is a target of a contract with every target.
  assert.deepEqual([...RELEASE_STEPS, ...ASSET_JOBS, ...CHECKOUT_STEPS, ...REHEARSAL_STEPS].sort(), [...recipes.targets].sort());
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
const kept = Object.fromEntries(['CARGO_TARGET_DIR', 'LIBCLANG_PATH', 'CLANG_PATH', 'PHP', 'PHP_CONFIG', 'SOURCE_DATE_EPOCH', 'MATURIN_PEP517_ARGS', 'CARGO_VIA', 'CC_x86_64_unknown_linux_musl', 'AR_x86_64_unknown_linux_musl', 'CC_aarch64_unknown_linux_musl', 'AR_aarch64_unknown_linux_musl'].filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
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
  execFileSync(process.execPath, [cli, 'scaffold', '--cargo', 'cargo', '--root', root]);
  execFileSync(process.execPath, [cli, 'release-recipes', '--root', root]);
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, 'config/toolchain.json'), `${JSON.stringify({ schema: 1, llvm: { version: LLVM_MAJOR }, phpExtension: { minors: PHP_MINORS } }, null, 2)}\n`);
  const bin = join(root, '.stand-ins');
  const sysroot = join(root, '.sysroot');
  const llvm = join(root, '.llvm');
  standIn(bin, 'rustc', `if (args.join(' ') === '--print host-tuple') console.log(${JSON.stringify(host)});\nelse if (args.join(' ') === '--print sysroot') console.log(${JSON.stringify(sysroot)});\nelse process.exit(1);`);
  standIn(join(sysroot, 'lib/rustlib', host, 'bin'), 'llvm-strip', `fs.writeFileSync(args[args.length - 1], 'stripped');`);
  // cargo writes the library of the crate of -p into the target directory of CARGO_TARGET_DIR, under the target of --target.
  standIn(bin, 'cargo', `const crate = option('-p');
if (args[0] === 'pkgid') { console.log('path+file:///repository#' + crate + '@0.0.3'); process.exit(0); }
// cargo metadata names the target directory, CARGO_TARGET_DIR or the target of the workspace.
const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(process.cwd(), 'target');
if (args[0] === 'metadata') { console.log(JSON.stringify({ packages: [], target_directory: targetDir })); process.exit(0); }
// cargo tree --prefix none --format {p} prints a line <name> v<version> for each package of the build of the crate; a
// case names the packages of its dependencies in CARGO_TREE (B2.442).
if (args[0] === 'tree') { console.log([crate + ' v0.0.3', ...(process.env.CARGO_TREE ?? '').split(',').filter((line) => line !== '')].join('\\n')); process.exit(0); }
const lib = crate.replaceAll('-', '_');
const cdylib = process.platform === 'darwin' ? 'dylib' : 'so';
const name = crate.endsWith('-go') ? 'lib' + lib + '.a' : crate.endsWith('-wasm') ? lib + '.wasm' : crate.endsWith('-php-ext') ? 'libpolyspec_sample.' + cdylib : crate.endsWith('-node') ? 'lib' + lib + '.' + cdylib : 'lib' + lib;
const dir = path.join(targetDir, args.includes('--target') ? option('--target') : '', args.includes('--release') ? 'release' : 'debug');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, name), 'built');
// rustc prints the native-static-libs of a static library to the diagnostics (GN-15k).
if (args[0] === 'rustc' && args.includes('native-static-libs')) process.stderr.write('note: link against the following native artifacts\\nnote: native-static-libs: -lnative_' + (args.includes('--target') ? option('--target') : 'host').replaceAll('-', '_') + ' -lc\\n');`);
  // binding generate --target node writes the generated entry of the npm package, beside which the addon of a
  // checkout lies (GN-3c).
  standIn(bin, 'binding', `if (args[0] === 'generate' && option('--target') === 'node') {
  fs.mkdirSync(path.join(${JSON.stringify(root)}, 'packages/ts/generated'), { recursive: true });
  fs.writeFileSync(path.join(${JSON.stringify(root)}, 'packages/ts/generated/index.cjs'), 'generated');
}`);
  standIn(bin, 'git', `console.log('1767323045');`);
  // uv, which builds no wheel of a release (B2.491): a case sees that no recipe starts it.
  standIn(bin, 'uv', '');
  // maturin build tags a Linux wheel with the policy of --compatibility (manylinux_<policy>_<arch>), and macOS ignores
  // the option (cp314-abi3-macosx_11_0_arm64); maturin --version prints maturin <release>, MATURIN_VERSION of a case or
  // the release of mise.toml.
  standIn(bin, 'maturin', `if (args[0] === '--version') { console.log('maturin ' + (process.env.MATURIN_VERSION ?? ${JSON.stringify(/^"github:PyO3\/maturin" = "([^"]+)"$/m.exec(readFileSync(new URL('../../../mise.toml', import.meta.url), 'utf8'))?.[1] ?? '')})); process.exit(0); }
const named = args.includes('--compatibility') ? option('--compatibility') : 'linux';
const host = ${JSON.stringify(host)};
const arch = host.split('-')[0];
const tag = host.endsWith('-apple-darwin') ? 'macosx_11_0_' + (arch === 'aarch64' ? 'arm64' : arch) : named === 'linux' ? 'linux_' + arch : named + '_' + arch;
fs.mkdirSync(option('--out'), { recursive: true });
fs.writeFileSync(path.join(option('--out'), 'polyspec_sample-0.0.3-cp314-abi3-' + tag + '.whl'), 'wheel');`);
  standIn(bin, 'mise', '');
  standIn(bin, 'php', `const code = option('-r');
if (code.includes('PHP_MAJOR_VERSION')) process.stdout.write(process.env.PHP_MINOR ?? '8.4');
else if (code === 'echo PHP_VERSION;') process.stdout.write(process.env.PHP_VERSION ?? (process.env.PHP_MINOR ?? '8.4') + '.27');
else if (code.includes('PHP_DEBUG')) process.stdout.write('-nts');`);
  standIn(bin, 'php-config', `if (args[0] === '--version') console.log(process.env.PHP_CONFIG_VERSION ?? (process.env.PHP_MINOR ?? '8.4') + '.27');`);
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
  // npm pack --dry-run --json lists the files of the package in an object keyed by the name of the package, as the npm
  // 12.2.0 of devEngines writes it ({"@polyspec/sample": {"id": ..., "files": [{"path": ...}]}}), and npm pack writes
  // the archive of the manifest of its folder.
  standIn(bin, 'npm', `const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (args.includes('--dry-run')) { console.log(JSON.stringify({ [manifest.name]: { id: manifest.name + '@' + manifest.version, name: manifest.name, version: manifest.version, files: [{ path: 'package.json' }] } }, null, 2)); process.exit(0); }
fs.writeFileSync(path.join(option('--pack-destination'), manifest.name.replace('@', '').replace('/', '-') + '-' + manifest.version + '.tgz'), JSON.stringify(manifest));`);
  standIn(bin, 'wasm-bindgen', `if (args[0] === '--version') { console.log('wasm-bindgen ${WASM_BINDGEN}'); process.exit(0); }
fs.mkdirSync(option('--out-dir'), { recursive: true });
fs.writeFileSync(path.join(option('--out-dir'), option('--out-name') + '_bg.wasm'), 'bound');`);
  writeFileSync(join(root, 'Makefile'), `NODE := ${process.execPath}\nNPM := ${join(bin, 'npm')}\nUV := ${join(bin, 'uv')}\nBINDING_RUN := ${join(bin, 'binding')}\nCARGO := ${join(bin, 'cargo')}\nNAPI := ${join(bin, 'napi')}\nWASM_BINDGEN := ${join(bin, 'wasm-bindgen')}\nMATURIN := ${join(bin, 'maturin')}\nMISE := ${join(bin, 'mise')}\ninclude packages/release.mk\n`);
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
    ['release-go-static', 'go', 'cargo', 'rustc'],
    ['release-wheel', 'python', 'maturin', 'build'],
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
  const builds = linux.calls().filter((call) => call.tool === 'cargo' && call.args[0] === 'rustc');
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

test('B2.367: release-go-static builds each library with the print of rustc and writes its native-static-libs beside it (GN-15k)', (t) => {
  const linux = sandbox(t, 'aarch64-unknown-linux-gnu');
  const run = linux.make('release-go-static');
  assert.equal(run.status, 0, run.output);
  const builds = linux.calls().filter((call) => call.tool === 'cargo' && call.args[0] === 'rustc').map((call) => call.args);
  assert.deepEqual(builds, [
    ['rustc', '--release', '--locked', '--color', 'never', '-p', 'polyspec-sample-go', '--lib', '--crate-type', 'staticlib', '--', '--print', 'native-static-libs'],
    ['rustc', '--release', '--locked', '--color', 'never', '-p', 'polyspec-sample-go', '--target', 'aarch64-unknown-linux-musl', '--lib', '--crate-type', 'staticlib', '--', '--print', 'native-static-libs'],
  ]);
  assert.equal(readFileSync(join(linux.root, 'var/release/assets/go/linux_arm64/native-static-libs'), 'utf8'), '-lnative_host -lc\n');
  assert.equal(readFileSync(join(linux.root, 'var/release/assets/go/linux_arm64_musl/native-static-libs'), 'utf8'), '-lnative_aarch64_unknown_linux_musl -lc\n');
  // The diagnostics of cargo stay in the output of the recipe.
  assert.match(run.output, /note: native-static-libs: -lnative_host -lc/);
});

test('B2.415: release-go-static copies a library that the native-static-libs name from the self-contained directory of the Rust toolchain of the target beside the library (GN-15k)', (t) => {
  const linux = sandbox(t, 'aarch64-unknown-linux-gnu');
  // rustc of a musl target prints the LLVM unwinder that its std links with -bundle; the host prints none.
  writeFileSync(join(linux.bin, 'cargo'), readFileSync(join(linux.bin, 'cargo'), 'utf8').replace("' -lc\\n'", "(args.includes('--target') ? ' -lunwind' : '') + ' -lc\\n'"));
  const selfContained = join(linux.root, '.sysroot/lib/rustlib/aarch64-unknown-linux-musl/lib/self-contained');
  mkdirSync(selfContained, { recursive: true });
  writeFileSync(join(selfContained, 'libunwind.a'), 'unwinder of musl');
  const run = linux.make('release-go-static');
  assert.equal(run.status, 0, run.output);
  assert.equal(readFileSync(join(linux.root, 'var/release/assets/go/linux_arm64_musl/native-static-libs'), 'utf8'), '-lnative_aarch64_unknown_linux_musl -lunwind -lc\n');
  assert.equal(readFileSync(join(linux.root, 'var/release/assets/go/linux_arm64_musl/libunwind.a'), 'utf8'), 'unwinder of musl');
  assert.equal(existsSync(join(linux.root, 'var/release/assets/go/linux_arm64/libunwind.a')), false, 'the library of the GNU C library carries an unwinder that its libraries do not name');
});

test('B2.367: release-go-static fails when cargo prints no native-static-libs, and writes no file (GN-15k)', (t) => {
  const mac = sandbox(t, 'aarch64-apple-darwin');
  writeFileSync(join(mac.bin, 'cargo'), readFileSync(join(mac.bin, 'cargo'), 'utf8').replace("args.includes('native-static-libs')", 'false'));
  const run = mac.make('release-go-static');
  assert.notEqual(run.status, 0);
  assert.match(run.output, /release-go-static: cargo printed no native-static-libs of polyspec-sample-go for darwin_arm64 \(GN-15k\)/);
  assert.equal(existsSync(join(mac.root, 'var/release/assets/go/darwin_arm64/native-static-libs')), false);
});

// B2.442: a dependency of the Go crate that builds C (ring of rustls, in session-store) needs the C compiler and the
// archiver of the musl target, which the crate cc reads as CC_<target> and AR_<target>. The Makefile of the repository
// declares them before the include, as a consumer does; a variable of the command line of make would reach every
// command of the recipe, so a case writes the declarations into the Makefile.
const MUSL_TREE = 'rustls v0.23.46,ring v0.17.14,cc v1.11.1,shlex v1.3.0';
function declare(box: Sandbox, ...lines: string[]): void {
  const makefile = join(box.root, 'Makefile');
  writeFileSync(makefile, readFileSync(makefile, 'utf8').replace('include packages/release.mk\n', `${lines.join('\n')}\ninclude packages/release.mk\n`));
}
const cargoCalls = (box: Sandbox, subcommand: string): ReturnType<Sandbox['calls']> => box.calls().filter((call) => call.tool === 'cargo' && call.args[0] === subcommand);

test('B2.442: release-go-static passes the C compiler and the archiver of the musl target that the Makefile declares to the build of that target, and to no other command (GN-19b)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  box.env['CARGO_TREE'] = MUSL_TREE;
  declare(box, 'CC_aarch64_unknown_linux_musl := /llvm/bin/clang', 'AR_aarch64_unknown_linux_musl := /llvm/bin/llvm-ar', 'CC_x86_64_unknown_linux_musl := /other/clang', 'AR_x86_64_unknown_linux_musl := /other/llvm-ar');
  const run = box.make('release-go-static');
  assert.equal(run.status, 0, run.output);
  const target = join('var/release/target');
  assert.deepEqual(cargoCalls(box, 'rustc').map((call) => call.env), [
    { CARGO_TARGET_DIR: target },
    { CARGO_TARGET_DIR: target, CC_aarch64_unknown_linux_musl: '/llvm/bin/clang', AR_aarch64_unknown_linux_musl: '/llvm/bin/llvm-ar' },
  ]);
  // Every other command of the recipe runs without them, and so does a recipe of another target.
  assert.equal(box.make('release-wheel').status, 0);
  for (const call of box.calls().filter((c) => !(c.tool === 'cargo' && c.args.includes('--target')))) {
    assert.deepEqual(Object.keys(call.env).filter((key) => /^(CC|AR)_/.test(key)), [], `${call.tool} ${call.args.join(' ')}`);
  }
  // Both are declared, so the recipe does not ask cargo whether a dependency builds C.
  assert.deepEqual(cargoCalls(box, 'tree'), []);
  assert.equal(readFileSync(join(box.root, 'var/release/assets/go/linux_arm64_musl/native-static-libs'), 'utf8'), '-lnative_aarch64_unknown_linux_musl -lc\n');
});

test('B2.442: release-go-static names the C compiler and the archiver of the musl target that the Makefile does not declare when the crate cc is in the build of the Go crate, before a build (GN-19b)', (t) => {
  const box = sandbox(t, 'x86_64-unknown-linux-gnu');
  box.env['CARGO_TREE'] = MUSL_TREE;
  const none = box.make('release-go-static');
  assert.equal(none.status, 2, none.output);
  assert.match(none.output, /release-go-static needs CC_x86_64_unknown_linux_musl AR_x86_64_unknown_linux_musl: the C compiler CC_x86_64_unknown_linux_musl and the archiver AR_x86_64_unknown_linux_musl of the target x86_64-unknown-linux-musl, which the crate cc reads, because a dependency of polyspec-sample-go builds C with that crate; define them before the include of packages\/release\.mk \(GN-19b\)/);
  assert.deepEqual(cargoCalls(box, 'tree').map((call) => call.args), [['tree', '--locked', '-p', 'polyspec-sample-go', '--target', 'x86_64-unknown-linux-musl', '-e', 'normal,build', '--prefix', 'none', '--format', '{p}']]);
  assert.deepEqual(cargoCalls(box, 'rustc'), [], 'no library is built before the refusal');
  assert.equal(existsSync(join(box.root, 'var/release/assets')), false);
  // The pair of the other arch does not stand for the one of the arch of the run, and one of a pair names the other.
  declare(box, 'CC_aarch64_unknown_linux_musl := /llvm/bin/clang', 'AR_aarch64_unknown_linux_musl := /llvm/bin/llvm-ar', 'CC_x86_64_unknown_linux_musl := /llvm/bin/clang');
  const one = box.make('release-go-static');
  assert.equal(one.status, 2, one.output);
  assert.match(one.output, /release-go-static needs AR_x86_64_unknown_linux_musl: /);
  assert.deepEqual(cargoCalls(box, 'rustc'), []);
});

test('B2.442: a build of the Go crate without the crate cc, a macOS host and a contract without the target go are not asked for a C compiler (GN-19b)', (t) => {
  // No dependency builds C: the recipe asks cargo, builds both libraries and passes nothing.
  const plain = sandbox(t, 'x86_64-unknown-linux-gnu');
  plain.env['CARGO_TREE'] = 'libc v0.2.186,cc-traits v2.0.0';
  const built = plain.make('release-go-static');
  assert.equal(built.status, 0, built.output);
  assert.equal(cargoCalls(plain, 'tree').length, 1);
  assert.deepEqual(cargoCalls(plain, 'rustc').map((call) => Object.keys(call.env)), [['CARGO_TARGET_DIR'], ['CARGO_TARGET_DIR']]);
  // A macOS host builds no library of musl.
  const mac = sandbox(t, 'aarch64-apple-darwin');
  mac.env['CARGO_TREE'] = MUSL_TREE;
  const macRun = mac.make('release-go-static');
  assert.equal(macRun.status, 0, macRun.output);
  assert.deepEqual(cargoCalls(mac, 'tree'), []);
  // A contract without the target go has no recipe that reads the variables.
  const other = sandbox(t, 'x86_64-unknown-linux-gnu', (contract) => { contract.targets = contract.targets.filter((target) => target !== 'go'); });
  other.env['CARGO_TREE'] = MUSL_TREE;
  const text = readFileSync(join(other.root, 'packages/release.mk'), 'utf8');
  assert.doesNotMatch(text, /unknown_linux_musl|\$\(CARGO\) tree/);
  const assets = other.make('release-assets-platform');
  assert.equal(assets.status, 0, assets.output);
  assert.deepEqual(cargoCalls(other, 'tree'), []);
  assert.match(readFileSync(join(plain.root, 'packages/release.mk'), 'utf8'), /CC_x86_64_unknown_linux_musl, AR_x86_64_unknown_linux_musl, CC_aarch64_unknown_linux_musl, AR_aarch64_unknown_linux_musl/);
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
    [join(box.root, '.no-llvm'), {}, /needs the libclang and the clang of LLVM 21 \(config\/toolchain\.json\) in .*\.no-llvm/],
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

test('B2.275: PHP release checks the expected runtime and header minor before cargo builds (GN-19d)', (t) => {
  const box = sandbox(t, 'x86_64-unknown-linux-gnu');
  const php = `PHP=${join(box.bin, 'php')}`;
  const make = (expected?: string): ReturnType<Sandbox['make']> => box.make('release-php-ext', php, `LLVM_ROOT=${box.llvm}`, ...(expected === undefined ? [] : [`EXPECTED_PHP_MINOR=${expected}`]));
  const noBuild = (): void => assert.equal(box.calls().filter((call) => call.tool === 'cargo').length, 0, JSON.stringify(box.calls()));
  const clear = (): void => { writeFileSync(box.env['CALLS'] as string, ''); };

  const wrongRuntime = make('8.5');
  assert.equal(wrongRuntime.status, 2, wrongRuntime.output);
  assert.match(wrongRuntime.output, /PHP runtime 8\.4 does not match EXPECTED_PHP_MINOR 8\.5/);
  noBuild();
  for (const expected of ['8', '8.4.27', '8.x', '.4', '8.']) {
    clear();
    const malformed = make(expected);
    assert.equal(malformed.status, 2, malformed.output);
    assert.match(malformed.output, /EXPECTED_PHP_MINOR must be major\.minor/);
    noBuild();
  }
  box.env['PHP_CONFIG_VERSION'] = '8.5.3';
  for (const expected of ['8.4', undefined]) {
    clear();
    const wrongHeaders = make(expected);
    assert.equal(wrongHeaders.status, 2, wrongHeaders.output);
    assert.match(wrongHeaders.output, /php-config 8\.5\.3 has minor 8\.5, not PHP runtime 8\.4/);
    noBuild();
  }
  delete box.env['PHP_CONFIG_VERSION'];

  for (const [minor, expected] of [['8.4', '8.4'], ['8.5', '8.5'], ['8.5', undefined]] as const) {
    clear();
    box.env['PHP_MINOR'] = minor;
    const run = make(expected);
    assert.equal(run.status, 0, run.output);
    assert.match(run.output, new RegExp(`PHP runtime ${minor.replace('.', '\\.') }\\.27; php-config ${minor.replace('.', '\\.') }\\.27`));
    assert.match(box.calls().find((call) => call.tool === 'cargo' && call.args[0] === 'build')?.env['CARGO_TARGET_DIR'] ?? '', new RegExp(`php${minor.replace('.', '\\.') }-nts$`));
    assert.ok(existsSync(join(box.root, `var/release/assets/php-ext/php_polyspec_sample-v0.0.3_php${minor}-x86_64-linux-glibc-nts.zip`)));
  }
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

test('the npm package packs the tracked manifest, which names no platform package, and holds the bound WASM module (GN-19e, GN-3c)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  const run = box.make('release-npm');
  assert.equal(run.status, 0, run.output);
  const packed = JSON.parse(readFileSync(join(box.root, 'var/release/assets/npm/polyspec-sample-0.0.3.tgz'), 'utf8')) as { optionalDependencies?: Record<string, string> };
  // No registry holds a platform package before 0.1, so a version range would be skipped by npm: the consumer names
  // each platform package by its asset URL, and the packed manifest names none (GN-3c).
  assert.equal(packed.optionalDependencies, undefined);
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
  const run = box.make('release-wheel', 'CARGO=');
  assert.equal(run.status, 2);
  assert.match(run.output, /release-wheel needs CARGO: the cargo command of the repository; define it before the include of packages\/release\.mk \(GN-19h\)/);
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

test('B2.488: release-go-module pushes no tag, and release-go-module-push pushes the tags of every Go module of the release at once, so a module that fails leaves no tag on the remote (GN-19f, GN-19h)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  // binding release-go-module prints the reference of the tag that it made, and fails as a module whose proof fails.
  standIn(box.bin, 'binding', `if (args[0] === 'release-go-module') {
  if (process.env.GO_MODULE_FAILS === '1') { console.error('binding: go test -count=1 . ended with status 1'); process.exit(1); }
  console.log('refs/tags/packages/go/' + option('--tag'));
}`);
  const refs = join(box.root, 'var/release/target/go-module-refs');
  const pushes = (): string[] => box.calls().filter((call) => call.tool === 'git' && call.args[0] === 'push').map((call) => call.args.join(' '));
  // The first module of a release: its reference waits, and nothing is pushed.
  const first = box.make('release-go-module', 'TAG=v0.0.3');
  assert.equal(first.status, 0, first.output);
  assert.match(first.output, /release-go-module: refs\/tags\/packages\/go\/v0\.0\.3 waits for make release-go-module-push/);
  assert.equal(readFileSync(refs, 'utf8'), 'refs/tags/packages/go/v0.0.3\n');
  // The second module fails: the release stops before the push, and the remote keeps no tag of the first. Before
  // B2.488 the recipe of each module pushed its own tag, so the first tag stayed on the remote alone.
  const failed = box.make('release-go-module', 'release-go-module-push', 'TAG=v0.0.3', 'GO_MODULE_FAILS=1');
  assert.notEqual(failed.status, 0);
  assert.deepEqual(pushes(), []);
  // The same recipes run again, and one push takes every tag, each once.
  const again = box.make('release-go-module', 'release-go-module-push', 'TAG=v0.0.3');
  assert.equal(again.status, 0, again.output);
  assert.deepEqual(pushes(), ['push --atomic origin refs/tags/packages/go/v0.0.3']);
  assert.equal(existsSync(refs), false);
  // With no reference waiting, the push pushes nothing; a reference of another tag stops it before the push.
  assert.equal(box.make('release-go-module-push', 'TAG=v0.0.3').status, 0);
  writeFileSync(refs, 'refs/tags/packages/go/v0.0.2\nrefs/tags/packages/go/v0.0.3\n');
  const stale = box.make('release-go-module-push', 'TAG=v0.0.3');
  assert.equal(stale.status, 2);
  assert.match(stale.output, /release-go-module-push: .*go-module-refs names refs\/tags\/packages\/go\/v0\.0\.2, which is no tag of a Go module of v0\.0\.3/);
  assert.deepEqual(pushes(), ['push --atomic origin refs/tags/packages/go/v0.0.3']);
  assert.match(box.make('release-go-module-push').output, /release-go-module-push: TAG is required/);
  // The recipe is shared by the files of recipes of the contracts of a repository, defined once.
  const component = releaseRecipes({ ...fixtureContract(), core: { ...fixtureContract().core, path: 'packages/forms/rust' } });
  assert.match(component.text, /^ifndef BINDING_RELEASE_GO_MODULE_PUSH$/m);
  assert.match(component.text, /^release-go-module-push:$/m);
  assert.doesNotMatch(releaseRecipes({ ...fixtureContract(), targets: ['php'] }).text, /release-go-module-push/);
});

test('B2.479: rehearse-go-module builds the library of the host and runs the rehearsal of binding release-go-module for TAG in the folder that the contracts of the repository share, and pushes nothing (GN-19f, GN-19h)', (t) => {
  const box = sandbox(t, 'aarch64-apple-darwin');
  const noTag = box.make('rehearse-go-module');
  assert.equal(noTag.status, 2);
  assert.match(noTag.output, /rehearse-go-module: TAG is required, the tag that the release will make/);
  writeFileSync(box.env['CALLS'] as string, '');
  const run = box.make('rehearse-go-module', 'TAG=v0.0.3');
  assert.equal(run.status, 0, run.output);
  const calls = box.calls();
  const rehearsal = callIndex(calls, 'binding', 'release-go-module');
  assert.deepEqual(calls[rehearsal]?.args, ['release-go-module', '--contract', join(box.root, 'packages/rust/interface.json'), '--tag', 'v0.0.3', '--libraries', join(box.root, 'var/release/assets/go'), '--work', join(box.root, 'var/release/target/go-module-rehearsal'), '--go', 'go', '--rehearsal']);
  // The library of the host is built before the rehearsal reads it.
  assert.ok(callIndex(calls, 'cargo', 'rustc') < rehearsal);
  assert.equal(existsSync(join(box.root, 'var/release/assets/go/darwin_arm64/libpolyspec_sample_go.a')), true);
  assert.deepEqual(calls.filter((call) => call.tool === 'git').map((call) => call.args.join(' ')).filter((line) => /\b(push|tag)\b/.test(line)), []);
  // The folder has no name of a component, so the rehearsals of two contracts of one repository share it.
  const component = releaseRecipes({ ...fixtureContract(), core: { ...fixtureContract().core, path: 'packages/forms/rust' } });
  assert.match(component.text, /^rehearse-go-module-forms: \$\(BINDING_DEP\) release-go-static-forms$/m);
  assert.match(component.text, /--work \$\(abspath \$\(RELEASE_TARGET\)\)\/go-module-rehearsal --go "\$\(GO\)" --rehearsal$/m);
  // It is no step of a release: no recipe of a release runs it.
  assert.doesNotMatch(releaseRecipes(fixtureContract()).text, /^release-[a-z-]+:.*rehearse-go-module/m);
});

// B2.267: the wheel that release-wheel builds on each platform is one that release-platform-assets takes, a manylinux
// wheel on Linux, because pip and PyPI install a linux_<arch> wheel on no other system.
test('the wheel that release-wheel builds on each platform is a wheel of that platform for release-platform-assets (GN-19c, GN-19g)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  standIn(box.bin, 'gh', '');
  const assets = join(box.root, 'var/release/assets');
  for (const host of ['x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu', 'aarch64-apple-darwin']) {
    const built = sandbox(t, host);
    const run = built.make('release-wheel');
    assert.equal(run.status, 0, `${host}: ${run.output}`);
    for (const wheel of readdirSync(join(built.root, 'var/release/assets/wheel'))) {
      mkdirSync(join(assets, 'wheel'), { recursive: true });
      cpSync(join(built.root, 'var/release/assets/wheel', wheel), join(assets, 'wheel', wheel));
    }
  }
  const put = (path: string): void => {
    mkdirSync(join(assets, path, '..'), { recursive: true });
    writeFileSync(join(assets, path), 'asset');
  };
  // The names that npm pack and the PHP recipe gave in a release run (json 0.0.27), for the sample at 0.0.3.
  put('npm/polyspec-sample-0.0.3.tgz');
  for (const platform of ['linux-x64-gnu', 'linux-arm64-gnu', 'darwin-arm64']) put(`npm/polyspec-sample-${platform}-0.0.3.tgz`);
  for (const minor of PHP_MINORS) {
    for (const pie of ['x86_64-linux-glibc', 'arm64-linux-glibc', 'arm64-darwin-bsdlibc']) put(`php-ext/php_polyspec_sample-v0.0.3_php${minor}-${pie}-nts.zip`);
  }
  const run = box.make('release-platform-assets', 'TAG=v0.0.3');
  assert.equal(run.status, 0, run.output);
  const labels = (box.calls().find((call) => call.tool === 'gh')?.args ?? []).slice(3).filter((arg) => arg.includes('/wheel/')).map((arg) => arg.slice(arg.lastIndexOf('/') + 1)).sort();
  assert.deepEqual(labels, [
    'polyspec_sample-0.0.3-cp314-abi3-macosx_11_0_arm64.whl#polyspec-sample-python-0.0.3-darwin-arm64',
    'polyspec_sample-0.0.3-cp314-abi3-manylinux_2_34_aarch64.whl#polyspec-sample-python-0.0.3-linux-arm64-gnu',
    'polyspec_sample-0.0.3-cp314-abi3-manylinux_2_34_x86_64.whl#polyspec-sample-python-0.0.3-linux-x64-gnu',
  ]);
});

// B2.491: uv build builds a wheel with the PEP 517 backend that it resolves from requires of the build-system table of
// pyproject.toml, a range of maturin with no hash, so the maturin of a release would be the one that the registry gives
// that day. release-wheel builds with the maturin of mise.toml, which mise.lock pins by its digest, and which the tests
// of the bindings run too (HR-70, HR-81, HR-89).
test('B2.491: release-wheel builds the wheel with the maturin of mise.toml, not with the backend that uv build resolves from pyproject.toml (GN-19c)', (t) => {
  const pinned = /^"github:PyO3\/maturin" = "([^"]+)"$/m.exec(readFileSync(new URL('../../../mise.toml', import.meta.url), 'utf8'))?.[1];
  assert.equal(MATURIN, pinned, 'the release of maturin of binding is not the one of mise.toml');
  const box = sandbox(t, 'x86_64-unknown-linux-gnu');
  const quoted = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const dry = box.make('-n', 'release-wheel');
  assert.equal(dry.status, 0, dry.output);
  assert.doesNotMatch(dry.output, /\buv build\b|\/uv build/, 'the dry run of release-wheel resolves the build backend from the range of pyproject.toml');
  assert.match(dry.output, /mise install --locked github:PyO3\/maturin$/m);
  assert.match(dry.output, new RegExp(`${quoted(join(box.bin, 'maturin'))} build --release --locked --compatibility manylinux_2_34 --interpreter python3 --manifest-path packages/python/Cargo\\.toml --out var/release/assets/wheel`));
  // The build runs the maturin of the release that binding pins, and builds nothing with another.
  const run = box.make('release-wheel');
  assert.equal(run.status, 0, run.output);
  const calls = box.calls();
  assert.ok(callIndex(calls, 'mise', 'install', '--locked', 'github:PyO3/maturin') < callIndex(calls, 'maturin', 'build'));
  assert.deepEqual(calls.filter((call) => call.tool === 'uv'), []);
  assert.equal(calls.find((call) => call.tool === 'maturin' && call.args[0] === 'build')?.env['SOURCE_DATE_EPOCH'], '1767323045');
  writeFileSync(box.env['CALLS'] as string, '');
  box.env['MATURIN_VERSION'] = '1.15.0';
  const other = box.make('release-wheel');
  assert.equal(other.status, 2, other.output);
  assert.match(other.output, new RegExp(`release-wheel: ${quoted(join(box.bin, 'maturin'))} is maturin 1\\.15\\.0, not the release ${quoted(MATURIN)} of mise\\.toml \\(GN-19c\\)`));
  assert.deepEqual(box.calls().filter((call) => call.tool === 'maturin' && call.args[0] === 'build'), []);
});

test('the assets of each platform are required and labelled before an upload (GN-19g)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  standIn(box.bin, 'gh', '');
  const assets = join(box.root, 'var/release/assets');
  const put = (path: string): void => {
    mkdirSync(join(assets, path, '..'), { recursive: true });
    writeFileSync(join(assets, path), 'asset');
  };
  put('wheel/polyspec_sample-0.0.3-cp314-abi3-manylinux_2_39_x86_64.whl');
  put('wheel/polyspec_sample-0.0.3-cp314-abi3-manylinux_2_39_aarch64.whl');
  put('npm/polyspec-sample-0.0.3.tgz');
  for (const platform of ['linux-x64-gnu', 'linux-arm64-gnu', 'darwin-arm64']) put(`npm/polyspec-sample-${platform}-0.0.3.tgz`);
  for (const minor of PHP_MINORS) {
    for (const pie of ['x86_64-linux-glibc', 'arm64-linux-glibc', 'arm64-darwin-bsdlibc']) put(`php-ext/php_polyspec_sample-v0.0.3_php${minor}-${pie}-nts.zip`);
  }
  const missing = box.make('release-platform-assets', 'TAG=v0.0.3');
  // make ends with 2 for a recipe that fails, whatever status the recipe gave.
  assert.equal(missing.status, 2, missing.output);
  assert.match(missing.output, /var\/release\/assets lacks polyspec-sample-python-0\.0\.3-darwin-arm64$/m);
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
    'polyspec-sample-php-ext-0.0.3-php8.5-darwin-arm64',
    'polyspec-sample-php-ext-0.0.3-php8.5-linux-arm64-gnu',
    'polyspec-sample-php-ext-0.0.3-php8.5-linux-x64-gnu',
    'polyspec-sample-python-0.0.3-darwin-arm64',
    'polyspec-sample-python-0.0.3-linux-arm64-gnu',
    'polyspec-sample-python-0.0.3-linux-x64-gnu',
    'polyspec-sample-ts-0.0.3',
    'polyspec-sample-ts-0.0.3-darwin-arm64',
    'polyspec-sample-ts-0.0.3-linux-arm64-gnu',
    'polyspec-sample-ts-0.0.3-linux-x64-gnu',
  ]);
});

// B2.496: the gh upload followed the check of the labels at once, so a rehearsal before the tag could not see the step
// (template 0.0.28 was lost in its asset job). REHEARSAL=1 runs the checks of the labels and of the sizes, writes the
// list of the upload under WORK alone, calls neither gh nor git, and ends with the line "no upload".
test('B2.496: release-platform-assets REHEARSAL=1 runs the checks of the labels and the sizes, writes only under WORK, calls no gh and no git, and ends with no upload (GN-19g)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  standIn(box.bin, 'gh', '');
  const assets = join(box.root, 'var/release/assets');
  const put = (path: string, body = 'asset'): void => {
    mkdirSync(join(assets, path, '..'), { recursive: true });
    writeFileSync(join(assets, path), body);
  };
  for (const wheel of ['manylinux_2_34_x86_64', 'manylinux_2_34_aarch64', 'macosx_11_0_arm64']) put(`wheel/polyspec_sample-0.0.3-cp314-abi3-${wheel}.whl`);
  put('npm/polyspec-sample-0.0.3.tgz');
  for (const platform of ['linux-x64-gnu', 'linux-arm64-gnu', 'darwin-arm64']) put(`npm/polyspec-sample-${platform}-0.0.3.tgz`);
  for (const minor of PHP_MINORS) {
    for (const pie of ['x86_64-linux-glibc', 'arm64-linux-glibc', 'arm64-darwin-bsdlibc']) put(`php-ext/php_polyspec_sample-v0.0.3_php${minor}-${pie}-nts.zip`);
  }
  const work = join(box.root, 'var/rehearsal-work');
  // make -n: the rehearsal names no gh upload.
  const dry = box.make('-n', 'release-platform-assets', 'TAG=v0.0.3', 'REHEARSAL=1', `WORK=${work}`);
  assert.equal(dry.status, 0, dry.output);
  assert.doesNotMatch(dry.output, /gh release upload/);
  assert.match(dry.output, /no upload/);
  // A rehearsal without WORK is refused before any check.
  const without = box.make('release-platform-assets', 'TAG=v0.0.3', 'REHEARSAL=1');
  assert.equal(without.status, 2, without.output);
  assert.match(without.output, /release-platform-assets: REHEARSAL=1 requires WORK, the directory of the rehearsal/);
  const listing = (dir: string): string[] => readdirSync(dir, { recursive: true }).map(String).sort();
  const before = listing(box.root).filter((path) => !path.startsWith('var/rehearsal-work'));
  writeFileSync(box.env['CALLS'] as string, '');
  const run = box.make('release-platform-assets', 'TAG=v0.0.3', 'REHEARSAL=1', `WORK=${work}`);
  assert.equal(run.status, 0, run.output);
  assert.equal(run.output.trimEnd().split('\n').at(-1), 'no upload');
  assert.deepEqual(box.calls().filter((call) => call.tool === 'gh' || call.tool === 'git'), []);
  assert.deepEqual(listing(box.root).filter((path) => !path.startsWith('var/rehearsal-work')), before);
  const upload = readFileSync(join(work, 'platform-assets.txt'), 'utf8').trimEnd().split('\n');
  assert.equal(upload.length, 13);
  assert.ok(upload.includes('5 var/release/assets/npm/polyspec-sample-0.0.3.tgz#polyspec-sample-ts-0.0.3'), upload.join('\n'));
  // The rehearsal and the upload refuse an empty asset, which GitHub does not take, by its name.
  put('npm/polyspec-sample-0.0.3.tgz', '');
  for (const extra of [['REHEARSAL=1', `WORK=${work}`], []]) {
    writeFileSync(box.env['CALLS'] as string, '');
    const empty = box.make('release-platform-assets', 'TAG=v0.0.3', ...extra);
    assert.equal(empty.status, 2, empty.output);
    assert.match(empty.output, /release-platform-assets: .*npm\/polyspec-sample-0\.0\.3\.tgz is empty, and GitHub takes no empty asset/);
    assert.deepEqual(box.calls().filter((call) => call.tool === 'gh'), []);
  }
});

// B2.268: the assets of a release run (json 0.0.27) held the extension of PHP 8.4 alone on each platform, and the
// recipe counted the extensions, so it uploaded no extension for PHP 8.5, which the requirement php >=8.4 admits.
test('the upload requires the asset of each label: each platform, and each PHP minor of config/toolchain.json (GN-19a, GN-19g)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  standIn(box.bin, 'gh', '');
  const assets = join(box.root, 'var/release/assets');
  const put = (path: string): void => {
    mkdirSync(join(assets, path, '..'), { recursive: true });
    writeFileSync(join(assets, path), 'asset');
  };
  const remove = (path: string): void => { rmSync(join(assets, path)); };
  const platforms = { 'x86_64-linux-glibc': 'linux-x64-gnu', 'arm64-linux-glibc': 'linux-arm64-gnu', 'arm64-darwin-bsdlibc': 'darwin-arm64' };
  for (const wheel of ['manylinux_2_34_x86_64', 'manylinux_2_34_aarch64', 'macosx_11_0_arm64']) put(`wheel/polyspec_sample-0.0.3-cp314-abi3-${wheel}.whl`);
  put('npm/polyspec-sample-0.0.3.tgz');
  for (const platform of Object.values(platforms)) put(`npm/polyspec-sample-${platform}-0.0.3.tgz`);
  for (const pie of Object.keys(platforms)) put(`php-ext/php_polyspec_sample-v0.0.3_php8.4-${pie}-nts.zip`);
  const refused = (expected: RegExp): void => {
    writeFileSync(box.env['CALLS'] as string, '');
    const run = box.make('release-platform-assets', 'TAG=v0.0.3');
    assert.equal(run.status, 2, run.output);
    assert.match(run.output, expected);
    assert.equal(box.calls().filter((call) => call.tool === 'gh').length, 0);
  };
  refused(/release-platform-assets: var\/release\/assets lacks polyspec-sample-php-ext-0\.0\.3-php8\.5-linux-x64-gnu polyspec-sample-php-ext-0\.0\.3-php8\.5-linux-arm64-gnu polyspec-sample-php-ext-0\.0\.3-php8\.5-darwin-arm64$/m);
  for (const pie of Object.keys(platforms)) put(`php-ext/php_polyspec_sample-v0.0.3_php8.5-${pie}-nts.zip`);
  // A platform package or an extension that is missing is named by its label.
  remove('php-ext/php_polyspec_sample-v0.0.3_php8.4-arm64-darwin-bsdlibc-nts.zip');
  remove('npm/polyspec-sample-linux-x64-gnu-0.0.3.tgz');
  refused(/lacks polyspec-sample-ts-0\.0\.3-linux-x64-gnu polyspec-sample-php-ext-0\.0\.3-php8\.4-darwin-arm64$/m);
  put('php-ext/php_polyspec_sample-v0.0.3_php8.4-arm64-darwin-bsdlibc-nts.zip');
  put('npm/polyspec-sample-linux-x64-gnu-0.0.3.tgz');
  // Two wheels of one platform do not stand for the wheel of another.
  remove('wheel/polyspec_sample-0.0.3-cp314-abi3-macosx_11_0_arm64.whl');
  put('wheel/polyspec_sample-0.0.3-cp314-abi3-manylinux_2_39_x86_64.whl');
  refused(/manylinux_2_\d+_x86_64\.whl has the label polyspec-sample-python-0\.0\.3-linux-x64-gnu of another asset/);
  remove('wheel/polyspec_sample-0.0.3-cp314-abi3-manylinux_2_39_x86_64.whl');
  put('wheel/polyspec_sample-0.0.3-cp314-abi3-macosx_11_0_arm64.whl');
  // An extension of a PHP minor that the repository does not name is refused.
  put('php-ext/php_polyspec_sample-v0.0.3_php8.3-x86_64-linux-glibc-nts.zip');
  refused(/php8\.3-x86_64-linux-glibc-nts\.zip is for PHP 8\.3, no PHP minor of phpExtension\.minors of config\/toolchain\.json: 8\.4 8\.5/);
  remove('php-ext/php_polyspec_sample-v0.0.3_php8.3-x86_64-linux-glibc-nts.zip');
  // A repository that names no PHP minor of its extension is refused before an upload, since no set can be required.
  const toolchain = join(box.root, 'config/toolchain.json');
  const named = readFileSync(toolchain, 'utf8');
  for (const minors of [undefined, [], ['8']]) {
    writeFileSync(toolchain, JSON.stringify({ schema: 1, llvm: { version: LLVM_MAJOR }, ...(minors === undefined ? {} : { phpExtension: { minors } }) }));
    refused(/release-platform-assets: config\/toolchain\.json names no PHP minor of the extension in phpExtension\.minors, a list such as \["8\.4", "8\.5"\] \(GN-19a\)/);
  }
  writeFileSync(toolchain, named);
  writeFileSync(box.env['CALLS'] as string, '');
  const run = box.make('release-platform-assets', 'TAG=v0.0.3');
  assert.equal(run.status, 0, run.output);
  const labels = (box.calls().find((call) => call.tool === 'gh')?.args ?? []).slice(3).map((arg) => arg.slice(arg.indexOf('#') + 1));
  assert.equal(labels.filter((label) => label.includes('-php-ext-')).length, 6);
  assert.equal(labels.length, 13);
});

test('binding check reports a Makefile that does not include the recipes, a recipe copied by hand and recipes that binding writes otherwise (CK-94)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  const contractPath = join(box.root, 'packages/rust/interface.json');
  const check = (): string => String(spawnSync(process.execPath, [cli, 'check', '--cargo', 'cargo', contractPath], { encoding: 'utf8' }).stderr);
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

// B2.401: the stand-in of the development link of kit, `node link.mjs cargo <checkout>`, which takes the words
// `cargo <checkout>` before the arguments of Cargo and runs the cargo stand-in with them, marked as run through the link.
function linkStandIn(box: Sandbox): string {
  standIn(box.bin, 'link', `require('child_process').execFileSync(${JSON.stringify(join(box.bin, 'cargo'))}, args.slice(2), { stdio: 'inherit', env: { ...process.env, CARGO_VIA: args.slice(0, 2).join(' ') } });`);
  return `${join(box.bin, 'link')} cargo ${box.root}`;
}

test('B2.401: every recipe runs $(CARGO) with $(CARGOFLAGS) right after the subcommand of a build, and passes --cargo to each command of binding that runs cargo (GN-1d, GN-19h)', (t) => {
  const box = sandbox(t, 'x86_64-unknown-linux-gnu');
  const cargo = linkStandIn(box);
  for (const target of ['release-go-static', 'release-php-ext', 'release-npm', 'release-binding-check']) {
    writeFileSync(box.env['CALLS'] as string, '');
    const run = box.make(target, `CARGO=${cargo}`, 'CARGOFLAGS=--ignore-rust-version', `PHP=${join(box.bin, 'php')}`, `LLVM_ROOT=${box.llvm}`);
    assert.equal(run.status, 0, `${target}: ${run.output}`);
    const calls = box.calls();
    const cargoCalls = calls.filter((call) => call.tool === 'cargo');
    if (target !== 'release-binding-check') assert.notEqual(cargoCalls.length, 0, target);
    for (const call of cargoCalls) {
      assert.equal(call.env['CARGO_VIA'], `cargo ${box.root}`, `${target}: cargo ${call.args.join(' ')} ran without $(CARGO)`);
      if (call.args[0] === 'rustc' || call.args[0] === 'build') assert.equal(call.args[1], '--ignore-rust-version', `${target}: cargo ${call.args.join(' ')}`);
    }
    const bindings = calls.filter((call) => call.tool === 'binding' && (call.args[0] === 'generate' || call.args[0] === 'check'));
    assert.notEqual(bindings.length, 0, target);
    // B2.456: binding check also takes --go "$(GO)" after it, the go of PATH by default.
    for (const call of bindings) {
      const at = call.args.indexOf('--cargo');
      assert.deepEqual(call.args.slice(at, at + 2), ['--cargo', cargo], `${target}: binding ${call.args.join(' ')}`);
      assert.deepEqual(call.args.slice(at + 2), call.args[0] === 'check' ? ['--go', 'go'] : [], `${target}: binding ${call.args.join(' ')}`);
    }
  }
  // A recipe that runs cargo stops when the Makefile gives no CARGO, and names it.
  const none = box.make('release-go-static', 'CARGO=');
  assert.equal(none.status, 2, none.output);
  assert.match(none.output, /release-go-static needs CARGO: the cargo command of the repository/);
});

test('B2.401: binding check reports each line of the file of recipes that runs cargo without $(CARGO) and $(CARGOFLAGS), or binding without --cargo (CK-94, GN-1d)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  const contractPath = join(box.root, 'packages/rust/interface.json');
  const check = (): string => String(spawnSync(process.execPath, [cli, 'check', contractPath, '--cargo', 'cargo'], { encoding: 'utf8' }).stderr);
  const fragment = join(box.root, 'packages/release.mk');
  assert.doesNotMatch(check(), /CK-94/);
  const lines = ['\tCARGO_TARGET_DIR=x cargo build --release -p polyspec-sample-wasm', '\t$(CARGO) rustc --release -p polyspec-sample-go', '\t$(BINDING_RUN) generate --contract x --target go'];
  writeFileSync(fragment, `${readFileSync(fragment, 'utf8')}${lines.join('\n')}\n`);
  const found = check();
  assert.match(found, new RegExp(`${fragment}: CK-94 differs from what binding release-recipes writes`));
  const count = readFileSync(fragment, 'utf8').split('\n').length - 1;
  assert.match(found, new RegExp(`${fragment}:${String(count - 2)}: CK-94 runs cargo of PATH and not \\$\\(CARGO\\) \\(GN-1d\\)`));
  assert.match(found, new RegExp(`${fragment}:${String(count - 1)}: CK-94 runs the build \\$\\(CARGO\\) rustc without \\$\\(CARGOFLAGS\\) right after its subcommand \\(GN-1d\\)`));
  assert.match(found, new RegExp(`${fragment}:${String(count)}: CK-94 runs binding generate, which runs cargo, without --cargo "\\$\\(CARGO\\)" \\(GN-1d\\)`));
});

// B2.279: a job of the workflow assets.yml of a repository runs one recipe of its Makefile, ci-assets-<job>, which installs
// the tools of the repository, runs make release-recipes and then the build recipe release-assets-<job> of this file. The
// build recipe holds the order and the conditions of the job: an install that it needs comes first and stops it when it
// fails, and each build runs to its end; its status is that of every build.
test('B2.279: the recipes run no sudo and install nothing into the machine; the LLVM of the PHP extension is provisioned before the recipe (GN-19d, GN-19i)', () => {
  const text = releaseRecipes(fixtureContract()).text;
  assert.doesNotMatch(text, /\bsudo\b/, 'a recipe runs sudo');
  assert.doesNotMatch(text, /\bbrew install\b|\bapt-get\b/, 'a recipe installs into the machine');
  assert.doesNotMatch(text, /^install-llvm:/m, 'the recipes define install-llvm, which installs LLVM into the machine');
});

test('B2.279: release-assets-platform runs the builds of the platform of the host, each to its end, and fails when one failed (GN-19i)', (t) => {
  const box = sandbox(t, 'x86_64-unknown-linux-gnu');
  assert.ok(releaseRecipes(fixtureContract()).targets.includes('release-assets-platform'));
  const run = box.make('release-assets-platform');
  assert.equal(run.status, 0, run.output);
  const calls = box.calls();
  callIndex(calls, 'cargo', 'rustc');
  callIndex(calls, 'maturin', 'build');
  callIndex(calls, 'napi', 'build');
  // A failed wheel stops neither the Go library nor the npm platform package, and the job fails.
  standIn(box.bin, 'maturin', 'process.exit(1);');
  writeFileSync(box.env['CALLS'] as string, '');
  const failed = box.make('release-assets-platform');
  assert.notEqual(failed.status, 0, 'release-assets-platform passes after a failed wheel');
  assert.match(failed.output, /release-assets-platform: failed: release-wheel/);
  const after = box.calls();
  callIndex(after, 'cargo', 'rustc');
  callIndex(after, 'napi', 'build');
});

test('B2.279: release-assets-php builds the extension for the PHP of PATH with the minor of the matrix entry (GN-19d, GN-19i)', (t) => {
  const box = sandbox(t, 'x86_64-unknown-linux-gnu');
  const usage = box.make('release-assets-php', `LLVM_ROOT=${box.llvm}`);
  assert.equal(usage.status, 2, usage.output);
  assert.match(usage.output, /release-assets-php needs EXPECTED_PHP_MINOR/);
  assert.equal(box.calls().filter((call) => call.tool === 'cargo').length, 0);
  const run = box.make('release-assets-php', 'EXPECTED_PHP_MINOR=8.4', `LLVM_ROOT=${box.llvm}`);
  assert.equal(run.status, 0, run.output);
  const build = box.calls().find((call) => call.tool === 'cargo' && call.args[0] === 'build');
  assert.equal(build?.env['PHP'], join(box.bin, 'php'));
  assert.ok(existsSync(join(box.root, 'var/release/assets/php-ext/php_polyspec_sample-v0.0.3_php8.4-x86_64-linux-glibc-nts.zip')));
});

test('B2.279: release-assets-npm installs the wasm-bindgen CLI first, stops when that fails, and packs the npm package (GN-19e, GN-19i)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  standIn(box.bin, 'mise', '');
  const run = box.make('release-assets-npm', `MISE=${join(box.bin, 'mise')}`);
  assert.equal(run.status, 0, run.output);
  const calls = box.calls();
  assert.ok(callIndex(calls, 'mise', 'install') < callIndex(calls, 'cargo', 'build'));
  assert.ok(existsSync(join(box.root, 'var/release/assets/npm/polyspec-sample-0.0.3.tgz')));
  standIn(box.bin, 'mise', 'process.exit(1);');
  writeFileSync(box.env['CALLS'] as string, '');
  const failed = box.make('release-assets-npm', `MISE=${join(box.bin, 'mise')}`);
  assert.notEqual(failed.status, 0);
  assert.equal(box.calls().filter((call) => call.tool === 'cargo').length, 0, 'release-assets-npm builds after a failed install');
});

// B2.457: the build recipe of each job runs the check of a release as its first step, so the run of CI and the run of a
// release are one recipe, and no Makefile and no workflow holds a condition that runs the check in a release alone.
test('B2.457: each release-assets-<job> runs release-binding-check first, with --cargo and --go, and builds nothing when it fails (GN-19g, GN-19i)', (t) => {
  const box = sandbox(t, 'x86_64-unknown-linux-gnu');
  standIn(box.bin, 'mise', '');
  const jobs: [string, string[]][] = [['release-assets-platform', []], ['release-assets-php', ['EXPECTED_PHP_MINOR=8.4', `LLVM_ROOT=${box.llvm}`]], ['release-assets-npm', [`MISE=${join(box.bin, 'mise')}`]]];
  for (const [job, args] of jobs) {
    writeFileSync(box.env['CALLS'] as string, '');
    const run = box.make(job, ...args, 'GO=/opt/go/bin/go');
    assert.equal(run.status, 0, run.output);
    const calls = box.calls();
    const check = callIndex(calls, 'binding', 'check', join(box.root, 'packages/rust/interface.json'), '--release');
    assert.equal(check, 0, `${job} starts ${calls[0]?.tool ?? ''} ${(calls[0]?.args ?? []).join(' ')} before the check`);
    assert.deepEqual(calls[check]?.args.slice(3), ['--cargo', join(box.bin, 'cargo'), '--go', '/opt/go/bin/go'], job);
  }
  // A failed check stops the job before a build, an install or a generation.
  standIn(box.bin, 'binding', `if (args[0] === 'check') { console.error('CK-70 the dependency line of polyspec-points names the branch main'); process.exit(1); }`);
  for (const [job, args] of jobs) {
    writeFileSync(box.env['CALLS'] as string, '');
    const run = box.make(job, ...args);
    assert.notEqual(run.status, 0, job);
    assert.match(run.output, /CK-70 the dependency line of polyspec-points names the branch main/, job);
    assert.deepEqual(box.calls().map((call) => `${call.tool} ${call.args[0] ?? ''}`), ['binding check'], job);
  }
  // The file holds no condition on an input of a release: the check is a line of each build recipe.
  const text = releaseRecipes(fixtureContract()).text;
  assert.doesNotMatch(text, /\$\(RELEASE\)|filter true/);
  for (const job of ASSET_JOBS) {
    const recipe = text.slice(text.indexOf(`\n${job}:`));
    assert.match(recipe.split('\n').find((line) => line.startsWith('\t')) ?? '', /^\t\$\(MAKE\) --no-print-directory release-binding-check$/, job);
  }
});

// B2.471: the check of a release reads the settings of the repository that the recipes of the release read, with the
// reader of the recipe, so a setting that is missing fails in CI and not in a recipe that runs after the tag.
const releaseCheck = (root: string): { status: number | null; stderr: string } => {
  const run = spawnSync(process.execPath, [cli, 'check', join(root, 'packages/rust/interface.json'), '--release', '--cargo', 'cargo'], { encoding: 'utf8' });
  return { status: run.status, stderr: run.stderr };
};
const toolchain = (root: string, value: unknown): void => writeFileSync(join(root, 'config/toolchain.json'), `${JSON.stringify(value, null, 2)}\n`);

test('B2.471: binding check --release refuses a repository with a PHP target whose config/toolchain.json names no phpExtension.minors (CK-102, GN-19a)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  assert.doesNotMatch(releaseCheck(box.root).stderr, /CK-102/);
  const finding = new RegExp(`${join(box.root, 'config/toolchain.json')}: CK-102 release-platform-assets: config/toolchain\\.json names no PHP minor of the extension in phpExtension\\.minors, a list such as \\["8\\.4", "8\\.5"\\] \\(GN-19a\\)\\n`);
  // The key is missing, the list is empty, a value is no <major>.<minor>, and the file is not there.
  for (const value of [{ llvm: { version: LLVM_MAJOR } }, { llvm: { version: LLVM_MAJOR }, phpExtension: { minors: [] } }, { llvm: { version: LLVM_MAJOR }, phpExtension: { minors: ['8.4', '8'] } }]) {
    toolchain(box.root, value);
    const refused = releaseCheck(box.root);
    assert.equal(refused.status, 1, JSON.stringify(value));
    assert.match(refused.stderr, finding, JSON.stringify(value));
    // The recipe that reads it after the tag stops on the same setting with the same sentence.
    const recipe = box.make('release-platform-assets', 'TAG=v0.0.3');
    assert.match(recipe.output, /release-platform-assets: config\/toolchain\.json names no PHP minor of the extension in phpExtension\.minors/, JSON.stringify(value));
  }
  rmSync(join(box.root, 'config/toolchain.json'));
  assert.match(releaseCheck(box.root).stderr, finding);
  // A check without --release reads no setting of a release.
  assert.doesNotMatch(String(spawnSync(process.execPath, [cli, 'check', join(box.root, 'packages/rust/interface.json'), '--cargo', 'cargo'], { encoding: 'utf8' }).stderr), /CK-102/);
});

test('B2.471: binding check --release refuses a repository with a PHP target whose config/toolchain.json pins no llvm.version as the recipes read it (CK-102, GN-19d)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  const finding = new RegExp(`${join(box.root, 'config/toolchain.json')}: CK-102 release-php-ext: config/toolchain\\.json pins no major release of LLVM \\(llvm\\.version\\), which the recipe reads from a line "version": "<major>" under a line "llvm": \\{ \\(GN-19d\\)\\n`);
  toolchain(box.root, { phpExtension: { minors: PHP_MINORS } });
  const refused = releaseCheck(box.root);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, finding);
  assert.match(box.make('release-php-ext', `PHP=${join(box.bin, 'php')}`).output, /release-php-ext: config\/toolchain\.json pins no major release of LLVM \(llvm\.version\)/);
  // The recipes read the major with sed from the lines of the file, so a file on one line pins none for them.
  writeFileSync(join(box.root, 'config/toolchain.json'), JSON.stringify({ llvm: { version: LLVM_MAJOR }, phpExtension: { minors: PHP_MINORS } }));
  assert.match(releaseCheck(box.root).stderr, finding);
  assert.match(box.make('release-php-ext', `PHP=${join(box.bin, 'php')}`).output, /pins no major release of LLVM/);
});

test('B2.471: binding check --release refuses a Go module whose module path names another directory than the one of the module (CK-102, GN-15)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu', (contract) => { (contract.packages['go'] as { module: string }).module = 'github.com/polyspec/sample/go'; });
  const refused = releaseCheck(box.root);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, new RegExp(`${join(box.root, 'packages/rust/interface.json')}: CK-102 release-go-module: github\\.com/polyspec/sample/go: the Go module is at packages/go of its repository, not at go, the directory of its module path \\(GN-15\\)\\n`));
  const other = sandbox(t, 'aarch64-unknown-linux-gnu', (contract) => { (contract.packages['go'] as { module: string }).module = 'example.org/sample/packages/go'; });
  assert.match(releaseCheck(other.root).stderr, /interface\.json: CK-102 release-go-module: example\.org\/sample\/packages\/go: the Go module is not github\.com\/<owner>\/<repository>\[\/<directory>\]/);
});

test('B2.473: binding check --release refuses a go.mod with a requirement that no file of the released form imports, before a tag (CK-102, GN-15g)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  const goMod = join(box.root, 'packages/go/go.mod');
  // The go.mod that scaffold writes has no finding: the generated files are judged as binding writes them, and the
  // work tree of the case holds none.
  assert.doesNotMatch(releaseCheck(box.root).stderr, /CK-102 release-go-module/);
  writeFileSync(goMod, `${readFileSync(goMod, 'utf8')}\nrequire (\n\ta.example/assert v1.0.0\n\ta.example/nothing v0.1.0\n\ta.example/old v0.2.0 // indirect\n)\n`);
  mkdirSync(join(box.root, 'packages/go/tests/probe'), { recursive: true });
  writeFileSync(join(box.root, 'packages/go/tests/cases_test.go'), 'package tests\n\nimport "a.example/assert"\n');
  writeFileSync(join(box.root, 'packages/go/tests/probe/main.go'), 'package main\n\nimport _ "a.example/assert/deep"\n\nfunc main() {}\n');
  const refused = releaseCheck(box.root);
  assert.equal(refused.status, 1);
  const lines = refused.stderr.split('\n').filter((line) => line.includes('CK-102 release-go-module'));
  assert.deepEqual(lines, [
    `${goMod}: CK-102 release-go-module: go.mod requires a.example/assert v1.0.0, and only files that the released form leaves out import it (tests/cases_test.go, tests/probe/main.go): a dependency of tests or programs alone lives in a Go module of its own, with its own go.mod, so that it does not enter the module graph of a consumer of the tag (GN-15g)`,
    `${goMod}: CK-102 release-go-module: go.mod requires a.example/nothing v0.1.0, and no Go file of the module imports it: remove the requirement, which would enter the module graph of every consumer of the tag (GN-15g)`,
    `${goMod}: CK-102 release-go-module: go.mod requires a.example/old v0.2.0 with \`// indirect\`, which is not judged: no file of the module imports the module of such a line`,
  ]);
  // A hand-written package of the module that imports it makes it a requirement of the released form.
  mkdirSync(join(box.root, 'packages/go/host'));
  writeFileSync(join(box.root, 'packages/go/host/host.go'), 'package host\n\nimport (\n\t_ "a.example/assert"\n\t_ "a.example/nothing/x"\n)\n');
  assert.deepEqual(releaseCheck(box.root).stderr.split('\n').filter((line) => line.includes('CK-102 release-go-module') && !line.includes('indirect')), []);
});

test('B2.471: a repository without the target is not asked for the setting of that target (CK-102)', (t) => {
  // No PHP target: no config/toolchain.json is read. No Go target: no module path is read.
  const box = sandbox(t, 'aarch64-unknown-linux-gnu', (contract) => { contract.targets = contract.targets.filter((target) => target !== 'php' && target !== 'go'); });
  rmSync(join(box.root, 'config/toolchain.json'));
  assert.doesNotMatch(releaseCheck(box.root).stderr, /CK-102/);
});

test('B2.471: release-binding-check requires every variable of the Makefile that a release recipe of the contract reads (GN-19h)', (t) => {
  const box = sandbox(t, 'aarch64-unknown-linux-gnu');
  for (const [variable, what] of [['NPM', 'the npm of the checkout'], ['NODE', 'the Node.js of the checkout'], ['CARGO', 'the cargo command of the repository']] as const) {
    writeFileSync(box.env['CALLS'] as string, '');
    const run = box.make('release-binding-check', `${variable}=`);
    assert.equal(run.status, 2, `${variable}: ${run.output}`);
    assert.match(run.output, new RegExp(`release-binding-check needs ${variable}: ${what}; define it before the include of packages/release\\.mk \\(GN-19h\\)`));
    assert.equal(box.calls().length, 0, variable);
  }
  // B2.491: no recipe reads UV, since release-wheel builds with the maturin of mise.toml.
  assert.doesNotMatch(releaseRecipes(fixtureContract()).text, /\$\(UV\)/);
  // A contract with the PHP target alone reads NODE in release-platform-assets, after the tag, and no NPM.
  const php = sandbox(t, 'aarch64-unknown-linux-gnu', (contract) => { contract.targets = ['php']; });
  assert.equal(php.make('release-binding-check', 'NODE=').status, 2);
  assert.equal(php.make('release-binding-check', 'NPM=').status, 0);
});

// B2.407: the generated entry loads <name>.<platform>.node beside itself when the platform package is not installed
// (GN-3c); the recipe of the file of recipes puts it there, so no consumer writes the build, the name or the copy.
test('B2.407: checkout-node-addon builds the addon of the checkout and puts <name>.<platform>.node beside the generated entry (GN-3c, GN-1d)', (t) => {
  // The platform that the entry computes for each platform of T-2, from the expression of the generated entry.
  const entry = generate({ contract: fixtureContract(), version: '0.0.3', coreLib: 'polyspec_sample', caseFiles: new Map([['contracts/cases.json', JSON.parse(readFileSync(join(fixture, 'contracts/cases.json'), 'utf8')) as unknown]]), targets: ['node'] }).get('packages/ts/generated/index.cjs');
  const expression = /^const platform = (.*);$/m.exec(String(entry))?.[1];
  assert.ok(expression !== undefined, 'the generated entry computes no platform');
  for (const platform of NODE_PLATFORMS) {
    const computed = (new Function('process', `return ${expression};`) as (p: { platform: string; arch: string }) => string)({ platform: platform.os, arch: platform.cpu });
    assert.equal(computed, platform.name, platform.triple);
    const box = sandbox(t, platform.triple);
    const run = box.make('checkout-node-addon', 'CARGOFLAGS=--offline');
    assert.equal(run.status, 0, run.output);
    const calls = box.calls();
    const build = callIndex(calls, 'cargo', 'build');
    assert.ok(callIndex(calls, 'binding', ...generation(box.root, 'node')) < build);
    assert.deepEqual(calls[build]?.args, ['build', '--offline', '--locked', '--all-features', '-p', 'polyspec-sample-node']);
    const main = (JSON.parse(readFileSync(join(box.root, 'packages/ts/package.json'), 'utf8')) as { main: string }).main;
    const beside = join(box.root, 'packages/ts', main, '..');
    assert.deepEqual(readdirSync(beside).sort(), ['index.cjs', `sample.${computed}.node`]);
    assert.equal(readFileSync(join(beside, `sample.${computed}.node`), 'utf8'), 'built');
  }
  // CK-94 takes the lines of the recipe: its build runs $(CARGO) with $(CARGOFLAGS) right after the subcommand (GN-1d).
  assert.deepEqual(cargoFindings(releaseRecipes(fixtureContract()).text), []);
  // A host that is no platform of T-2 is refused before cargo builds.
  const other = sandbox(t, 'x86_64-apple-darwin');
  const refused = other.make('checkout-node-addon');
  assert.equal(refused.status, 2, refused.output);
  assert.match(refused.output, /the host x86_64-apple-darwin is no platform of the release/);
  assert.equal(other.calls().filter((call) => call.tool === 'cargo' && call.args[0] === 'build').length, 0);
});
