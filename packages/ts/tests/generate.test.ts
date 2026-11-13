// I-5: the same contract and the same binding give the same bytes, in any directory, with no path, time or host of
// the run; and an item that the generator cannot generate is refused by name (G-4).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { generate } from '../src/generate/index.ts';
import { carriers } from '../src/generate/model.ts';
import { fromJson } from '../src/generate/samples.ts';
import { closure } from '../src/generate/text.ts';
import { trackedPackages } from '../src/generate/packages.ts';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const lock = (core: string): string => `version = 4\n\n[[package]]\nname = "polyspec-binding-core"\nversion = "${core}"\n`;
const fixture = new URL('./fixtures/repo/', import.meta.url).pathname;

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
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', first]);
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', second]);
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

test('a generation leaves no file of an earlier one', () => {
  const out = mkdtempSync(join(tmpdir(), 'binding-c-'));
  try {
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', out]);
    const stale = join(out, 'packages/python/generated/stale.py');
    execFileSync('touch', [stale]);
    execFileSync(process.execPath, [cli, 'generate', '--root', fixture, '--out', out]);
    assert.ok(!files(out).has('packages/python/generated/stale.py'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('an item that is not generated yet is refused by its name (G-4)', () => {
  const contract = JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8'));
  contract.units[0].members[0].wait = 'blocking_io';
  const caseFiles = new Map([['contracts/cases.json', JSON.parse(readFileSync(join(fixture, 'contracts/cases.json'), 'utf8'))]]);
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /split: wait blocking_io is not generated yet/);
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
  assert.deepEqual([...dirs].sort(), ['packages/server/php-ext/generated', 'packages/server/python/generated', 'packages/server/ts/generated']);
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
    execFileSync(process.execPath, [cli, 'generate', '--contract', path]);
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
    contract.targets.push('go');
    contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
    writeFileSync(path, JSON.stringify(contract));
    // T-2: a Go array has one element type, so a tuple of two types inside a list is refused by name (G-4).
    assert.throws(() => execFileSync(process.execPath, [cli, 'generate', '--root', root], { stdio: 'pipe' }), /a tuple of \["text","uint"\] inside another type is not generated for Go/);
    contract.units[0].members[0].returns.list.tuple = ['text', 'text'];
    writeFileSync(path, JSON.stringify(contract));
    execFileSync(process.execPath, [cli, 'generate', '--root', root]);
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

test('Go: map<T> is an ordered Map, and a contract with a map and another target is refused by name (T-2, G-4)', () => {
  const { contract, caseFiles } = load();
  contract.units[0].members[0].returns = { map: { list: 'text' } };
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /map<T> is not generated for php yet/);
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
  assert.match(text(out, 'packages/go/zz_generated_test.go'), /range \[\]string\{"\\u0100", "\\xff"\}/);
});

test('keyed_map<T> is an ordered map of mixed key kinds in every language (T-2, GW-8)', () => {
  const { contract, caseFiles } = load();
  contract.units[0].members[0].returns = { list: { keyed_map: 'text', key: ['int', 'text'] } };
  // GN-12: the JavaScript entry turns a Map into its entries, so Node takes a keyed map only as a whole.
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /a map<T> or keyed_map<T> inside another type is not generated for node yet/);
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
      files: ['dist', 'native/generated/index.cjs', 'native/generated/index.mjs', 'native/generated/index.d.ts'],
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
    execFileSync(process.execPath, [cli, 'generate', '--root', root, '--out', out]);
    const generated = files(out);
    assert.ok(generated.has('packages/python/native/generated/lib.rs'));
    assert.ok(generated.has('packages/python/src/polyspec/sample/_binding/__init__.py'));
    assert.ok(generated.has('packages/ts/native/generated/index.cjs'));
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
  assert.match(python, /fixture_0, fixture_0_unexpected, fixture_0_calls = _fixture\(\("find",\), \[\("find", \("a",\), None, False\)\]\)\n {8}with self\.assertRaises\(pkg\.SampleValueError\) as caught:\n {12}pkg\.resolve\(fixture_0, "a"\)/);
  assert.match(python, /self\.assertEqual\(fixture_0_unexpected, \[\]\)\n {8}self\.assertEqual\(fixture_0_calls, \[\("find", \("a",\)\)\]\)/);
  const node = text(out, 'packages/ts/generated/tests/generated.test.mjs');
  assert.match(node, /\nfunction fixture\(members, rows\) \{/);
  assert.match(node, /const fixture0 = fixture\(\['find'\], \[\['find', \['a'\], null, false\]\]\);\n {2}assert\.throws\(\(\) => pkg\.resolve\(fixture0\.object, 'a'\)/);
  assert.match(node, /assert\.deepEqual\(fixture0\.unexpected, \[\]\);\n {2}assert\.deepEqual\(fixture0\.calls, \[\['find', \['a'\]\]\]\);/);
  const php = text(out, 'packages/php-ext/generated/tests/GeneratedTest.php');
  assert.match(php, /\$fixture0 = new class\(\[\["find", \["a"\], null, false\]\]\) \{/);
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
  assert.throws(withRow({ callback: { 'lookup.find': [{ args: { key: 'a' }, raise: { error: 'x', kind: 'y' } }] } }), /a raise row of a callback fixture is not generated yet/);
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
    assert.match(lib, /let mut receiver = self\.inner\.write\("Counter"\)\.map_err\([^\n]*\)\?;\n\s+let result = polyspec_sample::Counter::add\(&mut receiver, amount\);/, lang);
    assert.match(lib, /let receiver = self\.inner\.read\("Counter", &\[\]\)\.map_err\([^\n]*\)\?;\n\s+let result = polyspec_sample::Counter::total\(&receiver\);/, lang);
    assert.match(lib, /let other = held_counter\([^\n]*\)\?;\n\s+let mut receiver = self\.inner\.write\("Counter"\)[^\n]*\n\s+let other = other\.read\("Counter", &\[\]\)[^\n]*\n\s+let \(\): \(\) = polyspec_sample::Counter::absorb\(&mut receiver, &other\);/, lang);
    assert.match(lib, /let tag = tag\.read\("Tag", &\[\]\)[^\n]*\n\s+let result = polyspec_sample::shout\(&tag\);/, lang);
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
  assert.match(node, /test\('B-5c: Ledger refuses a poisoned object', \(\) => \{\n {2}const held = new pkg\.Ledger\('a'\);\n {2}assert\.throws\(\(\) => addon\.__panicTestHeld\(held\), [^\n]*error\.kind === 'internal'\);\n {2}assert\.throws\(\(\) => held\.size, /);
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

test('the binding crates of Python, Node and PHP turn on the locks of binding_core, and Go and WASM do not (GN-6h)', () => {
  const contract = JSON.parse(readFileSync(join(fixture, 'packages/rust/interface.json'), 'utf8'));
  contract.targets = ['php', 'python', 'node', 'go', 'wasm'];
  contract.packages.go = { module: 'github.com/polyspec/sample/packages/go' };
  const files = trackedPackages(contract, '0.0.0');
  const core = (path: string): string => /^polyspec-binding-core = .*$/m.exec(files.get(path) ?? '')?.[0] ?? '';
  for (const path of ['packages/python/Cargo.toml', 'packages/ts/Cargo.toml', 'packages/php-ext/Cargo.toml']) assert.match(core(path), /features = \["construct", "lock"\] \}$/, path);
  for (const path of ['packages/go/internal/ffi/Cargo.toml', 'packages/ts/wasm/Cargo.toml']) assert.match(core(path), /features = \["construct"\] \}$/, path);
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
  assert.throws(() => shaped((c) => { c.targets = [...c.targets, 'go']; }), /shapes\.length\.source: the type source is not generated for go yet \(T-1\)/);
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
  assert.throws(() => shaped((c) => { const p = parameter(c, 'shapes.frame', 'options'); delete p.required; p.default = { empty: 'object' }; }), /a default of a record parameter is not generated yet \(U-2 \{empty: "object"\}\)/);
  assert.throws(() => shaped((c) => { parameter(c, 'shapes.repeat', 'times').type = { optional: 'uint' }; }), /a default of an optional type is not generated yet \(U-2\)/);
  assert.throws(() => shaped((c) => { delete parameter(c, 'shapes.repeat', 'separator').default_core; }), /a \{literal\} or \{const\} default names the constant of the core in default_core \(U-2\)/);
  assert.throws(() => shaped((c) => { delete field(c, 'upper').default_core; }), /a \{literal\} or \{const\} default names the constant of the core in default_core \(U-2\)/);
  assert.throws(() => shaped((c) => { member(c, 'shapes.repeat').parameters.push({ name: ['last'], type: 'uint', required: true }); }), /shapes\.repeat: the required last follows a parameter with a default, which is not generated yet \(U-2\)/);
  assert.throws(() => shaped((c) => { parameter(c, 'shapes.total', 'numbers').default = { empty: 'map' }; }), /the default \{empty: "map"\} of the type \{"list":"uint"\} is not generated \(U-2\)/);
  assert.throws(() => shaped((c) => { member(c, 'shapes.frame').returns = { unit: 'frame_options' }; }), /frame_options\.upper: a field default of a record with the result form is not generated yet \(T-4\)/);
  assert.throws(() => shaped((c) => { c.targets = [...c.targets, 'wasm']; member(c, 'shapes.length').parameters[0].type = 'text'; }), /shapes\.repeat\.times: a default is not generated for wasm yet \(U-2, T-4\)/);
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
  assert.match(stub, /\n {4}class ParseError extends ShapesValueError\n/);
  assert.match(stub, /\n {4}final class Utf8Error extends ParseError\n/);
  const php = text(out, 'packages/php-ext/generated/lib.rs');
  assert.match(php, /\.extends\(\(library_class_0, "\\\\Polyspec\\\\Shapes\\\\ShapesValueError"\)\)/);
  assert.match(php, /\.extends\(\(library_class_6, "\\\\Polyspec\\\\Shapes\\\\ParseError"\)\)\n\s+\.flags\(ClassFlags::Final\)/);
  assert.match(php, /match CLASSES\.first\(\)\.and_then\(OnceLock::get\)/);
  // A kind with `class` is thrown as that class, one without as the class of its category.
  for (const path of ['packages/ts/generated/lib.rs', 'packages/php-ext/generated/lib.rs']) {
    assert.match(text(out, path), /Error::Empty \{ \.\. \} => 6,\n\s+polyspec_shapes::Error::NotUtf8 \{ \.\. \} => 7,\n\s+polyspec_shapes::Error::TooMany \{ \.\. \} => 0,/);
  }
  // B-4: the exact class of a case is the class of its kind.
  assert.match(text(out, 'packages/python/generated/tests/test_generated.py'), /self\.assertIs\(type\(error\), pkg\.Utf8Error\)/);
  assert.match(text(out, 'packages/php-ext/generated/tests/GeneratedTest.php'), /assertSame\(\\Polyspec\\Shapes\\Utf8Error::class, \$error::class\)/);
  // G-4: what E-2 and E-3 hold beyond that is refused by name.
  assert.throws(() => shaped((c) => { unitOf(c, 'parse_error').members = [{ id: 'parse_error.offset', name: ['offset'], kind: 'property', visibility: 'public', type: 'uint', core: 'polyspec_shapes::Error::offset' }]; }), /parse_error: the members of an error unit are not generated yet \(E-2, E-3\)/);
  assert.throws(() => shaped((c) => { unitOf(c, 'parse_error').module = 'errors'; }), /parse_error: an error unit in the module errors is not generated yet/);
  assert.throws(() => shaped((c) => { c.errors.kinds[2].class = 'frame_options'; }), /TooMany: the class frame_options is no error unit that is generated/);
  assert.throws(() => shaped((c) => { unitOf(c, 'parse_error').parent = 'utf8_error'; }), /the parents of the error units make a cycle/);
  assert.throws(() => shaped((c) => { c.targets = [...c.targets, 'go']; member(c, 'shapes.length').parameters[0].type = 'text'; for (const u of c.units) for (const m of u.members ?? []) for (const p of m.parameters ?? []) if (p.default !== undefined) { delete p.default; delete p.default_core; p.required = true; } for (const f of unitOf(c, 'frame_options').fields) if (f.default !== undefined) { delete f.default; delete f.default_core; f.required = true; } }), /parse_error: an error unit is not generated for go yet \(E-2, E-7\)/);
});
