// The generated node:test module of the WASM binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run
// against the subpath ./wasm of the installed package after init (P-5). The JavaScript values are those of Node.

import { type Model, langName } from './model.ts';
import { type Context, callArgs, fromJson, isNumber, placeholder, raisingCases, textKind, wrapText } from './samples.ts';
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
  };
  const cls = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  const out: string[] = [];
  for (const fn of model.functions) {
    const name = langName('wasm', fn.member.name, 'callable');
    const call = (override: Map<unknown, string>): string =>
      `pkg.${name}(${callArgs(model, ctx, fn, (arg) => override.get(arg) ?? placeholder(model, ctx, arg.type))})`;
    for (const arg of fn.args) {
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
      out.push(`
test('B-4: ${name} ${kase.id}', () => {
  assert.throws(() => pkg.${name}(${args}), (error) =>
    error.constructor === pkg.${cls(kase.raises.category)} &&
    error instanceof ${jsBase(kase.raises.category)} &&
    error.kind === ${jsString(kase.raises.kind)} &&
    error.status === ${kase.raises.status === null ? 'null' : String(kase.raises.status)} &&
    error.errno === null);
});`);
    }
    const values = (arg: { type: unknown }): string => placeholder(model, ctx, arg.type as never);
    const record = fn.record;
    const recordTests = record === undefined ? '' : `
  const fields = { ${(record.unit.fields ?? []).map((f) => `${langName('wasm', f.name, 'variable')}: ${placeholder(model, ctx, f.type)}`).join(', ')} };
  const positional = [${fn.args.filter((a) => !a.field).map(values).join(', ')}];
  assert.throws(() => pkg.${name}(...positional, { ...fields, notAMember: 1 }), (error) => error.constructor === TypeError && /no member notAMember/.test(error.message));
  for (const field of Object.keys(fields)) {
    const lacking = { ...fields, [field]: undefined };
    assert.throws(() => pkg.${name}(...positional, lacking), (error) => error.constructor === TypeError && /lacks the member/.test(error.message), field);
  }`;
    out.push(`
test('G-7: ${name} counts and names its arguments', () => {
  assert.throws(() => pkg.${name}(), (error) => error.constructor === TypeError && /takes/.test(error.message));
  assert.throws(() => pkg.${name}(${callArgs(model, ctx, fn, values)}, null), (error) => error.constructor === TypeError && /takes/.test(error.message));${recordTests}
});`);
  }
  return `${header('//')}
import assert from 'node:assert/strict';
import test from 'node:test';
import * as pkg from ${jsString(entry)};

await pkg.init();
${out.join('\n')}

// Last: a module built with panic=abort traps here and cannot run another call (GN-18).
test('B-7: a panic is kind internal', async () => {
  const glue = await import(new URL('./${wasmGlue(model)}.js', import.meta.resolve(${jsString(entry)})).href);
  assert.throws(() => glue.__panicTest(), (error) => error.constructor === pkg.${cls('internal')} && error.kind === 'internal');
});
`;
}
