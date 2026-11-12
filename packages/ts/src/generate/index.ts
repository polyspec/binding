// generate(): every generated file of a repository from its checked contract, as relative paths and texts. The result
// depends only on its inputs: the contract, the case files, the core version and bindgen itself (I-5).

import type { Contract } from '../contract.ts';
import { buildModel } from './model.ts';
import { node } from './node.ts';
import { php } from './php.ts';
import { python } from './python.ts';
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
export const GENERATED_DIRS = [
  'packages/php-ext/generated',
  'packages/python/generated',
  'packages/ts/generated',
] as const;

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
  return new Map([...files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
