// generate(): every generated file of a repository from its checked contract, as relative paths and texts. The result
// depends only on its inputs: the contract, the case files, the core version and binding itself (I-5).

import type { Contract, Lang, Type } from '../contract.ts';
import { go, refuseForGo } from './go.ts';
import { collectModel, forLanguage, holdsFunction, membersFor, Refusals } from './model.ts';
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
  // The targets of the contract to generate, all of them by default (GN-1b).
  targets?: readonly Lang[];
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

// G-4: generate() reads the whole contract and fails with every refusal (Unsupported.refusals) before anything is
// written: an item of the contract that is not supported, then an item that a target of the generation does not take,
// each by name; an item is named with the first reason that its checks find. Only a model without a refusal is
// emitted, and a refusal that a target finds while it writes its files fails that target, after every other target
// wrote its own. `targets` generates the files of those targets of the contract alone (GN-1b), the same files that
// the whole generation writes for them; the refusals of the other targets are not checked.
export function generate(inputs: Inputs): Files {
  const targets = inputs.targets ?? inputs.contract.targets;
  const notDeclared = targets.filter((target) => !inputs.contract.targets.includes(target));
  if (notDeclared.length > 0) throw new Error(`the contract has no target ${notDeclared.join(', ')}`);
  const cases = new Map<string, unknown[]>();
  const aliasCases = new Map<string, unknown[]>();
  // GN-13e: the key of each case that holds the result of its member, by the row that names the group.
  const resultKeys = new Map<string, Map<unknown, string>>();
  for (const kase of inputs.contract.cases) {
    const file = inputs.caseFiles.get(kase.file) as Record<string, unknown> | undefined;
    const group = file?.[kase.group];
    if (!Array.isArray(group)) throw new Error(`${kase.file} has no group ${kase.group}`);
    // U-7: the cases of an alias's in function are kept apart from those of the members.
    const into = kase.member === undefined ? aliasCases : cases;
    const id = kase.member ?? kase.alias;
    into.set(id, [...(into.get(id) ?? []), ...group]);
    if (kase.member !== undefined) {
      const keys = resultKeys.get(kase.member) ?? new Map<unknown, string>();
      for (const item of group) keys.set(item, kase.result ?? 'result');
      resultKeys.set(kase.member, keys);
    }
  }
  const refusals = new Refusals();
  const model = { ...collectModel(inputs.contract, inputs.version, inputs.coreLib, cases, inputs.foreign ?? new Map(), aliasCases, refusals), resultKeys };
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
  const js = targets.filter((target) => target === 'node' || target === 'wasm');
  for (const place of js.length === 0 ? [] : keyedPlaces) {
    const base = whole(place.type);
    const inner = typeof base === 'object' && 'keyed_map' in base ? base.keyed_map : typeof base === 'object' && 'map' in base ? base.map : undefined;
    const isWhole = place.top && inner !== undefined && !hasKeyed(inner);
    if (!isWhole) refusals.refuse(`${place.id}: a map<T> or keyed_map<T> inside another type is not generated for ${js.join(', ')} yet (GN-12)`);
    else if (typeof base === 'object' && 'keyed_map' in base && base.key.includes('bytes')) refusals.refuse(`${place.id}: a keyed_map<T> with byte string keys is not generated for ${js.join(', ')} (a Map compares a Uint8Array key by identity, GN-12)`);
  }
  // GN-6z: Node, PHP and WASM hold a function on the native lifetime, which binding_core does not have yet; Go does not
  // generate a function type.
  for (const target of targets.filter((t) => t === 'go')) {
    for (const fn of [...model.functions, ...model.objects.flatMap((o) => o.members)]) {
      for (const arg of fn.args.filter((a) => holdsFunction(a.type))) {
        refusals.refuse(`${fn.member.id}.${arg.name.join('_')}: a function type is not generated for ${target} ${target === 'go' ? '(GN-6z)' : 'yet: it is held on the native lifetime, which binding_core does not have yet (GN-6z)'}`);
      }
    }
  }
  if (targets.includes('go')) refuseForGo(membersFor(model, 'go'), refusals);
  refusals.fail();
  const files: Files = new Map();
  if (targets.includes('python')) refusals.attempt(() => python(forLanguage(model, 'python'), files));
  if (targets.includes('node')) refusals.attempt(() => node(forLanguage(model, 'node'), files));
  if (targets.includes('php')) refusals.attempt(() => php(forLanguage(model, 'php'), files));
  if (targets.includes('go')) refusals.attempt(() => go(membersFor(model, 'go'), files));
  if (targets.includes('wasm')) refusals.attempt(() => wasm(forLanguage(model, 'wasm'), files));
  refusals.fail();
  return new Map([...placed(inputs.contract, files).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
