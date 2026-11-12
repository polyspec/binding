// generate(): every generated file of a repository from its checked contract, as relative paths and texts. The result
// depends only on its inputs: the contract, the case files, the core version and binding itself (I-5).

import type { Contract } from '../contract.ts';
import { go } from './go.ts';
import { buildModel, forLanguage, Unsupported } from './model.ts';
import { wasm } from './wasm.ts';
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
  ['packages/php-ext/generated', 'packages/python/generated', 'packages/ts/generated', 'packages/go/internal/ffi/generated', 'packages/ts/wasm/generated'].map((dir) => place(contract, dir));

// L-1: the Go module holds the tracked generated files zz_generated_*.go beside hand-written folders (host, tests), so
// binding owns those files rather than a directory: a generation removes every one of them under the Go module and
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
  const model = buildModel(inputs.contract, inputs.version, inputs.coreLib, cases, inputs.foreign);
  // T-2: map<T> is generated for Go only so far; a contract with a map and another target is refused by name (G-4).
  const hasMap = (type: unknown): boolean => JSON.stringify(type).includes('"map"');
  const withMap = [
    ...model.functions.flatMap((fn) => [...fn.params.map((p) => [fn.member.id, p.type] as const), [fn.member.id, fn.returns] as const]),
    ...model.records.flatMap((unit) => (unit.fields ?? []).map((f) => [unit.id, f.type] as const)),
  ].find(([, type]) => hasMap(type));
  const others = inputs.contract.targets.filter((target) => target !== 'go');
  if (withMap !== undefined && others.length > 0) throw new Unsupported(`${withMap[0]}: map<T> is generated for Go only, not for ${others.join(', ')} yet`);
  const files: Files = new Map();
  const targets = inputs.contract.targets;
  if (targets.includes('python')) python(forLanguage(model, 'python'), files);
  if (targets.includes('node')) node(forLanguage(model, 'node'), files);
  if (targets.includes('php')) php(forLanguage(model, 'php'), files);
  if (targets.includes('go')) go(model, files);
  if (targets.includes('wasm')) wasm(forLanguage(model, 'wasm'), files);
  return new Map([...placed(inputs.contract, files).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
