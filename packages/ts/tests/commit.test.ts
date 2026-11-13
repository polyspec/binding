// CK-20: the commit of the running binding, which check compares with the commit that Cargo.lock pins.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ownCommit } from '../src/commit.ts';

const packageDir = new URL('..', import.meta.url).pathname;

test('a tree that git archive wrote knows its commit from the substituted archive-commit (CK-20, GN-14b)', () => {
  // git archive substitutes the placeholder of the file (export-subst), which a checkout keeps as it is.
  assert.equal(readFileSync(join(packageDir, 'archive-commit'), 'utf8'), '$Format:%H$\n');
  const attribute = execFileSync('git', ['-C', packageDir, 'check-attr', 'export-subst', '--', 'archive-commit'], { encoding: 'utf8' });
  assert.match(attribute, /: export-subst: set\n$/);
  const root = mkdtempSync(join(tmpdir(), 'binding-commit-'));
  try {
    const archived = join(root, 'packages/ts');
    mkdirSync(archived, { recursive: true });
    writeFileSync(join(archived, 'archive-commit'), `${'a'.repeat(40)}\n`);
    assert.equal(ownCommit(archived), 'a'.repeat(40));
    // A placeholder that no archive substituted names no commit: a tree outside Git without a lock has none.
    writeFileSync(join(archived, 'archive-commit'), '$Format:%H$\n');
    assert.equal(ownCommit(archived), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a checkout knows its commit from Git (CK-20)', () => {
  const head = execFileSync('git', ['-C', packageDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(ownCommit(packageDir), head);
});
