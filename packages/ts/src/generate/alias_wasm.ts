// U-7: the WASM conversions of a value alias, as for Node (alias_node.ts): a JavaScript value enters as a HostValue
// that the module gives one level at a time (B-1) and the core's `in` function judges; a core value leaves as the
// OutValue that the core's `out` function gives, which the module makes into JavaScript values by the alias's `out`
// rows, the same handle as the same object (U-7 (d)). Every JavaScript operation that can run code of the value (a
// getter, a trap of a proxy, an iterator) is called with `catch`, so its exception comes back as a value that the
// module throws again unchanged and never unwinds through the WebAssembly frames.

import { type Model, type ValueAlias, langName, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported, variantPattern, errorMatched } from './model.ts';
import { container, outArms } from './alias_shared.ts';

// The JavaScript value of a built-in form, made from the content of the matched OutValue.
function builtin(alias: ValueAlias, form: string, kind: string): string {
  switch (form) {
    case 'null':
      return 'Ok(JsValue::NULL)';
    case 'bool':
      return 'bool_out(value)';
    case 'int':
      if (kind === 'number') return 'js_literal_number(&value)';
      return kind === 'int64' ? 'int_out(value)' : 'int_out(value.value())';
    case 'bigint':
      if (kind === 'number') return 'js_literal_bigint(&value)';
      return kind === 'int64' ? 'js_bigint(value)' : 'js_bigint(value.value())';
    case 'float':
      if (kind === 'number') return 'js_literal_number(&value)';
      if (kind === 'float') return 'float_out(value.value())';
      // An integer as the nearest double, by its decimal text: R-1 refuses an as conversion.
      return `js_literal_number(&${kind === 'int64' ? 'value' : 'value.value()'}.to_string())`;
    case 'text':
      return kind === 'bytes' ? 'js_utf8(value.value())' : 'text_out(value)';
    case 'bytes':
      return kind === 'text' ? 'bytes_out(value.as_bytes())' : 'bytes_out(value.value())';
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
      return 'native_object(handle)';
    default:
      throw new Unsupported(`${alias.unit.id}: the WASM form ${form} of the kind ${kind} is not generated yet`);
  }
}

export function aliasWasm(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const label = langName('wasm', alias.unit.name, 'class');
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  const arms = outArms(model, alias, 'wasm', (form, kind) => builtin(alias, form, kind), 'Err(binding_error(BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', '');
  return `
/// U-7: a JavaScript value of ${label} enters as HostValue, which the core judges.
fn in_${name}(value: &JsValue, _subject: &str) -> Result<${core}, Fail> {
    let mut host = JsHost { held: Vec::new() };
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
export const WASM_HOST = (`
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
    Properties(JsValue, Array),
}

struct JsHost {
    held: Vec<Held>,
}

impl JsHost {
    fn hold(&mut self, held: Held) -> Handle {
        self.held.push(held);
        Handle::new(handle_count(self.held.len() - 1))
    }

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
            return Ok(HostValue::Callable(native_handle(value)));
        }
        if value.is_symbol() {
            return Ok(HostValue::Other { type_name: String::from("symbol"), handle: native_handle(value) });
        }
        if !value.is_object() {
            return Ok(HostValue::Other { type_name: String::from("external"), handle: native_handle(value) });
        }
        self.describe_object(value)
    }

    /// B-1: an array, a Date, a Map and a plain object (its prototype Object.prototype or null) are their kinds; a typed
    /// array is outside the set; any other object is its handle with the name of its constructor, which the core judges.
    fn describe_object(&mut self, value: &JsValue) -> Result<HostValue, JsValue> {
        if js::is_array(value)? {
            let array: Array = value.clone().unchecked_into();
            let len = u64::from(array.length());
            return Ok(HostValue::List { handle: self.hold(Held::Items(array)), len });
        }
        let global = js_sys::global();
        if instance_of(value, &global, "Date")? {
            return Ok(HostValue::Date(native_handle(value)));
        }
        if js_sys::ArrayBuffer::is_view(value) && !instance_of(value, &global, "DataView")? {
            return Ok(HostValue::Other { type_name: constructor_name(value)?, handle: native_handle(value) });
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
        Ok(HostValue::Object { handle: native_handle(value), type_name: constructor_name(value)?, json_serializable: false })
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

    fn read(&mut self, _value: Handle) -> Result<HostValue, binding_core::Raised> {
        Err(raised_binding("B-1: no value class is read"))
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
        Ok(number) => float_out(number),
        Err(_token) => Err(binding_error(BindingError::Internal { detail: format!("U-7: {literal} is no number") })),
    }
}

/// U-7: bytes that are UTF-8 as a string.
fn js_utf8(bytes: &[u8]) -> Result<JsValue, Fail> {
    match std::str::from_utf8(bytes) {
        Ok(text) => text_out(text),
        Err(_bytes) => Err(binding_error(BindingError::Internal { detail: String::from("U-7: text of bytes that are not UTF-8") })),
    }
}

/// A count or an index of the core as the u32 of a JavaScript array.
fn js_index(value: u64) -> Result<u32, Fail> {
    u32::try_from(value).map_err(|_wide| binding_error(BindingError::Internal { detail: format!("{value} is beyond the length of an array") }))
}

thread_local! {
    /// U-7 (VAL-18): the JavaScript values that entered as handles, which a native value gives back as the same value.
    static NATIVE: RefCell<Vec<JsValue>> = const { RefCell::new(Vec::new()) };
}

/// The registry keeps each value for the life of the instance (U-7 (d)).
fn native_handle(value: &JsValue) -> Handle {
    NATIVE.with_borrow_mut(|native| {
        native.push(value.clone());
        Handle::new(handle_count(native.len() - 1))
    })
}

fn native_object(handle: Handle) -> Result<JsValue, Fail> {
    NATIVE.with_borrow(|native| match native.get(handle_position(handle.raw())) {
        Some(value) => Ok(value.clone()),
        None => Err(binding_error(BindingError::Internal { detail: String::from("U-7: the native value is gone") })),
    })
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
    const arms = error.kinds.map((k) => `        ${variantPattern(k.variant)} => ${model.classes.findIndex((c) => c.category === k.category)},`).join('\n');
    return `
/// U-7 (a'): a kind of ${alias.library ?? ''} in the class of its category here.
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn error_of_${library}(error: ${error.path}) -> Fail {
    let class: usize = match ${errorMatched({ codeOf: error.code }, 'error')} {
${arms}
    };
    Fail { class, message: error.to_string(), kind: Kinds::kind(&error), status: Kinds::status(&error), errno: Kinds::errno(&error)${rest} }
}

fn failure_of_${library}(failure: binding_core::Failure<${error.path}>) -> Fail {
    match failure {
        binding_core::Failure::Kind(error) => error_of_${library}(error),
        binding_core::Failure::Raised(raised) => failure_error(binding_core::Failure::Raised(raised)),
        binding_core::Failure::Callback(error) => failure_error(binding_core::Failure::Callback(error)),
    }
}
`;
  }).join('');
}
