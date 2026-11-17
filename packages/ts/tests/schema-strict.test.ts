// B2.443: interface.schema.json compiles in Ajv strict mode with no strict option turned off (CK-1), so a consumer can
// validate an interface.json with it, and the rewritten rules accept and refuse what the old ones did.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';

const schema = JSON.parse(
  readFileSync(new URL('../schema/interface.schema.json', import.meta.url), 'utf8'),
) as { $id: string };

describe('B2.443 interface.schema.json in Ajv strict mode', () => {
  test('B2.443 the schema compiles with new Ajv({ strict: true })', () => {
    const ajv = new Ajv2020({ strict: true });
    assert.doesNotThrow(() => ajv.compile(schema));
  });

  test('B2.443 a naming exception names a parameter or a field, never both, as the old not did', () => {
    const ajv = new Ajv2020({ strict: true });
    ajv.addSchema(schema);
    const strictRule = ajv.getSchema(`${schema.$id}#/$defs/namingException`);
    assert.ok(strictRule);
    // The old form of the rule: a `not` whose `required` names properties it does not define.
    const old = new Ajv2020({ strict: false }).compile({
      type: 'object',
      properties: { parameter: { type: 'array' }, field: { type: 'array' } },
      not: { required: ['parameter', 'field'] },
    });
    const base = { lang: 'php', unit: 'forms.parser', name: 'value', reason: 'N-3' };
    const cases: [object, boolean][] = [
      [base, true],
      [{ ...base, parameter: ['value'] }, true],
      [{ ...base, field: ['value'] }, true],
      [{ ...base, parameter: ['value'], field: ['value'] }, false],
    ];
    for (const [instance, accepted] of cases) {
      assert.equal(old(instance), accepted, `old rule on ${JSON.stringify(instance)}`);
      assert.equal(strictRule(instance), accepted, `${JSON.stringify(strictRule.errors)} on ${JSON.stringify(instance)}`);
    }
  });

  test('B2.443 a literal default is a string, a number, a boolean or null, as the old union type was', () => {
    const ajv = new Ajv2020({ strict: true });
    ajv.addSchema(schema);
    const literal = ajv.getSchema(`${schema.$id}#/$defs/literal`);
    assert.ok(literal);
    for (const value of ['a', 1, 1.5, true, null]) assert.equal(literal(value), true, JSON.stringify(value));
    for (const value of [[], {}]) assert.equal(literal(value), false, JSON.stringify(value));
  });
});
