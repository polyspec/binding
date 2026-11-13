// The browser and JavaScript binding (wasm-bindgen): the Rust crate that wasm-bindgen turns into a WebAssembly module
// and its JavaScript glue, the ES module around it (the library classes, the loading of the module at import and the argument checks of G-7), the
// declarations and the generated tests (G-5). The npm package of Node carries it: the subpath ./wasm always, and an
// entry with the conditions of P-5 chooses it in the browser.

import type { Type, Unit } from '../contract.ts';
import { type Fn, type Model, type ObjectClass, Unsupported, borrowedItem, coreCallArgs, langName, memberName, objectUnit, rustField, rustType, rustVariant, takesObject, unitOf } from './model.ts';
import { wasmTests } from './tests_wasm.ts';
import { raisesAssertions } from './raises.ts';
import { type Files, header, jsString, rustString, closure, usedHelpers, WIDEN } from './text.ts';

export const WASM = 'packages/ts/wasm';
const ROOT = `${WASM}/generated`;

// The name of the files of wasm-bindgen: <glue>.js, <glue>_bg.wasm and their declarations.
export const wasmGlue = (model: Model): string => `${model.contract.library.replaceAll('-', '_')}_wasm`;

// ---- Rust ----

function convertIn(model: Model, type: Type, value: string, subject: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'in_text', latin1: 'in_latin1', bool: 'in_bool', uint: 'in_uint', int: 'in_int', int64: 'in_int', float: 'in_float' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no WASM input conversion for ${type}`);
    return `${name}(${value}, ${subject})`;
  }
  if ('list' in type) return `in_list(${value}, ${subject}, ${closure(['item'], convertIn(model, type.list, 'item', subject))})`;
  if ('map' in type) return `in_map(${value}, ${subject}, ${closure(['item'], convertIn(model, type.map, 'item', subject))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `in_keyed_map(${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`a Map whose keys are ${type.key.map((k) => ({ int: 'safe integers', text: 'strings' })[k] ?? k).join(' or ')}`)}, ${closure(['item'], convertIn(model, type.keyed_map, 'item', subject))})`;
  }
  if ('optional' in type) return `in_optional(${value}, ${closure(['value'], convertIn(model, type.optional, 'value', subject))})`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum' || unit?.kind === 'record') return `in_${rustField(unit.name)}(${value}, ${subject})`;
  if (unit !== undefined && objectUnit(model, type) !== undefined) return `in_${rustField(unit.name)}(${value}, ${subject})`;
  throw new Unsupported(`no WASM input conversion for ${JSON.stringify(type)}`);
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    // T-2 never: the core's Infallible has no value, so the call has failed before.
    if (type === 'never') return `match ${value} {}`;
    if (type === 'none') return 'Ok(JsValue::UNDEFINED)';
    const fn: Record<string, string> = { text: 'out_text', latin1: 'out_latin1', bool: 'out_bool', uint: 'out_uint', int: 'out_int', int64: 'out_int', float: 'out_float' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no WASM output conversion for ${type}`);
    return `${name}(${value})`;
  }
  if ('list' in type) return `out_list(${value}, ${closure(['item'], convertOut(model, type.list, 'item'))})`;
  // The value of a keyed map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('map' in type) return `out_map(${value}, |item| ${convertOut(model, type.map, 'item')})`;
  if ('keyed_map' in type) return `out_keyed_map(${value}, |item| ${convertOut(model, type.keyed_map, 'item')})`;
  if ('optional' in type) return `out_optional(${value}, ${closure(['value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) return `out_tuple(&[${type.tuple.map((t, i) => `${convertOut(model, t, `&${value}.${i}`)}?`).join(', ')}])`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum' || unit?.kind === 'record') return `out_${rustField(unit.name)}(${value})`;
  if (unit !== undefined && objectUnit(model, type) !== undefined) return `out_${rustField(unit.name)}(${value})`;
  throw new Unsupported(`no WASM output conversion for ${JSON.stringify(type)}`);
}

const HELPERS = `
fn type_error(subject: &str, expected: &str) -> Fail {
    binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: expected.to_owned() })
}

/// A failure of the JavaScript engine itself is kind internal (P-2).
fn internal(error: &JsValue) -> Fail {
    binding_error(BindingError::Internal { detail: format!("{error:?}") })
}

fn js_string<'v>(value: &'v JsValue, subject: &str) -> Result<&'v JsString, Fail> {
    value.dyn_ref::<JsString>().ok_or_else(|| type_error(subject, "string"))
}

/// B-3, B-9: text is a string without an unpaired surrogate.
fn in_text(value: &JsValue, subject: &str) -> Result<String, Fail> {
    let text = js_string(value, subject)?;
    if !text.is_valid_utf16() {
        return Err(binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::UnpairedSurrogate }));
    }
    Ok(String::from(text))
}

/// B-3, T-1 latin1: a string whose code units are U+0000 to U+00FF, one byte each.
fn in_latin1(value: &JsValue, subject: &str) -> Result<Vec<u8>, Fail> {
    js_string(value, subject)?
        .iter()
        .map(|unit| u8::try_from(unit).map_err(|_above| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::AboveLatin1 })))
        .collect()
}

fn in_bool(value: &JsValue, subject: &str) -> Result<bool, Fail> {
    value.as_bool().ok_or_else(|| type_error(subject, "boolean"))
}

/// B-2: a number that is a safe integer; NaN, the infinities, fractions and any other value are kind invalid_number.
fn safe_integer(value: &JsValue, subject: &str, expected: NumberType) -> Result<i64, Fail> {
    let invalid = || binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected });
    let double = value.as_f64().ok_or_else(invalid)?;
    if !double.is_finite() || double.fract() != 0.0 || double.abs() > 9_007_199_254_740_991.0 {
        return Err(invalid());
    }
    #[allow(clippy::as_conversions, clippy::cast_possible_truncation, reason = "B-2: a safe integer, which i64 holds exactly")]
    let integer = double as i64;
    Ok(integer)
}

fn in_uint(value: &JsValue, subject: &str) -> Result<u64, Fail> {
    let integer = safe_integer(value, subject, NumberType::Uint)?;
    u64::try_from(integer).map_err(|_negative| binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint }))
}

fn in_int(value: &JsValue, subject: &str) -> Result<i64, Fail> {
    safe_integer(value, subject, NumberType::Int)
}

fn in_float(value: &JsValue, subject: &str) -> Result<f64, Fail> {
    value.as_f64().ok_or_else(|| binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Float }))
}

/// T-7: an array; the JavaScript entry turns any other iterable but a string into one.
fn in_list<T>(value: &JsValue, subject: &str, item: impl Fn(&JsValue) -> Result<T, Fail>) -> Result<Vec<T>, Fail> {
    let array = value.dyn_ref::<Array>().ok_or_else(|| type_error(subject, "Iterable"))?;
    array.iter().map(|value| item(&value)).collect()
}

/// T-7: null is the absence; any other value is converted.
fn in_optional<T>(value: &JsValue, item: impl FnOnce(&JsValue) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    if value.is_null() {
        return Ok(None);
    }
    item(value).map(Some)
}

/// T-4: a member of the options record; the JavaScript entry checks its names and that it is present.
fn member(record: &JsValue, name: &str, subject: &str) -> Result<JsValue, Fail> {
    if !record.is_object() {
        return Err(type_error(subject, "object"));
    }
    Reflect::get(record, &JsValue::from_str(name)).map_err(|error| internal(&error))
}

fn out_text(value: impl AsRef<str>) -> Result<JsValue, Fail> {
    Ok(JsValue::from_str(value.as_ref()))
}

/// T-1 latin1: each byte is one character.
fn out_latin1(value: impl AsRef<[u8]>) -> Result<JsValue, Fail> {
    let text: String = value.as_ref().iter().map(|byte| char::from(*byte)).collect();
    out_text(text)
}

fn out_bool(value: impl Borrow<bool>) -> Result<JsValue, Fail> {
    Ok(JsValue::from_bool(*value.borrow()))
}

/// B-2: a number leaves only as a safe integer; a larger one is kind internal.
fn out_int(value: impl WideInt) -> Result<JsValue, Fail> {
    let value = value.widen_int();
    if value.abs() > 9_007_199_254_740_991 {
        return Err(binding_error(BindingError::Internal { detail: format!("{value} is not a safe integer") }));
    }
    #[allow(clippy::as_conversions, clippy::cast_precision_loss, reason = "B-2: a safe integer, which f64 holds exactly")]
    let double = value as f64;
    Ok(JsValue::from_f64(double))
}

fn out_uint(value: impl WideUint) -> Result<JsValue, Fail> {
    let value = value.widen_uint();
    match i64::try_from(value) {
        Ok(value) => out_int(value),
        Err(_large) => Err(binding_error(BindingError::Internal { detail: format!("{value} is not a safe integer") })),
    }
}

fn out_float(value: impl Borrow<f64>) -> Result<JsValue, Fail> {
    Ok(JsValue::from_f64(*value.borrow()))
}

fn out_list<T>(value: impl IntoIterator<Item = T>, item: impl Fn(T) -> Result<JsValue, Fail>) -> Result<JsValue, Fail> {
    let array = Array::new();
    for value in value {
        array.push(&item(value)?);
    }
    Ok(array.into())
}

/// T-2: the entries of a Map, which the JavaScript entry turns into an array of [key, value] (a map is a whole
/// parameter, GN-18): each key a string; any other key is kind invalid_argument_type.
fn in_map<T>(value: &JsValue, subject: &str, item: impl Fn(&JsValue) -> Result<T, Fail>) -> Result<binding_core::OrderedMap<T>, Fail> {
    let expected = "a Map whose keys are strings";
    let entries = value.dyn_ref::<Array>().ok_or_else(|| type_error(subject, expected))?;
    let mut map = binding_core::OrderedMap::new();
    for entry in entries.iter() {
        let pair = entry.dyn_ref::<Array>().filter(|pair| pair.length() == 2).ok_or_else(|| type_error(subject, expected))?;
        let key = pair.get(0);
        if !key.is_string() {
            return Err(type_error(subject, expected));
        }
        if map.insert(in_text(&key, subject)?, item(&pair.get(1))?).is_some() {
            return Err(binding_error(BindingError::Internal { detail: String::from("a Map gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a map, owned or borrowed, as an array of [key, value], which the JavaScript entry makes a Map.
fn out_map<T>(value: impl Borrow<binding_core::OrderedMap<T>>, item: impl Fn(&T) -> Result<JsValue, Fail>) -> Result<JsValue, Fail> {
    let entries = Array::new();
    for (key, value) in value.borrow().iter() {
        entries.push(&out_tuple(&[out_text(key)?, item(value)?])?);
    }
    Ok(entries.into())
}

/// T-2, U-7 (c): the entries of a Map, which the JavaScript entry turns into an array of [key, value] (a keyed map is a
/// whole parameter, GN-18): a key that is a safe integer or a string of a kind that the contract lists; any other key is
/// kind invalid_argument_type.
fn in_keyed_map<T>(value: &JsValue, subject: &str, kinds: &[u8], expected: &str, item: impl Fn(&JsValue) -> Result<T, Fail>) -> Result<binding_core::KeyedMap<T>, Fail> {
    let entries = value.dyn_ref::<Array>().ok_or_else(|| type_error(subject, expected))?;
    let mut map = binding_core::KeyedMap::new();
    for entry in entries.iter() {
        let pair = entry.dyn_ref::<Array>().filter(|pair| pair.length() == 2).ok_or_else(|| type_error(subject, expected))?;
        let key = pair.get(0);
        let (tag, key) = if key.as_f64().is_some() {
            (0, binding_core::Key::Int(safe_integer(&key, subject, NumberType::Int).map_err(|_not_safe| type_error(subject, expected))?))
        } else if key.is_string() {
            (2, binding_core::Key::Text(in_text(&key, subject)?))
        } else {
            return Err(type_error(subject, expected));
        };
        if !kinds.contains(&tag) {
            return Err(type_error(subject, expected));
        }
        if map.insert(key, item(&pair.get(1))?).is_some() {
            return Err(binding_error(BindingError::Internal { detail: String::from("a Map gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a keyed map, owned or borrowed, as an array of [key, value], which the JavaScript entry makes a Map; a byte
/// string key, which no WASM contract lists, is kind internal.
fn out_keyed_map<T>(value: impl Borrow<binding_core::KeyedMap<T>>, item: impl Fn(&T) -> Result<JsValue, Fail>) -> Result<JsValue, Fail> {
    let entries = Array::new();
    for (key, value) in value.borrow().iter() {
        let key = match key {
            binding_core::Key::Int(integer) => out_int(integer)?,
            binding_core::Key::Text(text) => out_text(text)?,
            binding_core::Key::Bytes(_bytes) => return Err(binding_error(BindingError::Internal { detail: String::from("a byte string key of a keyed map") })),
        };
        entries.push(&out_tuple(&[key, item(value)?])?);
    }
    Ok(entries.into())
}

fn out_tuple(items: &[JsValue]) -> Result<JsValue, Fail> {
    Ok(items.iter().collect::<Array>().into())
}

/// An optional value, owned or borrowed (\`&Option<T>\` is an \`Option<&T>\`); the absence is null (T-7).
fn out_optional<T>(value: impl Into<Option<T>>, item: impl FnOnce(T) -> Result<JsValue, Fail>) -> Result<JsValue, Fail> {
    match value.into() {
        Some(value) => item(value),
        None => Ok(JsValue::NULL),
    }
}
`;

function enumRust(unit: Unit): string {
  const name = rustField(unit.name);
  const core = unit.core_type ?? '';
  const jsName = langName('wasm', unit.name, 'class');
  const arms = (unit.variants ?? []).map((v) => `        ${rustString(v.value)} => Ok(${core}::${rustVariant(v.name)}),`).join('\n');
  const outArms = (unit.variants ?? []).map((v) => `        ${core}::${rustVariant(v.name)} => ${rustString(v.value)},`).join('\n');
  return `
/// T-6: a value of ${jsName} is one of its strings.
fn in_${name}(value: &JsValue, subject: &str) -> Result<${core}, Fail> {
    let text = in_text(value, subject)?;
    match text.as_str() {
${arms}
        _ => Err(type_error(subject, ${rustString(jsName)})),
    }
}

fn out_${name}(value: impl Borrow<${core}>) -> Result<JsValue, Fail> {
    let text = match value.borrow() {
${outArms}
    };
    out_text(text)
}
`;
}

function recordRust(model: Model, unit: Unit): string {
  const name = rustField(unit.name);
  const core = unit.core_type ?? '';
  const fields = unit.fields ?? [];
  const reads = fields.map((f) => {
    const js = langName('wasm', f.name, 'variable');
    return `    let ${rustField(f.name)}: ${rustType(model, f.type)} = ${convertIn(model, f.type, `&member(value, ${rustString(js)}, subject)?`, rustString(js))}?;`;
  });
  const writes = fields.map((f) => `    Reflect::set(&object, &JsValue::from_str(${rustString(langName('wasm', f.name, 'variable'))}), &${convertOut(model, f.type, `&value.${rustField(f.name)}`)}?).map_err(|error| internal(&error))?;`);
  return `
/// T-4: a value of the record ${langName('wasm', unit.name, 'class')} is an object with a member per field, judged as it enters (T-8).
fn in_${name}(value: &JsValue, subject: &str) -> Result<${core}, Fail> {
${reads.join('\n')}
    Ok(${core} { ${fields.map((f) => rustField(f.name)).join(', ')} })
}

fn out_${name}(value: impl Borrow<${core}>) -> Result<JsValue, Fail> {
    let value = value.borrow();
    let object = Object::new();
${writes.join('\n')}
    Ok(object.into())
}
`;
}

// T-5: the name of the module's export of a member of a class, which the ES module calls from the class it defines.
const exportName = (fn: Fn): string => {
  const cls = langName('wasm', fn.unit.name, 'class');
  if (fn.kind === 'constructor') return `__${cls}_new`;
  if (fn.kind === 'iterate') return `__${cls}_iterate`;
  return `__${cls}_${memberName('wasm', fn)}`;
};

// The snake_case name of a unit in the names that this file makes; a keyword needs no raw form inside a longer name.
const plainName = (unit: Unit): string => rustField(unit.name).replace(/^r#/, '');

const tableName = (unit: Unit): string => `TABLE_${plainName(unit).toUpperCase()}`;

// The Rust name of an export: a member of a class has the name of its class before its own, so it meets no function.
const rustExport = (fn: Fn): string =>
  fn.kind === 'function' ? rustField(fn.member.name) : `class_${plainName(fn.unit)}_${fn.kind === 'constructor' ? 'new' : rustField(fn.member.name).replace(/^r#/, '')}`;

// N-4 iterate: the export gives the items, or [key, value] for the entries, as an array converted when the iteration
// starts (a snapshot of the class's value); the ES module makes it the class's Symbol.iterator.
function iterateRust(model: Model, fn: Fn): string {
  const yields = fn.yields ?? { value: 'none' };
  const item = (type: Type, value: string): string => `${convertOut(model, type, borrowedItem(model, type, value))}?`;
  const body = yields.key === undefined
    ? `            items.push(&${item(yields.value, 'item')});`
    : `            let (key, value) = item;
            items.push(&out_tuple(&[${item(yields.key, 'key')}, ${item(yields.value, 'value')}])?);`;
  return `
/// ${fn.corePath} (contract member ${fn.member.id}).
#[wasm_bindgen(js_name = ${rustString(exportName(fn))})]
pub fn ${rustExport(fn)}(this: u32) -> Result<JsValue, JsValue> {
    guard(|| {
        let held = held_${plainName(fn.unit)}(this)?;
        let this: &${fn.unit.core_type ?? ''} = &held;
        let items = Array::new();
        for item in ${fn.corePath}(this) {
${body}
        }
        Ok(items.into())
    })
    .map_err(throw)
}
`;
}

function functionRust(model: Model, fn: Fn): string {
  if (fn.kind === 'iterate') return iterateRust(model, fn);
  const jsName = fn.kind === 'function' ? langName('wasm', fn.member.name, 'callable') : exportName(fn);
  // T-5: a method or property takes the handle of its instance first, which the ES module reads from the instance.
  const params = [...(fn.receiver === undefined ? [] : ['this: u32']), ...fn.params.map((p) => `${rustField(p.name)}: JsValue`)].join(', ');
  const lines: string[] = [];
  if (fn.receiver !== undefined) {
    lines.push(`        let held = held_${plainName(fn.unit)}(this)?;`, `        let this: &${fn.unit.core_type ?? ''} = &held;`);
  }
  for (const parameter of fn.params) {
    const variable = rustField(parameter.name);
    if (fn.record !== undefined && parameter === fn.record.param) {
      for (const field of fn.record.unit.fields ?? []) {
        const name = langName('wasm', field.name, 'variable');
        const raw = `&member(&${variable}, ${rustString(name)}, ${rustString(langName('wasm', parameter.name, 'variable'))})?`;
        lines.push(`        let ${rustField(field.name)}: ${rustType(model, field.type)} = ${convertIn(model, field.type, raw, rustString(name))}?;`);
      }
      const recordType = fn.record.unit.core_type ?? '';
      lines.push(`        let ${variable}: ${recordType} = ${recordType} { ${(fn.record.unit.fields ?? []).map((f) => rustField(f.name)).join(', ')} };`);
    } else {
      lines.push(`        let ${variable}: ${rustType(model, parameter.type)} = ${convertIn(model, parameter.type, `&${variable}`, rustString(langName('wasm', parameter.name, 'variable')))}?;`);
    }
  }
  // The receiver is the reference above, the first argument of the core path (U-2 core.receiver).
  const callArgs = coreCallArgs(model, fn, (p) => rustField(p.name), 'this');
  const call = `${fn.corePath}(${(fn.receiver === undefined ? callArgs : ['this', ...callArgs.slice(1)]).join(', ')})`;
  if (fn.fallible) {
    lines.push(`        let result = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(core_error(error)),\n        };`);
  } else if (fn.returns === 'none') {
    lines.push(`        ${call};`);
  } else {
    lines.push(`        let result = ${call};`);
  }
  // T-5: the constructor gives the handle of the new value, which the instance under construction keeps.
  lines.push(fn.kind === 'constructor' ? `        insert_${plainName(fn.unit)}(result)` : `        ${convertOut(model, fn.returns, 'result')}`);
  return `
/// ${fn.corePath} (contract member ${fn.member.id}).
#[wasm_bindgen(js_name = ${rustString(jsName)})]
pub fn ${rustExport(fn)}(${params}) -> Result<${fn.kind === 'constructor' ? 'u32' : 'JsValue'}, JsValue> {
    guard(|| {
${lines.join('\n')}
    })
    .map_err(throw)
}
`;
}

// T-5: a class unit. The module keeps the core values of its instances in a table of the class, and an instance of the
// class that the ES module defines keeps the handle of its value in a private field. A helper is written only where
// the contract uses it (the lints deny dead code).
function objectHelpers(model: Model, object: ObjectClass, index: number): string {
  const name = rustField(object.unit.name);
  const plain = plainName(object.unit);
  const jsClass = langName('wasm', object.unit.name, 'class');
  const core = object.unit.core_type ?? '';
  const table = tableName(object.unit);
  return `
/// T-5: the value that an instance of ${jsClass} holds. A handle that names none is a fault of the ES module: kind internal.
fn held_${plain}(handle: u32) -> Result<Rc<${core}>, Fail> {
    ${table}.with(|table| table.borrow().get(handle)).ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("T-5: no value of ${jsClass} has this handle") }))
}

/// T-5: keeps a value of ${jsClass} and gives its handle.
fn insert_${plain}(value: ${core}) -> Result<u32, Fail> {
    ${table}.with(|table| table.borrow_mut().insert(value))
}

/// T-5: a value of ${jsClass} leaves as a new instance, which the ES module makes around the handle of the value.
fn out_${name}(value: ${core}) -> Result<JsValue, Fail> {
    let handle = insert_${plain}(value)?;
    make_instance(${index}, handle).inspect_err(|_fail| ${table}.with(|table| table.borrow_mut().remove(handle)))
}
${takesObject(model, object) ? `
/// T-5: a value of the class ${jsClass} is an instance of it; the core takes a copy of the value it holds.
fn in_${name}(value: &JsValue, subject: &str) -> Result<${core}, Fail> {
    let handle = handle_of(${index}, value)?.ok_or_else(|| type_error(subject, ${rustString(jsClass)}))?;
    held_${plain}(handle).map(|held| ${core}::clone(&held))
}
` : ''}`;
}

const OBJECT_HELPERS = `
/// T-5: the instance of the class \`class\` around a handle, made by the function that the ES module handed over.
fn make_instance(class: usize, handle: u32) -> Result<JsValue, Fail> {
    let maker = MAKERS.with(|makers| makers.borrow().get(class).cloned());
    let maker = maker.ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("T-5: the classes are not registered") }))?;
    maker.call1(&JsValue::NULL, &JsValue::from(handle)).map_err(|error| internal(&error))
}

/// T-5: the handle that an instance of the class \`class\` keeps; None for any other value, which the function that
/// the ES module handed over answers with undefined.
fn handle_of(class: usize, value: &JsValue) -> Result<Option<u32>, Fail> {
    let reader = READERS.with(|readers| readers.borrow().get(class).cloned());
    let reader = reader.ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("T-5: the classes are not registered") }))?;
    let answer = reader.call1(&JsValue::NULL, value).map_err(|error| internal(&error))?;
    let Some(number) = answer.as_f64() else {
        return Ok(None);
    };
    if number.fract() != 0.0 || !(0.0..=f64::from(u32::MAX)).contains(&number) {
        return Err(binding_error(BindingError::Internal { detail: format!("T-5: {number} is no handle") }));
    }
    #[allow(clippy::as_conversions, clippy::cast_possible_truncation, clippy::cast_sign_loss, reason = "T-5: an integer of the range of u32, checked above")]
    let handle = number as u32;
    Ok(Some(handle))
}
`;

// T-5: the table of a class and the functions of the ES module that make and read its instances.
function objectState(model: Model, used: string): string {
  if (model.objects.length === 0) return '';
  const tables = model.objects.map((o) => `    /// T-5: the values of the instances of ${langName('wasm', o.unit.name, 'class')}.
    static ${tableName(o.unit)}: RefCell<Table<${o.unit.core_type ?? ''}>> = const { RefCell::new(Table::new()) };`).join('\n');
  const get = /\bheld_[a-z_0-9#]+\(/.test(used) ? `
    fn get(&self, handle: u32) -> Option<Rc<T>> {
        self.values.get(&handle).cloned()
    }
` : '';
  return `
/// T-5: the values that the instances of a class hold, each under the handle that its instance keeps in a private field
/// of the ES module. A call shares the value it reads, so no table is borrowed while the core runs.
struct Table<T> {
    values: BTreeMap<u32, Rc<T>>,
    next: u32,
    free: Vec<u32>,
}

impl<T> Table<T> {
    const fn new() -> Self {
        Self { values: BTreeMap::new(), next: 0, free: Vec::new() }
    }

    fn insert(&mut self, value: T) -> Result<u32, Fail> {
        let handle = match self.free.pop() {
            Some(handle) => handle,
            None => {
                let handle = self.next;
                self.next = handle.checked_add(1).ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("T-5: no handle is left") }))?;
                handle
            }
        };
        self.values.insert(handle, Rc::new(value));
        Ok(handle)
    }
${get}
    fn remove(&mut self, handle: u32) {
        if self.values.remove(&handle).is_some() {
            self.free.push(handle);
        }
    }
}

thread_local! {
${tables}
    /// T-5: for each class unit in contract order, the function of the ES module that makes an instance around a handle.
    static MAKERS: RefCell<Vec<Function>> = const { RefCell::new(Vec::new()) };
    /// T-5: for each class unit in contract order, the function of the ES module that reads the handle of an instance.
    static READERS: RefCell<Vec<Function>> = const { RefCell::new(Vec::new()) };
}
`;
}

// T-5: the exports of a class: its members, and the release of a value whose instance the engine collected.
function objectRust(model: Model, object: ObjectClass): string {
  const jsClass = langName('wasm', object.unit.name, 'class');
  const name = plainName(object.unit);
  return `${object.members.map((fn) => functionRust(model, fn)).join('')}
/// T-5: drops the value of an instance of ${jsClass} that the engine collected (the FinalizationRegistry of the ES module).
#[wasm_bindgen(js_name = ${rustString(`__${jsClass}_free`)})]
pub fn class_${name}_free(this: u32) {
    ${tableName(object.unit)}.with(|table| table.borrow_mut().remove(this));
}
`;
}

function coreErrorRust(model: Model): string {
  if (model.coreError === undefined) return '';
  const arms = model.kinds.map((k) => `        ${k.variant} { .. } => ${model.classes.findIndex((c) => c.category === k.category)},`).join('\n');
  return `
/// I-2 (3): the class of each variant of the core error, by a match without a wildcard. The pattern \`{ .. }\` matches a
/// variant with or without data, which the generator does not see (I-2: binding reads no Rust source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn core_error(error: ${model.coreError}) -> Fail {
    let class: usize = match error {
${arms}
    };
    Fail { class, message: error.to_string(), kind: Kinds::kind(&error), status: Kinds::status(&error), errno: Kinds::errno(&error) }
}
`;
}

function libRust(model: Model): string {
  const classIndex = (category: string): string => String(model.classes.findIndex((c) => c.category === category));
  const constants = model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n');
  const functions = [...model.functions.map((fn) => functionRust(model, fn)), ...model.objects.map((o) => objectRust(model, o))].join('');
  const objectUnits = model.objects.length === 0 ? [] : [OBJECT_HELPERS, ...model.objects.map((o, index) => objectHelpers(model, o, index))];
  const units = [...model.enums.map(enumRust), ...model.resultRecords.map((u) => recordRust(model, u)), ...objectUnits].join('\n');
  const used = usedHelpers(`${HELPERS}\n${WIDEN}\n${units}`, functions);
  const state = objectState(model, `${used}${functions}`);
  const jsTypes = ['Array', 'JsString', 'Object'].filter((t) => new RegExp(`\\b${t}\\b`).test(`${used}${functions}`));
  const registered = model.objects.length === 0 ? '' : `
        MAKERS.with(|registered| registered.replace(makers));
        READERS.with(|registered| registered.replace(readers));`;
  return `${header('//')}
// The WebAssembly module of ${model.contract.library}. Its functions take the raw values and judge them (T-8); the
// JavaScript entry checks the count and the names of the arguments (G-7); a failure is an instance of its library class
// (B-4).

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
use js_sys::{${[...jsTypes, 'Function', 'Reflect'].sort().join(', ')}};
${/Borrow</.test(used) ? 'use std::borrow::Borrow;\n' : ''}use std::cell::RefCell;
${model.objects.length === 0 ? '' : 'use std::collections::BTreeMap;\n'}use std::panic::{catch_unwind, AssertUnwindSafe};
${model.objects.length === 0 ? '' : 'use std::rc::Rc;\n'}use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::${/\.dyn_ref::/.test(used) ? '{JsCast, JsValue}' : 'JsValue'};

// U-5: the constants of the contract are the constants of the core.
${constants}

/// A failure on its way to the caller: the library class (an index of CLASSES), the message, the kind, the status and the
/// errno (B-4).
struct Fail {
    class: usize,
    message: String,
    kind: &'static str,
    status: Option<u16>,
    errno: Option<i32>,
}

thread_local! {
    /// B-4: the library classes, which the JavaScript entry hands over when it loads the module, in the order of the
    /// contract. A WebAssembly module runs on the thread that loaded it.
    static CLASSES: RefCell<Vec<Function>> = const { RefCell::new(Vec::new()) };
}

/// The instance of the library class of a failure, as the value that the call throws (B-4).
fn throw(fail: Fail) -> JsValue {
    let status = match fail.status {
        Some(status) => JsValue::from(u32::from(status)),
        None => JsValue::NULL,
    };
    let errno = match fail.errno {
        Some(errno) => JsValue::from(errno),
        None => JsValue::NULL,
    };
    let args = Array::of4(&JsValue::from_str(&fail.message), &JsValue::from_str(fail.kind), &status, &errno);
    CLASSES.with(|classes| match classes.borrow().get(fail.class) {
        Some(class) => match Reflect::construct(class, &args) {
            Ok(error) | Err(error) => error,
        },
        None => JsValue::from_str(&format!("B-4: the library classes are not registered: {}", fail.message)),
    })
}

/// E-1a: an error that the binding raises itself, in the class of its fixed category.
fn binding_error(error: BindingError) -> Fail {
    let class: usize = match error.category() {
        Category::Value => ${classIndex('value')},
        Category::Type => ${classIndex('type')},
        Category::Io => ${classIndex('io')},
        Category::Store => ${classIndex('store')},
        Category::Busy => ${classIndex('busy')},
        Category::Internal => ${classIndex('internal')},
    };
    Fail { class, message: error.to_string(), kind: error.kind(), status: error.status(), errno: error.errno() }
}
${coreErrorRust(model)}${raisesAssertions(model)}
/// B-7: a panic of the call reaches the caller as kind internal where the module unwinds; a module built with
/// panic=abort, the default of wasm32-unknown-unknown, traps instead (GN-18).
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
${state}${used}
/// The exports of the module. The expansion of wasm_bindgen calls Option::unwrap_or_default, so they are in one module
/// that holds that one allow (GN-18).
#[allow(clippy::disallowed_methods, reason = "GN-18: the wasm_bindgen expansion")]
mod exports {
    use super::*;

    /// B-4: the module keeps the library classes when it loads; a missing class fails the load.
    #[wasm_bindgen(js_name = "__register")]
    pub fn register(classes: Vec<Function>${model.objects.length === 0 ? '' : ', makers: Vec<Function>, readers: Vec<Function>'}) -> Result<(), JsValue> {
        if classes.len() != ${model.classes.length} {
            return Err(JsValue::from_str(&format!("B-4: ${model.classes.length} library classes, {} given", classes.len())));
        }
        CLASSES.with(|registered| registered.replace(classes));${registered}
        Ok(())
    }
${functions.replace(/\n(?=.)/g, '\n    ')}
    /// B-7: the entry point of the generated panic test.
    #[cfg(feature = "panic-test")]
    #[wasm_bindgen(js_name = "__panicTest")]
    pub fn panic_test() -> Result<(), JsValue> {
        guard(|| panic!("panic-test")).map_err(throw)
    }
}
`;
}

// ---- JavaScript and declarations ----

// T-2: a keyed map, whole or optional, which the JavaScript entry passes as the entries of a Map (GN-18).
const keyedType = (type: Type): boolean => {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  return typeof base === 'object' && ('keyed_map' in base || 'map' in base);
};

const jsBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';

function tsType(model: Model, type: Type, input: boolean): string {
  if (typeof type === 'string') {
    const map: Record<string, string> = { text: 'string', latin1: 'string', bool: 'boolean', uint: 'number', int: 'number', float: 'number', int64: input ? 'number | bigint' : 'bigint', bytes: 'Uint8Array', none: 'void', never: 'never' };
    return map[type] ?? 'unknown';
  }
  if ('list' in type) return input ? `Iterable<${tsType(model, type.list, input)}>` : `readonly (${tsType(model, type.list, input)})[]`;
  if ('map' in type) return `ReadonlyMap<string, ${tsType(model, type.map, input)}>`;
  if ('keyed_map' in type) return `ReadonlyMap<${type.key.map((k) => ({ int: 'number', text: 'string' })[k] ?? 'never').join(' | ')}, ${tsType(model, type.keyed_map, input)}>`;
  if ('optional' in type) return `${tsType(model, type.optional, input)} | null`;
  if ('tuple' in type) return `readonly [${type.tuple.map((t) => tsType(model, t, input)).join(', ')}]`;
  const unit = unitOf(model, type);
  return unit === undefined ? 'unknown' : langName('wasm', unit.name, 'class');
}

function indexMjs(model: Model): string {
  const glue = wasmGlue(model);
  const classes = model.classes.map((c) => `
export class ${c.name} extends globalThis.${jsBase(c.category)} {
  constructor(message, kind, status, errno) {
    super(message);
    Object.defineProperty(this, 'name', { value: ${jsString(c.name)}, configurable: true, writable: true });
    Object.defineProperties(this, {
      kind: { value: kind, enumerable: true },
      status: { value: status, enumerable: true },
      errno: { value: errno, enumerable: true },
    });
  }
}`).join('\n');
  const internal = model.classes.find((c) => c.category === 'internal')?.name ?? '';
  // G-7: the count of the arguments, the members of an options record, and a list parameter's iterable (T-7); then the
  // call of the module, with the handle of the instance first for a member that has a receiver (T-5).
  const checked = (fn: Fn, label: string, exported: string, wrap: (call: string) => string): string => {
    const count = fn.params.length;
    const lines = [`  if (args.length !== ${count}) {`, `    throw new TypeError(\`${label} takes ${count} argument${count === 1 ? '' : 's'}, \${args.length} given\`);`, '  }'];
    const passed = fn.params.map((p, i) => {
      if (fn.record !== undefined && p === fn.record.param) {
        const names = (fn.record.unit.fields ?? []).map((f) => langName('wasm', f.name, 'variable'));
        lines.push(`  checkRecord(${jsString(label)}, ${jsString(langName('wasm', p.name, 'variable'))}, args[${i}], [${names.map(jsString).join(', ')}]);`);
        return `args[${i}]`;
      }
      if (keyedType(p.type)) return `toEntries(args[${i}])`;
      return typeof p.type === 'object' && 'list' in p.type ? `toList(args[${i}])` : `args[${i}]`;
    });
    const call = `enter(${internal}, () => glue.${exported}(${[...(fn.receiver === undefined ? [] : ['this.#handle']), ...passed].join(', ')}))`;
    lines.push(`  ${wrap(keyedType(fn.returns) ? `fromEntries(${call})` : call)};`);
    return lines.join('\n');
  };
  const indent = (text: string, by: string): string => text.split('\n').map((line) => `${by}${line}`).join('\n');
  const fns = model.functions.map((fn) => {
    const name = langName('wasm', fn.member.name, 'callable');
    return `
export function ${name}(...args) {
${checked(fn, `${name}()`, name, (call) => `return ${call}`)}
}`;
  }).join('\n');
  // T-5: a class unit is a class of this module. An instance keeps the handle of its core value in a private field,
  // which no other code reads or forges; the module makes an instance through MAKE and reads a handle through the
  // functions that the class hands over below.
  const objects = model.objects.map((o) => {
    const cls = langName('wasm', o.unit.name, 'class');
    const constructor = o.members.find((fn) => fn.kind === 'constructor');
    const construct = constructor === undefined
      ? `    if (args[0] !== MAKE) throw new TypeError('${cls} has no public constructor');
    this.#handle = args[1];`
      : `    if (args[0] === MAKE) {
      this.#handle = args[1];
    } else {
${indent(checked(constructor, `new ${cls}()`, exportName(constructor), (call) => `this.#handle = ${call}`), '    ')}
    }`;
    const members = o.members.filter((fn) => fn.kind !== 'constructor').map((fn) => {
      const exported = exportName(fn);
      const direct = `enter(${internal}, () => glue.${exported}(this.#handle))`;
      if (fn.kind === 'iterate') return `
  [Symbol.iterator]() {
    return ${direct}[Symbol.iterator]();
  }`;
      const name = memberName('wasm', fn);
      if (fn.kind === 'property') return `
  get ${name}() {
    return ${direct};
  }`;
      // N-4: a hook is called by the language with the arguments of its protocol, which it does not read or count.
      if (fn.special !== undefined) return `
  ${name}() {
    return ${direct};
  }`;
      return `
  ${fn.kind === 'static' ? 'static ' : ''}${name}(...args) {
${indent(checked(fn, `${cls}.${name}()`, exported, (call) => `return ${call}`), '  ')}
  }`;
    });
    return `
export class ${cls} {
  #handle;

  constructor(...args) {
${construct}
    released.register(this, [glue.${`__${cls}_free`}, this.#handle]);
  }
${members.join('\n')}

  static {
    makers.push((handle) => new ${cls}(MAKE, handle));
    readers.push((value) => (typeof value === 'object' && value !== null && #handle in value ? value.#handle : undefined));
  }
}`;
  }).join('\n');
  const objectState = model.objects.length === 0 ? '' : `
// T-5: the module makes an instance of a class with this value as the first argument of its constructor.
const MAKE = Symbol('make');
// T-5: for each class in contract order, how the module makes an instance around a handle and reads the handle of one.
const makers = [];
const readers = [];
// T-5: the value of an instance that the engine collected is dropped. A trap in the drop is kept by state.mjs, so every
// later call is kind internal; the callback of a registry has no caller to throw to.
const released = new FinalizationRegistry(([free, handle]) => {
  if (broken()) return;
  try {
    enter(${internal}, () => free(handle));
  } catch {
    // kept by state.mjs
  }
});
`;
  const constants = model.constants.map((c) => `export const ${langName('wasm', c.member.name, 'constant')} = ${JSON.stringify(c.member.value)};`).join('\n');
  return `${header('//')}
import load, * as glue from './${glue}.js';
import { ${model.objects.length === 0 ? 'enter' : 'broken, enter'} } from './state.mjs';
${classes}
${objectState}${objects === '' ? '' : `${objects}\n`}
// GW-5: the import loads the WebAssembly module (top-level await), so no export runs before it is ready. A file: URL
// is read from the file system (Node, through the subpath ./wasm), any other URL is fetched (a browser).
const url = new URL('./${glue}_bg.wasm', import.meta.url);
const source = url.protocol === 'file:' ? (await import('node:fs/promises')).readFile(url) : fetch(url);
await load({ module_or_path: await source });
// B-4: the module throws instances of these classes; it keeps them from here on.
glue.__register([${model.classes.map((c) => c.name).join(', ')}]${model.objects.length === 0 ? '' : ', makers, readers'});

// T-7: a list parameter takes any iterable but a string; the module judges anything else.
function toList(value) {
  if (typeof value !== 'string' && value !== null && value !== undefined && typeof value[Symbol.iterator] === 'function') {
    return Array.from(value);
  }
  return value;
}

// T-2: a keyed map crosses as its entries, [key, value], which only a Map gives: null stays the absence, and any other
// value reaches the module as undefined, which it refuses as kind invalid_argument_type (an array of pairs is not a Map).
function toEntries(value) {
  if (value instanceof Map) return Array.from(value);
  return value === null ? null : undefined;
}

// T-2: the entries of a keyed map, as a Map; null is the absence.
function fromEntries(value) {
  return value === null ? null : new Map(value);
}

// G-7, T-4: an options record has only the names of its fields, and a field whose value is undefined is absent; a value
// that is not an object is judged by the module.
function checkRecord(fn, name, record, fields) {
  if (typeof record !== 'object' || record === null) return;
  for (const key of Object.keys(record)) {
    if (!fields.includes(key)) throw new TypeError(\`\${fn}: \${name} has no member \${key}\`);
  }
  for (const field of fields) {
    if (record[field] === undefined) throw new TypeError(\`\${fn}: \${name} lacks the member \${field}\`);
  }
}
${fns}

${constants}
`;
}

// GW-7: the state of the instance, a module of its own that the package does not export, so the generated B-7 test can
// run the panic entry point under the same rule. A trap (WebAssembly.RuntimeError: a panic with panic=abort, the
// default of wasm32-unknown-unknown) leaves the instance unusable: it becomes kind internal, the instance is marked
// broken, and every later call fails with the same kind. The module is not instantiated again, because the state that
// earlier handles point to would be gone.
function stateMjs(): string {
  return `${header('//')}
let trapped = null;

// Whether a trap broke the instance.
export const broken = () => trapped !== null;

// Runs a call of the module; Internal is the library class of category internal.
export function enter(Internal, call) {
  if (trapped !== null) throw new Internal(trapped, 'internal', null, null);
  try {
    return call();
  } catch (error) {
    if (!(error instanceof WebAssembly.RuntimeError)) throw error;
    trapped = \`internal error: the WebAssembly instance trapped and runs no further call: \${error.message}\`;
    throw new Internal(trapped, 'internal', null, null);
  }
}
`;
}

function indexDts(model: Model): string {
  const classes = model.classes.map((c) => `
/** The errors of category ${c.category} (E-2). */
export declare class ${c.name} extends ${jsBase(c.category)} {
  readonly kind: string;
  readonly status: number | null;
  readonly errno: number | null;
}`).join('\n');
  const enums = model.enums.map((u) => `
/** T-6. */
export type ${langName('wasm', u.name, 'class')} = ${(u.variants ?? []).map((v) => jsString(v.value)).join(' | ')};`).join('\n');
  const records = model.records.map((u) => `
/** T-4: the options record; a member whose value is undefined is absent. */
export interface ${langName('wasm', u.name, 'class')} {
${(u.fields ?? []).map((f) => `  readonly ${langName('wasm', f.name, 'variable')}: ${tsType(model, f.type, true)};`).join('\n')}
}`).join('\n');
  const fns = model.functions.map((fn) => {
    const params = fn.params.map((p) => `${langName('wasm', p.name, 'variable')}: ${tsType(model, p.type, true)}`);
    return `export declare function ${langName('wasm', fn.member.name, 'callable')}(${params.join(', ')}): ${tsType(model, fn.returns, false)};`;
  }).join('\n');
  const constants = model.constants.map((c) => `export declare const ${langName('wasm', c.member.name, 'constant')}: ${JSON.stringify(c.member.value)};`).join('\n');
  const params = (fn: Fn): string => fn.params.map((p) => `${langName('wasm', p.name, 'variable')}: ${tsType(model, p.type, true)}`).join(', ');
  const objects = model.objects.map((o) => {
    const lines = o.members.map((fn) => {
      const name = memberName('wasm', fn);
      if (fn.kind === 'constructor') return `  constructor(${params(fn)});`;
      if (fn.kind === 'static') return `  static ${name}(${params(fn)}): ${tsType(model, fn.returns, false)};`;
      if (fn.kind === 'property') return `  get ${name}(): ${tsType(model, fn.returns, false)};`;
      if (fn.kind === 'iterate') {
        const yields = fn.yields ?? { value: 'none' };
        const item = yields.key === undefined ? tsType(model, yields.value, false) : `[${tsType(model, yields.key, false)}, ${tsType(model, yields.value, false)}]`;
        return `  [Symbol.iterator](): IterableIterator<${item}>;`;
      }
      return `  ${name}(${params(fn)}): ${tsType(model, fn.returns, false)};`;
    });
    if (!o.constructible) lines.unshift('  private constructor();');
    return `
/** T-5. */
export declare class ${langName('wasm', o.unit.name, 'class')} {
${lines.join('\n')}
}`;
  }).join('\n');
  return `${header('//')}
${classes}
${enums}
${records}${objects === '' ? '' : `\n${objects}`}

${fns}

${constants}
`;
}

export function wasm(model: Model, files: Files): void {
  // G-4: a record of another repository (T-3), a callback unit (U-3) and a value alias (U-7) are not generated for WASM yet.
  const foreignAlias = model.aliases.find((a) => a.library !== undefined);
  if (foreignAlias !== undefined) throw new Unsupported(`${foreignAlias.library ?? ''}.${foreignAlias.unit.id}: a value alias of another repository is not generated for WASM yet`);
  const [alias] = model.aliases;
  if (alias !== undefined) throw new Unsupported(`${alias.unit.id}: a value alias is not generated for WASM yet`);
  const [foreign] = model.foreignRecords;
  if (foreign !== undefined) throw new Unsupported(`${foreign.library}.${foreign.unit.id}: a record of another repository is not generated for WASM yet`);
  const [callback] = model.callbacks;
  if (callback !== undefined) throw new Unsupported(`${callback.unit.id}: a callback unit is not generated for WASM yet`);
  // L-2a: a host Node package keeps its binding crate in native/, where the WASM crate has no place yet.
  if ((model.contract.packages['node'] as { host?: boolean } | undefined)?.host === true) throw new Unsupported('the WASM binding of a host Node package is not generated yet (L-2a)');
  files.set(`${ROOT}/lib.rs`, libRust(model));
  files.set(`${ROOT}/index.mjs`, indexMjs(model));
  files.set(`${ROOT}/index.d.ts`, indexDts(model));
  files.set(`${ROOT}/state.mjs`, stateMjs());
  files.set(`${ROOT}/tests/generated.test.mjs`, wasmTests(model));
}
