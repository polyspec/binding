// GN-15l, GN-19f, GN-19h (B2.456): binding looks for the go command before it starts it. `binding check` and `binding
// scaffold` need it only when the go.mod that the scaffold writes requires the release of another polyspec Go module,
// and `binding release-go-module` always; a command that needs it and does not find it fails with one sentence that
// says why it is needed and names the tool, the option --go and the variable $(GO). Each case runs the CLI with a PATH
// that holds no go, and gives --go a stand-in that records its arguments.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import type { Contract } from '../src/contract.ts';
import { goCommand } from '../src/go-command.ts';
import { releaseRecipes } from '../src/release/recipes.ts';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const e2e = new URL('../../../tests/e2e/', import.meta.url).pathname;
const fixture = new URL('./fixtures/repo/', import.meta.url).pathname;

// The PATH of the run without each directory that holds a go, so the other tools of the run stay.
const pathWithoutGo = (): string => (process.env['PATH'] ?? '').split(delimiter).filter((dir) => dir !== '' && !existsSync(join(dir, 'go'))).join(delimiter);

interface Box {
  root: string;
  contract: string;
  goSum: string;
  // The stand-in of go, which is on no directory of PATH, and the arguments of each of its calls.
  go: string;
  goCalls: () => string[];
  run: (...argv: string[]) => { status: number | null; stdout: string; stderr: string };
}

// The plot and the points of the end-to-end check in a directory, with a cargo whose metadata names the core of
// points. `release` makes the core of plot depend on a tag of points, so the go.mod of plot requires a release.
function box(t: TestContext, release: boolean): Box {
  const root = mkdtempSync(join(tmpdir(), 'binding-go-command-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const repository of ['points', 'plot']) cpSync(join(e2e, repository), join(root, repository), { recursive: true });
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(root, 'tools'));
  const metadata = JSON.stringify({ packages: [{ name: 'polyspec-points', manifest_path: join(root, 'points/packages/rust/Cargo.toml') }] });
  // A stand-in starts no command of PATH: the PATH of a run is without each directory that holds a go, which on a
  // machine whose go is beside cat and sed is without them too (B2.456, the check job of CI). So each is a script of
  // Node, which /bin/sh starts by the path of the Node of the run.
  const standIn = (file: string, script: string): void => {
    writeFileSync(`${file}.mjs`, script);
    writeFileSync(file, `#!/bin/sh\nexec '${process.execPath}' '${file}.mjs' "$@"\n`, { mode: 0o755 });
  };
  standIn(join(root, 'bin/cargo'), `process.stdout.write(${JSON.stringify(`${metadata}\n`)});\n`);
  const calls = join(root, 'go-calls');
  standIn(join(root, 'tools/go-stand-in'), `import { appendFileSync, readFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(' ') + '\\n');
for (const line of readFileSync('go.mod', 'utf8').split('\\n')) {
  const found = /^require ([^ ]*) (v[^ ]*)$/.exec(line);
  if (found !== null) process.stdout.write(JSON.stringify({ Path: found[1], Version: found[2], Sum: 'h1:zip-' + found[2] + '=', GoModSum: 'h1:mod-' + found[2] + '=' }) + '\\n');
}
`);
  if (release) {
    const manifest = join(root, 'plot/packages/rust/Cargo.toml');
    const path = 'polyspec-points = { path = "../../../points/packages/rust" }';
    assert.ok(readFileSync(manifest, 'utf8').includes(path));
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(path, 'polyspec-points = { git = "https://github.com/polyspec/points.git", tag = "v0.1.2" }'));
  }
  const env = { ...process.env, PATH: `${join(root, 'bin')}${delimiter}${pathWithoutGo()}` };
  return {
    root,
    contract: join(root, 'plot/packages/rust/interface.json'),
    goSum: join(root, 'plot/packages/go/go.sum'),
    go: join(root, 'tools/go-stand-in'),
    goCalls: () => (existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter((line) => line !== '') : []),
    run: (...argv) => spawnSync(process.execPath, [cli, ...argv, '--cargo', 'cargo'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, env }),
  };
}

// The sentence of a command that needs go and finds none: why, the tool, the option and the variable.
const NEEDED = /binding: .*go\.mod requires the release github\.com\/polyspec\/points\/packages\/go v0\.1\.2 of another polyspec Go module, so its go\.sum is written from `go mod download` \(GN-15l\), and the go command `go` is not found on PATH: install Go, or name the go command with --go <command>, the value of \$\(GO\) of the release recipes \(GN-19h\)\n/;

test('B2.456: binding check and scaffold of a go.mod that requires a release, without go, name why go is needed, the tool, --go and $(GO) (GN-15l)', (t) => {
  const b = box(t, true);
  for (const argv of [['check', b.contract], ['scaffold', '--root', join(b.root, 'plot')]]) {
    const ran = b.run(...argv);
    assert.equal(ran.status, 1, ran.stderr);
    assert.match(ran.stderr, NEEDED);
    assert.doesNotMatch(ran.stderr, /ENOENT|spawnSync|\n {4}at /, ran.stderr);
  }
  assert.equal(existsSync(b.goSum), false);
  // A command of --go that is no program is named as the command of --go.
  const missing = b.run('check', b.contract, '--go', join(b.root, 'tools/no-go'));
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stderr, /the go command `[^`]*tools\/no-go` of --go is not found: install Go, or name the go command with --go <command>, the value of \$\(GO\) of the release recipes \(GN-19h\)\n/);
});

test('B2.529: binding check and scaffold that end for a go that is not found leave no binding-go-sum-* in TMPDIR (GN-14p)', (t) => {
  const b = box(t, true);
  const temporary = mkdtempSync(join(tmpdir(), 'binding-go-sum-tmp-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const env = { ...process.env, TMPDIR: temporary, PATH: `${join(b.root, 'bin')}${delimiter}${pathWithoutGo()}` };
  for (const argv of [['check', b.contract], ['scaffold', '--root', join(b.root, 'plot')]]) {
    const ran = spawnSync(process.execPath, [cli, ...argv, '--cargo', 'cargo'], { cwd: b.root, encoding: 'utf8', env });
    assert.equal(ran.status, 1, ran.stderr);
    assert.match(ran.stderr, NEEDED);
  }
  assert.deepEqual(readdirSync(temporary).filter((name) => name.startsWith('binding-go-sum-')), []);
});

test('B2.456: binding scaffold and check run the command of --go with mod download -json all (GN-15l)', (t) => {
  const b = box(t, true);
  const scaffold = b.run('scaffold', '--root', join(b.root, 'plot'), '--go', b.go);
  assert.equal(scaffold.status, 0, scaffold.stderr);
  assert.deepEqual(b.goCalls(), ['mod download -json all']);
  assert.equal(readFileSync(b.goSum, 'utf8'), 'github.com/polyspec/points/packages/go v0.1.2 h1:zip-v0.1.2=\ngithub.com/polyspec/points/packages/go v0.1.2/go.mod h1:mod-v0.1.2=\n');
  const checked = b.run('check', b.contract, '--go', b.go);
  assert.doesNotMatch(checked.stderr, /go\.sum|go command/, checked.stderr);
  assert.deepEqual(b.goCalls(), ['mod download -json all', 'mod download -json all']);
  // The value is a list of words, as the shell splits $(GO) of a recipe line: the words after the program precede the
  // arguments of Go.
  const wrapped = b.run('check', b.contract, '--go', `${b.go} via`);
  assert.doesNotMatch(wrapped.stderr, /go\.sum|go command/, wrapped.stderr);
  assert.equal(b.goCalls().at(-1), 'via mod download -json all');
  // A value that the shell would read otherwise, and a command of no word, are errors of the command line.
  for (const value of ['"go"', '']) {
    const refused = b.run('check', b.contract, '--go', value);
    assert.equal(refused.status, 2, refused.stderr);
    assert.match(refused.stderr, /binding: --go .*is no list of words: give the value of \$\(GO\), which the shell splits at white space/);
  }
});

test('B2.456: a go.mod that requires no release needs no go, so no go and no --go is no failure and go is not asked for (GN-15l)', (t) => {
  const b = box(t, false);
  const scaffold = b.run('scaffold', '--root', join(b.root, 'plot'));
  assert.equal(scaffold.status, 0, scaffold.stderr);
  assert.match(readFileSync(join(b.root, 'plot/packages/go/go.mod'), 'utf8'), /\nrequire github\.com\/polyspec\/points\/packages\/go v0\.0\.0\n/);
  assert.equal(existsSync(b.goSum), false);
  const checked = b.run('check', b.contract);
  assert.doesNotMatch(`${scaffold.stderr}${checked.stderr}`, /go command|--go|\$\(GO\)|go\.sum|ENOENT/);
  // A command of --go that is no program is not looked for either, and the stand-in is not started.
  const named = b.run('scaffold', '--root', join(b.root, 'plot'), '--go', join(b.root, 'tools/no-go'));
  assert.equal(named.status, 0, named.stderr);
  assert.equal(b.run('scaffold', '--root', join(b.root, 'plot'), '--go', b.go).status, 0);
  assert.deepEqual(b.goCalls(), []);
});

test('B2.456: binding generate takes no --go, because it starts no go', (t) => {
  const b = box(t, false);
  const generated = b.run('generate', '--root', join(b.root, 'plot'), '--go', b.go);
  assert.equal(generated.status, 2, generated.stderr);
  assert.match(generated.stderr, /binding: unknown argument --go\n/);
});

test('B2.456: the one resolution gives the words of the command, or the sentence with the need that its caller states', () => {
  const dir = mkdtempSync(join(tmpdir(), 'binding-go-resolve-'));
  try {
    writeFileSync(join(dir, 'go'), '#!/bin/sh\n', { mode: 0o755 });
    writeFileSync(join(dir, 'plain'), 'no program\n', { mode: 0o644 });
    assert.deepEqual(goCommand(undefined, { PATH: `/nowhere${delimiter}${dir}` }, 'the need'), { command: ['go'] });
    assert.deepEqual(goCommand([join(dir, 'go'), 'via'], { PATH: '' }, 'the need'), { command: [join(dir, 'go'), 'via'] });
    assert.deepEqual(goCommand(undefined, { PATH: '/nowhere' }, 'the need'), { refusal: 'the need, and the go command `go` is not found on PATH: install Go, or name the go command with --go <command>, the value of $(GO) of the release recipes (GN-19h)' });
    assert.deepEqual(goCommand(undefined, {}, 'the need'), { refusal: 'the need, and the go command `go` is not found on PATH: install Go, or name the go command with --go <command>, the value of $(GO) of the release recipes (GN-19h)' });
    // A file that is no program, and a directory, are not the command.
    assert.deepEqual(goCommand(['plain'], { PATH: dir }, 'the need'), { refusal: 'the need, and the go command `plain` of --go is not found on PATH: install Go, or name the go command with --go <command>, the value of $(GO) of the release recipes (GN-19h)' });
    assert.deepEqual(goCommand([dir], { PATH: dir }, 'the need'), { refusal: `the need, and the go command \`${dir}\` of --go is not found: install Go, or name the go command with --go <command>, the value of $(GO) of the release recipes (GN-19h)` });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('B2.456: the release recipes give GO the default go, name it in their head, and pass --go "$(GO)" to binding check and release-go-module (GN-19h)', () => {
  const contract = JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8')) as Contract;
  const { text } = releaseRecipes(contract);
  assert.match(text, /^GO \?= go$/m);
  const head = text.slice(0, text.indexOf('\n\n'));
  assert.match(head, /^# .*\bGO, the go command\b/m);
  assert.match(text, /^\t\$\(BINDING_RUN\) check \$\(CURDIR\)\/packages\/rust\/interface\.json --release --cargo "\$\(CARGO\)" --go "\$\(GO\)"$/m);
  assert.match(text, /^\tref=\$\$\(\$\(BINDING_RUN\) release-go-module --contract \S+ --tag "\$\$TAG" --libraries \$\(abspath \$\(RELEASE_ASSETS\)\)\/go --work "\$\$work" --go "\$\(GO\)"\); \\$/m);
  // No recipe starts the go of PATH itself, and each command of binding that may start go takes --go.
  for (const line of text.split('\n')) {
    if (/^\s*#/.test(line)) continue;
    assert.doesNotMatch(line, /(^|[;&|(]\s*)go\s/, line);
    if (/\$\(BINDING_RUN\) (check|scaffold|release-go-module)\b/.test(line) && !/^\s*echo /.test(line.trim())) assert.match(line, /--go "\$\(GO\)"/, line);
  }
  // A contract without the target go has no recipe of the Go module, and its check still takes the go command.
  const other = releaseRecipes({ ...contract, targets: contract.targets.filter((target) => target !== 'go') });
  assert.doesNotMatch(other.text, /^release-go-module:/m);
  assert.match(other.text, /--release --cargo "\$\(CARGO\)" --go "\$\(GO\)"$/m);
});

test('B2.456: binding release-go-module without go names why it is needed, the tool, --go and $(GO), and makes no commit (GN-19f)', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'binding-go-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixture, join(root, 'repo'), { recursive: true });
  const ran = spawnSync(process.execPath, [cli, 'release-go-module', '--root', join(root, 'repo'), '--tag', 'v0.0.1', '--libraries', join(root, 'libraries'), '--work', join(root, 'work')], { encoding: 'utf8', env: { ...process.env, PATH: pathWithoutGo() } });
  assert.equal(ran.status, 1, ran.stderr);
  assert.match(ran.stderr, /binding: binding release-go-module proves the commit of the Go module with a consumer that Go builds \(`go mod tidy`, `go test`, GN-19f\), and the go command `go` is not found on PATH: install Go, or name the go command with --go <command>, the value of \$\(GO\) of the release recipes \(GN-19h\)\nbinding: no commit and no tag of the Go module was made \(GN-19f\)\n/);
  assert.doesNotMatch(ran.stderr, /ENOENT|\n {4}at /, ran.stderr);
  assert.equal(ran.stdout, '');
  assert.equal(existsSync(join(root, 'work')), false);
});
