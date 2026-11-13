// U-7: the Python conversions of a value alias. A Python value enters as a HostValue that the binding gives one level at
// a time (B-1) and the core's `in` function judges; a core value leaves as the OutValue that the core's `out` function
// gives, which the binding makes into Python values by the alias's `out` rows, the same handle as the same object
// (U-7 (d)). What a Python type is as a HostValue is binding's rule, the same for every alias; which kinds an alias
// takes is its core's.

import { type Model, type ValueAlias, langName, rustField, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported } from './model.ts';
import { container, outArms } from './alias_shared.ts';
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
      return `match native.downcast::<PyNative>() {
            Some(object) => Ok(object.0.clone_ref(py).into_bound(py)),
            None => Err(binding_error(py, BindingError::Internal { detail: String::from("GN-6o: a native value that no Python object entered as") })),
        }`;
    default:
      throw new Unsupported(`${alias.unit.id}: the Python form ${form} of the kind ${kind} is not generated yet`);
  }
}

export function aliasPython(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  const arms = outArms(model, alias, 'python', (form, kind) => builtin(alias, form, kind), 'Err(binding_error(py, BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', 'py, ');
  return `
/// U-7: a Python value of ${langName('python', alias.unit.name, 'class')} enters as HostValue, which the core judges.
fn in_${name}(py: Python<'_>, value: &Bound<'_, PyAny>, _subject: &str) -> PyResult<${core}> {
    let mut host = PyHost { py, held: Vec::new(), marked: 0 };
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
export const PYTHON_HOST = (`
/// B-1: the Python values whose children the core may ask for, under the handles that describe gave.
enum Held<'py> {
    Items(Vec<Bound<'py, PyAny>>),
    Entries(Vec<(Bound<'py, PyAny>, Bound<'py, PyAny>)>),
}

struct PyHost<'py> {
    py: Python<'py>,
    held: Vec<Held<'py>>,
    marked: u64,
}

impl<'py> PyHost<'py> {
    fn hold(&mut self, held: Held<'py>) -> Handle {
        self.held.push(held);
        Handle::new(handle_count(self.held.len() - 1))
    }

    /// GN-6o: the handle of a value outside the closed set, its number in the order of the call.
    fn mark(&mut self) -> Handle {
        self.marked = self.marked.saturating_add(1);
        Handle::new(self.marked)
    }

    /// B-1: a value of an exact built-in type is that kind (a bool is never an integer, a subclass is another value);
    /// any other object is its handle with its type name, which the core judges.
    fn describe(&mut self, value: &Bound<'py, PyAny>) -> PyResult<HostValue> {
        if value.is_none() {
            return Ok(HostValue::Null);
        }
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
            return Ok(HostValue::Other { type_name, handle: self.mark() });
        }
        if value.is_callable() {
            return Ok(HostValue::Callable(Native::new(PyNative(value.clone().unbind()))));
        }
        Ok(HostValue::Object { native: Native::new(PyNative(value.clone().unbind())), type_name, json_serializable: false })
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

    fn read(&mut self, _value: Handle) -> Result<HostValue, binding_core::Raised> {
        let py = self.py;
        Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no value class is read") })))
    }
}

/// GN-6o: a Python object that a core may keep, released when the last Native that holds it is dropped.
#[derive(Debug)]
struct PyNative(Py<PyAny>);

impl NativeObject for PyNative {}

#[cfg(pyo3_disable_reference_pool)]
compile_error!("GN-6o: a Native of Python is dropped on any thread, which PyO3 defers to its next acquisition of the GIL through the reference pool that pyo3_disable_reference_pool removes");

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
