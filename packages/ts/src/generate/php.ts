// The PHP binding (ext-php-rs 0.16): the extension crate, its stub and the generated PHPUnit tests (G-5).

import { type Name, type Type, type Unit, variantPattern } from '../contract.ts';
import { convert } from '../names.ts';
import { defaultAsserts, declaredValue } from './defaults.ts';
import { DRIVEN, cancelsAny, cleanupAsserts, cleanupMade, cleanupWarning, drivenCall, waitsAsync, type Arg, type CallbackUnit, type Fn, type ErrorProperty, type ErrorUnit, errorProperties, type Model, isInternal, interfaceOf, implementorsOf, Unsupported, argType, leftOut, byValue, type ObjectClass, coreCallArgs, aliasKindsRust, aliasesWithKinds, faultRust, armedCall, withFaults, heldNew, heldParam, heldType, langName, libraryOf, lockLines, memberName, resultLet, aliasOf, objectUnit, POISON_ENTRY, recordFn, takesHeld, takesNested, borrowedItem, rustField, rustIdent, rustType, rustVariant, unitOf, usesNative, takesFunction, keepsAny, keptCallbacks, keptModel, nativeRoundTrip, traitParam, keepsThrown, boxed, type Variant, type VariantCase, caseFields, caseRead, caseStruct, caseType, caseUnits, caseValue, caseWritten, implementsClause, UNIT_CASE_ALLOW, tupleIn, narrows, narrowed, tupleOut, propertyValue, errorMatched, recognizedFn, recognizedMatch, unitFn, libraryBlocks, machineFunction, countsThrown } from './model.ts';
import { PHP_NATIVE, aliasPhp, foreignFailurePhp, phpCaseTestEntries, phpHost, phpMaking } from './alias_php.ts';
import { THREAD_THROWN, elsewhereRust } from './alias_shared.ts';
import { phpCaseTests } from './samples.ts';
import { phpTests } from './tests_php.ts';
import { raisesAssertions } from './raises.ts';
import { type Files, header, phpText, rustString, closure, optionRef, usedHelpers, WIDEN, INTO_CORE, PARTS, CORE_FORM } from './text.ts';

const ROOT = 'packages/php-ext/generated';

export interface PhpLayout {
  namespace: string;
  extension: string;
}

export function phpLayout(model: Model): PhpLayout {
  const php = model.contract.packages['php'] as { namespace: string };
  return { namespace: php.namespace, extension: `polyspec_${model.contract.library.replaceAll('-', '_')}` };
}

// P-2: the namespace of a module, `<root>\<Module>` with each segment in PascalCase.
export function phpNamespace(layout: PhpLayout, module: string): string {
  if (module === '') return layout.namespace;
  const segments = module.split('/').map((s) => s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(''));
  return [layout.namespace, ...segments].join('\\');
}

const phpEnumType = (unit: Unit): string => `Php${langName('php', unit.name, 'class')}`;

// GN-10: PHP takes a keyword or a type name as the name of an enum case, but the macro php_enum of ext-php-rs refuses
// them, case-insensitively, also as the name that #[php(name)] gives (validate_php_name of ext-php-rs-derive), so such
// a case takes a trailing _. The words are those that the macro refuses for an enum case.
const PHP_CASE_REFUSED: ReadonlySet<string> = new Set([
  '__halt_compiler', 'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone', 'const',
  'continue', 'declare', 'default', 'die', 'do', 'echo', 'else', 'elseif', 'empty', 'enum', 'enddeclare', 'endfor',
  'endforeach', 'endif', 'endswitch', 'endwhile', 'eval', 'exit', 'extends', 'final', 'finally', 'fn', 'for', 'foreach',
  'function', 'global', 'goto', 'if', 'implements', 'include', 'include_once', 'instanceof', 'insteadof', 'interface',
  'isset', 'list', 'match', 'namespace', 'new', 'or', 'print', 'private', 'protected', 'public', 'readonly', 'require',
  'require_once', 'return', 'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'xor', 'yield',
  '__class__', '__dir__', '__file__', '__function__', '__line__', '__method__', '__namespace__', '__trait__', 'self',
  'parent', 'bool', 'false', 'float', 'int', 'iterable', 'mixed', 'never', 'null', 'object', 'string', 'true', 'void',
]);
const phpCase = (name: Name): string => {
  const plain = langName('php', name, 'class');
  return PHP_CASE_REFUSED.has(plain.toLowerCase()) ? `${plain}_` : plain;
};

// GN-4c: the Rust name of the entry of a function of a functions unit, which no helper of the crate has.
const functionEntry = (fn: Fn): string => `function_${convert(fn.member.name, 'rust', 'variable')}`;

function convertIn(model: Model, type: Type, value: string, subject: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'text_in', latin1: 'latin1_in', bool: 'bool_in', uint: 'uint_in', int: 'int_in', int64: 'int64_in', float: 'float_in', bytes: 'latin1_in', source: 'latin1_in', path: 'path_in', cancel: 'cancel_in' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no PHP input conversion for ${type}`);
    return `${name}(${value}, ${subject})`;
  }
  if ('list' in type) return `list_in(${value}, ${subject}, ${closure(['item'], boxed(model, type.list, convertIn(model, type.list, 'item', subject)))})`;
  if ('map' in type) return `map_in(${value}, ${subject}, ${closure(['item'], convertIn(model, type.map, 'item', subject))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `keyed_map_in(${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`an array whose keys are ${type.key.map((k) => ({ int: 'ints', bytes: 'byte strings', text: 'UTF-8 strings' })[k] ?? k).join(' or ')}`)}, ${closure(['item'], convertIn(model, type.keyed_map, 'item', subject))})`;
  }
  if ('optional' in type) return `optional_in(${value}, ${closure(['value'], boxed(model, type.optional, convertIn(model, type.optional, 'value', subject)))})`;
  if ('function' in type) return functionIn(model, type.function, value, subject);
  if ('tuple' in type) return tupleIn(type.tuple, `tuple_in(${value}, ${subject})`, (part, name) => convertIn(model, part, name, subject));
  const unit = unitOf(model, type);
  // GN-6aa: a callback of a parameter with keeps is held as a Native of its owner thread.
  if (unit?.origin === 'callback' && model.keptCallbacks === true && libraryOf(type) === undefined) return `kept_${rustField(unit.name)}(${value}, ${subject})`;
  if (unit !== undefined && (unit.kind === 'enum' || unit.origin === 'callback' || objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined || interfaceOf(model, type) !== undefined)) return `${unitFn('in', unit, aliasOf(model, type)?.library)}(${value}, ${subject})`;
  if (unit?.kind === 'record' || unit?.kind === 'variant') return `${unitFn('in', unit, libraryOf(type))}(${value}, ${subject})`;
  throw new Unsupported(`no PHP input conversion for ${JSON.stringify(type)}`);
}

// GN-6z, GN-6u: a function holds the PHP Closure as a Native; a call runs on the owner thread, converts the arguments
// out and the result in, and an exception of the PHP code, or a failure of the binding in the call (kind wrong_thread
// on another thread), goes to the core as a Raised.
function functionIn(model: Model, type: { parameters: Type[]; returns: Type }, value: string, subject: string): string {
  const result = type.returns === 'none' ? '()' : rustType(model, type.returns);
  const names = type.parameters.map((_p, i) => `argument_${String(i)}`);
  const params = type.parameters.map((p, i) => `${names[i] ?? ''}: ${traitParam(model, p)}`);
  const outs = type.parameters.map((p, i) => `                    let arg${i}: Zval = ${convertOut(model, p, names[i] ?? '')}.map_err(Thrown::Binding)?;`);
  const returned = type.returns === 'none' ? 'let _returned: Zval = returned;\n                    Ok(())' : `${convertIn(model, type.returns, '&returned', subject.startsWith('"') ? `${subject.slice(0, -1)} returns"` : '"the function returns"').replace(/\?$/, '')}.map_err(Thrown::Binding)`;
  return `kept_function_in(${value}, ${subject}).map(|native| -> ${rustType(model, { function: { ...type, async_allowed: false } })} {
            Box::new(move |${params.join(', ')}| -> Result<${result}, binding_core::Failure<${model.coreError ?? '()'}>> {
                if let Err(error) = native_thread(&native, ${subject}) {
                    return Err(thrown_elsewhere(error));
                }
                let call = || -> Result<${result}, Thrown> {
                    let function = native_object(&native).map_err(Thrown::Binding)?;
${outs.join('\n')}
                    // ext-php-rs reports a call whose code threw as an error and leaves the exception pending, so the exception is
                    // taken before the result is read.
                    let returned = function.try_call(vec![${type.parameters.map((_p, i) => `&arg${i}`).join(', ')}]);
                    if let Some(exception) = ExecutorGlobals::take_exception() {
                        return Err(Thrown::Php(exception));
                    }
                    let returned = returned.map_err(|error| Thrown::Binding(binding_error(BindingError::Internal { detail: error.to_string() })))?;
                    ${returned}
                };
                call().map_err(thrown)
            })
        })`;
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    // T-2 never: the core's Infallible has no value, so the call has failed before.
    if (type === 'never') return `match ${value} {}`;
    if (type === 'none') return 'Ok(Zval::new())';
    const fn: Record<string, string> = { text: 'text_out', latin1: 'bytes_out', bytes: 'bytes_out', bool: 'bool_out', uint: 'uint_out', int: 'int_out', int64: 'int_out', float: 'float_out', path: 'path_out' };
    return `${fn[type]}(${value})`;
  }
  // GN-6ae: a result passthrough leaves the table of the binding as the value that the function returned.
  if ('passthrough' in type) return `passed_out(${value})`;
  if ('list' in type) return `list_out(${value}, ${closure(['item'], convertOut(model, type.list, 'item'))})`;
  // The value of a keyed map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('keyed_map' in type) return `keyed_map_out(${value}, |item| ${convertOut(model, type.keyed_map, 'item')})`;
  if ('map' in type) return `map_out(${value}, |item| ${convertOut(model, type.map, 'item')})`;
  if ('optional' in type) return `optional_out(${optionRef(value)}, ${closure(['value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) {
    return tupleOut(type.tuple, value, (t, name) => convertOut(model, t, name), (parts) => `array_out(vec![${parts.join(', ')}])`);
  }
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `out_${rustField(unit.name)}(${value})`;
  if (unit?.kind === 'record' || unit?.kind === 'variant') return `${unitFn('out', unit, libraryOf(type))}(${value})`;
  if ((objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined) && unit !== undefined) return `${unitFn('out', unit, aliasOf(model, type)?.library)}(${value})`;
  throw new Unsupported(`no PHP output conversion for ${JSON.stringify(type)}`);
}

// G-5: the entry points of the feature fault-test, which arm the faults of a case and report what did not fire.
const FAULT_TEST = (layout: PhpLayout): string => `
/// G-5: arms the faults of a case for the next call of the member from this thread, and gives the id of the arming.
#[cfg(feature = "fault-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\armFaults`)})]
pub fn arm_faults(member: String, faults: String) -> Result<i64, PhpException> {
    guard(|| {
        let id: u64 = binding_core::fault::arm(&member, &faults).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
        i64::try_from(id).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
    })
}

/// G-5: the points of an arming whose fault did not fire.
#[cfg(feature = "fault-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\faultLeft`)})]
pub fn fault_left(id: i64) -> Result<Vec<String>, PhpException> {
    guard(|| {
        let id: u64 = u64::try_from(id).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
        binding_core::fault::left(id).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
    })
}
`;

const PANIC_TEST = (layout: PhpLayout): string => `/// B-7: the entry point of the generated panic test.
#[allow(clippy::panic, reason = "B-7: the entry point of the panic test panics on purpose, which its guard turns into kind internal")]
#[cfg(feature = "panic-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\panicTest`)})]
pub fn panic_test() -> Result<Zval, PhpException> {
    guard(|| panic!("panic-test"))
}

/// GN-8a: the value of an errno symbol on this machine, from the table that arms the faults, which PHP does not have.
#[cfg(feature = "panic-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\errnoOf`)})]
pub fn errno_of(symbol: String) -> Result<i64, PhpException> {
    guard(|| binding_core::errno::value(&symbol).map(i64::from).ok_or_else(|| binding_error(BindingError::Internal { detail: format!("the machine has no errno {symbol}") })))
}
`;

// U-3, GN-6z: the entry point of the generated wrong_thread test: the kind of the failure that a call of the function
// gives on another thread, whose drop of the Native the owner releases at its next entry point.
const THREAD_TEST = (layout: PhpLayout): string => `/// U-3, GN-6z: the entry point of the generated wrong_thread test.
#[cfg(feature = "thread-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\threadTest`)})]
pub fn thread_test(value: &Zval) -> Result<Zval, PhpException> {
    guard(|| {
        let native = kept_function_in(value, "value")?;
        let kind = std::thread::spawn(move || match native_thread(&native, "value") {
            Ok(()) => String::from("none"),
            Err(error) => error.kind().to_owned(),
        })
        .join();
        match kind {
            Ok(kind) => text_out(kind),
            Err(_panic) => Err(binding_error(BindingError::Internal { detail: String::from("U-3: the thread of the test panicked") })),
        }
    })
}
`;

// GN-6ae: the entry point of the generated tests of the cases that call PHP code: the count of what the table of this
// thread keeps, after the keys that a drop on another thread queued are removed.
const THROWN_COUNT = (layout: PhpLayout): string => `/// GN-6ae: the entry point of the generated tests of the cases that call PHP code.
#[cfg(feature = "thrown-count-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\thrownCount`)})]
pub fn thrown_count() -> Result<i64, PhpException> {
    release_dropped();
    let count = THROWN.with_borrow(|map| map.len());
    i64::try_from(count).map_err(|_wide| PhpException::from_message(format!("GN-6ae: the count {count} is beyond an int")))
}
`;

// GN-5: whether the crate has the entry point of thrown-count-test: the contract counts what was thrown, and the crate
// writes the table (failureRust).
const countsThrownPhp = (model: Model): boolean => countsThrown(model.contract, model.foreign) && failureRust(model) !== '';

// GN-6u: the entry point of the generated release test: the count of the Natives that the table of this thread holds.
const NATIVE_COUNT = (layout: PhpLayout): string => `/// GN-6u: the entry point of the generated release test.
#[cfg(feature = "native-count-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\nativeCount`)})]
pub fn native_count() -> Result<i64, PhpException> {
    // A thread without a table holds no reference.
    let count = OWNED.with_borrow(|owned| match owned {
        Some(owned) => owned.values.len(),
        None => 0,
    });
    i64::try_from(count).map_err(|_wide| PhpException::from_message(format!("GN-6u: the count {count} is beyond an int")))
}
`;

const HELPERS = `
fn type_error(subject: &str, expected: &str) -> Fail {
    binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: expected.to_owned() })
}

/// B-3: text is a string whose bytes are UTF-8.
fn text_in(value: &Zval, subject: &str) -> Result<String, Fail> {
    let Some(text) = value.zend_str() else { return Err(type_error(subject, "string")) };
    String::from_utf8(text.as_bytes().to_vec())
        .map_err(|_not_utf8| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::NotUtf8 }))
}

/// T-1 latin1, bytes and source: the bytes of a string; a PHP string is its bytes, which the core judges.
fn latin1_in(value: &Zval, subject: &str) -> Result<Vec<u8>, Fail> {
    match value.zend_str() {
        Some(text) => Ok(text.as_bytes().to_vec()),
        None => Err(type_error(subject, "string")),
    }
}

/// T-1 path, GN-6y: the bytes of a string, as they are, which binding_core judges.
fn path_in(value: &Zval, subject: &str) -> Result<std::path::PathBuf, Fail> {
    binding_core::path_from_bytes(latin1_in(value, subject)?, subject).map_err(binding_error)
}

/// T-1 cancel, GN-6aq: an instance of the class Cancellation of the extension, as the Cancel of a pair whose trigger
/// fires when the instance is cancelled: at once when it was cancelled before the call, and otherwise by its cancel().
fn cancel_in(value: &Zval, subject: &str) -> Result<binding_core::Cancel, Fail> {
    let Some(cancellation) = <&PhpCancellation as FromZval>::from_zval(value) else { return Err(type_error(subject, "Cancellation")) };
    let (trigger, cancel) = binding_core::cancel_pair();
    let mut state = cancellation.state();
    if state.cancelled {
        trigger.cancel();
    } else {
        state.triggers.push(trigger);
    }
    Ok(cancel)
}

/// U-2: an argument that the caller left out is None, whose value the core decides. The engine gives null for a
/// parameter that a call with named arguments skips, so null is an argument that was left out (GN-10).
fn default_in<T>(value: Option<&Zval>, item: impl FnOnce(&Zval) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    match value.filter(|value| !value.is_null()) {
        Some(value) => item(value).map(Some),
        None => Ok(None),
    }
}

fn bool_in(value: &Zval, subject: &str) -> Result<bool, Fail> {
    if value.is_true() {
        return Ok(true);
    }
    if value.is_false() {
        return Ok(false);
    }
    Err(type_error(subject, "bool"))
}

/// B-2, GN-12a: an int (IS_LONG) that is a safe integer for the contract type int; any other value is kind
/// invalid_number.
fn int_in(value: &Zval, subject: &str) -> Result<i64, Fail> {
    match (value.is_long(), value.long()) {
        (true, Some(integer)) if integer.unsigned_abs() <= 9_007_199_254_740_991 => Ok(integer),
        _ => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int })),
    }
}

/// B-2, T-1: an int (IS_LONG) of the range of i64 for the contract type int64.
fn int64_in(value: &Zval, subject: &str) -> Result<i64, Fail> {
    match (value.is_long(), value.long()) {
        (true, Some(integer)) => Ok(integer),
        _ => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int })),
    }
}

/// B-2, GN-12a: an int (IS_LONG) of 0 to 2^53 - 1 for the contract type uint.
fn uint_in(value: &Zval, subject: &str) -> Result<u64, Fail> {
    let invalid = || binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint });
    match (value.is_long(), value.long()) {
        (true, Some(integer @ 0..=9_007_199_254_740_991)) => Ok(integer.unsigned_abs()),
        _ => Err(invalid()),
    }
}

fn float_in(value: &Zval, subject: &str) -> Result<f64, Fail> {
    match (value.is_double(), value.double()) {
        (true, Some(float)) => Ok(float),
        _ => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Float })),
    }
}

/// T-2: a list is an array whose keys are 0 to n-1 in order; another array would lose its keys (P-4).
fn list_in<T>(value: &Zval, subject: &str, item: impl Fn(&Zval) -> Result<T, Fail>) -> Result<Vec<T>, Fail> {
    let Some(array) = value.array() else { return Err(type_error(subject, "list")) };
    if !array.has_sequential_keys() {
        return Err(type_error(subject, "list"));
    }
    array.values().map(item).collect()
}

/// GN-6t: a tuple is a list of exactly its parts.
fn tuple_in<'a, const N: usize>(value: &'a Zval, subject: &str) -> Result<[&'a Zval; N], Fail> {
    let Some(array) = value.array() else { return Err(type_error(subject, "list")) };
    if !array.has_sequential_keys() {
        return Err(type_error(subject, "list"));
    }
    <[&'a Zval; N]>::try_from(array.values().collect::<Vec<&'a Zval>>()).map_err(|_other| type_error(subject, &format!("a list of {N} items")))
}

/// null is the absence; any other value is converted.
fn optional_in<T>(value: &Zval, item: impl FnOnce(&Zval) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    if value.is_null() {
        return Ok(None);
    }
    item(value).map(Some)
}

fn text_out(value: impl AsRef<str>) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_zend_string(ZendStr::new(value.as_ref().as_bytes(), false));
    Ok(zval)
}

/// T-1 latin1 and bytes: a string of the bytes.
fn bytes_out(value: impl AsRef<[u8]>) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_zend_string(ZendStr::new(value.as_ref(), false));
    Ok(zval)
}

/// T-1 path, GN-6y: a string of the bytes of the path.
fn path_out(value: impl AsRef<std::path::Path>) -> Result<Zval, Fail> {
    bytes_out(binding_core::path_bytes(value.as_ref()))
}

fn bool_out(value: impl Borrow<bool>) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_bool(*value.borrow());
    Ok(zval)
}

fn int_out(value: impl WideInt) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_long(value.widen_int());
    Ok(zval)
}

/// B-2: a uint leaves as an int; one above PHP_INT_MAX is kind internal.
fn uint_out(value: impl WideUint) -> Result<Zval, Fail> {
    let value = value.widen_uint();
    match i64::try_from(value) {
        Ok(value) => int_out(value),
        Err(_large) => Err(binding_error(BindingError::Internal { detail: format!("{value} is above PHP_INT_MAX") })),
    }
}

fn float_out(value: impl Borrow<f64>) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_double(*value.borrow());
    Ok(zval)
}

fn array_out(items: Vec<Zval>) -> Result<Zval, Fail> {
    let mut array = ZendHashTable::new();
    for item in items {
        array.push(item).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
    }
    let mut zval = Zval::new();
    zval.set_hashtable(array);
    Ok(zval)
}

/// T-2: an array in its order whose keys are texts. A string key is its UTF-8 text (other bytes are kind invalid_text),
/// and an int key is its decimal text, the inverse of PHP's own conversion of a decimal string key.
fn map_in<T>(value: &Zval, subject: &str, item: impl Fn(&Zval) -> Result<T, Fail>) -> Result<binding_core::OrderedMap<T>, Fail> {
    let Some(array) = value.array() else { return Err(type_error(subject, "array")) };
    let mut map = binding_core::OrderedMap::new();
    let mut entries = array.iter();
    while let Some((key, value)) = entries.next_zval() {
        let key = if let Some(integer) = key.long() {
            integer.to_string()
        } else if let Some(text) = key.zend_str() {
            String::from_utf8(text.as_bytes().to_vec())
                .map_err(|_not_utf8| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::NotUtf8 }))?
        } else {
            return Err(binding_error(BindingError::Internal { detail: String::from("an array key that is neither an int nor a string") }));
        };
        if map.insert(key, item(value)?).is_some() {
            return Err(binding_error(BindingError::Internal { detail: String::from("an array gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a map, owned or borrowed, as an array in its order; PHP makes a decimal text key an int key, which comes back
/// as the same text (map_in).
fn map_out<T>(value: impl Borrow<binding_core::OrderedMap<T>>, item: impl Fn(&T) -> Result<Zval, Fail>) -> Result<Zval, Fail> {
    let mut array = ZendHashTable::new();
    for (key, value) in value.borrow().iter() {
        let before = array.len();
        array.insert(key, item(value)?).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
        if array.len() == before {
            return Err(binding_error(BindingError::Internal { detail: format!("PHP makes two keys of the map one: {key:?}") }));
        }
    }
    let mut zval = Zval::new();
    zval.set_hashtable(array);
    Ok(zval)
}

/// T-2, U-7 (c): an array in its order. An int key is an integer key, or its decimal text when the contract lists text
/// and not integers (PHP makes a decimal string key an int, so an array cannot hold the text); a string key is a text
/// when it is UTF-8 and text is listed, else a byte string when bytes are listed; any other key is kind
/// invalid_argument_type.
fn keyed_map_in<T>(value: &Zval, subject: &str, kinds: &[u8], expected: &str, item: impl Fn(&Zval) -> Result<T, Fail>) -> Result<binding_core::KeyedMap<T>, Fail> {
    let Some(array) = value.array() else { return Err(type_error(subject, expected)) };
    let mut map = binding_core::KeyedMap::new();
    let mut entries = array.iter();
    while let Some((key, value)) = entries.next_zval() {
        let key = if let Some(integer) = key.long() {
            match (kinds.contains(&0), kinds.contains(&2)) {
                // GN-12a: an int key of a listed int is a safe integer, else kind invalid_number.
                (true, _) if integer.unsigned_abs() <= 9_007_199_254_740_991 => binding_core::Key::Int(integer),
                (true, _) => return Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int })),
                (false, true) => binding_core::Key::Text(integer.to_string()),
                (false, false) => return Err(type_error(subject, expected)),
            }
        } else if let Some(text) = key.zend_str() {
            let bytes = text.as_bytes();
            match (std::str::from_utf8(bytes), kinds.contains(&2), kinds.contains(&1)) {
                (Ok(text), true, _) => binding_core::Key::Text(text.to_owned()),
                (_, _, true) => binding_core::Key::Bytes(bytes.to_vec()),
                _ => return Err(type_error(subject, expected)),
            }
        } else {
            return Err(binding_error(BindingError::Internal { detail: String::from("an array key that is neither an int nor a string") }));
        };
        if map.insert(key, item(value)?).is_some() {
            return Err(binding_error(BindingError::Internal { detail: String::from("an array gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a keyed map, owned or borrowed, as an array in its order. PHP makes a decimal text or byte string key an int,
/// so a map whose keys PHP makes one (Int(1) and Text("1")) cannot be an array: kind internal, not a lost entry (P-4).
fn keyed_map_out<T>(value: impl Borrow<binding_core::KeyedMap<T>>, item: impl Fn(&T) -> Result<Zval, Fail>) -> Result<Zval, Fail> {
    let mut array = ZendHashTable::new();
    let failed = |error: ext_php_rs::error::Error| binding_error(BindingError::Internal { detail: error.to_string() });
    for (key, value) in value.borrow().iter() {
        let before = array.len();
        let value = item(value)?;
        match key {
            binding_core::Key::Int(integer) => array.insert(*integer, value).map_err(failed)?,
            binding_core::Key::Text(text) => array.insert(text.as_str(), value).map_err(failed)?,
            binding_core::Key::Bytes(bytes) => match std::str::from_utf8(bytes) {
                Ok(text) => array.insert(text, value).map_err(failed)?,
                Err(_not_utf8) => {
                    let name = ZendStr::new(bytes, false);
                    array.insert(ext_php_rs::types::ArrayKey::ZendString(&name), value).map_err(failed)?;
                }
            },
        }
        if array.len() == before {
            return Err(binding_error(BindingError::Internal { detail: format!("PHP makes two keys of the map one: {key:?}") }));
        }
    }
    let mut zval = Zval::new();
    zval.set_hashtable(array);
    Ok(zval)
}

fn list_out<T>(value: impl IntoIterator<Item = T>, item: impl Fn(T) -> Result<Zval, Fail>) -> Result<Zval, Fail> {
    array_out(value.into_iter().map(item).collect::<Result<Vec<_>, Fail>>()?)
}

fn optional_out<T>(value: Option<T>, item: impl FnOnce(T) -> Result<Zval, Fail>) -> Result<Zval, Fail> {
    match value {
        Some(value) => item(value),
        None => Ok(Zval::new()),
    }
}
`;

function enumRust(layout: PhpLayout, unit: Unit): string {
  const name = rustField(unit.name);
  const core = unit.core_type ?? '';
  const php = phpEnumType(unit);
  const phpName = `${phpNamespace(layout, unit.module)}\\${langName('php', unit.name, 'class')}`;
  const cases = (unit.variants ?? []).map((v) => `    #[php(name = ${rustString(phpCase(v.name))}, value = ${rustString(v.value)})]\n    ${rustVariant(v.name)},`).join('\n');
  const arms = (unit.variants ?? []).map((v) => `        Some(${php}::${rustVariant(v.name)}) => Ok(${core}::${rustVariant(v.name)}),`).join('\n');
  const outArms = (unit.variants ?? []).map((v) => `        ${core}::${rustVariant(v.name)} => ${php}::${rustVariant(v.name)},`).join('\n');
  return `
/// T-6: the backed enum ${phpName}.
#[php_enum]
#[php(name = ${rustString(phpName)})]
pub enum ${php} {
${cases}
}

/// T-6: a value of the enum is one of its cases; any other value is refused.
fn in_${name}(value: &Zval, subject: &str) -> Result<${core}, Fail> {
    match ${php}::from_zval(value) {
${arms}
        None => Err(type_error(subject, ${rustString(phpName)})),
    }
}

/// T-6: a value of the enum leaves as its case.
fn out_${name}(value: impl Borrow<${core}>) -> Result<Zval, Fail> {
    let case = match value.borrow() {
${outArms}
    };
    case.into_zval(false).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
}
`;
}

// T-4: the result form of a record, a final class of public readonly properties whose constructor takes every field by
// name and only holds the values; they are judged when the record enters the core (T-8).
function recordRust(model: Model, layout: PhpLayout, unit: Unit, index: number, library?: string): string {
  const name = recordFn(unit);
  const core = unit.core_type ?? '';
  const fields = unit.fields ?? [];
  const owner = library === undefined ? layout : { ...layout, namespace: (model.foreign.get(library)?.packages['php'] as { namespace: string }).namespace };
  const phpName = `${phpNamespace(owner, unit.module)}\\${langName('php', unit.name, 'class')}`;
  // T-3: the class of another repository's record is registered by that repository's extension, found by its name.
  const entry = library === undefined ? `RECORDS[${index}].get().copied()` : `ClassEntry::try_find(${rustString(phpName)}).map(Class)`;
  const missing = library === undefined ? 'B-4: the record class is not registered' : `T-3: the class ${phpName} is not loaded`;
  const props = fields.map((f) => langName('php', f.name, 'variable'));
  const reads = fields.map((f, i) => `    let ${rustField(f.name)}: ${rustType(model, f.type)} = {
        let field = with_scope(entry, || object.get_property::<&Zval>(${rustString(props[i] ?? '')})).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
        ${convertIn(model, f.type, 'field', 'subject')}?
    };${narrows(f.type) ? `\n    ${narrowed(rustField(f.name), rustString(props[i] ?? ''), 'binding_error')}` : ''}`);
  const writes = fields.map((f, i) => `        object.set_property(${rustString(props[i] ?? '')}, ${convertOut(model, f.type, `${byValue(model, f.type) ? "" : "&"}value.${rustField(f.name)}`)}?)?;`);
  const args = fields.map((_f, i) => `            let mut arg${i} = Arg::new(${rustString(props[i] ?? '')}, DataType::Mixed);`);
  const constructor = recordConstructor(name, fields, props, args);
  return `
/// T-4: a value of the record ${phpName} is an instance of the class itself.
fn in_${name}(value: &Zval, subject: &str) -> Result<${core}, Fail> {
    let Some(Class(entry)) = ${entry} else {
        return Err(binding_error(BindingError::Internal { detail: String::from(${rustString(missing)}) }));
    };
    let Some(object) = value.object().filter(|object| object.instance_of(entry)) else {
        return Err(type_error(subject, ${rustString(phpName)}));
    };
${reads.join('\n')}
    Ok(${core} { ${fields.map((f) => rustField(f.name)).join(', ')} })
}

fn out_${name}(value: impl Borrow<${core}>) -> Result<Zval, Fail> {
    let value = value.borrow();
    let Some(Class(entry)) = ${entry} else {
        return Err(binding_error(BindingError::Internal { detail: String::from(${rustString(missing)}) }));
    };
    let mut object = ZendObject::new(entry);
    let written = with_scope(entry, || -> Result<(), Fail> {
${writes.map((w) => w.replace(')?)?;', ')?).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;')).join('\n')}
        Ok(())
    });
    written?;
    object.into_zval(false).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
}
${library === undefined ? constructor : ''}`;
}

function recordConstructor(name: string, fields: Unit['fields'] & object, props: string[], args: string[]): string {
  // GN-6v: a case without fields takes no argument and holds nothing.
  if (fields.length === 0) {
    return `
ext_php_rs::zend_fastcall! {
    extern fn ${name}_construct(ex: &mut ExecuteData, _retval: &mut Zval) {
        ext_php_rs::zend::run_handler(AssertUnwindSafe(|| {
            let _parsed: Result<(), _> = ex.parser().parse();
        }));
    }
}
`;
  }
  return `
ext_php_rs::zend_fastcall! {
    extern fn ${name}_construct(ex: &mut ExecuteData, _retval: &mut Zval) {
        ext_php_rs::zend::run_handler(AssertUnwindSafe(|| {
${args.join('\n')}
            if ex.parser()${fields.map((_f, i) => `.arg(&mut arg${i})`).join('')}.parse().is_err() {
                return;
            }
            let values = [${fields.map((_f, i) => `arg${i}.zval().map(|zval| zval.shallow_clone())`).join(', ')}];
            let Some(this) = ex.get_self() else { return };
            let class = this.get_class_entry();
            for (name, value) in [${props.map((p) => rustString(p)).join(', ')}].into_iter().zip(values) {
                let Some(value) = value else { return };
                if with_scope(class, || this.set_property(name, value)).is_err() {
                    return;
                }
            }
        }));
    }
}
`;
}

// T-9, GN-6v: the classes of the result form that the extension registers: the records, then the case classes of the
// variants, which implement the interface of their variant.
const phpRecords = (model: Model): Unit[] => [...model.resultRecords, ...caseUnits(model)];

// T-9, GN-6v: a value of a variant is an instance of the final class of one of its cases, whose properties are judged
// as they enter (T-8); a value leaves as an instance of the class of its case, by a match without a wildcard.
function variantRust(model: Model, layout: PhpLayout, variant: Variant): string {
  const name = recordFn(variant.unit);
  const core = variant.unit.core_type ?? '';
  const phpName = `${phpNamespace(layout, variant.unit.module)}\\${langName('php', variant.unit.name, 'class')}`;
  const index = (kase: VariantCase): number => phpRecords(model).indexOf(kase.unit);
  const ins = variant.cases.map((kase) => {
    const fields = caseFields(model, variant, kase);
    const reads = fields.map((f) => `            let ${f.variable}: ${caseType(model, f)} = {
                let field = with_scope(entry, || object.get_property::<&Zval>(${rustString(langName('php', f.field.name, 'variable'))})).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
                ${caseRead(f, `${convertIn(model, f.field.type, 'field', 'subject')}?`)}
            };${f.boxed === undefined && narrows(f.field.type) ? `\n            ${narrowed(f.variable, rustString(langName('php', f.field.name, 'variable')), 'binding_error')}` : ''}`);
    return `    if ${fields.length === 0 ? `case_entry(${index(kase)}, object).is_some()` : `let Some(entry) = case_entry(${index(kase)}, object)`} {
${reads.map((r) => `${r.replace(/^    /gm, '')}\n`).join('')}        return Ok(${caseStruct(variant, kase, fields)});
    }`;
  });
  const arms = variant.cases.map((kase) => {
    const fields = caseFields(model, variant, kase);
    const values = fields.map((f) => `(${rustString(langName('php', f.field.name, 'variable'))}, ${caseWritten(f, convertOut(model, f.field.type, caseValue(model, f)))}?)`);
    return `${fields.length === 0 ? `        ${UNIT_CASE_ALLOW}\n` : ''}        ${caseStruct(variant, kase, fields)} => case_object(${index(kase)}, vec![${values.join(', ')}]),`;
  });
  return `
/// T-9: a value of the variant ${phpName} is an instance of the class of one of its cases; its properties are judged as they enter (T-8).
fn in_${name}(value: &Zval, subject: &str) -> Result<${core}, Fail> {
    let Some(object) = value.object() else {
        return Err(type_error(subject, ${rustString(phpName)}));
    };
${ins.join('\n')}
    Err(type_error(subject, ${rustString(phpName)}))
}

/// T-9: a value of the variant ${phpName} leaves as an instance of the class of its case.
fn out_${name}(value: impl Borrow<${core}>) -> Result<Zval, Fail> {
    match value.borrow() {
${arms.join('\n')}
    }
}
`;
}

// T-9: the class of a case that an object is an instance of, and an instance of the class of a case with the values of
// its properties.
const CASE_OBJECT = `
/// T-9: the class of the case of the index, when the object is an instance of it.
fn case_entry(index: usize, object: &ZendObject) -> Option<&'static ClassEntry> {
    match RECORDS.get(index).and_then(OnceLock::get).copied() {
        Some(Class(entry)) if object.instance_of(entry) => Some(entry),
        _ => None,
    }
}

/// T-9: an instance of the class of a case of a variant, with the values of its properties.
fn case_object(index: usize, properties: Vec<(&str, Zval)>) -> Result<Zval, Fail> {
    let Some(Class(entry)) = RECORDS.get(index).and_then(OnceLock::get).copied() else {
        return Err(binding_error(BindingError::Internal { detail: String::from("B-4: the class of a case is not registered") }));
    };
    let mut object = ZendObject::new(entry);
    with_scope(entry, || -> Result<(), Fail> {
        for (name, value) in properties {
            object.set_property(name, value).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
        }
        Ok(())
    })?;
    object.into_zval(false).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
}
`;

const fieldInit = (field: string, variable: string): string => (field === variable ? field : `${field}: ${variable}`);

// N-4 iterate: the class is an IteratorAggregate whose getIterator gives the items under their positions, or the
// entries under their keys, converted when the iteration starts (a snapshot of the class's value), through the
// extension's Pairs iterator, because a key of an entry may be an object, which no array key is.
function iterateRust(model: Model, fn: Fn): string {
  const yields = fn.yields ?? { value: 'none' };
  const item = (type: Type, value: string): string => `${convertOut(model, type, borrowedItem(model, type, value))}?`;
  const body = yields.key === undefined
    ? `                let position = i64::try_from(position).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
                pairs.push((int_out(position)?, ${item(yields.value, 'item')}));`
    : `                let (key, value) = item;
                pairs.push((${item(yields.key, 'key')}, ${item(yields.value, 'value')}));`;
  return `
    #[php(name = "getIterator")]
    pub fn get_iterator(&self) -> Result<ZBox<ZendClassObject<PhpPairs>>, PhpException> {
        guard(|| {${locks(model, fn).map((l) => `\n    ${l}`).join('')}
            let mut pairs = Vec::new();
            for ${yields.key === undefined ? '(position, item)' : 'item'} in ${armedCall(model, fn, `${fn.corePath}(${coreCallArgs(model, fn, () => '', 'self.inner').join(', ')})`)}${yields.key === undefined ? `${model.faults.length === 0 ? '' : '.into_iter()'}.enumerate()` : ''} {
${body}
            }
            Ok(ZendClassObject::new(PhpPairs { pairs, position: 0 }))
        })
    }
`;
}

// N-4: the interfaces of the language that the special members of a class implement.
function phpImplements(object: ObjectClass, implemented = ''): string {
  const names = [
    ...(implemented === '' ? [] : [implemented.replace(/^ implements /, '')]),
    ...(object.members.some((fn) => fn.kind === 'iterate') ? ['\\IteratorAggregate'] : []),
    ...(object.members.some((fn) => fn.special === 'stringify') ? ['\\Stringable'] : []),
    ...(object.members.some((fn) => fn.special === 'to_json') ? ['\\JsonSerializable'] : []),
  ];
  return names.length === 0 ? '' : ` implements ${names.join(', ')}`;
}

// N-4 iterate: the iterator of the extension over converted pairs, which getIterator gives.
const PAIRS = (layout: PhpLayout): string => `
/// N-4: an iterator over the pairs that a getIterator converted.
#[php_class]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\Pairs`)})]
#[php(flags = ClassFlags::Final)]
#[php(implements(ce = ext_php_rs::zend::ce::iterator, stub = "\\\\Iterator"))]
pub struct PhpPairs {
    pub(crate) pairs: Vec<(Zval, Zval)>,
    pub(crate) position: usize,
}

#[php_impl]
impl PhpPairs {
    pub fn current(&self) -> Zval {
        match self.pairs.get(self.position) {
            Some((_key, value)) => value.shallow_clone(),
            None => Zval::new(),
        }
    }

    pub fn key(&self) -> Zval {
        match self.pairs.get(self.position) {
            Some((key, _value)) => key.shallow_clone(),
            None => Zval::new(),
        }
    }

    pub fn next(&mut self) {
        self.position = self.position.saturating_add(1);
    }

    pub fn rewind(&mut self) {
        self.position = 0;
    }

    pub fn valid(&self) -> bool {
        self.position < self.pairs.len()
    }
}
`;

// T-1 cancel, GN-6aq: the class Cancellation of the namespace of the extension, which a parameter of the type cancel
// takes. It is of the extension's namespace, because the root namespace holds one class of a name for the process and
// two extensions that take a cancel are loaded together.
export const phpCancellationName = (layout: PhpLayout): string => `${layout.namespace}\\Cancellation`;
const CANCELLATION = (layout: PhpLayout): string => `
/// T-1 cancel, GN-6aq: ${phpCancellationName(layout)}, a cancellation that the caller fires by cancel(), once; the
/// triggers of the calls that took it fire then, and a call after it fires its trigger at once.
#[php_class]
#[php(name = ${rustString(phpCancellationName(layout))})]
#[php(flags = ClassFlags::Final)]
pub struct PhpCancellation {
    pub(crate) state: std::sync::Mutex<CancellationState>,
}

/// GN-6aq: whether the cancellation fired, and the triggers of the calls that wait for it.
#[derive(Default)]
pub struct CancellationState {
    pub(crate) cancelled: bool,
    pub(crate) triggers: Vec<binding_core::CancelTrigger>,
}

#[php_impl]
impl PhpCancellation {
    pub fn __construct() -> Self {
        Self { state: std::sync::Mutex::new(CancellationState::default()) }
    }

    /// GN-6aq: fires the triggers; a second call has no further effect.
    pub fn cancel(&self) {
        let triggers = {
            let mut state = self.state();
            state.cancelled = true;
            std::mem::take(&mut state.triggers)
        };
        for trigger in triggers {
            trigger.cancel();
        }
    }

    #[php(name = "isCancelled")]
    pub fn is_cancelled(&self) -> bool {
        self.state().cancelled
    }
}

impl PhpCancellation {
    /// GN-6aq: the state, also after a panic while it was held, because each change of it is whole.
    pub(crate) fn state(&self) -> std::sync::MutexGuard<'_, CancellationState> {
        match self.state.lock() {
            Ok(state) => state,
            Err(poisoned) => poisoned.into_inner(),
        }
    }
}
`;

// GN-6h: the name of a class in the message of kind busy and of a poisoned object.
const classLabel = (object: ObjectClass): string => langName('php', object.unit.name, 'class');

// GN-6h: the lines that take the locks of the places of a call.
const locks = (model: Model, fn: Fn): string[] => lockLines(model, fn, (p) => rustField(p.name), 'self.inner', 'binding_error', classLabel);

const functionRust = (model: Model, layout: PhpLayout, fn: Fn): string => withFaults(model, fn, entryRust(model, layout, fn));

function entryRust(model: Model, layout: PhpLayout, fn: Fn): string {
  if (fn.kind === 'iterate') return iterateRust(model, fn);
  if (fn.special === 'stringify') {
    // N-4: __toString returns a string. The class names no Stringable: PHP adds it to a class that has __toString,
    // and refuses the interface a second time when the class is registered (GN-6g).
    return `
    #[php(name = "__toString")]
    pub fn to_string_form(&self) -> Result<String, PhpException> {
        guard(|| {${locks(model, fn).map((l) => `\n    ${l}`).join('')}
            Ok(${armedCall(model, fn, `${fn.corePath}(${coreCallArgs(model, fn, () => '', 'self.inner').join(', ')})`)})
        })
    }
`;
  }
  const callable = memberName('php', fn);
  const phpName = `${phpNamespace(layout, fn.module)}\\${callable}`;
  const variables = fn.args.map((a) => langName('php', a.name, 'variable'));
  const lines: string[] = [];
  for (const [i, arg] of fn.args.entries()) {
    const variable = variables[i] ?? '';
    const held = arg.field ? undefined : heldParam(model, arg.type);
    // GN-6ae: a function parameter of a member with machine is the closure that the machine calls.
    if (machineFunction(arg.type)) {
      lines.push(...functionClosure(model, arg.type, rustField(arg.name), rustIdent(variable), rustString(variable)));
      continue;
    }
    // GN-6aa: the callbacks of a parameter with keeps are held as Natives.
    const kept = !arg.field && (fn.member.parameters ?? []).some((p) => p.name === arg.name && p.keeps === true);
    const converted = kept ? convertIn(keptModel(model), arg.type, rustIdent(variable), rustString(variable)) : arg.default === undefined ? (arg.field ? boxed(model, arg.type, convertIn(model, arg.type, rustIdent(variable), rustString(variable))) : convertIn(model, arg.type, rustIdent(variable), rustString(variable))) : leftOut(arg, `default_in(${rustIdent(variable)}, ${closure(['value'], convertIn(model, arg.type, 'value', rustString(variable)))})`);
    lines.push(held === undefined
      ? `        let ${rustField(arg.name)}: ${argType(kept ? keptModel(model) : model, arg)} = ${converted}?;`
      : `        let ${rustField(arg.name)} = held_${rustField(held.unit.name)}(${rustIdent(variable)}, ${rustString(variable)})?;`);
    if (held === undefined && (arg.field ? narrows(arg.type) : arg.default === undefined && narrows(arg.type))) lines.push(`        ${narrowed(rustField(arg.name), rustString(variable), 'binding_error')}`);
  }
  if (fn.record !== undefined) {
    const recordType = fn.record.unit.core_type ?? '';
    const recordLet = rustType(model, { unit: fn.record.unit.id });
    const fields = (fn.record.unit.fields ?? []).map((f) => fieldInit(rustField(f.name), rustField(f.name))).join(', ');
    lines.push(`        let ${rustField(fn.record.param.name)}: ${recordLet} = ${recordType} { ${fields} };`);
  }
  lines.push(...locks(model, fn));
  const core = `${fn.corePath}(${coreCallArgs(model, fn, (p) => rustField(p.name), 'self.inner').join(', ')})`;
  // GN-6n: the calling thread blocks on the future of an async member, on the runtime of binding_core.
  const call = waitsAsync(fn) ? drivenCall(model, fn, core, (wait) => wait, 'binding_error') : armedCall(model, fn, core);
  if (fn.fallible) {
    lines.push(`        ${resultLet(fn)} = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(${fn.failure ? 'failure_error' : 'core_error'}(error)),\n        };`);
  } else {
    // E-1c: a core that returns nothing is bound as the unit, so a Result that it returns does not compile.
    lines.push(`        ${resultLet(fn)} = ${call};`);
  }
  // U-2: a parameter that may be left out is an Option, which PHP lets a caller omit.
  const params = variables.map((v, i) => `${rustIdent(v)}: ${fn.args[i]?.default === undefined ? '&Zval' : 'Option<&Zval>'}`);
  if (fn.kind === 'constructor') {
    lines.push(`        Ok(Self { inner: ${heldNew(objectUnit(model, { unit: fn.unit.id }) ?? { unit: fn.unit, members: [], constructible: true }, 'result')} })`);
    return `
    pub fn __construct(${params.join(', ')}) -> Result<Self, PhpException> {
        guard(|| {
${lines.map((l) => `    ${l}`).join('\n')}
        })
    }
`;
  }
  lines.push(`        ${convertOut(model, fn.returns, 'result')}`);
  if (fn.kind === 'function') {
    return `
/// ${phpName} (G-7: PHP counts the arguments and checks their names by the arginfo of these parameters).
#[php_function]
#[php(name = ${rustString(phpName)})]
pub fn ${functionEntry(fn)}(${params.join(', ')}) -> Result<Zval, PhpException> {
    guard(|| {
${lines.join('\n')}
    })
}
`;
  }
  // U-2: a property is a method in PHP (I-3). GN-6: the Rust name of a method is member_<name> and its PHP name an
  // attribute, so that no name of a member meets a naming convention of the lints for methods (from_*, to_*, is_*).
  const self = fn.receiver === undefined ? [] : ['&self'];
  return `
    #[php(name = ${rustString(callable)})]
    pub fn member_${rustField(fn.member.name).replace(/^r#/, '')}(${[...self, ...params].join(', ')}) -> Result<Zval, PhpException> {
        guard(|| {
${lines.map((l) => `    ${l}`).join('\n')}
        })
    }
`;
}

// GN-6ap: a value of a generated interface is an instance of a class that implements it; the core takes the From of
// the value that the instance holds.
function interfaceRust(model: Model, iface: Unit): string {
  const label = langName('php', iface.name, 'class');
  const core = iface.core_type ?? '';
  return `
/// GN-6ap: a value of the interface ${label} is an instance of a class that implements it, whose value the core takes
/// as ${core}.
fn in_${rustField(iface.name)}(value: &Zval, subject: &str) -> Result<${core}, Fail> {
${implementorsOf(model, iface).map((o) => `    if <&entry::Php${langName('php', o.unit.name, 'class')} as FromZval>::from_zval(value).is_some() {
        return in_${rustField(o.unit.name)}(value, subject).map(|held| <${core} as From<&${o.unit.core_type ?? ''}>>::from(&held));
    }
`).join('')}    Err(type_error(subject, ${rustString(label)}))
}
`;
}

// U-3: a callback is a struct that holds the PHP object and implements the core trait; an exception of the PHP code, or
// a failure of the binding in the callback, goes to the core as a Raised that the generated caller throws again.
function callbackRust(model: Model, cb: CallbackUnit): string {
  const name = rustField(cb.unit.name);
  const struct = rustType(model, { unit: cb.unit.id, ...(cb.library === undefined ? {} : { library: cb.library }) });
  const label = langName('php', cb.unit.name, 'class');
  const failure = `binding_core::Failure<${cb.error ?? model.coreError ?? '()'}>`;
  const methods = cb.members.map((m) => {
    const method = langName('php', m.member.name, 'callable');
    const params = m.params.map((p) => `, ${rustField(p.name)}: ${traitParam(model, p.type)}`).join('');
    const result = m.returns === 'none' ? '()' : rustType(model, m.returns);
    const outs = m.params.map((p, i) => `            let arg${i}: Zval = ${convertOut(model, p.type, rustField(p.name))}.map_err(Thrown::Binding)?;`);
    const returned = m.returns === 'none' ? 'Ok(())' : `${convertIn(model, m.returns, '&returned', rustString(`${label}::${method}() returns`)).replace(/\?$/, '')}.map_err(Thrown::Binding)`;
    return `
    fn ${rustField(m.member.name)}(${m.receiver}${params}) -> Result<${result}, ${failure}> {${cb.owner ? `
        if std::thread::current().id() != self.owner {
            return Err(thrown(Thrown::Binding(binding_error(BindingError::WrongThread { subject: String::from(${rustString(`${label}::${method}()`)}) }))));
        }` : ''}
        let call = || -> Result<${result}, Thrown> {
            let Some(object) = self.object.object() else {
                return Err(Thrown::Binding(binding_error(BindingError::Internal { detail: String::from("U-3: the callback is no object") })));
            };
${outs.join('\n')}
            // ext-php-rs reports a call whose code threw as an error and leaves the exception pending, so the exception is
            // taken before the result is read.
            let returned = object.try_call_method(${rustString(method)}, vec![${m.params.map((_p, i) => `&arg${i}`).join(', ')}]);
            if let Some(exception) = ExecutorGlobals::take_exception() {
                return Err(Thrown::Php(exception));
            }
            let returned = returned.map_err(|error| Thrown::Binding(binding_error(BindingError::Internal { detail: error.to_string() })))?;
            ${m.returns === 'none' ? 'let _returned: Zval = returned;\n            Ok(())' : returned}
        };
        call().map_err(${m.recognized === undefined ? 'thrown' : recognizedFn(cb, m)})
    }`;
  }).join('\n');
  const classIndex = (u: ErrorUnit): number => model.classes.length + model.errorUnits.indexOf(u);
  const recognizing = cb.members.filter((m) => m.recognized !== undefined).map((m) => `
/// U-3: an exception of ${m.member.id}: an instance of an error unit that it recognizes, with one of the kinds of that
/// unit, is the core error of the kind (GN-6d); any other exception goes back to the caller as it is.
fn ${recognizedFn(cb, m)}(error: Thrown) -> ${failure} {
    let Thrown::Php(exception) = &error else {
        return thrown(error);
    };
    let core = kind_of_recognized(exception, &[${(m.recognized?.units ?? []).map(classIndex).join(', ')}]).and_then(|(kind, message)| ${recognizedMatch(m, '    ')});
    match core {
        Some(core) => binding_core::Failure::Kind(core),
        None => thrown(error),
    }
}
`).join('');
  const checks = cb.members.map((m) => {
    const method = langName('php', m.member.name, 'callable');
    return `    if !has_method(object, ${rustString(method)}) {
        return Err(binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::from(${rustString(method)}) }));
    }`;
  }).join('\n');
  return `
/// U-3: ${label}, a callback that PHP code implements; the core calls it through ${cb.unit.core ?? ''}.
pub struct ${struct} {
    object: Zval,${cb.owner ? '\n    owner: std::thread::ThreadId,' : ''}
}

/// U-3: a callback object is checked when it enters: each member is a method of its class (kind invalid_callback).
fn in_${name}(value: &Zval, subject: &str) -> Result<${struct}, Fail> {
    let Some(object) = value.object() else {
        return Err(binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::new() }));
    };
${checks}
    Ok(${struct} { object: value.shallow_clone()${cb.owner ? ', owner: std::thread::current().id()' : ''} })
}

impl ${cb.unit.core ?? ''} for ${struct} {${methods}
}
${recognizing}`;
}

// GN-6u, GN-6aa: whether the extension holds Natives: for a value alias, a function type or a callback that the core
// keeps.
const holdsNative = (model: Model): boolean => usesNative(model) || keepsAny(model);

// GN-6aa: a callback of a parameter with keeps, held as a Native of its owner thread, which the core may keep and call
// after the call that gave it. A call on the owner thread borrows the object and calls it as the callback of a call
// does; a call on another thread is kind wrong_thread, and one after the end of the request kind internal, each a Raised
// of its BindingError.
function keptCallbackRust(model: Model, cb: CallbackUnit): string {
  const name = rustField(cb.unit.name);
  const struct = rustType(model, { unit: cb.unit.id });
  const label = langName('php', cb.unit.name, 'class');
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  const methods = cb.members.map((m) => {
    const params = m.params.map((p) => `, ${rustField(p.name)}: ${traitParam(model, p.type)}`).join('');
    const passed = m.params.map((p) => rustField(p.name)).join(', ');
    const result = m.returns === 'none' ? '()' : rustType(model, m.returns);
    const mutable = m.receiver === '&mut self';
    return `
    fn ${rustField(m.member.name)}(${m.receiver}${params}) -> Result<${result}, ${failure}> {
        if let Err(error) = native_thread(&self.native, ${rustString(`${label}::${langName('php', m.member.name, 'callable')}()`)}) {
            return Err(thrown_elsewhere(error));
        }
        let object = native_object(&self.native).map_err(|fail| thrown(Thrown::Binding(fail)))?;
        let ${mutable ? 'mut ' : ''}borrowed = ${struct} { object${cb.owner ? ', owner: std::thread::current().id()' : ''} };
        ${cb.unit.core ?? ''}::${rustField(m.member.name)}(&${mutable ? 'mut ' : ''}borrowed${passed === '' ? '' : `, ${passed}`})
    }`;
  }).join('\n');
  return `
/// GN-6aa: ${label}, held as a Native of its owner thread, which the core keeps after the call that gave it.
pub struct Kept${struct} {
    native: Native,
}

/// GN-6aa: a callback object that the core keeps is checked when it enters, as in_${name} checks it.
fn kept_${name}(value: &Zval, subject: &str) -> Result<Kept${struct}, Fail> {
    let checked = in_${name}(value, subject)?;
    Ok(Kept${struct} { native: php_native(&checked.object)? })
}

impl ${cb.unit.core ?? ''} for Kept${struct} {${methods}
}
`;
}

// U-3, GN-6d: the kind and the message of an exception that is an instance of one of the error classes, for the
// members that recognize error units. Both are read in the scope of the class of the category, which declares kind.
const RECOGNIZED_KIND = `
/// U-3: the kind and the message of an exception that is an instance of one of the library classes (GN-6d).
fn kind_of_recognized(exception: &ZendObject, classes: &[usize]) -> Option<(String, String)> {
    // An exception whose class, kind or message cannot be read is no recognized one; the caller raises it as it was
    // thrown.
    let Ok(found) = read_kind_of_recognized(exception, classes) else {
        return None;
    };
    found
}
/// U-3: what kind_of_recognized gives, or the error of ext-php-rs that reading a property met.
fn read_kind_of_recognized(exception: &ZendObject, classes: &[usize]) -> Result<Option<(String, String)>, ext_php_rs::error::Error> {
    for index in classes {
        let Some(class) = CLASSES.get(*index).and_then(OnceLock::get) else {
            return Ok(None);
        };
        let class = class.0;
        if exception.instance_of(class) {
            let scope = category_scope(class);
            let kind = with_scope(scope, || exception.get_property::<String>("kind"))?;
            let message = with_scope(scope, || exception.get_property::<String>("message"))?;
            return Ok(Some((kind, message)));
        }
    }
    Ok(None)
}
`;

// GN-6ae: the lines that make the closure of a function parameter from a PHP callable. The closure owns a reference to
// the callable; each call makes the PHP value of each argument, a class argument as a new instance of its class, and
// gives what the callable returned as a Passthrough, or its exception as a Raised.
function functionClosure(model: Model, type: Type & { function: unknown }, name: string, value: string, subject: string): string[] {
  const parts = (type as { function: { parameters: Type[] } }).function.parameters;
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  return [
    `        let ${name} = callable_in(${value}, ${subject})?;`,
    `        let ${name} = move |${parts.map((part, i) => `arg${i}: ${rustType(model, part)}`).join(', ')}| -> Result<binding_core::Passthrough, ${failure}> {`,
    '            let call = || -> Result<binding_core::Passthrough, Thrown> {',
    ...parts.map((part, i) => `                let arg${i}: Zval = ${convertOut(model, part, `arg${i}`)}.map_err(Thrown::Binding)?;`),
    `                Ok(pass(called(&${name}, vec![${parts.map((_part, i) => `&arg${i}`).join(', ')}])?))`,
    '            };',
    '            call().map_err(thrown)',
    '        };',
  ];
}

// GN-6ae: whether a member takes a function parameter or returns passthrough.
const passes = (fn: Fn): boolean => fn.params.some((p) => machineFunction(p.type)) || (typeof fn.returns === 'object' && 'passthrough' in fn.returns);

// GN-6ae, B-3: the table of the values that the functions of PHP code returned, each under the handle of its
// Passthrough; the call of a PHP callable; and the check of a callable that enters.
function passingRust(model: Model): string {
  if (![...model.functions, ...model.objects.flatMap((o) => o.members)].some(passes)) return '';
  return `
thread_local! {
    /// GN-6ae, B-3: the values that the functions of PHP code returned, each until its Passthrough ends.
    static PASSED: RefCell<BTreeMap<u64, Zval>> = const { RefCell::new(BTreeMap::new()) };
}

static NEXT_PASSED: AtomicU64 = AtomicU64::new(1);

/// GN-6ae: holds a PHP value in the table, which the core moves and never reads.
fn pass(value: Zval) -> binding_core::Passthrough {
    let handle = NEXT_PASSED.fetch_add(1, Ordering::Relaxed);
    PASSED.with_borrow_mut(|map| map.insert(handle, value));
    binding_core::Passthrough::from_generated(binding_core::Handle::new(handle), release_passed)
}

/// GN-6ae: removes the value of a Passthrough that the core dropped. The value ends after the table is released,
/// because its destructor may run PHP code that enters the binding again; a thread that ends holds no table.
fn release_passed(handle: binding_core::Handle) {
    let gone = PASSED.try_with(|map| map.borrow_mut().remove(&handle.raw()));
    drop(gone);
}

/// GN-6ae: the value of a result passthrough, which leaves the table unchanged.
fn passed_out(value: binding_core::Passthrough) -> Result<Zval, Fail> {
    let handle = value.into_handle();
    PASSED
        .with_borrow_mut(|map| map.remove(&handle.raw()))
        .ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("GN-6ae: the value of the passthrough is gone") }))
}

/// GN-6ae: a function parameter takes a PHP callable (kind invalid_callback), to which the closure keeps a reference.
fn callable_in(value: &Zval, subject: &str) -> Result<Zval, Fail> {
    if !value.is_callable() {
        return Err(binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::new() }));
    }
    Ok(value.shallow_clone())
}

/// GN-6ae: calls a PHP callable; an exception of its code is the Thrown of the call.
fn called(function: &Zval, args: Vec<&dyn ext_php_rs::convert::IntoZvalDyn>) -> Result<Zval, Thrown> {
    let callable = ext_php_rs::types::ZendCallable::new(function).map_err(|error| Thrown::Binding(binding_error(BindingError::Internal { detail: error.to_string() })))?;
    // ext-php-rs reports a call whose code threw as an error and leaves the exception pending, so the exception is
    // taken before the result is read.
    let returned = callable.try_call(args);
    if let Some(exception) = ExecutorGlobals::take_exception() {
        return Err(Thrown::Php(exception));
    }
    let returned = returned.map_err(|error| Thrown::Binding(binding_error(BindingError::Internal { detail: error.to_string() })))?;
    Ok(returned)
}
`;
}

// E-1c, U-3: what a callback threw, kept under the handle of its Raised until the generated caller throws it again; and
// the failure of a core that calls back, as the error of its kind or that exception.
function failureRust(model: Model): string {
  if (!model.functions.some((f) => f.failure) && !model.objects.some((o) => o.members.some((f) => f.failure)) && model.aliases.length === 0) return '';
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  // U-3, GN-6x: an exception of PHP code is kept for a callback or a function type, and for a member of the owner of a
  // value class of another repository, whose exception the call throws again.
  const keepsPhp = keepsThrown(model) || model.aliases.some((a) => a.owner !== undefined);
  return `
/// U-3: an exception of the PHP code, or a failure of the binding in a callback.
enum Thrown {${!keepsPhp ? '' : `
    Php(ZBox<ZendObject>),`}
    Binding(Fail),
}

thread_local! {
    static THROWN: RefCell<BTreeMap<u64, Thrown>> = const { RefCell::new(BTreeMap::new()) };
}

static NEXT_THROWN: AtomicU64 = AtomicU64::new(1);

${THREAD_THROWN}${!keepsThrown(model) ? '' : `
fn thrown<E>(error: Thrown) -> binding_core::Failure<E> {
    binding_core::Failure::Raised(keep_thrown(error))
}
`}
fn failure_error(failure: ${failure}) -> Fail {
    match failure {
        ${model.coreError === undefined ? 'binding_core::Failure::Kind(()) => binding_error(BindingError::Internal { detail: String::from("E-1c: this library names no kind, so no call gives one") })' : 'binding_core::Failure::Kind(error) => core_error(error)'},
        binding_core::Failure::Raised(raised) => match take_thrown(&raised) {
${!keepsPhp ? '' : `            Some(Thrown::Php(exception)) => match exception.into_zval(false) {
                Ok(object) => PhpException::from_message(String::new()).with_object(object),
                Err(error) => binding_error(BindingError::Internal { detail: error.to_string() }),
            },
`}            Some(Thrown::Binding(fail)) => fail,
            None => ${takesFunction(model) || keepsAny(model) ? 'elsewhere(&raised)' : 'binding_error(BindingError::Internal { detail: String::from("U-3: the exception of the callback is gone") })'},
        },
        binding_core::Failure::Callback(error) => binding_error(BindingError::Internal { detail: error.to_string() }),
    }
}
${takesFunction(model) || keepsAny(model) ? elsewhereRust(model) : ''}
/// U-3: whether the class of an object has a method of the name.
fn has_method(object: &ZendObject, name: &str) -> bool {
    let class = object.get_class_entry();
    // SAFETY: the class entry of a live object holds its function table; the lookup copies the name before lowercasing.
    let found = unsafe { ext_php_rs::ffi::zend_hash_str_find_ptr_lc(&raw const class.function_table, name.as_ptr().cast(), name.len()) };
    !found.is_null()
}
`;
}

// T-5: a class unit is a final class of the extension that holds the core value (U-1). Its declaration is in the module
// entry, whose allow covers the expansion of php_class and php_impl.
function objectRust(model: Model, layout: PhpLayout, object: ObjectClass): string {
  const phpName = `${phpNamespace(layout, object.unit.module)}\\${langName('php', object.unit.name, 'class')}`;
  const struct = `Php${langName('php', object.unit.name, 'class')}`;
  return `
/// T-5: ${phpName}${object.constructible ? '' : ', which only its static methods make (U-1 constructible)'}.
#[php_class]
#[php(name = ${rustString(phpName)})]
#[php(flags = ClassFlags::Final)]${(object.unit.implements ?? []).flatMap((ref) => [...model.callbacks.map((c) => c.unit), ...model.interfaces].filter((u) => ref.library === undefined && u.id === ref.unit)).map((u) => `\n#[php(implements(ce = interface_${recordFn(u)}, stub = ${rustString(`\\${phpNamespace(layout, u.module)}\\${langName('php', u.name, 'class')}`)}))]`).join('')}${object.members.some((fn) => fn.kind === 'iterate') ? '\n#[php(implements(ce = ext_php_rs::zend::ce::aggregate, stub = "\\\\IteratorAggregate"))]' : ''}${object.members.some((fn) => fn.special === 'to_json') ? '\n#[php(implements(ce = json_serializable, stub = "\\\\JsonSerializable"))]' : ''}
pub struct ${struct} {
    pub(crate) inner: ${heldType(object)},
}

#[php_impl]
impl ${struct} {${object.members.map((fn) => functionRust(model, layout, fn)).join('')}}
${object.cleanup === undefined ? '' : `
/// GN-6p, B-10: an object freed without its cleanup call warns, and dropping the value releases its resource.
impl Drop for ${struct} {
    fn drop(&mut self) {
        if !self.inner.${cleanupMade(object)}() {
            ext_php_rs::error::php_error(&ext_php_rs::flags::ErrorType::Warning, ${rustString(cleanupWarning(langName('php', object.unit.name, 'class'), memberName('php', object.cleanup)))});
        }
    }
}
`}`;
}

// GN-5, GN-6h: the poison entry point of the B-5c test: a panic while the write guard of the instance is held.
function poisonRust(model: Model, layout: PhpLayout): string {
  const written = model.objects.filter((o) => o.lock?.writes === true);
  if (written.length === 0) return '';
  const arms = written.map((o) => {
    const label = langName('php', o.unit.name, 'class');
    return `        if let Some(instance) = <&Php${label} as ext_php_rs::convert::FromZval>::from_zval(object) {
            let _held = instance.inner.write(${rustString(label)}).map_err(binding_error)?;
            panic!("panic-test");
        }`;
  }).join('\n');
  return `/// B-5c: the entry point of the generated poison test, which panics while it holds the write guard of the instance.
#[allow(clippy::panic, reason = "B-7: the entry point of the panic test panics on purpose, which its guard turns into kind internal")]
#[cfg(feature = "panic-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\${POISON_ENTRY.php}`)})]
pub fn panic_test_held(object: &Zval) -> Result<Zval, PhpException> {
    guard(|| {
${arms}
        Err(binding_error(BindingError::Internal { detail: String::from("B-5c: the object is of no class with a write place") }))
    })
}
`;
}

function objectOut(model: Model, object: ObjectClass): string {
  const struct = `entry::Php${langName('php', object.unit.name, 'class')}`;
  const label = langName('php', object.unit.name, 'class');
  return `
${object.lock?.kind === 'shared' ? `/// GN-6h: calls read the value of ${label} at the same time, so its core type is Sync.
const _: () = {
    const fn sync<T: Sync>() {}
    sync::<${object.unit.core_type ?? ''}>();
};
` : ''}
${takesNested(model, object) ? `/// T-5, GN-6h: a value of the class ${label} inside another type is an instance of it, whose value is read, cloned and
/// released.
fn in_${rustField(object.unit.name)}(value: &Zval, subject: &str) -> Result<${object.unit.core_type ?? ''}, Fail> {
    match <&${struct} as FromZval>::from_zval(value) {
        Some(object) => match object.inner.read(${rustString(label)}, &[]) {
            Ok(held) => Ok((*held).clone()),
            Err(error) => Err(binding_error(error)),
        },
        None => Err(type_error(subject, ${rustString(label)})),
    }
}
` : ''}${takesHeld(model, object) ? `
/// T-5, GN-6h: a parameter of the class ${label} takes an instance of it, whose lock the call takes.
fn held_${rustField(object.unit.name)}(value: &Zval, subject: &str) -> Result<${heldType(object)}, Fail> {
    match <&${struct} as FromZval>::from_zval(value) {
        Some(object) => Ok(object.inner.clone()),
        None => Err(type_error(subject, ${rustString(label)})),
    }
}
` : ''}
fn out_${rustField(object.unit.name)}(value: impl CoreForm<${object.unit.core_type ?? ''}>) -> Result<Zval, Fail> {
    ZendClassObject::new(${struct} { inner: ${heldNew(object, 'value.core_form()')} })
        .into_zval(false)
        .map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
}
`;
}

function libRust(model: Model, layout: PhpLayout): string {
  const constants = model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n') + defaultAsserts(model);
  const iterates = model.objects.some((o) => o.members.some((fn) => fn.kind === 'iterate'));
  const functions = model.functions.map((fn) => functionRust(model, layout, fn)).join('') + model.objects.map((o) => objectRust(model, layout, o)).join('') + (iterates ? PAIRS(layout) : '') + (cancelsAny(model) ? CANCELLATION(layout) : '');
  const enums = [
    ...model.enums.map((u) => enumRust(layout, u)),
    ...model.resultRecords.map((u, i) => recordRust(model, layout, u, i)),
    ...model.variants.map((v) => variantRust(model, layout, v)),
    model.variants.length > 0 ? CASE_OBJECT : '',
    // GN-6v: the constructor of the class of each case, which holds the values as a record's does.
    ...caseUnits(model).map((u) => {
      const props = (u.fields ?? []).map((f) => langName('php', f.name, 'variable'));
      return recordConstructor(recordFn(u), u.fields ?? [], props, props.map((p, i) => `            let mut arg${i} = Arg::new(${rustString(p)}, DataType::Mixed);`));
    }),
    ...model.objects.map((object) => objectOut(model, object)),
    ...[...model.callbacks, ...model.foreignCallbacks].map((c) => callbackRust(model, c)),
    ...keptCallbacks(model).map((c) => keptCallbackRust(model, c)),
    ...model.interfaces.map((i) => interfaceRust(model, i)),
    model.callbacks.some((c) => c.members.some((m) => m.recognized !== undefined)) ? RECOGNIZED_KIND : '',
    failureRust(model),
    passingRust(model),
    foreignFailurePhp(model),
    ...model.aliases.filter((a) => a.library === undefined).map((a) => aliasPhp(model, a)),
    model.aliases.length > 0 ? `${phpHost(model)}${phpMaking(model)}` : '',
    holdsNative(model) ? PHP_NATIVE : '',
  ].join('\n');
  // I-3: the conversions of the properties of the error units count as uses.
  const propertyUses = model.errorUnits.flatMap((u) => u.properties.map((p) => convertOut(model, p.returns, 'value'))).join('\n');
  const used = usedHelpers(`${HELPERS}\n${WIDEN}\n${INTO_CORE}\n${PARTS}\n${CORE_FORM}\n${DRIVEN}\n${enums}`, `${functions}${propertyUses}`, {},
    libraryBlocks(model, (unit, library) => recordRust(model, layout, unit, -1, library), (a) => aliasPhp(model, a)));
  const classOf = (category: string): string => `${model.classes.findIndex((c) => c.category === category)}`;
  // E-2, I-3: an error unit is a class after the classes of the categories, in the order of model.errorUnits.
  const unitIndex = (unit: ErrorUnit): number => model.classes.length + model.errorUnits.indexOf(unit);
  const unitPhpName = (unit: ErrorUnit): string => `${phpNamespace(layout, unit.unit.module)}\\${langName('php', unit.unit.name, 'class')}`;
  const parentIndex = (unit: ErrorUnit): number => (unit.parent === undefined ? model.classes.findIndex((c) => c.category === unit.category) : unitIndex(unit.parent));
  const parentPhpName = (unit: ErrorUnit): string =>
    unit.parent === undefined ? `${layout.namespace}\\${model.classes.find((c) => c.category === unit.category)?.name ?? ''}` : unitPhpName(unit.parent);
  const propertyHandler = (unit: ErrorUnit, property: ErrorProperty): string => `${rustField(unit.unit.name)}_${rustField(property.member.name)}_method`;
  // Units without a property write and read none, so the helpers of the properties are left out (dead code fails
  // the build).
  const withProperties = model.errorUnits.some((u) => errorProperties(u).length > 0);
  const unitProperties = model.errorUnits.length === 0 ? '' : `${model.errorUnits.filter((u) => errorProperties(u).length > 0).map((u) => `
/// I-3: the properties of ${unitPhpName(u)}, read from the core error. Each is written in the scope of the class that
/// declares it.
fn ${rustField(u.unit.name)}_properties(object: &mut ZendObject, error: &${model.coreError ?? '()'}) -> Result<(), Fail> {
${errorProperties(u).map(({ owner, property }) => {
    const name = langName('php', property.member.name, 'variable');
    return `    let value = ${propertyValue(property, 'error', (failure) => `Err(core_error(${failure}))`)};
    let property = ${convertOut(model, property.returns, 'value')}?;
    if let Err(error) = with_scope(registered_class(${unitIndex(owner)}), || object.set_property(${rustString(name)}, property)) {
        return Err(PhpException::from_message(format!("B-4: the property ${name} could not be written: {error}")));
    }`;
  }).join('\n')}
    Ok(())
}
`).join('')}${model.errorUnits.flatMap((u) => u.properties.map((property) => `
ext_php_rs::zend_fastcall! {
    extern fn ${propertyHandler(u, property)}(ex: &mut ExecuteData, retval: &mut Zval) {
        ext_php_rs::zend::run_handler(AssertUnwindSafe(|| read_unit_property(ex, retval, ${unitIndex(u)}, ${rustString(langName('php', property.member.name, 'variable'))})));
    }
}
`)).join('')}${!withProperties ? '' : `
/// I-3: a property of an error unit, read in the scope of the class that declares it.
fn read_unit_property(ex: &mut ExecuteData, retval: &mut Zval, class: usize, name: &str) {
    let Some(this) = ex.get_self() else { return };
    if let Ok(value) = with_scope(registered_class(class), || this.get_property::<&Zval>(name)) {
        *retval = value.shallow_clone();
    }
}
`}
/// A library class that is registered already: the parent of an error unit and the scope of its properties. Startup
/// registers every library class or fails the start of the module, so the engine's Exception stands only for a class
/// that was not registered, which no call and no registration meets.
fn registered_class(index: usize) -> &'static ClassEntry {
    match CLASSES.get(index).and_then(OnceLock::get) {
        Some(Class(class)) => class,
        None => ext_php_rs::zend::ce::exception(),
    }
}
${[...new Set(model.errorUnits.map(parentIndex))].map((i) => `
fn registered_class_${i}() -> &'static ClassEntry {
    registered_class(${i})
}
`).join('')}
/// E-2: the class of a category that a library class is or extends, which declares kind, status and errno.
fn category_scope(class: &ClassEntry) -> &ClassEntry {
    let mut scope = class;
    loop {
        if CLASSES.iter().take(${model.classes.length}).filter_map(OnceLock::get).any(|category| std::ptr::eq(category.0, scope)) {
            return scope;
        }
        match scope.parent() {
            Some(parent) => scope = parent,
            None => return class,
        }
    }
}
`;
  const propertyType = (type: Type): string => {
    if (typeof type === 'object' && 'list' in type) return 'Array';
    const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
    return ({ bool: 'Bool', int: 'Long', int64: 'Long', uint: 'Long', float: 'Double' } as Record<string, string>)[String(base)] ?? 'String';
  };
  const registerUnits = model.errorUnits.map((u) => `
    let registered = ClassBuilder::new(${rustString(unitPhpName(u))})
        .extends((registered_class_${parentIndex(u)}, ${rustString(`\\${parentPhpName(u)}`)}))${u.unit.final === true ? '\n        .flags(ClassFlags::Final)' : ''}${u.properties.map((p) => `
        .property(private_property(${rustString(langName('php', p.member.name, 'variable'))}))
        .method(FunctionBuilder::new(${rustString(langName('php', p.member.name, 'callable'))}, ${propertyHandler(u, p)}).returns(DataType::${propertyType(p.returns)}, false, true), MethodFlags::Public)`).join('')}
        .registration(|class, tables| {
            remember(${unitIndex(u)}, class);
            std::mem::forget(tables);
        })
        .register();
    if registered.is_err() {
        return 1;
    }`).join('');
  const scopeOf = (entry: string): string => (model.errorUnits.length === 0 ? entry : `category_scope(${entry})`);
  const coreError = model.coreError === undefined ? '' : `
/// I-2 (3): the class of each variant of the core error, by a match without a wildcard. The pattern \`{ .. }\` matches a
/// variant with or without data, which the generator does not see (I-2: binding reads no Rust source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn core_error(error: ${model.coreError}) -> Fail {
    let class: usize = match ${errorMatched(model, 'error')} {
${model.kinds.map((k) => `        ${variantPattern(k.variant)} => ${k.unit === undefined ? classOf(k.category) : unitIndex(k.unit)},`).join('\n')}
    };
${!withProperties ? `    library_error(class, &error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))` : `    let mut object = match error_object(class, &error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error)) {
        Ok(object) => object,
        Err(fail) => return fail,
    };
    let written = match ${errorMatched(model, 'error')} {
${model.kinds.map((k) => `        ${variantPattern(k.variant)} => ${k.unit === undefined || errorProperties(k.unit).length === 0 ? 'Ok(())' : `${rustField(k.unit.unit.name)}_properties(&mut object, &error)`},`).join('\n')}
    };
    match written {
        Ok(()) => error_exception(object, Kinds::kind(&error)),
        Err(fail) => fail,
    }`}
}
${unitProperties}`;
  const registerClasses = model.classes.map((c, i) => `
    let registered = ClassBuilder::new(${rustString(`${layout.namespace}\\${c.name}`)})
        .extends((${phpBaseFn(c.category)}, ${rustString(`\\${phpBase(c.category)}`)}))
        .property(private_property("kind"))
        .property(private_property("status"))
        .property(private_property("errno"))
        .method(
            FunctionBuilder::new("__construct", error_construct)
                .arg(Arg::new("message", DataType::String))
                .arg(Arg::new("kind", DataType::String))
                .not_required()
                .arg(Arg::new("status", DataType::Long).allow_null().default("null"))
                .arg(Arg::new("errno", DataType::Long).allow_null().default("null")),
            MethodFlags::Public,
        )
        .method(FunctionBuilder::new("kind", kind_method).returns(DataType::String, false, false), MethodFlags::Public)
        .method(FunctionBuilder::new("status", status_method).returns(DataType::Long, false, true), MethodFlags::Public)
        .method(FunctionBuilder::new("errno", errno_method).returns(DataType::Long, false, true), MethodFlags::Public)
        .registration(|class, tables| {
            remember(${i}, class);
            std::mem::forget(tables);
        })
        .register();
    if registered.is_err() {
        return 1;
    }`).join('');
  // U-3: a callback interface is a PHP interface of the extension, which PHP code implements (or not: the extension
  // checks the methods of the object it receives).
  // GN-6ap: a generated interface is an interface of the extension without a method, which its classes implement.
  const registerInterfaces = [...model.callbacks, ...model.interfaces.map((unit) => ({ unit, members: [] as CallbackUnit['members'] }))].map((cb) => {
    const phpName = `${phpNamespace(layout, cb.unit.module)}\\${langName('php', cb.unit.name, 'class')}`;
    const methods = cb.members.map((m) => `
        .method(
            FunctionBuilder::new_abstract(${rustString(langName('php', m.member.name, 'callable'))})${m.params.map((p) => `\n                .arg(Arg::new(${rustString(langName('php', p.name, 'variable'))}, DataType::Mixed))`).join('')}
                .returns(DataType::Mixed, false, true),
            MethodFlags::Public | MethodFlags::Abstract,
        )`).join('');
    return `
    if ClassBuilder::new(${rustString(phpName)})
        .flags(ClassFlags::Interface)${methods}
        .registration(|_class, tables| std::mem::forget(tables))
        .register()
        .is_err()
    {
        return 1;
    }`;
  }).join('');
  // T-9, GN-6v: the interface of a variant, which the classes of its cases implement, is registered before them.
  const variantName = (unit: Unit): string => `${phpNamespace(layout, unit.module)}\\${langName('php', unit.name, 'class')}`;
  // GN-6v, GN-6w: the interfaces of the extension that a class of the extension implements: the variants, and the
  // callbacks that a class implements.
  const ownInterfaces = [...model.variants.map((v) => v.unit), ...model.objects.flatMap((o) => (o.unit.implements ?? []).flatMap((ref) => [...model.callbacks.map((c) => c.unit), ...model.interfaces].filter((u) => ref.library === undefined && u.id === ref.unit)))].filter((u, i, all) => all.indexOf(u) === i);
  // B-4: an interface that startup registered and does not find fails the start, as a missing class of PHP does.
  const found = (units: Unit[]): string => units.map((u) => `
    if builtin_class(${rustString(variantName(u))}).is_none() {
        return 1;
    }`).join('');
  const registerVariants = model.variants.map((v) => `
    if ClassBuilder::new(${rustString(variantName(v.unit))})
        .flags(ClassFlags::Interface)
        .registration(|_class, tables| std::mem::forget(tables))
        .register()
        .is_err()
    {
        return 1;
    }`).join('');
  const caseOf = (u: Unit): Variant | undefined => model.variants.find((v) => v.cases.some((c) => c.unit === u));
  const registerRecords = phpRecords(model).map((u, i) => {
    const phpName = `${phpNamespace(layout, u.module)}\\${langName('php', u.name, 'class')}`;
    const fields = u.fields ?? [];
    const variant = caseOf(u);
    return `
    let registered = ClassBuilder::new(${rustString(phpName)})
        .flags(ClassFlags::Final)${variant === undefined ? '' : `\n        .implements((variant_${recordFn(variant.unit)}, ${rustString(`\\${variantName(variant.unit)}`)}))`}
${fields.map((f) => `        .property(record_property(${rustString(langName('php', f.name, 'variable'))}))`).join('\n')}
        .method(
            FunctionBuilder::new("__construct", ${rustField(u.name)}_construct)${fields.map((f) => `\n                .arg(Arg::new(${rustString(langName('php', f.name, 'variable'))}, DataType::Mixed))`).join('')},
            MethodFlags::Public,
        )
        .registration(|class, tables| {
            let _first: Result<(), Class> = RECORDS[${i}].set(Class(class));
            std::mem::forget(tables);
        })
        .register();
    if registered.is_err() {
        return 1;
    }`;
  }).join('');
  // GN-3g: the module header names the module layout.extension, the extension-name of composer.json, before these
  // lines; #[php_module] of ext-php-rs names it after the crate.
  const register = [
    ...model.enums.map((u) => `        .enumeration::<${phpEnumType(u)}>()`),
    ...model.functions.map((fn) => `        .function(wrap_function!(${functionEntry(fn)}))`),
    // N-4: the iterator is registered before the classes whose getIterator names it as its return type.
    ...(iterates ? ['        .class::<PhpPairs>()'] : []),
    ...model.objects.map((o) => `        .class::<Php${langName('php', o.unit.name, 'class')}>()`),
    ...(cancelsAny(model) ? ['        .class::<PhpCancellation>()'] : []),
    ...model.constants.map((c) => `        .constant((${rustString(`${phpNamespace(layout, c.module)}\\${langName('php', c.member.name, 'constant')}`)}, ${String(c.member.value)}_i64, &[]))`),
  ];
  // GN-13: the case-test entry points of the cases whose value has no PHP form.
  const caseTests = phpCaseTestEntries(model, phpCaseTests(model), layout.namespace);
  const bases = [...new Set(model.classes.map((c) => c.category))].map((category) => phpBaseFn(category));
  // B-4: the classes of PHP that the library classes extend or implement, found by startup before any registration.
  const jsonHook = model.objects.some((o) => o.members.some((fn) => fn.special === 'to_json'));
  const builtins = [...new Set(model.classes.map((c) => phpBase(c.category))), ...(jsonHook ? ['JsonSerializable'] : [])];
  const baseFns = [...new Set(bases)].map((fnName) => {
    const category = model.classes.find((c) => phpBaseFn(c.category) === fnName)?.category ?? 'value';
    return `fn ${fnName}() -> &'static ClassEntry {\n    builtin(${builtins.indexOf(phpBase(category))}, ext_php_rs::zend::ce::exception)\n}\n`;
  }).join('\n');
  return `${header('//')}
// The extension ${layout.extension}. Its functions take the raw values and judge them (T-8); PHP counts the arguments
// and checks their names (G-7); a failure is an instance of its library class (B-4).

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
${holdsNative(model) && model.aliases.length === 0 ? 'use binding_core::{Native, NativeObject};\n' : ''}${model.aliases.length > 0 ? `use binding_core::{Handle, HostText, HostValue, HostValues, Native, NativeObject, OutValue, OutValues${/\bPredicate::/.test(used) ? ', Predicate' : ''}${/\bValueKind::/.test(used) ? ', ValueKind' : ''}};\n` : ''}use ext_php_rs::args::Arg;
use ext_php_rs::builders::{ClassBuilder, ClassProperty, FunctionBuilder};
use ext_php_rs::boxed::ZBox;
use ext_php_rs::convert::IntoZval;${model.enums.length > 0 || /\bFromZval>::from_zval\b/.test(used) ? '\nuse ext_php_rs::convert::FromZval;' : ''}
use ext_php_rs::exception::PhpException;
use ext_php_rs::flags::{${model.resultRecords.length > 0 || model.objects.length > 0 || model.callbacks.length > 0 || model.variants.length > 0 || model.interfaces.length > 0 || cancelsAny(model) || model.errorUnits.some((u) => u.unit.final === true) ? 'ClassFlags, ' : ''}DataType, MethodFlags, PropertyFlags};
use ext_php_rs::prelude::*;
use ext_php_rs::types::{${['ZendClassObject', 'ZendHashTable', 'ZendObject', 'ZendStr'].filter((t) => t === 'ZendObject' || new RegExp(`\\b${t}\\b`).test(used)).join(', ')}, Zval};
use ext_php_rs::zend::{ClassEntry, ExecuteData, ExecutorGlobals};
${/Borrow</.test(used) ? 'use std::borrow::Borrow;\n' : ''}${/\bBTreeSet\b/.test(used) ? 'use std::collections::BTreeSet;\n' : ''}use std::panic::{catch_unwind, AssertUnwindSafe};
${/\bTHROWN\b/.test(used) ? 'use std::cell::RefCell;\nuse std::collections::BTreeMap;\nuse std::sync::atomic::{AtomicU64, Ordering};\n' : ''}use std::sync::${holdsNative(model) || /\bTHROWN\b/.test(used) ? '{Mutex, OnceLock}' : 'OnceLock'};

// U-5: the constants of the contract are the constants of the core.
${constants}

/// A class entry that the engine owns for the life of the process.
#[derive(Clone, Copy)]
struct Class(&'static ClassEntry);

// SAFETY: a class entry is written once at module startup and only read afterwards, as the engine does.
unsafe impl Send for Class {}
unsafe impl Sync for Class {}

/// The library classes of the categories (E-2), in the order of the contract.
static CLASSES: [OnceLock<Class>; ${model.classes.length + model.errorUnits.length}] = [${[...model.classes, ...model.errorUnits].map(() => 'const { OnceLock::new() }').join(', ')}];
${phpRecords(model).length > 0 ? `
/// The classes of the result form of the records (T-4) and of the cases of the variants (T-9), in the order of the contract.
static RECORDS: [OnceLock<Class>; ${phpRecords(model).length}] = [${phpRecords(model).map(() => 'const { OnceLock::new() }').join(', ')}];

fn record_property(name: &str) -> ClassProperty {
    ClassProperty {
        name: name.into(),
        flags: PropertyFlags::Public,
        default: None,
        docs: &[],
        ty: Some(DataType::Mixed),
        nullable: true,
        readonly: true,
        default_stub: None,
    }
}
` : ''}

fn remember(index: usize, class: &'static ClassEntry) {
    if let Some(slot) = CLASSES.get(index) {
        let _first: Result<(), Class> = slot.set(Class(class));
    }
}

${ownInterfaces.map((u) => `
/// ${u.kind === 'variant' ? 'T-9: the interface of the variant, which the classes of its cases implement' : u.origin === 'generated' ? 'GN-6ap: the generated interface, which the classes of the extension that it names implement' : 'GN-6w: the interface of the callback, which a class of the extension implements'}.
fn ${u.kind === 'variant' ? 'variant' : 'interface'}_${recordFn(u)}() -> &'static ClassEntry {
    own_interface(${rustString(`${phpNamespace(layout, u.module)}\\${langName('php', u.name, 'class')}`)})
}
`).join('')}${ownInterfaces.length === 0 ? '' : `
/// GN-6v, GN-6w: an interface that startup registered, found in the engine's class table. startup fails the start when
/// it does not find one, before a class that implements it is registered, so the engine's class that stands for a
/// missing one is taken by no registration.
fn own_interface(name: &str) -> &'static ClassEntry {
    match builtin_class(name) {
        Some(class) => class,
        None => ext_php_rs::zend::ce::aggregate(),
    }
}
`}
/// B-4: a class of PHP itself, found in the engine's class table when the module starts.
fn builtin_class(name: &str) -> Option<&'static ClassEntry> {
    // SAFETY: at module startup the compiler globals hold the class table, which outlives the module; the lookup copies
    // the name before lowercasing it.
    let found = unsafe {
        let table = (*ext_php_rs::ffi::ext_php_rs_compiler_globals()).class_table;
        ext_php_rs::ffi::zend_hash_str_find_ptr_lc(table, name.as_ptr().cast(), name.len())
    };
    // SAFETY: the class table holds class entries.
    unsafe { found.cast::<ClassEntry>().as_ref() }
}


/// B-4: the classes of PHP that the library classes extend or implement, in the order of BUILTIN_NAMES.
static BUILTINS: [OnceLock<Class>; ${builtins.length}] = [${builtins.map(() => 'const { OnceLock::new() }').join(', ')}];
const BUILTIN_NAMES: [&str; ${builtins.length}] = [${builtins.map((name) => rustString(name)).join(', ')}];

/// B-4: a class of PHP that startup found. The registration that reads it runs only after startup found every one,
/// so the engine's class that \`absent\` gives stands only for a lookup that did not run, and no registration takes it.
fn builtin(index: usize, absent: fn() -> &'static ClassEntry) -> &'static ClassEntry {
    match BUILTINS.get(index).and_then(OnceLock::get) {
        Some(Class(class)) => class,
        None => absent(),
    }
}

${baseFns}${jsonHook ? `
/// N-4: the interface of a class with a JSON hook.
fn json_serializable() -> &'static ClassEntry {
    builtin(${builtins.indexOf('JsonSerializable')}, ext_php_rs::zend::ce::aggregate)
}
` : ''}
fn private_property(name: &str) -> ClassProperty {
    ClassProperty {
        name: name.into(),
        flags: PropertyFlags::Private,
        default: Some(Box::new(|| Ok(Zval::new()))),
        docs: &[],
        ty: None,
        nullable: true,
        readonly: false,
        default_stub: None,
    }
}

/// Runs \`body\` with the scope of \`class\`, as zend_update_property does, so that the properties that \`class\` sees can be
/// written.
fn with_scope<R>(class: &ClassEntry, body: impl FnOnce() -> R) -> R {
    let previous = {
        let mut globals = ExecutorGlobals::get_mut();
        let previous = globals.fake_scope;
        globals.fake_scope = std::ptr::from_ref(class).cast_mut();
        previous
    };
    let result = body();
    ExecutorGlobals::get_mut().fake_scope = previous;
    result
}

fn read_property(ex: &mut ExecuteData, retval: &mut Zval, name: &str) {
    let Some(this) = ex.get_self() else { return };
    let class = ${scopeOf('this.get_class_entry()')};
    if name == "kind" {
        if let Ok(kind) = with_scope(class, || this.get_property::<String>(name)) {
            if retval.set_string(&kind, false).is_err() {
                retval.set_null();
            }
        }
        return;
    }
    match with_scope(class, || this.get_property::<Option<i64>>(name)) {
        Ok(Some(number)) => retval.set_long(number),
        Ok(None) | Err(_) => retval.set_null(),
    }
}

/// GN-10: the constructor of a category class, which an error unit inherits, so that PHP code makes an error with its
/// kind. An error that the extension raises is made without it (B-4).
fn construct_error(ex: &mut ExecuteData) {
    let mut message = Arg::new("message", DataType::String);
    let mut kind = Arg::new("kind", DataType::String);
    let mut status = Arg::new("status", DataType::Long).allow_null();
    let mut errno = Arg::new("errno", DataType::Long).allow_null();
    if ex.parser().arg(&mut message).arg(&mut kind).not_required().arg(&mut status).arg(&mut errno).parse().is_err() {
        return;
    }
    let (Some(message), Some(kind)) = (message.val::<String>(), kind.val::<String>()) else { return };
    let status = status.val::<i64>();
    let errno = errno.val::<i64>();
    let Some(this) = ex.get_self() else { return };
    let class = ${scopeOf('this.get_class_entry()')};
    let written = with_scope(class, || -> ext_php_rs::error::Result<()> {
        this.set_property("message", message)?;
        this.set_property("kind", kind)?;
        this.set_property("status", status)?;
        this.set_property("errno", errno)?;
        Ok(())
    });
    if let Err(error) = written {
        PhpException::from_message(format!("B-4: the error could not be made: {error}")).throw();
    }
}

ext_php_rs::zend_fastcall! {
    extern fn error_construct(ex: &mut ExecuteData, _retval: &mut Zval) {
        ext_php_rs::zend::run_handler(AssertUnwindSafe(|| construct_error(ex)));
    }
}

ext_php_rs::zend_fastcall! {
    extern fn kind_method(ex: &mut ExecuteData, retval: &mut Zval) {
        ext_php_rs::zend::run_handler(AssertUnwindSafe(|| read_property(ex, retval, "kind")));
    }
}

ext_php_rs::zend_fastcall! {
    extern fn status_method(ex: &mut ExecuteData, retval: &mut Zval) {
        ext_php_rs::zend::run_handler(AssertUnwindSafe(|| read_property(ex, retval, "status")));
    }
}

ext_php_rs::zend_fastcall! {
    extern fn errno_method(ex: &mut ExecuteData, retval: &mut Zval) {
        ext_php_rs::zend::run_handler(AssertUnwindSafe(|| read_property(ex, retval, "errno")));
    }
}

/// A failure on its way to PHP: the exception object to throw.
type Fail = PhpException;

/// B-4: an error of the library, an instance of its class with its message, kind, status and errno. The object is made
/// by the class's own handler, so it has the file, the line and the trace of the call.
fn library_error(class: usize, message: &str, kind: &str, status: Option<u16>, errno: Option<i32>) -> Fail {
    match error_object(class, message, kind, status, errno) {
        Ok(object) => error_exception(object, kind),
        Err(fail) => fail,
    }
}

/// The object of a library error with its message, kind, status and errno.
fn error_object(class: usize, message: &str, kind: &str, status: Option<u16>, errno: Option<i32>) -> Result<ZBox<ZendObject>, Fail> {
    let Some(Class(entry)) = CLASSES.get(class).and_then(OnceLock::get).copied() else {
        return Err(PhpException::from_message(format!("B-4: the class of {kind} is not registered")));
    };
    let mut object = ZendObject::new(entry);
    let written = with_scope(${scopeOf('entry')}, || -> ext_php_rs::error::Result<()> {
        object.set_property("message", message)?;
        object.set_property("kind", kind)?;
        object.set_property("status", status.map(i64::from))?;
        object.set_property("errno", errno.map(i64::from))?;
        Ok(())
    });
    if let Err(error) = written {
        return Err(PhpException::from_message(format!("B-4: the error {kind} could not be made: {error}")));
    }
    Ok(object)
}

/// The exception that throws the object of a library error.
fn error_exception(object: ZBox<ZendObject>, kind: &str) -> Fail {
    match object.into_zval(false) {
        Ok(zval) => PhpException::from_message(String::new()).with_object(zval),
        Err(error) => PhpException::from_message(format!("B-4: the error {kind} could not be made: {error}")),
    }
}

/// E-1a: an error that the binding raises itself, in the class of its fixed category.
fn binding_error(error: BindingError) -> Fail {
    let class: usize = match error.category() {
        Category::Value => ${classOf('value')},
        Category::Type => ${classOf('type')},
        Category::Io => ${classOf('io')},
        Category::Store => ${classOf('store')},
        Category::Busy => ${classOf('busy')},
        Category::Internal => ${classOf('internal')},
    };
    library_error(class, &error.to_string(), error.kind(), error.status(), error.errno())
}
${coreError}
/// B-7: a panic of the call reaches the caller as kind internal, not as the \\\\Error that ext-php-rs throws.
fn guard<T>(body: impl FnOnce() -> Result<T, Fail>) -> Result<T, Fail> {${holdsNative(model) ? '\n    release_queue();' : ''}
    match catch_unwind(AssertUnwindSafe(body)) {
        Ok(result) => result,
        Err(payload) => {
            let detail = match (payload.downcast_ref::<&str>(), payload.downcast_ref::<String>()) {
                (Some(text), _) => (*text).to_owned(),
                (None, Some(text)) => text.clone(),
                (None, None) => String::from("a panic without a message"),
            };
            Err(binding_error(BindingError::Internal { detail }))
        }
    }
}
${faultRust(model)}${cleanupAsserts(model)}${aliasKindsRust(model)}${raisesAssertions(model)}${used}
/// B-4: the library classes are registered when the module starts, after the classes of PHP that they extend.
extern "C" fn startup(_kind: i32, _module: i32) -> i32 {
    // B-4: a class of PHP that is missing fails the start of the module, before anything is registered.
    for (slot, name) in BUILTINS.iter().zip(BUILTIN_NAMES) {
        match builtin_class(name) {
            Some(class) => {
                let _first: Result<(), Class> = slot.set(Class(class));
            }
            None => return 1,
        }
    }${registerClasses}${registerUnits}${registerVariants}${found(model.variants.map((v) => v.unit))}${registerRecords}${registerInterfaces}${found(ownInterfaces.filter((u) => u.kind !== 'variant'))}
    0
}

/// The module entry and the functions. The expansions of ext-php-rs's php_function and php_module macros call methods
/// that R-1 disallows (\`Option::map_or\`, \`Result::unwrap_or\`) in this crate's own code; the allow is limited to this
/// module, whose functions only convert their arguments and call the core.
mod entry {
    #![allow(clippy::disallowed_methods, reason = "R-1: the expansion of the php_function and php_module macros of ext-php-rs")]
    use super::*;
${functions}
${PANIC_TEST(layout)}${takesFunction(model) ? THREAD_TEST(layout) : ''}${nativeRoundTrip(model.contract, 'php') === undefined ? '' : NATIVE_COUNT(layout)}${countsThrownPhp(model) ? THROWN_COUNT(layout) : ''}${model.faults.length === 0 ? '' : FAULT_TEST(layout)}${aliasesWithKinds(model).map((alias) => `
/// U-7: runs the in function of the alias ${alias.unit.id} alone, for the cases of the alias.
#[cfg(feature = "codec-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\aliasIn${langName('php', alias.unit.name, 'class')}`)})]
pub fn alias_in_${rustField(alias.unit.name)}(value: &Zval) -> Result<(), PhpException> {
    guard(|| {
        let _value: ${alias.unit.core_type ?? ''} = in_${rustField(alias.unit.name)}(value, "value")?;
        Ok(())
    })
}

/// GN-13e: takes a value by the in function of the alias ${alias.unit.id} and gives it back by its out function, for the round trip of a result.
#[cfg(feature = "codec-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\aliasRound${langName('php', alias.unit.name, 'class')}`)})]
pub fn alias_round_${rustField(alias.unit.name)}(value: &Zval) -> Result<Zval, PhpException> {
    guard(|| {
        let value: ${alias.unit.core_type ?? ''} = in_${rustField(alias.unit.name)}(value, "value")?;
        out_${rustField(alias.unit.name)}(&value)
    })
}
`).join('')}
${poisonRust(model, layout)}${caseTests.entries}
    #[php_module]
    #[php(startup = "startup")]
    pub fn module(module: ModuleBuilder) -> ModuleBuilder {
        let module = module
            .name(${rustString(layout.extension)})
    ${register.join('\n')};${!holdsNative(model) ? '' : `
        // GN-6u: the Natives of a request are released at its end, while the engine is alive.
        let module = module.request_shutdown_function(release_native);`}${!takesFunction(model) ? '' : `
        #[cfg(feature = "thread-test")]
        let module = module.function(wrap_function!(thread_test));`}${nativeRoundTrip(model.contract, 'php') === undefined ? '' : `
        #[cfg(feature = "native-count-test")]
        let module = module.function(wrap_function!(native_count));`}${!countsThrownPhp(model) ? '' : `
        #[cfg(feature = "thrown-count-test")]
        let module = module.function(wrap_function!(thrown_count));`}
        #[cfg(feature = "panic-test")]
        let module = module.function(wrap_function!(panic_test)).function(wrap_function!(errno_of));${model.objects.some((o) => o.lock?.writes === true) ? `
        #[cfg(feature = "panic-test")]
        let module = module.function(wrap_function!(panic_test_held));` : ''}${model.faults.length === 0 ? '' : `
        #[cfg(feature = "fault-test")]
        let module = module.function(wrap_function!(arm_faults)).function(wrap_function!(fault_left));`}${aliasesWithKinds(model).map((alias) => `
        #[cfg(feature = "codec-test")]
        let module = module.function(wrap_function!(alias_in_${rustField(alias.unit.name)}));
        #[cfg(feature = "codec-test")]
        let module = module.function(wrap_function!(alias_round_${rustField(alias.unit.name)}));`).join('')}${caseTests.registers}
        module
    }
}
`;
}

const phpBase = (category: string): string =>
  ({ value: 'InvalidArgumentException', type: 'TypeError' })[category] ?? 'RuntimeException';
const phpBaseFn = (category: string): string => `base_${phpBase(category).toLowerCase()}`;

function stub(model: Model, layout: PhpLayout): string {
  const phpType = (type: Type): string => {
    if (typeof type === 'string') {
      if (type === 'cancel') return `\\${phpCancellationName(layout)}`;
      return ({ text: 'string', latin1: 'string', bytes: 'string', source: 'string', path: 'string', bool: 'bool', uint: 'int', int: 'int', int64: 'int', float: 'float', none: 'void', never: 'never' } as Record<string, string>)[type] ?? 'mixed';
    }
    if ('list' in type || 'tuple' in type || 'map' in type || 'keyed_map' in type) return 'array';
    if ('optional' in type) return `?${phpType(type.optional)}`;
    // GN-6z: a function type is a Closure; GN-6ae: the function parameter of a member with machine is any callable.
    if ('function' in type) return machineFunction(type) ? 'mixed' : '\\Closure';
    const unit = unitOf(model, type);
    const library = libraryOf(type);
    const owner = library === undefined ? layout : { ...layout, namespace: (model.foreign.get(library)?.packages['php'] as { namespace: string }).namespace };
    // U-7: a value alias is any value that its core judges.
    if (unit === undefined || aliasOf(model, type) !== undefined) return 'mixed';
    return `\\${phpNamespace(owner, unit.module)}\\${langName('php', unit.name, 'class')}`;
  };
  const docType = (type: Type): string => {
    if (typeof type === 'object' && 'list' in type) return `list<${docType(type.list)}>`;
    if (typeof type === 'object' && 'map' in type) return `array<array-key, ${docType(type.map)}>`;
    if (typeof type === 'object' && 'keyed_map' in type) return `array<${type.key.includes('int') || type.key.includes('text') ? 'array-key' : 'string'}, ${docType(type.keyed_map)}>`;
    if (typeof type === 'object' && 'tuple' in type) return `array{${type.tuple.map(docType).join(', ')}}`;
    if (typeof type === 'object' && 'optional' in type) return `${docType(type.optional)}|null`;
    // GN-6ae: a function parameter is a callable of its parameters, whose value is any value.
    if (machineFunction(type)) return `callable(${type.function.parameters.map(docType).join(', ')}): mixed`;
    return phpType(type);
  };
  const blocks: string[] = [];
  blocks.push(`namespace ${layout.namespace} {
${model.classes.map((c) => `    /** The errors of category ${c.category} (E-2). */
    class ${c.name} extends \\${phpBase(c.category)}
    {
        public function __construct(string $message, string $kind, ?int $status = null, ?int $errno = null) {}

        public function kind(): string {}

        public function status(): ?int {}

        public function errno(): ?int {}
    }
`).join('\n')}}`);
  // T-1 cancel, GN-6aq: the class Cancellation of the extension.
  if (cancelsAny(model)) {
    blocks.push(`namespace ${layout.namespace} {
    /** A cancellation that the caller fires by cancel(), which a parameter of the type cancel takes (GN-6aq). */
    final class Cancellation
    {
        public function __construct() {}

        public function cancel(): void {}

        public function isCancelled(): bool {}
    }
}`);
  }
  // E-2, I-3: an error unit extends the class of its parent or of its category; a property is a method.
  for (const u of model.errorUnits) {
    const parent = u.parent === undefined
      ? `\\${layout.namespace}\\${model.classes.find((c) => c.category === u.category)?.name ?? ''}`
      : `\\${phpNamespace(layout, u.parent.unit.module)}\\${langName('php', u.parent.unit.name, 'class')}`;
    blocks.push(`namespace ${phpNamespace(layout, u.unit.module)} {
    /** The errors of the unit ${u.unit.id} (E-2). */
    ${u.unit.final === true ? 'final ' : ''}class ${langName('php', u.unit.name, 'class')} extends ${parent}
    {${u.properties.map((p) => `${typeof p.returns === 'object' && 'list' in p.returns ? `
        /** @return ${docType(p.returns)}|null */` : ''}
        public function ${langName('php', p.member.name, 'callable')}(): ${phpType(typeof p.returns === 'object' && 'optional' in p.returns ? p.returns.optional : p.returns).replace(/^\?/, '')}|null {}`).join('\n')}
    }
}`);
  }
  const modules = [...new Set([
    ...model.functions.map((f) => f.module), ...model.enums.map((u) => u.module), ...model.constants.map((c) => c.module),
    ...model.resultRecords.map((u) => u.module), ...model.variants.map((v) => v.unit.module), ...model.objects.map((o) => o.unit.module), ...model.callbacks.map((c) => c.unit.module), ...model.interfaces.map((i) => i.module),
  ])].sort();
  const method = (fn: Fn, indent: string): string => {
    // U-2: the declaration shows a {literal} or {const} default; null stands for a default whose value is the core's.
    const shown = (a: Arg): string => {
      if (a.default === undefined) return '';
      const value = declaredValue(model, a)?.value;
      return ` = ${value === undefined ? ('empty' in a.default ? '[]' : 'null') : typeof value === 'string' ? phpText(value) : JSON.stringify(value)}`;
    };
    const docs = fn.args.map((a) => `${indent} * @param ${docType(a.type)} $${langName('php', a.name, 'variable')}${a.default !== undefined && 'computed' in a.default ? ` the core decides its value when it is left out (${a.default.computed})` : ''}`);
    const params = fn.args.map((a) => `mixed $${langName('php', a.name, 'variable')}${shown(a)}`);
    if (fn.kind === 'iterate') {
      const yields = fn.yields ?? { value: 'none' };
      return `${indent}/**
${indent} * N-4: the items${yields.key === undefined ? ' under their positions' : ' under their keys'}, a snapshot of the value.
${indent} *
${indent} * @return \\Iterator<${yields.key === undefined ? 'int' : docType(yields.key)}, ${docType(yields.value)}>
${isInternal(fn.unit) ? `${indent} * @internal\n` : ''}${indent} */
${indent}public function getIterator(): \\Iterator {}
`;
    }
    const name = fn.kind === 'constructor' ? '__construct' : memberName('php', fn);
    const prefix = fn.kind === 'function' ? 'function' : fn.kind === 'static' ? 'public static function' : 'public function';
    const returns = fn.kind === 'constructor' ? '' : `: ${phpType(fn.returns)}`;
    return `${indent}/**
${indent} * T-8: the parameters take any value, which the extension judges.
${docs.length > 0 ? `${indent} *\n${docs.join('\n')}\n` : ''}${fn.kind === 'constructor' ? '' : `${indent} * @return ${docType(fn.returns)}\n`}${isInternal(fn.unit) ? `${indent} * @internal\n` : ''}${indent} */
${indent}${prefix} ${name}(${params.join(', ')})${returns} {}
`;
  };
  // GN-6r: the docblock of a declaration of an internal unit holds @internal.
  const doc = (unit: Unit, line: string | undefined, indent: string): string => {
    if (!isInternal(unit)) return line === undefined ? '' : `${indent}/** ${line} */\n`;
    return line === undefined ? `${indent}/** @internal */\n` : `${indent}/**\n${indent} * ${line}\n${indent} *\n${indent} * @internal\n${indent} */\n`;
  };
  for (const module of modules) {
    const items: string[] = [];
    for (const unit of model.resultRecords.filter((u) => u.module === module)) {
      const props = (unit.fields ?? []).map((f) => `            public readonly mixed $${langName('php', f.name, 'variable')},`);
      items.push(`${doc(unit, 'T-4: the result form of the record; the constructor holds the values, which the extension judges when they enter.', '    ')}    final class ${langName('php', unit.name, 'class')}
    {
        public function __construct(
${props.join('\n')}
        ) {}
    }
`);
    }
    // T-9, GN-6v: the interface of a variant and the final class of each case, which implements it.
    for (const v of model.variants.filter((u) => u.unit.module === module)) {
      const iface = langName('php', v.unit.name, 'class');
      items.push(`    /** T-9: a value of the variant is an instance of the class of one of its cases. */
    interface ${iface}
    {
    }
`);
      for (const kase of v.cases) {
        const props = (kase.unit.fields ?? []).map((f) => `            public readonly mixed $${langName('php', f.name, 'variable')},`);
        items.push(`    /** T-9: the case ${kase.value} of the variant; the constructor holds the values, which the extension judges when they enter. */
    final class ${langName('php', kase.unit.name, 'class')} implements ${iface}
    {
        public function __construct(${props.length === 0 ? ') {}' : `\n${props.join('\n')}\n        ) {}`}
    }
`);
      }
    }
    for (const cb of model.callbacks.filter((c) => c.unit.module === module)) {
      const lines = cb.members.map((m) => {
        const docs = m.params.map((p) => `         * @param ${docType(p.type)} $${langName('php', p.name, 'variable')}`);
        return `        /**
         * U-3: the extension calls it; the value it returns is judged as it enters (T-8).
         *
${docs.join('\n')}${docs.length > 0 ? '\n' : ''}         * @return ${docType(m.returns)}
${isInternal(cb.unit) ? '         * @internal\n' : ''}         */
        public function ${langName('php', m.member.name, 'callable')}(${m.params.map((p) => `mixed $${langName('php', p.name, 'variable')}`).join(', ')}): mixed;
`;
      });
      items.push(`${doc(cb.unit, 'U-3: a callback that PHP code implements.', '    ')}    interface ${langName('php', cb.unit.name, 'class')}
    {
${lines.join('\n')}    }
`);
    }
    // GN-6ap: a generated interface, which the classes that implement it name.
    for (const iface of model.interfaces.filter((i) => i.module === module)) {
      items.push(`${doc(iface, 'GN-6ap: the interface of the classes that a parameter of it takes.', '    ')}    interface ${langName('php', iface.name, 'class')}
    {
    }
`);
    }
    for (const object of model.objects.filter((o) => o.unit.module === module)) {
      const members = object.members.map((fn) => method(fn, '        '));
      if (!object.constructible) members.unshift('        private function __construct() {}\n');
      items.push(`${doc(object.unit, 'T-5.', '    ')}    final class ${langName('php', object.unit.name, 'class')}${phpImplements(object, implementsClause(model, object, 'php', (unit) => `\\${phpNamespace(layout, unit.module)}\\${langName('php', unit.name, 'class')}`))}
    {
${members.join('\n')}    }
`);
    }
    for (const unit of model.enums.filter((u) => u.module === module)) {
      items.push(`${doc(unit, undefined, '    ')}    enum ${langName('php', unit.name, 'class')}: string
    {
${(unit.variants ?? []).map((v) => `        case ${phpCase(v.name)} = '${v.value}';`).join('\n')}
    }
`);
    }
    for (const constant of model.constants.filter((c) => c.module === module)) {
      items.push(`${doc(constant.unit, undefined, '    ')}    const ${langName('php', constant.member.name, 'constant')} = ${JSON.stringify(constant.member.value)};\n`);
    }
    for (const fn of model.functions.filter((f) => f.module === module)) items.push(method(fn, '    '));
    blocks.push(`namespace ${phpNamespace(layout, module)} {
${items.join('\n')}}`);
  }
  if (model.objects.some((o) => o.members.some((fn) => fn.kind === 'iterate'))) {
    blocks.push(`namespace ${layout.namespace}\\Internal {
    /**
     * N-4: the iterator over the pairs that a getIterator converted; only the extension makes it.
     *
     * @implements \\Iterator<mixed, mixed>
     */
    final class Pairs implements \\Iterator
    {
        private function __construct() {}
        public function current(): mixed {}
        public function key(): mixed {}
        public function next(): void {}
        public function rewind(): void {}
        public function valid(): bool {}
    }
}`);
  }
  return `<?php

// ${header('').trim()}
// The declarations of the extension ${layout.extension} (T-1a).

${blocks.join('\n\n')}
`;
}

export function php(model: Model, files: Files): void {
  const layout = phpLayout(model);
  const php = model.contract.packages['php'] as { package: string };
  files.set(`${ROOT}/lib.rs`, libRust(model, layout));
  files.set(`${ROOT}/${layout.extension}.stub.php`, stub(model, layout));
  files.set(`${ROOT}/tests/GeneratedTest.php`, phpTests(model, layout));
}
