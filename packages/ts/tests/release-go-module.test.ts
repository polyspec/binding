// GN-19f, GN-15g: `binding release-go-module` makes the commit and the tag of a Go module with its static libraries.
// The cases run the command with stand-in programs that each case writes (git, go, rustc, llvm-nm, llvm-size): a
// stand-in records its arguments, its directory and its environment and answers as the case states, so a case reads
// which commands ran, in which order and with which index, dates and Go settings. No case starts the real tools.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { GO_PLATFORMS, goLinkFile } from '../src/generate/go.ts';
import { generate } from '../src/generate/index.ts';
import { carriedLibraries, goImports, goModFindings, goModRequires, goModUnused, goPackageOf, goReleaseFiles, goSumWith, libraryFindings, publicPackages, Refused, rehearsalReport, releaseGoModule, siblingRequires, type GoModuleRelease } from '../src/release/go-module.ts';

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

// The text of a Go file of a case by its path: the package of its directory, `main` for a file main.go.
const clauseOf = (path: string): string => `package ${path.endsWith('main.go') ? 'main' : (path.split('/').at(-2) ?? 'sample').replaceAll('-', '_')}\n`;

test('the public packages of a module are its directories with a Go file that is no test, outside internal (GN-19f)', () => {
  assert.deepEqual(publicPackages(['go.mod', 'zz_generated_sample.go', 'zz_generated_sample_test.go', 'errors/zz_generated_errors.go', 'geometry/shapes/zz_generated_shapes.go', 'internal/binding/zz_generated_binding.go', 'tests/only_test.go', 'host/internal/x.go'], clauseOf), ['', 'errors', 'geometry/shapes']);
});

test('B2.459: a directory of a program and a directory of tests alone are no public package, and the package clause is read from the file (GN-19f)', () => {
  const texts: Record<string, string> = {
    'zz_generated_sample.go': '// Code generated by binding. DO NOT EDIT.\n\npackage sample\n',
    'host/host.go': '//go:build !js\n\n/* The host of the\n   package main of nothing. */\n// package main\npackage host\n',
    'tests/probe/main.go': '// A probe of the tests.\npackage main\n\nfunc main() {}\n',
    'tests/benchmark/main.go': '//go:build ignore\n\npackage main\n',
    'cmd/tool/tool.go': 'package main\n',
    // A directory with a file of a program beside the files of a package holds a package.
    'mixed/generate.go': '//go:build ignore\n\npackage main\n',
    'mixed/mixed.go': 'package mixed\n',
    'tests/support/support.go': 'package support\n',
  };
  const read = (path: string): string => texts[path] ?? assert.fail(`${path}: the text of a file that is no Go file of a package was read`);
  assert.deepEqual(publicPackages(['go.mod', ...Object.keys(texts), 'tests/run_test.go', 'tests/probe/main_test.go', 'tests/only/only_test.go', 'tests/probe/input.json'], read), ['', 'host', 'mixed', 'tests/support']);
  assert.equal(goPackageOf('package main\n'), 'main');
  assert.equal(goPackageOf('/* a */ // b\n\n//go:build x\npackage  host // main\n'), 'host');
  assert.equal(goPackageOf('// package main'), undefined);
  assert.equal(goPackageOf('import "x"\npackage main\n'), undefined);
  assert.equal(goPackageOf(''), undefined);
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

// GN-15k: the native-static-libs that the release build of each platform printed, and the link file of a platform as
// the generator writes it, with the directive of the directory alone.
const NATIVE: Record<string, string> = {
  linux_amd64: '-lgcc_s -lutil -lrt -lpthread -lm -ldl -lc',
  linux_arm64: '-lgcc_s -lutil -lrt -lpthread -lm -ldl -lc',
  linux_amd64_musl: '-lc',
  linux_arm64_musl: '-lc',
  darwin_arm64: '-framework Security -framework CoreFoundation -liconv -lSystem -lc -lm',
};
const linkFile = (platform: string, libraries = ''): string => `package binding\n\n// #cgo LDFLAGS: -L\${SRCDIR}/../ffi/lib/${platform}${libraries === '' ? '' : ` ${libraries}`}\nimport "C"\n`;

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
  // B2.473: the generated package imports the modules that the go.mod of a case requires.
  write(join(module, 'zz_generated_sample.go'), 'package sample\n\nimport (\n\t_ "github.com/polyspec/points/packages/go"\n\tvalidator "github.com/polyspec/sample/packages/validator/go/errors"\n)\n');
  write(join(module, 'internal/binding/zz_generated_binding.go'), 'package binding\n');
  for (const platform of PLATFORMS) {
    write(join(module, `internal/binding/zz_generated_link_${goLinkFile(platform)}.go`), linkFile(platform));
    write(join(module, `internal/ffi/lib/${platform}/zz_generated_lib.go`), `package ${platform}\n`);
    write(join(dir, 'libraries', platform, 'libpolyspec_sample_go.a'), ar([{ name: 'a.o', data: OBJECTS[platform] }]));
    write(join(dir, 'libraries', platform, 'native-static-libs'), `${NATIVE[platform]}\n`);
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
    { tool: 'git', match: ' show 1+:packages/go/host/host\\.go$', stdout: 'package host\n' },
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
// goReleaseFiles of the Go files of a case, the text of each by its path.
const formOf = (files: ReadonlyMap<string, string>): { carried: string[]; leftOut: Map<string, string> } => goReleaseFiles([...files.keys()], (path) => files.get(path) ?? assert.fail(`${path} is no file of the case`));

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
    ['packages/go/internal/binding/zz_generated_link_darwin_arm64.go', join(work, 'link/zz_generated_link_darwin_arm64.go')],
    ['packages/go/internal/binding/zz_generated_link_linux_amd64.go', join(work, 'link/zz_generated_link_linux_amd64.go')],
    ['packages/go/internal/binding/zz_generated_link_linux_arm64.go', join(work, 'link/zz_generated_link_linux_arm64.go')],
    ['packages/go/internal/binding/zz_generated_link_musl_linux_amd64.go', join(work, 'link/zz_generated_link_musl_linux_amd64.go')],
    ['packages/go/internal/binding/zz_generated_link_musl_linux_arm64.go', join(work, 'link/zz_generated_link_musl_linux_arm64.go')],
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
    `git ls-tree -r -z --name-only ${TAG_COMMIT} -- packages/go`,
    // B2.459: the package clause of each tracked Go file that is no test is read from the commit of the tag.
    `git show ${TAG_COMMIT}:packages/go/host/host.go`,
    'rustc --print sysroot',
    'rustc --print host-tuple',
    ...PLATFORMS.flatMap((platform) => [`llvm-nm --defined-only ${libraryOf(platform)}`, `llvm-size -A ${libraryOf(platform)}`]),
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
    // B2.488: the module builds alone in a tree of the commit, out of the repository of the proof.
    `git --git-dir ${bare} --work-tree ${join(work, 'alone')} checkout --quiet --force ${RELEASE_COMMIT} -- packages/go`,
    'go build -mod=readonly ./...',
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
    if (c.argv[0] !== 'clean') assert.equal(c.cwd.endsWith(c.argv[0] === 'build' ? '/work/alone/packages/go' : '/work/consumer'), true, c.argv.join(' '));
    assert.deepEqual(
      Object.fromEntries(['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GOENV', 'GOTOOLCHAIN', 'GOWORK', 'GOPROXY', 'GOSUMDB', 'GOMODCACHE', 'GOCACHE', 'GOFLAGS', 'CGO_ENABLED', 'CGO_LDFLAGS'].map((name) => [name, c.env[name]])),
      { GIT_CONFIG_GLOBAL: join(work, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GOENV: 'off', GOTOOLCHAIN: 'local', GOWORK: 'off', GOPROXY: 'direct', GOSUMDB: 'off', GOMODCACHE: join(work, 'modcache'), GOCACHE: join(work, 'gocache'), GOFLAGS: '', CGO_ENABLED: '1', CGO_LDFLAGS: '' },
    );
  }
});

test('B2.367: the commit holds the link file of each platform with the native-static-libs that its release build printed (GN-15k)', (t) => {
  const s = scene(t);
  releaseGoModule(s.release);
  for (const platform of PLATFORMS) {
    const copy = join(s.release.work, `link/zz_generated_link_${goLinkFile(platform)}.go`);
    assert.equal(readFileSync(copy, 'utf8'), linkFile(platform, NATIVE[platform]), platform);
    assert.ok(s.lines().includes(`git update-index --add --cacheinfo 100644,object-of:${copy},packages/go/internal/binding/zz_generated_link_${goLinkFile(platform)}.go`), platform);
  }
  // The work tree keeps the file that the generator wrote.
  assert.equal(readFileSync(join(s.release.root, 'packages/go/internal/binding/zz_generated_link_darwin_arm64.go'), 'utf8'), linkFile('darwin_arm64'));
});

test('B2.367: a platform without its native-static-libs, with an empty one, or whose link file has no directive of its directory is refused (GN-15k)', (t) => {
  const s = scene(t);
  rmSync(join(s.release.libraries, 'darwin_arm64/native-static-libs'));
  writeFileSync(join(s.release.libraries, 'linux_amd64/native-static-libs'), '\n');
  writeFileSync(join(s.release.root, 'packages/go/internal/binding/zz_generated_link_linux_arm64.go'), 'package binding\n');
  assert.deepEqual(refusal(() => releaseGoModule(s.release)), [
    `${join(s.release.libraries, 'linux_amd64/native-static-libs')}: the native-static-libs of linux_amd64 name no library (GN-15k)`,
    `packages/go/internal/binding/zz_generated_link_linux_arm64.go has no line \`// #cgo LDFLAGS: -L\${SRCDIR}/../ffi/lib/linux_arm64\`: run binding generate --target go (GN-15k)`,
    `${join(s.release.libraries, 'darwin_arm64/native-static-libs')}: the native-static-libs of darwin_arm64 are not there; release-go-static writes them beside the library (GN-15k)`,
  ]);
  assert.equal(s.lines().filter((line) => WRITES.test(line)).length, 0);
});

test('B2.415: the libraries that native-static-libs name and the Rust toolchain ships for the target are carried beside the library, and a missing one is refused (GN-15k)', (t) => {
  assert.deepEqual(carriedLibraries('-lunwind -lc'), ['libunwind.a']);
  assert.deepEqual(carriedLibraries('-lgcc_s -lutil -lrt -lpthread -lm -ldl -lc'), []);
  assert.deepEqual(carriedLibraries('-lunwind -lc -lunwind'), ['libunwind.a']);
  const s = scene(t);
  for (const platform of ['linux_amd64_musl', 'linux_arm64_musl']) {
    writeFileSync(join(s.release.libraries, platform, 'native-static-libs'), '-lunwind -lc\n');
    writeFileSync(join(s.release.libraries, platform, 'libunwind.a'), `unwinder of ${platform}`);
  }
  releaseGoModule(s.release);
  for (const platform of ['linux_amd64_musl', 'linux_arm64_musl']) {
    assert.ok(s.lines().includes(`git update-index --add --cacheinfo 100644,object-of:${join(s.release.libraries, platform, 'libunwind.a')},packages/go/internal/ffi/lib/${platform}/libunwind.a`), platform);
  }
  assert.equal(s.lines().some((line) => /lib\/(linux_(amd64|arm64)|darwin_arm64)\/libunwind\.a$/.test(line)), false, 'a platform whose libraries name no unwinder carries one');
  const missing = scene(t);
  writeFileSync(join(missing.release.libraries, 'linux_arm64_musl/native-static-libs'), '-lunwind -lc\n');
  assert.deepEqual(refusal(() => releaseGoModule(missing.release)), [
    `${join(missing.release.libraries, 'linux_arm64_musl/libunwind.a')}: the native-static-libs of linux_arm64_musl name libunwind.a, which the release carries beside the library and release-go-static copies from the Rust toolchain, and it is not there (GN-15k)`,
  ]);
  assert.equal(missing.lines().filter((line) => WRITES.test(line)).length, 0);
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

test('B2.456: a run without go is refused with why Go is needed, the tool, --go and $(GO), before any command reads the repository (GN-19f)', (t) => {
  const s = scene(t);
  rmSync(join(s.dir, 'bin/go'));
  assert.deepEqual(refusal(() => releaseGoModule(s.release)), [
    'binding release-go-module proves the commit of the Go module with a consumer that Go builds (`go mod tidy`, `go test`, GN-19f), and the go command `go` is not found on PATH: install Go, or name the go command with --go <command>, the value of $(GO) of the release recipes (GN-19h)',
  ]);
  assert.deepEqual(s.lines(), []);
});

test('B2.456: the commands of the consumer run the command of --go, with its words before the arguments of Go (GN-19f)', (t) => {
  const s = scene(t);
  mkdirSync(join(s.dir, 'elsewhere'));
  renameSync(join(s.dir, 'bin/go'), join(s.dir, 'elsewhere/go-1.27'));
  const go = join(s.dir, 'elsewhere/go-1.27');
  releaseGoModule({ ...s.release, go: [go, 'via'] });
  assert.deepEqual(s.lines().filter((line) => line.startsWith('go')), ['go-1.27 via mod tidy', 'go-1.27 via test -count=1 .', 'go-1.27 via build -mod=readonly ./...', 'go-1.27 via clean -modcache']);
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

test('B2.488: a commit whose module does not build alone in its tree leaves the repository without the tag, with what to run (GN-19f, GN-15l)', (t) => {
  // Before B2.488 the proof built a consumer alone, whose go mod tidy writes what its go.mod lacks, so a tag whose
  // go.mod lacked a module of its graph passed (session-store v0.0.4 requires php-serialization).
  const s = scene(t, [{ tool: 'go', match: '^build -mod=readonly \\./\\.\\.\\.$', status: 1 }]);
  assert.throws(() => releaseGoModule(s.release), new RegExp(`go build -mod=readonly \\./\\.\\.\\. of the commit ${RELEASE_COMMIT} in packages/go ended with status 1: the module does not build alone in the tree of its tag; run binding scaffold of this version, whose go\\.mod requires each module of its graph and whose go\\.sum holds its hash \\(GN-15l, B2\\.488\\)`));
  const lines = s.lines();
  assert.deepEqual(lines.filter((line) => line.startsWith('git tag ')), []);
  assert.equal(lines.at(-1), 'go clean -modcache');
  const [build] = s.calls().filter((c) => c.tool === 'go' && c.argv[0] === 'build');
  // The stand-in records process.cwd(), which the system gives with its links resolved (/var is /private/var on macOS).
  assert.equal(build?.cwd, join(realpathSync(s.release.work), 'alone/packages/go'));
  assert.equal(build?.env['GOWORK'], 'off');
  const [checkout] = s.calls().filter((c) => c.argv.includes('checkout'));
  assert.equal(checkout?.env['GIT_INDEX_FILE'], join(s.release.work, 'alone-index'));
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

// ---- The modules of one repository ----------------------------------------------------------------------------------

// B2.479: the Go module of the scene requires the module `validator` of its repository at a release version, which
// requires the module `base` of the repository in turn; `points` is a module of another repository.
const VALIDATOR = 'github.com/polyspec/sample/packages/validator/go';
const BASE = 'github.com/polyspec/sample/packages/base/go';
const VALIDATOR_COMMIT = '5'.repeat(40);
const BASE_COMMIT = '6'.repeat(40);
const GO_MOD_OF_PAIR = `${GO_MOD}\nrequire (\n\tgithub.com/polyspec/points/packages/go v0.0.3\n\t${VALIDATOR} v0.0.1\n)\n`;
const POINTS_SUM = 'github.com/polyspec/points/packages/go v0.0.3 h1:points=\ngithub.com/polyspec/points/packages/go v0.0.3/go.mod h1:pointsmod=\n';
const tagOf = (directory: string, commit?: string): Answer => ({ tool: 'git', match: `rev-parse --verify --quiet refs/tags/${directory}/v0\\.0\\.1\\^\\{commit\\}$`, ...(commit === undefined ? { status: 1 } : { stdout: `${commit}\n` }) });
const downloadOf = (module: string, name: string): Answer => ({ tool: 'go', match: `^mod download -json ${module}@v0\\.0\\.1$`, stdout: JSON.stringify({ Path: module, Version: 'v0.0.1', Sum: `h1:${name}=`, GoModSum: `h1:${name}mod=` }) });
// The answers of a repository whose commit of the tag requires the validator, with the tags of `tags`.
const pair = (tags: Answer[]): Answer[] => [
  { tool: 'git', match: ' show 1+:packages/go/go\\.mod$', stdout: GO_MOD_OF_PAIR },
  { tool: 'git', match: ' show 1+:packages/go/go\\.sum$', stdout: POINTS_SUM },
  { tool: 'git', match: ' ls-tree ', stdout: 'packages/go/go.mod\0packages/go/go.sum\0packages/go/host/host.go\0' },
  { tool: 'git', match: ' show 5+:packages/validator/go/go\\.mod$', stdout: `module ${VALIDATOR}\n\ngo 1.27.3\n\nrequire ${BASE} v0.0.1\n` },
  { tool: 'git', match: ' show 6+:packages/base/go/go\\.mod$', stdout: `module ${BASE}\n\ngo 1.27.3\n` },
  downloadOf(VALIDATOR, 'validator'),
  downloadOf(BASE, 'base'),
  ...tags,
];

test('B2.479: the requirements of a go.mod are read in both forms, and those of a module of the same repository at a release version are its siblings (GN-19f)', () => {
  assert.deepEqual(goModRequires(`module m\n\nrequire a.example/x v1.2.3 // indirect\n\nrequire (\n\tb.example/y v0.0.0\n\tc.example/z v0.1.0 // a note\n)\n`), [
    { module: 'a.example/x', version: 'v1.2.3', indirect: true },
    { module: 'b.example/y', version: 'v0.0.0', indirect: false },
    { module: 'c.example/z', version: 'v0.1.0', indirect: false },
  ]);
  const own = 'github.com/polyspec/sample/packages/go';
  assert.deepEqual(siblingRequires(GO_MOD_OF_PAIR, own), [{ module: VALIDATOR, version: 'v0.0.1', indirect: false }]);
  // The development form of a sibling, a module of another owner with the same repository name and the module itself are none.
  assert.deepEqual(siblingRequires(`${GO_MOD}\nrequire ${VALIDATOR} v0.0.0\nrequire github.com/other/sample/packages/go v0.0.1\nrequire ${own} v0.0.1\n`, own), []);
});

test('B2.479: the repository of the proof holds the tag of each sibling module and of those that they require, and the go.sum of the commit gains their lines (GN-19f, GN-15g)', (t) => {
  const s = scene(t, pair([tagOf('packages/validator/go', VALIDATOR_COMMIT), tagOf('packages/base/go', BASE_COMMIT)]));
  const { work } = s.release;
  const bare = join(work, 'remote.git');
  assert.deepEqual(releaseGoModule(s.release), { commit: RELEASE_COMMIT, reference: 'refs/tags/packages/go/v0.0.1' });
  // Before B2.479 the repository of the proof held the tag of this module alone, so Go did not find the sibling at
  // its tag (`unknown revision`), and the commit held the go.sum of the commit of the tag.
  assert.deepEqual(s.lines().filter((line) => /^(git (init|push|commit-tree|tag) |git rev-parse .*(validator|base)|git show .*(validator|base|go\.sum)|go )/.test(line)), [
    'git rev-parse --verify --quiet refs/tags/packages/validator/go/v0.0.1^{commit}',
    `git show ${VALIDATOR_COMMIT}:packages/validator/go/go.mod`,
    'git rev-parse --verify --quiet refs/tags/packages/base/go/v0.0.1^{commit}',
    `git show ${BASE_COMMIT}:packages/base/go/go.mod`,
    `git init --quiet --bare ${bare}`,
    `git push --quiet ${bare} ${VALIDATOR_COMMIT}:refs/tags/packages/validator/go/v0.0.1 ${BASE_COMMIT}:refs/tags/packages/base/go/v0.0.1`,
    `go mod download -json ${VALIDATOR}@v0.0.1`,
    `go mod download -json ${BASE}@v0.0.1`,
    'go clean -modcache',
    `git show ${TAG_COMMIT}:packages/go/go.sum`,
    `git commit-tree the-tree -p ${TAG_COMMIT} -m chore(release): Carry the Go module of v0.0.1`,
    `git push --quiet ${bare} ${RELEASE_COMMIT}:refs/tags/packages/go/v0.0.1`,
    'go mod tidy',
    'go test -count=1 .',
    'go build -mod=readonly ./...',
    'go clean -modcache',
    `git tag -a packages/go/v0.0.1 -m packages/go/v0.0.1 ${RELEASE_COMMIT}`,
  ]);
  // The go.sum of the commit: the lines of the commit of the tag and the two lines of each sibling, sorted.
  assert.equal(readFileSync(join(work, 'go.sum'), 'utf8'), [
    'github.com/polyspec/points/packages/go v0.0.3 h1:points=',
    'github.com/polyspec/points/packages/go v0.0.3/go.mod h1:pointsmod=',
    `${BASE} v0.0.1 h1:base=`,
    `${BASE} v0.0.1/go.mod h1:basemod=`,
    `${VALIDATOR} v0.0.1 h1:validator=`,
    `${VALIDATOR} v0.0.1/go.mod h1:validatormod=`,
    '',
  ].join('\n'));
  assert.ok(s.lines().includes(`git update-index --add --cacheinfo 100644,object-of:${join(work, 'go.sum')},packages/go/go.sum`));
  // Go gives the hashes from the repository of the proof, in a module of the run, with the settings of the consumer.
  for (const c of s.calls().filter((call) => call.tool === 'go' && call.argv[1] === 'download')) {
    assert.equal(c.cwd.endsWith('/work/sums'), true);
    assert.equal(c.env['GOPROXY'], 'direct');
    assert.equal(c.env['GIT_CONFIG_GLOBAL'], join(work, 'gitconfig'));
  }
  assert.equal(readFileSync(join(work, 'sums/go.mod'), 'utf8'), 'module example.invalid/sums\n\ngo 1.27.3\n');
  // A module without a sibling keeps the go.sum of the commit of its tag: the command writes none.
  const alone = scene(t);
  releaseGoModule(alone.release);
  assert.equal(existsSync(join(alone.release.work, 'go.sum')), false);
  assert.deepEqual(alone.lines().filter((line) => line.includes('go.sum') || line.includes('download')), []);
});

test('B2.479: a sibling module without its tag is refused by name before any write, with the run that makes the tag (GN-19f)', (t) => {
  const first = `the repository has no tag packages/validator/go/v0.0.1: run binding release-go-module of that module first (the recipe release-go-module of its contract), because the proof fetches that module at its tag and the go.sum of this commit holds the hashes of the commit of that tag (GN-19f)`;
  const s = scene(t, pair([tagOf('packages/validator/go')]));
  assert.deepEqual(refusal(() => releaseGoModule(s.release)), [`go.mod requires ${VALIDATOR} v0.0.1, a Go module of this repository, and ${first}`]);
  assert.deepEqual(s.lines().filter((line) => WRITES.test(line) || line.startsWith('go ')), []);
  // The tag of a module that a sibling requires is missed in the same way, with the go.mod that requires it.
  const second = scene(t, pair([tagOf('packages/validator/go', VALIDATOR_COMMIT), tagOf('packages/base/go')]));
  assert.deepEqual(refusal(() => releaseGoModule(second.release)), [`the go.mod of ${VALIDATOR} v0.0.1 requires ${BASE} v0.0.1, a Go module of this repository, and ${first.replace('packages/validator/go', 'packages/base/go')}`]);
  assert.deepEqual(second.lines().filter((line) => WRITES.test(line) || line.startsWith('go ')), []);
});

test('B2.479: the go.sum of the commit takes the two lines of each sibling, and a tracked line that gives a sibling another hash is refused (GN-15g, GN-15l)', () => {
  const download = { Path: VALIDATOR, Version: 'v0.0.1', Sum: 'h1:validator=', GoModSum: 'h1:validatormod=' };
  assert.equal(goSumWith('', [download]), `${VALIDATOR} v0.0.1 h1:validator=\n${VALIDATOR} v0.0.1/go.mod h1:validatormod=\n`);
  // A line that the go.sum holds already is written once.
  assert.equal(goSumWith(`${VALIDATOR} v0.0.1 h1:validator=\n`, [download]), `${VALIDATOR} v0.0.1 h1:validator=\n${VALIDATOR} v0.0.1/go.mod h1:validatormod=\n`);
  assert.deepEqual(refusal(() => goSumWith(`${VALIDATOR} v0.0.1/go.mod h1:other=\n`, [download])), [
    `go.sum holds the line \`${VALIDATOR} v0.0.1/go.mod h1:other=\` of a Go module of this repository, and the commit of its tag has the hash h1:validatormod=: remove the line, since no tracked go.sum holds the hash of a module that the release itself commits (GN-15l)`,
  ]);
  assert.throws(() => goSumWith('', [{ Path: VALIDATOR, Version: 'v0.0.1', GoModSum: 'h1:validatormod=' }]), /go mod download gave no sum of github\.com\/polyspec\/sample\/packages\/validator\/go v0\.0\.1/);
  assert.throws(() => goSumWith('', [{ Path: VALIDATOR, Error: 'unknown revision' }]), /go mod download gave no sum: unknown revision/);
});

test('B2.479: a run after a release that stopped between two modules goes on: the tag that names the commit of the run stays, and the module that failed is released (GN-19f)', (t) => {
  // The first module of the release: its tag is in the repository and on the remote at the commit of this run, so
  // the run proves it again, makes no tag and gives no reference to push.
  const tagObject = '4'.repeat(40);
  const done = scene(t, [tagOf('packages/go', RELEASE_COMMIT), { tool: 'git', match: ' ls-remote ', stdout: `${tagObject}\trefs/tags/packages/go/v0.0.1\n${RELEASE_COMMIT}\trefs/tags/packages/go/v0.0.1^{}\n` }]);
  assert.deepEqual(releaseGoModule(done.release), { commit: RELEASE_COMMIT, reference: undefined });
  assert.deepEqual(done.lines().filter((line) => /^(git tag|go) /.test(line)), ['go mod tidy', 'go test -count=1 .', 'go build -mod=readonly ./...', 'go clean -modcache']);
  // The second module, whose run failed: it finds the tag of the first in the repository and makes its own.
  const failed = scene(t, pair([tagOf('packages/validator/go', VALIDATOR_COMMIT), tagOf('packages/base/go', BASE_COMMIT)]));
  assert.deepEqual(releaseGoModule(failed.release), { commit: RELEASE_COMMIT, reference: 'refs/tags/packages/go/v0.0.1' });
  assert.deepEqual(failed.lines().filter((line) => line.startsWith('git tag ')), [`git tag -a packages/go/v0.0.1 -m packages/go/v0.0.1 ${RELEASE_COMMIT}`]);
});

// ---- The requirements that the released form uses -------------------------------------------------------------------

const UNUSED_BY_ALL = (requirement: string): string => `go.mod requires ${requirement}, and no Go file of the module imports it: remove the requirement, which would enter the module graph of every consumer of the tag (GN-15g)`;
const UNUSED_BY_CARRIED = (requirement: string, files: string): string => `go.mod requires ${requirement}, and only files that the released form leaves out import it (${files}): a dependency of tests or programs alone lives in a Go module of its own, with its own go.mod, so that it does not enter the module graph of a consumer of the tag (GN-15g)`;

test('B2.473: the import paths of a Go file are read from its import declarations, of one path and of a block, with a name or without (GN-19f)', () => {
  assert.deepEqual(goImports('// Code generated.\n\n//go:build !musl\n\npackage sample\n\n/* #include <x.h> */\nimport "C"\nimport (\n\t"fmt" // the standard library\n\n\t_ "a.example/x"\n\t. "b.example/y/z"\n\tnamed "c.example/w"\n)\nimport other `d.example/v`\n\nvar text = "import \\"e.example/not\\""\n\nimport "f.example/late"\n'), ['C', 'fmt', 'a.example/x', 'b.example/y/z', 'c.example/w', 'd.example/v']);
  assert.deepEqual(goImports('package sample\n'), []);
  assert.deepEqual(goImports('// import "a.example/x"\n'), []);
});

test('B2.473: a requirement of the go.mod of a release is imported by a file that the released form carries, and one that only left-out files import, or none, is named (GN-15g, GN-19f)', () => {
  const texts = new Map([
    // Carried: a hand-written package, a generated file and a generated test without a tag of a test feature.
    ['host/host.go', 'package host\n\nimport "a.example/carried"\n'],
    ['zz_generated_sample.go', 'package sample\n\nimport (\n\t"fmt"\n\n\tpoints "a.example/sub/geometry/shapes"\n\tsibling "github.com/polyspec/sample/packages/validator/go"\n)\n'],
    ['zz_generated_test.go', 'package sample\n\nimport _ "a.example/generated-test"\n'],
    // Left out: a test of the repository, a program and a generated file behind a tag of a test feature.
    ['tests/cases_test.go', 'package tests\n\nimport (\n\t"a.example/carried"\n\t"a.example/test-only/assert"\n)\n'],
    ['host/host_test.go', 'package host\n\nimport "a.example/test-only"\n'],
    ['tests/probe/main.go', 'package main\n\nimport "a.example/program-only"\n'],
    ['zz_generated_fault_test.go', '//go:build polyspec_sample_fault_test\n\npackage sample\n\nimport "a.example/tagged-only"\n'],
  ]);
  const form = formOf(texts);
  const read: string[] = [];
  const judge = (goMod: string) => goModUnused(goMod, form.carried, [...form.leftOut.keys()], (path) => {
    read.push(path);
    return texts.get(path) ?? assert.fail(`${path} is no file of the case`);
  });
  const module = 'module github.com/polyspec/sample/packages/go\n\ngo 1.27.3\n';
  // Imported by a carried file: a hand-written package, a sub-package path, a sibling of the repository, a
  // generated test. Both forms of the directive are read, and the files that the form leaves out are not.
  assert.deepEqual(judge(`${module}\nrequire a.example/carried v1.0.0\n\nrequire (\n\ta.example/sub v0.2.0\n\tgithub.com/polyspec/sample/packages/validator/go v0.0.1\n\ta.example/generated-test v0.0.3\n)\n`), { findings: [], notJudged: [] });
  assert.deepEqual([...new Set(read)].sort(), ['host/host.go', 'zz_generated_sample.go', 'zz_generated_test.go']);
  // Only by a left-out test, only by a program, only behind a tag of a test feature, and by nothing.
  assert.deepEqual(judge(`${module}\nrequire a.example/test-only v1.0.0\nrequire (\n\ta.example/program-only v1.1.0\n\ta.example/tagged-only v1.2.0\n\ta.example/nothing v1.3.0\n\ta.example/carried v1.0.0\n)\n`), {
    findings: [
      UNUSED_BY_CARRIED('a.example/test-only v1.0.0', 'host/host_test.go, tests/cases_test.go'),
      UNUSED_BY_CARRIED('a.example/program-only v1.1.0', 'tests/probe/main.go'),
      UNUSED_BY_CARRIED('a.example/tagged-only v1.2.0', 'zz_generated_fault_test.go'),
      UNUSED_BY_ALL('a.example/nothing v1.3.0'),
    ],
    notJudged: [],
  });
  // A line `// indirect` is not judged and is said so; a module whose path only starts like another is not that one.
  assert.deepEqual(judge(`${module}\nrequire (\n\ta.example/nothing v1.3.0 // indirect\n\ta.example/carr v0.1.0\n)\n`), {
    findings: [UNUSED_BY_ALL('a.example/carr v0.1.0')],
    notJudged: ['go.mod requires a.example/nothing v1.3.0 with `// indirect`, which is not judged: no file of the module imports the module of such a line'],
  });
  // An import belongs to the required module with the longest path: a package of a/sub/geometry is none of a/sub.
  assert.deepEqual(judge(`${module}\nrequire a.example/sub v0.2.0\nrequire a.example/sub/geometry v0.1.0\n`).findings, [UNUSED_BY_ALL('a.example/sub v0.2.0')]);
  // A go.mod without a requirement reads no file.
  read.length = 0;
  assert.deepEqual(judge(module), { findings: [], notJudged: [] });
  assert.deepEqual(read, []);
});

test('B2.473: binding release-go-module refuses a go.mod with a requirement that only a left-out test imports, with the test, and makes no commit and no tag (GN-19f)', (t) => {
  const goMod = `${GO_MOD}\nrequire (\n\tgithub.com/polyspec/points/packages/go v0.0.3\n\ta.example/assert v1.0.0\n\ta.example/old v0.1.0 // indirect\n)\n`;
  const s = scene(t, [
    { tool: 'git', match: ' show 1+:packages/go/go\\.mod$', stdout: goMod },
    ...tracks([['host/host.go', 'package host\n'], ['tests/cases_test.go', 'package tests\n\nimport "a.example/assert"\n']]).filter((a) => !a.match.includes('go\\.mod')),
  ]);
  const logged: string[] = [];
  assert.deepEqual(refusal(() => releaseGoModule({ ...s.release, log: (line) => logged.push(line) })), [UNUSED_BY_CARRIED('a.example/assert v1.0.0', 'tests/cases_test.go')]);
  assert.deepEqual(s.lines().filter((line) => WRITES.test(line)), []);
  assert.deepEqual(logged.filter((line) => line.includes('indirect')), ['go.mod requires a.example/old v0.1.0 with `// indirect`, which is not judged: no file of the module imports the module of such a line']);
  // The go.mod is not rewritten: the checkout holds the file as it was.
  assert.equal(readFileSync(join(s.release.root, 'packages/go/go.mod'), 'utf8'), GO_MOD);
});

// ---- The rehearsal --------------------------------------------------------------------------------------------------

// B2.479: the answers of a rehearsal on a machine of darwin_arm64, and the calls that write into the repository, of
// which a rehearsal makes none: its writes are those of `git --git-dir <repository of the proof>`.
const rehearsing = (s: Scene, goos = 'darwin', goarch = 'arm64'): Answer[] => [
  { tool: 'git', match: 'rev-parse --path-format=absolute --git-path objects$', stdout: `${join(s.dir, 'repository/.git/objects')}\n` },
  { tool: 'go', match: '^env GOOS GOARCH$', stdout: `${goos}\n${goarch}\n` },
];
const rehearse = (t: { after: (fn: () => void) => void }, answers: Answer[] = [], goos?: string, goarch?: string): Scene => {
  const s = scene(t);
  const passing = JSON.parse(readFileSync(join(s.dir, 'answers.json'), 'utf8')) as Answer[];
  writeFileSync(join(s.dir, 'answers.json'), JSON.stringify([...answers, ...rehearsing(s, goos, goarch), ...passing]));
  return { ...s, release: { ...s.release, rehearsal: true } };
};
const REPOSITORY_WRITES = /^git (read-tree|hash-object|update-index|write-tree|commit-tree|tag|push|update-ref|prune|ls-remote) /;
const LINUX = ['linux_amd64', 'linux_arm64', 'linux_amd64_musl', 'linux_arm64_musl'];
const absentOf = (s: Scene, platform: string): string => `the platform ${platform}: ${join(s.release.libraries, platform, 'libpolyspec_sample_go.a')} is not there, ${join(s.release.libraries, platform, 'native-static-libs')} is not there`;

test('B2.479: a rehearsal makes no commit and no tag in the repository, checks the platforms that are there and ends with what it did not see (GN-19f)', (t) => {
  const s = rehearse(t);
  for (const platform of LINUX) rmSync(join(s.release.libraries, platform), { recursive: true });
  const { work } = s.release;
  const bare = join(work, 'rehearsal.git');
  const result = releaseGoModule(s.release);
  const unseen = [
    `the tag v0.0.1: the rehearsal read HEAD, the commit ${TAG_COMMIT}, and the generated files of the work tree, whether a tag names that commit or not`,
    ...LINUX.map((platform) => absentOf(s, platform)),
    'the tag packages/go/v0.0.1 of the repository and of the remote origin: the rehearsal did not ask whether one of an earlier run names another commit',
    `a commit and a tag of the Go module: the rehearsal made none in the repository and pushed nothing; its commit ${RELEASE_COMMIT} is in ${bare} alone`,
  ];
  assert.deepEqual(result, { commit: RELEASE_COMMIT, reference: undefined, unseen });
  const lines = s.lines();
  // No call writes an object or a reference into the repository, and none asks or writes the remote.
  assert.deepEqual(lines.filter((line) => REPOSITORY_WRITES.test(line)), []);
  // The tag of the release is not asked for: the rehearsal reads HEAD.
  assert.deepEqual(lines.filter((line) => line.includes('refs/tags/v0.0.1')), []);
  // The objects, the commit and the tag are those of the repository of the proof, which reads the objects of the
  // repository as its alternates; the proof is the one of a release.
  assert.equal(readFileSync(join(bare, 'objects/info/alternates'), 'utf8'), `${join(s.dir, 'repository/.git/objects')}\n`);
  const inBare = lines.filter((line) => line.startsWith(`git --git-dir ${bare} `)).map((line) => line.slice(`git --git-dir ${bare} `.length));
  assert.deepEqual(inBare.filter((line) => !/^(hash-object|update-index|config) /.test(line)), [
    `read-tree ${TAG_COMMIT}`,
    'write-tree',
    `commit-tree the-tree -p ${TAG_COMMIT} -m chore(release): Rehearse the Go module of v0.0.1`,
    `update-ref refs/tags/packages/go/v0.0.1 ${RELEASE_COMMIT}`,
    // B2.488: the build alone reads the commit of the rehearsal from the repository of the proof.
    `--work-tree ${join(s.release.work, 'alone')} checkout --quiet --force ${RELEASE_COMMIT} -- packages/go`,
    'prune --expire=now',
  ]);
  assert.deepEqual(lines.filter((line) => line.startsWith('go ')), ['go env GOOS GOARCH', 'go mod tidy', 'go test -count=1 .', 'go build -mod=readonly ./...', 'go clean -modcache']);
  const [commitTree] = s.calls().filter((c) => c.argv.includes('commit-tree'));
  assert.equal(commitTree?.env['GIT_COMMITTER_NAME'], 'binding rehearsal');
  assert.equal(commitTree?.env['GIT_AUTHOR_EMAIL'], 'rehearsal@example.invalid');
  // The commit carries the library of the platform that is there, and none of an absent one.
  assert.deepEqual(inBare.filter((line) => line.startsWith('update-index ') && line.endsWith('.a')).map((line) => line.slice(line.lastIndexOf(',') + 1)), ['packages/go/internal/ffi/lib/darwin_arm64/libpolyspec_sample_go.a']);
  assert.deepEqual(lines.filter((line) => line.startsWith('llvm-nm ')), [`llvm-nm --defined-only ${join(s.release.libraries, 'darwin_arm64/libpolyspec_sample_go.a')}`]);
  // The last lines of the output: what the rehearsal did not see, the last of which is the commit and the tag.
  const report = rehearsalReport(s.release.module, 'v0.0.1', unseen);
  assert.equal(report[0], 'the rehearsal of github.com/polyspec/sample/packages/go v0.0.1 passed on what is here, and it is no release (GN-19f). It did not see:');
  assert.deepEqual(report.slice(1), unseen.map((line) => `  - ${line}`));
  assert.match(report.at(-1) ?? '', /the rehearsal made none in the repository and pushed nothing/);
  // A second rehearsal keeps the repository of the proof, where the rehearsal of a sibling is.
  writeFileSync(join(s.dir, 'calls.jsonl'), '');
  releaseGoModule(s.release);
  assert.deepEqual(s.lines().filter((line) => line.startsWith('git init ')), []);
  // A present library that fails a check of a release fails the rehearsal too.
  const debug = rehearse(t, [{ tool: 'llvm-size', match: 'darwin_arm64', stdout: 'a.o:\nsection   size   addr\n__debug_info   340   0\n' }]);
  assert.deepEqual(refusal(() => releaseGoModule(debug.release)), [`${join(debug.release.libraries, 'darwin_arm64/libpolyspec_sample_go.a')}: the library of darwin_arm64 holds the debug sections __debug_info`]);
});

test('B2.479: a rehearsal without the library or the generated files of the platform of the run is refused, and so is one on a platform of no Go module (GN-19f)', (t) => {
  const s = rehearse(t, [], 'linux', 'amd64');
  rmSync(join(s.release.libraries, 'linux_amd64/libpolyspec_sample_go.a'));
  rmSync(join(s.release.root, 'packages/go/internal/ffi/lib/linux_amd64/zz_generated_lib.go'));
  assert.deepEqual(refusal(() => releaseGoModule(s.release)), [
    `the proof links the library of linux_amd64, the platform of the run, and packages/go/internal/ffi/lib/linux_amd64/zz_generated_lib.go is not in the work tree, ${join(s.release.libraries, 'linux_amd64/libpolyspec_sample_go.a')} is not there: build the library (the recipe release-go-static) and run binding generate --target go (GN-19f)`,
  ]);
  assert.deepEqual(s.lines().filter((line) => REPOSITORY_WRITES.test(line) || / (commit-tree|update-ref) /.test(line)), []);
  const other = rehearse(t, [], 'darwin', 'amd64');
  assert.deepEqual(refusal(() => releaseGoModule(other.release)), ['the proof links the library of the platform of the run, and darwin_amd64 is no platform of a Go module (GN-15g)']);
});

test('B2.479: a rehearsal takes a sibling module without a tag from the rehearsal of that module in the same --work, when it was made from the same commit (GN-19f)', (t) => {
  const rehearsed = (commit?: string): Answer => ({ tool: 'git', match: '^--git-dir \\S+ rev-parse --verify --quiet refs/tags/packages/validator/go/v0\\.0\\.1\\^\\{commit\\}$', ...(commit === undefined ? { status: 1 } : { stdout: `${commit}\n` }) });
  const madeFrom = (commit: string): Answer => ({ tool: 'git', match: '^--git-dir \\S+ rev-parse --verify 5+\\^1$', stdout: `${commit}\n` });
  // The validator has no tag and was rehearsed from HEAD; the base has its tag in the repository.
  const s = rehearse(t, pair([rehearsed(VALIDATOR_COMMIT), madeFrom(TAG_COMMIT), tagOf('packages/validator/go'), tagOf('packages/base/go', BASE_COMMIT)]));
  const { work } = s.release;
  const bare = join(work, 'rehearsal.git');
  const result = releaseGoModule(s.release);
  assert.equal(result.unseen?.[1], `the tag packages/validator/go/v0.0.1: the repository has none, and the rehearsal took ${VALIDATOR} from the rehearsal of that module in ${work}`);
  const lines = s.lines();
  // The tag of the repository is pushed into the repository of the proof, over a rehearsal of an earlier run; the
  // rehearsed sibling is there already. The go.sum of the rehearsal commit holds the lines of both.
  assert.deepEqual(lines.filter((line) => line.startsWith('git push ')), [`git push --quiet --force ${bare} ${BASE_COMMIT}:refs/tags/packages/base/go/v0.0.1`]);
  assert.deepEqual(lines.filter((line) => line.startsWith('go mod download ')), [`go mod download -json ${VALIDATOR}@v0.0.1`, `go mod download -json ${BASE}@v0.0.1`]);
  assert.match(readFileSync(join(work, 'go.sum'), 'utf8'), /validator\/go v0\.0\.1 h1:validator=\n/);
  assert.ok(lines.includes(`git --git-dir ${bare} show ${VALIDATOR_COMMIT}:packages/validator/go/go.mod`));
  // A rehearsal of the sibling that was made from another commit is refused, and so is a sibling with neither.
  const stale = rehearse(t, pair([rehearsed(VALIDATOR_COMMIT), madeFrom(OTHER_COMMIT), tagOf('packages/validator/go')]));
  assert.deepEqual(refusal(() => releaseGoModule(stale.release)), [
    `go.mod requires ${VALIDATOR} v0.0.1, a Go module of this repository, and its rehearsal in ${stale.release.work} was made from the commit ${OTHER_COMMIT}, not from HEAD, the commit ${TAG_COMMIT}: rehearse that module again first, with the same --work (GN-19f)`,
  ]);
  const none = rehearse(t, pair([rehearsed(), tagOf('packages/validator/go')]));
  assert.deepEqual(refusal(() => releaseGoModule(none.release)), [
    `go.mod requires ${VALIDATOR} v0.0.1, a Go module of this repository, and the repository has no tag packages/validator/go/v0.0.1 and ${none.release.work} holds no rehearsal of that module: rehearse that module first, with the same --work (binding release-go-module --rehearsal, the recipe rehearse-go-module of its contract), because the proof fetches that module at its tag (GN-19f)`,
  ]);
  for (const refused of [stale, none]) assert.deepEqual(refused.lines().filter((line) => REPOSITORY_WRITES.test(line) || / (commit-tree|update-ref) /.test(line)), []);
});

// ---- The generated files of the released form -----------------------------------------------------------------------

// The Go files that `binding generate --target go` writes for tests/e2e/sample, by their paths in the Go module.
const sampleGo = (): Map<string, string> => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/sample/${path}`, import.meta.url), 'utf8'));
  const out = generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['go'] });
  return new Map([...out].filter(([path]) => path.startsWith('packages/go/') && path.endsWith('.go')).map(([path, text]) => [path.slice('packages/go/'.length), String(text)]));
};
const CARRIED_OF_SAMPLE = [
  'errors/zz_generated_errors.go',
  'internal/binding/zz_generated_binding.go',
  'internal/binding/zz_generated_link_darwin_arm64.go',
  'internal/binding/zz_generated_link_linux_amd64.go',
  'internal/binding/zz_generated_link_linux_arm64.go',
  'internal/binding/zz_generated_link_musl_linux_amd64.go',
  'internal/binding/zz_generated_link_musl_linux_arm64.go',
  'internal/binding/zz_generated_maker_test.go',
  'internal/binding/zz_generated_map_test.go',
  'internal/binding/zz_generated_passed_test.go',
  'internal/ffi/lib/darwin_arm64/zz_generated_lib.go',
  'internal/ffi/lib/linux_amd64/zz_generated_lib.go',
  'internal/ffi/lib/linux_amd64_musl/zz_generated_lib.go',
  'internal/ffi/lib/linux_arm64/zz_generated_lib.go',
  'internal/ffi/lib/linux_arm64_musl/zz_generated_lib.go',
  'zz_generated_case_json_string_test.go',
  'zz_generated_sample.go',
  'zz_generated_test.go',
  'zz_generated_value_comparison_test.go',
];
const TAGGED = 'is behind the build tag';
const GUARD = 'is the guard of the build tags of the generated tests (GN-13bf)';

test('B2.446: the commit of a release carries no generated file behind a build tag of a test feature and no guard of the tags, and every other generated file (GN-15g)', () => {
  const go = sampleGo();
  const { carried, leftOut } = formOf(go);
  assert.deepEqual([...leftOut].sort(([a], [b]) => (a < b ? -1 : 1)), [
    ['internal/binding/zz_generated_codec.go', `${TAGGED} polyspec_sample_codec_test of a test feature`],
    ['internal/binding/zz_generated_codec_test.go', `${TAGGED} polyspec_sample_codec_test of a test feature`],
    ['internal/binding/zz_generated_fault.go', `${TAGGED} polyspec_sample_fault_test of a test feature`],
    ['internal/binding/zz_generated_native_count.go', `${TAGGED} polyspec_sample_native_count_test of a test feature`],
    ['internal/binding/zz_generated_panic.go', `${TAGGED} polyspec_sample_panic_test of a test feature`],
    ['internal/binding/zz_generated_panic_test.go', `${TAGGED} polyspec_sample_panic_test of a test feature`],
    ['internal/binding/zz_generated_tags_test.go', GUARD],
    ['internal/binding/zz_generated_thrown_count.go', `${TAGGED} polyspec_sample_thrown_count_test of a test feature`],
    ['zz_generated_fault_test.go', `${TAGGED} polyspec_sample_fault_test of a test feature`],
    ['zz_generated_held_test.go', `${TAGGED} polyspec_sample_panic_test of a test feature`],
    ['zz_generated_native_count_test.go', `${TAGGED} polyspec_sample_native_count_test of a test feature`],
    ['zz_generated_tags_test.go', GUARD],
    ['zz_generated_thrown_count_test.go', `${TAGGED} polyspec_sample_thrown_count_test of a test feature`],
  ]);
  assert.deepEqual(carried, CARRIED_OF_SAMPLE);
  // The two parts are every generated file of the module, and no carried file names a tag of the generation on its
  // build line: the link files of Linux keep their constraint of the C library (GN-15g).
  assert.deepEqual([...carried, ...leftOut.keys()].sort(), [...go.keys()].sort());
  for (const path of carried) assert.doesNotMatch(/^\/\/go:build .*$/m.exec(go.get(path) ?? '')?.[0] ?? '', /polyspec_/, path);
  assert.deepEqual(carried.filter((path) => /^\/\/go:build /m.test(go.get(path) ?? '')).map((path) => [path, /^\/\/go:build (.+)$/m.exec(go.get(path) ?? '')?.[1]]), [
    ['internal/binding/zz_generated_link_linux_amd64.go', '!musl'],
    ['internal/binding/zz_generated_link_linux_arm64.go', '!musl'],
    ['internal/binding/zz_generated_link_musl_linux_amd64.go', 'musl'],
    ['internal/binding/zz_generated_link_musl_linux_arm64.go', 'musl'],
  ]);
});

test('B2.446: a generated file is left out by its build line and the name of the guard alone, under any form of the constraint, and a hand-written file of a package is carried whatever its build line names (GN-15g, B2.459)', () => {
  const { carried, leftOut } = formOf(new Map([
    ['zz_generated_a.go', '// header\n\n//go:build polyspec_sample_fault_test || polyspec_sample_panic_test\n\npackage a\n'],
    ['zz_generated_b_test.go', '//go:build polyspec_my_lib_thrown_count_test && polyspec_my_lib_fault_test\n\npackage a\n'],
    ['zz_generated_c.go', '//go:build linux && !musl && (amd64 || arm64) && go1.24\n\npackage a\n'],
    ['zz_generated_d.go', 'package a\n\n// A comment that names //go:build polyspec_sample_panic_test is no build line.\n'],
    ['zz_generated_e_test.go', 'package a\n'],
    ['deep/zz_generated_tags_test.go', 'package deep\n'],
    ['host/host.go', '//go:build polyspec_sample_panic_test\n\npackage host\n'],
    ['go.mod', 'module m\n'],
  ]));
  assert.deepEqual(carried, ['go.mod', 'host/host.go', 'zz_generated_c.go', 'zz_generated_d.go', 'zz_generated_e_test.go']);
  assert.deepEqual([...leftOut], [
    ['zz_generated_a.go', `${TAGGED}s polyspec_sample_fault_test, polyspec_sample_panic_test of a test feature`],
    ['zz_generated_b_test.go', `${TAGGED}s polyspec_my_lib_thrown_count_test, polyspec_my_lib_fault_test of a test feature`],
    ['deep/zz_generated_tags_test.go', GUARD],
  ]);
});

// The generated files of the work tree of a scene that the commit of a release leaves out.
const DEAD: [string, string][] = [
  ['internal/binding/zz_generated_panic.go', '//go:build polyspec_sample_panic_test\n\npackage binding\n'],
  ['internal/binding/zz_generated_panic_test.go', '//go:build polyspec_sample_panic_test\n\npackage binding\n'],
  ['internal/binding/zz_generated_tags_test.go', 'package binding\n'],
  ['zz_generated_fault_test.go', '//go:build polyspec_sample_fault_test\n\npackage sample\n'],
  ['zz_generated_tags_test.go', 'package sample\n'],
];

test('B2.446: the commit of release-go-module adds no file of the work tree behind a build tag of a test feature and no guard (GN-19f)', (t) => {
  const plain = scene(t);
  releaseGoModule(plain.release);
  const s = scene(t);
  for (const [path, text] of DEAD) writeFileSync(join(s.release.root, 'packages/go', path), text);
  writeFileSync(join(s.release.root, 'packages/go/zz_generated_sample_test.go'), 'package sample\n');
  releaseGoModule(s.release);
  const addedOf = (lines: string[]): string[] => lines.filter((line) => line.startsWith('git update-index ')).map((line) => line.slice(line.lastIndexOf(',') + 1));
  // The untagged generated test is the one file that the commit of this tree adds to the commit of the other.
  assert.deepEqual(addedOf(s.lines()), [...addedOf(plain.lines()), 'packages/go/zz_generated_sample_test.go'].sort());
  for (const [path] of DEAD) assert.equal(s.lines().some((line) => line.includes(join(s.release.root, 'packages/go', path))), false, path);
});

// The answers of a commit of the tag that tracks go.mod and `files`, each with its text in that commit.
const tracks = (files: [string, string][]): Answer[] => [
  { tool: 'git', match: ' ls-tree ', stdout: ['go.mod', ...files.map(([path]) => path)].map((path) => `packages/go/${path}\0`).join('') },
  ...files.map(([path, stdout]) => ({ tool: 'git', match: ` show 1+:packages/go/${path.replaceAll('.', '\\.')}$`, stdout })),
];
const TRACKED_GENERATED = (path: string): string => `packages/go/${path}: the commit of the tag v0.0.1 tracks it, and it is a generated file (zz_generated_*.go), which no tracked tree holds, because the release writes its own over it and the released form would differ from that commit without a word: remove it from the index (git rm --cached) and ignore it (GN-15g)`;

test('B2.459: a commit of the tag that tracks a generated file is refused with each such file, whatever its build line and whether the work tree writes over it, and no commit and no tag is made (GN-15g, GN-19f)', (t) => {
  // Before B2.459 the command refused the files of DEAD alone (B2.446), took `sound`, an untagged generated file and
  // one with the constraint of a C library, as the commit of the tag held them, and wrote over the tracked
  // zz_generated_sample.go of the work tree without a word.
  const sound: [string, string][] = [['errors/zz_generated_errors.go', 'package errors\n'], ['internal/binding/zz_generated_other.go', '//go:build !musl\n\npackage binding\n']];
  const over: [string, string][] = [['zz_generated_sample.go', 'package sample\n\n// An earlier generation.\n']];
  const s = scene(t, tracks([['host/host.go', 'package host\n'], ...DEAD, ...sound, ...over]));
  assert.deepEqual(refusal(() => releaseGoModule(s.release)), [...DEAD, ...sound, ...over].map(([path]) => TRACKED_GENERATED(path)));
  assert.deepEqual(s.lines().filter((line) => WRITES.test(line)), []);
  // The text of a tracked generated file is not read: its name refuses it.
  assert.deepEqual(s.lines().filter((line) => line.startsWith('git show ') && line.includes('zz_generated_')), []);
  for (const one of [sound, over]) {
    const alone = scene(t, tracks([['host/host.go', 'package host\n'], ...one]));
    assert.deepEqual(refusal(() => releaseGoModule(alone.release)), one.map(([path]) => TRACKED_GENERATED(path)));
    assert.deepEqual(alone.lines().filter((line) => WRITES.test(line)), []);
  }
});

test('B2.459: the commit removes the tests of the repository and the Go files of the programs from the tree of the commit of the tag and keeps a hand-written package, and the consumer imports no program (GN-15g, GN-19f)', (t) => {
  const kept: [string, string][] = [
    ['host/host.go', 'package host\n'],
    ['tests/support/support.go', 'package support\n'],
  ];
  const left: [string, string][] = [
    ['host/host_test.go', 'package host\n'],
    ['tests/benchmark/main.go', '//go:build ignore\n\npackage main\n'],
    ['tests/cases_test.go', 'package tests\n'],
    ['tests/probe/main.go', '// The probe that the tests of the repository start.\npackage main\n\nfunc main() {}\n'],
    ['tests/probe/main_test.go', 'package main\n'],
  ];
  // A file that is no Go file stays in the tree as the commit of the tag holds it, beside a program too.
  const other = ['internal/ffi/Cargo.toml', 'tests/probe/input.json'];
  const s = scene(t, [{ tool: 'git', match: ' ls-tree ', stdout: ['go.mod', ...[...kept, ...left].map(([path]) => path), ...other].map((path) => `packages/go/${path}\0`).join('') }, ...tracks([...kept, ...left]).slice(1)]);
  const logged: string[] = [];
  assert.deepEqual(releaseGoModule({ ...s.release, log: (line) => logged.push(line) }), { commit: RELEASE_COMMIT, reference: 'refs/tags/packages/go/v0.0.1' });
  const lines = s.lines();
  // The index of the run takes the tree of the commit of the tag, loses the files that the form leaves out and then
  // takes the files of the release. Before B2.459 no file left the index, so the tag held the tests and the programs.
  const index = lines.filter((line) => /^git (read-tree|update-index|write-tree)( |$)/.test(line));
  assert.deepEqual(index.slice(0, 1 + left.length), [`git read-tree ${TAG_COMMIT}`, ...left.map(([path]) => `git update-index --force-remove -- packages/go/${path}`)]);
  assert.equal(index.slice(1 + left.length, -1).every((line) => line.startsWith('git update-index --add --cacheinfo ')), true);
  assert.equal(index.at(-1), 'git write-tree');
  for (const c of s.calls().filter((call) => call.argv.includes('--force-remove'))) assert.equal(c.env['GIT_INDEX_FILE'], join(s.release.work, 'index'));
  for (const path of [...kept.map(([file]) => file), ...other, 'go.mod']) assert.equal(lines.some((line) => line.includes('--force-remove') && line.endsWith(`packages/go/${path}`)), false, path);
  // The checkout keeps every file: the command removes them from its index alone.
  assert.equal(existsSync(join(s.release.root, 'packages/go/go.mod')), true);
  assert.deepEqual(logged.filter((line) => line.includes('the released form leaves it out')), [
    'packages/go/host/host_test.go: the released form leaves it out, since it is a test of the repository, whose inputs the runner of the repository gives (GN-14h) (GN-15g)',
    'packages/go/tests/benchmark/main.go: the released form leaves it out, since it is a Go file of a program (`package main`), which no consumer imports (GN-15g)',
    'packages/go/tests/cases_test.go: the released form leaves it out, since it is a test of the repository, whose inputs the runner of the repository gives (GN-14h) (GN-15g)',
    'packages/go/tests/probe/main.go: the released form leaves it out, since it is a Go file of a program (`package main`), which no consumer imports (GN-15g)',
    'packages/go/tests/probe/main_test.go: the released form leaves it out, since it is a test of the repository, whose inputs the runner of the repository gives (GN-14h) (GN-15g)',
  ]);
  // The text of a test is not read, and the consumer imports the packages that the form holds: the generated root,
  // the host and the hand-written package under tests, and no directory of a program or of tests alone.
  assert.deepEqual(lines.filter((line) => line.startsWith('git show ') && line.endsWith('_test.go')), []);
  assert.match(readFileSync(join(s.release.work, 'consumer/consumer_test.go'), 'utf8'), /import \(\n\t"testing"\n\n\t_ "github\.com\/polyspec\/sample\/packages\/go"\n\t_ "github\.com\/polyspec\/sample\/packages\/go\/host"\n\t_ "github\.com\/polyspec\/sample\/packages\/go\/tests\/support"\n\)/);
});

test('B2.459: one function gives the files of the released form, and the commit of release-go-module and the source of the end-to-end check both read it (GN-15g, GN-14f)', () => {
  const texts = new Map([
    ['go.mod', 'module m\n'],
    ['zz_generated_sample.go', 'package sample\n'],
    ['zz_generated_test.go', 'package sample\n'],
    ['zz_generated_fault_test.go', '//go:build polyspec_sample_fault_test\n\npackage sample\n'],
    ['zz_generated_tags_test.go', 'package sample\n'],
    ['host/host.go', 'package host\n'],
    ['host/host_test.go', 'package host\n'],
    ['tests/cases_test.go', 'package tests\n'],
    ['tests/probe/main.go', 'package main\n'],
    ['tests/probe/input.json', '{}\n'],
    ['internal/ffi/lib/darwin_arm64/libpolyspec_sample_go.a', '!<arch>\n'],
  ]);
  const read: string[] = [];
  const form = goReleaseFiles([...texts.keys()], (path) => {
    read.push(path);
    return texts.get(path) ?? '';
  });
  assert.deepEqual(form.carried, ['go.mod', 'host/host.go', 'internal/ffi/lib/darwin_arm64/libpolyspec_sample_go.a', 'tests/probe/input.json', 'zz_generated_sample.go', 'zz_generated_test.go']);
  assert.deepEqual([...form.leftOut], [
    ['zz_generated_fault_test.go', `${TAGGED} polyspec_sample_fault_test of a test feature`],
    ['zz_generated_tags_test.go', GUARD],
    ['host/host_test.go', 'is a test of the repository, whose inputs the runner of the repository gives (GN-14h)'],
    ['tests/cases_test.go', 'is a test of the repository, whose inputs the runner of the repository gives (GN-14h)'],
    ['tests/probe/main.go', 'is a Go file of a program (`package main`), which no consumer imports'],
  ]);
  // The function reads the text of a Go file alone, and of a test of the repository not even that.
  assert.deepEqual([...new Set(read)].sort(), ['host/host.go', 'tests/probe/main.go', 'zz_generated_fault_test.go', 'zz_generated_sample.go', 'zz_generated_tags_test.go', 'zz_generated_test.go']);
  // The source of the released form of the end-to-end check takes its files and its packages from the functions of
  // the command and removes a file by no other rule; before B2.459 it removed the tests of the repository by the
  // rule of the overlay and counted its packages by a walk of its own.
  const e2e = readFileSync(new URL('../../../scripts/e2e.mts', import.meta.url), 'utf8');
  const step = e2e.slice(e2e.indexOf('// GN-14f: the released form.'), e2e.indexOf('// GN-14, GN-6s: tsc --strict'));
  assert.match(step, /const form = goReleaseFiles\(moduleFiles, readModuleFile\);/);
  assert.match(step, /for \(const path of leftOut\.keys\(\)\) rmSync\(join\(moduleDir, path\)\);/);
  assert.match(step, /packages: publicPackages\(form\.carried, readModuleFile\)/);
  assert.equal(step.split('rmSync(join(moduleDir,').length - 1, 1, 'the step removes a file of the module by one rule');
  assert.doesNotMatch(step, /goTestScope/);
  const command = readFileSync(new URL('../src/release/go-module.ts', import.meta.url), 'utf8');
  assert.match(command, /const form = goReleaseFiles\(\[\.\.\.handWritten, \.\.\.written\.keys\(\)\], read\);/);
  assert.match(command, /packages: publicPackages\(form\.carried, read\)/);
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

test('B2.479: binding release-go-module --rehearsal prints no reference, and its output ends with what the rehearsal did not see (GN-19f)', (t) => {
  const s = rehearse(t);
  for (const platform of LINUX) rmSync(join(s.release.libraries, platform), { recursive: true });
  mkdirSync(join(s.release.root, 'packages/rust'), { recursive: true });
  writeFileSync(join(s.release.root, 'packages/rust/interface.json'), JSON.stringify({ library: 'sample', targets: ['go'], core: { crate: 'polyspec-sample', path: 'packages/rust' }, packages: { go: { module: 'github.com/polyspec/sample/packages/go' } } }));
  const run = spawnSync(process.execPath, [cli, 'release-go-module', '--root', s.release.root, '--tag', 'v0.0.1', '--rehearsal', '--libraries', s.release.libraries, '--work', s.release.work], { encoding: 'utf8', env: { PATH: join(s.dir, 'bin'), STANDIN: s.dir } });
  assert.equal(run.status, 0, run.stderr);
  // The recipe of a release pushes what the standard output names: a rehearsal names nothing.
  assert.equal(run.stdout, '');
  const last = run.stderr.trimEnd().split('\n').slice(-8);
  assert.equal(last[0], 'binding: the rehearsal of github.com/polyspec/sample/packages/go v0.0.1 passed on what is here, and it is no release (GN-19f). It did not see:');
  assert.deepEqual(last.slice(2, 6), LINUX.map((platform) => `binding:   - ${absentOf(s, platform)}`));
  assert.match(last[7] ?? '', /^binding: {3}- a commit and a tag of the Go module: the rehearsal made none in the repository and pushed nothing; its commit 2+ is in .*rehearsal\.git alone$/);
  assert.deepEqual(s.lines().filter((line) => REPOSITORY_WRITES.test(line)), []);
  // A refused rehearsal says that it is one.
  const refused = rehearse(t, [], 'darwin', 'amd64');
  mkdirSync(join(refused.release.root, 'packages/rust'), { recursive: true });
  writeFileSync(join(refused.release.root, 'packages/rust/interface.json'), readFileSync(join(s.release.root, 'packages/rust/interface.json')));
  const stopped = spawnSync(process.execPath, [cli, 'release-go-module', '--rehearsal', '--root', refused.release.root, '--tag', 'v0.0.1', '--libraries', refused.release.libraries, '--work', refused.release.work], { encoding: 'utf8', env: { PATH: join(refused.dir, 'bin'), STANDIN: refused.dir } });
  assert.equal(stopped.status, 1);
  assert.match(stopped.stderr, /binding: the rehearsal of the Go module stopped at these checks, and it made no commit and no tag \(GN-19f\)\n$/);
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
