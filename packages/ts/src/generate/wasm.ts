// The browser and JavaScript binding (wasm-bindgen): the Rust crate that wasm-bindgen turns into a WebAssembly module
// and its JavaScript glue, the ES module around it (the library classes, init and the argument checks of G-7), the
// declarations and the generated tests (G-5). The npm package of Node carries it: the subpath ./wasm always, and an
// entry with the conditions of P-5 chooses it in the browser.

import type { Type, Unit } from '../contract.ts';
import { type Fn, type Model, Unsupported, coreArg, langName, rustField, rustType, rustVariant, unitOf } from './model.ts';
import { wasmTests } from './tests_wasm.ts';
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
  if ('optional' in type) return `in_optional(${value}, ${closure(['value'], convertIn(model, type.optional, 'value', subject))})`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum' || unit?.kind === 'record') return `in_${rustField(unit.name)}(${value}, ${subject})`;
  throw new Unsupported(`no WASM input conversion for ${JSON.stringify(type)}`);
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    if (type === 'none') return 'Ok(JsValue::UNDEFINED)';
    const fn: Record<string, string> = { text: 'out_text', latin1: 'out_latin1', bool: 'out_bool', uint: 'out_uint', int: 'out_int', int64: 'out_int', float: 'out_float' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no WASM output conversion for ${type}`);
    return `${name}(${value})`;
  }
  if ('list' in type) return `out_list(${value}, ${closure(['item'], convertOut(model, type.list, 'item'))})`;
  if ('optional' in type) return `out_optional(${value}, ${closure(['value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) return `out_tuple(&[${type.tuple.map((t, i) => `${convertOut(model, t, `&${value}.${i}`)}?`).join(', ')}])`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum' || unit?.kind === 'record') return `out_${rustField(unit.name)}(${value})`;
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

function functionRust(model: Model, fn: Fn): string {
  const jsName = langName('wasm', fn.member.name, 'callable');
  const params = fn.params.map((p) => `${rustField(p.name)}: JsValue`).join(', ');
  const lines: string[] = [];
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
  const callArgs = fn.params.map((p) => (fn.record !== undefined && p === fn.record.param ? `&${rustField(p.name)}` : coreArg(model, p.type, rustField(p.name))));
  const call = `${fn.corePath}(${callArgs.join(', ')})`;
  if (fn.fallible) {
    lines.push(`        let result = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(core_error(error)),\n        };`);
  } else if (fn.returns === 'none') {
    lines.push(`        ${call};`);
  } else {
    lines.push(`        let result = ${call};`);
  }
  lines.push(`        ${convertOut(model, fn.returns, 'result')}`);
  return `
/// ${fn.corePath} (contract member ${fn.member.id}).
#[wasm_bindgen(js_name = ${rustString(jsName)})]
pub fn ${rustField(fn.member.name)}(${params}) -> Result<JsValue, JsValue> {
    guard(|| {
${lines.join('\n')}
    })
    .map_err(throw)
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
  const functions = model.functions.map((fn) => functionRust(model, fn)).join('');
  const units = [...model.enums.map(enumRust), ...model.resultRecords.map((u) => recordRust(model, u))].join('\n');
  const used = usedHelpers(`${HELPERS}\n${WIDEN}\n${units}`, functions);
  const jsTypes = ['Array', 'JsString', 'Object'].filter((t) => new RegExp(`\\b${t}\\b`).test(`${used}${functions}`));
  return `${header('//')}
// The WebAssembly module of ${model.contract.library}. Its functions take the raw values and judge them (T-8); the
// JavaScript entry checks the count and the names of the arguments (G-7); a failure is an instance of its library class
// (B-4).

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
use js_sys::{${[...jsTypes, 'Function', 'Reflect'].sort().join(', ')}};
${/Borrow</.test(used) ? 'use std::borrow::Borrow;\n' : ''}use std::cell::RefCell;
use std::panic::{catch_unwind, AssertUnwindSafe};
use wasm_bindgen::prelude::wasm_bindgen;
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
    /// B-4: the library classes, which the JavaScript entry hands over when init loads the module, in the order of the
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
${coreErrorRust(model)}
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
${used}
/// The exports of the module. The expansion of wasm_bindgen calls Option::unwrap_or_default, so they are in one module
/// that holds that one allow (GN-18).
#[allow(clippy::disallowed_methods, reason = "GN-18: the wasm_bindgen expansion")]
mod exports {
    use super::*;

    /// B-4: the module keeps the library classes when it loads; a missing class fails the load.
    #[wasm_bindgen(js_name = "__register")]
    pub fn register(classes: Vec<Function>) -> Result<(), JsValue> {
        if classes.len() != ${model.classes.length} {
            return Err(JsValue::from_str(&format!("B-4: ${model.classes.length} library classes, {} given", classes.len())));
        }
        CLASSES.with(|registered| registered.replace(classes));
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

const jsBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';

function tsType(model: Model, type: Type, input: boolean): string {
  if (typeof type === 'string') {
    const map: Record<string, string> = { text: 'string', latin1: 'string', bool: 'boolean', uint: 'number', int: 'number', float: 'number', int64: input ? 'number | bigint' : 'bigint', bytes: 'Uint8Array', none: 'void' };
    return map[type] ?? 'unknown';
  }
  if ('list' in type) return input ? `Iterable<${tsType(model, type.list, input)}>` : `readonly (${tsType(model, type.list, input)})[]`;
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
  const fns = model.functions.map((fn) => {
    const name = langName('wasm', fn.member.name, 'callable');
    const count = fn.params.length;
    const lines = [`  if (args.length !== ${count}) {`, `    throw new TypeError(\`${name}() takes ${count} argument${count === 1 ? '' : 's'}, \${args.length} given\`);`, '  }'];
    const passed = fn.params.map((p, i) => {
      if (fn.record !== undefined && p === fn.record.param) {
        const names = (fn.record.unit.fields ?? []).map((f) => langName('wasm', f.name, 'variable'));
        lines.push(`  checkRecord(${jsString(`${name}()`)}, ${jsString(langName('wasm', p.name, 'variable'))}, args[${i}], [${names.map(jsString).join(', ')}]);`);
        return `args[${i}]`;
      }
      return typeof p.type === 'object' && 'list' in p.type ? `toList(args[${i}])` : `args[${i}]`;
    });
    lines.push(`  return glue.${name}(${passed.join(', ')});`);
    return `
export function ${name}(...args) {
${lines.join('\n')}
}`;
  }).join('\n');
  const constants = model.constants.map((c) => `export const ${langName('wasm', c.member.name, 'constant')} = ${JSON.stringify(c.member.value)};`).join('\n');
  return `${header('//')}
import load, * as glue from './${glue}.js';
${classes}

let ready;

// P-5: init loads the WebAssembly module once; every call of the module waits for it. A file: URL is read from the
// file system (Node, through the subpath ./wasm), any other URL is fetched (a browser).
export function init() {
  ready ??= (async () => {
    const url = new URL('./${glue}_bg.wasm', import.meta.url);
    const source = url.protocol === 'file:' ? (await import('node:fs/promises')).readFile(url) : fetch(url);
    await load({ module_or_path: await source });
    // B-4: the module throws instances of these classes; it keeps them from here on.
    glue.__register([${model.classes.map((c) => c.name).join(', ')}]);
  })();
  return ready;
}

// T-7: a list parameter takes any iterable but a string; the module judges anything else.
function toList(value) {
  if (typeof value !== 'string' && value !== null && value !== undefined && typeof value[Symbol.iterator] === 'function') {
    return Array.from(value);
  }
  return value;
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
  return `${header('//')}
/** P-5: loads the WebAssembly module; every other export needs it to have finished. */
export declare function init(): Promise<void>;
${classes}
${enums}
${records}

${fns}

${constants}
`;
}

export function wasm(model: Model, files: Files): void {
  // G-4: a class unit (T-5) and a record of another repository (T-3) are not generated for WASM yet.
  const [object] = model.objects;
  if (object !== undefined) throw new Unsupported(`${object.unit.id}: a class unit is not generated for WASM yet`);
  const [foreign] = model.foreignRecords;
  if (foreign !== undefined) throw new Unsupported(`${foreign.library}.${foreign.unit.id}: a record of another repository is not generated for WASM yet`);
  files.set(`${ROOT}/lib.rs`, libRust(model));
  files.set(`${ROOT}/index.mjs`, indexMjs(model));
  files.set(`${ROOT}/index.d.ts`, indexDts(model));
  files.set(`${ROOT}/tests/generated.test.mjs`, wasmTests(model));
}
