#!/usr/bin/env node
// bindgen check | generate [--root <repository>] [--out <directory>]
//
// check: the contract check of packages/rust/interface.json (I-1).
// generate: the checked contract's bindings, written into the directories that bindgen owns (L-1). --out writes the
// same files under another directory, for the comparison of I-5.

import { mkdirSync, readFileSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'smol-toml';
import { checkContract } from './check.ts';
import type { Contract } from './contract.ts';
import { GENERATED_DIRS, generate } from './generate/index.ts';

function usage(message: string): never {
  process.stderr.write(`bindgen: ${message}\nusage: bindgen check|generate [--root <repository>] [--out <directory>]\n`);
  process.exit(2);
}

const [command, ...rest] = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < rest.length; i += 2) {
  const key = rest[i];
  const value = rest[i + 1];
  if (key === undefined || value === undefined || !['--root', '--out'].includes(key)) usage(`unknown argument ${key ?? ''}`);
  options.set(key, value);
}
const root = resolve(options.get('--root') ?? '.');
const contractPath = join(root, 'packages/rust/interface.json');
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as unknown;
const findings = checkContract(contract);
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
