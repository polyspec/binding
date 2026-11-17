// The parts of the binding generators node, wasm, php and python that they write alike: each is written here once and
// takes what differs between the languages as its arguments (GN-14o).

import type { Type } from '../contract.ts';
import { functionGiven, givenRust } from './callback_arguments.ts';
import { boxed, keptFunctionType, type Model, rustType, traitParam, tupleIn, Unsupported } from './model.ts';
import { closure, rustString } from './text.ts';

// T-1: the input conversion of a scalar, by the helper of its name in the crate; overrides gives the helpers of a
// language that differ, and undefined for a scalar that the language does not take.
export function scalarIn(type: string, value: string, subject: string, lang: string, lead = '', overrides: Readonly<Record<string, string | undefined>> = {}): string {
  const fn: Record<string, string | undefined> = { text: 'text_in', latin1: 'latin1_in', bool: 'bool_in', uint: 'uint_in', int: 'int_in', int64: 'int64_in', float: 'float_in', bytes: 'bytes_in', source: 'source_in', path: 'path_in', cancel: 'cancel_in', ...overrides };
  const name = fn[type];
  if (name === undefined) throw new Unsupported(`no ${lang} input conversion for ${type}`);
  return `${name}(${lead}${value}, ${subject})`;
}

// GN-6z: what the body of the Rust closure of a function reads: its result type, the names of its arguments, and the
// subject of the conversion of its result.
export interface FunctionParts {
  readonly result: string;
  readonly names: string[];
  readonly returns: string;
}

// GN-6z: a function holds the function of the language that entered as holder; the Rust closure takes the arguments
// of the core and runs body, which each language writes. lead is the argument of kept_function_in before the value.
export function keptFunctionIn(model: Model, type: FunctionType, value: string, subject: string, lead: string, holder: string, body: (parts: FunctionParts) => string): string {
  const names = type.parameters.map((_p, i) => `argument_${String(i)}`);
  const result = type.returns === 'none' ? '()' : rustType(model, type.returns);
  const params = type.parameters.map((p, i) => `${names[i] ?? ''}: ${traitParam(model, p)}`);
  const returns = subject.startsWith('"') ? `${subject.slice(0, -1)} returns"` : '"the function returns"';
  return `kept_function_in(${lead}${value}, ${subject}, ${givenRust(functionGiven(type))}).map(|${holder}| -> ${rustType(model, keptFunctionType(type))} {
            Box::new(move |${params.join(', ')}| -> Result<${result}, binding_core::Failure<${model.coreError ?? '()'}>> {
${body({ result, names, returns })}
            })
        })`;
}

// T-1: the type of a function of a contract.
export type FunctionType = { parameters: Type[]; returns: Type; async_allowed?: boolean };

// T-1: what the input conversion of a container differs by between the languages.
export interface ContainersIn {
  // The arguments before the value of a conversion of a container: '' or the token of the language ('py_, ').
  readonly lead: string;
  // The parameters of the closure that converts an item.
  readonly item: string[];
  // The message of a keyed map of a wrong key, before the names of its kinds of key, and those names.
  readonly keyed: string;
  readonly keyNames: Readonly<Record<string, string>>;
  // The place of a part of a tuple that the conversion of the part reads.
  readonly part: (name: string) => string;
  // The input conversion of the language, and that of a function.
  readonly convert: (model: Model, type: Type, value: string, subject: string) => string;
  readonly functionIn: (model: Model, type: FunctionType, value: string, subject: string) => string;
}

// T-1: the containers of node and wasm, which differ by the place of a part of a tuple alone.
export const JS_CONTAINERS: Pick<ContainersIn, 'lead' | 'item' | 'keyed' | 'keyNames'> = { lead: '', item: ['item'], keyed: 'a Map whose keys are', keyNames: { int: 'safe integers', text: 'strings' } };

// T-1: the input conversion of a list, a map, a keyed map, an optional, a function or a tuple; undefined for any other
// type.
export function containerIn(model: Model, type: Type, value: string, subject: string, form: ContainersIn): string | undefined {
  if (typeof type === 'string') return undefined;
  const { lead, item } = form;
  const convert = (inner: Type, place: string): string => form.convert(model, inner, place, subject);
  if ('list' in type) return `list_in(${lead}${value}, ${subject}, ${closure(item, boxed(model, type.list, convert(type.list, 'item')))})`;
  if ('map' in type) return `map_in(${lead}${value}, ${subject}, ${closure(item, convert(type.map, 'item'))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `keyed_map_in(${lead}${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`${form.keyed} ${type.key.map((k) => form.keyNames[k] ?? k).join(' or ')}`)}, ${closure(item, convert(type.keyed_map, 'item'))})`;
  }
  if ('optional' in type) return `optional_in(${value}, ${closure(['value'], boxed(model, type.optional, convert(type.optional, 'value')))})`;
  if ('function' in type) return form.functionIn(model, type.function, value, subject);
  if ('tuple' in type) return tupleIn(type.tuple, `tuple_in(${lead}${value}, ${subject})`, (part, name) => convert(part, form.part(name)));
  return undefined;
}
