// GN-19f, GN-15g: `binding release-go-module` makes the commit and the tag of a Go module with its static libraries.
// The cases run the command with stand-in programs that each case writes (git, go, rustc, llvm-nm, llvm-size): a
// stand-in records its arguments, its directory and its environment and answers as the case states, so a case reads
// which commands ran, in which order and with which index, dates and Go settings. No case starts the real tools.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { GO_PLATFORMS, goLinkFile } from '../src/generate/go.ts';
import { goModFindings, libraryFindings, publicPackages, Refused, releaseGoModule, type GoModuleRelease } from '../src/release/go-module.ts';

// ---- The form of a library ------------------------------------------------------------------------------------------

const elf = (machine: number): Buffer => {
  const header = Buffer.alloc(64);
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  header.writeUInt16LE(machine, 18);
  return header;
};
const ELF_X86_64 = elf(62);
const ELF_AARCH64 = elf(183);
const MACHO_ARM64 = ((): Buffer => {
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf, 0);
  header.writeUInt32LE(0x0100000c, 4);
  return header;
})();

// An ar archive of members, each with the name field as it is written (GNU `name/`, BSD `#1/<length>`).
function ar(members: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [Buffer.from('!<arch>\n')];
  for (const { name, data } of members) {
    parts.push(Buffer.from(`${name.padEnd(16)}${'0'.padEnd(12)}${'0'.padEnd(6)}${'0'.padEnd(6)}${'100644'.padEnd(8)}${String(data.length).padEnd(10)}\`\n`));
    parts.push(data);
    if (data.length % 2 === 1) parts.push(Buffer.from('\n'));
  }
  return Buffer.concat(parts);
}
const bsd = (name: string, data: Buffer): { name: string; data: Buffer } => {
  const padded = Buffer.alloc(Math.ceil((name.length + 1) / 4) * 4);
  padded.write(name);
  return { name: `#1/${String(padded.length)}`, data: Buffer.concat([padded, data]) };
};

test('a library whose every member is an object of its platform has no finding (GN-19f)', () => {
  const gnu = (object: Buffer): Buffer => ar([{ name: '/', data: Buffer.from('symbols') }, { name: '//', data: Buffer.from('a_long_member_name.o/\n') }, { name: 'a.o/', data: object }, { name: '/0', data: object }]);
  assert.deepEqual(libraryFindings(gnu(ELF_X86_64), 'linux_amd64'), []);
  assert.deepEqual(libraryFindings(gnu(ELF_AARCH64), 'linux_arm64'), []);
  assert.deepEqual(libraryFindings(ar([bsd('__.SYMDEF SORTED', Buffer.from('symbols')), bsd('a.o', MACHO_ARM64), { name: 'b.o', data: MACHO_ARM64 }]), 'darwin_arm64'), []);
});

test('a library that is empty, no archive, cut short or without an object is named (GN-19f)', () => {
  assert.deepEqual(libraryFindings(Buffer.alloc(0), 'linux_amd64'), ['is empty']);
  assert.deepEqual(libraryFindings(Buffer.from('not an archive'), 'linux_amd64'), ['is no ar archive']);
  assert.deepEqual(libraryFindings(ar([{ name: 'a.o/', data: ELF_X86_64 }]).subarray(0, 40), 'linux_amd64'), ['is an ar archive that ends inside a member']);
  assert.deepEqual(libraryFindings(ar([{ name: '/', data: Buffer.from('symbols') }]), 'linux_amd64'), ['holds no object']);
});

test('a member that is no object of the platform is named with what it is (GN-19f)', () => {
  assert.deepEqual(libraryFindings(ar([{ name: 'a.o/', data: ELF_X86_64 }, { name: 'b.o/', data: ELF_AARCH64 }]), 'linux_amd64'), ['holds 1 member that is no ELF x86-64 object: b.o (ELF AArch64)']);
  assert.deepEqual(libraryFindings(ar([bsd('a.o', MACHO_ARM64)]), 'linux_arm64'), ['holds 1 member that is no ELF AArch64 object: a.o (Mach-O arm64)']);
  assert.deepEqual(libraryFindings(ar([{ name: 'a.o/', data: ELF_X86_64 }, { name: 'notes.txt/', data: Buffer.from('some text of a file') }]), 'darwin_arm64'), ['holds 2 members that are no Mach-O arm64 object: a.o (ELF x86-64), notes.txt (no object)']);
});

// ---- The go.mod and the packages ------------------------------------------------------------------------------------

test('a go.mod of a release holds no replace and requires no module at v0.0.0 (GN-19f, GN-15f)', () => {
  assert.deepEqual(goModFindings('module github.com/polyspec/sample/packages/go\n\ngo 1.27.3\n\nrequire github.com/polyspec/points/packages/go v0.0.3\n'), []);
  assert.deepEqual(goModFindings('module m\n\nrequire github.com/polyspec/points/packages/go v0.0.0\n\nreplace github.com/polyspec/points/packages/go => ../../../points/packages/go\n'), [
    'go.mod requires github.com/polyspec/points/packages/go at v0.0.0, the development form of a dependency',
    'go.mod holds the line `replace github.com/polyspec/points/packages/go => ../../../points/packages/go`',
  ]);
  assert.deepEqual(goModFindings('module m\n\nrequire (\n\tgithub.com/polyspec/a/packages/go v0.0.0 // indirect\n\tgithub.com/polyspec/b/packages/go v1.0.0\n)\n\nreplace (\n\tgithub.com/polyspec/a/packages/go => ../a\n)\n'), [
    'go.mod requires github.com/polyspec/a/packages/go at v0.0.0, the development form of a dependency',
    'go.mod holds the line `replace github.com/polyspec/a/packages/go => ../a`',
  ]);
});

test('the public packages of a module are its directories with a Go file that is no test, outside internal (GN-19f)', () => {
  assert.deepEqual(publicPackages(['go.mod', 'zz_generated_sample.go', 'zz_generated_sample_test.go', 'errors/zz_generated_errors.go', 'geometry/shapes/zz_generated_shapes.go', 'internal/binding/zz_generated_binding.go', 'tests/only_test.go', 'host/internal/x.go']), ['', 'errors', 'geometry/shapes']);
});

// ---- The command with stand-in programs -----------------------------------------------------------------------------

interface Answer {
  tool: string;
  // A regular expression that the arguments of the call, joined by one space, match.
  match: string;
  stdout?: string;
  status?: number;
}
interface Call {
  tool: string;
  argv: string[];
  cwd: string;
  env: Record<string, string>;
}

// The stand-in program: it appends its call to calls.jsonl of the directory STANDIN and gives the first answer of
// answers.json that names it and matches its arguments; `{last}` of an answer is the last argument. A call without an
// answer prints nothing and ends with 0.
const STAND_IN = `#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs');
const { basename, join } = require('node:path');
const dir = process.env.STANDIN;
const tool = basename(process.argv[1]);
const argv = process.argv.slice(2);
const kept = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(GIT_|GO|CGO_)/.test(name)));
appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify({ tool, argv, cwd: process.cwd(), env: kept }) + '\\n');
const answer = JSON.parse(readFileSync(join(dir, 'answers.json'), 'utf8')).find((a) => a.tool === tool && new RegExp(a.match).test(argv.join(' ')));
if (answer !== undefined && answer.stdout !== undefined) process.stdout.write(answer.stdout.replaceAll('{last}', argv[argv.length - 1] ?? ''));
process.exit(answer === undefined || answer.status === undefined ? 0 : answer.status);
`;

const TAG_COMMIT = '1'.repeat(40);
const RELEASE_COMMIT = '2'.repeat(40);
const OTHER_COMMIT = '3'.repeat(40);
const GO_MOD = 'module github.com/polyspec/sample/packages/go\n\ngo 1.27.3\n';
const PLATFORMS = GO_PLATFORMS;
const OBJECTS = { linux_amd64: ELF_X86_64, linux_arm64: ELF_AARCH64, linux_amd64_musl: ELF_X86_64, linux_arm64_musl: ELF_AARCH64, darwin_arm64: MACHO_ARM64 };

interface Scene {
  release: GoModuleRelease;
  dir: string;
  calls: () => Call[];
  lines: () => string[];
}

// A repository of the case with the generated files of the Go module in its work tree, the libraries of the five
// platforms and the stand-ins on PATH; `answers` come before the answers of a run in which every check passes.
function scene(t: { after: (fn: () => void) => void }, answers: Answer[] = []): Scene {
  const dir = mkdtempSync(join(tmpdir(), 'binding-release-go-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'repository');
  const bin = join(dir, 'bin');
  const llvm = join(dir, 'sysroot/lib/rustlib/host-tuple/bin');
  for (const [at, tools] of [[bin, ['git', 'go', 'rustc']], [llvm, ['llvm-nm', 'llvm-size']]] as const) {
    mkdirSync(at, { recursive: true });
    for (const tool of tools) {
      writeFileSync(join(at, tool), STAND_IN);
      chmodSync(join(at, tool), 0o755);
    }
  }
  const write = (path: string, data: string | Buffer): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  };
  const module = join(root, 'packages/go');
  write(join(module, 'go.mod'), GO_MOD);
  write(join(module, 'zz_generated_sample.go'), 'package sample\n');
  write(join(module, 'internal/binding/zz_generated_binding.go'), 'package binding\n');
  for (const platform of PLATFORMS) {
    write(join(module, `internal/binding/zz_generated_link_${goLinkFile(platform)}.go`), 'package binding\n');
    write(join(module, `internal/ffi/lib/${platform}/zz_generated_lib.go`), `package ${platform}\n`);
    write(join(dir, 'libraries', platform, 'libpolyspec_sample_go.a'), ar([{ name: 'a.o', data: OBJECTS[platform] }]));
  }
  // What is no generated file of the Go module stays out of the commit.
  write(join(module, 'internal/ffi/generated/lib.rs'), '// generated\n');
  write(join(module, 'host/notes.txt'), 'untracked\n');
  const passing: Answer[] = [
    { tool: 'rustc', match: '^--print sysroot$', stdout: `${join(dir, 'sysroot')}\n` },
    { tool: 'rustc', match: '^--print host-tuple$', stdout: 'host-tuple\n' },
    { tool: 'git', match: 'rev-parse --verify --quiet refs/tags/v0\\.0\\.1\\^\\{commit\\}$', stdout: `${TAG_COMMIT}\n` },
    { tool: 'git', match: 'rev-parse --verify HEAD\\^\\{commit\\}$', stdout: `${TAG_COMMIT}\n` },
    { tool: 'git', match: ' show 1+:packages/go/go\\.mod$', stdout: GO_MOD },
    { tool: 'git', match: ' ls-tree ', stdout: 'packages/go/go.mod\0packages/go/host/host.go\0packages/go/internal/ffi/Cargo.toml\0' },
    { tool: 'git', match: ' hash-object ', stdout: 'object-of:{last}\n' },
    { tool: 'git', match: ' write-tree$', stdout: 'the-tree\n' },
    { tool: 'git', match: ' show -s --format=%cI ', stdout: '2026-11-01T10:00:00+09:00\n' },
    { tool: 'git', match: ' commit-tree ', stdout: `${RELEASE_COMMIT}\n` },
    { tool: 'git', match: 'rev-parse --verify --quiet refs/tags/packages/go/v0\\.0\\.1\\^\\{commit\\}$', status: 1 },
    { tool: 'llvm-nm', match: '', stdout: '0000000000000000 T _polyspec_sample__free\n0000000000000010 T _polyspec_sample_tag__echo_x\n' },
    { tool: 'llvm-size', match: '', stdout: 'a.o   (ex lib.a):\nsection   size   addr\n__text   1200   0\n__debug_info   0   1200\n' },
  ];
  writeFileSync(join(dir, 'answers.json'), JSON.stringify([...answers, ...passing]));
  writeFileSync(join(dir, 'calls.jsonl'), '');
  const calls = (): Call[] => readFileSync(join(dir, 'calls.jsonl'), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Call);
  return {
    dir,
    calls,
    // Each call as its tool and arguments, without the `-C <repository>` of a Git command of the repository.
    lines: () => calls().map((c) => `${c.tool} ${(c.argv[0] === '-C' && c.argv[1] === root ? c.argv.slice(2) : c.argv).join(' ')}`),
    release: {
      root,
      directory: 'packages/go',
      module: 'github.com/polyspec/sample/packages/go',
      tag: 'v0.0.1',
      library: 'polyspec_sample_go',
      prefix: 'polyspec_sample',
      libraries: join(dir, 'libraries'),
      work: join(dir, 'work'),
      remote: 'origin',
      env: { PATH: bin, STANDIN: dir },
      log: () => undefined,
    },
  };
}

const refusal = (run: () => unknown): string[] => {
  try {
    run();
  } catch (error) {
    if (error instanceof Refused) return error.findings;
    throw error;
  }
  throw new Error('the command did not refuse');
};
// The calls that change the repository: a refused run makes none of them.
const WRITES = /^git (read-tree|hash-object|update-index|write-tree|commit-tree|tag|push|init) /;

test('the command makes the commit through an index of the run, proves it by a consumer, tags it and gives the reference to push (GN-19f)', (t) => {
  const s = scene(t);
  const { release } = s;
  const result = releaseGoModule(release);
  assert.deepEqual(result, { commit: RELEASE_COMMIT, reference: 'refs/tags/packages/go/v0.0.1' });
  const work = release.work;
  const bare = join(work, 'remote.git');
  const module = join(release.root, 'packages/go');
  const libraryOf = (platform: string): string => join(release.libraries, platform, 'libpolyspec_sample_go.a');
  const llvm = join(s.dir, 'sysroot/lib/rustlib/host-tuple/bin');
  // The files of the commit in the order of their paths in the tree: each generated file, then the library of each
  // platform beside the file of its package.
  const added: [string, string][] = [
    ['packages/go/internal/binding/zz_generated_binding.go', join(module, 'internal/binding/zz_generated_binding.go')],
    ['packages/go/internal/binding/zz_generated_link_darwin_arm64.go', join(module, 'internal/binding/zz_generated_link_darwin_arm64.go')],
    ['packages/go/internal/binding/zz_generated_link_linux_amd64.go', join(module, 'internal/binding/zz_generated_link_linux_amd64.go')],
    ['packages/go/internal/binding/zz_generated_link_linux_arm64.go', join(module, 'internal/binding/zz_generated_link_linux_arm64.go')],
    ['packages/go/internal/binding/zz_generated_link_musl_linux_amd64.go', join(module, 'internal/binding/zz_generated_link_musl_linux_amd64.go')],
    ['packages/go/internal/binding/zz_generated_link_musl_linux_arm64.go', join(module, 'internal/binding/zz_generated_link_musl_linux_arm64.go')],
    ['packages/go/internal/ffi/lib/darwin_arm64/libpolyspec_sample_go.a', libraryOf('darwin_arm64')],
    ['packages/go/internal/ffi/lib/darwin_arm64/zz_generated_lib.go', join(module, 'internal/ffi/lib/darwin_arm64/zz_generated_lib.go')],
    ['packages/go/internal/ffi/lib/linux_amd64/libpolyspec_sample_go.a', libraryOf('linux_amd64')],
    ['packages/go/internal/ffi/lib/linux_amd64/zz_generated_lib.go', join(module, 'internal/ffi/lib/linux_amd64/zz_generated_lib.go')],
    ['packages/go/internal/ffi/lib/linux_amd64_musl/libpolyspec_sample_go.a', libraryOf('linux_amd64_musl')],
    ['packages/go/internal/ffi/lib/linux_amd64_musl/zz_generated_lib.go', join(module, 'internal/ffi/lib/linux_amd64_musl/zz_generated_lib.go')],
    ['packages/go/internal/ffi/lib/linux_arm64/libpolyspec_sample_go.a', libraryOf('linux_arm64')],
    ['packages/go/internal/ffi/lib/linux_arm64/zz_generated_lib.go', join(module, 'internal/ffi/lib/linux_arm64/zz_generated_lib.go')],
    ['packages/go/internal/ffi/lib/linux_arm64_musl/libpolyspec_sample_go.a', libraryOf('linux_arm64_musl')],
    ['packages/go/internal/ffi/lib/linux_arm64_musl/zz_generated_lib.go', join(module, 'internal/ffi/lib/linux_arm64_musl/zz_generated_lib.go')],
    ['packages/go/zz_generated_sample.go', join(module, 'zz_generated_sample.go')],
  ];
  assert.deepEqual(s.lines(), [
    'git rev-parse --verify --quiet refs/tags/v0.0.1^{commit}',
    'git rev-parse --verify HEAD^{commit}',
    `git show ${TAG_COMMIT}:packages/go/go.mod`,
    'rustc --print sysroot',
    'rustc --print host-tuple',
    ...PLATFORMS.flatMap((platform) => [`llvm-nm --defined-only ${libraryOf(platform)}`, `llvm-size -A ${libraryOf(platform)}`]),
    `git ls-tree -r -z --name-only ${TAG_COMMIT} -- packages/go`,
    `git read-tree ${TAG_COMMIT}`,
    ...added.flatMap(([path, file]) => [`git hash-object -w --no-filters -- ${file}`, `git update-index --add --cacheinfo 100644,object-of:${file},${path}`]),
    'git write-tree',
    `git show -s --format=%cI ${TAG_COMMIT}`,
    `git commit-tree the-tree -p ${TAG_COMMIT} -m chore(release): Carry the Go module of v0.0.1`,
    'git rev-parse --verify --quiet refs/tags/packages/go/v0.0.1^{commit}',
    'git ls-remote --tags origin refs/tags/packages/go/v0.0.1 refs/tags/packages/go/v0.0.1^{}',
    `git init --quiet --bare ${bare}`,
    `git --git-dir ${bare} config maintenance.auto false`,
    `git --git-dir ${bare} config gc.auto 0`,
    `git --git-dir ${bare} config receive.autogc false`,
    `git push --quiet ${bare} ${RELEASE_COMMIT}:refs/tags/packages/go/v0.0.1`,
    'go mod tidy',
    'go test -count=1 .',
    'go clean -modcache',
    `git tag -a packages/go/v0.0.1 -m packages/go/v0.0.1 ${RELEASE_COMMIT}`,
  ]);
  const calls = s.calls();
  const of = (pattern: RegExp): Call[] => calls.filter((c) => pattern.test(`${c.tool} ${c.argv.join(' ')}`));
  // The llvm tools are those of the toolchain, not of PATH.
  for (const c of of(/^llvm-/)) assert.ok(existsSync(join(llvm, c.tool)));
  // The index is the one of the run for the commands that read or write it, and for no other command.
  for (const c of of(/ (read-tree|update-index|write-tree)( |$)/)) assert.equal(c.env['GIT_INDEX_FILE'], join(work, 'index'));
  for (const c of of(/ (commit-tree|tag|push|rev-parse|hash-object) /)) assert.equal(c.env['GIT_INDEX_FILE'], undefined);
  // The dates of the commit and of the tag are the committer date of the commit of the tag.
  const [commitTree] = of(/ commit-tree /);
  assert.equal(commitTree?.env['GIT_AUTHOR_DATE'], '2026-11-01T10:00:00+09:00');
  assert.equal(commitTree?.env['GIT_COMMITTER_DATE'], '2026-11-01T10:00:00+09:00');
  assert.equal(of(/^git .* tag -a /)[0]?.env['GIT_COMMITTER_DATE'], '2026-11-01T10:00:00+09:00');
  // The consumer: Git reads the repository of the run in place of the remote, and Go reads no setting of the machine.
  const consumer = join(work, 'consumer');
  assert.equal(readFileSync(join(work, 'gitconfig'), 'utf8'), `[url "${bare}"]\n\tinsteadOf = https://github.com/polyspec/sample\n`);
  assert.equal(readFileSync(join(consumer, 'go.mod'), 'utf8'), 'module example.invalid/consumer\n\ngo 1.27.3\n\nrequire github.com/polyspec/sample/packages/go v0.0.1\n');
  // The packages of the tree of the commit: the tracked host package and the generated root package, none of internal.
  assert.match(readFileSync(join(consumer, 'consumer_test.go'), 'utf8'), /import \(\n\t"testing"\n\n\t_ "github\.com\/polyspec\/sample\/packages\/go"\n\t_ "github\.com\/polyspec\/sample\/packages\/go\/host"\n\)/);
  for (const c of of(/^go /)) {
    if (c.argv[0] !== 'clean') assert.equal(c.cwd.endsWith('/work/consumer'), true, c.argv.join(' '));
    assert.deepEqual(
      Object.fromEntries(['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GOENV', 'GOTOOLCHAIN', 'GOWORK', 'GOPROXY', 'GOSUMDB', 'GOMODCACHE', 'GOCACHE', 'GOFLAGS', 'CGO_ENABLED', 'CGO_LDFLAGS'].map((name) => [name, c.env[name]])),
      { GIT_CONFIG_GLOBAL: join(work, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GOENV: 'off', GOTOOLCHAIN: 'local', GOWORK: 'off', GOPROXY: 'direct', GOSUMDB: 'off', GOMODCACHE: join(work, 'modcache'), GOCACHE: join(work, 'gocache'), GOFLAGS: '', CGO_ENABLED: '1', CGO_LDFLAGS: '' },
    );
  }
});

test('every failed check is named and the command changes nothing (GN-19f)', (t) => {
  const s = scene(t, [
    { tool: 'git', match: 'rev-parse --verify HEAD\\^\\{commit\\}$', stdout: `${OTHER_COMMIT}\n` },
    { tool: 'git', match: ' show 1+:packages/go/go\\.mod$', stdout: `${GO_MOD}\nrequire github.com/polyspec/points/packages/go v0.0.0\n` },
    { tool: 'llvm-nm', match: 'linux_arm64/', stdout: '0000000000000000 T polyspec_sample__panic_test\n' },
    { tool: 'llvm-size', match: 'darwin_arm64', stdout: 'a.o:\nsection   size   addr\n__debug_info   340   0\n__debug_str   12   340\n' },
  ]);
  rmSync(join(s.release.root, 'packages/go/internal/binding/zz_generated_link_linux_amd64.go'));
  rmSync(join(s.release.libraries, 'linux_amd64/libpolyspec_sample_go.a'));
  assert.deepEqual(refusal(() => releaseGoModule(s.release)), [
    `HEAD is the commit ${OTHER_COMMIT}, not the commit ${TAG_COMMIT} of the tag v0.0.1`,
    'go.mod requires github.com/polyspec/points/packages/go at v0.0.0, the development form of a dependency',
    'packages/go/internal/binding/zz_generated_link_linux_amd64.go is not in the work tree: run binding generate --target go',
    `${join(s.release.libraries, 'linux_amd64/libpolyspec_sample_go.a')}: the library of linux_amd64 is not there`,
    `${join(s.release.libraries, 'linux_arm64/libpolyspec_sample_go.a')}: the library of linux_arm64 holds the test entry points polyspec_sample__panic_test`,
    `${join(s.release.libraries, 'darwin_arm64/libpolyspec_sample_go.a')}: the library of darwin_arm64 holds the debug sections __debug_info, __debug_str`,
  ]);
  assert.deepEqual(s.lines().filter((line) => WRITES.test(line)), []);
});

test('a tag, a module path and a library of another form are refused before any command reads the repository (GN-19f)', (t) => {
  const s = scene(t);
  assert.deepEqual(refusal(() => releaseGoModule({ ...s.release, tag: '0.0.1' })), ['the tag 0.0.1 is not vX.Y.Z']);
  assert.deepEqual(refusal(() => releaseGoModule({ ...s.release, module: 'github.com/polyspec/sample/go' })), ['github.com/polyspec/sample/go: the Go module is at packages/go of its repository, not at go, the directory of its module path (GN-15)']);
  assert.deepEqual(s.lines(), []);
  const absent = scene(t, [{ tool: 'git', match: 'rev-parse --verify --quiet refs/tags/v0\\.0\\.1\\^\\{commit\\}$', status: 1 }]);
  assert.deepEqual(refusal(() => releaseGoModule(absent.release)), ['the repository has no tag v0.0.1']);
});

test('a tag of the repository that names the commit of the run is left as it is, and one that names another commit fails the command (GN-19f)', (t) => {
  const same = scene(t, [{ tool: 'git', match: 'rev-parse --verify --quiet refs/tags/packages/go/v0\\.0\\.1\\^\\{commit\\}$', stdout: `${RELEASE_COMMIT}\n` }]);
  assert.deepEqual(releaseGoModule(same.release), { commit: RELEASE_COMMIT, reference: 'refs/tags/packages/go/v0.0.1' });
  assert.deepEqual(same.lines().filter((line) => line.startsWith('git tag ')), []);
  const other = scene(t, [{ tool: 'git', match: 'rev-parse --verify --quiet refs/tags/packages/go/v0\\.0\\.1\\^\\{commit\\}$', stdout: `${OTHER_COMMIT}\n` }]);
  assert.deepEqual(refusal(() => releaseGoModule(other.release)), [`the tag packages/go/v0.0.1 of the repository names the commit ${OTHER_COMMIT}, not the commit ${RELEASE_COMMIT} of this run`]);
  assert.deepEqual(other.lines().filter((line) => /^(git (tag|push|init)|go) /.test(line)), []);
});

test('a remote that holds the tag at the commit of the run gives no reference to push, and at another commit fails the command (GN-19f)', (t) => {
  const tagObject = '4'.repeat(40);
  const pushed = scene(t, [{ tool: 'git', match: ' ls-remote ', stdout: `${tagObject}\trefs/tags/packages/go/v0.0.1\n${RELEASE_COMMIT}\trefs/tags/packages/go/v0.0.1^{}\n` }]);
  assert.deepEqual(releaseGoModule(pushed.release), { commit: RELEASE_COMMIT, reference: undefined });
  const other = scene(t, [{ tool: 'git', match: ' ls-remote ', stdout: `${tagObject}\trefs/tags/packages/go/v0.0.1\n${OTHER_COMMIT}\trefs/tags/packages/go/v0.0.1^{}\n` }]);
  assert.deepEqual(refusal(() => releaseGoModule(other.release)), [`the tag packages/go/v0.0.1 of the remote origin names the commit ${OTHER_COMMIT}, not the commit ${RELEASE_COMMIT} of this run`]);
  // A tag of the remote that is no annotated tag names its commit itself.
  const light = scene(t, [{ tool: 'git', match: ' ls-remote ', stdout: `${OTHER_COMMIT}\trefs/tags/packages/go/v0.0.1\n` }]);
  assert.deepEqual(refusal(() => releaseGoModule(light.release)), [`the tag packages/go/v0.0.1 of the remote origin names the commit ${OTHER_COMMIT}, not the commit ${RELEASE_COMMIT} of this run`]);
  assert.deepEqual(light.lines().filter((line) => /^(git (tag|push|init)|go) /.test(line)), []);
});

test('a consumer whose test fails leaves the repository without the tag, and the module cache is removed (GN-19f)', (t) => {
  const s = scene(t, [{ tool: 'go', match: '^test ', status: 1 }]);
  assert.throws(() => releaseGoModule(s.release), /go test -count=1 \. ended with status 1/);
  const lines = s.lines();
  assert.deepEqual(lines.filter((line) => line.startsWith('git tag ')), []);
  assert.equal(lines.at(-1), 'go clean -modcache');
});

test('a run after an earlier run removes the module cache, the repository and the consumer of that run first (GN-19f)', (t) => {
  const s = scene(t);
  for (const left of ['modcache/cache', 'remote.git/objects', 'consumer']) mkdirSync(join(s.release.work, left), { recursive: true });
  writeFileSync(join(s.release.work, 'consumer/go.mod'), 'module example.invalid/consumer\n\nreplace x => ../x\n');
  releaseGoModule(s.release);
  const lines = s.lines();
  assert.ok(lines.indexOf('go clean -modcache') < lines.indexOf(`git init --quiet --bare ${join(s.release.work, 'remote.git')}`));
  assert.equal(existsSync(join(s.release.work, 'remote.git/objects')), false);
  assert.doesNotMatch(readFileSync(join(s.release.work, 'consumer/go.mod'), 'utf8'), /replace/);
});

// ---- The command line -----------------------------------------------------------------------------------------------

const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const binding = (argv: string[]): { status: number | null; stdout: string; stderr: string } => spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8' });

test('binding release-go-module requires its tag, its libraries and its work directory, and names its usage (GN-19f, GN-1c)', () => {
  for (const argv of [['release-go-module'], ['release-go-module', '--tag', 'v0.0.1', '--libraries', '/l'], ['release-go-module', '--tag', 'v0.0.1', '--work', '/w'], ['release-go-module', '--libraries', '/l', '--work', '/w'], ['release-go-module', '--tag', 'v0.0.1', '--libraries', '/l', '--work', '/w', '--push', 'origin']]) {
    const run = binding(argv);
    assert.equal(run.status, 2, argv.join(' '));
    assert.match(run.stderr, /usage: .*binding release-go-module \(--root <repository> \| --contract <interface\.json>\) --tag vX\.Y\.Z --libraries <directory> --work <directory> \[--remote <name>\]/);
    assert.equal(run.stdout, '');
  }
});

test('binding release-go-module refuses a contract without the target go by name (GN-19f)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'binding-release-go-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'packages/rust'), { recursive: true });
  writeFileSync(join(dir, 'packages/rust/interface.json'), JSON.stringify({ library: 'sample', targets: ['node'], core: { crate: 'polyspec-sample', path: 'packages/rust' }, packages: {} }));
  const run = binding(['release-go-module', '--root', dir, '--tag', 'v0.0.1', '--libraries', join(dir, 'l'), '--work', join(dir, 'w')]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /binding: .*interface\.json names no Go module \(packages\.go\), so the repository has no Go module to release/);
});
