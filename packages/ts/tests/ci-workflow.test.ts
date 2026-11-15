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
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';

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
  assert.deepEqual(withMatrix.map(([name]) => name), ['check', 'e2e']);
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

test('B2.278: make ci-e2e-amd64 is make ci-e2e of tests/e2e/sample (GN-14g)', (t) => {
  const { run } = recipes(t);
  const ran = run('ci-e2e-amd64', []);
  assert.equal(ran.status, 0, ran.output);
  assert.deepEqual(ran.calls.map((c) => [c.goal, c.vars]), [['ci-e2e', { REPO: 'tests/e2e/sample', DEPS: '' }]]);
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
