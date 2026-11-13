#!/usr/bin/env node
// binding check <interface.json> [--release]
//   The contract check (I-1, I-2), with the contracts of the libraries the contract names, and the comparison of the
//   tracked binding packages with what `binding scaffold` writes (L-2). --release adds the check of a release (CK-70).
// binding scaffold [--root <repository> | --contract <interface.json>]
//   Writes the tracked thin package of each binding (L-2): its Cargo manifest, its entry file and its language manifest.
// binding generate [--root <repository> | --contract <interface.json>] [--out <directory>]
//   Writes the generated sources into the directories that binding owns (L-1). --out writes the same files under another
//   directory, for the comparison of I-5.

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
import { casePointLibraries, componentBase, hostRequirements, releaseFindings, type Tracked, trackedResult } from './generate/packages.ts';

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
function dependencies(contract: unknown, crateDir: string): Map<string, unknown> {
  const wanted = libraries(contract);
  const found = new Map<string, unknown>();
  if (wanted.size === 0) return found;
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
      if (run.status !== 0) fail(`cargo metadata failed with status ${String(run.status)}`);
    } finally {
      closeSync(fd);
    }
    metadata = JSON.parse(readFileSync(out, 'utf8')) as typeof metadata;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  for (const library of wanted) {
    const crate = metadata.packages.find((p) => p.name === `polyspec-${library}`);
    if (crate === undefined) continue;
    found.set(library, JSON.parse(readFileSync(join(dirname(crate.manifest_path), 'interface.json'), 'utf8')));
  }
  return found;
}

// GN-1c: a failure that is no error of the command line, such as a refused target or a manifest that is not the crate
// of the contract, has status 1 and no usage line; only an error of the command line prints the usage, with status 2.
function fail(message: string): never {
  process.stderr.write(`binding: ${message}\n`);
  process.exit(1);
}

function usage(message: string): never {
  process.stderr.write(`binding: ${message}\nusage: binding check <interface.json> [--release] | binding scaffold|generate [--root <repository> | --contract <interface.json>] [--out <directory>] [--target <target>[,<target>...]]\n`);
  process.exit(2);
}

// GN-1c: the sentences of a failure that a contract, a case file or a manifest causes, which the generator throws as a
// refusal or as an Error with its sentence. Any other error is a defect of binding and keeps its stack trace.
function sentences(error: unknown): string[] {
  if (error instanceof Unsupported) return error.refusals;
  if (error instanceof Error && error.constructor === Error && !error.message.startsWith('internal:')) return [error.message];
  throw error;
}

const [command, ...rest] = process.argv.slice(2);
if (command !== 'check' && command !== 'scaffold' && command !== 'generate') usage(`unknown command ${command ?? ''}`);
const options = new Map<string, string>();
let contractPath: string;
if (command === 'check') {
  // CK-70: --release, which the tool that builds a release passes, adds the check of a release.
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
  package?: { name?: string; version?: string | { workspace?: boolean } };
  lib?: { name?: string };
  dependencies?: Record<string, unknown>;
  'dev-dependencies'?: Record<string, unknown>;
};
const core = manifest.package;
let version = core?.version;
if (typeof version === 'object' && version.workspace === true) {
  const workspace = parse(readFileSync(join(root, 'Cargo.toml'), 'utf8')) as { workspace?: { package?: { version?: string } } };
  version = workspace.workspace?.package?.version;
}
if (core?.name !== checked.core.crate || typeof version !== 'string') fail(`${checked.core.path}/Cargo.toml is not the crate ${checked.core.crate} with a version`);
// G-5: the binding crates turn on fault-test of each core whose fault injection points a case arms.
// GN-15f: go.mod requires the Go module of each library whose records the contract names, so scaffold of a contract
// with the target go reads the contracts of the libraries it names: the contract of a path dependency of the core is
// the interface.json of that path, which needs no Cargo, and one of any other dependency is found through Cargo, as
// generate finds it.
function scaffolded(): Map<string, unknown> {
  const found = new Map<string, unknown>();
  if (!checked.targets.includes('go')) return found;
  let others = false;
  for (const library of libraries(contract)) {
    const spec = manifest.dependencies?.[`polyspec-${library}`];
    const path = typeof spec === 'object' && spec !== null ? (spec as { path?: unknown }).path : undefined;
    if (typeof path === 'string') {
      // A contract that is not there is not found: the Go module, which alone reads it, is then named as not written
      // (GN-3e), and the packages of the other targets are written.
      const file = join(root, checked.core.path, path, 'interface.json');
      if (existsSync(file)) found.set(library, JSON.parse(readFileSync(file, 'utf8')));
    }
    else others = true;
  }
  if (others) for (const [library, other] of dependencies(contract, join(root, checked.core.path))) if (!found.has(library)) found.set(library, other);
  return found;
}
const coreDependencies = new Map(Object.entries(manifest.dependencies ?? {}));
// GN-3e: the tracked packages, which check and scaffold read and generate does not. A package that cannot be written is
// named with its reason, and so is a failure of the whole that the contract, a case file or a manifest causes.
function trackedOf(): Tracked {
  try {
    return trackedResult(checked, version as string, coreDependencies, casePointLibraries(checked, caseFiles), (command === 'scaffold' ? scaffolded() : foreign) as ReadonlyMap<string, Contract>, caseTestTargets({ contract: checked, caseFiles, foreign: foreign as ReadonlyMap<string, Contract> }));
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
  // CK-70: the check of a release reports each dependency line of the core on another library in a development form.
  if (options.has('--release')) {
    for (const message of releaseFindings(checked, coreDependencies, casePointLibraries(checked, caseFiles))) {
      differs = true;
      process.stderr.write(`${join(root, checked.core.path, 'Cargo.toml')}: CK-70 ${message}\n`);
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
  for (const requirement of names ? [] : hostRequirements(checked, parse)) {
    const full = join(root, requirement.path);
    let found: unknown;
    try {
      found = existsSync(full) ? requirement.found(readFileSync(full, 'utf8')) : undefined;
    } catch {
      found = undefined;
    }
    if (!isDeepStrictEqual(found, requirement.want)) {
      differs = true;
      process.stderr.write(`${full}: CK-19 ${requirement.item} is ${found === undefined ? 'missing' : JSON.stringify(found)}, not ${JSON.stringify(requirement.want)}, which the native module and its release need (L-2a)\n`);
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
  process.exit(tracked.refused.length > 0 ? 1 : 0);
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
