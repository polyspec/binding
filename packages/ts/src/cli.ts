#!/usr/bin/env node
// bindgen check <interface.json> | generate [--root <repository>] [--out <directory>]
//
// check: the contract check of a contract (I-1, I-2), with the contracts of the libraries it names.
// generate: the checked contract's bindings, written into the directories that bindgen owns (L-1). --out writes the
// same files under another directory, for the comparison of I-5.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { checkContract } from './check.ts';
import type { Contract } from './contract.ts';
import { GENERATED_DIRS, generate } from './generate/index.ts';

// The libraries that a contract names: in its types, its implements and recognize references, its value type owners
// and its error kinds.
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
  process.stderr.write(`bindgen: ${message}\nusage: bindgen check <interface.json> | bindgen generate [--root <repository>] [--out <directory>]\n`);
  process.exit(2);
}

const [command, ...rest] = process.argv.slice(2);
let contractPath: string;
let root: string;
const options = new Map<string, string>();
if (command === 'check') {
  // bindgen check <interface.json>: the contract check, with the contracts of the libraries it names (T-3, E-1b).
  const [path, ...extra] = rest;
  if (path === undefined || extra.length > 0) usage('check takes the path of one interface.json');
  contractPath = resolve(path);
  root = dirname(contractPath);
} else {
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (key === undefined || value === undefined || !['--root', '--out'].includes(key)) usage(`unknown argument ${key ?? ''}`);
    options.set(key, value);
  }
  root = resolve(options.get('--root') ?? '.');
  contractPath = join(root, 'packages/rust/interface.json');
}
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as unknown;
const findings = checkContract(contract, { dependencies: dependencies(contract, dirname(contractPath)) });
if (findings.length > 0) {
  for (const f of findings) process.stderr.write(`${contractPath}#${f.path}: ${f.check} ${f.message}\n`);
  process.exit(1);
}
if (command === 'check') process.exit(0);
if (command !== 'generate') usage(`unknown command ${command ?? ''}`);

const checked = contract as Contract;
// The version and the library name of the core crate from its manifest (T-3). The manifest is read as TOML rather than
// through cargo metadata, because the workspace names the generated members, which do not exist before generation.
const manifest = parse(readFileSync(join(root, checked.core.path, 'Cargo.toml'), 'utf8')) as {
  package?: { name?: string; version?: string };
  lib?: { name?: string };
};
const core = manifest.package;
if (core?.name !== checked.core.crate || typeof core.version !== 'string') usage(`${checked.core.path}/Cargo.toml is not the crate ${checked.core.crate}`);
const lib = { name: manifest.lib?.name ?? core.name.replaceAll('-', '_') };
const caseFiles = new Map<string, unknown>();
for (const kase of checked.cases) {
  if (!caseFiles.has(kase.file)) caseFiles.set(kase.file, JSON.parse(readFileSync(join(root, kase.file), 'utf8')));
}
const files = generate({ contract: checked, version: core.version, coreLib: lib.name, caseFiles });

const out = resolve(options.get('--out') ?? root);
// Each owned directory is written whole into a staging directory and then renamed into place, so a reader never sees a
// part of it and no file of an earlier generation stays.
for (const dir of GENERATED_DIRS) {
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
for (const path of files.keys()) {
  if (!GENERATED_DIRS.some((dir) => path.startsWith(`${dir}/`))) usage(`internal: ${path} is outside the generated directories`);
}
