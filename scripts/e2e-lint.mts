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
