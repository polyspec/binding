// The generated node:test module of the Node binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run against
// the installed package.

import { type Model, callsCode, POISON_ENTRY, Unsupported, cleanupWarning, errorUnitOfKind, hookCall, langName, memberName, unitOf, awaits, takesNull, type Arg, nativeRoundTrip, takesFunction, machineFunction } from './model.ts';
import { heldTests } from './tests_held.ts';
import { addonBase } from './node.ts';
import { isHost } from './packages.ts';
import { foreignReaders, foreignClassNames, nodeForeignRead } from './value_class.ts';
import type { Unit } from '../contract.ts';
import { type CallbackHow, type Context, type MadeForm, type Receiver, callArgs, caseRefusal, isPath, isPlain, madeLines, callbackArg, callables, bytesKind, caseValue, expectedText, isNumber, nodeTokens, tokenForms, placeholder, fixtureValues, fixturesOf, aliasCases, aliasRepresentative, expectedErrno, fromJson, judgesCallbackResult, raisingCases, refusedKeyMap, unsafeKeyMap, resultCases, samePairs, sampleReceiver, primitiveCases, refusesNull, stringCases, textKind, wrapText, functionFixturesOf, type After, FIXTURE_RAISED, callbackCases, stepExpected } from './samples.ts';
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
      const [, , result, once, raised] = left[at];
      if (once) left.splice(at, 1);
      if (raised !== null) throw raised;
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

// GN-13e, B2.121: ordered with a branch that reads an instance of a value class of another repository, or of a map
// class of its owner, through the members of its in row (readForeign), so that two instances compare by what they hold.
export const nodeOrdered = (foreign: string[], read: string): string => (foreign.length === 0 ? NODE_ORDERED : `${read}${NODE_ORDERED.replace(
  'function ordered(value) {\n',
  `function ordered(value) {\n  if (${foreign.map((c) => `value instanceof ${c}`).join(' || ')}) return { foreign: readForeign(value) };\n`,
)}`);

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

// GN-6m: what a call that may wait gives: its result, or the class and the kind of its failure.
export const NODE_SETTLED = `
async function settled(call) {
  try {
    return { result: await call() };
  } catch (error) {
    return { error: error.constructor, kind: error.kind };
  }
}
`;

// GN-6m: a test that calls a member that waits awaits it: each test of the block is an async function, a failure is a
// rejection and an outcome is settled.
export const awaitedTest = (block: string): string => {
  if (!/\bawait /.test(block)) return block;
  return block
    .replaceAll(/(\ntest\('[^\n]*?'), \(\) => \{/g, '$1, async () => {')
    .replaceAll('assert.throws(() => ', 'await assert.rejects(async () => ')
    .replaceAll('outcome(() => ', 'await settled(async () => ');
};

// GN-6y: the directory of a test, in which a case resolves its relative paths; the tests of a file run one after
// another, and the directory is removed after each.
const NODE_CASE_PATH = `
let caseDir;
afterEach(() => {
  if (caseDir !== undefined) rmSync(caseDir, { recursive: true, force: true });
  caseDir = undefined;
});

function casePath(relative) {
  caseDir ??= mkdtempSync(join(tmpdir(), 'case-'));
  return join(caseDir, ...relative.split('/'));
}
`;

export function nodeTests(model: Model): string {
  const npm = (model.contract.packages['node'] as { package: string }).package;
  // L-2a: the tests of a host package import the generated entry beside them, as host code does; the package's own
  // entry is the host's.
  const esm = isHost(model.contract, 'node') ? '../index.mjs' : npm;
  const cjsEntry = isHost(model.contract, 'node') ? '../index.cjs' : npm;
  const foreignModules = new Set<string>();
  const ctx: Context = { lang: 'node', enumRef: (_name, value) => jsString(value),
    casePath: (relative) => `casePath(${jsString(relative)})`,
    // GN-6x: a class of another repository, through the owner's package.
    foreignClass: (library, unit) => {
      foreignModules.add(library);
      return `foreign_${library.replaceAll('-', '_')}.${langName('node', unit.name, 'class')}`;
    },
    // GN-6s: an error unit of the owner of a callback unit of another repository, through the owner's package.
    errorNew: (unit, kind, message, library) => {
      if (library !== undefined) foreignModules.add(library);
      return `new ${library === undefined ? 'pkg' : `foreign_${library.replaceAll('-', '_')}`}.${langName('node', unit.name, 'class')}(${jsString(message)}, ${jsString(kind)})`;
    },
    callbackNew: (unit, how) => {
      if ('missing' in how) return '{}';
      const body = 'raise' in how ? `() => { throw ${how.raise}; }` : how.returns === 'wrong' ? '() => Symbol()' : '() => null';
      return `{ ${(unit.members ?? []).map((m) => `${langName('node', m.name, 'callable')}: ${body}`).join(', ')} }`;
    },
    recordNew: (unit, fields) => `{ ${(unit.fields ?? []).map((f, i) => `${langName('node', f.name, 'variable')}: ${fields[i] ?? ''}`).join(', ')} }`,
    // GN-6v: a case is an object of its tag and its fields.
    variantNew: (variant, kase, fields) => `{ ${[`${langName('node', variant.unit.tag ?? [], 'variable')}: ${jsString(kase.value)}`, ...(kase.unit.fields ?? []).map((f, i) => `${langName('node', f.name, 'variable')}: ${fields[i] ?? ''}`)].join(', ')} }`,
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
  // GN-6m: a call of a member that waits is awaited where it is made.
  const invoke = (fn: Fn, args: string, receiver: string): string => (awaits(fn) ? `(await ${called(fn, args, receiver)})` : called(fn, args, receiver));
  const called = (fn: Fn, args: string, receiver: string): string => {
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
    fails: (expr, kind, what) => {
      usesOutcome = true;
      return `assert.equal(outcome(() => ${expr}).kind, ${jsString(kind)}, ${jsString(`G-5: ${what}`)});`;
    },
    pick: (expr, step) => ('field' in step ? `${expr}.${langName('node', step.field.split('_'), 'variable')}` : `${expr}[${'index' in step ? step.index : step.tuple}]`),
    arm: (local, member, faults) => {
      usesAddon = true;
      return `const ${local} = addon().__armFaults(${jsString(member)}, ${jsString(faults)});`;
    },
    left: (local, what) => `assert.deepEqual(addon().__faultLeft(${local}), [], ${jsString(`G-5: ${what}`)});`,
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
    const body = `${built.lines.join(' ')} return ${built.expr};`;
    // GN-6m: a receiver that a call that waits makes is awaited.
    return /\bawait /.test(body) ? `(await (async () => { ${body} })())` : `(() => { ${body} })()`;
  };
  ctx.instanceNew = made;
  // GN-6aa: a callback value inside another value is the object of a fixture, whose unexpected call throws.
  ctx.fixtureNew = (values) => {
    usesFixture = true;
    return `fixture([${values.members.join(', ')}], [${values.rows.map((row) => `[${row.join(', ')}]`).join(', ')}]).object`;
  };
  // GN-6z: a function value inside another value is the call of a fixture, whose unexpected call throws.
  ctx.functionMember = 'call';
  ctx.functionNew = (rows) => {
    usesFixture = true;
    return `fixture(['call'], [${rows.map((row) => `[${row.join(', ')}]`).join(', ')}]).object.call`;
  };
  // G-5: the fixtures of a case: a callback parameter is the object of a fixture, and a function value (GN-6z) the call
  // of a fixture whose one member is the call; the test reads the record of each after the call.
  const fixturesAt = (fn: Fn, id: string, args: Map<Arg, unknown>): { fixture: { arg: Arg }; name: string; values: { members: string[]; rows: string[][]; calls: string[][] | undefined }; use: string }[] => [
    ...fixturesOf(model, fn, id, args).map((fixture, i) => ({ fixture, name: `fixture${i}`, values: fixtureValues(model, ctx, fixture), use: `fixture${i}.object` })),
    ...functionFixturesOf(model, ctx, fn, id, args, 'call').map((f, i) => ({ fixture: { arg: f.arg }, name: `function${i}`, values: { members: f.members, rows: f.rows, calls: undefined }, use: `function${i}.object.call` })),
  ];
  let usesOutcome = false;
  let usesOrdered = false;
  // GN-6ae: the function of a function fixture: each step calls a method on one of its arguments; it then returns its
  // result, throws the instance of an error unit, or throws the exception that the test of the case holds. A function
  // whose step calls a member that waits is async, so it returns a promise, which the member awaits.
  ctx.machineFunctionNew = (fixture) => {
    const steps = fixture.steps.map((step) => {
      const call = invoke(step.fn, step.args, `args[${step.on}]`);
      // CK-22: a step that names a result requires it, by an assertion whose failure is an exception of the function.
      if (step.expected === undefined) return `${call}; `;
      if ('refused' in step.expected) return `assert.fail(${jsString(step.expected.refused)}); `;
      usesOrdered = true;
      return `assert.deepStrictEqual(ordered(${call}), ordered(${step.expected.text})); `;
    }).join('');
    const end = 'result' in fixture.end ? `return ${fixture.end.result};` : 'raise' in fixture.end ? `throw ${fixture.end.raise};` : 'throw raised;';
    // CK-22: a fixture with awaits is an async function, whose promise the member awaits; so is a function whose step
    // awaits the call of a member that waits.
    return `${fixture.awaits || /\bawait /.test(steps) ? 'async ' : ''}(...args) => { ${steps}${end} }`;
  };
  // GN-6ae: after a case of a member that takes a callback or a function, the table of the crate keeps nothing that
  // was thrown, which the entry point of thrown-count-test counts.
  const kept = (fn: Fn): string => {
    if (!callsCode(model, fn)) return '';
    usesAddon = true;
    return '\n  assert.equal(addon().__thrownCount(), 0);';
  };
  // GN-6ae: the calls of after of a case, each on the receiver of the case, with the result that the case names.
  const afterChecks = (after: After[] | undefined, receiver: string): string =>
    (after ?? []).map((call) => {
      const expected = stepExpected(model, ctx, call.fn, call.result);
      if ('refused' in expected) return `\n  assert.fail(${jsString(expected.refused)});`;
      usesOrdered = true;
      return `\n  assert.deepStrictEqual(ordered(${invoke(call.fn, callArgs(model, ctx, call.fn, (arg) => caseValue(model, ctx, arg, call.args)), receiver)}), ordered(${expected.text}));`;
    }).join('');
  // GN-6ae: a case with after holds its receiver, which the calls of after observe.
  const heldReceiver = (receiverMade: { lines: string; expr: string }, after: After[] | undefined): { lines: string; expr: string } =>
    after === undefined || receiverMade.expr === '' ? receiverMade : { lines: `${receiverMade.lines}\n  const receiver = ${receiverMade.expr};`, expr: 'receiver' };
  let usesTokens = false;
  for (const fn of callables(model)) {
    const name = fn.kind === 'function' ? langName('node', fn.member.name, 'callable') : `${langName('node', fn.unit.name, 'class')}.${fn.kind === 'constructor' ? 'constructor' : langName('node', fn.member.name, 'callable')}`;
    const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
    const recv = sample === undefined ? '' : made(sample);
    const target = (args: string): string => invoke(fn, args, recv);
    const call = (override: Map<unknown, string>): string =>
      target(callArgs(model, ctx, fn, (arg) => override.get(arg) ?? placeholder(model, ctx, arg.type)));
    const reachable = fn.receiver === undefined || sample !== undefined;
    // GN-6z: a value of a function type that is not a function is refused as it enters.
    const functionArg = fn.args.find((a) => typeof a.type === 'object' && 'function' in a.type && !machineFunction(a.type));
    if (functionArg !== undefined && reachable) {
      out.push(`
test('GN-6z: ${name} refuses a ${langName('node', functionArg.name, 'variable')} that is not a function', () => {
  assert.throws(() => ${target(callArgs(model, ctx, fn, (arg) => (arg === functionArg ? '0' : placeholder(model, ctx, arg.type))))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_argument_type');
});`);
    }
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
      const unsafeKey = unsafeKeyMap(model, ctx, arg.type);
      if (unsafeKey !== undefined) {
        out.push(`
test('B-2: ${name} refuses a key outside the safe integers in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, unsafeKey]]))}, (error) => error.constructor === pkg.${cls('value')} && error.kind === 'invalid_number');
});`);
      }
      // GN-13d: an optional or a value type takes null as a value, so only another type refuses it.
      if (refusesNull(arg) && !takesNull(model, arg.type)) {
        out.push(`
test('U-2: ${name} takes null in ${argName} as a value', () => {
  assert.throws(() => ${call(new Map([[arg, 'null']]))}, (error) => ['invalid_argument_type', 'invalid_number', 'invalid_text'].includes(error.kind));
});`);
      }
      // GN-6y: a path with a NUL byte is kind invalid_path, a string with an unpaired surrogate kind invalid_text, and a
      // value that is neither a string nor a Uint8Array kind invalid_argument_type.
      if (isPath(arg.type)) {
        out.push(`
test('T-1: ${name} refuses a NUL byte in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, "'a\\u0000b'"]]))}, (error) => error.constructor === pkg.${cls('value')} && error.kind === 'invalid_path');
});

test('B-3: ${name} refuses an unpaired surrogate in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, "'\\uD800'"]]))}, (error) => error.constructor === pkg.${cls('value')} && error.kind === 'invalid_text');
});

test('T-1: ${name} refuses a value that is no path in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, '1']]))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_argument_type');
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
  assert.throws(() => ${call(new Map([[arg, refusedValue.value]]))}, (error) => error.constructor === pkg.${exactClass(refusedValue.kase)} && error.kind === ${jsString(refusedValue.kase.kind)});
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
    // GN-6ae: a parameter of a function type takes a function, and any other value is kind invalid_callback.
    for (const arg of reachable ? fn.args.filter((a) => machineFunction(a.type)) : []) {
      out.push(`
test('GN-6ae: ${name} refuses a ${langName('node', arg.name, 'variable')} that is no function', () => {
  assert.throws(() => ${call(new Map([[arg, '1']]))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_callback');
});`);
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
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        out.push(`
test('B-4: ${name} ${kase.id}', () => {
  assert.fail(${jsString(refusal)});
});`);
        continue;
      }
      // G-5: a callback parameter is the fixture of the case, whose record of calls the test reads after the call.
      const fixtures = fixturesAt(fn, kase.id, kase.args);
      usesFixture ||= fixtures.length > 0;
      const caseArg = (arg: Fn['args'][number]): string | undefined => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.use;
      };
      // GN-13f: the receiver is made before the call that must throw, so a receiver that cannot be made fails the test: a
      // receiver that no line made yet is held.
      // A receiver whose factory raises the kind of the case is made inside, since the case may fail there.
      const receiverBuilt = receiverOfCase(kase.receiver);
      const receiverMade = kase.faults === undefined ? heldReceiver(receiverBuilt, kase.after ?? (receiverBuilt.lines === '' && kase.receiverFails === undefined ? [] : undefined)) : receiverBuilt;
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
    error.errno === ${errno === null ? 'null' : 'symbol' in errno ? `errnoOf.${errno.symbol}` : String(errno.value)});${kase.faults === undefined ? '' : '\n  assert.deepEqual(addon().__faultLeft(armed), []);'}${after}${afterChecks(kase.after, 'receiver')}${kept(fn)}
});`);
    }
    // GN-6ae: a case whose function fixture raises an exception of the language gets the same object.
    for (const kase of callbackCases(model, fn)) {
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        out.push(`
test('GN-6ae: ${name} ${kase.id}', () => {
  assert.fail(${jsString(refusal)});
});`);
        continue;
      }
      const receiverMade = heldReceiver(receiverOfCase(kase.receiver), kase.after ?? []);
      const args = callArgs(model, ctx, fn, (arg) => caseValue(model, ctx, arg, kase.args));
      out.push(`
test('GN-6ae: ${name} ${kase.id}', () => {${receiverMade.lines}
  const raised = new Error(${jsString(FIXTURE_RAISED)});
  assert.throws(() => ${invoke(fn, args, receiverMade.expr)}, (error) => error === raised);${afterChecks(kase.after, 'receiver')}${kept(fn)}
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
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        out.push(`
test('GN-13e: ${name} ${kase.id}', () => {
  assert.fail(${jsString(refusal)});
});`);
        continue;
      }
      const fixtures = fixturesAt(fn, kase.id, kase.args);
      usesFixture ||= fixtures.length > 0;
      const before = fixtures.map((f) => `\n  const ${f.name} = fixture([${f.values.members.join(', ')}], [${f.values.rows.map((row) => `[${row.join(', ')}]`).join(', ')}]);`).join('');
      const after = fixtures
        .map((f) => `\n  assert.deepEqual(${f.name}.unexpected, []);${f.values.calls === undefined ? '' : `\n  assert.deepEqual(${f.name}.calls, [${f.values.calls.map((call) => `[${call.join(', ')}]`).join(', ')}]);`}`)
        .join('');
      const args = callArgs(model, ctx, fn, (arg) => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.use;
      });
      const receiverMade = heldReceiver(receiverOfCase(kase.receiver), kase.after);
      const call = invoke(fn, args, receiverMade.expr);
      const expected = kase.expected === undefined ? undefined : expectedText(model, ctx, fn, kase.expected.value);
      usesOrdered ||= expected !== undefined && 'text' in expected;
      usesTokens ||= expected !== undefined && 'tokens' in expected;
      usesAddon ||= expected !== undefined && 'round' in expected;
      const check = expected === undefined
        ? `\n  ${call};`
        : 'refused' in expected
          ? `\n  assert.fail(${jsString(expected.refused)});`
          : 'tokens' in expected
            ? expected.round === undefined
              ? `\n  assert.deepStrictEqual(tokens(${call}), JSON.parse(${jsString(expected.tokens)}));`
              : `\n  const result = ${call};\n  const expected = JSON.parse(${jsString(expected.tokens)});\n  assert.deepStrictEqual(tokens(result), expected);\n  assert.deepStrictEqual(tokens(addon().__aliasRound${langName('node', expected.round, 'class')}(result)), expected);`
            : `\n  assert.deepStrictEqual(ordered(${call}), ordered(${expected.text}));`;
      out.push(`
test('GN-13e: ${name} ${kase.id}', () => {${receiverMade.lines}${before}${check}${after}${afterChecks(kase.after, 'receiver')}${kept(fn)}
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
    for (const kase of primitiveCases(model, ctx, fn)) {
      const instance = receiverOfCase(kase.receiver);
      const number = invoke(fn, '', instance.expr);
      out.push(`
test('N-4: ${name} ${kase.id}', () => {${instance.lines}
  ${kase.result === undefined ? `${number};` : `assert.strictEqual(${number}, ${kase.result});`}
});`);
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
test('G-7: ${name} counts and names its arguments', () => {${fn.params.every((p) => p.default !== undefined) ? '' : `
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
  // U-3, GN-6z: a function of the language called on a thread other than its owner is kind wrong_thread, through the
  // entry point of the feature thread-test.
  if (takesFunction(model)) {
    usesAddon = true;
    out.push(`
test('U-3: a function called on another thread is kind wrong_thread (GN-6z)', () => {
  assert.equal(addon().__threadTest(() => null), 'wrong_thread');
});`);
  }
  // GN-6u: an object goes through the native row and back as the same object, and the binding releases its Native.
  const roundTrip = nativeRoundTrip(model.contract, 'node');
  const roundFn = roundTrip === undefined ? undefined : model.functions.find((f) => f.member.id === roundTrip.id);
  if (roundFn !== undefined) {
    usesAddon = true;
    const same = (value: string): string => invoke(roundFn, value, '');
    out.push(`
test('GN-6u: ${langName('node', roundFn.member.name, 'callable')} gives back the same object and releases it', async () => {
  ${same('new Subject()')};
  const before = addon().__nativeCount();
  const subject = new Subject();
  assert.equal(${same('subject')}, subject);
  await new Promise(setImmediate);
  ${same('new Subject()')};
  assert.equal(addon().__nativeCount(), before);
});`);
  }
  // GN-6o: a method with the receiver self leaves its object consumed, whatever the call gives.
  for (const fn of callables(model).filter((f) => f.receiver === 'self')) {
    const sample = sampleReceiver(model, fn);
    if (sample === undefined) continue;
    usesOutcome = true;
    const args = callArgs(model, ctx, fn, (arg) => placeholder(model, ctx, arg.type));
    out.push(`
test('GN-6o: ${langName('node', fn.unit.name, 'class')}.${langName('node', fn.member.name, 'callable')} consumes its object', () => {
  const held = ${made(sample)};
  outcome(() => ${invoke(fn, args, 'held')});
  assert.throws(() => ${invoke(fn, args, 'held')}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'consumed');
});`);
  }
  // GN-6p, B-10: an object finalized without its cleanup call emits a ResourceWarning; the test turns on gc() and
  // awaits the warning event of the process with the message of its class, because the objects of earlier tests warn too.
  let usesGc = false;
  for (const object of model.objects) {
    const cleanup = object.cleanup;
    const sample = cleanup === undefined ? undefined : sampleReceiver(model, cleanup);
    if (cleanup === undefined || sample === undefined) continue;
    usesGc = true;
    const label = langName('node', object.unit.name, 'class');
    out.push(`
test('B-10: ${label} warns when it is destroyed without ${memberName('node', cleanup)}()', async () => {
  const expected = ${jsString(cleanupWarning(label, memberName('node', cleanup)))};
  const warned = new Promise((resolve) => {
    const listener = (warning) => {
      if (warning.name !== 'ResourceWarning' || warning.message !== expected) return;
      process.off('warning', listener);
      resolve(warning);
    };
    process.on('warning', listener);
  });
  (() => {
    ${made(sample)};
  })();
  gc();
  assert.equal((await warned).message, expected);
});`);
  }
  // U-7: the cases of an alias run its in function alone, through the entry point of the feature codec-test.
  for (const kase of aliasCases(model)) {
    usesAddon = true;
    out.push(`
test('U-7: ${kase.alias.unit.id} in ${kase.id}', () => {
  assert.throws(() => addon().__aliasIn${langName('node', kase.alias.unit.name, 'class')}(${fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)}), (error) => error.constructor === pkg.${exactClass(kase)} && error.kind === ${jsString(kase.kind)});
});`);
  }
  // GN-6m: a block may hold several tests, each of which awaits when its call does.
  const blocks = out.map((block) => block.split(/(?=\ntest\()/).map(awaitedTest).join(''));
  usesOutcome = blocks.some((block) => block.includes('outcome('));
  const usesSettled = blocks.some((block) => block.includes('settled('));
  const usesCasePath = blocks.some((block) => block.includes('casePath('));
  // GN-13e, B2.121: ordered reads an instance of a value class of another repository through its in row.
  const readers = usesOrdered ? foreignReaders(model, 'node') : [];
  const foreignClass = ctx.foreignClass as (library: string, unit: Unit) => string;
  const ordered = nodeOrdered(foreignClassNames(readers, foreignClass), nodeForeignRead(readers, 'node', foreignClass));
  return `${header('//')}
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test${usesCasePath ? ', { afterEach }' : ''} from 'node:test';${usesCasePath ? "\nimport { mkdtempSync, rmSync } from 'node:fs';\nimport { tmpdir } from 'node:os';" : ''}${usesGc ? "\nimport { setFlagsFromString } from 'node:v8';\nimport { runInNewContext } from 'node:vm';" : ''}${usesFixture ? "\nimport { isDeepStrictEqual } from 'node:util';" : ''}
${usesErrno ? "import { constants } from 'node:os';\n" : ''}import * as pkg from ${jsString(esm)};
${[...foreignModules].map((library) => `import * as foreign_${library.replaceAll('-', '_')} from ${jsString(`${(model.foreign.get(library)?.packages['node'] as { package: string } | undefined)?.package ?? library}`)};\n`).join('')}

const require = createRequire(import.meta.url);
${roundFn === undefined ? '' : '\n// GN-6u: the subject of the round-trip test, an object that only the test makes.\nclass Subject {}\n'}${usesGc ? "\n// GN-6p: gc() of V8, which the B-10 tests call to finalize an object.\nsetFlagsFromString('--expose-gc');\nconst gc = runInNewContext('gc');\n" : ''}${usesFixture ? NODE_FIXTURE : ''}${usesOutcome ? NODE_OUTCOME : ''}${usesSettled ? NODE_SETTLED : ''}${usesOrdered ? ordered : ''}${usesTokens ? nodeTokens(tokenForms(model, 'node')) : ''}${usesCasePath ? NODE_CASE_PATH : ''}
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
${blocks.join('\n')}
`;
}

const nodeBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';
