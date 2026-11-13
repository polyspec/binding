// The contract cases of the classes repository run against the installed Node package (V-1), the WASM module of the subpath ./wasm (P-5): a class unit
// with a static member, methods that take arguments and the class, and the hooks of N-4 (T-5, U-2).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as pkg from '@polyspec/classes/wasm';

const cases = JSON.parse(readFileSync(process.env.CASES, 'utf8'));
const type = (error) => error.constructor === pkg.ClassesTypeError && error.kind === 'invalid_argument_type';
const missing = (error) => error.constructor === pkg.ClassesValueError && error.kind === 'missing';

test('the cases of the members that give a value', () => {
  assert.ok(cases.tag_name.length > 0 && cases.tag_to_string.length > 0 && cases.tag_repeat.length > 0);
  for (const kase of cases.tag_name) assert.equal(new pkg.Tag(kase.name).name, kase.result, kase.id);
  for (const kase of cases.tag_to_string) assert.equal(String(new pkg.Tag(kase.name)), kase.result, kase.id);
  for (const kase of cases.tag_repeat) {
    assert.deepEqual(new pkg.Tag(kase.name).repeat(kase.count).map((tag) => tag.name), Array.from({ length: kase.count }, () => kase.name), kase.id);
  }
  for (const kase of cases.tag_parse.filter((row) => row.raises === undefined)) assert.equal(pkg.Tag.parse(kase.text).name, kase.text, kase.id);
});

test('a class crosses both ways (T-5)', () => {
  const a = new pkg.Tag('a');
  assert.ok(a instanceof pkg.Tag);
  const loud = pkg.shout(a);
  assert.ok(loud instanceof pkg.Tag);
  assert.equal(loud.name, 'A');
  assert.equal(pkg.join([a, loud]), 'a,A');
  assert.deepEqual([...a].map(([key, value]) => [key, value.name]), [['a', 'a']]);
  assert.equal(pkg.Tag.parse('b').withSuffix('c').name, 'bc');
  assert.equal(a.same(new pkg.Tag('a')), true);
  assert.equal(a.same(loud), false);
  for (const tag of a.repeat(3)) assert.ok(tag instanceof pkg.Tag);
});

test('a value that is no instance is kind invalid_argument_type (B-1)', () => {
  for (const bad of [null, undefined, 1, 'a', {}, { name: 'a' }, Object.create(pkg.Tag.prototype), () => 1]) {
    assert.throws(() => pkg.shout(bad), type);
    assert.throws(() => pkg.join([bad]), type);
    assert.throws(() => new pkg.Tag('a').same(bad), type);
  }
});

test('a generated interface takes the classes that implement it (GN-6ap)', () => {
  const a = new pkg.Tag('a');
  assert.equal(pkg.labelOf(a), '#a');
  assert.equal(pkg.labelOf(a.gate()), 'gate of a');
  assert.equal(pkg.labelOr(null, 'none'), 'none');
  assert.equal(pkg.labelOr(a, 'none'), '#a');
  assert.equal(a.names(a), true);
  assert.equal(a.names(new pkg.Tag('b').gate()), false);
  for (const bad of [null, undefined, 1, 'a', {}, Object.create(pkg.Tag.prototype)]) {
    assert.throws(() => pkg.labelOf(bad), type);
    assert.throws(() => a.names(bad), type);
  }
  assert.throws(() => pkg.labelOr(1, 'none'), type);
});

test('a static member and a method give the kind of the core (B-4)', () => {
  assert.throws(() => pkg.Tag.parse(''), missing);
  assert.throws(() => new pkg.Tag('a').withSuffix(''), missing);
  assert.throws(() => JSON.stringify(new pkg.Tag('a')), (error) => error.constructor === pkg.ClassesValueError && error.kind === 'unsupported');
  assert.throws(() => pkg.Tag.parse(), TypeError);
});

test('a member called on another receiver is refused (GN-18a)', () => {
  assert.throws(() => pkg.Tag.prototype.same.call({}, new pkg.Tag('a')), TypeError);
});

// GN-18a: a FinalizationRegistry drops the value of a collected instance, and its handle is used again. The test needs
// the collector, which node exposes with --expose-gc (scripts/e2e.mts passes it); without it the test fails, because a
// skipped test verifies nothing.
test('the value of a collected instance is dropped and its handle is used again (GN-18a)', async () => {
  assert.equal(typeof globalThis.gc, 'function', 'node runs this test with --expose-gc');
  const glue = await import(new URL('./classes_wasm.js', import.meta.resolve('@polyspec/classes/wasm')).href);
  // The handle that the next instance takes, read through the module's export of the constructor.
  const next = () => {
    const handle = glue.__Tag_new('probe');
    glue.__Tag_free(handle);
    return handle;
  };
  const before = next();
  for (let i = 0; i < 1000; i += 1) new pkg.Tag(String(i));
  assert.equal(next(), before + 1000, 'each instance holds a handle');
  for (let round = 0; round < 50; round += 1) {
    globalThis.gc();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  // Every handle of the collected instances is free: 1000 new values take no handle above the highest one.
  const taken = Array.from({ length: 1000 }, () => glue.__Tag_new('probe'));
  assert.ok(Math.max(...taken) <= before + 1000, `the highest handle is ${Math.max(...taken)}, after ${before}`);
  for (const handle of taken) glue.__Tag_free(handle);
});
