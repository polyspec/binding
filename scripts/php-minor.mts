// The PHP of the checkout (AGENTS.md: PHP is pinned by its minor in .php-version). install-tools of kit wraps the php
// of PATH as it is (K283, K862) and compares no release, so this script compares the minor of that php with
// .php-version and fails with both, before a check runs on another PHP.
//
//   node scripts/php-minor.mts [<php>]
//
// with var/tools/bin/php of the checkout when no php is given.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The reason why the php `php` is not the minor `want`, or undefined when it is.
export function phpMinorProblem(want: string, php: string): string | undefined {
  const minor = spawnSync(php, ['-r', 'echo PHP_MAJOR_VERSION, ".", PHP_MINOR_VERSION;'], { encoding: 'utf8' }).stdout?.trim() ?? '';
  if (minor === want) return undefined;
  return `the PHP of the checkout must be the minor ${want} of .php-version; ${php} is PHP ${minor === '' ? 'that does not run' : minor}${minor === '' ? '' : `: put the php of PHP ${want} first on PATH and run make install-tools again`}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const want = readFileSync(`${root}.php-version`, 'utf8').trim();
  const problem = phpMinorProblem(want, process.argv[2] ?? `${root}var/tools/bin/php`);
  if (problem !== undefined) {
    process.stderr.write(`php-minor: ${problem}\n`);
    process.exit(1);
  }
}
