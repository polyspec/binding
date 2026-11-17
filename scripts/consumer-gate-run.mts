// GN-14m: make consumer-gate JOB=<job> [WORK=<directory>] runs the consumers of one job of config/consumers.json with the
// CLI and the binding_core of this tree: for each consumer, one after the other, it clones the release tag, patches
// polyspec-binding-core to this tree, and runs the consumer's own goals for its install, generate, the generated tests
// of its targets offline and the release rehearsal with no cache. Every consumer runs to its end; the run writes a log
// for each consumer, table.txt and report.json into var/report/consumer-gate/<job>/ and fails when a phase of a
// consumer did not pass. The list, the steps and the table are in scripts/consumer-gate.mts.

import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { firstErrors, lockedCores, patchManifest } from './consumers.mts';
import { cloneStep, consumerDir, consumersOf, gateStatus, gateSteps, gateTable, nameOf, parseConsumers, stops, type Gate, type GateResult, type GateStep } from './consumer-gate.mts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i] ?? '';
  const value = process.argv[i + 1];
  if (!['--job', '--work'].includes(key) || value === undefined) throw new Error(`unknown argument ${key}; the arguments are --job <job> and --work <directory>`);
  args.set(key, value);
}
const job = args.get('--job');
if (job === undefined || job === '') {
  process.stderr.write('usage: make consumer-gate JOB=<job of config/consumers.json> [WORK=<directory>]\n');
  process.exit(2);
}

const here = realpathSync(new URL('..', import.meta.url).pathname);
const list = parseConsumers(readFileSync(join(here, 'config/consumers.json'), 'utf8'));
const consumers = consumersOf(list, job);
const cli = join(here, 'packages/ts/dist/cli.js');
if (!existsSync(cli)) {
  process.stderr.write(`consumer-gate: ${cli} is missing; make dist builds it (GN-14j)\n`);
  process.exit(2);
}
const head = execFileSync('git', ['-C', here, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const clean = execFileSync('git', ['-C', here, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim() === '';
const provenance = `binding ${head} (${clean ? 'clean' : 'with uncommitted changes'}): each consumer at its release tag with the CLI and the binding_core of this tree`;
const makeFound = spawnSync('sh', ['-c', 'command -v gmake || command -v make'], { encoding: 'utf8' }).stdout.trim().split('\n')[0] ?? 'make';
const work = args.get('--work') ?? realpathSync(mkdtempSync(join(tmpdir(), 'binding-consumer-gate-')));
mkdirSync(work, { recursive: true });
const gate: Gate = { work, node: process.execPath, cli, core: join(here, 'packages/core/rust'), make: makeFound };
const report = join(here, 'var/report/consumer-gate', job);
rmSync(report, { recursive: true, force: true });
mkdirSync(report, { recursive: true });
process.stdout.write(`consumer-gate: the job ${job}, ${String(consumers.length)} consumers; the work directory ${work}; the report ${report}\n${provenance}\n`);

// Runs one step into the log of its consumer and gives its first error lines when it failed.
function run(entry: GateStep, log: string, cwd: string): string[] | undefined {
  const { step } = entry;
  process.stdout.write(`  ${entry.phase}: ${step.what}\n`);
  if ('failure' in step) return [step.failure];
  if ('write' in step) {
    try {
      step.write();
      writeFileSync(log, `\n${step.what}\n`, { flag: 'a' });
      return undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeFileSync(log, `\n${step.what}: ${message}\n`, { flag: 'a' });
      return [message];
    }
  }
  writeFileSync(log, `\n$ ${step.command} ${step.argv.join(' ')}\n`, { flag: 'a' });
  const start = readFileSync(log, 'utf8').length;
  const fd = openSync(log, 'a');
  const ran = spawnSync(step.command, step.argv, { cwd: step.cwd ?? cwd, env: { ...process.env, ...step.env }, stdio: ['ignore', fd, fd] });
  writeSync(fd, `(status ${String(ran.status ?? 1)})\n`);
  closeSync(fd);
  if (ran.status === 0) return undefined;
  return firstErrors(`${readFileSync(log, 'utf8').slice(start)}${ran.error === undefined ? '' : `\n${ran.error.message}`}`);
}

const results: GateResult[] = [];
for (const consumer of consumers) {
  const name = nameOf(consumer.repo);
  const log = join(report, `${name}.log`);
  writeFileSync(log, `${provenance}\n${consumer.repo} ${consumer.tag}\n`);
  process.stdout.write(`${consumer.repo} ${consumer.tag}\n`);
  const result: GateResult = { consumer: name, tag: consumer.tag, phases: { prepare: 'not run', generate: 'not run', test: 'not run', rehearsal: 'not run' }, failures: [], log };
  results.push(result);
  const dir = consumerDir(gate, consumer);
  rmSync(dir, { recursive: true, force: true });
  const failed = (entry: GateStep, errors: string[]): void => {
    result.phases[entry.phase] = 'failed';
    result.failures.push({ step: entry.step.what, errors });
  };
  const clone = cloneStep(gate, consumer);
  const cloneErrors = run(clone, log, work);
  if (cloneErrors !== undefined) {
    failed(clone, cloneErrors);
    continue;
  }
  const lockPath = join(dir, 'Cargo.lock');
  const locked = existsSync(lockPath) ? lockedCores(readFileSync(lockPath, 'utf8')) : [];
  const contractPath = join(dir, 'packages/rust/interface.json');
  const targets = existsSync(contractPath) ? ((JSON.parse(readFileSync(contractPath, 'utf8')) as { targets?: string[] }).targets ?? []) : [];
  const manifestPath = join(dir, 'Cargo.toml');
  const patch = (): void => writeFileSync(manifestPath, patchManifest(readFileSync(manifestPath, 'utf8'), gate.core));
  let stopped = false;
  for (const entry of [clone, ...gateSteps(gate, consumer, locked, targets, patch)]) {
    if (stopped) break;
    if (entry !== clone) {
      const errors = run(entry, log, dir);
      if (errors !== undefined) {
        failed(entry, errors);
        if (stops(entry.phase)) stopped = true;
      }
    }
    if (result.phases[entry.phase] !== 'failed') result.phases[entry.phase] = 'passed';
  }
  rmSync(dir, { recursive: true, force: true });
}

const text = gateTable(results, provenance);
writeFileSync(join(report, 'table.txt'), `${text}\n`);
writeFileSync(join(report, 'report.json'), `${JSON.stringify({ job, binding: head, clean, results }, null, 2)}\n`);
process.stdout.write(`\n${text}\n`);
process.exit(gateStatus(results));
