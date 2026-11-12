// The Node binding (napi-rs 3): the Rust addon, the JavaScript package around it (CommonJS and ESM entries, error
// classes, the argument count and name checks of G-7), the declarations and the generated tests (G-5).

import type { Type, Unit } from '../contract.ts';
import { type Fn, type Model, byValue, type ObjectClass, coreCallArgs, langName, libraryOf, objectUnit, recordFn, rustField, rustType, rustVariant, unitOf } from './model.ts';
import { nodeTests } from './tests_node.ts';
import { type Files, header, jsString, rustString, closure, optionRef, usedHelpers, WIDEN } from './text.ts';

const ROOT = 'packages/ts/generated';

export const addonBase = (model: Model): string => {
  const npm = (model.contract.packages['node'] as { package: string }).package;
  return npm.slice(npm.indexOf('/') + 1);
};

// ---- Rust ----

function convertIn(model: Model, type: Type, value: string, subject: string): string {
  if (typeof type === 'string') {
    const fn: Record<string, string> = { text: 'in_text', latin1: 'in_latin1', bool: 'in_bool', uint: 'in_uint', int: 'in_int', int64: 'in_int', float: 'in_float' };
    const name = fn[type];
    if (name === undefined) throw new Error(`no Node input conversion for ${type}`);
    return `${name}(${value}, ${subject})`;
  }
  if ('list' in type) return `in_list(${value}, ${subject}, ${closure(['item'], convertIn(model, type.list, 'item', subject))})`;
  if ('optional' in type) return `in_optional(${value}, ${closure(['value'], convertIn(model, type.optional, 'value', subject))})`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `in_${rustField(unit.name)}(${value}, ${subject})`;
  if (unit?.kind === 'record') return `in_${recordFn(unit, libraryOf(type))}(${value}, ${subject})`;
  throw new Error(`no Node input conversion for ${JSON.stringify(type)}`);
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    if (type === 'none') return 'out_none(env)';
    const fn: Record<string, string> = { text: 'out_text', latin1: 'out_latin1', bool: 'out_bool', uint: 'out_uint', int: 'out_int', int64: 'out_int', float: 'out_float' };
    return `${fn[type]}(env, ${value})`;
  }
  if ('list' in type) return `out_list(env, ${value}, ${closure(['env', 'item'], convertOut(model, type.list, 'item'))})`;
  if ('optional' in type) return `out_optional(env, ${optionRef(value)}, ${closure(['env', 'value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) {
    const parts = type.tuple.map((t, i) => `${convertOut(model, t, `&${value}.${i}`)}?`);
    return `out_tuple(env, vec![${parts.join(', ')}])`;
  }
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `out_${rustField(unit.name)}(env, ${value})`;
  if (unit?.kind === 'record') return `out_${recordFn(unit, libraryOf(type))}(env, ${value})`;
  if (objectUnit(model, type) !== undefined && unit !== undefined) return `out_${rustField(unit.name)}(env, ${value})`;
  throw new Error(`no Node output conversion for ${JSON.stringify(type)}`);
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
    Ok(env.get_undefined().map_err(internal)?.to_unknown())
}

fn out_null(env: &Env) -> Result<Unknown<'_>, Fail> {
    ToNapiValue::into_unknown(Null, env).map_err(internal)
}

fn out_list<'env, T>(env: &'env Env, value: impl IntoIterator<Item = T>, item: impl Fn(&'env Env, T) -> Result<Unknown<'env>, Fail>) -> Result<Unknown<'env>, Fail> {
    let items = value.into_iter().map(|value| item(env, value)).collect::<Result<Vec<_>, Fail>>()?;
    out_tuple(env, items)
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

function functionRust(model: Model, fn: Fn): string {
  const jsName = langName('node', fn.member.name, 'callable');
  const params = fn.params.map((p) => `, ${rustField(p.name)}: Unknown<'env>`).join('');
  const lines: string[] = [];
  for (const parameter of fn.params) {
    const variable = rustField(parameter.name);
    if (fn.record !== undefined && parameter === fn.record.param) {
      for (const field of fn.record.unit.fields ?? []) {
        const name = langName('node', field.name, 'variable');
        const raw = `member(${variable}, ${rustString(name)}, ${rustString(langName('node', parameter.name, 'variable'))})?`;
        lines.push(`        let ${rustField(field.name)}: ${rustType(model, field.type)} = ${convertIn(model, field.type, raw, rustString(name))}?;`);
      }
      const recordType = fn.record.unit.core_type ?? '';
      const fields = (fn.record.unit.fields ?? []).map((f) => fieldInit(rustField(f.name), rustField(f.name))).join(', ');
      lines.push(`        let ${variable}: ${recordType} = ${recordType} { ${fields} };`);
    } else {
      lines.push(`        let ${variable}: ${rustType(model, parameter.type)} = ${convertIn(model, parameter.type, variable, rustString(langName('node', parameter.name, 'variable')))}?;`);
    }
  }
  const call = `${fn.corePath}(${coreCallArgs(model, fn, (p) => rustField(p.name), 'self.inner').join(', ')})`;
  if (fn.fallible) {
    lines.push(`        let result = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(core_error(error)),\n        };`);
  } else {
    lines.push(`        let result = ${call};`);
  }
  if (fn.kind === 'constructor') {
    lines.push('        Ok(Self { inner: result })');
    return `
    #[napi(constructor)]
    pub fn new<'env>(env: &'env Env${params}) -> napi::Result<Self> {
        guard(|| {
${lines.map((l) => `    ${l}`).join('\n')}
        })
        .map_err(|fail| throw(env, fail))
    }
`;
  }
  lines.push(`        ${convertOut(model, fn.returns, 'result')}`);
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
  // __<name>, and the JavaScript entry defines <name>, which checks the arguments and calls it.
  const attribute = fn.kind === 'property' ? `#[napi(getter, js_name = ${rustString(jsName)})]` : `#[napi(js_name = ${rustString(`__${jsName}`)})]`;
  const self = fn.receiver === undefined ? '' : '&self, ';
  return `
    ${attribute}
    pub fn ${rustField(fn.member.name)}<'env>(${self}env: &'env Env${params}) -> napi::Result<Unknown<'env>> {
        guard(|| {
${lines.map((l) => `    ${l}`).join('\n')}
        })
        .map_err(|fail| throw(env, fail))
    }
`;
}

// T-5: a class unit is a class of the addon that holds the core value; the JavaScript entry checks the arguments of its
// members (G-7).
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
        pub(crate) inner: ${core},
    }

    #[napi]
    impl ${struct} {${object.members.map((fn) => functionRust(model, fn).replaceAll('\n', '\n    ')).join('')}}
}

fn out_${rustField(object.unit.name)}(env: &Env, value: ${core}) -> Result<Unknown<'_>, Fail> {
    ToNapiValue::into_unknown(class_${rustField(object.unit.name)}::${struct} { inner: value }, env).map_err(internal)
}
`;
}

function coreErrorRust(model: Model): string {
  if (model.coreError === undefined) return '';
  const arms = model.kinds.map((k) => `        ${k.variant} { .. } => ${model.classes.findIndex((c) => c.category === k.category)},`).join('\n');
  return `
/// I-2 (3): the class of each variant of the core error, by a match without a wildcard. The pattern \`{ .. }\` matches a
/// variant with or without data, which the generator does not see (I-2: bindgen reads no Rust source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn core_error(error: ${model.coreError}) -> Fail {
    let class: usize = match error {
${arms}
    };
    library_error(class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))
}
`;
}

function libRust(model: Model): string {
  const classIndex = (category: string): string => String(model.classes.findIndex((c) => c.category === category));
  const constants = model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n');
  const functions = model.functions.map((fn) => functionRust(model, fn)).join('') + model.objects.map((o) => objectRust(model, o)).join('');
  const enums = [
    ...model.enums.map(enumRust),
    ...model.resultRecords.map((u) => recordRust(model, u)),
    ...model.foreignRecords.map((r) => recordRust(model, r.unit, r.library)),
  ].join('\n');
  const used = usedHelpers(`${HELPERS}\n${WIDEN}\n${enums}`, functions);
  const napiTypes = ['Array', 'JsString', 'Null', 'Object', 'ToNapiValue', 'ValueType']
    .filter((t) => new RegExp(`(?<!::)\\b${t}\\b`).test(`${used}${functions}`));
  if (/\.(is_array|to_unknown)\(/.test(used)) napiTypes.push('JsValue');
  if (/\.(get|set)_named_property/.test(used)) napiTypes.push('JsObjectValue');
  return `${header('//')}
// The addon of ${model.contract.library}. Its functions take the raw values and judge them (T-8); the JavaScript entry
// checks the count and the names of the arguments (G-7); a failure is an instance of its library class (B-4).

use bindgen_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
use napi::bindgen_prelude::{${[...napiTypes.filter((t) => t === 'Array' || t === 'Null' || t === 'Object' || t === 'JsObjectValue' || t === 'ToNapiValue'), 'FnArgs', 'Function', 'FunctionRef'].sort().join(', ')}};
use napi::{Env, Unknown${napiTypes.filter((t) => t !== 'Array' && t !== 'Null' && t !== 'Object' && t !== 'JsObjectValue' && t !== 'ToNapiValue').map((t) => `, ${t}`).join('')}};
use napi_derive::napi;
${/Borrow</.test(used) ? 'use std::borrow::Borrow;\n' : ''}use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::OnceLock;

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
}

/// The arguments of the constructor of a library class: message, kind, status, errno.
type ClassArgs = FnArgs<(String, String, Option<u32>, Option<i32>)>;

/// B-4: the library classes, which the JavaScript entry hands over when the module loads, in the order of the contract.
static CLASSES: OnceLock<Vec<FunctionRef<ClassArgs, ()>>> = OnceLock::new();

/// B-4: the module keeps a reference to each library class when it loads; a missing class fails the load.
#[napi(js_name = "__register")]
pub fn register(classes: Vec<Function<'_, ClassArgs, ()>>) -> napi::Result<()> {
    if classes.len() != ${model.classes.length} {
        return Err(napi::Error::from_reason(format!("B-4: ${model.classes.length} library classes, {} given", classes.len())));
    }
    let references = classes.iter().map(Function::create_ref).collect::<napi::Result<Vec<_>>>()?;
    CLASSES.set(references).map_err(|_registered| napi::Error::from_reason("B-4: the library classes are registered once"))
}

/// The instance of the library class of a failure, as the error that the call throws (B-4).
fn throw(env: &Env, fail: Fail) -> napi::Error {
    let Some(class) = CLASSES.get().and_then(|classes| classes.get(fail.class)) else {
        return napi::Error::from_reason(format!("B-4: the library classes are not registered: {}", fail.message));
    };
    let args: ClassArgs = FnArgs::from((fail.message, String::from(fail.kind), fail.status.map(u32::from), fail.errno));
    match class.borrow_back(env).and_then(|class| class.new_instance(args)) {
        Ok(error) => napi::Error::from(error),
        Err(error) => error,
    }
}

fn library_error(class: usize, message: String, kind: &'static str, status: Option<u16>, errno: Option<i32>) -> Fail {
    Fail { class, message, kind, status, errno }
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
${used}${functions}
/// B-7: the entry point of the generated panic test.
#[cfg(feature = "panic-test")]
#[napi(js_name = "__panicTest")]
pub fn panic_test(env: &Env) -> napi::Result<()> {
    guard(|| panic!("panic-test")).map_err(|fail| throw(env, fail))
}
`;
}

// ---- JavaScript and declarations ----

function tsType(model: Model, type: Type, input: boolean): string {
  if (typeof type === 'string') {
    const map: Record<string, string> = { text: 'string', latin1: 'string', bool: 'boolean', uint: 'number', int: 'number', float: 'number', int64: input ? 'number | bigint' : 'bigint', bytes: 'Uint8Array', none: 'void' };
    return map[type] ?? 'unknown';
  }
  if ('list' in type) return input ? `Iterable<${tsType(model, type.list, input)}>` : `readonly (${tsType(model, type.list, input)})[]`;
  if ('optional' in type) return `${tsType(model, type.optional, input)} | null`;
  if ('tuple' in type) return `readonly [${type.tuple.map((t) => tsType(model, t, input)).join(', ')}]`;
  const unit = unitOf(model, type);
  // T-3: a record of another repository is a plain object, declared here by its fields.
  if (unit?.kind === 'record' && libraryOf(type) !== undefined) {
    return `{ ${(unit.fields ?? []).map((f) => `readonly ${langName('node', f.name, 'variable')}: ${tsType(model, f.type, input)}`).join('; ')} }`;
  }
  return unit === undefined ? 'unknown' : langName('node', unit.name, 'class');
}

const listParam = (type: Type): boolean => typeof type === 'object' && 'list' in type;

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
  // G-7: the count of the arguments, the members of an options record, and a list parameter's iterable (T-7).
  const checked = (fn: Fn, label: string, call: (passed: string) => string): string => {
    const count = fn.params.length;
    const lines = [`  if (args.length !== ${count}) {`, `    throw new TypeError(\`${label} takes ${count} argument${count === 1 ? '' : 's'}, \${args.length} given\`);`, '  }'];
    const passed = fn.params.map((p, i) => {
      if (fn.record !== undefined && p === fn.record.param) {
        const record = langName('node', p.name, 'variable');
        const names = (fn.record.unit.fields ?? []).map((f) => langName('node', f.name, 'variable'));
        lines.push(`  checkRecord(${jsString(label)}, ${jsString(record)}, args[${i}], [${names.map(jsString).join(', ')}]);`);
        return `args[${i}]`;
      }
      return listParam(p.type) ? `toList(args[${i}])` : `args[${i}]`;
    });
    lines.push(`  return ${call(passed.join(', '))};`);
    return lines.join('\n');
  };
  const fns = model.functions.map((fn) => {
    const name = langName('node', fn.member.name, 'callable');
    return `
function ${name}(...args) {
${checked(fn, `${name}()`, (passed) => `addon.${name}(${passed})`)}
}`;
  }).join('\n');
  // T-5: the classes of the addon keep their identity; the entry defines each method and static member over the
  // addon's __<name>, checking the arguments first (G-7), so an instance that the addon makes has them too.
  const objects = model.objects.map((o) => {
    const cls = langName('node', o.unit.name, 'class');
    const wraps = o.members.filter((fn) => fn.kind === 'static' || fn.kind === 'method').map((fn) => {
      const name = langName('node', fn.member.name, 'callable');
      const target = fn.kind === 'static' ? cls : `${cls}.prototype`;
      return `{
  const original = ${target}.__${name};
  Object.defineProperty(${target}, ${jsString(name)}, {
    value: function ${name}(...args) {
${checked(fn, `${cls}.${name}()`, (passed) => `Reflect.apply(original, this, [${passed}])`).split('\n').map((l) => `    ${l}`).join('\n')}
    },
    writable: true,
    configurable: true,
  });
}`;
    });
    return `
const ${cls} = addon.${cls};
${wraps.join('\n')}`;
  }).join('\n');
  const constants = model.constants.map((c) => `const ${langName('node', c.member.name, 'constant')} = ${JSON.stringify(c.member.value)};`).join('\n');
  const exports = [
    ...model.classes.map((c) => c.name),
    ...model.functions.map((f) => langName('node', f.member.name, 'callable')),
    ...model.objects.map((o) => langName('node', o.unit.name, 'class')),
    ...model.constants.map((c) => langName('node', c.member.name, 'constant')),
  ];
  return `${header('//')}
'use strict';

const addon = require(\`./${base}.\${process.platform}-\${process.arch}\${process.platform === 'linux' ? '-gnu' : ''}.node\`);
${classes}


// B-4: the addon throws instances of these classes; it keeps them from here on, and a missing one fails the load.
addon.__register([${model.classes.map((c) => c.name).join(', ')}]);

// T-7: a list parameter takes any iterable but a string; the addon judges anything else.
function toList(value) {
  if (typeof value !== 'string' && value !== null && value !== undefined && typeof value[Symbol.iterator] === 'function') {
    return Array.from(value);
  }
  return value;
}

// G-7, T-4: an options record has only the names of its fields, and a field whose value is undefined is absent; a value
// that is not an object is judged by the addon.
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
${objects}

${constants}

module.exports = { ${exports.join(', ')} };
`;
}

const nodeBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';

function indexMjs(model: Model): string {
  const exports = [
    ...model.classes.map((c) => c.name),
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
  const classes = model.classes.map((c) => `
/** The errors of category ${c.category} (E-2). */
export declare class ${c.name} extends ${nodeBase(c.category)} {
  readonly kind: string;
  readonly status: number | null;
  readonly errno: number | null;
}`).join('\n');
  const enums = model.enums.map((u) => `
/** T-6. */
export type ${langName('node', u.name, 'class')} = ${(u.variants ?? []).map((v) => jsString(v.value)).join(' | ')};`).join('\n');
  const records = model.records.map((u) => `
/** T-4: the options record; a member whose value is undefined is absent. */
export interface ${langName('node', u.name, 'class')} {
${(u.fields ?? []).map((f) => `  readonly ${langName('node', f.name, 'variable')}: ${tsType(model, f.type, true)};`).join('\n')}
}`).join('\n');
  const fns = model.functions.map((fn) => {
    const params = fn.params.map((p) => `${langName('node', p.name, 'variable')}: ${tsType(model, p.type, true)}`);
    return `export declare function ${langName('node', fn.member.name, 'callable')}(${params.join(', ')}): ${tsType(model, fn.returns, false)};`;
  }).join('\n');
  const constants = model.constants.map((c) => `export declare const ${langName('node', c.member.name, 'constant')}: ${JSON.stringify(c.member.value)};`).join('\n');
  const params = (fn: Fn): string => fn.params.map((p) => `${langName('node', p.name, 'variable')}: ${tsType(model, p.type, true)}`).join(', ');
  const objects = model.objects.map((o) => {
    const lines = o.members.map((fn) => {
      const name = langName('node', fn.member.name, 'callable');
      if (fn.kind === 'constructor') return `  constructor(${params(fn)});`;
      if (fn.kind === 'static') return `  static ${name}(${params(fn)}): ${tsType(model, fn.returns, false)};`;
      if (fn.kind === 'property') return `  get ${name}(): ${tsType(model, fn.returns, false)};`;
      return `  ${name}(${params(fn)}): ${tsType(model, fn.returns, false)};`;
    });
    if (!o.constructible) lines.unshift('  private constructor();');
    return `
/** T-5. */
export declare class ${langName('node', o.unit.name, 'class')} {
${lines.join('\n')}
}`;
  }).join('\n');
  return `${header('//')}
${classes}
${enums}
${records}
${objects}

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
