// The parts of the binding generators node, wasm, php and python that they write alike: each is written here once and
// takes what differs between the languages as its arguments (GN-14o).

import type { Type, Unit } from '../contract.ts';
import { functionGiven, givenRust } from './callback_arguments.ts';
import { type Cycle, type CycleHost, cycles, holdsCycle } from './cycles.ts';
import { absentInits, boxed, caseLeftOut, keptFunctionType, langName, type Model, narrowed, narrows, recordInit, recordLocal, rustType, traitParam, tupleIn, tupleOut, Unsupported } from './model.ts';
import { closure, optionRef, rustString } from './text.ts';

// T-1: the input conversion of a scalar, by the helper of its name in the crate; overrides gives the helpers of a
// language that differ, and undefined for a scalar that the language does not take.
export function scalarIn(type: string, value: string, subject: string, lang: string, lead = '', overrides: Readonly<Record<string, string | undefined>> = {}): string {
  const fn: Record<string, string | undefined> = { text: 'text_in', latin1: 'latin1_in', bool: 'bool_in', uint: 'uint_in', int: 'int_in', int64: 'int64_in', float: 'float_in', bytes: 'bytes_in', source: 'source_in', path: 'path_in', cancel: 'cancel_in', ...overrides };
  const name = fn[type];
  if (name === undefined) throw new Unsupported(`no ${lang} input conversion for ${type}`);
  return `${name}(${lead}${value}, ${subject})`;
}

// T-2: the output conversion of a scalar, by the helper of its name in the crate; none is the value of none in the
// language, and overrides gives the helpers of a language that differ, undefined for a scalar it does not give.
export function scalarOut(type: string, value: string, lang: string, none: string, lead = '', overrides: Readonly<Record<string, string | undefined>> = {}): string {
  // T-2 never: the core's Infallible has no value, so the call has failed before.
  if (type === 'never') return `match ${value} {}`;
  if (type === 'none') return none;
  const fn: Record<string, string | undefined> = { text: 'text_out', latin1: 'latin1_out', bool: 'bool_out', uint: 'uint_out', int: 'int_out', int64: 'int64_out', float: 'float_out', bytes: 'bytes_out', path: 'path_out', ...overrides };
  const name = fn[type];
  if (name === undefined) throw new Unsupported(`no ${lang} output conversion for ${type}`);
  return `${name}(${lead}${value})`;
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

// GN-6bt: the host of the walks of a cycle in a language whose value is lang alone, with no lifetime and no token,
// and which keeps a value of the language by own.
export const plainCycleHost = (lang: string, own: (place: string) => string): CycleHost => ({
  lang,
  made: lang,
  inValue: `&${lang}`,
  give: (owned) => `&${owned}`,
  own,
  result: (type) => `Result<${type}, Fail>`,
  internal: (detail) => `binding_error(BindingError::Internal { detail: String::from(${rustString(detail)}) })`,
  inGenerics: '',
  inParams: '',
  inArgs: '',
  outGenerics: '',
  outParams: '',
  outArgs: '',
});

// GN-6bt: the cycles of the records and variants whose conversions the crate holds.
export const resultCycles = (model: Model): Cycle[] => cycles(model, [...model.resultRecords, ...model.variants.map((v) => v.unit)]);

// T-4, GN-6bt: the conversion in of the fields of a record in node and wasm, or the walk of the places of units of its
// cycle (kids): each field is read from its member, which place gives as the argument of the conversion.
export function recordIns(model: Model, unit: Unit, kids: boolean, lang: 'node' | 'wasm', place: (member: string) => string, convert: (model: Model, type: Type, value: string, subject: string) => string): string {
  const fields = unit.fields ?? [];
  const reads = fields.map((f) => {
    const member = langName(lang, f.name, 'variable');
    // GN-6a: a field that may be left out is null when its member is missing or undefined.
    const read = caseLeftOut(f) ? `default_in(${place(member)}, |value| ${convert(model, f.type, 'value', rustString(member))}).map(Option::flatten)` : convert(model, f.type, place(member), rustString(member));
    const local = `${kids ? '_' : ''}${recordLocal(f.name)}`;
    const held = kids && model.cycleWalk !== undefined && holdsCycle(model, model.cycleWalk, f.type);
    return `    let ${local}${held ? '' : `: ${rustType(model, f.type)}`} = ${read}?;${narrows(f.type) && !kids ? `\n    ${narrowed(local, rustString(member), 'binding_error')}` : ''}`;
  });
  return `${reads.join('\n')}\n    ${kids ? 'Ok(())' : `Ok(${unit.core_type ?? ''} { ${fields.map((f) => recordInit(f.name)).join(', ')}${absentInits(unit)} })`}`;
}

// T-2: what the output conversion of a container differs by between the languages.
export interface ContainersOut {
  // The token of the language that every conversion takes first ('env_', 'py_'), or ''.
  readonly env: string;
  // The output of an optional, when the language does not write it by optional_out.
  readonly optional?: (value: string, inner: Type) => string;
  // The place of a part of a tuple, and the tuple made of the converted parts.
  readonly part?: (type: Type, name: string) => string;
  readonly tuple: (parts: string[]) => string;
  readonly convert: (model: Model, type: Type, value: string) => string;
}

// T-2: the output conversion of a passthrough, a list, a map, a keyed map, an optional or a tuple; undefined for any
// other type.
export function containerOut(model: Model, type: Type, value: string, form: ContainersOut): string | undefined {
  if (typeof type === 'string') return undefined;
  const lead = form.env === '' ? '' : `${form.env}, `;
  const params = (name: string): string[] => (form.env === '' ? [name] : [form.env, name]);
  const convert = (inner: Type, place: string): string => form.convert(model, inner, place);
  // GN-6ae: a result passthrough leaves the table of the binding as the value that the function returned.
  if ('passthrough' in type) return `passed_out(${lead}${value})`;
  if ('list' in type) return `list_out(${lead}${value}, ${closure(params('item'), convert(type.list, 'item'))})`;
  // The value of a keyed map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('map' in type) return `map_out(${lead}${value}, |${params('item').join(', ')}| ${convert(type.map, 'item')})`;
  if ('keyed_map' in type) return `keyed_map_out(${lead}${value}, |${params('item').join(', ')}| ${convert(type.keyed_map, 'item')})`;
  if ('optional' in type) return form.optional?.(value, type.optional) ??`optional_out(${lead}${optionRef(value)}, ${closure(params('value'), convert(type.optional, 'value'))})`;
  if ('tuple' in type) return tupleOut(type.tuple, value, (t, name) => convert(t, form.part?.(t, name) ?? name), form.tuple);
  return undefined;
}

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
