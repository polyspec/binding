// B2.539, GN-15g: the paths that the released form of a Go module leaves out leave the index of its commit. The
// rehearsal writes that index with the Git of a bare repository, which has no work tree, and the release with the Git
// of the repository; the cases run the real git on both, since the defect was the refusal of git itself.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { leaveIndex } from '../src/release/go-module.ts';

const IDENTITY = { GIT_AUTHOR_NAME: 'case', GIT_AUTHOR_EMAIL: 'case@example.invalid', GIT_COMMITTER_NAME: 'case', GIT_COMMITTER_EMAIL: 'case@example.invalid' };

test('B2.539: a path that the released form leaves out leaves the index, in a bare repository as in a work tree (GN-15g)', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'binding-go-index-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (args: string[], env: Record<string, string> = {}, input?: string): string => {
    const ran = spawnSync('git', args, { encoding: 'utf8', input, env: { ...process.env, ...IDENTITY, ...env } });
    assert.equal(ran.status, 0, `git ${args.join(' ')}: ${ran.error?.message ?? ''}${ran.stderr}`);
    return ran.stdout.trim();
  };
  const work = join(root, 'work');
  mkdirSync(join(work, 'packages/go/tests'), { recursive: true });
  writeFileSync(join(work, 'packages/go/go.mod'), 'module example.invalid/m\n');
  writeFileSync(join(work, 'packages/go/tests/cases_test.go'), 'package tests\n');
  git(['-C', work, 'init', '-q']);
  git(['-C', work, 'add', '-A']);
  git(['-C', work, 'commit', '-q', '-m', 'case']);
  const parent = git(['-C', work, 'rev-parse', 'HEAD']);
  git(['clone', '-q', '--bare', work, join(root, 'proof.git')]);
  const runners = {
    // The rehearsal: the bare repository of the proof, with no work tree.
    bare: (args: string[], env: Record<string, string> = {}, input?: string) => git(['--git-dir', join(root, 'proof.git'), ...args], env, input),
    // The release: the repository with its work tree.
    'work tree': (args: string[], env: Record<string, string> = {}, input?: string) => git(['-C', work, ...args], env, input),
  };
  for (const [name, run] of Object.entries(runners)) {
    const index = { GIT_INDEX_FILE: join(root, `index-${name}`) };
    run(['read-tree', parent], index);
    leaveIndex((args, input) => run(args, index, input), ['packages/go/tests/cases_test.go']);
    assert.deepEqual(run(['ls-files', '--cached'], index).split('\n'), ['packages/go/go.mod'], `${name}: the left-out path is still in the index`);
  }
});
