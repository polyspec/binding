// generate(): every generated file of a repository from its checked contract, as relative paths and texts. The result
// depends only on its inputs: the contract, the case files, the core version and binding itself (I-5).

import type { Contract } from '../contract.ts';
import { buildModel, forLanguage } from './model.ts';
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
  // The contracts of the libraries that the contract names, read from the packages Cargo resolved (T-3).
  foreign?: ReadonlyMap<string, Contract>;
}

// The directories that binding owns and writes whole (L-1); the tracked thin packages around them are written by
// `binding scaffold` (packages.ts).
export const generatedDirs = (contract: Contract): string[] =>
  ['packages/php-ext/generated', 'packages/python/generated', 'packages/ts/generated'].map((dir) => place(contract, dir));

export function generate(inputs: Inputs): Files {
  const cases = new Map<string, unknown[]>();
  for (const kase of inputs.contract.cases) {
    const file = inputs.caseFiles.get(kase.file) as Record<string, unknown> | undefined;
    const group = file?.[kase.group];
    if (!Array.isArray(group)) throw new Error(`${kase.file} has no group ${kase.group}`);
    cases.set(kase.member, [...(cases.get(kase.member) ?? []), ...group]);
  }
  const model = buildModel(inputs.contract, inputs.version, inputs.coreLib, cases, inputs.foreign);
  const files: Files = new Map();
  const targets = inputs.contract.targets;
  if (targets.includes('python')) python(forLanguage(model, 'python'), files);
  if (targets.includes('node')) node(forLanguage(model, 'node'), files);
  if (targets.includes('php')) php(forLanguage(model, 'php'), files);
  return new Map([...placed(inputs.contract, files).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
