#!/usr/bin/env node
// bindgen check <interface.json>
//   The contract check (I-1, I-2), with the contracts of the libraries the contract names, and the comparison of the
//   tracked binding packages with what `bindgen scaffold` writes (L-2).
// bindgen scaffold [--root <repository> | --contract <interface.json>]
//   Writes the tracked thin package of each binding (L-2): its Cargo manifest, its entry file and its language manifest.
// bindgen generate [--root <repository> | --contract <interface.json>] [--out <directory>]
//   Writes the generated sources into the directories that bindgen owns (L-1). --out writes the same files under another
//   directory, for the comparison of I-5.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { checkContract } from './check.ts';
import type { Contract } from './contract.ts';
import { generate, generatedDirs, goModuleDir, isGoGenerated } from './generate/index.ts';
import { Unsupported } from './generate/model.ts';
import { trackedPackages } from './generate/packages.ts';

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
  const metadata = JSON.parse(
    execFileSync('cargo', ['metadata', '--format-version', '1', '--manifest-path', join(crateDir, 'Cargo.toml')], { encoding: 'utf8' }),
  ) as { packages: { name: string; manifest_path: string }[] };
  for (const library of wanted) {
    const crate = metadata.packages.find((p) => p.name === `polyspec-${library}`);
    if (crate === undefined) continue;
    found.set(library, JSON.parse(readFileSync(join(dirname(crate.manifest_path), 'interface.json'), 'utf8')));
  }
  return found;
}

function usage(message: string): never {
  process.stderr.write(`bindgen: ${message}\nusage: bindgen check <interface.json> | bindgen scaffold|generate [--root <repository> | --contract <interface.json>] [--out <directory>]\n`);
  process.exit(2);
}


const [command, ...rest] = process.argv.slice(2);
if (command !== 'check' && command !== 'scaffold' && command !== 'generate') usage(`unknown command ${command ?? ''}`);
const options = new Map<string, string>();
let contractPath: string;
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
const findings = checkContract(contract, { dependencies: dependencies(contract, dirname(contractPath)) });
if (findings.length > 0) {
  for (const f of findings) process.stderr.write(`${contractPath}#${f.path}: ${f.check} ${f.message}\n`);
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
};
const core = manifest.package;
let version = core?.version;
if (typeof version === 'object' && version.workspace === true) {
  const workspace = parse(readFileSync(join(root, 'Cargo.toml'), 'utf8')) as { workspace?: { package?: { version?: string } } };
  version = workspace.workspace?.package?.version;
}
if (core?.name !== checked.core.crate || typeof version !== 'string') usage(`${checked.core.path}/Cargo.toml is not the crate ${checked.core.crate} with a version`);
const tracked = trackedPackages(checked, version);

if (command === 'check') {
  // L-2: each tracked file of the binding packages is what bindgen scaffold writes.
  let differs = false;
  // CK-20: the polyspec-bindgen-core that the repository's Cargo.lock pins is of the version of this bindgen, because
  // one release gives both and the generated code is written for that crate (L-2).
  const own = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  const lockPath = join(root, 'Cargo.lock');
  const lock = existsSync(lockPath) ? (parse(readFileSync(lockPath, 'utf8')) as { package?: { name: string; version: string }[] }) : undefined;
  const pinned = (lock?.package ?? []).filter((p) => p.name === 'polyspec-bindgen-core').map((p) => p.version);
  if (pinned.length !== 1 || pinned[0] !== own) {
    differs = true;
    const found = lock === undefined ? 'there is no Cargo.lock' : pinned.length === 0 ? 'Cargo.lock pins no polyspec-bindgen-core' : `Cargo.lock pins polyspec-bindgen-core ${pinned.join(', ')}`;
    process.stderr.write(`${lockPath}: CK-20 ${found}, not ${own}, the version of this bindgen (L-2)\n`);
  }
  for (const [path, text] of tracked) {
    const full = join(root, path);
    const found = existsSync(full) ? readFileSync(full, 'utf8') : undefined;
    if (found !== text) {
      differs = true;
      process.stderr.write(`${full}: CK-19 ${found === undefined ? 'is missing' : 'differs from what bindgen scaffold writes'} (L-2)\n`);
    }
  }
  process.exit(differs ? 1 : 0);
}

if (command === 'scaffold') {
  for (const [path, text] of tracked) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  process.exit(0);
}

const lib = { name: manifest.lib?.name ?? core.name.replaceAll('-', '_') };
const caseFiles = new Map<string, unknown>();
for (const kase of checked.cases) {
  if (!caseFiles.has(kase.file)) caseFiles.set(kase.file, JSON.parse(readFileSync(join(root, kase.file), 'utf8')));
}
let files: ReturnType<typeof generate>;
try {
  files = generate({ contract: checked, version, coreLib: lib.name, caseFiles });
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
