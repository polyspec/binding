// GN-14: the work directory of a run of the end-to-end check. A run without WORK makes a directory of its own outside
// the checkout and removes it when it ends, when it fails and on SIGINT and SIGTERM, after every process of the run
// has exited (HR-87); a run never writes into the checkout because no directory was named.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { runIn, workOf } from '../../../scripts/e2e-work.mts';

const root = new URL('../../../', import.meta.url).pathname;
const module = new URL('../../../scripts/e2e-work.mts', import.meta.url).href;
const inside = (parent: string, path: string): boolean => !relative(realpathSync(parent), realpathSync(path)).startsWith('..');

test('a run without a work directory, or with an empty one, makes its own outside the checkout (GN-14)', () => {
  for (const given of [undefined, '']) {
    const work = workOf(given);
    try {
      assert.equal(work.own, true);
      assert.ok(existsSync(work.path));
      assert.ok(inside(tmpdir(), work.path), work.path);
      assert.ok(!inside(root, work.path), work.path);
      assert.notEqual(resolve(work.path), resolve(''));
    } finally {
      rmSync(work.path, { recursive: true });
    }
  }
  // A named directory is the one of the caller, which the run does not remove.
  assert.deepEqual(workOf('named/work'), { path: resolve('named/work'), own: false });
});

test('the directory of the run is removed when its command ends and when it fails, and a named one is kept (GN-14, HR-87)', async () => {
  const write = "require('node:fs').writeFileSync(require('node:path').join(process.argv[1], 'made'), 'x'); process.exit(Number(process.argv[2]));";
  for (const status of [0, 3]) {
    const work = workOf(undefined);
    assert.equal(await runIn(work, [{ command: process.execPath, argv: ['-e', write, work.path, String(status)] }]), status);
    assert.ok(!existsSync(work.path), `status ${String(status)}: ${work.path} is left`);
  }
  const named = { path: workOf(undefined).path, own: false };
  try {
    assert.equal(await runIn(named, [{ command: process.execPath, argv: ['-e', write, named.path, '0'] }]), 0);
    assert.equal(readFileSync(join(named.path, 'made'), 'utf8'), 'x');
  } finally {
    rmSync(named.path, { recursive: true });
  }
  // The errors of a command are printed with its output, in the order written.
  const both = spawn(process.execPath, ['--input-type=module', '-e', `import { runIn } from ${JSON.stringify(module)};
process.exitCode = await runIn({ path: '', own: false }, [{ command: process.execPath, argv: ['-e', 'process.stdout.write("1\\\\n"); process.stderr.write("2\\\\n"); process.stdout.write("3\\\\n");'] }]);`], { stdio: ['ignore', 'pipe', 'inherit'] });
  let printed = '';
  both.stdout.setEncoding('utf8').on('data', (chunk: string) => (printed += chunk));
  assert.deepEqual(await once(both, 'close'), [0, null]);
  assert.equal(printed, '1\n2\n3\n');
  // A command that cannot start fails the run and leaves no directory.
  const none = workOf(undefined);
  assert.notEqual(await runIn(none, [{ command: join(none.path, 'no-such-command'), argv: [] }]), 0);
  assert.ok(!existsSync(none.path));
  // The commands run in turn, and the first that fails ends the run with its status.
  const turn = { path: workOf(undefined).path, own: false };
  try {
    const add = "require('node:fs').appendFileSync(require('node:path').join(process.argv[1], 'made'), process.argv[2]); process.exit(Number(process.argv[3]));";
    const step = (text: string, status: number): { command: string; argv: string[] } => ({ command: process.execPath, argv: ['-e', add, turn.path, text, String(status)] });
    assert.equal(await runIn(turn, [step('a', 0), step('b', 4), step('c', 0)]), 4);
    assert.equal(readFileSync(join(turn.path, 'made'), 'utf8'), 'ab');
  } finally {
    rmSync(turn.path, { recursive: true });
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`${signal} stops every process of the run and then removes its directory (GN-14, HR-87)`, async () => {
    // The run: a command that starts a process of its own, which writes into the directory and then waits on a pipe
    // that never closes. Both print their pid, and the second prints it after its file exists.
    const waiting = "require('node:fs').writeFileSync(require('node:path').join(process.argv[1], 'made'), 'x'); console.log('inner ' + process.pid); process.stdin.resume();";
    const command = `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(waiting)}, process.argv[1]], { stdio: ['pipe', 'inherit', 'inherit'] }); console.log('outer ' + process.pid); child.on('exit', () => process.exit(9)); process.stdin.resume();`;
    const main = `import { runIn, workOf } from ${JSON.stringify(module)};
const work = workOf(undefined);
console.log('work ' + work.path);
process.exitCode = await runIn(work, [{ command: process.execPath, argv: ['-e', ${JSON.stringify(command)}, work.path] }, { command: process.execPath, argv: ['-e', 'console.log("later")'] }]);`;
    const run = spawn(process.execPath, ['--input-type=module', '-e', main], { stdio: ['pipe', 'pipe', 'inherit'] });
    let printed = '';
    const found = (name: string): string | undefined => new RegExp(`^${name} (.+)$`, 'm').exec(printed)?.[1];
    const closed = once(run, 'close');
    // The signal is sent when the last line of the three is read, so the file of the inner process exists.
    await new Promise<void>((ready, fail) => {
      run.stdout.setEncoding('utf8');
      run.stdout.on('data', (chunk: string) => {
        printed += chunk;
        if (found('work') !== undefined && found('outer') !== undefined && found('inner') !== undefined) ready();
      });
      run.on('close', () => fail(new Error(`the run ended before its processes started: ${printed}`)));
    });
    const work = found('work') ?? '';
    assert.ok(existsSync(join(work, 'made')));
    run.kill(signal);
    const [status] = (await closed) as [number | null];
    assert.equal(status, signal === 'SIGINT' ? 130 : 143);
    assert.ok(!existsSync(work), `${work} is left`);
    assert.doesNotMatch(printed, /^later$/m, 'a command ran after the signal');
    for (const name of ['outer', 'inner']) {
      assert.throws(() => process.kill(Number(found(name)), 0), { code: 'ESRCH' }, `the ${name} process outlives the run`);
    }
  });
}

test('make e2e gives --work only for a WORK that is named, so an empty one is no path (GN-14)', () => {
  const makefile = readFileSync(join(root, 'Makefile'), 'utf8');
  assert.match(makefile, /scripts\/e2e\.mts --binding \$\(BINDING\) --repo \$\(REPO\)\$\(if \$\(WORK\), --work \$\(WORK\)\)\$\(foreach dep,\$\(DEPS\), --dep \$\(dep\)\)/);
  const script = readFileSync(join(root, 'scripts/e2e.mts'), 'utf8');
  assert.match(script, /workOf\(args\.get\('--work'\)\)/);
  assert.doesNotMatch(script, /resolve\(workArg\)/);
});
