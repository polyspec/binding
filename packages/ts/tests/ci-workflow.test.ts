// AGENTS.md: the rules of .github/workflows/ci.yml, read from its text. Every job runs on ubuntu-26.04-arm (e2e-amd64 on
// ubuntu-26.04), pins each
// action by its commit, sets no timeout-minutes and runs every command of a step as one make target; a job of a matrix
// runs every step after its first past a failed step; the job e2e runs the end-to-end check of every repository of
// tests/e2e with the repositories that its core depends on, and uploads its record; a repository whose core depends on
// a repository that tests/e2e does not hold is in tests/e2e/not-in-ci.json and not in the job (GN-14g); ci-passed needs
// every other job.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

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

test('every job runs on ubuntu-26.04-arm, except e2e-amd64 on ubuntu-26.04, pins its actions by commit, has no time limit and runs one make target per step (AGENTS, GN-14g)', () => {
  const all = jobs();
  assert.ok(all.size > 0, 'the workflow has no job');
  assert.ok(!workflow.includes('timeout-minutes'), 'the workflow sets timeout-minutes');
  for (const [name, job] of all) {
    const runner = name === 'e2e-amd64' ? 'ubuntu-26.04' : 'ubuntu-26.04-arm';
    assert.deepEqual(job.filter((l) => /^\s+runs-on:/.test(l)).map((l) => l.trim()), [`runs-on: ${runner}`], `the job ${name} does not run on ${runner} alone`);
    for (const line of job) {
      const uses = /^\s+(?:- )?uses: (\S+)/.exec(line)?.[1];
      if (uses !== undefined && !uses.startsWith('./')) assert.match(uses, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `the job ${name} does not pin ${uses} by its commit`);
      const run = /^\s+(?:- )?run: (.*)$/.exec(line)?.[1];
      if (run !== undefined) assert.match(run, /^make [a-z][a-z0-9-]*( [A-Z_]+=("[^"]*"|'[^']*'|(\$\{\{[^}]*\}\}|[^\s"'$;&|<>])+))*$/, `the job ${name} runs something other than one make target: ${run}`);
    }
    assert.ok(!job.some((l) => /^\s+(?:- )?run: [|>]/.test(l)), `the job ${name} runs a script of several lines`);
  }
});

test('a job of a matrix runs every step after its first past a failed step (AGENTS)', () => {
  const withMatrix = [...jobs()].filter(([, job]) => job.includes('      matrix:'));
  assert.deepEqual(withMatrix.map(([name]) => name), ['check', 'e2e']);
  for (const [name, job] of withMatrix) {
    assert.ok(job.includes('      fail-fast: false'), `the matrix of ${name} cancels its other entries after a failure`);
    const all = steps(job);
    assert.ok(all.length > 1, `the job ${name} has no steps`);
    for (const step of all.slice(1)) assert.ok(step.some((l) => l.trim() === 'if: ${{ !cancelled() }}'), `a step of ${name} after the first does not run past a failed step: ${step[0] ?? ''}`);
  }
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
  // GN-14g, GN-15g: the released form of each Go module also links and runs on musl, in a container of the runner.
  assert.deepEqual(runs, ['make install-tools', 'make e2e REPO=${{ matrix.repo }} DEPS="${{ matrix.deps }}" WORK=${{ runner.temp }}/e2e', 'make go-musl-check WORK=${{ runner.temp }}/e2e']);
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
  assert.deepEqual(runs, ['make install-tools', 'make e2e REPO=tests/e2e/sample WORK=${{ runner.temp }}/e2e', 'make go-musl-check WORK=${{ runner.temp }}/e2e']);
  for (const step of all.slice(1)) assert.ok(step.some((l) => l.trim() === 'if: ${{ !cancelled() }}'), `a step of e2e-amd64 after the first does not run past a failed step: ${step[0] ?? ''}`);
  const upload = all.find((step) => step.some((l) => l.includes('uses: actions/upload-artifact@')));
  assert.ok(upload?.some((l) => l.trim() === 'path: var/report/e2e/') === true, 'the job e2e-amd64 does not upload var/report/e2e/');
});

// B2.246: kit wraps the php of the PATH of the runner as it is (install-tools), and the PHP of ubuntu-26.04 is not the
// minor of .php-version, so a job that runs the PHP target sets up the PHP of .php-version before it installs its tools.
test('every job that runs the end-to-end check sets up the PHP of .php-version before its tools, with the extensions that the PHPUnit of config/phpunit requires (GN-14, HR-81, B2.246)', () => {
  const withE2e = [...jobs()].filter(([, job]) => job.some((l) => /^\s+(?:- )?run: make e2e /.test(l)));
  assert.deepEqual(withE2e.map(([name]) => name).sort(), ['e2e', 'e2e-amd64']);
  for (const [name, job] of withE2e) {
    const all = steps(job);
    const php = all.findIndex((step) => step.some((l) => /^\s+(?:- )?uses: shivammathur\/setup-php@[0-9a-f]{40}( #.*)?$/.test(l)));
    const tools = all.findIndex((step) => step.some((l) => l.trim() === 'run: make install-tools'));
    assert.ok(php >= 0, `the job ${name} sets up no PHP, so var/tools/bin/php wraps the PHP of the runner`);
    assert.ok(php < tools, `the job ${name} sets up PHP after make install-tools, which wraps the php of the PATH`);
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
