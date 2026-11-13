// generate(): every generated file of a repository from its checked contract, as relative paths and texts. The result
// depends only on its inputs: the contract, the case files, the core version and binding itself (I-5).

import type { Contract, Lang, Type } from '../contract.ts';
import { go, refuseForGo } from './go.ts';
import { type Model, collectModel, forLanguage, libraryOf, membersFor, Refusals, unitOf, waitsAsync, holdsFunction, machineFunction } from './model.ts';
import { phpCaseTests } from './samples.ts';
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

// The model of a generation: the contract with its cases, by member and by alias (G-5), and the key of each case that
// holds the result of its member.
function modelOf(inputs: Inputs, refusals: Refusals): Model & { resultKeys: Map<string, Map<unknown, string>> } {
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
  const model = { ...collectModel(inputs.contract, inputs.version, inputs.coreLib, cases, inputs.foreign ?? new Map(), aliasCases, refusals), resultKeys };
  return model;
}

// GN-13: the targets whose binding crate has the feature case-test: those with a case whose value has no form in the
// language, which binding scaffold names in the manifest of the crate.
export function caseTestTargets(inputs: Omit<Inputs, 'version' | 'coreLib'>): Lang[] {
  const model = modelOf({ ...inputs, version: '0.0.0', coreLib: '' }, new Refusals());
  return inputs.contract.targets.includes('php') && phpCaseTests(forLanguage(model, 'php')).length > 0 ? ['php'] : [];
}

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
  const refusals = new Refusals();
  const model = modelOf(inputs, refusals);
  // T-2, GN-12: map<T> and keyed_map<T> are taken at every place of a type in every target. Node and WASM, where a
  // keyed map is a Map, refuse byte string keys, which a Map compares by identity.
  const bytesKeyed = (type: Type): boolean => {
    if (typeof type === 'string' || 'unit' in type) return false;
    if ('keyed_map' in type) return type.key.includes('bytes') || bytesKeyed(type.keyed_map);
    if ('map' in type) return bytesKeyed(type.map);
    if ('list' in type) return bytesKeyed(type.list);
    if ('optional' in type) return bytesKeyed(type.optional);
    if ('tuple' in type) return type.tuple.some(bytesKeyed);
    if ('function' in type) return [...type.function.parameters, type.function.returns].some(bytesKeyed);
    return false;
  };
  const keyedPlaces = [
    ...model.functions.flatMap((fn) => [...fn.args.map((a) => ({ id: fn.member.id, type: a.type })), { id: fn.member.id, type: fn.returns }]),
    ...model.objects.flatMap((o) => o.members.flatMap((fn) => [...fn.args.map((a) => ({ id: fn.member.id, type: a.type })), { id: fn.member.id, type: fn.returns }])),
    ...model.records.flatMap((unit) => (unit.fields ?? []).map((f) => ({ id: unit.id, type: f.type }))),
    ...model.variants.flatMap((v) => v.cases.flatMap((kase) => (kase.unit.fields ?? []).map((f) => ({ id: v.unit.id, type: f.type })))),
  ].filter((place) => bytesKeyed(place.type));
  const js = targets.filter((target) => target === 'node' || target === 'wasm');
  for (const place of js.length === 0 ? [] : keyedPlaces) {
    refusals.refuse(`${place.id}: a keyed_map<T> with byte string keys is not generated for ${js.join(', ')} (a Map compares a Uint8Array key by identity, GN-12)`);
  }
  // GN-6z: Go does not generate a function type; the function of a member with machine (GN-6ae) is generated.
  for (const target of targets.filter((t) => t === 'go')) {
    for (const fn of [...model.functions, ...model.objects.flatMap((o) => o.members)]) {
      for (const arg of fn.args.filter((a) => holdsFunction(a.type) && !machineFunction(a.type))) {
        refusals.refuse(`${fn.member.id}.${arg.name.join('_')}: a function type is not generated for ${target} (GN-6z)`);
      }
    }
  }
  // GN-6aa: Node writes 'env for a callback inside another type and has no wrapper that outlives the environment of the
  // call, so a parameter whose callback the core keeps is refused by name; the other targets write 'static for it.
  for (const target of targets.filter((t) => t === 'node')) {
    const forTarget = membersFor(model, target);
    for (const fn of [...forTarget.functions, ...forTarget.objects.flatMap((o) => o.members)]) {
      for (const parameter of (fn.member.parameters ?? []).filter((p) => p.keeps === true)) {
        refusals.refuse(`${fn.member.id}.${parameter.name.join('_')}: a callback that the core keeps is not generated yet for ${target} (GN-6aa)`);
      }
    }
  }
  // GN-6s: Go and WASM do not wrap a callback unit of another repository yet.
  for (const target of targets.filter((t) => t === 'go' || t === 'wasm')) {
    const forTarget = membersFor(model, target);
    for (const fn of [...forTarget.functions, ...forTarget.objects.flatMap((o) => o.members)]) {
      for (const arg of fn.args) {
        const library = libraryOf(arg.type);
        if (library !== undefined && model.foreignCallbacks.some((c) => c.library === library && c.unit.id === (arg.type as { unit: string }).unit)) {
          refusals.refuse(`${fn.member.id}.${arg.name.join('_')}: a callback unit ${(arg.type as { unit: string }).unit} of ${library} is not generated yet in ${target} (GN-6s)`);
        }
      }
    }
  }
  if (targets.includes('go')) {
    refuseForGo(membersFor(model, 'go'), refusals);
  }
  if (targets.includes('wasm')) {
    const forWasm = membersFor(model, 'wasm');
    // GN-6y: WASM has no OS path; the contract leaves such a member out by only (Q-4, CK-15).
    for (const fn of [...forWasm.functions, ...forWasm.objects.flatMap((o) => o.members)]) {
      if ([...fn.args.map((a) => a.type), fn.returns].some((type) => holdsPath(model, type, new Set()))) refusals.refuse(`${fn.member.id}: a path is not generated for WASM, which has no OS path (Q-4, CK-15, GN-6y)`);
    }
  }
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

// GN-6y: whether a type holds a path, also through the fields of a record of this contract.
function holdsPath(model: Model, type: Type, seen: Set<string>): boolean {
  if (typeof type === 'string') return type === 'path';
  if ('list' in type) return holdsPath(model, type.list, seen);
  if ('map' in type) return holdsPath(model, type.map, seen);
  if ('keyed_map' in type) return holdsPath(model, type.keyed_map, seen);
  if ('optional' in type) return holdsPath(model, type.optional, seen);
  if ('tuple' in type) return type.tuple.some((part) => holdsPath(model, part, seen));
  const unit = unitOf(model, type);
  if (unit?.kind !== 'record' || seen.has(unit.id)) return false;
  seen.add(unit.id);
  return (unit.fields ?? []).some((field) => holdsPath(model, field.type, seen));
}
