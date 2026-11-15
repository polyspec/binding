// The PHP of the checkout: kit wraps the php of PATH as it is, so binding compares its minor with .php-version and
// fails make install-tools when they differ, naming both (AGENTS.md, B2.300).

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { phpMinorProblem } from '../../../scripts/php-minor.mts';

const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('a php of another minor than .php-version is named with both, and the minor of .php-version is accepted (B2.300)', () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-php-minor-'));
  try {
    const php = (minor: string): string => {
      const file = join(root, `php-${minor}`);
      writeFileSync(file, `#!/bin/sh\nprintf '%s' '${minor}'\n`);
      chmodSync(file, 0o755);
      return file;
    };
    assert.equal(phpMinorProblem('8.4', php('8.4')), undefined);
    assert.equal(phpMinorProblem('8.4', php('8.5')), `the PHP of the checkout must be the minor 8.4 of .php-version; ${join(root, 'php-8.5')} is PHP 8.5: put the php of PHP 8.4 first on PATH and run make install-tools again`);
    assert.match(phpMinorProblem('8.4', join(root, 'absent')) ?? '', /is PHP that does not run/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('make install-tools checks the minor of the PHP that it wraps, and the run of make e2e uses the same check (B2.300)', () => {
  assert.match(read('Makefile'), /\$\(KIT\)\/install-tools\.mjs --no-self-update \$\(TOOLS\)\n\t\$\(if [^\n]*\$\(NODE\) scripts\/php-minor\.mts\)/);
  assert.match(read('scripts/e2e.mts'), /phpMinorProblem\(/);
});
