// I-5: the same contract and the same bindgen give the same bytes, in any directory, with no path, time or host of
// the run; and an item that the generator cannot generate is refused by name (G-4).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { generate } from '../src/generate/index.ts';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const fixture = new URL('./fixtures/repo/', import.meta.url).pathname;

function files(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.set(relative(dir, path), readFileSync(path));
    }
  };
  walk(dir);
  return out;
}

test('two generations in two directories give the same bytes and name neither directory', () => {
  const first = mkdtempSync(join(tmpdir(), 'bindgen-a-'));
  const second = mkdtempSync(join(tmpdir(), 'bindgen-b-'));
  try {
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', first]);
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', second]);
    const a = files(first);
    const b = files(second);
    assert.ok(a.size > 10, `only ${a.size} files were generated`);
    assert.deepEqual([...a.keys()], [...b.keys()]);
    for (const [path, bytes] of a) {
      assert.ok(bytes.equals(b.get(path) ?? Buffer.alloc(0)), `${path} differs`);
      for (const dir of [first, second, fixture, tmpdir()]) {
        assert.ok(!bytes.includes(dir), `${path} names ${dir}`);
      }
    }
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test('a generation leaves no file of an earlier one', () => {
  const out = mkdtempSync(join(tmpdir(), 'bindgen-c-'));
  try {
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', out]);
    const stale = join(out, 'packages/python/generated/stale.py');
    execFileSync('touch', [stale]);
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', out]);
    assert.ok(!files(out).has('packages/python/generated/stale.py'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('an item that is not generated yet is refused by its name (G-4)', () => {
  const contract = JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8'));
  contract.units[0].members[0].wait = 'blocking_io';
  const caseFiles = new Map([['contracts/cases.json', JSON.parse(readFileSync(join(fixture, 'contracts/cases.json'), 'utf8'))]]);
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /split: wait blocking_io is not generated yet/);
});

test('a contract that fails the check is not generated', () => {
  const out = mkdtempSync(join(tmpdir(), 'bindgen-d-'));
  try {
    const root = mkdtempSync(join(tmpdir(), 'bindgen-e-'));
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const path = join(root, 'packages/rust/interface.json');
    const contract = JSON.parse(readFileSync(path, 'utf8'));
    contract.packages.python.module = 'polyspec_sample';
    execFileSync('sh', ['-c', `cat > ${path}`], { input: JSON.stringify(contract) });
    assert.throws(() => execFileSync(process.execPath, [cli, 'generate', '--root', root, '--out', out], { stdio: 'pipe' }), /CK-18/);
    rmSync(root, { recursive: true, force: true });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('check compares the tracked binding packages with what scaffold writes (L-2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bindgen-f-'));
  try {
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const contract = join(root, 'packages/rust/interface.json');
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), /CK-19 is missing/);
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' });
    const entry = join(root, 'packages/python/src/lib.rs');
    execFileSync('sh', ['-c', `echo '// edited' >> ${entry}`]);
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), /lib\.rs: CK-19 differs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
