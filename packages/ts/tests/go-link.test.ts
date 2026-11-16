// GN-15k: `binding go-link` builds the static library of the Go crate of a checkout with the print of rustc and writes
// the value of CGO_LDFLAGS for its Go tests. The cases run the command with a stand-in of cargo on PATH, which records
// its arguments and answers as the case states, so no case builds a crate.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { nativeStaticLibs } from '../src/release/go-module.ts';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;

// What rustc 1.99 prints for a static library of session-store on macOS, after a warning of the build.
const DIAGNOSTICS = `   Compiling polyspec-session-store-go v0.0.3 (/repository/packages/go/internal/ffi)
warning: unused variable: \`x\`
note: link against the following native artifacts when linking against this static library. The order and any duplication can be significant on some platforms.

note: native-static-libs: -framework Security -framework CoreFoundation -liconv -lSystem -lc -lm

    Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 1.20s
`;

test('B2.367: the native-static-libs are read from the note of rustc, and a build without the note gives none (GN-15k)', () => {
  assert.equal(nativeStaticLibs(DIAGNOSTICS), '-framework Security -framework CoreFoundation -liconv -lSystem -lc -lm');
  assert.equal(nativeStaticLibs('    Finished `dev` profile\n'), undefined);
  assert.equal(nativeStaticLibs('note: native-static-libs: \n'), undefined);
});

interface Box {
  dir: string;
  run: (argv: string[]) => { status: number | null; stdout: string; stderr: string };
  calls: () => string[][];
}

// A directory with the stand-in cargo: it records its arguments, writes `stderr` to its standard error, a line to its
// standard output, and ends with `status`.
function box(t: TestContext, stderr: string, status = 0): Box {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'binding-go-link-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'cargo'), `#!${process.execPath}
require('fs').appendFileSync(${JSON.stringify(join(dir, 'calls.jsonl'))}, JSON.stringify(process.argv.slice(2)) + '\\n');
process.stdout.write('stdout of cargo\\n');
process.stderr.write(${JSON.stringify(stderr)});
process.exit(${String(status)});
`);
  chmodSync(join(dir, 'cargo'), 0o755);
  writeFileSync(join(dir, 'calls.jsonl'), '');
  return {
    dir,
    run: (argv) => spawnSync(process.execPath, [cli, ...argv], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` } }),
    calls: () => readFileSync(join(dir, 'calls.jsonl'), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as string[]),
  };
}

test('B2.367: binding go-link builds the host library with the print and writes -L<dir>/debug and its libraries on stdout (GN-15k)', (t) => {
  const b = box(t, DIAGNOSTICS);
  const ran = b.run(['go-link', '--manifest', 'packages/go/internal/ffi/Cargo.toml', '--target-dir', 'target', '--features', 'panic-test,codec-test']);
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(ran.stdout, `-L${join(b.dir, 'target/debug')} -framework Security -framework CoreFoundation -liconv -lSystem -lc -lm\n`);
  // Cargo's output, both of its streams, goes to the standard error.
  assert.ok(ran.stderr.includes(DIAGNOSTICS), ran.stderr);
  assert.ok(ran.stderr.includes('stdout of cargo'), ran.stderr);
  assert.deepEqual(b.calls(), [[
    'rustc', '--locked', '--offline', '--color', 'never', '--manifest-path', join(b.dir, 'packages/go/internal/ffi/Cargo.toml'), '--target-dir', join(b.dir, 'target'),
    '--lib', '--crate-type', 'staticlib', '--features', 'panic-test,codec-test', '--', '--print', 'native-static-libs',
  ]]);
  // Without --features, cargo gets none.
  const plain = box(t, DIAGNOSTICS);
  assert.equal(plain.run(['go-link', '--manifest', 'Cargo.toml', '--target-dir', 'target']).status, 0);
  assert.equal(plain.calls()[0]?.includes('--features'), false);
});

test('B2.367: a failed build fails binding go-link with the status of cargo, and a build without the note fails by name (GN-15k)', (t) => {
  const failed = box(t, 'error[E0425]: cannot find value `y`\n', 101);
  const ran = failed.run(['go-link', '--manifest', 'Cargo.toml', '--target-dir', 'target']);
  assert.equal(ran.status, 101);
  assert.equal(ran.stdout, '');
  assert.match(ran.stderr, /error\[E0425\]/);
  const silent = box(t, '    Finished `dev` profile\n');
  const none = silent.run(['go-link', '--manifest', 'Cargo.toml', '--target-dir', 'target']);
  assert.equal(none.status, 1);
  assert.equal(none.stdout, '');
  assert.match(none.stderr, /binding: cargo printed no native-static-libs of the static library of .*Cargo\.toml \(GN-15k\)/);
});

test('B2.367: binding go-link requires --manifest and --target-dir and names its usage (GN-15k, GN-1c)', (t) => {
  const b = box(t, DIAGNOSTICS);
  for (const argv of [['go-link'], ['go-link', '--manifest', 'Cargo.toml'], ['go-link', '--target-dir', 'target'], ['go-link', '--manifest', 'Cargo.toml', '--target-dir', 'target', '--release', 'x']]) {
    const ran = b.run(argv);
    assert.equal(ran.status, 2, argv.join(' '));
    assert.match(ran.stderr, /usage: .*binding go-link --manifest <Cargo\.toml of the Go crate> --target-dir <directory> \[--features <features>\]/);
    assert.equal(ran.stdout, '');
  }
  assert.deepEqual(b.calls(), []);
});

test('B2.367: the end-to-end check gives the Go tests the CGO_LDFLAGS of binding go-link, not the directory alone (GN-15k)', () => {
  const script = readFileSync(new URL('../../../scripts/e2e.mts', import.meta.url), 'utf8');
  assert.match(script, /'go-link', '--manifest'/);
  assert.doesNotMatch(script, /CGO_LDFLAGS: `-L\$\{join\(target, 'debug'\)\}`/);
});
