// The PHP binding (ext-php-rs 0.16): the extension crate, its stub and the generated PHPUnit tests (G-5).

import type { Type, Unit } from '../contract.ts';
import { defaultAsserts, declaredValue } from './defaults.ts';
import { type Arg, type CallbackUnit, type Fn, type ErrorProperty, type ErrorUnit, errorProperties, type Model, Unsupported, argType, byValue, type ObjectClass, coreCallArgs, aliasKindsRust, aliasesWithKinds, faultRust, armedCall, withFaults, heldNew, heldParam, heldType, langName, libraryOf, lockLines, memberName, resultLet, aliasOf, objectUnit, POISON_ENTRY, recordFn, takesHeld, takesNested, borrowedItem, rustField, rustIdent, rustType, rustVariant, traitParam, unitOf } from './model.ts';
import { PHP_HOST, aliasPhp, foreignFailurePhp } from './alias_php.ts';
import { phpTests } from './tests_php.ts';
import { raisesAssertions } from './raises.ts';
import { type Files, header, phpText, rustString, closure, optionRef, usedHelpers, WIDEN } from './text.ts';

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

function convertIn(model: Model, type: Type, value: string, subject: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'in_text', latin1: 'in_latin1', bool: 'in_bool', uint: 'in_uint', int: 'in_int', int64: 'in_int', float: 'in_float', bytes: 'in_latin1', source: 'in_latin1' };
    const name = fn[type];
    if (name === undefined) throw new Error(`no PHP input conversion for ${type}`);
    return `${name}(${value}, ${subject})`;
  }
  if ('list' in type) return `in_list(${value}, ${subject}, ${closure(['item'], convertIn(model, type.list, 'item', subject))})`;
  if ('map' in type) return `in_map(${value}, ${subject}, ${closure(['item'], convertIn(model, type.map, 'item', subject))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `in_keyed_map(${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`an array whose keys are ${type.key.map((k) => ({ int: 'ints', bytes: 'byte strings', text: 'UTF-8 strings' })[k] ?? k).join(' or ')}`)}, ${closure(['item'], convertIn(model, type.keyed_map, 'item', subject))})`;
  }
  if ('optional' in type) return `in_optional(${value}, ${closure(['value'], convertIn(model, type.optional, 'value', subject))})`;
  const unit = unitOf(model, type);
  if (unit !== undefined && (unit.kind === 'enum' || unit.origin === 'callback' || objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined)) return `in_${recordFn(unit, aliasOf(model, type)?.library)}(${value}, ${subject})`;
  if (unit?.kind === 'record') return `in_${recordFn(unit, libraryOf(type))}(${value}, ${subject})`;
  throw new Error(`no PHP input conversion for ${JSON.stringify(type)}`);
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    // T-2 never: the core's Infallible has no value, so the call has failed before.
    if (type === 'never') return `match ${value} {}`;
    if (type === 'none') return 'Ok(Zval::new())';
    const fn: Record<string, string> = { text: 'out_text', latin1: 'out_bytes', bytes: 'out_bytes', bool: 'out_bool', uint: 'out_uint', int: 'out_int', int64: 'out_int', float: 'out_float' };
    return `${fn[type]}(${value})`;
  }
  if ('list' in type) return `out_list(${value}, ${closure(['item'], convertOut(model, type.list, 'item'))})`;
  // The value of a keyed map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('keyed_map' in type) return `out_keyed_map(${value}, |item| ${convertOut(model, type.keyed_map, 'item')})`;
  if ('map' in type) return `out_map(${value}, |item| ${convertOut(model, type.map, 'item')})`;
  if ('optional' in type) return `out_optional(${optionRef(value)}, ${closure(['value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) {
    const parts = type.tuple.map((t, i) => `${convertOut(model, t, `&${value}.${i}`)}?`);
    return `out_array(vec![${parts.join(', ')}])`;
  }
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `out_${rustField(unit.name)}(${value})`;
  if (unit?.kind === 'record') return `out_${recordFn(unit, libraryOf(type))}(${value})`;
  if ((objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined) && unit !== undefined) return `out_${recordFn(unit, aliasOf(model, type)?.library)}(${value})`;
  throw new Error(`no PHP output conversion for ${JSON.stringify(type)}`);
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
#[cfg(feature = "panic-test")]
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\panicTest`)})]
pub fn panic_test() -> Result<Zval, PhpException> {
    guard(|| panic!("panic-test"))
}
`;

const HELPERS = `
fn type_error(subject: &str, expected: &str) -> Fail {
    binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: expected.to_owned() })
}

/// B-3: text is a string whose bytes are UTF-8.
fn in_text(value: &Zval, subject: &str) -> Result<String, Fail> {
    let Some(text) = value.zend_str() else { return Err(type_error(subject, "string")) };
    String::from_utf8(text.as_bytes().to_vec())
        .map_err(|_not_utf8| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::NotUtf8 }))
}

/// T-1 latin1, bytes and source: the bytes of a string; a PHP string is its bytes, which the core judges.
fn in_latin1(value: &Zval, subject: &str) -> Result<Vec<u8>, Fail> {
    match value.zend_str() {
        Some(text) => Ok(text.as_bytes().to_vec()),
        None => Err(type_error(subject, "string")),
    }
}

/// U-2: an argument that the caller left out is None, whose value the core decides. The engine gives null for a
/// parameter that a call with named arguments skips, so null is an argument that was left out (GN-10).
fn in_default<T>(value: Option<&Zval>, item: impl FnOnce(&Zval) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    match value.filter(|value| !value.is_null()) {
        Some(value) => item(value).map(Some),
        None => Ok(None),
    }
}

fn in_bool(value: &Zval, subject: &str) -> Result<bool, Fail> {
    if value.is_true() {
        return Ok(true);
    }
    if value.is_false() {
        return Ok(false);
    }
    Err(type_error(subject, "bool"))
}

/// B-2: an int (IS_LONG) in the range of the contract type; any other value is kind invalid_number.
fn in_int(value: &Zval, subject: &str) -> Result<i64, Fail> {
    match (value.is_long(), value.long()) {
        (true, Some(integer)) => Ok(integer),
        _ => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int })),
    }
}

fn in_uint(value: &Zval, subject: &str) -> Result<u64, Fail> {
    let invalid = || binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint });
    let integer = match (value.is_long(), value.long()) {
        (true, Some(integer)) => integer,
        _ => return Err(invalid()),
    };
    u64::try_from(integer).map_err(|_negative| invalid())
}

fn in_float(value: &Zval, subject: &str) -> Result<f64, Fail> {
    match (value.is_double(), value.double()) {
        (true, Some(float)) => Ok(float),
        _ => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Float })),
    }
}

/// T-2: a list is an array whose keys are 0 to n-1 in order; another array would lose its keys (P-4).
fn in_list<T>(value: &Zval, subject: &str, item: impl Fn(&Zval) -> Result<T, Fail>) -> Result<Vec<T>, Fail> {
    let Some(array) = value.array() else { return Err(type_error(subject, "list")) };
    if !array.has_sequential_keys() {
        return Err(type_error(subject, "list"));
    }
    array.values().map(item).collect()
}

/// null is the absence; any other value is converted.
fn in_optional<T>(value: &Zval, item: impl FnOnce(&Zval) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    if value.is_null() {
        return Ok(None);
    }
    item(value).map(Some)
}

fn out_text(value: impl AsRef<str>) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_zend_string(ZendStr::new(value.as_ref().as_bytes(), false));
    Ok(zval)
}

/// T-1 latin1 and bytes: a string of the bytes.
fn out_bytes(value: impl AsRef<[u8]>) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_zend_string(ZendStr::new(value.as_ref(), false));
    Ok(zval)
}

fn out_bool(value: impl Borrow<bool>) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_bool(*value.borrow());
    Ok(zval)
}

fn out_int(value: impl WideInt) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_long(value.widen_int());
    Ok(zval)
}

/// B-2: a uint leaves as an int; one above PHP_INT_MAX is kind internal.
fn out_uint(value: impl WideUint) -> Result<Zval, Fail> {
    let value = value.widen_uint();
    match i64::try_from(value) {
        Ok(value) => out_int(value),
        Err(_large) => Err(binding_error(BindingError::Internal { detail: format!("{value} is above PHP_INT_MAX") })),
    }
}

fn out_float(value: impl Borrow<f64>) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_double(*value.borrow());
    Ok(zval)
}

fn out_array(items: Vec<Zval>) -> Result<Zval, Fail> {
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
fn in_map<T>(value: &Zval, subject: &str, item: impl Fn(&Zval) -> Result<T, Fail>) -> Result<binding_core::OrderedMap<T>, Fail> {
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
/// as the same text (in_map).
fn out_map<T>(value: impl Borrow<binding_core::OrderedMap<T>>, item: impl Fn(&T) -> Result<Zval, Fail>) -> Result<Zval, Fail> {
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
fn in_keyed_map<T>(value: &Zval, subject: &str, kinds: &[u8], expected: &str, item: impl Fn(&Zval) -> Result<T, Fail>) -> Result<binding_core::KeyedMap<T>, Fail> {
    let Some(array) = value.array() else { return Err(type_error(subject, expected)) };
    let mut map = binding_core::KeyedMap::new();
    let mut entries = array.iter();
    while let Some((key, value)) = entries.next_zval() {
        let key = if let Some(integer) = key.long() {
            match (kinds.contains(&0), kinds.contains(&2)) {
                (true, _) => binding_core::Key::Int(integer),
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
fn out_keyed_map<T>(value: impl Borrow<binding_core::KeyedMap<T>>, item: impl Fn(&T) -> Result<Zval, Fail>) -> Result<Zval, Fail> {
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

fn out_list<T>(value: impl IntoIterator<Item = T>, item: impl Fn(T) -> Result<Zval, Fail>) -> Result<Zval, Fail> {
    out_array(value.into_iter().map(item).collect::<Result<Vec<_>, Fail>>()?)
}

fn out_optional<T>(value: Option<T>, item: impl FnOnce(T) -> Result<Zval, Fail>) -> Result<Zval, Fail> {
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
  const cases = (unit.variants ?? []).map((v) => `    #[php(name = ${rustString(langName('php', v.name, 'class'))}, value = ${rustString(v.value)})]\n    ${rustVariant(v.name)},`).join('\n');
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
  const name = recordFn(unit, library);
  const core = unit.core_type ?? '';
  const fields = unit.fields ?? [];
  const owner = library === undefined ? layout : { ...layout, namespace: (model.foreign.get(library)?.packages['php'] as { namespace: string }).namespace };
  const phpName = `${phpNamespace(owner, unit.module)}\\${langName('php', unit.name, 'class')}`;
  // T-3: the class of another repository's record is registered by that repository's extension, found by its name.
  const entry = library === undefined ? `RECORDS[${index}].get().copied()` : `ClassEntry::try_find(${rustString(phpName)}).map(Class)`;
  const missing = library === undefined ? 'B-4: the record class is not registered' : `T-3: the class ${phpName} is not loaded`;
  const props = fields.map((f) => langName('php', f.name, 'variable'));
  const reads = fields.map((f, i) => `    let ${rustField(f.name)}: ${rustType(model, f.type)} = {
        let field = in_scope(entry, || object.get_property::<&Zval>(${rustString(props[i] ?? '')})).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
        ${convertIn(model, f.type, 'field', 'subject')}?
    };`);
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
    let written = in_scope(entry, || -> Result<(), Fail> {
${writes.map((w) => w.replace(')?)?;', ')?).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;')).join('\n')}
        Ok(())
    });
    written?;
    object.into_zval(false).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
}
${library === undefined ? constructor : ''}`;
}

function recordConstructor(name: string, fields: Unit['fields'] & object, props: string[], args: string[]): string {
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
                if in_scope(class, || this.set_property(name, value)).is_err() {
                    return;
                }
            }
        }));
    }
}
`;
}

const fieldInit = (field: string, variable: string): string => (field === variable ? field : `${field}: ${variable}`);

// N-4 iterate: the class is an IteratorAggregate whose getIterator gives the items under their positions, or the
// entries under their keys, converted when the iteration starts (a snapshot of the class's value), through the
// extension's Pairs iterator, because a key of an entry may be an object, which no array key is.
function iterateRust(model: Model, fn: Fn): string {
  const yields = fn.yields ?? { value: 'none' };
  const item = (type: Type, value: string): string => `${convertOut(model, type, borrowedItem(model, type, value))}?`;
  const body = yields.key === undefined
    ? `                let position = i64::try_from(position).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
                pairs.push((out_int(position)?, ${item(yields.value, 'item')}));`
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
function phpImplements(object: ObjectClass): string {
  const names = [
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
    const converted = arg.default === undefined ? convertIn(model, arg.type, rustIdent(variable), rustString(variable)) : `in_default(${rustIdent(variable)}, ${closure(['value'], convertIn(model, arg.type, 'value', rustString(variable)))})`;
    lines.push(held === undefined
      ? `        let ${rustField(arg.name)}: ${argType(model, arg)} = ${converted}?;`
      : `        let ${rustField(arg.name)} = held_${rustField(held.unit.name)}(${rustIdent(variable)}, ${rustString(variable)})?;`);
  }
  if (fn.record !== undefined) {
    const recordType = fn.record.unit.core_type ?? '';
    const fields = (fn.record.unit.fields ?? []).map((f) => fieldInit(rustField(f.name), rustField(f.name))).join(', ');
    lines.push(`        let ${rustField(fn.record.param.name)}: ${recordType} = ${recordType} { ${fields} };`);
  }
  lines.push(...locks(model, fn));
  const call = armedCall(model, fn, `${fn.corePath}(${coreCallArgs(model, fn, (p) => rustField(p.name), 'self.inner').join(', ')})`);
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
pub fn ${rustField(fn.member.name)}(${params.join(', ')}) -> Result<Zval, PhpException> {
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

// U-3: a callback is a struct that holds the PHP object and implements the core trait; an exception of the PHP code, or
// a failure of the binding in the callback, goes to the core as a Raised that the generated caller throws again.
function callbackRust(model: Model, cb: CallbackUnit): string {
  const name = rustField(cb.unit.name);
  const struct = rustType(model, { unit: cb.unit.id });
  const label = langName('php', cb.unit.name, 'class');
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
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
            let returned = object
                .try_call_method(${rustString(method)}, vec![${m.params.map((_p, i) => `&arg${i}`).join(', ')}])
                .map_err(|error| Thrown::Binding(binding_error(BindingError::Internal { detail: error.to_string() })))?;
            if let Some(exception) = ExecutorGlobals::take_exception() {
                return Err(Thrown::Php(exception));
            }
            ${m.returns === 'none' ? 'let _returned: Zval = returned;\n            Ok(())' : returned}
        };
        call().map_err(thrown)
    }`;
  }).join('\n');
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
`;
}

// E-1c, U-3: what a callback threw, kept under the handle of its Raised until the generated caller throws it again; and
// the failure of a core that calls back, as the error of its kind or that exception.
function failureRust(model: Model): string {
  if (!model.functions.some((f) => f.failure) && !model.objects.some((o) => o.members.some((f) => f.failure)) && model.aliases.length === 0) return '';
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  return `
/// U-3: an exception of the PHP code, or a failure of the binding in a callback.
enum Thrown {
    Php(ZBox<ZendObject>),
    Binding(Fail),
}

thread_local! {
    static THROWN: RefCell<BTreeMap<u64, Thrown>> = const { RefCell::new(BTreeMap::new()) };
}

static NEXT_THROWN: AtomicU64 = AtomicU64::new(1);

fn thrown(error: Thrown) -> ${failure} {
    let handle = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    THROWN.with_borrow_mut(|map| map.insert(handle, error));
    binding_core::Failure::Raised(binding_core::Raised::from_generated(binding_core::Handle::new(handle)))
}

fn failure_error(failure: ${failure}) -> Fail {
    match failure {
        binding_core::Failure::Kind(error) => core_error(error),
        binding_core::Failure::Raised(raised) => match THROWN.with_borrow_mut(|map| map.remove(&raised.handle().raw())) {
            Some(Thrown::Php(exception)) => match exception.into_zval(false) {
                Ok(object) => PhpException::from_message(String::new()).with_object(object),
                Err(error) => binding_error(BindingError::Internal { detail: error.to_string() }),
            },
            Some(Thrown::Binding(fail)) => fail,
            None => binding_error(BindingError::Internal { detail: String::from("U-3: the exception of the callback is gone") }),
        },
        binding_core::Failure::Callback(error) => binding_error(BindingError::Internal { detail: error.to_string() }),
    }
}

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
#[php(flags = ClassFlags::Final)]${object.members.some((fn) => fn.kind === 'iterate') ? '\n#[php(implements(ce = ext_php_rs::zend::ce::aggregate, stub = "\\\\IteratorAggregate"))]' : ''}${object.members.some((fn) => fn.special === 'to_json') ? '\n#[php(implements(ce = json_serializable, stub = "\\\\JsonSerializable"))]' : ''}
pub struct ${struct} {
    pub(crate) inner: ${heldType(object)},
}

#[php_impl]
impl ${struct} {${object.members.map((fn) => functionRust(model, layout, fn)).join('')}}
`;
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
fn out_${rustField(object.unit.name)}(value: ${object.unit.core_type ?? ''}) -> Result<Zval, Fail> {
    ZendClassObject::new(${struct} { inner: ${heldNew(object, 'value')} })
        .into_zval(false)
        .map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
}
`;
}

function libRust(model: Model, layout: PhpLayout): string {
  const constants = model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n') + defaultAsserts(model);
  const iterates = model.objects.some((o) => o.members.some((fn) => fn.kind === 'iterate'));
  const functions = model.functions.map((fn) => functionRust(model, layout, fn)).join('') + model.objects.map((o) => objectRust(model, layout, o)).join('') + (iterates ? PAIRS(layout) : '');
  const enums = [
    ...model.enums.map((u) => enumRust(layout, u)),
    ...model.resultRecords.map((u, i) => recordRust(model, layout, u, i)),
    ...model.foreignRecords.map((r) => recordRust(model, layout, r.unit, -1, r.library)),
    ...model.objects.map((object) => objectOut(model, object)),
    ...model.callbacks.map((c) => callbackRust(model, c)),
    failureRust(model),
    foreignFailurePhp(model),
    ...model.aliases.map((a) => aliasPhp(model, a)),
    model.aliases.length > 0 ? PHP_HOST : '',
  ].join('\n');
  // I-3: the conversions of the properties of the error units count as uses.
  const propertyUses = model.errorUnits.flatMap((u) => u.properties.map((p) => convertOut(model, p.returns, 'value'))).join('\n');
  const used = usedHelpers(`${HELPERS}\n${WIDEN}\n${enums}`, `${functions}${propertyUses}`);
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
    return `    let value = ${property.corePath}(error);
    let property = ${convertOut(model, property.returns, 'value')}?;
    if let Err(error) = in_scope(registered_class(${unitIndex(owner)}), || object.set_property(${rustString(name)}, property)) {
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
    if let Ok(value) = in_scope(registered_class(class), || this.get_property::<&Zval>(name)) {
        *retval = value.shallow_clone();
    }
}
`}
/// A library class that is registered already: the parent of an error unit and the scope of its properties.
fn registered_class(index: usize) -> &'static ClassEntry {
    match CLASSES.get(index).and_then(OnceLock::get) {
        Some(Class(class)) => class,
        None => panic!("B-4: the library class {index} is not registered"),
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
    let class: usize = match error {
${model.kinds.map((k) => `        ${k.variant} { .. } => ${k.unit === undefined ? classOf(k.category) : unitIndex(k.unit)},`).join('\n')}
    };
${!withProperties ? `    library_error(class, &error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))` : `    let mut object = match error_object(class, &error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error)) {
        Ok(object) => object,
        Err(fail) => return fail,
    };
    let written = match error {
${model.kinds.map((k) => `        ${k.variant} { .. } => ${k.unit === undefined || errorProperties(k.unit).length === 0 ? 'Ok(())' : `${rustField(k.unit.unit.name)}_properties(&mut object, &error)`},`).join('\n')}
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
  const registerInterfaces = model.callbacks.map((cb) => {
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
  const registerRecords = model.resultRecords.map((u, i) => {
    const phpName = `${phpNamespace(layout, u.module)}\\${langName('php', u.name, 'class')}`;
    const fields = u.fields ?? [];
    return `
    let registered = ClassBuilder::new(${rustString(phpName)})
        .flags(ClassFlags::Final)
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
  const register = [
    ...model.enums.map((u) => `        .enumeration::<${phpEnumType(u)}>()`),
    ...model.functions.map((fn) => `        .function(wrap_function!(${rustField(fn.member.name)}))`),
    // N-4: the iterator is registered before the classes whose getIterator names it as its return type.
    ...(iterates ? ['        .class::<PhpPairs>()'] : []),
    ...model.objects.map((o) => `        .class::<Php${langName('php', o.unit.name, 'class')}>()`),
    ...model.constants.map((c) => `        .constant((${rustString(`${phpNamespace(layout, c.module)}\\${langName('php', c.member.name, 'constant')}`)}, ${String(c.member.value)}_i64, &[]))`),
  ];
  const bases = [...new Set(model.classes.map((c) => c.category))].map((category) => phpBaseFn(category));
  const baseFns = [...new Set(bases)].map((fnName) => {
    const category = model.classes.find((c) => phpBaseFn(c.category) === fnName)?.category ?? 'value';
    return `fn ${fnName}() -> &'static ClassEntry {\n    builtin_class(${rustString(phpBase(category))})\n}\n`;
  }).join('\n');
  return `${header('//')}
// The extension ${layout.extension}. Its functions take the raw values and judge them (T-8); PHP counts the arguments
// and checks their names (G-7); a failure is an instance of its library class (B-4).

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
${model.aliases.length > 0 ? `use binding_core::{Handle, HostText, HostValue, HostValues, OutValue, OutValues${/\bPredicate::/.test(used) ? ', Predicate' : ''}};\n` : ''}${/\bArg::new\b/.test(used) || model.resultRecords.length > 0 || model.callbacks.length > 0 ? 'use ext_php_rs::args::Arg;\n' : ''}use ext_php_rs::builders::{ClassBuilder, ClassProperty, FunctionBuilder};
use ext_php_rs::boxed::ZBox;
use ext_php_rs::convert::IntoZval;${model.enums.length > 0 || /\bFromZval>::from_zval\b/.test(used) ? '\nuse ext_php_rs::convert::FromZval;' : ''}
use ext_php_rs::exception::PhpException;
use ext_php_rs::flags::{${model.resultRecords.length > 0 || model.objects.length > 0 || model.callbacks.length > 0 || model.errorUnits.some((u) => u.unit.final === true) ? 'ClassFlags, ' : ''}DataType, MethodFlags, PropertyFlags};
use ext_php_rs::prelude::*;
use ext_php_rs::types::{${['ZendClassObject', 'ZendHashTable', 'ZendObject', 'ZendStr'].filter((t) => t === 'ZendObject' || new RegExp(`\\b${t}\\b`).test(used)).join(', ')}, Zval};
use ext_php_rs::zend::{ClassEntry, ExecuteData, ExecutorGlobals};
${/Borrow</.test(used) ? 'use std::borrow::Borrow;\n' : ''}${/\bBTreeSet\b/.test(used) ? 'use std::collections::BTreeSet;\n' : ''}use std::panic::{catch_unwind, AssertUnwindSafe};
${/\bTHROWN\b/.test(used) ? 'use std::cell::RefCell;\nuse std::collections::BTreeMap;\nuse std::sync::atomic::{AtomicU64, Ordering};\n' : ''}use std::sync::OnceLock;

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
${model.resultRecords.length > 0 ? `
/// The classes of the result form of the records (T-4), in the order of the contract.
static RECORDS: [OnceLock<Class>; ${model.resultRecords.length}] = [${model.resultRecords.map(() => 'const { OnceLock::new() }').join(', ')}];

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

/// B-4: a class of PHP itself, found in the engine's class table when the module starts; a missing class fails the start.
fn builtin_class(name: &str) -> &'static ClassEntry {
    // SAFETY: at module startup the compiler globals hold the class table, which outlives the module; the lookup copies
    // the name before lowercasing it.
    let found = unsafe {
        let table = (*ext_php_rs::ffi::ext_php_rs_compiler_globals()).class_table;
        ext_php_rs::ffi::zend_hash_str_find_ptr_lc(table, name.as_ptr().cast(), name.len())
    };
    // SAFETY: the class table holds class entries.
    match unsafe { found.cast::<ClassEntry>().as_ref() } {
        Some(class) => class,
        None => panic!("B-4: the class {name} is missing"),
    }
}

${baseFns}${model.objects.some((o) => o.members.some((fn) => fn.special === 'to_json')) ? `
/// N-4: the interface of a class with a JSON hook.
fn json_serializable() -> &'static ClassEntry {
    builtin_class("JsonSerializable")
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
fn in_scope<R>(class: &ClassEntry, body: impl FnOnce() -> R) -> R {
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
        if let Ok(kind) = in_scope(class, || this.get_property::<String>(name)) {
            if retval.set_string(&kind, false).is_err() {
                retval.set_null();
            }
        }
        return;
    }
    match in_scope(class, || this.get_property::<Option<i64>>(name)) {
        Ok(Some(number)) => retval.set_long(number),
        Ok(None) | Err(_) => retval.set_null(),
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
    let written = in_scope(${scopeOf('entry')}, || -> ext_php_rs::error::Result<()> {
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
fn guard<T>(body: impl FnOnce() -> Result<T, Fail>) -> Result<T, Fail> {
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
${faultRust(model)}${aliasKindsRust(model)}${raisesAssertions(model)}${used}
/// B-4: the library classes are registered when the module starts, after the classes of PHP that they extend.
extern "C" fn startup(_kind: i32, _module: i32) -> i32 {${registerClasses}${registerUnits}${registerRecords}${registerInterfaces}
    0
}

/// The module entry and the functions. The expansions of ext-php-rs's php_function and php_module macros call methods
/// that R-1 disallows (\`Option::map_or\`, \`Result::unwrap_or\`) in this crate's own code; the allow is limited to this
/// module, whose functions only convert their arguments and call the core.
mod entry {
    #![allow(clippy::disallowed_methods, reason = "R-1: the expansion of the php_function and php_module macros of ext-php-rs")]
    use super::*;
${functions}
${PANIC_TEST(layout)}${model.faults.length === 0 ? '' : FAULT_TEST(layout)}${aliasesWithKinds(model).map((alias) => `
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
`).join('')}
${poisonRust(model, layout)}
    #[php_module]
    #[php(startup = "startup")]
    pub fn module(module: ModuleBuilder) -> ModuleBuilder {
        let module = module
    ${register.join('\n')};${model.aliases.length === 0 ? '' : `
        // GN-6e: a PHP value that entered as a handle does not outlive its request.
        let module = module.request_shutdown_function(release_native);`}
        #[cfg(feature = "panic-test")]
        let module = module.function(wrap_function!(panic_test));${model.objects.some((o) => o.lock?.writes === true) ? `
        #[cfg(feature = "panic-test")]
        let module = module.function(wrap_function!(panic_test_held));` : ''}${model.faults.length === 0 ? '' : `
        #[cfg(feature = "fault-test")]
        let module = module.function(wrap_function!(arm_faults)).function(wrap_function!(fault_left));`}${aliasesWithKinds(model).map((alias) => `
        #[cfg(feature = "codec-test")]
        let module = module.function(wrap_function!(alias_in_${rustField(alias.unit.name)}));`).join('')}
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
      return ({ text: 'string', latin1: 'string', bytes: 'string', source: 'string', bool: 'bool', uint: 'int', int: 'int', int64: 'int', float: 'float', none: 'void', never: 'never' } as Record<string, string>)[type] ?? 'mixed';
    }
    if ('list' in type || 'tuple' in type || 'map' in type || 'keyed_map' in type) return 'array';
    if ('optional' in type) return `?${phpType(type.optional)}`;
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
    return phpType(type);
  };
  const blocks: string[] = [];
  blocks.push(`namespace ${layout.namespace} {
${model.classes.map((c) => `    /** The errors of category ${c.category} (E-2). */
    class ${c.name} extends \\${phpBase(c.category)}
    {
        public function kind(): string {}

        public function status(): ?int {}

        public function errno(): ?int {}
    }
`).join('\n')}}`);
  // E-2, I-3: an error unit extends the class of its parent or of its category; a property is a method.
  for (const u of model.errorUnits) {
    const parent = u.parent === undefined
      ? `\\${layout.namespace}\\${model.classes.find((c) => c.category === u.category)?.name ?? ''}`
      : `\\${phpNamespace(layout, u.parent.unit.module)}\\${langName('php', u.parent.unit.name, 'class')}`;
    blocks.push(`namespace ${phpNamespace(layout, u.unit.module)} {
    /** The errors of the unit ${u.unit.id} (E-2). */
    ${u.unit.final === true ? 'final ' : ''}class ${langName('php', u.unit.name, 'class')} extends ${parent}
    {${u.properties.map((p) => `
        public function ${langName('php', p.member.name, 'callable')}(): ${phpType(typeof p.returns === 'object' && 'optional' in p.returns ? p.returns.optional : p.returns).replace(/^\?/, '')}|null {}`).join('\n')}
    }
}`);
  }
  const modules = [...new Set([
    ...model.functions.map((f) => f.module), ...model.enums.map((u) => u.module), ...model.constants.map((c) => c.module),
    ...model.resultRecords.map((u) => u.module), ...model.objects.map((o) => o.unit.module), ...model.callbacks.map((c) => c.unit.module),
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
${indent} */
${indent}public function getIterator(): \\Iterator {}
`;
    }
    const name = fn.kind === 'constructor' ? '__construct' : memberName('php', fn);
    const prefix = fn.kind === 'function' ? 'function' : fn.kind === 'static' ? 'public static function' : 'public function';
    const returns = fn.kind === 'constructor' ? '' : `: ${phpType(fn.returns)}`;
    return `${indent}/**
${indent} * T-8: the parameters take any value, which the extension judges.
${docs.length > 0 ? `${indent} *\n${docs.join('\n')}\n` : ''}${fn.kind === 'constructor' ? '' : `${indent} * @return ${docType(fn.returns)}\n`}${indent} */
${indent}${prefix} ${name}(${params.join(', ')})${returns} {}
`;
  };
  for (const module of modules) {
    const items: string[] = [];
    for (const unit of model.resultRecords.filter((u) => u.module === module)) {
      const props = (unit.fields ?? []).map((f) => `            public readonly mixed $${langName('php', f.name, 'variable')},`);
      items.push(`    /** T-4: the result form of the record; the constructor holds the values, which the extension judges when they enter. */
    final class ${langName('php', unit.name, 'class')}
    {
        public function __construct(
${props.join('\n')}
        ) {}
    }
`);
    }
    for (const cb of model.callbacks.filter((c) => c.unit.module === module)) {
      const lines = cb.members.map((m) => {
        const docs = m.params.map((p) => `         * @param ${docType(p.type)} $${langName('php', p.name, 'variable')}`);
        return `        /**
         * U-3: the extension calls it; the value it returns is judged as it enters (T-8).
         *
${docs.join('\n')}${docs.length > 0 ? '\n' : ''}         * @return ${docType(m.returns)}
         */
        public function ${langName('php', m.member.name, 'callable')}(${m.params.map((p) => `mixed $${langName('php', p.name, 'variable')}`).join(', ')}): mixed;
`;
      });
      items.push(`    /** U-3: a callback that PHP code implements. */
    interface ${langName('php', cb.unit.name, 'class')}
    {
${lines.join('\n')}    }
`);
    }
    for (const object of model.objects.filter((o) => o.unit.module === module)) {
      const members = object.members.map((fn) => method(fn, '        '));
      if (!object.constructible) members.unshift('        private function __construct() {}\n');
      items.push(`    /** T-5. */
    final class ${langName('php', object.unit.name, 'class')}${phpImplements(object)}
    {
${members.join('\n')}    }
`);
    }
    for (const unit of model.enums.filter((u) => u.module === module)) {
      items.push(`    enum ${langName('php', unit.name, 'class')}: string
    {
${(unit.variants ?? []).map((v) => `        case ${langName('php', v.name, 'class')} = '${v.value}';`).join('\n')}
    }
`);
    }
    for (const constant of model.constants.filter((c) => c.module === module)) {
      items.push(`    const ${langName('php', constant.member.name, 'constant')} = ${JSON.stringify(constant.member.value)};\n`);
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
