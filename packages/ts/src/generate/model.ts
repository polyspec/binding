// The resolved view of a checked contract that every emitter reads: functions with their parameters, records, enums,
// constants, error classes and the core error enum. An item that the generator does not support yet is refused here,
// by name, so that nothing is left out silently (G-4, P-4).

import { CATEGORIES, type Category, type Contract, type Field, type Lang, type Member, type Name, type Parameter, type Type, type Unit } from '../contract.ts';
import { convert } from '../names.ts';

export class Unsupported extends Error {}

export interface Arg {
  name: Name;
  type: Type;
  // A field of the record parameter, expanded into the language's parameters (T-4).
  field: boolean;
}

export interface Fn {
  unit: Unit;
  member: Member;
  // function (a member of a functions unit), or a member of a class unit: constructor, static, method, property (U-2).
  kind: 'function' | 'constructor' | 'static' | 'method' | 'property';
  // The receiver of a method or property in the core (U-2 core.receiver).
  receiver?: '&self' | '&mut self';
  module: string;
  params: Parameter[];
  record?: { unit: Unit; param: Parameter };
  args: Arg[];
  returns: Type;
  fallible: boolean;
  corePath: string;
}

// U-1 kind class, origin generated: a language class that holds a core value (T-5).
export interface ObjectClass {
  unit: Unit;
  members: Fn[];
  // Whether the language may construct it; false leaves only its static factories (U-1 constructible).
  constructible: boolean;
}

// T-3: a record of another repository, which that repository's binding owns in each language.
export interface ForeignRecord {
  library: string;
  contract: Contract;
  unit: Unit;
}

export interface Constant {
  unit: Unit;
  member: Member;
  module: string;
}

// E-2: the base class of each category in each language, one rule for every repository.
export const BASE: Readonly<Record<Category, Readonly<Record<'php' | 'python' | 'node', string>>>> = {
  value: { php: 'InvalidArgumentException', python: 'ValueError', node: 'RangeError' },
  type: { php: 'TypeError', python: 'TypeError', node: 'TypeError' },
  io: { php: 'RuntimeException', python: 'OSError', node: 'Error' },
  store: { php: 'RuntimeException', python: 'RuntimeError', node: 'Error' },
  busy: { php: 'RuntimeException', python: 'RuntimeError', node: 'Error' },
  internal: { php: 'RuntimeException', python: 'RuntimeError', node: 'Error' },
};

export interface ErrorClass {
  category: Category;
  // The simple name, the same in every language (E-2).
  name: string;
}

export interface CoreKind {
  variant: string;
  category: Category;
  className: string;
}

export interface Model {
  contract: Contract;
  version: string;
  coreCrate: string;
  coreLib: string;
  functions: Fn[];
  constants: Constant[];
  enums: Unit[];
  records: Unit[];
  // T-4: the records that have the result form (a class with a public constructor), in contract order: those in a
  // return, in a parameter other than the expanded record parameter, and in a field of such a record.
  resultRecords: Unit[];
  // T-3: the records of other repositories that this contract's types name, in the order they are first named.
  foreignRecords: ForeignRecord[];
  // The contracts of the libraries that the contract names (T-3).
  foreign: ReadonlyMap<string, Contract>;
  objects: ObjectClass[];
  classes: ErrorClass[];
  coreError: string | undefined;
  kinds: CoreKind[];
  // The contract cases of each member, from the case files that `cases` names (K-1).
  cases: Map<string, unknown[]>;
}

const simple = (name: string): string => name.slice(name.lastIndexOf('\\') + 1);

function supportedType(type: Type, units: Map<string, Unit>, where: string, foreign: ReadonlyMap<string, Contract> = new Map()): void {
  if (typeof type === 'string') {
    if (!['bool', 'int', 'int64', 'uint', 'float', 'text', 'latin1', 'bytes', 'none'].includes(type)) {
      throw new Unsupported(`${where}: the type ${type} is not generated yet`);
    }
    return;
  }
  if ('list' in type) return supportedType(type.list, units, where, foreign);
  if ('optional' in type) return supportedType(type.optional, units, where, foreign);
  if ('tuple' in type) {
    for (const part of type.tuple) supportedType(part, units, where, foreign);
    return;
  }
  if ('unit' in type && type.library === undefined) {
    const unit = units.get(type.unit);
    if (unit?.kind === 'enum' || unit?.kind === 'record') return;
    if (unit?.kind === 'class' && unit.origin === 'generated') return;
  }
  if ('unit' in type && type.library !== undefined) {
    const unit = foreign.get(type.library)?.units.find((u) => u.id === type.unit);
    if (unit?.kind === 'record' && (unit.fields ?? []).every((f) => typeof f.type === 'string')) return;
    if (unit === undefined) throw new Unsupported(`${where}: ${type.library} has no unit ${type.unit} (T-3)`);
  }
  throw new Unsupported(`${where}: the type ${JSON.stringify(type)} is not generated yet`);
}

export function buildModel(
  contract: Contract,
  version: string,
  coreLib: string,
  cases: Map<string, unknown[]>,
  foreign: ReadonlyMap<string, Contract> = new Map(),
): Model {
  assertNoExceptions(contract);
  const units = new Map(contract.units.map((u) => [u.id, u]));
  const functions: Fn[] = [];
  const constants: Constant[] = [];
  const enums: Unit[] = [];
  const records: Unit[] = [];
  const objects: ObjectClass[] = [];
  const toFn = (unit: Unit, member: Member, kind: Fn['kind']): Fn => {
    if (member.only !== undefined || member.native !== undefined) throw new Unsupported(`${member.id}: only and native are not generated yet`);
    if (member.wait !== undefined && member.wait !== 'none') throw new Unsupported(`${member.id}: wait ${member.wait} is not generated yet`);
    const core = member.core;
    if (core === undefined) throw new Unsupported(`${member.id}: a member without a core path is not generated`);
    const corePath = typeof core === 'string' ? core : core.path;
    const receiver = typeof core === 'object' ? core.receiver : undefined;
    const wantsReceiver = kind === 'method' || kind === 'property';
    if (receiver === 'self') throw new Unsupported(`${member.id}: a receiver self is not generated yet`);
    if (receiver === '&mut self') throw new Unsupported(`${member.id}: a receiver &mut self (B-5c busy) is not generated yet`);
    if (wantsReceiver !== (receiver !== undefined)) throw new Unsupported(`${member.id}: a ${kind} ${wantsReceiver ? 'needs' : 'takes no'} receiver`);
    const params = member.parameters ?? [];
    if (kind === 'property' && params.length > 0) throw new Unsupported(`${member.id}: a property takes no parameter`);
    const args: Arg[] = [];
    let record: Fn['record'];
    for (const parameter of params) {
      if (parameter.required !== true) throw new Unsupported(`${member.id}: a default or rest parameter is not generated yet`);
      const type = parameter.type;
      const recordUnit = typeof type === 'object' && 'unit' in type && type.library === undefined ? units.get(type.unit) : undefined;
      if (recordUnit?.kind === 'record') {
        record = { unit: recordUnit, param: parameter };
        for (const field of recordUnit.fields ?? []) args.push({ name: field.name, type: field.type, field: true });
        continue;
      }
      supportedType(type, units, `${member.id}.${parameter.name.join('_')}`, foreign);
      if (JSON.stringify(type).includes('"unit"') && [...JSON.stringify(type).matchAll(/"unit":"([^"]+)"/g)].some((m) => units.get(m[1] ?? '')?.kind === 'class')) {
        throw new Unsupported(`${member.id}.${parameter.name.join('_')}: a parameter of a class is not generated yet`);
      }
      args.push({ name: parameter.name, type, field: false });
    }
    const returns = kind === 'constructor' ? { unit: unit.id } : (member.returns ?? 'none');
    supportedType(returns, units, `${member.id} returns`, foreign);
    return {
      unit,
      member,
      kind,
      ...(receiver === undefined ? {} : { receiver: receiver as '&self' | '&mut self' }),
      module: unit.module,
      params,
      args,
      returns,
      fallible: (member.raises ?? []).length > 0,
      corePath,
      ...(record === undefined ? {} : { record }),
    };
  };
  for (const unit of contract.units) {
    if (unit.visibility !== 'public') throw new Unsupported(`${unit.id}: an internal unit is not generated yet`);
    if (unit.only !== undefined || unit.native !== undefined) throw new Unsupported(`${unit.id}: only and native are not generated yet`);
    if (unit.kind === 'enum') {
      enums.push(unit);
      continue;
    }
    if (unit.kind === 'record') {
      for (const field of unit.fields ?? []) {
        if (field.default !== undefined) throw new Unsupported(`${unit.id}: a field default is not generated yet`);
        supportedType(field.type, units, `${unit.id}.${field.name.join('_')}`, foreign);
      }
      records.push(unit);
      continue;
    }
    if (unit.kind === 'class' && unit.origin === 'generated') {
      if (unit.cleanup !== undefined) throw new Unsupported(`${unit.id}: cleanup is not generated yet`);
      if (unit.implements !== undefined || unit.abstract === true) throw new Unsupported(`${unit.id}: implements and abstract are not generated yet`);
      if (unit.core_type === undefined) throw new Unsupported(`${unit.id}: a class without core_type`);
      const members: Fn[] = [];
      for (const member of unit.members ?? []) {
        if (!['constructor', 'static', 'method', 'property'].includes(member.kind)) throw new Unsupported(`${member.id}: a ${member.kind} is not generated yet`);
        if (member.kind === 'property' && member.writable === true) throw new Unsupported(`${member.id}: a writable property is not generated yet`);
        members.push(toFn(unit, member, member.kind as Fn['kind']));
      }
      const constructible = unit.constructible !== false;
      if (constructible !== members.some((m) => m.kind === 'constructor')) {
        throw new Unsupported(`${unit.id}: a constructible class has one constructor and another none (U-1 constructible)`);
      }
      objects.push({ unit, members, constructible });
      continue;
    }
    if (unit.kind !== 'functions' || unit.origin !== 'generated') {
      throw new Unsupported(`${unit.id}: a ${unit.origin} ${unit.kind} unit is not generated yet`);
    }
    for (const member of unit.members ?? []) {
      if (member.only !== undefined || member.native !== undefined) throw new Unsupported(`${member.id}: only and native are not generated yet`);
      if (member.kind === 'constant') {
        if (member.type !== 'uint' && member.type !== 'int' && member.type !== 'text' && member.type !== 'bool') {
          throw new Unsupported(`${member.id}: a constant of type ${JSON.stringify(member.type)} is not generated yet`);
        }
        constants.push({ unit, member, module: unit.module });
        continue;
      }
      if (member.kind !== 'function') throw new Unsupported(`${member.id}: a ${member.kind} is not generated yet`);
      functions.push(toFn(unit, member, 'function'));
    }
  }
  const classes: ErrorClass[] = CATEGORIES.map((category) => {
    const row = contract.errors.classes[category] ?? {};
    const name = Object.values(row)[0];
    if (name === undefined) throw new Unsupported(`errors.classes.${category} names no class`);
    return { category, name: simple(name) };
  });
  const className = (category: Category): string => classes.find((c) => c.category === category)?.name ?? '';
  const kinds: CoreKind[] = contract.errors.kinds.map((row) => {
    if (row.library !== undefined || row.class !== undefined || row.category === undefined) {
      throw new Unsupported(`${row.variant}: a dependency kind or a class override is not generated yet`);
    }
    return { variant: row.variant, category: row.category, className: className(row.category) };
  });
  if (contract.errors.binding.length > 0) throw new Unsupported('errors.binding overrides are not generated yet');
  const enumPaths = new Set(kinds.map((k) => k.variant.slice(0, k.variant.lastIndexOf('::'))));
  if (enumPaths.size > 1) throw new Unsupported(`the kinds name ${enumPaths.size} error enums; one is generated`);
  const [coreError] = [...enumPaths];
  const result = new Set<string>();
  const foreignRecords: ForeignRecord[] = [];
  const visit = (type: Type): void => {
    if (typeof type === 'string') return;
    if ('list' in type) return visit(type.list);
    if ('optional' in type) return visit(type.optional);
    if ('tuple' in type) return type.tuple.forEach(visit);
    if ('unit' in type && type.library === undefined) {
      const unit = units.get(type.unit);
      if (unit?.kind === 'record' && !result.has(unit.id)) {
        result.add(unit.id);
        for (const field of unit.fields ?? []) visit(field.type);
      }
    }
    if ('unit' in type && type.library !== undefined) {
      const library = type.library;
      const owner = foreign.get(library);
      const unit = owner?.units.find((u) => u.id === type.unit);
      if (owner !== undefined && unit?.kind === 'record' && !foreignRecords.some((r) => r.library === library && r.unit.id === unit.id)) {
        foreignRecords.push({ library, contract: owner, unit });
      }
    }
  };
  for (const fn of [...functions, ...objects.flatMap((o) => o.members)]) {
    visit(fn.returns);
    for (const parameter of fn.params) if (parameter !== fn.record?.param) visit(parameter.type);
    for (const field of fn.record?.unit.fields ?? []) visit(field.type);
  }
  const resultRecords = records.filter((r) => result.has(r.id));
  return {
    contract, version, coreCrate: contract.core.crate, coreLib, functions, constants, enums, records, resultRecords, foreignRecords, foreign,
    objects, classes, coreError, kinds, cases,
  };
}

// The Rust type of a contract type at the core boundary (T-1, T-2).
export function rustType(model: Model, type: Type): string {
  if (typeof type === 'string') {
    const base: Record<string, string> = {
      bool: 'bool', int: 'i64', int64: 'i64', uint: 'u64', float: 'f64', text: 'String', latin1: 'Vec<u8>', bytes: 'Vec<u8>', none: '()',
    };
    const found = base[type];
    if (found === undefined) throw new Unsupported(`the type ${type}`);
    return found;
  }
  if ('list' in type) return `Vec<${rustType(model, type.list)}>`;
  if ('optional' in type) return `Option<${rustType(model, type.optional)}>`;
  if ('tuple' in type) return `(${type.tuple.map((t) => rustType(model, t)).join(', ')})`;
  if ('unit' in type) {
    const unit = unitOf(model, type);
    if (unit?.core_type === undefined) throw new Unsupported(`${type.unit} has no core_type`);
    return unit.core_type;
  }
  throw new Unsupported(JSON.stringify(type));
}

// T-1: how the core takes an argument of a parameter. A type written with two forms (text String/&str, latin1, bytes,
// source Vec<u8>/&[u8], path PathBuf/&Path) is taken borrowed, and optional<T> of one as Option<borrowed>, which the
// generated code passes with as_deref(); a Copy type is taken by value; any other type by reference.
export function coreArg(model: Model, type: Type, variable: string): string {
  if (byValue(model, type)) return variable;
  if (typeof type === 'object' && 'optional' in type) {
    const inner = type.optional;
    if (typeof inner === 'string' && ['text', 'latin1', 'bytes', 'source', 'path'].includes(inner)) return `${variable}.as_deref()`;
    throw new Unsupported(`an optional parameter of ${JSON.stringify(inner)} is not generated yet`);
  }
  return `&${variable}`;
}

// Whether the core takes the value itself (a Copy type) rather than a reference (T-1).
export function byValue(model: Model, type: Type): boolean {
  if (typeof type === 'string') return ['bool', 'int', 'int64', 'uint', 'float'].includes(type);
  if ('optional' in type) return byValue(model, type.optional);
  if ('unit' in type) return unitOf(model, type)?.kind === 'enum';
  return false;
}

export const unitOf = (model: Model, type: Type): Unit | undefined => {
  if (typeof type !== 'object' || !('unit' in type)) return undefined;
  const contract = type.library === undefined ? model.contract : model.foreign.get(type.library);
  return contract?.units.find((u) => u.id === type.unit);
};

// The library that owns a unit type, undefined for this contract's own (T-3).
export const libraryOf = (type: Type): string | undefined => (typeof type === 'object' && 'unit' in type ? type.library : undefined);

// The Rust name of the conversion helpers of a record: in_<name> and out_<name>; a record of another repository is
// prefixed with its library, so that two libraries' records of one name do not meet.
export const recordFn = (unit: Unit, library?: string): string =>
  library === undefined ? rustField(unit.name) : `${library.replaceAll('-', '_')}_${rustField(unit.name)}`;

const RUST_KEYWORDS = new Set([
  'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let',
  'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'static', 'struct', 'super', 'trait', 'true', 'type',
  'unsafe', 'use', 'where', 'while', 'async', 'await', 'dyn', 'abstract', 'become', 'box', 'do', 'final', 'macro',
  'override', 'priv', 'typeof', 'unsized', 'virtual', 'yield', 'try', 'gen',
]);

// A Rust identifier: a keyword is written raw (r#type).
export const rustIdent = (text: string): string => (RUST_KEYWORDS.has(text) ? `r#${text}` : text);

export const rustField = (name: Name): string => rustIdent(convert(name, 'rust', 'variable'));
export const rustVariant = (name: Name): string => convert(name, 'rust', 'class');

// The language name of a symbol; naming exceptions are not generated yet, which buildModel refuses below.
export function langName(lang: Lang, name: Name, role: 'class' | 'callable' | 'variable' | 'constant'): string {
  return convert(name, lang, role);
}

export function assertNoExceptions(contract: Contract): void {
  if (contract.naming.exceptions.length > 0) throw new Unsupported('naming exceptions are not generated yet');
}

export const fieldsOf = (unit: Unit): Field[] => unit.fields ?? [];

// The arguments of the core call of a member: the receiver first (U-2 core.receiver), then the parameters. The record
// parameter is the record that the expanded fields built (T-4).
export function coreCallArgs(model: Model, fn: Fn, variable: (parameter: Parameter) => string, receiver: string): string[] {
  const args = fn.params.map((p) => (fn.record !== undefined && p === fn.record.param ? `&${rustField(p.name)}` : coreArg(model, p.type, variable(p))));
  return fn.receiver === undefined ? args : [`${fn.receiver === '&mut self' ? '&mut ' : '&'}${receiver}`, ...args];
}

// The class units of the contract with the members of each kind, for the emitters.
export const objectUnit = (model: Model, type: Type): ObjectClass | undefined => {
  const unit = unitOf(model, type);
  return libraryOf(type) === undefined ? model.objects.find((o) => o.unit === unit) : undefined;
};
