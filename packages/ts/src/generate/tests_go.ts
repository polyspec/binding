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

import type { Contract, Member, Name, Type, Unit } from '../contract.ts';
import { classIn, holdsAliasWhere, holdsForeign } from './value_class.ts';
import { computedRule, defaultCaseValue } from './defaults.ts';
import { countsThrownGo, numberTypes } from './go_rust.ts';
import {
  type GoScope, callbackOf, callablesOf, categoryType, goErrorTypes, goBytes, goHeader, goImport, goImportBlock, goMemberName, goName,
  foreignPackage, goDefault, goPackage, goParam, importForeign, goResultCount, goString, goTupleArray, goType, nilAbsent, keptField, ownerCall, ownerErrors, ownerType,
  goOrder, goTestTag, goBuildConstraint, GO_TAG_GUARD_FILE,
} from './go.ts';
import {
  type Arg, type CallbackUnit, type Fn, type Model, type ObjectClass, Unsupported, aliasOf, aliasesWithKinds, cleanupWarning, errorUnitOfKind, factoryOf, makerOf, langName, poisoned, objectUnit, pointed, unitOf, variantOf, interfaceOf, implementorsOf, type KeptClass, type ValueAlias,
  nativeRoundTrip,
  caseName,
  callsCode,
  machineFunction,
} from './model.ts';
import {
  type Fixture, type MadeRaise, type RaisingCase, convertedCause, boundName, type Receiver, sampleInstance, aliasCases, mapEntries, caseKey, casePascal, casePathOf, checkCaseNames, comparableResult, expectedErrno, fixtureOf, fixturesOf, implementerInstance, instanceOf, interfaceInstance, isInstanceValue, pairsReceiver, valueClassReceiver, raisingCases, resultCases, sampleReceiver, stringCases, type After, FIXTURE_RAISED, argsOf, callbackCases, callbackReachingArgs, classCaseArgs, floatToken, memberById, raisesException, keptOf, type ForeignStep, foreignSteps, aliasOutForm, caseValueBytes, keyedField, outKeyForm, callbackInstance, cancelState, ownerModel, caseFilesOf, ServiceValue, serviceValueOf, serviceChangeOf, servicePeerOf, serviceSteps, type CaseService,
  caseTextParts, BYTE_NAME_LINUX, caseListenerOf, CASE_JSON_STRING_GOLDENS,
  fixtureType, ROW_EXCEPTION, notAFunctionValue, outsideI64, CLASSED_KINDS, listRepeat,
} from './samples.ts';
import { heldMembers } from './tests_shared.ts';

interface Values {
  model: Model;
  module: string;
  scope: GoScope;
  usesPtr: boolean;
  // GN-13l: only a rendered owned-path term activates the private text helpers, never words in an ordinary literal.
  usesCaseText?: boolean;
  // GN-13l: only normalized value-class projections close over the alias input forms.
  caseTextAlias?: boolean;
  // GN-13e, B2.121: whether a test compares a result that holds an instance of a value class of another repository.
  readsForeign?: boolean;
  // GN-6aa: the callback units whose fixture a case value inside another value makes.
  fixtures: Set<CallbackUnit>;
  // GN-6z: the statement that ends every func of a function type that the values of a test give, in the place of its
  // fixture: the test of the error or of the panic of a func that the core kept in an earlier call.
  keptEnd?: (returns: Type) => string;
  // GN-13e: the value is the expected result of a case, which takes the forms of the Go out rows of an alias.
  result?: boolean;
}

// The statements of a test before its call: the instances that it makes (GN-13f), each checked.
class Body {
  lines: string[] = [];
  // GN-13f: whether a call of then of an instance value of the body arms faults, so the test goes with the cases that
  // arm faults and locks its goroutine to its thread.
  armed = false;
  // GN-6z: the fixtures of the funcs of a function type that the body made, which the test reads after its call.
  functions: string[] = [];
  // GN-13bi: whether the test of the body is the test of a case, which requires at its end that each row once of its
  // fixtures answered a call, and whether the body or a block of it made a fixture with such a row. A fixture is a
  // local of its block, so each is added to the slice onceFixtures of the test where it is made.
  answers = false;
  onceMade = false;
  once(fixture: string): void {
    if (!this.root.answers) return;
    this.root.onceMade = true;
    this.lines.push(`onceFixtures = append(onceFixtures, ${fixture})`);
  }
  // The count of the locals of a test, which the bodies of its funcs share, so that no local has the name of another.
  private readonly counter: { next: number };
  private readonly root: Body;
  private textContext: { owner: string; path: string } | undefined;
  constructor(counter: { next: number } = { next: 0 }, root?: Body) {
    this.counter = counter;
    this.root = root ?? this;
  }
  fresh(prefix = 'made'): string {
    return `${prefix}${this.counter.next++}`;
  }
  // GN-6ae: the statements of a block inside the test: the body of a func, or the block of a call of after.
  child(): Body {
    return new Body(this.counter, this.root);
  }
  // GN-13l: callbacks share the test's captured owner and directory, even when one of their parameters is t.
  caseTextContext(): { owner: string; path: string } {
    if (this.root.textContext === undefined) {
      const owner = this.fresh('_caseTextOwner');
      const path = this.fresh('_caseTextRoot');
      this.root.textContext = { owner, path };
      this.root.lines.unshift(`${owner} := t`, `${path} := casePath(${owner}, ".")`);
    }
    return this.root.textContext;
  }
  // GN-13n: a variable of the test that a function fixture keeps an argument in, which the calls of after read after
  // the function returned (GN-13o); declared once, at the start of the test.
  bound(name: string, type: string): string {
    const variable = `bound_${name}`;
    if (!this.root.lines.includes(`var ${variable} ${type}`)) this.root.lines.unshift(`var ${variable} ${type}`, `_ = ${variable}`);
    return variable;
  }
  hasCaseTextContext(): boolean {
    return this.root.textContext !== undefined;
  }
  // Late fixture checks may first require the capture after ordinary body lines were copied. Publish only the
  // private prolog in that case; ordinary value construction and check builders retain their existing order.
  completeCaseTextContext(lines: string[], captured: boolean): void {
    const context = this.root.textContext;
    if (!captured && context !== undefined) {
      lines.unshift(`${context.owner} := t`, `${context.path} := casePath(${context.owner}, ".")`);
    }
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
    const decimal = floatToken(value);
    // GN-13bc: a decimal float is the number that it writes, with the run-time negative zero of a number.
    if (form === undefined && decimal !== undefined) return floatValue(Number(decimal));
    if (form === undefined) throw new Unsupported(`a case value of the type float is a number or {"float": "nan" | "inf" | "-inf" | "<decimal>"}, not ${JSON.stringify(value)}`);
    return form;
  }
  // G-5: the Go constant -0.0 is 0, so a negative zero is made at run time.
  if (Object.is(value, -0)) return 'math.Copysign(0, -1)';
  return String(value);
}

const goKey = (key: unknown): string => caseKey(key, (kind, raw) => {
  if (kind === 'int') return `binding.IntKey(${String(raw)})`;
  if (kind === 'text') return `binding.TextKey(${goString(String(raw))})`;
  return `binding.BytesKey(${hexBytes(raw, 'bytes')})`;
});

// GN-13e: a key of an expected result in the form that the keyed map of the out row gives it.
const goOutKey = (key: unknown, keys: readonly string[]): string => {
  const form = outKeyForm(key, keys);
  if (form.kind === 'int') return `binding.IntKey(${form.value})`;
  if (form.kind === 'text') return `binding.TextKey(${goString(form.value.toString('utf8'))})`;
  return `binding.BytesKey(${hexBytes({ hex: form.value.toString('hex') }, 'bytes')})`;
};

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
  // GN-13n: the argument that a function fixture around the value keeps under the name.
  const bound = boundName(json);
  if (bound !== undefined) return `bound_${bound}`;
  // GN-13j: the address of the service of the case, or the scope of the case in Go.
  if (json instanceof ServiceValue) {
    if (type !== 'text' && type !== 'latin1' && !(typeof type === 'object' && 'optional' in type)) throw new Unsupported(`a case value {"service": "${json.which}"} stands at a place of the type text or latin1 alone (GN-13j), not at ${JSON.stringify(type)}`);
    if (typeof type === 'string') {
      const given = serviceValueOf(json, 'go');
      return 'scope' in given ? goString(given.scope) : `serviceAddress(t, ${goString(given.address.id)}, ${goString(given.address.address)})`;
    }
  }
  if (typeof type === 'string') {
    const textParts = caseTextParts(json);
    if (textParts !== undefined) {
      if (v.caseTextAlias === true) throw new Unsupported('a composed case text is not an aliased typed-text value (GN-13l)');
      if (type !== 'text') throw new Unsupported(`a composed case text stands at a place of the type text alone (GN-13l), not ${type}`);
      return `(${textParts.map((part) => {
        if (typeof part === 'string') return goString(part);
        // GN-13r: the port of the listener of the case.
        if ('listener' in part) {
          part.listener.check();
          return '_caseListenerPort';
        }
        v.usesCaseText = true;
        const context = b.caseTextContext();
        return `_caseTextPath(${context.owner}, ${context.path}, ${goString(part.relative)}, ${String(part.jsonString)})`;
      }).join(' + ')})`;
    }
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
    // GN-6aq: a context that was cancelled before the call, or one that is never done.
    if (type === 'cancel') return `cancellation(${String(cancelState(json))})`;
    throw new Unsupported(`no Go case value of the type ${type}`);
  }
  // GN-6ae: a function is its fixture, a func of the test, and a passthrough is a value of GN-13.
  if ('function' in type) return notAFunctionValue('go', json) ?? (machineFunction(type) ? functionValue(v, b, type.function, json) : keptFunctionValue(v, b, type.function, json));
  if ('passthrough' in type) return aliasValue(v.model, b, undefined, json, 'a passthrough', v.result === true);
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
  if (alias !== undefined) return aliasValue(v.model, b, alias.unit, json, `the alias ${alias.unit.id}`, v.result === true, alias.library === undefined ? undefined : foreignKept(v, alias.library), (fn, arg) => `must(${invoke(v, fn, [arg], '')})`);
  // GN-13f, GN-6w: an instance value of a class that implements a callback interface stands for the callback.
  const implemented = callbackOf(v.model, type);
  if (implemented !== undefined && implemented.library === undefined && isInstanceValue(json)) return made(v, b, implementerInstance(v.model, implemented.unit, json));
  // GN-13f, GN-6s: an instance value at a place of a callback of another repository is an instance of the class that
  // its make member returns, as in the other targets.
  if (implemented !== undefined && isInstanceValue(json)) return made(v, b, callbackInstance(v.model, implemented.unit, implemented.library, json));
  // GN-13f, GN-6ap: a value of a generated interface is an instance value of a class that implements it.
  const iface = interfaceOf(v.model, type);
  if (iface !== undefined) return made(v, b, interfaceInstance(v.model, iface, json));
  const object = objectUnit(v.model, type);
  if (object !== undefined) {
    // GN-13f, U-1, GN-13: an instance value, the call of the make member of a class of origin value, or the pairs that
    // fill another class, as in the other targets.
    if (isInstanceValue(json)) return made(v, b, instanceOf(v.model, object.unit.id, json, `a value of ${object.unit.id}`));
    if (object.unit.origin === 'value') {
      const previous = v.caseTextAlias;
      v.caseTextAlias = true;
      try {
        return made(v, b, valueClassReceiver(v.model, 'go', object.unit, json));
      } finally {
        if (previous === undefined) delete v.caseTextAlias;
        else v.caseTextAlias = previous;
      }
    }
    if (Array.isArray(json)) return made(v, b, pairsReceiver(v.model, object, json));
    throw new Unsupported(`a case value of the class ${object.unit.id} is an instance value {"new" | "from": ...} or the [key, value] pairs that fill it, not ${JSON.stringify(json)} (GN-13f, GN-13)`);
  }
  // T-9, GN-6v: a value of a variant is the object of its tag and fields, the struct of its case in Go; a field that
  // may be left out and is left out is nil.
  const variant = variantOf(v.model, type);
  if (variant !== undefined) {
    const fields = json as Record<string, unknown>;
    const tag = caseName(variant.unit.tag ?? []);
    const kase = variant.cases.find((c) => c.value === fields[tag]);
    if (kase === undefined) throw new Unsupported(`a case value of the variant ${variant.unit.id} names no case by ${tag}: ${JSON.stringify(json)}`);
    const iface = typeName(v, type);
    const name = `${iface.slice(0, iface.length - goName(variant.unit.name).length)}${goName(kase.unit.name)}`;
    return `${name}{${(kase.unit.fields ?? []).map((f) => {
      const key = caseName(f.name);
      if (!(key in fields)) {
        if (f.default !== undefined) return `${goName(f.name)}: nil`;
        throw new Unsupported(`a case value of the case ${kase.unit.id} has no field ${key}`);
      }
      return `${goName(f.name)}: ${value(v, b, f.type, fields[key])}`;
    }).join(', ')}}`;
  }
  const unit = unitOf(v.model, type);
  // GN-6aa: a callback value inside another value is a fixture of the body, whose calls the test does not read.
  const callback = [...v.model.callbacks, ...v.model.foreignCallbacks].find((c) => c.unit === unit);
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
      const key = caseName(f.name);
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
    importForeign(v.scope, type.path, type.pkg, type.declared);
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
function aliasValue(model: Model, b: Body, unit: Unit | undefined, json: unknown, where: string, result = false, foreign?: ForeignKept, construct?: (fn: Fn, arg: string) => string): string {
  const making: Making = { b, made: [], fills: [], references: new Map(), objects: new Map(), result, ...(foreign === undefined ? {} : { foreign }), ...(construct === undefined ? {} : { construct }) };
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
  // GN-13e: the value is the expected result of a case, made by the Go out rows of the alias.
  result: boolean;
  // GN-6ar: the owner of the alias of the value, when it is another repository: an object and a reference are then
  // instances of the value classes of that repository, which the test makes through the package of the owner.
  foreign?: ForeignKept;
  // GN-13e, B2.543: the call of the constructor of a value class with core_type on the built-in value that it takes.
  construct?: (fn: Fn, arg: string) => string;
}

// GN-6ar, GN-6af: the value classes without core_type of the owner of a value alias of another repository, and the
// package of the owner that names the constructor of one, which the test imports.
interface ForeignKept {
  model: Model;
  pkg: (unit: Unit) => string;
}

function foreignKept(v: Values, library: string): ForeignKept {
  const owner = v.model.foreign.get(library);
  if (owner === undefined) throw new Unsupported(`the contract of ${library} is not given (GN-6ar)`);
  return {
    model: ownerModel(v.model, library),
    pkg: (unit) => {
      const type = ownerType(owner, unit);
      importForeign(v.scope, type.path, type.pkg, type.declared);
      return type.pkg;
    },
  };
}

// The id of a reference or of an object of a case value (G-5).
function idOf(raw: unknown, where: string): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) throw new Error(`an id of ${where} is a number of at least 0, not ${JSON.stringify(raw)}`);
  return raw;
}

// GN-13e: the entries of an expected result that an out row makes a *KeyedMap[any], whose keys take the forms of the
// row.
function outMap(model: Model, unit: Unit | undefined, entries: [unknown, unknown][], keys: readonly string[], where: string, making: Making): string {
  const sets = entries.map(([key, item]) => `${goOutKey(key, keys)}, ${aliasPart(model, unit, item, where, making)}`);
  return mapLocal(making.b, making.fills, 'binding.KeyedMap[any]', sets);
}

// GN-13e, B2.543: the value class with core_type of this contract that a Go out row makes by its constructor, or
// undefined for a row that makes a built-in form or a class without core_type (GN-6af, which the kinds object and
// reference make).
function coreClassOf(model: Model, make: unknown): Unit | undefined {
  if (typeof make !== 'string' || !make.endsWith('.constructor')) return undefined;
  const unit = model.contract.units.find((u) => `${u.id}.constructor` === make);
  return unit?.core_type === undefined ? undefined : unit;
}

// GN-13e, B2.543: a part of an expected result of a value alias of this contract, as the instance that the Go out row of
// its kind makes, where that row makes a value class with core_type by its constructor, as the other targets make it
// (B2.465). An int outside i64 is no value of an out row (U-7 (f), B2.493).
function aliasPart(model: Model, unit: Unit | undefined, json: unknown, where: string, making: Making): string {
  const built = aliasBuilt(model, unit, json, where, making);
  if (!making.result || making.foreign !== undefined || making.construct === undefined || unit?.out === undefined) return built;
  const record = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined;
  const kind = record?.['kind'];
  if (record === undefined || typeof kind !== 'string' || !CLASSED_KINDS.has(kind) || record['repeat'] !== undefined) return built;
  if (kind === 'int' && outsideI64(record['value'])) return built;
  const form = aliasOutForm(unit, 'go', kind, record);
  if (coreClassOf(model, form) === undefined) return built;
  const factory = memberById(model, form as string);
  if (factory === undefined) throw new Unsupported(`a case value of the kind ${kind} of ${where} is an instance of ${String(form)}, which the binding does not generate (GN-13e)`);
  return making.construct(factory, built);
}

function aliasBuilt(model: Model, unit: Unit | undefined, json: unknown, where: string, making: Making): string {
  const record = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined;
  // G-5: a value of the language that is no value of the value type, {"host": <sort>} of the closed table.
  const sort = record?.['host'];
  if (typeof sort === 'string' && Object.hasOwn(GO_HOST_VALUES, sort)) return GO_HOST_VALUES[sort as keyof typeof GO_HOST_VALUES];
  const kind = record?.['kind'];
  if (record === undefined || typeof kind !== 'string') throw new Unsupported(`a case value of ${where} is {"kind": <value kind>, "value": ...}, not ${JSON.stringify(json)}`);
  const held = record['value'];
  if (kind === 'null') return 'nil';
  if (kind === 'bool') return String(held === true);
  // GN-13e: an expected result takes the Go form of the out row of the alias that makes the value: a byte string that
  // a row makes a text is a string, a map that a row makes a list is a []any, and a key of a keyed map is a text only
  // where the map takes texts and the bytes are UTF-8.
  const form = making.result && unit?.out !== undefined && (kind === 'text' || kind === 'bytes' || kind === 'list' || kind === 'map') ? aliasOutForm(unit, 'go', kind, record) : undefined;
  if ((kind === 'bytes' && form === 'text') || (kind === 'text' && form === 'bytes')) {
    const { bytes, utf8 } = caseValueBytes(held);
    if (form === 'bytes') return hexBytes({ hex: bytes.toString('hex') }, 'bytes');
    return utf8 ? goString(bytes.toString('utf8')) : textValue({ hex: bytes.toString('hex') });
  }
  if (kind === 'text') return textValue(held);
  if (kind === 'bytes') return hexBytes(held, 'bytes');
  if (kind === 'float') {
    const float = floatValue(held);
    return float.startsWith('math.') ? float : `float64(${float})`;
  }
  if (kind === 'int' || kind === 'int64') {
    const token = typeof held === 'bigint' || (typeof held === 'number' && Number.isSafeInteger(held)) ? String(held) : typeof held === 'string' && /^-?(0|[1-9][0-9]*)$/.test(held) ? held : undefined;
    if (token === undefined) throw new Unsupported(`a case value of the kind ${kind} of ${where} is a safe integer or a decimal text, not ${JSON.stringify(held)}`);
    const wide = BigInt(token);
    // GN-13, B2.465: an int64 is an integer of the range of i64, a Go int64.
    if (kind === 'int64' && (wide < -(2n ** 63n) || wide >= 2n ** 63n)) throw new Unsupported(`a case value of ${where}: the int64 ${token} is outside the range of i64 (G-5)`);
    if (wide >= -(2n ** 63n) && wide < 2n ** 63n) return `int64(${token})`;
    if (wide >= 0n && wide < 2n ** 64n) return `uint64(${token})`;
    // G-5: an integer outside int64 and uint64 is a *big.Int, which package binding describes as its decimal text, the
    // token that Python and JavaScript describe for it and that PHP gives through case-test.
    const local = making.b.fresh('number');
    making.made.push(`${local} := new(big.Int)`, `if _, parsed := ${local}.SetString(${goString(token)}, 10); !parsed {`, `	panic(${goString(`G-5: ${token} is no decimal integer`)})`, '}');
    return local;
  }
  // G-5: {"kind": "list", "repeat": n, "value": <value>} is n lists, each the one item of the one around it.
  if (kind === 'list' && record['repeat'] !== undefined) {
    const repeat = listRepeat(record, where, () => JSON.stringify(json));
    const inner = aliasPart(model, unit, held, where, making);
    const local = making.b.fresh('list');
    making.fills.push(`var ${local} any = ${inner}`, `for range ${repeat} {`, `\t${local} = []any{${local}}`, '}');
    return local;
  }
  const keyedForm = typeof form === 'object' && form !== null && 'keyed_map' in form ? (form as { keyed_map: { key: string[] } }).keyed_map.key : undefined;
  if (kind === 'list' && Array.isArray(held) && keyedForm !== undefined) return outMap(model, unit, held.map((item, i) => [{ int: i }, item]), keyedForm, where, making);
  if (kind === 'list' && Array.isArray(held)) return `[]any{${held.map((item) => aliasPart(model, unit, item, where, making)).join(', ')}}`;
  if (kind === 'map' && Array.isArray(held) && form === 'list') return `[]any{${(held as [unknown, unknown][]).map(([, item]) => aliasPart(model, unit, item, where, making)).join(', ')}}`;
  if (kind === 'map' && Array.isArray(held) && keyedForm !== undefined) return outMap(model, unit, held as [unknown, unknown][], keyedForm, where, making);
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
  // made, so no constructor judges the instances inside it again. GN-6ar: the classes of a value alias of another
  // repository are those of its owner, whose package the test names.
  const keptModel = making.foreign?.model ?? model;
  const construct = (cls: KeptClass): string => `must(${making.foreign?.pkg(cls.unit) ?? 'binding'}.New${goName(cls.unit.name)}(nil))`;
  const access = (cls: KeptClass): string => {
    const [field] = cls.fields;
    if (field === undefined) throw new Unsupported(`${cls.unit.id} keeps no value (GN-6af)`);
    return field.writable ? keptField(field) : `${goName(field.name)}()`;
  };
  if (kind === 'object') {
    const cls = keptOf(keptModel, 'entries', where);
    const key = access(cls);
    // GN-13e: a key of an expected result takes the key form of the keyed map of the class.
    const keyOf = (entryKey: unknown): string => (making.result ? goOutKey(entryKey, keyedField(keptModel, cls.unit.id)) : goKey(entryKey));
    if (record['repeat'] !== undefined) {
      const repeat = record['repeat'];
      if (typeof repeat !== 'number' || !Number.isSafeInteger(repeat) || repeat < 1 || Object.keys(record).length !== 4 || !('key' in record)) throw new Error(`a case value of ${where} is {"kind": "object", "repeat": <n of at least 1>, "key": <key>, "value": <value>}, not ${JSON.stringify(json)}`);
      const k = keyOf(record['key']);
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
      for (const [entryKey, item] of held as [unknown, unknown][]) making.fills.push(`${local}.${key}.Set(${keyOf(entryKey)}, ${aliasPart(model, unit, item, where, making)})`);
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
    const cls = keptOf(keptModel, 'value', where);
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

// GN-13be: a value that the binding hands to a callback or to a func, in a row and in an expected call, leaves the
// binding as a result does, so it takes the forms of the Go out rows of an alias.
function handedValue(v: Values, b: Body, type: Type, json: unknown): string {
  const outer = v.result === true;
  v.result = true;
  try {
    return value(v, b, type, json);
  } finally {
    v.result = outer;
  }
}

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
      return typed(part, handedValue(v, b, part, given[String(i)] ?? null));
    });
    const result = row['result'] === undefined || row['result'] === null || type.returns === 'none' ? 'nil' : typed(type.returns, value(v, b, type.returns, row['result']));
    return `{member: "call", args: []any{${args.join(', ')}}, result: ${result}, once: ${String(row['once'] === true)}}`;
  });
  const fixture = b.fresh('function');
  b.lines.push(`${fixture} := &fixture{rows: []fixtureRow{${texts.join(', ')}}}`);
  if ((rows as Record<string, unknown>[]).some((row) => row['once'] === true)) b.once(fixture);
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

// GN-13bi: the end of the test of a case, after the calls of after: each row once of a fixture of the test answered a
// call. The declaration of the slice stands before every line of the test.
function onceChecked(b: Body, lines: string[]): void {
  if (!b.onceMade) return;
  lines.unshift('var onceFixtures []*fixture');
  lines.push('for at, made := range onceFixtures {', '\tif left := made.unanswered(); len(left) != 0 {', '\t\tt.Fatalf("G-5: the rows once of the fixture %d that answered no call: %v", at, left)', '\t}', '}');
}

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
    // GN-13be: the result of a call of after or of a step takes the forms of the Go out rows of an alias, as the
    // result of the case does.
    const outer = v.result === true;
    v.result = true;
    let made: string;
    try {
      made = value(v, a, type, want ?? null);
    } finally {
      v.result = outer;
    }
    // GN-13bg: a result that holds an instance of a value class of another repository is compared by what it holds.
    const [got, wanted] = goCompared(v, type, `value${i}`, 'want');
    return [`if want := (${typeName(v, type)})(${made}); !reflect.DeepEqual(${got}, ${wanted}) {`, `\t${differs(i)}`, '}'];
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
  // GN-13n: an argument that the fixture keeps by name is a variable of the func, which the funcs inside it close over.
  for (const [i, name] of (Array.isArray(fixture['names']) ? fixture['names'].map(String) : []).entries()) inner.lines.push(`${b.bound(name, typeName(v, type.parameters[i] as Type))} = arg${i}`);
  for (const step of Array.isArray(fixture['calls']) ? (fixture['calls'] as Record<string, unknown>[]) : []) {
    const fn = memberById(v.model, String(step['call']));
    const args = fn === undefined ? undefined : argsOf(fn, (step['args'] ?? {}) as Record<string, unknown>);
    if (fn === undefined || args === undefined) throw new Unsupported(`a step of a function fixture calls ${String(step['call'])} with ${JSON.stringify(step['args'])}, which are not the parameters of a member (GN-6ae)`);
    const given = String(step['on']);
    const on = /^(0|[1-9][0-9]*)$/.test(given) ? `arg${given}` : `bound_${given}`;
    if (Object.hasOwn(step, 'result')) {
      // CK-22: a step that names a result returns an error that names its member when the call returned another value.
      const lines = comparedCall(v, inner.child(), fn, on, args, { value: step['result'] }, 'return nil, err', (i) => `return nil, fmt.Errorf("GN-6ae: ${fn.member.id} returned %#v, not %#v", value${i}, want)`);
      inner.lines.push('{', ...lines.map((line) => `\t${line}`), '}');
      continue;
    }
    const call = invoke(v, fn, callArgs(v, inner, fn, (arg) => caseValue(v, inner, arg, args)), on);
    // GN-13o: a step that names raises fails with that kind, or the func returns an error that names it.
    const kind = (step['raises'] as { kind?: unknown } | undefined)?.kind;
    if (typeof kind === 'string') {
      const failed = inner.fresh('failure');
      inner.lines.push(`${[...Array.from({ length: goResultCount(fn) }, () => '_'), failed].join(', ')} := ${call}`, `if kinded, ok := ${failed}.(interface{ Kind() string }); !ok || kinded.Kind() != ${goString(kind)} {`, `\treturn nil, fmt.Errorf("GN-13o: ${fn.member.id} gave %#v, not the kind ${kind}", ${failed})`, '}');
      continue;
    }
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
  if (typeof type === 'string') return ({ bool: 'false', text: '"a"', latin1: '"a"', bytes: 'nil', source: '[]byte("a")', path: '"a"', cancel: 'context.Background()' } as Record<string, string>)[type] ?? '0';
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
    // T-5, GN-13f: its own factory, or else a function or a static member of another class that returns it.
    const factory = makerOf(v.model, object);
    if (factory === undefined) throw new Unsupported(`no placeholder of the class ${object.unit.id}, which no constructor, static member or function makes (T-5, GN-13f)`);
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
    // GN-6s, GN-13f: a member of another repository that an instance value names, through the package of its module in
    // the Go module of that repository.
    const owner = fn.library === undefined ? undefined : v.model.foreign.get(fn.library);
    if (owner !== undefined) {
      const pkg = foreignPackage(owner, fn.module);
      importForeign(v.scope, goImport(owner, fn.module), pkg, goPackage(owner, fn.module));
      return `${pkg}.${name}(${args.join(', ')})`;
    }
    // GN-15a: a function of another module is named by its package.
    if (fn.module === v.module) return `${name}(${args.join(', ')})`;
    v.scope.imports.add(fn.module);
    return `${goPackage(v.model.contract, fn.module)}.${name}(${args.join(', ')})`;
  }
  return `${receiver}.${name}(${args.join(', ')})`;
}

// The arguments of a call in the order of the Go arguments (GN-6aq: the context first), a record parameter as its
// struct of fields. given gives the value of an argument, or undefined for an argument with a default that the call
// leaves out (nil, U-2).
function callArgs(v: Values, b: Body, fn: Fn, given: (arg: Arg) => string | undefined): string[] {
  return goOrder(fn.params).map((p) => {
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
// GN-13w, B2.556: a case that gives a callback declaring no parameter, and raises invalid_callback, is no Go test: the
// func of Go has its arguments in its static type, so the callback that a Go caller writes always takes them, and the
// compiler refuses the one that takes none. Nothing of the binding is left to refuse at run time.
function arityFixed(fn: Fn, kase: RaisingCase): string | undefined {
  if (kase.raises.kind !== 'invalid_callback') return undefined;
  const declaresNone = fn.args.some((a) => {
    const json = kase.args.get(a) as { function?: { names?: unknown } } | undefined;
    return typeof a.type === 'object' && 'function' in a.type && Array.isArray(json?.function?.names) && json.function.names.length === 0;
  });
  return declaresNone ? 'a callback declares no parameter, and the func of Go has its arguments in its static type (B2.556)' : undefined;
}

// GN-13w: why a case value is no value of its Go type, or undefined when it is one. Go is statically typed, so the
// compiler refuses such a value at the call before the binding sees it; the case states the refusal of the binding
// on the dynamic targets (GN-13d), and Go has no call to make for it.
// B2.397: with the model, a value anywhere inside the case value is judged too: an item of a list or of its repeat form,
// a part of a tuple, an entry of a map or keyed map, and a field of a record or of a case of a variant, since Go writes
// each as a literal of its type in the one expression of the argument.
export function notGoValue(type: Type, json: unknown, model?: Model): string | undefined {
  if (json === null || json === undefined) return undefined;
  if (typeof type === 'object' && 'optional' in type) return notGoValue(type.optional, json, model);
  if (typeof type !== 'string') return model === undefined ? undefined : notGoInside(model, type, json);
  const number = typeof json === 'number';
  // GN-13bc, B2.360: a float {"float": "<decimal>"} at an integer place is no value of the Go integer, whose
  // conversion the compiler refuses, so Go has no call that gives it to the binding.
  if (typeof json === 'object' && (type === 'uint' || type === 'int' || type === 'int64') && floatToken(json) !== undefined) return `the float ${floatToken(json) ?? ''} is no value of ${type === 'uint' ? 'uint64' : 'int64'}, which the Go compiler refuses`;
  // A value in an object form, such as {"int": ...} or {"float": "nan"}, is judged by value().
  if (typeof json === 'object') return undefined;
  // GN-12a, B2.359: an integer outside the safe integers, which the case file gives as a bigint (CK-64), is a Go
  // integer of its range: the binding refuses it at run time, not the compiler.
  if (typeof json === 'bigint') {
    if (type === 'uint') return json >= 0n && json < 2n ** 64n ? undefined : `${String(json)} is no value of uint64`;
    if (type === 'int' || type === 'int64') return json >= -(2n ** 63n) && json < 2n ** 63n ? undefined : `${String(json)} is no value of int64`;
    return type === 'float' ? undefined : `${String(json)} is no value of the type ${type}`;
  }
  if (type === 'uint') return number && Number.isInteger(json) && (json as number) >= 0 ? undefined : `${JSON.stringify(json)} is no value of uint64`;
  if (type === 'int' || type === 'int64') return number && Number.isInteger(json) ? undefined : `${JSON.stringify(json)} is no value of int64`;
  if (type === 'float') return number ? undefined : `${JSON.stringify(json)} is no value of float64`;
  if (type === 'bool') return typeof json === 'boolean' ? undefined : `${JSON.stringify(json)} is no value of bool`;
  if (type === 'text' || type === 'latin1') return number || typeof json === 'boolean' ? `${JSON.stringify(json)} is no value of string` : undefined;
  return undefined;
}

function notGoInside(model: Model, type: Exclude<Type, string>, json: unknown): string | undefined {
  const first = (items: readonly (readonly [Type, unknown])[]): string | undefined => {
    for (const [t, item] of items) {
      const why = notGoValue(t, item, model);
      if (why !== undefined) return why;
    }
    return undefined;
  };
  const object = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined;
  if ('list' in type) {
    if (Array.isArray(json)) return first(json.map((item) => [type.list, item] as const));
    return object?.['kind'] === 'list' ? notGoValue(type.list, object['value'], model) : undefined;
  }
  if ('tuple' in type) return Array.isArray(json) ? first(type.tuple.map((part, i) => [part, json[i]] as const)) : undefined;
  if ('map' in type || 'keyed_map' in type) {
    const item = 'map' in type ? type.map : type.keyed_map;
    if (Array.isArray(json)) return first(json.filter((entry): entry is unknown[] => Array.isArray(entry) && entry.length === 2).map((entry) => [item, entry[1]] as const));
    return object === undefined ? undefined : first(Object.values(object).map((entry) => [item, entry] as const));
  }
  if (!('unit' in type) || type.library !== undefined || object === undefined) return undefined;
  const fields = (list: readonly { name: Name; type: Type }[]): string | undefined => first(list.filter((f) => Object.hasOwn(object, caseName(f.name))).map((f) => [f.type, object[caseName(f.name)]] as const));
  const variant = variantOf(model, type);
  if (variant !== undefined) {
    const kase = variant.cases.find((c) => c.value === object[caseName(variant.unit.tag ?? [])]);
    return kase === undefined ? undefined : fields(kase.unit.fields ?? []);
  }
  const unit = unitOf(model, type);
  return unit?.kind === 'record' ? fields(unit.fields ?? []) : undefined;
}

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
    // GN-16: a tuple inside a value is the struct TupleN, whose parts are the fields P0 to PN-1.
    // GN-13f: the value of an optional is the pointer itself where nil is the absence, and what it points to elsewhere.
    const expr = 'present' in step ? (nilAbsent(v.model, step.present) ? local : `*${local}`) : 'field' in step ? `${local}.${goName(step.field.split('_'))}` : 'index' in step ? `${local}[${step.index}]` : `${local}.P${step.tuple}`;
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
    // GN-13j: the call leaves the state of the service to the program, as another client of the service would.
    if (step.service !== undefined) {
      const change = serviceChangeOf(step.service, 'go');
      b.lines.push(goState(change.service, change.state, 'change', change.service.scope('go'), change.value));
    }
    // GN-13q: the call is followed by the next step of the peer, which runs while the receiver holds its state.
    if (step.peer !== undefined) {
      const next = servicePeerOf(step.peer, 'go');
      b.lines.push(`servicePeerNext(t, ${goString(next.service.id)}, ${goString(next.service.scope('go'))}, ${goString(next.value)})`);
    }
  }
  // GN-13p: a receiver that a step of a function fixture calls on is kept in a variable of the test.
  // It is made before the arguments of the call, so the funcs of the arguments close over the variable.
  if (r.bound === true) b.lines.push(`bound_receiver := ${local}`, '_ = bound_receiver');
  // GN-13pa: each value of with is made after the receiver and kept in a variable of the test under its name.
  for (const named of r.with ?? []) {
    const value = made(v, b, named.receiver);
    b.lines.push(`bound_${named.name} := ${value}`, `_ = bound_${named.name}`);
  }
  return local;
}

// GN-13e: the receiver and the arguments of a case, or the reason that fails its test by name when a value of the case
// is not written; the other tests of the target are written.
// GN-13i: the lines that write the files of a case, first in the body of its test; files of another form are refused by
// name (G-4), which written gives as the reason of the test of the case.
// GN-13i: a Go string literal of the bytes of a hex, each byte that is no printable ASCII as \xHH.
const goByteName = (hex: string): string => `"${[...Buffer.from(hex, 'hex')].map((byte) => (byte >= 0x20 && byte < 0x7f && byte !== 0x22 && byte !== 0x5c ? String.fromCharCode(byte) : `\\x${byte.toString(16).padStart(2, '0')}`)).join('')}"`;

function writeFiles(b: Body, files: unknown, service?: unknown, listener?: unknown): void {
  // GN-13i: a case that names a file by bytes runs only on Linux, and Go writes the bytes of the name as a string.
  if (caseFilesOf(files).some((file) => file.name !== undefined)) b.lines.push('if runtime.GOOS != "linux" {', `\tt.Skip(${goString(BYTE_NAME_LINUX)})`, '}');
  b.lines.push(...caseFilesOf(files).map((file) => (file.name === undefined ? `caseFile(t, ${goString(file.path)}, ${goString(file.hex)})` : `caseFile(t, ${goByteName(file.name)}, ${goString(file.hex)})`)));
  // GN-13r: the listener of the case, after the files and before the service.
  if (caseListenerOf(listener) !== undefined) b.lines.push('caseListener(t)');
  // GN-13j: the address of the service of the case and its setup, after the files.
  const steps = serviceSteps(service, 'go');
  if (steps === undefined) return;
  b.lines.push(`serviceAddress(t, ${goString(steps.service.id)}, ${goString(steps.service.address)})`);
  if (steps.setup !== undefined) b.lines.push(goState(steps.service, steps.setup.state, 'setup', steps.scope, steps.setup.value));
  // GN-13q: the peer starts after setup, before the receiver and the arguments of the case.
  if (steps.peer !== undefined) b.lines.push(`servicePeer(t, ${goString(steps.service.id)}, ${goString(steps.peer.state)}, ${goString(steps.scope)}, ${goString(steps.peer.value)})`);
}

// GN-13j: the statement that runs the program of the state of a service with a step, the scope and a JSON text.
const goState = (service: CaseService, state: string, step: string, scope: string, value: string): string =>
  `serviceState(t, ${goString(service.id)}, ${goString(state)}, ${goString(step)}, ${goString(scope)}, ${goString(value)})`;

// GN-13j: the check of the service of a case, at the end of its test.
const serviceCheck = (service: unknown): string[] => {
  const steps = serviceSteps(service, 'go');
  if (steps === undefined) return [];
  // GN-13q: the peer ends before check.
  const peer = steps.peer === undefined ? [] : [`servicePeerEnd(t, ${goString(steps.service.id)}, ${goString(steps.scope)})`];
  return [...peer, ...(steps.check === undefined ? [] : [goState(steps.service, steps.check.state, 'check', steps.scope, steps.check.value)])];
};

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
// E-2: the Go type of the failure of a kind: the type of the error unit that its row names, or of its category.
function exactType(model: Model, raises: { kind: string; category: string }): string {
  const unit = errorUnitOfKind(model, raises.kind);
  return unit === undefined ? categoryType(model, raises.category) : goName(unit.unit.name);
}

function expectKind(type: string, kind: string, rule: string): string[] {
  return [`if failure, ok := err.(*liberrors.${type}); !ok || failure.Kind() != ${goString(kind)} {`, `\tt.Fatalf("${rule}: %#v", err)`, '}'];
}

const indent = (lines: string[], depth: number): string => lines.map((l) => (l === '' ? '' : `${'\t'.repeat(depth)}${l}`)).join('\n');

// GN-13e: a name of a test holds the words of a text, capitalized and joined, as the id of a case.
const testName = casePascal;

// GN-6ae (CK-22): the calls of after of a case, each in a block of its own on the receiver of the case, with the
// result that the case names.
function afterLines(v: Values, b: Body, fn: Fn, id: string, after: After[] | undefined, receiver: string): string[] {
  return (after ?? []).flatMap((call, i) => {
    // GN-13o: a call on an argument that a function fixture kept, and a call that fails with a kind.
    const on = call.on === undefined ? receiver : `bound_${call.on}`;
    if (call.raises !== undefined) {
      // B2.506: an instance value of the args is made by its static, with its failure check, inside the block and
      // before the call, as comparedCall makes it for a call of after without raises.
      const inner = b.child();
      const failed = inner.fresh('failure');
      const made = invoke(v, call.fn, callArgs(v, inner, call.fn, (arg) => caseValue(v, inner, arg, call.args)), on);
      return ['{', ...inner.lines.map((line) => `\t${line}`), `\t${[...Array.from({ length: goResultCount(call.fn) }, () => '_'), failed].join(', ')} := ${made}`, `\tif kinded, ok := ${failed}.(interface{ Kind() string }); !ok || kinded.Kind() != ${goString(call.raises)} {`, `\t\tt.Fatalf("GN-13o: after ${i}: %#v is not of kind ${call.raises}", ${failed})`, '\t}', '}'];
    }
    try {
      const lines = comparedCall(v, b.child(), call.fn, on, call.args, call.result === undefined ? undefined : { value: call.result }, 't.Fatalf("GN-6ae: after: %v", err)', (i) => `t.Fatalf("GN-6ae: after: %#v is not %#v", value${i}, want)`);
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
  // T-3: a callback unit of another repository names the types of its owner's contract.
  const named = fixtureType(v.model, fixture.unit);
  const memberName = (i: number): string => goString(langName('go', members[i]?.name ?? [], 'callable'));
  const argsOf = (member: number, args: unknown[]): string => `[]any{${(members[member]?.parameters ?? []).map((p, i) => typed(named(p.type), handedValue(v, b, named(p.type), args[i] ?? null))).join(', ')}}`;
  const rows = fixture.rows.map((row) => {
    const given = members[row.member]?.returns;
    const returns = given === undefined ? 'none' : named(given);
    const result = row.result === null || returns === 'none' ? 'nil' : typed(returns, value(v, b, returns, row.result));
    // GN-13: a raise row returns the error unit with its kind, as Go code makes one.
    // GN-6s: an error unit of the owner of a callback unit of another repository is made by its package errors (GN-15d).
    // GN-7a: a kind that is no kind of the unit is an error of Raised<Unit>, which fails the test.
    let raise = '';
    if (row.raise === 'exception') raise = `, raise: errors.New(${goString(ROW_EXCEPTION)})`;
    else if (row.raise !== undefined && 'made' in row.raise) {
      // B2.489 (GN-15d): an error of another library with values, by Make<Type> of its package errors.
      const made = row.raise.made;
      v.usesPtr = true;
      const type = made.unit === undefined ? goErrorTypes(made.owner).find(([category]) => category === made.category)?.[1] ?? '' : goName(made.unit.name);
      const integer = (n: number | null): string => (n === null ? 'nil' : `ptr(${n})`);
      const errorsPkg = ownerErrors(v.scope, made.library);
      const properties = made.properties.map((p) => {
        const property = (made.unit?.members ?? []).find((m) => m.kind === 'property' && m.name.join('_') === p.name.join('_'));
        const valueType = property?.returns ?? 'none';
        return `, ${errorsPkg}.${type}${goName(p.name)}(${p.value === null ? 'nil' : `ptr(${value(v, b, named(valueType), p.value)})`})`;
      }).join('');
      const raised = b.fresh('raised');
      const refused = b.fresh('refused');
      b.lines.push(`${raised}, ${refused} := ${errorsPkg}.Make${type}(${goString(made.kind)}, ${goString(made.message)}, ${integer(made.status)}, ${integer(made.errno)}${properties})`, `if ${refused} != nil {`, `\tt.Fatalf("G-5: %v", ${refused})`, '}');
      raise = `, raise: ${raised}`;
    } else if (row.raise !== undefined) {
      const maker = row.raise.library === undefined ? 'binding' : ownerErrors(v.scope, row.raise.library);
      const raised = b.fresh('raised');
      const refused = b.fresh('refused');
      b.lines.push(`${raised}, ${refused} := ${maker}.Raised${goName(row.raise.unit.name)}(${goString(row.raise.kind)}, ${goString(`G-5: ${row.raise.kind}`)})`, `if ${refused} != nil {`, `\tt.Fatalf("G-5: %v", ${refused})`, '}');
      raise = `, raise: ${raised}`;
    }
    return `{member: ${memberName(row.member)}, args: ${argsOf(row.member, row.args)}, result: ${result}, once: ${String(row.once)}${raise}}`;
  });
  b.lines.push(`${name} := fixture${goName(fixture.unit.name)}{&fixture{rows: []fixtureRow{${rows.join(', ')}}}}`);
  if (fixture.rows.some((row) => row.once)) b.once(`${name}.fixture`);
  return name;
}

function fixtureChecks(fixtures: { fixture: Fixture; name: string }[], v: Values, b: Body): string[] {
  return fixtures.flatMap(({ fixture, name }) => {
    const members = fixture.unit.members ?? [];
    const named = fixtureType(v.model, fixture.unit);
    const lines = [`if len(${name}.unexpected) != 0 {`, `\tt.Fatalf("G-5: calls that no row answers: %v", ${name}.unexpected)`, '}'];
    if (fixture.calls !== undefined) {
      // GN-13bg: the statements that make an expected argument stand before the check: the lines of the body were
      // written before the call, so a statement added to them here was in no test.
      const made = b.child();
      const calls = fixture.calls.map((call) => `{${[goString(langName('go', members[call.member]?.name ?? [], 'callable')), ...(members[call.member]?.parameters ?? []).map((p, i) => typed(named(p.type), handedValue(v, made, named(p.type), call.args[i] ?? null)))].join(', ')}}`);
      lines.push(...made.lines);
      // reflect.DeepEqual tells a nil slice from an empty one, so no expected call is read as the length 0.
      if (calls.length === 0) lines.push(`if len(${name}.calls) != 0 {`, `\tt.Fatalf("G-5: the calls %v are not none", ${name}.calls)`, '}');
      else {
        // GN-13bg: an argument that holds an instance of a value class of another repository is compared by what it
        // holds.
        const foreign = fixture.calls.some((call) => (members[call.member]?.parameters ?? []).some((p) => holdsForeign(v.model, named(p.type))));
        if (foreign) v.readsForeign = true;
        const [got, want] = foreign ? [`foreignRead(reflect.ValueOf(${name}.calls))`, 'foreignRead(reflect.ValueOf(want))'] : [`${name}.calls`, 'want'];
        lines.push(`if want := [][]any{${calls.join(', ')}}; !reflect.DeepEqual(${got}, ${want}) {`, `\tt.Fatalf("G-5: the calls %v are not %v", ${got}, ${want})`, '}');
      }
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
    const callback = [...v.model.callbacks, ...v.model.foreignCallbacks].find((c) => c.unit === fixture.unit);
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

// GN-13e, B2.543: the value classes with core_type of this contract that a Go out row of a value alias of this contract
// makes, whose instances a result of that alias holds.
function coreClassesOfAliases(model: Model): Unit[] {
  const found = new Map<string, Unit>();
  for (const alias of model.aliases.filter((a) => a.library === undefined)) {
    for (const row of alias.unit.out ?? []) {
      const unit = coreClassOf(model, row.make['go']);
      if (unit !== undefined) found.set(unit.id, unit);
    }
  }
  return [...found.values()];
}

// GN-13e, B2.543: whether a type holds a value alias of this contract whose Go out row makes a value class with core_type.
// A record or a variant holds one in a field (B2.543), as holdsForeign reads them.
function holdsCoreClass(model: Model, type: Type): boolean {
  return holdsAliasWhere(model, type, (alias) => alias.library === undefined && (alias.unit.out ?? []).some((row) => coreClassOf(model, row.make['go']) !== undefined));
}

// GN-13bg, GN-13e: the two sides of a Go comparison of two values of a type. Values that hold an instance of a value class
// of another repository, or of a value class with core_type that an alias of this contract makes (B2.543), are read by
// foreignRead, because reflect.DeepEqual compares two instances by their handles.
function goCompared(v: Values, type: Type, got: string, want: string): [string, string] {
  if (!holdsForeign(v.model, type) && !holdsCoreClass(v.model, type)) return [got, want];
  v.readsForeign = true;
  return [`foreignRead(reflect.ValueOf(${got}))`, `foreignRead(reflect.ValueOf(${want}))`];
}

// GN-13e, B2.121: foreignRead, the form of a result in which an instance of a value class of another repository, or of
// a map class of its owner, is what the members of its in row read: [is], [is, content] or [is, nil, units]. A pointer
// and an interface are their value, a list, an array and a struct their items, and a map its pairs in the order of the
// text of their keys, so reflect.DeepEqual compares two results by what their instances hold.
function foreignReadHelper(v: Values): string {
  const model = v.model;
  const arms: string[] = [];
  const seen = new Set<string>();
  const imported = (owner: Contract, unit: Unit): string => {
    const type = ownerType(owner, unit);
    importForeign(v.scope, type.path, type.pkg, type.declared);
    return type.name;
  };
  for (const alias of model.aliases.filter((a) => a.owner !== undefined && a.library !== undefined && a.unit.kind === 'class')) {
    const owner = alias.owner as Contract;
    const row = classIn(alias, 'go');
    const type = imported(owner, alias.unit);
    if (!seen.has(type)) {
      seen.add(type);
      const cases = row.cases.map((kase) => {
        const read = (member: Member, name: string): string => `			${name}, err := ${ownerCall(owner, alias.unit, member, '', 'found')}
			if err != nil {
				return err
			}`;
        if (kase.read === undefined) return `		case ${goString(kase.is)}:
			return []any{string(kind)}`;
        if (kase.units === undefined) return `		case ${goString(kase.is)}:
${read(kase.read, 'content')}
			return []any{string(kind), foreignRead(reflect.ValueOf(content))}`;
        return `		case ${goString(kase.is)}:
${read(kase.read, 'content')}
			if read := foreignRead(reflect.ValueOf(content)); read != nil {
				return []any{string(kind), read}
			}
${read(kase.units, 'units')}
			return []any{string(kind), nil, foreignRead(reflect.ValueOf(units))}`;
      });
      arms.push(`	case *${type}:
		if found == nil {
			return nil
		}
		kind, err := ${ownerCall(owner, alias.unit, row.by, '', 'found')}
		if err != nil {
			return err
		}
		switch string(kind) {
${cases.join('\n')}
		}
		return fmt.Sprintf("GN-6x: ${type} gives the kind %s, which its in row has no case for", kind)`);
    }
    for (const map of row.maps) {
      const name = imported(owner, map.unit);
      if (seen.has(name)) continue;
      seen.add(name);
      arms.push(`	case *${name}:
		if found == nil {
			return nil
		}
		entries, err := ${ownerCall(owner, map.unit, map.iterate, '', 'found')}
		if err != nil {
			return err
		}
		pairs := []any{}
		for key, item := range entries {
			pairs = append(pairs, []any{foreignRead(reflect.ValueOf(key)), foreignRead(reflect.ValueOf(item))})
		}
		return pairs`);
    }
  }
  // GN-13e, B2.543: an instance of a value class with core_type that an alias of this contract makes is its class and the
  // values of its properties, each read again, as Python (B2.507) and Node (B2.510) compare it.
  for (const unit of coreClassesOfAliases(model)) {
    const type = typeName(v, { unit: unit.id });
    if (seen.has(type)) continue;
    seen.add(type);
    const properties = (unit.members ?? []).filter((m) => m.kind === 'property');
    const reads = properties.map((m, at) => `		read${at}, err := found.${goName(m.name)}()
		if err != nil {
			return err
		}`);
    arms.push(`	case ${type}:
		if found == nil {
			return nil
		}
${reads.join('\n')}${reads.length === 0 ? '' : '\n'}		return []any{${[goString(unit.id), ...properties.map((_, at) => `foreignRead(reflect.ValueOf(read${at}))`)].join(', ')}}`);
  }
  return `
// foreignRead gives a result in the form in which an instance of a value class of another repository is what the
// members of its in row read, and an instance of a value class with core_type of this contract its class and the values
// of its properties, so that reflect.DeepEqual compares two results by what their instances hold (GN-13e).
func foreignRead(value reflect.Value) any {
	if !value.IsValid() {
		return nil
	}
	// B2.543: a pointer read through an unexported field, such as a value of a binding.Map, gives no interface, so the
	// cases of the classes would not run for it; the same pointer made again from its address does.
	if !value.CanInterface() && value.Kind() == reflect.Pointer && !value.IsNil() {
		value = reflect.NewAt(value.Type().Elem(), unsafe.Pointer(value.Pointer()))
	}
	if value.CanInterface() {
		switch found := value.Interface().(type) {
${arms.join('\n').split('\n').map((line) => (line === '' ? line : `\t${line}`)).join('\n')}
		}
	}
	switch value.Kind() {
	case reflect.Pointer, reflect.Interface:
		if value.IsNil() {
			return nil
		}
		return foreignRead(value.Elem())
	case reflect.Slice, reflect.Array:
		if value.Kind() == reflect.Slice && value.IsNil() {
			return nil
		}
		items := make([]any, value.Len())
		for at := range items {
			items[at] = foreignRead(value.Index(at))
		}
		return items
	case reflect.Struct:
		fields := make([]any, value.NumField())
		for at := range fields {
			fields[at] = foreignRead(value.Field(at))
		}
		return []any{value.Type().String(), fields}
	case reflect.Map:
		keys := value.MapKeys()
		slices.SortFunc(keys, func(a, b reflect.Value) int { return strings.Compare(fmt.Sprint(a), fmt.Sprint(b)) })
		pairs := make([]any, len(keys))
		for at, key := range keys {
			pairs[at] = []any{foreignRead(key), foreignRead(value.MapIndex(key))}
		}
		return pairs
	}
	if value.CanInterface() {
		return value.Interface()
	}
	return fmt.Sprint(value)
}
`;
}

function memberTests(v: Values, out: Out, fn: Fn): void {
  const model = v.model;
  const label = labelOf(fn);
  const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
  const reachable = fn.receiver === undefined || sample !== undefined;
  // A test that calls the member once with placeholders and one argument in its place.
  // GN-13y: the other arguments of the K-2 tests are those of a case that reaches the callback, where one exists.
  const reaching = callbackReachingArgs(model, fn);
  // GN-13t: an argument of a class is the case value of a case of the member, where one gives it.
  const classGiven = classCaseArgs(model, fn);
  const other = (b: Body, a: Arg, rich: boolean): string | undefined =>
    classGiven !== undefined && classGiven.has(a) && objectUnit(model, a.type) !== undefined ? caseValue(v, b, a, classGiven) : a.default === undefined ? placeholder(v, b, a.type, rich) : undefined;
  const single = (rule: string, what: string, arg: Arg, given: (b: Body) => string, check: string[], rich = false): void => {
    const b = new Body();
    const receiver = sample === undefined ? '' : made(v, b, sample);
    const args = callArgs(v, b, fn, (a) => (a === arg ? given(b) : rule === 'K-2' && reaching !== undefined ? caseValue(v, b, a, reaching) : other(b, a, rich)));
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
      single('B-2', `refuses ${argName} above the safe integers`, arg, () => wrap('9007199254740992'), expectKind(categoryType(model, 'value'), 'invalid_number', 'B-2'));
      if (base === 'int') single('B-2', `refuses ${argName} below the safe integers`, arg, () => wrap('-9007199254740992'), expectKind(categoryType(model, 'value'), 'invalid_number', 'B-2'));
    }
    // GN-6y: a path with a NUL byte is kind invalid_path.
    if (base === 'path') single('T-1', `refuses a nul byte in ${argName}`, arg, () => wrap('"a\\x00b"'), expectKind(categoryType(model, 'value'), 'invalid_path', 'T-1'));
    if (base === 'text') single('B-3', `refuses ${argName} that is not UTF-8`, arg, () => wrap('"\\xff"'), expectKind(categoryType(model, 'value'), 'invalid_text', 'B-3'));
    if (base === 'latin1') {
      single('B-8', `refuses ${argName} above U+00FF`, arg, () => wrap('"\\u0100"'), expectKind(categoryType(model, 'value'), 'invalid_text', 'B-8'));
      single('B-8', `refuses ${argName} that is not UTF-8`, arg, () => wrap('"\\xff"'), expectKind(categoryType(model, 'value'), 'invalid_text', 'B-8'));
    }
    if (typeof base === 'object' && 'keyed_map' in base) {
      // T-2: a key of a kind that the contract does not list is kind invalid_argument_type.
      const keyedType = base;
      const missing = (['int', 'bytes', 'text'] as const).find((kind) => !keyedType.key.includes(kind));
      if (keyedType.key.includes('int')) {
        // GN-12a: an int key outside the safe integers is kind invalid_number.
        single('B-2', `refuses ${argName} with a key outside the safe integers`, arg, (b) => wrap(mapLocal(b, b.lines, `binding.KeyedMap[${typeName(v, keyedType.keyed_map)}]`, [`binding.IntKey(9007199254740992), ${placeholder(v, b, keyedType.keyed_map)}`])), expectKind(categoryType(model, 'value'), 'invalid_number', 'B-2'));
      }
      if (missing !== undefined) {
        const key = { int: 'binding.IntKey(1)', bytes: 'binding.BytesKey([]byte("b"))', text: 'binding.TextKey("t")' }[missing];
        single('T-2', `refuses ${argName} with a ${missing} key`, arg, (b) => wrap(mapLocal(b, b.lines, `binding.KeyedMap[${typeName(v, keyedType.keyed_map)}]`, [`${key}, ${placeholder(v, b, keyedType.keyed_map)}`])), expectKind(categoryType(model, 'type'), 'invalid_argument_type', 'T-2'));
      }
    }
    const unit = unitOf(model, base);
    if (unit?.kind === 'enum') {
      const enumType = typeName(v, base);
      single('T-6', `refuses ${argName} that is no constant`, arg, () => wrap(`${enumType}("\\x00")`), expectKind(categoryType(model, 'type'), 'invalid_argument_type', 'T-6'));
    }
    // U-7: a kind of an alias's in function reaches the caller of a member that takes the alias.
    const alias = aliasOf(model, arg.type);
    const kase = alias === undefined ? undefined : aliasCases(model).find((c) => c.alias === alias);
    if (kase !== undefined) single('U-7', `gives the kind of ${kase.alias.unit.id} in ${argName}`, arg, (b) => aliasValue(model, b, kase.alias.unit, kase.value, `the alias ${kase.alias.unit.id}`), expectKind(exactType(model, kase), kase.kind, 'U-7'));
    // U-3, K-2: a nil callback is kind invalid_callback, and the error of a callback is the error of the call.
    const callback = callbackOf(model, arg.type);
    if (callback !== undefined) {
      out.callbacks.add(callback);
      single('K-2', `refuses a nil ${argName}`, arg, () => 'nil', expectKind(categoryType(model, 'type'), 'invalid_callback', 'K-2'), true);
    }
    // K-2: the error and the panic of a callback reach the caller of a member that calls it during the call: a callback
    // with keeps is kept for a later member, unless the member names core.failure (GN-7).
    if (callback !== undefined && fn.failure) {
      const b = new Body();
      const receiver = sample === undefined ? '' : made(v, b, sample);
      const args = callArgs(v, b, fn, (a) => (a === arg ? `raising${goName(callback.unit.name)}{err: raised}` : reaching !== undefined ? caseValue(v, b, a, reaching) : other(b, a, true)));
      out.main.push(`
func TestK2${label}LetsTheErrorOf${testName(argName)}Through(t *testing.T) {
	raised := errors.New("raised by the callback")
${indent([...b.lines, callLine(fn, invoke(v, fn, args, receiver)), 'if err != raised {', '\tt.Fatalf("K-2: %#v is not the error of the callback", err)', '}'], 1)}
}`);
      // U-3 (GN-15b): a panic of a method of the callback is the panic of the call, with the same value, and the call
      // released its places: the member runs again on the same instance, and a member that writes it is not busy.
      const p = new Body();
      const again = sample === undefined ? '' : made(v, p, sample);
      const given = (text: string) => callArgs(v, p, fn, (a) => (a === arg ? text : reaching !== undefined ? caseValue(v, p, a, reaching) : other(p, a, true)));
      const panics = callLine(fn, invoke(v, fn, given(`panicking${goName(callback.unit.name)}{value: raised}`), again));
      const returns = callLine(fn, invoke(v, fn, given(`raising${goName(callback.unit.name)}{err: raised}`), again));
      const writer = fn.receiver === undefined ? undefined : model.objects.find((o) => o.members.includes(fn))?.members.find((m) => m.kind === 'method' && m.receiver === '&mut self' && m.special === undefined
        && m.args.every((a) => callbackOf(model, a.type) === undefined && !(typeof a.type === 'object' && 'function' in a.type)));
      const written = writer === undefined ? [] : [
        '{',
        `	${callLine(writer, invoke(v, writer, callArgs(v, p, writer, (a) => (a.default === undefined ? placeholder(v, p, a.type) : undefined)), again))}`,
        `	if failure, ok := err.(*liberrors.${categoryType(model, 'busy')}); ok && failure.Kind() == "busy" {`,
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
      // with the arguments of a case in which the core calls the func, which a case with a row shows; a parameter with
      // keeps is stored by the member, which never calls it, so only the later call that runs it has these tests.
      const kept = arg.type.function;
      const stores = !arg.field && (fn.member.parameters ?? []).some((p) => p.name === arg.name && p.keeps === true);
      single('GN-6z', `refuses a nil ${argName}`, arg, () => 'nil', expectKind(categoryType(model, 'type'), 'invalid_argument_type', 'GN-6z'));
      const calling = stores ? undefined : resultCases(model, fn).find((k) => k.refused === undefined && k.serves === undefined && (((k.args.get(arg) as { function?: unknown } | null | undefined)?.function as unknown[] | undefined)?.length ?? 0) > 0);
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
      single('GN-6ae', `refuses a nil ${argName}`, arg, () => 'nil', expectKind(categoryType(model, 'type'), 'invalid_callback', 'GN-6ae'));
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
  // GN-13j: the test runs no lines of a case, so it takes no case that runs against a service.
  const base = resultCases(model, fn).find((k) => k.refused === undefined && k.serves === undefined);
  const receiverOf = base?.receiver ?? sample;
  for (const arg of reachable && comparable && !ofKept && (fn.receiver === undefined || receiverOf !== undefined) ? fn.args : []) {
    // GN-13d: the second call of a {computed} default of an optional type gives null, and only the outcomes are compared.
    const computed = computedRule(arg);
    const declared = computed === undefined ? defaultCaseValue(model, arg) : { value: null };
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
    b.lines.push(`${computed === undefined ? 'value0' : '_'}, err0 := ${left}`);
    const right = side(false);
    b.lines.push(`${computed === undefined ? 'value1' : '_'}, err1 := ${right}`);
    if (computed !== undefined) {
      out.main.push(`
func TestU2${label}Without${testName(goParam(arg.name, v.model))}LeavesItsValueToTheCore${computed.replaceAll(/[^A-Za-z0-9]+/g, '')}(t *testing.T) {
${indent([...b.lines, 'if !sameFailure(err0, err1) {', '\tt.Fatalf("U-2: %v is not %v", err0, err1)', '}'], 1)}
}`);
      continue;
    }
    // GN-13bg: the two results are compared by what their instances of a value class of another repository hold.
    const [got, want] = goCompared(v, fn.returns, 'value0', 'value1');
    out.main.push(`
func TestU2${label}Without${testName(goParam(arg.name, v.model))}IsTheCallWithItsDefault(t *testing.T) {
${indent([...b.lines, `if !reflect.DeepEqual(${got}, ${want}) || !sameFailure(err0, err1) {`, `\tt.Fatalf("U-2: %#v, %v is not %#v, %v", ${got}, err0, ${want}, err1)`, '}'], 1)}
}`);
  }
  // GN-6ae: a case of a member that takes a callback or a function runs again in a test of the build tag
  // polyspec_thrown_count_test, which reads the count of what was thrown after it.
  const counted = countsThrownGo(model) && callsCode(model, fn);
  // B-4: every case that raises.
  for (const kase of raisingCases(model, fn)) {
    // GN-13w: a case whose argument is no value of its Go type is no Go test; the file names it and the reason.
    const notOf = (f: Fn, args: ReadonlyMap<Arg, unknown>): string | undefined => f.args.map((a) => (args.has(a) ? notGoValue(a.type, args.get(a), model) : undefined)).find((why) => why !== undefined);
    const ofReceiver = (r: Receiver | undefined): string | undefined => (r === undefined ? undefined : notOf(r.factory, r.args) ?? ofReceiver(r.on));
    const foreign = notOf(fn, kase.args) ?? ofReceiver(kase.receiver) ?? arityFixed(fn, kase);
    if (foreign !== undefined) {
      out.main.push(`\n// GN-13w: the case ${kase.id} of ${fn.member.id} is no Go test: ${foreign}, which the Go compiler refuses.`);
      continue;
    }
    const b = new Body();
    b.answers = true;
    const fixtures = fixturesFor(v, out, b, fn, kase.id, kase.args);
    // GN-13f: a receiver whose factory raises the kind of the case gives its failure as the err of the case, and the
    // member is called only on a receiver that was made.
    let making: string | undefined;
    const call = written(fn, kase.id, () => {
      writeFiles(b, kase.files, kase.service, kase.listener);
      let receiver = '';
      if (kase.receiver !== undefined && kase.receiverFails === true && goResultCount(kase.receiver.factory) === 1) {
        const factory = kase.receiver.factory;
        making = invoke(v, factory, callArgs(v, b, factory, (arg) => caseValue(v, b, arg, kase.receiver?.args ?? new Map())), '');
        receiver = b.fresh('made');
      } else if (kase.receiver !== undefined) receiver = made(v, b, kase.receiver);
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
    const captured = b.hasCaseTextContext();
    const lines = [...raisedLine(kase.args), ...b.lines];
    if (kase.faults !== undefined || b.armed) lines.unshift('runtime.LockOSThread()', 'defer runtime.UnlockOSThread()');
    if (kase.faults !== undefined) {
      lines.push(`armed, armErr := binding.ArmFaults(${goString(fn.member.id)}, ${goString(kase.faults)})`, 'if armErr != nil {', '\tt.Fatalf("G-5: %v", armErr)', '}');
    }
    if (making === undefined) lines.push(callLine(fn, invoke(v, fn, args, receiver)));
    else {
      const results = fn.special === 'stringify' ? 1 : goResultCount(fn);
      lines.push(`${receiver}, err := ${making}`, 'if err == nil {', `\t${[...Array.from({ length: results }, () => '_'), 'err'].join(', ')} = ${invoke(v, fn, args, receiver)}`, '}');
    }
    lines.push(...raisedLines(v, kase), ...fixtureChecks(fixtures, v, b), ...functionChecks(b), ...afterLines(v, b, fn, kase.id, kase.after, receiver), ...serviceCheck(kase.service));
    if (kase.faults !== undefined) lines.push('if left, leftErr := binding.FaultLeft(armed); leftErr != nil || len(left) != 0 {', '\tt.Fatalf("G-5: the faults %v did not fire (%v)", left, leftErr)', '}');
    onceChecked(b, lines);
    b.completeCaseTextContext(lines, captured);
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
    b.answers = true;
    const call = written(fn, kase.id, () => {
      writeFiles(b, kase.files, kase.service, kase.listener);
      const receiver = kase.receiver === undefined ? '' : made(v, b, kase.receiver);
      return { receiver, args: callArgs(v, b, fn, (arg) => caseValue(v, b, arg, kase.args)) };
    });
    const captured = b.hasCaseTextContext();
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
        ...serviceCheck(kase.service),
      ];
    if (typeof call !== 'string') onceChecked(b, lines);
    if (typeof call !== 'string') b.completeCaseTextContext(lines, captured);
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
        writeFiles(b, kase.files, kase.service, kase.listener);
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
    b.answers = true;
    const fixtures = fixturesFor(v, out, b, fn, kase.id, kase.args);
    const call = written(fn, kase.id, () => {
      writeFiles(b, kase.files, kase.service, kase.listener);
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
          // GN-13e: the expected result takes the forms of the Go out rows of an alias.
          v.result = true;
          let want: string;
          try {
            want = value(v, b, type, given ?? null);
          } finally {
            v.result = false;
          }
          // GN-15c: a result that holds instances of value classes holds each pointer at the places of the case.
          const same = (model.kept.length > 0 || foreignKeptClasses(model).length > 0) && holdsAlias(model, type) ? ` || places(value${i}) != places(want)` : '';
          // GN-13e: a NaN equals a NaN, while zero signs differ, also inside a nested result.
          const compare = (got: string, wanted: string): string => needsFloatComparison(given) ? `sameValue(${got}, ${wanted})` : `reflect.DeepEqual(${got}, ${wanted})`;
          // GN-13e, B2.121: an instance of a value class of another repository is compared by what its in row reads, and
          // B2.543: one of a value class with core_type that an alias of this contract makes by its class and properties.
          if (holdsForeign(model, type) || holdsCoreClass(model, type)) {
            v.readsForeign = true;
            return [`if want := (${typeName(v, type)})(${want}); !${compare(`foreignRead(reflect.ValueOf(value${i}))`, 'foreignRead(reflect.ValueOf(want))')}${same} {`, `\tt.Fatalf("GN-13e: %#v is not %#v", foreignRead(reflect.ValueOf(value${i})), foreignRead(reflect.ValueOf(want)))`, '}'];
          }
          return [`if want := (${typeName(v, type)})(${want}); !${compare(`value${i}`, 'want')}${same} {`, `\tt.Fatalf("GN-13e: %#v is not %#v", value${i}, want)`, '}'];
        });
      } catch (error) {
        if (!(error instanceof Unsupported)) throw error;
        refused = `${fn.member.id}: ${error.message} (GN-13e)`;
      }
    }
    const captured = b.hasCaseTextContext();
    const lines = refused === undefined
      ? [...(b.armed ? ['runtime.LockOSThread()', 'defer runtime.UnlockOSThread()'] : []), ...raisedLine(kase.args), ...b.lines, callLine(fn, invoke(v, fn, args, receiver), names), 'if err != nil {', '\tt.Fatalf("GN-13e: %v", err)', '}', ...compared, ...fixtureChecks(fixtures, v, b), ...functionChecks(b), ...afterLines(v, b, fn, kase.id, kase.after, receiver), ...serviceCheck(kase.service)]
      : [`t.Fatal(${goString(refused)})`];
    if (refused === undefined) onceChecked(b, lines);
    if (refused === undefined) b.completeCaseTextContext(lines, captured);
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
    ...(kase.raises.status === undefined ? [] : [kase.raises.status === null ? 'if _, ok := failure.Status(); ok {' : `if status, ok := failure.Status(); !ok || status != ${kase.raises.status} {`, '\tt.Fatalf("B-4: the status of %#v", err)', '}']),
    errno === null ? 'if _, ok := failure.Errno(); ok {' : `if errno, ok := failure.Errno(); !ok || errno != ${'symbol' in errno ? `int(syscall.${errno.symbol})` : String(errno.value)} {`,
    '\tt.Fatalf("B-4: the errno of %#v", err)',
    '}',
    ...goCause(v, convertedCause(v.model, kase.args)),
  ];
}

// B2.489 (GN-15d): the converted error keeps the error of the other library as its Cause(), of the type of its row,
// with its kind, message, status and errno.
function goCause(v: Values, made: MadeRaise | undefined): string[] {
  if (made === undefined) return [];
  const type = made.unit === undefined ? goErrorTypes(made.owner).find(([category]) => category === made.category)?.[1] ?? '' : goName(made.unit.name);
  const integer = (name: string, n: number | null): string => (n === null ? `if _, ok := cause.${name}(); ok {` : `if value, ok := cause.${name}(); !ok || value != ${n} {`);
  return [
    `cause, ok := failure.Cause().(*${ownerErrors(v.scope, made.library)}.${type})`,
    `if !ok || cause.Kind() != ${goString(made.kind)} || cause.Error() != ${goString(made.message)} {`,
    '\tt.Fatalf("B2.489: the cause of %#v", err)',
    '}',
    integer('Status', made.status),
    '\tt.Fatalf("B2.489: the status of the cause of %#v", err)',
    '}',
    integer('Errno', made.errno),
    '\tt.Fatalf("B2.489: the errno of the cause of %#v", err)',
    '}',
  ];
}

// B-5c (GN-6h): a poisoned instance is refused at every place, and an instance at a write place and another is busy.
// Each test is one body, so that the locals of its calls are distinct.
function heldTests(v: Values, out: Out, objects: ObjectClass[]): void {
  const model = v.model;
  const callables = callablesOf(model).filter((m) => m.kind !== 'iterate' && m.special === undefined && m.module === v.module);
  // A call in a block of its own, which requires err to be of the type with the kind, or nil.
  // GN-13t: an instance of the class is made from the first case of the class that does not raise, because the core
  // may refuse the placeholder arguments of its first factory (orm: SchemaLoad of three texts "a"); the placeholder of
  // GN-13 stands only when no case of the class makes an instance.
  const instanceOf = (b: Body, object: ObjectClass): string => {
    const sample = sampleInstance(model, object);
    return sample === undefined ? placeholder(v, b, { unit: object.unit.id }) : made(v, b, sample);
  };
  const check = (b: Body, fn: Fn, receiver: string, arg: Arg | undefined, held: string, expect: [string, string, string] | undefined): void => {
    // GN-13t: another argument of a class is the case value of a case of the member, where one gives it.
    const classGiven = classCaseArgs(model, fn);
    const other = (a: Arg): string | undefined => {
      if (classGiven !== undefined && classGiven.has(a) && objectUnit(model, a.type) !== undefined) {
        // G-4: a case value that the generator does not write fails the test of its own case by name and supplies no
        // value here; the lines that it wrote before it failed are taken back.
        const mark = b.lines.length;
        try {
          return caseValue(v, b, a, classGiven);
        } catch (error) {
          if (!(error instanceof Unsupported)) throw error;
          b.lines.length = mark;
        }
      }
      return a.default === undefined ? placeholder(v, b, a.type) : undefined;
    };
    const call = invoke(v, fn, callArgs(v, b, fn, (a) => (a === arg ? held : other(a))), receiver);
    const after = expect === undefined ? ['\tif err != nil {', '\t\tt.Fatalf("B-5c: the refused call left a lock: %v", err)', '\t}'] : expectKind(...expect).map((l) => `\t${l}`);
    b.lines.push('{', `\t${callLine(fn, call)}`, ...after, '}');
  };
  for (const object of objects) {
    if (!poisoned(model, object)) continue;
    const name = goName(object.unit.name);
    const members = heldMembers(model, object, callables, (owner) => factoryOf(model, owner) !== undefined);
    const receiverFn = members.receiver;
    const internal: [string, string, string] = [categoryType(model, 'internal'), 'internal', 'B-5c'];
    const b = new Body();
    const held = instanceOf(b, object);
    b.lines.push(`if err := binding.PanicTestHeld(${model.objects.indexOf(object)}, ${held}.handle()); err == nil {`, '\tt.Fatal("B-5c: the poison entry point did not panic")', '}');
    if (receiverFn !== undefined) check(b, receiverFn, held, undefined, held, internal);
    if (members.param !== undefined) {
      const { fn: paramFn, arg, owner } = members.param;
      const receiver = paramFn.receiver === undefined || owner === undefined ? '' : instanceOf(b, owner);
      check(b, paramFn, receiver, arg, held, internal);
    }
    out.held.push(`
func TestB5c${name}RefusesAPoisonedObject(t *testing.T) {
${indent(b.lines, 1)}
}`);
    for (const { fn, arg, armed } of members.busy) {
      const c = new Body();
      if (armed !== undefined) c.lines.push('runtime.LockOSThread()', 'defer runtime.UnlockOSThread()');
      const instance = instanceOf(c, object);
      if (armed !== undefined) c.lines.push(`armed, armErr := binding.ArmFaults(${goString(fn.member.id)}, ${goString(armed.faults)})`, 'if armErr != nil {', '\tt.Fatalf("G-5: %v", armErr)', '}');
      check(c, fn, instance, arg, instance, [categoryType(model, 'busy'), 'busy', 'B-5c']);
      if (receiverFn !== undefined) check(c, receiverFn, instance, undefined, instance, undefined);
      if (armed !== undefined) {
        // GN-8a: the refused call did not reach the core, so the next call, with another instance, takes the arming.
        const other = instanceOf(c, object);
        check(c, fn, instance, arg, other, [categoryType(model, armed.category), armed.kind, 'GN-8a']);
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
    // GN-6d, G-5: a fixture whose case names no row of a member with a default leaves the member out, so it gives the
    // default; the raising and the panicking objects leave it out, and the binding answers it.
    const absent = m.member.default === undefined || result === undefined
      ? ''
      : `\tif !f.names(${goString(method)}) {\n\t\tvar returned ${result}\n${goDefault({ model: v.model, module: '', imports: new Set() }, m.returns, m.member.default.literal, m.member.id).map((line) => `\t\t${line}\n`).join('')}\t\treturn returned, nil\n\t}\n`;
    const fixture = result === undefined
      ? `func (f fixture${name}) ${method}(${params}) error {\n\t_, err := f.answer(${[goString(method), ...args].join(', ')})\n\treturn err\n}`
      : `func (f fixture${name}) ${method}(${params}) (${result}, error) {\n${absent}\tresult, err := f.answer(${[goString(method), ...args].join(', ')})\n\tvalue, _ := result.(${result})\n\treturn value, err\n}`;
    if (m.member.default !== undefined) return { raising: '', panicking: '', fixture };
    const panicking = `func (p panicking${name}) ${method}(${params}) ${result === undefined ? 'error' : `(${result}, error)`} { panic(p.value) }`;
    return { raising, panicking, fixture };
  });
  return `
// raising${name} is a ${name} whose methods return err, with a zero result (K-2).
type raising${name} struct{ err error }

${methods.filter((m) => m.raising !== '').map((m) => m.raising).join('\n\n')}

// panicking${name} is a ${name} whose methods panic with value (U-3).
type panicking${name} struct{ value any }

${methods.filter((m) => m.panicking !== '').map((m) => m.panicking).join('\n\n')}

// fixture${name} is a ${name} that answers by the rows of a case (G-5).
type fixture${name} struct{ *fixture }

${methods.map((m) => m.fixture).join('\n\n')}
`;
}

// GN-13bg: `foreign` is whether a parameter of a double holds an instance of a value class of another repository, whose
// arguments a row is found by through foreignRead.
// GN-13bi: `once` is whether a test of the package requires the rows once of its fixtures to have answered a call: the
// fixture then holds the place of each row that is left among the rows that it was made with, and names by it the
// rows once that are left.
const fixtureGo = (defaults: boolean, foreign: boolean, once: boolean): string => `
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
	unexpected [][]any${once ? '\n\tplaces     []int' : ''}
}

func (f *fixture) answer(member string, args ...any) (any, error) {
	call := append([]any{member}, args...)
	f.calls = append(f.calls, call)${once ? '\n\tf.placed()' : ''}
	for at, row := range f.rows {
		if row.member == member && (${foreign ? 'reflect.DeepEqual(foreignRead(reflect.ValueOf(row.args)), foreignRead(reflect.ValueOf(args)))' : 'reflect.DeepEqual(row.args, args)'} || len(row.args)+len(args) == 0) {
			if row.once {
				f.rows = append(f.rows[:at:at], f.rows[at+1:]...)${once ? '\n\t\t\t\tf.places = append(f.places[:at:at], f.places[at+1:]...)' : ''}
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
${once ? `
// placed gives each row its place among the rows that the fixture was made with, before a row is taken out (GN-13bi).
func (f *fixture) placed() {
	if f.places == nil {
		for at := range f.rows {
			f.places = append(f.places, at)
		}
	}
}

// unanswered gives the rows once that answered no call, each by its place, its member and its arguments (GN-13bi).
func (f *fixture) unanswered() []string {
	f.placed()
	var left []string
	for at, row := range f.rows {
		if row.once {
			left = append(left, fmt.Sprintf("the row %d: %s%v", f.places[at], row.member, row.args))
		}
	}
	return left
}
` : ''}${defaults ? `
// names is whether a row of the fixture is of the member (GN-6d): a member with a default that no row names is left
// out, and gives its default.
func (f *fixture) names(member string) bool {
	for _, row := range f.rows {
		if row.member == member {
			return true
		}
	}
	return false
}
` : ''}`;

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
  for (const object of objects) {
    const name = goName(object.unit.name);
    for (const fn of object.members.filter((m) => m.receiver === 'self')) {
      const sample = sampleReceiver(model, fn);
      if (sample === undefined) continue;
      const b = new Body();
      const held = made(v, b, sample);
      const call = (): string => invoke(v, fn, callArgs(v, b, fn, (a) => (a.default === undefined ? placeholder(v, b, a.type) : undefined)), held);
      const blanks = Array.from({ length: goResultCount(fn) + 1 }, () => '_').join(', ');
      b.lines.push(`${blanks} = ${call()}`, callLine(fn, call()), ...expectKind(categoryType(model, 'type'), 'consumed', 'GN-6o'));
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

// GN-6aq: a context that was cancelled before the call, or one that is never done.
const CANCELLATION = `
// cancellation is a context that was cancelled before the call, or one that is never done.
func cancellation(cancelled bool) context.Context {
	if !cancelled {
		return context.Background()
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	return ctx
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
		real, err := filepath.EvalSymlinks(t.TempDir())
		if err != nil {
			t.Fatalf("GN-13m: the directory of the case has no real path: %v", err)
		}
		dir = real
		caseDirs.Store(t, dir)
		t.Cleanup(func() { caseDirs.Delete(t) })
	}
	path, _ := dir.(string)
	return filepath.Join(path, filepath.FromSlash(relative))
}
`;

// GN-13i: a file of a case, written inside the directory of the test t with the directories of its path before the values
// of the case are made; its bytes are given as hex.
const CASE_FILE = `
// caseFile writes the file of a case, whose bytes content gives as hex, at its relative path inside the directory of the
// test t.
func caseFile(t *testing.T, relative string, content string) {
	t.Helper()
	data, err := hex.DecodeString(content)
	if err != nil {
		t.Fatalf("G-5: the file %s of the case: %v", relative, err)
	}
	path := casePath(t, relative)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("G-5: the file %s of the case: %v", relative, err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("G-5: the file %s of the case: %v", relative, err)
	}
}
`;

// GN-13r: the listener of a case, in a goroutine beside the call of the test, which accepts each connection and closes
// it at once; the cleanup of the test closes it and waits for the goroutine to end.
const CASE_LISTENER = `
// _caseListenerPort is the port of the listener of the test in progress (GN-13r).
var _caseListenerPort string

// caseListener starts the listener of the case of the test t on 127.0.0.1 at a port that the system assigns.
func caseListener(t *testing.T) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("G-5: the listener of the case did not start: %v (GN-13r)", err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			connection, err := listener.Accept()
			if errors.Is(err, net.ErrClosed) {
				return
			}
			if err == nil {
				_ = connection.Close()
			}
		}
	}()
	t.Cleanup(func() {
		_ = listener.Close()
		<-done
		_caseListenerPort = ""
	})
	_caseListenerPort = strconv.Itoa(listener.Addr().(*net.TCPAddr).Port)
}
`;

// GN-13l: a path term uses the owner and root captured before case values and callbacks are constructed.
const CASE_TEXT_PATH = String.raw`
func _caseTextPath(owner *testing.T, root string, relative string, jsonString bool) string {
	owner.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	if !_caseTextUTF8.ValidString(path) || strings.IndexByte(path, 0) >= 0 {
		owner.Fatalf("GN-13l: case path %q is not UTF-8 text without NUL", path)
	}
	if !jsonString {
		return path
	}
	quoted, err := _caseJSONString(path)
	if err != nil {
		owner.Fatal(err)
	}
	return quoted
}
`;

// GN-13l: native JSON quoting with the HTML option disabled. Only real separator escapes are decoded; an escaped
// backslash and its following u2028/u2029 text remain an escaped backslash and literal text.
const CASE_JSON_STRING = String.raw`
func _caseJSONString(value string) (string, error) {
	if !_caseTextUTF8.ValidString(value) {
		return "", errors.New("GN-13l: case text is not valid UTF-8")
	}
	var encoded strings.Builder
	encoder := _caseTextJSON.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return "", err
	}
	quoted := strings.TrimSuffix(encoded.String(), "\n")
	var result strings.Builder
	result.Grow(len(quoted))
	for index := 0; index < len(quoted); {
		if quoted[index] != '\\' {
			result.WriteByte(quoted[index])
			index++
			continue
		}
		if strings.HasPrefix(quoted[index:], "\\u2028") {
			result.WriteString("\u2028")
			index += 6
			continue
		}
		if strings.HasPrefix(quoted[index:], "\\u2029") {
			result.WriteString("\u2029")
			index += 6
			continue
		}
		result.WriteByte(quoted[index])
		index++
		if index < len(quoted) {
			result.WriteByte(quoted[index])
			index++
		}
	}
	return result.String(), nil
}
`;

function caseJSONGoldenTests(): string {
  const rows = CASE_JSON_STRING_GOLDENS.map(({ inputHex, expectedHex }) => `\t\t{${goString(inputHex)}, ${goString(expectedHex)}},`).join('\n');
  return `
func TestGN13lCaseJSONStringGoldens(t *testing.T) {
	for index, golden := range [][2]string{
${rows}
	} {
		input, err := hex.DecodeString(golden[0])
		if err != nil {
			t.Fatal(err)
		}
		quoted, err := _caseJSONString(string(input))
		if err != nil {
			t.Fatalf("GN-13l: golden %d: %v", index, err)
		}
		if actual := hex.EncodeToString([]byte(quoted)); actual != golden[1] {
			t.Errorf("GN-13l: golden %d is %s, expected %s", index, actual, golden[1])
		}
	}
	if _, err := _caseJSONString(string([]byte{0xff})); err == nil {
		t.Fatal("GN-13l: invalid UTF-8 was accepted")
	}
}
`;
}

// The witness constructs text through the same value writer as contract cases, then invokes a callback whose t
// parameter shadows the test owner and whose public helper names shadow unreserved names. Existing caseFile and casePath independently establish the owned file and root.
function caseTextWitness(v: Values): string {
  const b = new Body();
  const relative = 'owned/composed-text.txt';
  const rawBody = b.child();
  const raw = value(v, rawBody, 'text', { text: [{ case_path: relative }] });
  const quotedBody = b.child();
  const quoted = value(v, quotedBody, 'text', { text: [{ case_path: relative, as: 'json-string' }] });
  const rawCallback = b.fresh('_caseTextRawCallback');
  const jsonCallback = b.fresh('_caseTextJSONCallback');
  return `
func TestGN13lCaseTextCapturesTheOwnedRoot(t *testing.T) {
${indent([
    `caseFile(t, ${goString(relative)}, "${'7769746E657373'.toLowerCase()}")`, ...b.lines,
    `${rawCallback} := func(t, caseTextPath, caseJSONString string) string {`, ...rawBody.lines.map((line) => `\t${line}`), `\treturn ${raw}`, '}',
    `${jsonCallback} := func(t, caseTextPath, caseJSONString string) string {`, ...quotedBody.lines.map((line) => `\t${line}`), `\treturn ${quoted}`, '}',
    `expected := casePath(t, ${goString(relative)})`,
    `actual := ${rawCallback}("shadowed owner", "shadowed path helper", "shadowed JSON helper")`,
    'if actual != expected {', '\tt.Fatalf("GN-13l: captured path %q, expected owned path %q", actual, expected)', '}',
    'content, err := os.ReadFile(actual)',
    'if err != nil || string(content) != "witness" {', '\tt.Fatalf("GN-13l: owned file content is %q (%v)", content, err)', '}',
    'var decoded string',
    `if err := _caseTextJSON.Unmarshal([]byte(${jsonCallback}("shadowed owner", "shadowed path helper", "shadowed JSON helper")), &decoded); err != nil || decoded != expected {`,
    '\tt.Fatalf("GN-13l: quoted captured path is %q (%v), expected %q", decoded, err, expected)', '}',
  ], 1)}
}
`;
}

// GN-13j: the address of the service of a case, which the test run gives in an environment variable, and the program of
// the state of the service, which the test runs with a step, the scope of the case and a JSON text on its input and
// waits for; a missing variable or a status that is not 0 fails the test.
const SERVICE = `
// serviceAddress is the address of the service of a case, which the test run gives in the environment variable.
func serviceAddress(t *testing.T, service string, variable string) string {
	t.Helper()
	address := os.Getenv(variable)
	if address == "" {
		t.Fatalf("G-5: the service %s of the case has no address: the test run sets the environment variable %s (GN-13j)", service, variable)
	}
	return address
}

// serviceState runs the program of the state of a service with the step, the scope and the JSON text on its input.
func serviceState(t *testing.T, service string, variable string, step string, scope string, value string) {
	t.Helper()
	program := os.Getenv(variable)
	if program == "" {
		t.Fatalf("G-5: the service %s of the case has no program of its state: the test run sets the environment variable %s (GN-13j)", service, variable)
	}
	command := exec.Command(program, step, scope)
	command.Stdin = strings.NewReader(value)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("G-5: %s of the service %s for %s exited with %v: %s (GN-13j)", step, service, scope, err, output)
	}
}
`;

// GN-13q: the peer session of the service of a case, a child process of the program of its state that runs while the
// test runs: the test writes the JSON text of each step as one line and reads the line ready, closes its input at the
// end and waits for its exit; the cleanup of the test kills a peer that it did not end, and waits for it.
const PEER = `
// servicePeerProcess is the peer session of the service of a case.
type servicePeerProcess struct {
	command *exec.Cmd
	input   io.WriteCloser
	output  *bufio.Reader
}

// servicePeers are the peers of the running test by their scopes; the tests of the package run one after another.
var servicePeers = map[string]*servicePeerProcess{}

// servicePeerReady reads the line ready of the peer of the scope after a step.
func servicePeerReady(t *testing.T, service string, scope string, step string) {
	t.Helper()
	peer := servicePeers[scope]
	line, err := peer.output.ReadString('\\n')
	if err == nil && line == "ready\\n" {
		return
	}
	if err != nil {
		delete(servicePeers, scope)
		_ = peer.input.Close()
		t.Fatalf("G-5: %s of the peer of the service %s for %s ended before ready with %v (GN-13q)", step, service, scope, peer.command.Wait())
	}
	t.Fatalf("G-5: %s of the peer of the service %s for %s wrote %q in place of ready (GN-13q)", step, service, scope, line)
}

// servicePeer starts the peer of the scope with the JSON text of its start and reads its line ready.
func servicePeer(t *testing.T, service string, variable string, scope string, value string) {
	t.Helper()
	program := os.Getenv(variable)
	if program == "" {
		t.Fatalf("G-5: the service %s of the case has no program of its state: the test run sets the environment variable %s (GN-13j)", service, variable)
	}
	command := exec.Command(program, "peer", scope)
	command.Stderr = os.Stderr
	input, err := command.StdinPipe()
	if err != nil {
		t.Fatalf("G-5: the peer of the service %s for %s has no input: %v (GN-13q)", service, scope, err)
	}
	output, err := command.StdoutPipe()
	if err != nil {
		t.Fatalf("G-5: the peer of the service %s for %s has no output: %v (GN-13q)", service, scope, err)
	}
	if err := command.Start(); err != nil {
		t.Fatalf("G-5: the peer of the service %s for %s did not start: %v (GN-13q)", service, scope, err)
	}
	servicePeers[scope] = &servicePeerProcess{command: command, input: input, output: bufio.NewReader(output)}
	t.Cleanup(func() {
		if peer, ok := servicePeers[scope]; ok {
			delete(servicePeers, scope)
			_ = peer.command.Process.Kill()
			_ = peer.command.Wait()
		}
	})
	// A peer that ended refuses the line; the line ready that it did not write tells the step.
	_, _ = io.WriteString(input, value+"\\n")
	servicePeerReady(t, service, scope, "peer")
}

// servicePeerNext writes the JSON text of the next step to the peer of the scope and reads its line ready.
func servicePeerNext(t *testing.T, service string, scope string, value string) {
	t.Helper()
	_, _ = io.WriteString(servicePeers[scope].input, value+"\\n")
	servicePeerReady(t, service, scope, "next")
}

// servicePeerEnd closes the input of the peer of the scope and waits for its exit.
func servicePeerEnd(t *testing.T, service string, scope string) {
	t.Helper()
	peer := servicePeers[scope]
	delete(servicePeers, scope)
	_ = peer.input.Close()
	if err := peer.command.Wait(); err != nil {
		t.Fatalf("G-5: the peer of the service %s for %s exited with %v (GN-13q)", service, scope, err)
	}
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

// GN-13e: whether a case value holds a NaN or either zero sign at any place. A zero's result type may be float,
// including when the expected JSON literal is positive zero; integer zeros retain their ordinary comparison.
function needsFloatComparison(json: unknown): boolean {
  const stack: unknown[] = [json];
  while (stack.length > 0) {
    const item = stack.pop();
    if (typeof item === 'number' && item === 0) return true;
    if (Array.isArray(item)) stack.push(...item);
    else if (typeof item === 'object' && item !== null) {
      if ((item as { float?: unknown }).float === 'nan') return true;
      stack.push(...Object.values(item));
    }
  }
  return false;
}

// GN-13e: reflect.DeepEqual except that a NaN equals a NaN and opposite zero signs differ. A pair
// of pointers, maps or slices that the walk has entered is equal again, so a cycle ends, as reflect.DeepEqual does.
const SAME_VALUE = `
// sameValue is reflect.DeepEqual, except that a NaN equals a NaN and opposite zero signs differ (GN-13e).
func sameValue(got, want any) bool {
	return sameReflected(reflect.ValueOf(got), reflect.ValueOf(want), map[[3]uintptr]bool{})
}

func sameReflected(a, b reflect.Value, entered map[[3]uintptr]bool) bool {
	if !a.IsValid() || !b.IsValid() {
		return a.IsValid() == b.IsValid()
	}
	if a.Type() != b.Type() {
		return false
	}
	switch a.Kind() {
	case reflect.Float32, reflect.Float64:
		return math.Float64bits(a.Float()) == math.Float64bits(b.Float()) || (math.IsNaN(a.Float()) && math.IsNaN(b.Float()))
	case reflect.Complex64, reflect.Complex128:
		return a.Complex() == b.Complex()
	case reflect.Bool:
		return a.Bool() == b.Bool()
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return a.Int() == b.Int()
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return a.Uint() == b.Uint()
	case reflect.String:
		return a.String() == b.String()
	case reflect.Interface:
		return sameReflected(a.Elem(), b.Elem(), entered)
	case reflect.Array:
		for i := range a.Len() {
			if !sameReflected(a.Index(i), b.Index(i), entered) {
				return false
			}
		}
		return true
	case reflect.Struct:
		for i := range a.NumField() {
			if !sameReflected(a.Field(i), b.Field(i), entered) {
				return false
			}
		}
		return true
	case reflect.Func:
		return a.IsNil() && b.IsNil()
	case reflect.Chan, reflect.UnsafePointer:
		return a.Pointer() == b.Pointer()
	case reflect.Pointer, reflect.Map, reflect.Slice:
		if a.IsNil() || b.IsNil() {
			return a.IsNil() == b.IsNil()
		}
		if a.Kind() != reflect.Pointer && a.Len() != b.Len() {
			return false
		}
		pair := [3]uintptr{a.Pointer(), b.Pointer(), uintptr(a.Kind())}
		if entered[pair] {
			return true
		}
		entered[pair] = true
		switch a.Kind() {
		case reflect.Pointer:
			return sameReflected(a.Elem(), b.Elem(), entered)
		case reflect.Slice:
			for i := range a.Len() {
				if !sameReflected(a.Index(i), b.Index(i), entered) {
					return false
				}
			}
			return true
		default:
			entries := a.MapRange()
			for entries.Next() {
				other := b.MapIndex(entries.Key())
				if !other.IsValid() || !sameReflected(entries.Value(), other, entered) {
					return false
				}
			}
			return true
		}
	}
	return false
}
`;

// GN-13e: this invariant is a native test of the emitted comparison, independent of the binding's transport.
const FLOAT_COMPARISON_TEST = `
func TestGN13eFloatComparisonDistinguishesZeroSigns(t *testing.T) {
\tnegative := math.Copysign(0, -1)
\tpositive := math.Copysign(0, 1)
\tif !math.Signbit(negative) || math.Signbit(positive) {
\t\tt.Fatal("GN-13e: the comparison inputs do not have opposite zero signs")
\t}
\tfor index, pair := range []struct {
\t\tgot, want any
\t\tequal     bool
\t}{
\t\t{negative, negative, true},
\t\t{positive, positive, true},
\t\t{positive, negative, false},
\t\t{negative, positive, false},
\t\t{float32(positive), float32(negative), false},
\t\t{[]any{map[string]float64{"zero": negative}}, []any{map[string]float64{"zero": negative}}, true},
\t\t{[]any{map[string]float64{"zero": positive}}, []any{map[string]float64{"zero": negative}}, false},
\t\t{struct{ Value float64 }{positive}, struct{ Value float64 }{negative}, false},
\t\t{math.NaN(), math.NaN(), true},
\t\t{[]any{math.NaN(), positive}, []any{math.NaN(), negative}, false},
\t} {
\t\tif equal := sameValue(pair.got, pair.want); equal != pair.equal {
\t\t\tt.Errorf("GN-13e: comparison %d gives %v, expected %v for %#v and %#v", index, equal, pair.equal, pair.got, pair.want)
\t\t}
\t}
}
`;

const KEPT = `
// kept is a kept value of a value class without core_type (GN-6af) as the result of a call that cannot fail.
func kept[T any](value T) (T, error) { return value, nil }
`;

// GN-6ar, GN-6af: the value classes without core_type of the owners of the value aliases of other repositories, each
// with the package of its owner, whose instances a result of such an alias holds.
function foreignKeptClasses(model: Model): { cls: KeptClass; pkg: string; declared: string; path: string }[] {
  const libraries = [...new Set(model.aliases.flatMap((a) => (a.library !== undefined && a.unit.kind !== 'class' ? [a.library] : [])))];
  return libraries.flatMap((library) => {
    const owner = model.foreign.get(library);
    if (owner === undefined) throw new Unsupported(`the contract of ${library} is not given (GN-6ar)`);
    return ownerModel(model, library).kept.map((cls) => ({ cls, ...ownerType(owner, cls.unit) }));
  });
}

// GN-15c, GN-6ar: the places of the instances of the value classes without core_type in a value, of this repository
// and of the owners of the value aliases of other repositories, which two deeply equal values share only when each
// holds the same pointer where the other does.
function placesHelper(model: Model, scope: GoScope): string {
  const foreign = foreignKeptClasses(model);
  // GN-15f: the file of the tests imports each package of another repository whose classes places names (B2.304).
  for (const { path, pkg, declared } of foreign) importForeign(scope, path, pkg, declared);
  const classes = [...model.kept.map((cls) => ({ cls, pkg: 'binding' })), ...foreign];
  const cases = classes.map(({ cls: k, pkg }) => {
    const walked = k.fields.map((f) => `\t\t\twalk(found.${f.writable ? keptField(f) : `${goName(f.name)}()`})`).join('\n');
    return `		case *${pkg}.${goName(k.unit.name)}:
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
${[...new Set(['binding', ...foreign.map((f) => f.pkg)])].map((pkg) => `		case *${pkg}.KeyedMap[any]:
			for _, key := range found.Keys() {
				item, _ := found.Get(key)
				walk(item)
			}
`).join('')}${cases}
		}
	}
	walk(top)
	return strings.Join(out, " ")
}
`;
}

// The code of a Go text by the lexical rules of Go: each comment, `//` to the end of its line and `/*` to `*/`, and each
// interpreted string `"…"` with its escapes, raw string `` `…` `` and rune `'…'` become a space (GN-4f).
function goCode(text: string): string {
  let code = '';
  let at = 0;
  while (at < text.length) {
    const c = text[at] as string;
    const next = text[at + 1];
    let end: number;
    if (c === '/' && next === '/') {
      end = text.indexOf('\n', at);
      if (end < 0) end = text.length;
    } else if (c === '/' && next === '*') {
      end = text.indexOf('*/', at + 2);
      end = end < 0 ? text.length : end + 2;
    } else if (c === '`') {
      end = text.indexOf('`', at + 1);
      end = end < 0 ? text.length : end + 1;
    } else if (c === '"' || c === "'") {
      end = at + 1;
      while (end < text.length && text[end] !== c && text[end] !== '\n') end += text[end] === '\\' ? 2 : 1;
      end = Math.min(end + 1, text.length);
    } else {
      code += c;
      at += 1;
      continue;
    }
    code += ' ';
    at = end;
  }
  return code;
}

// Whether a Go text uses the package of a name: a selector `<name>.` in its code tokens (GN-4f).
export function goUses(text: string, name: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${name}\\s*\\.`, 'u').test(goCode(text));
}

// The standard packages and the packages of the module that a test file names.
function testImports(model: Model, module: string, text: string, scope: GoScope, extraStd: readonly { path: string; alias: string }[] = []): string {
  const std = ['bufio', 'context', 'encoding/hex', 'errors', 'fmt', 'io', 'log', 'math', 'math/big', 'net', 'os', 'os/exec', 'path/filepath', 'reflect', 'runtime', 'slices', 'strconv', 'strings', 'sync', 'syscall', 'unsafe', 'weak'].filter((p) => goUses(text, p.slice(p.lastIndexOf('/') + 1))).map((p) => `"${p}"`);
  // Owned-text helpers declare their imports without interpreting ordinary literals as code.
  std.push(...extraStd.map(({ path, alias }) => `${alias} ${goString(path)}`));
  std.push('"testing"');
  std.sort((a, b) => {
    const aPath = a.slice(a.indexOf('"'));
    const bPath = b.slice(b.indexOf('"'));
    return aPath < bPath ? -1 : aPath > bPath ? 1 : 0;
  });
  const own = [
    ...(goUses(text, 'liberrors') ? [`liberrors "${goImport(model.contract, 'errors')}"`] : []),
    ...(goUses(text, 'binding') ? [`"${goImport(model.contract, 'internal/binding')}"`] : []),
    ...[...scope.imports].filter((m) => m !== module && goUses(text, goPackage(model.contract, m))).map((m) => `"${goImport(model.contract, m)}"`),
    // GN-15f: the packages of other repositories whose records the tests name.
    ...[...(scope.foreignImports ?? new Map<string, string>())].filter(([, name]) => goUses(text, name)).map(([path, name]) => (scope.foreignNamed?.has(path) === true ? `${name} "${path}"` : `"${path}"`)),
    // GN-6s, GN-15d: the packages errors of other repositories whose errors the fixtures raise.
    ...[...(scope.foreignErrors ?? new Map<string, string>())].filter(([, name]) => goUses(text, name)).map(([path, name]) => `${name} "${path}"`),
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
  const composedText = v.usesCaseText === true;
  const doubles = [...new Set([...out.callbacks, ...v.fixtures])];
  // GN-13bg: a double whose parameter holds an instance of a value class of another repository finds its row by
  // foreignRead.
  const foreignDouble = doubles.some((cb) => {
    const named = fixtureType(model, cb.unit);
    return (cb.unit.members ?? []).some((m) => (m.parameters ?? []).some((p) => holdsForeign(model, named(p.type))));
  });
  if (foreignDouble) v.readsForeign = true;
  const helpers = [
    ...(v.usesPtr ? [PTR] : []),
    ...(/\bmust\(/.test(all) ? [MUST] : []),
    ...(/\bkept\(/.test(all) ? [KEPT] : []),
    ...(/\bplaces\(/.test(all) ? [placesHelper(model, scope)] : []),
    ...(v.readsForeign === true ? [foreignReadHelper(v)] : []),
    ...(out.warns === true ? [WARNINGS] : []),
    ...(composedText || /\b(casePath|caseFile)\(t, /.test(all) ? [CASE_PATH] : []),
    ...(composedText || /\bcaseFile\(t, /.test(all) ? [CASE_FILE] : []),
    ...(composedText ? [CASE_TEXT_PATH, caseTextWitness(v)] : []),
    ...(/\bservice(Address|State)\(t, /.test(all) ? [SERVICE] : []),
    ...(/\bservicePeer\(t, /.test(all) ? [PEER] : []),
    ...(/\bcaseListener\(t\)/.test(all) ? [CASE_LISTENER] : []),
    ...(/\bcancellation\(/.test(all) ? [CANCELLATION] : []),
    ...(/\bsameFailure\(/.test(all) ? [SAME_FAILURE] : []),
    // GN-13x: the double fixture<Name> of every callback type embeds *fixture, so the type comes with every double.
    ...(/\bfixture[A-Z]|&fixture\{/.test(all) || doubles.length > 0 ? [fixtureGo(doubles.some((cb) => cb.members.some((m) => m.member.default !== undefined)), foreignDouble, /\.unanswered\(\)/.test(all))] : []),
    ...doubles.map((cb) => callbackTypes(v, cb)),
  ].join('');
  const file = (tag: string | undefined, tests: string[], extra = '', extraStd: readonly { path: string; alias: string }[] = []): string => {
    const body = `${extra}${tests.join('\n')}\n`;
    return `${goHeader()}
${tag === undefined ? '' : `\n//go:build ${tag}\n`}
// The generated tests of the Go package ${pkg} (G-5).
package ${pkg}

${testImports(model, module, body, scope, extraStd)}${body}`;
  };
  const files: [string, string][] = [['zz_generated_test.go', file(undefined, out.main, helpers, composedText ? [{ path: 'encoding/json', alias: '_caseTextJSON' }, { path: 'unicode/utf8', alias: '_caseTextUTF8' }] : [])]];
  if (/\bsameValue\(/.test(all)) files.push(['zz_generated_value_comparison_test.go', file(undefined, [], `${SAME_VALUE}${FLOAT_COMPARISON_TEST}`.trimEnd())]);
  if (composedText) files.push(['zz_generated_case_json_string_test.go', file(undefined, [], `${CASE_JSON_STRING}${caseJSONGoldenTests()}`.trimEnd(), [{ path: 'encoding/json', alias: '_caseTextJSON' }, { path: 'unicode/utf8', alias: '_caseTextUTF8' }])]);
  if (out.fault.length > 0) files.push(['zz_generated_fault_test.go', file(goTestTag(model, 'fault_test'), out.fault)]);
  if (out.held.length > 0) files.push(['zz_generated_held_test.go', file(goTestTag(model, 'panic_test'), out.held)]);
  if (native.length > 0) files.push(['zz_generated_native_count_test.go', file(goTestTag(model, 'native_count_test'), native)]);
  if (out.thrown.length > 0) files.push(['zz_generated_thrown_count_test.go', file(goTestTag(model, 'thrown_count_test'), out.thrown)]);
  if (out.thrownFault.length > 0) files.push(['zz_generated_thrown_count_fault_test.go', file(`${goTestTag(model, 'thrown_count_test')} && ${goTestTag(model, 'fault_test')}`, out.thrownFault)]);
  return files;
}

// GN-13bf: each tagged generated test file of the Go module under `module` registers the tags of its build constraint
// in an init, and each package with such files has the untagged test zz_generated_tags_test.go, which fails unless
// every tag of those files was built, so a run with a wrong tag or none does not pass with the tagged tests left out.
export function guardGoTestTags(files: Map<string, string>, module: string): void {
  const packages = new Map<string, { name: string; tags: Set<string> }>();
  for (const [path, text] of [...files]) {
    if (!path.startsWith(`${module}/`) || !path.endsWith('_test.go')) continue;
    const constraint = goBuildConstraint(text);
    if (constraint === undefined) continue;
    const tags = constraint.split(' && ');
    if (!tags.every((tag) => /^polyspec_\w+$/.test(tag))) throw new Error(`${path}: the build constraint ${constraint} is not a conjunction of the tags of the generation (GN-13bf)`);
    const name = /^package (\w+)$/m.exec(text)?.[1] ?? '';
    const dir = path.slice(0, path.lastIndexOf('/'));
    const known = packages.get(dir) ?? { name, tags: new Set<string>() };
    for (const tag of tags) known.tags.add(tag);
    packages.set(dir, known);
    files.set(path, `${text.trimEnd()}\n\n// GN-13bf: this file was built with its tags.\nfunc init() {\n${tags.map((tag) => `\tbuiltTags[${goString(tag)}] = true\n`).join('')}}\n`);
  }
  const every = [...new Set([...packages.values()].flatMap((p) => [...p.tags]))].sort().join(',');
  for (const [dir, { name, tags }] of packages) {
    files.set(`${dir}/${GO_TAG_GUARD_FILE}`, `${goHeader()}

package ${name}

import "testing"

// builtTags holds each build tag of the generated tests of the package that the build compiled; the init of each
// tagged generated test file sets its tags (GN-13bf).
var builtTags = map[string]bool{}

// A run without the tags of the tagged generated tests would compile none of them and pass without them (GN-13bf).
func TestGN13bfEveryBuildTagOfThePackageIsBuilt(t *testing.T) {
	expected := []string{${[...tags].sort().map(goString).join(', ')}}
	var missing []string
	for _, tag := range expected {
		if !builtTags[tag] {
			missing = append(missing, tag)
		}
	}
	if len(missing) > 0 {
		t.Fatalf("GN-13bf: the generated tests of the build tags %v were not built; run go test -tags=${every} ./...", missing)
	}
}
`);
  }
}

// B-7: the panic of the core reaches Go as the internal error type of kind internal.
export function goPanicTest(internal: string, tag: string): string {
  return `${goHeader()}

//go:build ${tag}

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
  const typeType = categoryType(model, 'type');
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
    const errno = expectedErrno(kase);
    // The statements that make the instances of the value classes of the value, in package binding itself.
    const b = new Body();
    const given = aliasValue(model, b, kase.alias.unit, kase.value, `the alias ${kase.alias.unit.id}`).replace(/\bbinding\./g, '');
    return `
func TestU7${goName(kase.alias.unit.name)}In${testName(kase.id)}(t *testing.T) {
${b.lines.map((line) => `\t${line.replace(/\bbinding\./g, '')}\n`).join('')}	err := AliasIn${goName(kase.alias.unit.name)}(${given})
	failure, ok := err.(*${exactType(model, kase)})
	if !ok || failure.Kind() != ${goString(kase.kind)} {
		t.Fatalf("U-7: %#v", err)
	}
${kase.raises.status === undefined ? '' : `\t${kase.raises.status === null ? 'if _, ok := failure.Status(); ok {' : `if status, ok := failure.Status(); !ok || status != ${kase.raises.status} {`}
\t\tt.Fatalf("U-7: the status of %#v", err)
\t}
`}\t${errno === null ? 'if _, ok := failure.Errno(); ok {' : `if errno, ok := failure.Errno(); !ok || errno != ${'symbol' in errno ? `int(syscall.${errno.symbol})` : String(errno.value)} {`}
\t\tt.Fatalf("U-7: the errno of %#v", err)
\t}
}
`;
  }).join('');
  // GN-13g: the B-2 values of GN-13 of another Go type, the values that are no number (kind invalid_argument_type,
  // GN-12a) apart from the Go numbers of another type (kind invalid_number), and values of the type, through the
  // conversion of each number type.
  const sets: Record<string, [string[], string[]]> = {
    uint: [['1.5', 'math.NaN()', 'math.Inf(1)', 'math.Inf(-1)', '-1', 'uint64(9007199254740992)'], ['7', 'uint64(9007199254740991)']],
    int: [['1.5', 'math.NaN()', 'math.Inf(1)', 'math.Inf(-1)', 'int64(9007199254740992)', 'int64(-9007199254740992)'], ['7', '-7', 'int64(9007199254740991)']],
    int64: [['1.5', 'math.NaN()', 'math.Inf(1)', 'math.Inf(-1)', 'uint64(math.MaxUint64)'], ['7', 'int64(math.MinInt64)', 'int64(math.MaxInt64)']],
    float: [['7'], ['1.5', 'math.NaN()', 'math.Inf(1)']],
  };
  const numbers = numberTypes(model).map((type) => {
    const name = `${goName([type])}In`;
    const [refused, taken] = sets[type] ?? [[], []];
    return `
func TestB2${name}RefusesAValueOfAnotherType(t *testing.T) {
	for _, value := range []any{true, "7"} {
		err := ${name}(value, "value")
		if failure, ok := err.(*${typeType}); !ok || failure.Kind() != "invalid_argument_type" {
			t.Fatalf("GN-12a: %#v: %#v", value, err)
		}
	}
}

func TestB2${name}RefusesANumberOutsideItsType(t *testing.T) {
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
  // gofmt orders the imports of a block by their path, so "testing" takes its place among them.
  const std = [...['fmt', 'math', 'math/big', 'reflect', 'syscall', 'time'].filter((p) => goUses(body, p.slice(p.lastIndexOf('/') + 1))), 'testing'].sort().map((p) => `\t"${p}"\n`).join('');
  return `${goHeader()}

//go:build ${goTestTag(model, 'codec_test')}

package binding

import (
${std})
${body}`;
}
