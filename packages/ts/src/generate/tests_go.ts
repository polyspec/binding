// The generated Go tests of the Go binding (G-5), run by go test against the static library. The tests of a module
// are in its package (they read the handle of an instance for B-5c): B-3 and B-8 (a text that is not UTF-8, a latin1
// rune above U+00FF), T-2 (a key of a kind that the contract does not list), T-6 (a value that is not one of the
// constants), U-2 (a call without an argument with a default is the call with its default), U-7 (a kind of an alias
// comes up through a member), B-4 (every contract case that raises: the exact error type of E-2 and E-7, the kind, the
// status and the errno), GN-13e (every case that does not raise, with its result), K-2 (a nil callback, the error of a
// callback), N-4 (the text of a stringify) and B-5c (a poisoned instance, an instance at two places). The cases that
// arm faults (G-5) have the build tag polyspec_fault_test and the poison tests polyspec_panic_test.
//
// What the Go types decide is no test of a call: B-2 and T-7 (a uint64 holds no -1, NaN or fraction, a []byte no other
// type), except the range of an int and a uint (GN-12a), which B-2 tests with 2^53 and -2^53; the B-2 values of another
// Go type reach the conversion of each number type through the functions of codec-test (GN-13g),
// G-7 (a call with a missing, extra or unknown argument does not compile), U-2 null as a value (nil is the absent
// value), T-1 (a source is one []byte, so a text and its bytes are the same argument), and the K-2 result of another
// type (a method of the interface returns its declared type).

import type { Type, Unit } from '../contract.ts';
import { defaultCaseValue } from './defaults.ts';
import { numberTypes } from './go_rust.ts';
import {
  type GoScope, callbackOf, callablesOf, categoryType, goBytes, goErrorTypes, goHeader, goImport, goImportBlock, goMemberName, goName,
  goPackage, goParam, goResultCount, goString, goTupleArray, goType,
} from './go.ts';
import {
  type Arg, type CallbackUnit, type Fn, type Model, type ObjectClass, Unsupported, aliasOf, aliasesWithKinds, errorUnitOfKind, heldParam, kindText,
  langName, objectUnit, places, pointName, unitOf, variantOf, factoryOf, poisoned,
} from './model.ts';
import {
  type Fixture, type RaisingCase, type Receiver, aliasCases, caseKey, casePascal, checkCaseNames, comparableResult, expectedErrno, fixturesOf, implementerInstance, instanceOf, isInstanceValue, pairsReceiver, valueClassReceiver,
  raisingCases, resultCases, sampleReceiver, stringCases,
} from './samples.ts';

interface Values {
  model: Model;
  module: string;
  scope: GoScope;
  usesPtr: boolean;
}

// The statements of a test before its call: the instances that it makes (GN-13f), each checked.
class Body {
  lines: string[] = [];
  private count = 0;
  fresh(prefix = 'made'): string {
    return `${prefix}${this.count++}`;
  }
  // A call whose results are bound to locals and whose error fails the test.
  bind(call: string, results: number, rule: string): string[] {
    const names = Array.from({ length: results }, () => this.fresh());
    const error = this.fresh('failure');
    this.lines.push(`${[...names, error].join(', ')} := ${call}`, `if ${error} != nil {`, `\tt.Fatalf("${rule}: %v", ${error})`, '}');
    return names;
  }
}

const NUMBERS: Record<string, string> = { uint: 'uint64', int: 'int64', int64: 'int64', float: 'float64' };

const typeName = (v: Values, type: Type): string => goType(v.scope, type);

// A value in a place of type any (a row of a fixture, a pointer): a number has its Go type.
function typed(type: Type, text: string): string {
  const number = typeof type === 'string' ? NUMBERS[type] : undefined;
  return number === undefined || text === 'nil' ? text : `${number}(${text})`;
}

function pointerTo(v: Values, type: Type, inner: string): string {
  v.usesPtr = true;
  if (aliasOf(v.model, type) !== undefined) return `ptr[any](${inner})`;
  // GN-6v: a pointer to the interface of a variant, not to the struct of the case.
  return variantOf(v.model, type) !== undefined ? `ptr[${typeName(v, type)}](${inner})` : `ptr(${typed(type, inner)})`;
}

const hexBytes = (value: unknown, what: string): string => {
  const hex = typeof value === 'object' && value !== null ? (value as { hex?: unknown }).hex : undefined;
  if (typeof hex !== 'string' || !/^([0-9a-f]{2})*$/.test(hex)) throw new Unsupported(`a case value of the type ${what} is {"hex": "<lower-case hex>"}, not ${JSON.stringify(value)}`);
  return `[]byte(${goBytes((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))})`;
};

// A text case value: a text, {"ill_formed": "<text>"}, the text and then the byte 0xFF, which no UTF-8 holds, or
// {"hex": ...}, the bytes of a Go string, which need not be UTF-8.
function textValue(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'hex' in value) {
    const hex = (value as { hex?: unknown }).hex;
    if (typeof hex !== 'string' || !/^([0-9a-f]{2})*$/.test(hex) || Object.keys(value).length !== 1) throw new Unsupported(`a case value of the type text is a text, {"ill_formed": "<text>"} or {"hex": "<lower-case hex>"}, not ${JSON.stringify(value)}`);
    return `"${(hex.match(/../g) ?? []).map((pair) => `\\x${pair}`).join('')}"`;
  }
  if (typeof value === 'object' && value !== null) {
    const text = (value as { ill_formed?: unknown }).ill_formed;
    if (typeof text !== 'string' || Object.keys(value).length !== 1) throw new Unsupported(`a case value of the type text is a text or {"ill_formed": "<text>"}, not ${JSON.stringify(value)}`);
    return `${goString(text).slice(0, -1)}\\xff"`;
  }
  return goString(String(value));
}

function floatValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const name = (value as { float?: unknown }).float;
    const form = typeof name === 'string' ? ({ nan: 'math.NaN()', inf: 'math.Inf(1)', '-inf': 'math.Inf(-1)' } as Record<string, string>)[name] : undefined;
    if (form === undefined) throw new Unsupported(`a case value of the type float is a number or {"float": "nan" | "inf" | "-inf"}, not ${JSON.stringify(value)}`);
    return form;
  }
  return String(value);
}

const goKey = (key: unknown): string => caseKey(key, (kind, raw) => {
  if (kind === 'int') return `binding.IntKey(${String(raw)})`;
  if (kind === 'text') return `binding.TextKey(${goString(String(raw))})`;
  return `binding.BytesKey(${hexBytes(raw, 'bytes')})`;
});

// A case value (JSON) as a Go value of the contract type; an instance value makes its instance in the body.
function value(v: Values, b: Body, type: Type, json: unknown): string {
  if (json === null) return 'nil';
  if (typeof type === 'string') {
    if (type === 'text') return textValue(json);
    if (type === 'latin1') return goString(String(json));
    if (type === 'bool') return String(json === true);
    if (type === 'float') return floatValue(json);
    if (type in NUMBERS) return String(json);
    if (type === 'bytes') return hexBytes(json, type);
    // T-1: a source is a text or {"hex": ...}, both a []byte.
    if (type === 'source') return typeof json === 'string' ? `[]byte(${goString(json)})` : hexBytes(json, type);
    throw new Unsupported(`no Go case value of the type ${type}`);
  }
  if ('optional' in type) return pointerTo(v, type.optional, value(v, b, type.optional, json));
  if ('list' in type) return `${typeName(v, type)}{${(json as unknown[]).map((item) => value(v, b, type.list, item)).join(', ')}}`;
  // T-2: a tuple inside another type is a Go array; its case value is the array of its parts.
  if ('tuple' in type) {
    const parts = type.tuple.map((part, i) => value(v, b, part, (json as unknown[])[i] ?? null));
    // GN-16: a Tuple<N> of different part types is written by its fields.
    return `${typeName(v, type)}{${goTupleArray(v.scope, type.tuple) ? parts.join(', ') : parts.map((part, i) => `P${i}: ${part}`).join(', ')}}`;
  }
  if ('keyed_map' in type) {
    // G-5: a case gives a keyed map as its entries in order, [key, value]: a key is a text, {"int": n} or {"hex": ...}.
    const sets = (json as [unknown, unknown][]).map(([key, item]) => `m.Set(${goKey(key)}, ${value(v, b, type.keyed_map, item)}); `).join('');
    return `func() ${typeName(v, type)} { m := &binding.KeyedMap[${typeName(v, type.keyed_map)}]{}; ${sets}return m }()`;
  }
  if ('map' in type) {
    const sets = Object.entries(json as Record<string, unknown>).map(([key, item]) => `m.Set(${goString(key)}, ${value(v, b, type.map, item)}); `).join('');
    return `func() ${typeName(v, type)} { m := &binding.Map[${typeName(v, type.map)}]{}; ${sets}return m }()`;
  }
  const alias = aliasOf(v.model, type);
  if (alias !== undefined) return aliasValue(alias.unit, json, `the alias ${alias.unit.id}`);
  // GN-13f, GN-6w: an instance value of a class that implements a callback interface stands for the callback.
  const callback = callbackOf(v.model, type);
  if (callback !== undefined && isInstanceValue(json)) return made(v, b, implementerInstance(v.model, callback.unit, json));
  const object = objectUnit(v.model, type);
  if (object !== undefined) {
    // GN-13f, U-1, GN-13: an instance value, the call of the make member of a class of origin value, or the pairs that
    // fill another class, as in the other targets.
    if (isInstanceValue(json)) return made(v, b, instanceOf(v.model, object.unit.id, json, `a value of ${object.unit.id}`));
    if (object.unit.origin === 'value') return made(v, b, valueClassReceiver(v.model, 'go', object.unit, json));
    if (Array.isArray(json)) return made(v, b, pairsReceiver(v.model, object, json));
    throw new Unsupported(`a case value of the class ${object.unit.id} is an instance value {"new" | "from": ...} or the [key, value] pairs that fill it, not ${JSON.stringify(json)} (GN-13f, GN-13)`);
  }
  // T-9, GN-6v: a value of a variant is the object of its tag and fields, the struct of its case in Go; a field that
  // may be left out and is left out is nil.
  const variant = variantOf(v.model, type);
  if (variant !== undefined) {
    const fields = json as Record<string, unknown>;
    const tag = langName('python', variant.unit.tag ?? [], 'variable');
    const kase = variant.cases.find((c) => c.value === fields[tag]);
    if (kase === undefined) throw new Unsupported(`a case value of the variant ${variant.unit.id} names no case by ${tag}: ${JSON.stringify(json)}`);
    const iface = typeName(v, type);
    const name = `${iface.slice(0, iface.length - goName(variant.unit.name).length)}${goName(kase.unit.name)}`;
    return `${name}{${(kase.unit.fields ?? []).map((f) => {
      const key = langName('python', f.name, 'variable');
      if (!(key in fields)) {
        if (f.default !== undefined) return `${goName(f.name)}: nil`;
        throw new Unsupported(`a case value of the case ${kase.unit.id} has no field ${key}`);
      }
      return `${goName(f.name)}: ${value(v, b, f.type, fields[key])}`;
    }).join(', ')}}`;
  }
  const unit = unitOf(v.model, type);
  if (unit?.kind === 'enum') {
    const variant = (unit.variants ?? []).find((x) => x.value === json);
    return variant === undefined ? `${typeName(v, type)}(${goString(String(json))})` : `${typeName(v, type)}${goName(variant.name)}`;
  }
  if (unit?.kind === 'record') {
    const fields = json as Record<string, unknown>;
    return `${typeName(v, type)}{${(unit.fields ?? []).map((f) => {
      const key = langName('python', f.name, 'variable');
      if (!(key in fields)) {
        if (f.default !== undefined) return `${goName(f.name)}: nil`;
        throw new Unsupported(`a case value of the record ${unit.id} has no field ${key}`);
      }
      const inner = value(v, b, f.type, fields[key]);
      return `${goName(f.name)}: ${f.default === undefined || fields[key] === null ? inner : pointerTo(v, f.type, inner)}`;
    }).join(', ')}}`;
  }
  throw new Unsupported(`no Go case value of the type ${JSON.stringify(type)}`);
}

// GN-13: a value of a value type, {"kind": <value kind>, "value": ...}, as the Go value of the built-in form of the kind:
// nil, bool, int64, float64, string, []byte, []any, and a map[string]any, or a *KeyedMap[any] for a map whose keys are
// not all texts or whose Go form is keyed_map.
function aliasValue(unit: Unit, json: unknown, where: string): string {
  const record = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined;
  const kind = record?.['kind'];
  if (record === undefined || typeof kind !== 'string') throw new Unsupported(`a case value of ${where} is {"kind": <value kind>, "value": ...}, not ${JSON.stringify(json)}`);
  const held = record['value'];
  if (kind === 'null') return 'nil';
  if (kind === 'bool') return String(held === true);
  if (kind === 'text') return textValue(held);
  if (kind === 'bytes') return hexBytes(held, 'bytes');
  if (kind === 'float') {
    const float = floatValue(held);
    return float.startsWith('math.') ? float : `float64(${float})`;
  }
  if (kind === 'int') {
    const token = typeof held === 'bigint' || (typeof held === 'number' && Number.isSafeInteger(held)) ? String(held) : typeof held === 'string' && /^-?(0|[1-9][0-9]*)$/.test(held) ? held : undefined;
    if (token === undefined) throw new Unsupported(`a case value of the kind int of ${where} is a safe integer or a decimal text, not ${JSON.stringify(held)}`);
    const wide = BigInt(token);
    if (wide >= -(2n ** 63n) && wide < 2n ** 63n) return `int64(${token})`;
    if (wide >= 0n && wide < 2n ** 64n) return `uint64(${token})`;
    throw new Unsupported(`a case value of ${where}: the int ${token} is outside the integers of Go (G-5)`);
  }
  // G-5: {"kind": "list", "repeat": n, "value": <value>} is n lists, each the one item of the one around it.
  if (kind === 'list' && record['repeat'] !== undefined) {
    const repeat = record['repeat'];
    if (typeof repeat !== 'number' || !Number.isSafeInteger(repeat) || repeat < 1 || Object.keys(record).length !== 3) throw new Unsupported(`a case value of ${where} is {"kind": "list", "repeat": <n of at least 1>, "value": <value>}, not ${JSON.stringify(json)}`);
    return `func() any { var inner any = ${aliasValue(unit, held, where)}; for range ${repeat} { inner = []any{inner} }; return inner }()`;
  }
  if (kind === 'list' && Array.isArray(held)) return `[]any{${held.map((item) => aliasValue(unit, item, where)).join(', ')}}`;
  if (kind === 'map' && Array.isArray(held)) {
    const entries = held as [unknown, unknown][];
    const keyed = (unit.out ?? []).some((row) => row.kind === 'map' && row.make['go'] === 'keyed_map') || entries.some(([key]) => typeof key !== 'string');
    if (keyed) return `func() *binding.KeyedMap[any] { m := &binding.KeyedMap[any]{}; ${entries.map(([key, item]) => `m.Set(${goKey(key)}, ${aliasValue(unit, item, where)}); `).join('')}return m }()`;
    return `map[string]any{${entries.map(([key, item]) => `${goString(String(key))}: ${aliasValue(unit, item, where)}`).join(', ')}}`;
  }
  throw new Unsupported(`a case value of the kind ${kind} of ${where} is not generated for Go yet (GN-13)`);
}

// A value of the type that the binding converts without failing; rich: a list has one item, so that a member that
// calls a callback per item calls it (K-2).
function placeholder(v: Values, b: Body, type: Type, rich = false): string {
  if (typeof type === 'string') return ({ bool: 'false', text: '"a"', latin1: '"a"', bytes: 'nil', source: '[]byte("a")' } as Record<string, string>)[type] ?? '0';
  if ('list' in type) return rich ? `${typeName(v, type)}{${placeholder(v, b, type.list, rich)}}` : 'nil';
  if ('optional' in type || 'map' in type || 'keyed_map' in type) return 'nil';
  if ('tuple' in type) return `${typeName(v, type)}{}`;
  const callback = callbackOf(v.model, type);
  if (callback !== undefined) return `raising${goName(callback.unit.name)}{}`;
  // U-7: the value of the first out row of a built-in form of Go.
  const alias = aliasOf(v.model, type);
  if (alias !== undefined) {
    const forms: Record<string, string> = { null: 'nil', bool: 'false', int: 'int64(0)', float: 'float64(0)', text: '"a"', bytes: '[]byte{}', list: '[]any{}', map: 'map[string]any{}' };
    for (const row of alias.unit.out ?? []) {
      const make = row.make['go'];
      const found = typeof make === 'string' ? forms[make] : undefined;
      if (found !== undefined) return found;
    }
    return 'nil';
  }
  const object = objectUnit(v.model, type);
  if (object !== undefined) {
    const factory = factoryOf(v.model, object);
    if (factory === undefined) throw new Unsupported(`no placeholder of the class ${object.unit.id}, which has no constructor or static member that makes it (T-5)`);
    return b.bind(invoke(v, factory, callArgs(v, b, factory, (a) => (a.default === undefined ? placeholder(v, b, a.type, rich) : undefined)), ''), 1, 'GN-13f')[0] ?? '';
  }
  // GN-6v: the first case of a variant, its fields placeholders.
  const variant = variantOf(v.model, type);
  const firstCase = variant?.cases[0];
  if (variant !== undefined && firstCase !== undefined) {
    const iface = typeName(v, type);
    return `${iface.slice(0, iface.length - goName(variant.unit.name).length)}${goName(firstCase.unit.name)}{${(firstCase.unit.fields ?? []).map((f) => `${goName(f.name)}: ${placeholder(v, b, f.type, rich)}`).join(', ')}}`;
  }
  const unit = unitOf(v.model, type);
  const first = unit?.variants?.[0];
  if (unit?.kind === 'enum' && first !== undefined) return `${typeName(v, type)}${goName(first.name)}`;
  if (unit?.kind === 'record') return `${typeName(v, type)}{${(unit.fields ?? []).map((f) => `${goName(f.name)}: ${f.default === undefined ? placeholder(v, b, f.type, rich) : 'nil'}`).join(', ')}}`;
  throw new Unsupported(`no Go placeholder for ${JSON.stringify(type)}`);
}

// The call of a member as a Go expression: a function, a constructor or a static member by its name, any other member
// on its receiver. A stringify or a to_json is called by its unexported form, which returns its error.
function invoke(v: Values, fn: Fn, args: string[], receiver: string): string {
  const name = fn.special === 'stringify' ? 'stringify' : fn.special === 'to_json' ? 'toJSON' : goMemberName(fn);
  if (fn.kind === 'function' || fn.kind === 'constructor' || fn.kind === 'static') {
    // GN-15a: a function of another module is named by its package.
    if (fn.module === v.module) return `${name}(${args.join(', ')})`;
    v.scope.imports.add(fn.module);
    return `${goPackage(v.model.contract, fn.module)}.${name}(${args.join(', ')})`;
  }
  return `${receiver}.${name}(${args.join(', ')})`;
}

// The arguments of a call in the order of the parameters, a record parameter as its struct of fields. given gives the
// value of an argument, or undefined for an argument with a default that the call leaves out (nil, U-2).
function callArgs(v: Values, b: Body, fn: Fn, given: (arg: Arg) => string | undefined): string[] {
  return fn.params.map((p) => {
    if (fn.record !== undefined && p === fn.record.param) {
      const unit = fn.record.unit;
      const fields = (unit.fields ?? []).map((f) => {
        const arg = fn.args.find((a) => a.field && a.name === f.name);
        const text = arg === undefined ? undefined : given(arg);
        if (text === undefined) return `${goName(f.name)}: ${f.default === undefined ? placeholder(v, b, f.type) : 'nil'}`;
        return `${goName(f.name)}: ${f.default === undefined || text === 'nil' ? text : pointerTo(v, f.type, text)}`;
      });
      return `${typeName(v, p.type)}{${fields.join(', ')}}`;
    }
    const arg = fn.args.find((a) => !a.field && a.name === p.name);
    const text = arg === undefined ? undefined : given(arg);
    if (text === undefined) return arg?.default === undefined ? placeholder(v, b, p.type) : 'nil';
    return arg?.default === undefined || text === 'nil' ? text : pointerTo(v, p.type, text);
  });
}

// The value of an argument in a case: undefined when the case leaves an argument with a default out (U-2).
function caseValue(v: Values, b: Body, arg: Arg, args: ReadonlyMap<Arg, unknown>): string | undefined {
  if (arg.default !== undefined && !args.has(arg)) return undefined;
  return value(v, b, arg.type, args.get(arg) ?? null);
}

// G-5 (GN-13f): the instance that a receiver makes, as a local of the test. A factory that returns a tuple gives its
// parts as results, and the first pick names the part.
function made(v: Values, b: Body, r: Receiver): string {
  const on = r.on === undefined ? '' : made(v, b, r.on);
  const args = callArgs(v, b, r.factory, (arg) => caseValue(v, b, arg, r.args));
  const names = b.bind(invoke(v, r.factory, args, on), goResultCount(r.factory), 'GN-13f');
  let picks = r.pick ?? [];
  let local = names[0] ?? '';
  if (names.length > 1) {
    const first = picks[0];
    if (first === undefined || !('tuple' in first)) throw new Unsupported(`${r.factory.member.id}: an instance value from a tuple without the pick of its part is not generated for Go yet (GN-13f)`);
    local = names[first.tuple] ?? '';
    picks = picks.slice(1);
  }
  for (const step of picks) {
    const next = b.fresh();
    const expr = 'field' in step ? `${local}.${goName(step.field.split('_'))}` : `${local}[${'index' in step ? step.index : step.tuple}]`;
    b.lines.push(`${next} := ${expr}`);
    local = next;
  }
  for (const step of r.then ?? []) {
    const call = invoke(v, step.fn, callArgs(v, b, step.fn, (arg) => caseValue(v, b, arg, step.args)), local);
    const error = b.fresh('failure');
    b.lines.push(`${[...Array.from({ length: goResultCount(step.fn) }, () => '_'), error].join(', ')} := ${call}`);
    if (step.raises === undefined) {
      b.lines.push(`if ${error} != nil {`, `\tt.Fatalf("GN-13f: %v", ${error})`, '}');
    } else {
      // GN-13f: a call of then that the case expects to fail with a kind fails with it, and the test goes on.
      b.lines.push(`if kinded, ok := ${error}.(interface{ Kind() string }); !ok || kinded.Kind() != ${goString(step.raises)} {`, `\tt.Fatalf("GN-13f: %#v is not of kind ${step.raises}", ${error})`, '}');
    }
  }
  return local;
}

// GN-13e: the receiver and the arguments of a case, or the reason that fails its test by name when a value of the case
// is not written; the other tests of the target are written.
function written<T>(fn: Fn, id: string, write: () => T): T | string {
  try {
    return write();
  } catch (error) {
    if (!(error instanceof Unsupported)) throw error;
    return `the case ${id} of ${fn.member.id}: ${error.message}`;
  }
}

// The statement of a call whose error is err: its results are blanks or the given names.
const callLine = (fn: Fn, call: string, names?: string[]): string => {
  const results = fn.special === 'stringify' ? 1 : goResultCount(fn);
  return `${[...(names ?? Array.from({ length: results }, () => '_')), 'err'].join(', ')} := ${call}`;
};

// E-2, E-7, B-4: the lines that require err to be an error of the type with the kind.
function expectKind(type: string, kind: string, rule: string): string[] {
  return [`if failure, ok := err.(*liberrors.${type}); !ok || failure.Kind() != ${goString(kind)} {`, `\tt.Fatalf("${rule}: %#v", err)`, '}'];
}

const indent = (lines: string[], depth: number): string => lines.map((l) => (l === '' ? '' : `${'\t'.repeat(depth)}${l}`)).join('\n');

// GN-13e: a name of a test holds the words of a text, capitalized and joined, as the id of a case.
const testName = casePascal;

// G-5: the fixture of a callback, which answers the calls of the core by the rows of a case.
function fixtureLines(v: Values, b: Body, fixture: Fixture, name: string): string {
  const members = fixture.unit.members ?? [];
  const memberName = (i: number): string => goString(langName('go', members[i]?.name ?? [], 'callable'));
  const argsOf = (member: number, args: unknown[]): string => `[]any{${(members[member]?.parameters ?? []).map((p, i) => typed(p.type, value(v, b, p.type, args[i] ?? null))).join(', ')}}`;
  const rows = fixture.rows.map((row) => {
    const returns = members[row.member]?.returns ?? 'none';
    const result = row.result === null || returns === 'none' ? 'nil' : typed(returns, value(v, b, returns, row.result));
    return `{member: ${memberName(row.member)}, args: ${argsOf(row.member, row.args)}, result: ${result}, once: ${String(row.once)}}`;
  });
  b.lines.push(`${name} := fixture${goName(fixture.unit.name)}{&fixture{rows: []fixtureRow{${rows.join(', ')}}}}`);
  return name;
}

function fixtureChecks(fixtures: { fixture: Fixture; name: string }[], v: Values, b: Body): string[] {
  return fixtures.flatMap(({ fixture, name }) => {
    const members = fixture.unit.members ?? [];
    const lines = [`if len(${name}.unexpected) != 0 {`, `\tt.Fatalf("G-5: calls that no row answers: %v", ${name}.unexpected)`, '}'];
    if (fixture.calls !== undefined) {
      const calls = fixture.calls.map((call) => `{${[goString(langName('go', members[call.member]?.name ?? [], 'callable')), ...(members[call.member]?.parameters ?? []).map((p, i) => typed(p.type, value(v, b, p.type, call.args[i] ?? null)))].join(', ')}}`);
      lines.push(`if want := [][]any{${calls.join(', ')}}; !reflect.DeepEqual(${name}.calls, want) {`, `\tt.Fatalf("G-5: the calls %v are not %v", ${name}.calls, want)`, '}');
    }
    return lines;
  });
}

// The Go test functions of a module, by the file they go to: the file without a build tag, the cases that arm faults
// (polyspec_fault_test) and the poison tests (polyspec_panic_test).
interface Out {
  main: string[];
  fault: string[];
  held: string[];
  callbacks: Set<CallbackUnit>;
}

const labelOf = (fn: Fn): string => {
  const owner = goName(fn.unit.name);
  if (fn.kind === 'function') return goMemberName(fn);
  if (fn.kind === 'constructor') return `${owner}New`;
  if (fn.kind === 'static') return goMemberName(fn);
  return `${owner}${fn.special === 'stringify' ? 'String' : goMemberName(fn)}`;
};

// The fixtures of a case, each a local of the body.
function fixturesFor(v: Values, out: Out, b: Body, fn: Fn, id: string, args: Map<Arg, unknown>): { fixture: Fixture; name: string }[] {
  return fixturesOf(v.model, fn, id, args).map((fixture, i) => {
    const callback = v.model.callbacks.find((c) => c.unit === fixture.unit);
    if (callback !== undefined) out.callbacks.add(callback);
    return { fixture, name: fixtureLines(v, b, fixture, `fixture${i}`) };
  });
}

function memberTests(v: Values, out: Out, fn: Fn): void {
  const model = v.model;
  const types = Object.fromEntries(goErrorTypes(model.contract));
  const label = labelOf(fn);
  const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
  const reachable = fn.receiver === undefined || sample !== undefined;
  // A test that calls the member once with placeholders and one argument in its place.
  const single = (rule: string, what: string, arg: Arg, given: (b: Body) => string, check: string[], rich = false): void => {
    const b = new Body();
    const receiver = sample === undefined ? '' : made(v, b, sample);
    const args = callArgs(v, b, fn, (a) => (a === arg ? given(b) : a.default === undefined ? placeholder(v, b, a.type, rich) : undefined));
    out.main.push(`
func Test${rule.replace('-', '')}${label}${testName(what)}(t *testing.T) {
${indent([...b.lines, callLine(fn, invoke(v, fn, args, receiver)), ...check], 1)}
}`);
  };
  for (const arg of reachable && fn.special === undefined ? fn.args : []) {
    const argName = goParam(arg.name, v.model);
    let base = arg.type;
    let wrap = (text: string): string => text;
    if (typeof base === 'object' && 'optional' in base) {
      const inner = base.optional;
      base = inner;
      wrap = (text) => pointerTo(v, inner, text);
    }
    if (typeof base === 'object' && 'list' in base) {
      const listType = typeName(v, base);
      const outer = wrap;
      base = base.list;
      wrap = (text) => outer(`${listType}{${text}}`);
    }
    if (base === 'int' || base === 'uint') {
      // GN-12a: an int or a uint outside the safe integers is kind invalid_number.
      single('B-2', `refuses ${argName} above the safe integers`, arg, () => wrap('9007199254740992'), expectKind(types['value'] ?? '', 'invalid_number', 'B-2'));
      if (base === 'int') single('B-2', `refuses ${argName} below the safe integers`, arg, () => wrap('-9007199254740992'), expectKind(types['value'] ?? '', 'invalid_number', 'B-2'));
    }
    if (base === 'text') single('B-3', `refuses ${argName} that is not UTF-8`, arg, () => wrap('"\\xff"'), expectKind(types['value'] ?? '', 'invalid_text', 'B-3'));
    if (base === 'latin1') {
      single('B-8', `refuses ${argName} above U+00FF`, arg, () => wrap('"\\u0100"'), expectKind(types['value'] ?? '', 'invalid_text', 'B-8'));
      single('B-8', `refuses ${argName} that is not UTF-8`, arg, () => wrap('"\\xff"'), expectKind(types['value'] ?? '', 'invalid_text', 'B-8'));
    }
    if (typeof base === 'object' && 'keyed_map' in base) {
      // T-2: a key of a kind that the contract does not list is kind invalid_argument_type.
      const keyedType = base;
      const missing = (['int', 'bytes', 'text'] as const).find((kind) => !keyedType.key.includes(kind));
      if (keyedType.key.includes('int')) {
        // GN-12a: an int key outside the safe integers is kind invalid_number.
        single('B-2', `refuses ${argName} with a key outside the safe integers`, arg, (b) => wrap(`func() ${typeName(v, keyedType)} { m := &binding.KeyedMap[${typeName(v, keyedType.keyed_map)}]{}; m.Set(binding.IntKey(9007199254740992), ${placeholder(v, b, keyedType.keyed_map)}); return m }()`), expectKind(types['value'] ?? '', 'invalid_number', 'B-2'));
      }
      if (missing !== undefined) {
        const key = { int: 'binding.IntKey(1)', bytes: 'binding.BytesKey([]byte("b"))', text: 'binding.TextKey("t")' }[missing];
        single('T-2', `refuses ${argName} with a ${missing} key`, arg, (b) => wrap(`func() ${typeName(v, keyedType)} { m := &binding.KeyedMap[${typeName(v, keyedType.keyed_map)}]{}; m.Set(${key}, ${placeholder(v, b, keyedType.keyed_map)}); return m }()`), expectKind(types['type'] ?? '', 'invalid_argument_type', 'T-2'));
      }
    }
    const unit = unitOf(model, base);
    if (unit?.kind === 'enum') {
      const enumType = typeName(v, base);
      single('T-6', `refuses ${argName} that is no constant`, arg, () => wrap(`${enumType}("\\x00")`), expectKind(types['type'] ?? '', 'invalid_argument_type', 'T-6'));
    }
    // U-7: a kind of an alias's in function reaches the caller of a member that takes the alias.
    const alias = aliasOf(model, arg.type);
    const kase = alias === undefined ? undefined : aliasCases(model).find((c) => c.alias === alias);
    if (kase !== undefined) single('U-7', `gives the kind of ${kase.alias.unit.id} in ${argName}`, arg, () => aliasValue(kase.alias.unit, kase.value, `the alias ${kase.alias.unit.id}`), expectKind(types[kase.category] ?? '', kase.kind, 'U-7'));
    // U-3, K-2: a nil callback is kind invalid_callback, and the error of a callback is the error of the call.
    const callback = callbackOf(model, arg.type);
    if (callback !== undefined) {
      out.callbacks.add(callback);
      single('K-2', `refuses a nil ${argName}`, arg, () => 'nil', expectKind(types['type'] ?? '', 'invalid_callback', 'K-2'), true);
      const b = new Body();
      const receiver = sample === undefined ? '' : made(v, b, sample);
      const args = callArgs(v, b, fn, (a) => (a === arg ? `raising${goName(callback.unit.name)}{err: raised}` : a.default === undefined ? placeholder(v, b, a.type, true) : undefined));
      out.main.push(`
func TestK2${label}LetsTheErrorOf${testName(argName)}Through(t *testing.T) {
	raised := errors.New("raised by the callback")
${indent([...b.lines, callLine(fn, invoke(v, fn, args, receiver)), 'if err != raised {', '\tt.Fatalf("K-2: %#v is not the error of the callback", err)', '}'], 1)}
}`);
    }
  }
  // U-2: the call that leaves an argument with a default out is the call that gives the default.
  const count = fn.special === undefined ? goResultCount(fn) : 0;
  const comparable = count === 1 && fn.kind !== 'iterate' && comparableResult(model, fn.returns) === undefined && fn.args.every((a) => callbackOf(model, a.type) === undefined);
  const base = resultCases(model, fn).find((k) => k.refused === undefined);
  const receiverOf = base?.receiver ?? sample;
  for (const arg of reachable && comparable && (fn.receiver === undefined || receiverOf !== undefined) ? fn.args : []) {
    const declared = defaultCaseValue(model, arg);
    if (declared === undefined) continue;
    const b = new Body();
    const side = (left: boolean): string => {
      const receiver = receiverOf === undefined ? '' : made(v, b, receiverOf);
      const args = callArgs(v, b, fn, (a) => {
        if (a === arg) return left ? undefined : value(v, b, a.type, declared.value);
        if (base !== undefined) return caseValue(v, b, a, base.args);
        return a.default === undefined ? placeholder(v, b, a.type) : undefined;
      });
      return invoke(v, fn, args, receiver);
    };
    const left = side(true);
    b.lines.push(`value0, err0 := ${left}`);
    const right = side(false);
    b.lines.push(`value1, err1 := ${right}`);
    out.main.push(`
func TestU2${label}Without${testName(goParam(arg.name, v.model))}IsTheCallWithItsDefault(t *testing.T) {
${indent([...b.lines, 'if !reflect.DeepEqual(value0, value1) || !sameFailure(err0, err1) {', '\tt.Fatalf("U-2: %#v, %v is not %#v, %v", value0, err0, value1, err1)', '}'], 1)}
}`);
  }
  // B-4: every case that raises.
  for (const kase of raisingCases(model, fn)) {
    const b = new Body();
    const fixtures = fixturesFor(v, out, b, fn, kase.id, kase.args);
    const call = written(fn, kase.id, () => {
      const receiver = kase.receiver === undefined ? '' : made(v, b, kase.receiver);
      return { receiver, args: callArgs(v, b, fn, (arg) => fixtures.find((f) => f.fixture.arg === arg)?.name ?? caseValue(v, b, arg, kase.args)) };
    });
    if (typeof call === 'string') {
      (kase.faults === undefined ? out.main : out.fault).push(`
func TestB4${label}${testName(kase.id)}(t *testing.T) {
	t.Fatal(${goString(call)})
}`);
      continue;
    }
    const { receiver, args } = call;
    const lines = [...b.lines];
    if (kase.faults !== undefined) {
      lines.unshift('runtime.LockOSThread()', 'defer runtime.UnlockOSThread()');
      lines.push(`armed, armErr := binding.ArmFaults(${goString(fn.member.id)}, ${goString(kase.faults)})`, 'if armErr != nil {', '\tt.Fatalf("G-5: %v", armErr)', '}');
    }
    lines.push(callLine(fn, invoke(v, fn, args, receiver)), ...raisedLines(v, kase), ...fixtureChecks(fixtures, v, b));
    if (kase.faults !== undefined) lines.push('if left, leftErr := binding.FaultLeft(armed); leftErr != nil || len(left) != 0 {', '\tt.Fatalf("G-5: the faults %v did not fire (%v)", left, leftErr)', '}');
    (kase.faults === undefined ? out.main : out.fault).push(`
func TestB4${label}${testName(kase.id)}(t *testing.T) {
${indent(lines, 1)}
}`);
  }
  // GN-13e: every case that does not raise runs, and its result is compared with the value that the case gives.
  for (const kase of resultCases(model, fn)) {
    if (kase.refused !== undefined) {
      out.main.push(`
func TestGN13e${label}${testName(kase.id)}(t *testing.T) {
	t.Fatal(${goString(kase.refused)})
}`);
      continue;
    }
    const b = new Body();
    const fixtures = fixturesFor(v, out, b, fn, kase.id, kase.args);
    const call = written(fn, kase.id, () => {
      const receiver = kase.receiver === undefined ? '' : made(v, b, kase.receiver);
      return { receiver, args: callArgs(v, b, fn, (arg) => fixtures.find((f) => f.fixture.arg === arg)?.name ?? caseValue(v, b, arg, kase.args)) };
    });
    if (typeof call === 'string') {
      out.main.push(`
func TestGN13e${label}${testName(kase.id)}(t *testing.T) {
	t.Fatal(${goString(call)})
}`);
      continue;
    }
    const { receiver, args } = call;
    const results = fn.special === 'stringify' ? 1 : goResultCount(fn);
    const parts = fn.returns === 'none' ? [] : typeof fn.returns === 'object' && 'tuple' in fn.returns ? fn.returns.tuple : [fn.returns];
    const names = kase.expected === undefined ? undefined : Array.from({ length: results }, (_, i) => `value${i}`);
    let compared: string[] = [];
    let refused: string | undefined;
    if (kase.expected !== undefined) {
      try {
        compared = parts.flatMap((type, i) => {
          const given = parts.length === 1 ? kase.expected?.value : (kase.expected?.value as unknown[] | undefined)?.[i];
          const want = value(v, b, type, given ?? null);
          return [`if want := (${typeName(v, type)})(${want}); !reflect.DeepEqual(value${i}, want) {`, `\tt.Fatalf("GN-13e: %#v is not %#v", value${i}, want)`, '}'];
        });
      } catch (error) {
        if (!(error instanceof Unsupported)) throw error;
        refused = `${fn.member.id}: ${error.message} (GN-13e)`;
      }
    }
    const lines = refused === undefined
      ? [...b.lines, callLine(fn, invoke(v, fn, args, receiver), names), 'if err != nil {', '\tt.Fatalf("GN-13e: %v", err)', '}', ...compared, ...fixtureChecks(fixtures, v, b)]
      : [`t.Fatal(${goString(refused)})`];
    out.main.push(`
func TestGN13e${label}${testName(kase.id)}(t *testing.T) {
${indent(lines, 1)}
}`);
  }
  // N-4: the text of a stringify is the result of its case.
  for (const kase of stringCases(model, fn)) {
    const b = new Body();
    const receiver = made(v, b, kase.receiver);
    out.main.push(`
func TestN4${label}${testName(kase.id)}(t *testing.T) {
${indent([...b.lines, `if text := ${receiver}.String(); text != ${goString(kase.result)} {`, '\tt.Fatalf("N-4: %q", text)', '}'], 1)}
}`);
  }
}

// B-4: the lines that require err to be the failure of a case.
function raisedLines(v: Values, kase: RaisingCase): string[] {
  const unit = errorUnitOfKind(v.model, kase.raises.kind);
  const category = categoryType(v.model, kase.raises.category);
  const exact = unit === undefined ? category : goName(unit.unit.name);
  const errno = expectedErrno(kase);
  return [
    `failure, ok := err.(*liberrors.${exact})`,
    `if !ok || failure.Kind() != ${goString(kase.raises.kind)} {`,
    '\tt.Fatalf("B-4: %#v", err)',
    '}',
    ...(unit === undefined ? [] : [`var category *liberrors.${category}`, 'if !errors.As(err, &category) {', '\tt.Fatalf("E-2: %#v is no error of its category", err)', '}']),
    kase.raises.status === null ? 'if _, ok := failure.Status(); ok {' : `if status, ok := failure.Status(); !ok || status != ${kase.raises.status} {`,
    '\tt.Fatalf("B-4: the status of %#v", err)',
    '}',
    errno === null ? 'if _, ok := failure.Errno(); ok {' : `if errno, ok := failure.Errno(); !ok || errno != ${'symbol' in errno ? `int64(syscall.${errno.symbol})` : String(errno.value)} {`,
    '\tt.Fatalf("B-4: the errno of %#v", err)',
    '}',
  ];
}

// B-5c (GN-6h): a poisoned instance is refused at every place, and an instance at a write place and another is busy.
// Each test is one body, so that the locals of its calls are distinct.
function heldTests(v: Values, out: Out, objects: ObjectClass[]): void {
  const model = v.model;
  const types = Object.fromEntries(goErrorTypes(model.contract));
  const objectOf = (fn: Fn): ObjectClass | undefined => model.objects.find((o) => o.unit === fn.unit);
  const takes = (fn: Fn, object: ObjectClass): Arg | undefined => fn.args.find((a) => !a.field && heldParam(model, a.type)?.unit === object.unit);
  const callables = callablesOf(model).filter((m) => m.kind !== 'iterate' && m.special === undefined && m.module === v.module);
  // A call in a block of its own, which requires err to be of the type with the kind, or nil.
  const check = (b: Body, fn: Fn, receiver: string, arg: Arg | undefined, held: string, expect: [string, string, string] | undefined): void => {
    const call = invoke(v, fn, callArgs(v, b, fn, (a) => (a === arg ? held : a.default === undefined ? placeholder(v, b, a.type) : undefined)), receiver);
    const after = expect === undefined ? ['\tif err != nil {', '\t\tt.Fatalf("B-5c: the refused call left a lock: %v", err)', '\t}'] : expectKind(...expect).map((l) => `\t${l}`);
    b.lines.push('{', `\t${callLine(fn, call)}`, ...after, '}');
  };
  // A member whose only place is its receiver: a call that fails for the receiver alone.
  const onReceiver = (object: ObjectClass): Fn | undefined =>
    object.members.find((m) => m.kind === 'property' && m.receiver !== undefined) ??
    object.members.find((m) => m.kind === 'method' && m.special === undefined && places(model, m).length === 1);
  for (const object of objects) {
    if (!poisoned(model, object)) continue;
    const name = goName(object.unit.name);
    const receiverFn = onReceiver(object);
    const paramFn = callables.find((fn) => {
      if (takes(fn, object) === undefined) return false;
      const owner = objectOf(fn);
      return fn.receiver === undefined || (owner !== undefined && factoryOf(model, owner) !== undefined);
    });
    const internal: [string, string, string] = [types['internal'] ?? '', 'internal', 'B-5c'];
    const b = new Body();
    const held = placeholder(v, b, { unit: object.unit.id });
    b.lines.push(`if err := binding.PanicTestHeld(${model.objects.indexOf(object)}, ${held}.handle()); err == nil {`, '\tt.Fatal("B-5c: the poison entry point did not panic")', '}');
    if (receiverFn !== undefined) check(b, receiverFn, held, undefined, held, internal);
    if (paramFn !== undefined) {
      const owner = objectOf(paramFn);
      const receiver = paramFn.receiver === undefined || owner === undefined ? '' : placeholder(v, b, { unit: owner.unit.id });
      check(b, paramFn, receiver, takes(paramFn, object), held, internal);
    }
    out.held.push(`
func TestB5c${name}RefusesAPoisonedObject(t *testing.T) {
${indent(b.lines, 1)}
}`);
    for (const fn of object.members) {
      const arg = takes(fn, object);
      if (arg === undefined || !places(model, fn).some((p) => p.param === undefined && p.write)) continue;
      // GN-8a: a point that fills one kind of its category, by an injection that needs no value.
      const point = model.faults.find((p) => p.place === fn.corePath && p.fills.length === 1 && p.inject.some((i) => i !== 'short'));
      const filled = point === undefined ? undefined : model.kinds.find((k) => k.unit === undefined && kindText(k.variant) === point.fills[0]);
      const inject = point?.inject.find((i) => i !== 'short');
      const armed = point === undefined || filled === undefined || inject === undefined ? undefined : { faults: JSON.stringify([{ point: pointName(model, point), kind: inject }]), kind: kindText(filled.variant), category: filled.category };
      const c = new Body();
      if (armed !== undefined) c.lines.push('runtime.LockOSThread()', 'defer runtime.UnlockOSThread()');
      const instance = placeholder(v, c, { unit: object.unit.id });
      if (armed !== undefined) c.lines.push(`armed, armErr := binding.ArmFaults(${goString(fn.member.id)}, ${goString(armed.faults)})`, 'if armErr != nil {', '\tt.Fatalf("G-5: %v", armErr)', '}');
      check(c, fn, instance, arg, instance, [types['busy'] ?? '', 'busy', 'B-5c']);
      if (receiverFn !== undefined) check(c, receiverFn, instance, undefined, instance, undefined);
      if (armed !== undefined) {
        // GN-8a: the refused call did not reach the core, so the next call, with another instance, takes the arming.
        const other = placeholder(v, c, { unit: object.unit.id });
        check(c, fn, instance, arg, other, [types[armed.category] ?? '', armed.kind, 'GN-8a']);
        c.lines.push('if left, leftErr := binding.FaultLeft(armed); leftErr != nil || len(left) != 0 {', '\tt.Fatalf("G-5: the faults %v did not fire (%v)", left, leftErr)', '}');
      }
      (armed === undefined ? out.main : out.fault).push(`
func TestB5c${name}${goMemberName(fn)}RefusesTheInstanceAtTwoPlaces(t *testing.T) {
${indent(c.lines, 1)}
}`);
    }
  }
}

// U-3, G-5: the implementations of a callback interface that the tests pass: one whose methods return the error they
// hold (a zero result with nil), and the fixture of a case.
function callbackTypes(v: Values, cb: CallbackUnit): string {
  const name = goName(cb.unit.name);
  const methods = cb.members.map((m) => {
    const method = langName('go', m.member.name, 'callable');
    const params = m.params.map((p) => `${goParam(p.name, v.model)} ${typeName(v, p.type)}`).join(', ');
    const result = m.returns === 'none' ? undefined : typeName(v, m.returns);
    const args = m.params.map((p) => goParam(p.name, v.model));
    const raising = result === undefined
      ? `func (r raising${name}) ${method}(${params}) error { return r.err }`
      : `func (r raising${name}) ${method}(${params}) (${result}, error) {\n\tvar zero ${result}\n\treturn zero, r.err\n}`;
    const fixture = result === undefined
      ? `func (f fixture${name}) ${method}(${params}) error {\n\t_, err := f.answer(${[goString(method), ...args].join(', ')})\n\treturn err\n}`
      : `func (f fixture${name}) ${method}(${params}) (${result}, error) {\n\tresult, err := f.answer(${[goString(method), ...args].join(', ')})\n\tvalue, _ := result.(${result})\n\treturn value, err\n}`;
    return { raising, fixture };
  });
  return `
// raising${name} is a ${name} whose methods return err, with a zero result (K-2).
type raising${name} struct{ err error }

${methods.map((m) => m.raising).join('\n\n')}

// fixture${name} is a ${name} that answers by the rows of a case (G-5).
type fixture${name} struct{ *fixture }

${methods.map((m) => m.fixture).join('\n\n')}
`;
}

const FIXTURE = `
// fixtureRow is a row of a callback fixture: the member, its arguments, its result and whether it answers once.
type fixtureRow struct {
	member string
	args   []any
	result any
	once   bool
}

// fixture answers the calls of the core by its rows and records every call (G-5); a call that no row answers is
// recorded apart and returns an error, so a core that drops the error still fails the test.
type fixture struct {
	rows       []fixtureRow
	calls      [][]any
	unexpected [][]any
}

func (f *fixture) answer(member string, args ...any) (any, error) {
	call := append([]any{member}, args...)
	f.calls = append(f.calls, call)
	for at, row := range f.rows {
		if row.member == member && (reflect.DeepEqual(row.args, args) || len(row.args)+len(args) == 0) {
			if row.once {
				f.rows = append(f.rows[:at:at], f.rows[at+1:]...)
			}
			return row.result, nil
		}
	}
	f.unexpected = append(f.unexpected, call)
	return nil, fmt.Errorf("G-5: no row answers %v", call)
}
`;

const SAME_FAILURE = `
// sameFailure is whether two calls failed alike: neither, or both with an error of the same type and kind (U-2).
func sameFailure(a, b error) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	ka, okA := a.(interface{ Kind() string })
	kb, okB := b.(interface{ Kind() string })
	return okA && okB && reflect.TypeOf(a) == reflect.TypeOf(b) && ka.Kind() == kb.Kind()
}
`;

const PTR = `
// ptr is a pointer to a value, for an argument with a default or an optional argument.
func ptr[T any](value T) *T { return &value }
`;

// The standard packages and the packages of the module that a test file names.
function testImports(model: Model, module: string, text: string, scope: GoScope): string {
  const std = ['errors', 'fmt', 'math', 'reflect', 'runtime', 'syscall'].filter((p) => new RegExp(`\\b${p}\\.`).test(text)).map((p) => `"${p}"`);
  std.push('"testing"');
  const own = [
    ...(/\bliberrors\./.test(text) ? [`liberrors "${goImport(model.contract, 'errors')}"`] : []),
    ...(/\bbinding\./.test(text) ? [`"${goImport(model.contract, 'internal/binding')}"`] : []),
    ...[...scope.imports].filter((m) => m !== module && new RegExp(`\\b${goPackage(model.contract, m)}\\.`).test(text)).map((m) => `"${goImport(model.contract, m)}"`),
    // GN-15f: the packages of other repositories whose records the tests name.
    ...[...(scope.foreignImports ?? new Map<string, string>())].filter(([, name]) => new RegExp(`\\b${name}\\.`).test(text)).map(([path]) => `"${path}"`),
  ];
  return goImportBlock(std, own);
}

export function goTestFiles(model: Model, module: string): [string, string][] {
  checkCaseNames(model, casePascal, false);
  const scope: GoScope = { model, module, imports: new Set() };
  const v: Values = { model, module, scope, usesPtr: false };
  const out: Out = { main: [], fault: [], held: [], callbacks: new Set() };
  for (const fn of callablesOf(model).filter((f) => f.module === module && f.kind !== 'iterate')) memberTests(v, out, fn);
  heldTests(v, out, model.objects.filter((o) => o.unit.module === module));
  if (out.main.length + out.fault.length + out.held.length === 0) return [];
  const pkg = goPackage(model.contract, module);
  // The helpers are in the file without a build tag, which every run compiles.
  const all = [...out.main, ...out.fault, ...out.held].join('\n');
  const helpers = [
    ...(v.usesPtr ? [PTR] : []),
    ...(/\bsameFailure\(/.test(all) ? [SAME_FAILURE] : []),
    ...(/\bfixture[A-Z]/.test(all) ? [FIXTURE] : []),
    ...[...out.callbacks].map((cb) => callbackTypes(v, cb)),
  ].join('');
  const file = (tag: string | undefined, tests: string[], extra = ''): string => {
    const body = `${extra}${tests.join('\n')}\n`;
    return `${goHeader()}
${tag === undefined ? '' : `\n//go:build ${tag}\n`}
// The generated tests of the Go package ${pkg} (G-5).
package ${pkg}

${testImports(model, module, body, scope)}${body}`;
  };
  const files: [string, string][] = [['zz_generated_test.go', file(undefined, out.main, helpers)]];
  if (out.fault.length > 0) files.push(['zz_generated_fault_test.go', file('polyspec_fault_test', out.fault)]);
  if (out.held.length > 0) files.push(['zz_generated_held_test.go', file('polyspec_panic_test', out.held)]);
  return files;
}

// B-7: the panic of the core reaches Go as the internal error type of kind internal.
export function goPanicTest(internal: string): string {
  return `${goHeader()}

//go:build polyspec_panic_test

package binding

import "testing"

func TestB7APanicIsKindInternal(t *testing.T) {
	err := panicTest()
	failure, ok := err.(*${internal})
	if !ok || failure.Kind() != "internal" {
		t.Fatalf("B-7: %#v", err)
	}
}
`;
}

// T-2: the ordered map keeps the order in which its keys were first set, and the encoding keeps it both ways.
export function goMapTest(): string {
  return `${goHeader()}

package binding

import (
	"reflect"
	"testing"
)

func TestT2AMapKeepsTheOrderOfItsKeys(t *testing.T) {
	m := &Map[int64]{}
	m.Set("b", 1)
	m.Set("a", 2)
	m.Set("b", 3)
	if keys := m.Keys(); !reflect.DeepEqual(keys, []string{"b", "a"}) {
		t.Fatalf("T-2: %q", keys)
	}
	if value, ok := m.Get("b"); !ok || value != 3 {
		t.Fatalf("T-2: b is %d, %v", value, ok)
	}
	var none *Map[int64]
	if none.Len() != 0 || none.Keys() != nil {
		t.Fatal("T-2: a nil map is not empty")
	}
}

func TestT2TheEncodingKeepsTheOrderOfAMap(t *testing.T) {
	m := &Map[string]{}
	for _, key := range []string{"z", "a", "m"} {
		m.Set(key, key+key)
	}
	enc := NewWriter()
	enc.Len(m.Len())
	for _, key := range m.Keys() {
		value, _ := m.Get(key)
		enc.Text(key)
		enc.Text(value)
	}
	dec := NewReader(enc.Done())
	back := &Map[string]{}
	for i, n := 0, dec.Len(); i < n; i++ {
		key := dec.Text()
		back.Set(key, dec.Text())
	}
	if err := dec.Finish(); err != nil || !reflect.DeepEqual(back, m) {
		t.Fatalf("T-2: %v %#v", err, back)
	}
}
`;
}

// GW-4, T-2: the round trips through the C ABI: every latin1 character comes back the same and a rune above U+00FF
// or bytes that are not UTF-8 are kind invalid_text; a map comes back in its order. U-7: the cases of an alias run its
// in function alone.
export function goCodecTest(model: Model, echo: { latin1: boolean; map: boolean; keyed: boolean }): string {
  const valueType = categoryType(model, 'value');
  const latin1 = echo.latin1 ? `
func TestB8Latin1RoundTrips(t *testing.T) {
	runes := make([]rune, 0, 256)
	for code := rune(0); code <= 0xff; code++ {
		runes = append(runes, code)
	}
	text := string(runes)
	back, err := echoLatin1(text)
	if err != nil || back != text {
		t.Fatalf("B-8: %q, %v", back, err)
	}
	for _, bad := range []string{"\\u0100", "\\xff"} {
		_, err := echoLatin1(bad)
		failure, ok := err.(*${valueType})
		if !ok || failure.Kind() != "invalid_text" {
			t.Fatalf("B-8: %q: %#v", bad, err)
		}
	}
}
` : '';
  const map = echo.map ? `
func TestT2AMapRoundTripsInItsOrder(t *testing.T) {
	m := &Map[string]{}
	for _, key := range []string{"z", "a", "\\u00e9", "m"} {
		m.Set(key, key+key)
	}
	back, err := echoMap(m)
	if err != nil || !reflect.DeepEqual(back.Keys(), m.Keys()) {
		t.Fatalf("T-2: %q, %v", back.Keys(), err)
	}
	for _, key := range m.Keys() {
		want, _ := m.Get(key)
		if got, _ := back.Get(key); got != want {
			t.Fatalf("T-2: %q is %q", key, got)
		}
	}
}
` : '';
  const keyed = echo.keyed ? `
func TestT2AKeyedMapRoundTripsInItsOrder(t *testing.T) {
	m := &KeyedMap[string]{}
	for i, key := range []Key{TextKey("1"), IntKey(1), BytesKey([]byte{0xff}), IntKey(-7), TextKey("a")} {
		m.Set(key, string(rune('a'+i)))
	}
	back, err := echoKeyedMap(m)
	if err != nil || !reflect.DeepEqual(back.Keys(), m.Keys()) {
		t.Fatalf("T-2: %v, %v", back.Keys(), err)
	}
	for _, key := range m.Keys() {
		want, _ := m.Get(key)
		if got, _ := back.Get(key); got != want {
			t.Fatalf("T-2: %v is %q", key, got)
		}
	}
}
` : '';
  const local = new Set(aliasesWithKinds(model).filter((a) => a.library === undefined));
  const aliases = aliasCases(model).filter((c) => local.has(c.alias)).map((kase) => `
func TestU7${goName(kase.alias.unit.name)}In${testName(kase.id)}(t *testing.T) {
	err := AliasIn${goName(kase.alias.unit.name)}(${aliasValue(kase.alias.unit, kase.value, `the alias ${kase.alias.unit.id}`).replace(/\bbinding\./g, '')})
	if failure, ok := err.(*${categoryType(model, kase.category)}); !ok || failure.Kind() != ${goString(kase.kind)} {
		t.Fatalf("U-7: %#v", err)
	}
}
`).join('');
  // GN-13g: the B-2 values of GN-13 of another Go type, and values of the type, through the conversion of each number type.
  const sets: Record<string, [string[], string[]]> = {
    uint: [['true', '"7"', '1.5', 'math.NaN()', 'math.Inf(1)', 'math.Inf(-1)', '-1', 'uint64(9007199254740992)'], ['7', 'uint64(9007199254740991)']],
    int: [['true', '"7"', '1.5', 'math.NaN()', 'math.Inf(1)', 'math.Inf(-1)', 'int64(9007199254740992)', 'int64(-9007199254740992)'], ['7', '-7', 'int64(9007199254740991)']],
    int64: [['true', '"7"', '1.5', 'math.NaN()', 'math.Inf(1)', 'math.Inf(-1)', 'uint64(math.MaxUint64)'], ['7', 'int64(math.MinInt64)', 'int64(math.MaxInt64)']],
    float: [['true', '"7"', '7'], ['1.5', 'math.NaN()', 'math.Inf(1)']],
  };
  const numbers = numberTypes(model).map((type) => {
    const name = `${goName([type])}In`;
    const [refused, taken] = sets[type] ?? [[], []];
    return `
func TestB2${name}RefusesAValueOfAnotherType(t *testing.T) {
	for _, value := range []any{${refused.join(', ')}} {
		err := ${name}(value, "value")
		if failure, ok := err.(*${valueType}); !ok || failure.Kind() != "invalid_number" {
			t.Fatalf("B-2: %#v: %#v", value, err)
		}
	}
}

func TestB2${name}TakesAValueOfItsType(t *testing.T) {
	for _, value := range []any{${taken.join(', ')}} {
		if err := ${name}(value, "value"); err != nil {
			t.Fatalf("B-2: %#v: %v", value, err)
		}
	}
}
`;
  }).join('');
  const body = `${latin1}${map}${keyed}${aliases}${numbers}`;
  const std = ['math', 'reflect'].filter((p) => body.includes(`${p}.`)).map((p) => `\t"${p}"\n`).join('');
  return `${goHeader()}

//go:build polyspec_codec_test

package binding

import (
${std}\t"testing"
)
${body}`;
}
