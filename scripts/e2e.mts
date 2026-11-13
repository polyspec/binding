// The end-to-end check of the generator on one repository: generate its bindings, build them, install each package
// and run the generated tests (G-5) and, where tests/e2e/<library> holds them, the contract cases (V-1) on each
// language's standard runner, for every target of the contract (GN-14).
//
//   make e2e REPO=<checkout> WORK=<directory> [BINDING=<commit>] [DEPS="<checkout>..."]
//
// which runs node scripts/e2e.mts --binding <commit> --repo <checkout> --work <directory> [--dep <checkout>]... with the
// Node.js of the checkout and the environment of its mise. The run checks the commit BINDING of binding (HEAD by
// default), whose tree it writes into <work>/binding and runs from there (GN-14b). Every tool is the one that the
// checkout pins and `make install` installs into var/tools (AGENTS.md): before any step the check finds the tool of
// each target and fails, naming the target, the tool and `make install`, when one is missing. No switch leaves a
// target out or adds one: the run checks the targets of the contract, because a target that did not run is not
// verified while the run would look passed, and a target that the run adds hides that the contract lacks it.
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
// Each target generates, builds and tests on its own to its end (GN-14c), so a refusal or a failure of one target does
// not stop another. The run ends with each target, a lint and the tests apart, and the causes of each failed target: a
// lint reads the code and runs nothing, so only the tests verify a target, and a target without a test that ran fails.

import { execFileSync, spawnSync, type ExecFileSyncOptions } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
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
const options = ['--binding', '--repo', '--work', '--checkout'];
for (const key of args.keys()) {
  if (!options.includes(key)) throw new Error(`unknown option ${key}; the options are --binding, --repo, --work and --dep`);
}
const repoArg = args.get('--repo');
const workArg = args.get('--work');
if (repoArg === undefined || workArg === undefined) {
  process.stderr.write('usage: make e2e REPO=<checkout> WORK=<directory> [BINDING=<commit>] [DEPS="<checkout>..."]\n');
  process.exit(2);
}
const work = resolve(workArg);
// The directory of this script, with a trailing slash.
const here = new URL('..', import.meta.url).pathname;
const git = (dir: string, argv: string[]): string => execFileSync('git', ['-C', dir, ...argv], { encoding: 'utf8' }).trim();

// GN-14b: the run checks one commit of binding. Started by make e2e in the checkout, the script writes the tree of
// that commit (BINDING, HEAD by default) into <work>/binding with git archive, installs the packages of the generator
// from the lock of that tree and runs the script of that tree with --checkout, so the generator, binding_core, the
// case runners and the script itself are of the same commit, whatever the working tree holds.
if (args.get('--checkout') === undefined) {
  const checkout = resolve(here);
  const commit = git(checkout, ['rev-parse', '--verify', `${args.get('--binding') ?? 'HEAD'}^{commit}`]);
  const source = join(work, 'binding');
  process.stdout.write(`\n== binding: the tree of the commit ${commit}\n`);
  rmSync(source, { recursive: true, force: true });
  mkdirSync(source, { recursive: true });
  execFileSync('tar', ['-x', '-C', source], { input: execFileSync('git', ['-C', checkout, 'archive', '--format=tar', commit], { maxBuffer: 1 << 30 }) });
  const npm = join(checkout, 'var/tools/bin/npm');
  if (!existsSync(npm)) {
    process.stderr.write('the check installs the packages of the generator with the npm of mise.toml, which is not installed; run make install (AGENTS.md)\n');
    process.exit(1);
  }
  execFileSync(npm, ['ci', '--prefix', join(source, 'packages/ts'), '--no-audit', '--no-fund'], { stdio: 'inherit' });
  // A repository inside this checkout (tests/e2e/<library>) is read from the same commit.
  const inSource = (path: string): string => {
    const at = relative(checkout, resolve(path));
    return at.startsWith('..') || isAbsolute(at) ? resolve(path) : join(source, at);
  };
  const forwarded = [
    '--checkout', checkout, '--binding', commit, '--repo', inSource(repoArg), '--work', work,
    ...deps.flatMap((dep) => ['--dep', inSource(dep)]),
  ];
  const child = spawnSync(process.execPath, [join(source, 'scripts/e2e.mts'), ...forwarded], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}

// The checkout that started the run holds the tools (var/tools) and the Git history; binding is the tree of the commit.
const checkout = args.get('--checkout') ?? '';
const commit = args.get('--binding') ?? '';
const repo = repoArg;
const binding = here;
const cli = join(binding, 'packages/ts/src/cli.ts');
const target = join(work, 'target');

// GN-14b: a run is evidence of the commit only when nothing outside the commit could change it. The run reads from the
// checkout the Makefile, the script that started it and the tools that var/tools installed from the tool pins, so these
// files of the working tree must be those of the commit, without an uncommitted or untracked change; and no variable of
// the environment that changes a build or a runner may be given by hand. Otherwise the run is a diagnosis, and its
// record says why. Other files of the working tree do not reach the run, which reads the tree of the commit.
const READ_FROM_CHECKOUT = ['Makefile', 'scripts/e2e.mts', 'mise.toml', 'mise.lock', 'rust-toolchain.toml', '.php-version', 'config', 'package.json', 'package-lock.json', '.npmrc'];
const BY_HAND = /^(RUSTFLAGS|RUSTDOCFLAGS|RUSTC|RUSTC_WRAPPER|RUSTUP_TOOLCHAIN|CARGO_ENCODED_RUSTFLAGS|CARGO_BUILD_.*|CARGO_TARGET_.*|CARGO_PROFILE_.*|CGO_.*|GOFLAGS|PYTHONPATH|PYTHONHOME|NODE_OPTIONS|NODE_PATH|PHPRC|PHP_INI_SCAN_DIR)$/;
const diagnosis: string[] = [];
const changed = [
  ...git(checkout, ['diff', '--name-only', commit, '--', ...READ_FROM_CHECKOUT]).split('\n'),
  ...git(checkout, ['ls-files', '--others', '--exclude-standard', '--', ...READ_FROM_CHECKOUT]).split('\n'),
].filter((line) => line !== '');
if (changed.length > 0) diagnosis.push(`diagnosis (not a commit): the checkout holds ${changed.join(', ')} other than the commit has them`);
for (const [name, value] of Object.entries(process.env)) {
  if (BY_HAND.test(name)) diagnosis.push(`diagnosis: ${name}=${value ?? ''} is given by hand`);
}
process.stdout.write(diagnosis.length === 0 ? `this run is evidence of the commit ${commit} of binding\n` : `this run of the commit ${commit} is a diagnosis:\n${diagnosis.map((d) => `  ${d}\n`).join('')}`);

// GN-14a: every command of the run uses the Rust toolchain of rust-toolchain.toml of the checkout, which make install
// installed. rustup reads that file from the directory of a command, and a command that runs in a copy (maturin in
// packages/python) would otherwise use the toolchain of the copy or the default of the machine.
const channel = /^channel = "([^"]+)"$/m.exec(readFileSync(join(checkout, 'rust-toolchain.toml'), 'utf8'))?.[1];
if (channel === undefined) throw new Error(`${join(checkout, 'rust-toolchain.toml')} names no channel`);
process.env['RUSTUP_TOOLCHAIN'] = channel;

// The Git dependencies on polyspec repositories resolve to the checkouts beside this one: Git, which Cargo runs for the
// fetch, reads https://github.com/polyspec/<name> as <parent of the checkout>/<name> (url.<base>.insteadOf, set for
// these commands only), so the Git dependency on binding is the commits of the checkout, of which the run pins one.
const gitDependency = {
  CARGO_NET_GIT_FETCH_WITH_CLI: 'true',
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: `url.${resolve(checkout, '..')}/.insteadOf`,
  GIT_CONFIG_VALUE_0: 'https://github.com/polyspec/',
  // A URL that names <name>.git is the checkout itself for binding (the longest match wins).
  GIT_CONFIG_KEY_1: `url.${checkout}/.insteadOf`,
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

// Copies a checkout, makes the changes it lacks, checks and tests its core and conforms its cases; each target
// generates its own files afterwards (GN-14c).
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
  // Cargo asks GitHub for the head of a branch before it fetches (its fast path), which is the pushed commit, not the
  // one of this checkout, and a scaffolded manifest may need a feature of binding_core that only this checkout has.
  // So the lock names the commit of the run before Cargo first resolves: the entry of a tracked lock moves to it, and a
  // copy without a lock gets a lock of that entry alone, which Cargo completes.
  const head = commit;
  const lockPath = join(copy, 'Cargo.lock');
  const pinned = /(name = "polyspec-binding-core"\nversion = "[^"]*"\nsource = "git\+[^#"]*#)[0-9a-f]+"/;
  if (!existsSync(lockPath)) {
    const coreVersion = /^version = "([^"]*)"/m.exec(readFileSync(join(binding, 'packages/core/rust/Cargo.toml'), 'utf8'))?.[1] ?? '';
    writeFileSync(lockPath, `version = 4\n\n[[package]]\nname = "polyspec-binding-core"\nversion = "${coreVersion}"\nsource = "git+https://github.com/polyspec/binding.git?branch=v1%2Frust-core#${head}"\n`);
    process.stdout.write('change: a Cargo.lock that pins polyspec-binding-core at the commit of this binding (CK-20)\n');
  } else if (pinned.test(readFileSync(lockPath, 'utf8'))) {
    const before = readFileSync(lockPath, 'utf8');
    const after = before.replace(pinned, `$1${head}"`);
    if (after !== before) {
      writeFileSync(lockPath, after);
      process.stdout.write('change: Cargo.lock pins polyspec-binding-core at the commit of this binding (CK-20)\n');
    }
  }
  run('cargo', ['test', '--manifest-path', join(copy, 'Cargo.toml'), '-p', crate, '--quiet']);
  // The check follows the core's build, which pins binding_core in Cargo.lock (CK-20). A git dependency moves to the
  // commit of this binding, as the repository does when it takes this binding.
  const lockText = existsSync(join(copy, 'Cargo.lock')) ? readFileSync(join(copy, 'Cargo.lock'), 'utf8') : '';
  if (/name = "polyspec-binding-core"\nversion = "[^"]*"\nsource = "git\+/.test(lockText)) {
    // --precise: a lock that named another source of binding_core (a path, an older form) is resolved to this commit.
    run('cargo', ['update', '--manifest-path', join(copy, 'Cargo.toml'), '-p', 'polyspec-binding-core', '--precise', head, '--quiet']);
    if (readFileSync(join(copy, 'Cargo.lock'), 'utf8') !== lockText) process.stdout.write('change: Cargo.lock pins polyspec-binding-core at the commit of this binding (CK-20)\n');
  }
  run(process.execPath, [cli, 'check', join(copy, 'packages/rust/interface.json')]);

  step(`${library}: the cases in the convention of G-5 (each change printed; the core reads the committed form)`);
  const caseFiles = conformCases(contract, copy);

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
    // U-7: a case of an alias has no parameter of a member; its keys are already in snake_case.
    const found = row.member === undefined ? undefined : memberById.get(row.member);
    const parameters = found?.member.parameters ?? [];
    const params = new Map<string, Type>(parameters.map((p) => [p.name.join('_'), p.type]));
    const group = document[row.group];
    if (!Array.isArray(group)) continue;
    document[row.group] = group
      .map((kase) => Object.fromEntries(Object.entries(kase).map(([key, value]) => [snake(key), conform(params.get(snake(key)), value)])))
      .filter((kase) => {
        if (kase['raises'] === undefined) return true;
        // U-2: a case that has no key of a parameter with a default leaves it out.
        const lacks = parameters
          .filter((p) => (p.name.join('_') in kase ? !fits(p.type, kase[p.name.join('_')]) : p.default === undefined))
          .map((p) => p.name.join('_'));
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

// GN-5: the test features of the Python, Node and PHP binding crates of a contract: panic-test, fault-test when the
// contract names fault injection points (G-5), codec-test when an alias has in_raises (U-7).
const testFeatures = (contract: Contract): string =>
  ['panic-test', ...((contract.faults ?? []).length > 0 ? ['fault-test'] : []), ...(contract.units.some((unit) => (unit.in_raises ?? []).length > 0) ? ['codec-test'] : [])].join(',');

const extensionOf = (contract: Contract): string => `polyspec_${contract.library.replaceAll('-', '_')}`;

// The tools of the checkout (AGENTS.md), found before any step: a target whose tool is missing fails the run here, with
// the target, the tool and the file that pins it, so no target is left out (GN-14). A tool runs by its absolute path.
const targets = (JSON.parse(readFileSync(join(resolve(repo), 'packages/rust/interface.json'), 'utf8')) as Contract).targets;
const missing: string[] = [];
const need = (forTarget: string, tool: string, pinned: string, found: string | undefined): string => {
  if (found === undefined) missing.push(`the target ${forTarget} needs ${tool} (${pinned})`);
  return found ?? '';
};
const tools = join(checkout, 'var/tools');
const file = (path: string): string | undefined => (existsSync(path) ? path : undefined);
// mise answers the absolute path of a command of mise.toml that mise.lock pins and var/tools holds.
const miseWhich = (command: string): string | undefined => {
  if (existsSync(join(tools, 'bin/mise')) && process.env['MISE_GLOBAL_CONFIG_FILE'] === join(checkout, 'mise.toml')) {
    const found = spawnSync(join(tools, 'bin/mise'), ['which', command], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim() !== '') return found.stdout.trim();
  }
  return undefined;
};
if (!process.execPath.startsWith(`${tools}/`)) {
  missing.push(`the check runs on the Node.js of mise.toml, not ${process.execPath}: start it with make e2e`);
}
if (process.env['MISE_GLOBAL_CONFIG_FILE'] !== join(checkout, 'mise.toml')) {
  missing.push('the check reads the tools of mise.toml with the environment of the mise of the checkout: start it with make e2e');
}
const tsc = need('node', 'the TypeScript compiler', 'packages/ts/package-lock.json', file(join(binding, 'packages/ts/node_modules/.bin/tsc')));
const npmTool = targets.includes('node') || targets.includes('wasm') ? need('node', 'npm', 'mise.toml', file(join(tools, 'bin/npm'))) : '';
const pythonTool = targets.includes('python') ? need('python', 'python3', 'mise.toml', miseWhich('python3')) : '';
const maturin = targets.includes('python') ? need('python', 'maturin', 'mise.toml', miseWhich('maturin')) : '';
const phpTool = targets.includes('php') ? need('php', 'php', '.php-version', file(join(tools, 'bin/php'))) : '';
// The PHP entry of the PHPUnit of config/phpunit, which php runs with the extensions loaded (var/tools/bin/phpunit is a
// shell wrapper that php would print as text).
const phpunit = targets.includes('php') ? need('php', 'phpunit', 'config/phpunit', file(join(tools, 'phpunit/vendor/bin/phpunit'))) : '';
const goTool = targets.includes('go') ? need('go', 'go', 'mise.toml', miseWhich('go')) : '';
const gofmt = targets.includes('go') ? need('go', 'gofmt', 'mise.toml', miseWhich('gofmt')) : '';
// BD-10 (d): the symbols of the Go static library are read with llvm-nm of the toolchain (llvm-tools), not the nm of PATH.
const rustcPrint = (what: string): string => spawnSync('rustc', ['--print', what], { encoding: 'utf8' }).stdout.trim();
const llvmNm = targets.includes('go') ? need('go', 'llvm-nm of the component llvm-tools', 'rust-toolchain.toml', file(join(rustcPrint('sysroot'), 'lib/rustlib', rustcPrint('host-tuple'), 'bin/llvm-nm'))) : '';
const wasmBindgen = targets.includes('wasm') ? need('wasm', 'the wasm-bindgen CLI', 'mise.toml', miseWhich('wasm-bindgen')) : '';
if (targets.includes('wasm')) {
  const libdir = spawnSync('rustc', ['--print', 'target-libdir', '--target', 'wasm32-unknown-unknown'], { encoding: 'utf8' });
  const installed = libdir.status === 0 && existsSync(libdir.stdout.trim()) && readdirSync(libdir.stdout.trim()).some((name) => name.startsWith('libcore-'));
  need('wasm', 'the Rust target wasm32-unknown-unknown', 'rust-toolchain.toml', installed ? 'installed' : undefined);
}
// The PHP of the machine is wrapped as it is (kit), so its minor is compared with .php-version here.
if (phpTool !== '') {
  const want = readFileSync(join(checkout, '.php-version'), 'utf8').trim();
  const minor = spawnSync(phpTool, ['-r', 'echo PHP_MAJOR_VERSION, ".", PHP_MINOR_VERSION;'], { encoding: 'utf8' }).stdout.trim();
  if (minor !== want) missing.push(`the target php needs PHP ${want} (.php-version); var/tools/bin/php is PHP ${minor || 'that does not run'}`);
}
if (missing.length > 0) {
  process.stderr.write(`the tools of the targets ${targets.join(', ')} are not all installed; run make install (AGENTS.md):\n${missing.map((m) => `  ${m}\n`).join('')}`);
  process.exit(1);
}

// GN-14c: each target generates, builds and tests on its own, to its end: a step that fails is the cause of its target,
// whose later steps read what it gives and do not run, and the other targets go on. The steps of a repository that
// every target needs (the copy, the core, the contract check, the cases) fail every target. The run ends with each
// target, its lint, its tests with their counts and the causes of its failure, and fails when a target failed.
interface Outcome {
  lint: string[];
  tests: { what: string; passed: number; failed: number; skipped: number }[];
  causes: string[];
}
const results = new Map<Lang, Outcome>(targets.map((t) => [t, { lint: [], tests: [], causes: [] }]));
const outcome = (t: Lang): Outcome => results.get(t) ?? { lint: [], tests: [], causes: [] };
const failed = (t: Lang): boolean => outcome(t).causes.length > 0;
const firstLine = (error: unknown): string => (error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error));
// Runs one step of the targets ts, unless one of them failed already; a failure is the cause of each of them.
const stepOf = (ts: Lang[], name: string, body: () => void): boolean => {
  const live = ts.filter((t) => !failed(t));
  if (live.length === 0) return false;
  step(`${live.join(', ')}: ${name}`);
  try {
    body();
    return true;
  } catch (error) {
    for (const t of live) outcome(t).causes.push(`${name}: ${firstLine(error)}`);
    process.stdout.write(`failed (${live.join(', ')}): ${name}: ${firstLine(error)}\n`);
    return false;
  }
};
const lintOf = (t: Lang, what: string): void => {
  outcome(t).lint.push(what);
};
// A run of a test runner counts as a test only when it ran a test, none failed and none was skipped (GN-14a).
const counted = (t: Lang, what: string, passed: number, failedCount: number, skipped: number, skippedNames: string[] = []): void => {
  process.stdout.write(`${what}: ${passed} passed, ${failedCount} failed, ${skipped} skipped\n`);
  for (const name of skippedNames) process.stdout.write(`skipped (a failure, GN-14a): ${name}\n`);
  if (failedCount > 0) throw new Error(`${what}: ${failedCount} failed`);
  if (passed + skipped === 0) throw new Error(`${what} ran no test`);
  if (skipped > 0) throw new Error(`${what} skipped ${skipped}, which verify nothing${skippedNames.length > 0 ? `: ${skippedNames.join(', ')}` : ''}`);
  outcome(t).tests.push({ what, passed, failed: failedCount, skipped });
};

// GN-14b: the record of the run, var/report/e2e/<library>.json of the checkout (ignored), written when the run ends
// in any way: the commit of binding, whether the run is evidence or a diagnosis and why, the commits of the
// repositories, and the outcome of each target. It is published with one rename, so a reader never sees half of it.
const repositoryCommit = (path: string): string | null => (existsSync(join(resolve(path), '.git')) ? git(resolve(path), ['rev-parse', 'HEAD']) : null);
process.on('exit', (code) => {
  const library = (JSON.parse(readFileSync(join(resolve(repo), 'packages/rust/interface.json'), 'utf8')) as Contract).library;
  const dir = join(checkout, 'var/report/e2e');
  mkdirSync(dir, { recursive: true });
  const report = {
    binding: commit,
    evidence: diagnosis.length === 0,
    diagnosis,
    repository: { path: resolve(repo), commit: repositoryCommit(repo) },
    dependencies: deps.map((dep) => ({ path: resolve(dep), commit: repositoryCommit(dep) })),
    targets: Object.fromEntries([...results].map(([t, o]) => [t, { result: o.causes.length > 0 ? 'failed' : 'passed', ...o }])),
    result: code === 0 ? 'passed' : 'failed',
  };
  const path = join(dir, `${library}.json`);
  writeFileSync(`${path}.${process.pid}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(`${path}.${process.pid}.tmp`, path);
  process.stdout.write(`\nthe record of the run: ${path} (${report.evidence ? `evidence of ${commit}` : 'a diagnosis'}, ${report.result})\n`);
});

// The steps of a repository that every target needs; a failure fails every target with its cause.
const prepared = (checkout: string): Prepared | undefined => {
  let found: Prepared | undefined;
  stepOf(targets, `${checkout}: copy, the changes the repository needs, the core, the contract check and the cases`, () => {
    found = prepare(checkout);
  });
  return found;
};
const dependencies = deps.map((dep) => prepared(dep));
const main = prepared(repo);
const contract = main?.contract ?? (JSON.parse(readFileSync(join(resolve(repo), 'packages/rust/interface.json'), 'utf8')) as Contract);
const copy = main?.copy ?? join(work, contract.library);
const library = contract.library;
const crate = contract.core.crate;

// G-4, GN-1b: each target generates its own files of each repository, so a refusal names that target alone; the
// refusals are its cause, one line each.
const generateOf = (t: Lang, preparedCopy: Prepared | undefined): void => {
  if (preparedCopy === undefined) return;
  stepOf([t], `generate ${preparedCopy.contract.library} for ${t}`, () => {
    process.stdout.write(`$ ${process.execPath} ${cli} generate --root ${preparedCopy.copy} --target ${t}\n`);
    const generated = spawnSync(process.execPath, [cli, 'generate', '--root', preparedCopy.copy, '--target', t], { encoding: 'utf8' });
    process.stdout.write(generated.stdout);
    process.stdout.write(generated.stderr);
    if (generated.status !== 0) {
      const refusals = generated.stderr.split('\n').filter((line) => line.startsWith('  ')).map((line) => line.trim());
      throw new Error(refusals.length > 0 ? refusals.join('; ') : generated.stderr.split('\n')[0] ?? `status ${String(generated.status)}`);
    }
  });
};
for (const t of targets) for (const p of [...dependencies, main]) generateOf(t, p);

// The core is linted once, with the fault injection points of its feature fault-test when the contract has them.
stepOf(targets, 'lint the core', () => {
  run('cargo', ['clippy', '--manifest-path', join(copy, 'Cargo.toml'), '-p', crate, '--all-targets', ...((contract.faults ?? []).length > 0 ? ['--features', 'fault-test'] : []), '--', '-D', 'warnings']);
});
for (const t of targets) if (!failed(t)) lintOf(t, 'cargo clippy of the core');
const crateSuffix: Record<Lang, string> = { python: 'python', node: 'node', php: 'php-ext', go: 'go', wasm: 'wasm' };
const lintFeatures = (t: Lang): string => (t === 'go' ? 'panic-test,codec-test' : t === 'wasm' ? 'panic-test' : testFeatures(contract));
for (const t of targets) {
  if (stepOf([t], `lint the ${t} binding crate`, () => {
    run('cargo', ['clippy', '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-${crateSuffix[t]}`, '--all-targets', '--features', lintFeatures(t), '--', '-D', 'warnings']);
  })) lintOf(t, `cargo clippy of the ${t} binding crate with its test features`);
}

const [cases] = main?.caseFiles ?? [];
const e2e = join(binding, 'tests/e2e', library);
// The case runners of a library are its cases.test.mjs, test_cases.py and CasesTest.php (tests/e2e/sample is a
// repository, not runners).
const caseRunners = existsSync(join(e2e, 'cases.test.mjs')) && cases !== undefined;
if (!caseRunners) process.stdout.write(`note: tests/e2e/${library} holds no case runners; the generated tests run alone\n`);
const allCopies = [...dependencies, main].filter((p): p is Prepared => p !== undefined);

// unittest prints "Ran <n> tests" and "OK", "OK (skipped=<k>)" or "FAILED (...)" on stderr (the Python of mise.toml).
const unittest = (t: Lang, what: string, argv: string[], env: Record<string, string> = {}): void => {
  process.stdout.write(`$ ${argv.join(' ')}\n`);
  const [command = '', ...rest] = argv;
  const ran = spawnSync(command, rest, { cwd: work, encoding: 'utf8', env: { ...process.env, ...env } });
  process.stdout.write(ran.stdout);
  process.stdout.write(ran.stderr);
  const total = Number(/^Ran (\d+) tests? in /m.exec(ran.stderr)?.[1] ?? '0');
  const summary = /^(OK|FAILED)(?: \(([^)]*)\))?$/m.exec(ran.stderr);
  const field = (name: string): number => Number(new RegExp(`\\b${name}=(\\d+)`).exec(summary?.[2] ?? '')?.[1] ?? '0');
  const failures = field('failures') + field('errors') + field('unexpected successes') + (ran.status !== 0 && summary?.[1] !== 'FAILED' ? 1 : 0);
  const skipped = field('skipped') + field('expected failures');
  counted(t, what, total - failures - skipped, failures, skipped);
};
// node --test writes a JUnit log beside its spec output; a testcase with <skipped> or <failure> is counted so.
const nodeTest = (t: Lang, what: string, flags: string[], testFiles: string[], cwd: string, env: Record<string, string>): void => {
  const log = join(work, `junit-${t}.xml`);
  rmSync(log, { force: true });
  const argv = [...flags, '--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', `--test-reporter-destination=${log}`, ...testFiles];
  process.stdout.write(`$ ${process.execPath} ${argv.join(' ')}\n`);
  const ran = spawnSync(process.execPath, argv, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  const xml = existsSync(log) ? readFileSync(log, 'utf8') : '';
  const testcases = xml.split('<testcase ').slice(1);
  const skippedNames = testcases.filter((c) => /<skipped/.test(c.split('</testcase>')[0] ?? c)).map((c) => /name="([^"]*)"/.exec(c)?.[1] ?? '');
  const failures = testcases.filter((c) => /<failure/.test(c.split('</testcase>')[0] ?? c)).length + (ran.status !== 0 && testcases.length === 0 ? 1 : 0);
  counted(t, what, testcases.length - failures - skippedNames.length, failures, skippedNames.length, skippedNames);
};

if (targets.includes('python')) {
  const venv = join(work, 'venv');
  const wheels = join(work, 'wheels');
  stepOf(['python'], 'build the wheels and install them into a venv of the Python of mise.toml', () => {
    run(pythonTool, ['-m', 'venv', '--clear', venv]);
    rmSync(wheels, { recursive: true, force: true });
    for (const p of allCopies) {
      // The wheel is built for the Python of the venv, the one of mise.toml, and installed from the local directory alone.
      run(maturin, ['build', '--interpreter', join(venv, 'bin/python'), '--features', testFeatures(p.contract), '--out', wheels], { cwd: join(p.copy, 'packages/python') });
      const python = p.contract.packages['python'] as { package: string };
      const prefix = `${python.package.replaceAll('-', '_')}-`;
      const wheel = readdirSync(wheels).find((name) => name.startsWith(prefix) && name.endsWith('.whl'));
      if (wheel === undefined) throw new Error(`maturin wrote no wheel of ${python.package}`);
      run(join(venv, 'bin/pip'), ['install', '-q', '--no-index', '--force-reinstall', '--find-links', wheels, join(wheels, wheel)]);
    }
  });
  const generatedPython = join(copy, 'packages/python/generated/tests');
  stepOf(['python'], 'the generated tests on unittest', () => unittest('python', 'the generated tests on unittest', [join(venv, 'bin/python'), '-m', 'unittest', 'discover', '-s', generatedPython, '-t', generatedPython]));
  if (caseRunners) stepOf(['python'], 'the contract cases on unittest', () => unittest('python', 'the contract cases on unittest', [join(venv, 'bin/python'), '-m', 'unittest', 'discover', '-s', e2e, '-t', e2e, '-p', 'test_*.py'], { CASES: cases }));
}

const lib = (suffix: string): string => `${crate}-${suffix}`.replaceAll('-', '_');
// Cargo names a cdylib lib<name>.so on Linux and lib<name>.dylib on macOS.
const dylib = process.platform === 'darwin' ? 'dylib' : 'so';
if (targets.includes('wasm')) {
  stepOf(['wasm'], 'build the module and its glue with wasm-bindgen', () => {
    const wanted = /wasm-bindgen = "=([0-9.]+)"/.exec(readFileSync(join(copy, 'packages/ts/wasm/Cargo.toml'), 'utf8'))?.[1];
    const tool = execFileSync(wasmBindgen, ['--version'], { encoding: 'utf8' }).trim();
    if (tool !== `wasm-bindgen ${wanted ?? ''}`) throw new Error(`${tool} of mise.toml is not the release of the crate, ${wanted ?? 'unknown'}`);
    run('cargo', ['build', '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-wasm`, '--target', 'wasm32-unknown-unknown', '--features', 'panic-test']);
    const glue = `${library.replaceAll('-', '_')}_wasm`;
    run(wasmBindgen, ['--target', 'web', '--out-dir', join(copy, 'packages/ts/wasm/generated'), '--out-name', glue, join(target, `wasm32-unknown-unknown/debug/${lib('wasm')}.wasm`)]);
  });
}

// The npm package holds the addon of Node and the WASM module, so the WASM tests need the package that the Node steps
// pack and install; WASM fails with the cause of Node when they fail.
const nodeDir = join(work, 'node');
let installed = false;
if (targets.includes('node') || targets.includes('wasm')) {
  const owner: Lang[] = targets.includes('node') ? ['node'] : ['wasm'];
  installed = stepOf(owner, 'build the addon, pack and install the npm package', () => {
    run('cargo', ['build', '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-node`, '--features', testFeatures(contract)]);
    const npm = (contract.packages['node'] as { package: string }).package;
    rmSync(nodeDir, { recursive: true, force: true });
    mkdirSync(nodeDir, { recursive: true });
    // T-2: the addon is the npm package of this machine's platform, which the package names in optionalDependencies;
    // the run packs it as a release does and installs it from the tarball.
    const platform = `${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}`;
    const platformDir = join(work, 'node-platform');
    rmSync(platformDir, { recursive: true, force: true });
    mkdirSync(platformDir, { recursive: true });
    const addonName = `${npm.slice(npm.indexOf('/') + 1)}.${platform}.node`;
    copyFileSync(join(target, `debug/lib${lib('node')}.${dylib}`), join(platformDir, addonName));
    const version = (JSON.parse(readFileSync(join(copy, 'packages/ts/package.json'), 'utf8')) as { version: string }).version;
    writeFileSync(join(platformDir, 'package.json'), `${JSON.stringify({ name: `${npm}-${platform}`, version, os: [process.platform], cpu: [process.arch], main: addonName, files: [addonName] }, null, 2)}\n`);
    run(npmTool, ['pack', '--pack-destination', nodeDir], { cwd: platformDir });
    run(npmTool, ['pack', '--pack-destination', nodeDir], { cwd: join(copy, 'packages/ts') });
    writeFileSync(join(nodeDir, 'package.json'), '{ "private": true }\n');
    const tarballs = readdirSync(nodeDir).filter((name) => name.endsWith('.tgz')).map((name) => join(nodeDir, name));
    if (tarballs.length !== 2) throw new Error('npm pack wrote no package');
    // The other platforms' packages are optional and absent, as on a machine of this platform.
    run(npmTool, ['install', '--no-audit', '--no-fund', '--omit=optional', ...tarballs], { cwd: nodeDir });
  });
  if (!installed && targets.includes('wasm') && owner[0] === 'node' && !failed('wasm')) {
    outcome('wasm').causes.push(`the npm package that holds the module was not installed: ${outcome('node').causes.join('; ')}`);
  }
}
if (targets.includes('node') && installed) {
  stepOf(['node'], 'the generated tests and the cases on node --test', () => {
    copyFileSync(join(copy, 'packages/ts/generated/tests/generated.test.mjs'), join(nodeDir, 'generated.test.mjs'));
    if (caseRunners) copyFileSync(join(e2e, 'cases.test.mjs'), join(nodeDir, 'cases.test.mjs'));
    nodeTest('node', `the generated tests${caseRunners ? ' and the contract cases' : ''} on node --test`, [], ['generated.test.mjs', ...(caseRunners ? ['cases.test.mjs'] : [])], nodeDir, { CASES: cases ?? '' });
  });
}
if (targets.includes('wasm') && installed) {
  // P-5: the WASM binding passes the same tests and cases through the subpath ./wasm of the same package.
  stepOf(['wasm'], 'the generated tests and the cases through the subpath ./wasm', () => {
    copyFileSync(join(copy, 'packages/ts/wasm/generated/tests/generated.test.mjs'), join(nodeDir, 'generated.wasm.test.mjs'));
    const wasmCases = caseRunners && existsSync(join(e2e, 'cases.wasm.test.mjs'));
    if (wasmCases) copyFileSync(join(e2e, 'cases.wasm.test.mjs'), join(nodeDir, 'cases.wasm.test.mjs'));
    // --expose-gc: a case of GN-18a collects instances.
    nodeTest('wasm', `the generated tests${wasmCases ? ' and the contract cases' : ''} on node --test through ./wasm`, ['--expose-gc'], ['generated.wasm.test.mjs', ...(wasmCases ? ['cases.wasm.test.mjs'] : [])], nodeDir, { CASES: cases ?? '' });
  });
}

if (targets.includes('php')) {
  const extensions: string[] = [];
  stepOf(['php'], 'build the extensions', () => {
    for (const p of allCopies) {
      run('cargo', ['build', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', `${p.contract.core.crate}-php-ext`, '--features', testFeatures(p.contract)]);
      extensions.push('-d', `extension=${join(target, `debug/lib${extensionOf(p.contract)}.${dylib}`)}`);
    }
  });
  if (stepOf(['php'], 'php -l of the stub', () => run(phpTool, ['-l', join(copy, `packages/php-ext/generated/${extensionOf(contract)}.stub.php`)]))) lintOf('php', 'php -l of the stub');
  // A run of PHPUnit counts by its JUnit log: the tests it names, their failures, errors and skips.
  const phpunitRun = (name: string, path: string, env: Record<string, string> = {}): void => {
    const log = join(work, `phpunit-${name.replaceAll(' ', '-')}.xml`);
    rmSync(log, { force: true });
    process.stdout.write(`$ ${phpTool} ${[...extensions, phpunit, '--log-junit', log, path].join(' ')}\n`);
    const ran = spawnSync(phpTool, [...extensions, phpunit, '--log-junit', log, path], { stdio: 'inherit', env: { ...process.env, ...gitDependency, CARGO_TARGET_DIR: target, ...env } });
    const suite = /<testsuite [^>]*>/.exec(existsSync(log) ? readFileSync(log, 'utf8') : '')?.[0] ?? '';
    const attribute = (key: string): number => Number(new RegExp(`\\b${key}="(\\d+)"`).exec(suite)?.[1] ?? '0');
    const failures = attribute('failures') + attribute('errors') + (ran.status !== 0 && suite === '' ? 1 : 0);
    counted('php', `${name} on PHPUnit`, attribute('tests') - failures - attribute('skipped'), failures, attribute('skipped'));
  };
  stepOf(['php'], 'the generated tests on PHPUnit', () => phpunitRun('generated tests', join(copy, 'packages/php-ext/generated/tests')));
  if (caseRunners) stepOf(['php'], 'the contract cases on PHPUnit', () => phpunitRun('contract cases', join(e2e, 'CasesTest.php'), { CASES: cases ?? '' }));
}

if (targets.includes('go')) {
  const goModule = join(copy, 'packages/go');
  const goEnv = { CGO_LDFLAGS: `-L${join(target, 'debug')}`, GOTOOLCHAIN: 'local', GOFLAGS: '-tags=polyspec_panic_test,polyspec_codec_test', CASES: cases ?? '' };
  // GN-13b: panic-test and codec-test are for tests only; the library built without features has no test entry point.
  if (stepOf(['go'], 'llvm-nm: the static library without features holds no test entry point', () => {
    const release = join(work, 'target-release-check');
    run('cargo', ['build', '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-go`], { env: { CARGO_TARGET_DIR: release } });
    process.stdout.write('$ llvm-nm --defined-only (test entry points)\n');
    const symbols = execFileSync(llvmNm, ['--defined-only', join(release, `debug/lib${lib('go')}.a`)], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const leaked = symbols.split('\n').filter((line) => / [A-Z] _?polyspec_[a-z0-9_]*__(panic_test|echo_)/.test(line));
    if (leaked.length > 0) throw new Error(`the static library built without features holds test entry points: ${leaked.join(', ')}`);
    rmSync(release, { recursive: true, force: true });
  })) lintOf('go', 'llvm-nm: the static library without features holds no test entry point');
  stepOf(['go'], 'build the static library with the test features', () => {
    run('cargo', ['build', '--manifest-path', join(copy, 'Cargo.toml'), '-p', `${crate}-go`, '--features', 'panic-test,codec-test']);
    if (caseRunners && existsSync(join(e2e, 'cases_test.go'))) {
      mkdirSync(join(goModule, 'tests'), { recursive: true });
      copyFileSync(join(e2e, 'cases_test.go'), join(goModule, 'tests/cases_test.go'));
    }
  });
  if (stepOf(['go'], 'gofmt -l and go vet', () => {
    process.stdout.write('$ gofmt -l .\n');
    const unformatted = execFileSync(gofmt, ['-l', '.'], { cwd: goModule, encoding: 'utf8' });
    if (unformatted !== '') throw new Error(`gofmt would change: ${unformatted.trim().split('\n').join(', ')}`);
    run(goTool, ['vet', './...'], { cwd: goModule, env: goEnv });
  })) lintOf('go', 'gofmt -l and go vet');
  // GN-14a: go test -json gives an event for each test, so the run counts the tests that passed, failed and were
  // skipped.
  stepOf(['go'], 'the generated tests and the cases on go test', () => {
    process.stdout.write(`$ ${goTool} test -json -count=1 ./...\n`);
    const goTest = spawnSync(goTool, ['test', '-json', '-count=1', './...'], { cwd: goModule, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...gitDependency, CARGO_TARGET_DIR: target, ...goEnv } });
    const counts = { pass: [] as string[], fail: [] as string[], skip: [] as string[] };
    const packageFailures: string[] = [];
    for (const line of goTest.stdout.split('\n')) {
      if (!line.startsWith('{')) {
        if (line !== '') process.stdout.write(`${line}\n`);
        continue;
      }
      const event = JSON.parse(line) as { Action: string; Package?: string; Test?: string; Output?: string };
      if (event.Action === 'output' && event.Output !== undefined) process.stdout.write(event.Output);
      const name = `${event.Package ?? ''}.${event.Test ?? ''}`;
      if (event.Test !== undefined && (event.Action === 'pass' || event.Action === 'fail' || event.Action === 'skip')) counts[event.Action].push(name);
      if (event.Test === undefined && event.Action === 'fail') packageFailures.push(event.Package ?? '');
    }
    process.stdout.write(goTest.stderr);
    if (packageFailures.length > 0 && counts.fail.length === 0) throw new Error(`go test failed the packages ${packageFailures.join(', ')} (status ${String(goTest.status)})`);
    counted('go', `the generated tests${caseRunners && existsSync(join(e2e, 'cases_test.go')) ? ' and the contract cases' : ''} on go test`, counts.pass.length, counts.fail.length + (goTest.status !== 0 && counts.fail.length === 0 && packageFailures.length === 0 ? 1 : 0), counts.skip.length, counts.skip);
  });
}

if (targets.includes('node') && installed) {
  if (stepOf(['node'], 'tsc --strict of the declarations', () => run(tsc, ['--noEmit', '--strict', join(copy, 'packages/ts/generated/index.d.ts')]))) lintOf('node', 'tsc --strict of the declarations');
}
if (targets.includes('wasm') && installed) {
  if (stepOf(['wasm'], 'tsc --strict of the declarations', () => run(tsc, ['--noEmit', '--strict', join(copy, 'packages/ts/wasm/generated/index.d.ts')]))) lintOf('wasm', 'tsc --strict of the declarations');
}

step('each target (a lint reads the code; only a test verifies the target)');
for (const [t, o] of results) {
  if (o.causes.length === 0 && o.tests.length === 0) o.causes.push('no test ran (GN-14)');
  const tests = o.tests.map((x) => `${x.what}: ${x.passed} passed`).join('; ');
  process.stdout.write(`${t}: ${o.causes.length > 0 ? 'FAILED' : 'passed'}\n  lint: ${o.lint.join('; ') || 'none'}\n  test: ${tests || 'NONE'}\n${o.causes.map((c) => `  cause: ${c}\n`).join('')}`);
}
const failedTargets = [...results].filter(([, o]) => o.causes.length > 0).map(([t]) => t);
if (failedTargets.length > 0) {
  process.stdout.write(`\nthe target${failedTargets.length === 1 ? '' : 's'} ${failedTargets.join(', ')} failed, each with its causes above: the run fails (GN-14c)\n`);
  process.exit(1);
}
if (leftOut > 0) {
  process.stdout.write(`\nevery target passed, but ${leftOut} case${leftOut === 1 ? ' was' : 's were'} left out (each printed as a change above): the run fails (G-5)\n`);
  process.exit(1);
}
process.stdout.write('\nevery target passed\n');
