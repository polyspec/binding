// U-7: what the conversions of a value alias share across languages: the OutValue variant of each kind, the rows of a
// language selected by kind and `when`, and the parts of a container kind that a list or a map form reads.

import type { OutRow } from '../contract.ts';
import type { Lang } from '../contract.ts';
import { type Model, Unsupported, type ValueAlias, rustField } from './model.ts';

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
function byMember(model: Model, alias: ValueAlias, lang: Lang, make: string, kind: string, env: string): string {
  if (alias.library !== undefined) throw new Unsupported(`${alias.unit.id}: a ${lang} make by a member (${make}) is not generated yet`);
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
  return `out_${rustField(object.unit.name)}(${env}${factory.corePath}(${content.arg}))`;
}

// The match arms of the make function of one language: a row per kind, or a row per `when` of the kind. `env` is the
// first arguments of the out function of a class in the language, for a row that makes an instance by a member.
export function outArms(model: Model, alias: ValueAlias, lang: Lang, builtin: (form: string, kind: string) => string, noRow: string, env: string): string[] {
  const rows = (alias.unit.out ?? []).filter((row) => row.make[lang] !== undefined);
  const kinds = [...new Set(rows.map((row) => row.kind))];
  return kinds.map((kind) => {
    const variant = VARIANT[kind];
    if (variant === undefined) throw new Error(`no OutValue variant of the kind ${kind}`);
    const ofKind = rows.filter((row) => row.kind === kind);
    const form = (row: OutRow): string => {
      const make = row.make[lang];
      // T-2: a keyed map is made as a map, its keys of the kinds it lists through the rows of the alias, as its items.
      if (typeof make === 'object' && make !== null && 'keyed_map' in make && Object.keys(make).length === 1) return builtin('keyed_map', kind);
      if (typeof make !== 'string') throw new Unsupported(`${alias.unit.id}: a ${lang} make of the form ${JSON.stringify(make)} is not generated yet`);
      if (make.includes('.')) return byMember(model, alias, lang, make, kind, env);
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
