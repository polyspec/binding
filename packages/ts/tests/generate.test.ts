// I-5: the same contract and the same binding give the same bytes, in any directory, with no path, time or host of
// the run; and an item that the generator cannot generate is refused by name (G-4).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Lang } from '../src/contract.ts';
import { generate as generateTargets, type Inputs } from '../src/generate/index.ts';
import { carriers } from '../src/generate/model.ts';
import { fromJson } from '../src/generate/samples.ts';
import { closure } from '../src/generate/text.ts';
import { trackedPackages } from '../src/generate/packages.ts';

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
  // GN-12: a keyed map inside a list is refused for Node and WASM, whose entry turns a Map into its entries.
  const root = mkdtempSync(join(tmpdir(), 'binding-v-'));
  const out = mkdtempSync(join(tmpdir(), 'binding-v-'));
  try {
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const path = join(root, 'packages/rust/interface.json');
    const contract = JSON.parse(readFileSync(path, 'utf8'));
    contract.units[0].members[0].returns = { list: { keyed_map: 'text', key: ['int', 'text'] } };
    writeFileSync(path, JSON.stringify(contract));
    const refused = /node: not generated \(G-4\), 1 item:\n  split: a map<T> or keyed_map<T> inside another type is not generated for node[^\n]* yet \(GN-12\)/;
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
  contract.units[0].members[0].wait = 'process_wait';
  const caseFiles = new Map([['contracts/cases.json', JSON.parse(readFileSync(join(fixture, 'contracts/cases.json'), 'utf8'))]]);
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /split: wait process_wait is not generated yet/);
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
    assert.match(text(out, path), /fn out_uint[^\n]*value: impl WideUint\)/, path);
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
  assert.match(text(generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), 'packages/php-ext/generated/lib.rs'), /fn out_map<T>/);
  contract.targets = ['go'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  for (const category of Object.keys(contract.errors.classes)) contract.errors.classes[category] = {};
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /^type Map\[T any\] = binding\.Map\[T\]$/m);
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /\(\*Map\[\[\]string\], error\)/);
  assert.match(text(out, 'packages/go/internal/ffi/generated/lib.rs'), /out_map\(output, result, \|output, item\| out_list\(/);
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
  assert.match(rust, /fn in_latin1\(input: &mut &\[u8\], subject: &str\)[^]*TextCause::AboveLatin1/);
  assert.match(rust, /fn out_latin1\([^]*char::from\(\*byte\)/);
  assert.match(rust, /#\[cfg\(feature = "codec-test"\)\]\n#\[no_mangle\]\npub unsafe extern "C" fn polyspec_sample__echo_latin1\(/);
  assert.match(text(out, 'packages/go/internal/binding/zz_generated_codec_test.go'), /func TestB8Latin1RoundTrips/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /func TestB8SplitWordsRefusesTextAboveU00FF\(t \*testing\.T\) \{\n\t_, err := SplitWords\("\\u0100"/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /func TestB8SplitWordsRefusesTextThatIsNotUTF8\(t \*testing\.T\) \{\n\t_, err := SplitWords\("\\xff"/);
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
  assert.match(rust, /fn in_tuple3<'a, T0, T1, T2>\(/);
  assert.match(rust, /in_tuple3\(&mut input, \|input\| in_text\(input, "text"\), in_uint, in_bool\)\?/);
});

test('keyed_map<T> is an ordered map of mixed key kinds in every language (T-2, GW-8)', () => {
  const { contract, caseFiles } = load();
  contract.units[0].members[0].returns = { list: { keyed_map: 'text', key: ['int', 'text'] } };
  // GN-12: the JavaScript entry turns a Map into its entries, so Node takes a keyed map only as a whole.
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /a map<T> or keyed_map<T> inside another type is not generated for node, wasm yet/);
  contract.units[0].members[0].returns = { keyed_map: 'text', key: ['int', 'text'] };
  const all = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles });
  assert.match(text(all, 'packages/php-ext/generated/lib.rs'), /fn out_keyed_map<T>/);
  assert.match(text(all, 'packages/python/generated/lib.rs'), /fn out_keyed_map<'py, T>/);
  assert.match(text(all, 'packages/ts/generated/index.cjs'), /return fromEntries\(addon\./);
  assert.match(text(all, 'packages/ts/generated/index.d.ts'), /ReadonlyMap<number \| string, string>/);
  contract.targets = ['go'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  for (const category of Object.keys(contract.errors.classes)) contract.errors.classes[category] = {};
  contract.units[0].members[0].parameters[0].type = { keyed_map: 'text', key: ['int', 'text'] };
  contract.cases = [];
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: new Map() });
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /^type KeyedMap\[T any\] = binding\.KeyedMap\[T\]$/m);
  assert.match(text(out, 'packages/go/zz_generated_sample.go'), /^func TextKey\(value string\) Key \{ return binding\.TextKey\(value\) \}$/m);
  assert.match(text(out, 'packages/go/internal/ffi/generated/lib.rs'), /in_keyed_map\(&mut input, "text", &\[0, 2\], "a key of int or text"/);
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /WithABytesKey\(t \*testing\.T\)/);
  assert.match(text(out, 'packages/go/internal/binding/zz_generated_codec_test.go'), /func TestT2AKeyedMapRoundTripsInItsOrder/);
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
    assert.match(missing.stderr, /ts\/package\.json: CK-19 optionalDependencies\.@polyspec\/sample-linux-x64-gnu is missing/);
    const pyproject = (module: string): string =>
      `[build-system]\nbuild-backend = "maturin"\n\n[tool.maturin]\nmanifest-path = "native/Cargo.toml"\npython-source = "src"\nmodule-name = "${module}"\n`;
    writeFileSync(join(root, 'packages/python/pyproject.toml'), pyproject('polyspec.sample._native'));
    // T-2: the addon is in the package of each platform, which the host names at its own version.
    writeFileSync(join(root, 'packages/ts/package.json'), JSON.stringify({
      name: '@polyspec/sample',
      version: '1.2.3',
      files: ['dist', 'native/generated/index.cjs', 'native/generated/index.mjs', 'native/generated/index.d.ts', 'native/wasm/generated/*.mjs', 'native/wasm/generated/*.js', 'native/wasm/generated/*.d.ts', 'native/wasm/generated/*.wasm'],
      optionalDependencies: {
        '@polyspec/sample-linux-x64-gnu': '1.2.3',
        '@polyspec/sample-linux-arm64-gnu': '1.2.3',
        '@polyspec/sample-darwin-arm64': '1.2.3',
      },
    }));
    writeFileSync(join(root, 'packages/php/composer.json'), JSON.stringify({ name: 'polyspec/sample-host', require: { 'ext-polyspec_sample': '*' } }));
    const wrongModule = spawnSync(process.execPath, [cli, 'check', contract], { encoding: 'utf8' });
    assert.match(wrongModule.stderr, /CK-19 tool\.maturin\.module-name is "polyspec\.sample\._native", not "polyspec\.sample\._binding\._native"/);
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
    assert.match(text(out, path), /OutValue::Map\(value\) => if out\.predicate\(Predicate::SequenceKeys\) == Some\(false\) \{ \{\n {12}let handle = value\.handle\(\);/, path);
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
    ['packages/ts/generated/lib.rs', 'out_tag(env, polyspec_sample::Tag::new(&value))'],
    ['packages/ts/wasm/generated/lib.rs', 'out_tag(polyspec_sample::Tag::new(&value))'],
  ] as const) {
    assert.ok(text(out, path).includes(`        OutValue::Text(value) => ${made},`), path);
    assert.match(text(out, path), /\nfn out_tag\(/, path);
  }
  // GN-15c: Go gives the number of the class and the handle, and the package of the class makes the instance.
  row.make.go = 'tag.new';
  const go = generate({ contract: sample, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases(), targets: ['go'] });
  const ffi = text(go, 'packages/go/internal/ffi/generated/lib.rs');
  assert.ok(ffi.includes('        OutValue::Text(value) => alias_out_tag(output, polyspec_sample::Tag::new(&value)),'), ffi);
  assert.match(ffi, /\nfn alias_out_tag\(output: &mut Vec<u8>, value: polyspec_sample::Tag\) \{\n {4}output\.push\(10\);\n {4}out_uint\(output, 0u64\);\n {4}out_tag\(output, value\);\n\}/);
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

test('PHP: the values that entered as handles are released at the request shutdown (GN-6e)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const lib = (repository: string, foreign?: Map<string, any>): string => text(generate({
    contract: read(`${repository}/packages/rust/interface.json`), version: '0.0.0', coreLib: `polyspec_${repository}`,
    caseFiles: new Map([['contracts/cases.json', read(`${repository}/contracts/cases.json`)]]), ...(foreign === undefined ? {} : { foreign }),
  }), 'packages/php-ext/generated/lib.rs');
  // A crate with a value alias, its own or of another repository, holds the values and releases them.
  for (const crate of [lib('sample'), lib('consumer', new Map([['sample', read('sample/packages/rust/interface.json')]]))]) {
    assert.match(crate, /let module = module\.request_shutdown_function\(release_native\);/);
    assert.match(crate, /extern "C" fn release_native\(_kind: i32, _module: i32\) -> i32 \{\n    NATIVE\.with_borrow_mut\(\|native\| \{\n        RELEASED\.set\([^\n]*\n        native\.clear\(\);/);
    // A handle of an ended request is below the count of the released ones and finds no value.
    if (/fn native_object\(/.test(crate)) assert.match(crate, /let position = handle\.raw\(\)\.checked_sub\(RELEASED\.get\(\)\)\.map\(handle_position\);/);
    assert.match(crate, /Handle::new\(RELEASED\.get\(\)\.saturating_add\(handle_count\(native\.len\(\) - 1\)\)\)/);
  }
  assert.doesNotMatch(lib('shapes'), /request_shutdown_function|release_native/);
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

test('a value alias of another repository converts through the core of its owner (T-3, U-7, GN-6k)', () => {
  const { contract, caseFiles, foreign } = consumerSample();
  const out = generate({ contract, version: '0.0.0', coreLib: 'polyspec_consumer', caseFiles, foreign });
  for (const path of ['packages/python/generated/lib.rs', 'packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    const lib = text(out, path);
    // The owner's two core functions are the conversion, under names that carry the library.
    assert.match(lib, /\nfn in_sample_data[(<]/, path);
    assert.match(lib, /let \(root, mut source\) = polyspec_sample::data_to_out\(value\.borrow\(\)\);/, path);
    assert.doesNotMatch(lib, /\bfn (in|out)_data\b/, path);
    // A failure of the owner's in is of the owner's enum; its class is this library's class of the owner's category.
    assert.match(lib, /polyspec_sample::data_from_host\(&mut host, described\)\.map_err\(\|failure: binding_core::Failure<polyspec_sample::Error>\| sample_failure_error\(/, path);
    assert.match(lib, /fn sample_error\([^)]*error: polyspec_sample::Error\)[^{]*\{\n    let class(: usize)? = match error \{\n        polyspec_sample::Error::Missing \{ \.\. \} => [^\n]*\n        polyspec_sample::Error::Unsupported \{ \.\. \} => [^\n]*\n(?:        polyspec_sample::Error::[^\n]*\n)*    \};/, path);
    // The callback gives the alias through the same conversions.
    assert.match(lib, /in_optional\([^\n]*in_sample_data\(/, path);
    assert.match(lib, /out_sample_data\((py|self\.env), value\)|out_sample_data\(value\)/, path);
  }
  assert.match(text(out, 'packages/python/generated/lib.rs'), /polyspec_sample::Error::Unsupported \{ \.\. \} => "ConsumerValueError",/);
  // The in_raises of the owner's alias give the consumer nothing: no entry point of codec-test, no assertion of the
  // kinds and no case of the alias, which the binding of the owner holds.
  assert.ok((foreign.get('sample')?.units ?? []).some((u: any) => u.id === 'data' && u.in_raises.length > 0));
  for (const [path, file] of out) {
    assert.doesNotMatch(String(file), /alias_in_|aliasIn|the kinds of in_raises|codec-test|def test_u7_|U-7: data/, path);
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
  assert.match(text(go, 'packages/go/internal/ffi/generated/lib.rs'), /fn sample_failure_error\(/);
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
  }), (error: Error) => error.constructor.name === 'Unsupported' && /data: a python make by a member \(tag\.new\) is not generated yet/.test(error.message));
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
  assert.match(python, /let value = polyspec_consumer::Error::key\(error\);\n    object\.setattr\("_key", out_text\(py, value\)\?\)\?;/);
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
  assert.match(php, /in_scope\(registered_class\(6\), \|\| object\.set_property\("length", property\)\)/);
  assert.match(php, /let class = category_scope\(this\.get_class_entry\(\)\);/);
  assert.match(text(out, 'packages/php-ext/generated/polyspec_consumer.stub.php'), /final class AbsentError extends \\Polyspec\\Consumer\\ConsumerValueError\n    \{\n        public function key\(\): string\|null \{\}\n\n        public function length\(\): int\|null \{\}/);
  // B-4: the generated test of a raising case names the exact class.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /self\.assertIs\(type\(error\), pkg\.AbsentError\)/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /error\.constructor === pkg\.AbsentError &&/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /self::assertSame\(\\Polyspec\\Consumer\\AbsentError::class, \$error::class\);/);
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
  assert.match(php, /in_scope\(registered_class\(6\), \|\| object\.set_property\("key", property\)\)[^]*in_scope\(registered_class\(7\), \|\| object\.set_property\("length", property\)\)/);
  assert.match(text(out, 'packages/ts/generated/index.cjs'), /class MissingError extends ConsumerValueError \{[^]*class AbsentError extends MissingError \{/);
  const refused = (change: (contract: any) => void, message: RegExp): void =>
    assert.throws(() => generated(change), (error: Error) => error.constructor.name === 'Unsupported' && message.test(error.message), String(message));
  refused((contract) => { unit(contract).members[0].kind = 'method'; }, /absent_error\.key: a method of an error unit is not generated yet/);
  refused((contract) => { unit(contract).members[0].returns = { list: 'text' }; }, /absent_error\.key: a property of an error unit of type \{"list":"text"\} is not generated yet/);
  refused((contract) => { unit(contract).members[0].core = 'polyspec_consumer::Error::key'; }, /absent_error\.key: a property of an error unit names a function of the core error with the receiver &self/);
  refused((contract) => { unit(contract).members[1].name = ['kind']; }, /absent_error: the property kind is declared twice/);
  refused((contract) => { unit(contract).category = 'io'; }, /polyspec_consumer::Error::Absent: the class absent_error is not an error unit of category value \(E-2\)/);
  // E-1b (a): a row that forwards the kind of another library.
  refused((contract) => { contract.errors.kinds.push({ variant: 'polyspec_consumer::Error::Sample', library: 'sample' }); }, /polyspec_consumer::Error::Sample: a kind of another library \(E-1b \(a\)\) is not generated yet/);
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
  assert.match(phpTests, /\\json_encode\(new \\Polyspec\\Sample\\Tag\("a"\)\)/);
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
  assert.match(nodeTests, /assert\.throws\(\(\) => JSON\.stringify\(new pkg\.Tag\('a'\)\)/);
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

test('WASM: map<T> is a Map of string keys, through the entries of the ES module (T-2, GN-18)', () => {
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
  assert.match(text(out, 'packages/ts/wasm/generated/lib.rs'), /fn out_map<T>\(value: impl Borrow<binding_core::OrderedMap<T>>/);
  assert.match(text(out, 'packages/ts/wasm/generated/index.mjs'), /return fromEntries\(enter\(/);
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
    assert.match(lib, /let mut receiver = self\.inner\.write\("Counter"\)\.map_err\([^\n]*\)\?;\n\s+let result = with_faults\("counter\.add", \|\| polyspec_sample::Counter::add\(&mut receiver, amount\)\);/, lang);
    assert.match(lib, /let receiver = self\.inner\.read\("Counter", &\[\]\)\.map_err\([^\n]*\)\?;\n\s+let result = with_faults\("counter\.total", \|\| polyspec_sample::Counter::total\(&receiver\)\);/, lang);
    assert.match(lib, /let other = held_counter\([^\n]*\)\?;\n\s+let mut receiver = self\.inner\.write\("Counter"\)[^\n]*\n\s+let other = other\.read\("Counter", &\[\]\)[^\n]*\n\s+let \(\): \(\) = with_faults\("counter\.absorb", \|\| polyspec_sample::Counter::absorb\(&mut receiver, &other\)\);/, lang);
    assert.match(lib, /let tag = tag\.read\("Tag", &\[\]\)[^\n]*\n\s+let result = with_faults\("sample\.shout", \|\| polyspec_sample::shout\(&tag\)\);/, lang);
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

test('a member that writes its receiver takes a source and a default in one call (GN-6h, GN-6i, GN-6j)', () => {
  const out = shaped();
  // The arguments are converted, the default left as None, before the write lock of the receiver is taken.
  const lines: Record<string, RegExp> = {
    'packages/python/generated/lib.rs': /let source: Vec<u8> = in_source\(py, source, "source"\)\?;\n\s+let times: Option<u64> = in_default\(&times, [^\n]*\n\s+let mut receiver = self\.inner\.write\("Buffer"\)[^\n]*\n\s+let result = polyspec_shapes::Buffer::append\(&mut receiver, &source, times\);/,
    'packages/ts/generated/lib.rs': /let source: Vec<u8> = in_source\(source, "source"\)\?;\n\s+let times: Option<u64> = in_default\(times, [^\n]*\n\s+let mut receiver = self\.inner\.write\("Buffer"\)[^\n]*\n\s+let result = polyspec_shapes::Buffer::append\(&mut receiver, &source, times\);/,
    'packages/php-ext/generated/lib.rs': /let source: Vec<u8> = in_latin1\(source, "source"\)\?;\n\s+let times: Option<u64> = in_default\(times, [^\n]*\n\s+let mut receiver = self\.inner\.write\("Buffer"\)[^\n]*\n\s+let result = polyspec_shapes::Buffer::append\(&mut receiver, &source, times\);/,
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
  assert.match(python, /let source: Vec<u8> = in_source\(py, source, "source"\)\?;/);
  assert.match(text(out, 'packages/python/generated/python/polyspec/shapes/_native.pyi'), /def length\(source: str \| bytes \| bytearray \| memoryview\) -> int: \.\.\./);
  const node = text(out, 'packages/ts/generated/lib.rs');
  assert.match(node, /in_bytes\(value, subject\)\.map_err\(\|_other\| type_error\(subject, "string or Uint8Array"\)\)/);
  assert.match(node, /match unsafe \{ value\.cast::<Uint8Array>\(\) \}/);
  assert.match(node, /Uint8Array::new\(value\.as_ref\(\)\.to_vec\(\)\)/);
  assert.match(text(out, 'packages/ts/generated/index.d.ts'), /export declare function reversed\(data: Uint8Array\): Uint8Array;/);
  // A PHP string is its bytes, which the core judges.
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /let source: Vec<u8> = in_latin1\(source, "source"\)\?;/);
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
  assert.match(python, /let times: Option<u64> = in_default\(&times, \|value\| in_uint\(py, value, "times"\)\)\?;/);
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
  assert.match(text(out, 'packages/php-ext/generated/lib.rs'), /fn in_default<T>\(value: Option<&Zval>/);
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
  assert.throws(() => shaped((c) => { parameter(c, 'shapes.repeat', 'times').type = { optional: 'uint' }; }), /a default of an optional type is not generated yet \(U-2\)/);
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
  assert.match(wasmLib, /let times: Option<u64> = in_default\(&times, \|value\| in_uint\(value, "times"\)\)\?;/);
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
    assert.match(text(files, `${dir}/lib.rs`), /let left: Option<String> = in_default\(&?member_or_undefined\(&?options, "left", "options"\)\?/);
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

test('a struct error is matched by the code of its projection, and a nested variant by its two paths (GN-7b, E-1b)', () => {
  // errors.code names the type that the core paths return and the function that gives its code; the kinds are the
  // variants of the code enum, and Limit holds a value of another enum, written <outer>/<inner>.
  const nested = 'polyspec_shapes::Code::Limit/polyspec_shapes::Count::TooMany';
  const out = shaped((c) => {
    c.errors.code = { error: 'polyspec_shapes::Failure', path: 'polyspec_shapes::Failure::code' };
    const renamed = (variant: string): string => variant === 'polyspec_shapes::Error::TooMany' ? nested : variant.replace('::Error::', '::Code::');
    for (const row of c.errors.kinds) row.variant = renamed(row.variant);
    for (const unit of c.units) for (const m of unit.members ?? []) if (m.raises !== undefined) m.raises = m.raises.map(renamed);
  });
  const pattern = 'polyspec_shapes::Code::Limit(polyspec_shapes::Count::TooMany { .. })';
  for (const crate of ['packages/go/internal/ffi/generated/lib.rs', 'packages/ts/wasm/generated/lib.rs', ...LIBS]) {
    const lib = text(out, crate);
    assert.match(lib, /fn core_error\([^)]*error: polyspec_shapes::Failure\)/, crate);
    assert.ok(lib.includes('match polyspec_shapes::Failure::code(&error) {'), `${crate} matches the code of the error`);
    assert.doesNotMatch(lib, /match error \{/, `${crate} matches no error without its code`);
    assert.ok(lib.includes(`${pattern} =>`), `${crate} matches the nested variant by its pattern`);
    assert.ok(lib.includes(`const _: fn(&polyspec_shapes::Failure) -> bool = |error| matches!(polyspec_shapes::Failure::code(error), ${pattern});`), `${crate} asserts the nested variant through the projection`);
    assert.ok(lib.includes('const _: fn(&polyspec_shapes::Failure) -> bool = |error| matches!(polyspec_shapes::Failure::code(error), polyspec_shapes::Code::Empty { .. });'), `${crate} asserts a variant of the code`);
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
  assert.match(lib, /\nfn in_data\(value: &JsValue, _subject: &str\) -> Result<polyspec_sample::Data, Fail> \{\n {4}let mut host = JsHost \{ held: Vec::new\(\) \};/);
  assert.match(lib, /polyspec_sample::data_from_host\(&mut host, described\)\.map_err\(\|failure: binding_core::Failure<polyspec_sample::Error>\| failure_error\(failure\)\)/);
  assert.match(lib, /OutValue::Map\(value\) => \{\n {12}let handle = value\.handle\(\);\n {12}let len = value\.len\(\);\n {12}if let Some\(made\)/);
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
  assert.match(lib, /#\[wasm_bindgen\(js_name = "__Tag_new"\)\]\n {4}pub fn class_tag_new\(name: JsValue\) -> Result<u32, JsValue> \{/);
  // GN-6h: a value of the class comes in from the language, so the class holds it in a lock that each call reads.
  assert.match(lib, /pub fn class_tag_name\(this: u32\) -> Result<JsValue, JsValue> \{\n {8}guard\(\|\| \{\n {12}let held = held_tag\(this\)\?;\n {12}let receiver = held\.read\("Tag", &\[\]\)\.map_err\(binding_error\)\?;\n {12}let result = polyspec_sample::Tag::name\(&receiver\);/);
  assert.match(lib, /#\[wasm_bindgen\(js_name = "__Tag_free"\)\]/);
  assert.match(lib, /\nfn in_tag\(value: &JsValue, subject: &str\) -> Result<polyspec_sample::Tag, Fail> \{\n {4}let handle = handle_of\(0, value\)\?/);
  assert.match(lib, /pub fn register\(classes: Vec<Function>, makers: Vec<Function>, readers: Vec<Function>\)/);
  // Q-4 only: the to_json of the sample names php and node, so WASM has none.
  assert.doesNotMatch(lib, /host_json/);
  const entry = text(out, 'packages/ts/wasm/generated/index.mjs');
  assert.match(entry, /\nexport class Tag \{\n {2}#handle;\n/);
  assert.match(entry, /this\.#handle = enter\(SampleInternalError, \(\) => glue\.__Tag_new\(args\[0\]\)\);/);
  assert.match(entry, /released\.register\(this, \[glue\.__Tag_free, this\.#handle\]\);/);
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
  assert.match(text(withHook, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /assert\.throws\(\(\) => JSON\.stringify\(new pkg\.Tag\('a'\)\)/);
  // GN-18a, GN-6h: a member that writes its receiver takes the write guard of the lock that the table holds.
  const written = classSample(['wasm']);
  const full2 = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  const counter = full2.units.find((u: any) => u.id === 'counter');
  counter.members = counter.members.filter((m: any) => ['counter.new', 'counter.total', 'counter.add'].includes(m.id));
  written.units.push(counter);
  const writing = text(generate({ contract: written, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles: sampleCases() }), 'packages/ts/wasm/generated/lib.rs');
  assert.match(writing, /let held = held_counter\(this\)\?;\n[^\n]*\n {12}let mut receiver = held\.write\("Counter"\)\.map_err\(binding_error\)\?;/);
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
    // of B-5c (GN-5) is no member.
    const members = lib.replace(/\n(?:pub )?fn _?panic_test_held\([\s\S]*?\n\}\n/, '\n');
    assert.notEqual(members, lib, path);
    assert.equal(members.match(/guard\((py, )?\|\| (?!shielded|panic!|binding_core::fault|\{\n        let (id: u64|_value))/g), null, path);
    // GN-8a: the arming is taken where the core is called, after the arguments are converted and the locks are
    // taken, so a call that fails before the core leaves it.
    assert.match(lib, /let result = match with_faults\("sample\.measure", \|\| polyspec_sample::measure\(&text\)\) \{/, path);
    assert.match(lib, /let mut receiver = self\.inner\.write\("Counter"\)[^\n]*\?;\n\s+let other = other\.read\("Counter", &\[\]\)[^\n]*\?;\n\s+let result = match with_faults\("counter\.draw", \|\| polyspec_sample::Counter::draw\(&mut receiver, &other\)\) \{/, path);
    // The core call of an iterate is the whole iteration.
    assert.match(lib, /in with_faults\("tag\.entries", \|\| collected\(polyspec_sample::Tag::entries\(&receiver\)\)\)/, path);
    // Each core call is armed for its own member, and none twice.
    assert.equal((lib.match(/with_faults\("/g) ?? []).length, (lib.match(/shielded\(\|\| /g) ?? []).length, path);
  }
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

test('a contract without fault injection points has no item of them (G-5)', () => {
  const out = sampleWith((c, cases) => {
    delete c.faults;
    cases.measure = [];
  });
  for (const path of LIBS) assert.doesNotMatch(text(out, path), /with_faults|fault::|fault-test/, path);
  assert.throws(() => sampleWith((c) => { delete c.faults; }), /arms faults, but the contract names no fault injection point/);
});

test('the errno of a case is the value of its symbol in Python and Node, and PHP is refused by name (G-5)', () => {
  const withErrno = (c: any, cases: any): void => {
    cases.measure[0].faults[0].errno = 'ENOSPC';
    cases.measure[0].raises.errno = 'ENOSPC';
  };
  const out = sampleWith(withErrno, ['python', 'node']);
  assert.match(text(out, pythonTests), /^import errno\nimport unittest$/m);
  assert.match(text(out, pythonTests), /self\.assertEqual\(error\.errno, errno\.ENOSPC\)/);
  assert.match(text(out, nodeTests), /const errnoOf = constants\.errno;/);
  assert.match(text(out, nodeTests), /error\.errno === errnoOf\.ENOSPC\);/);
  assert.throws(() => sampleWith(withErrno), /a_read_that_fails_is_unreadable of sample\.measure: the errno symbol ENOSPC is not compared in PHP yet/);
});

test('fault injection points, the kinds of an alias and the point of another library are refused by name where they are not generated (G-4)', () => {
  const drop = (c: any, cases: any): void => {
    c.units = c.units.filter((u: any) => !['lookup', 'tag', 'data', 'counter', 'ledger'].includes(u.id));
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
  assert.equal((lib.match(/with_faults\("/g) ?? []).length, (lib.match(/shielded\(\|\| /g) ?? []).length);
  const sample = JSON.parse(readFileSync(new URL('../../../tests/e2e/sample/packages/rust/interface.json', import.meta.url), 'utf8'));
  assert.match(String(trackedPackages(sample, '0.0.0').get('packages/ts/wasm/Cargo.toml')), /\[features\]\npanic-test = \[\]\nfault-test = \["polyspec-sample\/fault-test"\]\ncodec-test = \[\]\n\n/);
  assert.match(text(wasm, 'packages/ts/wasm/generated/tests/generated.test.mjs'), /async \(\) => \{\n  const glue = await glueModule\(\);\n  const arg0 = 'abc';\n  const armed = glue\.__armFaults\('sample\.measure', [^\n]*\n  assert\.throws\(\(\) => pkg\.measure\(arg0\)(?:[^\n]*\n)+?  assert\.deepEqual\(glue\.__faultLeft\(armed\), \[\]\);/);
  assert.throws(() => sampleWith((c, cases) => { cases.measure[0].faults[0].point = 'other.read'; }), /the point other\.read of another library is not armed yet/);
  assert.throws(() => sampleWith((c, cases) => { cases.data_in[0].value = { host: 'callable' }; }), /of the alias data: a value \{"host": \.\.\.\} is not generated yet/);
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
    c.units = c.units.filter((u: any) => !['lookup', 'tag', 'data', 'counter', 'ledger'].includes(u.id));
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
  for (const path of ['packages/python/Cargo.toml', 'packages/ts/Cargo.toml', 'packages/php-ext/Cargo.toml']) {
    assert.match(String(packages.get(path)), /\[features\]\npanic-test = \[\]\nfault-test = \["polyspec-sample\/fault-test"\]\ncodec-test = \[\]\n\n\[/, path);
  }
  delete sample.faults;
  delete sample.units.find((u: any) => u.id === 'data').in_raises;
  assert.match(String(trackedPackages(sample, '0.0.0').get('packages/python/Cargo.toml')), /\[features\]\npanic-test = \[\]\n\n\[dependencies\]/);
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
    /polyspec_sample::Error::Other: a kind of another library \(E-1b \(a\)\) is not generated yet/,
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
    assert.ok(lib.includes('let result = polyspec_classes::Tag::same(&receiver, &mut other);'), `${crate} gives the core the write borrow`);
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
  // PHP code sets the kind in the scope of the class of its category, which declares it.
  assert.match(text(out, phpTests), /\$error = new \\Polyspec\\Consumer\\AbsentError\("G-5: absent"\); \(static fn \(\) => \$error->kind = "absent"\)->bindTo\(null, \\Polyspec\\Consumer\\ConsumerValueError::class\)\(\);/);
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
  // G-5: a call after the receiver self is kind consumed, and the destruction without cleanup warns.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /ResourceWarning/);
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /consumed/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /'warning'/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /consumed/);
  // Go and WASM refuse the unit and the receiver self by name; a cleanup that is not a method with the receiver self is
  // refused.
  const everywhere = (contract: any): void => {
    for (const unit of contract.units) for (const member of unit.members ?? []) if (member.only?.reason === 'GN-6p') delete member.only;
  };
  assert.throws(() => classes(everywhere, ['go']), /lease: a class unit with cleanup is not generated for Go yet \(GN-6p\)/);
  assert.throws(() => classes(everywhere, ['wasm']), /lease\.release: a method with the receiver self is not generated for WASM yet \(GN-6o\)/);
  assert.throws(() => classes((c) => { c.units.find((u: any) => u.id === 'lease').cleanup = 'lease.holder'; }, ['node']), /lease: the cleanup lease\.holder is no method with the receiver self \(GN-6p\)/);
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
  const method = /async move \{[^\n]*polyspec_classes::Gate::enter_later\(&[a-z_]+\)\.await/;
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
  const dts = text(out, 'packages/ts/generated/index.d.ts');
  assert.match(dts, /export declare function fetch\(name: string\): Promise<string>;/);
  assert.match(dts, /\n {2}enterLater\(\): Promise<string>;/);
  assert.match(text(out, 'packages/ts/generated/tests/generated.test.mjs'), /await pkg\.fetch\('a'\)/);
  // The binding crates turn on the driver of binding_core, and the Node crate the tokio runtime of napi.
  const crates = trackedPackages(read('packages/rust/interface.json'), '0.0.0');
  for (const crate of ['packages/php-ext/Cargo.toml', 'packages/python/Cargo.toml', 'packages/ts/Cargo.toml']) {
    assert.match(String(crates.get(crate)), /polyspec-binding-core = \{[^\n]*features = \[[^\]\n]*"driver"/, crate);
  }
  assert.match(String(crates.get('packages/ts/Cargo.toml')), /napi = \{[^\n]*features = \[[^\]\n]*"tokio_rt"/);
  assert.doesNotMatch(String(crates.get('packages/go/internal/ffi/Cargo.toml')), /"driver"/);
  // Go and WASM name such a member as not generated yet; a constructor that awaits is refused by name.
  const everywhere = (contract: any): void => {
    for (const unit of contract.units) for (const member of unit.members ?? []) if (member.wait !== undefined && member.wait !== 'none') delete member.only;
  };
  assert.throws(() => classes(everywhere, ['go']), /classes\.fetch: wait async_driver is not generated for Go yet \(GN-6n\)/);
  assert.throws(() => classes(everywhere, ['wasm']), /classes\.fetch: wait async_driver is not generated for WASM yet \(GN-6n\)/);
  assert.throws(() => classes((c) => { member(c, 'tag.new').wait = 'async_driver'; }, ['node']), /tag\.new: a constructor with wait async_driver is not generated \(GN-6n\)/);
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
  assert.match(php, /polyspec_classes::Gate::enter_slowly\(&[a-z_]+, binding_core::Io::for_generated_call\(\)\)/);
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
  const dts = text(out, 'packages/ts/generated/index.d.ts');
  assert.match(dts, /export declare function read\(name: string\): Promise<string>;/);
  assert.match(dts, /\n {2}enterSlowly\(\): Promise<string>;/);
  const tests = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(tests, /await pkg\.read\('a'\)/);
  assert.match(tests, /await assert\.rejects\(/);
  // WASM has no member that waits (only, Q-4); Go names it as not generated yet.
  assert.doesNotMatch(text(out, 'packages/ts/wasm/generated/index.mjs'), /enterSlowly|\bread\(/);
  const everywhere = (contract: any): void => {
    for (const unit of contract.units) for (const member of unit.members ?? []) if (member.wait === 'blocking_io') delete member.only;
    contract.targets = contract.targets.filter((t: string) => t !== 'wasm');
  };
  assert.throws(() => classes(everywhere, ['go']), /classes\.read: wait blocking_io is not generated for Go yet \(GN-6m\)/);
  // A constructor that waits has no awaited form: refused by name.
  assert.throws(() => classes((c) => { member(c, 'tag.new').wait = 'blocking_io'; }, ['node']), /tag\.new: a constructor with wait blocking_io is not generated \(GN-6m\)/);
});
