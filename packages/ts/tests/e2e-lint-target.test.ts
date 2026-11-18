// B2.432: make e2e-lint, the lint of the generated crates of the repositories of tests/e2e before a commit. The cases run
// the lint of the binding crates with a stand-in cargo, which records its arguments and fails as clippy failed on the
// crates of 0.0.18 (B2.430), and read the list of repositories, the Makefile target and the stop of scripts/e2e.mts.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lintArgv, lintBindingCrates, lintEntries } from '../../../scripts/e2e-lint.mts';

const top = new URL('../../../', import.meta.url).pathname;
const ci = readFileSync(join(top, '.github/workflows/ci.yml'), 'utf8');

test('B2.432: each binding crate is linted by cargo clippy -D warnings with its test features and without them, and a lint that clippy fails, such as the unused in_blob of B2.430, fails the target', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'binding-e2e-lint-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = join(root, 'calls');
  const cargo = join(root, 'cargo');
  // The stand-in: it records each call and fails the lint of polyspec-sample-php without a feature, as clippy did.
  writeFileSync(cargo, `#!/bin/sh
echo "$*" >> "${calls}"
case "$*" in
  *"-p polyspec-sample-php --all-targets -- "*) echo 'error: function \`in_blob\` is never used' >&2; exit 101 ;;
esac
exit 0
`);
  chmodSync(cargo, 0o755);
  const run = (argv: string[]): void => {
    const ran = spawnSync(cargo, argv, { encoding: 'utf8' });
    if (ran.status !== 0) throw new Error(`cargo clippy (status ${String(ran.status)}): ${ran.stderr.trim()}`);
  };
  const crates = [
    { manifest: '/copy/Cargo.toml', crate: 'polyspec-sample-node', features: 'panic-test,codec-test' },
    { manifest: '/copy/Cargo.toml', crate: 'polyspec-sample-python', features: 'codec-test' },
  ];
  lintBindingCrates(crates, run);
  assert.deepEqual(readFileSync(calls, 'utf8').trim().split('\n'), [
    'clippy --manifest-path /copy/Cargo.toml -p polyspec-sample-node --all-targets --features panic-test,codec-test -- -D warnings',
    'clippy --manifest-path /copy/Cargo.toml -p polyspec-sample-node --all-targets -- -D warnings',
    'clippy --manifest-path /copy/Cargo.toml -p polyspec-sample-python --all-targets --features codec-test -- -D warnings',
    'clippy --manifest-path /copy/Cargo.toml -p polyspec-sample-python --all-targets -- -D warnings',
  ]);
  // Red: the crate whose helper only a feature reads passes with its test features and fails without them.
  rmSync(calls);
  assert.throws(() => lintBindingCrates([{ manifest: '/copy/Cargo.toml', crate: 'polyspec-sample-php', features: 'codec-test' }], run), /function `in_blob` is never used/);
  assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 2);
});

test('B2.432: make e2e-lint lints the repositories of the matrix of the job e2e with their DEPS, except one whose crates the compiler refuses', () => {
  const entries = lintEntries(ci, (repo) => existsSync(join(top, repo, 'refused.json')));
  assert.deepEqual(entries, [
    { repo: 'tests/e2e/classes', deps: [] },
    { repo: 'tests/e2e/consumer', deps: ['tests/e2e/sample'] },
    { repo: 'tests/e2e/falsepass', deps: [] },
    { repo: 'tests/e2e/functions', deps: [] },
    { repo: 'tests/e2e/kept', deps: [] },
    { repo: 'tests/e2e/plot', deps: ['tests/e2e/points'] },
    { repo: 'tests/e2e/ratios', deps: [] },
    { repo: 'tests/e2e/sample', deps: [] },
    { repo: 'tests/e2e/shapes', deps: [] },
    { repo: 'tests/e2e/variants', deps: [] },
  ]);
  // lent is refused by the compiler by design (B2.402); relay is in tests/e2e/not-in-ci.json.
  assert.ok(existsSync(join(top, 'tests/e2e/lent/refused.json')));
  assert.ok(!entries.some((e) => e.repo === 'tests/e2e/relay'));
  assert.deepEqual(lintArgv({ repo: 'tests/e2e/plot', deps: ['tests/e2e/points'] }), ['--repo', 'tests/e2e/plot', '--dep', 'tests/e2e/points', '--until', 'lint']);
  assert.throws(() => lintEntries('jobs:\n  check:\n', () => false), /no matrix/);
});

test('B2.432: scripts/e2e.mts with --until lint stops after the lint of the binding crates and runs no test before it', () => {
  const source = readFileSync(join(top, 'scripts/e2e.mts'), 'utf8');
  const stop = source.indexOf("if (until === 'lint') finishLint();");
  assert.ok(stop > source.indexOf('lintBindingCrates(mainsOf(t)'), 'the stop is after the lint of the binding crates');
  // Before the stop, the only test command is the cargo test of the core, which a lint run replaces with cargo check.
  assert.match(source, /run\('cargo', \[until === 'lint' \? 'check' : 'test', /);
  const before = source.slice(0, stop);
  for (const runner of ['unittest(', 'nodeTest(', "'test', '-json'", 'phpunitRun(']) assert.ok(!before.includes(runner), `${runner} runs before the stop`);
  const makefile = readFileSync(join(top, 'Makefile'), 'utf8');
  assert.match(makefile, /\ne2e-lint: ## [^\n]*\n\t\$\(ONLINE\) npm_config_offline=true \$\(NODE\) scripts\/e2e-lint-repos\.mts \$\(REPOS\)\n/);
});
