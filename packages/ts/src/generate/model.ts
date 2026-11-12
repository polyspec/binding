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

// U-3: a callback interface that language code implements and the core calls through its trait.
export interface CallbackUnit {
  unit: Unit;
  members: CallbackMember[];
  // thread owner: a call from another thread is kind wrong_thread.
  owner: boolean;
}

export interface CallbackMember {
  member: Member;
  params: Parameter[];
  returns: Type;
  // The receiver of the trait method (U-2 core.receiver of the callback member).
  receiver: '&self' | '&mut self';
}

// U-7: a value alias that the core judges and gives through core: {in, out}, with its value table.
export interface ValueAlias {
  unit: Unit;
  coreIn: string;
  coreOut: string;
}

export interface Fn {
  unit: Unit;
  member: Member;
  // function (a member of a functions unit), or a member of a class unit: constructor, static, method, property (U-2).
  kind: 'function' | 'constructor' | 'static' | 'method' | 'property' | 'iterate';
  // The receiver of a method or property in the core (U-2 core.receiver).
  receiver?: '&self' | '&mut self';
  module: string;
  params: Parameter[];
  record?: { unit: Unit; param: Parameter };
  args: Arg[];
  returns: Type;
  // N-4: a method that is the language's string form (stringify) or JSON hook (to_json), named by each language.
  special?: 'stringify' | 'to_json';
  // N-4 iterate: what the core's iterator gives, an item or the key and the value of an entry, each borrowed.
  yields?: { key?: Type; value: Type };
  fallible: boolean;
  // E-1c: a member that takes a callback returns Result<T, Failure<E>>.
  failure: boolean;
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
  // The simple name in the language of the emitter (E-2: <Library><Category>Error in the class form of the language).
  name: string;
  // The simple name in each language, as the contract gives it.
  names: Partial<Record<Lang, string>>;
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
  callbacks: CallbackUnit[];
  aliases: ValueAlias[];
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
  // T-2: map<T> is generated for Go only; generate() refuses it for the other targets (G-4).
  if ('map' in type) return supportedType(type.map, units, where, foreign);
  // T-2, U-7 (c): keyed_map<T>{key}, an ordered map whose keys mix the listed kinds.
  if ('keyed_map' in type) return supportedType(type.keyed_map, units, where, foreign);
  if ('optional' in type) return supportedType(type.optional, units, where, foreign);
  if ('tuple' in type) {
    for (const part of type.tuple) supportedType(part, units, where, foreign);
    return;
  }
  if ('unit' in type && type.library === undefined) {
    const unit = units.get(type.unit);
    if (unit?.kind === 'enum' || unit?.kind === 'record') return;
    if (unit?.kind === 'class' && (unit.origin === 'generated' || unit.origin === 'value')) return;
    if (unit?.kind === 'alias' && unit.origin === 'value' && typeof unit.core === 'object') return;
    if (unit?.kind === 'interface' && unit.origin === 'callback' && where.includes('#parameter')) return;
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
  contract = resolveNamedTypes(contract);
  const units = new Map(contract.units.map((u) => [u.id, u]));
  const functions: Fn[] = [];
  const constants: Constant[] = [];
  const enums: Unit[] = [];
  const records: Unit[] = [];
  const objects: ObjectClass[] = [];
  const callbacks: CallbackUnit[] = [];
  const aliases: ValueAlias[] = [];
  const toFn = (unit: Unit, member: Member, kind: Fn['kind']): Fn => {
    if (member.native !== undefined) throw new Unsupported(`${member.id}: native is not generated yet`);
    if (member.wait !== undefined && member.wait !== 'none') throw new Unsupported(`${member.id}: wait ${member.wait} is not generated yet`);
    const core = member.core;
    if (core === undefined) throw new Unsupported(`${member.id}: a member without a core path is not generated`);
    const corePath = typeof core === 'string' ? core : core.path;
    const receiver = typeof core === 'object' ? core.receiver : undefined;
    const wantsReceiver = kind === 'method' || kind === 'property' || kind === 'iterate';
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
      const direct = typeof type === 'object' && 'unit' in type && type.library === undefined && units.get(type.unit)?.origin === 'callback';
      supportedType(type, units, `${member.id}.${parameter.name.join('_')}${direct ? '#parameter' : ''}`, foreign);
      args.push({ name: parameter.name, type, field: false });
    }
    const takesCallback = params.some((p) => typeof p.type === 'object' && 'unit' in p.type && p.type.library === undefined && units.get(p.type.unit)?.origin === 'callback');
    const returns = kind === 'constructor' ? { unit: unit.id } : (member.returns ?? 'none');
    // T-2 never: a member that always fails returns Result<Infallible, E>, so it raises.
    if (returns === 'never' && (member.raises ?? []).length === 0) throw new Unsupported(`${member.id}: a never return without raises`);
    if (returns !== 'never') supportedType(returns, units, `${member.id} returns`, foreign);
    let yields: Fn['yields'];
    if (kind === 'iterate') {
      const given = member.yields;
      if (given === undefined) throw new Unsupported(`${member.id}: an iterate without yields`);
      if (receiver !== '&self') throw new Unsupported(`${member.id}: an iterate takes &self`);
      if (params.length > 0) throw new Unsupported(`${member.id}: an iterate takes no parameter`);
      if ((member.raises ?? []).length > 0) throw new Unsupported(`${member.id}: an iterate that raises is not generated yet`);
      yields = typeof given === 'object' && 'key' in given && 'value' in given ? { key: given.key, value: given.value } : { value: given as Type };
      for (const type of [yields.key, yields.value]) if (type !== undefined) supportedType(type, units, `${member.id} yields`, foreign);
    }
    return {
      unit,
      member,
      kind,
      ...(receiver === undefined ? {} : { receiver: receiver as '&self' | '&mut self' }),
      module: unit.module,
      params,
      args,
      returns,
      ...(yields === undefined ? {} : { yields }),
      fallible: (member.raises ?? []).length > 0 || takesCallback,
      failure: takesCallback,
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
    // T-5, U-1: a class of origin value is a class like a generated one; its in rows name only the class itself, so a
    // value of the value type is an instance of it (a value alias with core in/out is generated by its conversions).
    if (unit.kind === 'class' && (unit.origin === 'generated' || unit.origin === 'value')) {
      if (unit.cleanup !== undefined) throw new Unsupported(`${unit.id}: cleanup is not generated yet`);
      if (unit.implements !== undefined || unit.abstract === true) throw new Unsupported(`${unit.id}: implements and abstract are not generated yet`);
      if (unit.core_type === undefined) throw new Unsupported(`${unit.id}: a class without core_type`);
      const members: Fn[] = [];
      for (const member of unit.members ?? []) {
        if (!['constructor', 'static', 'method', 'property', 'iterate', 'stringify', 'to_json'].includes(member.kind)) throw new Unsupported(`${member.id}: a ${member.kind} is not generated yet`);
        if (member.kind === 'stringify' || member.kind === 'to_json') {
          if ((unit.members ?? []).filter((m) => m.kind === member.kind).length > 1) throw new Unsupported(`${unit.id}: a class has one ${member.kind} (N-4)`);
          if ((member.parameters ?? []).length > 0) throw new Unsupported(`${member.id}: a ${member.kind} takes no parameter (N-4)`);
          if (member.kind === 'stringify' && member.returns !== 'text') throw new Unsupported(`${member.id}: a stringify returns text (N-4)`);
          members.push({ ...toFn(unit, member, 'method'), special: member.kind });
          continue;
        }
        if (member.kind === 'iterate' && (unit.members ?? []).filter((m) => m.kind === 'iterate').length > 1) throw new Unsupported(`${unit.id}: a class iterates once (N-4)`);
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
    if (unit.kind === 'alias' && unit.origin === 'value') {
      if (typeof unit.core !== 'object') throw new Unsupported(`${unit.id}: a value alias without core: {in, out} is not generated`);
      if (unit.core_type === undefined) throw new Unsupported(`${unit.id}: a value alias names its core type in core_type`);
      aliases.push({ unit, coreIn: unit.core.in, coreOut: unit.core.out });
      continue;
    }
    if (unit.kind === 'interface' && unit.origin === 'callback') {
      const members: CallbackMember[] = [];
      for (const member of unit.members ?? []) {
        if (member.kind !== 'method') throw new Unsupported(`${member.id}: a callback ${member.kind} is not generated yet`);
        if (member.async_allowed === true) throw new Unsupported(`${member.id}: an async callback is not generated yet`);
        if (member.errors !== undefined) throw new Unsupported(`${member.id}: recognized callback errors are not generated yet`);
        const receiver = typeof member.core === 'object' ? member.core.receiver : undefined;
        if (receiver !== '&self' && receiver !== '&mut self') throw new Unsupported(`${member.id}: a callback member names its trait receiver &self or &mut self in core.receiver`);
        const params = member.parameters ?? [];
        for (const parameter of params) {
          if (parameter.required !== true) throw new Unsupported(`${member.id}: a default or rest parameter is not generated yet`);
          supportedType(parameter.type, units, `${member.id}.${parameter.name.join('_')}`, foreign);
        }
        const returns = member.returns ?? 'none';
        supportedType(returns, units, `${member.id} returns`, foreign);
        members.push({ member, params, returns, receiver });
      }
      callbacks.push({ unit, members, owner: unit.thread === 'owner' });
      continue;
    }
    if (unit.kind !== 'functions' || unit.origin !== 'generated') {
      throw new Unsupported(`${unit.id}: a ${unit.origin} ${unit.kind} unit is not generated yet`);
    }
    for (const member of unit.members ?? []) {
      if (member.native !== undefined) throw new Unsupported(`${member.id}: native is not generated yet`);
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
    // E-7: Go has no class table; its category types have fixed names, so a contract whose only target is Go names none.
    const name = Object.values(row)[0] ?? (contract.targets.every((t) => t === 'go') ? '' : undefined);
    if (name === undefined) throw new Unsupported(`errors.classes.${category} names no class`);
    const names = Object.fromEntries(Object.entries(row).map(([lang, value]) => [lang, simple(value)]));
    return { category, name: simple(name), names };
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
    objects, callbacks, aliases, classes, coreError, kinds, cases,
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
  if ('map' in type) return `binding_core::OrderedMap<${rustType(model, type.map)}>`;
  if ('keyed_map' in type) return `binding_core::KeyedMap<${rustType(model, type.keyed_map)}>`;
  if ('optional' in type) return `Option<${rustType(model, type.optional)}>`;
  if ('tuple' in type) return `(${type.tuple.map((t) => rustType(model, t)).join(', ')})`;
  if ('unit' in type) {
    const unit = unitOf(model, type);
    // U-3: a callback is the generated struct that implements the core trait over the language object.
    if (unit?.origin === 'callback') return `Cb${convert(unit.name, 'rust', 'class')}`;
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
  // U-3: the core takes a callback as &mut (or, by coercion, &) of the struct, which the block moves into a temporary.
  if (unitOf(model, type)?.origin === 'callback') return `&mut { ${variable} }`;
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

// N-4 iterate: an item of the core's iterator is borrowed from the class; a conversion out takes a value type by value
// and a class by a copy of its core value.
export function borrowedItem(model: Model, type: Type, value: string): string {
  if (byValue(model, type)) return `*${value}`;
  const unit = unitOf(model, type);
  if (unit !== undefined && libraryOf(type) === undefined && model.objects.some((o) => o.unit === unit)) return `${value}.clone()`;
  return value;
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

// T-5: whether a value of the class comes in from the language: a type of a parameter, of a callback's return or of a
// field of a record in them names it. Only then does an emitter write the conversion in, which copies the value the
// class holds, so a class that never comes in needs neither the conversion nor Clone.
export function takesObject(model: Model, object: ObjectClass): boolean {
  const seen = new Set<string>();
  const names = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(names);
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    if (typeof record['unit'] === 'string' && record['library'] === undefined) {
      if (record['unit'] === object.unit.id) return true;
      const unit = model.contract.units.find((u) => u.id === record['unit']);
      if (unit?.kind !== 'record' || seen.has(unit.id)) return false;
      seen.add(unit.id);
      return names(unit.fields ?? []);
    }
    return Object.entries(record).some(([key, item]) => key !== 'name' && names(item));
  };
  const fns = [...model.functions, ...model.objects.flatMap((o) => o.members)];
  return fns.some((fn) => fn.args.some((a) => names(a.type))) || model.callbacks.some((c) => c.members.some((m) => names(m.returns)));
}

// Q-4 only: the members that a language has; a member whose only names other targets is not generated there.
export function membersFor(model: Model, lang: Lang): Model {
  const has = (fn: Fn): boolean => fn.member.only === undefined || fn.member.only.targets.includes(lang);
  return {
    ...model,
    functions: model.functions.filter(has),
    objects: model.objects.map((o) => ({ ...o, members: o.members.filter(has) })),
  };
}

// The model as one language's emitter reads it: each error class and kind has the class name of that language (E-2),
// and the members are those of the language (Q-4 only).
export function forLanguage(model: Model, lang: Lang): Model {
  const classes = model.classes.map((c) => ({ ...c, name: c.names[lang] ?? c.name }));
  const nameOf = (category: Category): string => classes.find((c) => c.category === category)?.name ?? '';
  return { ...membersFor(model, lang), classes, kinds: model.kinds.map((k) => ({ ...k, className: nameOf(k.category) })) };
}

// T-3: a value type named in `types` (json_value, template_value, php_value) is the unit that represents it; this
// repository's own is a unit of this contract, another repository's names its library.
export function resolveNamedTypes(contract: Contract): Contract {
  const named = contract.types as Record<string, { library: string; unit: string } | undefined>;
  const resolve = (type: Type): Type => {
    if (typeof type === 'string') {
      const owner = named[type];
      if (owner === undefined) return type;
      return owner.library === contract.library ? { unit: owner.unit } : { unit: owner.unit, library: owner.library };
    }
    if ('list' in type) return { ...type, list: resolve(type.list) };
    if ('optional' in type) return { ...type, optional: resolve(type.optional) };
    if ('map' in type) return { ...type, map: resolve(type.map) };
    if ('keyed_map' in type) return { ...type, keyed_map: resolve(type.keyed_map) };
    if ('tuple' in type) return { ...type, tuple: type.tuple.map(resolve) };
    if ('function' in type) return { ...type, function: { ...type.function, parameters: type.function.parameters.map(resolve), returns: resolve(type.function.returns) } };
    return type;
  };
  const member = (m: Member): Member => ({
    ...m,
    ...(m.parameters === undefined ? {} : { parameters: m.parameters.map((p) => ({ ...p, type: resolve(p.type) })) }),
    ...(m.returns === undefined ? {} : { returns: resolve(m.returns) }),
    ...(m.type === undefined ? {} : { type: resolve(m.type) }),
    ...(m.yields === undefined
      ? {}
      : { yields: typeof m.yields === 'object' && 'key' in m.yields && 'value' in m.yields ? { key: resolve(m.yields.key), value: resolve(m.yields.value) } : resolve(m.yields as Type) }),
  });
  return {
    ...contract,
    units: contract.units.map((u) => ({
      ...u,
      ...(u.members === undefined ? {} : { members: u.members.map(member) }),
      ...(u.fields === undefined ? {} : { fields: u.fields.map((f) => ({ ...f, type: resolve(f.type) })) }),
    })),
  };
}

// U-7: the value alias of a type, when the type is one.
export const aliasOf = (model: Model, type: Type): ValueAlias | undefined => {
  const unit = unitOf(model, type);
  return libraryOf(type) === undefined ? model.aliases.find((a) => a.unit === unit) : undefined;
};
