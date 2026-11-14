// The resolved view of a checked contract that every emitter reads: functions with their parameters, records, enums,
// constants, error classes and the core error enum. An item that the generator does not support yet is refused here,
// by name, so that nothing is left out silently (G-4, P-4).

import { CATEGORIES, type Category, type Contract, type Default, type FaultPoint, type Field, type Lang, type Member, type Name, type Parameter, type Type, type Unit, type UnitRef, innerVariant, outerVariant, variantPattern } from '../contract.ts';
import { createHash } from 'node:crypto';
import { convert, sameName } from '../names.ts';

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

// GN-6r, U-1: a unit of visibility internal is no public API of its package.
export const isInternal = (unit: Unit): boolean => unit.visibility === 'internal';

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
  // GN-6s: a callback unit of another repository, whose trait methods return the failure of that repository's core
  // error; its types name that repository's units with their library.
  library?: string;
  error?: string;
}

export interface CallbackMember {
  member: Member;
  params: Parameter[];
  returns: Type;
  // The receiver of the trait method (U-2 core.receiver of the callback member).
  receiver: '&self' | '&mut self';
  // U-3, GN-6d: the error units that the member recognizes, and the core error of each of their kinds, an expression
  // of errors.recognized with the message of the exception in `message`.
  recognized?: { units: ErrorUnit[]; kinds: { kind: string; error: string }[] };
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
  error?: { path: string; code?: string; kinds: { variant: string; category: Category }[] };
  // GN-6x: the contract of the owner of a value class of another repository, whose in rows describe an instance of
  // the class and whose out rows make one through the members of that contract.
  owner?: Contract;
}

export interface Fn {
  unit: Unit;
  member: Member;
  // function (a member of a functions unit), or a member of a class unit: constructor, static, method, property (U-2).
  kind: 'function' | 'constructor' | 'static' | 'method' | 'property' | 'iterate';
  // The receiver of a method or property in the core (U-2 core.receiver).
  receiver?: '&self' | '&mut self' | 'self';
  module: string;
  params: Parameter[];
  record?: { unit: Unit; param: Parameter };
  args: Arg[];
  returns: Type;
  // N-4: a method that is the language's string form (stringify) or JSON hook (to_json), named by each language.
  special?: 'stringify' | 'to_json' | 'primitive';
  // N-4 iterate: what the core's iterator gives, an item or the key and the value of an entry, each borrowed.
  yields?: { key?: Type; value: Type };
  fallible: boolean;
  // GN-6s, GN-13f: the library of a member of another repository that an instance value of a case names, which a test
  // calls through the package of that library.
  library?: string;
  // E-1c: a member that takes a callback returns Result<T, Failure<E>>.
  failure: boolean;
  corePath: string;
  // GN-6q: a member with wait blocking_io whose parameter type or receiver class carries language code.
  reaches?: true;
  // GN-6ab: a member with wait async_driver that reaches language code, whose core path returns a state machine.
  machine?: true;
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
  // GN-6p: the method that a unit with cleanup names, whose call consumes the value (B-10).
  cleanup?: Fn;
}

// GN-6af: a class of origin value without core_type, a class of the language that keeps the language values that its
// constructor was given; the core function of the constructor only judges them.
export interface KeptClass {
  unit: Unit;
  // The constructor, whose core path judges the arguments, described as HostValues, and returns Result<(), Failure<E>>.
  constructor: Fn;
  // One kept value per parameter of the constructor, with its property, when the class has one of that name.
  fields: KeptField[];
  // GN-13: the constructor and the properties as the members that the tests call; a property has no core path.
  members: Fn[];
}

export interface KeptField {
  name: Name;
  // A value alias of this contract, or a list or a keyed map of one.
  type: Type;
  // The value kept when the argument is left out: the null or a new empty map or list of the language.
  default?: 'null' | 'map' | 'list';
  property?: Member;
  writable: boolean;
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

// T-9: a variant unit, a Rust enum whose cases are struct variants. Each case is also the record of its fields, named
// <variant><case>, which the emitters declare in the result form of T-4 (GN-6v).
export interface VariantCase {
  // The tag text of the case.
  value: string;
  // The Rust variant of the case: the words of the value in the Rust type form.
  rust: string;
  // The case as a record of its fields, whose id is <variant id>.<value>.
  unit: Unit;
}

export interface Variant {
  unit: Unit;
  cases: VariantCase[];
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
  // GN-7a: the variants that the core function returns in its Err; none when it returns the value itself.
  raises: string[];
}

// GN-7a: the value of a property, read from the core error `error`. The Err of a property that raises is raised in place
// of the error, by `raised` of the error that the function returned, which the arm returns.
export const propertyValue = (property: ErrorProperty, error: string, raised: (failure: string) => string): string =>
  property.raises.length === 0
    ? `${property.corePath}(${error})`
    : `match ${property.corePath}(${error}) { Ok(value) => value, Err(failure) => return ${raised('failure')} }`;

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

// GN-7b: the enum of a variant path, the outer one of a nested path <outer>/<inner>.
export const variantEnum = (variant: string): string => {
  const outer = outerVariant(variant) ?? variant;
  return outer.slice(0, outer.lastIndexOf('::'));
};

// GN-6d: the value of a variant path as an expression: <path>, or <outer>(<inner>) for a nested path.
export const variantValue = (variant: string): string => {
  const outer = outerVariant(variant);
  return outer === undefined ? variant : `${outer}(${innerVariant(variant)})`;
};

// U-3, GN-6d: the name of the function that recognizes the exceptions of a callback member.
export const recognizedFn = (cb: CallbackUnit, m: CallbackMember): string => `recognized_${rustField(cb.unit.name)}_${rustField(m.member.name)}`;

// U-3, GN-6s: the error units of other repositories that a member of a callback unit of another repository
// recognizes, each once, in the order of the callbacks: Node and WASM register their classes after the library classes.
export const ownerRecognizedUnits = (model: Pick<Model, 'foreignCallbacks'>): { library: string; unit: Unit }[] => {
  const out: { library: string; unit: Unit }[] = [];
  for (const cb of model.foreignCallbacks) {
    for (const m of cb.members) {
      for (const u of m.recognized?.units ?? []) {
        if (!out.some((o) => o.library === cb.library && o.unit.id === u.unit.id)) out.push({ library: cb.library ?? '', unit: u.unit });
      }
    }
  }
  return out;
};

// U-3, GN-6d: the match of a recognized kind, `kind` a String and `message` a &str in scope, into Some of the core error
// or None, at the given indent.
export const recognizedMatch = (m: CallbackMember, indent: string): string => `match kind.as_str() {
${(m.recognized?.kinds ?? []).map((k) => `${indent}    ${JSON.stringify(k.kind)} => Some(${k.error}),`).join('\n')}
${indent}    _ => None,
${indent}}`;

// GN-7b: what a match of the kinds reads: the error, or its code through the projection of errors.code. `error` is
// the name of an owned error, or of a reference when `borrowed`.
export const errorMatched = (model: Pick<Model, 'codeOf'>, error: string, borrowed = false): string =>
  model.codeOf === undefined ? error : `${model.codeOf}(${borrowed ? error : `&${error}`})`;

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
  // GN-6aa: the lifetime of a callback in a box of the core trait: 'env in Node, whose callback lives in the environment
  // of the call, and 'static elsewhere.
  callbackLife?: string;
  // T-3: the records of other repositories that this contract's types name, in the order they are first named.
  foreignRecords: ForeignRecord[];
  // The contracts of the libraries that the contract names (T-3).
  foreign: ReadonlyMap<string, Contract>;
  objects: ObjectClass[];
  // GN-6af: the value classes without core_type.
  kept: KeptClass[];
  // T-9: the variant units, in contract order (GN-6v).
  variants: Variant[];
  callbacks: CallbackUnit[];
  // GN-6ap: the generated interfaces, each the type that the core takes for the classes that implement it.
  interfaces: Unit[];
  // GN-6s: the callback units of other repositories that a parameter takes; the owning package declares them.
  foreignCallbacks: CallbackUnit[];
  aliases: ValueAlias[];
  classes: ErrorClass[];
  // E-2: the error units, a parent before the units that extend it (P-4).
  errorUnits: ErrorUnit[];
  coreError: string | undefined;
  // GN-7b: the projection of a struct error to the code enum whose variants the kinds are (errors.code).
  codeOf: string | undefined;
  kinds: CoreKind[];
  // G-5: the fault injection points of the core that the contract names.
  faults: FaultPoint[];
  // The contract cases of each member, from the case files that `cases` names (K-1).
  cases: Map<string, unknown[]>;
  // The cases of the in function of each value alias, from the groups that `cases` names by `alias` (U-7).
  aliasCases: Map<string, unknown[]>;
  // GN-13e: for each member, the key of each of its cases that holds its result (the `result` of the row of `cases`).
  resultKeys?: Map<string, Map<unknown, string>>;
  // GN-13h: the targets of the only of the row of `cases` that holds a case, for the cases of a row with only.
  caseTargets?: ReadonlyMap<unknown, readonly Lang[]>;
}

const simple = (name: string): string => name.slice(name.lastIndexOf('\\') + 1);

// `entering`: the type is of a value that enters the core, a parameter or a field of a record, where a callback is
// generated at its place, in a list or in an optional (U-3, GN-6aa).
function supportedType(type: Type, units: Map<string, Unit>, where: string, foreign: ReadonlyMap<string, Contract> = new Map(), entering = false): void {
  if (typeof type === 'string') {
    // T-1: a source is the original of a parsing operation, so it is a parameter (toFn) and no other place.
    if (type === 'source') throw new Unsupported(`${where}: the type source is generated as a parameter only (T-1)`);
    if (!['bool', 'int', 'int64', 'uint', 'float', 'text', 'latin1', 'bytes', 'path', 'none'].includes(type)) {
      throw new Unsupported(`${where}: the type ${type} is not generated yet`);
    }
    return;
  }
  if ('list' in type) return supportedType(type.list, units, where, foreign, entering);
  // T-2: map<T> is generated for every target, in the form that the rule of each language states.
  if ('map' in type) return supportedType(type.map, units, where, foreign);
  // T-2, U-7 (c): keyed_map<T>{key}, an ordered map whose keys mix the listed kinds.
  if ('keyed_map' in type) return supportedType(type.keyed_map, units, where, foreign);
  if ('optional' in type) return supportedType(type.optional, units, where, foreign, entering);
  if ('tuple' in type) {
    for (const part of type.tuple) supportedType(part, units, where, foreign);
    return;
  }
  // GN-6z: a function type, whose parameters and return are types of the boundary; a target that does not hold it
  // refuses it by name (generate()).
  if ('function' in type) {
    for (const part of type.function.parameters) supportedType(part, units, where, foreign);
    if (type.function.returns !== 'none') supportedType(type.function.returns, units, where, foreign);
    return;
  }
  if ('unit' in type && type.library === undefined) {
    const unit = units.get(type.unit);
    // GN-6ag: the binding converts only the types that it generates, and it generates nothing of a host unit.
    if (unit?.origin === 'host') throw new Unsupported(`${where}: a host unit ${unit.id} in a type of a generated unit is not generated (GN-6ag)`);
    if (unit?.kind === 'enum' || unit?.kind === 'record') return;
    if (unit?.kind === 'variant' && unit.origin === 'generated') return;
    if (unit?.kind === 'class' && (unit.origin === 'generated' || unit.origin === 'value')) return;
    if (unit?.kind === 'alias' && unit.origin === 'value' && typeof unit.core === 'object') return;
    if (unit?.kind === 'interface' && unit.origin === 'callback' && entering) return;
    // GN-6ap: a value of a generated interface is an instance that enters a call; toFn takes the parameter itself.
    if (unit?.kind === 'interface' && unit.origin === 'generated') throw new Unsupported(`${where}: the generated interface ${unit.id} is taken as a parameter or an optional parameter only (GN-6ap)`);
  }
  if ('unit' in type && type.library !== undefined) {
    const unit = foreign.get(type.library)?.units.find((u) => u.id === type.unit);
    if (unit?.kind === 'record' && (unit.fields ?? []).every((f) => typeof f.type === 'string')) return;
    // T-3, U-7 (a'): a value alias of another repository, whose core functions this binding calls.
    if (unit?.kind === 'alias' && unit.origin === 'value' && typeof unit.core === 'object' && unit.core_type !== undefined) return;
    // T-3, U-1, GN-6x: a value class of another repository, whose core functions this binding calls.
    if (unit?.kind === 'class' && unit.origin === 'value') {
      if (typeof unit.core === 'object' && unit.core !== null && unit.core_type !== undefined) return;
      throw new Unsupported(`${type.library}.${type.unit}: a value class of another repository without core: {in, out} and core_type is not generated (GN-6x)`);
    }
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
  const kept: KeptClass[] = [];
  const callbacks: CallbackUnit[] = [];
  const interfaces: Unit[] = [];
  const aliases: ValueAlias[] = [];
  const variants: Variant[] = [];
  const errorUnits: ErrorUnit[] = [];
  // GN-6s: the callback units of other repositories that parameters take, each wrapped once. A unit of the owning
  // contract that a member names without a library is that repository's unit.
  const foreignCallbacks: CallbackUnit[] = [];
  const foreignCallback = (id: string, library: string, where: string): boolean => {
    const owner = foreign.get(library);
    const unit = owner?.units.find((u) => u.id === id);
    if (owner === undefined || unit?.kind !== 'interface' || unit.origin !== 'callback') return false;
    if (units.has(id)) throw new Unsupported(`${where}: the callback unit ${id} of ${library} has the name of a unit of this contract (GN-6s)`);
    if (foreignCallbacks.some((c) => c.unit.id === id && c.library === library)) return true;
    const resolved = resolveNamedTypes(owner).units.find((u) => u.id === id) ?? unit;
    const qualify = (type: Type): Type => {
      if (typeof type === 'string') return type;
      if ('list' in type) return { ...type, list: qualify(type.list) };
      if ('optional' in type) return { ...type, optional: qualify(type.optional) };
      if ('map' in type) return { ...type, map: qualify(type.map) };
      if ('keyed_map' in type) return { ...type, keyed_map: qualify(type.keyed_map) };
      if ('tuple' in type) return { ...type, tuple: type.tuple.map(qualify) };
      if ('unit' in type && type.library === undefined) return { ...type, library };
      return type;
    };
    const members: CallbackMember[] = (resolved.members ?? []).map((member) => {
      if (member.kind !== 'method') throw new Unsupported(`${member.id}: a callback ${member.kind} is not generated yet`);
      if (member.async_allowed === true) throw new Unsupported(`${member.id}: an async callback is not generated yet`);
      const receiver = typeof member.core === 'object' ? member.core.receiver : undefined;
      if (receiver !== '&self' && receiver !== '&mut self') throw new Unsupported(`${member.id}: a callback member names its trait receiver &self or &mut self in core.receiver`);
      const params = (member.parameters ?? []).map((parameter) => {
        if (parameter.required !== true) throw new Unsupported(`${member.id}: a default or rest parameter is not generated yet`);
        const typed = { ...parameter, type: qualify(parameter.type) };
        supportedType(typed.type, units, `${library}.${member.id}.${parameter.name.join('_')}`, foreign);
        return typed;
      });
      const returns = qualify(member.returns ?? 'none');
      supportedType(returns, units, `${library}.${member.id} returns`, foreign);
      const recognized = (member.errors?.recognize ?? []).length === 0 ? undefined : ownerRecognized(owner, library, member);
      return { member, params, returns, receiver, ...(recognized === undefined ? {} : { recognized }) };
    });
    const paths = new Set(owner.errors.kinds.filter((row) => row.library === undefined).map((row) => row.variant.slice(0, row.variant.lastIndexOf('::'))));
    foreignCallbacks.push({ unit, members, owner: unit.thread === 'owner', library, ...(paths.size === 1 ? { error: [...paths][0] } : {}) });
    return true;
  };
  // GN-7c: a kind that the core passes on is a variant of the core error too, the outer one that holds it.
  const ownVariants = new Set(contract.errors.kinds.map((row) => row.variant));
  const carrying = carriers(contract.units, foreign);
  const toFn = (unit: Unit, member: Member, kind: Fn['kind']): Fn => {
    if (member.native !== undefined) throw new Unsupported(`${member.id}: native is not generated yet`);
    // GN-6m, GN-6n: a member with wait blocking_io, process_wait or async_driver is generated in the form of each
    // language; another wait is not.
    if (member.wait !== undefined && member.wait !== 'none' && member.wait !== 'blocking_io' && member.wait !== 'process_wait' && member.wait !== 'async_driver') throw new Unsupported(`${member.id}: wait ${member.wait} is not generated yet`);
    let reachesCode = false;
    if (member.wait === 'blocking_io' || member.wait === 'process_wait' || member.wait === 'async_driver') {
      const rule = WAIT_RULE[member.wait];
      if (kind === 'constructor' || kind === 'property' || kind === 'iterate') throw new Unsupported(`${member.id}: a ${kind} with wait ${member.wait} is not generated (${rule})`);
      reachesCode = (member.parameters ?? []).some((p) => carrying.carries(p.type)) || (kind === 'method' && carrying.classes.has(unit.id));
      // GN-6ab: a future that a runtime polls on its own threads would call the language code there, so the core gives a
      // state machine; a machine that borrowed its receiver across its steps would borrow from the guard of the driver.
      if (reachesCode && member.wait === 'async_driver') {
        if (typeof member.core !== 'object' || member.core.machine !== true) throw new Unsupported(`${member.id}: a member with wait async_driver that reaches language code names machine: true in its core (GN-6ab, CK-68)`);
        // GN-6ae, CK-69: a method with machine gives the core a clone of the value of its instance.
        if (kind === 'method' && typeof member.core === 'object' && member.core.receiver !== '&self') throw new Unsupported(`${member.id}: a method with machine names the receiver &self (GN-6ae, CK-69)`);
        for (const p of member.parameters ?? []) {
          if (p.default !== undefined) throw new Unsupported(`${member.id}.${p.name.join('_')}: a parameter with a default of a member with machine is not generated yet (GN-6ab)`);
          if (p.core !== undefined && p.core !== 'value') throw new Unsupported(`${member.id}.${p.name.join('_')}: a machine owns its arguments, so a class parameter of a member with machine takes the borrow value (GN-6ab)`);
        }
      }
    }
    const core = member.core;
    if (core === undefined) throw new Unsupported(`${member.id}: a member without a core path is not generated`);
    const corePath = typeof core === 'string' ? core : core.path;
    const receiver = typeof core === 'object' ? core.receiver : undefined;
    const wantsReceiver = kind === 'method' || kind === 'property' || kind === 'iterate';
    if (wantsReceiver !== (receiver !== undefined)) throw new Unsupported(`${member.id}: a ${kind} ${wantsReceiver ? 'needs' : 'takes no'} receiver`);
    const params = member.parameters ?? [];
    if (kind === 'property' && params.length > 0) throw new Unsupported(`${member.id}: a property takes no parameter`);
    const args: Arg[] = [];
    let record: Fn['record'];
    for (const parameter of params) {
      const where = `${member.id}.${parameter.name.join('_')}`;
      if (parameter.rest === true) throw new Unsupported(`${where}: a rest parameter is not generated yet`);
      const type = parameter.type;
      if (parameter.core !== undefined && typeof type === 'object' && 'optional' in type && !(typeof type.optional === 'object' && 'unit' in type.optional && units.get(type.optional.unit)?.kind === 'interface')) throw new Unsupported(`${where}: the borrow of an optional class is not generated yet`);
      // GN-6h, CK-67: a class parameter names the borrow of the core; no default stands for it.
      const classUnit = typeof type === 'object' && 'unit' in type && type.library === undefined ? units.get(type.unit) : undefined;
      if (classUnit?.kind === 'class' && classUnit.origin === 'generated' && parameter.core === undefined) throw new Unsupported(`${where}: a class parameter names the borrow that the core takes in core (GN-6h)`);
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
        for (const field of recordUnit.fields ?? []) args.push({ name: field.name, type: field.type, field: true, ...declaredDefault(field, `${recordUnit.id}.${field.name.join('_')}`, true, units, foreign) });
        continue;
      }
      // GN-6ae: a parameter of a function type whose function returns passthrough belongs to a member with machine;
      // the core moves that value without reading it. Any other function type is a value of GN-6z.
      // A function of a member with machine that returns another type is refused by name: the machine owns its function
      // and settles what it returned as a Passthrough, which GN-6z does not make.
      if (typeof type === 'object' && 'function' in type && !machineFunction(type) && reachesCode && member.wait === 'async_driver') throw new Unsupported(`${where}: a function parameter of a member with machine returns passthrough (GN-6ae)`);
      if (machineFunction(type)) {
        if (!(reachesCode && member.wait === 'async_driver')) throw new Unsupported(`${where}: a parameter of a function type that returns passthrough is generated for a member with machine only (GN-6ae)`);
        if (type.function.errors !== undefined) throw new Unsupported(`${where}: the recognized errors of a function parameter are not generated yet (GN-6ae)`);
        for (const [i, part] of type.function.parameters.entries()) supportedType(part, units, `${where} parameter ${i}`, foreign);
        args.push({ name: parameter.name, type, field: false, ...declaredDefault(parameter, where, false, units, foreign) });
        continue;
      }
      // GN-6s: a callback unit of another repository as a parameter, which this wraps and has judged.
      const foreignDirect = typeof type === 'object' && 'unit' in type && type.library !== undefined && foreignCallback(type.unit, type.library, where);
      // T-1: a source is taken as a parameter, or an optional one.
      const source = type === 'source' || (typeof type === 'object' && 'optional' in type && type.optional === 'source');
      // GN-6ap: a generated interface as a parameter, or an optional one; the core takes the value, so no borrow is named.
      const inner = typeof type === 'object' && 'optional' in type ? type.optional : type;
      const iface = typeof inner === 'object' && 'unit' in inner && inner.library === undefined ? units.get(inner.unit) : undefined;
      const generatedInterface = iface?.kind === 'interface' && iface.origin === 'generated';
      if (generatedInterface && parameter.core !== undefined) throw new Unsupported(`${where}: a parameter of the generated interface ${iface.id} names no core borrow, because the core takes the value (GN-6ap)`);
      if (!source && !foreignDirect && !generatedInterface) supportedType(type, units, where, foreign, true);
      args.push({ name: parameter.name, type, field: false, ...declaredDefault(parameter, where, false, units, foreign) });
    }
    // U-2: a parameter that may be left out is followed by such parameters only: PHP and Python take the positional
    // parameters in order, and PHP also the fields of the record that follow them.
    const firstDefault = args.findIndex((a) => a.default !== undefined);
    const late = firstDefault < 0 ? undefined : args.slice(firstDefault).find((a) => a.default === undefined);
    if (late !== undefined) throw new Unsupported(`${member.id}: the required ${late.name.join('_')} follows a parameter with a default, which is not generated yet (U-2)`);
    const isForeignCallback = (type: Type): boolean => typeof type === 'object' && 'unit' in type && type.library !== undefined && foreignCallbacks.some((c) => c.unit.id === type.unit && c.library === type.library);
    // E-1c: a member that calls language code, a callback or a function (GN-6z, GN-6ae), fails with the core error or with
    // what that code raised.
    const takesCallback = args.some((a) => holdsCallback(units, a.type) || holdsFunction(a.type) || isForeignCallback(a.type));
    const returns = kind === 'constructor' ? { unit: unit.id } : (member.returns ?? 'none');
    // T-2 never: a member that always fails returns Result<Infallible, E>, so it raises.
    if (returns === 'never' && (member.raises ?? []).length === 0) throw new Unsupported(`${member.id}: a never return without raises`);
    // GN-6ae: a result passthrough is the value that a function of the machine returned.
    const passes = typeof returns === 'object' && 'passthrough' in returns;
    if (passes && !(reachesCode && member.wait === 'async_driver')) throw new Unsupported(`${member.id}: a result passthrough is generated for a member with machine only (GN-6ae)`);
    if (returns !== 'never' && !passes) supportedType(returns, units, `${member.id} returns`, foreign);
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
      ...(receiver === undefined ? {} : { receiver: receiver as '&self' | '&mut self' | 'self' }),
      module: unit.module,
      params,
      args,
      returns,
      ...(yields === undefined ? {} : { yields }),
      // E-1c: core.result says whether the core path returns a Result; without it, a path does when raises names a
      // variant of the core error of this contract or the member takes a callback.
      // E-1c, GN-7: core.failure names a member that calls language code that its receiver keeps.
      fallible: (typeof core === 'object' ? core.result : undefined) ?? ((member.raises ?? []).some((variant) => ownVariants.has(variant)) || takesCallback || (typeof core === 'object' && core.failure === true)),
      failure: (typeof core === 'object' ? core.failure : undefined) ?? takesCallback,
      corePath,
      ...(record === undefined ? {} : { record }),
      ...(reachesCode && (member.wait === 'blocking_io' || member.wait === 'process_wait') ? { reaches: true as const } : {}),
      ...(reachesCode && member.wait === 'async_driver' ? { machine: true as const } : {}),
    };
  };
  // GN-6af: a value class without core_type keeps the language values that its constructor takes, which the core path
  // of the constructor judges as HostValues; a property gives the value kept under its name.
  const keptClass = (unit: Unit): KeptClass => {
    const valueType = (type: Type): boolean => {
      if (typeof type === 'string') return false;
      if ('list' in type) return valueType(type.list);
      if ('keyed_map' in type) return valueType(type.keyed_map);
      if (!('unit' in type) || type.library !== undefined) return false;
      const alias = units.get(type.unit);
      return alias?.kind === 'alias' && alias.origin === 'value';
    };
    const members = unit.members ?? [];
    const made = members.filter((m) => m.kind === 'constructor');
    const [construct] = made;
    if (construct === undefined || made.length > 1 || unit.constructible === false) throw new Unsupported(`${unit.id}: a value class without core_type has one constructor (GN-6af)`);
    const fields: KeptField[] = [];
    for (const parameter of construct.parameters ?? []) {
      const where = `${construct.id}.${parameter.name.join('_')}`;
      if (!valueType(parameter.type)) throw new Unsupported(`${where}: a parameter of a value class without core_type is a value alias, or a list or a keyed map of one (GN-6af)`);
      const declared = parameter.default;
      let kept: KeptField['default'];
      if (declared !== undefined) {
        const container = typeof parameter.type === 'object' && 'list' in parameter.type ? 'list' : typeof parameter.type === 'object' && 'keyed_map' in parameter.type ? 'map' : undefined;
        if ('literal' in declared && declared.literal === null && container === undefined) kept = 'null';
        else if ('empty' in declared && declared.empty === container && container !== undefined) kept = container;
        else throw new Unsupported(`${where}: the default ${JSON.stringify(declared)} of a value class without core_type is not generated (GN-6af)`);
      }
      fields.push({ name: parameter.name, type: parameter.type, ...(kept === undefined ? {} : { default: kept }), writable: false });
    }
    const fn = toFn(unit, { ...construct, parameters: (construct.parameters ?? []).map(({ default: _default, ...parameter }) => parameter) }, 'constructor');
    fn.args = fn.args.map((arg, index) => {
      const declared = construct.parameters?.[index]?.default;
      return declared === undefined ? arg : { ...arg, default: declared };
    });
    // G-7: the tests count the parameters that the call may leave out.
    fn.params = fn.params.map((param, index) => {
      const declared = construct.parameters?.[index]?.default;
      return declared === undefined ? param : { ...param, default: declared };
    });
    if (!fn.fallible) throw new Unsupported(`${construct.id}: the constructor of a value class without core_type judges its arguments and returns a Result (GN-6af)`);
    for (const member of members) {
      if (member.kind === 'constructor') continue;
      const name = member.name.join('_');
      const field = fields.find((f) => f.name.join('_') === name);
      if (member.kind !== 'property' || member.core !== undefined || (member.parameters ?? []).length > 0 || field === undefined || JSON.stringify(member.returns) !== JSON.stringify(field.type)) {
        throw new Unsupported(`${member.id}: a member of a value class without core_type is a property without core that gives the constructor parameter of its name (GN-6af)`);
      }
      if (member.native !== undefined || (member.wait !== undefined && member.wait !== 'none') || (member.raises ?? []).length > 0) throw new Unsupported(`${member.id}: a property of a value class without core_type neither waits nor raises (GN-6af)`);
      field.property = member;
      field.writable = member.writable === true;
    }
    const hidden = fields.find((f) => f.property === undefined);
    if (hidden !== undefined) throw new Unsupported(`${construct.id}.${hidden.name.join('_')}: a value class without core_type has a property for each value that it keeps (GN-6af)`);
    const properties = fields.flatMap((f): Fn[] =>
      f.property === undefined
        ? []
        : [{ unit, member: f.property, kind: 'property', receiver: '&self', module: unit.module, params: [], args: [], returns: f.type, fallible: false, failure: false, corePath: '' }],
    );
    return { unit, constructor: fn, fields, members: [fn, ...properties] };
  };
  for (const unit of contract.units) {
    const before = refusals.found.length;
    refusals.attempt(() => collectUnit(unit));
    if (refusals.found.length > before) refusedUnits.add(unit.id);
  }
  function collectUnit(unit: Unit): void {
    // GN-6ag, I-1: a host unit is code of the repository whose source is its declaration; the binding writes nothing of it.
    if (unit.origin === 'host') return;
    // GN-6r: an internal unit is generated as a public one and marked by each target; a member of a public unit has
    // one form in every language, so an internal one is refused.
    if (unit.visibility === 'public') {
      const hidden = (unit.members ?? []).filter((m) => m.visibility !== 'public');
      if (hidden.length > 0) throw new Unsupported(hidden.map((m) => `${m.id}: an internal member of a public unit is not generated yet (GN-6r)`));
    }
    if (unit.native !== undefined) throw new Unsupported(`${unit.id}: native is not generated yet`);
    if (unit.kind === 'enum') {
      enums.push(unit);
      return;
    }
    if (unit.kind === 'record') {
      let refused = false;
      for (const field of unit.fields ?? []) {
        refused = refusals.attempt(() => {
          declaredDefault(field, `${unit.id}.${field.name.join('_')}`, true, units);
          supportedType(field.type, units, `${unit.id}.${field.name.join('_')}`, foreign, true);
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
      if (unit.abstract === true) throw new Unsupported(`${unit.id}: an abstract class is not generated yet`);
      if (unit.core_type === undefined) {
        kept.push(keptClass(unit));
        return;
      }
      const members: Fn[] = [];
      let refused = false;
      for (const member of unit.members ?? []) refused = refusals.attempt(() => classMember(member)) === undefined || refused;
      function classMember(member: Member): true {
        if (!['constructor', 'static', 'method', 'property', 'iterate', 'stringify', 'to_json', 'primitive'].includes(member.kind)) throw new Unsupported(`${member.id}: a ${member.kind} is not generated yet`);
        if (member.kind === 'primitive' && (typeof member.returns !== 'string' || !['int', 'int64', 'uint', 'float'].includes(member.returns))) throw new Unsupported(`${member.id}: a primitive returns a number (N-4, GN-6g)`);
        if (member.kind === 'stringify' || member.kind === 'to_json' || member.kind === 'primitive') {
          if ((unit.members ?? []).filter((m) => m.kind === member.kind).length > 1) throw new Unsupported(`${unit.id}: a class has one ${member.kind} (N-4)`);
          if ((member.parameters ?? []).length > 0) throw new Unsupported(`${member.id}: a ${member.kind} takes no parameter (N-4)`);
          if (member.kind === 'stringify' && member.returns !== 'text') throw new Unsupported(`${member.id}: a stringify returns text (N-4)`);
          // GN-6m, GN-6n: the language calls a hook in its own protocol, which awaits nothing.
          if (member.wait === 'blocking_io' || member.wait === 'process_wait' || member.wait === 'async_driver') throw new Unsupported(`${member.id}: a ${member.kind} with wait ${member.wait} is not generated (${WAIT_RULE[member.wait]})`);
          members.push({ ...toFn(unit, member, 'method'), special: member.kind });
          return true;
        }
        if (member.kind === 'iterate' && (unit.members ?? []).filter((m) => m.kind === 'iterate').length > 1) throw new Unsupported(`${unit.id}: a class iterates once (N-4)`);
        if (member.kind === 'property' && member.writable === true) throw new Unsupported(`${member.id}: a writable property is not generated yet`);
        members.push(toFn(unit, member, member.kind as Fn['kind']));
        return true;
      }
      // GN-6w: a class that implements a callback interface of this contract has each member of the interface that it
      // does not declare, a method that calls the trait method on the held value; the trait returns Failure<E> (GN-6d).
      for (const ref of unit.implements ?? []) refused = refusals.attempt(() => implemented(ref)) === undefined || refused;
      function implemented(ref: { unit: string; library?: string }): true {
        if (ref.library !== undefined) throw new Unsupported(`${unit.id}: implements ${ref.library}.${ref.unit}, an interface of another repository, which is not generated yet`);
        const iface = units.get(ref.unit);
        // GN-6ap: a generated interface has no member that the class gets; the class enters where the interface is taken.
        if (iface?.kind === 'interface' && iface.origin === 'generated') return true;
        if (iface?.kind !== 'interface' || iface.origin !== 'callback') throw new Unsupported(`${unit.id}: implements ${ref.unit}, which is no callback interface of this contract (U-1)`);
        for (const member of iface.members ?? []) {
          if ((unit.members ?? []).some((own) => sameName(own.name, member.name))) continue;
          const receiver = typeof member.core === 'object' ? member.core.receiver : undefined;
          if (receiver !== '&self') throw new Unsupported(`${unit.id}: the member ${member.id} that it implements takes the receiver ${String(receiver)}, which an implemented member is not generated for yet (GN-6w)`);
          const fn = toFn(unit, { ...member, id: `${unit.id}.${member.name.map((w) => (typeof w === 'string' ? w : w.acronym)).join('_')}`, kind: 'method' }, 'method');
          // The trait method is called on the core type, so the guard of a lock derefs to it (UFCS infers no Self).
          const method = fn.corePath.slice(fn.corePath.lastIndexOf('::') + 2);
          members.push({ ...fn, corePath: `<${unit.core_type ?? ''} as ${typeof iface.core === 'string' ? iface.core : ''}>::${method}`, fallible: true, failure: true });
        }
        return true;
      }
      // A refused member is named already; the class is not checked against the members that are left.
      if (refused) throw new Unsupported([]);
      const constructible = unit.constructible !== false;
      if (constructible !== members.some((m) => m.kind === 'constructor')) {
        throw new Unsupported(`${unit.id}: a constructible class has one constructor and another none (U-1 constructible)`);
      }
      // GN-6p: the cleanup call of a class is its method that consumes the value, or one that writes it and leaves it.
      const cleanup = unit.cleanup === undefined ? undefined : members.find((m) => m.member.id === unit.cleanup);
      if (unit.cleanup !== undefined && (cleanup?.kind !== 'method' || (cleanup.receiver !== 'self' && cleanup.receiver !== '&mut self'))) throw new Unsupported(`${unit.id}: the cleanup ${unit.cleanup} is no method with the receiver self or &mut self (GN-6p)`);
      objects.push({ unit, members, constructible, ...(cleanup === undefined ? {} : { cleanup }) });
      return;
    }
    // T-9, GN-6v: a variant is the Rust enum of core_type; each case is a struct variant of its fields, which follow the
    // result form of T-4.
    if (unit.kind === 'variant' && unit.origin === 'generated') {
      if (unit.core_type === undefined) throw new Unsupported(`${unit.id}: a variant names its core enum in core_type (T-9)`);
      const tag = convert(unit.tag ?? [], 'rust', 'variable');
      const cases: VariantCase[] = [];
      let refused = false;
      for (const kase of unit.cases ?? []) {
        const words = caseWords(kase.value);
        const rust = convert(words, 'rust', 'class');
        const twice = cases.find((c) => c.rust === rust);
        if (twice !== undefined) refusals.refuse(`${unit.id}: the cases ${twice.value} and ${kase.value} are the one Rust variant ${rust} (GN-6v)`);
        for (const field of kase.fields) {
          const where = `${unit.id}.${kase.value}.${field.name.join('_')}`;
          refused = refusals.attempt(() => {
            if (convert(field.name, 'rust', 'variable') === tag) throw new Unsupported(`${where}: a field has the name of the tag (GN-6v)`);
            // GN-6v: an optional field whose default is {literal: null} may be left out, which is the null it holds.
            if (!caseLeftOut(field)) {
              declaredDefault(field, where, true, units);
              if (field.default !== undefined) throw new Unsupported(`${where}: a field default of a case other than {literal: null} of an optional field is not generated yet (T-4, T-9)`);
            }
            supportedType(field.type, units, where, foreign);
            const held = heldInCase(field.type, units);
            if (held !== undefined) throw new Unsupported(`${where}: a ${held} in a case of a variant is not generated yet (GN-6v)`);
            return true;
          }) === undefined || refused;
        }
        cases.push({ value: kase.value, rust, unit: { id: `${unit.id}.${kase.value}`, name: [...unit.name, ...words], module: unit.module, kind: 'record', visibility: unit.visibility, origin: 'generated', fields: kase.fields } });
      }
      if (refused) throw new Unsupported([]);
      variants.push({ unit, cases });
      return;
    }
    if (unit.kind === 'alias' && unit.origin === 'value') {
      if (typeof unit.core !== 'object') throw new Unsupported(`${unit.id}: a value alias without core: {in, out} is not generated`);
      if (unit.core_type === undefined) throw new Unsupported(`${unit.id}: a value alias names its core type in core_type`);
      aliases.push({ unit, coreIn: unit.core.in, coreOut: unit.core.out, inRaises: unit.in_raises ?? [] });
      return;
    }
    // GN-6ap: a generated interface is the type that the core takes for the classes that implement it.
    if (unit.kind === 'interface' && unit.origin === 'generated') {
      if (unit.core_type === undefined) throw new Unsupported(`${unit.id}: a generated interface names in core_type the type that the core takes (GN-6ap)`);
      if ((unit.members ?? []).length > 0) throw new Unsupported(`${unit.id}: a generated interface that declares members is not generated yet (GN-6ap)`);
      if (!contract.units.some((u) => u.kind === 'class' && u.origin === 'generated' && u.core_type !== undefined && (u.implements ?? []).some((ref) => ref.library === undefined && ref.unit === unit.id))) {
        throw new Unsupported(`${unit.id}: no generated class of this contract implements the generated interface (GN-6ap)`);
      }
      interfaces.push(unit);
      return;
    }
    if (unit.kind === 'interface' && unit.origin === 'callback') {
      const members: CallbackMember[] = [];
      let refused = false;
      for (const member of unit.members ?? []) refused = refusals.attempt(() => callbackMember(member)) === undefined || refused;
      function callbackMember(member: Member): true {
        if (member.kind !== 'method') throw new Unsupported(`${member.id}: a callback ${member.kind} is not generated yet`);
        if (member.async_allowed === true) throw new Unsupported(`${member.id}: an async callback is not generated yet`);
        if ((member.errors?.recognize ?? []).some((ref) => ref.library !== undefined)) throw new Unsupported(`${member.id}: a recognized error unit of another library is not generated yet`);
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
        const returns = member.returns ?? 'none';
        const base = typeof returns === 'object' && 'optional' in returns ? returns.optional : returns;
        const textList = typeof returns === 'object' && 'list' in returns && returns.list === 'text';
        if (!textList && (typeof base !== 'string' || !['bool', 'int', 'int64', 'uint', 'float', 'text', 'bytes'].includes(base))) {
          throw new Unsupported(`${member.id}: a property of an error unit of type ${JSON.stringify(returns)} is not generated yet`);
        }
        return { member, corePath: member.core.path, returns, raises: member.raises ?? [] };
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
  refusals.attempt(() => assignLocks(contract, units, objects, [...functions, ...objects.flatMap((o) => o.members)], callbacks, foreign));
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
    // GN-7c, E-1b (a): a row of another library names <outer>/<inner>, the variant of the core error that holds the error
    // of the library and the variant of that error, and takes the category of the library's row of <inner>. A row with
    // `source` is a variant of this crate (E-1b (b)) and is generated as any other.
    if (row.library !== undefined && outerVariant(row.variant) === undefined) {
      throw new Unsupported(`${row.variant}: a kind of another library names the variant of the core error that holds it, <outer>/<inner> (GN-7c)`);
    }
    if (row.library === undefined && outerVariant(row.variant) !== undefined) throw new Unsupported(`${row.variant}: a kind of this library names no inner variant (GN-7c)`);
    const category = row.library === undefined ? row.category : foreign.get(row.library)?.errors.kinds.find((k) => k.variant === innerVariant(row.variant))?.category;
    if (category === undefined) {
      throw new Unsupported(row.library === undefined ? `${row.variant}: a kind of this library names its category` : `${row.variant}: ${row.library} declares no kind ${innerVariant(row.variant)} (GN-7c)`);
    }
    if (row.class === undefined) return [{ variant: row.variant, category, className: className(category) }];
    // The unit that the row names was refused, and is named already.
    if (refusedUnits.has(row.class)) return [];
    const unit = errorUnits.find((u) => u.unit.id === row.class);
    if (unit === undefined || unit.category !== category) throw new Unsupported(`${row.variant}: the class ${row.class} is not an error unit of category ${category} (E-2)`);
    return [{ variant: row.variant, category, className: className(category), unit }];
  }) ?? []);
  // GN-7a: a variant that a property raises is a kind whose class has no property that raises, so that making one
  // error makes at most one other.
  for (const unit of errorUnits) {
    for (const property of unit.properties) {
      for (const variant of property.raises) {
        const kind = kinds.find((k) => k.variant === variant);
        if (kind === undefined) refusals.refuse(`${property.member.id}: the variant ${variant} of its raises is no kind of errors.kinds (GN-7a)`);
        else if (kind.unit !== undefined && errorProperties(kind.unit).some(({ property: p }) => p.raises.length > 0)) {
          refusals.refuse(`${property.member.id}: the kind ${variant} of its raises has the class ${kind.unit.unit.id}, which has a property that raises (GN-7a)`);
        }
      }
    }
  }
  if (contract.errors.binding.length > 0) refusals.refuse('errors.binding overrides are not generated yet');
  // U-3, GN-6d: the kinds that a callback member recognizes, of the rows whose class is a recognized unit or extends one.
  for (const callback of callbacks) {
    for (const cm of callback.members) {
      const refs = cm.member.errors?.recognize ?? [];
      if (refs.length === 0) continue;
      refusals.attempt(() => {
        const units = refs.map((ref) => {
          const found = errorUnits.find((u) => u.unit.id === ref.unit);
          if (found === undefined) throw new Unsupported(`${cm.member.id}: ${ref.unit} is no error unit that is generated (U-3)`);
          return found;
        });
        const recognizedFn = contract.errors.recognized;
        if (recognizedFn === undefined) throw new Unsupported(`${cm.member.id}: errors.recognized names no function that makes the core error of a recognized kind (GN-6d)`);
        const extendsOne = (unit: ErrorUnit | undefined): boolean => unit !== undefined && (units.includes(unit) || extendsOne(unit.parent));
        const recognizedKinds = kinds.filter((k) => extendsOne(k.unit)).map((k) => {
          const row = contract.errors.kinds.find((r) => r.variant === k.variant && r.library === undefined);
          if (row?.kinds !== undefined) throw new Unsupported(`${k.variant}: a recognized variant of two or more kinds is not generated yet`);
          return { kind: kindText(k.variant), error: `${recognizedFn}(${variantValue(k.variant)}, &message)` };
        });
        cm.recognized = { units, kinds: recognizedKinds };
        return true;
      });
    }
  }
  const enumPaths = new Set(kinds.map((k) => variantEnum(k.variant)));
  if (enumPaths.size > 1) refusals.refuse(`the kinds name ${enumPaths.size} error enums; one is generated`);
  // GN-7b: the kinds are variants of an error enum, or of the code enum of the struct error that errors.code names.
  const [kindEnum] = [...enumPaths];
  const coreError = kindEnum === undefined ? undefined : contract.errors.code?.error ?? kindEnum;
  const codeOf = kindEnum === undefined ? undefined : contract.errors.code?.path;
  // E-1c: the error of a Result is the core error of E-1, which a contract without kinds does not name.
  const unnamed = coreError === undefined && contract.errors.kinds.length === 0 ? [...functions, ...objects.flatMap((o) => o.members)].filter((fn) => fn.fallible && !fn.failure) : [];
  for (const fn of unnamed) refusals.refuse(`${fn.member.id}: its core returns a Result (core.result), but errors.kinds names no core error`);
  for (const alias of aliases) {
    const foreignVariant = alias.inRaises.find((variant) => variantEnum(variant) !== kindEnum);
    if (foreignVariant !== undefined) refusals.refuse(`${alias.unit.id}: in_raises names ${foreignVariant}, which is no variant of the core error ${String(kindEnum)}`);
  }
  const result = new Set<string>();
  const foreignRecords: ForeignRecord[] = [];
  const visit = (type: Type): void => {
    if (typeof type === 'string') return;
    if ('list' in type) return visit(type.list);
    // T-2: a record that is the value of a map or of a keyed map leaves in its result form too.
    if ('map' in type) return visit(type.map);
    if ('keyed_map' in type) return visit(type.keyed_map);
    if ('optional' in type) return visit(type.optional);
    if ('tuple' in type) return type.tuple.forEach(visit);
    if ('unit' in type && type.library === undefined) {
      const unit = units.get(type.unit);
      if (unit?.kind === 'record' && !result.has(unit.id)) {
        result.add(unit.id);
        for (const field of unit.fields ?? []) visit(field.type);
      }
      // T-9: a record in a case of a variant has its result form too.
      if (unit?.kind === 'variant' && !result.has(unit.id)) {
        result.add(unit.id);
        for (const kase of unit.cases ?? []) for (const field of kase.fields) visit(field.type);
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
  // GN-6aa: a record with a callback field is made from the arguments of a call, as a record parameter (T-4).
  for (const unit of resultRecords.filter((r) => (r.fields ?? []).some((f) => holdsCallback(units, f.type)))) {
    refusals.refuse(`${unit.id}: a record with a callback field is generated as a record parameter only (GN-6aa)`);
  }
  // T-4: what the result form of a field with a default holds when the core gives None is not decided, except for a
  // field of an optional type, whose None is the null of its result form (GN-6i).
  for (const unit of resultRecords) {
    const field = (unit.fields ?? []).find((f) => f.default !== undefined && !ownOption(f));
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
    const valueClass = unit.kind === 'class' && unit.origin === 'value';
    if ((unit.kind !== 'alias' && !valueClass) || typeof unit.core !== 'object' || aliases.some((a) => a.unit === unit)) return;
    const rows = foreign.get(library)?.errors.kinds ?? [];
    const dependent = rows.find((row) => row.library !== undefined || row.category === undefined);
    if (dependent !== undefined) throw new Unsupported(`${library}.${unit.id}: a value alias whose owner forwards the kind ${dependent.variant} of another library is not generated yet`);
    const paths = new Set(rows.map((row) => variantEnum(row.variant)));
    const [enumPath] = [...paths];
    if (enumPath === undefined || paths.size > 1) throw new Unsupported(`${library}.${unit.id}: the kinds of ${library} name ${paths.size} error enums; a value alias is generated for one`);
    // GN-7b: the error of a struct that holds a code enum is the type that its owner names, matched by its code.
    const code = foreign.get(library)?.errors.code;
    const path = code?.error ?? enumPath;
    // U-7: the cases of in_raises and the entry point of codec-test belong to the binding of the owner (GN-5).
    const error = { path, ...(code === undefined ? {} : { code: code.path }), kinds: rows.map((row) => ({ variant: row.variant, category: row.category as Category })) };
    // GN-6x: a value class is described by its in rows and made by its out rows, members of the owner's contract.
    const owner = valueClass ? foreign.get(library) : undefined;
    aliases.push({ unit, coreIn: unit.core.in, coreOut: unit.core.out, inRaises: [], library, error, ...(owner === undefined ? {} : { owner }) });
  };
  for (const fn of [...functions, ...objects.flatMap((o) => o.members)]) {
    for (const type of [...fn.params.map((p) => p.type), fn.returns, fn.yields?.key, fn.yields?.value]) if (type !== undefined && type !== 'never') eachType(type, foreignAlias);
  }
  for (const record of records) for (const field of record.fields ?? []) eachType(field.type, foreignAlias);
  for (const callback of [...callbacks, ...foreignCallbacks]) for (const member of callback.members) for (const type of [...member.params.map((p) => p.type), member.returns]) eachType(type, foreignAlias);
  return {
    contract, version, coreCrate: contract.core.crate, coreLib, functions, constants, enums, records, resultRecords, foreignRecords, foreign,
    objects, variants, kept, callbacks, interfaces, foreignCallbacks, aliases, classes, errorUnits, coreError, codeOf, kinds, faults: contract.faults ?? [], cases, aliasCases,
  };
}

// B-5c: how the core takes a class parameter. The contract does not name the borrow of a parameter yet, so every class
// parameter is borrowed shared, a read place; a contract that names `&mut` makes it a write place here.
export const paramBorrow = (parameter: Parameter): '&' | '&mut' | 'value' | undefined => parameter.core;

const WRITE_RECEIVERS: ReadonlySet<string> = new Set(['&mut self', 'self']);
const receiverOfMember = (member: Member): string | undefined => (typeof member.core === 'object' ? member.core.receiver : undefined);
const waits = (member: Member): boolean => member.wait !== undefined && member.wait !== 'none';

// GN-6h: the class units that carry language code, the least set that satisfies the two definitions. The set is read
// from the contract alone, so it also counts members that the generator refuses for another reason.
export function carriers(units: readonly Unit[], foreign: ReadonlyMap<string, Contract> = new Map()): { classes: Set<string>; carries: (type: Type) => boolean } {
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
    if (!('unit' in type)) return false;
    // GN-6s: a callback unit of another repository carries language code as one of this repository does.
    if (type.library !== undefined) return foreign.get(type.library)?.units.find((u) => u.id === type.unit)?.origin === 'callback';
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
function assignLocks(contract: Contract, units: Map<string, Unit>, objects: ObjectClass[], fns: Fn[], callbacks: CallbackUnit[], foreign: ReadonlyMap<string, Contract>): void {
  const carrying = carriers(contract.units, foreign);
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
      allMembers.some((m) => (!waiting || waits(m)) && (m.parameters ?? []).some((p) => names(p.type, id) && borrows.includes(paramBorrow(p) ?? 'value')));
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

// T-5: the member that makes an instance of the class: a constructor or a static member that returns it.
export const factoryOf = (model: Model, object: ObjectClass): Fn | undefined =>
  object.members.find((m) => m.kind === 'constructor' || (m.kind === 'static' && unitOf(model, m.returns) === object.unit));

// G-5, GN-13f: the member that makes the placeholder instance of a class: its own factory, or else the first function,
// then the first static member of another class, that returns the class. A member without a receiver is one call of
// placeholder arguments; a method would need an instance of its own class first.
export const makerOf = (model: Model, object: ObjectClass): Fn | undefined =>
  factoryOf(model, object) ??
  model.functions.find((fn) => unitOf(model, fn.returns) === object.unit) ??
  model.objects.flatMap((o) => o.members).find((m) => m.kind === 'static' && unitOf(model, m.returns) === object.unit);

// GN-6h, B-5c: a class whose instance the poison test gives: a class with a write place that the target makes.
export const poisoned = (model: Model, object: ObjectClass): boolean => object.lock?.writes === true && factoryOf(model, object) !== undefined;

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
      // GN-6ap: a value of a generated interface is an instance of a class that implements it.
      if (model.interfaces.some((i) => i.id === record['unit']) && (object.unit.implements ?? []).some((ref) => ref.library === undefined && ref.unit === record['unit'])) return true;
      const unit = model.contract.units.find((u) => u.id === record['unit']);
      if (unit?.kind !== 'record' || seen.has(unit.id)) return false;
      seen.add(unit.id);
      return names(unit.fields ?? []);
    }
    // GN-6ae: the parameters of a function type go out to the function; only what it returns comes in.
    if (typeof record['function'] === 'object' && record['function'] !== null) return names((record['function'] as Record<string, unknown>)['returns']);
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
// `borrowed` false leaves out the borrows of guardBorrows, which a call binds inside the future or the closure that owns
// the guards.
export function lockLines(model: Model, fn: Fn, variable: (parameter: Parameter) => string, receiver: string, fail: string, label: (object: ObjectClass) => string, borrowed = true): string[] {
  const lines: string[] = [];
  const reads = new Map<ObjectClass['unit'], string[]>();
  for (const place of places(model, fn)) {
    const name = place.param === undefined ? RECEIVER_GUARD : variable(place.param);
    const cell = place.param === undefined ? receiver : name;
    const text = JSON.stringify(label(place.object));
    // GN-6o: the place of the receiver self takes the value out of the lock, which the core consumes.
    if (place.param === undefined && fn.receiver === 'self') {
      lines.push(`        let ${name} = ${cell}.take(${text}).map_err(${fail})?;`);
      continue;
    }
    if (place.write) {
      lines.push(`        let mut ${name} = ${cell}.write(${text}).map_err(${fail})?;`);
      // GN-6p: a cleanup with the receiver &mut self marks its object once it holds the write guard, whatever the core gives.
      if (place.param === undefined && place.object.cleanup?.member.id === fn.member.id) lines.push(`        ${cell}.clean();`);
      continue;
    }
    const beside = reads.get(place.object.unit) ?? [];
    lines.push(`        let ${name} = ${cell}.read(${text}, &[${beside.map((b) => `Some(&${b})`).join(', ')}]).map_err(${fail})?;`);
    reads.set(place.object.unit, [...beside, name]);
  }
  if (borrowed) lines.push(...guardBorrows(model, fn, variable).map((line) => `        ${line}`));
  return lines;
}

// GN-6h: the core gets the value that each guard holds, which a path of a trait (ToString::to_string) does not find
// through a borrow of the guard. The guards stay alive under the names that the borrows shadow; where the core call runs
// in a future or a closure that leaves the call, the guards move into it and these lines are its first statements.
// GN-6o: the receiver self is the value itself, which the core consumes.
export function guardBorrows(model: Model, fn: Fn, variable: (parameter: Parameter) => string): string[] {
  const lines: string[] = [];
  for (const place of places(model, fn)) {
    if (place.param === undefined && fn.receiver === 'self') continue;
    const name = place.param === undefined ? RECEIVER_GUARD : variable(place.param);
    lines.push(`let ${name} = ${place.write ? '&mut ' : '&'}*${name};`);
  }
  return lines;
}

// The Rust type of a contract type at the core boundary (T-1, T-2).
// `inside`: the type is inside another type, or a field of a record, where a callback is a box of the core trait (GN-6aa).
// GN-6z: the alias of a function type that the core may keep. A crate names the type by its alias at each place and
// writes the type once, in the definition of the alias, because the lints deny the boxed type at a let and as the result
// of a closure (clippy type_complexity). The name is `Function` and eight hexadecimal digits of the SHA-256 of the
// type, so the same type has the same alias at every place of every crate and two types have two.
const FUNCTION_ALIASES = new Map<string, string>();
function functionAlias(type: string): string {
  const name = `Function${createHash('sha256').update(type).digest('hex').slice(0, 8)}`;
  const earlier = FUNCTION_ALIASES.get(name);
  if (earlier !== undefined && earlier !== type) throw new Error(`GN-6z: the function types ${earlier} and ${type} have the alias ${name}`);
  FUNCTION_ALIASES.set(name, type);
  return name;
}

// GN-6z: the text of a crate with the definition of each alias of a function type that it names, after its last item;
// an alias that the definition of another names is defined too.
export function withFunctionAliases(crate: string): string {
  const defined = new Map<string, string>();
  for (let text = crate, grew = true; grew;) {
    grew = false;
    for (const [name, type] of FUNCTION_ALIASES) {
      if (defined.has(name) || !new RegExp(`\\b${name}\\b`).test(text)) continue;
      defined.set(name, type);
      text += `\n${type}`;
      grew = true;
    }
  }
  if (defined.size === 0) return crate;
  const lines = [...defined].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, type]) => `/// GN-6z: a function that the core may keep.\ntype ${name} = ${type};\n`);
  return `${crate.replace(/\n*$/, '\n')}\n${lines.join('\n')}`;
}

export function rustType(model: Model, type: Type, inside = false): string {
  if (typeof type === 'string') {
    const base: Record<string, string> = {
      bool: 'bool', int: 'i64', int64: 'i64', uint: 'u64', float: 'f64', text: 'String', latin1: 'Vec<u8>', bytes: 'Vec<u8>', source: 'Vec<u8>', path: 'std::path::PathBuf', none: '()',
    };
    const found = base[type];
    if (found === undefined) throw new Unsupported(`the type ${type}`);
    return found;
  }
  if ('list' in type) return `Vec<${rustType(model, type.list, true)}>`;
  if ('map' in type) return `binding_core::OrderedMap<${rustType(model, type.map, true)}>`;
  if ('keyed_map' in type) return `binding_core::KeyedMap<${rustType(model, type.keyed_map, true)}>`;
  if ('optional' in type) return `Option<${rustType(model, type.optional, true)}>`;
  if ('tuple' in type) return `(${type.tuple.map((t) => rustType(model, t, true)).join(', ')})`;
  // GN-6z: the core takes a function by value in the form that it may keep, its parameters borrowed as those of a
  // callback member (T-1).
  if ('function' in type) {
    const { parameters, returns } = type.function;
    return functionAlias(`Box<dyn Fn(${parameters.map((p) => traitParam(model, p)).join(', ')}) -> Result<${returns === 'none' ? '()' : rustType(model, returns)}, binding_core::Failure<${model.coreError ?? '()'}>> + Send + Sync>`);
  }
  if ('unit' in type) {
    const unit = unitOf(model, type);
    // U-3: a callback is the generated struct that implements the core trait over the language object.
    if (unit?.origin === 'callback') return inside ? `Box<dyn ${unit.core ?? ''} + ${model.callbackLife ?? "'static"}>` : `Cb${convert(unit.name, 'rust', 'class')}`;
    if (unit?.core_type === undefined) throw new Unsupported(`${type.unit} has no core_type`);
    // GN-6aa: the core type of a record with a callback field has one lifetime, which the binding writes.
    if (unit.kind === 'record' && (unit.fields ?? []).some((f) => holdsCallback(new Map(model.contract.units.map((u) => [u.id, u])), f.type))) return `${unit.core_type}<${model.callbackLife ?? "'static"}>`;
    return unit.core_type;
  }
  throw new Unsupported(JSON.stringify(type));
}

// T-1: how the core takes an argument of a parameter. A type written with two forms (text String/&str, latin1, bytes,
// source Vec<u8>/&[u8], path PathBuf/&Path) is taken borrowed, and optional<T> of one as Option<borrowed>, which the
// generated code passes with as_deref(); a Copy type is taken by value; any other type by reference.
export function coreArg(model: Model, type: Type, variable: string): string {
  // GN-6z: a function moves into the core, which may keep it.
  if (byValue(model, type) || (typeof type === 'object' && 'function' in type)) return variable;
  // GN-6ap: the core takes the value of a generated interface, and an optional one as an Option of it.
  if (interfaceOf(model, typeof type === 'object' && 'optional' in type ? type.optional : type) !== undefined) return variable;
  // GN-6aa: a list or an optional that holds a callback moves into the core, which may call a member of &mut self.
  if (typeof type === 'object' && !('unit' in type) && holdsCallback(new Map(model.contract.units.map((u) => [u.id, u])), type)) return variable;
  // U-3: the core takes a callback as &mut (or, by coercion, &) of the struct, which the block moves into a temporary.
  if (unitOf(model, type)?.origin === 'callback') return `&mut { ${variable} }`;
  if (typeof type === 'object' && 'optional' in type) {
    const inner = type.optional;
    if (typeof inner === 'string' && ['text', 'latin1', 'bytes', 'source', 'path'].includes(inner)) return `${variable}.as_deref()`;
    throw new Unsupported(`an optional parameter of ${JSON.stringify(inner)} is not generated yet`);
  }
  // GN-6ad: a list whose items narrow is a Vec of the core's item type, whose slice the core borrows.
  if (typeof type === 'object' && 'list' in type && narrows(type)) return `&${variable}[..]`;
  return `&${variable}`;
}

// GN-6aa: whether a type holds a callback unit of this contract, in a list, an optional, a map or a tuple.
export function holdsCallback(units: ReadonlyMap<string, Unit>, type: Type): boolean {
  if (typeof type === 'string' || 'function' in type) return false;
  if ('list' in type) return holdsCallback(units, type.list);
  if ('optional' in type) return holdsCallback(units, type.optional);
  if ('map' in type) return holdsCallback(units, type.map);
  if ('keyed_map' in type) return holdsCallback(units, type.keyed_map);
  if ('tuple' in type) return type.tuple.some((part) => holdsCallback(units, part));
  return 'unit' in type && type.library === undefined && units.get(type.unit)?.origin === 'callback';
}

// GN-6ae: whether a type is a function type whose function returns passthrough, the function parameter of a member
// with machine; any other function type is a value of GN-6z.
export type MachineFunction = { function: { parameters: Type[]; returns: { passthrough: string }; async_allowed?: boolean; errors?: { recognize: UnitRef[]; reason: string } } };
export function machineFunction(type: Type): type is MachineFunction {
  return typeof type === 'object' && 'function' in type && typeof type.function.returns === 'object' && 'passthrough' in type.function.returns;
}

// GN-6z: whether a type holds a function type, at any place of a list, an optional, a map or a tuple.
export function holdsFunction(type: Type): boolean {
  if (typeof type === 'string') return false;
  if ('function' in type) return true;
  if ('list' in type) return holdsFunction(type.list);
  if ('optional' in type) return holdsFunction(type.optional);
  if ('map' in type) return holdsFunction(type.map);
  if ('keyed_map' in type) return holdsFunction(type.keyed_map);
  if ('tuple' in type) return type.tuple.some(holdsFunction);
  return false;
}

// GN-6z: whether a member of the contract takes a function type that the core may keep; the function of a member with
// machine (GN-6ae) is no such value, so it brings none of the helpers of GN-6z.
export function takesFunction(model: Model): boolean {
  return [...model.functions, ...model.objects.flatMap((o) => o.members)].some((fn) => fn.args.some((a) => holdsFunction(a.type) && !machineFunction(a.type)));
}

// U-3: whether a contract has a callback or a function type, of GN-6z or of GN-6ae, whose call keeps what the language
// code threw.
export function keepsThrown(model: Model): boolean {
  return model.callbacks.length > 0 || model.foreignCallbacks.length > 0 || [...model.functions, ...model.objects.flatMap((o) => o.members)].some((fn) => fn.args.some((a) => holdsFunction(a.type)));
}

// GN-6u: whether the binding holds Natives: for a value alias, or for a function type.
export function usesNative(model: Model): boolean {
  return model.aliases.length > 0 || takesFunction(model);
}

// T-1: the type of a parameter of a callback member or of a function type: a type with two forms is borrowed, a Copy
// type by value, a list as a slice, and any other type by reference.
export function traitParam(model: Model, type: Type): string {
  if (typeof type === 'string') {
    const borrowed: Record<string, string> = { text: '&str', latin1: '&[u8]', bytes: '&[u8]', source: '&[u8]', path: '&std::path::Path' };
    return borrowed[type] ?? rustType(model, type);
  }
  if ('optional' in type && typeof type.optional === 'string' && ['text', 'latin1', 'bytes'].includes(type.optional)) return `Option<${traitParam(model, type.optional)}>`;
  if ('list' in type) return `&[${rustType(model, type.list)}]`;
  if (byValue(model, type)) return rustType(model, type);
  return `&${rustType(model, type)}`;
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

// The snake_case name of a unit in the names of its conversions, in_<name> and out_<name>.
export const recordFn = (unit: { name: Name }): string => rustField(unit.name);

// GN-4c: the module of a generated crate that holds the conversions of the units of another library. The path names
// the library and the unit apart, so the unit a_b of the library c and the unit b of the library c_a share no name,
// and neither shares one with an own unit c_a_b. The module states its family first, as a function does, because a
// library takes any name, also std, core or the name of a crate that the generated code uses.
export const libraryModule = (library: string): string => `library_${library.replaceAll('-', '_')}`;

// GN-4c: the path, from any module of the crate, of a function of a family (in, out, make) of a unit: the function
// itself for an own unit, and the function of the module of its library for a unit of another library.
export const unitFn = (family: string, unit: { name: Name }, library?: string): string =>
  library === undefined ? `${family}_${recordFn(unit)}` : `${libraryModule(library)}::${family}_${recordFn(unit)}`;

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
  // GN-6ab: a state machine owns its arguments, so the core takes each by value, a class by the clone of its value.
  if (fn.machine === true) {
    const owned = fn.params.map((p) => (held.some((h) => h.param === p) ? `(*${variable(p)}).clone()` : variable(p)));
    if (fn.receiver === undefined) return owned;
    // GN-6ae: the receiver is a clone of the value of the instance, a handle whose clones share one state.
    // GN-6h: the receiver of a class with a lock is the borrow of the value that its guard holds.
    return [held.some((h) => h.param === undefined) ? `Clone::clone(${RECEIVER_GUARD})` : `Clone::clone(&*${receiver})`, ...owned];
  }
  const args = fn.params.map((p) => {
    // GN-6aa: a record that holds a callback moves into the core.
    if (fn.record !== undefined && p === fn.record.param) return fn.args.some((a) => a.field && unitOf(model, a.type)?.origin === 'callback') ? rustField(p.name) : `&${rustField(p.name)}`;
    // GN-6h: a place gives the core the value that its guard holds, which lockLines borrows under the name of the place,
    // in the form that the core path takes: the borrow, or a copy where the core takes the value (CoreForm).
    // A parameter whose `core` is `value` gives a clone of the value under its read guard, as the contract names it.
    if (held.some((h) => h.param === p)) return paramBorrow(p) === 'value' ? `(*${variable(p)}).clone()` : `CoreForm::core_form(${variable(p)})`;
    return p.default === undefined || ownOption(p) ? coreArg(model, p.type, variable(p)) : defaultArg(model, p.type, variable(p));
  });
  // GN-6m, I-2 (4): the core function of a member with wait blocking_io or process_wait takes its token first after
  // its receiver.
  if (waitsIo(fn)) args.unshift(waitsProcess(fn) ? PROCESS_TOKEN : IO_TOKEN);
  if (fn.receiver === undefined) return args;
  const mut = fn.receiver === '&mut self';
  // GN-6o: the receiver self is the value that its place took; any other receiver is the borrow that lockLines bound.
  if (held.some((h) => h.param === undefined)) return [RECEIVER_GUARD, ...args];
  return [`${mut ? '&mut ' : '&'}${receiver}`, ...args];
}

// GN-6p: the core type of a class unit with cleanup implements binding_core::Cleanup, and that of every other class
// unit does not: the second assertion names a method of two implementations of NotCleanup, which is ambiguous, so it
// does not compile, when the type implements Cleanup.
export function cleanupAsserts(model: Model): string {
  if (model.objects.length === 0) return '';
  const lines = model.objects.map((o) => (o.cleanup === undefined
    ? `const _: fn() = <${o.unit.core_type ?? ''} as NotCleanup<_>>::not_cleanup;`
    : `const _: fn() = cleanup::<${o.unit.core_type ?? ''}>;`));
  return `
/// GN-6p: a class unit with cleanup holds a core type that implements Cleanup (B-10).
${model.objects.some((o) => o.cleanup !== undefined) ? `const fn cleanup<T: binding_core::Cleanup>() {}\n` : ''}${model.objects.some((o) => o.cleanup === undefined) ? `/// GN-6p: a core type that implements Cleanup has two implementations of this trait, so its not_cleanup is ambiguous.
trait NotCleanup<A> {
    fn not_cleanup() {}
}
impl<T: ?Sized> NotCleanup<()> for T {}
impl<T: ?Sized + binding_core::Cleanup> NotCleanup<u8> for T {}
` : ''}${lines.join('\n')}
`;
}

// GN-6p: the question of the lock that tells the destructor of a class with cleanup that the cleanup call was made: the
// value was taken (receiver self), or the object was marked (receiver &mut self).
export const cleanupMade = (object: ObjectClass): string => (object.cleanup?.receiver === 'self' ? 'taken' : 'cleaned');

// GN-6p: the message of the warning of an object destroyed without its cleanup call (B-10).
export const cleanupWarning = (className: string, cleanupName: string): string =>
  `${className} was destroyed without ${cleanupName}(), so its destructor released it (B-10)`;

// GN-6m: whether a member waits on blocking I/O, and the token that its core function takes.
// GN-6m: a member that waits in a blocking call of its core, for I/O or for another process.
export const waitsIo = (fn: Fn): boolean => fn.member.wait === 'blocking_io' || fn.member.wait === 'process_wait';
// GN-6m, B-5 (b): a member that waits for another process, which no pool of threads that other calls share runs.
export const waitsProcess = (fn: Fn): boolean => fn.member.wait === 'process_wait';
const IO_TOKEN = 'binding_core::Io::for_generated_call()';
const PROCESS_TOKEN = 'binding_core::ProcessWait::for_generated_call()';

// GN-6m, GN-6n: the rule of each wait that the generator takes.
const WAIT_RULE = { blocking_io: 'GN-6m', process_wait: 'GN-6m', async_driver: 'GN-6n' } as const;

// GN-6n: whether a member awaits an async fn of the core, and whether a contract has such a member.
export const waitsAsync = (fn: Fn): boolean => fn.member.wait === 'async_driver';
// GN-6m, GN-6n: whether a member waits, so that it has the awaited form of each language.
export const awaits = (fn: Fn): boolean => waitsIo(fn) || waitsAsync(fn);
export const drivesAsync = (model: Model): boolean => [...model.functions, ...model.objects.flatMap((o) => o.members)].some(waitsAsync);

// GN-6n: the future of the core call of a member with wait async_driver, which owns the converted arguments and the
// guards, with the arming of its faults installed around each poll.
export function futureOf(model: Model, fn: Fn, body: string): string {
  const future = `async move { ${body} }`;
  return model.faults.length === 0 ? future : `armed_future(${JSON.stringify(fn.member.id)}, ${future})`;
}

// GN-6n: the core call of a member with wait async_driver that waits on the calling thread (PHP, Python): blocked
// gives the form of the wait around block_on, and failed the conversion of a BindingError. GN-6ab: the core call of a
// member with machine makes the machine, a temporary of the call of drive, and drive makes its calls on the calling
// thread and waits for each of its futures in the same form. GN-6ae: awaited gives the outcome of a value that a function of the machine returned; PHP
// and Go have no awaitable, so they settle the value at once.
export const drivenCall = (model: Model, fn: Fn, core: string, blocked: (wait: string) => string, failed: string, awaited = '|value| Ok(Ok(value))'): string =>
  fn.machine === true
    ? `binding_core::machine::drive(&mut ${core}, |io| driven(${blocked(`binding_core::driver::block_on(binding_core::driver::Caught::new(${model.faults.length === 0 ? 'io' : `armed_future(${JSON.stringify(fn.member.id)}, io)`}))`)}), ${awaited}).map_err(${failed})?`
    : `driven(${blocked(`binding_core::driver::block_on(binding_core::driver::Caught::new(${futureOf(model, fn, `${core}.await`)}))`)}).map_err(${failed})?`;

// GN-6ae: the arm of an awaited value of a machine that Node or WASM advances, for a member without a function
// parameter: the core makes a Passthrough only from a value that the binding gave it, so such a machine awaits none.
export const awaitsNone = (fn: Fn): string =>
  `binding_core::machine::Next::Await(_value) => Err(binding_error(BindingError::Internal { detail: String::from(${JSON.stringify(`GN-6ae: ${fn.member.id} awaits no value of language code`)}) })),`;

// GN-6n: the end of the future of a member with wait async_driver on the calling thread: a runtime that cannot be made,
// or a panic of a poll, is a failure of kind internal (B-7).
export const DRIVEN = `
/// GN-6n: the end of the future of a member with wait async_driver; a panic of a poll is kind internal (B-7).
fn driven<T>(ended: Result<Result<T, String>, BindingError>) -> Result<T, BindingError> {
    ended.and_then(|result| result.map_err(|detail| BindingError::Internal { detail }))
}
`;

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
      // GN-6ap: a value of a generated interface is an instance of a class that implements it.
      if (model.interfaces.some((i) => i.id === record['unit']) && (object.unit.implements ?? []).some((ref) => ref.library === undefined && ref.unit === record['unit'])) return true;
      const unit = model.contract.units.find((u) => u.id === record['unit']);
      if (unit?.kind !== 'record' || seen.has(unit.id)) return false;
      seen.add(unit.id);
      return names(unit.fields ?? []);
    }
    // GN-6ae: the arguments of a function parameter leave to language code and its result is a passthrough, so a
    // class that a function type names does not come in by it.
    return Object.entries(record).some(([key, item]) => key !== 'name' && key !== 'function' && names(item));
  };
  const fns = [...model.functions, ...model.objects.flatMap((o) => o.members)];
  return fns.some((fn) => fn.args.some((a) => names(a.type))) || model.callbacks.some((c) => c.members.some((m) => names(m.returns)));
}

// N-4: the name of a member in a language. A stringify and a to_json have the name of the language's hook, any other
// member the converted name of the contract (N-2).
export function memberName(lang: Lang, fn: Fn): string {
  if (fn.special === 'stringify') return lang === 'python' ? '__str__' : lang === 'php' ? '__toString' : 'toString';
  if (fn.special === 'to_json') return lang === 'php' ? 'jsonSerialize' : 'toJSON';
  if (fn.special === 'primitive') return 'valueOf';
  return langName(lang, fn.member.name, 'callable');
}

// N-4: how a language runs the hook of a stringify or a to_json on an instance, which is how a generated test calls
// it: a hook is called by the language, with the arguments of the language's protocol.
export function hookCall(lang: 'python' | 'node' | 'php', fn: Fn, receiver: string): string | undefined {
  if (fn.special === 'stringify') return { python: `str(${receiver})`, node: `String(${receiver})`, php: `(string) ${receiver}` }[lang];
  if (fn.special === 'to_json') return { python: undefined, node: `JSON.stringify(${receiver})`, php: `\\json_encode(${receiver})` }[lang];
  if (fn.special === 'primitive') return { python: undefined, node: `Number(${receiver})`, php: undefined }[lang];
  return undefined;
}

// Q-4 only: the units and the members that a language has; a unit or a member whose only names other targets is not
// generated there (GN-6af). N-4: Python has no JSON hook, so a to_json is no member of Python; only JavaScript has the
// hook of a primitive (valueOf).
export function membersFor(model: Model, lang: Lang): Model {
  const unitHas = (unit: Unit): boolean => unit.only === undefined || unit.only.targets.includes(lang);
  const has = (fn: Fn): boolean =>
    unitHas(fn.unit) && (fn.member.only === undefined || fn.member.only.targets.includes(lang)) && !(lang === 'python' && fn.special === 'to_json') &&
    !(fn.special === 'primitive' && lang !== 'node' && lang !== 'wasm');
  return {
    ...model,
    functions: model.functions.filter(has),
    constants: model.constants.filter((c) => unitHas(c.unit)),
    enums: model.enums.filter(unitHas),
    records: model.records.filter(unitHas),
    resultRecords: model.resultRecords.filter(unitHas),
    objects: model.objects.filter((o) => unitHas(o.unit)).map((o) => ({ ...o, members: o.members.filter(has) })),
    kept: model.kept.filter((k) => unitHas(k.unit)),
    callbacks: model.callbacks.filter((c) => unitHas(c.unit)),
    interfaces: model.interfaces.filter(unitHas),
    aliases: model.aliases.filter((a) => unitHas(a.unit)),
    errorUnits: model.errorUnits.filter((u) => unitHas(u.unit)),
    // GN-13h: a case of a row with only is a case of the targets that the only lists alone.
    cases: new Map([...model.cases].map(([id, items]) => [id, items.filter((item) => model.caseTargets?.get(item)?.includes(lang) ?? true)])),
  };
}

// The model as one language's emitter reads it: each error class and kind has the class name of that language (E-2),
// and the members are those of the language (Q-4 only).
export function forLanguage(model: Model, lang: Lang): Model {
  const classes = model.classes.map((c) => ({ ...c, name: c.names[lang] ?? c.name }));
  const nameOf = (category: Category): string => classes.find((c) => c.category === category)?.name ?? '';
  return { ...membersFor(model, lang), classes, kinds: model.kinds.map((k) => ({ ...k, className: nameOf(k.category) })), callbackLife: lang === 'node' ? "'env" : "'static" };
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
      ...(u.cases === undefined ? {} : { cases: u.cases.map((c) => ({ ...c, fields: c.fields.map((f) => ({ ...f, type: resolve(f.type) })) })) }),
    })),
  };
}

// U-7: the value alias of a type, when the type is one.
// GN-6af: the value class without core_type that a type names.
export const keptUnit = (model: Model, type: Type): KeptClass | undefined => {
  const unit = unitOf(model, type);
  return libraryOf(type) === undefined ? model.kept.find((k) => k.unit === unit) : undefined;
};

export const aliasOf = (model: Model, type: Type): ValueAlias | undefined => {
  const unit = unitOf(model, type);
  return unit === undefined ? undefined : model.aliases.find((a) => a.unit === unit && a.library === libraryOf(type));
};

// U-2, T-4: the declared default of a parameter or a field, with the forms that are generated; any other is refused by
// name (G-4). The core takes Option<T> and decides the value of None; a {literal} or {const} default, which every
// declaration shows, names the constant of the core that it equals in default_core. A default of an optional type is
// {literal: null} or {computed}, and the core takes the Option of the optional type itself (GN-6i); a {literal: null}
// default of a value type names no constant, because the core decides what no value is.
// U-3, GN-6s, GN-6d: the kinds that a member of a callback unit of another repository recognizes, read from the
// contract of its owner: the error units of the owner that the member names, and for each row of the owner's
// errors.kinds whose class is one of them or extends one, the owner's errors.recognized on the variant of the row. The
// owner's core makes its own error, so this binding reads no source of the owner. An error unit of a third library,
// an owner without errors.recognized and a recognized variant of two or more kinds are refused by name (G-4).
function ownerRecognized(owner: Contract, library: string, member: Member): NonNullable<CallbackMember['recognized']> {
  const where = `${library}.${member.id}`;
  const errorUnit = (id: string, seen = 0): ErrorUnit => {
    const unit = owner.units.find((u) => u.id === id && u.kind === 'error');
    if (unit === undefined || unit.category === undefined) throw new Unsupported(`${where}: ${id} is no error unit of ${library} (U-3, GN-6s)`);
    if (seen > owner.units.length) throw new Unsupported(`${where}: the parents of ${id} of ${library} form a cycle (P-4)`);
    return { unit, category: unit.category, properties: [], ...(unit.parent === undefined ? {} : { parent: errorUnit(unit.parent, seen + 1) }) };
  };
  const units = (member.errors?.recognize ?? []).map((ref) => {
    if (ref.library !== undefined && ref.library !== library) throw new Unsupported(`${where}: a recognized error unit of another library than ${library} is not generated (U-3, GN-6s)`);
    return errorUnit(ref.unit);
  });
  const make = owner.errors.recognized;
  if (make === undefined) throw new Unsupported(`${where}: errors.recognized of ${library} names no function that makes its core error of a recognized kind (GN-6d, GN-6s)`);
  const extendsOne = (unit: ErrorUnit | undefined): boolean => unit !== undefined && (units.some((u) => u.unit.id === unit.unit.id) || extendsOne(unit.parent));
  const kinds = owner.errors.kinds.filter((row) => row.library === undefined && row.class !== undefined && extendsOne(errorUnit(row.class))).map((row) => {
    if (row.kinds !== undefined) throw new Unsupported(`${library}.${row.variant}: a recognized variant of two or more kinds is not generated yet`);
    return { kind: kindText(row.variant), error: `${make}(${variantValue(row.variant)}, &message)` };
  });
  return { units, kinds };
}

// U-7, GN-6x: whether a type names a value alias of this contract, or a value alias or value class of another one.
function valueTyped(type: Type, units: Map<string, Unit>, foreign: ReadonlyMap<string, Contract> | undefined): boolean {
  if (typeof type !== 'object' || !('unit' in type)) return false;
  const unit = type.library === undefined ? units.get(type.unit) : foreign?.get(type.library)?.units.find((u) => u.id === type.unit);
  if (unit?.origin !== 'value') return false;
  return unit.kind === 'alias' || (unit.kind === 'class' && type.library !== undefined);
}

function declaredDefault(item: Parameter | Field, where: string, field: boolean, units: Map<string, Unit>, foreign?: ReadonlyMap<string, Contract>): { default?: Default; defaultCore?: string } {
  const declared = item.default;
  if (declared === undefined) return {};
  const type = item.type;
  if (typeof type === 'object' && 'optional' in type) {
    if (('literal' in declared && declared.literal === null) || 'computed' in declared) return { default: declared };
    throw new Unsupported(`${where}: a default of an optional type is {literal: null} or {computed} (U-2)`);
  }
  const unit = typeof type === 'object' && 'unit' in type && type.library === undefined ? units.get(type.unit) : undefined;
  if (unit?.kind === 'alias' && unit.origin === 'value' && 'literal' in declared && declared.literal === null) return { default: declared };
  const container = typeof type !== 'object' ? undefined : 'list' in type ? 'list' : 'map' in type || 'keyed_map' in type ? 'map' : undefined;
  // U-2, GN-6i: {empty: "object"} of a value alias (U-7) or of a value class or value alias of another repository
  // (GN-6x, U-7 (a')) is left out as None; the core decides that no value is the empty object.
  if ('empty' in declared && declared.empty === 'object' && valueTyped(type, units, foreign)) return { default: declared };
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
    if (unit?.kind === 'enum') {
      if (!(unit.variants ?? []).some((v) => v.value === value)) throw new Unsupported(`${where}: the default {literal: ${JSON.stringify(value)}} of the type ${JSON.stringify(type)} is not generated (U-2)`);
      return { default: declared, defaultCore: item.default_core };
    }
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

// GN-6i: whether an argument with a default is of an optional type, whose own Option the core takes: a value that was
// left out and a null are both None.
export const ownOption = (arg: { type: Type; default?: Default }): boolean => arg.default !== undefined && typeof arg.type === 'object' && 'optional' in arg.type;

// The Rust type of the variable of an argument: Option<T> for one that may be left out (U-2), and the optional type
// itself for one of an optional type.
export const argType = (model: Model, arg: Arg): string => (arg.default === undefined || ownOption(arg) ? rustType(model, arg.type, arg.field) : `Option<${rustType(model, arg.type, arg.field)}>`);

// GN-6i, GN-13d: whether a type takes null as a value: an optional type, and a value alias, which its core judges.
export const takesNull = (model: Model, type: Type): boolean => (typeof type === 'object' && 'optional' in type) || aliasOf(model, type) !== undefined;

// U-2, GN-15e: whether Go takes an argument as a pointer to its type, nil when it is left out; an optional type with a
// default keeps its own pointer.
export const pointed = (arg: { type: Type; default?: Default }): boolean => arg.default !== undefined && !ownOption(arg);

// U-2, GN-6i: the conversion of an argument that may be left out, from the call of in_default; the Option of an
// optional type is flattened, so that a value left out and a null are both None.
export const leftOut = (arg: Arg, call: string): string => (ownOption(arg) ? `${call}.map(Option::flatten)` : call);

// GN-6aa: the conversion of a callback that enters inside another type, or as a field of a record, as a box of the core
// trait; any other conversion as it is.
export function boxed(model: Model, type: Type, converted: string): string {
  if (unitOf(model, type)?.origin !== 'callback') return converted;
  return `${converted}.map(|callback| -> ${rustType(model, type, true)} { Box::new(callback) })`;
}

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

${drivesAsync(model) ? `/// G-5, GN-6n: the future of a member with wait async_driver, with the arming that a test armed for its member on this
/// thread installed around each poll.
#[cfg(feature = "fault-test")]
fn armed_future<F: std::future::Future>(member: &str, future: F) -> binding_core::fault::Around<F> {
    binding_core::fault::take(member).around(future)
}

#[cfg(not(feature = "fault-test"))]
fn armed_future<F: std::future::Future>(_member: &str, future: F) -> F {
    future
}

` : ''}/// G-5: the work of an entry point runs with no fault, so an entry point that a callback enters does not see the
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
    alias.inRaises.map((variant) => `#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]\nconst _: fn(&${model.coreError ?? '()'}) -> bool = |error| matches!(${errorMatched(model, 'error', true)}, ${variantPattern(variant)});`));
  return asserts.length === 0 ? '' : `\n/// U-7, I-2: the kinds of in_raises are variants of the error of the alias's in function.\n${asserts.join('\n')}\n`;
}

// The name of a value alias in the names of its conversions, in_<name>, out_<name> and make_<name>, which are functions
// of the module of its library when the alias is of another library (unitFn).
export const aliasFn = (alias: ValueAlias): string => recordFn(alias.unit);

// GN-4c: the conversions of the units of other libraries, as the blocks of usedHelpers: the text of the records and
// of the value aliases of each library under the name of its module.
export function libraryBlocks(model: Model, record: (unit: Unit, library: string) => string, alias: (alias: ValueAlias) => string): Record<string, string> {
  const blocks: Record<string, string> = {};
  const add = (library: string, text: string): void => {
    const module = libraryModule(library);
    blocks[module] = blocks[module] === undefined ? text : `${blocks[module]}\n${text}`;
  };
  for (const r of model.foreignRecords) add(r.library, record(r.unit, r.library));
  for (const a of model.aliases) if (a.library !== undefined) add(a.library, alias(a));
  return blocks;
}

// U-7 (a'): the Rust name of the function that turns a failure of the `in` of a library's alias into the language error.
export const aliasFailureFn = (alias: ValueAlias): string =>
  alias.library === undefined ? 'failure_error' : `failure_of_${alias.library.replaceAll('-', '_')}`;

// The value aliases of other repositories, one per library: the first of each names the library's error enum.
export const foreignAliasLibraries = (model: Model): ValueAlias[] =>
  model.aliases.filter((a, i) => a.library !== undefined && model.aliases.findIndex((b) => b.library === a.library) === i);

// GN-5, GN-6ae: whether the crates of a contract keep a table of what was thrown, whose entries the entry point of
// thrown-count-test counts: a member takes a callback unit, of this contract or of another, or a function type, or the
// contract has a value alias with core, whose walk keeps what the language code threw. The contract and the contracts
// that it names decide it, so that the manifest and the crate agree.
export function countsThrown(contract: Contract, foreign: ReadonlyMap<string, Contract> = new Map()): boolean {
  const called = (type: Type): boolean => {
    if (typeof type === 'string') return false;
    if ('function' in type) return true;
    if ('list' in type) return called(type.list);
    if ('optional' in type) return called(type.optional);
    if ('map' in type) return called(type.map);
    if ('keyed_map' in type) return called(type.keyed_map);
    if ('tuple' in type) return type.tuple.some(called);
    if (!('unit' in type)) return false;
    const owner = type.library === undefined ? contract : foreign.get(type.library);
    return owner?.units.some((unit) => unit.id === type.unit && unit.origin === 'callback') === true;
  };
  return contract.units.some((unit) =>
    (unit.kind === 'alias' && unit.origin === 'value' && typeof unit.core === 'object')
    || (unit.origin !== 'callback' && (unit.members ?? []).some((member) => (member.parameters ?? []).some((parameter) => called(parameter.type)))));
}

// GN-6ae: whether a member takes a callback unit or a function type, so that its call may keep what the language code
// threw; the generated test of each of its cases reads the count of thrown-count-test after the call.
export function callsCode(model: Model, fn: Fn): boolean {
  const called = (type: Type): boolean => {
    if (typeof type === 'string') return false;
    if ('function' in type) return true;
    if ('list' in type) return called(type.list);
    if ('optional' in type) return called(type.optional);
    if ('map' in type) return called(type.map);
    if ('keyed_map' in type) return called(type.keyed_map);
    if ('tuple' in type) return type.tuple.some(called);
    if (!('unit' in type)) return false;
    return [...model.callbacks, ...model.foreignCallbacks].some((callback) => callback.unit.id === type.unit && callback.library === type.library);
  };
  return countsThrown(model.contract, model.foreign) && fn.args.some((arg) => called(arg.type));
}

// GN-6u: the member whose generated test gives an object through a native row and back: a function without a receiver
// that takes a value alias of this repository, with an out row of kind native in the target, as its one parameter and
// returns it. The contract alone decides it, so that the manifest and the tests agree.
export function nativeRoundTrip(contract: Contract, lang: Lang): Member | undefined {
  const isUnit = (type: Type | undefined, id: string): boolean => typeof type === 'object' && 'unit' in type && type.unit === id && type.library === undefined;
  for (const unit of contract.units) {
    if (unit.kind !== 'alias' || unit.origin !== 'value') continue;
    if (!(unit.out ?? []).some((row) => row.kind === 'native' && row.make[lang] !== undefined)) continue;
    for (const owner of contract.units) {
      if (owner.kind !== 'functions') continue;
      const found = (owner.members ?? []).find((m) => m.kind === 'function' && (m.parameters ?? []).length === 1 && isUnit(m.parameters?.[0]?.type, unit.id) && isUnit(m.returns, unit.id));
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

// GN-6v: the words of the tag text of a case, split at an underscore and before a capital: IfBlock and if_block are the
// words if and block.
export const caseWords = (value: string): string[] =>
  value.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '_').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word !== '');

// GN-6v: what a case of a variant does not hold yet: a class, a callback or a value alias, which a value of no core
// form carries, at any place of the field's type.
function heldInCase(type: Type, units: Map<string, Unit>, seen: Set<string> = new Set()): string | undefined {
  if (typeof type === 'string') return undefined;
  if ('list' in type) return heldInCase(type.list, units, seen);
  if ('map' in type) return heldInCase(type.map, units, seen);
  if ('keyed_map' in type) return heldInCase(type.keyed_map, units, seen);
  if ('optional' in type) return heldInCase(type.optional, units, seen);
  if ('tuple' in type) return type.tuple.map((part) => heldInCase(part, units, seen)).find((found) => found !== undefined);
  if (!('unit' in type)) return undefined;
  // GN-6v, GN-6c: a unit of another repository (a record, a value alias, a value class) is held as at any other place.
  if (type.library !== undefined) return undefined;
  const unit = units.get(type.unit);
  if (unit === undefined || seen.has(unit.id)) return undefined;
  seen.add(unit.id);
  if (unit.kind === 'class') return 'class';
  if (unit.origin === 'callback') return 'callback';
  if (unit.kind === 'alias') return 'value alias';
  const fields = unit.kind === 'record' ? (unit.fields ?? []) : unit.kind === 'variant' ? (unit.cases ?? []).flatMap((c) => c.fields) : [];
  return fields.map((f) => heldInCase(f.type, units, seen)).find((found) => found !== undefined);
}

// T-9: the variant of a type, when the type is one of this contract.
export const variantOf = (model: Model, type: Type): Variant | undefined => {
  const unit = libraryOf(type) === undefined ? unitOf(model, type) : undefined;
  return unit === undefined ? undefined : model.variants.find((v) => v.unit === unit);
};

// GN-6v: the cases of the variants as records of their fields, which the emitters declare in the result form.
export const caseUnits = (model: Model): Unit[] => model.variants.flatMap((v) => v.cases.map((c) => c.unit));

// GN-6v: how the core holds a field of a case: in a Box when the field's type, or the type of its optional, is a unit
// of this contract from which the field's own variant is reached again through fields of a unit or an optional unit
// alone, because a Rust enum needs an indirection there and a list gives one; 'box' or 'optional' (Option<Box<T>>).
export function boxedField(model: Model, owner: Unit, type: Type): 'box' | 'optional' | undefined {
  const direct = (t: Type): Unit | undefined => {
    const inner = typeof t === 'object' && 'optional' in t ? t.optional : t;
    return libraryOf(inner) === undefined ? unitOf(model, inner) : undefined;
  };
  const reaches = (unit: Unit, seen: Set<string>): boolean => {
    if (unit.id === owner.id) return true;
    if (seen.has(unit.id)) return false;
    seen.add(unit.id);
    const fields = unit.kind === 'record' ? (unit.fields ?? []) : unit.kind === 'variant' ? (unit.cases ?? []).flatMap((c) => c.fields) : [];
    return fields.some((f) => {
      const next = direct(f.type);
      return next !== undefined && reaches(next, seen);
    });
  };
  const target = direct(type);
  if (target === undefined || (target.kind !== 'record' && target.kind !== 'variant') || !reaches(target, new Set())) return undefined;
  return typeof type === 'object' && 'optional' in type ? 'optional' : 'box';
}

// GN-6v: a field of a case as the generated conversions read and write it: its Rust field, the variable that holds its
// value (field_<name>, so that no field meets a variable of the conversion) and how the core holds it.
export interface CaseField {
  field: Field;
  name: string;
  variable: string;
  boxed: 'box' | 'optional' | undefined;
}

export const caseFields = (model: Model, variant: Variant, kase: VariantCase): CaseField[] =>
  (kase.unit.fields ?? []).map((field) => ({ field, name: rustField(field.name), variable: `field_${convert(field.name, 'rust', 'variable')}`, boxed: boxedField(model, variant.unit, field.type) }));

// The Rust type of the variable of a field that enters: the core's type, with its Box.
export function caseType(model: Model, f: CaseField): string {
  const type = f.field.type;
  if (f.boxed === 'optional' && typeof type === 'object' && 'optional' in type) return `Option<Box<${rustType(model, type.optional)}>>`;
  return f.boxed === 'box' ? `Box<${rustType(model, type)}>` : rustType(model, type);
}

// The value of a field that enters, from the converted value (an expression that ends with ?).
export const caseRead = (f: CaseField, converted: string): string =>
  f.boxed === 'box' ? `Box::new(${converted})` : f.boxed === 'optional' ? `${converted}.map(Box::new)` : converted;

// The value that the conversion out of a field takes, from the binding of the pattern, a reference to the field: a
// scalar by value, a boxed value as the reference to the value in its Box.
export function caseValue(model: Model, f: CaseField): string {
  if (f.boxed === 'box') return `&**${f.variable}`;
  const optional = typeof f.field.type === 'object' && 'optional' in f.field.type;
  return byValue(model, f.field.type) && !optional ? `*${f.variable}` : f.variable;
}

// The conversion out of a field: an optional Box gives its value as Option<&T>.
export const caseWritten = (f: CaseField, text: string): string =>
  f.boxed === 'optional' ? text.replace(`${f.variable}.as_ref()`, `${f.variable}.as_deref()`) : text;

// The struct variant of a case, as an expression from the variables or as the pattern that binds them.
export const caseStruct = (variant: Variant, kase: VariantCase, fields: CaseField[]): string =>
  `${variant.unit.core_type ?? ''}::${kase.rust} {${fields.length === 0 ? '' : ` ${fields.map((f) => `${f.name}: ${f.variable}`).join(', ')} `}}`;

// GN-6v: a case without fields is matched as <Case> {}, which a unit variant of the core takes too; the attribute is on
// the arm of such a case only.
export const UNIT_CASE_ALLOW = '#[allow(clippy::unneeded_struct_pattern, reason = "GN-6v")]';

// GN-6ap: the generated interface of a type, when the type is one of this contract.
export const interfaceOf = (model: Model, type: Type): Unit | undefined => {
  const unit = libraryOf(type) === undefined ? unitOf(model, type) : undefined;
  return unit !== undefined && model.interfaces.some((i) => i.id === unit.id) ? unit : undefined;
};

// GN-6ap: the classes that implement a generated interface, in contract order.
export const implementorsOf = (model: Model, iface: Unit): ObjectClass[] =>
  model.objects.filter((o) => (o.unit.implements ?? []).some((ref) => ref.library === undefined && ref.unit === iface.id));

// GN-6w: the interfaces that a class implements, as a clause of a declaration of a JavaScript or PHP class.
export const implementsClause = (model: Model, object: ObjectClass, lang: 'node' | 'wasm' | 'php' = 'node', qualify: (unit: Unit) => string = (unit) => langName(lang, unit.name, 'class')): string => {
  const names = (object.unit.implements ?? []).flatMap((ref) => {
    const unit = ref.library === undefined ? model.contract.units.find((u) => u.id === ref.unit) : undefined;
    return unit === undefined ? [] : [qualify(unit)];
  });
  return names.length === 0 ? '' : ` implements ${names.join(', ')}`;
};

// GN-6t: a tuple enters as a sequence of exactly its parts, which in_tuple gives as an array; each part is converted
// as its type, so the core gets the Rust tuple of the parts.
export const tupleIn = (parts: Type[], taken: string, part: (type: Type, name: string) => string): string => {
  const names = parts.map((_, i) => `part_${i}`);
  return `${taken}.and_then(|[${names.join(', ')}]| Ok((${parts.map((t, i) => `${part(t, names[i] ?? '')}?`).join(', ')}${parts.length === 1 ? ',' : ''})))`;
};

// T-9, GN-6v: an optional field of a case whose default is {literal: null} may be left out, and is then null.
export const caseLeftOut = (field: { type: Type; default?: Default }): boolean =>
  typeof field.type === 'object' && 'optional' in field.type && field.default !== undefined && 'literal' in field.default && field.default.literal === null;

// GN-6ac, GN-6ad: whether a value of the type, an argument too, enters the core through IntoCore, which takes the
// core's own integer and tuple forms: a type of numbers, bools, texts, lists, optionals and tuples that holds an
// integer or a tuple.
export function narrows(type: Type): boolean {
  const plain = (t: Type): boolean => (typeof t === 'string' ? ['uint', 'int', 'int64', 'float', 'bool', 'text'].includes(t) : 'list' in t ? plain(t.list) : 'optional' in t ? plain(t.optional) : 'tuple' in t ? t.tuple.every(plain) : false);
  const holds = (t: Type): boolean => (typeof t === 'string' ? ['uint', 'int', 'int64'].includes(t) : 'list' in t ? holds(t.list) : 'optional' in t ? holds(t.optional) : 'tuple' in t);
  return plain(type) && holds(type);
}


// GN-6ac: the let that gives a converted value the core's own type, which the place that takes it infers.
export const narrowed = (variable: string, subject: string, failed: string): string =>
  `let ${variable} = IntoCore::into_core(${variable}, ${subject}).map_err(${failed})?;`;

// GN-6ac: a tuple that leaves the core, which holds it as a Rust tuple or, when its parts have one type, as an array:
// partsN gives a reference to each part of either, which part converts, and made takes the converted parts.
export const tupleOut = (parts: Type[], value: string, part: (type: Type, name: string, index: number) => string, made: (converted: string[]) => string): string => {
  const names = parts.map((_, i) => `part_${i}`);
  return `{ let (${names.join(', ')}${names.length === 1 ? ',' : ''}) = parts${parts.length}(&${value}); ${made(parts.map((t, i) => `${part(t, names[i] ?? '', i)}?`))} }`;
};
