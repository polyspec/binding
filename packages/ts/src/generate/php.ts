// The PHP binding (ext-php-rs 0.16): the extension crate, its stub and the generated PHPUnit tests (G-5).

import type { Type, Unit } from '../contract.ts';
import { type Fn, type Model, coreArg, langName, rustField, rustType, rustVariant, unitOf } from './model.ts';
import { phpTests } from './tests_php.ts';
import { type Files, header, rustString, usedHelpers } from './text.ts';

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
    const fn: Record<string, string> = { text: 'in_text', latin1: 'in_latin1', bool: 'in_bool', uint: 'in_uint', int: 'in_int', int64: 'in_int', float: 'in_float', bytes: 'in_latin1' };
    const name = fn[type];
    if (name === undefined) throw new Error(`no PHP input conversion for ${type}`);
    return `${name}(${value}, ${subject})`;
  }
  if ('list' in type) return `in_list(${value}, ${subject}, |item| ${convertIn(model, type.list, 'item', subject)})`;
  if ('optional' in type) return `in_optional(${value}, |value| ${convertIn(model, type.optional, 'value', subject)})`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `in_${rustField(unit.name)}(${value}, ${subject})`;
  throw new Error(`no PHP input conversion for ${JSON.stringify(type)}`);
}

function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    if (type === 'none') return 'Ok(Zval::new())';
    const fn: Record<string, string> = { text: 'out_text', latin1: 'out_bytes', bytes: 'out_bytes', bool: 'out_bool', uint: 'out_uint', int: 'out_int', int64: 'out_int', float: 'out_float' };
    return `${fn[type]}(${value})`;
  }
  if ('list' in type) return `out_list(${value}, |item| ${convertOut(model, type.list, 'item')})`;
  if ('optional' in type) return `out_optional(${value}, |value| ${convertOut(model, type.optional, 'value')})`;
  if ('tuple' in type) {
    const parts = type.tuple.map((t, i) => `${convertOut(model, t, `&${value}.${i}`)}?`);
    return `out_array(vec![${parts.join(', ')}])`;
  }
  throw new Error(`no PHP output conversion for ${JSON.stringify(type)}`);
}

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

/// T-1 latin1: the bytes of a string, one character each.
fn in_latin1(value: &Zval, subject: &str) -> Result<Vec<u8>, Fail> {
    match value.zend_str() {
        Some(text) => Ok(text.as_bytes().to_vec()),
        None => Err(type_error(subject, "string")),
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

fn out_int(value: impl Borrow<i64>) -> Result<Zval, Fail> {
    let mut zval = Zval::new();
    zval.set_long(*value.borrow());
    Ok(zval)
}

/// B-2: a uint leaves as an int; one above PHP_INT_MAX is kind internal.
fn out_uint(value: impl Borrow<u64>) -> Result<Zval, Fail> {
    let value = *value.borrow();
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
`;
}

const fieldInit = (field: string, variable: string): string => (field === variable ? field : `${field}: ${variable}`);

function functionRust(model: Model, layout: PhpLayout, fn: Fn): string {
  const phpName = `${phpNamespace(layout, fn.module)}\\${langName('php', fn.member.name, 'callable')}`;
  const variables = fn.args.map((a) => langName('php', a.name, 'variable'));
  const lines: string[] = [];
  for (const [i, arg] of fn.args.entries()) {
    const variable = variables[i] ?? '';
    lines.push(`        let ${rustField(arg.name)}: ${rustType(model, arg.type)} = ${convertIn(model, arg.type, variable, rustString(variable))}?;`);
  }
  const callArgs: string[] = [];
  for (const parameter of fn.params) {
    if (fn.record !== undefined && parameter === fn.record.param) {
      const recordType = fn.record.unit.core_type ?? '';
      const fields = (fn.record.unit.fields ?? []).map((f) => fieldInit(rustField(f.name), rustField(f.name))).join(', ');
      lines.push(`        let ${rustField(parameter.name)}: ${recordType} = ${recordType} { ${fields} };`);
      callArgs.push(`&${rustField(parameter.name)}`);
    } else {
      callArgs.push(coreArg(model, parameter.type, rustField(parameter.name)));
    }
  }
  const call = `${fn.corePath}(${callArgs.join(', ')})`;
  if (fn.fallible) {
    lines.push(`        let result = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(core_error(error)),\n        };`);
  } else {
    lines.push(`        let result = ${call};`);
  }
  lines.push(`        ${convertOut(model, fn.returns, 'result')}`);
  return `
/// ${phpName} (G-7: PHP counts the arguments and checks their names by the arginfo of these parameters).
#[php_function]
#[php(name = ${rustString(phpName)})]
pub fn ${rustField(fn.member.name)}(${variables.map((v) => `${v}: &Zval`).join(', ')}) -> Result<Zval, PhpException> {
    guard(|| {
${lines.join('\n')}
    })
}
`;
}

function libRust(model: Model, layout: PhpLayout): string {
  const constants = model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n');
  const functions = model.functions.map((fn) => functionRust(model, layout, fn)).join('');
  const enums = model.enums.map((u) => enumRust(layout, u)).join('');
  const used = usedHelpers(`${HELPERS}\n${enums}`, functions);
  const classOf = (category: string): string => `${model.classes.findIndex((c) => c.category === category)}`;
  const coreError = model.coreError === undefined ? '' : `
/// I-2 (3): the class of each variant of the core error, by a match without a wildcard. The pattern \`{ .. }\` matches a
/// variant with or without data, which the generator does not see (I-2: bindgen reads no Rust source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn core_error(error: ${model.coreError}) -> Fail {
    let class: usize = match error {
${model.kinds.map((k) => `        ${k.variant} { .. } => ${classOf(k.category)},`).join('\n')}
    };
    library_error(class, &error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))
}
`;
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
  const register = [
    ...model.enums.map((u) => `        .enumeration::<${phpEnumType(u)}>()`),
    ...model.functions.map((fn) => `        .function(wrap_function!(${rustField(fn.member.name)}))`),
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

use bindgen_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(used) ? ', NumberType' : ''}${/\bTextCause\b/.test(used) ? ', TextCause' : ''}};
use ext_php_rs::builders::{ClassBuilder, ClassProperty, FunctionBuilder};
use ext_php_rs::convert::IntoZval;${model.enums.length > 0 ? '\nuse ext_php_rs::convert::FromZval;' : ''}
use ext_php_rs::exception::PhpException;
use ext_php_rs::flags::{DataType, MethodFlags, PropertyFlags};
use ext_php_rs::prelude::*;
use ext_php_rs::types::{${['ZendHashTable', 'ZendObject', 'ZendStr'].filter((t) => t === 'ZendObject' || new RegExp(`\\b${t}\\b`).test(used)).join(', ')}, Zval};
use ext_php_rs::zend::{ClassEntry, ExecuteData, ExecutorGlobals};
${/Borrow</.test(used) ? 'use std::borrow::Borrow;\n' : ''}use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::OnceLock;

// U-5: the constants of the contract are the constants of the core.
${constants}

/// A class entry that the engine owns for the life of the process.
#[derive(Clone, Copy)]
struct Class(&'static ClassEntry);

// SAFETY: a class entry is written once at module startup and only read afterwards, as the engine does.
unsafe impl Send for Class {}
unsafe impl Sync for Class {}

/// The library classes of the categories (E-2), in the order of the contract.
static CLASSES: [OnceLock<Class>; ${model.classes.length}] = [${model.classes.map(() => 'const { OnceLock::new() }').join(', ')}];

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

${baseFns}
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
    let class = this.get_class_entry();
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
    let Some(Class(entry)) = CLASSES.get(class).and_then(OnceLock::get).copied() else {
        return PhpException::from_message(format!("B-4: the class of {kind} is not registered"));
    };
    let mut object = ZendObject::new(entry);
    let written = in_scope(entry, || -> ext_php_rs::error::Result<()> {
        object.set_property("message", message)?;
        object.set_property("kind", kind)?;
        object.set_property("status", status.map(i64::from))?;
        object.set_property("errno", errno.map(i64::from))?;
        Ok(())
    });
    if let Err(error) = written {
        return PhpException::from_message(format!("B-4: the error {kind} could not be made: {error}"));
    }
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
fn guard(body: impl FnOnce() -> Result<Zval, Fail>) -> Result<Zval, Fail> {
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
#[php_function]
#[php(name = ${rustString(`${layout.namespace}\\Internal\\panicTest`)})]
pub fn panic_test() -> Result<Zval, PhpException> {
    guard(|| panic!("panic-test"))
}

/// B-4: the library classes are registered when the module starts, after the classes of PHP that they extend.
extern "C" fn startup(_kind: i32, _module: i32) -> i32 {${registerClasses}
    0
}

/// The module entry. The expansion of ext-php-rs's php_module macro uses \`Option::map_or\`, which R-1 disallows in this
/// crate's own code; the allow is limited to this module, which holds nothing else.
mod entry {
    #![allow(clippy::disallowed_methods, reason = "R-1: the expansion of the php_module macro of ext-php-rs")]
    use super::*;

    #[php_module]
    #[php(startup = "startup")]
    pub fn module(module: ModuleBuilder) -> ModuleBuilder {
        let module = module
    ${register.join('\n')};
        #[cfg(feature = "panic-test")]
        let module = module.function(wrap_function!(panic_test));
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
      return ({ text: 'string', latin1: 'string', bytes: 'string', bool: 'bool', uint: 'int', int: 'int', int64: 'int', float: 'float', none: 'void' } as Record<string, string>)[type] ?? 'mixed';
    }
    if ('list' in type || 'tuple' in type || 'map' in type) return 'array';
    if ('optional' in type) return `?${phpType(type.optional)}`;
    const unit = unitOf(model, type);
    return unit === undefined ? 'mixed' : `\\${phpNamespace(layout, unit.module)}\\${langName('php', unit.name, 'class')}`;
  };
  const docType = (type: Type): string => {
    if (typeof type === 'object' && 'list' in type) return `list<${docType(type.list)}>`;
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
  const modules = [...new Set([...model.functions.map((f) => f.module), ...model.enums.map((u) => u.module), ...model.constants.map((c) => c.module)])].sort();
  for (const module of modules) {
    const items: string[] = [];
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
    for (const fn of model.functions.filter((f) => f.module === module)) {
      const docs = fn.args.map((a) => `     * @param ${docType(a.type)} $${langName('php', a.name, 'variable')}`);
      const params = fn.args.map((a) => `mixed $${langName('php', a.name, 'variable')}`);
      items.push(`    /**
     * T-8: the parameters take any value, which the extension judges.
     *
${docs.join('\n')}
     * @return ${docType(fn.returns)}
     */
    function ${langName('php', fn.member.name, 'callable')}(${params.join(', ')}): ${phpType(fn.returns).startsWith('?') || phpType(fn.returns) === 'void' ? phpType(fn.returns) : phpType(fn.returns)} {}
`);
    }
    blocks.push(`namespace ${phpNamespace(layout, module)} {
${items.join('\n')}}`);
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
