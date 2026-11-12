// The Python binding (PyO3, abi3-py310): the Rust crate, the Python package around its `_native` module, the type
// stubs and the generated tests (G-5).

import type { Type, Unit } from '../contract.ts';
import { type Files, header, pyHeader, pyString, rustString, closure, optionRef, usedHelpers, WIDEN } from './text.ts';
import { type CallbackUnit, type Fn, type Model, byValue, type ObjectClass, coreCallArgs, langName, libraryOf, objectUnit, recordFn, rustField, rustIdent, rustType, rustVariant, unitOf } from './model.ts';
import { HOST_PYTHON_SUBPACKAGE } from './packages.ts';
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

fn in_bool(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<bool> {
    match value.cast_exact::<PyBool>() {
        Ok(flag) => Ok(flag.is_true()),
        Err(_not_bool) => Err(binding_error(py, type_error(subject, "bool"))),
    }
}

/// B-2: an int that is not a bool, in the range of the contract type; any other value is kind invalid_number.
fn in_uint(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<u64> {
    let invalid = || binding_error(py, BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint });
    if !value.is_exact_instance_of::<PyInt>() {
        return Err(invalid());
    }
    value.extract::<u64>().map_err(|_out_of_range| invalid())
}

/// B-2: as in_uint for the contract type int.
fn in_int(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<i64> {
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

function convertIn(model: Model, type: Type, value: string, subject: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'in_text', latin1: 'in_latin1', bool: 'in_bool', uint: 'in_uint', int: 'in_int', int64: 'in_int', bytes: 'in_bytes', float: 'in_float' };
    return `${fn[type]}(py, ${value}, ${subject})`;
  }
  if ('list' in type) return `in_list(py, ${value}, ${subject}, ${closure(['py', 'item'], convertIn(model, type.list, 'item', subject))})`;
  if ('optional' in type) return `in_optional(${value}, ${closure(['value'], convertIn(model, type.optional, 'value', subject))})`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum' || unit?.origin === 'callback') return `in_${rustField(unit.name)}(py, ${value}, ${subject})`;
  if (unit?.kind === 'record') return `in_${recordFn(unit, libraryOf(type))}(py, ${value}, ${subject})`;
  throw new Error(`no Python input conversion for ${JSON.stringify(type)}`);
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'out_text', latin1: 'out_latin1', bool: 'out_bool', uint: 'out_uint', int: 'out_int', int64: 'out_int', bytes: 'out_bytes', float: 'out_float', none: 'out_none' };
    return type === 'none' ? 'out_none(py)' : `${fn[type]}(py, ${value})`;
  }
  if ('list' in type) return `out_list(py, ${value}, ${closure(['py', 'item'], convertOut(model, type.list, 'item'))})`;
  if ('optional' in type) return `out_optional(py, ${optionRef(value)}, ${closure(['py', 'value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) {
    const parts = type.tuple.map((t, i) => convertOut(model, t, `&${value}.${i}`));
    return `out_tuple(py, vec![${parts.map((p) => `${p}?`).join(', ')}])`;
  }
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `out_${rustField(unit.name)}(py, ${value})`;
  if (unit?.kind === 'record') return `out_${recordFn(unit, libraryOf(type))}(py, ${value})`;
  if (objectUnit(model, type) !== undefined && unit !== undefined) return `out_${rustField(unit.name)}(py, ${value})`;
  throw new Error(`no Python output conversion for ${JSON.stringify(type)}`);
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
    return `    let ${rustField(f.name)}: ${rustType(model, f.type)} = ${convertIn(model, f.type, `&value.getattr(${rustString(attr)})?`, 'subject')}?;`;
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

const fieldInit = (field: string, variable: string): string => (field === variable ? field : `${field}: ${variable}`);

function functionRust(model: Model, fn: Fn): string {
  const name = langName('python', fn.member.name, 'callable');
  const positional = fn.args.filter((a) => !a.field).map((a) => rustIdent(langName('python', a.name, 'variable')));
  const keyword = fn.args.filter((a) => a.field).map((a) => rustIdent(langName('python', a.name, 'variable')));
  const signature = keyword.length === 0 ? positional.join(', ') : [...positional, '*', ...keyword].join(', ');
  const all = [...positional, ...keyword];
  const params = all.map((p) => `, ${p}: &Bound<'py, PyAny>`).join('');
  const lines: string[] = [];
  for (const arg of fn.args) {
    const variable = rustIdent(langName('python', arg.name, 'variable'));
    lines.push(`        let ${variable}: ${rustType(model, arg.type)} = ${convertIn(model, arg.type, variable, rustString(langName('python', arg.name, 'variable')))}?;`);
  }
  if (fn.record !== undefined) {
    const recordType = fn.record.unit.core_type ?? '';
    const fields = (fn.record.unit.fields ?? []).map((f) => fieldInit(rustField(f.name), rustIdent(langName('python', f.name, 'variable')))).join(', ');
    lines.push(`        let ${rustField(fn.record.param.name)}: ${recordType} = ${recordType} { ${fields} };`);
  }
  const call = `${fn.corePath}(${coreCallArgs(model, fn, (p) => rustIdent(langName('python', p.name, 'variable')), 'self.inner').join(', ')})`;
  if (fn.fallible) {
    lines.push(`        let result = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(${fn.failure ? 'failure_error' : 'core_error'}(py, error)),\n        };`);
  } else {
    lines.push(`        let result = ${call};`);
  }
  if (fn.kind === 'constructor') {
    lines.push('        Ok(Self { inner: result })');
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
`;
  }
  const attributes = { static: ['#[staticmethod]', `#[pyo3(signature = (${signature}))]`], method: [`#[pyo3(signature = (${signature}))]`], property: ['#[getter]'] }[fn.kind];
  const self = fn.receiver === undefined ? '' : '&self, ';
  return `
${attributes.map((a) => `    ${a}`).join('\n')}
    fn ${name}<'py>(${self}py: Python<'py>${params}) -> PyResult<Bound<'py, PyAny>> {
        guard(py, || {
${lines.map((l) => `    ${l}`).join('\n')}
        })
    }
`;
}

// T-5: a class unit is a class of the native module that holds the core value; its members call the core (U-2).
function objectRust(model: Model, layout: PythonLayout, object: ObjectClass): string {
  const pyClass = langName('python', object.unit.name, 'class');
  const struct = `Py${pyClass}`;
  const core = object.unit.core_type ?? '';
  const members = object.members.map((fn) => functionRust(model, fn)).join('');
  return `
/// T-5: ${pyClass}${object.constructible ? '' : ', which only its static members make (U-1 constructible)'}.
#[pyclass(name = ${rustString(pyClass)}, module = ${rustString(moduleOf(layout, object.unit.module))}, frozen)]
pub struct ${struct} {
    inner: ${core},
}

#[pymethods]
impl ${struct} {${members}}

fn out_${rustField(object.unit.name)}(py: Python<'_>, value: ${core}) -> PyResult<Bound<'_, PyAny>> {
    Ok(Bound::new(py, ${struct} { inner: value })?.into_any())
}
`;
}

// U-3: a callback is a struct that holds the language object and implements the core trait; its calls convert the
// arguments out and the return in, and an exception of the language code, or a failure of the binding in the callback,
// goes to the core as a Raised that the generated caller throws again unchanged.
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
        Python::attach(|py| {${cb.owner ? `
            if std::thread::current().id() != self.owner {
                return Err(thrown(py, binding_error(py, BindingError::WrongThread { subject: String::from(${rustString(`${pyName}.${method}()`)}) })));
            }` : ''}
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
    object: Py<PyAny>,${cb.owner ? '\n    owner: std::thread::ThreadId,' : ''}
}

/// U-3: a callback object is checked when it enters: each member is a callable attribute (kind invalid_callback).
fn in_${name}(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<${struct}> {
${checks}
    Ok(${struct} { object: value.clone().unbind()${cb.owner ? ', owner: std::thread::current().id()' : ''} })
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
  if (!model.functions.some((f) => f.failure) && !model.objects.some((o) => o.members.some((f) => f.failure))) return '';
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

function coreErrorRust(model: Model): string {
  if (model.coreError === undefined) return '';
  const arms = model.kinds.map((k) => `        ${k.variant} { .. } => ${rustString(k.className)},`).join('\n');
  return `
/// I-2 (3): the class of each variant of the core error, by a match without a wildcard. The pattern \`{ .. }\` matches a
/// variant with or without data, which the generator does not see (I-2: binding reads no Rust source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn core_error(py: Python<'_>, error: ${model.coreError}) -> PyErr {
    let class = match error {
${arms}
    };
    library_error(py, class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))
}
`;
}

function libRust(model: Model, layout: PythonLayout): string {
  const classOf = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  const constants = model.constants
    .map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`)
    .join('\n');
  const functions = model.functions.map((fn) => functionRust(model, fn)).join('');
  const enums = [
    ...model.enums.map((u) => enumRust(model, u)),
    ...model.resultRecords.map((u) => recordRust(model, u)),
    ...model.foreignRecords.map((r) => recordRust(model, r.unit, r.library)),
  ].join('\n');
  const objects = model.objects.map((o) => objectRust(model, layout, o)).join('') + model.callbacks.map((c) => callbackRust(model, c)).join('') + failureRust(model);
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
  const used = usedHelpers(`${HELPERS}\n${WIDEN}\n${typesFn}\n${enums}`, `${functions}${objects}${coreErrorRust(model)}`);
  const pyTypes = ['PyBool', 'PyBytes', 'PyDict', 'PyFloat', 'PyInt', 'PyList', 'PyModule', 'PyString', 'PyTuple'].filter((t) => new RegExp(`\\b${t}\\b`).test(`${used}${functions}${objects}`) || t === 'PyModule');
  const register = [
    ...model.functions.map((fn) => `    module.add_function(wrap_pyfunction!(${langName('python', fn.member.name, 'callable')}, module)?)?;`),
    ...model.objects.map((o) => `    module.add_class::<Py${langName('python', o.unit.name, 'class')}>()?;`),
  ].join('\n');
  const classChecks = model.classes.map((c) => `    errors(module.py())?.getattr(${rustString(c.name)})?;`).join('\n');
  return `${header('//')}
// The native module ${layout.module}._native of ${model.contract.library}.

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
use pyo3::prelude::*;
use pyo3::sync::PyOnceLock;
use pyo3::types::{${pyTypes.join(', ')}};
${/Borrow</.test(used) ? 'use std::borrow::Borrow;\n' : ''}${/\bTHROWN\b/.test(objects) ? 'use std::collections::BTreeMap;\n' : ''}use std::panic::{catch_unwind, AssertUnwindSafe};${/\bTHROWN\b/.test(objects) ? '\nuse std::sync::atomic::{AtomicU64, Ordering};\nuse std::sync::{Mutex, MutexGuard};' : ''}

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
${coreErrorRust(model)}
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

${used}${functions}${objects}
/// B-7: the entry point of the generated panic test.
#[cfg(feature = "panic-test")]
#[pyfunction]
fn _panic_test(py: Python<'_>) -> PyResult<()> {
    guard(py, || panic!("panic-test"))
}

#[pymodule]
fn _native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    // B-4: the classes are found when the module loads; a missing one fails the import.
${classChecks}
${register}
    #[cfg(feature = "panic-test")]
    module.add_function(wrap_pyfunction!(_panic_test, module)?)?;
    Ok(())
}
`;
}

// ---- Python sources ----

function pyType(model: Model, type: Type, input: boolean): string {
  if (typeof type === 'string') {
    const map: Record<string, string> = { text: 'str', latin1: 'str', bool: 'bool', uint: 'int', int: 'int', int64: 'int', float: 'float', bytes: input ? 'bytes | bytearray | memoryview' : 'bytes', none: 'None' };
    return map[type] ?? 'object';
  }
  if ('list' in type) return input ? `Sequence[${pyType(model, type.list, input)}]` : `list[${pyType(model, type.list, input)}]`;
  if ('optional' in type) return `${pyType(model, type.optional, input)} | None`;
  if ('tuple' in type) return `tuple[${type.tuple.map((t) => pyType(model, t, input)).join(', ')}]`;
  const unit = unitOf(model, type);
  return unit === undefined ? 'object' : langName('python', unit.name, 'class');
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
  return `${pyHeader()}
"""The error classes of ${model.contract.library} (E-2, B-4)."""

import builtins

__all__ = [${model.classes.map((c) => pyString(c.name)).join(', ')}]${classes}
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
  const callbacks = model.callbacks.map((cb) => `


class ${langName('python', cb.unit.name, 'class')}(Protocol):
    \"\"\"U-3: a callback that Python code implements; the binding checks the members of the object it receives.\"\"\"

${cb.members.map((m) => `    def ${langName('python', m.member.name, 'callable')}(self${m.params.map((p) => `, ${langName('python', p.name, 'variable')}: ${pyType(model, p.type, false)}`).join('')}) -> ${pyType(model, m.returns, true)}: ...`).join('\n\n')}`).join('');
  const names = [...model.enums, ...model.resultRecords, ...model.callbacks.map((c) => c.unit)].map((u) => pyString(langName('python', u.name, 'class')));
  return `${pyHeader()}
\"\"\"The enums and records of ${model.contract.library} (T-6, T-4).\"\"\"

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
${model.callbacks.length > 0 ? 'from typing import Protocol\n' : ''}${foreignImports(model).map((line) => `${line}\n`).join('')}
__all__ = [${names.join(', ')}]${enums}${records}${callbacks}
`;
}

function modulePy(model: Model, module: string): string {
  const fns = [
    ...model.functions.filter((f) => f.module === module).map((f) => langName('python', f.member.name, 'callable')),
    ...model.objects.filter((o) => o.unit.module === module).map((o) => langName('python', o.unit.name, 'class')),
  ];
  const enums = [...model.enums, ...model.resultRecords, ...model.callbacks.map((c) => c.unit)].filter((u) => u.module === module).map((u) => langName('python', u.name, 'class'));
  const constants = model.constants.filter((c) => c.module === module);
  const names = [...fns, ...enums, ...constants.map((c) => langName('python', c.member.name, 'constant'))];
  const imports = [
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
  const enumImports = [...model.enums, ...model.resultRecords, ...model.callbacks.map((c) => c.unit)].map((u) => langName('python', u.name, 'class'));
  const fns = model.functions.map((fn) => {
    const positional = fn.args.filter((a) => !a.field).map((a) => `${langName('python', a.name, 'variable')}: ${pyType(model, a.type, true)}`);
    const keyword = fn.args.filter((a) => a.field).map((a) => `${langName('python', a.name, 'variable')}: ${pyType(model, a.type, true)}`);
    const params = keyword.length === 0 ? positional : [...positional, '*', ...keyword];
    return `def ${langName('python', fn.member.name, 'callable')}(${params.join(', ')}) -> ${pyType(model, fn.returns, false)}: ...`;
  });
  const params = (fn: Fn): string[] => {
    const positional = fn.args.filter((a) => !a.field).map((a) => `${langName('python', a.name, 'variable')}: ${pyType(model, a.type, true)}`);
    const keyword = fn.args.filter((a) => a.field).map((a) => `${langName('python', a.name, 'variable')}: ${pyType(model, a.type, true)}`);
    return keyword.length === 0 ? positional : [...positional, '*', ...keyword];
  };
  const classes = model.objects.map((o) => {
    const lines = o.members.map((fn) => {
      const name = langName('python', fn.member.name, 'callable');
      if (fn.kind === 'constructor') return `    def __init__(${['self', ...params(fn)].join(', ')}) -> None: ...`;
      if (fn.kind === 'static') return `    @staticmethod\n    def ${name}(${params(fn).join(', ')}) -> ${pyType(model, fn.returns, false)}: ...`;
      if (fn.kind === 'property') return `    @property\n    def ${name}(self) -> ${pyType(model, fn.returns, false)}: ...`;
      return `    def ${name}(${['self', ...params(fn)].join(', ')}) -> ${pyType(model, fn.returns, false)}: ...`;
    });
    return `\n@final\nclass ${langName('python', o.unit.name, 'class')}:\n${lines.join('\n')}\n`;
  });
  return `${pyHeader()}
from collections.abc import Sequence
from typing import final
${enumImports.length > 0 ? `from ._types import ${enumImports.join(', ')}\n` : ''}${foreignImports(model).map((line) => `${line}\n`).join('')}
${fns.join('\n')}
${classes.join('')}`;
}

function initPy(model: Model): string {
  const modules = [...new Set([...model.functions.map((f) => f.module), ...model.objects.map((o) => o.unit.module), ...model.enums.map((u) => u.module), ...model.resultRecords.map((u) => u.module), ...model.callbacks.map((c) => c.unit.module), ...model.constants.map((c) => c.module)])].sort();
  const imports = modules.map((m) => (m === '' ? 'from ._root import *  # noqa: F403' : `from .${m.replaceAll('/', '.')} import *  # noqa: F403`));
  const names = [
    ...model.classes.map((c) => c.name),
    ...model.functions.map((f) => langName('python', f.member.name, 'callable')),
    ...model.objects.map((o) => langName('python', o.unit.name, 'class')),
    ...model.enums.map((u) => langName('python', u.name, 'class')),
    ...model.resultRecords.map((u) => langName('python', u.name, 'class')),
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
  const modules = [...new Set([...model.functions.map((f) => f.module), ...model.objects.map((o) => o.unit.module), ...model.enums.map((u) => u.module), ...model.resultRecords.map((u) => u.module), ...model.callbacks.map((c) => c.unit.module), ...model.constants.map((c) => c.module)])];
  for (const module of modules) {
    files.set(module === '' ? `${pkg}/_root.py` : `${pkg}/${module}.py`, modulePy(model, module));
  }
  files.set(`${pkg}/__init__.py`, initPy(model));
  files.set(`${ROOT}/tests/test_generated.py`, pythonTests(model, layout.module));
  void moduleOf;
}
