// U-7: the Python conversions of a value alias. A Python value enters as a HostValue that the binding gives one level at
// a time (B-1) and the core's `in` function judges; a core value leaves as the OutValue that the core's `out` function
// gives, which the binding makes into Python values by the alias's `out` rows, the same handle as the same object
// (U-7 (d)). What a Python type is as a HostValue is binding's rule, the same for every alias; which kinds an alias
// takes is its core's.

import { type KeptClass, type KeptField, type Model, type ValueAlias, langName, rustField, rustIdent, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported } from './model.ts';
import { container, outArms, readValue, valueReads } from './alias_shared.ts';
import type { Unit } from '../contract.ts';
import { rustString } from './text.ts';

// The Python value of a built-in form, made from the content of the matched OutValue.
function builtin(alias: ValueAlias, form: string, kind: string): string {
  switch (form) {
    case 'null':
      return 'Ok(py.None().into_bound(py))';
    case 'bool':
      return 'Ok(PyBool::new(py, value).to_owned().into_any())';
    case 'int':
    case 'bigint':
      if (kind === 'number') return 'py.get_type::<PyInt>().call1((value,))';
      if (kind === 'int64') return 'Ok(value.into_pyobject(py)?.into_any())';
      return 'Ok(value.value().into_pyobject(py)?.into_any())';
    case 'float':
      if (kind === 'number') return 'py.get_type::<PyFloat>().call1((value,))';
      if (kind === 'float') return 'Ok(PyFloat::new(py, value.value()).into_any())';
      // An integer as the nearest double, by its decimal text: R-1 refuses an as conversion.
      return `match ${kind === 'int64' ? 'value' : 'value.value()'}.to_string().parse::<f64>() {
            Ok(float) => Ok(PyFloat::new(py, float).into_any()),
            Err(_never) => Err(binding_error(py, BindingError::Internal { detail: String::from("U-7: an integer that is no number") })),
        }`;
    case 'text':
      if (kind === 'bytes') {
        return `match std::str::from_utf8(value.value()) {
            Ok(text) => Ok(PyString::new(py, text).into_any()),
            Err(_bytes) => Err(binding_error(py, BindingError::Internal { detail: String::from("U-7: text of bytes that are not UTF-8") })),
        }`;
      }
      return 'Ok(PyString::new(py, &value).into_any())';
    case 'bytes':
      return kind === 'text' ? 'Ok(PyBytes::new(py, value.as_bytes()).into_any())' : 'Ok(PyBytes::new(py, value.value()).into_any())';
    case 'list': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head}
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let list = PyList::empty(py);
            made.insert(handle.raw(), list.clone().into_any());
            for index in 0..len {
                let item = ${parts.item};
                list.append(make(py, item, source, made)?)?;
            }
            Ok(list.into_any())
        }`;
    }
    case 'map':
    case 'keyed_map': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head}
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let map = PyDict::new(py);
            made.insert(handle.raw(), map.clone().into_any());
            for index in 0..len {
                let (key, item) = ${parts.entry};
                let key = make(py, key, source, made)?;
                map.set_item(key, make(py, item, source, made)?)?;
            }
            Ok(map.into_any())
        }`;
    }
    case 'native':
      return `match native_object(handle) {
            Some(object) => Ok(object.into_bound(py)),
            None => Err(binding_error(py, BindingError::Internal { detail: String::from("U-7: the native object is gone") })),
        }`;
    default:
      throw new Unsupported(`${alias.unit.id}: the Python form ${form} of the kind ${kind} is not generated yet`);
  }
}

export function aliasPython(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  const arms = outArms(model, alias, 'python', (form, kind) => builtin(alias, form, kind), 'Err(binding_error(py, BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', 'py, ', keptMake);
  return `
/// U-7: a Python value of ${langName('python', alias.unit.name, 'class')} enters as HostValue, which the core judges.
fn in_${name}(py: Python<'_>, value: &Bound<'_, PyAny>, _subject: &str) -> PyResult<${core}> {
    let mut host = PyHost::new(py);
    let described = host.describe(value)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(py, failure))
}

/// U-7: a core value of ${langName('python', alias.unit.name, 'class')} leaves as the Python values of its out rows.
fn out_${name}<'py>(py: Python<'py>, value: impl Borrow<${core}>) -> PyResult<Bound<'py, PyAny>> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    let mut made = BTreeMap::new();
    make_${name}(py, root, &mut source, &mut made)
}

fn make_${name}<'py>(
    py: Python<'py>,
    out: OutValue,
    source: &mut dyn OutValues,
    made: &mut BTreeMap<u64, Bound<'py, PyAny>>,
) -> PyResult<Bound<'py, PyAny>> {
    let make = make_${name};
    match out.clone() {
${arms.join('\n')}
        other => Err(binding_error(py, BindingError::Internal { detail: format!("U-7: no out row of the kind {}", other.kind().as_str()) })),
    }
}
`;
}

// B-1: what a Python value is as a HostValue, one level at a time; the children of a container are asked for through
// HostValues by the handles that describe gave.
// usedHelpers splits helpers at blank lines, so a block keeps none inside it.
const PYTHON_HOST = (`
/// B-1: the Python values whose children the core may ask for, under the handles that describe gave.
#[derive(Clone)]
enum Held<'py> {
    Items(Vec<Bound<'py, PyAny>>),
    Entries(Vec<(Bound<'py, PyAny>, Bound<'py, PyAny>)>),/*HELD*/
}

struct PyHost<'py> {
    py: Python<'py>,
    held: Vec<Held<'py>>,/*SEEN*/
}

impl<'py> PyHost<'py> {
    fn new(py: Python<'py>) -> Self {
        Self { py, held: Vec::new()/*NEW*/ }
    }

    fn hold(&mut self, held: Held<'py>) -> Handle {
        self.held.push(held);
        Handle::new(handle_count(self.held.len() - 1))
    }

    /// B-1: a value of an exact built-in type is that kind (a bool is never an integer, a subclass is another value);
    /// any other object is its handle with its type name, which the core judges.
    fn describe(&mut self, value: &Bound<'py, PyAny>) -> PyResult<HostValue> {
        if value.is_none() {
            return Ok(HostValue::Null);
        }/*DESCRIBE*/
        if value.is_exact_instance_of::<PyBool>() {
            return Ok(HostValue::Bool(value.extract::<bool>()?));
        }
        if value.is_exact_instance_of::<PyInt>() {
            return Ok(match value.extract::<i64>() {
                Ok(int) => HostValue::Int(int),
                Err(_large) => HostValue::Number(value.str()?.to_string()),
            });
        }
        if value.is_exact_instance_of::<PyFloat>() {
            return Ok(HostValue::Float(value.extract::<f64>()?));
        }
        if value.is_exact_instance_of::<PyString>() {
            // B-3: the code points, unpaired surrogates included.
            let encoded = value.call_method1("encode", ("utf-32-le", "surrogatepass"))?;
            let bytes: Vec<u8> = encoded.extract()?;
            let points = bytes.as_chunks::<4>().0.iter().map(|c| u32::from_le_bytes(*c)).collect();
            return Ok(HostValue::Text(HostText::CodePoints(points)));
        }
        if value.is_exact_instance_of::<PyBytes>() {
            return Ok(HostValue::Bytes(value.extract::<Vec<u8>>()?));
        }
        if value.is_exact_instance_of::<PyList>() {
            let items: Vec<Bound<'py, PyAny>> = value.try_iter()?.collect::<PyResult<_>>()?;
            let len = handle_count(items.len());
            return Ok(HostValue::List { handle: self.hold(Held::Items(items)), len });
        }
        if value.is_exact_instance_of::<PyDict>() {
            let dict = value.cast::<PyDict>().map_err(PyErr::from)?;
            let entries: Vec<_> = dict.iter().collect();
            let len = handle_count(entries.len());
            return Ok(HostValue::Map { handle: self.hold(Held::Entries(entries)), len });
        }
        let type_name = value.get_type().name()?.to_string();
        // B-1: a subclass of int, float, str or bytes is outside the closed set.
        if value.is_instance_of::<PyInt>() || value.is_instance_of::<PyFloat>() || value.is_instance_of::<PyString>() || value.is_instance_of::<PyBytes>() {
            return Ok(HostValue::Other { type_name, handle: native_handle(value) });
        }
        if value.is_callable() {
            return Ok(HostValue::Callable(native_handle(value)));
        }
        Ok(HostValue::Object { handle: native_handle(value), type_name, json_serializable: false })
    }
}

impl HostValues for PyHost<'_> {
    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, binding_core::Raised> {
        let py = self.py;
        let item = match self.held.get(handle_position(list.raw())) {
            Some(Held::Items(items)) => items.get(handle_position(index)).cloned(),
            _ => None,
        };
        let Some(item) = item else {
            return Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no such item") })));
        };
        self.describe(&item).map_err(|error| raised(py, error))
    }

    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), binding_core::Raised> {
        let py = self.py;
        let entry = match self.held.get(handle_position(map.raw())) {
            Some(Held::Entries(entries)) => entries.get(handle_position(index)).cloned(),
            _ => None,
        };
        let Some((key, value)) = entry else {
            return Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no such entry") })));
        };
        let key = self.describe(&key).map_err(|error| raised(py, error))?;
        let value = self.describe(&value).map_err(|error| raised(py, error))?;
        Ok((key, value))
    }

    fn read(&mut self, /*READ*/) -> Result<HostValue, binding_core::Raised> {
        let py = self.py;
        /*READS*/
    }
}

/// U-7 (VAL-18): the language objects that entered as handles, which a native value gives back as the same object.
static NATIVE: Mutex<Vec<Py<PyAny>>> = Mutex::new(Vec::new());

fn native_handle(value: &Bound<'_, PyAny>) -> Handle {
    let mut native = match NATIVE.lock() {
        Ok(native) => native,
        Err(poisoned) => poisoned.into_inner(),
    };
    native.push(value.clone().unbind());
    Handle::new(handle_count(native.len() - 1))
}

fn native_object(handle: Handle) -> Option<Py<PyAny>> {
    let native = match NATIVE.lock() {
        Ok(native) => native,
        Err(poisoned) => poisoned.into_inner(),
    };
    Python::attach(|py| native.get(handle_position(handle.raw())).map(|object| object.clone_ref(py)))
}

/// A count or an index of Rust as the u64 of a handle or a length (a usize fits a u64 on the targets of T-2).
#[allow(clippy::manual_unwrap_or, reason = "R-1: the failure is matched; unwrap_or is disallowed")]
fn handle_count(value: usize) -> u64 {
    match u64::try_from(value) {
        Ok(value) => value,
        Err(_wide) => u64::MAX,
    }
}

/// A u64 of a handle or an index as a position of Rust; one beyond usize finds nothing.
#[allow(clippy::manual_unwrap_or, reason = "R-1: the failure is matched; unwrap_or is disallowed")]
fn handle_position(value: u64) -> usize {
    match usize::try_from(value) {
        Ok(value) => value,
        Err(_wide) => usize::MAX,
    }
}

/// U-3: an exception of Python code while the core walks a value, as the Raised that the caller throws again.
fn raised(py: Python<'_>, error: PyErr) -> binding_core::Raised {
    let handle = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    thrown_map().insert(handle, error.into_value(py).into_any());
    binding_core::Raised::from_generated(binding_core::Handle::new(handle))
}
`).replace(/\n\n(?=[ }])/g, '\n');

// U-7 (a'): the failure of the `in` of a value alias of another repository. Its kind, status and errno are the owner's;
// its class is this repository's class of the category that the owner's E-1 gives the variant, by a match without a
// wildcard (I-2 (3)). An exception that language code raised while the owner's core walked the value is thrown again.
export function foreignFailurePython(model: Model): string {
  return foreignAliasLibraries(model).map((alias) => {
    const library = (alias.library ?? '').replaceAll('-', '_');
    const error = alias.error ?? { path: '', kinds: [] };
    const arms = error.kinds.map((k) => `        ${k.variant} { .. } => ${rustString(model.classes.find((c) => c.category === k.category)?.name ?? '')},`).join('\n');
    return `
/// U-7 (a'): a kind of ${alias.library ?? ''} in the class of its category here.
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn ${library}_error(py: Python<'_>, error: ${error.path}) -> PyErr {
    let class = match error {
${arms}
    };
    library_error(py, class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))
}

fn ${library}_failure_error(py: Python<'_>, failure: binding_core::Failure<${error.path}>) -> PyErr {
    match failure {
        binding_core::Failure::Kind(error) => ${library}_error(py, error),
        binding_core::Failure::Raised(raised) => failure_error(py, binding_core::Failure::Raised(raised)),
        binding_core::Failure::Callback(error) => failure_error(py, binding_core::Failure::Callback(error)),
    }
}
`;
  }).join('');
}

// B-1, GN-6m: the PyHost of a model. An instance of a class that an in row of a value alias names is HostValue::Value
// with the kind of the row, held for read: an instance of a class without core_type under one handle within the walk,
// found by its address while the walk holds it; read gives the property that the row names.
export function pythonHost(model: Model): string {
  const reads = valueReads(model, 'python');
  if (reads.length === 0) return PYTHON_HOST.replace('/*HELD*/', '').replace('/*SEEN*/', '').replace('/*NEW*/', '').replace('/*DESCRIBE*/', '').replace('/*READ*/', '_value: Handle').replace('/*READS*/', 'Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no value class is read") })))');
  const struct = (unit: Unit): string => `Py${langName('python', unit.name, 'class')}`;
  const describe = reads.map((r, index) => {
    const unit = (r.kept?.unit.unit ?? r.object?.unit.unit) as Unit;
    if (r.object !== undefined) {
      return `
        if value.cast::<${struct(unit)}>().is_ok() {
            let handle = self.hold(Held::Value(value.clone(), ${index}));
            return Ok(HostValue::Value { kind: ${r.variant}, handle });
        }`;
    }
    return `
        if value.cast::<${struct(unit)}>().is_ok() {
            let address = value.as_ptr().addr();
            let handle = match self.seen.get(&address) {
                Some(handle) => *handle,
                None => {
                    let handle = self.hold(Held::Value(value.clone(), ${index}));
                    self.seen.insert(address, handle);
                    handle
                }
            };
            return Ok(HostValue::Value { kind: ${r.variant}, handle });
        }`;
  }).join('');
  const read = reads.map((r, index) => {
    if (r.kept !== undefined) {
      return `
            ${index} => match object.cast::<${struct(r.kept.unit.unit)}>() {
                Ok(instance) => {
                    let kept = instance.borrow().${rustField(r.kept.field.name)}.clone_ref(py).into_bound(py);
                    self.describe(&kept).map_err(|error| raised(py, error))
                }
                Err(_other) => Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no such value") }))),
            },`;
    }
    const object = r.object;
    if (object === undefined) return '';
    const label = rustString(langName('python', object.unit.unit.name, 'class'));
    return `
            ${index} => match object.cast::<${struct(object.unit.unit)}>() {
                Ok(instance) => {
                    ${object.unit.lock === undefined ? `let value = ${object.property.corePath}(&instance.get().inner);` : `let held = instance.get().inner.read(${label}, &[]).map_err(|error| raised(py, binding_error(py, error)))?;
                    let value = ${object.property.corePath}(&held);`}
                    Ok(${readValue(object.property.returns as string)})
                }
                Err(_other) => Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no such value") }))),
            },`;
  }).join('');
  return PYTHON_HOST
    .replace('/*HELD*/', "\n    Value(Bound<'py, PyAny>, usize),")
    .replace('/*SEEN*/', reads.some((r) => r.kept !== undefined) ? '\n    seen: BTreeMap<usize, Handle>,' : '')
    .replace('/*NEW*/', reads.some((r) => r.kept !== undefined) ? ', seen: BTreeMap::new()' : '')
    .replace('/*DESCRIBE*/', describe)
    .replace('/*READ*/', 'value: Handle')
    .replace('/*READS*/', `let Some(Held::Value(object, read)) = self.held.get(handle_position(value.raw())).cloned() else {
            return Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no such value") })));
        };
        match read {${read}
            _ => Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no such value") }))),
        }`);
}

// GN-6m: an instance of a value class without core_type made from the content of an out row, before the content, as
// the object of its handle.
const keptMake = (kept: KeptClass, field: KeptField, holds: 'entries' | 'value', head: string): string => {
  const struct = `Py${langName('python', kept.unit.name, 'class')}`;
  const name = rustField(field.name);
  if (holds === 'value') {
    return `{
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let instance = Bound::new(py, ${struct} { ${name}: py.None() })?;
            made.insert(handle.raw(), instance.clone().into_any());
            let content = make(py, *value, source, made)?;
            instance.borrow_mut().${name} = content.unbind();
            Ok(instance.into_any())
        }`;
  }
  return `{
            ${head === '' ? '' : `${head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let map = PyDict::new(py);
            let instance = Bound::new(py, ${struct} { ${name}: map.clone().into_any().unbind() })?;
            made.insert(handle.raw(), instance.clone().into_any());
            for index in 0..len {
                let (key, item) = source.entry(handle, index);
                let key = make(py, key, source, made)?;
                map.set_item(key, make(py, item, source, made)?)?;
            }
            Ok(instance.into_any())
        }`;
};

// GN-6m: a value class without core_type, which keeps the Python values that its constructor judges through the core.
export function keptPython(module: string, kept: KeptClass): string {
  const pyClass = langName('python', kept.unit.name, 'class');
  const struct = `Py${pyClass}`;
  const fn = kept.constructor;
  const fields = kept.fields.map((f) => {
    const name = langName('python', f.name, 'variable');
    const access = f.property === undefined ? '' : `#[pyo3(${f.writable ? 'get, set' : 'get'}, name = ${rustString(name)})]\n    `;
    return `    ${access}${rustField(f.name)}: Py<PyAny>,`;
  }).join('\n');
  const variable = (f: KeptField): string => rustIdent(langName('python', f.name, 'variable'));
  const signature = kept.fields.map((f) => `${variable(f)}${f.default === undefined ? '' : ' = Given::Omitted'}`).join(', ');
  const params = kept.fields.map((f) => `, ${variable(f)}: ${f.default === undefined ? "&Bound<'py, PyAny>" : "Given<'py>"}`).join('');
  const describe = (f: KeptField, value: string): string => {
    const subject = rustString(langName('python', f.name, 'variable'));
    const type = f.type;
    if (typeof type === 'object' && 'keyed_map' in type) {
      const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
      return `{
                let given = in_keyed_map(py, ${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`a dict whose keys are ${type.key.map((k) => ({ int: 'int', bytes: 'bytes', text: 'str' })[k] ?? k).join(' or ')}`)}, |_py, item| Ok(item.clone()))?;
                let mut described = binding_core::KeyedMap::new();
                for (key, item) in given {
                    described.insert(key, host.describe(&item)?);
                }
                described
            }`;
    }
    if (typeof type === 'object' && 'list' in type) {
      return `{
                let given = in_list(py, ${value}, ${subject}, |_py, item| Ok(item.clone()))?;
                let mut described = Vec::new();
                for item in given {
                    described.push(host.describe(&item)?);
                }
                described
            }`;
    }
    return `host.describe(${value})?`;
  };
  const lines: string[] = [];
  for (const f of kept.fields) {
    const v = variable(f);
    lines.push(f.default === undefined
      ? `            let ${v}_described = ${describe(f, v)};`
      : `            let ${v}_described = match &${v} {
                Given::Omitted => None,
                Given::Value(value) => Some(${describe(f, 'value')}),
            };`);
  }
  const kept_ = kept.fields.map((f) => {
    const v = variable(f);
    if (f.default === undefined) return `${rustField(f.name)}: ${v}.clone().unbind()`;
    const empty = { null: 'py.None()', map: 'PyDict::new(py).into_any().unbind()', list: 'PyList::empty(py).into_any().unbind()' }[f.default];
    return `${rustField(f.name)}: match ${v} {
                    Given::Omitted => ${empty},
                    Given::Value(value) => value.unbind(),
                }`;
  });
  const args = kept.fields.map((f) => `${variable(f)}_described`).join(', ');
  return `
/// GN-6m: ${pyClass}, which keeps the Python values that its constructor judges.
#[pyclass(name = ${rustString(pyClass)}, module = ${rustString(module)})]
pub struct ${struct} {
${fields}
}

#[pymethods]
impl ${struct} {
    #[new]
    #[pyo3(signature = (${signature}))]
    fn new<'py>(py: Python<'py>${params}) -> PyResult<Self> {
        guard(py, || {
            let mut host = PyHost::new(py);
${lines.join('\n')}
            if let Err(failure) = ${fn.corePath}(&mut host, ${args}) {
                return Err(failure_error(py, failure));
            }
            Ok(Self {
                ${kept_.join(',\n                ')},
            })
        })
    }
}
`;
}
