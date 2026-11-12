// generate(): every generated file of a repository from its checked contract, as relative paths and texts. The result
// depends only on its inputs: the contract, the case files, the core version and bindgen itself (I-5).

import type { Contract } from '../contract.ts';
import { go } from './go.ts';
import { buildModel } from './model.ts';
import { node } from './node.ts';
import { php } from './php.ts';
import { python } from './python.ts';
import { place, placed } from './packages.ts';
import type { Files } from './text.ts';

export interface Inputs {
  contract: Contract;
  // The version of the core crate, which every generated package carries.
  version: string;
  // The library name of the core crate.
  coreLib: string;
  // The case files that the contract's cases name, by their path (K-1).
  caseFiles: ReadonlyMap<string, unknown>;
}

// The directories that bindgen owns and writes whole (L-1); the tracked thin packages around them are written by
// `bindgen scaffold` (packages.ts).
export const generatedDirs = (contract: Contract): string[] =>
  ['packages/php-ext/generated', 'packages/python/generated', 'packages/ts/generated', 'packages/go/internal/ffi/generated'].map((dir) => place(contract, dir));

// L-1: the Go module holds the tracked generated files zz_generated_*.go beside hand-written folders (host, tests), so
// bindgen owns those files rather than a directory: a generation removes every one of them under the Go module and
// writes its own.
export const goModuleDir = (contract: Contract): string => place(contract, 'packages/go');
export const isGoGenerated = (path: string): boolean => /(^|\/)zz_generated_[^/]*\.go$/.test(path);

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
  const targets = inputs.contract.targets;
  if (targets.includes('python')) python(model, files);
  if (targets.includes('node')) node(model, files);
  if (targets.includes('php')) php(model, files);
  if (targets.includes('go')) go(model, files);
  return new Map([...placed(inputs.contract, files).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
