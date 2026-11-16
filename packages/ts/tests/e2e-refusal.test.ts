// GN-14 (B2.402): the judgement of the refusal that tests/e2e/lent requires of cargo check of each binding crate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refusalProblem } from '../../../scripts/e2e-refusal.mts';

const refused = (code: string): string => `    Checking polyspec-lent-python v0.0.1\nerror[${code}]: \`scope_\` does not live long enough\n    --> packages/python/generated/lib.rs:1157:17\nerror: could not compile \`polyspec-lent-python\` (lib) due to 1 previous error\n`;

test('a check that fails with the code alone is the refusal (GN-14, B2.402)', () => {
  assert.equal(refusalProblem(101, refused('E0597'), 'E0597'), undefined);
  assert.equal(refusalProblem(101, refused('E0521'), 'E0521'), undefined);
});

test('a check that passes is no refusal (GN-14, B2.402)', () => {
  assert.match(refusalProblem(0, '    Finished `dev` profile\n', 'E0597') ?? '', /cargo check passed, but the binding must be refused with E0597/);
});

test('a check that fails with another code, or without one, is no refusal (GN-14, B2.402)', () => {
  assert.match(refusalProblem(101, refused('E0521'), 'E0597') ?? '', /failed without E0597: error\[E0521\]/);
  assert.match(refusalProblem(101, 'error: failed to load manifest for workspace member\n', 'E0597') ?? '', /failed without E0597: error: failed to load manifest/);
  assert.match(refusalProblem(null, '', 'E0597') ?? '', /failed without E0597: status null/);
});

test('a check that fails with the code and another error is no refusal (GN-14, B2.402)', () => {
  assert.match(refusalProblem(101, `${refused('E0597')}error[E0308]: mismatched types\n`, 'E0597') ?? '', /with E0597 and another error: error\[E0308\]: mismatched types/);
});

test('a target that refused.json names no code for fails (GN-14, B2.402)', () => {
  assert.match(refusalProblem(101, refused('E0597'), undefined) ?? '', /names no code/);
});
