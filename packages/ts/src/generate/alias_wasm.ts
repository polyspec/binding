// U-7: the WASM conversions of a value alias, as for Node (alias_node.ts): a JavaScript value enters as a HostValue
// that the module gives one level at a time (B-1) and the core's `in` function judges; a core value leaves as the
// OutValue that the core's `out` function gives, which the module makes into JavaScript values by the alias's `out`
// rows, the same handle as the same object (U-7 (d)). Every JavaScript operation that can run code of the value (a
// getter, a trap of a proxy, an iterator) is called with `catch`, so its exception comes back as a value that the
// module throws again unchanged and never unwinds through the WebAssembly frames.

import { type KeptClass, type KeptField, type Model, type ValueAlias, langName, rustField, rustIdent, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported } from './model.ts';
import { container, outArms, readValue, valueReads } from './alias_shared.ts';
import { rustString } from './text.ts';

// The JavaScript value of a built-in form, made from the content of the matched OutValue.
function builtin(alias: ValueAlias, form: string, kind: string): string {
  switch (form) {
    case 'null':
      return 'Ok(JsValue::NULL)';
    case 'bool':
      return 'out_bool(value)';
    case 'int':
      if (kind === 'number') return 'js_literal_number(&value)';
      return kind === 'int64' ? 'out_int(value)' : 'out_int(value.value())';
    case 'bigint':
      if (kind === 'number') return 'js_literal_bigint(&value)';
      return kind === 'int64' ? 'js_bigint(value)' : 'js_bigint(value.value())';
    case 'float':
      if (kind === 'number') return 'js_literal_number(&value)';
      if (kind === 'float') return 'out_float(value.value())';
      // An integer as the nearest double, by its decimal text: R-1 refuses an as conversion.
      return `js_literal_number(&${kind === 'int64' ? 'value' : 'value.value()'}.to_string())`;
    case 'text':
      return kind === 'bytes' ? 'js_utf8(value.value())' : 'out_text(value)';
    case 'bytes':
      return kind === 'text' ? 'out_bytes(value.as_bytes())' : 'out_bytes(value.value())';
    case 'list': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head === '' ? '' : `${parts.head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let array = Array::new_with_length(js_index(len)?);
            made.insert(handle.raw(), array.clone().into());
            for index in 0..len {
                let item = ${parts.item};
                let item = make(item, source, made)?;
                array.set(js_index(index)?, item);
            }
            Ok(array.into())
        }`;
    }
    case 'map':
    case 'keyed_map': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head === '' ? '' : `${parts.head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let map = js_sys::Map::new();
            made.insert(handle.raw(), map.clone().into());
            for index in 0..len {
                let (key, item) = ${parts.entry};
                let key = make(key, source, made)?;
                let item = make(item, source, made)?;
                map.set(&key, &item);
            }
            Ok(map.into())
        }`;
    }
    case 'native':
      return 'native_object(&native)';
    default:
      throw new Unsupported(`${alias.unit.id}: the WASM form ${form} of the kind ${kind} is not generated yet`);
  }
}

export function aliasWasm(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const label = langName('wasm', alias.unit.name, 'class');
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  const arms = outArms(model, alias, 'wasm', (form, kind) => builtin(alias, form, kind), 'Err(binding_error(BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', '', (kept, field, holds, head) => keptMakeWasm(model, kept, field, holds, head));
  return `
/// U-7: a JavaScript value of ${label} enters as HostValue, which the core judges.
fn in_${name}(value: &JsValue, _subject: &str) -> Result<${core}, Fail> {
    let mut host = JsHost::new();
    let described = host.describe(value).map_err(js_fail)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// U-7: a core value of ${label} leaves as the JavaScript values of its out rows.
fn out_${name}(value: impl Borrow<${core}>) -> Result<JsValue, Fail> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    let mut made = BTreeMap::new();
    make_${name}(root, &mut source, &mut made)
}

fn make_${name}(out: OutValue, source: &mut dyn OutValues, made: &mut BTreeMap<u64, JsValue>) -> Result<JsValue, Fail> {
    let make = make_${name};
    match out.clone() {
${arms.join('\n')}
        other => Err(binding_error(BindingError::Internal { detail: format!("U-7: no out row of the kind {}", other.kind().as_str()) })),
    }
}
`;
}

// B-1: what a JavaScript value is as a HostValue, one level at a time, by the rule of Node (GN-6e); the children of a
// container are asked for through HostValues by the handles that describe gave.
// usedHelpers splits helpers at blank lines, so a block keeps none inside it.
const WASM_HOST = (`
/// B-1: the functions of JavaScript that may run code of the value (a trap of a proxy, an iterator), imported with
/// catch, so that their exception is a value that goes back to the caller. The expansion of wasm_bindgen calls
/// Option::unwrap_or_default, so they are in a module that holds that one allow, as the exports are (GN-18).
#[allow(clippy::disallowed_methods, reason = "GN-18: the wasm_bindgen expansion")]
mod js {
    use js_sys::Array;
    use wasm_bindgen::prelude::wasm_bindgen;
    use wasm_bindgen::JsValue;

    #[wasm_bindgen]
    extern "C" {
        /// Array.isArray, which throws for a revoked proxy.
        #[wasm_bindgen(catch, js_namespace = Array, js_name = isArray)]
        pub(crate) fn is_array(value: &JsValue) -> Result<bool, JsValue>;
        /// Array.from, which runs the iterator of the value.
        #[wasm_bindgen(catch, js_namespace = Array, js_name = from)]
        pub(crate) fn array_from(value: &JsValue) -> Result<Array, JsValue>;
        /// Object.keys, which runs the ownKeys trap of a proxy.
        #[wasm_bindgen(catch, js_namespace = Object, js_name = keys)]
        pub(crate) fn object_keys(value: &JsValue) -> Result<Array, JsValue>;
    }
}

/// B-1: the JavaScript values whose children the core may ask for, under the handles that describe gave: an array, the
/// [key, value] pairs of a Map, and a plain object with its own enumerable string keys.
enum Held {
    Items(Array),
    Pairs(Array),
    Properties(JsValue, Array),/*HELD*/
}

struct JsHost {
    held: Vec<Held>,
    marked: u64,/*SEEN*/
}

impl JsHost {
    const fn new() -> Self {
        Self { held: Vec::new(), marked: 0/*NEW*/ }
    }

    fn hold(&mut self, held: Held) -> Handle {
        self.held.push(held);
        Handle::new(handle_count(self.held.len() - 1))
    }

    /// GN-6u: the handle of a Date or of a value outside the closed set, its number in the order of the call.
    fn mark(&mut self) -> Handle {
        self.marked = self.marked.saturating_add(1);
        Handle::new(self.marked)
    }
/*IDENTITY*/
    /// B-1: a primitive is its kind (a number is untyped: whether it is an integer is the core's rule); a bigint is an
    /// integer, as its decimal token outside i64; a string keeps its UTF-16 units, unpaired surrogates included.
    fn describe(&mut self, value: &JsValue) -> Result<HostValue, JsValue> {
        if value.is_undefined() {
            return Ok(HostValue::Undefined);
        }
        if value.is_null() {
            return Ok(HostValue::Null);
        }
        if let Some(boolean) = value.as_bool() {
            return Ok(HostValue::Bool(boolean));
        }
        if let Some(number) = value.as_f64() {
            return Ok(HostValue::UntypedNumber(number));
        }
        if let Some(text) = value.dyn_ref::<JsString>() {
            return Ok(HostValue::Text(HostText::Utf16(text.iter().collect())));
        }
        if let Some(bigint) = value.dyn_ref::<js_sys::BigInt>() {
            let text = String::from(bigint.to_string(10).map_err(JsValue::from)?);
            return Ok(match text.parse::<i64>() {
                Ok(int) => HostValue::Int(int),
                Err(_wide) => HostValue::Number(text),
            });
        }
        if value.is_function() {
            return Ok(HostValue::Callable(wasm_native(value)));
        }
        if value.is_symbol() {
            return Ok(HostValue::Other { type_name: String::from("symbol"), handle: self.mark() });
        }
        if !value.is_object() {
            return Ok(HostValue::Other { type_name: String::from("external"), handle: self.mark() });
        }
        self.describe_object(value)
    }

    /// B-1: an array, a Date, a Map and a plain object (its prototype Object.prototype or null) are their kinds; a typed
    /// array is outside the set; any other object is its handle with the name of its constructor, which the core judges.
    fn describe_object(&mut self, value: &JsValue) -> Result<HostValue, JsValue> {/*DESCRIBE*/
        if js::is_array(value)? {
            let array: Array = value.clone().unchecked_into();
            let len = u64::from(array.length());
            return Ok(HostValue::List { handle: self.hold(Held::Items(array)), len });
        }
        let global = js_sys::global();
        if instance_of(value, &global, "Date")? {
            return Ok(HostValue::Date(self.mark()));
        }
        if js_sys::ArrayBuffer::is_view(value) && !instance_of(value, &global, "DataView")? {
            return Ok(HostValue::Other { type_name: constructor_name(value)?, handle: self.mark() });
        }
        if instance_of(value, &global, "Map")? {
            let pairs = js::array_from(value)?;
            let len = u64::from(pairs.length());
            return Ok(HostValue::Map { handle: self.hold(Held::Pairs(pairs)), len });
        }
        let prototype = Reflect::get_prototype_of(value)?;
        let plain = if prototype.is_null() {
            Some(Prototype::Null)
        } else if Object::is(&prototype, &Object::get_prototype_of(&Object::new())) {
            Some(Prototype::Object)
        } else {
            None
        };
        if let Some(prototype) = plain {
            let keys = js::object_keys(value)?;
            let len = u64::from(keys.length());
            return Ok(HostValue::PlainObject { handle: self.hold(Held::Properties(value.clone(), keys)), len, prototype });
        }
        Ok(HostValue::Object { native: wasm_native(value), type_name: constructor_name(value)?, json_serializable: false })
    }
}

impl HostValues for JsHost {
    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, binding_core::Raised> {
        let array = match self.held.get(handle_position(list.raw())) {
            Some(Held::Items(array)) => array.clone(),
            _ => return Err(raised_binding("B-1: no such list")),
        };
        let index = js_index(index).map_err(|fail| raised(Thrown::Binding(fail)))?;
        let item = Reflect::get_u32(&array, index).map_err(js_raised)?;
        self.describe(&item).map_err(js_raised)
    }

    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), binding_core::Raised> {
        let index = js_index(index).map_err(|fail| raised(Thrown::Binding(fail)))?;
        let (key, value) = match self.held.get(handle_position(map.raw())) {
            Some(Held::Pairs(pairs)) => {
                let pair = Reflect::get_u32(pairs, index).map_err(js_raised)?;
                (Reflect::get_u32(&pair, 0).map_err(js_raised)?, Reflect::get_u32(&pair, 1).map_err(js_raised)?)
            }
            Some(Held::Properties(object, keys)) => {
                let key = Reflect::get_u32(keys, index).map_err(js_raised)?;
                // A getter runs here; its exception goes back to the caller unchanged (U-3).
                let value = Reflect::get(object, &key).map_err(js_raised)?;
                (key, value)
            }
            _ => return Err(raised_binding("B-1: no such map")),
        };
        let key = self.describe(&key).map_err(js_raised)?;
        let value = self.describe(&value).map_err(js_raised)?;
        Ok((key, value))
    }

    fn read(&mut self, /*READ*/) -> Result<HostValue, binding_core::Raised> {
        /*READS*/
    }
}

/// B-1: value instanceof globalThis[class], as JavaScript runs it: the Symbol.hasInstance of the class, whose
/// exception (a trap of a proxy) goes back to the caller.
fn instance_of(value: &JsValue, global: &Object, class: &str) -> Result<bool, JsValue> {
    let class = Reflect::get(global, &JsValue::from_str(class))?;
    let has_instance: Function = Reflect::get(&class, &js_sys::Symbol::has_instance())?.dyn_into()?;
    Ok(has_instance.call1(&class, value)?.is_truthy())
}

/// The name of the constructor of an object, as JavaScript reports it; "Object" when it has none.
fn constructor_name(value: &JsValue) -> Result<String, JsValue> {
    let constructor = Reflect::get(value, &JsValue::from_str("constructor"))?;
    if !constructor.is_function() {
        return Ok(String::from("Object"));
    }
    if let Some(name) = Reflect::get(&constructor, &JsValue::from_str("name"))?.as_string() {
        return Ok(name);
    }
    Ok(String::from("Object"))
}

/// U-7: an integer as a bigint.
fn js_bigint(value: i64) -> Result<JsValue, Fail> {
    Ok(js_sys::BigInt::from(value).into())
}

/// U-7: the literal token of a number (F-1 (a)) as a bigint, without loss.
fn js_literal_bigint(literal: &str) -> Result<JsValue, Fail> {
    js_sys::BigInt::new(&JsValue::from_str(literal)).map(JsValue::from).map_err(|error| internal(&JsValue::from(error)))
}

/// U-7: the literal token of a number as a JavaScript number, the nearest double.
fn js_literal_number(literal: &str) -> Result<JsValue, Fail> {
    match literal.parse::<f64>() {
        Ok(number) => out_float(number),
        Err(_token) => Err(binding_error(BindingError::Internal { detail: format!("U-7: {literal} is no number") })),
    }
}

/// U-7: bytes that are UTF-8 as a string.
fn js_utf8(bytes: &[u8]) -> Result<JsValue, Fail> {
    match std::str::from_utf8(bytes) {
        Ok(text) => out_text(text),
        Err(_bytes) => Err(binding_error(BindingError::Internal { detail: String::from("U-7: text of bytes that are not UTF-8") })),
    }
}

/// A count or an index of the core as the u32 of a JavaScript array.
fn js_index(value: u64) -> Result<u32, Fail> {
    u32::try_from(value).map_err(|_wide| binding_error(BindingError::Internal { detail: format!("{value} is beyond the length of an array") }))
}

/// A count or an index of Rust as the u64 of a handle or a length (a usize fits a u64 on wasm32).
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

/// U-3: an exception of JavaScript code while the core walks a value, as the Raised that the caller throws again.
fn js_raised(error: JsValue) -> binding_core::Raised {
    raised(Thrown::Js(error))
}

fn raised_binding(detail: &str) -> binding_core::Raised {
    raised(Thrown::Binding(binding_error(BindingError::Internal { detail: detail.to_owned() })))
}

/// An exception of JavaScript code while the module describes the value that the caller gave, thrown again unchanged.
fn js_fail(error: JsValue) -> Fail {
    Fail { thrown: Some(error), ..binding_error(BindingError::Internal { detail: String::new() }) }
}
`).replace(/\n\n(?=[ }])/g, '\n');

// U-7 (a'): the failure of the `in` of a value alias of another repository, as for Node (foreignFailureNode): its kind,
// status and errno are the owner's; its class is this repository's class of the category that the owner's E-1 gives
// the variant. An exception that JavaScript code raised while the owner's core walked the value is thrown again.
export function foreignFailureWasm(model: Model, rest: string): string {
  return foreignAliasLibraries(model).map((alias) => {
    const library = (alias.library ?? '').replaceAll('-', '_');
    const error = alias.error ?? { path: '', kinds: [] };
    const arms = error.kinds.map((k) => `        ${k.variant} { .. } => ${model.classes.findIndex((c) => c.category === k.category)},`).join('\n');
    return `
/// U-7 (a'): a kind of ${alias.library ?? ''} in the class of its category here.
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn ${library}_error(error: ${error.path}) -> Fail {
    let class: usize = match error {
${arms}
    };
    Fail { class, message: error.to_string(), kind: Kinds::kind(&error), status: Kinds::status(&error), errno: Kinds::errno(&error)${rest} }
}

fn ${library}_failure_error(failure: binding_core::Failure<${error.path}>) -> Fail {
    match failure {
        binding_core::Failure::Kind(error) => ${library}_error(error),
        binding_core::Failure::Raised(raised) => failure_error(binding_core::Failure::Raised(raised)),
        binding_core::Failure::Callback(error) => failure_error(binding_core::Failure::Callback(error)),
    }
}
`;
  }).join('');
}

// B-1, GN-6af: the JsHost of a model, as for Node (nodeHost): an instance of a class without core_type, whose prototype
// is the one that the entry registered, under one handle within the walk; an instance of a class of the module by the
// handle that the ES module reads from it. read gives the property that the row names.
export function wasmHost(model: Model): string {
  const reads = valueReads(model, 'wasm');
  if (reads.length === 0) {
    return WASM_HOST.replace('/*HELD*/', '').replace('/*SEEN*/', '').replace('/*NEW*/', '').replace('/*IDENTITY*/', '').replace('/*DESCRIBE*/', '').replace('/*READ*/', '_value: Handle')
      .replace('/*READS*/', 'Err(raised_binding("B-1: no value class is read"))');
  }
  const kept = reads.some((r) => r.kept !== undefined);
  const describe = reads.map((r, index) => {
    if (r.object !== undefined) {
      const position = model.objects.indexOf(r.object.unit);
      return `
        if handle_of(${position}, value).map_err(throw)?.is_some() {
            let handle = self.hold(Held::Value(value.clone(), ${index}));
            return Ok(HostValue::Value { kind: ${r.variant}, handle });
        }`;
    }
    const position = model.kept.findIndex((k) => k === r.kept?.unit);
    return `
        if value_prototype(${position}, value)? {
            let handle = self.identity(value, ${index})?;
            return Ok(HostValue::Value { kind: ${r.variant}, handle });
        }`;
  }).join('');
  const read = reads.map((r, index) => {
    if (r.kept !== undefined) {
      return `
            ${index} => {
                let kept = Reflect::get(&object, &JsValue::from_str(${rustString(langName('wasm', r.kept.field.name, 'variable'))})).map_err(js_raised)?;
                self.describe(&kept).map_err(js_raised)
            }`;
    }
    const o = r.object;
    if (o === undefined) return '';
    const position = model.objects.indexOf(o.unit);
    const plain = rustField(o.unit.unit.name).replace(/^r#/, '');
    const label = rustString(langName('wasm', o.unit.unit.name, 'class'));
    const value = o.unit.lock === undefined ? `${o.property.corePath}(&held)` : `${o.property.corePath}(&held.read(${label}, &[]).map_err(|error| raised(Thrown::Binding(binding_error(error))))?)`;
    return `
            ${index} => {
                let handle = handle_of(${position}, &object).map_err(|fail| raised(Thrown::Binding(fail)))?.ok_or_else(|| raised_binding("B-1: no such value"))?;
                let held = held_${plain}(handle).map_err(|fail| raised(Thrown::Binding(fail)))?;
                let value = ${value};
                Ok(${readValue(o.property.returns as string)})
            }`;
  }).join('');
  const identity = kept ? `
    /// GN-6af: the handle of an instance of a value class, the same for the same instance within the walk; the Map of
    /// the walk keeps the handle as its decimal text.
    fn identity(&mut self, value: &JsValue, read: usize) -> Result<Handle, JsValue> {
        let seen = self.seen.get_or_insert_with(js_sys::Map::new).clone();
        if let Some(found) = seen.get(value).as_string() {
            let raw = found.parse::<u64>().map_err(|_never| JsValue::from_str("B-1: no handle"))?;
            return Ok(Handle::new(raw));
        }
        let handle = self.hold(Held::Value(value.clone(), read));
        seen.set(value, &JsValue::from_str(&handle.raw().to_string()));
        Ok(handle)
    }
` : '';
  return WASM_HOST
    .replace('/*HELD*/', '\n    Value(JsValue, usize),')
    .replace('/*SEEN*/', kept ? '\n    seen: Option<js_sys::Map>,' : '')
    .replace('/*NEW*/', kept ? ', seen: None' : '')
    .replace('/*IDENTITY*/', identity)
    .replace('/*DESCRIBE*/', describe)
    .replace('/*READ*/', 'value: Handle')
    .replace('/*READS*/', `let Some(Held::Value(object, read)) = self.held.get(handle_position(value.raw())) else {
            return Err(raised_binding("B-1: no such value"));
        };
        let (object, read) = (object.clone(), *read);
        match read {${read}
            _ => Err(raised_binding("B-1: no such value")),
        }`) + (kept ? KEPT_WASM : '');
}

// GN-6af: the prototypes of the value classes without core_type, which the entry registers, and what makes their
// instances.
const KEPT_WASM = `
thread_local! {
    /// GN-6af: the prototypes of the value classes, in the order of the contract, which the entry registers once.
    static VALUE_PROTOTYPES: RefCell<Vec<JsValue>> = const { RefCell::new(Vec::new()) };
}

/// GN-6af: the registered prototype of a value class.
fn value_class(position: usize) -> Result<JsValue, JsValue> {
    VALUE_PROTOTYPES.with_borrow(|registered| registered.get(position).cloned()).ok_or_else(|| JsValue::from_str("GN-6af: the value classes are not registered"))
}

/// GN-6af: whether the prototype of an object is the prototype of the value class.
fn value_prototype(position: usize, value: &JsValue) -> Result<bool, JsValue> {
    let prototype = Reflect::get_prototype_of(value)?;
    Ok(Object::is(&prototype, &value_class(position)?))
}

/// GN-6af: a new instance of a value class, whose properties make defines.
fn value_instance(position: usize) -> Result<Object, Fail> {
    let prototype = value_class(position).map_err(|error| internal(&error))?;
    Ok(Object::create(prototype.unchecked_ref()))
}

/// GN-6af: a kept value as the own enumerable data property of an instance, writable when the property is.
fn value_define(object: &Object, name: &str, value: &JsValue, writable: bool) -> Result<(), Fail> {
    let descriptor = Object::new();
    for (key, part) in [("value", value.clone()), ("writable", JsValue::from_bool(writable)), ("enumerable", JsValue::TRUE)] {
        Reflect::set(&descriptor, &JsValue::from_str(key), &part).map_err(|error| internal(&error))?;
    }
    Object::define_property(object, &JsValue::from_str(name), &descriptor);
    Ok(())
}
`;

// GN-6af: an instance of a value class without core_type made from the content of an out row, before the content, as
// the object of its handle.
function keptMakeWasm(model: Model, kept: KeptClass, field: KeptField, holds: 'entries' | 'value', head: string): string {
  const position = model.kept.indexOf(kept);
  const name = rustString(langName('wasm', field.name, 'variable'));
  if (holds === 'value') {
    if (!field.writable) throw new Unsupported(`${kept.unit.id}: a reference makes an instance of a value class whose property keeps the value it holds, which is writable (GN-6af)`);
    return `{
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let instance = value_instance(${position})?;
            value_define(&instance, ${name}, &JsValue::NULL, true)?;
            made.insert(handle.raw(), instance.clone().into());
            let content = make(*value, source, made)?;
            value_define(&instance, ${name}, &content, true)?;
            Ok(instance.into())
        }`;
  }
  return `{
            ${head === '' ? '' : `${head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(made.clone());
            }
            let instance = value_instance(${position})?;
            let map = js_sys::Map::new();
            value_define(&instance, ${name}, &map, ${String(field.writable)})?;
            made.insert(handle.raw(), instance.clone().into());
            for index in 0..len {
                let (key, item) = source.entry(handle, index);
                let key = make(key, source, made)?;
                let item = make(item, source, made)?;
                map.set(&key, &item);
            }
            Ok(instance.into())
        }`;
}

// GN-6af: the exports of a value class without core_type: the check of the arguments of its constructor, which the class
// of the ES module calls before it keeps them, and, once, the registration of the prototypes.
export function keptExportsWasm(model: Model): string {
  if (model.kept.length === 0 || model.aliases.length === 0) return '';
  const checks = model.kept.map((kept) => {
    const js = langName('wasm', kept.unit.name, 'class');
    const variable = (f: KeptField): string => rustIdent(langName('wasm', f.name, 'variable'));
    const describe = (f: KeptField, value: string): string => {
      const subject = rustString(langName('wasm', f.name, 'variable'));
      const type = f.type;
      if (typeof type === 'object' && 'keyed_map' in type) {
        const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
        return `{
                let given = in_keyed_map(${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`a Map whose keys are ${type.key.map((k) => ({ int: 'safe integers', text: 'strings', bytes: 'Uint8Array' })[k] ?? k).join(' or ')}`)}, |item| Ok(item.clone()))?;
                let mut described = binding_core::KeyedMap::new();
                for (key, item) in given {
                    described.insert(key, host.describe(&item).map_err(js_fail)?);
                }
                Ok(described)
            }`;
      }
      if (typeof type === 'object' && 'list' in type) {
        return `{
                let given = in_list(${value}, ${subject}, |item| Ok(item.clone()))?;
                let mut described = Vec::new();
                for item in given {
                    described.push(host.describe(&item).map_err(js_fail)?);
                }
                Ok(described)
            }`;
      }
      return `host.describe(${value}).map_err(js_fail)`;
    };
    const lines = kept.fields.map((f) => {
      const v = variable(f);
      return f.default === undefined ? `        let ${v} = ${describe(f, `&${v}`)}?;` : `        let ${v} = in_default(&${v}, |value| ${describe(f, 'value')})?;`;
    });
    return `
/// GN-6af: judges the arguments of the constructor of ${js}, which the class of the ES module keeps.
#[wasm_bindgen(js_name = ${rustString(`__check${js}`)})]
pub fn check_${rustField(kept.unit.name).replace(/^r#/, '')}(${kept.fields.map((f) => `${variable(f)}: JsValue`).join(', ')}) -> Result<(), JsValue> {
    guard(|| {
        let mut host = JsHost::new();
${lines.join('\n')}
        ${kept.constructor.corePath}(&mut host, ${kept.fields.map(variable).join(', ')}).map_err(failure_error)
    })
    .map_err(throw)
}
`;
  }).join('');
  return `
/// GN-6af: the ES module registers the prototype of each value class when it loads.
#[wasm_bindgen(js_name = "__registerValues")]
pub fn register_values(prototypes: Vec<JsValue>) {
    VALUE_PROTOTYPES.with(|registered| registered.replace(prototypes));
}
${checks}`;
}

// GN-6u, GN-6z: the Natives of WebAssembly, which a value alias and a function type hold: the table of the one thread
// of the module.
// usedHelpers splits helpers at blank lines, so a block keeps none inside it.
export const WASM_NATIVE = (`
/// GN-6u: the JavaScript values that a core may keep, under the keys of their Natives.
struct NativeTable {
    next: u64,
    values: BTreeMap<u64, JsValue>,
}

thread_local! {
    /// GN-6u: the table of the one thread of the module.
    static NATIVE: RefCell<NativeTable> = const { RefCell::new(NativeTable { next: 0, values: BTreeMap::new() }) };
}

/// GN-6u: what a Native of WebAssembly holds: the key of the table, which holds the value.
#[derive(Debug)]
struct WasmNative {
    key: u64,
}

impl NativeObject for WasmNative {}

impl Drop for WasmNative {
    fn drop(&mut self) {
        let released = NATIVE.try_with(|native| native.try_borrow_mut().ok().and_then(|mut native| native.values.remove(&self.key)));
        // The value is released after the table is no longer borrowed.
        drop(released);
    }
}

/// GN-6u: a JavaScript value that a core may keep, as a Native.
fn wasm_native(value: &JsValue) -> Native {
    let key = NATIVE.with_borrow_mut(|native| {
        native.next = native.next.saturating_add(1);
        native.values.insert(native.next, value.clone());
        native.next
    });
    Native::new(WasmNative { key })
}

/// GN-6u: the JavaScript value that entered as the Native.
fn native_object(native: &Native) -> Result<JsValue, Fail> {
    let found = native.downcast::<WasmNative>().and_then(|native| NATIVE.with_borrow(|table| table.values.get(&native.key).cloned()));
    found.ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("GN-6u: a native value that no JavaScript value entered as") }))
}

/// GN-6z: a value of a function type is a function (kind invalid_argument_type), held as a Native.
fn in_function(value: &JsValue, subject: &str) -> Result<Native, Fail> {
    if !value.is_function() {
        return Err(binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from("a function") }));
    }
    Ok(wasm_native(value))
}
`).replace(/\n\n(?=[ }])/g, '\n');
