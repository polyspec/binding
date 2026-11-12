// The end-to-end check of the generator on one repository: generate its bindings, build them, install each package
// and run the generated tests (G-5) and, where tests/e2e/<library> holds them, the contract cases (V-1) on each
// language's standard runner.
//
//   node scripts/e2e.mts --repo <checkout> --work <directory> --phpunit <phpunit> [--python <python3.14>]
//                        [--dep <checkout>]...
//
// A repository whose contract names the types of another repository (T-3) needs that repository's packages: each
// --dep checkout goes through the same steps first (without its tests), its Python wheel is installed beside and its
// PHP extension loaded before. Each checkout is copied to <work>/<library>, so the relative paths between them hold.
//
// A checkout is only read: its committed tree is copied into the work directory, and the copy gets the changes that
// the repository has not made yet (L-2: one workspace with the binding packages, which binding scaffold writes; F-2,
// E-3: the core depends on binding_core and its error implements Kinds). Each is printed, because the repository has to
// make it itself. A case file whose keys or record values do not follow the case convention of G-5 (keys are the
// parameter names in snake_case, a record is an object of its fields) is rewritten to it, and a raising case that
// still lacks the arguments of its member is left out; both are printed.
//
// BINDING_E2E_IGNORE_RUST_VERSION=1 lets cargo build crates whose rust-version is newer than the installed toolchain,
// for a machine that cannot install the pinned one; the run says so.

import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { libraryParts } from '../packages/ts/src/check.ts';
import { CATEGORIES, type Contract, type Lang, type Type, type Unit } from '../packages/ts/src/contract.ts';
import { convert, libraryName } from '../packages/ts/src/names.ts';

const args = new Map<string, string>();
const deps: string[] = [];
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i] ?? '';
  const value = process.argv[i + 1] ?? '';
  if (key === '--dep') deps.push(value);
  else args.set(key, value);
}
const repo = args.get('--repo');
const workArg = args.get('--work');
const phpunit = args.get('--phpunit');
const python = args.get('--python') ?? 'python3';
if (repo === undefined || workArg === undefined || phpunit === undefined) {
  process.stderr.write('usage: node scripts/e2e.mts --repo <checkout> --work <directory> --phpunit <phpunit> [--dep <checkout>]...\n');
  process.exit(2);
}
const work = resolve(workArg);
const binding = new URL('..', import.meta.url).pathname;
const cli = join(binding, 'packages/ts/src/cli.ts');
const target = join(work, 'target');
const ignoreRustVersion = process.env['BINDING_E2E_IGNORE_RUST_VERSION'] === '1';
const cargoFlags = ignoreRustVersion ? ['--ignore-rust-version'] : [];
if (ignoreRustVersion) process.stdout.write('note: cargo ignores rust-version (BINDING_E2E_IGNORE_RUST_VERSION=1)\n');

// The Git dependencies on polyspec repositories resolve to the checkouts beside this one: Git, which Cargo runs for the
// fetch, reads https://github.com/polyspec/<name> as <parent of this checkout>/<name> (url.<base>.insteadOf, set for
// these commands only), so the Git dependency on binding is the commits of this checkout.
const gitDependency = {
  CARGO_NET_GIT_FETCH_WITH_CLI: 'true',
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: `url.${resolve(binding, '..')}/.insteadOf`,
  GIT_CONFIG_VALUE_0: 'https://github.com/polyspec/',
  // A URL that names <name>.git is this checkout itself for binding (the longest match wins).
  GIT_CONFIG_KEY_1: `url.${binding}.insteadOf`,
  GIT_CONFIG_VALUE_1: 'https://github.com/polyspec/binding.git',
};

function run(command: string, argv: string[], options: ExecFileSyncOptions = {}): void {
  process.stdout.write(`$ ${command} ${argv.join(' ')}\n`);
  execFileSync(command, argv, { stdio: 'inherit', ...options, env: { ...process.env, ...gitDependency, CARGO_TARGET_DIR: target, ...options.env } });
}

function step(name: string): void {
  process.stdout.write(`\n== ${name}\n`);
}

interface Prepared {
  contract: Contract;
  copy: string;
  caseFiles: string[];
}

// Copies a checkout, makes the changes it lacks, checks and tests its core, conforms its cases and generates.
function prepare(checkout: string): Prepared {
  const contract = JSON.parse(readFileSync(join(resolve(checkout), 'packages/rust/interface.json'), 'utf8')) as Contract;
  const library = contract.library;
  const crate = contract.core.crate;
  const copy = join(work, library);

  step(`${library}: copy the committed tree`);
  rmSync(copy, { recursive: true, force: true });
  mkdirSync(copy, { recursive: true });
  // A checkout of its own is copied as committed; a directory inside this repository (tests/e2e/sample) as it is.
  if (existsSync(join(resolve(checkout), '.git'))) execFileSync('sh', ['-c', `git -C '${resolve(checkout)}' archive HEAD | tar -x -C '${copy}'`]);
  else execFileSync('cp', ['-r', `${resolve(checkout)}/.`, copy]);

  step(`${library}: changes the repository needs (each printed)`);
  const coreManifest = join(copy, 'packages/rust/Cargo.toml');
  let manifest = readFileSync(coreManifest, 'utf8');
  const members = '["packages/rust", "packages/python", "packages/ts", "packages/php-ext"]';
  const rootManifest = join(copy, 'Cargo.toml');
  const workspaceAt = manifest.indexOf('\n[workspace]');
  if (existsSync(rootManifest)) {
    const root = readFileSync(rootManifest, 'utf8');
    if (!root.includes('"packages/php-ext"')) {
      writeFileSync(rootManifest, root.replace(/^members = \[[^\]]*\]$/m, `members = ${members}`));
      process.stdout.write('change: the root workspace has the binding packages as members (L-2)\n');
    }
  } else if (workspaceAt >= 0) {
    const lints = manifest.slice(workspaceAt).replace('[workspace]\n', '');
    manifest = `${manifest.slice(0, workspaceAt)}\n`;
    writeFileSync(rootManifest, `[workspace]\nresolver = "2"\nmembers = ${members}\n${lints}`);
    copyFileSync(join(copy, 'packages/rust/Cargo.lock'), join(copy, 'Cargo.lock'));
    rmSync(join(copy, 'packages/rust/Cargo.lock'));
    process.stdout.write('change: one Cargo workspace at the root with the core and the binding packages (L-2)\n');
  }
  // The crate of this repository is polyspec-binding-core with the library binding_core (formerly bindgen).
  const manifests = [coreManifest, ...(existsSync(rootManifest) ? [rootManifest] : [])];
  const sourceFiles = readdirSync(join(copy, 'packages'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.rs') && !f.includes('generated') && !f.includes('target'))
    .map((f) => join(copy, 'packages', f));
  let renamedCore = false;
  for (const file of [...manifests, ...sourceFiles]) {
    const text = file === coreManifest ? manifest : readFileSync(file, 'utf8');
    const next = text
      .replace(/^polyspec-bindgen-core = .*$/m, 'polyspec-binding-core = { git = "https://github.com/polyspec/binding.git", branch = "v1/rust-core" }')
      .replaceAll('bindgen_core', 'binding_core');
    if (next === text) continue;
    renamedCore = true;
    if (file === coreManifest) manifest = next;
    else writeFileSync(file, next);
  }
  if (renamedCore) process.stdout.write('change: the core depends on polyspec-binding-core (binding_core), the renamed crate of binding\n');
  if (!manifest.includes('polyspec-binding-core')) {
    const dependency = 'polyspec-binding-core = { git = "https://github.com/polyspec/binding.git", branch = "v1/rust-core" }\n';
    manifest = manifest.includes('\n[dependencies]\n')
      ? manifest.replace('\n[dependencies]\n', `\n[dependencies]\n${dependency}`)
      : manifest.replace('\n[lib]', `\n[dependencies]\n${dependency}\n[lib]`);
    process.stdout.write('change: the core depends on binding_core, a Git dependency before the first release (L-2, F-2)\n');
  }
  writeFileSync(coreManifest, manifest);
  const sources = readdirSync(join(copy, 'packages/rust/src'), { recursive: true }).map(String).filter((f) => f.endsWith('.rs'));
  if (!sources.some((f) => readFileSync(join(copy, 'packages/rust/src', f), 'utf8').includes('Kinds for'))) {
    const errorSource = join(copy, 'packages/rust/src/error.rs');
    writeFileSync(errorSource, `${readFileSync(errorSource, 'utf8')}
/// The kind interface of the bindings (binding design F-2, E-3).
impl binding_core::Kinds for Error {
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
    process.stdout.write('change: the core error implements binding_core::Kinds (F-2, E-3)\n');
  }
  // E-2: the class of a category is <Library><Category>Error in the class form of each language (N-2).
  const contractPath = join(copy, 'packages/rust/interface.json');
  const written = JSON.parse(readFileSync(contractPath, 'utf8')) as Contract;
  let renamed = false;
  for (const category of CATEGORIES) {
    const row = written.errors.classes[category] ?? {};
    for (const [lang, name] of Object.entries(row) as [Lang, string][]) {
      const want = `${convert(libraryName(libraryParts(written).repository), lang === 'wasm' ? 'node' : lang, 'class')}${convert([category], 'go', 'class')}Error`;
      const prefix = name.slice(0, name.lastIndexOf('\\') + 1);
      if (name !== `${prefix}${want}`) {
        row[lang] = `${prefix}${want}`;
        renamed = true;
      }
    }
  }
  if (renamed) {
    writeFileSync(contractPath, `${JSON.stringify(written, null, 2)}\n`);
    process.stdout.write('change: the error classes are <Library><Category>Error in the class form of each language (E-2, N-2)\n');
  }
  run(process.execPath, [cli, 'scaffold', '--root', copy]);
  process.stdout.write('change: the tracked binding packages that binding scaffold writes (L-2)\n');

  step(`${library}: the core builds without the generator`);
  run('cargo', ['test', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', crate, '--quiet']);
  // The check follows the core's build, which pins binding_core in Cargo.lock (CK-20).
  run(process.execPath, [cli, 'check', join(copy, 'packages/rust/interface.json')]);

  step(`${library}: the cases in the convention of G-5 (each change printed; the core reads the committed form)`);
  const caseFiles = conformCases(contract, copy);

  step(`${library}: generate`);
  run(process.execPath, [cli, 'generate', '--root', copy]);
  return { contract, copy, caseFiles };
}

function conformCases(contract: Contract, copy: string): string[] {
  const units = new Map(contract.units.map((u) => [u.id, u]));
  const snake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  // A case value in the convention: a record given as an array of its field values becomes the object of its fields.
  const conform = (type: Type | undefined, value: unknown): unknown => {
    if (type === undefined || typeof type === 'string' || value === null) return value;
    if ('optional' in type) return conform(type.optional, value);
    if ('list' in type) return Array.isArray(value) ? value.map((item) => conform(type.list, item)) : value;
    const unit: Unit | undefined = 'unit' in type && type.library === undefined ? units.get(type.unit) : undefined;
    if (unit?.kind !== 'record' || typeof value !== 'object') return value;
    const fields = unit.fields ?? [];
    const object: Record<string, unknown> = Array.isArray(value)
      ? Object.fromEntries(fields.map((f, i) => [f.name.join('_'), value[i]]))
      : Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [snake(k), v]));
    return Object.fromEntries(fields.map((f) => [f.name.join('_'), conform(f.type, object[f.name.join('_')])]));
  };
  // Whether a value has the shape of its type, as far as the generated tests write it.
  const fits = (type: Type, value: unknown): boolean => {
    if (value === null) return true;
    if (typeof type === 'string') return typeof value !== 'object';
    if ('optional' in type) return fits(type.optional, value);
    if ('list' in type) return Array.isArray(value) && value.every((item) => fits(type.list, item));
    const unit = 'unit' in type && type.library === undefined ? units.get(type.unit) : undefined;
    if (unit?.kind === 'record') return typeof value === 'object' && !Array.isArray(value);
    return true;
  };
  const memberById = new Map(contract.units.flatMap((u) => (u.members ?? []).map((m) => [m.id, { unit: u, member: m }] as const)));
  // T-5: the parameters of the factories of a class, one of which a case of a method gives.
  const factories = (unit: Unit): string[][] =>
    (unit.members ?? [])
      .filter((m) => m.kind === 'constructor' || (m.kind === 'static' && JSON.stringify(m.returns) === JSON.stringify({ unit: unit.id })))
      .map((m) => (m.parameters ?? []).map((p) => p.name.join('_')));
  const files = new Set<string>();
  for (const row of contract.cases) {
    const file = join(copy, row.file);
    files.add(file);
    const document = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>[]>;
    const before = JSON.stringify(document);
    const found = memberById.get(row.member);
    const parameters = found?.member.parameters ?? [];
    const params = new Map<string, Type>(parameters.map((p) => [p.name.join('_'), p.type]));
    const group = document[row.group];
    if (!Array.isArray(group)) continue;
    document[row.group] = group
      .map((kase) => Object.fromEntries(Object.entries(kase).map(([key, value]) => [snake(key), conform(params.get(snake(key)), value)])))
      .filter((kase) => {
        if (kase['raises'] === undefined) return true;
        const lacks = parameters.filter((p) => !(p.name.join('_') in kase) || !fits(p.type, kase[p.name.join('_')])).map((p) => p.name.join('_'));
        const receiver = typeof found?.member.core === 'object' && found.member.core.receiver !== undefined;
        const noFactory = receiver && found !== undefined && !factories(found.unit).some((names) => names.every((n) => n in kase));
        if (lacks.length === 0 && !noFactory) return true;
        process.stdout.write(`change: the case ${row.file}#${row.group}/${String(kase['id'])} of ${row.member} gives ${lacks.length > 0 ? `no ${lacks.join(', ')} in the form of its type` : 'no arguments of a factory'} (G-5); left out here\n`);
        return false;
      });
    if (JSON.stringify(document) !== before) {
      writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
      process.stdout.write(`change: the cases ${row.file}#${row.group} follow the case convention (G-5)\n`);
    }
  }
  return [...files];
}

const extensionOf = (contract: Contract): string => `polyspec_${contract.library.replaceAll('-', '_')}`;

const dependencies = deps.map(prepare);
const main = prepare(repo);
const { contract, copy } = main;
const library = contract.library;
const crate = contract.core.crate;

step('lint the generated crates');
run('cargo', ['clippy', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '--workspace', '--all-targets', '--features', 'panic-test', '--', '-D', 'warnings']);

const [cases] = main.caseFiles;
const e2e = join(binding, 'tests/e2e', library);
const caseRunners = existsSync(e2e) && cases !== undefined;
if (!caseRunners) process.stdout.write(`note: tests/e2e/${library} holds no case runners; the generated tests run alone\n`);

step('Python: build the wheels, install them, run the generated tests and the cases');
const venv = join(work, 'venv');
run(python, ['-m', 'venv', '--clear', venv]);
run(join(venv, 'bin/pip'), ['install', '-q', 'maturin==1.16.0']);
for (const prepared of [...dependencies, main]) {
  const wheels = join(work, 'wheels');
  run(join(venv, 'bin/maturin'), ['build', '--features', 'panic-test', '--out', wheels, ...cargoFlags], { cwd: join(prepared.copy, 'packages/python') });
  const python = prepared.contract.packages['python'] as { package: string };
  const prefix = `${python.package.replaceAll('-', '_')}-`;
  const wheel = readdirSync(wheels).find((name) => name.startsWith(prefix) && name.endsWith('.whl'));
  if (wheel === undefined) throw new Error(`maturin wrote no wheel of ${python.package}`);
  run(join(venv, 'bin/pip'), ['install', '-q', '--no-index', '--force-reinstall', '--find-links', wheels, join(wheels, wheel)]);
}
const generatedPython = join(copy, 'packages/python/generated/tests');
run(join(venv, 'bin/python'), ['-m', 'unittest', 'discover', '-s', generatedPython, '-t', generatedPython], { cwd: work });
if (caseRunners) run(join(venv, 'bin/python'), ['-m', 'unittest', 'discover', '-s', e2e, '-t', e2e, '-p', 'test_*.py'], { cwd: work, env: { CASES: cases } });

step('Node: build the addon, pack and install the package, run the generated tests and the cases');
run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-node`, '--features', 'panic-test']);
const npm = (contract.packages['node'] as { package: string }).package;
const addonName = `${npm.slice(npm.indexOf('/') + 1)}.${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}.node`;
copyFileSync(join(target, `debug/lib${`${crate}-node`.replaceAll('-', '_')}.so`), join(copy, 'packages/ts/generated', addonName));
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

step('PHP: build the extensions, run the generated tests and the cases with them loaded');
const extensions: string[] = [];
for (const prepared of [...dependencies, main]) {
  run('cargo', ['build', ...cargoFlags, '--manifest-path', join(prepared.copy, 'Cargo.toml'), '-p', `${prepared.contract.core.crate}-php-ext`, '--features', 'panic-test']);
  extensions.push('-d', `extension=${join(target, `debug/lib${extensionOf(prepared.contract)}.so`)}`);
}
run('php', ['-l', join(copy, `packages/php-ext/generated/${extensionOf(contract)}.stub.php`)]);
run('php', [...extensions, phpunit, join(copy, 'packages/php-ext/generated/tests')]);
if (caseRunners) run('php', [...extensions, phpunit, join(e2e, 'CasesTest.php')], { env: { CASES: cases } });

step('declarations');
run(join(binding, 'packages/ts/node_modules/.bin/tsc'), ['--noEmit', '--strict', join(copy, 'packages/ts/generated/index.d.ts')]);
process.stdout.write('\nall steps passed\n');
