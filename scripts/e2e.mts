// The end-to-end check of the generator on one repository: generate its bindings, build them, install each package
// and run the generated tests (G-5) and, where tests/e2e/<library> holds them, the contract cases (V-1) on each
// language's standard runner.
//
//   node scripts/e2e.mts --repo <checkout> --work <directory> --phpunit <phpunit> [--python <python3.14>]
//                        [--dep <checkout>]... [--add-targets go,wasm]
//
// --add-targets adds targets that the repository's contract does not have yet to the copy of --repo, with the package
// entry that P-1 names (the Go module github.com/polyspec/<repository>/packages/go; WASM in the npm package of Node,
// chosen by the browser condition of each entry, P-5) and the WASM classes of E-2, so a generator can be checked before
// a repository takes it; the run says so.
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
// still lacks the arguments of its member is left out; both are printed, and a run that left a case out fails at its
// end, after every step ran.
//
// BINDING_E2E_IGNORE_RUST_VERSION=1 lets cargo build crates whose rust-version is newer than the installed toolchain,
// for a machine that cannot install the pinned one; the run says so. BINDING_E2E_LOCAL_GO=1 writes the release of the
// installed Go into the go directive of the copy's go.mod, for a machine without the pinned Go; the run says so too.
// A run with the target wasm needs the Rust target wasm32-unknown-unknown and the wasm-bindgen CLI of the crate's
// release; BINDING_E2E_SKIP_WASM=1 runs the rest without building it (the WASM crate is still linted on the host) and
// says that the WASM tests did not run.

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
const addTargets = (args.get('--add-targets') ?? '').split(',').filter((t) => t !== '') as Lang[];
for (const added of addTargets) {
  if (!['go', 'wasm'].includes(added)) throw new Error(`--add-targets takes go and wasm, not ${added}`);
}
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
function prepare(checkout: string, added: Lang[] = []): Prepared {
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

  if (added.some((t) => !contract.targets.includes(t))) {
    step(`${library}: targets added for this run (the repository has not taken them)`);
    for (const lang of added) {
      if (contract.targets.includes(lang)) continue;
      contract.targets.push(lang);
      if (lang === 'go') contract.packages['go'] = { module: `github.com/polyspec/${library}/packages/go` };
      if (lang === 'wasm') {
        const node = contract.packages['node'] as { entries: Record<string, { conditions?: unknown }> };
        for (const entry of Object.values(node.entries)) entry.conditions = { node: 'napi', browser: 'wasm' };
        // E-2: the WASM class of a category is the Node one (the same capitals, N-2).
        for (const row of Object.values(contract.errors.classes)) {
          if (row !== undefined && row.node !== undefined) row.wasm = row.node;
        }
      }
      process.stdout.write(`added: the target ${lang} (P-1, P-5)\n`);
    }
    writeFileSync(join(copy, 'packages/rust/interface.json'), `${JSON.stringify(contract, null, 2)}\n`);
  }

  step(`${library}: changes the repository needs (each printed)`);
  const coreManifest = join(copy, 'packages/rust/Cargo.toml');
  let manifest = readFileSync(coreManifest, 'utf8');
  const members = `[${[
    'packages/rust',
    'packages/python',
    'packages/ts',
    'packages/php-ext',
    ...(contract.targets.includes('go') ? ['packages/go/internal/ffi'] : []),
    ...(contract.targets.includes('wasm') ? ['packages/ts/wasm'] : []),
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
  // The check follows the core's build, which pins binding_core in Cargo.lock (CK-20). A git dependency moves to the
  // commit of this binding, as the repository does when it takes this binding.
  const lockText = existsSync(join(copy, 'Cargo.lock')) ? readFileSync(join(copy, 'Cargo.lock'), 'utf8') : '';
  if (/name = "polyspec-binding-core"\nversion = "[^"]*"\nsource = "git\+/.test(lockText)) {
    // --precise: Cargo asks GitHub for the head of a branch before it fetches (its fast path), which is the pushed
    // commit, not the one of this checkout.
    const head = execFileSync('git', ['-C', binding, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    run('cargo', ['update', '--manifest-path', join(copy, 'Cargo.toml'), '-p', 'polyspec-binding-core', '--precise', head, '--quiet']);
    if (readFileSync(join(copy, 'Cargo.lock'), 'utf8') !== lockText) process.stdout.write('change: Cargo.lock pins polyspec-binding-core at the commit of this binding (CK-20)\n');
  }
  run(process.execPath, [cli, 'check', join(copy, 'packages/rust/interface.json')]);

  step(`${library}: the cases in the convention of G-5 (each change printed; the core reads the committed form)`);
  const caseFiles = conformCases(contract, copy);

  step(`${library}: generate`);
  run(process.execPath, [cli, 'generate', '--root', copy]);
  return { contract, copy, caseFiles };
}

// The cases that were left out because they do not follow G-5; a run that left one out fails at its end, because a
// case that does not run is a test that was dropped without a word.
let leftOut = 0;

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
    // G-5: bytes and a source are {"hex": ...}, a float that JSON cannot write is {"float": ...}.
    if (typeof type === 'string') return typeof value !== 'object' || ['bytes', 'source', 'float'].includes(type);
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
        leftOut += 1;
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

const dependencies = deps.map((dep) => prepare(dep));
const main = prepare(repo, addTargets);
const { contract, copy } = main;
const library = contract.library;
const crate = contract.core.crate;

step('lint the generated crates');
run('cargo', ['clippy', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '--workspace', '--all-targets', '--features', 'panic-test', '--', '-D', 'warnings']);

const [cases] = main.caseFiles;
const e2e = join(binding, 'tests/e2e', library);
// The case runners of a library are its cases.test.mjs, test_cases.py and CasesTest.php (tests/e2e/sample is a
// repository, not runners).
const caseRunners = existsSync(join(e2e, 'cases.test.mjs')) && cases !== undefined;
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

const lib = (suffix: string): string => `${crate}-${suffix}`.replaceAll('-', '_');
let wasmBuilt = false;
if (contract.targets.includes('wasm')) {
  step('WASM: build the module and its glue with wasm-bindgen');
  const libdir = execFileSync('rustc', ['--print', 'target-libdir', '--target', 'wasm32-unknown-unknown'], { encoding: 'utf8' }).trim();
  const installed = existsSync(libdir) && readdirSync(libdir).some((name) => name.startsWith('libcore-'));
  if (!installed || process.env['BINDING_E2E_SKIP_WASM'] === '1') {
    if (process.env['BINDING_E2E_SKIP_WASM'] !== '1') throw new Error(`the Rust target wasm32-unknown-unknown is not installed (${libdir}); BINDING_E2E_SKIP_WASM=1 runs without it`);
    process.stdout.write('note: the WASM module is not built and its tests and cases do NOT run (BINDING_E2E_SKIP_WASM=1)\n');
  } else {
    const wanted = /wasm-bindgen = "=([0-9.]+)"/.exec(readFileSync(join(copy, 'packages/ts/wasm/Cargo.toml'), 'utf8'))?.[1];
    const tool = execFileSync('wasm-bindgen', ['--version'], { encoding: 'utf8' }).trim();
    if (tool !== `wasm-bindgen ${wanted ?? ''}`) throw new Error(`${tool} is not the release of the crate, ${wanted ?? 'unknown'}`);
    run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-wasm`, '--target', 'wasm32-unknown-unknown', '--features', 'panic-test']);
    const glue = `${library.replaceAll('-', '_')}_wasm`;
    run('wasm-bindgen', ['--target', 'web', '--out-dir', join(copy, 'packages/ts/wasm/generated'), '--out-name', glue, join(target, `wasm32-unknown-unknown/debug/${lib('wasm')}.wasm`)]);
    wasmBuilt = true;
  }
}

step('Node: build the addon, pack and install the package, run the generated tests and the cases');
run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-node`, '--features', 'panic-test']);
const npm = (contract.packages['node'] as { package: string }).package;
const nodeDir = join(work, 'node');
rmSync(nodeDir, { recursive: true, force: true });
mkdirSync(nodeDir, { recursive: true });
// T-2: the addon is the npm package of this machine's platform, which the package names in optionalDependencies; the
// run packs it as a release does and installs it from the tarball.
const platform = `${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}`;
const platformDir = join(work, 'node-platform');
rmSync(platformDir, { recursive: true, force: true });
mkdirSync(platformDir, { recursive: true });
const addonName = `${npm.slice(npm.indexOf('/') + 1)}.${platform}.node`;
copyFileSync(join(target, `debug/lib${`${crate}-node`.replaceAll('-', '_')}.so`), join(platformDir, addonName));
const version = (JSON.parse(readFileSync(join(copy, 'packages/ts/package.json'), 'utf8')) as { version: string }).version;
writeFileSync(join(platformDir, 'package.json'), `${JSON.stringify({ name: `${npm}-${platform}`, version, os: [process.platform], cpu: [process.arch], main: addonName, files: [addonName] }, null, 2)}\n`);
run('npm', ['pack', '--pack-destination', nodeDir], { cwd: platformDir });
run('npm', ['pack', '--pack-destination', nodeDir], { cwd: join(copy, 'packages/ts') });
writeFileSync(join(nodeDir, 'package.json'), '{ "private": true }\n');
const tarballs = readdirSync(nodeDir).filter((name) => name.endsWith('.tgz')).map((name) => join(nodeDir, name));
if (tarballs.length !== 2) throw new Error('npm pack wrote no package');
// The other platforms' packages are optional and absent, as on a machine of this platform.
run('npm', ['install', '--no-audit', '--no-fund', '--omit=optional', ...tarballs], { cwd: nodeDir });
copyFileSync(join(copy, 'packages/ts/generated/tests/generated.test.mjs'), join(nodeDir, 'generated.test.mjs'));
if (caseRunners) copyFileSync(join(e2e, 'cases.test.mjs'), join(nodeDir, 'cases.test.mjs'));
run(process.execPath, ['--test', 'generated.test.mjs', ...(caseRunners ? ['cases.test.mjs'] : [])], { cwd: nodeDir, env: { CASES: cases ?? '' } });
if (wasmBuilt) {
  // P-5: the WASM binding passes the same tests and cases through the subpath ./wasm of the same package.
  copyFileSync(join(copy, 'packages/ts/wasm/generated/tests/generated.test.mjs'), join(nodeDir, 'generated.wasm.test.mjs'));
  const wasmCases = caseRunners && existsSync(join(e2e, 'cases.wasm.test.mjs'));
  if (wasmCases) copyFileSync(join(e2e, 'cases.wasm.test.mjs'), join(nodeDir, 'cases.wasm.test.mjs'));
  run(process.execPath, ['--test', 'generated.wasm.test.mjs', ...(wasmCases ? ['cases.wasm.test.mjs'] : [])], { cwd: nodeDir, env: { CASES: cases ?? '' } });
}

step('PHP: build the extensions, run the generated tests and the cases with them loaded');
const extensions: string[] = [];
for (const prepared of [...dependencies, main]) {
  run('cargo', ['build', ...cargoFlags, '--manifest-path', join(prepared.copy, 'Cargo.toml'), '-p', `${prepared.contract.core.crate}-php-ext`, '--features', 'panic-test']);
  extensions.push('-d', `extension=${join(target, `debug/lib${extensionOf(prepared.contract)}.so`)}`);
}
run('php', ['-l', join(copy, `packages/php-ext/generated/${extensionOf(contract)}.stub.php`)]);
run('php', [...extensions, phpunit, join(copy, 'packages/php-ext/generated/tests')]);
if (caseRunners) run('php', [...extensions, phpunit, join(e2e, 'CasesTest.php')], { env: { CASES: cases } });

if (contract.targets.includes('go')) {
  step('Go: build the static library, run the generated tests and the cases with go test');
  run('cargo', ['clippy', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-go`, '--features', 'panic-test,codec-test', '--', '-D', 'warnings']);
  // GN-13b: panic-test and codec-test are for tests only; the library built without features has no test entry point.
  const release = join(work, 'target-release-check');
  run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-go`], { env: { CARGO_TARGET_DIR: release } });
  process.stdout.write('$ nm --defined-only (test entry points)\n');
  const symbols = execFileSync('nm', ['--defined-only', join(release, `debug/lib${lib('go')}.a`)], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const leaked = symbols.split('\n').filter((line) => / [A-Z] polyspec_[a-z0-9_]*__(panic_test|echo_)/.test(line));
  if (leaked.length > 0) throw new Error(`the static library built without features holds test entry points:\n${leaked.join('\n')}`);
  rmSync(release, { recursive: true, force: true });
  run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-go`, '--features', 'panic-test,codec-test']);
  const goModule = join(copy, 'packages/go');
  if (process.env['BINDING_E2E_LOCAL_GO'] === '1') {
    const local = /go(\d+\.\d+(\.\d+)?)/.exec(execFileSync('go', ['env', 'GOVERSION'], { encoding: 'utf8' }))?.[1];
    if (local === undefined) throw new Error('go env GOVERSION names no release');
    const mod = join(goModule, 'go.mod');
    writeFileSync(mod, readFileSync(mod, 'utf8').replace(/^go [0-9.]+$/m, `go ${local}`));
    process.stdout.write(`note: the copy's go.mod names the installed Go ${local} (BINDING_E2E_LOCAL_GO=1)\n`);
  }
  if (caseRunners && existsSync(join(e2e, 'cases_test.go'))) {
    mkdirSync(join(goModule, 'tests'), { recursive: true });
    copyFileSync(join(e2e, 'cases_test.go'), join(goModule, 'tests/cases_test.go'));
  }
  const goEnv = { CGO_LDFLAGS: `-L${join(target, 'debug')}`, GOTOOLCHAIN: 'local', GOFLAGS: '-tags=polyspec_panic_test,polyspec_codec_test', CASES: cases ?? '' };
  process.stdout.write('$ gofmt -l .\n');
  const unformatted = execFileSync('gofmt', ['-l', '.'], { cwd: goModule, encoding: 'utf8' });
  if (unformatted !== '') throw new Error(`gofmt would change:\n${unformatted}`);
  run('go', ['vet', './...'], { cwd: goModule, env: goEnv });
  run('go', ['test', '-count=1', './...'], { cwd: goModule, env: goEnv });
}

step('declarations');
run(join(binding, 'packages/ts/node_modules/.bin/tsc'), ['--noEmit', '--strict', join(copy, 'packages/ts/generated/index.d.ts')]);
if (contract.targets.includes('wasm')) {
  run(join(binding, 'packages/ts/node_modules/.bin/tsc'), ['--noEmit', '--strict', join(copy, 'packages/ts/wasm/generated/index.d.ts')]);
}
if (leftOut > 0) {
  process.stdout.write(`\nall steps passed, but ${leftOut} case${leftOut === 1 ? ' was' : 's were'} left out (each printed as a change above): the run fails (G-5)\n`);
  process.exit(1);
}
process.stdout.write('\nall steps passed\n');
