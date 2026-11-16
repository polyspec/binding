// GN-14i: make consumers-check compiles the generated bindings of consumer repositories with this tree. The steps of a
// copy, the Go target with and without binding go-link, and the table of a run are decided by scripts/consumers.mts.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Contract } from '../src/contract.ts';
import { consumerOf, firstErrors, goSteps, hasGoLink, lockedCores, manifestCommit, patchManifest, provenanceLine, provenanceProblem, stepsBeforeCheck, prepareSteps, table, testFeatures, type Copy } from '../../../scripts/consumers.mts';

const root = new URL('../../../', import.meta.url).pathname;
const script = join(root, 'scripts/consumers-check.mts');
const copy: Copy = { copy: '/work/json', contract: 'packages/rust/interface.json', node: '/tools/node', cli: '/binding/packages/ts/src/cli.ts', core: '/binding/packages/core/rust', go: '/tools/go', make: '/tools/gmake', jobs: 3 };
const contract = { library: 'json', core: { crate: 'polyspec-json', path: 'packages/rust' }, packages: {}, targets: ['go'] } as unknown as Contract;

test('a failed cell is named in the table with the step that failed, its first error lines and its log (GN-14i, B2.391)', () => {
  const text = table([
    { consumer: 'json', cell: 'prepare', state: 'passed', failures: [], log: '/r/json/prepare.log' },
    { consumer: 'json', cell: 'php', state: 'failed', failures: [{ step: 'cargo check --all-targets without features', errors: ['error[E0425]: cannot find value `x`', '--> packages/php-ext/src/lib.rs:3:5'] }], log: '/r/json/php.log' },
    { consumer: 'json', cell: 'node', state: 'passed', failures: [], log: '/r/json/node.log' },
    { consumer: 'json', cell: 'wasm', state: 'not in contract', failures: [], log: '/r/json/wasm.log' },
  ], provenanceLine('a'.repeat(40), true));
  const [, header, row] = text.split('\n');
  assert.match(header ?? '', /^consumer\s+prepare\s+php\s+python\s+node\s+go\s+wasm$/);
  assert.match(row ?? '', /^json\s+passed\s+failed\s+-\s+passed\s+-\s+not in contract$/);
  assert.match(text, /^json php: failed \(log \/r\/json\/php\.log\)$/m);
  assert.match(text, /^ {2}cargo check --all-targets without features$/m);
  assert.match(text, /^ {4}error\[E0425\]: cannot find value `x`$/m);
  assert.match(text, /^ {4}--> packages\/php-ext\/src\/lib\.rs:3:5$/m);
  assert.match(text, /^failed: json php$/m);
  assert.doesNotMatch(text, /json node: failed/);
});

test('a table without a failed cell says that every cell passed (GN-14i, B2.391)', () => {
  assert.match(table([{ consumer: 'json', cell: 'go', state: 'passed', failures: [], log: '/r/go.log' }], provenanceLine('a'.repeat(40), true)), /\npassed: every cell$/);
});

test('without binding go-link the Go cell fails by name and the run writes no link flag (GN-14i, GN-15k, B2.391)', () => {
  assert.equal(hasGoLink("if (command === 'check') {"), false);
  assert.equal(hasGoLink("if (command === 'go-link') goLinkCommand(rest);"), true);
  const steps = goSteps(copy, contract, false, ['panic-test', 'fault-test'], ['polyspec_json_fault_test', 'polyspec_json_panic_test']);
  const failure = steps[0];
  assert.ok(failure !== undefined && 'failure' in failure, 'the first step is a named failure');
  assert.match(failure.failure, /binding go-link is absent from \/binding\/packages\/ts\/src\/cli\.ts/);
  // The Go commands still run, so the cell shows what go vet and the link give, and none carries a flag of the run.
  const commands = steps.filter((s) => 'command' in s);
  assert.deepEqual(commands.map((s) => s.what), ['go vet without tags', 'go test -c without tags', 'go vet with -tags=polyspec_json_fault_test,polyspec_json_panic_test', 'go test -c with -tags=polyspec_json_fault_test,polyspec_json_panic_test']);
  for (const s of commands) {
    assert.equal(s.command, '/tools/go', s.what);
    assert.equal(s.env?.['CGO_LDFLAGS'], undefined, s.what);
    assert.equal(s.capture, undefined, s.what);
    assert.ok(!s.argv.some((arg) => arg.includes('ldflags')), s.what);
  }
});

test('with binding go-link each Go run takes CGO_LDFLAGS from go-link of its features (GN-14i, GN-15k, B2.391)', () => {
  const steps = goSteps(copy, contract, true, ['panic-test'], ['polyspec_json_panic_test']);
  assert.ok(!steps.some((s) => 'failure' in s));
  const links = steps.filter((s) => 'command' in s && s.capture === 'CGO_LDFLAGS');
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((s) => ('argv' in s ? s.argv.slice(1) : [])), [
    ['go-link', '--manifest', '/work/json/packages/go/internal/ffi/Cargo.toml', '--target-dir', '/work/json/target'],
    ['go-link', '--manifest', '/work/json/packages/go/internal/ffi/Cargo.toml', '--target-dir', '/work/json/target', '--features', 'panic-test'],
  ]);
  const link = steps.findIndex((s) => s.what === 'binding go-link --features panic-test');
  assert.ok(link >= 0 && link < steps.findIndex((s) => s.what === 'go test -c with -tags=polyspec_json_panic_test'));
});

test('the path patch of binding_core is applied before binding check, after scaffold (GN-14i, B2.391)', () => {
  const order: string[] = [];
  const steps = prepareSteps(copy, ['0.0.13'], () => order.push('patch'));
  const names = steps.map((s) => s.what);
  const patch = names.findIndex((n) => n.startsWith('the path patch'));
  const lock = names.indexOf('cargo update -p polyspec-binding-core --offline');
  const check = names.indexOf('binding check');
  assert.equal(names[0], 'binding scaffold');
  assert.ok(patch > 0 && patch < lock && lock < check, names.join(' | '));
  assert.equal(prepareSteps(copy, undefined, () => undefined).some((s) => s.what === 'cargo generate-lockfile --offline'), true);
  const step = steps[patch];
  if (step !== undefined && 'write' in step) step.write();
  assert.deepEqual(order, ['patch']);
});

test('the patch gives polyspec-binding-core the path of this tree and refuses a manifest that already patches binding (GN-14i, B2.391)', () => {
  const patched = patchManifest('[workspace]\nmembers = ["packages/rust"]', '/binding/packages/core/rust');
  assert.match(patched, /\n\[patch\."https:\/\/github\.com\/polyspec\/binding\.git"\]\npolyspec-binding-core = \{ path = "\/binding\/packages\/core\/rust" \}\n$/);
  assert.throws(() => patchManifest(patched, '/other'), /already has \[patch\."https:\/\/github\.com\/polyspec\/binding\.git"\]/);
});

test('a package directory of a checkout names the contract of its component (GN-14i, L-1, B2.391)', () => {
  assert.deepEqual(consumerOf('/wt/crud-ui', '/wt/crud-ui/packages/validator'), { label: 'crud-ui/packages/validator', checkout: '/wt/crud-ui', contract: 'packages/validator/rust/interface.json' });
  assert.deepEqual(consumerOf('/wt/json', '/wt/json'), { label: 'json', checkout: '/wt/json', contract: 'packages/rust/interface.json' });
});

test('the first error lines are those of rustc with their place, of go, of the linker and of binding (GN-14i, B2.391)', () => {
  assert.deepEqual(firstErrors('   Compiling x\nwarning: unused\nerror[E0599]: no method\n  --> src/lib.rs:1:2\nmore\n'), ['error[E0599]: no method', '--> src/lib.rs:1:2']);
  assert.deepEqual(firstErrors('# example.com/x\n./x.go:3:4: undefined: y\n'), ['# example.com/x', './x.go:3:4: undefined: y']);
  assert.deepEqual(firstErrors('binding: CK-2: unit todo\n'), ['binding: CK-2: unit todo']);
  assert.deepEqual(firstErrors('a\nb\nc\nd\n'), ['b', 'c', 'd']);
});

test('the test features of a binding crate are those of its manifest other than default (GN-5, GN-14i, B2.391)', () => {
  assert.deepEqual(testFeatures('[package]\nname = "x"\n\n[features]\ndefault = []\npanic-test = []\nfault-test = ["c/fault-test"]\n\n[dependencies]\nc = "1"\n'), ['panic-test', 'fault-test']);
});

test('a lock with several releases of binding_core updates each of them to the patch (GN-14i, B2.391)', () => {
  const lock = 'name = "polyspec-binding-core"\nversion = "0.0.10"\nsource = "git+x"\n\n[[package]]\nname = "polyspec-binding-core"\nversion = "0.0.13"\n';
  assert.deepEqual(lockedCores(lock), ['0.0.10', '0.0.13']);
  const update = prepareSteps(copy, lockedCores(lock), () => undefined)[2];
  assert.ok(update !== undefined && 'argv' in update);
  assert.deepEqual(update.argv.slice(3, 7), ['-p', 'polyspec-binding-core@0.0.10', '-p', 'polyspec-binding-core@0.0.13']);
});

test('the consumer steps before bindings-check of its Makefile run in the copy before scaffold (GN-14i, B2.391)', () => {
  const makefile = 'BINDING := x\nbindings: binding-cases ## Write\nbindings-check: binding-cases ## Check the contract (binding CK-19)\n\t$(NODE) $(BINDING) check\n';
  assert.deepEqual(stepsBeforeCheck(makefile), ['binding-cases']);
  assert.deepEqual(stepsBeforeCheck('bindings-check: ## Check\n'), []);
  assert.deepEqual(stepsBeforeCheck('binding-check:\n'), []);
  assert.throws(() => stepsBeforeCheck('bindings-check: $(CASES)\n'), /name a variable/);
  const steps = prepareSteps(copy, undefined, () => undefined, ['binding-cases']);
  const first = steps[0];
  assert.ok(first !== undefined && 'argv' in first);
  assert.equal(first.command, '/tools/gmake');
  assert.deepEqual(first.argv, ['-C', '/work/json', 'binding-cases', 'NODE=/tools/node']);
  assert.equal(steps[1]?.what, 'binding scaffold');
});

test('the first line of the table names the commit of the CLI and whether its tree is clean (GN-14i, B2.391)', () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  assert.equal(table([], provenanceLine(commit, true)).split('\n')[0], `binding ${commit} (clean)`);
  assert.equal(provenanceLine(commit, false), `binding ${commit} (with uncommitted changes)`);
  assert.equal(manifestCommit(`binding commit ${commit}\nbranch lane\n`), commit);
  assert.throws(() => manifestCommit('branch lane\n'), /names no line/);
});

test('a dirty tree of the CLI is no evidence of its commit (GN-14i, B2.391)', () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  assert.equal(provenanceProblem(commit, '', commit), undefined);
  assert.match(provenanceProblem(commit, ' M scripts/consumers.mts\n', commit) ?? '', /has changes that 0123.* does not hold: M scripts\/consumers\.mts/);
});

test('a CLI of another commit stops the run before any copy is made (GN-14i, B2.391)', () => {
  const temp = mkdtempSync(join(tmpdir(), 'consumers-test-'));
  try {
    const other = '0'.repeat(40);
    const ran = spawnSync(process.execPath, [script, '--dir', root, '--expect', other], { encoding: 'utf8', env: { ...process.env, TMPDIR: temp } });
    assert.equal(ran.status, 1, ran.stderr);
    assert.match(ran.stderr, /stopped before the first consumer: the CLI of this tree is at [0-9a-f]{40}, not at the expected 0{40}/);
    assert.deepEqual(readdirSync(temp), [], 'the run made a work directory');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
