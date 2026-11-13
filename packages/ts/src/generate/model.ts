// The resolved view of a checked contract that every emitter reads: functions with their parameters, records, enums,
// constants, error classes and the core error enum. An item that the generator does not support yet is refused here,
// by name, so that nothing is left out silently (G-4, P-4).

import { CATEGORIES, type Category, type Contract, type Default, type FaultPoint, type Field, type Lang, type Member, type Name, type Parameter, type Type, type Unit } from '../contract.ts';
import { convert } from '../names.ts';

// G-4: the refusal of the items that the generator does not support yet; refusals holds one line for each item.
export class Unsupported extends Error {
  readonly refusals: string[];

  constructor(refusals: string | string[]) {
    const lines = typeof refusals === 'string' ? [refusals] : refusals;
    super(lines.join('\n'));
    this.refusals = lines;
  }
}

// G-4: the refusals of a generation, collected item by item so that one refused item does not hide another. An item
// is refused with the first reason that its checks find, because a later check of the same item reads what an earlier
// one refused.
export class Refusals {
  readonly found: string[] = [];

  // Runs the checks of one item; a refusal is kept and the item is left out (undefined).
  attempt<T>(check: () => T): T | undefined {
    try {
      return check();
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      for (const line of error.refusals) this.refuse(line);
      return undefined;
    }
  }

  // The same line names the same item for the same reason, which is named once.
  refuse(message: string): void {
    if (!this.found.includes(message)) this.found.push(message);
  }

  // Fails with every refusal found so far, before anything is written.
  fail(): void {
    if (this.found.length > 0) throw new Unsupported([...this.found]);
  }
}

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
  // T-3, U-7 (a'): the library that owns the alias, when it is another repository's, with the error enum of its `in`
  // function and the category that the owner's E-1 gives each variant.
  library?: string;
  error?: { path: string; kinds: { variant: string; category: Category }[] };
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
  // E-2: the error unit that the row names in `class`, whose class the kind has in place of the class of its category.
  unit?: ErrorUnit;
}

// I-3: a property of an error unit, which the generated code reads from the core error by the core path of the member.
export interface ErrorProperty {
  member: Member;
  corePath: string;
  returns: Type;
}

// E-2: an error unit. Its class extends the class of its parent, or of its category when it has none.
export interface ErrorUnit {
  unit: Unit;
  category: Category;
  parent?: ErrorUnit;
  // The properties that the unit declares itself; errorProperties adds those of its parents.
  properties: ErrorProperty[];
}

// The properties of an error unit with those of its parents, each with the unit that declares it, parents first.
export const errorProperties = (unit: ErrorUnit): { owner: ErrorUnit; property: ErrorProperty }[] => [
  ...(unit.parent === undefined ? [] : errorProperties(unit.parent)),
  ...unit.properties.map((property) => ({ owner: unit, property })),
];

// B-4: the kind text of a variant of the core error, the snake_case of its last segment (CK-22).
export const kindText = (variant: string): string =>
  variant.slice(variant.lastIndexOf('::') + 2).replace(/(?<=[a-z0-9])(?=[A-Z])/g, '_').toLowerCase();

// E-2: the error unit of the kind of a contract case, when the row of the kind names one in `class`.
export const errorUnitOfKind = (model: Model, kind: string): ErrorUnit | undefined =>
  model.kinds.find((k) => k.unit !== undefined && kindText(k.variant) === kind)?.unit;

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
  // E-2: the error units, a parent before the units that extend it (P-4).
  errorUnits: ErrorUnit[];
  coreError: string | undefined;
  kinds: CoreKind[];
  // G-5: the fault injection points of the core that the contract names.
  faults: FaultPoint[];
  // The contract cases of each member, from the case files that `cases` names (K-1).
  cases: Map<string, unknown[]>;
  // The cases of the in function of each value alias, from the groups that `cases` names by `alias` (U-7).
  aliasCases: Map<string, unknown[]>;
  // GN-13e: for each member, the key of each of its cases that holds its result (the `result` of the row of `cases`).
  resultKeys?: Map<string, Map<unknown, string>>;
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
    // T-3, U-7 (a'): a value alias of another repository, whose core functions this binding calls.
    if (unit?.kind === 'alias' && unit.origin === 'value' && typeof unit.core === 'object' && unit.core_type !== undefined) return;
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
  const refusals = new Refusals();
  const model = collectModel(contract, version, coreLib, cases, foreign, aliasCases, refusals);
  refusals.fail();
  return model;
}

// The model of the items that the generator supports, with a refusal in refusals for each item that it does not; a
// model with a refusal is not emitted (G-4).
export function collectModel(
  contract: Contract,
  version: string,
  coreLib: string,
  cases: Map<string, unknown[]>,
  foreign: ReadonlyMap<string, Contract>,
  aliasCases: Map<string, unknown[]>,
  refusals: Refusals,
): Model {
  refusals.attempt(() => assertNoExceptions(contract));
  // The units refused as a whole, whose dependents are not refused again for them.
  const refusedUnits = new Set<string>();
  contract = resolveNamedTypes(contract);
  const units = new Map(contract.units.map((u) => [u.id, u]));
  const functions: Fn[] = [];
  const constants: Constant[] = [];
  const enums: Unit[] = [];
  const records: Unit[] = [];
  const objects: ObjectClass[] = [];
  const callbacks: CallbackUnit[] = [];
  const aliases: ValueAlias[] = [];
  const errorUnits: ErrorUnit[] = [];
  const ownVariants = new Set(contract.errors.kinds.filter((row) => row.library === undefined).map((row) => row.variant));
  const carrying = carriers(contract.units);
  const toFn = (unit: Unit, member: Member, kind: Fn['kind']): Fn => {
    if (member.native !== undefined) throw new Unsupported(`${member.id}: native is not generated yet`);
    // GN-6m: a member with wait blocking_io is generated in the form of each language; another wait is not yet.
    if (member.wait !== undefined && member.wait !== 'none' && member.wait !== 'blocking_io') throw new Unsupported(`${member.id}: wait ${member.wait} is not generated yet`);
    if (member.wait === 'blocking_io') {
      if (kind === 'constructor' || kind === 'property' || kind === 'iterate') throw new Unsupported(`${member.id}: a ${kind} with wait blocking_io is not generated (GN-6m)`);
      const reachesCode = (member.parameters ?? []).some((p) => carrying.carries(p.type)) || (kind === 'method' && carrying.classes.has(unit.id));
      if (reachesCode) throw new Unsupported(`${member.id}: a member with wait blocking_io that reaches language code is not generated (GN-6m)`);
    }
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
        // U-2 {empty: "object"}: a record parameter that is left out is the record with every field left out, which
        // the core gets with each field None; so each field has a default, and no other default is a record.
        const declared = parameter.default;
        if (declared !== undefined) {
          const shown = 'empty' in declared ? `{empty: ${JSON.stringify(declared.empty)}}` : JSON.stringify(declared);
          if (!('empty' in declared) || declared.empty !== 'object') throw new Unsupported(`${where}: the default ${shown} of a record parameter is not generated (U-2)`);
          const lacking = (recordUnit.fields ?? []).find((field) => field.default === undefined);
          if (lacking !== undefined) throw new Unsupported(`${where}: the default {empty: "object"} leaves out the record, but its field ${lacking.name.join('_')} has no default (U-2)`);
        }
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
    const before = refusals.found.length;
    refusals.attempt(() => collectUnit(unit));
    if (refusals.found.length > before) refusedUnits.add(unit.id);
  }
  function collectUnit(unit: Unit): void {
    if (unit.visibility !== 'public') throw new Unsupported(`${unit.id}: an internal unit is not generated yet`);
    if (unit.only !== undefined || unit.native !== undefined) throw new Unsupported(`${unit.id}: only and native are not generated yet`);
    if (unit.kind === 'enum') {
      enums.push(unit);
      return;
    }
    if (unit.kind === 'record') {
      let refused = false;
      for (const field of unit.fields ?? []) {
        refused = refusals.attempt(() => {
          declaredDefault(field, `${unit.id}.${field.name.join('_')}`, true);
          supportedType(field.type, units, `${unit.id}.${field.name.join('_')}`, foreign);
          return true;
        }) === undefined || refused;
      }
      if (refused) throw new Unsupported([]);
      records.push(unit);
      return;
    }
    // T-5, U-1: a class of origin value is a class like a generated one; its in rows name only the class itself, so a
    // value of the value type is an instance of it (a value alias with core in/out is generated by its conversions).
    if (unit.kind === 'class' && (unit.origin === 'generated' || unit.origin === 'value')) {
      if (unit.cleanup !== undefined) throw new Unsupported(`${unit.id}: cleanup is not generated yet`);
      if (unit.implements !== undefined || unit.abstract === true) throw new Unsupported(`${unit.id}: implements and abstract are not generated yet`);
      if (unit.core_type === undefined) throw new Unsupported(`${unit.id}: a class without core_type`);
      const members: Fn[] = [];
      let refused = false;
      for (const member of unit.members ?? []) refused = refusals.attempt(() => classMember(member)) === undefined || refused;
      function classMember(member: Member): true {
        if (!['constructor', 'static', 'method', 'property', 'iterate', 'stringify', 'to_json'].includes(member.kind)) throw new Unsupported(`${member.id}: a ${member.kind} is not generated yet`);
        if (member.kind === 'stringify' || member.kind === 'to_json') {
          if ((unit.members ?? []).filter((m) => m.kind === member.kind).length > 1) throw new Unsupported(`${unit.id}: a class has one ${member.kind} (N-4)`);
          if ((member.parameters ?? []).length > 0) throw new Unsupported(`${member.id}: a ${member.kind} takes no parameter (N-4)`);
          if (member.kind === 'stringify' && member.returns !== 'text') throw new Unsupported(`${member.id}: a stringify returns text (N-4)`);
          // GN-6m: the language calls a hook in its own protocol, which awaits nothing.
          if (member.wait === 'blocking_io') throw new Unsupported(`${member.id}: a ${member.kind} with wait blocking_io is not generated (GN-6m)`);
          members.push({ ...toFn(unit, member, 'method'), special: member.kind });
          return true;
        }
        if (member.kind === 'iterate' && (unit.members ?? []).filter((m) => m.kind === 'iterate').length > 1) throw new Unsupported(`${unit.id}: a class iterates once (N-4)`);
        if (member.kind === 'property' && member.writable === true) throw new Unsupported(`${member.id}: a writable property is not generated yet`);
        members.push(toFn(unit, member, member.kind as Fn['kind']));
        return true;
      }
      // A refused member is named already; the class is not checked against the members that are left.
      if (refused) throw new Unsupported([]);
      const constructible = unit.constructible !== false;
      if (constructible !== members.some((m) => m.kind === 'constructor')) {
        throw new Unsupported(`${unit.id}: a constructible class has one constructor and another none (U-1 constructible)`);
      }
      objects.push({ unit, members, constructible });
      return;
    }
    if (unit.kind === 'alias' && unit.origin === 'value') {
      if (typeof unit.core !== 'object') throw new Unsupported(`${unit.id}: a value alias without core: {in, out} is not generated`);
      if (unit.core_type === undefined) throw new Unsupported(`${unit.id}: a value alias names its core type in core_type`);
      aliases.push({ unit, coreIn: unit.core.in, coreOut: unit.core.out, inRaises: unit.in_raises ?? [] });
      return;
    }
    if (unit.kind === 'interface' && unit.origin === 'callback') {
      const members: CallbackMember[] = [];
      let refused = false;
      for (const member of unit.members ?? []) refused = refusals.attempt(() => callbackMember(member)) === undefined || refused;
      function callbackMember(member: Member): true {
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
        return true;
      }
      if (refused) throw new Unsupported([]);
      callbacks.push({ unit, members, owner: unit.thread === 'owner' });
      return;
    }
    if (unit.kind === 'error' && unit.origin === 'generated') {
      // E-2, I-3: an error unit is a class of its category with read-only properties, which the core error gives.
      if (unit.category === undefined) throw new Unsupported(`${unit.id}: an error unit without a category (U-1)`);
      if (unit.abstract === true || unit.implements !== undefined || unit.cleanup !== undefined) throw new Unsupported(`${unit.id}: abstract, implements and cleanup of an error unit are not generated yet`);
      const properties: ErrorProperty[] = [];
      let refused = false;
      for (const member of unit.members ?? []) {
        const property = refusals.attempt(() => errorProperty(member));
        if (property === undefined) refused = true;
        else properties.push(property);
      }
      if (refused) throw new Unsupported([]);
      function errorProperty(member: Member): ErrorProperty {
        if (member.kind !== 'property') throw new Unsupported(`${member.id}: a ${member.kind} of an error unit is not generated yet`);
        if (member.native !== undefined) throw new Unsupported(`${member.id}: native is not generated yet`);
        if (member.wait !== undefined && member.wait !== 'none') throw new Unsupported(`${member.id}: wait ${member.wait} is not generated yet`);
        if (member.writable === true) throw new Unsupported(`${member.id}: a writable property is not generated yet`);
        if (typeof member.core !== 'object' || member.core.receiver !== '&self') throw new Unsupported(`${member.id}: a property of an error unit names a function of the core error with the receiver &self`);
        if ((member.parameters ?? []).length > 0) throw new Unsupported(`${member.id}: a property takes no parameter`);
        if ((member.raises ?? []).length > 0) throw new Unsupported(`${member.id}: a property of an error unit that raises is not generated yet`);
        const returns = member.returns ?? 'none';
        const base = typeof returns === 'object' && 'optional' in returns ? returns.optional : returns;
        if (typeof base !== 'string' || !['bool', 'int', 'int64', 'uint', 'float', 'text', 'bytes'].includes(base)) {
          throw new Unsupported(`${member.id}: a property of an error unit of type ${JSON.stringify(returns)} is not generated yet`);
        }
        return { member, corePath: member.core.path, returns };
      }
      errorUnits.push({ unit, category: unit.category, properties });
      return;
    }
    if (unit.kind !== 'functions' || unit.origin !== 'generated') {
      throw new Unsupported(`${unit.id}: a ${unit.origin} ${unit.kind} unit is not generated yet`);
    }
    let refused = false;
    for (const member of unit.members ?? []) refused = refusals.attempt(() => functionMember(member)) === undefined || refused;
    if (refused) throw new Unsupported([]);
    function functionMember(member: Member): true {
      if (member.native !== undefined) throw new Unsupported(`${member.id}: native is not generated yet`);
      if (member.kind === 'constant') {
        if (member.type !== 'uint' && member.type !== 'int' && member.type !== 'text' && member.type !== 'bool') {
          throw new Unsupported(`${member.id}: a constant of type ${JSON.stringify(member.type)} is not generated yet`);
        }
        constants.push({ unit, member, module: unit.module });
        return true;
      }
      if (member.kind !== 'function') throw new Unsupported(`${member.id}: a ${member.kind} is not generated yet`);
      functions.push(toFn(unit, member, 'function'));
      return true;
    }
  }
  refusals.attempt(() => assignLocks(contract, units, objects, [...functions, ...objects.flatMap((o) => o.members)], callbacks));
  const classes: ErrorClass[] = CATEGORIES.map((category) => {
    const row = contract.errors.classes[category] ?? {};
    // E-7: Go has no class table; its category types have fixed names, so a contract whose only target is Go names none.
    const name = Object.values(row)[0] ?? (contract.targets.every((t) => t === 'go') ? '' : undefined);
    if (name === undefined) refusals.refuse(`errors.classes.${category} names no class`);
    const names = Object.fromEntries(Object.entries(row).map(([lang, value]) => [lang, simple(value)]));
    return { category, name: simple(name ?? ''), names };
  });
  const className = (category: Category): string => classes.find((c) => c.category === category)?.name ?? '';
  // P-4: a parent comes before the units that extend it. The contract check refuses a cycle (CK-6).
  for (const unit of errorUnits) {
    if (unit.unit.parent === undefined || refusedUnits.has(unit.unit.parent)) continue;
    const parent = errorUnits.find((u) => u.unit.id === unit.unit.parent);
    if (parent === undefined || parent.category !== unit.category) refusals.refuse(`${unit.unit.id}: the parent ${unit.unit.parent} is not an error unit of category ${unit.category} (E-2)`);
    else unit.parent = parent;
  }
  const depth = (unit: ErrorUnit, seen = 0): number => {
    if (seen > errorUnits.length) throw new Unsupported(`${unit.unit.id}: the parents form a cycle (P-4)`);
    return unit.parent === undefined ? 0 : 1 + depth(unit.parent, seen + 1);
  };
  const depths = new Map(errorUnits.map((u) => [u, refusals.attempt(() => depth(u))]));
  // A unit on a cycle is named; its parent is left out, so the checks that follow its parents end.
  for (const [unit, found] of depths) if (found === undefined) delete unit.parent;
  errorUnits.sort((a, b) => (depths.get(a) ?? -1) - (depths.get(b) ?? -1));
  for (const unit of errorUnits) {
    const names = errorProperties(unit).map((p) => p.property.member.name.join('_'));
    const twice = names.find((n, i) => names.indexOf(n) !== i) ?? ['kind', 'status', 'errno', 'message'].find((n) => names.includes(n));
    if (twice !== undefined) refusals.refuse(`${unit.unit.id}: the property ${twice} is declared twice (E-3 names kind, status and errno)`);
  }
  const kinds: CoreKind[] = contract.errors.kinds.flatMap((row) => refusals.attempt((): CoreKind[] => {
    // E-1b (a): a row of another library, whose variant holds the error of that library, is not generated yet. A row
    // with `source` is a variant of this crate (E-1b (b)) and is generated as any other.
    if (row.library !== undefined || row.category === undefined) {
      throw new Unsupported(`${row.variant}: a kind of another library (E-1b (a)) is not generated yet`);
    }
    if (row.class === undefined) return [{ variant: row.variant, category: row.category, className: className(row.category) }];
    // The unit that the row names was refused, and is named already.
    if (refusedUnits.has(row.class)) return [];
    const unit = errorUnits.find((u) => u.unit.id === row.class);
    if (unit === undefined || unit.category !== row.category) throw new Unsupported(`${row.variant}: the class ${row.class} is not an error unit of category ${row.category} (E-2)`);
    return [{ variant: row.variant, category: row.category, className: className(row.category), unit }];
  }) ?? []);
  if (contract.errors.binding.length > 0) refusals.refuse('errors.binding overrides are not generated yet');
  const enumPaths = new Set(kinds.map((k) => k.variant.slice(0, k.variant.lastIndexOf('::'))));
  if (enumPaths.size > 1) refusals.refuse(`the kinds name ${enumPaths.size} error enums; one is generated`);
  const [coreError] = [...enumPaths];
  // E-1c: the error of a Result is the core error of E-1, which a contract without kinds does not name.
  const unnamed = coreError === undefined && contract.errors.kinds.length === 0 ? [...functions, ...objects.flatMap((o) => o.members)].filter((fn) => fn.fallible && !fn.failure) : [];
  for (const fn of unnamed) refusals.refuse(`${fn.member.id}: its core returns a Result (core.result), but errors.kinds names no core error`);
  for (const alias of aliases) {
    const foreignVariant = alias.inRaises.find((variant) => variant.slice(0, variant.lastIndexOf('::')) !== coreError);
    if (foreignVariant !== undefined) refusals.refuse(`${alias.unit.id}: in_raises names ${foreignVariant}, which is no variant of the core error ${String(coreError)}`);
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
    if (field !== undefined) refusals.refuse(`${unit.id}.${field.name.join('_')}: a field default of a record with the result form is not generated yet (T-4)`);
  }
  // T-3, U-7 (a'): the value aliases of other repositories that a type of this contract names, in the order they are
  // first named. A failure of the owner's `in` is of the owner's error enum, whose categories the owner's E-1 gives.
  const eachType = (type: Type, found: (unit: Unit, library: string) => void): void => {
    if (typeof type === 'string') return;
    if ('list' in type) return eachType(type.list, found);
    if ('map' in type) return eachType(type.map, found);
    if ('keyed_map' in type) return eachType(type.keyed_map, found);
    if ('optional' in type) return eachType(type.optional, found);
    if ('tuple' in type) return type.tuple.forEach((part) => eachType(part, found));
    if ('unit' in type && type.library !== undefined) {
      const library = type.library;
      const unit = foreign.get(library)?.units.find((u) => u.id === type.unit);
      if (unit !== undefined) refusals.attempt(() => found(unit, library));
    }
  };
  const foreignAlias = (unit: Unit, library: string): void => {
    if (unit.kind !== 'alias' || typeof unit.core !== 'object' || aliases.some((a) => a.unit === unit)) return;
    const rows = foreign.get(library)?.errors.kinds ?? [];
    const dependent = rows.find((row) => row.library !== undefined || row.category === undefined);
    if (dependent !== undefined) throw new Unsupported(`${library}.${unit.id}: a value alias whose owner forwards the kind ${dependent.variant} of another library is not generated yet`);
    const paths = new Set(rows.map((row) => row.variant.slice(0, row.variant.lastIndexOf('::'))));
    const [path] = [...paths];
    if (path === undefined || paths.size > 1) throw new Unsupported(`${library}.${unit.id}: the kinds of ${library} name ${paths.size} error enums; a value alias is generated for one`);
    // U-7: the cases of in_raises and the entry point of codec-test belong to the binding of the owner (GN-5).
    aliases.push({ unit, coreIn: unit.core.in, coreOut: unit.core.out, inRaises: [], library, error: { path, kinds: rows.map((row) => ({ variant: row.variant, category: row.category as Category })) } });
  };
  for (const fn of [...functions, ...objects.flatMap((o) => o.members)]) {
    for (const type of [...fn.params.map((p) => p.type), fn.returns, fn.yields?.key, fn.yields?.value]) if (type !== undefined && type !== 'never') eachType(type, foreignAlias);
  }
  for (const record of records) for (const field of record.fields ?? []) eachType(field.type, foreignAlias);
  for (const callback of callbacks) for (const member of callback.members) for (const type of [...member.params.map((p) => p.type), member.returns]) eachType(type, foreignAlias);
  return {
    contract, version, coreCrate: contract.core.crate, coreLib, functions, constants, enums, records, resultRecords, foreignRecords, foreign,
    objects, callbacks, aliases, classes, errorUnits, coreError, kinds, faults: contract.faults ?? [], cases, aliasCases,
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
  // The core gets the value that each guard holds, which a path of a trait (ToString::to_string) does not find
  // through a borrow of the guard. The guards stay alive under the names that the borrows shadow.
  for (const place of places(model, fn)) {
    const name = place.param === undefined ? RECEIVER_GUARD : variable(place.param);
    lines.push(`        let ${name} = ${place.write ? '&mut ' : '&'}*${name};`);
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
export const recordFn = (unit: { name: Name }, library?: string): string =>
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
    // GN-6h: a place gives the core the value that its guard holds, which lockLines borrows under the name of the place,
    // in the form that the core path takes: the borrow, or a copy where the core takes the value (CoreForm).
    if (held.some((h) => h.param === p)) return `CoreForm::core_form(${variable(p)})`;
    return p.default === undefined ? coreArg(model, p.type, variable(p)) : defaultArg(model, p.type, variable(p));
  });
  // GN-6m, I-2 (4): the core function of a member with wait blocking_io takes the token first after its receiver.
  if (waitsIo(fn)) args.unshift(IO_TOKEN);
  if (fn.receiver === undefined) return args;
  const mut = fn.receiver === '&mut self';
  if (held.some((h) => h.param === undefined)) return [RECEIVER_GUARD, ...args];
  return [`${mut ? '&mut ' : '&'}${receiver}`, ...args];
}

// GN-6m: whether a member waits on blocking I/O, and the token that its core function takes.
export const waitsIo = (fn: Fn): boolean => fn.member.wait === 'blocking_io';
export const IO_TOKEN = 'binding_core::Io::for_generated_call()';

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
  return unit === undefined ? undefined : model.aliases.find((a) => a.unit === unit && a.library === libraryOf(type));
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

// The Rust type of the variable of an argument: Option<T> for one that may be left out (U-2).
export const argType = (model: Model, arg: Arg): string => (arg.default === undefined ? rustType(model, arg.type) : `Option<${rustType(model, arg.type)}>`);

// G-5: the name that a case gives a fault injection point of this contract, <library>.<id> with the library in
// snake_case.
export const pointName = (model: Model, point: FaultPoint): string => `${model.contract.library.replaceAll('-', '_')}.${point.id}`;

// G-5: the Rust items of a binding crate for the fault injection points. Each constant that the contract names exists
// in the core (I-2); with_faults runs the core call of an entry point with the faults that a test armed for its
// member, and shielded runs the work of an entry point with none.
export function faultRust(model: Model): string {
  if (model.faults.length === 0) return '';
  return `
/// G-5: the fault injection points that the contract names are constants of the core (I-2).
${model.faults.map((point) => `const _: &str = ${point.core};`).join('\n')}

/// G-5: the core call of an entry point runs with the faults that a test armed for its member on this thread, or with
/// none. The arming is taken where the core is called, so a call that fails before it leaves the arming (GN-8a).
#[cfg(feature = "fault-test")]
fn with_faults<T>(member: &str, call: impl FnOnce() -> T) -> T {
    binding_core::fault::take(member).run(call)
}

#[cfg(not(feature = "fault-test"))]
fn with_faults<T>(_member: &str, call: impl FnOnce() -> T) -> T {
    call()
}

/// G-5: the work of an entry point runs with no fault, so an entry point that a callback enters does not see the
/// faults of the call around it.
#[cfg(feature = "fault-test")]
fn shielded<T>(work: impl FnOnce() -> T) -> T {
    binding_core::fault::Armed::empty().run(work)
}

#[cfg(not(feature = "fault-test"))]
fn shielded<T>(work: impl FnOnce() -> T) -> T {
    work()
}
${model.objects.some((o) => o.members.some((m) => m.kind === 'iterate')) ? `
/// G-5: the items of an iterate, which its entry point collects inside with_faults: the core may reach a fault
/// injection point while it gives an item.
fn collected<I: IntoIterator>(items: I) -> Vec<I::Item> {
    items.into_iter().collect()
}
` : ''}`;
}

// G-5, GN-8a: the core call of an entry point, which runs in with_faults after the arguments are converted and the
// locks are taken. A call without an argument is passed as the function (a closure that only calls is refused by
// clippy), and the items of an iterate are collected inside, because the core may reach a point while it iterates.
export function armedCall(model: Model, fn: Fn, call: string): string {
  if (model.faults.length === 0) return call;
  const member = JSON.stringify(fn.member.id);
  if (fn.kind === 'iterate') return `with_faults(${member}, || collected(${call}))`;
  return call === `${fn.corePath}()` ? `with_faults(${member}, ${fn.corePath})` : `with_faults(${member}, || ${call})`;
}

// G-5: the entry point of a member, whose work is the closure of its guard call, runs that work in shielded. A
// member with two entry points (the keys and the pairs of an iterate) has two guard calls.
export function withFaults(model: Model, fn: Fn, text: string): string {
  if (model.faults.length === 0) return text;
  const guard = /guard\((py, )?\|\| /;
  const open = '$&shielded(|| ';
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

// The Rust name of the conversions of a value alias, in_<name> and out_<name>: another repository's is prefixed with its
// library, as its records are (recordFn).
export const aliasFn = (alias: ValueAlias): string => recordFn(alias.unit, alias.library);

// U-7 (a'): the Rust name of the function that turns a failure of the `in` of a library's alias into the language error.
export const aliasFailureFn = (alias: ValueAlias): string =>
  alias.library === undefined ? 'failure_error' : `${alias.library.replaceAll('-', '_')}_failure_error`;

// The value aliases of other repositories, one per library: the first of each names the library's error enum.
export const foreignAliasLibraries = (model: Model): ValueAlias[] =>
  model.aliases.filter((a, i) => a.library !== undefined && model.aliases.findIndex((b) => b.library === a.library) === i);
