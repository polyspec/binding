// Every check of docs/spec/contract-check.md: the fixture passes, and each change below fails with the finding of the
// check that owns the rule, at the path of the changed item, and with no finding of another check.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { checkContract, type Finding } from '../src/index.ts';
import { GO_BINDING_NAMES } from '../src/check.ts';
import { contract, dependency, member, unit, unitIndex } from './fixture.ts';

const deps = (): Map<string, unknown> => new Map([['forms-dep', dependency()]]);

function findings(change: (c: any, d: any) => void, withDependency = true): Finding[] {
  const c = contract();
  const d = dependency();
  change(c, d);
  return checkContract(c, withDependency ? { dependencies: new Map([['forms-dep', d]]) } : {});
}

// The change fails with check `check` at a path that starts with `path`, and only with findings of that check.
function fails(check: string, path: string, change: (c: any, d: any) => void, withDependency = true): void {
  const result = findings(change, withDependency);
  assert.ok(
    result.some((f) => f.check === check && f.path.startsWith(path)),
    `expected ${check} at ${path}, got ${JSON.stringify(result, null, 2)}`,
  );
  const others = result.filter((f) => f.check !== check);
  assert.deepEqual(others, [], `findings of other checks: ${JSON.stringify(others, null, 2)}`);
}

// The path of a unit of the fixture.
const at = (id: string): string => `/units/${unitIndex(contract(), id)}`;

test('the fixture passes every check', () => {
  assert.deepEqual(checkContract(contract(), { dependencies: deps() }), []);
});

test('the dependency fixture passes every check', () => {
  assert.deepEqual(checkContract(dependency()), []);
});

describe('CK-1 schema', () => {
  test('a core outside packages/rust and packages/<component>/rust (L-1)', () =>
    fails('CK-1', '/core/path', (c) => { c.core.path = 'crates/core'; }));
  test('a core of a component is accepted (L-1)', () => {
    assert.deepEqual(findings((c) => { c.core.path = 'packages/server/rust'; }), []);
  });
  test('a native declaration without a reason', () => {
    fails('CK-1', '/units/', (c) => {
      member(c, 'forms.parse').native = { node: { signature: 'parse<S>(body: S): Map<string, string>' } };
    });
  });
  test('a reason that is not a rule id', () => {
    fails('CK-1', '/naming/exceptions/0/reason', (c) => {
      c.naming.exceptions[0].reason = 'the current name';
    });
  });
  test('a callback that wraps exceptions, which U-3 does not offer', () => {
    fails('CK-1', '/units/', (c) => {
      member(c, 'store.read').errors = 'propagate';
    });
  });
  test('a field that the schema does not know', () => {
    fails('CK-1', '', (c) => {
      c.extends = {};
    });
  });
  test('a result key that is not a snake_case name (GN-13e)', () => {
    fails('CK-1', '/cases/0/result', (c) => {
      c.cases[0].result = 'Words';
    });
  });
  test('a result key on the cases row of a value alias (GN-13e)', () => {
    fails('CK-1', '/cases/', (c) => {
      c.cases.push({ alias: 'forms.parse', file: 'contracts/forms.json', group: 'parse', result: 'value' });
    });
  });
  test('a parameter that is both required and defaulted', () => {
    fails('CK-1', '/units/', (c) => {
      member(c, 'forms.parse').parameters[0].default = { literal: 'x' };
    });
  });
});

describe('CK-2 todo', () => {
  test('a todo string', () => {
    fails('CK-2', `${at('session')}/members/1/wait`, (c) => {
      member(c, 'session.close').wait = 'todo';
    });
  });
  test('a todo object with what import found, which the schema alone would also refuse', () => {
    const result = findings((c) => {
      member(c, 'forms.parse').parameters[0] = { name: ['body'], type: 'bytes', required: { todo: 'confirm', found: true } };
    });
    assert.equal(result.length, 1, JSON.stringify(result));
    assert.equal(result[0]?.check, 'CK-2');
  });
});

describe('CK-3 references', () => {
  test('a unit id declared twice', () => fails('CK-3', '/units/', (c) => { c.units.push(structuredClone(unit(c, 'forms'))); }));
  test('an unknown unit in a type', () => fails('CK-3', '/units/', (c) => { member(c, 'forms.parse').returns = { unit: 'nothing' }; }));
  test('implements names a class', () => fails('CK-3', '/units/', (c) => { unit(c, 'memory_store').implements = [{ unit: 'session' }]; }));
  test('a cleanup member of another unit', () => fails('CK-3', '/units/', (c) => { unit(c, 'session').cleanup = 'forms.parse'; }));
  test('a case of an unknown member', () => fails('CK-3', '/cases/0/member', (c) => {
    c.cases.push({ ...c.cases[0] });
    c.cases[0].member = 'forms.nothing';
  }));
  test('a change to an unknown id', () => fails('CK-3', '/changes/0/to', (c) => { c.changes[0].to = 'nothing'; }));
  test('only names a language that is not a target', () =>
    fails('CK-3', '/units/', (c) => { c.targets = ['php', 'python', 'node', 'go']; member(c, 'session.load').only.targets = ['php', 'wasm']; for (const r of unit(c, 'value').out) delete r.make.wasm; unit(c, 'value').in = unit(c, 'value').in.filter((r: any) => r.wasm === undefined); for (const k of Object.keys(c.errors.classes)) delete c.errors.classes[k].wasm; c.errors.fixed = c.errors.fixed.filter((r: any) => r.lang !== 'wasm'); }));
  test('a target without its package', () => fails('CK-3', '/packages', (c) => { delete c.packages.go; }));
  test('a value type without its owner', () => fails('CK-3', '/units/', (c) => { member(c, 'forms.parse').returns = 'json_value'; }));
  test('a default constant that is not a constant', () =>
    fails('CK-3', '/units/', (c) => { unit(c, 'session_options').fields[1].default = { const: 'forms.parse' }; }));
});

describe('CK-4 naming exceptions', () => {
  test('an exception equal to the converted name', () =>
    fails('CK-4', '/naming/exceptions/0/name', (c) => { c.naming.exceptions[0].name = 'load'; }));
  test('an exception for a member of another unit', () =>
    fails('CK-4', '/naming/exceptions/0/member', (c) => { c.naming.exceptions[0].unit = 'forms'; }));
  test('two exceptions for one symbol', () =>
    fails('CK-4', '/naming/exceptions/1', (c) => { c.naming.exceptions.push({ ...c.naming.exceptions[0], name: 'load_path' }); }));
  test('an exception in a language that is not a target', () =>
    fails('CK-4', '/naming/exceptions/0/lang', (c) => {
      c.targets = ['php', 'node', 'go', 'wasm'];
      delete c.packages.python;
      for (const r of unit(c, 'value').out) delete r.make.python;
      unit(c, 'value').only.targets = ['node', 'wasm'];
      unit(c, 'value').in = unit(c, 'value').in.filter((r: any) => r.python === undefined);
      for (const k of Object.keys(c.errors.classes)) delete c.errors.classes[k].python;
      c.errors.fixed = c.errors.fixed.filter((r: any) => r.lang !== 'python');
      member(c, 'session.load').only.targets = ['php', 'node', 'go'];
    }));
  test('an exception for an unknown parameter', () =>
    fails('CK-4', '/naming/exceptions/0/parameter', (c) => { c.naming.exceptions[0].parameter = ['nothing']; }));
});

describe('CK-5 optional returns', () => {
  test('optional without a reason', () => fails('CK-5', '/units/', (c) => { delete member(c, 'store.read').optional_reason; }));
  test('a reason without optional', () => fails('CK-5', '/units/', (c) => { member(c, 'forms.parse').optional_reason = 'P-2'; }));
  test('an optional field without a reason', () => fails('CK-5', `${at('session_options')}/fields/2`, (c) => { delete unit(c, 'session_options').fields[2].reason; }));
  test('a field that is not optional with a reason', () =>
    fails('CK-5', `${at('session_options')}/fields/0/reason`, (c) => { unit(c, 'session_options').fields[0].reason = 'T-4'; }));
});

describe('CK-6 cycles', () => {
  test('a parent cycle', () =>
    fails('CK-6', '/units/', (c) => { const form = unit(c, 'form_error'); form.parent = 'too_large'; unit(c, 'too_large').final = false; }));
  test('an implements cycle', () =>
    fails('CK-6', '/units/', (c) => {
      c.units.push(
        { id: 'a', name: ['a'], module: 'session', kind: 'interface', visibility: 'public', origin: 'host', implements: [{ unit: 'b' }], members: [] },
        { id: 'b', name: ['b'], module: 'session', kind: 'interface', visibility: 'public', origin: 'host', implements: [{ unit: 'a' }], members: [] },
      );
    }));
});

describe('CK-8 value units', () => {
  const inRows = (c: any): any[] => unit(c, 'value').in;
  // GN-6x: the class that represents its value type names the functions through which another repository takes and
  // gives its values; its core type is named with them.
  const owned = (c: any): void => {
    unit(c, 'value').core = { in: 'forms::value_in', out: 'forms::value_out' };
    unit(c, 'value').core_type = 'forms::Value';
  };
  test('a value class that represents its value type names core: {in, out} with its core_type', () => {
    assert.deepEqual(findings(owned), []);
  });
  test('a value class with core: {in, out} and no core_type', () =>
    fails('CK-8', at('value'), (c) => { owned(c); delete unit(c, 'value').core_type; }));
  test('a by enum value without a case', () =>
    fails('CK-8', `${at('value')}/in/0/cases`, (c) => { inRows(c)[0].cases.pop(); }));
  test('a by enum value in two cases', () =>
    fails('CK-8', `${at('value')}/in/0/cases`, (c) => { inRows(c)[0].cases[1].is = 'list'; }));
  test('a case with by but without is', () =>
    fails('CK-8', `${at('value')}/in/0/cases/1`, (c) => { delete inRows(c)[0].cases[1].is; }));
  test('a row without by with two cases', () =>
    fails('CK-8', `${at('value')}/in/5/cases`, (c) => { inRows(c)[5].cases.push({ kind: 'bytes' }); }));
  test('by does not return an enum', () => fails('CK-8', `${at('value')}/in/0/by`, (c) => { inRows(c)[0].by = 'value.items'; }));
  test('a value unit type without read', () => fails('CK-8', `${at('value')}/in/0/cases/0`, (c) => { delete inRows(c)[0].cases[0].read; }));
  test('a built-in type with a read member', () => fails('CK-8', `${at('value')}/in/5/cases/0`, (c) => { inRows(c)[5].cases[0].read = 'value.text'; }));
  test('a built-in type without read: builtin', () => fails('CK-8', `${at('value')}/in/5/cases/0`, (c) => { delete inRows(c)[5].cases[0].read; }));
  test('a value unit type with read: builtin', () => fails('CK-8', `${at('value')}/in/0/cases/0`, (c) => { inRows(c)[0].cases[0].read = 'builtin'; }));
  test('read is not public', () => fails('CK-8', `${at('value')}/in/0/cases/0/read`, (c) => { member(c, 'value.items').visibility = 'internal'; }));
  test('an in row naming an unknown language type', () => fails('CK-8', `${at('value')}/in/5/php`, (c) => { inRows(c)[5].php = 'Stringable'; }));
  test('an out row that makes no value in one target', () =>
    fails('CK-8', `${at('value')}/out/0/make`, (c) => { delete unit(c, 'value').out[0].make.go; }));
  test('a built-in form that a language does not have', () =>
    fails('CK-8', `${at('value')}/out/3/make/php`, (c) => { unit(c, 'value').out[3].make.php = 'bigint'; }));
  test('make names a method, not a constructor', () =>
    fails('CK-8', `${at('value')}/out/1/make/node`, (c) => { unit(c, 'value').out[1].make.node = 'value.items'; }));
  // GN-6x: a text with an unpaired surrogate is the kind text16, which a member of a class makes from code units; the
  // string of PHP and Go cannot hold it, so no built-in form makes it.
  // GN-6x, P-3, B2.89: a value class makes a text by a text row and a text with an unpaired surrogate by a text16 row,
  // and reads a string by one case of the kind text whose read gives an optional text and whose units member gives the
  // UTF-16 code units of a text with an unpaired surrogate; that case is the case of both kinds.
  const owner = (change: (unit: any) => void = () => {}): Finding[] => {
    const parsed = JSON.parse(readFileSync(new URL('./fixtures/value-class/owner.json', import.meta.url), 'utf8'));
    change(parsed.units.find((u: any) => u.id === 'value'));
    // The fixture holds no case files (CK-22); the round trip is CK-8.
    return checkContract(parsed).filter((f) => f.check === 'CK-8' || f.check === 'CK-1');
  };
  const strings = (value: any): any[] => value.in.map((row: any) => row.cases.find((c: any) => c.is === 'string'));
  test('a text row and a text16 row that come back by the case of the kind text with units', () => {
    assert.deepEqual(owner(), []);
  });
  test('a text row whose string case is the kind text16, which reads every text as its code units', () => {
    const result = owner((value) => { for (const kase of strings(value)) { kase.kind = 'text16'; kase.read = 'value.string_units'; delete kase.units; } });
    assert.ok(result.some((f) => f.check === 'CK-8' && /has 0 cases of kind text\b/.test(f.message)), JSON.stringify(result, null, 2));
  });
  test('units on a case of another kind than text', () => {
    const result = owner((value) => { for (const row of value.in) Object.assign(row.cases.find((c: any) => c.is === 'number'), { units: 'value.string_units' }); });
    assert.ok(result.some((f) => f.check === 'CK-8' && /\/in\/0\/cases\/3\/units$/.test(f.path)), JSON.stringify(result, null, 2));
  });
  test('units whose read gives no optional text', () => {
    const result = owner((value) => { for (const kase of strings(value)) kase.read = 'value.string_value'; });
    assert.ok(result.some((f) => f.check === 'CK-8' && /\/in\/0\/cases\/2\/read$/.test(f.path)), JSON.stringify(result, null, 2));
  });
  test('units that gives no list of uint', () => {
    const result = owner((value) => { for (const kase of strings(value)) kase.units = 'value.string_value'; });
    assert.ok(result.some((f) => f.check === 'CK-8' && /\/in\/0\/cases\/2\/units$/.test(f.path)), JSON.stringify(result, null, 2));
  });
  test('a text16 row that comes back by the case of the kind text', () =>
    fails('CK-8', `${at('value')}/out/0/make`, (c) => {
      unit(c, 'value').out[0].kind = 'text16';
      unit(c, 'value').out[0].make = Object.fromEntries(Object.keys(unit(c, 'value').out[0].make).map((lang) => [lang, 'value.new']));
    }));
  test('a text16 row made by a built-in form', () =>
    fails('CK-8', `${at('value')}/out/0/make/php`, (c) => { unit(c, 'value').out[0].kind = 'text16'; }));
  test('a value that comes back as another kind', () =>
    fails('CK-8', `${at('value')}/out/0/make/php`, (c) => {
      // PHP makes text and bytes both as string, which the in table classifies as text.
      unit(c, 'value').out.push({ kind: 'bytes', make: { php: 'bytes', python: 'bytes', node: 'bytes', wasm: 'bytes', go: 'bytes' } });
      inRows(c).push({ python: 'bytes', cases: [{ kind: 'bytes', read: 'builtin' }] }, { node: 'Uint8Array', cases: [{ kind: 'bytes', read: 'builtin' }] }, { wasm: 'Uint8Array', cases: [{ kind: 'bytes', read: 'builtin' }] }, { go: '[]byte', cases: [{ kind: 'bytes', read: 'builtin' }] });
      const row = unit(c, 'value').out.pop();
      unit(c, 'value').out.unshift(row);
    }));
  test('a value that no in row classifies', () =>
    fails('CK-8', `${at('value')}/out/2/make/go`, (c) => { unit(c, 'value').in = inRows(c).filter((r: any) => r.go !== 'int64'); }));
  test('a predicate of another kind', () =>
    fails('CK-8', `${at('value')}/out/2/when`, (c) => {
      unit(c, 'value').out[2].when.predicate = 'utf8';
      unit(c, 'value').out[3].when.predicate = 'utf8';
    }));
  test('one row with when does not cover the other case', () =>
    fails('CK-8', `${at('value')}/out/2/when`, (c) => { unit(c, 'value').out.splice(3, 1); }));
  test('two rows of one kind that are not a true and false pair', () =>
    fails('CK-8', `${at('value')}/out/2`, (c) => { unit(c, 'value').out[3].when.is = true; }));
  test('a writable property outside a value unit', () =>
    fails('CK-8', '/units/', (c) => { member(c, 'too_large.limit').writable = true; }));
});

describe('CK-9 units of other repositories', () => {
  test('a generated class of another repository as a parameter', () =>
    fails('CK-9', '/units/', (c) => { member(c, 'forms.parse').parameters[0].type = { unit: 'dep_parser', library: 'forms-dep' }; }));
  test('a callback of another repository that uses a third repository', () =>
    fails('CK-9', '/units/', (c, d) => {
      member(c, 'forms.parse').parameters[0].type = { unit: 'dep_reader', library: 'forms-dep' };
      d.units[1].members[0].returns = { unit: 'other', library: 'third' };
    }));
  test('a callback of another repository is accepted, and its record too', () => {
    const result = findings((c) => { member(c, 'forms.parse').parameters[0].type = { unit: 'dep_reader', library: 'forms-dep' }; });
    assert.deepEqual(result, []);
  });
  test('the contract of the other repository is missing', () =>
    fails('CK-9', '/units/', (c) => { member(c, 'forms.parse').parameters[0].type = { unit: 'dep_reader', library: 'forms-dep' }; }, false));
  test('a value type whose owner has no such value unit', () =>
    fails('CK-9', '/types/json_value', (c) => { c.types.json_value = { library: 'forms-dep', unit: 'dep_parser' }; }));
});

describe('CK-10 errors', () => {
  test('an error unit without a category', () => fails('CK-10', `${at('form_error')}`, (c) => { delete unit(c, 'form_error').category; }));
  test('a category on a class', () => fails('CK-10', '/units/', (c) => { unit(c, 'session').category = 'value'; }));
  test('a parent on a class', () => fails('CK-10', '/units/', (c) => { unit(c, 'memory_store').parent = 'form_error'; }));
  test('a parent of another category', () => fails('CK-10', `${at('too_large')}/parent`, (c) => { unit(c, 'form_error').category = 'store'; }));
  test('a final parent', () => fails('CK-10', `${at('too_large')}/parent`, (c) => { unit(c, 'form_error').final = true; }));
  test('a category class with the name of the language class', () =>
    fails('CK-10', '/errors/classes/value/python', (c) => { c.errors.classes.value.python = 'ValueError'; }));
  test('a category class with another name in one language', () =>
    fails('CK-10', '/errors/classes/value', (c) => { c.errors.classes.value.node = 'OtherValueError'; }));
  test('a PHP category class outside the package namespace', () =>
    fails('CK-10', '/errors/classes/value/php', (c) => { c.errors.classes.value.php = 'Other\\SampleValueError'; }));
  test('a category without a class in one language', () =>
    fails('CK-10', '/errors/classes/busy', (c) => { delete c.errors.classes.busy.node; }));
  test('a kind overridden by an error unit of another category', () =>
    fails('CK-10', '/errors/kinds/1/class', (c) => { c.errors.kinds[1].class = 'too_large'; }));
  test('a binding kind overridden by an error unit of another category', () =>
    fails('CK-10', '/errors/binding/0/class', (c) => { c.errors.binding[0] = { kind: 'busy', class: 'form_error' }; }));
  test('an override that is not an error unit', () =>
    fails('CK-10', '/errors/binding/0/class', (c) => { c.errors.binding[0].class = 'session'; }));
  test('a runtime argument error class for Go', () =>
    fails('CK-10', '/errors/fixed/5', (c) => { c.errors.fixed.push({ lang: 'go', class: 'error' }); }));
  test('a kind of a dependency that it does not declare', () =>
    fails('CK-10', '/errors/kinds/2/variant', (c) => {
      c.errors.kinds.push({ variant: 'sample::Error::Dep/forms_dep::Error::Nothing', library: 'forms-dep' });
      c.errors.wrapped.push({ library: 'forms-dep', unit: 'dep_error', property: ['field'], drop: { reason: 'P-4' } });
    }));
  test('a kind of a dependency without the variant of the core error that holds it (GN-7c)', () =>
    fails('CK-10', '/errors/kinds/2/variant', (c) => {
      c.errors.kinds.push({ variant: 'forms_dep::Error::Limit', library: 'forms-dep' });
      c.errors.wrapped.push({ library: 'forms-dep', unit: 'dep_error', property: ['field'], drop: { reason: 'P-4' } });
    }));
  test('a kind of its own with the path of a dependency (GN-7c)', () =>
    fails('CK-10', '/errors/kinds/2/variant', (c) => {
      c.errors.kinds.push({ variant: 'sample::Error::Dep/forms_dep::Error::Limit', category: 'value' });
    }));
});

describe('CK-11 wrapped dependency errors', () => {
  const wrap = (c: any): void => {
    c.errors.kinds.push({ variant: 'sample::Error::Dep/forms_dep::Error::Limit', library: 'forms-dep' });
  };
  test('a dropped property with a rule is accepted', () => {
    const result = findings((c) => {
      wrap(c);
      c.errors.wrapped.push({ library: 'forms-dep', unit: 'dep_error', property: ['field'], drop: { reason: 'P-4' } });
    });
    assert.deepEqual(result, []);
  });
  test('a property that is neither forwarded nor dropped', () => fails('CK-11', '/errors/wrapped', wrap));
  test('a forward to an error unit without that property', () =>
    fails('CK-11', '/errors/wrapped/0/forward', (c) => {
      wrap(c);
      c.errors.wrapped.push({ library: 'forms-dep', unit: 'dep_error', property: ['field'], forward: 'form_error' });
    }));
  test('a forward to the property with another type', () =>
    fails('CK-11', '/errors/wrapped/0/forward', (c) => {
      wrap(c);
      unit(c, 'form_error').members.push({ id: 'form_error.field', name: ['field'], kind: 'property', visibility: 'public', returns: 'bytes' });
      c.errors.wrapped.push({ library: 'forms-dep', unit: 'dep_error', property: ['field'], forward: 'form_error' });
    }));
  test('a row for a property that does not exist', () =>
    fails('CK-11', '/errors/wrapped/1', (c) => {
      wrap(c);
      c.errors.wrapped.push(
        { library: 'forms-dep', unit: 'dep_error', property: ['field'], drop: { reason: 'P-4' } },
        { library: 'forms-dep', unit: 'dep_error', property: ['line'], drop: { reason: 'P-4' } },
      );
    }));
});

describe('CK-12 record parameters', () => {
  test('a record that is not the last parameter', () =>
    fails('CK-12', `${at('session')}/members/0/parameters/0`, (c) => { member(c, 'session.new').parameters.reverse(); }));
  test('two records', () =>
    fails('CK-12', `${at('session')}/members/0/parameters`, (c) => {
      member(c, 'session.new').parameters.push({ name: ['more'], type: { unit: 'session_options' }, required: true });
    }));
  test('a field with the name of another parameter in PHP and Python', () => {
    const result = findings((c) => {
      member(c, 'session.new').parameters.unshift({ name: [{ acronym: 'csrf' }, 'token'], type: 'bool', required: true });
    });
    assert.deepEqual(result.map((f) => f.check), ['CK-12', 'CK-12'], JSON.stringify(result));
    assert.ok(result[0]?.message.startsWith('in php the field csrfToken'), result[0]?.message);
    assert.ok(result[1]?.message.startsWith('in python the field csrf_token'), result[1]?.message);
  });
});

describe('CK-13 Go names', () => {
  test('an error unit with the name of a category error type', () =>
    fails('CK-13', `${at('store_error')}/name`, (c) => { unit(c, 'store_error').name = ['store', 'error']; }));
  test('two exported names in one Go package', () =>
    fails('CK-13', '/units/', (c) => {
      member(c, 'forms.parse').name = ['new', 'session'];
      unit(c, 'forms').module = 'session';
    }));
  test('a function with the name of the function that makes an instance of a handle (GN-15a)', () =>
    fails('CK-13', '/units/', (c) => {
      member(c, 'forms.parse').name = ['session', 'from', 'handle'];
      unit(c, 'forms').module = 'session';
    }));
  test('a Go naming exception that makes a name collide', () =>
    fails('CK-13', '/units/', (c) => {
      c.naming.exceptions.push({ lang: 'go', unit: 'memory_store', name: 'Session', reason: 'S1' });
    }));
});

describe('CK-14 modules', () => {
  test('a module under host', () => fails('CK-14', `${at('forms')}/module`, (c) => { unit(c, 'forms').module = 'host/forms'; }));
  test('a module under tests', () => fails('CK-14', `${at('forms')}/module`, (c) => { unit(c, 'forms').module = 'tests'; }));
  test('a module under internal', () => fails('CK-14', `${at('forms')}/module`, (c) => { unit(c, 'forms').module = 'internal/forms'; }));
});

describe('CK-15 members that WASM cannot run', () => {
  test('a blocking member without only', () => fails('CK-15', `${at('session')}/members/2`, (c) => { delete member(c, 'session.load').only; member(c, 'session.load').parameters[0].type = 'text'; }));
  test('a path parameter without only', () => fails('CK-15', `${at('session')}/members/2`, (c) => { const m = member(c, 'session.load'); delete m.only; m.wait = 'none'; }));
  test('a path inside a record', () =>
    fails('CK-15', `${at('session')}/members/0`, (c) => { unit(c, 'session_options').fields.push({ name: ['dir'], type: 'path', required: true }); }));
  test('only that keeps wasm', () => fails('CK-15', `${at('session')}/members/2`, (c) => { member(c, 'session.load').only.targets.push('wasm'); }));
});

describe('CK-16 Python awaitable names', () => {
  test('an awaitable name taken by another member', () =>
    fails('CK-16', `${at('memory_store')}/members/0`, (c) => {
      unit(c, 'memory_store').members.push({ id: 'memory_store.aread', name: ['aread'], kind: 'method', visibility: 'public', wait: 'none' });
      c.cases.push({ member: 'memory_store.aread', file: 'contracts/cases.json', group: 'memory_store.aread' });
    }));
  test('an awaitable callback name taken by another member', () =>
    fails('CK-16', `${at('store')}/members/0`, (c) => {
      unit(c, 'store').members.push({ id: 'store.aread', name: ['aread'], kind: 'method', visibility: 'public', async_allowed: false, core: { path: 'sample::Store::aread', receiver: '&mut self' } });
    }));
});

describe('CK-17 callbacks', () => {
  test('a callback member without its trait receiver', () =>
    fails('CK-17', `${at('store')}/members/0`, (c) => { delete member(c, 'store.read').core; }));
  test('a callback member with the receiver self', () =>
    fails('CK-17', `${at('store')}/members/0`, (c) => { member(c, 'store.read').core.receiver = 'self'; }));
  test('async_allowed outside a callback', () => fails('CK-17', '/units/', (c) => { member(c, 'forms.parse').async_allowed = true; }));
  test('errors outside a callback', () =>
    fails('CK-17', '/units/', (c) => { member(c, 'forms.parse').errors = { recognize: [{ unit: 'too_large' }], reason: 'HY-24' }; }));
  test('a callback member that does not state async_allowed', () =>
    fails('CK-17', `${at('store')}/members/0`, (c) => { delete member(c, 'store.read').async_allowed; }));
  test('recognize names a class', () =>
    fails('CK-17', `${at('store')}/members/0/errors/recognize/0`, (c) => { member(c, 'store.read').errors.recognize[0].unit = 'session'; }));
  test('a callback member that recognizes an error unit of its own, in a contract without errors.recognized (GN-6d)', () =>
    fails('CK-17', `${at('store')}/members/0/errors/recognize/0`, (c) => { delete c.errors.recognized; }));
  test('a generated implementation that waits, behind a callback member that is not async_allowed', () =>
    fails('CK-17', `${at('store')}/members/0`, (c) => { member(c, 'store.read').async_allowed = false; }));
});

describe('CK-8 nested values', () => {
  const nested = (c: any, kind: string, value: string): void => {
    c.types.json_value = { library: 'forms-dep', unit: 'dep_value' };
    unit(c, 'value').out.push({ kind, make: { php: { value }, python: { value }, node: { value }, go: { value }, wasm: { value } } });
  };
  const withDepValue = (d: any): void => {
    d.units.push({
      id: 'dep_value', name: ['value'], module: 'value', kind: 'class', visibility: 'public', origin: 'value', members: [],
      out: [{ kind: 'null', make: { php: 'null', python: 'null', node: 'null' } }],
      in: [{ php: 'null', cases: [{ kind: 'null' }] }, { python: 'None', cases: [{ kind: 'null' }] }, { node: 'null', cases: [{ kind: 'null' }] }],
    });
  };
  test('a nested make with its kind is accepted', () => {
    assert.deepEqual(findings((c, d) => { withDepValue(d); nested(c, 'nested:json_value', 'json_value'); }), []);
  });
  test('a nested make under another kind', () =>
    fails('CK-8', `${at('value')}/out/4/make/php`, (c, d) => { withDepValue(d); nested(c, 'nested:php_value', 'json_value'); }));
  test('a nested kind made by a built-in form', () =>
    fails('CK-8', `${at('value')}/out/0/make/php`, (c) => { unit(c, 'value').out[0].kind = 'nested:json_value'; }));
});

describe('CK-8 else rows and keyed maps', () => {
  const textRows = (c: any): any[] => unit(c, 'value').out.filter((r: any) => r.kind === 'text');
  test('predicate rows with one else row are accepted', () => {
    assert.deepEqual(findings((c) => {
      unit(c, 'value').out[2].when = 'else';
    }), []);
  });
  test('two else rows', () =>
    fails('CK-8', `${at('value')}/out/2`, (c) => { unit(c, 'value').out[2].when = 'else'; unit(c, 'value').out[3].when = 'else'; }));
  test('a row without when beside an else row', () =>
    fails('CK-8', `${at('value')}/out/0`, (c) => { const row = structuredClone(textRows(c)[0]); row.when = 'else'; unit(c, 'value').out.push(row); }));
  test('a keyed map is made where the language has one', () =>
    fails('CK-8', `${at('value')}/out/4/make/go`, (c) => {
      const keyed = { keyed_map: { key: ['int', 'text'] } };
      unit(c, 'value').out.push({ kind: 'map', make: { php: keyed, python: keyed, node: keyed, wasm: keyed, go: keyed } });
      for (const [lang, type] of [['php', 'array'], ['python', 'dict'], ['node', 'Map'], ['wasm', 'Map']]) {
        unit(c, 'value').in.push({ [lang as string]: type, cases: [{ kind: 'map', read: 'builtin' }] });
      }
    }));
});

describe('CK-8 native values (VAL-18)', () => {
  const native = (c: any): void => {
    const make = { php: 'native', python: 'native', node: 'native', wasm: 'native', go: 'native' };
    unit(c, 'value').out.push({ kind: 'native', make });
    for (const [lang, type] of [['php', 'object'], ['python', 'object'], ['node', 'object'], ['wasm', 'object'], ['go', 'any']]) {
      unit(c, 'value').in.push({ [lang as string]: type, cases: [{ kind: 'native' }] });
    }
  };
  test('a native row made by the form native round trips', () => {
    assert.deepEqual(findings(native), []);
  });
  test('a native case with a read', () =>
    fails('CK-8', `${at('value')}/in/17/cases/0/read`, (c) => { native(c); unit(c, 'value').in[17].cases[0].read = 'builtin'; }));
  test('the kind native made by another form', () =>
    fails('CK-8', `${at('value')}/out/4/make/php`, (c) => { native(c); unit(c, 'value').out[4].make.php = 'text'; }));
  test('the form native making another kind', () =>
    fails('CK-8', `${at('value')}/out/0/make/php`, (c) => { native(c); unit(c, 'value').out[0].make.php = 'native'; }));
});

describe('CK-8 representative units and predicate round trips', () => {
  test('a value alias without its core functions (U-7)', () =>
    fails('CK-8', '/units/', (c) => {
      const value = unit(c, 'value');
      c.units.push({ id: 'values', name: ['values'], module: 'value', kind: 'alias', visibility: 'public', origin: 'value', out: value.out, in: value.in });
      delete value.out;
      delete value.in;
      value.origin = 'value';
    }));
  test('a value class with core functions and no core_type (U-7, GN-6x)', () =>
    fails('CK-8', at('value'), (c) => { unit(c, 'value').core = { in: 'sample::a', out: 'sample::b' }; }));
  const gather = (c: any): void => {
    const value = unit(c, 'value');
    c.units.push({ id: 'values', name: ['values'], module: 'value', kind: 'alias', visibility: 'public', origin: 'value', core: { in: 'sample::value_from_host', out: 'sample::value_to_out' }, out: value.out, in: value.in });
    for (const row of value.in) if (Object.values(row).includes('value')) for (const lang of ['php', 'python', 'node', 'go', 'wasm']) if (row[lang] === 'value') row[lang] = 'value';
    delete value.out;
    delete value.in;
  };
  test('an alias that gathers the class holds the tables', () => {
    assert.deepEqual(findings(gather), []);
  });
  test('a gathered class that holds tables too', () =>
    fails('CK-8', at('value'), (c) => { gather(c); unit(c, 'value').out = structuredClone(unit(c, 'values').out); }));
  test('a value class that represents its type without tables', () =>
    fails('CK-8', at('value'), (c) => { delete unit(c, 'value').out; }));
  test('an alias whose origin is not value', () =>
    fails('CK-8', '/units/', (c) => { gather(c); unit(c, 'values').origin = 'generated'; delete unit(c, 'values').out; delete unit(c, 'values').in; delete unit(c, 'values').core; }));
  const numberCases = [{ when: { predicate: 'integral_float', is: true }, kind: 'int', read: 'builtin' }, { when: 'else', kind: 'float', read: 'builtin' }];
  const splitNumbers = (c: any): void => {
    for (const row of unit(c, 'value').in) for (const lang of ['node', 'wasm']) if (row[lang] === 'number') row.cases = structuredClone(numberCases);
  };
  test('in cases split by a predicate that the made value tells', () => {
    assert.deepEqual(findings(splitNumbers), []);
  });
  test('a float row whose value does not tell the predicate the in row asks', () =>
    fails('CK-8', `${at('value')}/out/4/make/node`, (c) => {
      splitNumbers(c);
      unit(c, 'value').out.push({ kind: 'float', make: { php: 'float', python: 'float', node: 'float', wasm: 'float', go: 'float' } });
      for (const [lang, type] of [['php', 'float'], ['python', 'float'], ['go', 'float64']] as [string, string][]) unit(c, 'value').in.push({ [lang]: type, cases: [{ kind: 'float', read: 'builtin' }] });
    }));
  test('an integral float comes back as int', () =>
    fails('CK-8', `${at('value')}/out/4/make/node`, (c) => {
      splitNumbers(c);
      unit(c, 'value').out.push({ kind: 'float', when: { predicate: 'integral_float', is: true }, make: { php: 'float', python: 'float', node: 'float', wasm: 'float', go: 'float' } });
      unit(c, 'value').out.push({ kind: 'float', when: 'else', make: { php: 'float', python: 'float', node: 'float', wasm: 'float', go: 'float' } });
      for (const [lang, type] of [['php', 'float'], ['python', 'float'], ['go', 'float64']] as [string, string][]) unit(c, 'value').in.push({ [lang]: type, cases: [{ kind: 'float', read: 'builtin' }] });
    }));
  test('a by row with two cases of the made kind', () =>
    fails('CK-8', `${at('value')}/out/1/make/php`, (c) => {
      unit(c, 'value_type').variants.push({ name: ['other'], value: 'other' });
      unit(c, 'value').in[0].cases.push({ is: 'other', kind: 'list', read: 'value.items' });
    }));
  test('when on the cases of a value class', () =>
    fails('CK-8', `${at('value')}/in/0/cases/0/when`, (c) => { unit(c, 'value').in[0].cases[0].when = 'else'; }));
});

describe('CK-18 package names', () => {
  test('a Python root module outside the polyspec namespace package', () =>
    fails('CK-18', '/packages/python/module', (c) => { c.packages.python.module = 'polyspec_sample'; }));
  test('a Composer package with a suffix', () =>
    fails('CK-18', '/packages/php/package', (c) => { c.packages.php.package = 'polyspec/sample-php-ext'; }));
  test('an npm package of another name', () =>
    fails('CK-18', '/packages/node/package', (c) => { c.packages.node.package = '@polyspec/other'; }));
  test('a core crate of another name', () => fails('CK-18', '/core/crate', (c) => { c.core.crate = 'sample-core'; }));
  // L-1: the component validator of the repository sample.
  const component = (c: any): void => {
    c.library = 'sample-validator';
    c.core = { crate: 'polyspec-sample-validator', path: 'packages/validator/rust' };
    c.packages.php = { package: 'polyspec/sample-validator', namespace: 'Polyspec\\Sample\\Validator' };
    c.packages.python = { package: 'polyspec-sample-validator', module: 'polyspec.sample.validator' };
    c.packages.node = { ...c.packages.node, package: '@polyspec/sample-validator' };
    for (const row of Object.values(c.errors.classes) as Record<string, string>[]) {
      row['php'] = (row['php'] ?? '').replace('Polyspec\\Sample\\', 'Polyspec\\Sample\\Validator\\');
    }
  };
  test('the names of a component are below the repository (P-1, L-1)', () => {
    assert.deepEqual(findings(component).filter((f) => f.check === 'CK-18' || f.check === 'CK-10'), []);
  });
  test('a component module at the root of the repository', () =>
    fails('CK-18', '/packages/python/module', (c) => { component(c); c.packages.python.module = 'polyspec.sample_validator'; }));
  test('a component namespace at the root of the repository', () =>
    fails('CK-18', '/packages/php/namespace', (c) => {
      component(c);
      c.packages.php.namespace = 'Polyspec\\SampleValidator';
      for (const row of Object.values(c.errors.classes) as Record<string, string>[]) {
        row['php'] = (row['php'] ?? '').replace('Polyspec\\Sample\\Validator\\', 'Polyspec\\SampleValidator\\');
      }
    }));
});

describe('CK-3 fault injection points and alias cases (G-5, U-7)', () => {
  const point = (id: string, fills: string[]): object => ({ id, core: 'sample::fault::COPY', inject: ['io'], fills, reason: 'F-1', place: 'sample::copy' });
  test('fault injection points of kinds of the core error are accepted', () => {
    assert.deepEqual(findings((c) => { c.faults = [point('copy', ['store']), point('rename', ['too_large'])]; }), []);
  });
  test('a point declared twice', () =>
    fails('CK-3', '/faults/1/id', (c) => { c.faults = [point('copy', ['store']), point('copy', ['store'])]; }));
  test('a point that fills a kind that the core error does not have', () =>
    fails('CK-3', '/faults/0/fills/0', (c) => { c.faults = [point('copy', ['missing'])]; }));
  test('a point that takes an injection that binding does not have', () =>
    fails('CK-1', '/faults/0/inject/0', (c) => { c.faults = [{ ...point('copy', ['store']), inject: ['slow'] }]; }));
  test('a cases row of an alias that is no value alias', () =>
    fails('CK-3', '/cases/0/alias', (c) => { c.cases.unshift({ alias: 'value', file: 'contracts/cases.json', group: 'value_in' }); }));
  test('a cases row of a member and an alias', () =>
    fails('CK-1', '/cases/0', (c) => { c.cases[0].alias = 'value'; }));
});

describe('CK-8 the kinds of an alias (U-7, E-5)', () => {
  const alias = (c: any, raises: string[]): void => {
    const value = unit(c, 'value');
    c.units.push({ id: 'values', name: ['values'], module: 'value', kind: 'alias', visibility: 'public', origin: 'value', core: { in: 'sample::value_from_host', out: 'sample::value_to_out' }, in_raises: raises, out: value.out, in: value.in });
    delete value.out;
    delete value.in;
  };
  test('in_raises of variants of the core error is accepted', () => {
    assert.deepEqual(findings((c) => alias(c, ['sample::Error::TooLarge'])), []);
  });
  test('in_raises of a variant that errors.kinds does not have', () =>
    fails('CK-8', '/units/', (c) => alias(c, ['sample::Error::Missing'])));
  test('in_raises of a unit that is no value alias', () =>
    fails('CK-8', `${at('value')}/in_raises`, (c) => { unit(c, 'value').in_raises = ['sample::Error::TooLarge']; }));
});

describe('CK-77 a generated interface', () => {
  // The fixture with the generated interface holder, which the class session implements.
  const held = (c: any): any => {
    c.units.push({ id: 'holder', name: ['holder'], module: 'session', kind: 'interface', visibility: 'public', origin: 'generated', core_type: 'sample::Holder', members: [] });
    unit(c, 'session').implements = [{ unit: 'holder' }];
    return unit(c, 'holder');
  };
  test('a generated interface that a generated class implements is accepted', () => {
    assert.deepEqual(findings((c) => { held(c); }), []);
  });
  test('a generated interface without core_type', () => {
    const found = findings((c) => { delete held(c).core_type; });
    assert.deepEqual(found.map((f) => [f.check, f.message]), [['CK-77', 'the generated interface holder names in core_type the type that the core takes (GN-6ap)']]);
  });
  test('a generated interface that no class implements', () => {
    const found = findings((c) => { held(c); delete unit(c, 'session').implements; });
    assert.deepEqual(found.map((f) => [f.check, f.message]), [['CK-77', 'no class of this contract implements the generated interface holder (GN-6ap)']]);
  });
  test('a return that names a generated interface', () =>
    fails('CK-77', `${at('forms')}/members/0/returns`, (c) => { held(c); member(c, 'forms.parse').returns = { unit: 'holder' }; }));
  test('a parameter that names a generated interface inside a list', () => {
    const found = findings((c) => {
      held(c);
      member(c, 'forms.parse').parameters.push({ name: ['holders'], type: { list: { unit: 'holder' } }, default: { empty: 'list' } });
    });
    assert.ok(found.some((f) => f.check === 'CK-77' && /forms\.parse\.holders names the generated interface holder inside another type/.test(f.message)), JSON.stringify(found));
  });
  test('a field that names a generated interface', () => {
    const found = findings((c) => { held(c); unit(c, 'session_options').fields.push({ name: ['holder'], type: { optional: { unit: 'holder' } }, default: { literal: null }, reason: 'U-1' }); });
    assert.ok(found.some((f) => f.check === 'CK-77' && /a field of session_options names the generated interface holder/.test(f.message)), JSON.stringify(found));
  });
});

describe('CK-67 the borrow of a class parameter', () => {
  test('a borrow of a parameter whose type is no class', () =>
    fails('CK-67', `${at('forms')}/members/0/parameters/0/core`, (c) => { member(c, 'forms.parse').parameters[0].core = '&mut'; }));
  test('a class parameter that names no borrow', () =>
    fails('CK-67', `${at('forms')}/members/0/parameters/1/core`, (c) => {
      member(c, 'forms.parse').parameters.splice(1, 0, { name: ['other'], type: { unit: 'session' }, required: true });
    }));
  test('an optional class parameter that names no borrow', () =>
    fails('CK-67', `${at('forms')}/members/0/parameters/1/core`, (c) => {
      member(c, 'forms.parse').parameters.splice(1, 0, { name: ['other'], type: { optional: { unit: 'session' } }, required: true });
    }));
  test('a class parameter that names its borrow is accepted', () => {
    assert.deepEqual(findings((c) => { member(c, 'forms.parse').parameters.splice(1, 0, { name: ['other'], type: { unit: 'session' }, required: true, core: '&mut' }); }), []);
  });
  test('a borrow of a list of a class', () =>
    fails('CK-67', `${at('forms')}/members/0/parameters/0/core`, (c) => {
      const p = member(c, 'forms.parse').parameters[0];
      p.type = { list: { unit: 'session' } };
      p.core = 'value';
    }));
});

describe('CK-68 the state machine of a member that reaches language code', () => {
  test('a member with async_driver that reaches language code without machine', () =>
    fails('CK-68', `${at('session')}/members/2/core`, (c) => { member(c, 'session.load').wait = 'async_driver'; }));
  test('machine on a member that does not reach language code', () =>
    fails('CK-68', `${at('forms')}/members/0/core/machine`, (c) => { member(c, 'forms.parse').core.machine = true; }));
  test('machine on a member that does not wait with async_driver', () =>
    fails('CK-68', `${at('session')}/members/2/core/machine`, (c) => { member(c, 'session.load').core.machine = true; }));
  test('a member with async_driver that reaches language code and names machine is accepted', () => {
    assert.deepEqual(findings((c) => { const m = member(c, 'session.load'); m.wait = 'async_driver'; m.core.machine = true; m.core.receiver = '&self'; }), []);
  });
});

describe('CK-69 the receiver of a method with a state machine', () => {
  const machine = (c: any, receiver: string): void => {
    const m = member(c, 'session.load');
    m.wait = 'async_driver';
    m.core.machine = true;
    m.core.receiver = receiver;
  };
  test('a method with machine that names &mut self', () =>
    fails('CK-69', `${at('session')}/members/2/core/receiver`, (c) => { machine(c, '&mut self'); }));
  test('a method with machine that names self', () =>
    fails('CK-69', `${at('session')}/members/2/core/receiver`, (c) => { machine(c, 'self'); }));
  test('a method with machine that names &self is accepted', () => {
    assert.deepEqual(findings((c) => { machine(c, '&self'); }), []);
  });
});

describe('CK-73 members that do not wait', () => {
  const only = { targets: ['php', 'python', 'node', 'go'], reason: 'Q-4' };
  // The one finding of the change: its check, its path and its message.
  const one = (change: (c: any) => void): Finding => {
    const result = findings(change);
    assert.equal(result.length, 1, JSON.stringify(result, null, 2));
    return result[0] as Finding;
  };
  const added = (kind: string, more: object): any => ({
    id: `session.${kind}`, name: kind.split('_'), kind, visibility: 'public', wait: 'async_driver',
    core: { path: `sample::Session::${kind}`, receiver: '&self' }, ...more,
  });
  const add = (c: any, kind: string, more: object): any => {
    const m = added(kind, more);
    unit(c, 'session').members.push(m);
    c.cases.push({ member: m.id, file: 'contracts/cases.json', group: m.id });
    return m;
  };
  test('a constructor that waits with blocking_io', () => {
    assert.deepEqual(one((c) => { const m = member(c, 'session.new'); m.wait = 'blocking_io'; m.only = only; }), {
      check: 'CK-73',
      path: `${at('session')}/members/0/wait`,
      message: 'session.new: a constructor does not wait (wait blocking_io); make the instance by a static member, which can wait (GN-6m)',
    });
  });
  test('a constructor that waits with process_wait', () => {
    assert.deepEqual(one((c) => { const m = member(c, 'session.new'); m.wait = 'process_wait'; m.only = only; }), {
      check: 'CK-73',
      path: `${at('session')}/members/0/wait`,
      message: 'session.new: a constructor does not wait (wait process_wait); make the instance by a static member, which can wait (GN-6m)',
    });
  });
  test('a constructor that waits with async_driver', () => {
    assert.deepEqual(one((c) => { member(c, 'value.new').wait = 'async_driver'; }), {
      check: 'CK-73',
      path: `${at('value')}/members/0/wait`,
      message: 'value.new: a constructor does not wait (wait async_driver); make the instance by a static member, which can wait (GN-6n)',
    });
  });
  test('a property that waits', () => {
    assert.deepEqual(one((c) => { member(c, 'value.text').wait = 'async_driver'; }), {
      check: 'CK-73',
      path: `${at('value')}/members/3/wait`,
      message: 'value.text: a property does not wait (wait async_driver); give the value by a method, which can wait (GN-6n)',
    });
  });
  test('a property of an error unit that waits', () => {
    assert.deepEqual(one((c) => { member(c, 'too_large.limit').wait = 'async_driver'; }), {
      check: 'CK-73',
      path: `${at('too_large')}/members/0/wait`,
      message: 'too_large.limit: a property does not wait (wait async_driver); give the value by a method, which can wait (GN-6n)',
    });
  });
  test('an iterate that waits', () => {
    assert.deepEqual(one((c) => { add(c, 'iterate', { yields: { key: 'text', value: 'text' } }); }), {
      check: 'CK-73',
      path: `${at('session')}/members/4/wait`,
      message: 'session.iterate: an iterate does not wait (wait async_driver); give the items by a method, which can wait (GN-6n)',
    });
  });
  for (const [kind, returns] of [['stringify', 'text'], ['to_json', 'text'], ['primitive', 'int']] as const) {
    test(`a ${kind} that waits`, () => {
      assert.deepEqual(one((c) => { add(c, kind, { parameters: [], returns }); }), {
        check: 'CK-73',
        path: `${at('session')}/members/4/wait`,
        message: `session.${kind}: a ${kind} does not wait (wait async_driver); the language calls this hook in its own protocol, so give the value by a method, which can wait (N-4, GN-6n)`,
      });
    });
  }
  test('the same members without a wait, and a static member and a method that wait, are accepted', () => {
    assert.deepEqual(findings((c) => {
      add(c, 'iterate', { yields: { key: 'text', value: 'text' } }).wait = 'none';
      delete add(c, 'stringify', { parameters: [], returns: 'text' }).wait;
      const made = add(c, 'static', { returns: 'self', only });
      made.wait = 'blocking_io';
      delete made.core.receiver;
    }), []);
  });
  test('a constructor of a host unit that waits', () => {
    // L-2a: the code of a host unit is written by hand, and no language has an awaited constructor there either.
    assert.deepEqual(findings((c) => {
      c.units.push({
        id: 'helper', name: ['helper'], module: 'session', kind: 'class', visibility: 'public', origin: 'host',
        members: [{ id: 'helper.new', name: ['new'], kind: 'constructor', visibility: 'public', parameters: [], wait: 'async_driver' }],
      });
    }), [{
      check: 'CK-73',
      path: `/units/${contract().units.length}/members/0/wait`,
      message: 'helper.new: a constructor does not wait (wait async_driver); make the instance by a static member, which can wait (GN-6n)',
    }]);
  });
  test('a method of a host unit that waits is accepted', () => {
    assert.deepEqual(findings((c) => {
      c.units.push({
        id: 'helper', name: ['helper'], module: 'session', kind: 'class', visibility: 'public', origin: 'host',
        members: [{ id: 'helper.load', name: ['load'], kind: 'method', visibility: 'public', parameters: [], wait: 'async_driver' }],
      });
    }), []);
  });
});

describe('CK-74 constructible classes', () => {
  const closed = (c: any): void => {
    const session = unit(c, 'session');
    const made = session.members[0];
    made.kind = 'static';
    made.returns = 'self';
  };
  test('a class without a constructor that does not declare constructible: false', () => {
    const result = findings(closed);
    assert.deepEqual(result, [{
      check: 'CK-74',
      path: at('session'),
      message: 'session: a class without a constructor declares constructible: false, or one constructor (U-1)',
    }]);
  });
  test('a class with constructible: false and a constructor', () => {
    const result = findings((c) => { unit(c, 'session').constructible = false; });
    assert.deepEqual(result, [{
      check: 'CK-74',
      path: `${at('session')}/constructible`,
      message: 'session: a class with constructible: false has no constructor, so the constructor session.new is a static member, or the class is constructible (U-1)',
    }]);
  });
  test('a class without a constructor that declares constructible: false is accepted', () => {
    assert.deepEqual(findings((c) => { closed(c); unit(c, 'session').constructible = false; }), []);
  });
  test('an abstract class and a class without core_type are not judged', () => {
    assert.deepEqual(findings((c) => { closed(c); unit(c, 'session').abstract = true; }).filter((f) => f.check === 'CK-74'), []);
    assert.deepEqual(findings((c) => { closed(c); delete unit(c, 'session').core_type; }).filter((f) => f.check === 'CK-74'), []);
  });
});

describe('CK-78 a class without core_type on a target that does not generate it (GN-6af)', () => {
  const judged = (change: (c: any) => void): Finding[] => findings((c) => { delete unit(c, 'session').core_type; change(c); }).filter((f) => f.check === 'CK-78');
  test('a class without core_type that names php', () => {
    assert.deepEqual(judged(() => undefined), [{
      check: 'CK-78',
      path: at('session'),
      message: 'session: a class without core_type is not generated for php, so the unit names only without php and a reason (GN-6af, Q-4)',
    }]);
  });
  test('a class without core_type whose only names php', () => {
    assert.deepEqual(judged((c) => { unit(c, 'session').only = { targets: ['python', 'php'], reason: 'Q-4' }; }), [{
      check: 'CK-78',
      path: `${at('session')}/only`,
      message: 'session: a class without core_type is not generated for php, so the unit names only without php and a reason (GN-6af, Q-4)',
    }]);
  });
  test('a class without core_type whose only names python, node, wasm and go is accepted', () => {
    assert.deepEqual(judged((c) => { unit(c, 'session').only = { targets: ['python', 'node', 'wasm', 'go'], reason: 'Q-4' }; }), []);
  });
  test('a class with core_type and a host class are not judged', () => {
    assert.deepEqual(findings(() => undefined).filter((f) => f.check === 'CK-78'), []);
    assert.deepEqual(judged((c) => { unit(c, 'session').origin = 'host'; }), []);
  });
});

describe('CK-79, CK-80, CK-81 the names of the C ABI of Go (GN-17)', () => {
  // A function of the root module: a functions unit of the root with the first function of the unit forms under
  // another name.
  const added = (c: any, name: string[]): { path: string; id: string } => {
    const first = c.units.find((u: any) => u.kind === 'functions').members.find((m: any) => m.kind === 'function');
    const id = `root.${name.join('_')}`;
    c.units.push({ id: 'root', name: ['root'], module: '', kind: 'functions', visibility: 'public', origin: 'generated', members: [{ ...JSON.parse(JSON.stringify(first)), id, name }] });
    return { path: `/units/${c.units.length - 1}/members/0/name`, id };
  };
  const judged = (change: (c: any) => void, more: [string, unknown][] = []): Finding[] => {
    const c = contract();
    change(c);
    return checkContract(c, { dependencies: new Map<string, unknown>([['forms-dep', dependency()], ...more]) }).filter((f) => ['CK-79', 'CK-80', 'CK-81'].includes(f.check));
  };
  test('the fixture has no such name', () => {
    assert.deepEqual(judged(() => undefined), []);
  });
  test('a symbol that a library that the contract reads has too (CK-79)', () => {
    // The library sample-x has the root function y, polyspec_sample_x_y, which is the function x_y of sample.
    const other = contract();
    other.library = 'sample-x';
    const there = added(other, ['y']);
    let at = { path: '', id: '' };
    assert.deepEqual(judged((c) => { at = added(c, ['x', 'y']); }, [['sample-x', other]]), [{
      check: 'CK-79',
      path: at.path,
      message: `${at.id} has the C symbol polyspec_sample_x_y, which ${there.id} of the library sample-x has too, so a Go program that links both libraries defines it twice; rename one of the two (GN-17)`,
    }]);
    // Without the target go in either contract no static library holds the symbol.
    assert.deepEqual(judged((c) => { added(c, ['x', 'y']); c.targets = c.targets.filter((t: string) => t !== 'go'); }, [['sample-x', other]]).filter((f) => f.check === 'CK-79'), []);
  });
  test('a function buffer of the root module (CK-80)', () => {
    let at = { path: '', id: '' };
    assert.deepEqual(judged((c) => { at = added(c, ['buffer']); }), [{
      check: 'CK-80',
      path: at.path,
      message: `${at.id} has the C symbol polyspec_sample_buffer, which is the C type of the result of the C ABI; rename the function (GN-17)`,
    }]);
  });
  test('a function whose function of package binding the package declares itself (CK-81)', () => {
    let at = { path: '', id: '' };
    assert.deepEqual(judged((c) => { at = added(c, ['new', 'writer']); }), [{
      check: 'CK-81',
      path: at.path,
      message: `${at.id} is the function NewWriter of package binding, which the package declares itself; rename the function (GN-17)`,
    }]);
  });
  test('a function whose function of package binding is the release of a class (CK-81)', () => {
    let at = { path: '', id: '' };
    const found = judged((c) => {
      at = added(c, ['release', 'session']);
    });
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(found[0]?.check, 'CK-81');
    assert.equal(found[0]?.path, at.path);
    assert.match(found[0]?.message ?? '', /^root\.release_session is the function ReleaseSession of package binding, which is the release of the class session; rename the function or the class \(GN-17\)$/);
  });
  test('the names of package binding are the declarations of the Go files of the generator (CK-81)', () => {
    const source = readFileSync(new URL('../src/generate/go.ts', import.meta.url), 'utf8');
    const declared = [...source.matchAll(/^(?:func|type|var|const) ([A-Z][A-Za-z0-9]*)[ (\[]/gm)].map((found) => found[1] ?? '').filter((name) => /[a-z]/.test(name));
    assert.deepEqual([...new Set(declared)].sort(), [...GO_BINDING_NAMES].sort());
  });
});

describe('CK-90 a parameter whose callback the core keeps (GN-6aa)', () => {
  const judged = (change: (c: any, d: any) => void): Finding[] => findings(change).filter((f) => f.check === 'CK-90');
  const path = (c: any, id: string, parameter: number): string => {
    const index = unitIndex(c, id.split('.')[0] as string);
    return `/units/${index}/members/${c.units[index].members.findIndex((m: any) => m.id === id)}/parameters/${parameter}/keeps`;
  };
  test('keeps at a parameter that holds no callback', () => {
    assert.deepEqual(judged((c) => { member(c, 'forms.parse').parameters[0].keeps = true; }), [{
      check: 'CK-90',
      path: path(contract(), 'forms.parse', 0),
      message: 'forms.parse.body: keeps names a parameter whose type holds a callback unit, and "bytes" holds none (GN-6aa)',
    }]);
  });
  test('keeps at a parameter that holds only a function', () => {
    const type = { function: { parameters: ['text'], returns: 'text' } };
    assert.deepEqual(judged((c) => { Object.assign(member(c, 'forms.parse').parameters[0], { type, keeps: true }); }).map((f) => f.message), [
      `forms.parse.body: keeps names a parameter whose type holds a callback unit, and ${JSON.stringify(type)} holds none (GN-6aa)`,
    ]);
  });
  test('keeps at a callback unit, at a list and an optional of it, and at a callback of another repository is accepted', () => {
    assert.deepEqual(judged((c) => { member(c, 'session.new').parameters[0].keeps = true; }), []);
    assert.deepEqual(judged((c) => { Object.assign(member(c, 'session.new').parameters[0], { type: { list: { optional: { unit: 'store' } } }, keeps: true }); }), []);
    assert.deepEqual(judged((c) => { Object.assign(member(c, 'forms.parse').parameters[0], { type: { unit: 'dep_reader', library: 'forms-dep' }, keeps: true }); }), []);
  });
  test('keeps at a record that holds a callback in a field is accepted, and at a record without one is reported', () => {
    assert.deepEqual(judged((c) => { member(c, 'session.new').parameters[1].keeps = true; }).map((f) => f.message), [
      'session.new.options: keeps names a parameter whose type holds a callback unit, and {"unit":"session_options"} holds none (GN-6aa)',
    ]);
    assert.deepEqual(judged((c) => {
      unit(c, 'session_options').fields.push({ name: ['backup'], type: { optional: { unit: 'store' } }, default: { literal: null } });
      member(c, 'session.new').parameters[1].keeps = true;
    }), []);
  });
});

describe('CK-75 the core enum of a variant', () => {
  const figure = (): any => ({
    id: 'figure', name: ['figure'], module: '', kind: 'variant', visibility: 'public', origin: 'generated', core_type: 'sample::Figure',
    tag: ['type'], cases: [{ value: 'dot', fields: [] }],
  });
  test('a variant with its core_type is accepted', () => {
    assert.deepEqual(findings((c) => { c.units.push(figure()); }), []);
  });
  test('a variant without core_type', () => {
    const result = findings((c) => { const v = figure(); delete v.core_type; c.units.push(v); });
    assert.deepEqual(result, [{
      check: 'CK-75',
      path: `/units/${contract().units.length}`,
      message: 'figure: a variant names its core enum in core_type (T-9)',
    }]);
  });
});

describe('CK-76 a cleanup that leaves its object (GN-6p)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const run = (change: (cases: any, contract: any) => void): Finding[] => {
    const cases = read('contracts/cases.json');
    const contract = read('packages/rust/interface.json');
    change(cases, contract);
    return checkContract(contract, { caseFiles: new Map([['contracts/cases.json', cases]]) });
  };
  const stall = read('packages/rust/interface.json').units.findIndex((u: any) => u.id === 'stall');
  const finding = {
    check: 'CK-76',
    path: `/units/${stall}/cleanup`,
    message: 'stall: the cleanup stall.shut leaves its object (receiver &mut self), so a case of stall.shut calls it a second time in the then of its receiver and names no raises; binding check reads no Rust source, so that the Drop of the core type releases the resource of an object whose cleanup was not called is the duty of the core (GN-6p)',
  };
  test('a case that calls the cleanup a second time is accepted', () => {
    assert.deepEqual(run(() => undefined), []);
  });
  test('no case calls the cleanup a second time', () => {
    assert.deepEqual(run((c) => { c.stall_shut = c.stall_shut.filter((k: any) => k.id !== 'a_second_shut_does_nothing'); }), [finding]);
  });
  test('the second call is of another member', () => {
    assert.deepEqual(run((c) => { c.stall_shut[1].receiver.then = [{ call: 'stall.keeper' }]; }), [finding]);
  });
  test('a cleanup that consumes its object needs no such case', () => {
    assert.deepEqual(run(() => undefined).filter((f) => f.path.includes('lease')), []);
  });
});

describe('CK-21 the build of the core and exclusive members', () => {
  test('a core that returns a Result without raises is accepted (E-1c)', () => {
    assert.deepEqual(findings((c) => { const m = member(c, 'forms.parse'); m.raises = []; m.core.result = true; }), []);
    assert.deepEqual(findings((c) => { const m = member(c, 'forms.parse'); m.raises = []; m.core.result = false; }), []);
  });
  test('a core without a Result that raises (E-1c)', () =>
    fails('CK-21', `${at('forms')}/members/0/core/result`, (c) => { member(c, 'forms.parse').core.result = false; }));
  test('a core without a Result that takes a callback (E-1c)', () =>
    fails('CK-21', `${at('forms')}/members/0/core/result`, (c) => {
      const m = member(c, 'forms.parse');
      m.raises = [];
      m.core.result = false;
      m.parameters.push({ name: ['store'], type: { unit: 'store' }, required: true });
    }));
  test('core.failure on a member whose receiver keeps language code is accepted (E-1c, GN-6h)', () => {
    // session.new takes the callback store, so a session keeps language code.
    assert.deepEqual(findings((c) => { member(c, 'session.load').core.failure = true; }), []);
  });
  test('core.failure on a member whose receiver keeps no language code (E-1c)', () =>
    fails('CK-21', `${at('forms')}/members/0/core/failure`, (c) => { member(c, 'forms.parse').core.failure = true; }));
  test('core.failure false on a member that takes a callback (E-1c)', () =>
    fails('CK-21', `${at('session')}/members/0/core/failure`, (c) => {
      const m = member(c, 'session.new');
      m.core = { path: typeof m.core === 'string' ? m.core : m.core.path, failure: false };
    }));
  test('core.failure without a Result (E-1c)', () =>
    fails('CK-21', `${at('session')}/members/2/core/failure`, (c) => {
      const m = member(c, 'session.load');
      m.raises = [];
      m.core.result = false;
      m.core.failure = true;
    }));
  test('features of the core for each target are accepted (I-1)', () => {
    assert.deepEqual(findings((c) => { c.core.features = { wasm: ['pure'], node: ['io', 'redis'] }; }), []);
  });
  test('features for a language that is not a target', () => {
    // The dependency fixture has the targets php, python and node.
    const d = dependency();
    d.core.features = { go: ['io'] };
    assert.deepEqual(checkContract(d, {}).map((f) => [f.check, f.path]), [['CK-21', '/core/features/go']]);
  });
  test('a feature of platform I/O for WASM (GN-4b)', () => {
    for (const feature of ['fs', 'blocking-io', 'process', 'net']) {
      assert.deepEqual(findings((c) => { c.core.features = { wasm: ['pure', feature] }; }).map((f) => [f.check, f.path]), [['CK-63', '/core/features/wasm/1']]);
    }
  });
  test('an exclusive member of a &self class is accepted (U-6)', () => {
    assert.deepEqual(findings((c) => { const m = member(c, 'session.load'); m.core.receiver = '&self'; m.exclusive = 'HY-104'; }), []);
  });
  test('an exclusive member with the receiver &mut self', () =>
    fails('CK-21', `${at('session')}/members/`, (c) => { member(c, 'session.load').exclusive = 'HY-104'; }));
});

describe('CK-22 every member names its cases (K-1)', () => {
  test('a member without a case', () =>
    fails('CK-22', `${at('forms')}/members/`, (c) => {
      c.cases = c.cases.filter((kase: any) => kase.member !== 'forms.parse');
    }));
  // The case files of the fixture: every group that cases names, with a case of each kind that forms.parse raises.
  const withFiles = (c: any, raising: boolean, leave?: string): Finding[] => {
    const files = new Map<string, Record<string, unknown[]>>();
    for (const row of c.cases) {
      const document = files.get(row.file) ?? {};
      if (row.group !== leave) document[row.group] = row.member === 'forms.parse' && raising ? [{ id: 'too_large', body: { hex: '00' }, raises: { kind: 'too_large' } }] : [];
      files.set(row.file, document);
    }
    return checkContract(c, { dependencies: new Map([['forms-dep', dependency()]]), caseFiles: files });
  };
  test('case files with a case of every kind are accepted (B-4)', () => {
    assert.deepEqual(withFiles(contract(), true), []);
  });
  test('a kind that no case raises', () => {
    assert.deepEqual(withFiles(contract(), false).map((f) => [f.check, f.path]), [['CK-22', `${at('forms')}/members/0/raises/0`]]);
  });
  const parseCases = (): string => `/cases/${contract().cases.findIndex((kase: any) => kase.member === 'forms.parse')}`;
  // G-5: the fixture with the fault injection points copy and internal, the variant Store as the io kind store and
  // the variant Broken as the internal kind broken, all raised by forms.parse; `cases` are the cases of forms.parse.
  const TOO_LARGE = { id: 'too_large', body: { hex: '00' }, raises: { kind: 'too_large' } };
  const COPY = { id: 'copy_fails', body: { hex: '00' }, faults: [{ point: 'sample.copy', kind: 'io', errno: 'ENOSPC' }], raises: { kind: 'store', errno: 'ENOSPC' } };
  const BROKEN = { id: 'broken', body: { hex: '00' }, faults: [{ point: 'sample.internal', kind: 'broken' }], raises: { kind: 'broken' } };
  const withFaults = (cases: unknown[], change?: (c: any, d: any) => void): Finding[] => {
    const c = contract();
    const d = dependency();
    c.errors.kinds[1].category = 'io';
    c.errors.kinds.push({ variant: 'sample::Error::Broken', category: 'internal' });
    member(c, 'forms.parse').raises = ['sample::Error::TooLarge', 'sample::Error::Store', 'sample::Error::Broken'];
    c.faults = [
      { id: 'copy', core: 'sample::fault::COPY', inject: ['io', 'short'], fills: ['store'], reason: 'F-1', place: 'sample::copy' },
      { id: 'internal', core: 'sample::fault::INTERNAL', inject: ['broken'], fills: ['broken'], reason: 'X-1', place: 'sample::parse' },
    ];
    change?.(c, d);
    const files = new Map<string, Record<string, unknown[]>>();
    for (const row of c.cases) {
      const document = files.get(row.file) ?? {};
      document[row.group] ??= row.member === 'forms.parse' ? cases : [];
      files.set(row.file, document);
    }
    return checkContract(c, { dependencies: new Map([['forms-dep', d]]), caseFiles: files });
  };
  const raisesAt = (index: number): string => `${at('forms')}/members/0/raises/${index}`;
  const only = (found: Finding[], path: string, message: RegExp): void => {
    assert.deepEqual(found.map((f) => [f.check, f.path]), [['CK-22', path]], JSON.stringify(found));
    assert.match(found[0]?.message ?? '', message);
  };
  test('a case that arms a point fills the kinds of the point (G-5)', () => {
    assert.deepEqual(withFaults([TOO_LARGE, COPY, BROKEN]), []);
  });
  test('an io kind without an input case or a fault case', () =>
    only(withFaults([TOO_LARGE, BROKEN]), raisesAt(1), /no case of forms\.parse raises the kind store, by an input or by a fault injection point/));
  test('a kind of the category internal needs no case of each member (X-1)', () => {
    assert.deepEqual(withFaults([TOO_LARGE, COPY, BROKEN], (c) => {
      c.units.find((u: any) => u.id === 'session').members.find((m: any) => m.id === 'session.load').raises = ['sample::Error::Broken'];
    }), []);
  });
  test('an error enum with a kind of the category internal has the one case of its point internal (X-1)', () => {
    only(withFaults([TOO_LARGE, COPY]), '/errors/kinds/2', /no case arms the point sample\.internal as broken/);
    // A case that raises the kind without arming the point is no mapping test of the point.
    only(withFaults([TOO_LARGE, COPY, { ...BROKEN, faults: undefined }]), '/errors/kinds/2', /no case arms the point sample\.internal as broken/);
  });
  test('the error enum of a library whose kinds the contract passes on has its own case (X-1, E-1b)', () => {
    const passOn = (c: any, d: any): void => {
      d.errors.kinds[0] = { variant: 'forms_dep::Error::Limit', category: 'internal' };
      d.faults = [{ id: 'internal', core: 'forms_dep::fault::INTERNAL', inject: ['broken'], fills: ['limit'], reason: 'X-1', place: 'forms_dep::limit' }];
      c.errors.kinds.push({ variant: 'sample::Error::Dep/forms_dep::Error::Limit', library: 'forms-dep' });
      member(c, 'forms.parse').raises.push('sample::Error::Dep/forms_dep::Error::Limit');
    };
    const index = contract().errors.kinds.length + 1;
    const withDep = { id: 'dep_broken', body: { hex: '00' }, faults: [{ point: 'forms_dep.internal', kind: 'broken' }], raises: { kind: 'limit' } };
    const missing = withFaults([TOO_LARGE, COPY, BROKEN], passOn).filter((f) => f.check === 'CK-22');
    only(missing, `/errors/kinds/${index}`, /no case arms the point forms_dep\.internal as broken/);
    assert.deepEqual(withFaults([TOO_LARGE, COPY, BROKEN, withDep], passOn).filter((f) => f.check === 'CK-22'), []);
  });
  test('a fault case fills no kind that its points do not fill, so an input rule keeps its input case (G-5)', () => {
    const found = withFaults([{ ...COPY, raises: { kind: 'too_large' } }, COPY, BROKEN]);
    assert.deepEqual(found.map((f) => [f.check, f.path]), [['CK-22', parseCases()], ['CK-22', raisesAt(0)]], JSON.stringify(found));
    assert.match(found[0]?.message ?? '', /no point that the case arms fills the kind too_large/);
  });
  test('the faults of a case name points and their injections (G-5)', () => {
    const bad: [unknown, RegExp][] = [
      [[], /faults is not a list of \{point, kind\}/],
      [[{ point: 'copy', kind: 'io' }], /is not <library>\.<id>/],
      [[{ point: 'other.copy', kind: 'io' }], /is not <library>\.<id> of this contract or of a library/],
      [[{ point: 'sample.rename', kind: 'io' }], /sample\.rename is not a point of faults of sample/],
      [[{ point: 'sample.copy', kind: 'broken' }], /takes io, short, not broken/],
      [[{ point: 'sample.copy', kind: 'slow' }], /is not io, short or broken/],
      [[{ point: 'sample.copy', kind: 'short' }], /bytes, a count of bytes, is given with the kind short/],
      [[{ point: 'sample.copy', kind: 'io', bytes: 1 }], /bytes, a count of bytes, is given with the kind short/],
      [[{ point: 'sample.copy', kind: 'io', errno: 28 }], /errno is the symbol of an errno/],
      [[{ point: 'sample.copy', kind: 'short', bytes: 1, errno: 'ENOSPC' }], /errno is the symbol of an errno/],
      [[{ point: 'sample.copy', kind: 'io', nth: 0 }], /nth counts from 1/],
      [[{ point: 'sample.copy', kind: 'io', times: 2 }], /has no key times/],
    ];
    for (const [faults, message] of bad) {
      const found = withFaults([TOO_LARGE, COPY, BROKEN, { ...COPY, id: 'bad', faults }]).filter((f) => !/no point that the case arms/.test(f.message));
      only(found, parseCases(), message);
    }
    assert.deepEqual(withFaults([TOO_LARGE, BROKEN, { ...COPY, faults: [{ point: 'sample.copy', kind: 'short', bytes: 0, nth: 2 }], raises: { kind: 'store' } }]), []);
  });
  test('the errno that a case expects is a symbol (G-5)', () =>
    only(withFaults([TOO_LARGE, BROKEN, { ...COPY, raises: { kind: 'store', errno: 'no space' } }]), parseCases(), /is not the symbol of an errno/));
  test('a variant that gives two kinds has a case of each (E-1)', () => {
    const two = (c: any): void => { c.errors.kinds[1].kinds = ['store', 'store_full']; c.faults[0].fills = ['store', 'store_full']; };
    only(withFaults([TOO_LARGE, COPY, BROKEN], two), raisesAt(1), /raises the kind store_full/);
    assert.deepEqual(withFaults([TOO_LARGE, COPY, BROKEN, { ...COPY, id: 'full', raises: { kind: 'store_full' } }], two), []);
  });
  // U-7: the alias values with in_raises, and its cases in a group of its own.
  const withAlias = (cases: unknown[] | undefined, change?: (c: any) => void): Finding[] => {
    const c = contract();
    const value = unit(c, 'value');
    c.units.push({ id: 'values', name: ['values'], module: 'value', kind: 'alias', visibility: 'public', origin: 'value', core: { in: 'sample::value_from_host', out: 'sample::value_to_out' }, in_raises: ['sample::Error::TooLarge'], out: value.out, in: value.in });
    delete value.out;
    delete value.in;
    if (cases !== undefined) c.cases.push({ alias: 'values', file: 'contracts/cases.json', group: 'values_in' });
    change?.(c);
    const files = new Map<string, Record<string, unknown[]>>();
    for (const row of c.cases) {
      const document = files.get(row.file) ?? {};
      document[row.group] ??= row.alias === 'values' ? (cases ?? []) : row.member === 'forms.parse' ? [TOO_LARGE] : [];
      files.set(row.file, document);
    }
    return checkContract(c, { dependencies: new Map([['forms-dep', dependency()]]), caseFiles: files });
  };
  const REFUSED = { id: 'refused', value: { kind: 'bytes', value: { hex: '00' } }, raises: { kind: 'too_large' } };
  const aliasRow = (): string => `/cases/${contract().cases.length}`;
  test('the kinds of an alias have their cases in the group of the alias (U-7)', () => {
    assert.deepEqual(withAlias([REFUSED]), []);
  });
  test('a kind of in_raises without a case of the alias', () => {
    only(withAlias([]), `/units/${contract().units.length}/in_raises/0`, /no case of the alias values raises the kind too_large/);
    only(withAlias(undefined), `/units/${contract().units.length}/in_raises/0`, /no case of the alias values raises the kind too_large/);
  });
  test('a case of an alias is {id, value, raises} of a kind of in_raises (U-7)', () => {
    const bad: [object, RegExp][] = [
      [{ id: 'a', raises: { kind: 'too_large' } }, /gives its value/],
      [{ id: 'a', value: 1 }, /raises a kind/],
      [{ id: 'a', value: 1, raises: { kind: 'store' } }, /the kind store is not of in_raises of values/],
      [{ id: 'a', value: 1, result: 1, raises: { kind: 'too_large' } }, /has no key result/],
    ];
    for (const [kase, message] of bad) only(withAlias([REFUSED, kase]), aliasRow(), message);
  });
  test('a group holds the cases of a member or of an alias, not of both (U-7)', () => {
    const found = withAlias([REFUSED], (c) => { c.cases.at(-1).group = 'parse'; c.cases.at(-1).file = 'contracts/forms.json'; });
    assert.ok(found.some((f) => f.check === 'CK-22' && f.path === aliasRow() && /holds the cases of a member and of an alias/.test(f.message)), JSON.stringify(found));
  });
  // forms.parse with the callback parameter store, and one case of it whose store is `store`.
  const withStore = (store: unknown, change?: (c: any) => void): Finding[] => {
    const c = contract();
    member(c, 'forms.parse').parameters.push({ name: ['store'], type: { unit: 'store' }, required: true });
    change?.(c);
    const files = new Map<string, Record<string, unknown[]>>();
    for (const row of c.cases) {
      const document = files.get(row.file) ?? {};
      document[row.group] = row.member === 'forms.parse' ? [{ id: 'too_large', body: { hex: '00' }, store, raises: { kind: 'too_large' } }] : [];
      files.set(row.file, document);
    }
    return checkContract(c, { dependencies: new Map([['forms-dep', dependency()]]), caseFiles: files });
  };
  const row = { args: { key: 'a' }, result: null };
  test('a case gives a callback parameter as its fixture (G-5)', () => {
    assert.deepEqual(withStore({ callback: { 'store.read': [row, { args: { key: 'b' }, raise: { error: 'too_large', kind: 'too_large' }, once: true, async: true }] }, calls: [{ member: 'store.read', args: { key: 'a' } }] }), []);
  });
  test('a callback parameter that is no fixture, and a fixture that does not follow its callback unit', () => {
    const refused: [unknown, RegExp][] = [
      ['a', /store is not \{"callback"/],
      [{ callback: { 'store.write': [row] } }, /store\.write is no member of store/],
      [{ callback: { 'store.read': [{ args: { name: 'a' }, result: null }] } }, /the args of row 0 of store\.read are not the parameters key/],
      [{ callback: { 'store.read': [{ args: { key: 'a' }, result: null, raise: { error: 'too_large', kind: 'too_large' } }] } }, /has a result and a raise/],
      [{ callback: { 'store.read': [{ args: { key: 'a' }, raise: { error: 'store_error', kind: 'store' } }] } }, /raises store_error, which store\.read does not recognize/],
      [{ callback: { 'store.read': [{ ...row, times: 2 }] } }, /row 0 of store\.read has no key times/],
      [{ callback: { 'store.read': [row] }, calls: [{ member: 'store.read', args: {} }] }, /the args of call 0 are not the parameters key/],
    ];
    for (const [store, message] of refused) {
      const found = withStore(store);
      assert.deepEqual(found.map((f) => [f.check, f.path]), [['CK-22', parseCases()]], String(message));
      assert.match(found[0]?.message ?? '', message);
    }
    const sync = withStore({ callback: { 'store.read': [{ ...row, async: true }] } }, (c) => { c.units.find((u: any) => u.id === 'store').members[0].async_allowed = false; });
    assert.match(sync.find((f) => f.check === 'CK-22')?.message ?? '', /is async, which store\.read does not allow/);
  });
  // forms.parse with one more parameter, and one case of it that gives the parameter the value.
  const withParam = (parameter: object, key: string, value: unknown, change?: (c: any) => void): Finding[] => {
    const c = contract();
    member(c, 'forms.parse').parameters.push({ ...parameter, required: true });
    change?.(c);
    const files = new Map<string, Record<string, unknown[]>>();
    for (const kase of c.cases) {
      const document = files.get(kase.file) ?? {};
      document[kase.group] = kase.member === 'forms.parse' ? [{ id: 'too_large', body: { hex: '00' }, [key]: value, raises: { kind: 'too_large' } }] : [];
      files.set(kase.file, document);
    }
    return checkContract(c, { dependencies: new Map([['forms-dep', dependency()]]), caseFiles: files });
  };
  test('a case gives a generated interface an instance value of a class that implements it (CK-77, GN-6ap)', () => {
    const held = (c: any): void => {
      c.units.push({ id: 'holder', name: ['holder'], module: 'session', kind: 'interface', visibility: 'public', origin: 'generated', core_type: 'sample::Holder', members: [] });
      unit(c, 'memory_store').implements = [...(unit(c, 'memory_store').implements ?? []), { unit: 'holder' }];
      unit(c, 'memory_store').members.push({ id: 'memory_store.new', name: ['new'], kind: 'constructor', visibility: 'public', wait: 'none', parameters: [], returns: 'self', raises: [], core: 'sample::MemoryStore::new' });
    };
    const holder = { name: ['holder'], type: { unit: 'holder' } };
    assert.deepEqual(withParam(holder, 'holder', { new: 'memory_store.new' }, held).filter((f) => f.check === 'CK-22' && f.path === parseCases()), []);
    for (const value of ['a', { new: 'session.new', args: {} }, { callback: {} }]) {
      assert.match(withParam(holder, 'holder', value, held).map((f) => f.message).join('\n'), /holder is no instance value, made by new, of a class that implements the generated interface holder \(CK-77, GN-6ap\)/, JSON.stringify(value));
    }
  });
  const stores = { name: ['stores'], type: { list: { unit: 'store' } } };
  test('a case gives a callback inside another type as its fixture (G-5, GN-13)', () => {
    assert.deepEqual(withParam(stores, 'stores', [{ callback: { 'store.read': [row] } }]), []);
    const found = withParam(stores, 'stores', [{ callback: { 'store.write': [row] } }]);
    assert.deepEqual(found.map((f) => [f.check, f.path]), [['CK-22', parseCases()]]);
    assert.match(found[0]?.message ?? '', /store\.write is no member of store/);
    assert.match(withParam(stores, 'stores', ['a']).map((f) => f.message).join('\n'), /stores\[0\] is not \{"callback"/);
    // An instance of a class that implements the interface is an instance value (GN-13f).
    const constructible = (c: any): void => {
      unit(c, 'memory_store').members.push({ id: 'memory_store.new', name: ['new'], kind: 'constructor', visibility: 'public', wait: 'none', parameters: [], returns: 'self', raises: [], core: 'sample::MemoryStore::new' });
    };
    assert.deepEqual(withParam(stores, 'stores', [{ new: 'memory_store.new' }], constructible).filter((f) => f.check === 'CK-22' && f.path === parseCases()), []);
    assert.match(withParam(stores, 'stores', [{ new: 'session.new', args: {} }]).map((f) => f.message).join('\n'), /stores\[0\] is an instance value of session, which does not implement store/);
  });
  test('a case gives a function as a function fixture: its steps, and a result or a raise (G-5, GN-6ae)', () => {
    const takes = (parameters: unknown[], extra: object = {}): object => ({ name: ['convert'], type: { function: { parameters, returns: { passthrough: 'T' }, async_allowed: false, ...extra } } });
    const scoped = takes([{ unit: 'session' }, 'text'], { errors: { recognize: [{ unit: 'too_large' }], reason: 'HY-24' } });
    const step = { on: '0', call: 'session.load', args: { file: 'a' } };
    assert.deepEqual(withParam(takes(['text']), 'convert', { function: { calls: [], result: 'b' } }), []);
    assert.deepEqual(withParam(scoped, 'convert', { function: { calls: [step, step], result: null } }), []);
    // A fixture of a function with async_allowed may name awaits: the function returns an awaitable.
    const awaiting = takes([{ unit: 'session' }], { async_allowed: true });
    assert.deepEqual(withParam(awaiting, 'convert', { function: { calls: [step], result: 'b', awaits: true } }), []);
    // A step may name the value that its call returns.
    assert.deepEqual(withParam(scoped, 'convert', { function: { calls: [{ ...step, result: null }, step], result: null } }), []);
    assert.deepEqual(withParam(scoped, 'convert', { function: { calls: [], raise: 'exception' } }), []);
    assert.deepEqual(withParam(scoped, 'convert', { function: { calls: [], raise: { error: 'too_large', kind: 'too_large' } } }), []);
    const refused: [object, unknown, RegExp][] = [
      [takes(['text']), 'a', /convert is not a function fixture \{"function": \{"calls": \[<step>\], "result" \| "raise": <value>\}\}/],
      // The form of rows, which no generator took, is no function fixture.
      [takes(['text']), { function: [{ args: { 0: 'a' }, result: 'b' }] }, /convert is not a function fixture/],
      [takes(['text']), { function: { calls: [], result: 'b' }, calls: [] }, /convert is not a function fixture/],
      [takes(['text']), { function: { result: 'b' } }, /the calls of convert are not a list of steps/],
      [takes(['text']), { function: { calls: [], result: 'b', once: true } }, /the function fixture convert has no key once/],
      [takes(['text']), { function: { calls: [] } }, /the function fixture convert has a result or a raise, one of them/],
      [takes(['text']), { function: { calls: [], result: 'b', raise: 'exception' } }, /the function fixture convert has a result or a raise, one of them/],
      [scoped, { function: { calls: [{ ...step, raises: {} }], result: 'b' } }, /step 0 of convert has no key raises/],
      [scoped, { function: { calls: [{ ...step, on: '1' }], result: 'b' } }, /step 0 of convert is on 1, which is no parameter of the function whose type is a class of this contract/],
      [scoped, { function: { calls: [{ ...step, on: 'session' }], result: 'b' } }, /step 0 of convert is on session, which is no parameter/],
      [scoped, { function: { calls: [{ ...step, call: 'forms.parse' }], result: 'b' } }, /step 0 of convert calls forms\.parse, which is no method of session/],
      [scoped, { function: { calls: [{ ...step, args: { path: 'a' } }], result: 'b' } }, /the args of step 0 of convert are not the parameters file of session\.load/],
      [scoped, { function: { calls: [], raise: { error: 'store_error', kind: 'store' } } }, /the function fixture convert raises store_error, which the function does not recognize \(U-3\)/],
      [scoped, { function: { calls: [], raise: 'error' } }, /the function fixture convert raises "error", which is neither "exception" nor \{"error", "kind"\}/],
      [scoped, { function: { calls: [], result: 'b', awaits: true } }, /the function fixture convert names awaits, and its function type has no async_allowed: true/],
      [awaiting, { function: { calls: [], result: 'b', awaits: false } }, /the awaits of the function fixture convert is false, not true/],
    ];
    for (const [parameter, value, message] of refused) {
      const found = withParam(parameter, 'convert', value);
      assert.deepEqual(found.map((f) => [f.check, f.path]), [['CK-22', parseCases()]], String(message));
      assert.match(found[0]?.message ?? '', message);
    }
    // An argument of a function type of a step is again a function fixture.
    const nested = (c: any): void => {
      unit(c, 'session').members.push({ id: 'session.within', name: ['within'], kind: 'method', visibility: 'public', wait: 'none', parameters: [{ name: ['work'], type: { function: { parameters: [{ unit: 'session' }], returns: { passthrough: 'T' }, async_allowed: false } }, required: true }], returns: { passthrough: 'T' }, raises: [], core: { path: 'sample::Session::within', receiver: '&self' } });
    };
    const inner = (work: unknown): unknown => ({ function: { calls: [{ on: '0', call: 'session.within', args: { work } }], result: 'b' } });
    const cases = (found: Finding[]): Finding[] => found.filter((f) => f.check === 'CK-22' && f.path === parseCases());
    assert.deepEqual(cases(withParam(scoped, 'convert', inner({ function: { calls: [], result: 'c' } }), nested)), []);
    assert.match(cases(withParam(scoped, 'convert', inner('c'), nested))[0]?.message ?? '', /work of step 0 of convert is not a function fixture/);
    // A fixture of an argument of a step names awaits only when the fixture of that step names it.
    const waits = (c: any): void => {
      nested(c);
      member(c, 'session.within').parameters[0].type.function.async_allowed = true;
    };
    const outer = (awaits: object, work: unknown): unknown => ({ function: { calls: [{ on: '0', call: 'session.within', args: { work } }], result: 'b', ...awaits } });
    const both = takes([{ unit: 'session' }], { async_allowed: true });
    assert.deepEqual(cases(withParam(both, 'convert', outer({ awaits: true }, { function: { calls: [], result: 'c', awaits: true } }), waits)), []);
    assert.deepEqual(cases(withParam(both, 'convert', outer({ awaits: true }, { function: { calls: [], result: 'c' } }), waits)), []);
    assert.match(cases(withParam(both, 'convert', outer({}, { function: { calls: [], result: 'c', awaits: true } }), waits))[0]?.message ?? '', /the function fixture work of step 0 of convert names awaits, and the fixture of its step does not/);
  });
  test('a case that raises "callback" has a function fixture that raises an exception, and after observes the receiver (G-5, GN-6ae)', () => {
    const scoped = { name: ['convert'], type: { function: { parameters: [{ unit: 'session' }], returns: { passthrough: 'T' }, async_allowed: false } } };
    const kase = (extra: object, convert: unknown): Finding[] => {
      const c = contract();
      const load = member(c, 'session.load');
      load.parameters.push({ ...scoped, required: true });
      const files = new Map<string, Record<string, unknown[]>>();
      for (const row of c.cases) {
        const document = files.get(row.file) ?? {};
        document[row.group] = row.member === 'session.load' ? [...(document[row.group] ?? []), { id: 'scoped', receiver: { new: 'session.new', args: { store: { callback: {} }, options: {} } }, file: 'a', convert, ...extra }] : (document[row.group] ?? []);
        files.set(row.file, document);
      }
      return checkContract(c, { dependencies: new Map([['forms-dep', dependency()]]), caseFiles: files }).filter((f) => f.check === 'CK-22' && /the case scoped/.test(f.message));
    };
    const raising = { function: { calls: [], raise: 'exception' } };
    const returning = { function: { calls: [], result: 'b' } };
    assert.deepEqual(kase({ raises: 'callback' }, raising), []);
    assert.match(kase({ raises: 'callback' }, returning)[0]?.message ?? '', /raises "callback", and no function fixture of its arguments raises "exception"/);
    assert.match(kase({ raises: 'other' }, raising)[0]?.message ?? '', /raises "other", which is neither \{"kind": <kind>, \.\.\.\} nor "callback"/);
    const after = { call: 'session.load', args: { file: 'a', convert: returning }, result: null };
    assert.deepEqual(kase({ after: [after] }, returning), []);
    assert.match(kase({ after: after }, returning)[0]?.message ?? '', /after is not a list of calls/);
    assert.match(kase({ after: [{ ...after, raises: {} }] }, returning)[0]?.message ?? '', /after 0 has no key raises/);
    assert.match(kase({ after: [{ ...after, call: 'forms.parse' }] }, returning)[0]?.message ?? '', /after 0 calls forms\.parse, which is no method of session/);
    assert.match(kase({ after: [{ ...after, args: {} }] }, returning)[0]?.message ?? '', /the args of after 0 are not the parameters file, convert of session\.load/);
    assert.match(kase({ after: [{ call: 'session.load', args: after.args }] }, returning)[0]?.message ?? '', /after 0 names no result/);
  });
  test('a group that is not in its file', () => {
    const c = contract();
    const index = c.cases.findIndex((row: any) => row.group === 'parse');
    assert.deepEqual(withFiles(c, true, 'parse').map((f) => [f.check, f.path]), [['CK-22', `/cases/${index}`]]);
  });
  test('constants, error units, callbacks and host units need no case', () => {
    assert.deepEqual(findings((c) => {
      c.cases = c.cases.filter((kase: any) => !kase.member.startsWith('form_error.'));
    }), []);
  });
});

describe('CK-72 the tag of a variant (T-9)', () => {
  const variant = (field: string[]): any => ({
    id: 'shape', name: ['shape'], module: '', kind: 'variant', visibility: 'public', origin: 'generated', core_type: 'sample::Shape', tag: ['shape', 'kind'],
    cases: [{ value: 'dot', fields: [] }, { value: 'circle', fields: [{ name: ['radius'], type: 'float', required: true }, { name: field, type: 'text', required: true }] }],
  });
  test('a field of a case with the name of the tag', () => {
    const result = findings((c) => { c.units.push(variant(['shape', 'kind'])); });
    const found = result.filter((f) => f.check === 'CK-72');
    assert.equal(found.length, 1, JSON.stringify(result, null, 2));
    assert.equal(found[0]?.path, `/units/${contract().units.length}/cases/1/fields/1`);
    assert.match(found[0]?.message ?? '', /the field shape_kind of the case circle of shape has the name of the tag of the variant; rename the field or the tag \(T-9, GN-6v\)/);
    assert.deepEqual(result.filter((f) => f.check !== 'CK-72'), []);
  });
  test('a field with another name is accepted', () => {
    assert.deepEqual(findings((c) => { c.units.push(variant(['label'])); }), []);
  });
});

describe('CK-23 reserved words of the target languages (N-2)', () => {
  test('a PHP function named echo', () =>
    fails('CK-23', `${at('forms')}/members/0`, (c) => { member(c, 'forms.parse').name = ['echo']; }));
  test('a PHP class named List, case-insensitively', () =>
    fails('CK-23', at('session'), (c) => { unit(c, 'session').name = ['list']; }));
  test('a Python parameter named from', () =>
    fails('CK-23', `${at('forms')}/members/0/parameters/0`, (c) => { member(c, 'forms.parse').parameters[0].name = ['from']; }));
  test('a JavaScript parameter named function', () =>
    fails('CK-23', `${at('forms')}/members/0/parameters/0`, (c) => { member(c, 'forms.parse').parameters[0].name = ['function']; }));
  test('a PHP class named List of an internal unit, which the generator declares too (GN-6r)', () =>
    fails('CK-23', at('session'), (c) => {
      unit(c, 'session').visibility = 'internal';
      unit(c, 'session').name = ['list'];
    }));
  test('a reserved word where the language allows it is accepted: a PHP or Node method named list', () => {
    const c = contract();
    c.targets = ['php', 'node'];
    member(c, 'session.load').name = ['list'];
    assert.deepEqual(checkContract(c, { dependencies: new Map([['forms-dep', dependency()]]) }).filter((f) => f.check === 'CK-23'), []);
  });
  test('the finding names the remedy that the generator takes: a rename in the contract', () => {
    const message = (change: (c: any) => void): string => findings(change).find((f) => f.check === 'CK-23')?.message ?? '';
    assert.match(message((c) => { member(c, 'forms.parse').parameters[0].name = ['from']; }), /^from, the python name of a parameter of forms\.parse, is a reserved word of python; rename the parameter in the contract \(N-2\)$/);
    assert.match(message((c) => { member(c, 'forms.parse').name = ['echo']; }), /is a reserved word of php; rename the member in the contract \(N-2\)$/);
    assert.match(message((c) => { unit(c, 'session').name = ['list']; }), /is a reserved word of php; rename the unit in the contract \(N-2\)$/);
    assert.doesNotMatch(message((c) => { member(c, 'forms.parse').parameters[0].name = ['from']; }), /naming exception/);
  });
  test('a naming exception gives the language another name (N-3)', () => {
    assert.deepEqual(findings((c) => {
      member(c, 'forms.parse').name = ['echo'];
      c.naming.exceptions.push({ lang: 'php', unit: 'forms', member: 'forms.parse', name: 'echoText', reason: 'N-2: echo is a PHP keyword' });
    }).filter((f) => f.check === 'CK-23'), []);
  });
});

describe('CK-17 function types (T-2, U-3)', () => {
  const fn = (extra: object): object => ({ function: { parameters: ['text'], returns: 'none', ...extra } });
  test('a function type with its attributes is accepted', () => {
    assert.deepEqual(findings((c) => {
      member(c, 'forms.parse').parameters[0].type = fn({ async_allowed: false, errors: { recognize: [{ unit: 'too_large' }], reason: 'HY-24' } });
    }), []);
  });
  test('a function type without async_allowed', () =>
    fails('CK-17', '/units/', (c) => { member(c, 'forms.parse').parameters[0].type = fn({}); }));
  test('a function type that recognizes a unit that is no error', () =>
    fails('CK-17', '/units/', (c) => {
      member(c, 'forms.parse').parameters[0].type = fn({ async_allowed: false, errors: { recognize: [{ unit: 'session' }], reason: 'HY-24' } });
    }));
});

describe('CK-1 changes', () => {
  const renamed = { id: 'class-names', rule: 'E-2', reason: 'E-2', symbol: 'SampleValueError', from: { python: 'OldValueError' } };
  test('a rename gives the new name in each language (RN-4)', () => {
    assert.deepEqual(findings((c) => { c.changes.push({ ...renamed, to: { python: 'SampleValueError' } }); }), []);
  });
  test('a new name that is empty', () =>
    fails('CK-1', '/changes/', (c) => { c.changes.push({ ...renamed, to: { python: '' } }); }));
});

describe('CK-10 class names in the form of each language (E-2, N-2)', () => {
  // The repository json: an acronym, JSON in Python and Go, Json in PHP and Node.
  const json = (c: any): void => {
    c.library = 'json';
    c.core.crate = 'polyspec-json';
    c.packages.php = { package: 'polyspec/json', namespace: 'Polyspec\\Json' };
    c.packages.python = { package: 'polyspec-json', module: 'polyspec.json' };
    c.packages.node = { ...c.packages.node, package: '@polyspec/json' };
    for (const [category, row] of Object.entries(c.errors.classes) as [string, Record<string, string>][]) {
      const word = `${category.charAt(0).toUpperCase()}${category.slice(1)}Error`;
      for (const lang of Object.keys(row)) row[lang] = lang === 'php' ? `Polyspec\\Json\\Json${word}` : lang === 'python' || lang === 'go' ? `JSON${word}` : `Json${word}`;
    }
  };
  test('a repository name with an acronym has each language\'s form', () => {
    assert.deepEqual(findings(json).filter((f) => f.check === 'CK-18' || f.check === 'CK-10'), []);
  });
  test('a Python class in the PHP form', () =>
    fails('CK-10', '/errors/classes/value/python', (c) => { json(c); c.errors.classes.value.python = 'JsonValueError'; }));
  test('a Node class in the Python form', () =>
    fails('CK-10', '/errors/classes/value/node', (c) => { json(c); c.errors.classes.value.node = 'JSONValueError'; }));
});

describe('CK-11 errors held as a source', () => {
  test('a kind of the repository that holds a dependency error forwards or drops its properties', () =>
    fails('CK-11', '/errors/wrapped', (c) => { c.errors.kinds.push({ variant: 'sample::Error::Form', category: 'value', source: 'forms-dep' }); }));
  test('a dependency kind passed on has no source', () =>
    fails('CK-1', '/errors/kinds/2', (c) => { c.errors.kinds.push({ variant: 'forms_dep::Error::Limit', library: 'forms-dep', source: 'forms-dep' }); }));
});

test('CK-8: an else row takes the other value of its sibling predicate', () => {
  const result = findings((c) => {
    for (const row of unit(c, 'value').in) for (const lang of ['node', 'wasm']) if (row[lang] === 'number') row.cases = [{ when: { predicate: 'integral_float', is: true }, kind: 'int', read: 'builtin' }, { when: 'else', kind: 'float', read: 'builtin' }];
    for (const [lang, type] of [['php', 'float'], ['python', 'float'], ['go', 'float64']] as [string, string][]) unit(c, 'value').in.push({ [lang]: type, cases: [{ kind: 'float', read: 'builtin' }] });
    const float = { php: 'float', python: 'float', node: 'float', wasm: 'float', go: 'float' };
    unit(c, 'value').out.push({ kind: 'float', when: { predicate: 'integral_float', is: false }, make: float });
    unit(c, 'value').out.push({ kind: 'float', when: 'else', make: float });
  });
  // The else row's floats are integral, which the in row of number classifies as int (P-3); the other row is sound.
  assert.deepEqual(result.map((f) => f.path).sort(), [`${at('value')}/out/5/make/node`, `${at('value')}/out/5/make/wasm`], JSON.stringify(result));
  assert.ok(result.every((f) => f.check === 'CK-8' && /comes back as int/.test(f.message)), JSON.stringify(result));
});

test('CK-8: a case of kind null reads nothing', () =>
  fails('CK-8', `${at('value')}/in/17/cases/0/read`, (c) => {
    unit(c, 'value').out.push({ kind: 'null', make: { php: 'null', python: 'null', node: 'null', wasm: 'null', go: 'null' } });
    for (const [lang, type] of [['php', 'null'], ['python', 'None'], ['node', 'null'], ['wasm', 'null'], ['go', 'nil']] as [string, string][]) {
      unit(c, 'value').in.push({ [lang]: type, cases: [{ kind: 'null', read: 'builtin' }] });
    }
  }));

describe('CK-22 instance values (GN-13f)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const run = (change: (cases: any) => void): Finding[] => {
    const cases = read('contracts/cases.json');
    change(cases);
    return checkContract(read('packages/rust/interface.json'), { caseFiles: new Map([['contracts/cases.json', cases]]) });
  };
  const messages = (change: (cases: any) => void): string => run(change).map((f) => `${f.check} ${f.message}`).join('\n');
  test('the classes repository passes', () => {
    assert.deepEqual(run(() => undefined), []);
  });
  test('a member that is no member, or that gives another class', () => {
    assert.match(messages((c) => { c.gate_enter[0].receiver.new = 'tag.nothing'; }), /CK-22 the case an_open_gate_lets_its_tag_pass of gate\.enter: the receiver names tag\.nothing, which is no member/);
    assert.match(messages((c) => { c.gate_enter[0].receiver = { new: 'tag.new', args: { name: 'a' } }; }), /tag\.new gives \{"unit":"tag"\}, not the class gate/);
  });
  test('a method without its receiver, and args that are not the parameters', () => {
    assert.match(messages((c) => { delete c.gate_enter[0].receiver.receiver; }), /tag\.gate is a method, so the value gives its receiver/);
    assert.match(messages((c) => { c.gate_enter[0].receiver.receiver.args = {}; }), /the args of the receiver of the receiver give no name of tag\.new/);
  });
  test('a pick that does not reach the class, and a then that is no method of it', () => {
    assert.match(messages((c) => { c.gate_enter[1].receiver.pick = [{ tuple: 0 }]; }), /takes part 0 of \{"list":\{"unit":"gate"\}\}, which is no tuple/);
    assert.match(messages((c) => { c.gate_enter[2].receiver.then = [{ call: 'tag.name' }]; }), /then 0 of the receiver calls tag\.name, which is no method of gate/);
  });
  test('a then that fails with a kind of its member, and one that names another kind', () => {
    const twice = (raises: unknown) => (c: any) => { c.gate_enter[2].receiver.then.push({ call: 'gate.close', raises }); };
    assert.deepEqual(run(twice({ kind: 'closed' })), []);
    assert.match(messages(twice({ kind: 'missing' })), /then 1 of the receiver expects gate\.close to fail with missing, which is no kind of its raises/);
    assert.match(messages(twice('closed')), /then 1 of the receiver expects gate\.close to fail by \{"kind": <kind>\}/);
  });
  test('a receiver of a member that has none', () => {
    assert.match(messages((c) => { c.tag_parse[0].receiver = { new: 'tag.new', args: { name: 'a' } }; }), /tag\.parse has no receiver, so the case gives none/);
  });
});

test('CK-13 counts Encode<Variant> and Decode<Variant>, through which another Go module reaches a variant (GN-15a)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/variants/${path}`, import.meta.url), 'utf8'));
  const contract = read('packages/rust/interface.json');
  const functions = contract.units.find((u: any) => u.kind === 'functions');
  functions.members.push({ ...functions.members[0], id: 'variants.encode_figure', name: ['encode', 'figure'] });
  const found = checkContract(contract, { caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) });
  assert.ok(found.some((f) => f.check === 'CK-13' && /declares EncodeFigure twice/.test(f.message)), JSON.stringify(found.map((f) => `${f.check} ${f.message}`)));
});

describe('CK-92 the members that the instance values of a case call (GN-13f, Q-4)', () => {
  // The contract of template has such a case: prepared_render.render is generated for every target, and the receivers
  // of its cases are made by engine.prepare, whose only keeps it out of wasm, so the wasm test could not make them.
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const run = (change: (contract: any) => void): Finding[] => {
    const contract = read('packages/rust/interface.json');
    change(contract);
    return checkContract(contract, { caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) });
  };
  const outOfWasm = { targets: ['php', 'python', 'node', 'go'], reason: 'GN-6q' };
  const tag = (contract: any): any => contract.units.find((u: any) => u.id === 'tag');
  test('a member that an instance value calls and that only keeps out of a target of the member of the case', () => {
    const found = run((contract) => { tag(contract).members.find((m: any) => m.id === 'tag.gate').only = outOfWasm; });
    assert.ok(found.some((f) => f.check === 'CK-92' && /^the case an_open_gate_lets_its_tag_pass of gate\.enter: its instance values call tag\.gate, which is not generated for wasm, where gate\.enter is; give gate\.enter or its unit an only without wasm \(Q-4, GN-13f\)$/.test(f.message)), JSON.stringify(found));
  });
  test('a member that an instance value inside a list, an optional or a record of an argument calls', () => {
    // The contract of template gives fs_loader.new inside the record options of the receiver of engine.render, and only
    // keeps fs_loader out of wasm; the check read no instance value below a parameter of a class type.
    const found = run((contract) => { tag(contract).members.find((m: any) => m.id === 'tag.repeat').only = outOfWasm; });
    assert.ok(found.some((f) => f.check === 'CK-92' && /^the case the_names_of_the_tags_by_commas of classes\.join: its instance values call tag\.repeat, which is not generated for wasm, where classes\.join is;/.test(f.message)), JSON.stringify(found));
  });
  test('the same only on the unit of the member of the case resolves it', () => {
    const found = run((contract) => {
      tag(contract).members.find((m: any) => m.id === 'tag.gate').only = outOfWasm;
      contract.units.find((u: any) => u.id === 'gate').only = outOfWasm;
      // These members take the interface named, whose cases give a gate made by tag.gate.
      for (const id of ['classes.label_of', 'classes.label_or', 'tag.names']) {
        contract.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === id).only = outOfWasm;
      }
    });
    assert.deepEqual(found.filter((f) => f.check === 'CK-92'), []);
  });
});

describe('CK-22 the faults and the receiver of a call of then (GN-13f)', () => {
  const read = (repo: string, path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${repo}/${path}`, import.meta.url), 'utf8'));
  const run = (repo: string, change: (cases: any) => void): Finding[] => {
    const cases = read(repo, 'contracts/cases.json');
    change(cases);
    return checkContract(read(repo, 'packages/rust/interface.json'), { caseFiles: new Map([['contracts/cases.json', cases]]) });
  };
  const messages = (repo: string, change: (cases: any) => void): string => run(repo, change).map((f) => `${f.check} ${f.message}`).join('\n');
  // A counter whose draw ran with the faults of the call, then the total of the counter.
  const drawn = (step: object) => (c: any) => {
    c.counter_total.push({ id: 'the_total_after_a_draw', receiver: { new: 'counter.new', args: { start: 2 }, then: [{ call: 'counter.draw', args: { other: { new: 'counter.new', args: { start: 1 } } }, ...step }] }, result: 2 });
  };
  test('a call of then arms the faults of its own call', () => {
    assert.deepEqual(run('sample', drawn({ faults: [{ point: 'sample.draw', kind: 'broken' }], raises: { kind: 'internal' } })), []);
  });
  test('the faults of a call of then are the faults of a case, and a failure that it expects is a kind of its points', () => {
    assert.match(messages('sample', drawn({ faults: [{ point: 'sample.nothing', kind: 'broken' }] })), /CK-22 .*sample\.nothing/);
    assert.match(messages('sample', drawn({ faults: [{ point: 'sample.read', kind: 'io' }], raises: { kind: 'internal' } })), /then 0 of the receiver expects counter\.draw to fail with internal, which no point that it arms fills/);
  });
  test('a case whose instance values arm faults fills only the kinds of their points', () => {
    const added = (c: any) => {
      c.counter_draw.push({ id: 'a_draw_after_an_add', receiver: { new: 'counter.new', args: { start: 2 }, then: [{ call: 'counter.add', args: { amount: 1 }, faults: [{ point: 'sample.read', kind: 'io' }] }] }, other: { new: 'counter.new', args: { start: 1 } }, raises: { kind: 'internal', status: null, category: 'internal', message: 'the draw is broken' } });
    };
    assert.match(messages('sample', added), /the case a_draw_after_an_add of counter\.draw: no point that the case arms fills the kind internal/);
  });
  test('a call of then on the receiver of the value', () => {
    assert.deepEqual(run('classes', (c) => { c.gate_enter[1].receiver.then = [{ call: 'tag.name', on: 'receiver' }]; }), []);
    assert.match(messages('classes', (c) => { c.gate_enter[1].receiver.then = [{ call: 'gate.close', on: 'receiver' }]; }), /then 0 of the receiver calls gate\.close on its receiver, which is no method of tag/);
    assert.match(messages('classes', (c) => { c.gate_enter[0].receiver.receiver.then = [{ call: 'tag.name', on: 'receiver' }]; }), /then 0 of the receiver of the receiver calls tag\.name on its receiver, but tag\.new gives the value without one/);
    assert.match(messages('classes', (c) => { c.gate_enter[1].receiver.then = [{ call: 'tag.name', on: 'self' }]; }), /then 0 of the receiver calls on self, but on names only receiver/);
  });
});

describe('CK-64 integers of a case (T-1)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/shapes/${path}`, import.meta.url), 'utf8'));
  const run = (change: (cases: any) => void): string[] => {
    const cases = read('contracts/cases.json');
    change(cases);
    return checkContract(read('packages/rust/interface.json'), { caseFiles: new Map([['contracts/cases.json', cases]]) }).map((f) => `${f.check} ${f.path} ${f.message}`);
  };
  const outside = (where: string, what: string, type: string): string =>
    `CK-64 ${where}: ${what} 9223372036854775807 is outside the safe integers, the range of the type ${type} (T-1); a value of the range of i64 is an int64`;
  test('the shapes repository passes, with its int64 case outside the safe integers', () => {
    assert.deepEqual(run(() => undefined), []);
  });
  test('an argument, an item of a list and a result outside the safe integers of uint', () => {
    const big = 9223372036854775807n;
    assert.deepEqual(run((c) => { c.repeat[0].times = big; }), [outside('/cases/1 the case twice_with_a_separator of shapes.repeat', 'the argument times', 'uint')]);
    const id: string = read('contracts/cases.json').total[0].id;
    const row: number = read('packages/rust/interface.json').cases.findIndex((c: any) => c.member === 'shapes.total');
    assert.deepEqual(run((c) => { c.total[0].numbers = [1, big]; c.total[0].result = big; }), [
      outside(`/cases/${row} the case ${id} of shapes.total`, 'the argument numbers[1]', 'uint'),
      outside(`/cases/${row} the case ${id} of shapes.total`, 'the result result', 'uint'),
    ]);
  });
  test('an item of a map that a case gives as an array of [key, value]', () => {
    const big = 9223372036854775807n;
    const id: string = read('contracts/cases.json').split_counts[0].id;
    const row: number = read('packages/rust/interface.json').cases.findIndex((c: any) => c.member === 'shapes.split_counts');
    assert.deepEqual(run((c) => { c.split_counts[0].counts = [['a', 1], ['b', big]]; }), [outside(`/cases/${row} the case ${id} of shapes.split_counts`, 'the argument counts.b', 'uint')]);
  });
});

describe('CK-22 values of the type cancel (GN-13)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/shapes/${path}`, import.meta.url), 'utf8'));
  // shapes.measure with a parameter of the type cancel, given by its first case.
  const run = (value: unknown): string[] => {
    const contract = read('packages/rust/interface.json');
    const measure = contract.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === 'shapes.measure');
    measure.parameters.push({ name: ['cancel'], type: { optional: 'cancel' }, default: { literal: null } });
    const cases = read('contracts/cases.json');
    cases.measure[0].cancel = value;
    return checkContract(contract, { caseFiles: new Map([['contracts/cases.json', cases]]) }).filter((f) => f.check === 'CK-22').map((f) => f.message);
  };
  test('a cancellation that fired before the call, one that does not fire, and none', () => {
    for (const value of [{ cancel: 'fired' }, { cancel: 'open' }, null]) assert.deepEqual(run(value), [], JSON.stringify(value));
  });
  test('any other value', () => {
    for (const value of [true, { cancel: 'later' }, { cancel: 'fired', after: 1 }]) {
      assert.deepEqual(run(value).filter((m) => m.includes('the argument cancel')).length, 1, JSON.stringify(value));
      assert.match(run(value).join('\n'), /the argument cancel is \{"cancel": "fired" \| "open"\}/);
    }
  });
});

describe('CK-16 the awaitable of a member that waits (GN-6m)', () => {
  const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/classes/${path}`, import.meta.url), 'utf8'));
  const run = (change: (contract: any) => void): string[] => {
    const contract = read('packages/rust/interface.json');
    change(contract);
    return checkContract(contract, { caseFiles: new Map([['contracts/cases.json', read('contracts/cases.json')]]) }).filter((f) => f.check === 'CK-16').map((f) => `${f.path} ${f.message}`);
  };
  const waiting = (contract: any): any => contract.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === 'gate.enter_slowly');
  test('the classes repository passes', () => {
    assert.deepEqual(run(() => undefined), []);
  });
  test('an awaitable that is the name of another member, or a reserved word', () => {
    assert.match(run((c) => { c.units.find((u: any) => u.id === 'gate').members.find((m: any) => m.id === 'gate.close').name = ['aenter', 'slowly']; }).join('\n'), /the Python awaitable aenter_slowly of gate\.enter_slowly is the name of gate\.close/);
    assert.match(run((c) => { waiting(c).name = ['wait']; }).join('\n'), /the Python awaitable await of gate\.enter_slowly is a reserved word of Python/);
  });
});
