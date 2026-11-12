// The closed tables of bindgen for value units (design U-1 `value`): the language type that each built-in `make` form
// produces, the built-in language types that an `in` row may name, and the kind each predicate applies to. The kind and
// predicate names are those of bindgen_core::ValueKind and bindgen_core::Predicate.

import type { Lang } from './contract.ts';

export const VALUE_KINDS = [
  'null', 'bool', 'int', 'int64', 'float', 'number', 'text', 'bytes', 'list', 'map', 'object', 'safe_text', 'native',
  'nested:json_value', 'nested:template_value', 'nested:php_value',
] as const;

export const PREDICATE_KIND: Readonly<Record<string, string>> = {
  utf8: 'bytes',
  sequence_keys: 'map',
  safe_integer: 'int',
  integral_float: 'float',
};

export const BUILTIN_FORMS = ['null', 'bool', 'int', 'bigint', 'float', 'text', 'bytes', 'list', 'map'] as const;

const JS: Readonly<Record<string, string>> = {
  null: 'null', bool: 'boolean', int: 'number', bigint: 'bigint', float: 'number', text: 'string',
  bytes: 'Uint8Array', list: 'Array', map: 'Map',
};

// The language type that a built-in form makes, per language; a form missing from a language has no built-in value
// there (PHP and Go have no big integer type).
export const MADE_TYPE: Readonly<Record<Lang, Readonly<Record<string, string>>>> = {
  php: { null: 'null', bool: 'bool', int: 'int', float: 'float', text: 'string', bytes: 'string', list: 'array', map: 'array' },
  python: {
    null: 'None', bool: 'bool', int: 'int', bigint: 'int', float: 'float', text: 'str', bytes: 'bytes', list: 'list',
    map: 'dict',
  },
  node: JS,
  wasm: JS,
  go: {
    null: 'nil', bool: 'bool', int: 'int64', float: 'float64', text: 'string', bytes: '[]byte', list: '[]any',
    map: 'map[string]any',
  },
};

// The built-in language types an `in` row may name, per language: the types that MADE_TYPE produces.
export function builtinTypes(lang: Lang): Set<string> {
  return new Set(Object.values(MADE_TYPE[lang]));
}
