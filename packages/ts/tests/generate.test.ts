// I-5: the same contract and the same binding give the same bytes, in any directory, with no path, time or host of
// the run; and an item that the generator cannot generate is refused by name (G-4).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { generate } from '../src/generate/index.ts';
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

test('check refuses a binding_core of another version than the CLI (CK-20)', () => {
  const root = mkdtempSync(join(tmpdir(), 'binding-g-'));
  try {
    execFileSync('cp', ['-r', `${fixture}.`, root]);
    const contract = join(root, 'packages/rust/interface.json');
    execFileSync(process.execPath, [cli, 'scaffold', '--root', root]);
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), /CK-20 there is no Cargo\.lock/);
    writeFileSync(join(root, 'Cargo.lock'), lock('0.0.0-other'));
    assert.throws(() => execFileSync(process.execPath, [cli, 'check', contract], { stdio: 'pipe' }), /CK-20 Cargo\.lock pins polyspec-binding-core 0\.0\.0-other/);
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
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /map<T> is not generated for php, node yet/);
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
  assert.throws(() => generate({ contract, version: '0.0.0', coreLib: 'polyspec_sample', caseFiles }), /a keyed_map<T> inside another type is not generated for node yet/);
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
    writeFileSync(join(root, 'Cargo.lock'), lock(version));
    const missing = spawnSync(process.execPath, [cli, 'check', contract], { encoding: 'utf8' });
    assert.match(missing.stderr, /python\/pyproject\.toml: CK-19 build-system\.build-backend is missing/);
    assert.match(missing.stderr, /php\/composer\.json: CK-19 require\.ext-polyspec_sample is missing/);
    assert.match(missing.stderr, /ts\/package\.json: CK-19 files \(native\/generated\/\*\.node\) is missing/);
    const pyproject = (module: string): string =>
      `[build-system]\nbuild-backend = "maturin"\n\n[tool.maturin]\nmanifest-path = "native/Cargo.toml"\npython-source = "src"\nmodule-name = "${module}"\n`;
    writeFileSync(join(root, 'packages/python/pyproject.toml'), pyproject('polyspec.sample._native'));
    writeFileSync(join(root, 'packages/ts/package.json'), JSON.stringify({
      name: '@polyspec/sample',
      files: ['dist', 'native/generated/index.cjs', 'native/generated/index.mjs', 'native/generated/index.d.ts', 'native/generated/*.node'],
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
