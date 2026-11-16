// GN-1d: every call of Cargo by binding runs the cargo command that the repository gives (--cargo, the value of
// $(CARGO)) with the arguments of a build that it gives (--cargo-flags, the value of $(CARGOFLAGS)), and never the cargo
// of PATH. Each case puts on PATH a cargo that fails and records that it ran, and gives --cargo a stand-in of the
// development link of kit (`node link.mjs cargo <checkout>`): a program `link` that takes the words `cargo <checkout>`
// before the arguments of Cargo, records them and answers as Cargo would for a linked checkout.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const e2e = new URL('../../../tests/e2e/', import.meta.url).pathname;
const fixture = new URL('./fixtures/repo/', import.meta.url).pathname;

interface Box {
  root: string;
  // The value of --cargo: the link stand-in with the words that kit's $(CARGO) puts before the arguments of Cargo.
  cargo: string;
  run: (argv: string[]) => { status: number | null; stdout: string; stderr: string };
  // The arguments of each call of the link stand-in, and whether the cargo of PATH ran.
  linked: () => string[][];
  pathCargoRan: () => boolean;
}

// plot, whose core takes points by a Git dependency, so binding reads the contract of points only through cargo
// metadata; the linked checkout of points is a copy under linked/, which only the metadata of the link names.
function box(t: TestContext, link: string): Box {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'binding-cargo-command-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(e2e, 'plot'), join(root, 'plot'), { recursive: true });
  cpSync(join(e2e, 'points'), join(root, 'linked/points'), { recursive: true });
  const manifest = join(root, 'plot/packages/rust/Cargo.toml');
  writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('polyspec-points = { path = "../../../points/packages/rust" }', 'polyspec-points = { git = "https://github.com/polyspec/points.git", branch = "main" }'));
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'bin/cargo'), `#!/bin/sh\ntouch '${join(root, 'path-cargo-ran')}'\necho 'the cargo of PATH ran' >&2\nexit 97\n`, { mode: 0o755 });
  writeFileSync(join(root, 'link'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(join(root, 'linked.jsonl'))}, JSON.stringify(args) + '\\n');
${link}
`, { mode: 0o755 });
  writeFileSync(join(root, 'linked.jsonl'), '');
  return {
    root,
    cargo: `${join(root, 'link')} cargo ${join(root, 'plot')}`,
    run: (argv) => spawnSync(process.execPath, [cli, ...argv], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}` } }),
    linked: () => readFileSync(join(root, 'linked.jsonl'), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as string[]),
    pathCargoRan: () => existsSync(join(root, 'path-cargo-ran')),
  };
}

// The metadata of the link: the crate of points is the manifest of the linked checkout, as the patch of kit gives it.
const metadataLink = (root: string): string => `if (args[2] !== 'metadata') process.exit(98);
process.stdout.write(JSON.stringify({ packages: [{ name: 'polyspec-points', manifest_path: ${JSON.stringify(join(root, 'linked/points/packages/rust/Cargo.toml'))} }] }));`;

test('B2.401: check, scaffold and generate run cargo metadata through the command of --cargo and read the contract of the linked checkout that it names (GN-1d, GN-15f)', (t) => {
  const b = box(t, '');
  writeFileSync(join(b.root, 'link'), readFileSync(join(b.root, 'link'), 'utf8') + metadataLink(b.root), { mode: 0o755 });
  const contract = join(b.root, 'plot/packages/rust/interface.json');
  const scaffold = b.run(['scaffold', '--root', join(b.root, 'plot'), '--cargo', b.cargo]);
  assert.equal(scaffold.status, 0, scaffold.stderr);
  // The go.mod requires the Go module of points, which only the contract of the linked checkout names.
  assert.match(readFileSync(join(b.root, 'plot/packages/go/go.mod'), 'utf8'), /\nrequire github\.com\/polyspec\/points\/packages\/go v0\.0\.0\n/);
  const generated = b.run(['generate', '--root', join(b.root, 'plot'), '--out', join(b.root, 'out'), '--target', 'go', '--cargo', b.cargo]);
  assert.equal(generated.status, 0, generated.stderr);
  const checked = b.run(['check', contract, '--cargo', b.cargo]);
  assert.doesNotMatch(checked.stderr, /GN-15f|cargo of PATH|\n {4}at /, checked.stderr);
  assert.equal(b.pathCargoRan(), false, 'the cargo of PATH ran');
  const calls = b.linked();
  assert.ok(calls.length >= 3, JSON.stringify(calls));
  for (const call of calls) {
    assert.deepEqual(call.slice(0, 5), ['cargo', join(b.root, 'plot'), 'metadata', '--locked', '--offline'], JSON.stringify(call));
  }
});

test('B2.401: binding go-link runs the command of --cargo with --cargo-flags right after rustc, and not the cargo of PATH (GN-1d, GN-15k)', (t) => {
  const b = box(t, `if (args[2] !== 'rustc') process.exit(98);
process.stderr.write('note: native-static-libs: -lSystem -lc -lm\\n');`);
  const ran = b.run(['go-link', '--cargo', b.cargo, '--cargo-flags', '--ignore-rust-version -v', '--manifest', 'Cargo.toml', '--target-dir', 'target', '--features', 'panic-test']);
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(ran.stdout, `-L${join(b.root, 'target/debug')} -lSystem -lc -lm\n`);
  assert.equal(b.pathCargoRan(), false, 'the cargo of PATH ran');
  const [call, ...more] = b.linked();
  assert.deepEqual(more, []);
  assert.deepEqual(call?.slice(0, 6), ['cargo', join(b.root, 'plot'), 'rustc', '--ignore-rust-version', '-v', '--locked']);
  assert.ok(call?.includes('--features') && call.includes('panic-test'), JSON.stringify(call));
  // Without --cargo-flags the repository gives no argument of a build.
  const plain = b.run(['go-link', '--cargo', b.cargo, '--manifest', 'Cargo.toml', '--target-dir', 'target']);
  assert.equal(plain.status, 0, plain.stderr);
  assert.deepEqual(b.linked()[1]?.slice(0, 4), ['cargo', join(b.root, 'plot'), 'rustc', '--locked']);
});

test('B2.401: a command that runs cargo fails with its usage without --cargo, and with a --cargo that holds a quote, a backslash or no word (GN-1d, GN-1c)', (t) => {
  const b = box(t, metadataLink('/nowhere'));
  const contract = join(fixture, 'packages/rust/interface.json');
  const out = join(b.root, 'out');
  const commands: string[][] = [
    ['check', contract],
    ['scaffold', '--root', fixture, '--out', out],
    ['generate', '--root', fixture, '--out', out],
    ['go-link', '--manifest', 'Cargo.toml', '--target-dir', 'target'],
  ];
  for (const argv of commands) {
    const ran = b.run(argv);
    assert.equal(ran.status, 2, `${argv[0] ?? ''}: ${ran.stderr}`);
    assert.match(ran.stderr, new RegExp(`binding: ${argv[0] ?? ''} takes --cargo <command>, the cargo command of the repository \\(GN-1d\\)\\nusage: `), argv[0]);
    for (const value of [`${b.cargo} '--x'`, `${b.cargo} a\\ b`, ' ']) {
      const refused = b.run([...argv, '--cargo', value]);
      assert.equal(refused.status, 2, `${argv[0] ?? ''} --cargo ${value}: ${refused.stderr}`);
      assert.match(refused.stderr, /binding: --cargo .* is no list of words: give the value of \$\(CARGO\), which the shell splits at white space \(GN-1d\)\nusage: /, value);
    }
  }
  assert.equal(b.pathCargoRan(), false, 'the cargo of PATH ran');
  assert.deepEqual(b.linked(), []);
});
