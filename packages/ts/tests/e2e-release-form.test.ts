// GN-14l, GN-14f, GN-3h (B2.458): the release form of a run of the end-to-end check. The functions of
// scripts/e2e-release-form.mts give the text of the two changes of the copy, the order of the steps, the tags of the
// remotes of the Go modules, the settings that keep Git and Go off the network, and the reading of the manifests and
// of the installed wheel. No case opens a network: Git runs with the settings of the run, which allow a file alone,
// and Go is a stand-in that asks that Git for the repository of a module, as Go does with GOPROXY=direct.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { goRemote, requiredVersion } from '../src/release/go-module.ts';
import { goCarried, goRemoteTags, goRunEnv, goRunGitConfig, missingPythonRequirements, missingRemoteProblem, namedByPath, releaseFormCore, releaseFormManifests, releaseSteps, workspacePatch, type Manifests, type Sibling } from '../../../scripts/e2e-release-form.mts';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const e2e = new URL('../../../tests/e2e/', import.meta.url).pathname;
const sample: Sibling = { crate: 'polyspec-sample', library: 'sample', version: '0.0.3', path: '/work/sample/packages/rust' };
const core = (line: string): string => `[package]\nname = "polyspec-consumer"\n\n[dependencies]\npolyspec-binding-core = { git = "https://github.com/polyspec/binding.git", branch = "v1/rust-core" }\n${line}\n\n[lints]\nworkspace = true\n`;

test('B2.458: the line of a core that names a dependency of the run by a path becomes version = "=X.Y.Z", and every other line and field stays (GN-14l, GN-3e)', () => {
  const form = releaseFormCore(core('polyspec-sample = { path = "../../../sample/packages/rust", features = ["fault-test"] }'), [sample]);
  assert.deepEqual(form.rewritten, ['polyspec-sample']);
  assert.equal(form.text, core('polyspec-sample = { version = "=0.0.3", features = ["fault-test"] }'));
  assert.deepEqual(namedByPath(core('polyspec-sample = { path = "../../../sample/packages/rust" }'), ['polyspec-sample', 'polyspec-points']), ['polyspec-sample']);
  // A line in another form is no line of the rewrite: a tag, a version, and a path of a table that is no dependency.
  for (const line of ['polyspec-sample = { git = "https://github.com/polyspec/sample.git", tag = "v0.0.3" }', 'polyspec-sample = "=0.0.3"']) {
    assert.deepEqual(releaseFormCore(core(line), [sample]), { text: core(line), rewritten: [] });
    assert.deepEqual(namedByPath(core(line), ['polyspec-sample']), []);
  }
  const dev = `[dev-dependencies]\npolyspec-sample = { path = "../x" }\n`;
  assert.deepEqual(releaseFormCore(dev, [sample]).rewritten, []);
  // A path that the rewrite cannot write on one line is named, never left a development form unseen.
  assert.throws(() => releaseFormCore('[dependencies.polyspec-sample]\npath = "../x"\n', [sample]), /the dependency polyspec-sample is a table \[dependencies\.polyspec-sample\], not one line/);
  assert.throws(() => releaseFormCore(core('polyspec-sample = { path = "../x",'), [sample]), /names a path in a form that is not one inline table/);
});

test('B2.458: the root workspace gets one [patch.crates-io] with the path of each rewritten dependency, and a manifest that has one is refused (GN-14l)', () => {
  const root = '[workspace]\nmembers = ["packages/rust"]\n';
  assert.equal(
    workspacePatch(root, [sample, { crate: 'polyspec-points', library: 'points', version: '0.1.0', path: '/work/points/packages/rust' }]),
    `${root}\n# GN-14l: the release form of the run; the crate of each dependency of the run in place of the registry.\n[patch.crates-io]\npolyspec-sample = { path = "/work/sample/packages/rust" }\npolyspec-points = { path = "/work/points/packages/rust" }\n`,
  );
  assert.throws(() => workspacePatch(`${root}\n[patch.crates-io]\nserde = { path = "x" }\n`, [sample]), /already holds \[patch\.crates-io\]/);
});

test('B2.458: the steps of the release form stand in one order: the remote of a dependency before the scaffold, the manifests before a build, an install before its tests, the Go module of the repository before its consumer (GN-14l, GN-14f)', () => {
  const ids = (targets: string[]): string[] => releaseSteps(targets).map((s) => s.id);
  assert.deepEqual(ids(['php', 'python', 'node', 'go', 'wasm']), ['go-dependencies', 'rewrite', 'scaffold', 'check', 'python-install', 'python-tests', 'npm-install', 'node-tests', 'wasm-tests', 'go-repository', 'go-consumer']);
  // The steps of the manifests are steps of every target, PHP among them, which has no install of its own (GN-3h).
  const all = releaseSteps(['php', 'python', 'node', 'go', 'wasm']);
  for (const id of ['rewrite', 'scaffold', 'check']) assert.deepEqual(all.find((s) => s.id === id)?.targets, ['php', 'python', 'node', 'go', 'wasm']);
  assert.deepEqual(all.filter((s) => s.targets.includes('php')).map((s) => s.id), ['rewrite', 'scaffold', 'check']);
  assert.deepEqual(all.find((s) => s.id === 'npm-install')?.targets, ['node', 'wasm']);
  // A contract without a target has no step of it, and the order of the others stays.
  assert.deepEqual(ids(['python', 'php']), ['rewrite', 'scaffold', 'check', 'python-install', 'python-tests']);
  assert.deepEqual(ids(['wasm', 'go']), ['go-dependencies', 'rewrite', 'scaffold', 'check', 'npm-install', 'wasm-tests', 'go-repository', 'go-consumer']);
  // The run executes these steps in this order and holds a body for each.
  const script = readFileSync(new URL('../../../scripts/e2e.mts', import.meta.url), 'utf8');
  assert.match(script, /for \(const s of releaseSteps\(targets\)\) stepOf\(s\.targets as Lang\[\], s\.what, bodies\[s\.id\]\);/);
  assert.match(script, /const bodies: Record<ReleaseStep, \(\) => void> = \{/);
});

const consumerModule = 'github.com/polyspec/consumer/packages/go';
const sampleModule = 'github.com/polyspec/sample/packages/go';

test('B2.458: a dependency whose line the run writes in the release form is tagged at the version of its own core, and another one at the version that go.mod requires (GN-14f, GN-14l)', () => {
  const mains = [{ module: consumerModule, version: '0.0.7' }];
  const dependencies = [{ module: sampleModule, version: '0.0.3' }, { module: 'github.com/polyspec/points/packages/go', version: '0.1.0' }];
  const development = `module ${consumerModule}\n\ngo 1.27.3\n\nrequire ${sampleModule} v0.0.0\n\nreplace ${sampleModule} => ../../../sample/packages/go\n`;
  // The release form: the tag is the one that the go.mod of the release form will require; points is not required.
  const released = goCarried(mains, dependencies, [development], [sampleModule], requiredVersion);
  assert.deepEqual(released, [{ module: consumerModule, version: 'v0.0.7', main: true }, { module: sampleModule, version: 'v0.0.3', main: false }]);
  assert.deepEqual([...goRemoteTags(released, goRemote)], [['polyspec/consumer', ['packages/go/v0.0.7']], ['polyspec/sample', ['packages/go/v0.0.3']]]);
  // After the scaffold of the release form the go.mod requires that version, and the tag is the same.
  assert.deepEqual(goCarried(mains, dependencies, [`module ${consumerModule}\n\ngo 1.27.3\n\nrequire ${sampleModule} v0.0.3\n`], [sampleModule], requiredVersion), released);
  // A run that writes no release form tags the dependency at v0.0.0, as before.
  assert.deepEqual([...goRemoteTags(goCarried(mains, dependencies, [development], [], requiredVersion), goRemote)], [['polyspec/consumer', ['packages/go/v0.0.7']], ['polyspec/sample', ['packages/go/v0.0.0']]]);
  // Two modules of one repository share its commit; a repository of both a module of the run and of a dependency is refused.
  assert.deepEqual([...goRemoteTags([{ module: 'github.com/o/r/a', version: 'v1.0.0', main: true }, { module: 'github.com/o/r/b', version: 'v1.0.0', main: true }], goRemote)], [['o/r', ['a/v1.0.0', 'b/v1.0.0']]]);
  assert.throws(() => goRemoteTags([{ module: 'github.com/o/r/a', version: 'v1.0.0', main: true }, { module: 'github.com/o/r/b', version: 'v1.0.0', main: false }], goRemote), /the repository o\/r holds a Go module of the repository of the run and one of a dependency/);
  assert.throws(() => goRemoteTags([{ module: 'example.com/x', version: 'v1.0.0', main: true }], goRemote), /is not github\.com\/<owner>\/<repository>/);
});

test('B2.458: the Go steps give Git the configuration of the run alone and a file as its one transport, and Go no proxy, no checksum database and no setting of the machine (GN-14f)', () => {
  assert.deepEqual(goRunEnv('/work/go-release/gitconfig', '/work/go-release/modcache'), {
    GIT_CONFIG_COUNT: '0', GIT_CONFIG_GLOBAL: '/work/go-release/gitconfig', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file',
    GOENV: 'off', GOTOOLCHAIN: 'local', GOWORK: 'off', GOPROXY: 'direct', GOSUMDB: 'off', GOMODCACHE: '/work/go-release/modcache', GOFLAGS: '', CGO_LDFLAGS: '',
  });
  assert.equal(goRunGitConfig('/work/go-release/remote'), '[user]\n\tname = binding e2e\n\temail = e2e@example.invalid\n[init]\n\tdefaultBranch = main\n[url "file:///work/go-release/remote/"]\n\tinsteadOf = https://github.com/\n');
});

// A directory of a run: the remotes, the configuration of Git and the environment of the Go steps.
function goRun(t: TestContext): { root: string; remotes: string; env: Record<string, string>; git: (...argv: string[]) => { status: number | null; output: string } } {
  const root = mkdtempSync(join(tmpdir(), 'e2e-release-form-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remotes = join(root, 'remote');
  mkdirSync(remotes);
  writeFileSync(join(root, 'gitconfig'), goRunGitConfig(remotes));
  const env = goRunEnv(join(root, 'gitconfig'), join(root, 'modcache'));
  const git = (...argv: string[]): { status: number | null; output: string } => {
    const ran = spawnSync('git', argv, { encoding: 'utf8', env: { ...process.env, ...env } });
    return { status: ran.status, output: `${ran.stdout}${ran.stderr}` };
  };
  return { root, remotes, env, git };
}

// The repository of a Go module in the remotes of a run, with one commit and its tags, as the run makes it.
function remote(run: ReturnType<typeof goRun>, repository: string, tags: string[]): void {
  const source = join(run.root, 'source', repository);
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, 'go.mod'), 'module x\n');
  for (const argv of [['init', '--quiet'], ['add', '--all'], ['commit', '--quiet', '--message', 'x'], ...tags.map((tag) => ['tag', tag])]) {
    const ran = run.git('-C', source, ...argv);
    assert.equal(ran.status, 0, ran.output);
  }
  mkdirSync(join(run.remotes, repository, '..'), { recursive: true });
  const cloned = run.git('clone', '--quiet', '--bare', source, join(run.remotes, `${repository}.git`));
  assert.equal(cloned.status, 0, cloned.output);
}

test('B2.458: the Git of the Go steps reads GitHub as the remotes of the run, fails a repository that the run did not make by its path there, and refuses every transport but a file (GN-14f, GN-14l)', (t) => {
  const run = goRun(t);
  remote(run, 'polyspec/sample', ['packages/go/v0.0.3']);
  const listed = run.git('ls-remote', '--tags', 'https://github.com/polyspec/sample');
  assert.equal(listed.status, 0, listed.output);
  assert.match(listed.output, /\trefs\/tags\/packages\/go\/v0\.0\.3\n/);
  // A repository that the run did not make, of any owner: Git names the directory of the run and asks no host.
  for (const url of ['https://github.com/polyspec/points', 'https://github.com/another/owner']) {
    const missing = run.git('ls-remote', url);
    assert.notEqual(missing.status, 0);
    assert.ok(missing.output.includes(`'${run.remotes}/${url.slice('https://github.com/'.length)}' does not appear to be a git repository`), missing.output);
  }
  // A URL that the configuration does not turn into a directory is refused before a connection.
  for (const [url, transport] of [['https://example.invalid/x/y', 'https'], ['http://github.com/polyspec/sample', 'http'], ['ssh://git@github.com/polyspec/sample', 'ssh'], ['git@github.com:polyspec/sample', 'ssh'], ['git://github.com/polyspec/sample', 'git']] as const) {
    const refused = run.git('ls-remote', url);
    assert.notEqual(refused.status, 0);
    assert.match(refused.output, new RegExp(`transport '${transport}' not allowed`), `${url}: ${refused.output}`);
  }
  // So is GitHub itself when the file of the configuration is missing.
  rmSync(join(run.root, 'gitconfig'));
  const bare = run.git('ls-remote', 'https://github.com/polyspec/sample');
  assert.notEqual(bare.status, 0);
  assert.match(bare.output, /transport 'https' not allowed/);
});

test('B2.458: a fetch before the repository stands must fail by the remotes of the run (GN-14l)', () => {
  const remotes = '/work/go-release/remote';
  // The output of go mod download with the settings of the run, for a module whose repository is not there.
  const output = `go: github.com/polyspec/sample/packages/go@v0.0.3: invalid version: git ls-remote -q --end-of-options https://github.com/polyspec/sample in /work/go-release/modcache-probe/cache/vcs/cf2e: exit status 128:\n\tfatal: '${remotes}/polyspec/sample' does not appear to be a git repository\n\tfatal: Could not read from remote repository.\n`;
  assert.equal(missingRemoteProblem(1, output, remotes), undefined);
  assert.match(missingRemoteProblem(0, '', remotes) ?? '', /Go fetched a module whose repository the run has not made/);
  assert.match(missingRemoteProblem(1, 'go: github.com/polyspec/sample/packages/go@v0.0.3: unrecognized import path: dial tcp: lookup github.com: no such host\n', remotes) ?? '', /without naming the remotes of the run, \/work\/go-release\/remote, .*: go: github\.com\/polyspec\/sample\/packages\/go@v0\.0\.3: unrecognized import path/);
});

const sibling = { library: 'sample', version: '0.0.3', npm: '@polyspec/sample', composer: 'polyspec/sample', goModule: sampleModule };
const development: Manifests = {
  packageJson: JSON.stringify({ name: '@polyspec/consumer', dependencies: { '@polyspec/sample': '*' } }),
  composerJson: JSON.stringify({ require: { php: '>=8.4', 'ext-polyspec_sample': '*', 'polyspec/sample': '*' } }),
  pyproject: '[project]\nname = "polyspec-consumer"\ndependencies = ["polyspec-sample"]\n',
  goMod: `module ${consumerModule}\n\ngo 1.27.3\n\nrequire ${sampleModule} v0.0.0\n\nreplace ${sampleModule} => ../../../sample/packages/go\n`,
};
const release: Manifests = {
  packageJson: JSON.stringify({ name: '@polyspec/consumer', dependencies: { '@polyspec/sample': '0.0.3' } }),
  composerJson: JSON.stringify({ require: { php: '>=8.4', 'ext-polyspec_sample': '*', 'polyspec/sample': '0.0.3' } }),
  pyproject: '[project]\nname = "polyspec-consumer"\ndependencies = ["polyspec-sample==0.0.3"]\n',
  goMod: `module ${consumerModule}\n\ngo 1.27.3\n\nrequire ${sampleModule} v0.0.3\n`,
  goSum: `${sampleModule} v0.0.3 h1:zip=\n${sampleModule} v0.0.3/go.mod h1:mod=\n`,
};

test('B2.458: each manifest that named a dependency in the development form names it at its version in the release form, go.sum among them, and one that does not is named (GN-3e, GN-15l, GN-14l)', () => {
  assert.deepEqual(releaseFormManifests(development, release, [sibling], requiredVersion), {
    named: [
      'package.json names @polyspec/sample 0.0.3', 'composer.json names polyspec/sample 0.0.3', 'pyproject.toml names polyspec-sample==0.0.3',
      `go.mod names ${sampleModule} v0.0.3`, `go.sum holds ${sampleModule} v0.0.3 h1:`, `go.sum holds ${sampleModule} v0.0.3/go.mod h1:`,
    ],
    problems: [],
  });
  // A scaffold that left the development forms: each manifest is named with what it holds.
  assert.deepEqual(releaseFormManifests(development, development, [sibling], requiredVersion).problems, [
    'package.json names @polyspec/sample *, not @polyspec/sample 0.0.3 of the release form (GN-3e)',
    'composer.json names polyspec/sample *, not polyspec/sample 0.0.3 of the release form (GN-3e)',
    'pyproject.toml names polyspec-sample, not polyspec-sample==0.0.3 of the release form (GN-3e)',
    `go.mod names ${sampleModule} v0.0.0, not ${sampleModule} v0.0.3 of the release form (GN-3e)`,
    'go.mod holds a replace line, which a consumer of the tag of the Go module cannot resolve (GN-15f)',
    `go.sum holds no line ${sampleModule} v0.0.3 h1:, which binding scaffold writes from the tag of the module in the remote of the run (GN-15l)`,
    `go.sum holds no line ${sampleModule} v0.0.3/go.mod h1:, which binding scaffold writes from the tag of the module in the remote of the run (GN-15l)`,
  ]);
  // Another version than the one of the dependency of the run is no release form of the run.
  assert.deepEqual(releaseFormManifests(development, { ...release, pyproject: 'dependencies = ["polyspec-sample==0.0.4"]\n' }, [sibling], requiredVersion).problems, ['pyproject.toml names polyspec-sample==0.0.4, not polyspec-sample==0.0.3 of the release form (GN-3e)']);
  // Which manifests name a dependency is a matter of the contract: one that did not name it is not judged.
  const few: Manifests = { packageJson: JSON.stringify({ name: '@polyspec/plot' }), composerJson: JSON.stringify({ require: { 'ext-polyspec_sample': '*' } }), pyproject: development.pyproject };
  assert.deepEqual(releaseFormManifests(few, { ...few, pyproject: release.pyproject }, [sibling], requiredVersion), { named: ['pyproject.toml names polyspec-sample==0.0.3'], problems: [] });
  assert.deepEqual(releaseFormManifests({}, {}, [sibling], requiredVersion), { named: [], problems: [] });
});

test('B2.458: the installed wheel holds the requirement of the release form on each dependency, and one that does not is named with what it holds (GN-3e, GN-3h)', () => {
  assert.deepEqual(missingPythonRequirements(['polyspec-sample==0.0.3'], [sibling]), []);
  assert.deepEqual(missingPythonRequirements(['polyspec-sample == 0.0.3'], [sibling]), []);
  assert.deepEqual(missingPythonRequirements(['polyspec-sample'], [sibling]), ['the installed distribution requires polyspec-sample, not polyspec-sample==0.0.3 (GN-3e)']);
  assert.deepEqual(missingPythonRequirements([], [sibling]), ['the installed distribution requires no polyspec-sample, not polyspec-sample==0.0.3 (GN-3e)']);
});

// The plot and the points of the end-to-end check in a directory, in the release form that the run writes, with a
// cargo whose metadata names the core of points and a go that asks Git for the repository and the tag of each
// required module, as Go does with GOPROXY=direct, and gives its error or its sums.
function releaseBox(t: TestContext): { run: ReturnType<typeof goRun>; scaffold: (env: Record<string, string>) => { status: number | null; stderr: string }; plot: string; developmentOf: () => Manifests; manifests: () => Manifests } {
  const run = goRun(t);
  const { root } = run;
  for (const repository of ['points', 'plot']) cpSync(join(e2e, repository), join(root, repository), { recursive: true });
  mkdirSync(join(root, 'bin'));
  const standIn = (file: string, script: string): void => {
    writeFileSync(`${file}.mjs`, script);
    writeFileSync(file, `#!/bin/sh\nexec '${process.execPath}' '${file}.mjs' "$@"\n`, { mode: 0o755 });
  };
  standIn(join(root, 'bin/cargo'), `process.stdout.write(${JSON.stringify(`${JSON.stringify({ packages: [{ name: 'polyspec-points', manifest_path: join(root, 'points/packages/rust/Cargo.toml') }] })}\n`)});\n`);
  standIn(join(root, 'bin/go-stand-in'), `import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
let status = 0;
for (const line of readFileSync('go.mod', 'utf8').split('\\n')) {
  const found = /^require ([^ ]*) (v[^ ]*)$/.exec(line);
  if (found === null) continue;
  const [, host, owner, repository, ...directory] = /^([^/]*)\\/([^/]*)\\/([^/]*)\\/?(.*)$/.exec(found[1]);
  const tag = [...directory.filter((part) => part !== ''), found[2]].join('/');
  const listed = spawnSync('git', ['ls-remote', '-q', '--end-of-options', 'https://' + host + '/' + owner + '/' + repository], { encoding: 'utf8' });
  const error = listed.status !== 0 ? listed.stderr : listed.stdout.includes('\\trefs/tags/' + tag + '\\n') ? undefined : 'unknown revision ' + tag;
  if (error !== undefined) status = 1;
  process.stdout.write(JSON.stringify(error === undefined ? { Path: found[1], Version: found[2], Sum: 'h1:zip=', GoModSum: 'h1:mod=' } : { Path: found[1], Version: found[2], Error: error }) + '\\n');
}
process.exit(status);
`);
  const plot = join(root, 'plot');
  const path = { ...process.env, PATH: `${join(root, 'bin')}${delimiter}${process.env['PATH'] ?? ''}` };
  const scaffold = (env: Record<string, string>): { status: number | null; stderr: string } => {
    const ran = spawnSync(process.execPath, [cli, 'scaffold', '--root', plot, '--cargo', 'cargo', '--go', join(root, 'bin/go-stand-in')], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...path, ...env } });
    return { status: ran.status, stderr: ran.stderr };
  };
  const read = (file: string): string | undefined => (existsSync(join(plot, file)) ? readFileSync(join(plot, file), 'utf8') : undefined);
  const manifests = (): Manifests => ({ packageJson: read('packages/ts/package.json'), composerJson: read('packages/php-ext/composer.json'), pyproject: read('packages/python/pyproject.toml'), goMod: read('packages/go/go.mod'), goSum: read('packages/go/go.sum') });
  // The development form, as the first scaffold of a run writes it, and then the two changes of the run.
  const first = scaffold({});
  assert.equal(first.status, 0, first.stderr);
  const before = manifests();
  const points: Sibling = { crate: 'polyspec-points', library: 'points', version: '0.0.1', path: join(root, 'points/packages/rust') };
  const form = releaseFormCore(readFileSync(join(plot, 'packages/rust/Cargo.toml'), 'utf8'), [points]);
  assert.deepEqual(form.rewritten, ['polyspec-points']);
  writeFileSync(join(plot, 'packages/rust/Cargo.toml'), form.text);
  writeFileSync(join(plot, 'Cargo.toml'), workspacePatch(readFileSync(join(plot, 'Cargo.toml'), 'utf8'), [points]));
  return { run, scaffold, plot, developmentOf: () => before, manifests };
}

const points = { library: 'points', version: '0.0.1', npm: '@polyspec/points', composer: 'polyspec/points', goModule: 'github.com/polyspec/points/packages/go' };

test('B2.458: binding scaffold of the release form of a run writes the manifests of a release, go.sum from the tag of the dependency in the remotes of the run (GN-3e, GN-15l, GN-14l)', (t) => {
  const box = releaseBox(t);
  remote(box.run, 'polyspec/points', ['packages/go/v0.0.1']);
  const ran = box.scaffold(box.run.env);
  assert.equal(ran.status, 0, ran.stderr);
  const judged = releaseFormManifests(box.developmentOf(), box.manifests(), [points], requiredVersion);
  assert.deepEqual(judged.problems, []);
  assert.ok(judged.named.includes('pyproject.toml names polyspec-points==0.0.1'), judged.named.join('; '));
  assert.ok(judged.named.includes('composer.json names polyspec/points 0.0.1'), judged.named.join('; '));
  assert.ok(judged.named.includes('go.mod names github.com/polyspec/points/packages/go v0.0.1'), judged.named.join('; '));
  assert.ok(judged.named.includes('go.sum holds github.com/polyspec/points/packages/go v0.0.1 h1:'), judged.named.join('; '));
});

test('B2.458: binding scaffold of the release form with no tag of the dependency fails by the remotes of the run, and by no network (GN-14l, GN-15l)', (t) => {
  const box = releaseBox(t);
  // No repository of the dependency stands in the run: Git names the directory of the run.
  const absent = box.scaffold(box.run.env);
  assert.equal(absent.status, 1, absent.stderr);
  assert.match(absent.stderr, /binding: packages\/go\/go\.sum: not written: go mod download gave no sum of github\.com\/polyspec\/points\/packages\/go v0\.0\.1: /);
  assert.ok(absent.stderr.includes(`'${box.run.remotes}/polyspec/points' does not appear to be a git repository`), absent.stderr);
  assert.equal(missingRemoteProblem(absent.status, absent.stderr, box.run.remotes), undefined);
  assert.equal(box.manifests().goSum, undefined);
  // The repository stands without the tag of the version: the tag is unknown there.
  remote(box.run, 'polyspec/points', ['packages/go/v0.0.0']);
  const untagged = box.scaffold(box.run.env);
  assert.equal(untagged.status, 1, untagged.stderr);
  assert.match(untagged.stderr, /go\.sum: not written: go mod download gave no sum of github\.com\/polyspec\/points\/packages\/go v0\.0\.1: .*unknown revision packages\/go\/v0\.0\.1/);
  // Without the configuration of the run, the same settings refuse GitHub before a connection.
  rmSync(join(box.run.root, 'gitconfig'));
  const refused = box.scaffold(box.run.env);
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /go\.sum: not written: go mod download gave no sum of github\.com\/polyspec\/points\/packages\/go v0\.0\.1: .*fatal: transport 'https' not allowed/);
});
