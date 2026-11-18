// The generated node:test module of the WASM binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run
// against the subpath ./wasm of the installed package after init (P-5). The JavaScript values are those of Node.

import { type Model, langName, nativeRoundTrip } from './model.ts';
import { callArgs, placeholder, nodeTokens } from './samples.ts';
import { header, jsString } from './text.ts';
import { wasmGlue } from './wasm.ts';
import { isHost } from './packages.ts';
import { NODE_CASE_FILE, NODE_CASE_LISTENER, NODE_CASE_PATH, NODE_CASE_TEXT, NODE_FIXTURE, NODE_OUTCOME, NODE_SETTLED, awaitedTest, jsTests, nodeCaseImports } from './tests_shared.ts';

// G-5: the target of WASM has no errno (binding_core::errno::value gives none, and an arming that names a symbol is
// refused, GN-8a), so the faults of a case are armed without their errno.
const withoutErrno = (faults: string): string =>
  JSON.stringify((JSON.parse(faults) as Record<string, unknown>[]).map(({ errno: _errno, ...fault }) => fault));

export function wasmTests(model: Model): string {
  const npm = (model.contract.packages['node'] as { package: string }).package;
  // L-2a: the tests of a host package import the generated entry beside them; the package's exports are the host's.
  const entry = isHost(model.contract, 'node') ? '../index.mjs' : `${npm}/wasm`;
  let usesGlue = false;
  let usesStepGlue = false;
  // G-5: a call of then arms through the module that the hook before loads, because the instance values are made in
  // calls that do not wait.
  const stepGlue = (): string => {
    usesGlue = true;
    usesStepGlue = true;
    return 'stepGlue';
  };
  const js = jsTests(model, {
    lang: 'wasm',
    ctx: { target: 'wasm' },
    form: {},
    paths: false,
    stepArm: (member, faults) => `${stepGlue()}.__armFaults(${jsString(member)}, ${jsString(withoutErrno(faults))})`,
    stepLeft: (local) => `stepGlue.__faultLeft(${local})`,
    thrownCount: () => `${stepGlue()}.__thrownCount()`,
    caseGlue: () => {
      usesGlue = true;
      return { open: '\n  const glue = await glueModule();', ref: 'glue' };
    },
    faults: withoutErrno,
    errno: (errno) => (errno === null || 'symbol' in errno ? 'null' : String(errno.value)),
    serviceStart: () => '',
    serviceEnd: () => '',
  });
  const { emit, invoke, cls } = js;
  // GW-7: a call after the panic, of the first function with its placeholder arguments: kind internal when the panic
  // trapped, a call that works when the module unwinds.
  const [firstFn] = model.functions;
  const laterCall = firstFn === undefined ? '' : `
  const later = () => pkg.${langName('wasm', firstFn.member.name, 'callable')}(${callArgs(model, js.ctx, firstFn, (arg) => placeholder(model, js.ctx, arg.type))});
  if (state.broken()) assert.throws(later, internal);
  else assert.doesNotThrow(() => { try { later(); } catch (error) { if (internal(error)) throw error; } });`;
  js.callableTests();
  // GN-6u: an object goes through the native row and back as the same object, and the binding releases its Native.
  // WASM drops a Native at once, so the test awaits nothing from the first count to the second: an await there lets
  // the FinalizationRegistry release objects of earlier tests, whose Natives would change the count.
  const roundTrip = nativeRoundTrip(model.contract, 'wasm');
  const roundFn = roundTrip === undefined ? undefined : model.functions.find((f) => f.member.id === roundTrip.id);
  if (roundFn !== undefined) {
    usesGlue = true;
    const same = (value: string): string => invoke(roundFn, value, '');
    emit(`
test('GN-6u: ${langName('wasm', roundFn.member.name, 'callable')} gives back the same object and releases it', async () => {
  const glue = await glueModule();
  ${same('new Subject()')};
  const before = glue.__nativeCount();
  const subject = new Subject();
  assert.equal(${same('subject')}, subject);
  ${same('new Subject()')};
  assert.equal(glue.__nativeCount(), before);
});`);
  }
  js.aliasTests();
  js.objectTests();
  // GN-6n: a test that calls a member that waits is an async function, as for Node.
  // Only a call of such a member is written `(await ...)`; the import of the glue of a case is awaited in any test.
  // A block may hold several tests, each of which is judged alone.
  const done = js.finish((one) => (one.includes('(await ') ? awaitedTest(one) : one));
  const { usesCaseFile, usesCaseText, usesListener } = done;
  const usesGc = js.uses.gc;
  return `${header('//')}
import assert from 'node:assert/strict';
import test${usesStepGlue || usesCaseFile || usesListener ? `, { ${[...(usesStepGlue ? ['before'] : []), ...(usesCaseFile || usesListener ? ['afterEach'] : [])].join(', ')} }` : ''} from 'node:test';${usesCaseFile ? `${nodeCaseImports(true, usesCaseText)}\nimport { dirname, join } from 'node:path';` : ''}${usesListener ? "\nimport { Worker } from 'node:worker_threads';" : ''}${usesGc ? "\nimport { setFlagsFromString } from 'node:v8';\nimport { runInNewContext } from 'node:vm';" : ''}${js.uses.fixture ? "\nimport { isDeepStrictEqual } from 'node:util';" : ''}
import * as pkg from ${jsString(entry)};
${done.foreignImports}
${roundFn === undefined ? '' : '\n// GN-6u: the subject of the round-trip test, an object that only the test makes.\nclass Subject {}\n'}${usesGc ? "\n// GN-6p: gc() of V8, which the B-10 tests call to collect an instance.\nsetFlagsFromString('--expose-gc');\nconst gc = runInNewContext('gc');\n" : ''}${js.uses.fixture ? NODE_FIXTURE : ''}${usesCaseFile ? `${NODE_CASE_PATH}${NODE_CASE_FILE}` : ''}${usesCaseText ? NODE_CASE_TEXT : ''}${usesListener ? NODE_CASE_LISTENER : ''}${js.uses.ordered ? done.ordered : ''}${js.uses.bound ? '\n// GN-13n: the arguments that the function fixtures of the test in progress keep by name.\nconst bound = {};\n' : ''}${js.uses.tokens ? nodeTokens(done.forms) : ''}${done.usesOutcome ? `
// G-5: what a call gives: its result, or the class and the kind of its failure.${NODE_OUTCOME}` : ''}${usesGlue ? `
// G-5: the module that wasm-bindgen writes, whose test entry points arm the faults of a case.
const glueModule = () => import(new URL('./${wasmGlue(model)}.js', import.meta.resolve(${jsString(entry)})).href);
` : ''}${usesStepGlue ? `
// GN-13f: the module for the calls of then that arm faults, loaded before the tests.
let stepGlue;
before(async () => {
  stepGlue = await glueModule();
});
` : ''}${done.usesSettled ? NODE_SETTLED : ''}${done.blocks.join('\n')}

// Last (GW-7): a module built with panic=abort traps here, and every later call is kind internal.
test('B-7: a panic is kind internal, and a trap breaks the instance for every later call', async () => {
  const glue = await import(new URL('./${wasmGlue(model)}.js', import.meta.resolve(${jsString(entry)})).href);
  const state = await import(new URL('./state.mjs', import.meta.resolve(${jsString(entry)})).href);
  const internal = (error) => error.constructor === pkg.${cls('internal')} && error.kind === 'internal';
  assert.throws(() => state.enter(pkg.${cls('internal')}, () => glue.__panicTest()), internal);${laterCall}
});
`;
}
