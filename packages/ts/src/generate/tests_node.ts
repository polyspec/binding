// The generated node:test module of the Node binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run against
// the installed package.

import { type Model, hookCall, langName, unitOf } from './model.ts';
import { addonBase } from './node.ts';
import { type CallbackHow, type Context, type Receiver, callArgs, callbackArg, callables, fromJson, isNumber, placeholder, fixtureValues, fixturesOf, raisingCases, refusedKeyMap, sampleReceiver, stringCases, textKind, wrapText } from './samples.ts';
import type { Fn } from './model.ts';
import { header, jsString } from './text.ts';

const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['NaN', 'Infinity', '-Infinity', '1.5', 'true', "'7'", '-1', '2 ** 53'],
  int: ['NaN', 'Infinity', '-Infinity', '1.5', 'true', "'7'", '2 ** 53', '-(2 ** 53)'],
  float: ['true', "'7'", 'null'],
};

// G-5: the callback fixture. A call that no row answers is recorded and throws, so a core that swallows the exception
// still fails the test, which reads the record.
const NODE_FIXTURE = `
class UnexpectedCall extends Error {}

function fixture(members, rows) {
  const unexpected = [];
  const calls = [];
  const left = [...rows];
  const object = {};
  for (const name of members) {
    object[name] = (...args) => {
      calls.push([name, args]);
      const at = left.findIndex((row) => row[0] === name && isDeepStrictEqual(row[1], args));
      if (at < 0) {
        unexpected.push([name, args]);
        throw new UnexpectedCall(\`\${name}(\${args.map(String).join(', ')})\`);
      }
      const [, , result, once] = left[at];
      if (once) left.splice(at, 1);
      return result;
    };
  }
  return { object, unexpected, calls };
}
`;

export function nodeTests(model: Model): string {
  const npm = (model.contract.packages['node'] as { package: string }).package;
  const ctx: Context = { lang: 'node', enumRef: (_name, value) => jsString(value),
    callbackNew: (unit, how) => {
      if ('missing' in how) return '{}';
      const body = 'raise' in how ? `() => { throw ${how.raise}; }` : how.returns === 'wrong' ? '() => Symbol()' : '() => null';
      return `{ ${(unit.members ?? []).map((m) => `${langName('node', m.name, 'callable')}: ${body}`).join(', ')} }`;
    },
    recordNew: (unit, fields) => `{ ${(unit.fields ?? []).map((f, i) => `${langName('node', f.name, 'variable')}: ${fields[i] ?? ''}`).join(', ')} }`,
  };
  const cls = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  const out: string[] = [];
  let usesFixture = false;
  const invoke = (fn: Fn, args: string, receiver: string): string => {
    const hook = hookCall('node', fn, receiver);
    if (hook !== undefined) return hook;
    const member = langName('node', fn.member.name, 'callable');
    const cls = `pkg.${langName('node', fn.unit.name, 'class')}`;
    if (fn.kind === 'function') return `pkg.${member}(${args})`;
    if (fn.kind === 'constructor') return `new ${cls}(${args})`;
    if (fn.kind === 'static') return `${cls}.${member}(${args})`;
    if (fn.kind === 'property') return `${receiver}.${member}`;
    return `${receiver}.${member}(${args})`;
  };
  ctx.objectNew = (factory, args) => invoke(factory, args, '');
  const made = (receiver: Receiver): string =>
    invoke(receiver.factory, callArgs(model, ctx, receiver.factory, (arg) => fromJson(model, ctx, arg.type, receiver.args.get(arg) ?? null)), '');
  for (const fn of callables(model)) {
    const name = fn.kind === 'function' ? langName('node', fn.member.name, 'callable') : `${langName('node', fn.unit.name, 'class')}.${fn.kind === 'constructor' ? 'constructor' : langName('node', fn.member.name, 'callable')}`;
    const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
    const recv = sample === undefined ? '' : made(sample);
    const target = (args: string): string => invoke(fn, args, recv);
    const call = (override: Map<unknown, string>): string =>
      target(callArgs(model, ctx, fn, (arg) => override.get(arg) ?? placeholder(model, ctx, arg.type)));
    const reachable = fn.receiver === undefined || sample !== undefined;
    for (const arg of reachable ? fn.args : []) {
      const argName = langName('node', arg.name, 'variable');
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
      // G-5: a callback parameter is the fixture of the case, whose record of calls the test reads after the call.
      const fixtures = fixturesOf(model, fn, kase.id, kase.args).map((fixture, i) => ({ fixture, name: `fixture${i}`, values: fixtureValues(model, ctx, fixture) }));
      usesFixture ||= fixtures.length > 0;
      const args = callArgs(model, ctx, fn, (arg) => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? fromJson(model, ctx, arg.type, kase.args.get(arg) ?? null) : `${found.name}.object`;
      });
      const receiver = kase.receiver === undefined ? '' : made(kase.receiver);
      const before = fixtures.map((f) => `\n  const ${f.name} = fixture([${f.values.members.join(', ')}], [${f.values.rows.map((row) => `[${row.join(', ')}]`).join(', ')}]);`).join('');
      const after = fixtures
        .map((f) => `\n  assert.deepEqual(${f.name}.unexpected, []);${f.values.calls === undefined ? '' : `\n  assert.deepEqual(${f.name}.calls, [${f.values.calls.map((call) => `[${call.join(', ')}]`).join(', ')}]);`}`)
        .join('');
      out.push(`
test('B-4: ${name} ${kase.id}', () => {${before}
  assert.throws(() => ${invoke(fn, args, receiver)}, (error) =>
    error.constructor === pkg.${cls(kase.raises.category)} &&
    error instanceof ${nodeBase(kase.raises.category)} &&
    error.kind === ${jsString(kase.raises.kind)} &&
    error.status === ${kase.raises.status === null ? 'null' : String(kase.raises.status)} &&
    error.errno === null);${after}
});`);
    }
    const values = (arg: { type: unknown }): string => placeholder(model, ctx, arg.type as never);
    const callback = callbackArg(model, fn);
    const cbUnit = callback === undefined ? undefined : unitOf(model, callback.type);
    if (callback !== undefined && cbUnit !== undefined && reachable) {
      const with_ = (how: CallbackHow): string =>
        target(callArgs(model, ctx, fn, (arg) => (arg === callback ? ctx.callbackNew(cbUnit, how) : placeholder(model, ctx, arg.type, true))));
      out.push(`
test('K-2: ${name} refuses a callback without its members', () => {
  assert.throws(() => ${with_({ missing: true })}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_callback');
});

test('K-2: ${name} lets the exception of a callback through', () => {
  const raised = new Error('raised by the callback');
  assert.throws(() => ${with_({ raise: 'raised' })}, (error) => error === raised);
});

test('K-2: ${name} refuses a callback result of another type', () => {
  assert.throws(() => ${with_({ returns: 'wrong' })}, (error) => ['invalid_argument_type', 'invalid_number', 'invalid_text'].includes(error.kind));
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
    const record = fn.record;
    const recordTests = record === undefined ? '' : `
  const fields = { ${(record.unit.fields ?? []).map((f) => `${langName('node', f.name, 'variable')}: ${placeholder(model, ctx, f.type)}`).join(', ')} };
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
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';${usesFixture ? "\nimport { isDeepStrictEqual } from 'node:util';" : ''}
import * as pkg from ${jsString(npm)};

const require = createRequire(import.meta.url);
${usesFixture ? NODE_FIXTURE : ''}
test('B-7: a panic is kind internal', () => {
  // T-2: the addon of the platform package, or the file beside the entry of a build in a checkout (GN-3c).
  const platform = \`\${process.platform}-\${process.arch}\${process.platform === 'linux' ? '-gnu' : ''}\`;
  let addon;
  try {
    addon = require(\`${npm}-\${platform}\`);
  } catch {
    addon = require(join(dirname(require.resolve(${jsString(npm)})), \`${addonBase(model)}.\${platform}.node\`));
  }
  assert.throws(() => addon.__panicTest(), (error) => error.constructor === pkg.${cls('internal')} && error.kind === 'internal');
});

test('the CommonJS and the ESM entries share their classes', () => {
  const cjs = require(${jsString(npm)});
  assert.equal(cjs.${cls('value')}, pkg.${cls('value')});
});
${out.join('\n')}
`;
}

const nodeBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';
