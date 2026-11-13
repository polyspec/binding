// Argument values of the generated tests (G-5): a placeholder value of each contract type, which the binding converts
// without failing, and the value of a contract case, which the case file gives as JSON (keys are the parameter names in
// snake_case, a record parameter is an object of its fields, an enum is its value text, latin1 is text of U+0000 to
// U+00FF).

import type { Name, Type } from '../contract.ts';
import type { Unit } from '../contract.ts';
import { defaultCaseValue } from './defaults.ts';
import { type Arg, type Fn, type KeptClass, type Model, type ObjectClass, type ValueAlias, Unsupported, aliasOf, kindText, langName, objectUnit, unitOf } from './model.ts';
import { kindsOf } from '../contract.ts';
import { jsString, phpLatin1, phpText, pyString } from './text.ts';

export type Lang3 = 'python' | 'node' | 'php';

// A case value in a message: an integer outside the safe integers is a bigint (cli.ts reads the case files so), which
// JSON.stringify does not write.
export const shown = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? String(item) : item));

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
  // The target whose rows of make a value takes, when it is not lang: WASM writes its tests as Node does.
  target?: 'wasm';
  // GN-13f: the expression that makes the instance of an instance value of a case at any place of a class.
  instanceNew?: (receiver: Receiver) => string;
  // GN-6z: the expression of a function value of a case from its rows, where the test reads no record of its calls.
  functionNew?: (rows: string[][]) => string;
  // GN-6aa: the expression of the object of a callback fixture inside another value, whose calls the test does not read.
  fixtureNew?: (values: { members: string[]; rows: string[][] }) => string;
  // GN-13e: the steps that make a deep case value in local variables (Python), at the depth of the values in making.
  steps?: Steps | undefined;
  // GN-6y: the expression of a relative path of a case inside the directory of the test.
  casePath?: (relative: string) => string;
}

// GN-13e: bind gives a value that reaches the bound of nesting a local variable and returns its name; done ends the
// whole value, in a function of the module when a step was bound; drop forgets the steps of a value that failed.
export interface Steps {
  depth: number;
  bind: (expr: string) => string;
  done: (expr: string) => string;
  drop: () => void;
}

export type CallbackHow = { returns: 'null' } | { missing: true } | { raise: string } | { returns: 'wrong' };

// rich: a list has one item rather than none, so that a member that calls a callback per item calls it (K-2).
export function placeholder(model: Model, ctx: Context, type: Type, rich = false): string {
  if (typeof type === 'string') {
    const table: Record<Lang3, Record<string, string>> = {
      python: { text: '"a"', latin1: '"a"', bool: 'False', uint: '0', int: '0', int64: '0', float: '0.0', bytes: 'b""', source: '"a"', path: '"a"' },
      node: { text: "'a'", latin1: "'a'", bool: 'false', uint: '0', int: '0', int64: '0', float: '0', bytes: 'new Uint8Array()', source: "'a'", path: "'a'" },
      php: { text: '"a"', latin1: '"a"', bool: 'false', uint: '0', int: '0', int64: '0', float: '0.0', bytes: '""', source: '"a"', path: '"a"' },
    };
    return table[ctx.lang][type] ?? 'null';
  }
  if ('list' in type) return rich ? `[${placeholder(model, ctx, type.list, rich)}]` : '[]';
  if ('keyed_map' in type || 'map' in type) return { python: '{}', node: 'new Map()', php: '[]' }[ctx.lang];
  if ('optional' in type) return ctx.lang === 'python' ? 'None' : 'null';
  // GN-6z: a function that returns the placeholder of its return type, whatever its arguments.
  if ('function' in type) {
    const returns = type.function.returns;
    const value = returns === 'none' ? { python: 'None', node: 'undefined', php: 'null' }[ctx.lang] : placeholder(model, ctx, returns, rich);
    return { python: `lambda *_arguments: ${value}`, node: `(() => ${value})`, php: `fn (...$arguments) => ${value}` }[ctx.lang];
  }
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
  throw new Unsupported(`no placeholder for ${shown(type)} is written yet (G-5)`);
}

// GN-6y: a case value of a path is a relative path inside the directory of the test; an empty or absolute path and a
// part .. would leave it.
export function casePathOf(value: unknown): string {
  const parts = typeof value === 'string' ? value.split('/') : [];
  if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\') || parts.includes('..') || parts.includes('')) {
    throw new Unsupported(`a case value of the type path is a relative path inside the directory of the test, without .. (GN-6y), not ${shown(value)}`);
  }
  return value;
}

// `out`: the value as the binding gives it back, for the comparison of a result (GN-13e): an int64 is a bigint in Node
// and a tuple a tuple in Python.
// GN-13e: the expression of a case value in the language; where the language binds a deep value step by step (Python),
// each value is given to the steps, and the whole value to their end.
export function fromJson(model: Model, ctx: Context, type: Type, value: unknown, out = false): string {
  const steps = ctx.steps;
  if (steps === undefined) return valueForm(model, ctx, type, value, out);
  steps.depth += 1;
  try {
    const expr = valueForm(model, ctx, type, value, out);
    return steps.depth === 1 ? steps.done(expr) : steps.bind(expr);
  } finally {
    steps.depth -= 1;
    if (steps.depth === 0) steps.drop();
  }
}

function valueForm(model: Model, ctx: Context, type: Type, value: unknown, out: boolean): string {
  const none = ctx.lang === 'python' ? 'None' : 'null';
  if (value === null) return none;
  if (typeof type === 'string') {
    // G-5: a text that is not well formed is {"ill_formed": "<text>"}: the text and then one code unit that no well-formed
    // text holds, an unpaired surrogate where a text is code points or UTF-16 and the byte 0xFF where it is bytes.
    if (type === 'text' && typeof value === 'object') {
      const text = (value as { ill_formed?: unknown }).ill_formed;
      if (typeof text !== 'string' || Object.keys(value).length !== 1) throw new Unsupported(`a case value of the type text is a text or {"ill_formed": "<text>"}, not ${shown(value)}`);
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
      if (form === undefined) throw new Unsupported(`a case value of the type float is a number or {"float": "nan" | "inf" | "-inf"}, not ${shown(value)}`);
      return form[ctx.lang];
    }
    // T-1: an int64 is a bigint in Node, which takes a number of the safe integers too; a case gives an integer outside
    // them as a bigint (cli.ts), whose decimal token every language writes.
    if (type === 'int64' && ctx.lang === 'node' && (out || typeof value === 'bigint')) return `${String(value)}n`;
    // B-2, G-5: a float is a float literal in Python and PHP, which refuse an integer there, also where JSON writes an
    // integer; a negative zero keeps its sign, and an integer of 1e16 or more is written with its exponent, as Python
    // writes it.
    if (type === 'float' && typeof value === 'number') {
      if (Object.is(value, -0)) return ctx.lang === 'node' ? '-0' : '-0.0';
      if (ctx.lang === 'node' || !Number.isInteger(value)) return String(value);
      return Math.abs(value) >= 1e16 ? value.toExponential() : `${String(value)}.0`;
    }
    if (type === 'uint' || type === 'int' || type === 'int64' || type === 'float') return String(value);
    // G-5: bytes are {"hex": "<two hex digits per byte>"}; a source is its text or, for bytes that are no text, the same.
    if (type === 'bytes' || type === 'source') {
      if (type === 'source' && typeof value === 'string') return ctx.lang === 'python' ? pyString(value) : ctx.lang === 'node' ? jsString(value) : phpText(value);
      const hex = typeof value === 'object' ? (value as { hex?: unknown }).hex : undefined;
      if (typeof hex !== 'string' || !/^([0-9a-f]{2})*$/.test(hex)) throw new Unsupported(`a case value of the type ${type} is {"hex": "<lower-case hex>"}, not ${shown(value)}`);
      if (ctx.lang === 'python') return `bytes.fromhex(${pyString(hex)})`;
      if (ctx.lang === 'node') return `new Uint8Array(Buffer.from(${jsString(hex)}, 'hex'))`;
      return `hex2bin(${phpText(hex)})`;
    }
    if (type === 'path') {
      const relative = casePathOf(value);
      if (ctx.casePath === undefined) throw new Unsupported(`a case value of the type path is not generated for ${ctx.target ?? ctx.lang} (GN-6y)`);
      return ctx.casePath(relative);
    }
    throw new Unsupported(`no case value of the type ${type}`);
  }
  if ('optional' in type) return fromJson(model, ctx, type.optional, value, out);
  if ('tuple' in type) {
    if (!Array.isArray(value) || value.length !== type.tuple.length) throw new Unsupported(`a case value of the tuple ${shown(type)} is an array of ${type.tuple.length} values`);
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
    if (typeof value !== 'object' || Array.isArray(value)) throw new Unsupported(`a case value of the record ${unit.id} is not an object of its fields`);
    const fields = value as Record<string, unknown>;
    return ctx.recordNew(
      unit,
      (unit.fields ?? []).map((f) => {
        const key = langName('python', f.name, 'variable');
        if (!(key in fields)) throw new Unsupported(`a case value of the record ${unit.id} has no field ${key}`);
        return fromJson(model, ctx, f.type, fields[key], out);
      }),
    );
  }
  // GN-13f: the value of a class is an instance value, at any place of the case.
  // GN-6aa: a callback value inside another value is the object of a fixture, whose unexpected call raises; an instance
  // value at a place of a callback is an instance of a class that implements it (GN-13f).
  if (unit?.origin === 'callback' && ctx.fixtureNew !== undefined && typeof value === 'object' && value !== null && 'callback' in value) {
    return ctx.fixtureNew(fixtureValues(model, ctx, fixtureOf(unit, value, 'a case value')));
  }
  if (unit?.origin === 'callback' && isInstanceValue(value) && ctx.instanceNew !== undefined) {
    const made = memberById(model, String((value as Record<string, unknown>)['new']))?.returns;
    const of = typeof made === 'object' && 'unit' in made ? made.unit : unit.id;
    return ctx.instanceNew(instanceOf(model, of, value, `a case value of ${unit.id}`));
  }
  // GN-6z: a function value at any other place of a case is a fixture of the call, whose unexpected call raises.
  if (typeof type === 'object' && 'function' in type && ctx.functionNew !== undefined) return ctx.functionNew(functionRows(model, ctx, type.function, value, 'a case value', '__call__'));
  if (objectUnit(model, type) !== undefined && unit !== undefined && isInstanceValue(value) && ctx.instanceNew !== undefined) {
    return ctx.instanceNew(instanceOf(model, unit.id, value, `a case value of ${unit.id}`));
  }
  // U-1, GN-13: a value of a class of origin value is made by the member that its out row of the kind names.
  if (unit?.kind === 'class' && unit.origin === 'value' && !out) return valueClassFromJson(model, ctx, unit, value);
  // U-1, GN-13: a value of another class is the [key, value] pairs that fill it, as those of a kind map do.
  const filled = objectUnit(model, type);
  if (filled !== undefined && Array.isArray(value) && !out) return pairsInto(model, ctx, filled, value);
  throw new Unsupported(`no case value of the type ${shown(type)} is written yet (G-5)`);
}

// U-1, GN-13: a case value {"kind": <value kind>, "value": ...} of a class of origin value, as the call of the static
// member or constructor that the out row of the kind names for the language: a member without parameters for a kind
// without a value (null), and otherwise a member of one parameter, which takes the value of the case as a case value of
// its type (a list of the class for a list). A kind that no row makes by such a member is refused by name (G-4).
function valueClassFromJson(model: Model, ctx: Context, unit: Unit, value: unknown): string {
  const made = valueClassReceiver(model, ctx.target ?? ctx.lang, unit, value);
  if (ctx.objectNew === undefined) throw new Unsupported(`the kind of a case value of ${unit.id} is made by ${made.factory.member.id}, which this target does not call in a case yet (U-1, G-5)`);
  const [arg] = made.factory.args;
  if (arg === undefined) return ctx.objectNew(made.factory, '');
  const held = made.args.get(arg);
  const filled = objectUnit(model, arg.type);
  if ((value as Record<string, unknown>)['kind'] === 'map' && filled !== undefined && filled.unit !== unit) return ctx.objectNew(made.factory, callArgs(model, ctx, made.factory, () => pairsInto(model, ctx, filled, held)));
  return ctx.objectNew(made.factory, callArgs(model, ctx, made.factory, () => fromJson(model, ctx, arg.type, held)));
}

// U-1, GN-13: the call that makes a case value of a class of origin value in the language lang, as a receiver whose
// one argument, if any, is the value of the case; each target writes that argument as a case value of its type.
export function valueClassReceiver(model: Model, lang: string, unit: Unit, value: unknown): Receiver {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const kind = record?.['kind'];
  if (record === undefined || typeof kind !== 'string') throw new Unsupported(`a case value of ${unit.id} is {"kind": <value kind>, "value": ...}, not ${shown(value)} (G-5)`);
  const makes = [...new Set((unit.out ?? []).filter((row) => row.kind === kind).map((row) => (row.make as Record<string, unknown>)[lang]))];
  const make = makes[0];
  if (makes.length !== 1 || typeof make !== 'string') throw new Unsupported(`the kind ${kind} of ${unit.id} is made in ${lang} by ${makes.length === 0 ? 'no out row' : shown(makes)}, not by one member, so a case value of it is not written (U-1, G-5)`);
  const factory = model.objects.find((o) => o.unit === unit)?.members.find((m) => m.member.id === make && (m.kind === 'static' || m.kind === 'constructor'));
  if (factory === undefined) throw new Unsupported(`the kind ${kind} of ${unit.id} is made by ${make}, which is no static member or constructor of ${unit.id} (U-1, G-5)`);
  const given = 'value' in record;
  if (factory.args.length === 0) {
    if (given) throw new Unsupported(`a case value of the kind ${kind} of ${unit.id} has no value, because ${make} takes none (U-1, G-5)`);
    return { factory, args: new Map() };
  }
  const [arg, ...rest] = factory.args;
  if (arg === undefined || rest.length > 0 || arg.field) throw new Unsupported(`the kind ${kind} of ${unit.id} is made by ${make}, which takes more than one value, so a case value of it is not written (U-1, G-5)`);
  if (!given) throw new Unsupported(`a case value of the kind ${kind} of ${unit.id} holds the value that ${make} takes (U-1, G-5)`);
  return { factory, args: new Map([[arg, record['value']]]) };
}

// U-1, GN-13: the pairs of a case value of kind map, given to a make member that takes another class (Value.object of
// json takes an OrderedMap): the constructor of that class without parameters makes it, and its one member with the
// receiver &mut self and two parameters takes each pair, the key as a case value of its parameter (a key of text for a
// class of origin value) and the value as the case value of the pair.
function pairsInto(model: Model, ctx: Context, filled: ObjectClass, held: unknown): string {
  const made = pairsReceiver(model, filled, held);
  if (ctx.instanceNew === undefined) throw new Unsupported(`the pairs of a case value of kind map fill ${filled.unit.id}, which this target does not make in a case yet (G-5)`);
  return ctx.instanceNew(made);
}

// U-1, GN-13: the constructor and the inserts that fill a class with the pairs of a case, as a receiver with then.
export function pairsReceiver(model: Model, filled: ObjectClass, held: unknown): Receiver {
  const id = filled.unit.id;
  const constructor = filled.members.find((fn) => fn.kind === 'constructor' && fn.args.length === 0);
  if (constructor === undefined) throw new Unsupported(`the pairs of a case value of kind map fill ${id}, which has no constructor without parameters (U-1, G-5)`);
  const inserts = filled.members.filter((fn) => fn.receiver === '&mut self' && fn.args.length === 2 && fn.args.every((a) => !a.field));
  const insert = inserts[0];
  if (inserts.length !== 1 || insert === undefined) throw new Unsupported(`the pairs of a case value of kind map fill ${id}, which has ${inserts.length === 0 ? 'no member' : 'more than one member'} with the receiver &mut self and two parameters (U-1, G-5)`);
  if (!Array.isArray(held) || !held.every((pair) => Array.isArray(pair) && pair.length === 2)) throw new Unsupported(`a case value of kind map that fills ${id} is a list of [key, value] pairs, not ${shown(held)} (G-5)`);
  const [keyArg, valueArg] = insert.args as [Arg, Arg];
  const keyUnit = unitOf(model, keyArg.type);
  const keyOf = (key: unknown): unknown => (typeof key === 'string' && keyUnit?.kind === 'class' && keyUnit.origin === 'value' ? { kind: 'text', value: key } : key);
  const then = (held as [unknown, unknown][]).map(([key, value]) => ({ fn: insert, args: new Map<Arg, unknown>([[keyArg, keyOf(key)], [valueArg, value]]) }));
  return { factory: constructor, args: new Map(), then };
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
    if (make !== BUILT[kind]) throw new Unsupported(`the kind ${kind} of ${unit.id} leaves ${lang} by the form ${shown(make)}, with which a result is not compared yet`);
  }
  const held = record?.['value'];
  if (kind === 'list' && record?.['repeat'] !== undefined) madeAsBuilt(unit, lang, held);
  if (kind === 'list' && Array.isArray(held)) for (const item of held) madeAsBuilt(unit, lang, item);
  if (kind === 'map' && Array.isArray(held)) for (const pair of held) madeAsBuilt(unit, lang, (pair as unknown[])[1]);
}

// GN-13: a case whose value has no form in the language. It is an Unsupported, so the test of the case fails with
// the reason as caseRefusal names it (G-4).
export class CaseRefused extends Unsupported {}

// GN-13e: the expected result of a case in the language, or the reason why the generator cannot write it, which the
// test of the case fails with.
// GN-13e: `round` names the alias whose entry points of codec-test (in_raises) take the result back by its in function
// and give it again by its out function, so its test compares the texts of that value too.
export function expectedText(model: Model, ctx: Context, fn: Fn, value: unknown): { text: string } | { tokens: string; round?: Name } | { refused: string } {
  // GN-6af: a property of a value class without core_type gives the value that the language gave its constructor, so
  // the value is written as an argument is, not by the out rows of its alias.
  const kept = fn.kind === 'property' && model.kept.some((k) => k.members.includes(fn));
  try {
    // GN-13e: a result of a value alias is compared by the tokens of its places, which name the form of each place.
    const alias = kept ? undefined : aliasOf(model, fn.returns);
    if (alias !== undefined && alias.unit.out !== undefined) {
      const tokens = JSON.stringify(aliasTokens(model, ctx.lang, alias.unit, value));
      return alias.inRaises.length > 0 ? { tokens, round: alias.unit.name } : { tokens };
    }
    return { text: fromJson(model, ctx, fn.returns, value, !kept) };
  } catch (error) {
    return { refused: `${fn.member.id}: ${error instanceof Error ? error.message : String(error)} (GN-13e)` };
  }
}

// GN-13e: the result of a member that returns a value alias is compared as the texts of its places in pre-order,
// depth first, which a loop writes on both sides, so a value nested deeper than a recursion takes is compared too. The
// generator writes the texts of the case value by the out rows of the alias (the row whose kind and predicate the
// value has, and its form in the language), and the test writes those of the result by the type of each place
// (ALIAS_TOKENS of each language). A text names the form: null; bool, true or false; int, its decimal (Python, PHP);
// number, the hex of the IEEE 754 bits or nan (Node, WASM); bigint, its decimal; float, the hex of the bits or nan
// (Python, PHP); text and bytes, the hex of the UTF-8 or the bytes (Python, Node, WASM), string in PHP; list n, then
// its items; map n, then each key and its value; and an instance of a value class of the out rows, a PHP object and a
// PHP reference, numbered together by their first place: `<unit> #k`, then its field, `php_object #k n`, then its
// pairs, `php_reference #k`, then its value, and `<form> again k` at a later place.
export type TokenForm = { unit: string; cls: string; field: string };

// The value classes that the out rows of an alias name as `<unit>.constructor` in a language, with their field.
export function aliasKept(model: Model, lang: Lang3, alias: Unit): TokenForm[] {
  const forms: TokenForm[] = [];
  for (const row of alias.out ?? []) {
    const make = row.make[lang];
    if (typeof make !== 'string' || !make.endsWith('.constructor')) continue;
    const unit = make.slice(0, -'.constructor'.length);
    if (forms.some((f) => f.unit === unit)) continue;
    // The class of the form: its constructor takes one value, which a property of the same name gives back.
    const cls = model.contract.units.find((u) => u.id === unit);
    const params = cls?.members?.find((m) => m.kind === 'constructor')?.parameters ?? [];
    const [param] = params;
    const property = param === undefined ? undefined : cls?.members?.find((m) => m.kind === 'property' && m.name.join('_') === param.name.join('_'));
    if (cls === undefined || param === undefined || params.length !== 1 || property === undefined) throw new Unsupported(`the out form ${make} of ${alias.id} is no class whose constructor takes one value that a property of its name gives back, with which a result is not compared yet`);
    forms.push({ unit, cls: langName(lang, cls.name, 'class'), field: langName(lang, param.name, 'variable') });
  }
  return forms;
}

// The bits of a float of a case as the tokens write them.
function floatBits(number: number): string {
  if (Number.isNaN(number)) return 'nan';
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, number);
  return view.getBigUint64(0).toString(16).padStart(16, '0');
}

// The number of a float or an int of a case: {"float": "nan" | "inf" | "-inf"}, a number, or a decimal text.
function caseNumber(raw: unknown): number {
  if (typeof raw === 'object' && raw !== null) return { nan: NaN, inf: Infinity, '-inf': -Infinity }[String((raw as { float?: unknown }).float)] ?? NaN;
  return Number(raw);
}

// The bytes of a text or bytes of a case, and of a key that is a text or {"hex"}.
function caseBytes(raw: unknown): Buffer {
  if (typeof raw === 'string') return Buffer.from(raw, 'utf8');
  return Buffer.from(String((raw as { hex?: unknown }).hex), 'hex');
}

function isUtf8(bytes: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

const SAFE = 2n ** 53n - 1n;

// The tokens of a case value of an alias in a language (GN-13e).
export function aliasTokens(model: Model, lang: Lang3, alias: Unit, top: unknown): string[] {
  const rows = alias.out ?? [];
  const kept = aliasKept(model, lang, alias);
  const out: string[] = [];
  class Key {
    readonly key: unknown;
    constructor(key: unknown) {
      this.key = key;
    }
  }
  const stack: unknown[] = [top];
  const objects = new Map<number, number>();
  const references = new Map<number, number>();
  let count = 0;
  const intToken = (decimal: string): string => {
    if (lang !== 'node') return `int ${decimal}`;
    const wide = BigInt(decimal);
    return wide >= -SAFE && wide <= SAFE ? `number ${floatBits(Number(wide))}` : `bigint ${decimal}`;
  };
  const textToken = (bytes: Buffer, text: boolean): string => `${lang === 'php' ? 'string' : text ? 'text' : 'bytes'} ${bytes.toString('hex')}`;
  const keyToken = (key: unknown, keys: readonly string[]): string => {
    if (typeof key === 'object' && key !== null && 'int' in key) return intToken(String((key as { int: unknown }).int));
    const bytes = caseBytes(key);
    // PHP makes a key that is the decimal text of an integer that integer.
    if (lang === 'php' && /^(0|-?[1-9][0-9]*)$/.test(bytes.toString('latin1')) && BigInt(bytes.toString('latin1')) >= -(2n ** 63n) && BigInt(bytes.toString('latin1')) < 2n ** 63n) return `int ${bytes.toString('latin1')}`;
    return textToken(bytes, keys.includes('text') && isUtf8(bytes));
  };
  const keyed = (make: unknown): readonly string[] => (typeof make === 'object' && make !== null && 'keyed_map' in make ? (make as { keyed_map: { key: string[] } }).keyed_map.key : ['int', 'text', 'bytes']);
  const holds = (kind: string, node: Record<string, unknown>, predicate: string): boolean => {
    const held = node['value'];
    switch (predicate) {
      case 'utf8':
        return kind === 'text' || isUtf8(caseBytes(held));
      case 'safe_integer':
        return BigInt(String(held)) >= -SAFE && BigInt(String(held)) <= SAFE;
      case 'integral_float': {
        const number = caseNumber(held);
        return Number.isFinite(number) && Number.isInteger(number);
      }
      case 'sequence_keys':
        return kind === 'list' || (held as unknown[][]).every((pair, i) => typeof pair[0] === 'object' && pair[0] !== null && String((pair[0] as { int?: unknown }).int) === String(i));
      default:
        throw new Unsupported(`the predicate ${predicate} of ${alias.id} is not judged for a result yet`);
    }
  };
  // A case value of the kind list or text is the map or the bytes of an alias whose out rows have no row of the kind.
  const formOf = (kind: string, node: Record<string, unknown>): unknown => {
    const own = rows.filter((r) => r.kind === kind);
    const candidates = own.length > 0 ? own : rows.filter((r) => r.kind === ({ list: 'map', text: 'bytes' } as Record<string, string>)[kind]);
    const matched = candidates.find((r) => r.when !== undefined && r.when !== 'else' && holds(kind, node, r.when.predicate) === r.when.is)
      ?? candidates.find((r) => r.when === undefined || r.when === 'else');
    if (matched === undefined) throw new Unsupported(`no out row of ${alias.id} makes the kind ${kind} of a result`);
    return matched.make[lang];
  };
  const keptOfForm = (form: unknown): TokenForm | undefined => (typeof form === 'string' && form.endsWith('.constructor') ? kept.find((k) => `${k.unit}.constructor` === form) : undefined);
  while (stack.length > 0) {
    const item = stack.pop();
    if (item instanceof Key) {
      out.push(item.key as string);
      continue;
    }
    const node = item as Record<string, unknown>;
    const kind = String(node['kind']);
    const held = node['value'];
    switch (kind) {
      case 'null':
        out.push('null');
        continue;
      case 'bool':
        out.push(`bool ${String(held === true)}`);
        continue;
      default:
        break;
    }
    const form = formOf(kind, node);
    const cls = keptOfForm(form);
    switch (kind) {
      case 'int':
        out.push(form === 'bigint' ? `bigint ${String(held)}` : intToken(String(held)));
        break;
      case 'float': {
        const bits = floatBits(caseNumber(held));
        const token = `${lang === 'node' ? 'number' : 'float'} ${bits}`;
        if (cls === undefined) out.push(token);
        else out.push(`${cls.unit} #${String(count++)}`, token);
        break;
      }
      case 'text':
      case 'bytes': {
        const bytes = caseBytes(held);
        out.push(textToken(bytes, form === 'text'));
        break;
      }
      case 'list':
      case 'map':
      case 'object': {
        if (kind === 'object' && !('value' in node)) {
          out.push(`${cls?.unit ?? 'php_object'} again ${String(objects.get(Number(node['id'])))}`);
          break;
        }
        const repeat = node['repeat'] === undefined ? undefined : Number(node['repeat']);
        let pairs: [unknown, unknown][];
        if (kind === 'list') {
          pairs = repeat === undefined ? (held as unknown[]).map((value, i) => [{ int: i }, value]) : [[{ int: 0 }, repeat > 1 ? { ...node, repeat: repeat - 1 } : held]];
        } else if (repeat !== undefined) {
          pairs = [[node['key'], repeat > 1 ? { kind, repeat: repeat - 1, key: node['key'], value: held } : held]];
        } else {
          pairs = held as [unknown, unknown][];
        }
        const push = (keys: readonly string[]): void => {
          for (let i = pairs.length - 1; i >= 0; i -= 1) stack.push(pairs[i]?.[1], new Key(keyToken(pairs[i]?.[0], keys)));
        };
        if (form === 'list') {
          out.push(`list ${String(pairs.length)}`);
          for (let i = pairs.length - 1; i >= 0; i -= 1) stack.push(pairs[i]?.[1]);
        } else if (form === 'map' || (typeof form === 'object' && form !== null && 'keyed_map' in form)) {
          out.push(`map ${String(pairs.length)}`);
          push(form === 'map' ? ['text'] : keyed(form));
        } else if (form === 'php_object' || cls !== undefined) {
          const number = count++;
          if (kind === 'object' && node['id'] !== undefined) objects.set(Number(node['id']), number);
          if (cls === undefined) {
            out.push(`php_object #${String(number)} ${String(pairs.length)}`);
            push(['int', 'bytes']);
          } else {
            out.push(`${cls.unit} #${String(number)}`, `map ${String(pairs.length)}`);
            push(keyedField(model, cls.unit));
          }
        } else {
          throw new Unsupported(`the out form ${shown(form)} of ${alias.id} is not compared yet`);
        }
        break;
      }
      case 'reference': {
        const ref = held as Record<string, unknown>;
        const name = cls?.unit ?? 'php_reference';
        const id = Number(ref['id']);
        if (!('value' in ref)) {
          out.push(`${name} again ${String(references.get(id))}`);
          break;
        }
        references.set(id, count);
        out.push(`${name} #${String(count++)}`);
        stack.push(ref['value']);
        break;
      }
      default:
        throw new Unsupported(`a result of the kind ${kind} of ${alias.id} is not compared yet`);
    }
  }
  return out;
}

// The key forms of the keyed map that the one field of a value class keeps.
function keyedField(model: Model, unit: string): readonly string[] {
  const type = model.contract.units.find((u) => u.id === unit)?.members?.find((m) => m.kind === 'constructor')?.parameters?.[0]?.type;
  return typeof type === 'object' && 'keyed_map' in type ? type.key : ['int', 'text', 'bytes'];
}

// GN-13: a value of a value type, {"kind": <value kind>, "value": ...}, as the value that the built-in form of the kind
// makes in the language: null, bool, int (a number, or its decimal text outside the safe integers), float, text,
// bytes, list, map, object and reference. The other kinds are refused by name until a case needs them (G-4).
// G-5: a reference, and an object with an id, is named by its id after its first place. Each id is made once without
// content, then filled, in an expression that names it: a closure in PHP, whose references are variables that the
// places take by reference, an assignment expression of a tuple in Python and an arrow function in Node and WASM, so
// every place of an id holds the same instance and a later place inside the first makes a cycle.
function valueFromJson(model: Model, ctx: Context, value: unknown, where: string): string {
  const sort = typeof value === 'object' && value !== null && 'host' in value ? (value as { host: unknown }).host : undefined;
  if (typeof sort === 'string' && Object.hasOwn(HOST_VALUES, sort)) return HOST_VALUES[sort as keyof typeof HOST_VALUES][ctx.lang];
  const making: Making = { made: [], fills: [], references: new Set(), objects: new Set() };
  const value_ = valueOf(model, ctx, value, where, making, false);
  if (making.made.length === 0 && making.fills.length === 0) return value_;
  if (ctx.lang === 'python') return `(${[...making.made, ...making.fills, value_].join(', ')})[-1]`;
  if (ctx.lang === 'node') return `(() => { ${[...making.made, ...making.fills].join(' ')} return ${value_}; })()`;
  return `(static function () { ${[...making.made, ...making.fills].join(' ')} return ${value_}; })()`;
}

// G-5: the closed table of the values of a language that are no value of a value type, {"host": <sort>}: the value
// that each language makes for a sort. WASM takes the value of Node, and Go has its column in tests_go.ts
// (GO_HOST_VALUES). A Python test that makes a date imports datetime.
export const HOST_VALUES = {
  callable: { python: 'lambda: None', node: '() => null', php: 'static fn (): null => null' },
  date: { python: 'datetime.date(1970, 1, 1)', node: 'new Date(0)', php: "new \\DateTimeImmutable('@0')" },
  object: { python: 'object()', node: 'new (class Other {})()', php: 'new class {}' },
} as const satisfies Record<string, Record<Lang3, string>>;

// GN-13: what a case value makes before it is returned: the instances of its ids, in the order of their first places,
// the statements that fill them, in the order in which their first places end, and the ids that a place named.
interface Making {
  made: string[];
  fills: string[];
  references: Set<number>;
  objects: Set<number>;
}

// The id of a reference or of an object of a case value (G-5).
function idOf(raw: unknown, where: string): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) throw new Error(`an id of ${where} is a number of at least 0, not ${shown(raw)}`);
  return raw;
}

// GN-13: a value of valueFromJson, and slot says whether the value is the value of a place of an array or of a
// property, the one place where PHP holds a reference.
function valueOf(model: Model, ctx: Context, value: unknown, where: string, making: Making, slot: boolean): string {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const kind = record?.['kind'];
  if (record === undefined || typeof kind !== 'string') throw new Unsupported(`a case value of ${where} is {"kind": <value kind>, "value": ...}, not ${shown(value)}`);
  const held = record['value'];
  const lang = ctx.lang;
  const keyOf = (key: unknown): string => caseKey(key, (keyKind, raw) => (keyKind === 'int' ? intKey(lang, raw) : fromJson(model, ctx, keyKind, raw)));
  const fieldOf = (cls: KeptClass): string => langName(lang === 'python' ? 'python' : 'node', cls.fields[0]?.name ?? [], 'variable');
  if (kind === 'null') return lang === 'python' ? 'None' : 'null';
  if (kind === 'bool') return fromJson(model, ctx, 'bool', held);
  if (kind === 'text') return fromJson(model, ctx, 'text', held);
  if (kind === 'bytes') return fromJson(model, ctx, 'bytes', held);
  if (kind === 'float') {
    const float = fromJson(model, ctx, 'float', held);
    return lang === 'python' ? `float(${float})` : lang === 'php' ? `(float) ${float}` : float;
  }
  if (kind === 'int') {
    const token = typeof held === 'number' && Number.isSafeInteger(held) ? String(held) : typeof held === 'bigint' ? String(held) : typeof held === 'string' && /^-?(0|[1-9][0-9]*)$/.test(held) ? held : undefined;
    if (token === undefined) throw new Unsupported(`a case value of the kind int of ${where} is a safe integer or a decimal text, not ${shown(held)}`);
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
    if (typeof repeat !== 'number' || !Number.isSafeInteger(repeat) || repeat < 1 || Object.keys(record).length !== 3) throw new Unsupported(`a case value of ${where} is {"kind": "list", "repeat": <n of at least 1>, "value": <value>}, not ${shown(value)}`);
    const inner = valueOf(model, ctx, held, where, making, false);
    if (lang === 'python') return `__import__("functools").reduce(lambda inner, _: [inner], range(${repeat}), ${inner})`;
    if (lang === 'node') return `Array.from({ length: ${repeat} }).reduce((inner) => [inner], ${inner})`;
    return `array_reduce(array_fill(0, ${repeat}, null), fn ($inner) => [$inner], ${inner})`;
  }
  if (kind === 'list' && Array.isArray(held)) return `[${held.map((item) => valueOf(model, ctx, item, where, making, true)).join(', ')}]`;
  if (kind === 'map' && Array.isArray(held)) {
    const entries = (held as [unknown, unknown][]).map(([key, item]) => {
      const k = keyOf(key);
      const v = valueOf(model, ctx, item, where, making, true);
      return lang === 'python' ? `${k}: ${v}` : lang === 'php' ? `${k} => ${v}` : `[${k}, ${v}]`;
    });
    return { python: `{${entries.join(', ')}}`, node: `new Map([${entries.join(', ')}])`, php: `[${entries.join(', ')}]` }[lang];
  }
  // GN-6af: an object is an instance of the value class that keeps a keyed map, and a reference one of the class that
  // keeps one value; PHP takes its own stdClass and its own references, the places that take a variable by reference.
  if (kind === 'object') {
    const cls = lang === 'php' ? undefined : keptOf(model, 'entries', where);
    const empty = cls === undefined ? 'new \\stdClass()' : lang === 'python' ? `pkg.${langName('python', cls.unit.name, 'class')}({})` : `new pkg.${langName('node', cls.unit.name, 'class')}(new Map())`;
    const field = cls === undefined ? '' : fieldOf(cls);
    // G-5: n objects, each the one property key of the one around it; Python, Node and WASM make them from the
    // outermost in and fill each after it is made, so no constructor judges the objects inside it again.
    if (record['repeat'] !== undefined) {
      const repeat = record['repeat'];
      if (typeof repeat !== 'number' || !Number.isSafeInteger(repeat) || repeat < 1 || Object.keys(record).length !== 4 || !('key' in record)) throw new Error(`a case value of ${where} is {"kind": "object", "repeat": <n of at least 1>, "key": <key>, "value": <value>}, not ${shown(value)}`);
      const k = keyOf(record['key']);
      const inner = valueOf(model, ctx, held, where, making, true);
      if (lang === 'python') return `(lambda top: (lambda at: ([at.__setitem__(0, at[0].${field}.setdefault(${k}, ${empty})) for _ in range(${repeat - 1})], at[0].${field}.__setitem__(${k}, ${inner}), top)[-1])([top]))(${empty})`;
      if (lang === 'node') return `(() => { const top = ${empty}; let at = top; for (let i = 1; i < ${repeat}; i += 1) { const next = ${empty}; at.${field}.set(${k}, next); at = next; } at.${field}.set(${k}, ${inner}); return top; })()`;
      return `array_reduce(array_fill(0, ${repeat}, null), fn ($inner) => (object) [${k} => $inner], ${inner})`;
    }
    const name = (id: number): string => (lang === 'php' ? `$o${id}` : `o${id}`);
    if (record['id'] !== undefined) {
      const id = idOf(record['id'], where);
      if (!('value' in record)) {
        if (!making.objects.has(id)) throw new Error(`a case value of ${where} names the object ${id} before its first place (G-5)`);
        return name(id);
      }
      if (making.objects.has(id)) throw new Error(`a case value of ${where} gives the value of the object ${id} at two places (G-5)`);
      making.objects.add(id);
      making.made.push(lang === 'python' ? `o${id} := ${empty}` : lang === 'node' ? `const o${id} = ${empty};` : `$o${id} = ${empty};`);
      if (!Array.isArray(held)) throw new Error(`a case value of ${where} is an object of [key, value] pairs, not ${shown(held)}`);
      for (const [key, item] of held as [unknown, unknown][]) {
        const k = keyOf(key);
        const v = valueOf(model, ctx, item, where, making, true);
        making.fills.push(lang === 'python' ? `o${id}.${field}.__setitem__(${k}, ${v})` : lang === 'node' ? `o${id}.${field}.set(${k}, ${v});` : `$o${id}->{${k}} = ${v};`);
      }
      return name(id);
    }
    if (!Array.isArray(held)) throw new Error(`a case value of ${where} is an object of [key, value] pairs, not ${shown(held)}`);
    const entries = (held as [unknown, unknown][]).map(([key, item]) => {
      const k = keyOf(key);
      const v = valueOf(model, ctx, item, where, making, true);
      return lang === 'python' ? `${k}: ${v}` : lang === 'php' ? `${k} => ${v}` : `[${k}, ${v}]`;
    });
    if (cls === undefined) return `(object) [${entries.join(', ')}]`;
    return lang === 'python' ? `pkg.${langName('python', cls.unit.name, 'class')}({${entries.join(', ')}})` : `new pkg.${langName('node', cls.unit.name, 'class')}(new Map([${entries.join(', ')}]))`;
  }
  if (kind === 'reference' && typeof held === 'object' && held !== null && !Array.isArray(held)) {
    const ref = held as Record<string, unknown>;
    const id = idOf(ref['id'], where);
    if (lang === 'php' && !slot) throw new CaseRefused(`a case value of ${where} holds a reference that is no place of an array or of a property, which PHP has no form of: a PHP reference is such a place (GN-13)`);
    const name = lang === 'php' ? `&$r${id}` : `r${id}`;
    if (!('value' in ref)) {
      if (!making.references.has(id)) throw new Error(`a case value of ${where} names the reference ${id} before its first place (G-5)`);
      return name;
    }
    if (making.references.has(id)) throw new Error(`a case value of ${where} gives the value of the reference ${id} at two places (G-5)`);
    making.references.add(id);
    if (lang === 'php') {
      making.fills.push(`$r${id} = ${valueOf(model, ctx, ref['value'], where, making, false)};`);
      return name;
    }
    const cls = keptOf(model, 'value', where);
    const field = fieldOf(cls);
    making.made.push(lang === 'python' ? `r${id} := pkg.${langName('python', cls.unit.name, 'class')}()` : `const r${id} = new pkg.${langName('node', cls.unit.name, 'class')}();`);
    const inner = valueOf(model, ctx, ref['value'], where, making, false);
    making.fills.push(lang === 'python' ? `setattr(r${id}, ${pyString(field)}, ${inner})` : `r${id}.${field} = ${inner};`);
    return name;
  }
  throw new Unsupported(`a case value of the kind ${kind} of ${where} is not generated yet (GN-13)`);
}

// G-5: an integer key of a case value: a safe integer as a number, a decimal text outside them as a bigint of
// JavaScript and as the integer of Python and PHP.
function intKey(lang: Lang3, raw: unknown): string {
  if (typeof raw === 'number') return String(raw);
  return lang === 'node' ? `${String(raw)}n` : String(raw);
}

// GN-6af: the value class without core_type that keeps the content of a case value: a keyed map (an object) or one value
// (a reference).
function keptOf(model: Model, holds: 'entries' | 'value', where: string): KeptClass {
  const found = model.kept.filter((k) => {
    const [field, ...more] = k.fields;
    if (field === undefined || more.length > 0) return false;
    return holds === 'entries' ? typeof field.type === 'object' && 'keyed_map' in field.type : typeof field.type === 'object' && 'unit' in field.type;
  });
  const [only] = found;
  if (only === undefined || found.length > 1) throw new Unsupported(`a case value of ${where}: ${found.length} value classes keep ${holds === 'entries' ? 'a keyed map' : 'one value'} (GN-6af)`);
  return only;
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
    // U-2 {empty: "object"}: a record without a field that is given is left out, when it may be.
    if (object === '' && fn.record.param.default !== undefined) return positional.join(', ');
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
// GN-6y: whether a parameter or a field is a path, also an optional one.
export const isPath = (type: Type): boolean => (typeof type === 'object' && 'optional' in type ? type.optional : type) === 'path';

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
// GN-13: the members that the tests call, those of a value class without core_type (GN-6af) among them.
export const callables = (model: Model): Fn[] => [...model.functions, ...model.objects.flatMap((o) => o.members.filter((fn) => fn.kind !== 'iterate')), ...model.kept.flatMap((k) => k.members)];

// The members of the class of a member: a class unit or a value class without core_type.
const classMembers = (model: Model, unit: Unit): Fn[] => model.objects.find((o) => o.unit === unit)?.members ?? model.kept.find((k) => k.unit === unit)?.members ?? [];

export interface Receiver {
  factory: Fn;
  args: Map<Arg, unknown>;
  // G-5 (GN-13f): the instance value of a case. The instance that the factory is called on when it is a method, the
  // steps into its result when the result holds the instance (from), and the calls on the instance that prepare it.
  on?: Receiver;
  pick?: Pick[];
  // A call of then may fail with a kind, which the test requires before the next step; it may arm faults for itself
  // alone, as the JSON text that the arming entry point takes, and with on: receiver it calls the receiver of the value.
  then?: { fn: Fn; args: Map<Arg, unknown>; raises?: string; faults?: string; on?: 'receiver' }[];
}

// GN-13f: whether a receiver, or a receiver that it is made on, has a call of then that arms faults.
export const armsFaults = (receiver: Receiver | undefined): boolean =>
  receiver !== undefined && ((receiver.then ?? []).some((step) => step.faults !== undefined) || armsFaults(receiver.on));

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
      if (field === undefined) return `${what} names the field ${step}, which ${shown(at)} has not`;
      at = field.type;
      continue;
    }
    const record = typeof step === 'object' && step !== null && !Array.isArray(step) ? (step as Record<string, unknown>) : {};
    const n = record['index'] ?? record['tuple'];
    if (Object.keys(record).length !== 1 || typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return `${what} is not a field name, {"index": n} or {"tuple": n}`;
    if ('index' in record) {
      if (typeof at !== 'object' || !('list' in at)) return `${what} takes an item of ${shown(at)}, which is no list`;
      at = at.list;
    } else {
      if (typeof at !== 'object' || !('tuple' in at) || n >= at.tuple.length) return `${what} takes part ${n} of ${shown(at)}, which is no tuple of that length`;
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
    throw new Unsupported(`${where}: ${message} (G-5, GN-13f)`);
  };
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail('an instance value is {"new" | "from": <member id>, ...}');
  const id = record['new'] ?? record['from'];
  const factory = typeof id === 'string' ? memberById(model, id) : undefined;
  if (factory === undefined) return fail(`${String(id)} is no member that the binding generates`);
  const pick = Array.isArray(record['pick']) ? record['pick'] : [];
  const reached = pickedType(model, factory.returns, 'from' in record ? pick : []);
  if (typeof reached === 'string') return fail(reached);
  if (typeof reached !== 'object' || !('unit' in reached) || reached.unit !== unitId || reached.library !== undefined) fail(`${factory.member.id} gives ${shown(reached)}, not the class ${unitId}`);
  const args = argsOf(factory, (record['args'] ?? {}) as Record<string, unknown>) ?? fail(`the args are not the parameters of ${factory.member.id}`);
  const on = factory.receiver === undefined ? undefined : instanceOf(model, factory.unit.id, record['receiver'] ?? fail(`${factory.member.id} is a method, so the value gives its receiver`), `${where}, the receiver of ${factory.member.id}`);
  const then = (Array.isArray(record['then']) ? record['then'] : []).map((item, i) => {
    const step = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const fn = typeof step['call'] === 'string' ? memberById(model, step['call']) : undefined;
    // on: receiver calls a method of the class of the receiver of the value, on that receiver.
    const onReceiver = step['on'] === 'receiver';
    if (step['on'] !== undefined && !onReceiver) return fail(`then ${i} calls on ${String(step['on'])}, but on names only receiver`);
    if (onReceiver && on === undefined) return fail(`then ${i} calls ${String(step['call'])} on its receiver, but ${factory.member.id} gives the value without one`);
    const callee = onReceiver ? factory.unit.id : unitId;
    if (fn === undefined || fn.unit.id !== callee || fn.receiver === undefined) return fail(`then ${i} calls ${String(step['call'])}, which is no method of ${callee}`);
    const faults = step['faults'];
    if (faults !== undefined && model.faults.length === 0) return fail(`then ${i} arms faults, but the contract names no fault injection point (G-5)`);
    const own = `${model.contract.library.replaceAll('-', '_')}.`;
    const other = (Array.isArray(faults) ? faults : []).map((fault) => String((fault as Record<string, unknown> | null)?.['point'])).find((point) => !point.startsWith(own));
    if (other !== undefined) return fail(`then ${i}: the point ${other} of another library is not armed yet (G-5)`);
    const args = argsOf(fn, (step['args'] ?? {}) as Record<string, unknown>) ?? fail(`the args of then ${i} are not the parameters of ${fn.member.id}`);
    const kind = (step['raises'] as Record<string, unknown> | undefined)?.['kind'];
    if (step['raises'] !== undefined && typeof kind !== 'string') return fail(`then ${i} expects ${fn.member.id} to fail by {"kind": <kind>}`);
    return { fn, args, ...(typeof kind === 'string' ? { raises: kind } : {}), ...(faults === undefined ? {} : { faults: shown(faults) }), ...(onReceiver ? { on: 'receiver' as const } : {}) };
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
  // The statement that requires an expression to fail with a kind; `what` names the step in the message.
  fails: (expr: string, kind: string, what: string) => string;
  // The expression that steps into a value: a field (snake_case name), an item or a part of a tuple.
  pick: (expr: string, step: Pick) => string;
  // G-5: the statement that arms the faults (JSON text) for the next call of the member and binds the arming to a local,
  // and the statement that requires every fault of that arming to have fired; `what` names the step in the message.
  arm: (local: string, member: string, faults: string) => string;
  left: (local: string, what: string) => string;
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
    const onName = on;
    for (const step of r.pick ?? []) {
      const local = fresh();
      lines.push(form.bind(local, expr));
      expr = form.pick(form.name(local), step);
    }
    const local = fresh();
    lines.push(form.bind(local, expr));
    for (const [i, step] of (r.then ?? []).entries()) {
      const call = form.invoke(step.fn, argsText(step.fn, step.args), step.on === 'receiver' ? onName : form.name(local));
      // G-5: the faults of the call are armed for its member just before it, and every one must have fired after it.
      const armed = step.faults === undefined ? undefined : fresh();
      if (armed !== undefined && step.faults !== undefined) lines.push(form.arm(armed, step.fn.member.id, step.faults));
      lines.push(step.raises === undefined ? form.run(call) : form.fails(call, step.raises, `then ${i} fails with ${step.raises}`));
      if (armed !== undefined) lines.push(form.left(armed, `the faults of then ${i} fire`));
    }
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
    // U-2 {empty: "object"}: a case without the key of a record that may be left out leaves out each of its fields.
    const holder = holderKey === undefined ? record : !(holderKey in record) && fn.record?.param.default !== undefined ? {} : record[holderKey];
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
  for (const factory of classMembers(model, fn.unit)) {
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
  for (const member of classMembers(model, fn.unit)) {
    for (const kase of model.cases.get(member.member.id) ?? []) {
      const record = kase as Record<string, unknown>;
      if (record['raises'] !== undefined) continue;
      const found = receiverOf(model, fn, record);
      // GN-13f: a test that needs any receiver takes none that arms faults, which would fire in its calls.
      if (found !== undefined && !armsFaults(found)) return found;
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
      throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} gives ${receiver === undefined ? `no arguments of a factory of ${fn.unit.id}` : 'no text as its result'} (G-5, N-4)`);
    }
    out.push({ id: String(record['id']), receiver, result });
  }
  return out;
}

// G-4, GN-13e: the reason why the generator cannot write the receiver or an argument of a case in the
// language, which the test of the case fails with, so that one value that is not written yet fails its own test by
// name and the other tests of the target run; undefined when every value of the case is written.
export function caseRefusal(model: Model, ctx: Context, fn: Fn, kase: { id: string; args: Map<Arg, unknown>; receiver?: Receiver }, receiver: (made: Receiver | undefined) => unknown): string | undefined {
  // A row of a callback fixture that is not generated yet refuses the target (G-4), as the emitters read the fixtures.
  const fixed = new Set(fixturesOf(model, fn, kase.id, kase.args).map((fixture) => fixture.arg));
  // The probe writes no steps of a deep value (GN-13e), which the test of the case writes when it makes the value.
  const steps = ctx.steps;
  ctx.steps = undefined;
  try {
    receiver(kase.receiver);
    for (const arg of fn.args) if (!fixed.has(arg)) caseValue(model, ctx, arg, kase.args);
    return undefined;
  } catch (error) {
    if (!(error instanceof Unsupported)) throw error;
    return `the case ${kase.id} of ${fn.member.id}: ${error.message}`;
  } finally {
    ctx.steps = steps;
  }
}

// GN-13d: a parameter with a default for which an explicit null is a refused value: every default but {literal: null},
// whose declared value is that null.
export const refusesNull = (arg: Arg): boolean =>
  arg.default !== undefined && !(typeof arg.default === 'object' && arg.default !== null && 'literal' in arg.default && arg.default.literal === null);

// N-4: the cases of a primitive that do not raise, each with the instance of its factory arguments and the number that
// the language's number form gives, written as the language writes it; a case without result takes the form alone.
export function primitiveCases(model: Model, ctx: Context, fn: Fn): { id: string; receiver: Receiver; result: string | undefined }[] {
  if (fn.special !== 'primitive') return [];
  const out: { id: string; receiver: Receiver; result: string | undefined }[] = [];
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    if (record['raises'] !== undefined) continue;
    const receiver = receiverOf(model, fn, record);
    if (receiver === undefined) throw new Error(`the case ${String(record['id'])} of ${fn.member.id} gives no arguments of a factory of ${fn.unit.id} (G-5, N-4)`);
    out.push({ id: String(record['id']), receiver, result: 'result' in record ? fromJson(model, ctx, fn.returns, record['result'], true) : undefined });
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
      throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} has no ${missing.join(', ') || 'record field'} (G-5: case keys are the parameter names in snake_case)`);
    }
    const receiver = receiverOf(model, fn, record);
    if (fn.receiver !== undefined && receiver === undefined) {
      throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} gives no arguments of a factory of ${fn.unit.id} (G-5, T-5)`);
    }
    const faults = record['faults'];
    if (faults !== undefined && model.faults.length === 0) throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} arms faults, but the contract names no fault injection point (G-5)`);
    const own = `${model.contract.library.replaceAll('-', '_')}.`;
    const other = (Array.isArray(faults) ? faults : []).map((fault) => String((fault as Record<string, unknown> | null)?.['point'])).find((point) => !point.startsWith(own));
    if (other !== undefined) throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id}: the point ${other} of another library is not armed yet (G-5)`);
    out.push({ id: String(record['id']), args, raises, ...(faults === undefined ? {} : { faults: shown(faults) }), ...(receiver === undefined ? {} : { receiver }) });
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
  return `a result of ${shown(type)} is not compared yet`;
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
    // GN-13e: the result null of an optional has a case form whatever the optional holds.
    const absent = record[key] === null && typeof fn.returns === 'object' && 'optional' in fn.returns;
    const reason = absent ? undefined : comparableResult(model, fn.returns);
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

// GN-12a: a keyed_map parameter whose contract lists int keys, given the key 2^53, which is no safe integer.
export function unsafeKeyMap(model: Model, ctx: Context, type: Type): string | undefined {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  if (typeof base !== 'object' || !('keyed_map' in base) || !base.key.includes('int')) return undefined;
  const value = placeholder(model, ctx, base.keyed_map);
  return { python: `{2**53: ${value}}`, node: `new Map([[2 ** 53, ${value}]])`, php: `[2 ** 53 => ${value}]` }[ctx.lang];
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
    const value = args.get(arg) as { callback?: unknown } | null | undefined;
    if (typeof value !== 'object' || value === null || typeof value.callback !== 'object' || value.callback === null) {
      throw new Unsupported(`${where} gives no {"callback": ...} for ${langName('python', arg.name, 'variable')} (G-5)`);
    }
    out.push({ arg, ...fixtureOf(unit, value, where) });
  }
  return out;
}

// G-5: the rows and the calls of a callback value {"callback": {...}, "calls": [...]} of the unit.
export function fixtureOf(unit: Unit, given: unknown, where: string): Omit<Fixture, 'arg'> {
  const value = given as { callback: Record<string, unknown[]>; calls?: { member: string; args?: Record<string, unknown> }[] };
  const members = unit.members ?? [];
  const position = (memberId: string): number => {
    const found = members.findIndex((m) => m.id === memberId);
    if (found < 0) throw new Unsupported(`${where} names ${memberId}, which is no member of ${unit.id} (G-5)`);
    return found;
  };
  const ordered = (member: number, args: Record<string, unknown> | undefined): unknown[] =>
    (members[member]?.parameters ?? []).map((p) => {
      const key = langName('python', p.name, 'variable');
      if (args === undefined || !(key in args)) throw new Unsupported(`${where} gives no ${key} in the args of ${members[member]?.id ?? ''} (G-5)`);
      return args[key];
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
  return { unit, rows, ...(calls === undefined ? {} : { calls }) };
}

// The rows and the expected calls of a fixture as the values of a language: the member name, the arguments, and for a
// row the result and whether it is used once.
export function fixtureValues(model: Model, ctx: Context, fixture: Omit<Fixture, 'arg'>): { members: string[]; rows: string[][]; calls: string[][] | undefined } {
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

// GN-6z: the function value of a case, {"function": [<row>]}: a row is {"args": {"0": ..., "1": ...}} by position,
// with "result" (absent for a return of none) and "once". The contract check has judged the form (CK-22). The rows are
// given as those of a fixture of one member, the call itself, whose name `call` each language gives.
export function functionRows(model: Model, ctx: Context, type: { parameters: Type[]; returns: Type }, value: unknown, what: string, call: string): string[][] {
  const none = ctx.lang === 'python' ? 'None' : 'null';
  const flag = (on: boolean): string => (ctx.lang === 'python' ? (on ? 'True' : 'False') : String(on));
  const list = (items: string[]): string => (ctx.lang === 'python' ? `(${items.map((i) => `${i},`).join(' ')})` : `[${items.join(', ')}]`);
  const text = (name: string): string => (ctx.lang === 'python' ? pyString(name) : ctx.lang === 'php' ? phpText(name) : jsString(name));
  const rows = (value as { function?: unknown } | null)?.function;
  if (!Array.isArray(rows)) throw new Error(`${what} gives no {"function": [...]} (G-5)`);
  return (rows as Record<string, unknown>[]).map((row) => {
    const given = (row['args'] ?? {}) as Record<string, unknown>;
    const values = type.parameters.map((p, i) => {
      if (!(String(i) in given)) throw new Error(`${what} gives no argument ${String(i)} in a row (G-5)`);
      return fromJson(model, ctx, p, given[String(i)]);
    });
    const result = row['result'] === undefined || row['result'] === null || type.returns === 'none' ? none : fromJson(model, ctx, type.returns, row['result']);
    return [text(call), list(values), result, flag(row['once'] === true)];
  });
}

// GN-6z: the function value of a case for each parameter of a function type, as a fixture whose record the test reads.
export function functionFixturesOf(model: Model, ctx: Context, fn: Fn, id: string, args: Map<Arg, unknown>, call: string): { arg: Arg; members: string[]; rows: string[][] }[] {
  const text = (name: string): string => (ctx.lang === 'python' ? pyString(name) : ctx.lang === 'php' ? phpText(name) : jsString(name));
  return fn.args.flatMap((arg) => {
    const type = arg.type;
    if (typeof type !== 'object' || !('function' in type)) return [];
    const what = `the case ${id} of ${fn.member.id} for ${langName('python', arg.name, 'variable')}`;
    return [{ arg, members: [text(call)], rows: functionRows(model, ctx, type.function, args.get(arg), what, call) }];
  });
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
  // G-5: an integer key outside the safe integers is its decimal text, which the reader of the case files may give as a
// bigint.
  if (typeof key === 'object' && key !== null && 'int' in key && typeof (key as { int: unknown }).int === 'bigint') return make('int', String((key as { int: bigint }).int));
  if (typeof key === 'object' && key !== null && 'int' in key && typeof (key as { int: unknown }).int === 'string' && /^-?(0|[1-9][0-9]*)$/.test((key as { int: string }).int)) return make('int', (key as { int: string }).int);
  if (typeof key === 'object' && key !== null && 'hex' in key) return make('bytes', key);
  throw new Unsupported(`a key of a keyed map in a case is a text, {"int": n} or {"hex": ...}, not ${shown(key)}`);
}

// G-5: the errno that a raising case expects: none, a number, or the symbol of an errno, whose value each language
// gives on the target.
export function expectedErrno(kase: RaisingCase): { symbol: string } | { value: number } | null {
  const errno = kase.raises.errno;
  if (errno === undefined || errno === null) return null;
  if (typeof errno === 'string') return { symbol: errno };
  if (typeof errno === 'number') return { value: errno };
  throw new Unsupported(`the errno of the case ${kase.id} is neither a symbol nor a number (G-5)`);
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

// GN-13e: the words of the id of a case, split at every run of characters other than ASCII letters and digits, which
// the name of its test holds in a language whose tests are functions or methods.
export const caseWords = (id: string): string[] => id.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
// GN-13e: the words of an id capitalized and joined (PHP, Go), or joined by _ (Python).
export const casePascal = (id: string): string => caseWords(id).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
export const caseSnake = (id: string): string => caseWords(id).join('_');

// GN-13e: two ids of the cases of one member, or of one value alias, that give one test name refuse the target, PHP
// comparing the names without case as it does for its methods; an id without a word gives no name.
export function checkCaseNames(model: Model, name: (id: string) => string, caseless: boolean): void {
  const groups: [string, unknown[]][] = [...model.cases.entries(), ...[...model.aliasCases.entries()].map(([id, cases]): [string, unknown[]] => [`the alias ${id}`, cases])];
  for (const [owner, cases] of groups) {
    const seen = new Map<string, string>();
    for (const kase of cases) {
      const id = String((kase as Record<string, unknown>)['id']);
      const made = name(id);
      if (caseWords(id).length === 0) throw new Unsupported(`the case ${id} of ${owner} has no letter or digit for the name of its test (GN-13e)`);
      const key = caseless ? made.toLowerCase() : made;
      const other = seen.get(key);
      if (other !== undefined && other !== id) throw new Unsupported(`the cases ${other} and ${id} of ${owner} give one test name ${made} (GN-13e)`);
      seen.set(key, id);
    }
  }
}

export function aliasCases(model: Model): AliasCase[] {
  const out: AliasCase[] = [];
  for (const alias of model.aliases) {
    for (const kase of model.aliasCases.get(alias.unit.id) ?? []) {
      const record = kase as Record<string, unknown>;
      const where = `the case ${String(record['id'])} of the alias ${alias.unit.id}`;
      const kind = (record['raises'] as Record<string, unknown> | undefined)?.['kind'];
      const row = model.contract.errors.kinds.find((k) => typeof kind === 'string' && k.library === undefined && kindsOf(k).includes(kind));
      if (typeof kind !== 'string' || row?.category === undefined) throw new Unsupported(`${where} raises no kind of errors.kinds (U-7)`);
      const value = record['value'];
      // G-5: a value of the language that is no value of the alias is {"host": <sort>} of the closed table HOST_VALUES.
      const sort = typeof value === 'object' && value !== null && 'host' in value ? (value as { host: unknown }).host : undefined;
      if (sort !== undefined && (typeof sort !== 'string' || !Object.hasOwn(HOST_VALUES, sort) || Object.keys(value as object).length !== 1)) {
        throw new Error(`${where}: a value {"host"} is ${Object.keys(HOST_VALUES).map((k) => JSON.stringify(k)).join(', ').replace(/, ([^,]*)$/, ' or $1')}, not ${shown(sort)} (G-5)`);
      }
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

// GN-13: why a case value has no PHP form, or undefined when it has one. A PHP reference is a place of an array or of a
// property, so a reference that is the value itself or the value of a reference has none.
export function phpFormless(value: unknown, slot = false): string | undefined {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const held = record?.['value'];
  switch (record?.['kind']) {
    case 'list':
      if (record?.['repeat'] !== undefined) return phpFormless(held, false);
      return Array.isArray(held) ? held.map((item) => phpFormless(item, true)).find((reason) => reason !== undefined) : undefined;
    case 'map':
    case 'object':
      if (record?.['repeat'] !== undefined) return phpFormless(held, true);
      return Array.isArray(held) ? (held as unknown[][]).map((pair) => phpFormless(pair[1], true)).find((reason) => reason !== undefined) : undefined;
    case 'reference':
      if (!slot) return 'a reference that is no place of an array or of a property, which PHP has no form of: a PHP reference is such a place';
      return phpFormless((held as Record<string, unknown> | undefined)?.['value'], false);
    case 'int':
      return typeof held === 'string' && /^-?[0-9]+$/.test(held) && (BigInt(held) < -(2n ** 63n) || BigInt(held) >= 2n ** 63n) ? 'an integer outside 64 bits, which PHP has no form of: a PHP int is 64 bits' : undefined;
    default:
      return undefined;
  }
}

// GN-13: a case whose value of a value alias has no form in PHP. Its test calls the entry point of the feature
// case-test, which makes the value as the host values that PHP would describe and gives them to the in function of the
// alias, so the rule of the core that refuses the value runs in the binding. raises is what the case expects.
export interface CaseTest {
  // The member of the case, or none for a case of the alias itself (U-7).
  fn?: Fn;
  id: string;
  alias: ValueAlias;
  value: unknown;
  reason: string;
  raises?: RaisingCase['raises'];
}

export function phpCaseTests(model: Model): CaseTest[] {
  const out: CaseTest[] = [];
  for (const fn of callables(model)) {
    // The cases are read as the case files give them, without the checks of raisingCases and resultCases, so that
    // binding scaffold, which reads no contract of another library, finds them too.
    for (const record of (model.cases.get(fn.member.id) ?? []) as Record<string, unknown>[]) {
      const args = fn.special === undefined ? argsOf(fn, record) : undefined;
      const raises = record['raises'] as RaisingCase['raises'] | undefined;
      if (args === undefined || (raises === undefined && record['faults'] !== undefined)) continue;
      const kase = { id: String(record['id']), args, ...(raises === undefined ? {} : { raises }) };
      for (const [arg, value] of kase.args) {
        const alias = aliasOf(model, arg.type);
        const reason = alias === undefined ? undefined : phpFormless(value);
        if (alias === undefined || reason === undefined) continue;
        out.push({ fn, id: kase.id, alias, value, reason, ...(kase.raises === undefined ? {} : { raises: kase.raises }) });
      }
    }
  }
  for (const kase of aliasCases(model)) {
    const reason = phpFormless(kase.value);
    if (reason !== undefined) out.push({ id: kase.id, alias: kase.alias, value: kase.value, reason });
  }
  return out;
}

// GN-13e: the value classes of the out rows of the aliases of the contract, which a result of an alias holds.
export function tokenForms(model: Model, lang: Lang3): TokenForm[] {
  const forms: TokenForm[] = [];
  for (const alias of model.aliases.filter((a) => a.library === undefined && a.unit.out !== undefined)) {
    for (const form of aliasKept(model, lang, alias.unit)) if (!forms.some((f) => f.unit === form.unit)) forms.push(form);
  }
  return forms;
}

// GN-13e: the tokens of a result in Node and WASM, as aliasTokens writes those of a case value.
export function nodeTokens(forms: TokenForm[]): string {
  return `
// GN-13e: the texts of the places of a value in pre-order, depth first, which a loop writes: the form of each place,
// a container with its count, and an instance numbered by its first place.
const KEPT = [${forms.map((f) => `[pkg.${f.cls}, ${jsString(f.unit)}, ${jsString(f.field)}]`).join(', ')}];
function tokens(top) {
  const out = [];
  const stack = [top];
  const numbers = new Map();
  const bits = (number) => {
    if (Number.isNaN(number)) return 'nan';
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, number);
    return view.getBigUint64(0).toString(16).padStart(16, '0');
  };
  const hex = (bytes) => Buffer.from(bytes).toString('hex');
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null) out.push('null');
    else if (typeof value === 'boolean') out.push(\`bool \${String(value)}\`);
    else if (typeof value === 'number') out.push(\`number \${bits(value)}\`);
    else if (typeof value === 'bigint') out.push(\`bigint \${String(value)}\`);
    else if (typeof value === 'string') out.push(\`text \${hex(new TextEncoder().encode(value))}\`);
    else if (value instanceof Uint8Array) out.push(\`bytes \${hex(value)}\`);
    else if (Array.isArray(value)) {
      out.push(\`list \${value.length}\`);
      for (let i = value.length - 1; i >= 0; i -= 1) stack.push(value[i]);
    } else if (value instanceof Map) {
      const pairs = [...value];
      out.push(\`map \${pairs.length}\`);
      for (let i = pairs.length - 1; i >= 0; i -= 1) stack.push(pairs[i][1], pairs[i][0]);
    } else {
      const kept = KEPT.find(([cls]) => value instanceof cls);
      if (kept === undefined) {
        out.push(\`other \${typeof value}\`);
      } else if (numbers.has(value)) {
        out.push(\`\${kept[1]} again \${numbers.get(value)}\`);
      } else {
        numbers.set(value, numbers.size);
        out.push(\`\${kept[1]} #\${numbers.get(value)}\`);
        stack.push(value[kept[2]]);
      }
    }
  }
  return out;
}
`;
}

// GN-13e: the tokens of a result in Python, as aliasTokens writes those of a case value.
export function pythonTokens(forms: TokenForm[]): string {
  return `

# GN-13e: the texts of the places of a value in pre-order, depth first, which a loop writes: the form of each place,
# a container with its count, and an instance numbered by its first place.
_KEPT = (${forms.map((f) => `(pkg.${f.cls}, ${pyString(f.unit)}, ${pyString(f.field)}), `).join('')})


def _tokens(top):
    out = []
    stack = [top]
    numbers = {}
    held = []
    while stack:
        value = stack.pop()
        if value is None:
            out.append("null")
        elif isinstance(value, bool):
            out.append("bool true" if value else "bool false")
        elif type(value) is int:
            out.append(f"int {value}")
        elif type(value) is float:
            out.append("float nan" if value != value else "float " + struct.pack(">d", value).hex())
        elif type(value) is str:
            out.append("text " + value.encode("utf-8", "surrogatepass").hex())
        elif type(value) is bytes:
            out.append("bytes " + value.hex())
        elif type(value) is list:
            out.append(f"list {len(value)}")
            stack.extend(reversed(value))
        elif type(value) is dict:
            out.append(f"map {len(value)}")
            for key, item in reversed(list(value.items())):
                stack.append(item)
                stack.append(key)
        else:
            kept = next((k for k in _KEPT if isinstance(value, k[0])), None)
            if kept is None:
                out.append("other " + type(value).__name__)
            elif id(value) in numbers:
                out.append(f"{kept[1]} again {numbers[id(value)]}")
            else:
                numbers[id(value)] = len(numbers)
                held.append(value)
                out.append(f"{kept[1]} #{numbers[id(value)]}")
                stack.append(getattr(value, kept[2]))
    return out
`;
}

// GN-13e: the tokens of a result in PHP, as aliasTokens writes those of a case value: a stdClass is php_object, and a
// place of an array or of an object that is a PHP reference is php_reference before its value.
export const PHP_TOKENS = `

    /**
     * GN-13e: the texts of the places of a value in pre-order, depth first, which a loop writes: the form of each
     * place, a container with its count, and an object or a reference numbered by its first place.
     *
     * @return list<string>
     */
    private static function tokens(mixed $top): array
    {
        $out = [];
        $stack = [[$top, null]];
        $numbers = [];
        $count = 0;
        while ($stack !== []) {
            [$value, $place] = array_pop($stack);
            if ($place === 'key') {
                $out[] = is_int($value) ? 'int ' . $value : 'string ' . bin2hex($value);
                continue;
            }
            if ($place instanceof \\ReflectionReference) {
                $id = 'reference ' . $place->getId();
                if (isset($numbers[$id])) {
                    $out[] = 'php_reference again ' . $numbers[$id];
                    continue;
                }
                $numbers[$id] = $count++;
                $out[] = 'php_reference #' . $numbers[$id];
            }
            if ($value === null) {
                $out[] = 'null';
            } elseif (is_bool($value)) {
                $out[] = 'bool ' . ($value ? 'true' : 'false');
            } elseif (is_int($value)) {
                $out[] = 'int ' . $value;
            } elseif (is_float($value)) {
                $out[] = 'float ' . (is_nan($value) ? 'nan' : bin2hex(pack('E', $value)));
            } elseif (is_string($value)) {
                $out[] = 'string ' . bin2hex($value);
            } elseif (is_array($value)) {
                $list = array_is_list($value);
                $out[] = ($list ? 'list ' : 'map ') . count($value);
                self::places($value, $list, $stack);
            } elseif ($value instanceof \\stdClass) {
                $id = 'object ' . spl_object_id($value);
                if (isset($numbers[$id])) {
                    $out[] = 'php_object again ' . $numbers[$id];
                    continue;
                }
                $numbers[$id] = $count++;
                $properties = (array) $value;
                $out[] = 'php_object #' . $numbers[$id] . ' ' . count($properties);
                self::places($properties, false, $stack);
            } else {
                $out[] = 'other ' . get_debug_type($value);
            }
        }
        return $out;
    }

    /**
     * GN-13e: the places of an array on the stack of tokens, each with its key unless the array is a list, and with
     * the PHP reference that the place is.
     *
     * @param array<int|string, mixed> $array
     * @param list<array{mixed, mixed}> $stack
     */
    private static function places(array $array, bool $list, array &$stack): void
    {
        foreach (array_reverse(array_keys($array)) as $key) {
            $stack[] = [$array[$key], \\ReflectionReference::fromArrayElement($array, $key)];
            if (!$list) {
                $stack[] = [$key, 'key'];
            }
        }
    }
`;
