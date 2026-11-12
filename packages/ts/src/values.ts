// The closed tables of binding for value units (design U-1 `value`): the language type that each built-in `make` form
// produces, the built-in language types that an `in` row may name, and the kind each predicate applies to. The kind and
// predicate names are those of binding_core::ValueKind and binding_core::Predicate.

import type { Lang } from './contract.ts';

export const VALUE_KINDS = [
  'null', 'bool', 'int', 'int64', 'float', 'number', 'text', 'bytes', 'list', 'map', 'object', 'reference', 'safe_text',
  'native',
  'nested:json_value', 'nested:template_value', 'nested:php_value',
] as const;

export const PREDICATE_KIND: Readonly<Record<string, string>> = {
  utf8: 'bytes',
  sequence_keys: 'map',
  safe_integer: 'int',
  integral_float: 'float',
};

export const BUILTIN_FORMS = [
  'null', 'bool', 'int', 'bigint', 'float', 'text', 'bytes', 'list', 'map', 'keyed_map', 'php_object', 'php_reference',
  'native',
] as const;

// VAL-18: the form `native` gives back the language object that entered as the handle of an OutValue::Native, so the
// value it makes is any object of the language; only the kind `native` is made by it, and the kind has no content to
// read.
export const CONTENTLESS_KINDS: ReadonlySet<string> = new Set(['null', 'native']);

const JS: Readonly<Record<string, string>> = {
  null: 'null', bool: 'boolean', int: 'number', bigint: 'bigint', float: 'number', text: 'string',
  bytes: 'Uint8Array', list: 'Array', map: 'Map', keyed_map: 'Map', native: 'object',
};

// The language type that a built-in form makes, per language; a form missing from a language has no built-in value
// there (PHP and Go have no big integer type).
export const MADE_TYPE: Readonly<Record<Lang, Readonly<Record<string, string>>>> = {
  php: {
    null: 'null', bool: 'bool', int: 'int', float: 'float', text: 'string', bytes: 'string', list: 'array', map: 'array',
    keyed_map: 'array', php_object: 'stdClass', php_reference: 'reference', native: 'object',
  },
  python: {
    null: 'None', bool: 'bool', int: 'int', bigint: 'int', float: 'float', text: 'str', bytes: 'bytes', list: 'list',
    map: 'dict', keyed_map: 'dict', native: 'object',
  },
  node: JS,
  wasm: JS,
  go: {
    null: 'nil', bool: 'bool', int: 'int64', float: 'float64', text: 'string', bytes: '[]byte', list: '[]any',
    map: 'map[string]any', native: 'any',
  },
};

// The built-in language types an `in` row may name, per language: the types that MADE_TYPE produces.
export function builtinTypes(lang: Lang): Set<string> {
  return new Set(Object.values(MADE_TYPE[lang]));
}

// U-7 (f): what binding knows of a value that an out row makes with a built-in form, as the predicates of HostValue that
// the core judges: a predicate of the row's when holds as it says; text is UTF-8; an integer form is an integral number
// in the safe range; a list has the keys 0 to n-1. A predicate that is not here is not known.
//
// An else row takes what its sibling rows of the same kind leave: when they select one value of a predicate, the else
// row's values have the other.
type When = { predicate: string; is: boolean } | 'else';
export function madePredicates(form: string | undefined, row: { kind: string; when?: When }, siblings: readonly { when?: When }[]): Map<string, boolean> {
  const known = new Map<string, boolean>();
  if (row.when !== undefined && row.when !== 'else') known.set(row.when.predicate, row.when.is);
  if (row.when === 'else') {
    const selected = new Map<string, Set<boolean>>();
    for (const sibling of siblings) {
      if (sibling.when === undefined || sibling.when === 'else') continue;
      selected.set(sibling.when.predicate, (selected.get(sibling.when.predicate) ?? new Set()).add(sibling.when.is));
    }
    for (const [predicate, values] of selected) {
      if (values.size === 1) known.set(predicate, !values.has(true));
    }
  }
  if (form === 'text') known.set('utf8', true);
  if (form === 'int') {
    known.set('integral_float', true);
    known.set('safe_integer', true);
  }
  if (form === 'list') known.set('sequence_keys', true);
  return known;
}
