// B2.381: what an install puts into a checkout is ignored, also when it is a link, as in a worktree that links the
// node_modules of another checkout.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('B2.381: git ignores node_modules of the root and of packages/ts as a directory and as a link', () => {
  const work = mkdtempSync(join(tmpdir(), 'gitignore-'));
  try {
    const git = (...args: string[]): number => spawnSync('git', ['-C', work, ...args], { encoding: 'utf8' }).status ?? -1;
    assert.equal(git('init', '-q'), 0);
    copyFileSync(join(root, '.gitignore'), join(work, '.gitignore'));
    const target = join(work, 'elsewhere');
    mkdirSync(target);
    mkdirSync(join(work, 'packages', 'ts'), { recursive: true });
    symlinkSync(target, join(work, 'node_modules'));
    symlinkSync(target, join(work, 'packages', 'ts', 'node_modules'));
    mkdirSync(join(work, 'packages', 'other', 'node_modules'), { recursive: true });
    // check-ignore exits 0 when the path is ignored.
    for (const path of ['node_modules', 'packages/ts/node_modules', 'packages/other/node_modules']) assert.equal(git('check-ignore', '-q', path), 0, path);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
