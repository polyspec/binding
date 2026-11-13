// U-7: the Python conversions of a value alias. A Python value enters as a HostValue that the binding gives one level at
// a time (B-1) and the core's `in` function judges; a core value leaves as the OutValue that the core's `out` function
// gives, which the binding makes into Python values by the alias's `out` rows, the same handle as the same object
// (U-7 (d)). What a Python type is as a HostValue is binding's rule, the same for every alias; which kinds an alias
// takes is its core's.

import { type KeptClass, type KeptField, type Model, type ValueAlias, langName, rustField, rustIdent, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported, errorMatched } from './model.ts';
import { container, outArms, readAsVariants, readValue, valueReads } from './alias_shared.ts';
import { classIn, classMakes, type ReadCase } from './value_class.ts';
import { variantPattern } from '../contract.ts';
import { rustString } from './text.ts';
import type { Member, Unit } from '../contract.ts';

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
            Some(object) => Ok(object._held.clone_ref(py).into_bound(py)),
            None => Err(binding_error(py, BindingError::Internal { detail: String::from("GN-6u: a native value that no Python object entered as") })),
        }`;
    default:
      throw new Unsupported(`${alias.unit.id}: the Python form ${form} of the kind ${kind} is not generated yet`);
  }
}

// GN-6x: the module of the owner's package that holds a class of the owner, and the class's name there.
function ownerClass(alias: ValueAlias, unit: Unit): string {
  const python = alias.owner?.packages['python'] as { module: string } | undefined;
  const module = `${python?.module ?? ''}${unit.module === '' ? '' : `.${unit.module.replaceAll('/', '.')}`}`;
  return `foreign_types(py, ${rustString(module)})?.getattr(${rustString(langName('python', unit.name, 'class'))})?`;
}

// GN-6x: the Python call of a member of the owner on an object: an attribute for a property, a call for a method.
const access = (member: Member): { name: string; call: boolean } => ({ name: langName('python', member.name, 'callable'), call: member.kind !== 'property' });

// GN-6x: the OutValue variant of the content that a member of a value class is called on.
const CONTENT: Record<string, string> = { bool: 'Bool', number: 'Number', text: 'Text', text16: 'Text16' };

// GN-6x: the Python conversions of a value class of another repository: an instance enters as HostValue::Value, which
// the owner's in function reads through the read members of its in row; a core value leaves as the instance that the
// owner's members of its out rows make.
function valueClassPython(alias: ValueAlias, name: string, core: string, failure: string): string {
  const own = ownerClass(alias, alias.unit);
  const call = (member: Member, args: string): string => {
    const { name: method } = access(member);
    return member.kind === 'constructor' ? `class.call1((${args},))` : args === '' ? `class.call_method0(${rustString(method)})` : `class.call_method1(${rustString(method)}, (${args},))`;
  };
  const arms = classMakes(alias, 'python').map((make) => {
    if (make.form === 'content') {
      const variant = make.kind === 'null' ? 'OutValue::Null' : `OutValue::${CONTENT[make.kind] ?? 'Text'}(value)`;
      return `        ${variant} => ${call(make.member, make.params === 0 ? '' : 'value')},`;
    }
    if (make.form === 'list') {
      return `        OutValue::List { handle, len } => {
            let items = PyList::empty(py);
            for index in 0..len {
                let item = source.item(handle, index);
                items.append(make(py, item, source)?)?;
            }
            ${call(make.member, 'items')}
        }`;
    }
    return `        OutValue::Map(value) => {
            let handle = value.handle();
            let len = value.len();
            let map = ${ownerClass(alias, make.map)}.call0()?;
            for index in 0..len {
                let (key, item) = source.entry(handle, index);
                let key = make(py, key, source)?;
                let item = make(py, item, source)?;
                map.call_method1(${rustString(access(make.insert).name)}, (key, item))?;
            }
            ${call(make.member, 'map')}
        }`;
  });
  return `
/// GN-6x: an instance of ${langName('python', alias.unit.name, 'class')} of ${alias.library ?? ''} enters as HostValue::Value, which the core of its owner judges.
fn in_${name}(py: Python<'_>, value: &Bound<'_, PyAny>, subject: &str) -> PyResult<${core}> {
    if !value.is_instance(&${own})? {
        return Err(binding_error(py, BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(langName('python', alias.unit.name, 'class'))}) }));
    }
    let mut host = PyHost::new(py);
    let described = host.describe(value)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(py, failure))
}

/// GN-6x: a core value of ${langName('python', alias.unit.name, 'class')} leaves as the instance that the members of its owner make.
fn out_${name}<'py>(py: Python<'py>, value: impl Borrow<${core}>) -> PyResult<Bound<'py, PyAny>> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    make_${name}(py, root, &mut source)
}

fn make_${name}<'py>(py: Python<'py>, out: OutValue, source: &mut dyn OutValues) -> PyResult<Bound<'py, PyAny>> {
    let make = make_${name};
    let class = ${own};
    match out {
${arms.join('\n')}
        other => Err(binding_error(py, BindingError::Internal { detail: format!("GN-6x: no out row of the kind {}", other.kind().as_str()) })),
    }
}
`;
}

// GN-6x: the ReadAs of an in case: its code units for the kind text16 (B2.81), a text or the code units that its units
// member gives (B2.89), or the content.
function readAs(kase: ReadCase): string {
  if (kase.kind === 'Text16') return 'ReadAs::Units';
  if (kase.units === undefined) return 'ReadAs::Content';
  return `ReadAs::TextOr(${rustString(access(kase.units).name)}, ${String(access(kase.units).call)})`;
}

// GN-6x: the description of an instance of each value class of another repository by its in row, and of an instance of
// a class of its owner that a read member gives, as a map of the entries of its iteration.
function valueClassesHost(model: Model): string {
  return readAsVariants(valueClassesHostAll(model));
}

function valueClassesHostAll(model: Model): string {
  const classes = model.aliases.filter((a) => a.owner !== undefined);
  const checks = classes.flatMap((alias) => {
    const row = classIn(alias, 'python');
    const by = access(row.by);
    const arms = row.cases.map((kase) => {
      const read = kase.read === undefined ? 'None' : `Some((${rustString(access(kase.read).name)}, ${String(access(kase.read).call)}, ${readAs(kase)}))`;
      return `                ${rustString(kase.is)} => (ValueKind::${kase.kind}, ${read}),`;
    }).join('\n');
    const maps = row.maps.map((map) => `        if value.is_instance(&${ownerClass(alias, map.unit)})? {
            let mut entries = Vec::new();
            for pair in value.call_method0("items")?.try_iter()? {
                entries.push(pair?.extract::<(Bound<'py, PyAny>, Bound<'py, PyAny>)>()?);
            }
            let len = handle_count(entries.len());
            return Ok(Some(HostValue::Map { handle: self.hold(Held::Entries(entries)), len }));
        }`);
    return [`        if value.is_instance(&${ownerClass(alias, alias.unit)})? {
            let by: String = value.${by.call ? `call_method0(${rustString(by.name)})` : `getattr(${rustString(by.name)})`}?.extract()?;
            let (kind, read) = match by.as_str() {
${arms}
                other => return Err(binding_error(py, BindingError::Internal { detail: format!("GN-6x: ${langName('python', alias.unit.name, 'class')} gives the kind {other}, which its in row has no case for") })),
            };
            return Ok(Some(HostValue::Value { kind, handle: self.hold(Held::Foreign(value.clone(), read)) }));
        }`, ...maps];
  });
  return `
impl<'py> PyHost<'py> {
    /// GN-6x: an instance of a value class of another repository, described by the in row of the class, or an instance
    /// of a class of its owner that a read member gives, as a map of the entries of its iteration.
    fn value_class(&mut self, value: &Bound<'py, PyAny>) -> PyResult<Option<HostValue>> {
        let py = self.py;
${checks.join('\n')}
        Ok(None)
    }

    /// GN-6x: the content of an instance that describe held, which the read member of its in case gives.
    fn read_value(&mut self, value: Handle) -> PyResult<HostValue> {
        let py = self.py;
        let held = match self.held.get(handle_position(value.raw())) {
            Some(Held::Foreign(object, Some(read))) => Some((object.clone(), *read)),
            _ => None,
        };
        let Some((object, (name, call, read_as))) = held else {
            return Err(binding_error(py, BindingError::Internal { detail: String::from("B-1: no such value") }));
        };
        let content = if call { object.call_method0(name)? } else { object.getattr(name)? };
        match read_as {
            /*Units{*/
            // B2.81: the UTF-16 code units of a text of the kind text16, unpaired surrogates included.
            ReadAs::Units => Ok(HostValue::Text(HostText::Utf16(content.extract::<Vec<u16>>()?))),
            /*}Units*/
            /*TextOr{*/
            ReadAs::TextOr(units, units_call) => {
                // B2.89: a text as its UTF-8 bytes; none names a text with an unpaired surrogate, whose UTF-16 code
                // units the member units gives, so only such a text crosses as a list of integers.
                if content.is_none() {
                    let units = if units_call { object.call_method0(units)? } else { object.getattr(units)? };
                    return Ok(HostValue::Text(HostText::Utf16(units.extract::<Vec<u16>>()?)));
                }
                Ok(HostValue::Text(HostText::Bytes(content.cast::<PyString>()?.to_str()?.as_bytes().to_vec())))
            }
            /*}TextOr*/
            /*Content{*/
            ReadAs::Content => self.describe(&content),
            /*}Content*/
        }
    }
}

/// GN-6x: how the read member of an in case gives the content of an instance.
#[derive(Clone, Copy)]
enum ReadAs {
    /*Content{*/
    /// The content, described by the rules of the language.
    Content,
    /*}Content*/
    /*Units{*/
    /// The UTF-16 code units of a text of the kind text16 (B2.81).
    Units,
    /*}Units*/
    /*TextOr{*/
    /// A text, or none for a text whose UTF-16 code units the named member gives (B2.89).
    TextOr(&'static str, bool),
    /*}TextOr*/
}
`;
}

export function aliasPython(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  if (alias.owner !== undefined) return valueClassPython(alias, name, core, failure);
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
    held: Vec<Held<'py>>,
    marked: u64,/*SEEN*/
}

impl<'py> PyHost<'py> {
    fn new(py: Python<'py>) -> Self {
        Self { py, held: Vec::new(), marked: 0/*NEW*/ }
    }

    fn hold(&mut self, held: Held<'py>) -> Handle {
        self.held.push(held);
        Handle::new(handle_count(self.held.len() - 1))
    }

    /// GN-6u: the handle of a value outside the closed set, its number in the order of the call.
    fn mark(&mut self) -> Handle {
        self.marked = self.marked.saturating_add(1);
        Handle::new(self.marked)
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
            // B2.89: a str without a surrogate as its UTF-8 bytes, which CPython keeps with the str.
            if let Ok(text) = value.cast::<PyString>()?.to_str() {
                return Ok(HostValue::Text(HostText::Bytes(text.as_bytes().to_vec())));
            }
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
            return Ok(HostValue::Callable(Native::new(PyNative { _held: value.clone().unbind() })));
        }
        Ok(HostValue::Object { native: Native::new(PyNative { _held: value.clone().unbind() }), type_name, json_serializable: false })
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

/// GN-6u: a Python object that a core may keep, released when the last Native that holds it is dropped.
#[derive(Debug)]
struct PyNative {
    // The field is kept for its ownership: the object lives while a Native holds it, and only an out row that gives a
    // native value back reads it.
    _held: Py<PyAny>,
}

impl NativeObject for PyNative {}

#[cfg(pyo3_disable_reference_pool)]
compile_error!("GN-6u: a Native of Python is dropped on any thread, which PyO3 defers to its next acquisition of the GIL through the reference pool that pyo3_disable_reference_pool removes");

/// A count or an index of Rust as the u64 of a handle or a length (a usize fits a u64 on the targets of T-2).
fn handle_count(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

/// A u64 of a handle or an index as a position of Rust; one beyond usize finds nothing.
fn handle_position(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

/// U-3: an exception of Python code while the core walks a value, as the Raised that the caller throws again.
fn raised(py: Python<'_>, error: PyErr) -> binding_core::Raised {
    keep_thrown(error.into_value(py).into_any())
}
`).replace(/\n\n(?=[ }])/g, '\n');

// U-7 (a'): the failure of the `in` of a value alias of another repository. Its kind, status and errno are the owner's;
// its class is this repository's class of the category that the owner's E-1 gives the variant, by a match without a
// wildcard (I-2 (3)). An exception that language code raised while the owner's core walked the value is thrown again.
export function foreignFailurePython(model: Model): string {
  return foreignAliasLibraries(model).map((alias) => {
    const library = (alias.library ?? '').replaceAll('-', '_');
    const error = alias.error ?? { path: '', kinds: [] };
    const arms = error.kinds.map((k) => `        ${variantPattern(k.variant)} => ${rustString(model.classes.find((c) => c.category === k.category)?.name ?? '')},`).join('\n');
    return `
/// U-7 (a'): a kind of ${alias.library ?? ''} in the class of its category here.
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn ${library}_error(py: Python<'_>, error: ${error.path}) -> PyErr {
    let class = match ${errorMatched({ codeOf: error.code }, 'error')} {
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

// B-1, GN-6af: the PyHost of a model. An instance of a class that an in row of a value alias names is HostValue::Value
// with the kind of the row, held for read: an instance of a class without core_type under one handle within the walk,
// found by its address while the walk holds it; read gives the property that the row names. GN-6x: an instance of a
// value class of another repository is HostValue::Value too, held as Held::Foreign with the read member of its in case,
// which read calls.

export function pythonHost(model: Model): string {
  const reads = valueReads(model, 'python');
  const foreign = model.aliases.some((a) => a.owner !== undefined);
  const foreignHeld = foreign ? "\n    Foreign(Bound<'py, PyAny>, Option<(&'static str, bool, ReadAs)>)," : '';
  const foreignDescribe = foreign ? '\n        if let Some(described) = self.value_class(value)? {\n            return Ok(described);\n        }' : '';
  const foreignRead = 'self.read_value(value).map_err(|error| raised(py, error))';
  const foreignHost = foreign ? valueClassesHost(model) : '';
  if (reads.length === 0) {
    return PYTHON_HOST.replace('/*HELD*/', foreignHeld).replace('/*SEEN*/', '').replace('/*NEW*/', '').replace('/*DESCRIBE*/', foreignDescribe).replace('/*READ*/', foreign ? 'value: Handle' : '_value: Handle')
      .replace('/*READS*/', foreign ? foreignRead : 'Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no value class is read") })))') + foreignHost;
  }
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
    .replace('/*HELD*/', `\n    Value(Bound<'py, PyAny>, usize),${foreignHeld}`)
    .replace('/*SEEN*/', reads.some((r) => r.kept !== undefined) ? '\n    seen: BTreeMap<usize, Handle>,' : '')
    .replace('/*NEW*/', reads.some((r) => r.kept !== undefined) ? ', seen: BTreeMap::new()' : '')
    .replace('/*DESCRIBE*/', `${foreignDescribe}${describe}`)
    .replace('/*READ*/', 'value: Handle')
    .replace('/*READS*/', `${foreign ? `if let Some(Held::Foreign(..)) = self.held.get(handle_position(value.raw())) {
            return ${foreignRead};
        }
        ` : ''}let Some(Held::Value(object, read)) = self.held.get(handle_position(value.raw())).cloned() else {
            return Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no such value") })));
        };
        match read {${read}
            _ => Err(raised(py, binding_error(py, BindingError::Internal { detail: String::from("B-1: no such value") }))),
        }`) + foreignHost;
}

// GN-6af: an instance of a value class without core_type made from the content of an out row, before the content, as
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

// GN-6af: a value class without core_type, which keeps the Python values that its constructor judges through the core.
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
/// GN-6af: ${pyClass}, which keeps the Python values that its constructor judges.
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
