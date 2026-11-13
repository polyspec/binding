// The contract cases of the consumer sample run against the installed Node package (V-1): the value alias of another
// repository crosses the functions and the callback both ways (T-3, U-7 (a')).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as consumer from '@polyspec/consumer';

const cases = JSON.parse(readFileSync(process.env.CASES, 'utf8'));

// A case value of data as the JavaScript value that the alias takes and gives (GN-13).
function value(given) {
  if (given.kind === 'null') return null;
  if (given.kind === 'list') return given.value.map(value);
  if (given.kind === 'map') return new Map(given.value.map(([key, item]) => [key, value(item)]));
  return given.value;
}

const holder = (held) => ({
  get: (key) => (held.has(key) ? held.get(key) : null),
  set: (key, item) => void held.set(key, item),
});

test('measure and pair take and give data', () => {
  assert.ok(cases.measure.length > 0 && cases.pair.length > 0);
  for (const kase of cases.measure) assert.equal(consumer.measure(value(kase.value)), kase.result, kase.id);
  for (const kase of cases.pair) assert.deepEqual(consumer.pair(value(kase.value)), value(kase.result), kase.id);
});

test('the holder gives and takes data', () => {
  const held = new Map([['a', new Map([['k', [1.5, 'x', null, true]]])]]);
  assert.deepEqual(consumer.fetch(holder(held), 'a'), held.get('a'));
  assert.equal(consumer.copy(holder(held), 'a', 'b'), true);
  assert.deepEqual(held.get('b'), held.get('a'));
  assert.equal(consumer.copy(holder(held), 'c', 'd'), false);
  assert.equal(held.has('d'), false);
});

test('fetch raises its cases', () => {
  assert.ok(cases.fetch.length > 0);
  for (const kase of cases.fetch) {
    assert.throws(() => consumer.fetch(holder(new Map()), kase.key), (error) =>
      // E-2, I-3: the kind has the class of its error unit, whose properties the core error gives.
      error.constructor === consumer.AbsentError && error instanceof consumer.ConsumerValueError && error.name === 'AbsentError' &&
      error.kind === kase.raises.kind && error.message === kase.raises.message && error.key === kase.key && error.length === kase.key.length &&
      Object.getOwnPropertyDescriptor(error, 'key').writable === false, kase.id);
  }
  assert.throws(() => consumer.fetch(holder(new Map()), ''), (error) => error.constructor === consumer.AbsentError && error.key === '' && error.length === null);
});

test('a value that the owner of the alias refuses is its kind in the class of this library', () => {
  const refused = (error) => error.constructor === consumer.ConsumerValueError && error.kind === 'unsupported' && error.status === null;
  assert.throws(() => consumer.measure(() => 1), refused);
  assert.throws(() => consumer.pair([() => 1]), refused);
  assert.throws(() => consumer.fetch({ get: () => () => 1, set: () => {} }, 'a'), refused);
});
