// The end-to-end check of the generator on one repository: generate its bindings, build them, install each package
// and run the generated tests (G-5) and, where tests/e2e/<library> holds them, the contract cases (V-1) on each
// language's standard runner.
//
//   node scripts/e2e.mts --repo <http-cookies checkout> --work <directory> --phpunit <phpunit> [--python <python3.14>]
//     [--add-targets go,wasm]
//
// --add-targets adds targets that the repository's contract does not have yet to the copy, with the package entry that
// P-1 names (the Go module github.com/polyspec/<repository>/packages/go; WASM in the npm package of Node, chosen by the
// browser condition of each entry, P-5), so a generator can be checked before a repository takes it; the run says so.
//
// The checkout is only read: its committed tree is copied into the work directory, and the copy gets the changes that
// the repository has not made yet (L-2: one workspace with the binding packages, which bindgen scaffold writes; F-2,
// E-3: the core depends on bindgen_core and its error implements Kinds). Each is printed, because the repository has to
// make it itself. A case file whose keys or record values do not follow the case convention of G-5 (keys are the
// parameter names in snake_case, a record is an object of its fields) is rewritten to it, also printed.
//
// BINDGEN_E2E_IGNORE_RUST_VERSION=1 lets cargo build crates whose rust-version is newer than the installed toolchain,
// for a machine that cannot install the pinned one; the run says so. BINDGEN_E2E_LOCAL_GO=1 writes the release of the
// installed Go into the go directive of the copy's go.mod, for a machine without the pinned Go; the run says so too.

import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Contract, Lang, Type, Unit } from '../packages/ts/src/contract.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i] ?? '', process.argv[i + 1] ?? '');
const repo = args.get('--repo');
const workArg = args.get('--work');
const phpunit = args.get('--phpunit');
const python = args.get('--python') ?? 'python3';
const addTargets = (args.get('--add-targets') ?? '').split(',').filter((t) => t !== '') as Lang[];
if (repo === undefined || workArg === undefined || phpunit === undefined) {
  process.stderr.write('usage: node scripts/e2e.mts --repo <checkout> --work <directory> --phpunit <phpunit>\n');
  process.exit(2);
}
const work = resolve(workArg);
const bindgen = new URL('..', import.meta.url).pathname;
const copy = join(work, 'repo');
const target = join(work, 'target');
const contract = JSON.parse(readFileSync(join(resolve(repo), 'packages/rust/interface.json'), 'utf8')) as Contract;
for (const added of addTargets) {
  if (!['go', 'wasm'].includes(added)) throw new Error(`--add-targets takes go and wasm, not ${added}`);
  if (!contract.targets.includes(added)) contract.targets.push(added);
}
const library = contract.library;
const crate = contract.core.crate;
const lib = (suffix: string): string => `${crate}-${suffix}`.replaceAll('-', '_');
const ignoreRustVersion = process.env['BINDGEN_E2E_IGNORE_RUST_VERSION'] === '1';
const cargoFlags = ignoreRustVersion ? ['--ignore-rust-version'] : [];
if (ignoreRustVersion) process.stdout.write('note: cargo ignores rust-version (BINDGEN_E2E_IGNORE_RUST_VERSION=1)\n');

// The Git dependency on bindgen resolves to the commits of this checkout: Git, which Cargo runs for the fetch, reads the
// URL of the dependency as this directory (url.<base>.insteadOf, set for these commands only).
const gitDependency = {
  CARGO_NET_GIT_FETCH_WITH_CLI: 'true',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: `url.${bindgen}.insteadOf`,
  GIT_CONFIG_VALUE_0: 'https://github.com/polyspec/bindgen.git',
};

function run(command: string, argv: string[], options: ExecFileSyncOptions = {}): void {
  process.stdout.write(`$ ${command} ${argv.join(' ')}\n`);
  execFileSync(command, argv, { stdio: 'inherit', ...options, env: { ...process.env, ...gitDependency, CARGO_TARGET_DIR: target, ...options.env } });
}

function step(name: string): void {
  process.stdout.write(`\n== ${name}\n`);
}

step('copy the committed tree');
rmSync(copy, { recursive: true, force: true });
mkdirSync(copy, { recursive: true });
execFileSync('sh', ['-c', `git -C '${resolve(repo)}' archive HEAD | tar -x -C '${copy}'`]);

if (addTargets.length > 0) {
  step('targets added for this run (the repository has not taken them)');
  const contractPath = join(copy, 'packages/rust/interface.json');
  const own = JSON.parse(readFileSync(contractPath, 'utf8')) as Contract;
  for (const added of addTargets) {
    if (own.targets.includes(added)) continue;
    own.targets.push(added);
    if (added === 'go') own.packages['go'] = { module: `github.com/polyspec/${library}/packages/go` };
    if (added === 'wasm') {
      const node = own.packages['node'] as { entries: Record<string, { conditions?: unknown }> };
      for (const entry of Object.values(node.entries)) entry.conditions = { node: 'napi', browser: 'wasm' };
    }
    process.stdout.write(`added: the target ${added} (P-1, P-5)\n`);
  }
  writeFileSync(contractPath, `${JSON.stringify(own, null, 2)}\n`);
}

step('changes the repository needs (each printed)');
const coreManifest = join(copy, 'packages/rust/Cargo.toml');
let manifest = readFileSync(coreManifest, 'utf8');
const members = `[${[
  'packages/rust',
  'packages/python',
  'packages/ts',
  'packages/php-ext',
  ...(contract.targets.includes('go') ? ['packages/go/internal/ffi'] : []),
].map((m) => JSON.stringify(m)).join(', ')}]`;
const rootManifest = join(copy, 'Cargo.toml');
const workspaceAt = manifest.indexOf('\n[workspace]');
if (existsSync(rootManifest)) {
  const root = readFileSync(rootManifest, 'utf8');
  if (!root.includes(`members = ${members}`)) {
    writeFileSync(rootManifest, root.replace(/^members = \[[^\]]*\]$/m, `members = ${members}`));
    process.stdout.write('change: the root workspace has the binding packages as members (L-2)\n');
  }
} else if (workspaceAt >= 0) {
  const lints = manifest.slice(workspaceAt).replace('[workspace]\n', '');
  manifest = `${manifest.slice(0, workspaceAt)}\n`;
  writeFileSync(join(copy, 'Cargo.toml'), `[workspace]
resolver = "2"
members = ${members}
${lints}`);
  copyFileSync(join(copy, 'packages/rust/Cargo.lock'), join(copy, 'Cargo.lock'));
  rmSync(join(copy, 'packages/rust/Cargo.lock'));
  process.stdout.write('change: one Cargo workspace at the root with the core and the binding packages (L-2)\n');
}
if (!manifest.includes('polyspec-bindgen-core')) {
  const dependency = 'polyspec-bindgen-core = { git = "https://github.com/polyspec/bindgen.git", branch = "v1/rust-core" }\n';
  manifest = manifest.includes('\n[dependencies]\n')
    ? manifest.replace('\n[dependencies]\n', `\n[dependencies]\n${dependency}`)
    : manifest.replace('\n[lib]', `\n[dependencies]\n${dependency}\n[lib]`);
  process.stdout.write('change: the core depends on bindgen_core, a Git dependency before the first release (L-2, F-2)\n');
}
writeFileSync(coreManifest, manifest);
const errorSource = join(copy, 'packages/rust/src/error.rs');
const error = readFileSync(errorSource, 'utf8');
if (!error.includes('bindgen_core::Kinds')) {
  writeFileSync(errorSource, `${error}
/// The kind interface of the bindings (bindgen design F-2, E-3).
impl bindgen_core::Kinds for Error {
    fn kind(&self) -> &'static str {
        Error::kind(self)
    }

    fn status(&self) -> Option<u16> {
        Error::status(self)
    }

    fn errno(&self) -> Option<i32> {
        None
    }
}
`);
  process.stdout.write('change: the core error implements bindgen_core::Kinds (F-2, E-3)\n');
}
run(process.execPath, [join(bindgen, 'packages/ts/src/cli.ts'), 'scaffold', '--root', copy]);
process.stdout.write('change: the tracked binding packages that bindgen scaffold writes (L-2)\n');

step('the core builds without the generator');
run('cargo', ['test', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', crate, '--quiet']);
// The check follows the core's build, which pins bindgen_core in Cargo.lock (CK-20).
run(process.execPath, [join(bindgen, 'packages/ts/src/cli.ts'), 'check', join(copy, 'packages/rust/interface.json')]);

step('the cases in the convention of G-5 (each change printed; the core reads the committed form)');
const units = new Map(contract.units.map((u) => [u.id, u]));
const snake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
// A case value in the convention: a record given as an array of its field values becomes the object of its fields.
const conform = (type: Type | undefined, value: unknown): unknown => {
  if (type === undefined || typeof type === 'string' || value === null) return value;
  if ('optional' in type) return conform(type.optional, value);
  if ('list' in type) return Array.isArray(value) ? value.map((item) => conform(type.list, item)) : value;
  const unit: Unit | undefined = 'unit' in type && type.library === undefined ? units.get(type.unit) : undefined;
  if (unit?.kind !== 'record') return value;
  const fields = unit.fields ?? [];
  const object: Record<string, unknown> = Array.isArray(value)
    ? Object.fromEntries(fields.map((f, i) => [f.name.join('_'), value[i]]))
    : Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [snake(k), v]));
  return Object.fromEntries(fields.map((f) => [f.name.join('_'), conform(f.type, object[f.name.join('_')])]));
};
const memberById = new Map(contract.units.flatMap((u) => (u.members ?? []).map((m) => [m.id, m] as const)));
const caseFiles = new Set<string>();
for (const row of contract.cases) {
  const file = join(copy, row.file);
  caseFiles.add(file);
  const document = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>[]>;
  const before = JSON.stringify(document);
  const params = new Map<string, Type>((memberById.get(row.member)?.parameters ?? []).map((p) => [p.name.join('_'), p.type]));
  document[row.group] = (document[row.group] ?? []).map((kase) =>
    Object.fromEntries(Object.entries(kase).map(([key, value]) => [snake(key), conform(params.get(snake(key)), value)])),
  );
  if (JSON.stringify(document) !== before) {
    writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    process.stdout.write(`change: the cases ${row.file}#${row.group} follow the case convention (G-5)\n`);
  }
}

step('generate');
run(process.execPath, [join(bindgen, 'packages/ts/src/cli.ts'), 'generate', '--root', copy]);

step('lint the generated crates');
run('cargo', ['clippy', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '--workspace', '--all-targets', '--features', 'panic-test', '--', '-D', 'warnings']);

const [cases] = [...caseFiles];
const e2e = join(bindgen, 'tests/e2e', library);
const caseRunners = existsSync(e2e) && cases !== undefined;
if (!caseRunners) process.stdout.write(`note: tests/e2e/${library} holds no case runners; the generated tests run alone\n`);

step('Python: build the wheel, install it, run the generated tests and the cases');
const venv = join(work, 'venv');
run(python, ['-m', 'venv', '--clear', venv]);
run(join(venv, 'bin/pip'), ['install', '-q', 'maturin==1.16.0']);
rmSync(join(work, 'wheels'), { recursive: true, force: true });
run(join(venv, 'bin/maturin'), ['build', '--features', 'panic-test', '--out', join(work, 'wheels'), ...cargoFlags], {
  cwd: join(copy, 'packages/python'),
});
const wheel = readdirSync(join(work, 'wheels')).find((name) => name.endsWith('.whl'));
if (wheel === undefined) throw new Error('maturin wrote no wheel');
run(join(venv, 'bin/pip'), ['install', '-q', '--force-reinstall', join(work, 'wheels', wheel)]);
const generatedPython = join(copy, 'packages/python/generated/tests');
run(join(venv, 'bin/python'), ['-m', 'unittest', 'discover', '-s', generatedPython, '-t', generatedPython], { cwd: work });
if (caseRunners) run(join(venv, 'bin/python'), ['-m', 'unittest', 'discover', '-s', e2e, '-t', e2e, '-p', 'test_*.py'], { cwd: work, env: { CASES: cases } });

step('Node: build the addon, pack and install the package, run the generated tests and the cases');
run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-node`, '--features', 'panic-test']);
const npm = (contract.packages['node'] as { package: string }).package;
const addonName = `${npm.slice(npm.indexOf('/') + 1)}.${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}.node`;
copyFileSync(join(target, `debug/lib${lib('node')}.so`), join(copy, 'packages/ts/generated', addonName));
const nodeDir = join(work, 'node');
rmSync(nodeDir, { recursive: true, force: true });
mkdirSync(nodeDir, { recursive: true });
run('npm', ['pack', '--pack-destination', nodeDir], { cwd: join(copy, 'packages/ts') });
writeFileSync(join(nodeDir, 'package.json'), '{ "private": true }\n');
const tarball = readdirSync(nodeDir).find((name) => name.endsWith('.tgz'));
if (tarball === undefined) throw new Error('npm pack wrote no package');
run('npm', ['install', '--no-audit', '--no-fund', join(nodeDir, tarball)], { cwd: nodeDir });
copyFileSync(join(copy, 'packages/ts/generated/tests/generated.test.mjs'), join(nodeDir, 'generated.test.mjs'));
if (caseRunners) copyFileSync(join(e2e, 'cases.test.mjs'), join(nodeDir, 'cases.test.mjs'));
run(process.execPath, ['--test', 'generated.test.mjs', ...(caseRunners ? ['cases.test.mjs'] : [])], { cwd: nodeDir, env: { CASES: cases ?? '' } });

step('PHP: build the extension, run the generated tests and the cases with it loaded');
run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-php-ext`, '--features', 'panic-test']);
const extensionName = `polyspec_${library.replaceAll('-', '_')}`;
const extension = join(target, `debug/lib${extensionName}.so`);
run('php', ['-l', join(copy, `packages/php-ext/generated/${extensionName}.stub.php`)]);
run('php', ['-d', `extension=${extension}`, phpunit, join(copy, 'packages/php-ext/generated/tests')]);
if (caseRunners) run('php', ['-d', `extension=${extension}`, phpunit, join(e2e, 'CasesTest.php')], { env: { CASES: cases } });

if (contract.targets.includes('go')) {
  step('Go: build the static library, run the generated tests and the cases with go test');
  run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-go`, '--features', 'panic-test']);
  const goModule = join(copy, 'packages/go');
  if (process.env['BINDGEN_E2E_LOCAL_GO'] === '1') {
    const local = /go(\d+\.\d+(\.\d+)?)/.exec(execFileSync('go', ['env', 'GOVERSION'], { encoding: 'utf8' }))?.[1];
    if (local === undefined) throw new Error('go env GOVERSION names no release');
    const mod = join(goModule, 'go.mod');
    writeFileSync(mod, readFileSync(mod, 'utf8').replace(/^go [0-9.]+$/m, `go ${local}`));
    process.stdout.write(`note: the copy's go.mod names the installed Go ${local} (BINDGEN_E2E_LOCAL_GO=1)\n`);
  }
  if (caseRunners && existsSync(join(e2e, 'cases_test.go'))) {
    mkdirSync(join(goModule, 'tests'), { recursive: true });
    copyFileSync(join(e2e, 'cases_test.go'), join(goModule, 'tests/cases_test.go'));
  }
  const goEnv = { CGO_LDFLAGS: `-L${join(target, 'debug')}`, GOTOOLCHAIN: 'local', GOFLAGS: '-tags=polyspec_panic_test', CASES: cases ?? '' };
  process.stdout.write('$ gofmt -l .\n');
  const unformatted = execFileSync('gofmt', ['-l', '.'], { cwd: goModule, encoding: 'utf8' });
  if (unformatted !== '') throw new Error(`gofmt would change:\n${unformatted}`);
  run('go', ['vet', './...'], { cwd: goModule, env: goEnv });
  run('go', ['test', '-count=1', './...'], { cwd: goModule, env: goEnv });
}

step('declarations');
run(join(bindgen, 'packages/ts/node_modules/.bin/tsc'), ['--noEmit', '--strict', join(copy, 'packages/ts/generated/index.d.ts')]);
process.stdout.write('\nall steps passed\n');
