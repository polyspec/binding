// AGENTS (Own): no tracked file names a Git commit. A commit name is a token of 7 to 40 lower-case hex digits that holds
// a letter and a digit, as git abbreviates or writes a commit; a number or a word has no such token. Two places name a
// commit because a tool requires it: the commit pin of a GitHub action on its `uses:` line, and a lock, which records
// what its package manager resolved. A test input that the generator must refuse, the `rev` of a Cargo dependency
// line, is no name of a commit either.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../../../', import.meta.url).pathname;
const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter((path) => path !== '');
const LOCKS = /(^|\/)(package-lock\.json|Cargo\.lock|composer\.lock|mise\.lock|aube-lock\.yaml)$/;
const TOKEN = /\b[0-9a-f]{7,40}\b/g;
const ACTION_PIN = /^\s*(-\s+)?uses:\s+[\w.-]+\/[\w./-]+@([0-9a-f]{40})\b/;
const REFUSED_REV = /\brev: '([0-9a-f]{7,40})'/g;

test('no tracked file names a Git commit, except the pin of an action and a lock (AGENTS)', () => {
  const found: string[] = [];
  let read = 0;
  for (const path of tracked.filter((p) => !LOCKS.test(p))) {
    const bytes = readFileSync(join(root, path));
    if (bytes.includes(0)) continue;
    read += 1;
    bytes.toString('utf8').split('\n').forEach((line, index) => {
      const allowed = new Set<string>();
      const pin = ACTION_PIN.exec(line)?.[2];
      if (pin !== undefined) allowed.add(pin);
      if (path.startsWith('packages/ts/tests/')) for (const [, rev] of line.matchAll(REFUSED_REV)) if (rev !== undefined) allowed.add(rev);
      for (const [token] of line.matchAll(TOKEN)) {
        if (/[a-f]/.test(token) && /[0-9]/.test(token) && !allowed.has(token)) found.push(`${path}:${index + 1}: ${token}`);
      }
    });
  }
  assert.ok(read > 100, `the check read ${read} tracked text files`);
  assert.deepEqual(found, [], 'a tracked file names a Git commit; state what was verified instead, and keep the commit in the record of the run');
});
