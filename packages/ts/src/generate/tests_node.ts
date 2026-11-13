// The generated node:test module of the Node binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run against
// the installed package.

import { type Model, POISON_ENTRY, Unsupported, errorUnitOfKind, hookCall, langName, unitOf } from './model.ts';
import { heldTests } from './tests_held.ts';
import { addonBase } from './node.ts';
import { isHost } from './packages.ts';
import { type CallbackHow, type Context, type MadeForm, type Receiver, callArgs, isPlain, madeLines, callbackArg, callables, bytesKind, caseValue, expectedText, isNumber, placeholder, fixtureValues, fixturesOf, aliasCases, aliasRepresentative, expectedErrno, fromJson, judgesCallbackResult, raisingCases, refusedKeyMap, resultCases, samePairs, sampleReceiver, stringCases, textKind, wrapText } from './samples.ts';
import type { Fn } from './model.ts';
import { header, jsString } from './text.ts';

const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['NaN', 'Infinity', '-Infinity', '1.5', 'true', "'7'", '-1', '2 ** 53'],
  int: ['NaN', 'Infinity', '-Infinity', '1.5', 'true', "'7'", '2 ** 53', '-(2 ** 53)'],
  float: ['true', "'7'", 'null'],
};

// G-5: the callback fixture. A call that no row answers is recorded and throws, so a core that swallows the exception
// still fails the test, which reads the record.
export const NODE_FIXTURE = `
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

// GN-13e: a result in a form that assert.deepStrictEqual compares with the order of a Map: a Map is its entries.
export const NODE_ORDERED = `
function ordered(value) {
  if (value instanceof Map) return { entries: [...value].map(([key, item]) => [ordered(key), ordered(item)]) };
  if (Array.isArray(value)) return value.map(ordered);
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ordered(item)]));
  }
  return value;
}
`;

// G-5: what a call gives: its result, or the class and the kind of its failure.
const NODE_OUTCOME = `
function outcome(call) {
  try {
    return { result: call() };
  } catch (error) {
    return { error: error.constructor, kind: error.kind };
  }
}
`;

export function nodeTests(model: Model): string {
  const npm = (model.contract.packages['node'] as { package: string }).package;
  // L-2a: the tests of a host package import the generated entry beside them, as host code does; the package's own
  // entry is the host's.
  const esm = isHost(model.contract, 'node') ? '../index.mjs' : npm;
  const cjsEntry = isHost(model.contract, 'node') ? '../index.cjs' : npm;
  const ctx: Context = { lang: 'node', enumRef: (_name, value) => jsString(value),
    callbackNew: (unit, how) => {
      if ('missing' in how) return '{}';
      const body = 'raise' in how ? `() => { throw ${how.raise}; }` : how.returns === 'wrong' ? '() => Symbol()' : '() => null';
      return `{ ${(unit.members ?? []).map((m) => `${langName('node', m.name, 'callable')}: ${body}`).join(', ')} }`;
    },
    recordNew: (unit, fields) => `{ ${(unit.fields ?? []).map((f, i) => `${langName('node', f.name, 'variable')}: ${fields[i] ?? ''}`).join(', ')} }`,
  };
  const cls = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  // E-2: the exact class of a kind is the class of the error unit that its row names, or the class of its category.
  // E-2, B-4: the exact class of a failure of a case: the class of the error unit of its kind, or of its category.
  const exactClass = (raises: { kind: string; category: string }): string => {
    const unit = errorUnitOfKind(model, raises.kind);
    return unit === undefined ? cls(raises.category) : langName('node', unit.unit.name, 'class');
  };
  const out: string[] = [];
  let usesFixture = false;
  let usesErrno = false;
  let usesAddon = false;
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

  // GN-13f: the statements that make the receiver of a case, each on a line of the test, and its expression.
  const form: MadeForm = {
    ctx,
    invoke,
    bind: (local, expr) => `const ${local} = ${expr};`,
    name: (local) => local,
    run: (expr) => `${expr};`,
    pick: (expr, step) => ('field' in step ? `${expr}.${langName('node', step.field.split('_'), 'variable')}` : `${expr}[${'index' in step ? step.index : step.tuple}]`),
  };
  const receiverOfCase = (receiver: Receiver | undefined): { lines: string; expr: string } => {
    if (receiver === undefined) return { lines: '', expr: '' };
    const built = madeLines(model, form, receiver);
    return { lines: built.lines.map((line) => `\n  ${line}`).join(''), expr: built.expr };
  };
  // GN-13f: a receiver as one expression; an instance value is made in a function that the expression calls.
  const made = (receiver: Receiver): string => {
    if (isPlain(receiver)) return invoke(receiver.factory, callArgs(model, ctx, receiver.factory, (arg) => caseValue(model, ctx, arg, receiver.args)), '');
    const built = madeLines(model, form, receiver);
    return `(() => { ${built.lines.join(' ')} return ${built.expr}; })()`;
  };
  let usesOutcome = false;
  let usesOrdered = false;
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
      // U-7: a kind of an alias's in function reaches the caller of a member that takes the alias.
      const refusedValue = aliasRepresentative(model, ctx, arg.type);
      if (refusedValue !== undefined) {
        out.push(`
test('U-7: ${name} gives the kind of ${refusedValue.kase.alias.unit.id} in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, refusedValue.value]]))}, (error) => error.constructor === pkg.${cls(refusedValue.kase.category)} && error.kind === ${jsString(refusedValue.kase.kind)});
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
      const argName = langName('node', pair.arg.name, 'variable');
      out.push(`
test('${pair.rule === 'U-2' ? `U-2: ${name} without ${argName} is the call with its default` : `T-1: ${name} takes a text in ${argName} as its UTF-8 bytes`}', () => {
  assert.deepStrictEqual(outcome(() => ${target(callArgs(model, ctx, fn, pair.left))}), outcome(() => ${target(callArgs(model, ctx, fn, pair.right))}));
});`);
    }
    for (const kase of raisingCases(model, fn)) {
      // G-5: a callback parameter is the fixture of the case, whose record of calls the test reads after the call.
      const fixtures = fixturesOf(model, fn, kase.id, kase.args).map((fixture, i) => ({ fixture, name: `fixture${i}`, values: fixtureValues(model, ctx, fixture) }));
      usesFixture ||= fixtures.length > 0;
      const caseArg = (arg: Fn['args'][number]): string | undefined => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : `${found.name}.object`;
      };
      const receiverMade = receiverOfCase(kase.receiver);
      const made_ = receiverMade.expr;
      // G-5: a case that arms faults makes its receiver and arguments first, so no call but the one under test runs
      // between the arming and that call, and requires every armed fault to have fired.
      const locals = kase.faults === undefined ? [] : [...(made_ === '' ? [] : [['receiver', made_]]), ...fn.args.flatMap((arg, i) => { const value = caseArg(arg); return value === undefined ? [] : [[`arg${i}`, value]]; })];
      const arming = kase.faults === undefined ? '' : `${locals.map(([local, value]) => `\n  const ${local} = ${value};`).join('')}\n  const armed = addon().__armFaults(${jsString(fn.member.id)}, ${jsString(kase.faults)});`;
      const args = callArgs(model, ctx, fn, kase.faults === undefined ? caseArg : (arg) => (caseArg(arg) === undefined ? undefined : `arg${fn.args.indexOf(arg)}`));
      const receiver = kase.faults === undefined || made_ === '' ? made_ : 'receiver';
      const errno = expectedErrno(kase);
      usesErrno ||= errno !== null && 'symbol' in errno;
      usesAddon ||= kase.faults !== undefined;
      const before = fixtures.map((f) => `\n  const ${f.name} = fixture([${f.values.members.join(', ')}], [${f.values.rows.map((row) => `[${row.join(', ')}]`).join(', ')}]);`).join('');
      const after = fixtures
        .map((f) => `\n  assert.deepEqual(${f.name}.unexpected, []);${f.values.calls === undefined ? '' : `\n  assert.deepEqual(${f.name}.calls, [${f.values.calls.map((call) => `[${call.join(', ')}]`).join(', ')}]);`}`)
        .join('');
      out.push(`
test('B-4: ${name} ${kase.id}', () => {${receiverMade.lines}${before}${arming}
  assert.throws(() => ${invoke(fn, args, receiver)}, (error) =>
    error.constructor === pkg.${exactClass(kase.raises)} &&
    error instanceof pkg.${cls(kase.raises.category)} &&
    error instanceof ${nodeBase(kase.raises.category)} &&
    error.kind === ${jsString(kase.raises.kind)} &&
    error.status === ${kase.raises.status === null ? 'null' : String(kase.raises.status)} &&
    error.errno === ${errno === null ? 'null' : 'symbol' in errno ? `errnoOf.${errno.symbol}` : String(errno.value)});${kase.faults === undefined ? '' : '\n  assert.deepEqual(addon().__faultLeft(armed), []);'}${after}
});`);
    }
    // GN-13e: every case that does not raise runs, and its result is compared with the value that the case gives.
    for (const kase of resultCases(model, fn)) {
      if (kase.refused !== undefined) {
        out.push(`
test('GN-13e: ${name} ${kase.id}', () => {
  assert.fail(${jsString(kase.refused)});
});`);
        continue;
      }
      const fixtures = fixturesOf(model, fn, kase.id, kase.args).map((fixture, i) => ({ fixture, name: `fixture${i}`, values: fixtureValues(model, ctx, fixture) }));
      usesFixture ||= fixtures.length > 0;
      const before = fixtures.map((f) => `\n  const ${f.name} = fixture([${f.values.members.join(', ')}], [${f.values.rows.map((row) => `[${row.join(', ')}]`).join(', ')}]);`).join('');
      const after = fixtures
        .map((f) => `\n  assert.deepEqual(${f.name}.unexpected, []);${f.values.calls === undefined ? '' : `\n  assert.deepEqual(${f.name}.calls, [${f.values.calls.map((call) => `[${call.join(', ')}]`).join(', ')}]);`}`)
        .join('');
      const args = callArgs(model, ctx, fn, (arg) => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : `${found.name}.object`;
      });
      const receiverMade = receiverOfCase(kase.receiver);
      const call = invoke(fn, args, receiverMade.expr);
      const expected = kase.expected === undefined ? undefined : expectedText(model, ctx, fn, kase.expected.value);
      usesOrdered ||= expected !== undefined && 'text' in expected;
      const check = expected === undefined ? `\n  ${call};` : 'refused' in expected ? `\n  assert.fail(${jsString(expected.refused)});` : `\n  assert.deepStrictEqual(ordered(${call}), ordered(${expected.text}));`;
      out.push(`
test('GN-13e: ${name} ${kase.id}', () => {${receiverMade.lines}${before}${check}${after}
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
});${judgesCallbackResult(model, cbUnit) ? `

test('K-2: ${name} refuses a callback result of another type', () => {
  assert.throws(() => ${with_({ returns: 'wrong' })}, (error) => ['invalid_argument_type', 'invalid_number', 'invalid_text'].includes(error.kind));
});` : ''}`);
    }
    for (const kase of stringCases(model, fn)) {
      out.push(`
test('N-4: ${name} ${kase.id}', () => {${receiverOfCase(kase.receiver).lines}
  assert.equal(${invoke(fn, '', receiverOfCase(kase.receiver).expr)}, ${jsString(kase.result)});
});`);
    }
    // N-4: a hook takes the arguments of the language's protocol, so it has no G-7 test.
    if (fn.kind === 'property' || fn.special !== undefined || !reachable) continue;
    const record = fn.record;
    const recordTests = record === undefined ? '' : `
  const fields = { ${(record.unit.fields ?? []).map((f) => `${langName('node', f.name, 'variable')}: ${placeholder(model, ctx, f.type)}`).join(', ')} };
  const positional = [${fn.args.filter((a) => !a.field).map(values).join(', ')}];
  assert.throws(() => ${target('...positional, { ...fields, notAMember: 1 }')}, (error) => error.constructor === TypeError && /no member notAMember/.test(error.message));
  for (const field of [${(record.unit.fields ?? []).filter((f) => f.default === undefined).map((f) => jsString(langName('node', f.name, 'variable'))).join(', ')}]) {
    const lacking = { ...fields, [field]: undefined };
    assert.throws(() => ${target('...positional, lacking')}, (error) => error.constructor === TypeError && /lacks the member/.test(error.message), field);
  }`;
    out.push(`
test('G-7: ${name} counts and names its arguments', () => {${fn.params.every((p) => p.default !== undefined && p !== fn.record?.param) ? '' : `
  assert.throws(() => ${target('')}, (error) => error.constructor === TypeError && /takes/.test(error.message));`}
  assert.throws(() => ${target([callArgs(model, ctx, fn, values), 'null'].filter((a) => a !== '').join(', '))}, (error) => error.constructor === TypeError && /takes/.test(error.message));${recordTests}
});`);
  }
  // B-5c (GN-6h): a poisoned object is refused at every place, and an instance at a write place and another is busy.
  const held = heldTests(model, ctx, invoke, 'held');
  const refused = (category: string, kind: string, call: string): string => `
  assert.throws(() => ${call}, (error) => error.constructor === pkg.${cls(category)} && error.kind === ${jsString(kind)});`;
  for (const test of held.poison) {
    out.push(`
test('B-5c: ${langName('node', test.object.unit.name, 'class')} refuses a poisoned object', () => {
  const held = ${test.instance};${[`addon().${POISON_ENTRY.node}(held)`, test.receiver, test.parameter].filter((call) => call !== undefined).map((call) => refused('internal', 'internal', call)).join('')}
});`);
  }
  for (const test of held.busy) {
    out.push(`
test('B-5c: ${langName('node', test.fn.unit.name, 'class')}.${langName('node', test.fn.member.name, 'callable')} refuses the instance at two places', () => {
  const held = ${test.instance};${test.armed === undefined ? '' : `\n  const armed = addon().__armFaults(${jsString(test.fn.member.id)}, ${jsString(test.armed.faults)});`}${refused('busy', 'busy', test.call)}${test.after === undefined ? '' : `\n  ${test.after};`}${test.armed === undefined ? '' : `
  // GN-8a: the refused call did not reach the core, so the next call takes the arming.${refused(test.armed.category, test.armed.kind, test.armed.again)}
  assert.deepEqual(addon().__faultLeft(armed), []);`}
});`);
  }
  // U-7: the cases of an alias run its in function alone, through the entry point of the feature codec-test.
  for (const kase of aliasCases(model)) {
    usesAddon = true;
    out.push(`
test('U-7: ${kase.alias.unit.id} in ${kase.id}', () => {
  assert.throws(() => addon().__aliasIn${langName('node', kase.alias.unit.name, 'class')}(${fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)}), (error) => error.constructor === pkg.${cls(kase.category)} && error.kind === ${jsString(kase.kind)});
});`);
  }
  return `${header('//')}
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';${usesFixture ? "\nimport { isDeepStrictEqual } from 'node:util';" : ''}
${usesErrno ? "import { constants } from 'node:os';\n" : ''}import * as pkg from ${jsString(esm)};

const require = createRequire(import.meta.url);
${usesFixture ? NODE_FIXTURE : ''}${usesOutcome ? NODE_OUTCOME : ''}${usesOrdered ? NODE_ORDERED : ''}
${usesErrno ? '// G-5: the value that the symbol of an errno has on this machine.\nconst errnoOf = constants.errno;\n' : ''}
// T-2: the addon of the platform package, or the file beside the entry of a build in a checkout (GN-3c).
function addon() {
  const platform = \`\${process.platform}-\${process.arch}\${process.platform === 'linux' ? '-gnu' : ''}\`;
  try {
    return require(\`${npm}-\${platform}\`);
  } catch {
    return require(join(dirname(require.resolve(${jsString(cjsEntry)})), \`${addonBase(model)}.\${platform}.node\`));
  }
}

test('B-7: a panic is kind internal', () => {
  assert.throws(() => addon().__panicTest(), (error) => error.constructor === pkg.${cls('internal')} && error.kind === 'internal');
});

test('the CommonJS and the ESM entries share their classes', () => {
  const cjs = require(${jsString(cjsEntry)});
  assert.equal(cjs.${cls('value')}, pkg.${cls('value')});
});
${out.join('\n')}
`;
}

const nodeBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';
