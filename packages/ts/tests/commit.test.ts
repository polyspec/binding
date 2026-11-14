// CK-20: the commit of the running binding, which check compares with the commit that Cargo.lock pins.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gitPinDiffers, ownCommit } from '../src/commit.ts';

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

test('the archive of a release, which knows no commit, is the tag of its version that a Git source names (CK-20)', () => {
  // Before, the archive of the release asset knew no commit, so every Git source failed CK-20 with an unknown commit,
  // also one of the tag of its own release.
  const commit = 'b'.repeat(40);
  const source = (reference: string): string => `git+https://github.com/polyspec/binding?${reference}#${commit}`;
  assert.equal(gitPinDiffers(source('tag=v0.0.1'), '0.0.1', undefined), undefined);
  assert.match(gitPinDiffers(source('tag=v0.0.2'), '0.0.1', undefined) ?? '', /at the commit b{40} of the tag v0\.0\.2, and this binding knows no commit of its own; as the archive of the release 0\.0\.1 it is the tag v0\.0\.1$/);
  assert.match(gitPinDiffers(source('branch=main'), '0.0.1', undefined) ?? '', /at the commit b{40}, and this binding knows no commit/);
  assert.match(gitPinDiffers(`git+https://github.com/polyspec/binding#${commit}`, '0.0.1', undefined) ?? '', /at the commit b{40}, and this binding knows no commit/);
  // A binding that knows its commit compares it, also with a source of the tag of its version.
  assert.equal(gitPinDiffers(source('tag=v0.0.1'), '0.0.1', commit), undefined);
  assert.equal(gitPinDiffers(source('tag=v0.0.1'), '0.0.1', 'c'.repeat(40)), `Cargo.lock pins polyspec-binding-core at the commit ${commit}, not ${'c'.repeat(40)}`);
});
