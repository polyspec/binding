// The generated node:test module of the Node binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run against
// the installed package.

import { type Model, callsCode, categoryClass,POISON_ENTRY, Unsupported, cleanupWarning, errorUnitOfKind, hookCall, langName, memberName, unitOf, awaits, takesNull, type Arg, nativeRoundTrip, takesFunction, machineFunction } from './model.ts';
import { heldTests } from './tests_held.ts';
import { addonBase } from './node.ts';
import { isHost, NODE_PLATFORM_JS } from './packages.ts';
import { foreignReaders, foreignClassNames, holdsForeign, nodeForeignRead } from './value_class.ts';
import type { Unit } from '../contract.ts';
import { type CallbackHow, type Context, type MadeForm, type Receiver, callArgs, caseRefusal, BYTE_NAME_LINUX, caseListenerOf, isPath, isPlain, madeLines, callbackArg, callbackReachingArgs, classCaseArgs, otherValue, callables, bytesKind, caseValue, expectedText, isNumber, numberRefusesNull, nodeTokens, tokenForms, placeholder, fixtureValues, fixturesOf, aliasCases, aliasRepresentative, expectedErrno, fromJson, judgesCallbackResult, raisingCases, refusedKeyMap, unsafeKeyMap, resultCases, samePairs, sampleReceiver, primitiveCases, refusesNull, stringCases, textKind, wrapText, functionFixturesOf, type After, FIXTURE_RAISED, callbackCases, stepExpected, caseFilesOf, serviceSteps, CASE_JSON_STRING_GOLDENS, type CaseService } from './samples.ts';
import type { Fn } from './model.ts';
import { header, jsString } from './text.ts';

// B-2: the numbers that break the rule of each number type (kind invalid_number), and the values of another type than
// the number that the place takes (kind invalid_argument_type, GN-12a), a null only where it is no absent value.
const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['NaN', 'Infinity', '-Infinity', '1.5', '-1', '2 ** 53'],
  int: ['NaN', 'Infinity', '-Infinity', '1.5', '2 ** 53', '-(2 ** 53)'],
};
const OTHER_TYPES: Record<string, string[]> = { uint: ['true', "'7'", '7n'], int: ['true', "'7'", '7n'], int64: ['true', "'7'"], float: ['true', "'7'", '7n'] };

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
    .replaceAll(/(\ntest\('[^\n]*?'), \((t?)\) => \{/g, '$1, async ($2) => {')
    .replaceAll('assert.throws(() => ', 'await assert.rejects(async () => ');
};

// G-5, GN-6m: the outcome of a call, settled when the expression awaits and read at once otherwise. It is chosen where
// the call is written, because a step of a function fixture that is no async function cannot await (GN-13p).
export const nodeOutcome = (expr: string): string => (/\bawait /.test(expr) ? `await settled(async () => ${expr})` : `outcome(() => ${expr})`);

// GN-6y: the directory of a test, in which a case resolves its relative paths; the tests of a file run one after
// another, and the directory is removed after each.
export const NODE_CASE_PATH = `
let caseDir;
afterEach(() => {
  if (caseDir !== undefined) rmSync(caseDir, { recursive: true, force: true });
  caseDir = undefined;
});

function casePath(relative) {
  caseDir ??= realpathSync(mkdtempSync(join(tmpdir(), 'case-')));
  return join(caseDir, ...relative.split('/'));
}
`;

// GN-13l: only actual expression dependencies activate a captured root; marker text is ordinary text.
export function nodeCaseTextScope(ctx: Context, out: string[]): { emit: (...blocks: string[]) => void; derive: (code: string, sources: readonly string[]) => string; bind: (local: string, expression: string) => void; used: () => boolean } {
  const dependent = new Set<string>();
  const frames: { root: boolean }[] = [];
  let pending = false;
  let used = false;
  const mark = (code: string): string => {
    dependent.add(code);
    const frame = frames.at(-1);
    if (frame !== undefined) frame.root = true;
    pending = true;
    used = true;
    return code;
  };
  ctx.caseTextPath = (relative, jsonString) => mark(`caseTextPath(_caseTextRoot, ${jsString(relative)}, ${String(jsonString)})`);
  ctx.caseTextExpression = (make) => {
    const frame = { root: false };
    const before = pending;
    frames.push(frame);
    let complete = false;
    try {
      const code = make();
      if (frame.root || dependent.has(code)) mark(code);
      complete = true;
      return code;
    } finally {
      frames.pop();
      if (complete && frame.root) {
        const parent = frames.at(-1);
        if (parent !== undefined) parent.root = true;
      }
      if (!complete) pending = before;
    }
  };
  return {
    derive: (code, sources) => sources.some((source) => dependent.has(source)) ? mark(code) : code,
    bind: (local, expression) => {
      const root = dependent.has(expression);
      dependent.delete(local);
      if (root) mark(local);
    },
    used: () => used,
    emit: (...blocks) => {
      const root = pending;
      pending = false;
      out.push(...blocks.map((block) => root ? block.replace(/(\ntest\([^\n]*=> \{)/g, '$1\n  const _caseTextRoot = casePath(\'.\');') : block));
    },
  };
}

export const NODE_CASE_TEXT = `
// GN-13l: a complete minimal UTF-8 JSON string token, without replacing malformed Unicode.
function caseJsonString(value) {
  if (typeof value !== 'string' || !value.isWellFormed()) throw new TypeError('GN-13l: a case text is well-formed Unicode');
  return JSON.stringify(value);
}

function caseTextPath(root, relative, jsonString) {
  const path = join(root, ...relative.split('/'));
  if (path.includes('\\0')) throw new TypeError('GN-13l: a case text path has no NUL');
  const quoted = caseJsonString(path);
  return jsonString ? quoted : path;
}
`;

export function nodeCaseTextProof(ctx: Context, emit: (block: string) => void): void {
  const vectors = CASE_JSON_STRING_GOLDENS.map((v) => `[${jsString(v.inputHex)}, ${jsString(v.expectedHex)}]`).join(',\n    ');
  emit(`
test('GN-13l: JSON string tokens match fixed UTF-8 bytes', () => {
  for (const [input, expected] of [
    ${vectors}
  ]) {
    const value = Buffer.from(input, 'hex').toString('utf8');
    assert.equal(Buffer.from(caseJsonString(value), 'utf8').toString('hex'), expected);
  }
  assert.throws(() => caseJsonString('\\uD800'), TypeError);
});`);
  const relative = 'owned-text-witness/file';
  const make = (): string => {
    const result = ctx.caseTextPath?.(relative, false);
    if (result === undefined || ctx.machineFunctionNew === undefined) throw new Unsupported('GN-13l: the host case-root callback is missing');
    return ctx.machineFunctionNew({ names: [], parameters: 0, awaits: false, steps: [], end: { result } });
  };
  const callback = ctx.caseTextExpression === undefined ? make() : ctx.caseTextExpression(make);
  emit(`
test('GN-13l: composed paths use the old file-owned root', () => {
  caseFile(${jsString(relative)}, '${'726F6F74207769746E657373'.toLowerCase()}');
  const callback = ${callback};
  const path = callback();
  assert.equal(path, casePath(${jsString(relative)}));
  assert.equal(readFileSync(path).toString('hex'), '${'726F6F74207769746E657373'.toLowerCase()}');
});`);
}

// GN-13i: a file of a case, written inside the directory of the test with the directories of its path before the values
// of the case are made; its bytes are given as hex. WASM writes it the same way, with node:fs of the Node.js that runs
// its tests.
export const NODE_CASE_FILE = `
function caseFile(relative, content) {
  const path = casePath(relative);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, Buffer.from(content, 'hex'), { mode: 0o600 });
}

// GN-13i: a file whose name is bytes that are no Unicode, written by a Buffer path.
function caseByteFile(relative, content) {
  const path = Buffer.concat([Buffer.from(\`\${casePath('.')}/\`), Buffer.from(relative, 'hex')]);
  mkdirSync(path.subarray(0, path.lastIndexOf(0x2f)), { recursive: true, mode: 0o700 });
  writeFileSync(path, Buffer.from(content, 'hex'), { mode: 0o600 });
}
`;

// GN-13i: a test whose case names a file by bytes runs only on Linux, so it takes the context of node:test, whose skip
// it calls on another system.
export const linuxOnlyTests = (block: string): string => block.replaceAll(/\(\) => \{(\n  if \(process\.platform !== 'linux'\) \{)/g, '(t) => {$1');

// GN-6p, B-10: the statement that makes an object inside a function of its own, so that nothing of the test holds it
// when gc() runs; a factory that the test awaits is made inside an async function, which the test awaits, because an
// await in a function that is not async is a syntax error that stops the whole file from loading.
export const scoped = (made: string): string => (/\bawait\b/.test(made) ? `await (async () => {\n    ${made};\n  })();` : `(() => {\n    ${made};\n  })();`);

// GN-13i: the lines that write the files of a case, first in the body of its test.
// GN-13r: then the line that starts the listener of the case.
export const nodeCaseFileLines = (files: unknown, listener?: unknown): string => `${caseFilesOf(files).some((file) => file.name !== undefined) ? `\n  if (process.platform !== 'linux') {\n    t.skip(${jsString(BYTE_NAME_LINUX)});\n    return;\n  }` : ''}${caseFilesOf(files).map((file) => (file.name === undefined ? `\n  caseFile(${jsString(file.path)}, ${jsString(file.hex)});` : `\n  caseByteFile(${jsString(file.name)}, ${jsString(file.hex)});`)).join('')}${caseListenerOf(listener) === undefined ? '' : '\n  caseListener();'}`;

// GN-13r: the listener of a case, in a Worker, because a call that blocks the thread of the test would keep its event
// loop from closing the connection. The worker gives its port through a SharedArrayBuffer, on which the test waits with
// Atomics.wait before it makes the values of the case, and afterEach terminates it and awaits its end. WASM starts it
// the same way, with node:worker_threads of the Node.js that runs its tests.
export const NODE_CASE_LISTENER = `
const CASE_LISTENER_SERVER = \`
const { workerData } = require('node:worker_threads');
const { createServer } = require('node:net');
const give = (port) => {
  Atomics.store(workerData, 0, port);
  Atomics.notify(workerData, 0);
};
const server = createServer((socket) => socket.destroy());
server.on('error', () => give(-1));
server.listen(0, '127.0.0.1', () => give(server.address().port));
\`;
let caseListenerWorker;
let caseListenerPort;
afterEach(async () => {
  if (caseListenerWorker !== undefined) await caseListenerWorker.terminate();
  caseListenerWorker = undefined;
  caseListenerPort = undefined;
});

function caseListener() {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  caseListenerWorker = new Worker(CASE_LISTENER_SERVER, { eval: true, workerData: shared });
  Atomics.wait(shared, 0, 0);
  const port = Atomics.load(shared, 0);
  if (port <= 0) assert.fail('G-5: the listener of the case did not start (GN-13r)');
  caseListenerPort = String(port);
}
`;

// GN-13j: the address of the service of a case, which the test run gives in an environment variable, and the program of
// the state of the service, which the test runs with a step, the scope of the case and a JSON text on its input and
// waits for; a missing variable or a status that is not 0 fails the test.
const NODE_SERVICE = `
function serviceAddress(service, variable) {
  const address = process.env[variable] ?? '';
  if (address === '') assert.fail(\`G-5: the service \${service} of the case has no address: the test run sets the environment variable \${variable} (GN-13j)\`);
  return address;
}

function serviceState(service, variable, step, scope, value) {
  const program = process.env[variable] ?? '';
  if (program === '') assert.fail(\`G-5: the service \${service} of the case has no program of its state: the test run sets the environment variable \${variable} (GN-13j)\`);
  const done = spawnSync(program, [step, scope], { input: value, encoding: 'utf8' });
  if (done.error !== undefined || done.status !== 0) {
    assert.fail(\`G-5: \${step} of the service \${service} for \${scope} exited with \${done.status ?? done.signal}: \${done.error?.message ?? ''}\${done.stdout ?? ''}\${done.stderr ?? ''} (GN-13j)\`);
  }
}
`;

// GN-13q: the peer session of the service of a case, a child process of the program of its state that runs while the
// test runs: the test writes the JSON text of each step as one line and awaits the line ready, closes its input at the
// end and awaits its exit; afterEach kills a peer that the test did not end, and awaits its exit.
const NODE_PEER = `
const peers = new Map();
afterEach(async () => {
  for (const peer of peers.values()) {
    peer.child.kill('SIGKILL');
    await peer.exited;
  }
  peers.clear();
});

async function servicePeerReady(service, scope, step) {
  const peer = peers.get(scope);
  const line = await peer.lines.next();
  if (line.done) {
    peers.delete(scope);
    assert.fail(\`G-5: \${step} of the peer of the service \${service} for \${scope} ended before ready with \${await peer.exited} (GN-13q)\`);
  }
  if (line.value !== 'ready') assert.fail(\`G-5: \${step} of the peer of the service \${service} for \${scope} wrote \${JSON.stringify(line.value)} in place of ready (GN-13q)\`);
}

async function servicePeer(service, variable, scope, value) {
  const program = process.env[variable] ?? '';
  if (program === '') assert.fail(\`G-5: the service \${service} of the case has no program of its state: the test run sets the environment variable \${variable} (GN-13j)\`);
  const child = spawn(program, ['peer', scope], { stdio: ['pipe', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => child.on('close', (status, signal) => resolve(status ?? signal)));
  const started = await new Promise((resolve) => {
    child.on('spawn', () => resolve(undefined));
    child.on('error', (error) => resolve(error));
  });
  if (started !== undefined) assert.fail(\`G-5: the peer of the service \${service} for \${scope} did not start: \${started.message} (GN-13q)\`);
  // A peer that ended refuses the line; the line ready that it did not write tells the step.
  child.stdin.on('error', () => undefined);
  peers.set(scope, { child, exited, lines: createInterface({ input: child.stdout })[Symbol.asyncIterator]() });
  child.stdin.write(\`\${value}\\n\`);
  await servicePeerReady(service, scope, 'peer');
}

async function servicePeerNext(service, scope, value) {
  peers.get(scope).child.stdin.write(\`\${value}\\n\`);
  await servicePeerReady(service, scope, 'next');
}

async function servicePeerEnd(service, scope) {
  const peer = peers.get(scope);
  peers.delete(scope);
  peer.child.stdin.end();
  const status = await peer.exited;
  if (status !== 0) assert.fail(\`G-5: the peer of the service \${service} for \${scope} exited with \${status} (GN-13q)\`);
}
`;

const jsState = (service: CaseService, state: string, step: string, scope: string, value: string): string =>
  `serviceState(${jsString(service.id)}, ${jsString(state)}, ${jsString(step)}, ${jsString(scope)}, ${jsString(value)});`;

// GN-13j: the lines of the service of a case: its address and its setup first in the body of its test, after its
// files, and its check at the end.
export const nodeServiceStart = (service: unknown): string => {
  const steps = serviceSteps(service, 'node');
  if (steps === undefined) return '';
  return `\n  serviceAddress(${jsString(steps.service.id)}, ${jsString(steps.service.address)});${steps.setup === undefined ? '' : `\n  ${jsState(steps.service, steps.setup.state, 'setup', steps.scope, steps.setup.value)}`}${steps.peer === undefined ? '' : `\n  await servicePeer(${jsString(steps.service.id)}, ${jsString(steps.peer.state)}, ${jsString(steps.scope)}, ${jsString(steps.peer.value)});`}`;
};
export const nodeServiceEnd = (service: unknown): string => {
  const steps = serviceSteps(service, 'node');
  const peer = steps?.peer === undefined ? '' : `\n  await servicePeerEnd(${jsString(steps.service.id)}, ${jsString(steps.scope)});`;
  return `${peer}${steps?.check === undefined ? '' : `\n  ${jsState(steps.service, steps.check.state, 'check', steps.scope, steps.check.value)}`}`;
};

// GN-6y, GN-13i: the imports of node:fs and node:os that the directory of a test and the files of a case use.
export const nodeCaseImports = (usesCaseFile: boolean, usesCaseText = false): string =>
  `\nimport { ${usesCaseFile ? `mkdirSync, mkdtempSync, ${usesCaseText ? 'readFileSync, ' : ''}realpathSync, rmSync, writeFileSync` : 'mkdtempSync, realpathSync, rmSync'} } from 'node:fs';\nimport { tmpdir } from 'node:os';`;

export function nodeTests(model: Model): string {
  const npm = (model.contract.packages['node'] as { package: string }).package;
  // L-2a: the tests of a host package import the generated entry beside them, as host code does; the package's own
  // entry is the host's.
  const esm = isHost(model.contract, 'node') ? '../index.mjs' : npm;
  const cjsEntry = isHost(model.contract, 'node') ? '../index.cjs' : npm;
  const foreignModules = new Set<string>();
  const ctx: Context = { lang: 'node', enumRef: (_name, value) => jsString(value),
    casePath: (relative) => `casePath(${jsString(relative)})`,
    // GN-6aq: an AbortSignal that was aborted before the call, or one whose controller never aborts it.
    cancelNew: (fired) => (fired ? 'AbortSignal.abort()' : 'new AbortController().signal'),
    serviceAddress: (service) => `serviceAddress(${jsString(service.id)}, ${jsString(service.address)})`,
    listenerPort: 'caseListenerPort',
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
      return `{ ${(unit.members ?? []).filter((m) => m.default === undefined).map((m) => `${langName('node', m.name, 'callable')}: ${body}`).join(', ')} }`;
    },
    recordNew: (unit, fields) => `{ ${(unit.fields ?? []).map((f, i) => `${langName('node', f.name, 'variable')}: ${fields[i] ?? ''}`).join(', ')} }`,
    // GN-6v: a case is an object of its tag and its fields.
    variantNew: (variant, kase, fields) => `{ ${[`${langName('node', variant.unit.tag ?? [], 'variable')}: ${jsString(kase.value)}`, ...(kase.unit.fields ?? []).map((f, i) => `${langName('node', f.name, 'variable')}: ${fields[i] ?? ''}`)].join(', ')} }`,
  };
  const cls = (category: string): string => categoryClass(model, category);
  // E-2: the exact class of a kind is the class of the error unit that its row names, or the class of its category.
  // E-2, B-4: the exact class of a failure of a case: the class of the error unit of its kind, or of its category.
  const exactClass = (raises: { kind: string; category: string }): string => {
    const unit = errorUnitOfKind(model, raises.kind);
    return unit === undefined ? cls(raises.category) : langName('node', unit.unit.name, 'class');
  };
  const out: string[] = [];
  const textPaths = nodeCaseTextScope(ctx, out);
  const emit = textPaths.emit;
  let usesFixture = false;
  let usesErrno = false;
  let usesAddon = false;
  // GN-6m: a call of a member that waits is awaited where it is made.
  const invoke = (fn: Fn, args: string, receiver: string): string => textPaths.derive(awaits(fn) ? `(await ${called(fn, args, receiver)})` : called(fn, args, receiver), [args, receiver]);
  const called = (fn: Fn, args: string, receiver: string): string => {
    const hook = hookCall('node', fn, receiver);
    if (hook !== undefined) return hook;
    const member = langName('node', fn.member.name, 'callable');
    // GN-6s, GN-13f: a member of another repository that an instance value names, through the owner's package.
    if (fn.library !== undefined) foreignModules.add(fn.library);
    const prefix = fn.library === undefined ? 'pkg' : `foreign_${fn.library.replaceAll('-', '_')}`;
    const cls = `${prefix}.${langName('node', fn.unit.name, 'class')}`;
    if (fn.kind === 'function') return `${prefix}.${member}(${args})`;
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
    bind: (local, expr) => { textPaths.bind(local, expr); return `const ${local} = ${expr};`; },
    name: (local) => local,
    run: (expr) => `${expr};`,
    fails: (expr, kind, what) => {
      usesOutcome = true;
      // GN-6m: the outcome is parenthesized, so a test that waits reads kind of the settled outcome, not of its promise.
      return `assert.equal((${nodeOutcome(expr)}).kind, ${jsString(kind)}, ${jsString(`G-5: ${what}`)});`;
    },
    pick: (expr, step) => 'present' in step ? expr : textPaths.derive('field' in step ? `${expr}.${langName('node', step.field.split('_'), 'variable')}` : `${expr}[${'index' in step ? step.index : step.tuple}]`, [expr]),
    arm: (local, member, faults) => {
      usesAddon = true;
      return `const ${local} = addon().__armFaults(${jsString(member)}, ${jsString(faults)});`;
    },
    left: (local, what) => `assert.deepEqual(addon().__faultLeft(${local}), [], ${jsString(`G-5: ${what}`)});`,
    state: (service, state, step, scope, value) => jsState(service, state, step, scope, value),
    peerNext: (service, scope, value) => `await servicePeerNext(${jsString(service.id)}, ${jsString(scope)}, ${jsString(value)});`,
  };
  const receiverOfCase = (receiver: Receiver | undefined): { lines: string; expr: string } => {
    if (receiver === undefined) return { lines: '', expr: '' };
    const built = madeLines(model, form, receiver);
    return { lines: built.lines.map((line) => `\n  ${line}`).join(''), expr: built.expr };
  };
  // GN-13f: a receiver as one expression; an instance value is made in a function that the expression calls.
  const made = (receiver: Receiver): string => {
    const make = (): string => {
      if (isPlain(receiver)) return invoke(receiver.factory, callArgs(model, ctx, receiver.factory, (arg) => caseValue(model, ctx, arg, receiver.args)), '');
      const built = madeLines(model, form, receiver);
      const body = `${built.lines.join(' ')} return ${built.expr};`;
      // GN-6m: a receiver that a call that waits makes is awaited.
      return /\bawait /.test(body) ? `(await (async () => { ${body} })())` : `(() => { ${body} })()`;
    };
    return ctx.caseTextExpression === undefined ? make() : ctx.caseTextExpression(make);
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
  let usesBound = false;
  // GN-6ae: the function of a function fixture: each step calls a method on one of its arguments; it then returns its
  // result, throws the instance of an error unit, or throws the exception that the test of the case holds. A function
  // whose step calls a member that waits is async, so it returns a promise, which the member awaits.
  // GN-13n: the arguments that function fixtures keep by name, in the store of the module, which the calls of after
  // read after the function returned (GN-13o).
  ctx.boundValue = (name) => {
    usesBound = true;
    return `bound.${name}`;
  };
  ctx.boundSet = (name, expr) => `${ctx.boundValue?.(name) ?? ''} = ${expr};`;
  ctx.machineFunctionNew = (fixture) => {
    const kept = fixture.names.map((name, i) => `${ctx.boundValue?.(name) ?? ''} = args[${i}]; `).join('');
    const steps = kept + fixture.steps.map((step, i) => {
      const call = invoke(step.fn, step.args, typeof step.on === 'number' ? `args[${step.on}]` : (ctx.boundValue?.(step.on) ?? ''));
      // GN-13o: a step that names raises fails with that kind.
      if (step.raises !== undefined) return `${form.fails(call, step.raises, `step ${i} fails with ${step.raises}`)} `;
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
    (after ?? []).map((call, i) => {
      // GN-13o: a call on an argument that a function fixture kept, and a call that fails with a kind.
      const on = call.on === undefined ? receiver : (ctx.boundValue?.(call.on) ?? '');
      const made = invoke(call.fn, callArgs(model, ctx, call.fn, (arg) => caseValue(model, ctx, arg, call.args)), on);
      if (call.raises !== undefined) return `\n  ${form.fails(made, call.raises, `after ${i} fails with ${call.raises}`)}`;
      const expected = stepExpected(model, ctx, call.fn, call.result);
      if ('refused' in expected) return `\n  assert.fail(${jsString(expected.refused)});`;
      usesOrdered = true;
      return `\n  assert.deepStrictEqual(ordered(${made}), ordered(${expected.text}));`;
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
    // GN-13t: an argument of a class is the case value of a case of the member, where one gives it.
    const classGiven = classCaseArgs(model, fn);
    const call = (override: Map<unknown, string>): string =>
      target(callArgs(model, ctx, fn, (arg) => override.get(arg) ?? otherValue(model, ctx, arg, classGiven)));
    const reachable = fn.receiver === undefined || sample !== undefined;
    // GN-6z: a value of a function type that is not a function is refused as it enters.
    const functionArg = fn.args.find((a) => typeof a.type === 'object' && 'function' in a.type && !machineFunction(a.type));
    if (functionArg !== undefined && reachable) {
      emit(`
test('GN-6z: ${name} refuses a ${langName('node', functionArg.name, 'variable')} that is not a function', () => {
  assert.throws(() => ${target(callArgs(model, ctx, fn, (arg) => (arg === functionArg ? '0' : otherValue(model, ctx, arg, classGiven))))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_argument_type');
});`);
    }
    for (const arg of reachable ? fn.args : []) {
      const argName = langName('node', arg.name, 'variable');
      const number = isNumber(arg.type);
      if (number !== undefined) {
        emit(`
test('GN-12a: ${name} refuses a ${argName} of another type than ${number}', () => {
  for (const bad of [${[...(OTHER_TYPES[number] ?? []), ...(numberRefusesNull(arg) ? ['null'] : [])].join(', ')}]) {
    assert.throws(() => ${call(new Map([[arg, 'bad']]))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_argument_type', String(bad));
  }
});`);
      }
      if (number !== undefined && BAD_NUMBERS[number] !== undefined) {
        emit(`
test('B-2: ${name} refuses a ${argName} that is not ${number}', () => {
  for (const bad of [${BAD_NUMBERS[number].join(', ')}]) {
    assert.throws(() => ${call(new Map([[arg, 'bad']]))}, (error) => error.constructor === pkg.${cls('value')} && error.kind === 'invalid_number', String(bad));
  }
});`);
      }
      const refused = refusedKeyMap(model, ctx, arg.type);
      if (refused !== undefined) {
        emit(`
test('T-2: ${name} refuses a ${refused.kind} key in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, refused.value]]))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_argument_type');
});`);
      }
      const unsafeKey = unsafeKeyMap(model, ctx, arg.type);
      if (unsafeKey !== undefined) {
        emit(`
test('B-2: ${name} refuses a key outside the safe integers in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, unsafeKey]]))}, (error) => error.constructor === pkg.${cls('value')} && error.kind === 'invalid_number');
});`);
      }
      // GN-13d: an optional or a value type takes null as a value, so only another type refuses it.
      if (refusesNull(arg) && !takesNull(model, arg.type)) {
        emit(`
test('U-2: ${name} takes null in ${argName} as a value', () => {
  assert.throws(() => ${call(new Map([[arg, 'null']]))}, (error) => ['invalid_argument_type', 'invalid_number', 'invalid_text'].includes(error.kind));
});`);
      }
      // GN-6y: a path with a NUL byte is kind invalid_path, a string with an unpaired surrogate kind invalid_text, and a
      // value that is neither a string nor a Uint8Array kind invalid_argument_type.
      if (isPath(arg.type)) {
        emit(`
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
        emit(`
test('T-7: ${name} refuses a ${argName} that is not ${bytes === 'source' ? 'a string or a Uint8Array' : 'a Uint8Array'}', () => {
  for (const bad of [1, new Uint16Array(1), [1]${bytes === 'source' ? '' : ", 'a'"}]) {
    assert.throws(() => ${call(new Map([[arg, 'bad']]))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_argument_type');
  }
});`);
      }
      if (bytes === 'source') {
        emit(`
test('B-3: ${name} refuses an unpaired surrogate in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, "'\\uD800'"]]))}, (error) => error instanceof pkg.${cls('value')} && error.kind === 'invalid_text');
});`);
      }
      // U-7: a kind of an alias's in function reaches the caller of a member that takes the alias.
      const refusedValue = aliasRepresentative(model, ctx, arg.type);
      if (refusedValue !== undefined) {
        emit(`
test('U-7: ${name} gives the kind of ${refusedValue.kase.alias.unit.id} in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, refusedValue.value]]))}, (error) => error.constructor === pkg.${exactClass(refusedValue.kase)} && error.kind === ${jsString(refusedValue.kase.kind)});
});`);
      }
      const text = textKind(arg.type);
      if (text !== undefined) {
        const bad = text === 'latin1' ? "'\\u0100'" : "'\\uD800'";
        emit(`
test('B-3: ${name} refuses ${text === 'latin1' ? 'a character above U+00FF' : 'an unpaired surrogate'} in ${argName}', () => {
  assert.throws(() => ${call(new Map([[arg, wrapText(arg.type, bad)]]))}, (error) => error instanceof pkg.${cls('value')} && error.kind === 'invalid_text');
});`);
      }
    }
    // GN-6ae: a parameter of a function type takes a function, and any other value is kind invalid_callback.
    for (const arg of reachable ? fn.args.filter((a) => machineFunction(a.type)) : []) {
      emit(`
test('GN-6ae: ${name} refuses a ${langName('node', arg.name, 'variable')} that is no function', () => {
  assert.throws(() => ${call(new Map([[arg, '1']]))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_callback');
});`);
    }
    for (const pair of reachable ? samePairs(model, ctx, fn) : []) {
      usesOutcome = true;
      const argName = langName('node', pair.arg.name, 'variable');
      // GN-13bg: two results that hold an instance of a value class of another repository are compared through
      // ordered, which reads the instance by its in row; assert.deepStrictEqual compares two instances by no property.
      const read = holdsForeign(model, fn.returns);
      usesOrdered ||= read;
      const outcomeOf = (expr: string): string => (read ? `ordered(${nodeOutcome(expr)})` : nodeOutcome(expr));
      emit(`
test('${pair.rule === 'U-2' ? `U-2: ${name} without ${argName} is the call with its default` : `T-1: ${name} takes a text in ${argName} as its UTF-8 bytes`}', () => {
  assert.deepStrictEqual(${outcomeOf(target(callArgs(model, ctx, fn, pair.left)))}, ${outcomeOf(target(callArgs(model, ctx, fn, pair.right)))});
});`);
    }
    for (const kase of raisingCases(model, fn)) {
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        emit(`
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
      emit(`
test('B-4: ${name} ${kase.id}', () => {${nodeCaseFileLines(kase.files, kase.listener)}${nodeServiceStart(kase.service)}${receiverMade.lines}${before}${arming}
  assert.throws(() => ${invoke(fn, args, receiver)}, (error) =>
    error.constructor === pkg.${exactClass(kase.raises)} &&
    error instanceof pkg.${cls(kase.raises.category)} &&
    error instanceof ${nodeBase(kase.raises.category)} &&
    error.kind === ${jsString(kase.raises.kind)} &&
${kase.raises.status === undefined ? '' : `    error.status === ${kase.raises.status === null ? 'null' : String(kase.raises.status)} &&\n`}    error.errno === ${errno === null ? 'null' : 'symbol' in errno ? `errnoOf.${errno.symbol}` : String(errno.value)});${kase.faults === undefined ? '' : '\n  assert.deepEqual(addon().__faultLeft(armed), []);'}${after}${afterChecks(kase.after, 'receiver')}${nodeServiceEnd(kase.service)}${kept(fn)}
});`);
    }
    // GN-6ae: a case whose function fixture raises an exception of the language gets the same object.
    for (const kase of callbackCases(model, fn)) {
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        emit(`
test('GN-6ae: ${name} ${kase.id}', () => {
  assert.fail(${jsString(refusal)});
});`);
        continue;
      }
      const receiverMade = heldReceiver(receiverOfCase(kase.receiver), kase.after ?? []);
      const args = callArgs(model, ctx, fn, (arg) => caseValue(model, ctx, arg, kase.args));
      emit(`
test('GN-6ae: ${name} ${kase.id}', () => {${nodeCaseFileLines(kase.files, kase.listener)}${nodeServiceStart(kase.service)}${receiverMade.lines}
  const raised = new Error(${jsString(FIXTURE_RAISED)});
  assert.throws(() => ${invoke(fn, args, receiverMade.expr)}, (error) => error === raised);${afterChecks(kase.after, 'receiver')}${nodeServiceEnd(kase.service)}${kept(fn)}
});`);
    }
    // GN-13e: every case that does not raise runs, and its result is compared with the value that the case gives.
    for (const kase of resultCases(model, fn)) {
      if (kase.refused !== undefined) {
        emit(`
test('GN-13e: ${name} ${kase.id}', () => {
  assert.fail(${jsString(kase.refused)});
});`);
        continue;
      }
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        emit(`
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
      emit(`
test('GN-13e: ${name} ${kase.id}', () => {${nodeCaseFileLines(kase.files, kase.listener)}${nodeServiceStart(kase.service)}${receiverMade.lines}${before}${check}${after}${afterChecks(kase.after, 'receiver')}${nodeServiceEnd(kase.service)}${kept(fn)}
});`);
    }
    const values = (arg: { type: unknown }): string => placeholder(model, ctx, arg.type as never);
    const callback = callbackArg(model, fn);
    // GN-13y: the other arguments of a case that reaches the callback, where one exists.
    const reaching = callbackReachingArgs(model, fn);
    const cbUnit = callback === undefined ? undefined : unitOf(model, callback.type);
    if (callback !== undefined && cbUnit !== undefined && reachable) {
      const with_ = (how: CallbackHow): string =>
        target(callArgs(model, ctx, fn, (arg) => (arg === callback ? ctx.callbackNew(cbUnit, how) : reaching === undefined ? otherValue(model, ctx, arg, classGiven, true) : caseValue(model, ctx, arg, reaching))));
      emit(`
test('K-2: ${name} refuses a callback without its members', () => {
  assert.throws(() => ${with_({ missing: true })}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_callback');
});${!fn.failure ? '' : `

test('K-2: ${name} lets the exception of a callback through', () => {
  const raised = new Error('raised by the callback');
  assert.throws(() => ${with_({ raise: 'raised' })}, (error) => error === raised);
});`}${fn.failure && judgesCallbackResult(model, cbUnit) ? `

test('K-2: ${name} refuses a callback result of another type', () => {
  assert.throws(() => ${with_({ returns: 'wrong' })}, (error) => ['invalid_argument_type', 'invalid_number', 'invalid_text'].includes(error.kind));
});` : ''}`);
    }
    for (const kase of primitiveCases(model, ctx, fn)) {
      const instance = receiverOfCase(kase.receiver);
      const number = invoke(fn, '', instance.expr);
      emit(`
test('N-4: ${name} ${kase.id}', () => {${instance.lines}
  ${kase.result === undefined ? `${number};` : `assert.strictEqual(${number}, ${kase.result});`}
});`);
    }
    for (const kase of stringCases(model, fn)) {
      emit(`
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
    emit(`
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
    emit(`
test('B-5c: ${langName('node', test.object.unit.name, 'class')} refuses a poisoned object', () => {
  const held = ${test.instance};${[`addon().${POISON_ENTRY.node}(held)`, test.receiver, test.parameter].filter((call) => call !== undefined).map((call) => refused('internal', 'internal', call)).join('')}
});`);
  }
  for (const test of held.busy) {
    emit(`
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
    emit(`
test('U-3: a function called on another thread is kind wrong_thread (GN-6z)', () => {
  assert.equal(addon().__threadTest(() => null), 'wrong_thread');
});`);
  }
  // GN-6u: an object goes through the native row and back as the same object, and the binding releases its Native.
  // The event loop turns once before the first count, and the test awaits nothing until the second: napi runs the
  // finalizers of the objects of earlier tests in a SetImmediate, and their Natives would change a count across a turn.
  const roundTrip = nativeRoundTrip(model.contract, 'node');
  const roundFn = roundTrip === undefined ? undefined : model.functions.find((f) => f.member.id === roundTrip.id);
  if (roundFn !== undefined) {
    usesAddon = true;
    const same = (value: string): string => invoke(roundFn, value, '');
    emit(`
test('GN-6u: ${langName('node', roundFn.member.name, 'callable')} gives back the same object and releases it', async () => {
  ${same('new Subject()')};
  await new Promise(setImmediate);
  const before = addon().__nativeCount();
  const subject = new Subject();
  assert.equal(${same('subject')}, subject);
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
    emit(`
test('GN-6o: ${langName('node', fn.unit.name, 'class')}.${langName('node', fn.member.name, 'callable')} consumes its object', () => {
  const held = ${made(sample)};
  ${nodeOutcome(invoke(fn, args, 'held'))};
  assert.throws(() => ${invoke(fn, args, 'held')}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'consumed');
});`);
  }
  // GN-6b: a direct construction of a class without a constructor (U-1 constructible) is kind direct_construction.
  for (const object of model.objects.filter((o) => !o.constructible)) {
    const label = langName('node', object.unit.name, 'class');
    emit(`
test('GN-6b: new ${label}() is kind direct_construction', () => {
  assert.throws(() => new pkg.${label}(), (error) => error.constructor === pkg.${cls('type')} && error.kind === 'direct_construction' && error.message === ${jsString(`${label} has no public constructor`)});
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
    emit(`
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
  ${scoped(made(sample))}
  gc();
  assert.equal((await warned).message, expected);
});`);
  }
  // U-7: the cases of an alias run its in function alone, through the entry point of the feature codec-test.
  for (const kase of aliasCases(model)) {
    const errno = expectedErrno(kase);
    usesErrno ||= errno !== null && 'symbol' in errno;
    usesAddon = true;
    emit(`
test('U-7: ${kase.alias.unit.id} in ${kase.id}', () => {
  assert.throws(() => addon().__aliasIn${langName('node', kase.alias.unit.name, 'class')}(${fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)}), (error) => error.constructor === pkg.${exactClass(kase)} && error.kind === ${jsString(kase.kind)}${kase.raises.status === undefined ? '' : ` && error.status === ${kase.raises.status === null ? 'null' : String(kase.raises.status)}`} && error.errno === ${errno === null ? 'null' : 'symbol' in errno ? `errnoOf.${errno.symbol}` : String(errno.value)});
});`);
  }
  // GN-6m: a block may hold several tests, each of which awaits when its call does.
  const usesCaseText = textPaths.used();
  if (usesCaseText) nodeCaseTextProof(ctx, emit);
  const blocks = out.map((block) => linuxOnlyTests(block).split(/(?=\ntest\()/).map(awaitedTest).join(''));
  usesOutcome = blocks.some((block) => block.includes('outcome('));
  const usesSettled = blocks.some((block) => block.includes('settled('));
  const usesCaseFile = usesCaseText || blocks.some((block) => block.includes('caseFile(') || block.includes('caseByteFile('));
  const usesCasePath = usesCaseFile || blocks.some((block) => block.includes('casePath('));
  // GN-13j: the helpers of a service, which the lines of a test and its values call.
  const usesService = blocks.some((block) => /\bservice(Address|State)\(/.test(block));
  // GN-13q: the helpers of a peer session, which the lines of a test with a peer await.
  const usesPeer = blocks.some((block) => /\bservicePeer\(/.test(block));
  // GN-13r: the listener of a case, a Worker that the test starts.
  const usesListener = blocks.some((block) => block.includes('\n  caseListener();'));
  // GN-13e, B2.121: ordered reads an instance of a value class of another repository through its in row.
  const readers = usesOrdered ? foreignReaders(model, 'node') : [];
  const foreignClass = ctx.foreignClass as (library: string, unit: Unit) => string;
  const ordered = nodeOrdered(foreignClassNames(readers, foreignClass), nodeForeignRead(readers, 'node', foreignClass));
  // GN-13e, GN-6ar: the classes that a result of an alias holds; a class of another repository is read through the
  // package of its owner, which the test imports.
  const forms = usesTokens ? tokenForms(model, 'node') : [];
  for (const form of forms) if (form.library !== undefined) foreignModules.add(form.library);
  return `${header('//')}
import assert from 'node:assert/strict';${usesService ? `\nimport { ${usesPeer ? 'spawn, ' : ''}spawnSync } from 'node:child_process';` : ''}
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';${usesPeer ? "\nimport { createInterface } from 'node:readline';" : ''}
import test${usesCasePath || usesPeer || usesListener ? ', { afterEach }' : ''} from 'node:test';${usesCasePath ? nodeCaseImports(usesCaseFile, usesCaseText) : ''}${usesListener ? "\nimport { Worker } from 'node:worker_threads';" : ''}${usesGc ? "\nimport { setFlagsFromString } from 'node:v8';\nimport { runInNewContext } from 'node:vm';" : ''}${usesFixture ? "\nimport { isDeepStrictEqual } from 'node:util';" : ''}
${usesErrno ? "import { constants } from 'node:os';\n" : ''}import * as pkg from ${jsString(esm)};
${[...foreignModules].map((library) => `import * as foreign_${library.replaceAll('-', '_')} from ${jsString(`${(model.foreign.get(library)?.packages['node'] as { package: string } | undefined)?.package ?? library}`)};\n`).join('')}

const require = createRequire(import.meta.url);
${roundFn === undefined ? '' : '\n// GN-6u: the subject of the round-trip test, an object that only the test makes.\nclass Subject {}\n'}${usesGc ? "\n// GN-6p: gc() of V8, which the B-10 tests call to finalize an object.\nsetFlagsFromString('--expose-gc');\nconst gc = runInNewContext('gc');\n" : ''}${usesFixture ? NODE_FIXTURE : ''}${usesOutcome ? NODE_OUTCOME : ''}${usesSettled ? NODE_SETTLED : ''}${usesOrdered ? ordered : ''}${usesBound ? '\n// GN-13n: the arguments that the function fixtures of the test in progress keep by name.\nconst bound = {};\n' : ''}${usesTokens ? nodeTokens(forms) : ''}${usesCasePath ? NODE_CASE_PATH : ''}${usesCaseFile ? NODE_CASE_FILE : ''}${usesCaseText ? NODE_CASE_TEXT : ''}${usesService ? NODE_SERVICE : ''}${usesPeer ? NODE_PEER : ''}${usesListener ? NODE_CASE_LISTENER : ''}
${usesErrno ? '// G-5: the value that the symbol of an errno has on this machine.\nconst errnoOf = constants.errno;\n' : ''}
// T-2: the addon of the platform package, or the file beside the entry of a build in a checkout (GN-3c).
function addon() {
  const platform = ${NODE_PLATFORM_JS};
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
