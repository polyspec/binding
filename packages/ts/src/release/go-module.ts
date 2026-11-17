// GN-15g, GN-19f: the released form of a Go module. A release carries the Go module in a commit that the tag
// <directory of the Go module>/vX.Y.Z names: its tree adds the generated files that the form can build
// (goReleaseFiles) and the static library of each platform to the tree of the commit of the tag vX.Y.Z. `binding release-go-module` makes that commit and tag in the
// repository of a contract (releaseGoModule), and the end-to-end check makes the same form in a repository of its
// work directory (GN-14f); both read the tag, the consumer, the debug sections and the test entry points from here.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GO_PLATFORMS, GO_TAG_GUARD_FILE, goLinkFile, goTestTagsOf } from '../generate/go.ts';
import { isGoGenerated } from '../generate/index.ts';
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
  const required: string[] = [];
  const replaced: string[] = [];
  let block: 'require' | 'replace' | undefined;
  for (const raw of goMod.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (line === '') continue;
    if (block !== undefined) {
      if (line === ')') block = undefined;
      else (block === 'require' ? required : replaced).push(line);
      continue;
    }
    const [, directive, rest] = /^(require|replace)\s+(.*)$/.exec(line) ?? [];
    if (directive !== 'require' && directive !== 'replace') continue;
    if (rest === '(') block = directive;
    else if (rest !== undefined) (directive === 'require' ? required : replaced).push(rest);
  }
  return [
    ...required.map((line) => line.split(/\s+/)).filter(([, version]) => version === 'v0.0.0').map(([module]) => `go.mod requires ${String(module)} at v0.0.0, the development form of a dependency`),
    ...replaced.map((line) => `go.mod holds the line \`replace ${line}\``),
  ];
}

// GN-19f: the packages of a module that a consumer can import, from the paths of its files in the module: each
// directory with a Go file that is no test, outside every directory `internal`.
export function publicPackages(files: readonly string[]): string[] {
  const found = new Set<string>();
  for (const file of files) {
    if (!file.endsWith('.go') || file.endsWith('_test.go')) continue;
    const dirs = file.split('/').slice(0, -1);
    if (!dirs.includes('internal')) found.add(dirs.join('/'));
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
  // The generated files that the commit of a release carries, sorted.
  carried: string[];
  // Each generated file that it leaves out, with the reason as the end of a sentence about the file.
  leftOut: Map<string, string>;
}

// GN-15g: the generated files of a Go module that the commit of a release carries, of `files`, the text of each Go
// file by its path; a file that the generator did not write (isGoGenerated) is in neither part. The released form
// holds only what can be built in it, so the commit leaves out each generated file whose build constraint names a
// build tag of a test feature (GN-13ba), test or not, because such a file calls test entry points that the library of
// a release may not hold (GN-19f), and the guard of those tags (GN-13bf), which would ask for tags that the form does
// not carry. A constraint of other tags, such as `musl` of a link file, leaves a file in. Both the commit of
// `binding release-go-module` and the source of the released form of the end-to-end check (GN-14f) read this.
export function goReleaseFiles(files: ReadonlyMap<string, string>): GoReleaseFiles {
  const carried: string[] = [];
  const leftOut = new Map<string, string>();
  for (const [path, text] of files) {
    if (!isGoGenerated(path)) continue;
    const tags = goTestTagsOf(text);
    if (tags.length > 0) leftOut.set(path, `is behind the build tag${tags.length === 1 ? '' : 's'} ${tags.join(', ')} of a test feature`);
    else if (path.slice(path.lastIndexOf('/') + 1) === GO_TAG_GUARD_FILE) leftOut.set(path, 'is the guard of the build tags of the generated tests (GN-13bf)');
    else carried.push(path);
  }
  return { carried: carried.sort(), leftOut };
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
}

export interface GoModuleReleased {
  commit: string;
  // The reference that the recipe pushes to the remote, or undefined when the remote holds the tag at the commit.
  reference: string | undefined;
}

// GN-19f: makes the commit and the tag <directory>/vX.Y.Z of the Go module in the repository. It runs every check to
// its end and throws Refused with each failed one before it writes an object; a command that fails for another reason
// throws an Error with its arguments and its status. It pushes nothing to the remote.
export function releaseGoModule(release: GoModuleRelease): GoModuleReleased {
  const { root, directory, module, tag, work, remote } = release;
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

  // ---- The checks -----------------------------------------------------------------------------------------------------
  const parent = named(`refs/tags/${tag}`);
  if (parent === undefined) throw new Refused([`the repository has no tag ${tag}`]);
  const findings: string[] = [];
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']);
  if (head !== parent) findings.push(`HEAD is the commit ${head}, not the commit ${parent} of the tag ${tag}`);
  const goMod = run('git', ['-C', root, 'show', `${parent}:${directory}/go.mod`]);
  findings.push(...goModFindings(goMod));

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
  const generated = goReleaseFiles(written).carried;
  // GN-15g: the tree of the commit holds every file that the commit of the tag tracks, so a generated file of that
  // commit that the release does not write over is in the released form as that commit holds it.
  const tracked = run('git', ['-C', root, 'ls-tree', '-r', '-z', '--name-only', parent, '--', directory]).split('\0').filter((path) => path !== '').map((path) => path.slice(directory.length + 1));
  const kept = new Map<string, string>();
  for (const path of tracked) if (isGoGenerated(path) && !generated.includes(path)) kept.set(path, run('git', ['-C', root, 'show', `${parent}:${directory}/${path}`]));
  for (const [path, why] of goReleaseFiles(kept).leftOut) findings.push(`${directory}/${path}: the commit of the tag ${tag} tracks it, and it ${why}; the released form holds no such file, which cannot be built in it (GN-15g)`);
  // GN-15k: the link file of each platform with the native-static-libs that the release build of that platform printed,
  // which release-go-static wrote beside its library; the commit takes it in place of the file of the work tree.
  const linked = new Map<string, string>();
  const carried = new Map<string, string>();
  for (const platform of GO_PLATFORMS) {
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
  const libraryOf = (platform: GoPlatform): string => join(release.libraries, platform, `lib${release.library}.a`);
  const entry = testEntrySymbol(release.prefix);
  for (const platform of GO_PLATFORMS) {
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

  // ---- The commit -----------------------------------------------------------------------------------------------------
  const added =new Map<string, string>(generated.map((file) => [`${directory}/${file}`, join(root, directory, file)]));
  for (const platform of GO_PLATFORMS) added.set(`${directory}/internal/ffi/lib/${platform}/lib${release.library}.a`, libraryOf(platform));
  for (const [path, source] of carried) added.set(path, source);
  mkdirSync(join(work, 'link'), { recursive: true });
  for (const [link, text] of linked) {
    const copy = join(work, 'link', link.slice(link.lastIndexOf('/') + 1));
    writeFileSync(copy, text);
    added.set(`${directory}/${link}`, copy);
  }
  const index = { GIT_INDEX_FILE: join(work, 'index') };
  rmSync(index.GIT_INDEX_FILE, { force: true });
  git(['read-tree', parent], index);
  for (const path of [...added.keys()].sort()) {
    const object = git(['hash-object', '-w', '--no-filters', '--', added.get(path) ?? '']);
    git(['update-index', '--add', '--cacheinfo', `100644,${object},${path}`], index);
  }
  const tree = git(['write-tree'], index);
  // The dates of the commit of the tag, so that the same inputs give the same commit.
  const date = git(['show', '-s', '--format=%cI', parent]);
  const commit = git(['commit-tree', tree, '-p', parent, '-m', `chore(release): Carry the Go module of ${tag}`], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });

  // ---- The tag of an earlier run --------------------------------------------------------------------------------------
  const local = named(reference);
  if (local !== undefined && local !== commit) throw new Refused([`the tag ${moduleTag} of the repository names the commit ${local}, not the commit ${commit} of this run`]);
  // An annotated tag of the remote names its commit on the line of <reference>^{}, any other tag on its own line.
  const listed = new Map(git(['ls-remote', '--tags', remote, reference, `${reference}^{}`]).split('\n').filter((line) => line !== '').map((line) => {
    const [object, name] = line.split('\t');
    return [name ?? '', object ?? ''];
  }));
  const pushed = listed.get(`${reference}^{}`) ?? listed.get(reference);
  if (pushed !== undefined && pushed !== commit) throw new Refused([`the tag ${moduleTag} of the remote ${remote} names the commit ${pushed}, not the commit ${commit} of this run`]);

  // ---- The consumer ---------------------------------------------------------------------------------------------------
  const bare = join(work, 'remote.git');
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
  cleanCache();
  rmSync(bare, { recursive: true, force: true });
  rmSync(consumer, { recursive: true, force: true });
  run('git', ['init', '--quiet', '--bare', bare]);
  for (const [key, value] of [['maintenance.auto', 'false'], ['gc.auto', '0'], ['receive.autogc', 'false']] as const) run('git', ['--git-dir', bare, 'config', key, value]);
  git(['push', '--quiet', bare, `${commit}:${reference}`]);
  writeFileSync(gitConfig, `[url "${bare}"]\n\tinsteadOf = https://github.com/${at.owner}/${at.repository}\n`);
  const goVersion = /^go (\S+)$/m.exec(goMod)?.[1];
  if (goVersion === undefined) throw new Error(`${directory}/go.mod names no Go version (GN-15)`);
  mkdirSync(consumer, { recursive: true });
  for (const [name, text] of consumerFiles(goVersion, [{ module, version: tag, packages: publicPackages([...tracked, ...generated]) }])) writeFileSync(join(consumer, name), text);
  mkdirSync(goEnv.GOMODCACHE, { recursive: true });
  try {
    release.log(go(['mod', 'tidy'], consumer).trimEnd());
    release.log(go(['test', '-count=1', '.'], consumer).trimEnd());
    if (/^replace\b/m.test(readFileSync(join(consumer, 'go.mod'), 'utf8'))) throw new Error('the go.mod of the consumer holds a replace, so it does not fetch the module at its tag (GN-15g)');
  } finally {
    cleanCache();
  }

  // ---- The tag --------------------------------------------------------------------------------------------------------
  if (local === undefined) git(['tag', '-a', moduleTag, '-m', moduleTag, commit], { GIT_COMMITTER_DATE: date });
  return { commit, reference: pushed === undefined ? reference : undefined };
}
