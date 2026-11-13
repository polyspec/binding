// GN-14b: the files that a run of the end-to-end check reads from the checkout are a closed list. Every tracked file of
// binding outside packages/, tests/ and docs/ that is not a document is read or not read by a run, each with its reason,
// so a new file that a run would read cannot leave a run that it changes named evidence.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { NOT_READ, READ_FROM_CHECKOUT } from '../../../scripts/e2e-inputs.mts';

const root = new URL('../../../', import.meta.url).pathname;
const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter((path) => path !== '');

test('every tracked file outside the packages, the tests and the documents is read or not read by a run (GN-14b)', () => {
  const listed = new Map([...READ_FROM_CHECKOUT, ...NOT_READ].map((input) => [input.path, input.why]));
  assert.equal(listed.size, READ_FROM_CHECKOUT.length + NOT_READ.length, 'a path is listed twice');
  const outside = tracked.filter((path) => !/^(packages|tests|docs)\//.test(path) && !path.endsWith('.md'));
  assert.ok(outside.length > 0, 'git ls-files named no file');
  assert.deepEqual(outside.filter((path) => !listed.has(path)), [], 'a tracked file is neither read nor not read by a run');
  // A listed file that is not tracked would be a name that no run compares.
  assert.deepEqual([...listed.keys()].filter((path) => !tracked.includes(path)), [], 'a listed file is not tracked');
  for (const [path, why] of listed) assert.ok(why.length > 0, `${path} has no reason`);
});
