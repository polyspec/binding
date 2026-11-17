// AGENTS.md: the rules of .github/workflows/ci.yml, read from its text. Every job runs on ubuntu-26.04-arm (e2e-amd64 on
// ubuntu-26.04), pins each action by its commit and sets no timeout-minutes. Every job has exactly one run step, make
// ci-<job> with make variables only, whose values are literal or a value of the matrix, and ci-passed alone passes
// toJSON(needs); every other step is a uses step that provisions the runner or carries a result, and only a uses step
// has a condition. The recipes ci-<job> of the Makefile hold the order and the conditions of each job, which a run of
// the recipe with a stand-in of make shows. The job e2e runs the end-to-end check of every repository of tests/e2e with
// the repositories that its core depends on, and uploads its record; a repository whose core depends on a repository
// that tests/e2e does not hold is in tests/e2e/not-in-ci.json and not in the job (GN-14g); ci-passed needs every other
// job.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { namedByPath } from '../../../scripts/e2e-release-form.mts';
import { candidateVersion } from '../../../scripts/release-candidate-version.mts';

const top = new URL('../../../', import.meta.url).pathname;
const workflow = readFileSync(`${top}.github/workflows/ci.yml`, 'utf8');
const lines = workflow.split('\n').filter((line) => !/^\s*#/.test(line));

// The jobs of the workflow, each with its lines: a job is a key at two spaces below `jobs:`.
function jobs(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of lines.slice(lines.indexOf('jobs:') + 1)) {
    const name = /^ {2}([a-z][a-z0-9-]*):$/.exec(line)?.[1];
    if (name !== undefined) {
      current = [];
      found.set(name, current);
    } else if (current !== undefined) current.push(line);
  }
  return found;
}

// The steps of a job, each with its lines: a step starts with `- ` at six spaces.
function steps(job: string[]): string[][] {
  const found: string[][] = [];
  for (const line of job.slice(job.findIndex((l) => l === '    steps:') + 1)) {
    if (line.startsWith('      - ')) found.push([line]);
    else found.at(-1)?.push(line);
  }
  return found;
}

// The entries of the matrix of a job, each as its keys and values.
function matrix(job: string[]): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  const start = job.findIndex((l) => l === '        include:');
  for (const line of start < 0 ? [] : job.slice(start + 1)) {
    const item = /^ {10}(- | {2})([a-z]+): (.*)$/.exec(line);
    if (item === null) break;
    if (item[1] === '- ') found.push({});
    const entry = found.at(-1);
    if (entry !== undefined) entry[item[2] ?? ''] = (item[3] ?? '').replace(/^"(.*)"$/, '$1');
  }
  return found;
}

// GN-14g: the repositories of tests/e2e that the job e2e does not run, each with its reason and the condition that ends
// it.
function notInCi(): { contract: string; reason: string; until: string }[] {
  const list = JSON.parse(readFileSync(`${top}tests/e2e/not-in-ci.json`, 'utf8')) as { contracts: { contract: string; reason: string; until: string }[] };
  for (const entry of list.contracts) assert.deepEqual(Object.keys(entry).sort(), ['contract', 'reason', 'until'], 'an entry of tests/e2e/not-in-ci.json names its contract, its reason and its until');
  return list.contracts;
}

// The command of a run line, and the steps of a job that are no uses step.
const runOf = (step: string[]): string | undefined => step.map((l) => /^\s+(?:- )?run: (.*)$/.exec(l)?.[1]).find((r) => r !== undefined);
const usesOf = (step: string[]): string | undefined => step.map((l) => /^\s+(?:- )?uses: (\S+)/.exec(l)?.[1]).find((u) => u !== undefined);
const conditionOf = (step: string[]): string | undefined => step.map((l) => /^ {8}(?:- )?if: (.*)$/.exec(l)?.[1] ?? /^ {6}- if: (.*)$/.exec(l)?.[1]).find((c) => c !== undefined);

test('every job runs on ubuntu-26.04-arm, except e2e-amd64 on ubuntu-26.04, pins its actions by commit and has no time limit (AGENTS, GN-14g)', () => {
  const all = jobs();
  assert.ok(all.size > 0, 'the workflow has no job');
  assert.ok(!workflow.includes('timeout-minutes'), 'the workflow sets timeout-minutes');
  for (const [name, job] of all) {
    const runner = name === 'e2e-amd64' ? 'ubuntu-26.04' : 'ubuntu-26.04-arm';
    assert.deepEqual(job.filter((l) => /^\s+runs-on:/.test(l)).map((l) => l.trim()), [`runs-on: ${runner}`], `the job ${name} does not run on ${runner} alone`);
    for (const line of job) {
      const uses = /^\s+(?:- )?uses: (\S+)/.exec(line)?.[1];
      if (uses !== undefined && !uses.startsWith('./')) assert.match(uses, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `the job ${name} does not pin ${uses} by its commit`);
    }
  }
});

// B2.278: a job of CI is one recipe of the Makefile, so a local run of make ci-<job> is the run of the job. A value of
// the matrix is the one expression of a run line, and toJSON(needs) of ci-passed, the judgement of the other jobs that
// exists only in CI, the other one; every other step provisions the runner or carries a result.
const VALUE = String.raw`("[^"$]*"|'[^'$]*'|[^\s"'$;&|<>]*|"\$\{\{ matrix\.[a-z]+ \}\}"|\$\{\{ matrix\.[a-z]+ \}\})`;
const PROVISION = [/^actions\/checkout@/, /^\.\/\.github\/actions\/bootstrap$/, /^[\w.-]+\/setup-[\w.-]+@/, /^actions\/upload-artifact@/];
test('every job has one run step, make ci-<job> with make variables whose values are literal or of the matrix, and every other step is a uses step that provisions or carries a result (AGENTS, B2.278)', () => {
  const all = jobs();
  for (const [name, job] of all) {
    const own = steps(job);
    assert.ok(!job.some((l) => /^\s+(?:- )?run: [|>]/.test(l)), `the job ${name} runs a script of several lines`);
    const runs = own.filter((step) => runOf(step) !== undefined);
    assert.equal(runs.length, 1, `the job ${name} has ${runs.length} run steps; a job runs one recipe, make ci-${name}`);
    const run = runOf(runs[0] ?? []) ?? '';
    const pattern = name === 'ci-passed'
      ? new RegExp(String.raw`^make ci-passed RESULTS='\$\{\{ toJSON\(needs\) \}\}'( [A-Z_]+=("[^"$]*"|'[^'$]*'|[^\s"'$;&|<>]*))*$`)
      : new RegExp(String.raw`^make ci-${name}( [A-Z_]+=${VALUE})*$`);
    assert.match(run, pattern, `the job ${name} runs something other than make ci-${name} with literal or matrix values: ${run}`);
    assert.equal(conditionOf(runs[0] ?? []), undefined, `the run step of the job ${name} has a condition; the recipe holds the conditions of the job`);
    assert.ok(!(runs[0] ?? []).some((l) => /^ {8}env:/.test(l)), `the run step of the job ${name} sets an environment; the recipe computes what it needs`);
    for (const step of own.filter((s) => runOf(s) === undefined)) {
      const uses = usesOf(step);
      assert.ok(uses !== undefined, `a step of the job ${name} neither runs make ci-${name} nor uses an action: ${step[0] ?? ''}`);
      assert.ok(PROVISION.some((p) => p.test(uses)), `the job ${name} uses ${uses}, which neither provisions the runner nor carries a result`);
    }
  }
});

// HR-86: an upload of the report runs after a failed run step, so a failed job keeps its report.
test('every upload of a job runs after a failed step (AGENTS, HR-86)', () => {
  for (const [name, job] of jobs()) {
    for (const step of steps(job).filter((s) => usesOf(s)?.startsWith('actions/upload-artifact@') === true)) {
      assert.equal(conditionOf(step), '${{ !cancelled() }}', `the upload of the job ${name} does not run after a failed step`);
      assert.ok(step.some((l) => l.trim() === 'if-no-files-found: error'), `the upload of the job ${name} passes without a report`);
    }
  }
  const withMatrix = [...jobs()].filter(([, job]) => job.includes('      matrix:'));
  assert.deepEqual(withMatrix.map(([name]) => name), ['check', 'e2e', 'consumers']);
  for (const [name, job] of withMatrix) assert.ok(job.includes('      fail-fast: false'), `the matrix of ${name} cancels its other entries after a failure`);
});

// B2.278: the recipes of the jobs, run on a copy of the Makefile with a stand-in of make, which records each call with
// its goal, its variables, CI_STEPS and whether WORK is a directory, and fails the goals of FAIL.
interface Call { goal: string; vars: Record<string, string>; ciSteps: string; workIsDirectory: boolean; tag: string }
function recipes(t: TestContext): { run: (goal: string, vars: string[], fail?: string[], tag?: string) => { status: number | null; output: string; calls: Call[] }; temp: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'binding-ci-recipe-')));
  t.after(() => { rmSync(root, { recursive: true, force: true }); });
  copyFileSync(`${top}Makefile`, join(root, 'Makefile'));
  const stand = join(root, 'make-stand-in.cjs');
  const calls = join(root, '.calls');
  writeFileSync(stand, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const goal = args.find((a) => !a.startsWith('-') && !a.includes('=')) ?? '';
const vars = Object.fromEntries(args.filter((a) => /^[A-Z_]+=/.test(a)).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
const workIsDirectory = vars.WORK !== undefined && fs.existsSync(vars.WORK) && fs.statSync(vars.WORK).isDirectory();
if (goal === 'release-tag' && process.env.WRITE_TAG && process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, 'TAG=' + process.env.WRITE_TAG + '\\nVERSION=0.0.1\\n');
fs.appendFileSync(process.env.CALLS, JSON.stringify({ goal, vars, ciSteps: process.env.CI_STEPS ?? '', workIsDirectory, tag: process.env.TAG ?? '' }) + '\\n');
process.exit((process.env.FAIL ?? '').split(' ').includes(goal) ? 1 : 0);
`);
  chmodSync(stand, 0o755);
  const temp = join(root, 'tmp');
  const run = (goal: string, vars: string[], fail: string[] = [], tag = ''): { status: number | null; output: string; calls: Call[] } => {
    writeFileSync(calls, '');
    rmSync(temp, { recursive: true, force: true });
    mkdirSync(temp);
    const ran = spawnSync('make', ['--no-print-directory', '-C', root, goal, `MAKE=${stand}`, ...vars], { env: { PATH: '/usr/bin:/bin', CALLS: calls, FAIL: fail.join(' '), WRITE_TAG: tag, TMPDIR: temp, HOME: root }, encoding: 'utf8' });
    const recorded = readFileSync(calls, 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as Call);
    return { status: ran.status, output: `${ran.stdout}${ran.stderr}`, calls: recorded };
  };
  return { run, temp };
}

// B2.447: make install is the one command of a new checkout or worktree (AGENTS.md). install-tools TOOLS=npm runs the
// bootstrap of @polyspec/kit from node_modules, which a new checkout does not hold, so install runs bootstrap first
// there and only there.
test('B2.447: make install runs bootstrap first in a checkout whose node_modules holds no bootstrap of kit, and no bootstrap in one that holds it', (t) => {
  const { run, temp } = recipes(t);
  const steps = (calls: Call[]): string[] => calls.map((c) => (c.vars.TOOLS === undefined ? c.goal : `${c.goal} TOOLS=${c.vars.TOOLS}`));
  const fresh = run('install', []);
  assert.equal(fresh.status, 0, fresh.output);
  assert.deepEqual(steps(fresh.calls), ['bootstrap', 'install-tools TOOLS=npm', 'install-packages', 'install-tools'], fresh.output);
  // A failed bootstrap stops the install before the step that needs it.
  const failed = run('install', [], ['bootstrap']);
  assert.notEqual(failed.status, 0, 'make install passes after a failed bootstrap');
  assert.deepEqual(steps(failed.calls), ['bootstrap'], failed.output);
  const kit = join(temp, '..', 'node_modules/@polyspec/kit/dist/bootstrap');
  mkdirSync(kit, { recursive: true });
  writeFileSync(join(kit, 'bootstrap.mjs'), '');
  const installed = run('install', []);
  assert.equal(installed.status, 0, installed.output);
  assert.deepEqual(steps(installed.calls), ['install-tools TOOLS=npm', 'install-packages', 'install-tools'], installed.output);
});

test('B2.278: make ci-check installs its tools, stops at a failed install, runs its targets and writes the summary in every case with the outcome of the install', (t) => {
  const { run } = recipes(t);
  const vars = ['NAME=ts', 'TOOLS=rust', 'TARGETS=typecheck-ts unit-ts'];
  const goals = (calls: Call[]): string[] => calls.map((c) => c.goal);

  const passed = run('ci-check', vars);
  assert.equal(passed.status, 0, passed.output);
  assert.deepEqual(goals(passed.calls), ['install-tools', 'ci-targets', 'ci-summary'], passed.output);
  assert.deepEqual(passed.calls[0]?.vars, { TOOLS: 'rust' });
  assert.deepEqual(passed.calls[1]?.vars, { TARGETS: 'typecheck-ts unit-ts', CI_REPORT: 'var/ci/ts' });
  assert.deepEqual(passed.calls[2]?.vars, { CI_REPORT: 'var/ci/ts' });
  assert.deepEqual(JSON.parse(passed.calls[2]?.ciSteps ?? ''), { tools: { outcome: 'success' } });

  const checkFailed = run('ci-check', vars, ['ci-targets']);
  assert.notEqual(checkFailed.status, 0, 'make ci-check passes after a failed check');
  assert.deepEqual(goals(checkFailed.calls), ['install-tools', 'ci-targets', 'ci-summary'], checkFailed.output);

  const installFailed = run('ci-check', vars, ['install-tools']);
  assert.notEqual(installFailed.status, 0, 'make ci-check passes after a failed install');
  assert.deepEqual(goals(installFailed.calls), ['install-tools', 'ci-summary'], 'make ci-check runs its targets after a failed install, or writes no summary');
  assert.deepEqual(JSON.parse(installFailed.calls[1]?.ciSteps ?? ''), { tools: { outcome: 'failure' } });

  const summaryFailed = run('ci-check', vars, ['ci-summary']);
  assert.notEqual(summaryFailed.status, 0, 'make ci-check passes when its summary could not be written');

  const usage = run('ci-check', ['TOOLS=rust']);
  assert.equal(usage.status, 2, usage.output);
  assert.deepEqual(usage.calls, []);
});

test('B2.278: make ci-e2e installs every tool, stops at a failed install, runs go-musl-check only after a passed e2e on the same work directory and removes that directory in every case (GN-14f, GN-15g, HR-87)', (t) => {
  const { run, temp } = recipes(t);
  const vars = ['REPO=tests/e2e/plot', 'DEPS=tests/e2e/points'];
  const goals = (calls: Call[]): string[] => calls.map((c) => c.goal);
  const leftOver = (): string[] => readdirSync(temp);

  const passed = run('ci-e2e', vars);
  assert.equal(passed.status, 0, passed.output);
  assert.deepEqual(goals(passed.calls), ['install-tools', 'e2e', 'go-musl-check'], passed.output);
  assert.deepEqual(passed.calls[0]?.vars, {});
  const [, e2e, musl] = passed.calls;
  assert.equal(e2e?.vars['REPO'], 'tests/e2e/plot');
  assert.equal(e2e?.vars['DEPS'], 'tests/e2e/points');
  assert.ok(e2e?.workIsDirectory === true && musl?.workIsDirectory === true, 'make e2e or make go-musl-check gets no work directory');
  assert.equal(e2e?.vars['WORK'], musl?.vars['WORK'], 'make go-musl-check reads another work directory than make e2e wrote');
  assert.ok((e2e?.vars['WORK'] ?? '').startsWith(`${temp}/`), 'the work directory is not under the temporary directory of the system');
  assert.deepEqual(leftOver(), [], 'make ci-e2e leaves its work directory');

  const e2eFailed = run('ci-e2e', vars, ['e2e']);
  assert.notEqual(e2eFailed.status, 0, 'make ci-e2e passes after a failed e2e');
  assert.deepEqual(goals(e2eFailed.calls), ['install-tools', 'e2e'], 'make ci-e2e runs go-musl-check after a failed e2e');
  assert.deepEqual(leftOver(), [], 'make ci-e2e leaves its work directory after a failed e2e');

  const muslFailed = run('ci-e2e', vars, ['go-musl-check']);
  assert.notEqual(muslFailed.status, 0, 'make ci-e2e passes after a failed go-musl-check');
  assert.deepEqual(leftOver(), []);

  const installFailed = run('ci-e2e', vars, ['install-tools']);
  assert.notEqual(installFailed.status, 0, 'make ci-e2e passes after a failed install');
  assert.deepEqual(goals(installFailed.calls), ['install-tools'], 'make ci-e2e runs its checks after a failed install');

  const usage = run('ci-e2e', []);
  assert.equal(usage.status, 2, usage.output);
  assert.deepEqual(usage.calls, []);
});

test('B2.417: make ci-e2e runs no go-musl-check for a refusal fixture, whose run makes no released form, and still fails its failed e2e (GN-14k, GN-14g)', (t) => {
  const { run, temp } = recipes(t);
  const fixture = join(temp, '..', 'tests/e2e/lent');
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, 'refused.json'), '{}\n');
  const goals = (calls: Call[]): string[] => calls.map((c) => c.goal);

  const passed = run('ci-e2e', ['REPO=tests/e2e/lent']);
  assert.equal(passed.status, 0, passed.output);
  assert.deepEqual(goals(passed.calls), ['install-tools', 'e2e'], passed.output);
  assert.match(passed.output, /ci-e2e: tests\/e2e\/lent is a refusal fixture \(refused\.json\), whose run makes no released form of a Go module, so go-musl-check does not run \(GN-14k\)/);

  const failed = run('ci-e2e', ['REPO=tests/e2e/lent'], ['e2e']);
  assert.notEqual(failed.status, 0, 'make ci-e2e passes after a failed e2e of a refusal fixture');
  assert.deepEqual(goals(failed.calls), ['install-tools', 'e2e']);
});

test('B2.278: make ci-e2e-amd64 is make ci-e2e of tests/e2e/sample (GN-14g)', (t) => {
  const { run } = recipes(t);
  const ran = run('ci-e2e-amd64', []);
  assert.equal(ran.status, 0, ran.output);
  assert.deepEqual(ran.calls.map((c) => [c.goal, c.vars]), [['ci-e2e', { REPO: 'tests/e2e/sample', DEPS: '' }]]);
});

test('B2.494: make ci-consumers builds dist, stops at a failed build, runs consumer-gate of JOB in a work directory of its own and removes it in every case (GN-14m, HR-87)', (t) => {
  const { run, temp } = recipes(t);
  const passed = run('ci-consumers', ['JOB=small']);
  assert.equal(passed.status, 0, passed.output);
  assert.deepEqual(passed.calls.map((c) => c.goal), ['dist', 'consumer-gate'], passed.output);
  const gate = passed.calls[1];
  assert.equal(gate?.vars['JOB'], 'small');
  assert.ok(gate?.workIsDirectory === true && (gate.vars['WORK'] ?? '').startsWith(`${temp}/`), 'make consumer-gate gets no work directory under the temporary directory');
  assert.deepEqual(readdirSync(temp), [], 'make ci-consumers leaves its work directory');

  const gateFailed = run('ci-consumers', ['JOB=small'], ['consumer-gate']);
  assert.notEqual(gateFailed.status, 0, 'make ci-consumers passes after a failed consumer-gate');
  assert.deepEqual(readdirSync(temp), [], 'make ci-consumers leaves its work directory after a failure');

  const distFailed = run('ci-consumers', ['JOB=small'], ['dist']);
  assert.notEqual(distFailed.status, 0, 'make ci-consumers passes after a failed build of dist');
  assert.deepEqual(distFailed.calls.map((c) => c.goal), ['dist'], 'make ci-consumers runs the consumers without the CLI of the run');

  const usage = run('ci-consumers', []);
  assert.equal(usage.status, 2, usage.output);
  assert.deepEqual(usage.calls, []);
});

test('the job e2e runs the end-to-end check of every repository of tests/e2e that waits for no other repository and uploads its record (GN-14, GN-14f, GN-14g)', () => {
  const job = jobs().get('e2e');
  assert.ok(job !== undefined, 'the workflow has no job e2e');
  const entries = matrix(job);
  // A repository of tests/e2e is a directory with a root Cargo.toml; the repositories that its core depends on by a
  // path are the DEPS of its run.
  const repositories = readdirSync(`${top}tests/e2e`).filter((name) => existsSync(`${top}tests/e2e/${name}/Cargo.toml`)).sort();
  assert.ok(repositories.includes('sample') && repositories.includes('plot'), 'tests/e2e holds no sample or no plot');
  const depsOf = (name: string): string[] =>
    [...readFileSync(`${top}tests/e2e/${name}/packages/rust/Cargo.toml`, 'utf8').matchAll(/path = "\.\.\/\.\.\/\.\.\/([a-z0-9-]+)\/packages\/rust"/g)].map((m) => `tests/e2e/${m[1] ?? ''}`).sort();
  // GN-14g: a repository whose core names by a path a repository that tests/e2e does not hold waits for a release tag
  // of that repository, and the list of the repositories that the job does not run names it; every other one is run.
  const waiting = repositories.filter((name) => depsOf(name).some((dep) => !existsSync(`${top}${dep}/Cargo.toml`)));
  const listed = notInCi();
  assert.deepEqual(listed.map((e) => e.contract).sort(), waiting.map((name) => `tests/e2e/${name}`).sort(),
    'tests/e2e/not-in-ci.json lists exactly the repositories whose core depends on a repository that tests/e2e does not hold: one that is not listed is run by no entry, and a listed one whose condition ended has no entry yet');
  for (const entry of listed) {
    assert.ok(entry.reason.trim() !== '', `${entry.contract} of tests/e2e/not-in-ci.json states no reason`);
    assert.ok(entry.until.trim() !== '', `${entry.contract} of tests/e2e/not-in-ci.json states no condition that ends it`);
  }
  // Every other repository has its own run, except points, which holds the record that plot names and is built by the
  // run of plot as its dependency (GN-14).
  const wanted = repositories.filter((name) => name !== 'points' && !waiting.includes(name));
  assert.ok(wanted.length > 0, 'no repository of tests/e2e is run');
  assert.ok(repositories.flatMap(depsOf).includes('tests/e2e/points'), 'no repository of tests/e2e depends on points, so it needs its own run');
  assert.deepEqual(entries.map((e) => e['repo']).sort(), wanted.map((name) => `tests/e2e/${name}`).sort());
  for (const entry of entries) {
    const name = (entry['repo'] ?? '').replace('tests/e2e/', '');
    assert.equal(entry['name'], name);
    for (const directory of [entry['repo'] ?? '', ...(entry['deps'] ?? '').split(' ').filter((d) => d !== '')]) assert.ok(existsSync(`${top}${directory}/Cargo.toml`), `the entry ${name} names ${directory}, which is no repository of this checkout`);
    assert.deepEqual((entry['deps'] ?? '').split(' ').filter((d) => d !== '').sort(), depsOf(name), `the entry ${name} does not name the repositories that its core depends on`);
  }
  const all = steps(job);
  const runs = all.flatMap((step) => step.map((l) => /^\s+(?:- )?run: (.*)$/.exec(l)?.[1]).filter((r) => r !== undefined));
  // GN-14g, GN-15g: make ci-e2e runs the end-to-end check and then the released form of each Go module on musl, in a
  // container of the runner.
  assert.deepEqual(runs, ['make ci-e2e REPO=${{ matrix.repo }} DEPS="${{ matrix.deps }}"']);
  const upload = all.find((step) => step.some((l) => l.includes('uses: actions/upload-artifact@')));
  assert.ok(upload !== undefined, 'the job e2e uploads no artifact');
  assert.ok(upload.some((l) => l.trim() === 'path: var/report/e2e/'), 'the job e2e does not upload var/report/e2e/');
  assert.ok(upload.some((l) => l.trim() === 'if-no-files-found: error'), 'the job e2e passes without a record');
});

// GN-14g: a release carries the libraries of linux_amd64 and linux_amd64_musl, which only an amd64 machine links and
// runs, so one job runs the sample and its consumer on musl there.
// GN-14l: a run writes and installs the release form when a core of its repository names a repository of DEPS by a
// path and no contract has a host package; no option turns the steps on or off, so an entry of the job runs them by
// what its repository is.
test('B2.458: at least one entry of the job e2e runs the release form, by a core that names a repository of its DEPS by a path (GN-14l, GN-14g)', () => {
  const contractOf = (repository: string): { core: { crate: string; path: string }; packages: Record<string, { host?: boolean }> } =>
    JSON.parse(readFileSync(`${top}${repository}/packages/rust/interface.json`, 'utf8')) as { core: { crate: string; path: string }; packages: Record<string, { host?: boolean }> };
  const runs = matrix(jobs().get('e2e') ?? []).filter((entry) => {
    const deps = (entry['deps'] ?? '').split(' ').filter((dep) => dep !== '');
    const contract = contractOf(entry['repo'] ?? '');
    const named = namedByPath(readFileSync(`${top}${entry['repo'] ?? ''}/${contract.core.path}/Cargo.toml`, 'utf8'), deps.map((dep) => contractOf(dep).core.crate));
    return named.length > 0 && !Object.values(contract.packages).some((p) => p.host === true);
  }).map((entry) => entry['repo']);
  assert.ok(runs.length > 0, 'no entry of the job e2e runs the release form (GN-14l): no core of its repositories names a repository of its DEPS by a path');
  assert.ok(runs.includes('tests/e2e/consumer'), `the entry of tests/e2e/consumer, whose package.json names the npm package of the sample, does not run the release form: ${runs.join(', ')}`);
  // The run decides by the same reading, and by no option.
  const script = readFileSync(`${top}scripts/e2e.mts`, 'utf8');
  assert.match(script, /const pathNamed = mains\.flatMap\(\(p\) => namedByPath\(readFileSync\(coreManifestOf\(p\), 'utf8'\), dependencies\.map\(\(d\) => d\.contract\.core\.crate\)\)\);/);
  assert.match(script, /const releaseForm = pathNamed\.length > 0 && hosts\.length === 0 && until !== 'lint';\n/);
  assert.match(script, /\nif \(releaseForm\) \{\n/);
  assert.match(script, /const options = \['--binding', '--repo', '--work', '--checkout', '--until'\];/);
});

test('the job e2e-amd64 runs the end-to-end check of the sample and its consumer on musl on linux/amd64 (GN-14g, GN-15g)', () => {
  const job = jobs().get('e2e-amd64');
  assert.ok(job !== undefined, 'the workflow has no job e2e-amd64');
  const all = steps(job);
  const runs = all.flatMap((step) => step.map((l) => /^\s+(?:- )?run: (.*)$/.exec(l)?.[1]).filter((r) => r !== undefined));
  assert.deepEqual(runs, ['make ci-e2e-amd64']);
  const upload = all.find((step) => step.some((l) => l.includes('uses: actions/upload-artifact@')));
  assert.ok(upload?.some((l) => l.trim() === 'path: var/report/e2e/') === true, 'the job e2e-amd64 does not upload var/report/e2e/');
});

// B2.246: kit wraps the php of the PATH of the runner as it is (install-tools), and the PHP of ubuntu-26.04 is not the
// minor of .php-version, so a job that runs the PHP target sets up the PHP of .php-version before it installs its tools.
test('every job that runs the end-to-end check sets up the PHP of .php-version before its tools, with the extensions that the PHPUnit of config/phpunit requires (GN-14, HR-81, B2.246)', () => {
  const withE2e = [...jobs()].filter(([, job]) => job.some((l) => /^\s+(?:- )?run: make ci-e2e/.test(l)));
  assert.deepEqual(withE2e.map(([name]) => name).sort(), ['e2e', 'e2e-amd64']);
  for (const [name, job] of withE2e) {
    const all = steps(job);
    const php = all.findIndex((step) => step.some((l) => /^\s+(?:- )?uses: shivammathur\/setup-php@[0-9a-f]{40}( #.*)?$/.test(l)));
    const tools = all.findIndex((step) => runOf(step) !== undefined);
    assert.ok(php >= 0, `the job ${name} sets up no PHP, so var/tools/bin/php wraps the PHP of the runner`);
    assert.ok(php < tools, `the job ${name} sets up PHP after its run step, whose make install-tools wraps the php of the PATH`);
    const step = (all[php] ?? []).map((l) => l.trim());
    assert.ok(step.includes('php-version-file: .php-version'), `the PHP of the job ${name} is not the one of .php-version`);
    const extensions = step.find((l) => l.startsWith('extensions: '))?.slice('extensions: '.length).split(',').map((e) => e.trim()) ?? [];
    for (const extension of ['dom', 'filter', 'json', 'libxml', 'mbstring', 'phar', 'tokenizer', 'xmlwriter']) assert.ok(extensions.includes(extension), `the PHP of the job ${name} does not name the extension ${extension} that PHPUnit requires`);
    assert.ok(step.includes('tools: none'), `the PHP of the job ${name} installs tools that the checkout does not pin`);
  }
});

test('ci-passed needs every other job and runs after a failed one (AGENTS)', () => {
  const all = jobs();
  const last = all.get('ci-passed');
  assert.ok(last !== undefined, 'the workflow has no job ci-passed');
  const needs = /^ {4}needs: \[(.*)\]$/.exec(last.find((l) => l.startsWith('    needs:')) ?? '')?.[1]?.split(',').map((n) => n.trim()).sort();
  assert.deepEqual(needs, [...all.keys()].filter((name) => name !== 'ci-passed').sort());
  assert.ok(last.includes('    if: ${{ always() }}'), 'ci-passed does not run after a failed job');
});

// B2.278: the release workflow is one job with one run step, make ci-release, which reads the id of the CI run and AUTO
// from the environment of the job; every other step provisions the runner.
test('B2.278: the job release has one run step, make ci-release, and its other steps are uses steps', () => {
  const release = readFileSync(`${top}.github/workflows/release.yml`, 'utf8').split('\n').filter((line) => !/^\s*#/.test(line));
  const job = release.slice(release.indexOf('jobs:') + 2);
  const own = steps(job);
  const runs = own.filter((step) => runOf(step) !== undefined);
  assert.deepEqual(runs.map((step) => runOf(step)), ['make ci-release']);
  assert.ok(job.includes('      RUN: ${{ inputs.run || github.event.workflow_run.id }}'), 'the job release gives no RUN in its environment');
  assert.ok(job.includes("      AUTO: ${{ github.event_name == 'workflow_run' && '1' || '' }}"), 'the job release gives no AUTO in its environment');
  for (const step of own) {
    assert.equal(conditionOf(step), undefined, `a step of the job release has a condition: ${step[0] ?? ''}`);
    if (runOf(step) === undefined) assert.ok(PROVISION.some((p) => p.test(usesOf(step) ?? '')), `the job release has a step that neither runs make ci-release nor provisions the runner: ${step[0] ?? ''}`);
  }
});

test('B2.278: make ci-release tags, then checks the tag out, installs, builds, publishes and undrafts, each after the one before passed, and stops without a tag', (t) => {
  const { run } = recipes(t);
  const goals = (calls: Call[]): string[] => calls.map((c) => c.goal);
  // Without a tag written to GITHUB_ENV, release-tag released nothing.
  const none = run('ci-release', ['RUN=7']);
  assert.equal(none.status, 0, none.output);
  assert.deepEqual(goals(none.calls), ['release-tag']);
  assert.deepEqual(none.calls[0]?.vars, { RUN: '7', AUTO: '' });
  const failed = run('ci-release', ['RUN=7', 'AUTO=1'], ['release-tag']);
  assert.notEqual(failed.status, 0, 'make ci-release passes after a failed release-tag');
  assert.deepEqual(goals(failed.calls), ['release-tag']);
  const order = ['release-tag', 'release-checkout', 'bootstrap', 'install-tools', 'release-prepare', 'release-tools', 'release-assets', 'release-publish', 'release-undraft'];
  const tagged = run('ci-release', ['RUN=7', 'AUTO=1'], [], 'v0.0.1');
  assert.equal(tagged.status, 0, tagged.output);
  assert.deepEqual(goals(tagged.calls), order, tagged.output);
  for (const goal of ['release-checkout', 'release-assets', 'release-publish', 'release-undraft']) assert.equal(tagged.calls.find((c) => c.goal === goal)?.tag, 'v0.0.1', `${goal} gets no TAG`);
  const assetsFailed = run('ci-release', ['RUN=7'], ['release-assets'], 'v0.0.1');
  assert.notEqual(assetsFailed.status, 0, 'make ci-release passes after failed assets');
  assert.deepEqual(goals(assetsFailed.calls), order.slice(0, order.indexOf('release-assets') + 1), 'make ci-release publishes after failed assets');
  const usage = run('ci-release', []);
  assert.notEqual(usage.status, 0);
  assert.deepEqual(usage.calls, []);
});

// B2.364, GN-14j: make dist builds packages/ts with the npm of the checkout and gives the bin dist/cli.js the mode 0755,
// which tsc does not give it, so a consumer that links this checkout runs node_modules/.bin/binding. The stand-in of npm
// writes dist/cli.js with the mode 0644 of tsc and records its arguments.
test('B2.364: make dist runs the build of packages/ts and makes the bin dist/cli.js executable', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'binding-dist-')));
  t.after(() => { rmSync(root, { recursive: true, force: true }); });
  copyFileSync(`${top}Makefile`, join(root, 'Makefile'));
  const calls = join(root, '.calls');
  const npm = join(root, 'npm-stand-in.cjs');
  writeFileSync(npm, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
const prefix = args[args.indexOf('--prefix') + 1];
fs.mkdirSync(path.join(prefix, 'dist'), { recursive: true });
fs.writeFileSync(path.join(prefix, 'dist', 'cli.js'), '#!/usr/bin/env node\\n', { mode: 0o644 });
`);
  chmodSync(npm, 0o755);
  writeFileSync(calls, '');
  const ran = spawnSync('make', ['--no-print-directory', '-C', root, 'dist', `NPM=${npm}`], { env: { PATH: '/usr/bin:/bin', CALLS: calls }, encoding: 'utf8' });
  assert.equal(ran.status, 0, `${ran.stdout}${ran.stderr}`);
  assert.deepEqual(readFileSync(calls, 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as string[]), [['run', '--prefix', 'packages/ts', 'build']]);
  assert.equal(statSync(join(root, 'packages', 'ts', 'dist', 'cli.js')).mode & 0o777, 0o755);
});

// B2.455: the release creates the tag before it builds the archive, so make release-candidate-assets runs the archive
// steps of kit on the committed HEAD with no tag, and the entry ts of the job check runs it. The recipe runs on a copy
// of the Makefile with a stand-in of node, which records its arguments and RELEASE_ASSETS and prints 9.8.7 as
// scripts/release-candidate-version.mts.
test('B2.455: make release-candidate-assets calls candidate-assets of kit with an asset folder of its own, for VERSION of the command line or else the version of the change log', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'binding-candidate-')));
  t.after(() => { rmSync(root, { recursive: true, force: true }); });
  copyFileSync(`${top}Makefile`, join(root, 'Makefile'));
  const calls = join(root, '.calls');
  const node = join(root, 'node-stand-in.cjs');
  writeFileSync(node, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify({ args, assets: process.env.RELEASE_ASSETS ?? '' }) + '\\n');
if (args[0] === 'scripts/release-candidate-version.mts') {
  if (process.env.NO_VERSION) { process.stderr.write('no section\\n'); process.exit(1); }
  process.stdout.write('9.8.7\\n');
}
`);
  chmodSync(node, 0o755);
  const run = (vars: string[], env: Record<string, string> = {}): { status: number | null; output: string; calls: { args: string[]; assets: string }[] } => {
    writeFileSync(calls, '');
    const ran = spawnSync('make', ['--no-print-directory', '-C', root, 'release-candidate-assets', `NODE=${node}`, ...vars], { env: { PATH: '/usr/bin:/bin', CALLS: calls, ...env }, encoding: 'utf8' });
    return { status: ran.status, output: `${ran.stdout}${ran.stderr}`, calls: readFileSync(calls, 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as { args: string[]; assets: string }) };
  };
  const kit = join(root, 'node_modules', '@polyspec', 'kit', 'dist', 'release.mjs');
  const folder = 'var/release-candidate/assets';
  // B2.505: after kit packs, the CLI of the tree checks the sizes of the archives of the folder (GN-19g).
  const sizes = { args: ['packages/ts/src/cli.ts', 'asset-sizes', '--step', 'release-candidate-assets', folder], assets: '' };

  // Without VERSION the version is the one that the script reads from the change log, and the script gets no asset folder.
  const top0 = run([]);
  assert.equal(top0.status, 0, top0.output);
  assert.deepEqual(top0.calls, [{ args: ['scripts/release-candidate-version.mts'], assets: '' }, { args: [kit, 'candidate-assets', '9.8.7'], assets: folder }, sizes]);
  // A VERSION of the command line wins, and the change log is not read.
  const given = run(['VERSION=1.2.3']);
  assert.equal(given.status, 0, given.output);
  assert.deepEqual(given.calls, [{ args: [kit, 'candidate-assets', '1.2.3'], assets: folder }, sizes]);
  // A VERSION of the environment alone is not the version.
  const fromEnvironment = run([], { VERSION: '4.5.6' });
  assert.equal(fromEnvironment.status, 0, fromEnvironment.output);
  assert.deepEqual(fromEnvironment.calls.at(-2), { args: [kit, 'candidate-assets', '9.8.7'], assets: folder });
  // A change log without a version stops the recipe before kit packs.
  const none = run([], { NO_VERSION: '1' });
  assert.notEqual(none.status, 0, 'make release-candidate-assets passes without a version');
  assert.deepEqual(none.calls.map((c) => c.args), [['scripts/release-candidate-version.mts']]);
  // The asset folder is not that of release-assets, whose archives release-publish uploads.
  const makefile = readFileSync(`${top}Makefile`, 'utf8');
  assert.ok(makefile.includes('RELEASE_ASSETS=var/release/assets '), 'release-assets no longer names var/release/assets');
});

// B2.505: every asset of the release of binding is built after the tag (release-tag, release-checkout, release-assets),
// so release-candidate-assets, which CI runs before any tag, ends with the check of the sizes of GN-19g. The stand-in of
// node packs the archives that EMPTY names empty, and runs the CLI of the tree for the check.
test('B2.505: make release-candidate-assets fails on an empty archive at its end, naming it, before any tag (GN-19g)', (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'binding-candidate-sizes-')));
  t.after(() => { rmSync(root, { recursive: true, force: true }); });
  copyFileSync(`${top}Makefile`, join(root, 'Makefile'));
  const node = join(root, 'node-stand-in.cjs');
  writeFileSync(node, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === 'packages/ts/src/cli.ts') {
  const ran = require('node:child_process').spawnSync(${JSON.stringify(process.execPath)}, [path.join(${JSON.stringify(top)}, args[0]), ...args.slice(1)], { stdio: 'inherit' });
  process.exit(ran.status ?? 1);
}
if (args[1] === 'candidate-assets') {
  fs.mkdirSync(process.env.RELEASE_ASSETS, { recursive: true });
  fs.writeFileSync(path.join(process.env.RELEASE_ASSETS, 'binding-' + args[2] + '.tgz'), process.env.EMPTY ? '' : 'archive');
}
`);
  chmodSync(node, 0o755);
  const run = (env: Record<string, string>): { status: number | null; output: string } => {
    const ran = spawnSync('make', ['--no-print-directory', '-C', root, 'release-candidate-assets', `NODE=${node}`, 'VERSION=1.2.3'], { env: { PATH: '/usr/bin:/bin', ...env }, encoding: 'utf8' });
    return { status: ran.status, output: `${ran.stdout}${ran.stderr}` };
  };
  const packed = run({});
  assert.equal(packed.status, 0, packed.output);
  const empty = run({ EMPTY: '1' });
  assert.equal(empty.status, 2, `release-candidate-assets passes with an empty archive: ${empty.output}`);
  assert.match(empty.output, /release-candidate-assets: var\/release-candidate\/assets\/binding-1\.2\.3\.tgz is empty, and GitHub takes no empty asset/);
});

test('B2.455: the entry ts of the job check runs release-candidate-assets after its other targets, and no entry gives it a VERSION', () => {
  const check = jobs().get('check') ?? [];
  const entries = matrix(check);
  const ts = entries.find((entry) => entry.name === 'ts');
  // It refuses a checkout with an untracked path, so it is the last target: a file that an earlier target left fails it.
  assert.deepEqual(ts?.targets?.split(' '), ['typecheck-ts', 'unit-ts', 'release-coverage', 'release-candidate-assets']);
  assert.deepEqual(entries.filter((entry) => (entry.targets ?? '').split(' ').includes('release-candidate-assets')).map((entry) => entry.name), ['ts']);
  assert.ok(!check.some((line) => /VERSION=/.test(line)), 'the job check gives a VERSION; the target reads the version of the change log');
});

// B2.455: the version of the candidate is the top section ## X.Y.Z of the change log of this checkout, which the
// functions of kit read as release-tag reads it, also under ## Unreleased with entries; it is the version of the
// manifest that the archive is named by, on a version commit and on every other commit.
test('B2.455: the version of the candidate is the top version of CHANGELOG.md and the version of packages/ts/package.json', () => {
  const version = candidateVersion(top);
  const headings = readFileSync(`${top}CHANGELOG.md`, 'utf8').split('\n').filter((line) => line.startsWith('## '));
  assert.equal(headings[0], '## Unreleased');
  assert.equal(headings[1], `## ${version}`);
  assert.equal((JSON.parse(readFileSync(`${top}packages/ts/package.json`, 'utf8')) as { version: string }).version, version);
});
