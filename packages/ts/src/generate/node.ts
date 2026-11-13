// The Node binding (napi-rs 3): the Rust addon, the JavaScript package around it (CommonJS and ESM entries, error
// classes, the argument count and name checks of G-7), the declarations and the generated tests (G-5).

import type { Type, Unit } from '../contract.ts';
import { NODE_HOST, aliasNode, foreignFailureNode } from './alias_node.ts';
import { defaultAsserts, declaredValue } from './defaults.ts';
import { type Arg, type CallbackUnit, type Fn, type Model, Unsupported, argType, errorProperties, byValue, type ObjectClass, coreCallArgs, aliasKindsRust, aliasesWithKinds, faultRust, armedCall, waitsIo, withFaults, heldNew, heldParam, heldType, langName, libraryOf, lockLines, memberName, resultLet, aliasOf, objectUnit, POISON_ENTRY, recordFn, takesHeld, takesNested, borrowedItem, rustField, rustType, rustVariant, unitOf } from './model.ts';
import { nodeTests } from './tests_node.ts';
import { raisesAssertions } from './raises.ts';
import { type Files, header, jsString, rustString, closure, optionRef, usedHelpers, WIDEN } from './text.ts';

const ROOT = 'packages/ts/generated';

export const addonBase = (model: Model): string => {
  const npm = (model.contract.packages['node'] as { package: string }).package;
  return npm.slice(npm.indexOf('/') + 1);
};

// ---- Rust ----

function convertIn(model: Model, type: Type, value: string, subject: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'in_text', latin1: 'in_latin1', bool: 'in_bool', uint: 'in_uint', int: 'in_int', int64: 'in_int64', float: 'in_float', bytes: 'in_bytes', source: 'in_source' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no Node input conversion for ${type}`);
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
  if (unit?.kind === 'enum') return `in_${rustField(unit.name)}(${value}, ${subject})`;
  if (unit !== undefined && (unit.origin === 'callback' || objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined)) return `in_${recordFn(unit, aliasOf(model, type)?.library)}(env, ${value}, ${subject})`;
  if (unit?.kind === 'record') return `in_${recordFn(unit, libraryOf(type))}(${value}, ${subject})`;
  throw new Unsupported(`no Node input conversion for ${JSON.stringify(type)}`);
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    // T-2 never: the core's Infallible has no value, so the call has failed before.
    if (type === 'never') return `match ${value} {}`;
    if (type === 'none') return 'out_none(env)';
    const fn: Record<string, string> = { text: 'out_text', latin1: 'out_latin1', bool: 'out_bool', uint: 'out_uint', int: 'out_int', int64: 'out_int64', float: 'out_float', bytes: 'out_bytes' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no Node output conversion for ${type}`);
    return `${name}(env, ${value})`;
  }
  if ('list' in type) return `out_list(env, ${value}, ${closure(['env', 'item'], convertOut(model, type.list, 'item'))})`;
  // The value of a keyed map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('map' in type) return `out_map(env, ${value}, |env, item| ${convertOut(model, type.map, 'item')})`;
  if ('keyed_map' in type) return `out_keyed_map(env, ${value}, |env, item| ${convertOut(model, type.keyed_map, 'item')})`;
  if ('optional' in type) return `out_optional(env, ${optionRef(value)}, ${closure(['env', 'value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) {
    const parts = type.tuple.map((t, i) => `${convertOut(model, t, `&${value}.${i}`)}?`);
    return `out_tuple(env, vec![${parts.join(', ')}])`;
  }
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `out_${rustField(unit.name)}(env, ${value})`;
  if (unit?.kind === 'record') return `out_${recordFn(unit, libraryOf(type))}(env, ${value})`;
  if ((objectUnit(model, type) !== undefined || aliasOf(model, type) !== undefined) && unit !== undefined) return `out_${recordFn(unit, aliasOf(model, type)?.library)}(env, ${value})`;
  throw new Unsupported(`no Node output conversion for ${JSON.stringify(type)}`);
}

const HELPERS = `
/// A failure of napi itself is kind internal (P-2).
fn internal(error: napi::Error) -> Fail {
    binding_error(BindingError::Internal { detail: error.to_string() })
}

fn type_error(subject: &str, expected: &str) -> Fail {
    binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: expected.to_owned() })
}

/// The UTF-16 code units of a string, without the terminating NUL that napi writes.
fn units(value: Unknown<'_>, subject: &str) -> Result<Vec<u16>, Fail> {
    if value.get_type().map_err(internal)? != ValueType::String {
        return Err(type_error(subject, "string"));
    }
    let text: JsString<'_> = unsafe { value.cast() }.map_err(internal)?;
    let utf16 = text.into_utf16().map_err(internal)?;
    match utf16.as_slice().split_last() {
        Some((_nul, units)) => Ok(units.to_vec()),
        None => Ok(Vec::new()),
    }
}

/// B-3: text is a string without an unpaired surrogate.
fn in_text(value: Unknown<'_>, subject: &str) -> Result<String, Fail> {
    String::from_utf16(&units(value, subject)?)
        .map_err(|_unpaired| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::UnpairedSurrogate }))
}

/// B-3, T-1 latin1: a string whose code units are U+0000 to U+00FF, one byte each.
fn in_latin1(value: Unknown<'_>, subject: &str) -> Result<Vec<u8>, Fail> {
    units(value, subject)?
        .into_iter()
        .map(|unit| u8::try_from(unit).map_err(|_above| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::AboveLatin1 })))
        .collect()
}

/// T-7: bytes are a Uint8Array; a typed array of another element type, or any other value, is refused.
fn in_bytes(value: Unknown<'_>, subject: &str) -> Result<Vec<u8>, Fail> {
    if !value.is_typedarray().map_err(internal)? {
        return Err(type_error(subject, "Uint8Array"));
    }
    match unsafe { value.cast::<Uint8Array>() } {
        Ok(bytes) => Ok(bytes.to_vec()),
        Err(_other) => Err(type_error(subject, "Uint8Array")),
    }
}

/// T-1 source: a string, as its UTF-8 (B-3), or the bytes of a Uint8Array.
fn in_source(value: Unknown<'_>, subject: &str) -> Result<Vec<u8>, Fail> {
    if value.get_type().map_err(internal)? == ValueType::String {
        return in_text(value, subject).map(String::into_bytes);
    }
    in_bytes(value, subject).map_err(|_other| type_error(subject, "string or Uint8Array"))
}

/// U-2: undefined is an argument that the caller left out, whose value the core decides; any other value is converted.
fn in_default<'env, T>(value: Unknown<'env>, item: impl FnOnce(Unknown<'env>) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    if value.get_type().map_err(internal)? == ValueType::Undefined {
        return Ok(None);
    }
    item(value).map(Some)
}

/// T-7: bytes leave as a Uint8Array of their copy.
fn out_bytes<'env>(env: &'env Env, value: impl AsRef<[u8]>) -> Result<Unknown<'env>, Fail> {
    ToNapiValue::into_unknown(Uint8Array::new(value.as_ref().to_vec()), env).map_err(internal)
}

fn in_bool(value: Unknown<'_>, subject: &str) -> Result<bool, Fail> {
    if value.get_type().map_err(internal)? != ValueType::Boolean {
        return Err(type_error(subject, "boolean"));
    }
    unsafe { value.cast::<bool>() }.map_err(internal)
}

/// B-2: a number that is a safe integer; NaN, the infinities, fractions and any other value are kind invalid_number.
fn safe_integer(value: Unknown<'_>, subject: &str, expected: NumberType) -> Result<i64, Fail> {
    let invalid = || binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected });
    if value.get_type().map_err(internal)? != ValueType::Number {
        return Err(invalid());
    }
    let double = unsafe { value.cast::<f64>() }.map_err(internal)?;
    if !double.is_finite() || double.fract() != 0.0 || double.abs() > 9_007_199_254_740_991.0 {
        return Err(invalid());
    }
    unsafe { value.cast::<i64>() }.map_err(internal)
}

fn in_uint(value: Unknown<'_>, subject: &str) -> Result<u64, Fail> {
    let integer = safe_integer(value, subject, NumberType::Uint)?;
    u64::try_from(integer).map_err(|_negative| binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint }))
}

fn in_int(value: Unknown<'_>, subject: &str) -> Result<i64, Fail> {
    safe_integer(value, subject, NumberType::Int)
}

/// T-1 int64: a bigint of the range of i64, or a number of the safe integers (B-2).
fn in_int64(value: Unknown<'_>, subject: &str) -> Result<i64, Fail> {
    if value.get_type().map_err(internal)? != ValueType::BigInt {
        return safe_integer(value, subject, NumberType::Int);
    }
    let big = unsafe { value.cast::<BigInt>() }.map_err(internal)?;
    match big.get_i64() {
        (integer, true) => Ok(integer),
        (_truncated, false) => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int })),
    }
}

fn in_float(value: Unknown<'_>, subject: &str) -> Result<f64, Fail> {
    if value.get_type().map_err(internal)? != ValueType::Number {
        return Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Float }));
    }
    unsafe { value.cast::<f64>() }.map_err(internal)
}

/// T-7: an array; the JavaScript entry turns any other iterable but a string into one.
fn in_list<'env, T>(value: Unknown<'env>, subject: &str, item: impl Fn(Unknown<'env>) -> Result<T, Fail>) -> Result<Vec<T>, Fail> {
    if !value.is_array().map_err(internal)? {
        return Err(type_error(subject, "Iterable"));
    }
    let array: Array<'env> = unsafe { value.cast() }.map_err(internal)?;
    let mut items = Vec::new();
    for index in 0..array.len() {
        let Some(value) = array.get::<Unknown<'env>>(index).map_err(internal)? else {
            return Err(binding_error(BindingError::Internal { detail: String::from("an array without its item") }));
        };
        items.push(item(value)?);
    }
    Ok(items)
}

/// T-7: null is the absence; any other value is converted.
fn in_optional<'env, T>(value: Unknown<'env>, item: impl FnOnce(Unknown<'env>) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    if value.get_type().map_err(internal)? == ValueType::Null {
        return Ok(None);
    }
    item(value).map(Some)
}

/// T-4: a member of the options record; the JavaScript entry checks its names and that it is present.
fn member<'env>(record: Unknown<'env>, name: &str, subject: &str) -> Result<Unknown<'env>, Fail> {
    if record.get_type().map_err(internal)? != ValueType::Object {
        return Err(type_error(subject, "object"));
    }
    let object: Object<'env> = unsafe { record.cast() }.map_err(internal)?;
    object.get_named_property::<Unknown<'env>>(name).map_err(internal)
}

/// U-2 {empty: "object"}: a member of an options record that may be left out; a record that is left out (undefined)
/// leaves out each of its members.
fn member_or_undefined<'env>(record: Unknown<'env>, name: &str, subject: &str) -> Result<Unknown<'env>, Fail> {
    if record.get_type().map_err(internal)? == ValueType::Undefined {
        return Ok(record);
    }
    member(record, name, subject)
}

fn out_text<'env>(env: &'env Env, value: impl AsRef<str>) -> Result<Unknown<'env>, Fail> {
    Ok(env.create_string(value.as_ref()).map_err(internal)?.to_unknown())
}

/// T-1 latin1: each byte is one character.
fn out_latin1<'env>(env: &'env Env, value: impl AsRef<[u8]>) -> Result<Unknown<'env>, Fail> {
    let text: String = value.as_ref().iter().map(|byte| char::from(*byte)).collect();
    out_text(env, text)
}

fn out_bool<'env>(env: &'env Env, value: impl Borrow<bool>) -> Result<Unknown<'env>, Fail> {
    ToNapiValue::into_unknown(*value.borrow(), env).map_err(internal)
}

/// B-2: a number leaves only as a safe integer; a larger one is kind internal.
fn out_int<'env>(env: &'env Env, value: impl WideInt) -> Result<Unknown<'env>, Fail> {
    let value = value.widen_int();
    if value.abs() > 9_007_199_254_740_991 {
        return Err(binding_error(BindingError::Internal { detail: format!("{value} is not a safe integer") }));
    }
    Ok(env.create_int64(value).map_err(internal)?.to_unknown())
}

/// T-1 int64: a bigint, so that the whole range of i64 leaves.
fn out_int64<'env>(env: &'env Env, value: impl WideInt) -> Result<Unknown<'env>, Fail> {
    ToNapiValue::into_unknown(BigInt::from(value.widen_int()), env).map_err(internal)
}

fn out_uint<'env>(env: &'env Env, value: impl WideUint) -> Result<Unknown<'env>, Fail> {
    let value = value.widen_uint();
    match i64::try_from(value) {
        Ok(value) => out_int(env, value),
        Err(_large) => Err(binding_error(BindingError::Internal { detail: format!("{value} is not a safe integer") })),
    }
}

fn out_float<'env>(env: &'env Env, value: impl Borrow<f64>) -> Result<Unknown<'env>, Fail> {
    Ok(env.create_double(*value.borrow()).map_err(internal)?.to_unknown())
}

fn out_none(env: &Env) -> Result<Unknown<'_>, Fail> {
    ToNapiValue::into_unknown((), env).map_err(internal)
}

fn out_null(env: &Env) -> Result<Unknown<'_>, Fail> {
    ToNapiValue::into_unknown(Null, env).map_err(internal)
}

fn out_list<'env, T>(env: &'env Env, value: impl IntoIterator<Item = T>, item: impl Fn(&'env Env, T) -> Result<Unknown<'env>, Fail>) -> Result<Unknown<'env>, Fail> {
    let items = value.into_iter().map(|value| item(env, value)).collect::<Result<Vec<_>, Fail>>()?;
    out_tuple(env, items)
}

/// T-2: the entries of a Map, which the JavaScript entry turns into an array of [key, value] (a map is a whole
/// parameter, GN-12): each key a string; any other key is kind invalid_argument_type.
fn in_map<'env, T>(value: Unknown<'env>, subject: &str, item: impl Fn(Unknown<'env>) -> Result<T, Fail>) -> Result<binding_core::OrderedMap<T>, Fail> {
    let entries = in_list(value, subject, |entry| in_list(entry, subject, Ok))
        .map_err(|_not_entries| type_error(subject, "a Map whose keys are strings"))?;
    let mut map = binding_core::OrderedMap::new();
    for entry in entries {
        let [key, value] = <[Unknown<'env>; 2]>::try_from(entry).map_err(|_not_a_pair| type_error(subject, "a Map whose keys are strings"))?;
        if key.get_type().map_err(internal)? != ValueType::String {
            return Err(type_error(subject, "a Map whose keys are strings"));
        }
        if map.insert(in_text(key, subject)?, item(value)?).is_some() {
            return Err(binding_error(BindingError::Internal { detail: String::from("a Map gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a map, owned or borrowed, as an array of [key, value], which the JavaScript entry makes a Map.
fn out_map<'env, T>(
    env: &'env Env,
    value: impl Borrow<binding_core::OrderedMap<T>>,
    item: impl Fn(&'env Env, &T) -> Result<Unknown<'env>, Fail>,
) -> Result<Unknown<'env>, Fail> {
    let mut entries = Vec::new();
    for (key, value) in value.borrow().iter() {
        entries.push(out_tuple(env, vec![out_text(env, key)?, item(env, value)?])?);
    }
    out_tuple(env, entries)
}

/// T-2, U-7 (c): the entries of a Map, which the JavaScript entry turns into an array of [key, value] (a keyed map is
/// a whole parameter, GN-12): a key that is a safe integer or a string of a kind that the contract lists; any other key
/// is kind invalid_argument_type.
fn in_keyed_map<'env, T>(
    value: Unknown<'env>,
    subject: &str,
    kinds: &[u8],
    expected: &str,
    item: impl Fn(Unknown<'env>) -> Result<T, Fail>,
) -> Result<binding_core::KeyedMap<T>, Fail> {
    let entries = in_list(value, subject, |entry| in_list(entry, subject, Ok))
        .map_err(|_not_entries| type_error(subject, expected))?;
    let mut map = binding_core::KeyedMap::new();
    for entry in entries {
        let [key, value] = <[Unknown<'env>; 2]>::try_from(entry).map_err(|_not_a_pair| type_error(subject, expected))?;
        let (tag, key) = match key.get_type().map_err(internal)? {
            // GN-12a: a number key of a listed int is a safe integer, else kind invalid_number.
            ValueType::Number if kinds.contains(&0) => (0, binding_core::Key::Int(safe_integer(key, subject, NumberType::Int)?)),
            ValueType::String => (2, binding_core::Key::Text(in_text(key, subject)?)),
            _ => return Err(type_error(subject, expected)),
        };
        if !kinds.contains(&tag) {
            return Err(type_error(subject, expected));
        }
        if map.insert(key, item(value)?).is_some() {
            return Err(binding_error(BindingError::Internal { detail: String::from("a Map gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a keyed map, owned or borrowed, as an array of [key, value], which the JavaScript entry makes a Map; an
/// integer key leaves as a number (a safe integer, B-2) and a byte string key, which no Node contract lists, is kind
/// internal.
fn out_keyed_map<'env, T>(
    env: &'env Env,
    value: impl Borrow<binding_core::KeyedMap<T>>,
    item: impl Fn(&'env Env, &T) -> Result<Unknown<'env>, Fail>,
) -> Result<Unknown<'env>, Fail> {
    let mut entries = Vec::new();
    for (key, value) in value.borrow().iter() {
        let key = match key {
            binding_core::Key::Int(integer) => out_int(env, integer)?,
            binding_core::Key::Text(text) => out_text(env, text)?,
            binding_core::Key::Bytes(_bytes) => return Err(binding_error(BindingError::Internal { detail: String::from("a byte string key of a keyed map") })),
        };
        entries.push(out_tuple(env, vec![key, item(env, value)?])?);
    }
    out_tuple(env, entries)
}

fn out_tuple<'env>(env: &'env Env, items: Vec<Unknown<'env>>) -> Result<Unknown<'env>, Fail> {
    Ok(Array::from_vec(env, items).map_err(internal)?.to_unknown())
}

fn out_optional<'env, T>(env: &'env Env, value: Option<T>, item: impl FnOnce(&'env Env, T) -> Result<Unknown<'env>, Fail>) -> Result<Unknown<'env>, Fail> {
    match value {
        Some(value) => item(env, value),
        None => out_null(env),
    }
}
`;

function enumRust(unit: Unit): string {
  const name = rustField(unit.name);
  const core = unit.core_type ?? '';
  const jsName = langName('node', unit.name, 'class');
  const arms = (unit.variants ?? []).map((v) => `        ${rustString(v.value)} => Ok(${core}::${rustVariant(v.name)}),`).join('\n');
  const outArms = (unit.variants ?? []).map((v) => `        ${core}::${rustVariant(v.name)} => ${rustString(v.value)},`).join('\n');
  return `
/// T-6: a value of ${jsName} is one of its strings.
fn in_${name}(value: Unknown<'_>, subject: &str) -> Result<${core}, Fail> {
    let text = in_text(value, subject)?;
    match text.as_str() {
${arms}
        _ => Err(type_error(subject, ${rustString(jsName)})),
    }
}

fn out_${name}(env: &Env, value: impl Borrow<${core}>) -> Result<Unknown<'_>, Fail> {
    let text = match value.borrow() {
${outArms}
    };
    out_text(env, String::from(text))
}
`;
}

// T-4: the result form of a record, a plain object with a member per field.
function recordRust(model: Model, unit: Unit, library?: string): string {
  const name = recordFn(unit, library);
  const core = unit.core_type ?? '';
  const fields = unit.fields ?? [];
  const reads = fields.map((f) => {
    const member = langName('node', f.name, 'variable');
    return `    let ${rustField(f.name)}: ${rustType(model, f.type)} = ${convertIn(model, f.type, `member(value, ${rustString(member)}, subject)?`, rustString(member))}?;`;
  });
  const writes = fields.map((f) => `    object.set_named_property(${rustString(langName('node', f.name, 'variable'))}, ${convertOut(model, f.type, `${byValue(model, f.type) ? "" : "&"}value.${rustField(f.name)}`)}?).map_err(internal)?;`);
  return `
/// T-4: a value of the record ${langName('node', unit.name, 'class')} is an object with a member per field, judged as it enters (T-8).
fn in_${name}(value: Unknown<'_>, subject: &str) -> Result<${core}, Fail> {
${reads.join('\n')}
    Ok(${core} { ${fields.map((f) => rustField(f.name)).join(', ')} })
}

fn out_${name}<'env>(env: &'env Env, value: impl Borrow<${core}>) -> Result<Unknown<'env>, Fail> {
    let value = value.borrow();
    let mut object = Object::new(env).map_err(internal)?;
${writes.join('\n')}
    Ok(object.to_unknown())
}
`;
}

const fieldInit = (field: string, variable: string): string => (field === variable ? field : `${field}: ${variable}`);

// N-4 iterate: the addon's __iterate gives the items, or [key, value] for the entries, as an array converted when the
// iteration starts (a snapshot of the class's value); the JavaScript entry makes it the class's Symbol.iterator.
function iterateRust(model: Model, fn: Fn): string {
  const yields = fn.yields ?? { value: 'none' };
  const item = (type: Type, value: string): string => `${convertOut(model, type, borrowedItem(model, type, value))}?`;
  const body = yields.key === undefined
    ? `                items.push(${item(yields.value, 'item')});`
    : `                let (key, value) = item;
                items.push(out_tuple(env, vec![${item(yields.key, 'key')}, ${item(yields.value, 'value')}])?);`;
  return `
    #[napi(js_name = "__iterate", enumerable = false)]
    pub fn iterate<'env>(&self, env: &'env Env) -> napi::Result<Unknown<'env>> {
        guard(|| {${locks(model, fn).map((l) => `\n    ${l}`).join('')}
            let mut items = Vec::new();
            for item in ${armedCall(model, fn, `${fn.corePath}(${coreCallArgs(model, fn, () => '', 'self.inner').join(', ')})`)} {
${body}
            }
            out_tuple(env, items)
        })
        .map_err(|fail| throw(env, fail))
    }
`;
}

// GN-6h: the name of a class in the message of kind busy and of a poisoned object.
const classLabel = (object: ObjectClass): string => langName('node', object.unit.name, 'class');

// GN-6h: the lines that take the locks of the places of a call.
const locks = (model: Model, fn: Fn): string[] => lockLines(model, fn, (p) => rustField(p.name), 'self.inner', 'binding_error', classLabel);

const functionRust = (model: Model, fn: Fn): string => withFaults(model, fn, entryRust(model, fn));

function entryRust(model: Model, fn: Fn): string {
  if (fn.kind === 'iterate') return iterateRust(model, fn);
  const jsName = memberName('node', fn);
  const params = fn.params.map((p) => `, ${rustField(p.name)}: Unknown<'env>`).join('');
  const lines: string[] = [];
  // U-2: an argument that may be left out is undefined when it is, and its variable an Option.
  const converted = (arg: Arg | undefined, type: Type, raw: string, subject: string): string =>
    arg?.default === undefined ? convertIn(model, type, raw, subject) : `in_default(${raw}, ${closure(['value'], convertIn(model, type, 'value', subject))})`;
  for (const parameter of fn.params) {
    const variable = rustField(parameter.name);
    if (fn.record !== undefined && parameter === fn.record.param) {
      for (const field of fn.record.unit.fields ?? []) {
        const name = langName('node', field.name, 'variable');
        const arg = fn.args.find((a) => a.field && a.name === field.name);
        const raw = `${parameter.default === undefined ? 'member' : 'member_or_undefined'}(${variable}, ${rustString(name)}, ${rustString(langName('node', parameter.name, 'variable'))})?`;
        lines.push(`        let ${rustField(field.name)}: ${arg === undefined ? rustType(model, field.type) : argType(model, arg)} = ${converted(arg, field.type, raw, rustString(name))}?;`);
      }
      const recordType = fn.record.unit.core_type ?? '';
      const fields = (fn.record.unit.fields ?? []).map((f) => fieldInit(rustField(f.name), rustField(f.name))).join(', ');
      lines.push(`        let ${variable}: ${recordType} = ${recordType} { ${fields} };`);
    } else {
      const arg = fn.args.find((a) => !a.field && a.name === parameter.name);
      const held = heldParam(model, parameter.type);
      const subject = rustString(langName('node', parameter.name, 'variable'));
      lines.push(held === undefined
        ? `        let ${variable}: ${arg === undefined ? rustType(model, parameter.type) : argType(model, arg)} = ${converted(arg, parameter.type, variable, subject)}?;`
        : `        let ${variable} = held_${rustField(held.unit.name)}(env, ${variable}, ${subject})?;`);
    }
  }
  lines.push(...locks(model, fn));
  const core = `${fn.corePath}(${coreCallArgs(model, fn, (p) => rustField(p.name), 'self.inner').join(', ')})`;
  const call = armedCall(model, fn, core);
  if (waitsIo(fn)) {
    // GN-6m: the arguments are converted and the locks and the arming taken on the JavaScript thread; the core call
    // runs on the libuv pool, and its result is converted on the JavaScript thread.
    const faults = model.faults.length > 0;
    if (faults) lines.push(`        let faults = faults_of(${JSON.stringify(fn.member.id)});`);
    const armed = faults ? `faults.run(|| ${core})` : core;
    const work = fn.fallible ? `${armed}.map_err(${fn.failure ? 'failure_error' : 'core_error'})` : `Ok(${armed})`;
    const give = convertOut(model, fn.returns, 'result');
    lines.push(`        waiting(env, move || ${work}, |env, ${/\bresult\b/.test(give) ? 'result' : '_result'}| ${give})`);
  } else if (fn.fallible) {
    lines.push(`        ${resultLet(fn)} = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(${fn.failure ? 'failure_error' : 'core_error'}(error)),\n        };`);
  } else {
    // E-1c: a core that returns nothing is bound as the unit, so a Result that it returns does not compile.
    lines.push(`        ${resultLet(fn)} = ${call};`);
  }
  // T-5: napi-rs keeps the classes it parsed in the state of its macro process, which rustc does not keep between the
  // expansions of a struct and its impl, so a constructor in the impl fails to find its struct. The constructor is the
  // static __new instead, which makes the instance as any static member does, and the JavaScript entry wraps the class
  // in a Proxy whose construct calls it.
  const jsMember = fn.kind === 'constructor' ? 'new' : jsName;
  if (!waitsIo(fn)) lines.push(`        ${convertOut(model, fn.returns, 'result')}`);
  if (fn.kind === 'function') {
    return `
#[napi(js_name = ${rustString(jsName)})]
pub fn ${rustField(fn.member.name)}<'env>(env: &'env Env${params}) -> napi::Result<Unknown<'env>> {
    guard(|| {
${lines.join('\n')}
    })
    .map_err(|fail| throw(env, fail))
}
`;
  }
  // G-7: napi-rs defines a class's methods as not configurable, so a method that takes arguments is the addon's
  // __<name>, not enumerable and not declared, and the JavaScript entry defines <name>, which checks the arguments and
  // calls it.
  // N-4: a stringify or a to_json is the addon's method under the name of the hook: the language calls it with the
  // arguments of its protocol (JSON.stringify passes the key to toJSON), which the method does not read, so the entry
  // does not count them.
  const attribute =
    fn.kind === 'property'
      ? `#[napi(getter, js_name = ${rustString(jsName)})]`
      : `#[napi(js_name = ${rustString(fn.special === undefined ? `__${jsMember}` : jsName)}, enumerable = false)]`;
  const self = fn.receiver === undefined ? '' : '&self, ';
  return `
    ${attribute}
    pub fn ${fn.kind === 'constructor' ? 'construct' : rustField(fn.member.name)}<'env>(${self}env: &'env Env${params}) -> napi::Result<Unknown<'env>> {
        guard(|| {
${lines.map((l) => `    ${l}`).join('\n')}
        })
        .map_err(|fail| throw(env, fail))
    }
`;
}

// GN-6m: the work of a member that waits, which runs on the libuv pool. Its result, or its failure, is converted on the
// JavaScript thread; a panic of the work is a failure of kind internal (B-7).
const WAITING = `
/// GN-6m: starts the work of a member that waits on the libuv pool and gives its promise.
fn waiting<'env, W, O>(env: &'env Env, work: W, give: for<'e> fn(&'e Env, O) -> Result<Unknown<'e>, Fail>) -> Result<Unknown<'env>, Fail>
where
    W: FnOnce() -> Result<O, Fail> + Send + 'env,
    O: Send + 'static,
{
    let promise = env.spawn(Waiting { work: Some(work), give }).map_err(internal)?;
    Ok(promise.promise_object().to_unknown())
}
/// GN-6m: the work of a call that waits and the conversion of its result.
struct Waiting<W, O> {
    work: Option<W>,
    give: for<'e> fn(&'e Env, O) -> Result<Unknown<'e>, Fail>,
}
impl<'env, W, O> ScopedTask<'env> for Waiting<W, O>
where
    W: FnOnce() -> Result<O, Fail> + Send,
    O: Send + 'static,
{
    type Output = Result<O, Fail>;
    type JsValue = Unknown<'env>;
    fn compute(&mut self) -> napi::Result<Self::Output> {
        let work = self.work.take().ok_or_else(|| napi::Error::from_reason("GN-6m: the work of a call runs once"))?;
        Ok(guard(work))
    }
    fn resolve(&mut self, env: &'env Env, output: Self::Output) -> napi::Result<Unknown<'env>> {
        output.and_then(|value| (self.give)(env, value)).map_err(|fail| throw(env, fail))
    }
}
`;

// G-5, GN-6m: the arming of a member that waits is taken on the JavaScript thread and installed where the work runs.
function waitingFaults(model: Model): string {
  if (model.faults.length === 0 || ![...model.functions, ...model.objects.flatMap((o) => o.members)].some(waitsIo)) return '';
  return `
/// G-5, GN-6m: the arming that a test armed for a member that waits, which its work installs on the libuv pool.
#[cfg(feature = "fault-test")]
fn faults_of(member: &str) -> binding_core::fault::Armed {
    binding_core::fault::take(member)
}

/// G-5, GN-6m: without the feature fault-test, the work of a member that waits runs as it is.
#[cfg(not(feature = "fault-test"))]
const fn faults_of(_member: &str) -> Unarmed {
    Unarmed
}

/// G-5, GN-6m: no arming, without the feature fault-test.
#[cfg(not(feature = "fault-test"))]
struct Unarmed;

#[cfg(not(feature = "fault-test"))]
impl Unarmed {
    fn run<T>(&self, work: impl FnOnce() -> T) -> T {
        work()
    }
}
`;
}

// U-3: a callback is a struct that holds the JavaScript object for the call that received it and implements the core
// trait; an exception of the JavaScript code, or a failure of the binding in the callback, goes to the core as a Raised
// that the generated caller throws again unchanged.
function callbackRust(model: Model, cb: CallbackUnit): string {
  const name = rustField(cb.unit.name);
  const struct = rustType(model, { unit: cb.unit.id });
  const jsName = langName('node', cb.unit.name, 'class');
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  const methods = cb.members.map((m) => {
    const method = langName('node', m.member.name, 'callable');
    const params = m.params.map((p) => `, ${rustField(p.name)}: ${traitParam(model, p.type)}`).join('');
    const outs = m.params.map((p) => `${convertOut(model, p.type, rustField(p.name)).replace(/^(out_[a-z0-9_]+)\(env, /, '$1(self.env, ')}?`);
    const result = m.returns === 'none' ? '()' : rustType(model, m.returns);
    const returned = m.returns === 'none' ? 'Ok(())' : convertIn(model, m.returns, 'returned', rustString(`${jsName}.${method}() returns`));
    const argsType = `FnArgs<(${m.params.map(() => "Unknown<'env>").join(', ')}${m.params.length === 1 ? ',' : ''})>`;
    return `
    fn ${rustField(m.member.name)}(${m.receiver}${params}) -> Result<${result}, ${failure}> {${cb.owner ? `
        if std::thread::current().id() != self.owner {
            return Err(thrown(Thrown::Binding(binding_error(BindingError::WrongThread { subject: String::from(${rustString(`${jsName}.${method}()`)}) }))));
        }` : ''}
        let call = || -> Result<${result}, Thrown> {${/\benv\b/.test(returned) && m.returns !== 'none' ? '\n            let env = self.env;' : ''}
            let function: Function<'env, ${argsType}, Unknown<'env>> =
                self.object.get_named_property(${rustString(method)}).map_err(|error| Thrown::Binding(internal(error)))?;
            let args: ${argsType} = FnArgs::from((${outs.map((o) => `${o.replace(/\?$/, '')}.map_err(Thrown::Binding)?`).join(', ')}${outs.length === 1 ? ',' : ''}));
            let returned = function.apply(self.object, args).map_err(Thrown::Js)?;
            ${m.returns === 'none' ? 'let _returned: Unknown<\'env> = returned;\n            Ok(())' : `${returned.replace(/\?$/, '')}.map_err(Thrown::Binding)`}
        };
        call().map_err(thrown)
    }`;
  }).join('\n');
  const checks = cb.members.map((m) => {
    const method = langName('node', m.member.name, 'callable');
    return `    let found: Unknown<'env> = object.get_named_property(${rustString(method)}).map_err(internal)?;
    if found.get_type().map_err(internal)? != ValueType::Function {
        return Err(binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::from(${rustString(method)}) }));
    }`;
  }).join('\n');
  return `
/// U-3: ${jsName}, a callback that JavaScript code implements; the core calls it through ${cb.unit.core ?? ''}.
pub struct ${struct}<'env> {
    object: Object<'env>,
    env: &'env Env,${cb.owner ? '\n    owner: std::thread::ThreadId,' : ''}
}

/// U-3: a callback object is checked when it enters: each member is a function (kind invalid_callback).
fn in_${name}<'env>(env: &'env Env, value: Unknown<'env>, subject: &str) -> Result<${struct}<'env>, Fail> {
    if value.get_type().map_err(internal)? != ValueType::Object {
        return Err(binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::new() }));
    }
    let object: Object<'env> = unsafe { value.cast() }.map_err(internal)?;
${checks}
    Ok(${struct} { object, env${cb.owner ? ', owner: std::thread::current().id()' : ''} })
}

impl<'env> ${cb.unit.core ?? ''} for ${struct}<'env> {${methods}
}
`;
}

// T-1: the type of a trait method parameter: a type with two forms is borrowed, a Copy type by value.
export function traitParam(model: Model, type: Type): string {
  if (typeof type === 'string') {
    const borrowed: Record<string, string> = { text: '&str', latin1: '&[u8]', bytes: '&[u8]', source: '&[u8]', path: '&std::path::Path' };
    return borrowed[type] ?? rustType(model, type);
  }
  if ('optional' in type && typeof type.optional === 'string' && ['text', 'latin1', 'bytes'].includes(type.optional)) return `Option<${traitParam(model, type.optional)}>`;
  if ('list' in type) return `&[${rustType(model, type.list)}]`;
  if (byValue(model, type)) return rustType(model, type);
  return `&${rustType(model, type)}`;
}

// E-1c, U-3: what a callback threw, kept under the handle of its Raised on the JavaScript thread until the generated
// caller throws it again; and the failure of a core that calls back, as the error of its kind or that exception.
function failureRust(model: Model): string {
  if (!model.functions.some((f) => f.failure) && !model.objects.some((o) => o.members.some((f) => f.failure)) && model.aliases.length === 0) return '';
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  return `
/// U-3: an exception of the JavaScript code, or a failure of the binding in a callback.
enum Thrown {
    Js(napi::Error),
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
            Some(Thrown::Js(error)) => Fail { thrown: Some(error), ..binding_error(BindingError::Internal { detail: String::new() }) },
            Some(Thrown::Binding(fail)) => fail,
            None => binding_error(BindingError::Internal { detail: String::from("U-3: the exception of the callback is gone") }),
        },
        binding_core::Failure::Callback(error) => binding_error(BindingError::Internal { detail: error.to_string() }),
    }
}
`;
}

// T-5: a class unit is a class of the addon that holds the core value; the JavaScript entry checks the arguments of its
// members (G-7).
// A value of a class that comes in is unwrapped as a ClassInstance, by its type tag: napi-rs gives a reference `&T` only
// in the argument conversion that it generates, which these functions do not use, because they take the raw values and
// judge them (T-8), and a reference made in the body of a call is refused.
function objectRust(model: Model, object: ObjectClass): string {
  const jsClass = langName('node', object.unit.name, 'class');
  const struct = jsClass;
  const core = object.unit.core_type ?? '';
  // napi-rs exports a class by the name of its struct, so the struct has the JavaScript name, in a module of its own.
  return `
/// T-5: ${jsClass}${object.constructible ? '' : ', which only its static members make (U-1 constructible)'}.
pub mod class_${rustField(object.unit.name)} {
    use super::*;

    #[napi]
    pub struct ${struct} {
        pub(crate) inner: ${heldType(object)},
    }

    #[napi]
    impl ${struct} {${object.members.map((fn) => functionRust(model, fn).replaceAll('\n', '\n    ')).join('')}}
}

${object.lock?.kind === 'shared' ? `/// GN-6h: calls read the value of ${jsClass} at the same time, so its core type is Sync.
const _: () = {
    const fn sync<T: Sync>() {}
    sync::<${core}>();
};

` : ''}fn out_${rustField(object.unit.name)}(env: &Env, value: ${core}) -> Result<Unknown<'_>, Fail> {
    ToNapiValue::into_unknown(class_${rustField(object.unit.name)}::${struct} { inner: ${heldNew(object, 'value')} }, env).map_err(internal)
}

${takesNested(model, object) ? `/// T-5, GN-6h: a value of the class ${jsClass} inside another type is an instance of it, whose value is read, cloned and
/// released.
fn in_${rustField(object.unit.name)}<'env>(env: &'env Env, value: Unknown<'env>, subject: &str) -> Result<${core}, Fail> {
    // SAFETY: napi unwraps the native object of an instance of the class by its type tag and refuses any other value.
    match unsafe { <ClassInstance<'_, class_${rustField(object.unit.name)}::${struct}> as FromNapiValue>::from_napi_value(env.raw(), value.raw()) } {
        Ok(instance) => match instance.inner.read(${rustString(jsClass)}, &[]) {
            Ok(held) => Ok((*held).clone()),
            Err(error) => Err(binding_error(error)),
        },
        Err(_other) => Err(type_error(subject, ${rustString(jsClass)})),
    }
}
` : ''}${takesHeld(model, object) ? `
/// T-5, GN-6h: a parameter of the class ${jsClass} takes an instance of it, whose lock the call takes.
fn held_${rustField(object.unit.name)}<'env>(env: &'env Env, value: Unknown<'env>, subject: &str) -> Result<${heldType(object)}, Fail> {
    // SAFETY: napi unwraps the native object of an instance of the class by its type tag and refuses any other value.
    match unsafe { <ClassInstance<'_, class_${rustField(object.unit.name)}::${struct}> as FromNapiValue>::from_napi_value(env.raw(), value.raw()) } {
        Ok(instance) => Ok(instance.inner.clone()),
        Err(_other) => Err(type_error(subject, ${rustString(jsClass)})),
    }
}
` : ''}`;
}

// GN-5, GN-6h: the poison entry point of the B-5c test: a panic while the write guard of the instance is held.
function poisonRust(model: Model): string {
  const written = model.objects.filter((o) => o.lock?.writes === true);
  if (written.length === 0) return '';
  const arms = written.map((o) => {
    const jsClass = langName('node', o.unit.name, 'class');
    return `        // SAFETY: napi unwraps the native object of an instance of the class by its type tag and refuses any other value.
        if let Ok(instance) = unsafe { <ClassInstance<'_, class_${rustField(o.unit.name)}::${jsClass}> as FromNapiValue>::from_napi_value(env.raw(), object.raw()) } {
            let _held = instance.inner.write(${rustString(jsClass)}).map_err(binding_error)?;
            panic!("panic-test");
        }`;
  }).join('\n');
  return `
/// B-5c: the entry point of the generated poison test, which panics while it holds the write guard of the instance.
#[cfg(feature = "panic-test")]
#[napi(js_name = ${rustString(POISON_ENTRY.node)})]
pub fn panic_test_held(env: &Env, object: Unknown<'_>) -> napi::Result<()> {
    guard(|| {
${arms}
        Err(binding_error(BindingError::Internal { detail: String::from("B-5c: the object is of no class with a write place") }))
    })
    .map_err(|fail| throw(env, fail))
}
`;
}

function coreErrorRust(model: Model): string {
  if (model.coreError === undefined) return '';
  const classIndex = (k: Model['kinds'][number]): number =>
    k.unit === undefined ? model.classes.findIndex((c) => c.category === k.category) : model.classes.length + model.errorUnits.indexOf(k.unit);
  const arms = model.kinds.map((k) => `        ${k.variant} { .. } => ${classIndex(k)},`).join('\n');
  const doc = `/// I-2 (3): the class of each variant of the core error, by a match without a wildcard. The pattern \`{ .. }\` matches a
/// variant with or without data, which the generator does not see (I-2: binding reads no Rust source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]`;
  if (model.errorUnits.length === 0) {
    return `
${doc}
fn core_error(error: ${model.coreError}) -> Fail {
    let class: usize = match error {
${arms}
    };
    library_error(class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))
}
`;
  }
  // E-2, I-3: the kind of an error unit is an instance of the class of the unit. The core error gives its properties
  // here, and the instance takes them where the call returns, which has the env.
  // The closure outlives the core error, so a text or bytes that the error lends is copied.
  const owned = (type: Type, call: string): string => {
    const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
    const from = base === 'text' ? 'String::from' : base === 'bytes' ? 'Vec::from' : undefined;
    if (from === undefined) return call;
    return typeof type === 'object' && 'optional' in type ? `${call}.map(${from})` : `${from}(${call})`;
  };
  const setters = model.errorUnits.filter((u) => errorProperties(u).length > 0).map((u) => `
/// I-3: the properties of ${langName('node', u.unit.name, 'class')}, read from the core error.
fn ${rustField(u.unit.name)}_properties(error: &${model.coreError}) -> Properties {
${errorProperties(u).map(({ property }, i) => `    let value${i} = ${owned(property.returns, `${property.corePath}(error)`)};`).join('\n')}
    Box::new(move |env, object| {
${errorProperties(u).map(({ property }, i) => `        let value = value${i};
        let property = match ${convertOut(model, property.returns, 'value')} {
            Ok(property) => property,
            Err(fail) => return Err(throw(env, fail)),
        };
        read_only(object, ${rustString(langName('node', property.member.name, 'variable'))}, property)?;`).join('\n')}
        Ok(())
    })
}
`).join('');
  const propertyArms = model.kinds.map((k) => `        ${k.variant} { .. } => ${k.unit === undefined || errorProperties(k.unit).length === 0 ? 'None' : `Some(Box::new(${rustField(k.unit.unit.name)}_properties(&error)))`},`).join('\n');
  return `${setters}
${doc}
fn core_error(error: ${model.coreError}) -> Fail {
    let class: usize = match error {
${arms}
    };
    let properties = match error {
${propertyArms}
    };
    Fail { properties, ..library_error(class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error)) }
}
`;
}

// The names that the addon imports from napi's bindgen_prelude; the others are of the crate root.
const PRELUDE: ReadonlySet<string> = new Set(['Array', 'BigInt', 'ClassInstance', 'FromNapiValue', 'Null', 'Object', 'JsObjectValue', 'ToNapiValue', 'Uint8Array']);

function libRust(model: Model): string {
  const classIndex = (category: string): string => String(model.classes.findIndex((c) => c.category === category));
  const constants = model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n') + defaultAsserts(model);
  const functions = model.functions.map((fn) => functionRust(model, fn)).join('') + model.objects.map((o) => objectRust(model, o)).join('') +
    model.callbacks.map((c) => callbackRust(model, c)).join('') + failureRust(model) + foreignFailureNode(model) + poisonRust(model);
  const enums = [
    ...model.enums.map(enumRust),
    ...model.resultRecords.map((u) => recordRust(model, u)),
    ...model.foreignRecords.map((r) => recordRust(model, r.unit, r.library)),
    // U-7: the conversions of a value alias and what describes a JavaScript value, used as far as the functions use
    // them.
    ...model.aliases.map((a) => aliasNode(model, a)),
    model.aliases.length > 0 ? NODE_HOST : '',
  ].join('\n');
  // I-3: the conversions of the properties of the error units count as uses.
  const propertyUses = model.errorUnits.flatMap((u) => u.properties.map((p) => convertOut(model, p.returns, 'value'))).join('\n');
  const used = usedHelpers(`${HELPERS}\n${WIDEN}\n${WAITING}\n${enums}`, `${functions}${propertyUses}`);
  const napiTypes = ['Array', 'BigInt', 'ClassInstance', 'FromNapiValue', 'JsString', 'Null', 'Object', 'ScopedTask', 'ToNapiValue', 'Uint8Array', 'ValueType']
    // A name inside a string or before a dot ("Array", Array.from in a comment) is not a use of the type.
    .filter((t) => new RegExp(`(?<!::|")\\b${t}\\b(?![."])`).test(`${used}${functions}`));
  if (/\.(is_array|is_typedarray|to_unknown|raw)\(/.test(`${used}${functions}`)) napiTypes.push('JsValue');
  if (/\.(get|set)_named_property/.test(`${used}${functions}`)) napiTypes.push('JsObjectValue');
  // I-3: the properties of an error unit are defined on its instance.
  if (model.errorUnits.length > 0) {
    // A unit without a property defines none, so that the helper and its types are left out (dead code fails the build).
    const defined = model.errorUnits.some((u) => errorProperties(u).length > 0) ? ['Property', 'PropertyAttributes'] : [];
    for (const name of ['Object', 'JsObjectValue', 'JsValue', ...defined]) if (!napiTypes.includes(name)) napiTypes.push(name);
  }
  return `${header('//')}
// The addon of ${model.contract.library}. Its functions take the raw values and judge them (T-8); the JavaScript entry
// checks the count and the names of the arguments (G-7); a failure is an instance of its library class (B-4).

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
${model.aliases.length > 0 ? `use binding_core::{Handle, HostText, HostValue, HostValues, OutValue, OutValues, Prototype${/\bPredicate::/.test(used) ? ', Predicate' : ''}};\n` : ''}use napi::bindgen_prelude::{${[...napiTypes.filter((t) => PRELUDE.has(t)), 'FnArgs', 'Function', 'FunctionRef'].sort().join(', ')}};
use napi::{Env, Unknown${napiTypes.filter((t) => !PRELUDE.has(t)).map((t) => `, ${t}`).join('')}};
use napi_derive::napi;
${/Borrow</.test(used) ? 'use std::borrow::Borrow;\n' : ''}use std::panic::{catch_unwind, AssertUnwindSafe};
${/\bTHROWN\b/.test(functions) ? 'use std::cell::RefCell;\nuse std::collections::BTreeMap;\n' : ''}use std::sync::OnceLock;${/\bTHROWN\b/.test(functions) ? '\nuse std::sync::atomic::{AtomicU64, Ordering};' : ''}

// U-5: the constants of the contract are the constants of the core.
${constants}

/// A failure on its way to the caller: the library class (an index of CLASSES), the message, the kind, the status and the
/// errno (B-4). It becomes an instance of the class where the call returns, which has the env.
struct Fail {
    class: usize,
    message: String,
    kind: &'static str,
    status: Option<u16>,
    errno: Option<i32>,
    // U-3: the exception that a callback threw, which the call throws again unchanged.
    thrown: Option<napi::Error>,${model.errorUnits.length > 0 ? `
    // I-3: the properties of an error unit, which the instance takes where the call returns.
    // Boxed again, so that the failure stays small (a thin pointer).
    properties: Option<Box<Properties>>,` : ''}
}
${model.errorUnits.length > 0 ? `
/// I-3: writes the properties of an error unit on its instance. It is Send, because the failure of a call that waits
/// moves from the libuv pool to the JavaScript thread (GN-6m).
type Properties = Box<dyn for<'env> FnOnce(&'env Env, &mut Object<'env>) -> napi::Result<()> + Send>;

` : ''}${model.errorUnits.some((u) => errorProperties(u).length > 0) ? `
/// I-3: a property of an error is read-only, as kind, status and errno are (E-3).
fn read_only(object: &mut Object<'_>, name: &str, value: Unknown<'_>) -> napi::Result<()> {
    object.define_properties(&[Property::new().with_utf8_name(name)?.with_value(&value).with_property_attributes(PropertyAttributes::Enumerable)])
}
` : ''}
/// The arguments of the constructor of a library class: message, kind, status, errno.
type ClassArgs = FnArgs<(String, String, Option<u32>, Option<i32>)>;

/// B-4: the library classes, which the JavaScript entry hands over when the module loads, in the order of the contract.
static CLASSES: OnceLock<Vec<FunctionRef<ClassArgs, ()>>> = OnceLock::new();

/// B-4: the module keeps a reference to each library class when it loads; a missing class fails the load.
#[napi(js_name = "__register")]
pub fn register(classes: Vec<Function<'_, ClassArgs, ()>>) -> napi::Result<()> {
    if classes.len() != ${model.classes.length + model.errorUnits.length} {
        return Err(napi::Error::from_reason(format!("B-4: ${model.classes.length + model.errorUnits.length} library classes, {} given", classes.len())));
    }
    let references = classes.iter().map(Function::create_ref).collect::<napi::Result<Vec<_>>>()?;
    CLASSES.set(references).map_err(|_registered| napi::Error::from_reason("B-4: the library classes are registered once"))
}

/// The instance of the library class of a failure, as the error that the call throws (B-4).
fn throw(env: &Env, fail: Fail) -> napi::Error {
    if let Some(thrown) = fail.thrown {
        return thrown;
    }
    let Some(class) = CLASSES.get().and_then(|classes| classes.get(fail.class)) else {
        return napi::Error::from_reason(format!("B-4: the library classes are not registered: {}", fail.message));
    };
    let args: ClassArgs = FnArgs::from((fail.message, String::from(fail.kind), fail.status.map(u32::from), fail.errno));
${model.errorUnits.length > 0 ? `    let properties = fail.properties;
    let made = class.borrow_back(env).and_then(|class| class.new_instance(args)).and_then(|error| {
        let Some(properties) = properties else {
            return Ok(error);
        };
        let mut object = error.coerce_to_object()?;
        (*properties)(env, &mut object)?;
        Ok(object.to_unknown())
    });
    match made {` : `    match class.borrow_back(env).and_then(|class| class.new_instance(args)) {`}
        Ok(error) => napi::Error::from(error),
        Err(error) => error,
    }
}

fn library_error(class: usize, message: String, kind: &'static str, status: Option<u16>, errno: Option<i32>) -> Fail {
    Fail { class, message, kind, status, errno, thrown: None${model.errorUnits.length > 0 ? ', properties: None' : ''} }
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
    library_error(class, error.to_string(), error.kind(), error.status(), error.errno())
}
${coreErrorRust(model)}
/// B-7: a panic of the call reaches the caller as kind internal.
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
${faultRust(model)}${waitingFaults(model)}${aliasKindsRust(model)}${raisesAssertions(model)}${used}${functions}
/// B-7: the entry point of the generated panic test.
#[cfg(feature = "panic-test")]
#[napi(js_name = "__panicTest")]
pub fn panic_test(env: &Env) -> napi::Result<()> {
    guard(|| panic!("panic-test")).map_err(|fail| throw(env, fail))
}
${aliasesWithKinds(model).map((alias) => `
/// U-7: runs the in function of the alias ${alias.unit.id} alone, for the cases of the alias.
#[cfg(feature = "codec-test")]
#[napi(js_name = ${rustString(`__aliasIn${langName('node', alias.unit.name, 'class')}`)})]
pub fn alias_in_${rustField(alias.unit.name)}<'env>(env: &'env Env, value: Unknown<'env>) -> napi::Result<()> {
    guard(|| {
        let _value: ${alias.unit.core_type ?? ''} = in_${rustField(alias.unit.name)}(env, value, "value")?;
        Ok(())
    })
    .map_err(|fail| throw(env, fail))
}
`).join('')}${model.faults.length === 0 ? '' : `
/// G-5: arms the faults of a case for the next call of the member from this thread, and gives the id of the arming.
#[cfg(feature = "fault-test")]
#[napi(js_name = "__armFaults")]
pub fn arm_faults(env: &Env, member: String, faults: String) -> napi::Result<i64> {
    guard(|| {
        let id: u64 = binding_core::fault::arm(&member, &faults).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
        i64::try_from(id).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
    })
    .map_err(|fail| throw(env, fail))
}

/// G-5: the points of an arming whose fault did not fire.
#[cfg(feature = "fault-test")]
#[napi(js_name = "__faultLeft")]
pub fn fault_left(env: &Env, id: i64) -> napi::Result<Vec<String>> {
    guard(|| {
        let id: u64 = u64::try_from(id).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
        binding_core::fault::left(id).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
    })
    .map_err(|fail| throw(env, fail))
}
`}`;
}

// ---- JavaScript and declarations ----

function tsType(model: Model, type: Type, input: boolean): string {
  if (typeof type === 'string') {
    const map: Record<string, string> = { text: 'string', latin1: 'string', bool: 'boolean', uint: 'number', int: 'number', float: 'number', int64: input ? 'number | bigint' : 'bigint', bytes: 'Uint8Array', source: 'string | Uint8Array', none: 'void', never: 'never' };
    return map[type] ?? 'unknown';
  }
  if ('list' in type) return input ? `Iterable<${tsType(model, type.list, input)}>` : `readonly (${tsType(model, type.list, input)})[]`;
  if ('map' in type) return `ReadonlyMap<string, ${tsType(model, type.map, input)}>`;
  if ('keyed_map' in type) return `ReadonlyMap<${type.key.map((k) => ({ int: 'number', text: 'string' })[k] ?? 'never').join(' | ')}, ${tsType(model, type.keyed_map, input)}>`;
  if ('optional' in type) return `${tsType(model, type.optional, input)} | null`;
  if ('tuple' in type) return `readonly [${type.tuple.map((t) => tsType(model, t, input)).join(', ')}]`;
  const unit = unitOf(model, type);
  // T-3: a record of another repository is a plain object, declared here by its fields.
  if (unit?.kind === 'record' && libraryOf(type) !== undefined) {
    return `{ ${(unit.fields ?? []).map((f) => `readonly ${langName('node', f.name, 'variable')}: ${tsType(model, f.type, input)}`).join('; ')} }`;
  }
  // U-7: a value alias is any value that its core judges.
  if (unit === undefined || aliasOf(model, type) !== undefined) return 'unknown';
  return langName('node', unit.name, 'class');
}

const listParam = (type: Type): boolean => typeof type === 'object' && 'list' in type;
// T-2: a keyed map, whole or optional, which the JavaScript entry passes as the entries of a Map (GN-12).
const keyedType = (type: Type): boolean => {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  return typeof base === 'object' && ('keyed_map' in base || 'map' in base);
};

function indexCjs(model: Model): string {
  const base = addonBase(model);
  const classes = model.classes.map((c) => `
class ${c.name} extends globalThis.${nodeBase(c.category)} {
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
  // E-2: an error unit extends the class of its parent or of its category. The addon defines its properties (I-3).
  const units = model.errorUnits.map((u) => {
    const name = langName('node', u.unit.name, 'class');
    const parent = u.parent === undefined ? model.classes.find((c) => c.category === u.category)?.name ?? '' : langName('node', u.parent.unit.name, 'class');
    return `
class ${name} extends ${parent} {
  constructor(message, kind, status, errno) {
    super(message, kind, status, errno);
    Object.defineProperty(this, 'name', { value: ${jsString(name)}, configurable: true, writable: true });
  }
}`;
  }).join('\n');
  // G-7: the count of the arguments, the members of an options record, and a list parameter's iterable (T-7).
  // GN-6m: the entry of a member that waits is an async function, so that every failure of the call, also one of its
  // arguments, rejects the promise.
  const checked = (fn: Fn, label: string, call: (passed: string) => string): string => {
    const count = fn.params.length;
    // U-2: the parameters that may be left out are the last ones, a record parameter with {empty: "object"} too.
    const least = fn.params.filter((p) => p.default === undefined).length;
    const takes = least === count ? `${count} argument${count === 1 ? '' : 's'}` : `${least} to ${count} arguments`;
    const lines = [`  if (${least === count ? `args.length !== ${count}` : `args.length < ${least} || args.length > ${count}`}) {`, `    throw new TypeError(\`${label} takes ${takes}, \${args.length} given\`);`, '  }'];
    const passed = fn.params.map((p, i) => {
      if (fn.record !== undefined && p === fn.record.param) {
        const record = langName('node', p.name, 'variable');
        const names = (fn.record.unit.fields ?? []).map((f) => langName('node', f.name, 'variable'));
        const required = (fn.record.unit.fields ?? []).filter((f) => f.default === undefined).map((f) => langName('node', f.name, 'variable'));
        lines.push(`  checkRecord(${jsString(label)}, ${jsString(record)}, args[${i}], [${names.map(jsString).join(', ')}], [${required.map(jsString).join(', ')}]);`);
        return `args[${i}]`;
      }
      if (keyedType(p.type)) return `toEntries(args[${i}])`;
      return listParam(p.type) ? `toList(args[${i}])` : `args[${i}]`;
    });
    lines.push(keyedType(fn.returns) ? `  return fromEntries(${waitsIo(fn) ? 'await ' : ''}${call(passed.join(', '))});` : `  return ${call(passed.join(', '))};`);
    return lines.join('\n');
  };
  const fns = model.functions.map((fn) => {
    const name = langName('node', fn.member.name, 'callable');
    return `
${waitsIo(fn) ? 'async ' : ''}function ${name}(...args) {
${checked(fn, `${name}()`, (passed) => `addon.${name}(${passed})`)}
}`;
  }).join('\n');
  // T-5: the classes of the addon keep their identity; the entry defines each method and static member over the
  // addon's __<name>, checking the arguments first (G-7), so an instance that the addon makes has them too.
  const objects = model.objects.map((o) => {
    const cls = langName('node', o.unit.name, 'class');
    const wraps = o.members.filter((fn) => (fn.kind === 'static' || fn.kind === 'method') && fn.special === undefined).map((fn) => {
      const name = memberName('node', fn);
      const target = fn.kind === 'static' ? cls : `${cls}.prototype`;
      return `{
  const original = ${target}.__${name};
  Object.defineProperty(${target}, ${jsString(name)}, {
    value: ${waitsIo(fn) ? 'async ' : ''}function ${name}(...args) {
${checked(fn, `${cls}.${name}()`, (passed) => `Reflect.apply(original, this, [${passed}])`).split('\n').map((l) => `    ${l}`).join('\n')}
    },
    writable: true,
    configurable: true,
  });
}`;
    });
    // N-4 iterate: the class is iterable over the snapshot that the addon's __iterate gives.
    if (o.members.some((fn) => fn.kind === 'iterate')) {
      wraps.push(`Object.defineProperty(${cls}.prototype, Symbol.iterator, {
  value: function iterator() {
    return this.__iterate()[Symbol.iterator]();
  },
  writable: true,
  configurable: true,
});`);
    }
    const constructor = o.members.find((fn) => fn.kind === 'constructor');
    const construct = constructor === undefined ? `addon.${cls}` : `new Proxy(addon.${cls}, {
  construct(target, args) {
${checked(constructor, `new ${cls}()`, (passed) => `target.__new(${passed})`).split('\n').map((l) => `  ${l}`).join('\n')}
  },
})`;
    return `
const ${cls} = ${construct};
${wraps.join('\n')}`;
  }).join('\n');
  const constants = model.constants.map((c) => `const ${langName('node', c.member.name, 'constant')} = ${JSON.stringify(c.member.value)};`).join('\n');
  const exports = [
    ...model.classes.map((c) => c.name),
    ...model.errorUnits.map((u) => langName('node', u.unit.name, 'class')),
    ...model.functions.map((f) => langName('node', f.member.name, 'callable')),
    ...model.objects.map((o) => langName('node', o.unit.name, 'class')),
    ...model.constants.map((c) => langName('node', c.member.name, 'constant')),
  ];
  return `${header('//')}
'use strict';

// T-2: the addon is in the npm package of the machine's platform, which the package names in optionalDependencies; a
// build in a checkout puts the file beside this entry instead.
const platform = \`\${process.platform}-\${process.arch}\${process.platform === 'linux' ? '-gnu' : ''}\`;
function loadAddon() {
  try {
    return require(\`${(model.contract.packages['node'] as { package: string }).package}-\${platform}\`);
  } catch (error) {
    if (error === null || typeof error !== 'object' || error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  return require(\`./${base}.\${platform}.node\`);
}
const addon = loadAddon();
${classes}${units === '' ? '' : `\n${units}`}


// B-4: the addon throws instances of these classes; it keeps them from here on, and a missing one fails the load.
addon.__register([${[...model.classes.map((c) => c.name), ...model.errorUnits.map((u) => langName('node', u.unit.name, 'class'))].join(', ')}]);

// T-7: a list parameter takes any iterable but a string; the addon judges anything else.
function toList(value) {
  if (typeof value !== 'string' && value !== null && value !== undefined && typeof value[Symbol.iterator] === 'function') {
    return Array.from(value);
  }
  return value;
}

// T-2: a keyed map crosses as its entries, [key, value], which only a Map gives: null stays the absence, and any other
// value reaches the addon as undefined, which it refuses as kind invalid_argument_type (an array of pairs is not a Map).
function toEntries(value) {
  if (value instanceof Map) return Array.from(value);
  return value === null ? null : undefined;
}

// T-2: the entries of a keyed map, as a Map; null is the absence.
function fromEntries(value) {
  return value === null ? null : new Map(value);
}

// G-7, T-4: an options record has only the names of its fields, and a field whose value is undefined is absent; a
// field without a default is required (U-2); a value that is not an object is judged by the addon.
function checkRecord(fn, name, record, fields, required) {
  if (typeof record !== 'object' || record === null) return;
  for (const key of Object.keys(record)) {
    if (!fields.includes(key)) throw new TypeError(\`\${fn}: \${name} has no member \${key}\`);
  }
  for (const field of required) {
    if (record[field] === undefined) throw new TypeError(\`\${fn}: \${name} lacks the member \${field}\`);
  }
}
${fns}
${objects}

${constants}

module.exports = { ${exports.join(', ')} };
`;
}

const nodeBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';

function indexMjs(model: Model): string {
  const exports = [
    ...model.classes.map((c) => c.name),
    ...model.errorUnits.map((u) => langName('node', u.unit.name, 'class')),
    ...model.functions.map((f) => langName('node', f.member.name, 'callable')),
    ...model.objects.map((o) => langName('node', o.unit.name, 'class')),
    ...model.constants.map((c) => langName('node', c.member.name, 'constant')),
  ];
  return `${header('//')}
import entry from './index.cjs';

export const { ${exports.join(', ')} } = entry;
`;
}

function indexDts(model: Model): string {
  // U-2: a parameter or a member that may be left out; the declaration shows a {literal} or {const} default.
  const shown = (a: Arg | undefined): string => {
    if (a?.default === undefined) return '';
    const value = a === undefined ? undefined : declaredValue(model, a)?.value;
    return value === undefined ? ' The core decides its value when it is left out (U-2).' : ` Its default is ${JSON.stringify(value)} (U-2).`;
  };
  // GN-6m: a member that waits returns a Promise of its result.
  const returned = (fn: Fn): string => (waitsIo(fn) ? `Promise<${tsType(model, fn.returns, false)}>` : tsType(model, fn.returns, false));
  const param = (fn: Fn, p: Fn['params'][number]): string => `${langName('node', p.name, 'variable')}${p.default === undefined ? '' : '?'}: ${tsType(model, p.type, true)}`;
  const paramDocs = (fn: Fn, indent: string): string => {
    const lines = fn.args.filter((a) => !a.field && a.default !== undefined).map((a) => `${indent} * @param ${langName('node', a.name, 'variable')}${shown(a)}`);
    return lines.length === 0 ? '' : `${indent}/**\n${lines.join('\n')}\n${indent} */\n`;
  };
  const classes = model.classes.map((c) => `
/** The errors of category ${c.category} (E-2). */
export declare class ${c.name} extends ${nodeBase(c.category)} {
  readonly kind: string;
  readonly status: number | null;
  readonly errno: number | null;
}`).join('\n');
  const errorUnits = model.errorUnits.map((u) => `
/** The errors of the unit ${u.unit.id} (E-2). */
export declare class ${langName('node', u.unit.name, 'class')} extends ${u.parent === undefined ? model.classes.find((c) => c.category === u.category)?.name ?? '' : langName('node', u.parent.unit.name, 'class')} {${u.properties.map((p) => `\n  readonly ${langName('node', p.member.name, 'variable')}: ${tsType(model, p.returns, false)};`).join('')}
}`).join('\n');
  const enums = model.enums.map((u) => `
/** T-6. */
export type ${langName('node', u.name, 'class')} = ${(u.variants ?? []).map((v) => jsString(v.value)).join(' | ')};`).join('\n');
  const records = model.records.map((u) => `
/** T-4: the options record; a member whose value is undefined is absent. */
export interface ${langName('node', u.name, 'class')} {
${(u.fields ?? []).map((f) => `${f.default === undefined ? '' : `  /**${shown({ name: f.name, type: f.type, field: true, default: f.default })} */\n`}  readonly ${langName('node', f.name, 'variable')}${f.default === undefined ? '' : '?'}: ${tsType(model, f.type, true)};`).join('\n')}
}`).join('\n');
  const fns = model.functions.map((fn) => {
    const params = fn.params.map((p) => param(fn, p));
    return `${paramDocs(fn, '')}export declare function ${langName('node', fn.member.name, 'callable')}(${params.join(', ')}): ${returned(fn)};`;
  }).join('\n');
  const constants = model.constants.map((c) => `export declare const ${langName('node', c.member.name, 'constant')}: ${JSON.stringify(c.member.value)};`).join('\n');
  const params = (fn: Fn): string => fn.params.map((p) => param(fn, p)).join(', ');
  const objects = model.objects.map((o) => {
    const lines = o.members.map((fn) => {
      const name = memberName('node', fn);
      if (fn.kind === 'constructor') return `  constructor(${params(fn)});`;
      if (fn.kind === 'static') return `  static ${name}(${params(fn)}): ${returned(fn)};`;
      if (fn.kind === 'property') return `  get ${name}(): ${tsType(model, fn.returns, false)};`;
      if (fn.kind === 'iterate') {
        const yields = fn.yields ?? { value: 'none' };
        const item = yields.key === undefined ? tsType(model, yields.value, false) : `[${tsType(model, yields.key, false)}, ${tsType(model, yields.value, false)}]`;
        return `  [Symbol.iterator](): IterableIterator<${item}>;`;
      }
      return `  ${name}(${params(fn)}): ${returned(fn)};`;
    });
    if (!o.constructible) lines.unshift('  private constructor();');
    return `
/** T-5. */
export declare class ${langName('node', o.unit.name, 'class')} {
${lines.join('\n')}
}`;
  }).join('\n');
  const callbacks = model.callbacks.map((cb) => `
/** U-3: a callback that JavaScript code implements. */
export interface ${langName('node', cb.unit.name, 'class')} {
${cb.members.map((m) => `  ${langName('node', m.member.name, 'callable')}(${m.params.map((p) => `${langName('node', p.name, 'variable')}: ${tsType(model, p.type, false)}`).join(', ')}): ${tsType(model, m.returns, true)};`).join('\n')}
}`).join('\n');
  return `${header('//')}
${classes}${errorUnits === '' ? '' : `\n${errorUnits}`}
${enums}
${records}
${objects}
${callbacks}

${fns}

${constants}
`;
}

export function node(model: Model, files: Files): void {
  const npm = model.contract.packages['node'] as { package: string };
  files.set(`${ROOT}/lib.rs`, libRust(model));
  files.set(`${ROOT}/index.cjs`, indexCjs(model));
  files.set(`${ROOT}/index.mjs`, indexMjs(model));
  files.set(`${ROOT}/index.d.ts`, indexDts(model));
  files.set(`${ROOT}/tests/generated.test.mjs`, nodeTests(model));
}
