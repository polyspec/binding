// B2.432: make e2e-lint, the lint of the generated crates of the repositories of tests/e2e before a commit. For each
// repository of the matrix of the job e2e of .github/workflows/ci.yml, with its DEPS (lintEntries), it runs the
// end-to-end check of the HEAD of this checkout (scripts/e2e.mts) with --until lint: the copy, the generation with the
// CLI of that commit, the lint of the core and cargo clippy -D warnings of each binding crate with its test features
// and without them, and nothing after it, so no package is built and no test runs. Each repository runs to its end, and
// the run fails when one failed. The Makefile target runs it with npm offline.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintArgv, lintEntries } from './e2e-lint.mts';

const top = new URL('..', import.meta.url).pathname;
const all = lintEntries(readFileSync(join(top, '.github/workflows/ci.yml'), 'utf8'), (repo) => existsSync(join(top, repo, 'refused.json')));
// REPOS of the Makefile: the repositories of the list that the run lints, every one of it when none is named.
const named = process.argv.slice(2);
const unknown = named.filter((repo) => !all.some((e) => e.repo === repo));
if (unknown.length > 0) {
  process.stderr.write(`e2e-lint lints only ${all.map((e) => e.repo).join(', ')}; not ${unknown.join(', ')}\n`);
  process.exit(2);
}
const entries = named.length === 0 ? all : all.filter((e) => named.includes(e.repo));
const failed: string[] = [];
const started = Date.now();
for (const entry of entries) {
  const argv = [join(top, 'scripts/e2e.mts'), ...lintArgv(entry)];
  process.stdout.write(`\n==== e2e-lint: ${entry.repo}${entry.deps.length > 0 ? ` (DEPS ${entry.deps.join(' ')})` : ''}\n$ ${process.execPath} ${argv.join(' ')}\n`);
  const ran = spawnSync(process.execPath, argv, { cwd: top, stdio: 'inherit' });
  if (ran.status !== 0) failed.push(entry.repo);
}
const seconds = Math.round((Date.now() - started) / 1000);
process.stdout.write(`\ne2e-lint: ${entries.length - failed.length} of ${entries.length} repositories linted in ${seconds} s (${entries.map((e) => e.repo).join(', ')})\n`);
if (failed.length > 0) {
  process.stdout.write(`e2e-lint: the lint of ${failed.join(', ')} failed\n`);
  process.exit(1);
}
