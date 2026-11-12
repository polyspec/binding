// U-7: the Python conversions of a value alias. A Python value enters as a HostValue that the binding gives one level at
// a time (B-1) and the core's `in` function judges; a core value leaves as the OutValue that the core's `out` function
// gives, which the binding makes into Python values by the alias's `out` rows, the same handle as the same object
// (U-7 (d)). What a Python type is as a HostValue is binding's rule, the same for every alias; which kinds an alias
// takes is its core's.

import type { OutRow } from '../contract.ts';
import { type Model, type ValueAlias, langName, rustField } from './model.ts';
import { rustString } from './text.ts';

// The predicate methods of OutValue for a `when` of a row (binding_core::Predicate).
const PREDICATE: Record<string, string> = {
  utf8: 'Utf8', sequence_keys: 'SequenceKeys', safe_integer: 'SafeInteger', integral_float: 'IntegralFloat',
};

// The OutValue variant of each kind and how its content is bound in a match arm.
const VARIANT: Record<string, string> = {
  null: 'OutValue::Null', bool: 'OutValue::Bool(value)', int: 'OutValue::Int(value)', int64: 'OutValue::Int64(value)',
  float: 'OutValue::Float(value)', number: 'OutValue::Number(value)', text: 'OutValue::Text(value)', bytes: 'OutValue::Bytes(value)',
  list: 'OutValue::List { handle, len }', map: 'OutValue::Map(value)', object: 'OutValue::Object { handle, len }',
  reference: 'OutValue::Reference { handle, value }', safe_text: 'OutValue::SafeText(value)', native: 'OutValue::Native(handle)',
};

// The Python value of a built-in form, made from the content of the matched OutValue.
function builtin(form: string, kind: string): string {
  switch (form) {
    case 'null':
      return 'Ok(py.None().into_bound(py))';
    case 'bool':
      return 'Ok(PyBool::new(py, value).to_owned().into_any())';
    case 'int':
    case 'bigint':
      if (kind === 'number') return "py.get_type::<PyInt>().call1((value,))";
      if (kind === 'int64') return 'Ok(value.into_pyobject(py)?.into_any())';
      return 'Ok(value.value().into_pyobject(py)?.into_any())';
    case 'float':
      if (kind === 'number') return "py.get_type::<PyFloat>().call1((value,))";
      return kind === 'float' ? 'Ok(PyFloat::new(py, value.value()).into_any())' : 'Ok(PyFloat::new(py, value).into_any())';
    case 'text':
      return 'Ok(PyString::new(py, &value).into_any())';
    case 'bytes':
      return 'Ok(PyBytes::new(py, value.value()).into_any())';
    case 'list':
      return `{
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let list = PyList::empty(py);
            made.insert(handle.raw(), list.clone().into_any());
            for index in 0..len {
                let item = source.item(handle, index);
                list.append(make(py, item, source, made)?)?;
            }
            Ok(list.into_any())
        }`;
    case 'map':
    case 'keyed_map':
      return `{
            let handle = value.handle();
            let len = value.len();
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let map = PyDict::new(py);
            made.insert(handle.raw(), map.clone().into_any());
            for index in 0..len {
                let (key, item) = source.entry(handle, index);
                let key = make(py, key, source, made)?;
                map.set_item(key, make(py, item, source, made)?)?;
            }
            Ok(map.into_any())
        }`;
    case 'native':
      return `match native_object(handle) {
            Some(object) => Ok(object.into_bound(py)),
            None => Err(binding_error(py, BindingError::Internal { detail: String::from("U-7: the native object is gone") })),
        }`;
    default:
      throw new Error(`no Python form ${form} for the kind ${kind}`);
  }
}

export function aliasPython(model: Model, alias: ValueAlias): string {
  const name = rustField(alias.unit.name);
  const core = alias.unit.core_type ?? '';
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  const rows = (alias.unit.out ?? []).filter((row) => row.make['python'] !== undefined);
  const kinds = [...new Set(rows.map((row) => row.kind))];
  const arms = kinds.map((kind) => {
    const variant = VARIANT[kind];
    if (variant === undefined) throw new Error(`no OutValue variant of the kind ${kind}`);
    const ofKind = rows.filter((row) => row.kind === kind);
    const form = (row: OutRow): string => {
      const make = row.make['python'];
      if (typeof make !== 'string') throw new Error(`${alias.unit.id}: a Python make of the form ${JSON.stringify(make)} is not generated yet`);
      if (make.includes('.')) throw new Error(`${alias.unit.id}: a Python make by a member (${make}) is not generated yet`);
      return builtin(make, kind);
    };
    const sameForm = new Set(ofKind.map((row) => JSON.stringify(row.make['python']))).size === 1;
    const body = sameForm || ofKind.every((row) => row.when === undefined)
      ? form(ofKind[0] as OutRow)
      : ofKind.map((row, index) => {
        const when = row.when;
        const test = when === undefined || when === 'else'
          ? 'true'
          : `out.predicate(Predicate::${PREDICATE[when.predicate] ?? ''}) == Some(${String(when.is)})`;
        return `${index === 0 ? '' : 'else '}if ${test} { ${form(row)} }`;
      }).join(' ') + ' else { Err(binding_error(py, BindingError::Internal { detail: String::from("U-7: no out row takes the value") })) }';
    return `        ${variant} => ${body},`;
  });
  return `
/// U-7: a Python value of ${langName('python', alias.unit.name, 'class')} enters as HostValue, which the core judges.
fn in_${name}(py: Python<'_>, value: &Bound<'_, PyAny>, _subject: &str) -> PyResult<${core}> {
    let mut host = PyHost { py, held: Vec::new() };
    let described = host.describe(value)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| failure_error(py, failure))
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
}

impl<'py> PyHost<'py> {
    fn hold(&mut self, held: Held<'py>) -> Handle {
        self.held.push(held);
        Handle::new(handle_count(self.held.len() - 1))
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
            let points = bytes.chunks_exact(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
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

    fn read(&mut self, _value: Handle) -> Result<HostValue, binding_core::Raised> {
        let py = self.py;
        Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no value class is read") })))
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
