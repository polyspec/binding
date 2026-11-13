// The generated Go tests of the Go binding (G-5), run by go test against the static library. The tests of a module
// are in its package (they read the handle of an instance for B-5c): B-3 and B-8 (a text that is not UTF-8, a latin1
// rune above U+00FF), T-2 (a key of a kind that the contract does not list), T-6 (a value that is not one of the
// constants), U-2 (a call without an argument with a default is the call with its default), U-7 (a kind of an alias
// comes up through a member), B-4 (every contract case that raises: the exact error type of E-2 and E-7, the kind, the
// status and the errno), GN-13e (every case that does not raise, with its result), K-2 (a nil callback, the error of a
// callback), N-4 (the text of a stringify), B-5c (a poisoned instance, an instance at two places) and GN-6ae (a nil
// func, the error and the panic of a func, the function fixture of a case, raises "callback" and the calls of after).
// The cases that arm faults (G-5) have the build tag polyspec_fault_test and the poison tests polyspec_panic_test.
//
// What the Go types decide is no test of a call: B-2 and T-7 (a uint64 holds no -1, NaN or fraction, a []byte no other
// type), except the range of an int and a uint (GN-12a), which B-2 tests with 2^53 and -2^53; the B-2 values of another
// Go type reach the conversion of each number type through the functions of codec-test (GN-13g),
// G-7 (a call with a missing, extra or unknown argument does not compile), U-2 null as a value (nil is the absent
// value), T-1 (a source is one []byte, so a text and its bytes are the same argument), and the K-2 result of another
// type (a method of the interface returns its declared type).

import type { Member, Type, Unit } from '../contract.ts';
import { defaultCaseValue } from './defaults.ts';
import { countsThrownGo, numberTypes } from './go_rust.ts';
import {
  type GoScope, callbackOf, callablesOf, categoryType, goBytes, goErrorTypes, goHeader, goImport, goImportBlock, goMemberName, goName,
  goPackage, goParam, goResultCount, goString, goTupleArray, goType, nilAbsent, keptField, ownerCall, ownerType,
} from './go.ts';
import {
  type Arg, type CallbackUnit, type Fn, type Model, type ObjectClass, Unsupported, aliasOf, aliasesWithKinds, cleanupWarning, errorUnitOfKind, factoryOf, heldParam, kindText, langName, poisoned, objectUnit, places, pointName, pointed, unitOf, variantOf, interfaceOf, implementorsOf, type KeptClass, type ValueAlias,
  nativeRoundTrip,
  callsCode,
  machineFunction,
} from './model.ts';
import {
  type Fixture, type RaisingCase, type Receiver, aliasCases, mapEntries, caseKey, casePascal, casePathOf, checkCaseNames, comparableResult, expectedErrno, fixtureOf, fixturesOf, implementerInstance, instanceOf, interfaceInstance, isInstanceValue, pairsReceiver, valueClassReceiver, raisingCases, resultCases, sampleReceiver, stringCases, type After, FIXTURE_RAISED, argsOf, callbackCases, memberById, raisesException, keptOf, type ForeignStep, foreignSteps,
} from './samples.ts';

interface Values {
  model: Model;
  module: string;
  scope: GoScope;
  usesPtr: boolean;
  // GN-6aa: the callback units whose fixture a case value inside another value makes.
  fixtures: Set<CallbackUnit>;
  // GN-6z: the statement that ends every func of a function type that the values of a test give, in the place of its
  // fixture: the test of the error or of the panic of a func that the core kept in an earlier call.
  keptEnd?: (returns: Type) => string;
}

// The statements of a test before its call: the instances that it makes (GN-13f), each checked.
class Body {
  lines: string[] = [];
  // GN-13f: whether a call of then of an instance value of the body arms faults, so the test goes with the cases that
  // arm faults and locks its goroutine to its thread.
  armed = false;
  // GN-6z: the fixtures of the funcs of a function type that the body made, which the test reads after its call.
  functions: string[] = [];
  // The count of the locals of a test, which the bodies of its funcs share, so that no local has the name of another.
  private readonly counter: { next: number };
  constructor(counter: { next: number } = { next: 0 }) {
    this.counter = counter;
  }
  fresh(prefix = 'made'): string {
    return `${prefix}${this.counter.next++}`;
  }
  // GN-6ae: the statements of a block inside the test: the body of a func, or the block of a call of after.
  child(): Body {
    return new Body(this.counter);
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
  // GN-15e: a pointer whose nil is no value of its type is its own optional.
  if (nilAbsent(v.model, type)) return inner;
  v.usesPtr = true;
  if (aliasOf(v.model, type) !== undefined) return `ptr[any](${inner})`;
  // GN-6v, GN-6aa: a pointer to the interface of a variant or of a callback, not to the struct of the case or of the
  // fixture.
  return variantOf(v.model, type) !== undefined || callbackOf(v.model, type) !== undefined || interfaceOf(v.model, type) !== undefined ? `ptr[${typeName(v, type)}](${inner})` : `ptr(${typed(type, inner)})`;
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

// A map or a keyed map of a test: a local that statements fill, because gofmt keeps a function literal on one line
// only while it is short. sink takes the statements, and each of sets is the arguments of one Set.
function mapLocal(b: Body, sink: string[], type: string, sets: string[]): string {
  const local = b.fresh('entries');
  sink.push(`${local} := &${type}{}`, ...sets.map((set) => `${local}.Set(${set})`));
  return local;
}

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
    // GN-6y: a path of a case is relative to the directory of the test.
    if (type === 'path') return `casePath(t, ${goString(casePathOf(json))})`;
    throw new Unsupported(`no Go case value of the type ${type}`);
  }
  // GN-6ae: a function is its fixture, a func of the test, and a passthrough is a value of GN-13.
  if ('function' in type) return machineFunction(type) ? functionValue(v, b, type.function, json) : keptFunctionValue(v, b, type.function, json);
  if ('passthrough' in type) return aliasValue(v.model, b, undefined, json, 'a passthrough');
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
    const sets = (json as [unknown, unknown][]).map(([key, item]) => `${goKey(key)}, ${value(v, b, type.keyed_map, item)}`);
    return mapLocal(b, b.lines, `binding.KeyedMap[${typeName(v, type.keyed_map)}]`, sets);
  }
  if ('map' in type) {
    const sets = mapEntries(json).map(([key, item]) => `${goString(key)}, ${value(v, b, type.map, item)}`);
    return mapLocal(b, b.lines, `binding.Map[${typeName(v, type.map)}]`, sets);
  }
  const alias = aliasOf(v.model, type);
  // GN-6x, GN-13b: a value of a value class of another repository is an instance of the owner's class.
  if (alias?.library !== undefined && alias.unit.kind === 'class') return foreignMade(v, b, alias, json);
  if (alias !== undefined) return aliasValue(v.model, b, alias.unit, json, `the alias ${alias.unit.id}`);
  // GN-13f, GN-6w: an instance value of a class that implements a callback interface stands for the callback.
  const implemented = callbackOf(v.model, type);
  if (implemented !== undefined && isInstanceValue(json)) return made(v, b, implementerInstance(v.model, implemented.unit, json));
  // GN-13f, GN-6ap: a value of a generated interface is an instance value of a class that implements it.
  const iface = interfaceOf(v.model, type);
  if (iface !== undefined) return made(v, b, interfaceInstance(v.model, iface, json));
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
  // GN-6aa: a callback value inside another value is a fixture of the body, whose calls the test does not read.
  const callback = v.model.callbacks.find((c) => c.unit === unit);
  if (callback !== undefined && unit !== undefined && typeof json === 'object' && 'callback' in json) {
    v.fixtures.add(callback);
    return fixtureLines(v, b, fixtureOf(v.model, unit, json, 'a case value'), b.fresh('fixture'));
  }
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
      return `${goName(f.name)}: ${!pointed(f) || fields[key] === null ? inner : pointerTo(v, f.type, inner)}`;
    }).join(', ')}}`;
  }
  throw new Unsupported(`no Go case value of the type ${JSON.stringify(type)}`);
}

// GN-6x, GN-13b: a case value of a value class of another repository, made by the functions of the Go module of its
// owner that its out rows name, each result a local of the test whose error fails it: the function of the kind on the
// content of the case, on the values of a list, on one value n times, or on an instance of the class that the row
// fills, which its constructor makes and whose method takes each [key, value] pair.
function foreignMade(v: Values, b: Body, alias: ValueAlias, json: unknown): string {
  const record = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined;
  const sort = record?.['host'];
  if (typeof sort === 'string' && Object.hasOwn(GO_HOST_VALUES, sort)) return GO_HOST_VALUES[sort as keyof typeof GO_HOST_VALUES];
  const owner = alias.owner;
  if (owner === undefined) throw new Unsupported(`${alias.unit.id}: no owner contract of the value class (GN-6x)`);
  const named = (unit: Unit): string => {
    const type = ownerType(owner, unit);
    (v.scope.foreignImports ??= new Map()).set(type.path, type.pkg);
    return type.name;
  };
  const cls = named(alias.unit);
  // The function of a member of the owner gives its result, when the member returns one, and its error.
  const results = (member: Member): number => (member.kind !== 'constructor' && (member.returns === undefined || member.returns === 'none') ? 0 : 1);
  const content = (step: Extract<ForeignStep, { form: 'content' }>): string => {
    if (step.type === undefined) return '';
    if (step.type === 'text') return textValue(step.held);
    if (step.type === 'bool') return String(step.held === true);
    if (typeof step.type === 'object' && 'list' in step.type && step.type.list === 'uint') return `[]uint64{${(step.held as number[]).map(String).join(', ')}}`;
    throw new Unsupported(`${step.make.id} takes ${JSON.stringify(step.type)}, the content of a kind that the Go test does not write (GN-6x)`);
  };
  const write = (step: ForeignStep): string => {
    if (step.form === 'content') return b.bind(ownerCall(owner, alias.unit, step.make, content(step)), 1, 'GN-13')[0] ?? '';
    if (step.form === 'list') {
      const items = step.items.map(write);
      return b.bind(ownerCall(owner, alias.unit, step.make, `[]*${cls}{${items.join(', ')}}`), 1, 'GN-13')[0] ?? '';
    }
    if (step.form === 'repeat') {
      const inner = b.fresh();
      const next = b.fresh();
      const error = b.fresh('failure');
      b.lines.push(
        `${inner} := ${write(step.inner)}`,
        `for range ${step.repeat} {`,
        `\t${next}, ${error} := ${ownerCall(owner, alias.unit, step.make, `[]*${cls}{${inner}}`)}`,
        `\tif ${error} != nil {`,
        `\t\tt.Fatalf("GN-13: %v", ${error})`,
        '\t}',
        `\t${inner} = ${next}`,
        '}',
      );
      return inner;
    }
    named(step.map);
    const filled = b.bind(ownerCall(owner, step.map, step.construct, ''), 1, 'GN-13')[0] ?? '';
    for (const [key, item] of step.pairs) {
      const k = write(key);
      const i = write(item);
      const error = b.fresh('failure');
      b.lines.push(`${[...Array.from({ length: results(step.insert) }, () => '_'), error].join(', ')} := ${ownerCall(owner, step.map, step.insert, `${k}, ${i}`, filled)}`, `if ${error} != nil {`, `\tt.Fatalf("GN-13: %v", ${error})`, '}');
    }
    return b.bind(ownerCall(owner, alias.unit, step.make, filled), 1, 'GN-13')[0] ?? '';
  };
  return write(foreignSteps(alias, 'go', json, `the class ${alias.unit.id} of ${alias.library ?? ''}`));
}

// G-5: the Go column of the closed table of the values of a language that are no value of a value type (HOST_VALUES).
const GO_HOST_VALUES = { callable: 'func() {}', date: 'time.Unix(0, 0).UTC()', object: 'struct{}{}' } as const;

// GN-13: a value of a value type, {"kind": <value kind>, "value": ...}, as the Go value of the built-in form of the kind:
// nil, bool, int64, float64, string, []byte, []any, and a map[string]any, or a *KeyedMap[any] for a map whose keys are
// not all texts or whose Go form is keyed_map.
function aliasValue(model: Model, b: Body, unit: Unit | undefined, json: unknown, where: string): string {
  const making: Making = { b, made: [], fills: [], references: new Map(), objects: new Map() };
  const text = aliasPart(model, unit, json, where, making);
  // GN-13: the instances of the value classes are made first and then filled, as statements of the test, so every
  // place of an id is the same pointer and a cycle is made.
  b.lines.push(...making.made, ...making.fills);
  return text;
}

// GN-13: what a case value makes before it is used: the instances of its objects and references, in the order of
// their first places, the statements that fill them, and the local of each id.
interface Making {
  b: Body;
  made: string[];
  fills: string[];
  references: Map<number, string>;
  objects: Map<number, string>;
}

// The id of a reference or of an object of a case value (G-5).
function idOf(raw: unknown, where: string): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) throw new Error(`an id of ${where} is a number of at least 0, not ${JSON.stringify(raw)}`);
  return raw;
}

function aliasPart(model: Model, unit: Unit | undefined, json: unknown, where: string, making: Making): string {
  const record = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined;
  // G-5: a value of the language that is no value of the value type, {"host": <sort>} of the closed table.
  const sort = record?.['host'];
  if (typeof sort === 'string' && Object.hasOwn(GO_HOST_VALUES, sort)) return GO_HOST_VALUES[sort as keyof typeof GO_HOST_VALUES];
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
    const inner = aliasPart(model, unit, held, where, making);
    const local = making.b.fresh('list');
    making.fills.push(`var ${local} any = ${inner}`, `for range ${repeat} {`, `\t${local} = []any{${local}}`, '}');
    return local;
  }
  if (kind === 'list' && Array.isArray(held)) return `[]any{${held.map((item) => aliasPart(model, unit, item, where, making)).join(', ')}}`;
  if (kind === 'map' && Array.isArray(held)) {
    const entries = held as [unknown, unknown][];
    const keyed = (unit?.out ?? []).some((row) => row.kind === 'map' && row.make['go'] === 'keyed_map') || entries.some(([key]) => typeof key !== 'string');
    if (keyed) {
      const sets = entries.map(([key, item]) => `${goKey(key)}, ${aliasPart(model, unit, item, where, making)}`);
      return mapLocal(making.b, making.fills, 'binding.KeyedMap[any]', sets);
    }
    return `map[string]any{${entries.map(([key, item]) => `${goString(String(key))}: ${aliasPart(model, unit, item, where, making)}`).join(', ')}}`;
  }
  // GN-6af, GN-15c: an object is an instance of the value class that keeps a keyed map, and a reference one of the
  // class that keeps one value. The constructor makes each without content, and a statement fills it after it is
  // made, so no constructor judges the instances inside it again.
  const construct = (cls: KeptClass): string => `must(binding.New${goName(cls.unit.name)}(nil))`;
  const access = (cls: KeptClass): string => {
    const [field] = cls.fields;
    if (field === undefined) throw new Unsupported(`${cls.unit.id} keeps no value (GN-6af)`);
    return field.writable ? keptField(field) : `${goName(field.name)}()`;
  };
  if (kind === 'object') {
    const cls = keptOf(model, 'entries', where);
    const key = access(cls);
    if (record['repeat'] !== undefined) {
      const repeat = record['repeat'];
      if (typeof repeat !== 'number' || !Number.isSafeInteger(repeat) || repeat < 1 || Object.keys(record).length !== 4 || !('key' in record)) throw new Error(`a case value of ${where} is {"kind": "object", "repeat": <n of at least 1>, "key": <key>, "value": <value>}, not ${JSON.stringify(json)}`);
      const k = goKey(record['key']);
      const top = making.b.fresh('object');
      const at = making.b.fresh('object');
      making.made.push(`${top} := ${construct(cls)}`);
      const inner = aliasPart(model, unit, held, where, making);
      making.fills.push(`${at} := ${top}`, `for range ${repeat - 1} {`, `\tnext := ${construct(cls)}`, `\t${at}.${key}.Set(${k}, next)`, `\t${at} = next`, '}', `${at}.${key}.Set(${k}, ${inner})`);
      return top;
    }
    const filled = (local: string): string => {
      making.made.push(`${local} := ${construct(cls)}`);
      if (!Array.isArray(held)) throw new Error(`a case value of ${where} is an object of [key, value] pairs, not ${JSON.stringify(held)}`);
      for (const [entryKey, item] of held as [unknown, unknown][]) making.fills.push(`${local}.${key}.Set(${goKey(entryKey)}, ${aliasPart(model, unit, item, where, making)})`);
      return local;
    };
    if (record['id'] !== undefined) {
      const id = idOf(record['id'], where);
      const known = making.objects.get(id);
      if (!('value' in record)) {
        if (known === undefined) throw new Error(`a case value of ${where} names the object ${id} before its first place (G-5)`);
        return known;
      }
      if (known !== undefined) throw new Error(`a case value of ${where} gives the value of the object ${id} at two places (G-5)`);
      const local = making.b.fresh('object');
      making.objects.set(id, local);
      return filled(local);
    }
    return filled(making.b.fresh('object'));
  }
  if (kind === 'reference' && typeof held === 'object' && held !== null && !Array.isArray(held)) {
    const ref = held as Record<string, unknown>;
    const id = idOf(ref['id'], where);
    const known = making.references.get(id);
    if (!('value' in ref)) {
      if (known === undefined) throw new Error(`a case value of ${where} names the reference ${id} before its first place (G-5)`);
      return known;
    }
    if (known !== undefined) throw new Error(`a case value of ${where} gives the value of the reference ${id} at two places (G-5)`);
    const cls = keptOf(model, 'value', where);
    const [field] = cls.fields;
    if (field === undefined || !field.writable) throw new Unsupported(`a case value of ${where} sets the value of ${cls.unit.id}, whose property is not writable (GN-6af)`);
    const local = making.b.fresh('reference');
    making.references.set(id, local);
    making.made.push(`${local} := ${construct(cls)}`);
    making.fills.push(`${local}.${keptField(field)} = ${aliasPart(model, unit, ref['value'], where, making)}`);
    return local;
  }
  throw new Unsupported(`a case value of the kind ${kind} of ${where} is not generated for Go yet (GN-13)`);
}

// GN-6ae, GN-6z: the head of a func literal of a function type, its parameters named by `name`: the function of a
// machine returns any value and an error, and a function that the core may keep its result and an error, or the error
// alone for none.
type FunctionType = Extract<Type, { function: unknown }>['function'];
const funcHead = (v: Values, type: FunctionType, name: (index: number) => string): string => {
  const params = type.parameters.map((part, i) => `${name(i)} ${typeName(v, part)}`).join(', ');
  if (machineFunction({ function: type })) return `func(${params}) (any, error)`;
  return type.returns === 'none' ? `func(${params}) error` : `func(${params}) (${typeName(v, type.returns)}, error)`;
};

// GN-6z: the statement that ends a func of a function type that the core may keep with an error, with a zero result.
const keptReturn = (v: Values, returns: Type, err: string): string =>
  (returns === 'none' ? `return ${err}` : `var zero ${typeName(v, returns)}; return zero, ${err}`);

// GN-6z: the func of a function value of a case, {"function": [<row>]} (CK-22 has judged the form): a row is
// {"args": {"0": ..., "1": ...}} by position, with "result" (absent for a return of none) and "once". The func answers
// by a fixture of one member, the call itself, which records every call; a call that no row answers returns an error.
function keptFunctionValue(v: Values, b: Body, type: FunctionType, json: unknown): string {
  const head = funcHead(v, type, (i) => `arg${i}`);
  if (v.keptEnd !== undefined) {
    const name = b.fresh('call');
    b.lines.push(`${name} := ${funcHead(v, type, () => '_')} {`, ...v.keptEnd(type.returns).split('; ').map((line) => `\t${line}`), '}');
    return name;
  }
  const rows = (json as { function?: unknown } | null)?.function;
  if (!Array.isArray(rows)) throw new Unsupported(`a case value of a function type is {"function": [<row>]}, not ${JSON.stringify(json)} (GN-6z)`);
  const texts = (rows as Record<string, unknown>[]).map((row) => {
    const given = (row['args'] ?? {}) as Record<string, unknown>;
    const args = type.parameters.map((part, i) => {
      if (!(String(i) in given)) throw new Unsupported(`a row of a function value gives no argument ${String(i)} (G-5)`);
      return typed(part, value(v, b, part, given[String(i)] ?? null));
    });
    const result = row['result'] === undefined || row['result'] === null || type.returns === 'none' ? 'nil' : typed(type.returns, value(v, b, type.returns, row['result']));
    return `{member: "call", args: []any{${args.join(', ')}}, result: ${result}, once: ${String(row['once'] === true)}}`;
  });
  const fixture = b.fresh('function');
  b.lines.push(`${fixture} := &fixture{rows: []fixtureRow{${texts.join(', ')}}}`);
  b.functions.push(fixture);
  const answer = `${fixture}.answer(${['"call"', ...type.parameters.map((_part, i) => `arg${i}`)].join(', ')})`;
  const name = b.fresh('call');
  b.lines.push(
    `${name} := ${head} {`,
    ...(type.returns === 'none' ? [`\t_, err := ${answer}`, '\treturn err'] : [`\tresult, err := ${answer}`, `\tvalue, _ := result.(${typeName(v, type.returns)})`, '\treturn value, err']),
    '}',
  );
  return name;
}

// GN-6z: after the call of a case, no func of a function type of the case was called in a way that no row answers.
const functionChecks = (b: Body): string[] =>
  b.functions.flatMap((name) => [`if len(${name}.unexpected) != 0 {`, `\tt.Fatalf("G-5: calls that no row answers: %v", ${name}.unexpected)`, '}']);

// GN-6ae (CK-22): the statements of a call of a member on a receiver whose results are compared with the value that a
// case names, when it names one: `failed` is the statement for an error of the call, and `differs` the statement
// for a result that is not the value. A value that the Go test does not compare refuses the call.
function comparedCall(v: Values, a: Body, fn: Fn, receiver: string, args: ReadonlyMap<Arg, unknown>, expected: { value: unknown } | undefined, failed: string, differs: (index: number) => string): string[] {
  const given = callArgs(v, a, fn, (arg) => caseValue(v, a, arg, args));
  const parts = fn.returns === 'none' || fn.returns === 'never' ? [] : typeof fn.returns === 'object' && 'tuple' in fn.returns ? fn.returns.tuple : [fn.returns];
  const expects = expected !== undefined && parts.length > 0;
  const absent = expected?.value === null && typeof fn.returns === 'object' && 'optional' in fn.returns;
  const reason = expects && !absent ? comparableResult(v.model, fn.returns) : undefined;
  if (reason !== undefined) throw new Unsupported(reason);
  const compared = !expects ? [] : parts.flatMap((type, i) => {
    const want = parts.length === 1 ? expected.value : (expected.value as unknown[] | null)?.[i];
    return [`if want := (${typeName(v, type)})(${value(v, a, type, want ?? null)}); !reflect.DeepEqual(value${i}, want) {`, `\t${differs(i)}`, '}'];
  });
  return [...a.lines, callLine(fn, invoke(v, fn, given, receiver), expects ? parts.map((_, i) => `value${i}`) : undefined), 'if err != nil {', `\t${failed}`, '}', ...compared];
}

// GN-6ae: the func of a function fixture, {"function": {"calls": [<step>], "result" | "raise"}} (CK-22 has judged the
// form), as a local of the body: each step calls a method on the argument at its position and returns its error, and
// the func then returns its result, a value of GN-13, or the error `raised` that the test holds. An argument of a
// function type of a step is a func inside the func.
function functionValue(v: Values, b: Body, type: Extract<Type, { function: unknown }>['function'], json: unknown): string {
  const fixture = (json as { function?: Record<string, unknown> } | null)?.function;
  if (typeof fixture !== 'object' || fixture === null) throw new Unsupported(`a case value of a function type is a function fixture, not ${JSON.stringify(json)} (GN-6ae)`);
  const inner = b.child();
  for (const step of Array.isArray(fixture['calls']) ? (fixture['calls'] as Record<string, unknown>[]) : []) {
    const fn = memberById(v.model, String(step['call']));
    const args = fn === undefined ? undefined : argsOf(fn, (step['args'] ?? {}) as Record<string, unknown>);
    if (fn === undefined || args === undefined) throw new Unsupported(`a step of a function fixture calls ${String(step['call'])} with ${JSON.stringify(step['args'])}, which are not the parameters of a member (GN-6ae)`);
    const on = `arg${Number(step['on'])}`;
    if (Object.hasOwn(step, 'result')) {
      // CK-22: a step that names a result returns an error that names its member when the call returned another value.
      const lines = comparedCall(v, inner.child(), fn, on, args, { value: step['result'] }, 'return nil, err', (i) => `return nil, fmt.Errorf("GN-6ae: ${fn.member.id} returned %#v, not %#v", value${i}, want)`);
      inner.lines.push('{', ...lines.map((line) => `\t${line}`), '}');
      continue;
    }
    const call = invoke(v, fn, callArgs(v, inner, fn, (arg) => caseValue(v, inner, arg, args)), on);
    inner.lines.push(`if ${'_, '.repeat(goResultCount(fn))}err := ${call}; err != nil {`, '\treturn nil, err', '}');
  }
  const raise = fixture['raise'];
  if (raise === undefined) inner.lines.push(`return ${value(v, inner, type.returns, fixture['result'] ?? null)}, nil`);
  else if (raise === 'exception') inner.lines.push('return nil, raised');
  else throw new Unsupported(`a function fixture raises the error unit ${String((raise as { error?: unknown }).error)}, which is not generated for Go yet (GN-6ae, GN-13)`);
  const name = b.fresh('function');
  b.lines.push(`${name} := ${funcHead(v, type, (i) => `arg${i}`)} {`, ...inner.lines.map((line) => `\t${line}`), '}');
  return name;
}

// A value of the type that the binding converts without failing; rich: a list has one item, so that a member that
// calls a callback per item calls it (K-2).
function placeholder(v: Values, b: Body, type: Type, rich = false): string {
  if (typeof type === 'string') return ({ bool: 'false', text: '"a"', latin1: '"a"', bytes: 'nil', source: '[]byte("a")', path: '"a"' } as Record<string, string>)[type] ?? '0';
  // GN-6ae: a func that returns no value.
  if ('function' in type) {
    if (machineFunction(type)) return `${funcHead(v, type.function, () => '_')} { return nil, nil }`;
    // GN-6z: a func that returns a value of its result type.
    return `${funcHead(v, type.function, () => '_')} { return ${type.function.returns === 'none' ? '' : `${placeholder(v, b, type.function.returns, rich)}, `}nil }`;
  }
  if ('list' in type) return rich ? `${typeName(v, type)}{${placeholder(v, b, type.list, rich)}}` : 'nil';
  if ('optional' in type || 'map' in type || 'keyed_map' in type) return 'nil';
  if ('tuple' in type) return `${typeName(v, type)}{}`;
  const callback = callbackOf(v.model, type);
  if (callback !== undefined) return `raising${goName(callback.unit.name)}{}`;
  // U-7: the value of the first out row of a built-in form of Go.
  const alias = aliasOf(v.model, type);
  // GN-6x: a value of a value class of another repository is the value that its out row of the kind null makes.
  if (alias?.library !== undefined && alias.unit.kind === 'class' && (alias.unit.out ?? []).some((row) => row.kind === 'null')) return foreignMade(v, b, alias, { kind: 'null' });
  if (alias !== undefined) {
    const forms: Record<string, string> = { null: 'nil', bool: 'false', int: 'int64(0)', float: 'float64(0)', text: '"a"', bytes: '[]byte{}', list: '[]any{}', map: 'map[string]any{}' };
    for (const row of alias.unit.out ?? []) {
      const make = row.make['go'];
      const found = typeof make === 'string' ? forms[make] : undefined;
      if (found !== undefined) return found;
    }
    return 'nil';
  }
  // GN-6ap: a value of a generated interface is an instance of the first class that implements it and has a factory.
  const iface = interfaceOf(v.model, type);
  if (iface !== undefined) {
    const first = implementorsOf(v.model, iface).find((o) => factoryOf(v.model, o) !== undefined);
    if (first === undefined) throw new Unsupported(`no placeholder of the generated interface ${iface.id}: no class that implements it has a constructor or static member that makes it (GN-6ap)`);
    return placeholder(v, b, { unit: first.unit.id }, rich);
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

// GN-6af: the value class without core_type of a member.
const keptOwner = (model: Model, fn: Fn): KeptClass | undefined => model.kept.find((k) => k.members.includes(fn) || k.constructor === fn);

// The call of a member as a Go expression: a function, a constructor or a static member by its name, any other member
// on its receiver. A stringify or a to_json is called by its unexported form, which returns its error.
function invoke(v: Values, fn: Fn, args: string[], receiver: string): string {
  const name = fn.special === 'stringify' ? 'stringify' : fn.special === 'to_json' ? 'toJSON' : goMemberName(fn);
  // GN-15c: a property of a value class without core_type is a field, or a method that returns no error; kept gives it
  // as the result of a call that cannot fail.
  const field = keptOwner(v.model, fn)?.fields.find((f) => f.property === fn.member);
  if (field !== undefined) return `kept(${receiver}.${field.writable ? keptField(field) : `${goName(field.name)}()`})`;
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
        return `${goName(f.name)}: ${!pointed(f) || text === 'nil' ? text : pointerTo(v, f.type, text)}`;
      });
      return `${typeName(v, p.type)}{${fields.join(', ')}}`;
    }
    const arg = fn.args.find((a) => !a.field && a.name === p.name);
    const text = arg === undefined ? undefined : given(arg);
    if (text === undefined) return arg?.default === undefined ? placeholder(v, b, p.type) : 'nil';
    // GN-15c: a parameter with a default of the constructor of a value class without core_type has no pointer form.
    if (keptOwner(v.model, fn) !== undefined) return text;
    return arg === undefined || !pointed(arg) || text === 'nil' ? text : pointerTo(v, p.type, text);
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
  for (const [i, step] of (r.then ?? []).entries()) {
    const call = invoke(v, step.fn, callArgs(v, b, step.fn, (arg) => caseValue(v, b, arg, step.args)), step.on === 'receiver' ? on : local);
    // G-5: the faults of the call are armed for its member just before it, and every one must have fired after it.
    const armed = step.faults === undefined ? undefined : b.fresh('armed');
    if (armed !== undefined && step.faults !== undefined) {
      b.armed = true;
      const failed = b.fresh('armErr');
      b.lines.push(`${armed}, ${failed} := binding.ArmFaults(${goString(step.fn.member.id)}, ${goString(step.faults)})`, `if ${failed} != nil {`, `\tt.Fatalf("G-5: %v", ${failed})`, '}');
    }
    const error = b.fresh('failure');
    b.lines.push(`${[...Array.from({ length: goResultCount(step.fn) }, () => '_'), error].join(', ')} := ${call}`);
    if (step.raises === undefined) {
      b.lines.push(`if ${error} != nil {`, `\tt.Fatalf("GN-13f: %v", ${error})`, '}');
    } else {
      // GN-13f: a call of then that the case expects to fail with a kind fails with it, and the test goes on.
      b.lines.push(`if kinded, ok := ${error}.(interface{ Kind() string }); !ok || kinded.Kind() != ${goString(step.raises)} {`, `\tt.Fatalf("GN-13f: %#v is not of kind ${step.raises}", ${error})`, '}');
    }
    if (armed !== undefined) {
      const left = b.fresh('left');
      const leftErr = b.fresh('leftErr');
      b.lines.push(`if ${left}, ${leftErr} := binding.FaultLeft(${armed}); ${leftErr} != nil || len(${left}) != 0 {`, `\tt.Fatalf("G-5: the faults of then ${i} %v did not fire (%v)", ${left}, ${leftErr})`, '}');
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

// GN-6ae (CK-22): the calls of after of a case, each in a block of its own on the receiver of the case, with the
// result that the case names.
function afterLines(v: Values, b: Body, fn: Fn, id: string, after: After[] | undefined, receiver: string): string[] {
  return (after ?? []).flatMap((call) => {
    try {
      const lines = comparedCall(v, b.child(), call.fn, receiver, call.args, call.result === undefined ? undefined : { value: call.result }, 't.Fatalf("GN-6ae: after: %v", err)', (i) => `t.Fatalf("GN-6ae: after: %#v is not %#v", value${i}, want)`);
      return ['{', ...lines.map((line) => `\t${line}`), '}'];
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      return [`t.Fatal(${goString(`the case ${id} of ${fn.member.id}: after ${call.fn.member.id}: ${error.message}`)})`];
    }
  });
}

// GN-6ae: the error that a function fixture of the case returns, which the test holds before its funcs.
const raisedLine = (args: ReadonlyMap<Arg, unknown>): string[] =>
  ([...args.values()].some(raisesException) ? [`raised := errors.New(${goString(FIXTURE_RAISED)})`] : []);

// G-5: the fixture of a callback, which answers the calls of the core by the rows of a case.
function fixtureLines(v: Values, b: Body, fixture: Omit<Fixture, 'arg'>, name: string): string {
  const members = fixture.unit.members ?? [];
  const memberName = (i: number): string => goString(langName('go', members[i]?.name ?? [], 'callable'));
  const argsOf = (member: number, args: unknown[]): string => `[]any{${(members[member]?.parameters ?? []).map((p, i) => typed(p.type, value(v, b, p.type, args[i] ?? null))).join(', ')}}`;
  const rows = fixture.rows.map((row) => {
    const returns = members[row.member]?.returns ?? 'none';
    const result = row.result === null || returns === 'none' ? 'nil' : typed(returns, value(v, b, returns, row.result));
    // GN-13: a raise row returns the error unit with its kind, as Go code makes one.
    const raise = row.raise === undefined ? '' : `, raise: binding.Raised${goName(row.raise.unit.name)}(${goString(row.raise.kind)}, ${goString(`G-5: ${row.raise.kind}`)})`;
    return `{member: ${memberName(row.member)}, args: ${argsOf(row.member, row.args)}, result: ${result}, once: ${String(row.once)}${raise}}`;
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
      // reflect.DeepEqual tells a nil slice from an empty one, so no expected call is read as the length 0.
      if (calls.length === 0) lines.push(`if len(${name}.calls) != 0 {`, `\tt.Fatalf("G-5: the calls %v are not none", ${name}.calls)`, '}');
      else lines.push(`if want := [][]any{${calls.join(', ')}}; !reflect.DeepEqual(${name}.calls, want) {`, `\tt.Fatalf("G-5: the calls %v are not %v", ${name}.calls, want)`, '}');
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
  // GN-6ae: the tests of the build tag polyspec_thrown_count_test, and those that also arm faults.
  thrown: string[];
  thrownFault: string[];
  callbacks: Set<CallbackUnit>;
  // GN-6p: a B-10 test reads the warnings of the standard logger.
  warns?: boolean;
}

// GN-6ae: the lines that require, after the call of a case and the calls of its after, that the static library keeps
// nothing that was thrown.
const KEPT_NOTHING = ['if count, err := binding.ThrownCount(); err != nil || count != 0 {', '\tt.Fatalf("GN-6ae: %d values that were thrown are kept after the call (%v)", count, err)', '}'];

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

// Whether a type holds a value of a value alias of this contract.
function holdsAlias(model: Model, type: Type): boolean {
  if (typeof type === 'string') return false;
  if (aliasOf(model, type) !== undefined) return true;
  return [...('tuple' in type ? type.tuple : []), ...['list', 'optional', 'map', 'keyed_map'].flatMap((key) => (key in type ? [(type as Record<string, Type>)[key] as Type] : []))].some((inner) => holdsAlias(model, inner));
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
  // GN-15c: a member of a value class without core_type runs its cases.
  const ofKept = keptOwner(model, fn) !== undefined;
  for (const arg of reachable && fn.special === undefined && !ofKept ? fn.args : []) {
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
    // GN-6y: a path with a NUL byte is kind invalid_path.
    if (base === 'path') single('T-1', `refuses a nul byte in ${argName}`, arg, () => wrap('"a\\x00b"'), expectKind(types['value'] ?? '', 'invalid_path', 'T-1'));
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
        single('B-2', `refuses ${argName} with a key outside the safe integers`, arg, (b) => wrap(mapLocal(b, b.lines, `binding.KeyedMap[${typeName(v, keyedType.keyed_map)}]`, [`binding.IntKey(9007199254740992), ${placeholder(v, b, keyedType.keyed_map)}`])), expectKind(types['value'] ?? '', 'invalid_number', 'B-2'));
      }
      if (missing !== undefined) {
        const key = { int: 'binding.IntKey(1)', bytes: 'binding.BytesKey([]byte("b"))', text: 'binding.TextKey("t")' }[missing];
        single('T-2', `refuses ${argName} with a ${missing} key`, arg, (b) => wrap(mapLocal(b, b.lines, `binding.KeyedMap[${typeName(v, keyedType.keyed_map)}]`, [`${key}, ${placeholder(v, b, keyedType.keyed_map)}`])), expectKind(types['type'] ?? '', 'invalid_argument_type', 'T-2'));
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
    if (kase !== undefined) single('U-7', `gives the kind of ${kase.alias.unit.id} in ${argName}`, arg, (b) => aliasValue(model, b, kase.alias.unit, kase.value, `the alias ${kase.alias.unit.id}`), expectKind(types[kase.category] ?? '', kase.kind, 'U-7'));
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
      // U-3 (GN-15b): a panic of a method of the callback is the panic of the call, with the same value, and the call
      // released its places: the member runs again on the same instance, and a member that writes it is not busy.
      const p = new Body();
      const again = sample === undefined ? '' : made(v, p, sample);
      const given = (text: string) => callArgs(v, p, fn, (a) => (a === arg ? text : a.default === undefined ? placeholder(v, p, a.type, true) : undefined));
      const panics = callLine(fn, invoke(v, fn, given(`panicking${goName(callback.unit.name)}{value: raised}`), again));
      const returns = callLine(fn, invoke(v, fn, given(`raising${goName(callback.unit.name)}{err: raised}`), again));
      const writer = fn.receiver === undefined ? undefined : model.objects.find((o) => o.members.includes(fn))?.members.find((m) => m.kind === 'method' && m.receiver === '&mut self' && m.special === undefined
        && m.args.every((a) => callbackOf(model, a.type) === undefined && !(typeof a.type === 'object' && 'function' in a.type)));
      const written = writer === undefined ? [] : [
        '{',
        `	${callLine(writer, invoke(v, writer, callArgs(v, p, writer, (a) => (a.default === undefined ? placeholder(v, p, a.type) : undefined)), again))}`,
        `	if failure, ok := err.(*liberrors.${types['busy'] ?? ''}); ok && failure.Kind() == "busy" {`,
        `		t.Fatalf("U-3: the panic of the callback left ${writer.member.id} busy: %v", err)`,
        '	}',
        '}',
      ];
      out.main.push(`
func TestU3${label}PanicsWithThePanicOf${testName(argName)}(t *testing.T) {
	raised := errors.New("raised by the callback")
${indent([
    ...p.lines,
    'func() {', '\tdefer func() {', '\t\tif value := recover(); value != any(raised) {', '\t\t\tt.Fatalf("U-3: %#v is not the panic of the callback", value)', '\t\t}', '\t}()',
    `\t${panics}`, '\tt.Fatalf("U-3: the call returned %v", err)', '}()',
    returns, 'if err != raised {', '\tt.Fatalf("U-3: %#v is not the error of the callback after its panic", err)', '}',
    ...written,
  ], 1)}
}`);
    }
    // GN-6ae: a nil func is kind invalid_callback; the error that a func returns is the error of the call, the same
    // value; and a panic of a func is the panic of the call, with the same value.
    if (typeof arg.type === 'object' && 'function' in arg.type && !machineFunction(arg.type)) {
      // GN-6z: a nil func is no function, kind invalid_argument_type. The error that the func returns is the error of
      // the call in which the core runs it, the same value, and its panic is the panic of that call: each is tested
      // with the arguments of a case in which the core calls the func, which a case with a row shows.
      const kept = arg.type.function;
      single('GN-6z', `refuses a nil ${argName}`, arg, () => 'nil', expectKind(types['type'] ?? '', 'invalid_argument_type', 'GN-6z'));
      const calling = resultCases(model, fn).find((k) => k.refused === undefined && (((k.args.get(arg) as { function?: unknown } | null | undefined)?.function as unknown[] | undefined)?.length ?? 0) > 0);
      const ends = (end: string): { lines: string[]; call: string } | string => {
        const b = new Body();
        return written(fn, calling?.id ?? '', () => {
          const receiver = calling?.receiver === undefined ? '' : made(v, b, calling.receiver);
          const args = callArgs(v, b, fn, (a) => {
            if (a !== arg) return caseValue(v, b, a, calling?.args ?? new Map());
            // A func of several lines, which gofmt keeps as it is written.
            const name = b.fresh('call');
            b.lines.push(`${name} := ${funcHead(v, kept, () => '_')} {`, ...end.split('; ').map((line) => `\t${line}`), '}');
            return name;
          });
          return { lines: b.lines, call: callLine(fn, invoke(v, fn, args, receiver)) };
        });
      };
      if (calling !== undefined) {
        const returned = ends(keptReturn(v, kept.returns, 'raised'));
        out.main.push(`
func TestGN6z${label}ReturnsTheErrorOf${testName(argName)}(t *testing.T) {
${indent(typeof returned === 'string' ? [`t.Fatal(${goString(returned)})`] : [`raised := errors.New(${goString(FIXTURE_RAISED)})`, ...returned.lines, returned.call, 'if err != raised {', '\tt.Fatalf("GN-6z: %#v is not the error of the function", err)', '}'], 1)}
}`);
        const panicked = ends('panic(raised)');
        out.main.push(`
func TestGN6z${label}PanicsWithThePanicOf${testName(argName)}(t *testing.T) {
${indent(typeof panicked === 'string' ? [`t.Fatal(${goString(panicked)})`] : [`raised := errors.New(${goString(FIXTURE_RAISED)})`, ...panicked.lines, 'defer func() {', '\tif value := recover(); value != any(raised) {', '\t\tt.Fatalf("GN-6z: %#v is not the panic of the function", value)', '\t}', '}()', panicked.call, 't.Fatalf("GN-6z: the call returned %v", err)'], 1)}
}`);
      }
    }
    if (machineFunction(arg.type)) {
      const head = funcHead(v, arg.type.function, () => '_');
      single('GN-6ae', `refuses a nil ${argName}`, arg, () => 'nil', expectKind(types['type'] ?? '', 'invalid_callback', 'GN-6ae'));
      const ends = (end: string): { lines: string[]; call: string } => {
        const b = new Body();
        const receiver = sample === undefined ? '' : made(v, b, sample);
        const args = callArgs(v, b, fn, (a) => (a === arg ? `${head} { ${end} }` : a.default === undefined ? placeholder(v, b, a.type) : undefined));
        return { lines: b.lines, call: callLine(fn, invoke(v, fn, args, receiver)) };
      };
      const returned = ends('return nil, raised');
      out.main.push(`
func TestGN6ae${label}ReturnsTheErrorOf${testName(argName)}(t *testing.T) {
	raised := errors.New(${goString(FIXTURE_RAISED)})
${indent([...returned.lines, returned.call, 'if err != raised {', '\tt.Fatalf("GN-6ae: %#v is not the error of the function", err)', '}'], 1)}
}`);
      const panicked = ends('panic(raised)');
      out.main.push(`
func TestGN6ae${label}PanicsWithThePanicOf${testName(argName)}(t *testing.T) {
	raised := errors.New(${goString(FIXTURE_RAISED)})
${indent([...panicked.lines, 'defer func() {', '\tif value := recover(); value != any(raised) {', '\t\tt.Fatalf("GN-6ae: %#v is not the panic of the function", value)', '\t}', '}()', panicked.call, 't.Fatalf("GN-6ae: the call returned %v", err)'], 1)}
}`);
    }
  }
  // U-2: the call that leaves an argument with a default out is the call that gives the default.
  const count = fn.special === undefined ? goResultCount(fn) : 0;
  const comparable = count === 1 && fn.kind !== 'iterate' && comparableResult(model, fn.returns) === undefined && fn.args.every((a) => callbackOf(model, a.type) === undefined);
  const base = resultCases(model, fn).find((k) => k.refused === undefined);
  const receiverOf = base?.receiver ?? sample;
  for (const arg of reachable && comparable && !ofKept && (fn.receiver === undefined || receiverOf !== undefined) ? fn.args : []) {
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
  // GN-6ae: a case of a member that takes a callback or a function runs again in a test of the build tag
  // polyspec_thrown_count_test, which reads the count of what was thrown after it.
  const counted = countsThrownGo(model) && callsCode(model, fn);
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
    const lines = [...raisedLine(kase.args), ...b.lines];
    if (kase.faults !== undefined || b.armed) lines.unshift('runtime.LockOSThread()', 'defer runtime.UnlockOSThread()');
    if (kase.faults !== undefined) {
      lines.push(`armed, armErr := binding.ArmFaults(${goString(fn.member.id)}, ${goString(kase.faults)})`, 'if armErr != nil {', '\tt.Fatalf("G-5: %v", armErr)', '}');
    }
    lines.push(callLine(fn, invoke(v, fn, args, receiver)), ...raisedLines(v, kase), ...fixtureChecks(fixtures, v, b), ...functionChecks(b), ...afterLines(v, b, fn, kase.id, kase.after, receiver));
    if (kase.faults !== undefined) lines.push('if left, leftErr := binding.FaultLeft(armed); leftErr != nil || len(left) != 0 {', '\tt.Fatalf("G-5: the faults %v did not fire (%v)", left, leftErr)', '}');
    (kase.faults === undefined && !b.armed ? out.main : out.fault).push(`
func TestB4${label}${testName(kase.id)}(t *testing.T) {
${indent(lines, 1)}
}`);
    if (counted) (kase.faults === undefined && !b.armed ? out.thrown : out.thrownFault).push(`
func TestB4${label}${testName(kase.id)}KeepsNothingThrown(t *testing.T) {
${indent([...lines, ...KEPT_NOTHING], 1)}
}`);
  }
  // GN-6ae: a case whose function fixture returns the error that the test holds gets the same error value.
  for (const kase of callbackCases(model, fn)) {
    const b = new Body();
    const call = written(fn, kase.id, () => {
      const receiver = kase.receiver === undefined ? '' : made(v, b, kase.receiver);
      return { receiver, args: callArgs(v, b, fn, (arg) => caseValue(v, b, arg, kase.args)) };
    });
    const lines = typeof call === 'string'
      ? [`t.Fatal(${goString(call)})`]
      : [
        `raised := errors.New(${goString(FIXTURE_RAISED)})`,
        ...b.lines,
        callLine(fn, invoke(v, fn, call.args, call.receiver)),
        'if err != raised {',
        '\tt.Fatalf("GN-6ae: %#v is not the error of the function", err)',
        '}',
        ...afterLines(v, b, fn, kase.id, kase.after, call.receiver),
      ];
    out.main.push(`
func TestGN6ae${label}${testName(kase.id)}(t *testing.T) {
${indent(lines, 1)}
}`);
    if (counted && typeof call !== 'string') (b.armed ? out.thrownFault : out.thrown).push(`
func TestGN6ae${label}${testName(kase.id)}KeepsNothingThrown(t *testing.T) {
${indent([...lines, ...KEPT_NOTHING], 1)}
}`);
  }
  // GN-6z: a case whose receiver was given a func in an earlier call, which the core kept, and whose member calls
  // language code that its receiver keeps (E-1c): the error that the kept func returns is the error of this later
  // call, the same value, and its panic is the panic of this call.
  const keepsFunc = (r: Receiver | undefined): boolean => r !== undefined && (keepsFunc(r.on)
    || (r.then ?? []).some((step) => [...step.args].some(([arg, given]) => typeof arg.type === 'object' && 'function' in arg.type && !machineFunction(arg.type) && (((given as { function?: unknown } | null)?.function as unknown[] | undefined)?.length ?? 0) > 0)));
  for (const kase of fn.failure ? resultCases(model, fn).filter((k) => k.refused === undefined && keepsFunc(k.receiver)) : []) {
    const later = (end: (returns: Type) => string): { lines: string[]; call: string; armed: boolean } | string => {
      const b = new Body();
      return written(fn, kase.id, () => {
        v.keptEnd = end;
        let receiver: string;
        try {
          receiver = kase.receiver === undefined ? '' : made(v, b, kase.receiver);
        } finally {
          delete v.keptEnd;
        }
        const args = callArgs(v, b, fn, (arg) => caseValue(v, b, arg, kase.args));
        return { lines: b.lines, call: callLine(fn, invoke(v, fn, args, receiver)), armed: b.armed };
      });
    };
    const returned = later((returns) => keptReturn(v, returns, 'raised'));
    const returnedLines = typeof returned === 'string'
      ? [`t.Fatal(${goString(returned)})`]
      : [...(returned.armed ? ['runtime.LockOSThread()', 'defer runtime.UnlockOSThread()'] : []), `raised := errors.New(${goString(FIXTURE_RAISED)})`, ...returned.lines, returned.call, 'if err != raised {', '\tt.Fatalf("GN-6z: %#v is not the error of the kept function", err)', '}'];
    const armed = typeof returned !== 'string' && returned.armed;
    (armed ? out.fault : out.main).push(`
func TestGN6z${label}${testName(kase.id)}ReturnsTheErrorOfTheKeptFunction(t *testing.T) {
${indent(returnedLines, 1)}
}`);
    // GN-6ae: the member takes no func, and its call ran one that returned an error, so the count is read after it.
    if (countsThrownGo(model) && typeof returned !== 'string') (armed ? out.thrownFault : out.thrown).push(`
func TestGN6z${label}${testName(kase.id)}ReturnsTheErrorOfTheKeptFunctionKeepsNothingThrown(t *testing.T) {
${indent([...returnedLines, ...KEPT_NOTHING], 1)}
}`);
    const panicked = later(() => 'panic(raised)');
    (armed ? out.fault : out.main).push(`
func TestGN6z${label}${testName(kase.id)}PanicsWithThePanicOfTheKeptFunction(t *testing.T) {
${indent(typeof panicked === 'string' ? [`t.Fatal(${goString(panicked)})`] : [...(panicked.armed ? ['runtime.LockOSThread()', 'defer runtime.UnlockOSThread()'] : []), `raised := errors.New(${goString(FIXTURE_RAISED)})`, ...panicked.lines, 'defer func() {', '\tif value := recover(); value != any(raised) {', '\t\tt.Fatalf("GN-6z: %#v is not the panic of the kept function", value)', '\t}', '}()', panicked.call, 't.Fatalf("GN-6z: the call returned %v", err)'], 1)}
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
          // GN-15c: a result that holds instances of value classes holds each pointer at the places of the case.
          const same = model.kept.length > 0 && holdsAlias(model, type) ? ` || places(value${i}) != places(want)` : '';
          return [`if want := (${typeName(v, type)})(${want}); !reflect.DeepEqual(value${i}, want)${same} {`, `\tt.Fatalf("GN-13e: %#v is not %#v", value${i}, want)`, '}'];
        });
      } catch (error) {
        if (!(error instanceof Unsupported)) throw error;
        refused = `${fn.member.id}: ${error.message} (GN-13e)`;
      }
    }
    const lines = refused === undefined
      ? [...(b.armed ? ['runtime.LockOSThread()', 'defer runtime.UnlockOSThread()'] : []), ...raisedLine(kase.args), ...b.lines, callLine(fn, invoke(v, fn, args, receiver), names), 'if err != nil {', '\tt.Fatalf("GN-13e: %v", err)', '}', ...compared, ...fixtureChecks(fixtures, v, b), ...functionChecks(b), ...afterLines(v, b, fn, kase.id, kase.after, receiver)]
      : [`t.Fatal(${goString(refused)})`];
    (b.armed && refused === undefined ? out.fault : out.main).push(`
func TestGN13e${label}${testName(kase.id)}(t *testing.T) {
${indent(lines, 1)}
}`);
    if (counted && refused === undefined) (b.armed ? out.thrownFault : out.thrown).push(`
func TestGN13e${label}${testName(kase.id)}KeepsNothingThrown(t *testing.T) {
${indent([...lines, ...KEPT_NOTHING], 1)}
}`);
  }
  // N-4: the text of a stringify is the result of its case.
  for (const kase of stringCases(model, fn)) {
    const b = new Body();
    const receiver = made(v, b, kase.receiver);
    if (b.armed) b.lines.unshift('runtime.LockOSThread()', 'defer runtime.UnlockOSThread()');
    (b.armed ? out.fault : out.main).push(`
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
    errno === null ? 'if _, ok := failure.Errno(); ok {' : `if errno, ok := failure.Errno(); !ok || errno != ${'symbol' in errno ? `int(syscall.${errno.symbol})` : String(errno.value)} {`,
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
    const panicking = `func (p panicking${name}) ${method}(${params}) ${result === undefined ? 'error' : `(${result}, error)`} { panic(p.value) }`;
    return { raising, panicking, fixture };
  });
  return `
// raising${name} is a ${name} whose methods return err, with a zero result (K-2).
type raising${name} struct{ err error }

${methods.map((m) => m.raising).join('\n\n')}

// panicking${name} is a ${name} whose methods panic with value (U-3).
type panicking${name} struct{ value any }

${methods.map((m) => m.panicking).join('\n\n')}

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
	raise  error
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
			if row.raise != nil {
				return nil, row.raise
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

// GN-6o: a method with the receiver self leaves its object consumed, whatever the call gives. GN-6p, B-10: an object
// that the runtime collects without its cleanup call warns through the standard logger; the test gives the logger a
// writer that sends each message to a channel, runs a collection and receives the warning, so no time orders them.
function consumerTests(v: Values, out: Out, objects: ObjectClass[]): void {
  const model = v.model;
  const types = Object.fromEntries(goErrorTypes(model.contract));
  for (const object of objects) {
    const name = goName(object.unit.name);
    for (const fn of object.members.filter((m) => m.receiver === 'self')) {
      const sample = sampleReceiver(model, fn);
      if (sample === undefined) continue;
      const b = new Body();
      const held = made(v, b, sample);
      const call = (): string => invoke(v, fn, callArgs(v, b, fn, (a) => (a.default === undefined ? placeholder(v, b, a.type) : undefined)), held);
      const blanks = Array.from({ length: goResultCount(fn) + 1 }, () => '_').join(', ');
      b.lines.push(`${blanks} = ${call()}`, callLine(fn, call()), ...expectKind(types['type'] ?? '', 'consumed', 'GN-6o'));
      out.main.push(`
func TestGN6o${name}${goMemberName(fn)}ConsumesItsObject(t *testing.T) {
${indent(b.lines, 1)}
}`);
    }
    const cleanup = object.cleanup;
    const sample = cleanup === undefined ? undefined : sampleReceiver(model, cleanup);
    if (cleanup === undefined || sample === undefined) continue;
    const b = new Body();
    const held = made(v, b, sample);
    out.warns = true;
    out.main.push(`
func TestB10${name}WarnsWithout${goMemberName(cleanup)}(t *testing.T) {
	warned := newWarnings()
	log.SetOutput(warned)
	defer log.SetOutput(os.Stderr)
	gone := func() weak.Pointer[${name}] {
${indent([...b.lines, `return weak.Make(${held})`], 2)}
	}()
	runtime.GC()
	if gone.Value() != nil {
		t.Fatalf("B-10: the collection left the object, so its cleanup does not run")
	}
	warned.await(${goString(cleanupWarning(name, goMemberName(cleanup)))})
}`);
  }
}

const WARNINGS = `
// warnings is the output of the standard logger in a B-10 test. Write keeps each message and never blocks, because
// the logger holds its lock while it writes; written tells the test that a message came.
type warnings struct {
	lock     sync.Mutex
	messages []string
	written  chan struct{}
}

func newWarnings() *warnings {
	return &warnings{written: make(chan struct{}, 1)}
}

func (w *warnings) Write(message []byte) (int, error) {
	w.lock.Lock()
	w.messages = append(w.messages, string(message))
	w.lock.Unlock()
	select {
	case w.written <- struct{}{}:
	default:
	}
	return len(message), nil
}

// await returns when a message of the logger ends with the warning. The object of the test was collected, so the
// runtime runs its cleanup; the objects of earlier tests may warn before it.
func (w *warnings) await(warning string) {
	for {
		<-w.written
		w.lock.Lock()
		messages := w.messages
		w.messages = nil
		w.lock.Unlock()
		for _, message := range messages {
			if strings.HasSuffix(strings.TrimSuffix(message, "\\n"), warning) {
				return
			}
		}
	}
}
`;

// GN-6y: the directory of a test, in which a case resolves its relative paths; t.TempDir removes it at the end of the
// test.
const CASE_PATH = `
var caseDirs sync.Map

// casePath is the relative path of a case inside the directory of the test t.
func casePath(t *testing.T, relative string) string {
	dir, ok := caseDirs.Load(t)
	if !ok {
		dir = t.TempDir()
		caseDirs.Store(t, dir)
		t.Cleanup(func() { caseDirs.Delete(t) })
	}
	path, _ := dir.(string)
	return filepath.Join(path, filepath.FromSlash(relative))
}
`;

const PTR = `
// ptr is a pointer to a value, for an argument with a default or an optional argument.
func ptr[T any](value T) *T { return &value }
`;

// GN-13: the instance that the constructor of a value class without core_type made for a case value.
const MUST = `
// must is the instance that the constructor of a value class made for a case value; an error of the constructor stops
// the test with that error (GN-13).
func must[T any](made T, err error) T {
	if err != nil {
		panic(fmt.Sprintf("GN-13: the constructor of a case value failed: %v", err))
	}
	return made
}
`;

const KEPT = `
// kept is a kept value of a value class without core_type (GN-6af) as the result of a call that cannot fail.
func kept[T any](value T) (T, error) { return value, nil }
`;

// GN-15c: the places of the instances of the value classes without core_type in a value, which two deeply equal
// values share only when each holds the same pointer where the other does.
function placesHelper(model: Model): string {
  const cases = model.kept.map((k) => {
    const walked = k.fields.map((f) => `\t\t\twalk(found.${f.writable ? keptField(f) : `${goName(f.name)}()`})`).join('\n');
    return `		case *binding.${goName(k.unit.name)}:
			if found == nil {
				return
			}
			if number, ok := numbers[found]; ok {
				out = append(out, fmt.Sprintf("again %d", number))
				return
			}
			numbers[found] = len(numbers)
			out = append(out, fmt.Sprintf("#%d", numbers[found]))
${walked}`;
  }).join('\n');
  return `
// places is the order in which the instances of the value classes of a value first appear, each with its number, and
// every later place of one (GN-6af, U-7 (d)).
func places(top any) string {
	var out []string
	numbers := map[any]int{}
	var walk func(value any)
	walk = func(value any) {
		switch found := value.(type) {
		case []any:
			for _, item := range found {
				walk(item)
			}
		case map[string]any:
			keys := make([]string, 0, len(found))
			for key := range found {
				keys = append(keys, key)
			}
			slices.Sort(keys)
			for _, key := range keys {
				walk(found[key])
			}
		case *binding.KeyedMap[any]:
			for _, key := range found.Keys() {
				item, _ := found.Get(key)
				walk(item)
			}
${cases}
		}
	}
	walk(top)
	return strings.Join(out, " ")
}
`;
}

// The standard packages and the packages of the module that a test file names.
function testImports(model: Model, module: string, text: string, scope: GoScope): string {
  const std = ['errors', 'fmt', 'log', 'math', 'os', 'path/filepath', 'reflect', 'runtime', 'slices', 'strings', 'sync', 'syscall', 'weak'].filter((p) => new RegExp(`\\b${p.slice(p.lastIndexOf('/') + 1)}\\.`).test(text)).map((p) => `"${p}"`);
  std.push('"testing"');
  std.sort();
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
  const v: Values = { model, module, scope, usesPtr: false, fixtures: new Set() };
  const out: Out = { main: [], fault: [], held: [], thrown: [], thrownFault: [], callbacks: new Set() };
  for (const fn of [...callablesOf(model), ...model.kept.flatMap((k) => k.members)].filter((f) => f.module === module && f.kind !== 'iterate')) memberTests(v, out, fn);
  heldTests(v, out, model.objects.filter((o) => o.unit.module === module));
  consumerTests(v, out, model.objects.filter((o) => o.unit.module === module));
  // GN-6u: a func goes through the native row and back, and the binding releases its cgo.Handle; a func is not
  // comparable, so the test checks the count of the live handles of the Natives.
  const roundTrip = nativeRoundTrip(model.contract, 'go');
  const roundFn = roundTrip === undefined ? undefined : model.functions.find((f) => f.member.id === roundTrip.id && f.module === module);
  const native = roundFn === undefined ? [] : [`
func TestGN6o${goMemberName(roundFn)}ReleasesTheHandleOfAFunc(t *testing.T) {
	if _, err := ${invoke(v, roundFn, ['func() {}'], '')}; err != nil {
		t.Fatalf("GN-6u: %v", err)
	}
	before, err := binding.NativeCount()
	if err != nil {
		t.Fatalf("GN-6u: %v", err)
	}
	got, err := ${invoke(v, roundFn, ['func() {}'], '')}
	if err != nil {
		t.Fatalf("GN-6u: %v", err)
	}
	if _, ok := got.(func()); !ok {
		t.Fatalf("GN-6u: %#v is no func", got)
	}
	if _, err := ${invoke(v, roundFn, ['func() {}'], '')}; err != nil {
		t.Fatalf("GN-6u: %v", err)
	}
	after, err := binding.NativeCount()
	if err != nil {
		t.Fatalf("GN-6u: %v", err)
	}
	if after != before {
		t.Fatalf("GN-6u: %d Natives after the call, %d before", after, before)
	}
}`];
  if (out.main.length + out.fault.length + out.held.length + native.length === 0) return [];
  const pkg = goPackage(model.contract, module);
  // The helpers are in the file without a build tag, which every run compiles.
  const all = [...out.main, ...out.fault, ...out.held].join('\n');
  const helpers = [
    ...(v.usesPtr ? [PTR] : []),
    ...(/\bmust\(/.test(all) ? [MUST] : []),
    ...(/\bkept\(/.test(all) ? [KEPT] : []),
    ...(/\bplaces\(/.test(all) ? [placesHelper(model)] : []),
    ...(out.warns === true ? [WARNINGS] : []),
    ...(/\bcasePath\(t, /.test(all) ? [CASE_PATH] : []),
    ...(/\bsameFailure\(/.test(all) ? [SAME_FAILURE] : []),
    ...(/\bfixture[A-Z]|&fixture\{/.test(all) ? [FIXTURE] : []),
    ...[...new Set([...out.callbacks, ...v.fixtures])].map((cb) => callbackTypes(v, cb)),
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
  if (native.length > 0) files.push(['zz_generated_native_count_test.go', file('polyspec_native_count_test', native)]);
  if (out.thrown.length > 0) files.push(['zz_generated_thrown_count_test.go', file('polyspec_thrown_count_test', out.thrown)]);
  if (out.thrownFault.length > 0) files.push(['zz_generated_thrown_count_fault_test.go', file('polyspec_thrown_count_test && polyspec_fault_test', out.thrownFault)]);
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

// GN-6ae, B-3: a handle of the table of the passthroughs is a count that is never given again, and a result whose
// handle names no value is kind internal.
export function goPassedTest(internal: string): string {
  return `${goHeader()}

package binding

import "testing"

func TestGN6aeAHandleOfThePassthroughTableIsNeverGivenAgain(t *testing.T) {
	first := pass("a")
	if value, ok := takePassed(first); !ok || value != "a" {
		t.Fatalf("GN-6ae: the value of the handle is %#v, %v", value, ok)
	}
	second := pass("b")
	if second == first {
		t.Fatalf("GN-6ae: the handle %d was given again", second)
	}
	if value, ok := takePassed(first); ok {
		t.Fatalf("GN-6ae: the handle of a value that left names %#v", value)
	}
	if value, ok := takePassed(second); !ok || value != "b" {
		t.Fatalf("GN-6ae: the value of the handle is %#v, %v", value, ok)
	}
}

func TestGN6aeAResultWhoseHandleNamesNoValueIsKindInternal(t *testing.T) {
	handle := pass(nil)
	takePassed(handle)
	enc := NewWriter()
	enc.Uint(handle)
	dec := NewReader(enc.Done())
	if value := dec.Passed(); value != nil {
		t.Fatalf("GN-6ae: %#v", value)
	}
	failure, ok := dec.Finish().(*${internal})
	if !ok || failure.Kind() != "internal" {
		t.Fatalf("GN-6ae: %#v", dec.Finish())
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
  const aliases = aliasCases(model).filter((c) => local.has(c.alias)).map((kase) => {
    // The statements that make the instances of the value classes of the value, in package binding itself.
    const b = new Body();
    const given = aliasValue(model, b, kase.alias.unit, kase.value, `the alias ${kase.alias.unit.id}`).replace(/\bbinding\./g, '');
    return `
func TestU7${goName(kase.alias.unit.name)}In${testName(kase.id)}(t *testing.T) {
${b.lines.map((line) => `\t${line.replace(/\bbinding\./g, '')}\n`).join('')}	err := AliasIn${goName(kase.alias.unit.name)}(${given})
	if failure, ok := err.(*${categoryType(model, kase.category)}); !ok || failure.Kind() != ${goString(kase.kind)} {
		t.Fatalf("U-7: %#v", err)
	}
}
`;
  }).join('');
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
  const tests = `${latin1}${map}${keyed}${aliases}${numbers}`;
  const body = `${/\bmust\(/.test(tests) ? MUST : ''}${tests}`;
  const std = ['fmt', 'math', 'reflect', 'time'].filter((p) => body.includes(`${p}.`)).map((p) => `\t"${p}"\n`).join('');
  return `${goHeader()}

//go:build polyspec_codec_test

package binding

import (
${std}\t"testing"
)
${body}`;
}
