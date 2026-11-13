// U-7: what the conversions of a value alias share across languages: the OutValue variant of each kind, the rows of a
// language selected by kind and `when`, and the parts of a container kind that a list or a map form reads.

import type { OutRow } from '../contract.ts';
import type { Lang } from '../contract.ts';
import { type Fn, type KeptClass, type KeptField, type Model, type ObjectClass, Unsupported, type ValueAlias, rustField } from './model.ts';

// The predicate methods of OutValue for a `when` of a row (binding_core::Predicate).
const PREDICATE: Record<string, string> = {
  utf8: 'Utf8', sequence_keys: 'SequenceKeys', safe_integer: 'SafeInteger', integral_float: 'IntegralFloat',
};

// The OutValue variant of each kind and how its content is bound in a match arm.
const VARIANT: Record<string, string> = {
  null: 'OutValue::Null', bool: 'OutValue::Bool(value)', int: 'OutValue::Int(value)', int64: 'OutValue::Int64(value)',
  float: 'OutValue::Float(value)', number: 'OutValue::Number(value)', text: 'OutValue::Text(value)', bytes: 'OutValue::Bytes(value)',
  list: 'OutValue::List { handle, len }', map: 'OutValue::Map(value)', object: 'OutValue::Object { handle, len }',
  reference: 'OutValue::Reference { handle, value }', safe_text: 'OutValue::SafeText(value)', native: 'OutValue::Native(handle)',
};

// A container kind as a list or a map form reads it: the statements that bind `handle` and `len`, and the expressions of
// the item and of the entry at `index`. A list form takes the values of a map or an object in order (U-7 (c)).
export interface Container {
  head: string;
  item: string;
  entry: string;
}

export function container(alias: ValueAlias, kind: string, form: string): Container {
  switch (kind) {
    case 'list':
      if (form !== 'list') break;
      return { head: '', item: 'source.item(handle, index)', entry: '' };
    case 'map':
      return { head: 'let handle = value.handle();\n            let len = value.len();', item: 'source.entry(handle, index).1', entry: 'source.entry(handle, index)' };
    case 'object':
      return { head: '', item: 'source.entry(handle, index).1', entry: 'source.entry(handle, index)' };
    default:
      break;
  }
  throw new Unsupported(`${alias.unit.id}: the form ${form} of the kind ${kind} is not generated yet`);
}

// U-7, T-5: the argument that the content of a kind gives to the one parameter of a factory, by the contract type of the
// parameter, as GN-6 passes it: a text borrowed, a number or a bool by value.
const CONTENT: Record<string, { type: string; arg: string }> = {
  bool: { type: 'bool', arg: 'value' }, int: { type: 'int', arg: 'value.value()' }, int64: { type: 'int64', arg: 'value' },
  float: { type: 'float', arg: 'value.value()' }, text: { type: 'text', arg: '&value' }, bytes: { type: 'bytes', arg: 'value.value()' },
};

// U-7, T-5: an out row that names a member makes an instance of a class of this contract: the content of the kind is the
// one argument of the core path of the class's constructor or static factory, which cannot fail, and the value it gives
// leaves as the class's instance (out_<class>, whose first arguments are `env`).
function byMember(model: Model, alias: ValueAlias, lang: Lang, make: string, kind: string, env: string, instance: string, keptMake?: KeptMake): string {
  if (alias.library !== undefined) throw new Unsupported(`${alias.unit.id}: a ${lang} make by a member (${make}) is not generated yet`);
  // GN-6af: the constructor of a value class without core_type makes an instance from the content, without the core.
  const kept = model.kept.find((k) => k.constructor.member.id === make);
  if (kept !== undefined) {
    const [field, ...more] = kept.fields;
    const holds = field === undefined || more.length > 0 ? undefined
      : (kind === 'object' || kind === 'map') && typeof field.type === 'object' && 'keyed_map' in field.type ? 'entries'
        : kind === 'reference' && typeof field.type === 'object' && 'unit' in field.type ? 'value'
          : undefined;
    if (holds === undefined || keptMake === undefined) throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} is not generated: a value class without core_type is made from an object or a map into its one keyed map, or from a reference into its one value (GN-6af)`);
    return keptMake(kept, field as KeptField, holds, kind === 'map' ? container(alias, kind, 'map').head : '');
  }
  const object = model.objects.find((o) => o.members.some((fn) => fn.member.id === make));
  const factory = object?.members.find((fn) => fn.member.id === make);
  const returns = factory?.returns;
  const makes = typeof returns === 'object' && 'unit' in returns && returns.unit === object?.unit.id && returns.library === undefined;
  if (object === undefined || factory === undefined || factory.receiver !== undefined || !makes) {
    throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} is no constructor or static member of a generated class that returns it (U-7)`);
  }
  const content = CONTENT[kind];
  const param = factory.params.length === 1 ? factory.params[0]?.type : undefined;
  if (content === undefined || param !== content.type) {
    throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} takes ${factory.params.map((p) => (typeof p.type === 'string' ? p.type : JSON.stringify(p.type))).join(', ') || 'no parameter'}, not the content of the kind (U-7)`);
  }
  if (factory.fallible || factory.failure) throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} can fail, which a make by a member is not generated for yet (U-7)`);
  return `${instance}${rustField(object.unit.name)}(${env}${factory.corePath}(${content.arg}))`;
}

// The match arms of the make function of one language: a row per kind, or a row per `when` of the kind. `env` is the
// first arguments of the out function of a class in the language, for a row that makes an instance by a member, and
// `instance` the prefix of the name of that function.
export function outArms(model: Model, alias: ValueAlias, lang: Lang, builtin: (form: string, kind: string) => string, noRow: string, env: string, keptMake?: KeptMake, instance = 'out_'): string[] {
  const rows = (alias.unit.out ?? []).filter((row) => row.make[lang] !== undefined);
  const kinds = [...new Set(rows.map((row) => row.kind))];
  return kinds.map((kind) => {
    const variant = VARIANT[kind];
    if (variant === undefined) throw new Unsupported(`no OutValue variant of the kind ${kind}`);
    const ofKind = rows.filter((row) => row.kind === kind);
    const form = (row: OutRow): string => {
      const make = row.make[lang];
      // T-2: a keyed map is made as a map, its keys of the kinds it lists through the rows of the alias, as its items.
      if (typeof make === 'object' && make !== null && 'keyed_map' in make && Object.keys(make).length === 1) return builtin('keyed_map', kind);
      if (typeof make !== 'string') throw new Unsupported(`${alias.unit.id}: a ${lang} make of the form ${JSON.stringify(make)} is not generated yet`);
      if (make.includes('.')) return byMember(model, alias, lang, make, kind, env, instance, keptMake);
      return builtin(make, kind);
    };
    const sameForm = new Set(ofKind.map((row) => JSON.stringify(row.make[lang]))).size === 1;
    const body = sameForm || ofKind.every((row) => row.when === undefined)
      ? form(ofKind[0] as OutRow)
      : ofKind.map((row, index) => {
        const when = row.when;
        const test = when === undefined || when === 'else'
          ? 'true'
          : `out.predicate(Predicate::${PREDICATE[when.predicate] ?? ''}) == Some(${String(when.is)})`;
        return `${index === 0 ? '' : 'else '}if ${test} { ${form(row)} }`;
      }).join(' ') + ` else { ${noRow} }`;
    return `        ${variant} => ${body},`;
  });
}

// GN-6af: how a language makes an instance of a value class without core_type from the content of an out row: the
// entries of an object or a map into its keyed map, or the value of a reference; head binds the handle and the length
// of a map, which the arm of an object binds itself.
export type KeptMake = (kept: KeptClass, field: KeptField, holds: 'entries' | 'value', head: string) => string;

// GN-6af, U-1: an in row of a value alias that names a class of the contract: an instance of the class is
// HostValue::Value with the kind of the row, and read gives the property that the row names.
export interface ValueRead {
  kind: string;
  // The Rust variant of ValueKind.
  variant: string;
  kept?: { unit: KeptClass; field: KeptField };
  object?: { unit: ObjectClass; property: Fn };
}

export function valueReads(model: Model, lang: Lang): ValueRead[] {
  const reads: ValueRead[] = [];
  for (const alias of model.aliases.filter((a) => a.library === undefined)) {
    for (const row of alias.unit.in ?? []) {
      const named = row[lang];
      if (typeof named !== 'string') continue;
      const kept = model.kept.find((k) => k.unit.id === named);
      const object = model.objects.find((o) => o.unit.id === named);
      if (kept === undefined && object === undefined) continue;
      const cases = row.cases ?? [];
      const [only] = cases;
      if (only === undefined || cases.length > 1 || only.when !== undefined) throw new Unsupported(`${alias.unit.id}: the ${lang} in row of the class ${named} has one case without when (GN-6af)`);
      const kind = only.kind;
      const variant = `ValueKind::${kind.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
      if (reads.some((r) => (r.kept?.unit ?? r.object?.unit) === (kept ?? object))) continue;
      if (kept !== undefined) {
        const field = kept.fields.find((f) => f.property?.id === only.read);
        if (field === undefined) throw new Unsupported(`${alias.unit.id}: the ${lang} in row of the class ${named} reads ${String(only.read)}, which is no property of the class (GN-6af)`);
        reads.push({ kind, variant, kept: { unit: kept, field } });
      } else if (object !== undefined) {
        const property = object.members.find((fn) => fn.member.id === only.read && fn.kind === 'property' && fn.receiver === '&self');
        if (property === undefined || typeof property.returns !== 'string' || !['bool', 'int', 'int64', 'float'].includes(property.returns)) {
          throw new Unsupported(`${alias.unit.id}: the ${lang} in row of the class ${named} reads ${String(only.read)}, which is no property of the class with &self that gives a bool, an integer or a float (GN-6af)`);
        }
        reads.push({ kind, variant, object: { unit: object, property } });
      }
    }
  }
  return reads;
}

// GN-6af: the HostValue of the value that the core path of a property gives, by its contract type.
export const readValue = (type: string): string => ({ bool: 'HostValue::Bool(value)', int: 'HostValue::Int(value)', int64: 'HostValue::Int(value)', float: 'HostValue::Float(value)' })[type] ?? '';
