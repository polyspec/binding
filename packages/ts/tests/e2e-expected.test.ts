// GN-14n (B2.509): the judgement of the generated tests that tests/e2e/falsepass requires to fail, and the reading of
// the failed tests of each runner.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EXPECTED_FAILURES_HOME, expectedFailureProblem, expectedFailuresOf, goFailures, junitFailures, RUN_FAILED, strayExpectedFailures, unittestFailures } from '../../../scripts/e2e-expected.mts';
import { readGoTestEvents } from '../../../scripts/go-test-events.mts';

const EXPECTED = [{ test: 'the_after_test', reason: 'no value for text' }];

test('GN-14n: a run whose failed tests are exactly the expected ones, each with its text, passes', () => {
  assert.equal(expectedFailureProblem([{ name: 'the_after_test', text: 'FalsepassValueError: no value for text' }], EXPECTED), undefined);
});

test('GN-14n: an expected test that passes or does not run fails the step, which is the false pass of B2.509', () => {
  assert.match(expectedFailureProblem([], EXPECTED) ?? '', /the test the_after_test passed or did not run, but it must fail with "no value for text"/);
});

test('GN-14n: an expected test that fails without its text fails the step', () => {
  assert.match(expectedFailureProblem([{ name: 'the_after_test', text: 'AssertionError: G-5: after 0 fails with missing' }], EXPECTED) ?? '', /the test the_after_test failed without "no value for text": AssertionError: G-5/);
});

test('GN-14n: a failure of another test, or of the run, fails the step', () => {
  assert.match(expectedFailureProblem([{ name: 'the_after_test', text: 'no value for text' }, { name: 'another', text: 'boom' }], EXPECTED) ?? '', /the test another failed, which expected-failures\.json does not name: boom/);
  assert.match(expectedFailureProblem([{ name: RUN_FAILED, text: 'status 1' }], EXPECTED) ?? '', /passed or did not run.*; the test \(the run\) failed/);
});

test('GN-14n: a target that expected-failures.json names no failure for fails', () => {
  assert.match(expectedFailureProblem([], undefined) ?? '', /names no failure for the target/);
  assert.match(expectedFailureProblem([], []) ?? '', /names no failure for the target/);
});

test('GN-14n: the failed tests of unittest, node --test, PHPUnit and go test are read by name with their text', () => {
  const stderr = [
    '.E.',
    '======================================================================',
    'ERROR: test_after (test_generated.GeneratedTest.test_after)',
    '----------------------------------------------------------------------',
    'Traceback (most recent call last):',
    'polyspec.falsepass.FalsepassValueError: no value for text',
    '',
    '======================================================================',
    'FAIL: test_other (test_generated.GeneratedTest.test_other)',
    '----------------------------------------------------------------------',
    'AssertionError: differs',
    '',
    '----------------------------------------------------------------------',
    'Ran 3 tests in 0.001s',
    '',
    'FAILED (failures=1, errors=1)',
  ].join('\n');
  const python = unittestFailures(stderr);
  assert.deepEqual(python.map((f) => f.name), ['test_after', 'test_other']);
  assert.match(python[0]?.text ?? '', /no value for text/);
  assert.doesNotMatch(python[1]?.text ?? '', /Ran 3 tests/);
  const xml = '<testsuites><testsuite name="x"><testcase name="GN-13e: Seal.check a" classname="t"><failure message="no value for text" type="testCodeFailure">Error: no value for text&#10;</failure></testcase><testcase name="passes &quot;ok&quot;" classname="t"></testcase><testcase name="testB" class="T"><error type="E">testB&#10;E: boom</error></testcase></testsuite></testsuites>';
  const junit = junitFailures(xml);
  assert.deepEqual(junit.map((f) => f.name), ['GN-13e: Seal.check a', 'testB']);
  assert.match(junit[0]?.text ?? '', /no value for text/);
  const events = [
    { Action: 'run', Package: 'github.com/polyspec/falsepass/packages/go', Test: 'TestA' },
    { Action: 'output', Package: 'github.com/polyspec/falsepass/packages/go', Test: 'TestA', Output: '    zz_generated_test.go:9: GN-13f: no value for text\n' },
    { Action: 'fail', Package: 'github.com/polyspec/falsepass/packages/go', Test: 'TestA' },
    { Action: 'pass', Package: 'github.com/polyspec/falsepass/packages/go', Test: 'TestB' },
    { Action: 'fail', Package: 'github.com/polyspec/falsepass/packages/go' },
  ].map((e) => JSON.stringify(e)).join('\n');
  assert.deepEqual(goFailures(readGoTestEvents(events)), [{ name: 'TestA', text: '    zz_generated_test.go:9: GN-13f: no value for text\n' }]);
});

test('GN-14n: no repository but tests/e2e/falsepass holds expected-failures.json, so no failure of a target is hidden by it (AGENTS.md)', () => {
  const top = fileURLToPath(new URL('../../../', import.meta.url));
  assert.deepEqual(strayExpectedFailures(top), []);
  assert.ok(existsSync(join(top, EXPECTED_FAILURES_HOME)));
  // The scan finds a stray file in another repository, in a copy of tests/e2e outside the checkout.
  const temp = mkdtempSync(join(tmpdir(), 'gn14n-'));
  try {
    cpSync(join(top, 'tests/e2e'), join(temp, 'tests/e2e'), { recursive: true });
    writeFileSync(join(temp, 'tests/e2e/kept/expected-failures.json'), '{"failures": {}}\n');
    mkdirSync(join(temp, 'elsewhere/repo'), { recursive: true });
    writeFileSync(join(temp, 'elsewhere/repo/expected-failures.json'), '{"failures": {}}\n');
    assert.deepEqual(strayExpectedFailures(temp), ['elsewhere/repo/expected-failures.json', 'tests/e2e/kept/expected-failures.json']);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('GN-14n: a run reads expected-failures.json only of tests/e2e/falsepass of its tree, and a run of another repository with the file fails naming it', () => {
  const top = fileURLToPath(new URL('../../../', import.meta.url));
  assert.deepEqual(Object.keys(expectedFailuresOf(join(top, 'tests/e2e/falsepass'), top) ?? {}).sort(), ['go', 'node', 'php', 'python', 'wasm']);
  assert.equal(expectedFailuresOf(join(top, 'tests/e2e/kept'), top), undefined);
  // A copy of tests/e2e/falsepass outside the tree, as a consumer repository, keeps its expected-failures.json.
  const temp = mkdtempSync(join(tmpdir(), 'gn14n-'));
  try {
    const copy = join(temp, 'falsepass');
    cpSync(join(top, 'tests/e2e/falsepass'), copy, { recursive: true });
    assert.throws(() => expectedFailuresOf(copy, top), new RegExp(`${join(copy, 'expected-failures.json').replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')} lists expected failures, which only tests/e2e/falsepass of binding may`));
    // The same directory by another path, a link to it, is the fixture.
    symlinkSync(join(top, 'tests/e2e/falsepass'), join(temp, 'link'));
    assert.ok(expectedFailuresOf(join(temp, 'link'), top) !== undefined);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('GN-14n: unittest failures are named <class>.<method>, so a method of the same name in another class is another test', () => {
  const block = (kind: string, head: string, text: string): string => ['======================================================================', `${kind}: ${head}`, '----------------------------------------------------------------------', text, ''].join('\n');
  const stderr = [
    '.F',
    // Python 3.11 and later print the module, the class and the method; earlier ones the module and the class.
    block('FAIL', 'test_x (test_generated.GeneratedTest.test_x)', 'AssertionError: no value for text'),
    block('ERROR', 'test_x (test_generated.lib.OtherTest)', 'ValueError: boom'),
    block('ERROR', 'setUpClass (test_generated.ThirdTest)', 'ValueError: set up'),
    '----------------------------------------------------------------------',
    'Ran 2 tests in 0.001s',
  ].join('\n');
  assert.deepEqual(unittestFailures(stderr).map((f) => f.name), ['GeneratedTest.test_x', 'OtherTest.test_x', 'ThirdTest.setUpClass']);
  assert.match(expectedFailureProblem(unittestFailures(stderr), [{ test: 'GeneratedTest.test_x', reason: 'no value for text' }]) ?? '', /the test OtherTest\.test_x failed, which expected-failures\.json does not name/);
});

test('GN-14n: a failed test of go test whose name holds no .Test fails the read, naming it', () => {
  const events = [
    { Action: 'run', Package: 'example.com/m/packages/go', Test: 'ExampleSeal' },
    { Action: 'fail', Package: 'example.com/m/packages/go', Test: 'ExampleSeal' },
  ].map((e) => JSON.stringify(e)).join('\n');
  assert.throws(() => goFailures(readGoTestEvents(events)), /go test reported the failure example\.com\/m\/packages\/go\.ExampleSeal, whose name holds no \.Test/);
});

test('GN-14n: tests/e2e/falsepass names its one after test in each of the five targets', () => {
  const file = JSON.parse(readFileSync(new URL('../../../tests/e2e/falsepass/expected-failures.json', import.meta.url), 'utf8')) as { failures: Record<string, { test: string; reason: string }[]> };
  assert.deepEqual(Object.keys(file.failures).sort(), ['go', 'node', 'php', 'python', 'wasm']);
  for (const [target, failures] of Object.entries(file.failures)) {
    assert.equal(failures.length, 1, target);
    assert.match(failures[0]?.test ?? '', /seal[\W_]*check[\W_]*the[\W_]*argument[\W_]*of[\W_]*a[\W_]*check[\W_]*after[\W_]*it[\W_]*fails[\W_]*to[\W_]*parse/i, target);
    assert.match(failures[0]?.reason ?? '', /no value for text/, target);
  }
});
