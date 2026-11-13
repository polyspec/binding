// Argument values of the generated tests (G-5): a placeholder value of each contract type, which the binding converts
// without failing, and the value of a contract case, which the case file gives as JSON (keys are the parameter names in
// snake_case, a record parameter is an object of its fields, an enum is its value text, latin1 is text of U+0000 to
// U+00FF).

import type { Type } from '../contract.ts';
import type { Unit } from '../contract.ts';
import { defaultCaseValue } from './defaults.ts';
import { type Arg, type Fn, type Model, type ValueAlias, Unsupported, aliasOf, kindText, langName, objectUnit, unitOf } from './model.ts';
import { kindsOf } from '../contract.ts';
import { jsString, phpLatin1, phpText, pyString } from './text.ts';

export type Lang3 = 'python' | 'node' | 'php';

export interface Context {
  lang: Lang3;
  // How the generated test names an enum value: python `pkg.Enum("value")`, php `\Ns\Enum::from("value")`.
  enumRef: (enumName: string, value: string) => string;
  // How the generated test makes the result form of a record (T-4) from its fields in contract order.
  recordNew: (unit: Unit, fields: string[]) => string;
  // How the generated test makes an object that implements a callback (U-3): every member returns null, or the
  // members are missing, or every member raises the exception `raise` names, or returns a value of no contract type.
  callbackNew: (unit: Unit, how: CallbackHow) => string;
  // How the generated test calls a factory of a class (a static member or the constructor) with its arguments (T-5).
  objectNew?: (factory: Fn, args: string) => string;
}

export type CallbackHow = { returns: 'null' } | { missing: true } | { raise: string } | { returns: 'wrong' };

// rich: a list has one item rather than none, so that a member that calls a callback per item calls it (K-2).
export function placeholder(model: Model, ctx: Context, type: Type, rich = false): string {
  if (typeof type === 'string') {
    const table: Record<Lang3, Record<string, string>> = {
      python: { text: '"a"', latin1: '"a"', bool: 'False', uint: '0', int: '0', int64: '0', float: '0.0', bytes: 'b""', source: '"a"' },
      node: { text: "'a'", latin1: "'a'", bool: 'false', uint: '0', int: '0', int64: '0', float: '0', bytes: 'new Uint8Array()', source: "'a'" },
      php: { text: '"a"', latin1: '"a"', bool: 'false', uint: '0', int: '0', int64: '0', float: '0.0', bytes: '""', source: '"a"' },
    };
    return table[ctx.lang][type] ?? 'null';
  }
  if ('list' in type) return rich ? `[${placeholder(model, ctx, type.list, rich)}]` : '[]';
  if ('keyed_map' in type || 'map' in type) return { python: '{}', node: 'new Map()', php: '[]' }[ctx.lang];
  if ('optional' in type) return ctx.lang === 'python' ? 'None' : 'null';
  const unit = unitOf(model, type);
  const first = unit?.variants?.[0];
  if (unit?.kind === 'enum' && first !== undefined) return ctx.enumRef(langName('python', unit.name, 'class'), first.value);
  if (unit?.kind === 'record') return ctx.recordNew(unit, (unit.fields ?? []).map((f) => placeholder(model, ctx, f.type)));
  if (unit?.origin === 'callback') return ctx.callbackNew(unit, { returns: 'null' });
  // U-7: a value of a value alias is the value that its first out row of a built-in form makes for this language.
  if (unit?.kind === 'alias') {
    const forms: Record<Lang3, Record<string, string>> = {
      python: { null: 'None', bool: 'False', int: '0', bigint: '0', float: '0.0', text: '"a"', bytes: 'b""', list: '[]', map: '{}' },
      node: { null: 'null', bool: 'false', int: '0', bigint: '0n', float: '0', text: "'a'", bytes: 'new Uint8Array()', list: '[]', map: 'new Map()' },
      php: { null: 'null', bool: 'false', int: '0', float: '0.0', text: '"a"', bytes: '""', list: '[]', map: '[]' },
    };
    for (const row of unit.out ?? []) {
      const make = row.make[ctx.lang];
      const value = typeof make === 'string' ? forms[ctx.lang][make] : undefined;
      if (value !== undefined) return value;
    }
  }
  // T-5: an instance of a class, made by its first factory whose arguments are placeholders.
  const object = model.objects.find((o) => o.unit === unit);
  const factory = object?.members.find((m) => m.kind === 'constructor' || (m.kind === 'static' && unitOf(model, m.returns) === unit));
  if (factory !== undefined && ctx.objectNew !== undefined) {
    return ctx.objectNew(factory, callArgs(model, ctx, factory, (arg) => placeholder(model, ctx, arg.type, rich)));
  }
  throw new Error(`no placeholder for ${JSON.stringify(type)}`);
}

// `out`: the value as the binding gives it back, for the comparison of a result (GN-13e): an int64 is a bigint in Node
// and a tuple a tuple in Python.
export function fromJson(model: Model, ctx: Context, type: Type, value: unknown, out = false): string {
  const none = ctx.lang === 'python' ? 'None' : 'null';
  if (value === null) return none;
  if (typeof type === 'string') {
    // G-5: a text that is not well formed is {"ill_formed": "<text>"}: the text and then one code unit that no well-formed
    // text holds, an unpaired surrogate where a text is code points or UTF-16 and the byte 0xFF where it is bytes.
    if (type === 'text' && typeof value === 'object') {
      const text = (value as { ill_formed?: unknown }).ill_formed;
      if (typeof text !== 'string' || Object.keys(value).length !== 1) throw new Error(`a case value of the type text is a text or {"ill_formed": "<text>"}, not ${JSON.stringify(value)}`);
      if (ctx.lang === 'python') return `${pyString(text)} + "\\ud800"`;
      if (ctx.lang === 'node') return `${jsString(text)} + '\\uD800'`;
      return `${phpText(text)} . "\\xFF"`;
    }
    if (type === 'text' || type === 'latin1') {
      const text = String(value);
      if (ctx.lang === 'python') return pyString(text);
      if (ctx.lang === 'node') return jsString(text);
      return type === 'latin1' ? phpLatin1(text) : phpText(text);
    }
    if (type === 'bool') return ctx.lang === 'python' ? (value === true ? 'True' : 'False') : String(value === true);
    // G-5: a float that JSON cannot write is {"float": "nan" | "inf" | "-inf"}.
    if (type === 'float' && typeof value === 'object') {
      const name = (value as { float?: unknown }).float;
      const forms: Record<string, Record<Lang3, string>> = {
        nan: { python: 'float("nan")', node: 'NaN', php: 'NAN' },
        inf: { python: 'float("inf")', node: 'Infinity', php: 'INF' },
        '-inf': { python: 'float("-inf")', node: '-Infinity', php: '-INF' },
      };
      const form = typeof name === 'string' ? forms[name] : undefined;
      if (form === undefined) throw new Error(`a case value of the type float is a number or {"float": "nan" | "inf" | "-inf"}, not ${JSON.stringify(value)}`);
      return form[ctx.lang];
    }
    if (type === 'int64' && out && ctx.lang === 'node') return `${String(value)}n`;
    if (type === 'uint' || type === 'int' || type === 'int64' || type === 'float') return String(value);
    // G-5: bytes are {"hex": "<two hex digits per byte>"}; a source is its text or, for bytes that are no text, the same.
    if (type === 'bytes' || type === 'source') {
      if (type === 'source' && typeof value === 'string') return ctx.lang === 'python' ? pyString(value) : ctx.lang === 'node' ? jsString(value) : phpText(value);
      const hex = typeof value === 'object' ? (value as { hex?: unknown }).hex : undefined;
      if (typeof hex !== 'string' || !/^([0-9a-f]{2})*$/.test(hex)) throw new Error(`a case value of the type ${type} is {"hex": "<lower-case hex>"}, not ${JSON.stringify(value)}`);
      if (ctx.lang === 'python') return `bytes.fromhex(${pyString(hex)})`;
      if (ctx.lang === 'node') return `new Uint8Array(Buffer.from(${jsString(hex)}, 'hex'))`;
      return `hex2bin(${phpText(hex)})`;
    }
    throw new Error(`no case value of the type ${type}`);
  }
  if ('optional' in type) return fromJson(model, ctx, type.optional, value, out);
  if ('tuple' in type) {
    if (!Array.isArray(value) || value.length !== type.tuple.length) throw new Error(`a case value of the tuple ${JSON.stringify(type)} is an array of ${type.tuple.length} values`);
    const items = type.tuple.map((part, i) => fromJson(model, ctx, part, value[i], out));
    return ctx.lang === 'python' ? `(${items.map((item) => `${item},`).join(' ')})` : `[${items.join(', ')}]`;
  }
  if ('list' in type) {
    const items = (value as unknown[]).map((item) => fromJson(model, ctx, type.list, item, out));
    return `[${items.join(', ')}]`;
  }
  if ('map' in type) {
    // G-5: a case gives a map as an object of its entries in order.
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const k = fromJson(model, ctx, 'text', key);
      const v = fromJson(model, ctx, type.map, item, out);
      return ctx.lang === 'python' ? `${k}: ${v}` : ctx.lang === 'php' ? `${k} => ${v}` : `[${k}, ${v}]`;
    });
    return { python: `{${entries.join(', ')}}`, node: `new Map([${entries.join(', ')}])`, php: `[${entries.join(', ')}]` }[ctx.lang];
  }
  if ('keyed_map' in type) {
    // G-5: a case gives a keyed map as its entries in order, [key, value]: a key is a text, {"int": n} or {"hex": ...}.
    const entries = (value as [unknown, unknown][]).map(([key, item]) => {
      const k = caseKey(key, (kind, raw) => (kind === 'int' ? String(raw) : fromJson(model, ctx, kind, raw)));
      const v = fromJson(model, ctx, type.keyed_map, item, out);
      return ctx.lang === 'python' ? `${k}: ${v}` : ctx.lang === 'php' ? `${k} => ${v}` : `[${k}, ${v}]`;
    });
    return { python: `{${entries.join(', ')}}`, node: `new Map([${entries.join(', ')}])`, php: `[${entries.join(', ')}]` }[ctx.lang];
  }
  const unit = unitOf(model, type);
  if (aliasOf(model, type) !== undefined) {
    if (out && unit !== undefined) madeAsBuilt(unit, ctx.lang, value);
    return valueFromJson(model, ctx, value, `the alias ${String(unit?.id)}`);
  }
  if (unit?.kind === 'enum') return ctx.enumRef(langName('python', unit.name, 'class'), String(value));
  if (unit?.kind === 'record') {
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`a case value of the record ${unit.id} is not an object of its fields`);
    const fields = value as Record<string, unknown>;
    return ctx.recordNew(
      unit,
      (unit.fields ?? []).map((f) => {
        const key = langName('python', f.name, 'variable');
        if (!(key in fields)) throw new Error(`a case value of the record ${unit.id} has no field ${key}`);
        return fromJson(model, ctx, f.type, fields[key], out);
      }),
    );
  }
  throw new Error(`no case value of the type ${JSON.stringify(type)}`);
}

// GN-13e: a result of a value alias is compared with the value that valueFromJson makes, which is the value of the
// built-in form of each kind; a kind whose out rows make another form in the language is not compared yet.
const BUILT: Readonly<Record<string, string>> = { null: 'null', bool: 'bool', int: 'int', float: 'float', text: 'text', bytes: 'bytes', list: 'list', map: 'map' };
function madeAsBuilt(unit: Unit, lang: Lang3, value: unknown): void {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const kind = record?.['kind'];
  if (typeof kind !== 'string') return;
  for (const row of (unit.out ?? []).filter((r) => r.kind === kind)) {
    const make = row.make[lang];
    if (make !== BUILT[kind]) throw new Unsupported(`the kind ${kind} of ${unit.id} leaves ${lang} by the form ${JSON.stringify(make)}, with which a result is not compared yet`);
  }
  const held = record?.['value'];
  if (kind === 'list' && record?.['repeat'] !== undefined) madeAsBuilt(unit, lang, held);
  if (kind === 'list' && Array.isArray(held)) for (const item of held) madeAsBuilt(unit, lang, item);
  if (kind === 'map' && Array.isArray(held)) for (const pair of held) madeAsBuilt(unit, lang, (pair as unknown[])[1]);
}

// GN-13e: the expected result of a case in the language, or the reason why the generator cannot write it, which the
// test of the case fails with.
export function expectedText(model: Model, ctx: Context, fn: Fn, value: unknown): { text: string } | { refused: string } {
  try {
    return { text: fromJson(model, ctx, fn.returns, value, true) };
  } catch (error) {
    return { refused: `${fn.member.id}: ${error instanceof Error ? error.message : String(error)} (GN-13e)` };
  }
}

// GN-13: a value of a value type, {"kind": <value kind>, "value": ...}, as the value that the built-in form of the kind
// makes in the language: null, bool, int (a number, or its decimal text outside the safe integers), float, text,
// bytes, list and map. The other kinds are refused by name until a case needs them (G-4).
function valueFromJson(model: Model, ctx: Context, value: unknown, where: string): string {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const kind = record?.['kind'];
  if (record === undefined || typeof kind !== 'string') throw new Error(`a case value of ${where} is {"kind": <value kind>, "value": ...}, not ${JSON.stringify(value)}`);
  const held = record['value'];
  const lang = ctx.lang;
  if (kind === 'null') return lang === 'python' ? 'None' : 'null';
  if (kind === 'bool') return fromJson(model, ctx, 'bool', held);
  if (kind === 'text') return fromJson(model, ctx, 'text', held);
  if (kind === 'bytes') return fromJson(model, ctx, 'bytes', held);
  if (kind === 'float') {
    const float = fromJson(model, ctx, 'float', held);
    return lang === 'python' ? `float(${float})` : lang === 'php' ? `(float) ${float}` : float;
  }
  if (kind === 'int') {
    const token = typeof held === 'number' && Number.isSafeInteger(held) ? String(held) : typeof held === 'string' && /^-?(0|[1-9][0-9]*)$/.test(held) ? held : undefined;
    if (token === undefined) throw new Error(`a case value of the kind int of ${where} is a safe integer or a decimal text, not ${JSON.stringify(held)}`);
    if (typeof held === 'number' || lang === 'python') return token;
    if (lang === 'node') return `${token}n`;
    const wide = BigInt(token);
    if (wide < -(2n ** 63n) || wide >= 2n ** 63n) throw new Unsupported(`a case value of ${where}: the int ${token} is outside the int of PHP (G-5)`);
    return token;
  }
  // G-5: {"kind": "list", "repeat": n, "value": <value>} is n lists, each the one item of the one around it, the
  // innermost holding the value; the test makes them in a loop, as a value nested deeper than a JSON reader takes.
  if (kind === 'list' && record['repeat'] !== undefined) {
    const repeat = record['repeat'];
    if (typeof repeat !== 'number' || !Number.isSafeInteger(repeat) || repeat < 1 || Object.keys(record).length !== 3) throw new Error(`a case value of ${where} is {"kind": "list", "repeat": <n of at least 1>, "value": <value>}, not ${JSON.stringify(value)}`);
    const inner = valueFromJson(model, ctx, held, where);
    if (lang === 'python') return `__import__("functools").reduce(lambda inner, _: [inner], range(${repeat}), ${inner})`;
    if (lang === 'node') return `Array.from({ length: ${repeat} }).reduce((inner) => [inner], ${inner})`;
    return `array_reduce(array_fill(0, ${repeat}, null), fn ($inner) => [$inner], ${inner})`;
  }
  if (kind === 'list' && Array.isArray(held)) return `[${held.map((item) => valueFromJson(model, ctx, item, where)).join(', ')}]`;
  if (kind === 'map' && Array.isArray(held)) {
    const entries = (held as [unknown, unknown][]).map(([key, item]) => {
      const k = caseKey(key, (keyKind, raw) => (keyKind === 'int' ? String(raw) : fromJson(model, ctx, keyKind, raw)));
      const v = valueFromJson(model, ctx, item, where);
      return lang === 'python' ? `${k}: ${v}` : lang === 'php' ? `${k} => ${v}` : `[${k}, ${v}]`;
    });
    return { python: `{${entries.join(', ')}}`, node: `new Map([${entries.join(', ')}])`, php: `[${entries.join(', ')}]` }[lang];
  }
  throw new Unsupported(`a case value of the kind ${kind} of ${where} is not generated yet (GN-13)`);
}

// The arguments of a call in the form of each language: positional parameters, then the record's fields as Python
// keywords, PHP named arguments or one Node options object (T-4).
// U-2: an argument whose value is undefined is left out: a positional one after it goes by its name in Python and PHP,
// and Node passes undefined in its place; a field is no member of the options record.
export function callArgs(model: Model, ctx: Context, fn: Fn, value: (arg: Arg) => string | undefined, extra?: string): string {
  const name = (a: Arg, text: string): string => `${langName(ctx.lang, a.name, 'variable')}${ctx.lang === 'python' ? '=' : ': '}${text}`;
  const positional: string[] = [];
  let skipped = false;
  for (const arg of fn.args.filter((a) => !a.field)) {
    const text = value(arg);
    if (text === undefined) {
      skipped = true;
      if (ctx.lang === 'node') positional.push('undefined');
    } else {
      positional.push(skipped && ctx.lang !== 'node' ? name(arg, text) : text);
    }
  }
  while (ctx.lang === 'node' && positional.at(-1) === 'undefined') positional.pop();
  if (extra !== undefined) positional.push(extra);
  const fields = fn.args.filter((a) => a.field).flatMap((a) => {
    const text = value(a);
    return text === undefined ? [] : [{ arg: a, text }];
  });
  if (fn.record === undefined) return positional.join(', ');
  if (ctx.lang === 'node') {
    const object = fields.map((f) => `${langName('node', f.arg.name, 'variable')}: ${f.text}`).join(', ');
    return [...positional, object === '' ? '{}' : `{ ${object} }`].join(', ');
  }
  return [...positional, ...fields.map((f) => name(f.arg, f.text))].join(', ');
}

// The value of an argument in a case: undefined when the case leaves an argument with a default out (U-2).
export function caseValue(model: Model, ctx: Context, arg: Arg, args: ReadonlyMap<Arg, unknown>): string | undefined {
  if (arg.default !== undefined && !args.has(arg)) return undefined;
  return fromJson(model, ctx, arg.type, args.get(arg) ?? null);
}

// Whether the language compares two results of the type by their values: a class instance holds a core value, which
// only its members show, and a return of none shows nothing.
function comparable(model: Model, type: Type): boolean {
  if (type === 'none' || type === 'never') return false;
  if (typeof type === 'string') return true;
  if ('list' in type) return comparable(model, type.list);
  if ('optional' in type) return comparable(model, type.optional);
  if ('map' in type) return comparable(model, type.map);
  if ('keyed_map' in type) return comparable(model, type.keyed_map);
  if ('tuple' in type) return type.tuple.every((t) => comparable(model, t));
  if ('unit' in type) {
    if (objectUnit(model, type) !== undefined) return false;
    const unit = unitOf(model, type);
    return unit?.kind !== 'record' || (unit.fields ?? []).every((f) => comparable(model, f.type));
  }
  return false;
}

// G-5: two calls of a member whose results the generated test requires to be the same (the outcome is the result, or
// the class and kind of the failure): for each argument with a {literal}, {const} or {empty} default, the call that
// leaves it out and the call that gives its default (U-2); for each source parameter, the call with a text and the
// call with its UTF-8 bytes (T-1; PHP has one string). The other arguments are those of the first case of the member
// that does not raise, or placeholders. A member whose result the language cannot compare, or that takes a callback,
// has no such test (GN-13a).
export interface SamePair {
  rule: 'U-2' | 'T-1';
  arg: Arg;
  left: (arg: Arg) => string | undefined;
  right: (arg: Arg) => string | undefined;
}

export function samePairs(model: Model, ctx: Context, fn: Fn): SamePair[] {
  if (!comparable(model, fn.returns) || callbackArg(model, fn) !== undefined || fn.special !== undefined) return [];
  let given: Map<Arg, unknown> | undefined;
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    if (record['raises'] !== undefined) continue;
    given = argsOf(fn, record);
    if (given !== undefined) break;
  }
  const other = (arg: Arg): string | undefined => (given === undefined ? placeholder(model, ctx, arg.type) : caseValue(model, ctx, arg, given));
  const pairs: SamePair[] = [];
  for (const arg of fn.args) {
    const declared = defaultCaseValue(model, arg);
    if (declared !== undefined) {
      const explicit = fromJson(model, ctx, arg.type, declared.value);
      pairs.push({ rule: 'U-2', arg, left: (a) => (a === arg ? undefined : other(a)), right: (a) => (a === arg ? explicit : other(a)) });
    }
    const base = typeof arg.type === 'object' && 'optional' in arg.type ? arg.type.optional : arg.type;
    if (base === 'source' && ctx.lang !== 'php') {
      const text = fromJson(model, ctx, 'source', 'a\u00e9');
      const bytes = fromJson(model, ctx, 'source', { hex: '61c3a9' });
      pairs.push({ rule: 'T-1', arg, left: (a) => (a === arg ? text : other(a)), right: (a) => (a === arg ? bytes : other(a)) });
    }
  }
  return pairs;
}

// T-1, T-7: the base type of a parameter that takes bytes: bytes, or a source, which takes a text too.
export const bytesKind = (type: Type): 'bytes' | 'source' | undefined => {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  return base === 'bytes' || base === 'source' ? base : undefined;
};

// The cases of the contract that make a member raise, with the arguments the case gives (K-1).
export interface RaisingCase {
  id: string;
  args: Map<Arg, unknown>;
  raises: { kind: string; status: number | null; category: string; errno?: unknown };
  // G-5: the faults that the case arms before its call, as the JSON text that the arming entry point takes.
  faults?: string;
  // The instance that a method or property is called on, made by a static member or the constructor (T-5).
  receiver?: Receiver;
}

// The callables whose tests are generated: the functions, then the members of each class unit.
// An iterate has no arguments to test; it is iterated in the round trip of GN-13a. A stringify and a to_json are
// called by the name of the language's hook (N-4, memberName).
export const callables = (model: Model): Fn[] => [...model.functions, ...model.objects.flatMap((o) => o.members.filter((fn) => fn.kind !== 'iterate'))];

export interface Receiver {
  factory: Fn;
  args: Map<Arg, unknown>;
  // G-5 (GN-13f): the instance value of a case. The instance that the factory is called on when it is a method, the
  // steps into its result when the result holds the instance (from), and the calls on the instance that prepare it.
  on?: Receiver;
  pick?: Pick[];
  then?: { fn: Fn; args: Map<Arg, unknown> }[];
}

// G-5 (GN-13f): a step into a result: a field of a record, an item of a list, a part of a tuple.
export type Pick = { field: string } | { index: number } | { tuple: number };

// Whether a receiver is one factory call, which a test writes as one expression.
export const isPlain = (receiver: Receiver): boolean =>
  receiver.on === undefined && (receiver.pick ?? []).length === 0 && (receiver.then ?? []).length === 0 && ![...receiver.args.values()].some(isInstanceValue);

// G-5 (GN-13f): whether a case value is an instance value, {"new": ...} or {"from": ...}.
export const isInstanceValue = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && (typeof (value as Record<string, unknown>)['new'] === 'string' || typeof (value as Record<string, unknown>)['from'] === 'string');

// Every member of the model by its id: the functions and the members of the class units.
const memberById = (model: Model, id: string): Fn | undefined =>
  [...model.functions, ...model.objects.flatMap((o) => o.members)].find((fn) => fn.member.id === id);

// The type that the steps of a pick reach from a type, or a reason.
export function pickedType(model: Model, type: Type, pick: readonly unknown[]): Type | string {
  let at = type;
  for (const [i, step] of pick.entries()) {
    const what = `step ${i} of pick`;
    if (typeof at === 'object' && 'optional' in at) return `${what} reads an optional, which a pick does not step into`;
    if (typeof step === 'string') {
      const unit = unitOf(model, at);
      const field = unit?.kind === 'record' ? (unit.fields ?? []).find((f) => langName('python', f.name, 'variable') === step) : undefined;
      if (field === undefined) return `${what} names the field ${step}, which ${JSON.stringify(at)} has not`;
      at = field.type;
      continue;
    }
    const record = typeof step === 'object' && step !== null && !Array.isArray(step) ? (step as Record<string, unknown>) : {};
    const n = record['index'] ?? record['tuple'];
    if (Object.keys(record).length !== 1 || typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return `${what} is not a field name, {"index": n} or {"tuple": n}`;
    if ('index' in record) {
      if (typeof at !== 'object' || !('list' in at)) return `${what} takes an item of ${JSON.stringify(at)}, which is no list`;
      at = at.list;
    } else {
      if (typeof at !== 'object' || !('tuple' in at) || n >= at.tuple.length) return `${what} takes part ${n} of ${JSON.stringify(at)}, which is no tuple of that length`;
      at = at.tuple[n] ?? 'none';
    }
  }
  return at;
}

// G-5 (GN-13f): the instance of the class unit `unitId` that an instance value gives:
//   {"new": "<member id>", "receiver": <instance value>?, "args": {...}, "then": [{"call": "<member id>", "args": {...}}]}
//   {"from": "<member id>", "receiver": <instance value>?, "args": {...}, "pick": [<step>], "then": [...]}
// new names a member that returns the class; from a member whose result holds it, which pick reaches. receiver is
// the instance that the member is called on, when it is a method. Each call of then is a member of the class, called
// on the instance in order. The binding check reports every value that breaks this (CK-22); here it is an error.
export function instanceOf(model: Model, unitId: string, value: unknown, where: string): Receiver {
  const fail = (message: string): never => {
    throw new Error(`${where}: ${message} (G-5, GN-13f)`);
  };
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail('an instance value is {"new" | "from": <member id>, ...}');
  const id = record['new'] ?? record['from'];
  const factory = typeof id === 'string' ? memberById(model, id) : undefined;
  if (factory === undefined) return fail(`${String(id)} is no member that the binding generates`);
  const pick = Array.isArray(record['pick']) ? record['pick'] : [];
  const reached = pickedType(model, factory.returns, 'from' in record ? pick : []);
  if (typeof reached === 'string') return fail(reached);
  if (typeof reached !== 'object' || !('unit' in reached) || reached.unit !== unitId || reached.library !== undefined) fail(`${factory.member.id} gives ${JSON.stringify(reached)}, not the class ${unitId}`);
  const args = argsOf(factory, (record['args'] ?? {}) as Record<string, unknown>) ?? fail(`the args are not the parameters of ${factory.member.id}`);
  const on = factory.receiver === undefined ? undefined : instanceOf(model, factory.unit.id, record['receiver'] ?? fail(`${factory.member.id} is a method, so the value gives its receiver`), `${where}, the receiver of ${factory.member.id}`);
  const then = (Array.isArray(record['then']) ? record['then'] : []).map((item, i) => {
    const step = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const fn = typeof step['call'] === 'string' ? memberById(model, step['call']) : undefined;
    if (fn === undefined || fn.unit.id !== unitId || fn.receiver === undefined) return fail(`then ${i} calls ${String(step['call'])}, which is no method of ${unitId}`);
    return { fn, args: argsOf(fn, (step['args'] ?? {}) as Record<string, unknown>) ?? fail(`the args of then ${i} are not the parameters of ${fn.member.id}`) };
  });
  const picks = pick.map((step): Pick => (typeof step === 'string' ? { field: step } : 'index' in (step as object) ? { index: (step as { index: number }).index } : { tuple: (step as { tuple: number }).tuple }));
  return { factory, args, ...(on === undefined ? {} : { on }), ...(picks.length === 0 ? {} : { pick: picks }), ...(then.length === 0 ? {} : { then }) };
}

// How a language writes the statements that make an instance (GN-13f).
export interface MadeForm {
  ctx: Context;
  invoke: (fn: Fn, args: string, receiver: string) => string;
  // The statement that binds a local name to an expression, and the name as an expression.
  bind: (name: string, expr: string) => string;
  name: (local: string) => string;
  // The statement that runs an expression for its effect.
  run: (expr: string) => string;
  // The expression that steps into a value: a field (snake_case name), an item or a part of a tuple.
  pick: (expr: string, step: Pick) => string;
}

// G-5 (GN-13f): the statements that make an instance and the expression that names it. Every instance that the value
// makes, the receivers and the results that a pick reads from, is a local of the test, so none is reclaimed before the
// test ends; a plain receiver is one expression.
export function madeLines(model: Model, form: MadeForm, receiver: Receiver, prefix = 'made'): { lines: string[]; expr: string } {
  const lines: string[] = [];
  let count = 0;
  const fresh = (): string => `${prefix}${count++}`;
  const argsText = (fn: Fn, args: ReadonlyMap<Arg, unknown>): string =>
    callArgs(model, form.ctx, fn, (arg) => {
      const raw = args.get(arg);
      if (isInstanceValue(raw)) {
        const unit = typeof arg.type === 'object' && 'unit' in arg.type ? arg.type.unit : '';
        return make(instanceOf(model, unit, raw, `${fn.member.id}.${arg.name.join('_')}`));
      }
      return caseValue(model, form.ctx, arg, args);
    });
  const make = (r: Receiver): string => {
    if (isPlain(r)) {
      const local = fresh();
      lines.push(form.bind(local, form.invoke(r.factory, argsText(r.factory, r.args), '')));
      return form.name(local);
    }
    const on = r.on === undefined ? '' : make(r.on);
    let expr = form.invoke(r.factory, argsText(r.factory, r.args), on);
    for (const step of r.pick ?? []) {
      const local = fresh();
      lines.push(form.bind(local, expr));
      expr = form.pick(form.name(local), step);
    }
    const local = fresh();
    lines.push(form.bind(local, expr));
    for (const step of r.then ?? []) lines.push(form.run(form.invoke(step.fn, argsText(step.fn, step.args), form.name(local))));
    return form.name(local);
  };
  if (isPlain(receiver)) return { lines, expr: form.invoke(receiver.factory, argsText(receiver.factory, receiver.args), '') };
  const expr = make(receiver);
  return { lines, expr };
}

// The arguments that a case gives to the parameters of a member, or undefined when a key is missing.
function argsOf(fn: Fn, record: Record<string, unknown>): Map<Arg, unknown> | undefined {
  const args = new Map<Arg, unknown>();
  for (const arg of fn.args) {
    const snake = langName('python', arg.name, 'variable');
    const holderKey = arg.field && fn.record !== undefined ? langName('python', fn.record.param.name, 'variable') : undefined;
    const holder = holderKey === undefined ? record : record[holderKey];
    if (typeof holder !== 'object' || holder === null) return undefined;
    // U-2: a case that has no key of an argument with a default leaves it out.
    if (!(snake in holder)) {
      if (arg.default !== undefined) continue;
      return undefined;
    }
    args.set(arg, (holder as Record<string, unknown>)[snake]);
  }
  return args;
}

// T-5: the factory of a class unit whose parameters a case gives: a static member or the constructor that returns the
// class, the first in contract order.
export function receiverOf(model: Model, fn: Fn, record: Record<string, unknown>): Receiver | undefined {
  if (fn.receiver === undefined) return undefined;
  // GN-13f: a case that gives its receiver as an instance value.
  if (record['receiver'] !== undefined) return instanceOf(model, fn.unit.id, record['receiver'], `the case ${String(record['id'])} of ${fn.member.id}`);
  const object = model.objects.find((o) => o.unit === fn.unit);
  for (const factory of object?.members ?? []) {
    const returns = factory.returns;
    const makes = typeof returns === 'object' && 'unit' in returns && returns.unit === fn.unit.id && returns.library === undefined;
    if (factory.receiver !== undefined || !makes) continue;
    const args = argsOf(factory, record);
    if (args !== undefined) return { factory, args };
  }
  return undefined;
}

// An instance for the tests of a method that need any valid receiver: the factory arguments of the first case of the
// class's members that does not raise.
export function sampleReceiver(model: Model, fn: Fn): Receiver | undefined {
  const object = model.objects.find((o) => o.unit === fn.unit);
  for (const member of object?.members ?? []) {
    for (const kase of model.cases.get(member.member.id) ?? []) {
      const record = kase as Record<string, unknown>;
      if (record['raises'] !== undefined) continue;
      const found = receiverOf(model, fn, record);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

// N-4: the cases of a stringify that do not raise, each with the instance of its factory arguments and the text that
// the language's string form gives.
export function stringCases(model: Model, fn: Fn): { id: string; receiver: Receiver; result: string }[] {
  if (fn.special !== 'stringify') return [];
  const out: { id: string; receiver: Receiver; result: string }[] = [];
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    if (record['raises'] !== undefined) continue;
    const receiver = receiverOf(model, fn, record);
    const result = record['result'];
    if (receiver === undefined || typeof result !== 'string') {
      throw new Error(`the case ${String(record['id'])} of ${fn.member.id} gives ${receiver === undefined ? `no arguments of a factory of ${fn.unit.id}` : 'no text as its result'} (G-5, N-4)`);
    }
    out.push({ id: String(record['id']), receiver, result });
  }
  return out;
}

export function raisingCases(model: Model, fn: Fn): RaisingCase[] {
  const out: RaisingCase[] = [];
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    const raises = record['raises'] as RaisingCase['raises'] | undefined;
    if (raises === undefined) continue;
    const args = argsOf(fn, record);
    if (args === undefined) {
      const missing = fn.args.map((a) => langName('python', a.name, 'variable')).filter((name) => !(name in record));
      throw new Error(`the case ${String(record['id'])} of ${fn.member.id} has no ${missing.join(', ') || 'record field'} (G-5: case keys are the parameter names in snake_case)`);
    }
    const receiver = receiverOf(model, fn, record);
    if (fn.receiver !== undefined && receiver === undefined) {
      throw new Error(`the case ${String(record['id'])} of ${fn.member.id} gives no arguments of a factory of ${fn.unit.id} (G-5, T-5)`);
    }
    const faults = record['faults'];
    if (faults !== undefined && model.faults.length === 0) throw new Error(`the case ${String(record['id'])} of ${fn.member.id} arms faults, but the contract names no fault injection point (G-5)`);
    const own = `${model.contract.library.replaceAll('-', '_')}.`;
    const other = (Array.isArray(faults) ? faults : []).map((fault) => String((fault as Record<string, unknown> | null)?.['point'])).find((point) => !point.startsWith(own));
    if (other !== undefined) throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id}: the point ${other} of another library is not armed yet (G-5)`);
    out.push({ id: String(record['id']), args, raises, ...(faults === undefined ? {} : { faults: JSON.stringify(faults) }), ...(receiver === undefined ? {} : { receiver }) });
  }
  return out;
}

// GN-13e: a case that does not raise, with the arguments the case gives, its receiver and the result it expects: the
// value of the key that the row of `cases` names (`result` by default), absent when the case has no such key. A case
// that the generator cannot run carries the reason, which its test fails with (G-4).
export interface ResultCase {
  id: string;
  args: Map<Arg, unknown>;
  receiver?: Receiver;
  expected?: { value: unknown };
  refused?: string;
}

// GN-13e: whether the language compares a result of the type with the value of a case: a class has no case value
// form, and a return of none or never has no result.
export function comparableResult(model: Model, type: Type): string | undefined {
  if (type === 'none' || type === 'never') return 'a member that returns nothing has no result to compare';
  if (typeof type === 'string') return undefined;
  if ('list' in type) return comparableResult(model, type.list);
  if ('optional' in type) return comparableResult(model, type.optional);
  if ('map' in type) return comparableResult(model, type.map);
  if ('keyed_map' in type) return comparableResult(model, type.keyed_map);
  if ('tuple' in type) return type.tuple.map((t) => comparableResult(model, t)).find((reason) => reason !== undefined);
  if (objectUnit(model, type) !== undefined) return 'a class has no case value form';
  // A value alias is compared where its out rows make the built-in form of each kind (expectedText).
  if (aliasOf(model, type) !== undefined) return undefined;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return undefined;
  if (unit?.kind === 'record') return (unit.fields ?? []).map((f) => comparableResult(model, f.type)).find((reason) => reason !== undefined);
  return `a result of ${JSON.stringify(type)} is not compared yet`;
}

export function resultCases(model: Model, fn: Fn): ResultCase[] {
  const out: ResultCase[] = [];
  const keys = model.resultKeys?.get(fn.member.id);
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    // A hook's cases are its own tests (N-4), and a case with faults that does not raise is not generated yet (GN-13a).
    if (record['raises'] !== undefined || record['faults'] !== undefined || fn.special !== undefined) continue;
    const id = String(record['id']);
    const key = keys?.get(kase) ?? 'result';
    const args = argsOf(fn, record);
    if (args === undefined) {
      const missing = fn.args.map((a) => langName('python', a.name, 'variable')).filter((name) => !(name in record));
      out.push({ id, args: new Map(), refused: `the case ${id} of ${fn.member.id} has no ${missing.join(', ') || 'record field'} (G-5: case keys are the parameter names in snake_case)` });
      continue;
    }
    const receiver = receiverOf(model, fn, record);
    if (fn.receiver !== undefined && receiver === undefined) {
      out.push({ id, args, refused: `the case ${id} of ${fn.member.id} gives no arguments of a factory of ${fn.unit.id} (G-5, T-5)` });
      continue;
    }
    const base = { id, args, ...(receiver === undefined ? {} : { receiver }) };
    if (!(key in record)) {
      out.push(base);
      continue;
    }
    const reason = comparableResult(model, fn.returns);
    out.push(reason === undefined ? { ...base, expected: { value: record[key] } } : { ...base, refused: `the case ${id} of ${fn.member.id} gives ${key}, but ${reason} (GN-13e)` });
  }
  return out;
}

export const isNumber = (type: Type): string | undefined => {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  return typeof base === 'string' && ['uint', 'int', 'int64', 'float'].includes(base) ? base : undefined;
};

export const textKind = (type: Type): 'text' | 'latin1' | undefined => {
  let base = type;
  while (typeof base === 'object' && ('optional' in base || 'list' in base)) base = 'optional' in base ? base.optional : base.list;
  return base === 'text' || base === 'latin1' ? base : undefined;
};

// A value of the type whose innermost text is `text`, for the B-3 tests.
export function wrapText(type: Type, text: string): string {
  if (typeof type === 'object' && 'list' in type) return `[${wrapText(type.list, text)}]`;
  if (typeof type === 'object' && 'optional' in type) return wrapText(type.optional, text);
  return text;
}

// T-2: a keyed map with one key of a kind that the contract type does not list, in the language's form, or undefined
// when the language has no such key: a PHP string key is a text when it is UTF-8 and text is listed, else a byte
// string, so PHP has a refused string key only when bytes are not listed.
export function refusedKeyMap(model: Model, ctx: Context, type: Type): { kind: string; value: string } | undefined {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  // T-2: map<T> has text keys only; a PHP int key is its decimal text, so PHP has no refused key of a map.
  if (typeof base === 'object' && 'map' in base) {
    const value = placeholder(model, ctx, base.map);
    const literal = { python: `{1: ${value}}`, node: `new Map([[1, ${value}]])`, php: undefined }[ctx.lang];
    return literal === undefined ? undefined : { kind: 'int', value: literal };
  }
  if (typeof base !== 'object' || !('keyed_map' in base)) return undefined;
  const value = placeholder(model, ctx, base.keyed_map);
  const literals: Record<Lang3, Record<string, string>> = {
    python: { int: `{1: ${value}}`, bytes: `{b"k": ${value}}`, text: `{"k": ${value}}` },
    node: { int: `new Map([[1, ${value}]])`, bytes: `new Map([[new Uint8Array([107]), ${value}]])`, text: `new Map([['k', ${value}]])` },
    php: { int: `[1 => ${value}]`, bytes: base.key.includes('text') ? `["\\xff" => ${value}]` : `["k" => ${value}]` },
  };
  const kind = ['int', 'bytes', 'text'].find((k) => !base.key.includes(k) && literals[ctx.lang][k] !== undefined);
  return kind === undefined ? undefined : { kind, value: literals[ctx.lang][kind] ?? '' };
}

// U-3: the first parameter of a member that is a callback, for the tests of K-2.
// G-5 callback fixture: the value of a callback parameter in a case, {"callback": {<callback member id>: [<row>]},
// "calls": [{"member", "args"}]}. A row is {"args": {...}} with "result" (absent for a return of none) and "once".
export interface Fixture {
  arg: Arg;
  unit: Unit;
  // The rows of each member of the callback unit, by its position in the unit: the arguments in parameter order, the
  // result and whether the row is used once, each a case value.
  rows: { member: number; args: unknown[]; result: unknown; once: boolean }[];
  // The calls that the core makes in order, when the case names them.
  calls?: { member: number; args: unknown[] }[];
}

// The fixtures of a case: one for each callback parameter of the member. The contract check has judged the form
// (CK-22); a row that the generated fixture cannot run is refused by name (G-4).
export function fixturesOf(model: Model, fn: Fn, id: string, args: Map<Arg, unknown>): Fixture[] {
  const out: Fixture[] = [];
  for (const arg of fn.args) {
    const unit = unitOf(model, arg.type);
    if (unit?.origin !== 'callback') continue;
    const where = `the case ${id} of ${fn.member.id}`;
    const value = args.get(arg) as { callback?: Record<string, unknown[]>; calls?: { member: string; args?: Record<string, unknown> }[] } | null | undefined;
    if (typeof value !== 'object' || value === null || typeof value.callback !== 'object' || value.callback === null) {
      throw new Error(`${where} gives no {"callback": ...} for ${langName('python', arg.name, 'variable')} (G-5)`);
    }
    const members = unit.members ?? [];
    const position = (memberId: string): number => {
      const found = members.findIndex((m) => m.id === memberId);
      if (found < 0) throw new Error(`${where} names ${memberId}, which is no member of ${unit.id} (G-5)`);
      return found;
    };
    const ordered = (member: number, given: Record<string, unknown> | undefined): unknown[] =>
      (members[member]?.parameters ?? []).map((p) => {
        const key = langName('python', p.name, 'variable');
        if (given === undefined || !(key in given)) throw new Error(`${where} gives no ${key} in the args of ${members[member]?.id ?? ''} (G-5)`);
        return given[key];
      });
    const rows: Fixture['rows'] = [];
    for (const [memberId, list] of Object.entries(value.callback)) {
      const member = position(memberId);
      for (const row of list as Record<string, unknown>[]) {
        if (row['raise'] !== undefined) throw new Unsupported(`${where}: a raise row of a callback fixture is not generated yet`);
        if (row['async'] === true) throw new Unsupported(`${where}: an async row of a callback fixture is not generated yet`);
        rows.push({ member, args: ordered(member, row['args'] as Record<string, unknown> | undefined), result: row['result'] ?? null, once: row['once'] === true });
      }
    }
    const calls = value.calls?.map((call) => ({ member: position(call.member), args: ordered(position(call.member), call.args) }));
    out.push({ arg, unit, rows, ...(calls === undefined ? {} : { calls }) });
  }
  return out;
}

// The rows and the expected calls of a fixture as the values of a language: the member name, the arguments, and for a
// row the result and whether it is used once.
export function fixtureValues(model: Model, ctx: Context, fixture: Fixture): { members: string[]; rows: string[][]; calls: string[][] | undefined } {
  const members = fixture.unit.members ?? [];
  const name = (member: number): string => langName(ctx.lang, members[member]?.name ?? [], 'callable');
  const argsOf = (member: number, args: unknown[]): string[] => (members[member]?.parameters ?? []).map((p, i) => fromJson(model, ctx, p.type, args[i] ?? null));
  const none = ctx.lang === 'python' ? 'None' : 'null';
  const flag = (on: boolean): string => (ctx.lang === 'python' ? (on ? 'True' : 'False') : String(on));
  const list = (items: string[]): string => (ctx.lang === 'python' ? `(${items.map((i) => `${i},`).join(' ')})` : `[${items.join(', ')}]`);
  const text = (value: string): string => (ctx.lang === 'python' ? pyString(value) : ctx.lang === 'node' ? jsString(value) : phpText(value));
  return {
    members: members.map((_m, i) => text(name(i))),
    rows: fixture.rows.map((row) => {
      const returns = members[row.member]?.returns ?? 'none';
      const result = row.result === null || returns === 'none' ? none : fromJson(model, ctx, returns, row.result);
      return [text(name(row.member)), list(argsOf(row.member, row.args)), result, flag(row.once)];
    }),
    calls: fixture.calls?.map((call) => [text(name(call.member)), list(argsOf(call.member, call.args))]),
  };
}

export function callbackArg(model: Model, fn: Fn): Arg | undefined {
  return fn.args.find((a) => unitOf(model, a.type)?.origin === 'callback');
}

// K-2: whether a result of another type is a failure of the binding. A member that returns a value alias gives every
// value to the alias's core, which judges it (B-1), so the kind of a refused result is the alias's, not the binding's.
export function judgesCallbackResult(model: Model, callback: Unit): boolean {
  const namesAlias = (type: Type): boolean => {
    if (typeof type === 'string') return false;
    if ('list' in type) return namesAlias(type.list);
    if ('map' in type) return namesAlias(type.map);
    if ('keyed_map' in type) return namesAlias(type.keyed_map);
    if ('optional' in type) return namesAlias(type.optional);
    if ('tuple' in type) return type.tuple.some(namesAlias);
    return unitOf(model, type)?.kind === 'alias';
  };
  return !(callback.members ?? []).some((m) => namesAlias(m.returns ?? 'none'));
}

// G-5: the key of a keyed map in a case: a text, {"int": n} or {"hex": "<lower-case hex>"} for a byte string.
export function caseKey<T>(key: unknown, make: (kind: 'int' | 'text' | 'bytes', value: unknown) => T): T {
  if (typeof key === 'string') return make('text', key);
  if (typeof key === 'object' && key !== null && 'int' in key && Number.isSafeInteger((key as { int: unknown }).int)) return make('int', (key as { int: number }).int);
  if (typeof key === 'object' && key !== null && 'hex' in key) return make('bytes', key);
  throw new Error(`a key of a keyed map in a case is a text, {"int": n} or {"hex": ...}, not ${JSON.stringify(key)}`);
}

// G-5: the errno that a raising case expects: none, a number, or the symbol of an errno, whose value each language
// gives on the target.
export function expectedErrno(kase: RaisingCase): { symbol: string } | { value: number } | null {
  const errno = kase.raises.errno;
  if (errno === undefined || errno === null) return null;
  if (typeof errno === 'string') return { symbol: errno };
  if (typeof errno === 'number') return { value: errno };
  throw new Error(`the errno of the case ${kase.id} is neither a symbol nor a number (G-5)`);
}

// U-7: a case of the in function of a value alias: the value that the alias refuses and the kind it gives, with the
// category of the kind (E-1).
export interface AliasCase {
  alias: ValueAlias;
  id: string;
  value: unknown;
  kind: string;
  category: string;
}

export function aliasCases(model: Model): AliasCase[] {
  const out: AliasCase[] = [];
  for (const alias of model.aliases) {
    for (const kase of model.aliasCases.get(alias.unit.id) ?? []) {
      const record = kase as Record<string, unknown>;
      const where = `the case ${String(record['id'])} of the alias ${alias.unit.id}`;
      const kind = (record['raises'] as Record<string, unknown> | undefined)?.['kind'];
      const row = model.contract.errors.kinds.find((k) => typeof kind === 'string' && k.library === undefined && kindsOf(k).includes(kind));
      if (typeof kind !== 'string' || row?.category === undefined) throw new Error(`${where} raises no kind of errors.kinds (U-7)`);
      const value = record['value'];
      // G-5: a value of the language by its kind, {"host": ...}, waits for the closed table of those kinds.
      if (typeof value === 'object' && value !== null && 'host' in value) throw new Unsupported(`${where}: a value {"host": ...} is not generated yet (G-5)`);
      out.push({ alias, id: String(record['id']), value, kind, category: row.category });
    }
  }
  return out;
}

// U-7: the value that shows a kind of an alias coming up through a member: the value of the first case of the alias,
// at the place of the alias in the parameter type. The place is the parameter itself, an optional of it, or the first
// item of a list of it; any other place is an open item (GN-13a).
export function aliasRepresentative(model: Model, ctx: Context, type: Type): { kase: AliasCase; value: string } | undefined {
  const wrap = (inner: Type): ((value: string) => string) | undefined => {
    if (typeof inner !== 'object') return undefined;
    if ('optional' in inner) return wrap(inner.optional);
    if ('list' in inner) {
      const item = wrap(inner.list);
      return item === undefined ? undefined : (value) => `[${item(value)}]`;
    }
    return aliasOf(model, inner) === undefined ? undefined : (value) => value;
  };
  const inner = (found: Type): Type => (typeof found === 'object' && 'optional' in found ? inner(found.optional) : typeof found === 'object' && 'list' in found ? inner(found.list) : found);
  const place = wrap(type);
  const alias = aliasOf(model, inner(type));
  const kase = alias === undefined ? undefined : aliasCases(model).find((c) => c.alias === alias);
  if (place === undefined || kase === undefined) return undefined;
  return { kase, value: place(fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)) };
}
