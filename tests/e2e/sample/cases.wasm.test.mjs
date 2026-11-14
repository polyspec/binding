// GN-6at: the WASM entry keeps the same host-container identities as the native entry.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as wasm from '@polyspec/sample/wasm';

test('GN-6at: a cyclic WASM input is refused before the depth limit and the instance stays usable', () => {
  const cyclic = [];
  cyclic[0] = cyclic;
  assert.throws(() => wasm.size(cyclic), error => error.constructor === wasm.SampleValueError && error.kind === 'unsupported' && error.message === 'not data: a container cycle');
  const mapped = new Map();
  mapped.set('self', mapped);
  assert.throws(() => wasm.size(mapped), /a container cycle/);
  const plain = Object.create(null);
  plain.child = plain;
  assert.throws(() => wasm.size(plain), /a container cycle/);
  assert.equal(wasm.size([1, 2]), 2);
});

test('GN-6at: repeated WASM Map input reuses its first description', () => {
  const map = new Map([['a', 1]]);
  let iterations = 0;
  map[Symbol.iterator] = function* iterator() {
    iterations++;
    yield ['a', 1];
  };
  assert.equal(wasm.size([map, map, map]), 3);
  assert.equal(iterations, 1);
  let nested = null;
  for (let depth = 0; depth < 65; depth++) nested = [nested];
  assert.throws(() => wasm.size(nested), /a value nested too deep/);
});
