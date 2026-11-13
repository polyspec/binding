// The generated node:test module of the WASM binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run
// against the subpath ./wasm of the installed package after init (P-5). The JavaScript values are those of Node.

import { type Fn, type Model, errorUnitOfKind, hookCall, langName } from './model.ts';
import { type Context, type Receiver, bytesKind, callArgs, callables, caseValue, expectedText, isNumber, resultCases, placeholder, raisingCases, refusedKeyMap, samePairs, sampleReceiver, stringCases, textKind, wrapText } from './samples.ts';
import { header, jsString } from './text.ts';
import { wasmGlue } from './wasm.ts';
import { NODE_ORDERED } from './tests_node.ts';

const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['NaN', 'Infinity', '-Infinity', '1.5', 'true', "'7'", '-1', '2 ** 53'],
  int: ['NaN', 'Infinity', '-Infinity', '1.5', 'true', "'7'", '2 ** 53', '-(2 ** 53)'],
  float: ['true', "'7'", 'null'],
};

const jsBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';

export function wasmTests(model: Model): string {
  const npm = (model.contract.packages['node'] as { package: string }).package;
  const entry = `${npm}/wasm`;
  const ctx: Context = { lang: 'node', enumRef: (_name, value) => jsString(value),
    recordNew: (unit, fields) => `{ ${(unit.fields ?? []).map((f, i) => `${langName('wasm', f.name, 'variable')}: ${fields[i] ?? ''}`).join(', ')} }`,
    // GN-18: WASM generates no callback unit (refused by name), so no test makes one.
    callbackNew: (unit) => {
      throw new Error(`${unit.id}: no callback for WASM`);
    },
  };
  const cls = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  // E-2, B-4: the exact class of a failure of a case: the class of the error unit of its kind, or of its category.
  const exactClass = (raises: { kind: string; category: string }): string => {
    const unit = errorUnitOfKind(model, raises.kind);
    return unit === undefined ? cls(raises.category) : langName('wasm', unit.unit.name, 'class');
  };
  const out: string[] = [];
  let usesOutcome = false;
  let usesOrdered = false;
  // T-5: a member of a class is called as JavaScript calls it; a stringify and a to_json as the language runs the hook.
  const invoke = (fn: Fn, args: string, receiver: string): string => {
    const hook = hookCall('node', fn, receiver);
    if (hook !== undefined) return hook;
    const member = langName('wasm', fn.member.name, 'callable');
    const unit = `pkg.${langName('wasm', fn.unit.name, 'class')}`;
    if (fn.kind === 'function') return `pkg.${member}(${args})`;
    if (fn.kind === 'constructor') return `new ${unit}(${args})`;
    if (fn.kind === 'static') return `${unit}.${member}(${args})`;
    if (fn.kind === 'property') return `${receiver}.${member}`;
    return `${receiver}.${member}(${args})`;
  };
  ctx.objectNew = (factory, args) => invoke(factory, args, '');
  const made = (receiver: Receiver): string =>
    invoke(receiver.factory, callArgs(model, ctx, receiver.factory, (arg) => caseValue(model, ctx, arg, receiver.args)), '');
  // GW-7: a call after the panic, of the first function with its placeholder arguments: kind internal when the panic
  // trapped, a call that works when the module unwinds.
  const [firstFn] = model.functions;
  const laterCall = firstFn === undefined ? '' : `
  const later = () => pkg.${langName('wasm', firstFn.member.name, 'callable')}(${callArgs(model, ctx, firstFn, (arg) => placeholder(model, ctx, arg.type))});
  if (state.broken()) assert.throws(later, internal);
  else assert.doesNotThrow(() => { try { later(); } catch (error) { if (internal(error)) throw error; } });`;
  for (const fn of callables(model)) {
    const name = fn.kind === 'function' ? langName('wasm', fn.member.name, 'callable') : `${langName('wasm', fn.unit.name, 'class')}.${fn.kind === 'constructor' ? 'constructor' : langName('wasm', fn.member.name, 'callable')}`;
    const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
    const recv = sample === undefined ? '' : made(sample);
    const target = (args: string): string => invoke(fn, args, recv);
    const call = (override: Map<unknown, string>): string =>
      target(callArgs(model, ctx, fn, (arg) => override.get(arg) ?? placeholder(model, ctx, arg.type)));
    // A method is tested on an instance, which a case of the class gives (GN-13).
    const reachable = fn.receiver === undefined || sample !== undefined;
    for (const arg of reachable ? fn.args : []) {
      const argName = langName('wasm', arg.name, 'variable');
      const number = isNumber(arg.type);
      if (number !== undefined) {
        out.push(`
test('B-2: ${name} refuses a ${argName} that is not ${number}', () => {
  for (const bad of [${(BAD_NUMBERS[number] ?? []).join(', ')}]) {
    assert.throws(() => ${call(new Map([[arg, 'bad']]))}, (error) => error.constructor === pkg.${cls('value')} && error.kind === 'invalid_number', String(bad));
  }
});`);
      }
      const refused = refusedKeyMap(model, ctx, arg.type);
      if (refused !== undefined) {
        out.push(`
test('T-2: ${name} refuses a ${refused.kind} key in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, refused.value]]))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_argument_type');
});`);
      }
      if (arg.default !== undefined) {
        out.push(`
test('U-2: ${name} takes null in ${argName} as a value', () => {
  assert.throws(() => ${call(new Map([[arg, 'null']]))}, (error) => ['invalid_argument_type', 'invalid_number', 'invalid_text'].includes(error.kind));
});`);
      }
      const bytes = bytesKind(arg.type);
      if (bytes !== undefined) {
        out.push(`
test('T-7: ${name} refuses a ${argName} that is not ${bytes === 'source' ? 'a string or a Uint8Array' : 'a Uint8Array'}', () => {
  for (const bad of [1, new Uint16Array(1), [1]${bytes === 'source' ? '' : ", 'a'"}]) {
    assert.throws(() => ${call(new Map([[arg, 'bad']]))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_argument_type');
  }
});`);
      }
      if (bytes === 'source') {
        out.push(`
test('B-3: ${name} refuses an unpaired surrogate in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, "'\\uD800'"]]))}, (error) => error instanceof pkg.${cls('value')} && error.kind === 'invalid_text');
});`);
      }
      const text = textKind(arg.type);
      if (text !== undefined) {
        const bad = text === 'latin1' ? "'\\u0100'" : "'\\uD800'";
        out.push(`
test('B-3: ${name} refuses ${text === 'latin1' ? 'a character above U+00FF' : 'an unpaired surrogate'} in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, wrapText(arg.type, bad)]]))}, (error) => error instanceof pkg.${cls('value')} && error.kind === 'invalid_text');
});`);
      }
    }
    for (const pair of reachable ? samePairs(model, ctx, fn) : []) {
      usesOutcome = true;
      const argName = langName('wasm', pair.arg.name, 'variable');
      out.push(`
test('${pair.rule === 'U-2' ? `U-2: ${name} without ${argName} is the call with its default` : `T-1: ${name} takes a text in ${argName} as its UTF-8 bytes`}', () => {
  assert.deepStrictEqual(outcome(() => ${target(callArgs(model, ctx, fn, pair.left))}), outcome(() => ${target(callArgs(model, ctx, fn, pair.right))}));
});`);
    }
    for (const kase of raisingCases(model, fn)) {
      const args = callArgs(model, ctx, fn, (arg) => caseValue(model, ctx, arg, kase.args));
      const receiver = kase.receiver === undefined ? '' : made(kase.receiver);
      out.push(`
test('B-4: ${name} ${kase.id}', () => {
  assert.throws(() => ${invoke(fn, args, receiver)}, (error) =>
    error.constructor === pkg.${exactClass(kase.raises)} &&
    error instanceof pkg.${cls(kase.raises.category)} &&
    error instanceof ${jsBase(kase.raises.category)} &&
    error.kind === ${jsString(kase.raises.kind)} &&
    error.status === ${kase.raises.status === null ? 'null' : String(kase.raises.status)} &&
    error.errno === null);
});`);
    }
    // GN-13e: every case that does not raise runs, and its result is compared with the value that the case gives.
    for (const kase of resultCases(model, fn)) {
      const expected = kase.refused !== undefined ? { refused: kase.refused } : kase.expected === undefined ? undefined : expectedText(model, ctx, fn, kase.expected.value);
      const call = kase.refused !== undefined ? '' : invoke(fn, callArgs(model, ctx, fn, (arg) => caseValue(model, ctx, arg, kase.args)), kase.receiver === undefined ? '' : made(kase.receiver));
      usesOrdered ||= expected !== undefined && 'text' in expected;
      const check = expected === undefined ? `${call};` : 'refused' in expected ? `assert.fail(${jsString(expected.refused)});` : `assert.deepStrictEqual(ordered(${call}), ordered(${expected.text}));`;
      out.push(`
test('GN-13e: ${name} ${kase.id}', () => {
  ${check}
});`);
    }
    for (const kase of stringCases(model, fn)) {
      out.push(`
test('N-4: ${name} ${kase.id}', () => {
  assert.equal(${invoke(fn, '', made(kase.receiver))}, ${jsString(kase.result)});
});`);
    }
    // N-4: a hook takes the arguments of the language's protocol, so it has no G-7 test.
    if (fn.kind === 'property' || fn.special !== undefined || !reachable) continue;
    const values = (arg: { type: unknown }): string => placeholder(model, ctx, arg.type as never);
    const record = fn.record;
    const recordTests = record === undefined ? '' : `
  const fields = { ${(record.unit.fields ?? []).map((f) => `${langName('wasm', f.name, 'variable')}: ${placeholder(model, ctx, f.type)}`).join(', ')} };
  const positional = [${fn.args.filter((a) => !a.field).map(values).join(', ')}];
  assert.throws(() => ${target('...positional, { ...fields, notAMember: 1 }')}, (error) => error.constructor === TypeError && /no member notAMember/.test(error.message));
  for (const field of [${(record.unit.fields ?? []).filter((f) => f.default === undefined).map((f) => jsString(langName('wasm', f.name, 'variable'))).join(', ')}]) {
    const lacking = { ...fields, [field]: undefined };
    assert.throws(() => ${target('...positional, lacking')}, (error) => error.constructor === TypeError && /lacks the member/.test(error.message), field);
  }`;
    out.push(`
test('G-7: ${name} counts and names its arguments', () => {${fn.params.every((p) => p.default !== undefined && p !== fn.record?.param) ? '' : `
  assert.throws(() => ${target('')}, (error) => error.constructor === TypeError && /takes/.test(error.message));`}
  assert.throws(() => ${target([callArgs(model, ctx, fn, values), 'null'].filter((a) => a !== '').join(', '))}, (error) => error.constructor === TypeError && /takes/.test(error.message));${recordTests}
});`);
  }
  return `${header('//')}
import assert from 'node:assert/strict';
import test from 'node:test';
import * as pkg from ${jsString(entry)};
${usesOrdered ? NODE_ORDERED : ''}${usesOutcome ? `
// G-5: what a call gives: its result, or the class and the kind of its failure.
function outcome(call) {
  try {
    return { result: call() };
  } catch (error) {
    return { error: error.constructor, kind: error.kind };
  }
}
` : ''}${out.join('\n')}

// Last (GW-7): a module built with panic=abort traps here, and every later call is kind internal.
test('B-7: a panic is kind internal, and a trap breaks the instance for every later call', async () => {
  const glue = await import(new URL('./${wasmGlue(model)}.js', import.meta.resolve(${jsString(entry)})).href);
  const state = await import(new URL('./state.mjs', import.meta.resolve(${jsString(entry)})).href);
  const internal = (error) => error.constructor === pkg.${cls('internal')} && error.kind === 'internal';
  assert.throws(() => state.enter(pkg.${cls('internal')}, () => glue.__panicTest()), internal);${laterCall}
});
`;
}
