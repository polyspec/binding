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
// A checkout is only read: its committed tree is copied into the work directory. The copy gets only the changes that
// take the binding of the run, as the repository does when it takes that binding (GN-14d): the tracked packages of
// binding scaffold and the commit of binding_core in Cargo.lock. A defect of the repository is a named failure and is
// not repaired in the copy: a workspace without the binding crates (GN-4), a case file whose keys or record values do
// not follow the case convention of G-5, a core that does not implement Kinds or names the crate of binding by
// another name (the compiler names it), an error class of another name (CK-10). Every case runs: a case that a target
// cannot write is a refusal of that target (GN-14c), never a case left out.
//
// Each target generates, builds and tests on its own to its end (GN-14c), so a refusal or a failure of one target does
// not stop another. The run ends with each target, a lint and the tests apart, and the causes of each failed target: a
// lint reads the code and runs nothing, so only the tests verify a target, and a target without a test that ran fails.

import { execFileSync, spawnSync, type ExecFileSyncOptions } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Contract, Lang, Type, Unit } from '../packages/ts/src/contract.ts';
import { READ_FROM_CHECKOUT } from './e2e-inputs.mts';
import { goPackageFailure, readGoTestEvents } from './go-test-events.mts';

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

// The script of the checkout reads no source of the generator (READ_FROM_CHECKOUT, GN-14b): the script of the tree of
// the commit loads them here.
const { libraryParts } = await import('../packages/ts/src/check.ts');
const { CATEGORIES } = await import('../packages/ts/src/contract.ts');
const { convert, libraryName } = await import('../packages/ts/src/names.ts');
const { componentBase, isHost, place } = await import('../packages/ts/src/generate/packages.ts');

// The checkout that started the run holds the tools (var/tools) and the Git history; binding is the tree of the commit.
const checkout = args.get('--checkout') ?? '';
const commit = args.get('--binding') ?? '';
const repo = repoArg;
const binding = here;
const cli = join(binding, 'packages/ts/src/cli.ts');
const target = join(work, 'target');

// GN-14b: a run is evidence of the commit only when nothing outside the commit could change it. The run reads from the
// checkout the files of READ_FROM_CHECKOUT (scripts/e2e-inputs.mts, a closed list), so these files of the working tree
// must be those of the commit, without a committed, uncommitted or untracked change; and no variable of the environment
// that changes a build or a runner may be given by hand. Otherwise the run is a diagnosis, and its record says why.
// Other files of the working tree do not reach the run, which reads the tree of the commit.
const readFromCheckout = READ_FROM_CHECKOUT.map((input) => input.path);
const BY_HAND = /^(RUSTFLAGS|RUSTDOCFLAGS|RUSTC|RUSTC_WRAPPER|RUSTUP_TOOLCHAIN|CARGO_ENCODED_RUSTFLAGS|CARGO_BUILD_.*|CARGO_TARGET_.*|CARGO_PROFILE_.*|CGO_.*|GOFLAGS|PYTHONPATH|PYTHONHOME|NODE_OPTIONS|NODE_PATH|PHPRC|PHP_INI_SCAN_DIR)$/;
const diagnosis: string[] = [];
const changed = [
  ...git(checkout, ['diff', '--name-only', commit, '--', ...readFromCheckout]).split('\n'),
  ...git(checkout, ['ls-files', '--others', '--exclude-standard', '--', ...readFromCheckout]).split('\n'),
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

// Runs a command; its stderr is printed after it, and a failure carries the lines of its stderr that start with
// error (the errors of rustc and Cargo), so the cause of a target names a defect that the compiler finds, such as a
// core that does not implement Kinds (GN-14d).
function run(command: string, argv: string[], options: ExecFileSyncOptions = {}): void {
  process.stdout.write(`$ ${command} ${argv.join(' ')}\n`);
  const ran = spawnSync(command, argv, { ...options, stdio: ['inherit', 'inherit', 'pipe'], encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...gitDependency, CARGO_TARGET_DIR: target, ...options.env } });
  process.stdout.write(ran.stderr);
  if (ran.error !== undefined) throw ran.error;
  if (ran.status === 0) return;
  const errors = ran.stderr.split('\n').filter((line) => /^error(\[|:)/.test(line)).map((line) => line.trim());
  throw new Error(`${command} ${argv[0] ?? ''} (status ${String(ran.status)})${errors.length > 0 ? `: ${errors.join('; ')}` : ''}`);
}

// Runs a command of the binding CLI of the commit; its stderr is printed, and a failure carries the lines that name its
// findings or refusals, with the paths of the copy made relative, so the cause of a target states them (GN-14c).
function runBinding(argv: string[], copyDir: string): void {
  process.stdout.write(`$ ${process.execPath} ${cli} ${argv.join(' ')}\n`);
  const ran = spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8', env: { ...process.env, ...gitDependency, CARGO_TARGET_DIR: target } });
  process.stdout.write(ran.stdout);
  process.stdout.write(ran.stderr);
  if (ran.status === 0) return;
  const lines = ran.stderr.split('\n').map((line) => line.trim().replaceAll(`${copyDir}/`, '')).filter((line) => line !== '' && !line.startsWith('usage:'));
  throw new Error(`binding ${argv[0] ?? ''} (status ${String(ran.status)}): ${lines.join('; ')}`);
}

function step(name: string): void {
  process.stdout.write(`\n== ${name}\n`);
}

// The suffix of the package of the binding crate of each target: <core crate>-<suffix>.
const crateSuffix: Record<Lang, string> = { python: 'python', node: 'node', php: 'php-ext', go: 'go', wasm: 'wasm' };

interface Prepared {
  contract: Contract;
  // The contract, relative to the copy: packages/rust/interface.json or packages/<component>/rust/interface.json.
  path: string;
  copy: string;
  caseFiles: string[];
}

// L-1, GN-14: the contracts of a repository, each beside its core: packages/rust/interface.json and
// packages/<component>/rust/interface.json, in the order of their paths. A repository without one is a named failure.
function contractsOf(root: string): string[] {
  const found = existsSync(join(root, 'packages/rust/interface.json')) ? ['packages/rust/interface.json'] : [];
  const packages = existsSync(join(root, 'packages')) ? readdirSync(join(root, 'packages')).sort() : [];
  for (const name of packages) if (existsSync(join(root, 'packages', name, 'rust/interface.json'))) found.push(`packages/${name}/rust/interface.json`);
  if (found.length === 0) throw new Error(`${root} has no contract, packages/rust/interface.json or packages/<component>/rust/interface.json (L-1)`);
  return found;
}
const readContract = (root: string, path: string): Contract => JSON.parse(readFileSync(join(root, path), 'utf8')) as Contract;
// A file of the binding of a contract in its layout (L-1, L-2a): the writers name packages/<dir>/..., place maps it.
const at = (p: Prepared, path: string): string => join(p.copy, place(p.contract, path));
// The directory of a language package, whose manifest a host package holds itself (L-2a).
const packageDir = (p: Prepared, dir: 'python' | 'ts'): string => join(p.copy, componentBase(p.contract), dir);

// Copies a checkout, makes the changes it lacks, checks and tests the core of each contract and conforms its cases;
// each target generates its own files afterwards (GN-14c).
function prepare(checkout: string): Prepared[] {
  const paths = contractsOf(resolve(checkout));
  const contracts = paths.map((path) => readContract(resolve(checkout), path));
  const library = contracts[0]?.library ?? '';
  const copy = join(work, library);

  step(`${library}: copy the committed tree`);
  rmSync(copy, { recursive: true, force: true });
  mkdirSync(copy, { recursive: true });
  // A checkout of its own is copied as committed; a directory inside this repository (tests/e2e/sample) as it is.
  if (existsSync(join(resolve(checkout), '.git'))) execFileSync('sh', ['-c', `git -C '${resolve(checkout)}' archive HEAD | tar -x -C '${copy}'`]);
  else execFileSync('cp', ['-r', `${resolve(checkout)}/.`, copy]);

  step(`${library}: the changes that take the binding of the run (GN-14d, each printed)`);
  for (const path of paths) runBinding(['scaffold', '--contract', join(copy, path)], copy);
  process.stdout.write('change: the tracked binding packages that binding scaffold of the run writes (L-2, GN-14d)\n');
  // GN-4: every binding crate of the targets is a member of the root workspace of the repository; a workspace that
  // lacks one is a defect of the repository, which the run names and does not repair.
  const rootManifest = join(copy, 'Cargo.toml');
  if (!existsSync(rootManifest)) throw new Error('the repository has no root Cargo.toml, whose workspace holds the core and the binding crates (GN-4, L-2)');
  const metadata = spawnSync('cargo', ['metadata', '--no-deps', '--format-version', '1', '--manifest-path', rootManifest], { encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...gitDependency, CARGO_TARGET_DIR: target } });
  if (metadata.status !== 0) throw new Error(`cargo metadata of the root workspace failed: ${metadata.stderr.split('\n').filter((line) => line.startsWith('error')).join('; ')}`);
  const workspace = JSON.parse(metadata.stdout) as { workspace_members: string[]; packages: { id: string; name: string }[] };
  const memberNames = new Set(workspace.packages.filter((p) => workspace.workspace_members.includes(p.id)).map((p) => p.name));
  const absent = contracts.flatMap((c) => c.targets.map((t) => `${c.core.crate}-${crateSuffix[t]}`)).filter((name) => !memberNames.has(name));
  if (absent.length > 0) throw new Error(`the root workspace of the repository does not have the binding crate${absent.length === 1 ? '' : 's'} ${absent.join(', ')} as members (GN-4, L-2)`);

  step(`${library}: the core${contracts.length === 1 ? '' : 's'} build${contracts.length === 1 ? 's' : ''} without the generator`);
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
  for (const c of contracts) run('cargo', ['test', '--manifest-path', join(copy, 'Cargo.toml'), '-p', c.core.crate, '--quiet']);
  // The check follows the core's build, which pins binding_core in Cargo.lock (CK-20). A git dependency moves to the
  // commit of this binding, as the repository does when it takes this binding.
  const lockText = existsSync(join(copy, 'Cargo.lock')) ? readFileSync(join(copy, 'Cargo.lock'), 'utf8') : '';
  if (/name = "polyspec-binding-core"\nversion = "[^"]*"\nsource = "git\+/.test(lockText)) {
    // --precise: a lock that named another source of binding_core (a path, an older form) is resolved to this commit.
    run('cargo', ['update', '--manifest-path', join(copy, 'Cargo.toml'), '-p', 'polyspec-binding-core', '--precise', head, '--quiet']);
    if (readFileSync(join(copy, 'Cargo.lock'), 'utf8') !== lockText) process.stdout.write('change: Cargo.lock pins polyspec-binding-core at the commit of this binding (CK-20)\n');
  }
  for (const path of paths) runBinding(['check', join(copy, path)], copy);

  step(`${library}: the cases in the convention of G-5`);
  return contracts.map((contract, i) => ({ contract, path: paths[i] ?? '', copy, caseFiles: checkCases(contract, copy) }));
}

// G-5: a case file of the repository follows the case convention: its keys are the parameter names in snake_case and a
// record is an object of its fields. A case that does not is a defect of the repository, which the run names, one line
// per group with the keys and the record values that differ, and does not rewrite.
function checkCases(contract: Contract, copy: string): string[] {
  const units = new Map(contract.units.map((u) => [u.id, u]));
  const snake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  // The record values of a case that are not the object of their fields: an array of the field values, or an object
  // whose keys are not the field names in snake_case.
  const records = (type: Type | undefined, value: unknown, at: string, found: string[]): void => {
    if (type === undefined || typeof type === 'string' || value === null) return;
    if ('optional' in type) return records(type.optional, value, at, found);
    if ('list' in type) {
      if (Array.isArray(value)) value.forEach((item, i) => records(type.list, item, `${at}[${String(i)}]`, found));
      return;
    }
    const unit: Unit | undefined = 'unit' in type && type.library === undefined ? units.get(type.unit) : undefined;
    if (unit?.kind !== 'record' || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      found.push(`${at} is an array, not the object of the fields of ${unit.id}`);
      return;
    }
    const fields = new Map((unit.fields ?? []).map((f) => [f.name.join('_'), f.type]));
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (snake(key) !== key) found.push(`${at}.${key} is not in snake_case`);
      records(fields.get(snake(key)), item, `${at}.${key}`, found);
    }
  };
  const memberById = new Map(contract.units.flatMap((u) => (u.members ?? []).map((m) => [m.id, { unit: u, member: m }] as const)));
  const files = new Set<string>();
  const defects: string[] = [];
  for (const row of contract.cases) {
    const file = join(copy, row.file);
    files.add(file);
    const document = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>[]>;
    // U-7: a case of an alias has no parameter of a member; its keys are already in snake_case.
    const found = row.member === undefined ? undefined : memberById.get(row.member);
    const parameters = found?.member.parameters ?? [];
    const params = new Map<string, Type>(parameters.map((p) => [p.name.join('_'), p.type]));
    const group = document[row.group];
    if (!Array.isArray(group)) continue;
    const differ: string[] = [];
    for (const kase of group) {
      for (const [key, value] of Object.entries(kase)) {
        if (snake(key) !== key) differ.push(`${String(kase['id'])}.${key} is not in snake_case`);
        records(params.get(snake(key)), value, `${String(kase['id'])}.${key}`, differ);
      }
    }
    if (differ.length > 0) defects.push(`${row.file}#${row.group}${row.member === undefined ? '' : ` of ${row.member}`}: ${[...new Set(differ)].join(', ')}`);
  }
  if (defects.length > 0) throw new Error(`the cases do not follow the case convention of G-5 (keys are the parameter names in snake_case, a record is the object of its fields): ${defects.join('; ')}`);
  return [...files];
}

// GN-5: the test features of a binding crate are the features of its manifest, which binding scaffold of the run
// wrote: panic-test, fault-test when the contract names fault injection points or a case arms one of another library
// (G-5), codec-test when an alias has in_raises (U-7).
const crateDirs: Record<Lang, string> = { python: 'packages/python', node: 'packages/ts', php: 'packages/php-ext', go: 'packages/go/internal/ffi', wasm: 'packages/ts/wasm' };
const testFeatures = (p: Prepared, t: Lang): string => {
  const manifestPath = at(p, `${crateDirs[t]}/Cargo.toml`);
  const table = /\n\[features\]\n([\s\S]*?)(?:\n\[|$)/.exec(readFileSync(manifestPath, 'utf8'))?.[1] ?? '';
  const features = [...table.matchAll(/^([a-z][a-z0-9-]*) = /gm)].map((m) => m[1] ?? '').filter((name) => name !== 'default');
  if (!features.includes('panic-test')) throw new Error(`${manifestPath} has no feature panic-test (GN-5)`);
  return features.join(',');
};

const extensionOf = (contract: Contract): string => `polyspec_${contract.library.replaceAll('-', '_')}`;

// The tools of the checkout (AGENTS.md), found before any step: a target whose tool is missing fails the run here, with
// the target, the tool and the file that pins it, so no target is left out (GN-14). A tool runs by its absolute path.
// The targets of a run are those of the contracts of the repository.
const repoContracts = contractsOf(resolve(repo)).map((path) => readContract(resolve(repo), path));
const targets = [...new Set(repoContracts.flatMap((c) => c.targets))];
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
// llvm-nm reads the static library of go and the extension of php built without features (GN-13b, GN-8a).
const llvmNmFor = targets.filter((t) => t === 'go' || t === 'php');
const llvmNm = llvmNmFor.length === 0 ? '' : llvmNmFor.map((t) => need(t, 'llvm-nm of the component llvm-tools', 'rust-toolchain.toml', file(join(rustcPrint('sysroot'), 'lib/rustlib', rustcPrint('host-tuple'), 'bin/llvm-nm'))))[0] ?? '';
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
// The library of a repository of several contracts is the one of its first contract (contractsOf).
const repositoryCommit = (path: string): string | null => (existsSync(join(resolve(path), '.git')) ? git(resolve(path), ['rev-parse', 'HEAD']) : null);
process.on('exit', (code) => {
  const library = repoContracts[0]?.library ?? '';
  const dir = join(checkout, 'var/report/e2e');
  mkdirSync(dir, { recursive: true });
  const report = {
    binding: commit,
    evidence: diagnosis.length === 0,
    diagnosis,
    repository: { path: resolve(repo), commit: repositoryCommit(repo), contracts: contractsOf(resolve(repo)) },
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
const prepared = (checkout: string): Prepared[] => {
  let found: Prepared[] = [];
  stepOf(targets, `${relative(binding, resolve(checkout)).startsWith('..') ? resolve(checkout) : relative(binding, resolve(checkout))}: copy, the changes the repository needs, the cores, the contract checks and the cases`, () => {
    found = prepare(checkout);
  });
  return found;
};
const dependencies = deps.flatMap((dep) => prepared(dep));
// The contracts of the repository, whose generated tests and cases the run runs; the dependencies give their builds.
const mains = prepared(repo);
const allCopies = [...dependencies, ...mains];
const library = repoContracts[0]?.library ?? '';
// The contracts of the repository of a target.
const mainsOf = (t: Lang): Prepared[] => mains.filter((p) => p.contract.targets.includes(t));
const copiesOf = (t: Lang): Prepared[] => allCopies.filter((p) => p.contract.targets.includes(t));

// G-4, GN-1b: each target generates its own files of each contract, so a refusal names that target alone; the
// refusals are its cause, one line each.
const generateOf = (t: Lang, p: Prepared): void => {
  stepOf([t], `generate ${p.contract.library} for ${t}`, () => {
    const contractPath = join(p.copy, p.path);
    process.stdout.write(`$ ${process.execPath} ${cli} generate --contract ${contractPath} --target ${t}\n`);
    const generated = spawnSync(process.execPath, [cli, 'generate', '--contract', contractPath, '--target', t], { encoding: 'utf8' });
    process.stdout.write(generated.stdout);
    process.stdout.write(generated.stderr);
    if (generated.status !== 0) {
      const refusals = generated.stderr.split('\n').filter((line) => line.startsWith('  ')).map((line) => line.trim().replaceAll(`${p.copy}/`, ''));
      throw new Error(refusals.length > 0 ? refusals.join('; ') : generated.stderr.split('\n')[0] ?? `status ${String(generated.status)}`);
    }
  });
};
for (const t of targets) for (const p of copiesOf(t)) generateOf(t, p);

// Each core is linted once, with the fault injection points of its feature fault-test when the contract has them.
stepOf(targets, `lint the core${mains.length === 1 ? '' : 's'}`, () => {
  for (const p of mains) run('cargo', ['clippy', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', p.contract.core.crate, '--all-targets', ...((p.contract.faults ?? []).length > 0 ? ['--features', 'fault-test'] : []), '--', '-D', 'warnings']);
});
for (const t of targets) if (!failed(t)) lintOf(t, `cargo clippy of the core${mains.length === 1 ? '' : 's'}`);
for (const t of targets) {
  if (stepOf([t], `lint the ${t} binding crate${mainsOf(t).length === 1 ? '' : 's'}`, () => {
    for (const p of mainsOf(t)) run('cargo', ['clippy', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', `${p.contract.core.crate}-${crateSuffix[t]}`, '--all-targets', '--features', testFeatures(p, t), '--', '-D', 'warnings']);
  })) lintOf(t, `cargo clippy of the ${t} binding crate${mainsOf(t).length === 1 ? '' : 's'} with ${mainsOf(t).length === 1 ? 'its' : 'their'} test features`);
}

const [cases] = mains[0]?.caseFiles ?? [];
const e2e = join(binding, 'tests/e2e', library);
// The case runners of a library are its cases.test.mjs, test_cases.py and CasesTest.php (tests/e2e/sample is a
// repository, not runners).
const caseRunners = existsSync(join(e2e, 'cases.test.mjs')) && cases !== undefined;
if (!caseRunners) process.stdout.write(`note: tests/e2e/${library} holds no case runners; the generated tests run alone\n`);

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
// The name of the generated tests of a contract in a directory of several contracts.
const generatedName = (p: Prepared, base: string, extension: string): string => (mains.length === 1 ? `${base}${extension}` : `${base}.${p.contract.library}${extension}`);

if (targets.includes('python')) {
  const venv = join(work, 'venv');
  const wheels = join(work, 'wheels');
  stepOf(['python'], 'build the wheels and install them into a venv of the Python of mise.toml', () => {
    run(pythonTool, ['-m', 'venv', '--clear', venv]);
    rmSync(wheels, { recursive: true, force: true });
    for (const p of copiesOf('python')) {
      // The wheel is built for the Python of the venv, the one of mise.toml, and installed from the local directory alone.
      run(maturin, ['build', '--interpreter', join(venv, 'bin/python'), '--features', testFeatures(p, 'python'), '--out', wheels], { cwd: packageDir(p, 'python') });
      const python = p.contract.packages['python'] as { package: string };
      const prefix = `${python.package.replaceAll('-', '_')}-`;
      const wheel = readdirSync(wheels).find((name) => name.startsWith(prefix) && name.endsWith('.whl'));
      if (wheel === undefined) throw new Error(`maturin wrote no wheel of ${python.package}`);
      run(join(venv, 'bin/pip'), ['install', '-q', '--no-index', '--force-reinstall', '--find-links', wheels, join(wheels, wheel)]);
    }
  });
  for (const p of mainsOf('python')) {
    const generatedPython = at(p, 'packages/python/generated/tests');
    const what = `the generated tests${mains.length === 1 ? '' : ` of ${p.contract.library}`} on unittest`;
    stepOf(['python'], what, () => unittest('python', what, [join(venv, 'bin/python'), '-m', 'unittest', 'discover', '-s', generatedPython, '-t', generatedPython]));
  }
  if (caseRunners) stepOf(['python'], 'the contract cases on unittest', () => unittest('python', 'the contract cases on unittest', [join(venv, 'bin/python'), '-m', 'unittest', 'discover', '-s', e2e, '-t', e2e, '-p', 'test_*.py'], { CASES: cases }));
  if (existsSync(join(e2e, 'bench.py'))) stepOf(['python'], 'the measurement of bench.py', () => run(join(venv, 'bin/python'), [join(e2e, 'bench.py')], { env: { BENCH_REPORT: join(checkout, 'var/report/bench', `${library}-python.json`) } }));
}

const lib = (c: Contract, suffix: string): string => `${c.core.crate}-${suffix}`.replaceAll('-', '_');
// Cargo names a cdylib lib<name>.so on Linux and lib<name>.dylib on macOS.
const dylib = process.platform === 'darwin' ? 'dylib' : 'so';
if (targets.includes('wasm')) {
  stepOf(['wasm'], 'build the module and its glue with wasm-bindgen', () => {
    for (const p of mainsOf('wasm')) {
      const wanted = /wasm-bindgen = "=([0-9.]+)"/.exec(readFileSync(at(p, 'packages/ts/wasm/Cargo.toml'), 'utf8'))?.[1];
      const tool = execFileSync(wasmBindgen, ['--version'], { encoding: 'utf8' }).trim();
      if (tool !== `wasm-bindgen ${wanted ?? ''}`) throw new Error(`${tool} of mise.toml is not the release of the crate, ${wanted ?? 'unknown'}`);
      run('cargo', ['build', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', `${p.contract.core.crate}-wasm`, '--target', 'wasm32-unknown-unknown', '--features', testFeatures(p, 'wasm')]);
      const glue = `${p.contract.library.replaceAll('-', '_')}_wasm`;
      run(wasmBindgen, ['--target', 'web', '--out-dir', at(p, 'packages/ts/wasm/generated'), '--out-name', glue, join(target, `wasm32-unknown-unknown/debug/${lib(p.contract, 'wasm')}.wasm`)]);
    }
  });
}

// The npm package holds the addon of Node and the WASM module, so the WASM tests need the packages that the Node steps
// pack and install; WASM fails with the cause of Node when they fail.
const nodeDir = join(work, 'node');
let installed = false;
if (targets.includes('node') || targets.includes('wasm')) {
  const owner: Lang[] = targets.includes('node') ? ['node'] : ['wasm'];
  installed = stepOf(owner, `build the addon${mains.length === 1 ? '' : 's'}, pack and install the npm package${mains.length === 1 ? '' : 's'}`, () => {
    rmSync(nodeDir, { recursive: true, force: true });
    mkdirSync(nodeDir, { recursive: true });
    // T-2: the addon is the npm package of this machine's platform, which a release names in optionalDependencies of
    // the manifest it packs (GN-3c); the run packs it as a release does and installs both tarballs.
    const platform = `${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}`;
    const packed = mains.filter((p) => p.contract.targets.includes('node') || p.contract.targets.includes('wasm'));
    for (const p of packed) {
      run('cargo', ['build', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', `${p.contract.core.crate}-node`, '--features', testFeatures(p, 'node')]);
      const npm = (p.contract.packages['node'] as { package: string }).package;
      const platformDir = join(work, `node-platform-${p.contract.library}`);
      rmSync(platformDir, { recursive: true, force: true });
      mkdirSync(platformDir, { recursive: true });
      const addonName = `${npm.slice(npm.indexOf('/') + 1)}.${platform}.node`;
      copyFileSync(join(target, `debug/lib${lib(p.contract, 'node')}.${dylib}`), join(platformDir, addonName));
      const version = (JSON.parse(readFileSync(join(packageDir(p, 'ts'), 'package.json'), 'utf8')) as { version: string }).version;
      writeFileSync(join(platformDir, 'package.json'), `${JSON.stringify({ name: `${npm}-${platform}`, version, os: [process.platform], cpu: [process.arch], main: addonName, files: [addonName] }, null, 2)}\n`);
      run(npmTool, ['pack', '--pack-destination', nodeDir], { cwd: platformDir });
      run(npmTool, ['pack', '--pack-destination', nodeDir], { cwd: packageDir(p, 'ts') });
    }
    writeFileSync(join(nodeDir, 'package.json'), '{ "private": true }\n');
    const tarballs = readdirSync(nodeDir).filter((name) => name.endsWith('.tgz')).map((name) => join(nodeDir, name));
    if (tarballs.length !== 2 * packed.length) throw new Error(`npm pack wrote ${tarballs.length} packages, not the ${2 * packed.length} of the contracts`);
    // The other platforms' packages are optional and absent, as on a machine of this platform.
    run(npmTool, ['install', '--no-audit', '--no-fund', '--omit=optional', ...tarballs], { cwd: nodeDir });
  });
  if (!installed && targets.includes('wasm') && owner[0] === 'node' && !failed('wasm')) {
    outcome('wasm').causes.push(`the npm package that holds the module was not installed: ${outcome('node').causes.join('; ')}`);
  }
}
// The generated tests of a contract in the directory of the installed packages, by their path from it: the tests of a
// package import it by its name, those of a host package (L-2a) the generated entry beside them, so they sit in the
// installed package where the copy has them.
const placeTest = (p: Prepared, path: string, name: string): string => {
  if (!isHost(p.contract, 'node')) {
    copyFileSync(at(p, path), join(nodeDir, name));
    return name;
  }
  const npm = (p.contract.packages['node'] as { package: string }).package;
  const inPackage = join('node_modules', npm, relative(packageDir(p, 'ts'), at(p, path)));
  mkdirSync(dirname(join(nodeDir, inPackage)), { recursive: true });
  copyFileSync(at(p, path), join(nodeDir, inPackage));
  return inPackage;
};
if (targets.includes('node') && installed) {
  stepOf(['node'], 'the generated tests and the cases on node --test', () => {
    const files = mainsOf('node').map((p) => placeTest(p, 'packages/ts/generated/tests/generated.test.mjs', generatedName(p, 'generated', '.test.mjs')));
    if (caseRunners) copyFileSync(join(e2e, 'cases.test.mjs'), join(nodeDir, 'cases.test.mjs'));
    nodeTest('node', `the generated tests${caseRunners ? ' and the contract cases' : ''} on node --test`, [], [...files, ...(caseRunners ? ['cases.test.mjs'] : [])], nodeDir, { CASES: cases ?? '' });
  });
}
// B2.87: the measurement of a library whose tests/e2e/<library> holds bench.mjs, bench.py or bench.php, after its cases;
// it writes the medians with the load average into BENCH_REPORT and warns above its limit, and never fails the run.
const benchReport = (language: string): string => join(checkout, 'var/report/bench', `${library}-${language}.json`);
if (targets.includes('node') && installed && existsSync(join(e2e, 'bench.mjs'))) {
  stepOf(['node'], 'the measurement of bench.mjs', () => {
    copyFileSync(join(e2e, 'bench.mjs'), join(nodeDir, 'bench.mjs'));
    run(process.execPath, [join(nodeDir, 'bench.mjs')], { cwd: nodeDir, env: { BENCH_REPORT: benchReport('node') } });
  });
}
if (targets.includes('wasm') && installed) {
  // P-5: the WASM binding passes the same tests and cases through the subpath ./wasm of the same package.
  stepOf(['wasm'], 'the generated tests and the cases through the subpath ./wasm', () => {
    const files = mainsOf('wasm').map((p) => placeTest(p, 'packages/ts/wasm/generated/tests/generated.test.mjs', generatedName(p, 'generated', '.wasm.test.mjs')));
    const wasmCases = caseRunners && existsSync(join(e2e, 'cases.wasm.test.mjs'));
    if (wasmCases) copyFileSync(join(e2e, 'cases.wasm.test.mjs'), join(nodeDir, 'cases.wasm.test.mjs'));
    // --expose-gc: a case of GN-18a collects instances.
    nodeTest('wasm', `the generated tests${wasmCases ? ' and the contract cases' : ''} on node --test through ./wasm`, ['--expose-gc'], [...files, ...(wasmCases ? ['cases.wasm.test.mjs'] : [])], nodeDir, { CASES: cases ?? '' });
  });
}

if (targets.includes('php')) {
  const extensions: string[] = [];
  // GN-13: the entry points of case-test are for tests only. The extension built without features holds none of them,
  // and the one built with the test features holds each, so the check reads symbols that it can find.
  for (const p of copiesOf('php').filter((c) => testFeatures(c, 'php').split(',').includes('case-test'))) {
    const label = `llvm-nm: the extension${copiesOf('php').length === 1 ? '' : ` of ${p.contract.library}`} without features holds no case-test entry point`;
    if (stepOf(['php'], label, () => {
      const symbols = (features: string[]): string[] => {
        run('cargo', ['build', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', `${p.contract.core.crate}-php-ext`, ...features]);
        process.stdout.write('$ llvm-nm --defined-only (case-test entry points)\n');
        const listed = execFileSync(llvmNm, ['--defined-only', join(target, `debug/lib${extensionOf(p.contract)}.${dylib}`)], { encoding: 'utf8', maxBuffer: 1 << 28 });
        return listed.split('\n').filter((line) => /case_test_[0-9]+/.test(line));
      };
      const leaked = symbols([]);
      if (leaked.length > 0) throw new Error(`the extension built without features holds case-test entry points: ${leaked.join(', ')}`);
      if (symbols(['--features', testFeatures(p, 'php')]).length === 0) throw new Error('the extension built with the test features holds no case-test entry point, so the check reads no symbol of one');
    })) lintOf('php', label);
  }
  stepOf(['php'], 'build the extensions', () => {
    for (const p of copiesOf('php')) {
      run('cargo', ['build', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', `${p.contract.core.crate}-php-ext`, '--features', testFeatures(p, 'php')]);
      extensions.push('-d', `extension=${join(target, `debug/lib${extensionOf(p.contract)}.${dylib}`)}`);
    }
  });
  // GN-8a: the test entry points are of the test features alone. The extension built with them holds errno_of, which
  // shows that llvm-nm reads the names of the entry points, and the extension built without features holds none.
  const testEntry = /panic_test|arm_faults|fault_left|errno_of|alias_in_/;
  for (const p of mainsOf('php')) {
    const of = mains.length === 1 ? '' : ` of ${p.contract.library}`;
    const what = `llvm-nm: the extension${of} without features holds no test entry point`;
    if (stepOf(['php'], what, () => {
      const read = (path: string): string[] => {
        process.stdout.write(`$ llvm-nm --defined-only ${path}\n`);
        return execFileSync(llvmNm, ['--defined-only', path], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n');
      };
      if (!read(join(target, `debug/lib${extensionOf(p.contract)}.${dylib}`)).some((line) => line.includes('errno_of'))) throw new Error('the extension built with the test features holds no errno_of, so llvm-nm does not show the entry points');
      const release = join(work, 'target-release-check');
      run('cargo', ['build', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', `${p.contract.core.crate}-php-ext`], { env: { CARGO_TARGET_DIR: release } });
      const leaked = read(join(release, `debug/lib${extensionOf(p.contract)}.${dylib}`)).filter((line) => testEntry.test(line));
      if (leaked.length > 0) throw new Error(`the extension built without features holds test entry points: ${leaked.join(', ')}`);
      rmSync(release, { recursive: true, force: true });
    })) lintOf('php', what);
  }
  if (stepOf(['php'], 'php -l of the stub', () => {
    for (const p of mainsOf('php')) run(phpTool, ['-l', at(p, `packages/php-ext/generated/${extensionOf(p.contract)}.stub.php`)]);
  })) lintOf('php', 'php -l of the stub');
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
  for (const p of mainsOf('php')) {
    const name = `generated tests${mains.length === 1 ? '' : ` of ${p.contract.library}`}`;
    stepOf(['php'], `the ${name} on PHPUnit`, () => phpunitRun(name, at(p, 'packages/php-ext/generated/tests')));
  }
  if (caseRunners) stepOf(['php'], 'the contract cases on PHPUnit', () => phpunitRun('contract cases', join(e2e, 'CasesTest.php'), { CASES: cases ?? '' }));
  if (existsSync(join(e2e, 'bench.php'))) stepOf(['php'], 'the measurement of bench.php', () => run(phpTool, [...extensions, join(e2e, 'bench.php')], { env: { BENCH_REPORT: benchReport('php') } }));
}

if (targets.includes('go')) {
  // GN-5: the build tags of go test are the test features of the crate, polyspec_<feature>, each with _ for -.
  const goTags = (p: Prepared): string => testFeatures(p, 'go').split(',').map((feature) => `polyspec_${feature.replaceAll('-', '_')}`).join(',');
  const goEnvOf = (p: Prepared): Record<string, string> => ({ CGO_LDFLAGS: `-L${join(target, 'debug')}`, GOTOOLCHAIN: 'local', GOFLAGS: `-tags=${goTags(p)}`, CASES: cases ?? '' });
  const goCases = caseRunners && existsSync(join(e2e, 'cases_test.go'));
  for (const [i, p] of mainsOf('go').entries()) {
    const goModule = at(p, 'packages/go');
    const crate = p.contract.core.crate;
    const goEnv = goEnvOf(p);
    const of = mains.length === 1 ? '' : ` of ${p.contract.library}`;
    // GN-13b, GN-6u: panic-test, codec-test and native-count-test are for tests only; the library built without features
    // has no test entry point.
    if (stepOf(['go'], `llvm-nm: the static library${of} without features holds no test entry point`, () => {
      const release = join(work, 'target-release-check');
      run('cargo', ['build', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', `${crate}-go`], { env: { CARGO_TARGET_DIR: release } });
      process.stdout.write('$ llvm-nm --defined-only (test entry points)\n');
      const symbols = execFileSync(llvmNm, ['--defined-only', join(release, `debug/lib${lib(p.contract, 'go')}.a`)], { encoding: 'utf8', maxBuffer: 1 << 28 });
      const leaked = symbols.split('\n').filter((line) => / [A-Z] _?polyspec_[a-z0-9_]*__(panic_test|echo_|arm_faults|fault_left|alias_in_|native_count)/.test(line));
      if (leaked.length > 0) throw new Error(`the static library built without features holds test entry points: ${leaked.join(', ')}`);
      rmSync(release, { recursive: true, force: true });
    })) lintOf('go', `llvm-nm: the static library${of} without features holds no test entry point`);
    stepOf(['go'], `build the static library${of} with the test features`, () => {
      run('cargo', ['build', '--manifest-path', join(p.copy, 'Cargo.toml'), '-p', `${crate}-go`, '--features', testFeatures(p, 'go')]);
      // GN-15f: the Go module of a dependency that go.mod requires is built in the same program, so its static library
      // is built into the same directory, with its own test features, whose build tags the run gives every package.
      const goMod = readFileSync(join(goModule, 'go.mod'), 'utf8');
      for (const d of dependencies.filter((d) => d.contract.targets.includes('go'))) {
        const module = (d.contract.packages['go'] as { module: string }).module;
        if (new RegExp(`^require ${module.replaceAll('.', '\\.')} |^\\t${module.replaceAll('.', '\\.')} `, 'm').test(goMod)) run('cargo', ['build', '--manifest-path', join(d.copy, 'Cargo.toml'), '-p', `${d.contract.core.crate}-go`, '--features', testFeatures(d, 'go')]);
      }
      if (goCases && i === 0) {
        mkdirSync(join(goModule, 'tests'), { recursive: true });
        copyFileSync(join(e2e, 'cases_test.go'), join(goModule, 'tests/cases_test.go'));
      }
    });
    if (stepOf(['go'], `gofmt -l and go vet${of}`, () => {
      process.stdout.write('$ gofmt -l .\n');
      const unformatted = execFileSync(gofmt, ['-l', '.'], { cwd: goModule, encoding: 'utf8' });
      if (unformatted !== '') throw new Error(`gofmt would change: ${unformatted.trim().split('\n').join(', ')}`);
      run(goTool, ['vet', './...'], { cwd: goModule, env: goEnv });
    })) lintOf('go', `gofmt -l and go vet${of}`);
    // GN-14a: go test -json gives an event for each test, so the run counts the tests that passed, failed and were
    // skipped.
    const what = `the generated tests${goCases && i === 0 ? ' and the contract cases' : ''}${of} on go test`;
    stepOf(['go'], what, () => {
      process.stdout.write(`$ ${goTool} test -json -count=1 ./...\n`);
      const goTest = spawnSync(goTool, ['test', '-json', '-count=1', './...'], { cwd: goModule, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...gitDependency, CARGO_TARGET_DIR: target, ...goEnv } });
      const read = readGoTestEvents(goTest.stdout);
      process.stdout.write(read.printed);
      process.stdout.write(goTest.stderr);
      const failure = goPackageFailure(read, goTest.status);
      if (failure !== undefined) throw new Error(failure);
      const { counts, packageFailures } = read;
      counted('go', what, counts.pass.length, counts.fail.length + (goTest.status !== 0 && counts.fail.length === 0 && packageFailures.length === 0 ? 1 : 0), counts.skip.length, counts.skip);
    });
  }
}

if (targets.includes('node') && installed) {
  if (stepOf(['node'], 'tsc --strict of the declarations', () => {
    for (const p of mainsOf('node')) run(tsc, ['--noEmit', '--strict', at(p, 'packages/ts/generated/index.d.ts')]);
  })) lintOf('node', 'tsc --strict of the declarations');
}
if (targets.includes('wasm') && installed) {
  if (stepOf(['wasm'], 'tsc --strict of the declarations', () => {
    for (const p of mainsOf('wasm')) run(tsc, ['--noEmit', '--strict', at(p, 'packages/ts/wasm/generated/index.d.ts')]);
  })) lintOf('wasm', 'tsc --strict of the declarations');
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
process.stdout.write('\nevery target passed\n');
