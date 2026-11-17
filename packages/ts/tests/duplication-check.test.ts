// B2.515: make duplication-check runs the duplication-check of kit by config/duplication.json, and a piece of code that
// exists twice in packages/ts/src fails it. The test runs the target of the Makefile in a temporary copy that holds the
// Makefile, the configuration and two sources, so the duplications of today's tree (B2.517 to B2.521) play no part.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

// A function of ten lines with logic; each source of the copy gets one under its own name, or the same one twice.
const body = (name: string): string => `export function ${name}(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (value < 0) throw new Error(\`negative value \${value}\`);
    total += value * 2;
    if (total > 1000) total -= 1000;
  }
  const rest = total % 7;
  return rest === 0 ? total : total - rest;
}
`;

const other = `export function label(text: string): string {
  return text.trim().toLowerCase();
}
`;

function check(second: string): { status: number | null; output: string } {
  const work = mkdtempSync(join(tmpdir(), 'binding-duplication-'));
  try {
    assert.equal(spawnSync('git', ['-C', work, 'init', '-q']).status, 0);
    mkdirSync(join(work, 'config'));
    mkdirSync(join(work, 'packages', 'ts', 'src'), { recursive: true });
    copyFileSync(join(root, 'Makefile'), join(work, 'Makefile'));
    copyFileSync(join(root, 'config', 'duplication.json'), join(work, 'config', 'duplication.json'));
    writeFileSync(join(work, 'packages', 'ts', 'src', 'first.ts'), body('first'));
    writeFileSync(join(work, 'packages', 'ts', 'src', 'second.ts'), second);
    // The copy has no install of its own, so make takes the kit and the node of this checkout.
    const result = spawnSync('make', ['--no-print-directory', '-C', work, 'duplication-check', `KIT=${join(root, 'node_modules', '@polyspec', 'kit', 'dist')}`, `NODE=${process.execPath}`], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

test('B2.515: make duplication-check passes a copy whose sources hold no piece twice', () => {
  const { status, output } = check(other);
  assert.equal(status, 0, output);
  assert.match(output, /no piece of code exists twice/);
});

test('B2.515: make duplication-check fails a copy that holds a piece of packages/ts/src twice, naming both files', () => {
  const { status, output } = check(`${other}\n${body('first').replace('first', 'second')}`);
  assert.notEqual(status, 0, output);
  assert.match(output, /a piece of code exists twice/);
  assert.match(output, /packages\/ts\/src\/first\.ts/);
  assert.match(output, /packages\/ts\/src\/second\.ts/);
});
