// The resolved view of a checked contract that every emitter reads: functions with their parameters, records, enums,
// constants, error classes and the core error enum. An item that the generator does not support yet is refused here,
// by name, so that nothing is left out silently (G-4, P-4).

import { CATEGORIES, type Category, type Contract, type Default, type FaultPoint, type Field, type Lang, type Member, type Name, type Parameter, type Type, type Unit } from '../contract.ts';
import { convert } from '../names.ts';

export class Unsupported extends Error {}

export interface Arg {
  name: Name;
  type: Type;
  // A field of the record parameter, expanded into the language's parameters (T-4).
  field: boolean;
  // U-2, T-4: the declared default of a parameter or field that the caller may leave out; the core takes Option<T>.
  default?: Default;
  // U-2: the constant of the core that a {literal} or {const} default is asserted to equal.
  defaultCore?: string;
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
  // U-7: the E-1 variants that the in function can give (in_raises).
  inRaises: string[];
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
  // B-5c, GN-6h: the lock that holds the core value, when the class has one: the mutex (Exclusive) or the read-write
  // lock (Shared), and whether the class has a write place, which gives it kind busy and the poisoned flag.
  lock?: Lock;
}

export interface Lock {
  kind: 'exclusive' | 'shared';
  writes: boolean;
}

// B-5c, GN-6h: the place of a class in a call, which takes the lock of the instance: the receiver or a parameter whose
// type is the class itself.
export interface Place {
  object: ObjectClass;
  // The parameter, or undefined for the receiver.
  param?: Parameter;
  write: boolean;
}

// GN-5: the poison entry point of the B-5c test in each language, under the feature panic-test. The name is stated
// here only; the emitters and the generated tests read it.
export const POISON_ENTRY = { python: '_panic_test_held', node: '__panicTestHeld', php: 'panicTestHeld' } as const;

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
  // E-2: an error unit, which extends the class of its parent or of its category; absent for a category class.
  unit?: Unit;
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
  // E-2: the error unit that the row's `class` names, whose class the kind is thrown as.
  unit?: string;
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
  // G-5: the fault injection points of the core that the contract names.
  faults: FaultPoint[];
  // The contract cases of each member, from the case files that `cases` names (K-1).
  cases: Map<string, unknown[]>;
  // The cases of the in function of each value alias, from the groups that `cases` names by `alias` (U-7).
  aliasCases: Map<string, unknown[]>;
}

const simple = (name: string): string => name.slice(name.lastIndexOf('\\') + 1);

function supportedType(type: Type, units: Map<string, Unit>, where: string, foreign: ReadonlyMap<string, Contract> = new Map()): void {
  if (typeof type === 'string') {
    // T-1: a source is the original of a parsing operation, so it is a parameter (toFn) and no other place.
    if (type === 'source') throw new Unsupported(`${where}: the type source is generated as a parameter only (T-1)`);
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
  aliasCases: Map<string, unknown[]> = new Map(),
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
  const errorUnits: Unit[] = [];
  const ownVariants = new Set(contract.errors.kinds.filter((row) => row.library === undefined).map((row) => row.variant));
  const toFn = (unit: Unit, member: Member, kind: Fn['kind']): Fn => {
    if (member.native !== undefined) throw new Unsupported(`${member.id}: native is not generated yet`);
    if (member.wait !== undefined && member.wait !== 'none') throw new Unsupported(`${member.id}: wait ${member.wait} is not generated yet`);
    const core = member.core;
    if (core === undefined) throw new Unsupported(`${member.id}: a member without a core path is not generated`);
    const corePath = typeof core === 'string' ? core : core.path;
    const receiver = typeof core === 'object' ? core.receiver : undefined;
    const wantsReceiver = kind === 'method' || kind === 'property' || kind === 'iterate';
    if (receiver === 'self') throw new Unsupported(`${member.id}: a receiver self is not generated yet`);
    if (wantsReceiver !== (receiver !== undefined)) throw new Unsupported(`${member.id}: a ${kind} ${wantsReceiver ? 'needs' : 'takes no'} receiver`);
    const params = member.parameters ?? [];
    if (kind === 'property' && params.length > 0) throw new Unsupported(`${member.id}: a property takes no parameter`);
    const args: Arg[] = [];
    let record: Fn['record'];
    for (const parameter of params) {
      const where = `${member.id}.${parameter.name.join('_')}`;
      if (parameter.rest === true) throw new Unsupported(`${where}: a rest parameter is not generated yet`);
      const type = parameter.type;
      const recordUnit = typeof type === 'object' && 'unit' in type && type.library === undefined ? units.get(type.unit) : undefined;
      if (recordUnit?.kind === 'record') {
        // U-2 {empty: "object"}: what the core takes for a record parameter that is left out is not decided.
        if (parameter.required !== true) throw new Unsupported(`${where}: a default of a record parameter is not generated yet (U-2 {empty: "object"})`);
        record = { unit: recordUnit, param: parameter };
        for (const field of recordUnit.fields ?? []) args.push({ name: field.name, type: field.type, field: true, ...declaredDefault(field, `${recordUnit.id}.${field.name.join('_')}`, true) });
        continue;
      }
      const direct = typeof type === 'object' && 'unit' in type && type.library === undefined && units.get(type.unit)?.origin === 'callback';
      // T-1: a source is taken as a parameter, or an optional one.
      const source = type === 'source' || (typeof type === 'object' && 'optional' in type && type.optional === 'source');
      if (!source) supportedType(type, units, `${where}${direct ? '#parameter' : ''}`, foreign);
      args.push({ name: parameter.name, type, field: false, ...declaredDefault(parameter, where, false) });
    }
    // U-2: a parameter that may be left out is followed by such parameters only: PHP and Python take the positional
    // parameters in order, and PHP also the fields of the record that follow them.
    const firstDefault = args.findIndex((a) => a.default !== undefined);
    const late = firstDefault < 0 ? undefined : args.slice(firstDefault).find((a) => a.default === undefined);
    if (late !== undefined) throw new Unsupported(`${member.id}: the required ${late.name.join('_')} follows a parameter with a default, which is not generated yet (U-2)`);
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
      // E-1c: core.result says whether the core path returns a Result; without it, a path does when raises names a
      // variant of the core error of this contract or the member takes a callback.
      fallible: (typeof core === 'object' ? core.result : undefined) ?? ((member.raises ?? []).some((variant) => ownVariants.has(variant)) || takesCallback),
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
        declaredDefault(field, `${unit.id}.${field.name.join('_')}`, true);
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
      aliases.push({ unit, coreIn: unit.core.in, coreOut: unit.core.out, inRaises: unit.in_raises ?? [] });
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
    if (unit.kind === 'error' && unit.origin === 'generated') {
      // E-2: an error unit has the members of a class unit; when the binding reads a property from the core error is
      // not decided, so a unit with members is refused.
      if ((unit.members ?? []).length > 0) throw new Unsupported(`${unit.id}: the members of an error unit are not generated yet (E-2, E-3)`);
      if (unit.module !== '') throw new Unsupported(`${unit.id}: an error unit in the module ${unit.module} is not generated yet`);
      errorUnits.push(unit);
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
  assignLocks(contract, units, objects, [...functions, ...objects.flatMap((o) => o.members)], callbacks);
  const classes: ErrorClass[] = CATEGORIES.map((category) => {
    const row = contract.errors.classes[category] ?? {};
    // E-7: Go has no class table; its category types have fixed names, so a contract whose only target is Go names none.
    const name = Object.values(row)[0] ?? (contract.targets.every((t) => t === 'go') ? '' : undefined);
    if (name === undefined) throw new Unsupported(`errors.classes.${category} names no class`);
    const names = Object.fromEntries(Object.entries(row).map(([lang, value]) => [lang, simple(value)]));
    return { category, name: simple(name), names };
  });
  // E-2, P-4: the classes of the error units follow the category classes, a parent before the units that extend it.
  for (const unit of inheritanceOrder(errorUnits)) {
    const names = Object.fromEntries((['php', 'python', 'node'] as const).map((lang) => [lang, convert(unit.name, lang, 'class')]));
    classes.push({ unit, category: unit.category as Category, name: convert(unit.name, 'node', 'class'), names });
  }
  const className = (category: Category): string => classes.find((c) => c.category === category)?.name ?? '';
  const kinds: CoreKind[] = contract.errors.kinds.map((row) => {
    if (row.library !== undefined || row.category === undefined) {
      throw new Unsupported(`${row.variant}: a dependency kind is not generated yet`);
    }
    if (row.class === undefined) return { variant: row.variant, category: row.category, className: className(row.category) };
    // E-2: the row's class is an error unit of the kind's category (CK-10), whose class the kind is thrown as.
    const override = classes.find((c) => c.unit?.id === row.class);
    if (override === undefined) throw new Unsupported(`${row.variant}: the class ${row.class} is no error unit that is generated`);
    return { variant: row.variant, category: row.category, className: override.name, unit: row.class };
  });
  if (contract.errors.binding.length > 0) throw new Unsupported('errors.binding overrides are not generated yet');
  const enumPaths = new Set(kinds.map((k) => k.variant.slice(0, k.variant.lastIndexOf('::'))));
  if (enumPaths.size > 1) throw new Unsupported(`the kinds name ${enumPaths.size} error enums; one is generated`);
  const [coreError] = [...enumPaths];
  // E-1c: the error of a Result is the core error of E-1, which a contract without kinds does not name.
  const unnamed = coreError === undefined ? [...functions, ...objects.flatMap((o) => o.members)].find((fn) => fn.fallible && !fn.failure) : undefined;
  if (unnamed !== undefined) throw new Unsupported(`${unnamed.member.id}: its core returns a Result (core.result), but errors.kinds names no core error`);
  for (const alias of aliases) {
    const foreignVariant = alias.inRaises.find((variant) => variant.slice(0, variant.lastIndexOf('::')) !== coreError);
    if (foreignVariant !== undefined) throw new Unsupported(`${alias.unit.id}: in_raises names ${foreignVariant}, which is no variant of the core error ${String(coreError)}`);
  }
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
  // T-4: what the result form of a field with a default holds when the core gives None is not decided.
  for (const unit of resultRecords) {
    const field = (unit.fields ?? []).find((f) => f.default !== undefined);
    if (field !== undefined) throw new Unsupported(`${unit.id}.${field.name.join('_')}: a field default of a record with the result form is not generated yet (T-4)`);
  }
  return {
    contract, version, coreCrate: contract.core.crate, coreLib, functions, constants, enums, records, resultRecords, foreignRecords, foreign,
    objects, callbacks, aliases, classes, coreError, kinds, faults: contract.faults ?? [], cases, aliasCases,
  };
}

// B-5c: how the core takes a class parameter. The contract does not name the borrow of a parameter yet, so every class
// parameter is borrowed shared, a read place; a contract that names `&mut` makes it a write place here.
export const paramBorrow = (_parameter: Parameter): '&' | '&mut' | 'value' => '&';

const WRITE_RECEIVERS: ReadonlySet<string> = new Set(['&mut self', 'self']);
const receiverOfMember = (member: Member): string | undefined => (typeof member.core === 'object' ? member.core.receiver : undefined);
const waits = (member: Member): boolean => member.wait !== undefined && member.wait !== 'none';

// GN-6h: the class units that carry language code, the least set that satisfies the two definitions. The set is read
// from the contract alone, so it also counts members that the generator refuses for another reason.
export function carriers(units: readonly Unit[]): { classes: Set<string>; carries: (type: Type) => boolean } {
  const byId = new Map(units.map((u) => [u.id, u]));
  const found = new Set<string>();
  const carries = (type: Type, seen: Set<string> = new Set()): boolean => {
    if (typeof type === 'string') return type === 'host_value';
    if ('function' in type) return true;
    if ('list' in type) return carries(type.list, seen);
    if ('optional' in type) return carries(type.optional, seen);
    if ('map' in type) return carries(type.map, seen);
    if ('keyed_map' in type) return carries(type.keyed_map, seen);
    if ('tuple' in type) return type.tuple.some((part) => carries(part, seen));
    if (!('unit' in type) || type.library !== undefined) return false;
    const unit = byId.get(type.unit);
    if (unit === undefined) return false;
    if (unit.origin === 'callback') return true;
    if (unit.kind === 'alias') return (unit.out ?? []).some((row) => row.kind === 'native');
    if (unit.kind === 'class') return found.has(unit.id);
    if (unit.kind === 'record' && !seen.has(unit.id)) {
      seen.add(unit.id);
      return (unit.fields ?? []).some((f) => carries(f.type, seen));
    }
    return false;
  };
  const classOf = (type: Type | undefined): string | undefined =>
    type !== undefined && typeof type === 'object' && 'unit' in type && type.library === undefined && byId.get(type.unit)?.kind === 'class' ? type.unit : undefined;
  for (let grew = true; grew; ) {
    grew = false;
    const add = (id: string | undefined): void => {
      if (id !== undefined && !found.has(id)) {
        found.add(id);
        grew = true;
      }
    };
    for (const unit of units) {
      for (const member of unit.members ?? []) {
        const receiver = unit.kind === 'class' && receiverOfMember(member) !== undefined;
        const parameters = member.parameters ?? [];
        const takes = parameters.some((p) => carries(p.type));
        // (i) a member with a receiver of the class has a parameter that carries language code.
        if (receiver && takes) add(unit.id);
        // (ii) a member that returns the class, or takes it as &mut, has such a parameter or is a member, with a
        // receiver, of another class that carries language code.
        const made = [
          unit.kind === 'class' && member.kind === 'constructor' ? unit.id : classOf(member.returns),
          ...parameters.filter((p) => paramBorrow(p) === '&mut').map((p) => classOf(p.type)),
        ];
        for (const id of made) if (id !== undefined && (takes || (receiver && unit.id !== id && found.has(unit.id)))) add(id);
      }
    }
  }
  return { classes: found, carries: (type) => carries(type) };
}

// GN-6h: the lock of each class unit.
function assignLocks(contract: Contract, units: Map<string, Unit>, objects: ObjectClass[], fns: Fn[], callbacks: CallbackUnit[]): void {
  const carrying = carriers(contract.units);
  const names = (value: unknown, id: string, seen: Set<string> = new Set()): boolean => {
    if (Array.isArray(value)) return value.some((item) => names(item, id, seen));
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    if (typeof record['unit'] === 'string' && record['library'] === undefined) {
      if (record['unit'] === id) return true;
      const unit = units.get(record['unit']);
      if (unit?.kind !== 'record' || seen.has(unit.id)) return false;
      seen.add(unit.id);
      return names((unit.fields ?? []).map((f) => f.type), id, seen);
    }
    return Object.entries(record).some(([key, item]) => key !== 'name' && names(item, id, seen));
  };
  const allMembers = contract.units.flatMap((u) => (u.kind === 'interface' ? [] : (u.members ?? [])));
  for (const object of objects) {
    const unit = object.unit;
    const members = unit.members ?? [];
    const id = unit.id;
    const takenAs = (borrows: string[], waiting: boolean): boolean =>
      allMembers.some((m) => (!waiting || waits(m)) && (m.parameters ?? []).some((p) => names(p.type, id) && borrows.includes(paramBorrow(p))));
    const writes = members.some((m) => WRITE_RECEIVERS.has(receiverOfMember(m) ?? '')) || takenAs(['&mut'], false);
    const comesIn = fns.some((fn) => fn.args.some((a) => names(a.type, id))) || callbacks.some((c) => c.members.some((m) => names(m.returns, id)));
    // A member reaches language code when the type of a parameter or the class of its receiver carries it.
    const reaches = (m: Member): boolean => (m.parameters ?? []).some((p) => carrying.carries(p.type)) || (receiverOfMember(m) !== undefined && carrying.classes.has(id));
    const reaching = members.filter((m) => waits(m) || reaches(m));
    if (!writes && !comesIn && reaching.length === 0) continue;
    const shared = !writes || reaching.some((m) => receiverOfMember(m) === '&self') || takenAs(['&', 'value'], true);
    object.lock = { kind: shared ? 'shared' : 'exclusive', writes };
  }
}

// GN-6h: the Rust type in which a class holds its core value.
export const heldType = (object: ObjectClass): string => {
  const core = object.unit.core_type ?? '';
  return object.lock === undefined ? core : `binding_core::${object.lock.kind === 'exclusive' ? 'Exclusive' : 'Shared'}<${core}>`;
};

// GN-6h: the expression that holds a core value in the type of heldType.
export const heldNew = (object: ObjectClass, value: string): string =>
  object.lock === undefined ? value : `binding_core::${object.lock.kind === 'exclusive' ? 'Exclusive' : 'Shared'}::new(${value})`;

const objectOfUnit = (model: Model, unit: Unit | undefined): ObjectClass | undefined => model.objects.find((o) => o.unit === unit);

// GN-6h: the class whose lock a parameter takes: a parameter whose type is the class itself. A class inside another
// type and an expanded field of a record are read, cloned and released by the conversion in.
export function heldParam(model: Model, type: Type): ObjectClass | undefined {
  const object = libraryOf(type) === undefined ? objectOfUnit(model, unitOf(model, type)) : undefined;
  return object?.lock === undefined ? undefined : object;
}

// GN-6h: the places of a call, the receiver first and then the parameters in order.
export function places(model: Model, fn: Fn): Place[] {
  const out: Place[] = [];
  const own = objectOfUnit(model, fn.unit);
  if (fn.receiver !== undefined && own?.lock !== undefined) out.push({ object: own, write: WRITE_RECEIVERS.has(fn.receiver) });
  for (const param of fn.params) {
    if (fn.record !== undefined && param === fn.record.param) continue;
    const object = heldParam(model, param.type);
    if (object !== undefined) out.push({ object, param, write: paramBorrow(param) === '&mut' });
  }
  return out;
}

// GN-6h: whether a conversion in of each form is written for a class: the handle of a parameter that is a place
// (held_<class>), and the clone of a value inside another type (in_<class>).
export function takesNested(model: Model, object: ObjectClass): boolean {
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
  const place = (arg: Arg): boolean => !arg.field && heldParam(model, arg.type) !== undefined;
  return fns.some((fn) => fn.args.some((a) => !place(a) && names(a.type))) || model.callbacks.some((c) => c.members.some((m) => names(m.returns)));
}

export function takesHeld(model: Model, object: ObjectClass): boolean {
  return [...model.functions, ...model.objects.flatMap((o) => o.members)].some((fn) => places(model, fn).some((p) => p.param !== undefined && p.object.unit === object.unit));
}

// GN-6: the binding of the result of the core call. A return of none binds the unit pattern with its type, so a core
// that returns anything else does not compile, and no variable is left unused.
export const resultLet = (fn: Fn): string => (fn.returns === 'none' ? 'let (): ()' : 'let result');

// GN-6h: the name of the guard of the receiver in a generated call.
export const RECEIVER_GUARD = 'receiver';

// GN-6h: the lines that take the locks of the places of a call, each a `let` of the guard under the name of the place.
// `fail` maps a BindingError to the error of the language's call, and `label` is the name of a class in the language,
// for the message of kind busy and of a poisoned object.
export function lockLines(model: Model, fn: Fn, variable: (parameter: Parameter) => string, receiver: string, fail: string, label: (object: ObjectClass) => string): string[] {
  const lines: string[] = [];
  const reads = new Map<ObjectClass['unit'], string[]>();
  for (const place of places(model, fn)) {
    const name = place.param === undefined ? RECEIVER_GUARD : variable(place.param);
    const cell = place.param === undefined ? receiver : name;
    const text = JSON.stringify(label(place.object));
    if (place.write) {
      lines.push(`        let mut ${name} = ${cell}.write(${text}).map_err(${fail})?;`);
      continue;
    }
    const beside = reads.get(place.object.unit) ?? [];
    lines.push(`        let ${name} = ${cell}.read(${text}, &[${beside.map((b) => `Some(&${b})`).join(', ')}]).map_err(${fail})?;`);
    reads.set(place.object.unit, [...beside, name]);
  }
  return lines;
}

// The Rust type of a contract type at the core boundary (T-1, T-2).
export function rustType(model: Model, type: Type): string {
  if (typeof type === 'string') {
    const base: Record<string, string> = {
      bool: 'bool', int: 'i64', int64: 'i64', uint: 'u64', float: 'f64', text: 'String', latin1: 'Vec<u8>', bytes: 'Vec<u8>', source: 'Vec<u8>', none: '()',
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
  const held = places(model, fn);
  const args = fn.params.map((p) => {
    if (fn.record !== undefined && p === fn.record.param) return `&${rustField(p.name)}`;
    // GN-6h: a place gives the core the borrow of its guard, which derefs to the value where the core takes it.
    const place = held.find((h) => h.param === p);
    if (place !== undefined) return `${place.write ? '&mut ' : '&'}${variable(p)}`;
    return p.default === undefined ? coreArg(model, p.type, variable(p)) : defaultArg(model, p.type, variable(p));
  });
  if (fn.receiver === undefined) return args;
  const mut = fn.receiver === '&mut self';
  if (held.some((h) => h.param === undefined)) return [`${mut ? '&mut ' : '&'}${RECEIVER_GUARD}`, ...args];
  return [`${mut ? '&mut ' : '&'}${receiver}`, ...args];
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

// N-4: the name of a member in a language. A stringify and a to_json have the name of the language's hook, any other
// member the converted name of the contract (N-2).
export function memberName(lang: Lang, fn: Fn): string {
  if (fn.special === 'stringify') return lang === 'python' ? '__str__' : lang === 'php' ? '__toString' : 'toString';
  if (fn.special === 'to_json') return lang === 'php' ? 'jsonSerialize' : 'toJSON';
  return langName(lang, fn.member.name, 'callable');
}

// N-4: how a language runs the hook of a stringify or a to_json on an instance, which is how a generated test calls
// it: a hook is called by the language, with the arguments of the language's protocol.
export function hookCall(lang: 'python' | 'node' | 'php', fn: Fn, receiver: string): string | undefined {
  if (fn.special === 'stringify') return { python: `str(${receiver})`, node: `String(${receiver})`, php: `(string) ${receiver}` }[lang];
  if (fn.special === 'to_json') return { python: undefined, node: `JSON.stringify(${receiver})`, php: `\\json_encode(${receiver})` }[lang];
  return undefined;
}

// Q-4 only: the members that a language has; a member whose only names other targets is not generated there. N-4:
// Python has no JSON hook, so a to_json is no member of Python.
export function membersFor(model: Model, lang: Lang): Model {
  const has = (fn: Fn): boolean =>
    (fn.member.only === undefined || fn.member.only.targets.includes(lang)) && !(lang === 'python' && fn.special === 'to_json');
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
  const kindName = (k: CoreKind): string => (k.unit === undefined ? nameOf(k.category) : (classes.find((c) => c.unit?.id === k.unit)?.name ?? ''));
  return { ...membersFor(model, lang), classes, kinds: model.kinds.map((k) => ({ ...k, className: kindName(k) })) };
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

// U-2, T-4: the declared default of a parameter or a field, with the forms that are generated; any other is refused by
// name (G-4). The core takes Option<T> and decides the value of None; a {literal} or {const} default, which every
// declaration shows, names the constant of the core that it equals in default_core.
function declaredDefault(item: Parameter | Field, where: string, field: boolean): { default?: Default; defaultCore?: string } {
  const declared = item.default;
  if (declared === undefined) return {};
  const type = item.type;
  if (typeof type === 'object' && 'optional' in type) throw new Unsupported(`${where}: a default of an optional type is not generated yet (U-2)`);
  const container = typeof type !== 'object' ? undefined : 'list' in type ? 'list' : 'map' in type || 'keyed_map' in type ? 'map' : undefined;
  if ('empty' in declared) {
    if (declared.empty !== container) throw new Unsupported(`${where}: the default {empty: ${JSON.stringify(declared.empty)}} of the type ${JSON.stringify(type)} is not generated (U-2)`);
    return { default: declared };
  }
  // T-1: the core takes Option of the borrowed form of a parameter; the types below have one that is generated.
  const scalar = typeof type === 'string' && ['bool', 'int', 'int64', 'uint', 'float', 'text', 'latin1', 'bytes', 'source'].includes(type);
  if ('computed' in declared) {
    if (!scalar && container === undefined && !field) throw new Unsupported(`${where}: a default of the type ${JSON.stringify(type)} is not generated yet (U-2)`);
    return { default: declared };
  }
  if (item.default_core === undefined) throw new Unsupported(`${where}: a {literal} or {const} default names the constant of the core in default_core (U-2)`);
  if ('literal' in declared) {
    const value = declared.literal;
    const fits =
      (type === 'bool' && typeof value === 'boolean') ||
      ((type === 'uint' || type === 'int' || type === 'int64') && typeof value === 'number' && Number.isSafeInteger(value) && (type !== 'uint' || value >= 0)) ||
      (type === 'float' && typeof value === 'number') ||
      (type === 'text' && typeof value === 'string');
    if (!fits) throw new Unsupported(`${where}: the default {literal: ${JSON.stringify(value)}} of the type ${JSON.stringify(type)} is not generated (U-2)`);
    return { default: declared, defaultCore: item.default_core };
  }
  if (type !== 'bool' && type !== 'uint' && type !== 'int' && type !== 'text') throw new Unsupported(`${where}: a {const} default of the type ${JSON.stringify(type)} is not generated (U-2, U-5)`);
  return { default: declared, defaultCore: item.default_core };
}

// T-1, U-2: how the core takes the Option<T> of a parameter that may be left out: Option of the borrowed form.
function defaultArg(model: Model, type: Type, variable: string): string {
  if (byValue(model, type)) return variable;
  if (typeof type === 'string' || (typeof type === 'object' && 'list' in type)) return `${variable}.as_deref()`;
  return `${variable}.as_ref()`;
}

// P-4: the error units in the order of their inheritance, a parent before the units that name it; the contract order
// otherwise. A cycle is an error of the contract.
function inheritanceOrder(units: Unit[]): Unit[] {
  const ordered: Unit[] = [];
  const left = [...units];
  while (left.length > 0) {
    const at = left.findIndex((u) => u.parent === undefined || ordered.some((o) => o.id === u.parent));
    const next = left[at];
    if (next === undefined) throw new Unsupported(`${left[0]?.id ?? ''}: the parents of the error units make a cycle, or name a unit that is not generated (P-4)`);
    left.splice(at, 1);
    ordered.push(next);
  }
  return ordered;
}

// E-2: the class that an error class extends in the language of the emitter: the class of its parent unit, or of its
// category; undefined for a category class, which extends the base class of the language.
export function parentClass(model: Model, error: ErrorClass): ErrorClass | undefined {
  if (error.unit === undefined) return undefined;
  const parent = error.unit.parent;
  return parent === undefined ? model.classes.find((c) => c.unit === undefined && c.category === error.category) : model.classes.find((c) => c.unit?.id === parent);
}

// E-2: the index of the class of a kind in the classes of the model.
export const kindClass = (model: Model, kind: CoreKind): number =>
  model.classes.findIndex((c) => (kind.unit === undefined ? c.unit === undefined && c.category === kind.category : c.unit?.id === kind.unit));

// The Rust type of the variable of an argument: Option<T> for one that may be left out (U-2).
export const argType = (model: Model, arg: Arg): string => (arg.default === undefined ? rustType(model, arg.type) : `Option<${rustType(model, arg.type)}>`);

// K-1, B-4: the kind text of a variant of the core error, its name in snake_case (CK-22 reads the cases the same way).
export const kindText = (variant: string): string => variant.slice(variant.lastIndexOf('::') + 2).replace(/(?<=[a-z0-9])(?=[A-Z])/g, '_').toLowerCase();

// G-5: the name that a case gives a fault injection point of this contract, <library>.<id> with the library in
// snake_case.
export const pointName = (model: Model, point: FaultPoint): string => `${model.contract.library.replaceAll('-', '_')}.${point.id}`;

// G-5: the Rust items of a binding crate for the fault injection points. Each constant that the contract names exists
// in the core (I-2); with_faults runs the work of an entry point with the faults that a test armed for its member.
export function faultRust(model: Model): string {
  if (model.faults.length === 0) return '';
  return `
/// G-5: the fault injection points that the contract names are constants of the core (I-2).
${model.faults.map((point) => `const _: &str = ${point.core};`).join('\n')}

/// G-5: the work of an entry point runs with the faults that a test armed for its member on this thread, or with none,
/// so an entry point that a callback enters does not see the faults of the call around it.
#[cfg(feature = "fault-test")]
fn with_faults<T>(member: &str, work: impl FnOnce() -> T) -> T {
    binding_core::fault::take(member).run(work)
}

#[cfg(not(feature = "fault-test"))]
fn with_faults<T>(_member: &str, work: impl FnOnce() -> T) -> T {
    work()
}
`;
}

// G-5: the entry point of a member, whose work is the closure of its guard call, runs that work in with_faults. A
// member with two entry points (the keys and the pairs of an iterate) has two guard calls.
export function withFaults(model: Model, fn: Fn, text: string): string {
  if (model.faults.length === 0) return text;
  const guard = /guard\((py, )?\|\| /;
  const open = `$&with_faults(${JSON.stringify(fn.member.id)}, || `;
  const lines = text.split('\n');
  let found = 0;
  for (const [at, line] of lines.entries()) {
    if (!guard.test(line)) continue;
    found += 1;
    if (!line.endsWith('{')) {
      // The work is one expression on the line of the guard call.
      lines[at] = line.replace(guard, open).replace(/\)$/, '))');
      continue;
    }
    const indent = line.slice(0, line.length - line.trimStart().length);
    const end = lines.findIndex((l, i) => i > at && l === `${indent}})`);
    if (end < 0) throw new Error(`${fn.member.id}: the guard call of the entry point does not end (G-5)`);
    lines[at] = line.replace(guard, open);
    lines[end] = `${indent}}))`;
  }
  if (found === 0) throw new Error(`${fn.member.id}: the entry point has no guard call (G-5)`);
  return lines.join('\n');
}

// U-7: the aliases whose in function gives kinds (in_raises), which have the entry point of the feature codec-test.
export const aliasesWithKinds = (model: Model): ValueAlias[] => model.aliases.filter((alias) => alias.inRaises.length > 0);

// E-5, I-2: each variant of in_raises is a variant of the error that the in function of the alias returns, the E of
// its Failure<E>: a variant that the error does not have does not compile.
export function aliasKindsRust(model: Model): string {
  const asserts = aliasesWithKinds(model).flatMap((alias) =>
    alias.inRaises.map((variant) => `#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]\nconst _: fn(&${model.coreError ?? '()'}) -> bool = |error| matches!(error, ${variant} { .. });`));
  return asserts.length === 0 ? '' : `\n/// U-7, I-2: the kinds of in_raises are variants of the error of the alias's in function.\n${asserts.join('\n')}\n`;
}
