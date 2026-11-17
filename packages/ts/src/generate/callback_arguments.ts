// GN-6bu (B2.467): a callback takes the arguments that the binding calls it with. A callback place is a member of a
// callback unit (U-3), the function of a member with machine (GN-6ae) or a value of a function type (GN-6z); where the
// binding gives it one argument or more, the helper that takes the callback asks the language what the callback
// declares and refuses a callback that does not take them, with kind invalid_callback, before the member does
// anything (GN-8a: an entry point converts its arguments before its locks and its core call). This unit holds what the
// four targets share: the names of the arguments in the message, the subject that names the member, the Rust helper
// of each target, the form in which a JavaScript fixture declares its arguments, and the generated tests of the rule.
// Go has no check: a typed func and an interface state the arguments, and the compiler judges them.

import type { Type, Unit } from '../contract.ts';
import { type Arg, type CallbackMember, type Fn, type Model, kindText, langName, machineFunction, memberName, pointName, unitOf } from './model.ts';
import { pyString, rustString } from './text.ts';

type Target = 'node' | 'wasm' | 'php' | 'python';

// The name of a contract type in a message: the type itself, with the type of its items.
export function typeLabel(type: Type): string {
  if (typeof type === 'string') return type;
  if ('list' in type) return `list<${typeLabel(type.list)}>`;
  if ('map' in type) return `map<${typeLabel(type.map)}>`;
  if ('keyed_map' in type) return `keyed_map<${typeLabel(type.keyed_map)}>`;
  if ('optional' in type) return `optional<${typeLabel(type.optional)}>`;
  if ('tuple' in type) return `tuple<${type.tuple.map(typeLabel).join(', ')}>`;
  if ('function' in type) return 'function';
  if ('passthrough' in type) return type.passthrough;
  return type.unit;
}

// The arguments that the binding gives a member of a callback unit, by their names in the language, and a function,
// by the types of the contract: a function type names no argument.
export const memberGiven = (lang: Target, member: CallbackMember): string[] => member.params.map((p) => langName(lang, p.name, 'variable'));
export const functionGiven = (type: { parameters: Type[] }): string[] => type.parameters.map(typeLabel);

// The Rust slice of the names that a helper takes.
export const givenRust = (names: readonly string[]): string => `&[${names.map(rustString).join(', ')}]`;

// Whether a type holds a callback place, at any place of a list, an optional, a map or a tuple: a function type, or a
// callback unit, also of another repository.
export function holdsPlace(model: Model, type: Type): boolean {
  if (typeof type === 'string') return false;
  if ('function' in type) return true;
  if ('list' in type) return holdsPlace(model, type.list);
  if ('optional' in type) return holdsPlace(model, type.optional);
  if ('map' in type) return holdsPlace(model, type.map);
  if ('keyed_map' in type) return holdsPlace(model, type.keyed_map);
  if ('tuple' in type) return type.tuple.some((part) => holdsPlace(model, part));
  if ('passthrough' in type) return false;
  return unitOf(model, type)?.origin === 'callback';
}

// The member as the caller writes its call, which the message of a refused callback begins with.
export function callLabel(lang: Target, fn: Fn): string {
  const cls = langName(lang, fn.unit.name, 'class');
  if (fn.kind === 'function') return `${memberName(lang, fn)}()`;
  if (fn.kind === 'constructor') return lang === 'python' ? `${cls}()` : `new ${cls}()`;
  return `${cls}${lang === 'php' ? '::' : '.'}${memberName(lang, fn)}()`;
}

// The subject of a parameter or of a field of the record parameter of a member: its name, and for a type that holds a
// callback place the member before it, so that the message of a refused callback names the call that received it.
export const placeSubject = (lang: Target, model: Model, fn: Fn, type: Type, name: string): string =>
  rustString(holdsPlace(model, type) ? `${callLabel(lang, fn)}: ${name}` : name);

// The refusal that every helper returns, as the fields of BindingError::InvalidCallback, with what the callback
// declares in the local `declared`.
const refusal = (namedOnly: boolean): string => `BindingError::InvalidCallback {
        subject: subject.to_owned(),
        member: member.to_owned(),
        arguments: Some(binding_core::CallbackArguments {
            declared,
            given: given.iter().map(|name| (*name).to_owned()).collect(),
            named_only: ${String(namedOnly)},
        }),
    }`;

// Node: the length of a function is all that JavaScript tells of what it takes: the parameters that it names before a
// default or a rest. A function whose length is below the count of the arguments is refused; so is one whose length
// cannot be read (the getter of a Proxy that throws, whose exception is taken) or is no count.
export const TAKES_NODE = `
/// GN-6bu: a function names every argument that the binding calls it with, which its length tells; a place without
/// arguments has no check. \`member\` is the member of a callback unit, and empty for a function.
fn takes_in(env_: &Env, function: Unknown<'_>, subject: &str, member: &str, given: &[&str]) -> Result<(), Fail> {
    if given.is_empty() {
        return Ok(());
    }
    let object: Object<'_> = unsafe { function.cast() }.map_err(internal)?;
    let read: napi::Result<Unknown<'_>> = object.get_named_property("length");
    let named = match read {
        Ok(length) if length.get_type().map_err(internal)? == ValueType::Number => {
            let double = unsafe { length.cast::<f64>() }.map_err(internal)?;
            if double.is_finite() && double.fract() == 0.0 && (0.0..=4_294_967_295.0).contains(&double) {
                Some(unsafe { length.cast::<u32>() }.map_err(internal)?)
            } else {
                None
            }
        }
        Ok(_other) => None,
        Err(failed) => {
            let mut pending = std::ptr::null_mut();
            // SAFETY: env_ is the environment of this call on its thread; an exception that the read left pending is
            // taken, so that the refusal is the one failure of the call.
            if unsafe { napi::sys::napi_get_and_clear_last_exception(env_.raw(), &mut pending) } != napi::sys::Status::napi_ok {
                return Err(internal(failed));
            }
            None
        }
    };
    if named.is_some_and(|named| usize::try_from(named).is_ok_and(|named| named >= given.len())) {
        return Ok(());
    }
    let declared = match named {
        Some(named) => binding_core::Declared::Takes(named),
        None => binding_core::Declared::Other(String::from("its length is no count of arguments")),
    };
    Err(binding_error(${refusal(true)}))
}
`;

// WASM: the same fact, read in Rust through Reflect, whose failure is a value and no exception of the module.
export const TAKES_WASM = `
/// GN-6bu: a function names every argument that the binding calls it with, which its length tells; a place without
/// arguments has no check. \`member\` is the member of a callback unit, and empty for a function.
fn takes_in(function: &JsValue, subject: &str, member: &str, given: &[&str]) -> Result<(), Fail> {
    if given.is_empty() {
        return Ok(());
    }
    let length = match Reflect::get(function, &JsValue::from_str("length")) {
        Ok(length) => length.as_f64(),
        // A length whose read throws is no count, and the function is refused for it.
        Err(_thrown) => None,
    };
    let named = match length {
        Some(length) if length.is_finite() && length.fract() == 0.0 && (0.0..=4_294_967_295.0).contains(&length) => {
            #[allow(clippy::as_conversions, clippy::cast_possible_truncation, clippy::cast_sign_loss, reason = "GN-6bu: an integer from 0 to u32::MAX, which u32 holds exactly")]
            let named = length as u32;
            Some(named)
        }
        Some(_) | None => None,
    };
    if named.is_some_and(|named| usize::try_from(named).is_ok_and(|named| named >= given.len())) {
        return Ok(());
    }
    let declared = match named {
        Some(named) => binding_core::Declared::Takes(named),
        None => binding_core::Declared::Other(String::from("its length is no count of arguments")),
    };
    Err(binding_error(${refusal(true)}))
}
`;

// Python: inspect.signature(callable).bind with one positional value for each argument. A TypeError of bind refuses
// the callable, in both directions (too few parameters, and more required than given); a callable of which
// inspect.signature gives no signature (ValueError or TypeError, as for a type of C) is left to its call.
export const TAKES_PYTHON = `
/// GN-6bu: a callable takes the arguments that the binding calls it with, which inspect.signature(...).bind judges; a
/// place without arguments has no check, and a callable without a signature is left to its call. \`member\` is the
/// member of a callback unit, whose bound method is the callable, and empty for a function.
fn takes_in(py_: Python<'_>, callable: &Bound<'_, PyAny>, subject: &str, member: &str, given: &[&str]) -> PyResult<()> {
    if given.is_empty() {
        return Ok(());
    }
    let signature = match py_.import("inspect")?.getattr("signature")?.call1((callable,)) {
        Ok(signature) => signature,
        Err(error) if error.is_instance_of::<pyo3::exceptions::PyValueError>(py_) || error.is_instance_of::<pyo3::exceptions::PyTypeError>(py_) => return Ok(()),
        Err(error) => return Err(error),
    };
    let positional = PyTuple::new(py_, vec![0_u8; given.len()])?;
    match signature.call_method1("bind", positional) {
        Ok(_bound) => Ok(()),
        Err(error) if error.is_instance_of::<pyo3::exceptions::PyTypeError>(py_) => {
            let declared = binding_core::Declared::Other(error.value(py_).to_string());
            Err(binding_error(py_, ${refusal(false)}))
        }
        Err(error) => Err(error),
    }
}
`;

// PHP: the engine is asked through its Reflection classes, which ext-php-rs calls as it calls any method, so the
// extension reads no field of zend_function and depends on no layout of it. A callable is refused when it declares
// fewer parameters than the arguments and is not variadic, and when it requires more than the arguments; a callable
// that Reflection does not describe is left to its call.
export const TAKES_PHP = `
/// GN-6bu: what a function or a method declares, asked of the engine by an instance of its Reflection class: the count
/// of its parameters, the count of those that it requires, and whether it is variadic. None when the engine gives no
/// such instance, whose exception is taken.
fn reflected(class: &str, args: Vec<&dyn ext_php_rs::convert::IntoZvalDyn>) -> Option<(i64, i64, bool)> {
    let reflection = ClassEntry::try_find(class)?.new();
    answered(reflection.try_call_method("__construct", args), |_made| Some(()))?;
    let parameters = answered(reflection.try_call_method("getNumberOfParameters", vec![]), Zval::long)?;
    let required = answered(reflection.try_call_method("getNumberOfRequiredParameters", vec![]), Zval::long)?;
    let variadic = answered(reflection.try_call_method("isVariadic", vec![]), Zval::bool)?;
    Some((parameters, required, variadic))
}

/// GN-6bu: the answer of a call of the engine that the check makes, as \`read\` reads it. An exception of the call is
/// taken out of the engine before the answer is read (GN-6ae), so the check leaves none pending; a call that threw, or
/// that the engine refused, gives no answer, and the callable is left to its call.
fn answered<T>(called: ext_php_rs::error::Result<Zval>, read: impl FnOnce(&Zval) -> Option<T>) -> Option<T> {
    if let Some(exception) = ExecutorGlobals::take_exception() {
        drop(exception);
        return None;
    }
    match called {
        Ok(answer) => read(&answer),
        Err(_refused) => None,
    }
}

/// GN-6bu: what a callable declares: Closure::fromCallable gives the Closure of any callable, which ReflectionFunction
/// describes.
fn reflected_callable(callable: &Zval) -> Option<(i64, i64, bool)> {
    let from = match ext_php_rs::types::ZendCallable::try_from_name("Closure::fromCallable") {
        Ok(from) => from,
        // An engine without Closure::fromCallable describes no callable, which is left to its call.
        Err(_absent) => return None,
    };
    let closure = answered(from.try_call(vec![callable]), |closure| Some(closure.shallow_clone()))?;
    reflected("ReflectionFunction", vec![&closure])
}

/// GN-6bu: a callable takes the arguments that the binding calls it with: it declares as many parameters or is
/// variadic, and it requires no more. A place without arguments has no check, and a callable that the engine does not
/// describe is left to its call. \`member\` is the member of a callback unit, and empty for a function.
fn takes_in(declares: impl FnOnce() -> Option<(i64, i64, bool)>, subject: &str, member: &str, given: &[&str]) -> Result<(), Fail> {
    if given.is_empty() {
        return Ok(());
    }
    let Some((parameters, required, variadic)) = declares() else {
        return Ok(());
    };
    // The engine counts parameters from 0; a count outside u32 is no count, and the callable is left to its call.
    let (Ok(parameters), Ok(required)) = (u32::try_from(parameters), u32::try_from(required)) else {
        return Ok(());
    };
    let declared = if !variadic && usize::try_from(parameters).is_ok_and(|parameters| parameters < given.len()) {
        binding_core::Declared::Takes(parameters)
    } else if usize::try_from(required).is_ok_and(|required| required > given.len()) {
        binding_core::Declared::Requires(required)
    } else {
        return Ok(());
    };
    Err(binding_error(${refusal(false)}))
}
`;

// Node and WASM: a member of a fixture, as the function that declares the arguments of the member and passes them on
// to the call of the fixture. The generated fixtures declare their arguments, as every callback of a consumer does.
export const jsArguments = (count: number): string => Array.from({ length: count }, (_unused, i) => `arg${i}`).join(', ');
export const jsDeclaredMember = (name: string, count: number): string => `[${name}, (call) => (${jsArguments(count)}) => call(${jsArguments(count)})]`;

// ---- The generated tests ----

// How the callback of a test declares its arguments: none of them, or one more than the binding gives, all required.
export type Declares = 'none' | 'more';

// A callback place of a parameter of a member that is given one argument or more: the parameter, its form, the counts
// of the arguments of the function (of each member of the unit), and the names that the message gives.
export interface PlaceTest {
  arg: Arg;
  form: 'unit' | 'machine' | 'function';
  // The callback unit of the form unit.
  unit?: Unit;
  // The count of the arguments of the function; of a unit, of its first member that is given one or more.
  count: number;
  // The names of the arguments of that function or member, as the message writes them.
  given: string;
  // GN-8a: the faults that the test arms for the member before the refused call, and the kind that the next call,
  // which takes the arming, fails with.
  armed?: { faults: string; kind: string; category: string };
}

// The places of the parameters of a member that a generated test refuses: the first parameter of a callback unit with a
// member that every object has and that is given an argument, each function parameter of a member with machine, and
// the first parameter of a function type, each with one argument or more.
export function placeTests(model: Model, lang: Target, fn: Fn): PlaceTest[] {
  // GN-8a: a point of the core call of the member that fills one kind by an injection that needs no value.
  const point = model.faults.find((p) => p.place === fn.corePath && p.fills.length === 1 && p.inject.some((i) => i !== 'short'));
  const filled = point === undefined ? undefined : model.kinds.find((k) => k.unit === undefined && kindText(k.variant) === point.fills[0]);
  const inject = point?.inject.find((i) => i !== 'short');
  // A member with machine arms each wait of its machine, so its arming is no arming of one core call (GN-8a).
  const armed = point === undefined || filled === undefined || inject === undefined || fn.machine === true
    ? {}
    : { armed: { faults: JSON.stringify([{ point: pointName(model, point), kind: inject }]), kind: kindText(filled.variant), category: filled.category } };
  const names = (given: string[]): string => `(${given.join(', ')})`;
  const tests: PlaceTest[] = [];
  const callback = fn.args.find((a) => unitOf(model, a.type)?.origin === 'callback');
  const unit = callback === undefined ? undefined : unitOf(model, callback.type);
  const member = (unit?.members ?? []).find((m) => m.default === undefined && (m.parameters ?? []).length > 0);
  if (callback !== undefined && unit !== undefined && member !== undefined) {
    const given = (member.parameters ?? []).map((p) => langName(lang, p.name, 'variable'));
    tests.push({ arg: callback, form: 'unit', unit, count: given.length, given: names(given), ...armed });
  }
  for (const arg of fn.args) {
    if (machineFunction(arg.type) && arg.type.function.parameters.length > 0) {
      tests.push({ arg, form: 'machine', count: arg.type.function.parameters.length, given: names(functionGiven(arg.type.function)), ...armed });
    }
  }
  const valued = fn.args.find((a) => typeof a.type === 'object' && 'function' in a.type && !machineFunction(a.type));
  if (valued !== undefined && typeof valued.type === 'object' && 'function' in valued.type && valued.type.function.parameters.length > 0) {
    tests.push({ arg: valued, form: 'function', count: valued.type.function.parameters.length, given: names(functionGiven(valued.type.function)), ...armed });
  }
  return tests;
}

// The callback of a test, which records each call in \`calls\`, a list of the test, so that the test shows that the
// refused callback was never called. A member of a unit that is given no argument declares none in every form.
const declared = (count: number, declares: Declares): number => (count === 0 || declares === 'none' ? 0 : count + 1);

export function refusedJs(place: PlaceTest, declares: Declares): string {
  const fn = (count: number): string => `(${jsArguments(declared(count, declares))}) => { calls.push(1); return null; }`;
  if (place.unit === undefined) return fn(place.count);
  return `{ ${(place.unit.members ?? []).filter((m) => m.default === undefined).map((m) => `${langName('node', m.name, 'callable')}: ${fn((m.parameters ?? []).length)}`).join(', ')} }`;
}

export function refusedPython(place: PlaceTest, declares: Declares): string {
  const parameters = (count: number, self: boolean): string => [...(self ? ['self'] : []), ...Array.from({ length: declared(count, declares) }, (_unused, i) => `_arg${i}`)].join(', ');
  const fn = (count: number, self: boolean): string => `lambda${parameters(count, self) === '' ? '' : ` ${parameters(count, self)}`}: calls.append(1)`;
  if (place.unit === undefined) return fn(place.count, false);
  const members = (place.unit.members ?? []).filter((m) => m.default === undefined).map((m) => `${pyString(langName('python', m.name, 'callable'))}: ${fn((m.parameters ?? []).length, true)}`);
  return `type(${pyString(langName('python', place.unit.name, 'class'))}, (), {${members.join(', ')}})()`;
}

export function refusedPhp(place: PlaceTest, declares: Declares): string {
  const parameters = (count: number): string => Array.from({ length: declared(count, declares) }, (_unused, i) => `mixed $arg${i}`).join(', ');
  if (place.unit === undefined) return `function (${parameters(place.count)}) use ($calls): mixed { $calls->append(1); return null; }`;
  const members = (place.unit.members ?? []).filter((m) => m.default === undefined).map((m) => `public function ${langName('php', m.name, 'callable')}(${parameters((m.parameters ?? []).length)}): mixed { $this->calls->append(1); return null; }`);
  return `new class($calls) { public function __construct(private \\ArrayObject $calls) {} ${members.join(' ')} }`;
}
