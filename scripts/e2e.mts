// The end-to-end check of the generator on http-cookies: generate its bindings, build them, install each package and
// run the generated tests (G-5) and the contract cases (V-1) on each language's standard runner.
//
//   node scripts/e2e.mts --repo <http-cookies checkout> --work <directory> --phpunit <phpunit> [--python <python3.14>]
//
// The checkout is only read: its committed tree is copied into the work directory, and the copy gets the changes that
// the repository has not made yet (L-2: one workspace with the binding packages, which bindgen scaffold writes; F-2,
// E-3: the core depends on bindgen_core and its error implements Kinds). Each is printed, because the repository has to
// make it itself.
//
// BINDGEN_E2E_IGNORE_RUST_VERSION=1 lets cargo build crates whose rust-version is newer than the installed toolchain,
// for a machine that cannot install the pinned one; the run says so.

import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i] ?? '', process.argv[i + 1] ?? '');
const repo = args.get('--repo');
const workArg = args.get('--work');
const phpunit = args.get('--phpunit');
const python = args.get('--python') ?? 'python3';
if (repo === undefined || workArg === undefined || phpunit === undefined) {
  process.stderr.write('usage: node scripts/e2e.mts --repo <checkout> --work <directory> --phpunit <phpunit>\n');
  process.exit(2);
}
const work = resolve(workArg);
const bindgen = new URL('..', import.meta.url).pathname;
const copy = join(work, 'repo');
const target = join(work, 'target');
const ignoreRustVersion = process.env['BINDGEN_E2E_IGNORE_RUST_VERSION'] === '1';
const cargoFlags = ignoreRustVersion ? ['--ignore-rust-version'] : [];
if (ignoreRustVersion) process.stdout.write('note: cargo ignores rust-version (BINDGEN_E2E_IGNORE_RUST_VERSION=1)\n');

// The Git dependency on bindgen resolves to the commits of this checkout: Git, which Cargo runs for the fetch, reads the
// URL of the dependency as this directory (url.<base>.insteadOf, set for these commands only).
const gitDependency = {
  CARGO_NET_GIT_FETCH_WITH_CLI: 'true',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: `url.${bindgen}.insteadOf`,
  GIT_CONFIG_VALUE_0: 'https://github.com/polyspec/bindgen.git',
};

function run(command: string, argv: string[], options: ExecFileSyncOptions = {}): void {
  process.stdout.write(`$ ${command} ${argv.join(' ')}\n`);
  execFileSync(command, argv, { stdio: 'inherit', ...options, env: { ...process.env, ...gitDependency, CARGO_TARGET_DIR: target, ...options.env } });
}

function step(name: string): void {
  process.stdout.write(`\n== ${name}\n`);
}

step('copy the committed tree');
rmSync(copy, { recursive: true, force: true });
mkdirSync(copy, { recursive: true });
execFileSync('sh', ['-c', `git -C '${resolve(repo)}' archive HEAD | tar -x -C '${copy}'`]);

step('changes the repository needs (each printed)');
const coreManifest = join(copy, 'packages/rust/Cargo.toml');
let manifest = readFileSync(coreManifest, 'utf8');
const workspaceAt = manifest.indexOf('\n[workspace]');
if (workspaceAt >= 0) {
  const lints = manifest.slice(workspaceAt).replace('[workspace]\n', '');
  manifest = `${manifest.slice(0, workspaceAt)}\n`;
  writeFileSync(join(copy, 'Cargo.toml'), `[workspace]
resolver = "2"
members = ["packages/rust", "packages/python", "packages/ts", "packages/php-ext"]
${lints}`);
  copyFileSync(join(copy, 'packages/rust/Cargo.lock'), join(copy, 'Cargo.lock'));
  rmSync(join(copy, 'packages/rust/Cargo.lock'));
  process.stdout.write('change: one Cargo workspace at the root with the core and the binding packages (L-2)\n');
}
if (!manifest.includes('polyspec-bindgen-core')) {
  manifest = manifest.replace(
    '[dependencies]\n',
    '[dependencies]\npolyspec-bindgen-core = { git = "https://github.com/polyspec/bindgen.git", branch = "v1/rust-core" }\n',
  );
  process.stdout.write('change: the core depends on bindgen_core, a Git dependency before the first release (L-2, F-2)\n');
}
writeFileSync(coreManifest, manifest);
const errorSource = join(copy, 'packages/rust/src/error.rs');
const error = readFileSync(errorSource, 'utf8');
if (!error.includes('bindgen_core::Kinds')) {
  writeFileSync(errorSource, `${error}
/// The kind interface of the bindings (bindgen design F-2, E-3).
impl bindgen_core::Kinds for Error {
    fn kind(&self) -> &'static str {
        Error::kind(self)
    }

    fn status(&self) -> Option<u16> {
        Error::status(self)
    }

    fn errno(&self) -> Option<i32> {
        None
    }
}
`);
  process.stdout.write('change: the core error implements bindgen_core::Kinds (F-2, E-3)\n');
}
run(process.execPath, [join(bindgen, 'packages/ts/src/cli.ts'), 'scaffold', '--root', copy]);
process.stdout.write('change: the tracked binding packages that bindgen scaffold writes (L-2)\n');
run(process.execPath, [join(bindgen, 'packages/ts/src/cli.ts'), 'check', join(copy, 'packages/rust/interface.json')]);

step('the core builds without the generator');
run('cargo', ['test', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', 'polyspec-http-cookies', '--quiet']);

step('generate');
run(process.execPath, [join(bindgen, 'packages/ts/src/cli.ts'), 'generate', '--root', copy]);

step('lint the generated crates');
run('cargo', ['clippy', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '--workspace', '--all-targets', '--features', 'panic-test', '--', '-D', 'warnings']);

const cases = join(copy, 'contracts/cookies.json');
const e2e = join(bindgen, 'tests/e2e/http-cookies');

step('Python: build the wheel, install it, run the generated tests and the cases');
const venv = join(work, 'venv');
run(python, ['-m', 'venv', '--clear', venv]);
run(join(venv, 'bin/pip'), ['install', '-q', 'maturin==1.16.0']);
rmSync(join(work, 'wheels'), { recursive: true, force: true });
run(join(venv, 'bin/maturin'), ['build', '--features', 'panic-test', '--out', join(work, 'wheels'), ...cargoFlags], {
  cwd: join(copy, 'packages/python'),
});
const wheel = readdirSync(join(work, 'wheels')).find((name) => name.endsWith('.whl'));
if (wheel === undefined) throw new Error('maturin wrote no wheel');
run(join(venv, 'bin/pip'), ['install', '-q', '--force-reinstall', join(work, 'wheels', wheel)]);
const generatedPython = join(copy, 'packages/python/generated/tests');
run(join(venv, 'bin/python'), ['-m', 'unittest', 'discover', '-s', generatedPython, '-t', generatedPython], { cwd: work });
run(join(venv, 'bin/python'), ['-m', 'unittest', 'discover', '-s', e2e, '-t', e2e, '-p', 'test_*.py'], { cwd: work, env: { HTTP_COOKIES_CASES: cases } });

step('Node: build the addon, pack and install the package, run the generated tests and the cases');
run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', 'polyspec-http-cookies-node', '--features', 'panic-test']);
const addonName = `http-cookies.${process.platform}-${process.arch}${process.platform === 'linux' ? '-gnu' : ''}.node`;
copyFileSync(join(target, 'debug/libpolyspec_http_cookies_node.so'), join(copy, 'packages/ts/generated', addonName));
const nodeDir = join(work, 'node');
rmSync(nodeDir, { recursive: true, force: true });
mkdirSync(nodeDir, { recursive: true });
run('npm', ['pack', '--pack-destination', nodeDir], { cwd: join(copy, 'packages/ts') });
writeFileSync(join(nodeDir, 'package.json'), '{ "private": true }\n');
const tarball = readdirSync(nodeDir).find((name) => name.endsWith('.tgz'));
if (tarball === undefined) throw new Error('npm pack wrote no package');
run('npm', ['install', '--no-audit', '--no-fund', join(nodeDir, tarball)], { cwd: nodeDir });
copyFileSync(join(copy, 'packages/ts/generated/tests/generated.test.mjs'), join(nodeDir, 'generated.test.mjs'));
copyFileSync(join(e2e, 'cases.test.mjs'), join(nodeDir, 'cases.test.mjs'));
run(process.execPath, ['--test', 'generated.test.mjs', 'cases.test.mjs'], { cwd: nodeDir, env: { HTTP_COOKIES_CASES: cases } });

step('PHP: build the extension, run the generated tests and the cases with it loaded');
run('cargo', ['build', ...cargoFlags, '--manifest-path', join(copy, 'Cargo.toml'), '-p', 'polyspec-http-cookies-php-ext', '--features', 'panic-test']);
const extension = join(target, 'debug/libpolyspec_http_cookies.so');
run('php', ['-l', join(copy, 'packages/php-ext/generated/polyspec_http_cookies.stub.php')]);
run('php', ['-d', `extension=${extension}`, phpunit, join(copy, 'packages/php-ext/generated/tests')]);
run('php', ['-d', `extension=${extension}`, phpunit, join(e2e, 'CasesTest.php')], { env: { HTTP_COOKIES_CASES: cases } });

step('declarations');
run(join(bindgen, 'packages/ts/node_modules/.bin/tsc'), ['--noEmit', '--strict', join(copy, 'packages/ts/generated/index.d.ts')]);
process.stdout.write('\nall steps passed\n');
