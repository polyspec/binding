// The browser and JavaScript binding (wasm-bindgen): the Rust crate that wasm-bindgen turns into a WebAssembly module
// and its JavaScript glue, the ES module around it (the library classes, the loading of the module at import and the argument checks of G-7), the
// declarations and the generated tests (G-5). The npm package of Node carries it: the subpath ./wasm always, and an
// entry with the conditions of P-5 chooses it in the browser.

import type { Type, Unit } from '../contract.ts';
import { variantPattern } from '../contract.ts';
import { type Arg, type CallbackUnit, type Fn, type KeptClass, type Model, isInternal, interfaceOf, implementorsOf, type ObjectClass, RECEIVER_GUARD, cleanupAsserts, cleanupMade, cleanupWarning, Unsupported, keepsThrown, usesNative, nativeRoundTrip, aliasKindsRust, aliasOf, aliasesWithKinds, argType, leftOut, borrowedItem, coreCallArgs, guardBorrows, errorProperties, armedCall, faultRust, withFaults, heldNew, heldParam, heldType, langName, libraryOf, lockLines, memberName, objectUnit, recordFn, rustField, rustType, rustVariant, takesHeld, takesObject, traitParam, boxed, unitOf, type CaseField, type Variant, caseFields, caseRead, caseStruct, caseType, caseValue, implementsClause, UNIT_CASE_ALLOW, tupleIn, caseLeftOut, narrows, narrowed, tupleOut, propertyValue, waitsAsync, awaits, futureOf, errorMatched, recognizedFn, recognizedMatch, awaitsNone, machineFunction, unitFn, libraryBlocks } from './model.ts';
import { declaredValue, defaultAsserts } from './defaults.ts';
import { wasmTests } from './tests_wasm.ts';
import { WASM_NATIVE, aliasWasm, foreignFailureWasm, foreignRegistrationWasm, keptExportsWasm, wasmHost } from './alias_wasm.ts';
import { typeParameters } from './node.ts';
import { raisesAssertions } from './raises.ts';
import { type Files, header, jsString, rustString, closure, usedHelpers, WIDEN, INTO_CORE, PARTS, CORE_FORM } from './text.ts';

export const WASM = 'packages/ts/wasm';
const ROOT = `${WASM}/generated`;
// GN-6w: the path of a trait method, <Type as Trait>::method, is code in a doc comment, which rustdoc would read as HTML.
const docPath = (path: string): string => (path.startsWith('<') ? `\`${path}\`` : path);

// The name of the files of wasm-bindgen: <glue>.js, <glue>_bg.wasm and their declarations.
export const wasmGlue = (model: Model): string => `${model.contract.library.replaceAll('-', '_')}_wasm`;

// ---- Rust ----

function convertIn(model: Model, type: Type, value: string, subject: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'text_in', latin1: 'latin1_in', bool: 'bool_in', uint: 'uint_in', int: 'int_in', int64: 'int64_in', float: 'float_in', bytes: 'bytes_in', source: 'source_in' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no WASM input conversion for ${type}`);
    return `${name}(${value}, ${subject})`;
  }
  if ('list' in type) return `list_in(${value}, ${subject}, ${closure(['item'], boxed(model, type.list, convertIn(model, type.list, 'item', subject)))})`;
  if ('map' in type) return `map_in(${value}, ${subject}, ${closure(['item'], convertIn(model, type.map, 'item', subject))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `keyed_map_in(${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`a Map whose keys are ${type.key.map((k) => ({ int: 'safe integers', text: 'strings' })[k] ?? k).join(' or ')}`)}, ${closure(['item'], convertIn(model, type.keyed_map, 'item', subject))})`;
  }
  if ('optional' in type) return `optional_in(${value}, ${closure(['value'], boxed(model, type.optional, convertIn(model, type.optional, 'value', subject)))})`;
  if ('function' in type) return functionIn(model, type.function, value, subject);
  if ('tuple' in type) return tupleIn(type.tuple, `tuple_in(${value}, ${subject})`, (part, name) => convertIn(model, part, `&${name}`, subject));
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `in_${rustField(unit.name)}(${value}, ${subject})`;
  if (unit?.kind === 'record' || unit?.kind === 'variant') return `${unitFn('in', unit, libraryOf(type))}(${value}, ${subject})`;
  if (unit !== undefined && (objectUnit(model, type) !== undefined || interfaceOf(model, type) !== undefined)) return `in_${rustField(unit.name)}(${value}, ${subject})`;
  // U-3, U-7: a callback object and a value of an alias are judged by their own conversions.
  if (unit?.origin === 'callback') return `in_${rustField(unit.name)}(${value}, ${subject})`;
  const alias = aliasOf(model, type);
  if (unit !== undefined && alias !== undefined) return `${unitFn('in', unit, alias.library)}(${value}, ${subject})`;
  throw new Unsupported(`no WASM input conversion for ${JSON.stringify(type)}`);
}

// A scalar of T-1 that a conversion takes by value, so a place of it is passed as it is: a borrow of a Copy value
// that the conversion takes as impl Borrow or a widening trait is needless (the lints deny it).
const copied = (type: Type): boolean => typeof type === 'string' && ['bool', 'uint', 'int', 'int64', 'float'].includes(type);

// GN-6z, GN-6u: a function holds the JavaScript function as a Native of the table of the one thread of the module; a
// call converts the arguments out and the result in, and an exception of the JavaScript code, or a failure of the
// binding in the call, goes to the core as a Raised.
function functionIn(model: Model, type: { parameters: Type[]; returns: Type }, value: string, subject: string): string {
  const result = type.returns === 'none' ? '()' : rustType(model, type.returns);
  const names = type.parameters.map((_p, i) => `argument_${String(i)}`);
  const params = type.parameters.map((p, i) => `${names[i] ?? ''}: ${traitParam(model, p)}`);
  const outs = type.parameters.map((p, i) => `${convertOut(model, p, names[i] ?? '')}.map_err(Thrown::Binding)?`);
  const returned = type.returns === 'none'
    ? 'function.apply(&JsValue::NULL, &args).map_err(Thrown::Js)?;\n                    Ok(())'
    : `let returned = function.apply(&JsValue::NULL, &args).map_err(Thrown::Js)?;\n                    ${convertIn(model, type.returns, '&returned', subject.startsWith('"') ? `${subject.slice(0, -1)} returns"` : '"the function returns"')}.map_err(Thrown::Binding)`;
  return `kept_function_in(${value}, ${subject}).map(|native| -> ${rustType(model, { function: { ...type, async_allowed: false } })} {
            Box::new(move |${params.join(', ')}| -> Result<${result}, binding_core::Failure<${model.coreError ?? '()'}>> {
                let call = || -> Result<${result}, Thrown> {
                    let function: Function = native_object(&native).map_err(Thrown::Binding)?.dyn_into::<Function>().map_err(|error| Thrown::Binding(internal(&error)))?;
                    let args: Array = ${outs.length === 0 ? 'Array::new()' : `[${outs.join(', ')}].iter().collect()`};
                    ${returned}
                };
                call().map_err(thrown)
            })
        })`;
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    // T-2 never: the core's Infallible has no value, so the call has failed before.
    if (type === 'never') return `match ${value} {}`;
    if (type === 'none') return 'Ok(JsValue::UNDEFINED)';
    const fn: Record<string, string> = { text: 'text_out', latin1: 'latin1_out', bool: 'bool_out', uint: 'uint_out', int: 'int_out', int64: 'int64_out', float: 'float_out', bytes: 'bytes_out' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no WASM output conversion for ${type}`);
    return `${name}(${value})`;
  }
  // GN-6ae: a result passthrough leaves the table of the module as the value that the function returned.
  if ('passthrough' in type) return `passed_out(${value})`;
  if ('list' in type) return `list_out(${value}, ${closure(['item'], convertOut(model, type.list, 'item'))})`;
  // The value of a keyed map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('map' in type) return `map_out(${value}, |item| ${convertOut(model, type.map, 'item')})`;
  if ('keyed_map' in type) return `keyed_map_out(${value}, |item| ${convertOut(model, type.keyed_map, 'item')})`;
  // An optional is matched where it is, so its item is the value or the reference that the place holds, whose type no
  // generic conversion needs to infer.
  if ('optional' in type) return `match ${value} {\n        Some(value) => ${convertOut(model, type.optional, 'value')},\n        None => Ok(JsValue::NULL),\n    }`;
  if ('tuple' in type) return tupleOut(type.tuple, value, (t, name) => convertOut(model, t, copied(t) ? `*${name}` : name), (parts) => `tuple_out(&[${parts.join(', ')}])`);
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `out_${rustField(unit.name)}(${value})`;
  if (unit?.kind === 'record' || unit?.kind === 'variant') return `${unitFn('out', unit, libraryOf(type))}(${value})`;
  if (unit !== undefined && objectUnit(model, type) !== undefined) return `out_${rustField(unit.name)}(${value})`;
  const alias = aliasOf(model, type);
  if (unit !== undefined && alias !== undefined) return `${unitFn('out', unit, alias.library)}(${value})`;
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
fn text_in(value: &JsValue, subject: &str) -> Result<String, Fail> {
    let text = js_string(value, subject)?;
    if !text.is_valid_utf16() {
        return Err(binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::UnpairedSurrogate }));
    }
    Ok(String::from(text))
}

/// B-3, T-1 latin1: a string whose code units are U+0000 to U+00FF, one byte each.
fn latin1_in(value: &JsValue, subject: &str) -> Result<Vec<u8>, Fail> {
    js_string(value, subject)?
        .iter()
        .map(|unit| u8::try_from(unit).map_err(|_above| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::AboveLatin1 })))
        .collect()
}

/// T-7: bytes are a Uint8Array; a typed array of another element type, or any other value, is refused.
fn bytes_in(value: &JsValue, subject: &str) -> Result<Vec<u8>, Fail> {
    value.dyn_ref::<Uint8Array>().map(Uint8Array::to_vec).ok_or_else(|| type_error(subject, "Uint8Array"))
}

/// T-1 source: a string, as its UTF-8 (B-3), or the bytes of a Uint8Array.
fn source_in(value: &JsValue, subject: &str) -> Result<Vec<u8>, Fail> {
    if value.is_string() {
        return text_in(value, subject).map(String::into_bytes);
    }
    bytes_in(value, subject).map_err(|_other| type_error(subject, "string or Uint8Array"))
}

/// U-2: undefined is an argument that the caller left out, whose value the core decides; any other value is converted.
fn default_in<T>(value: &JsValue, item: impl FnOnce(&JsValue) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    if value.is_undefined() {
        return Ok(None);
    }
    item(value).map(Some)
}

/// T-7: bytes leave as a Uint8Array of their copy.
fn bytes_out(value: impl AsRef<[u8]>) -> Result<JsValue, Fail> {
    Ok(Uint8Array::from(value.as_ref()).into())
}

fn bool_in(value: &JsValue, subject: &str) -> Result<bool, Fail> {
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

fn uint_in(value: &JsValue, subject: &str) -> Result<u64, Fail> {
    let integer = safe_integer(value, subject, NumberType::Uint)?;
    u64::try_from(integer).map_err(|_negative| binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint }))
}

fn int_in(value: &JsValue, subject: &str) -> Result<i64, Fail> {
    safe_integer(value, subject, NumberType::Int)
}

/// T-1 int64: a bigint of the range of i64, or a number of the safe integers (B-2).
fn int64_in(value: &JsValue, subject: &str) -> Result<i64, Fail> {
    if !value.is_bigint() {
        return safe_integer(value, subject, NumberType::Int);
    }
    i64::try_from(value.clone()).map_err(|_outside| binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int }))
}

fn float_in(value: &JsValue, subject: &str) -> Result<f64, Fail> {
    value.as_f64().ok_or_else(|| binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Float }))
}

/// T-7: an array; the JavaScript entry turns any other iterable but a string into one.
fn list_in<T>(value: &JsValue, subject: &str, item: impl Fn(&JsValue) -> Result<T, Fail>) -> Result<Vec<T>, Fail> {
    let array = value.dyn_ref::<Array>().ok_or_else(|| type_error(subject, "Iterable"))?;
    array.iter().map(|value| item(&value)).collect()
}

/// GN-6t: a tuple is an array of exactly its parts.
fn tuple_in<const N: usize>(value: &JsValue, subject: &str) -> Result<[JsValue; N], Fail> {
    let array = value.dyn_ref::<Array>().ok_or_else(|| type_error(subject, "Array"))?;
    <[JsValue; N]>::try_from(array.iter().collect::<Vec<JsValue>>()).map_err(|_other| type_error(subject, &format!("an array of {N} items")))
}

/// T-7: null is the absence; any other value is converted.
fn optional_in<T>(value: &JsValue, item: impl FnOnce(&JsValue) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
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

/// U-2 {empty: "object"}: a member of an options record that may be left out; a record that is left out (undefined)
/// leaves out each of its members.
fn member_or_undefined(record: &JsValue, name: &str, subject: &str) -> Result<JsValue, Fail> {
    if record.is_undefined() {
        return Ok(JsValue::UNDEFINED);
    }
    member(record, name, subject)
}

fn text_out(value: impl AsRef<str>) -> Result<JsValue, Fail> {
    Ok(JsValue::from_str(value.as_ref()))
}

/// T-1 latin1: each byte is one character.
fn latin1_out(value: impl AsRef<[u8]>) -> Result<JsValue, Fail> {
    let text: String = value.as_ref().iter().map(|byte| char::from(*byte)).collect();
    text_out(text)
}

fn bool_out(value: impl Borrow<bool>) -> Result<JsValue, Fail> {
    Ok(JsValue::from_bool(*value.borrow()))
}

/// B-2: a number leaves only as a safe integer; a larger one is kind internal.
fn int_out(value: impl WideInt) -> Result<JsValue, Fail> {
    let value = value.widen_int();
    if value.abs() > 9_007_199_254_740_991 {
        return Err(binding_error(BindingError::Internal { detail: format!("{value} is not a safe integer") }));
    }
    #[allow(clippy::as_conversions, clippy::cast_precision_loss, reason = "B-2: a safe integer, which f64 holds exactly")]
    let double = value as f64;
    Ok(JsValue::from_f64(double))
}

/// T-1 int64: a bigint, so that the whole range of i64 leaves.
fn int64_out(value: impl WideInt) -> Result<JsValue, Fail> {
    Ok(JsValue::from(value.widen_int()))
}

fn uint_out(value: impl WideUint) -> Result<JsValue, Fail> {
    let value = value.widen_uint();
    match i64::try_from(value) {
        Ok(value) => int_out(value),
        Err(_large) => Err(binding_error(BindingError::Internal { detail: format!("{value} is not a safe integer") })),
    }
}

fn float_out(value: impl Borrow<f64>) -> Result<JsValue, Fail> {
    Ok(JsValue::from_f64(*value.borrow()))
}

fn list_out<T>(value: impl IntoIterator<Item = T>, item: impl Fn(T) -> Result<JsValue, Fail>) -> Result<JsValue, Fail> {
    let array = Array::new();
    for value in value {
        array.push(&item(value)?);
    }
    Ok(array.into())
}

/// T-2, GN-18: the entries of a Map in its order, each (key, value); a value that is no Map (an array of pairs, a plain
/// object) is kind invalid_argument_type. The Map is read here, where the value is judged, so a map is taken at every
/// place of a type: as a parameter, in a list, an optional, a record, a variant and another map.
fn map_entries(value: &JsValue, subject: &str, expected: &str) -> Result<Vec<(JsValue, JsValue)>, Fail> {
    let map = value.dyn_ref::<js_sys::Map>().ok_or_else(|| type_error(subject, expected))?;
    let mut entries = Vec::new();
    for entry in Array::from(map).iter() {
        let pair = entry.dyn_ref::<Array>().filter(|pair| pair.length() == 2).ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("a Map gave an entry that is no pair") }))?;
        entries.push((pair.get(0), pair.get(1)));
    }
    Ok(entries)
}

/// T-2: a Map whose keys are strings; any other key is kind invalid_argument_type.
fn map_in<T>(value: &JsValue, subject: &str, item: impl Fn(&JsValue) -> Result<T, Fail>) -> Result<binding_core::OrderedMap<T>, Fail> {
    let expected = "a Map whose keys are strings";
    let mut map = binding_core::OrderedMap::new();
    for (key, value) in map_entries(value, subject, expected)? {
        if !key.is_string() {
            return Err(type_error(subject, expected));
        }
        if map.insert(text_in(&key, subject)?, item(&value)?).is_some() {
            return Err(binding_error(BindingError::Internal { detail: String::from("a Map gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a map, owned or borrowed, as a Map of its entries in their order.
fn map_out<T>(value: impl Borrow<binding_core::OrderedMap<T>>, item: impl Fn(&T) -> Result<JsValue, Fail>) -> Result<JsValue, Fail> {
    let entries = js_sys::Map::new();
    for (key, value) in value.borrow().iter() {
        entries.set(&text_out(key)?, &item(value)?);
    }
    Ok(entries.into())
}

/// T-2, U-7 (c): a Map whose keys are safe integers or strings of the kinds that the contract lists; any other key is
/// kind invalid_argument_type.
fn keyed_map_in<T>(value: &JsValue, subject: &str, kinds: &[u8], expected: &str, item: impl Fn(&JsValue) -> Result<T, Fail>) -> Result<binding_core::KeyedMap<T>, Fail> {
    let mut map = binding_core::KeyedMap::new();
    for (key, value) in map_entries(value, subject, expected)? {
        // GN-12a: a number key of a listed int is a safe integer, else kind invalid_number.
        let (tag, key) = if key.as_f64().is_some() && kinds.contains(&0) {
            (0, binding_core::Key::Int(safe_integer(&key, subject, NumberType::Int)?))
        } else if key.is_string() {
            (2, binding_core::Key::Text(text_in(&key, subject)?))
        } else if let Some(bytes) = key.dyn_ref::<Uint8Array>() {
            // GN-6af: a byte string key is a Uint8Array, which a contract lists where the entry keeps the Map itself.
            (1, binding_core::Key::Bytes(bytes.to_vec()))
        } else {
            return Err(type_error(subject, expected));
        };
        if !kinds.contains(&tag) {
            return Err(type_error(subject, expected));
        }
        if map.insert(key, item(&value)?).is_some() {
            return Err(binding_error(BindingError::Internal { detail: String::from("a Map gave a key twice") }));
        }
    }
    Ok(map)
}

/// T-2: a keyed map, owned or borrowed, as a Map of its entries in their order; a byte string key, which no WASM
/// contract lists, is kind internal.
fn keyed_map_out<T>(value: impl Borrow<binding_core::KeyedMap<T>>, item: impl Fn(&T) -> Result<JsValue, Fail>) -> Result<JsValue, Fail> {
    let entries = js_sys::Map::new();
    for (key, value) in value.borrow().iter() {
        let key = match key {
            binding_core::Key::Int(integer) => int_out(integer)?,
            binding_core::Key::Text(text) => text_out(text)?,
            binding_core::Key::Bytes(_bytes) => return Err(binding_error(BindingError::Internal { detail: String::from("a byte string key of a keyed map") })),
        };
        entries.set(&key, &item(value)?);
    }
    Ok(entries.into())
}

fn tuple_out(items: &[JsValue]) -> Result<JsValue, Fail> {
    Ok(items.iter().collect::<Array>().into())
}

/// An optional value, owned or borrowed (\`&Option<T>\` is an \`Option<&T>\`); the absence is null (T-7).
fn optional_out<T>(value: impl Into<Option<T>>, item: impl FnOnce(T) -> Result<JsValue, Fail>) -> Result<JsValue, Fail> {
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
    let text = text_in(value, subject)?;
    match text.as_str() {
${arms}
        _ => Err(type_error(subject, ${rustString(jsName)})),
    }
}

fn out_${name}(value: impl Borrow<${core}>) -> Result<JsValue, Fail> {
    let text = match value.borrow() {
${outArms}
    };
    text_out(text)
}
`;
}

function recordRust(model: Model, unit: Unit, library?: string): string {
  const name = recordFn(unit);
  const core = unit.core_type ?? '';
  const fields = unit.fields ?? [];
  const reads = fields.map((f) => {
    const js = langName('wasm', f.name, 'variable');
    return `    let ${rustField(f.name)}: ${rustType(model, f.type)} = ${convertIn(model, f.type, `&member(value, ${rustString(js)}, subject)?`, rustString(js))}?;${narrows(f.type) ? `\n    ${narrowed(rustField(f.name), rustString(js), 'binding_error')}` : ''}`;
  });
  const writes = fields.map((f) => `    Reflect::set(&object, &JsValue::from_str(${rustString(langName('wasm', f.name, 'variable'))}), &${convertOut(model, f.type, `${copied(f.type) ? '' : '&'}value.${rustField(f.name)}`)}?).map_err(|error| internal(&error))?;`);
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

// T-9, GN-6v: a value of a variant is a plain object whose tag member is the text of one of its cases, with a member
// per field of the case, judged as it enters (T-8); a value leaves as such an object, by a match without a wildcard.
function variantRust(model: Model, variant: Variant): string {
  const name = recordFn(variant.unit);
  const core = variant.unit.core_type ?? '';
  const jsName = langName('wasm', variant.unit.name, 'class');
  const tag = langName('wasm', variant.unit.tag ?? [], 'variable');
  const set = (key: string, value: string): string => `            Reflect::set(&object, &JsValue::from_str(${rustString(key)}), &${value}?).map_err(|error| internal(&error))?;`;
  const ins = variant.cases.map((kase) => {
    const fields = caseFields(model, variant, kase);
    const reads = fields.map((f) => {
      const js = langName('wasm', f.field.name, 'variable');
      // GN-6v: a field that may be left out is null when its member is missing or undefined.
      const read = caseLeftOut(f.field) ? `default_in(&member(value, ${rustString(js)}, subject)?, |value| ${convertIn(model, f.field.type, 'value', rustString(js))}).map(Option::flatten)` : convertIn(model, f.field.type, `&member(value, ${rustString(js)}, subject)?`, rustString(js));
      return `            let ${f.variable}: ${caseType(model, f)} = ${caseRead(f, `${read}?`)};${f.boxed === undefined && narrows(f.field.type) ? `\n            ${narrowed(f.variable, rustString(js), 'binding_error')}` : ''}`;
    });
    const built = `Ok(${caseStruct(variant, kase, fields)})`;
    return `        ${rustString(kase.value)} => ${reads.length === 0 ? `${built},` : `{\n${reads.join('\n')}\n            ${built}\n        }`}`;
  });
  const arms = variant.cases.map((kase) => {
    const fields = caseFields(model, variant, kase);
    // An optional Box gives its value as Option<&T>, which the match of the optional takes.
    const value = (f: CaseField): string => (f.boxed === 'optional' ? `${f.variable}.as_deref()` : copied(f.field.type) || f.boxed === 'box' ? caseValue(model, f) : f.variable);
    const writes = [set(tag, `text_out(${rustString(kase.value)})`), ...fields.map((f) => set(langName('wasm', f.field.name, 'variable'), convertOut(model, f.field.type, value(f))))];
    return `${fields.length === 0 ? `        ${UNIT_CASE_ALLOW}\n` : ''}        ${caseStruct(variant, kase, fields)} => {\n${writes.join('\n')}\n        }`;
  });
  return `
/// T-9: a value of the variant ${jsName} is an object whose member ${tag} is the text of one of its cases, with the fields of that case, judged as they enter (T-8).
fn in_${name}(value: &JsValue, subject: &str) -> Result<${core}, Fail> {
    let tag = text_in(&member(value, ${rustString(tag)}, subject)?, ${rustString(tag)})?;
    match tag.as_str() {
${ins.join('\n')}
        _ => Err(type_error(subject, ${rustString(jsName)})),
    }
}

/// T-9: a value of the variant ${jsName} leaves as the object of its case.
fn out_${name}(value: impl Borrow<${core}>) -> Result<JsValue, Fail> {
    let object = Object::new();
    match value.borrow() {
${arms.join('\n')}
    }
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

// GN-4c: the Rust name of an export: function_<name> of a function, and member_<member> of a member of a class, which
// is a function of the module class_<unit> of its class (objectRust), so the class and the member are read apart; the
// prefix keeps a member named as a helper, such as guard, from hiding the helper in that module.
const rustExport = (fn: Fn): string =>
  `${fn.kind === 'function' ? 'function' : 'member'}_${fn.kind === 'constructor' ? 'new' : rustField(fn.member.name).replace(/^r#/, '')}`;

// GN-6h: whether the class of a member holds its value in a lock.
const locked = (model: Model, fn: Fn): boolean => model.objects.find((o) => o.unit === fn.unit)?.lock !== undefined;

// GN-6h: the name of a class in the message of kind busy and of a poisoned object.
const classLabel = (object: ObjectClass): string => langName('wasm', object.unit.name, 'class');

// T-5, GN-6h: the lines that read the value of the receiver: the reference itself, or the lock whose guard the lines
// of lockLines take.
function receiverLines(model: Model, fn: Fn): string[] {
  const lines = [`        let held = held_${plainName(fn.unit)}(this)?;`];
  if (!locked(model, fn)) return [...lines, `        let this: &${fn.unit.core_type ?? ''} = &held;`];
  return lines;
}

// N-4 iterate: the export gives the items, or [key, value] for the entries, as an array converted when the iteration
// starts (a snapshot of the class's value); the ES module makes it the class's Symbol.iterator.
function iterateRust(model: Model, fn: Fn): string {
  const yields = fn.yields ?? { value: 'none' };
  const item = (type: Type, value: string): string => `${convertOut(model, type, borrowedItem(model, type, value))}?`;
  const body = yields.key === undefined
    ? `            items.push(&${item(yields.value, 'item')});`
    : `            let (key, value) = item;
            items.push(&tuple_out(&[${item(yields.key, 'key')}, ${item(yields.value, 'value')}])?);`;
  return withFaults(model, fn, `
/// ${docPath(fn.corePath)} (contract member ${fn.member.id}).
#[wasm_bindgen(js_name = ${rustString(exportName(fn))})]
pub fn ${rustExport(fn)}(this: u32) -> Result<JsValue, JsValue> {
    guard(|| {
${[...receiverLines(model, fn), ...lockLines(model, fn, (p) => rustField(p.name), 'held', 'binding_error', classLabel)].join('\n')}
        let items = Array::new();
        for item in ${armedCall(model, fn, `${fn.corePath}(${locked(model, fn) ? RECEIVER_GUARD : 'this'})`)} {
${body}
        }
        Ok(items.into())
    })
    .map_err(throw)
}
`);
}

function functionRust(model: Model, fn: Fn): string {
  if (fn.kind === 'iterate') return iterateRust(model, fn);
  const jsName = fn.kind === 'function' ? langName('wasm', fn.member.name, 'callable') : exportName(fn);
  // T-5: a method or property takes the handle of its instance first, which the ES module reads from the instance.
  const params = [...(fn.receiver === undefined ? [] : ['this: u32']), ...fn.params.map((p) => `${rustField(p.name)}: JsValue`)].join(', ');
  const lines: string[] = [];
  if (fn.receiver !== undefined) lines.push(...receiverLines(model, fn));
  // U-2: an argument that may be left out is undefined when it is, and its variable an Option.
  const converted = (arg: Arg | undefined, type: Type, raw: string, subject: string): string =>
    arg?.default === undefined ? convertIn(model, type, raw, subject) : leftOut(arg, `default_in(${raw}, ${closure(['value'], convertIn(model, type, 'value', subject))})`);
  for (const parameter of fn.params) {
    const variable = rustField(parameter.name);
    if (fn.record !== undefined && parameter === fn.record.param) {
      for (const field of fn.record.unit.fields ?? []) {
        const name = langName('wasm', field.name, 'variable');
        const arg = fn.args.find((a) => a.field && a.name === field.name);
        const raw = `&${parameter.default === undefined ? 'member' : 'member_or_undefined'}(&${variable}, ${rustString(name)}, ${rustString(langName('wasm', parameter.name, 'variable'))})?`;
        lines.push(`        let ${rustField(field.name)}: ${arg === undefined ? rustType(model, field.type) : argType(model, arg)} = ${boxed(model, field.type, converted(arg, field.type, raw, rustString(name)))}?;`);
        if (narrows(field.type)) lines.push(`        ${narrowed(rustField(field.name), rustString(name), 'binding_error')}`);
      }
      const recordType = fn.record.unit.core_type ?? '';
      const recordLet = rustType(model, { unit: fn.record.unit.id });
      lines.push(`        let ${variable}: ${recordLet} = ${recordType} { ${(fn.record.unit.fields ?? []).map((f) => rustField(f.name)).join(', ')} };`);
    } else if (machineFunction(parameter.type)) {
      // GN-6ae: a function parameter is the closure that the machine of the member calls.
      lines.push(...functionClosure(model, parameter.type, variable, rustString(langName('wasm', parameter.name, 'variable'))));
    } else if (heldParam(model, parameter.type) !== undefined) {
      // GN-6h: a parameter of a class with a lock is the value that its instance holds, whose lock the call takes.
      const object = heldParam(model, parameter.type);
      lines.push(`        let ${variable} = held_param_${plainName(object?.unit ?? fn.unit)}(&${variable}, ${rustString(langName('wasm', parameter.name, 'variable'))})?;`);
    } else {
      const arg = fn.args.find((a) => !a.field && a.name === parameter.name);
      lines.push(`        let ${variable}: ${arg === undefined ? rustType(model, parameter.type) : argType(model, arg)} = ${converted(arg, parameter.type, `&${variable}`, rustString(langName('wasm', parameter.name, 'variable')))}?;`);
      if (arg?.default === undefined && narrows(parameter.type)) lines.push(`        ${narrowed(variable, rustString(langName('wasm', parameter.name, 'variable')), 'binding_error')}`);
    }
  }
  // GN-6h: the guards of the places of the call, the receiver's first. A future owns the guards (GN-6n), so it binds
  // the borrows of the guards inside it.
  // GN-6ab: the core of a member with machine is called at once, so the entry binds the borrows.
  const moved = waitsAsync(fn) && fn.machine !== true;
  lines.push(...lockLines(model, fn, (p) => rustField(p.name), 'held', 'binding_error', classLabel, !moved));
  const borrows = moved ? guardBorrows(model, fn, (p) => rustField(p.name)).map((line) => `${line} `).join('') : '';
  // The receiver is the reference above, or the guard of its lock, the first argument of the core path (U-2
  // core.receiver).
  const callArgs = coreCallArgs(model, fn, (p) => rustField(p.name), 'this');
  const core = `${fn.corePath}(${(fn.receiver === undefined || locked(model, fn) ? callArgs : ['this', ...callArgs.slice(1)]).join(', ')})`;
  // G-5: the core call runs with the faults that a test armed for the member (GN-8a).
  const call = armedCall(model, fn, core);
  // E-1c: a member that takes a callback fails with a Failure: a kind, or the exception that the callback threw.
  const failed = fn.failure ? 'failure_error' : 'core_error';
  if (fn.machine === true) {
    // GN-6ab: the machine owns the converted arguments. Each advance gives it the output of its last wait, makes its
    // calls on the JavaScript thread and gives the promise of its next wait, whose future the event loop polls, or its
    // converted result.
    const done = fn.fallible ? `let result = result.map_err(${failed})?;\n                    ` : '';
    const wait = futureOf(model, fn, 'let output = io.await;\n                        *given.borrow_mut() = Some(output);\n                        Ok(())');
    // GN-6ae: an advance takes the outcome of the value that the machine awaited, and only after that value.
    const settles = passes(fn) ? `
            match (awaiting, outcome_of(&settled)?) {
                (true, Some(outcome)) => machine.settle(outcome),
                (false, None) => {}
                (true, None) | (false, Some(_)) => {
                    return Err(binding_error(BindingError::Internal { detail: String::from(${JSON.stringify(`GN-6ae: ${fn.member.id} takes the outcome of an awaited value after that value, and at no other advance`)}) }));
                }
            }
            awaiting = false;` : '';
    const awaitedValue = passes(fn) ? `binding_core::machine::Next::Await(value) => {
                    awaiting = true;
                    Ok((1, passed_out(value)?))
                }` : awaitsNone(fn);
    lines.push(`        let mut machine = binding_core::machine::Driving::new(${core});
        let given = Rc::new(RefCell::new(None));${passes(fn) ? '\n        let mut awaiting = false;' : ''}
        Ok(JsValue::from(Driven::new(move |${passes(fn) ? 'settled' : '_settled'}| {${settles}
            let output = given.borrow_mut().take();
            if let Some(output) = output {
                machine.give(output);
            }
            match machine.advance() {
                binding_core::machine::Next::Wait(io) => {
                    let given = Rc::clone(&given);
                    let promise = awaited(${wait}, |()| Ok(JsValue::UNDEFINED))?;
                    Ok((0, promise))
                }
                ${awaitedValue}
                binding_core::machine::Next::Done(result) => {
                    ${done}Ok((2, ${convertOut(model, fn.returns, 'result')}?))
                }
            }
        })))`);
  } else if (waitsAsync(fn)) {
    // GN-6n: the future owns the converted arguments and the guards; the event loop of JavaScript polls it, and its
    // result is converted when it ends.
    const body = `${borrows}${fn.fallible ? `${core}.await.map_err(${failed})` : `Ok(${core}.await)`}`;
    const give = convertOut(model, fn.returns, 'result');
    lines.push(`        awaited(${futureOf(model, fn, body)}, ${closure([/\bresult\b/.test(give) ? 'result' : '_result'], give)})`);
  } else if (fn.fallible && fn.returns === 'none') {
    // A fallible member that returns nothing gives its error alone (E-1c).
    lines.push(`        if let Err(error) = ${call} {\n            return Err(${failed}(error));\n        }`);
  } else if (fn.fallible) {
    lines.push(`        let result = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(${failed}(error)),\n        };`);
  } else if (fn.returns === 'none') {
    lines.push(`        ${call};`);
  } else {
    lines.push(`        let result = ${call};`);
  }
  // T-5: the constructor gives the handle of the new value, which the instance under construction keeps.
  if (!waitsAsync(fn)) lines.push(fn.kind === 'constructor' ? `        insert_${plainName(fn.unit)}(result)` : `        ${convertOut(model, fn.returns, 'result')}`);
  return withFaults(model, fn, `
/// ${docPath(fn.corePath)} (contract member ${fn.member.id}).
#[wasm_bindgen(js_name = ${rustString(jsName)})]
pub fn ${rustExport(fn)}(${params}) -> Result<${fn.kind === 'constructor' ? 'u32' : 'JsValue'}, JsValue> {
    guard(|| {
${lines.join('\n')}
    })
    .map_err(throw)
}
`);
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
/// T-5: the value that an instance of ${jsClass} holds${object.lock === undefined ? '' : ', in its lock (GN-6h)'}. A handle that names none is a fault of the ES
/// module: kind internal.
fn held_${plain}(handle: u32) -> Result<Rc<${heldType(object)}>, Fail> {
    ${table}.with(|table| table.borrow().get(handle)).ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("T-5: no value of ${jsClass} has this handle") }))
}

/// T-5: keeps a value of ${jsClass} and gives its handle.
fn insert_${plain}(value: ${core}) -> Result<u32, Fail> {
    ${table}.with(|table| table.borrow_mut().insert(${heldNew(object, 'value')}))
}
${takesHeld(model, object) ? `
/// T-5, GN-6h: a parameter of the class ${jsClass} takes an instance of it, whose lock the call takes.
fn held_param_${plain}(value: &JsValue, subject: &str) -> Result<Rc<${heldType(object)}>, Fail> {
    let handle = handle_of(${index}, value)?.ok_or_else(|| type_error(subject, ${rustString(jsClass)}))?;
    held_${plain}(handle)
}
` : ''}

/// T-5: a value of ${jsClass} leaves as a new instance, which the ES module makes around the handle of the value.
fn out_${name}(value: impl CoreForm<${core}>) -> Result<JsValue, Fail> {
    let handle = insert_${plain}(value.core_form())?;
    make_instance(${index}, handle).inspect_err(|_fail| drop(${table}.with(|table| table.borrow_mut().remove(handle))))
}
${takesObject(model, object) ? `
/// T-5: a value of the class ${jsClass} is an instance of it; the core takes a copy of the value it holds.
fn in_${name}(value: &JsValue, subject: &str) -> Result<${core}, Fail> {
    let handle = handle_of(${index}, value)?.ok_or_else(|| type_error(subject, ${rustString(jsClass)}))?;
    ${object.lock === undefined ? `held_${plain}(handle).map(|held| ${core}::clone(&held))` : `let held = held_${plain}(handle)?;
    let value = held.read(${rustString(jsClass)}, &[]).map_err(binding_error)?;
    Ok(${core}::clone(&value))`}
}
` : ''}`;
}

// GN-6ap: a value of a generated interface is an instance of a class that implements it; the core takes the From of
// the value that the instance holds.
function interfaceRust(model: Model, iface: Unit): string {
  const jsName = langName('wasm', iface.name, 'class');
  const core = iface.core_type ?? '';
  return `
/// GN-6ap: a value of the interface ${jsName} is an instance of a class that implements it, whose value the core takes
/// as ${core}.
fn in_${rustField(iface.name)}(value: &JsValue, subject: &str) -> Result<${core}, Fail> {
${implementorsOf(model, iface).map((o) => `    if handle_of(${model.objects.findIndex((other) => other.unit.id === o.unit.id)}, value)?.is_some() {
        return in_${rustField(o.unit.name)}(value, subject).map(|held| <${core} as From<&${o.unit.core_type ?? ''}>>::from(&held));
    }
`).join('')}    Err(type_error(subject, ${rustString(jsName)}))
}
`;
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
    static ${tableName(o.unit)}: RefCell<Table<${heldType(o)}>> = const { RefCell::new(Table::new()) };`).join('\n');
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
    fn remove(&mut self, handle: u32) -> Option<Rc<T>> {
        let removed = self.values.remove(&handle);
        if removed.is_some() {
            self.free.push(handle);
        }
        removed
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
  return `
/// T-5, GN-4c: the exports of the members of ${jsClass}, each a function of this module.
pub mod class_${name} {
    use super::*;
${object.members.map((fn) => functionRust(model, fn)).join('').replace(/\n(?=.)/g, '\n    ')}}

/// T-5: drops the value of an instance of ${jsClass} that the engine collected (the FinalizationRegistry of the ES module).${object.cleanup === undefined ? `
#[wasm_bindgen(js_name = ${rustString(`__free_${jsClass}`)})]
pub fn free_${name}(this: u32) {
    drop(${tableName(object.unit)}.with(|table| table.borrow_mut().remove(this)));
}` : `
/// GN-6p, B-10: the answer is true when the cleanup call did not consume the value, so that this call dropped it and
/// the ES module warns.
#[wasm_bindgen(js_name = ${rustString(`__free_${jsClass}`)})]
pub fn free_${name}(this: u32) -> bool {
    ${tableName(object.unit)}.with(|table| table.borrow_mut().remove(this)).is_some_and(|held| !held.${cleanupMade(object)}())
}`}
`;
}

// E-2: the index of the class of a kind in CLASSES: the class of its error unit, after the classes of the categories,
// or the class of its category.
const kindClass = (model: Model, k: Model['kinds'][number]): number =>
  k.unit === undefined ? model.classes.findIndex((c) => c.category === k.category) : model.classes.length + model.errorUnits.indexOf(k.unit);

// I-3: whether an error unit of the contract has a property, which the failure then carries.
const hasProperties = (model: Model): boolean => model.errorUnits.some((u) => errorProperties(u).length > 0);

// U-3, U-7: whether a failure may carry an exception of JavaScript code (of a callback, of a function of a function
// type or of a machine, or of a value that the core walks), which the call throws again unchanged.
const carriesThrown = (model: Model): boolean => keepsThrown(model) || model.aliases.length > 0 || passesAny(model);

// GN-6ae: whether a member takes a function parameter or returns passthrough, and whether a contract has such a member.
const passes = (fn: Fn): boolean => fn.params.some((p) => machineFunction(p.type)) || (typeof fn.returns === 'object' && 'passthrough' in fn.returns);
const passesAny = (model: Model): boolean => [...model.functions, ...model.objects.flatMap((o) => o.members)].some(passes);

// GN-6ae: the lines that make the closure of a function parameter from a JavaScript function. The machine owns the
// function, a value of the module, and its closure runs in Machine::call, on the thread of the module: each call makes
// the JavaScript value of each argument, a class argument as a new instance of its class, and gives what the function
// returned as a Passthrough, or the value that it threw as a Raised.
function functionClosure(model: Model, type: Type & { function: unknown }, name: string, subject: string): string[] {
  const parts = (type as { function: { parameters: Type[] } }).function.parameters;
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  const outs = parts.map((part, i) => `${convertOut(model, part, `arg${i}`)}.map_err(Thrown::Binding)?`);
  return [
    `        let ${name} = callable_in(&${name}, ${subject})?;`,
    `        let ${name} = move |${parts.map((part, i) => `arg${i}: ${rustType(model, part)}`).join(', ')}| -> Result<binding_core::Passthrough, ${failure}> {`,
    '            let call = || -> Result<binding_core::Passthrough, Thrown> {',
    `                let args: Array = ${outs.length === 0 ? 'Array::new()' : `[${outs.join(', ')}].iter().collect()`};`,
    `                let returned = ${name}.apply(&JsValue::UNDEFINED, &args).map_err(Thrown::Js)?;`,
    '                Ok(pass(returned))',
    '            };',
    '            call().map_err(thrown)',
    '        };',
  ];
}

// GN-6ae, B-3: the table of the values that the functions of JavaScript code returned, each under the handle of its
// Passthrough; the check of a function that enters; and the outcome of an awaited value.
function passingRust(model: Model): string {
  if (!passesAny(model)) return '';
  return `
thread_local! {
    /// GN-6ae, B-3: the values that the functions of JavaScript code returned, each until its Passthrough ends.
    static PASSED: RefCell<BTreeMap<u64, JsValue>> = const { RefCell::new(BTreeMap::new()) };
}

static NEXT_PASSED: AtomicU64 = AtomicU64::new(1);

/// GN-6ae: holds a JavaScript value in the table, which the core moves and never reads.
fn pass(value: JsValue) -> binding_core::Passthrough {
    let handle = NEXT_PASSED.fetch_add(1, Ordering::Relaxed);
    PASSED.with_borrow_mut(|map| map.insert(handle, value));
    binding_core::Passthrough::from_generated(binding_core::Handle::new(handle), release_passed)
}

/// GN-6ae: removes the value of a Passthrough that the core dropped, which ends after the table is released; a thread
/// that ends holds no table.
fn release_passed(handle: binding_core::Handle) {
    let gone = PASSED.try_with(|map| map.borrow_mut().remove(&handle.raw()));
    drop(gone);
}

/// GN-6ae: the value of a result passthrough, or of a value that the machine awaits, which leaves the table unchanged.
fn passed_out(value: binding_core::Passthrough) -> Result<JsValue, Fail> {
    let handle = value.into_handle();
    PASSED
        .with_borrow_mut(|map| map.remove(&handle.raw()))
        .ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("GN-6ae: the value of the passthrough is gone") }))
}

/// GN-6ae: a function parameter takes a function (kind invalid_callback), which the machine owns.
fn callable_in(value: &JsValue, subject: &str) -> Result<Function, Fail> {
    value
        .dyn_ref::<Function>()
        .cloned()
        .ok_or_else(|| binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::new() }))
}

/// GN-6ae: the outcome of the value that a machine awaited, which the ES module gives to the next advance: undefined
/// when the machine awaited none, [true, the value] of a value or of a fulfilled promise, which enters the table again,
/// and [false, the rejection] of a rejected promise, which is kept as the exception of the function.
fn outcome_of(settled: &JsValue) -> Result<Option<Result<binding_core::Passthrough, binding_core::Raised>>, Fail> {
    if settled.is_undefined() {
        return Ok(None);
    }
    let [fulfilled, value] = tuple_in(settled, "settled")?;
    if bool_in(&fulfilled, "settled")? {
        return Ok(Some(Ok(pass(value))));
    }
    Ok(Some(Err(raised(Thrown::Js(value)))))
}
`;
}

// The fields of a Fail that a library error sets to nothing: the exception (U-3) and the properties (I-3).
const failRest = (model: Model): string => `${carriesThrown(model) ? ', thrown: None' : ''}${hasProperties(model) ? ', properties: Vec::new()' : ''}`;

// U-3: a callback is a struct that holds the JavaScript object and implements the core trait, as for Node (GN-6d); an
// exception of the JavaScript code, or a failure of the module in the callback, goes to the core as a Raised that the
// generated caller throws again unchanged. A WebAssembly instance runs on the thread that loaded it, so a callback is
// always called on that thread, and thread owner needs no check.
function callbackRust(model: Model, cb: CallbackUnit): string {
  const name = rustField(cb.unit.name);
  const struct = rustType(model, { unit: cb.unit.id });
  const jsName = langName('wasm', cb.unit.name, 'class');
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  const methods = cb.members.map((m) => {
    const method = langName('wasm', m.member.name, 'callable');
    const params = m.params.map((p) => `, ${rustField(p.name)}: ${traitParam(model, p.type)}`).join('');
    const outs = m.params.map((p) => `${convertOut(model, p.type, rustField(p.name))}.map_err(Thrown::Binding)?`);
    const result = m.returns === 'none' ? '()' : rustType(model, m.returns);
    const returned = m.returns === 'none'
      ? `function.apply(&self.object, &args).map_err(Thrown::Js)?;
            Ok(())`
      : `let returned = function.apply(&self.object, &args).map_err(Thrown::Js)?;
            ${convertIn(model, m.returns, '&returned', rustString(`${jsName}.${method}() returns`))}.map_err(Thrown::Binding)`;
    return `
    fn ${rustField(m.member.name)}(${m.receiver}${params}) -> Result<${result}, ${failure}> {
        let call = || -> Result<${result}, Thrown> {
            let function: Function = Reflect::get(&self.object, &JsValue::from_str(${rustString(method)}))
                .and_then(|found| found.dyn_into::<Function>())
                .map_err(|error| Thrown::Binding(internal(&error)))?;
            let args: Array = ${outs.length === 0 ? 'Array::new()' : `[${outs.join(', ')}].iter().collect()`};
            ${returned}
        };
        call().map_err(${m.recognized === undefined ? 'thrown' : recognizedFn(cb, m)})
    }`;
  }).join('\n');
  const recognizing = cb.members.filter((m) => m.recognized !== undefined).map((m) => `
/// U-3: an exception of ${m.member.id}: an instance of an error unit that it recognizes, with one of the kinds of that
/// unit, is the core error of the kind (GN-6d); any other exception goes back to the caller as it is.
fn ${recognizedFn(cb, m)}(error: Thrown) -> ${failure} {
    let Thrown::Js(value) = &error else {
        return thrown(error);
    };
    let core = recognized_kind(value, &[${(m.recognized?.units ?? []).map((u) => model.classes.length + model.errorUnits.indexOf(u)).join(', ')}]).and_then(|(kind, message)| ${recognizedMatch(m, '    ')});
    match core {
        Some(core) => binding_core::Failure::Kind(core),
        None => thrown(error),
    }
}
`).join('');
  const checks = cb.members.map((m) => {
    const method = langName('wasm', m.member.name, 'callable');
    return `    let found = Reflect::get(value, &JsValue::from_str(${rustString(method)})).map_err(|error| internal(&error))?;
    if !found.is_function() {
        return Err(binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::from(${rustString(method)}) }));
    }`;
  }).join('\n');
  return `
/// U-3: ${jsName}, a callback that JavaScript code implements; the core calls it through ${cb.unit.core ?? ''}.
struct ${struct} {
    object: JsValue,
}

/// U-3: a callback object is checked when it enters: each member is a function (kind invalid_callback).
fn in_${name}(value: &JsValue, subject: &str) -> Result<${struct}, Fail> {
    if !value.is_object() {
        return Err(binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::new() }));
    }
${checks}
    Ok(${struct} { object: value.clone() })
}

impl ${cb.unit.core ?? ''} for ${struct} {${methods}
}
${recognizing}`;
}

// U-3, GN-6d: the kind and the message of an exception whose prototype chain holds the prototype of one of the error
// classes, for the members that recognize error units.
const RECOGNIZED_KIND = `
/// U-3: the kind and the message of an exception that is an instance of one of the library classes (GN-6d).
fn recognized_kind(value: &JsValue, classes: &[usize]) -> Option<(String, String)> {
    if !value.is_object() {
        return None;
    }
    for index in classes {
        let prototype = CLASSES.with(|registered| registered.borrow().get(*index).map(|class| Reflect::get(class, &JsValue::from_str("prototype"))))?.ok()?;
        let mut current = Object::get_prototype_of(value);
        while !current.is_null() {
            if Object::is(&current, &prototype) {
                let kind = Reflect::get(value, &JsValue::from_str("kind")).ok()?.as_string()?;
                let message = Reflect::get(value, &JsValue::from_str("message")).ok()?.as_string()?;
                return Some((kind, message));
            }
            current = Object::get_prototype_of(&current);
        }
    }
    None
}
`;

// E-1c, U-3: what a callback, or a value that the core walks, threw, kept under the handle of its Raised until the
// generated caller throws it again; and the failure of a core that calls back, as the error of its kind or that
// exception.
function failureRust(model: Model): string {
  if (!carriesThrown(model)) return '';
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  return `
/// U-3: an exception of the JavaScript code, or a failure of the module, in a callback or while the core walks a value.
enum Thrown {
    Js(JsValue),
    Binding(Fail),
}

thread_local! {
    /// U-3: what was thrown, under the handle of its Raised.
    static THROWN: RefCell<BTreeMap<u64, Thrown>> = const { RefCell::new(BTreeMap::new()) };
}

static NEXT_THROWN: AtomicU64 = AtomicU64::new(1);

/// U-3, GN-6u: what a Raised holds: the key of what was thrown in THROWN, whose last drop removes it, so an exception
/// that the core drops is not kept. The module has one thread, which holds the table.
#[derive(Debug)]
struct ThrownKey {
    key: u64,
}

impl binding_core::NativeObject for ThrownKey {}

impl Drop for ThrownKey {
    fn drop(&mut self) {
        let taken = THROWN.try_with(|map| map.try_borrow_mut().ok().and_then(|mut map| map.remove(&self.key)));
        drop(taken);
    }
}

/// U-3: keeps what was thrown, as the Raised that the core gives back.
fn raised(error: Thrown) -> binding_core::Raised {
    let key = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    THROWN.with_borrow_mut(|map| map.insert(key, error));
    binding_core::Raised::from_generated(binding_core::Native::new(ThrownKey { key }))
}
${!keepsThrown(model) && !passesAny(model) ? '' : `
fn thrown(error: Thrown) -> ${failure} {
    binding_core::Failure::Raised(raised(error))
}
`}
fn failure_error(failure: ${failure}) -> Fail {
    match failure {
        ${model.coreError === undefined ? 'binding_core::Failure::Kind(()) => binding_error(BindingError::Internal { detail: String::from("E-1c: this library names no kind, so no call gives one") })' : 'binding_core::Failure::Kind(error) => core_error(error)'},
        binding_core::Failure::Raised(raised) => match raised.native().downcast::<ThrownKey>().and_then(|thrown| THROWN.with_borrow_mut(|map| map.remove(&thrown.key))) {
            Some(Thrown::Js(error)) => Fail { thrown: Some(error), ..binding_error(BindingError::Internal { detail: String::new() }) },
            Some(Thrown::Binding(fail)) => fail,
            None => binding_error(BindingError::Internal { detail: String::from("U-3: the exception of the callback is gone") }),
        },
        binding_core::Failure::Callback(error) => binding_error(BindingError::Internal { detail: error.to_string() }),
    }
}
`;
}

function coreErrorRust(model: Model): string {
  if (model.coreError === undefined) return '';
  const arms = model.kinds.map((k) => `        ${variantPattern(k.variant)} => ${kindClass(model, k)},`).join('\n');
  const doc = `/// I-2 (3): the class of each variant of the core error, by a match without a wildcard. The pattern \`{ .. }\` matches a
/// variant with or without data, which the generator does not see (I-2: binding reads no Rust source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]`;
  if (!hasProperties(model)) {
    return `
${doc}
fn core_error(error: ${model.coreError}) -> Fail {
    let class: usize = match ${errorMatched(model, 'error')} {
${arms}
    };
    Fail { class, message: error.to_string(), kind: Kinds::kind(&error), status: Kinds::status(&error), errno: Kinds::errno(&error)${failRest(model)} }
}
`;
  }
  // E-2, I-3: the kind of an error unit with properties is an instance of its class with them, read from the core
  // error by a second match without a wildcard.
  const propertyArms = model.kinds.map((k) => {
    const properties = k.unit === undefined ? [] : errorProperties(k.unit);
    const values = properties.map(({ property }) => `(${rustString(langName('wasm', property.member.name, 'variable'))}, ${convertOut(model, property.returns, propertyValue(property, '&error', (failure) => `core_error(${failure})`))})`);
    return `        ${variantPattern(k.variant)} => ${values.length === 0 ? 'Vec::new()' : `vec![${values.join(', ')}]`},`;
  }).join('\n');
  return `
${doc}
fn core_error(error: ${model.coreError}) -> Fail {
    let class: usize = match ${errorMatched(model, 'error')} {
${arms}
    };
    let converted: Vec<(&'static str, Result<JsValue, Fail>)> = match ${errorMatched(model, 'error')} {
${propertyArms}
    };
    let mut properties = Vec::new();
    for (name, value) in converted {
        match value {
            Ok(value) => properties.push((name, value)),
            Err(fail) => return fail,
        }
    }
    Fail { class, message: error.to_string(), kind: Kinds::kind(&error), status: Kinds::status(&error), errno: Kinds::errno(&error)${carriesThrown(model) ? ', thrown: None' : ''}, properties }
}
`;
}

// GN-6n: the promise of the future of a member with wait async_driver, which the event loop of JavaScript polls
// (wasm-bindgen-futures); no tokio runtime runs in a WebAssembly module.
const AWAITED = `
/// GN-6n: the promise of a future of a member with wait async_driver, which the event loop of JavaScript polls: its
/// result is converted when it ends, and its failure rejects the promise.
fn awaited<F, O>(future: F, give: impl FnOnce(O) -> Result<JsValue, Fail> + 'static) -> Result<JsValue, Fail>
where
    F: std::future::Future<Output = Result<O, Fail>> + 'static,
    O: 'static,
{
    let promise = wasm_bindgen_futures::future_to_promise(async move { caught(future).await.and_then(give).map_err(throw) });
    Ok(promise.into())
}

/// GN-6n, B-7: the output of a future, or kind internal for a panic of a poll where the module unwinds; a module built
/// with panic=abort traps instead (GN-18).
async fn caught<F, O>(future: F) -> Result<O, Fail>
where
    F: std::future::Future<Output = Result<O, Fail>>,
{
    let mut future = std::pin::pin!(future);
    std::future::poll_fn(|context| match catch_unwind(AssertUnwindSafe(|| future.as_mut().poll(context))) {
        Ok(poll) => poll,
        Err(payload) => {
            let detail = match (payload.downcast_ref::<&str>(), payload.downcast_ref::<String>()) {
                (Some(text), _) => (*text).to_owned(),
                (None, Some(text)) => text.clone(),
                (None, None) => String::from("a panic without a message"),
            };
            std::task::Poll::Ready(Err(binding_error(BindingError::Internal { detail })))
        }
    })
    .await
}
`;

// GN-6ab: the state machine of a member with wait async_driver that reaches language code, which the ES module
// advances.
const MACHINE = `
/// GN-6ab: the state machine of a call, which the ES module advances until it ends. Each advance makes the calls of
/// the machine on the JavaScript thread and gives [0, the promise of its wait], [1, the value that it awaits] (GN-6ae)
/// or [2, its result].
#[wasm_bindgen]
pub struct Driven {
    advance: Advance,
}

/// GN-6ab, GN-6ae: one advance of the state machine of a call: its step, and the promise of its wait (0), the value
/// that it awaits (1) or its result (2).
type Advance = Box<dyn FnMut(JsValue) -> Result<(u32, JsValue), Fail>>;

impl Driven {
    fn new(advance: impl FnMut(JsValue) -> Result<(u32, JsValue), Fail> + 'static) -> Self {
        Self { advance: Box::new(advance) }
    }
}

#[wasm_bindgen]
impl Driven {
    /// GN-6ab, GN-6ae: one advance of the state machine, which takes the outcome of the value that the machine awaited:
    /// its step, and the promise of its wait, the value that it awaits or its result.
    pub fn advance(&mut self, settled: JsValue) -> Result<JsValue, JsValue> {
        guard(|| {
            let (step, value) = (self.advance)(settled)?;
            tuple_out(&[JsValue::from(step), value])
        })
        .map_err(throw)
    }
}
`;

// GN-6ab: whether a member of the model drives a state machine.
const machineMember = (model: Model): Fn | undefined => [...model.functions, ...model.objects.flatMap((o) => o.members)].find((fn) => fn.machine === true);
const drivesMachine = (model: Model): boolean => machineMember(model) !== undefined;

// GN-6ab, G-5: the Driven class of a contract with a machine. Its advance is an entry point, whose work runs with no
// fault, as the work of every entry point does: language code may call it inside the call of another member.
function machineRust(model: Model): string {
  const machine = machineMember(model);
  return machine === undefined ? '' : withFaults(model, machine, MACHINE);
}

function libRust(model: Model): string {
  const classIndex = (category: string): string => String(model.classes.findIndex((c) => c.category === category));
  const constants = model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n') + defaultAsserts(model);
  const exported = [...model.functions.map((fn) => functionRust(model, fn)), ...model.objects.map((o) => objectRust(model, o)), keptExportsWasm(model), machineRust(model)].join('');
  // U-3, U-7: the callbacks and the failures that carry an exception, which the conversions outside the exports use.
  const callbacks = [...model.callbacks.map((c) => callbackRust(model, c)), ...model.interfaces.map((i) => interfaceRust(model, i)), model.callbacks.some((c) => c.members.some((m) => m.recognized !== undefined)) ? RECOGNIZED_KIND : '', failureRust(model), passingRust(model), foreignFailureWasm(model, failRest(model))].join('');
  const functions = `${exported}${callbacks}`;
  const objectUnits = model.objects.length === 0 ? [] : [OBJECT_HELPERS, ...model.objects.map((o, index) => objectHelpers(model, o, index))];
  // U-7: the conversions of a value alias and what describes a JavaScript value, used as far as the functions use them.
  const aliasUnits = [...(model.aliases.length === 0 ? [] : [...model.aliases.filter((a) => a.library === undefined).map((a) => aliasWasm(model, a)), wasmHost(model)]), ...(usesNative(model) ? [WASM_NATIVE] : [])];
  const units = [...model.enums.map(enumRust), ...model.resultRecords.map((u) => recordRust(model, u)), ...model.variants.map((v) => variantRust(model, v)), ...objectUnits, ...aliasUnits].join('\n');
  // I-3: the conversions of the properties of the error units count as uses.
  const propertyUses = model.errorUnits.flatMap((u) => u.properties.map((p) => convertOut(model, p.returns, 'value'))).join('\n');
  const used = usedHelpers(`${HELPERS}\n${AWAITED}\n${WIDEN}\n${INTO_CORE}\n${PARTS}\n${CORE_FORM}\n${units}`, `${functions}${propertyUses}`, {},
    libraryBlocks(model, (unit, library) => recordRust(model, unit, library), (a) => aliasWasm(model, a)));
  const state = objectState(model, `${used}${functions}`);
  // A name after :: (OutValue::Object) is not a use of the type.
  // The error of the crate (throw) names Array in every crate.
  const jsTypes = ['Array', 'JsString', 'Object', 'Uint8Array'].filter((t) => t === 'Array' || new RegExp(`(?<!::)\\b${t}\\b`).test(`${used}${functions}`) || (t === 'Object' && hasProperties(model)));
  const cast = /\.(dyn_ref|dyn_into|unchecked_into)::|\.(dyn_into|unchecked_ref)\(\)/.test(`${used}${functions}`) || hasProperties(model);
  const registered = model.objects.length === 0 ? '' : `
        MAKERS.with(|registered| registered.replace(makers));
        READERS.with(|registered| registered.replace(readers));`;
  return `${header('//')}
// The WebAssembly module of ${model.contract.library}. Its functions take the raw values and judge them (T-8); the
// JavaScript entry checks the count and the names of the arguments (G-7); a failure is an instance of its library class
// (B-4).

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
${usesNative(model) && model.aliases.length === 0 ? 'use binding_core::{Native, NativeObject};\n' : ''}${model.aliases.length > 0 ? `use binding_core::{Handle, HostText, HostValue, HostValues, Native, NativeObject, OutValue, OutValues, Prototype${/\bPredicate::/.test(used) ? ', Predicate' : ''}${/\bValueKind::/.test(used) ? ', ValueKind' : ''}};\n` : ''}use js_sys::{${[...jsTypes, 'Function', 'Reflect'].sort().join(', ')}};
${/Borrow</.test(used) ? 'use std::borrow::Borrow;\n' : ''}use std::cell::RefCell;
${model.objects.length === 0 && !carriesThrown(model) ? '' : 'use std::collections::BTreeMap;\n'}use std::panic::{catch_unwind, AssertUnwindSafe};
${model.objects.length === 0 && !drivesMachine(model) ? '' : 'use std::rc::Rc;\n'}${carriesThrown(model) ? 'use std::sync::atomic::{AtomicU64, Ordering};\n' : ''}use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::${cast ? '{JsCast, JsValue}' : 'JsValue'};

// U-5: the constants of the contract are the constants of the core.
${constants}

/// A failure on its way to the caller: the library class (an index of CLASSES), the message, the kind, the status and the
/// errno (B-4).
struct Fail {
    class: usize,
    message: String,
    kind: &'static str,
    status: Option<u16>,
    errno: Option<i32>,${carriesThrown(model) ? `
    // U-3: the exception that JavaScript code threw, which the call throws again unchanged.
    thrown: Option<JsValue>,` : ''}${hasProperties(model) ? `
    // I-3: the properties of an error unit, which its instance takes as read-only own properties.
    properties: Vec<(&'static str, JsValue)>,` : ''}
}

thread_local! {
    /// B-4: the library classes, which the JavaScript entry hands over when it loads the module, in the order of the
    /// contract. A WebAssembly module runs on the thread that loaded it.
    static CLASSES: RefCell<Vec<Function>> = const { RefCell::new(Vec::new()) };
}

/// The instance of the library class of a failure, as the value that the call throws (B-4).
fn throw(fail: Fail) -> JsValue {${carriesThrown(model) ? `
    if let Some(thrown) = fail.thrown {
        return thrown;
    }` : ''}
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
        Some(class) => match Reflect::construct(class, &args) {${hasProperties(model) ? `
            Ok(error) => {
                for (name, value) in fail.properties {
                    let descriptor = Object::new();
                    let defined = Reflect::set(&descriptor, &JsValue::from_str("value"), &value)
                        .and_then(|_set| Reflect::set(&descriptor, &JsValue::from_str("enumerable"), &JsValue::TRUE))
                        .and_then(|_set| Reflect::define_property(error.unchecked_ref::<Object>(), &JsValue::from_str(name), &descriptor));
                    if let Err(thrown) = defined {
                        return thrown;
                    }
                }
                error
            }
            Err(error) => error,` : `
            Ok(error) | Err(error) => error,`}
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
    Fail { class, message: error.to_string(), kind: error.kind(), status: error.status(), errno: error.errno()${failRest(model)} }
}
${coreErrorRust(model)}${raisesAssertions(model)}${cleanupAsserts(model)}
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
${state}${used}${callbacks}${faultRust(model)}${aliasKindsRust(model)}
/// The exports of the module. The expansion of wasm_bindgen calls Option::unwrap_or_default, so they are in one module
/// that holds that one allow (GN-18).
#[allow(clippy::disallowed_methods, reason = "GN-18: the wasm_bindgen expansion")]
mod exports {
    use super::*;

    /// B-4: the module keeps the library classes when it loads; a missing class fails the load.
    #[wasm_bindgen(js_name = "__register")]
    pub fn register(classes: Vec<Function>${model.objects.length === 0 ? '' : ', makers: Vec<Function>, readers: Vec<Function>'}) -> Result<(), JsValue> {
        if classes.len() != ${model.classes.length + model.errorUnits.length} {
            return Err(JsValue::from_str(&format!("B-4: ${model.classes.length + model.errorUnits.length} library classes, {} given", classes.len())));
        }
        CLASSES.with(|registered| registered.replace(classes));${registered}
        Ok(())
    }
${exported.replace(/\n(?=.)/g, '\n    ')}
${aliasesWithKinds(model).map((alias) => `    /// U-7: runs the in function of the alias ${alias.unit.id} alone, for the cases of the alias.
    #[cfg(feature = "codec-test")]
    #[wasm_bindgen(js_name = ${rustString(`__aliasIn${langName('wasm', alias.unit.name, 'class')}`)})]
    pub fn alias_in_${rustField(alias.unit.name)}(value: JsValue) -> Result<(), JsValue> {
        guard(|| {
            let _value: ${alias.unit.core_type ?? ''} = in_${rustField(alias.unit.name)}(&value, "value")?;
            Ok(())
        })
        .map_err(throw)
    }

    /// GN-13e: takes a value by the in function of the alias ${alias.unit.id} and gives it back by its out function, for the round trip of a result.
    #[cfg(feature = "codec-test")]
    #[wasm_bindgen(js_name = ${rustString(`__aliasRound${langName('wasm', alias.unit.name, 'class')}`)})]
    pub fn alias_round_${rustField(alias.unit.name)}(value: JsValue) -> Result<JsValue, JsValue> {
        guard(|| {
            let value: ${alias.unit.core_type ?? ''} = in_${rustField(alias.unit.name)}(&value, "value")?;
            out_${rustField(alias.unit.name)}(&value)
        })
        .map_err(throw)
    }

`).join('')}${model.faults.length === 0 ? '' : `    /// G-5: arms the faults of a case for the next call of the member, and gives the id of the arming.
    #[cfg(feature = "fault-test")]
    #[wasm_bindgen(js_name = "__armFaults")]
    pub fn arm_faults(member: String, faults: String) -> Result<u32, JsValue> {
        guard(|| {
            let id: u64 = binding_core::fault::arm(&member, &faults).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;
            u32::try_from(id).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
        })
        .map_err(throw)
    }

    /// G-5: the points of an arming whose fault did not fire.
    #[cfg(feature = "fault-test")]
    #[wasm_bindgen(js_name = "__faultLeft")]
    pub fn fault_left(id: u32) -> Result<Vec<String>, JsValue> {
        guard(|| {
            binding_core::fault::left(u64::from(id)).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))
        })
        .map_err(throw)
    }

`}${nativeRoundTrip(model.contract, 'wasm') === undefined ? '' : `    /// GN-6u: the entry point of the generated release test: the count of the values that the table of Natives holds.
    #[cfg(feature = "native-count-test")]
    #[wasm_bindgen(js_name = "__nativeCount")]
    pub fn native_count() -> u32 {
        let count = NATIVE.with_borrow(|native| native.values.len());
        u32::try_from(count).unwrap_or(u32::MAX)
    }

`}    /// B-7: the entry point of the generated panic test.
    #[allow(clippy::panic, reason = "B-7: the entry point of the panic test panics on purpose, which its guard turns into kind internal")]
    #[cfg(feature = "panic-test")]
    #[wasm_bindgen(js_name = "__panicTest")]
    pub fn panic_test() -> Result<(), JsValue> {
        guard(|| panic!("panic-test")).map_err(throw)
    }
}
`;
}

// ---- JavaScript and declarations ----

const jsBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';

function tsType(model: Model, type: Type, input: boolean): string {
  if (typeof type === 'string') {
    const map: Record<string, string> = { text: 'string', latin1: 'string', bool: 'boolean', uint: 'number', int: 'number', float: 'number', int64: input ? 'number | bigint' : 'bigint', bytes: 'Uint8Array', source: 'string | Uint8Array', none: 'void', never: 'never' };
    return map[type] ?? 'unknown';
  }
  // GN-6ae: a function of the caller takes the values that the core gives it, and a passthrough is a type parameter of
  // the member, as for Node.
  if (machineFunction(type)) return `(${type.function.parameters.map((part, i) => `arg${i}: ${tsType(model, part, false)}`).join(', ')}) => ${tsType(model, type.function.returns, true)}`;
  if ('passthrough' in type) return type.passthrough;
  if ('list' in type) return input ? `Iterable<${tsType(model, type.list, input)}>` : `readonly (${tsType(model, type.list, input)})[]`;
  if ('map' in type) return `ReadonlyMap<string, ${tsType(model, type.map, input)}>`;
  if ('keyed_map' in type) return `ReadonlyMap<${type.key.map((k) => ({ int: 'number', text: 'string' })[k] ?? 'never').join(' | ')}, ${tsType(model, type.keyed_map, input)}>`;
  if ('optional' in type) return `${tsType(model, type.optional, input)} | null`;
  if ('tuple' in type) return `readonly [${type.tuple.map((t) => tsType(model, t, input)).join(', ')}]`;
  // GN-6z: a function takes the arguments that the core gives and returns a value that the binding judges.
  if ('function' in type) return `((${type.function.parameters.map((p, i) => `argument${String(i)}: ${tsType(model, p, false)}`).join(', ')}) => ${tsType(model, type.function.returns, true)})`;
  const unit = unitOf(model, type);
  // T-3: a record of another repository is a plain object, declared here by its fields.
  if (unit?.kind === 'record' && libraryOf(type) !== undefined) {
    return `{ ${(unit.fields ?? []).map((f) => `readonly ${langName('wasm', f.name, 'variable')}: ${tsType(model, f.type, input)}`).join('; ')} }`;
  }
  // U-7: a value alias is any value that its core judges.
  if (unit === undefined || aliasOf(model, type) !== undefined) return 'unknown';
  return langName('wasm', unit.name, 'class');
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
  // E-2: an error unit extends the class of its parent or of its category; the module defines its properties (I-3).
  const units = model.errorUnits.map((u) => {
    const name = langName('wasm', u.unit.name, 'class');
    const parent = u.parent === undefined ? model.classes.find((c) => c.category === u.category)?.name ?? '' : langName('wasm', u.parent.unit.name, 'class');
    return `
export class ${name} extends ${parent} {
  constructor(message, kind, status, errno) {
    super(message, kind, status, errno);
    Object.defineProperty(this, 'name', { value: ${jsString(name)}, configurable: true, writable: true });
  }
}`;
  }).join('\n');
  const internal = model.classes.find((c) => c.category === 'internal')?.name ?? '';
  // G-7: the count of the arguments, the members of an options record, and a list parameter's iterable (T-7); then the
  // call of the module, with the handle of the instance first for a member that has a receiver (T-5).
  const checked = (fn: Fn, label: string, exported: string, wrap: (call: string) => string): string => {
    const count = fn.params.length;
    // U-2: the parameters that may be left out are the last ones, a record parameter with {empty: "object"} too.
    const least = fn.params.filter((p) => p.default === undefined).length;
    const takes = least === count ? `${count} argument${count === 1 ? '' : 's'}` : `${least} to ${count} arguments`;
    const lines = [`  if (${least === count ? `args.length !== ${count}` : `args.length < ${least} || args.length > ${count}`}) {`, `    throw new TypeError(\`${label} takes ${takes}, \${args.length} given\`);`, '  }'];
    const passed = fn.params.map((p, i) => {
      if (fn.record !== undefined && p === fn.record.param) {
        const names = (fn.record.unit.fields ?? []).map((f) => langName('wasm', f.name, 'variable'));
        const required = (fn.record.unit.fields ?? []).filter((f) => f.default === undefined).map((f) => langName('wasm', f.name, 'variable'));
        lines.push(`  checkRecord(${jsString(label)}, ${jsString(langName('wasm', p.name, 'variable'))}, args[${i}], [${names.map(jsString).join(', ')}], [${required.map(jsString).join(', ')}]);`);
        return `args[${i}]`;
      }
      return typeof p.type === 'object' && 'list' in p.type ? `toList(args[${i}])` : `args[${i}]`;
    });
    const entered = `enter(${internal}, () => glue.${exported}(${[...(fn.receiver === undefined ? [] : ['this.#handle']), ...passed].join(', ')}))`;
    // GN-6ab: the entry of a member with machine advances the machine of its call until it ends.
    const call = fn.machine === true ? `drive(${internal}, ${entered})` : entered;
    lines.push(`  ${wrap(call)};`);
    return lines.join('\n');
  };
  const indent = (text: string, by: string): string => text.split('\n').map((line) => `${by}${line}`).join('\n');
  const fns = model.functions.map((fn) => {
    const name = langName('wasm', fn.member.name, 'callable');
    // GN-6n: the entry of a member that waits is an async function, so a failure is a rejection.
    return `
export ${awaits(fn) ? 'async ' : ''}function ${name}(...args) {
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
  ${fn.kind === 'static' ? 'static ' : ''}${awaits(fn) ? 'async ' : ''}${name}(...args) {
${indent(checked(fn, `${cls}.${name}()`, exported, (call) => `return ${call}`), '  ')}
  }`;
    });
    return `
export class ${cls} {
  #handle;

  constructor(...args) {
${construct}
    released.register(this, [glue.${`__free_${cls}`}, this.#handle${o.cleanup === undefined ? '' : `, ${jsString(cleanupWarning(cls, memberName('wasm', o.cleanup)))}`}]);
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
const released = new FinalizationRegistry(([free, handle${model.objects.some((o) => o.cleanup !== undefined) ? ', warning' : ''}]) => {
  if (broken()) return;
  try {
    ${model.objects.some((o) => o.cleanup !== undefined) ? `if (enter(${internal}, () => free(handle)) === true) warn(warning);` : `enter(${internal}, () => free(handle));`}
  } catch {
    // kept by state.mjs
  }
});
${model.objects.some((o) => o.cleanup !== undefined) ? `// GN-6p, B-10: the warning of an instance collected without its cleanup call: the warning of Node where the host has
// it, and console.warn in a host without it (a browser).
const warn = (message) => (typeof globalThis.process?.emitWarning === 'function' ? globalThis.process.emitWarning(message, 'ResourceWarning') : console.warn(message));
` : ''}`;
  const kept = model.kept.map((k) => keptClassWasm(k, internal)).join('\n');
  const constants = model.constants.map((c) => `export const ${langName('wasm', c.member.name, 'constant')} = ${JSON.stringify(c.member.value)};`).join('\n');
  const driving = !drivesMachine(model) ? '' : `
// GN-6ab: advances the state machine of a call until it ends: the module makes its calls on this thread and gives the
// promise of each of its waits (step 0), which this function awaits; a rejection of it is a failure of the module and
// ends the call. The machine is freed at its end.
// GN-6ae: a value that the machine awaits (step 1) is what a function of the caller returned, a promise or any other
// value: its value or its rejection is the outcome that the next advance takes, and only the machine answers it.
async function drive(Internal, driven) {
  try {
    let settled;
    for (;;) {
      const [step, value] = enter(Internal, () => driven.advance(settled));
      settled = undefined;
      if (step === 2) return value;
      if (step === 0) {
        await value;
        continue;
      }
      try {
        settled = [true, await value];
      } catch (reason) {
        settled = [false, reason];
      }
    }
  } finally {
    driven.free();
  }
}
`;
  return `${header('//')}
import load, * as glue from './${glue}.js';
import { ${model.objects.length === 0 ? 'enter' : 'broken, enter'} } from './state.mjs';
${foreignRegistrationWasm(model).imports}${classes}${units}
${objectState}${objects === '' ? '' : `${objects}\n`}${driving}
// GW-5: the import loads the WebAssembly module (top-level await), so no export runs before it is ready. A file: URL
// is read from the file system (Node, through the subpath ./wasm), any other URL is fetched (a browser).
const url = new URL('./${glue}_bg.wasm', import.meta.url);
const source = url.protocol === 'file:' ? (await import('node:fs/promises')).readFile(url) : fetch(url);
await load({ module_or_path: await source });
// B-4: the module throws instances of these classes; it keeps them from here on.
glue.__register([${[...model.classes.map((c) => c.name), ...model.errorUnits.map((u) => langName('wasm', u.unit.name, 'class'))].join(', ')}]${model.objects.length === 0 ? '' : ', makers, readers'});
${kept === '' ? '' : `${kept}
${model.aliases.length === 0 ? '' : `// GN-6af: the module knows the instances of the value classes by these prototypes.
glue.__registerValues([${model.kept.map((k) => `${langName('wasm', k.unit.name, 'class')}.prototype`).join(', ')}]);
`}`}
${foreignRegistrationWasm(model).register}
// T-7: a list parameter takes any iterable but a string; the module judges anything else.
function toList(value) {
  if (typeof value !== 'string' && value !== null && value !== undefined && typeof value[Symbol.iterator] === 'function') {
    return Array.from(value);
  }
  return value;
}

// G-7, T-4: an options record has only the names of its fields, and a field whose value is undefined is absent, which
// only a field with a default may be (U-2); a value that is not an object is judged by the module.
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

${constants}
`;
}

// GN-6af: the class of the ES module of a value class without core_type, as for Node (keptClassJs): the count of the
// arguments (G-7), the check of the module, and the kept values as own enumerable data properties.
function keptClassWasm(kept: KeptClass, internal: string): string {
  const cls = langName('wasm', kept.unit.name, 'class');
  const count = kept.fields.length;
  const least = kept.fields.filter((f) => f.default === undefined).length;
  const takes = least === count ? `${count} argument${count === 1 ? '' : 's'}` : `${least} to ${count} arguments`;
  const crossed = kept.fields.map((f, i) => {
    return typeof f.type === 'object' && 'list' in f.type ? `toList(args[${i}])` : `args[${i}]`;
  });
  const empty = { null: 'null', map: 'new Map()', list: '[]' };
  const defined = kept.fields.map((f, i) => {
    const value = f.default === undefined ? `args[${i}]` : `args[${i}] === undefined ? ${empty[f.default]} : args[${i}]`;
    return `    Object.defineProperty(this, ${jsString(langName('wasm', f.name, 'variable'))}, { value: ${value}, writable: ${String(f.writable)}, enumerable: true });`;
  });
  return `
export class ${cls} {
  constructor(...args) {
    if (${least === count ? `args.length !== ${count}` : `args.length < ${least} || args.length > ${count}`}) {
      throw new TypeError(\`new ${cls}() takes ${takes}, \${args.length} given\`);
    }
    enter(${internal}, () => glue.__check${cls}(${crossed.join(', ')}));
${defined.join('\n')}
  }
}`;
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
  // GN-6r: the JSDoc of a declaration of an internal unit holds @internal.
  const tag = (unit: Unit): string => (isInternal(unit) ? ' @internal' : '');
  const classes = model.classes.map((c) => `
/** The errors of category ${c.category} (E-2). */
export declare class ${c.name} extends ${jsBase(c.category)} {
  readonly kind: string;
  readonly status: number | null;
  readonly errno: number | null;
}`).join('\n');
  const errorUnits = model.errorUnits.map((u) => `
/** The errors of the unit ${u.unit.id} (E-2). */
export declare class ${langName('wasm', u.unit.name, 'class')} extends ${u.parent === undefined ? model.classes.find((c) => c.category === u.category)?.name ?? '' : langName('wasm', u.parent.unit.name, 'class')} {${u.properties.map((p) => `\n  readonly ${langName('wasm', p.member.name, 'variable')}: ${tsType(model, p.returns, false)};`).join('')}
}`).join('\n');
  // U-2: the declaration shows a {literal} or {const} default.
  const shown = (a: Arg): string => {
    const value = declaredValue(model, a)?.value;
    return value === undefined ? ' The core decides its value when it is left out (U-2).' : ` Its default is ${JSON.stringify(value)} (U-2).`;
  };
  const enums = model.enums.map((u) => `
/** T-6.${tag(u)} */
export type ${langName('wasm', u.name, 'class')} = ${(u.variants ?? []).map((v) => jsString(v.value)).join(' | ')};`).join('\n');
  const records = model.records.map((u) => `
/** T-4: the options record; a member whose value is undefined is absent.${tag(u)} */
export interface ${langName('wasm', u.name, 'class')} {
${(u.fields ?? []).map((f) => `${f.default === undefined ? '' : `  /**${shown({ name: f.name, type: f.type, field: true, default: f.default })} */\n`}  readonly ${langName('wasm', f.name, 'variable')}${f.default === undefined ? '' : '?'}: ${tsType(model, f.type, true)};`).join('\n')}
}`).join('\n');
  // T-9, GN-6v: an interface per case, whose tag member is the text of the case, and the union of the cases.
  const variants = model.variants.map((v) => `${v.cases.map((kase) => `
/** T-9: the case ${kase.value} of the variant ${langName('wasm', v.unit.name, 'class')}. */
export interface ${langName('wasm', kase.unit.name, 'class')} {
  readonly ${langName('wasm', v.unit.tag ?? [], 'variable')}: ${jsString(kase.value)};
${(kase.unit.fields ?? []).map((f) => `  readonly ${langName('wasm', f.name, 'variable')}${caseLeftOut(f) ? '?' : ''}: ${tsType(model, f.type, false)};\n`).join('')}}`).join('\n')}

/** T-9. */
export type ${langName('wasm', v.unit.name, 'class')} = ${v.cases.map((kase) => langName('wasm', kase.unit.name, 'class')).join(' | ')};`).join('\n');
  const param = (fn: Fn, p: Fn['params'][number]): string => `${langName('wasm', p.name, 'variable')}${p.default === undefined ? '' : '?'}: ${tsType(model, p.type, true)}`;
  // GN-6n: a member that waits returns a promise of its result.
  // GN-6ae: the promise of the entry takes the state of a result passthrough that is a thenable.
  const returned = (fn: Fn): string => {
    const result = typeof fn.returns === 'object' && 'passthrough' in fn.returns ? `Awaited<${fn.returns.passthrough}>` : tsType(model, fn.returns, false);
    return awaits(fn) ? `Promise<${result}>` : result;
  };
  const fns = model.functions.map((fn) => `${isInternal(fn.unit) ? '/** @internal */\n' : ''}export declare function ${langName('wasm', fn.member.name, 'callable')}${typeParameters(fn)}(${fn.params.map((p) => param(fn, p)).join(', ')}): ${returned(fn)};`).join('\n');
  const constants = model.constants.map((c) => `${isInternal(c.unit) ? '/** @internal */\n' : ''}export declare const ${langName('wasm', c.member.name, 'constant')}: ${JSON.stringify(c.member.value)};`).join('\n');
  const params = (fn: Fn): string => fn.params.map((p) => param(fn, p)).join(', ');
  const objects = model.objects.map((o) => {
    const lines = o.members.map((fn) => {
      const name = memberName('wasm', fn);
      if (fn.kind === 'constructor') return `  constructor(${params(fn)});`;
      if (fn.kind === 'static') return `  static ${name}${typeParameters(fn)}(${params(fn)}): ${returned(fn)};`;
      if (fn.kind === 'property') return `  get ${name}(): ${tsType(model, fn.returns, false)};`;
      if (fn.kind === 'iterate') {
        const yields = fn.yields ?? { value: 'none' };
        const item = yields.key === undefined ? tsType(model, yields.value, false) : `[${tsType(model, yields.key, false)}, ${tsType(model, yields.value, false)}]`;
        return `  [Symbol.iterator](): IterableIterator<${item}>;`;
      }
      return `  ${name}${typeParameters(fn)}(${params(fn)}): ${returned(fn)};`;
    });
    if (!o.constructible) lines.unshift('  private constructor();');
    return `
/** T-5.${tag(o.unit)} */
export declare class ${langName('wasm', o.unit.name, 'class')}${implementsClause(model, o, 'wasm')} {
${lines.join('\n')}
}`;
  }).join('\n');
  // GN-6af: the constructor keeps its arguments, each an own property, which a writable property also sets.
  const kept = model.kept.map((k) => `
/** GN-6af: keeps the values that its constructor takes. */
export declare class ${langName('wasm', k.unit.name, 'class')} {
  constructor(${k.fields.map((f) => `${langName('wasm', f.name, 'variable')}${f.default === undefined ? '' : '?'}: ${tsType(model, f.type, true)}`).join(', ')});
${k.fields.map((f) => `  ${f.writable ? '' : 'readonly '}${langName('wasm', f.name, 'variable')}: ${tsType(model, f.type, false)};`).join('\n')}
}`).join('\n');
  const callbacks = model.callbacks.map((cb) => `
/** U-3: a callback that JavaScript code implements.${tag(cb.unit)} */
export interface ${langName('wasm', cb.unit.name, 'class')} {
${cb.members.map((m) => `  ${langName('wasm', m.member.name, 'callable')}(${m.params.map((p) => `${langName('wasm', p.name, 'variable')}: ${tsType(model, p.type, false)}`).join(', ')}): ${tsType(model, m.returns, true)};`).join('\n')}
}`).join('\n');
  // GN-6ap: a generated interface, which the classes that implement it name.
  const interfaces = model.interfaces.map((i) => `
/** GN-6ap: the interface of ${implementorsOf(model, i).map((o) => langName('wasm', o.unit.name, 'class')).join(', ')}; a parameter of it takes an instance of one of them.${tag(i)} */
export interface ${langName('wasm', i.name, 'class')} {}`).join('\n');
  return `${header('//')}
${classes}${errorUnits === '' ? '' : `\n${errorUnits}`}
${enums}
${records}${variants === '' ? '' : `\n${variants}`}${objects === '' ? '' : `\n${objects}`}${kept === '' ? '' : `\n${kept}`}${callbacks === '' ? '' : `\n${callbacks}`}${interfaces === '' ? '' : `\n${interfaces}`}

${fns}

${constants}
`;
}

// The WASM generated files of a model.
export function wasm(model: Model, files: Files): void {
  files.set(`${ROOT}/lib.rs`, libRust(model));
  files.set(`${ROOT}/index.mjs`, indexMjs(model));
  files.set(`${ROOT}/index.d.ts`, indexDts(model));
  files.set(`${ROOT}/state.mjs`, stateMjs());
  files.set(`${ROOT}/tests/generated.test.mjs`, wasmTests(model));
}
