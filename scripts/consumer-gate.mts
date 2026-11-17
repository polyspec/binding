// GN-14m: the consumer gate of a release of binding, which make consumer-gate JOB=<job> runs with
// scripts/consumer-gate-run.mts and the job consumers of .github/workflows/ci.yml runs for each job of the list. This
// module holds what the run decides, so its tests read it without a consumer: the list of config/consumers.json, the
// matrix of the job, and the steps of a consumer in their order. Each step past the patch is a goal of the consumer's
// own Makefile; binding gives it only the CLI and the binding_core of the run.

import { join } from 'node:path';
import type { Step } from './consumers.mts';

// A consumer of the list: a GitHub repository at a release tag, the job of the matrix that runs it, and the goals of
// its Makefile that install what its steps need.
export interface GateConsumer {
  repo: string;
  tag: string;
  job: string;
  install: string[];
}

// A consumer with no release tag on a layout of binding yet, the job that will run it, and why it waits.
export interface PendingConsumer {
  repo: string;
  job: string;
  reason: string;
}

export interface ConsumerList {
  consumers: GateConsumer[];
  pending: PendingConsumer[];
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG = /^v\d+\.\d+\.\d+$/;
const JOB = /^[a-z][a-z0-9-]*$/;
const GOAL = /^[A-Za-z0-9_.-]+$/;

// The list of config/consumers.json. A repository is named once, in consumers or in pending; a tag is a release tag
// vX.Y.Z, never a branch or a commit, since a tag is the fixed input that a consumer released.
export function parseConsumers(text: string): ConsumerList {
  const data = JSON.parse(text) as Record<string, unknown>;
  const problems: string[] = [];
  const seen = new Set<string>();
  const named = (repo: unknown, where: string): string => {
    if (typeof repo !== 'string' || !REPO.test(repo)) {
      problems.push(`${where}: repo ${JSON.stringify(repo)} is not <owner>/<name>`);
      return '';
    }
    if (seen.has(repo)) problems.push(`${where}: ${repo} is named twice`);
    seen.add(repo);
    return repo;
  };
  const job = (value: unknown, where: string): string => {
    if (typeof value !== 'string' || !JOB.test(value)) problems.push(`${where}: job ${JSON.stringify(value)} is not a name of lower case letters, digits and -`);
    return typeof value === 'string' ? value : '';
  };
  const keys = (entry: Record<string, unknown>, allowed: readonly string[], where: string): void => {
    for (const key of Object.keys(entry)) if (!allowed.includes(key)) problems.push(`${where}: the key ${key} is not one of ${allowed.join(', ')}`);
  };
  const consumers = (Array.isArray(data['consumers']) ? data['consumers'] : []).map((raw: unknown, i): GateConsumer => {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const where = `consumers[${i}]`;
    keys(entry, ['repo', 'tag', 'job', 'install'], where);
    const repo = named(entry['repo'], where);
    const tag = entry['tag'];
    if (typeof tag !== 'string' || !TAG.test(tag)) problems.push(`${where}: tag ${JSON.stringify(tag)} of ${repo} is not a release tag vX.Y.Z`);
    const install = entry['install'] ?? ['install'];
    if (!Array.isArray(install) || install.length === 0 || !install.every((goal) => typeof goal === 'string' && GOAL.test(goal))) problems.push(`${where}: install of ${repo} is not a list of goals of make`);
    return { repo, tag: typeof tag === 'string' ? tag : '', job: job(entry['job'], where), install: Array.isArray(install) ? (install as string[]) : [] };
  });
  const pending = (Array.isArray(data['pending']) ? data['pending'] : []).map((raw: unknown, i): PendingConsumer => {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const where = `pending[${i}]`;
    keys(entry, ['repo', 'job', 'reason'], where);
    const repo = named(entry['repo'], where);
    const reason = entry['reason'];
    if (typeof reason !== 'string' || reason.trim() === '') problems.push(`${where}: ${repo} has no reason`);
    return { repo, job: job(entry['job'], where), reason: typeof reason === 'string' ? reason : '' };
  });
  if (!Array.isArray(data['consumers'])) problems.push('consumers is not a list');
  if (problems.length > 0) throw new Error(`config/consumers.json: ${problems.join('; ')}`);
  return { consumers, pending };
}

// The matrix of the job consumers: one entry for each job of the consumers that have a tag, in the order of their
// first consumer. A job whose consumers are all pending has no entry, since it would run nothing.
export const matrixOf = (list: ConsumerList): { job: string }[] => [...new Set(list.consumers.map((c) => c.job))].map((job) => ({ job }));

export function consumersOf(list: ConsumerList, job: string): GateConsumer[] {
  const found = list.consumers.filter((c) => c.job === job);
  if (found.length === 0) throw new Error(`config/consumers.json names no consumer with a tag in the job ${job}; the jobs are ${matrixOf(list).map((m) => m.job).join(', ')}`);
  return found;
}

export const nameOf = (repo: string): string => repo.split('/').pop() ?? repo;

// The run of a consumer: its directory under the work directory, the node and the built CLI of the run (dist/cli.js,
// executable, GN-14j), the binding_core of the run, and the make and cargo that run the consumer's steps.
export interface Gate {
  work: string;
  node: string;
  cli: string;
  core: string;
  make: string;
}

// The phases of a consumer in their order. prepare clones and patches, with the network; generate writes the
// bindings; test runs the generated tests of the five runtimes offline; rehearsal runs the release recipes of the run
// with no cache. A failed step of prepare or generate stops the consumer, since every later step reads what they
// write; test and rehearsal each run to their end.
export type Phase = 'prepare' | 'generate' | 'test' | 'rehearsal';
export interface GateStep {
  phase: Phase;
  step: Step;
}

// What every offline step gets: no Cargo, Go, npm, uv or pip fetch.
export const OFFLINE: Record<string, string> = { CARGO_NET_OFFLINE: 'true', GOPROXY: 'off', GOFLAGS: '-mod=readonly', npm_config_offline: 'true', UV_OFFLINE: '1', PIP_NO_INDEX: '1' };

// What every step of the rehearsal gets: a Go build cache of its own, empty, no incremental build and no compiler
// wrapper, and -mod=readonly with no go.work, so each Go module builds alone from its tag. The release recipes build in
// RELEASE_TARGET of the fresh clone, which no earlier step writes, and the job restores no cache of GitHub.
export const noCache = (dir: string): Record<string, string> => ({ GOCACHE: join(dir, '.consumer-gate/go-cache'), CARGO_INCREMENTAL: '0', RUSTC_WRAPPER: '', GOFLAGS: '-mod=readonly', GOWORK: 'off' });

// The make variables that make the consumer's goals run the CLI of the run. A Makefile names the CLI as BINDING (a
// path, or node and a path) and BINDING_RUN (the command): BINDING is the executable dist/cli.js, which both forms run,
// and BINDING_RUN is node with it.
export const bindingVariables = (g: Gate): string[] => [`BINDING=${g.cli}`, `BINDING_RUN=${g.node} ${g.cli}`, `NODE=${g.node}`];

// The release recipes of the targets of a contract that build an asset of the host (GN-19b to GN-19d), then the
// rehearsal of the Go module (GN-19f), which reads the library of release-go-static.
export function rehearsalGoals(targets: readonly string[]): string[] {
  return [...(targets.includes('go') ? ['release-go-static'] : []), ...(targets.includes('python') ? ['release-wheel'] : []), ...(targets.includes('php') ? ['release-php-ext'] : [])];
}

export const consumerDir = (g: Gate, c: GateConsumer): string => join(g.work, nameOf(c.repo));

// The first step of a consumer: the clone of its tag alone, with the network. The other steps read the clone.
export const cloneStep = (g: Gate, c: GateConsumer): GateStep => ({
  phase: 'prepare',
  step: { what: `git clone ${c.repo} at ${c.tag}`, command: 'git', argv: ['clone', '--quiet', '--depth', '1', '--branch', c.tag, `https://github.com/${c.repo}.git`, consumerDir(g, c)], env: { GIT_TERMINAL_PROMPT: '0' } },
});

// The steps of a consumer after its clone, in their order. `locked` is the versions of polyspec-binding-core of its
// Cargo.lock, `targets` the targets of its contract, and `patch` writes the path patch of the root Cargo.toml
// (patchManifest of scripts/consumers.mts). The fetch runs before the patch, on the lock of the tag, as the consumer's
// install fetches it; the update after the patch names only polyspec-binding-core and runs offline, so the lock
// changes in that entry alone (GN-14d).
export function gateSteps(g: Gate, c: GateConsumer, locked: readonly string[], targets: readonly string[], patch: () => void): GateStep[] {
  const dir = consumerDir(g, c);
  const manifest = join(dir, 'Cargo.toml');
  const make = (goals: readonly string[], extra: readonly string[] = []): string[] => ['-C', dir, ...goals, ...bindingVariables(g), ...extra];
  const builds = rehearsalGoals(targets);
  return [
    { phase: 'prepare', step: { what: 'cargo fetch --locked', command: 'cargo', argv: ['fetch', '--locked', '--manifest-path', manifest] } },
    { phase: 'prepare', step: { what: `the path patch of polyspec-binding-core to ${g.core}`, write: patch } },
    { phase: 'prepare', step: { what: `cargo update ${updateSpecs(locked).join(' ')} --offline`, command: 'cargo', argv: ['update', '--manifest-path', manifest, ...updateSpecs(locked), '--offline'] } },
    { phase: 'prepare', step: { what: 'binding scaffold of the run', command: g.node, argv: [g.cli, 'scaffold', '--root', dir, '--cargo', 'cargo'] } },
    { phase: 'prepare', step: { what: `make ${c.install.join(' ')} of the consumer`, command: g.make, argv: make(c.install) } },
    { phase: 'generate', step: { what: 'make bindings of the consumer', command: g.make, argv: make(['bindings']), env: OFFLINE } },
    { phase: 'test', step: { what: 'make test-bindings of the consumer', command: g.make, argv: make(['test-bindings']), env: OFFLINE } },
    { phase: 'rehearsal', step: { what: 'make release-recipes of the consumer', command: g.make, argv: make(['release-recipes']), env: noCache(dir) } },
    ...(builds.length > 0 ? [{ phase: 'rehearsal' as const, step: { what: `make ${builds.join(' ')} of the consumer`, command: g.make, argv: make(builds), env: noCache(dir) } }] : []),
    ...(targets.includes('go') ? [{ phase: 'rehearsal' as const, step: { what: `make rehearse-go-module TAG=${c.tag} of the consumer`, command: g.make, argv: make(['rehearse-go-module'], [`TAG=${c.tag}`]), env: noCache(dir) } }] : []),
  ];
}

// The -p arguments of cargo update: each locked release of polyspec-binding-core by its version when the lock holds
// more than one, since a consumer whose dependencies took other releases of binding holds one entry for each.
export const updateSpecs = (locked: readonly string[]): string[] => (locked.length > 1 ? locked.flatMap((v) => ['-p', `polyspec-binding-core@${v}`]) : ['-p', 'polyspec-binding-core']);

// Whether a phase stops the consumer when one of its steps fails.
export const stops = (phase: Phase): boolean => phase === 'prepare' || phase === 'generate';

// The result of a consumer: each phase passed, failed with the step that failed, or did not run after a failure.
export interface GateResult {
  consumer: string;
  tag: string;
  phases: Record<Phase, 'passed' | 'failed' | 'not run'>;
  failures: { step: string; errors: string[] }[];
  log: string;
}

export const PHASES: readonly Phase[] = ['prepare', 'generate', 'test', 'rehearsal'];

// The table of a job: a row for each consumer and a column for each phase, then each failure with its first error
// lines and its log, then the summary. The first line names the commit of binding that the run is evidence of.
export function gateTable(results: readonly GateResult[], provenance: string): string {
  const width = Math.max(10, ...results.map((r) => `${r.consumer}@${r.tag}`.length));
  const header = `${'consumer'.padEnd(width)}  ${PHASES.map((p) => p.padEnd(11)).join('')}`.trimEnd();
  const rows = results.map((r) => `${`${r.consumer}@${r.tag}`.padEnd(width)}  ${PHASES.map((p) => r.phases[p].padEnd(11)).join('')}`.trimEnd());
  const failed = results.filter((r) => PHASES.some((p) => r.phases[p] === 'failed'));
  const causes = failed.flatMap((r) => [`${r.consumer}@${r.tag}: failed (log ${r.log})`, ...r.failures.flatMap((f) => [`  ${f.step}`, ...f.errors.map((line) => `    ${line}`)])]);
  const summary = failed.length === 0 ? 'passed: every consumer' : `failed: ${failed.map((r) => r.consumer).join(', ')}`;
  return [provenance, header, ...rows, '', ...causes, ...(causes.length > 0 ? [''] : []), summary].join('\n');
}

export const gateStatus = (results: readonly GateResult[]): number => (results.some((r) => PHASES.some((p) => r.phases[p] !== 'passed')) ? 1 : 0);
