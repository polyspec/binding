// What the test generators share (G-5): the generated node:test module of Node and that of WASM are one JavaScript
// module of node:test, which differ only in how a test reaches the entry points of the crate (the addon of Node, the
// glue of wasm-bindgen), in the errno of a failure and in the services of a case, which only Node runs. Each part here
// is written once and both generators call it.

import { type Fn, type Model, type Arg, Unsupported, awaits, callsCode, categoryClass, cleanupWarning, errorUnitOfKind, hookCall, langName, machineFunction, memberName, takesNull, unitOf } from './model.ts';
import { type After, type CallbackHow, type Context, type MadeForm, type Receiver, BYTE_NAME_LINUX, CASE_JSON_STRING_GOLDENS, aliasCases, aliasRepresentative, bytesKind, callArgs, callables, callbackArg, callbackCases, callbackReachingArgs, caseFilesOf, caseListenerOf, caseRefusal, caseValue, classCaseArgs, convertedCause, expectedErrno, expectedText, fixtureValues, fixturesOf, fromJson, functionFixturesOf, isNumber, isPath, isPlain, jsCause, jsMade, judgesCallbackResult, madeBeforeArgs, madeLines, numberRefusesNull, onceArgs, onceRows, otherValue, placeholder, primitiveCases, raisedLines, raisingCases, refusedKeyMap, refusesNull, resultCases, samePairs, sampleReceiver, stepExpected, stringCases, textKind, tokenForms, unsafeKeyMap, wrapText } from './samples.ts';
import { jsString } from './text.ts';
import { jsArguments, jsDeclaredMember, placeTests, refusedJs } from './callback_arguments.ts';
import { foreignClassNames, foreignReaders, holdsForeign, nodeForeignRead } from './value_class.ts';
import type { Unit } from '../contract.ts';

// B-2: the numbers that break the rule of each number type (kind invalid_number), and the values of another type than
// the number that the place takes (kind invalid_argument_type, GN-12a), a null only where it is no absent value.
const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['NaN', 'Infinity', '-Infinity', '1.5', '-1', '2 ** 53'],
  int: ['NaN', 'Infinity', '-Infinity', '1.5', '2 ** 53', '-(2 ** 53)'],
};
const OTHER_TYPES: Record<string, string[]> = { uint: ['true', "'7'", '7n'], int: ['true', "'7'", '7n'], int64: ['true', "'7'"], float: ['true', "'7'", '7n'] };

// E-2: the class of JavaScript that a failure of a category extends.
const jsBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';

// G-5: the callback fixture. A call that no row answers is recorded and throws, so a core that swallows the exception
// still fails the test, which reads the record. GN-6bu: a member is given as its name and the function that declares
// its arguments and passes them on, so the member of the object names the arguments that the binding calls it with.
// GN-13bi: the fixtures that the running test made, each with its rows and those that are left; unanswered gives the
// rows once among them that answered no call, which the test of a case requires to be none at its end.
export const NODE_FIXTURE = `
class UnexpectedCall extends Error {}

const fixturesMade = [];
test.beforeEach(() => {
  fixturesMade.length = 0;
});

function unanswered() {
  return fixturesMade.flatMap(({ rows, left }, at) => left.filter((row) => row[3]).map((row) => \`the row \${rows.indexOf(row)} of the fixture \${at}: \${row[0]}(\${row[1].map(String).join(', ')})\`));
}

function fixture(members, rows, read = (value) => value) {
  const unexpected = [];
  const calls = [];
  const left = [...rows];
  fixturesMade.push({ rows, left });
  const object = {};
  for (const [name, declare] of members) {
    object[name] = declare((...args) => {
      calls.push([name, args]);
      const at = left.findIndex((row) => row[0] === name && isDeepStrictEqual(read(row[1]), read(args)));
      if (at < 0) {
        unexpected.push([name, args]);
        throw new UnexpectedCall(\`\${name}(\${args.map(String).join(', ')})\`);
      }
      const [, , result, once, raised] = left[at];
      if (once) left.splice(at, 1);
      if (raised !== null) throw raised;
      return result;
    });
  }
  return { object, unexpected, calls };
}
`;

// GN-13bg: the fixture of a test of Node or WASM from its values. Where an argument of a member holds an instance of a
// value class of another repository, the fixture reads the arguments of a row and of a call through ordered, which
// reads such an instance by its in row: isDeepStrictEqual compares two instances by no property, so any instance
// found the row of another.
export const nodeFixture = (values: { members: string[]; rows: string[][]; foreign: boolean }): string =>
  `fixture([${values.members.join(', ')}], [${values.rows.map((row) => `[${row.join(', ')}]`).join(', ')}]${values.foreign ? ', ordered' : ''})`;

// G-5, GN-13bg: after the call, no call of the fixture was one that no row answers, and its calls are those that the
// case names, read through ordered where an argument holds such an instance.
export const nodeFixtureChecks = (name: string, values: { calls: string[][] | undefined; foreign: boolean }): string => {
  if (values.calls === undefined) return `\n  assert.deepEqual(${name}.unexpected, []);`;
  const calls = `[${values.calls.map((call) => `[${call.join(', ')}]`).join(', ')}]`;
  return `\n  assert.deepEqual(${name}.unexpected, []);\n  assert.deepEqual(${values.foreign ? `ordered(${name}.calls), ordered(${calls})` : `${name}.calls, ${calls}`});`;
};

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
// GN-13e, B2.510: and a branch for each value class of the contract, an instance of which is its class and the values
// of its properties, each ordered again, so a list, a map or a value class inside it compares as far as it goes. A napi
// or wasm-bindgen class has its getters on the prototype and no own property, so assert.deepStrictEqual compared the
// prototypes alone and passed two instances whose values differ.
export const nodeOrdered = (foreign: string[], read: string, own: { cls: string; name: string; properties: string[] }[] = []): string => `${read}${NODE_ORDERED.replace(
  'function ordered(value) {\n',
  `function ordered(value) {\n${own.map(({ cls, name, properties }) => `  if (value instanceof ${cls}) return { class: ${jsString(name)}, values: [${properties.map((p) => `ordered(value.${p})`).join(', ')}] };\n`).join('')}${foreign.length === 0 ? '' : `  if (${foreign.map((c) => `value instanceof ${c}`).join(' || ')}) return { foreign: readForeign(value) };\n`}`,
)}`;

// GN-13e, B2.510: the value classes of the contract in Node or WASM, each with the properties that ordered reads.
export const nodeValueClasses = (model: Model, lang: 'node' | 'wasm'): { cls: string; name: string; properties: string[] }[] =>
  [...model.objects.map((o) => o.unit), ...model.kept.map((k) => k.unit)].filter((unit) => unit.origin === 'value').map((unit) => {
    const name = langName(lang, unit.name, 'class');
    return { cls: `pkg.${name}`, name, properties: (unit.members ?? []).filter((m) => m.kind === 'property').map((m) => langName(lang, m.name, 'callable')) };
  });

// G-5: what a call gives: its result, or the class and the kind of its failure.
export const NODE_OUTCOME = `
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

// GN-6y, GN-13i: the imports of node:fs and node:os that the directory of a test and the files of a case use.
export const nodeCaseImports = (usesCaseFile: boolean, usesCaseText = false): string =>
  `\nimport { ${usesCaseFile ? `mkdirSync, mkdtempSync, ${usesCaseText ? 'readFileSync, ' : ''}realpathSync, rmSync, writeFileSync` : 'mkdtempSync, realpathSync, rmSync'} } from 'node:fs';\nimport { tmpdir } from 'node:os';`;

// E-2, B-4: the exact class of a failure of a case in a language: the class of the error unit of its kind, or that of
// its category.
export const exactClassOf = (model: Model, lang: 'node' | 'wasm' | 'python', cls: (category: string) => string) =>
  (raises: { kind: string; category: string }): string => {
    const unit = errorUnitOfKind(model, raises.kind);
    return unit === undefined ? cls(raises.category) : langName(lang, unit.unit.name, 'class');
  };

// GN-13l: the case root of the case texts in the tests of PHP and Python, whose methods are written apart and take the
// root only where an expression of theirs takes a case text path: dependency records come from real generation calls,
// never from literal marker text.
export class CaseTextRoots {
  // The count of the case text paths written so far, and that count when the last method was written.
  uses = 0;
  methodMark = 0;
  // For each method written, whether it takes the root.
  readonly methods: boolean[] = [];
  private readonly marks: number[] = [];
  private readonly expressions = new Set<string>();

  // A method of each block is written: it takes the root when a case text path was written since the last one.
  take = (blocks: number): void => {
    for (let i = 0; i < blocks; i += 1) this.methods.push(this.uses > this.methodMark);
    this.methodMark = this.uses;
  };

  // A case text path is written.
  path = (): void => {
    this.uses += 1;
  };

  rootNeeded = (): boolean => {
    const mark = this.marks.at(-1);
    return mark !== undefined && this.uses > mark;
  };

  withRoot = (expression: string, needed: boolean): string => {
    if (needed) {
      this.expressions.add(expression);
      this.uses += 1;
    }
    return expression;
  };

  useExpression = (expression: string): string => this.withRoot(expression, this.expressions.has(expression));

  expression = (make: () => string): string => {
    const mark = this.uses;
    this.marks.push(mark);
    try {
      const expression = make();
      if (this.uses > mark) this.expressions.add(expression);
      return expression;
    } finally {
      this.marks.pop();
    }
  };

  // GN-13f: a receiver as one expression: a plain one is the call of its factory, an instance value the code that wrap
  // makes of its lines, which takes the root when they do.
  made = <B>(plain: (() => string) | undefined, build: () => B, wrap: (built: B, needed: boolean) => string): string => {
    const mark = this.uses;
    if (plain !== undefined) {
      const expression = plain();
      return this.withRoot(expression, this.uses > mark);
    }
    const built = build();
    const needed = this.uses > mark;
    return this.withRoot(wrap(built, needed), needed);
  };

  // GN-13l: the callback of the test that composed paths use the old file-owned root, made twice, the second from the
  // cache of the helpers of the module.
  witness = (ctx: Context, language: string): [string, string] => {
    this.methodMark = this.uses;
    const rootCallback = (): string => this.expression(() => {
      const value = ctx.caseTextPath?.(CASE_TEXT_WITNESS, false);
      if (value === undefined) throw new Unsupported(`GN-13l: the ${language} case-root callback is missing`);
      const callback = ctx.machineFunctionNew?.({ names: [], parameters: 0, awaits: false, steps: [], end: { result: value } });
      if (callback === undefined) throw new Unsupported(`GN-13l: the ${language} function-fixture callback is missing`);
      return callback;
    });
    const callback = rootCallback();
    return [callback, rootCallback()];
  };
}

// GN-13l: the file of the test that composed paths use the old file-owned root, and its bytes as hex.
export const CASE_TEXT_WITNESS = 'owned-text-witness/file';
export const CASE_TEXT_WITNESS_HEX = '726f6f74207769746e657373';

// G-5: how the tests of a JavaScript target reach what the crate gives them for tests alone, and what else differs
// between Node and WASM.
export interface JsTarget {
  // The language of the names (L-5): node or wasm.
  lang: 'node' | 'wasm';
  // The members of the context that only this target has.
  ctx: Partial<Context>;
  // The members of the form of a made value that only this target has.
  form: Partial<MadeForm>;
  // GN-6y: a path of a case is tested for a NUL byte and for a value that is no path.
  paths: boolean;
  // G-5: the expression that arms the faults of a member in a test that does not wait, and that which reads what is
  // left of an arming.
  stepArm: (member: string, faults: string) => string;
  stepLeft: (local: string) => string;
  // GN-6ae: the expression that counts what the table of the crate keeps of what was thrown.
  thrownCount: () => string;
  // G-5: in a test of a case: the lines that open the module of the entry points of tests, and its reference; a test
  // whose lines open it waits.
  caseGlue: () => { open: string; ref: string };
  // G-5: the faults of a case as this target arms them.
  faults: (faults: string) => string;
  // G-5: the errno that a failure of a case carries.
  errno: (errno: ReturnType<typeof expectedErrno>) => string;
  // GN-13j: the lines of the service of a case at the start and at the end of its test.
  serviceStart: (service: unknown) => string;
  serviceEnd: (service: unknown) => string;
}

// G-5: the tests of one JavaScript target, which both generators write alike, and what their modules need.
export function jsTests(model: Model, target: JsTarget) {
  const lang = target.lang;
  const foreignModules = new Set<string>();
  const foreignOf = (library: string): string => `foreign_${library.replaceAll('-', '_')}`;
  const ctx: Context = {
    lang: 'node', enumRef: (_name, value) => jsString(value),
    // GN-6aq: an AbortSignal that was aborted before the call, or one whose controller never aborts it.
    cancelNew: (fired) => (fired ? 'AbortSignal.abort()' : 'new AbortController().signal'),
    listenerPort: 'caseListenerPort',
    // GN-6x: a class of another repository, through the owner's package.
    foreignClass: (library, unit) => {
      foreignModules.add(library);
      return `${foreignOf(library)}.${langName(lang, unit.name, 'class')}`;
    },
    // GN-6s: an error unit of the owner of a callback unit of another repository, through the owner's package.
    errorNew: (unit, kind, message, library) => {
      if (library !== undefined) foreignModules.add(library);
      return `new ${library === undefined ? 'pkg' : foreignOf(library)}.${langName(lang, unit.name, 'class')}(${jsString(message)}, ${jsString(kind)})`;
    },
    // B2.489 (GN-7a): an instance of a class of another library with values, by the internal maker of its package.
    madeNew: (made, properties) => {
      foreignModules.add(made.library);
      return jsMade(made, properties, lang, foreignOf(made.library));
    },
    // U-3: a callback object.
    callbackNew: (unit, how) => {
      if ('missing' in how) return '{}';
      // GN-6bu: each member declares the arguments that the binding calls it with.
      const body = (count: number): string => `(${jsArguments(count)}) => ${'raise' in how ? `{ throw ${how.raise}; }` : how.returns === 'wrong' ? 'Symbol()' : 'null'}`;
      return `{ ${(unit.members ?? []).filter((m) => m.default === undefined).map((m) => `${langName(lang, m.name, 'callable')}: ${body((m.parameters ?? []).length)}`).join(', ')} }`;
    },
    recordNew: (unit, fields) => `{ ${(unit.fields ?? []).map((f, i) => `${langName(lang, f.name, 'variable')}: ${fields[i] ?? ''}`).join(', ')} }`,
    // GN-6v: a case is an object of its tag and its fields.
    variantNew: (variant, kase, fields) => `{ ${[`${langName(lang, variant.unit.tag ?? [], 'variable')}: ${jsString(kase.value)}`, ...(kase.unit.fields ?? []).map((f, i) => `${langName(lang, f.name, 'variable')}: ${fields[i] ?? ''}`)].join(', ')} }`,
    ...target.ctx,
  };
  const cls = (category: string): string => categoryClass(model, category);
  const exactClass = exactClassOf(model, lang, cls);
  const out: string[] = [];
  const textPaths = nodeCaseTextScope(ctx, out);
  const emit = textPaths.emit;
  const uses = { fixture: false, ordered: false, bound: false, tokens: false, gc: false };
  // GN-13bi: the count of the rows once of the fixtures written so far; the test of a case in which the count grew
  // requires at its end, after the calls of after, that each row once of its fixtures answered a call.
  let onceMade = 0;
  const answered = (since: number): string => (onceMade === since ? '' : '\n  assert.deepEqual(unanswered(), []);');
  // GN-6m: a call of a member that waits is awaited where it is made.
  const invoke = (fn: Fn, args: string, receiver: string): string => textPaths.derive(awaits(fn) ? `(await ${called(fn, args, receiver)})` : called(fn, args, receiver), [args, receiver]);
  // T-5: a member of a class is called as JavaScript calls it; a stringify and a to_json as the language runs the hook.
  const called = (fn: Fn, args: string, receiver: string): string => {
    const hook = hookCall('node', fn, receiver);
    if (hook !== undefined) return hook;
    const member = langName(lang, fn.member.name, 'callable');
    // GN-6s, GN-13f: a member of another repository that an instance value names, through the owner's package.
    if (fn.library !== undefined) foreignModules.add(fn.library);
    const prefix = fn.library === undefined ? 'pkg' : foreignOf(fn.library);
    const unit = `${prefix}.${langName(lang, fn.unit.name, 'class')}`;
    if (fn.kind === 'function') return `${prefix}.${member}(${args})`;
    if (fn.kind === 'constructor') return `new ${unit}(${args})`;
    if (fn.kind === 'static') return `${unit}.${member}(${args})`;
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
    // GN-6m: the outcome is parenthesized, so a test that waits reads kind of the settled outcome, not of its promise.
    fails: (expr, kind, what) => `assert.equal((${nodeOutcome(expr)}).kind, ${jsString(kind)}, ${jsString(`G-5: ${what}`)});`,
    pick: (expr, step) => 'present' in step ? expr : textPaths.derive('field' in step ? `${expr}.${langName(lang, step.field.split('_'), 'variable')}` : `${expr}[${'index' in step ? step.index : step.tuple}]`, [expr]),
    arm: (local, member, faults) => `const ${local} = ${target.stepArm(member, faults)};`,
    left: (local, what) => `assert.deepEqual(${target.stepLeft(local)}, [], ${jsString(`G-5: ${what}`)});`,
    ...target.form,
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
      // GN-6m: a receiver that a call that waits makes is awaited; an await in a function that is not async is a
      // syntax error that stops the whole file from loading.
      return /\bawait /.test(body) ? `(await (async () => { ${body} })())` : `(() => { ${body} })()`;
    };
    return ctx.caseTextExpression === undefined ? make() : ctx.caseTextExpression(make);
  };
  ctx.instanceNew = made;
  // GN-6aa: a callback value inside another value is the object of a fixture, whose unexpected call throws.
  ctx.fixtureNew = (values) => {
    uses.fixture = true;
    onceMade += onceRows(values.rows);
    uses.ordered ||= values.foreign;
    return `${nodeFixture(values)}.object`;
  };
  // GN-6z: a function value inside another value is the call of a fixture, whose unexpected call throws.
  ctx.functionMember = 'call';
  ctx.functionNew = (rows, parameters, foreign) => {
    uses.fixture = true;
    onceMade += onceRows(rows);
    uses.ordered ||= foreign;
    return `${nodeFixture({ members: [jsDeclaredMember("'call'", parameters)], rows, foreign })}.object.call`;
  };
  // G-5: the fixtures of a case: a callback parameter is the object of a fixture, and a function value (GN-6z) the call
  // of a fixture whose one member is the call; the test reads the record of each after the call.
  const fixturesAt = (fn: Fn, id: string, args: Map<Arg, unknown>): { fixture: { arg: Arg }; name: string; values: { members: string[]; rows: string[][]; calls: string[][] | undefined; foreign: boolean }; use: string }[] => [
    ...fixturesOf(model, fn, id, args).map((fixture, i) => ({ fixture, name: `fixture${i}`, values: fixtureValues(model, ctx, fixture), use: `fixture${i}.object` })),
    ...functionFixturesOf(model, ctx, fn, id, args, 'call').map((f, i) => ({ fixture: { arg: f.arg }, name: `function${i}`, values: { members: f.members, rows: f.rows, calls: undefined, foreign: f.foreign }, use: `function${i}.object.call` })),
  ];
  // G-5: the fixtures of a case, made before its call and read after it.
  const caseFixtures = (fn: Fn, kase: { id: string; args: Map<Arg, unknown> }): { list: ReturnType<typeof fixturesAt>; before: string; after: string; arg: (arg: Arg) => string | undefined } => {
    const list = fixturesAt(fn, kase.id, kase.args);
    uses.fixture ||= list.length > 0;
    onceMade += list.reduce((count, f) => count + onceRows(f.values.rows), 0);
    uses.ordered ||= list.some((f) => f.values.foreign);
    return {
      list,
      before: list.map((f) => `\n  const ${f.name} = ${nodeFixture(f.values)};`).join(''),
      after: list.map((f) => nodeFixtureChecks(f.name, f.values)).join(''),
      arg: (arg) => {
        const found = list.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.use;
      },
    };
  };
  // GN-6ae: the function of a function fixture: each step calls a method on one of its arguments; it then returns its
  // result, throws the instance of an error unit, or throws the exception that the test of the case holds. A function
  // whose step calls a member that waits is async, so it returns a promise, which the member awaits.
  // GN-13n: the arguments that function fixtures keep by name, in the store of the module, which the calls of after
  // read after the function returned (GN-13o).
  ctx.boundValue = (name) => {
    uses.bound = true;
    return `bound.${name}`;
  };
  ctx.boundSet = (name, expr) => `${ctx.boundValue?.(name) ?? ''} = ${expr};`;
  ctx.machineFunctionNew = (fixture) => {
    const kept = fixture.names.map((name, i) => `${ctx.boundValue?.(name) ?? ''} = arg${i}; `).join('');
    const steps = kept + fixture.steps.map((step, i) => {
      const call = invoke(step.fn, step.args, typeof step.on === 'number' ? `arg${step.on}` : (ctx.boundValue?.(step.on) ?? ''));
      // GN-13o: a step that names raises fails with that kind.
      if (step.raises !== undefined) return `${form.fails(call, step.raises, `step ${i} fails with ${step.raises}`)} `;
      // CK-22: a step that names a result requires it, by an assertion whose failure is an exception of the function.
      if (step.expected === undefined) return `${call}; `;
      if ('refused' in step.expected) return `assert.fail(${jsString(step.expected.refused)}); `;
      uses.ordered = true;
      return `assert.deepStrictEqual(ordered(${call}), ordered(${step.expected.text})); `;
    }).join('');
    const end = 'result' in fixture.end ? `return ${fixture.end.result};` : 'raise' in fixture.end ? `throw ${fixture.end.raise};` : 'throw raised;';
    // CK-22: a fixture with awaits is an async function, whose promise the member awaits; so is a function whose step
    // awaits the call of a member that waits. GN-6bu: the function declares the arguments that the machine calls it with.
    return `${fixture.awaits || /\bawait /.test(steps) ? 'async ' : ''}(${jsArguments(fixture.parameters)}) => { ${steps}${end} }`;
  };
  // GN-6ae: after a case of a member that takes a callback or a function, the table of the crate keeps nothing that
  // was thrown, which the entry point of thrown-count-test counts.
  const kept = (fn: Fn): string => (callsCode(model, fn) ? `\n  assert.equal(${target.thrownCount()}, 0);` : '');
  // GN-6ae: the calls of after of a case, each on the receiver of the case, with the result that the case names.
  const afterChecks = (after: After[] | undefined, receiver: string): string =>
    (after ?? []).map((call, i) => {
      // GN-13o: a call on an argument that a function fixture kept, and a call that fails with a kind.
      const on = call.on === undefined ? receiver : (ctx.boundValue?.(call.on) ?? '');
      if (call.raises !== undefined) {
        // B2.509: an instance value of the args is made before the outcome of the call, which holds the call alone.
        const before = madeBeforeArgs(model, ctx, call.fn, call.args, (n) => `after${i}_${n}`, (name, value) => `const ${name} = ${value};`);
        return [...before.lines, form.fails(invoke(call.fn, before.args, on), call.raises, `after ${i} fails with ${call.raises}`)].map((line) => `\n  ${line}`).join('');
      }
      const made = invoke(call.fn, callArgs(model, ctx, call.fn, (arg) => caseValue(model, ctx, arg, call.args)), on);
      const expected = stepExpected(model, ctx, call.fn, call.result);
      if ('refused' in expected) return `\n  assert.fail(${jsString(expected.refused)});`;
      uses.ordered = true;
      return `\n  assert.deepStrictEqual(ordered(${made}), ordered(${expected.text}));`;
    }).join('');
  // GN-6ae: a case with after holds its receiver, which the calls of after observe.
  const heldReceiver = (receiverMade: { lines: string; expr: string }, after: After[] | undefined): { lines: string; expr: string } =>
    after === undefined || receiverMade.expr === '' ? receiverMade : { lines: `${receiverMade.lines}\n  const receiver = ${receiverMade.expr};`, expr: 'receiver' };
  // G-5: the test of a case that the generator refuses, which fails with the reason.
  const refusedTest = (rule: string, name: string, id: string, reason: string): void => {
    emit(`
test('${rule}: ${name} ${id}', () => {
  assert.fail(${jsString(reason)});
});`);
  };
  // E-2: the failure of a test that must throw an instance of a class with a kind.
  const throwsKind = (call: string, category: string, kind: string, instance = false): string =>
    `assert.throws(() => ${call}, (error) => error${instance ? ' instanceof ' : '.constructor === '}pkg.${cls(category)} && error.kind === ${jsString(kind)});`;

  // G-5: the tests of each callable of the contract.
  const callableTests = (): void => {
    for (const fn of callables(model)) {
      const name = fn.kind === 'function' ? langName(lang, fn.member.name, 'callable') : `${langName(lang, fn.unit.name, 'class')}.${fn.kind === 'constructor' ? 'constructor' : langName(lang, fn.member.name, 'callable')}`;
      const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
      const recv = sample === undefined ? '' : made(sample);
      const call0 = (args: string): string => invoke(fn, args, recv);
      // GN-13t: an argument of a class is the case value of a case of the member, where one gives it.
      const classGiven = classCaseArgs(model, fn);
      const call = (override: Map<unknown, string>): string =>
        call0(callArgs(model, ctx, fn, (arg) => override.get(arg) ?? otherValue(model, ctx, arg, classGiven)));
      // A method is tested on an instance, which a case of the class gives (GN-13).
      const reachable = fn.receiver === undefined || sample !== undefined;
      // GN-6z: a value of a function type that is not a function is refused as it enters.
      const functionArg = fn.args.find((a) => typeof a.type === 'object' && 'function' in a.type && !machineFunction(a.type));
      if (functionArg !== undefined && reachable) {
        emit(`
test('GN-6z: ${name} refuses a ${langName(lang, functionArg.name, 'variable')} that is not a function', () => {
  ${throwsKind(call0(callArgs(model, ctx, fn, (arg) => (arg === functionArg ? '0' : otherValue(model, ctx, arg, classGiven)))), 'type', 'invalid_argument_type')}
});`);
      }
      for (const arg of reachable ? fn.args : []) argTests(fn, name, arg, call);
      // GN-6ae: a parameter of a function type takes a function, and any other value is kind invalid_callback.
      for (const arg of reachable ? fn.args.filter((a) => machineFunction(a.type)) : []) {
        emit(`
test('GN-6ae: ${name} refuses a ${langName(lang, arg.name, 'variable')} that is no function', () => {
  ${throwsKind(call(new Map([[arg, '1']])), 'type', 'invalid_callback')}
});`);
      }
      for (const pair of reachable ? samePairs(model, ctx, fn) : []) {
        const argName = langName(lang, pair.arg.name, 'variable');
        // GN-13bg: two results that hold an instance of a value class of another repository are compared through
        // ordered, which reads the instance by its in row; assert.deepStrictEqual compares two instances by no property.
        const read = pair.computed === undefined && holdsForeign(model, fn.returns);
        uses.ordered ||= read;
        const outcomeOf = (expr: string): string => (pair.computed !== undefined ? nodeOutcome(`void ${expr}`) : read ? `ordered(${nodeOutcome(expr)})` : nodeOutcome(expr));
        emit(`
test('${pair.computed !== undefined ? `U-2: ${name} without ${argName} leaves its value to the core (${pair.computed})` : pair.rule === 'U-2' ? `U-2: ${name} without ${argName} is the call with its default` : `T-1: ${name} takes a text in ${argName} as its UTF-8 bytes`}', () => {
  assert.deepStrictEqual(${outcomeOf(call0(callArgs(model, ctx, fn, pair.left)))}, ${outcomeOf(call0(callArgs(model, ctx, fn, pair.right)))});
});`);
      }
      caseTests(fn, name);
      // K-2: a member that takes a callback.
      const callback = callbackArg(model, fn);
      // GN-13y: the other arguments of a case that reaches the callback, where one exists.
      const reaching = callbackReachingArgs(model, fn);
      const cbUnit = callback === undefined ? undefined : unitOf(model, callback.type);
      if (callback !== undefined && cbUnit !== undefined && reachable) {
        const with_ = (how: CallbackHow): string =>
          call0(callArgs(model, ctx, fn, (arg) => (arg === callback ? ctx.callbackNew(cbUnit, how) : reaching === undefined ? otherValue(model, ctx, arg, classGiven, true) : caseValue(model, ctx, arg, reaching))));
        emit(`
test('K-2: ${name} refuses a callback without its members', () => {
  ${throwsKind(with_({ missing: true }), 'type', 'invalid_callback')}
});${!fn.failure ? '' : `

test('K-2: ${name} lets the exception of a callback through', () => {
  const raised = new Error('raised by the callback');
  assert.throws(() => ${with_({ raise: 'raised' })}, (error) => error === raised);
});`}${fn.failure && judgesCallbackResult(model, cbUnit) ? `

test('K-2: ${name} refuses a callback result of another type', () => {
  assert.throws(() => ${with_({ returns: 'wrong' })}, (error) => ['invalid_argument_type', 'invalid_number', 'invalid_text'].includes(error.kind));
});` : ''}`);
      }
      // GN-6bu: a callback that names none of the arguments that the binding calls it with is refused before the member
      // runs: it is never called, and an arming of the member stays for the next call (GN-8a).
      for (const place of reachable ? placeTests(model, lang, fn) : []) {
        const given = (value: string): string =>
          call0(callArgs(model, ctx, fn, (arg) => (arg === place.arg ? value : place.form === 'unit' && reaching !== undefined ? caseValue(model, ctx, arg, reaching) : otherValue(model, ctx, arg, classGiven, place.form === 'unit'))));
        emit(`
test('GN-6bu: ${name} refuses a ${langName(lang, place.arg.name, 'variable')} that takes no argument', () => {
  const calls = [];${place.armed === undefined ? '' : `\n  const armed = ${target.stepArm(fn.member.id, place.armed.faults)};`}
  assert.throws(() => ${given(refusedJs(place, 'none'))}, (error) => error.constructor === pkg.${cls('type')} && error.kind === 'invalid_callback' && error.message.includes(${jsString(place.given)}));
  assert.deepEqual(calls, []);${place.armed === undefined ? '' : `
  // GN-8a: the refused call did not reach the core, so the next call takes the arming.
  ${throwsKind(given(placeholder(model, ctx, place.arg.type, true)), place.armed.category, place.armed.kind)}
  assert.deepEqual(${target.stepLeft('armed')}, []);`}
});`);
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
      countTest(fn, name, sample, classGiven);
    }
  };

  // B-2, B-3, T-1, T-2, T-7, U-2, U-7, GN-12a: the values that an argument refuses.
  const argTests = (fn: Fn, name: string, arg: Arg, call: (override: Map<unknown, string>) => string): void => {
    const argName = langName(lang, arg.name, 'variable');
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
  ${throwsKind(call(new Map([[arg, refused.value]])), 'type', 'invalid_argument_type')}
});`);
    }
    const unsafeKey = unsafeKeyMap(model, ctx, arg.type);
    if (unsafeKey !== undefined) {
      emit(`
test('B-2: ${name} refuses a key outside the safe integers in ${argName}', () => {
  ${throwsKind(call(new Map([[arg, unsafeKey]])), 'value', 'invalid_number')}
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
    if (target.paths && isPath(arg.type)) {
      emit(`
test('T-1: ${name} refuses a NUL byte in ${argName}', () => {
  ${throwsKind(call(new Map([[arg, "'a\\u0000b'"]])), 'value', 'invalid_path')}
});

test('B-3: ${name} refuses an unpaired surrogate in ${argName}', () => {
  ${throwsKind(call(new Map([[arg, "'\\uD800'"]])), 'value', 'invalid_text')}
});

test('T-1: ${name} refuses a value that is no path in ${argName}', () => {
  ${throwsKind(call(new Map([[arg, '1']])), 'type', 'invalid_argument_type')}
});`);
    }
    const bytes = bytesKind(arg.type);
    if (bytes !== undefined) {
      emit(`
test('T-7: ${name} refuses a ${argName} that is not ${bytes === 'source' ? 'a string or a Uint8Array' : 'a Uint8Array'}', () => {
  for (const bad of [1, new Uint16Array(1), [1]${bytes === 'source' ? '' : ", 'a'"}]) {
    ${throwsKind(call(new Map([[arg, 'bad']])), 'type', 'invalid_argument_type')}
  }
});`);
    }
    if (bytes === 'source') {
      emit(`
test('B-3: ${name} refuses an unpaired surrogate in ${argName}', () => {
  ${throwsKind(call(new Map([[arg, "'\\uD800'"]])), 'value', 'invalid_text', true)}
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
  ${throwsKind(call(new Map([[arg, wrapText(arg.type, bad)]])), 'value', 'invalid_text', true)}
});`);
    }
  };

  // B-4, GN-6ae, GN-13e: the tests of the cases of a callable.
  const caseTests = (fn: Fn, name: string): void => {
    for (const kase of raisingCases(model, fn)) {
      const since = onceMade;
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        refusedTest('B-4', name, kase.id, refusal);
        continue;
      }
      // G-5: a callback parameter is the fixture of the case, whose record of calls the test reads after the call.
      const fixtures = caseFixtures(fn, kase);
      // GN-13f: the receiver is made before the call that must throw, so a receiver that cannot be made fails the test: a
      // receiver that no line made yet is held.
      // A receiver whose factory raises the kind of the case is made inside, since the case may fail there.
      const receiverBuilt = receiverOfCase(kase.receiver);
      const receiverMade = kase.faults === undefined ? heldReceiver(receiverBuilt, kase.after ?? (receiverBuilt.lines === '' && kase.receiverFails === undefined ? [] : undefined)) : receiverBuilt;
      const made_ = receiverMade.expr;
      // G-5: a case that arms faults makes its receiver and arguments first, so no call but the one under test runs
      // between the arming and that call, and requires every armed fault to have fired.
      const locals = kase.faults === undefined ? [] : [...(made_ === '' ? [] : [['receiver', made_]]), ...fn.args.flatMap((arg, i) => { const value = fixtures.arg(arg); return value === undefined ? [] : [[`arg${i}`, value]]; })];
      const glue = kase.faults === undefined ? undefined : target.caseGlue();
      const arming = glue === undefined || kase.faults === undefined ? '' : `${glue.open}${locals.map(([local, value]) => `\n  const ${local} = ${value};`).join('')}\n  const armed = ${glue.ref}.__armFaults(${jsString(fn.member.id)}, ${jsString(target.faults(kase.faults))});`;
      const args = callArgs(model, ctx, fn, kase.faults === undefined ? fixtures.arg : (arg) => (fixtures.arg(arg) === undefined ? undefined : `arg${fn.args.indexOf(arg)}`));
      const receiver = kase.faults === undefined || made_ === '' ? made_ : 'receiver';
      emit(`
test('B-4: ${name} ${kase.id}', ${(glue?.open ?? '') === '' ? '' : 'async '}() => {${nodeCaseFileLines(kase.files, kase.listener)}${target.serviceStart(kase.service)}${receiverMade.lines}${raisedLines('node', kase.args)}${fixtures.before}${arming}
  assert.throws(() => ${invoke(fn, args, receiver)}, (error) =>
    error.constructor === pkg.${exactClass(kase.raises)} &&
    error instanceof pkg.${cls(kase.raises.category)} &&
    error instanceof ${jsBase(kase.raises.category)} &&
    error.kind === ${jsString(kase.raises.kind)} &&
${kase.raises.status === undefined ? '' : `    error.status === ${kase.raises.status === null ? 'null' : String(kase.raises.status)} &&\n`}    error.errno === ${target.errno(expectedErrno(kase))}${jsCause(convertedCause(model, kase.args), lang)});${glue === undefined ? '' : `\n  assert.deepEqual(${glue.ref}.__faultLeft(armed), []);`}${fixtures.after}${afterChecks(kase.after, 'receiver')}${answered(since)}${target.serviceEnd(kase.service)}${kept(fn)}
});`);
    }
    // GN-6ae: a case whose function fixture raises an exception of the language gets the same object.
    for (const kase of callbackCases(model, fn)) {
      const since = onceMade;
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        refusedTest('GN-6ae', name, kase.id, refusal);
        continue;
      }
      const receiverMade = heldReceiver(receiverOfCase(kase.receiver), kase.after ?? []);
      const args = callArgs(model, ctx, fn, (arg) => caseValue(model, ctx, arg, kase.args));
      emit(`
test('GN-6ae: ${name} ${kase.id}', () => {${nodeCaseFileLines(kase.files, kase.listener)}${target.serviceStart(kase.service)}${receiverMade.lines}${raisedLines('node', kase.args, true)}
  assert.throws(() => ${invoke(fn, args, receiverMade.expr)}, (error) => error === raised);${afterChecks(kase.after, 'receiver')}${answered(since)}${target.serviceEnd(kase.service)}${kept(fn)}
});`);
    }
    // GN-13e: every case that does not raise runs, and its result is compared with the value that the case gives.
    for (const kase of resultCases(model, fn)) {
      const since = onceMade;
      const refusal = kase.refused ?? caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        refusedTest('GN-13e', name, kase.id, refusal);
        continue;
      }
      const fixtures = caseFixtures(fn, kase);
      const args = callArgs(model, ctx, fn, fixtures.arg);
      const receiverMade = heldReceiver(receiverOfCase(kase.receiver), kase.after);
      const call = invoke(fn, args, receiverMade.expr);
      const expected = kase.expected === undefined ? undefined : expectedText(model, ctx, fn, kase.expected.value);
      uses.ordered ||= expected !== undefined && 'text' in expected;
      uses.tokens ||= expected !== undefined && 'tokens' in expected;
      let waits = false;
      // GN-13e, GN-6ar: a result of an alias goes through the round of the alias too, by an entry point of tests.
      const round = (tokens: string, unit: Parameters<typeof langName>[1]): string => {
        const glue = target.caseGlue();
        waits = glue.open !== '';
        return `${glue.open}\n  const result = ${call};\n  const expected = JSON.parse(${jsString(tokens)});\n  assert.deepStrictEqual(tokens(result), expected);\n  assert.deepStrictEqual(tokens(${glue.ref}.__aliasRound${langName(lang, unit, 'class')}(result)), expected);`;
      };
      const check = expected === undefined
        ? `\n  ${call};`
        : 'refused' in expected
          ? `\n  assert.fail(${jsString(expected.refused)});`
          : 'tokens' in expected
            ? expected.round === undefined
              ? `\n  assert.deepStrictEqual(tokens(${call}), JSON.parse(${jsString(expected.tokens)}));`
              : round(expected.tokens, expected.round)
            : `\n  assert.deepStrictEqual(ordered(${call}), ordered(${expected.text}));`;
      emit(`
test('GN-13e: ${name} ${kase.id}', ${waits ? 'async ' : ''}() => {${nodeCaseFileLines(kase.files, kase.listener)}${target.serviceStart(kase.service)}${receiverMade.lines}${fixtures.before}${check}${fixtures.after}${afterChecks(kase.after, 'receiver')}${answered(since)}${target.serviceEnd(kase.service)}${kept(fn)}
});`);
    }
  };

  // G-7: the test that a callable counts and names its arguments.
  const countTest = (fn: Fn, name: string, sample: Receiver | undefined, classGiven: ReturnType<typeof classCaseArgs>): void => {
    // G-7: the receiver is made once, as a local, and every call of the test runs on it: a receiver that holds state
    // cannot be made twice in one case folder (orm: StepRunner.run, "table owner already exists").
    const built = receiverOfCase(sample);
    // A receiver that one factory call makes is an expression, which the test keeps as a local too.
    const once = built.expr === '' || built.lines !== '' ? built : { lines: `\n  const receiver = ${built.expr};`, expr: 'receiver' };
    const onOnce = (args: string): string => invoke(fn, args, once.expr);
    // GN-13t: an argument of a class of the G-7 test is the case value of a case of the member, where one gives it.
    const values = (arg: Fn['args'][number]): string => otherValue(model, ctx, arg, classGiven);
    // B2.508: each argument of a class is made once too, as a local, and every call takes it.
    const given = onceArgs(model, fn, values, (local, expr) => `\n  const ${local} = ${expr};`, (local) => local);
    const record = fn.record;
    const recordTests = record === undefined ? '' : `
  const fields = { ${(record.unit.fields ?? []).map((f) => `${langName(lang, f.name, 'variable')}: ${placeholder(model, ctx, f.type)}`).join(', ')} };
  const positional = [${fn.args.filter((a) => !a.field).map(given.value).join(', ')}];
  assert.throws(() => ${onOnce('...positional, { ...fields, notAMember: 1 }')}, (error) => error.constructor === TypeError && /no member notAMember/.test(error.message));
  for (const field of [${(record.unit.fields ?? []).filter((f) => f.default === undefined).map((f) => jsString(langName(lang, f.name, 'variable'))).join(', ')}]) {
    const lacking = { ...fields, [field]: undefined };
    assert.throws(() => ${onOnce('...positional, lacking')}, (error) => error.constructor === TypeError && /lacks the member/.test(error.message), field);
  }`;
    emit(`
test('G-7: ${name} counts and names its arguments', () => {${once.lines}${given.lines}${fn.params.every((p) => p.default !== undefined) ? '' : `
  assert.throws(() => ${onOnce('')}, (error) => error.constructor === TypeError && /takes/.test(error.message));`}
  assert.throws(() => ${onOnce([callArgs(model, ctx, fn, given.value), 'null'].filter((a) => a !== '').join(', '))}, (error) => error.constructor === TypeError && /takes/.test(error.message));${recordTests}
});`);
  };

  // GN-6o, GN-6b, GN-6p and B-10: the tests of the objects of the contract.
  const objectTests = (): void => {
    // GN-6o: a method with the receiver self leaves its object consumed, whatever the call gives.
    for (const fn of callables(model).filter((f) => f.receiver === 'self')) {
      const sample = sampleReceiver(model, fn);
      if (sample === undefined) continue;
      const args = callArgs(model, ctx, fn, (arg) => placeholder(model, ctx, arg.type));
      emit(`
test('GN-6o: ${langName(lang, fn.unit.name, 'class')}.${langName(lang, fn.member.name, 'callable')} consumes its object', () => {
  const held = ${made(sample)};
  ${nodeOutcome(invoke(fn, args, 'held'))};
  ${throwsKind(invoke(fn, args, 'held'), 'type', 'consumed')}
});`);
    }
    // GN-6b: a direct construction of a class without a constructor (U-1 constructible) is kind direct_construction.
    for (const object of model.objects.filter((o) => !o.constructible)) {
      const label = langName(lang, object.unit.name, 'class');
      emit(`
test('GN-6b: new ${label}() is kind direct_construction', () => {
  assert.throws(() => new pkg.${label}(), (error) => error.constructor === pkg.${cls('type')} && error.kind === 'direct_construction' && error.message === ${jsString(`${label} has no public constructor`)});
});`);
    }
    // GN-6p, B-10: an object collected without its cleanup call emits a ResourceWarning; the test turns on gc() and
    // awaits the warning event of the process with the message of its class, because the objects of earlier tests warn too.
    for (const object of model.objects) {
      const cleanup = object.cleanup;
      const sample = cleanup === undefined ? undefined : sampleReceiver(model, cleanup);
      if (cleanup === undefined || sample === undefined) continue;
      uses.gc = true;
      const label = langName(lang, object.unit.name, 'class');
      emit(`
test('B-10: ${label} warns when it is destroyed without ${memberName(lang, cleanup)}()', async () => {
  const expected = ${jsString(cleanupWarning(label, memberName(lang, cleanup)))};
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
  };

  // U-7: the cases of an alias run its in function alone, through the entry point of the feature codec-test.
  const aliasTests = (): void => {
    for (const kase of aliasCases(model)) {
      const errno = target.errno(expectedErrno(kase));
      const glue = target.caseGlue();
      emit(`
test('U-7: ${kase.alias.unit.id} in ${kase.id}', ${glue.open === '' ? '' : 'async '}() => {${glue.open}
  assert.throws(() => ${glue.ref}.__aliasIn${langName(lang, kase.alias.unit.name, 'class')}(${fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)}), (error) => error.constructor === pkg.${exactClass(kase)} && error.kind === ${jsString(kase.kind)}${kase.raises.status === undefined ? '' : ` && error.status === ${kase.raises.status === null ? 'null' : String(kase.raises.status)}`} && error.errno === ${errno});
});`);
    }
  };

  // G-5: the blocks of the module, with what they use, once every test is written; awaited makes a test that waits an
  // async function.
  const finish = (awaited: (test: string) => string) => {
    const usesCaseText = textPaths.used();
    if (usesCaseText) nodeCaseTextProof(ctx, emit);
    const blocks = out.map((block) => linuxOnlyTests(block).split(/(?=\ntest\()/).map(awaited).join(''));
    const usesSettled = blocks.some((block) => block.includes('settled('));
    // GN-13i: the files of a case are written with node:fs of the Node.js that runs the tests.
    const usesCaseFile = usesCaseText || blocks.some((block) => block.includes('caseFile(') || block.includes('caseByteFile('));
    // GN-13r: the listener of a case, a Worker of the Node.js that runs the tests.
    const usesListener = blocks.some((block) => block.includes('\n  caseListener();'));
    // GN-13e, B2.121: ordered reads an instance of a value class of another repository through its in row.
    const readers = uses.ordered ? foreignReaders(model, lang) : [];
    const foreignClass = ctx.foreignClass as (library: string, unit: Unit) => string;
    const ordered = nodeOrdered(foreignClassNames(readers, foreignClass), nodeForeignRead(readers, lang, foreignClass), uses.ordered ? nodeValueClasses(model, lang) : []);
    // GN-13e, GN-6ar: the classes that a result of an alias holds; a class of another repository is read through the
    // package of its owner, which the test imports.
    const forms = uses.tokens ? tokenForms(model, 'node') : [];
    for (const form of forms) if (form.library !== undefined) foreignModules.add(form.library);
    // GN-6x: the module of each other repository, by the package of its owner and the subpath of the target.
    const subpath = lang === 'wasm' ? '/wasm' : '';
    const foreignImports = [...foreignModules].map((library) => `import * as ${foreignOf(library)} from ${jsString(`${(model.foreign.get(library)?.packages['node'] as { package: string } | undefined)?.package ?? library}${subpath}`)};\n`).join('');
    return { blocks, usesCaseText, usesOutcome: blocks.some((block) => block.includes('outcome(')), usesSettled, usesCaseFile, usesListener, ordered, forms, foreignImports };
  };

  return { ctx, emit, invoke, cls, uses, callableTests, objectTests, aliasTests, finish };
}
