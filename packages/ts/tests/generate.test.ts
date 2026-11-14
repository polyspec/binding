// I-5: the same contract and the same binding give the same bytes, in any directory, with no path, time or host of
// the run; and an item that the generator cannot generate is refused by name (G-4).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Lang } from '../src/contract.ts';
import { caseTestTargets, generate as generateTargets, type Inputs } from '../src/generate/index.ts';
import { carriers } from '../src/generate/model.ts';
import { fromJson } from '../src/generate/samples.ts';
import { closure, INTO_CORE, PARTS, usedHelpers, WIDEN } from '../src/generate/text.ts';
import { bindingCoreFinding, trackedPackages } from '../src/generate/packages.ts';
import { parse } from 'smol-toml';

// The contracts of tests/e2e and of the fixture repository name the five targets (BD-27), and the generator refuses
// some of them for each contract by name, which the end-to-end check reports as the failures of those targets
// (GN-14c) and the test of the fixture asserts. A test generates the targets that the generator takes for its contract
// (GN-1b), with each target that the test adds after the five; a test that names its targets, or gives the contract
// other targets, generates those. The fixture repository and tests/e2e/sample are both the library sample; the fixture
// is the one whose first unit is words.
const FIVE = ['php', 'python', 'node', 'go', 'wasm'];
const TAKEN: Record<string, string[]> = {
  fixture: ['php', 'python', 'node', 'go', 'wasm'],
  sample: ['php', 'python', 'node', 'go'],
  shapes: ['php', 'python', 'node', 'go', 'wasm'],
  variants: ['php', 'python', 'node', 'go', 'wasm'],
  consumer: ['php', 'python', 'node', 'go'],
  classes: ['php', 'python', 'node', 'go', 'wasm'],
};
const generate = (inputs: Inputs): ReturnType<typeof generateTargets> => {
  const taken = TAKEN[inputs.contract.library === 'sample' && inputs.contract.units[0]?.id === 'words' ? 'fixture' : inputs.contract.library];
  const declared: string[] = inputs.contract.targets;
  if (inputs.targets !== undefined || taken === undefined || !FIVE.every((t, i) => declared[i] === t)) return generateTargets(inputs);
  return generateTargets({ ...inputs, targets: [...new Set([...taken, ...declared.slice(FIVE.length)])] as Inputs['targets'] & string[] });
};
const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const lock = (core: string): string => `version = 4\n\n[[package]]\nname = "polyspec-binding-core"\nversion = "${core}"\n`;
const fixture = new URL('./fixtures/repo/', import.meta.url).pathname;
// The targets of the fixture that the generator takes, for a generation of the command line (GN-1b).
const FIXTURE_TAKEN = TAKEN['fixture']?.join(',') ?? '';

function files(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.set(relative(dir, path), readFileSync(path));
    }
  };
  walk(dir);
  return out;
}

test('two generations in two directories give the same bytes and name neither directory', () => {
  const first = mkdtempSync(join(tmpdir(), 'binding-a-'));
  const second = mkdtempSync(join(tmpdir(), 'binding-b-'));
  try {
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', first, '--target', FIXTURE_TAKEN]);
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', second, '--target', FIXTURE_TAKEN]);
    const a = files(first);
    const b = files(second);
    assert.ok(a.size > 10, `only ${a.size} files were generated`);
    assert.deepEqual([...a.keys()], [...b.keys()]);
    for (const [path, bytes] of a) {
      assert.ok(bytes.equals(b.get(path) ?? Buffer.alloc(0)), `${path} differs`);
      for (const dir of [first, second, fixture, tmpdir()]) {
        assert.ok(!bytes.includes(dir), `${path} names ${dir}`);
      }
    }
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test('the fixture names the five targets, and the generator refuses a target by name, without the usage line, and writes the others (BD-27, G-4, GN-1b, GN-1c)', () => {
  const declared = (JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8')) as { targets: string[] }).targets;
  assert.deepEqual(declared, FIVE);
  // GN-12: a keyed map with byte string keys is refused for Node and WASM, whose Map compares such a key by identity.
  const root = mkdtempSync(join(tmpdir(), 'binding-v-'));
  const out = mkdtempSync(join(tmpdir(), 'binding-v-'));
  try {
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const path = join(root, 'packages/rust/interface.json');
    const contract = JSON.parse(readFileSync(path, 'utf8'));
    contract.units[0].members[0].returns = { list: { keyed_map: 'text', key: ['bytes', 'text'] } };
    writeFileSync(path, JSON.stringify(contract));
    const refused = /node: not generated \(G-4\), 1 item:\n  split: a keyed_map<T> with byte string keys is not generated for node[^\n]* \(a Map compares a Uint8Array key by identity, GN-12\)/;
    // The target Node alone writes nothing.
    const alone = spawnSync(process.execPath, [cli, 'generate', '--root', root, '--out', out, '--target', 'node'], { encoding: 'utf8' });
    // A refusal is no error of the command line: status 1, and no usage line (GN-1c).
    assert.equal(alone.status, 1, alone.stderr);
    assert.doesNotMatch(alone.stderr, /usage:/);
    assert.match(alone.stderr, refused);
    assert.match(alone.stderr, /no target was generated/);
    assert.equal(files(out).size, 0, 'a refused generation wrote files');
    // Every target: the refused Node and WASM are named, and every other target is written as it is alone.
    const whole = spawnSync(process.execPath, [cli, 'generate', '--root', root, '--out', out], { encoding: 'utf8' });
    assert.equal(whole.status, 1, whole.stderr);
    assert.doesNotMatch(whole.stderr, /usage:/);
    assert.match(whole.stderr, refused);
    assert.match(whole.stderr, /generated: php, python, go/);
    const written = files(out);
    assert.ok(![...written.keys()].some((file) => file.startsWith('packages/ts/')), 'a refused target wrote files');
    const taken = mkdtempSync(join(tmpdir(), 'binding-w-'));
    try {
      execFileSync(process.execPath, [cli, 'generate', '--root', root, '--out', taken, '--target', 'php,python,go']);
      assert.deepEqual(files(taken), written);
    } finally {
      rmSync(taken, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('a generation leaves no file of an earlier one', () => {
  const out = mkdtempSync(join(tmpdir(), 'binding-c-'));
  try {
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', out, '--target', FIXTURE_TAKEN]);
    const stale = join(out, 'packages/python/generated/stale.py');
    execFileSync('touch', [stale]);
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', out, '--target', FIXTURE_TAKEN]);
    assert.ok(!files(out).has('packages/python/generated/stale.py'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('an item that is not generated yet is refused by its name (G-4)', () => {
  const contract = JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8'));
  contract.units[0].members[0].native = { node: { signature: 'split(text: string): string[]' }, reason: 'G-4' };
  const caseFiles = new Map([['contracts/cases.json', JSON.parse(readFileSync(join(fixture, 'contracts/cases.json'), 'utf8'))]]);
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /split: native is not generated yet/);
});

test('a contract that fails the check is not generated', () => {
  const out = mkdtempSync(join(tmpdir(), 'binding-d-'));
  try {
    const root = mkdtempSync(join(tmpdir(), 'binding-e-'));
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const path = join(root, 'packages/rust/interface.json');
    const contract = JSON.parse(readFileSync(path, 'utf8'));
    contract.packages.python.module = 'polyspec_sample';
    execFileSync('sh', ['-c', `cat > ${path}`], { input: JSON.stringify(contract) });
    assert.throws(() => execFileSync(process.execPath, [cli, 'generate', '--root', root, '--out', out], { stdio: 'pipe' }), /CK-18/);
    rmSync(root, { recursive: true, force: true });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('check compares the tracked binding packages with what scaffold writes (L-2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-f-'));
  try {
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const contract = join(root, 'packages/rust/interface.json');
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), /CK-19 is missing/);
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    writeFileSync(join(root, 'Cargo.lock'), lock(version));
    execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' });
    const entry = join(root, 'packages/python/src/lib.rs');
    execFileSync('sh', ['-c', `echo '// edited' >> ${entry}`]);
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), /lib\.rs: CK-19 differs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const load = (): { contract: any; caseFiles: Map<string, unknown> } => ({
  contract: JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8')),
  caseFiles: new Map([['contracts/cases.json', JSON.parse(readFileSync(join(fixture, 'contracts/cases.json'), 'utf8'))]]),
});
const text = (out: Map<string, string | Buffer>, path: string): string => String(out.get(path) ?? '');
// GN-4c: the name of a helper of the generated crate at a path, given as `in_<word>` or `out_<word>`: the crates of
// Python, PHP, Go, Node and WASM name it `<word>_in` and `<word>_out`.
const helperName = (path: string, name: string): string => (/^packages\/(python|php-ext|go|ts)\//.test(path) ? name.replace(/^(in|out)_(.*)$/, '$2_$1') : name);
// The case files of the sample of the end-to-end check (tests/e2e/sample).
const sampleCases = (): Map<string, unknown> =>
  new Map([['contracts/cases.json', JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/contracts/cases.json', import.meta.url), 'utf8'))]]);

test('a record that a function returns has its result form in every language (T-4)', () => {
  const { contract, caseFiles } = load();
  contract.units[0].members[0].returns = { unit: 'options' };
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  assert.match(text(out, 'packages/python/generated/lib.rs'), /fn out_options<'py>/);
  assert.match(text(out, 'packages/python/generated/python/polyspec/sample/_types.py'), /@dataclass\(frozen=True, kw_only=True\)\nclass Options:/);
  assert.match(text(out, 'packages/ts/generated/lib.rs'), /fn out_options<'env>/);
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /fn out_options\(value: impl Borrow<polyspec_sample::Options>\)/);
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /ClassBuilder::new\("Polyspec\\\\Sample\\\\Options"\)\n\s+\.flags\(ClassFlags::Final\)/);
});

test('an integer return widens a narrower Rust integer with From (T-1)', () => {
  const { contract, caseFiles } = load();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    assert.match(text(out, path), new RegExp(`fn ${helperName(path, 'out_uint')}[^\\n]*value: impl WideUint\\)`), path);
    assert.match(text(out, path), /wide_uint!\(u8, u16, u32, u64\);/, path);
  }
});

test('a core with fault injection points has itself as a dev-dependency with fault-test, so cargo test without flags arms them (CK-65, GN-5)', () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-s-'));
  try {
    execFileSync('cp', ['-r', fileURLToPath(new URL('../../../tests/e2e/sample/', import.meta.url)), `${root}/`]);
    const contract = join(root, 'packages/rust/interface.json');
    const manifestPath = join(root, 'packages/rust/Cargo.toml');
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    writeFileSync(join(root, 'Cargo.lock'), lock(version));
    const run = (): ReturnType<typeof spawnSync> => spawnSync(process.execPath, [cli, 'check', contract], { encoding: 'utf8' });
    const passed = run();
    assert.equal(passed.status, 0, String(passed.stderr));
    const manifest = readFileSync(manifestPath, 'utf8');
    const self = /\npolyspec-sample = \{ path = "\.", features = \["fault-test"\] \}\n/;
    assert.match(manifest, self);
    writeFileSync(manifestPath, manifest.replace(self, '\n'));
    const missing = run();
    assert.equal(missing.status, 1, String(missing.stderr));
    assert.match(String(missing.stderr), /packages\/rust\/Cargo\.toml: CK-65 the core polyspec-sample has fault injection points, but its \[dev-dependencies\] name no polyspec-sample = \{ path = "\.", features = \["fault-test"\] \}/);
    writeFileSync(manifestPath, manifest.replace(self, '\npolyspec-sample = { path = "." }\n'));
    assert.match(String(run().stderr), /CK-65 the core polyspec-sample has fault injection points/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a case whose keys are not the parameter names in snake_case is refused by its id (G-5)', () => {
  const { contract, caseFiles } = load();
  const cases = caseFiles.get('contracts/cases.json') as { split: Record<string, unknown>[] };
  const [first] = cases.split;
  if (first !== undefined) {
    first['Text'] = first['text'];
    delete first['text'];
  }
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /the case too_long of split has no text/);
});

test('a closure that only calls a function is the function (clippy redundant_closure)', () => {
  assert.equal(closure(['env', 'item'], 'out_text(env, item)'), 'out_text');
  assert.equal(closure(['item'], 'in_text(item, "x")'), '|item| in_text(item, "x")');
});

test('check runs CK-19 and CK-20 past the findings of the contract and names a check that cannot run', () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-k-'));
  try {
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const contractPath = join(root, 'packages/rust/interface.json');
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    // CK-22: no member names its cases; the repository has no scaffolded package and no Cargo.lock.
    writeFileSync(contractPath, JSON.stringify({ ...contract, cases: [] }));
    const run = spawnSync(process.execPath, [cli, 'check', contractPath], { encoding: 'utf8' });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /CK-22/);
    assert.match(run.stderr, /CK-19 is missing/);
    assert.match(run.stderr, /CK-20 there is no Cargo\.lock/);
    // CK-1: the schema fails, so neither reads the contract.
    writeFileSync(contractPath, JSON.stringify({ ...contract, library: 5 }));
    const broken = spawnSync(process.execPath, [cli, 'check', contractPath], { encoding: 'utf8' });
    assert.equal(broken.status, 1, broken.stderr);
    assert.match(broken.stderr, /CK-1 /);
    assert.match(broken.stderr, /CK-19 and CK-20 did not run: they read the contract, which fails CK-1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check refuses a binding_core of another version or commit than the CLI (CK-20)', () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-g-'));
  try {
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const contract = join(root, 'packages/rust/interface.json');
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), /CK-20 there is no Cargo\.lock/);
    writeFileSync(join(root, 'Cargo.lock'), lock('0.0.0-other'));
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), /CK-20 Cargo\.lock pins polyspec-binding-core 0\.0\.0-other/);
    // A git dependency is compared by its commit with the checkout of this binding.
    const head = execFileSync('git', ['-C', dirname(cli), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const git = (commit: string): string => `${lock(version).trimEnd()}\nsource = "git+https://github.com/polyspec/binding.git?branch=main#${commit}"\n`;
    writeFileSync(join(root, 'Cargo.lock'), git('0'.repeat(40)));
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), new RegExp(`CK-20 Cargo\\.lock pins polyspec-binding-core at the commit ${'0'.repeat(40)}, not ${head}`));
    writeFileSync(join(root, 'Cargo.lock'), git(head));
    const run = spawnSync(process.execPath, [cli, 'check', contract], { encoding: 'utf8' });
    assert.doesNotMatch(run.stderr, /CK-20/, run.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the binding packages of a component core sit beside it (L-1)', () => {
  const { contract, caseFiles } = load();
  contract.core.path = 'packages/server/rust';
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  const dirs = new Set([...out.keys()].map((path) => path.split('/').slice(0, 4).join('/')));
  assert.deepEqual([...dirs].sort(), ['packages/server/go/errors', 'packages/server/go/internal', 'packages/server/go/zz_generated_sample.go', 'packages/server/go/zz_generated_test.go', 'packages/server/php-ext/generated', 'packages/server/python/generated', 'packages/server/ts/generated', 'packages/server/ts/wasm']);
  const root = mkdtempSync(join(tmpdir(), 'binding-h-'));
  try {
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    execFileSync('mkdir', ['-p', join(root, 'packages/server')]);
    execFileSync('mv', [join(root, 'packages/rust'), join(root, 'packages/server/rust')]);
    const path = join(root, 'packages/server/rust/interface.json');
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), core: { ...contract.core } }));
    execFileSync(process.execPath, [cli, 'scaffold', '--contract', path]);
    writeFileSync(join(root, 'Cargo.lock'), lock(version));
    execFileSync(process.execPath, [cli, 'check', path], { stdio: 'pipe' });
    assert.ok(files(root).has('packages/server/ts/build.rs'));
    assert.ok(files(root).has('packages/server/python/Cargo.toml'));
    execFileSync(process.execPath, [cli, 'generate', '--contract', path, '--target', FIXTURE_TAKEN]);
    assert.ok(files(root).has('packages/server/php-ext/generated/lib.rs'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Go: the C ABI, the packages and their tests are generated, and a generation removes old zz_generated files (GN-15)', () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-go-'));
  try {
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const path = join(root, 'packages/rust/interface.json');
    const contract = JSON.parse(readFileSync(path, 'utf8'));
    // T-2: a tuple of two types inside a list is a struct of its parts, and a tuple of one type an array.
    execFileSync(process.execPath, [cli, 'generate', '--root', root]);
    assert.match(String(files(join(root, 'packages/go')).get('zz_generated_sample.go')), /\(\[\]Tuple2\[string, uint64\], error\)/);
    assert.match(String(files(join(root, 'packages/go')).get('zz_generated_sample.go')), /^type Tuple2\[T0, T1 any\] = binding\.Tuple2\[T0, T1\]$/m);
    assert.match(String(files(join(root, 'packages/go')).get('internal/binding/zz_generated_binding.go')), /^type Tuple2\[T0, T1 any\] struct \{\n\tP0 T0\n\tP1 T1\n\}$/m);
    contract.units[0].members[0].returns.list.tuple = ['text', 'text'];
    writeFileSync(path, JSON.stringify(contract));
    execFileSync(process.execPath, [cli, 'generate', '--root', root]);
    assert.match(String(files(join(root, 'packages/go')).get('zz_generated_sample.go')), /\(\[\]\[2\]string, error\)/);
    const stale = join(root, 'packages/go/zz_generated_stale.go');
    writeFileSync(stale, 'package sample\n');
    writeFileSync(join(root, 'packages/go/go.mod'), 'module github.com/polyspec/sample/packages/go\n');
    execFileSync(process.execPath, [cli, 'generate', '--root', root]);
    const out = files(join(root, 'packages/go'));
    assert.ok(!out.has('zz_generated_stale.go'), 'a zz_generated file of an earlier generation stays');
    assert.ok(out.has('go.mod'), 'a file that binding does not own was removed');
    for (const file of ['zz_generated_sample.go', 'zz_generated_test.go', 'errors/zz_generated_errors.go', 'internal/binding/zz_generated_binding.go', 'internal/ffi/generated/lib.rs']) {
      assert.ok(out.has(file), `${file} is missing`);
    }
    assert.match(String(out.get('zz_generated_sample.go')), /^\/\/ Code generated by binding from the interface contract\. DO NOT EDIT\.$/m);
    assert.match(String(out.get('internal/ffi/generated/lib.rs')), /pub unsafe extern "C" fn polyspec_sample_split_words\(/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('check reads cargo metadata of any size for the contracts it depends on (T-3)', async () => {
  const { contract: sample, dependency } = await import('./fixture.ts');
  const root = mkdtempSync(join(tmpdir(), 'binding-i-'));
  try {
    const contract = sample();
    contract.units.find((u: any) => u.id === 'forms').members.find((m: any) => m.id === 'forms.parse').parameters[0].type = { unit: 'dep_reader', library: 'forms-dep' };
    execFileSync('mkdir', ['-p', join(root, 'packages/rust'), join(root, 'dep'), join(root, 'bin')]);
    writeFileSync(join(root, 'packages/rust/interface.json'), JSON.stringify(contract));
    writeFileSync(join(root, 'dep/interface.json'), JSON.stringify(dependency()));
    // K-1: the case files, with a case of the kind that forms.parse raises (CK-22).
    const groups = new Map<string, Record<string, unknown[]>>();
    for (const row of contract.cases) groups.set(row.file, { ...groups.get(row.file), [row.group]: row.member === 'forms.parse' ? [{ id: 'large', raises: { kind: 'too_large' } }] : [] });
    execFileSync('mkdir', ['-p', join(root, 'contracts')]);
    for (const [file, document] of groups) writeFileSync(join(root, file), JSON.stringify(document));
    writeFileSync(join(root, 'packages/rust/Cargo.toml'), '[package]\nname = "polyspec-sample"\nversion = "0.0.1"\n\n[dependencies]\npolyspec-forms-dep = { path = "../../dep" }\n');
    // A cargo that answers metadata with 4 MB of packages before the one the check needs.
    const filler = Array.from({ length: 20000 }, (_, i) => ({ name: `filler-${i}`, manifest_path: `/nowhere/${'x'.repeat(160)}/${i}/Cargo.toml` }));
    const metadata = { packages: [...filler, { name: 'polyspec-forms-dep', manifest_path: join(root, 'dep/Cargo.toml') }] };
    writeFileSync(join(root, 'metadata.json'), JSON.stringify(metadata));
    assert.ok(readFileSync(join(root, 'metadata.json')).length > 2 ** 22);
    writeFileSync(join(root, 'bin/cargo'), `#!/bin/sh\ncat '${join(root, 'metadata.json')}'\n`, { mode: 0o755 });
    const run = spawnSync(process.execPath, [cli, 'check', join(root, 'packages/rust/interface.json')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}` },
    });
    assert.doesNotMatch(run.stderr, /ENOBUFS|interface\.json#/, run.stderr);
    assert.match(run.stderr, /CK-19 is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('WASM: the module, its ES entry and tests are generated, and the npm package exports ./wasm (GN-18)', () => {
  const { contract, caseFiles } = load();
  contract.targets.push('wasm');
  contract.packages.node.entries['.'].conditions = { node: 'napi', browser: 'wasm' };
  for (const row of Object.values(contract.errors.classes) as Record<string, string>[]) row['wasm'] = row['node'] ?? '';
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  assert.match(text(out, 'packages/ts/wasm/generated/lib.rs'), /#\[allow\(clippy::disallowed_methods, reason = "GN-18: the wasm_bindgen expansion"\)\]\nmod exports \{/);
  // GW-5: the import loads the module; there is no init.
  assert.match(text(out, 'packages/ts/wasm/generated/index.mjs'), /^await load\(\{ module_or_path: await source \}\);$/m);
  assert.doesNotMatch(text(out, 'packages/ts/wasm/generated/index.mjs') + text(out, 'packages/ts/wasm/generated/index.d.ts'), /\binit\b/);
  // GW-7: a trap is kind internal and breaks the instance.
  assert.match(text(out, 'packages/ts/wasm/generated/state.mjs'), /if \(!\(error instanceof WebAssembly\.RuntimeError\)\) throw error;/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.mjs'), /return enter\(SampleInternalError, \(\) => glue\./);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /if \(state\.broken\(\)\) assert\.throws\(later, internal\);/);
  const manifest = JSON.parse(String(trackedPackages(contract, '0.0.0').get('packages/ts/package.json')));
  assert.deepEqual(manifest.exports['./wasm'], { types: './wasm/generated/index.d.ts', default: './wasm/generated/index.mjs' });
  assert.deepEqual(Object.keys(manifest.exports['.']), ['browser', 'types', 'import', 'require']);
});

test('Go: map<T> is an ordered Map, and every target generates map<T> (T-2, G-4)', () => {
  const { contract, caseFiles } = load();
  contract.units[0].members[0].returns = { map: { list: 'text' } };
  // Every target generates map<T>; the Go form is checked below.
  assert.match(text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), 'packages/php-ext/generated/lib.rs'), /fn map_out<T>/);
  contract.targets = ['go'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  for (const category of Object.keys(contract.errors.classes)) contract.errors.classes[category] = {};
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /^type Map\[T any\] = binding\.Map\[T\]$/m);
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /\(\*Map\[\[\]string\], error\)/);
  assert.match(text(out, 'packages/go/internal/ffi/generated/lib.rs'), /map_out\(output, result, \|output, item\| list_out\(/);
  assert.match(text(out, 'packages/go/internal/binding/zz_generated_map_test.go'), /func TestT2TheEncodingKeepsTheOrderOfAMap/);
});

test('Go: latin1 is a string of runes up to U+00FF both ways, with a round-trip entry point and its tests (GW-4)', () => {
  const { contract, caseFiles } = load();
  contract.targets = ['go'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  for (const category of Object.keys(contract.errors.classes)) contract.errors.classes[category] = {};
  const member = contract.units[0].members[0];
  member.parameters[0].type = 'latin1';
  member.returns = 'latin1';
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  const rust = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(rust, /fn latin1_in\(input: &mut &\[u8\], subject: &str\)[^]*TextCause::AboveLatin1/);
  assert.match(rust, /fn latin1_out\([^]*char::from\(\*byte\)/);
  assert.match(rust, /#\[cfg\(feature = "codec-test"\)\]\n#\[no_mangle\]\npub unsafe extern "C" fn polyspec_sample__echo_latin1\(/);
  assert.match(text(out, 'packages/go/internal/binding/zz_generated_codec_test.go'), /func TestB8Latin1RoundTrips/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /func TestB8SplitWordsRefusesTextAboveU00FF\(t \*testing\.T\) \{\n\t_, err := SplitWords\("\\u0100"/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /func TestB8SplitWordsRefusesTextThatIsNotUTF8\(t \*testing\.T\) \{\n\t_, err := SplitWords\("\\xff"/);
});

test('Go: a Go value of another type at a number parameter reaches the conversion of its type through codec-test (GN-13g)', () => {
  const { contract } = load();
  contract.targets = ['go'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  for (const category of Object.keys(contract.errors.classes)) contract.errors.classes[category] = {};
  const member = contract.units[0].members[0];
  member.parameters = [{ name: ['code'], type: 'int' }, { name: ['scale'], type: 'float' }];
  member.returns = 'text';
  contract.cases = [];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map() });
  const rust = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(rust, /#\[cfg\(feature = "codec-test"\)\]\n#\[no_mangle\]\npub unsafe extern "C" fn polyspec_sample__number_in\(/);
  // The value of the Go type passes the range of GN-12a, any other is kind invalid_number of its type.
  assert.match(rust, /\(1, 1, Some\(word\)\) => safe_int_in\(&mut &word\[\.\.\], &subject\)\.map\(drop\),/);
  assert.match(rust, /\(3, 3, Some\(_word\)\) => Ok\(\(\)\),/);
  assert.match(rust, /\(1, _, _\) => Err\(invalid\(binding_core::NumberType::Int\)\),/);
  assert.doesNotMatch(rust, /\(0, 1, Some/);
  const codec = text(out, 'packages/go/internal/binding/zz_generated_codec.go');
  assert.match(codec, /^func IntIn\(value any, subject string\) error \{ return numberIn\(1, value, subject\) \}$/m);
  assert.match(codec, /^func FloatIn\(value any, subject string\) error \{ return numberIn\(3, value, subject\) \}$/m);
  assert.doesNotMatch(codec, /func UintIn/);
  const tests = text(out, 'packages/go/internal/binding/zz_generated_codec_test.go');
  assert.match(tests, /func TestB2IntInRefusesAValueOfAnotherType\(t \*testing\.T\) \{/);
  assert.match(tests, /for _, value := range \[\]any\{true, "7", 1\.5, math\.NaN\(\), math\.Inf\(1\), math\.Inf\(-1\), int64\(9007199254740992\), int64\(-9007199254740992\)\}/);
  assert.match(tests, /func TestB2FloatInRefusesAValueOfAnotherType/);
  assert.match(tests, /for _, value := range \[\]any\{1\.5, math\.NaN\(\), math\.Inf\(1\)\}/);
});

test('Go: a tuple parameter is read part by part, a Tuple<N> of different part types or an array of one (T-2, GN-16)', () => {
  const { contract } = load();
  contract.targets = ['go'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  for (const category of Object.keys(contract.errors.classes)) contract.errors.classes[category] = {};
  contract.units[0].members[0].parameters[0].type = { tuple: ['text', 'uint', 'bool'] };
  contract.cases = [];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map() });
  const go = text(out, 'packages/go/zz_generated_sample.go');
  assert.match(go, /^func SplitWords\(text_ Tuple3\[string, uint64, bool\], options Options\)/m);
  assert.match(go, /\tenc\.Text\(text_\.P0\)\n\tenc\.Uint\(text_\.P1\)\n\tenc\.Bool\(text_\.P2\)/);
  const rust = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(rust, /fn tuple3_in<'a, T0, T1, T2>\(/);
  // GN-12a: a uint part is a safe integer, as at every place of the contract.
  assert.match(rust, /tuple3_in\(&mut input, \|input\| text_in\(input, "text"\), \|input\| safe_uint_in\(input, "text"\), bool_in\)\?/);
});

test('keyed_map<T> is an ordered map of mixed key kinds in every language (T-2, GW-8)', () => {
  const { contract, caseFiles } = load();
  contract.units[0].members[0].returns = { keyed_map: 'text', key: ['int', 'text'] };
  const all = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  assert.match(text(all, 'packages/php-ext/generated/lib.rs'), /fn keyed_map_out<T>/);
  assert.match(text(all, 'packages/python/generated/lib.rs'), /fn keyed_map_out<'py, T>/);
  // GN-12: the addon and the WASM module read and build the Map, so the entries hand the value on as it is.
  assert.doesNotMatch(text(all, 'packages/ts/generated/index.cjs'), /fromEntries|toEntries/);
  assert.doesNotMatch(text(all, 'packages/ts/wasm/generated/index.mjs'), /fromEntries|toEntries/);
  assert.match(text(all, 'packages/ts/generated/lib.rs'), /fn entries_out<'env>\(env: &'env Env, entries: Vec<Unknown<'env>>\)/);
  assert.match(text(all, 'packages/ts/wasm/generated/lib.rs'), /let entries = js_sys::Map::new\(\);/);
  assert.match(text(all, 'packages/ts/generated/index.d.ts'), /ReadonlyMap<number \| string, string>/);
  contract.targets = ['go'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  for (const category of Object.keys(contract.errors.classes)) contract.errors.classes[category] = {};
  contract.units[0].members[0].parameters[0].type = { keyed_map: 'text', key: ['int', 'text'] };
  contract.cases = [];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map() });
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /^type KeyedMap\[T any\] = binding\.KeyedMap\[T\]$/m);
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /^func TextKey\(value string\) Key \{ return binding\.TextKey\(value\) \}$/m);
  assert.match(text(out, 'packages/go/internal/ffi/generated/lib.rs'), /keyed_map_in\(&mut input, "text", &\[0, 2\], "a key of int or text"/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /WithABytesKey\(t \*testing\.T\)/);
  // A map value of a test is a local that statements fill, which gofmt keeps as they are written; it breaks a function
  // literal whose body is longer than a line, and no helper of the test file makes a map.
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /\n\t(entries\d+) := &binding\.KeyedMap\[string\]\{\}\n\t\1\.Set\(binding\.BytesKey\(/);
  assert.doesNotMatch(text(out, 'packages/go/zz_generated_test.go'), /\b(?:keyedWith|mapWith)\b/);
  assert.doesNotMatch(text(out, 'packages/go/zz_generated_test.go'), /m := &binding\.KeyedMap/);
  assert.match(text(out, 'packages/go/internal/binding/zz_generated_codec_test.go'), /func TestT2AKeyedMapRoundTripsInItsOrder/);
});

// GN-15h: the Go code of a generation, the files of the Go module without comments, for the uses of a helper.
const goUses = (out: Map<string, string | Buffer>): string =>
  [...out].filter(([path]) => path.startsWith('packages/go/') && path.endsWith('.go')).map(([, t]) => String(t).replace(/\/\/[^\n]*/g, '')).join('\n');
const goContract = (): any => {
  const { contract } = load();
  contract.targets = ['go'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  for (const category of Object.keys(contract.errors.classes)) contract.errors.classes[category] = {};
  contract.cases = [];
  return contract;
};

test('the Go package binding holds no keyed-map helper for a contract without a keyed_map<T> (GN-15h)', () => {
  const out = generate({ contract: goContract(), version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map() });
  const binding = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
  assert.match(binding, /^type Writer struct/m);
  for (const helper of [/^type KeyedMap\[/m, /^type Key struct/m, /^func IntKey\(/m, /^func BytesKey\(/m, /^func TextKey\(/m, /^func \(k Key\) /m, /^func \(m \*KeyedMap\[T\]\) /m, /^func \(w \*Writer\) Key\(/m, /^func \(r \*Reader\) Key\(/m]) {
    assert.doesNotMatch(binding, helper);
  }
  // Each method of the Writer and the Reader is called by the Go code of the generation through a value of its type.
  const uses = goUses(out);
  for (const [, receiver, method] of binding.matchAll(/^func \((w \*Writer|r \*Reader)\) ([A-Z]\w*)\(/gm)) {
    if (method === 'Done' || method === 'Finish') continue;
    const names = receiver?.startsWith('w') === true ? '(?:enc|tenc|w)' : '(?:dec|r|properties)';
    const called = [...uses.matchAll(new RegExp(`\\b${names}\\.${method ?? ''}\\(`, 'g'))].length;
    assert.ok(called > 0, `${receiver ?? ''} ${method ?? ''} is generated and no Go code calls it`);
  }
});

test('a member of a class named as a method of the Writer or the Reader keeps no helper of package binding (GN-15h)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const generated = (name: string[] | undefined): Map<string, string | Buffer> => {
    const contract = read('packages/rust/interface.json');
    const holder = contract.units.find((u: any) => u.id === 'lease').members.find((m: any) => m.id === 'lease.holder');
    if (name !== undefined) holder.name = name;
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['go'] as Inputs['targets'] & string[] });
  };
  const binding = text(generated(undefined), 'packages/go/internal/binding/zz_generated_binding.go');
  const helpers = (source: string): string[] => source.split('\n').filter((l) => /^func \((?:w \*Writer|r \*Reader|k Key|m \*KeyedMap\[T\])\)|^type (?:Key|KeyedMap)\b|^func (?:Int|Bytes|Text)Key\(|^\t"math"$/.test(l));
  for (const [name, method] of [[['key'], 'Key'], [['float'], 'Float'], [['bytes'], 'Bytes']] as const) {
    const out = generated([...name]);
    assert.match(goUses(out), new RegExp(`\\b\\w+\\.${method}\\(`));
    assert.deepEqual(helpers(text(out, 'packages/go/internal/binding/zz_generated_binding.go')), helpers(binding));
  }
  const uses = goUses(generated(undefined));
  for (const [, receiver, method] of binding.matchAll(/^func \((w \*Writer|r \*Reader)\) ([A-Z]\w*)\(/gm)) {
    if (method === 'Done' || method === 'Finish') continue;
    const names = receiver?.startsWith('w') === true ? '(?:enc|tenc|w)' : '(?:dec|r|properties)';
    assert.match(uses, new RegExp(`\\b${names}\\.${method ?? ''}\\(`), `${receiver ?? ''} ${method ?? ''} is generated and no Go code calls it`);
  }
});

test('the Go package binding holds the keyed-map helpers that a keyed_map<T> of the contract uses (GN-15h)', () => {
  const out = (returns: unknown, parameter: unknown): string => {
    const contract = goContract();
    if (returns !== undefined) contract.units[0].members[0].returns = returns;
    if (parameter !== undefined) contract.units[0].members[0].parameters[0].type = parameter;
    return text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map() }), 'packages/go/internal/binding/zz_generated_binding.go');
  };
  const keyed = { keyed_map: 'text', key: ['int', 'text'] };
  const given = out(undefined, keyed);
  for (const helper of [/^type KeyedMap\[T any\] struct/m, /^type Key struct/m, /^func IntKey\(/m, /^func BytesKey\(/m, /^func TextKey\(/m, /^func \(m \*KeyedMap\[T\]\) Set\(/m, /^func \(w \*Writer\) Key\(/m]) {
    assert.match(given, helper);
  }
  const returned = out(keyed, undefined);
  assert.match(returned, /^func \(r \*Reader\) Key\(\) Key \{/m);
  assert.match(returned, /^type KeyedMap\[T any\] struct/m);
});

test('a map<T> and a keyed_map<T> inside another type are a Map in Node and WASM (T-2, GN-12, GN-18)', () => {
  const { contract, caseFiles } = load();
  const member = contract.units[0].members[0];
  const keyed = { keyed_map: 'text', key: ['int', 'text'] };
  const places: [unknown, RegExp, RegExp, string][] = [
    // In a list, an optional and a map, both ways.
    [{ list: keyed }, /list_in\(\w+, "text", \|item\| keyed_map_in\(item, "text", &\[0, 2\]/, /list_out\(env, \w+, \|env, item\| keyed_map_out\(env, item,/, 'readonly (ReadonlyMap<number | string, string>)[]'],
    [{ list: { optional: { map: 'int' } } }, /list_in\(\w+, "text", \|item\| optional_in\(item, \|value\| map_in\(value, "text",/, /list_out\(env, \w+, \|env, item\| optional_out\(env, item\.as_ref\(\), \|env, \w+\| map_out\(env,/, 'readonly (ReadonlyMap<string, number> | null)[]'],
    [{ map: { map: 'text' } }, /map_in\(\w+, "text", \|item\| map_in\(item, "text",/, /map_out\(env, \w+, \|env, item\| map_out\(env, item,/, 'ReadonlyMap<string, ReadonlyMap<string, string>>'],
    [{ map: { optional: keyed } }, /map_in\(\w+, "text", \|item\| optional_in\(item, \|value\| keyed_map_in\(value,/, /map_out\(env, \w+, \|env, item\| optional_out\(env, item\.as_ref\(\), \|env, \w+\| keyed_map_out\(env,/, 'ReadonlyMap<string, ReadonlyMap<number | string, string> | null>'],
  ];
  for (const [type, rustIn, rustOut, declared] of places) {
    member.parameters[0].type = type;
    member.returns = type;
    contract.cases = [];
    const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map(), targets: ['node', 'wasm'] });
    const rust = text(out, 'packages/ts/generated/lib.rs');
    assert.match(rust, rustIn, JSON.stringify(type));
    assert.match(rust, rustOut, JSON.stringify(type));
    // The Map is read where it is judged: a value that is no Map is refused there, at every depth.
    assert.match(rust, /fn map_entries<'env>\(value: Unknown<'env>, subject: &str, expected: &str\)/);
    assert.match(rust, /if !value\.instanceof\(class\)\.map_err\(internal\)\? \{\n        return Err\(type_error\(subject, expected\)\);/);
    const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
    assert.match(wasm, /let map = value\.dyn_ref::<js_sys::Map>\(\)\.ok_or_else\(\|\| type_error\(subject, expected\)\)\?;/);
    for (const file of ['packages/ts/generated/index.d.ts', 'packages/ts/wasm/generated/index.d.ts']) assert.ok(text(out, file).includes(declared), `${file}: ${declared}`);
    for (const file of ['packages/ts/generated/index.cjs', 'packages/ts/wasm/generated/index.mjs']) assert.doesNotMatch(text(out, file), /fromEntries|toEntries/);
  }
  void caseFiles;
});

// A temporary copy of the fixture repository whose contract `change` edits.
function fixtureCopy(change: (contract: any) => void): { root: string; contract: string } {
  const root = mkdtempSync(join(tmpdir(), 'binding-j-'));
  execFileSync('cp', ['-r', `${fixture}.`, root]);
  const contract = join(root, 'packages/rust/interface.json');
  const parsed = JSON.parse(readFileSync(contract, 'utf8'));
  change(parsed);
  writeFileSync(contract, JSON.stringify(parsed));
  return { root, contract };
}

// BD-9: the PHP binding crate links on macOS by a build script of its own, which CK-19 compares, and not by RUSTFLAGS or
// .cargo/config.toml; it has no Rust test target, which the symbols of PHP would not link.
const PHP_BUILD = `// Generated by binding from the interface contract; do not edit. Run make bindings to write it again.
// BD-9: PHP resolves the symbols of an extension when it loads it, so on macOS the linker
// leaves them undefined, for the cdylib of this crate alone. The target OS is the one that
// Cargo gives the build script, not the OS of the host.

const TARGET_OS: &str = "CARGO_CFG_TARGET_OS";

fn main() -> Result<(), String> {
    let os = std::env::var(TARGET_OS).map_err(|error| format!("{TARGET_OS}: {error}"))?;
    if os == "macos" {
        println!("cargo:rustc-cdylib-link-arg=-undefined");
        println!("cargo:rustc-cdylib-link-arg=dynamic_lookup");
    }
    Ok(())
}
`;
test('the PHP binding crate links on macOS by its own build script, which check compares (BD-9, CK-19)', () => {
  const contract = JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8'));
  const out = trackedPackages(contract, '0.0.0');
  assert.equal(out.get('packages/php-ext/build.rs'), PHP_BUILD);
  const manifest = String(out.get('packages/php-ext/Cargo.toml'));
  assert.match(manifest, /\npublish = false\nbuild = "build\.rs"\n/);
  assert.match(manifest, /\ncrate-type = \["cdylib"\]\ntest = false\ndoctest = false\n/);
  // The other binding crates keep their Rust test targets, and no file sets a link argument for every crate.
  for (const path of ['packages/python/Cargo.toml', 'packages/ts/Cargo.toml']) assert.doesNotMatch(String(out.get(path)), /test = false/, path);
  for (const [path, body] of out) if (path !== 'packages/php-ext/build.rs') assert.doesNotMatch(String(body), /dynamic_lookup|rustflags/, path);
  const { root, contract: path } = fixtureCopy(() => {});
  try {
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    writeFileSync(join(root, 'Cargo.lock'), lock(version));
    assert.equal(readFileSync(join(root, 'packages/php-ext/build.rs'), 'utf8'), PHP_BUILD);
    execFileSync(process.execPath, [cli, 'check', path], { stdio: 'pipe' });
    writeFileSync(join(root, 'packages/php-ext/build.rs'), PHP_BUILD.replace('"macos"', '"linux"'));
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', path], { stdio: 'pipe' }), /php-ext\/build\.rs: CK-19 differs/);
    rmSync(join(root, 'packages/php-ext/build.rs'));
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', path], { stdio: 'pipe' }), /php-ext\/build\.rs: CK-19 is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  // L-2a: the extension of a host package has the same build script in native/ of the host library.
  const host = trackedPackages({ ...contract, packages: { ...contract.packages, php: { ...contract.packages.php, host: true } } }, '0.0.0');
  assert.equal(host.get('packages/php/native/build.rs'), PHP_BUILD);
});

test('every scaffolded manifest carries the licence of the core, and a core without one is a finding (GN-3f, CK-71)', () => {
  const contract = JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8'));
  contract.targets = ['php', 'python', 'node', 'go', 'wasm'];
  const out = trackedPackages(contract, '0.0.0', new Map(), [], new Map(), [], 'Apache-2.0');
  for (const crate of ['packages/python/Cargo.toml', 'packages/ts/Cargo.toml', 'packages/ts/wasm/Cargo.toml', 'packages/php-ext/Cargo.toml', 'packages/go/internal/ffi/Cargo.toml']) {
    assert.match(String(out.get(crate)), /\n\[package\]\n(?:[^[]*\n)?license = "Apache-2\.0"\n/, crate);
  }
  assert.match(String(out.get('packages/python/pyproject.toml')), /\n\[project\]\n(?:[^[]*\n)?license = "Apache-2\.0"\n/);
  assert.equal(JSON.parse(String(out.get('packages/ts/package.json'))).license, 'Apache-2.0');
  assert.equal(JSON.parse(String(out.get('packages/php-ext/composer.json'))).license, 'Apache-2.0');
  // No manifest names a licence that the core does not name.
  for (const [path, body] of trackedPackages(contract, '0.0.0')) assert.doesNotMatch(body, /licen[cs]e|MIT/i, path);

  const { root, contract: path } = fixtureCopy(() => {});
  try {
    const manifest = join(root, 'packages/rust/Cargo.toml');
    const named = readFileSync(manifest, 'utf8');
    assert.match(named, /\nlicense = "MIT"\n/);
    const check = (): ReturnType<typeof spawnSync> => spawnSync(process.execPath, [cli, 'check', path], { encoding: 'utf8' });
    // The licence of the core itself.
    writeFileSync(manifest, named.replace('license = "MIT"', 'license = "Apache-2.0"'));
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    assert.equal(JSON.parse(readFileSync(join(root, 'packages/php-ext/composer.json'), 'utf8')).license, 'Apache-2.0');
    assert.match(readFileSync(join(root, 'packages/python/Cargo.toml'), 'utf8'), /\nlicense = "Apache-2\.0"\n/);
    assert.doesNotMatch(String(check().stderr), /CK-71|CK-19/);
    // The licence of the workspace, which the core inherits.
    writeFileSync(manifest, named.replace('license = "MIT"', 'license.workspace = true'));
    writeFileSync(join(root, 'Cargo.toml'), '[workspace]\nmembers = ["packages/rust"]\n\n[workspace.package]\nlicense = "BSD-3-Clause"\n');
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    assert.equal(JSON.parse(readFileSync(join(root, 'packages/ts/package.json'), 'utf8')).license, 'BSD-3-Clause');
    assert.doesNotMatch(String(check().stderr), /CK-71|CK-19/);
    // A core without a licence: scaffold writes no licence, and check names the core manifest.
    writeFileSync(manifest, named.replace('license = "MIT"\n', ''));
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    assert.equal('license' in JSON.parse(readFileSync(join(root, 'packages/ts/package.json'), 'utf8')), false);
    const missing = check();
    assert.equal(missing.status, 1);
    assert.match(String(missing.stderr), /packages\/rust\/Cargo\.toml: CK-71 the core polyspec-sample names no license, which every manifest of its binding packages carries \(GN-3f\)\n/);
    assert.doesNotMatch(String(missing.stderr), /CK-19/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the PHP extension registers under the extension-name of its composer.json (GN-3g)', () => {
  // The fixture, and the points of the end-to-end check, whose library has another name.
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const points = { contract: read('points/packages/rust/interface.json'), caseFiles: new Map([['contracts/cases.json', read('points/contracts/cases.json')]]) };
  for (const [sample, want] of [[load(), 'polyspec_sample'], [points, 'polyspec_points']] as const) {
    const name = JSON.parse(String(trackedPackages(sample.contract, '0.0.0').get('packages/php-ext/composer.json')))['php-ext']['extension-name'];
    assert.equal(name, want);
    const lib = text(generateTargets({ contract: sample.contract, version: '0.0.0', coreLib: name, caseFiles: sample.caseFiles, targets: ['php'] }), 'packages/php-ext/generated/lib.rs');
    // The first call on the builder names the module, before anything is registered.
    assert.ok(lib.includes(`\n    #[php_module]\n    #[php(startup = "startup")]\n    pub fn module(module: ModuleBuilder) -> ModuleBuilder {\n        let module = module\n            .name("${name}")\n`), name);
  }
});

test('the scaffolded manifests name the napi configuration, the module type and the PIE download method of a release (GN-3c, CK-19, kit K1189)', () => {
  const contract = JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8'));
  contract.targets.push('wasm');
  const out = trackedPackages(contract, '0.0.0');
  const npm = JSON.parse(String(out.get('packages/ts/package.json')));
  // The napi CLI names the addon <binaryName>.<platform>.node, the file that the entry loads, and builds the triples.
  assert.deepEqual(npm.napi, { binaryName: 'sample', targets: ['x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu', 'aarch64-apple-darwin'] });
  // The release writes the platform packages into the packed manifest, so a workspace lock can be installed (GN-3c).
  assert.equal(npm.optionalDependencies, undefined);
  // The .js glue of wasm-bindgen --target web is an ES module.
  assert.equal(npm.type, 'module');
  const composer = JSON.parse(String(out.get('packages/php-ext/composer.json')));
  assert.deepEqual(composer['php-ext'], { 'extension-name': 'polyspec_sample', 'download-url-method': ['pre-packaged-binary'] });
  // L-2a: the extension of a host package is the same Composer package, <host package>-native.
  const host = trackedPackages({ ...contract, packages: { ...contract.packages, php: { ...contract.packages.php, host: true } } }, '0.0.0');
  assert.deepEqual(JSON.parse(String(host.get('packages/php/native/composer.json')))['php-ext'], composer['php-ext']);
  // A package of WASM alone holds no addon, so it names no napi configuration; it is still an ES module package.
  const wasmOnly = JSON.parse(String(trackedPackages({ ...contract, targets: contract.targets.filter((t: string) => t !== 'node') }, '0.0.0').get('packages/ts/package.json')));
  assert.equal(wasmOnly.napi, undefined);
  assert.equal(wasmOnly.type, 'module');
  // CK-19: a tracked manifest without these fields differs from what scaffold writes.
  const { root, contract: path } = fixtureCopy(() => {});
  try {
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    writeFileSync(join(root, 'Cargo.lock'), lock(version));
    execFileSync(process.execPath, [cli, 'check', path], { stdio: 'pipe' });
    const npmPath = join(root, 'packages/ts/package.json');
    const written = JSON.parse(readFileSync(npmPath, 'utf8'));
    writeFileSync(npmPath, `${JSON.stringify({ ...written, napi: undefined }, null, 2)}\n`);
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', path], { stdio: 'pipe' }), /ts\/package\.json: CK-19 differs/);
    writeFileSync(npmPath, `${JSON.stringify(written, null, 2)}\n`);
    const composerPath = join(root, 'packages/php-ext/composer.json');
    const ext = JSON.parse(readFileSync(composerPath, 'utf8'));
    writeFileSync(composerPath, `${JSON.stringify({ ...ext, 'php-ext': { 'extension-name': ext['php-ext']['extension-name'] } }, null, 2)}\n`);
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', path], { stdio: 'pipe' }), /php-ext\/composer\.json: CK-19 differs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scaffold writes under --out and not into the repository', () => {
  const { root } = fixtureCopy(() => {});
  const out = mkdtempSync(join(tmpdir(), 'binding-k-'));
  try {
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root, '--out', out]);
    assert.ok(files(out).has('packages/python/Cargo.toml'));
    assert.ok(!files(root).has('packages/python/Cargo.toml'));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('scaffold writes the packages of a contract with a todo unit (CK-2), which check still reports', () => {
  const { root, contract } = fixtureCopy((c) => {
    c.units[0].members[0].wait = 'todo';
  });
  try {
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    assert.ok(files(root).has('packages/python/Cargo.toml'));
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), /CK-2 /);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a host package holds its native module in one form per language (L-2a)', () => {
  const { root, contract } = fixtureCopy((c) => {
    c.packages.python.host = true;
    c.packages.node.host = true;
    c.packages.php.host = true;
  });
  try {
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    const written = files(root);
    // The crate is native/ of the host package; the PHP extension is the package <host>-native there.
    for (const path of ['packages/python/native/Cargo.toml', 'packages/ts/native/build.rs', 'packages/php/native/src/lib.rs', 'packages/php/native/composer.json']) {
      assert.ok(written.has(path), path);
    }
    for (const path of ['packages/python/pyproject.toml', 'packages/ts/package.json', 'packages/python/native/pyproject.toml', 'packages/php-ext/Cargo.toml', 'packages/php/composer.json']) {
      assert.ok(!written.has(path), path);
    }
    assert.equal(JSON.parse(readFileSync(join(root, 'packages/php/native/composer.json'), 'utf8')).name, 'polyspec/sample-native');
    assert.match(readFileSync(join(root, 'packages/php/native/Cargo.toml'), 'utf8'), /path = "\.\.\/\.\.\/rust"/);
    assert.match(readFileSync(join(root, 'packages/python/native/Cargo.toml'), 'utf8'), /path = "\.\.\/\.\.\/rust"/);
    // The WASM crate is native/wasm/ of the host Node package, one directory deeper than native/.
    assert.match(readFileSync(join(root, 'packages/ts/native/wasm/Cargo.toml'), 'utf8'), /polyspec-sample = \{ path = "\.\.\/\.\.\/\.\.\/rust"/);
    assert.match(readFileSync(join(root, 'packages/python/native/src/lib.rs'), 'utf8'), /The native module polyspec\.sample\._binding\._native\./);
    writeFileSync(join(root, 'Cargo.lock'), lock(version));
    const missing = spawnSync(process.execPath, [cli, 'check', contract], { encoding: 'utf8' });
    assert.match(missing.stderr, /python\/pyproject\.toml: CK-19 build-system\.build-backend is missing/);
    assert.match(missing.stderr, /php\/composer\.json: CK-19 require\.ext-polyspec_sample is missing/);
    // GN-3f: the host's manifest names the licence of the core.
    assert.match(missing.stderr, /python\/pyproject\.toml: CK-19 project\.license is missing, not "MIT"/);
    assert.match(missing.stderr, /ts\/package\.json: CK-19 license is missing, not "MIT"/);
    assert.match(missing.stderr, /php\/composer\.json: CK-19 license is missing, not "MIT"/);
    // GN-3c: the release writes the platform packages into the packed manifest; the source manifest does not name them.
    assert.doesNotMatch(missing.stderr, /optionalDependencies/);
    // GN-3b: the host package is the package of a release, so it names the fields of GN-3c that a release reads.
    assert.match(missing.stderr, /ts\/package\.json: CK-19 type is missing, not "module"/);
    assert.match(missing.stderr, /ts\/package\.json: CK-19 napi\.binaryName is missing, not "sample"/);
    assert.match(missing.stderr, /ts\/package\.json: CK-19 napi\.targets is missing, not \["x86_64-unknown-linux-gnu","aarch64-unknown-linux-gnu","aarch64-apple-darwin"\]/);
    const pyproject = (module: string): string =>
      `[build-system]\nbuild-backend = "maturin"\n\n[project]\nlicense = "MIT"\n\n[tool.maturin]\nmanifest-path = "native/Cargo.toml"\npython-source = "src"\nmodule-name = "${module}"\n`;
    writeFileSync(join(root, 'packages/python/pyproject.toml'), pyproject('polyspec.sample._native'));
    // GN-3b: the host names its files and the fields of a release; the release writes the platform packages (GN-3c).
    const hostNpm = (targets: string[]): string => JSON.stringify({
      name: '@polyspec/sample',
      version: '1.2.3',
      license: 'Apache-2.0',
      type: 'module',
      files: ['dist', 'native/generated/index.cjs', 'native/generated/index.mjs', 'native/generated/index.d.ts', 'native/wasm/generated/*.mjs', 'native/wasm/generated/*.js', 'native/wasm/generated/*.d.ts', 'native/wasm/generated/*.wasm'],
      napi: { binaryName: 'sample', targets },
    });
    writeFileSync(join(root, 'packages/ts/package.json'), hostNpm(['x86_64-unknown-linux-gnu', 'aarch64-apple-darwin']));
    writeFileSync(join(root, 'packages/php/composer.json'), JSON.stringify({ name: 'polyspec/sample-host', license: 'MIT', require: { 'ext-polyspec_sample': '*' } }));
    const wrongModule = spawnSync(process.execPath, [cli, 'check', contract], { encoding: 'utf8' });
    assert.match(wrongModule.stderr, /ts\/package\.json: CK-19 license is "Apache-2\.0", not "MIT"/);
    assert.doesNotMatch(wrongModule.stderr, /(pyproject\.toml|composer\.json): CK-19 (project\.)?license/);
    assert.match(wrongModule.stderr, /CK-19 tool\.maturin\.module-name is "polyspec\.sample\._native", not "polyspec\.sample\._binding\._native"/);
    assert.match(wrongModule.stderr, /ts\/package\.json: CK-19 napi\.targets is \["x86_64-unknown-linux-gnu","aarch64-apple-darwin"\], not \[/);
    writeFileSync(join(root, 'packages/ts/package.json'), hostNpm(['x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu', 'aarch64-apple-darwin']).replace('Apache-2.0', 'MIT'));
    // The extension of a host PHP package is written by scaffold, so check compares it whole (GN-3b, GN-3c).
    const nativeComposer = join(root, 'packages/php/native/composer.json');
    const scaffolded = readFileSync(nativeComposer, 'utf8');
    const ext = JSON.parse(scaffolded);
    writeFileSync(nativeComposer, `${JSON.stringify({ ...ext, 'php-ext': { 'extension-name': ext['php-ext']['extension-name'] } }, null, 2)}\n`);
    assert.match(spawnSync(process.execPath, [cli, 'check', contract], { encoding: 'utf8' }).stderr, /php\/native\/composer\.json: CK-19 differs/);
    writeFileSync(nativeComposer, scaffolded);
    writeFileSync(join(root, 'packages/python/pyproject.toml'), pyproject('polyspec.sample._binding._native'));
    execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' });
    const out = mkdtempSync(join(tmpdir(), 'binding-l-'));
    // L-2a: the WASM binding of a host Node package is not refused for its layout; it is native/wasm/generated/.
    const wasm = spawnSync(process.execPath, [cli, 'generate', '--root', root, '--out', out, '--target', 'wasm'], { encoding: 'utf8' });
    assert.equal(wasm.status, 0, wasm.stderr);
    assert.ok(files(out).has('packages/ts/native/wasm/generated/index.mjs'));
    assert.match(String(files(out).get('packages/ts/native/wasm/generated/tests/generated.test.mjs')), /import \* as pkg from '\.\.\/index\.mjs';/);
    execFileSync(process.execPath, [cli, 'generate', '--root', root, '--out', out, '--target', 'php,python,node']);
    const generated = files(out);
    assert.ok(generated.has('packages/python/native/generated/lib.rs'));
    assert.ok(generated.has('packages/python/src/polyspec/sample/_binding/__init__.py'));
    assert.ok(generated.has('packages/ts/native/generated/index.cjs'));
    // The tests of a host package import the generated entry beside them; the package's own entry is the host's.
    assert.match(String(generated.get('packages/ts/native/generated/tests/generated.test.mjs')), /import \* as pkg from '\.\.\/index\.mjs';/);
    assert.ok(generated.has('packages/php/native/generated/lib.rs'));
    assert.match(String(generated.get('packages/python/native/generated/lib.rs')), /polyspec\.sample\._binding\._errors/);
    rmSync(out, { recursive: true, force: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a binding crate builds the core with the features of its target only (I-1)', () => {
  const { root } = fixtureCopy((c) => {
    c.core.features = { node: ['io', 'redis'] };
  });
  try {
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    assert.match(readFileSync(join(root, 'packages/ts/Cargo.toml'), 'utf8'), /polyspec-sample = \{ path = "\.\.\/rust", default-features = false, features = \["io", "redis"\] \}/);
    assert.match(readFileSync(join(root, 'packages/python/Cargo.toml'), 'utf8'), /polyspec-sample = \{ path = "\.\.\/rust" \}/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a binding crate turns on fault-test of the core of another library whose point a case arms (G-5)', () => {
  const { root } = fixtureCopy(() => {});
  try {
    const manifest = join(root, 'packages/rust/Cargo.toml');
    writeFileSync(manifest, `${readFileSync(manifest, 'utf8')}\n[dependencies]\npolyspec-forms-dep = { path = "../../dep" }\n`);
    const casesPath = join(root, 'contracts/cases.json');
    const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
    cases.split[0].faults = [{ point: 'forms_dep.internal', kind: 'internal' }];
    writeFileSync(casesPath, JSON.stringify(cases));
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    const python = readFileSync(join(root, 'packages/python/Cargo.toml'), 'utf8');
    assert.match(python, /\nfault-test = \["polyspec-forms-dep\/fault-test"\]\n/);
    assert.match(python, /\npolyspec-forms-dep = \{ path = "\.\.\/\.\.\/dep" \}/);
    // A point of a library that the core does not depend on is named.
    cases.split[0].faults = [{ point: 'other_lib.internal', kind: 'internal' }];
    writeFileSync(casesPath, JSON.stringify(cases));
    const refused = spawnSync(process.execPath, [cli, 'scaffold', '--root', root], { encoding: 'utf8' });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /a case arms a fault injection point of other_lib/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scaffold rewrites its packages after the core crate was renamed, without asking Cargo', () => {
  const { root } = fixtureCopy((c) => {
    // A type of another repository, for which check and generate ask Cargo for that repository's contract.
    c.units[0].members[0].parameters[0].type = { unit: 'dep_part', library: 'forms-dep' };
  });
  try {
    const manifest = join(root, 'packages/rust/Cargo.toml');
    writeFileSync(manifest, `${readFileSync(manifest, 'utf8')}\n[dependencies]\npolyspec-forms-dep = { path = "../../dep" }\n`);
    // GN-15f: scaffold reads the contract of a path dependency from that path, without Cargo, for go.mod.
    execFileSync('mkdir', ['-p', join(root, 'dep')]);
    writeFileSync(join(root, 'dep/interface.json'), JSON.stringify({ library: 'forms-dep', units: [{ id: 'dep_part', kind: 'enum' }] }));
    execFileSync('mkdir', ['-p', join(root, 'bin')]);
    // A cargo that fails as it does when a binding manifest names a crate that no longer exists.
    writeFileSync(join(root, 'bin/cargo'), '#!/bin/sh\necho "error: no matching package named polyspec-sample" >&2\nexit 101\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}` };
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root], { env });
    // The core is renamed; the binding manifests of the first scaffold still name the old crate.
    const contractPath = join(root, 'packages/rust/interface.json');
    const renamed = JSON.parse(readFileSync(contractPath, 'utf8'));
    renamed.library = 'sample-next';
    renamed.core.crate = 'polyspec-sample-next';
    renamed.packages.php = { package: 'polyspec/sample-next', namespace: 'Polyspec\\SampleNext' };
    renamed.packages.python = { package: 'polyspec-sample-next', module: 'polyspec.sample_next' };
    renamed.packages.node = { ...renamed.packages.node, package: '@polyspec/sample-next' };
    for (const row of Object.values(renamed.errors.classes) as Record<string, string>[]) {
      for (const lang of Object.keys(row)) row[lang] = (row[lang] ?? '').replace('Polyspec\\Sample\\Sample', 'Polyspec\\SampleNext\\SampleNext').replace(/^Sample/, 'SampleNext');
    }
    writeFileSync(contractPath, JSON.stringify(renamed));
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('name = "polyspec-sample"', 'name = "polyspec-sample-next"'));
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root], { env });
    assert.match(readFileSync(join(root, 'packages/python/Cargo.toml'), 'utf8'), /polyspec-sample-next = \{ path = "\.\.\/rust" \}/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a case writes bytes as hex and a float that JSON cannot write by its name (G-5)', () => {
  const ctx = (lang: 'python' | 'node' | 'php'): any => ({ lang, enumRef: () => '', recordNew: () => '', callbackNew: () => '' });
  const model = {} as any;
  assert.equal(fromJson(model, ctx('python'), 'bytes', { hex: '00ff' }), 'bytes.fromhex("00ff")');
  assert.equal(fromJson(model, ctx('node'), 'bytes', { hex: '00ff' }), "new Uint8Array(Buffer.from('00ff', 'hex'))");
  assert.equal(fromJson(model, ctx('php'), 'bytes', { hex: '00ff' }), 'hex2bin("00ff")');
  assert.equal(fromJson(model, ctx('python'), 'float', { float: '-inf' }), 'float("-inf")');
  // A text that is not well formed: an unpaired surrogate where a text is code points or UTF-16, 0xFF where it is bytes.
  assert.equal(fromJson(model, ctx('python'), 'text', { ill_formed: 'a' }), '"a" + "\\ud800"');
  assert.equal(fromJson(model, ctx('node'), 'text', { ill_formed: 'a' }), "'a' + '\\uD800'");
  assert.equal(fromJson(model, ctx('php'), 'text', { ill_formed: 'a' }), '"a" . "\\xFF"');
  assert.throws(() => fromJson(model, ctx('php'), 'text', { ill_formed: 1 }), /\{"ill_formed": "<text>"\}/);
  // A value nested deeper than a JSON reader takes is a list repeated around its innermost value, made in a loop.
  const alias = { id: 'data', kind: 'alias' };
  const valued = { contract: { units: [alias] }, foreign: new Map(), aliases: [{ unit: alias, library: undefined }] } as any;
  const deep = { kind: 'list', repeat: 3, value: { kind: 'null' } };
  assert.equal(fromJson(valued, ctx('python'), { unit: 'data' }, deep), '__import__("functools").reduce(lambda inner, _: [inner], range(3), None)');
  assert.equal(fromJson(valued, ctx('node'), { unit: 'data' }, deep), 'Array.from({ length: 3 }).reduce((inner) => [inner], null)');
  assert.equal(fromJson(valued, ctx('php'), { unit: 'data' }, deep), 'array_reduce(array_fill(0, 3, null), fn ($inner) => [$inner], null)');
  assert.deepEqual(new Function(`return ${fromJson(valued, ctx('node'), { unit: 'data' }, deep)}`)(), [[[null]]]);
  assert.throws(() => fromJson(valued, ctx('node'), { unit: 'data' }, { ...deep, repeat: 0 }), /"repeat": <n of at least 1>/);

  assert.equal(fromJson(model, ctx('node'), 'float', { float: 'nan' }), 'NaN');
  assert.equal(fromJson(model, ctx('php'), 'float', 1.5), '1.5');
  assert.throws(() => fromJson(model, ctx('php'), 'bytes', 'abc'), /is \{"hex"/);
  assert.throws(() => fromJson(model, ctx('php'), 'float', { float: 'huge' }), /"nan" \| "inf" \| "-inf"/);
});

test('a value alias converts through its core functions in every language (U-7)', () => {
  // The sample has the value alias data, which its core judges and gives (tests/e2e/sample).
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  for (const [path, host] of [['packages/python/generated/lib.rs', 'PyHost'], ['packages/ts/generated/lib.rs', 'JsHost'], ['packages/php-ext/generated/lib.rs', 'PhpHost']] as const) {
    const lib = text(out, path);
    assert.match(lib, /polyspec_sample::data_from_host\(&mut host, described\)/, path);
    assert.match(lib, /let \(root, mut source\) = polyspec_sample::data_to_out\(value\.borrow\(\)\);/, path);
    assert.match(lib, new RegExp(`impl HostValues for ${host}`), path);
  }
});

test('an out row of a value alias makes a keyed map of the keys it lists in every language (U-7, T-2, GN-6e)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const row = sample.units.find((u: any) => u.id === 'data').out.find((r: any) => r.kind === 'map' && r.when.is === false);
  for (const lang of ['php', 'python', 'node', 'wasm']) row.make[lang] = { keyed_map: { key: lang === 'php' ? ['int', 'bytes'] : ['int', 'text', 'bytes'] } };
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['php', 'python', 'node', 'wasm'] });
  // The entries are made as those of a map: each key and each item through the rows of the alias.
  for (const path of ['packages/php-ext/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    assert.match(text(out, path), /OutValue::Map\(value\) => if out\.predicate\(Predicate::SequenceKeys\) == Some\(false\) \{ \{\n +let handle = value\.handle\(\);/, path);
  }
});

test('an out row of a value alias makes an instance by a factory of a class of the contract (U-7, T-5, GN-6e, GN-15c)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const row = sample.units.find((u: any) => u.id === 'data').out.find((r: any) => r.kind === 'text');
  for (const lang of ['php', 'python', 'node', 'wasm']) row.make[lang] = 'tag.new';
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['php', 'python', 'node', 'wasm'] });
  // The content of the kind is the one argument of the factory's core path, whose value leaves as an instance.
  for (const [path, made] of [
    ['packages/php-ext/generated/lib.rs', 'out_tag(polyspec_sample::Tag::new(&value))'],
    ['packages/python/generated/lib.rs', 'out_tag(py, polyspec_sample::Tag::new(&value))'],
    // GN-6as: the instance is a value without children, which the walk of Node puts next.
    ['packages/ts/generated/lib.rs', 'out_tag(env, polyspec_sample::Tag::new(&value)).map(OutStep::Put)'],
    ['packages/ts/wasm/generated/lib.rs', 'out_tag(polyspec_sample::Tag::new(&value)).map(OutStep::Put)'],
  ] as const) {
    assert.ok(text(out, path).includes(`    OutValue::Text(value) => ${made},\n`), path);
    assert.match(text(out, path), /\nfn out_tag\(/, path);
  }
  // GN-15c: Go gives the number of the class and the handle, and the package of the class makes the instance.
  row.make.go = 'tag.new';
  const go = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['go'] });
  const ffi = text(go, 'packages/go/internal/ffi/generated/lib.rs');
  assert.ok(ffi.includes('        OutValue::Text(value) => alias_out_tag(output, polyspec_sample::Tag::new(&value)),'), ffi);
  assert.match(ffi, /\nfn alias_out_tag\(output: &mut Vec<u8>, value: polyspec_sample::Tag\) \{\n {4}output\.push\(10\);\n {4}uint_out\(output, 0u64\);\n {4}out_tag\(output, value\);\n\}/);
  const pkg = text(go, 'packages/go/zz_generated_sample.go');
  assert.match(pkg, /= dec\.ValueWith\(aliasInstance\)/);
  assert.match(pkg, /\nfunc aliasInstance\(class uint64, handle uint64\) any \{\n\tswitch class \{\n\tcase 0:\n\t\treturn newTag\(handle\)\n\t\}\n\treturn nil\n\}\n/);
  assert.match(text(go, 'packages/go/internal/binding/zz_generated_binding.go'), /\n\tcase 10:\n\t\tclass, handle := r\.Uint\(\), r\.Uint\(\)\n/);
  // Only the package of the class makes its instance, so a member of another module that gives the value is refused.
  const moved = structuredClone(sample);
  moved.units.find((u: any) => u.id === 'tag').module = 'tags';
  const owner = moved.units.find((u: any) => u.id === 'sample');
  owner.members = owner.members.filter((m: any) => !JSON.stringify(m).includes('"unit":"tag"'));
  moved.cases = [];
  assert.throws(() => generate({ contract: moved, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['go'] }), /tag: a class whose instance an out row of the alias data makes of the module tags in the module \(the root\) is not generated for Go yet/);
  row.make.go = 'text';
  // A factory whose parameter is not the content of the kind, or that fails, is refused by name.
  row.kind = 'bool';
  row.make = { php: 'bool', python: 'bool', node: 'tag.new', go: 'bool', wasm: 'bool' };
  const bools = sample.units.find((u: any) => u.id === 'data').out.filter((r: any) => r.kind === 'bool');
  sample.units.find((u: any) => u.id === 'data').out = sample.units.find((u: any) => u.id === 'data').out.filter((r: any) => r === row || !bools.includes(r));
  assert.throws(() => generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['node'] }), /data: the node make tag\.new of the kind bool takes text, not the content of the kind/);
});

test('a language object that a core may keep enters as a Native, which each target holds and releases by its rule (GN-6u)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const sample = read('sample/packages/rust/interface.json');
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['php', 'python', 'node', 'go', 'wasm'] });
  // Python holds the reference, which PyO3 releases at the drop or at its next acquisition of the GIL.
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /#\[cfg\(pyo3_disable_reference_pool\)\]\ncompile_error!\(/);
  assert.match(python, /struct PyNative \{\n(?: {4}\/\/[^\n]*\n)* {4}_held: Py<PyAny>,\n\}/);
  assert.match(python, /impl NativeObject for PyNative \{\}/);
  assert.match(python, /return Ok\(HostValue::Callable\(Native::new\(PyNative \{ _held: value\.clone\(\)\.unbind\(\) \}\)\)\);/);
  assert.match(python, /Ok\(HostValue::Object \{ native: Native::new\(PyNative \{ _held: value\.clone\(\)\.unbind\(\) \}\), type_name, json_serializable: false \}\)/);
  // A value outside the closed set is valid for the call alone.
  assert.match(python, /HostValue::Other \{ type_name, handle: self\.mark\(\) \}/);
  assert.match(python, /OutValue::Native\(native\) => match native\.downcast::<PyNative>\(\) \{\n\s+Some\(object\) => Ok\(object\._held\.clone_ref\(py\)\.into_bound\(py\)\),/);
  // WASM holds the key of the table of its one thread; the drop removes it.
  const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /struct WasmNative \{\n    key: u64,\n\}/);
  assert.match(wasm, /impl Drop for WasmNative \{\n    fn drop\(&mut self\) \{\n        let released = NATIVE\.try_with\(/);
  assert.match(wasm, /return Ok\(HostValue::Date\(self\.mark\(\)\)\);/);
  assert.match(wasm, /OutValue::Native\(native\) => native_object\(&native\)\.map\(OutStep::Put\),/);
  // Node and PHP hold the owner, its generation and the key; a drop queues the key for the owner, which releases it on
  // its own thread at the start of every entry point, and a drop of an older generation touches nothing.
  for (const [path, reference] of [['packages/ts/generated/lib.rs', 'napi::UnknownRef<false>'], ['packages/php-ext/generated/lib.rs', 'Zval']] as const) {
    const lib = text(out, path);
    assert.match(lib, /struct OwnedNative \{\n    owner: usize,\n    generation: u64,\n    key: u64,\n\}/, path);
    assert.match(lib, new RegExp(`values: BTreeMap<u64, ${reference.replace(/[<>]/g, (c) => `\\${c}`)}>,`), path);
    assert.match(lib, /impl Drop for OwnedNative \{\n    fn drop\(&mut self\) \{\n        let Ok\(mut owners\) = OWNERS\.lock\(\) else \{\n            return;\n        \};\n        match owners\.get_mut\(self\.owner\) \{\n            Some\(owner\) if owner\.generation == self\.generation => (?:owner\.released\.push\(self\.key\),|\{\n\s+owner\.released\.push\(self\.key\);\n\s+wake\(owner\);\n\s+\})\n            _other => return,\n        \}\n        drop\(owners\);\n        release_queue\(\);/, path);
    assert.match(lib, /fn guard<T>\(body: impl FnOnce\(\) -> Result<T, Fail>\) -> Result<T, Fail> \{\n    release_queue\(\);/, path);
    assert.match(lib, /owner\.generation = owner\.generation\.saturating_add\(1\);/, path);
    assert.match(lib, /OutValue::Native\(native\) => native_object\(/, path);
    assert.doesNotMatch(lib, /static RELEASED|RELEASED\.get/, path);
  }
  assert.match(text(out, 'packages/ts/generated/lib.rs'), /env\.add_env_cleanup_hook\(\(\), \|\(\)\| clean_up_native\(\)\)/);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /let module = module\.request_shutdown_function\(release_native\);/);
  assert.match(php, /extern "C" fn release_native\(_kind: i32, _module: i32\) -> i32 \{\n    clean_up_native\(\);\n    0\n\}/);
  // Go holds the cgo.Handle, which the drop deletes on any thread.
  const go = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(go, /\[9\] => HostValue::Callable\(go_native\(uint_in\(input\)\?\)\),/);
  assert.match(go, /fn go_native\(handle: u64\) -> Native \{\n    NATIVE_COUNT\.fetch_add\(1, Ordering::SeqCst\);\n    Native::new\(GoNative \{ handle \}\)/);
  assert.match(go, /impl Drop for GoNative \{\n    fn drop\(&mut self\) \{\n        \/\/ SAFETY: [^\n]*\n        unsafe \{ polyspec_sample__go_release\(self\.handle\) \};/);
  assert.match(go, /OutValue::Native\(native\) => match native\.downcast::<GoNative>\(\) \{\n\s+Some\(object\) => \{\n\s+output\.push\(13\);/);
  const goBinding = [...out].filter(([path]) => path.startsWith('packages/go/') && path.endsWith('.go')).map(([, bytes]) => String(bytes)).join('\n');
  assert.match(goBinding, /case reflect\.Func:\n\t\tenc\.bytes = append\(enc\.bytes, 9\)\n\t\tenc\.Uint\(uint64\(cgo\.NewHandle\(value\.Interface\(\)\)\)\)/);
  assert.match(goBinding, /\/\/export polyspec_sample__go_release\nfunc polyspec_sample__go_release\(handle C\.uint64_t\) \{\n\tcgo\.Handle\(uintptr\(handle\)\)\.Delete\(\)\n\}/);
  assert.match(goBinding, /func polyspec_sample__go_native\(handle C\.uint64_t\) C\.uint64_t \{\n\treturn C\.uint64_t\(cgo\.NewHandle\(cgo\.Handle\(uintptr\(handle\)\)\.Value\(\)\)\)\n\}/);
  // The bytes of an out outlive the Native, so they give a new cgo.Handle of the func, which Go deletes before it decodes.
  assert.match(goBinding, /case 13:\n\t\tindex := r\.Uint\(\)\n(?:[^\n]*\n){4}\t\treturn r\.funcs\[index\]/);
  for (const [path, lib] of [['python', python], ['wasm', wasm], ['php', php], ['go', go]] as const) assert.doesNotMatch(lib, /fn native_handle\(/, path);
});

test('a drop on another thread wakes the Node owner through its unref threadsafe function, which the cleanup aborts under the lock of the owners (GN-6u)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['php', 'node'] });
  const node = text(out, 'packages/ts/generated/lib.rs');
  // The owner makes the function with its table, without a JavaScript function, and unrefs it.
  assert.match(node, /napi::sys::napi_create_threadsafe_function\(\n\s+env\.raw\(\),\n\s+std::ptr::null_mut\(\),/);
  assert.match(node, /napi::sys::napi_unref_threadsafe_function\(env\.raw\(\), waker\)/);
  assert.match(node, /extern "C" fn release_on_owner\(/);
  // A drop of the same generation queues its key and wakes the owner, under the lock of the owners.
  assert.match(node, /Some\(owner\) if owner\.generation == self\.generation => \{\n\s+owner\.released\.push\(self\.key\);\n\s+wake\(owner\);\n\s+\}/);
  // The cleanup raises the generation and aborts the function under the same lock.
  assert.match(node, /owner\.generation = owner\.generation\.saturating_add\(1\);\n\s+owner\.released\.clear\(\);\n\s+abort_waker\(owner\);/);
  assert.match(node, /napi::sys::ThreadsafeFunctionReleaseMode::abort/);
  // PHP has no event loop: no threadsafe function.
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.doesNotMatch(php, /threadsafe_function|fn wake\(/);
  assert.match(php, /Some\(owner\) if owner\.generation == self\.generation => owner\.released\.push\(self\.key\),/);
});

test('Go deletes the cgo.Handle of every func that a buffer gives before it decodes the buffer, whatever the decoding finds (GN-6u)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['go'] });
  const lib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  // Rust lists the handles of a buffer first, and a func node is the index of its handle in the list.
  assert.match(lib, /static GIVEN: RefCell<Vec<u64>> = const \{ RefCell::new\(Vec::new\(\)\) \};/);
  assert.match(lib, /fn given_first\(bytes: Vec<u8>\) -> Vec<u8> \{/);
  assert.match(lib, /Ok\(bytes\) => \(0, given_first\(bytes\)\),\n\s+Err\(fail\) => \(1, given_first\(encode_fail\(fail\)\)\),/);
  assert.match(lib, /output\.push\(13\);\n\s+\/\/ SAFETY: [^\n]*\n\s+write_length\(output, give\(/);
  const binding = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
  // Go takes the func of each handle and deletes the handle before it decodes anything else.
  assert.match(binding, /func readerOf\(bytes \[\]byte\) \*Reader \{\n\tr := &Reader\{bytes: bytes\}\n\tcount := r\.Uint\(\)\n/);
  assert.match(binding, /\t\tr\.funcs = append\(r\.funcs, handle\.Value\(\)\)\n\t\thandle\.Delete\(\)\n/);
  assert.match(binding, /func invoke\(fn entry, args \[\]byte\) \(\*Reader, error\) \{/);
  assert.match(binding, /case 13:\n\t\tindex := r\.Uint\(\)\n/);
  assert.match(binding, /c\.callbacks\[callback-1\]\(c, member, readerOf\(args\), enc\)/);
  const pkg = text(out, 'packages/go/zz_generated_sample.go');
  assert.doesNotMatch(pkg, /binding\.NewReader\(out\)/);
});

test('a Raised holds the key of the thrown object as a Native, whose last drop removes the entry (U-3, GN-6d, GN-6u)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['php', 'python', 'node', 'go', 'wasm'] });
  const libs = [['python', 'packages/python/generated/lib.rs'], ['node', 'packages/ts/generated/lib.rs'], ['php', 'packages/php-ext/generated/lib.rs'], ['wasm', 'packages/ts/wasm/generated/lib.rs'], ['go', 'packages/go/internal/ffi/generated/lib.rs']] as const;
  for (const [lang, path] of libs) {
    const lib = text(out, path);
    assert.match(lib, /Raised::from_generated\((?:binding_core::)?Native::new\(ThrownKey \{/, lang);
    assert.match(lib, /impl (?:binding_core::)?NativeObject for ThrownKey \{\}/, lang);
    assert.match(lib, /impl Drop for ThrownKey \{\n    fn drop\(&mut self\) \{/, lang);
    assert.match(lib, /raised\.native\(\)\.downcast::<ThrownKey>\(\)/, lang);
    assert.doesNotMatch(lib, /raised\.handle\(\)|Raised::from_generated\((?:binding_core::)?Handle::new/, lang);
  }
  // Node and PHP keep the table on the thread that threw: a drop elsewhere queues the key for that thread while it lives.
  for (const [lang, path] of libs.filter(([lang]) => lang === 'node' || lang === 'php')) {
    const lib = text(out, path);
    assert.match(lib, /struct ThrownKey \{\n    thread: u64,\n    key: u64,\n\}/, lang);
    assert.match(lib, /static DROPPED: Mutex<Dropped> = Mutex::new\(Dropped \{ live: BTreeSet::new\(\), keys: Vec::new\(\) \}\);/, lang);
    assert.match(lib, /impl Drop for ThrownThread \{/, lang);
    assert.match(lib, /fn release_dropped\(\) \{/, lang);
  }
});

test('a generated test gives an object through a native row and back, and counts that the binding released it (GN-6u)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const sample = read('sample/packages/rust/interface.json');
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['php', 'python', 'node', 'go', 'wasm'] });
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(python, /def test_gn6u_same_gives_back_the_same_object_and_releases_it\(self\) -> None:\n        pkg\.same\(_Subject\(\)\)\n        subject = _Subject\(\)\n        before = sys\.getrefcount\(subject\)\n        self\.assertIs\(pkg\.same\(subject\), subject\)\n        pkg\.same\(_Subject\(\)\)\n        self\.assertEqual\(sys\.getrefcount\(subject\), before\)\n        alive = weakref\.ref\(subject\)\n        del subject\n        self\.assertIsNone\(alive\(\)\)/);
  for (const [path, entry] of [['packages/ts/generated/tests/generated.test.mjs', 'addon\\(\\)'], ['packages/ts/wasm/generated/tests/generated.test.mjs', '\\(await glueModule\\(\\)\\)']] as const) {
    const js = text(out, path);
    assert.match(js, new RegExp(`test\\('GN-6u: same gives back the same object and releases it', async \\(\\) => \\{\\n  pkg\\.same\\(new Subject\\(\\)\\);\\n  const before = ${entry}\\.__nativeCount\\(\\);\\n  const subject = new Subject\\(\\);\\n  assert\\.equal\\(pkg\\.same\\(subject\\), subject\\);\\n  await new Promise\\(setImmediate\\);\\n  pkg\\.same\\(new Subject\\(\\)\\);\\n  assert\\.equal\\(${entry}\\.__nativeCount\\(\\), before\\);\\n\\}\\);`), path);
  }
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(php, /public function testGn6uSameGivesBackTheSameObjectAndReleasesIt\(\): void\n    \{\n        \\Polyspec\\Sample\\same\(new class \{\}\);\n        \$before = \\Polyspec\\Sample\\Internal\\nativeCount\(\);\n        \$subject = new class \{\};\n        self::assertSame\(\$subject, \\Polyspec\\Sample\\same\(\$subject\)\);/);
  const go = text(out, 'packages/go/zz_generated_native_count_test.go');
  assert.match(go, /\/\/go:build polyspec_native_count_test/);
  assert.match(go, /before, err := binding\.NativeCount\(\)/);
  assert.match(text(out, 'packages/go/internal/binding/zz_generated_native_count.go'), /func NativeCount\(\) \(uint64, error\) \{/);
  // The count is the entry point of the feature native-count-test.
  const packages = trackedPackages(sample, '0.0.0');
  for (const path of ['packages/ts/Cargo.toml', 'packages/php-ext/Cargo.toml', 'packages/ts/wasm/Cargo.toml', 'packages/go/internal/ffi/Cargo.toml']) {
    assert.match(String(packages.get(path)), /\nnative-count-test = \[\]\n/, path);
  }
  assert.match(text(out, 'packages/ts/generated/lib.rs'), /#\[cfg\(feature = "native-count-test"\)\]\n#\[napi\(js_name = "__nativeCount"\)\]/);
});

// The consumer sample of the end-to-end check, which names the value alias of the sample (tests/e2e/consumer).
const consumerSample = (): { contract: any; caseFiles: Map<string, unknown>; foreign: Map<string, any> } => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  return {
    contract: read('consumer/packages/rust/interface.json'),
    caseFiles: new Map([['contracts/cases.json', read('consumer/contracts/cases.json')]]),
    foreign: new Map([['sample', read('sample/packages/rust/interface.json')]]),
  };
};

// The plot of the end-to-end check, which takes and gives the record point of tests/e2e/points (GN-15f).
const plotSample = (): { contract: any; caseFiles: Map<string, unknown>; foreign: Map<string, any> } => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  return {
    contract: read('plot/packages/rust/interface.json'),
    caseFiles: new Map([['contracts/cases.json', read('plot/contracts/cases.json')]]),
    foreign: new Map([['points', read('points/packages/rust/interface.json')]]),
  };
};

test('Go: a record of another repository is the struct of its Go module, which go.mod requires (GN-15f)', () => {
  const { contract, caseFiles, foreign } = plotSample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_plot', caseFiles, foreign, targets: ['go'] });
  const pkg = text(out, 'packages/go/zz_generated_plot.go');
  assert.match(pkg, /\n\t"github\.com\/polyspec\/points\/packages\/go"\n/);
  assert.match(pkg, /\nfunc Mirror\(point points\.Point\) \(points\.Point, error\) \{\n/);
  assert.match(pkg, /\tenc\.Int\(point\.X\)\n\tenc\.Int\(point\.Y\)\n/);
  const lib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(lib, /\nmod library_points \{\n {4}use super::\*;\n/);
  assert.match(lib, /\n {4}pub\(super\) fn in_point\(input: &mut &\[u8\]\) -> Result<polyspec_points::Point, Fail> \{\n/);
  assert.match(lib, /\n {4}pub\(super\) fn out_point\(output: &mut Vec<u8>, value: impl Borrow<polyspec_points::Point>\) \{\n/);
  assert.match(lib, /\blibrary_points::in_point\(&mut input\)/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /points\.Point\{X: 1, Y: 2\}/);
  // binding scaffold requires the Go module of the library by the dependency line of the core.
  const goMod = (spec: unknown, of = contract, libraries = foreign): string => String(trackedPackages(of, '0.0.0', new Map([['polyspec-points', spec], ['polyspec-sample', { path: '../../../sample/packages/rust' }]]), [], libraries).get('packages/go/go.mod'));
  const module = 'github\\.com\\/polyspec\\/points\\/packages\\/go';
  assert.match(goMod({ path: '../../../points/packages/rust' }), new RegExp(`\\ngo 1\\.27\\.3\\n\\nrequire ${module} v0\\.0\\.0\\n\\nreplace ${module} => \\.\\.\\/\\.\\.\\/\\.\\.\\/points\\/packages\\/go\\n$`));
  assert.match(goMod('=0.1.2'), new RegExp(`\\nrequire ${module} v0\\.1\\.2\\n$`));
  assert.match(goMod({ git: 'https://github.com/polyspec/points.git', tag: 'v0.1.2' }), new RegExp(`\\nrequire ${module} v0\\.1\\.2\\n$`));
  // GN-3e: a branch, a commit and a version range are development forms, which give v0.0.0 without a replace line; a
  // tag beside a branch is no release form either.
  for (const spec of [{ git: 'https://github.com/polyspec/points.git', branch: 'main' }, { git: 'https://github.com/polyspec/points.git', rev: '0123abc' }, '0.1', { version: '^0.1.2' }, { git: 'https://github.com/polyspec/points.git', branch: 'main', tag: 'v0.1.2' }]) {
    assert.match(goMod(spec), new RegExp(`\\ngo 1\\.27\\.3\\n\\nrequire ${module} v0\\.0\\.0\\n$`), JSON.stringify(spec));
  }
  // A library whose records the contract does not name is not required: the consumer names only a value alias.
  const consumer = consumerSample();
  assert.doesNotMatch(goMod({ path: '../../../points/packages/rust' }, consumer.contract, consumer.foreign), /require/);
});

test('pyproject.toml names another library at the version of a release form, and alone for a development form (GN-3e)', () => {
  const { contract, foreign } = plotSample();
  const pyproject = (spec: unknown): string => String(trackedPackages(contract, '0.0.0', new Map([['polyspec-points', spec]]), [], foreign).get('packages/python/pyproject.toml'));
  assert.match(pyproject('=0.1.2'), /\ndependencies = \["polyspec-points==0\.1\.2"\]\n/);
  assert.match(pyproject({ git: 'https://github.com/polyspec/points.git', tag: 'v0.1.2' }), /\ndependencies = \["polyspec-points==0\.1\.2"\]\n/);
  for (const spec of [{ path: '../../../points/packages/rust' }, { git: 'https://github.com/polyspec/points.git', branch: 'main' }, '0.1']) {
    assert.match(pyproject(spec), /\ndependencies = \["polyspec-points"\]\n/, JSON.stringify(spec));
  }
});

test('a record of another repository is named in the package of its repository in the tests of every target (T-3, GN-6c)', () => {
  const { contract, caseFiles, foreign } = plotSample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_plot', caseFiles, foreign });
  // Python: the class is of the module of its repository, which the test imports; the package of plot exports no Point.
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(python, /^import polyspec\.points as foreign_points$/m);
  assert.match(python, /result = pkg\.mirror\(foreign_points\.Point\(x=1, y=2\)\)\n {8}expected = foreign_points\.Point\(x=2, y=1\)/);
  assert.doesNotMatch(python, /pkg\.Point\b/);
  assert.doesNotMatch(text(out, 'packages/python/generated/python/polyspec/plot/__init__.py'), /Point/);
  // PHP: the class is of the namespace of its repository.
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(php, /\\Polyspec\\Plot\\mirror\(new \\Polyspec\\Points\\Point\(x: 1, y: 2\)\)/);
  assert.doesNotMatch(php, /\\Polyspec\\Plot\\Point\b/);
  // Node and WASM: a plain object.
  for (const path of ['packages/ts/generated/tests/generated.test.mjs', 'packages/ts/wasm/generated/tests/generated.test.mjs']) assert.match(text(out, path), /pkg\.mirror\(\{ x: 1, y: 2 \}\)/, path);
});

test('WASM: the crate imports Array, which the failure of every contract uses (GN-18, GN-5)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  // The contract of points uses no list, so nothing but the arguments of the constructor of a failure names Array.
  const points = text(generate({ contract: read('points/packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_points', caseFiles: new Map([['contracts/cases.json', read('points/contracts/cases.json')]]), targets: ['wasm'] }), 'packages/ts/wasm/generated/lib.rs');
  assert.match(points, /let args = Array::of4\(/);
  assert.match(points, /^use js_sys::\{Array, Function, Object, Reflect\};$/m);
  const { contract, caseFiles, foreign } = plotSample();
  const plot = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_plot', caseFiles, foreign, targets: ['wasm'] }), 'packages/ts/wasm/generated/lib.rs');
  assert.match(plot, /^use js_sys::\{Array, [^}\n]*\};$/m);
});

test('Go: an integer above the safe integers is a literal, which gofmt keeps at any place of a call (B-2, GN-12a)', () => {
  // gofmt writes 1 << 53 as 1<<53 where it is one of several arguments, so the test writes the number itself.
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const tests = text(generate({ contract: read('points/packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_points', caseFiles: new Map([['contracts/cases.json', read('points/contracts/cases.json')]]), targets: ['go'] }), 'packages/go/zz_generated_test.go');
  assert.match(tests, /Shift\(9007199254740992, Point\{X: 0, Y: 0\}\)/);
  assert.match(tests, /Shift\(-9007199254740992, Point\{X: 0, Y: 0\}\)/);
  assert.doesNotMatch(tests, /<< 53/);
});

test('binding scaffold reads the contract of a path dependency and writes its Go module in go.mod (GN-15f)', () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-plot-'));
  try {
    for (const repository of ['points', 'plot']) execFileSync('cp', ['-r', new URL(`../../../tests/e2e/${repository}`, import.meta.url).pathname, root]);
    execFileSync(process.execPath, [cli, 'scaffold', '--root', join(root, 'plot')]);
    assert.match(readFileSync(join(root, 'plot/packages/go/go.mod'), 'utf8'), /\nrequire github\.com\/polyspec\/points\/packages\/go v0\.0\.0\n\nreplace github\.com\/polyspec\/points\/packages\/go => \.\.\/\.\.\/\.\.\/points\/packages\/go\n$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The plot and the points of the end-to-end check in a directory, with a cargo whose metadata names the core of points,
// as Cargo names the checkout of a git dependency.
const plotCopy = (): { root: string; env: NodeJS.ProcessEnv } => {
  const root = mkdtempSync(join(tmpdir(), 'binding-plot-'));
  for (const repository of ['points', 'plot']) execFileSync('cp', ['-r', new URL(`../../../tests/e2e/${repository}`, import.meta.url).pathname, root]);
  execFileSync('mkdir', ['-p', join(root, 'bin')]);
  const metadata = JSON.stringify({ packages: [{ name: 'polyspec-points', manifest_path: join(root, 'points/packages/rust/Cargo.toml') }] });
  writeFileSync(join(root, 'bin/cargo'), `#!/bin/sh\ncat <<'EOF'\n${metadata}\nEOF\n`, { mode: 0o755 });
  return { root, env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}` } };
};

test('a branch dependency of the core generates every target, and only the check of a release reports it (GN-3e, GN-15f, CK-70)', () => {
  const { root, env } = plotCopy();
  try {
    const manifest = join(root, 'plot/packages/rust/Cargo.toml');
    const path = 'polyspec-points = { path = "../../../points/packages/rust" }';
    assert.ok(readFileSync(manifest, 'utf8').includes(path));
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(path, 'polyspec-points = { git = "https://github.com/polyspec/points.git", branch = "main" }'));
    const contract = join(root, 'plot/packages/rust/interface.json');
    const run = (...args: string[]): { status: number | null; stderr: string } => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
    const scaffold = run('scaffold', '--root', join(root, 'plot'));
    assert.equal(scaffold.status, 0, scaffold.stderr);
    assert.match(readFileSync(join(root, 'plot/packages/go/go.mod'), 'utf8'), /\nrequire github\.com\/polyspec\/points\/packages\/go v0\.0\.0\n$/);
    assert.match(readFileSync(join(root, 'plot/packages/python/Cargo.toml'), 'utf8'), /\npolyspec-points = \{ git = "https:\/\/github\.com\/polyspec\/points\.git", branch = "main" \}\n/);
    // No command stops with a stack trace or with the Go version, for any target.
    const out = join(root, 'out');
    for (const target of ['python', 'node', 'php', 'wasm', 'go']) {
      const generated = run('generate', '--root', join(root, 'plot'), '--out', out, '--target', target);
      assert.doesNotMatch(generated.stderr, /GN-15f|\n {4}at /, target);
    }
    const checked = run('check', contract);
    assert.doesNotMatch(checked.stderr, /CK-19|CK-70|GN-15f|\n {4}at /);
    // CK-70: the check of a release names the line.
    const release = run('check', contract, '--release');
    assert.equal(release.status, 1);
    assert.match(release.stderr, /plot\/packages\/rust\/Cargo\.toml: CK-70 the dependency line of polyspec-points names the branch main, a development form, and a release names the version =X\.Y\.Z or the tag vX\.Y\.Z \(GN-3e\)\n/);
    assert.doesNotMatch(release.stderr, /CK-19|\n {4}at /);
    // CK-70: the line on polyspec-binding-core of the core and of each binding crate, which follows the core's.
    for (const crate of ['rust', 'python', 'ts', 'ts/wasm', 'php-ext', 'go/internal/ffi']) {
      assert.match(release.stderr, new RegExp(`plot/packages/${crate}/Cargo\\.toml: CK-70 the dependency line of polyspec-binding-core names the branch v1/rust-core, a development form, and a release names the version =X\\.Y\\.Z or the tag vX\\.Y\\.Z \\(GN-3e\\)\\n`), crate);
    }
    // A tag is the release form, which CK-70 passes; the binding crates take the tag of binding that the core names.
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('branch = "main"', 'tag = "v0.1.2"').replace('branch = "v1/rust-core"', 'tag = "v0.3.0"'));
    assert.equal(run('scaffold', '--root', join(root, 'plot')).status, 0);
    assert.match(readFileSync(join(root, 'plot/packages/python/Cargo.toml'), 'utf8'), /\npolyspec-binding-core = \{ git = "https:\/\/github\.com\/polyspec\/binding\.git", tag = "v0\.3\.0", features = \["construct", "lock"\] \}\n/);
    assert.match(readFileSync(join(root, 'plot/packages/go/go.mod'), 'utf8'), /\nrequire github\.com\/polyspec\/points\/packages\/go v0\.1\.2\n$/);
    assert.doesNotMatch(run('check', contract, '--release').stderr, /CK-70/);
    // An option that check does not know is an error of the command line.
    assert.equal(run('check', contract, '--publish').status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a scaffold whose cargo metadata fails names the Go module alone and writes the other packages (GN-15f, GN-3e)', () => {
  const { root, env } = plotCopy();
  try {
    const manifest = join(root, 'plot/packages/rust/Cargo.toml');
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('polyspec-points = { path = "../../../points/packages/rust" }', 'polyspec-points = { git = "https://github.com/polyspec/points.git", branch = "main" }'));
    // A cargo that fails as it does without network for a Git dependency that was never fetched.
    writeFileSync(join(root, 'bin/cargo'), '#!/bin/sh\necho "error: failed to get polyspec-points as a dependency of package polyspec-plot" >&2\nexit 101\n', { mode: 0o755 });
    const advice = 'cargo metadata failed with status 101; run the install target of the repository that fetches the crates of its Cargo\\.lock \\(cargo fetch --locked\\), then run the command again';
    const scaffold = spawnSync(process.execPath, [cli, 'scaffold', '--root', join(root, 'plot')], { encoding: 'utf8', env });
    assert.equal(scaffold.status, 1);
    assert.match(scaffold.stderr, new RegExp(`\\nbinding: packages/go: not written: points: the contract of the library is not found, so binding scaffold cannot tell whether go\\.mod requires its Go module \\(GN-15f\\): ${advice}\\nbinding: the contracts of the libraries that the contract names are not all found, so the packages are written without the libraries that only a callback unit of another library names \\(GN-3e\\): ${advice}\\n$`));
    assert.doesNotMatch(scaffold.stderr, /\n {4}at /);
    assert.equal(existsSync(join(root, 'plot/packages/go/go.mod')), false);
    for (const written of ['python/Cargo.toml', 'python/pyproject.toml', 'ts/Cargo.toml', 'ts/package.json', 'ts/wasm/Cargo.toml', 'php-ext/Cargo.toml', 'php-ext/composer.json']) {
      assert.equal(existsSync(join(root, 'plot/packages', written)), true, written);
    }
    // check and generate read the contracts for every target, so they fail with the same instruction.
    for (const args of [['check', join(root, 'plot/packages/rust/interface.json')], ['generate', '--root', join(root, 'plot'), '--out', join(root, 'out')]]) {
      const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
      assert.equal(run.status, 1, args[0]);
      assert.match(run.stderr, new RegExp(`\\nbinding: ${advice}\\n$`), args[0]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the line of a binding crate on polyspec-binding-core follows the line of the core (GN-3e)', () => {
  const contract = load().contract;
  const line = (spec: unknown, path = 'packages/python/Cargo.toml', of = contract): string => /\npolyspec-binding-core = [^\n]*\n/.exec(String(trackedPackages(of, '0.0.0', spec === undefined ? new Map() : new Map([['polyspec-binding-core', spec]])).get(path)))?.[0] ?? '';
  const git = 'https://github.com/polyspec/binding.git';
  assert.equal(line({ git, tag: 'v0.3.0' }), `\npolyspec-binding-core = { git = "${git}", tag = "v0.3.0", features = ["construct", "lock"] }\n`);
  assert.equal(line({ git, branch: 'next', features: ['fault-test'], optional: true }), `\npolyspec-binding-core = { git = "${git}", branch = "next", features = ["construct", "lock"] }\n`);
  assert.equal(line('=0.3.0'), '\npolyspec-binding-core = { version = "=0.3.0", features = ["construct", "lock"] }\n');
  // A path climbs to the place of the binding crate: the Go crate is two directories below the level of the core.
  assert.equal(line({ path: '../../../binding/packages/core/rust' }), '\npolyspec-binding-core = { path = "../../../binding/packages/core/rust", features = ["construct", "lock"] }\n');
  assert.equal(line({ path: '../../../binding/packages/core/rust' }, 'packages/go/internal/ffi/Cargo.toml'), '\npolyspec-binding-core = { path = "../../../../../binding/packages/core/rust", features = ["construct", "lock"] }\n');
  // A core without the line: the development line of binding.
  assert.equal(line(undefined), `\npolyspec-binding-core = { git = "${git}", branch = "v1/rust-core", features = ["construct", "lock"] }\n`);
});

test('a core without a line on polyspec-binding-core gives the binding crates the line of the generator itself: the tag of its version for a release, the development branch otherwise (GN-3e, CK-70)', () => {
  const contract = load().contract;
  const git = 'https://github.com/polyspec/binding.git';
  const manifests = (own: { version: string; commit: string | undefined }, core?: unknown): string[] =>
    [...trackedPackages(contract, '0.0.0', core === undefined ? new Map() : new Map([['polyspec-binding-core', core]]), [], new Map(), [], 'MIT', own)].filter(([path]) => path.endsWith('Cargo.toml')).map(([, text]) => text);
  // The generator of a release knows no commit of itself (CK-20): it was installed at its version.
  const released = { version: '0.3.0', commit: undefined };
  const tagged = manifests(released);
  assert.ok(tagged.length >= 5, `the fixture has ${tagged.length} binding crates`);
  for (const text of tagged) {
    assert.match(text, /\npolyspec-binding-core = \{ git = "https:\/\/github\.com\/polyspec\/binding\.git", tag = "v0\.3\.0", features = \[/);
    // The tag of a release is a release form, so the check of a release reports nothing in the crate (CK-70).
    assert.equal(bindingCoreFinding(parse(text)), undefined);
  }
  // A generator that knows its commit is a development generator: a checkout, a tree of git archive, an install from Git.
  const development = { version: '0.3.0', commit: 'a'.repeat(40) };
  for (const text of manifests(development)) {
    assert.match(text, /\npolyspec-binding-core = \{ git = "https:\/\/github\.com\/polyspec\/binding\.git", branch = "v1\/rust-core", features = \[/);
    assert.match(String(bindingCoreFinding(parse(text))), /^the dependency line of polyspec-binding-core names the branch v1\/rust-core, a development form/);
  }
  // The line of the core, when it names one, is followed by either generator.
  for (const text of manifests(released, { git, branch: 'next' })) assert.match(text, /\npolyspec-binding-core = \{ git = "[^"]+", branch = "next", features = \[/);
});

test('a tracked package that scaffold cannot write is named, and the other packages are written and compared (GN-3e, CK-19)', () => {
  const { root, env } = plotCopy();
  try {
    // points has no Go module, whose record the Go binding of plot names.
    const pointsPath = join(root, 'points/packages/rust/interface.json');
    const points = JSON.parse(readFileSync(pointsPath, 'utf8'));
    points.targets = points.targets.filter((target: string) => target !== 'go');
    delete points.packages.go;
    writeFileSync(pointsPath, JSON.stringify(points));
    const run = (...args: string[]): { status: number | null; stderr: string } => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
    const scaffold = run('scaffold', '--root', join(root, 'plot'));
    assert.equal(scaffold.status, 1);
    assert.match(scaffold.stderr, /^binding: packages\/go: not written: points: the library has no Go module \(packages\.go\), whose record or value class the Go binding names \(GN-15f\)\n$/);
    assert.equal(existsSync(join(root, 'plot/packages/go/go.mod')), false);
    for (const written of ['python/Cargo.toml', 'python/pyproject.toml', 'ts/Cargo.toml', 'ts/package.json', 'ts/wasm/Cargo.toml', 'php-ext/Cargo.toml', 'php-ext/composer.json']) {
      assert.equal(existsSync(join(root, 'plot/packages', written)), true, written);
    }
    const checked = run('check', join(root, 'plot/packages/rust/interface.json'));
    assert.equal(checked.status, 1);
    assert.match(checked.stderr, /plot\/packages\/go: CK-19 binding scaffold does not write it: points: the library has no Go module \(packages\.go\), whose record or value class the Go binding names \(GN-15f\) \(L-2\)\n/);
    assert.doesNotMatch(checked.stderr, /CK-19 (is missing|differs)|\n {4}at /);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Three libraries: consumer takes the callback unit lookup of sample, whose member gives the record point of points, a
// library that the contract of consumer does not name. cargo names the cores of sample and of points, as it does for
// every package of the resolution of a workspace.
const threeLibraries = (): { root: string; env: NodeJS.ProcessEnv } => {
  const root = mkdtempSync(join(tmpdir(), 'binding-three-'));
  for (const repository of ['consumer', 'sample', 'points']) execFileSync('cp', ['-r', new URL(`../../../tests/e2e/${repository}`, import.meta.url).pathname, root]);
  const edit = (path: string, change: (json: any) => void): void => {
    const json = JSON.parse(readFileSync(join(root, path), 'utf8'));
    change(json);
    writeFileSync(join(root, path), JSON.stringify(json));
  };
  edit('consumer/packages/rust/interface.json', (contract) => {
    const unit = contract.units.find((u: any) => (u.members ?? []).some((m: any) => m.id === 'consumer.fetch'));
    const fetch = unit.members.find((m: any) => m.id === 'consumer.fetch');
    unit.members.push({ ...fetch, id: 'consumer.ask', name: ['ask'], parameters: [{ name: ['lookup'], type: { unit: 'lookup', library: 'sample' }, required: true }, { name: ['key'], type: 'text', required: true }], returns: 'text', raises: [], core: 'polyspec_consumer::ask' });
    contract.cases.push({ member: 'consumer.ask', file: 'contracts/cases.json', group: 'consumer_ask' });
  });
  edit('consumer/contracts/cases.json', (cases) => { cases.consumer_ask = []; });
  edit('sample/packages/rust/interface.json', (contract) => {
    const find = contract.units.find((u: any) => u.id === 'lookup').members[0];
    find.returns = { optional: { unit: 'point', library: 'points' } };
    // A callback of another library that recognizes an error unit is not generated yet, which is no subject of these tests.
    delete find.errors;
  });
  const manifest = join(root, 'consumer/packages/rust/Cargo.toml');
  const sample = 'polyspec-sample = { path = "../../../sample/packages/rust" }';
  assert.ok(readFileSync(manifest, 'utf8').includes(sample));
  writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(sample, `${sample}\npolyspec-points = { path = "../../../points/packages/rust" }`));
  const sampleManifest = join(root, 'sample/packages/rust/Cargo.toml');
  writeFileSync(sampleManifest, readFileSync(sampleManifest, 'utf8').replace('\n[dependencies]\n', '\n[dependencies]\npolyspec-points = { path = "../../../points/packages/rust" }\n'));
  assert.ok(readFileSync(sampleManifest, 'utf8').includes('polyspec-points'));
  execFileSync('mkdir', ['-p', join(root, 'bin')]);
  const metadata = JSON.stringify({ packages: ['sample', 'points'].map((name) => ({ name: `polyspec-${name}`, manifest_path: join(root, `${name}/packages/rust/Cargo.toml`) })) });
  writeFileSync(join(root, 'bin/cargo'), `#!/bin/sh\ncat <<'EOF'\n${metadata}\nEOF\n`, { mode: 0o755 });
  return { root, env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}` } };
};

test('the contract of a library that only a unit of another library names is read, and the manifests name that library (T-3, CK-9, GN-3e, GN-15f)', () => {
  const { root, env } = threeLibraries();
  try {
    const run = (...args: string[]): { status: number | null; stderr: string } => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
    // The contract check takes the unit of the third library, which is a record of its contract.
    const checked = run('check', join(root, 'consumer/packages/rust/interface.json'));
    assert.doesNotMatch(checked.stderr, /CK-9|has no unit|\n {4}at /);
    // The targets that take a callback unit of another library generate, and their crates name the core of points.
    const generated = run('generate', '--root', join(root, 'consumer'), '--out', join(root, 'out'));
    assert.doesNotMatch(generated.stderr, /points has no unit point|\n {4}at /);
    assert.match(generated.stderr, /\ngenerated: php, python, node\n$/);
    for (const lib of ['php-ext/generated/lib.rs', 'python/generated/lib.rs', 'ts/generated/lib.rs']) {
      assert.match(readFileSync(join(root, 'out/packages', lib), 'utf8'), /polyspec_points::Point\b/, lib);
    }
    // The manifests name the library whose types the generated code names: the Cargo manifest of each binding crate
    // by the dependency line of the core, pyproject.toml, and go.mod for a record. scaffold reads the contracts by the
    // path of each dependency line, of the core and then of the core of sample.
    const scaffold = run('scaffold', '--root', join(root, 'consumer'));
    assert.equal(scaffold.status, 0, scaffold.stderr);
    const tracked = (path: string): string => readFileSync(join(root, 'consumer/packages', path), 'utf8');
    for (const manifest of ['python/Cargo.toml', 'ts/Cargo.toml', 'ts/wasm/Cargo.toml', 'php-ext/Cargo.toml']) {
      assert.match(tracked(manifest), /\npolyspec-points = \{ path = "(\.\.\/)+points\/packages\/rust" \}\n/, manifest);
    }
    assert.match(tracked('python/pyproject.toml'), /\ndependencies = \["polyspec-points", "polyspec-sample"\]\n/);
    assert.match(tracked('go/go.mod'), /\nrequire github\.com\/polyspec\/points\/packages\/go v0\.0\.0\n\nreplace github\.com\/polyspec\/points\/packages\/go => \.\.\/\.\.\/\.\.\/points\/packages\/go\n$/);
    // A unit that the third library does not have is a finding of the check, with the libraries on the way.
    const pointsPath = join(root, 'points/packages/rust/interface.json');
    const points = JSON.parse(readFileSync(pointsPath, 'utf8'));
    points.units = points.units.filter((u: any) => u.id !== 'point');
    writeFileSync(pointsPath, JSON.stringify(points));
    assert.match(run('check', join(root, 'consumer/packages/rust/interface.json')).stderr, /: CK-9 points has no unit point\n/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('libraries whose contracts name each other in a cycle are refused by name (T-3)', () => {
  const { root, env } = threeLibraries();
  try {
    // points names a unit of sample, which names the record of points.
    const pointsPath = join(root, 'points/packages/rust/interface.json');
    const points = JSON.parse(readFileSync(pointsPath, 'utf8'));
    points.units.find((u: any) => u.id === 'point').fields[0].type = { unit: 'data', library: 'sample' };
    writeFileSync(pointsPath, JSON.stringify(points));
    for (const args of [['check', join(root, 'consumer/packages/rust/interface.json')], ['generate', '--root', join(root, 'consumer'), '--out', join(root, 'out')], ['scaffold', '--root', join(root, 'consumer')]]) {
      const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
      assert.equal(run.status, 1, args[0]);
      assert.match(run.stderr, /^binding: the contracts of the libraries sample -> points -> sample name each other in a cycle, which is not generated \(T-3\)\n/m, args[0]);
      assert.doesNotMatch(run.stderr, /\n {4}at /, args[0]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generate refuses the Go target alone, with its sentence, when a library whose record the contract names has no Go module (GN-15f, GN-1c)', () => {
  const { root, env } = plotCopy();
  try {
    const pointsPath = join(root, 'points/packages/rust/interface.json');
    const points = JSON.parse(readFileSync(pointsPath, 'utf8'));
    points.targets = points.targets.filter((target: string) => target !== 'go');
    delete points.packages.go;
    writeFileSync(pointsPath, JSON.stringify(points));
    const run = spawnSync(process.execPath, [cli, 'generate', '--root', join(root, 'plot'), '--out', join(root, 'out')], { encoding: 'utf8', env });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /go: not generated \(G-4\), 1 item:\n {2}points: the library has no Go module \(packages\.go\), whose record or value class the Go binding names \(GN-15f\)\n/);
    assert.doesNotMatch(run.stderr, /\n {4}at /);
    // The other targets are written.
    for (const written of ['python/generated/lib.rs', 'ts/generated/lib.rs', 'ts/wasm/generated/lib.rs', 'php-ext/generated/lib.rs']) {
      assert.equal(existsSync(join(root, 'out/packages', written)), true, written);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failure that a case file causes is a refused target with its sentence and no stack trace (GN-1c)', () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-sentence-'));
  try {
    execFileSync('cp', ['-r', new URL('../../../tests/e2e/sample', import.meta.url).pathname, root]);
    // A value {"host"} outside its closed table, which the generator reads when it writes the case of an alias.
    const casesPath = join(root, 'sample/contracts/cases.json');
    const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
    const kase = cases.data_in.find((k: any) => k.raises !== undefined);
    kase.value = { host: 'bogus' };
    writeFileSync(casesPath, JSON.stringify(cases));
    const run = spawnSync(process.execPath, [cli, 'generate', '--root', join(root, 'sample'), '--out', join(root, 'out')], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    for (const target of ['php', 'python', 'node', 'go', 'wasm']) {
      assert.match(run.stderr, new RegExp(`${target}: not generated \\(G-4\\), 1 item:\\n  the case ${kase.id} of the alias data: a value \\{"host"\\} is [^\\n]*, not "bogus" \\(G-5\\)\\n`));
    }
    assert.doesNotMatch(run.stderr, /\n {4}at /);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Go: a contract without a class unit has no table of instances in its C ABI (T-5, GN-15a)', () => {
  // A map insert of the generated code (made.insert) is no call of the helper that keeps an instance in a table.
  const { contract, caseFiles, foreign } = consumerSample();
  const lib = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['go'] }), 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(lib, /made\.insert\(/);
  assert.doesNotMatch(lib, /Table<|Arc::new/);
});

test('Go: an optional output is an Option of a reference to the value of the core, so a generic item takes one type (GN-16)', () => {
  // An optional property of an error unit (absent_error.length, of the form of machine_error.expected of fsm).
  const { contract: consumer, caseFiles, foreign } = consumerSample();
  const ffi = text(generate({ contract: consumer, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign }), 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(ffi, /\nfn optional_out<T>\(output: &mut Vec<u8>, value: Option<T>, item: impl FnOnce\(&mut Vec<u8>, T\)\) \{/);
  assert.match(ffi, /optional_out\(output, polyspec_consumer::Error::length\(&error\)\.as_ref\(\), uint_out\);/);
  // An optional uint and an optional text field of a record that leaves the C ABI.
  const { contract } = load();
  contract.units[0].members[0].returns = { unit: 'options' };
  unitOf(contract, 'options').fields.push({ name: ['label'], type: { optional: 'text' }, required: true, reason: 'S-1' });
  contract.cases = [];
  const sample = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map() }), 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(sample, /optional_out\(output, value\.max_words\.as_ref\(\), uint_out\);/);
  assert.match(sample, /optional_out\(output, value\.label\.as_ref\(\), text_out\);/);
});

test('a value alias of another repository converts through the core of its owner (T-3, U-7, GN-6k)', () => {
  const { contract, caseFiles, foreign } = consumerSample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    const lib = text(out, path);
    // The owner's two core functions are the conversion, functions of the module of the library (GN-4c), and the root
    // of the crate has no conversion of that name.
    assert.match(lib, /\nmod library_sample \{\n {4}use super::\*;\n\n(?: {4}[^\n]*\n|\n)*? {4}pub\(super\) fn in_data[(<]/, path);
    assert.match(lib, /let \(root, mut source\) = polyspec_sample::data_to_out\(value\.borrow\(\)\);/, path);
    assert.doesNotMatch(lib, /\nfn (in|out)_data\b/, path);
    // A failure of the owner's in is of the owner's enum; its class is this library's class of the owner's category.
    assert.match(lib, /polyspec_sample::data_from_host\(&mut host, described\)\.map_err\(\|failure: binding_core::Failure<polyspec_sample::Error>\| failure_of_sample\(/, path);
    assert.match(lib, /fn error_of_sample\([^)]*error: polyspec_sample::Error\)[^{]*\{\n    let class(: usize)? = match error \{\n        polyspec_sample::Error::Missing \{ \.\. \} => [^\n]*\n        polyspec_sample::Error::Unsupported \{ \.\. \} => [^\n]*\n(?:        polyspec_sample::Error::[^\n]*\n)*    \};/, path);
    // The callback gives the alias through the same conversions.
    assert.match(lib, new RegExp(`${helperName(path, 'in_optional')}\\([^\\n]*library_sample::in_data\\(`), path);
    assert.match(lib, /library_sample::out_data\((py|self\.env), value\)|library_sample::out_data\(value\)/, path);
  }
  assert.match(text(out, 'packages/python/generated/lib.rs'), /polyspec_sample::Error::Unsupported \{ \.\. \} => "ConsumerValueError",/);
  // The in_raises of the owner's alias give the consumer nothing: no entry point of codec-test, no assertion of the
  // kinds and no case of the alias, which the binding of the owner holds.
  assert.ok((foreign.get('sample')?.units ?? []).some((u: any) => u.id === 'data' && u.in_raises.length > 0));
  // The one entry point of codec-test of the consumer is the round trip of a map of Go (GN-13b), which the map of the
  // variant note brings and which names no alias.
  const echo = /#\[cfg\(feature = "codec-test"\)\]\n#\[no_mangle\]\npub unsafe extern "C" fn polyspec_consumer__echo_map\(/g;
  for (const [path, file] of out) {
    assert.doesNotMatch(String(file).replaceAll(echo, ''), /alias_in_|aliasIn|the kinds of in_raises|codec-test|def test_u7_|U-7: data/, path);
  }
});

test('a value alias of another repository is refused by name where it is not generated (G-4, GN-6k)', () => {
  const generated = (change: (parts: ReturnType<typeof consumerSample>) => void): (() => Map<string, string | Buffer>) => () => {
    const parts = consumerSample();
    change(parts);
    return generate({ contract: parts.contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles: parts.caseFiles, foreign: parts.foreign });
  };
  // T-3, U-7: Go takes the alias of another repository as any and runs the in function of its owner, whose kinds
  // come back through the failure of that owner.
  const go = generated(({ contract }) => {
    if (!contract.targets.includes('go')) contract.targets.push('go');
    contract.packages.go ??= { module: 'github.com/polyspec/consumer/packages/go' };
  })();
  assert.match(text(go, 'packages/go/internal/ffi/generated/lib.rs'), /fn failure_of_sample\(/);
  // E-1b (a): an owner that forwards the kinds of a third library.
  assert.throws(generated(({ foreign }) => {
    foreign.get('sample').errors.kinds.push({ variant: 'polyspec_sample::Error::Other', library: 'third' });
  }), /sample\.data: a value alias whose owner forwards the kind polyspec_sample::Error::Other of another library is not generated yet/);
  assert.throws(generated(({ foreign }) => {
    foreign.get('sample').errors.kinds.push({ variant: 'polyspec_sample::Second::Other', category: 'value' });
  }), /sample\.data: the kinds of sample name 2 error enums/);
  // GN-6e: an out row by a member is refused through the same error, not as a crash.
  assert.throws(generated(({ foreign }) => {
    foreign.get('sample').units.find((u: any) => u.id === 'data').out[0].make.python = 'tag.new';
  }), (error: Error) => error.constructor.name === 'Unsupported' && /data: the python make tag\.new of the kind null takes text, which is not generated: /.test(error.message));
});

// The consumer sample whose owner gives its alias data three classes that the rows of the alias name (GN-6ar): box keeps
// the entries of a map, cell the value of a reference, and ratio holds a float of the core.
const classRowsSample = (): ReturnType<typeof consumerSample> => {
  const parts = consumerSample();
  const owner = parts.foreign.get('sample');
  const data = owner.units.find((u: any) => u.id === 'data');
  const kept = (id: string, parameter: any): any => ({
    id, name: [id], module: '', kind: 'class', visibility: 'public', origin: 'value', only: { targets: ['python', 'node', 'wasm', 'go'], reason: 'S-1' },
    members: [
      { id: `${id}.constructor`, name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [parameter], raises: [], wait: 'none', core: `polyspec_sample::check_${id}` },
      { id: `${id}.${parameter.name[0]}`, name: parameter.name, kind: 'property', visibility: 'public', returns: parameter.type, raises: [], wait: 'none', writable: true },
    ],
  });
  owner.units.push(
    kept('box', { name: ['entries'], type: { keyed_map: { unit: 'data' }, key: ['text'] }, default: { empty: 'map' } }),
    kept('cell', { name: ['value'], type: { unit: 'data' }, default: { literal: null } }),
    {
      id: 'ratio', name: ['ratio'], module: '', kind: 'class', visibility: 'public', origin: 'value', core_type: 'polyspec_sample::Ratio',
      members: [
        { id: 'ratio.constructor', name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [{ name: ['value'], type: 'float', required: true }], raises: [], wait: 'none', core: 'polyspec_sample::Ratio::new' },
        { id: 'ratio.value', name: ['value'], kind: 'property', visibility: 'public', returns: 'float', raises: [], wait: 'none', core: { path: 'polyspec_sample::Ratio::value', receiver: '&self' } },
      ],
    },
  );
  for (const row of data.out) {
    if (row.kind === 'map') Object.assign(row.make, { python: 'box.constructor', node: 'box.constructor', wasm: 'box.constructor', go: 'box.constructor' });
    if (row.kind === 'float') Object.assign(row.make, { node: 'ratio.constructor', wasm: 'ratio.constructor' });
  }
  data.out.push({ kind: 'reference', make: { php: 'php_reference', python: 'cell.constructor', node: 'cell.constructor', wasm: 'cell.constructor', go: 'cell.constructor' } });
  for (const lang of ['python', 'node', 'wasm', 'go']) {
    data.in.push({ [lang]: 'box', cases: [{ kind: 'map', read: 'box.entries' }] }, { [lang]: 'cell', cases: [{ kind: 'reference', read: 'cell.value' }] });
    if (lang === 'node' || lang === 'wasm') data.in.push({ [lang]: 'ratio', cases: [{ kind: 'float', read: 'ratio.value' }] });
  }
  return parts;
};

test('a value alias of another repository whose rows name a class of its owner makes and reads the instances through the package of the owner in Python and Node (GN-6ar, GN-6k)', () => {
  const { contract, caseFiles, foreign } = classRowsSample();
  const python = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['python'] }), 'packages/python/generated/lib.rs');
  // Out: the constructor of the owner's class takes the dict of the entries, which is filled after the instance is
  // made, and a reference is made on None and takes its value by its writable property.
  assert.match(python, /let map = PyDict::new\(py\);\n +let instance = foreign_types\(py, "polyspec\.sample"\)\?\.getattr\("Box"\)\?\.call1\(\(map\.clone\(\),\)\)\?;\n +made\.insert\(handle\.raw\(\), instance\.clone\(\)\);/);
  assert.match(python, /let instance = foreign_types\(py, "polyspec\.sample"\)\?\.getattr\("Cell"\)\?\.call1\(\(py\.None\(\),\)\)\?;\n +made\.insert\(handle\.raw\(\), instance\.clone\(\)\);\n +let content = make\(py, \*value, source, made\)\?;\n +instance\.setattr\("value", content\)\?;/);
  // In: an instance of the owner's class is HostValue::Value with the kind of its row, under one handle within the
  // walk, and read gives the property that the row names.
  assert.match(python, /if value\.is_instance\(&foreign_types\(py, "polyspec\.sample"\)\?\.getattr\("Box"\)\?\)\? \{\n {12}let address = value\.as_ptr\(\)\.addr\(\);[\s\S]*?Held::Foreign\(value\.clone\(\), Some\(\("entries", false, ReadAs::Content\)\)\)[\s\S]*?return Ok\(Some\(HostValue::Value \{ kind: ValueKind::Map, handle \}\)\);/);
  assert.match(python, /Held::Foreign\(value\.clone\(\), Some\(\("value", false, ReadAs::Content\)\)\)[\s\S]*?kind: ValueKind::Reference, handle/);
  assert.match(python, /\n {4}seen: BTreeMap<usize, Handle>,\n/);
  assert.match(python, /\n {4}Foreign\(Bound<'py, PyAny>, Option<\(&'static str, bool, ReadAs\)>\),\n/);
  const node = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['node'] });
  const lib = text(node, 'packages/ts/generated/lib.rs');
  // The JavaScript entry hands the classes of the owner to the addon, which calls their constructors.
  assert.match(text(node, 'packages/ts/generated/index.cjs'), /const foreign_sample = require\('@polyspec\/sample'\);\naddon\.__register_foreign\(\[foreign_sample\.Box, foreign_sample\.Cell, foreign_sample\.Ratio\]\);/);
  assert.match(lib, /OutValue::Float\(value\) => \{\n +let class = foreign_class\(env, 2\)\.map_err\(internal\)\?;\n +let constructor: Function<'env, FnArgs<\(f64,\)>, Unknown<'env>> = unsafe \{ class\.to_unknown\(\)\.cast\(\) \}\.map_err\(internal\)\?;\n +let instance = constructor\.new_instance\(FnArgs::from\(\(value\.value\(\),\)\)\)\.map_err\(js_fail\)\?;\n +Ok\(OutStep::Put\(instance\)\)/);
  assert.match(lib, /let map = js_new_map\(env\)\.map_err\(internal\)\?;\n +let class = foreign_class\(env, 0\)\.map_err\(internal\)\?;\n[^\n]*\n +let instance = constructor\.new_instance\(FnArgs::from\(\(map\.to_unknown\(\),\)\)\)\.map_err\(js_fail\)\?;\n +made\.insert\(handle\.raw\(\), instance\);/);
  assert.match(lib, /let class = foreign_class\(env, 1\)\.map_err\(internal\)\?;\n[^\n]*\n +let instance = constructor\.new_instance\(FnArgs::from\(\(null_out\(env\)\?,\)\)\)\.map_err\(js_fail\)\?;\n +made\.insert\(handle\.raw\(\), instance\);\n +let object: Object<'env> = unsafe \{ instance\.cast\(\) \}\.map_err\(internal\)\?;\n +Ok\(OutStep::Enter\(OutLevel \{ handle, len: 0, index: 0, waiting: Some\(\*value\), fill: OutFill::Property\(object, "value"\), made: instance \}\)\)/);
  // GN-6as: the made value of the reference goes into the writable property of the level that waits for it.
  assert.match(lib, /OutFill::Property\(object, name\) => \{\n +object\.set_named_property\(\*name, value\)\.map_err\(js_fail\)\?;/);
  assert.match(lib, /\n {4}if classes\.len\(\) != 3 \{\n/);
  // GN-3e: package.json names the npm package of the owner, whose classes the entry hands over.
  assert.match(String(trackedPackages(contract, '0.0.0', new Map([['polyspec-sample', { path: '../../../sample/packages/rust' }]]), [], foreign).get('packages/ts/package.json')), /"@polyspec\/sample": "\*"/);
  assert.match(lib, /if value\.instanceof\(foreign_class\(self\.env, 2\)\?\)\? \{\n {12}return Ok\(Some\(HostValue::Value \{ kind: ValueKind::Float, handle: self\.hold\(Held::Foreign\(object, Some\(\("value", false, ReadAs::Float\)\)\)\) \}\)\);/);
  assert.match(lib, /if value\.instanceof\(foreign_class\(self\.env, 0\)\?\)\? \{\n {12}let handle = self\.foreign_identity\(object, \("entries", false, ReadAs::Content\)\)\?;\n {12}return Ok\(Some\(HostValue::Value \{ kind: ValueKind::Map, handle \}\)\);/);
  assert.match(lib, /ReadAs::Float => Ok\(HostValue::Float\(/);
  // A row of PHP whose type has the name of a class that is not generated for PHP names the type of the language.
  const php = classRowsSample();
  php.foreign.get('sample').units.find((u: any) => u.id === 'data').in.push({ php: 'cell', cases: [{ kind: 'reference', read: 'builtin' }] });
  assert.match(text(generate({ contract: php.contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles: php.caseFiles, foreign: php.foreign, targets: ['php'] }), 'packages/php-ext/generated/lib.rs'), /fn in_data\(/);
  // WASM and Go do not generate the rows yet and refuse them by name.
  for (const target of ['wasm', 'go'] as const) {
    const parts = classRowsSample();
    if (target === 'go') parts.contract.packages.go ??= { module: 'github.com/polyspec/consumer/packages/go' };
    assert.throws(() => generate({ contract: parts.contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles: parts.caseFiles, foreign: parts.foreign, targets: [target] }), new RegExp(`data: (the ${target} in row of the class box of sample is not generated yet \\(GN-6ar\\)|a ${target} make by a member \\((box|ratio|cell)\\.constructor\\) is not generated yet)`), target);
  }
  // A make that is no constructor of a class of the owner, and a constructor that takes another content, are named.
  const refused = (change: (data: any, owner: any) => void): (() => unknown) => () => {
    const parts = classRowsSample();
    const owner = parts.foreign.get('sample');
    change(owner.units.find((u: any) => u.id === 'data'), owner);
    return generate({ contract: parts.contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles: parts.caseFiles, foreign: parts.foreign, targets: ['python'] });
  };
  assert.throws(refused((data) => { data.out[0].make.python = 'tag.name'; }), /data: the python make tag\.name of the kind null is no public constructor of a public class of sample, and any other member is not generated yet \(GN-6ar\)/);
  assert.throws(refused((data) => { data.out[0].make.python = 'tag.new'; }), /data: the python make tag\.new of the kind null takes text, which is not generated: a constructor of a class of another repository takes a bool, an integer or a float of its kind, the keyed map of an object or a map, or the value of a reference \(GN-6ar\)/);
  assert.throws(refused((_data, owner) => { owner.units.find((u: any) => u.id === 'cell').members[1].writable = false; }), /data: the python make cell\.constructor of the kind reference needs a writable property of cell with the name of the parameter/);
  assert.throws(refused((data) => { data.in.find((row: any) => row.python === 'box').cases[0].read = 'box.none'; }), /data: the python in row of the class box of sample reads box\.none, which is no public property of the class \(GN-6ar\)/);
});

// The consumer sample with the function relay, which takes and gives the value class of the owner fixture (GN-6x).
const valueClassSample = (): ReturnType<typeof consumerSample> => {
  const parts = consumerSample();
  const owner = JSON.parse(readFileSync(new URL('./fixtures/value-class/owner.json', import.meta.url), 'utf8'));
  parts.foreign.set('owner', owner);
  const functions = parts.contract.units.find((u: any) => u.id === 'consumer');
  functions.members.push({
    id: 'consumer.relay', name: ['relay'], kind: 'function', visibility: 'public',
    parameters: [{ name: ['value'], type: { library: 'owner', unit: 'value' }, required: true }],
    returns: { library: 'owner', unit: 'value' }, raises: [], wait: 'none', core: 'polyspec_consumer::relay',
  });
  return parts;
};

test('a value class of another repository converts through the core of its owner in Python, Node, PHP and WASM (T-3, U-1, GN-6x)', () => {
  const { contract, caseFiles, foreign } = valueClassSample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['php', 'python', 'node', 'wasm'] });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, path);
    // The owner's two core functions are the conversion, under names that carry the library.
    // GN-4c: the conversions of a unit of another library are functions of the module of that library.
    assert.match(lib, /\nmod library_owner \{\n[\s\S]*?\n {4}pub\(super\) fn in_value[(<]/, path);
    assert.match(lib, /library_owner::in_value\(/, path);
    assert.match(lib, /polyspec_owner::value_in\(&mut host, described\)/, path);
    assert.match(lib, /polyspec_owner::value_out\(/, path);
    // An instance of the owner's class is described by its in row, without opening it, and read by its read members.
    assert.match(lib, /HostValue::Value \{/, path);
    assert.doesNotMatch(lib, /no value class is read/, path);
    // B2.81: a text with an unpaired surrogate leaves as its UTF-16 code units, made by from_units, and any other text as
    // its text.
    assert.match(lib, /OutValue::Text16\(value\) =>/, path);
    assert.match(lib, /OutValue::Text\(value\) =>/, path);
    // B2.89: a string enters by one call of string_text as the text of the language, and only the none of a text with
    // an unpaired surrogate reads the code units that string_units gives.
    assert.match(lib, /"string" => \(ValueKind::Text, Some\(\("string_?[tT]ext", (?:true, )?ReadAs::TextOr\("string_?[uU]nits"(?:, true)?\)\)\)\),/, path);
    assert.doesNotMatch(lib, /ValueKind::Text16/, path);
    assert.match(lib, /ReadAs::TextOr\(units(?:, units_call)?\) => (?:match [^{\n]*)?\{/, path);
    assert.match(lib, /HostValue::Text\(HostText::Utf16\(/, path);
    assert.match(lib, /HostValue::Text\(HostText::Bytes\(/, path);
  }
  // B2.89: Python takes a str without a surrogate as its UTF-8 bytes, and WASM a string that isWellFormed.
  assert.match(text(out, 'packages/python/generated/lib.rs'), /if let Ok\(text\) = value\.cast::<PyString>\(\)\?\.to_str\(\) \{\n\s*return Ok\(HostValue::Text\(HostText::Bytes\(text\.as_bytes\(\)\.to_vec\(\)\)\)\);/);
  assert.match(text(out, 'packages/ts/wasm/generated/lib.rs'), /if text\.is_well_formed\(\) \{\n\s*return Ok\(HostValue::Text\(HostText::Bytes\(String::from\(text\)\.into_bytes\(\)\)\)\);/);
});

test('one host reads a value class without core_type and a value class of another repository (B-1, GN-6af, GN-6x)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const targets: Lang[] = ['python', 'node', 'wasm'];
  sample.units.push({
    id: 'boxed', name: ['boxed'], module: '', kind: 'class', visibility: 'public', origin: 'value', only: { targets, reason: 'the test of GN-6af' },
    members: [
      { id: 'boxed.constructor', name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [{ name: ['value'], type: { unit: 'data' }, default: { literal: null } }], raises: ['polyspec_sample::Error::Unsupported'], wait: 'none', core: 'polyspec_sample::check_boxed' },
      { id: 'boxed.value', name: ['value'], kind: 'property', visibility: 'public', returns: { unit: 'data' }, raises: [], wait: 'none', writable: true },
    ],
  });
  const data = sample.units.find((u: any) => u.id === 'data');
  data.out.push({ kind: 'reference', make: { php: 'null', python: 'boxed.constructor', node: 'boxed.constructor', go: 'null', wasm: 'boxed.constructor' } });
  for (const lang of targets) data.in.push({ [lang]: 'boxed', cases: [{ kind: 'reference', read: 'boxed.value' }] });
  const functions = sample.units.find((u: any) => u.kind === 'functions');
  functions.members.push({
    id: `${functions.id}.relay`, name: ['relay'], kind: 'function', visibility: 'public',
    parameters: [{ name: ['value'], type: { library: 'owner', unit: 'value' }, required: true }],
    returns: { library: 'owner', unit: 'value' }, raises: [], wait: 'none', core: 'polyspec_sample::relay',
  });
  const foreign = new Map([['owner', JSON.parse(readFileSync(new URL('./fixtures/value-class/owner.json', import.meta.url), 'utf8'))]]);
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), foreign, targets });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, path);
    // The host holds an instance of each sort under its own variant: the class of this contract with the number of its
    // read, the class of the other repository with the read member of its in case.
    assert.match(lib, /\n {4}Value\([^\n]*, usize\),\n {4}Foreign\([^\n]*Option<\(&'static str, bool, ReadAs\)>\),\n\}/, path);
    assert.match(lib, /handle: self\.hold\(Held::Foreign\(/, path);
    assert.match(lib, /HostValue::Value \{ kind: ValueKind::Reference, handle \}/, path);
    // describe knows both, and read gives the content of either: the member of the owner, or the kept value.
    assert.match(lib, /if let Some\(described\) = self\.value_class\(value(?:, object)?\)\? \{/, path);
    assert.match(lib, /fn read\(&mut self, value: Handle\) -> Result<HostValue, binding_core::Raised> \{\n(?: {8}let py = self\.py;\n)? {8}if let Some\(Held::Foreign\(\.\.\)\) = self\.held\.get\(handle_position\(value\.raw\(\)\)\) \{\n {12}return self\.read_value\(value\)\.map_err\([^\n]*\);\n {8}\}\n {8}let Some\(Held::Value\(object, read\)\) = /, path);
    assert.match(lib, /Some\(Held::Foreign\(object, Some\(read\)\)\) => /, path);
    assert.doesNotMatch(lib, /no value class is read|\/\*[A-Z]+\*\//, path);
    // Every host is made by its constructor, which sets each field.
    assert.doesNotMatch(lib, /(?:JsHost|PyHost) \{ (?:env|py|held)/, path);
  }
});

test('a glue name that a hand-written WASM case of tests/e2e calls is an export of the generated module (GN-4c, GN-14)', () => {
  // A hand-written case file reaches the WebAssembly module past the ES entry, by the names of its exports, which the
  // generator chooses: a name that the generator no longer exports fails the end-to-end run alone, as `glue.<name> is
  // not a function`.
  const root = new URL('../../../tests/e2e/', import.meta.url).pathname;
  const contracts = new Map<string, any>();
  for (const name of readdirSync(root)) {
    const path = join(root, name, 'packages/rust/interface.json');
    if (existsSync(path)) contracts.set(name, JSON.parse(readFileSync(path, 'utf8')));
  }
  let checked = 0;
  for (const [name, contract] of contracts) {
    const cases = join(root, name, 'cases.wasm.test.mjs');
    if (!existsSync(cases)) continue;
    const called = [...new Set([...readFileSync(cases, 'utf8').matchAll(/\bglue\.([A-Za-z_$][\w$]*)/g)].map((found) => found[1] ?? ''))];
    if (called.length === 0) continue;
    const caseFiles = new Map<string, unknown>([...new Set<string>((contract.cases ?? []).map((k: any) => k.file))].map((file) => [file, JSON.parse(readFileSync(join(root, name, file), 'utf8'))]));
    const foreign = new Map([...contracts].filter(([other]) => other !== name).map(([, other]) => [other.library as string, other]));
    const lib = text(generate({ contract, version: '0.0.0', coreLib: `polyspec_${contract.library.replaceAll('-', '_')}`, caseFiles, foreign, targets: ['wasm'] }), 'packages/ts/wasm/generated/lib.rs');
    // An export has the name of its attribute, or the name of its function when the attribute gives none.
    const exported = new Set<string>();
    for (const found of lib.matchAll(/#\[wasm_bindgen(?:\(([^\n]*)\))?\]\n(?:[ \t]*#\[[^\n]*\n)*[ \t]*pub (?:async )?fn ([A-Za-z_0-9]+)/g)) {
      exported.add(/\bjs_name = "([^"]+)"/.exec(found[1] ?? '')?.[1] ?? found[2] ?? '');
    }
    assert.ok(exported.size > 0, `${name}: the generated module exports nothing`);
    for (const glue of called) assert.ok(exported.has(glue), `tests/e2e/${name}/cases.wasm.test.mjs calls glue.${glue}, which the generated module of ${name} does not export`);
    checked += called.length;
  }
  assert.ok(checked > 0, 'no hand-written WASM case of tests/e2e calls a glue name, so this test checked nothing');
});

test('package.json and composer.json name the package of another library that the generated code imports or needs when it is loaded (GN-3e)', () => {
  // A value class of another library: the entries of the Node addon and of the WASM module import the npm package of
  // its owner, and the PHP extension makes the instances of the class of the owner's extension.
  const classes = valueClassSample();
  const owner = 'owner';
  const ownerContract = classes.foreign.get(owner);
  const npmName = ownerContract.packages.node.package;
  const phpName = ownerContract.packages.php.package;
  const crate = `polyspec-${owner}`;
  const manifests = (contract: any, foreign: Map<string, any>, line: unknown): { npm: any; composer: any } => {
    const out = trackedPackages(contract, '0.0.0', new Map<string, unknown>([...[...foreign.keys()].map((library): [string, unknown] => [`polyspec-${library}`, { path: `../../../${library}/packages/rust` }]), [crate, line]]), [], foreign);
    return { npm: JSON.parse(String(out.get('packages/ts/package.json'))), composer: JSON.parse(String(out.get('packages/php-ext/composer.json'))) };
  };
  // A development form of the dependency line of the core names the package without the version of a release.
  const development = manifests(classes.contract, classes.foreign, { path: `../../../${owner}/packages/rust` });
  assert.deepEqual(development.npm.dependencies, { [npmName]: '*' });
  assert.deepEqual(development.composer.require, { php: '>=8.4', [`ext-polyspec_${owner.replaceAll('-', '_')}`]: '*', [phpName]: '*' });
  // A release form, an exact version or a tag, names that version.
  const exact = manifests(classes.contract, classes.foreign, '=1.2.3');
  assert.deepEqual(exact.npm.dependencies, { [npmName]: '1.2.3' });
  assert.equal(exact.composer.require[phpName], '1.2.3');
  assert.equal(exact.composer.require[`ext-polyspec_${owner.replaceAll('-', '_')}`], '*');
  const tagged = manifests(classes.contract, classes.foreign, { git: `https://github.com/polyspec/${owner}.git`, tag: 'v0.4.0' });
  assert.deepEqual(tagged.npm.dependencies, { [npmName]: '0.4.0' });
  assert.equal(tagged.composer.require[phpName], '0.4.0');
  // A record of another library is a plain object of JavaScript, so no entry imports the package of its owner, and an
  // instance of the class of the owner's extension in PHP.
  const plot = plotSample();
  const records = trackedPackages(plot.contract, '0.0.0', new Map([['polyspec-points', { path: '../../../points/packages/rust' }]]), [], plot.foreign);
  assert.equal('dependencies' in JSON.parse(String(records.get('packages/ts/package.json'))), false);
  assert.deepEqual(JSON.parse(String(records.get('packages/php-ext/composer.json'))).require, { php: '>=8.4', 'ext-polyspec_points': '*', 'polyspec/points': '*' });
  // A contract that names no other library names none.
  const alone = trackedPackages(JSON.parse(readFileSync(new URL('../../../tests/e2e/classes/packages/rust/interface.json', import.meta.url), 'utf8')), '0.0.0');
  assert.equal('dependencies' in JSON.parse(String(alone.get('packages/ts/package.json'))), false);
  assert.deepEqual(JSON.parse(String(alone.get('packages/php-ext/composer.json'))).require, { php: '>=8.4' });
});

test('Go describes, reads and makes a value class of another repository through the call of GN-15c (T-3, U-1, GN-6x, GN-15c)', () => {
  const { contract, caseFiles, foreign } = valueClassSample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['go'] });
  // The Go type of the owner's class, from the package of its module in the owner's Go module.
  const pkg = text(out, 'packages/go/zz_generated_consumer.go');
  assert.match(pkg, /"github\.com\/polyspec\/owner\/packages\/go"/);
  assert.match(pkg, /^func Relay\(value_ \*owner\.Value\) \(\*owner\.Value, error\)/m);
  assert.match(pkg, /value0, _ = dec\.Value\(\)\.\(\*owner\.Value\)/);
  // The C ABI converts through the owner's two core functions; an instance is node 11, an error of the owner node 12,
  // and the content of an instance is the question read (op 2).
  const lib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(lib, /\nmod library_owner \{\n[\s\S]*?\n {4}pub\(super\) fn in_value\(/);
  assert.match(lib, /polyspec_owner::value_in\(&mut host, described\)/);
  assert.match(lib, /polyspec_owner::value_out\(/);
  assert.match(lib, /\[11\] => \{\n\s*let kind = match take\(input, 1\)\? \{/);
  assert.match(lib, /HostValue::Value \{ kind, handle: Handle::new\(uint_in\(input\)\?\) \}/);
  assert.match(lib, /\[12\] => \{\n\s*let call = uint_in\(input\)\?;\n\s*let index = uint_in\(input\)\?;\n\s*return Err\(Fail \{ raised: Some\(\(call, index\)\),/);
  assert.match(lib, /fn read\(&mut self, value: Handle\) -> Result<HostValue, Raised> \{\n\s*let mut values = self\.ask\(2, value, 0, 1\)\?;/);
  assert.doesNotMatch(lib, /Go gives no value of a value class/);
  // A core value leaves as node 11 with the number of the class and of its Go out row, then the content of the row.
  assert.match(lib, /OutValue::Null => \{\n\s*output\.push\(11\);\n\s*uint_out\(output, 0_u64\);\n\s*uint_out\(output, 0_u64\);\n\s*\}/);
  assert.match(lib, /OutValue::Text\(value\) => \{\n\s*output\.push\(11\);\n\s*uint_out\(output, 0_u64\);\n\s*uint_out\(output, 3_u64\);\n\s*text_out\(output, value\);/);
  // Package binding imports the owner's package, describes its instances by the in row and makes them by the out rows.
  const binding = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
  // Each node of a result has one number: the decoder is one switch, in which Go refuses a number that two cases name.
  const decoder = binding.slice(binding.indexOf('func (r *Reader) value('));
  const nodes = [...decoder.slice(0, decoder.indexOf('\n}\n')).matchAll(/^\tcase (\d+):$/gm)].map((found) => found[1]);
  assert.ok(nodes.includes('11') && nodes.includes('13'), `the decoder has no node of a value class or of a func: ${nodes.join(', ')}`);
  assert.deepEqual(nodes.filter((node, at) => nodes.indexOf(node) !== at), [], 'two cases of the decoder name one number');
  assert.match(binding, /"github\.com\/polyspec\/owner\/packages\/go"/);
  assert.match(binding, /case \*owner\.Value:\n\t\tif found == nil \{\n\t\t\treturn false\n\t\t\}\n\t\tkind, err := found\.Kind\(\)/);
  assert.match(binding, /case "object":\n\t\t\tc\.describeValue\(enc, 9, func\(\) \(any, error\) \{ return found\.Members\(\) \}, nil\)/);
  assert.match(binding, /case \*owner\.OrderedMap:\n\t\tif found == nil \{\n\t\t\treturn false\n\t\t\}\n\t\tentries, err := found\.Entries\(\)/);
  assert.match(binding, /case op == 2 && held\.read != nil:/);
  assert.match(binding, /value, err = owner\.ValueNull\(\)/);
  assert.match(binding, /value, err = owner\.ValueBoolean\(r\.Bool\(\)\)/);
  assert.match(binding, /value, err = owner\.ValueArray\(items\)/);
  assert.match(binding, /entries, failed := owner\.NewOrderedMap\(\)/);
  assert.match(binding, /entries\.Insert\(key, item\)/);
  assert.match(binding, /value, err = owner\.ValueObject\(entries\)/);
  // B2.89: the in case of a string is the kind text, whose read gives a text or, for a text with an unpaired surrogate,
  // a nil pointer, on which the units member gives the code units as node 13; the out row of the kind text16 makes the
  // instance from code units (B2.81).
  assert.match(binding, /case "string":\n\t\t\tc\.describeValue\(enc, 6, func\(\) \(any, error\) \{ return found\.StringText\(\) \}, func\(\) \(any, error\) \{ return found\.StringUnits\(\) \}\)/);
  assert.match(binding, /case "null":\n\t\tc\.describeValue\(enc, 0, nil, nil\)|case "null":\n\t\t\tc\.describeValue\(enc, 0, nil, nil\)/);
  assert.match(binding, /if text, _ := content\.\(\*string\); text != nil \{\n\t+content = \*text\n\t+\} else \{\n\t+content, err = held\.units\(\)\n\t+coded = true\n/);
  assert.match(binding, /\} else if coded \{\n(?:\t\t\t\/\/[^\n]*\n)*\t\t\tunits := reflect\.ValueOf\(content\)\n\t\t\tenc\.bytes = append\(enc\.bytes, 13\)/);
  assert.match(binding, /units\[at\] = r\.Uint\(\)\n\t\t\}\n\t\tvalue, err = owner\.ValueFromUnits\(units\)/);
  assert.match(lib, /\[6\] => ValueKind::Text,/);
  assert.match(lib, /\[13\] => \{\n(?:\s*\/\/[^\n]*\n)*\s*let len = uint_in\(input\)\?;/);
  assert.match(lib, /HostValue::Text\(HostText::Utf16\(units\)\)/);
  assert.match(lib, /OutValue::Text16\(value\) => \{\n\s*output\.push\(11\);\n\s*uint_out\(output, 0_u64\);\n\s*uint_out\(output, 4_u64\);\n\s*list_out\(output, value, \|output, unit\| uint_out\(output, u64::from\(unit\)\)\);/);
});

// B2.87: the relay of the end-to-end check, whose one function takes and gives the value class of json; the owner
// fixture under the name json stands for the contract of json.
const relaySample = (): { contract: any; caseFiles: Map<string, unknown>; foreign: Map<string, any> } => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const owner = readFileSync(new URL('./fixtures/value-class/owner.json', import.meta.url), 'utf8');
  return {
    contract: read('relay/packages/rust/interface.json'),
    caseFiles: new Map([['contracts/cases.json', read('relay/contracts/cases.json')]]),
    foreign: new Map([['json', JSON.parse(owner.replaceAll('owner', 'json').replaceAll('Owner', 'Json'))]]),
  };
};

test('the relay of the value class of json is generated for every target, Go included (B2.87, GN-6x, GN-15c)', () => {
  const { contract, caseFiles, foreign } = relaySample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_relay', caseFiles, foreign });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs']) {
    const lib = text(out, path);
    assert.match(lib, /polyspec_json::value_in\(&mut host, described\)/, path);
    assert.match(lib, /polyspec_json::value_out\(/, path);
    assert.match(lib, /polyspec_relay::carry\(/, path);
  }
  // U-3, GN-6x: the relay has no callback and no function type; PHP keeps the exception that a member of the owner of
  // the value class throws, which the call throws again.
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /enum Thrown \{\n {4}Php\(ZBox<ZendObject>\),\n {4}Binding\(Fail\),\n\}/);
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /Some\(Thrown::Php\(exception\)\) => match exception\.into_zval\(false\)/);
  const pkg = text(out, 'packages/go/zz_generated_relay.go');
  assert.match(pkg, /"github\.com\/polyspec\/json\/packages\/go"/);
  assert.match(pkg, /^func Carry\(value_ \*json\.Value\) \(\*json\.Value, error\)/m);
  // GN-15f: go.mod requires the Go module of json, whose package the binding imports, beside it by the path dependency.
  const goMod = String(trackedPackages(contract, '0.0.0', new Map([['polyspec-json', { path: '../../../json/packages/rust' }]]), [], foreign).get('packages/go/go.mod'));
  assert.match(goMod, /\nrequire github\.com\/polyspec\/json\/packages\/go v0\.0\.0\n\nreplace github\.com\/polyspec\/json\/packages\/go => \.\.\/\.\.\/\.\.\/json\/packages\/go\n$/);
});

// GN-6x, GN-13, GN-13b: the generated tests of the relay give carry an instance of the class of json, which the members
// of its out rows make through the package of json; the text of each of the five tests is read here, because a test
// that writes a built-in value in the place of the class raises no error of the generator.
const RELAY_TESTS = {
  python: 'packages/python/generated/tests/test_generated.py',
  node: 'packages/ts/generated/tests/generated.test.mjs',
  wasm: 'packages/ts/wasm/generated/tests/generated.test.mjs',
  php: 'packages/php-ext/generated/tests/GeneratedTest.php',
  go: 'packages/go/zz_generated_test.go',
} as const;

// GN-6as: the make functions of a generated crate, each from its header to the brace that ends it.
const makeFns = (lib: string): { name: string; body: string }[] =>
  [...lib.matchAll(/^( *)(?:pub\(super\) )?fn make_(\w+)[(<][^\n]*\n/gm)].map((found) => {
    const from = (found.index ?? 0) + found[0].length;
    return { name: found[2] ?? '', body: lib.slice(from, lib.indexOf(`\n${found[1] ?? ''}}\n`, from)) };
  });

test('PHP reads the value of an enum case of the owner of a value class from the table of its properties (GN-6x, B2.145)', () => {
  const { contract, caseFiles, foreign } = relaySample();
  const lib = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_relay', caseFiles, foreign, targets: ['php'] }), 'packages/php-ext/generated/lib.rs');
  // get_property of ext-php-rs fetches for writing, which PHP refuses for the readonly value of an enum case.
  assert.doesNotMatch(lib, /case\.get_property::<String>\("value"\)/);
  assert.match(lib, /Some\(case\) => match case\.get_properties\(\)\.map_err\(php_failed\)\?\.get\("value"\)\.map\(Zval::dereference\)\.and_then\(Zval::string\) \{/);
});

test('PHP describes the array that the read member of a list case gives as a list (GN-6x, B2.151)', () => {
  const { contract, caseFiles, foreign } = relaySample();
  const lib = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_relay', caseFiles, foreign, targets: ['php'] }), 'packages/php-ext/generated/lib.rs');
  // The walk of the owner reads the kind that the case names, so the items of value.items cross as HostValue::List.
  assert.match(lib, /"array" => \(ValueKind::List, Some\(\("items", ReadAs::Items\)\)\),/);
  assert.match(lib, /ReadAs::Items => self\.describe_items\(content, read\),/);
  assert.match(lib, /        Ok\(HostValue::List \{ handle: Handle::new\(HOST_OWNED \| handle_count\(self\.owned\.len\(\) - 1\)\), len \}\)$/m);
});

test('the make function of a value alias walks the value with a work stack and calls no conversion of the alias (GN-6as, B2.144)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const own = (name: string): Inputs => ({ contract: read(`${name}/packages/rust/interface.json`), caseFiles: new Map([['contracts/cases.json', read(`${name}/contracts/cases.json`)]]), version: '0.0.0', coreLib: `polyspec_${name}` });
  // A value class of another repository, a value alias, a value alias of another repository whose rows name classes of
  // its owner, and a value alias whose rows name value classes without core_type.
  const samples: Record<string, Inputs> = {
    relay: { ...relaySample(), version: '0.0.0', coreLib: 'polyspec_relay' },
    sample: own('sample'),
    consumer: { ...consumerSample(), version: '0.0.0', coreLib: 'polyspec_consumer' },
    kept: own('kept'),
  };
  // The targets whose make function is the walk; the other targets are not generated in this form yet (GN-6as).
  const libs = ['packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs'];
  for (const [sample, inputs] of Object.entries(samples)) {
    const out = generate(inputs);
    const found = libs.filter((path) => out.has(path));
    // The contracts of sample and consumer are not generated for WASM (BD-27).
    assert.deepEqual(found, sample === 'sample' || sample === 'consumer' ? libs.slice(0, 1) : libs, sample);
    for (const path of found) {
      const fns = makeFns(text(out, path));
      assert.ok(fns.length > 0, `${sample} ${path}: a make function`);
      for (const { name, body } of fns) {
        // The function names no make function, by its name or as a local, so no call of it runs inside another, and
        // it calls no conversion of the alias, which would call it.
        assert.doesNotMatch(body, /\bmake(_\w+)?\b/, `${sample} ${path}: make_${name} names a make function`);
        assert.doesNotMatch(body, new RegExp(`\\b(in|out)_${name}\\(`), `${sample} ${path}: make_${name} calls a conversion of its alias`);
        // A value with a container is walked by a loop over the levels whose children are not all made.
        assert.match(body, /\n\s+let mut levels(: Vec<OutLevel(<'\w+>)?>)? = Vec::new\(\);\n(.*\n)*?\s+loop \{\n/, `${sample} ${path}: make_${name} walks by a work stack`);
      }
    }
  }
});

test('a case value of a value class of another repository is the call of the make member of its owner in the five targets (GN-6x, GN-13, GN-13b)', () => {
  const { contract, caseFiles, foreign } = relaySample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_relay', caseFiles, foreign });
  const tests = Object.fromEntries(Object.entries(RELAY_TESTS).map(([target, path]) => [target, text(out, path)])) as Record<keyof typeof RELAY_TESTS, string>;
  for (const [target, file] of Object.entries(tests)) {
    // No case of carry is a test that fails by name: every kind that the contract of json carries is written.
    assert.doesNotMatch(file, /is not generated( for Go)? yet/, target);
    assert.doesNotMatch(file, /the case \w+ of relay\.carry/, target);
    assert.doesNotMatch(file, /a key of a keyed map in a case/, target);
  }
  // Python: the module of json is imported, and each kind is the static member of its out row.
  assert.match(tests.python, /^import polyspec\.json as foreign_json$/m);
  assert.match(tests.python, /def test_gn13e_carry_a_text\(self\) -> None:\n\s+pkg\.carry\(foreign_json\.Value\.string\("name\\xe9"\)\)/);
  assert.match(tests.python, /pkg\.carry\(foreign_json\.Value\.from_units\(\[55296\]\)\)/);
  assert.match(tests.python, /pkg\.carry\(foreign_json\.Value\.number\("123456789012345678901234567890"\)\)/);
  // A map fills the class that the member of its row takes: the constructor, an insert for each pair, a key that the
  // case writes as {kind, value} by its own kind, and the member on the filled instance.
  assert.match(tests.python, /pkg\.carry\(\(lambda filled: \(filled\.insert\(foreign_json\.Value\.from_units\(\[56320\]\), foreign_json\.Value\.null\(\)\), filled\.insert\(foreign_json\.Value\.string\("k"\), foreign_json\.Value\.from_units\(\[55296\]\)\), foreign_json\.Value\.object\(filled\),\)\[-1\]\)\(foreign_json\.OrderedMap\(\)\)\)/);
  assert.match(tests.python, /filled\.insert\(foreign_json\.Value\.string\("list"\), foreign_json\.Value\.array\(\[foreign_json\.Value\.boolean\(True\), foreign_json\.Value\.number\("-1\.5e3"\), foreign_json\.Value\.null\(\)\]\)\)/);
  // Node and WASM: the same members by their names of JavaScript, through the package of json and its subpath ./wasm.
  assert.match(tests.node, /^import \* as foreign_json from '@polyspec\/json';$/m);
  assert.match(tests.wasm, /^import \* as foreign_json from '@polyspec\/json\/wasm';$/m);
  for (const target of ['node', 'wasm'] as const) {
    assert.match(tests[target], /pkg\.carry\(foreign_json\.Value\.string\('name\\u00e9'\)\)/, target);
    assert.match(tests[target], /pkg\.carry\(foreign_json\.Value\.fromUnits\(\[55296\]\)\)/, target);
    assert.match(tests[target], /pkg\.carry\(foreign_json\.Value\.number\('123456789012345678901234567890'\)\)/, target);
    assert.match(tests[target], /pkg\.carry\(\(\(\) => \{ const filled = new foreign_json\.OrderedMap\(\); filled\.insert\(foreign_json\.Value\.fromUnits\(\[56320\]\), foreign_json\.Value\.null\(\)\); filled\.insert\(foreign_json\.Value\.string\('k'\), foreign_json\.Value\.fromUnits\(\[55296\]\)\); return foreign_json\.Value\.object\(filled\); \}\)\(\)\)/, target);
  }
  // PHP: the classes by the namespace of json.
  assert.match(tests.php, /\\Polyspec\\Relay\\carry\(\\Polyspec\\Json\\Value::string\("name\\xc3\\xa9"\)\)/);
  assert.match(tests.php, /\\Polyspec\\Relay\\carry\(\\Polyspec\\Json\\Value::fromUnits\(\[55296\]\)\)/);
  assert.match(tests.php, /\\Polyspec\\Relay\\carry\(\\Polyspec\\Json\\Value::number\("123456789012345678901234567890"\)\)/);
  assert.match(tests.php, /\(static function \(\) \{ \$filled = new \\Polyspec\\Json\\OrderedMap\(\); \$filled->insert\(\\Polyspec\\Json\\Value::fromUnits\(\[56320\]\), \\Polyspec\\Json\\Value::null\(\)\); \$filled->insert\(\\Polyspec\\Json\\Value::string\("k"\), \\Polyspec\\Json\\Value::fromUnits\(\[55296\]\)\); return \\Polyspec\\Json\\Value::object\(\$filled\); \}\)\(\)/);
  // Go: each value is a local of the test that a function of the Go module of json makes, and carry takes the local,
  // never a built-in value, which is no *json.Value.
  assert.match(tests.go, /"github\.com\/polyspec\/json\/packages\/go"/);
  assert.doesNotMatch(tests.go, /\bCarry\(("|nil\)|\[\]any|map\[string\]any|func\(\))/);
  assert.match(tests.go, /func TestGN13eCarryAText\(t \*testing\.T\) \{\n\tmade0, failure1 := json\.ValueString\("name\\u00e9"\)\n\tif failure1 != nil \{\n\t\tt\.Fatalf\("GN-13: %v", failure1\)\n\t\}\n\t_, err := Carry\(made0\)\n/);
  assert.match(tests.go, /made0, failure1 := json\.ValueFromUnits\(\[\]uint64\{55296\}\)\n/);
  assert.match(tests.go, /made0, failure1 := json\.ValueNumber\("123456789012345678901234567890"\)\n/);
  assert.match(tests.go, /func TestGN13eCarryAKeyWithAnUnpairedSurrogate\(t \*testing\.T\) \{\n\tmade0, failure1 := json\.NewOrderedMap\(\)\n[^]*?\tmade2, failure3 := json\.ValueFromUnits\(\[\]uint64\{56320\}\)\n[^]*?\tmade4, failure5 := json\.ValueNull\(\)\n[^]*?\t_, failure6 := made0\.Insert\(made2, made4\)\n\tif failure6 != nil \{\n\t\tt\.Fatalf\("GN-13: %v", failure6\)\n\t\}\n[^]*?\tmade\d+, failure\d+ := json\.ValueObject\(made0\)\n/);
  assert.match(tests.go, /json\.ValueArray\(\[\]\*json\.Value\{made\d+, made\d+, made\d+\}\)/);
});

test('a value class of another repository inside a list is made by the same members at each place (GN-6x, GN-13)', () => {
  const { contract, caseFiles, foreign } = relaySample();
  contract.units[0].members.push({ id: 'relay.gather', name: ['gather'], kind: 'function', visibility: 'public', parameters: [{ name: ['values'], type: { list: 'json_value' }, required: true }], returns: 'uint', raises: [], wait: 'none', core: 'polyspec_relay::gather' });
  contract.cases.push({ member: 'relay.gather', file: 'contracts/gather.json', group: 'gather' });
  caseFiles.set('contracts/gather.json', { gather: [{ id: 'three_values', values: [{ kind: 'text', value: 'a' }, { kind: 'null' }, { kind: 'bool', value: true }], result: 3 }] });
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_relay', caseFiles, foreign });
  for (const [target, path] of Object.entries(RELAY_TESTS)) assert.doesNotMatch(text(out, path), /the case \w+ of relay\.gather/, target);
  assert.match(text(out, RELAY_TESTS.python), /pkg\.gather\(\[foreign_json\.Value\.string\("a"\), foreign_json\.Value\.null\(\), foreign_json\.Value\.boolean\(True\)\]\)/);
  for (const target of ['node', 'wasm'] as const) {
    assert.match(text(out, RELAY_TESTS[target]), /pkg\.gather\(\[foreign_json\.Value\.string\('a'\), foreign_json\.Value\.null\(\), foreign_json\.Value\.boolean\(true\)\]\)/, target);
  }
  assert.match(text(out, RELAY_TESTS.php), /\\Polyspec\\Relay\\gather\(\[\\Polyspec\\Json\\Value::string\("a"\), \\Polyspec\\Json\\Value::null\(\), \\Polyspec\\Json\\Value::boolean\(true\)\]\)/);
  const go = text(out, RELAY_TESTS.go);
  assert.match(go, /\tmade0, failure1 := json\.ValueString\("a"\)\n[^]*?\tmade2, failure3 := json\.ValueNull\(\)\n[^]*?\tmade4, failure5 := json\.ValueBoolean\(true\)\n[^]*?Gather\(\[\]\*json\.Value\{made0, made2, made4\}\)/);
});

test('a library without kinds that takes a value class of another repository calls no conversion of a core error that it does not have (E-1c, GN-6x)', () => {
  const out = generate({ ...relaySample(), version: '0.0.0', coreLib: 'polyspec_relay' });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs']) {
    const lib = text(out, path);
    // The contract of relay names no kind, so no crate of it has the function core_error.
    assert.doesNotMatch(lib, /\nfn core_error\(/, path);
    assert.doesNotMatch(lib, /\bcore_error\(/, path);
    // The failure of the owner of the value class gives its Raised and its Callback to failure_error of this library,
    // whose kind is the unit that no member gives.
    if (!path.includes('/go/')) assert.match(lib, /binding_core::Failure::Kind\(\(\)\) => binding_error\((?:py, )?BindingError::Internal \{ detail: String::from\("E-1c: this library names no kind, so no call gives one"\) \}\),/, path);
  }
});

test('a generated crate holds no string with an escape that Rust does not know, and defines no name of a module twice (GN-6x, GN-6u)', () => {
  const inputs: Record<string, () => Map<string, string | Buffer>> = {
    consumer: () => generate({ ...consumerSample(), version: '0.0.0', coreLib: 'polyspec_consumer' }),
    plot: () => generate({ ...plotSample(), version: '0.0.0', coreLib: 'polyspec_plot' }),
    relay: () => generate({ ...relaySample(), version: '0.0.0', coreLib: 'polyspec_relay' }),
  };
  let crates = 0;
  for (const [name, make] of Object.entries(inputs)) {
    const out = make();
    for (const path of [...out.keys()].filter((p) => p.endsWith('/lib.rs'))) {
      crates += 1;
      const lib = text(out, path);
      // A string of Rust escapes a backslash, as the one of a PHP class name with its namespace.
      const code = lib.replace(/^\s*\/\/.*$/gm, '');
      const unknown = [...code.matchAll(/(?<!r)"(?:[^"\\\n]|\\.)*"/g)].map(([literal]) => literal).filter((literal) => /\\(?![nrt\\0"'xu{\n])/.test(literal.replaceAll('\\\\', '')));
      assert.deepEqual(unknown, [], `${name} ${path}`);
      // A const, a static and a static of thread_local! share the value namespace of the module.
      const names = [...code.matchAll(/^(?: {4})?(?:pub )?(?:const|static) ([A-Z][A-Z0-9_]*):/gm)].map(([, constant]) => String(constant));
      assert.deepEqual(names.filter((constant, i) => names.indexOf(constant) !== i), [], `${name} ${path}`);
    }
  }
  assert.ok(crates >= 14, String(crates));
});

test('the Go crate writes the numbers of a value class and of its out row as u64, which a bare literal is not (GN-6x, GN-15c)', () => {
  const lib = text(generate({ ...relaySample(), version: '0.0.0', coreLib: 'polyspec_relay' }), 'packages/go/internal/ffi/generated/lib.rs');
  // uint_out takes impl WideUint, for which a literal without a suffix is an i32, which is no unsigned integer.
  assert.deepEqual(lib.match(/uint_out\(output, \d+\);/g), null);
  assert.match(lib, /OutValue::Null => \{\n\s*output\.push\(11\);\n\s*uint_out\(output, 0_u64\);\n\s*uint_out\(output, 0_u64\);/);
});

test('a crate with a value class of another repository holds only what its in and out rows use (GN-6x, GN-6u, U-7)', () => {
  const hosts = ['packages/php-ext/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs'];
  const relay = generate({ ...relaySample(), version: '0.0.0', coreLib: 'polyspec_relay' });
  // The in cases of the fixture read a content and a text or its units, and none has the kind text16.
  for (const path of hosts) {
    const lib = text(relay, path);
    assert.match(lib, /\nenum ReadAs \{\n/, path);
    assert.doesNotMatch(lib, /ReadAs::Units|\n {4}Units,\n/, path);
    assert.match(lib, /\n {4}Content,\n/, path);
    assert.match(lib, /\n {4}TextOr\(/, path);
    assert.match(lib, /\n {12}ReadAs::TextOr\(/, path);
    assert.doesNotMatch(lib, /\/\*\}?(?:Content|Units|TextOr)\{?\*\//, path);
  }
  // An in case of the kind text16 constructs Units, and the fixture then reads no text or its units.
  const sample = relaySample();
  for (const row of sample.foreign.get('json').units.find((u: any) => u.id === 'value').in) {
    const string = row.cases.find((kase: any) => kase.is === 'string');
    string.kind = 'text16';
    string.read = string.units;
    delete string.units;
  }
  const units = generate({ ...sample, version: '0.0.0', coreLib: 'polyspec_relay' });
  for (const path of hosts) {
    const lib = text(units, path);
    assert.match(lib, /\n {4}Units,\n/, path);
    assert.match(lib, /\n {12}ReadAs::Units => /, path);
    assert.doesNotMatch(lib, /ReadAs::TextOr|\n {4}TextOr\(/, path);
  }
  // PHP makes a value class by the members of its owner, without the making of an alias of its own.
  assert.doesNotMatch(text(relay, 'packages/php-ext/generated/lib.rs'), /PhpMaking/);
  assert.match(text(generate({ ...consumerSample(), version: '0.0.0', coreLib: 'polyspec_consumer' }), 'packages/php-ext/generated/lib.rs'), /\nstruct PhpMaking \{\n/);
  // GN-6u: Python reads the object of a PyNative only where an out row gives a native value back; the field is _held,
  // the name of a field kept for its ownership, so the struct is the same text with and without such a row and carries
  // no allow.
  const held = /#\[derive\(Debug\)\]\nstruct PyNative \{\n(?: {4}\/\/[^\n]*\n)* {4}_held: Py<PyAny>,\n\}/;
  assert.match(text(relay, 'packages/python/generated/lib.rs'), held);
  assert.doesNotMatch(text(relay, 'packages/python/generated/lib.rs'), /allow\(dead_code/);
  const given = text(generate({ ...consumerSample(), version: '0.0.0', coreLib: 'polyspec_consumer' }), 'packages/python/generated/lib.rs');
  assert.match(given, /native\.downcast::<PyNative>\(\)/);
  assert.match(given, /object\._held\.clone_ref\(py\)/);
  assert.match(given, held);
});

test('a value class of another repository without core: {in, out} is refused by name (G-4, GN-6x)', () => {
  const { contract, caseFiles, foreign } = valueClassSample();
  delete foreign.get('owner').units.find((u: any) => u.id === 'value').core;
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign }),
    /owner\.value: a value class of another repository without core: \{in, out\} and core_type is not generated \(GN-6x\)/);
});

test('an error unit is the class of the kinds that name it, with the properties of the core error (E-2, I-3, GN-7a)', () => {
  const { contract, caseFiles, foreign } = consumerSample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign });
  // Python: a class of the category with read-only properties, which the extension writes from the core error.
  const errors = text(out, 'packages/python/generated/python/polyspec/consumer/_errors.py');
  assert.match(errors, /\nclass AbsentError\(ConsumerValueError\):\n/);
  assert.match(errors, /    @property\n    def key\(self\) -> str \| None:\n        return self\._key\n/);
  assert.match(errors, /    def length\(self\) -> int \| None:\n/);
  assert.match(errors, /__all__ = \[[^\]]*"AbsentError"\]/);
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /polyspec_consumer::Error::Absent \{ \.\. \} => "AbsentError",/);
  assert.match(python, /let value = polyspec_consumer::Error::key\(error\);\n    object\.setattr\("_key", text_out\(py, value\)\?\)\?;/);
  assert.match(python, /polyspec_consumer::Error::Absent \{ \.\. \} => absent_error_properties\(py, &raised, &error\),/);
  // Node: the class after the six of the categories, with properties that the addon defines read-only.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /polyspec_consumer::Error::Absent \{ \.\. \} => 6,/);
  assert.match(node, /let value0 = String::from\(polyspec_consumer::Error::key\(error\)\);/);
  assert.match(node, /read_only\(object, "length", property\)\?;/);
  assert.match(node, /B-4: 7 library classes/);
  const cjs = text(out, 'packages/ts/generated/index.cjs');
  assert.match(cjs, /\nclass AbsentError extends ConsumerValueError \{/);
  assert.match(cjs, /addon\.__register\(\[[^\]]*ConsumerInternalError, AbsentError\]\);/);
  assert.match(cjs, /module\.exports = \{[^}]*\bAbsentError\b/);
  assert.match(text(out, 'packages/ts/generated/index.mjs'), /export const \{[^}]*\bAbsentError\b/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export declare class AbsentError extends ConsumerValueError \{\n  readonly key: string;\n  readonly length: number \| null;\n\}/);
  // PHP: a final class that extends the class of the category; a property is a method that reads a private property.
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /ClassBuilder::new\("Polyspec\\\\Consumer\\\\AbsentError"\)\n        \.extends\(\(registered_class_0, "\\\\Polyspec\\\\Consumer\\\\ConsumerValueError"\)\)\n        \.flags\(ClassFlags::Final\)/);
  assert.match(php, /\.method\(FunctionBuilder::new\("key", absent_error_key_method\)\.returns\(DataType::String, false, true\), MethodFlags::Public\)/);
  assert.match(php, /with_scope\(registered_class\(6\), \|\| object\.set_property\("length", property\)\)/);
  assert.match(php, /let class = category_scope\(this\.get_class_entry\(\)\);/);
  assert.match(text(out, 'packages/php-ext/generated/polyspec_consumer.stub.php'), /final class AbsentError extends \\Polyspec\\Consumer\\ConsumerValueError\n    \{\n        public function key\(\): string\|null \{\}\n\n        public function length\(\): int\|null \{\}/);
  // B-4: the generated test of a raising case names the exact class.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /self\.assertIs\(type\(error\), pkg\.AbsentError\)/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /error\.constructor === pkg\.AbsentError &&/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /self::assertSame\(\\Polyspec\\Consumer\\AbsentError::class, \$error::class\);/);
});

test('a kind of a dependency that the core passes on is matched as the inner variant of its outer variant in every target (GN-7c, E-1b (a))', () => {
  const { contract, caseFiles, foreign } = consumerSample();
  const passed = 'polyspec_consumer::Error::Sample/polyspec_sample::Error::Unreadable';
  contract.errors.kinds.push({ variant: passed, library: 'sample' }, { variant: 'polyspec_consumer::Error::Sample/polyspec_sample::Error::Missing', library: 'sample' });
  // consumer.pair raises nothing else, so only the kind of the dependency makes its core fallible (E-1c).
  contract.units.find((u: any) => u.id === 'consumer').members.find((m: any) => m.id === 'consumer.pair').raises.push(passed);
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign });
  const pattern = 'polyspec_consumer::Error::Sample(polyspec_sample::Error::Unreadable { .. })';
  const arm = (path: string, value: string): void => assert.ok(text(out, path).includes(`        ${pattern} => ${value},`), `${path}: ${pattern} => ${value}`);
  // The class of the category io of sample's row, in this repository's table of E-2.
  // The generator refuses the WASM target of consumer for other items (TAKEN), so the four others are read.
  arm('packages/ts/generated/lib.rs', '2');
  arm('packages/python/generated/lib.rs', '"ConsumerIoError"');
  assert.ok(text(out, 'packages/php-ext/generated/lib.rs').includes(`        ${pattern} => `), 'php');
  assert.ok(text(out, 'packages/go/internal/ffi/generated/lib.rs').includes(`        ${pattern} => `), 'go');
  // GN-7b: the raises of a member is asserted by the same pattern.
  for (const path of ['packages/ts/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs']) {
    assert.ok(text(out, path).includes(`matches!(error, ${pattern})`), `${path}: the assertion of ${passed}`);
  }
  // The member that raises only a kind of the dependency calls a core that returns the core error.
  assert.match(text(out, 'packages/ts/generated/lib.rs'), /polyspec_consumer::pair\([^\n]*\) \{\n\s+Ok\(value\) => value,\n\s+Err\(error\) => return Err\(core_error\(error\)\),/);
});

// consumer.look takes the callback lookup of sample, which language code implements (T-3, U-3). The lookup of the
// sample recognizes an error unit (GN-6w), which a wrapper of a callback of another repository refuses by name (G-4),
// so the owner's contract of these tests is the sample without that recognition; `recognizing` keeps it.
const looking = (contract: any, foreign: Map<string, any>, recognizing = false): void => {
  if (!recognizing) for (const member of foreign.get('sample').units.find((u: any) => u.id === 'lookup').members) delete member.errors;
  contract.units.find((u: any) => u.id === 'consumer').members.push({
    id: 'consumer.look', name: ['look'], kind: 'function', visibility: 'public',
    parameters: [{ name: ['lookup'], type: { unit: 'lookup', library: 'sample' }, required: true }, { name: ['key'], type: 'text', required: true }],
    returns: { optional: 'text' }, optional_reason: 'U-3', raises: [], wait: 'none', core: 'polyspec_consumer::look',
  });
};

test('a callback unit of another repository is wrapped as its core trait, and the owning package declares its type (GN-6s, T-3)', () => {
  const { contract, caseFiles, foreign } = consumerSample();
  looking(contract, foreign);
  const out = generateTargets({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['php', 'python', 'node'] });
  // The trait methods return the failure of the core error of sample.
  for (const path of ['packages/ts/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    const rust = text(out, path);
    assert.match(rust, /impl(<'env>)? polyspec_sample::Lookup for CbLookup(<'env>)? \{/, path);
    assert.match(rust, /fn find\(&mut self, key: &str\) -> Result<Option<String>, binding_core::Failure<polyspec_sample::Error>>/, path);
    assert.match(rust, /fn in_lookup(<'env>)?\(/, path);
  }
  // No declaration of the unit: each declaration names the type of the owning package.
  const dts = text(out, 'packages/ts/generated/index.d.ts');
  assert.match(dts, /export declare function look\(lookup: import\("@polyspec\/sample"\)\.Lookup, key: string\): string \| null;/);
  assert.doesNotMatch(dts, /export interface Lookup/);
  const pyi = text(out, 'packages/python/generated/python/polyspec/consumer/_native.pyi');
  assert.match(pyi, /^from polyspec\.sample import [^\n]*Lookup as Lookup/m);
  assert.match(pyi, /def look\(lookup: Lookup, key: str\) -> str \| None: \.\.\./);
  assert.doesNotMatch(text(out, 'packages/python/generated/python/polyspec/consumer/_types.py'), /class Lookup\(Protocol\)/);
  const stub = text(out, 'packages/php-ext/generated/polyspec_consumer.stub.php');
  assert.match(stub, /@param \\Polyspec\\Sample\\Lookup \$lookup/);
  assert.doesNotMatch(stub, /interface Lookup/);
});

test('a callback unit of another repository is refused by name in Go and WASM, and where its name is a unit of the contract (GN-6s, G-4)', () => {
  const { contract, caseFiles, foreign } = consumerSample();
  looking(contract, foreign);
  for (const target of ['go', 'wasm'] as const) {
    assert.throws(() => generateTargets({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: [target] }), /consumer\.look\.lookup: a callback unit lookup of sample is not generated yet in (go|wasm) \(GN-6s\)/, target);
  }
  // GN-6w, G-4: a member of the callback that recognizes an error unit is refused by name.
  const recognizes = consumerSample();
  looking(recognizes.contract, recognizes.foreign, true);
  assert.throws(() => generateTargets({ contract: recognizes.contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles: recognizes.caseFiles, foreign: recognizes.foreign, targets: ['node'] }), /lookup\.find: recognized callback errors are not generated yet/);
  const named = structuredClone(contract);
  named.units.find((u: any) => u.id === 'holder').id = 'lookup';
  named.units.find((u: any) => u.id === 'lookup').name = ['lookup'];
  assert.throws(() => generateTargets({ contract: named, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['node'] }), /consumer\.look\.lookup: the callback unit lookup of sample has the name of a unit of this contract \(GN-6s\)/);
});

test('a callback unit of another repository carries language code, so a member that waits and takes it reaches language code (GN-6s, GN-6h, GN-6q, GN-6n)', () => {
  const waiting = (wait: string): Map<string, string | Buffer> => {
    const { contract, caseFiles, foreign } = consumerSample();
    looking(contract, foreign);
    contract.units.find((u: any) => u.id === 'consumer').members.find((m: any) => m.id === 'consumer.look').wait = wait;
    return generateTargets({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['node'] });
  };
  // GN-6q: a member with blocking_io that takes it runs on the JavaScript thread, which owns the callback object.
  const node = text(waiting('blocking_io'), 'packages/ts/generated/lib.rs');
  const entry = node.slice(node.indexOf('pub fn function_look<'), node.indexOf('\n}\n', node.indexOf('pub fn function_look<')));
  assert.match(entry, /polyspec_consumer::look\(binding_core::Io::for_generated_call\(\), &mut \{ lookup \}, &key\)/);
  assert.doesNotMatch(entry, /waiting\(env/);
  // GN-6ab: a member with async_driver that takes it reaches language code, so it names machine: true in its core and
  // is refused by name without it.
  assert.throws(() => waiting('async_driver'), /consumer\.look: a member with wait async_driver that reaches language code names machine: true in its core \(GN-6ab, CK-68\)/);
});

test('a method call of the name of a helper does not use the helper, in every target (GN-4)', () => {
  const block = `
/// T-5: keeps a value in a table.
fn insert<T>(table: &Mutex<Table<T>>, value: T) -> u64 {
    0
}

/// The guard of a mutex.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock()
}`;
  // A method of a map, of a guard or of a table of the made values names no helper.
  assert.equal(usedHelpers(block, 'map.insert(key, value); made.insert(handle.raw(), made.len());'), '');
  assert.doesNotMatch(usedHelpers(block, 'lock(&THROWN).insert(handle, error);'), /fn insert/);
  assert.match(usedHelpers(block, 'lock(&THROWN).insert(handle, error);'), /fn lock/);
  // A call or a passing of the helper by its name uses it.
  assert.match(usedHelpers(block, 'let handle = insert(&TABLE, value);'), /fn insert/);
  assert.match(usedHelpers(block, 'items.map(insert)'), /fn insert/);
  // The Go C ABI of consumer, which has a callback unit and no class unit, has no table helper.
  const { contract, caseFiles, foreign } = consumerSample();
  const out = generateTargets({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['go'] });
  const ffi = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(ffi, /lock\(&THROWN\)\.insert\(key, error\);/);
  assert.doesNotMatch(ffi, /fn insert(_held)?</);
});

test('a property of an error unit that raises raises in place of the error, and a property is a list of text (GN-7a, I-3)', () => {
  const { contract, caseFiles, foreign } = consumerSample();
  contract.errors.kinds.push({ variant: 'polyspec_consumer::Error::Internal', category: 'internal' });
  const unit = contract.units.find((u: any) => u.id === 'absent_error');
  unit.members[0].raises = ['polyspec_consumer::Error::Internal'];
  unit.members.push({ id: 'absent_error.trace', name: ['trace'], kind: 'property', visibility: 'public', returns: { list: 'text' }, wait: 'none', raises: [], core: { path: 'polyspec_consumer::Error::trace', receiver: '&self' } });
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['php', 'python', 'node', 'go', 'wasm'] });
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /let value = match polyspec_consumer::Error::key\(error\) \{ Ok\(value\) => value, Err\(failure\) => return Err\(core_error\(py, failure\)\) \};/);
  assert.match(python, /let value = polyspec_consumer::Error::trace\(error\);\n    object\.setattr\("_trace", list_out\(py, value, /);
  assert.match(text(out, 'packages/python/generated/python/polyspec/consumer/_errors.py'), /    def trace\(self\) -> list\[str\] \| None:\n/);
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /fn absent_error_properties\(error: &polyspec_consumer::Error\) -> Result<Properties, Fail> \{/);
  assert.match(node, /let value0 = String::from\(match polyspec_consumer::Error::key\(error\) \{ Ok\(value\) => value, Err\(failure\) => return Err\(core_error\(failure\)\) \}\);/);
  assert.match(node, /let value2 = polyspec_consumer::Error::trace\(error\)\.into_iter\(\)\.map\(\|item\| String::from\(AsRef::<str>::as_ref\(&item\)\)\)\.collect::<Vec<String>>\(\);/);
  assert.match(node, /polyspec_consumer::Error::Absent \{ \.\. \} => match absent_error_properties\(&error\) \{\n            Ok\(properties\) => Some\(Box::new\(properties\)\),\n            Err\(fail\) => return fail,\n        \},/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /  readonly trace: readonly \(string\)\[\];\n\}/);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /let value = match polyspec_consumer::Error::key\(error\) \{ Ok\(value\) => value, Err\(failure\) => return Err\(core_error\(failure\)\) \};/);
  assert.match(php, /\.method\(FunctionBuilder::new\("trace", absent_error_trace_method\)\.returns\(DataType::Array, false, true\), MethodFlags::Public\)/);
  assert.match(text(out, 'packages/php-ext/generated/polyspec_consumer.stub.php'), /        \/\*\* @return list<string>\|null \*\/\n        public function trace\(\): array\|null \{\}/);
  const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /text_out\(match polyspec_consumer::Error::key\(&error\) \{ Ok\(value\) => value, Err\(failure\) => return core_error\(failure\) \}\)/);
  assert.match(wasm, /\("trace", list_out\(polyspec_consumer::Error::trace\(&error\), /);
  const goRust = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(goRust, /text_out\(output, match polyspec_consumer::Error::key\(&error\) \{ Ok\(value\) => value, Err\(failure\) => return core_error\(failure\) \}\);/);
  assert.match(text(out, 'packages/go/internal/binding/zz_generated_binding.go'), /func \(e \*AbsentError\) Trace\(\) \[\]string \{ return e\.pTrace \}/);
});

test('an error unit extends its parent, and what is not generated is refused by name (E-2, P-4, G-4, GN-7a)', () => {
  const generated = (change: (contract: any) => void): Map<string, string | Buffer> => {
    const { contract, caseFiles, foreign } = consumerSample();
    change(contract);
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign });
  };
  const unit = (contract: any): any => contract.units.find((u: any) => u.id === 'absent_error');
  // A parent that the contract lists after its child is registered first, and its properties are the child's too.
  const out = generated((contract) => {
    unit(contract).parent = 'missing_error';
    const [key] = unit(contract).members.splice(0, 1);
    contract.units.push({ id: 'missing_error', name: ['missing', 'error'], module: '', kind: 'error', visibility: 'public', origin: 'generated', category: 'value', members: [{ ...key, id: 'missing_error.key' }] });
  });
  const errors = text(out, 'packages/python/generated/python/polyspec/consumer/_errors.py');
  assert.ok(errors.indexOf('class MissingError(ConsumerValueError):') < errors.indexOf('class AbsentError(MissingError):'));
  assert.ok(errors.indexOf('class MissingError(') > 0);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.ok(php.indexOf('ClassBuilder::new("Polyspec\\\\Consumer\\\\MissingError")') < php.indexOf('ClassBuilder::new("Polyspec\\\\Consumer\\\\AbsentError")'));
  assert.match(php, /\.extends\(\(registered_class_6, "\\\\Polyspec\\\\Consumer\\\\MissingError"\)\)/);
  assert.match(php, /with_scope\(registered_class\(6\), \|\| object\.set_property\("key", property\)\)[^]*with_scope\(registered_class\(7\), \|\| object\.set_property\("length", property\)\)/);
  assert.match(text(out, 'packages/ts/generated/index.cjs'), /class MissingError extends ConsumerValueError \{[^]*class AbsentError extends MissingError \{/);
  const refused = (change: (contract: any) => void, message: RegExp): void =>
    assert.throws(() => generated(change), (error: Error) => error.constructor.name === 'Unsupported' && message.test(error.message), String(message));
  refused((contract) => { unit(contract).members[0].kind = 'method'; }, /absent_error\.key: a method of an error unit is not generated yet/);
  refused((contract) => { unit(contract).members[0].returns = { list: 'int' }; }, /absent_error\.key: a property of an error unit of type \{"list":"int"\} is not generated yet/);
  // GN-7a: a variant of the raises of a property is a kind whose class is no unit with a property that raises.
  refused((contract) => { unit(contract).members[0].raises = ['polyspec_consumer::Error::Other']; }, /absent_error\.key: the variant polyspec_consumer::Error::Other of its raises is no kind of errors\.kinds \(GN-7a\)/);
  refused((contract) => { unit(contract).members[0].raises = ['polyspec_consumer::Error::Absent']; }, /absent_error\.key: the kind polyspec_consumer::Error::Absent of its raises has the class absent_error, which has a property that raises \(GN-7a\)/);
  refused((contract) => { unit(contract).members[0].core = 'polyspec_consumer::Error::key'; }, /absent_error\.key: a property of an error unit names a function of the core error with the receiver &self/);
  refused((contract) => { unit(contract).members[1].name = ['kind']; }, /absent_error: the property kind is declared twice/);
  refused((contract) => { unit(contract).category = 'io'; }, /polyspec_consumer::Error::Absent: the class absent_error is not an error unit of category value \(E-2\)/);
  // E-1b (a): a row that passes on the kind of another library names the variant of the core error that holds it, and a
  // row of its own names none (GN-7c).
  refused((contract) => { contract.errors.kinds.push({ variant: 'polyspec_sample::Error::Unreadable', library: 'sample' }); }, /polyspec_sample::Error::Unreadable: a kind of another library names the variant of the core error that holds it, <outer>\/<inner> \(GN-7c\)/);
  refused((contract) => { contract.errors.kinds.push({ variant: 'polyspec_consumer::Error::Sample/polyspec_sample::Error::Unreadable', category: 'io' }); }, /polyspec_consumer::Error::Sample\/polyspec_sample::Error::Unreadable: a kind of this library names no inner variant \(GN-7c\)/);
  // E-2, E-7: in Go an error unit is a struct that embeds its parent, whose Unwrap gives the parent, so errors.As finds
  // the category type and the parent unit; its properties are methods.
  const go = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
  assert.match(go, /type AbsentError struct \{\n\t\*MissingError\n/);
  assert.match(go, /func \(e \*AbsentError\) Unwrap\(\) error \{ return e\.MissingError \}/);
});

test('a class that no parameter takes has no conversion in, which would copy its value (T-5)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const caseFiles = sampleCases();
  const paths = ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs'];
  const taken = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  for (const path of paths) assert.match(text(taken, path), /\nfn in_tag[(<]/, path);
  const owner = sample.units.find((u: any) => u.id === 'sample');
  owner.members = owner.members.filter((m: any) => !['sample.join', 'sample.shout'].includes(m.id));
  sample.cases = [];
  const kept = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  for (const path of paths) assert.doesNotMatch(text(kept, path), /\nfn in_tag[(<]/, path);
});

test('a stringify and a to_json are the hooks of each language, and never and only are generated (N-4, GN-6g)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /#\[php\(name = "__toString"\)\]/);
  assert.match(php, /#\[php\(name = "jsonSerialize"\)\]/);
  // PHP gives Stringable to a class that has __toString and refuses the interface a second time.
  assert.doesNotMatch(php, /stringable/i);
  assert.match(php, /#\[php\(implements\(ce = json_serializable, stub = "\\\\JsonSerializable"\)\)\]/);
  // T-1 never: the core's Infallible has no value.
  assert.match(php, /match result \{\}/);
  const stub = text(out, 'packages/php-ext/generated/polyspec_sample.stub.php');
  assert.match(stub, /final class Tag implements \\IteratorAggregate, \\Stringable, \\JsonSerializable/);
  assert.match(stub, /public function jsonSerialize\(\): never \{\}/);
  const phpTests = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(phpTests, /assertInstanceOf\(\\Stringable::class, new \\Polyspec\\Sample\\Tag\("a"\)\)/);
  assert.match(phpTests, /assertSame\("#a", \(string\) new \\Polyspec\\Sample\\Tag\("a"\)\)/);
  // GN-13f: the receiver of the case that raises is made before the call that must fail.
  assert.match(phpTests, /\$receiver = new \\Polyspec\\Sample\\Tag\("a"\);\n {8}try \{\n {12}\\json_encode\(\$receiver\);/);
  assert.doesNotMatch(phpTests, /testG7TagTo(String|Json)/);
  // Q-4 only: to_json names php and node, and Python has no JSON hook.
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /fn __str__</);
  assert.doesNotMatch(python, /host_json/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /assertEqual\(str\(pkg\.Tag\("a"\)\), "#a"\)/);
  // A Node hook is the addon's method under its own name: JSON.stringify passes the key to toJSON.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /#\[napi\(js_name = "toString", enumerable = false\)\]/);
  assert.match(node, /#\[napi\(js_name = "toJSON", enumerable = false\)\]/);
  assert.doesNotMatch(text(out, 'packages/ts/generated/index.cjs'), /toJSON|toString\(\.\.\.args\)/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /toString\(\): string;\n {2}toJSON\(\): never;/);
  const nodeTests = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(nodeTests, /assert\.equal\(String\(new pkg\.Tag\('a'\)\), '#a'\)/);
  assert.match(nodeTests, /const receiver = new pkg\.Tag\('a'\);\n {2}assert\.throws\(\(\) => JSON\.stringify\(receiver\)/);
  // GN-15a: a Go to_json is MarshalJSON of json.Marshaler over the unexported toJSON, and a never return gives the
  // error alone; the B-4 test calls toJSON.
  const go = text(out, 'packages/go/zz_generated_sample.go');
  assert.match(go, /\nfunc \(this \*Tag\) toJSON\(\) error \{\n/);
  assert.match(go, /\nfunc \(this \*Tag\) MarshalJSON\(\) \(\[\]byte, error\) \{\n\treturn nil, this\.toJSON\(\)\n\}\n/);
  assert.match(text(out, 'packages/go/internal/ffi/generated/lib.rs'), /host_json\([^]*?\n +match result \{\}\n/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /\.toJSON\(\)/);
  // G-4: what N-4 does not allow is refused by name.
  const refused = (change: (members: any[]) => void, message: RegExp): void => {
    const contract = structuredClone(sample);
    change(contract.units.find((u: any) => u.id === 'tag').members);
    assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() }), message);
  };
  const special = (members: any[], kind: string): any => members.find((m: any) => m.kind === kind);
  refused((members) => members.push({ ...special(members, 'stringify'), id: 'tag.again' }), /tag: a class has one stringify \(N-4\)/);
  refused((members) => { special(members, 'stringify').returns = 'uint'; }, /a stringify returns text \(N-4\)/);
  refused((members) => { special(members, 'to_json').raises = []; }, /a never return without raises/);
});

test('a case gives a callback parameter as a fixture, which the B-4 test runs and reads (G-5, GN-13)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(python, /\ndef _fixture\(members, rows\):/);
  assert.match(python, /fixture_0, fixture_0_unexpected, fixture_0_calls = _fixture\(\("find",\), \[\("find", \("a",\), None, False, None\)\]\)\n {8}with self\.assertRaises\(pkg\.SampleValueError\) as caught:\n {12}pkg\.resolve\(fixture_0, "a"\)/);
  assert.match(python, /self\.assertEqual\(fixture_0_unexpected, \[\]\)\n {8}self\.assertEqual\(fixture_0_calls, \[\("find", \("a",\)\)\]\)/);
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(node, /\nfunction fixture\(members, rows\) \{/);
  assert.match(node, /const fixture0 = fixture\(\['find'\], \[\['find', \['a'\], null, false, null\]\]\);\n {2}assert\.throws\(\(\) => pkg\.resolve\(fixture0\.object, 'a'\)/);
  assert.match(node, /assert\.deepEqual\(fixture0\.unexpected, \[\]\);\n {2}assert\.deepEqual\(fixture0\.calls, \[\['find', \['a'\]\]\]\);/);
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(php, /\$fixture0 = new class\(\[\["find", \["a"\], null, false, null\]\]\) \{/);
  assert.match(php, /public function find\(mixed \.\.\.\$args\): mixed \{ return \$this->answer\("find", \$args\); \}/);
  assert.match(php, /self::assertSame\(\[\], \$fixture0->unexpected\);\n {8}self::assertSame\(\[\["find", \["a"\]\]\], \$fixture0->calls\);/);
  assert.match(php, /\nfinal class UnexpectedCall extends \\LogicException\n/);
  // A module without a fixture holds no fixture code.
  const { contract, caseFiles } = load();
  const plain = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  assert.doesNotMatch(text(plain, 'packages/ts/generated/tests/generated.test.mjs'), /fixture|isDeepStrictEqual/);
  assert.doesNotMatch(text(plain, 'packages/python/generated/tests/test_generated.py'), /_fixture/);
  assert.doesNotMatch(text(plain, 'packages/php-ext/generated/tests/GeneratedTest.php'), /UnexpectedCall/);
  // G-4: a row that the fixture cannot run yet is refused by name; a case without the fixture by its id.
  const withRow = (row: unknown): (() => unknown) => () => {
    const cases = sampleCases();
    const document = cases.get('contracts/cases.json') as Record<string, any[]>;
    document['resolve'] = [{ ...document['resolve']?.[0], lookup: row }];
    return generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: cases });
  };
  assert.throws(withRow({ callback: { 'lookup.find': [{ args: { key: 'a' }, raise: { error: 'x', kind: 'y' } }] } }), /the raise row names x, which is no error unit that is generated \(GN-13\)/);
  assert.throws(withRow({ callback: { 'lookup.find': [{ args: { key: 'a' }, result: null, async: true }] } }), /an async row of a callback fixture is not generated yet/);
  assert.throws(withRow('a'), /the case a_key_without_a_value_is_missing of sample\.resolve gives no \{"callback": \.\.\.\} for lookup/);
});

test('WASM: map<T> is a Map of string keys, which the module builds (T-2, GN-18)', () => {
  const { contract, caseFiles } = load();
  contract.targets = ['node', 'wasm'];
  contract.packages.node.entries['.'].conditions = { node: 'napi', browser: 'wasm' };
  for (const row of Object.values(contract.errors.classes) as Record<string, string>[]) {
    row['wasm'] = row['node'] ?? '';
    delete row['php'];
    delete row['python'];
  }
  contract.errors.fixed = contract.errors.fixed.filter((f: { lang: string }) => f.lang === 'node');
  contract.units[0].members[0].returns = { map: 'text' };
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  assert.match(text(out, 'packages/ts/wasm/generated/lib.rs'), /fn map_out<T>\(value: impl Borrow<binding_core::OrderedMap<T>>/);
  assert.match(text(out, 'packages/ts/wasm/generated/lib.rs'), /let entries = js_sys::Map::new\(\);\n    for \(key, value\) in value\.borrow\(\)\.iter\(\) \{\n        entries\.set\(&text_out\(key\)\?, &item\(value\)\?\);/);
  assert.doesNotMatch(text(out, 'packages/ts/wasm/generated/index.mjs'), /fromEntries/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.d.ts'), /ReadonlyMap<string, string>/);
});

test('a class with a write place holds its value in a tried lock, which each call takes for its places (B-5c, GN-6h)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  const libs = { python: text(out, 'packages/python/generated/lib.rs'), node: text(out, 'packages/ts/generated/lib.rs'), php: text(out, 'packages/php-ext/generated/lib.rs') };
  for (const [lang, lib] of Object.entries(libs)) {
    // A write place and no &self member that reaches language code: the mutex. A &self member that takes a callback:
    // the read-write lock, whose core type is Sync. No write place and a value that comes in: the read-write lock.
    assert.match(lib, /inner: binding_core::Exclusive<polyspec_sample::Counter>,/, lang);
    assert.match(lib, /inner: binding_core::Shared<polyspec_sample::Ledger>,/, lang);
    assert.match(lib, /inner: binding_core::Shared<polyspec_sample::Tag>,/, lang);
    assert.match(lib, /sync::<polyspec_sample::Ledger>\(\);/, lang);
    assert.match(lib, /sync::<polyspec_sample::Tag>\(\);/, lang);
    assert.doesNotMatch(lib, /sync::<polyspec_sample::Counter>/, lang);
    // The receiver &mut self writes and &self reads; a parameter of the class reads, and the core borrows the guards.
    assert.match(lib, /let mut receiver = self\.inner\.write\("Counter"\)\.map_err\([^\n]*\)\?;\n\s+let receiver = &mut \*receiver;\n\s+let result = with_faults\("counter\.add", \|\| polyspec_sample::Counter::add\(receiver, amount\)\);/, lang);
    assert.match(lib, /let receiver = self\.inner\.read\("Counter", &\[\]\)\.map_err\([^\n]*\)\?;\n\s+let receiver = &\*receiver;\n\s+let result = with_faults\("counter\.total", \|\| polyspec_sample::Counter::total\(receiver\)\);/, lang);
    assert.match(lib, /let other = held_counter\([^\n]*\)\?;\n\s+let mut receiver = self\.inner\.write\("Counter"\)[^\n]*\n\s+let other = other\.read\("Counter", &\[\]\)[^\n]*\n\s+let receiver = &mut \*receiver;\n\s+let other = &\*other;\n\s+let \(\): \(\) = with_faults\("counter\.absorb", \|\| polyspec_sample::Counter::absorb\(receiver, CoreForm::core_form\(other\)\)\);/, lang);
    assert.match(lib, /let tag = tag\.read\("Tag", &\[\]\)[^\n]*\n\s+let tag = &\*tag;\n\s+let result = with_faults\("sample\.shout", \|\| polyspec_sample::shout\(CoreForm::core_form\(tag\)\)\);/, lang);
    // A value inside another type is read, cloned and released by the conversion in.
    assert.match(lib, /fn in_tag[^\n]*\n(?:[^\n]*\n){1,4}?[^\n]*inner\.read\("Tag", &\[\]\) \{\n\s+Ok\(held\) => Ok\(\(\*held\)\.clone\(\)\),/, lang);
    assert.doesNotMatch(lib, /fn in_counter/, lang);
    // GN-5: the poison entry point takes the write guard of each class with a write place and panics.
    assert.match(lib, /#\[cfg\(feature = "panic-test"\)\]\n[^\n]*\n(?:[^\n]*\n)?(?:pub )?fn _?panic_test_held\(/, lang);
    assert.match(lib, /let _held = [a-z.()]+\.inner\.write\("Counter"\)[^\n]*\n\s+panic!\("panic-test"\);/, lang);
    assert.match(lib, /let _held = [a-z.()]+\.inner\.write\("Ledger"\)/, lang);
    assert.doesNotMatch(lib, /inner\.write\("Tag"\)/, lang);
  }
  assert.match(libs.node, /#\[napi\(js_name = "__panicTestHeld"\)\]/);
  assert.match(libs.php, /#\[php\(name = "Polyspec\\\\Sample\\\\Internal\\\\panicTestHeld"\)\]/);
  // napi-rs refuses a reference that the body of a call makes, so a class value is unwrapped by its type tag.
  assert.match(libs.node, /<ClassInstance<'_, class_counter::Counter> as FromNapiValue>::from_napi_value/);
  assert.doesNotMatch(libs.node, /<&class_/);
  // G-5: a poisoned object is kind internal at every place, and an instance at a write place and another is busy.
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(python, /def test_b5c_counter_refuses_a_poisoned_object\(self\) -> None:\n {8}held = pkg\.Counter\(0\)\n[^\n]*\n {12}_native\._panic_test_held\(held\)\n(?:[^\n]*\n){3} {12}held\.total\n(?:[^\n]*\n){3} {12}pkg\.Counter\(0\)\.absorb\(held\)\n/);
  assert.match(python, /def test_b5c_counter_absorb_refuses_the_instance_at_two_places\(self\) -> None:\n {8}held = pkg\.Counter\(0\)\n {8}with self\.assertRaises\(pkg\.SampleBusyError\) as caught:\n {12}held\.absorb\(held\)\n(?:[^\n]*\n){2} {8}held\.total\n/);
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(node, /test\('B-5c: Ledger refuses a poisoned object', \(\) => \{\n {2}const held = new pkg\.Ledger\('a'\);\n {2}assert\.throws\(\(\) => addon\(\)\.__panicTestHeld\(held\), [^\n]*error\.kind === 'internal'\);\n {2}assert\.throws\(\(\) => held\.size, /);
  assert.match(node, /assert\.throws\(\(\) => held\.absorb\(held\), \(error\) => error\.constructor === pkg\.SampleBusyError && error\.kind === 'busy'\);\n {2}held\.total;/);
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(php, /public function testB5cCounterRefusesAPoisonedObject\(\): void\n {4}\{\n {8}\$held = new \\Polyspec\\Sample\\Counter\(0\);\n {8}try \{\n {12}\\Polyspec\\Sample\\Internal\\panicTestHeld\(\$held\);/);
  assert.match(php, /\$held->absorb\(\$held\);\n {12}self::fail\('no error'\);\n {8}\} catch \(\\Polyspec\\Sample\\SampleBusyError \$error\)/);
  // A class that meets no condition of GN-6h holds its value without a lock.
  const owner = sample.units.find((u: any) => u.id === 'sample');
  owner.members = owner.members.filter((m: any) => !['sample.join', 'sample.shout'].includes(m.id));
  sample.cases = sample.cases.filter((c: any) => !['sample.join', 'sample.shout'].includes(c.member));
  const plain = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    assert.match(text(plain, path), /inner: polyspec_sample::Tag,/, path);
    assert.match(text(plain, path), /polyspec_sample::Tag::name\(&self\.inner\)/, path);
  }
});

test('the classes that carry language code are the least set of both definitions (GN-6h)', () => {
  const method = (id: string, parameters: unknown[], returns?: unknown): any => ({ id, name: [id], kind: 'method', visibility: 'public', parameters, ...(returns === undefined ? {} : { returns }), core: { path: `x::${id}`, receiver: '&self' } });
  const cls = (id: string, members: unknown[]): any => ({ id, name: [id], module: '', kind: 'class', visibility: 'public', origin: 'generated', members });
  const param = (type: unknown): any => ({ name: ['value'], type, required: true });
  const units: any[] = [
    { id: 'hook', name: ['hook'], module: '', kind: 'interface', visibility: 'public', origin: 'callback', members: [] },
    { id: 'options', name: ['options'], module: '', kind: 'record', visibility: 'public', origin: 'generated', fields: [{ name: ['hook'], type: { optional: { unit: 'hook' } } }] },
    // (i): a member with a receiver takes a record that holds a callback.
    cls('engine', [method('engine.configure', [param({ unit: 'options' })]), method('engine.session', [], { unit: 'session' })]),
    // (ii): a member with a receiver of a class that carries language code returns the class.
    cls('session', [method('session.child', [], { unit: 'leaf' }), method('session.name', [], 'text')]),
    cls('leaf', [method('leaf.name', [], 'text')]),
    // A class that only gives another class carries nothing.
    cls('plain', [method('plain.other', [], { unit: 'bare' })]),
    cls('bare', [method('bare.name', [param({ list: 'text' })], 'text')]),
    // (ii): a member without a receiver that returns the class takes a callback.
    { id: 'make', name: ['make'], module: '', kind: 'functions', visibility: 'public', origin: 'generated', members: [{ id: 'make.watch', name: ['watch'], kind: 'function', visibility: 'public', parameters: [param({ list: { unit: 'hook' } })], returns: { unit: 'watch' }, core: 'x::watch' }] },
    cls('watch', []),
  ];
  const found = carriers(units);
  assert.deepEqual([...found.classes].sort(), ['engine', 'leaf', 'session', 'watch']);
  assert.equal(found.carries({ tuple: ['text', { unit: 'leaf' }] }), true);
  assert.equal(found.carries({ list: { unit: 'bare' } }), false);
});

test('every binding crate turns on the locks of binding_core (GN-6h, GN-18a)', () => {
  const contract = JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8'));
  contract.targets = ['php', 'python', 'node', 'go', 'wasm'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  const files = trackedPackages(contract, '0.0.0');
  const core = (path: string): string => /^polyspec-binding-core = .*$/m.exec(files.get(path) ?? '')?.[0] ?? '';
  for (const path of ['packages/python/Cargo.toml', 'packages/ts/Cargo.toml', 'packages/php-ext/Cargo.toml', 'packages/go/internal/ffi/Cargo.toml', 'packages/ts/wasm/Cargo.toml']) assert.match(core(path), /features = \["construct", "lock"\] \}$/, path);
});

// The repository of the end-to-end check that holds a source, defaults and error units (tests/e2e/shapes).
const shapes = (): { contract: any; caseFiles: Map<string, unknown> } => ({
  contract: JSON.parse(readFileSync(new URL('../../../tests/e2e/shapes/packages/rust/interface.json', import.meta.url), 'utf8')),
  caseFiles: new Map([['contracts/cases.json', JSON.parse(readFileSync(new URL('../../../tests/e2e/shapes/contracts/cases.json', import.meta.url), 'utf8'))]]),
});
const shaped = (change: (contract: any) => void = () => undefined): Map<string, string | Buffer> => {
  const { contract, caseFiles } = shapes();
  change(contract);
  return generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles });
};
const member = (contract: any, id: string): any => contract.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === id);
const unitOf = (contract: any, id: string): any => contract.units.find((u: any) => u.id === id);

test('a record that a member gives only inside a map has its result form in every target (T-2, T-4, GN-6a)', () => {
  // shapes.measure gives the record text_measure; here it gives it only as the value of a map and of a keyed map.
  for (const returns of [{ map: { unit: 'text_measure' } }, { list: { keyed_map: { unit: 'text_measure' }, key: ['int', 'text'] } }]) {
    const out = shaped((c) => {
      member(c, 'shapes.measure').returns = returns;
      c.cases = c.cases.filter((k: { member: string }) => k.member !== 'shapes.measure');
    });
    for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
      assert.match(text(out, path), /\nfn out_text_measure[<(]/, `${path}: ${JSON.stringify(returns)}`);
    }
    assert.match(text(out, 'packages/python/generated/python/polyspec/shapes/_types.py'), /\nclass TextMeasure:/);
  }
});

// GN-6z: a member of shapes that takes a function type, which the core keeps or calls during the call.
const withFunction = (contract: any): void => {
  unitOf(contract, 'shapes').members.push({
    id: 'shapes.apply', name: ['apply'], kind: 'function', visibility: 'public', returns: 'text', raises: [], wait: 'none', core: 'polyspec_shapes::apply',
    parameters: [
      { name: ['convert'], type: { function: { parameters: ['text', { list: 'int' }], returns: 'text', async_allowed: false } }, required: true },
      { name: ['value'], type: 'text', required: true },
    ],
  });
};

test('a Python test gives a function value of a case as a fixture of the call and refuses a value that is not callable (G-5, GN-6z)', () => {
  const { contract, caseFiles } = shapes();
  withFunction(contract);
  contract.cases.push({ member: 'shapes.apply', file: 'contracts/cases.json', group: 'apply' });
  (caseFiles.get('contracts/cases.json') as any).apply = [
    { id: 'the_function_converts_the_value', convert: { function: [{ args: { 0: 'a', 1: [1] }, result: 'A' }, { args: { 0: 'b', 1: [] }, result: 'B', once: true }] }, value: 'a', result: 'A' },
  ];
  const tests = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles, targets: ['python'] }), 'packages/python/generated/tests/test_generated.py');
  assert.ok(tests.includes(`function_0, function_0_unexpected, function_0_calls = _fixture(("__call__",), [("__call__", ("a", [1],), "A", False, None), ("__call__", ("b", [],), "B", True, None)])`), tests);
  assert.match(tests, /result = pkg\.apply\(function_0, "a"\)\n[^\n]+\n[^\n]+\n        self\.assertEqual\(function_0_unexpected, \[\]\)/);
  assert.match(tests, /def test_gn6z_apply_refuses_a_convert_that_is_not_callable\(self\) -> None:\n        with self\.assertRaises\(pkg\.ShapesTypeError\) as caught:\n            pkg\.apply\(0, "a"\)\n        self\.assertEqual\(caught\.exception\.kind, "invalid_argument_type"\)/);
});

test('Python takes a function type as a boxed Fn that calls the callable, and Go as one that calls a kept func (T-2, GN-6z)', () => {
  const { contract, caseFiles } = shapes();
  withFunction(contract);
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles, targets: ['python'] });
  const lib = text(out, 'packages/python/generated/lib.rs');
  // The core takes the function by value, in the form that it may keep: 'static, Send and Sync.
  assert.match(lib, /let convert: Function[0-9a-f]{8} = kept_function_in\(py, /);
  assert.match(lib, /polyspec_shapes::apply\(convert, /);
  // The callable is checked as it enters, and each call converts the arguments out and the result in.
  assert.match(lib, /fn kept_function_in\(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str\) -> PyResult<Py<PyAny>> \{\n    if !value\.is_callable\(\) \{/);
  assert.match(lib, /\.call1\(\(text_out\(py, [a-z0-9_]+\)\?, list_out\(py, [a-z0-9_]+, /);
  assert.match(lib, /\.map_err\(\|error\| thrown\(py, error\)\)/);
  assert.match(text(out, 'packages/python/generated/python/polyspec/shapes/_native.pyi'), /convert: Callable\[\[str, list\[int\]\], str\]/);
  // Go generates the function type too: the contract of shapes has value aliases, so the arguments of the func give
  // the handles of their funcs first, as those of a callback do.
  const go = generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles, targets: ['go'] });
  const goLib = text(go, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(goLib, /let convert: Function[0-9a-f]{8} = kept_function_in\(&mut input, "convert"\)/);
  assert.match(goLib, /polyspec_shapes::apply\(convert, /);
  assert.equal(/fn given_first\(/.test(goLib), /fn kept_called\(native: &Native, args: &\[u8\]\) -> Result<Vec<u8>, Raised> \{\n(?:[^\n]*\n){5,8}    let args = given_first\(args\.to_vec\(\)\);/.test(goLib));
  assert.match(text(go, 'packages/go/zz_generated_shapes.go'), /\nfunc Apply\(convert func\(string, \[\]int64\) \(string, error\), /);
  const names = functionNames(goLib);
  assert.deepEqual([...names].filter(([, count]) => count > 1), []);
  assert.equal(names.get('go_native'), 1);
});

test('Node holds a function as a Native, which a call from another thread finds as kind wrong_thread (T-2, GN-6z, GN-6u)', () => {
  const { contract, caseFiles } = shapes();
  withFunction(contract);
  contract.cases.push({ member: 'shapes.apply', file: 'contracts/cases.json', group: 'apply' });
  (caseFiles.get('contracts/cases.json') as any).apply = [
    { id: 'the_function_converts_the_value', convert: { function: [{ args: { 0: 'a', 1: [1] }, result: 'A' }] }, value: 'a', result: 'A' },
  ];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles, targets: ['node'] });
  const lib = text(out, 'packages/ts/generated/lib.rs');
  assert.match(lib, /let convert: Function[0-9a-f]{8} = kept_function_in\(env, /);
  assert.match(lib, /fn kept_function_in\(env: &Env, value: Unknown<'_>, subject: &str\) -> Result<Native, Fail> \{\n    if value\.get_type\(\)\.map_err\(internal\)\? != ValueType::Function \{/);
  // Each call runs on the owner thread, in the env of the owner table.
  assert.match(lib, /let env = match native_env\(&native, "convert"\) \{\n\s+Ok\(env\) => env,\n\s+Err\(error\) => return Err\(thrown_elsewhere\(error\)\),/);
  assert.match(lib, /fn native_env\(native: &Native, subject: &str\) -> Result<Env, BindingError> \{/);
  assert.match(lib, /return Err\(BindingError::WrongThread \{ subject: subject\.to_owned\(\) \}\);/);
  // A failure on another thread is kept as its BindingError, which the owner thread makes its error.
  assert.match(lib, /struct Elsewhere\(BindingError\);/);
  assert.match(lib, /binding_core::Raised::from_generated\(binding_core::Native::new\(Elsewhere\(error\)\)\)/);
  assert.doesNotMatch(lib, /static ELSEWHERE/);
  assert.match(lib, /fn guard<T>\(body: impl FnOnce\(\) -> Result<T, Fail>\) -> Result<T, Fail> \{\n    release_queue\(\);/);
  assert.match(lib, /#\[cfg\(feature = "thread-test"\)\]\n#\[napi\(js_name = "__threadTest"\)\]/);
  assert.match(String(trackedPackages(contract, '0.0.0').get('packages/ts/Cargo.toml')), /\nthread-test = \[\]\n/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /convert: \(\(argument0: string, argument1: readonly \(number\)\[\]\) => string\)/);
  const tests = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.ok(tests.includes(`const function0 = fixture(['call'], [['call', ['a', [1]], 'A', false, null]]);`), tests);
  assert.ok(tests.includes('pkg.apply(function0.object.call, '), tests);
  assert.match(tests, /assert\.equal\(addon\(\)\.__threadTest\(\(\) => null\), 'wrong_thread'\);/);
  assert.match(tests, /assert\.throws\(\(\) => pkg\.apply\(0, [^\n]*\), \(error\) => error\.constructor === pkg\.ShapesTypeError && error\.kind === 'invalid_argument_type'\);/);
});

test('PHP holds a function as a Native, a Closure that a call from another thread finds as kind wrong_thread (T-2, GN-6z, GN-6u)', () => {
  const { contract, caseFiles } = shapes();
  withFunction(contract);
  contract.cases.push({ member: 'shapes.apply', file: 'contracts/cases.json', group: 'apply' });
  (caseFiles.get('contracts/cases.json') as any).apply = [
    { id: 'the_function_converts_the_value', convert: { function: [{ args: { 0: 'a', 1: [1] }, result: 'A' }] }, value: 'a', result: 'A' },
  ];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles, targets: ['php'] });
  const lib = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(lib, /let convert: Function[0-9a-f]{8} = kept_function_in\(/);
  assert.match(lib, /fn kept_function_in\(value: &Zval, subject: &str\) -> Result<Native, Fail> \{/);
  assert.match(lib, /if let Err\(error\) = native_thread\(&native, "convert"\) \{\n\s+return Err\(thrown_elsewhere\(error\)\);/);
  assert.match(lib, /let returned = function\.try_call\(vec!\[&arg0, &arg1\]\)/);
  assert.match(lib, /fn guard<T>\(body: impl FnOnce\(\) -> Result<T, Fail>\) -> Result<T, Fail> \{\n    release_queue\(\);/);
  assert.match(lib, /let module = module\.request_shutdown_function\(release_native\);/);
  assert.match(lib, /#\[cfg\(feature = "thread-test"\)\]\n#\[php_function\]\n#\[php\(name = "Polyspec\\\\Shapes\\\\Internal\\\\threadTest"\)\]/);
  assert.match(lib, /#\[cfg\(feature = "thread-test"\)\]\n\s+let module = module\.function\(wrap_function!\(thread_test\)\);/);
  assert.match(String(trackedPackages(contract, '0.0.0').get('packages/php-ext/Cargo.toml')), /\nthread-test = \[\]\n/);
  assert.match(text(out, 'packages/php-ext/generated/polyspec_shapes.stub.php'), /\* @param \\Closure \$convert\n/);
  const tests = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(tests, /\$function0 = new class\(\[\["call", \["a", \[1\]\], "A", false, null\]\]\)/);
  assert.ok(tests.includes('apply($function0->call(...), '), tests);
  assert.match(tests, /self::assertSame\('wrong_thread', \\Polyspec\\Shapes\\Internal\\threadTest\(static fn \(\) => null\)\);/);
});

test('WASM holds a function as a Native of the table of its one thread (T-2, GN-6z, GN-6u)', () => {
  const { contract, caseFiles } = shapes();
  withFunction(contract);
  contract.cases.push({ member: 'shapes.apply', file: 'contracts/cases.json', group: 'apply' });
  (caseFiles.get('contracts/cases.json') as any).apply = [
    { id: 'the_function_converts_the_value', convert: { function: [{ args: { 0: 'a', 1: [1] }, result: 'A' }] }, value: 'a', result: 'A' },
  ];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles, targets: ['wasm'] });
  const lib = text(out, 'packages/ts/wasm/generated/lib.rs');
  assert.match(lib, /let convert: Function[0-9a-f]{8} = kept_function_in\(/);
  assert.match(lib, /fn kept_function_in\(value: &JsValue, subject: &str\) -> Result<Native, Fail> \{\n    if !value\.is_function\(\) \{/);
  assert.match(lib, /let function: Function = native_object\(&native\)\.map_err\(Thrown::Binding\)\?\.dyn_into::<Function>\(\)/);
  assert.match(lib, /struct WasmNative \{\n    key: u64,\n\}/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.d.ts'), /convert: \(\(argument0: string, argument1: readonly \(number\)\[\]\) => string\)/);
  const tests = text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  assert.ok(tests.includes(`const function0 = fixture(['call'], [['call', ['a', [1]], 'A', false, null]]);`), tests);
  assert.ok(tests.includes('pkg.apply(function0.object.call, '), tests);
  assert.match(tests, /assert\.throws\(\(\) => pkg\.apply\(0, [^\n]*\), \(error\) => error\.constructor === pkg\.ShapesTypeError && error\.kind === 'invalid_argument_type'\);/);
});

// The internal form of shapes: its functions unit, its records, its enum and the class, which moves to the module store.
const internal = (contract: any): void => {
  for (const id of ['shapes', 'frame_options', 'pad_options', 'side', 'text_measure', 'tally', 'buffer']) {
    const unit = unitOf(contract, id);
    unit.visibility = 'internal';
    for (const m of unit.members ?? []) m.visibility = 'internal';
  }
  unitOf(contract, 'buffer').module = 'store';
};

test('an internal unit is generated in every target and marked as no public API (GN-6r, U-1)', () => {
  const out = shaped(internal);
  // PHP: the docblock of each declaration holds @internal.
  const stub = text(out, 'packages/php-ext/generated/polyspec_shapes.stub.php');
  assert.match(stub, /\/\*\*\n {5}\* T-5\.\n {5}\*\n {5}\* @internal\n {5}\*\/\n {4}final class Buffer/);
  assert.match(stub, / {5}\* @internal\n {5}\*\/\n {4}function repeat\(/);
  assert.match(stub, / {5}\* @internal\n {5}\*\/\n {4}final class TextMeasure/);
  // Python: the names are in no __all__; the root module keeps them in _root and the module store in _store.
  const pkg = 'packages/python/generated/python/polyspec/shapes';
  const root = text(out, `${pkg}/_root.py`);
  assert.match(root, /from \._native import [^\n]*repeat as repeat/);
  assert.match(root, /__all__ = \[\]\n/);
  assert.match(text(out, `${pkg}/_store.py`), /from \._native import Buffer as Buffer\n[\s\S]*__all__ = \[\]\n/);
  assert.equal(out.has(`${pkg}/store.py`), false);
  const init = text(out, `${pkg}/__init__.py`);
  assert.match(init, /__all__ = \["ShapesValueError", [^\n]*"Utf8Error"\]\n/);
  assert.doesNotMatch(init, /from \._store import/);
  const tests = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(tests, /^import polyspec\.shapes\._store$/m);
  assert.match(tests, /pkg\._root\.repeat\(/);
  assert.match(tests, /pkg\._store\.Buffer\(/);
  assert.doesNotMatch(tests, /pkg\.(repeat|Buffer|TextMeasure)\b/);
  // Node and WASM: the JSDoc of each declaration holds @internal.
  for (const path of ['packages/ts/generated/index.d.ts', 'packages/ts/wasm/generated/index.d.ts']) {
    const dts = text(out, path);
    assert.match(dts, /\/\*\* T-5\. @internal \*\/\nexport declare class Buffer/, path);
    assert.match(dts, /\/\*\* T-4: the options record; a member whose value is undefined is absent\. @internal \*\/\nexport interface FrameOptions/, path);
    // Node documents the defaults of repeat in its JSDoc, which then holds the tag; WASM documents none.
    assert.match(dts, path.includes('/wasm/') ? /\/\*\* @internal \*\/\nexport declare function repeat\(/ : / \* @internal\n \*\/\nexport declare function repeat\(/, path);
    assert.match(dts, /\/\*\* @internal \*\/\nexport declare function length\(/, path);
    assert.match(dts, /\/\*\* @internal \*\/\nexport declare const DEFAULT_TIMES/, path);
  }
  // Go: the doc comment of each declaration ends with the sentence of U-1.
  const go = text(out, 'packages/go/zz_generated_shapes.go');
  assert.match(go, /\/\/ Repeat calls polyspec_shapes::repeat \(contract member shapes\.repeat\)\.\n\/\/ It is internal to shapes \(U-1\) and is no public API\.\nfunc Repeat\(/);
  assert.match(go, /\/\/ It is internal to shapes \(U-1\) and is no public API\.\ntype FrameOptions struct/);
  assert.match(text(out, 'packages/go/store/zz_generated_store.go'), /\/\/ It is internal to shapes \(U-1\) and is no public API\.\ntype Buffer struct/);
  // A public unit has no mark.
  assert.doesNotMatch(text(shaped(), 'packages/ts/generated/index.d.ts'), /@internal/);
});

// Host units of shapes in the form of a host package: a class, its options record and a functions unit whose function
// takes the class and a generated class (U-1, L-2a).
const hosted = (contract: any): void => {
  contract.units.push(
    { id: 'app', name: ['app'], module: '', kind: 'class', visibility: 'public', origin: 'host', constructible: false, final: true, members: [] },
    {
      id: 'app_options', name: ['app', 'options'], module: '', kind: 'record', visibility: 'public', origin: 'host',
      fields: [{ name: ['around'], type: { optional: { passthrough: 'Request' } }, default: { literal: null }, reason: 'GN-6ag' }],
    },
    {
      id: 'host', name: ['host'], module: '', kind: 'functions', visibility: 'public', origin: 'host',
      members: [{
        id: 'host.serve', name: ['serve'], kind: 'function', visibility: 'public',
        parameters: [
          { name: ['app'], type: { unit: 'app' }, required: true },
          { name: ['buffer'], type: { unit: 'buffer' }, required: true },
          { name: ['options'], type: { unit: 'app_options' }, default: { empty: 'object' } },
        ],
        returns: 'none', raises: [], wait: 'none', only: { targets: ['node'], reason: 'GN-6ag' },
      }],
    },
  );
};

test('the generator writes nothing of a host unit in any target (GN-6ag, I-1)', () => {
  const plain = shaped();
  const out = shaped(hosted);
  // The host units add no file and change no byte of the generated ones.
  assert.deepEqual([...out.keys()], [...plain.keys()]);
  for (const [path, content] of out) assert.equal(String(content), String(plain.get(path)), path);
});

test('a generated unit that names a host unit in a type is refused by its name (GN-6ag, G-4)', () => {
  assert.throws(() => shaped((c) => {
    hosted(c);
    member(c, 'shapes.length').parameters.push({ name: ['app'], type: { unit: 'app' }, required: true });
  }), /shapes\.length\.app: a host unit app in a type of a generated unit is not generated \(GN-6ag\)/);
});

test('an internal member of a public unit is refused by its name (GN-6r, G-4)', () => {
  assert.throws(() => shaped((c) => { member(c, 'shapes.length').visibility = 'internal'; }), /shapes\.length: an internal member of a public unit is not generated yet \(GN-6r\)/);
});

// The Rust function `name` of a generated crate, from its line to the closing brace of its body.
const rustFn = (code: string, name: string): string => {
  const start = code.search(new RegExp(`\\nfn ${name}[(<]`));
  return start < 0 ? '' : code.slice(start, code.indexOf('\n}\n', start) + 3);
};

test('an integer key of a keyed_map outside the safe integers is kind invalid_number in every target, and a key of a kind that the contract does not list is invalid_argument_type (GN-12a, GN-13, GN-13b)', () => {
  const { contract } = load();
  contract.units[0].members[0].parameters[0].type = { keyed_map: 'text', key: ['int', 'text'] };
  contract.cases = [];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map() });
  const safe = /9_007_199_254_740_991/;
  const node = rustFn(text(out, 'packages/ts/generated/lib.rs'), 'keyed_map_in');
  assert.match(node, /ValueType::Number if kinds\.contains\(&0\) => \(0, binding_core::Key::Int\(safe_integer\(key, subject, NumberType::Int\)\?\)\)/, 'Node: a number key of a listed int is invalid_number when it is no safe integer');
  const wasm = rustFn(text(out, 'packages/ts/wasm/generated/lib.rs'), 'keyed_map_in');
  assert.match(wasm, /key\.as_f64\(\)\.is_some\(\) && kinds\.contains\(&0\) \{\n\s+\(0, binding_core::Key::Int\(safe_integer\(&key, subject, NumberType::Int\)\?\)\)/, 'WASM: as Node');
  const python = rustFn(text(out, 'packages/python/generated/lib.rs'), 'keyed_map_in');
  assert.match(python, /key\.is_exact_instance_of::<PyInt>\(\) && kinds\.contains\(&0\) \{\n\s+\(0, binding_core::Key::Int\(int_in\(py, &key, subject\)\?\)\)/, 'Python: int_in, the safe integers');
  const php = rustFn(text(out, 'packages/php-ext/generated/lib.rs'), 'keyed_map_in');
  assert.match(php, safe, 'PHP: an int key is a safe integer');
  assert.match(php, /BindingError::InvalidNumber/, 'PHP: an int key outside is invalid_number');
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /\{2\*\*53: [^\n]*\n\s+self\.assertEqual\(caught\.exception\.kind, "invalid_number"\)/);
  for (const path of ['packages/ts/generated/tests/generated.test.mjs', 'packages/ts/wasm/generated/tests/generated.test.mjs']) {
    assert.match(text(out, path), /new Map\(\[\[2 \*\* 53, [^\n]*error\.kind === 'invalid_number'/, path);
  }
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /\[2 \*\* 53 => [^\n]*;\n\s+self::fail\('no error'\);\n\s+\} catch \([^\n]*ValueError \$error\) \{\n\s+self::assertSame\('invalid_number', \$error->kind\(\)\);/);
  // Go refuses the list of tuples that the member returns (a Go array has one element type), as in the test of T-2.
  contract.units[0].members[0].returns = { keyed_map: 'text', key: ['int', 'text'] };
  contract.targets = ['go'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  for (const category of Object.keys(contract.errors.classes)) contract.errors.classes[category] = {};
  const go = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map() });
  const ffi = rustFn(text(go, 'packages/go/internal/ffi/generated/lib.rs'), 'keyed_map_in');
  assert.match(ffi, /if !kinds\.contains\(&tag\) \{\n\s+return Err\(type_error\(subject, expected\)\);\n\s+\}\n(?:\s+\/\/[^\n]*\n)?\s+if matches!\(key, binding_core::Key::Int\(integer\) if integer\.unsigned_abs\(\) > 9_007_199_254_740_991\) \{\n\s+return Err\(binding_error\(BindingError::InvalidNumber/, 'Go: the kind of the key first, then its range');
  assert.match(text(go, 'packages/go/zz_generated_test.go'), /binding\.IntKey\(9007199254740992\)[\s\S]{0,400}?"invalid_number"/);
});

test('an int or a uint outside the safe integers is kind invalid_number in every target, and an int64 takes the range of i64 (GN-12a, GN-13, GN-13b)', () => {
  // buffer.from_end takes an int, shapes.total a list of uint and shapes.negate an int64.
  const out = shaped((contract) => {
    member(contract, 'buffer.from_end').parameters[0].type = 'int';
  });
  const safe = /9_007_199_254_740_991/;
  for (const path of ['packages/python/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    const lib = text(out, path);
    assert.match(rustFn(lib, 'int_in'), safe, `${path}: int_in refuses an int outside the safe integers`);
    assert.match(rustFn(lib, 'uint_in'), safe, `${path}: uint_in refuses a uint above 2^53 - 1`);
    assert.notEqual(rustFn(lib, 'int64_in'), '', `${path}: int64_in takes an int64`);
    assert.doesNotMatch(rustFn(lib, 'int64_in'), safe, `${path}: int64_in takes the range of i64`);
  }
  const ffi = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(rustFn(ffi, 'safe_int_in'), safe, 'the Go C ABI refuses an int outside the safe integers');
  assert.match(rustFn(ffi, 'safe_uint_in'), safe, 'the Go C ABI refuses a uint above 2^53 - 1');
  assert.match(ffi, /list_in\(input, \|input\| safe_uint_in\(input, /, 'an item of a list of uint is in the range');
  assert.doesNotMatch(rustFn(ffi, 'int_in'), safe, 'an int64, a handle and a length take the range of their word');
  assert.match(
    text(out, 'packages/python/generated/tests/test_generated.py'),
    /def test_b2_buffer_from_end_count_refuses_what_is_not_int\(self\) -> None:\n\s+for bad in \[[^\n]*2\*\*53, -\(2\*\*53\)/,
  );
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /public function testB2BufferFromEnd\w*RefusesWhatIsNotint\(\): void\n\s+\{\n\s+foreach \(\[[^\n]*2 \*\* 53, -\(2 \*\* 53\)/);
  const goTest = text(out, 'packages/go/zz_generated_test.go');
  assert.match(goTest, /func TestB2BufferFromEndRefusesCountAboveTheSafeIntegers\(t \*testing\.T\) \{\n(?:\t[^\n]*\n)*?\t_, err := made0\.FromEnd\(9007199254740992\)\n[^\n]*failure\.Kind\(\) != "invalid_number"/);
  assert.match(goTest, /func TestB2BufferFromEndRefusesCountBelowTheSafeIntegers\(t \*testing\.T\) \{\n(?:\t[^\n]*\n)*?\t_, err := made0\.FromEnd\(-9007199254740992\)\n[^\n]*failure\.Kind\(\) != "invalid_number"/);
  assert.match(goTest, /func TestB2TotalRefusesNumbersAboveTheSafeIntegers\(t \*testing\.T\) \{\n\t[^\n]*Total\(ptr\(\[\]uint64\{9007199254740992\}\)\)/, 'an item of a list of uint');
  assert.doesNotMatch(goTest, /func TestB2\w*Negate/, 'an int64 takes the range of i64');
});

test('a tuple enters as the sequence of exactly its parts in each language (T-1, GN-6t)', () => {
  const out = shaped();
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /fn tuple_in<'py, const N: usize>\(/);
  assert.match(python, /tuple_in\(py, [a-z_]+, "span"\)\.and_then\(\|\[part_0, part_1\]\| Ok\(\(uint_in\(py, &part_0, "span"\)\?, uint_in\(py, &part_1, "span"\)\?\)\)\)/);
  assert.match(python, /tuple_in\(py, [a-z_]+, "pair"\)\.and_then\(\|\[part_0, part_1\]\| Ok\(\(text_in\(py, &part_0, "pair"\)\?, uint_in\(py, &part_1, "pair"\)\?\)\)\)/);
  assert.match(python, /list_in\(py, [a-z_]+, "spans", \|py, item\| tuple_in\(py, item, "spans"\)/);
  for (const path of ['packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    const rust = text(out, path);
    const [tuple, uint] = [helperName(path, 'in_tuple'), helperName(path, 'in_uint')];
    assert.match(rust, new RegExp(`fn ${tuple}<'[a-z]+, const N: usize>\\(`), path);
    assert.match(rust, new RegExp(`${tuple}\\([a-z_]+, "span"\\)\\.and_then\\(\\|\\[part_0, part_1\\]\\| Ok\\(\\(${uint}\\(part_0, "span"\\)\\?, ${uint}\\(part_1, "span"\\)\\?\\)\\)\\)`), path);
  }
  const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /fn tuple_in<const N: usize>\(value: &JsValue, subject: &str\) -> Result<\[JsValue; N\], Fail>/);
  assert.match(wasm, /tuple_in\(&?[a-z_]+, "span"\)\.and_then\(\|\[part_0, part_1\]\| Ok\(\(uint_in\(&part_0, "span"\)\?, uint_in\(&part_1, "span"\)\?\)\)\)/);
  // G-5: the case value of a tuple is the sequence of its parts in each language.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /pkg\.span_length\(\(2, 5,\)\)/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /pkg\.spanLength\(\[2, 5\]\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /Shapes\\spanLength\(\[2, 5\]\)/);
  assert.match(text(out, 'packages/go/zz_generated_shapes.go'), /^func SpanLength\(span \[2\]uint64\) \(uint64, error\)/m);
});

test('a value enters the core in its own integer and tuple type and leaves it from that type (T-1, GN-6ac)', () => {
  const out = shaped();
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs']) {
    const rust = text(out, path);
    // The trait narrows with TryFrom, so a value outside the core's type is kind invalid_number (B-2).
    assert.match(rust, /trait IntoCore<T> \{\n {4}fn into_core\(self, subject: &str\) -> Result<T, BindingError>;/, path);
    assert.match(rust, /into_core_narrow!\(u64, NumberType::Uint, u8, u16, u32, usize\);/, path);
    assert.match(rust, /into_core_narrow!\(i64, NumberType::Int, i8, i16, i32, isize\);/, path);
    assert.match(rust, /impl<A: IntoCore<T>, B: IntoCore<T>, T> IntoCore<\[T; 2\]> for \(A, B\)/, path);
    // The core call chooses the type: a tuple parameter that the core holds as [usize; 2], and parameters of u32. The
    // crate of Go judges the end of the encoded arguments after the last parameter (B-8).
    assert.match(rust, /let span = IntoCore::into_core\(span, "span"\)\.map_err\([^\n]*\)\?;\n\s*(?:finish_input\(input\)\?;\n\s*)?let result = polyspec_shapes::span_width\(&span\);/, path);
    assert.match(rust, /let start = IntoCore::into_core\(start, "start"\)\.map_err\([^\n]*\)\?;\n\s*let length: u64 = /, path);
    // A tuple result is read by partsN, from a Rust tuple or an array; a usize widens after the assertion of its width.
    // The crate of Go writes the result into the buffer that it gives back (B-8).
    assert.match(rust, /let result = polyspec_shapes::span_at\(start, length\);\n\s*(?:let (?:mut buffer|output) = [^\n]*\n\s*)*\{ let \(part_0, part_1\) = parts2\(&result\); /, path);
    assert.match(rust, /impl<T> Parts2<T, T> for \[T; 2\]/, path);
    assert.match(rust, /const _: \(\) = assert!\(usize::BITS <= 64\);\n#\[allow\(clippy::as_conversions, reason = "GN-6ac"\)\]\nimpl WideUint for usize \{/, path);
    // A helper that no member uses is not generated.
    assert.doesNotMatch(rust, /fn parts1</, path);
  }
  // The Go crate gives a record of narrower fields through IntoCore field by field, which the struct literal types, and
  // an isize result of u8 parameters widens as an int (shapes.stride_count, shapes.offset).
  const go = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(go, /let ends: \(u64, u64\) = tuple2_in\([^\n]*\n\s*let ends = IntoCore::into_core\(ends, "Ends"\)\.map_err\(binding_error\)\?;\n\s*let step: u64 = [^\n]*\n\s*let step = IntoCore::into_core\(step, "Step"\)\.map_err\(binding_error\)\?;\n\s*Ok\(polyspec_shapes::Stride \{ ends, step \}\)/);
  assert.match(go, /let result = polyspec_shapes::stride_count\(&stride\);\n(?:\s*let [^\n]*\n)*\s*uint_out\(output, result\);/);
  assert.match(go, /let end = IntoCore::into_core\(end, "end"\)\.map_err\(binding_error\)\?;\n\s*finish_input\(input\)\?;\n\s*let result = polyspec_shapes::offset\(start, end\);\n(?:\s*let [^\n]*\n)*\s*int_out\(output, result\);/);
  assert.match(go, /const _: \(\) = assert!\(isize::BITS <= 64\);\n#\[allow\(clippy::as_conversions, reason = "GN-6ac"\)\]\nimpl WideInt for isize \{/);
  // B-2: the case of a start beyond 32 bits, the width of usize on wasm32, is kind invalid_number in each language.
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /pkg\.spanAt\(4294967296, 1\), \(error\) =>\n[^\n]*\n[^\n]*\n[^\n]*\n {4}error\.kind === 'invalid_number'/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /pkg\.span_at\(4294967296, 1\)/);
});

test('a list parameter whose items narrow is a Vec of the core type, whose slice the core borrows (T-1, GN-6ad)', () => {
  const out = shaped();
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs']) {
    const rust = text(out, path);
    // The crate of Go judges the end of the encoded arguments after the last parameter (B-8).
    const end = '(?:finish_input\\(input\\)\\?;\\n\\s*)?';
    assert.match(rust, new RegExp(`let widths = IntoCore::into_core\\(widths, "widths"\\)\\.map_err\\([^\\n]*\\)\\?;\\n\\s*${end}let result = polyspec_shapes::width_sum\\(&widths\\[\\.\\.\\]\\);`), path);
    assert.match(rust, new RegExp(`let values = IntoCore::into_core\\(values, "values"\\)\\.map_err\\([^\\n]*\\)\\?;\\n\\s*${end}let result = polyspec_shapes::largest\\(&values\\[\\.\\.\\]\\);`), path);
    // A list of tuples narrows its parts the same way.
    assert.match(rust, new RegExp(`let spans = IntoCore::into_core\\(spans, "spans"\\)\\.map_err\\([^\\n]*\\)\\?;\\n\\s*${end}let result = polyspec_shapes::spans_total\\(&spans\\[\\.\\.\\]\\);`), path);
    // A list of items that do not narrow is passed as it is (GN-6).
    assert.doesNotMatch(rust, /&[a-z_]+\[\.\.\]\)[^\n]*\n[^\n]*polyspec_shapes::(?!width_sum|largest|spans_total)/, path);
  }
  // B-2: an item beyond 32 bits is kind invalid_number in each language.
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /pkg\.largest\(\[1, 4294967296\]\), \(error\) =>\n[^\n]*\n[^\n]*\n[^\n]*\n {4}error\.kind === 'invalid_number'/);
});

test('the generated calls of the core compile against the core of tests/e2e/shapes for the host and for wasm32 (T-1, GN-6ac, GN-6ad)', () => {
  // The bodies of the WASM entry points of the members below, as the generator writes them, with the core functions of
  // the fixture's own source. An input conversion `let x: T = in_...;` becomes the parameter x: T, so each body runs
  // on the values of the table's types; the stand-ins of binding_core and of the language are the few items they name.
  const members = ['span_length', 'spans_total', 'span_width', 'span_at', 'width_sum', 'largest', 'stride_count', 'offset'];
  // The record that stride_count takes, which the entry point builds as a struct literal of its fields.
  const structs = ['Stride'];
  const wasm = text(shaped(), 'packages/ts/wasm/generated/lib.rs');
  const entries = [...wasm.matchAll(/pub fn (\w+)\([^)]*\) -> Result<JsValue, JsValue> \{\n\s*guard\(\|\| \{\n([\s\S]*?)\n\s*\}\)\n\s*\.map_err\(throw\)/g)];
  const calls = members.map((name) => {
    const entry = entries.find((e) => e[1] === `function_${name}`);
    assert.ok(entry !== undefined, `no WASM entry point ${name}`);
    const params: string[] = [];
    const body: string[] = [];
    for (const line of (entry[2] ?? '').split('\n')) {
      const input = /^\s*let (\w+): (.+?) = \w+_in\(.*\?;$/.exec(line);
      if (input === null) body.push(line);
      else params.push(`${input[1]}: ${input[2]}`);
    }
    return `pub fn ${name}(${params.join(', ')}) -> Result<Out, BindingError> {\n${body.join('\n')}\n}\n`;
  }).join('\n');
  const core = readFileSync(new URL('../../../tests/e2e/shapes/packages/rust/src/lib.rs', import.meta.url), 'utf8');
  const coreFns = members.map((name) => {
    const found = new RegExp(`(?:///[^\\n]*\\n)*#\\[must_use\\]\\npub (?:const )?fn ${name}\\([\\s\\S]*?\\n\\}\\n`).exec(core);
    assert.ok(found !== null, `no core function ${name}`);
    return found[0];
  }).concat(structs.map((name) => {
    const found = new RegExp(`(?:///[^\\n]*\\n)*pub struct ${name} \\{[\\s\\S]*?\\n\\}\\n`).exec(core);
    assert.ok(found !== null, `no core struct ${name}`);
    return found[0];
  })).join('\n');
  const stand = `
pub enum NumberType {
    Uint,
    Int,
}

pub enum BindingError {
    InvalidNumber { subject: String, expected: NumberType },
}

pub type Out = u64;

fn binding_error(error: BindingError) -> BindingError {
    error
}

fn uint_out(value: impl WideUint) -> Result<Out, BindingError> {
    Ok(value.widen_uint())
}

fn int_out(value: impl WideInt) -> Result<Out, BindingError> {
    Ok(value.widen_int().unsigned_abs())
}

fn tuple_out(items: &[Out]) -> Result<Out, BindingError> {
    Ok(items.iter().sum())
}

pub mod polyspec_shapes {
${coreFns}}
`;
  const source = `${usedHelpers(`${WIDEN}\n${INTO_CORE}\n${PARTS}`, `${stand}${calls}`)}\n${stand}\n${calls}`;
  const channel = /channel = "([^"]+)"/.exec(readFileSync(new URL('../../../rust-toolchain.toml', import.meta.url), 'utf8'))?.[1] ?? '';
  const where = mkdtempSync(join(tmpdir(), 'binding-narrow-'));
  try {
    for (const target of [[], ['--target', 'wasm32-unknown-unknown']]) {
      const run = spawnSync('rustc', ['--edition', '2021', '--crate-type', 'lib', '--crate-name', 'narrowing', '--emit', 'metadata', '-D', 'warnings', '--out-dir', where, ...target, '-'], { input: source, encoding: 'utf8', cwd: where, env: { ...process.env, RUSTUP_TOOLCHAIN: channel } });
      assert.equal(run.status, 0, `rustc ${target.join(' ')}: ${run.stderr}`);
    }
  } finally {
    rmSync(where, { recursive: true, force: true });
  }
});

// The repository of the end-to-end check that holds a variant and a class that implements a callback interface
// (tests/e2e/variants).
const variants = (change: (contract: any) => void = () => undefined, targets?: Inputs['targets']): Map<string, string | Buffer> => {
  const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/variants/packages/rust/interface.json', import.meta.url), 'utf8'));
  const caseFiles = new Map([['contracts/cases.json', JSON.parse(readFileSync(new URL('../../../tests/e2e/variants/contracts/cases.json', import.meta.url), 'utf8'))]]);
  change(contract);
  return generate({ contract, version: '0.0.0', coreLib: 'polyspec_variants', caseFiles, ...(targets === undefined ? {} : { targets }) });
};

test('the PHP crate of a contract whose only classes are those of a variant imports ClassFlags, which they name (T-9, GN-6v)', () => {
  // plot has a variant and no record, class or callback of its own: the interface of the variant and the classes of its
  // cases name ClassFlags.
  const { contract, caseFiles, foreign } = plotSample();
  assert.deepEqual(contract.units.filter((u: any) => ['record', 'class', 'interface'].includes(u.kind)).map((u: any) => u.id), []);
  const php = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_plot', caseFiles, foreign, targets: ['php'] }), 'packages/php-ext/generated/lib.rs');
  assert.match(php, /\.flags\(ClassFlags::Interface\)/);
  assert.match(php, /\.flags\(ClassFlags::Final\)/);
  assert.match(php, /\nuse ext_php_rs::flags::\{[^}\n]*\bClassFlags\b[^}\n]*\};\n/);
  // A crate that names no flag of a class imports none, which the lints would deny as unused.
  const sample = text(generate({ contract: JSON.parse(readFileSync(new URL('../../../tests/e2e/functions/packages/rust/interface.json', import.meta.url), 'utf8')), version: '0.0.0', coreLib: 'polyspec_functions', caseFiles: new Map([['contracts/cases.json', JSON.parse(readFileSync(new URL('../../../tests/e2e/functions/contracts/cases.json', import.meta.url), 'utf8'))]]), targets: ['php'] }), 'packages/php-ext/generated/lib.rs');
  assert.equal(/\bClassFlags::/.test(sample), /\nuse ext_php_rs::flags::\{[^}\n]*\bClassFlags\b/.test(sample));
});

test('Go encodes the fields of an optional record through the pointer, not a pointer of a field (T-4, GN-6v, GN-6c)', () => {
  // The case line of the variant mark of plot holds end: optional<point of points>. `*case0.End.X` reads the field X
  // of the pointer and takes what it points to, which Go refuses for an int64.
  const { contract, caseFiles, foreign } = plotSample();
  const go = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_plot', caseFiles, foreign, targets: ['go'] }), 'packages/go/zz_generated_plot.go');
  assert.match(go, /\n\t\t\tenc\.Tag\(true\)\n\t\t\tenc\.Int\(\(\*case0\.End\)\.X\)\n\t\t\tenc\.Int\(\(\*case0\.End\)\.Y\)\n/);
  // No file of the Go package takes the pointer of a selected field or of a call.
  for (const [path, bytes] of generate({ contract, version: '0.0.0', coreLib: 'polyspec_plot', caseFiles, foreign, targets: ['go'] })) {
    if (path.endsWith('.go')) assert.doesNotMatch(String(bytes), /[(, ]\*[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+\.[A-Za-z_][A-Za-z0-9_]*[),(]/, path);
  }
});

test('a function type that the core may keep is a type alias of the crate, written once and named where it is used (GN-6z)', () => {
  // The lints deny a boxed function type at a let or as the result of a closure (clippy type_complexity), so a crate
  // names the type by an alias and writes it once.
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/functions/${path}`, import.meta.url), 'utf8'));
  const out = generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_functions', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) });
  const libs = [...out].filter(([path]) => path.endsWith('generated/lib.rs'));
  assert.equal(libs.length, 5);
  for (const [path, bytes] of libs) {
    const lib = String(bytes);
    const aliases = [...lib.matchAll(/^type (Function[0-9a-f]{8}) = (Box<dyn Fn\([^\n]*\) -> Result<[^\n]*> \+ Send \+ Sync>);$/gm)];
    assert.ok(aliases.length > 0, `${path} defines no alias of a function type`);
    // The boxed type is written in the definitions of the aliases alone.
    assert.equal((lib.match(/Box<dyn Fn\(/g) ?? []).length, aliases.length, path);
    for (const [, name = '', type = ''] of aliases) {
      assert.equal(aliases.filter(([, other]) => other === name).length, 1, `${path} defines ${name} twice`);
      assert.match(lib, new RegExp(`(?:: |-> )${name}\\b`), `${path} does not name ${name}`);
      // An alias has no lifetime of a function around it.
      assert.doesNotMatch(type, /'(?!static\b|_\b)[a-z]/, `${path}: ${name}`);
    }
    assert.match(lib, /let convert: Function[0-9a-f]{8} = kept_function_in\(/, path);
  }
});

test('PHP describes a stdClass under one handle at every place, so the core knows an object that it has seen (B-1, U-7, GN-6e)', () => {
  // The core keeps the place of an object under its handle: with a new handle at each place, an object at two places
  // was two objects, and an object that a reference in it holds again was read without an end.
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/kept/${path}`, import.meta.url), 'utf8'));
  const php = text(generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_kept', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['php'] }), 'packages/php-ext/generated/lib.rs');
  assert.match(php, /struct PhpHost<'a> \{\n {4}held: Vec<Vec<\(HostValue, &'a Zval\)>>,\n {4}objects: std::collections::BTreeMap<usize, u64>,\n {4}marked: u64,\n/);
  assert.match(php, /if type_name == "stdClass" \{\n {16}let identity = std::ptr::from_ref\(object\)\.addr\(\);\n {16}let properties = object\.get_properties\(\)\.map_err\(php_failed\)\?;\n {16}let len = handle_count\(properties\.len\(\)\);\n {16}if let Some\(handle\) = self\.objects\.get\(&identity\) \{\n {20}return Ok\(HostValue::StdClass \{ handle: Handle::new\(\*handle\), len \}\);\n {16}\}\n {16}let handle = self\.hold\(properties\);\n {16}self\.objects\.insert\(identity, handle\.raw\(\)\);\n {16}return Ok\(HostValue::StdClass \{ handle, len \}\);/);
  // A crate that reads a value class of another repository has the same host with the fields of that read: the table
  // of the objects, and the values and the entries that the members of the owner gave.
  const owner = valueClassSample();
  const foreignPhp = text(generate({ contract: owner.contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles: owner.caseFiles, foreign: owner.foreign, targets: ['php'] }), 'packages/php-ext/generated/lib.rs');
  assert.match(foreignPhp, /struct PhpHost<'a> \{\n {4}held: Vec<Vec<\(HostValue, &'a Zval\)>>,\n {4}objects: std::collections::BTreeMap<usize, u64>,\n {4}marked: u64,\n {4}owned: Vec<Vec<\(Zval, Zval\)>>,\n {4}values: Vec<[^\n]*>,\n\}/);
  assert.match(foreignPhp, /&mut self\.values, &mut self\.owned/);
  assert.match(foreignPhp, /if type_name == "stdClass" \{\n {16}let identity = std::ptr::from_ref\(object\)\.addr\(\);/);
  // Every host of the crate starts without an object.
  assert.equal((php.match(/PhpHost \{ /g) ?? []).length, (php.match(/PhpHost \{ held: Vec::new\(\), objects: std::collections::BTreeMap::new\(\), marked: 0[,} ]/g) ?? []).length);
  assert.ok((php.match(/PhpHost \{ /g) ?? []).length > 0);
});

test('the Node crate defines the helper raised only when its code names it (U-3, GN-4)', () => {
  // The helper is named by the reads of a value alias and by the function of a machine; a crate whose kept helpers
  // name it nowhere had it as dead code, which the lints deny.
  let withIt = 0;
  let withoutIt = 0;
  for (const name of ['classes', 'sample', 'functions', 'shapes', 'variants', 'kept']) {
    const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${name}/${path}`, import.meta.url), 'utf8'));
    const node = text(generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: `polyspec_${name}`, caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['node'] }), 'packages/ts/generated/lib.rs');
    const defined = /\nfn raised\(error: Thrown\) -> binding_core::Raised \{/.test(node);
    const named = /\braised\(Thrown::/.test(node);
    assert.equal(defined, named, `${name}: the Node crate ${defined ? 'defines raised and names it nowhere' : 'names raised and does not define it'}`);
    if (defined) withIt += 1; else withoutIt += 1;
  }
  assert.ok(withIt > 0 && withoutIt > 0, `${withIt} crates with the helper and ${withoutIt} without it: the test needs both`);
});

test('PHP takes the exception of a call of PHP code out of the engine before it reads the result of the call (U-3, GN-6ae)', () => {
  // ext-php-rs reports a call whose code threw as an error and leaves the exception pending. A crate that returned at
  // that error left it pending, so a core that drops the Raised of a function and answers by a value, as store.attempt
  // of the sample does, returned its value and PHP threw the exception all the same.
  let calls = 0;
  for (const name of ['sample', 'functions', 'kept', 'classes']) {
    const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${name}/${path}`, import.meta.url), 'utf8'));
    const php = text(generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: `polyspec_${name}`, caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['php'] }), 'packages/php-ext/generated/lib.rs');
    const all = (php.match(/\.try_call(?:_method)?\(/g) ?? []).length;
    const taken = (php.match(/let returned = [^;]*?\.try_call(?:_method)?\([^;]*\);\n\s*if let Some\(exception\) = ExecutorGlobals::take_exception\(\) \{\n\s*return Err\(Thrown::Php\(exception\)\);\n\s*\}\n\s*let returned = returned\.map_err\(/g) ?? []).length;
    assert.equal(taken, all, `${name}: ${String(all - taken)} of ${String(all)} calls of PHP code read their result before the exception is taken`);
    calls += all;
  }
  assert.ok(calls > 0, 'no crate calls PHP code, so this test checked nothing');
});

test('a function value inside a case value is a fixture whose rows name the member that the fixture has (GN-6z, GN-13)', () => {
  // The case of registry.call registers a function by a step of its receiver. The rows of that function named the
  // member of the Python fixture, `__call__`, in every language, so the Node, WASM and PHP fixture, whose member is
  // `call`, knew no row of the call that it got and failed it as a call that the case does not expect.
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/functions/${path}`, import.meta.url), 'utf8'));
  const out = generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_functions', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) });
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  const wasm = text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  for (const [name, mjs] of [['node', node], ['wasm', wasm]] as const) {
    assert.match(mjs, /test\('GN-13e: Registry\.call the_kept_function_converts_the_value', \(\) => \{\n[^\n]*\n {2}made0\.register\('up', fixture\(\['call'\], \[\['call', \['ab c', \[2, 1\]\], 'AB C', false, null\]\]\)\.object\.call\);/, name);
    // Every row of a fixture names a member of that fixture.
    for (const made of mjs.matchAll(/\bfixture\(\[([^\]]*)\], \[\[('[^']*')/g)) assert.ok((made[1] ?? '').split(', ').includes(made[2] ?? ''), `${name}: ${made[0]}`);
  }
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  const phpCase = php.slice(php.indexOf('function testGn13eRegistryCallTheKeptFunctionConvertsTheValue'));
  assert.doesNotMatch(phpCase.slice(0, phpCase.indexOf('\n    }\n')), /__call__/);
  assert.match(phpCase.slice(0, phpCase.indexOf('\n    }\n')), /\["call", \["ab c", \[2, 1\]\], "AB C"/);
  // Python: the member of its fixture is the call itself.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /made0\.register\("up", _fixture\(\("__call__",\), \[\("__call__", \("ab c", \[2, 1\],\), "AB C", False, None\)\]\)\[0\]\)/);
});

// The conversions of a generated crate, `in_<unit>` and `out_<unit>`, whose parameter `env` or `py` only their own call
// uses: the lints deny such a parameter (clippy only_used_in_recursion).
function onlyInRecursion(rust: string): string[] {
  const found: string[] = [];
  // A function ends at the closing brace of its own indentation.
  for (const fn of rust.matchAll(/\n([ \t]*)(?:pub\(super\) )?fn ((?:in|out)_[a-z0-9_]+)(?:<[^>]*>)?\(([^)]*)\)[^{\n]*\{\n([\s\S]*?)\n\1\}\n/g)) {
    const [, , name = '', params = '', body = ''] = fn;
    for (const param of ['env', 'py']) {
      if (!new RegExp(`(?:^|, )${param}: `).test(params)) continue;
      const others = body.replace(new RegExp(`\\b${name}\\(${param}, `, 'g'), `${name}(`);
      if (!new RegExp(`\\b${param}\\b`).test(others)) found.push(`${name}(${param})`);
    }
  }
  return found;
}

test('a variant that holds itself has no conversion with a parameter that only its own call uses (T-9, GN-6v)', () => {
  const out = variants();
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs']) {
    const rust = text(out, path);
    assert.match(rust, /fn in_figure(?:<[^>]*>)?\(/, path);
    assert.deepEqual(onlyInRecursion(rust), [], path);
  }
  // Node: figure holds itself and no value that reads the env, so its conversion in takes none, and neither does a call of it.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /\nfn in_figure\(value: Unknown<'_>, subject: &str\) -> Result<polyspec_variants::Figure, Fail> \{/);
  assert.doesNotMatch(node, /\bin_figure\(env, /);
  // The check finds such a parameter in a text that has one.
  assert.deepEqual(onlyInRecursion("\nfn in_a(env: &Env, value: Unknown<'_>) -> Result<A, Fail> {\n    in_a(env, value)\n}\n"), ['in_a(env)']);
  assert.deepEqual(onlyInRecursion("\nfn in_a(env: &Env, value: Unknown<'_>) -> Result<A, Fail> {\n    in_b(env, value)\n}\n"), []);
});

test('a variant is the core enum, converted by a match of its cases, and a union of its cases in each language (T-9, GN-6v)', () => {
  const out = variants();
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const rust = text(out, path);
    assert.match(rust, /fn in_figure\(/, path);
    assert.match(rust, /fn out_figure/, path);
    // A case without fields is a struct pattern, and a field that holds the variant again is boxed; a list is not.
    assert.match(rust, /polyspec_variants::Figure::Dot \{\}/, path);
    assert.match(rust, /let field_frame: Box<polyspec_variants::Figure> = [\s\S]*?Box::new\(in_figure\(/, path);
    assert.match(rust, new RegExp(`let field_back: Option<Box<polyspec_variants::Figure>> = [\\s\\S]*?${helperName(path, 'in_optional')}\\([^\\n]*\\.map\\(Box::new\\)`), path);
    assert.match(rust, /let field_items: Vec<polyspec_variants::Figure> = /, path);
    assert.match(rust, /polyspec_variants::Figure::Group \{ items: field_items, frame: field_frame, back: field_back \}/, path);
    assert.doesNotMatch(rust, /polyspec_variants::Figure::[A-Za-z]+ \{[^}]*\}\s*=>[^\n]*\n\s*_ =>/, path);
  }
  const types = text(out, 'packages/python/generated/python/polyspec/variants/_types.py');
  assert.match(types, /@dataclass\(frozen=True, kw_only=True\)\nclass FigureGroup:/);
  assert.match(types, /^type Figure = FigureDot \| FigureCircle \| FigureLabel \| FigureGroup$/m);
  for (const path of ['packages/ts/generated/index.d.ts', 'packages/ts/wasm/generated/index.d.ts']) {
    const dts = text(out, path);
    assert.match(dts, /export interface FigureDot \{\n  readonly type: 'dot';\n\}/, path);
    assert.match(dts, /export interface FigureGroup \{\n  readonly type: 'group';\n  readonly items: readonly \(Figure\)\[\];\n  readonly frame: Figure;\n  readonly back: Figure \| null;\n\}/, path);
    assert.match(dts, /export type Figure = FigureDot \| FigureCircle \| FigureLabel \| FigureGroup;/, path);
    assert.match(dts, /export declare function grown\(figure: Figure\): Figure;/, path);
  }
  const stub = text(out, 'packages/php-ext/generated/polyspec_variants.stub.php');
  assert.match(stub, /interface Figure\n\s+\{\n\s+\}/);
  assert.match(stub, /final class FigureCircle implements Figure\n/);
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /\.implements\(\(variant_figure, "\\\\Polyspec\\\\Variants\\\\Figure"\)\)/);
  // G-5: a variant value of a case is the object of its tag and fields, which each target writes in its form.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /pkg\.grown\(pkg\.FigureGroup\(items=\[pkg\.FigureCircle\(radius=1\.25\), pkg\.FigureLabel\(text="ab", at=2\)\], frame=pkg\.FigureDot\(\), back=None\)\)/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /pkg\.grown\(\{ type: 'group', items: \[\{ type: 'circle', radius: 1\.25 \}, \{ type: 'label', text: 'ab', at: 2 \}\], frame: \{ type: 'dot' \}, back: null \}\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /new \\Polyspec\\Variants\\FigureGroup\(/);
  // GN-6v: what is not generated yet is refused by name.
  assert.throws(() => variants((c) => { delete unitOf(c, 'figure').core_type; }), /figure: a variant names its core enum in core_type \(T-9\)/);
  assert.throws(() => variants((c) => { Object.assign(unitOf(c, 'figure').cases[1].fields[0], { default: { literal: 1.5 }, default_core: 'polyspec_variants::RADIUS' }); }), /figure\.circle\.radius: a field default of a case other than \{literal: null\} of an optional field is not generated yet \(T-4, T-9\)/);
  assert.throws(() => variants((c) => { unitOf(c, 'figure').cases[1].fields[0].type = { unit: 'ribbon' }; }), /figure\.circle\.radius: a class in a case of a variant is not generated yet \(GN-6v\)/);
  assert.throws(() => variants((c) => { unitOf(c, 'figure').cases[1].fields[0].name = ['type']; }), /figure\.circle\.type: a field has the name of the tag \(GN-6v\)/);
});

test('a variant is an interface of Go and a struct of each case, which the C ABI converts by the number of the case (T-9, GN-6v)', () => {
  const out = variants(undefined, ['go']);
  const pkg = text(out, 'packages/go/zz_generated_variants.go');
  assert.match(pkg, /type Figure interface \{\n\tisFigure\(\)\n\}/);
  assert.match(pkg, /type FigureDot struct\{\}\n\nfunc \(FigureDot\) isFigure\(\) \{\}/);
  // A field of the variant is the interface, a field that may be left out a pointer.
  assert.match(pkg, /type FigureGroup struct \{\n\tItems \[\]Figure\n\tFrame Figure\n\tBack  \*Figure\n\}/);
  assert.match(pkg, /type FigureLabel struct \{\n\tText string\n\tAt   \*uint64\n\}/);
  assert.match(pkg, /^func Grown\(figure Figure\) \(Figure, error\)/m);
  // The number of the case and its fields; a value that is no case struct is 2^64 - 1.
  assert.match(pkg, /case FigureCircle:\n\t\tenc\.Uint\(1\)\n\t\tenc\.Float\(case0\.Radius\)/);
  assert.match(pkg, /default:\n\t\tenc\.Uint\(\^uint64\(0\)\)/);
  assert.match(pkg, /switch dec\.Case\(4\) \{\n\tcase 0:\n\t\tvalue = FigureDot\{\}/);
  // A variant may hold itself, so the functions of its package encode and decode it.
  assert.match(pkg, /^func encodeFigure\(enc \*binding\.Writer, value Figure\) \{\n\tswitch case0 := value\.\(type\) \{/m);
  assert.match(pkg, /^\tencodeFigure\(enc, figure\)$/m);
  assert.match(pkg, /^\tvalue0 = decodeFigure\(dec\)$/m);
  const lib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(lib, /fn in_figure\(input: &mut &\[u8\], subject: &str\) -> Result<polyspec_variants::Figure, Fail> \{\n\s*match uint_in\(input\)\? \{/);
  assert.match(lib, /polyspec_variants::Figure::Dot \{\}/);
  assert.match(lib, /let field_frame: Box<polyspec_variants::Figure> = Box::new\(in_figure\(input, "Frame"\)\?\);/);
  assert.match(lib, /let field_back: Option<Box<polyspec_variants::Figure>> = optional_in\([^\n]*\.map\(Box::new\);/);
  assert.match(lib, /let field_items: Vec<polyspec_variants::Figure> = /);
  assert.match(lib, /_ => Err\(binding_error\(BindingError::InvalidArgumentType \{ subject: subject\.to_owned\(\), expected: String::from\("Figure"\) \}\)\),/);
  assert.match(lib, /fn out_figure\(output: &mut Vec<u8>, value: impl Borrow<polyspec_variants::Figure>\) \{\n\s*match value\.borrow\(\) \{/);
  assert.match(lib, /polyspec_variants::Figure::Circle \{ radius: field_radius \} => \{\n\s*uint_out\(output, 1_u64\);\n\s*float_out\(output, \*field_radius\);/);
  assert.doesNotMatch(lib, /polyspec_variants::Figure::[A-Za-z]+ \{[^}]*\}\s*=>[^\n]*\n\s*_ =>/);
  // G-5: a case value is the struct of its case; a field left out is nil.
  const tests = text(out, 'packages/go/zz_generated_test.go');
  assert.match(tests, /Grown\(FigureGroup\{Items: \[\]Figure\{FigureCircle\{Radius: 1\.25\}, FigureLabel\{Text: "ab", At: ptr\(uint64\(2\)\)\}\}, Frame: FigureDot\{\}, Back: nil\}\)/);
  assert.match(tests, /Grown\(FigureLabel\{Text: "ok", At: nil\}\)/);
  assert.match(tests, /Back: ptr\[Figure\]\(FigureGroup\{/);
});

test('a case gives a map as an object of its entries or as an array of [key, value], whose order the test keeps (G-5)', () => {
  const pairs = (counts: unknown, targets: Lang[]): Map<string, string | Buffer> => {
    const { contract, caseFiles } = shapes();
    const cases = caseFiles.get('contracts/cases.json') as any;
    cases.split_counts[0].counts = counts;
    cases.split_counts[0].result = [[['10', 1]], [['2', 2]]];
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles, targets });
  };
  // The keys 10 and 2 of an object of JSON come in the order 2, 10; the array keeps the order of the case.
  const given = [['10', 1], ['2', 2]];
  assert.match(text(pairs(given, ['python']), pythonTests), /\{"10": 1, "2": 2\}/);
  assert.match(text(pairs(given, ['node']), nodeTests), /new Map\(\[\['10', 1\], \['2', 2\]\]\)/);
  assert.match(text(pairs(given, ['php']), phpTests), /\["10" => 1, "2" => 2\]/);
  assert.match(text(pairs(given, ['wasm']), 'packages/ts/wasm/generated/tests/generated.test.mjs'), /new Map\(\[\['10', 1\], \['2', 2\]\]\)/);
  assert.match(text(pairs(given, ['go']), 'packages/go/zz_generated_test.go'), /\.Set\("10", [^\n]*\n[^\n]*\.Set\("2", /);
  // An entry that is no [key, value] with a text key is named.
  const refusal = (counts: unknown): string => [...pairs(counts, ['python']).values()].map(String).join('\n');
  assert.match(refusal([['10', 1], ['2']]), /a case value of a map is an object of its entries or an array of \[key, value\] whose keys are texts, not \[\[\\"10\\",1\],\[\\"2\\"\]\]/);
  assert.match(refusal([[10, 1]]), /a case value of a map is an object of its entries or an array of \[key, value\] whose keys are texts, not \[\[10,1\]\]/);
});

test('a case value of a variant whose tag names no case is named with the value of a case, as the contract states it (G-5, GN-6v)', () => {
  const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/variants/packages/rust/interface.json', import.meta.url), 'utf8'));
  const cases = readFileSync(new URL('../../../tests/e2e/variants/contracts/cases.json', import.meta.url), 'utf8');
  assert.match(cases, /"type": ?"label"/);
  const caseFiles = new Map([['contracts/cases.json', JSON.parse(cases.replace(/"type": ?"label"/, '"type": "Label"'))]]);
  let message = '';
  try {
    message = [...generate({ contract, version: '0.0.0', coreLib: 'polyspec_variants', caseFiles, targets: ['python'] }).values()].map(String).join('\n');
  } catch (error) {
    message = String(error);
  }
  assert.match(message, /a case value of the variant figure is an object whose type is the value of one of its cases, not /);
});

test('an optional field of a case whose default is {literal: null} may be left out, and is null (T-4, T-9, GN-6v)', () => {
  const out = variants();
  assert.match(text(out, 'packages/python/generated/python/polyspec/variants/_types.py'), /class FigureLabel:\n[^\n]*\n\n    text: str\n    at: int \| None = None\n/);
  for (const path of ['packages/ts/generated/index.d.ts', 'packages/ts/wasm/generated/index.d.ts']) assert.match(text(out, path), /readonly at\?: number \| null;/, path);
  assert.match(text(out, 'packages/ts/generated/lib.rs'), /let field_at: Option<u64> = default_in\(member\(value, "at", subject\)\?, \|value\| optional_in\(value, \|value\| uint_in\(value, "at"\)\)\)\.map\(Option::flatten\)\?;/);
  assert.match(text(out, 'packages/ts/wasm/generated/lib.rs'), /let field_at: Option<u64> = default_in\(&member\(value, "at", subject\)\?, \|value\| optional_in\(value, \|value\| uint_in\(value, "at"\)\)\)\.map\(Option::flatten\)\?;/);
  // G-5: a case value of an input may leave the field out; PHP gives null at its place, and a result holds null.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /pkg\.grown\(pkg\.FigureLabel\(text="ok"\)\)/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /pkg\.grown\(\{ type: 'label', text: 'ok' \}\)\), ordered\(\{ type: 'label', text: 'OK', at: null \}\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /grown\(new \\Polyspec\\Variants\\FigureLabel\(text: "ok", at: null\)\)/);
  // Any other default of a case field is refused by name.
  assert.throws(() => variants((c) => { Object.assign(unitOf(c, 'figure').cases[2].fields[0], { default: { literal: 'a' }, default_core: 'polyspec_variants::TEXT' }); }), /figure\.label\.text: a field default of a case other than \{literal: null\} of an optional field is not generated yet \(T-4, T-9\)/);
});

test('a class that implements a callback interface has its members and stands for the callback (U-1, U-3, GN-6w)', () => {
  const out = variants();
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    assert.match(text(out, path), /<polyspec_variants::Ribbon as polyspec_variants::Tail>::last\((&self\.inner|this), count\)/, path);
  }
  assert.match(text(out, 'packages/python/generated/python/polyspec/variants/_native.pyi'), /class Ribbon:[\s\S]*def last\(self, count: int\) -> bytes: \.\.\./);
  for (const path of ['packages/ts/generated/index.d.ts', 'packages/ts/wasm/generated/index.d.ts']) {
    assert.match(text(out, path), /export declare class Ribbon implements Tail \{[\s\S]*last\(count: number\): Uint8Array;/, path);
  }
  assert.match(text(out, 'packages/php-ext/generated/polyspec_variants.stub.php'), /final class Ribbon implements \\Polyspec\\Variants\\Tail\n/);
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /#\[php\(implements\(ce = interface_tail, stub = "\\\\Polyspec\\\\Variants\\\\Tail"\)\)\]/);
  // B-4, GN-6v, GN-6w: the interfaces of the extension are found without a panic, and startup fails the start when it
  // does not find the interface of a variant before the classes of its cases, or the interface of a callback.
  const phpLib = text(out, 'packages/php-ext/generated/lib.rs');
  assert.doesNotMatch(phpLib, /panic!\("B-4/);
  assert.match(phpLib, /fn variant_figure\(\) -> &'static ClassEntry \{\n {4}own_interface\("Polyspec\\\\Variants\\\\Figure"\)\n\}/);
  assert.match(phpLib, /fn interface_tail\(\) -> &'static ClassEntry \{\n {4}own_interface\("Polyspec\\\\Variants\\\\Tail"\)\n\}/);
  assert.match(phpLib, /\n {4}if builtin_class\("Polyspec\\\\Variants\\\\Figure"\)\.is_none\(\) \{\n {8}return 1;\n {4}\}\n {4}let registered = ClassBuilder::new\("Polyspec\\\\Variants\\\\Figure/);
  assert.match(phpLib, /\n {4}if builtin_class\("Polyspec\\\\Variants\\\\Tail"\)\.is_none\(\) \{\n {8}return 1;\n {4}\}\n {4}0\n\}/);
  // GN-13f: an instance value stands at the place of the callback that its class implements.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /pkg\.tail_of\(pkg\.Ribbon\("abc"\), 2\)/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /pkg\.tailOf\(new pkg\.Ribbon\('abc'\), 2\)/);
  // Go: the pointer to the class has the method of the Go interface, which the dispatch of U-3 calls.
  const go = text(variants(undefined, ['go']), 'packages/go/zz_generated_variants.go');
  assert.match(go, /^func \(this \*Ribbon\) Last\(count uint64\) \(\[\]byte, error\) \{/m);
  assert.match(go, /^var _ Tail = \(\*Ribbon\)\(nil\)$/m);
  assert.match(text(out, 'packages/go/internal/ffi/generated/lib.rs'), /<polyspec_variants::Ribbon as polyspec_variants::Tail>::last\(this, count\)/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /made0, failure1 := NewRibbon\(\[\]byte\("abc"\)\)\n[\s\S]*?TailOf\(made0, 2\)/);
  assert.throws(() => variants((c) => { unitOf(c, 'tail').members[0].core.receiver = '&mut self'; }), /ribbon: the member tail\.last that it implements takes the receiver &mut self, which an implemented member is not generated for yet \(GN-6w\)/);
  assert.throws(() => variants((c) => { unitOf(c, 'ribbon').abstract = true; }), /ribbon: an abstract class is not generated yet/);
});

test('a member that writes its receiver takes a source and a default in one call (GN-6h, GN-6i, GN-6j)', () => {
  const out = shaped();
  // The arguments are converted, the default left as None, before the write lock of the receiver is taken.
  const lines: Record<string, RegExp> = {
    'packages/python/generated/lib.rs': /let source: Vec<u8> = source_in\(py, source, "source"\)\?;\n\s+let times: Option<u64> = default_in\(&times, [^\n]*\n\s+let mut receiver = self\.inner\.write\("Buffer"\)[^\n]*\n\s+let receiver = &mut \*receiver;\n\s+let result = polyspec_shapes::Buffer::append\(receiver, &source, times\);/,
    'packages/ts/generated/lib.rs': /let source: Vec<u8> = source_in\(source, "source"\)\?;\n\s+let times: Option<u64> = default_in\(times, [^\n]*\n\s+let mut receiver = self\.inner\.write\("Buffer"\)[^\n]*\n\s+let receiver = &mut \*receiver;\n\s+let result = polyspec_shapes::Buffer::append\(receiver, &source, times\);/,
    'packages/php-ext/generated/lib.rs': /let source: Vec<u8> = latin1_in\(source, "source"\)\?;\n\s+let times: Option<u64> = default_in\(times, [^\n]*\n\s+let mut receiver = self\.inner\.write\("Buffer"\)[^\n]*\n\s+let receiver = &mut \*receiver;\n\s+let result = polyspec_shapes::Buffer::append\(receiver, &source, times\);/,
  };
  for (const [path, line] of Object.entries(lines)) {
    assert.match(text(out, path), line, path);
    assert.match(text(out, path), /inner: binding_core::Exclusive<polyspec_shapes::Buffer>,/, path);
  }
  // The generated tests call the member with the default left out and given, and with a text and its bytes.
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(python, /_outcome\(lambda: pkg\.Buffer\("ab"\)\.append\("c"\)\),\n\s+_outcome\(lambda: pkg\.Buffer\("ab"\)\.append\("c", 1\)\),/);
  assert.match(python, /_outcome\(lambda: pkg\.Buffer\("ab"\)\.append\("a\\xe9"\)\),\n\s+_outcome\(lambda: pkg\.Buffer\("ab"\)\.append\(bytes\.fromhex\("61c3a9"\)\)\),/);
  assert.match(python, /def test_b5c_buffer_refuses_a_poisoned_object\(self\) -> None:/);
});

test('a source parameter takes a text or bytes, and Node bytes are a Uint8Array (T-1, T-7, GN-6j)', () => {
  const out = shaped();
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /let source: Vec<u8> = source_in\(py, source, "source"\)\?;/);
  assert.match(text(out, 'packages/python/generated/python/polyspec/shapes/_native.pyi'), /def length\(source: str \| bytes \| bytearray \| memoryview\) -> int: \.\.\./);
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /bytes_in\(value, subject\)\.map_err\(\|_other\| type_error\(subject, "string or Uint8Array"\)\)/);
  assert.match(node, /match unsafe \{ value\.cast::<Uint8Array>\(\) \}/);
  assert.match(node, /Uint8Array::new\(value\.as_ref\(\)\.to_vec\(\)\)/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export declare function reversed\(data: Uint8Array\): Uint8Array;/);
  // A PHP string is its bytes, which the core judges.
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /let source: Vec<u8> = latin1_in\(source, "source"\)\?;/);
  // G-5: a text and its UTF-8 give the same, and what is neither is refused.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_t1_length_source_takes_a_text_as_its_utf8_bytes/);
  const nodeTests = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(nodeTests, /test\('T-1: length takes a text in source as its UTF-8 bytes'/);
  assert.match(nodeTests, /test\('T-7: reversed refuses a data that is not a Uint8Array'/);
  // G-4: a source is a parameter only, and Go and WASM generate none.
  assert.throws(() => shaped((c) => { member(c, 'shapes.reversed').returns = 'source'; }), /the type source is generated as a parameter only \(T-1\)/);
  // T-1: in Go a source is a []byte, which holds the bytes of any string.
  assert.match(text(out, 'packages/go/zz_generated_shapes.go'), /^func Length\(source \[\]byte\) \(uint64, error\)/m);
});

test('a parameter or field with a default is None for the core when it is left out (U-2, T-4, GN-6i)', () => {
  const out = shaped();
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /#\[pyo3\(signature = \(text, times = Given::Omitted, separator = Given::Omitted\)\)\]/);
  assert.match(python, /let times: Option<u64> = default_in\(&times, \|value\| uint_in\(py, value, "times"\)\)\?;/);
  assert.match(python, /#\[pyo3\(signature = \(text, \*, prefix, upper = Given::Omitted, width = Given::Omitted\)\)\]/);
  // The constant of the core that default_core names is the declared value; a {const} default whose constant is
  // default_core itself is asserted once, by the constant (U-5).
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    const lib = text(out, path);
    assert.match(lib, /const _: \(\) = assert!\(same_text\(polyspec_shapes::DEFAULT_SEPARATOR, ","\)\);/);
    assert.match(lib, /const _: \(\) = assert!\(!polyspec_shapes::DEFAULT_UPPER\);/);
    assert.doesNotMatch(lib, /DEFAULT_TIMES == polyspec_shapes::DEFAULT_TIMES/);
  }
  const pyi = text(out, 'packages/python/generated/python/polyspec/shapes/_native.pyi');
  assert.match(pyi, /def repeat\(text: str, times: int = 1, separator: str = ","\) -> str: \.\.\./);
  assert.match(pyi, /def frame\(text: str, \*, prefix: str, upper: bool = False, width: int = \.\.\.\) -> str: \.\.\./);
  assert.match(pyi, /def total\(numbers: Sequence\[int\] = \.\.\.\) -> int: \.\.\./);
  const dts = text(out, 'packages/ts/generated/index.d.ts');
  assert.match(dts, /export declare function repeat\(text: string, times\?: number, separator\?: string\): string;/);
  assert.match(dts, /export declare function total\(numbers\?: Iterable<number>\): number;/);
  const stub = text(out, 'packages/php-ext/generated/polyspec_shapes.stub.php');
  assert.match(stub, /function repeat\(mixed \$text, mixed \$times = 1, mixed \$separator = ","\): string \{\}/);
  assert.match(stub, /function frame\(mixed \$text, mixed \$prefix, mixed \$upper = false, mixed \$width = null\): string \{\}/);
  assert.match(stub, /function total\(mixed \$numbers = \[\]\): int \{\}/);
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /fn default_in<T>\(value: Option<&Zval>/);
  // G-5: the call without the argument and the call with its declared value give the same.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_u2_repeat_times_left_out_is_its_default/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_u2_repeat_times_takes_none_as_a_value/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /test\('U-2: total without numbers is the call with its default'/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /function testU2repeatSeparatorLeftOutIsItsDefault\(\)/);
  // A {computed} default has no declared value, so it has no such test.
  assert.doesNotMatch(text(out, 'packages/python/generated/tests/test_generated.py'), /test_u2_frame_width_left_out/);
  // G-4: each default that is not generated is refused by name.
  const parameter = (c: any, id: string, name: string): any => member(c, id).parameters.find((p: any) => p.name.join('_') === name);
  const field = (c: any, name: string): any => unitOf(c, 'frame_options').fields.find((f: any) => f.name.join('_') === name);
  assert.throws(() => shaped((c) => { parameter(c, 'shapes.repeat', 'times').type = { optional: 'uint' }; }), /shapes\.repeat\.times: a default of an optional type is \{literal: null\} or \{computed\} \(U-2\)/);
  assert.throws(() => shaped((c) => { delete parameter(c, 'shapes.repeat', 'separator').default_core; }), /a \{literal\} or \{const\} default names the constant of the core in default_core \(U-2\)/);
  assert.throws(() => shaped((c) => { delete field(c, 'upper').default_core; }), /a \{literal\} or \{const\} default names the constant of the core in default_core \(U-2\)/);
  assert.throws(() => shaped((c) => { member(c, 'shapes.repeat').parameters.push({ name: ['last'], type: 'uint', required: true }); }), /shapes\.repeat: the required last follows a parameter with a default, which is not generated yet \(U-2\)/);
  assert.throws(() => shaped((c) => { parameter(c, 'shapes.total', 'numbers').default = { empty: 'map' }; }), /the default \{empty: "map"\} of the type \{"list":"uint"\} is not generated \(U-2\)/);
  assert.throws(() => shaped((c) => { member(c, 'shapes.frame').returns = { unit: 'frame_options' }; }), /frame_options\.upper: a field default of a record with the result form is not generated yet \(T-4\)/);
  // U-2, T-4: in Go a parameter or field with a default is a pointer, nil when the caller leaves it out.
  const goShapes = text(shaped(), 'packages/go/zz_generated_shapes.go');
  assert.match(goShapes, /^func Repeat\(text_ string, times \*uint64, separator \*string\) \(string, error\)/m);
  assert.match(text(shaped(), 'packages/go/zz_generated_test.go'), /func TestU2RepeatWithoutTimesIsTheCallWithItsDefault/);
  // WASM: a parameter or field that may be left out is undefined when it is, and the ES module counts it.
  const wasmOut = generate({ ...shapes(), version: '0.0.0', coreLib: 'polyspec_shapes', targets: ['wasm'] });
  const wasmLib = text(wasmOut, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasmLib, /let times: Option<u64> = default_in\(&times, \|value\| uint_in\(value, "times"\)\)\?;/);
  assert.match(wasmLib, /const _: \(\) = assert!\(same_text\(polyspec_shapes::DEFAULT_SEPARATOR, ","\)\);/);
  assert.match(text(wasmOut, 'packages/ts/wasm/generated/index.mjs'), /if \(args\.length < 1 \|\| args\.length > 3\) \{\n {4}throw new TypeError\(`repeat\(\) takes 1 to 3 arguments/);
  assert.match(text(wasmOut, 'packages/ts/wasm/generated/index.d.ts'), /export declare function repeat\(text: string, times\?: number, separator\?: string\): string;/);
});

test('a record parameter whose every field has a default may be left out as a whole (U-2 {empty: "object"}, GN-6i)', () => {
  const out = shaped();
  // Python and PHP take the fields as keywords and named arguments, which are all left out with the record.
  assert.match(text(out, 'packages/python/generated/python/polyspec/shapes/_native.pyi'), /def wrap\(text: str, \*, left: str = "\[", right: str = "\]"\) -> str: \.\.\./);
  assert.match(text(out, 'packages/php-ext/generated/polyspec_shapes.stub.php'), /function wrap\(mixed \$text, mixed \$left = "\[", mixed \$right = "\]"\): string \{\}/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_gn13e_wrap_options_left_out\(self\) -> None:/);
  // Node and WASM: the options record is a trailing argument that may be missing or undefined, whose fields are then
  // each left out; the core gets the record with every field None.
  const wasmOut = generate({ ...shapes(), version: '0.0.0', coreLib: 'polyspec_shapes', targets: ['wasm'] });
  for (const [files, dir] of [[out, 'packages/ts/generated'], [wasmOut, 'packages/ts/wasm/generated']] as const) {
    assert.match(text(files, `${dir}/index.d.ts`), /export declare function wrap\(text: string, options\?: WrapOptions\): string;/);
    assert.match(text(files, `${dir}/lib.rs`), /let left: Option<String> = default_in\(&?member_or_undefined\(&?options, "left", "options"\)\?/);
    const tests = text(files, `${dir}/tests/generated.test.mjs`);
    assert.match(tests, /test\('GN-13e: wrap options_left_out', \(\) => \{\n[^\n]*pkg\.wrap\('a'\)/);
    assert.match(tests, /test\('U-2: wrap without left is the call with its default'/);
    // G-7: the text is required, so a call without arguments is too short.
    assert.match(tests, /test\('G-7: wrap counts and names its arguments', \(\) => \{\n\s+assert\.throws\(\(\) => pkg\.wrap\(\)/);
  }
  assert.match(text(out, 'packages/ts/generated/index.cjs'), /if \(args\.length < 1 \|\| args\.length > 2\) \{\n {4}throw new TypeError\(`wrap\(\) takes 1 to 2 arguments/);
  assert.match(text(wasmOut, 'packages/ts/wasm/generated/index.mjs'), /if \(args\.length < 1 \|\| args\.length > 2\) \{\n {4}throw new TypeError\(`wrap\(\) takes 1 to 2 arguments/);
  // G-4: a record with a field that has no default is not left out, because the core would get no value of that field.
  const parameter = (c: any, id: string, name: string): any => member(c, id).parameters.find((p: any) => p.name.join('_') === name);
  assert.throws(() => shaped((c) => { const p = parameter(c, 'shapes.frame', 'options'); delete p.required; p.default = { empty: 'object' }; }), /shapes\.frame\.options: the default \{empty: "object"\} leaves out the record, but its field prefix has no default \(U-2\)/);
  assert.throws(() => shaped((c) => { parameter(c, 'shapes.wrap', 'options').default = { empty: 'list' }; }), /shapes\.wrap\.options: the default \{empty: "list"\} of a record parameter is not generated \(U-2\)/);
});

test('a default of an optional type is one Option, None when it is left out or null (U-2, GN-6i, GN-15e)', () => {
  // shapes.pad takes fill: optional<text> = {literal: null} and the record pad_options, whose width is optional<uint> =
  // {computed} and whose end is optional<text> = {literal: null}.
  const out = shaped();
  const wasmOut = generate({ ...shapes(), version: '0.0.0', coreLib: 'polyspec_shapes', targets: ['wasm'] });
  const libs = [[out, 'packages/python/generated/lib.rs'], [out, 'packages/ts/generated/lib.rs'], [out, 'packages/php-ext/generated/lib.rs'], [wasmOut, 'packages/ts/wasm/generated/lib.rs']] as const;
  for (const [files, path] of libs) {
    const lib = text(files, path);
    assert.match(lib, /let fill: Option<String> = default_in\([^\n]*\)\.map\(Option::flatten\)\?;/, `${path}: left out and null are both None`);
    assert.match(lib, /let width: Option<u64> = default_in\([^\n]*\)\.map\(Option::flatten\)\?;/, `${path}: a {computed} default of an optional type`);
    assert.match(lib, /let end: Option<String> = default_in\([^\n]*\)\.map\(Option::flatten\)\?;/, `${path}: a field`);
    assert.match(lib, /polyspec_shapes::pad\(&text, fill\.as_deref\(\), &options\)/, `${path}: the core takes the optional type itself`);
    assert.doesNotMatch(lib, /Option<Option</, `${path}: no second Option`);
  }
  // The declarations show null as the declared value.
  assert.match(text(out, 'packages/python/generated/python/polyspec/shapes/_native.pyi'), /def pad\(text: str, fill: str \| None = None, \*, side: [^\n]*, width: int \| None = \.\.\., end: str \| None = None\) -> str: \.\.\./);
  assert.match(text(out, 'packages/php-ext/generated/polyspec_shapes.stub.php'), /function pad\(mixed \$text, mixed \$fill = null, mixed \$side = "left", mixed \$width = null, mixed \$end = null\): string \{\}/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export declare function pad\(text: string, fill\?: string \| null, options\?: PadOptions\): string;/);
  // GN-13d: the call without fill is the call with null, and null is a value of an optional type, so it is not
  // tested as a refused value.
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(python, /def test_u2_pad_fill_left_out_is_its_default/);
  assert.doesNotMatch(python, /def test_u2_pad_fill_takes_none_as_a_value/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /test\('U-2: pad without fill is the call with its default'/);
  assert.doesNotMatch(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /U-2: pad takes null for fill as a value/);
  // GN-6i: a parameter with a default that the options record follows is left out by undefined in its place in Node
  // and WASM, by keywords in Python, by named arguments in PHP and by nil in Go.
  for (const file of ['packages/ts/generated/tests/generated.test.mjs', 'packages/ts/wasm/generated/tests/generated.test.mjs']) {
    const js = text(out, file);
    assert.match(js, /test\('U-2: pad without side is the call with its default', \(\) => \{\n\s+assert\.deepStrictEqual\(outcome\(\(\) => pkg\.pad\('ab'\)\), outcome\(\(\) => pkg\.pad\('ab', undefined, \{ side: 'left' \}\)\)\);/);
    assert.match(js, /pkg\.pad\('ab', undefined, \{ end: null \}\)/);
    assert.match(js, /test\('GN-13e: pad an_end', \(\) => \{\n\s+assert\.deepStrictEqual\(ordered\(pkg\.pad\('ab', undefined, \{ end: '!' \}\)\), ordered\('ab!'\)\);/);
    assert.doesNotMatch(js, /pkg\.pad\('[^']*', \{/);
    // A trailing parameter that is left out is still a missing argument.
    assert.match(js, /outcome\(\(\) => pkg\.pad\('ab'\)\), outcome\(\(\) => pkg\.pad\('ab', null\)\)/);
  }
  assert.match(python, /result = pkg\.pad\("ab", end="!"\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /\\Polyspec\\Shapes\\pad\("ab", end: "!"\)/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /Pad\("ab", nil, PadOptions\{Side: nil, Width: nil, End: ptr\("!"\)\}\)/);
  // GN-15e: in Go the optional type keeps its one pointer.
  const goShapes = text(out, 'packages/go/zz_generated_shapes.go');
  assert.match(goShapes, /^func Pad\(text_ string, fill \*string, /m);
  assert.match(goShapes, /\tEnd +\*string\n/);
  // GN-15e: an optional of a keyed map, which is itself the pointer *KeyedMap[T], takes no second pointer: its nil
  // is the missing value.
  assert.match(goShapes, /^func Present\(maps \[\]\*KeyedMap\[string\]\) \(\[\]\*KeyedMap\[string\], error\)/m);
  assert.doesNotMatch(goShapes, /\*\*/);
  assert.doesNotMatch(text(out, 'packages/go/zz_generated_test.go'), /\*\*|ptr\((?:mapWith|keyedWith|NewMap|NewKeyedMap)/);
  assert.doesNotMatch(text(out, 'packages/go/internal/ffi/generated/lib.rs'), /Option<Option</);
  // G-4: another default of an optional type is refused by name.
  const parameter = (c: any, id: string, name: string): any => member(c, id).parameters.find((p: any) => p.name.join('_') === name);
  assert.throws(() => shaped((c) => { parameter(c, 'shapes.pad', 'fill').default = { literal: '.' }; }), /shapes\.pad\.fill: a default of an optional type is \{literal: null\} or \{computed\} \(U-2\)/);
  // T-4: a field of an optional type with a default has the result form of its type, so a record that a member also
  // returns is generated, and a None of the core is the null of the language.
  const returned = shaped((c) => { unitOf(c, 'text_measure').fields.push({ name: ['note'], type: { optional: 'text' }, default: { literal: null }, reason: 'SH-3' }); });
  assert.match(text(returned, 'packages/python/generated/python/polyspec/shapes/_types.py'), /class TextMeasure:[\s\S]*?\n    note: str \| None\n/);
});

test('a {literal} default of an enum names its constant in default_core, which matches! asserts (U-2, GN-6i)', () => {
  const out = shaped();
  const wasmOut = generate({ ...shapes(), version: '0.0.0', coreLib: 'polyspec_shapes', targets: ['wasm'] });
  for (const [files, path] of [[out, 'packages/python/generated/lib.rs'], [out, 'packages/ts/generated/lib.rs'], [out, 'packages/php-ext/generated/lib.rs'], [wasmOut, 'packages/ts/wasm/generated/lib.rs']] as const) {
    const lib = text(files, path);
    assert.match(lib, /const _: \(\) = assert!\(matches!\(polyspec_shapes::DEFAULT_SIDE, polyspec_shapes::Side::Left\)\);/, path);
    assert.match(lib, /let side: Option<polyspec_shapes::Side> = default_in\(/, path);
  }
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_u2_pad_side_left_out_is_its_default/);
  // G-4: an enum default without its constant, or of a value that is no variant, is refused by name.
  const field = (c: any, name: string): any => unitOf(c, 'pad_options').fields.find((f: any) => f.name.join('_') === name);
  assert.throws(() => shaped((c) => { delete field(c, 'side').default_core; }), /pad_options\.side: a \{literal\} or \{const\} default names the constant of the core in default_core \(U-2\)/);
  assert.throws(() => shaped((c) => { field(c, 'side').default = { literal: 'up' }; }), /pad_options\.side: the default \{literal: "up"\} of the type \{"unit":"side"\} is not generated \(U-2\)/);
});

test('a {literal: null} default of a value type is None without a constant, and null is a value (U-2, GN-6i)', () => {
  // sample.describe takes value: data = {literal: null}.
  const out = generate({ contract: JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8')), version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    const lib = text(out, path);
    assert.match(lib, /let value: Option<polyspec_sample::Data> = default_in\(/, path);
    assert.match(lib, /polyspec_sample::describe\(value\.as_ref\(\)\)/, path);
    assert.doesNotMatch(lib, /DEFAULT_VALUE|assert!\([^\n]*describe/, `${path}: no constant and no assertion`);
  }
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(python, /def test_u2_describe_value_left_out_is_its_default/);
  assert.doesNotMatch(python, /def test_u2_describe_value_takes_none_as_a_value/);
});

test('a path is the bytes of an OS path in every place, and each target judges it by binding_core (T-1, B-3, GN-6y)', () => {
  // shapes.joined takes a path and a text and returns a path; shapes.parent_of returns an optional<path>. Both leave out WASM (CK-15).
  const out = shaped();
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs']) {
    const lib = text(out, path);
    assert.match(lib, /let dir: std::path::PathBuf = path_in\(/, `${path}: a path parameter`);
    assert.match(lib, /polyspec_shapes::joined\(&dir, &name\)/, `${path}: the core takes &Path`);
    assert.match(rustFn(lib, 'path_in'), /binding_core::path_from_bytes\(/, `${path}: the bytes are judged by binding_core`);
    assert.match(rustFn(lib, 'path_out'), /binding_core::path_bytes\(/, `${path}: the bytes that leave`);
  }
  // Python: os.fsencode and os.fsdecode; a TypeError of fsencode is invalid_argument_type, a UnicodeError invalid_path.
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(rustFn(python, 'path_in'), /"fsencode"/);
  assert.match(rustFn(python, 'path_in'), /PyUnicodeError/);
  assert.match(rustFn(python, 'path_out'), /"fsdecode"/);
  // Node: a string as its UTF-8 or a Uint8Array in; out a string when the bytes are UTF-8, else a Uint8Array.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(rustFn(node, 'path_out'), /from_utf8/);
  // The declarations.
  assert.match(text(out, 'packages/python/generated/python/polyspec/shapes/_native.pyi'), /def joined\(dir: str \| bytes \| PathLike\[str\] \| PathLike\[bytes\], name: str\) -> str: \.\.\./);
  assert.match(text(out, 'packages/python/generated/python/polyspec/shapes/_native.pyi'), /def parent_of\(path: [^\n]*\) -> str \| None: \.\.\./);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export declare function joined\(dir: string \| Uint8Array, name: string\): string \| Uint8Array;/);
  assert.match(text(out, 'packages/php-ext/generated/polyspec_shapes.stub.php'), /function joined\(mixed \$dir, mixed \$name\): string \{\}/);
  assert.match(text(out, 'packages/go/zz_generated_shapes.go'), /^func Joined\(dir string, name string\) \(string, error\)/m);
  assert.match(text(out, 'packages/go/zz_generated_shapes.go'), /^func ParentOf\(path string\) \(\*string, error\)/m);
  // G-5: a NUL byte is kind invalid_path, a value of another type invalid_argument_type, in each language.
  const pythonTests = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(pythonTests, /def test_t1_joined_dir_refuses_a_nul_byte\(self\) -> None:\n[^\n]*\n\s+pkg\.joined\("a\\x00b", [^\n]*\n\s+self\.assertEqual\(caught\.exception\.kind, "invalid_path"\)/);
  assert.match(pythonTests, /def test_t1_joined_dir_refuses_what_is_no_path\(self\) -> None:/);
  const nodeTests = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(nodeTests, /test\('T-1: joined refuses a NUL byte in dir'/);
  assert.match(nodeTests, /test\('B-3: joined refuses an unpaired surrogate in dir'/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /function testT1joineddirRefusesANulByte\(\): void/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /func TestT1JoinedRefusesANulByteInDir\(t \*testing\.T\)/);
  // WASM has no OS path: the members are absent, and a path that reaches the target is refused by name.
  const wasmOut = generate({ ...shapes(), version: '0.0.0', coreLib: 'polyspec_shapes', targets: ['wasm'] });
  assert.doesNotMatch(text(wasmOut, 'packages/ts/wasm/generated/lib.rs'), /joined/);
  assert.throws(
    () => { const { contract, caseFiles } = shapes(); delete member(contract, 'shapes.joined').only; generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles, targets: ['wasm'] }); },
    /shapes\.joined: a path is not generated for WASM, which has no OS path \(Q-4, CK-15, GN-6y\)/,
  );
  // G-5: a case value of a path is resolved in the directory of the test, the input and the expected result alike.
  assert.match(pythonTests, /pkg\.joined\(self\._case_path\("a"\), "b"\)/);
  assert.match(pythonTests, /self\._case_path\("a\/b"\)/);
  assert.match(pythonTests, /def _case_path\(self, relative: str\) -> str:/);
  assert.match(nodeTests, /pkg\.joined\(casePath\('a'\), 'b'\)/);
  assert.match(nodeTests, /afterEach\(/);
  const phpTests = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(phpTests, /joined\(\$this->casePath\("a"\), "b"\)/);
  assert.match(phpTests, /protected function tearDown\(\): void/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /Joined\(casePath\(t, "a"\), "b"\)/);
  // G-4, GN-13e: a case path that would leave the directory of the test is refused by name: the test of the case fails
  // with the reason in every target, and the other tests are written.
  for (const bad of ['/a', '../a', 'a/../b', '']) {
    const { contract, caseFiles } = shapes();
    const kase = (caseFiles.get('contracts/cases.json') as any).joined[0];
    kase.dir = bad;
    const refusedOut = generate({ contract, version: '0.0.0', coreLib: 'polyspec_shapes', caseFiles });
    const reason = `a case value of the type path is a relative path inside the directory of the test, without .. (GN-6y), not ${JSON.stringify(bad)}`;
    const written: [string, (text: string) => string][] = [
      ['packages/python/generated/tests/test_generated.py', (t) => `self.fail(${JSON.stringify(t)})`],
      ['packages/ts/generated/tests/generated.test.mjs', (t) => `assert.fail('${t.replaceAll("'", "\\'")}')`],
      ['packages/php-ext/generated/tests/GeneratedTest.php', (t) => `self::fail(${JSON.stringify(t)})`],
      ['packages/go/zz_generated_test.go', (t) => `t.Fatal(${JSON.stringify(t)})`],
    ];
    for (const [path, fails] of written) {
      const tests = text(refusedOut, path);
      assert.ok(tests.includes(fails(`the case ${kase.id} of shapes.joined: ${reason}`)), `${path}: ${JSON.stringify(bad)}`);
    }
  }
});

test('an error unit is a class under its parent, and a kind names the class it is thrown as (E-2, GN-7a)', () => {
  const out = shaped();
  const errors = text(out, 'packages/python/generated/python/polyspec/shapes/_errors.py');
  assert.match(errors, /class ParseError\(ShapesValueError\):/);
  assert.match(errors, /class Utf8Error\(ParseError\):/);
  // P-4: a parent is written before the class that extends it.
  assert.ok(errors.indexOf('class ParseError(') < errors.indexOf('class Utf8Error('));
  const cjs = text(out, 'packages/ts/generated/index.cjs');
  assert.match(cjs, /class ParseError extends ShapesValueError \{/);
  assert.match(cjs, /class Utf8Error extends ParseError \{/);
  const stub = text(out, 'packages/php-ext/generated/polyspec_shapes.stub.php');
  assert.match(stub, /\n {4}class ParseError extends \\Polyspec\\Shapes\\ShapesValueError\n/);
  assert.match(stub, /\n {4}final class Utf8Error extends \\Polyspec\\Shapes\\ParseError\n/);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /\.extends\(\(registered_class_0, "\\\\Polyspec\\\\Shapes\\\\ShapesValueError"\)\)/);
  assert.match(php, /\.extends\(\(registered_class_6, "\\\\Polyspec\\\\Shapes\\\\ParseError"\)\)\n\s+\.flags\(ClassFlags::Final\)/);
  assert.match(php, /fn registered_class_0\(\) -> &'static ClassEntry \{/);
  // A kind with `class` is thrown as that class, one without as the class of its category.
  for (const path of ['packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    assert.match(text(out, path), /Error::Empty \{ \.\. \} => 6,\n\s+polyspec_shapes::Error::NotUtf8 \{ \.\. \} => 7,\n\s+polyspec_shapes::Error::TooMany \{ \.\. \} => 0,/);
  }
  // I-3: units without a property define none, so the crate holds no helper that nothing calls.
  assert.doesNotMatch(text(out, 'packages/ts/generated/lib.rs'), /fn read_only\(|PropertyAttributes/);
  assert.doesNotMatch(php, /fn read_unit_property\(|let mut object = match error_object/);
  // B-4: the exact class of a case is the class of its kind.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /self\.assertIs\(type\(error\), pkg\.Utf8Error\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /assertSame\(\\Polyspec\\Shapes\\Errors\\Utf8Error::class, \$error::class\)/);
  // G-4: what E-2 and E-3 hold beyond that is refused by name.
  assert.throws(() => shaped((c) => { unitOf(c, 'parse_error').members = [{ id: 'parse_error.offset', name: ['offset'], kind: 'property', visibility: 'public', type: 'uint', core: 'polyspec_shapes::Error::offset' }]; }), /parse_error\.offset: a property of an error unit names a function of the core error with the receiver &self/);
  assert.throws(() => shaped((c) => { c.errors.kinds[2].class = 'frame_options'; }), /TooMany: the class frame_options is not an error unit of category value \(E-2\)/);
  assert.throws(() => shaped((c) => { unitOf(c, 'parse_error').parent = 'utf8_error'; }), /the parents form a cycle \(P-4\)/);
  // E-2, B-4: in Go the exact type of a case is the struct of its error unit, which errors.As finds as its category.
  const goTests = text(out, 'packages/go/zz_generated_test.go');
  assert.match(goTests, /failure, ok := err\.\(\*liberrors\.Utf8Error\)/);
  assert.match(goTests, /var category \*liberrors\.ShapesValueError\n\tif !errors\.As\(err, &category\) \{/);
});

test('each variant that a member raises is asserted against the core error in every crate (E-5, I-2, GN-7b)', () => {
  const { contract, caseFiles } = load();
  contract.targets.push('go', 'wasm');
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  contract.packages.node.entries['.'].conditions = { node: 'napi', browser: 'wasm' };
  for (const row of Object.values(contract.errors.classes) as Record<string, string>[]) row['wasm'] = row['node'] ?? '';
  contract.units[0].members[0].returns.list.tuple = ['text', 'text'];
  const assertion = '#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]\nconst _: fn(&polyspec_sample::Error) -> bool = |error| matches!(error, polyspec_sample::Error::TooLong { .. });\n';
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: contract.targets });
  for (const crate of ['packages/go/internal/ffi/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', ...LIBS]) {
    assert.equal(text(out, crate).split(assertion).length, 2, `${crate} asserts the variant once`);
  }
  // A crate whose members raise nothing asserts nothing.
  contract.units[0].members[0].raises = [];
  const none = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  for (const crate of ['packages/go/internal/ffi/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', ...LIBS]) {
    assert.doesNotMatch(text(none, crate), /matches!\(error,/, crate);
  }
});

test('a struct error is matched by the code of its projection, also for a kind that the core passes on (GN-7b, GN-7c, E-1b)', () => {
  // errors.code names the type that the core paths return and the function that gives its code; the kinds are the
  // variants of the code enum.
  const out = shaped((c) => {
    c.errors.code = { error: 'polyspec_shapes::Failure', path: 'polyspec_shapes::Failure::code' };
    const renamed = (variant: string): string => variant.replace('::Error::', '::Code::');
    for (const row of c.errors.kinds) row.variant = renamed(row.variant);
    for (const unit of c.units) for (const m of unit.members ?? []) if (m.raises !== undefined) m.raises = m.raises.map(renamed);
  });
  for (const crate of ['packages/go/internal/ffi/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', ...LIBS]) {
    const lib = text(out, crate);
    assert.match(lib, /fn core_error\([^)]*error: polyspec_shapes::Failure\)/, crate);
    assert.ok(lib.includes('match polyspec_shapes::Failure::code(&error) {'), `${crate} matches the code of the error`);
    assert.doesNotMatch(lib, /match error \{/, `${crate} matches no error without its code`);
    assert.ok(lib.includes('polyspec_shapes::Code::TooMany { .. } =>'), `${crate} matches a variant of the code`);
    assert.ok(lib.includes('const _: fn(&polyspec_shapes::Failure) -> bool = |error| matches!(polyspec_shapes::Failure::code(error), polyspec_shapes::Code::Empty { .. });'), `${crate} asserts a variant of the code`);
  }
  // GN-7c: a variant of the code that holds the error of a dependency is the row <outer>/<inner> with its library, and
  // its pattern is matched and asserted through the same projection. The generator refuses the WASM target of consumer
  // for other items, so the four others are read.
  const { contract, caseFiles, foreign } = consumerSample();
  const nested = 'polyspec_consumer::Error::Sample/polyspec_sample::Error::Unreadable';
  contract.errors.code = { error: 'polyspec_consumer::Failure', path: 'polyspec_consumer::Failure::code' };
  contract.errors.kinds.push({ variant: nested, library: 'sample' });
  contract.units.find((u: any) => u.id === 'consumer').members.find((m: any) => m.id === 'consumer.pair').raises.push(nested);
  const passed = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign });
  const pattern = 'polyspec_consumer::Error::Sample(polyspec_sample::Error::Unreadable { .. })';
  for (const crate of ['packages/go/internal/ffi/generated/lib.rs', ...LIBS]) {
    const lib = text(passed, crate);
    assert.ok(lib.includes('match polyspec_consumer::Failure::code(&error) {'), `${crate} matches the code of the error`);
    assert.ok(lib.includes(`${pattern} =>`), `${crate} matches the nested variant by its pattern`);
    assert.ok(lib.includes(`const _: fn(&polyspec_consumer::Failure) -> bool = |error| matches!(polyspec_consumer::Failure::code(error), ${pattern});`), `${crate} asserts the nested variant through the projection`);
    assert.ok(!lib.includes(nested), `${crate} writes no nested path as it is`);
  }
});

test('Python: a crate whose only raising member is a to_json holds no core_error (GN-6g)', () => {
  // Python generates no to_json (GN-6g), so nothing calls the conversion of the core error there: a function that
  // nothing calls fails the build of the crate as dead code.
  const sample = classSample([]);
  const raising = sample.units.flatMap((u: any) => u.members ?? []).filter((m: any) => (m.raises ?? []).length > 0).map((m: any) => m.id);
  assert.deepEqual(raising, ['tag.to_json']);
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  assert.doesNotMatch(text(out, 'packages/python/generated/lib.rs'), /fn core_error\(/);
  // Node and PHP generate the hook, which converts the error of the core.
  assert.match(text(out, 'packages/ts/generated/lib.rs'), /fn core_error\(/);
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /fn core_error\(/);
});

test('PHP: getIterator returns the iterator class of the extension, which is registered first (GN-6f)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const out = generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) });
  const lib = text(out, 'packages/php-ext/generated/lib.rs');
  // A return type of mixed, which a Zval declares, is deprecated for IteratorAggregate::getIterator.
  assert.match(lib, /#\[php\(name = "getIterator"\)\]\n {4}pub fn get_iterator\(&self\) -> Result<ZBox<ZendClassObject<PhpPairs>>, PhpException> \{/);
  assert.ok(lib.indexOf('.class::<PhpPairs>()') > 0 && lib.indexOf('.class::<PhpPairs>()') < lib.indexOf('.class::<PhpTag>()'));
});

test('the classes repository of the end-to-end check is generated for WASM too (GN-14, GN-18a)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  assert.deepEqual(contract.targets, ['php', 'python', 'node', 'go', 'wasm']);
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) });
  // A static member that raises, a method that takes the class and one that gives a list of it, in the four crates.
  const mjs = text(out, 'packages/ts/wasm/generated/index.mjs');
  assert.match(mjs, /\n {2}static parse\(/);
  assert.match(mjs, /\n {2}withSuffix\(/);
  assert.match(mjs, /\n {2}same\(/);
  assert.match(mjs, /\n {2}repeat\(/);
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    assert.match(text(out, path), /polyspec_classes::Tag::parse\(/, path);
    assert.match(text(out, path), /polyspec_classes::Tag::same\(/, path);
    assert.match(text(out, path), /matches!\(error, polyspec_classes::Error::Missing \{ \.\. \}\)/, path);
  }
});

test('a generated interface is declared in each language, and a parameter of it takes an instance of a class that implements it (U-1, GN-6ap)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const inputs = (change: (contract: any) => void = () => undefined): Inputs => {
    const contract = read('packages/rust/interface.json');
    change(contract);
    return { contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) };
  };
  const out = generate(inputs());
  // The conversion in finds the class of the instance in contract order and gives the core the From of its value.
  const from = (lib: string, given: string, path: string): void => {
    for (const [fn, core] of [['in_tag', 'Tag'], ['in_gate', 'Gate']]) {
      assert.ok(lib.includes(`return ${fn}(${given}value, subject).map(|held| <polyspec_classes::Named as From<&polyspec_classes::${core}>>::from(&held));`), `${path}: ${fn}`);
    }
    assert.ok(lib.indexOf('return in_tag(') < lib.indexOf('return in_gate('), path);
  };
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /fn in_named\(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str\) -> PyResult<polyspec_classes::Named> \{\n {4}if value\.cast::<PyTag>\(\)\.is_ok\(\) \{/);
  from(python, 'py, ', 'python');
  assert.match(python, /expected: String::from\("Named"\)/);
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /fn in_named<'env>\(env: &'env Env, value: Unknown<'env>, subject: &str\) -> Result<polyspec_classes::Named, Fail> \{/);
  from(node, 'env, ', 'node');
  assert.match(node, /Err\(type_error\(subject, "Named"\)\)/);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /fn in_named\(value: &Zval, subject: &str\) -> Result<polyspec_classes::Named, Fail> \{\n {4}if <&entry::PhpTag as FromZval>::from_zval\(value\)\.is_some\(\) \{/);
  from(php, '', 'php');
  const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /fn in_named\(value: &JsValue, subject: &str\) -> Result<polyspec_classes::Named, Fail> \{\n {4}if handle_of\(0, value\)\?\.is_some\(\) \{/);
  from(wasm, '', 'wasm');
  // The core takes the value, and an optional one as an Option of it.
  for (const [name, lib] of [['python', python], ['node', node], ['php', php], ['wasm', wasm]] as const) {
    assert.match(lib, /polyspec_classes::label_of\(named\)/, name);
    assert.match(lib, /polyspec_classes::label_or\(named, &fallback\)/, name);
    assert.match(lib, /polyspec_classes::Tag::names\([^,]+, named\)/, name);
  }
  // PHP: an interface of the extension without a method, which the classes implement in their entries and in the stub.
  assert.match(php, /ClassBuilder::new\("Polyspec\\\\Classes\\\\Named"\)\n {8}\.flags\(ClassFlags::Interface\)\n {8}\.registration/);
  assert.match(php, /#\[php\(implements\(ce = interface_named, stub = "\\\\Polyspec\\\\Classes\\\\Named"\)\)\]\n(#\[[^\n]*\n)*pub struct PhpTag /);
  assert.match(php, /#\[php\(implements\(ce = interface_named, stub = "\\\\Polyspec\\\\Classes\\\\Named"\)\)\]\n(#\[[^\n]*\n)*pub struct PhpGate /);
  assert.match(php, /fn interface_named\(\) -> &'static ClassEntry \{\n {4}own_interface\("Polyspec\\\\Classes\\\\Named"\)\n\}/);
  const stub = text(out, 'packages/php-ext/generated/polyspec_classes.stub.php');
  assert.match(stub, /\n {4}interface Named\n {4}\{\n {4}\}\n/);
  assert.match(stub, /final class Tag implements \\Polyspec\\Classes\\Named[,\n]/);
  assert.match(stub, /final class Gate implements \\Polyspec\\Classes\\Named\n/);
  // Python: an abstract base class, with which the package registers the classes; the stub has it as their base.
  assert.match(text(out, 'packages/python/generated/python/polyspec/classes/_types.py'), /from abc import ABC\n[\s\S]*\nclass Named\(ABC\):\n {4}"""GN-6ap: /);
  const init = text(out, 'packages/python/generated/python/polyspec/classes/__init__.py');
  assert.match(init, /from \. import _native, _types\n/);
  assert.match(init, /\n_types\.Named\.register\(_native\.Tag\)\n_types\.Named\.register\(_native\.Gate\)\n$/);
  assert.match(init, /__all__ = \[[^\]]*"Named"/);
  const pyi = text(out, 'packages/python/generated/python/polyspec/classes/_native.pyi');
  assert.match(pyi, /@final\nclass Tag\(Named\):\n/);
  assert.match(pyi, /@final\nclass Gate\(Named\):\n/);
  assert.match(pyi, /def label_of\(named: Named\) -> str: \.\.\./);
  assert.match(pyi, /def label_or\(named: Named \| None, fallback: str\) -> str: \.\.\./);
  // Node and WASM: an interface of the declaration file, which the classes name.
  for (const path of ['packages/ts/generated/index.d.ts', 'packages/ts/wasm/generated/index.d.ts']) {
    const dts = text(out, path);
    assert.match(dts, /\nexport interface Named \{\}\n/, path);
    assert.match(dts, /export declare class Tag implements Named \{/, path);
    assert.match(dts, /export declare class Gate implements Named \{/, path);
    assert.match(dts, /export declare function labelOf\(named: Named\): string;/, path);
  }
  // Go: an interface with one unexported method, which the pointers to the classes have, and the encoding of a value.
  const go = text(out, 'packages/go/zz_generated_classes.go');
  assert.match(go, /\ntype Named interface \{\n(\t\/\/[^\n]*\n)+\timplementsNamed\(\) \(uint64, uint64\)\n\}\n/);
  assert.match(go, /^func \(this \*Tag\) implementsNamed\(\) \(uint64, uint64\) \{ return 1, this\.handle\(\) \}\n\nvar _ Named = \(\*Tag\)\(nil\)$/m);
  assert.match(go, /^func \(this \*Gate\) implementsNamed\(\) \(uint64, uint64\) \{ return 2, this\.handle\(\) \}\n\nvar _ Named = \(\*Gate\)\(nil\)$/m);
  assert.match(go, /^func LabelOf\(named Named\) \(string, error\) \{\n[\s\S]*?\n\tencodeNamed\(enc, named\)\n/m);
  assert.match(go, /^func LabelOr\(named \*Named, fallback string\) \(string, error\) \{/m);
  const goLib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(goLib, /fn in_named\(input: &mut &\[u8\], subject: &str\) -> Result<polyspec_classes::Named, Fail> \{\n {4}match uint_in\(input\)\? \{\n {8}1 => in_tag\(input, subject\)\.map\(\|held\| <polyspec_classes::Named as From<&polyspec_classes::Tag>>::from\(&held\)\),\n {8}2 => in_gate\(input, subject\)/);
  // G-5: a case gives an instance value of a class that implements the interface.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /pkg\.label_of\(pkg\.Tag\("a"\)\)/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /pkg\.labelOf\(new pkg\.Tag\('a'\)\)/);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /pkg\.labelOf\(new pkg\.Tag\('a'\)\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /labelOf\(new \\Polyspec\\Classes\\Tag\("a"\)\)/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /LabelOf\(made\d+\)/);
  // Refused by name: an interface with members, without core_type or without a class, and the type at another place.
  const named = (c: any): any => unitOf(c, 'named');
  const labelOf = (c: any): any => unitOf(c, 'classes').members.find((m: any) => m.id === 'classes.label_of');
  assert.throws(() => generate(inputs((c) => { named(c).members = [{ id: 'named.label', name: ['label'], kind: 'method', visibility: 'public', parameters: [], returns: 'text', raises: [], wait: 'none' }]; })), /named: a generated interface that declares members is not generated yet \(GN-6ap\)/);
  assert.throws(() => generate(inputs((c) => { delete named(c).core_type; })), /named: a generated interface names in core_type the type that the core takes \(GN-6ap\)/);
  assert.throws(() => generate(inputs((c) => { delete unitOf(c, 'tag').implements; delete unitOf(c, 'gate').implements; })), /named: no generated class of this contract implements the generated interface \(GN-6ap\)/);
  assert.throws(() => generate(inputs((c) => { labelOf(c).parameters[0].type = { list: { unit: 'named' } }; })), /classes\.label_of\.named: the generated interface named is taken as a parameter or an optional parameter only \(GN-6ap\)/);
  assert.throws(() => generate(inputs((c) => { labelOf(c).parameters[0].core = '&'; })), /classes\.label_of\.named: a parameter of the generated interface named names no core borrow, because the core takes the value \(GN-6ap\)/);
});

test('a class with cleanup implements a generated interface, and one member takes the interface with a variant (GN-6ap, GN-6p, GN-6v, GN-3g)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  // The classes with cleanup, lease by the receiver self and stall by &mut self, implement the interface named.
  for (const id of ['lease', 'stall']) unitOf(contract, id).implements = [{ unit: 'named' }];
  // One member takes a value of the interface and a variant.
  contract.units.push({ id: 'mark', name: ['mark'], module: '', kind: 'variant', visibility: 'public', origin: 'generated', core_type: 'polyspec_classes::Mark', tag: ['type'],
    cases: [{ value: 'plain', fields: [] }, { value: 'led', fields: [{ name: ['by'], type: 'text', required: true }] }] });
  unitOf(contract, 'classes').members.push({ id: 'classes.marked', name: ['marked'], kind: 'function', visibility: 'public',
    parameters: [{ name: ['named'], type: { unit: 'named' }, required: true }, { name: ['mark'], type: { unit: 'mark' }, required: true }], returns: 'text', raises: [], wait: 'none', core: 'polyspec_classes::marked' });
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) });
  const from = (fn: string, given: string, core: string): string => `in_${fn}(${given}).map(|held| <polyspec_classes::Named as From<&polyspec_classes::${core}>>::from(&held))`;
  // GN-6ap with GN-6p: the conversion of the interface takes an instance of a class with cleanup, and the destructor of
  // that class still asks whether its cleanup call was made.
  const python = text(out, 'packages/python/generated/lib.rs');
  const node = text(out, 'packages/ts/generated/lib.rs');
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
  const goLib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  for (const [name, lib, given] of [['python', python, 'py, value, subject'], ['node', node, 'env, value, subject'], ['php', php, 'value, subject'], ['wasm', wasm, 'value, subject']] as const) {
    assert.ok(lib.includes(`return ${from('lease', given, 'Lease')};`), `${name}: lease`);
    assert.ok(lib.includes(`return ${from('stall', given, 'Stall')};`), `${name}: stall`);
    assert.match(lib, /\.taken\(\)/, name);
    assert.match(lib, /\.cleaned\(\)/, name);
  }
  assert.match(python, /if value\.cast::<PyLease>\(\)\.is_ok\(\) \{/);
  assert.match(php, /#\[php\(implements\(ce = interface_named, stub = "\\\\Polyspec\\\\Classes\\\\Named"\)\)\]\n(#\[[^\n]*\n)*pub struct PhpStall /);
  assert.match(php, /if !self\.inner\.cleaned\(\) \{/);
  assert.match(wasm, /TABLE_STALL\.with\(\|table\| table\.borrow_mut\(\)\.remove\(this\)\)\.is_some_and\(\|held\| !held\.cleaned\(\)\)/);
  // Go: the position of a class with cleanup among the classes of the interface, and the release that answers whether
  // the cleanup call was made.
  assert.ok(goLib.includes(`        3 => ${from('lease', 'input, subject', 'Lease')},\n        4 => ${from('stall', 'input, subject', 'Stall')},\n`));
  assert.match(goLib, /pub extern "C" fn polyspec_classes__release_lease\(handle: u64\) -> i32 \{\n[^\n]*\n {4}i32::from\(released\.is_some_and\(\|held\| !held\.taken\(\)\)\)/);
  assert.match(goLib, /pub extern "C" fn polyspec_classes__release_stall\(handle: u64\) -> i32 \{\n[^\n]*\n {4}i32::from\(released\.is_some_and\(\|held\| !held\.cleaned\(\)\)\)/);
  const go = text(out, 'packages/go/zz_generated_classes.go');
  assert.match(go, /^func \(this \*Lease\) implementsNamed\(\) \(uint64, uint64\) \{ return 3, this\.handle\(\) \}$/m);
  assert.match(go, /^func \(this \*Stall\) implementsNamed\(\) \(uint64, uint64\) \{ return 4, this\.handle\(\) \}$/m);
  // GN-6ap with GN-6v: one member encodes the interface by its function and the variant by its own, and Node converts
  // the interface with the env and the variant, which reads none, without it.
  assert.match(go, /^func Marked\(named Named, mark Mark\) \(string, error\) \{\n[\s\S]*?\n\tencodeNamed\(enc, named\)\n\tencodeMark\(enc, mark\)\n/m);
  assert.match(node, /let named: polyspec_classes::Named = in_named\(env, named, "named"\)\?;\n\s*let mark: polyspec_classes::Mark = in_mark\(mark, "mark"\)\?;/);
  assert.match(wasm, /let named: polyspec_classes::Named = in_named\(&named, "named"\)\?;\n\s*let mark: polyspec_classes::Mark = in_mark\(&mark, "mark"\)\?;/);
  for (const [name, lib] of [['python', python], ['node', node], ['php', php], ['wasm', wasm], ['go', goLib]] as const) assert.match(lib, /polyspec_classes::marked\(named, &mark\)/, name);
  // GN-3g with GN-6ap: the module that registers the interface names the extension.
  assert.match(php, /\.name\("polyspec_classes"\)/);
  assert.match(php, /ClassBuilder::new\("Polyspec\\\\Classes\\\\Named"\)\n {8}\.flags\(ClassFlags::Interface\)/);
});

// U-1: the classes repository with a class of origin value, token, whose out rows make each kind by a static member, and
// a function that takes it, with a case of each kind.
function tokenClasses(): { contract: any; caseFiles: Map<string, unknown> } {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  const cases = read('contracts/cases.json');
  const fiveOf = (member: string): Record<string, string> => Object.fromEntries(FIVE.map((t) => [t, member]));
  const make = (id: string, name: string, parameters: any[]): any => ({ id: `token.${id}`, name: [name], kind: 'static', visibility: 'public', parameters, returns: { unit: 'token' }, raises: [], wait: 'none', core: { path: `polyspec_classes::Token::${id}` } });
  contract.units.push({ id: 'token_kind', name: ['token', 'kind'], module: '', kind: 'enum', visibility: 'public', origin: 'generated', core_type: 'polyspec_classes::TokenKind', variants: ['word', 'flag', 'none', 'list', 'pair'].map((v) => ({ name: [v], value: v })) });
  contract.units.push({
    id: 'token', name: ['token'], module: '', kind: 'class', visibility: 'public', origin: 'value', core_type: 'polyspec_classes::Token', constructible: false, final: true,
    members: [
      { id: 'token.kind', name: ['kind'], kind: 'property', visibility: 'public', returns: { unit: 'token_kind' }, raises: [], wait: 'none', core: { path: 'polyspec_classes::Token::kind', receiver: '&self' } },
      make('word', 'word', [{ name: ['text'], type: 'text', required: true }]),
      make('flag', 'flag', [{ name: ['value'], type: 'bool', required: true }]),
      make('none', 'none', []),
      make('list', 'list', [{ name: ['items'], type: { list: { unit: 'token' } }, required: true }]),
      make('pair', 'pair', [{ name: ['left'], type: { unit: 'token' }, required: true }, { name: ['right'], type: { unit: 'token' }, required: true }]),
    ],
    out: [['text', 'token.word'], ['bool', 'token.flag'], ['null', 'token.none'], ['list', 'token.list'], ['map', 'token.pair']].map(([kind, member]) => ({ kind, make: fiveOf(member as string) })),
    in: FIVE.map((t) => ({ [t]: 'token', by: 'token.kind', cases: [{ is: 'word', kind: 'text' }, { is: 'flag', kind: 'bool' }, { is: 'none', kind: 'null' }, { is: 'list', kind: 'list' }, { is: 'pair', kind: 'map' }] })),
  });
  const functions = contract.units.find((u: any) => u.kind === 'functions');
  functions.members.push({ id: 'classes.show', name: ['show'], kind: 'function', visibility: 'public', parameters: [{ name: ['value'], type: { unit: 'token' }, required: true }], returns: 'text', raises: [], wait: 'none', core: 'polyspec_classes::show' });
  contract.cases.push({ member: 'classes.show', file: 'contracts/cases.json', group: 'show' });
  cases.show = [
    { id: 'a_word', value: { kind: 'text', value: 'a' }, result: '"a"' },
    { id: 'a_list', value: { kind: 'list', value: [{ kind: 'null' }, { kind: 'bool', value: true }] }, result: '[null,true]' },
    { id: 'a_map', value: { kind: 'map', value: [] }, result: '{}' },
  ];
  return { contract, caseFiles: new Map([['contracts/cases.json', cases]]) };
}

test('a case value of a class of origin value is the call of the member that its out row of the kind names (U-1, GN-13)', () => {
  const out = generate({ ...tokenClasses(), version: '0.0.0', coreLib: 'polyspec_classes', targets: ['php', 'python', 'node', 'wasm'] });
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(node, /test\('GN-13e: show a_word', \(\) => \{\n\s+assert\.deepStrictEqual\(ordered\(pkg\.show\(pkg\.Token\.word\('a'\)\)\), ordered\('"a"'\)\);/);
  assert.match(node, /pkg\.show\(pkg\.Token\.list\(\[pkg\.Token\.none\(\), pkg\.Token\.flag\(true\)\]\)\)/);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /pkg\.show\(pkg\.Token\.word\('a'\)\)/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /pkg\.show\(pkg\.Token\.word\("a"\)\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /show\(\\Polyspec\\Classes\\ClassesToken::word\("a"\)\)|show\([^\n]*Token::word\("a"\)\)/);
  // G-4, GN-13e: a kind whose member takes more than one value is not written, so its case fails by name and the other
  // tests of the target run; the generation does not end with an exception.
  assert.match(node, /test\('GN-13e: show a_map', \(\) => \{\n\s+assert\.fail\('the case a_map of classes\.show: the kind map of token is made by token\.pair, which takes more than one value, so a case value of it is not written \(U-1, G-5\)'\);/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_gn13e_show_a_map\(self\) -> None:\n\s+self\.fail\("the case a_map of classes\.show: the kind map of token/);
});

test('a case value that the generator does not write fails the test of its case by name, not the generation (G-4, GN-13e)', () => {
  const { contract, caseFiles } = tokenClasses();
  (caseFiles.get('contracts/cases.json') as any).show.push({ id: 'no_kind', value: 'a', result: 'a' }, { id: 'raised', value: { kind: 'text', value: 1 }, raises: { kind: 'missing', status: null, category: 'value' } });
  const out = generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['node'] });
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(node, /assert\.fail\('the case no_kind of classes\.show: a case value of token is \{"kind": <value kind>, "value": \.\.\.\}, not "a" \(G-5\)'\);/);
  // G-4: a value that no test can make, the placeholder of a class without a factory, refuses the target by name.
  const gate = tokenClasses();
  gate.contract.units.find((u: any) => u.kind === 'functions').members.find((m: any) => m.id === 'classes.show').parameters[0] = { ...gate.contract.units.find((u: any) => u.kind === 'functions').members.find((m: any) => m.id === 'classes.show').parameters[0], type: { unit: 'gate' }, core: '&' };
  assert.throws(() => generate({ ...gate, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['node'] }), (error: any) => Array.isArray(error.refusals) && error.refusals.includes('no placeholder for {"unit":"gate"} is written yet (G-5)'));
});

// GN-13f: the classes repository with two more factories of tag before its constructor: one whose parameter has the key
// of the parameter of tag.with_suffix, and one without parameters. The case of with_suffix gives `name`, the argument of
// the constructor, and `suffix`, the argument of with_suffix itself.
function suffixFactories(): { contract: any; caseFiles: Map<string, unknown> } {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  const make = (id: string, parameters: any[]): any => ({ id: `tag.${id}`, name: id.split('_'), kind: 'static', visibility: 'public', parameters, returns: { unit: 'tag' }, raises: [], wait: 'none', core: `polyspec_classes::Tag::${id}` });
  contract.units.find((u: any) => u.id === 'tag').members.unshift(make('from_suffix', [{ name: ['suffix'], type: 'text', required: true }]), make('blank', []));
  return { contract, caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) };
}

test('the receiver of a case is made from the keys that are no parameter of its member, before the block that expects the failure (GN-13f, B2.143)', () => {
  const out = generate({ ...suffixFactories(), version: '0.0.0', coreLib: 'polyspec_classes' });
  // The key `suffix` is the argument of with_suffix, so tag.from_suffix is no factory of the receiver; tag.blank takes
  // no key, so the constructor, which takes `name`, makes the receiver. The receiver is a local that is made before the
  // call that must fail, so a receiver that cannot be made fails the test.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_b4_tag_with_suffix_the_empty_suffix_is_refused\(self\) -> None:\n {8}receiver = pkg\.Tag\("a"\)\n {8}with self\.assertRaises\(pkg\.ClassesValueError\) as caught:\n {12}receiver\.with_suffix\(""\)\n/);
  for (const path of ['packages/ts/generated/tests/generated.test.mjs', 'packages/ts/wasm/generated/tests/generated.test.mjs']) {
    assert.match(text(out, path), /test\('B-4: Tag\.withSuffix the_empty_suffix_is_refused', \(\) => \{\n {2}const receiver = new pkg\.Tag\('a'\);\n {2}assert\.throws\(\(\) => receiver\.withSuffix\(''\), /, path);
  }
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /public function testB4TagWithSuffixTheEmptySuffixIsRefused\(\): void\n {4}\{\n {8}\$receiver = new \\Polyspec\\Classes\\Tag\("a"\);\n {8}try \{\n {12}\$receiver->withSuffix\(""\);\n/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /func TestB4TagWithSuffixTheEmptySuffixIsRefused\(t \*testing\.T\) \{\n\tmade0, failure1 := NewTag\("a"\)\n\tif failure1 != nil \{\n\t\tt\.Fatalf\("GN-13f: %v", failure1\)\n\t\}\n\t_, err := made0\.WithSuffix\(""\)\n/);
  // A case that gives no key of a factory with parameters takes the factory without parameters.
  const { contract, caseFiles } = suffixFactories();
  (caseFiles.get('contracts/cases.json') as any).tag_with_suffix.push({ id: 'a_blank_tag_takes_no_empty_suffix', suffix: '', raises: { kind: 'missing', status: null, category: 'value', message: 'no value for suffix' } });
  const blank = text(generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['python'] }), 'packages/python/generated/tests/test_generated.py');
  assert.match(blank, /def test_b4_tag_with_suffix_a_blank_tag_takes_no_empty_suffix\(self\) -> None:\n {8}receiver = pkg\.Tag\.blank\(\)\n {8}with self\.assertRaises\(pkg\.ClassesValueError\) as caught:\n {12}receiver\.with_suffix\(""\)\n/);
});

test('a case whose receiver the factory of its keys may fail to make expects the failure of making it or of the call (GN-13f, B2.150)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const cases = read('contracts/cases.json');
  // tag.parse makes the receiver from `text` and raises the kind missing, which the case of tag.name expects.
  cases.tag_name.push({ id: 'the_empty_text_names_no_tag', text: '', raises: { kind: 'missing', status: null, category: 'value', message: 'no value for text' } });
  const out = generate({ contract: read('packages/rust/interface.json'), caseFiles: new Map([['contracts/cases.json', cases]]), version: '0.0.0', coreLib: 'polyspec_classes' });
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_b4_tag_name_the_empty_text_names_no_tag\(self\) -> None:\n {8}with self\.assertRaises\(pkg\.ClassesValueError\) as caught:\n {12}pkg\.Tag\.parse\(""\)\.name\n/);
  for (const path of ['packages/ts/generated/tests/generated.test.mjs', 'packages/ts/wasm/generated/tests/generated.test.mjs']) {
    assert.match(text(out, path), /test\('B-4: Tag\.name the_empty_text_names_no_tag', \(\) => \{\n {2}assert\.throws\(\(\) => pkg\.Tag\.parse\(''\)\.name, /, path);
  }
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /public function testB4TagNameTheEmptyTextNamesNoTag\(\): void\n {4}\{\n {8}try \{\n {12}\\Polyspec\\Classes\\Tag::parse\(""\)->name\(\);\n/);
  // Go gives the failure of the factory as the err of the case, and calls the member only on a receiver it made.
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /func TestB4TagNameTheEmptyTextNamesNoTag\(t \*testing\.T\) \{\n\tmade0, err := TagParse\(""\)\n\tif err == nil \{\n\t\t_, err = made0\.Name\(\)\n\t\}\n\tfailure, ok := err\.\(\*liberrors\.ClassesValueError\)/);
  // The factory of the receiver of tag.with_suffix, tag.new, raises nothing, so that receiver is still made first.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_b4_tag_with_suffix_the_empty_suffix_is_refused\(self\) -> None:\n {8}receiver = pkg\.Tag\("a"\)\n/);
});

test('a class value that the core gives by reference leaves as a new instance of a copy of it (T-5, GN-6b)', () => {
  const out = generate({ ...tokenClasses(), version: '0.0.0', coreLib: 'polyspec_classes', targets: ['php', 'python', 'node', 'wasm'] });
  const files = ['packages/php-ext/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs'];
  for (const file of files) {
    const lib = text(out, file);
    // An accessor of the core returns `&Token`, a computed value `Token`, and an item of an optional or a list a
    // reference to either; the conversion takes each of them and copies only a borrowed value.
    assert.match(lib, /fn out_token\((?:py: Python<'_>, |env: &Env, )?value: impl CoreForm<polyspec_classes::Token>\)/, file);
    assert.match(lib, /trait CoreForm<T> \{\n\s+fn core_form\(self\) -> T;\n\}/, file);
    assert.match(lib, /impl<T: Clone> CoreForm<T> for &&T \{/, file);
  }
});

test('the core gets the value that the guard of a place holds, also where its path is a generic function (GN-6h)', () => {
  const { contract, caseFiles } = tokenClasses();
  const token = contract.units.find((u: any) => u.id === 'token');
  // A path of a trait, such as ToString::to_string, takes `&T` of any T, so a borrow of the guard is no `&Token` there.
  token.members.push({ id: 'token.to_string', name: ['to', 'string'], kind: 'stringify', visibility: 'public', parameters: [], returns: 'text', raises: [], wait: 'none', core: { path: 'std::string::ToString::to_string', receiver: '&self' } });
  const out = generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['php', 'python', 'node', 'wasm'] });
  for (const file of ['packages/php-ext/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, file);
    assert.match(lib, /let receiver = &\*receiver;\n[^\n]*std::string::ToString::to_string\(receiver\)/, file);
    assert.match(lib, /let receiver = &\*receiver;\n[^\n]*polyspec_classes::Token::kind\(receiver\)/, file);
  }
});

test('a parameter of a class gives the core the value in the form that the core path takes, borrowed or a copy (GN-6h)', () => {
  // The core of json takes `OrderedMap::insert(&mut self, key: Value, value: Value)` and `show(value: &Token)`; the
  // contract names neither form, so the argument takes the one that the core path asks for.
  const out = generate({ ...tokenClasses(), version: '0.0.0', coreLib: 'polyspec_classes', targets: ['php', 'python', 'node', 'wasm'] });
  for (const file of ['packages/php-ext/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    assert.match(text(out, file), /let value = &\*value;\n[^\n]*polyspec_classes::show\(CoreForm::core_form\(value\)\)/, file);
  }
});

test('a PHP enum case whose name ext-php-rs refuses as a keyword or a type name takes a trailing _ (GN-10, N-2)', () => {
  const { contract, caseFiles } = tokenClasses();
  contract.units.find((u: any) => u.id === 'token_kind').variants.push({ name: ['object'], value: 'object' }, { name: ['string'], value: 'string' });
  const out = generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['php'] });
  const lib = text(out, 'packages/php-ext/generated/lib.rs');
  // PHP takes every one of these names as an enum case; the macro php_enum of ext-php-rs refuses a PHP keyword and a
  // type name, case-insensitively, also as the name of #[php(name)].
  assert.match(lib, /#\[php\(name = "List_", value = "list"\)\]\n\s+List,/);
  assert.match(lib, /#\[php\(name = "Object_", value = "object"\)\]\n\s+Object,/);
  assert.match(lib, /#\[php\(name = "String_", value = "string"\)\]\n\s+String,/);
  assert.match(lib, /#\[php\(name = "Word", value = "word"\)\]\n\s+Word,/);
  const stub = text(out, 'packages/php-ext/generated/polyspec_classes.stub.php');
  assert.match(stub, /case List_ = 'list';/);
  assert.match(stub, /case Object_ = 'object';/);
  assert.match(stub, /case Word = 'word';/);
});

// The token classes with Token.of_map, which takes a TokenMap, as Value.object of json takes an OrderedMap.
function tokenMapClasses(): { contract: any; caseFiles: Map<string, unknown> } {
  const { contract, caseFiles } = tokenClasses();
  const token = contract.units.find((u: any) => u.id === 'token');
  token.members.push({ id: 'token.of_map', name: ['of', 'map'], kind: 'static', visibility: 'public', parameters: [{ name: ['members'], type: { unit: 'token_map' }, required: true, core: '&' }], returns: { unit: 'token' }, raises: [], wait: 'none', core: { path: 'polyspec_classes::Token::of_map' } });
  for (const row of token.out) if (row.kind === 'map') row.make = Object.fromEntries(FIVE.map((t) => [t, 'token.of_map']));
  contract.units.push({
    id: 'token_map', name: ['token', 'map'], module: '', kind: 'class', visibility: 'public', origin: 'generated', core_type: 'polyspec_classes::TokenMap', final: true,
    members: [
      { id: 'token_map.constructor', name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [], returns: { unit: 'token_map' }, raises: [], wait: 'none', core: { path: 'polyspec_classes::TokenMap::new' } },
      { id: 'token_map.insert', name: ['insert'], kind: 'method', visibility: 'public', parameters: [{ name: ['key'], type: { unit: 'token' }, required: true, core: 'value' }, { name: ['value'], type: { unit: 'token' }, required: true, core: 'value' }], returns: 'none', raises: [], wait: 'none', core: { path: 'polyspec_classes::TokenMap::insert', receiver: '&mut self' } },
      { id: 'token_map.size', name: ['size'], kind: 'property', visibility: 'public', returns: 'uint', raises: [], wait: 'none', core: { path: 'polyspec_classes::TokenMap::size', receiver: '&self' } },
    ],
  });
  return { contract, caseFiles };
}

test('the pairs of a case value of kind map fill the class that the make member of the kind takes (U-1, GN-13)', () => {
  // As Value.object of json takes an OrderedMap, Token.of_map takes a TokenMap, which its constructor makes and its one
  // member with the receiver &mut self and two parameters fills with each pair.
  const { contract, caseFiles } = tokenMapClasses();
  (caseFiles.get('contracts/cases.json') as any).show.push({ id: 'a_pair', value: { kind: 'map', value: [['k', { kind: 'text', value: 'v' }]] }, result: '{"k":"v"}' });
  const out = generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['php', 'python', 'node', 'wasm'] });
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  // An empty map is the class that the constructor makes, with no pair inserted.
  assert.match(node, /test\('GN-13e: show a_map', \(\) => \{\n\s+assert\.deepStrictEqual\(ordered\(pkg\.show\(pkg\.Token\.ofMap\(new pkg\.TokenMap\(\)\)\)\)/);
  assert.match(node, /pkg\.show\(pkg\.Token\.ofMap\(\(\(\) => \{ const made0 = new pkg\.TokenMap\(\); made0\.insert\(pkg\.Token\.word\('k'\), pkg\.Token\.word\('v'\)\); return made0; \}\)\(\)\)\)/);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /pkg\.Token\.ofMap\(\(\(\) => \{ const made0 = new pkg\.TokenMap\(\); made0\.insert\(pkg\.Token\.word\('k'\), pkg\.Token\.word\('v'\)\); return made0; \}\)\(\)\)/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /made0\.insert\(pkg\.Token\.word\("k"\), pkg\.Token\.word\("v"\)\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /\$made0->insert\([^\n]*Token::word\("k"\), [^\n]*Token::word\("v"\)\);/);
});

test('a case value of a class that is no value class is the pairs that fill it (U-1, GN-13)', () => {
  const { contract, caseFiles } = tokenMapClasses();
  contract.units.find((u: any) => u.kind === 'functions').members.push({ id: 'classes.count', name: ['count'], kind: 'function', visibility: 'public', parameters: [{ name: ['members'], type: { unit: 'token_map' }, required: true, core: '&' }], returns: 'uint', raises: [], wait: 'none', core: 'polyspec_classes::count' });
  contract.cases.push({ member: 'classes.count', file: 'contracts/cases.json', group: 'count' });
  (caseFiles.get('contracts/cases.json') as any).count = [{ id: 'one', members: [['k', { kind: 'null' }]], result: 1 }];
  const out = generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['node'] });
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /pkg\.count\(\(\(\) => \{ const made0 = new pkg\.TokenMap\(\); made0\.insert\(pkg\.Token\.word\('k'\), pkg\.Token\.none\(\)\); return made0; \}\)\(\)\)/);
});

test('a Go case value of a class is made as in the other targets, and a case that is not written fails by name (U-1, GN-13, GN-13f)', () => {
  // A class of origin value is made by the make member of the kind, and another class by its constructor and the
  // inserts of its pairs, each a local of the test.
  const { contract, caseFiles } = tokenMapClasses();
  contract.units.find((u: any) => u.kind === 'functions').members.push({ id: 'classes.count', name: ['count'], kind: 'function', visibility: 'public', parameters: [{ name: ['members'], type: { unit: 'token_map' }, required: true, core: '&' }], returns: 'uint', raises: [], wait: 'none', core: 'polyspec_classes::count' });
  contract.cases.push({ member: 'classes.count', file: 'contracts/cases.json', group: 'count' });
  const cases = caseFiles.get('contracts/cases.json') as any;
  cases.show.push({ id: 'a_pair', value: { kind: 'map', value: [['k', { kind: 'text', value: 'v' }]] }, result: '{"k":"v"}' });
  cases.count = [{ id: 'one', members: [['k', { kind: 'null' }]], result: 1 }];
  const go = text(generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['go'] }), 'packages/go/zz_generated_test.go');
  assert.match(go, /func TestGN13eShowAWord\(t \*testing\.T\) \{\n\tmade0, failure1 := TokenWord\("a"\)\n\tif failure1 != nil \{\n\t\tt\.Fatalf\("GN-13f: %v", failure1\)\n\t\}\n\tvalue0, err := Show\(made0\)/);
  assert.match(go, /made0, failure1 := TokenNone\(\)\n[^]*?made2, failure3 := TokenFlag\(true\)\n[^]*?made4, failure5 := TokenList\(\[\]\*Token\{made0, made2\}\)\n[^]*?Show\(made4\)/);
  assert.match(go, /made0, failure1 := NewTokenMap\(\)\n[^]*?made2, failure3 := TokenWord\("k"\)\n[^]*?made4, failure5 := TokenWord\("v"\)\n[^]*?failure6 := made0\.Insert\(made2, made4\)\n[^]*?made7, failure8 := TokenOfMap\(made0\)\n[^]*?Show\(made7\)/);
  assert.match(go, /func TestGN13eCountOne\(t \*testing\.T\) \{\n\tmade0, failure1 := NewTokenMap\(\)\n[^]*?TokenNone\(\)\n[^]*?made0\.Insert\(made2, made4\)\n[^]*?Count\(made0\)/);
  // G-4, GN-13e: a kind whose member takes more than one value is not written, so its case fails by name and the other
  // tests of the target are written.
  const plain = text(generate({ ...tokenClasses(), version: '0.0.0', coreLib: 'polyspec_classes', targets: ['go'] }), 'packages/go/zz_generated_test.go');
  assert.match(plain, /func TestGN13eShowAMap\(t \*testing\.T\) \{\n\tt\.Fatal\("the case a_map of classes\.show: the kind map of token is made by token\.pair, which takes more than one value, so a case value of it is not written \(U-1, G-5\)"\)\n\}/);
  assert.match(plain, /func TestGN13eShowAWord\(t \*testing\.T\) \{/);
});

test('the test of a case holds the words of its id, and two ids that give one name refuse the target (GN-13e)', () => {
  const withIds = (ids: string[]): { contract: any; caseFiles: Map<string, unknown> } => {
    const fixture = tokenClasses();
    (fixture.caseFiles.get('contracts/cases.json') as any).show = ids.map((id) => ({ id, value: { kind: 'text', value: 'a' }, result: '"a"' }));
    return fixture;
  };
  const out = generate({ ...withIds(['document-order', 'x.y z']), version: '0.0.0', coreLib: 'polyspec_classes', targets: ['php', 'python', 'node'] });
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /public function testGn13eshowDocumentOrder\(\): void/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /public function testGn13eshowXYZ\(\): void/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_gn13e_show_document_order\(self\) -> None:/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_gn13e_show_x_y_z\(self\) -> None:/);
  // Node names a test by a string, which holds the id as it is.
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /test\('GN-13e: show document-order', /);
  const refused = (ids: string[], target: string): string[] => {
    try {
      generate({ ...withIds(ids), version: '0.0.0', coreLib: 'polyspec_classes', targets: [target] as Inputs['targets'] & string[] });
    } catch (error: any) {
      return error.refusals ?? [String(error)];
    }
    return [];
  };
  const clash = 'the cases a-word and a_word of classes.show give one test name a_word (GN-13e)';
  assert.ok(refused(['a-word', 'a_word'], 'python').includes(clash), 'Python');
  assert.ok(refused(['a-word', 'a_word'], 'php').some((r) => r.startsWith('the cases a-word and a_word of classes.show give one test name')), 'PHP');
  // PHP compares the names of methods without case, Python with it.
  assert.ok(refused(['a_b', 'ab'], 'php').some((r) => r.startsWith('the cases a_b and ab of classes.show give one test name')), 'PHP without case');
  assert.deepEqual(refused(['a_b', 'ab'], 'python'), []);
  assert.deepEqual(refused(['a-word', 'a_word'], 'node'), []);
});

test('a Python case value deeper than the parser takes is made step by step in local variables (GN-13e)', () => {
  const { contract, caseFiles } = tokenClasses();
  // 300 lists, each the one item of the one around it, as array_past_limit of json gives them.
  let deep: unknown = { kind: 'null' };
  for (let i = 0; i < 300; i += 1) deep = { kind: 'list', value: [deep] };
  (caseFiles.get('contracts/cases.json') as any).show = [{ id: 'deep', value: deep, result: '"x"' }];
  const out = generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['python'] });
  const py = text(out, 'packages/python/generated/tests/test_generated.py');
  // The deepest nesting of brackets of any line, outside the strings.
  const nesting = (line: string): number => {
    let depth = 0;
    let most = 0;
    let quote = '';
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i] ?? '';
      if (quote !== '') {
        if (c === '\\') i += 1;
        else if (c === quote) quote = '';
        continue;
      }
      if (c === '"' || c === "'") quote = c;
      else if ('([{'.includes(c)) most = Math.max(most, (depth += 1));
      else if (')]}'.includes(c)) depth -= 1;
    }
    return most;
  };
  assert.ok(Math.max(...py.split('\n').map(nesting)) <= 60, 'no line of the Python tests nests its brackets deeper than 60');
  // The value is whole: 300 calls of Token.list and the null inside them.
  const body = py.slice(py.indexOf('def _deep_0():'), py.indexOf('\n\n', py.indexOf('def _deep_0():')));
  assert.equal(body.match(/pkg\.Token\.list\(/g)?.length, 300);
  assert.match(py, /\n {4}step_0 = [^\n]*pkg\.Token\.none\(\)/);
  assert.match(py, /def test_gn13e_show_deep\(self\) -> None:\n[^\n]*pkg\.show\(_deep_0\(\)\)/);
});

test('a member named by a word that JavaScript reserves is defined by its key, and the entry parses (GN-6b, GN-18a)', () => {
  const RESERVED = [
    'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum',
    'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import', 'in', 'instanceof',
    'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static', 'super', 'switch',
    'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'eval', 'arguments',
  ];
  const { contract, caseFiles } = tokenClasses();
  const token = contract.units.find((u: any) => u.id === 'token');
  for (const word of RESERVED) {
    token.members.push({ id: `token.${word}_static`, name: [word], kind: 'static', visibility: 'public', parameters: [{ name: ['text'], type: 'text', required: true }], returns: { unit: 'token' }, raises: [], wait: 'none', core: { path: 'polyspec_classes::Token::word' } });
  }
  const out = generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['node', 'wasm'] });
  const node = text(out, 'packages/ts/generated/index.cjs');
  for (const word of RESERVED) assert.ok(!new RegExp(`function ${word}\\(`).test(node), `no function expression is named ${word}`);
  assert.match(node, /Object\.defineProperty\(Token, 'null', \{\n\s+value: \{ \['null'\]\(\.\.\.args\) \{/);
  const dir = mkdtempSync(join(tmpdir(), 'binding-reserved-'));
  try {
    writeFileSync(join(dir, 'index.cjs'), node);
    writeFileSync(join(dir, 'index.mjs'), text(out, 'packages/ts/wasm/generated/index.mjs'));
    for (const file of ['index.cjs', 'index.mjs']) {
      const checked = spawnSync(process.execPath, ['--check', join(dir, file)], { encoding: 'utf8' });
      assert.equal(checked.status, 0, `${file} parses: ${checked.stderr}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the result null of an optional of a class is compared with the null of each target (GN-13e)', () => {
  const { contract, caseFiles } = tokenClasses();
  contract.units.find((u: any) => u.kind === 'functions').members.push({ id: 'classes.find', name: ['find'], kind: 'function', visibility: 'public', parameters: [{ name: ['key'], type: 'text', required: true }], returns: { optional: { unit: 'token' } }, raises: [], wait: 'none', core: 'polyspec_classes::find' });
  contract.cases.push({ member: 'classes.find', file: 'contracts/cases.json', group: 'find' });
  (caseFiles.get('contracts/cases.json') as any).find = [{ id: 'absent', key: 'a', result: null }, { id: 'present', key: 'b', result: { kind: 'text', value: 'b' } }];
  const out = generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['php', 'python', 'node', 'wasm'] });
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /test\('GN-13e: find absent', \(\) => \{\n\s+assert\.deepStrictEqual\(ordered\(pkg\.find\('a'\)\), ordered\(null\)\);/);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /assert\.deepStrictEqual\(ordered\(pkg\.find\('a'\)\), ordered\(null\)\);/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /def test_gn13e_find_absent\(self\) -> None:\n\s+result = pkg\.find\("a"\)\n\s+expected = None\n/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /public function testGn13efindAbsent\(\): void\n\s+\{\n\s+self::assertSame\(self::same\(null\), self::same\([^\n]*find\("a"\)\)\);/);
  // Go compares with the nil of the type of the result, which is the one pointer of the class (GN-15e). Go writes no case value of a class of
  // origin value yet, so its contract has the cases of find alone.
  const goContract = { ...contract, cases: contract.cases.filter((row: any) => row.member === 'classes.find') };
  const go = generate({ contract: goContract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['go'] });
  assert.match(text(go, 'packages/go/zz_generated_test.go'), /func TestGN13eFindAbsent\(t \*testing\.T\) \{\n\tvalue0, err := Find\("a"\)\n[^]*?if want := \(\*Token\)\(nil\); !reflect\.DeepEqual\(value0, want\) \{/);
  // A result that is a class still has no case form, so its test fails with the reason.
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /test\('GN-13e: find present', \(\) => \{\n\s+assert\.fail\('the case present of classes\.find gives result, but a class has no case value form \(GN-13e\)'\);/);
});

test('a float case value is a float literal in Python and PHP, also where JSON writes an integer (B-2, G-5)', () => {
  const { contract, caseFiles } = tokenClasses();
  contract.units.find((u: any) => u.kind === 'functions').members.push({ id: 'classes.scale', name: ['scale'], kind: 'function', visibility: 'public', parameters: [{ name: ['value'], type: 'float', required: true }], returns: 'float', raises: [], wait: 'none', core: 'polyspec_classes::scale' });
  contract.cases.push({ member: 'classes.scale', file: 'contracts/cases.json', group: 'scale' });
  (caseFiles.get('contracts/cases.json') as any).scale = [{ id: 'zero', value: 0, result: 0 }, { id: 'negative_zero', value: -0, result: -0 }, { id: 'e20', value: 1e20, result: 1e20 }, { id: 'half', value: 0.5, result: 0.5 }];
  const out = generate({ contract, caseFiles, version: '0.0.0', coreLib: 'polyspec_classes', targets: ['php', 'python', 'node'] });
  const py = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(py, /result = pkg\.scale\(0\.0\)\n\s+expected = 0\.0\n/);
  assert.match(py, /result = pkg\.scale\(-0\.0\)\n\s+expected = -0\.0\n/);
  assert.match(py, /result = pkg\.scale\(1e\+20\)\n\s+expected = 1e\+20\n/);
  assert.match(py, /result = pkg\.scale\(0\.5\)\n\s+expected = 0\.5\n/);
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(php, /self::assertSame\(self::same\(0\.0\), self::same\([^\n]*scale\(0\.0\)\)\);/);
  assert.match(php, /self::assertSame\(self::same\(-0\.0\), self::same\([^\n]*scale\(-0\.0\)\)\);/);
  assert.match(php, /self::assertSame\(self::same\(1e\+20\), self::same\([^\n]*scale\(1e\+20\)\)\);/);
  // Node has one number type, and a negative zero keeps its sign.
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(node, /pkg\.scale\(0\), ordered\(0\)|ordered\(pkg\.scale\(0\)\), ordered\(0\)/);
  assert.match(node, /ordered\(pkg\.scale\(-0\)\), ordered\(-0\)/);
});

test('the Python G-7 test of a constructor without parameters expects the words of PyO3 (G-7)', () => {
  const out = generate({ ...tokenMapClasses(), version: '0.0.0', coreLib: 'polyspec_classes', targets: ['python'] });
  const py = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(py, /def test_g7_token_map_new_counts_and_names_its_arguments\(self\) -> None:\n\s+with self\.assertRaisesRegex\(TypeError, "takes 0 positional arguments"\):\n\s+pkg\.TokenMap\(None\)\n\s+with self\.assertRaisesRegex\(TypeError, "unexpected keyword argument"\):\n\s+pkg\.TokenMap\(not_a_parameter=1\)/);
  // A static member without parameters is a function of no arguments.
  assert.match(py, /def test_g7_token_none_counts_and_names_its_arguments\(self\) -> None:\n\s+with self\.assertRaisesRegex\(TypeError, "takes no arguments"\):/);
});

// The sample of the end-to-end check with the targets added and without the callback unit and the value alias, which
// Go and WASM refuse by name.
function classSample(targets: string[]): any {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  sample.targets.push(...targets);
  if (targets.includes('go')) sample.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  if (targets.includes('wasm')) {
    sample.packages.node.entries['.'].conditions = { node: 'napi', browser: 'wasm' };
    for (const row of Object.values(sample.errors.classes) as Record<string, string>[]) row['wasm'] = row['node'] ?? '';
  }
  // G-5: Go and WASM refuse a contract with fault injection points by name.
  delete sample.faults;
  sample.units = sample.units.filter((u: any) => u.id === 'sample' || u.id === 'tag');
  // The kind that the lookup recognizes names its error unit, which this sample drops with the lookup (U-3).
  sample.errors.kinds = sample.errors.kinds.filter((row: any) => row.class === undefined);
  delete sample.errors.recognized;
  const owner = sample.units.find((u: any) => u.id === 'sample');
  owner.members = owner.members.filter((m: any) => ['sample.join', 'sample.shout'].includes(m.id));
  sample.cases = sample.cases.filter((row: any) => ['sample.join', 'sample.shout'].includes(row.member) || String(row.member).startsWith('tag.'));
  return sample;
}

test('WASM: a value alias, its in_raises and a callback unit are generated as for Node (U-7, U-3, GN-18b, GN-18c)', () => {
  const full = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: full, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['wasm'] });
  const lib = text(out, 'packages/ts/wasm/generated/lib.rs');
  // U-7: the value enters as the HostValue that the module describes, and leaves by the out rows.
  assert.match(lib, /\nfn in_data\(value: &JsValue, _subject: &str\) -> Result<polyspec_sample::Data, Fail> \{\n {4}let mut host = JsHost::new\(\);/);
  assert.match(lib, /polyspec_sample::data_from_host\(&mut host, described\)\.map_err\(\|failure: binding_core::Failure<polyspec_sample::Error>\| failure_error\(failure\)\)/);
  assert.match(lib, /OutValue::Map\(value\) => \{\n {16}let handle = value\.handle\(\);\n {16}let len = value\.len\(\);\n {16}if let Some\(made\)/);
  // B-1: an operation that may run code of the value is imported with catch.
  assert.match(lib, /#\[wasm_bindgen\(catch, js_namespace = Object, js_name = keys\)\]/);
  // U-7: the in function of the alias alone, under codec-test.
  assert.match(lib, /#\[cfg\(feature = "codec-test"\)\]\n {4}#\[wasm_bindgen\(js_name = "__aliasInData"\)\]\n {4}pub fn alias_in_data\(value: JsValue\) -> Result<\(\), JsValue> \{/);
  // U-3: the callback holds the object, and its exception is the Raised that the caller throws again.
  assert.match(lib, /\nstruct CbLookup \{\n {4}object: JsValue,\n\}/);
  assert.match(lib, /let returned = function\.apply\(&self\.object, &args\)\.map_err\(Thrown::Js\)\?;/);
  assert.match(lib, /Err\(error\) => return Err\(failure_error\(error\)\),/);
  assert.match(lib, /fn throw\(fail: Fail\) -> JsValue \{\n {4}if let Some\(thrown\) = fail\.thrown \{\n {8}return thrown;/);
  assert.doesNotMatch(lib, /WrongThread/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.d.ts'), /export interface Lookup \{\n {2}find\(key: string\): string \| null;\n\}/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.d.ts'), /export declare function same\(value: unknown\): unknown;/);
  const tests = text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  assert.match(tests, /test\('U-7: data in [^']+', async \(\) => \{\n {2}const glue = await glueModule\(\);\n {2}assert\.throws\(\(\) => glue\.__aliasInData\(/);
  assert.match(tests, /test\('K-2: resolve lets the exception of a callback through'/);
  assert.match(tests, /const fixture0 = fixture\(\['find'\], /);
  assert.match(String(trackedPackages(full, '0.0.0').get('packages/ts/wasm/Cargo.toml')), /\nfault-test = \["polyspec-sample\/fault-test"\]\ncodec-test = \[\]\n/);
});

test('WASM: a class unit is a class of the ES module over the handle of its value (T-5, GN-18a)', () => {
  const sample = classSample(['wasm']);
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  const lib = text(out, 'packages/ts/wasm/generated/lib.rs');
  assert.match(lib, /static TABLE_TAG: RefCell<Table<binding_core::Shared<polyspec_sample::Tag>>> = const \{ RefCell::new\(Table::new\(\)\) \};/);
  // The constructor gives the handle; a method reads the value of its handle and shares it for the call.
  assert.match(lib, /\n {4}pub mod class_tag \{\n {8}use super::\*;\n/);
  assert.match(lib, /#\[wasm_bindgen\(js_name = "__Tag_new"\)\]\n {8}pub fn member_new\(name: JsValue\) -> Result<u32, JsValue> \{/);
  // GN-6h: a value of the class comes in from the language, so the class holds it in a lock that each call reads.
  assert.match(lib, /pub fn member_name\(this: u32\) -> Result<JsValue, JsValue> \{\n {12}guard\(\|\| \{\n {16}let held = held_tag\(this\)\?;\n {16}let receiver = held\.read\("Tag", &\[\]\)\.map_err\(binding_error\)\?;\n {16}let receiver = &\*receiver;\n {16}let result = polyspec_sample::Tag::name\(receiver\);/);
  assert.match(lib, /#\[wasm_bindgen\(js_name = "__free_Tag"\)\]\n {4}pub fn free_tag\(this: u32\) \{/);
  assert.match(lib, /\nfn in_tag\(value: &JsValue, subject: &str\) -> Result<polyspec_sample::Tag, Fail> \{\n {4}let handle = handle_of\(0, value\)\?/);
  assert.match(lib, /pub fn register\(classes: Vec<Function>, makers: Vec<Function>, readers: Vec<Function>\)/);
  // Q-4 only: the to_json of the sample names php and node, so WASM has none.
  assert.doesNotMatch(lib, /host_json/);
  const entry = text(out, 'packages/ts/wasm/generated/index.mjs');
  assert.match(entry, /\nexport class Tag \{\n {2}#handle;\n/);
  assert.match(entry, /this\.#handle = enter\(SampleInternalError, \(\) => glue\.__Tag_new\(args\[0\]\)\);/);
  assert.match(entry, /released\.register\(this, \[glue\.__free_Tag, this\.#handle\]\);/);
  assert.match(entry, /\n {2}get name\(\) \{\n {4}return enter\(SampleInternalError, \(\) => glue\.__Tag_name\(this\.#handle\)\);/);
  assert.match(entry, /\n {2}\[Symbol\.iterator\]\(\) \{\n {4}return enter\(SampleInternalError, \(\) => glue\.__Tag_iterate\(this\.#handle\)\)\[Symbol\.iterator\]\(\);/);
  assert.match(entry, /\n {2}toString\(\) \{/);
  assert.doesNotMatch(entry, /toJSON/);
  // A private field is the brand: no other value has a handle.
  assert.match(entry, /readers\.push\(\(value\) => \(typeof value === 'object' && value !== null && #handle in value \? value\.#handle : undefined\)\);/);
  // The classes are defined before the module takes the functions that make and read their instances.
  assert.ok(entry.indexOf('export class Tag') < entry.indexOf('glue.__register('), 'the class is defined after the registration');
  assert.match(entry, /glue\.__register\(\[[A-Za-z, ]+\], makers, readers\);/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.d.ts'), /export declare class Tag \{\n {2}constructor\(name: string\);\n {2}get name\(\): string;\n {2}\[Symbol\.iterator\]\(\): IterableIterator<\[string, Tag\]>;\n {2}toString\(\): string;\n\}/);
  const tests = text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  assert.match(tests, /assert\.equal\(String\(new pkg\.Tag\('a'\)\), '#a'\)/);
  assert.match(tests, /test\('G-7: Tag\.constructor counts and names its arguments'/);
  // Q-4 only: with wasm in its targets the to_json is the hook toJSON, which never returns.
  const hooked = classSample(['wasm']);
  hooked.units.find((u: any) => u.id === 'tag').members.find((m: any) => m.kind === 'to_json').only.targets.push('wasm');
  const withHook = generate({ contract: hooked, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  assert.match(text(withHook, 'packages/ts/wasm/generated/index.mjs'), /\n {2}toJSON\(\) \{\n {4}return enter\(SampleInternalError, \(\) => glue\.__Tag_toJSON\(this\.#handle\)\);/);
  assert.match(text(withHook, 'packages/ts/wasm/generated/lib.rs'), /match result \{\}/);
  assert.match(text(withHook, 'packages/ts/wasm/generated/index.d.ts'), /toJSON\(\): never;/);
  assert.match(text(withHook, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /const receiver = new pkg\.Tag\('a'\);\n {2}assert\.throws\(\(\) => JSON\.stringify\(receiver\)/);
  // GN-18a, GN-6h: a member that writes its receiver takes the write guard of the lock that the table holds.
  const written = classSample(['wasm']);
  const full2 = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const counter = full2.units.find((u: any) => u.id === 'counter');
  counter.members = counter.members.filter((m: any) => ['counter.new', 'counter.total', 'counter.add'].includes(m.id));
  written.units.push(counter);
  const writing = text(generate({ contract: written, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() }), 'packages/ts/wasm/generated/lib.rs');
  assert.match(writing, /let held = held_counter\(this\)\?;\n[^\n]*\n {16}let amount = IntoCore::into_core\(amount, "amount"\)\.map_err\(binding_error\)\?;\n {16}let mut receiver = held\.write\("Counter"\)\.map_err\(binding_error\)\?;/);
  assert.match(writing, /static TABLE_COUNTER: RefCell<Table<binding_core::Exclusive<polyspec_sample::Counter>>>/);
  assert.match(text(generate({ contract: written, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() }), 'packages/ts/wasm/generated/index.mjs'), /class Counter \{/);
  // T-5: a class that no parameter takes has no conversion in; U-1: one without a constructor is made by the module only.
  const alone = classSample(['wasm']);
  alone.units = alone.units.filter((u: any) => u.id === 'tag');
  const tag = alone.units[0];
  tag.constructible = false;
  tag.members = tag.members.filter((m: any) => m.kind !== 'constructor');
  alone.cases = [];
  const kept = generate({ contract: alone, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
  assert.doesNotMatch(text(kept, 'packages/ts/wasm/generated/lib.rs'), /\nfn (in_tag|handle_of)\(/);
  assert.match(text(kept, 'packages/ts/wasm/generated/index.mjs'), /if \(args\[0\] !== MAKE\) throw new TypeError\('Tag has no public constructor'\);/);
  assert.match(text(kept, 'packages/ts/wasm/generated/index.d.ts'), /export declare class Tag \{\n {2}private constructor\(\);/);
  // A contract without a class unit registers the library classes alone.
  const { contract, caseFiles } = load();
  contract.targets.push('wasm');
  contract.packages.node.entries['.'].conditions = { node: 'napi', browser: 'wasm' };
  for (const row of Object.values(contract.errors.classes) as Record<string, string>[]) row['wasm'] = row['node'] ?? '';
  const plain = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  assert.match(text(plain, 'packages/ts/wasm/generated/lib.rs'), /pub fn register\(classes: Vec<Function>\) -> Result/);
  assert.doesNotMatch(text(plain, 'packages/ts/wasm/generated/lib.rs') + text(plain, 'packages/ts/wasm/generated/index.mjs'), /Table<|makers|FinalizationRegistry/);
});

// The sample of the end-to-end check, with its case files, after a change.
const sampleWith = (change: (contract: any, cases: any) => void, targets?: string[]): Map<string, string | Buffer> => {
  const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const files = sampleCases();
  change(contract, files.get('contracts/cases.json'));
  if (targets !== undefined) contract.targets = targets;
  return generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: files });
};
const LIBS = ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs'] as const;
const pythonTests = 'packages/python/generated/tests/test_generated.py';
const nodeTests = 'packages/ts/generated/tests/generated.test.mjs';
const phpTests = 'packages/php-ext/generated/tests/GeneratedTest.php';

test('an entry point runs its core call with the faults that a case armed, and the test requires each to fire (G-5, GN-8a)', () => {
  const out = sampleWith(() => {});
  for (const path of LIBS) {
    const lib = text(out, path);
    assert.match(lib, /const _: &str = polyspec_sample::fault::READ;\nconst _: &str = polyspec_sample::fault::INTERNAL;/, path);
    assert.match(lib, /guard\((py, )?\|\| shielded\(\|\| \{/, path);
    assert.match(lib, /#\[cfg\(feature = "fault-test"\)\]\nfn with_faults<T>\(member: &str, call: impl FnOnce\(\) -> T\) -> T \{\n    binding_core::fault::take\(member\)\.run\(call\)/, path);
    assert.match(lib, /#\[cfg\(feature = "fault-test"\)\]\nfn shielded<T>\(work: impl FnOnce\(\) -> T\) -> T \{\n    binding_core::fault::Armed::empty\(\)\.run\(work\)/, path);
    // The work of every entry point of a member is shielded, the hooks and the iterate too; the poison entry point
    // of B-5c (GN-5) and the round trip of an alias (GN-13e) are no member.
    const members = lib.replace(/\n(?:pub )?fn _?panic_test_held\([\s\S]*?\n\}\n/, '\n').replace(/\n *(?:pub )?fn _?alias_round_\w+[\s\S]*?\n *\}\n/g, '\n');
    assert.notEqual(members, lib, path);
    assert.equal(members.match(/guard\((py, )?\|\| (?!shielded|panic!|binding_core::fault|binding_core::errno|\{\n        let (id: u64|_value))/g), null, path);
    // GN-8a: the arming is taken where the core is called, after the arguments are converted and the locks are
    // taken, so a call that fails before the core leaves it.
    assert.match(lib, /let result = match with_faults\("sample\.measure", \|\| polyspec_sample::measure\(&text\)\) \{/, path);
    assert.match(lib, /let mut receiver = self\.inner\.write\("Counter"\)[^\n]*\?;\n\s+let other = other\.read\("Counter", &\[\]\)[^\n]*\?;\n\s+let receiver = &mut \*receiver;\n\s+let other = &\*other;\n\s+let result = match with_faults\("counter\.draw", \|\| polyspec_sample::Counter::draw\(receiver, CoreForm::core_form\(other\)\)\) \{/, path);
    // The core call of an iterate is the whole iteration.
    assert.match(lib, /in with_faults\("tag\.entries", \|\| collected\(polyspec_sample::Tag::entries\(receiver\)\)\)/, path);
    // Each core call is armed for its own member, and none twice.
    // GN-6n, GN-6ab: an entry point that waits for a future installs its faults around each poll (armed_future); the
    // advance of a Driven object (Node) is an entry point without a core call of its own.
    const advances = (lib.match(/pub fn advance<'env>/g) ?? []).length;
    assert.equal((lib.match(/(?:with_faults|armed_future)\("/g) ?? []).length + advances, (lib.match(/shielded\(\|\| /g) ?? []).length, path);
  }
  // The Go entry of the points left gives them by the conversion itself, which clippy requires over a closure.
  assert.ok(text(out, 'packages/go/internal/ffi/generated/lib.rs').includes('            list_out(&mut buffer, left, text_out);\n'));
  // GN-8a: the call that is refused as busy leaves the arming, which the next call of the member takes.
  assert.match(text(out, pythonTests), /held = pkg\.Counter\(0\)\n {8}armed = _native\._arm_faults\("counter\.draw", "\[\{\\"point\\":\\"sample\.draw\\",\\"kind\\":\\"broken\\"\}\]"\)\n {8}with self\.assertRaises\(pkg\.SampleBusyError\) as caught:\n {12}held\.draw\(held\)\n(?:[^\n]*\n)+? {8}with self\.assertRaises\(pkg\.SampleInternalError\) as caught:\n {12}held\.draw\(pkg\.Counter\(0\)\)\n(?:[^\n]*\n){2} {8}self\.assertEqual\(_native\._fault_left\(armed\), \[\]\)/);
  assert.match(text(out, nodeTests), /const armed = addon\(\)\.__armFaults\('counter\.draw', [^\n]*\n {2}assert\.throws\(\(\) => held\.draw\(held\), [^\n]*'busy'\);\n(?:[^\n]*\n)+? {2}assert\.throws\(\(\) => held\.draw\(new pkg\.Counter\(0\)\), [^\n]*'internal'\);\n {2}assert\.deepEqual\(addon\(\)\.__faultLeft\(armed\), \[\]\);/);
  assert.match(text(out, phpTests), /\$armed = \\Polyspec\\Sample\\Internal\\armFaults\("counter\.draw", [^\n]*\n {8}try \{\n {12}\$held->draw\(\$held\);[\s\S]*?\$held->draw\(new \\Polyspec\\Sample\\Counter\(0\)\);[\s\S]*?self::assertSame\(\[\], \\Polyspec\\Sample\\Internal\\faultLeft\(\$armed\)\);/);
  const python = text(out, pythonTests);
  assert.match(python, /arg_0 = "abc"\n        armed = _native\._arm_faults\("sample\.measure", "\[\{\\"point\\":\\"sample\.read\\",\\"kind\\":\\"io\\"\}\]"\)\n        with self\.assertRaises\(pkg\.SampleIoError\) as caught:\n            pkg\.measure\(arg_0\)\n        self\.assertEqual\(_native\._fault_left\(armed\), \[\]\)/);
  assert.match(text(out, nodeTests), /const arg0 = 'abc';\n  const armed = addon\(\)\.__armFaults\('sample\.measure', '\[\{"point":"sample\.read","kind":"io"\}\]'\);\n  assert\.throws\(\(\) => pkg\.measure\(arg0\)/);
  assert.match(text(out, nodeTests), /assert\.deepEqual\(addon\(\)\.__faultLeft\(armed\), \[\]\);/);
  assert.match(text(out, phpTests), /\$armed = \\Polyspec\\Sample\\Internal\\armFaults\("sample\.measure", .*\);\n        try \{\n            \\Polyspec\\Sample\\measure\(\$arg0\);/);
  assert.match(text(out, phpTests), /self::assertSame\(\[\], \\Polyspec\\Sample\\Internal\\faultLeft\(\$armed\)\);/);
});

test('Go compares the errno of a symbol as int, and WASM, a target without errno, arms without it and requires none (G-5)', () => {
  // The sample arms sample.tally with the errno EIO in a case of counter.tally and in a call of then of counter.settle.
  const out = sampleWith(() => undefined, ['go', 'wasm']);
  const goFault = text(out, 'packages/go/zz_generated_fault_test.go');
  // Errno() gives (int, bool), so the value of the symbol is converted to int.
  assert.match(goFault, /if errno, ok := failure\.Errno\(\); !ok \|\| errno != int\(syscall\.EIO\) \{/);
  assert.doesNotMatch(goFault, /int64\(syscall\./);
  const wasm = text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  const armed = `'[{"point":"sample.tally","kind":"io"}]'`;
  assert.ok(wasm.includes(`  const armed = glue.__armFaults('counter.tally', ${armed});\n`), wasm);
  assert.ok(wasm.includes(`= stepGlue.__armFaults('counter.tally', ${armed});\n`), wasm);
  assert.doesNotMatch(wasm, /"errno":/);
  assert.match(wasm, /test\('B-4: Counter\.tally a_tally_that_fails_is_unreadable'[^]*?error\.kind === 'unreadable' &&\n    error\.status === null &&\n    error\.errno === null\);/);
  assert.doesNotMatch(wasm, /errnoOf|node:os/);
  // A number is compared as it is.
  const numbered = text(sampleWith((c, cases) => { cases.counter_tally[1].raises.errno = 5; }, ['wasm']), 'packages/ts/wasm/generated/tests/generated.test.mjs');
  assert.match(numbered, /error\.errno === 5\);/);
});

test('a contract without fault injection points has no item of them (G-5)', () => {
  const out = sampleWith((c, cases) => {
    delete c.faults;
    cases.measure = [];
    // The tally of a counter arms faults too, in its own case and in a call of then of settle (GN-13f).
    cases.counter_tally = cases.counter_tally.filter((kase: any) => kase.faults === undefined);
    cases.counter_settle = cases.counter_settle.filter((kase: any) => kase.receiver === undefined);
  });
  for (const path of LIBS) assert.doesNotMatch(text(out, path), /with_faults|fault::|fault-test/, path);
  assert.throws(() => sampleWith((c) => { delete c.faults; }), /arms faults, but the contract names no fault injection point/);
});

test('the errno of a case is the value of its symbol in Python, Node and PHP, which reads it from the binding (G-5, GN-8a)', () => {
  const withErrno = (c: any, cases: any): void => {
    cases.measure[0].faults[0].errno = 'ENOSPC';
    cases.measure[0].raises.errno = 'ENOSPC';
  };
  const out = sampleWith(withErrno, ['python', 'node', 'php']);
  // GN-13e: sample.echo returns the alias data, whose result the tokens compare, which read json and struct.
  assert.match(text(out, pythonTests), /^import errno\nimport json\nimport struct\nimport sys\nimport unittest$/m);
  assert.match(text(out, pythonTests), /self\.assertEqual\(error\.errno, errno\.ENOSPC\)/);
  assert.match(text(out, nodeTests), /const errnoOf = constants\.errno;/);
  assert.match(text(out, nodeTests), /error\.errno === errnoOf\.ENOSPC\);/);
  // GN-8a: PHP has no table of the errno symbols of its machine, so the extension gives the value of a symbol from the
  // table that arms the faults, with the other entry points of the feature fault-test.
  assert.match(text(out, phpTests), /self::assertSame\(\\Polyspec\\Sample\\Internal\\errnoOf\("ENOSPC"\), \$error->errno\(\)\);/);
  const phpLib = text(out, 'packages/php-ext/generated/lib.rs');
  const errnoOf = /#\[cfg\(feature = "panic-test"\)\]\n#\[php_function\]\n#\[php\(name = "Polyspec\\\\Sample\\\\Internal\\\\errnoOf"\)\]\npub fn errno_of\(symbol: String\) -> Result<i64, PhpException> \{\n {4}guard\(\|\| binding_core::errno::value\(&symbol\)/;
  const registered = /#\[cfg\(feature = "panic-test"\)\]\n {8}let module = module\.function\(wrap_function!\(panic_test\)\)\.function\(wrap_function!\(errno_of\)\);/;
  assert.match(phpLib, errnoOf);
  assert.match(phpLib, registered);
  // A contract without fault injection points reads the value through the same entry point of panic-test, which every
  // test build turns on, and its binding names nothing of fault.
  const withoutPoints = (c: any, cases: any): void => {
    delete c.faults;
    cases.measure = [];
    cases.counter_tally = cases.counter_tally.filter((kase: any) => kase.faults === undefined);
    cases.counter_settle = cases.counter_settle.filter((kase: any) => kase.receiver === undefined);
    cases.resolve[0].raises.errno = 'ENOSPC';
  };
  const without = sampleWith(withoutPoints, ['php']);
  assert.match(text(without, phpTests), /self::assertSame\(\\Polyspec\\Sample\\Internal\\errnoOf\("ENOSPC"\), \$error->errno\(\)\);/);
  assert.match(text(without, 'packages/php-ext/generated/lib.rs'), errnoOf);
  assert.match(text(without, 'packages/php-ext/generated/lib.rs'), registered);
  assert.doesNotMatch(text(without, 'packages/php-ext/generated/lib.rs'), /fault::|fault-test/);
});

test('fault injection points and the point of another library are armed for the member in the five targets (G-5, GN-5)', () => {
  const drop = (c: any, cases: any): void => {
    c.units = c.units.filter((u: any) => !['lookup', 'search', 'tag', 'data', 'counter', 'ledger'].includes(u.id));
    const kept = ['sample.measure', 'sample.checked', 'sample.touch'];
    c.units.find((u: any) => u.id === 'sample').members = c.units.find((u: any) => u.id === 'sample').members.filter((m: any) => kept.includes(m.id));
    c.cases = c.cases.filter((row: any) => kept.includes(row.member));
    c.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
    void cases;
  };
  // Go arms the faults of a case through the entry points of the feature fault-test, in a test file of its build tag.
  const go = sampleWith(drop, ['go']);
  assert.match(text(go, 'packages/go/internal/ffi/generated/lib.rs'), /#\[cfg\(feature = "fault-test"\)\]\n#\[no_mangle\]\npub unsafe extern "C" fn polyspec_sample__arm_faults\(/);
  assert.match(text(go, 'packages/go/zz_generated_fault_test.go'), /^\/\/go:build polyspec_fault_test$/m);
  assert.match(text(go, 'packages/go/zz_generated_fault_test.go'), /armed, armErr := binding\.ArmFaults\("sample\.measure", /);
  // WASM arms the faults of a case through the entry points of its feature fault-test.
  const wasm = sampleWith(drop, ['wasm']);
  const lib = text(wasm, 'packages/ts/wasm/generated/lib.rs');
  assert.match(lib, /let result = match with_faults\("sample\.measure", \|\| polyspec_sample::measure\(&text\)\) \{/);
  assert.match(lib, /#\[cfg\(feature = "fault-test"\)\]\n {4}#\[wasm_bindgen\(js_name = "__armFaults"\)\]/);
  // Every entry of a member is shielded once and arms its core call once: a call with_faults, and the future of a
  // machine armed_future (GN-6n); the advance of a Driven object is shielded and arms nothing. The test of the entries
  // of the WASM crate reads this entry by entry; here the counts of the crate agree with it.
  const advances = (lib.match(/pub fn advance\(&mut self/g) ?? []).length;
  assert.equal((lib.match(/with_faults\("|armed_future\("/g) ?? []).length + advances, (lib.match(/shielded\(\|\| /g) ?? []).length, 'each member entry arms once and is shielded once, and each advance is shielded');
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  assert.match(String(trackedPackages(sample, '0.0.0').get('packages/ts/wasm/Cargo.toml')), /\[features\]\npanic-test = \[\]\nfault-test = \["polyspec-sample\/fault-test"\]\ncodec-test = \[\]\nnative-count-test = \[\]\nthrown-count-test = \[\]\n\n/);
  assert.match(text(wasm, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /async \(\) => \{\n  const glue = await glueModule\(\);\n  const arg0 = 'abc';\n  const armed = glue\.__armFaults\('sample\.measure', [^\n]*\n  assert\.throws\(\(\) => pkg\.measure\(arg0\)(?:[^\n]*\n)+?  assert\.deepEqual\(glue\.__faultLeft\(armed\), \[\]\);/);
  // GN-5: a point of another library is armed by the arming of the member, through the entry of this crate, in the
  // five targets: the core of that library is linked into the crate, so its point reads the arming of the member.
  const other = (targets: string[]): Map<string, string | Buffer> => sampleWith((c, cases) => { drop(c, cases); cases.measure[0].faults[0].point = 'other.read'; }, targets);
  assert.match(text(other(['python']), pythonTests), /armed = _native\._arm_faults\("sample\.measure", "\[\{\\"point\\":\\"other\.read\\",/);
  assert.match(text(other(['node']), nodeTests), /const armed = addon\(\)\.__armFaults\('sample\.measure', '\[\{"point":"other\.read",/);
  assert.match(text(other(['php']), phpTests), /\$armed = \\Polyspec\\Sample\\Internal\\armFaults\("sample\.measure", [^\n]*other\.read/);
  assert.match(text(other(['go']), 'packages/go/zz_generated_fault_test.go'), /armed, armErr := binding\.ArmFaults\("sample\.measure", [^\n]*other\.read/);
  assert.match(text(other(['wasm']), 'packages/ts/wasm/generated/tests/generated.test.mjs'), /const armed = glue\.__armFaults\('sample\.measure', [^\n]*other\.read/);
  // A contract without faults of its own has no items of GN-8a, so its case that arms a point of another library is
  // refused by name.
  assert.throws(() => sampleWith((c, cases) => { delete c.faults; cases.measure[0].faults[0].point = 'other.read'; }), /arms faults, but the contract names no fault injection point \(G-5\)/);
});

test('a case of an alias gives a value of the language that is no value of the alias by its sort, and an integer outside 64 bits runs in PHP as host values (G-5, GN-13)', () => {
  const raises = { kind: 'unsupported', status: null, category: 'value' };
  const change = (c: any, cases: any): void => {
    cases.data_in.push(
      { id: 'a_function', value: { host: 'callable' }, raises },
      { id: 'a_date', value: { host: 'date' }, raises },
      { id: 'an_object', value: { host: 'object' }, raises },
      { id: 'a_wide_integer', value: { kind: 'int', value: '9223372036854775808' }, raises },
    );
  };
  const out = sampleWith(change);
  const wasm = sampleWith(change, ['wasm']);
  const python = text(out, pythonTests);
  assert.match(python, /^import datetime\n/m);
  assert.match(python, /_native\._alias_in_data\(lambda: None\)/);
  assert.match(python, /_native\._alias_in_data\(datetime\.date\(1970, 1, 1\)\)/);
  assert.match(python, /_native\._alias_in_data\(object\(\)\)/);
  assert.match(python, /_native\._alias_in_data\(9223372036854775808\)/);
  for (const [js, entry] of [[text(out, nodeTests), 'addon\\(\\)'], [text(wasm, 'packages/ts/wasm/generated/tests/generated.test.mjs'), 'glue']] as const) {
    const path = entry;
    assert.match(js, new RegExp(`${entry}\\.__aliasInData\\(\\(\\) => null\\)`), path);
    assert.match(js, new RegExp(`${entry}\\.__aliasInData\\(new Date\\(0\\)\\)`), path);
    assert.match(js, new RegExp(`${entry}\\.__aliasInData\\(new \\(class Other \\{\\}\\)\\(\\)\\)`), path);
    assert.match(js, new RegExp(`${entry}\\.__aliasInData\\(9223372036854775808n\\)`), path);
  }
  // Go makes a func, a time and an empty struct, in the tests of the feature codec-test, which import time.
  const goCodec = text(out, 'packages/go/internal/binding/zz_generated_codec_test.go');
  assert.match(goCodec, /^\t"time"$/m);
  assert.match(goCodec, /AliasInData\(func\(\) \{\}\)/);
  assert.match(goCodec, /AliasInData\(time\.Unix\(0, 0\)\.UTC\(\)\)/);
  assert.match(goCodec, /AliasInData\(struct\{\}\{\}\)/);
  assert.match(goCodec, /AliasInData\(uint64\(9223372036854775808\)\)/);
  const php = text(out, phpTests);
  assert.match(php, /Internal\\aliasInData\(static fn \(\): null => null\);/);
  assert.match(php, /Internal\\aliasInData\(new \\DateTimeImmutable\('@0'\)\);/);
  assert.match(php, /Internal\\aliasInData\(new class \{\}\);/);
  // PHP has no integer outside 64 bits: the case runs through the entry point of the feature case-test, which gives the
  // in function of the alias the decimal token that Python and JavaScript describe for such an integer.
  const entry = /public function testU7DataInAWideInteger\(\): void\n    \{\n        try \{\n            \\Polyspec\\Sample\\Internal\\caseTest(\d+)\(\);/.exec(php);
  assert.ok(entry, php);
  const lib = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(lib, new RegExp(`pub fn case_test_${entry[1] ?? ''}\\(\\)[\\s\\S]*?let value = HostValue::Number\\(String::from\\("9223372036854775808"\\)\\);`));
  assert.throws(() => sampleWith((c, cases) => { cases.data_in[0].value = { host: 'socket' }; }), /the case bytes_that_are_no_text_are_not_data of the alias data: a value \{"host"\} is "callable", "date" or "object", not "socket" \(G-5\)/);
});

test('core.result says whether the core returns a Result, and a return of none is bound as the unit (E-1c)', () => {
  const out = sampleWith(() => {});
  for (const path of LIBS) {
    const lib = text(out, path);
    assert.match(lib, /let result = match with_faults\("sample\.checked", \|\| polyspec_sample::checked\(&text\)\) \{\n\s+Ok\(value\) => value,\n\s+Err\(error\) => return Err\(core_error\(/, path);
    assert.match(lib, /let \(\): \(\) = with_faults\("sample\.touch", \|\| polyspec_sample::touch\(&text\)\);/, path);
  }
  const plain = sampleWith((c) => { c.units.find((u: any) => u.id === 'sample').members.find((m: any) => m.id === 'sample.checked').core = 'polyspec_sample::checked'; });
  assert.match(text(plain, LIBS[0]), /let result = with_faults\("sample\.checked", \|\| polyspec_sample::checked\(&text\)\);/);
  assert.throws(() => sampleWith((c) => {
    c.errors.kinds = [];
    delete c.faults;
    c.units = c.units.filter((u: any) => !['lookup', 'search', 'tag', 'data', 'counter', 'ledger'].includes(u.id));
    const kept = ['sample.checked'];
    c.units.find((u: any) => u.id === 'sample').members = c.units.find((u: any) => u.id === 'sample').members.filter((m: any) => kept.includes(m.id));
    c.cases = c.cases.filter((row: any) => kept.includes(row.member));
  }), /sample\.checked: its core returns a Result \(core\.result\), but errors\.kinds names no core error/);
});

test('the kinds of an alias are checked against its error, run alone and through each member that takes it (U-7)', () => {
  const out = sampleWith(() => {});
  for (const path of LIBS) {
    const lib = text(out, path);
    assert.match(lib, /#\[allow\(clippy::unneeded_struct_pattern, reason = "I-2"\)\]\nconst _: fn\(&polyspec_sample::Error\) -> bool = \|error\| matches!\(error, polyspec_sample::Error::Unsupported \{ \.\. \}\);/, path);
    assert.match(lib, /#\[cfg\(feature = "codec-test"\)\]\n(#\[.*\]\n)+(pub )?fn _?alias_in_data/, path);
  }
  assert.match(text(out, pythonTests), /def test_u7_data_in_bytes_that_are_no_text_are_not_data\(self\) -> None:\n        with self\.assertRaises\(pkg\.SampleValueError\) as caught:\n            _native\._alias_in_data\(bytes\.fromhex\("ff"\)\)/);
  assert.match(text(out, pythonTests), /def test_u7_size_value_gives_the_kind_of_data\(self\) -> None:\n        with self\.assertRaises\(pkg\.SampleValueError\) as caught:\n            pkg\.size\(bytes\.fromhex\("ff"\)\)/);
  assert.match(text(out, nodeTests), /addon\(\)\.__aliasInData\(new Uint8Array\(Buffer\.from\('ff', 'hex'\)\)\)/);
  assert.match(text(out, phpTests), /\\Polyspec\\Sample\\Internal\\aliasInData\(hex2bin\("ff"\)\);/);
  const without = sampleWith((c, cases) => {
    delete c.units.find((u: any) => u.id === 'data').in_raises;
    c.cases = c.cases.filter((row: any) => row.alias === undefined);
    void cases;
  });
  for (const path of LIBS) assert.doesNotMatch(text(without, path), /alias_in_data|the kinds of in_raises/, path);
});

test('a binding crate has the test features that its contract needs (GN-5)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const packages = trackedPackages(sample, '0.0.0');
  assert.match(String(packages.get('packages/python/Cargo.toml')), /\[features\]\npanic-test = \[\]\nfault-test = \["polyspec-sample\/fault-test"\]\ncodec-test = \[\]\nthrown-count-test = \[\]\n\n\[/);
  // GN-6u: a target that gives a Native back through a round trip counts the Natives that its table holds.
  for (const path of ['packages/ts/Cargo.toml', 'packages/php-ext/Cargo.toml']) {
    assert.match(String(packages.get(path)), /\[features\]\npanic-test = \[\]\nfault-test = \["polyspec-sample\/fault-test"\]\ncodec-test = \[\]\nnative-count-test = \[\]\nthrown-count-test = \[\]\n\n\[/, path);
  }
  delete sample.faults;
  delete sample.units.find((u: any) => u.id === 'data').in_raises;
  assert.match(String(trackedPackages(sample, '0.0.0').get('packages/python/Cargo.toml')), /\[features\]\npanic-test = \[\]\nthrown-count-test = \[\]\n\n\[dependencies\]/);
  // GN-6ae: the count of what was thrown is a feature of every crate of a contract that keeps it, and of no other.
  assert.match(String(trackedPackages(load().contract, '0.0.0').get('packages/python/Cargo.toml')), /\[features\]\npanic-test = \[\]\n\n\[dependencies\]/);
});

test('the generator reads the whole contract and names every refused item before it fails (G-4, P-4)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const functions = sample.units.find((u: any) => u.id === 'sample');
  // Refused items in a unit of functions, in a class, in a callback interface and among the kinds of the core error.
  functions.members.find((m: any) => m.id === 'sample.count').native = { python: 'count' };
  functions.members.find((m: any) => m.id === 'sample.join').wait = 'thread';
  sample.units.find((u: any) => u.id === 'tag').members.find((m: any) => m.id === 'tag.name').writable = true;
  sample.units.find((u: any) => u.id === 'lookup').members[0].async_allowed = true;
  sample.errors.kinds.push({ variant: 'polyspec_sample::Error::Other', library: 'other' });
  sample.errors.binding.push({ kind: 'value' });
  const error = (() => {
    try {
      generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() });
    } catch (caught) {
      return caught as Error & { refusals?: string[] };
    }
    return undefined;
  })();
  assert.ok(error !== undefined && error.constructor.name === 'Unsupported', 'the contract is refused');
  for (const message of [
    /sample\.count: native is not generated yet/,
    /sample\.join: wait thread is not generated yet/,
    /tag\.name: a writable property is not generated yet/,
    /lookup\.find: an async callback is not generated yet/,
    /polyspec_sample::Error::Other: a kind of another library names the variant of the core error that holds it, <outer>\/<inner> \(GN-7c\)/,
    /errors\.binding overrides are not generated yet/,
  ]) assert.match(error.message, message);
  assert.equal(error.refusals?.length, 6, error.message);
});

test('the refusals of each target are named together, and a target generates alone what the whole generation writes for it (G-4, GN-1b)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const caseFiles = sampleCases();
  // The targets that the generator takes for the sample, generated at once and one by one.
  const whole = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  const parts = new Map<string, string | Buffer>();
  for (const target of (TAKEN['sample'] ?? []) as Lang[]) {
    for (const [path, text] of generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: [target] })) parts.set(path, text);
  }
  assert.deepEqual([...parts.keys()].sort(), [...whole.keys()]);
  for (const [path, text] of whole) assert.ok(String(parts.get(path)) === String(text), path);
  // Every target generates the classes, the callback interface and the value alias, and Python alone is generated
  // from the same contract.
  const five = sample;
  assert.deepEqual(five.targets, FIVE);
  assert.ok(generate({ contract: five, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: ['python'] }).size > 0);
  // GN-15a: a member of another module reaches a class and a callback through the functions of their packages that
  // take binding.Token, and its test makes an instance by the constructor of that package.
  const moved = JSON.parse(JSON.stringify(five));
  moved.units.find((u: any) => u.id === 'tag').module = 'tags';
  moved.units.find((u: any) => u.id === 'lookup').module = 'lookups';
  const split = generate({ contract: moved, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: ['go'] });
  const root = text(split, 'packages/go/zz_generated_sample.go');
  assert.match(root, /\tenc\.Uint\(tags\.TagHandle\(binding\.Token\{\}, tag\)\)\n/);
  assert.match(root, /= tags\.TagFromHandle\(binding\.Token\{\}, dec\.Uint\(\)\)\n/);
  assert.match(root, /call\.Callback\(enc, lookups\.DispatchLookup\(binding\.Token\{\}, [a-z]+\)\)/);
  const tags = text(split, 'packages/go/tags/zz_generated_tags.go');
  assert.match(tags, /\nfunc TagHandle\(_ binding\.Token, this \*Tag\) uint64 \{\n\treturn this\.handle\(\)\n\}\n/);
  assert.match(tags, /\nfunc TagFromHandle\(_ binding\.Token, handle uint64\) \*Tag \{\n\treturn newTag\(handle\)\n\}\n/);
  assert.match(text(split, 'packages/go/lookups/zz_generated_lookups.go'), /\nfunc DispatchLookup\(_ binding\.Token, object Lookup\) binding\.Callback \{\n\treturn dispatchLookup\(object\)\n\}\n/);
  assert.match(text(split, 'packages/go/internal/binding/zz_generated_binding.go'), /\ntype Token struct\{\}\n/);
  assert.match(text(split, 'packages/go/zz_generated_test.go'), /Join\(\[\]\*tags\.Tag\{\}\)/);
  assert.doesNotMatch(text(generate({ contract: five, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: ['go'] }), 'packages/go/zz_generated_sample.go'), /FromHandle|TagHandle/);
  // Packages that would import each other are refused by name.
  const cycle = JSON.parse(JSON.stringify(moved));
  const tag = cycle.units.find((u: any) => u.id === 'tag');
  tag.members.push({ ...tag.members.find((m: any) => m.id === 'tag.name'), id: 'tag.counter', name: ['counter'], returns: { unit: 'counter' } });
  assert.throws(() => generate({ contract: cycle, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: ['go'] }), /the Go packages of the modules \(the root\) and tags import each other, which Go refuses \(GN-15a\)/);
  assert.ok(generate({ contract: five, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: ['go'] }).has('packages/go/zz_generated_sample.go'));
  assert.ok(generate({ contract: five, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: ['wasm'] }).has('packages/ts/wasm/generated/lib.rs'));
});

test('generate --target writes the directories of those targets alone, the files that a whole generation writes (GN-1b, GN-14c)', () => {
  const whole = mkdtempSync(join(tmpdir(), 'binding-t-'));
  const parts = mkdtempSync(join(tmpdir(), 'binding-u-'));
  try {
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', whole, '--target', FIXTURE_TAKEN]);
    const targets = FIXTURE_TAKEN.split(',');
    const [first, ...others] = targets;
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', parts, '--target', first ?? '']);
    const alone = files(parts);
    assert.ok(alone.size > 0 && alone.size < files(whole).size, `${first ?? ''} alone wrote ${alone.size} files`);
    for (const [path, bytes] of alone) assert.ok(bytes.equals(files(whole).get(path) ?? Buffer.alloc(0)), path);
    // A later generation of the other targets keeps what the first wrote.
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', parts, '--target', others.join(',')]);
    assert.deepEqual([...files(parts).keys()], [...files(whole).keys()]);
    const refused = spawnSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', parts, '--target', 'cobol'], { encoding: 'utf8' });
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /--target names cobol, which the contract does not name in targets/);
  } finally {
    rmSync(whole, { recursive: true, force: true });
    rmSync(parts, { recursive: true, force: true });
  }
});

test('the Rust files of the thin packages are in the form that rustfmt gives them (GN-3a)', () => {
  const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/shapes/packages/rust/interface.json', import.meta.url), 'utf8'));
  const files = trackedPackages(contract, '0.0.0');
  // A reason that does not fit on a line of 80 columns is the comment above the allow, which names its rule id alone.
  assert.match(files.get('packages/go/internal/ffi/src/lib.rs') as string, /\n\/\/ B-8: the C ABI reads [^\n]*\n#!\[allow\(unsafe_code, reason = "B-8"\)\]\n/);
  for (const [path, body] of files) {
    if (!path.endsWith('.rs')) continue;
    for (const found of (body as string).matchAll(/^#!\[allow.*$/gm)) assert.ok(found[0].length <= 80 && found[0].endsWith(')]'), `${path}: ${found[0]}`);
  }
});

test('the Rust files of the thin packages are unchanged by rustfmt with its defaults and with the settings of a repository (GN-3a)', () => {
  const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/shapes/packages/rust/interface.json', import.meta.url), 'utf8'));
  // The toolchain of rust-toolchain.toml, outside any checkout, so that no rustfmt.toml is read but the settings given.
  const channel = /channel = "([^"]+)"/.exec(readFileSync(new URL('../../../rust-toolchain.toml', import.meta.url), 'utf8'))?.[1] ?? '';
  const where = mkdtempSync(join(tmpdir(), 'binding-fmt-'));
  try {
    const settings = ['', 'max_width=120,use_small_heuristics=Max'];
    let checked = 0;
    for (const [path, body] of trackedPackages(contract, '0.0.0')) {
      if (!path.endsWith('.rs')) continue;
      for (const config of settings) {
        const run = spawnSync('rustfmt', ['--edition', '2021', '--emit', 'stdout', ...(config === '' ? [] : ['--config', config])], { input: String(body), encoding: 'utf8', cwd: where, env: { ...process.env, RUSTUP_TOOLCHAIN: channel } });
        assert.equal(run.status, 0, `rustfmt of ${path}: ${run.stderr}`);
        assert.equal(run.stdout, String(body), `${path} is not in the form that rustfmt gives it with ${config === '' ? 'its defaults' : config}`);
        checked += 1;
      }
    }
    assert.ok(checked >= 8, `${checked} files were formatted`);
  } finally {
    rmSync(where, { recursive: true, force: true });
  }
});

test('every case that does not raise runs and compares its result in every target (GN-13e)', () => {
  const { contract, caseFiles } = load();
  const cases = caseFiles.get('contracts/cases.json') as any;
  contract.cases[0].result = 'words';
  contract.units[0].members[0].returns.list.tuple = ['text', 'text'];
  cases.split[1].words = [['a', '0'], ['b', '2']];
  cases.split.push({ id: 'unread', text: 'c', options: { max_words: null, mode: 'plain' } });
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: ['php', 'python', 'node', 'go', 'wasm'] });
  const compared = "ordered(pkg.splitWords('a b', { maxWords: null, mode: 'latin' })), ordered([['a', '0'], ['b', '2']])";
  assert.ok(text(out, 'packages/ts/generated/tests/generated.test.mjs').includes(`assert.deepStrictEqual(${compared})`));
  assert.ok(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs').includes(`assert.deepStrictEqual(${compared})`));
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /expected = \[\("a", "0",\), \("b", "2",\)\]\n\s+self\.assertTrue\(_same\(result, expected\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /self::assertSame\(self::same\(\[\["a", "0"\], \["b", "2"\]\]\), self::same\(\\Polyspec\\Sample\\splitWords\("a b"/);
  const go = text(out, 'packages/go/zz_generated_test.go');
  assert.match(go, /func TestGN13eSplitWordsTwo\(t \*testing\.T\) \{\n\tvalue0, err := SplitWords\("a b"/);
  assert.match(go, /!reflect\.DeepEqual\(value0, want\)/);
  // A case without the result key runs the call alone, which must not raise.
  assert.match(go, /func TestGN13eSplitWordsUnread\(t \*testing\.T\) \{\n\t_, err := SplitWords\("c"/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /test\('GN-13e: splitWords unread', \(\) => \{\n\s+pkg\.splitWords\('c'/);
});

test('a case gives its receiver as an instance value, made by earlier calls in every target (GN-13f)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const out = generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) });
  // A receiver that a method of another class makes and a call prepares, each instance a local of the test.
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /test\('B-4: Gate\.enter a_closed_gate_lets_nothing_pass', \(\) => \{\n  const made0 = new pkg\.Tag\('a'\);\n  const made1 = made0\.gate\(\);\n  made1\.close\(\);\n  assert\.throws\(\(\) => made1\.enter\(\)/);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /const made1 = made0\.gates\(2\);\n  const made2 = made1\[1\];\n  assert\.deepStrictEqual\(ordered\(made2\.enter\(\)\), ordered\('b\. passes'\)\);/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /made0 = pkg\.Tag\("a"\)\n        made1 = made0\.gate\(\)\n        made1\.close\(\)\n        with self\.assertRaises/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /\$made0 = new \\Polyspec\\Classes\\Tag\("a"\);\n        \$made1 = \$made0->gate\(\);\n        \$made1->close\(\);/);
  // A call of then that the case expects to fail requires that kind, and the instance stays for the next step.
  const cases = read('contracts/cases.json');
  cases.gate_enter[2].receiver.then.push({ call: 'gate.close', raises: { kind: 'closed' } });
  const failing = generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', cases]]), targets: ['php', 'python', 'node', 'go', 'wasm'] });
  assert.match(text(failing, 'packages/go/zz_generated_test.go'), /\tfailure\d+ := made\d+\.Close\(\)\n\tif kinded, ok := failure\d+\.\(interface\{ Kind\(\) string \}\); !ok \|\| kinded\.Kind\(\) != "closed" \{\n\t\tt\.Fatalf\("GN-13f: %#v is not of kind closed", failure\d+\)/);
  assert.match(text(failing, 'packages/ts/generated/tests/generated.test.mjs'), /  made1\.close\(\);\n  assert\.equal\(outcome\(\(\) => made1\.close\(\)\)\.kind, 'closed', 'G-5: then 1 fails with closed'\);\n/);
  assert.match(text(failing, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /\nfunction outcome\(call\)[^]*assert\.equal\(outcome\(\(\) => made1\.close\(\)\)\.kind, 'closed', 'G-5: then 1 fails with closed'\);\n/);
  assert.match(text(failing, 'packages/python/generated/tests/test_generated.py'), /\ndef _outcome\(call\):[^]*made1\.close\(\)\n        assert _outcome\(lambda: made1\.close\(\)\)\[::2\] == \("error", "closed"\), "G-5: then 1 fails with closed"\n/);
  assert.match(text(failing, 'packages/php-ext/generated/tests/GeneratedTest.php'), /\$made1->close\(\);\n        self::assertStringContainsString\("'kind' => 'closed'", self::outcome\(fn \(\) => \$made1->close\(\)\), "G-5: then 1 fails with closed"\);\n[^]*private static function outcome/);
  // GN-13f: an instance value is the value of a class at any place of a case, an item of a list included.
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /assert\.deepStrictEqual\(ordered\(pkg\.join\(\[new pkg\.Tag\('a'\), \(\(\) => \{ const made0 = new pkg\.Tag\('c'\); const made1 = made0\.repeat\(1\); const made2 = made1\[0\]; return made2; \}\)\(\)\]\)\), ordered\('a,c'\)\);/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /pkg\.join\(\[pkg\.Tag\("a"\), _made_\d+\(\)\]\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /\\Polyspec\\Classes\\join\(\[new \\Polyspec\\Classes\\Tag\("a"\), \(function \(\) \{ /);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /pkg\.join\(\[new pkg\.Tag\('a'\), \(\(\) => \{ const made0/);
  // The tests that need any receiver call a function that makes it.
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /G-7: Gate\.enter counts and names its arguments', \(\) => \{\n  assert\.throws\(\(\) => \(\(\) => \{ const made0 = new pkg\.Tag\('a'\); const made1 = made0\.gate\(\); return made1; \}\)\(\)\.enter\(null\)/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /\ndef _made_\d+\(\):  # noqa: ANN202\n    made0 = pkg\.Tag\("a"\)\n    made1 = made0\.gate\(\)\n    return made1\n/);
});

test('a call of then arms the faults of its own call, or calls the receiver of the value, in every target (GN-13f)', () => {
  const read = (repo: string, path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${repo}/${path}`, import.meta.url), 'utf8'));
  // A counter whose draw fails with the faults of that call only, then the total of the counter.
  const sample = read('sample', 'contracts/cases.json');
  const faults = [{ point: 'sample.draw', kind: 'broken' }];
  sample.counter_total.push({ id: 'the_total_after_a_broken_draw', receiver: { new: 'counter.new', args: { start: 2 }, then: [{ call: 'counter.draw', args: { other: { new: 'counter.new', args: { start: 1 } } }, faults, raises: { kind: 'internal' } }] }, result: 2 });
  const armed = generate({ contract: read('sample', 'packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map([['contracts/cases.json', sample]]), targets: ['php', 'python', 'node', 'go', 'wasm'] });
  const shown = JSON.stringify(faults);
  const node = text(armed, 'packages/ts/generated/tests/generated.test.mjs');
  assert.ok(node.includes(`  const made2 = addon().__armFaults('counter.draw', '${shown}');\n  assert.equal(outcome(() => made0.draw(made1)).kind, 'internal'`), node);
  assert.match(node, /\n  assert\.deepEqual\(addon\(\)\.__faultLeft\(made2\), \[\], 'G-5: the faults of then 0 fire'\);\n/);
  const python = text(armed, 'packages/python/generated/tests/test_generated.py');
  assert.ok(python.includes(`        made2 = _native._arm_faults("counter.draw", ${JSON.stringify(shown)})\n        assert _outcome(lambda: made0.draw(made1))`), python);
  assert.ok(python.includes('        assert _native._fault_left(made2) == [], "G-5: the faults of then 0 fire"\n'), python);
  const php = text(armed, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.ok(php.includes(`        $made2 = \\Polyspec\\Sample\\Internal\\armFaults("counter.draw", ${JSON.stringify(shown)});\n`), php);
  assert.ok(php.includes('        self::assertSame([], \\Polyspec\\Sample\\Internal\\faultLeft($made2), "G-5: the faults of then 0 fire");\n'), php);
  const wasm = text(armed, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  assert.match(wasm, /\nlet stepGlue;\nbefore\(async \(\) => \{\n  stepGlue = await glueModule\(\);\n\}\);\n/);
  assert.ok(wasm.includes(`  const made2 = stepGlue.__armFaults('counter.draw', '${shown}');\n`), wasm);
  // Go puts the test whose receiver arms faults with the cases that arm faults, its goroutine locked to its thread.
  const goFault = text(armed, 'packages/go/zz_generated_fault_test.go');
  assert.match(goFault, /func TestGN13eCounterTotalTheTotalAfterABrokenDraw\(t \*testing\.T\) \{\n\truntime\.LockOSThread\(\)\n\tdefer runtime\.UnlockOSThread\(\)\n[^]*binding\.ArmFaults\("counter\.draw"/);
  assert.doesNotMatch(text(armed, 'packages/go/zz_generated_test.go'), /TheTotalAfterABrokenDraw/);
  // A call of then on the receiver of the value runs after the pick, on the instance that the value was picked from.
  const classes = read('classes', 'contracts/cases.json');
  classes.gate_enter[1].receiver.then = [{ call: 'tag.name', on: 'receiver' }];
  const on = generate({ contract: read('classes', 'packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', classes]]), targets: ['php', 'python', 'node', 'wasm'] });
  assert.match(text(on, 'packages/ts/generated/tests/generated.test.mjs'), /const made1 = made0\.gates\(2\);\n  const made2 = made1\[1\];\n  made0\.name;\n/);
  assert.match(text(on, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /const made2 = made1\[1\];\n  made0\.name;\n/);
  assert.match(text(on, 'packages/python/generated/tests/test_generated.py'), /made2 = made1\[1\]\n        made0\.name\n/);
  assert.match(text(on, 'packages/php-ext/generated/tests/GeneratedTest.php'), /\$made2 = \$made1\[1\];\n        \$made0->name\(\);\n/);
});

test('an error unit in a module is the class of the namespace or the module of its unit, and every entry exports it (GN-7a, GN-10, GN-11)', () => {
  const out = shaped((c) => { unitOf(c, 'utf8_error').module = 'errors'; });
  // PHP: the class is in the namespace of its module, and the extension registers it by that name.
  assert.match(text(out, 'packages/php-ext/generated/polyspec_shapes.stub.php'), /namespace Polyspec\\Shapes\\Errors \{\n    \/\*\* The errors of the unit utf8_error \(E-2\)\. \*\/\n    final class Utf8Error extends \\Polyspec\\Shapes\\ParseError/);
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /ClassBuilder::new\("Polyspec\\\\Shapes\\\\Errors\\\\Utf8Error"\)/);
  // Python: <root>.errors gives the class of <root>._errors, and <root> re-exports it.
  const pkg = 'packages/python/generated/python/polyspec/shapes';
  assert.match(text(out, `${pkg}/errors.py`), /from \._errors import Utf8Error as Utf8Error\n\n__all__ = \["Utf8Error"\]/);
  assert.match(text(out, `${pkg}/__init__.py`), /from \.errors import \*  # noqa: F403/);
  // Node and WASM: the entries export the class by its name.
  assert.match(text(out, 'packages/ts/generated/index.cjs'), /module\.exports = \{[^}]*\bUtf8Error\b/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.mjs'), /export class Utf8Error extends ParseError/);
});

test('a callback inside a list, an optional or a record parameter enters as a box of the core trait, passed by value (U-3, GN-6aa)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['php', 'python', 'node', 'wasm'] });
  for (const [path, life] of [
    ['packages/php-ext/generated/lib.rs', "'static"],
    ['packages/python/generated/lib.rs', "'static"],
    ['packages/ts/generated/lib.rs', "'env"],
    ['packages/ts/wasm/generated/lib.rs', "'static"],
  ] as const) {
    const lib = text(out, path);
    const boxed = `Box<dyn polyspec_sample::Lookup + ${life}>`;
    // The core takes the list, the optional and the record that hold a callback by value, each callback boxed.
    assert.ok(lib.includes(`let lookups: Vec<${boxed}> = `), `${path}: the list`);
    assert.match(lib, /polyspec_sample::first\(lookups, &key\)/, path);
    assert.ok(lib.includes(`let lookup: Option<${boxed}> = `), `${path}: the optional`);
    assert.match(lib, /polyspec_sample::maybe\(lookup, &key\)/, path);
    assert.ok(lib.includes(`polyspec_sample::Search<${life}> = polyspec_sample::Search { lookup, key };`), `${path}: the record`);
    assert.match(lib, /polyspec_sample::seek\(search\)/, path);
  }
  // A test gives a callback value inside another value as the object of a fixture.
  const py = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.ok(py.includes(`pkg.first([_fixture(("find",), [("find", ("a",), None, False, None)])[0], _fixture(("find",), [("find", ("a",), "b", False, None)])[0]], "a")`), 'python list');
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.ok(node.includes(`fixture(['find'], [['find', ['a'], null, false, null]]).object`), 'node');
});

test('a member with core.failure converts the error of its core as the failure of language code (E-1c, GN-7)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/functions/${path}`, import.meta.url), 'utf8'));
  const out = generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_functions', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['python'] });
  const lib = text(out, 'packages/python/generated/lib.rs');
  // registry.call takes no function, but calls the one that the registry keeps.
  const call = lib.slice(lib.indexOf('fn member_call<'));
  assert.match(call, /polyspec_functions::Registry::call\(receiver, &name, &value\) \{\n\s+Ok\(value\) => value,\n\s+Err\(error\) => return Err\(failure_error\(py, error\)\),/);
});

test('Go takes a function type as a boxed Fn over a kept func, which is called by the handle of its Native and whose error is kept by no call (T-2, GN-6z, GN-6u)', () => {
  // The contract of tests/e2e/functions: apply calls the function during the call, registry.register keeps it and
  // registry.call calls the kept function in a later call. Before, generation for go was refused: "a function type is
  // not generated for go (GN-6z)".
  const out = e2eOwn('functions', ['go']);
  const lib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  // The core takes the function by value, in the form that it may keep: 'static, Send and Sync.
  assert.match(lib, /let convert: Function[0-9a-f]{8} = kept_function_in\(&mut input, "convert"\)\.map\(\|native\| -> Function[0-9a-f]{8} \{/);
  assert.match(lib, /polyspec_functions::apply\(convert, /);
  // A nil func is no function; a func is kept from the moment the C ABI reads it, as a Native of its cgo.Handle.
  assert.match(lib, /\nfn kept_function_in\(input: &mut &\[u8\], subject: &str\) -> Result<Native, Fail> \{\n    if !read_tag\(input\)\? \{\n        return Err\(binding_error\(BindingError::InvalidArgumentType \{ subject: subject\.to_owned\(\), expected: String::from\("a function"\) \}\)\);\n    \}/);
  assert.match(lib, /let handle = unsafe \{ polyspec_functions__go_keep\(call, function\) \};/);
  assert.match(lib, /\n    Ok\(go_native\(handle\)\)\n\}/);
  assert.match(lib, /\nimpl Drop for GoNative \{\n    fn drop\(&mut self\) \{\n[^}]*polyspec_functions__go_release\(self\.handle\)/);
  // The call names the handle of the Native, not a call: the core calls a kept function in a later call.
  assert.match(lib, /\nfn kept_called\(native: &Native, args: &\[u8\]\) -> Result<Vec<u8>, Raised> \{/);
  assert.match(lib, /polyspec_functions__go_function\(function\.handle, args\.as_ptr\(\), args\.len\(\), &mut buffer\)/);
  assert.match(lib, /let bytes = kept_called\(&native, &args\)\?;/);
  // What the func returned as its error is the Raised of a key of the table of package binding, which the member takes
  // or the drop of the Raised releases.
  assert.match(lib, /\n    Kept \{ key: u64 \},\n/);
  assert.match(lib, /Ok\(key\) => Err\(thrown\(Thrown::Kept \{ key \}\)\)/);
  assert.match(lib, /Some\(Thrown::Kept \{ key \}\) => Fail \{ raised: Some\(\(0, key\)\), /);
  assert.match(lib, /if let Some\(Thrown::Kept \{ key \}\) = taken \{\n[^}]*polyspec_functions__go_release_raised\(key\)/);
  // No trampoline of a call: the contract has no callback unit and no function of a machine.
  assert.doesNotMatch(lib, /__go_callback/);
  assert.doesNotMatch(lib, /Thrown::Go/);
  // GN-4c: the helper states its direction last and no helper starts with the prefix of a family.
  const names = functionNames(lib);
  assert.deepEqual([...names].filter(([, count]) => count > 1), []);
  assert.deepEqual([...names.keys()].filter((name) => /^(?:in|out)_/.test(name) && !['in_registry', 'out_registry'].includes(name)), []);
  assert.deepEqual([...names.keys()].filter((name) => name.startsWith('function_')), []);
  assert.equal(names.get('kept_function_in'), 1);
  for (const symbol of ['polyspec_functions_apply', 'polyspec_functions_registry__new', 'polyspec_functions_registry__register', 'polyspec_functions_registry__call']) assert.equal(names.get(symbol), 1, symbol);
  // thrown-count-test counts what THROWN holds, the Raised of a kept func as any other.
  assert.match(lib, /#\[cfg\(feature = "thrown-count-test"\)\]\n#\[no_mangle\]\npub unsafe extern "C" fn polyspec_functions__thrown_count\(/);
  assert.doesNotMatch(lib, /thread-test|WrongThread/);

  // The Go package: a func that returns its result and an error; a nil func is encoded as absent.
  const go = text(out, 'packages/go/zz_generated_functions.go');
  assert.match(go, /\nfunc Apply\(convert func\(string, \[\]int64\) \(string, error\), value_ string\) \(string, error\) \{\n\tvar zero0 string\n\tcall := binding\.NewCall\(\)\n\tdefer call\.Close\(\)\n/);
  assert.match(go, /\tif convert == nil \{\n\t\tenc\.Tag\(false\)\n\t\} else \{\n\t\tenc\.Tag\(true\)\n\t\tcall\.Keep\(enc, func\(dec \*binding\.Reader, enc \*binding\.Writer\) error \{\n\t\t\tvar arg0 string\n\t\t\targ0 = dec\.Text\(\)\n/);
  assert.match(go, /\t\t\treturned, err := convert\(arg0, arg1\)\n\t\t\tif err != nil \{\n\t\t\t\treturn err\n\t\t\t\}\n\t\t\tenc\.Text\(returned\)\n\t\t\treturn nil\n\t\t\}\)\n\t\}\n/);
  assert.match(go, /\nfunc \(this \*Registry\) Register\(name string, convert func\(string, \[\]int64\) \(string, error\)\) error \{/);
  // registry.call takes no func, so it has no call: the error of the kept func comes from the table of package binding.
  assert.match(go, /\nfunc \(this \*Registry\) Call\(name string, value_ string\) \(string, error\) \{\n\tvar zero0 string\n\tenc := binding\.NewWriter\(\)\n/);
  assert.match(go, /binding\.Registry_Call\(enc\.Done\(\)\)/);

  // Package binding: the func of a call, its cgo.Handle, its run with the panic recovered, and the table of the errors.
  const binding = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
  assert.match(binding, /\ntype Kept func\(dec \*Reader, enc \*Writer\) error\n/);
  assert.match(binding, /\nfunc \(c \*Call\) Keep\(enc \*Writer, function Kept\) \{\n\tc\.kept = append\(c\.kept, function\)\n\tenc\.Uint\(uint64\(c\.handle\)\)\n\tenc\.Uint\(uint64\(len\(c\.kept\)\)\)\n\}/);
  for (const name of ['go_keep', 'go_function', 'go_release', 'go_release_raised']) {
    assert.match(binding, new RegExp(`\\n//export polyspec_functions__${name}\\nfunc polyspec_functions__${name}\\(`), name);
    assert.match(lib, new RegExp(`\\n    fn polyspec_functions__${name}\\(`), name);
  }
  assert.doesNotMatch(binding, /__go_callback|__go_host|__go_native\b/);
  assert.match(binding, /\tdefer func\(\) \{\n\t\tif value := recover\(\); value != nil \{\n\t\t\tstatus, out = keepRaised\(&panicked\{value: value\}\)\n\t\t\}\n\t\}\(\)\n/);
  assert.match(binding, /\nfunc raisedError\(call, index uint64\) error \{\n\tif call == 0 \{\n\t\terr := takeRaised\(index\)\n/);
  assert.match(binding, /\t\tif p, ok := err\.\(\*panicked\); ok \{\n\t\t\tpanic\(p\.value\)\n\t\t\}\n\t\treturn err\n\t\}\n/);
  assert.match(binding, /\nvar raisedErrors = raisedTable\{errors: map\[uint64\]error\{\}\}\n/);
  const functions = [...binding.matchAll(/^func (\w+)\(/gm)].map((m) => m[1] ?? '');
  assert.deepEqual(functions.filter((name, i) => functions.indexOf(name) !== i), []);
  // Every import of package binding is used, and it imports what it names.
  for (const [name, use] of [['sync', /\bsync\./], ['runtime/cgo', /\bcgo\./], ['unsafe', /\bunsafe\./], ['fmt', /\bfmt\./], ['runtime', /\bruntime\.(?!cgo)/]] as const) {
    assert.equal(new RegExp(`\\n\\t"${name}"\\n`).test(binding), use.test(binding.replace(/\n\t"[a-z/]+"\n/g, '\n')), name);
  }

  // The generated test: the cases with a func of their rows, a nil func, an error and a panic of the func that come
  // back unchanged, in the call that receives the func and in the later call that runs the kept one.
  const tests = text(out, 'packages/go/zz_generated_test.go');
  assert.match(tests, /\tfunction0 := &fixture\{rows: \[\]fixtureRow\{\{member: "call", args: \[\]any\{"ab c", \[\]int64\{2, 1\}\}, result: "AB C", once: false\}\}\}\n\tcall1 := func\(arg0 string, arg1 \[\]int64\) \(string, error\) \{\n\t\tresult, err := function0\.answer\("call", arg0, arg1\)\n\t\tvalue, _ := result\.\(string\)\n\t\treturn value, err\n\t\}\n\tvalue0, err := Apply\(call1, "ab c"\)\n/);
  assert.match(tests, /\tif len\(function0\.unexpected\) != 0 \{\n/);
  assert.match(tests, /\ntype fixture struct \{\n/);
  assert.match(tests, /\nfunc TestGN6zApplyRefusesANilConvert\(t \*testing\.T\) \{\n\t_, err := Apply\(nil, "a"\)\n\tif failure, ok := err\.\(\*liberrors\.FunctionsTypeError\); !ok \|\| failure\.Kind\(\) != "invalid_argument_type" \{\n/);
  assert.match(tests, /\nfunc TestGN6zRegistryRegisterRefusesANilConvert\(/);
  // The error and the panic of the func in the call that runs it: apply, by the arguments of its case with a row.
  assert.match(tests, /\nfunc TestGN6zApplyReturnsTheErrorOfConvert\(t \*testing\.T\) \{\n\traised := errors\.New\("[^"]+"\)\n\tcall0 := func\(_ string, _ \[\]int64\) \(string, error\) \{\n\t\tvar zero string\n\t\treturn zero, raised\n\t\}\n\t_, err := Apply\(call0, "ab c"\)\n\tif err != raised \{\n/);
  assert.match(tests, /\nfunc TestGN6zApplyPanicsWithThePanicOfConvert\(t \*testing\.T\) \{\n[^}]*\t\tpanic\(raised\)\n\t\}\n\tdefer func\(\) \{\n\t\tif value := recover\(\); value != any\(raised\) \{\n/);
  // register keeps the func and does not call it, so no case of it has a row and it has no such test.
  assert.doesNotMatch(tests, /TestGN6zRegistryRegister(?:ReturnsTheErrorOf|PanicsWith)/);
  // The later call that runs the kept func returns its error and panics with its panic.
  assert.match(tests, /\nfunc TestGN6zRegistryCallTheKeptFunctionConvertsTheValueReturnsTheErrorOfTheKeptFunction\(t \*testing\.T\) \{\n[^}]*\}\n[^}]*\t\treturn zero, raised\n\t\}\n\tfailure3 := made0\.Register\("up", call2\)\n[^}]*\}\n\t_, err := made0\.Call\("up", "ab c"\)\n\tif err != raised \{\n/);
  assert.match(tests, /\nfunc TestGN6zRegistryCallTheKeptFunctionConvertsTheValuePanicsWithThePanicOfTheKeptFunction\(/);
  // No func of the test has the form of the function of a machine (GN-6ae).
  assert.doesNotMatch(tests, /GN-6ae|invalid_callback|_ \[\]int64\) \(any, error\)/);
  // GN-6ae: the count of what was thrown is read after each case of a member that takes a function.
  const counted = text(out, 'packages/go/zz_generated_thrown_count_test.go');
  for (const name of ['TestGN13eApplyTheFunctionConvertsTheValueKeepsNothingThrown', 'TestGN6zRegistryCallTheKeptFunctionConvertsTheValueReturnsTheErrorOfTheKeptFunctionKeepsNothingThrown']) {
    assert.match(counted, new RegExp(`\\nfunc ${name}\\(t \\*testing\\.T\\) \\{\\n[^]*?binding\\.ThrownCount\\(\\)`), name);
  }
});

test('Go refuses by name a function type whose result is read through a call (GN-6z, G-4)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/sample/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  unitOf(contract, 'sample').members.push({ id: 'sample.keep', name: ['keep'], kind: 'function', visibility: 'public', parameters: [{ name: ['make'], type: { function: { parameters: ['text'], returns: { unit: 'data' }, async_allowed: false } }, required: true }], returns: 'none', raises: [], wait: 'none', core: 'polyspec_sample::keep' });
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['go'] }), /sample\.keep[^\n]*a function type whose result holds a value alias, a callback or a function is not generated for Go \(GN-6z\)/);
});

test('a contract with a function type and no callback unit keeps what its function threw (U-3, GN-6z)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/functions/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  assert.deepEqual(contract.units.filter((u: any) => u.origin === 'callback'), [], 'the functions sample has no callback unit');
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_functions', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['python', 'node', 'php', 'wasm'] });
  // The call of a function gives what it threw to thrown, which only a contract that calls language code has.
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /\.map_err\(\|error\| thrown\(py, error\)\)/);
  assert.match(python, /\nfn thrown<E>\(py: Python<'_>, error: PyErr\) -> binding_core::Failure<E>/);
  for (const path of ['packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, path);
    assert.match(lib, /call\(\)\.map_err\(thrown\)/, path);
    assert.match(lib, path.includes('/wasm/') ? /\nfn thrown\(error: Thrown\) -> binding_core::Failure</ : /\nfn thrown<E>\(error: Thrown\) -> binding_core::Failure<E>/, path);
  }
  // PHP: the exception of the Closure is the variant Php, which failure_error throws again.
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /return Err\(Thrown::Php\(exception\)\);/);
  assert.match(php, /enum Thrown \{\n    Php\(ZBox<ZendObject>\),\n    Binding\(Fail\),\n\}/);
  assert.match(php, /Some\(Thrown::Php\(exception\)\) => match exception\.into_zval\(false\) \{/);
});

test('a class parameter gives the core the borrow that its core names, which every crate asserts (GN-6h, I-2)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  const param = (id: string): any => contract.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === id).parameters[0];
  param('classes.shout').core = 'value';
  param('tag.same').core = '&mut';
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['php', 'python', 'node', 'go', 'wasm'] });
  for (const crate of ['packages/go/internal/ffi/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', ...LIBS]) {
    const lib = text(out, crate);
    // value: a clone of the value under the read guard; &mut: the write borrow of the guard.
    assert.ok(lib.includes('let result = polyspec_classes::shout((*tag).clone());'), `${crate} gives the core a clone`);
    assert.match(lib, /let other = &mut \*other;\n\s+let result = polyspec_classes::Tag::same\(receiver, CoreForm::core_form\(other\)\);/, `${crate} gives the core the write borrow`);
    assert.ok(lib.includes('const _: () = {\n    let _: fn(polyspec_classes::Tag) -> _ = polyspec_classes::shout;\n};'), `${crate} asserts the borrow of shout`);
    assert.ok(lib.includes('const _: () = {\n    let _: fn(&polyspec_classes::Tag, &mut polyspec_classes::Tag) -> _ = polyspec_classes::Tag::same;\n};'), `${crate} asserts the borrows of same`);
  }
  // G-4: a class parameter that names no borrow is refused by name, as the contract check reports it (CK-67).
  delete param('tag.same').core;
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['python'] }), /tag\.same\.other: a class parameter names the borrow that the core takes in core \(GN-6h\)/);
  param('tag.same').core = '&mut';
  // G-4: the borrow of an optional of a class is refused by name.
  param('classes.shout').type = { optional: { unit: 'tag' } };
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['python'] }), /classes\.shout\.tag: the borrow of an optional class is not generated yet/);
});

test('a callback member gives the core the kind of an error unit that it recognizes, and passes any other exception (U-3, GN-6d)', () => {
  const { contract, caseFiles, foreign } = consumerSample();
  contract.errors.recognized = 'polyspec_consumer::Error::recognized';
  const get = contract.units.find((u: any) => u.id === 'holder').members.find((m: any) => m.id === 'holder.get');
  get.errors = { recognize: [{ unit: 'absent_error' }], reason: 'U-3' };
  const targets = ['php', 'python', 'node', 'go', 'wasm'] as Inputs['targets'] & string[];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets });
  for (const crate of [...LIBS, 'packages/go/internal/ffi/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, crate);
    // The kind of a row whose class is the unit makes the core error with the message of the exception.
    assert.ok(lib.includes('"absent" => Some(polyspec_consumer::Error::recognized(polyspec_consumer::Error::Absent, &message)),'), `${crate} makes the core error of the recognized kind`);
    assert.match(lib, /fn recognized_holder_get\(/, crate);
    // A member that recognizes nothing keeps the exception as it is.
    assert.equal(lib.match(/\brecognized_holder_get\b/g)?.length, 2, `${crate} calls the recognition of holder.get alone`);
    assert.doesNotMatch(lib, /recognized_holder_set/, crate);
  }
  // Go reads the error that the method returned with errors.As, and the C ABI takes its kind and its message.
  assert.match(text(out, 'packages/go/internal/binding/zz_generated_binding.go'), /func RecognizeAbsentError\(err error\) error \{\n\tvar unit \*AbsentError\n\tif errors\.As\(err, &unit\) \{/);
  assert.match(text(out, 'packages/go/zz_generated_consumer.go'), /return binding\.RecognizeAbsentError\(err\)/);
  // G-4: an error unit of another library is refused by name.
  get.errors.recognize = [{ unit: 'data', library: 'sample' }];
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['python'] }), /holder\.get: a recognized error unit of another library is not generated yet/);
});

test('a raise row of a callback fixture throws an instance of its error unit with its kind in every target (GN-13, U-3)', () => {
  const { contract, caseFiles, foreign } = consumerSample();
  contract.errors.recognized = 'polyspec_consumer::Error::recognized';
  contract.units.find((u: any) => u.id === 'holder').members.find((m: any) => m.id === 'holder.get').errors = { recognize: [{ unit: 'absent_error' }], reason: 'U-3' };
  const cases = caseFiles.get('contracts/cases.json') as any;
  cases.fetch.push({
    id: 'a_holder_that_raises_absent_is_absent',
    holder: { callback: { 'holder.get': [{ args: { key: 'b' }, raise: { error: 'absent_error', kind: 'absent' } }] } },
    key: 'b',
    raises: { kind: 'absent', status: null, category: 'value' },
  });
  const targets = ['php', 'python', 'node', 'go', 'wasm'] as Inputs['targets'] & string[];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets });
  assert.match(text(out, pythonTests), /pkg\.AbsentError\("G-5: absent", "absent"\)/);
  assert.match(text(out, nodeTests), /new pkg\.AbsentError\('G-5: absent', 'absent'\)/);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /new pkg\.AbsentError\('G-5: absent', 'absent'\)/);
  // PHP code makes it by the public constructor of the category class, which takes the kind (GN-10).
  assert.match(text(out, phpTests), /new \\Polyspec\\Consumer\\AbsentError\("G-5: absent", "absent"\)/);
  assert.doesNotMatch(text(out, phpTests), /bindTo/);
  const stub = text(out, 'packages/php-ext/generated/polyspec_consumer.stub.php');
  assert.match(stub, /class ConsumerValueError extends \\InvalidArgumentException\n    \{\n        public function __construct\(string \$message, string \$kind, \?int \$status = null, \?int \$errno = null\) \{\}\n/);
  const ext = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(ext, /\.method\(\s*FunctionBuilder::new\("__construct", error_construct\)\s*\.arg\(Arg::new\("message", DataType::String\)\)\s*\.arg\(Arg::new\("kind", DataType::String\)\)\s*\.not_required\(\)\s*\.arg\(Arg::new\("status", DataType::Long\)\.allow_null\(\)\.default\("null"\)\)\s*\.arg\(Arg::new\("errno", DataType::Long\)\.allow_null\(\)\.default\("null"\)\),\s*MethodFlags::Public,\s*\)/);
  assert.match(ext, /extern fn error_construct\(ex: &mut ExecuteData, _retval: &mut Zval\)/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /binding\.RaisedAbsentError\("absent", "G-5: absent"\)/);
  assert.match(text(out, 'packages/go/internal/binding/zz_generated_binding.go'), /func RaisedAbsentError\(kind, message string\) \*AbsentError \{/);
});

test('a receiver self takes the value of its object, and a class with cleanup warns when it is destroyed without it (GN-6o, GN-6p, B-10)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const classes = (change: (contract: any) => void = () => undefined, targets?: string[]): Map<string, string | Buffer> => {
    const contract = read('packages/rust/interface.json');
    change(contract);
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), ...(targets === undefined ? {} : { targets: targets as Inputs['targets'] & string[] }) });
  };
  const out = classes();
  const warning = 'Lease was destroyed without release(), so its destructor released it (B-10)';
  for (const [lang, path] of [['php', 'packages/php-ext/generated/lib.rs'], ['python', 'packages/python/generated/lib.rs'], ['node', 'packages/ts/generated/lib.rs']] as const) {
    const lib = text(out, path);
    // GN-6o: the place of the receiver self takes the value out of the lock, and the core consumes it.
    assert.match(lib, /\.take\("Lease"\)/, lang);
    assert.match(lib, /polyspec_classes::Lease::release\(receiver\)/, lang);
    // GN-6p: the core type of a unit with cleanup implements Cleanup, and that of another class unit does not.
    assert.match(lib, /cleanup::<polyspec_classes::Lease>/, lang);
    assert.match(lib, /<polyspec_classes::Gate as NotCleanup<_>>::not_cleanup/, lang);
    assert.doesNotMatch(lib, /<polyspec_classes::Lease as NotCleanup<_>>/, lang);
    assert.ok(lib.includes(warning), `${lang} warns in its destructor`);
  }
  assert.match(text(out, 'packages/python/generated/lib.rs'), /PyResourceWarning/);
  assert.match(text(out, 'packages/ts/generated/lib.rs'), /emitWarning/);
  // GN-6p: the Python destructor keeps an exception that is being raised and sets it again after the warning.
  assert.match(text(out, 'packages/python/generated/lib.rs'), /let raising = PyErr::take\(py\);\n {16}if let Err\(error\) = PyErr::warn\([^\n]*\n {20}error\.write_unraisable\(py, None\);\n {16}\}\n {16}if let Some\(raising\) = raising \{\n {20}raising\.restore\(py\);\n {16}\}/);
  // GN-6p: PHP puts the name of the running function before the message of a warning.
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /self::assertCount\(1, \$warnings\);\n {8}self::assertSame\(E_WARNING, \$warnings\[0\]\[0\]\);\n {8}self::assertStringEndsWith\("Lease was destroyed without release\(\), so its destructor released it \(B-10\)", \$warnings\[0\]\[1\]\);/);
  // B-5c: the Go poison entry point reaches each of its classes through a helper that the C ABI defines.
  const goOut = classes(() => undefined, ['go']);
  const goLib = text(goOut, 'packages/go/internal/ffi/generated/lib.rs');
  for (const [, plain] of goLib.matchAll(/\bheld_([a-z_0-9]+)\(/g)) assert.ok(goLib.includes(`fn held_${plain}(`), `Go defines held_${plain}`);
  // Go: the receiver self takes the value, the crate asserts Cleanup, and the release of the handle answers whether the
  // value was still held, for which the function of runtime.AddCleanup warns through the standard logger.
  assert.match(goLib, /\.take\("Lease"\)/);
  assert.match(goLib, /polyspec_classes::Lease::release\(receiver\)/);
  assert.match(goLib, /cleanup::<polyspec_classes::Lease>/);
  assert.match(goLib, /<polyspec_classes::Gate as NotCleanup<_>>::not_cleanup/);
  assert.match(goLib, /pub extern "C" fn polyspec_classes__release_lease\(handle: u64\) -> i32 \{\n {4}let released = lock\(&TABLE_LEASE\)\.values\.remove\(&handle\);\n {4}i32::from\(released\.is_some_and\(\|held\| !held\.taken\(\)\)\)\n\}/);
  assert.match(goLib, /pub extern "C" fn polyspec_classes__release_gate\(handle: u64\) \{/);
  const goBinding = text(goOut, 'packages/go/internal/binding/zz_generated_binding.go');
  assert.match(goBinding, /int32_t polyspec_classes__release_lease\(uint64_t handle\);/);
  assert.match(goBinding, /void polyspec_classes__release_gate\(uint64_t handle\);/);
  assert.ok(goBinding.includes(`func ReleaseLease(handle uint64) {\n\tif C.polyspec_classes__release_lease(C.uint64_t(handle)) != 0 {\n\t\tlog.Print("Lease was destroyed without Release(), so its destructor released it (B-10)")\n\t}\n}`), 'Go warns in the function of runtime.AddCleanup');
  assert.match(goBinding, /\n\t"log"\n/);
  assert.match(text(goOut, 'packages/go/zz_generated_classes.go'), /\nfunc \(this \*Lease\) Release\(\) \(string, error\) \{/);
  const goTests = text(goOut, 'packages/go/zz_generated_test.go');
  assert.ok(goTests.includes(`func TestGN6oLeaseReleaseConsumesItsObject(t *testing.T) {`), 'Go tests the consumed object');
  assert.match(goTests, /failure\.Kind\(\) != "consumed"/);
  assert.ok(goTests.includes(`func TestB10LeaseWarnsWithoutRelease(t *testing.T) {`), 'Go tests the warning');
  // B-10: the test fails at once when the collection left the object, and reads the messages of the logger, which never
  // blocks its writer, until the warning of its class; no time orders them.
  assert.match(goTests, /warned := newWarnings\(\)\n\tlog\.SetOutput\(warned\)\n\tdefer log\.SetOutput\(os\.Stderr\)\n\tgone := func\(\) weak\.Pointer\[Lease\] \{\n[\s\S]*?\t\treturn weak\.Make\([^\n]+\)\n\t\}\(\)\n\truntime\.GC\(\)\n\tif gone\.Value\(\) != nil \{\n\t\tt\.Fatalf\("B-10: the collection left the object, so its cleanup does not run"\)\n\t\}\n\twarned\.await\("Lease was destroyed without Release\(\), so its destructor released it \(B-10\)"\)\n\}/);
  assert.ok(goTests.includes('func (w *warnings) Write(message []byte) (int, error) {\n\tw.lock.Lock()\n\tw.messages = append(w.messages, string(message))\n\tw.lock.Unlock()\n\tselect {\n\tcase w.written <- struct{}{}:\n\tdefault:\n\t}\n\treturn len(message), nil\n}'), 'the writer of the Go logger does not block');
  assert.match(goTests, /import \([^)]*\t"testing"\n\t"weak"\n/);
  // WASM: the same in the module, and the callback of the FinalizationRegistry warns as Node does, or with console.warn.
  const wasmOut = classes(() => undefined, ['wasm']);
  const wasmLib = text(wasmOut, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasmLib, /\.take\("Lease"\)/);
  assert.match(wasmLib, /polyspec_classes::Lease::release\(receiver\)/);
  assert.match(wasmLib, /cleanup::<polyspec_classes::Lease>/);
  assert.match(wasmLib, /pub fn free_lease\(this: u32\) -> bool \{\n\s+TABLE_LEASE\.with\(\|table\| table\.borrow_mut\(\)\.remove\(this\)\)\.is_some_and\(\|held\| !held\.taken\(\)\)\n\s*\}/);
  const wasmEntry = text(wasmOut, 'packages/ts/wasm/generated/index.mjs');
  assert.ok(wasmEntry.includes(`released.register(this, [glue.__free_Lease, this.#handle, 'Lease was destroyed without release(), so its destructor released it (B-10)']);`), 'WASM registers the warning of Lease');
  assert.match(wasmEntry, /if \(enter\(ClassesInternalError, \(\) => free\(handle\)\) === true\) warn\(warning\);/);
  assert.match(wasmEntry, /typeof globalThis\.process\?\.emitWarning === 'function' \? globalThis\.process\.emitWarning\(message, 'ResourceWarning'\) : console\.warn\(message\)/);
  const wasmTests = text(wasmOut, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  assert.match(wasmTests, /test\('GN-6o: Lease\.release consumes its object'/);
  assert.match(wasmTests, /error\.kind === 'consumed'/);
  assert.match(wasmTests, /test\('B-10: Lease warns when it is destroyed without release\(\)', async \(\) => \{/);
  // B-10: the objects of earlier tests warn too, so each test awaits the warning with the message of its class.
  for (const [path, tests] of [['node', text(out, 'packages/ts/generated/tests/generated.test.mjs')], ['wasm', wasmTests]] as const) {
    assert.match(tests, /const expected = 'Lease was destroyed without release\(\), so its destructor released it \(B-10\)';\n[\s\S]*?if \(warning\.name !== 'ResourceWarning' \|\| warning\.message !== expected\) return;/, path);
  }
  // G-5: a call after the receiver self is kind consumed, and the destruction without cleanup warns.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /ResourceWarning/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /consumed/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /'warning'/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /consumed/);
  // GN-6p: a cleanup with the receiver &mut self leaves its object: its call marks the lock when it holds the write
  // guard, and the destructor of each target reads the mark where that of a consuming cleanup reads taken.
  for (const [lang, path, cell] of [['php', 'packages/php-ext/generated/lib.rs', 'self\\.inner'], ['python', 'packages/python/generated/lib.rs', 'self\\.inner'], ['node', 'packages/ts/generated/lib.rs', 'self\\.inner'], ['go', 'packages/go/internal/ffi/generated/lib.rs', 'held'], ['wasm', 'packages/ts/wasm/generated/lib.rs', 'held']] as const) {
    const lib = text(out, path);
    assert.match(lib, new RegExp(`let mut receiver = ${cell}\\.write\\("Stall"\\)[^\\n]*\\?;\\n\\s+${cell}\\.clean\\(\\);\\n`), `${lang} marks the stall`);
    assert.match(lib, /polyspec_classes::Stall::shut\(receiver\)/, lang);
    assert.match(lib, /cleanup::<polyspec_classes::Stall>/, lang);
    assert.equal([...lib.matchAll(/\.clean\(\);/g)].length, 1, `${lang} marks in the cleanup call alone`);
    assert.equal([...lib.matchAll(/\.cleaned\(\)/g)].length, 1, `${lang} reads the mark in the destructor of Stall`);
    assert.equal([...lib.matchAll(/\.taken\(\)/g)].length, 1, `${lang} reads taken in the destructor of Lease`);
    assert.ok(lib.includes('Stall was destroyed without') || lang === 'go' || lang === 'wasm', `${lang} warns`);
  }
  assert.ok(goBinding.includes('log.Print("Stall was destroyed without Shut(), so its destructor released it (B-10)")'), 'Go warns for Stall');
  assert.ok(wasmEntry.includes(`'Stall was destroyed without shut(), so its destructor released it (B-10)'`), 'WASM warns for Stall');
  assert.ok(goTests.includes('func TestB10StallWarnsWithoutShut(t *testing.T) {'), 'Go tests the warning of Stall');
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /testB10StallDoesNotWarnAfterShut/);
  // A cleanup that waits marks its object on the calling thread, before its work leaves it.
  const waiting = text(classes((c) => { const shut = member(c, 'stall.shut'); shut.wait = 'blocking_io'; shut.only = { targets: ['node'], reason: 'the test of GN-6p' }; shut.core.path = 'polyspec_classes::Stall::shut'; }, ['node']), 'packages/ts/generated/lib.rs');
  assert.match(waiting, /self\.inner\.clean\(\);\n\s+waiting\(env, move \|\| \{ let receiver = &mut \*receiver; [^\n]*polyspec_classes::Stall::shut\(receiver, binding_core::Io::for_generated_call\(\)\)/);
  // A cleanup that is not a method with the receiver self or &mut self is refused.
  assert.throws(() => classes((c) => { c.units.find((u: any) => u.id === 'lease').cleanup = 'lease.holder'; }, ['node']), /lease: the cleanup lease\.holder is no method with the receiver self or &mut self \(GN-6p\)/);
});

test('a member with wait async_driver runs its future on a tokio runtime in the form of each language (GN-6n)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const classes = (change: (contract: any) => void = () => undefined, targets?: string[]): Map<string, string | Buffer> => {
    const contract = read('packages/rust/interface.json');
    change(contract);
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), ...(targets === undefined ? {} : { targets: targets as Inputs['targets'] & string[] }) });
  };
  const out = classes();
  // The future owns the converted arguments and the guards, and awaits the async fn of the core.
  const future = /async move \{[^\n]*polyspec_classes::fetch\(&name\)\.await/;
  const method = /async move \{[^\n]*polyspec_classes::Gate::enter_later\(receiver\)\.await/;
  // PHP: the calling thread blocks on the runtime of binding_core.
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /binding_core::driver::block_on\(binding_core::driver::Caught::new\(/);
  assert.match(php, future);
  assert.match(php, method);
  // Python: the future runs without the GIL, and a<name> runs <name> in asyncio.to_thread.
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /py\.detach\(\|\| binding_core::driver::block_on\(/);
  assert.match(python, future);
  assert.match(python, /#\[pyfunction\(name = "afetch", signature = \(\*args, \*\*kwargs\)\)\]/);
  assert.match(python, /#\[pyo3\(name = "aenter_later", signature = \(\*args, \*\*kwargs\)\)\]/);
  assert.match(text(out, 'packages/python/generated/python/polyspec/classes/_native.pyi'), /\nasync def afetch\(name: str\) -> str: \.\.\./);
  // Node: a Promise of the future on the tokio runtime of napi, whose result is converted on the JavaScript thread.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /env\s*\.spawn_future_with_callback\(driven\(binding_core::driver::Caught::new\(future\)\)/);
  assert.match(node, future);
  assert.match(node, method);
  // GN-6h: Node moves the guard into the future, which binds the borrow of the guard inside it.
  assert.match(node, /let receiver = self\.inner\.read\("Gate", &\[\]\)[^\n]*\?;\n\s+driving\(env, async move \{ let receiver = &\*receiver; polyspec_classes::Gate::enter_later\(receiver\)\.await/);
  const dts = text(out, 'packages/ts/generated/index.d.ts');
  assert.match(dts, /export declare function fetch\(name: string\): Promise<string>;/);
  assert.match(dts, /\n {2}enterLater\(\): Promise<string>;/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /await pkg\.fetch\('a'\)/);
  // The binding crates turn on the driver of binding_core, and the Node crate the tokio runtime of napi.
  const crates = trackedPackages(read('packages/rust/interface.json'), '0.0.0');
  for (const crate of ['packages/php-ext/Cargo.toml', 'packages/python/Cargo.toml', 'packages/ts/Cargo.toml', 'packages/go/internal/ffi/Cargo.toml']) {
    assert.match(String(crates.get(crate)), /polyspec-binding-core = \{[^\n]*features = \[[^\]\n]*"driver"/, crate);
  }
  assert.match(String(crates.get('packages/ts/Cargo.toml')), /napi = \{[^\n]*features = \[[^\]\n]*"tokio_rt"/);
  // A Go crate without such a member does not turn the driver on.
  const withoutGo = read('packages/rust/interface.json');
  for (const unit of withoutGo.units) for (const m of unit.members ?? []) if (m.wait === 'async_driver') m.only = { targets: ['php', 'python', 'node'], reason: 'GN-6n' };
  assert.doesNotMatch(String(trackedPackages(withoutGo, '0.0.0').get('packages/go/internal/ffi/Cargo.toml')), /"driver"/);
  // WASM: a Promise of the future, which the event loop of JavaScript polls (wasm-bindgen-futures), without the driver
  // of binding_core and without a tokio runtime.
  const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /awaited\(async move \{ polyspec_classes::settle\(&name\)\.await\.map_err\(core_error\) \}, text_out\)/);
  assert.match(wasm, /wasm_bindgen_futures::future_to_promise\(async move \{ caught\(future\)\.await\.and_then\(give\)\.map_err\(throw\) \}\)/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.mjs'), /\nexport async function settle\(\.\.\.args\) \{/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.d.ts'), /export declare function settle\(name: string\): Promise<string>;/);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /test\('GN-13e: settle a_name_is_settled', async \(\) => \{\n {2}assert\.deepStrictEqual\(ordered\(\(await pkg\.settle\('a'\)\)\)/);
  assert.match(text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /test\('B-4: settle an_empty_name_is_missing_when_settled', async \(\) => \{\n {2}await assert\.rejects\(async \(\) => \(await pkg\.settle\(''\)\)/);
  assert.match(String(crates.get('packages/ts/wasm/Cargo.toml')), /\nwasm-bindgen-futures = "=0\.4\.80"\n/);
  assert.doesNotMatch(String(crates.get('packages/ts/wasm/Cargo.toml')), /"driver"/);
  // A WASM method's future owns the guard of its receiver, and a constructor that awaits is refused by name.
  const everywhere = (contract: any): void => {
    for (const unit of contract.units) for (const member of unit.members ?? []) if (member.wait !== undefined && member.wait !== 'none') delete member.only;
  };
  // Go: the cgo call of the member blocks on the runtime of binding_core, on the thread of the calling goroutine, with
  // the guard of the receiver held by the entry point.
  const go = classes(everywhere, ['go']);
  const goLib = text(go, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(goLib, /driven\(binding_core::driver::block_on\(binding_core::driver::Caught::new\(async move \{ polyspec_classes::fetch\(&name\)\.await \}\)\)\)\.map_err\(binding_error\)\?/);
  assert.match(goLib, /let receiver = held\.read\("Gate", &\[\]\)[^\n]*\?;\n\s+let receiver = &\*receiver;\n[^\n]*block_on\([^\n]*polyspec_classes::Gate::enter_later\(receiver\)\.await/);
  assert.match(goLib, /\nfn driven<T>\(/);
  assert.match(text(go, 'packages/go/zz_generated_classes.go'), /\nfunc Fetch\(name string\) \(string, error\) \{/);
  assert.match(text(go, 'packages/go/zz_generated_classes.go'), /\nfunc \(this \*Gate\) EnterLater\(\) \(string, error\) \{/);
  const wasmEverywhere = classes(everywhere, ['wasm']);
  assert.match(text(wasmEverywhere, 'packages/ts/wasm/generated/lib.rs'), /let receiver = held\.read\("Gate", &\[\]\)\.map_err\(binding_error\)\?;\n\s*awaited\(async move \{ let receiver = &\*receiver; polyspec_classes::Gate::enter_later\(receiver\)\.await\.map_err\(core_error\) \}, text_out\)/);
  assert.match(text(wasmEverywhere, 'packages/ts/wasm/generated/index.mjs'), /\n {2}async enterLater\(\.\.\.args\) \{/);
  assert.match(text(wasmEverywhere, 'packages/ts/wasm/generated/index.d.ts'), /\n {2}enterLater\(\): Promise<string>;/);
  assert.throws(() => classes((c) => { member(c, 'tag.new').wait = 'async_driver'; }, ['node']), /tag\.new: a constructor with wait async_driver is not generated \(GN-6n\)/);
});

test('the generated WASM future of a member with wait async_driver compiles against the core of tests/e2e/classes for the host and for wasm32 (GN-6n)', () => {
  // The entry point of classes.settle and the helpers that it uses, as the generator writes them, with the core
  // function of the fixture's own source. The stand-ins are the items of wasm-bindgen, of binding_core and of the
  // module that they name, each with the signature of the item it stands for: future_to_promise of
  // wasm-bindgen-futures takes a future of Result<JsValue, JsValue> that is 'static.
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const wasm = text(generate({ contract: read('packages/rust/interface.json'), version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['wasm'] }), 'packages/ts/wasm/generated/lib.rs');
  const entry = /pub fn function_settle\(name: JsValue\) -> Result<JsValue, JsValue> \{\n\s*guard\(\|\| (?:shielded\(\|\| )?\{\n([\s\S]*?)\n\s*\}\)\)?\n\s*\.map_err\(throw\)/.exec(wasm);
  assert.ok(entry !== null, 'no WASM entry point settle');
  const params: string[] = [];
  const body: string[] = [];
  for (const line of (entry[1] ?? '').split('\n')) {
    const input = /^\s*let (\w+): (.+?) = \w+_in\(.*\?;$/.exec(line);
    if (input === null) body.push(line);
    else params.push(`${input[1]}: ${input[2]}`);
  }
  const helper = (name: string): string => {
    const found = new RegExp(`(?:///[^\\n]*\\n)*(?:async )?fn ${name}<[\\s\\S]*?\\n\\}\\n`).exec(wasm);
    assert.ok(found !== null, `no helper ${name}`);
    return found[0];
  };
  const core = readFileSync(new URL('../../../tests/e2e/classes/packages/rust/src/lib.rs', import.meta.url), 'utf8');
  const settle = /(?:\/\/\/[^\n]*\n)*pub async fn settle\([\s\S]*?\n\}\n/.exec(core);
  const pending = /(?:\/\/\/[^\n]*\n)*#\[derive\(Default\)\]\nstruct Pending \{[\s\S]*?\nimpl std::future::Future for Pending \{[\s\S]*?\n\}\n/.exec(core);
  assert.ok(settle !== null && pending !== null, 'no core function settle with its future Pending');
  const source = `use std::panic::{catch_unwind, AssertUnwindSafe};

pub struct JsValue;

pub struct Promise;

impl From<Promise> for JsValue {
    fn from(_promise: Promise) -> Self {
        Self
    }
}

pub mod wasm_bindgen_futures {
    pub fn future_to_promise<F>(future: F) -> super::Promise
    where
        F: std::future::Future<Output = Result<super::JsValue, super::JsValue>> + 'static,
    {
        drop(future);
        super::Promise
    }
}

pub enum BindingError {
    Internal { detail: String },
}

pub struct Fail;

fn throw(_fail: Fail) -> JsValue {
    JsValue
}

fn binding_error(_error: BindingError) -> Fail {
    Fail
}

fn core_error(_error: polyspec_classes::Error) -> Fail {
    Fail
}

fn text_out(value: impl AsRef<str>) -> Result<JsValue, Fail> {
    let _text: &str = value.as_ref();
    Ok(JsValue)
}

pub mod polyspec_classes {
    pub enum Error {
        Missing { key: String },
    }

${settle[0]}
${pending[0]}}

${helper('awaited')}
${helper('caught')}
pub fn settle(${params.join(', ')}) -> Result<JsValue, Fail> {
${body.join('\n')}
}
`;
  const channel = /channel = "([^"]+)"/.exec(readFileSync(new URL('../../../rust-toolchain.toml', import.meta.url), 'utf8'))?.[1] ?? '';
  const where = mkdtempSync(join(tmpdir(), 'binding-future-'));
  try {
    for (const target of [[], ['--target', 'wasm32-unknown-unknown']]) {
      const run = spawnSync('rustc', ['--edition', '2021', '--crate-type', 'lib', '--crate-name', 'awaiting', '--emit', 'metadata', '-D', 'warnings', '--out-dir', where, ...target, '-'], { input: source, encoding: 'utf8', cwd: where, env: { ...process.env, RUSTUP_TOOLCHAIN: channel } });
      assert.equal(run.status, 0, `rustc ${target.join(' ')}: ${run.stderr}`);
    }
  } finally {
    rmSync(where, { recursive: true, force: true });
  }
});

test('a member with wait blocking_io that reaches language code runs where its language references may be used (GN-6q)', () => {
  const sample = (change: (contract: any) => void = () => undefined, targets?: string[]): Map<string, string | Buffer> => {
    const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
    change(contract);
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), ...(targets === undefined ? {} : { targets: targets as Inputs['targets'] & string[] }) });
  };
  const out = sample();
  const token = 'binding_core::Io::for_generated_call()';
  // PHP: the core calls the callback on the calling thread.
  assert.ok(text(out, 'packages/php-ext/generated/lib.rs').includes(`polyspec_sample::resolve_slowly(${token}, `), 'PHP passes the token');
  // Python: the call runs without the GIL, each callback call takes the GIL on the thread of the core, and a callback
  // with thread owner has no check of the thread.
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /py\.detach\(\|\| [^\n]*polyspec_sample::resolve_slowly\(binding_core::Io::for_generated_call\(\), /);
  assert.match(python, /#\[pyfunction\(name = "aresolve_slowly", signature = \(\*args, \*\*kwargs\)\)\]/);
  assert.doesNotMatch(python, /WrongThread|std::thread::current/);
  const pyTests = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(pyTests, /def test_gn6q_resolve_slowly_awaits_a_callback_on_the_thread_of_to_thread\(self\) -> None:\n {8}raised = LookupError\("raised by the callback"\)\n {8}with self\.assertRaises\(LookupError\) as caught:\n {12}asyncio\.run\(pkg\.aresolve_slowly\(/);
  // Node: the call runs synchronously on the JavaScript thread, and the entry still returns a Promise.
  const node = text(out, 'packages/ts/generated/lib.rs');
  const entry = node.slice(node.indexOf('pub fn function_resolve_slowly<'), node.indexOf('\n}\n', node.indexOf('pub fn function_resolve_slowly<')));
  assert.match(entry, /polyspec_sample::resolve_slowly\(binding_core::Io::for_generated_call\(\), &mut \{ lookup \}, &key\)/);
  assert.doesNotMatch(entry, /waiting\(env/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export declare function resolveSlowly\(lookup: Lookup, key: string\): Promise<string>;/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /await pkg\.resolveSlowly\(/);
  // G-5: every K-2 test of a member that waits is an async function, as it awaits the call.
  for (const found of String(text(out, 'packages/ts/generated/tests/generated.test.mjs')).matchAll(/test\('K-2: resolveSlowly [^']*', (async )?\(\) => \{/g)) assert.ok(found[1] !== undefined, found[0]);
  // Node and PHP keep the check of a callback with thread owner.
  assert.match(node, /BindingError::WrongThread/);
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /BindingError::WrongThread/);
  // A member with async_driver that reaches language code is refused without machine.
  const everywhere = (contract: any): void => {
    for (const unit of contract.units) for (const member of unit.members ?? []) if (member.wait === 'blocking_io') delete member.only;
    contract.targets = contract.targets.filter((t: string) => t !== 'wasm');
  };
  const goSample = sample(everywhere, ['go']);
  // Go: the core calls the callback in the cgo call of the member, on the thread of the calling goroutine.
  assert.match(text(goSample, 'packages/go/internal/ffi/generated/lib.rs'), /polyspec_sample::resolve_slowly\(binding_core::Io::for_generated_call\(\), &mut \{ lookup \}, &key\)/);
  assert.match(text(goSample, 'packages/go/zz_generated_sample.go'), /\nfunc ResolveSlowly\(lookup Lookup, key string\) \(string, error\) \{/);
  const driven = (contract: any): void => { member(contract, 'sample.resolve_slowly').wait = 'async_driver'; };
  assert.throws(() => sample(driven, ['node']), /sample\.resolve_slowly: a member with wait async_driver that reaches language code names machine: true in its core \(GN-6ab, CK-68\)/);
});

test('a member with wait async_driver that reaches language code drives the state machine of its core (GN-6ab)', () => {
  const sample = (change: (contract: any) => void = () => undefined, targets?: string[]): Map<string, string | Buffer> => {
    const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
    change(contract);
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), ...(targets === undefined ? {} : { targets: targets as Inputs['targets'] & string[] }) });
  };
  const out = sample();
  // Each Io future is polled as the machine gave it, with the faults of the member around it; the machine is a
  // temporary of the call of drive, so no block is the scrutinee of the match of its result (clippy).
  const wait = String.raw`binding_core::driver::block_on\(binding_core::driver::Caught::new\(armed_future\("sample\.resolve_driven", io\)\)\)`;
  // The machine owns its arguments, so the core takes each by value.
  const made = /match binding_core::machine::drive\(&mut polyspec_sample::resolve_driven\(lookup, key\), /;
  // PHP: the machine runs on the calling thread, which waits for each Io future on the runtime of binding_core.
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, made);
  assert.match(php, new RegExp(String.raw`binding_core::machine::drive\(&mut polyspec_sample::resolve_driven\(lookup, key\), \|io\| driven\(${wait}\), \|value\| Ok\(Ok\(value\)\)\)\.map_err\(binding_error\)\?`));
  // Python: <name> drives the machine and waits for each Io future without the GIL; a<name> runs it in to_thread.
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, made);
  assert.match(python, new RegExp(String.raw`binding_core::machine::drive\(&mut polyspec_sample::resolve_driven\(lookup, key\), \|io\| driven\(py\.detach\(\|\| ${wait}\)\), \|value\| Ok\(Ok\(value\)\)\)\.map_err\(\|error\| binding_error\(py, error\)\)\?`));
  assert.match(python, /#\[pyfunction\(name = "aresolve_driven", signature = \(\*args, \*\*kwargs\)\)\]/);
  // Node: the entry returns a Driven object, and the JavaScript entry advances it until it ends.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /let mut machine = binding_core::machine::Driving::new\(polyspec_sample::resolve_driven\(lookup, key\)\);/);
  // The machine outlives the call that made it, so the callback that it owns holds a reference of napi.
  assert.match(node, /let lookup = owned_lookup\(env, lookup, "lookup"\)\?;/);
  assert.match(node, /pub struct OwnedCbLookup \{\n {4}object: Owned,\n/);
  assert.match(node, /impl Drop for Owned \{\n {4}fn drop\(&mut self\) \{\n[^\n]*\n {8}unsafe \{ napi::sys::napi_delete_reference\(self\.env, self\.reference\) \};/);
  assert.match(node, /Driven::start\(env, advancing\(move \|env, _settled\| \{/);
  // A function new that returns no Self fails clippy new_ret_no_self.
  assert.doesNotMatch(node, /fn new<'env>\(env: &'env Env, advance/);
  assert.match(node, /binding_core::machine::Next::Wait\(io\) => \{/);
  // GN-6ae: a machine of a member without a function parameter holds no value of language code, so it awaits none.
  assert.match(node, /binding_core::machine::Next::Await\(_value\) => Err\(binding_error\(BindingError::Internal \{ detail: String::from\("GN-6ae: sample\.resolve_driven awaits no value of language code"\) \}\)\),/);
  assert.match(node, /pub struct Driven \{/);
  assert.match(node, /pub fn advance<'env>\(&mut self, env: &'env Env, settled: Unknown<'env>\) -> napi::Result<Unknown<'env>> \{/);
  // An advance gives the step of what it stops at: a wait (0) or the end (2).
  assert.match(node, /Ok\(\(0, promise\)\)/);
  assert.match(node, /Ok\(\(2, text_out\(env, result\)\?\)\)/);
  const cjs = text(out, 'packages/ts/generated/index.cjs');
  assert.match(cjs, /async function drive\(driven\) \{\n  let settled;\n  for \(;;\) \{\n    const \[step, value\] = driven\.advance\(settled\);\n    settled = undefined;\n    if \(step === 2\) return value;\n    if \(step === 0\) \{\n      await value;\n      continue;\n    \}\n    try \{\n      settled = \[true, await value\];\n    \} catch \(reason\) \{\n      settled = \[false, reason\];\n    \}\n  \}\n\}/);
  assert.match(cjs, /return drive\(addon\.resolveDriven\(args\[0\], args\[1\]\)\);/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export declare function resolveDriven\(lookup: Lookup, key: string\): Promise<string>;/);
  // Go: the call of the C ABI drives the machine, and each call of the Go callback goes through cgo.
  const go = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(go, made);
  // GN-15: a helper that only an entry point of a test feature uses carries the feature, so the build without it has
  // no dead code.
  assert.match(go, /\n#\[cfg\(feature = "fault-test"\)\]\nfn list_out</);
  assert.match(go, new RegExp(String.raw`binding_core::machine::drive\(&mut polyspec_sample::resolve_driven\(lookup, key\), \|io\| driven\(${wait}\), \|value\| Ok\(Ok\(value\)\)\)\.map_err\(binding_error\)\?`));
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /func ResolveDriven\(lookup Lookup, key string\) \(string, error\) \{/);
  // WASM: as Node, the entry returns a Driven object of the module, and the ES entry advances it until it ends; each
  // wait is a promise of the event loop of JavaScript.
  const wasmOut = sample((c) => { delete member(c, 'sample.resolve_driven').only; }, ['wasm']);
  const wasm = text(wasmOut, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /let mut machine = binding_core::machine::Driving::new\(polyspec_sample::resolve_driven\(lookup, key\)\);\n\s*let given = Rc::new\(RefCell::new\(None\)\);\n\s*Ok\(JsValue::from\(Driven::new\(move \|_settled\| \{/);
  assert.match(wasm, /binding_core::machine::Next::Wait\(io\) => \{\n\s*let given = Rc::clone\(&given\);\n\s*let promise = awaited\(/);
  assert.match(wasm, /binding_core::machine::Next::Done\(result\) => \{\n\s*let result = result\.map_err\(failure_error\)\?;\n\s*Ok\(\(2, text_out\(result\)\?\)\)/);
  assert.match(wasm, /binding_core::machine::Next::Await\(_value\) => Err\(binding_error\(BindingError::Internal \{ detail: String::from\("GN-6ae: sample\.resolve_driven awaits no value of language code"\) \}\)\),/);
  assert.match(wasm, /#\[wasm_bindgen\]\n\s*pub struct Driven \{/);
  // GN-6n: the catch of a panic of a poll is an async function (clippy manual_async_fn).
  assert.match(wasm, /\nasync fn caught<F, O>\(future: F\) -> Result<O, Fail>\nwhere\n/);
  assert.match(wasm, /pub fn advance\(&mut self, settled: JsValue\) -> Result<JsValue, JsValue> \{/);
  const mjs = text(wasmOut, 'packages/ts/wasm/generated/index.mjs');
  assert.match(mjs, /async function drive\(Internal, driven\) \{\n {2}try \{\n {4}let settled;\n {4}for \(;;\) \{\n {6}const \[step, value\] = enter\(Internal, \(\) => driven\.advance\(settled\)\);\n {6}settled = undefined;\n {6}if \(step === 2\) return value;\n {6}if \(step === 0\) \{\n {8}await value;\n {8}continue;\n {6}\}\n {6}try \{\n {8}settled = \[true, await value\];\n {6}\} catch \(reason\) \{\n {8}settled = \[false, reason\];\n {6}\}\n {4}\}\n {2}\} finally \{\n {4}driven\.free\(\);\n {2}\}\n\}/);
  assert.match(mjs, /export async function resolveDriven\(\.\.\.args\) \{[\s\S]*?return drive\(SampleInternalError, enter\(SampleInternalError, \(\) => glue\.resolveDriven\(args\[0\], args\[1\]\)\)\);/);
  assert.match(text(wasmOut, 'packages/ts/wasm/generated/index.d.ts'), /export declare function resolveDriven\(lookup: Lookup, key: string\): Promise<string>;/);
  assert.match(text(wasmOut, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /test\('K-2: resolveDriven lets the exception of a callback through', async \(\) => \{/);
  // A method with machine is refused by name.
  // GN-6ae: a method with machine gives the core a clone of the value of its instance, before its arguments.
  const method = sample((c) => { const m = member(c, 'ledger.known'); m.wait = 'async_driver'; m.core.machine = true; }, ['php', 'python', 'node', 'go', 'wasm']);
  for (const crate of ['packages/php-ext/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    assert.match(text(method, crate), /polyspec_sample::Ledger::known\(Clone::clone\(receiver\), /, crate);
  }
});

test('the generated test of a callback of a member that waits awaits it, and a Go fixture that expects no call reads the length of its calls (GN-6m, G-5)', () => {
  const out = generate({ contract: JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8')), version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['node', 'go'] });
  // Each test of a block that awaits is an async function, not only the first.
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(node, /test\('K-2: resolveSlowly lets the exception of a callback through', async \(\) => \{\n {2}const raised = new Error\('raised by the callback'\);\n {2}await assert\.rejects\(/);
  for (const found of node.matchAll(/\ntest\('[^\n]*', \(\) => \{\n((?:(?!\n\}\);)[\s\S])*)\n\}\);/g)) assert.doesNotMatch(found[1] ?? '', /\bawait /, found[0]);
  // reflect.DeepEqual tells a nil slice from an empty one, so no expected call is read as the length 0.
  const go = text(out, 'packages/go/zz_generated_test.go');
  assert.match(go, /func TestB4ResolveDrivenAnEmptyKeyFailsItsReadBeforeTheLookup\(t \*testing\.T\) \{[\s\S]*?\n\tif len\(fixture0\.calls\) != 0 \{\n\t\tt\.Fatalf\("G-5: the calls %v are not none", fixture0\.calls\)\n\t\}\n\}/);
  assert.doesNotMatch(go, /want := \[\]\[\]any\{\}/);
});

test('a member with machine takes a function parameter and returns passthrough, which each target refuses by name until it generates them (GN-6ae)', () => {
  const sample = (change: (contract: any) => void, targets: string[]): Map<string, string | Buffer> => {
    const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
    change(contract);
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: targets as Inputs['targets'] & string[] });
  };
  const fn = { function: { parameters: [{ unit: 'ledger' }], returns: { passthrough: 'T' }, async_allowed: true } };
  const scoped = (c: any): void => {
    const m = member(c, 'ledger.known');
    m.wait = 'async_driver';
    m.core.machine = true;
    m.parameters = [{ name: ['scope'], type: fn, required: true }];
    m.returns = { passthrough: 'T' };
  };
  // The five targets generate the member.
  for (const target of ['php', 'python', 'go', 'node', 'wasm']) {
    assert.doesNotThrow(() => sample(scoped, [target]), target);
  }
  // A function parameter and a result passthrough belong to a member with machine.
  const plain = (c: any): void => { member(c, 'ledger.known').parameters = [{ name: ['scope'], type: fn, required: true }]; };
  assert.throws(() => sample(plain, ['php']), /ledger\.known\.scope: a parameter of a function type that returns passthrough is generated for a member with machine only \(GN-6ae\)/);
  const returned = (c: any): void => { member(c, 'ledger.size').returns = { passthrough: 'T' }; };
  assert.throws(() => sample(returned, ['php']), /ledger\.size: a result passthrough is generated for a member with machine only \(GN-6ae\)/);
  // The function returns passthrough, which the core moves without reading.
  const typed = (c: any): void => { scoped(c); member(c, 'ledger.known').parameters[0].type.function.returns = 'text'; };
  assert.throws(() => sample(typed, ['php']), /ledger\.known\.scope: a function parameter of a member with machine returns passthrough \(GN-6ae\)/);
});

test('a Go helper that only the entry points of a test feature use is compiled under that feature (GN-4)', () => {
  const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const lib = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['go'] }), 'packages/go/internal/ffi/generated/lib.rs');
  // out_list writes the points that a fault-test entry point gives back, and no member of the sample gives a list.
  assert.match(lib, /\n#\[cfg\(feature = "fault-test"\)\]\nfn list_out</);
  // A helper of the members is compiled in every form.
  assert.match(lib, /\nfn text_in\(/);
});

test('a member with wait process_wait passes the ProcessWait token and waits on no shared pool (GN-6m, B-5 (b))', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const classes = (targets: string[], change: (contract: any) => void = () => undefined, wait = 'process_wait'): Map<string, string | Buffer> => {
    const contract = read('packages/rust/interface.json');
    for (const id of waits) contract.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === id).wait = wait;
    change(contract);
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: targets as Inputs['targets'] & string[] });
  };
  // Every member of the contract that waits in a blocking call of its core.
  const waits = ['classes.read', 'gate.enter_slowly', 'classes.attend', 'classes.outlast', 'gate.enter_after'];
  const token = 'binding_core::ProcessWait::for_generated_call()';
  const out = classes(['php', 'python', 'node', 'go']);
  // PHP and Go wait on the calling thread.
  for (const path of ['packages/php-ext/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs']) {
    assert.ok(text(out, path).includes(`polyspec_classes::read(${token}, `), path);
    assert.ok(text(out, path).includes(`polyspec_classes::Gate::enter_slowly(receiver, ${token})`), path);
  }
  // Python: <name> waits without the GIL, and a<name> runs it on a thread of its own, not in asyncio.to_thread.
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.ok(python.includes(`polyspec_classes::read(${token}, `));
  assert.match(python, /fn function_aread<'py>\([^\n]+\n {4}awaited_apart\(py, wrap_pyfunction!\(function_read, py\)\?\.into_any\(\), args, kwargs\)/);
  assert.match(python, /fn member_aenter_slowly<'py>\([^\n]+\n {8}awaited_apart\(slf\.py\(\), /);
  assert.match(python, /\nfn awaited_apart<'py>\([\s\S]*?threading\.Thread\(target=run\)\.start\(\)\n {4}return await future\n"#;/);
  // A loop that was closed before the thread ended takes no result: the thread catches exactly that failure of
  // call_soon_threadsafe, so no exception escapes it, and it stays a thread that the interpreter waits for.
  assert.match(python, /\n {4}def give\(result, error\):\n {8}try:\n {12}loop\.call_soon_threadsafe\(settle, result, error\)\n {8}except RuntimeError:\n {12}if not loop\.is_closed\(\):\n {16}raise\n/);
  assert.match(python, /except BaseException as error:\n {12}give\(None, error\)\n {8}else:\n {12}give\(result, None\)\n/);
  assert.doesNotMatch(python, /daemon/);
  // The generated test closes the loop before it starts the thread of the call, and requires that no exception
  // escaped a thread.
  const pythonTests = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(pythonTests, /\n {4}def test_gn6m_attend_drops_its_result_when_its_loop_is_closed\(self\) -> None:\n[\s\S]*?task = loop\.create_task\(pkg\.aattend\("a"\)\)\n {12}loop\.call_soon\(loop\.stop\)\n {12}loop\.run_forever\(\)\n {12}task\.cancel\(\)\n {12}loop\.run_until_complete\(asyncio\.gather\(task, return_exceptions=True\)\)\n {12}loop\.close\(\)\n {12}for thread in started:\n {16}thread_class\.start\(thread\)\n {16}thread\.join\(\)\n {8}self\.assertEqual\(len\(started\), 1\)\n {8}self\.assertEqual\(escaped, \[\]\)\n/);
  assert.match(pythonTests, /def test_gn6m_gate_enter_after_drops_its_result_when_its_loop_is_closed\(self\)/);
  assert.match(pythonTests, /\nimport threading\n/);
  assert.match(pythonTests, /\nimport unittest\.mock\n/);
  // Node: the work runs on a thread of its own, and the JavaScript thread settles the promise.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.ok(node.includes(`waiting_apart(env, move || `) && node.includes(`polyspec_classes::read(${token}, `));
  assert.match(node, /\nfn waiting_apart<'env, W, O>\([\s\S]*?env\.create_deferred::<Settled, _>\(\)[\s\S]*?std::thread::Builder::new\(\)\.spawn\(move \|\| \{\n {8}let output = guard\(work\);\n {8}deferred\.resolve\(/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export declare function read\(name: string\): Promise<string>;/);
  // A crate holds the helper of the wait that its members use, and no other.
  assert.doesNotMatch(node, /\nfn waiting</);
  const io = classes(['python', 'node'], () => undefined, 'blocking_io');
  assert.doesNotMatch(text(io, 'packages/ts/generated/lib.rs'), /waiting_apart|Settled/);
  assert.doesNotMatch(text(io, 'packages/python/generated/lib.rs'), /awaited_apart/);
  // A constructor does not wait for a process either.
  assert.throws(() => classes(['php'], (c) => { const made = c.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.kind === 'constructor'); made.wait = 'process_wait'; }), /a constructor with wait process_wait is not generated \(GN-6m\)/);
});

test('a member with wait blocking_io passes the Io token and waits in the form of each language (GN-6m, B-5 (a))', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const classes = (change: (contract: any) => void = () => undefined, targets?: string[]): Map<string, string | Buffer> => {
    const contract = read('packages/rust/interface.json');
    change(contract);
    return generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), ...(targets === undefined ? {} : { targets: targets as Inputs['targets'] & string[] }) });
  };
  const out = classes();
  const token = 'binding_core::Io::for_generated_call()';
  // PHP: the call blocks the calling thread.
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.ok(php.includes(`polyspec_classes::read(${token}, `), 'PHP passes the token to read');
  assert.match(php, /polyspec_classes::Gate::enter_slowly\(receiver, binding_core::Io::for_generated_call\(\)\)/);
  // Python: the core call runs without the GIL, and a<name> runs <name> in asyncio.to_thread.
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /py\.detach\(\|\| [^\n]*polyspec_classes::read\(binding_core::Io::for_generated_call\(\), /);
  assert.match(python, /#\[pyo3\(name = "aenter_slowly", signature = \(\*args, \*\*kwargs\)\)\]/);
  assert.match(python, /#\[pyfunction\(name = "aread", signature = \(\*args, \*\*kwargs\)\)\]/);
  assert.match(python, /"to_thread"/);
  assert.match(text(out, 'packages/python/generated/python/polyspec/classes/_native.pyi'), /\nasync def aread\(name: str\) -> str: \.\.\./);
  // Node: a Promise, whose work runs on the libuv pool and whose result is converted on the JavaScript thread.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /impl<'env, W, O> ScopedTask<'env> for Waiting<W, O>/);
  assert.match(node, /waiting\(env, move \|\| [^\n]*polyspec_classes::read\(binding_core::Io::for_generated_call\(\), /);
  // GN-6h: the closure on the pool owns the guard and binds the borrow of the guard inside it.
  assert.match(node, /let receiver = self\.inner\.read\("Gate", &\[\]\)[^\n]*\?;\n\s+waiting\(env, move \|\| \{ let receiver = &\*receiver; [^\n]*polyspec_classes::Gate::enter_slowly\(receiver, binding_core::Io::for_generated_call\(\)\)/);
  const dts = text(out, 'packages/ts/generated/index.d.ts');
  assert.match(dts, /export declare function read\(name: string\): Promise<string>;/);
  assert.match(dts, /\n {2}enterSlowly\(\): Promise<string>;/);
  const tests = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(tests, /await pkg\.read\('a'\)/);
  assert.match(tests, /await assert\.rejects\(/);
  // WASM has no member that waits (only, Q-4).
  assert.doesNotMatch(text(out, 'packages/ts/wasm/generated/index.mjs'), /enterSlowly|\bread\(/);
  const everywhere = (contract: any): void => {
    for (const unit of contract.units) for (const member of unit.members ?? []) if (member.wait === 'blocking_io') delete member.only;
    contract.targets = contract.targets.filter((t: string) => t !== 'wasm');
  };
  // GN-6u: only a value alias gives a func, so the C ABI of a contract with a callback unit and no value alias writes
  // no list of handles before a buffer, and the Go package reads none.
  assert.doesNotMatch(text(classes(everywhere, ['go']), 'packages/go/internal/ffi/generated/lib.rs'), /given_first/);
  assert.match(text(classes(everywhere, ['go']), 'packages/go/internal/binding/zz_generated_binding.go'), /\nfunc readerOf\(bytes \[\]byte\) \*Reader \{ return NewReader\(bytes\) \}\n/);
  // Go: the cgo call of the member calls the core on the thread of the calling goroutine and returns its result; the
  // member has the form of a member that does not wait.
  const go = classes(everywhere, ['go']);
  const goLib = text(go, 'packages/go/internal/ffi/generated/lib.rs');
  assert.ok(goLib.includes(`polyspec_classes::read(${token}, `), 'Go passes the token to read');
  // GN-6h: the entry point holds the read guard of the receiver across the core call, and the class is in Shared.
  assert.match(goLib, /let receiver = held\.read\("Gate", &\[\]\)[^\n]*\?;\n\s+let receiver = &\*receiver;\n[^\n]*polyspec_classes::Gate::enter_slowly\(receiver, binding_core::Io::for_generated_call\(\)\)/);
  assert.match(goLib, /static TABLE_GATE: Mutex<Table<binding_core::Shared<polyspec_classes::Gate>>>/);
  const goPackage = text(go, 'packages/go/zz_generated_classes.go');
  assert.match(goPackage, /\nfunc Read\(name string\) \(string, error\) \{/);
  assert.match(goPackage, /\nfunc \(this \*Gate\) EnterSlowly\(\) \(string, error\) \{/);
  assert.doesNotMatch(goPackage, /context\.Context/);
  // A constructor that waits has no awaited form: refused by name.
  assert.throws(() => classes((c) => { member(c, 'tag.new').wait = 'blocking_io'; }, ['node']), /tag\.new: a constructor with wait blocking_io is not generated \(GN-6m\)/);
});

// GN-15g: the Go module names the directory of the static library of each platform itself, so a module that is fetched
// at its tag links the library that it carries without CGO_LDFLAGS; the directory is a package that the binding
// imports, so go mod vendor copies the library.
test('Go links the static library of each platform from its directory in the Go module (GN-15g)', () => {
  const out = sampleWith(() => undefined, ['go']);
  for (const platform of ['linux_amd64', 'linux_arm64', 'darwin_arm64']) {
    const link = text(out, `packages/go/internal/binding/zz_generated_link_${platform}.go`);
    assert.match(link, /^\/\/ Code generated by binding from the interface contract\. DO NOT EDIT\.$/m);
    assert.match(link, /\npackage binding\n/);
    assert.ok(link.includes(`\n// #cgo LDFLAGS: -L\${SRCDIR}/../ffi/lib/${platform}\nimport "C"\n`), `the link file of ${platform} has no directive of its directory:\n${link}`);
    assert.ok(link.includes(`\nimport _ "github.com/polyspec/sample/packages/go/internal/ffi/lib/${platform}"\n`), `the link file of ${platform} does not import the package of its directory:\n${link}`);
    assert.match(text(out, `packages/go/internal/ffi/lib/${platform}/zz_generated_lib.go`), new RegExp(`\\npackage ${platform}\\n$`));
  }
  // No other platform has a file, and the directive of the library itself names no directory.
  assert.deepEqual([...out.keys()].filter((path) => /zz_generated_link_|\/ffi\/lib\//.test(path)).length, 6);
  assert.doesNotMatch(text(out, 'packages/go/internal/binding/zz_generated_binding.go'), /-L/);
});

// The sample with the classes store and scope of its core (GN-6ae): a transaction takes a function of a scope and
// returns what the function returned.
function scopedSample(targets: string[], change: (contract: any) => void = () => undefined): Map<string, string | Buffer> {
  const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  if (!contract.units.some((u: any) => u.id === 'store')) {
    const work = { function: { parameters: [{ unit: 'scope' }], returns: { passthrough: 'T' }, async_allowed: true } };
    const scopedMember = (unit: string, name: string): any => ({ id: `${unit}.${name}`, name: [name], kind: 'method', visibility: 'public', parameters: [{ name: ['work'], type: work, required: true }], returns: { passthrough: 'T' }, raises: [], wait: 'async_driver', core: { path: `polyspec_sample::${unit === 'store' ? 'Store' : 'Scope'}::${name}`, receiver: '&self', machine: true } });
    const get = (unit: string): any => ({ id: `${unit}.get`, name: ['get'], kind: 'method', visibility: 'public', parameters: [{ name: ['key'], type: 'text', required: true }], returns: { optional: 'text' }, raises: [], wait: 'none', core: { path: `polyspec_sample::${unit === 'store' ? 'Store' : 'Scope'}::get`, receiver: '&self' } });
    contract.units.push({
      id: 'store', name: ['store'], module: '', kind: 'class', visibility: 'public', origin: 'generated', core_type: 'polyspec_sample::Store', final: true,
      members: [
        { id: 'store.new', name: ['new'], kind: 'constructor', visibility: 'public', parameters: [], raises: [], wait: 'none', core: 'polyspec_sample::Store::new' },
        get('store'),
        scopedMember('store', 'transaction'),
      ],
    }, {
      id: 'scope', name: ['scope'], module: '', kind: 'class', visibility: 'public', origin: 'generated', core_type: 'polyspec_sample::Scope', final: true, constructible: false,
      members: [
        { id: 'scope.put', name: ['put'], kind: 'method', visibility: 'public', parameters: [{ name: ['key'], type: 'text', required: true }, { name: ['value'], type: 'text', required: true }], returns: 'none', raises: [], wait: 'none', core: { path: 'polyspec_sample::Scope::put', receiver: '&self' } },
        get('scope'),
        scopedMember('scope', 'nested'),
      ],
    });
  }
  change(contract);
  return generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: targets as Inputs['targets'] & string[] });
}

test('PHP makes a closure of a callable, holds its value in the passthrough table and returns it unchanged (GN-6ae)', () => {
  const out = scopedSample(['php']);
  const lib = text(out, 'packages/php-ext/generated/lib.rs');
  // The callable is checked when it enters (kind invalid_callback), and the closure owns a reference to it.
  assert.match(lib, /let work = callable_in\(work, "work"\)\?;/);
  // No helper of the crate has a name of the form in_<unit>, which the conversion of a class named scope would have,
  // and a class that only a function takes has no conversion in (T-5).
  assert.match(lib, /\nfn with_scope<R>\(class: &ClassEntry, body: impl FnOnce\(\) -> R\) -> R \{/);
  assert.doesNotMatch(lib, /\bfn in_scope\b/);
  assert.match(lib, /fn callable_in\(value: &Zval, subject: &str\) -> Result<Zval, Fail> \{\n {4}if !value\.is_callable\(\) \{\n {8}return Err\(binding_error\(BindingError::InvalidCallback \{ subject: subject\.to_owned\(\), member: String::new\(\) \}\)\);/);
  // The closure makes a new instance of the class of each class argument, calls the callable and stores what it
  // returned in the table; an exception of the callable is a Raised.
  assert.match(lib, /let work = move \|arg0: polyspec_sample::Scope\| -> Result<binding_core::Passthrough, binding_core::Failure<polyspec_sample::Error>> \{\n\s+let call = \|\| -> Result<binding_core::Passthrough, Thrown> \{\n\s+let arg0: Zval = out_scope\(arg0\)\.map_err\(Thrown::Binding\)\?;\n\s+Ok\(pass\(called\(&work, vec!\[&arg0\]\)\?\)\)\n\s+\};\n\s+call\(\)\.map_err\(thrown\)\n\s+\};/);
  assert.match(lib, /fn called\(function: &Zval, args: Vec<&dyn ext_php_rs::convert::IntoZvalDyn>\) -> Result<Zval, Thrown> \{/);
  assert.match(lib, /if let Some\(exception\) = ExecutorGlobals::take_exception\(\) \{\n {8}return Err\(Thrown::Php\(exception\)\);/);
  // The machine takes a clone of the value of the instance and the closure, and PHP settles an awaited value at once.
  assert.match(lib, /binding_core::machine::drive\(&mut polyspec_sample::Store::transaction\(Clone::clone\(receiver\), work\), \|io\| driven\([^\n]*\), \|value\| Ok\(Ok\(value\)\)\)/);
  // B-3: the table of the values, its release function, and the result that leaves the table unchanged.
  assert.match(lib, /static PASSED: RefCell<BTreeMap<u64, Zval>> = const \{ RefCell::new\(BTreeMap::new\(\)\) \};/);
  assert.match(lib, /fn pass\(value: Zval\) -> binding_core::Passthrough \{[^}]*binding_core::Passthrough::from_generated\(binding_core::Handle::new\(handle\), release_passed\)\n\}/);
  assert.match(lib, /fn release_passed\(handle: binding_core::Handle\) \{/);
  // A handle is a count that is never given again, and a result whose handle names no value is kind internal.
  assert.match(lib, /let handle = NEXT_PASSED\.fetch_add\(1, Ordering::Relaxed\);/);
  assert.match(lib, /\.with_borrow_mut\(\|map\| map\.remove\(&handle\.raw\(\)\)\)\n\s+\.ok_or_else\(\|\| binding_error\(BindingError::Internal \{ detail: String::from\("GN-6ae: the value of the passthrough is gone"\) \}\)\)/);
  assert.match(lib, /fn passed_out\(value: binding_core::Passthrough\) -> Result<Zval, Fail> \{/);
  assert.match(lib, /\n\s+passed_out\(result\)\n/);
  // The declaration: a callable of the scope that returns any value, which the member returns.
  const stub = text(out, 'packages/php-ext/generated/polyspec_sample.stub.php');
  assert.match(stub, /\* @param callable\(\\Polyspec\\Sample\\Scope\): mixed \$work\n(?:[^\n]*\n)*? {9}\*\/\n {8}public function transaction\(mixed \$work\): mixed \{\}/);
});

test('the PHP test writes a function fixture, the exception of raises callback and the calls of after (GN-6ae, CK-22)', () => {
  const tests = text(scopedSample(['php']), 'packages/php-ext/generated/tests/GeneratedTest.php');
  // A step calls a method on the argument at its position, a step that names a result requires it, and the function
  // returns its result, a value of GN-13.
  assert.match(tests, /public function testGn13eStoreTransactionTheEntriesOfAFunctionThatReturnsAreCommitted\(\): void\n {4}\{\n {8}\$receiver = new \\Polyspec\\Sample\\Store\(\);\n {8}self::assertSame\(self::same\("done"\), self::same\(\$receiver->transaction\(function \(mixed \.\.\.\$args\): mixed \{ \$args\[0\]->put\("a", "1"\); self::assertSame\(self::same\("1"\), self::same\(\$args\[0\]->get\("a"\)\)\); return "done"; \}\)\)\);\n {8}self::assertSame\(self::same\("1"\), self::same\(\$receiver->get\("a"\)\)\);\n {8}self::assertSame\(0, \\Polyspec\\Sample\\Internal\\thrownCount\(\)\);\n {4}\}/);
  // An argument of a function type of a step is again a function fixture.
  assert.match(tests, /\$args\[0\]->nested\(function \(mixed \.\.\.\$args\): mixed \{ self::assertSame\(self::same\("1"\), self::same\(\$args\[0\]->get\("a"\)\)\); \$args\[0\]->put\("b", "2"\); self::assertSame\(self::same\("2"\), self::same\(\$args\[0\]->get\("b"\)\)\); return null; \}\); self::assertSame\(self::same\("2"\), self::same\(\$args\[0\]->get\("b"\)\)\); return 2; \}/);
  // raises "callback": the function throws the exception that the test holds, the caller gets the same object, and
  // after observes the receiver after the failed call.
  assert.match(tests, /private static \?\\Throwable \$raised = null;/);
  assert.match(tests, /public function testGn6aeStoreTransactionTheEntriesOfAFunctionThatRaisesAreDropped\(\): void\n {4}\{\n {8}\$receiver = new \\Polyspec\\Sample\\Store\(\);\n {8}self::\$raised = new \\LogicException\("raised by the function of the case"\);\n {8}try \{\n {12}\$receiver->transaction\(function \(mixed \.\.\.\$args\): mixed \{ \$args\[0\]->put\("a", "1"\); self::assertSame\(self::same\("1"\), self::same\(\$args\[0\]->get\("a"\)\)\); throw self::\$raised; \}\);\n {12}self::fail\('no error'\);\n {8}\} catch \(\\LogicException \$error\) \{\n {12}self::assertSame\(self::\$raised, \$error\);\n {8}\}\n {8}self::assertSame\(self::same\(null\), self::same\(\$receiver->get\("a"\)\)\);\n {8}self::assertSame\(0, \\Polyspec\\Sample\\Internal\\thrownCount\(\)\);\n {4}\}/);
  // A value that is no callable is kind invalid_callback.
  assert.match(tests, /public function testGn6aeStoreTransactionWorkRefusesWhatIsNoCallable\(\): void\n {4}\{\n {8}try \{\n {12}new \\Polyspec\\Sample\\Store\(\)->transaction\(1\);\n {12}self::fail\('no error'\);\n {8}\} catch \(\\Polyspec\\Sample\\SampleTypeError \$error\) \{\n {12}self::assertSame\('invalid_callback', \$error->kind\(\)\);/);
});

test('Go takes a func as a callback of the call, holds its value in the table of package binding and returns it unchanged (GN-6ae)', () => {
  const out = scopedSample(['go']);
  const lib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  // The func enters as the call and its index in it, and a nil func is kind invalid_callback.
  assert.match(lib, /let work = go_function\(&mut input, "work"\)\?;/);
  assert.match(lib, /fn go_function\(input: &mut &\[u8\], subject: &str\) -> Result<\(u64, u64\), Fail> \{\n {4}if !read_tag\(input\)\? \{\n {8}return Err\(binding_error\(BindingError::InvalidCallback \{ subject: subject\.to_owned\(\), member: String::new\(\) \}\)\);/);
  // The closure writes each argument, a class argument as the handle of a new instance, and calls the func through
  // the trampoline of the callbacks; what the func returned is the Passthrough of its handle in the table of Go, and
  // an error of the func is a Raised.
  assert.match(lib, /let work = move \|arg0: polyspec_sample::Scope\| -> Result<binding_core::Passthrough, binding_core::Failure<polyspec_sample::Error>> \{\n\s+let mut args = Vec::new\(\);\n\s+\{\n\s+let output = &mut args;\n\s+out_scope\(output, arg0\);\n\s+\}\n\s+called\(work, &args\)\.map_err\(binding_core::Failure::from\)\n\s+\};/);
  assert.match(lib, /fn called\(function: \(u64, u64\), args: &\[u8\]\) -> Result<binding_core::Passthrough, Raised> \{\n {4}let \(call, callback\) = function;\n {4}let \(status, bytes\) = go_callback\(call, callback, 0, args\);\n {4}if status != 0 \{\n {8}return Err\(raised_by_go\(call, &bytes\)\);\n {4}\}/);
  assert.match(lib, /Ok\(handle\) => Ok\(binding_core::Passthrough::from_generated\(Handle::new\(handle\), release_passed\)\),/);
  assert.match(lib, /fn polyspec_sample__go_release_passed\(handle: u64\);/);
  assert.match(lib, /fn release_passed\(handle: Handle\) \{\n[^\n]*\n {4}unsafe \{ polyspec_sample__go_release_passed\(handle\.raw\(\)\) \};\n\}/);
  // The machine takes a clone of the value of the instance and the closure, and Go settles an awaited value at once.
  assert.match(lib, /binding_core::machine::drive\(&mut polyspec_sample::Store::transaction\(Clone::clone\(receiver\), work\), \|io\| driven\([^\n]*\), \|value\| Ok\(Ok\(value\)\)\)/);
  // A result passthrough crosses the C ABI as its handle; no helper has a name of the form out_<unit>.
  assert.match(lib, /fn passed_out\(output: &mut Vec<u8>, value: binding_core::Passthrough\) \{\n {4}uint_out\(output, value\.into_handle\(\)\.raw\(\)\);\n\}/);
  assert.match(lib, /\n\s+passed_out\(output, result\);\n/);
  // A class that only a function takes has no conversion in (T-5).
  assert.doesNotMatch(lib, /\bfn in_scope\b/);
  // The declarations: a func of the scope that returns any value and an error, and the member returns any value.
  const pkg = text(out, 'packages/go/zz_generated_sample.go');
  assert.match(pkg, /func \(this \*Store\) Transaction\(work func\(\*Scope\) \(any, error\)\) \(any, error\) \{/);
  // The func is a callback of the call: its dispatch decodes the class argument as a new instance and calls it.
  assert.match(pkg, /\tcall := binding\.NewCall\(\)\n\tdefer call\.Close\(\)\n\tenc := binding\.NewWriter\(\)\n\tenc\.Uint\(this\.handle\(\)\)\n\tif work == nil \{\n\t\tenc\.Tag\(false\)\n\t\} else \{\n\t\tenc\.Tag\(true\)\n\t\tcall\.Callback\(enc, binding\.Function\(func\(dec \*binding\.Reader\) \(any, error\) \{\n\t\t\tvar arg0 \*Scope\n\t\t\targ0 = newScope\(dec\.Uint\(\)\)\n\t\t\tif err := dec\.Finish\(\); err != nil \{\n\t\t\t\treturn nil, err\n\t\t\t\}\n\t\t\treturn work\(arg0\)\n\t\t\}\)\)\n\t\}\n/);
  assert.match(pkg, /\tvar value0 any\n\tvalue0 = dec\.Passed\(\)\n/);
  const binding = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
  // B-3: the table keeps each value under a handle that is a count, behind a mutex.
  assert.match(binding, /type passedTable struct \{\n\tmutex {2}sync\.Mutex\n\tvalues map\[uint64\]any\n\tnext {3}uint64\n\}/);
  assert.match(binding, /func pass\(value any\) uint64 \{\n\tpassed\.mutex\.Lock\(\)\n\tdefer passed\.mutex\.Unlock\(\)\n\tpassed\.next\+\+\n\tpassed\.values\[passed\.next\] = value\n\treturn passed\.next\n\}/);
  assert.match(binding, /\/\/export polyspec_sample__go_release_passed\nfunc polyspec_sample__go_release_passed\(handle C\.uint64_t\) \{\n\ttakePassed\(uint64\(handle\)\)\n\}/);
  // A result whose handle names no value is kind internal.
  assert.match(binding, /func \(r \*Reader\) Passed\(\) any \{\n\thandle := r\.Uint\(\)\n\tif r\.failed \{\n\t\treturn nil\n\t\}\n\tvalue, ok := takePassed\(handle\)\n\tif !ok \{\n\t\tr\.failed = true\n\t\tif r\.problem == "" \{\n\t\t\tr\.problem = "GN-6ae: the value of the passthrough is gone"\n\t\t\}\n\t\}\n\treturn value\n\}/);
  // The dispatch of a func holds what it returned; the call recovers its panic, which the member panics with again.
  assert.match(binding, /func Function\(run func\(dec \*Reader\) \(any, error\)\) Callback \{\n\treturn func\(_ \*Call, _ uint32, dec \*Reader, enc \*Writer\) error \{\n\t\tvalue, err := run\(dec\)\n\t\tif err != nil \{\n\t\t\treturn err\n\t\t\}\n\t\tenc\.Uint\(pass\(value\)\)\n\t\treturn nil\n\t\}\n\}/);
  assert.match(binding, /\tif p, ok := c\.raised\[index\]\.\(\*panicked\); ok \{\n\t\tpanic\(p\.value\)\n\t\}\n\treturn c\.raised\[index\]\n/);
  // The trampoline of the callbacks is exported for a contract whose only Go code is a func.
  assert.match(binding, /\/\/export polyspec_sample__go_callback\n/);
  // The tests of the table: a handle is never given again, and a handle that names no value is kind internal.
  const table = text(out, 'packages/go/internal/binding/zz_generated_passed_test.go');
  assert.match(table, /func TestGN6aeAHandleOfThePassthroughTableIsNeverGivenAgain\(t \*testing\.T\) \{/);
  assert.match(table, /func TestGN6aeAResultWhoseHandleNamesNoValueIsKindInternal\(t \*testing\.T\) \{/);
});

test('the Go test writes a function fixture as a func, the error of raises callback and the calls of after (GN-6ae, CK-22)', () => {
  const tests = text(scopedSample(['go']), 'packages/go/zz_generated_test.go');
  // A step calls a method on the argument at its position and returns its error; the func returns its result, a value
  // of GN-13, and after observes the receiver.
  assert.match(tests, /func TestGN13eStoreTransactionTheEntriesOfAFunctionThatReturnsAreCommitted\(t \*testing\.T\) \{\n\tmade0, failure1 := NewStore\(\)\n\tif failure1 != nil \{\n\t\tt\.Fatalf\("GN-13f: %v", failure1\)\n\t\}\n\tfunction2 := func\(arg0 \*Scope\) \(any, error\) \{\n\t\tif err := arg0\.Put\("a", "1"\); err != nil \{\n\t\t\treturn nil, err\n\t\t\}\n\t\t\{\n\t\t\tvalue0, err := arg0\.Get\("a"\)\n\t\t\tif err != nil \{\n\t\t\t\treturn nil, err\n\t\t\t\}\n\t\t\tif want := \(\*string\)\(ptr\("1"\)\); !reflect\.DeepEqual\(value0, want\) \{\n\t\t\t\treturn nil, fmt\.Errorf\("GN-6ae: scope\.get returned %#v, not %#v", value0, want\)\n\t\t\t\}\n\t\t\}\n\t\treturn "done", nil\n\t\}\n\tvalue0, err := made0\.Transaction\(function2\)\n\tif err != nil \{\n\t\tt\.Fatalf\("GN-13e: %v", err\)\n\t\}\n\tif want := \(any\)\("done"\); !reflect\.DeepEqual\(value0, want\) \{\n\t\tt\.Fatalf\("GN-13e: %#v is not %#v", value0, want\)\n\t\}\n\t\{\n\t\tvalue0, err := made0\.Get\("a"\)\n\t\tif err != nil \{\n\t\t\tt\.Fatalf\("GN-6ae: after: %v", err\)\n\t\t\}\n\t\tif want := \(\*string\)\(ptr\("1"\)\); !reflect\.DeepEqual\(value0, want\) \{\n\t\t\tt\.Fatalf\("GN-6ae: after: %#v is not %#v", value0, want\)\n\t\t\}\n\t\}\n\}/);
  // An argument of a function type of a step is again a function fixture, a func of the func.
  assert.match(tests, /\n\t\tfunction\d+ := func\(arg0 \*Scope\) \(any, error\) \{\n(?:\t\t\t[^\n]*\n)*?\t\t\tif err := arg0\.Put\("b", "2"\); err != nil \{\n\t\t\t\treturn nil, err\n\t\t\t\}\n(?:\t\t\t[^\n]*\n)*?\t\t\treturn nil, nil\n\t\t\}\n\t\tif _, err := arg0\.Nested\(function\d+\); err != nil \{\n\t\t\treturn nil, err\n\t\t\}\n(?:\t\t[^\n]*\n)*?\t\treturn int64\(2\), nil\n\t\}\n/);
  // A fixture with awaits is the same func: Go has no awaitable, and the driver settles its value at once.
  assert.match(tests, /func TestGN13eStoreTransactionTheEntriesOfAFunctionThatAwaitsAreCommitted\(t \*testing\.T\) \{\n(?:[^\n]*\n)*?\t\treturn "awaited", nil\n\t\}\n\tvalue0, err := made\d+\.Transaction\(function\d+\)\n/);
  assert.match(tests, /func TestGN6aeStoreTransactionTheEntriesOfAnAwaitableThatRaisesAreDropped\(t \*testing\.T\) \{\n\traised := errors\.New\("raised by the function of the case"\)\n/);
  // raises "callback": the func returns the error that the test holds, the caller gets the same error value, and
  // after observes the receiver after the failed call.
  assert.match(tests, /func TestGN6aeStoreTransactionTheEntriesOfAFunctionThatRaisesAreDropped\(t \*testing\.T\) \{\n\traised := errors\.New\("raised by the function of the case"\)\n(?:[^\n]*\n)*?\t\treturn nil, raised\n\t\}\n\t_, err := made\d+\.Transaction\(function\d+\)\n\tif err != raised \{\n\t\tt\.Fatalf\("GN-6ae: %#v is not the error of the function", err\)\n\t\}\n\t\{\n\t\tvalue0, err := made\d+\.Get\("a"\)\n\t\tif err != nil \{\n\t\t\tt\.Fatalf\("GN-6ae: after: %v", err\)\n\t\t\}\n\t\tif want := \(\*string\)\(nil\); !reflect\.DeepEqual\(value0, want\) \{/);
  // A nil func is kind invalid_callback.
  assert.match(tests, /func TestGN6aeStoreTransactionRefusesANilWork\(t \*testing\.T\) \{\n(?:[^\n]*\n)*?\t_, err := made\d+\.Transaction\(nil\)\n\tif failure, ok := err\.\(\*liberrors\.SampleTypeError\); !ok \|\| failure\.Kind\(\) != "invalid_callback" \{/);
  // A panic of the func ends the core as an error does, and the member panics with the same value.
  assert.match(tests, /func TestGN6aeStoreTransactionPanicsWithThePanicOfWork\(t \*testing\.T\) \{\n\traised := errors\.New\("raised by the function of the case"\)\n(?:[^\n]*\n)*?\tdefer func\(\) \{\n\t\tif value := recover\(\); value != any\(raised\) \{\n\t\t\tt\.Fatalf\("GN-6ae: %#v is not the panic of the function", value\)\n\t\t\}\n\t\}\(\)\n\t_, err := made\d+\.Transaction\(func\(_ \*Scope\) \(any, error\) \{ panic\(raised\) \}\)\n\tt\.Fatalf\("GN-6ae: the call returned %v", err\)\n\}/);
});

test('a test generator that does not write after and raises callback refuses the cases that name them (GN-6ae, G-4)', async () => {
  const { refuseScopedCases } = await import('../src/generate/samples.ts');
  const model = (cases: unknown[]): any => ({ cases: new Map([['store.transaction', cases]]) });
  assert.doesNotThrow(() => refuseScopedCases(model([{ id: 'a', result: null }, { id: 'b', raises: { kind: 'missing' } }]), 'Python'));
  assert.throws(() => refuseScopedCases(model([{ id: 'a', after: [] }]), 'Python'), /the case a of store\.transaction: after and raises "callback" are not written in the test of Python yet \(GN-6ae\)/);
  assert.throws(() => refuseScopedCases(model([{ id: 'b', raises: 'callback' }]), 'Go'), /the case b of store\.transaction: after and raises "callback" are not written in the test of Go yet \(GN-6ae\)/);
});


test('Node makes a closure of a function that the machine owns, holds its value in the passthrough table and returns it unchanged (GN-6ae)', () => {
  const out = scopedSample(['node']);
  const lib = text(out, 'packages/ts/generated/lib.rs');
  // The function is checked when it enters (kind invalid_callback), and the machine owns a reference of napi to it.
  assert.match(lib, /let work = callable_in\(env, work, "work"\)\?;/);
  assert.match(lib, /fn callable_in\(env: &Env, value: Unknown<'_>, subject: &str\) -> Result<Owned, Fail> \{\n {4}if value\.get_type\(\)\.map_err\(internal\)\? != ValueType::Function \{\n {8}return Err\(binding_error\(BindingError::InvalidCallback \{ subject: subject\.to_owned\(\), member: String::new\(\) \}\)\);\n {4}\}\n {4}Owned::new\(env, value\)\n\}/);
  // The closure makes a new instance of the class of each class argument, calls the function on the JavaScript thread
  // of its reference and stores what it returned in the table; an exception of the function is a Raised.
  assert.match(lib, /let work = move \|arg0: polyspec_sample::Scope\| -> Result<binding_core::Passthrough, binding_core::Failure<polyspec_sample::Error>> \{\n\s+let env = &Env::from_raw\(work\.env\);\n\s+let call = \|\| -> Result<binding_core::Passthrough, Thrown> \{\n\s+let arg0 = out_scope\(env, arg0\)\.map_err\(Thrown::Binding\)\?;\n\s+let returned = called\(env, &work, &\[arg0\]\)\?;\n\s+pass\(env, returned\)\.map_err\(Thrown::Binding\)\n\s+\};\n\s+call\(\)\.map_err\(thrown\)\n\s+\};/);
  // The exception of the function leaves the environment and is held, so the machine goes on with none pending, and
  // failure_error throws the held value again: the caller gets the same object.
  assert.match(lib, /let status = unsafe \{ napi::sys::napi_call_function\(env\.raw\(\), receiver\.raw\(\), function\.raw\(\), raw\.len\(\), raw\.as_ptr\(\), &mut returned\) \};/);
  assert.match(lib, /napi::sys::napi_get_and_clear_last_exception\(env\.raw\(\), &mut exception\)[\s\S]*?Ok\(held\) => Err\(Thrown::Held\(held\)\),/);
  assert.match(lib, /Some\(Thrown::Held\(exception\)\) => thrown_again\(&exception\),/);
  assert.match(lib, /fn thrown_again\(exception: &Owned\) -> Fail \{[\s\S]*?napi::sys::napi_throw\(env\.raw\(\), value\.raw\(\)\)[\s\S]*?Fail \{ thrown: Some\(napi::Error::new\(napi::Status::PendingException, String::new\(\)\)\), \.\.binding_error\(BindingError::Internal \{ detail: String::new\(\) \}\) \}\n\}/);
  // A value of any type is held as the one element of an array, which a reference of Node-API version 8 takes.
  assert.match(lib, /fn boxed\(env: &Env, value: Unknown<'_>\) -> Result<Self, Fail> \{\n {8}Self::new\(env, tuple_out\(env, vec!\[value\]\)\?\)\n {4}\}/);
  assert.match(lib, /fn unboxed<'env>\(&self, env: &'env Env\) -> Result<Unknown<'env>, Fail> \{\n {8}let \[value\] = tuple_in\(self\.value\(env\)\?, "a held value"\)\?;\n {8}Ok\(value\)\n {4}\}/);
  // A contract without a callback that a machine owns has no dead method of Owned, and one with it has the method.
  const owned = (crate: string): string => crate.slice(crate.indexOf('struct Owned {'), crate.indexOf('impl Drop for Owned {'));
  assert.match(owned(lib), /fn object</);
  const alone = text(scopedSample(['node'], (c) => { for (const unit of c.units) unit.members = (unit.members ?? []).filter((m: any) => m.id !== 'sample.resolve_driven'); c.cases = c.cases.filter((k: any) => k.member !== 'sample.resolve_driven'); }), 'packages/ts/generated/lib.rs');
  assert.match(owned(alone), /fn boxed\(/);
  assert.doesNotMatch(owned(alone), /fn object</);
  // The machine takes a clone of the value of the instance, which the call borrows from its guard, and the closure.
  assert.match(lib, /let receiver = self\.inner\.read\("Store", &\[\]\)\.map_err\(binding_error\)\?;\n\s+let receiver = &\*receiver;\n\s+let mut machine = binding_core::machine::Driving::new\(polyspec_sample::Store::transaction\(Clone::clone\(receiver\), work\)\);/);
  // B-3: the table of the values, its release function, and the result that leaves the table unchanged.
  assert.match(lib, /static PASSED: RefCell<BTreeMap<u64, Owned>> = const \{ RefCell::new\(BTreeMap::new\(\)\) \};/);
  assert.match(lib, /fn pass\(env: &Env, value: Unknown<'_>\) -> Result<binding_core::Passthrough, Fail> \{\n {4}let held = Owned::boxed\(env, value\)\?;\n {4}let handle = NEXT_PASSED\.fetch_add\(1, Ordering::Relaxed\);\n {4}PASSED\.with_borrow_mut\(\|map\| map\.insert\(handle, held\)\);\n {4}Ok\(binding_core::Passthrough::from_generated\(binding_core::Handle::new\(handle\), release_passed\)\)\n\}/);
  assert.match(lib, /fn release_passed\(handle: binding_core::Handle\) \{\n {4}let gone = PASSED\.try_with\(\|map\| map\.borrow_mut\(\)\.remove\(&handle\.raw\(\)\)\);\n {4}drop\(gone\);\n\}/);
  // A result whose handle names no value is kind internal.
  assert.match(lib, /fn passed_out\(env: &Env, value: binding_core::Passthrough\) -> Result<Unknown<'_>, Fail> \{\n {4}let handle = value\.into_handle\(\);\n {4}let held = PASSED\n {8}\.with_borrow_mut\(\|map\| map\.remove\(&handle\.raw\(\)\)\)\n {8}\.ok_or_else\(\|\| binding_error\(BindingError::Internal \{ detail: String::from\("GN-6ae: the value of the passthrough is gone"\) \}\)\)\?;\n {4}held\.unboxed\(env\)\n\}/);
  // Await: an advance takes the outcome of the value that the machine awaited, only after that value, gives it to the
  // machine before it resumes, and returns the step of what it stops at: a wait (0), an awaited value (1), the end (2).
  assert.match(lib, /let mut awaiting = false;\n\s+Driven::start\(env, advancing\(move \|env, settled\| \{\n\s+match \(awaiting, outcome_of\(env, settled\)\?\) \{\n\s+\(true, Some\(outcome\)\) => machine\.settle\(outcome\),\n\s+\(false, None\) => \{\}\n\s+\(true, None\) \| \(false, Some\(_\)\) => \{\n\s+return Err\(binding_error\(BindingError::Internal \{ detail: String::from\("GN-6ae: store\.transaction takes the outcome of an awaited value after that value, and at no other advance"\) \}\)\);\n\s+\}\n\s+\}\n\s+awaiting = false;/);
  assert.match(lib, /Ok\(\(0, promise\)\)\n\s+\}\n\s+binding_core::machine::Next::Await\(value\) => \{\n\s+awaiting = true;\n\s+Ok\(\(1, passed_out\(env, value\)\?\)\)\n\s+\}\n\s+binding_core::machine::Next::Done\(result\) => \{\n\s+let result = result\.map_err\(failure_error\)\?;\n\s+Ok\(\(2, passed_out\(env, result\)\?\)\)/);
  // A fulfilled value enters the table again, and a rejection is held as the exception of the function.
  assert.match(lib, /fn outcome_of\(env: &Env, settled: Unknown<'_>\) -> Result<Option<Result<binding_core::Passthrough, binding_core::Raised>>, Fail> \{\n {4}if settled\.get_type\(\)\.map_err\(internal\)\? == ValueType::Undefined \{\n {8}return Ok\(None\);\n {4}\}\n {4}let \[fulfilled, value\] = tuple_in\(settled, "settled"\)\?;\n {4}if bool_in\(fulfilled, "settled"\)\? \{\n {8}return Ok\(Some\(Ok\(pass\(env, value\)\?\)\)\);\n {4}\}\n {4}Ok\(Some\(Err\(raised\(Thrown::Held\(Owned::boxed\(env, value\)\?\)\)\)\)\)\n\}/);
  assert.match(lib, /pub fn advance<'env>\(&mut self, env: &'env Env, settled: Unknown<'env>\) -> napi::Result<Unknown<'env>> \{\n\s+guard\(\|\| shielded\(\|\| \{\n\s+let \(step, value\) = \(self\.advance\)\(env, settled\)\?;\n\s+tuple_out\(env, vec!\[uint_out\(env, step\)\?, value\]\)/);
  // The entry passes the function as it is, and the declarations name the passthrough as a type parameter.
  assert.match(text(out, 'packages/ts/generated/index.cjs'), /return drive\(Reflect\.apply\(original, this, \[args\[0\]\]\)\);/);
  const dts = text(out, 'packages/ts/generated/index.d.ts');
  assert.match(dts, /export declare class Store \{\n {2}constructor\(\);\n {2}get\(key: string\): string \| null;\n {2}transaction<T>\(work: \(arg0: Scope\) => T\): Promise<Awaited<T>>;\n {2}static once<T>\(work: \(arg0: Scope\) => T\): Promise<Awaited<T>>;\n {2}audited<T>\(work: \(arg0: Scope\) => T\): Promise<Awaited<T>>;\n {2}attempt<T>\(work: \(arg0: Scope\) => T\): Promise<boolean>;\n\}/);
  assert.match(dts, /\n {2}nested<T>\(work: \(arg0: Scope\) => T\): Promise<Awaited<T>>;\n/);
  // A contract without a function parameter has no table, and its machine takes no outcome.
  const plain = text(generateTargets({ contract: JSON.parse(readFileSync(new URL('./fixtures/repo/packages/rust/interface.json', import.meta.url), 'utf8')), version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map([['contracts/cases.json', JSON.parse(readFileSync(new URL('./fixtures/repo/contracts/cases.json', import.meta.url), 'utf8'))]]), targets: ['node'] }), 'packages/ts/generated/lib.rs');
  assert.doesNotMatch(plain, /PASSED|Thrown::Held|fn boxed|outcome_of/);
});

// GN-6ae: the function drive of a generated JavaScript entry, run against a machine that the test plays: each advance
// records the outcome that it got and gives the next step of the script.
function driveOf(entry: string, pattern: RegExp): (...args: unknown[]) => Promise<unknown> {
  const source = pattern.exec(entry)?.[0];
  assert.notEqual(source, undefined, 'the entry has the function drive');
  return new Function(`${source}\nreturn drive;`)() as (...args: unknown[]) => Promise<unknown>;
}

function played(steps: [number, unknown][]): { advance: (settled: unknown) => [number, unknown]; got: unknown[] } {
  const got: unknown[] = [];
  let at = 0;
  return {
    got,
    advance(settled: unknown): [number, unknown] {
      got.push(settled);
      const step = steps[at];
      at += 1;
      if (step === undefined) throw new Error('the machine was advanced after its end');
      return step;
    },
  };
}

test('the Node entry awaits what the function returned and tells a rejected wait from a rejected awaited value (GN-6ae)', async () => {
  const drive = driveOf(text(scopedSample(['node']), 'packages/ts/generated/index.cjs'), /async function drive\(driven\) \{\n[\s\S]*?\n\}\n/);
  // A wait gives no outcome; a value that is no thenable, a promise and a thenable are awaited, and the next advance
  // gets [true, value] of each.
  const kept = { kept: true };
  const thenable = { then(resolve: (value: unknown) => void): void { resolve('then'); } };
  const values = played([[0, Promise.resolve('output')], [1, kept], [1, Promise.resolve(7)], [1, thenable], [0, Promise.resolve()], [2, 'done']]);
  assert.equal(await drive(values), 'done');
  assert.deepEqual(values.got, [undefined, undefined, [true, kept], [true, 7], [true, 'then'], undefined]);
  assert.equal((values.got[2] as unknown[])[1], kept);
  // A rejection of an awaited value is the outcome of the function: the next advance gets [false, the same object],
  // and what the machine then gives is the result of the call.
  const reason = new Error('rejected by the function');
  const rejected = played([[1, Promise.reject(reason)], [0, Promise.resolve()], [2, 'rolled back']]);
  assert.equal(await drive(rejected), 'rolled back');
  assert.equal(rejected.got.length, 3);
  assert.deepEqual(rejected.got[1], [false, reason]);
  assert.equal((rejected.got[1] as unknown[])[1], reason);
  // A rejection of the promise of a wait is a failure of the binding: it rejects the call with the same object, and
  // the machine is not advanced again.
  const failure = new Error('the wait failed');
  const failed = played([[0, Promise.reject(failure)], [2, 'never']]);
  await assert.rejects(() => drive(failed), (error) => error === failure);
  assert.deepEqual(failed.got, [undefined]);
  // The same rejected promise at the two steps: the step decides, not the value.
  const same = (): Promise<never> => Promise.reject(failure);
  const awaited = played([[1, same()], [2, 'answered']]);
  assert.equal(await drive(awaited), 'answered');
  assert.deepEqual(awaited.got, [undefined, [false, failure]]);
  // A failure that an advance throws rejects the call with the same object.
  const thrown = new Error('thrown by the advance');
  await assert.rejects(() => drive({ advance() { throw thrown; } }), (error) => error === thrown);
});

test('the Node test writes a function fixture, the exception of raises callback and the calls of after (GN-6ae, CK-22)', () => {
  const tests = text(scopedSample(['node']), 'packages/ts/generated/tests/generated.test.mjs');
  const has = (lines: string): void => assert.ok(tests.includes(lines), lines);
  // A step calls a method on the argument at its position, and a step that names a result requires it inside the
  // function (CK-22); the function returns its result, a value of GN-13; after observes the receiver of the case.
  has(`test('GN-13e: Store.transaction the_entries_of_a_function_that_returns_are_committed', async () => {
  const receiver = new pkg.Store();
  assert.deepStrictEqual(ordered((await receiver.transaction((...args) => { args[0].put('a', '1'); assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); return 'done'; }))), ordered('done'));
  assert.deepStrictEqual(ordered(receiver.get('a')), ordered('1'));
  assert.equal(addon().__thrownCount(), 0);
});`);
  // An argument of a function type of a step is again a function fixture, and a function whose step calls a member
  // that waits is async, so the member awaits the promise that it returns.
  has(`receiver.transaction(async (...args) => { args[0].put('a', '1'); (await args[0].nested((...args) => { assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); args[0].put('b', '2'); assert.deepStrictEqual(ordered(args[0].get('b')), ordered('2')); return null; })); assert.deepStrictEqual(ordered(args[0].get('b')), ordered('2')); return 2; })`);
  // awaits: the function is async also where no step of it waits, so the member awaits its promise.
  has(`(await args[0].nested(async (...args) => { args[0].put('b', '2'); assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); return null; }));`);
  // raises "callback": the function throws the exception that the test holds, the caller gets the same object, and
  // after observes the receiver after the failed call.
  has(`test('GN-6ae: Store.transaction the_entries_of_a_function_that_raises_are_dropped', async () => {
  const receiver = new pkg.Store();
  const raised = new Error('raised by the function of the case');
  await assert.rejects(async () => (await receiver.transaction((...args) => { args[0].put('a', '1'); assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); throw raised; })), (error) => error === raised);
  assert.deepStrictEqual(ordered(receiver.get('a')), ordered(null));
  assert.equal(addon().__thrownCount(), 0);
});`);
  // awaits with a raise: the promise of the async function rejects with the exception, which the caller gets.
  has(`test('GN-6ae: Store.transaction the_entries_of_an_awaitable_that_raises_are_dropped', async () => {
  const receiver = new pkg.Store();
  const raised = new Error('raised by the function of the case');
  await assert.rejects(async () => (await receiver.transaction(async (...args) => { args[0].put('a', '1'); assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); throw raised; })), (error) => error === raised);
  assert.deepStrictEqual(ordered(receiver.get('a')), ordered(null));
  assert.equal(addon().__thrownCount(), 0);
});`);
  // A value that is no function is kind invalid_callback.
  has(`test('GN-6ae: Store.transaction refuses a work that is no function', async () => {
  await assert.rejects(async () => (await new pkg.Store().transaction(1)), (error) => error.constructor === pkg.SampleTypeError && error.kind === 'invalid_callback');
});`);
  // No test of a block that awaits is left a plain function.
  for (const found of tests.matchAll(/\ntest\('[^\n]*', \(\) => \{\n((?:(?!\n\}\);)[\s\S])*)\n\}\);/g)) assert.doesNotMatch(found[1] ?? '', /\bawait /, found[0]);
});

test('WASM makes a closure of a function that the machine owns, holds its value in the passthrough table and returns it unchanged (GN-6ae)', () => {
  const out = scopedSample(['wasm']);
  const lib = text(out, 'packages/ts/wasm/generated/lib.rs');
  // The function is checked when it enters (kind invalid_callback), and the machine owns it as a value of the module.
  assert.match(lib, /let work = callable_in\(&work, "work"\)\?;/);
  assert.match(lib, /fn callable_in\(value: &JsValue, subject: &str\) -> Result<Function, Fail> \{\n {4}value\n {8}\.dyn_ref::<Function>\(\)\n {8}\.cloned\(\)\n {8}\.ok_or_else\(\|\| binding_error\(BindingError::InvalidCallback \{ subject: subject\.to_owned\(\), member: String::new\(\) \}\)\)\n\}/);
  // The closure makes a new instance of the class of each class argument, calls the function with the receiver
  // undefined and stores what it returned in the table; the value that the function threw is a Raised.
  assert.match(lib, /let work = move \|arg0: polyspec_sample::Scope\| -> Result<binding_core::Passthrough, binding_core::Failure<polyspec_sample::Error>> \{\n\s+let call = \|\| -> Result<binding_core::Passthrough, Thrown> \{\n\s+let args: Array = \[out_scope\(arg0\)\.map_err\(Thrown::Binding\)\?\]\.iter\(\)\.collect\(\);\n\s+let returned = work\.apply\(&JsValue::UNDEFINED, &args\)\.map_err\(Thrown::Js\)\?;\n\s+Ok\(pass\(returned\)\)\n\s+\};\n\s+call\(\)\.map_err\(thrown\)\n\s+\};/);
  assert.match(lib, /Some\(Thrown::Js\(error\)\) => Fail \{ thrown: Some\(error\), \.\.binding_error\(BindingError::Internal \{ detail: String::new\(\) \}\) \},/);
  // The machine takes a clone of the value of the instance and the closure.
  assert.match(lib, /let mut machine = binding_core::machine::Driving::new\(polyspec_sample::Store::transaction\(Clone::clone\([^\n]*\), work\)\);/);
  // B-3: the table of the values, its release function, and the result that leaves the table unchanged.
  assert.match(lib, /static PASSED: RefCell<BTreeMap<u64, JsValue>> = const \{ RefCell::new\(BTreeMap::new\(\)\) \};/);
  assert.match(lib, /fn pass\(value: JsValue\) -> binding_core::Passthrough \{\n {4}let handle = NEXT_PASSED\.fetch_add\(1, Ordering::Relaxed\);\n {4}PASSED\.with_borrow_mut\(\|map\| map\.insert\(handle, value\)\);\n {4}binding_core::Passthrough::from_generated\(binding_core::Handle::new\(handle\), release_passed\)\n\}/);
  assert.match(lib, /fn release_passed\(handle: binding_core::Handle\) \{\n {4}let gone = PASSED\.try_with\(\|map\| map\.borrow_mut\(\)\.remove\(&handle\.raw\(\)\)\);\n {4}drop\(gone\);\n\}/);
  // A result whose handle names no value is kind internal.
  assert.match(lib, /fn passed_out\(value: binding_core::Passthrough\) -> Result<JsValue, Fail> \{\n {4}let handle = value\.into_handle\(\);\n {4}PASSED\n {8}\.with_borrow_mut\(\|map\| map\.remove\(&handle\.raw\(\)\)\)\n {8}\.ok_or_else\(\|\| binding_error\(BindingError::Internal \{ detail: String::from\("GN-6ae: the value of the passthrough is gone"\) \}\)\)\n\}/);
  // Await: an advance takes the outcome of the value that the machine awaited, only after that value, gives it to the
  // machine before it resumes, and returns the step of what it stops at: a wait (0), an awaited value (1), the end (2).
  assert.match(lib, /let mut awaiting = false;\n\s+Ok\(JsValue::from\(Driven::new\(move \|settled\| \{\n\s+match \(awaiting, outcome_of\(&settled\)\?\) \{\n\s+\(true, Some\(outcome\)\) => machine\.settle\(outcome\),\n\s+\(false, None\) => \{\}\n\s+\(true, None\) \| \(false, Some\(_\)\) => \{\n\s+return Err\(binding_error\(BindingError::Internal \{ detail: String::from\("GN-6ae: store\.transaction takes the outcome of an awaited value after that value, and at no other advance"\) \}\)\);\n\s+\}\n\s+\}\n\s+awaiting = false;/);
  assert.match(lib, /Ok\(\(0, promise\)\)\n\s+\}\n\s+binding_core::machine::Next::Await\(value\) => \{\n\s+awaiting = true;\n\s+Ok\(\(1, passed_out\(value\)\?\)\)\n\s+\}\n\s+binding_core::machine::Next::Done\(result\) => \{\n\s+let result = result\.map_err\(failure_error\)\?;\n\s+Ok\(\(2, passed_out\(result\)\?\)\)/);
  // A fulfilled value enters the table again, and a rejection is kept as the exception of the function.
  assert.match(lib, /fn outcome_of\(settled: &JsValue\) -> Result<Option<Result<binding_core::Passthrough, binding_core::Raised>>, Fail> \{\n {4}if settled\.is_undefined\(\) \{\n {8}return Ok\(None\);\n {4}\}\n {4}let \[fulfilled, value\] = tuple_in\(settled, "settled"\)\?;\n {4}if bool_in\(&fulfilled, "settled"\)\? \{\n {8}return Ok\(Some\(Ok\(pass\(value\)\)\)\);\n {4}\}\n {4}Ok\(Some\(Err\(raised\(Thrown::Js\(value\)\)\)\)\)\n\}/);
  assert.match(lib, /pub fn advance\(&mut self, settled: JsValue\) -> Result<JsValue, JsValue> \{\n\s+guard\(\|\| shielded\(\|\| \{\n\s+let \(step, value\) = \(self\.advance\)\(settled\)\?;\n\s+tuple_out\(&\[JsValue::from\(step\), value\]\)/);
  // The entry passes the function as it is, and the declarations name the passthrough as a type parameter.
  const mjs = text(out, 'packages/ts/wasm/generated/index.mjs');
  assert.match(mjs, /return drive\(SampleInternalError, enter\(SampleInternalError, \(\) => glue\.__Store_transaction\(this\.#handle, args\[0\]\)\)\);/);
  const dts = text(out, 'packages/ts/wasm/generated/index.d.ts');
  assert.match(dts, /\n {2}transaction<T>\(work: \(arg0: Scope\) => T\): Promise<Awaited<T>>;\n/);
  assert.match(dts, /\n {2}nested<T>\(work: \(arg0: Scope\) => T\): Promise<Awaited<T>>;\n/);
  // A contract without a function parameter has no table.
  const plain = text(generateTargets({ contract: JSON.parse(readFileSync(new URL('./fixtures/repo/packages/rust/interface.json', import.meta.url), 'utf8')), version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map([['contracts/cases.json', JSON.parse(readFileSync(new URL('./fixtures/repo/contracts/cases.json', import.meta.url), 'utf8'))]]), targets: ['wasm'] }), 'packages/ts/wasm/generated/lib.rs');
  assert.doesNotMatch(plain, /PASSED|outcome_of|fn callable_in/);
});

test('the WASM entry awaits what the function returned, tells a rejected wait from a rejected awaited value and frees the machine (GN-6ae)', async () => {
  const mjs = text(scopedSample(['wasm']), 'packages/ts/wasm/generated/index.mjs');
  const source = /async function drive\(Internal, driven\) \{\n[\s\S]*?\n\}\n/.exec(mjs)?.[0];
  assert.notEqual(source, undefined, 'the entry has the function drive');
  // enter of state.mjs runs the call of the module; the test counts the advances that ran through it.
  let entered = 0;
  const enter = (_internal: unknown, call: () => unknown): unknown => { entered += 1; return call(); };
  const drive = new Function('enter', `${source}\nreturn drive;`)(enter) as (internal: unknown, driven: unknown) => Promise<unknown>;
  const machine = (steps: [number, unknown][]): ReturnType<typeof played> & { freed: number; free: () => void } => {
    const made = { ...played(steps), freed: 0, free(): void { made.freed += 1; } };
    return made;
  };
  const kept = { kept: true };
  const thenable = { then(resolve: (value: unknown) => void): void { resolve('then'); } };
  const values = machine([[0, Promise.resolve('output')], [1, kept], [1, Promise.resolve(7)], [1, thenable], [0, Promise.resolve()], [2, 'done']]);
  assert.equal(await drive(Error, values), 'done');
  assert.deepEqual(values.got, [undefined, undefined, [true, kept], [true, 7], [true, 'then'], undefined]);
  assert.equal((values.got[2] as unknown[])[1], kept);
  assert.equal(entered, 6);
  assert.equal(values.freed, 1);
  // A rejection of an awaited value is the outcome of the function, with the same object.
  const reason = new Error('rejected by the function');
  const rejected = machine([[1, Promise.reject(reason)], [0, Promise.resolve()], [2, 'rolled back']]);
  assert.equal(await drive(Error, rejected), 'rolled back');
  assert.deepEqual(rejected.got[1], [false, reason]);
  assert.equal((rejected.got[1] as unknown[])[1], reason);
  assert.equal(rejected.freed, 1);
  // A rejection of the promise of a wait rejects the call; the machine is not advanced again and is freed.
  const failure = new Error('the wait failed');
  const failed = machine([[0, Promise.reject(failure)], [2, 'never']]);
  await assert.rejects(() => drive(Error, failed), (error) => error === failure);
  assert.deepEqual(failed.got, [undefined]);
  assert.equal(failed.freed, 1);
  // The same rejected promise at step 1 is an outcome: the step decides, not the value.
  const awaited = machine([[1, Promise.reject(failure)], [2, 'answered']]);
  assert.equal(await drive(Error, awaited), 'answered');
  assert.deepEqual(awaited.got, [undefined, [false, failure]]);
  // A failure that an advance throws rejects the call with the same object, and the machine is freed.
  const thrown = new Error('thrown by the advance');
  const throwing = { freed: 0, advance(): never { throw thrown; }, free(): void { throwing.freed += 1; } };
  await assert.rejects(() => drive(Error, throwing), (error) => error === thrown);
  assert.equal(throwing.freed, 1);
});

test('the WASM test writes a function fixture, the exception of raises callback and the calls of after (GN-6ae, CK-22)', () => {
  const tests = text(scopedSample(['wasm']), 'packages/ts/wasm/generated/tests/generated.test.mjs');
  const has = (lines: string): void => assert.ok(tests.includes(lines), lines);
  // A step calls a method on the argument at its position, and a step that names a result requires it inside the
  // function (CK-22); the function returns its result, a value of GN-13; after observes the receiver of the case.
  has(`test('GN-13e: Store.transaction the_entries_of_a_function_that_returns_are_committed', async () => {
  const receiver = new pkg.Store();
  assert.deepStrictEqual(ordered((await receiver.transaction((...args) => { args[0].put('a', '1'); assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); return 'done'; }))), ordered('done'));
  assert.deepStrictEqual(ordered(receiver.get('a')), ordered('1'));
  assert.equal(stepGlue.__thrownCount(), 0);
});`);
  // An argument of a function type of a step is again a function fixture, and a function whose step calls a member
  // that waits is async, so the member awaits the promise that it returns.
  has(`receiver.transaction(async (...args) => { args[0].put('a', '1'); (await args[0].nested((...args) => { assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); args[0].put('b', '2'); assert.deepStrictEqual(ordered(args[0].get('b')), ordered('2')); return null; })); assert.deepStrictEqual(ordered(args[0].get('b')), ordered('2')); return 2; })`);
  // awaits: the function is async also where no step of it waits, so the member awaits its promise.
  has(`(await args[0].nested(async (...args) => { args[0].put('b', '2'); assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); return null; }));`);
  // raises "callback": the function throws the exception that the test holds, the caller gets the same object, and
  // after observes the receiver after the failed call.
  has(`test('GN-6ae: Store.transaction the_entries_of_a_function_that_raises_are_dropped', async () => {
  const receiver = new pkg.Store();
  const raised = new Error('raised by the function of the case');
  await assert.rejects(async () => (await receiver.transaction((...args) => { args[0].put('a', '1'); assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); throw raised; })), (error) => error === raised);
  assert.deepStrictEqual(ordered(receiver.get('a')), ordered(null));
  assert.equal(stepGlue.__thrownCount(), 0);
});`);
  // awaits with a raise: the promise of the async function rejects with the exception, which the caller gets.
  has(`test('GN-6ae: Store.transaction the_entries_of_an_awaitable_that_raises_are_dropped', async () => {
  const receiver = new pkg.Store();
  const raised = new Error('raised by the function of the case');
  await assert.rejects(async () => (await receiver.transaction(async (...args) => { args[0].put('a', '1'); assert.deepStrictEqual(ordered(args[0].get('a')), ordered('1')); throw raised; })), (error) => error === raised);
  assert.deepStrictEqual(ordered(receiver.get('a')), ordered(null));
  assert.equal(stepGlue.__thrownCount(), 0);
});`);
  // A value that is no function is kind invalid_callback.
  has(`test('GN-6ae: Store.transaction refuses a work that is no function', async () => {
  await assert.rejects(async () => (await new pkg.Store().transaction(1)), (error) => error.constructor === pkg.SampleTypeError && error.kind === 'invalid_callback');
});`);
  // No test of a block that awaits is left a plain function.
  for (const found of tests.matchAll(/\ntest\('[^\n]*', \(\) => \{\n((?:(?!\n\}\);)[\s\S])*)\n\}\);/g)) assert.doesNotMatch(found[1] ?? '', /\bawait /, found[0]);
});

test('a function fixture with awaits is a plain function in PHP, which has no awaitable (GN-6ae, CK-22)', () => {
  const tests = text(scopedSample(['php']), 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(tests, /public function testGn13eStoreTransactionTheEntriesOfAFunctionThatAwaitsAreCommitted\(\): void\n {4}\{\n {8}\$receiver = new \\Polyspec\\Sample\\Store\(\);\n {8}self::assertSame\(self::same\("awaited"\), self::same\(\$receiver->transaction\(function \(mixed \.\.\.\$args\): mixed \{ \$args\[0\]->put\("a", "1"\); \$args\[0\]->nested\(function \(mixed \.\.\.\$args\): mixed \{ \$args\[0\]->put\("b", "2"\); self::assertSame\(self::same\("1"\), self::same\(\$args\[0\]->get\("a"\)\)\); return null; \}\); self::assertSame\(self::same\("2"\), self::same\(\$args\[0\]->get\("b"\)\)\); return "awaited"; \}\)\)\);\n {8}self::assertSame\(self::same\("1"\), self::same\(\$receiver->get\("a"\)\)\);\n {8}self::assertSame\(self::same\("2"\), self::same\(\$receiver->get\("b"\)\)\);\n {8}self::assertSame\(0, \\Polyspec\\Sample\\Internal\\thrownCount\(\)\);\n {4}\}/);
  assert.match(tests, /public function testGn6aeStoreTransactionTheEntriesOfAnAwaitableThatRaisesAreDropped\(\): void\n/);
});

// GN-4c: the sample with units whose names are those of helpers of the generated crates: the enums default, callable
// and text, and a function that takes each and a parameter with a default.
const helperNamed = (contract: any): void => {
  const named = (id: string): any => ({ id, name: [id], module: '', kind: 'enum', visibility: 'public', origin: 'generated', core_type: `polyspec_sample::${id[0]?.toUpperCase() ?? ''}${id.slice(1)}`, variants: [{ name: ['plain'], value: 'plain' }] });
  contract.units.push(named('default'), named('callable'), named('text'));
  const functions = contract.units.find((u: any) => u.id === 'sample');
  functions.members.push({ id: 'sample.default_times', name: ['default', 'times'], kind: 'constant', visibility: 'public', type: 'uint', value: 1, core: 'polyspec_sample::DEFAULT_TIMES' });
  functions.members.push({
    id: 'sample.pick', name: ['pick'], kind: 'function', visibility: 'public', wait: 'none', raises: [], returns: { unit: 'default' }, core: 'polyspec_sample::pick',
    parameters: [
      { name: ['first'], type: { unit: 'default' }, required: true }, { name: ['second'], type: { unit: 'callable' }, required: true }, { name: ['third'], type: { unit: 'text' }, required: true },
      { name: ['times'], type: 'uint', default: { const: 'sample.default_times' }, default_core: 'polyspec_sample::DEFAULT_TIMES' },
    ],
  });
};
// The names of the functions of a generated crate, each with the number of its definitions; a definition under a cfg
// attribute, which another form of the crate may define again, is not counted.
const functionNames = (lib: string): Map<string, number> => {
  const names = new Map<string, number>();
  for (const [, attributes, name] of lib.matchAll(/^((?:(?:#\[|\/\/\/)[^\n]*\n)*)(?:pub )?(?:unsafe )?(?:extern "C" )?fn ([a-z0-9_]+)/gm)) {
    if (!/^#\[cfg\(/m.test(attributes ?? '')) names.set(name ?? '', (names.get(name ?? '') ?? 0) + 1);
  }
  return names;
};

test('no helper of a generated PHP crate has a name of the conversions of a unit, in_<unit> and out_<unit> (GN-4c)', () => {
  const lib = text(scopedSample(['php'], helperNamed), 'packages/php-ext/generated/lib.rs');
  const names = functionNames(lib);
  // The conversions of the units named default, callable and text are defined once each, beside the helpers of a
  // default, of a callable and of a text.
  for (const name of ['in_default', 'out_default', 'in_callable', 'in_text']) assert.equal(names.get(name), 1, name);
  assert.match(lib, /\/\/\/ T-6: a value of the enum is one of its cases; any other value is refused\.\nfn in_default\(value: &Zval, subject: &str\) -> Result<polyspec_sample::Default, Fail> \{/);
  assert.match(lib, /\nfn default_in<T>\(value: Option<&Zval>,/);
  assert.match(lib, /\nfn callable_in\(value: &Zval, subject: &str\) -> Result<Zval, Fail> \{/);
  assert.match(lib, /\nfn text_in\(value: &Zval, subject: &str\) -> Result<String, Fail> \{/);
  // Every function named in_<...> or out_<...> is the conversion of a unit of the contract.
  const units = new Set(['default', 'callable', 'text', 'tag', 'data', 'lookup', 'scope', 'counter', 'ledger', 'store', 'shelf', 'slip', 'search']);
  const others = [...names.keys()].filter((name) => /^(in|out)_/.test(name) && !units.has(name.replace(/^(in|out)_/, '')));
  assert.deepEqual(others, []);
});

test('no helper of a generated Python crate has a name of the conversions of a unit, in_<unit> and out_<unit> (GN-4c)', () => {
  const lib = text(scopedSample(['python'], helperNamed), 'packages/python/generated/lib.rs');
  const names = functionNames(lib);
  for (const name of ['in_default', 'out_default', 'in_callable', 'in_text']) assert.equal(names.get(name), 1, name);
  assert.match(lib, /\nfn in_default\(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str\) -> PyResult<polyspec_sample::Default> \{/);
  assert.match(lib, /\nfn default_in<'py, T>\(/);
  assert.match(lib, /\nfn callable_in\(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str\) -> PyResult<Py<PyAny>> \{/);
  assert.match(lib, /\nfn text_in\(/);
  const units = new Set(['default', 'callable', 'text', 'tag', 'data', 'lookup', 'scope', 'counter', 'ledger', 'store', 'shelf', 'slip', 'search']);
  const others = [...names.keys()].filter((name) => /^(in|out)_/.test(name) && !units.has(name.replace(/^(in|out)_/, '')));
  assert.deepEqual(others, []);
});

test('no helper of the generated Go crate has a name of the conversions of a unit, in_<unit> and out_<unit> (GN-4c)', () => {
  const lib = text(scopedSample(['go'], helperNamed), 'packages/go/internal/ffi/generated/lib.rs');
  const names = functionNames(lib);
  // The conversions of the units named default, callable and text are defined once each, beside the helper of a text.
  for (const name of ['in_default', 'out_default', 'in_callable', 'in_text']) assert.equal(names.get(name), 1, name);
  assert.match(lib, /\nfn in_text\(input: &mut &\[u8\], subject: &str\) -> Result<polyspec_sample::Text, Fail> \{/);
  assert.match(lib, /\nfn text_in\(input: &mut &\[u8\], subject: &str\) -> Result<String, Fail> \{/);
  assert.match(lib, /\nfn passed_out\(output: &mut Vec<u8>, value: binding_core::Passthrough\) \{/);
  // Every function named in_<...> or out_<...> is the conversion of a unit of the contract.
  const units = new Set(['default', 'callable', 'text', 'tag', 'data', 'lookup', 'scope', 'counter', 'ledger', 'store', 'shelf', 'slip', 'search']);
  const others = [...names.keys()].filter((name) => /^(in|out)_/.test(name) && !units.has(name.replace(/^(in|out)_/, '')));
  assert.deepEqual(others, []);
});

test('Python makes a closure of a callable, holds its value in the passthrough table and settles an awaitable on the event loop of the caller (GN-6ae)', () => {
  const out = scopedSample(['python']);
  const lib = text(out, 'packages/python/generated/lib.rs');
  // The callable is checked when it enters (kind invalid_callback), and the closure owns a reference to it.
  assert.match(lib, /fn callable_in\(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str\) -> PyResult<Py<PyAny>> \{\n {4}if !value\.is_callable\(\) \{\n {8}return Err\(binding_error\(py, BindingError::InvalidCallback \{ subject: subject\.to_owned\(\), member: String::new\(\) \}\)\);/);
  // The closure takes the GIL on the thread of its call, makes a new instance of the class of each class argument,
  // calls the callable and stores what it returned in the table; an exception of the callable is a Raised.
  assert.match(lib, /let work = callable_in\(py, work, "work"\)\?;\n\s+let work = move \|arg0: polyspec_sample::Scope\| -> Result<binding_core::Passthrough, binding_core::Failure<polyspec_sample::Error>> \{\n\s+Python::attach\(\|py\| \{\n\s+let call = \|\| -> PyResult<binding_core::Passthrough> \{\n\s+let returned = work\.bind\(py\)\.call1\(\(out_scope\(py, arg0\)\?,\)\)\?;\n\s+Ok\(pass\(returned\.unbind\(\)\)\)\n\s+\};\n\s+call\(\)\.map_err\(\|error\| thrown\(py, error\)\)\n\s+\}\)\n\s+\};/);
  // The plain member has no event loop; _<name>_on_loop takes one, positional only, and a<name> runs it in a thread of
  // asyncio with the running event loop of its caller.
  assert.match(lib, /#\[pyo3\(name = "transaction", signature = \(work\)\)\]\n {4}fn member_transaction<'py>\(&self, py: Python<'py>, work: &Bound<'py, PyAny>\) -> PyResult<Bound<'py, PyAny>> \{\n {8}self\.on_loop_transaction\(py, None, work\)\n {4}\}/);
  assert.match(lib, /#\[pyo3\(name = "_transaction_on_loop", signature = \(event_loop_, \/, work\)\)\]\n {4}fn on_loop_transaction<'py>\(&self, py: Python<'py>, event_loop_: Option<&Bound<'py, PyAny>>, work: &Bound<'py, PyAny>\) -> PyResult<Bound<'py, PyAny>> \{/);
  assert.match(lib, /fn member_atransaction<'py>\(slf: &Bound<'py, Self>, [^\n]*\n {8}awaited_on_loop\(slf\.py\(\), slf\.getattr\("_transaction_on_loop"\)\?, args, kwargs\)/);
  assert.match(lib, /async def on_loop\(member, \/, \*args, \*\*kwargs\):\\n {4}return await asyncio\.to_thread\(member, asyncio\.get_running_loop\(\), \*args, \*\*kwargs\)/);
  // The machine takes a clone of the value of the instance and the closure, waits without the GIL, and the driver
  // settles each value that the function returned.
  assert.match(lib, /binding_core::machine::drive\(&mut polyspec_sample::Store::transaction\(Clone::clone\(receiver\), work\), \|io\| driven\(py\.detach\([^\n]*\)\), \|value\| settled\(py, value, event_loop_, "work", "atransaction"\)\)/);
  // An awaitable is awaited as a coroutine on the event loop of the caller, and without a loop it is kind
  // invalid_callback with the name of the awaited member; a value that is no awaitable is settled at once.
  assert.match(lib, /fn settled<'py>\(py: Python<'py>, value: binding_core::Passthrough, event_loop: Option<&Bound<'py, PyAny>>, subject: &str, awaited: &str\) -> Result<Result<binding_core::Passthrough, binding_core::Raised>, BindingError> \{/);
  assert.match(lib, /Ok\(false\) => return Ok\(Ok\(pass\(object\.unbind\(\)\)\)\),/);
  assert.match(lib, /return Err\(BindingError::InvalidCallback \{ subject: subject\.to_owned\(\), member: format!\("that returns no awaitable; \{awaited\} awaits one"\) \}\);/);
  assert.match(lib, /let coroutine = awaiting\(py, "settle"\)\?\.call1\(\(&object,\)\)\?;\n\s+let future = py\.import\("asyncio"\)\?\.getattr\("run_coroutine_threadsafe"\)\?\.call1\(\(coroutine, event_loop\)\)\?;\n\s+future\.call_method0\("result"\)/);
  // B-3: the table of the values of a thread, its release function, and the result that leaves the table unchanged.
  assert.match(lib, /static PASSED: RefCell<BTreeMap<u64, Py<PyAny>>> = const \{ RefCell::new\(BTreeMap::new\(\)\) \};/);
  assert.match(lib, /fn pass\(value: Py<PyAny>\) -> binding_core::Passthrough \{[^}]*binding_core::Passthrough::from_generated\(binding_core::Handle::new\(handle\), release_passed\)\n\}/);
  assert.match(lib, /fn release_passed\(handle: binding_core::Handle\) \{\n {4}let gone = PASSED\.try_with\(\|map\| map\.borrow_mut\(\)\.remove\(&handle\.raw\(\)\)\);\n {4}Python::attach\(\|_py\| drop\(gone\)\);\n\}/);
  assert.match(lib, /\.ok_or_else\(\|\| BindingError::Internal \{ detail: String::from\("GN-6ae: the value of the passthrough is gone"\) \}\)/);
  assert.match(lib, /\n\s+passed_out\(py, result\)\n/);
  assert.match(lib, /\nuse std::cell::RefCell;\n/);
  // A class that only a function takes goes out to the function and has no conversion in (T-5).
  assert.match(lib, /\nfn out_scope\(/);
  assert.doesNotMatch(lib, /\bfn in_scope\b/);
  // A function of a functions unit and a static member have the same three entries, with the names of GN-4c.
  assert.match(lib, /#\[pyfunction\(name = "scoped"\)\]\n#\[pyo3\(signature = \(work\)\)\]\nfn function_scoped<'py>\(py: Python<'py>, work: &Bound<'py, PyAny>\) -> PyResult<Bound<'py, PyAny>> \{\n {4}loop_function_scoped\(py, None, work\)\n\}/);
  assert.match(lib, /#\[pyfunction\(name = "_scoped_on_loop", signature = \(event_loop_, \/, work\)\)\]\nfn loop_function_scoped<'py>\(/);
  assert.match(lib, /#\[pyfunction\(name = "ascoped", signature = \(\*args, \*\*kwargs\)\)\]\nfn function_ascoped<'py>\([^\n]*\n {4}awaited_on_loop\(py, wrap_pyfunction!\(loop_function_scoped, py\)\?\.into_any\(\), args, kwargs\)/);
  assert.match(lib, /binding_core::machine::drive\(&mut polyspec_sample::scoped\(work\), /);
  assert.match(lib, /#\[pyo3\(name = "once", signature = \(work\)\)\]\n {4}fn member_once<'py>\(py: Python<'py>, work: &Bound<'py, PyAny>\) -> PyResult<Bound<'py, PyAny>> \{\n {8}Self::on_loop_once\(py, None, work\)\n {4}\}/);
  assert.match(lib, /fn member_aonce<'py>\(py: Python<'py>, [^\n]*\n {8}awaited_on_loop\(py, py\.get_type::<Self>\(\)\.getattr\("_once_on_loop"\)\?, args, kwargs\)/);
  assert.match(lib, /binding_core::machine::drive\(&mut polyspec_sample::Store::once\(work\), /);
  // The declaration: a callable of the scope that returns any object, which the member returns.
  const stub = text(out, 'packages/python/generated/python/polyspec/sample/_native.pyi');
  assert.match(stub, /^from collections\.abc import Callable, /m);
  assert.match(stub, / {4}def transaction\(self, work: Callable\[\[Scope\], object\]\) -> object: \.\.\.\n {4}async def atransaction\(self, work: Callable\[\[Scope\], object\]\) -> object: \.\.\./);
  // A member with a function that may return no awaitable settles its value at once and has no entry of a loop.
  const plain = text(scopedSample(['python'], (contract) => {
    for (const id of ['store.transaction', 'store.once', 'store.audited', 'scope.nested', 'sample.scoped']) member(contract, id).parameters[0].type.function.async_allowed = false;
  }), 'packages/python/generated/lib.rs');
  assert.match(plain, /\|io\| driven\(py\.detach\([^\n]*\)\), \|value\| Ok\(Ok\(value\)\)\)/);
  assert.doesNotMatch(plain, /on_loop|fn settled|fn awaiting/);
});

test('the Python test writes a function fixture as a function of the module, a fixture with awaits as a coroutine function, raises callback and after (GN-6ae, CK-22)', () => {
  const tests = text(scopedSample(['python']), 'packages/python/generated/tests/test_generated.py');
  // A step calls a method on the argument at its position, a step that names a result requires it, and the function
  // returns its result, a value of GN-13.
  assert.match(tests, /\ndef (_function_\d+)\(\*args\):  # noqa: ANN002, ANN202\n {4}args\[0\]\.put\("a", "1"\)\n {4}result_1 = args\[0\]\.get\("a"\)\n {4}expected_1 = "1"\n {4}if not _same\(result_1, expected_1\):\n {8}raise AssertionError\(f"\{result_1!r\} is not \{expected_1!r\}"\)\n {4}return "done"\n/);
  const committing = /\ndef (_function_\d+)\(\*args\):[^\n]*\n(?: {4}[^\n]*\n)*? {4}return "done"\n/.exec(tests)?.[1] ?? '';
  assert.match(tests, new RegExp(String.raw`def test_gn13e_store_transaction_the_entries_of_a_function_that_returns_are_committed\(self\) -> None:\n {8}receiver = pkg\.Store\(\)\n {8}result = receiver\.transaction\(${committing}\)\n {8}expected = "done"\n {8}self\.assertTrue\(_same\(result, expected\), [^\n]*\n {8}after_0 = receiver\.get\("a"\)\n {8}expected_0 = "1"\n {8}self\.assertTrue\(_same\(after_0, expected_0\), `));
  // An argument of a function type of a step is again a function of the module.
  assert.match(tests, /\n {4}args\[0\]\.nested\(_function_\d+\)\n/);
  // A fixture with awaits is a coroutine function, whose steps await the awaited form of a member that waits, and
  // the test of its case calls the awaited form on an event loop.
  assert.match(tests, /\nasync def (_function_\d+)\(\*args\):  # noqa: ANN002, ANN202\n {4}args\[0\]\.put\("a", "1"\)\n {4}await args\[0\]\.anested\(_function_\d+\)\n(?: {4}[^\n]*\n)* {4}return "awaited"\n/);
  assert.match(tests, /def test_gn13e_store_transaction_the_entries_of_a_function_that_awaits_are_committed\(self\) -> None:\n {8}receiver = pkg\.Store\(\)\n {8}result = asyncio\.run\(receiver\.atransaction\(_function_\d+\)\)\n {8}expected = "awaited"\n/);
  assert.match(tests, /^import asyncio\n/m);
  // raises "callback": the function raises the exception that the test holds, the caller gets the same object, and
  // after observes the receiver after the failed call; an awaitable that raises gives the same.
  assert.match(tests, /\n_raised: list\[BaseException\] = \[\]\n/);
  assert.match(tests, /def test_gn6ae_store_transaction_the_entries_of_a_function_that_raises_are_dropped\(self\) -> None:\n {8}receiver = pkg\.Store\(\)\n {8}raised = LookupError\("raised by the function of the case"\)\n {8}_raised\[:\] = \[raised\]\n {8}with self\.assertRaises\(LookupError\) as caught:\n {12}receiver\.transaction\(_function_\d+\)\n {8}self\.assertIs\(caught\.exception, raised\)\n {8}after_0 = receiver\.get\("a"\)\n {8}expected_0 = None\n/);
  assert.match(tests, /def test_gn6ae_store_transaction_the_entries_of_an_awaitable_that_raises_are_dropped\(self\) -> None:\n(?: {8}[^\n]*\n)*? {12}asyncio\.run\(receiver\.atransaction\(_function_\d+\)\)\n {8}self\.assertIs\(caught\.exception, raised\)\n/);
  assert.match(tests, /\n {4}raise _raised\[0\]\n/);
  // A value that is no callable is kind invalid_callback, and so is an awaitable that the plain member cannot await.
  assert.match(tests, /def test_gn6ae_store_transaction_work_refuses_what_is_no_callable\(self\) -> None:\n {8}with self\.assertRaises\(pkg\.SampleTypeError\) as caught:\n {12}pkg\.Store\(\)\.transaction\(1\)\n {8}self\.assertEqual\(caught\.exception\.kind, "invalid_callback"\)/);
  assert.match(tests, /def test_gn6ae_store_transaction_work_refuses_an_awaitable_without_an_event_loop\(self\) -> None:\n {8}with self\.assertRaises\(pkg\.SampleTypeError\) as caught:\n {12}pkg\.Store\(\)\.transaction\(_function_\d+\)\n {8}self\.assertEqual\(caught\.exception\.kind, "invalid_callback"\)\n {8}self\.assertIn\("atransaction", str\(caught\.exception\)\)/);
});

test('the helpers of the error of another library share no name with a helper of the crate: libraries named core, binding, failure and library (GN-4c)', () => {
  for (const library of ['core', 'binding', 'failure', 'library']) {
    const { contract, caseFiles, foreign } = consumerSample();
    const owner = foreign.get('sample');
    owner.library = library;
    const renamed = JSON.parse(JSON.stringify(contract).replaceAll('"library":"sample"', `"library":"${library}"`));
    const out = generate({ contract: renamed, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign: new Map([[library, owner]]) });
    const libs = [...out].filter(([path]) => path.endsWith('generated/lib.rs'));
    assert.ok(libs.length >= 3, library);
    for (const [path, lib] of libs) {
      const names = functionNames(String(lib));
      assert.deepEqual([...names].filter(([, count]) => count > 1).map(([name]) => name), [], `${library} ${path}`);
      assert.equal(names.get(`error_of_${library}`), 1, `${library} ${path}`);
      assert.equal(names.get(`failure_of_${library}`), 1, `${library} ${path}`);
    }
  }
});

test('Go recovers the panic of a method of a callback in the call, and the member panics with the same value (GN-15b, U-3)', () => {
  // The sample, and the sample without the classes whose members take a func: a contract with a callback unit alone.
  const plain = (contract: any): void => {
    contract.units = contract.units.filter((u: any) => u.id !== 'store' && u.id !== 'scope');
    const functions = unitOf(contract, 'sample');
    functions.members = functions.members.filter((m: any) => m.id !== 'sample.scoped');
  };
  for (const out of [scopedSample(['go']), scopedSample(['go'], plain)]) {
    const binding = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
    assert.match(binding, /\/\/export polyspec_sample__go_callback\n/);
    // The call recovers the panic of the Go code that it runs and keeps its value as the error of the call.
    assert.match(binding, /func \(c \*Call\) run\(callback uint64, member uint32, args \[\]byte\) \(status int32, out \[\]byte\) \{\n\tdefer func\(\) \{\n\t\tif value := recover\(\); value != nil \{\n\t\t\tstatus, out = c\.raise\(&panicked\{value: value\}\)\n\t\t\}\n\t\}\(\)\n/);
    assert.match(binding, /\ntype panicked struct\{ value any \}\n/);
    // The member panics with that value after the call of the C ABI returned.
    assert.match(binding, /\tif p, ok := c\.raised\[index\]\.\(\*panicked\); ok \{\n\t\tpanic\(p\.value\)\n\t\}\n\treturn c\.raised\[index\]\n/);
    // One place recovers: the dispatch of a func does not.
    assert.equal(binding.split('recover()').length - 1, 1);
  }
  // The test: a callback whose method panics, the same value at the caller, the member again on the same instance,
  // and a member that writes the instance, which is not busy.
  const tests = text(scopedSample(['go']), 'packages/go/zz_generated_test.go');
  assert.match(tests, /\ntype panickingLookup struct\{ value any \}\n\nfunc \(p panickingLookup\) Find\(key string\) \(\*string, error\) \{ panic\(p\.value\) \}\n/);
  assert.match(tests, /func TestU3LedgerKnownPanicsWithThePanicOfLookup\(t \*testing\.T\) \{\n\traised := errors\.New\("raised by the callback"\)\n\t(made\d+), [^\n]*\n(?:\t[^\n]*\n)*?\tfunc\(\) \{\n\t\tdefer func\(\) \{\n\t\t\tif value := recover\(\); value != any\(raised\) \{\n\t\t\t\tt\.Fatalf\("U-3: %#v is not the panic of the callback", value\)\n\t\t\t\}\n\t\t\}\(\)\n\t\t_, err := \1\.Known\(panickingLookup\{value: raised\}\)\n\t\tt\.Fatalf\("U-3: the call returned %v", err\)\n\t\}\(\)\n\t_, err := \1\.Known\(raisingLookup\{err: raised\}\)\n\tif err != raised \{\n\t\tt\.Fatalf\("U-3: %#v is not the error of the callback after its panic", err\)\n\t\}\n\t\{\n\t\terr := \1\.Note\("a"\)\n\t\tif failure, ok := err\.\(\*liberrors\.SampleBusyError\); ok && failure\.Kind\(\) == "busy" \{\n\t\t\tt\.Fatalf\("U-3: the panic of the callback left ledger\.note busy: %v", err\)\n\t\t\}\n\t\}\n\}/);
  // A function, which has no instance, requires the panic and the call after it.
  assert.match(tests, /func TestU3ResolvePanicsWithThePanicOfLookup\(t \*testing\.T\) \{\n(?:\t[^\n]*\n)*?\t\t_, err := Resolve\(panickingLookup\{value: raised\}, "a"\)\n(?:\t[^\n]*\n)*?\t_, err := Resolve\(raisingLookup\{err: raised\}, "a"\)\n\tif err != raised \{\n[^\n]*\n\t\}\n\}/);
});

// GN-4c: the sample with functions whose names are those of helpers of the generated crates.
const helperNamedFunctions = (names: string[]) => (contract: any): void => {
  const functions = contract.units.find((u: any) => u.id === 'sample');
  for (const name of names) functions.members.push({ id: `sample.${name}`, name: [name], kind: 'function', visibility: 'public', wait: 'none', raises: [], parameters: [{ name: ['text'], type: 'text', required: true }], returns: 'text', core: `polyspec_sample::${name}` });
};

test('a function of a functions unit and a helper of a generated crate share no name: functions named pass, guard and raised (GN-4c)', () => {
  // PHP: the helpers pass, guard and raised are defined once each, beside the entries of the functions of those names.
  const php = functionNames(text(scopedSample(['php'], helperNamedFunctions(['pass', 'guard', 'raised'])), 'packages/php-ext/generated/lib.rs'));
  for (const name of ['pass', 'guard', 'raised', 'function_pass', 'function_guard', 'function_raised', 'function_join']) assert.equal(php.get(name), 1, `PHP ${name}`);
  assert.deepEqual([...php].filter(([, count]) => count > 1).map(([name]) => name), []);
  // Python, where pass is a keyword that no function takes (CK-23).
  const lib = text(scopedSample(['python'], helperNamedFunctions(['guard', 'raised', 'driven'])), 'packages/python/generated/lib.rs');
  const python = functionNames(lib);
  for (const name of ['guard', 'raised', 'driven', 'function_guard', 'function_raised', 'function_driven', 'function_join']) assert.equal(python.get(name), 1, `Python ${name}`);
  assert.deepEqual([...python].filter(([, count]) => count > 1).map(([name]) => name), []);
  // The Python name of a function is given apart from the name of its entry, also for its awaited form.
  assert.match(lib, /#\[pyfunction\(name = "guard"\)\]\n#\[pyo3\(signature = \(text\)\)\]\nfn function_guard<'py>\(/);
  assert.match(lib, /module\.add_function\(wrap_pyfunction!\(function_guard, module\)\?\)\?;/);
  assert.match(lib, /#\[pyfunction\(name = "aresolve_slowly", signature = \(\*args, \*\*kwargs\)\)\]\nfn function_aresolve_slowly<'py>\([^\n]*\n {4}awaited\(py, wrap_pyfunction!\(function_resolve_slowly, py\)\?\.into_any\(\), args, kwargs\)/);
  // The helper that reads the kind of a recognized exception has no name of the family recognized_<callback>_<member>.
  assert.equal(python.get('recognized_kind'), undefined);
  assert.equal(python.get('kind_of_recognized'), 1);
  assert.equal(php.get('kind_of_recognized'), 1);
  // Go: the entry of a function is its C symbol, polyspec_<library>_<function>, and no helper starts with polyspec_.
  const go = functionNames(text(scopedSample(['go'], helperNamedFunctions(['pass', 'guard', 'raised', 'held', 'lock', 'taken', 'thrown', 'called'])), 'packages/go/internal/ffi/generated/lib.rs'));
  for (const name of ['guard', 'held', 'lock', 'taken', 'thrown', 'called', 'polyspec_sample_pass', 'polyspec_sample_guard', 'polyspec_sample_raised', 'polyspec_sample_held', 'polyspec_sample_join']) assert.equal(go.get(name), 1, `Go ${name}`);
  assert.deepEqual([...go].filter(([, count]) => count > 1).map(([name]) => name), []);
  assert.deepEqual([...go.keys()].filter((name) => /^polyspec_/.test(name) && !/^polyspec_sample_/.test(name)), []);
});

test('no helper of a generated Node or WASM crate has a name of the conversions of a unit, in_<unit> and out_<unit> (GN-4c)', () => {
  const out = scopedSample(['node', 'wasm'], helperNamed);
  for (const path of ['packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, path);
    const names = functionNames(lib);
    // The conversions of the units named default, callable and text are defined once each, beside the helpers of a
    // default and of a text.
    for (const name of ['in_default', 'out_default', 'in_callable', 'in_text']) assert.equal(names.get(name), 1, `${path}: ${name}`);
    assert.match(lib, /\nfn in_default(?:<'env>)?\([^\n]*\) -> Result<polyspec_sample::Default, Fail> \{/, path);
    assert.match(lib, /\nfn default_in<[^\n]*\) -> Result<Option<T>, Fail> \{/, path);
    assert.match(lib, /\nfn text_in\([^\n]*\) -> Result<String, Fail> \{/, path);
    assert.match(lib, /\nfn callable_in\(/, path);
    assert.match(lib, /\nfn passed_out(?:<'env>)?\(/, path);
    // Every function named in_<...> or out_<...> is the conversion of a unit of the contract.
    const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
    const units = new Set(['default', 'callable', 'text', ...contract.units.map((u: any) => u.name.join('_'))]);
    const others = [...names.keys()].filter((name) => /^(in|out)_/.test(name) && !units.has(name.replace(/^(in|out)_/, '')));
    assert.deepEqual(others, [], path);
  }
});

test('the entry point of a function member of a Node or WASM crate does not take the name of a helper of the crate (GN-4c)', () => {
  // Functions named as helpers of the crates: guard, pass, called, throw and internal, and in, whose entry
  // function_in had the name of the helper of a function parameter.
  const named = (contract: any): void => {
    const functions = contract.units.find((u: any) => u.id === 'sample');
    for (const name of ['guard', 'pass', 'called', 'throw', 'internal', 'in']) {
      functions.members.push({ id: `sample.${name}`, name: [name], kind: 'function', visibility: 'public', wait: 'none', raises: [], returns: 'uint', core: `polyspec_sample::${name}_of`, parameters: [{ name: ['count'], type: 'uint', required: true }] });
      contract.cases.push({ member: `sample.${name}`, file: 'contracts/cases.json', group: 'store_new' });
    }
  };
  const out = scopedSample(['node', 'wasm'], named);
  const node = text(out, 'packages/ts/generated/lib.rs');
  const names = functionNames(node);
  for (const name of ['guard', 'pass', 'called', 'throw', 'internal', 'in']) {
    // Node: the helper is defined once, and the entry point is function_<name>, exported under the name of the member.
    if (name !== 'in') assert.equal(names.get(name), 1, name);
    assert.match(node, new RegExp(`\\n#\\[napi\\(js_name = "${name}"\\)\\]\\npub fn function_${name}<'env>\\(env: &'env Env, count: Unknown<'env>\\)`), name);
    // WASM: an export named as a helper would hide the helper in the module of the exports.
    const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
    assert.match(wasm, new RegExp(`\\n {4}#\\[wasm_bindgen\\(js_name = "${name}"\\)\\]\\n {4}pub fn function_${name}\\(count: JsValue\\)`), name);
    assert.doesNotMatch(wasm, new RegExp(`\\n {4}pub fn ${name}\\(`), name);
  }
  // No function of either crate is defined twice, and no helper has a name that starts with function_ (GN-4c).
  for (const path of ['packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, path);
    assert.deepEqual([...functionNames(lib)].filter(([, count]) => count > 1).map(([name]) => name), [], path);
    assert.doesNotMatch(lib.replaceAll(/\n(?: {4})?pub fn function_[a-z0-9_]+[<(]/g, ''), /\bfn function_/, path);
    assert.match(lib, /\nfn callable_in\(/, path);
  }
});

test('a Node crate whose only language code is a function parameter has no variant of an exception that nothing makes (GN-6ae)', () => {
  // The sample without its callback units and its value alias: no callback and no walk of a value gives a napi error.
  const alone = (contract: any): void => {
    const gone = new Set<string>(contract.units.filter((u: any) => u.origin === 'callback' || u.kind === 'alias').map((u: any) => u.id));
    const names = (value: unknown): boolean => [...gone].some((id) => JSON.stringify(value).includes(`"unit":"${id}"`));
    // A record whose field is such a unit goes with it.
    for (const unit of contract.units) if (unit.kind === 'record' && names(unit.fields)) gone.add(unit.id);
    contract.units = contract.units.filter((u: any) => !gone.has(u.id));
    const kept = new Set<string>();
    for (const unit of contract.units) {
      unit.members = (unit.members ?? []).filter((m: any) => !names(m));
      for (const m of unit.members) kept.add(m.id);
    }
    contract.cases = contract.cases.filter((k: any) => k.member !== undefined && kept.has(k.member));
  };
  const lib = text(scopedSample(['node'], alone), 'packages/ts/generated/lib.rs');
  assert.match(lib, /let work = callable_in\(env, work, "work"\)\?;/);
  assert.doesNotMatch(lib, /CbLookup|describe\(/);
  // Every variant of Thrown that the crate names is made somewhere in it.
  const variants = [...(/enum Thrown \{\n([\s\S]*?)\n\}/.exec(lib)?.[1] ?? '').matchAll(/^ {4}([A-Z][a-z]+)\(/gm)].map((found) => found[1] ?? '');
  assert.deepEqual(variants, ['Binding', 'Held']);
  for (const variant of variants) assert.match(lib, new RegExp(`(?:Err|raised|thrown)\\(Thrown::${variant}\\(|map_err\\(Thrown::${variant}\\)`), variant);
  assert.doesNotMatch(lib, /Thrown::Js/);
});

test('the Node and WASM crates of the sample define each function once and name the type of an advance (GN-4c, GN-6ae)', () => {
  // A crate with a value alias and a function parameter holds the walk of a value and the exception of a function, and
  // each keeps what was thrown through the one function raised; a second definition does not compile.
  const out = scopedSample(['node', 'wasm']);
  for (const path of ['packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    // A function under a cfg attribute has a twin under the opposite one, so only the others are counted.
    const lines = text(out, path).split('\n');
    const names = lines.flatMap((line, at) => {
      const name = /^(?:pub )?(?:const )?fn ([a-z0-9_]+)[<(]/.exec(line)?.[1];
      let above = at - 1;
      while (above >= 0 && /^(?:\/\/\/|#\[)/.test(lines[above] ?? '') && !(lines[above] ?? '').startsWith('#[cfg(')) above -= 1;
      return name === undefined || (lines[above] ?? '').startsWith('#[cfg(') ? [] : [name];
    });
    assert.ok(names.includes('raised'), path);
    assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), [], path);
  }
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /fn js_raised\(error: napi::Error\) -> binding_core::Raised \{\n {4}if error\.status == napi::Status::PendingException \{\n {8}raised\(Thrown::Js\(error\)\)\n {4}\} else \{\n {8}raised\(Thrown::Binding\(internal\(error\)\)\)\n {4}\}\n\}/);
  assert.match(node, /get_element\(index\)\.map_err\(js_raised\)\?;/);
  // clippy type_complexity: the boxed closure of an advance has a name.
  const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /pub struct Driven \{\n\s+advance: Advance,\n\s+\}/);
  assert.match(wasm, /type Advance = Box<dyn FnMut\(JsValue\) -> Result<\(u32, JsValue\), Fail>>;/);
});

test('a class that only a function parameter takes as its argument has no conversion in (T-5, GN-6ae)', () => {
  // The argument of a function parameter leaves to language code and never comes in, so a conversion in of its class
  // is dead code, which fails the build with -D warnings.
  const out = scopedSample(['php', 'node', 'wasm']);
  for (const path of ['packages/php-ext/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    assert.match(text(out, path), /\nfn out_scope[(<]/, path);
    assert.doesNotMatch(text(out, path), /\nfn in_scope[(<]/, path);
    assert.match(text(out, path), /\nfn in_tag[(<]/, path);
  }
});

test('Node takes the exception of a callback that a machine owns out of the environment and holds it (GN-6ab)', () => {
  // The machine goes on after the call of its callback, so an exception that stays pending would fail the calls of
  // Node-API that follow in the advance. The owned callback keeps it as the function of a machine does (GN-6ae).
  const lib = text(scopedSample(['node']), 'packages/ts/generated/lib.rs');
  const ownedImpl = lib.slice(lib.indexOf('impl polyspec_sample::Lookup for OwnedCbLookup'));
  assert.match(ownedImpl.slice(0, ownedImpl.indexOf('\n}\n')), /let mut borrowed = CbLookup \{ object, env: &env[^}]*\};\n\s+polyspec_sample::Lookup::[a-z_]+\(&(?:mut )?borrowed[^\n]*\)\.map_err\(\|failure\| kept\(&env, failure\)\)\n/);
  assert.match(lib, /fn kept\(env: &Env, failure: binding_core::Failure<polyspec_sample::Error>\) -> binding_core::Failure<polyspec_sample::Error> \{\n {4}let binding_core::Failure::Raised\(raised\) = &failure else \{\n {8}return failure;\n {4}\};/);
  // GN-6u: the Raised names the entry of the table by the key of its ThrownKey.
  assert.match(lib, /let Some\(key\) = raised\.native\(\)\.downcast::<ThrownKey>\(\)\.map\(\|thrown\| thrown\.key\) else \{\n {8}return failure;\n {4}\};\n {4}let pending = THROWN\.with_borrow\(\|map\| matches!\(map\.get\(&key\), Some\(Thrown::Js\(error\)\) if error\.status == napi::Status::PendingException\)\);/);
  assert.match(lib, /napi::sys::napi_get_and_clear_last_exception\(env\.raw\(\), &mut exception\) \} == napi::sys::Status::napi_ok \{\n[^\n]*\n {8}match Owned::boxed\(env, unsafe \{ Unknown::from_raw_unchecked\(env\.raw\(\), exception\) \}\) \{\n {12}Ok\(held\) => Thrown::Held\(held\),/);
  assert.match(lib, /THROWN\.with_borrow_mut\(\|map\| map\.insert\(key, taken\)\);\n {4}failure\n\}/);
  // A contract whose machine owns a callback and takes no function holds the exception in the same way.
  const alone = text(scopedSample(['node'], (contract) => {
    contract.units = contract.units.filter((unit: any) => !['store', 'scope'].includes(unit.id));
    const functions = unitOf(contract, 'sample');
    functions.members = functions.members.filter((m: any) => m.id !== 'sample.scoped');
    contract.cases = contract.cases.filter((k: any) => !/^(?:store|scope)\.|^sample\.scoped$/.test(k.member ?? ''));
  }), 'packages/ts/generated/lib.rs');
  assert.doesNotMatch(alone, /fn callable_in\(/);
  assert.match(alone, /\n {4}Held\(Owned\),\n/);
  assert.match(alone, /\n {4}fn boxed\(env: &Env, value: Unknown<'_>\) -> Result<Self, Fail> \{/);
  assert.match(alone, /Some\(Thrown::Held\(exception\)\) => thrown_again\(&exception\),/);
  assert.match(alone, /\nfn thrown_again\(exception: &Owned\) -> Fail \{/);
  assert.match(alone, /\nfn kept\(env: &Env, /);
});

test('a Raised of the Node and WASM crates is released by its last drop, and no call or machine keeps a list of them (U-3, GN-6u, GN-6ae)', () => {
  // The core may drop a Raised and not return it, as a scope does that rolls back and returns another failure. The
  // Raised holds a Native whose last drop removes what was thrown from the table, so no entry point records the
  // Raised values of its call and no machine keeps those of its advances.
  const out = scopedSample(['node', 'wasm']);
  for (const path of ['packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, path);
    assert.match(lib, /impl binding_core::NativeObject for ThrownKey \{\}/, path);
    assert.match(lib, /impl Drop for ThrownKey \{\n {4}fn drop\(&mut self\) \{\n[\s\S]*?THROWN\.try_with\(\|map\| map\.try_borrow_mut\(\)\.ok\(\)\.(?:map|and_then)\(\|mut map\| map\.remove\(&self\.key\)\)\);/, path);
    assert.match(lib, /binding_core::Raised::from_generated\(binding_core::Native::new\(ThrownKey \{ (?:thread: thrown_thread\(\), )?key \}\)\)/, path);
    // The closure of a function of a machine makes its Raised by the same function as a callback does.
    assert.match(lib, /fn thrown(?:<E>)?\(error: Thrown\) -> binding_core::Failure<[^>]+> \{\n {4}binding_core::Failure::Raised\((?:keep_thrown|raised)\(error\)\)\n\}/, path);
    assert.doesNotMatch(lib, /\bRAISING\b|fn raised_released|fn raised_taken|raised: Vec<u64>|\.handle\(\)\.raw\(\)\)\) \{/, path);
    assert.doesNotMatch(lib, /impl Drop for Driven/, path);
  }
  // The Node table belongs to one thread: a drop on that thread removes the entry at once, and a drop on another
  // thread queues its key for the thread that keeps it.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /fn drop\(&mut self\) \{\n {8}if thrown_thread\(\) == self\.thread \{/);
  assert.match(node, /fn take_thrown\(raised: &binding_core::Raised\) -> Option<Thrown> \{\n {4}release_dropped\(\);\n {4}let thrown = raised\.native\(\)\.downcast::<ThrownKey>\(\)\?;/);
  assert.match(node, /binding_core::Failure::Raised\(raised\) => match take_thrown\(&raised\) \{/);
});

test('a Raised of the PHP, Python and Go crates is released by its last drop, on any thread (U-3, GN-6u, GN-6ae)', () => {
  // The machine of these three crates runs inside one entry point, and the core may call a callback of Python or Go
  // from a thread of its own; the drop of the Raised removes what was thrown wherever it runs: the Python and Go
  // tables are behind a mutex, and the PHP table of a thread takes the keys that another thread dropped.
  const out = scopedSample(['php', 'python', 'go']);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  const python = text(out, 'packages/python/generated/lib.rs');
  const go = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(php, /impl Drop for ThrownKey \{\n {4}fn drop\(&mut self\) \{\n {8}if thrown_thread\(\) == self\.thread \{\n {12}let removed = THROWN\.try_with\(\|map\| map\.try_borrow_mut\(\)\.ok\(\)\.map\(\|mut map\| map\.remove\(&self\.key\)\)\);/);
  assert.match(php, /fn keep_thrown\(error: Thrown\) -> binding_core::Raised \{\n {4}release_dropped\(\);\n {4}let key = NEXT_THROWN\.fetch_add\(1, Ordering::Relaxed\);\n {4}THROWN\.with_borrow_mut\(\|map\| map\.insert\(key, error\)\);\n {4}binding_core::Raised::from_generated\(binding_core::Native::new\(ThrownKey \{ thread: thrown_thread\(\), key \}\)\)\n\}/);
  assert.match(python, /static THROWN: Mutex<BTreeMap<u64, Py<PyAny>>> = Mutex::new\(BTreeMap::new\(\)\);/);
  assert.match(python, /impl Drop for ThrownKey \{\n {4}fn drop\(&mut self\) \{\n {8}let taken = thrown_map\(\)\.remove\(&self\.key\);\n {8}drop\(taken\);\n {4}\}\n\}/);
  assert.match(python, /fn keep_thrown\(object: Py<PyAny>\) -> binding_core::Raised \{\n {4}let key = NEXT_THROWN\.fetch_add\(1, Ordering::Relaxed\);\n {4}thrown_map\(\)\.insert\(key, object\);\n {4}binding_core::Raised::from_generated\(binding_core::Native::new\(ThrownKey \{ key \}\)\)\n\}/);
  assert.match(go, /impl Drop for ThrownKey \{\n {4}fn drop\(&mut self\) \{\n {8}let taken = lock\(&THROWN\)\.remove\(&self\.key\);\n {8}drop\(taken\);\n {4}\}\n\}/);
  assert.match(go, /fn thrown\(error: Thrown\) -> Raised \{\n {4}let key = NEXT_THROWN\.fetch_add\(1, Ordering::Relaxed\);\n {4}lock\(&THROWN\)\.insert\(key, error\);\n {4}Raised::from_generated\(Native::new\(ThrownKey \{ key \}\)\)\n\}/);
  // No crate records the Raised values of a call, and no guard opens a scope for them.
  for (const lib of [php, python, go]) assert.doesNotMatch(lib, /\bRAISING\b|fn raised_released|\.handle\(\)\.raw\(\)/);
  // A crate that makes no Raised has no table and no key of one.
  const { contract, caseFiles } = load();
  const plain = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: ['php', 'python', 'go'] });
  for (const path of ['packages/php-ext/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/go/internal/ffi/generated/lib.rs']) {
    const lib = text(plain, path);
    assert.equal(/\bstruct ThrownKey\b/.test(lib), /\bstatic THROWN\b/.test(lib), path);
  }
});

// GN-4c: the plot of the end-to-end check, whose two members take the record a_b of the library c and the record b of
// the library c_a, with or without an own record named c_a_b.
const twoLibraries = (): { contract: any; caseFiles: Map<string, unknown>; foreign: Map<string, any> } => {
  const { contract, caseFiles, foreign } = plotSample();
  const points = foreign.get('points');
  const renamed = (library: string, name: string[]): any => {
    const owner = JSON.parse(JSON.stringify(points));
    owner.library = library;
    const unit = unitOf(owner, 'point');
    unit.id = name.join('_');
    unit.name = name;
    return owner;
  };
  const retype = (member: any, type: unknown): void => {
    for (const parameter of member.parameters) if (typeof parameter.type === 'object') parameter.type = type;
    member.returns = type;
  };
  const plot = unitOf(contract, 'plot');
  retype(plot.members.find((m: any) => m.id === 'plot.mirror'), { unit: 'a_b', library: 'c' });
  retype(plot.members.find((m: any) => m.id === 'plot.rise'), { unit: 'b', library: 'c_a' });
  // The variant mark of plot still names the record point of points, so the contract of points stays.
  return { contract, caseFiles, foreign: new Map([['points', points], ['c', renamed('c', ['a', 'b'])], ['c_a', renamed('c_a', ['b'])]]) };
};

// The functions that each module of a generated crate defines, by the path of the module from the root of the crate;
// a function under a cfg attribute is one of the forms of a function and is not counted, as in functionNames.
const definedIn = (lib: string): Map<string, string[]> => {
  const defined = new Map<string, string[]>();
  const open: { name: string; indent: number }[] = [];
  let conditional = false;
  for (const line of lib.split('\n')) {
    const indent = line.length - line.trimStart().length;
    const attribute = /^(?:#\[|\/\/\/)/.test(line.trimStart());
    const counted = !conditional;
    conditional = attribute && (conditional || line.trimStart().startsWith('#[cfg('));
    const module = /^\s*(?:pub(?:\([a-z]+\))? )?mod ([a-z0-9_]+) \{$/.exec(line);
    if (module !== null) open.push({ name: module[1] ?? '', indent });
    else if (line.trim() === '}' && open.length > 0 && open[open.length - 1]?.indent === indent) open.pop();
    const fn = /^(?:pub(?:\([a-z]+\))? )?(?:unsafe )?(?:extern "C" )?fn ([a-z0-9_]+)/.exec(line.trimStart());
    if (fn !== null && counted && indent === open.length * 4) {
      const path = open.map((m) => m.name).join('::');
      defined.set(path, [...(defined.get(path) ?? []), fn[1] ?? '']);
    }
  }
  return defined;
};

test('the conversions of a unit of another library are functions of the module of the library, so two libraries and an own unit share no name (GN-4c)', () => {
  // Before, the record a_b of the library c and the record b of the library c_a both had the conversions in_c_a_b and
  // out_c_a_b, two definitions of one function, and an own record c_a_b had them a third time.
  for (const own of [false, true]) {
    const { contract, caseFiles, foreign } = twoLibraries();
    if (own) {
      const record = { ...JSON.parse(JSON.stringify(unitOf(foreign.get('c'), 'a_b'))), id: 'c_a_b', name: ['c', 'a', 'b'], core_type: 'polyspec_plot::Own' };
      contract.units.push(record);
      const plot = unitOf(contract, 'plot');
      const mirror = plot.members.find((m: any) => m.id === 'plot.mirror');
      plot.members.push({ ...JSON.parse(JSON.stringify(mirror)), id: 'plot.own', name: ['own'], parameters: [{ name: ['point'], type: { unit: 'c_a_b' }, required: true }], returns: { unit: 'c_a_b' }, core: 'polyspec_plot::own' });
      contract.cases = contract.cases.filter((k: any) => k.member !== undefined);
    }
    const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_plot', caseFiles, foreign });
    const libs = [...out].filter(([path]) => path.endsWith('generated/lib.rs'));
    assert.equal(libs.length, 5, String(own));
    for (const [path, lib] of libs) {
      const defined = definedIn(String(lib));
      for (const [module, names] of defined) {
        assert.deepEqual(names.filter((name, i) => names.indexOf(name) !== i), [], `${path} ${module}`);
      }
      assert.deepEqual((defined.get('library_c') ?? []).sort(), ['in_a_b', 'out_a_b'], path);
      assert.deepEqual((defined.get('library_c_a') ?? []).sort(), ['in_b', 'out_b'], path);
      assert.match(String(lib), /\nmod library_c \{\n {4}use super::\*;\n/, path);
      assert.match(String(lib), /\n {4}pub\(super\) fn in_a_b\(/, path);
      assert.match(String(lib), /\blibrary_c::in_a_b\(/, path);
      assert.match(String(lib), /\blibrary_c::out_a_b\(/, path);
      assert.match(String(lib), /\blibrary_c_a::in_b\(/, path);
      assert.match(String(lib), /\blibrary_c_a::out_b\(/, path);
      // A closure that only calls a conversion is the conversion itself, also by its path (clippy redundant_closure).
      assert.doesNotMatch(String(lib), /\|(\w+)\| library_c(?:_a)?::\w+\(\1\)/, path);
      // The conversions of an own unit stay functions of the root of the crate.
      const root = defined.get('') ?? [];
      assert.equal(root.includes('out_c_a_b'), own, path);
      assert.equal(root.some((name) => /^(?:in|out)_(?:a_b|b)$/.test(name)), false, path);
    }
  }
});

// GN-4c: the sample with a second class tag_new, whose member x and the member new_x of the class tag gave one name,
// with a member free of the class tag, which had the name of the release of the class, and with a member guard, the
// name of a helper.
const classNames = (contract: any): void => {
  const tag = unitOf(contract, 'tag');
  const method = tag.members.find((m: any) => m.id === 'tag.name');
  const named = (unit: string, name: string[]): any => ({ ...JSON.parse(JSON.stringify(method)), id: `${unit}.${name.join('_')}`, name });
  tag.members.push(named('tag', ['new', 'x']), named('tag', ['free']), named('tag', ['guard']));
  const second = JSON.parse(JSON.stringify(tag));
  second.id = 'tag_new';
  second.name = ['tag', 'new'];
  second.members = [{ ...JSON.parse(JSON.stringify(tag.members.find((m: any) => m.kind === 'constructor'))), id: 'tag_new.new' }, named('tag_new', ['x'])];
  contract.units.push(second);
};

test('the entry of a member of a class of the WASM crate is a function of the module of its class, and the release of a class has a name of its own (GN-4c)', () => {
  // Before, the member new_x of the class tag and the member x of the class tag_new were both class_tag_new_x, and
  // the member free of the class tag was class_tag_free with the export __Tag_free, as the release of the class was.
  const out = scopedSample(['wasm'], classNames);
  const lib = text(out, 'packages/ts/wasm/generated/lib.rs');
  const defined = definedIn(lib);
  for (const [module, names] of defined) assert.deepEqual(names.filter((name, i) => names.indexOf(name) !== i), [], module);
  for (const name of ['new', 'name', 'new_x', 'free', 'guard']) assert.ok((defined.get('exports::class_tag') ?? []).includes(`member_${name}`), name);
  assert.deepEqual((defined.get('exports::class_tag_new') ?? []).sort(), ['member_new', 'member_x']);
  // A member named as a helper does not hide the helper in the module of its class, which names the helper by a glob.
  for (const [module, names] of defined) if (module.startsWith('exports::class_')) assert.deepEqual(names.filter((name) => !name.startsWith('member_')), [], module);
  assert.equal([...defined.values()].flat().filter((name) => name.startsWith('member_') || name.startsWith('free_')).every((name) => !(defined.get('') ?? []).includes(name)), true);
  assert.ok((defined.get('exports') ?? []).includes('free_tag'));
  assert.ok((defined.get('exports') ?? []).includes('free_tag_new'));
  assert.match(lib, /\n {4}pub mod class_tag \{\n {8}use super::\*;\n/);
  // No export of the module has the name of another: the release of a class is __free_<Class>, which no member of a
  // class has, because the name of a class starts with a capital letter.
  const exports = [...lib.matchAll(/#\[wasm_bindgen\(js_name = "([^"]+)"\)\]/g)].map((m) => m[1] ?? '');
  assert.deepEqual(exports.filter((name, i) => exports.indexOf(name) !== i), []);
  assert.ok(exports.includes('__Tag_free'));
  assert.ok(exports.includes('__free_Tag'));
  assert.match(lib, /#\[wasm_bindgen\(js_name = "__free_Tag"\)\]\n {4}pub fn free_tag\(this: u32\) \{/);
  const entry = text(out, 'packages/ts/wasm/generated/index.js') + [...out].filter(([path]) => path.endsWith('.js') || path.endsWith('.mjs')).map(([, file]) => String(file)).join('\n');
  assert.match(entry, /released\.register\(this, \[glue\.__free_Tag, this\.#handle\]\);/);
});

test('the C symbol and the function of package binding of a member of the Go crate separate the module, the class and the member, so that no two members have one name (GN-4c, GN-17)', () => {
  // Before, the member new_x of the class tag and the member x of the class tag_new were both the symbol
  // polyspec_sample_tag_new_x and the function TagNewX of package binding, the function x of a module tag was the
  // symbol of the member x of the class tag, and the modules a/b_c and a_b/c gave their function x one symbol.
  const out = scopedSample(['go'], (contract) => {
    classNames(contract);
    const tag = unitOf(contract, 'tag');
    const method = tag.members.find((m: any) => m.id === 'tag.name');
    tag.members.push({ ...JSON.parse(JSON.stringify(method)), id: 'tag.x', name: ['x'] });
    const measure = unitOf(contract, 'sample').members.find((m: any) => m.id === 'sample.measure');
    // The class k of the module tag and the class tag_k of the root, whose release functions of package binding were
    // both ReleaseTagK.
    for (const [id, name, module] of [['tag_k', ['tag', 'k'], ''], ['k', ['k'], 'tag']] as const) {
      contract.units.push({ ...JSON.parse(JSON.stringify(unitOf(contract, 'tag_new'))), id, name, module, members: [{ ...JSON.parse(JSON.stringify(tag.members.find((m: any) => m.kind === 'constructor'))), id: `${id}.new` }] });
    }
    for (const [id, module] of [['tag_functions', 'tag'], ['first_functions', 'a/b_c'], ['second_functions', 'a_b/c']] as const) {
      contract.units.push({ id, name: id.split('_'), module, kind: 'functions', visibility: 'public', origin: 'generated', members: [{ ...JSON.parse(JSON.stringify(measure)), id: `${id}.x`, name: ['x'] }] });
    }
  });
  const lib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  const symbols = [...lib.matchAll(/^pub (?:unsafe )?extern "C" fn (\w+)\(/gm)].map((m) => m[1] ?? '');
  assert.deepEqual(symbols.filter((name, i) => symbols.indexOf(name) !== i), []);
  const binding = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
  const functions = [...binding.matchAll(/^func (\w+)\(/gm)].map((m) => m[1] ?? '');
  assert.deepEqual(functions.filter((name, i) => functions.indexOf(name) !== i), []);
  const declared = [...binding.matchAll(/^int32_t (\w+)\(/gm)].map((m) => m[1] ?? '');
  assert.deepEqual(declared.filter((name, i) => declared.indexOf(name) !== i), []);
  // The class and the member are separated by two underscores, a segment of a module ends with three, and the
  // function of package binding has one underscore less in each separator.
  const pairs = [
    ['polyspec_sample_tag__new_x', 'Tag_NewX'], ['polyspec_sample_tag_new__x', 'TagNew_X'], ['polyspec_sample_tag__new', 'Tag_New'], ['polyspec_sample_tag_new__new', 'TagNew_New'],
    ['polyspec_sample_tag__x', 'Tag_X'], ['polyspec_sample_tag___x', 'Tag__X'], ['polyspec_sample_a___b_c___x', 'A__BC__X'], ['polyspec_sample_a_b___c___x', 'AB__C__X'],
    ['polyspec_sample_measure', 'Measure'],
  ] as const;
  for (const [symbol, name] of pairs) {
    assert.ok(symbols.includes(symbol), symbol);
    assert.ok(declared.includes(symbol), symbol);
    assert.match(binding, new RegExp(`\\nfunc ${name}\\(args \\[\\]byte\\) \\(\\*Reader, error\\) \\{\\n[^}]*\\bC\\.${symbol}\\(`), name);
  }
  for (const name of ['ReleaseTagK', 'ReleaseK', 'ReleaseTag', 'ReleaseTagNew']) assert.ok(functions.includes(name), name);
  assert.ok(symbols.includes('polyspec_sample_tag___k__new'));
  // No symbol of a member joins two names of the contract by one underscore: a symbol of a member has its class
  // before two underscores, and the symbols that are not members keep two underscores after the prefix.
  assert.equal(symbols.includes('polyspec_sample_tag_new_x'), false);
  assert.doesNotMatch(binding, /\bTagNewX\b/);
  // The public package calls each function of package binding by its new name.
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /binding\.Tag_NewX\(/);
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /binding\.TagNew_X\(/);
  assert.match(text(out, 'packages/go/tag/zz_generated_tag.go'), /binding\.Tag__X\(/);
});

test('every entry point of the WASM crate is shielded once, and the entry of a member arms its core call once: with_faults, or armed_future around the wait of a machine (G-5, GN-8a)', () => {
  // The count of the arming calls of the whole crate equals the count of the shields only when each entry holds one of
  // each, which this test reads entry by entry. The advance of a Driven object is an entry point without a core call
  // of its own: it is shielded, as that of the Node crate is, and arms nothing, because the member that made the
  // machine arms each wait.
  const lib = text(scopedSample(['wasm']), 'packages/ts/wasm/generated/lib.rs');
  const exports = lib.slice(lib.indexOf('\nmod exports {'));
  const entries = [...exports.matchAll(/\n( *)((?:(?:\/\/\/|#\[)[^\n]*\n *)*)pub fn ([a-z_0-9]+)\([^\n]*\{\n([\s\S]*?)\n\1\}\n/g)].map(([, , attributes, name, body]) => ({
    name: name ?? '',
    test: /#\[cfg\(feature = "(?:panic|fault|codec)-test"\)\]/.test(attributes ?? ''),
    guards: (body ?? '').match(/\bguard\(/g)?.length ?? 0,
    shields: (body ?? '').match(/shielded\(\|\| /g)?.length ?? 0,
    arms: (body ?? '').match(/(?:with_faults|armed_future)\("/g)?.length ?? 0,
  }));
  const members = entries.filter((entry) => /^(?:function|member)_/.test(entry.name));
  assert.ok(members.length >= 30, String(members.length));
  assert.ok(members.some((entry) => entry.name === 'member_transaction'));
  assert.deepEqual(members.filter((entry) => entry.guards !== 1 || entry.shields !== 1 || entry.arms !== 1), []);
  const others = entries.filter((entry) => !/^(?:function|member)_/.test(entry.name) && !entry.test && entry.guards > 0);
  assert.deepEqual(others.map((entry) => entry.name), ['advance']);
  assert.deepEqual(others.filter((entry) => entry.guards !== 1 || entry.shields !== 1 || entry.arms !== 0), []);
  // No arming and no shield is outside an entry, so the counts of the crate are the sums of its entries.
  assert.equal(entries.reduce((sum, entry) => sum + entry.arms, 0), lib.match(/(?:with_faults|armed_future)\("/g)?.length);
  assert.equal(entries.reduce((sum, entry) => sum + entry.shields, 0), lib.match(/shielded\(\|\| /g)?.length);
});

test('the Python crate of a contract without a class imports no RefCell, because its table of the thrown values is behind a mutex (U-3, GN-6u)', () => {
  // The consumer has callbacks and no class. Its table of the thrown values is a Mutex, whose entry the drop of the
  // Raised removes on any thread, so nothing of the crate names RefCell and an import of it would be unused, which
  // the lints deny.
  const { contract, caseFiles, foreign } = consumerSample();
  const lib = text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['python'] }), 'packages/python/generated/lib.rs');
  assert.match(lib, /static THROWN: Mutex<BTreeMap<u64, Py<PyAny>>> = Mutex::new\(BTreeMap::new\(\)\);/);
  assert.doesNotMatch(lib, /\bRefCell\b/);
  // The sample has a class and the table of the passed values, which name RefCell by the import.
  const sample = text(scopedSample(['python']), 'packages/python/generated/lib.rs');
  assert.match(sample, /\nuse std::cell::RefCell;\n/);
  assert.doesNotMatch(sample, /std::cell::RefCell[<:]/);
});

test('the WASM crate of a contract without a class or a list imports the Array of its error, and holds no helper of a wait that nothing calls (GN-18)', () => {
  // The plot has no list, so nothing but the error of the crate names Array, and the consumer has no member that
  // waits, so nothing calls caught, an async fn, which the lints deny as dead code.
  const plot = plotSample();
  const plotLib = text(generate({ contract: plot.contract, version: '0.0.0', coreLib: 'polyspec_plot', caseFiles: plot.caseFiles, foreign: plot.foreign, targets: ['wasm'] }), 'packages/ts/wasm/generated/lib.rs');
  assert.match(plotLib, /\bArray::of4\(/);
  assert.match(plotLib, /\nuse js_sys::\{[^}]*\bArray\b[^}]*\};\n/);
  const consumer = consumerSample();
  const consumerLib = text(generate({ contract: consumer.contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles: consumer.caseFiles, foreign: consumer.foreign, targets: ['wasm'] }), 'packages/ts/wasm/generated/lib.rs');
  assert.doesNotMatch(consumerLib, /\bcaught\(/);
  assert.doesNotMatch(consumerLib, /\bfn caught\b/);
  // The sample has members that wait, whose entries call it.
  const sampleLib = text(scopedSample(['wasm']), 'packages/ts/wasm/generated/lib.rs');
  assert.match(sampleLib, /\nasync fn caught</);
  assert.match(sampleLib, /\bcaught\(/);
});

test('a unit with only is generated for the targets that it lists and is absent from the others (Q-4, GN-6af)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  const only = { targets: ['python'], reason: 'the test of GN-6af' };
  for (const unit of contract.units) {
    if (unit.id === 'gate') unit.only = only;
    for (const member of unit.members ?? []) if (member.id === 'tag.gate' || member.id === 'tag.gates') member.only = only;
  }
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['python', 'node'] });
  assert.match(text(out, 'packages/python/generated/lib.rs'), /struct PyGate\b/);
  assert.match(text(out, 'packages/python/generated/python/polyspec/classes/_native.pyi'), /class Gate\b/);
  for (const path of ['packages/ts/generated/lib.rs', 'packages/ts/generated/index.d.ts', 'packages/ts/generated/index.mjs', 'packages/ts/generated/tests/generated.test.mjs']) {
    assert.doesNotMatch(text(out, path), /\bGate\b/, path);
  }
});

test('a value class without core_type keeps the language values that its constructor judges and that a value alias reads and makes (U-1, U-7, GN-6af)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const targets = ['python', 'node', 'wasm', 'go'];
  sample.units.push({
    id: 'boxed', name: ['boxed'], module: '', kind: 'class', visibility: 'public', origin: 'value', only: { targets, reason: 'the test of GN-6af' },
    members: [
      { id: 'boxed.constructor', name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [{ name: ['value'], type: { unit: 'data' }, default: { literal: null } }], raises: ['polyspec_sample::Error::Unsupported'], wait: 'none', core: 'polyspec_sample::check_boxed' },
      { id: 'boxed.value', name: ['value'], kind: 'property', visibility: 'public', returns: { unit: 'data' }, raises: [], wait: 'none', writable: true },
    ],
  });
  const data = sample.units.find((u: any) => u.id === 'data');
  data.out.push({ kind: 'reference', make: { php: 'null', python: 'boxed.constructor', node: 'boxed.constructor', go: 'boxed.constructor', wasm: 'boxed.constructor' } });
  for (const lang of targets) data.in.push({ [lang]: 'boxed', cases: [{ kind: 'reference', read: 'boxed.value' }] });
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['php', 'python', 'node', 'wasm', 'go'] });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, path);
    // The constructor judges its argument as a HostValue, and None when it is left out; no core value is kept.
    assert.match(lib, /polyspec_sample::check_boxed\(&mut host, /, path);
    // The in row describes an instance by its identity, and read gives its kept value again.
    assert.match(lib, /HostValue::Value \{ kind: ValueKind::Reference, handle \}/, path);
    assert.doesNotMatch(lib, /no value class is read/, path);
    // The out row makes the instance before its content, without the core.
    assert.match(lib, /OutValue::Reference \{ handle, value \} =>/, path);
    assert.doesNotMatch(lib, /polyspec_sample::Boxed\b/, path);
  }
  // The property is writable in the declarations; the default is the null of the language.
  assert.match(text(out, 'packages/python/generated/python/polyspec/sample/_native.pyi'), /class Boxed:[\s\S]*def __init__\(self, value: [^=]+= None\)[\s\S]*@value\.setter/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export declare class Boxed \{[^}]*constructor\(value\?: [^)]*\);[^}]*\n {2}value: /);
  // PHP holds nothing of the class.
  assert.doesNotMatch(text(out, 'packages/php-ext/generated/lib.rs'), /\bBoxed\b/);
  // GN-15c: Go keeps the value in a struct of package binding, whose writable property is an exported field; the
  // constructor describes its argument, nil being the argument left out, and the entry of the C ABI only judges.
  const binding = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
  assert.match(binding, /\ntype Boxed struct \{\n\tValue any\n\}\n/);
  assert.match(binding, /\nfunc NewBoxed\(value_ any\) \(\*Boxed, error\) \{\n\tcall := NewCall\(\)\n\tdefer call\.Close\(\)\n\tenc := NewWriter\(\)\n\tenc\.Uint\(uint64\(call\.handle\)\)\n\tif value_ == nil \{\n\t\tenc\.Tag\(false\)\n\t\} else \{\n\t\tenc\.Tag\(true\)\n\t\tcall\.describe\(enc, reflect\.ValueOf\(value_\)\)\n\t\}\n/);
  assert.match(binding, /return C\.\w+_boxed__new\(pointer, length, result\)/);
  assert.match(binding, /\n\treturn &Boxed\{Value: value_\}, nil\n\}/);
  assert.match(binding, /int32_t \w+_boxed__new\(const uint8_t \*args, size_t len, \w+_buffer \*result\);/);
  // An instance is node 11 with the kind of its in row and one handle per pointer, and op 2 reads the kept value.
  assert.match(binding, /\tcase \*Boxed:\n\t\tif found == nil \{\n\t\t\treturn false\n\t\t\}\n\t\tc\.describeKept\(enc, 12, found, func\(\) \(any, error\) \{ return found\.Value, nil \}\)\n\t\treturn true/);
  assert.match(binding, /handle, ok := c\.seen\[instance\]/);
  assert.match(binding, /\tcase op == 2 && held\.read != nil:/);
  // Node 12 of a result makes the struct before its content, so a later place of its handle is the same pointer.
  assert.match(binding, /\tcase 12:\n\t\treturn r\.kept\(made, instance\)\n/);
  assert.match(binding, /\tcase 0:\n\t\tkept := &Boxed\{\}\n\t\t\*made = append\(\*made, kept\)\n\t\tkept\.Value = r\.value\(made, instance\)\n\t\treturn kept\n/);
  assert.equal(binding.match(/\tcase 12:/g)?.length, 1);
  // The package of the module names the struct as an alias and gives its constructor.
  const pkg = text(out, 'packages/go/zz_generated_sample.go');
  assert.match(pkg, /\ntype Boxed = binding\.Boxed\n/);
  assert.match(pkg, /\nfunc NewBoxed\(value_ any\) \(\*Boxed, error\) \{\n\treturn binding\.NewBoxed\(value_\)\n\}\n/);
  const goLib = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(goLib, /pub unsafe extern "C" fn \w+_boxed__new\(args: \*const u8, len: usize, result: \*mut Buffer\) -> i32 \{/);
  assert.match(goLib, /let call = uint_in\(&mut input\)\?;\n\s*let value: Option<HostValue> = optional_in\(&mut input, read_host\)\?;\n\s*finish_input\(input\)\?;\n\s*let mut host = GoHost \{ call \};\n\s*if let Err\(failure\) = polyspec_sample::check_boxed\(&mut host, value\) \{\n\s*return Err\(failure_error\(failure\)\);/);
  assert.match(goLib, /\[12\] => ValueKind::Reference,/);
  assert.match(goLib, /fn read\(&mut self, value: Handle\) -> Result<HostValue, Raised> \{\n\s*let mut values = self\.ask\(2, value, 0, 1\)\?;/);
  assert.match(goLib, /OutValue::Reference \{ handle, value \} => \{\n\s*if let Some\(index\) = made\.get\(&handle\.raw\(\)\) \{\n\s*output\.push\(8\);\n\s*write_length\(output, \*index\);\n\s*return;\n\s*\}\n\s*made\.insert\(handle\.raw\(\), made\.len\(\)\);\n\s*output\.push\(12\);\n\s*uint_out\(output, 0u64\);\n\s*make\(output, \*value, source, made\);\n\s*\}/);
  assert.doesNotMatch(goLib, /polyspec_sample::Boxed\b/);
});

test('the kept contract of the end-to-end check generates its value classes for Go, and a map of a Go test is a local that statements fill (GN-6af, GN-15c, G-5)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/kept/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  assert.deepEqual(contract.targets, ['php', 'python', 'node', 'go', 'wasm']);
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_kept', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: contract.targets });
  const goTests = text(out, 'packages/go/zz_generated_test.go');
  // gofmt keeps a function literal on one line only while it is short, so no case value is one.
  assert.doesNotMatch(goTests, /func\(\) [^\n]*\{ [^\n]*; return /);
  assert.match(goTests, /\nfunc TestB4BagNewBytesThatAreNoTextAreNoEntry\(t \*testing\.T\) \{\n\tentries0 := &binding\.KeyedMap\[any\]\{\}\n\tentries0\.Set\(binding\.TextKey\("k"\), \[\]byte\("\\xff"\)\)\n\t_, err := NewBag\(entries0\)\n/);
  // The object and the reference that hold each other are made, filled and compared by their places.
  assert.match(goTests, /\nfunc TestGN13eSameAReferenceAndAnObjectThatHoldEachOtherComeBack\(t \*testing\.T\) \{\n\treference0 := must\(binding\.NewBoxed\(nil\)\)\n\tobject1 := must\(binding\.NewBag\(nil\)\)\n\tobject1\.Entries\.Set\(binding\.TextKey\("self"\), reference0\)\n\tobject1\.Entries\.Set\(binding\.TextKey\("again"\), object1\)\n\treference0\.Value = object1\n/);
  assert.match(goTests, /places\(value0\) != places\(want\)/);
  for (const name of ['TestGN13eBagNewNoEntriesAreTheEmptyMap', 'TestGN13eBagEntriesTheEntriesAreKept', 'TestB4BoxedNewBytesThatAreNoTextAreNotBoxed', 'TestGN13eBoxedValueNothingIsNull', 'TestGN13eCountAnObjectAtTwoPlacesCountsOnce']) {
    assert.ok(goTests.includes(`\nfunc ${name}(t *testing.T) {`), name);
  }
  assert.doesNotMatch(goTests, /t\.Fatal\("/);
  // PHP takes its own stdClass and references and holds nothing of the classes.
  assert.doesNotMatch(text(out, 'packages/php-ext/generated/lib.rs'), /\b(Bag|Boxed)\b/);
});

test('the members of a value class without core_type and a primitive run their cases (GN-13, GN-6af, GN-13d)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const targets = ['python', 'node', 'wasm', 'go'];
  sample.units.push({
    id: 'boxed', name: ['boxed'], module: '', kind: 'class', visibility: 'public', origin: 'value', only: { targets, reason: 'the test of GN-6af' },
    members: [
      { id: 'boxed.constructor', name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [{ name: ['value'], type: { unit: 'data' }, default: { literal: null } }], raises: ['polyspec_sample::Error::Unsupported'], wait: 'none', core: 'polyspec_sample::check_boxed' },
      { id: 'boxed.value', name: ['value'], kind: 'property', visibility: 'public', returns: { unit: 'data' }, raises: [], wait: 'none', writable: true },
    ],
  });
  // An int leaves Node by two forms, a number or a bigint, so a result of the alias is not compared there; a property
  // of the class gives the value as it was given, which is compared.
  const data = sample.units.find((u: any) => u.id === 'data');
  data.out.push(
    { kind: 'int', when: { predicate: 'safe_integer', is: true }, make: { php: 'int', python: 'int', node: 'int', go: 'int', wasm: 'int' } },
    { kind: 'int', when: { predicate: 'safe_integer', is: false }, make: { php: 'int', python: 'int', node: 'bigint', go: 'int', wasm: 'bigint' } },
  );
  data.in = data.in.filter((row: any) => row.node !== 'number');
  data.in.push(
    { python: 'int', cases: [{ kind: 'int', read: 'builtin' }] },
    { node: 'number', cases: [{ when: { predicate: 'integral_float', is: false }, kind: 'float', read: 'builtin' }, { when: { predicate: 'safe_integer', is: true }, kind: 'int', read: 'builtin' }, { when: 'else', kind: 'float', read: 'builtin' }] },
    { node: 'bigint', cases: [{ kind: 'int', read: 'builtin' }] },
  );
  for (const lang of targets) data.in.push({ [lang]: 'boxed', cases: [{ kind: 'reference', read: 'boxed.value' }] });
  const tag = sample.units.find((u: any) => u.id === 'tag');
  tag.members.push({ id: 'tag.weight', name: ['weight'], kind: 'primitive', visibility: 'public', parameters: [], returns: 'float', raises: [], wait: 'none', core: { path: 'polyspec_sample::Tag::weight', receiver: '&self' } });
  sample.cases.push(
    { member: 'boxed.constructor', file: 'contracts/cases.json', group: 'boxed_constructor' },
    { member: 'boxed.value', file: 'contracts/cases.json', group: 'boxed_value' },
    { member: 'tag.weight', file: 'contracts/cases.json', group: 'tag_weight' },
  );
  const caseFiles = sampleCases();
  const cases = caseFiles.get('contracts/cases.json') as Record<string, unknown>;
  cases['boxed_constructor'] = [
    { id: 'a_text_is_boxed', value: { kind: 'text', value: 'x' } },
    { id: 'bytes_that_are_no_text_are_not_boxed', value: { kind: 'bytes', value: { hex: 'ff' } }, raises: { kind: 'unsupported', status: null, category: 'value' } },
  ];
  cases['boxed_value'] = [{ id: 'the_value_is_kept', value: { kind: 'text', value: 'x' }, result: { kind: 'text', value: 'x' } }, { id: 'an_int_is_kept_as_it_was_given', value: { kind: 'int', value: 1 }, result: { kind: 'int', value: 1 } }];
  cases['tag_weight'] = [{ id: 'a_tag_weighs_its_length', name: 'ab', result: 2 }, { id: 'no_tag_weighs_minus_zero', name: '', result: -0 }];
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles, targets: ['php', 'python', 'node', 'wasm', 'go'] });
  // Each case of the constructor and of the property runs: the raising one as B-4, the others as GN-13e; the
  // constructor counts and names its arguments (G-7).
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  for (const name of ['b4_boxed_new_bytes_that_are_no_text_are_not_boxed', 'gn13e_boxed_new_a_text_is_boxed', 'gn13e_boxed_value_the_value_is_kept', 'g7_boxed_new_counts_and_names_its_arguments']) {
    assert.match(python, new RegExp(`def test_${name}\\(self\\)`), name);
  }
  assert.doesNotMatch(python, /def test_u2_boxed_new_value_takes_none_as_a_value/);
  // U-2: an instance of a value class without core_type has no equality of its own in Python, so the test of a default
  // of its constructor compares what the instance keeps, read through its properties, and its class.
  assert.match(python, /\ndef _kept\(instance, names\):\n {4}return \(type\(instance\), \*\(getattr\(instance, name\) for name in names\)\)\n/);
  const defaulted = /def test_u2_boxed_new_value_left_out_is_its_default\(self\) -> None:\n {8}self\.assertEqual\(\n {12}_outcome\(lambda: _kept\(([^\n]+), \("value",\)\)\),\n {12}_outcome\(lambda: _kept\(([^\n]+), \("value",\)\)\),\n {8}\)/.exec(python);
  assert.ok(defaulted !== null, 'the test of the default of Boxed compares the instances themselves');
  assert.notEqual(defaulted[1], defaulted[2]);
  assert.match(python, /def test_gn13e_boxed_value_an_int_is_kept_as_it_was_given\(self\) -> None:\n {8}result = pkg\.Boxed\((.+)\)\.value\n {8}expected = \1\n/);
  for (const path of ['packages/ts/generated/tests/generated.test.mjs', 'packages/ts/wasm/generated/tests/generated.test.mjs']) {
    const tests = text(out, path);
    for (const name of ['B-4: Boxed.constructor bytes_that_are_no_text_are_not_boxed', 'GN-13e: Boxed.constructor a_text_is_boxed', 'GN-13e: Boxed.value the_value_is_kept', 'G-7: Boxed.constructor counts and names its arguments']) {
      assert.ok(tests.includes(`test('${name}'`), `${path}: ${name}`);
    }
  }
  for (const path of ['packages/ts/generated/tests/generated.test.mjs', 'packages/ts/wasm/generated/tests/generated.test.mjs']) {
    const tests = text(out, path);
    // The property is read on the instance that the constructor makes from the case's keys.
    assert.match(tests, /test\('GN-13e: Boxed\.value the_value_is_kept', \(\) => \{\n {2}assert\.deepStrictEqual\(ordered\(new pkg\.Boxed\('x'\)\.value\), ordered\('x'\)\);/, path);
    // The property gives the value as the language gave it, so the expected value is written as the argument was.
    assert.match(tests, /test\('GN-13e: Boxed\.value an_int_is_kept_as_it_was_given', \(\) => \{\n {2}assert\.deepStrictEqual\(ordered\(new pkg\.Boxed\((.+)\)\.value\), ordered\(\1\)\);/, path);
    // The default of the constructor is the null of the language, so null is no refused value there (GN-13d).
    assert.doesNotMatch(tests, /U-2: Boxed\.constructor takes null/, path);
    // A primitive runs its case through the number form of the instance.
    // assert.strictEqual compares by Object.is, and a negative zero is written as one.
    assert.match(tests, /test\('N-4: Tag\.weight a_tag_weighs_its_length', \(\) => \{\n {2}assert\.strictEqual\(Number\(new pkg\.Tag\('ab'\)\), 2\);/, path);
    assert.match(tests, /test\('N-4: Tag\.weight no_tag_weighs_minus_zero', \(\) => \{\n {2}assert\.strictEqual\(Number\(new pkg\.Tag\(''\)\), -0\);/, path);
  }
  // GN-15c: Go runs the cases of the constructor and of the property; the property is the field of the instance that
  // the constructor makes, and the result is compared by its values and by the places of its instances.
  const goTests = text(out, 'packages/go/zz_generated_test.go');
  assert.match(goTests, /\nfunc TestB4BoxedNewBytesThatAreNoTextAreNotBoxed\(t \*testing\.T\) \{\n\t_, err := NewBoxed\(\[\]byte\("\\xff"\)\)\n/);
  assert.match(goTests, /\nfunc TestGN13eBoxedNewATextIsBoxed\(t \*testing\.T\) \{\n\t_, err := NewBoxed\("x"\)\n/);
  assert.match(goTests, /\nfunc TestGN13eBoxedValueAnIntIsKeptAsItWasGiven\(t \*testing\.T\) \{\n\t(made\d+), (failure\d+) := NewBoxed\(int64\(1\)\)\n\tif \2 != nil \{\n\t\tt\.Fatalf\("GN-13f: %v", \2\)\n\t\}\n\tvalue0, err := kept\(\1\.Value\)\n\tif err != nil \{\n\t\tt\.Fatalf\("GN-13e: %v", err\)\n\t\}\n\tif want := \(any\)\(int64\(1\)\); !reflect\.DeepEqual\(value0, want\) \|\| places\(value0\) != places\(want\) \{/);
  assert.match(goTests, /\nfunc kept\[T any\]\(value T\) \(T, error\) \{ return value, nil \}\n/);
  assert.match(goTests, /\nfunc places\(top any\) string \{[\s\S]*?\t\tcase \*binding\.Boxed:\n[\s\S]*?out = append\(out, fmt\.Sprintf\("again %d", number\)\)[\s\S]*?\t\t\twalk\(found\.Value\)\n/);
  // PHP holds nothing of the class.
  assert.doesNotMatch(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /\bBoxed\b/);
});

test('the PHP extension finds the classes of PHP at startup and has no panic (GN-10)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['php'] });
  const lib = text(out, 'packages/php-ext/generated/lib.rs');
  // Only the entry points of the panic test panic, and each allows it by B-7.
  const items = lib.split(/\n\s*\n/);
  for (const item of items.filter((i) => /\bpanic!\(/.test(i))) assert.match(item, /#\[allow\(clippy::panic, reason = "B-7: [^\n]*\n\s*#\[cfg\(feature = "panic-test"\)\]/, item);
  assert.doesNotMatch(lib, /panic!\("B-4/);
  // Every class of PHP is found before anything is registered, and a missing one fails the start.
  assert.match(lib, /const BUILTIN_NAMES: \[&str; \d+\] = \[[^\]]*"RuntimeException"/);
  assert.match(lib, /extern "C" fn startup\(_kind: i32, _module: i32\) -> i32 \{\n[^\n]*\n {4}for \(slot, name\) in BUILTINS\.iter\(\)\.zip\(BUILTIN_NAMES\) \{[\s\S]*?None => return 1,[\s\S]*?let registered = ClassBuilder::new/);
});

test('a case value names a reference or an object by its id after its first place, which may make a cycle, and repeats an object (GN-13, G-5)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const targets = ['python', 'node', 'wasm', 'go'];
  const only = { targets, reason: 'the test of GN-6af' };
  sample.units.push(
    {
      id: 'boxed', name: ['boxed'], module: '', kind: 'class', visibility: 'public', origin: 'value', only,
      members: [
        { id: 'boxed.constructor', name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [{ name: ['value'], type: { unit: 'data' }, default: { literal: null } }], raises: ['polyspec_sample::Error::Unsupported'], wait: 'none', core: 'polyspec_sample::check_boxed' },
        { id: 'boxed.value', name: ['value'], kind: 'property', visibility: 'public', returns: { unit: 'data' }, raises: [], wait: 'none', writable: true },
      ],
    },
    {
      id: 'bag', name: ['bag'], module: '', kind: 'class', visibility: 'public', origin: 'value', only,
      members: [
        { id: 'bag.constructor', name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [{ name: ['entries'], type: { keyed_map: { unit: 'data' }, key: ['text', 'bytes'] }, default: { empty: 'map' } }], raises: ['polyspec_sample::Error::Unsupported'], wait: 'none', core: 'polyspec_sample::check_bag' },
        { id: 'bag.entries', name: ['entries'], kind: 'property', visibility: 'public', returns: { keyed_map: { unit: 'data' }, key: ['text', 'bytes'] }, raises: [], wait: 'none', writable: true },
      ],
    },
  );
  const data = sample.units.find((u: any) => u.id === 'data');
  data.out.push({ kind: 'reference', make: { php: 'php_reference', python: 'boxed.constructor', node: 'boxed.constructor', go: 'boxed.constructor', wasm: 'boxed.constructor' } });
  for (const lang of targets) data.in.push({ [lang]: 'boxed', cases: [{ kind: 'reference', read: 'boxed.value' }] });
  const cases = sampleCases();
  const file = cases.get('contracts/cases.json') as Record<string, unknown[]>;
  const inner = { kind: 'reference', value: { id: 1, value: { kind: 'text', value: 'x' } } };
  const outer = { kind: 'reference', value: { id: 0, value: { kind: 'list', value: [inner] } } };
  const object = { kind: 'object', id: 0, value: [['a', { kind: 'object', id: 0 }]] };
  const repeated = { kind: 'object', repeat: 3, key: 'k', value: { kind: 'null' } };
  const later = (id: number): unknown => ({ kind: 'reference', value: { id } });
  file['echo']?.push(
    { id: 'shared_places', value: { kind: 'list', value: [outer, later(1), later(0), object, { kind: 'object', id: 0 }, repeated] } },
    // A top reference has no PHP form: its case-test entry point describes the later place of the object by the
    // identity of the first.
    { id: 'a_top_reference_of_an_object_twice', value: { kind: 'reference', value: { id: 0, value: { kind: 'list', value: [{ kind: 'object', id: 0, value: [['a', { kind: 'null' }]] }, { kind: 'object', id: 0 }] } } } },
  );
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: cases, targets: ['php', 'python', 'node', 'wasm', 'go'] });
  // Each id is one instance, made without content before any value, then filled, so a later place, inside the first
  // or not, holds the same instance; a repeated object is made from the outermost in.
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.ok(python.includes(
    '(r0 := pkg.Boxed(), r1 := pkg.Boxed(), o0 := pkg.Bag({}), setattr(r1, "value", "x"), setattr(r0, "value", [r1]), o0.entries.__setitem__("a", o0), ' +
      '[r0, r1, r0, o0, o0, (lambda top: (lambda at: ([at.__setitem__(0, at[0].entries.setdefault("k", pkg.Bag({}))) for _ in range(2)], at[0].entries.__setitem__("k", None), top)[-1])([top]))(pkg.Bag({}))])[-1]',
  ), 'python');
  for (const path of ['packages/ts/generated/tests/generated.test.mjs', 'packages/ts/wasm/generated/tests/generated.test.mjs']) {
    assert.ok(text(out, path).includes(
      "(() => { const r0 = new pkg.Boxed(); const r1 = new pkg.Boxed(); const o0 = new pkg.Bag(new Map()); r1.value = 'x'; r0.value = [r1]; o0.entries.set('a', o0); " +
        "return [r0, r1, r0, o0, o0, (() => { const top = new pkg.Bag(new Map()); let at = top; for (let i = 1; i < 3; i += 1) { const next = new pkg.Bag(new Map()); at.entries.set('k', next); at = next; } at.entries.set('k', null); return top; })()]; })()",
    ), path);
  }
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.ok(php.includes(
    '(static function () { $o0 = new \\stdClass(); $r1 = "x"; $r0 = [&$r1]; $o0->{"a"} = $o0; ' +
      'return [&$r0, &$r1, &$r0, $o0, $o0, array_reduce(array_fill(0, 3, null), fn ($inner) => (object) ["k" => $inner], null)]; })()',
  ), 'php');
  const lib = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(lib, /let object_0 = host\.reserve\(\);\n\s*let value = HostValue::PhpReference \{ identity: Handle::new\(0\), target: Box::new\(/);
  assert.match(lib, /let entries = vec!\[\(HostValue::Text\(HostText::Bytes\(vec!\[97_u8\]\)\), HostValue::Null\)\];\n\s*host\.fill\(object_0, entries\);\n\s*HostValue::StdClass \{ handle: object_0, len: 1 \}/);
  assert.match(lib, /\(HostValue::Int\(1\), HostValue::StdClass \{ handle: object_0, len: 1 \}\)/);
  // GN-15c: Go makes each instance by its constructor as a statement of the test, then fills it, so a later place of
  // an id is the same pointer; a repeated object is made from the outermost in.
  const goTests = text(out, 'packages/go/zz_generated_test.go');
  assert.ok(goTests.includes([
    '\treference0 := must(binding.NewBoxed(nil))',
    '\treference1 := must(binding.NewBoxed(nil))',
    '\tobject2 := must(binding.NewBag(nil))',
    '\tobject3 := must(binding.NewBag(nil))',
    '\treference1.Value = "x"',
    '\treference0.Value = []any{reference1}',
    '\tobject2.Entries.Set(binding.TextKey("a"), object2)',
    '\tobject4 := object3',
    '\tfor range 2 {',
    '\t\tnext := must(binding.NewBag(nil))',
    '\t\tobject4.Entries.Set(binding.TextKey("k"), next)',
    '\t\tobject4 = next',
    '\t}',
    '\tobject4.Entries.Set(binding.TextKey("k"), nil)',
  ].join('\n')), 'go');
  assert.match(goTests, /Same\(\[\]any\{reference0, reference1, reference0, object2, object2, object3\}\)/);
  assert.match(goTests, /\nfunc must\[T any\]\(made T, err error\) T \{\n\tif err != nil \{\n\t\tpanic\(/);
});

test('a result of a value alias is compared by the texts of its places in pre-order, which name the form, the identity and the cycles (GN-13e)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const only = { targets: ['python', 'node', 'wasm'], reason: 'the test of GN-13e' };
  sample.units.push(
    {
      id: 'boxed', name: ['boxed'], module: '', kind: 'class', visibility: 'public', origin: 'value', only,
      members: [
        { id: 'boxed.constructor', name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [{ name: ['value'], type: { unit: 'data' }, default: { literal: null } }], raises: ['polyspec_sample::Error::Unsupported'], wait: 'none', core: 'polyspec_sample::check_boxed' },
        { id: 'boxed.value', name: ['value'], kind: 'property', visibility: 'public', returns: { unit: 'data' }, raises: [], wait: 'none', writable: true },
      ],
    },
    {
      id: 'bag', name: ['bag'], module: '', kind: 'class', visibility: 'public', origin: 'value', only,
      members: [
        { id: 'bag.constructor', name: ['constructor'], kind: 'constructor', visibility: 'public', parameters: [{ name: ['entries'], type: { keyed_map: { unit: 'data' }, key: ['text', 'bytes'] }, default: { empty: 'map' } }], raises: ['polyspec_sample::Error::Unsupported'], wait: 'none', core: 'polyspec_sample::check_bag' },
        { id: 'bag.entries', name: ['entries'], kind: 'property', visibility: 'public', returns: { keyed_map: { unit: 'data' }, key: ['text', 'bytes'] }, raises: [], wait: 'none', writable: true },
      ],
    },
  );
  const data = sample.units.find((u: any) => u.id === 'data');
  data.out.push(
    { kind: 'reference', make: { php: 'php_reference', python: 'boxed.constructor', node: 'boxed.constructor', go: 'null', wasm: 'boxed.constructor' } },
    { kind: 'object', make: { php: 'php_object', python: 'bag.constructor', node: 'bag.constructor', go: 'null', wasm: 'bag.constructor' } },
  );
  const cases = sampleCases();
  const file = cases.get('contracts/cases.json') as Record<string, unknown[]>;
  const reference = { kind: 'reference', value: { id: 0, value: { kind: 'text', value: 'x' } } };
  const object = { kind: 'object', id: 0, value: [['a', { kind: 'null' }]] };
  file['echo'] = [
    { id: 'shared_places', value: { kind: 'text', value: 'x' }, result: { kind: 'list', value: [reference, { kind: 'reference', value: { id: 0 } }, object, { kind: 'object', id: 0 }, { kind: 'float', value: 1.5 }] } },
    { id: 'a_deep_list', value: { kind: 'text', value: 'x' }, result: { kind: 'list', repeat: 3000, value: { kind: 'null' } } },
  ];
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: cases, targets: ['php', 'python', 'node', 'wasm'] });
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  const wasm = text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  // The bits of a float as the tokens write them: 16 hexadecimal digits.
  const bitsOf = (float: number): string => {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, float);
    return view.getBigUint64(0).toString(16).padStart(16, '0');
  };
  const shared = (lang: 'python' | 'node' | 'php'): string[] => lang === 'php'
    ? ['list 5', 'php_reference #0', 'string 78', 'php_reference again 0', 'php_object #1 1', 'string 61', 'null', 'php_object again 1', `float ${bitsOf(1.5)}`]
    : ['list 5', 'boxed #0', 'text 78', 'boxed again 0', 'bag #1', 'map 1', 'text 61', 'null', 'bag again 1', `${lang === 'node' ? 'number' : 'float'} ${bitsOf(1.5)}`];
  const json = (lang: 'python' | 'node' | 'php'): string => JSON.stringify(shared(lang));
  // The alias has the entry points of codec-test, so the result is compared by these texts and goes back through them.
  assert.ok(python.includes(`result = pkg.same("x")\n        expected = json.loads(${JSON.stringify(json('python'))})\n        self.assertEqual(_tokens(result), expected)`), python);
  assert.match(python, /^import json\nimport struct\n/m);
  assert.match(python, /^_KEPT = \(\(pkg\.Boxed, "boxed", "value"\), \(pkg\.Bag, "bag", "entries"\), \)$/m);
  for (const js of [node, wasm]) {
    assert.ok(js.includes(`const result = pkg.same('x');\n  const expected = JSON.parse('${json('node')}');\n  assert.deepStrictEqual(tokens(result), expected);`), js);
    assert.match(js, /^const KEPT = \[\[pkg\.Boxed, 'boxed', 'value'\], \[pkg\.Bag, 'bag', 'entries'\]\];$/m);
  }
  assert.ok(php.includes(`$result = \\Polyspec\\Sample\\same("x");\n        $expected = json_decode(${JSON.stringify(json('php'))}, true, 512, JSON_THROW_ON_ERROR);\n        self::assertSame($expected, self::tokens($result));`), php);
  assert.match(php, /private static function tokens\(mixed \$top\): array/);
  // A value nested deeper than a recursion takes is its texts, one per place.
  const deep = JSON.stringify([...Array.from({ length: 3000 }, () => 'list 1'), 'null']);
  assert.ok(python.includes(JSON.stringify(deep)), 'deep');
  assert.doesNotMatch(python + node + wasm + php, /with which a result is not compared yet/);
});

test('the result of an alias with the entry points of codec-test goes back through its in and out functions to the same texts (GN-13e, U-1)', () => {
  const out = sampleWith(() => {}, ['python', 'node', 'php']);
  const wasm = sampleWith(() => {}, ['wasm']);
  const expected = JSON.stringify(['text 78']);
  const python = text(out, pythonTests);
  assert.ok(python.includes(`        result = pkg.same("x")\n        expected = json.loads(${JSON.stringify(expected)})\n        self.assertEqual(_tokens(result), expected)\n        self.assertEqual(_tokens(_native._alias_round_data(result)), expected)`), python);
  assert.ok(text(out, nodeTests).includes(`  const result = pkg.same('x');\n  const expected = JSON.parse('${expected}');\n  assert.deepStrictEqual(tokens(result), expected);\n  assert.deepStrictEqual(tokens(addon().__aliasRoundData(result)), expected);`), 'node');
  const js = text(wasm, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  assert.ok(js.includes(`test('GN-13e: same a_text_comes_back', async () => {\n  const glue = await glueModule();\n  const result = pkg.same('x');\n  const expected = JSON.parse('${expected}');\n  assert.deepStrictEqual(tokens(result), expected);\n  assert.deepStrictEqual(tokens(glue.__aliasRoundData(result)), expected);`), js);
  const phpOut = text(out, phpTests);
  assert.ok(phpOut.includes(`        $result = \\Polyspec\\Sample\\same("x");\n        $expected = json_decode(${JSON.stringify(JSON.stringify(['string 78']))}, true, 512, JSON_THROW_ON_ERROR);\n        self::assertSame($expected, self::tokens($result));\n        self::assertSame($expected, self::tokens(\\Polyspec\\Sample\\Internal\\aliasRoundData($result)));`), phpOut);
  // Each entry point takes the value by the in function of the alias and gives it back by its out function.
  assert.match(text(out, 'packages/python/generated/lib.rs'), /#\[cfg\(feature = "codec-test"\)\]\n#\[pyfunction\]\nfn _alias_round_data<'py>\(py: Python<'py>, value: &Bound<'py, PyAny>\) -> PyResult<Bound<'py, PyAny>> \{\n    guard\(py, \|\| \{\n        let value: polyspec_sample::Data = in_data\(py, value, "value"\)\?;\n        out_data\(py, &value\)/);
  assert.match(text(out, 'packages/python/generated/lib.rs'), /module\.add_function\(wrap_pyfunction!\(_alias_round_data, module\)\?\)\?;/);
  assert.match(text(out, 'packages/ts/generated/lib.rs'), /#\[napi\(js_name = "__aliasRoundData"\)\]\npub fn alias_round_data<'env>\(env: &'env Env, value: Unknown<'env>\) -> napi::Result<Unknown<'env>> \{\n    guard\(\|\| \{\n        let value: polyspec_sample::Data = in_data\(env, value, "value"\)\?;\n        out_data\(env, &value\)/);
  assert.match(text(wasm, 'packages/ts/wasm/generated/lib.rs'), /#\[wasm_bindgen\(js_name = "__aliasRoundData"\)\]\n {4}pub fn alias_round_data\(value: JsValue\) -> Result<JsValue, JsValue> \{\n {8}guard\(\|\| \{\n {12}let value: polyspec_sample::Data = in_data\(&value, "value"\)\?;\n {12}out_data\(&value\)/);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /#\[php\(name = "Polyspec\\\\Sample\\\\Internal\\\\aliasRoundData"\)\]\npub fn alias_round_data\(value: &Zval\) -> Result<Zval, PhpException> \{\n    guard\(\|\| \{\n        let value: polyspec_sample::Data = in_data\(value, "value"\)\?;\n        out_data\(&value\)/);
  assert.match(php, /let module = module\.function\(wrap_function!\(alias_round_data\)\);/);
});

test('PHP makes a stdClass and a reference with their identity, and a case value with references in a closure (U-7, GN-6af, GN-13)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const data = sample.units.find((u: any) => u.id === 'data');
  data.out.push({ kind: 'reference', make: { php: 'php_reference', python: 'null', node: 'null', go: 'null', wasm: 'null' } });
  const cases = sampleCases();
  const file = cases.get('contracts/cases.json') as Record<string, unknown[]>;
  const one = { kind: 'reference', value: { id: 0, value: { kind: 'text', value: 'x' } } };
  file['echo']?.push(
    { id: 'a_shared_reference', value: { kind: 'list', value: [one, { kind: 'reference', value: { id: 0 } }] } },
    { id: 'a_top_reference', value: one },
  );
  const out = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: cases, targets: ['php'] });
  const lib = text(out, 'packages/php-ext/generated/lib.rs');
  // The make keeps the objects and references that it made under their handles, and makes each before its content.
  assert.match(lib, /struct PhpMaking \{[^}]*objects: std::collections::BTreeMap<u64, \*mut ZendObject>,[^}]*references: std::collections::BTreeMap<u64, \*mut ext_php_rs::ffi::zend_reference>,/);
  assert.match(lib, /OutValue::Reference \{ handle, value \} =>[\s\S]*making\.references\.get\(&handle\.raw\(\)\)[\s\S]*php_new_reference\(\)\?;[\s\S]*php_set_reference\(reference, content\);/);
  assert.match(lib, /making\.objects\.get\(&handle\.raw\(\)\)[\s\S]*php_property\(object, key, item\)\?;/);
  // A property name and an array key are the bytes of the key.
  assert.match(lib, /fn php_property\(object: \*mut ZendObject, key: OutValue, item: Zval\)/);
  assert.match(lib, /OutValue::Bytes\(bytes\) => \{\n\s*let name = ZendStr::new\(bytes\.value\(\), false\);\n\s*array\.insert\(ext_php_rs::types::ArrayKey::ZendString\(&name\), item\)/);
  const tests = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  // A shared reference is one variable, which both places take by reference.
  assert.match(tests, /\(static function \(\) \{ \$r0 = "x"; return \[&\$r0, &\$r0\]; \}\)\(\)/);
  // A reference that is the value itself has no PHP form: the entry point of case-test gives it as host values to the
  // in function of the alias, and the test runs it.
  assert.match(tests, /because the value has no PHP form: a reference that is no place of an array or of a property[^\n]*\n {5}\*\/\n {4}public function testGn13esameATopReference\(\): void\n {4}\{\n {8}\\Polyspec\\Sample\\Internal\\caseTest0\(\);\n {8}self::addToAssertionCount\(1\);/);
  assert.doesNotMatch(tests, /self::fail\("[^"]*no place of an array/);
  assert.match(lib, /#\[cfg\(feature = "case-test"\)\]\n {4}#\[php_function\]\n {4}#\[php\(name = "Polyspec\\\\Sample\\\\Internal\\\\caseTest0"\)\]\n {4}pub fn case_test_0\(\) -> Result<\(\), PhpException> \{/);
  assert.match(lib, /let value = HostValue::PhpReference \{ identity: Handle::new\(0\), target: Box::new\(HostValue::Text\(HostText::Bytes\(vec!\[120_u8\]\)\)\) \};\n\s*let _value: polyspec_sample::Data = polyspec_sample::data_from_host\(&mut host, value\)/);
  assert.match(lib, /#\[cfg\(feature = "case-test"\)\]\n {8}let module = module\.function\(wrap_function!\(case_test_0\)\);/);
  // The PHP crate has the feature case-test, because PHP has such a case.
  assert.deepEqual(caseTestTargets({ contract: sample, caseFiles: cases }), ['php']);
  assert.match(String(trackedPackages(sample, '0.0.0', new Map(), [], new Map(), ['php']).get('packages/php-ext/Cargo.toml')), /\npanic-test = \[\]\ncase-test = \[\]\n/);
  assert.doesNotMatch(String(trackedPackages(sample, '0.0.0').get('packages/php-ext/Cargo.toml')), /case-test/);
});

// The lines of a generated crate that a build without a feature compiles: each item under `#[cfg(feature = "...")]`
// or `#[cfg(any(feature = ...))]` is left out, from its attributes to the line that closes it at its own indentation.
const withoutFeatures = (code: string): string => {
  const lines = code.split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!/^\s*#\[cfg\((any\()?feature = /.test(line)) {
      kept.push(line);
      continue;
    }
    const indent = /^\s*/.exec(line)?.[0] ?? '';
    // The attributes and the comments above the item belong to it, as do the attributes below this one.
    while (/^\s*(#\[|\/\/)/.test(kept.at(-1) ?? '') && (/^\s*/.exec(kept.at(-1) ?? '')?.[0] ?? '') === indent) kept.pop();
    i += 1;
    while (/^\s*(#\[|\/\/)/.test(lines[i] ?? '')) i += 1;
    // An item of one line ends with `;` or closes its own braces; any other ends at the closing line of its indentation.
    const first = lines[i] ?? '';
    if (/;$/.test(first) && !/\{$/.test(first)) continue;
    if (/\}[;,)]*$/.test(first) && first.startsWith(indent) && !/[{(]$/.test(first)) continue;
    while (i < lines.length && !/^[})\]]+[;,]?$/.test((lines[i] ?? '').slice(indent.length)) ) i += 1;
    assert.ok(i < lines.length, `the item under ${line.trim()} has no closing line`);
  }
  return kept.join('\n');
};

// The names that the `use` lines of Rust code bring into scope, without the glob imports and the `as _` imports.
const importedNames = (code: string): string[] =>
  [...code.matchAll(/^\s*(?:pub )?use ([^;]+);$/gm)].flatMap((m) => {
    const path = m[1] ?? '';
    const brace = /\{(.*)\}$/.exec(path);
    const leaves = brace === null ? [path] : (brace[1] ?? '').split(',').map((leaf) => leaf.trim()).filter((leaf) => leaf !== '');
    return leaves.map((leaf) => (/ as (\w+)$/.exec(leaf)?.[1] ?? leaf.split('::').at(-1) ?? '')).filter((name) => name !== '*' && name !== '_' && name !== 'self');
  });

// A trait is used by its name or by a call of one of its methods, which does not write its name.
const TRAIT_METHODS: Record<string, RegExp> = {
  IntoZval: /\.(into_zval|set_zval)\(/,
  FromZval: /\b\w+::from_zval\(/,
  JsObjectValue: /\.(get|set)_named_property/,
  JsValue: /\.(is_array|is_typedarray|to_unknown|raw)\(/,
  JsCast: /\.(dyn_ref|dyn_into|unchecked_into|unchecked_ref)\b/,
};

test('a crate without a feature uses every name that it imports: an import whose only users are entry points of a test feature is under that feature (GN-5)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const own = (library: string): Map<string, string | Buffer> =>
    generate({ contract: read(`${library}/packages/rust/interface.json`), version: '0.0.0', coreLib: `polyspec_${library.replaceAll('-', '_')}`, caseFiles: new Map([['contracts/cases.json', read(`${library}/contracts/cases.json`)]]) });
  const inputs: Record<string, () => Map<string, string | Buffer>> = {
    fixture: () => generate({ ...load(), version: '0.0.0', coreLib: 'polyspec_sample' }),
    sample: () => sampleWith(() => undefined),
    // The contract of shapes has classes with a write place and passes no class as an argument.
    shapes: () => shaped(),
    variants: () => variants(),
    classes: () => own('classes'),
    functions: () => own('functions'),
    points: () => own('points'),
    consumer: () => generate({ ...consumerSample(), version: '0.0.0', coreLib: 'polyspec_consumer' }),
    plot: () => generate({ ...plotSample(), version: '0.0.0', coreLib: 'polyspec_plot' }),
    relay: () => generate({ ...relaySample(), version: '0.0.0', coreLib: 'polyspec_relay' }),
  };
  const unused: string[] = [];
  let crates = 0;
  for (const [name, make] of Object.entries(inputs)) {
    const out = make();
    for (const path of [...out.keys()].filter((p) => p.endsWith('/lib.rs'))) {
      crates += 1;
      const plain = withoutFeatures(text(out, path));
      const body = plain.replace(/^\s*(?:pub )?use [^;]+;$/gm, '').replace(/^\s*\/\/.*$/gm, '');
      for (const imported of new Set(importedNames(plain))) {
        // A path that names the item in full (`ext_php_rs::convert::FromZval`) does not use the import.
        const named = new RegExp(`(?<!::)\\b${imported}\\b`).test(body);
        if (!named && TRAIT_METHODS[imported]?.test(body) !== true) unused.push(`${name} ${path}: ${imported}`);
      }
    }
  }
  assert.ok(crates >= 20, `the test read ${String(crates)} crates`);
  assert.deepEqual(unused, []);
});

// The generated text that the lints and the tools of each target refused in the end-to-end check.
const e2eOwn = (library: string, targets?: string[]): Map<string, string | Buffer> => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${library}/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  return generateTargets({ contract, version: '0.0.0', coreLib: `polyspec_${library}`, caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), ...(targets === undefined ? {} : { targets: targets as Inputs['targets'] & string[] }) });
};

test('the number of the thread of a thrown object is read without a match that clippy names manual_unwrap_or_default (U-3, GN-6u, R-1)', () => {
  const out = sampleWith(() => undefined, ['php', 'node']);
  for (const path of ['packages/php-ext/generated/lib.rs', 'packages/ts/generated/lib.rs']) {
    const lib = text(out, path);
    assert.match(lib, /fn thrown_thread\(\) -> u64 \{\n    let Ok\(thread\) = THROWN_THREAD\.try_with\(\|thread\| thread\.0\) else \{\n        return 0;\n    \};\n    thread\n\}/, path);
    assert.doesNotMatch(lib, /Ok\(thread\) => thread,\n\s+Err\(_ending\) => 0,/, path);
  }
});

test('the count and the position of a handle are read by Result::unwrap_or, which R-1 allows, without an allow of manual_unwrap_or (GN-6u, R-1)', () => {
  const out = generate({ ...relaySample(), version: '0.0.0', coreLib: 'polyspec_relay' });
  for (const path of ['packages/php-ext/generated/lib.rs', 'packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs']) {
    const lib = text(out, path);
    assert.ok(lib.includes('fn handle_count(value: usize) -> u64 {\n    u64::try_from(value).unwrap_or(u64::MAX)\n}'), path);
    // A crate keeps the helper of the position only where its host reads a position.
    if (lib.includes('fn handle_position(')) assert.ok(lib.includes('fn handle_position(value: u64) -> usize {\n    usize::try_from(value).unwrap_or(usize::MAX)\n}'), path);
    assert.doesNotMatch(lib, /clippy::manual_unwrap_or\b(?!_)/, path);
  }
});

test('the Python crate declares the cfg pyo3_disable_reference_pool that its generated code reads, in its build script (GN-6u)', () => {
  const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const out = trackedPackages(contract, '0.0.0');
  assert.match(String(out.get('packages/python/Cargo.toml')), /\npublish = false\nbuild = "build\.rs"\n/);
  assert.match(String(out.get('packages/python/build.rs')), /fn main\(\) \{\n    println!\("cargo::rustc-check-cfg=cfg\(pyo3_disable_reference_pool\)"\);\n\}\n$/);
  // The script exists for every Python crate, because the manifest names it for every contract.
  const plain = trackedPackages(JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8')), '0.0.0');
  assert.equal(plain.get('packages/python/build.rs'), out.get('packages/python/build.rs'));
});

test('the WASM future that catches a panic of a poll is an async fn, which clippy requires of a function whose body is one async block (GN-6n, B-7)', () => {
  const wasm = text(e2eOwn('classes'), 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /\nasync fn caught<F, O>\(future: F\) -> Result<O, Fail>\nwhere\n    F: std::future::Future<Output = Result<O, Fail>>,\n\{\n    let mut future = std::pin::pin!\(future\);\n/);
  assert.doesNotMatch(wasm, /fn caught<F, O>\(future: F\) -> impl /);
  // A crate without a member with wait async_driver has neither helper: an async fn is a helper as a fn is.
  const plain = text(e2eOwn('variants'), 'packages/ts/wasm/generated/lib.rs');
  assert.ok(plain.length > 0);
  assert.doesNotMatch(plain, /fn (?:caught|awaited)</);
  assert.equal(usedHelpers('\nasync fn later() {}\n\nfn now() {}\n', 'now();'), '\nfn now() {}\n');
  assert.equal(usedHelpers('\n/// Waits.\nasync fn later() {}\n', 'later().await;'), '\n/// Waits.\nasync fn later() {}\n');
});

test('a helper is kept by what the code calls, not by the words of the code (GN-4, B2.102)', () => {
  const block = `
/// Reads the code units of a text.
fn units(value: &str) -> Vec<u16> {
    value.encode_utf16().collect()
}

/// Names a member.
fn member(name: &str) -> String {
    name.to_owned()
}

/// Gives a value back.
fn give(value: u64) -> u64 {
    value
}
`;
  const kept = (code: string): string[] => [...usedHelpers(block, code).matchAll(/^fn ([a-z_]+)/gm)].map((m) => m[1] ?? '');
  // A word of a string literal, of a raw string, of a comment and of an attribute is no use.
  assert.deepEqual(kept('fn f() -> String { String::from("the units of a member") }'), []);
  assert.deepEqual(kept('fn f() -> &\'static str { r#"give "units""# }'), []);
  assert.deepEqual(kept('/* units */ fn f() {} // member'), []);
  assert.deepEqual(kept('#[pyo3(signature = (units, member=None))]\nfn f() {}'), []);
  // A local of the function is no use: a parameter, a let, a closure parameter, the pattern of a match arm, of an if
  // let and of a for.
  assert.deepEqual(kept('fn f(units: Vec<u16>) -> usize { units.len() }'), []);
  assert.deepEqual(kept('fn f() -> usize { let units = Vec::<u16>::new(); take(units) }'), []);
  assert.deepEqual(kept('fn f(items: Vec<u8>) { items.iter().for_each(|member| drop(member)); }'), []);
  assert.deepEqual(kept('fn f(v: Option<u8>) -> u8 { match v { Some(give) => give, None => 0 } }'), []);
  assert.deepEqual(kept('fn f(v: Option<u8>) { if let Some(units) = v { drop(units); } for member in 0..3 { drop(member); } }'), []);
  assert.deepEqual(kept('fn f(v: Wide) -> u8 { let Wide { units, member: give } = v; units + give }'), []);
  // A field, a method, a macro and an associated function of another type are no use.
  assert.deepEqual(kept('fn f(v: &Host) -> Fail { Fail { member: v.units(), ..v.give!() } }'), []);
  assert.deepEqual(kept('fn f() -> Vec<u16> { Host::units() }'), []);
  // A call, a call with its types, a call by a path of the crate and a passing by the name are uses; the local of
  // another function hides nothing.
  assert.deepEqual(kept('fn f() -> Vec<u16> { units("a") }'), ['units']);
  assert.deepEqual(kept('fn f() -> u64 { give::<>(1) }'), ['give']);
  assert.deepEqual(kept('fn f() -> String { crate::member("a") }'), ['member']);
  assert.deepEqual(kept('fn f(items: Vec<u64>) -> Vec<u64> { items.into_iter().map(give).collect() }'), ['give']);
  assert.deepEqual(kept('fn f(units: u8) -> u8 { units }\nfn g(items: Vec<&str>) -> Vec<Vec<u16>> { items.into_iter().map(units).collect() }'), ['units']);
});

test('the helpers are items, kept whole: a body with a blank line, and an impl with the type that it is of (GN-4, B2.102)', () => {
  const block = `
/// A table of values.
struct Table {
    made: Vec<u64>,
}

impl Table {
    fn first(&self) -> Option<u64> {
        self.made.first().copied()
    }

    fn set(&mut self, value: u64) {
        self.made.push(value);
    }
}

impl Drop for Table {
    fn drop(&mut self) {}
}

/// Reads a value in two steps.
fn read(table: &Table) -> u64 {
    let first = table.first();

    if let Some(index) = first {
        return index;
    }
    0
}

/// The next key.
static NEXT: AtomicU64 = AtomicU64::new(1);

/// Takes the next key.
fn next_key() -> u64 {
    NEXT.fetch_add(1, Ordering::Relaxed)
}
`;
  // Nothing of the block is used: no item, no half of a body and no method of an impl is left.
  assert.equal(usedHelpers(block, 'fn f() -> &\'static str { "set the first Table, read NEXT" }'), '');
  // The function is kept with its whole body, and through it the struct, with the impls of the struct and each of
  // their methods at its indentation; the static and its function are not.
  const read = usedHelpers(block, 'fn f(table: &Table) -> u64 { read(table) }');
  assert.equal(read, `
/// A table of values.
struct Table {
    made: Vec<u64>,
}

impl Table {
    fn first(&self) -> Option<u64> {
        self.made.first().copied()
    }

    fn set(&mut self, value: u64) {
        self.made.push(value);
    }
}

impl Drop for Table {
    fn drop(&mut self) {}
}

/// Reads a value in two steps.
fn read(table: &Table) -> u64 {
    let first = table.first();

    if let Some(index) = first {
        return index;
    }
    0
}
`);
  // A static is kept by the function that reads it.
  assert.equal(usedHelpers(block, 'fn f() -> u64 { next_key() }'), `
/// The next key.
static NEXT: AtomicU64 = AtomicU64::new(1);

/// Takes the next key.
fn next_key() -> u64 {
    NEXT.fetch_add(1, Ordering::Relaxed)
}
`);
  // An impl of a type that the block does not declare is of the code, and stays.
  assert.equal(usedHelpers('\nimpl core::Lookup for CbLookup {\n    fn set(&mut self) {}\n\n    fn get(&self) {}\n}\n', 'struct CbLookup;'), '\nimpl core::Lookup for CbLookup {\n    fn set(&mut self) {}\n\n    fn get(&self) {}\n}\n');
  // A helper that only the code of a feature uses is compiled under the feature, each item of its group.
  assert.equal(usedHelpers(block, 'fn f() {}', { 'codec-test': 'fn g() -> u64 { next_key() }' }), `
/// The next key.
#[cfg(feature = "codec-test")]
static NEXT: AtomicU64 = AtomicU64::new(1);

/// Takes the next key.
#[cfg(feature = "codec-test")]
fn next_key() -> u64 {
    NEXT.fetch_add(1, Ordering::Relaxed)
}
`);
});

test('Go reads the list of the handles of a buffer exactly when the Rust crate writes it (GN-6u)', () => {
  let callbacksOnly = 0;
  let keptOnly = 0;
  for (const library of ['sample', 'shapes', 'variants', 'classes', 'points', 'functions']) {
    const out = e2eOwn(library, ['go']);
    const writes = /fn given_first\(/.test(text(out, 'packages/go/internal/ffi/generated/lib.rs'));
    const binding = text(out, 'packages/go/internal/binding/zz_generated_binding.go');
    assert.equal(/func readerOf\(bytes \[\]byte\) \*Reader \{\n\tr := &Reader\{bytes: bytes\}\n\tcount := r\.Uint\(\)\n/.test(binding), writes, library);
    assert.equal(/func readerOf\(bytes \[\]byte\) \*Reader \{ return NewReader\(bytes\) \}/.test(binding), !writes, library);
    if (!writes && /cgo\.NewHandle\(c\)/.test(binding)) callbacksOnly += 1;
    if (!writes && /func runKept\(/.test(binding)) keptOnly += 1;
  }
  // functions has a function type that the core keeps and no alias: the arguments of a kept func give no func.
  assert.equal(keptOnly, 1, 'no contract with a kept function and without an alias was read');
  // variants has a callback and no alias: Go calls back, and no buffer gives a func.
  assert.ok(callbacksOnly >= 1, 'no contract with a callback and without an alias was read');
});

test('a parameter whose callback the core keeps is refused by name in Node and changes no text of the other targets (GN-6aa, CK-90)', () => {
  const kept = (targets: Lang[], keeps: boolean): Map<string, string | Buffer> => {
    const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
    const seek = sample.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === 'sample.seek');
    if (keeps) seek.parameters[0].keeps = true;
    return generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets });
  };
  // Node writes 'env for the box and the record, and has no wrapper that outlives the environment of the call.
  assert.throws(() => kept(['node'], true), /sample\.seek\.search: a callback that the core keeps is not generated yet for node \(GN-6aa\)/);
  // Python, PHP, WASM and Go write 'static for every callback inside another type.
  for (const target of ['python', 'php', 'wasm', 'go'] as const) {
    assert.deepEqual([...kept([target], true)].map(([path, file]) => [path, String(file)]), [...kept([target], false)].map(([path, file]) => [path, String(file)]), target);
  }
});

test('a Go test gives an optional callback as a pointer to its interface, not to the struct of the fixture (U-3, GN-6aa)', () => {
  const tests = text(sampleWith(() => undefined, ['go']), 'packages/go/zz_generated_test.go');
  assert.match(tests, /Maybe\(ptr\[Lookup\]\(fixture0\), "a"\)/);
  assert.doesNotMatch(tests, /ptr\(fixture\d+\)/);
});

test('a Node or WASM test passes undefined in the place of an argument left out before the options record (U-2, GN-6i)', () => {
  const out = shaped();
  for (const path of ['packages/ts/generated/tests/generated.test.mjs', 'packages/ts/wasm/generated/tests/generated.test.mjs']) {
    const tests = text(out, path);
    assert.match(tests, /outcome\(\(\) => pkg\.pad\('ab'\)\), outcome\(\(\) => pkg\.pad\('ab', undefined, \{ side: 'left' \}\)\)/, path);
    assert.match(tests, /pkg\.pad\('ab', undefined, \{ end: '!' \}\)/, path);
    assert.doesNotMatch(tests, /pkg\.pad\('ab', \{/, path);
    // A trailing argument that is left out is still missing.
    assert.match(tests, /outcome\(\(\) => pkg\.pad\('ab'\)\), outcome\(\(\) => pkg\.pad\('ab', null\)\)/, path);
  }
});

test('a crate with a value class of another repository defines no function that it does not call (GN-4, GN-6x)', () => {
  const inputs: Record<string, () => Map<string, string | Buffer>> = {
    consumer: () => generate({ ...consumerSample(), version: '0.0.0', coreLib: 'polyspec_consumer' }),
    relay: () => generate({ ...relaySample(), version: '0.0.0', coreLib: 'polyspec_relay' }),
  };
  const unused: string[] = [];
  let crates = 0;
  for (const [name, make] of Object.entries(inputs)) {
    const out = make();
    for (const path of [...out.keys()].filter((p) => p.endsWith('/lib.rs'))) {
      crates += 1;
      const lines = withoutFeatures(text(out, path)).split('\n').filter((line) => !/^\s*\/\//.test(line));
      const code = lines.join('\n');
      for (const [i, line] of lines.entries()) {
        // A function of the module or of an extern block, which no attribute gives to the language or to the linker.
        const defined = /^(?:(?:unsafe )?(?:async )?fn ([a-z0-9_]+)[<(]| {4}fn (polyspec_[a-z0-9_]+)\()/.exec(line)?.slice(1).find((found) => found !== undefined);
        if (defined === undefined || /^\s*#\[/.test(lines[i - 1] ?? '')) continue;
        // A use is a call, or the function as the one argument of a call; a variable of the same name is neither.
        if (!new RegExp(`(?<!fn |\\.)\\b${defined}(?:::<[^>]*>)?\\(|[(,] ?${defined}[,)]|= ${defined};`).test(code)) unused.push(`${name} ${path}: ${defined}`);
      }
    }
  }
  assert.ok(crates >= 9, String(crates));
  assert.deepEqual(unused, []);
  // The Node crate reads the code units of a string only for a parameter that takes them, which the name of a variable
  // hides from the search above.
  assert.doesNotMatch(text(inputs['relay']?.() ?? new Map(), 'packages/ts/generated/lib.rs'), /\nfn units\(/);
});

test('a PHP crate has the helper thrown only where a callback or a function keeps what the PHP code threw (U-3, GN-6z)', () => {
  const inputs: Record<string, () => Map<string, string | Buffer>> = {
    fixture: () => generate({ ...load(), version: '0.0.0', coreLib: 'polyspec_sample' }),
    sample: () => sampleWith(() => undefined),
    shapes: () => shaped(),
    variants: () => variants(),
    consumer: () => generate({ ...consumerSample(), version: '0.0.0', coreLib: 'polyspec_consumer' }),
    relay: () => generate({ ...relaySample(), version: '0.0.0', coreLib: 'polyspec_relay' }),
  };
  const defined: string[] = [];
  const unused: string[] = [];
  for (const [name, make] of Object.entries(inputs)) {
    const php = text(make(), 'packages/php-ext/generated/lib.rs');
    assert.ok(php.length > 0, name);
    if (!/\nfn thrown<E>\(/.test(php)) continue;
    defined.push(name);
    if (!/(?<!fn )\bthrown\b(?!<E>)[(),]/.test(php.replace(/^\s*\/\/.*$/gm, ''))) unused.push(name);
  }
  // A contract with a callback has the helper, and one with a value alias and no callback has none.
  assert.ok(defined.includes('sample') && defined.includes('variants'), defined.join(', '));
  assert.deepEqual(unused, []);
});

test('the assertion of the borrows of a member names the Io token of wait blocking_io and the receiver self as the core takes them (GN-6h, GN-6m, GN-6o, I-2)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  const member = (id: string): any => contract.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === id);
  // The core of a member with wait blocking_io takes the token first after its receiver (GN-6m).
  member('classes.shout').wait = 'blocking_io';
  member('tag.same').wait = 'blocking_io';
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['php', 'python', 'node'] });
  for (const crate of LIBS) {
    const lib = text(out, crate);
    assert.ok(lib.includes('const _: () = {\n    let _: fn(_, &polyspec_classes::Tag) -> _ = polyspec_classes::shout;\n};'), `${crate} asserts the borrow of shout after the token`);
    assert.ok(lib.includes('const _: () = {\n    let _: fn(&polyspec_classes::Tag, _, &polyspec_classes::Tag) -> _ = polyspec_classes::Tag::same;\n};'), `${crate} asserts the borrows of same around the token`);
  }
  // The receiver self is the value of the class, not a borrow of it (GN-6o).
  const taken = read('packages/rust/interface.json');
  const same = taken.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === 'tag.same');
  same.core = { path: typeof same.core === 'string' ? same.core : same.core.path, receiver: 'self' };
  const consumed = generate({ contract: taken, version: '0.0.0', coreLib: 'polyspec_classes', caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]), targets: ['php', 'python', 'node'] });
  for (const crate of LIBS) {
    assert.ok(text(consumed, crate).includes('const _: () = {\n    let _: fn(polyspec_classes::Tag, &polyspec_classes::Tag) -> _ = polyspec_classes::Tag::same;\n};'), `${crate} asserts the receiver self of same as a value`);
  }
});

test('a Node or WASM member with machine binds the borrow of the guard of a class parameter before its core makes the machine (GN-6ab, GN-6h)', () => {
  const made = (targets: string[]): Map<string, string | Buffer> => {
    const contract = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
    const m = contract.units.flatMap((u: any) => u.members ?? []).find((x: any) => x.id === 'sample.resolve_slowly');
    m.wait = 'async_driver';
    m.core = { path: 'polyspec_sample::resolve_slowly', machine: true };
    delete m.only;
    // GN-6ab: a machine owns its arguments, so a class parameter of a member with machine names the borrow value.
    m.parameters.push({ name: ['tag'], type: { unit: 'tag' }, required: true, core: 'value' });
    // The cases of the member name no tag, so the member is generated without them.
    contract.cases = contract.cases.filter((c: any) => c.member !== 'sample.resolve_slowly');
    return generateTargets({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: targets as Inputs['targets'] & string[] });
  };
  // The core is called at once, on the thread of the entry, so the entry borrows the guard as a member without a wait does.
  const node = text(made(['node']), 'packages/ts/generated/lib.rs');
  assert.match(node, /let tag = tag\.read\("Tag", &\[\]\)\.map_err\(binding_error\)\?;\n\s+let tag = &\*tag;\n\s+let mut machine = binding_core::machine::Driving::new\(polyspec_sample::resolve_slowly\(lookup, key, \(\*tag\)\.clone\(\)\)\);/);
  const wasm = text(made(['wasm']), 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /\n\s+let tag = &\*tag;\n\s+let mut machine = binding_core::machine::Driving::new\(polyspec_sample::resolve_slowly\(lookup, key, \(\*tag\)\.clone\(\)\)\);/);
});

test('the crates of every contract of the end-to-end check name their functions by GN-4c: only a conversion of a unit starts with in_ or out_, and no function is defined twice (GN-4c)', () => {
  // The contracts hold what the sample does not: a map inside a type, a variant, a path, a function type that the core
  // keeps, a value class and a unit of another repository. Each crate is generated for each target of its contract.
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const dependencies: Record<string, string[]> = { consumer: ['sample'], plot: ['points'] };
  const libs: Record<string, string> = { php: 'packages/php-ext/generated/lib.rs', python: 'packages/python/generated/lib.rs', node: 'packages/ts/generated/lib.rs', wasm: 'packages/ts/wasm/generated/lib.rs', go: 'packages/go/internal/ffi/generated/lib.rs' };
  let crates = 0;
  for (const name of ['sample', 'classes', 'shapes', 'consumer', 'plot', 'points', 'variants', 'functions']) {
    const contract = read(`${name}/packages/rust/interface.json`);
    const foreign = new Map<string, any>((dependencies[name] ?? []).map((library) => [library, read(`${library}/packages/rust/interface.json`)]));
    const units = new Set<string>([contract, ...foreign.values()].flatMap((c: any) => c.units.map((u: any) => u.name.join('_'))));
    for (const target of contract.targets as string[]) {
      const out = generateTargets({ contract: structuredClone(contract), version: '0.0.0', coreLib: `polyspec_${name}`, caseFiles: new Map([['contracts/cases.json', read(`${name}/contracts/cases.json`)]]), foreign, targets: [target] as Inputs['targets'] & string[] });
      const lib = text(out, libs[target] ?? '');
      crates += 1;
      // The functions of the root and of each module (`mod <name> {`), which share no scope.
      const scopes = new Map<string, Map<string, number>>();
      let scope = '';
      for (const line of lib.split('\n')) {
        const opened = /^( *)(?:pub(?:\([a-z]+\))? )?mod ([a-z_0-9]+) \{$/.exec(line);
        if (opened !== null && opened[1] === '') scope = opened[2] ?? '';
        else if (line === '}') scope = '';
        const depth = scope === '' ? '' : ' {4}';
        const found = new RegExp(`^${depth}(?:pub(?:\\([a-z]+\\))? )?(?:async )?(?:unsafe )?(?:extern "C" )?fn ([a-z0-9_]+)`).exec(line);
        if (found === null || (scope === '' && line.startsWith(' '))) continue;
        const names = scopes.get(scope) ?? new Map<string, number>();
        names.set(found[1] ?? '', (names.get(found[1] ?? '') ?? 0) + 1);
        scopes.set(scope, names);
      }
      for (const [module, names] of scopes) {
        const where = `${name} ${target}${module === '' ? '' : ` mod ${module}`}`;
        // A function behind a cfg has a twin behind the opposite cfg (the fault helpers), which functionNames leaves out.
        const twice = [...functionNames(module === '' ? lib : '')].filter(([, count]) => count > 1).map(([fn]) => fn);
        assert.deepEqual(twice, [], `${where}: defined twice`);
        const others = [...names.keys()].filter((fn) => /^(?:in|out)_/.test(fn) && !units.has(fn.replace(/^(?:in|out)_/, '')));
        assert.deepEqual(others, [], `${where}: a helper named as a conversion of a unit`);
        assert.deepEqual([...names.keys()].filter((fn) => fn === 'in_function' || fn === 'function_in'), [], where);
      }
    }
  }
  // HR-84: the test read the crates of the eight contracts, each for its five targets.
  assert.equal(crates, 40);
});

test('Node takes the exception of every callback out of the environment where it is called, so a core that answers the Raised returns its value (U-3, GN-6ab)', () => {
  // sample.tolerant answers what its lookup raised and returns no value. An exception that stayed pending in the
  // environment would end the call with it, so the callback holds it as the callback of a machine does.
  const lib = text(scopedSample(['node']), 'packages/ts/generated/lib.rs');
  const borrowed = lib.slice(lib.indexOf("impl<'env> polyspec_sample::Lookup for CbLookup<'env>"));
  assert.match(borrowed.slice(0, borrowed.indexOf('\n}\n')), /call\(\)\.map_err\(\|error\| recognized_lookup_find\(self\.env, error\)\)\.map_err\(\|failure\| kept\(self\.env, failure\)\)\n {4}\}/);
  assert.match(lib, /let result = match with_faults\("sample\.tolerant", \|\| polyspec_sample::tolerant\(&mut \{ lookup \}, &key\)\) \{/);
  // A contract with a callback and no machine holds the exception too: it has the function, the variant and the throw.
  const plain = text(scopedSample(['node'], (contract) => {
    for (const unit of contract.units) unit.members = (unit.members ?? []).filter((m: any) => m.core?.machine !== true);
    const kept = new Set(contract.units.flatMap((unit: any) => (unit.members ?? []).map((m: any) => m.id)));
    contract.cases = contract.cases.filter((k: any) => k.member === undefined || kept.has(k.member));
  }), 'packages/ts/generated/lib.rs');
  assert.doesNotMatch(plain, /struct Driven/);
  assert.match(plain, /\nfn kept\(env: &Env, failure: /);
  assert.match(plain, /\n {4}Held\(Owned\),\n/);
  assert.match(plain, /Some\(Thrown::Held\(exception\)\) => thrown_again\(&exception\),/);
  assert.match(plain, /\.map_err\(\|failure\| kept\(self\.env, failure\)\)/);
  // Every variant of Thrown and every method of Owned that the crate names is used in it.
  assert.doesNotMatch(plain.slice(plain.indexOf('struct Owned {'), plain.indexOf('impl Drop for Owned {')), /fn object</);
});

// GN-5, GN-6ae: the crate, its manifest and its generated tests of each target, for the count of what was thrown.
const THROWN_COUNT_CRATES = [
  ['node', 'packages/ts/Cargo.toml', 'packages/ts/generated/lib.rs'],
  ['wasm', 'packages/ts/wasm/Cargo.toml', 'packages/ts/wasm/generated/lib.rs'],
  ['php', 'packages/php-ext/Cargo.toml', 'packages/php-ext/generated/lib.rs'],
  ['python', 'packages/python/Cargo.toml', 'packages/python/generated/lib.rs'],
  ['go', 'packages/go/internal/ffi/Cargo.toml', 'packages/go/internal/ffi/generated/lib.rs'],
] as const;

test('a crate that keeps what was thrown has the entry point of thrown-count-test, which gives the count of the table (GN-5, GN-6ae)', () => {
  const out = scopedSample(['php', 'python', 'node', 'go', 'wasm']);
  // Node and PHP remove the keys that a drop on another thread queued, and then count the table of the thread.
  assert.match(text(out, 'packages/ts/generated/lib.rs'), /#\[cfg\(feature = "thrown-count-test"\)\]\n#\[napi\(js_name = "__thrownCount"\)\]\npub fn thrown_count\(\) -> u32 \{\n {4}release_dropped\(\);\n {4}let count = THROWN\.with_borrow\(\|map\| map\.len\(\)\);\n {4}u32::try_from\(count\)\.unwrap_or\(u32::MAX\)\n\}/);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /#\[cfg\(feature = "thrown-count-test"\)\]\n#\[php_function\]\n#\[php\(name = "Polyspec\\\\Sample\\\\Internal\\\\thrownCount"\)\]\npub fn thrown_count\(\) -> i64 \{\n {4}release_dropped\(\);\n {4}let count = THROWN\.with_borrow\(\|map\| map\.len\(\)\);\n {4}i64::try_from\(count\)\.unwrap_or\(i64::MAX\)\n\}/);
  assert.match(php, /#\[cfg\(feature = "thrown-count-test"\)\]\n {8}let module = module\.function\(wrap_function!\(thrown_count\)\);/);
  assert.match(text(out, 'packages/ts/wasm/generated/lib.rs'), /#\[cfg\(feature = "thrown-count-test"\)\]\n {4}#\[wasm_bindgen\(js_name = "__thrownCount"\)\]\n {4}pub fn thrown_count\(\) -> u32 \{\n {8}let count = THROWN\.with_borrow\(\|map\| map\.len\(\)\);\n {8}u32::try_from\(count\)\.unwrap_or\(u32::MAX\)\n {4}\}/);
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /#\[cfg\(feature = "thrown-count-test"\)\]\n#\[pyfunction\]\nfn _thrown_count\(\) -> usize \{\n {4}thrown_map\(\)\.len\(\)\n\}/);
  assert.match(python, /#\[cfg\(feature = "thrown-count-test"\)\]\n {4}module\.add_function\(wrap_pyfunction!\(_thrown_count, module\)\?\)\?;/);
  const go = text(out, 'packages/go/internal/ffi/generated/lib.rs');
  assert.match(go, /#\[cfg\(feature = "thrown-count-test"\)\]\n#\[no_mangle\]\npub unsafe extern "C" fn polyspec_sample__thrown_count\(args: \*const u8, len: usize, result: \*mut Buffer\) -> i32 \{/);
  assert.match(go, /uint_out\(&mut output, u64::try_from\(lock\(&THROWN\)\.len\(\)\)\.unwrap_or\(u64::MAX\)\);/);
  const binding = text(out, 'packages/go/internal/binding/zz_generated_thrown_count.go');
  assert.match(binding, /\n\/\/go:build polyspec_thrown_count_test\n/);
  assert.match(binding, /func ThrownCount\(\) \(uint64, error\) \{\n\tdec, err := invoke\(func\(pointer \*C\.uint8_t, length C\.size_t, result \*C\.polyspec_sample_buffer\) C\.int32_t \{\n\t\treturn C\.polyspec_sample__thrown_count\(pointer, length, result\)/);
});

test('a manifest has the feature thrown-count-test exactly when its crate keeps the table of what was thrown (GN-5)', () => {
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const plain = load();
  const targets = ['php', 'python', 'node', 'go', 'wasm'] as const;
  const crates = [
    { name: 'the sample', keeps: true, packages: trackedPackages(sample, '0.0.0'), out: generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: [...targets] }) },
    { name: 'a contract without a callback, a function type and a value alias', keeps: false, packages: trackedPackages(plain.contract, '0.0.0'), out: generate({ ...plain, version: '0.0.0', coreLib: 'polyspec_sample', targets: [...targets] }) },
  ];
  for (const { name, keeps, packages, out } of crates) {
    for (const [lang, manifest, crate] of THROWN_COUNT_CRATES) {
      const lib = text(out, crate);
      assert.notEqual(lib, '', `${name}: ${crate}`);
      assert.equal(/\nthrown-count-test = \[\]\n/.test(String(packages.get(manifest))), keeps, `${name}: the feature of ${lang}`);
      assert.equal(/\n(?: {4})?static THROWN: /.test(lib), keeps, `${name}: the table of ${lang}`);
      assert.equal(/#\[cfg\(feature = "thrown-count-test"\)\]/.test(lib), keeps, `${name}: the entry point of ${lang}`);
    }
    assert.equal(out.has('packages/go/internal/binding/zz_generated_thrown_count.go'), keeps, name);
  }
});

test('the generated test of a case of a member that takes a callback or a function requires that nothing thrown is kept (GN-6ae)', () => {
  const out = scopedSample(['php', 'python', 'node', 'go', 'wasm']);
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  // A case whose callback raises and whose core answers it, with the fixture checks before the count.
  assert.match(node, /test\('GN-13e: tolerant a_tolerant_key_whose_lookup_raises_what_it_does_not_recognize_gives_no_value', \(\) => \{\n[^\n]*\n {2}assert\.deepStrictEqual\(ordered\(pkg\.tolerant\(fixture0\.object, '\?a'\)\), ordered\(null\)\);\n {2}assert\.deepEqual\(fixture0\.unexpected, \[\]\);\n {2}assert\.deepEqual\(fixture0\.calls, \[\['find', \['a'\]\]\]\);\n {2}assert\.equal\(addon\(\)\.__thrownCount\(\), 0\);\n\}\);/);
  // A case of a member with machine, after its call and the calls of after.
  assert.match(node, /test\('GN-13e: Store\.attempt a_function_that_raises_after_it_wrote_is_an_attempt_that_did_not_hold', async \(\) => \{\n {2}const receiver = new pkg\.Store\(\);\n[^\n]*\n {2}assert\.deepStrictEqual\(ordered\(receiver\.get\('a'\)\), ordered\(null\)\);\n {2}assert\.equal\(addon\(\)\.__thrownCount\(\), 0\);\n\}\);/);
  const wasm = text(out, 'packages/ts/wasm/generated/tests/generated.test.mjs');
  assert.match(wasm, /test\('GN-13e: tolerant a_tolerant_key_whose_lookup_raises_what_it_does_not_recognize_gives_no_value', \(\) => \{\n(?: {2}[^\n]*\n)+? {2}assert\.deepEqual\(fixture0\.calls, \[\['find', \['a'\]\]\]\);\n {2}assert\.equal\(stepGlue\.__thrownCount\(\), 0\);\n\}\);/);
  assert.match(wasm, /test\('GN-13e: Store\.attempt a_function_that_raises_after_it_wrote_is_an_attempt_that_did_not_hold', async \(\) => \{\n(?: {2}[^\n]*\n)+? {2}assert\.deepStrictEqual\(ordered\(receiver\.get\('a'\)\), ordered\(null\)\);\n {2}assert\.equal\(stepGlue\.__thrownCount\(\), 0\);\n\}\);/);
  assert.match(wasm, /\nlet stepGlue;\nbefore\(async \(\) => \{\n {2}stepGlue = await glueModule\(\);\n\}\);\n/);
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(php, /public function testGn13eStoreAttemptAFunctionThatRaisesAfterItWroteIsAnAttemptThatDidNotHold\(\): void\n {4}\{\n(?: {8}[^\n]*\n)+? {8}self::assertSame\(self::same\(null\), self::same\(\$receiver->get\("a"\)\)\);\n {8}self::assertSame\(0, \\Polyspec\\Sample\\Internal\\thrownCount\(\)\);\n {4}\}/);
  assert.match(php, /public function testGn13etolerantATolerantKeyWhoseLookupRaisesWhatItDoesNotRecognizeGivesNoValue\(\): void\n {4}\{\n(?: {8}[^\n]*\n)+? {8}self::assertSame\(0, \\Polyspec\\Sample\\Internal\\thrownCount\(\)\);\n {4}\}/);
  const python = text(out, 'packages/python/generated/tests/test_generated.py');
  assert.match(python, /def test_gn13e_tolerant_a_tolerant_key_whose_lookup_raises_what_it_does_not_recognize_gives_no_value\(self\) -> None:\n(?: {8}[^\n]*\n)+? {8}self\.assertEqual\(fixture_0_calls, \[\("find", \("a",\)\)\]\)\n {8}self\.assertEqual\(_native\._thrown_count\(\), 0\)\n\n/);
  assert.match(python, /def test_gn13e_store_attempt_a_function_that_raises_after_it_wrote_is_an_attempt_that_did_not_hold\(self\) -> None:\n(?: {8}[^\n]*\n)+? {8}self\.assertTrue\(_same\(after_0, expected_0\), [^\n]*\n {8}self\.assertEqual\(_native\._thrown_count\(\), 0\)\n\n/);
  // Go: the test with the build tag runs the call of the case again; the file without a tag names no entry of a feature.
  assert.doesNotMatch(text(out, 'packages/go/zz_generated_test.go'), /ThrownCount/);
  const go = text(out, 'packages/go/zz_generated_thrown_count_test.go');
  assert.match(go, /\n\/\/go:build polyspec_thrown_count_test\n/);
  assert.match(go, /func TestGN13eStoreAttemptAFunctionThatRaisesAfterItWroteIsAnAttemptThatDidNotHoldKeepsNothingThrown\(t \*testing\.T\) \{\n(?:\t[^\n]*\n)+?\tvalue0, err := made0\.Attempt\(function2\)\n(?:\t[^\n]*\n)+?\tif count, err := binding\.ThrownCount\(\); err != nil \|\| count != 0 \{\n\t\tt\.Fatalf\("GN-6ae: %d values that were thrown are kept after the call \(%v\)", count, err\)\n\t\}\n\}/);
  assert.match(go, /func TestGN13eTolerantATolerantKeyWhoseLookupRaisesWhatItDoesNotRecognizeGivesNoValueKeepsNothingThrown\(t \*testing\.T\) \{/);
  // Every case of such a member has the count, and a member that takes neither has none.
  const cases = (file: string, start: RegExp): string[] => file.split(start).slice(1);
  for (const [name, file, start, count] of [
    ['node', node, /\ntest\('(?=(?:B-4|GN-13e): (?:tolerant|Store\.attempt) )/, /__thrownCount\(\), 0\);\n\}\);/],
    ['wasm', wasm, /\ntest\('(?=(?:B-4|GN-13e): (?:tolerant|Store\.attempt) )/, /__thrownCount\(\), 0\);\n\}\);/],
  ] as const) {
    const found = cases(file, start);
    assert.ok(found.length >= 5, `${name}: ${found.length} cases`);
    for (const one of found) assert.match(one.slice(0, one.indexOf('\n});') + 5), count, `${name}: ${one.slice(0, 120)}`);
  }
  const join = node.indexOf("test('GN-13e: join no_tag_is_the_empty_text'");
  assert.notEqual(join, -1);
  assert.doesNotMatch(node.slice(join, node.indexOf('\n});', join)), /__thrownCount/);
});

test('a case of a variant holds a unit of another repository, whose conversions the variant calls (T-9, T-3, GN-6v, GN-6c)', () => {
  // tests/e2e/consumer: the cases of the variant note hold the value alias data of tests/e2e/sample, as a field and
  // as the values of a map.
  const { contract, caseFiles, foreign } = consumerSample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign, targets: ['php', 'python', 'node', 'go', 'wasm'] });
  const python = text(out, 'packages/python/generated/lib.rs');
  assert.match(python, /let field_value: polyspec_sample::Data = library_sample::in_data\(py, &value\.getattr\("value"\)\?, subject\)\?;/);
  assert.match(python, /map_in\(py, &value\.getattr\("data"\)\?, subject, \|py, item\| library_sample::in_data\(py, item, subject\)\)\?;/);
  assert.match(python, /fields\.set_item\("data", map_out\(py, field_data, \|py, item\| library_sample::out_data\(py, item\)\)\?\)\?;/);
  // Node: the in conversion of a variant takes the env, which the conversion of the alias reads.
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /\nfn in_note\(env: &Env, value: Unknown<'_>, subject: &str\) -> Result<polyspec_consumer::Note, Fail> \{/);
  assert.match(node, /let field_value: polyspec_sample::Data = library_sample::in_data\(env, member\(value, "value", subject\)\?, "value"\)\?;/);
  assert.match(node, /map_in\(member\(value, "data", subject\)\?, "data", \|item\| library_sample::in_data\(env, item, "data"\)\)\?;/);
  assert.match(node, /let note: polyspec_consumer::Note = in_note\(env, note, "note"\)\?;/);
  assert.match(node, /list_in\(notes, "notes", \|item\| in_note\(env, item, "notes"\)\)\?;/);
  assert.match(node, /object\.set_named_property\("value", library_sample::out_data\(env, field_value\)\?\)/);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /\n\s+library_sample::in_data\(field, subject\)\?\n/);
  assert.match(php, /case_object\(2, vec!\[\("status", uint_out\(\*field_status\)\?\), \("data", map_out\(field_data, \|item\| library_sample::out_data\(item\)\)\?\)\]\)/);
  const wasm = text(out, 'packages/ts/wasm/generated/lib.rs');
  assert.match(wasm, /let field_value: polyspec_sample::Data = library_sample::in_data\(&member\(value, "value", subject\)\?, "value"\)\?;/);
  assert.match(wasm, /map_out\(field_data, \|item\| library_sample::out_data\(item\)\)/);
  // Go: the encoding of the variant takes the call of the member, which walks the value of the alias.
  const go = text(out, 'packages/go/zz_generated_consumer.go');
  assert.match(go, /\nfunc encodeNote\(call \*binding\.Call, enc \*binding\.Writer, value Note\) \{/);
  assert.match(go, /\tcase NoteSingle:\n\t\tenc\.Uint\(1\)\n\t\tcall\.Value\(enc, case0\.Value\)\n/);
  assert.match(go, /func Turned\(note Note\) \(Note, error\) \{\n\tvar zero0 Note\n\tcall := binding\.NewCall\(\)\n\tdefer call\.Close\(\)\n\tenc := binding\.NewWriter\(\)\n\tencodeNote\(call, enc, note\)\n/);
  assert.match(go, /func Weight\(notes \[\]Note\)[^]*?\n\tcall := binding\.NewCall\(\)\n[^]*?\t\tencodeNote\(call, enc, item0\)\n/);
  assert.match(go, /\tcase 1:\n\t\tvar case0 NoteSingle\n\t\tcase0\.Value = dec\.Value\(\)\n/);
  assert.match(text(out, 'packages/go/internal/ffi/generated/lib.rs'), /let field_data: binding_core::OrderedMap<polyspec_sample::Data> = map_in\(input, "Data", library_sample::in_data\)\?;/);
  // The result forms of the cases name the alias as any place does.
  assert.match(text(out, 'packages/python/generated/python/polyspec/consumer/_types.py'), /class NotePage:\n[^]*?\n    status: int\n    data: dict\[str, object\]\n/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export interface NotePage \{\n  readonly kind: 'page';\n  readonly status: number;\n  readonly data: ReadonlyMap<string, unknown>;\n\}/);
  // The cases of the members run in every target.
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /pkg\.turned\(\{ kind: 'single', value: 'x' \}\)\), ordered\(\{ kind: 'page', status: 1, data: new Map\(\[\['value', 'x'\]\]\) \}\)/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /result = pkg\.turned\(pkg\.NoteSingle\(value="x"\)\)/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /Turned\(NoteSingle\{Value: "x"\}\)/);
  // tests/e2e/plot: the cases of the variant mark hold the record point of tests/e2e/points, as a field, in a list
  // and in an optional.
  const plot = plotSample();
  const marks = generate({ contract: plot.contract, version: '0.0.0', coreLib: 'polyspec_plot', caseFiles: plot.caseFiles, foreign: plot.foreign, targets: ['php', 'python', 'node', 'go', 'wasm'] });
  const plotNode = text(marks, 'packages/ts/generated/lib.rs');
  // Node: a record without a field that reads the env takes it unused.
  assert.match(plotNode, /\n {4}pub\(super\) fn in_point\(value: Unknown<'_>, subject: &str\) -> Result<polyspec_points::Point, Fail> \{/);
  assert.match(plotNode, /let field_at: polyspec_points::Point = library_points::in_point\(member\(value, "at", subject\)\?, "at"\)\?;/);
  assert.match(plotNode, /optional_in\(member\(value, "end", subject\)\?, \|value\| library_points::in_point\(value, "end"\)\)\?;/);
  assert.match(text(marks, 'packages/python/generated/lib.rs'), /library_points::in_point\(py, &value\.getattr\("at"\)\?, subject\)\?;/);
  assert.match(text(marks, 'packages/php-ext/generated/lib.rs'), /list_in\(field, subject, \|item\| library_points::in_point\(item, subject\)\)\?/);
  assert.match(text(marks, 'packages/ts/wasm/generated/lib.rs'), /library_points::in_point\(&member\(value, "at", subject\)\?, "at"\)\?;/);
  const plotGo = text(marks, 'packages/go/zz_generated_plot.go');
  assert.match(plotGo, /type MarkLine struct \{\n\tPoints \[\]points\.Point\n\tEnd +\*points\.Point\n\}/);
  assert.match(plotGo, /\nfunc encodeMark\(enc \*binding\.Writer, value Mark\) \{\n\tswitch case0 := value\.\(type\) \{\n\tcase MarkDot:\n\t\tenc\.Uint\(0\)\n\t\tenc\.Int\(case0\.At\.X\)\n/);
  assert.match(text(marks, 'packages/python/generated/python/polyspec/plot/_types.py'), /from polyspec\.points import Point as Point\n[^]*class MarkDot:\n[^]*?\n    at: Point\n/);
  assert.match(text(marks, 'packages/python/generated/tests/test_generated.py'), /pkg\.flipped\(pkg\.MarkDot\(at=foreign_points\.Point\(x=1, y=2\)\)\)/);
  assert.match(text(marks, 'packages/php-ext/generated/tests/GeneratedTest.php'), /\\Polyspec\\Plot\\flipped\(new \\Polyspec\\Plot\\MarkDot\(at: new \\Polyspec\\Points\\Point\(x: 1, y: 2\)\)\)/);
  // tests/e2e/relay: the cases of the variant packet hold the value class of json, as a field and in a list (GN-6x).
  const relay = relaySample();
  const packets = generate({ contract: relay.contract, version: '0.0.0', coreLib: 'polyspec_relay', caseFiles: relay.caseFiles, foreign: relay.foreign, targets: ['php', 'python', 'node', 'go', 'wasm'] });
  assert.match(text(packets, 'packages/python/generated/lib.rs'), /let field_value: polyspec_json::Value = library_json::in_value\(py, &value\.getattr\("value"\)\?, subject\)\?;/);
  assert.match(text(packets, 'packages/ts/generated/lib.rs'), /list_in\(member\(value, "values", subject\)\?, "values", \|item\| library_json::in_value\(env, item, "values"\)\)\?;/);
  assert.match(text(packets, 'packages/php-ext/generated/lib.rs'), /case_object\(0, vec!\[\("value", library_json::out_value\(field_value\)\?\)\]\)/);
  assert.match(text(packets, 'packages/ts/wasm/generated/lib.rs'), /library_json::in_value\(&member\(value, "value", subject\)\?, "value"\)\?;/);
  const packetGo = text(packets, 'packages/go/zz_generated_relay.go');
  assert.match(packetGo, /type PacketOne struct \{\n\tValue \*json\.Value\n\}/);
  assert.match(packetGo, /\nfunc encodePacket\(call \*binding\.Call, enc \*binding\.Writer, value Packet\) \{\n\tswitch case0 := value\.\(type\) \{\n\tcase PacketOne:\n\t\tenc\.Uint\(0\)\n\t\tcall\.Value\(enc, case0\.Value\)\n/);
  assert.match(packetGo, /\t\tcase0\.Value, _ = dec\.Value\(\)\.\(\*json\.Value\)\n/);
  // The cases of the members run: a value of the class is made as at any other place.
  assert.match(text(packets, 'packages/ts/generated/tests/generated.test.mjs'), /test\('GN-13e: count many_values_count_each'/);
  // A value alias of this contract in a case stays refused by name.
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  sample.units.push({ id: 'held', name: ['held'], module: '', kind: 'variant', visibility: 'public', origin: 'generated', core_type: 'polyspec_sample::Held', tag: ['kind'], cases: [{ value: 'one', fields: [{ name: ['value'], type: { unit: 'data' }, required: true }] }] });
  assert.throws(() => generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() }), /held\.one\.value: a value alias in a case of a variant is not generated yet \(GN-6v\)/);
  // A variant without an alias or a callback keeps the encoding without the call.
  assert.match(text(variants(), 'packages/go/zz_generated_variants.go'), /\nfunc encodeFigure\(enc \*binding\.Writer, value Figure\) \{/);
});
