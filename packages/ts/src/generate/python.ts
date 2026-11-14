// The Python binding (PyO3, abi3-py310): the Rust crate, the Python package around its `_native` module, the type
// stubs and the generated tests (G-5).

import type { Type, Unit } from '../contract.ts';
import { variantPattern } from '../contract.ts';
import { raisesAssertions } from './raises.ts';
import { type Files, header, pyHeader, pyString, rustString, closure, optionRef, usedHelpers, WIDEN, INTO_CORE, PARTS, CORE_FORM } from './text.ts';
import { defaultAsserts, declaredValue } from './defaults.ts';
import { type Arg, type CallbackUnit, type ErrorUnit, type Fn, type Model, isInternal, interfaceOf, implementorsOf, Unsupported, argType, leftOut, aliasOf, errorProperties, byValue, type ObjectClass, coreCallArgs, aliasKindsRust, aliasesWithKinds, faultRust, armedCall, awaits, cleanupAsserts, cleanupMade, cleanupWarning, waitsAsync, waitsIo, waitsProcess, drivenCall, DRIVEN, withFaults, heldNew, heldParam, heldType, langName, libraryOf, lockLines, memberName, resultLet, objectUnit, POISON_ENTRY, recordFn, takesHeld, takesNested, borrowedItem, rustField, rustIdent, rustType, rustVariant, unitOf, traitParam, holdsFunction, keepsThrown, boxed, type Variant, caseFields, caseRead, caseStruct, caseType, caseValue, caseWritten, UNIT_CASE_ALLOW, tupleIn, caseLeftOut, narrows, narrowed, tupleOut, propertyValue, errorMatched, recognizedFn, recognizedMatch, unitFn, libraryBlocks, machineFunction, countsThrown, takenCallbacks } from './model.ts';
import { HOST_PYTHON_SUBPACKAGE } from './packages.ts';
import { aliasPython, foreignFailurePython, keptPython, pythonHost } from './alias_python.ts';
import { pythonTests } from './tests_python.ts';

const ROOT = 'packages/python/generated';
const PYTHON_PACKAGE = `${ROOT}/python`;

export interface PythonLayout {
  module: string;
  modulePath: string;
}

export function pythonLayout(model: Model): PythonLayout {
  const python = model.contract.packages['python'] as { module: string; host?: boolean };
  // L-2a: in a host package the generated Python package is the subpackage _binding of the host's package.
  const module = python.host === true ? `${python.module}.${HOST_PYTHON_SUBPACKAGE}` : python.module;
  return { module, modulePath: module.replaceAll('.', '/') };
}

const moduleOf = (layout: PythonLayout, module: string): string => (module === '' ? layout.module : `${layout.module}.${module.replaceAll('/', '.')}`);
// GN-6r: the module of the internal names of a contract module: _root for the root module, _<module> for another.
export const internalModule = (module: string): string => (module === '' ? '_root' : `_${module.replaceAll('/', '.')}`);
// The Python module that holds a unit of the module: internal units are in internalModule (GN-6r).
const unitModule = (layout: PythonLayout, unit: Unit): string => (isInternal(unit) ? `${layout.module}.${internalModule(unit.module)}` : moduleOf(layout, unit.module));

// ---- Rust: conversion of one contract type ----

const HELPERS = `
fn type_error(subject: &str, expected: &str) -> BindingError {
    BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: expected.to_owned() }
}

/// B-3: text is a str whose code points are Unicode scalar values.
fn text_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<String> {
    let Ok(text) = value.cast::<PyString>() else { return Err(binding_error(py, type_error(subject, "str"))) };
    match text.to_str() {
        Ok(text) => Ok(text.to_owned()),
        Err(_unpaired) => Err(binding_error(py, BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::UnpairedSurrogate })),
    }
}

/// B-3, T-1 latin1: a str whose characters are U+0000 to U+00FF, one byte each.
fn latin1_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<Vec<u8>> {
    let Ok(text) = value.cast::<PyString>() else { return Err(binding_error(py, type_error(subject, "str"))) };
    let above = || binding_error(py, BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::AboveLatin1 });
    let Ok(text) = text.to_str() else { return Err(above()) };
    text.chars().map(|character| u8::try_from(u32::from(character)).map_err(|_above| above())).collect()
}

/// T-7: bytes from the buffer protocol types bytes, bytearray and memoryview.
fn bytes_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<Vec<u8>> {
    if value.cast::<PyString>().is_ok() {
        return Err(binding_error(py, type_error(subject, "bytes")));
    }
    match value.extract::<Vec<u8>>() {
        Ok(bytes) => Ok(bytes),
        Err(_not_bytes) => Err(binding_error(py, type_error(subject, "bytes"))),
    }
}

/// T-1 source: a str, as its UTF-8 (B-3), or the bytes of bytes, bytearray or memoryview.
fn source_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<Vec<u8>> {
    if value.cast::<PyString>().is_ok() {
        return text_in(py, value, subject).map(String::into_bytes);
    }
    match value.extract::<Vec<u8>>() {
        Ok(bytes) => Ok(bytes),
        Err(_not_bytes) => Err(binding_error(py, type_error(subject, "str or bytes"))),
    }
}

/// T-1 cancel, GN-6aq: a future, an object with cancelled() and add_done_callback, as the Cancel of a pair whose
/// trigger fires when the future is cancelled: at once when it was cancelled before the call, and otherwise by a done
/// callback, which fires it when the future is cancelled and not when it has a result.
fn cancel_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<binding_core::Cancel> {
    let future = value.hasattr("cancelled")? && value.hasattr("add_done_callback")?;
    if !future {
        return Err(binding_error(py, type_error(subject, "a future")));
    }
    let (trigger, cancel) = binding_core::cancel_pair();
    if value.call_method0("cancelled")?.is_truthy()? {
        trigger.cancel();
        return Ok(cancel);
    }
    let done = pyo3::types::PyCFunction::new_closure(py, None, None, move |args: &Bound<'_, pyo3::types::PyTuple>, _kwargs: Option<&Bound<'_, pyo3::types::PyDict>>| -> PyResult<()> {
        if args.get_item(0)?.call_method0("cancelled")?.is_truthy()? {
            trigger.cancel();
        }
        Ok(())
    })?;
    value.call_method1("add_done_callback", (done,))?;
    Ok(cancel)
}

/// T-1 path, B-3, GN-6y: a str, bytes or os.PathLike, as the bytes of os.fsencode. A value that os.fsencode refuses
/// by its type is kind invalid_argument_type, a str that it cannot encode kind invalid_path, and binding_core judges
/// the bytes.
fn path_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<std::path::PathBuf> {
    let encoded = match py.import("os").and_then(|os| os.getattr("fsencode")).and_then(|fsencode| fsencode.call1((value,))) {
        Ok(encoded) => encoded,
        Err(error) if error.is_instance_of::<pyo3::exceptions::PyUnicodeError>(py) => {
            return Err(binding_error(py, BindingError::InvalidPath { subject: subject.to_owned() }));
        }
        Err(error) if error.is_instance_of::<pyo3::exceptions::PyTypeError>(py) => {
            return Err(binding_error(py, type_error(subject, "str, bytes or os.PathLike")));
        }
        Err(error) => return Err(error),
    };
    let bytes: Vec<u8> = encoded.extract()?;
    binding_core::path_from_bytes(bytes, subject).map_err(|error| binding_error(py, error))
}

/// U-2: an argument that the caller left out is None, whose value the core decides; any other value is converted.
fn default_in<'py, T>(value: &Given<'py>, item: impl FnOnce(&Bound<'py, PyAny>) -> PyResult<T>) -> PyResult<Option<T>> {
    match value {
        Given::Omitted => Ok(None),
        Given::Value(value) => item(value).map(Some),
    }
}

fn bool_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<bool> {
    match value.cast_exact::<PyBool>() {
        Ok(flag) => Ok(flag.is_true()),
        Err(_not_bool) => Err(binding_error(py, type_error(subject, "bool"))),
    }
}

/// B-2, GN-12a: an int that is not a bool, 0 to 2^53 - 1 for the contract type uint; any other value is kind
/// invalid_number.
fn uint_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<u64> {
    let invalid = || binding_error(py, BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint });
    if !value.is_exact_instance_of::<PyInt>() {
        return Err(invalid());
    }
    match value.extract::<u64>() {
        Ok(integer) if integer <= 9_007_199_254_740_991 => Ok(integer),
        _ => Err(invalid()),
    }
}

/// B-2, GN-12a: as uint_in, a safe integer for the contract type int.
fn int_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<i64> {
    let invalid = || binding_error(py, BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int });
    if !value.is_exact_instance_of::<PyInt>() {
        return Err(invalid());
    }
    match value.extract::<i64>() {
        Ok(integer) if integer.unsigned_abs() <= 9_007_199_254_740_991 => Ok(integer),
        _ => Err(invalid()),
    }
}

/// B-2, T-1: as int_in, the range of i64 for the contract type int64.
fn int64_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<i64> {
    let invalid = || binding_error(py, BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int });
    if !value.is_exact_instance_of::<PyInt>() {
        return Err(invalid());
    }
    value.extract::<i64>().map_err(|_out_of_range| invalid())
}

/// B-2: a float; an int or a bool is not a float.
fn float_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<f64> {
    match value.cast_exact::<PyFloat>() {
        Ok(float) => Ok(float.value()),
        Err(_not_float) => Err(binding_error(py, BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Float })),
    }
}

/// T-2: a list or a tuple, each item converted.
fn list_in<'py, T>(
    py: Python<'py>,
    value: &Bound<'py, PyAny>,
    subject: &str,
    item: impl Fn(Python<'py>, &Bound<'py, PyAny>) -> PyResult<T>,
) -> PyResult<Vec<T>> {
    if let Ok(list) = value.cast::<PyList>() {
        return list.iter().map(|value| item(py, &value)).collect();
    }
    if let Ok(tuple) = value.cast::<PyTuple>() {
        return tuple.iter().map(|value| item(py, &value)).collect();
    }
    Err(binding_error(py, type_error(subject, "list")))
}

/// T-2: None is the absence; any other value is converted.
/// GN-6t: a tuple is a tuple of exactly its parts.
fn tuple_in<'py, const N: usize>(py: Python<'py>, value: &Bound<'py, PyAny>, subject: &str) -> PyResult<[Bound<'py, PyAny>; N]> {
    let Ok(tuple) = value.cast::<PyTuple>() else { return Err(binding_error(py, type_error(subject, "tuple"))) };
    <[Bound<'py, PyAny>; N]>::try_from(tuple.iter().collect::<Vec<_>>()).map_err(|_other| binding_error(py, type_error(subject, &format!("a tuple of {N} items"))))
}

fn optional_in<'py, T>(value: &Bound<'py, PyAny>, item: impl FnOnce(&Bound<'py, PyAny>) -> PyResult<T>) -> PyResult<Option<T>> {
    if value.is_none() {
        return Ok(None);
    }
    item(value).map(Some)
}

fn text_out<'py>(py: Python<'py>, value: impl AsRef<str>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyString::new(py, value.as_ref()).into_any())
}

/// T-1 latin1: each byte is one character.
fn latin1_out<'py>(py: Python<'py>, value: impl AsRef<[u8]>) -> PyResult<Bound<'py, PyAny>> {
    let text: String = value.as_ref().iter().map(|byte| char::from(*byte)).collect();
    Ok(PyString::new(py, &text).into_any())
}

fn bytes_out<'py>(py: Python<'py>, value: impl AsRef<[u8]>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyBytes::new(py, value.as_ref()).into_any())
}

/// T-1 path, GN-6y: the str of os.fsdecode of the bytes of the path.
fn path_out<'py>(py: Python<'py>, value: impl AsRef<std::path::Path>) -> PyResult<Bound<'py, PyAny>> {
    let bytes = PyBytes::new(py, binding_core::path_bytes(value.as_ref()));
    py.import("os")?.getattr("fsdecode")?.call1((bytes,))
}

fn bool_out<'py>(py: Python<'py>, value: impl Borrow<bool>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyBool::new(py, *value.borrow()).to_owned().into_any())
}

fn uint_out<'py>(py: Python<'py>, value: impl WideUint) -> PyResult<Bound<'py, PyAny>> {
    Ok(value.widen_uint().into_pyobject(py)?.into_any())
}

fn int_out<'py>(py: Python<'py>, value: impl WideInt) -> PyResult<Bound<'py, PyAny>> {
    Ok(value.widen_int().into_pyobject(py)?.into_any())
}

fn float_out<'py>(py: Python<'py>, value: impl Borrow<f64>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyFloat::new(py, *value.borrow()).into_any())
}

fn none_out(py: Python<'_>) -> PyResult<Bound<'_, PyAny>> {
    Ok(py.None().into_bound(py))
}

fn list_out<'py, T>(py: Python<'py>, value: impl IntoIterator<Item = T>, item: impl Fn(Python<'py>, T) -> PyResult<Bound<'py, PyAny>>) -> PyResult<Bound<'py, PyAny>> {
    let items = value.into_iter().map(|value| item(py, value)).collect::<PyResult<Vec<_>>>()?;
    Ok(PyList::new(py, items)?.into_any())
}

/// T-2: a dict in its order whose keys are str; any other key is kind invalid_argument_type.
fn map_in<'py, T>(
    py: Python<'py>,
    value: &Bound<'py, PyAny>,
    subject: &str,
    item: impl Fn(Python<'py>, &Bound<'py, PyAny>) -> PyResult<T>,
) -> PyResult<binding_core::OrderedMap<T>> {
    let Ok(dict) = value.cast::<PyDict>() else { return Err(binding_error(py, type_error(subject, "dict"))) };
    let mut map = binding_core::OrderedMap::new();
    for (key, value) in dict.iter() {
        if !key.is_exact_instance_of::<PyString>() {
            return Err(binding_error(py, type_error(subject, "a dict whose keys are str")));
        }
        let key = text_in(py, &key, subject)?;
        let value = item(py, &value)?;
        if map.insert(key, value).is_some() {
            return Err(binding_error(py, BindingError::Internal { detail: String::from("a dict gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a map, owned or borrowed, as a dict in its order.
fn map_out<'py, T>(
    py: Python<'py>,
    value: impl Borrow<binding_core::OrderedMap<T>>,
    item: impl Fn(Python<'py>, &T) -> PyResult<Bound<'py, PyAny>>,
) -> PyResult<Bound<'py, PyAny>> {
    let dict = PyDict::new(py);
    for (key, value) in value.borrow().iter() {
        dict.set_item(PyString::new(py, key), item(py, value)?)?;
    }
    Ok(dict.into_any())
}

/// T-2, U-7 (c): a dict in its order, each key an int (not a bool), bytes or a str of a kind that the contract lists;
/// any other key is kind invalid_argument_type.
fn keyed_map_in<'py, T>(
    py: Python<'py>,
    value: &Bound<'py, PyAny>,
    subject: &str,
    kinds: &[u8],
    expected: &str,
    item: impl Fn(Python<'py>, &Bound<'py, PyAny>) -> PyResult<T>,
) -> PyResult<binding_core::KeyedMap<T>> {
    let Ok(dict) = value.cast::<PyDict>() else { return Err(binding_error(py, type_error(subject, "dict"))) };
    let mut map = binding_core::KeyedMap::new();
    for (key, value) in dict.iter() {
        // GN-12a: an int key of a listed int is a safe integer, else kind invalid_number.
        let (tag, key) = if key.is_exact_instance_of::<PyInt>() && kinds.contains(&0) {
            (0, binding_core::Key::Int(int_in(py, &key, subject)?))
        } else if let Ok(bytes) = key.cast_exact::<PyBytes>() {
            (1, binding_core::Key::Bytes(bytes.as_bytes().to_vec()))
        } else if key.is_exact_instance_of::<PyString>() {
            (2, binding_core::Key::Text(text_in(py, &key, subject)?))
        } else {
            return Err(binding_error(py, type_error(subject, expected)));
        };
        if !kinds.contains(&tag) {
            return Err(binding_error(py, type_error(subject, expected)));
        }
        let value = item(py, &value)?;
        if map.insert(key, value).is_some() {
            return Err(binding_error(py, BindingError::Internal { detail: String::from("a dict gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a keyed map, owned or borrowed, as a dict in its order: int, bytes and str keys.
fn keyed_map_out<'py, T>(
    py: Python<'py>,
    value: impl Borrow<binding_core::KeyedMap<T>>,
    item: impl Fn(Python<'py>, &T) -> PyResult<Bound<'py, PyAny>>,
) -> PyResult<Bound<'py, PyAny>> {
    let dict = PyDict::new(py);
    for (key, value) in value.borrow().iter() {
        let key: Bound<'py, PyAny> = match key {
            binding_core::Key::Int(integer) => integer.into_pyobject(py)?.into_any(),
            binding_core::Key::Bytes(bytes) => PyBytes::new(py, bytes).into_any(),
            binding_core::Key::Text(text) => PyString::new(py, text).into_any(),
        };
        dict.set_item(key, item(py, value)?)?;
    }
    Ok(dict.into_any())
}

fn tuple_out<'py>(py: Python<'py>, items: Vec<Bound<'py, PyAny>>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyTuple::new(py, items)?.into_any())
}

fn optional_out<'py, T>(py: Python<'py>, value: Option<T>, item: impl FnOnce(Python<'py>, T) -> PyResult<Bound<'py, PyAny>>) -> PyResult<Bound<'py, PyAny>> {
    match value {
        Some(value) => item(py, value),
        None => none_out(py),
    }
}
`;

// U-2: PyO3 reads Option<T> of an argument as None for the None that the caller passes, so an argument that may be left
// out has a type of its own, which takes every value and whose default is Omitted.
const GIVEN = `
/// U-2: an argument that the caller may leave out; None, which a caller passes, is a value that the binding judges.
enum Given<'py> {
    Omitted,
    Value(Bound<'py, PyAny>),
}

impl<'a, 'py> FromPyObject<'a, 'py> for Given<'py> {
    type Error = std::convert::Infallible;

    fn extract(value: Borrowed<'a, 'py, PyAny>) -> Result<Self, Self::Error> {
        Ok(Self::Value(value.to_owned()))
    }
}
`;

function convertIn(model: Model, type: Type, value: string, subject: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'text_in', latin1: 'latin1_in', bool: 'bool_in', uint: 'uint_in', int: 'int_in', int64: 'int64_in', bytes: 'bytes_in', source: 'source_in', float: 'float_in', path: 'path_in', cancel: 'cancel_in' };
    return `${fn[type]}(py, ${value}, ${subject})`;
  }
  if ('list' in type) return `list_in(py, ${value}, ${subject}, ${closure(['py', 'item'], boxed(model, type.list, convertIn(model, type.list, 'item', subject)))})`;
  if ('map' in type) return `map_in(py, ${value}, ${subject}, ${closure(['py', 'item'], convertIn(model, type.map, 'item', subject))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `keyed_map_in(py, ${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`a dict whose keys are ${type.key.map((k) => ({ int: 'int', bytes: 'bytes', text: 'str' })[k] ?? k).join(' or ')}`)}, ${closure(['py', 'item'], convertIn(model, type.keyed_map, 'item', subject))})`;
  }
  if ('optional' in type) return `optional_in(${value}, ${closure(['value'], boxed(model, type.optional, convertIn(model, type.optional, 'value', subject)))})`;
  if ('function' in type) return functionIn(model, type.function, value, subject);
  if ('tuple' in type) return tupleIn(type.tuple, `tuple_in(py, ${value}, ${subject})`, (part, name) => convertIn(model, part, `&${name}`, subject));
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum' || unit?.origin === 'callback' || objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined || interfaceOf(model, type) !== undefined) {
    return `${unitFn('in', unit ?? { name: [] }, aliasOf(model, type)?.library)}(py, ${value}, ${subject})`;
  }
  if (unit?.kind === 'record' || unit?.kind === 'variant') return `${unitFn('in', unit, libraryOf(type))}(py, ${value}, ${subject})`;
  throw new Unsupported(`no Python input conversion for ${JSON.stringify(type)}`);
}

// GN-6z: a function holds the callable that entered; a call converts the arguments out and the result in, and an
// exception of the Python code, or a failure of the binding in the call, goes to the core as a Raised.
function functionIn(model: Model, type: { parameters: Type[]; returns: Type }, value: string, subject: string): string {
  const result = type.returns === 'none' ? '()' : rustType(model, type.returns);
  const names = type.parameters.map((_p, i) => `argument_${String(i)}`);
  const params = type.parameters.map((p, i) => `${names[i] ?? ''}: ${traitParam(model, p)}`);
  const outs = type.parameters.map((p, i) => `${convertOut(model, p, names[i] ?? '')}?`);
  const returned = type.returns === 'none' ? 'Ok(())' : convertIn(model, type.returns, '&returned', subject.startsWith('"') ? `${subject.slice(0, -1)} returns"` : '"the function returns"');
  return `kept_function_in(py, ${value}, ${subject}).map(|object| -> ${rustType(model, { function: { ...type, async_allowed: false } })} {
            Box::new(move |${params.join(', ')}| -> Result<${result}, binding_core::Failure<${model.coreError ?? '()'}>> {
                Python::attach(|py| {
                    let call = || -> PyResult<${result}> {
                        let returned = object.bind(py).call1((${outs.join(', ')}${outs.length === 1 ? ',' : ''}))?;
                        ${type.returns === 'none' ? "let _returned: Bound<'_, PyAny> = returned;\n                        " : ''}${returned}
                    };
                    call().map_err(|error| thrown(py, error))
                })
            })
        })`;
}

const FUNCTION_IN = `
/// GN-6z: a value of a function type is callable (kind invalid_argument_type); the function holds it.
fn kept_function_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<Py<PyAny>> {
    if !value.is_callable() {
        return Err(binding_error(py, BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from("a callable") }));
    }
    Ok(value.clone().unbind())
}
`;

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'text_out', latin1: 'latin1_out', bool: 'bool_out', uint: 'uint_out', int: 'int_out', int64: 'int_out', bytes: 'bytes_out', float: 'float_out', path: 'path_out', none: 'none_out' };
    // T-2 never: the core's Infallible has no value, so the call has failed before.
    if (type === 'never') return `match ${value} {}`;
    return type === 'none' ? 'none_out(py)' : `${fn[type]}(py, ${value})`;
  }
  // GN-6ae: a result passthrough leaves the table of the binding as the value that the function returned.
  if ('passthrough' in type) return `passed_out(py, ${value})`;
  if ('list' in type) return `list_out(py, ${value}, ${closure(['py', 'item'], convertOut(model, type.list, 'item'))})`;
  // The value of a keyed map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('keyed_map' in type) return `keyed_map_out(py, ${value}, |py, item| ${convertOut(model, type.keyed_map, 'item')})`;
  if ('map' in type) return `map_out(py, ${value}, |py, item| ${convertOut(model, type.map, 'item')})`;
  if ('optional' in type) return `optional_out(py, ${optionRef(value)}, ${closure(['py', 'value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) {
    return tupleOut(type.tuple, value, (t, name) => convertOut(model, t, name), (parts) => `tuple_out(py, vec![${parts.join(', ')}])`);
  }
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `out_${rustField(unit.name)}(py, ${value})`;
  if (unit?.kind === 'record' || unit?.kind === 'variant') return `${unitFn('out', unit, libraryOf(type))}(py, ${value})`;
  if ((objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined) && unit !== undefined) return `${unitFn('out', unit, aliasOf(model, type)?.library)}(py, ${value})`;
  throw new Unsupported(`no Python output conversion for ${JSON.stringify(type)}`);
}

function enumRust(model: Model, unit: Unit): string {
  const name = rustField(unit.name);
  const core = unit.core_type ?? '';
  const pyClass = langName('python', unit.name, 'class');
  const arms = (unit.variants ?? []).map((v) => `        ${rustString(v.value)} => Ok(${core}::${rustVariant(v.name)}),`).join('\n');
  const outArms = (unit.variants ?? []).map((v) => `        ${core}::${rustVariant(v.name)} => ${rustString(langName('python', v.name, 'constant'))},`).join('\n');
  return `
/// T-6: a value of the enum ${pyClass}, which is an instance of the class itself; any other value is refused.
fn in_${name}(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<${core}> {
    let class = types(py)?.getattr(${rustString(pyClass)})?;
    if !value.is_instance(&class)? {
        return Err(binding_error(py, BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(pyClass)}) }));
    }
    let raw = value.getattr("value")?;
    let text: String = text_in(py, &raw, subject)?;
    match text.as_str() {
${arms}
        _ => Err(binding_error(py, BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(pyClass)}) })),
    }
}

fn out_${name}(py: Python<'_>, value: impl Borrow<${core}>) -> PyResult<Bound<'_, PyAny>> {
    let member = match value.borrow() {
${outArms}
    };
    types(py)?.getattr(${rustString(pyClass)})?.getattr(member)
}
`;
}

// T-4: the result form of a record, a frozen dataclass of _types that takes every field by name.
function recordRust(model: Model, unit: Unit, library?: string): string {
  const name = recordFn(unit);
  const typesOf = library === undefined ? 'types(py)?' : `foreign_types(py, ${rustString(`${(model.foreign.get(library)?.packages['python'] as { module: string }).module}._types`)})?`;
  const core = unit.core_type ?? '';
  const pyClass = langName('python', unit.name, 'class');
  const fields = unit.fields ?? [];
  const reads = fields.map((f) => {
    const attr = langName('python', f.name, 'variable');
    return `    let ${rustField(f.name)}: ${rustType(model, f.type)} = ${convertIn(model, f.type, `&value.getattr(${rustString(attr)})?`, 'subject')}?;${narrows(f.type) ? `\n    ${narrowed(rustField(f.name), rustString(attr), '|error| binding_error(py, error)')}` : ''}`;
  });
  const writes = fields.map((f) => `    fields.set_item(${rustString(langName('python', f.name, 'variable'))}, ${convertOut(model, f.type, `${byValue(model, f.type) ? "" : "&"}value.${rustField(f.name)}`)}?)?;`);
  return `
/// T-4: a value of the record ${pyClass} is an instance of the class itself; its fields are judged as they enter (T-8).
fn in_${name}(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<${core}> {
    let class = ${typesOf}.getattr(${rustString(pyClass)})?;
    if !value.is_instance(&class)? {
        return Err(binding_error(py, BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(pyClass)}) }));
    }
${reads.join('\n')}
    Ok(${core} { ${fields.map((f) => rustField(f.name)).join(', ')} })
}

fn out_${name}<'py>(py: Python<'py>, value: impl Borrow<${core}>) -> PyResult<Bound<'py, PyAny>> {
    let value = value.borrow();
    let fields = PyDict::new(py);
${writes.join('\n')}
    ${typesOf}.getattr(${rustString(pyClass)})?.call((), Some(&fields))
}
`;
}

// T-9, GN-6v: a value of a variant is an instance of the dataclass of one of its cases, whose fields are judged as they
// enter (T-8); a value leaves as the instance of the class of its case, by a match without a wildcard.
function variantRust(model: Model, variant: Variant): string {
  const name = recordFn(variant.unit);
  const core = variant.unit.core_type ?? '';
  const pyName = langName('python', variant.unit.name, 'class');
  const ins = variant.cases.map((kase) => {
    const fields = caseFields(model, variant, kase);
    const reads = fields.map((f) => `        let ${f.variable}: ${caseType(model, f)} = ${caseRead(f, `${convertIn(model, f.field.type, `&value.getattr(${rustString(langName('python', f.field.name, 'variable'))})?`, 'subject')}?`)};${f.boxed === undefined && narrows(f.field.type) ? `\n        ${narrowed(f.variable, rustString(langName('python', f.field.name, 'variable')), '|error| binding_error(py, error)')}` : ''}`);
    return `    if value.is_instance(&types.getattr(${rustString(langName('python', kase.unit.name, 'class'))})?)? {
${reads.map((r) => `${r}\n`).join('')}        return Ok(${caseStruct(variant, kase, fields)});
    }`;
  });
  const arms = variant.cases.map((kase) => {
    const fields = caseFields(model, variant, kase);
    const writes = fields.map((f) => `            fields.set_item(${rustString(langName('python', f.field.name, 'variable'))}, ${caseWritten(f, convertOut(model, f.field.type, caseValue(model, f)))}?)?;`);
    const pyClass = rustString(langName('python', kase.unit.name, 'class'));
    return `${fields.length === 0 ? `        ${UNIT_CASE_ALLOW}\n` : ''}        ${caseStruct(variant, kase, fields)} => ${writes.length === 0 ? `${pyClass},` : `{\n${writes.join('\n')}\n            ${pyClass}\n        }`}`;
  });
  return `
/// T-9: a value of the variant ${pyName} is an instance of the class of one of its cases; its fields are judged as they enter (T-8).
fn in_${name}(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<${core}> {
    let types = types(py)?;
${ins.join('\n')}
    Err(binding_error(py, BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(pyName)}) }))
}

/// T-9: a value of the variant ${pyName} leaves as the instance of the class of its case.
fn out_${name}<'py>(py: Python<'py>, value: impl Borrow<${core}>) -> PyResult<Bound<'py, PyAny>> {
    let fields = PyDict::new(py);
    let class = match value.borrow() {
${arms.join('\n')}
    };
    types(py)?.getattr(class)?.call((), Some(&fields))
}
`;
}

const fieldInit = (field: string, variable: string): string => (field === variable ? field : `${field}: ${variable}`);

// N-4 iterate: __iter__ gives the items, or the keys of the entries with items() for the pairs, as a dict does; the
// items are converted when the iteration starts, a snapshot of the class's value.
function iterateRust(model: Model, fn: Fn): string {
  const yields = fn.yields ?? { value: 'none' };
  const call = armedCall(model, fn, `${fn.corePath}(${coreCallArgs(model, fn, () => '', 'self.inner').join(', ')})`);
  const item = (type: Type, value: string): string => `${convertOut(model, type, borrowedItem(model, type, value))}?`;
  const iter = (body: string): string => `
        guard(py, || {${locks(model, fn).map((l) => `\n    ${l}`).join('')}
            let items = PyList::empty(py);
            for item in ${call} {
${body}
            }
            Ok(items.try_iter()?.into_any())
        })`;
  if (yields.key === undefined) {
    return `
    fn __iter__<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyAny>> {${iter(`                items.append(${item(yields.value, 'item')})?;`)}
    }
`;
  }
  return `
    fn __iter__<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyAny>> {${iter(`                let (key, _value) = item;
                items.append(${item(yields.key, 'key')})?;`)}
    }

    fn items<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyAny>> {${iter(`                let (key, value) = item;
                items.append(PyTuple::new(py, [${item(yields.key, 'key')}, ${item(yields.value, 'value')}])?)?;`)}
    }
`;
}

// GN-6h: the name of a class in the message of kind busy and of a poisoned object.
const classLabel = (object: ObjectClass): string => langName('python', object.unit.name, 'class');

// GN-6h: the lines that take the locks of the places of a call.
const locks = (model: Model, fn: Fn): string[] =>
  lockLines(model, fn, (p) => rustIdent(langName('python', p.name, 'variable')), 'self.inner', '|error| binding_error(py, error)', classLabel);

const functionRust = (model: Model, fn: Fn): string => withFaults(model, fn, entryRust(model, fn));

function entryRust(model: Model, fn: Fn): string {
  if (fn.kind === 'iterate') return iterateRust(model, fn);
  // N-4: the string form is __str__.
  const name = memberName('python', fn);
  // U-2: a parameter that may be left out has the default Given::Omitted, so None, which the caller passes, is a value.
  const declare = (a: Arg): string => `${rustIdent(langName('python', a.name, 'variable'))}${a.default === undefined ? '' : ' = Given::Omitted'}`;
  const positional = fn.args.filter((a) => !a.field).map(declare);
  const keyword = fn.args.filter((a) => a.field).map(declare);
  const signature = keyword.length === 0 ? positional.join(', ') : [...positional, '*', ...keyword].join(', ');
  const params = fn.args.map((a) => `, ${rustIdent(langName('python', a.name, 'variable'))}: ${a.default === undefined ? "&Bound<'py, PyAny>" : "Given<'py>"}`).join('');
  const lines: string[] = [];
  for (const arg of fn.args) {
    const variable = rustIdent(langName('python', arg.name, 'variable'));
    const subject = rustString(langName('python', arg.name, 'variable'));
    const held = arg.field ? undefined : heldParam(model, arg.type);
    // GN-6ae: a function parameter whose function returns passthrough is the closure that the machine of the member calls.
    if (machineFunction(arg.type)) {
      lines.push(...functionClosure(model, arg.type, variable, subject));
      continue;
    }
    // GN-6aa: a callback parameter with keeps moves into the core as its box, as a callback field of a record does.
    const keptDirect = !arg.field && unitOf(model, arg.type)?.origin === 'callback' && fn.params.some((p) => p.keeps === true && p.name.join('_') === arg.name.join('_'));
    const converted = arg.default === undefined ? (arg.field || keptDirect ? boxed(model, arg.type, convertIn(model, arg.type, variable, subject)) : convertIn(model, arg.type, variable, subject)) : leftOut(arg, `default_in(&${variable}, ${closure(['value'], convertIn(model, arg.type, 'value', subject))})`);
    lines.push(held === undefined
      ? `        let ${variable}: ${keptDirect ? rustType(model, arg.type, true) : argType(model, arg)} = ${converted}?;`
      : `        let ${variable} = held_${rustField(held.unit.name)}(py, ${variable}, ${subject})?;`);
    if (held === undefined && (arg.field ? narrows(arg.type) : arg.default === undefined && narrows(arg.type))) lines.push(`        ${narrowed(variable, subject, '|error| binding_error(py, error)')}`);
  }
  if (fn.record !== undefined) {
    const recordType = fn.record.unit.core_type ?? '';
    const recordLet = rustType(model, { unit: fn.record.unit.id });
    const fields = (fn.record.unit.fields ?? []).map((f) => fieldInit(rustField(f.name), rustIdent(langName('python', f.name, 'variable')))).join(', ');
    lines.push(`        let ${rustField(fn.record.param.name)}: ${recordLet} = ${recordType} { ${fields} };`);
  }
  lines.push(...locks(model, fn));
  const core = `${fn.corePath}(${coreCallArgs(model, fn, (p) => rustIdent(langName('python', p.name, 'variable')), 'self.inner').join(', ')})`;
  const armed = armedCall(model, fn, core);
  // GN-6m, GN-6n: the core call of a member that waits runs without the GIL, so other Python threads run while it
  // waits; the future of an async member runs on the runtime of binding_core.
  // GN-6ae: a value that a function of the member returned is settled on the event loop of the caller of a<name>.
  const onLoop = settles(fn);
  const settled = onLoop ? `|value| settled(py, value, ${ON_LOOP}, ${rustString(functionArgs(fn).map((a) => langName('python', a.name, 'variable')).join(' or '))}, ${rustString(awaitedName(fn))})` : undefined;
  const call = waitsAsync(fn) ? drivenCall(model, fn, core, (wait) => `py.detach(|| ${wait})`, '|error| binding_error(py, error)', settled) : waitsIo(fn) ? `py.detach(|| ${armed})` : armed;
  if (fn.fallible) {
    lines.push(`        ${resultLet(fn)} = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(${fn.failure ? 'failure_error' : 'core_error'}(py, error)),\n        };`);
  } else {
    // E-1c: a core that returns nothing is bound as the unit, so a Result that it returns does not compile.
    lines.push(`        ${resultLet(fn)} = ${call};`);
  }
  if (fn.kind === 'constructor') {
    lines.push(`        Ok(Self { inner: ${heldNew(objectUnit(model, { unit: fn.unit.id }) ?? { unit: fn.unit, members: [], constructible: true }, 'result')} })`);
    return `
    #[new]
    #[pyo3(signature = (${signature}))]
    fn new<'py>(py: Python<'py>${params}) -> PyResult<Self> {
        guard(py, || {
${lines.map((l) => `    ${l}`).join('\n')}
        })
    }
`;
  }
  lines.push(`        ${convertOut(model, fn.returns, 'result')}`);
  const passed = fn.args.map((a) => `, ${rustIdent(langName('python', a.name, 'variable'))}`).join('');
  const loopSignature = signature === '' ? `${ON_LOOP}, /` : `${ON_LOOP}, /, ${signature}`;
  const loopParam = `, ${ON_LOOP}: Option<&Bound<'py, PyAny>>`;
  if (fn.kind === 'function') {
    return onLoop ? `
#[pyfunction(name = ${rustString(name)})]
#[pyo3(signature = (${signature}))]
fn function_${name}<'py>(py: Python<'py>${params}) -> PyResult<Bound<'py, PyAny>> {
    loop_function_${name}(py, None${passed})
}

/// GN-6ae: ${name} with the event loop on which a value that its function returned is awaited; None is no loop.
#[pyfunction(name = ${rustString(onLoopName(name))}, signature = (${loopSignature}))]
fn loop_function_${name}<'py>(py: Python<'py>${loopParam}${params}) -> PyResult<Bound<'py, PyAny>> {
    guard(py, || {
${lines.join('\n')}
    })
}
${awaitedFunction(fn, name, true)}` : `
#[pyfunction(name = ${rustString(name)})]
#[pyo3(signature = (${signature}))]
fn function_${name}<'py>(py: Python<'py>${params}) -> PyResult<Bound<'py, PyAny>> {
    guard(py, || {
${lines.join('\n')}
    })
}
${awaits(fn) ? awaitedFunction(fn, name, false) : ''}`;
  }
  // GN-6: the Rust name of a method is member_<name> and its Python name an attribute, so that no name of a member meets
  // a naming convention of the lints for methods (from_*, to_*, into_*, is_*, the names of std traits); a hook keeps
  // the name that Python calls (N-4).
  const pyName = rustString(name);
  const attributes = fn.special === 'stringify' ? [] : ({ static: ['#[staticmethod]', `#[pyo3(name = ${pyName}, signature = (${signature}))]`], method: [`#[pyo3(name = ${pyName}, signature = (${signature}))]`], property: [`#[getter(${name})]`] }[fn.kind] ?? []);
  const self = fn.receiver === undefined ? '' : '&self, ';
  const ident = fn.special === 'stringify' ? name : `member_${name}`;
  if (onLoop) {
    const onto = fn.receiver === undefined ? 'Self::' : 'self.';
    return `
${attributes.map((a) => `    ${a}`).join('\n')}
    fn ${ident}<'py>(${self}py: Python<'py>${params}) -> PyResult<Bound<'py, PyAny>> {
        ${onto}on_loop_${name}(py, None${passed})
    }

    /// GN-6ae: ${name} with the event loop on which a value that its function returned is awaited; None is no loop.
${fn.receiver === undefined ? '    #[staticmethod]\n' : ''}    #[pyo3(name = ${rustString(onLoopName(name))}, signature = (${loopSignature}))]
    fn on_loop_${name}<'py>(${self}py: Python<'py>${loopParam}${params}) -> PyResult<Bound<'py, PyAny>> {
        guard(py, || {
${lines.map((l) => `    ${l}`).join('\n')}
        })
    }
${awaitedMethod(fn, name, true)}`;
  }
  return `
${attributes.map((a) => `    ${a}`).join('\n')}
    fn ${ident}<'py>(${self}py: Python<'py>${params}) -> PyResult<Bound<'py, PyAny>> {
        guard(py, || {
${lines.map((l) => `    ${l}`).join('\n')}
        })
    }
${awaits(fn) ? awaitedMethod(fn, name, false) : ''}`;
}

// GN-6m: the Python name of the awaitable of a member that waits; CK-16 keeps it apart from every other name.
export const awaitedName = (fn: Fn): string => `a${memberName('python', fn)}`;

// GN-6ae: the parameter of the event loop of the entry _<name>_on_loop. It ends with an underscore, which no name of a
// contract does, and is positional only, so that it meets no parameter of the member.
const ON_LOOP = 'event_loop_';

// GN-6ae: the Python name of the entry of a member that takes the event loop of the caller of a<name>; it starts with an
// underscore, which no name of a contract does.
const onLoopName = (name: string): string => `_${name}_on_loop`;

// GN-6ae: the parameters of a function type of a member, and whether the driver settles a value that one of them
// returned on an event loop: the function may return an awaitable (async_allowed).
const functionArgs = (fn: Fn): Arg[] => fn.args.filter((a) => machineFunction(a.type));
const settles = (fn: Fn): boolean => fn.machine === true && functionArgs(fn).some((a) => machineFunction(a.type) && a.type.function.async_allowed);

// GN-6m: a<name> of a function runs <name> in asyncio.to_thread; the arguments are judged when <name> runs. GN-6ae:
// a<name> of a member whose function may return an awaitable runs _<name>_on_loop there with the running event loop.
const awaitedFunction = (fn: Fn, name: string, onLoop: boolean): string => `
#[pyfunction(name = ${rustString(`a${name}`)}, signature = (*args, **kwargs))]
fn function_a${name}<'py>(py: Python<'py>, args: &Bound<'py, PyTuple>, kwargs: Option<&Bound<'py, PyDict>>) -> PyResult<Bound<'py, PyAny>> {
    ${onLoop ? `awaited_on_loop(py, wrap_pyfunction!(loop_function_${name}, py)?.into_any(), args, kwargs)` : `${awaitedBy(fn)}(py, wrap_pyfunction!(function_${name}, py)?.into_any(), args, kwargs)`}
}
`;

// GN-6m: asyncio.to_thread runs a member that waits for I/O, and a thread of its own a member that waits for another
// process, which would hold a thread of the executor that every to_thread shares.
const awaitedBy = (fn: Fn): string => (waitsProcess(fn) ? 'awaited_apart' : 'awaited');

// GN-6m: a<name> of a method or a static method runs the bound <name> in asyncio.to_thread.
function awaitedMethod(fn: Fn, name: string, onLoop: boolean): string {
  const [via, member] = onLoop ? ['awaited_on_loop', onLoopName(name)] : [awaitedBy(fn), name];
  const attribute = `#[pyo3(name = ${rustString(`a${name}`)}, signature = (*args, **kwargs))]`;
  if (fn.receiver === undefined) {
    return `
    #[staticmethod]
    ${attribute}
    fn member_a${name}<'py>(py: Python<'py>, args: &Bound<'py, PyTuple>, kwargs: Option<&Bound<'py, PyDict>>) -> PyResult<Bound<'py, PyAny>> {
        ${via}(py, py.get_type::<Self>().getattr(${rustString(member)})?, args, kwargs)
    }
`;
  }
  return `
    ${attribute}
    fn member_a${name}<'py>(slf: &Bound<'py, Self>, args: &Bound<'py, PyTuple>, kwargs: Option<&Bound<'py, PyDict>>) -> PyResult<Bound<'py, PyAny>> {
        ${via}(slf.py(), slf.getattr(${rustString(member)})?, args, kwargs)
    }
`;
}

// GN-6m: asyncio.to_thread(member, *args, **kwargs), the awaitable that runs a member that waits in a thread.
const AWAITED = `
/// GN-6m: an awaitable that runs a member that waits in a thread of asyncio, so that the event loop does not block.
fn awaited<'py>(py: Python<'py>, member: Bound<'py, PyAny>, args: &Bound<'py, PyTuple>, kwargs: Option<&Bound<'py, PyDict>>) -> PyResult<Bound<'py, PyAny>> {
    let mut all = vec![member];
    all.extend(args.iter());
    let all = PyTuple::new(py, all)?;
    py.import("asyncio")?.getattr("to_thread")?.call(all, kwargs)
}

/// GN-6m, B-5 (b): an awaitable that runs a member that waits for another process on a thread of its own, which gives
/// its result or its exception to a future of the running loop; a future that was cancelled takes none, and a loop
/// that was closed before the member ended takes none either: nothing awaits the future then, so the thread drops
/// the result, and only that failure of call_soon_threadsafe is caught. The source is compiled at each call, which
/// costs little beside a wait for a process.
fn awaited_apart<'py>(py: Python<'py>, member: Bound<'py, PyAny>, args: &Bound<'py, PyTuple>, kwargs: Option<&Bound<'py, PyDict>>) -> PyResult<Bound<'py, PyAny>> {
    let source = cr#"
import asyncio
import threading
async def awaited_apart(member, args, kwargs):
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    def settle(result, error):
        if future.cancelled():
            return
        if error is None:
            future.set_result(result)
        else:
            future.set_exception(error)
    def give(result, error):
        try:
            loop.call_soon_threadsafe(settle, result, error)
        except RuntimeError:
            if not loop.is_closed():
                raise
    def run():
        try:
            result = member(*args, **(kwargs or {}))
        except BaseException as error:
            give(None, error)
        else:
            give(result, None)
    threading.Thread(target=run).start()
    return await future
"#;
    let module = PyModule::from_code(py, source, c"awaited_apart.py", c"awaited_apart")?;
    module.getattr("awaited_apart")?.call1((member, args, kwargs))
}
`;

// T-5: a class unit is a class of the native module that holds the core value; its members call the core (U-2).
function objectRust(model: Model, layout: PythonLayout, object: ObjectClass, givesOut: boolean): string {
  const pyClass = langName('python', object.unit.name, 'class');
  const struct = `Py${pyClass}`;
  const core = object.unit.core_type ?? '';
  const members = object.members.map((fn) => functionRust(model, fn)).join('');
  return `
/// T-5: ${pyClass}${object.constructible ? '' : ', which only its static members make (U-1 constructible)'}.
#[pyclass(name = ${rustString(pyClass)}, module = ${rustString(unitModule(layout, object.unit))}, frozen)]
pub struct ${struct} {
    inner: ${heldType(object)},
}
${object.lock?.kind === 'shared' ? `
/// GN-6h: calls read the value of ${pyClass} at the same time, so its core type is Sync.
const _: () = {
    const fn sync<T: Sync>() {}
    sync::<${core}>();
};
` : ''}
#[pymethods]
impl ${struct} {${members}}
${object.cleanup === undefined ? '' : `
/// GN-6p, B-10: an object finalized without its cleanup call warns with ResourceWarning, and dropping the value releases
/// its resource; an exception that is being raised is kept across the warning.
impl Drop for ${struct} {
    fn drop(&mut self) {
        if !self.inner.${cleanupMade(object)}() {
            Python::attach(|py| {
                let raising = PyErr::take(py);
                if let Err(error) = PyErr::warn(py, &py.get_type::<pyo3::exceptions::PyResourceWarning>(), c${JSON.stringify(cleanupWarning(pyClass, memberName('python', object.cleanup)))}, 1) {
                    error.write_unraisable(py, None);
                }
                if let Some(raising) = raising {
                    raising.restore(py);
                }
            });
        }
    }
}
`}
${givesOut ? `
fn out_${rustField(object.unit.name)}(py: Python<'_>, value: impl CoreForm<${core}>) -> PyResult<Bound<'_, PyAny>> {
    Ok(Bound::new(py, ${struct} { inner: ${heldNew(object, 'value.core_form()')} })?.into_any())
}
` : ''}
${takesNested(model, object) ? `/// T-5, GN-6h: a value of the class ${pyClass} inside another type is an instance of it, whose value is read, cloned and
/// released.
fn in_${rustField(object.unit.name)}(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<${core}> {
    match value.cast::<${struct}>() {
        Ok(object) => match object.get().inner.read(${rustString(pyClass)}, &[]) {
            Ok(held) => Ok((*held).clone()),
            Err(error) => Err(binding_error(py, error)),
        },
        Err(_other) => Err(binding_error(py, BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(pyClass)}) })),
    }
}
` : ''}${takesHeld(model, object) ? `
/// T-5, GN-6h: a parameter of the class ${pyClass} takes an instance of it, whose lock the call takes.
fn held_${rustField(object.unit.name)}(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<${heldType(object)}> {
    match value.cast::<${struct}>() {
        Ok(object) => Ok(object.get().inner.clone()),
        Err(_other) => Err(binding_error(py, BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(pyClass)}) })),
    }
}
` : ''}`;
}

// GN-6ap: a value of a generated interface is an instance of a class that implements it; the core takes the From of
// the value that the instance holds.
function interfaceRust(model: Model, iface: Unit): string {
  const pyName = langName('python', iface.name, 'class');
  const core = iface.core_type ?? '';
  return `
/// GN-6ap: a value of the interface ${pyName} is an instance of a class that implements it, whose value the core takes
/// as ${core}.
fn in_${rustField(iface.name)}(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<${core}> {
${implementorsOf(model, iface).map((o) => `    if value.cast::<Py${langName('python', o.unit.name, 'class')}>().is_ok() {
        return in_${rustField(o.unit.name)}(py, value, subject).map(|held| <${core} as From<&${o.unit.core_type ?? ''}>>::from(&held));
    }
`).join('')}    Err(binding_error(py, BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(pyName)}) }))
}
`;
}

// U-3: a callback is a struct that holds the language object and implements the core trait; its calls convert the
// arguments out and the return in, and an exception of the language code, or a failure of the binding in the callback,
// goes to the core as a Raised that the generated caller throws again unchanged. GN-6q: each call takes the GIL on the
// thread on which the core calls it, so a callback with thread owner has no check of the thread.
function callbackRust(model: Model, cb: CallbackUnit): string {
  const name = rustField(cb.unit.name);
  const struct = rustType(model, { unit: cb.unit.id, ...(cb.library === undefined ? {} : { library: cb.library }) });
  const pyName = langName('python', cb.unit.name, 'class');
  const failure = `binding_core::Failure<${cb.error ?? model.coreError ?? '()'}>`;
  const methods = cb.members.map((m) => {
    const method = langName('python', m.member.name, 'callable');
    const params = m.params.map((p) => `${rustField(p.name)}: ${traitParam(model, p.type)}`);
    const outs = m.params.map((p) => `${convertOut(model, p.type, rustField(p.name))}?`);
    const returned = m.returns === 'none' ? 'Ok(())' : `${convertIn(model, m.returns, '&returned', rustString(`${pyName}.${method}() returns`))}`;
    return `
    fn ${rustField(m.member.name)}(${m.receiver}${params.map((p) => `, ${p}`).join('')}) -> Result<${m.returns === 'none' ? '()' : rustType(model, m.returns)}, ${failure}> {
        Python::attach(|py| {
            let call = || -> PyResult<${m.returns === 'none' ? '()' : rustType(model, m.returns)}> {
                let returned = self.object.bind(py).call_method1(${rustString(method)}, (${outs.join(', ')}${outs.length === 1 ? ',' : ''}))?;
                ${m.returns === 'none' ? 'let _returned: Bound<\'_, PyAny> = returned;\n                ' : ''}${returned}
            };
            call().map_err(|error| ${m.recognized === undefined ? 'thrown' : recognizedFn(cb, m)}(py, error))
        })
    }`;
  }).join('\n');
  // GN-6s: the error units of a callback unit of another repository are classes of <owner root>._errors.
  const errorsModule = cb.library === undefined ? 'None' : `Some(${rustString(`${(model.foreign.get(cb.library)?.packages['python'] as { module: string }).module}._errors`)})`;
  const recognizing = cb.members.filter((m) => m.recognized !== undefined).map((m) => `
/// U-3: an exception of ${m.member.id}: an instance of an error unit that it recognizes, with one of the kinds of that
/// unit, is the core error of the kind (GN-6d); any other exception goes back to the caller as it is.
fn ${recognizedFn(cb, m)}(py: Python<'_>, error: PyErr) -> ${failure} {
    let core = kind_of_recognized(py, &error, ${errorsModule}, &[${(m.recognized?.units ?? []).map((u) => rustString(langName('python', u.unit.name, 'class'))).join(', ')}]).and_then(|(kind, message)| ${recognizedMatch(m, '    ')});
    match core {
        Some(core) => binding_core::Failure::Kind(core),
        None => thrown(py, error),
    }
}
`).join('');
  const checks = cb.members.map((m) => {
    const method = langName('python', m.member.name, 'callable');
    return `    if !value.hasattr(${rustString(method)})? || !value.getattr(${rustString(method)})?.is_callable() {
        return Err(binding_error(py, BindingError::InvalidCallback { subject: subject.to_owned(), member: String::from(${rustString(method)}) }));
    }`;
  }).join('\n');
  return `
/// U-3: ${pyName}, a callback that Python code implements; the core calls it through ${cb.unit.core ?? ''}.
pub struct ${struct} {
    object: Py<PyAny>,
}

/// U-3: a callback object is checked when it enters: each member is a callable attribute (kind invalid_callback).
fn in_${name}(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<${struct}> {
${checks}
    Ok(${struct} { object: value.clone().unbind() })
}

impl ${cb.unit.core ?? ''} for ${struct} {${methods}
}
${recognizing}`;
}

// U-3, GN-6d: the kind and the message of an exception that is an instance of one of the error classes, for the
// members that recognize error units.
const RECOGNIZED_KIND = `
/// U-3: the kind and the message of an exception that is an instance of one of the error classes (GN-6d): those of
/// this package, or those of the errors module of the package that owns a callback unit of another repository (GN-6s).
fn kind_of_recognized(py: Python<'_>, error: &PyErr, module: Option<&str>, classes: &[&str]) -> Option<(String, String)> {
    // An exception whose class, kind or message cannot be read is no recognized one; the caller raises it as it was
    // thrown.
    let Ok(found) = read_kind_of_recognized(py, error, module, classes) else {
        return None;
    };
    found
}
/// U-3: what kind_of_recognized gives, or the Python error that reading the exception met.
fn read_kind_of_recognized(py: Python<'_>, error: &PyErr, module: Option<&str>, classes: &[&str]) -> PyResult<Option<(String, String)>> {
    let value = error.value(py);
    let module = match module {
        Some(name) => py.import(name)?,
        None => errors(py)?.clone(),
    };
    for name in classes {
        let class = module.getattr(*name)?;
        if value.is_instance(&class)? {
            let kind = value.getattr("kind")?.extract::<String>()?;
            let message = value.str()?.to_string();
            return Ok(Some((kind, message)));
        }
    }
    Ok(None)
}
`;

// GN-6ae: the lines that make the closure of a function parameter from a Python callable. The closure owns a reference
// to the callable; each call takes the GIL on the thread on which the machine calls it, makes the Python value of each
// argument, a class argument as a new instance of its class, and gives what the callable returned as a Passthrough, or
// its exception as a Raised.
function functionClosure(model: Model, type: Type & { function: unknown }, name: string, subject: string): string[] {
  const parts = (type as { function: { parameters: Type[] } }).function.parameters;
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  return [
    `        let ${name} = callable_in(py, ${name}, ${subject})?;`,
    `        let ${name} = move |${parts.map((part, i) => `arg${i}: ${rustType(model, part)}`).join(', ')}| -> Result<binding_core::Passthrough, ${failure}> {`,
    '            Python::attach(|py| {',
    '                let call = || -> PyResult<binding_core::Passthrough> {',
    `                    let returned = ${name}.bind(py).call1((${parts.map((part, i) => `${convertOut(model, part, `arg${i}`)}?,`).join(' ')}))?;`,
    '                    Ok(pass(returned.unbind()))',
    '                };',
    '                call().map_err(|error| thrown(py, error))',
    '            })',
    '        };',
  ];
}

// GN-6ae, B-3: the table of the values that the functions of Python code returned, each under the handle of its
// Passthrough; the check of a callable that enters; and, for a function that may return an awaitable, the coroutine
// functions of the awaited form and the outcome of a value on the event loop of the caller.
function passingRust(model: Model, layout: PythonLayout): string {
  const fns = [...model.functions, ...model.objects.flatMap((o) => o.members)];
  const takes = fns.some((fn) => functionArgs(fn).length > 0);
  const returns = fns.some((fn) => typeof fn.returns === 'object' && 'passthrough' in fn.returns);
  const awaitsValue = fns.some(settles);
  if (!takes && !returns) return '';
  return `
thread_local! {
    /// GN-6ae, B-3: the values that the functions of Python code returned, each until its Passthrough ends. A machine
    /// runs on the thread of its call from its start to its end, so a value enters and leaves the table of one thread.
    static PASSED: RefCell<BTreeMap<u64, Py<PyAny>>> = const { RefCell::new(BTreeMap::new()) };
}
${takes ? `
static NEXT_PASSED: AtomicU64 = AtomicU64::new(1);

/// GN-6ae: holds a Python value in the table, which the core moves and never reads.
fn pass(value: Py<PyAny>) -> binding_core::Passthrough {
    let handle = NEXT_PASSED.fetch_add(1, Ordering::Relaxed);
    PASSED.with_borrow_mut(|map| map.insert(handle, value));
    binding_core::Passthrough::from_generated(binding_core::Handle::new(handle), release_passed)
}

/// GN-6ae: removes the value of a Passthrough that the core dropped. The value ends with the GIL, after the table is
/// released, because its finalizer may run Python code that enters the binding again; a thread that ends holds no
/// table.
fn release_passed(handle: binding_core::Handle) {
    let gone = PASSED.try_with(|map| map.borrow_mut().remove(&handle.raw()));
    Python::attach(|_py| drop(gone));
}

/// GN-6ae: a function parameter takes a Python callable (kind invalid_callback), to which the closure keeps a
/// reference.
fn callable_in(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<Py<PyAny>> {
    if !value.is_callable() {
        return Err(binding_error(py, BindingError::InvalidCallback { subject: subject.to_owned(), member: String::new() }));
    }
    Ok(value.clone().unbind())
}
` : ''}
/// GN-6ae: the value of a Passthrough, which leaves the table unchanged; a handle that names no value is kind internal.
fn passed(value: binding_core::Passthrough) -> Result<Py<PyAny>, BindingError> {
    let handle = value.into_handle();
    PASSED
        .with_borrow_mut(|map| map.remove(&handle.raw()))
        .ok_or_else(|| BindingError::Internal { detail: String::from("GN-6ae: the value of the passthrough is gone") })
}
${returns ? `
/// GN-6ae: the value of a result passthrough, the object that the function returned.
fn passed_out(py: Python<'_>, value: binding_core::Passthrough) -> PyResult<Bound<'_, PyAny>> {
    match passed(value) {
        Ok(object) => Ok(object.into_bound(py)),
        Err(error) => Err(binding_error(py, error)),
    }
}
` : ''}${awaitsValue ? `
/// GN-6ae: a coroutine function of the awaited form: on_loop runs a member in a thread of asyncio with the running
/// event loop of its caller as the first argument, and settle awaits an awaitable as a coroutine, which
/// asyncio.run_coroutine_threadsafe takes.
fn awaiting<'py>(py: Python<'py>, name: &str) -> PyResult<Bound<'py, PyAny>> {
    static AWAITING: PyOnceLock<Py<PyModule>> = PyOnceLock::new();
    let module = AWAITING.get_or_try_init(py, || {
        let code = c"import asyncio\\n\\n\\nasync def on_loop(member, /, *args, **kwargs):\\n    return await asyncio.to_thread(member, asyncio.get_running_loop(), *args, **kwargs)\\n\\n\\nasync def settle(awaitable, /):\\n    return await awaitable\\n";
        PyModule::from_code(py, code, c"_awaiting.py", c${JSON.stringify(`${layout.module}._awaiting`)}).map(Bound::unbind)
    })?;
    module.bind(py).getattr(name)
}

/// GN-6ae: the awaitable of a member whose function may return an awaitable: the member runs in a thread of asyncio and
/// takes the running event loop of the caller, on which the driver settles such a value.
fn awaited_on_loop<'py>(py: Python<'py>, member: Bound<'py, PyAny>, args: &Bound<'py, PyTuple>, kwargs: Option<&Bound<'py, PyDict>>) -> PyResult<Bound<'py, PyAny>> {
    let mut all = vec![member];
    all.extend(args.iter());
    awaiting(py, "on_loop")?.call(PyTuple::new(py, all)?, kwargs)
}

/// GN-6ae: the outcome of a value that a function of Python code returned. A value that is no awaitable is settled at
/// once. An awaitable is awaited as a coroutine on the event loop of the caller of the awaited member, whose worker
/// thread waits for its outcome while the wait of the future releases the GIL: its value, or the exception that it
/// raised. Without an event loop no code can await it: a coroutine is closed, and the call fails with kind
/// invalid_callback, whose message names the awaited member.
fn settled<'py>(py: Python<'py>, value: binding_core::Passthrough, event_loop: Option<&Bound<'py, PyAny>>, subject: &str, awaited: &str) -> Result<Result<binding_core::Passthrough, binding_core::Raised>, BindingError> {
    let object = passed(value)?.into_bound(py);
    let awaitable = || -> PyResult<bool> { py.import("inspect")?.getattr("isawaitable")?.call1((&object,))?.extract() };
    match awaitable() {
        Ok(true) => {}
        Ok(false) => return Ok(Ok(pass(object.unbind()))),
        Err(error) => return Ok(Err(raised(py, error))),
    }
    let Some(event_loop) = event_loop else {
        let closed = object.hasattr("close").and_then(|closes| if closes { object.call_method0("close").map(|_closed| ()) } else { Ok(()) });
        if let Err(error) = closed {
            error.write_unraisable(py, None);
        }
        return Err(BindingError::InvalidCallback { subject: subject.to_owned(), member: format!("that returns no awaitable; {awaited} awaits one") });
    };
    let outcome = || -> PyResult<Bound<'py, PyAny>> {
        let coroutine = awaiting(py, "settle")?.call1((&object,))?;
        let future = py.import("asyncio")?.getattr("run_coroutine_threadsafe")?.call1((coroutine, event_loop))?;
        future.call_method0("result")
    };
    match outcome() {
        Ok(value) => Ok(Ok(pass(value.unbind()))),
        Err(error) => Ok(Err(raised(py, error))),
    }
}
` : ''}`;
}

// E-1c, U-3: the exceptions that callbacks raised, kept under the handles of their Raised until the generated caller
// throws them again; and the failure of a core that calls back, as the error of its kind or that exception.
function failureRust(model: Model): string {
  if (!model.functions.some((f) => f.failure) && !model.objects.some((o) => o.members.some((f) => f.failure)) && model.aliases.length === 0) return '';
  return `
static THROWN: Mutex<BTreeMap<u64, Py<PyAny>>> = Mutex::new(BTreeMap::new());
static NEXT_THROWN: AtomicU64 = AtomicU64::new(1);

fn thrown_map() -> MutexGuard<'static, BTreeMap<u64, Py<PyAny>>> {
    match THROWN.lock() {
        Ok(map) => map,
        Err(poisoned) => poisoned.into_inner(),
    }
}

/// U-3, GN-6u: what a Raised holds: the key of the exception in THROWN, whose last drop removes it, so an exception
/// that the core drops is not kept.
#[derive(Debug)]
struct ThrownKey {
    key: u64,
}

impl binding_core::NativeObject for ThrownKey {}

impl Drop for ThrownKey {
    fn drop(&mut self) {
        let taken = thrown_map().remove(&self.key);
        drop(taken);
    }
}

/// U-3: keeps the exception and gives the Raised that names it.
fn keep_thrown(object: Py<PyAny>) -> binding_core::Raised {
    let key = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    thrown_map().insert(key, object);
    binding_core::Raised::from_generated(binding_core::Native::new(ThrownKey { key }))
}
${!countsThrown(model.contract, model.foreign) ? '' : `
/// GN-6ae: the entry point of the generated tests of the cases that call Python code: the count of what the table
/// keeps, on any thread.
#[cfg(feature = "thrown-count-test")]
#[pyfunction]
fn _thrown_count() -> usize {
    thrown_map().len()
}
`}${!keepsThrown(model) && model.aliases.length === 0 ? '' : `
/// U-3: an exception of Python code, of a callback, of a function, of an awaitable, or of Python code while the core
/// walks a value, as the Raised that the caller throws again.
fn raised(py: Python<'_>, error: PyErr) -> binding_core::Raised {
    keep_thrown(error.into_value(py).into_any())
}
`}${!keepsThrown(model) ? '' : `
fn thrown<E>(py: Python<'_>, error: PyErr) -> binding_core::Failure<E> {
    binding_core::Failure::Raised(raised(py, error))
}
`}
fn failure_error(py: Python<'_>, failure: binding_core::Failure<${model.coreError ?? '()'}>) -> PyErr {
    match failure {
        ${model.coreError === undefined ? 'binding_core::Failure::Kind(()) => binding_error(py, BindingError::Internal { detail: String::from("E-1c: this library names no kind, so no call gives one") })' : 'binding_core::Failure::Kind(error) => core_error(py, error)'},
        binding_core::Failure::Raised(raised) => match raised.native().downcast::<ThrownKey>().and_then(|thrown| thrown_map().remove(&thrown.key)) {
            Some(object) => PyErr::from_value(object.into_bound(py)),
            None => binding_error(py, BindingError::Internal { detail: String::from("U-3: the exception of the callback is gone") }),
        },
        binding_core::Failure::Callback(error) => binding_error(py, BindingError::Internal { detail: error.to_string() }),
    }
}
`;
}

// GN-5, GN-6h: the poison entry point of the B-5c test: a panic while the write guard of the instance is held.
function poisonRust(model: Model): string {
  const written = model.objects.filter((o) => o.lock?.writes === true);
  if (written.length === 0) return '';
  const arms = written.map((o) => {
    const pyClass = langName('python', o.unit.name, 'class');
    return `        if let Ok(object) = object.cast::<Py${pyClass}>() {
            let _held = object.get().inner.write(${rustString(pyClass)}).map_err(|error| binding_error(py, error))?;
            panic!("panic-test");
        }`;
  }).join('\n');
  return `/// B-5c: the entry point of the generated poison test, which panics while it holds the write guard of the instance.
#[allow(clippy::panic, reason = "B-7: the entry point of the panic test panics on purpose, which its guard turns into kind internal")]
#[cfg(feature = "panic-test")]
#[pyfunction]
fn ${POISON_ENTRY.python}(py: Python<'_>, object: &Bound<'_, PyAny>) -> PyResult<()> {
    guard(py, || {
${arms}
        Err(binding_error(py, BindingError::Internal { detail: String::from("B-5c: the object is of no class with a write place") }))
    })
}

`;
}

function coreErrorRust(model: Model): string {
  if (model.coreError === undefined) return '';
  const unitClass = (unit: ErrorUnit): string => langName('python', unit.unit.name, 'class');
  const arms = model.kinds.map((k) => `        ${variantPattern(k.variant)} => ${rustString(k.unit === undefined ? k.className : unitClass(k.unit))},`).join('\n');
  const doc = `/// I-2 (3): the class of each variant of the core error, by a match without a wildcard. The pattern \`{ .. }\` matches a
/// variant with or without data, which the generator does not see (I-2: binding reads no Rust source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]`;
  if (model.errorUnits.length === 0) {
    return `
${doc}
fn core_error(py: Python<'_>, error: ${model.coreError}) -> PyErr {
    let class = match ${errorMatched(model, 'error')} {
${arms}
    };
    library_error(py, class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))
}
`;
  }
  // E-2, I-3: the kind of an error unit is an instance of the class of the unit, whose properties the core error gives.
  const setters = model.errorUnits.filter((u) => errorProperties(u).length > 0).map((u) => `
/// I-3: the properties of ${unitClass(u)}, read from the core error.
fn ${rustField(u.unit.name)}_properties(py: Python<'_>, raised: &PyErr, error: &${model.coreError}) -> PyResult<()> {
    let object = raised.value(py);
${errorProperties(u).map(({ property }) => `    let value = ${propertyValue(property, 'error', (failure) => `Err(core_error(py, ${failure}))`)};
    object.setattr(${rustString(`_${langName('python', property.member.name, 'variable')}`)}, ${convertOut(model, property.returns, 'value')}?)?;`).join('\n')}
    Ok(())
}
`).join('');
  const propertyArms = model.kinds.map((k) => `        ${variantPattern(k.variant)} => ${k.unit === undefined || errorProperties(k.unit).length === 0 ? 'Ok(())' : `${rustField(k.unit.unit.name)}_properties(py, &raised, &error)`},`).join('\n');
  return `${setters}
${doc}
fn core_error(py: Python<'_>, error: ${model.coreError}) -> PyErr {
    let class = match ${errorMatched(model, 'error')} {
${arms}
    };
    let raised = library_error(py, class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error));
    let written = match ${errorMatched(model, 'error')} {
${propertyArms}
    };
    match written {
        Ok(()) => raised,
        Err(error) => error,
    }
}
`;
}

function libRust(model: Model, layout: PythonLayout): string {
  const classOf = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  const constants = model.constants
    .map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`)
    .join('\n') + defaultAsserts(model);
  const functions = model.functions.map((fn) => functionRust(model, fn)).join('');
  const enums = [
    ...model.enums.map((u) => enumRust(model, u)),
    ...model.resultRecords.map((u) => recordRust(model, u)),
    ...model.variants.map((v) => variantRust(model, v)),
    ...model.aliases.filter((a) => a.library === undefined).map((a) => aliasPython(model, a)),
    model.aliases.length > 0 ? pythonHost(model) : '',
  ].join('\n');
  // The conversion out of a class is written when a call gives the class: the constructor wraps the value itself, so
  // a class that no member returns has none (the lints deny dead code).
  // GN-6z: a function that the core may keep; the function parameter of a member with machine has its own helper (GN-6ae).
  const takesFunction = [...model.functions, ...model.objects.flatMap((o) => o.members)].some((fn) => fn.args.some((a) => holdsFunction(a.type) && !machineFunction(a.type)));
  const recognizes = takenCallbacks(model).some((c) => c.members.some((m) => m.recognized !== undefined));
  const rest = takenCallbacks(model).map((c) => callbackRust(model, c)).join('') + model.interfaces.map((i) => interfaceRust(model, i)).join('') + (takesFunction ? FUNCTION_IN : '') + (recognizes ? RECOGNIZED_KIND : '') + failureRust(model) + passingRust(model, layout) + foreignFailurePython(model);
  const draft = functions + model.objects.map((o) => objectRust(model, layout, o, true)).join('') + rest;
  const givesOut = (o: ObjectClass): boolean => new RegExp(`(?<!fn |::)\\bout_${rustField(o.unit.name)}\\(`).test(draft);
  const objects = model.objects.map((o) => objectRust(model, layout, o, givesOut(o))).join('') + model.kept.map((k) => keptPython(moduleOf(layout, k.unit.module), k)).join('') + rest;
  const typesFn = `
fn types(py: Python<'_>) -> PyResult<&Bound<'_, PyModule>> {
    static TYPES: PyOnceLock<Py<PyModule>> = PyOnceLock::new();
    TYPES.get_or_try_init(py, || py.import(${rustString(`${layout.module}._types`)}).map(Bound::unbind)).map(|module| module.bind(py))
}

/// T-3: the types module of another repository's package, whose classes that package owns.
fn foreign_types<'py>(py: Python<'py>, module: &str) -> PyResult<Bound<'py, PyModule>> {
    py.import(module)
}
`;
  // The conversion of the core error is generated where an entry point or the failure of a callback calls it: a
  // contract whose only raising member is a to_json, which Python does not generate (GN-6g), has no caller.
  const coreError = failureRust(model) !== '' || /\bcore_error\(/.test(`${functions}${objects}`) ? coreErrorRust(model) : '';
  const used = usedHelpers(`${HELPERS}\n${WIDEN}\n${INTO_CORE}\n${PARTS}\n${CORE_FORM}\n${AWAITED}\n${DRIVEN}\n${typesFn}\n${enums}`, `${functions}${objects}${coreError}`, {},
    libraryBlocks(model, (unit, library) => recordRust(model, unit, library), (a) => aliasPython(model, a)));
  const pyTypes = ['PyBool', 'PyBytes', 'PyDict', 'PyFloat', 'PyInt', 'PyList', 'PyModule', 'PyString', 'PyTuple'].filter((t) => new RegExp(`\\b${t}\\b`).test(`${used}${functions}${objects}`) || t === 'PyModule');
  const register = [
    ...model.functions.map((fn) => `    module.add_function(wrap_pyfunction!(function_${langName('python', fn.member.name, 'callable')}, module)?)?;`),
    ...model.functions.filter(awaits).map((fn) => `    module.add_function(wrap_pyfunction!(function_${awaitedName(fn)}, module)?)?;`),
    ...model.functions.filter(settles).map((fn) => `    module.add_function(wrap_pyfunction!(loop_function_${langName('python', fn.member.name, 'callable')}, module)?)?;`),
    ...model.objects.map((o) => `    module.add_class::<Py${langName('python', o.unit.name, 'class')}>()?;`),
    ...model.kept.map((k) => `    module.add_class::<Py${langName('python', k.unit.name, 'class')}>()?;`),
  ].join('\n');
  const classChecks = model.classes.map((c) => `    errors(module.py())?.getattr(${rustString(c.name)})?;`).join('\n');
  return `${header('//')}
// The native module ${layout.module}._native of ${model.contract.library}.

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
${model.aliases.length > 0 ? `use binding_core::{Handle, HostText, HostValue, HostValues, Native, NativeObject, OutValue, OutValues${/\bPredicate::/.test(used) ? ', Predicate' : ''}${/\bValueKind::/.test(used) ? ', ValueKind' : ''}};\n` : ''}use pyo3::prelude::*;
use pyo3::sync::PyOnceLock;
use pyo3::types::{${pyTypes.join(', ')}};
${/Borrow</.test(`${used}${objects}`) ? 'use std::borrow::Borrow;\n' : ''}${/\bRefCell\b/.test(objects) ? 'use std::cell::RefCell;\n' : ''}${/\bBTreeMap\b/.test(`${used}${objects}`) ? 'use std::collections::BTreeMap;\n' : ''}use std::panic::{catch_unwind, AssertUnwindSafe};${/\bTHROWN\b/.test(objects) ? '\nuse std::sync::atomic::{AtomicU64, Ordering};\nuse std::sync::{Mutex, MutexGuard};' : ''}

// U-5: the constants of the contract are the constants of the core.
${constants}

static ERRORS: PyOnceLock<Py<PyModule>> = PyOnceLock::new();

fn errors(py: Python<'_>) -> PyResult<&Bound<'_, PyModule>> {
    ERRORS.get_or_try_init(py, || py.import(${rustString(`${layout.module}._errors`)}).map(Bound::unbind)).map(|module| module.bind(py))
}


/// B-4: an error of the library, an instance of its class with its kind, status and errno.
fn library_error(py: Python<'_>, class: &str, message: String, kind: &str, status: Option<u16>, errno: Option<i32>) -> PyErr {
    match errors(py).and_then(|module| module.getattr(class)).and_then(|class| class.call1((message, kind, status, errno))) {
        Ok(error) => PyErr::from_value(error),
        Err(error) => error,
    }
}

/// E-1a: an error that the binding raises itself, in the class of its fixed category.
fn binding_error(py: Python<'_>, error: BindingError) -> PyErr {
    let class = match error.category() {
        Category::Value => ${rustString(classOf('value'))},
        Category::Type => ${rustString(classOf('type'))},
        Category::Io => ${rustString(classOf('io'))},
        Category::Store => ${rustString(classOf('store'))},
        Category::Busy => ${rustString(classOf('busy'))},
        Category::Internal => ${rustString(classOf('internal'))},
    };
    library_error(py, class, error.to_string(), error.kind(), error.status(), error.errno())
}
${coreError}
/// B-7: a panic of the call reaches the caller as kind internal.
fn guard<'py, T>(py: Python<'py>, body: impl FnOnce() -> PyResult<T>) -> PyResult<T> {
    match catch_unwind(AssertUnwindSafe(body)) {
        Ok(result) => result,
        Err(payload) => {
            let detail = match (payload.downcast_ref::<&str>(), payload.downcast_ref::<String>()) {
                (Some(text), _) => (*text).to_owned(),
                (None, Some(text)) => text.clone(),
                (None, None) => String::from("a panic without a message"),
            };
            Err(binding_error(py, BindingError::Internal { detail }))
        }
    }
}

${faultRust(model)}${cleanupAsserts(model)}${aliasKindsRust(model)}${raisesAssertions(model)}${/\bGiven\b/.test(`${functions}${objects}`) ? GIVEN : ''}${used}${functions}${objects}
/// B-7: the entry point of the generated panic test.
#[allow(clippy::panic, reason = "B-7: the entry point of the panic test panics on purpose, which its guard turns into kind internal")]
#[cfg(feature = "panic-test")]
#[pyfunction]
fn _panic_test(py: Python<'_>) -> PyResult<()> {
    guard(py, || panic!("panic-test"))
}
${model.faults.length === 0 ? '' : `
/// G-5: arms the faults of a case for the next call of the member from this thread, and gives the id of the arming.
#[cfg(feature = "fault-test")]
#[pyfunction]
fn _arm_faults(py: Python<'_>, member: &str, faults: &str) -> PyResult<u64> {
    guard(py, || binding_core::fault::arm(member, faults).map_err(|error| binding_error(py, BindingError::Internal { detail: error.to_string() })))
}

/// G-5: the points of an arming whose fault did not fire.
#[cfg(feature = "fault-test")]
#[pyfunction]
fn _fault_left(py: Python<'_>, id: u64) -> PyResult<Vec<String>> {
    guard(py, || binding_core::fault::left(id).map_err(|error| binding_error(py, BindingError::Internal { detail: error.to_string() })))
}
`}
${aliasesWithKinds(model).map((alias) => `
/// U-7: runs the in function of the alias ${alias.unit.id} alone, for the cases of the alias.
#[cfg(feature = "codec-test")]
#[pyfunction]
fn _alias_in_${rustField(alias.unit.name)}(py: Python<'_>, value: &Bound<'_, PyAny>) -> PyResult<()> {
    guard(py, || {
        let _value: ${alias.unit.core_type ?? ''} = in_${rustField(alias.unit.name)}(py, value, "value")?;
        Ok(())
    })
}

/// GN-13e: takes a value by the in function of the alias ${alias.unit.id} and gives it back by its out function, for the round trip of a result.
#[cfg(feature = "codec-test")]
#[pyfunction]
fn _alias_round_${rustField(alias.unit.name)}<'py>(py: Python<'py>, value: &Bound<'py, PyAny>) -> PyResult<Bound<'py, PyAny>> {
    guard(py, || {
        let value: ${alias.unit.core_type ?? ''} = in_${rustField(alias.unit.name)}(py, value, "value")?;
        out_${rustField(alias.unit.name)}(py, &value)
    })
}
`).join('')}
${poisonRust(model)}#[pymodule]
fn _native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    // B-4: the classes are found when the module loads; a missing one fails the import.
${classChecks}
${register}
    #[cfg(feature = "panic-test")]
    module.add_function(wrap_pyfunction!(_panic_test, module)?)?;${!countsThrown(model.contract, model.foreign) || failureRust(model) === '' ? '' : `
    #[cfg(feature = "thrown-count-test")]
    module.add_function(wrap_pyfunction!(_thrown_count, module)?)?;`}${model.objects.some((o) => o.lock?.writes === true) ? `
    #[cfg(feature = "panic-test")]
    module.add_function(wrap_pyfunction!(${POISON_ENTRY.python}, module)?)?;` : ''}${aliasesWithKinds(model).map((alias) => `
    #[cfg(feature = "codec-test")]
    module.add_function(wrap_pyfunction!(_alias_in_${rustField(alias.unit.name)}, module)?)?;
    #[cfg(feature = "codec-test")]
    module.add_function(wrap_pyfunction!(_alias_round_${rustField(alias.unit.name)}, module)?)?;`).join('')}${model.faults.length === 0 ? '' : `
    #[cfg(feature = "fault-test")]
    module.add_function(wrap_pyfunction!(_arm_faults, module)?)?;
    #[cfg(feature = "fault-test")]
    module.add_function(wrap_pyfunction!(_fault_left, module)?)?;`}
    Ok(())
}
`;
}

// ---- Python sources ----

function pyType(model: Model, type: Type, input: boolean): string {
  if (typeof type === 'string') {
    const map: Record<string, string> = { text: 'str', latin1: 'str', bool: 'bool', uint: 'int', int: 'int', int64: 'int', float: 'float', bytes: input ? 'bytes | bytearray | memoryview' : 'bytes', source: 'str | bytes | bytearray | memoryview', path: input ? 'str | bytes | PathLike[str] | PathLike[bytes]' : 'str', cancel: 'Future[object] | ConcurrentFuture[object]', none: 'None', never: 'NoReturn' };
    return map[type] ?? 'object';
  }
  if ('list' in type) return input ? `Sequence[${pyType(model, type.list, input)}]` : `list[${pyType(model, type.list, input)}]`;
  if ('map' in type) return `dict[str, ${pyType(model, type.map, input)}]`;
  if ('keyed_map' in type) return `dict[${type.key.map((k) => ({ int: 'int', bytes: 'bytes', text: 'str' })[k] ?? 'object').join(' | ')}, ${pyType(model, type.keyed_map, input)}]`;
  if ('optional' in type) return `${pyType(model, type.optional, input)} | None`;
  // GN-6ae: a passthrough is any object, so the function parameter of a member with machine is a callable of its
  // parameters that returns an object.
  if ('passthrough' in type) return 'object';
  if ('tuple' in type) return `tuple[${type.tuple.map((t) => pyType(model, t, input)).join(', ')}]`;
  // GN-6z: the callable takes the arguments as the binding gives them and returns a value that the binding takes.
  if ('function' in type) return `Callable[[${type.function.parameters.map((t) => pyType(model, t, false)).join(', ')}], ${pyType(model, type.function.returns, true)}]`;
  const unit = unitOf(model, type);
  // U-7: a value alias is any value that its core judges.
  if (unit === undefined || aliasOf(model, type) !== undefined) return 'object';
  return langName('python', unit.name, 'class');
}

function errorsPy(model: Model): string {
  const classes = model.classes.map((c) => `

class ${c.name}(builtins.${pythonBase(c.category)}):
    """The errors of category ${c.category} (E-2): kind, status and errno are attributes (E-3)."""

    def __init__(self, message: str, kind: str, status: int | None = None, errno: int | None = None) -> None:
        super().__init__(message)
        self.kind = kind
        self.status = status
        self.errno = errno`).join('');
  // E-2, I-3: an error unit extends the class of its parent or of its category; a property is read-only.
  const units = model.errorUnits.map((u) => {
    const name = langName('python', u.unit.name, 'class');
    const base = u.parent === undefined ? model.classes.find((c) => c.category === u.category)?.name ?? '' : langName('python', u.parent.unit.name, 'class');
    const properties = u.properties.map(({ member, returns }) => {
      const attribute = langName('python', member.name, 'variable');
      // An instance that the core did not make has no value.
      const given = pyType(model, returns, false);
      const annotation = given.endsWith('| None') ? given : `${given} | None`;
      return `

    _${attribute}: ${annotation} = None

    @property
    def ${attribute}(self) -> ${annotation}:
        return self._${attribute}`;
    }).join('');
    return `


class ${name}(${base}):
    """The errors of the unit ${u.unit.id} (E-2)."""${properties}`;
  }).join('');
  return `${pyHeader()}
"""The error classes of ${model.contract.library} (E-2, B-4)."""

import builtins

__all__ = [${[...model.classes.map((c) => c.name), ...model.errorUnits.map((u) => langName('python', u.unit.name, 'class'))].map(pyString).join(', ')}]${classes}${units}
`;
}

const pythonBase = (category: string): string =>
  ({ value: 'ValueError', type: 'TypeError', io: 'OSError', store: 'RuntimeError', busy: 'RuntimeError', internal: 'RuntimeError' })[category] ?? 'Exception';

// T-3: the records of other repositories are the classes of their packages.
function foreignImports(model: Model): string[] {
  const byModule = new Map<string, string[]>();
  for (const r of model.foreignRecords) {
    const module = (r.contract.packages['python'] as { module: string }).module;
    byModule.set(module, [...(byModule.get(module) ?? []), langName('python', r.unit.name, 'class')]);
  }
  // GN-6s: a callback unit of another repository is the Protocol that its package declares.
  for (const c of model.foreignCallbacks) {
    const module = (model.foreign.get(c.library ?? '')?.packages['python'] as { module: string }).module;
    byModule.set(module, [...(byModule.get(module) ?? []), langName('python', c.unit.name, 'class')]);
  }
  return [...byModule].map(([module, names]) => `from ${module} import ${names.map((n) => `${n} as ${n}`).join(', ')}`);
}

// The units of <root>._types: the enums, the records of the result form, the variants after the classes of their cases
// (GN-6v) and the callbacks.
const typeUnits = (model: Model): Unit[] => [...model.enums, ...model.resultRecords, ...model.variants.flatMap((v) => [...v.cases.map((c) => c.unit), v.unit]), ...model.callbacks.map((c) => c.unit), ...model.interfaces];

function typesPy(model: Model): string {
  const enums = model.enums.map((u) => {
    const members = (u.variants ?? []).map((v) => `    ${langName('python', v.name, 'constant')} = ${pyString(v.value)}`).join('\n');
    return `

class ${langName('python', u.name, 'class')}(StrEnum):
    """T-6."""

${members}`;
  }).join('');
  const records = model.resultRecords.map((u) => `

@dataclass(frozen=True, kw_only=True)
class ${langName('python', u.name, 'class')}:
    \"\"\"T-4: the result form of the record; the constructor holds the values, which the binding judges when they enter.\"\"\"

${(u.fields ?? []).map((f) => `    ${langName('python', f.name, 'variable')}: ${pyType(model, f.type, false)}${caseLeftOut(f) ? ' = None' : ''}`).join('\n')}`).join('');
  // T-9, GN-6v: a frozen dataclass per case and the alias of their union.
  const variants = model.variants.map((v) => `${v.cases.map((kase) => `

@dataclass(frozen=True, kw_only=True)
class ${langName('python', kase.unit.name, 'class')}:
    \"\"\"T-9: the case ${kase.value} of the variant ${langName('python', v.unit.name, 'class')}; the constructor holds the values, which the binding judges when they enter.\"\"\"
${(kase.unit.fields ?? []).map((f) => `\n    ${langName('python', f.name, 'variable')}: ${pyType(model, f.type, false)}${caseLeftOut(f) ? ' = None' : ''}`).join('')}`).join('')}


type ${langName('python', v.unit.name, 'class')} = ${v.cases.map((kase) => langName('python', kase.unit.name, 'class')).join(' | ')}`).join('');
  const callbacks = model.callbacks.map((cb) => `


class ${langName('python', cb.unit.name, 'class')}(Protocol):
    \"\"\"U-3: a callback that Python code implements; the binding checks the members of the object it receives.\"\"\"

${cb.members.map((m) => `    def ${langName('python', m.member.name, 'callable')}(self${m.params.map((p) => `, ${langName('python', p.name, 'variable')}: ${pyType(model, p.type, false)}`).join('')}) -> ${pyType(model, m.returns, true)}: ...`).join('\n\n')}`).join('');
  // GN-6ap: a generated interface is an abstract base class, with which the package registers the classes that
  // implement it; a Protocol without a member would accept every value.
  const interfaces = model.interfaces.map((i) => `


class ${langName('python', i.name, 'class')}(ABC):
    \"\"\"GN-6ap: the interface of ${implementorsOf(model, i).map((o) => langName('python', o.unit.name, 'class')).join(', ')}; a parameter of it takes an instance of one of them.\"\"\"`).join('');
  const names = typeUnits(model).map((u) => pyString(langName('python', u.name, 'class')));
  return `${pyHeader()}
\"\"\"The enums, records and variants of ${model.contract.library} (T-6, T-4, T-9).\"\"\"

from __future__ import annotations

${model.interfaces.length > 0 ? 'from abc import ABC\n' : ''}from dataclasses import dataclass
from enum import StrEnum
${model.callbacks.length > 0 ? 'from typing import Protocol\n' : ''}${foreignImports(model).map((line) => `${line}\n`).join('')}
__all__ = [${names.join(', ')}]${enums}${records}${variants}${callbacks}${interfaces}
`;
}

// The names of a Python module file: the public names of the module, or with internal its internal names (GN-6r); the
// file of the root module holds both, and its __all__ only the public ones.
function modulePy(model: Model, module: string, internal: boolean): string {
  const held = (unit: Unit): boolean => unit.module === module && (module === '' && !internal ? true : isInternal(unit) === internal);
  const fns = [
    ...model.functions.filter((f) => held(f.unit)).flatMap((f) => [{ unit: f.unit, name: langName('python', f.member.name, 'callable') }, ...(awaits(f) ? [{ unit: f.unit, name: awaitedName(f) }] : [])]),
    ...model.objects.filter((o) => held(o.unit)).map((o) => ({ unit: o.unit, name: langName('python', o.unit.name, 'class') })),
    ...model.kept.filter((k) => held(k.unit)).map((k) => ({ unit: k.unit, name: langName('python', k.unit.name, 'class') })),
  ];
  const enums = typeUnits(model).filter(held).map((u) => ({ unit: u, name: langName('python', u.name, 'class') }));
  const constants = model.constants.filter((c) => held(c.unit));
  // GN-11: an error unit is a class of <root>._errors, which the module of its unit imports; the root module needs no
  // import, because <root> imports every name of <root>._errors.
  const errors = module === '' || internal ? [] : model.errorUnits.filter((u) => u.unit.module === module).map((u) => ({ unit: u.unit, name: langName('python', u.unit.name, 'class') }));
  const all = [...errors, ...fns, ...enums, ...constants.map((c) => ({ unit: c.unit, name: langName('python', c.member.name, 'constant') }))];
  const names = all.filter((n) => !isInternal(n.unit)).map((n) => n.name);
  const imports = [
    errors.length > 0 ? `from ._errors import ${errors.map(({ name: e }) => `${e} as ${e}`).join(', ')}` : '',
    fns.length > 0 ? `from ._native import ${fns.map(({ name: f }) => `${f} as ${f}`).join(', ')}` : '',
    enums.length > 0 ? `from ._types import ${enums.map(({ name: e }) => `${e} as ${e}`).join(', ')}` : '',
    constants.length > 0 ? 'from typing import Final' : '',
  ].filter((l) => l !== '');
  const values = constants.map((c) => `${langName('python', c.member.name, 'constant')}: Final = ${JSON.stringify(c.member.value)}`);
  return `${pyHeader()}
"""The ${internal ? 'internal names of the ' : ''}module ${module === '' ? '(root)' : module} of ${model.contract.library} (P-2${internal ? ', GN-6r' : ''})."""

${imports.join('\n')}

__all__ = [${names.map(pyString).join(', ')}]
${values.length > 0 ? `\n${values.join('\n')}\n` : ''}`;
}

function nativePyi(model: Model): string {
  const enumImports = typeUnits(model).map((u) => langName('python', u.name, 'class'));
  // U-2: the declaration shows a {literal} or {const} default; the value of any other default is the core's.
  const declared = (a: Arg): string => {
    const base = `${langName('python', a.name, 'variable')}: ${pyType(model, a.type, true)}`;
    if (a.default === undefined) return base;
    const value = declaredValue(model, a)?.value;
    // GN-6i: an enum default is its member, and a {literal: null} default is None.
    const unit = unitOf(model, a.type);
    const variant = unit?.kind === 'enum' ? (unit.variants ?? []).find((v) => v.value === value) : undefined;
    const shown =
      value === undefined ? '...'
      : value === null ? 'None'
      : variant !== undefined && unit !== undefined ? `${langName('python', unit.name, 'class')}.${langName('python', variant.name, 'constant')}`
      : typeof value === 'boolean' ? (value ? 'True' : 'False')
      : typeof value === 'string' ? pyString(value)
      : String(value);
    return `${base} = ${shown}`;
  };
  const fns = model.functions.map((fn) => {
    const positional = fn.args.filter((a) => !a.field).map(declared);
    const keyword = fn.args.filter((a) => a.field).map(declared);
    const params = keyword.length === 0 ? positional : [...positional, '*', ...keyword];
    const declaration = `def ${langName('python', fn.member.name, 'callable')}(${params.join(', ')}) -> ${pyType(model, fn.returns, false)}: ...`;
    // GN-6m: the awaitable of a member that waits takes the same parameters.
    return awaits(fn) ? `${declaration}\nasync ${declaration.replace(/^def /, `def a`)}` : declaration;
  });
  const params = (fn: Fn): string[] => {
    const positional = fn.args.filter((a) => !a.field).map(declared);
    const keyword = fn.args.filter((a) => a.field).map(declared);
    return keyword.length === 0 ? positional : [...positional, '*', ...keyword];
  };
  const classes = model.objects.map((o) => {
    const lines = o.members.map((fn) => {
      const name = langName('python', fn.member.name, 'callable');
      if (fn.kind === 'constructor') return `    def __init__(${['self', ...params(fn)].join(', ')}) -> None: ...`;
      if (fn.kind === 'static') return `    @staticmethod\n    def ${name}(${params(fn).join(', ')}) -> ${pyType(model, fn.returns, false)}: ...${awaits(fn) ? `\n    @staticmethod\n    async def a${name}(${params(fn).join(', ')}) -> ${pyType(model, fn.returns, false)}: ...` : ''}`;
      if (fn.kind === 'property') return `    @property\n    def ${name}(self) -> ${pyType(model, fn.returns, false)}: ...`;
      if (fn.special === 'stringify') return '    def __str__(self) -> str: ...';
      if (fn.kind === 'iterate') {
        const yields = fn.yields ?? { value: 'none' };
        if (yields.key === undefined) return `    def __iter__(self) -> Iterator[${pyType(model, yields.value, false)}]: ...`;
        const key = pyType(model, yields.key, false);
        return `    def __iter__(self) -> Iterator[${key}]: ...\n    def items(self) -> Iterator[tuple[${key}, ${pyType(model, yields.value, false)}]]: ...`;
      }
      const declaration = `def ${name}(${['self', ...params(fn)].join(', ')}) -> ${pyType(model, fn.returns, false)}: ...`;
      // GN-6m: the awaitable of a method that waits takes the same parameters.
      return awaits(fn) ? `    ${declaration}\n    async def a${declaration.slice('def '.length)}` : `    ${declaration}`;
    });
    // GN-6ap: the class has the generated interfaces that it implements as its bases.
    const bases = model.interfaces.filter((i) => (o.unit.implements ?? []).some((ref) => ref.library === undefined && ref.unit === i.id)).map((i) => langName('python', i.name, 'class'));
    return `\n@final\nclass ${langName('python', o.unit.name, 'class')}${bases.length === 0 ? '' : `(${bases.join(', ')})`}:\n${lines.join('\n')}\n`;
  });
  // GN-6af: a value class without core_type: the constructor, which keeps its arguments, and a property for each, which
  // a writable property also sets.
  for (const k of model.kept) {
    const init = k.fields.map((f) => `${langName('python', f.name, 'variable')}: ${pyType(model, f.type, true)}${f.default === undefined ? '' : f.default === 'null' ? ' = None' : ' = ...'}`);
    const lines = [`    def __init__(${['self', ...init].join(', ')}) -> None: ...`];
    for (const f of k.fields.filter((field) => field.property !== undefined)) {
      const name = langName('python', f.name, 'variable');
      lines.push(`    @property\n    def ${name}(self) -> ${pyType(model, f.type, false)}: ...`);
      if (f.writable) lines.push(`    @${name}.setter\n    def ${name}(self, value: ${pyType(model, f.type, true)}) -> None: ...`);
    }
    classes.push(`\n@final\nclass ${langName('python', k.unit.name, 'class')}:\n${lines.join('\n')}\n`);
  }
  return `${pyHeader()}
from collections.abc import ${/\bCallable\[/.test([...fns, ...classes].join('\n')) ? 'Callable, ' : ''}${model.objects.some((o) => o.members.some((f) => f.kind === 'iterate')) ? 'Iterator, ' : ''}Sequence
${/\bConcurrentFuture\[/.test([...fns, ...classes].join('\n')) ? 'from asyncio import Future\nfrom concurrent.futures import Future as ConcurrentFuture\n' : ''}${/\bPathLike\b/.test([...fns, ...classes].join('\n')) ? 'from os import PathLike\n' : ''}from typing import ${/\bNoReturn\b/.test([...fns, ...classes].join('\n')) ? 'NoReturn, ' : ''}final
${enumImports.length > 0 ? `from ._types import ${enumImports.join(', ')}\n` : ''}${foreignImports(model).map((line) => `${line}\n`).join('')}
${fns.join('\n')}
${classes.join('')}`;
}

// The units of the module files of the package, each with its module; an internal unit is in no __all__ (GN-6r).
const moduleUnits = (model: Model): Unit[] => [
  ...model.functions.map((f) => f.unit), ...model.objects.map((o) => o.unit), ...model.kept.map((k) => k.unit), ...model.enums, ...model.resultRecords,
  ...model.variants.flatMap((v) => [...v.cases.map((c) => c.unit), v.unit]), ...model.callbacks.map((c) => c.unit), ...model.interfaces, ...model.constants.map((c) => c.unit), ...model.errorUnits.map((u) => u.unit),
];

function initPy(model: Model): string {
  const modules = [...new Set(moduleUnits(model).filter((u) => u.module === '' || !isInternal(u)).map((u) => u.module))].sort();
  const open = <T>(items: T[], unit: (item: T) => Unit): T[] => items.filter((item) => !isInternal(unit(item)));
  const imports = modules.map((m) => (m === '' ? 'from ._root import *  # noqa: F403' : `from .${m.replaceAll('/', '.')} import *  # noqa: F403`));
  const names = [
    ...model.classes.map((c) => c.name),
    ...model.errorUnits.map((u) => langName('python', u.unit.name, 'class')),
    ...open(model.functions, (f) => f.unit).map((f) => langName('python', f.member.name, 'callable')),
    ...open(model.objects, (o) => o.unit).map((o) => langName('python', o.unit.name, 'class')),
    ...open(model.kept, (k) => k.unit).map((k) => langName('python', k.unit.name, 'class')),
    ...open(model.enums, (u) => u).map((u) => langName('python', u.name, 'class')),
    ...open(model.resultRecords, (u) => u).map((u) => langName('python', u.name, 'class')),
    ...open(model.variants.flatMap((v) => [...v.cases.map((c) => c.unit), v.unit]), (u) => u).map((u) => langName('python', u.name, 'class')),
    ...open(model.callbacks, (c) => c.unit).map((c) => langName('python', c.unit.name, 'class')),
    ...open(model.interfaces, (i) => i).map((i) => langName('python', i.name, 'class')),
    ...open(model.constants, (c) => c.unit).map((c) => langName('python', c.member.name, 'constant')),
  ];
  // GN-6ap: each class that implements a generated interface is registered with the abstract base class of it.
  const registers = model.interfaces.flatMap((i) => implementorsOf(model, i).map((o) => `_types.${langName('python', i.name, 'class')}.register(_native.${langName('python', o.unit.name, 'class')})`));
  return `${pyHeader()}
"""${model.contract.library}: the public API (P-3)."""

${registers.length > 0 ? 'from . import _native, _types\n' : ''}from ._errors import *  # noqa: F403
${imports.join('\n')}

__all__ = [${names.map(pyString).join(', ')}]
${registers.length > 0 ? `\n${registers.join('\n')}\n` : ''}`;
}

export function python(model: Model, files: Files): void {
  const layout = pythonLayout(model);
  const pkg = `${PYTHON_PACKAGE}/${layout.modulePath}`;
  const crate = `${model.contract.library}-python`;
  files.set(`${ROOT}/lib.rs`, libRust(model, layout));
  files.set(`${pkg}/_errors.py`, errorsPy(model));
  files.set(`${pkg}/_types.py`, typesPy(model));
  files.set(`${pkg}/_native.pyi`, nativePyi(model));
  files.set(`${pkg}/py.typed`, '');
  const units = moduleUnits(model);
  for (const module of [...new Set(units.map((u) => u.module))]) {
    if (module === '') {
      files.set(`${pkg}/_root.py`, modulePy(model, module, false));
      continue;
    }
    if (units.some((u) => u.module === module && !isInternal(u))) files.set(`${pkg}/${module}.py`, modulePy(model, module, false));
    if (units.some((u) => u.module === module && isInternal(u))) files.set(`${pkg}/_${module}.py`, modulePy(model, module, true));
  }
  files.set(`${pkg}/__init__.py`, initPy(model));
  files.set(`${ROOT}/tests/test_generated.py`, pythonTests(model, layout.module));
  void moduleOf;
}
