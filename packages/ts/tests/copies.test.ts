// A test copies a fixture with fs.cpSync of Node.js, never with the cp tool: `cp -r <dir>/ <root>/` copies the
// contents of <dir> into <root> on macOS (BSD cp) and <dir> itself into <root>/<dir> on Linux (GNU cp), so a test that
// passes on a Mac fails on Linux with a file that it does not find (B2.180).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const TOOL = new RegExp(`(execFileSync|spawnSync|execSync|spawn)\\(\\s*['"\`]${'c'}p['"\` ]`);

test('no test copies a fixture with the cp tool, whose copy of a directory differs between macOS and Linux (B2.180)', () => {
  const files = readdirSync(dir).filter((name) => /\.(ts|mts|mjs)$/.test(name));
  const found: string[] = [];
  for (const name of files) {
    readFileSync(join(dir, name), 'utf8').split('\n').forEach((line, index) => {
      if (TOOL.test(line)) found.push(`${name}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.ok(files.length > 5, `the check read ${files.length} test files`);
  assert.deepEqual(found, [], 'a test copies with the cp tool; copy with cpSync of node:fs, which copies the same tree on every platform');
});
