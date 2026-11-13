#!/usr/bin/env node
// binding check <interface.json>
//   The contract check (I-1, I-2), with the contracts of the libraries the contract names, and the comparison of the
//   tracked binding packages with what `binding scaffold` writes (L-2).
// binding scaffold [--root <repository> | --contract <interface.json>]
//   Writes the tracked thin package of each binding (L-2): its Cargo manifest, its entry file and its language manifest.
// binding generate [--root <repository> | --contract <interface.json>] [--out <directory>]
//   Writes the generated sources into the directories that binding owns (L-1). --out writes the same files under another
//   directory, for the comparison of I-5.

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { checkContract } from './check.ts';
import type { Contract } from './contract.ts';
import { generate, generatedDirs, goModuleDir, isGoGenerated } from './generate/index.ts';
import { Unsupported } from './generate/model.ts';
import { hostRequirements, trackedPackages } from './generate/packages.ts';

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
      if (run.status !== 0) usage(`cargo metadata failed with status ${String(run.status)}`);
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

function usage(message: string): never {
  process.stderr.write(`binding: ${message}\nusage: binding check <interface.json> | binding scaffold|generate [--root <repository> | --contract <interface.json>] [--out <directory>]\n`);
  process.exit(2);
}


const [command, ...rest] = process.argv.slice(2);
if (command !== 'check' && command !== 'scaffold' && command !== 'generate') usage(`unknown command ${command ?? ''}`);
const options = new Map<string, string>();
let contractPath: string;
// CK-20: the commit that this binding was checked out at: the HEAD of its git checkout, or the commit that the npm
// lock of the project that installed it from git resolved.
function ownCommit(): string | undefined {
  const here = dirname(new URL(import.meta.url).pathname);
  // The checkout of binding itself (packages/ts/src is three levels below its root), not a project that holds it in
  // node_modules.
  const top = spawnSync('git', ['-C', here, 'rev-parse', '--show-toplevel', 'HEAD'], { encoding: 'utf8' });
  const [toplevel, head] = top.status === 0 ? top.stdout.trim().split('\n') : [];
  if (toplevel !== undefined && resolve(toplevel) === resolve(here, '..', '..', '..')) return head;
  for (let dir = here; dir !== dirname(dir); dir = dirname(dir)) {
    const npmLock = join(dir, 'package-lock.json');
    if (!existsSync(npmLock)) continue;
    const packages = (JSON.parse(readFileSync(npmLock, 'utf8')) as { packages?: Record<string, { resolved?: string }> }).packages ?? {};
    const resolved = packages['node_modules/@polyspec/binding']?.resolved;
    if (resolved?.startsWith('git+') === true) return resolved.slice(resolved.lastIndexOf('#') + 1);
  }
  return undefined;
}

if (command === 'check') {
  const [path, ...extra] = rest;
  if (path === undefined || extra.length > 0) usage('check takes the path of one interface.json');
  contractPath = resolve(path);
} else {
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (key === undefined || value === undefined || !['--root', '--contract', '--out'].includes(key)) usage(`unknown argument ${key ?? ''}`);
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
// longer resolve (the core crate was renamed), and that must not stop the rewrite.
const foreign = command === 'scaffold' ? new Map<string, unknown>() : dependencies(contract, dirname(contractPath));
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
        caseFiles.set(row.file, JSON.parse(readFileSync(join(top, row.file), 'utf8')));
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
};
const core = manifest.package;
let version = core?.version;
if (typeof version === 'object' && version.workspace === true) {
  const workspace = parse(readFileSync(join(root, 'Cargo.toml'), 'utf8')) as { workspace?: { package?: { version?: string } } };
  version = workspace.workspace?.package?.version;
}
if (core?.name !== checked.core.crate || typeof version !== 'string') usage(`${checked.core.path}/Cargo.toml is not the crate ${checked.core.crate} with a version`);
const tracked = trackedPackages(checked, version, new Map(Object.entries(manifest.dependencies ?? {})));

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
    const mine = ownCommit();
    if (mine === undefined || mine !== commit) {
      differs = true;
      process.stderr.write(`${lockPath}: CK-20 Cargo.lock pins polyspec-binding-core at the commit ${commit}, not ${mine ?? 'the commit of this binding, which is unknown'} (L-2)\n`);
    }
  }
  const names = failedChecks.has('CK-18');
  if (names) process.stderr.write(`${contractPath}: CK-19 did not run: it compares with what binding scaffold writes, which needs the package names of CK-18\n`);
  for (const [path, text] of names ? [] : tracked) {
    const full = join(root, path);
    const found = existsSync(full) ? readFileSync(full, 'utf8') : undefined;
    if (found !== text) {
      differs = true;
      process.stderr.write(`${full}: CK-19 ${found === undefined ? 'is missing' : 'differs from what binding scaffold writes'} (L-2)\n`);
    }
  }
  // L-2a: a host package's manifest holds what its native module needs.
  for (const requirement of names ? [] : hostRequirements(checked, parse)) {
    const full = join(root, requirement.path);
    let found: unknown;
    try {
      found = existsSync(full) ? requirement.found(readFileSync(full, 'utf8')) : undefined;
    } catch {
      found = undefined;
    }
    if (found !== requirement.want) {
      differs = true;
      process.stderr.write(`${full}: CK-19 ${requirement.item} is ${found === undefined ? 'missing' : JSON.stringify(found)}, not ${JSON.stringify(requirement.want)}, which the native module needs (L-2a)\n`);
    }
  }
  process.exit(differs || findings.length > 0 ? 1 : 0);
}

if (command === 'scaffold') {
  // --out writes the same files under another directory, as for generate.
  const target = resolve(options.get('--out') ?? root);
  for (const [path, text] of tracked) {
    mkdirSync(dirname(join(target, path)), { recursive: true });
    writeFileSync(join(target, path), text);
  }
  process.exit(0);
}

const lib = { name: manifest.lib?.name ?? core.name.replaceAll('-', '_') };
let files: ReturnType<typeof generate>;
try {
  files = generate({ contract: checked, version, coreLib: lib.name, caseFiles, foreign: foreign as ReadonlyMap<string, Contract> });
} catch (error) {
  // G-4: an item that the generator cannot generate yet is named, and nothing is written.
  if (error instanceof Unsupported) usage(`not generated (G-4): ${error.message}`);
  throw error;
}
const out = resolve(options.get('--out') ?? root);
const owned = generatedDirs(checked);
const goDir = goModuleDir(checked);
const ownedFile = (path: string): boolean => path.startsWith(`${goDir}/`) && isGoGenerated(path);
for (const path of files.keys()) {
  if (!owned.some((dir) => path.startsWith(`${dir}/`)) && !ownedFile(path)) usage(`internal: ${path} is outside the generated directories`);
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
if (checked.targets.includes('go')) {
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
