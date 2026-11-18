// The generated node:test module of the Node binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run against
// the installed package.

import { type Model, POISON_ENTRY, langName, nativeRoundTrip, takesFunction } from './model.ts';
import { heldTests } from './tests_held.ts';
import { addonBase } from './node.ts';
import { isHost, NODE_PLATFORM_JS } from './packages.ts';
import { nodeTokens, serviceSteps, type CaseService } from './samples.ts';
import { header, jsString } from './text.ts';
import { NODE_CASE_FILE, NODE_CASE_LISTENER, NODE_CASE_PATH, NODE_CASE_TEXT, NODE_FIXTURE, NODE_OUTCOME, NODE_SETTLED, awaitedTest, jsTests, nodeCaseImports } from './tests_shared.ts';

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

export function nodeTests(model: Model): string {
  const npm = (model.contract.packages['node'] as { package: string }).package;
  // L-2a: the tests of a host package import the generated entry beside them, as host code does; the package's own
  // entry is the host's.
  const esm = isHost(model.contract, 'node') ? '../index.mjs' : npm;
  const cjsEntry = isHost(model.contract, 'node') ? '../index.cjs' : npm;
  let usesErrno = false;
  const js = jsTests(model, {
    lang: 'node',
    ctx: {
      casePath: (relative) => `casePath(${jsString(relative)})`,
      serviceAddress: (service) => `serviceAddress(${jsString(service.id)}, ${jsString(service.address)})`,
    },
    form: {
      state: (service, state, step, scope, value) => jsState(service, state, step, scope, value),
      peerNext: (service, scope, value) => `await servicePeerNext(${jsString(service.id)}, ${jsString(scope)}, ${jsString(value)});`,
    },
    paths: true,
    stepArm: (member, faults) => `addon().__armFaults(${jsString(member)}, ${jsString(faults)})`,
    stepLeft: (local) => `addon().__faultLeft(${local})`,
    thrownCount: () => 'addon().__thrownCount()',
    caseGlue: () => ({ open: '', ref: 'addon()' }),
    faults: (faults) => faults,
    errno: (errno) => {
      usesErrno ||= errno !== null && 'symbol' in errno;
      return errno === null ? 'null' : 'symbol' in errno ? `errnoOf.${errno.symbol}` : String(errno.value);
    },
    serviceStart: nodeServiceStart,
    serviceEnd: nodeServiceEnd,
  });
  const { ctx, emit, invoke, cls } = js;
  js.callableTests();
  // B-5c (GN-6h): a poisoned object is refused at every place, and an instance at a write place and another is busy.
  const held = heldTests(model, ctx, invoke, 'held');
  const refused = (category: string, kind: string, call: string): string => `
  assert.throws(() => ${call}, (error) => error.constructor === pkg.${cls(category)} && error.kind === ${jsString(kind)});`;
  // GN-13l: each test is made as it is written, so it marks the root of the case texts that its own expressions take.
  for (const make of held.poison) {
    const test = make();
    emit(`
test('B-5c: ${langName('node', test.object.unit.name, 'class')} refuses a poisoned object', () => {
  const held = ${test.instance};${[`addon().${POISON_ENTRY.node}(held)`, test.receiver, test.parameter].filter((call) => call !== undefined).map((call) => refused('internal', 'internal', call)).join('')}
});`);
  }
  for (const make of held.busy) {
    const test = make();
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
  js.objectTests();
  js.aliasTests();
  // GN-6m: a block may hold several tests, each of which awaits when its call does.
  const done = js.finish(awaitedTest);
  const { blocks, usesCaseFile, usesCaseText, usesListener } = done;
  const usesCasePath = usesCaseFile || blocks.some((block) => block.includes('casePath('));
  // GN-13j: the helpers of a service, which the lines of a test and its values call.
  const usesService = blocks.some((block) => /\bservice(Address|State)\(/.test(block));
  // GN-13q: the helpers of a peer session, which the lines of a test with a peer await.
  const usesPeer = blocks.some((block) => /\bservicePeer\(/.test(block));
  const usesGc = js.uses.gc;
  return `${header('//')}
import assert from 'node:assert/strict';${usesService ? `\nimport { ${usesPeer ? 'spawn, ' : ''}spawnSync } from 'node:child_process';` : ''}
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';${usesPeer ? "\nimport { createInterface } from 'node:readline';" : ''}
import test${usesCasePath || usesPeer || usesListener ? ', { afterEach }' : ''} from 'node:test';${usesCasePath ? nodeCaseImports(usesCaseFile, usesCaseText) : ''}${usesListener ? "\nimport { Worker } from 'node:worker_threads';" : ''}${usesGc ? "\nimport { setFlagsFromString } from 'node:v8';\nimport { runInNewContext } from 'node:vm';" : ''}${js.uses.fixture ? "\nimport { isDeepStrictEqual } from 'node:util';" : ''}
${usesErrno ? "import { constants } from 'node:os';\n" : ''}import * as pkg from ${jsString(esm)};
${done.foreignImports}

const require = createRequire(import.meta.url);
${roundFn === undefined ? '' : '\n// GN-6u: the subject of the round-trip test, an object that only the test makes.\nclass Subject {}\n'}${usesGc ? "\n// GN-6p: gc() of V8, which the B-10 tests call to finalize an object.\nsetFlagsFromString('--expose-gc');\nconst gc = runInNewContext('gc');\n" : ''}${js.uses.fixture ? NODE_FIXTURE : ''}${done.usesOutcome ? NODE_OUTCOME : ''}${done.usesSettled ? NODE_SETTLED : ''}${js.uses.ordered ? done.ordered : ''}${js.uses.bound ? '\n// GN-13n: the arguments that the function fixtures of the test in progress keep by name.\nconst bound = {};\n' : ''}${js.uses.tokens ? nodeTokens(done.forms) : ''}${usesCasePath ? NODE_CASE_PATH : ''}${usesCaseFile ? NODE_CASE_FILE : ''}${usesCaseText ? NODE_CASE_TEXT : ''}${usesService ? NODE_SERVICE : ''}${usesPeer ? NODE_PEER : ''}${usesListener ? NODE_CASE_LISTENER : ''}
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
