// GN-14: the work directory of a run of the end-to-end check, and the command of the run inside it. A run without a
// named directory makes one of its own under the temporary directory of the system, so no run writes into the checkout
// because no directory was named, and removes it when the command ends, when it fails and on SIGINT and SIGTERM
// (HR-87). A command runs in a process group of its own and writes its output and its errors to one pipe of this
// process, which prints them on its output in the order written: a signal stops the whole group, and the pipe closes
// when the last process that writes to it has exited, which is the event that the removal waits for.

import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Work {
  path: string;
  // The run made the directory and removes it.
  own: boolean;
}

// The directory that the caller named, or a new directory of the run when none or an empty one was named. A new
// directory is named by its real path: the temporary directory of macOS is under /var, a symbolic link to /private/var,
// and npm ci of a package under a path through a link reads the package as a link named after its directory, which its
// lock does not hold, so the install of the generator fails with "Missing: ts@0.0.1 from lock file".
export function workOf(given: string | undefined): Work {
  if (given === undefined || given === '') return { path: realpathSync(mkdtempSync(join(tmpdir(), 'binding-e2e-'))), own: true };
  return { path: resolve(given), own: false };
}

export interface Command {
  command: string;
  argv: string[];
}

const STATUS = { SIGINT: 130, SIGTERM: 143 } as const;
type Signal = keyof typeof STATUS;

// Runs the commands of the run in turn, each to its end, and gives the status of the first that failed, 0 when none
// did, 130 after SIGINT and 143 after SIGTERM, which also leave the later commands out. A directory of the run is
// removed before the promise settles, whatever the end was.
export async function runIn(work: Work, commands: readonly Command[]): Promise<number> {
  let stopped: Signal | undefined;
  let group: number | undefined;
  const handlers = (Object.keys(STATUS) as Signal[]).map((signal) => {
    const handler = (): void => {
      stopped ??= signal;
      // The group of the command: the command and every process that it started.
      if (group !== undefined) process.kill(-group, signal);
    };
    process.on(signal, handler);
    return { signal, handler };
  });
  try {
    for (const { command, argv } of commands) {
      if (stopped !== undefined) break;
      const status = await new Promise<number>((done, fail) => {
        // sh gives the command, which takes its place, the pipe as its output and as its errors; a command that
        // cannot start is the failure status of sh.
        const child = spawn('sh', ['-c', 'exec "$@" 2>&1', 'sh', command, ...argv], { stdio: ['inherit', 'pipe', 'inherit'], detached: true });
        group = child.pid;
        child.stdout.pipe(process.stdout, { end: false });
        child.on('error', fail);
        // close: the command has exited and no process holds the pipe any more.
        child.on('close', (code) => done(code ?? 1));
      });
      group = undefined;
      if (stopped === undefined && status !== 0) return status;
    }
    return stopped === undefined ? 0 : STATUS[stopped];
  } finally {
    for (const { signal, handler } of handlers) process.off(signal, handler);
    if (work.own) rmSync(work.path, { recursive: true, force: true });
  }
}
