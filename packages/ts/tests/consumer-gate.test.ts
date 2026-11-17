// GN-14m, B2.494: the consumer gate of a release. The list of config/consumers.json, the matrix of the job consumers of
// .github/workflows/ci.yml that it gives, the patch of binding_core and the steps of a consumer are decided by
// scripts/consumer-gate.mts, which these tests read without a consumer and without the network.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BINDING_GIT, patchManifest } from '../../../scripts/consumers.mts';
import { OFFLINE, bindingVariables, cloneStep, consumersOf, gateStatus, gateSteps, gateTable, matrixOf, noCache, parseConsumers, rehearsalGoals, stops, updateSpecs, type Gate, type GateConsumer, type GateResult } from '../../../scripts/consumer-gate.mts';

const top = new URL('../../../', import.meta.url).pathname;
const tracked = readFileSync(`${top}config/consumers.json`, 'utf8');
const gate: Gate = { work: '/work', node: '/tools/node', cli: '/binding/packages/ts/dist/cli.js', core: '/binding/packages/core/rust', make: '/usr/bin/make', path: '/usr/bin:/bin' };
const json: GateConsumer = { repo: 'polyspec/json', tag: 'v0.0.36', job: 'small', install: ['install'] };
const list = (consumers: unknown[], pending: unknown[] = []): string => JSON.stringify({ consumers, pending });

test('B2.494: the tracked list names each consumer once at a release tag, and each pending consumer with its reason (GN-14m)', () => {
  const parsed = parseConsumers(tracked);
  assert.ok(parsed.consumers.length > 0, 'config/consumers.json names no consumer with a tag');
  for (const c of parsed.consumers) assert.match(c.tag, /^v\d+\.\d+\.\d+$/, `${c.repo} is not at a release tag`);
  const repos = [...parsed.consumers.map((c) => c.repo), ...parsed.pending.map((p) => p.repo)];
  assert.equal(new Set(repos).size, repos.length);
  // The eight small consumers share one job, and every other consumer has a job of its own.
  const byJob = new Map<string, string[]>();
  for (const entry of [...parsed.consumers, ...parsed.pending]) byJob.set(entry.job, [...(byJob.get(entry.job) ?? []), entry.repo]);
  assert.deepEqual(byJob.get('small')?.map((r) => r.replace('polyspec/', '')).sort(), ['fsm', 'http-cookie', 'http-form', 'http-media-type', 'http-negotiation', 'json', 'php-serialization', 'session-store']);
  for (const [job, repos] of byJob) if (job !== 'small') assert.deepEqual(repos, [`polyspec/${job}`], `the job ${job} holds ${repos.join(', ')}, where a job other than small holds its own consumer alone`);
  assert.deepEqual([...byJob.keys()].sort(), ['crud-ui', 'hyper', 'orm', 'small', 'template']);
});

test('B2.494: the list refuses a tag that is no release tag, a repository named twice, an unknown key and a pending consumer without a reason (GN-14m)', () => {
  assert.throws(() => parseConsumers(list([{ ...json, tag: 'main' }])), /tag "main" of polyspec\/json is not a release tag vX\.Y\.Z/);
  assert.throws(() => parseConsumers(list([{ ...json, tag: 'v1/rust-core' }])), /is not a release tag/);
  assert.throws(() => parseConsumers(list([json, { ...json, tag: 'v0.0.35' }])), /polyspec\/json is named twice/);
  assert.throws(() => parseConsumers(list([json], [{ repo: 'polyspec/json', job: 'small', reason: 'x' }])), /polyspec\/json is named twice/);
  assert.throws(() => parseConsumers(list([{ ...json, branch: 'main' }])), /the key branch is not one of repo, tag, job, install, path/);
  assert.throws(() => parseConsumers(list([json], [{ repo: 'polyspec/orm', job: 'orm', reason: ' ' }])), /polyspec\/orm has no reason/);
  assert.throws(() => parseConsumers(list([{ ...json, repo: 'json' }])), /repo "json" is not <owner>\/<name>/);
  assert.throws(() => parseConsumers(list([{ ...json, install: [] }])), /install of polyspec\/json is not a list of goals/);
  assert.throws(() => parseConsumers(list([{ ...json, job: 'Small' }])), /job "Small" is not a name/);
  // A consumer without install installs with its goal install.
  assert.deepEqual(parseConsumers(list([{ repo: json.repo, tag: json.tag, job: json.job }])).consumers, [json]);
});

// The rows of the matrix of the job consumers of ci.yml, each `- job: <name>` at ten spaces.
function workflowMatrix(): { job: string }[] {
  const lines = readFileSync(`${top}.github/workflows/ci.yml`, 'utf8').split('\n').filter((line) => !/^\s*#/.test(line));
  const start = lines.indexOf('  consumers:');
  assert.ok(start >= 0, 'ci.yml has no job consumers');
  const end = lines.findIndex((line, i) => i > start && /^ {2}[a-z][a-z0-9-]*:$/.test(line));
  return lines.slice(start, end).flatMap((line) => {
    const job = /^ {10}- job: ([a-z][a-z0-9-]*)$/.exec(line)?.[1];
    return job === undefined ? [] : [{ job }];
  });
}

test('B2.494: the matrix of the job consumers is the jobs of the consumers with a tag, in the order of the list (GN-14m)', () => {
  const parsed = parseConsumers(tracked);
  assert.deepEqual(workflowMatrix(), matrixOf(parsed), 'the matrix of the job consumers of ci.yml is not the jobs of config/consumers.json');
  // A job whose consumers are all pending has no entry, and one gets its entry with its first tag.
  assert.deepEqual(matrixOf(parseConsumers(list([json, { ...json, repo: 'polyspec/hyper', job: 'hyper' }, { ...json, repo: 'polyspec/fsm' }], [{ repo: 'polyspec/orm', job: 'orm', reason: 'no tag' }]))), [{ job: 'small' }, { job: 'hyper' }]);
  assert.throws(() => consumersOf(parsed, 'orm'), /names no consumer with a tag in the job orm/);
  const workflow = readFileSync(`${top}.github/workflows/ci.yml`, 'utf8');
  assert.ok(!/actions\/cache@/.test(workflow), 'a job of ci.yml restores a cache');
  assert.match(workflow, /needs: \[[^\]]*\bconsumers\b[^\]]*\]/, 'ci-passed does not need the job consumers, so a failed consumer does not block release.yml');
});

test('B2.494: the patch gives polyspec-binding-core of the run by a path and refuses a manifest that already patches binding (GN-14d, GN-14m)', () => {
  const manifest = '[workspace]\nmembers = ["packages/rust"]\n';
  const patched = patchManifest(manifest, gate.core);
  assert.equal(patched, `${manifest}\n[patch."${BINDING_GIT}"]\npolyspec-binding-core = { path = "${gate.core}" }\n`);
  assert.throws(() => patchManifest(patched, gate.core), /already has \[patch\."https:\/\/github\.com\/polyspec\/binding\.git"\]/);
  assert.deepEqual(updateSpecs(['0.0.20']), ['-p', 'polyspec-binding-core']);
  assert.deepEqual(updateSpecs(['0.0.17', '0.0.20']), ['-p', 'polyspec-binding-core@0.0.17', '-p', 'polyspec-binding-core@0.0.20']);
});

test('B2.494: a consumer clones its tag, fetches its lock, takes the patch, then runs its own goals: install, bindings and test-bindings offline, and the rehearsal with no cache (GN-14m)', () => {
  const clone = cloneStep(gate, json);
  assert.deepEqual('argv' in clone.step ? clone.step.argv : [], ['clone', '--quiet', '--depth', '1', '--branch', 'v0.0.36', 'https://github.com/polyspec/json.git', '/work/json']);
  let patched = 0;
  const steps = gateSteps(gate, json, ['0.0.20'], ['php', 'python', 'node', 'go', 'wasm'], () => { patched += 1; });
  assert.deepEqual(steps.map((s) => [s.phase, s.step.what]), [
    ['prepare', 'rustup toolchain install of the rust-toolchain.toml of the consumer'],
    ['prepare', 'cargo fetch --locked'],
    ['prepare', 'the path patch of polyspec-binding-core to /binding/packages/core/rust'],
    ['prepare', 'cargo update -p polyspec-binding-core --offline'],
    ['prepare', 'binding scaffold of the run'],
    ['prepare', 'make install of the consumer'],
    ['generate', 'make bindings of the consumer'],
    ['test', 'make test-bindings of the consumer'],
    ['rehearsal', 'make release-recipes of the consumer'],
    ['rehearsal', 'make release-go-static release-wheel release-php-ext of the consumer'],
    ['rehearsal', 'make rehearse-go-module TAG=v0.0.36 of the consumer'],
  ]);
  // B2.494: the first cargo of a clone runs under the toolchain of its rust-toolchain.toml, which the runner does not
  // have, so the toolchain of the clone is installed first, by rustup in the clone, where it reads that file.
  const toolchain = steps[0]?.step;
  assert.deepEqual(toolchain !== undefined && 'argv' in toolchain ? [toolchain.command, toolchain.argv, toolchain.cwd] : [], ['rustup', ['toolchain', 'install'], '/work/json']);
  const patch = steps[2]?.step;
  if (patch !== undefined && 'write' in patch) patch.write();
  assert.equal(patched, 1);
  const commands = steps.flatMap((s) => ('argv' in s.step ? [{ phase: s.phase, ...s.step }] : []));
  // Every goal of make is the consumer's own, run in its clone with the CLI of the run.
  for (const c of commands.filter((c) => c.command === gate.make)) {
    assert.deepEqual(c.argv.slice(0, 2), ['-C', '/work/json']);
    for (const variable of bindingVariables(gate)) assert.ok(c.argv.includes(variable), `${c.what} does not run the CLI of the run: ${variable}`);
  }
  assert.deepEqual(bindingVariables(gate), ['BINDING=/binding/packages/ts/dist/cli.js', 'BINDING_RUN=/tools/node /binding/packages/ts/dist/cli.js', 'NODE=/tools/node']);
  for (const c of commands.filter((c) => c.phase === 'generate' || c.phase === 'test')) assert.deepEqual(c.env, OFFLINE, `${c.what} is not offline`);
  for (const c of commands.filter((c) => c.phase === 'rehearsal')) {
    assert.deepEqual(c.env, noCache('/work/json'), `${c.what} reads a cache`);
    assert.equal(c.env?.['GOFLAGS'], '-mod=readonly');
    assert.equal(c.env?.['GOWORK'], 'off', `${c.what} builds a Go module through the go.work of its repository`);
  }
  assert.ok(commands.find((c) => c.what.startsWith('cargo update'))?.argv.includes('--offline'));
  // A consumer whose goal install is missing names its install goals; a contract without go has no Go rehearsal.
  const own = gateSteps(gate, { ...json, install: ['install-rust', 'install-tools'] }, [], ['php', 'node'], () => {});
  assert.ok(own.some((s) => s.step.what === 'make install-rust install-tools of the consumer'));
  assert.ok(!own.some((s) => s.step.what.includes('rehearse-go-module')));
  assert.deepEqual(rehearsalGoals(['node', 'wasm']), []);
  // The directories of path come first on the PATH of every goal of the consumer, as its own CI puts them there.
  const withPath = gateSteps(gate, { ...json, path: ['var/tools/bay'] }, [], ['php'], () => {});
  for (const s of withPath.filter((s) => 'command' in s.step && s.step.command === gate.make)) assert.equal('env' in s.step ? s.step.env?.['PATH'] : undefined, '/work/json/var/tools/bay:/usr/bin:/bin', `${s.step.what} does not have the path of the consumer`);
  assert.throws(() => parseConsumers(list([{ ...json, path: ['../out'] }])), /path of polyspec\/json is not a list of directories inside its clone/);
  assert.throws(() => parseConsumers(list([{ ...json, path: ['/usr/bin'] }])), /is not a list of directories inside its clone/);
  assert.ok(stops('prepare') && stops('generate') && !stops('test') && !stops('rehearsal'));
});

test('B2.494: the table names each consumer with its tag and phases, each failure and its log, and the job fails when a phase did not pass (GN-14m)', () => {
  const passed: GateResult = { consumer: 'json', tag: 'v0.0.36', phases: { prepare: 'passed', generate: 'passed', test: 'passed', rehearsal: 'passed' }, failures: [], log: '/r/json.log' };
  const failed: GateResult = { consumer: 'http-form', tag: 'v0.0.2', phases: { prepare: 'passed', generate: 'failed', test: 'not run', rehearsal: 'not run' }, failures: [{ step: 'make bindings of the consumer', errors: ['binding: refused'] }], log: '/r/http-form.log' };
  const text = gateTable([passed, failed], 'binding x (clean)');
  const lines = text.split('\n');
  assert.equal(lines[0], 'binding x (clean)');
  assert.match(lines[2] ?? '', /^json@v0\.0\.36\s+passed\s+passed\s+passed\s+passed$/);
  assert.match(lines[3] ?? '', /^http-form@v0\.0\.2\s+passed\s+failed\s+not run\s+not run$/);
  assert.ok(text.includes('http-form@v0.0.2: failed (log /r/http-form.log)\n  make bindings of the consumer\n    binding: refused'));
  assert.equal(lines.at(-1), 'failed: http-form');
  assert.equal(gateStatus([passed]), 0);
  assert.equal(gateStatus([passed, failed]), 1);
  assert.equal(gateTable([passed], 'b').split('\n').at(-1), 'passed: every consumer');
});
