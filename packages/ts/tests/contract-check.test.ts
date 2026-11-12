// Every check of docs/spec/contract-check.md: the fixture passes, and each change below fails with the finding of the
// check that owns the rule, at the path of the changed item, and with no finding of another check.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkContract, type Finding } from '../src/index.ts';
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
  test('a case of an unknown member', () => fails('CK-3', '/cases/0/member', (c) => { c.cases[0].member = 'forms.nothing'; }));
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
        { id: 'a', name: ['a'], module: 'session', kind: 'interface', visibility: 'public', origin: 'generated', implements: [{ unit: 'b' }], members: [] },
        { id: 'b', name: ['b'], module: 'session', kind: 'interface', visibility: 'public', origin: 'generated', implements: [{ unit: 'a' }], members: [] },
      );
    }));
});

describe('CK-8 value units', () => {
  const inRows = (c: any): any[] => unit(c, 'value').in;
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
      c.errors.kinds.push({ variant: 'forms_dep::Error::Nothing', library: 'forms-dep' });
      c.errors.wrapped.push({ library: 'forms-dep', unit: 'dep_error', property: ['field'], drop: { reason: 'P-4' } });
    }));
});

describe('CK-11 wrapped dependency errors', () => {
  const wrap = (c: any): void => {
    c.errors.kinds.push({ variant: 'forms_dep::Error::Limit', library: 'forms-dep' });
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
  test('a Go naming exception that makes a name collide', () =>
    fails('CK-13', '/units/', (c) => {
      c.naming.exceptions.push({ lang: 'go', unit: 'memory_store', name: 'Session', reason: 'S1' });
    }));
});

describe('CK-14 modules', () => {
  test('a module under host', () => fails('CK-14', `${at('forms')}/module`, (c) => { unit(c, 'forms').module = 'host/forms'; }));
  test('a module under tests', () => fails('CK-14', `${at('forms')}/module`, (c) => { unit(c, 'forms').module = 'tests'; }));
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
    }));
  test('an awaitable callback name taken by another member', () =>
    fails('CK-16', `${at('store')}/members/0`, (c) => {
      unit(c, 'store').members.push({ id: 'store.aread', name: ['aread'], kind: 'method', visibility: 'public', async_allowed: false });
    }));
});

describe('CK-17 callbacks', () => {
  test('async_allowed outside a callback', () => fails('CK-17', '/units/', (c) => { member(c, 'forms.parse').async_allowed = true; }));
  test('errors outside a callback', () =>
    fails('CK-17', '/units/', (c) => { member(c, 'forms.parse').errors = { recognize: [{ unit: 'too_large' }], reason: 'HY-24' }; }));
  test('a callback member that does not state async_allowed', () =>
    fails('CK-17', `${at('store')}/members/0`, (c) => { delete member(c, 'store.read').async_allowed; }));
  test('recognize names a class', () =>
    fails('CK-17', `${at('store')}/members/0/errors/recognize/0`, (c) => { member(c, 'store.read').errors.recognize[0].unit = 'session'; }));
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
      in: [{ php: 'null', cases: [{ kind: 'null', read: 'builtin' }] }, { python: 'None', cases: [{ kind: 'null', read: 'builtin' }] }, { node: 'null', cases: [{ kind: 'null', read: 'builtin' }] }],
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

describe('CK-8 representative units and predicate round trips', () => {
  const gather = (c: any): void => {
    const value = unit(c, 'value');
    c.units.push({ id: 'values', name: ['values'], module: 'value', kind: 'alias', visibility: 'public', origin: 'value', out: value.out, in: value.in });
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
    fails('CK-8', '/units/', (c) => { gather(c); unit(c, 'values').origin = 'generated'; delete unit(c, 'values').out; delete unit(c, 'values').in; }));
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
