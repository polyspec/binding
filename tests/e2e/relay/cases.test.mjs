// The contract cases of relay run against the installed Node packages of relay and json (V-1, B2.87): a json value
// crosses carry both ways, and the value that comes back is the value that went in, its strings by their UTF-16 code
// units (RQ-036, GN-6x).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as relay from '@polyspec/relay';
import * as json from '@polyspec/json';

const cases = JSON.parse(readFileSync(process.env.CASES, 'utf8'));

// A case value of the class value of json, made by the member of its out row of the kind (G-5).
function value(given) {
  switch (given.kind) {
    case 'null': return json.Value.null();
    case 'bool': return json.Value.boolean(given.value);
    case 'number': return json.Value.number(given.value);
    case 'text': return json.Value.string(given.value);
    case 'text16': return json.Value.fromUnits(given.value);
    case 'list': return json.Value.array(given.value.map(value));
    case 'map': {
      const members = new json.OrderedMap();
      for (const [key, item] of given.value) members.insert(typeof key === 'string' ? json.Value.string(key) : value(key), value(item));
      return json.Value.object(members);
    }
    default: throw new Error(`no case value of the kind ${given.kind}`);
  }
}

test('a value that carry gives back is the value that it took', () => {
  assert.ok(cases.carry.length > 0);
  for (const kase of cases.carry) {
    const given = value(kase.value);
    assert.equal(json.stringify(relay.carry(given)), json.stringify(given), kase.id);
  }
});

test('a value at the depth limit crosses carry', () => {
  assert.ok(cases.carry_deep.length > 0);
  for (const kase of cases.carry_deep) {
    let given = json.Value.null();
    for (let level = 0; level < kase.depth; level += 1) given = json.Value.array([given]);
    assert.equal(json.stringify(relay.carry(given)), json.stringify(given), kase.id);
  }
});
