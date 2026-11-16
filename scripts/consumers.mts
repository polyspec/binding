// GN-14i: the compile check of the generated bindings of consumer repositories, which make consumers-check runs with
// scripts/consumers-check.mts. This module holds what the run decides, so its tests read it without a consumer: the
// consumer of a directory, the steps of a copy in their order, the steps of the Go target with or without
// `binding go-link`, the first error lines of a failed step and the table of a run.

import { join, relative } from 'node:path';
import type { Contract, Lang } from '../packages/ts/src/contract.ts';
import { place } from '../packages/ts/src/generate/packages.ts';

// The targets of a contract, in the order of the columns of the table.
export const TARGETS: readonly Lang[] = ['php', 'python', 'node', 'go', 'wasm'];

// A consumer: the checkout that holds a directory of DIRS, and the contract of that directory, relative to the
// checkout. A directory is the root of a checkout, whose contract is packages/rust/interface.json, or a package
// directory inside one, packages/<component>, whose contract is packages/<component>/rust/interface.json (L-1).
export interface Consumer {
  // The name of the consumer in the table: the directory of the checkout and, for a package directory, its path.
  label: string;
  checkout: string;
  contract: string;
}

export function consumerOf(checkout: string, dir: string): Consumer {
  const inside = relative(checkout, dir);
  if (inside.startsWith('..')) throw new Error(`${dir} is not inside its checkout ${checkout}`);
  const name = checkout.split('/').pop() ?? checkout;
  return {
    label: inside === '' ? name : `${name}/${inside}`,
    checkout,
    contract: inside === '' ? 'packages/rust/interface.json' : `${inside}/rust/interface.json`,
  };
}

// The URL of the Git dependency on binding of a scaffolded manifest (GN-3), which the copy patches.
export const BINDING_GIT = 'https://github.com/polyspec/binding.git';

// The root Cargo.toml of the copy with the path patch of polyspec-binding-core to the binding_core of this tree. A
// manifest that already patches the binding URL is a defect of the consumer for this run, which the run names and does
// not rewrite.
export function patchManifest(manifest: string, core: string): string {
  const header = `[patch."${BINDING_GIT}"]`;
  if (manifest.includes(header)) throw new Error(`the root Cargo.toml already has ${header}, so the run cannot give binding_core of this tree`);
  return `${manifest.endsWith('\n') ? manifest : `${manifest}\n`}\n${header}\npolyspec-binding-core = { path = ${JSON.stringify(core)} }\n`;
}

// One step of a cell. A command step runs `command argv` in `cwd` with `env` added; `capture` keeps its output, trimmed,
// as the variable of that name of the later steps of its cell. A write step changes a file of the copy. A failure step
// is a named failure that no command shows, such as a command that this tree of binding lacks.
export type Step =
  | { what: string; command: string; argv: string[]; cwd?: string; env?: Record<string, string>; capture?: string }
  | { what: string; write: () => void }
  | { what: string; failure: string };

export interface Copy {
  // The directory of the copy of the checkout.
  copy: string;
  // The contract, relative to the copy.
  contract: string;
  // The node that runs the CLI, the CLI of this tree and its binding_core.
  node: string;
  cli: string;
  core: string;
  // The GNU make that runs the consumer's own steps.
  make: string;
  // The go of mise.toml of this tree, by its absolute path: a shim would read the mise.toml of the copy.
  go: string;
  // The parallel jobs of each cargo and go command.
  jobs: number;
}

// The versions of polyspec-binding-core that a Cargo.lock holds: a consumer whose dependencies took other releases of
// binding holds one entry for each, and the patch replaces them all, so the update names each.
export const lockedCores = (lock: string): string[] =>
  [...lock.matchAll(/^name = "polyspec-binding-core"\nversion = "([^"]+)"/gm)].map((m) => m[1] ?? '');

// The consumer's own steps before its contract check: the prerequisites of the target bindings-check (or binding-check)
// of its Makefile, such as binding-cases of hyper, which writes the case files that the contract names. A prerequisite
// that a variable names cannot be read from the text and is a named failure.
export function stepsBeforeCheck(makefile: string): string[] {
  const line = /^bindings?-check:([^#\n]*)/m.exec(makefile)?.[1] ?? '';
  const words = line.trim().split(/\s+/).filter((word) => word !== '');
  const unread = words.filter((word) => word.includes('$'));
  if (unread.length > 0) throw new Error(`the prerequisites ${unread.join(', ')} of bindings-check of the Makefile name a variable, which the run does not expand`);
  return words;
}

// The steps that make the copy take this binding, in their order: scaffold, the path patch of binding_core, the lock,
// then the contract check, which reads the crates of the lock (CK-20), so the patch comes before it. `locked` is the
// versions of polyspec-binding-core of the lock of the copy, undefined without a lock.
export function prepareSteps(c: Copy, locked: readonly string[] | undefined, patch: () => void, before: readonly string[] = []): Step[] {
  const manifest = join(c.copy, 'Cargo.toml');
  const contract = join(c.copy, c.contract);
  const specs = (locked ?? []).length > 1 ? (locked ?? []).flatMap((v) => ['-p', `polyspec-binding-core@${v}`]) : ['-p', 'polyspec-binding-core'];
  return [
    // The consumer's steps run with its Makefile in the copy; NODE is the node of this run, since the copy has no
    // var/tools of its own.
    // The crates of the lock of the consumer, fetched as its own install target fetches them, with the network, so the
    // later offline steps read what the lock names and not what the cache of the machine happens to hold.
    { what: 'cargo fetch --locked', command: 'cargo', argv: ['fetch', '--locked', '--manifest-path', manifest], env: { CARGO_NET_OFFLINE: 'false' } },
    ...before.map((goal): Step => ({ what: `make ${goal} of the consumer`, command: c.make, argv: ['-C', c.copy, goal, `NODE=${c.node}`] })),
    { what: 'binding scaffold', command: c.node, argv: [c.cli, 'scaffold', '--contract', contract] },
    { what: `the path patch of polyspec-binding-core to ${c.core}`, write: patch },
    locked === undefined
      ? { what: 'cargo generate-lockfile --offline', command: 'cargo', argv: ['generate-lockfile', '--manifest-path', manifest, '--offline'] }
      : { what: `cargo update ${specs.join(' ')} --offline`, command: 'cargo', argv: ['update', '--manifest-path', manifest, ...specs, '--offline'] },
    { what: 'binding check', command: c.node, argv: [c.cli, 'check', contract] },
  ];
}

export const generateStep = (c: Copy, t: Lang): Step => ({
  what: `binding generate --target ${t}`,
  command: c.node,
  argv: [c.cli, 'generate', '--contract', join(c.copy, c.contract), '--target', t],
});

// The directory of the binding crate of each target, in the form of packages/<dir> that place maps (L-1, L-2a).
const CRATE_DIRS: Record<Lang, string> = { python: 'packages/python', node: 'packages/ts', php: 'packages/php-ext', go: 'packages/go/internal/ffi', wasm: 'packages/ts/wasm' };
export const crateManifest = (c: Copy, contract: Contract, t: Lang): string => join(c.copy, place(contract, `${CRATE_DIRS[t]}/Cargo.toml`));
export const goModuleDir = (c: Copy, contract: Contract): string => join(c.copy, place(contract, 'packages/go'));

// GN-5: the test features of a binding crate, the features of its manifest other than default, which binding scaffold
// of this tree wrote.
export function testFeatures(manifest: string): string[] {
  const table = /\n\[features\]\n([\s\S]*?)(?:\n\[|$)/.exec(manifest)?.[1] ?? '';
  return [...table.matchAll(/^([a-z][a-z0-9-]*) = /gm)].map((m) => m[1] ?? '').filter((name) => name !== 'default');
}

// The cargo check of a binding crate with its test features and without them; WASM on wasm32-unknown-unknown.
export function cargoSteps(c: Copy, manifest: string, t: Lang, features: readonly string[]): Step[] {
  const base = ['check', '--manifest-path', manifest, '--all-targets', '-j', String(c.jobs), ...(t === 'wasm' ? ['--target', 'wasm32-unknown-unknown'] : [])];
  return [
    { what: `cargo check --all-targets --features ${features.join(',')}`, command: 'cargo', argv: [...base, '--features', features.join(',')] },
    { what: 'cargo check --all-targets without features', command: 'cargo', argv: base },
  ];
}

// GN-15k: whether the CLI of this tree has the command go-link, from the source of the CLI.
export const hasGoLink = (cliSource: string): boolean => /command === 'go-link'/.test(cliSource);

// The Go target, once without the build tags and once with the tags of the generated files: binding go-link builds the
// static library and gives CGO_LDFLAGS (GN-15k), then go vet and go test -c, which links. Without go-link the cell
// fails by name and the Go commands run without CGO_LDFLAGS: the run writes no link flag of its own.
// The generated Go module is released on its own, outside the go.work of its repository, so each Go command reads it
// alone, as the consumer checks it (orm test-go-bindings).
const GO_ENV: Record<string, string> = { GOWORK: 'off' };

export function goSteps(c: Copy, contract: Contract, goLink: boolean, features: readonly string[], tags: readonly string[]): Step[] {
  const module = goModuleDir(c, contract);
  const manifest = crateManifest(c, contract, 'go');
  const targetDir = join(c.copy, 'target');
  const steps: Step[] = [];
  if (!goLink) steps.push({ what: 'binding go-link', failure: `binding go-link is absent from ${c.cli} (GN-15k), so the run has no CGO_LDFLAGS for the Go tests` });
  for (const tagged of [false, true]) {
    const tagArgs = tagged && tags.length > 0 ? [`-tags=${tags.join(',')}`] : [];
    const of = tagged ? ` with -tags=${tags.join(',')}` : ' without tags';
    if (goLink) steps.push({ what: `binding go-link${tagged ? ` --features ${features.join(',')}` : ''}`, command: c.node, argv: [c.cli, 'go-link', '--manifest', manifest, '--target-dir', targetDir, ...(tagged ? ['--features', features.join(',')] : [])], capture: 'CGO_LDFLAGS' });
    steps.push({ what: `go vet${of}`, command: c.go, argv: ['vet', ...tagArgs, './...'], cwd: module, env: GO_ENV });
    steps.push({ what: `go test -c${of}`, command: c.go, argv: ['test', '-c', '-o', '/dev/null', '-p', String(c.jobs), ...tagArgs, './...'], cwd: module, env: GO_ENV });
  }
  return steps;
}

// The first lines of a failed command that name its errors: those of rustc and Cargo with the place they point at, of
// the Go compiler and linker, and of binding; the last lines of the output when none does.
export function firstErrors(output: string, count = 6): string[] {
  const lines = output.split('\n');
  const found: string[] = [];
  for (const [i, line] of lines.entries()) {
    if (/^(error(\[|:)|binding: |# |.*\.go:\d+(:\d+)?: |ld: |.*undefined (symbol|reference)|go: |fatal error)/.test(line)) {
      found.push(line.trim());
      const at = lines[i + 1];
      if (at !== undefined && /^\s+--> /.test(at)) found.push(at.trim());
    }
    if (found.length >= count) break;
  }
  if (found.length > 0) return found.slice(0, count);
  return lines.map((line) => line.trim()).filter((line) => line !== '').slice(-3);
}

// The commit that a DIST directory was built at: the line `binding commit <commit>` of its MANIFEST.txt.
export function manifestCommit(manifest: string): string {
  const commit = /^binding commit ([0-9a-f]{40})$/m.exec(manifest)?.[1];
  if (commit === undefined) throw new Error('MANIFEST.txt names no line `binding commit <commit>`');
  return commit;
}

// Why a run would not be evidence of the expected commit: the CLI of this tree is at another commit, or its tree holds
// a change that no commit holds. undefined when it is that commit, clean.
export function provenanceProblem(head: string, status: string, expected: string): string | undefined {
  if (head !== expected) return `the CLI of this tree is at ${head}, not at the expected ${expected}; the run would be no evidence of ${expected}`;
  const changed = status.split('\n').filter((line) => line.trim() !== '');
  if (changed.length > 0) return `the tree of the CLI has changes that ${head} does not hold: ${changed.map((line) => line.trim()).join(', ')}`;
  return undefined;
}

// The first line of the report and of the table: the commit of the CLI that the run ran and whether its tree is clean.
export const provenanceLine = (commit: string, clean: boolean): string => `binding ${commit} (${clean ? 'clean' : 'with uncommitted changes'})`;

// A cell of the table: the target of a consumer, or the preparation of its copy.
export interface Cell {
  consumer: string;
  cell: Lang | 'prepare';
  state: 'passed' | 'failed' | 'not in contract';
  // The failed steps, each with its first error lines.
  failures: { step: string; errors: string[] }[];
  log: string;
  // UNCHECKED when the contract failed binding check and the cell ran on it all the same.
  note?: string;
}

// The note of each target cell of a consumer whose contract failed binding check: its targets still generate and
// compile, and each result says on what it stands.
export const UNCHECKED = 'generated from a contract that failed the check';
export function noteUnchecked(cells: Cell[]): void {
  for (const cell of cells) if (cell.cell !== 'prepare' && cell.state !== 'not in contract') cell.note = UNCHECKED;
}

// A cell compiles only when it generated: a refusal of the generator is the failure of its cell, and the cell stops.
export const compiles = (cell: Cell): boolean => cell.state === 'passed';

// The status of the run: 1 when any cell failed, the cell prepare of a failed check among them.
export const exitStatus = (cells: readonly Cell[]): number => (cells.some((c) => c.state === 'failed') ? 1 : 0);

// The table of a run, a row for each consumer and a column for each target, then each failed cell with the step that
// failed, its first error lines and its log. A copy that could not be prepared fails each target of its contract,
// whose cause is the preparation.
export function table(cells: readonly Cell[], provenance: string): string {
  const consumers = [...new Set(cells.map((c) => c.consumer))];
  const width = Math.max(10, ...consumers.map((c) => c.length));
  const header = `${'consumer'.padEnd(width)}  ${['prepare', ...TARGETS].map((t) => t.padEnd(15)).join('')}`.trimEnd();
  const rows = consumers.map((consumer) => {
    const of = (cell: string): string => {
      const found = cells.find((c) => c.consumer === consumer && c.cell === cell);
      return found === undefined ? '-' : `${found.state}${found.note === undefined ? '' : '*'}`;
    };
    return `${consumer.padEnd(width)}  ${['prepare', ...TARGETS].map((t) => of(t).padEnd(15)).join('')}`.trimEnd();
  });
  const failed = cells.filter((c) => c.state === 'failed');
  const causes = cells.filter((c) => c.state === 'failed' || c.note !== undefined).flatMap((c) => [
    `${c.consumer} ${c.cell}: ${c.state}${c.note === undefined ? '' : `, ${c.note}`} (log ${c.log})`,
    ...c.failures.flatMap((f) => [`  ${f.step}`, ...f.errors.map((line) => `    ${line}`)]),
  ]);
  const summary = failed.length === 0 ? 'passed: every cell' : `failed: ${failed.map((c) => `${c.consumer} ${c.cell}`).join(', ')}`;
  return [provenance, header, ...rows, '', ...causes, ...(causes.length > 0 ? [''] : []), summary].join('\n');
}
