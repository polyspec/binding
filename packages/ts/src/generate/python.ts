// The Python binding (PyO3, abi3-py310): the Rust crate, the Python package around its `_native` module, the type
// stubs and the generated tests (G-5).

import type { Type, Unit } from '../contract.ts';
import { raisesAssertions } from './raises.ts';
import { type Files, header, pyHeader, pyString, rustString, closure, optionRef, usedHelpers, WIDEN, INTO_CORE, PARTS } from './text.ts';
import { defaultAsserts, declaredValue } from './defaults.ts';
import { type Arg, type CallbackUnit, type ErrorUnit, type Fn, type Model, Unsupported, argType, aliasOf, errorProperties, byValue, type ObjectClass, coreCallArgs, aliasKindsRust, aliasesWithKinds, faultRust, armedCall, awaits, cleanupAsserts, cleanupWarning, waitsAsync, waitsIo, drivenCall, DRIVEN, withFaults, heldNew, heldParam, heldType, langName, libraryOf, lockLines, memberName, resultLet, objectUnit, POISON_ENTRY, recordFn, takesHeld, takesNested, borrowedItem, rustField, rustIdent, rustType, rustVariant, unitOf, type Variant, caseFields, caseRead, caseStruct, caseType, caseValue, caseWritten, UNIT_CASE_ALLOW, tupleIn, leftOut, narrows, narrowed, tupleOut } from './model.ts';
import { HOST_PYTHON_SUBPACKAGE } from './packages.ts';
import { PYTHON_HOST, aliasPython, foreignFailurePython } from './alias_python.ts';
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

// ---- Rust: conversion of one contract type ----

const HELPERS = `
fn type_error(subject: &str, expected: &str) -> BindingError {
    BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: expected.to_owned() }
}

/// B-3: text is a str whose code points are Unicode scalar values.
fn in_text(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<String> {
    let Ok(text) = value.cast::<PyString>() else { return Err(binding_error(py, type_error(subject, "str"))) };
    match text.to_str() {
        Ok(text) => Ok(text.to_owned()),
        Err(_unpaired) => Err(binding_error(py, BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::UnpairedSurrogate })),
    }
}

/// B-3, T-1 latin1: a str whose characters are U+0000 to U+00FF, one byte each.
fn in_latin1(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<Vec<u8>> {
    let Ok(text) = value.cast::<PyString>() else { return Err(binding_error(py, type_error(subject, "str"))) };
    let above = || binding_error(py, BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::AboveLatin1 });
    let Ok(text) = text.to_str() else { return Err(above()) };
    text.chars().map(|character| u8::try_from(u32::from(character)).map_err(|_above| above())).collect()
}

/// T-7: bytes from the buffer protocol types bytes, bytearray and memoryview.
fn in_bytes(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<Vec<u8>> {
    if value.cast::<PyString>().is_ok() {
        return Err(binding_error(py, type_error(subject, "bytes")));
    }
    match value.extract::<Vec<u8>>() {
        Ok(bytes) => Ok(bytes),
        Err(_not_bytes) => Err(binding_error(py, type_error(subject, "bytes"))),
    }
}

/// T-1 source: a str, as its UTF-8 (B-3), or the bytes of bytes, bytearray or memoryview.
fn in_source(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<Vec<u8>> {
    if value.cast::<PyString>().is_ok() {
        return in_text(py, value, subject).map(String::into_bytes);
    }
    match value.extract::<Vec<u8>>() {
        Ok(bytes) => Ok(bytes),
        Err(_not_bytes) => Err(binding_error(py, type_error(subject, "str or bytes"))),
    }
}

/// U-2: an argument that the caller left out is None, whose value the core decides; any other value is converted.
fn in_default<'py, T>(value: &Given<'py>, item: impl FnOnce(&Bound<'py, PyAny>) -> PyResult<T>) -> PyResult<Option<T>> {
    match value {
        Given::Omitted => Ok(None),
        Given::Value(value) => item(value).map(Some),
    }
}

fn in_bool(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<bool> {
    match value.cast_exact::<PyBool>() {
        Ok(flag) => Ok(flag.is_true()),
        Err(_not_bool) => Err(binding_error(py, type_error(subject, "bool"))),
    }
}

/// B-2, GN-12a: an int that is not a bool, 0 to 2^53 - 1 for the contract type uint; any other value is kind
/// invalid_number.
fn in_uint(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<u64> {
    let invalid = || binding_error(py, BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint });
    if !value.is_exact_instance_of::<PyInt>() {
        return Err(invalid());
    }
    match value.extract::<u64>() {
        Ok(integer) if integer <= 9_007_199_254_740_991 => Ok(integer),
        _ => Err(invalid()),
    }
}

/// B-2, GN-12a: as in_uint, a safe integer for the contract type int.
fn in_int(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<i64> {
    let invalid = || binding_error(py, BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int });
    if !value.is_exact_instance_of::<PyInt>() {
        return Err(invalid());
    }
    match value.extract::<i64>() {
        Ok(integer) if integer.unsigned_abs() <= 9_007_199_254_740_991 => Ok(integer),
        _ => Err(invalid()),
    }
}

/// B-2, T-1: as in_int, the range of i64 for the contract type int64.
fn in_int64(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<i64> {
    let invalid = || binding_error(py, BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int });
    if !value.is_exact_instance_of::<PyInt>() {
        return Err(invalid());
    }
    value.extract::<i64>().map_err(|_out_of_range| invalid())
}

/// B-2: a float; an int or a bool is not a float.
fn in_float(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<f64> {
    match value.cast_exact::<PyFloat>() {
        Ok(float) => Ok(float.value()),
        Err(_not_float) => Err(binding_error(py, BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Float })),
    }
}

/// T-2: a list or a tuple, each item converted.
fn in_list<'py, T>(
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
fn in_tuple<'py, const N: usize>(py: Python<'py>, value: &Bound<'py, PyAny>, subject: &str) -> PyResult<[Bound<'py, PyAny>; N]> {
    let Ok(tuple) = value.cast::<PyTuple>() else { return Err(binding_error(py, type_error(subject, "tuple"))) };
    <[Bound<'py, PyAny>; N]>::try_from(tuple.iter().collect::<Vec<_>>()).map_err(|_other| binding_error(py, type_error(subject, &format!("a tuple of {N} items"))))
}

fn in_optional<'py, T>(value: &Bound<'py, PyAny>, item: impl FnOnce(&Bound<'py, PyAny>) -> PyResult<T>) -> PyResult<Option<T>> {
    if value.is_none() {
        return Ok(None);
    }
    item(value).map(Some)
}

fn out_text<'py>(py: Python<'py>, value: impl AsRef<str>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyString::new(py, value.as_ref()).into_any())
}

/// T-1 latin1: each byte is one character.
fn out_latin1<'py>(py: Python<'py>, value: impl AsRef<[u8]>) -> PyResult<Bound<'py, PyAny>> {
    let text: String = value.as_ref().iter().map(|byte| char::from(*byte)).collect();
    Ok(PyString::new(py, &text).into_any())
}

fn out_bytes<'py>(py: Python<'py>, value: impl AsRef<[u8]>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyBytes::new(py, value.as_ref()).into_any())
}

fn out_bool<'py>(py: Python<'py>, value: impl Borrow<bool>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyBool::new(py, *value.borrow()).to_owned().into_any())
}

fn out_uint<'py>(py: Python<'py>, value: impl WideUint) -> PyResult<Bound<'py, PyAny>> {
    Ok(value.widen_uint().into_pyobject(py)?.into_any())
}

fn out_int<'py>(py: Python<'py>, value: impl WideInt) -> PyResult<Bound<'py, PyAny>> {
    Ok(value.widen_int().into_pyobject(py)?.into_any())
}

fn out_float<'py>(py: Python<'py>, value: impl Borrow<f64>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyFloat::new(py, *value.borrow()).into_any())
}

fn out_none(py: Python<'_>) -> PyResult<Bound<'_, PyAny>> {
    Ok(py.None().into_bound(py))
}

fn out_list<'py, T>(py: Python<'py>, value: impl IntoIterator<Item = T>, item: impl Fn(Python<'py>, T) -> PyResult<Bound<'py, PyAny>>) -> PyResult<Bound<'py, PyAny>> {
    let items = value.into_iter().map(|value| item(py, value)).collect::<PyResult<Vec<_>>>()?;
    Ok(PyList::new(py, items)?.into_any())
}

/// T-2: a dict in its order whose keys are str; any other key is kind invalid_argument_type.
fn in_map<'py, T>(
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
        let key = in_text(py, &key, subject)?;
        let value = item(py, &value)?;
        if map.insert(key, value).is_some() {
            return Err(binding_error(py, BindingError::Internal { detail: String::from("a dict gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a map, owned or borrowed, as a dict in its order.
fn out_map<'py, T>(
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
fn in_keyed_map<'py, T>(
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
            (0, binding_core::Key::Int(in_int(py, &key, subject)?))
        } else if let Ok(bytes) = key.cast_exact::<PyBytes>() {
            (1, binding_core::Key::Bytes(bytes.as_bytes().to_vec()))
        } else if key.is_exact_instance_of::<PyString>() {
            (2, binding_core::Key::Text(in_text(py, &key, subject)?))
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
fn out_keyed_map<'py, T>(
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

fn out_tuple<'py>(py: Python<'py>, items: Vec<Bound<'py, PyAny>>) -> PyResult<Bound<'py, PyAny>> {
    Ok(PyTuple::new(py, items)?.into_any())
}

fn out_optional<'py, T>(py: Python<'py>, value: Option<T>, item: impl FnOnce(Python<'py>, T) -> PyResult<Bound<'py, PyAny>>) -> PyResult<Bound<'py, PyAny>> {
    match value {
        Some(value) => item(py, value),
        None => out_none(py),
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
    const fn: Record<string, string> = { text: 'in_text', latin1: 'in_latin1', bool: 'in_bool', uint: 'in_uint', int: 'in_int', int64: 'in_int64', bytes: 'in_bytes', source: 'in_source', float: 'in_float' };
    return `${fn[type]}(py, ${value}, ${subject})`;
  }
  if ('list' in type) return `in_list(py, ${value}, ${subject}, ${closure(['py', 'item'], convertIn(model, type.list, 'item', subject))})`;
  if ('map' in type) return `in_map(py, ${value}, ${subject}, ${closure(['py', 'item'], convertIn(model, type.map, 'item', subject))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `in_keyed_map(py, ${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`a dict whose keys are ${type.key.map((k) => ({ int: 'int', bytes: 'bytes', text: 'str' })[k] ?? k).join(' or ')}`)}, ${closure(['py', 'item'], convertIn(model, type.keyed_map, 'item', subject))})`;
  }
  if ('optional' in type) return `in_optional(${value}, ${closure(['value'], convertIn(model, type.optional, 'value', subject))})`;
  if ('tuple' in type) return tupleIn(type.tuple, `in_tuple(py, ${value}, ${subject})`, (part, name) => convertIn(model, part, `&${name}`, subject));
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum' || unit?.origin === 'callback' || objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined) {
    return `in_${recordFn(unit ?? { name: [] }, aliasOf(model, type)?.library)}(py, ${value}, ${subject})`;
  }
  if (unit?.kind === 'record' || unit?.kind === 'variant') return `in_${recordFn(unit, libraryOf(type))}(py, ${value}, ${subject})`;
  throw new Unsupported(`no Python input conversion for ${JSON.stringify(type)}`);
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'out_text', latin1: 'out_latin1', bool: 'out_bool', uint: 'out_uint', int: 'out_int', int64: 'out_int', bytes: 'out_bytes', float: 'out_float', none: 'out_none' };
    // T-2 never: the core's Infallible has no value, so the call has failed before.
    if (type === 'never') return `match ${value} {}`;
    return type === 'none' ? 'out_none(py)' : `${fn[type]}(py, ${value})`;
  }
  if ('list' in type) return `out_list(py, ${value}, ${closure(['py', 'item'], convertOut(model, type.list, 'item'))})`;
  // The value of a keyed map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('keyed_map' in type) return `out_keyed_map(py, ${value}, |py, item| ${convertOut(model, type.keyed_map, 'item')})`;
  if ('map' in type) return `out_map(py, ${value}, |py, item| ${convertOut(model, type.map, 'item')})`;
  if ('optional' in type) return `out_optional(py, ${optionRef(value)}, ${closure(['py', 'value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) {
    return tupleOut(type.tuple, value, (t, name) => convertOut(model, t, name), (parts) => `out_tuple(py, vec![${parts.join(', ')}])`);
  }
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `out_${rustField(unit.name)}(py, ${value})`;
  if (unit?.kind === 'record' || unit?.kind === 'variant') return `out_${recordFn(unit, libraryOf(type))}(py, ${value})`;
  if ((objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined) && unit !== undefined) return `out_${recordFn(unit, aliasOf(model, type)?.library)}(py, ${value})`;
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
    let text: String = in_text(py, &raw, subject)?;
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
  const name = recordFn(unit, library);
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
    const converted = arg.default === undefined ? convertIn(model, arg.type, variable, subject) : `in_default(&${variable}, ${closure(['value'], convertIn(model, arg.type, 'value', subject))})`;
    lines.push(held === undefined
      ? `        let ${variable}: ${argType(model, arg)} = ${converted}?;`
      : `        let ${variable} = held_${rustField(held.unit.name)}(py, ${variable}, ${subject})?;`);
    if (held === undefined && (arg.field ? narrows(arg.type) : arg.default === undefined && narrows(arg.type))) lines.push(`        ${narrowed(variable, subject, '|error| binding_error(py, error)')}`);
  }
  if (fn.record !== undefined) {
    const recordType = fn.record.unit.core_type ?? '';
    const fields = (fn.record.unit.fields ?? []).map((f) => fieldInit(rustField(f.name), rustIdent(langName('python', f.name, 'variable')))).join(', ');
    lines.push(`        let ${rustField(fn.record.param.name)}: ${recordType} = ${recordType} { ${fields} };`);
  }
  lines.push(...locks(model, fn));
  const core = `${fn.corePath}(${coreCallArgs(model, fn, (p) => rustIdent(langName('python', p.name, 'variable')), 'self.inner').join(', ')})`;
  const armed = armedCall(model, fn, core);
  // GN-6m, GN-6n: the core call of a member that waits runs without the GIL, so other Python threads run while it
  // waits; the future of an async member runs on the runtime of binding_core.
  const call = waitsAsync(fn) ? drivenCall(model, fn, core, (wait) => `py.detach(|| ${wait})`, '|error| binding_error(py, error)') : waitsIo(fn) ? `py.detach(|| ${armed})` : armed;
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
  if (fn.kind === 'function') {
    return `
#[pyfunction]
#[pyo3(signature = (${signature}))]
fn ${name}<'py>(py: Python<'py>${params}) -> PyResult<Bound<'py, PyAny>> {
    guard(py, || {
${lines.join('\n')}
    })
}
${awaits(fn) ? awaitedFunction(name) : ''}`;
  }
  // GN-6: the Rust name of a method is member_<name> and its Python name an attribute, so that no name of a member meets
  // a naming convention of the lints for methods (from_*, to_*, into_*, is_*, the names of std traits); a hook keeps
  // the name that Python calls (N-4).
  const pyName = rustString(name);
  const attributes = fn.special === 'stringify' ? [] : ({ static: ['#[staticmethod]', `#[pyo3(name = ${pyName}, signature = (${signature}))]`], method: [`#[pyo3(name = ${pyName}, signature = (${signature}))]`], property: [`#[getter(${name})]`] }[fn.kind] ?? []);
  const self = fn.receiver === undefined ? '' : '&self, ';
  const ident = fn.special === 'stringify' ? name : `member_${name}`;
  return `
${attributes.map((a) => `    ${a}`).join('\n')}
    fn ${ident}<'py>(${self}py: Python<'py>${params}) -> PyResult<Bound<'py, PyAny>> {
        guard(py, || {
${lines.map((l) => `    ${l}`).join('\n')}
        })
    }
${awaits(fn) ? awaitedMethod(fn, name) : ''}`;
}

// GN-6m: the Python name of the awaitable of a member that waits; CK-16 keeps it apart from every other name.
export const awaitedName = (fn: Fn): string => `a${memberName('python', fn)}`;

// GN-6m: a<name> of a function runs <name> in asyncio.to_thread; the arguments are judged when <name> runs.
const awaitedFunction = (name: string): string => `
#[pyfunction(name = ${rustString(`a${name}`)}, signature = (*args, **kwargs))]
fn a${name}<'py>(py: Python<'py>, args: &Bound<'py, PyTuple>, kwargs: Option<&Bound<'py, PyDict>>) -> PyResult<Bound<'py, PyAny>> {
    awaited(py, wrap_pyfunction!(${name}, py)?.into_any(), args, kwargs)
}
`;

// GN-6m: a<name> of a method or a static method runs the bound <name> in asyncio.to_thread.
function awaitedMethod(fn: Fn, name: string): string {
  const attribute = `#[pyo3(name = ${rustString(`a${name}`)}, signature = (*args, **kwargs))]`;
  if (fn.receiver === undefined) {
    return `
    #[staticmethod]
    ${attribute}
    fn member_a${name}<'py>(py: Python<'py>, args: &Bound<'py, PyTuple>, kwargs: Option<&Bound<'py, PyDict>>) -> PyResult<Bound<'py, PyAny>> {
        awaited(py, py.get_type::<Self>().getattr(${rustString(name)})?, args, kwargs)
    }
`;
  }
  return `
    ${attribute}
    fn member_a${name}<'py>(slf: &Bound<'py, Self>, args: &Bound<'py, PyTuple>, kwargs: Option<&Bound<'py, PyDict>>) -> PyResult<Bound<'py, PyAny>> {
        awaited(slf.py(), slf.getattr(${rustString(name)})?, args, kwargs)
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
`;

// T-5: a class unit is a class of the native module that holds the core value; its members call the core (U-2).
function objectRust(model: Model, layout: PythonLayout, object: ObjectClass, givesOut: boolean): string {
  const pyClass = langName('python', object.unit.name, 'class');
  const struct = `Py${pyClass}`;
  const core = object.unit.core_type ?? '';
  const members = object.members.map((fn) => functionRust(model, fn)).join('');
  return `
/// T-5: ${pyClass}${object.constructible ? '' : ', which only its static members make (U-1 constructible)'}.
#[pyclass(name = ${rustString(pyClass)}, module = ${rustString(moduleOf(layout, object.unit.module))}, frozen)]
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
        if !self.inner.taken() {
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
fn out_${rustField(object.unit.name)}(py: Python<'_>, value: ${core}) -> PyResult<Bound<'_, PyAny>> {
    Ok(Bound::new(py, ${struct} { inner: ${heldNew(object, 'value')} })?.into_any())
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

// U-3: a callback is a struct that holds the language object and implements the core trait; its calls convert the
// arguments out and the return in, and an exception of the language code, or a failure of the binding in the callback,
// goes to the core as a Raised that the generated caller throws again unchanged. GN-6q: each call takes the GIL on the
// thread on which the core calls it, so a callback with thread owner has no check of the thread.
function callbackRust(model: Model, cb: CallbackUnit): string {
  const name = rustField(cb.unit.name);
  const struct = rustType(model, { unit: cb.unit.id });
  const pyName = langName('python', cb.unit.name, 'class');
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
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
            call().map_err(|error| thrown(py, error))
        })
    }`;
  }).join('\n');
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
`;
}

// T-1: the type of a trait method parameter: a type with two forms is borrowed, a Copy type by value.
function traitParam(model: Model, type: Type): string {
  if (typeof type === 'string') {
    const borrowed: Record<string, string> = { text: '&str', latin1: '&[u8]', bytes: '&[u8]', source: '&[u8]', path: '&std::path::Path' };
    return borrowed[type] ?? rustType(model, type);
  }
  if ('optional' in type && typeof type.optional === 'string' && ['text', 'latin1', 'bytes'].includes(type.optional)) return `Option<${traitParam(model, type.optional)}>`;
  if ('list' in type) return `&[${rustType(model, type.list)}]`;
  if (byValue(model, type)) return rustType(model, type);
  return `&${rustType(model, type)}`;
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

fn thrown(py: Python<'_>, error: PyErr) -> binding_core::Failure<${model.coreError ?? '()'}> {
    let handle = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    thrown_map().insert(handle, error.into_value(py).into_any());
    binding_core::Failure::Raised(binding_core::Raised::from_generated(binding_core::Handle::new(handle)))
}

fn failure_error(py: Python<'_>, failure: binding_core::Failure<${model.coreError ?? '()'}>) -> PyErr {
    match failure {
        binding_core::Failure::Kind(error) => core_error(py, error),
        binding_core::Failure::Raised(raised) => match thrown_map().remove(&raised.handle().raw()) {
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
  const arms = model.kinds.map((k) => `        ${k.variant} { .. } => ${rustString(k.unit === undefined ? k.className : unitClass(k.unit))},`).join('\n');
  const doc = `/// I-2 (3): the class of each variant of the core error, by a match without a wildcard. The pattern \`{ .. }\` matches a
/// variant with or without data, which the generator does not see (I-2: binding reads no Rust source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]`;
  if (model.errorUnits.length === 0) {
    return `
${doc}
fn core_error(py: Python<'_>, error: ${model.coreError}) -> PyErr {
    let class = match error {
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
${errorProperties(u).map(({ property }) => `    let value = ${property.corePath}(error);
    object.setattr(${rustString(`_${langName('python', property.member.name, 'variable')}`)}, ${convertOut(model, property.returns, 'value')}?)?;`).join('\n')}
    Ok(())
}
`).join('');
  const propertyArms = model.kinds.map((k) => `        ${k.variant} { .. } => ${k.unit === undefined || errorProperties(k.unit).length === 0 ? 'Ok(())' : `${rustField(k.unit.unit.name)}_properties(py, &raised, &error)`},`).join('\n');
  return `${setters}
${doc}
fn core_error(py: Python<'_>, error: ${model.coreError}) -> PyErr {
    let class = match error {
${arms}
    };
    let raised = library_error(py, class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error));
    let written = match error {
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
    ...model.foreignRecords.map((r) => recordRust(model, r.unit, r.library)),
    ...model.variants.map((v) => variantRust(model, v)),
    ...model.aliases.map((a) => aliasPython(model, a)),
    model.aliases.length > 0 ? PYTHON_HOST : '',
  ].join('\n');
  // The conversion out of a class is written when a call gives the class: the constructor wraps the value itself, so
  // a class that no member returns has none (the lints deny dead code).
  const rest = model.callbacks.map((c) => callbackRust(model, c)).join('') + failureRust(model) + foreignFailurePython(model);
  const draft = functions + model.objects.map((o) => objectRust(model, layout, o, true)).join('') + rest;
  const givesOut = (o: ObjectClass): boolean => new RegExp(`(?<!fn )\\bout_${rustField(o.unit.name)}\\(`).test(draft);
  const objects = model.objects.map((o) => objectRust(model, layout, o, givesOut(o))).join('') + rest;
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
  const used = usedHelpers(`${HELPERS}\n${WIDEN}\n${INTO_CORE}\n${PARTS}\n${AWAITED}\n${DRIVEN}\n${typesFn}\n${enums}`, `${functions}${objects}${coreError}`);
  const pyTypes = ['PyBool', 'PyBytes', 'PyDict', 'PyFloat', 'PyInt', 'PyList', 'PyModule', 'PyString', 'PyTuple'].filter((t) => new RegExp(`\\b${t}\\b`).test(`${used}${functions}${objects}`) || t === 'PyModule');
  const register = [
    ...model.functions.map((fn) => `    module.add_function(wrap_pyfunction!(${langName('python', fn.member.name, 'callable')}, module)?)?;`),
    ...model.functions.filter(awaits).map((fn) => `    module.add_function(wrap_pyfunction!(${awaitedName(fn)}, module)?)?;`),
    ...model.objects.map((o) => `    module.add_class::<Py${langName('python', o.unit.name, 'class')}>()?;`),
  ].join('\n');
  const classChecks = model.classes.map((c) => `    errors(module.py())?.getattr(${rustString(c.name)})?;`).join('\n');
  return `${header('//')}
// The native module ${layout.module}._native of ${model.contract.library}.

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
${model.aliases.length > 0 ? `use binding_core::{Handle, HostText, HostValue, HostValues, OutValue, OutValues${/\bPredicate::/.test(used) ? ', Predicate' : ''}};\n` : ''}use pyo3::prelude::*;
use pyo3::sync::PyOnceLock;
use pyo3::types::{${pyTypes.join(', ')}};
${/Borrow</.test(`${used}${objects}`) ? 'use std::borrow::Borrow;\n' : ''}${/\bBTreeMap\b/.test(`${used}${objects}`) ? 'use std::collections::BTreeMap;\n' : ''}use std::panic::{catch_unwind, AssertUnwindSafe};${/\bTHROWN\b/.test(objects) ? '\nuse std::sync::atomic::{AtomicU64, Ordering};\nuse std::sync::{Mutex, MutexGuard};' : ''}

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
`).join('')}
${poisonRust(model)}#[pymodule]
fn _native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    // B-4: the classes are found when the module loads; a missing one fails the import.
${classChecks}
${register}
    #[cfg(feature = "panic-test")]
    module.add_function(wrap_pyfunction!(_panic_test, module)?)?;${model.objects.some((o) => o.lock?.writes === true) ? `
    #[cfg(feature = "panic-test")]
    module.add_function(wrap_pyfunction!(${POISON_ENTRY.python}, module)?)?;` : ''}${aliasesWithKinds(model).map((alias) => `
    #[cfg(feature = "codec-test")]
    module.add_function(wrap_pyfunction!(_alias_in_${rustField(alias.unit.name)}, module)?)?;`).join('')}${model.faults.length === 0 ? '' : `
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
    const map: Record<string, string> = { text: 'str', latin1: 'str', bool: 'bool', uint: 'int', int: 'int', int64: 'int', float: 'float', bytes: input ? 'bytes | bytearray | memoryview' : 'bytes', source: 'str | bytes | bytearray | memoryview', none: 'None', never: 'NoReturn' };
    return map[type] ?? 'object';
  }
  if ('list' in type) return input ? `Sequence[${pyType(model, type.list, input)}]` : `list[${pyType(model, type.list, input)}]`;
  if ('map' in type) return `dict[str, ${pyType(model, type.map, input)}]`;
  if ('keyed_map' in type) return `dict[${type.key.map((k) => ({ int: 'int', bytes: 'bytes', text: 'str' })[k] ?? 'object').join(' | ')}, ${pyType(model, type.keyed_map, input)}]`;
  if ('optional' in type) return `${pyType(model, type.optional, input)} | None`;
  if ('tuple' in type) return `tuple[${type.tuple.map((t) => pyType(model, t, input)).join(', ')}]`;
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
  return [...byModule].map(([module, names]) => `from ${module} import ${names.map((n) => `${n} as ${n}`).join(', ')}`);
}

// The units of <root>._types: the enums, the records of the result form, the variants after the classes of their cases
// (GN-6v) and the callbacks.
const typeUnits = (model: Model): Unit[] => [...model.enums, ...model.resultRecords, ...model.variants.flatMap((v) => [...v.cases.map((c) => c.unit), v.unit]), ...model.callbacks.map((c) => c.unit)];

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

${(u.fields ?? []).map((f) => `    ${langName('python', f.name, 'variable')}: ${pyType(model, f.type, false)}`).join('\n')}`).join('');
  // T-9, GN-6v: a frozen dataclass per case and the alias of their union.
  const variants = model.variants.map((v) => `${v.cases.map((kase) => `

@dataclass(frozen=True, kw_only=True)
class ${langName('python', kase.unit.name, 'class')}:
    \"\"\"T-9: the case ${kase.value} of the variant ${langName('python', v.unit.name, 'class')}; the constructor holds the values, which the binding judges when they enter.\"\"\"
${(kase.unit.fields ?? []).map((f) => `\n    ${langName('python', f.name, 'variable')}: ${pyType(model, f.type, false)}${leftOut(f) ? ' = None' : ''}`).join('')}`).join('')}


type ${langName('python', v.unit.name, 'class')} = ${v.cases.map((kase) => langName('python', kase.unit.name, 'class')).join(' | ')}`).join('');
  const callbacks = model.callbacks.map((cb) => `


class ${langName('python', cb.unit.name, 'class')}(Protocol):
    \"\"\"U-3: a callback that Python code implements; the binding checks the members of the object it receives.\"\"\"

${cb.members.map((m) => `    def ${langName('python', m.member.name, 'callable')}(self${m.params.map((p) => `, ${langName('python', p.name, 'variable')}: ${pyType(model, p.type, false)}`).join('')}) -> ${pyType(model, m.returns, true)}: ...`).join('\n\n')}`).join('');
  const names = typeUnits(model).map((u) => pyString(langName('python', u.name, 'class')));
  return `${pyHeader()}
\"\"\"The enums, records and variants of ${model.contract.library} (T-6, T-4, T-9).\"\"\"

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
${model.callbacks.length > 0 ? 'from typing import Protocol\n' : ''}${foreignImports(model).map((line) => `${line}\n`).join('')}
__all__ = [${names.join(', ')}]${enums}${records}${variants}${callbacks}
`;
}

function modulePy(model: Model, module: string): string {
  const fns = [
    ...model.functions.filter((f) => f.module === module).flatMap((f) => [langName('python', f.member.name, 'callable'), ...(awaits(f) ? [awaitedName(f)] : [])]),
    ...model.objects.filter((o) => o.unit.module === module).map((o) => langName('python', o.unit.name, 'class')),
  ];
  const enums = typeUnits(model).filter((u) => u.module === module).map((u) => langName('python', u.name, 'class'));
  const constants = model.constants.filter((c) => c.module === module);
  // GN-11: an error unit is a class of <root>._errors, which the module of its unit imports; the root module needs no
  // import, because <root> imports every name of <root>._errors.
  const errors = module === '' ? [] : model.errorUnits.filter((u) => u.unit.module === module).map((u) => langName('python', u.unit.name, 'class'));
  const names = [...errors, ...fns, ...enums, ...constants.map((c) => langName('python', c.member.name, 'constant'))];
  const imports = [
    errors.length > 0 ? `from ._errors import ${errors.map((e) => `${e} as ${e}`).join(', ')}` : '',
    fns.length > 0 ? `from ._native import ${fns.map((f) => `${f} as ${f}`).join(', ')}` : '',
    enums.length > 0 ? `from ._types import ${enums.map((e) => `${e} as ${e}`).join(', ')}` : '',
    constants.length > 0 ? 'from typing import Final' : '',
  ].filter((l) => l !== '');
  const values = constants.map((c) => `${langName('python', c.member.name, 'constant')}: Final = ${JSON.stringify(c.member.value)}`);
  return `${pyHeader()}
"""The module ${module === '' ? '(root)' : module} of ${model.contract.library} (P-2)."""

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
    const shown = value === undefined ? '...' : typeof value === 'boolean' ? (value ? 'True' : 'False') : typeof value === 'string' ? pyString(value) : String(value);
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
    return `\n@final\nclass ${langName('python', o.unit.name, 'class')}:\n${lines.join('\n')}\n`;
  });
  return `${pyHeader()}
from collections.abc import ${model.objects.some((o) => o.members.some((f) => f.kind === 'iterate')) ? 'Iterator, ' : ''}Sequence
from typing import ${/\bNoReturn\b/.test([...fns, ...classes].join('\n')) ? 'NoReturn, ' : ''}final
${enumImports.length > 0 ? `from ._types import ${enumImports.join(', ')}\n` : ''}${foreignImports(model).map((line) => `${line}\n`).join('')}
${fns.join('\n')}
${classes.join('')}`;
}

function initPy(model: Model): string {
  const modules = [...new Set([...model.functions.map((f) => f.module), ...model.objects.map((o) => o.unit.module), ...model.enums.map((u) => u.module), ...model.resultRecords.map((u) => u.module), ...model.variants.map((v) => v.unit.module), ...model.callbacks.map((c) => c.unit.module), ...model.constants.map((c) => c.module), ...model.errorUnits.map((u) => u.unit.module)])].sort();
  const imports = modules.map((m) => (m === '' ? 'from ._root import *  # noqa: F403' : `from .${m.replaceAll('/', '.')} import *  # noqa: F403`));
  const names = [
    ...model.classes.map((c) => c.name),
    ...model.errorUnits.map((u) => langName('python', u.unit.name, 'class')),
    ...model.functions.map((f) => langName('python', f.member.name, 'callable')),
    ...model.objects.map((o) => langName('python', o.unit.name, 'class')),
    ...model.enums.map((u) => langName('python', u.name, 'class')),
    ...model.resultRecords.map((u) => langName('python', u.name, 'class')),
    ...model.variants.flatMap((v) => [...v.cases.map((c) => c.unit), v.unit]).map((u) => langName('python', u.name, 'class')),
    ...model.callbacks.map((c) => langName('python', c.unit.name, 'class')),
    ...model.constants.map((c) => langName('python', c.member.name, 'constant')),
  ];
  return `${pyHeader()}
"""${model.contract.library}: the public API (P-3)."""

from ._errors import *  # noqa: F403
${imports.join('\n')}

__all__ = [${names.map(pyString).join(', ')}]
`;
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
  const modules = [...new Set([...model.functions.map((f) => f.module), ...model.objects.map((o) => o.unit.module), ...model.enums.map((u) => u.module), ...model.resultRecords.map((u) => u.module), ...model.variants.map((v) => v.unit.module), ...model.callbacks.map((c) => c.unit.module), ...model.constants.map((c) => c.module), ...model.errorUnits.map((u) => u.unit.module)])];
  for (const module of modules) {
    files.set(module === '' ? `${pkg}/_root.py` : `${pkg}/${module}.py`, modulePy(model, module));
  }
  files.set(`${pkg}/__init__.py`, initPy(model));
  files.set(`${ROOT}/tests/test_generated.py`, pythonTests(model, layout.module));
  void moduleOf;
}
