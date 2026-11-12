// generate(): every generated file of a repository from its checked contract, as relative paths and texts. The result
// depends only on its inputs: the contract, the case files, the core version and binding itself (I-5).

import type { Contract, Type } from '../contract.ts';
import { go } from './go.ts';
import { buildModel, forLanguage, Unsupported } from './model.ts';
import { wasm } from './wasm.ts';
import { node } from './node.ts';
import { php } from './php.ts';
import { python } from './python.ts';
import { HOST_PYTHON_SUBPACKAGE, place, placed } from './packages.ts';
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
export const generatedDirs = (contract: Contract): string[] => {
  const dirs = ['packages/php-ext/generated', 'packages/python/generated', 'packages/ts/generated', 'packages/go/internal/ffi/generated', 'packages/ts/wasm/generated'].map((dir) => place(contract, dir));
  // L-2a: the generated Python package of a host package is the subpackage _binding in the host's source root.
  const python = contract.packages['python'] as { module: string; host?: boolean } | undefined;
  if (python?.host === true) dirs.push(place(contract, `packages/python/generated/python/${python.module.replaceAll('.', '/')}/${HOST_PYTHON_SUBPACKAGE}`));
  return dirs;
};

// L-1: the Go module holds the tracked generated files zz_generated_*.go beside hand-written folders (host, tests), so
// binding owns those files rather than a directory: a generation removes every one of them under the Go module and
// writes its own.
export const goModuleDir = (contract: Contract): string => place(contract, 'packages/go');
export const isGoGenerated = (path: string): boolean => /(^|\/)zz_generated_[^/]*\.go$/.test(path);

const MAP_TARGETS: ReadonlySet<string> = new Set(['go', 'python', 'node']);

export function generate(inputs: Inputs): Files {
  const cases = new Map<string, unknown[]>();
  for (const kase of inputs.contract.cases) {
    const file = inputs.caseFiles.get(kase.file) as Record<string, unknown> | undefined;
    const group = file?.[kase.group];
    if (!Array.isArray(group)) throw new Error(`${kase.file} has no group ${kase.group}`);
    cases.set(kase.member, [...(cases.get(kase.member) ?? []), ...group]);
  }
  const model = buildModel(inputs.contract, inputs.version, inputs.coreLib, cases, inputs.foreign);
  // T-2: map<T> is generated for the targets of MAP_TARGETS so far; a contract with a map and another target is refused
  // by name (G-4).
  const hasMap = (type: unknown): boolean => JSON.stringify(type).includes('"map"');
  const withMap = [
    ...model.functions.flatMap((fn) => [...fn.params.map((p) => [fn.member.id, p.type] as const), [fn.member.id, fn.returns] as const]),
    ...model.records.flatMap((unit) => (unit.fields ?? []).map((f) => [unit.id, f.type] as const)),
  ].find(([, type]) => hasMap(type));
  const others = inputs.contract.targets.filter((target) => !MAP_TARGETS.has(target));
  if (withMap !== undefined && others.length > 0) throw new Unsupported(`${withMap[0]}: map<T> is not generated for ${others.join(', ')} yet`);
  // T-2: map<T> and keyed_map<T>. Go, Python and PHP take them anywhere; Node and WASM, whose JavaScript entry turns a
  // Map into its entries, take them as a whole parameter or return (or an optional one), a keyed map with integer and
  // text keys (a Map compares a Uint8Array key by identity, GN-12).
  const hasKeyed = (type: unknown): boolean => /"(keyed_map|map)"/.test(JSON.stringify(type));
  const whole = (type: Type): Type => (typeof type === 'object' && 'optional' in type ? type.optional : type);
  const keyedPlaces = [
    ...model.functions.flatMap((fn) => [...fn.args.map((a) => ({ id: fn.member.id, type: a.type, top: !a.field })), { id: fn.member.id, type: fn.returns, top: true }]),
    ...model.objects.flatMap((o) => o.members.flatMap((fn) => [...fn.args.map((a) => ({ id: fn.member.id, type: a.type, top: !a.field })), { id: fn.member.id, type: fn.returns, top: true }])),
    ...model.records.flatMap((unit) => (unit.fields ?? []).map((f) => ({ id: unit.id, type: f.type, top: false }))),
  ].filter((place) => hasKeyed(place.type));
  for (const place of keyedPlaces) {
    const js = inputs.contract.targets.filter((target) => target === 'node' || target === 'wasm');
    if (js.length === 0) continue;
    const base = whole(place.type);
    const inner = typeof base === 'object' && 'keyed_map' in base ? base.keyed_map : typeof base === 'object' && 'map' in base ? base.map : undefined;
    const isWhole = place.top && inner !== undefined && !hasKeyed(inner);
    if (!isWhole) throw new Unsupported(`${place.id}: a map<T> or keyed_map<T> inside another type is not generated for ${js.join(', ')} yet (GN-12)`);
    if (typeof base === 'object' && 'keyed_map' in base && base.key.includes('bytes')) throw new Unsupported(`${place.id}: a keyed_map<T> with byte string keys is not generated for ${js.join(', ')} (a Map compares a Uint8Array key by identity, GN-12)`);
  }
  const files: Files = new Map();
  const targets = inputs.contract.targets;
  if (targets.includes('python')) python(forLanguage(model, 'python'), files);
  if (targets.includes('node')) node(forLanguage(model, 'node'), files);
  if (targets.includes('php')) php(forLanguage(model, 'php'), files);
  if (targets.includes('go')) go(model, files);
  if (targets.includes('wasm')) wasm(forLanguage(model, 'wasm'), files);
  return new Map([...placed(inputs.contract, files).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
