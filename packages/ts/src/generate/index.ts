// generate(): every generated file of a repository from its checked contract, as relative paths and texts. The result
// depends only on its inputs: the contract, the case files, the core version and bindgen itself (I-5).

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Contract } from '../contract.ts';
import { buildModel } from './model.ts';
import { node } from './node.ts';
import { php } from './php.ts';
import { python } from './python.ts';
import { type Files, header } from './text.ts';

export interface Inputs {
  contract: Contract;
  // The version of the core crate, which every generated package carries.
  version: string;
  // The library name of the core crate.
  coreLib: string;
  // The case files that the contract's cases name, by their path (K-1).
  caseFiles: ReadonlyMap<string, unknown>;
}

// The directories that bindgen owns and writes whole (L-1); nothing else in the repository is written.
export const GENERATED_DIRS = [
  'packages/rust/generated/bindgen-core',
  'packages/php-ext/generated',
  'packages/python/generated',
  'packages/ts/generated',
] as const;

const CORE_SOURCE = new URL('../../../core/rust/', import.meta.url);

// The crate bindgen_core, copied from this bindgen into the repository, so that the version of the runtime support is
// the version of the generator that a lock pins (L-3).
function vendorCore(files: Files): void {
  const root = CORE_SOURCE.pathname;
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
    );
  for (const path of [...walk(join(root, 'src')), ...walk(join(root, 'tests/vectors'))].sort()) {
    files.set(`packages/rust/generated/bindgen-core/${relative(root, path)}`, readFileSync(path, 'utf8'));
  }
  // The copy is a member of the repository's workspace, so its own [workspace] table goes.
  const manifest = readFileSync(join(root, 'Cargo.toml'), 'utf8').replace(/\n\[workspace\]\n?$/, '\n');
  files.set('packages/rust/generated/bindgen-core/Cargo.toml', `${header('#')}\n${manifest}`);
}

export function generate(inputs: Inputs): Files {
  const cases = new Map<string, unknown[]>();
  for (const kase of inputs.contract.cases) {
    const file = inputs.caseFiles.get(kase.file) as Record<string, unknown> | undefined;
    const group = file?.[kase.group];
    if (!Array.isArray(group)) throw new Error(`${kase.file} has no group ${kase.group}`);
    cases.set(kase.member, [...(cases.get(kase.member) ?? []), ...group]);
  }
  const model = buildModel(inputs.contract, inputs.version, inputs.coreLib, cases);
  const files: Files = new Map();
  vendorCore(files);
  const targets = inputs.contract.targets;
  if (targets.includes('python')) python(model, files);
  if (targets.includes('node')) node(model, files);
  if (targets.includes('php')) php(model, files);
  return new Map([...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
