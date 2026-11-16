// GN-14i: make consumers-check DIRS="<dir>..." compiles the generated bindings of consumer repositories with the CLI and
// the binding_core of this tree, and reports a table of each consumer and target. For each directory it copies the
// committed tree of its checkout into a work directory of the run outside the checkout, makes the copy take this
// binding (scaffold, the path patch of polyspec-binding-core, the lock offline, the contract check), generates each
// target of the contract and checks each binding crate with its test features and without them, and the Go packages
// with the build tags of the generated files and without them. Every consumer and target runs to its end; the run
// writes the logs and report.json into var/report/consumers/<run>/ and fails when a cell failed. The steps and the
// table are in scripts/consumers.mts.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Contract, Lang } from '../packages/ts/src/contract.ts';
import { TARGETS, cargoSteps, consumerOf, crateManifest, firstErrors, generateStep, goModuleDir, goSteps, hasGoLink, lockedCores, expectedCommit, noteUnchecked, compiles, exitStatus, patchManifest, provenanceLine, provenanceProblem, stepsBeforeCheck, prepareSteps, table, testFeatures, type Cell, type Consumer, type Copy, type Step } from './consumers.mts';
import { goBuildTags } from './e2e-lint.mts';
import { llvmOf } from './e2e-llvm.mts';

const dirs: string[] = [];
const given = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i] ?? '';
  const value = process.argv[i + 1];
  if (!['--dir', '--expect', '--dist'].includes(key) || value === undefined) throw new Error(`unknown argument ${key}; the arguments are --dir <directory>... and --expect <commit> or --dist <directory>`);
  if (key === '--dir') dirs.push(value);
  else given.set(key, value);
}
if (dirs.length === 0) {
  process.stderr.write('usage: make consumers-check DIRS="<consumer checkout or package directory>..." [EXPECT=<commit> | DIST=<dist directory>]\n');
  process.exit(2);
}

const here = realpathSync(new URL('..', import.meta.url).pathname);
const cli = join(here, 'packages/ts/src/cli.ts');
// The run is evidence of one commit of binding: EXPECT, the commit of the MANIFEST.txt of DIST, or else the HEAD of the
// checkout that runs it. The CLI of this tree must be that commit, without a change, or the run stops before the
// first consumer.
const gitOut = (dir: string, argv: string[]): string => execFileSync('git', ['-C', dir, ...argv], { encoding: 'utf8' }).trim();
const head = gitOut(here, ['rev-parse', 'HEAD']);
const status = gitOut(here, ['status', '--porcelain', '--untracked-files=all']);
const expectGiven = given.get('--expect');
const dist = given.get('--dist');
const expected = expectedCommit(
  head,
  expectGiven === undefined || expectGiven === '' ? undefined : spawnSync('git', ['-C', here, 'rev-parse', '--verify', '--quiet', `${expectGiven}^{commit}`], { encoding: 'utf8' }).stdout.trim() || expectGiven,
  dist === undefined || dist === '' ? undefined : readFileSync(join(dist, 'MANIFEST.txt'), 'utf8'),
);
const problem = provenanceProblem(head, status, expected);
if (problem !== undefined) {
  process.stderr.write(`consumers-check: stopped before the first consumer: ${problem}\n`);
  process.exit(1);
}
const provenance = provenanceLine(head, status === '');
const core = join(here, 'packages/core/rust');
// The go of mise.toml, which mise.lock pins and var/tools holds; the mise.toml of this tree is trusted for this call
// alone, so the run changes no state of mise.
const goFound = execFileSync(join(here, 'var/tools/bin/mise'), ['which', 'go'], { encoding: 'utf8', env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: join(here, 'mise.toml') } }).trim();
const makeFound = spawnSync('sh', ['-c', 'command -v gmake || command -v make'], { encoding: 'utf8' }).stdout.trim().split('\n')[0] ?? 'make';
const goLink = hasGoLink(readFileSync(cli, 'utf8'));
const channel = /^channel = "([^"]+)"$/m.exec(readFileSync(join(here, 'rust-toolchain.toml'), 'utf8'))?.[1] ?? '';
const llvmMajor = (JSON.parse(readFileSync(join(here, 'config/toolchain.json'), 'utf8')) as { llvm: { version: string } }).llvm.version;
const llvm = llvmOf(process.platform, llvmMajor);
// The consumers run in parallel, and each cargo and go command takes its share of the processors, so the load of the
// machine stays near their count.
const cpus = availableParallelism();
const parallel = Math.min(dirs.length, Math.max(1, Math.round(cpus / 4)));
const jobs = Math.max(1, Math.floor(cpus / parallel));
const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\..*$/, '');
const report = join(here, 'var/report/consumers', stamp);
mkdirSync(report, { recursive: true });
const work = realpathSync(mkdtempSync(join(tmpdir(), 'binding-consumers-')));
const safe = (label: string): string => label.replaceAll('/', '__');
process.stdout.write(`consumers-check: ${String(dirs.length)} consumers, ${String(parallel)} at a time, -j ${String(jobs)}; the work directory ${work}; the report ${report}\n`);

// The environment of every command: nothing is fetched, the toolchain is that of rust-toolchain.toml of this tree, and
// the bindgen of the PHP target uses the LLVM of config/toolchain.json (scripts/e2e-llvm.mts).
const baseEnv: Record<string, string> = {
  CARGO_NET_OFFLINE: 'true',
  GOPROXY: 'off',
  GOTOOLCHAIN: 'local',
  RUSTUP_TOOLCHAIN: channel,
  ...(llvm === undefined ? {} : { LIBCLANG_PATH: llvm.libclang, CLANG_PATH: llvm.clang }),
};

interface Ran {
  status: number;
  // The output and the errors in the order written, and the output alone.
  output: string;
  stdout: string;
}

function exec(command: string, argv: string[], cwd: string, env: Record<string, string>, log: string): Promise<Ran> {
  return new Promise((done) => {
    const out = createWriteStream(log, { flags: 'a' });
    out.write(`\n$ ${command} ${argv.join(' ')}\n`);
    let output = '';
    let stdout = '';
    const child = spawn(command, argv, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const take = (chunk: Buffer): void => {
      output += chunk.toString();
      out.write(chunk);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      take(chunk);
    });
    child.stderr.on('data', take);
    child.on('error', (error) => {
      output += `${error.message}\n`;
    });
    child.on('close', (code) => {
      out.end(`(status ${String(code ?? 1)})\n`, () => done({ status: code ?? 1, output, stdout }));
    });
  });
}

// Runs the steps of a cell, each to its end unless `stop`, and gives the failed steps with their first error lines.
async function runSteps(steps: readonly Step[], copyDir: string, env: Record<string, string>, log: string, stop: boolean): Promise<Cell['failures']> {
  const failures: Cell['failures'] = [];
  const captured: Record<string, string> = {};
  for (const step of steps) {
    if ('failure' in step) {
      writeFileSync(log, `\n${step.what}: ${step.failure}\n`, { flag: 'a' });
      failures.push({ step: step.what, errors: [step.failure] });
    } else if ('write' in step) {
      try {
        step.write();
        writeFileSync(log, `\n${step.what}\n`, { flag: 'a' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeFileSync(log, `\n${step.what}: ${message}\n`, { flag: 'a' });
        failures.push({ step: step.what, errors: [message] });
      }
    } else {
      const ran = await exec(step.command, step.argv, step.cwd ?? copyDir, { ...env, ...captured, ...step.env }, log);
      if (ran.status === 0 && step.capture !== undefined) captured[step.capture] = ran.stdout.trim();
      if (ran.status !== 0) failures.push({ step: step.what, errors: firstErrors(ran.output.replaceAll(`${copyDir}/`, '')) });
    }
    if (stop && failures.length > 0) break;
  }
  return failures;
}

const goFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? goFiles(path) : name.endsWith('.go') ? [path] : [];
      })
    : [];

interface Connections {
  cargoTree: string;
  cli: string;
  goTags: string[];
}

async function checkConsumer(consumer: Consumer): Promise<{ cells: Cell[]; connections: Connections | undefined }> {
  const logs = join(report, safe(consumer.label));
  mkdirSync(logs, { recursive: true });
  const copyDir = join(work, safe(consumer.label));
  mkdirSync(copyDir, { recursive: true });
  const env = { ...baseEnv, CARGO_TARGET_DIR: join(copyDir, 'target') };
  const copy: Copy = { copy: copyDir, contract: consumer.contract, node: process.execPath, cli, core, go: goFound, make: makeFound, jobs };
  const prepareLog = join(logs, 'prepare.log');
  const cells: Cell[] = [];
  const prepare: Cell = { consumer: consumer.label, cell: 'prepare', state: 'passed', failures: [], log: prepareLog };
  cells.push(prepare);
  const fail = (cell: Cell, failures: Cell['failures']): void => {
    if (failures.length === 0) return;
    cell.state = 'failed';
    cell.failures.push(...failures);
  };

  // The committed tree, never the checkout itself.
  fail(prepare, await runSteps([{ what: 'git archive HEAD of the checkout', command: 'sh', argv: ['-c', 'git -C "$1" archive HEAD | tar -x -C "$2"', 'sh', consumer.checkout, copyDir] }], copyDir, env, prepareLog, true));
  const contractPath = join(copyDir, consumer.contract);
  if (prepare.state === 'passed' && !existsSync(contractPath)) fail(prepare, [{ step: 'the contract', errors: [`the committed tree has no ${consumer.contract} (L-1)`] }]);
  const contract = prepare.state === 'passed' ? (JSON.parse(readFileSync(contractPath, 'utf8')) as Contract) : undefined;
  const named = new Set<Lang>(contract?.targets ?? []);
  let checkFailed = false;
  if (contract !== undefined) {
    const manifest = join(copyDir, 'Cargo.toml');
    const patch = (): void => {
      if (!existsSync(manifest)) throw new Error('the repository has no root Cargo.toml (GN-4, L-2)');
      writeFileSync(manifest, patchManifest(readFileSync(manifest, 'utf8'), core));
    };
    const lock = join(copyDir, 'Cargo.lock');
    const makefile = join(copyDir, 'Makefile');
    let before: string[] = [];
    try {
      before = existsSync(makefile) ? stepsBeforeCheck(readFileSync(makefile, 'utf8')) : [];
    } catch (error) {
      fail(prepare, [{ step: 'the steps of the Makefile before bindings-check', errors: [error instanceof Error ? error.message : String(error)] }]);
    }
    const steps = prepareSteps(copy, existsSync(lock) ? lockedCores(readFileSync(lock, 'utf8')) : undefined, patch, before);
    const check = steps.at(-1);
    if (prepare.state === 'passed') fail(prepare, await runSteps(steps.slice(0, -1), copyDir, env, prepareLog, true));
    // A failed contract check fails the cell prepare, and the targets still generate and compile to their end (-k).
    if (prepare.state === 'passed' && check !== undefined) {
      const checkFailures = await runSteps([check], copyDir, env, prepareLog, true);
      fail(prepare, checkFailures);
      checkFailed = checkFailures.length > 0;
    }
  }
  const targetCells = new Map<Lang, Cell>();
  for (const t of TARGETS) {
    const cell: Cell = { consumer: consumer.label, cell: t, state: named.has(t) ? 'passed' : 'not in contract', failures: [], log: join(logs, `${t}.log`) };
    targetCells.set(t, cell);
    cells.push(cell);
    if (named.has(t) && prepare.state === 'failed' && !checkFailed) fail(cell, [{ step: 'prepare', errors: ['the copy could not take this binding; see the cell prepare'] }]);
  }
  if (contract === undefined || (prepare.state === 'failed' && !checkFailed)) return { cells, connections: undefined };
  if (checkFailed) noteUnchecked(cells);
  const live = TARGETS.filter((t) => named.has(t));
  for (const t of live) {
    const cell = targetCells.get(t);
    if (cell !== undefined) fail(cell, await runSteps([generateStep(copy, t)], copyDir, env, cell.log, true));
  }

  // The connections of the copy, before it compiles: the binding_core that Cargo resolves, the CLI and the Go tags.
  const tree = await exec('cargo', ['tree', '--manifest-path', join(copyDir, 'Cargo.toml'), '--workspace', '-i', 'polyspec-binding-core', '--offline', '-e', 'normal'], copyDir, env, prepareLog);
  const goTags = named.has('go') ? goBuildTags(goFiles(goModuleDir(copy, contract)).map((path) => readFileSync(path, 'utf8'))) : [];
  const connections: Connections = { cargoTree: tree.output.trim(), cli, goTags };
  writeFileSync(join(logs, 'connections.txt'), `cargo tree -i polyspec-binding-core:\n${connections.cargoTree}\n\nthe CLI: ${cli}\n\nthe Go build tags of the generated files: ${goTags.join(',') || '(none)'}\n`);
  if (tree.status !== 0 || !tree.output.includes(`(${core})`)) {
    fail(prepare, [{ step: 'cargo tree -i polyspec-binding-core', errors: [`the copy does not resolve polyspec-binding-core to ${core}`, ...firstErrors(tree.output)] }]);
  }

  for (const t of live) {
    const cell = targetCells.get(t);
    // A cell whose generate failed, a refusal of an unchecked contract among them, stops there.
    if (cell === undefined || !compiles(cell)) continue;
    const manifestPath = crateManifest(copy, contract, t);
    const features = existsSync(manifestPath) ? testFeatures(readFileSync(manifestPath, 'utf8')) : [];
    const steps: Step[] = existsSync(manifestPath) ? cargoSteps(copy, manifestPath, t, features) : [{ what: 'the binding crate', failure: `scaffold wrote no ${manifestPath.slice(copyDir.length + 1)}` }];
    if (t === 'go') steps.push(...goSteps(copy, contract, goLink, features, goTags));
    fail(cell, await runSteps(steps, copyDir, env, cell.log, false));
  }
  return { cells, connections };
}

async function pool<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      if (item !== undefined) results[i] = await fn(item);
    }
  }));
  return results;
}

// git rev-parse names the top of the checkout of each directory.
const consumers = dirs.map((dir) => {
  const absolute = realpathSync(resolve(dir));
  return consumerOf(realpathSync(execFileSync('git', ['-C', absolute, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()), absolute);
});

let results: Awaited<ReturnType<typeof checkConsumer>>[] = [];
try {
  results = await pool(consumers, parallel, async (consumer) => {
    process.stdout.write(`consumers-check: ${consumer.label} started\n`);
    const result = await checkConsumer(consumer);
    // The copy of a consumer is removed as soon as its cells end; the report and the logs stay in var/report/consumers.
    rmSync(join(work, safe(consumer.label)), { recursive: true, force: true });
    process.stdout.write(`consumers-check: ${consumer.label} ended\n`);
    return result;
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
const cells = results.flatMap((r) => r.cells);
const text = table(cells, provenance);
writeFileSync(join(report, 'table.txt'), `${text}\n`);
writeFileSync(join(report, 'report.json'), `${JSON.stringify({ provenance, commit: head, clean: status === '', binding: here, cli, core, goLink, jobs, parallel, consumers: consumers.map((c, i) => ({ ...c, connections: results[i]?.connections })), cells }, null, 2)}\n`);
process.stdout.write(`\n${text}\nthe report: ${report}\n`);
process.exit(exitStatus(cells));
