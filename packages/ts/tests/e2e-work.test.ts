// GN-14: the work directory of a run of the end-to-end check. A run without WORK makes a directory of its own outside
// the checkout and removes it when it ends, when it fails and on SIGINT and SIGTERM, after every process of the run
// has exited (HR-87); a run never writes into the checkout because no directory was named.

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Readable } from 'node:stream';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { runIn, workOf } from '../../../scripts/e2e-work.mts';

const root = new URL('../../../', import.meta.url).pathname;
const module = new URL('../../../scripts/e2e-work.mts', import.meta.url).href;
const inside = (parent: string, path: string): boolean => !relative(realpathSync(parent), realpathSync(path)).startsWith('..');

// A process has ended when no process has its pid, when it is exiting, or when it has exited and only its parent has
// yet to read its status. A process closes its files while it exits, so the end of a pipe that it held comes before
// its exit is complete; and a signal to the group of a command stops a process and its parent together, so an exited
// process whose parent has exited is a child of the init process of the system, which reads its status when it runs.
// No process of the run can await either step, because the run is not the parent of every process of its command, and
// the process holds no file, pipe or port during them and runs no code of its own. kill(pid, 0) succeeds in both, so
// it does not tell whether the process has ended. macOS names both in the state of ps: E for a process that is
// exiting, Z for one whose status is not read. Linux names the second Z or X in /proc/<pid>/stat and the first by the
// flag PF_EXITING (0x4) of the field flags of that file.
const ended = (pid: number): { ended: boolean; state: string } => {
  if (process.platform === 'linux') {
    let stat: string;
    try {
      stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ended: true, state: '' };
      throw error;
    }
    // The fields after the name of the command, which is in parentheses and can hold a space: state ... flags.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const [state = '', flags = ''] = [fields[0], fields[6]];
    assert.match(flags, /^\d+$/, stat);
    return { ended: state === 'Z' || state === 'X' || (Number(flags) & 0x4) !== 0, state: `${state} flags ${flags}` };
  }
  assert.equal(process.platform, 'darwin', 'the test reads the state of a process on Linux and macOS');
  const ps = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
  // ps exits with 1 when no process has the pid.
  assert.ok(ps.error === undefined && (ps.status === 0 || ps.status === 1), `ps -o stat= -p ${String(pid)}: ${String(ps.error ?? ps.status)} ${ps.stderr}`);
  const state = ps.stdout.trim();
  return { ended: state === '' || state.startsWith('Z') || state.includes('E'), state };
};

test('a process that has exited and waits for its parent to read its status has ended, which kill(pid, 0) does not tell (HR-87)', async () => {
  // sh starts a process that exits at once and then becomes cat, which never reads the status of that process. The
  // process holds the pipe of fd 3 and sh closes it, so the pipe ends when the process has exited.
  const parent = spawn('sh', ['-c', 'sh -c "exit 0" & echo $!; exec 3>&-; exec cat'], { stdio: ['pipe', 'pipe', 'inherit', 'pipe'] });
  const closed = once(parent, 'close');
  const held = parent.stdio[3] as Readable;
  const exited = once(held, 'end');
  held.resume();
  const { stdin, stdout } = parent;
  assert.ok(stdin !== null && stdout !== null);
  const [line] = (await once(stdout.setEncoding('utf8'), 'data')) as [string];
  await exited;
  const pid = Number(line.trim());
  assert.ok(Number.isInteger(pid) && pid > 0, line);
  assert.doesNotThrow(() => process.kill(pid, 0));
  const { ended: done, state } = ended(pid);
  assert.ok(done, `the process that has exited is in state ${state}`);
  stdin.end();
  await closed;
});

test('a run without a work directory, or with an empty one, makes its own outside the checkout (GN-14)', () => {
  for (const given of [undefined, '']) {
    const work = workOf(given);
    try {
      assert.equal(work.own, true);
      assert.ok(existsSync(work.path));
      assert.ok(inside(realpathSync(tmpdir()), work.path), work.path);
      // The path has no symbolic link, so npm ci of the tree of binding reads its package as itself.
      assert.equal(work.path, realpathSync(work.path));
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
    // The run awaited the pipe that both processes held, which ends when both have exited; the inner process, whose
    // parent the signal stopped with it, can still wait for the init process to read its status.
    for (const name of ['outer', 'inner']) {
      const { ended: done, state } = ended(Number(found(name)));
      assert.ok(done, `the ${name} process outlives the run in state ${state}`);
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

test('a run of scripts/e2e.mts without --work leaves its checkout as git status --ignored had it, and no directory of its own (GN-14, HR-87)', async () => {
  // The checkout of the test: the tracked files of this working tree, committed in a repository of the test. Its
  // var/tools holds only an npm that installs nothing, so the script of the tree of the commit starts and fails when it
  // loads the generator, whose packages are not installed: the run has written the tree of the commit by then.
  const checkout = mkdtempSync(join(tmpdir(), 'binding-checkout-'));
  const temporary = mkdtempSync(join(tmpdir(), 'binding-tmp-'));
  try {
    const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter((path) => path !== '');
    assert.ok(tracked.includes('scripts/e2e.mts'), 'git ls-files named no script of the run');
    for (const path of tracked.filter((file) => existsSync(join(root, file)))) {
      mkdirSync(dirname(join(checkout, path)), { recursive: true });
      copyFileSync(join(root, path), join(checkout, path));
    }
    const git = (argv: string[]): string => execFileSync('git', ['-C', checkout, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...argv], { encoding: 'utf8' });
    git(['init', '--quiet']);
    git(['add', '--all']);
    git(['commit', '--quiet', '--message', 'the tree of the test']);
    mkdirSync(join(checkout, 'var/tools/bin'), { recursive: true });
    writeFileSync(join(checkout, 'var/tools/bin/npm'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(checkout, 'var/tools/bin/npm'), 0o755);
    const status = (): string => git(['status', '--porcelain', '--ignored', '--untracked-files=all']);
    const before = status();
    assert.match(before, /^!! var\/tools\/bin\/npm$/m);
    // The run as make e2e starts it without WORK: in the checkout, with no --work. Its own directory is made under the
    // temporary directory of the test, which is empty before the run and after it.
    const run = spawn(process.execPath, [join(checkout, 'scripts/e2e.mts'), '--binding', 'HEAD', '--repo', 'tests/e2e/variants'], { cwd: checkout, env: { ...process.env, TMPDIR: temporary }, stdio: ['ignore', 'pipe', 'pipe'] });
    let printed = '';
    for (const stream of [run.stdout, run.stderr]) stream.setEncoding('utf8').on('data', (chunk: string) => (printed += chunk));
    const [code] = (await once(run, 'close')) as [number | null];
    // The script of the tree ran, from a directory of the run outside the checkout, and failed for the packages.
    assert.match(printed, /== binding: the tree of the commit [0-9a-f]{40}\n/);
    const from = /imported from (\S+)\/binding\/packages\/ts\/src\/check\.ts/.exec(printed)?.[1];
    assert.ok(from !== undefined, printed);
    assert.ok(inside(temporary, dirname(from)) && !inside(checkout, dirname(from)), from);
    assert.notEqual(code, 0, printed);
    assert.equal(status(), before);
    assert.deepEqual(readdirSync(temporary), []);
  } finally {
    rmSync(checkout, { recursive: true, force: true });
    rmSync(temporary, { recursive: true, force: true });
  }
});
