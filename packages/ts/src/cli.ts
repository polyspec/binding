#!/usr/bin/env node
// binding check <interface.json> [--release]
//   The contract check (I-1, I-2), with the contracts of the libraries the contract names, and the comparison of the
//   tracked binding packages with what `binding scaffold` writes (L-2). --release adds the check of a release (CK-70).
// binding scaffold [--root <repository> | --contract <interface.json>]
//   Writes the tracked thin package of each binding (L-2): its Cargo manifest, its entry file and its language manifest.
// binding generate [--root <repository> | --contract <interface.json>] [--out <directory>]
//   Writes the generated sources into the directories that binding owns (L-1). --out writes the same files under another
//   directory, for the comparison of I-5.
// binding release-go-module (--root <repository> | --contract <interface.json>) --tag vX.Y.Z --libraries <directory>
//     --work <directory> [--remote <name>]
//   Makes the commit and the tag of the Go module with its static libraries (GN-19f) and prints the reference to push.

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'smol-toml';
import { checkContract } from './check.ts';
import { ownCommit } from './commit.ts';
import type { Contract, Lang } from './contract.ts';
import { caseTestTargets, generate, generatedDirs, goModuleDir, isGoGenerated } from './generate/index.ts';
import { Unsupported } from './generate/model.ts';
import { bindingCoreFinding, casePointLibraries, componentBase, extensionName, hostRequirements, releaseFindings, type Tracked, trackedResult } from './generate/packages.ts';
import { Refused, releaseGoModule } from './release/go-module.ts';

function libraries(contract: unknown): Set<string> {
  const found = new Set<string>();
  const own = (contract as { library?: unknown }).library;
  const walk = (value: unknown, key: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    } else if ((key === 'library' || key === 'source' || key === 'from') && typeof value === 'string' && value !== own) {
      found.add(value);
    }
  };
  for (const [key, value] of Object.entries(contract as object)) {
    if (key !== 'library') walk(value, key);
  }
  return found;
}

// The contracts of the named libraries, read from the packages that Cargo resolved for the crate beside the contract:
// each library's crate is polyspec-<library> (P-1) and ships its interface.json (I-1). No other checkout is read (S15).
// GN-15f: cargo metadata resolves the workspace, so it fails where Cargo cannot: without network for a Git dependency
// that the machine has not fetched, or for a manifest that names a crate that no longer exists. The failure is given
// back with what to run, so that scaffold can name the Go module alone.
function cargoContracts(contract: unknown, crateDir: string): { found: Map<string, unknown>; failure?: string } {
  const wanted = libraries(contract);
  const found = new Map<string, unknown>();
  if (wanted.size === 0) return { found };
  // Cargo writes the metadata into a file rather than a pipe, so its size (megabytes for a workspace with the binding
  // crates) meets no buffer limit of the child process.
  const scratch = mkdtempSync(join(tmpdir(), 'binding-metadata-'));
  let metadata: { packages: { name: string; manifest_path: string }[] };
  try {
    const out = join(scratch, 'metadata.json');
    const fd = openSync(out, 'w');
    try {
      const run = spawnSync('cargo', ['metadata', '--format-version', '1', '--manifest-path', join(crateDir, 'Cargo.toml')], {
        stdio: ['ignore', fd, 'inherit'],
      });
      if (run.error !== undefined) throw run.error;
      if (run.status !== 0) return { found, failure: `cargo metadata failed with status ${String(run.status)}; run the install target of the repository that fetches the crates of its Cargo.lock (cargo fetch --locked), then run the command again` };
    } finally {
      closeSync(fd);
    }
    metadata = JSON.parse(readFileSync(out, 'utf8')) as typeof metadata;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  // T-3: the contract of a library names the libraries of its own types, so the contracts are read to the closure: a
  // library that only a unit of another library names, such as the value that a callback of that library gives, is a
  // package of the same resolution of Cargo.
  closure(contract, found, (library) => {
    const crate = metadata.packages.find((p) => p.name === `polyspec-${library}`);
    return crate === undefined ? undefined : JSON.parse(readFileSync(join(dirname(crate.manifest_path), 'interface.json'), 'utf8')) as unknown;
  });
  return { found };
}

// T-3: reads into found the contract of each library that the contract names and of each library that one of those
// contracts names, to the closure; read gives the contract of a library, with the libraries that named it from the
// contract of the command on, or undefined when it is not found. Libraries that name each other in a cycle are refused
// by name: Cargo resolves no cycle of crates, so such contracts describe no cores.
function closure(contract: unknown, found: Map<string, unknown>, read: (library: string, from: string[]) => unknown): void {
  const own = String((contract as { library?: unknown }).library);
  const visit = (of: unknown, path: string[]): void => {
    for (const library of libraries(of)) {
      if (path.includes(library)) fail(`the contracts of the libraries ${[...path.slice(path.indexOf(library)), library].join(' -> ')} name each other in a cycle, which is not generated (T-3)`);
      if (found.has(library)) continue;
      const other = read(library, path);
      if (other === undefined) continue;
      found.set(library, other);
      visit(other, [...path, library]);
    }
  };
  visit(contract, [own]);
}

// check and generate read the contracts for every target, so a failure of Cargo stops them.
function dependencies(contract: unknown, crateDir: string): Map<string, unknown> {
  const { found, failure } = cargoContracts(contract, crateDir);
  if (failure !== undefined) fail(failure);
  return found;
}

// GN-1c: a failure that is no error of the command line, such as a refused target or a manifest that is not the crate
// of the contract, has status 1 and no usage line; only an error of the command line prints the usage, with status 2.
function fail(message: string): never {
  process.stderr.write(`binding: ${message}\n`);
  process.exit(1);
}

function usage(message: string): never {
  process.stderr.write(`binding: ${message}\nusage: binding check <interface.json> [--release] | binding scaffold|generate [--root <repository> | --contract <interface.json>] [--out <directory>] [--target <target>[,<target>...]] | binding release-go-module (--root <repository> | --contract <interface.json>) --tag vX.Y.Z --libraries <directory> --work <directory> [--remote <name>]\n`);
  process.exit(2);
}

// GN-1c: the sentences of a failure that a contract, a case file or a manifest causes, which the generator throws as a
// refusal or as an Error with its sentence. Any other error is a defect of binding and keeps its stack trace.
function sentences(error: unknown): string[] {
  if (error instanceof Unsupported) return error.refusals;
  if (error instanceof Error && error.constructor === Error && !error.message.startsWith('internal:')) return [error.message];
  throw error;
}

// GN-19f: the commit and the tag of the Go module of a release. The command reads from the contract only where the Go
// module is and how its library is named; the checks of the contract are those of `binding check --release`, which the
// recipe of a release runs before it (GN-19g).
function releaseGoModuleCommand(argv: string[]): never {
  const given = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === undefined || value === undefined || !['--root', '--contract', '--tag', '--libraries', '--work', '--remote'].includes(key)) usage(`unknown argument ${key ?? ''}`);
    given.set(key, value);
  }
  const tag = given.get('--tag');
  const libraries = given.get('--libraries');
  const work = given.get('--work');
  if (tag === undefined || libraries === undefined || work === undefined) usage('release-go-module takes --tag, --libraries and --work');
  const contractOption = given.get('--contract');
  if (contractOption !== undefined && given.has('--root')) usage('give --root or --contract, not both');
  const path = contractOption !== undefined ? resolve(contractOption) : join(resolve(given.get('--root') ?? '.'), 'packages/rust/interface.json');
  const contract = JSON.parse(readFileSync(path, 'utf8')) as Contract;
  const module = (contract.packages?.['go'] as { module?: unknown } | undefined)?.module;
  if (typeof module !== 'string') fail(`${path} names no Go module (packages.go), so the repository has no Go module to release`);
  let released;
  try {
    released = releaseGoModule({
      root: resolve(dirname(path), ...contract.core.path.split('/').map(() => '..')),
      directory: goModuleDir(contract),
      module,
      tag,
      library: `${contract.core.crate}-go`.replaceAll('-', '_'),
      prefix: extensionName(contract),
      libraries: resolve(libraries),
      work: resolve(work),
      remote: given.get('--remote') ?? 'origin',
      env: process.env,
      log: (line) => {
        if (line !== '') process.stderr.write(`${line}\n`);
      },
    });
  } catch (error) {
    if (error instanceof Refused) {
      for (const finding of error.findings) process.stderr.write(`binding: ${finding}\n`);
      process.stderr.write('binding: no commit and no tag of the Go module was made (GN-19f)\n');
      process.exit(1);
    }
    for (const sentence of sentences(error)) process.stderr.write(`binding: ${sentence}\n`);
    process.exit(1);
  }
  const reference = `refs/tags/${goModuleDir(contract)}/${tag}`;
  process.stderr.write(`binding: ${reference} names the commit ${released.commit}${released.reference === undefined ? ', and the remote holds it already' : '; the recipe pushes it'}\n`);
  // The standard output is the reference that the recipe pushes, and nothing else.
  if (released.reference !== undefined) process.stdout.write(`${released.reference}\n`);
  process.exit(0);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'release-go-module') releaseGoModuleCommand(rest);
if (command !== 'check' && command !== 'scaffold' && command !== 'generate') usage(`unknown command ${command ?? ''}`);
const options = new Map<string, string>();
let contractPath: string;
if (command === 'check') {
  // CK-70: --release, which the recipe of a release passes (GN-19g), adds the check of a release.
  const [path, ...extra] = rest.filter((argument) => argument !== '--release');
  if (path === undefined || path.startsWith('--') || extra.length > 0) usage('check takes the path of one interface.json and the option --release');
  if (rest.includes('--release')) options.set('--release', 'true');
  contractPath = resolve(path);
} else {
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (key === undefined || value === undefined || !['--root', '--contract', '--out', ...(command === 'generate' ? ['--target'] : [])].includes(key)) usage(`unknown argument ${key ?? ''}`);
    options.set(key, value);
  }
  // L-1: a core at packages/<component>/rust names its contract with --contract; --root finds packages/rust.
  const given = options.get('--contract');
  if (given !== undefined && options.has('--root')) usage('give --root or --contract, not both');
  contractPath = given !== undefined ? resolve(given) : join(resolve(options.get('--root') ?? '.'), 'packages/rust/interface.json');
}
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as unknown;
// scaffold writes the thin packages from the package and name items alone (the schema, CK-1, and the names, CK-18), so
// no other finding stops it, such as a unit that is still todo (CK-2); check and generate report those. It does not ask
// Cargo for the workspace either: a binding manifest that an earlier scaffold wrote, which this one rewrites, may no
// longer resolve (the core crate was renamed), and that must not stop the rewrite. Only the go.mod of a contract with the
// target go needs the contracts of other libraries, which scaffold reads below (GN-15f).
const foreign = command === 'scaffold' ? new Map<string, unknown>() : dependencies(contract, dirname(contractPath));
// G-5: an integer of a case file outside the safe integers is read as a bigint from its token, so it keeps its value
// (an int64 such as 9223372036854775807); a number with a fraction or an exponent stays a number.
const caseNumber = (_key: string, value: unknown, context?: { source?: string }): unknown =>
  typeof value === 'number' && !Number.isSafeInteger(value) && context?.source !== undefined && /^-?(0|[1-9][0-9]*)$/.test(context.source) ? BigInt(context.source) : value;
// K-1: the case files that cases names, from the repository root, for CK-22; a file that does not parse is left out
// and reported as not found.
const caseFiles = new Map<string, unknown>();
{
  const raw = contract as { core?: { path?: unknown }; cases?: { file?: unknown }[] };
  const corePath = typeof raw.core?.path === 'string' ? raw.core.path : undefined;
  if (corePath !== undefined && Array.isArray(raw.cases)) {
    const top = resolve(dirname(contractPath), ...corePath.split('/').map(() => '..'));
    for (const row of raw.cases) {
      if (typeof row.file !== 'string' || caseFiles.has(row.file)) continue;
      try {
        caseFiles.set(row.file, JSON.parse(readFileSync(join(top, row.file), 'utf8'), caseNumber));
      } catch {
        // not found or not JSON: CK-22 reports the file
      }
    }
  }
}
const findings = checkContract(contract, { dependencies: foreign, caseFiles }).filter((f) => command !== 'scaffold' || f.check === 'CK-1' || f.check === 'CK-18');
for (const f of findings) process.stderr.write(`${contractPath}#${f.path}: ${f.check} ${f.message}\n`);
// check runs CK-19 and CK-20 past the findings of the contract and stops each only where it reads what a failed check
// gives (contract-check.md): CK-20 reads core.path (CK-1), CK-19 what scaffold writes from the packages and names (CK-1,
// CK-18). generate and scaffold read the contract, so a finding stops them.
const failedChecks = new Set(findings.map((f) => f.check));
if (findings.length > 0 && command !== 'check') process.exit(1);
if (failedChecks.has('CK-1')) {
  process.stderr.write(`${contractPath}: CK-19 and CK-20 did not run: they read the contract, which fails CK-1\n`);
  process.exit(1);
}
const checked = contract as Contract;
// The repository root: the contract is packages/rust/interface.json of the core crate (I-1).
const root = resolve(dirname(contractPath), ...checked.core.path.split('/').map(() => '..'));

// The version and the library name of the core crate from its manifest (T-3), read as TOML: a version inherited from the
// workspace (version.workspace = true) is the root manifest's workspace.package.version.
const manifest = parse(readFileSync(join(root, checked.core.path, 'Cargo.toml'), 'utf8')) as {
  package?: { name?: string; version?: string | { workspace?: boolean }; license?: string | { workspace?: boolean } };
  lib?: { name?: string };
  dependencies?: Record<string, unknown>;
  'dev-dependencies'?: Record<string, unknown>;
};
const core = manifest.package;
let version = core?.version;
// GN-3f: the licence of the core, which every manifest of its binding packages carries, read as the version is.
let license = core?.license;
if ((typeof version === 'object' && version.workspace === true) || (typeof license === 'object' && license.workspace === true)) {
  const workspace = parse(readFileSync(join(root, 'Cargo.toml'), 'utf8')) as { workspace?: { package?: { version?: string; license?: string } } };
  if (typeof version === 'object') version = workspace.workspace?.package?.version;
  if (typeof license === 'object') license = workspace.workspace?.package?.license;
}
const coreLicense = typeof license === 'string' ? license : undefined;
if (core?.name !== checked.core.crate || typeof version !== 'string') fail(`${checked.core.path}/Cargo.toml is not the crate ${checked.core.crate} with a version`);
// G-5: the binding crates turn on fault-test of each core whose fault injection points a case arms.
// GN-15f: go.mod requires the Go module of each library whose records the contract names, so scaffold of a contract
// with the target go reads the contracts of the libraries it names: the contract of a path dependency of the core is
// the interface.json of that path, which needs no Cargo, and one of any other dependency is found through Cargo, as
// generate finds it.
let metadataFailure: string | undefined;
function scaffolded(): Map<string, unknown> {
  const found = new Map<string, unknown>();
  // The directory of the core of each library that a path names, from the directory of the core that names it.
  const dirs = new Map<string, string>([[checked.library, join(root, checked.core.path)]]);
  let others = false;
  closure(contract, found, (library, from) => {
    const dir = dirs.get(from[from.length - 1] ?? '');
    if (dir === undefined) return undefined;
    let spec: unknown;
    try {
      spec = (parse(readFileSync(join(dir, 'Cargo.toml'), 'utf8')) as { dependencies?: Record<string, unknown> }).dependencies?.[`polyspec-${library}`];
    } catch {
      spec = undefined;
    }
    const path = typeof spec === 'object' && spec !== null ? (spec as { path?: unknown }).path : undefined;
    // A contract that is not there is not found: the package that reads it is then named as not written (GN-3e), and
    // the other packages are written.
    const file = typeof path === 'string' ? join(dir, path, 'interface.json') : undefined;
    if (file !== undefined && existsSync(file)) {
      dirs.set(library, join(dir, path as string));
      return JSON.parse(readFileSync(file, 'utf8')) as unknown;
    }
    if (typeof path !== 'string') others = true;
    return undefined;
  });
  // A failure of Cargo leaves the contracts of the other dependencies not found: the Go module is then named as not
  // written with the failure, and the other packages are written with the libraries that the contract itself names.
  if (others) {
    const cargo = cargoContracts(contract, join(root, checked.core.path));
    metadataFailure = cargo.failure;
    for (const [library, other] of cargo.found) if (!found.has(library)) found.set(library, other);
  }
  return found;
}
const coreDependencies = new Map(Object.entries(manifest.dependencies ?? {}));
// GN-3e: the running generator, whose own line on polyspec-binding-core the binding crates of a core without that line
// get: the version of its package and the commit that it knows of itself (CK-20).
const packageDir = resolve(dirname(new URL(import.meta.url).pathname), '..');
const generator = { version: (JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { version: string }).version, commit: ownCommit(packageDir) };
// GN-3e: the tracked packages, which check and scaffold read and generate does not. A package that cannot be written is
// named with its reason, and so is a failure of the whole that the contract, a case file or a manifest causes.
function trackedOf(): Tracked {
  try {
    const result = trackedResult(checked, version as string, coreDependencies, casePointLibraries(checked, caseFiles), (command === 'scaffold' ? scaffolded() : foreign) as ReadonlyMap<string, Contract>, caseTestTargets({ contract: checked, caseFiles, foreign: foreign as ReadonlyMap<string, Contract> }), coreLicense, generator);
    const failure = metadataFailure;
    return failure === undefined ? result : { files: result.files, refused: result.refused.map((r) => (r.path === goModuleDir(checked) ? { path: r.path, message: `${r.message}: ${failure}` } : r)) };
  } catch (error) {
    return { files: new Map(), refused: sentences(error).map((message) => ({ path: componentBase(checked), message })) };
  }
}
const tracked: Tracked = command === 'generate' ? { files: new Map(), refused: [] } : trackedOf();

if (command === 'check') {
  // L-2: each tracked file of the binding packages is what binding scaffold writes.
  let differs = false;
  // CK-20: the polyspec-binding-core that the repository's Cargo.lock pins is the one of this binding, because one
  // release gives both and the generated code is written for that crate (L-2): of its version for a release, and of
  // the commit that this binding was checked out at for a git dependency.
  const own = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  const lockPath = join(root, 'Cargo.lock');
  const lock = existsSync(lockPath) ? (parse(readFileSync(lockPath, 'utf8')) as { package?: { name: string; version: string; source?: string }[] }) : undefined;
  const pins = (lock?.package ?? []).filter((p) => p.name === 'polyspec-binding-core');
  const pinned = pins.map((p) => p.version);
  if (pinned.length !== 1 || pinned[0] !== own) {
    differs = true;
    const found = lock === undefined ? 'there is no Cargo.lock' : pinned.length === 0 ? 'Cargo.lock pins no polyspec-binding-core' : `Cargo.lock pins polyspec-binding-core ${pinned.join(', ')}`;
    process.stderr.write(`${lockPath}: CK-20 ${found}, not ${own}, the version of this binding (L-2)\n`);
  } else if (pins[0]?.source?.startsWith('git+') === true) {
    const commit = pins[0].source.slice(pins[0].source.lastIndexOf('#') + 1);
    const mine = ownCommit(resolve(dirname(new URL(import.meta.url).pathname), '..'));
    if (mine === undefined || mine !== commit) {
      differs = true;
      process.stderr.write(`${lockPath}: CK-20 Cargo.lock pins polyspec-binding-core at the commit ${commit}, not ${mine ?? 'the commit of this binding, which is unknown'} (L-2)\n`);
    }
  }
  // CK-65 (GN-5): a core with fault injection points has itself as a dev-dependency with fault-test, so cargo test of
  // the core without flags arms them, in every repository alike.
  if ((checked.faults ?? []).length > 0) {
    const coreDir = join(root, checked.core.path);
    const own = (manifest['dev-dependencies'] ?? {})[checked.core.crate];
    const entry = typeof own === 'object' && own !== null ? (own as { path?: unknown; features?: unknown }) : undefined;
    const itself = typeof entry?.path === 'string' && resolve(coreDir, entry.path) === resolve(coreDir);
    const armed = Array.isArray(entry?.features) && entry.features.includes('fault-test');
    if (!itself || !armed) {
      differs = true;
      process.stderr.write(`${join(coreDir, 'Cargo.toml')}: CK-65 the core ${checked.core.crate} has fault injection points, but its [dev-dependencies] name no ${checked.core.crate} = { path = ".", features = ["fault-test"] }, so cargo test without flags does not arm them (GN-5)\n`);
    }
  }
  // CK-71 (GN-3f): the core names the licence that the manifests of its binding packages carry.
  if (coreLicense === undefined) {
    differs = true;
    process.stderr.write(`${join(root, checked.core.path, 'Cargo.toml')}: CK-71 the core ${checked.core.crate} names no license, which every manifest of its binding packages carries (GN-3f)\n`);
  }
  // CK-91 (GN-15i): the release profile that builds the Go static library turns on no LTO, which puts the standard
  // library into the one object of the library, so that two such libraries do not link in one Go program.
  if (checked.targets.includes('go')) {
    for (const file of [join(root, 'Cargo.toml'), join(root, '.cargo/config.toml')]) {
      if (!existsSync(file)) continue;
      let lto: unknown;
      try {
        lto = (parse(readFileSync(file, 'utf8')) as { profile?: { release?: { lto?: unknown } } }).profile?.release?.lto;
      } catch {
        // not TOML: Cargo names the file
        continue;
      }
      if (lto === undefined || lto === false || lto === 'off') continue;
      differs = true;
      process.stderr.write(`${file}: CK-91 [profile.release] turns on LTO (lto = ${JSON.stringify(lto)}), which puts the standard library into the one object of the Go static library, so that a Go program cannot link it with the static library of another repository (GN-15i)\n`);
    }
  }
  // CK-70: the check of a release reports each dependency line of the core on another library in a development form.
  if (options.has('--release')) {
    for (const message of releaseFindings(checked, coreDependencies, casePointLibraries(checked, caseFiles), foreign as ReadonlyMap<string, Contract>)) {
      differs = true;
      process.stderr.write(`${join(root, checked.core.path, 'Cargo.toml')}: CK-70 ${message}\n`);
    }
    // The line on polyspec-binding-core of each tracked binding crate, as the repository holds it.
    for (const path of [...tracked.files.keys()].filter((file) => file.endsWith('/Cargo.toml'))) {
      let message: string | undefined;
      try {
        message = existsSync(join(root, path)) ? bindingCoreFinding(parse(readFileSync(join(root, path), 'utf8'))) : undefined;
      } catch {
        // not TOML: CK-19 reports the file
      }
      if (message !== undefined) {
        differs = true;
        process.stderr.write(`${join(root, path)}: CK-70 ${message}\n`);
      }
    }
  }
  const names = failedChecks.has('CK-18');
  if (names) process.stderr.write(`${contractPath}: CK-19 did not run: it compares with what binding scaffold writes, which needs the package names of CK-18\n`);
  // GN-3e: a package that scaffold cannot write is a finding with its reason.
  for (const { path, message } of names ? [] : tracked.refused) {
    differs = true;
    process.stderr.write(`${join(root, path)}: CK-19 binding scaffold does not write it: ${message} (L-2)\n`);
  }
  for (const [path, text] of names ? [] : tracked.files) {
    const full = join(root, path);
    const found = existsSync(full) ? readFileSync(full, 'utf8') : undefined;
    if (found !== text) {
      differs = true;
      process.stderr.write(`${full}: CK-19 ${found === undefined ? 'is missing' : 'differs from what binding scaffold writes'} (L-2)\n`);
    }
  }
  // L-2a: a host package's manifest holds what its native module and its release need (GN-3b).
  for (const requirement of names ? [] : hostRequirements(checked, parse, coreLicense, foreign as ReadonlyMap<string, Contract>)) {
    const full = join(root, requirement.path);
    let found: unknown;
    try {
      found = existsSync(full) ? requirement.found(readFileSync(full, 'utf8')) : undefined;
    } catch {
      found = undefined;
    }
    if (!isDeepStrictEqual(found, requirement.want)) {
      differs = true;
      process.stderr.write(`${full}: CK-19 ${requirement.item} is ${found === undefined ? 'missing' : JSON.stringify(found)}, not ${JSON.stringify(requirement.want)}, which the native module and its release need (L-2a, GN-3f)\n`);
    }
  }
  process.exit(differs || findings.length > 0 ? 1 : 0);
}

if (command === 'scaffold') {
  // --out writes the same files under another directory, as for generate.
  const target = resolve(options.get('--out') ?? root);
  for (const [path, text] of tracked.files) {
    mkdirSync(dirname(join(target, path)), { recursive: true });
    writeFileSync(join(target, path), text);
  }
  // GN-3e: a package that cannot be written is named with its reason after the others are written.
  for (const { path, message } of tracked.refused) process.stderr.write(`binding: ${path}: not written: ${message}\n`);
  // GN-3e: without the contracts that Cargo finds, the libraries that only a callback unit of another library names are
  // not known, so the packages are written with the libraries that the contract itself names and the run fails.
  if (metadataFailure !== undefined) process.stderr.write(`binding: the contracts of the libraries that the contract names are not all found, so the packages are written without the libraries that only a callback unit of another library names (GN-3e): ${metadataFailure}\n`);
  process.exit(tracked.refused.length > 0 || metadataFailure !== undefined ? 1 : 0);
}

const lib = { name: manifest.lib?.name ?? core.name.replaceAll('-', '_') };
// GN-1b: --target generates those targets of the contract alone and writes their directories; the others are kept.
const targets = options.get('--target')?.split(',') as Lang[] | undefined ?? checked.targets;
const notTargets = targets.filter((target) => !checked.targets.includes(target));
if (notTargets.length > 0) usage(`--target names ${notTargets.join(', ')}, which the contract does not name in targets`);
// GN-1c: each target is generated by itself, so a target that the generator refuses does not stop another; the files of
// every target that refuses nothing are written, and each refused target is named with its items (G-4).
const files: ReturnType<typeof generate> = new Map();
const refused: { target: Lang; refusals: string[] }[] = [];
for (const target of targets) {
  try {
    for (const [path, text] of generate({ contract: checked, version, coreLib: lib.name, caseFiles, foreign: foreign as ReadonlyMap<string, Contract>, targets: [target] })) files.set(path, text);
  } catch (error) {
    refused.push({ target, refusals: sentences(error) });
  }
}
const out = resolve(options.get('--out') ?? root);
const owned = generatedDirs(checked);
const goDir = goModuleDir(checked);
const ownedFile = (path: string): boolean => path.startsWith(`${goDir}/`) && isGoGenerated(path);
for (const path of files.keys()) {
  if (!owned.some((dir) => path.startsWith(`${dir}/`)) && !ownedFile(path)) fail(`internal: ${path} is outside the generated directories`);
}
// Each owned directory of a target is written whole into a staging directory and then renamed into place, so a reader
// never sees a part of it and no file of an earlier generation stays.
for (const dir of owned) {
  if (![...files.keys()].some((path) => path.startsWith(`${dir}/`))) continue;
  const staging = join(out, `${dir}.staging`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  for (const [path, text] of files) {
    if (!path.startsWith(`${dir}/`)) continue;
    const target = join(staging, path.slice(dir.length + 1));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  rmSync(join(out, dir), { recursive: true, force: true });
  renameSync(staging, join(out, dir));
}
// L-1: the tracked Go files zz_generated_*.go. Every one under the Go module is removed, so none of an earlier generation
// stays, and the new ones are written; the other files of the module (go.mod, host, tests) are not touched.
if (targets.includes('go') && !refused.some((r) => r.target === 'go')) {
  const remove = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) remove(path);
      else if (isGoGenerated(entry.name)) rmSync(path);
    }
  };
  remove(join(out, goDir));
  for (const [path, text] of files) {
    if (!ownedFile(path)) continue;
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), text);
  }
}
// G-4: a refused target fails the generation after the other targets are written, each item on its own line.
if (refused.length > 0) {
  const lines = refused.map(({ target, refusals }) => `${target}: not generated (G-4), ${refusals.length} item${refusals.length === 1 ? '' : 's'}:\n${refusals.map((line) => `  ${line}\n`).join('')}`);
  const written = targets.filter((target) => !refused.some((r) => r.target === target));
  fail(`${lines.join('')}${written.length === 0 ? 'no target was generated' : `generated: ${written.join(', ')}`}`);
}
