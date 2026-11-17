// B2.489 (generator GN-7a, GN-7c, GN-15d): a member that takes a callback unit of another library converts an
// exception of that library's package of a kind that it names in raises into the class of the row, and a contract
// with a callback unit has an internal maker for each of its error classes. The tests read the generated text of the
// whole copies of hyper and session-store under tests/fixtures/consumers, whose sources its README.md names; no Rust
// build is needed.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Lang } from '../src/contract.ts';
import type { Inputs } from '../src/generate/index.ts';
import { generateOnStack } from '../src/generate/stack.ts';

// G-5: an integer of a case file outside the safe integers is read as a bigint from its token, as the command line
// reads it.
const caseInteger = (_key: string, value: unknown, context?: { source?: string }): unknown =>
  typeof value === 'number' && !Number.isSafeInteger(value) && context?.source !== undefined && /^-?(0|[1-9][0-9]*)$/.test(context.source) ? BigInt(context.source) : value;
const consumer = (path: string): any => JSON.parse(readFileSync(new URL(`fixtures/consumers/${path}`, import.meta.url), 'utf8'), caseInteger as (key: string, value: unknown) => unknown);

const HYPER_FOREIGN: Record<string, string> = {
  template: 'template/interface.json',
  json: 'json/interface.json',
  'http-negotiation': 'http-negotiation/interface.json',
  'http-media-type': 'http-media-type/interface.json',
  'http-cookie': 'http-cookie/interface.json',
  'session-store': 'session-store/interface.json',
  'php-serialization': 'php-serialization/interface.json',
};

const inputsOf = (name: string, coreLib: string, foreign: Record<string, string>, change?: (contract: any) => void): Inputs => {
  const contract = consumer(`${name}/interface.json`);
  change?.(contract);
  const files = [...new Set((contract.cases as { file: string }[]).map((row) => row.file))];
  return {
    contract,
    caseFiles: new Map(files.map((file) => [file, consumer(`${name}/${file}`)])),
    foreign: new Map(Object.entries(foreign).map(([library, path]) => [library, consumer(path)])),
    version: '0.0.0',
    coreLib,
  };
};

const made = new Map<string, ReadonlyMap<string, string | Buffer>>();
const hyper = (target: Lang): ReadonlyMap<string, string | Buffer> => {
  const key = `hyper ${target}`;
  const out = made.get(key) ?? generateOnStack({ ...inputsOf('hyper', 'polyspec_hyper', HYPER_FOREIGN), targets: [target] });
  made.set(key, out);
  return out;
};
const sessionStore = (target: Lang): ReadonlyMap<string, string | Buffer> => {
  const key = `session-store ${target}`;
  const out = made.get(key) ?? generateOnStack({ ...inputsOf('session-store', 'polyspec_session_store', { 'php-serialization': 'session-store/php-serialization.json' }), targets: [target] });
  made.set(key, out);
  return out;
};

// The one generated file whose path ends with the suffix and whose text holds the mark.
const fileWith = (out: ReadonlyMap<string, string | Buffer>, suffix: string, mark: string): string => {
  const found = [...out].filter(([path, body]) => path.endsWith(suffix) && String(body).includes(mark));
  assert.equal(found.length, 1, `one generated ${suffix} file holds ${mark}: ${found.map(([path]) => path).join(', ')}`);
  return String(found[0]?.[1]);
};

// The text of a Rust function of the file, from its signature to the closing brace at the start of a line.
const rustFn = (body: string, name: string): string => {
  const found = new RegExp(`fn ${name}[(<]`).exec(body);
  const start = found?.index ?? -1;
  assert.ok(start >= 0, `fn ${name} is generated`);
  const end = body.indexOf('\n}\n', start);
  return body.slice(start, end + 2);
};

test('B2.489: the PHP extension converts an exception of session-store of a kind that the member names into the class of its row (GN-7c)', () => {
  const crate = fileWith(hyper('php'), '.rs', 'fn converted_opening_functions_open_page(');
  const open = rustFn(crate, 'converted_opening_functions_open_page');
  // The table: every row of session-store that open_page names, by its inner kind; record carries offset.
  assert.match(open, /"record" => Some\(\(\d+, "record", &\[\("Polyspec\\\\SessionStore\\\\RecordError", "polyspec_offset", \d+\)\]\)\),/);
  assert.match(open, /"record_write" => Some\(\(\d+, "record_write", &\[\("Polyspec\\\\SessionStore\\\\RecordError", "polyspec_offset", \d+\)\]\)\),/);
  assert.match(open, /"random" => Some\(\(\d+, "random", &\[\]\)\),/);
  assert.match(open, /"io" => Some\(\(\d+, "io", &\[\]\)\),/);
  // The classes of session-store, each with its category class, which declares kind, status and errno.
  assert.match(open, /\("Polyspec\\\\SessionStore\\\\SessionStoreIoError", "Polyspec\\\\SessionStore\\\\SessionStoreIoError"\)/);
  assert.match(open, /\("Polyspec\\\\SessionStore\\\\RecordError", "Polyspec\\\\SessionStore\\\\SessionStore\w+Error"\)/);
  // Every other failure is the failure of failure_error, and every other exception is thrown again.
  assert.match(open, /other => return failure_error\(other\),/);
  assert.match(open, /Some\(Thrown::Php\(exception\)\) => converted_exception\(exception,/);
  // ext-php-rs 0.16.4 binds no zend_exception_set_previous: previous is the private property of the root class.
  assert.doesNotMatch(crate, /zend_exception_set_previous/);
  assert.match(crate, /while let Some\(parent\) = root\.parent\(\) \{\n {8}root = parent;\n {4}\}/);
  assert.match(crate, /with_scope\(root, \|\| object\.set_property\("previous", previous\)\)/);
  // The entry of the member takes its conversion; answer_keep_request has its own table.
  assert.match(crate, /Err\(error\) => return Err\(converted_opening_functions_open_page\(error\)\),/);
  assert.match(crate, /fn converted_opening_functions_answer_keep_request\(/);
});

test('B2.489: the Python extension converts an exception of session-store of a kind that the member names into the class of its row (GN-7c)', () => {
  const crate = fileWith(hyper('python'), '.rs', 'fn converted_opening_functions_open_page(');
  const open = rustFn(crate, 'converted_opening_functions_open_page');
  assert.match(open, /converted_exception\(py_, &exception, "polyspec\.session_store\._errors", &\["SessionStoreValueError", "SessionStoreTypeError", "SessionStoreIoError", "SessionStoreStoreError", "SessionStoreBusyError", "SessionStoreInternalError", "RecordError"\]/);
  assert.match(open, /"record" => Some\(\("RecordError", "record", &\["_offset"\]\)\),/);
  assert.match(open, /"io" => Some\(\("HyperIoError", "io", &\[\]\)\),/);
  assert.match(open, /"random" => Some\(\("HyperIoError", "random", &\[\]\)\),/);
  assert.match(open, /other => return failure_error\(py_, other\),/);
  // An exception of no row is raised again unchanged.
  assert.match(open, /\n    PyErr::from_value\(exception\)\n\}/);
  // The values come from the exception, and the exception is the cause.
  const read = rustFn(crate, 'read_converted');
  assert.match(read, /let status = exception\.getattr\("status"\)\?\.extract::<Option<u16>>\(\)\?;/);
  assert.match(read, /let errno = exception\.getattr\("errno"\)\?\.extract::<Option<i32>>\(\)\?;/);
  assert.match(read, /object\.setattr\(\*property, exception\.getattr\(\*property\)\?\)\?;/);
  assert.match(read, /object\.setattr\("__cause__", exception\)\?;/);
  assert.match(crate, /Err\(error\) => return Err\(converted_opening_functions_open_page\(py_, error\)\),/);
});

test('B2.489: the Go entry of a member converts an error of session-store into the type of its row, made in package binding with its Cause (GN-7c, GN-15d)', () => {
  const out = hyper('go');
  const entry = fileWith(out, '.go', 'func convertedOpenPage(err error) error {');
  assert.match(entry, /\tif err != nil \{\n\t\treturn zero0, convertedOpenPage\(err\)\n\t\}/);
  assert.match(entry, /if found, ok := binding\.FailedOf\[\*sessionstoreerrors\.SessionStoreIoError\]\(err\); ok \{\n\t\tfrom = found\n\t\}/);
  assert.match(entry, /\t\tcase "record":\n\t\t\tunit, ok := binding\.FailedOf\[\*sessionstoreerrors\.RecordError\]\(err\)\n\t\t\tif !ok \{\n\t\t\t\treturn err\n\t\t\t\}\n\t\t\treturn binding\.ConvertedRecordError\(err, from, unit\.Offset\(\)\)/);
  assert.match(entry, /\t\tcase "io":\n\t\t\treturn binding\.ConvertedHyperIoError\(err, from\)/);
  // An error of no row is returned as it is.
  assert.match(entry, /\n\treturn err\n\}/);
  const binding = fileWith(out, 'internal/binding/zz_generated_binding.go', 'func FailedOf[');
  assert.match(binding, /func ConvertedRecordError\(cause error, from Failed, offset \*uint64\) \*RecordError \{\n\tf := failure\{message: from\.Error\(\), kind: from\.Kind\(\), cause: cause\}\n\tf\.status, f\.hasStatus = from\.Status\(\)\n\tf\.errno, f\.hasErrno = from\.Errno\(\)\n\treturn &RecordError\{HyperStoreError: &HyperStoreError\{f\}, pOffset: offset\}\n\}/);
  assert.match(binding, /func \(e \*HyperIoError\) Cause\(\) error \{ return e\.cause \}/);
  assert.match(binding, /\tcause error\n\}/);
});

test('B2.489: a contract with a callback unit has an internal maker of each error class in each target, and one without has none (GN-7a, GN-15d)', () => {
  const python = fileWith(sessionStore('python'), '_errors.py', 'def _polyspec_make(');
  assert.match(python, /def _polyspec_make\(cls: type\[BaseException\], kind: str, message: str, status: int \| None, errno: int \| None, properties: dict\[str, object\]\) -> BaseException:/);
  assert.match(python, /    error = cls\(message, kind, status, errno\)\n/);
  assert.match(python, /        setattr\(error, f"_\{name\}", value\)\n/);
  const php = fileWith(sessionStore('php'), '.rs', 'fn made_error(');
  assert.match(php, /FunctionBuilder::new\("polyspec_make", make_method\)/);
  assert.match(php, /MethodFlags::Public \| MethodFlags::Static,/);
  assert.match(php, /const MADE_PROPERTIES: &\[\(usize, &\[\(&str, usize\)\]\)\] = &\[\n    \(6, &\[\("offset", 6\)\]\),\n\];/);
  // Arg::zval of ext-php-rs 0.16.4 gives Option<&mut &mut Zval>, which the maker clones into the Zval that
  // error_arguments takes (B2.489).
  assert.match(php, /error_arguments\(class, message\.as_ref\(\), kind\.as_ref\(\), status\.as_ref\(\), errno\.as_ref\(\)\)\?/);
  for (const target of ['node', 'wasm'] as const) {
    const out = sessionStore(target);
    const js = fileWith(out, target === 'node' ? 'index.cjs' : '.mjs', "Symbol.for('polyspec.binding.make')");
    assert.match(js, /PROPERTIES\.set\(RecordError, new Set\(\['offset'\]\)\);/);
    assert.match(js, /for \(const made of \[SessionStoreValueError, SessionStoreTypeError, SessionStoreIoError, SessionStoreStoreError, SessionStoreBusyError, SessionStoreInternalError, RecordError\]\) \{/);
    assert.match(js, /const error = new this\(message, kind, status, errno\);/);
  }
  const go = sessionStore('go');
  const binding = fileWith(go, 'internal/binding/zz_generated_binding.go', 'func MakeRecordError(');
  assert.match(binding, /func MakeRecordError\(kind, message string, status, errno \*int, properties \.\.\.RecordErrorProperty\) \(\*RecordError, error\) \{/);
  assert.match(binding, /\tcase "record", "record_write":\n\t\te := &RecordError\{SessionStoreStoreError: &SessionStoreStoreError\{f\}\}/);
  assert.match(binding, /func RecordErrorOffset\(value \*uint64\) RecordErrorProperty \{\n\treturn func\(e \*RecordError\) \{ e\.pOffset = value \}\n\}/);
  assert.match(binding, /func MakeSessionStoreIoError\(kind, message string, status, errno \*int\) \(\*SessionStoreIoError, error\) \{/);
  const errors = fileWith(go, 'errors/zz_generated_errors.go', 'func MakeRecordError(');
  assert.match(errors, /\treturn binding\.MakeRecordError\(kind, message, status, errno, properties\.\.\.\)/);
  assert.match(errors, /type RecordErrorProperty = binding\.RecordErrorProperty/);
  // hyper has no callback unit of its own, so it has no maker.
  assert.ok(![...hyper('python')].some(([, body]) => String(body).includes('_polyspec_make')), 'hyper has no maker');
});

test('B2.489: a row with through converts by the same rule as a row without it (CK-105 (d))', () => {
  const through = generateOnStack({
    ...inputsOf('hyper', 'polyspec_hyper', HYPER_FOREIGN, (c) => {
      for (const row of c.errors.kinds) if (row.library === 'session-store' && !row.variant.endsWith('::Random')) row.through = { unit: 'store', library: 'session-store' };
    }),
    targets: ['php'],
  });
  const crate = (out: ReadonlyMap<string, string | Buffer>): string => rustFn(fileWith(out, '.rs', 'fn converted_opening_functions_open_page('), 'converted_opening_functions_open_page');
  assert.equal(crate(through), crate(hyper('php')));
});

test('B2.489: a raise row with values of a callback unit of another library makes its instance by the maker of that library in each target (CK-22, CK-106, GN-7a)', () => {
  const e2e = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const contract = e2e('consumer/packages/rust/interface.json');
  const files = [...new Set((contract.cases as { file: string }[]).map((row) => row.file))];
  const out = generateOnStack({ contract, caseFiles: new Map(files.map((file) => [file, e2e(`consumer/${file}`)])), foreign: new Map([['sample', e2e('sample/packages/rust/interface.json')]]), version: '0.0.0', coreLib: 'polyspec_consumer' });
  const text = (suffix: string, mark: string): string => fileWith(out, suffix, mark);
  assert.match(text('GeneratedTest.php', 'polyspec_make('), /\\Polyspec\\Sample\\SampleIoError::polyspec_make\("unreadable", "the source could not read a", 7, 5, \[\]\)/);
  assert.match(text('test_generated.py', '_polyspec_make('), /foreign_sample\._errors\._polyspec_make\(foreign_sample\.SampleIoError, "unreadable", "the source could not read a", 7, 5, \{\}\)/);
  for (const suffix of ['ts/generated/tests/generated.test.mjs', 'wasm/generated/tests/generated.test.mjs']) {
    assert.match(text(suffix, "Symbol.for('polyspec.binding.make')]("), /foreign_sample\.SampleIoError\[Symbol\.for\('polyspec\.binding\.make'\)\]\("unreadable", "the source could not read a", 7, 5, \{ {2}\}\)/);
  }
  assert.match(text('zz_generated_test.go', 'MakeSampleIoError('), /sampleerrors\.MakeSampleIoError\("unreadable", "the source could not read a", ptr\(7\), ptr\(5\)\)/);
});

// The text of a refusal of the generator, with the refusals by name that it holds (G-4).
const refusal = (change: (contract: any) => void): string => {
  try {
    generateOnStack({ ...inputsOf('hyper', 'polyspec_hyper', HYPER_FOREIGN, change), targets: ['php'] });
  } catch (error) {
    return `${String(error)} ${JSON.stringify((error as { refusals?: unknown }).refusals ?? [])}`;
  }
  return '';
};

test('B2.489: the generator refuses an inner kind of one library that converts to two classes, and a property that the class of the library does not give (CK-105, CK-107)', () => {
  const twice = 'polyspec_hyper::ErrorCode::Template/polyspec_session_store::Error::Io';
  const two = refusal((c) => {
    c.errors.kinds.push({ variant: twice, library: 'session-store' });
    c.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === 'opening_functions.open_page').raises.push(twice);
  });
  assert.match(two, /the member opening_functions\.open_page names polyspec_hyper::ErrorCode::Sessions\/polyspec_session_store::Error::Io and polyspec_hyper::ErrorCode::Template\/polyspec_session_store::Error::Io of session-store, whose inner kind io converts to two classes \(CK-105\)/);
  const unforwarded = refusal((c) => { c.errors.wrapped = []; });
  assert.match(unforwarded, /the row polyspec_hyper::ErrorCode::Sessions\/polyspec_session_store::Error::Record names record_error with the property offset, which the class of session-store for record does not have \(CK-107\)/);
});

const SESSION_STORE_CLASSES = ['SessionStoreValueError', 'SessionStoreTypeError', 'SessionStoreIoError', 'SessionStoreStoreError', 'SessionStoreBusyError', 'SessionStoreInternalError', 'RecordError'];

test('B2.489: the Node addon converts an exception of session-store where the call throws it, and registers the classes of session-store (GN-7c)', () => {
  const out = hyper('node');
  const crate = fileWith(out, '.rs', 'fn converts_opening_functions_open_page');
  // The member gives the failure of a callback its conversion, which throw runs with the environment.
  const open = rustFn(crate, 'converted_opening_functions_open_page');
  assert.match(open, /let fail = failure_error\(failure\);/);
  assert.match(open, /Fail \{ converts: Some\(converts_opening_functions_open_page\), \.\.fail \}/);
  const converts = rustFn(crate, 'converts_opening_functions_open_page');
  // The classes of session-store follow the 7 classes of hyper, 7 of them.
  assert.match(converts, /converted_from\(env_, value, 7\.\.14, \|kind\| match kind \{/);
  assert.match(converts, /"record" => Some\(\(6, "record", &\["offset"\]\)\),/);
  assert.match(converts, /"io" => Some\(\(2, "io", &\[\]\)\),/);
  assert.match(rustFn(crate, 'throw'), /if let Some\(converts\) = fail\.converts \{\n\s+return converted_thrown\(env_, \*thrown, converts\);/);
  const from = rustFn(crate, 'converted_from');
  assert.match(from, /let status: Option<u32> = object\.get_named_property\("status"\)\?;/);
  assert.match(from, /let errno: Option<i32> = object\.get_named_property\("errno"\)\?;/);
  assert.match(from, /read_only\(&mut converted, name, property\)\?;/);
  assert.match(from, /read_only\(&mut converted, "cause", \*value\)\?;/);
  assert.match(crate, /if classes\.len\(\) != 14 \{/);
  assert.match(crate, /Err\(error\) => return Err\(converted_opening_functions_open_page\(error\)\),|map_err\(converted_opening_functions_open_page\)/);
  const entry = fileWith(out, 'index.cjs', 'addon.__register([');
  assert.match(entry, /const converted_session_store = require\('@polyspec\/session-store'\);/);
  assert.ok(entry.includes(`RecordError, ${SESSION_STORE_CLASSES.map((c) => `converted_session_store.${c}`).join(', ')}]);`), 'the classes of session-store follow those of hyper');
});

test('B2.489: the WASM module converts an exception of session-store into the class of its row with its cause, and registers the classes of session-store (GN-7c)', () => {
  const out = hyper('wasm');
  const crate = fileWith(out, '.rs', 'fn converted_opening_functions_open_page(');
  const open = rustFn(crate, 'converted_opening_functions_open_page');
  assert.match(open, /match read_converted\(&value, 7\.\.14, \|kind\| match kind \{/);
  assert.match(open, /"record" => Some\(\(6, "record", &\["offset"\]\)\),/);
  assert.match(open, /other => return failure_error\(other\),/);
  // An exception of no row is thrown again unchanged.
  assert.match(open, /\n    Fail \{ thrown: Some\(value\), \.\.binding_error\(BindingError::Internal \{ detail: String::new\(\) \}\) \}\n\}/);
  const read = rustFn(crate, 'read_converted');
  assert.match(read, /let status = converted_integer::<u16>\(&Reflect::get\(value, &JsValue::from_str\("status"\)\)\?, "status"\)\?;/);
  assert.match(read, /properties\.push\(\("cause", value\.clone\(\)\)\);/);
  assert.match(crate, /if classes\.len\(\) != 14 \{/);
  const entry = fileWith(out, '.mjs', 'glue.__register([');
  assert.match(entry, /import \* as foreign_session_store from '@polyspec\/session-store\/wasm';/);
  assert.ok(entry.includes(`RecordError, ${SESSION_STORE_CLASSES.map((c) => `foreign_session_store.${c}`).join(', ')}]`), 'the classes of session-store follow those of hyper');
});

// B2.489: the generated test of the case of tests/e2e/consumer whose source raises an unreadable error of sample with
// values compares the cause of the converted error with that error in each target: its class, kind, message, status
// and errno (previous in PHP, __cause__ in Python, cause in Node and WASM, Cause() in Go).
test('B2.489: the generated test of a converted error compares its cause with the error of the library that it converts, in each target', () => {
  const e2e = (path: string): any => JSON.parse(readFileSync(new URL(`../../../tests/e2e/${path}`, import.meta.url), 'utf8'));
  const contract = e2e('consumer/packages/rust/interface.json');
  const files = [...new Set((contract.cases as { file: string }[]).map((row) => row.file))];
  const inputs: Inputs = { contract, caseFiles: new Map(files.map((file) => [file, e2e(`consumer/${file}`)])), foreign: new Map([['sample', e2e('sample/packages/rust/interface.json')]]), version: '0.0.0', coreLib: 'polyspec_consumer' };
  const testOf = (target: Lang, path: string, start: string): string => {
    const text = String(generateOnStack({ ...inputs, targets: [target] }).get(path) ?? '');
    const at = text.indexOf(start);
    assert.ok(at >= 0, `${target}: ${start}`);
    return text.slice(at, text.indexOf('\n\n', at + start.length) < 0 ? undefined : text.indexOf('\n\n', at + start.length));
  };
  const php = testOf('php', 'packages/php-ext/generated/tests/GeneratedTest.php', 'function testB4readAnUnreadableErrorOfTheSampleLibrary');
  assert.match(php, /\$cause = \$error->getPrevious\(\);\n {12}self::assertInstanceOf\(\\Polyspec\\Sample\\SampleIoError::class, \$cause\);\n {12}self::assertSame\(\\Polyspec\\Sample\\SampleIoError::class, \$cause::class\);\n {12}self::assertSame\("unreadable", \$cause->kind\(\)\);\n {12}self::assertSame\("the source could not read a", \$cause->getMessage\(\)\);\n {12}self::assertSame\(7, \$cause->status\(\)\);\n {12}self::assertSame\(5, \$cause->errno\(\)\);/);
  const python = testOf('python', 'packages/python/generated/tests/test_generated.py', 'def test_b4_read_an_unreadable_error_of_the_sample_library');
  assert.match(python, /cause = error\.__cause__\n {8}self\.assertIs\(type\(cause\), foreign_sample\.SampleIoError\)\n {8}self\.assertEqual\(cause\.kind, "unreadable"\)\n {8}self\.assertEqual\(str\(cause\), "the source could not read a"\)\n {8}self\.assertEqual\(cause\.status, 7\)\n {8}self\.assertEqual\(cause\.errno, 5\)/);
  for (const [target, path] of [['node', 'packages/ts/generated/tests/generated.test.mjs'], ['wasm', 'packages/ts/wasm/generated/tests/generated.test.mjs']] as const) {
    const js = testOf(target, path, "test('B-4: read an_unreadable_error_of_the_sample_library");
    assert.match(js, /error\.errno === 5 &&\n {4}error\.cause\?\.constructor === foreign_sample\.SampleIoError &&\n {4}error\.cause\.kind === "unreadable" &&\n {4}error\.cause\.message === "the source could not read a" &&\n {4}error\.cause\.status === 7 &&\n {4}error\.cause\.errno === 5\);/, target);
  }
  const go = testOf('go', 'packages/go/zz_generated_test.go', 'func TestB4ReadAnUnreadableErrorOfTheSampleLibrary');
  assert.match(go, /\tcause, ok := failure\.Cause\(\)\.\(\*sampleerrors\.SampleIoError\)\n\tif !ok \|\| cause\.Kind\(\) != "unreadable" \|\| cause\.Error\(\) != "the source could not read a" \{\n\t\tt\.Fatalf\("B2\.489: the cause of %#v", err\)\n\t\}\n\tif value, ok := cause\.Status\(\); !ok \|\| value != 7 \{\n[^\n]*\n\t\}\n\tif value, ok := cause\.Errno\(\); !ok \|\| value != 5 \{/);
});
