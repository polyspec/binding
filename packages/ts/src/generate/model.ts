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
  module: string;
  params: Parameter[];
  record?: { unit: Unit; param: Parameter };
  args: Arg[];
  returns: Type;
  fallible: boolean;
  corePath: string;
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
  classes: ErrorClass[];
  coreError: string | undefined;
  kinds: CoreKind[];
  // The contract cases of each member, from the case files that `cases` names (K-1).
  cases: Map<string, unknown[]>;
}

const simple = (name: string): string => name.slice(name.lastIndexOf('\\') + 1);

function supportedType(type: Type, units: Map<string, Unit>, where: string): void {
  if (typeof type === 'string') {
    if (!['bool', 'int', 'int64', 'uint', 'float', 'text', 'latin1', 'bytes', 'none'].includes(type)) {
      throw new Unsupported(`${where}: the type ${type} is not generated yet`);
    }
    return;
  }
  if ('list' in type) return supportedType(type.list, units, where);
  if ('optional' in type) return supportedType(type.optional, units, where);
  if ('tuple' in type) {
    for (const part of type.tuple) supportedType(part, units, where);
    return;
  }
  if ('unit' in type && type.library === undefined) {
    const unit = units.get(type.unit);
    if (unit?.kind === 'enum') return;
  }
  throw new Unsupported(`${where}: the type ${JSON.stringify(type)} is not generated yet`);
}

export function buildModel(contract: Contract, version: string, coreLib: string, cases: Map<string, unknown[]>): Model {
  assertNoExceptions(contract);
  const units = new Map(contract.units.map((u) => [u.id, u]));
  const functions: Fn[] = [];
  const constants: Constant[] = [];
  const enums: Unit[] = [];
  const records: Unit[] = [];
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
        supportedType(field.type, units, `${unit.id}.${field.name.join('_')}`);
      }
      records.push(unit);
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
      if (member.wait !== undefined && member.wait !== 'none') throw new Unsupported(`${member.id}: wait ${member.wait} is not generated yet`);
      const core = member.core;
      if (typeof core !== 'object') throw new Unsupported(`${member.id}: a function names its core path`);
      const params = member.parameters ?? [];
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
        supportedType(type, units, `${member.id}.${parameter.name.join('_')}`);
        args.push({ name: parameter.name, type, field: false });
      }
      const returns = member.returns ?? 'none';
      supportedType(returns, units, `${member.id} returns`);
      functions.push({
        unit,
        member,
        module: unit.module,
        params,
        args,
        returns,
        fallible: (member.raises ?? []).length > 0,
        corePath: core.path,
        ...(record === undefined ? {} : { record }),
      });
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
  return { contract, version, coreCrate: contract.core.crate, coreLib, functions, constants, enums, records, classes, coreError, kinds, cases };
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
    const unit = model.contract.units.find((u) => u.id === type.unit);
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
  if ('unit' in type) return model.contract.units.find((u) => u.id === type.unit)?.kind === 'enum';
  return false;
}

export const unitOf = (model: Model, type: Type): Unit | undefined =>
  typeof type === 'object' && 'unit' in type ? model.contract.units.find((u) => u.id === type.unit) : undefined;

export const rustField = (name: Name): string => convert(name, 'rust', 'variable');
export const rustVariant = (name: Name): string => convert(name, 'rust', 'class');

// The language name of a symbol; naming exceptions are not generated yet, which buildModel refuses below.
export function langName(lang: Lang, name: Name, role: 'class' | 'callable' | 'variable' | 'constant'): string {
  return convert(name, lang, role);
}

export function assertNoExceptions(contract: Contract): void {
  if (contract.naming.exceptions.length > 0) throw new Unsupported('naming exceptions are not generated yet');
}

export const fieldsOf = (unit: Unit): Field[] => unit.fields ?? [];
