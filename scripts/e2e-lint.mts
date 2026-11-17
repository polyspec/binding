import { join } from 'node:path';

// GN-14, GN-5: the lints of one binding crate in the end-to-end check. The crate is linted with the test features of
// its manifest, which the tests of the run build, and without a feature, which a release builds: an import or a helper
// whose only users are entry points of a test feature is unused in the second build alone, and the lints of the
// workspace deny it.

export interface Lint {
  // What the lint read, for the outcome of the target.
  what: string;
  // The arguments of cargo.
  argv: string[];
}

export function bindingLints(manifest: string, crate: string, features: string): Lint[] {
  const clippy = (extra: string[]): string[] => ['clippy', '--manifest-path', manifest, '-p', crate, '--all-targets', ...extra, '--', '-D', 'warnings'];
  return [
    { what: 'with its test features', argv: clippy(['--features', features]) },
    { what: 'without features', argv: clippy([]) },
  ];
}

// One binding crate of the run: the manifest of its workspace, its package and the test features of its manifest.
export interface BindingCrate {
  manifest: string;
  crate: string;
  features: string;
}

// GN-14, GN-5: runs the lints of bindingLints on each crate in turn, with cargo by `run`, which throws on a failure; the
// first failure ends the lint of the target.
export function lintBindingCrates(crates: readonly BindingCrate[], run: (argv: string[]) => void): void {
  for (const c of crates) for (const lint of bindingLints(c.manifest, c.crate, c.features)) run(lint.argv);
}

// B2.432: one repository of tests/e2e that make e2e-lint lints, with the repositories that its core depends on.
export interface LintEntry {
  repo: string;
  deps: string[];
}

// B2.432: the repositories that make e2e-lint lints: those of the matrix of the job e2e of .github/workflows/ci.yml
// (`ci` is its text), with the same DEPS, except a repository whose binding crates the compiler refuses by design
// (refused.json, B2.402), which holds no crate to lint. A repository of tests/e2e outside the matrix is in
// tests/e2e/not-in-ci.json with its reason, and its dependency is no checkout of this tree.
export function lintEntries(ci: string, refused: (repo: string) => boolean): LintEntry[] {
  const lines = ci.split('\n');
  const job = lines.findIndex((l) => l === '  e2e:');
  const start = job < 0 ? -1 : lines.findIndex((l, i) => i > job && l === '        include:');
  const found: { repo?: string; deps?: string }[] = [];
  for (const line of start < 0 ? [] : lines.slice(start + 1)) {
    const item = /^ {10}(- | {2})([a-z]+): (.*)$/.exec(line);
    if (item === null) break;
    if (item[1] === '- ') found.push({});
    const entry = found.at(-1);
    const value = (item[3] ?? '').replace(/^"(.*)"$/, '$1');
    if (entry !== undefined && item[2] === 'repo') entry.repo = value;
    if (entry !== undefined && item[2] === 'deps') entry.deps = value;
  }
  if (found.length === 0) throw new Error('the job e2e of .github/workflows/ci.yml has no matrix of repositories');
  return found
    .map((e) => ({ repo: e.repo ?? '', deps: (e.deps ?? '').split(' ').filter((d) => d !== '') }))
    .filter((e) => !refused(e.repo));
}

// B2.432: the arguments of scripts/e2e.mts that lint one repository and stop after the lint of its binding crates.
export function lintArgv(entry: LintEntry): string[] {
  return ['--repo', entry.repo, ...entry.deps.flatMap((d) => ['--dep', d]), '--until', 'lint'];
}

// GN-14, GN-6s: the arguments of tsc --strict of the declarations of a package, `declarations` relative to the package:
// the declarations where npm installed the package in `nodeDir`, beside the packages that it depends on, which they
// import (the interface of a callback unit of another repository), resolved by the exports of their manifests as Node
// resolves them (--module nodenext), so a subpath such as ./wasm is found as a consumer finds it.
export function declarationCheck(nodeDir: string, npm: string, declarations: string): string[] {
  return ['--noEmit', '--strict', '--module', 'nodenext', join(nodeDir, 'node_modules', npm, declarations)];
}

// GN-15h: the build tags that the go tool sets itself, the platforms, the architectures and the toolchains, which no
// file of the generated module selects by.
const GO_SET_TAGS = new Set([
  'aix', 'android', 'darwin', 'dragonfly', 'freebsd', 'hurd', 'illumos', 'ios', 'js', 'linux', 'nacl', 'netbsd', 'openbsd', 'plan9', 'solaris', 'wasip1', 'windows', 'zos',
  '386', 'amd64', 'arm', 'arm64', 'loong64', 'mips', 'mips64', 'mips64le', 'mipsle', 'ppc64', 'ppc64le', 'riscv64', 's390x', 'wasm',
  'unix', 'cgo', 'gc', 'gccgo', 'ignore',
]);

// GN-15g, GN-15h: the tag that selects the C library of a platform. The file of linux_<arch>_musl refuses to compile
// under the GNU C library, so only a machine of musl builds it, and make go-musl-check builds and tests the module with
// it there; a run on another machine judges the module without it.
const LIBC_TAGS = new Set(['musl']);

// GN-15h: the build tags, sorted, that the `//go:build` lines of the Go files `texts` name, except those that the go
// tool sets itself and go1.N; a file behind such a tag is compiled only by a run with that tag.
export function goBuildTags(texts: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const text of texts) {
    const line = text.split('\n').find((candidate) => candidate.startsWith('//go:build '));
    if (line === undefined) continue;
    for (const tag of line.slice('//go:build '.length).split(/[!&|()\s]+/)) {
      if (tag !== '' && !GO_SET_TAGS.has(tag) && !LIBC_TAGS.has(tag) && !/^go1\.\d+$/.test(tag)) tags.add(tag);
    }
  }
  return [...tags].sort();
}

// One run of `deadcode -test`: its output lines and the absolute paths of the Go files that the run compiles.
export interface DeadcodeRun {
  lines: readonly string[];
  compiled: ReadonlySet<string>;
}

// A finding of deadcode, with the path of its file relative to the module.
const UNREACHABLE = /^(.+?\.go):\d+:\d+: unreachable func: /;

// GN-15h: the lines of the runs of deadcode, untagged and with each build tag of the module, that stand: a function is
// unreachable when every run that compiles its file reports it, because a function that the files of one tag reach is
// used in a program with that tag; every line that is no finding, such as an error, stands too. `module` is the
// absolute path of the module, to which the paths of the findings are relative.
export function deadcodeFindings(runs: readonly DeadcodeRun[], module: string): string[] {
  const fileOf = (line: string): string | undefined => {
    const path = UNREACHABLE.exec(line)?.[1];
    return path === undefined ? undefined : path.startsWith('/') ? path : `${module}/${path}`;
  };
  const compiles = runs.map((run) => new Set([...run.compiled, ...run.lines.flatMap((line) => fileOf(line) ?? [])]));
  const standing = new Set<string>();
  for (const line of runs.flatMap((run) => run.lines)) {
    const path = fileOf(line);
    if (path === undefined || runs.every((run, i) => !(compiles[i]?.has(path) ?? false) || run.lines.includes(line))) standing.add(line);
  }
  return [...standing].sort();
}
