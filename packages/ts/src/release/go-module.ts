// GN-15g, GN-19f: the released form of a Go module. A release carries the Go module in a commit that the tag
// <directory of the Go module>/vX.Y.Z names: its tree is the tree of the commit of the tag vX.Y.Z with the generated
// files that the form can build and the static library of each platform, and without the tests of the repository and
// the programs (goReleaseFiles, the one rule of the files of the form). `binding release-go-module` makes that commit and tag in the
// repository of a contract (releaseGoModule), and the end-to-end check makes the same form in a repository of its
// work directory (GN-14f); both read the tag, the consumer, the debug sections and the test entry points from here.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GO_PLATFORMS, GO_TAG_GUARD_FILE, goLinkFile, goTestTagsOf } from '../generate/go.ts';
import { isGoGenerated } from '../generate/index.ts';
import type { GoDownload } from '../generate/packages.ts';
import { goCommand } from '../go-command.ts';

export type GoPlatform = (typeof GO_PLATFORMS)[number];

export interface GoRemote {
  owner: string;
  repository: string;
  // The directory of the Go module in its repository, '' for a module at the root.
  directory: string;
  // The tag that Go reads for the version of a module in that directory.
  tag: string;
}

// The repository, the directory and the tag of a Go module on GitHub, whose repository is the first three elements of
// the module path. A module of another form is refused by name: no repository stands for its remote.
export function goRemote(module: string, version: string): GoRemote {
  const [host, owner, repository, ...rest] = module.split('/');
  if (host !== 'github.com' || owner === undefined || owner === '' || repository === undefined || repository === '') {
    throw new Error(`${module}: the Go module is not github.com/<owner>/<repository>[/<directory>], so the run has no repository that stands for its remote (GN-14f)`);
  }
  const directory = rest.join('/');
  return { owner, repository, directory, tag: directory === '' ? version : `${directory}/${version}` };
}

// GN-15, GN-19f: what is wrong with the module path of a Go module at `directory` of its repository: a path that is no
// path of GitHub, or one whose directory is another, so that the tag <directory>/vX.Y.Z is not the one that Go reads for
// it. `binding release-go-module` refuses it, and the check of a release reads it with this function (CK-102, B2.471).
export function goModulePlaceFinding(module: string, directory: string): string | undefined {
  let at: GoRemote;
  try {
    at = goRemote(module, 'v0.0.0');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return at.directory === directory ? undefined : `${module}: the Go module is at ${directory} of its repository, not at ${at.directory}, the directory of its module path (GN-15)`;
}

// The version that a go.mod requires of a module, from a line `require <module> <version>` or a line of a block
// `require (...)`; undefined when it requires none.
export function requiredVersion(goMod: string, module: string): string | undefined {
  for (const line of goMod.split('\n')) {
    const words = line.trim().split(/\s+/);
    const at = words[0] === 'require' ? 1 : 0;
    if (words[at] === module && words[at + 1] !== undefined) return words[at + 1];
  }
  return undefined;
}

// GN-14d, GN-15f: the go.work of the run. A dependency line of the core in the development form (a branch, a commit, a
// range) gives a require of v0.0.0 and no replace in go.mod, which a development checkout resolves through its
// untracked go.work; the run resolves it in the same way, to the Go module of the copy of that repository in the run,
// as the other targets install the packages of the copies of DEPS. A module that go.mod replaces is resolved by the
// replace, and Go refuses a workspace module that go.mod also replaces, so it stays out. No such dependency: no file.
export function goWork(goMod: string, own: string, deps: readonly { module: string; dir: string }[]): string | undefined {
  const replaced = (module: string): boolean => goMod.split('\n').some((line) => {
    const words = line.trim().split(/\s+/);
    return words[words[0] === 'replace' ? 1 : 0] === module && words.includes('=>');
  });
  const used = deps.filter((d) => requiredVersion(goMod, d.module) === 'v0.0.0' && !replaced(d.module)).map((d) => d.dir);
  if (used.length === 0) return undefined;
  const version = /^go (\S+)$/m.exec(goMod)?.[1];
  if (version === undefined) throw new Error('the go.mod of the Go module names no Go version, which its go.work needs (GN-15)');
  return `go ${version}\n\nuse (\n${[own, ...used].map((dir) => `\t${dir}\n`).join('')})\n`;
}

export interface Required {
  module: string;
  version: string;
  // The packages of the module that a consumer can import, each by its directory in the module, '' for the root.
  packages: string[];
}

// The files of the consumer module: a go.mod that requires each module at its version and nothing else, with no
// replace, and a test that imports every package of each module, so the program of the test links each library.
export function consumerFiles(goVersion: string, required: readonly Required[]): Map<string, string> {
  const imports = required.flatMap((r) => r.packages.map((dir) => `\t_ "${dir === '' ? r.module : `${r.module}/${dir}`}"`));
  return new Map([
    ['go.mod', `module example.invalid/consumer\n\ngo ${goVersion}\n\n${required.map((r) => `require ${r.module} ${r.version}\n`).join('')}`],
    ['consumer_test.go', [
      'package consumer',
      '',
      'import (',
      '\t"testing"',
      '',
      ...imports,
      ')',
      '',
      '// TestLinked passes when the program of the consumer links the static library that each module carries.',
      'func TestLinked(t *testing.T) {}',
      '',
    ].join('\n')],
  ]);
}

// GN-15g: the debug sections of a static library, from the output of `llvm-size -A`, which gives for each member of the
// archive a line of each section with its name and its size. A section whose name holds `debug` after its leading
// dots or underscores (__debug_info of Mach-O, .debug_info and .zdebug_info of ELF) and whose size is not 0 is named
// once, in the order of the names.
export function debugSections(sizes: string): string[] {
  const found = new Set<string>();
  for (const line of sizes.split('\n')) {
    const [name, size] = line.trim().split(/\s+/);
    if (name !== undefined && /^[._]+z?debug/.test(name) && size !== undefined && /^[1-9][0-9]*$/.test(size)) found.add(name);
  }
  return [...found].sort();
}

// GN-5, GN-17: the line of `llvm-nm --defined-only` that defines a test entry point of the Go static library of a
// contract. A test entry point is the prefix of the contract, two underscores and the name of the entry; the symbol of
// a member has a name of the contract after one underscore, so the member echo_x of a class, <prefix>_<unit>__echo_x,
// is no test entry point, and neither is a symbol of another library whose prefix only starts with this one.
export function testEntrySymbol(prefix: string): RegExp {
  return new RegExp(` [A-Z] _?${prefix}__(panic_test|echo_|arm_faults|fault_left|alias_in_|native_count|thrown_count|number_in)`);
}

// GN-19f: what the go.mod of a release may not hold. A `replace` line and a requirement at v0.0.0 are the development
// forms of a dependency (GN-15f), which a consumer of the tag cannot resolve. Both forms of a directive are read: the
// line `require <module> <version>` and the lines of a block `require (...)`.
export function goModFindings(goMod: string): string[] {
  const { required, replaced } = goModDirectives(goMod);
  return [
    ...required.map(({ line }) => line.split(/\s+/)).filter(([, version]) => version === 'v0.0.0').map(([module]) => `go.mod requires ${String(module)} at v0.0.0, the development form of a dependency`),
    ...replaced.map((line) => `go.mod holds the line \`replace ${line}\``),
  ];
}

// The `require` and `replace` directives of a go.mod, in both forms, a line of its own and a line of a block: each
// without its comment, and a requirement with that comment, which says of a line `// indirect` what it is.
function goModDirectives(goMod: string): { required: { line: string; comment: string }[]; replaced: string[] } {
  const required: { line: string; comment: string }[] = [];
  const replaced: string[] = [];
  let block: 'require' | 'replace' | undefined;
  for (const raw of goMod.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (line === '') continue;
    const comment = /\/\/(.*)$/.exec(raw)?.[1]?.trim() ?? '';
    const take = (directive: 'require' | 'replace', text: string): void => {
      if (directive === 'require') required.push({ line: text, comment });
      else replaced.push(text);
    };
    if (block !== undefined) {
      if (line === ')') block = undefined;
      else take(block, line);
      continue;
    }
    const [, directive, rest] = /^(require|replace)\s+(.*)$/.exec(line) ?? [];
    if (directive !== 'require' && directive !== 'replace') continue;
    if (rest === '(') block = directive;
    else if (rest !== undefined) take(directive, rest);
  }
  return { required, replaced };
}

export interface GoRequirement {
  module: string;
  version: string;
  // The line ends with the comment `// indirect`: no package of the module itself imports the required one.
  indirect: boolean;
}

// The requirements of a go.mod, of both forms of the directive, in their order.
export function goModRequires(goMod: string): GoRequirement[] {
  return goModDirectives(goMod).required.map(({ line, comment }) => {
    const [module = '', version = ''] = line.split(/\s+/);
    return { module, version, indirect: /^indirect\b/.test(comment) };
  });
}

// GN-14f: the repository of a Go module, the first three elements of its module path.
const repositoryOf = (module: string): string => module.split('/').slice(0, 3).join('/');

// GN-19f, B2.479: the release requirements of `goMod`, the go.mod of `module`, that name another module of the same
// repository. The commit that carries such a module at its version is made by the release of that module, so its tag
// is the first to exist, and no tracked go.sum holds its hash (GN-15l).
export function siblingRequires(goMod: string, module: string): GoRequirement[] {
  return goModRequires(goMod).filter((r) => r.module !== module && r.version !== 'v0.0.0' && repositoryOf(r.module) === repositoryOf(module));
}

// GN-15g, B2.479: the go.sum of the commit of a release: the lines of `goSum`, the go.sum of the commit of the tag
// ('' when it tracks none), and the two lines of each sibling module that `go mod download -json` gave, sorted as
// binding writes a go.sum (GN-15l). A line of `goSum` that gives a sibling another hash is named: the tracked go.sum
// holds no line of a module of its own repository.
export function goSumWith(goSum: string, downloads: readonly GoDownload[]): string {
  const lines = new Set(goSum.split('\n').filter((line) => line !== ''));
  for (const d of downloads) {
    if (d.Error !== undefined) throw new Error(`go mod download gave no sum: ${d.Error}`);
    if (d.Version === undefined || d.Sum === undefined || d.GoModSum === undefined) throw new Error(`go mod download gave no sum of ${d.Path} ${d.Version ?? ''}`);
    for (const [key, hash] of [[`${d.Path} ${d.Version}`, d.Sum], [`${d.Path} ${d.Version}/go.mod`, d.GoModSum]] as const) {
      const other = [...lines].find((line) => line.startsWith(`${key} `) && line !== `${key} ${hash}`);
      if (other !== undefined) throw new Refused([`go.sum holds the line \`${other}\` of a Go module of this repository, and the commit of its tag has the hash ${hash}: remove the line, since no tracked go.sum holds the hash of a module that the release itself commits (GN-15l)`]);
      lines.add(`${key} ${hash}`);
    }
  }
  return `${[...lines].sort().join('\n')}\n`;
}

// The name of the package clause of a Go file, the first token of the file after its comments, which hold its build
// constraint; undefined for a text that starts with no package clause.
export function goPackageOf(text: string): string | undefined {
  let at = 0;
  for (;;) {
    while (at < text.length && /\s/.test(text.charAt(at))) at += 1;
    const close = text.startsWith('//', at) ? text.indexOf('\n', at) : text.startsWith('/*', at) ? text.indexOf('*/', at) : undefined;
    if (close === undefined) break;
    if (close < 0) return undefined;
    at = close + (text.startsWith('//', at) ? 1 : 2);
  }
  return /^package\s+([\p{L}_][\p{L}\p{N}_]*)/u.exec(text.slice(at))?.[1];
}

// GN-19f: the packages of a module that a consumer can import, of `files`, the paths of its files in the module, and
// `read`, which gives the text of a Go file: each directory outside every directory `internal` with a Go file that
// is no test and whose package clause is not `main`. A directory of tests alone holds no package to import, and Go
// imports no program, so a consumer that imported a directory of `package main` would not build.
export function publicPackages(files: readonly string[], read: (path: string) => string): string[] {
  const found = new Set<string>();
  for (const file of files) {
    if (!file.endsWith('.go') || file.endsWith('_test.go')) continue;
    const dirs = file.split('/').slice(0, -1);
    if (dirs.includes('internal') || found.has(dirs.join('/'))) continue;
    if (goPackageOf(read(file)) !== 'main') found.add(dirs.join('/'));
  }
  return [...found].sort();
}

const OBJECT_OF: Record<GoPlatform, string> = { linux_amd64: 'ELF x86-64', linux_arm64: 'ELF AArch64', linux_amd64_musl: 'ELF x86-64', linux_arm64_musl: 'ELF AArch64', darwin_arm64: 'Mach-O arm64' };

// What the first bytes of a member of an archive are: an ELF object by its machine, a 64-bit Mach-O object by its CPU
// type, or no object.
function objectKind(data: Uint8Array): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length >= 20 && view.getUint32(0, false) === 0x7f454c46) {
    const machine = view.getUint16(18, data[5] === 1);
    return machine === 62 ? 'ELF x86-64' : machine === 183 ? 'ELF AArch64' : `ELF machine ${String(machine)}`;
  }
  if (data.length >= 8 && view.getUint32(0, true) === 0xfeedfacf) {
    const cpu = view.getUint32(4, true);
    return cpu === 0x0100000c ? 'Mach-O arm64' : cpu === 0x01000007 ? 'Mach-O x86-64' : `Mach-O CPU ${String(cpu)}`;
  }
  return 'no object';
}

// GN-19f: what is wrong with the static library of a platform, from its bytes: a file that is empty, that is no `ar`
// archive or that ends inside a member, an archive without an object, and each member that is no object of the
// platform. The symbol tables of an archive (`/`, `/SYM64/` and `__.SYMDEF`) and the table of the long names of GNU
// (`//`) are no members; a long name is read from that table (`/<offset>`) or from the head of the member
// (`#1/<length>` of BSD).
export function libraryFindings(bytes: Uint8Array, platform: GoPlatform): string[] {
  if (bytes.length === 0) return ['is empty'];
  const text = (from: number, to: number): string => Buffer.from(bytes.subarray(from, to)).toString('latin1');
  if (bytes.length < 8 || text(0, 8) !== '!<arch>\n') return ['is no ar archive'];
  const expected = OBJECT_OF[platform];
  const other: string[] = [];
  let objects = 0;
  let longNames = '';
  for (let at = 8; at < bytes.length;) {
    const size = Number(text(at + 48, at + 58).trim());
    if (at + 60 > bytes.length || text(at + 58, at + 60) !== '`\n' || !Number.isInteger(size) || at + 60 + size > bytes.length) return ['is an ar archive that ends inside a member'];
    let name = text(at, at + 16).trim();
    let data = bytes.subarray(at + 60, at + 60 + size);
    at += 60 + size + (size % 2);
    if (name === '//') {
      longNames = Buffer.from(data).toString('latin1');
      continue;
    }
    if (name === '/' || name === '/SYM64/') continue;
    const bsd = /^#1\/([0-9]+)$/.exec(name);
    const gnu = /^\/([0-9]+)$/.exec(name);
    if (bsd !== null) {
      const length = Number(bsd[1]);
      name = Buffer.from(data.subarray(0, length)).toString('latin1').replace(/\0+$/, '');
      data = data.subarray(length);
    } else if (gnu !== null) {
      name = longNames.slice(Number(gnu[1])).split('\n')[0] ?? name;
    }
    if (name.startsWith('__.SYMDEF')) continue;
    name = name.replace(/\/$/, '');
    const kind = objectKind(data);
    if (kind === expected) objects += 1;
    else other.push(`${name} (${kind})`);
  }
  if (other.length > 0) return [`holds ${String(other.length)} ${other.length === 1 ? 'member that is' : 'members that are'} no ${expected} object: ${other.join(', ')}`];
  return objects === 0 ? ['holds no object'] : [];
}

// GN-15k: the libraries that a static library needs, from the diagnostics of the build that linked it with
// `--print native-static-libs`: the value of the note `native-static-libs:` of rustc as it printed it; undefined when the
// build printed no such note or one that names no library.
export function nativeStaticLibs(diagnostics: string): string | undefined {
  const found = /^note: native-static-libs: (.*)$/m.exec(diagnostics)?.[1]?.trim();
  return found === undefined || found === '' ? undefined : found;
}

// GN-15k, B2.415: the libraries of native-static-libs that the Rust toolchain ships for the target in
// lib/rustlib/<triple>/lib/self-contained and that no C compiler of the platform brings, so the release carries each
// beside the static library of the platform: libunwind.a, the LLVM unwinder that the std of a musl target links with
// -bundle. The files that carry the libraries that `libs` names, in their order.
export const CARRIED_LIBRARIES = ['unwind'] as const;
export function carriedLibraries(libs: string): string[] {
  const named = libs.split(/\s+/).filter((word) => word.startsWith('-l')).map((word) => word.slice(2));
  return [...new Set(named.filter((name) => (CARRIED_LIBRARIES as readonly string[]).includes(name)))].map((name) => `lib${name}.a`);
}
// The directory of the libraries that the Rust toolchain of `sysroot` ships for `triple`.
export const selfContained = (sysroot: string, triple: string): string => join(sysroot, 'lib/rustlib', triple, 'lib/self-contained');

// GN-15k: the directive of the link file of a platform as the generator writes it, with the directory alone.
export const goLinkDirective = (platform: string): string => `// #cgo LDFLAGS: -L\${SRCDIR}/../ffi/lib/${platform}`;

// GN-15k: the arguments of cargo that build the static library of a Go crate with the print of its native-static-libs.
// GN-1d: flags are the arguments of a build that the repository gives, right after the subcommand.
export function goStaticBuildArgs(build: { manifest: string; targetDir: string; features?: string | undefined; release?: boolean; target?: string | undefined; flags?: readonly string[] }): string[] {
  return [
    'rustc', ...(build.flags ?? []), ...(build.release === true ? ['--release'] : []), '--locked', '--offline', '--color', 'never', '--manifest-path', build.manifest, '--target-dir', build.targetDir,
    ...(build.target === undefined ? [] : ['--target', build.target]), '--lib', '--crate-type', 'staticlib',
    ...(build.features === undefined ? [] : ['--features', build.features]), '--', '--print', 'native-static-libs',
  ];
}

export interface GoReleaseFiles {
  // The files that the released form carries, sorted.
  carried: string[];
  // Each file that it leaves out, with the reason as the end of a sentence about the file.
  leftOut: Map<string, string>;
}

// GN-14h: a test of the repository in a Go module is a file `_test.go` that the generator did not write. Its own
// runner gives its inputs, so the end-to-end check treats it as absent (goTestScope) and the released form does not
// carry it (goReleaseFiles); both read this.
export const isGoRepositoryTest = (path: string): boolean => path.endsWith('_test.go') && !isGoGenerated(path);

// GN-15g: the files of a Go module that the released form carries, of `files`, the paths of the files of the module,
// generated and hand-written, and `read`, which gives the text of a Go file; every path is in one of the two parts.
// The released form holds what a consumer of the module can build and run in it, so it leaves out four kinds of
// file. A generated file whose build constraint names a build tag of a test feature (GN-13ba), test or not, calls
// test entry points that the library of a release may not hold (GN-19f), and the guard of those tags (GN-13bf) would
// ask for tags that the form does not carry. A test of the repository (isGoRepositoryTest) reads inputs that the
// runner of the repository gives, so it would fail in a fetched module. A Go file of a program, whose package clause
// is `main`, is imported by no consumer and is no part of the library, and the programs of a Go module of a binding
// serve its tests. A constraint of other tags, such as `musl` of a link file, leaves a file in, and so does every
// other file, a hand-written package such as a host among them. Both the commit of `binding release-go-module` and
// the source of the released form of the end-to-end check (GN-14f) read this, and no other rule removes a file.
export function goReleaseFiles(files: readonly string[], read: (path: string) => string): GoReleaseFiles {
  const carried: string[] = [];
  const leftOut = new Map<string, string>();
  for (const path of files) {
    const tags = isGoGenerated(path) ? goTestTagsOf(read(path)) : [];
    if (tags.length > 0) leftOut.set(path, `is behind the build tag${tags.length === 1 ? '' : 's'} ${tags.join(', ')} of a test feature`);
    else if (isGoGenerated(path) && path.slice(path.lastIndexOf('/') + 1) === GO_TAG_GUARD_FILE) leftOut.set(path, 'is the guard of the build tags of the generated tests (GN-13bf)');
    else if (isGoRepositoryTest(path)) leftOut.set(path, 'is a test of the repository, whose inputs the runner of the repository gives (GN-14h)');
    else if (path.endsWith('.go') && goPackageOf(read(path)) === 'main') leftOut.set(path, 'is a Go file of a program (`package main`), which no consumer imports');
    else carried.push(path);
  }
  return { carried: carried.sort(), leftOut };
}

// The import paths of a Go file: those of its import declarations, which follow the package clause, in both forms, a
// declaration of one path and a block, with or without a name before the path. The text is read without its comments
// up to the first declaration that is no import.
export function goImports(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, '')).join('\n');
  const found: string[] = [];
  const clause = /^\s*package\s+[\p{L}_][\p{L}\p{N}_]*[ \t]*;?/u.exec(code);
  if (clause === null) return found;
  let rest = code.slice(clause[0].length);
  const path = /^\s*(?:[\p{L}_.][\p{L}\p{N}_]*\s+)?(?:"([^"\n]*)"|`([^`\n]*)`)\s*;?/u;
  for (;;) {
    const single = /^\s*import\s*(?!\()/.exec(rest);
    const block = /^\s*import\s*\(/.exec(rest);
    if (block !== null) {
      rest = rest.slice(block[0].length);
      for (let entry = path.exec(rest); entry !== null; entry = path.exec(rest)) {
        found.push(entry[1] ?? entry[2] ?? '');
        rest = rest.slice(entry[0].length);
      }
      const close = /^\s*\)\s*;?/.exec(rest);
      if (close === null) return found;
      rest = rest.slice(close[0].length);
    } else if (single !== null) {
      const entry = path.exec(rest.slice(single[0].length));
      if (entry === null) return found;
      found.push(entry[1] ?? entry[2] ?? '');
      rest = rest.slice(single[0].length + entry[0].length);
    } else return found;
  }
}

export interface GoModUnused {
  // Each requirement that no carried file imports, one sentence each.
  findings: string[];
  // Each requirement that is not judged, one sentence each: a line `// indirect`.
  notJudged: string[];
}

// GN-15g, GN-19f, B2.473: the requirements of `goMod` that the released form does not use. `carried` and `leftOut`
// are the files of the module that the form carries and leaves out (goReleaseFiles), and `read` gives the text of a
// Go file. A requirement is used when a carried Go file imports a package of its module, the module path itself or a
// path below it; an import belongs to the required module with the longest path that holds it. A requirement that
// only files that the form leaves out import is named with those files, and one that no file imports is named; a
// line `// indirect` is not judged, because no file of the module imports the module of such a line. No Go is started
// and no go.mod is written. The files that the form leaves out are read only when a requirement is not used.
export function goModUnused(goMod: string, carried: readonly string[], leftOut: readonly string[], read: (path: string) => string): GoModUnused {
  const required = goModRequires(goMod);
  const judged = required.filter((r) => !r.indirect);
  const notJudged = required.filter((r) => r.indirect).map((r) => `go.mod requires ${r.module} ${r.version} with \`// indirect\`, which is not judged: no file of the module imports the module of such a line`);
  if (judged.length === 0) return { findings: [], notJudged };
  const own = /^module\s+(\S+)/m.exec(goMod)?.[1];
  const modules = [...required.map((r) => r.module), ...(own === undefined ? [] : [own])];
  // The module of `modules` that an import path belongs to, the one with the longest path.
  const moduleOf = (path: string): string | undefined => modules.filter((module) => path === module || path.startsWith(`${module}/`)).sort((a, b) => b.length - a.length)[0];
  const importers = (files: readonly string[]): Map<string, string[]> => {
    const by = new Map<string, string[]>();
    for (const file of files.filter((path) => path.endsWith('.go'))) {
      for (const module of new Set(goImports(read(file)).map(moduleOf))) {
        if (module !== undefined) by.set(module, [...(by.get(module) ?? []), file]);
      }
    }
    return by;
  };
  const used = importers(carried);
  const unused = judged.filter((r) => !used.has(r.module));
  if (unused.length === 0) return { findings: [], notJudged };
  const outside = importers(leftOut);
  return {
    findings: unused.map((r) => {
      const files = (outside.get(r.module) ?? []).sort();
      return files.length === 0
        ? `go.mod requires ${r.module} ${r.version}, and no Go file of the module imports it: remove the requirement, which would enter the module graph of every consumer of the tag (GN-15g)`
        : `go.mod requires ${r.module} ${r.version}, and only files that the released form leaves out import it (${files.join(', ')}): a dependency of tests or programs alone lives in a Go module of its own, with its own go.mod, so that it does not enter the module graph of a consumer of the tag (GN-15g)`;
    }),
    notJudged,
  };
}

// CK-102, B2.473: goModUnused of the Go module of a checkout, before a tag: `moduleDir` is its directory, whose go.mod
// and hand-written files are read from the disk, and `generated` the generated Go files by their paths in the module,
// as `binding generate` writes them, so the check needs no generation in the work tree. undefined without a go.mod.
// A directory that Go reads no package from (`testdata`, `vendor`, a name that starts with `.` or `_`) is not walked.
export function goModUnusedOf(moduleDir: string, generated: ReadonlyMap<string, string>): GoModUnused | undefined {
  if (!existsSync(join(moduleDir, 'go.mod'))) return undefined;
  const written: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(moduleDir, dir), { withFileTypes: true })) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!/^[._]/.test(entry.name) && entry.name !== 'testdata' && entry.name !== 'vendor') walk(path);
      } else if (entry.isFile() && path.endsWith('.go') && !isGoGenerated(path)) written.push(path);
    }
  };
  walk('');
  const read = (path: string): string => generated.get(path) ?? readFileSync(join(moduleDir, path), 'utf8');
  const form = goReleaseFiles([...written, ...generated.keys()], read);
  return goModUnused(readFileSync(join(moduleDir, 'go.mod'), 'utf8'), form.carried, [...form.leftOut.keys()], read);
}

// GN-19f: the checks of a release that failed, one sentence each. No commit and no tag was made.
export class Refused extends Error {
  findings: string[];
  constructor(findings: string[]) {
    super(findings.join('\n'));
    this.findings = findings;
  }
}

export interface GoModuleRelease {
  // The checkout of the repository, at the commit of the tag.
  root: string;
  // The directory of the Go module in the repository (GN-15).
  directory: string;
  // The module path of packages.go of the contract.
  module: string;
  // The tag vX.Y.Z of the release.
  tag: string;
  // The name of the static library, lib<library>.a, and the prefix of its entry points (GN-17).
  library: string;
  prefix: string;
  // The directory that holds <platform>/lib<library>.a of each platform (GN-19b).
  libraries: string;
  // The directory of the run: its index, the repository and the consumer of the proof, and the caches of Go.
  work: string;
  // The Git remote of the repository.
  remote: string;
  // The words of the go command, the value of --go; the go of PATH of `env` when it is not given.
  go?: readonly string[] | undefined;
  // The environment of the commands of the run, PATH included.
  env: Record<string, string | undefined>;
  // Takes each command of the run and what it found, for the reader of the run.
  log: (line: string) => void;
  // B2.479: the rehearsal of --rehearsal. It reads HEAD in place of the commit of the tag, checks the platforms whose
  // library and generated files are there, and writes its commit and its tag into a repository of `work` alone.
  rehearsal?: boolean;
}

export interface GoModuleReleased {
  commit: string;
  // The reference that the recipe pushes to the remote, or undefined when the remote holds the tag at the commit; a
  // rehearsal gives none.
  reference: string | undefined;
  // What a rehearsal did not see, one phrase each, the last of which says that no commit and no tag was made;
  // undefined for a release.
  unseen?: string[];
}

// GN-19f, B2.479: the last lines of the output of a rehearsal that passed: what it did not see, so that it is not read
// as a release that passed.
export function rehearsalReport(module: string, tag: string, unseen: readonly string[]): string[] {
  return [`the rehearsal of ${module} ${tag} passed on what is here, and it is no release (GN-19f). It did not see:`, ...unseen.map((line) => `  - ${line}`)];
}

// GN-19f: makes the commit and the tag <directory>/vX.Y.Z of the Go module in the repository. It runs every check to
// its end and throws Refused with each failed one before it writes an object; a command that fails for another reason
// throws an Error with its arguments and its status. It pushes nothing to the remote. A rehearsal (B2.479) runs the
// same checks and the same proof and writes no object and no reference into the repository.
export function releaseGoModule(release: GoModuleRelease): GoModuleReleased {
  const { root, directory, module, tag, work, remote } = release;
  const rehearsal = release.rehearsal === true;
  const unseen: string[] = [];
  if (!/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag)) throw new Refused([`the tag ${tag} is not vX.Y.Z`]);
  const at = goRemote(module, tag);
  const misplaced = goModulePlaceFinding(module, directory);
  if (misplaced !== undefined) throw new Refused([misplaced]);
  const moduleTag = at.tag;
  const reference = `refs/tags/${moduleTag}`;
  // B2.456: the consumer of the proof is built by Go, so a run without the go command is refused before it reads the
  // repository, with the sentence that names the tool and how to give it.
  const resolved = goCommand(release.go, release.env, 'binding release-go-module proves the commit of the Go module with a consumer that Go builds (`go mod tidy`, `go test`, GN-19f)');
  if ('refusal' in resolved) throw new Refused([resolved.refusal]);
  const [goProgram, ...goPrefix] = resolved.command;

  interface Ran { status: number | null; stdout: string }
  // Every command reads the environment of the run alone; its error output goes to the reader of the run.
  const start = (tool: string, argv: string[], env: Record<string, string> = {}, cwd?: string): Ran => {
    release.log(`$ ${tool} ${argv.join(' ')}`);
    const ran = spawnSync(tool, argv, { encoding: 'utf8', maxBuffer: 1 << 28, env: { ...release.env, ...env }, ...(cwd === undefined ? {} : { cwd }) });
    if (ran.error !== undefined) throw new Error(`${tool} did not start: ${ran.error.message}`);
    if (ran.stderr !== '') release.log(ran.stderr.trimEnd());
    return { status: ran.status, stdout: ran.stdout };
  };
  const run = (tool: string, argv: string[], env: Record<string, string> = {}, cwd?: string): string => {
    const ran = start(tool, argv, env, cwd);
    if (ran.status !== 0) throw new Error(`${tool} ${argv.join(' ')} ended with status ${String(ran.status)}`);
    return ran.stdout;
  };
  const git = (argv: string[], env: Record<string, string> = {}): string => run('git', ['-C', root, ...argv], env).trim();
  // A name that the repository may not hold: status 1 without output is the answer that it does not.
  const named = (name: string): string | undefined => {
    const ran = start('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${name}^{commit}`]);
    if (ran.status === 0) return ran.stdout.trim();
    if (ran.status === 1) return undefined;
    throw new Error(`git rev-parse --verify --quiet ${name}^{commit} ended with status ${String(ran.status)}`);
  };

  // ---- The repository of the proof ------------------------------------------------------------------------------------
  // A rehearsal keeps its repository between runs, so the rehearsal of a module finds the one of its sibling (B2.479).
  const bare = join(work, rehearsal ? 'rehearsal.git' : 'remote.git');
  const consumer = join(work, 'consumer');
  const gitConfig = join(work, 'gitconfig');
  // No setting of the machine reaches Go, no proxy and no checksum database is asked, and the library is the one that
  // the module carries: GOFLAGS and CGO_LDFLAGS are empty.
  const goEnv = {
    GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1', GOENV: 'off', GOTOOLCHAIN: 'local', GOWORK: 'off', GOPROXY: 'direct', GOSUMDB: 'off',
    GOMODCACHE: join(work, 'modcache'), GOCACHE: join(work, 'gocache'), GOFLAGS: '', CGO_ENABLED: '1', CGO_LDFLAGS: '',
  };
  // Every call of Go of the run: the go command with the settings above.
  const go = (argv: string[], cwd?: string): string => run(goProgram, [...goPrefix, ...argv], goEnv, cwd);
  // Go keeps the directories of a module cache read-only, so Go removes it.
  const cleanCache = (): void => {
    if (existsSync(goEnv.GOMODCACHE)) go(['clean', '-modcache']);
  };
  const initBare = (): void => {
    run('git', ['init', '--quiet', '--bare', bare]);
    for (const [key, value] of [['maintenance.auto', 'false'], ['gc.auto', '0'], ['receive.autogc', 'false']] as const) run('git', ['--git-dir', bare, 'config', key, value]);
  };
  // The Git of the repository of the proof. A rehearsal writes each object of its commit there and none into the
  // repository, whose objects that repository reads as its alternates.
  const bareGit = (argv: string[], env: Record<string, string> = {}): string => run('git', ['--git-dir', bare, ...argv], env).trim();
  // The bare repository that Git reads in place of the remote of the repository, made once in a run.
  let opened = false;
  const openBare = (): void => {
    if (opened) return;
    opened = true;
    cleanCache();
    mkdirSync(work, { recursive: true });
    rmSync(consumer, { recursive: true, force: true });
    if (!rehearsal) {
      rmSync(bare, { recursive: true, force: true });
      initBare();
    }
    writeFileSync(gitConfig, `[url "${bare}"]\n\tinsteadOf = https://github.com/${at.owner}/${at.repository}\n`);
  };

  // ---- The checks -----------------------------------------------------------------------------------------------------
  const findings: string[] = [];
  let parent: string;
  if (rehearsal) {
    parent = git(['rev-parse', '--verify', 'HEAD^{commit}']);
    unseen.push(`the tag ${tag}: the rehearsal read HEAD, the commit ${parent}, and the generated files of the work tree, whether a tag names that commit or not`);
    if (!existsSync(bare)) initBare();
    mkdirSync(join(bare, 'objects/info'), { recursive: true });
    writeFileSync(join(bare, 'objects/info/alternates'), `${git(['rev-parse', '--path-format=absolute', '--git-path', 'objects'])}\n`);
  } else {
    const tagged = named(`refs/tags/${tag}`);
    if (tagged === undefined) throw new Refused([`the repository has no tag ${tag}`]);
    parent = tagged;
    const head = git(['rev-parse', '--verify', 'HEAD^{commit}']);
    if (head !== parent) findings.push(`HEAD is the commit ${head}, not the commit ${parent} of the tag ${tag}`);
  }
  const goMod = run('git', ['-C', root, 'show', `${parent}:${directory}/go.mod`]);
  findings.push(...goModFindings(goMod));

  // B2.479: the modules of this repository that the go.mod requires at a release version, and those that they require
  // in turn. Go fetches each at its tag from the same remote as this module, so the proof needs every one of those
  // tags, and the go.sum of the commit takes the hashes of their commits: a missing tag is named before any write.
  interface Sibling { module: string; version: string; tag: string; commit: string; rehearsed: boolean }
  const siblings = new Map<string, Sibling>();
  const asked = new Set<string>();
  const pending = siblingRequires(goMod, module).map((r) => ({ ...r, by: 'go.mod' }));
  for (let r = pending.shift(); r !== undefined; r = pending.shift()) {
    const key = `${r.module} ${r.version}`;
    if (r.module === module || asked.has(key)) continue;
    asked.add(key);
    const its = goRemote(r.module, r.version);
    let found = named(`refs/tags/${its.tag}`);
    let rehearsed = false;
    if (found === undefined && rehearsal) {
      // A rehearsal before any release: the sibling has no tag yet, and its own rehearsal in the same --work stands
      // for it when it was made from the commit that this one reads.
      const ran = start('git', ['--git-dir', bare, 'rev-parse', '--verify', '--quiet', `refs/tags/${its.tag}^{commit}`]);
      if (ran.status !== 0 && ran.status !== 1) throw new Error(`git rev-parse --verify --quiet refs/tags/${its.tag}^{commit} ended with status ${String(ran.status)}`);
      if (ran.status === 0) {
        const source = bareGit(['rev-parse', '--verify', `${ran.stdout.trim()}^1`]);
        if (source !== parent) {
          findings.push(`${r.by} requires ${key}, a Go module of this repository, and its rehearsal in ${work} was made from the commit ${source}, not from HEAD, the commit ${parent}: rehearse that module again first, with the same --work (GN-19f)`);
          continue;
        }
        found = ran.stdout.trim();
        rehearsed = true;
        unseen.push(`the tag ${its.tag}: the repository has none, and the rehearsal took ${r.module} from the rehearsal of that module in ${work}`);
      }
    }
    if (found === undefined && rehearsal) {
      findings.push(`${r.by} requires ${key}, a Go module of this repository, and the repository has no tag ${its.tag} and ${work} holds no rehearsal of that module: rehearse that module first, with the same --work (binding release-go-module --rehearsal, the recipe rehearse-go-module of its contract), because the proof fetches that module at its tag (GN-19f)`);
      continue;
    }
    if (found === undefined) {
      findings.push(`${r.by} requires ${key}, a Go module of this repository, and the repository has no tag ${its.tag}: run binding release-go-module of that module first (the recipe release-go-module of its contract), because the proof fetches that module at its tag and the go.sum of this commit holds the hashes of the commit of that tag (GN-19f)`);
      continue;
    }
    siblings.set(key, { module: r.module, version: r.version, tag: its.tag, commit: found, rehearsed });
    const itsGoMod = run('git', [...(rehearsal ? ['--git-dir', bare] : ['-C', root]), 'show', `${found}:${its.directory === '' ? '' : `${its.directory}/`}go.mod`]);
    pending.push(...siblingRequires(itsGoMod, r.module).map((next) => ({ ...next, by: `the go.mod of ${key}` })));
  }

  // The generated files of the Go module in the work tree, by their paths in the module, and of them those that the
  // commit of a release carries (GN-15g).
  const written = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(root, directory, dir), { withFileTypes: true })) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && isGoGenerated(path)) written.set(path, readFileSync(join(root, directory, path), 'utf8'));
    }
  };
  walk('');
  // GN-15g: no tracked tree holds a generated file. The command writes the generated files of the work tree over those
  // of the commit of the tag and leaves the others as that commit holds them, so a tracked one makes the released form
  // differ from the commit that the release checked, and nothing says so: each is refused by name.
  const tracked = run('git', ['-C', root, 'ls-tree', '-r', '-z', '--name-only', parent, '--', directory]).split('\0').filter((path) => path !== '').map((path) => path.slice(directory.length + 1));
  for (const path of tracked) {
    if (isGoGenerated(path)) findings.push(`${directory}/${path}: the commit of the tag ${tag} tracks it, and it is a generated file (zz_generated_*.go), which no tracked tree holds, because the release writes its own over it and the released form would differ from that commit without a word: remove it from the index (git rm --cached) and ignore it (GN-15g)`);
  }
  // The files of the released form (GN-15g): the hand-written files that the commit of the tag tracks and the
  // generated files of the work tree, of which goReleaseFiles gives those that the form carries. The text of a tracked
  // file is the one of that commit, and the text of a generated file the one of the work tree.
  const shown = new Map<string, string>();
  const read = (path: string): string => {
    const text = written.get(path) ?? shown.get(path) ?? run('git', ['-C', root, 'show', `${parent}:${directory}/${path}`]);
    if (!written.has(path)) shown.set(path, text);
    return text;
  };
  const handWritten = tracked.filter((path) => !isGoGenerated(path));
  const form = goReleaseFiles([...handWritten, ...written.keys()], read);
  const generated = form.carried.filter((path) => written.has(path));
  // B2.473: each requirement of the go.mod is imported by a file that the form carries; go.mod is not rewritten.
  const requirements = goModUnused(goMod, form.carried, [...form.leftOut.keys()], read);
  findings.push(...requirements.findings);
  for (const line of requirements.notJudged) release.log(line);
  // The tracked files that the released form leaves out, which the commit removes from the tree of the commit of the tag.
  const removed = handWritten.filter((path) => form.leftOut.has(path)).sort();
  // GN-15k: the link file of each platform with the native-static-libs that the release build of that platform printed,
  // which release-go-static wrote beside its library; the commit takes it in place of the file of the work tree.
  const linked = new Map<string, string>();
  const carried = new Map<string, string>();
  const libraryOf = (platform: GoPlatform): string => join(release.libraries, platform, `lib${release.library}.a`);
  const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();
  // B2.479: a rehearsal names each platform whose library, native-static-libs or generated files are not there and
  // checks the others; the proof links the library of the platform of the run, which is there.
  const absent = new Map<string, string[]>();
  if (rehearsal) {
    for (const platform of GO_PLATFORMS) {
      const missing = [`internal/binding/zz_generated_link_${goLinkFile(platform)}.go`, `internal/ffi/lib/${platform}/zz_generated_lib.go`].filter((file) => !generated.includes(file)).map((file) => `${directory}/${file} is not in the work tree`);
      for (const path of [libraryOf(platform), join(release.libraries, platform, 'native-static-libs')]) if (!isFile(path)) missing.push(`${path} is not there`);
      if (missing.length === 0) continue;
      absent.set(platform, missing);
      unseen.push(`the platform ${platform}: ${missing.join(', ')}`);
    }
    const host = go(['env', 'GOOS', 'GOARCH']).trim().split(/\s+/).join('_');
    if (!(GO_PLATFORMS as readonly string[]).includes(host)) findings.push(`the proof links the library of the platform of the run, and ${host} is no platform of a Go module (GN-15g)`);
    else if (absent.has(host)) findings.push(`the proof links the library of ${host}, the platform of the run, and ${(absent.get(host) ?? []).join(', ')}: build the library (the recipe release-go-static) and run binding generate --target go (GN-19f)`);
  }
  const platforms = GO_PLATFORMS.filter((platform) => !absent.has(platform));
  for (const platform of platforms) {
    const link = `internal/binding/zz_generated_link_${goLinkFile(platform)}.go`;
    for (const file of [link, `internal/ffi/lib/${platform}/zz_generated_lib.go`]) {
      if (!generated.includes(file)) findings.push(`${directory}/${file} is not in the work tree: run binding generate --target go`);
    }
    const libsPath = join(release.libraries, platform, 'native-static-libs');
    const libs = existsSync(libsPath) ? readFileSync(libsPath, 'utf8').trim() : undefined;
    if (libs === undefined) findings.push(`${libsPath}: the native-static-libs of ${platform} are not there; release-go-static writes them beside the library (GN-15k)`);
    else if (libs === '' || libs.includes('\n')) findings.push(`${libsPath}: the native-static-libs of ${platform} name no library (GN-15k)`);
    else {
      for (const file of carriedLibraries(libs)) {
        const path = join(release.libraries, platform, file);
        if (!existsSync(path) || !statSync(path).isFile()) findings.push(`${path}: the native-static-libs of ${platform} name ${file}, which the release carries beside the library and release-go-static copies from the Rust toolchain, and it is not there (GN-15k)`);
        else carried.set(`${directory}/internal/ffi/lib/${platform}/${file}`, path);
      }
    }
    if (!generated.includes(link)) continue;
    const text = written.get(link) ?? '';
    const directive = goLinkDirective(platform);
    const lines = text.split('\n');
    if (!lines.includes(directive)) findings.push(`${directory}/${link} has no line \`${directive}\`: run binding generate --target go (GN-15k)`);
    else if (libs !== undefined && libs !== '' && !libs.includes('\n')) linked.set(link, lines.map((line) => (line === directive ? `${directive} ${libs}` : line)).join('\n'));
  }

  // GN-19b: the llvm tools of the pinned toolchain, never those of PATH.
  const llvm = join(run('rustc', ['--print', 'sysroot']).trim(), 'lib/rustlib', run('rustc', ['--print', 'host-tuple']).trim(), 'bin');
  const entry = testEntrySymbol(release.prefix);
  for (const platform of platforms) {
    const path = libraryOf(platform);
    const of = `${path}: the library of ${platform}`;
    if (!existsSync(path) || !statSync(path).isFile()) {
      findings.push(`${of} is not there`);
      continue;
    }
    findings.push(...libraryFindings(readFileSync(path), platform).map((finding) => `${of} ${finding}`));
    const entries = run(join(llvm, 'llvm-nm'), ['--defined-only', path]).split('\n').filter((line) => entry.test(line)).map((line) => line.trim().split(/\s+/).at(-1) ?? line);
    if (entries.length > 0) findings.push(`${of} holds the test entry points ${entries.join(', ')}`);
    const debug = debugSections(run(join(llvm, 'llvm-size'), ['-A', path]));
    if (debug.length > 0) findings.push(`${of} holds the debug sections ${debug.join(', ')}`);
  }
  if (findings.length > 0) throw new Refused(findings);

  const goVersion = /^go (\S+)$/m.exec(goMod)?.[1];

  // ---- The go.sum of the commit ---------------------------------------------------------------------------------------
  // GN-15g, B2.479: a module builds alone inside the commit of its tag (GN-15l), so the go.sum of that commit holds the
  // hashes of each sibling module, which Go gives for the tag of the sibling in the repository of the proof. No
  // tracked go.sum can hold them: they are the hashes of a commit that the release of the sibling made.
  let goSum: string | undefined;
  if (siblings.size > 0) {
    if (goVersion === undefined) throw new Error(`${directory}/go.mod names no Go version (GN-15)`);
    openBare();
    // A sibling that a rehearsal took from the rehearsal of that module is in the repository of the proof already,
    // and a tag of the repository replaces a rehearsal of an earlier run there.
    const tagged = [...siblings.values()].filter((s) => !s.rehearsed).map((s) => `${s.commit}:refs/tags/${s.tag}`);
    if (tagged.length > 0) git(['push', '--quiet', ...(rehearsal ? ['--force'] : []), bare, ...tagged]);
    const sums = join(work, 'sums');
    rmSync(sums, { recursive: true, force: true });
    mkdirSync(sums, { recursive: true });
    writeFileSync(join(sums, 'go.mod'), `module example.invalid/sums\n\ngo ${goVersion}\n`);
    mkdirSync(goEnv.GOMODCACHE, { recursive: true });
    const downloads: GoDownload[] = [];
    try {
      for (const s of siblings.values()) downloads.push(JSON.parse(go(['mod', 'download', '-json', `${s.module}@${s.version}`], sums)) as GoDownload);
    } finally {
      // The consumer of the proof fetches each module again, from the repository of the proof.
      cleanCache();
    }
    goSum = goSumWith(tracked.includes('go.sum') ? run('git', ['-C', root, 'show', `${parent}:${directory}/go.sum`]) : '', downloads);
  }

  // ---- The commit -----------------------------------------------------------------------------------------------------
  const added =new Map<string, string>(generated.map((file) => [`${directory}/${file}`, join(root, directory, file)]));
  if (goSum !== undefined) {
    writeFileSync(join(work, 'go.sum'), goSum);
    added.set(`${directory}/go.sum`, join(work, 'go.sum'));
  }
  for (const platform of platforms) added.set(`${directory}/internal/ffi/lib/${platform}/lib${release.library}.a`, libraryOf(platform));
  for (const [path, source] of carried) added.set(path, source);
  mkdirSync(join(work, 'link'), { recursive: true });
  for (const [link, text] of linked) {
    const copy = join(work, 'link', link.slice(link.lastIndexOf('/') + 1));
    writeFileSync(copy, text);
    added.set(`${directory}/${link}`, copy);
  }
  const index = { GIT_INDEX_FILE: join(work, 'index') };
  rmSync(index.GIT_INDEX_FILE, { force: true });
  // The Git that writes the objects of the commit: the one of the repository, and for a rehearsal the one of the
  // repository of the proof, so the repository gets no object.
  const objects = rehearsal ? bareGit : git;
  objects(['read-tree', parent], index);
  // GN-15g: the tests of the repository and the programs leave the index, and the checkout keeps them.
  for (const path of removed) {
    release.log(`${directory}/${path}: the released form leaves it out, since it ${form.leftOut.get(path) ?? ''} (GN-15g)`);
    objects(['update-index', '--force-remove', '--', `${directory}/${path}`], index);
  }
  for (const path of [...added.keys()].sort()) {
    const object = objects(['hash-object', '-w', '--no-filters', '--', added.get(path) ?? '']);
    objects(['update-index', '--add', '--cacheinfo', `100644,${object},${path}`], index);
  }
  const tree = objects(['write-tree'], index);
  // The dates of the commit of the tag, so that the same inputs give the same commit.
  const date = git(['show', '-s', '--format=%cI', parent]);
  // The commit of a rehearsal has an identity of its own, which no setting of the repository gives its repository.
  const identity = rehearsal ? { GIT_AUTHOR_NAME: 'binding rehearsal', GIT_AUTHOR_EMAIL: 'rehearsal@example.invalid', GIT_COMMITTER_NAME: 'binding rehearsal', GIT_COMMITTER_EMAIL: 'rehearsal@example.invalid' } : {};
  const commit = objects(['commit-tree', tree, '-p', parent, '-m', `chore(release): ${rehearsal ? 'Rehearse' : 'Carry'} the Go module of ${tag}`], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, ...identity });

  // ---- The tag of an earlier run --------------------------------------------------------------------------------------
  let local: string | undefined;
  let pushed: string | undefined;
  if (rehearsal) {
    unseen.push(`the tag ${moduleTag} of the repository and of the remote ${remote}: the rehearsal did not ask whether one of an earlier run names another commit`);
  } else {
    local = named(reference);
    if (local !== undefined && local !== commit) throw new Refused([`the tag ${moduleTag} of the repository names the commit ${local}, not the commit ${commit} of this run`]);
    // An annotated tag of the remote names its commit on the line of <reference>^{}, any other tag on its own line.
    const listed = new Map(git(['ls-remote', '--tags', remote, reference, `${reference}^{}`]).split('\n').filter((line) => line !== '').map((line) => {
      const [object, name] = line.split('\t');
      return [name ?? '', object ?? ''];
    }));
    pushed = listed.get(`${reference}^{}`) ?? listed.get(reference);
    if (pushed !== undefined && pushed !== commit) throw new Refused([`the tag ${moduleTag} of the remote ${remote} names the commit ${pushed}, not the commit ${commit} of this run`]);
  }

  // ---- The consumer ---------------------------------------------------------------------------------------------------
  // The repository of the proof holds the tag of this module beside the tags of its siblings (B2.479).
  openBare();
  if (rehearsal) bareGit(['update-ref', reference, commit]);
  else git(['push', '--quiet', bare, `${commit}:${reference}`]);
  if (goVersion === undefined) throw new Error(`${directory}/go.mod names no Go version (GN-15)`);
  mkdirSync(consumer, { recursive: true });
  for (const [name, text] of consumerFiles(goVersion, [{ module, version: tag, packages: publicPackages(form.carried, read) }])) writeFileSync(join(consumer, name), text);
  mkdirSync(goEnv.GOMODCACHE, { recursive: true });
  try {
    release.log(go(['mod', 'tidy'], consumer).trimEnd());
    release.log(go(['test', '-count=1', '.'], consumer).trimEnd());
    if (/^replace\b/m.test(readFileSync(join(consumer, 'go.mod'), 'utf8'))) throw new Error('the go.mod of the consumer holds a replace, so it does not fetch the module at its tag (GN-15g)');
    // B2.488: the module builds alone inside its commit, with its go.mod and its go.sum and no workspace, as Go builds
    // a module whose tree is the one of the tag: a go.mod that lacks a module of its graph or a go.sum that lacks a
    // hash fails here, before the tag, and not in the build of a consumer that vendors or works inside it.
    const alone = join(work, 'alone');
    rmSync(alone, { recursive: true, force: true });
    mkdirSync(join(alone, directory), { recursive: true });
    run('git', ['--git-dir', bare, '--work-tree', alone, 'checkout', '--quiet', '--force', commit, '--', directory], { GIT_INDEX_FILE: join(work, 'alone-index') });
    const built = start(goProgram, [...goPrefix, 'build', '-mod=readonly', './...'], goEnv, join(alone, directory));
    if (built.status !== 0) throw new Error(`go build -mod=readonly ./... of the commit ${commit} in ${directory} ended with status ${String(built.status)}: the module does not build alone in the tree of its tag; run binding scaffold of this version, whose go.mod requires each module of its graph and whose go.sum holds its hash (GN-15l, B2.488)`);
  } finally {
    cleanCache();
  }

  // ---- The tag --------------------------------------------------------------------------------------------------------
  if (rehearsal) {
    // The objects of the rehearsals before this one, which no tag of the repository of the proof names any more.
    bareGit(['prune', '--expire=now']);
    unseen.push(`a commit and a tag of the Go module: the rehearsal made none in the repository and pushed nothing; its commit ${commit} is in ${bare} alone`);
    return { commit, reference: undefined, unseen };
  }
  if (local === undefined) git(['tag', '-a', moduleTag, '-m', moduleTag, commit], { GIT_COMMITTER_DATE: date });
  return { commit, reference: pushed === undefined ? reference : undefined };
}
