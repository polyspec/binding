// GN-6bu (B2.467): a callback takes the arguments that the binding calls it with. Each test reads the generated entry
// code that refuses a callback, or the generated tests of the rule, of one target; the run of those generated tests in
// their languages is the end-to-end check of CI.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generate, type Inputs } from '../src/generate/index.ts';

type Target = 'node' | 'wasm' | 'php' | 'python';
const TARGETS: readonly Target[] = ['node', 'wasm', 'php', 'python'];
const LIB: Record<Target | 'go', string> = {
  node: 'packages/ts/generated/lib.rs',
  wasm: 'packages/ts/wasm/generated/lib.rs',
  php: 'packages/php-ext/generated/lib.rs',
  python: 'packages/python/generated/lib.rs',
  go: 'packages/go/internal/ffi/generated/lib.rs',
};
const TESTS: Record<Target, string> = {
  node: 'packages/ts/generated/tests/generated.test.mjs',
  wasm: 'packages/ts/wasm/generated/tests/generated.test.mjs',
  php: 'packages/php-ext/generated/tests/GeneratedTest.php',
  python: 'packages/python/generated/tests/test_generated.py',
};

const read = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
// The sample has the callback units and the members with machine, and functions the values of a function type.
const repository = (name: 'sample' | 'functions', change: (contract: any) => void = () => undefined): { contract: any; caseFiles: Map<string, unknown> } => {
  const contract = read(`${name}/packages/rust/interface.json`);
  change(contract);
  return { contract, caseFiles: new Map([['contracts/cases.json', read(`${name}/contracts/cases.json`)]]) };
};
const generated = (name: 'sample' | 'functions', target: Target | 'go', change?: (contract: any) => void): Map<string, string | Buffer> =>
  generate({ ...repository(name, change), version: '0.0.0', coreLib: `polyspec_${name}`, targets: [target] as Inputs['targets'] & string[] });
const text = (out: Map<string, string | Buffer>, path: string): string => String(out.get(path) ?? '');
// The body of a Rust function of a generated crate, from its `fn <name>` to the closing brace of its item.
const rustFn = (lib: string, name: string): string => {
  const at = lib.search(new RegExp(`\\nfn ${name}[<(]`));
  assert.notEqual(at, -1, `fn ${name}`);
  return lib.slice(at, lib.indexOf('\n}\n', at) + 3);
};
// The text of one generated test, from its head to the head of the next.
const testOf = (tests: string, head: string): string => {
  const at = tests.indexOf(head);
  assert.notEqual(at, -1, head);
  const next = tests.slice(at + head.length).search(/\n(test\(| {4}public function | {4}def )/);
  return next === -1 ? tests.slice(at) : tests.slice(at, at + head.length + next);
};

// What each target asks, in the helper takes_in that every place of the crate calls.
const READS: Record<Target, RegExp[]> = {
  node: [/object\.get_named_property\("length"\)/, /named_only: true,/, /napi_get_and_clear_last_exception/],
  wasm: [/Reflect::get\(function, &JsValue::from_str\("length"\)\)/, /named_only: true,/],
  python: [/py_\.import\("inspect"\)\?\.getattr\("signature"\)\?\.call1\(\(callable,\)\)/, /signature\.call_method1\("bind", positional\)/, /PyValueError>\(py_\) \|\| error\.is_instance_of::<pyo3::exceptions::PyTypeError>\(py_\) => return Ok\(\(\)\),/, /named_only: false,/],
  php: [/let Some\(\(parameters, required, variadic\)\) = declares\(\) else \{\n {8}return Ok\(\(\)\);/, /if !variadic && usize::try_from\(parameters\)\.is_ok_and\(\|parameters\| parameters < given\.len\(\)\) \{\n {8}binding_core::Declared::Takes\(parameters\)/, /\} else if usize::try_from\(required\)\.is_ok_and\(\|required\| required > given\.len\(\)\) \{\n {8}binding_core::Declared::Requires\(required\)/, /named_only: false,/],
};

for (const target of TARGETS) {
  test(`B2.467: ${target} refuses with invalid_callback a callback that does not take its arguments, and checks no place without arguments (GN-6bu)`, () => {
    const lib = text(generated('sample', target), LIB[target]);
    const takes = rustFn(lib, 'takes_in');
    // A place that is given no argument has no check, and the refusal is the one kind with its arguments.
    assert.match(takes, /\n {4}if given\.is_empty\(\) \{\n {8}return Ok\(\(\)\);\n {4}\}\n/);
    assert.match(takes, /BindingError::InvalidCallback \{\n {8}subject: subject\.to_owned\(\),\n {8}member: member\.to_owned\(\),\n {8}arguments: Some\(binding_core::CallbackArguments \{\n {12}declared,\n {12}given: given\.iter\(\)\.map\(\|name\| \(\*name\)\.to_owned\(\)\)\.collect\(\),/);
    for (const reads of READS[target]) assert.match(takes, reads);
    // Node and WASM refuse only a function that names fewer; PHP and Python refuse both directions.
    assert.equal(/Declared::Requires/.test(takes), target === 'php');
    assert.equal(/Declared::Takes/.test(takes), target !== 'python');
  });

  test(`B2.467: ${target} checks each member of a callback unit that is given arguments when the object enters (GN-6bu)`, () => {
    const lib = text(generated('sample', target), LIB[target]);
    const enters = rustFn(lib, 'in_lookup');
    const check = {
      node: /\n {4}takes_in\(env_, found, subject, "find", &\["key"\]\)\?;\n/,
      wasm: /\n {4}takes_in\(&found, subject, "find", &\["key"\]\)\?;\n/,
      python: /\n {4}takes_in\(py_, &value\.getattr\("find"\)\?, subject, "find", &\["key"\]\)\?;\n/,
      php: /\n {4}takes_in\(\|\| reflected\("ReflectionMethod", vec!\[value, &"find"\]\), subject, "find", &\["key"\]\)\?;\n/,
    }[target];
    assert.match(enters, check);
    // The check follows the check that the member is callable, and the struct is made after both.
    assert.ok(enters.indexOf('arguments: None') < enters.search(check) && enters.search(check) < enters.indexOf('\n    Ok('), enters);
    // The subject names the member that received the callback.
    assert.match(lib, /in_lookup\((?:env_, |py_, )?&?lookup, "resolve\(\): lookup"\)/);
  });

  test(`B2.467: ${target} checks the function of a member with machine when it enters (GN-6bu)`, () => {
    const lib = text(generated('sample', target), LIB[target]);
    const enters = rustFn(lib, 'callable_in');
    assert.match(enters, /given: &\[&str\]\)/);
    const check = {
      node: /\n {4}takes_in\(env_, value, subject, "", given\)\?;\n {4}Owned::new\(env_, value\)/,
      wasm: /\n {4}takes_in\(value, subject, "", given\)\?;\n {4}Ok\(function\)/,
      python: /\n {4}takes_in\(py_, value, subject, "", given\)\?;\n {4}Ok\(value\.clone\(\)\.unbind\(\)\)/,
      php: /\n {4}takes_in\(\|\| reflected_callable\(value\), subject, "", given\)\?;\n {4}Ok\(value\.shallow_clone\(\)\)/,
    }[target];
    assert.match(enters, check);
    const call = { node: 'Store.transaction()', wasm: 'Store.transaction()', python: 'Store.transaction()', php: 'Store::transaction()' }[target];
    assert.ok(lib.includes(`"${call}: work", &["scope"])?;`), call);
    if (target === 'php') {
      // The engine is asked through Reflection, which the extension calls as any method of PHP; the exception of a
      // call is taken before its answer is read, and a callable that the engine does not describe gives no answer.
      assert.match(rustFn(lib, 'reflected_callable'), /ZendCallable::try_from_name\("Closure::fromCallable"\) \{[\s\S]*let closure = answered\(from\.try_call\(vec!\[callable\]\), \|closure\| Some\(closure\.shallow_clone\(\)\)\)\?;\n {4}reflected\("ReflectionFunction", vec!\[&closure\]\)/);
      const reflected = rustFn(lib, 'reflected');
      assert.match(reflected, /let reflection = ClassEntry::try_find\(class\)\?\.new\(\);\n {4}answered\(reflection\.try_call_method\("__construct", args\), \|_made\| Some\(\(\)\)\)\?;/);
      for (const method of ['getNumberOfParameters', 'getNumberOfRequiredParameters', 'isVariadic']) assert.ok(reflected.includes(`answered(reflection.try_call_method("${method}", vec![]), Zval::`), method);
      assert.match(rustFn(lib, 'answered'), /if let Some\(exception\) = ExecutorGlobals::take_exception\(\) \{\n {8}drop\(exception\);\n {8}return None;\n {4}\}\n {4}match called \{/);
      // No field of zend_function is read.
      assert.doesNotMatch(lib, /num_args|required_num_args|zend_function/);
    }
  });

  test(`B2.467: ${target} checks a value of a function type when it enters, and a value that is no function stays invalid_argument_type (GN-6bu, GN-6z)`, () => {
    const lib = text(generated('functions', target), LIB[target]);
    const enters = rustFn(lib, 'kept_function_in');
    assert.match(enters, /given: &\[&str\]\)/);
    const check = {
      node: /BindingError::InvalidArgumentType \{[^\n]*\n {4}\}\n {4}takes_in\(env_, value, subject, "", given\)\?;\n/,
      wasm: /BindingError::InvalidArgumentType \{[^\n]*\n {4}\}\n {4}takes_in\(value, subject, "", given\)\?;\n/,
      python: /BindingError::InvalidArgumentType \{[^\n]*\n {4}\}\n {4}takes_in\(py_, value, subject, "", given\)\?;\n/,
      php: /BindingError::InvalidArgumentType \{[^\n]*\n {4}\}\n {4}takes_in\(\|\| reflected\("ReflectionFunction", vec!\[value\]\), subject, "", given\)\?;\n/,
    }[target];
    assert.match(enters, check);
    // A function type names no argument, so the message gives the types of the contract.
    assert.match(lib, /kept_function_in\((?:env_, |py_, )?&?convert, "apply\(\): convert", &\["text", "list<int>"\]\)/);
    const register = target === 'php' ? 'Registry::register()' : 'Registry.register()';
    assert.ok(lib.includes(`"${register}: convert", &["text", "list<int>"])`), register);
  });

  test(`B2.467: ${target} has no check of a member of a callback unit that is given no argument, and guards one of a member with a default (GN-6bu, GN-6d)`, () => {
    const none = text(generated('sample', target, (contract) => {
      const lookup = contract.units.find((unit: any) => unit.id === 'lookup');
      lookup.members[0].parameters = [];
      contract.cases = contract.cases.filter((row: any) => !/resolve|count|tolerant|first|maybe|seek|ledger/.test(String(row.member)));
    }), LIB[target]);
    assert.doesNotMatch(rustFn(none, 'in_feed'), /"find"/);
    assert.match(rustFn(none, 'in_feed'), /takes_in\([^\n]*"get", &\["key"\]\)\?;/);
    assert.doesNotMatch(rustFn(none, 'in_lookup'), /takes_in/);
    // A member with a default may be left out, and is checked only on an object that has it.
    const optional = rustFn(text(generated('sample', target, (contract) => {
      contract.units.find((unit: any) => unit.id === 'lookup').members[0].default = { literal: null };
    }), LIB[target]), 'in_lookup');
    assert.match(optional, {
      node: /\n {4}if found\.get_type\(\)\.map_err\(internal\)\? == ValueType::Function \{\n {8}takes_in\(env_, found, subject, "find", &\["key"\]\)\?;\n {4}\}\n/,
      wasm: /\n {4}if found\.is_function\(\) \{\n {8}takes_in\(&found, subject, "find", &\["key"\]\)\?;\n {4}\}\n/,
      python: /\n {4}if value\.hasattr\("find"\)\? \{\n {8}takes_in\(py_, &value\.getattr\("find"\)\?, subject, "find", &\["key"\]\)\?;\n {4}\}\n/,
      php: /\n {4}if has_method\(object, "find"\) \{\n {8}takes_in\(\|\| reflected\("ReflectionMethod", vec!\[value, &"find"\]\), subject, "find", &\["key"\]\)\?;\n {4}\}\n/,
    }[target]);
  });
}

test('B2.467: Go has no check of the arguments of a callback, because its types state them (GN-6bu)', () => {
  for (const name of ['sample', 'functions'] as const) {
    const lib = text(generated(name, 'go'), LIB.go);
    assert.notEqual(lib, '');
    assert.doesNotMatch(lib, /takes_in|CallbackArguments/);
    // The variant has the field, which every place of the crate that builds it names.
    for (const built of lib.match(/BindingError::InvalidCallback \{[^}]*\}/g) ?? []) assert.match(built, /arguments: None \}$/);
  }
});

test('B2.467: the generated tests of Node and WASM refuse a callback that names no argument, which is never called, and arm the member where its core has a point (GN-6bu, GN-8a)', () => {
  for (const target of ['node', 'wasm'] as const) {
    const sample = text(generated('sample', target), TESTS[target]);
    const arm = target === 'node' ? 'addon()' : 'stepGlue';
    // A callback unit, on a member whose core holds a fault injection point: the refused call leaves the arming.
    assert.equal(testOf(sample, "test('GN-6bu: resolve refuses a lookup that takes no argument'"), `test('GN-6bu: resolve refuses a lookup that takes no argument', () => {
  const calls = [];
  const armed = ${arm}.__armFaults('sample.resolve', '[{"point":"sample.resolve","kind":"broken"}]');
  assert.throws(() => pkg.resolve({ find: () => { calls.push(1); return null; } }, 'a'), (error) => error.constructor === pkg.SampleTypeError && error.kind === 'invalid_callback' && error.message.includes('(key)'));
  assert.deepEqual(calls, []);
  // GN-8a: the refused call did not reach the core, so the next call takes the arming.
  assert.throws(() => pkg.resolve({ find: (arg0) => null }, 'a'), (error) => error.constructor === pkg.SampleInternalError && error.kind === 'internal');
  assert.deepEqual(${arm}.__faultLeft(armed), []);
});
`);
    // The function of a member with machine, which arms each wait and so has no arming of its entry.
    const machine = testOf(sample, "test('GN-6bu: Store.transaction refuses a work that takes no argument'");
    assert.match(machine, /new pkg\.Store\(\)\.transaction\(\(\) => \{ calls\.push\(1\); return null; \}\)/);
    assert.match(machine, /error\.constructor === pkg\.SampleTypeError && error\.kind === 'invalid_callback' && error\.message\.includes\('\(scope\)'\)\);\n {2}assert\.deepEqual\(calls, \[\]\);\n\}\);/);
    assert.doesNotMatch(machine, /__armFaults/);
    // A value of a function type.
    const functions = text(generated('functions', target), TESTS[target]);
    assert.equal(testOf(functions, "test('GN-6bu: apply refuses a convert that takes no argument'"), `test('GN-6bu: apply refuses a convert that takes no argument', () => {
  const calls = [];
  assert.throws(() => pkg.apply(() => { calls.push(1); return null; }, 'a'), (error) => error.constructor === pkg.FunctionsTypeError && error.kind === 'invalid_callback' && error.message.includes('(text, list<int>)'));
  assert.deepEqual(calls, []);
});
`);
    // JavaScript refuses only too few: no test gives a callback that names more.
    assert.doesNotMatch(`${sample}${functions}`, /requires more/);
  }
});

test('B2.467: the generated tests of Python refuse a callback that takes no argument and one that requires more, with the kind and not with TypeError (GN-6bu, GN-11a)', () => {
  const sample = text(generated('sample', 'python'), TESTS.python);
  assert.equal(testOf(sample, '    def test_gn6bu_resolve_lookup_refuses_what_takes_no_argument(self)'), `    def test_gn6bu_resolve_lookup_refuses_what_takes_no_argument(self) -> None:
        calls: list[int] = []
        armed = _native._arm_faults("sample.resolve", "[{\\"point\\":\\"sample.resolve\\",\\"kind\\":\\"broken\\"}]")
        with self.assertRaises(pkg.SampleTypeError) as caught:
            pkg.resolve(type("Lookup", (), {"find": lambda self: calls.append(1)})(), "a")
        self.assertEqual(caught.exception.kind, "invalid_callback")
        self.assertIsNot(type(caught.exception), TypeError)
        self.assertIn("(key)", str(caught.exception))
        self.assertEqual(calls, [])
        # GN-8a: the refused call did not reach the core, so the next call takes the arming.
        with self.assertRaises(pkg.SampleInternalError) as caught:
            pkg.resolve(type("Lookup", (), {"find": lambda self, *args: None})(), "a")
        self.assertEqual(caught.exception.kind, "internal")
        self.assertEqual(_native._fault_left(armed), [])
`);
  assert.equal(testOf(sample, '    def test_gn6bu_resolve_lookup_refuses_what_requires_more_arguments(self)'), `    def test_gn6bu_resolve_lookup_refuses_what_requires_more_arguments(self) -> None:
        calls: list[int] = []
        with self.assertRaises(pkg.SampleTypeError) as caught:
            pkg.resolve(type("Lookup", (), {"find": lambda self, _arg0, _arg1: calls.append(1)})(), "a")
        self.assertEqual(caught.exception.kind, "invalid_callback")
        self.assertIsNot(type(caught.exception), TypeError)
        self.assertIn("(key)", str(caught.exception))
        self.assertEqual(calls, [])
`);
  const machine = testOf(sample, '    def test_gn6bu_store_transaction_work_refuses_what_takes_no_argument(self)');
  assert.match(machine, /pkg\.Store\(\)\.transaction\(lambda: calls\.append\(1\)\)\n {8}self\.assertEqual\(caught\.exception\.kind, "invalid_callback"\)\n {8}self\.assertIsNot\(type\(caught\.exception\), TypeError\)\n {8}self\.assertIn\("\(scope\)", str\(caught\.exception\)\)\n {8}self\.assertEqual\(calls, \[\]\)\n/);
  assert.doesNotMatch(machine, /_arm_faults/);
  assert.match(testOf(sample, '    def test_gn6bu_store_transaction_work_refuses_what_requires_more_arguments(self)'), /pkg\.Store\(\)\.transaction\(lambda _arg0, _arg1: calls\.append\(1\)\)/);
  const functions = text(generated('functions', 'python'), TESTS.python);
  assert.match(testOf(functions, '    def test_gn6bu_apply_convert_refuses_what_takes_no_argument(self)'), /pkg\.apply\(lambda: calls\.append\(1\), "a"\)\n {8}self\.assertEqual\(caught\.exception\.kind, "invalid_callback"\)\n {8}self\.assertIsNot\(type\(caught\.exception\), TypeError\)\n {8}self\.assertIn\("\(text, list<int>\)", str\(caught\.exception\)\)\n {8}self\.assertEqual\(calls, \[\]\)\n/);
  assert.match(testOf(functions, '    def test_gn6bu_apply_convert_refuses_what_requires_more_arguments(self)'), /pkg\.apply\(lambda _arg0, _arg1, _arg2: calls\.append\(1\), "a"\)/);
});

test('B2.467: the generated tests of PHP refuse a callback that takes no argument and one that requires more, which is never called (GN-6bu, GN-8a)', () => {
  const sample = text(generated('sample', 'php'), TESTS.php);
  assert.equal(testOf(sample, '    public function testGn6buresolveLookupRefusesWhatTakesNoArgument()'), `    public function testGn6buresolveLookupRefusesWhatTakesNoArgument(): void
    {
        $calls = new \\ArrayObject();
        $armed = \\Polyspec\\Sample\\Internal\\armFaults("sample.resolve", "[{\\"point\\":\\"sample.resolve\\",\\"kind\\":\\"broken\\"}]");
        try {
            \\Polyspec\\Sample\\resolve(new class($calls) { public function __construct(private \\ArrayObject $calls) {} public function find(): mixed { $this->calls->append(1); return null; } }, "a");
            self::fail('no error');
        } catch (\\Polyspec\\Sample\\SampleTypeError $error) {
            self::assertSame('invalid_callback', $error->kind());
            self::assertStringContainsString("(key)", $error->getMessage());
        }
        self::assertCount(0, $calls);
        // GN-8a: the refused call did not reach the core, so the next call takes the arming.
        try {
            \\Polyspec\\Sample\\resolve(new class { public function find(mixed ...$args): mixed { return null; } }, "a");
            self::fail('no error');
        } catch (\\Polyspec\\Sample\\SampleInternalError $error) {
            self::assertSame("internal", $error->kind());
        }
        self::assertSame([], \\Polyspec\\Sample\\Internal\\faultLeft($armed));
    }
`);
  const more = testOf(sample, '    public function testGn6buresolveLookupRefusesWhatRequiresMoreArguments()');
  assert.match(more, /public function find\(mixed \$arg0, mixed \$arg1\): mixed \{ \$this->calls->append\(1\); return null; \} \}, "a"\);/);
  assert.match(more, /self::assertSame\('invalid_callback', \$error->kind\(\)\);\n {12}self::assertStringContainsString\("\(key\)", \$error->getMessage\(\)\);\n {8}\}\n {8}self::assertCount\(0, \$calls\);\n {4}\}/);
  const machine = testOf(sample, '    public function testGn6buStoreTransactionWorkRefusesWhatTakesNoArgument()');
  assert.match(machine, /->transaction\(function \(\) use \(\$calls\): mixed \{ \$calls->append\(1\); return null; \}\);/);
  assert.match(machine, /catch \(\\Polyspec\\Sample\\SampleTypeError \$error\) \{\n {12}self::assertSame\('invalid_callback', \$error->kind\(\)\);\n {12}self::assertStringContainsString\("\(scope\)", \$error->getMessage\(\)\);/);
  assert.doesNotMatch(machine, /armFaults/);
  assert.match(testOf(sample, '    public function testGn6buStoreTransactionWorkRefusesWhatRequiresMoreArguments()'), /->transaction\(function \(mixed \$arg0, mixed \$arg1\) use \(\$calls\): mixed \{/);
  const functions = text(generated('functions', 'php'), TESTS.php);
  assert.match(testOf(functions, '    public function testGn6buapplyConvertRefusesWhatTakesNoArgument()'), /\\Polyspec\\Functions\\apply\(function \(\) use \(\$calls\): mixed \{ \$calls->append\(1\); return null; \}, "a"\);[\s\S]*self::assertSame\('invalid_callback', \$error->kind\(\)\);\n {12}self::assertStringContainsString\("\(text, list<int>\)", \$error->getMessage\(\)\);\n {8}\}\n {8}self::assertCount\(0, \$calls\);/);
  assert.match(testOf(functions, '    public function testGn6buapplyConvertRefusesWhatRequiresMoreArguments()'), /apply\(function \(mixed \$arg0, mixed \$arg1, mixed \$arg2\) use \(\$calls\): mixed \{/);
});

test('B2.467: the fixtures of the generated tests of Node and WASM declare the arguments that the binding gives them (GN-6bu)', () => {
  for (const target of ['node', 'wasm'] as const) {
    const sample = text(generated('sample', target), TESTS[target]);
    // The fixture takes each member as its name and the function that declares its arguments.
    assert.match(sample, /\n {2}for \(const \[name, declare\] of members\) \{\n {4}object\[name\] = declare\(\(\.\.\.args\) => \{\n/);
    assert.ok(sample.includes("fixture([['find', (call) => (arg0) => call(arg0)]], [['find', ['a'], null, false, null]])"), target);
    assert.doesNotMatch(sample, /fixture\(\['/);
    // A placeholder callback and a function fixture name their arguments.
    assert.ok(sample.includes("pkg.resolve({ find: (arg0) => null }, '\\uD800')"), target);
    assert.match(sample, /\.transaction\((?:async )?\(arg0\) => \{ arg0\.put\('a', '1'\);/);
    assert.doesNotMatch(sample, /\(\.\.\.args\) => \{ (?!\n)/);
    assert.doesNotMatch(sample, /find: \(\) => (?!\{ calls\.push)/);
    const functions = text(generated('functions', target), TESTS[target]);
    assert.ok(functions.includes("fixture([['call', (call) => (arg0, arg1) => call(arg0, arg1)]], [['call', ['ab c', [2, 1]], 'AB C', false, null]])"), target);
    assert.ok(functions.includes("pkg.apply(((arg0, arg1) => 'a'), '\\uD800')"), target);
    assert.doesNotMatch(functions, /pkg\.apply\(\(\(\) =>/);
  }
});
