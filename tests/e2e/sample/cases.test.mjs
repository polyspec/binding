// GN-6at: incoming JavaScript containers retain one handle throughout the core's walk.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as sample from '@polyspec/sample';

test('GN-6at: a list, Map or plain object that contains itself is a cycle', () => {
  const list = [];
  list.push(list);
  const map = new Map();
  map.set('self', map);
  const object = {};
  object.self = object;
  for (const value of [list, map, object]) {
    assert.throws(() => sample.size(value), { constructor: sample.SampleValueError, kind: 'unsupported', message: 'not data: a container cycle' });
  }
  assert.throws(() => sample.size(Array.from({ length: 65 }).reduce(inner => [inner], null)), /a value nested too deep/);
});

test('GN-6at: a shared Map is accepted and its iterator is read once', () => {
  let reads = 0;
  const shared = new Map([['item', 1]]);
  shared[Symbol.iterator] = function* () {
    reads += 1;
    yield* Map.prototype[Symbol.iterator].call(this);
  };
  assert.equal(sample.size([shared, shared]), 2);
  assert.equal(reads, 1);
});
