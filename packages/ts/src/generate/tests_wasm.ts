// The generated node:test module of the WASM binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run
// against the subpath ./wasm of the installed package after init (P-5). The JavaScript values are those of Node.

import { type Fn, type Model, hookCall, langName } from './model.ts';
import { type Context, type Receiver, callArgs, callables, fromJson, isNumber, placeholder, raisingCases, refusedKeyMap, sampleReceiver, stringCases, textKind, wrapText } from './samples.ts';
import { header, jsString } from './text.ts';
import { wasmGlue } from './wasm.ts';

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
  const out: string[] = [];
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
    invoke(receiver.factory, callArgs(model, ctx, receiver.factory, (arg) => fromJson(model, ctx, arg.type, receiver.args.get(arg) ?? null)), '');
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
      const text = textKind(arg.type);
      if (text !== undefined) {
        const bad = text === 'latin1' ? "'\\u0100'" : "'\\uD800'";
        out.push(`
test('B-3: ${name} refuses ${text === 'latin1' ? 'a character above U+00FF' : 'an unpaired surrogate'} in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, wrapText(arg.type, bad)]]))}, (error) => error instanceof pkg.${cls('value')} && error.kind === 'invalid_text');
});`);
      }
    }
    for (const kase of raisingCases(model, fn)) {
      const args = callArgs(model, ctx, fn, (arg) => fromJson(model, ctx, arg.type, kase.args.get(arg) ?? null));
      const receiver = kase.receiver === undefined ? '' : made(kase.receiver);
      out.push(`
test('B-4: ${name} ${kase.id}', () => {
  assert.throws(() => ${invoke(fn, args, receiver)}, (error) =>
    error.constructor === pkg.${cls(kase.raises.category)} &&
    error instanceof ${jsBase(kase.raises.category)} &&
    error.kind === ${jsString(kase.raises.kind)} &&
    error.status === ${kase.raises.status === null ? 'null' : String(kase.raises.status)} &&
    error.errno === null);
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
  for (const field of Object.keys(fields)) {
    const lacking = { ...fields, [field]: undefined };
    assert.throws(() => ${target('...positional, lacking')}, (error) => error.constructor === TypeError && /lacks the member/.test(error.message), field);
  }`;
    out.push(`
test('G-7: ${name} counts and names its arguments', () => {${fn.args.length === 0 ? '' : `
  assert.throws(() => ${target('')}, (error) => error.constructor === TypeError && /takes/.test(error.message));`}
  assert.throws(() => ${target([callArgs(model, ctx, fn, values), 'null'].filter((a) => a !== '').join(', '))}, (error) => error.constructor === TypeError && /takes/.test(error.message));${recordTests}
});`);
  }
  return `${header('//')}
import assert from 'node:assert/strict';
import test from 'node:test';
import * as pkg from ${jsString(entry)};
${out.join('\n')}

// Last (GW-7): a module built with panic=abort traps here, and every later call is kind internal.
test('B-7: a panic is kind internal, and a trap breaks the instance for every later call', async () => {
  const glue = await import(new URL('./${wasmGlue(model)}.js', import.meta.resolve(${jsString(entry)})).href);
  const state = await import(new URL('./state.mjs', import.meta.resolve(${jsString(entry)})).href);
  const internal = (error) => error.constructor === pkg.${cls('internal')} && error.kind === 'internal';
  assert.throws(() => state.enter(pkg.${cls('internal')}, () => glue.__panicTest()), internal);${laterCall}
});
`;
}
