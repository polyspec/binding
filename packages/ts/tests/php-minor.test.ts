// The PHP of the checkout: kit wraps the php of PATH as it is, so binding compares its minor with .php-version and
// fails make install-tools when they differ, naming both (AGENTS.md, B2.300).

import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// B2.499: install-php of kit keeps an existing wrapper (K283, K1271), so the step that the message named, the php of
// .php-version first on PATH and make install-tools again, left the wrapper on the other minor. The test follows the
// step that the message names in a checkout of its own, with the install of php of kit.
test('B2.499: the step that the message of another minor names mends var/tools/bin/php to the minor of .php-version (K283)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-php-mend-'));
  const saved = process.env['PATH'];
  try {
    const php = (minor: string): string => {
      const dir = join(root, `machine-${minor}`);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, 'php');
      writeFileSync(file, `#!/bin/sh\nprintf '%s' '${minor}'\n`);
      chmodSync(file, 0o755);
      return dir;
    };
    const old = php('8.5');
    const wanted = php('8.4');
    writeFileSync(join(root, '.php-version'), '8.4\n');
    const kit = new URL('../../../node_modules/@polyspec/kit/dist/install-php.mjs', import.meta.url).href;
    const { installPhp } = (await import(kit)) as { installPhp: (options: { root: string; print: (line: string) => void }) => void };
    const install = (first: string): void => {
      process.env['PATH'] = `${first}:${saved ?? ''}`;
      installPhp({ root, print: () => {} });
    };
    // The checkout wrapped the php of PHP 8.5.
    install(old);
    const wrapper = join(root, 'var/tools/bin/php');
    const problem = phpMinorProblem('8.4', wrapper) ?? '';
    assert.match(problem, /is PHP 8\.5/);
    // The step of the message: each sentence after the colon, in order.
    if (problem.includes(`remove ${wrapper}`)) rmSync(wrapper);
    assert.match(problem, /put the php of PHP 8\.4 first on PATH and run make install-tools again$/);
    install(wanted);
    assert.equal(phpMinorProblem('8.4', wrapper), undefined, readFileSync(wrapper, 'utf8'));
  } finally {
    process.env['PATH'] = saved;
    rmSync(root, { recursive: true, force: true });
  }
});

test('make install-tools checks the minor of the PHP that it wraps, and the run of make e2e uses the same check (B2.300)', () => {
  assert.match(read('Makefile'), /\$\(KIT\)\/install-tools\.mjs --no-self-update \$\(TOOLS\)\n\t\$\(if [^\n]*\$\(NODE\) scripts\/php-minor\.mts\)/);
  assert.match(read('scripts/e2e.mts'), /phpMinorProblem\(/);
});
