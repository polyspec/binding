// GN-14a: the end-to-end check counts the tests of go test -json from its events, and a package that does not build
// fails with the output of its build, which go test gives only in build-output events.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goPackageFailure, readGoTestEvents } from '../../../scripts/go-test-events.mts';

const lines = (...events: object[]): string => `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;

test('the tests of go test -json are counted by their events (GN-14a)', () => {
  const read = readGoTestEvents(lines(
    { Action: 'run', Package: 'm/p', Test: 'TestA' },
    { Action: 'output', Package: 'm/p', Test: 'TestA', Output: '=== RUN   TestA\n' },
    { Action: 'pass', Package: 'm/p', Test: 'TestA' },
    { Action: 'fail', Package: 'm/p', Test: 'TestB' },
    { Action: 'skip', Package: 'm/p', Test: 'TestC' },
    { Action: 'fail', Package: 'm/p' },
  ));
  assert.deepEqual(read.counts, { pass: ['m/p.TestA'], fail: ['m/p.TestB'], skip: ['m/p.TestC'] });
  assert.equal(read.printed, '=== RUN   TestA\n');
  // A package whose test failed names its cause by that test.
  assert.equal(goPackageFailure(read, 1), undefined);
});

test('a package that does not build fails with the output of its build (GN-14a)', () => {
  const read = readGoTestEvents(lines(
    { ImportPath: 'm/p [m/p.test]', Action: 'build-output', Output: '# m/p.test\n' },
    { ImportPath: 'm/p [m/p.test]', Action: 'build-output', Output: 'ld: duplicate symbol _rust_eh_personality\n' },
    { ImportPath: 'm/p [m/p.test]', Action: 'build-fail' },
    { Action: 'start', Package: 'm/p' },
    { Action: 'output', Package: 'm/p', Output: 'FAIL\tm/p [build failed]\n' },
    { Action: 'fail', Package: 'm/p', FailedBuild: 'm/p [m/p.test]' },
  ));
  assert.deepEqual(read.counts, { pass: [], fail: [], skip: [] });
  assert.equal(read.printed, '# m/p.test\nld: duplicate symbol _rust_eh_personality\nFAIL\tm/p [build failed]\n');
  assert.equal(goPackageFailure(read, 1), 'go test failed the packages m/p (status 1): m/p [m/p.test]: # m/p.test ld: duplicate symbol _rust_eh_personality');
});
