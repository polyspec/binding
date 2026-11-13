// U-7: what the conversions of a value alias share across languages: the OutValue variant of each kind, the rows of a
// language selected by kind and `when`, and the parts of a container kind that a list or a map form reads.

import type { OutRow } from '../contract.ts';
import type { Lang } from '../contract.ts';
import { Unsupported, type ValueAlias } from './model.ts';

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

// The match arms of the make function of one language: a row per kind, or a row per `when` of the kind.
export function outArms(alias: ValueAlias, lang: Lang, builtin: (form: string, kind: string) => string, noRow: string): string[] {
  const rows = (alias.unit.out ?? []).filter((row) => row.make[lang] !== undefined);
  const kinds = [...new Set(rows.map((row) => row.kind))];
  return kinds.map((kind) => {
    const variant = VARIANT[kind];
    if (variant === undefined) throw new Error(`no OutValue variant of the kind ${kind}`);
    const ofKind = rows.filter((row) => row.kind === kind);
    const form = (row: OutRow): string => {
      const make = row.make[lang];
      if (typeof make !== 'string') throw new Unsupported(`${alias.unit.id}: a ${lang} make of the form ${JSON.stringify(make)} is not generated yet`);
      if (make.includes('.')) throw new Unsupported(`${alias.unit.id}: a ${lang} make by a member (${make}) is not generated yet`);
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
