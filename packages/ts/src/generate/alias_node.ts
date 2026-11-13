// U-7: the Node conversions of a value alias. A JavaScript value enters as a HostValue that the binding gives one level
// at a time (B-1) and the core's `in` function judges; a core value leaves as the OutValue that the core's `out`
// function gives, which the binding makes into JavaScript values by the alias's `out` rows, the same handle as the same
// object (U-7 (d)). What a JavaScript value is as a HostValue is binding's rule, the same for every alias; which kinds
// an alias takes is its core's.

import { type Model, type ValueAlias, langName, rustField, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported } from './model.ts';
import { container, outArms, ownedNatives } from './alias_shared.ts';

// The JavaScript value of a built-in form, made from the content of the matched OutValue.
function builtin(alias: ValueAlias, form: string, kind: string): string {
  switch (form) {
    case 'null':
      return 'out_null(env)';
    case 'bool':
      return 'out_bool(env, value)';
    case 'int':
      if (kind === 'number') return 'js_literal_number(env, &value)';
      return kind === 'int64' ? 'out_int(env, value)' : 'out_int(env, value.value())';
    case 'bigint':
      if (kind === 'number') return 'js_literal_bigint(env, &value)';
      return kind === 'int64' ? 'js_bigint(env, value)' : 'js_bigint(env, value.value())';
    case 'float':
      if (kind === 'number') return 'js_literal_number(env, &value)';
      if (kind === 'float') return 'out_float(env, value.value())';
      // An integer as the nearest double, by its decimal text: R-1 refuses an as conversion.
      return `js_literal_number(env, &${kind === 'int64' ? 'value' : 'value.value()'}.to_string())`;
    case 'text':
      return kind === 'bytes' ? 'js_utf8(env, value.value())' : 'out_text(env, value)';
    case 'bytes':
      return kind === 'text' ? 'js_bytes(env, value.as_bytes())' : 'js_bytes(env, value.value())';
    case 'list': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head}
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(*made);
            }
            let mut array = env.create_array(js_index(len)?).map_err(internal)?;
            made.insert(handle.raw(), array.to_unknown());
            for index in 0..len {
                let item = ${parts.item};
                let item = make(env, item, source, made)?;
                array.set(js_index(index)?, item).map_err(internal)?;
            }
            Ok(array.to_unknown())
        }`;
    }
    case 'map':
    case 'keyed_map': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head}
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(*made);
            }
            let map = js_new_map(env).map_err(internal)?;
            made.insert(handle.raw(), map.to_unknown());
            for index in 0..len {
                let (key, item) = ${parts.entry};
                let key = make(env, key, source, made)?;
                let item = make(env, item, source, made)?;
                js_map_set(map, key, item).map_err(internal)?;
            }
            Ok(map.to_unknown())
        }`;
    }
    case 'native':
      return 'native_object(env, &native)';
    default:
      throw new Unsupported(`${alias.unit.id}: the Node form ${form} of the kind ${kind} is not generated yet`);
  }
}

export function aliasNode(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const label = langName('node', alias.unit.name, 'class');
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  const arms = outArms(model, alias, 'node', (form, kind) => builtin(alias, form, kind), 'Err(binding_error(BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', 'env, ');
  return `
/// U-7: a JavaScript value of ${label} enters as HostValue, which the core judges.
fn in_${name}<'env>(env: &'env Env, value: Unknown<'env>, _subject: &str) -> Result<${core}, Fail> {
    let mut host = JsHost { env, held: Vec::new(), marked: 0 };
    let described = host.describe(value).map_err(js_fail)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// U-7: a core value of ${label} leaves as the JavaScript values of its out rows.
fn out_${name}<'env>(env: &'env Env, value: impl Borrow<${core}>) -> Result<Unknown<'env>, Fail> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    let mut made = BTreeMap::new();
    make_${name}(env, root, &mut source, &mut made)
}

fn make_${name}<'env>(
    env: &'env Env,
    out: OutValue,
    source: &mut dyn OutValues,
    made: &mut BTreeMap<u64, Unknown<'env>>,
) -> Result<Unknown<'env>, Fail> {
    let make = make_${name};
    match out.clone() {
${arms.join('\n')}
        other => Err(binding_error(BindingError::Internal { detail: format!("U-7: no out row of the kind {}", other.kind().as_str()) })),
    }
}
`;
}

// B-1: what a JavaScript value is as a HostValue, one level at a time; the children of a container are asked for
// through HostValues by the handles that describe gave.
// usedHelpers splits helpers at blank lines, so a block keeps none inside it.
export const NODE_HOST = (`
/// B-1: the JavaScript values whose children the core may ask for, under the handles that describe gave: an array, the
/// [key, value] pairs of a Map, and a plain object with its own enumerable string keys.
enum Held<'env> {
    Items(Object<'env>),
    Pairs(Object<'env>),
    Properties(Object<'env>, Object<'env>),
}

struct JsHost<'env> {
    env: &'env Env,
    held: Vec<Held<'env>>,
    marked: u64,
}

impl<'env> JsHost<'env> {
    fn hold(&mut self, held: Held<'env>) -> Handle {
        self.held.push(held);
        Handle::new(handle_count(self.held.len() - 1))
    }

    /// GN-6o: the handle of a Date or of a value outside the closed set, its number in the order of the call.
    fn mark(&mut self) -> Handle {
        self.marked = self.marked.saturating_add(1);
        Handle::new(self.marked)
    }

    /// B-1: a primitive is its kind (a number is untyped: whether it is an integer is the core's rule); a bigint is an
    /// integer, as its decimal token outside i64; a string keeps its UTF-16 units, unpaired surrogates included.
    fn describe(&mut self, value: Unknown<'env>) -> napi::Result<HostValue> {
        match value.get_type()? {
            ValueType::Undefined => Ok(HostValue::Undefined),
            ValueType::Null => Ok(HostValue::Null),
            ValueType::Boolean => Ok(HostValue::Bool(unsafe { value.cast::<bool>() }?)),
            ValueType::Number => Ok(HostValue::UntypedNumber(unsafe { value.cast::<f64>() }?)),
            ValueType::String => {
                let text: JsString<'env> = unsafe { value.cast() }?;
                let utf16 = text.into_utf16()?;
                let units = match utf16.as_slice().split_last() {
                    Some((_nul, units)) => units.to_vec(),
                    None => Vec::new(),
                };
                Ok(HostValue::Text(HostText::Utf16(units)))
            }
            ValueType::BigInt => {
                let text: String = js_global_call(self.env, "String", value)?;
                Ok(match text.parse::<i64>() {
                    Ok(int) => HostValue::Int(int),
                    Err(_wide) => HostValue::Number(text),
                })
            }
            ValueType::Function => Ok(HostValue::Callable(js_native(self.env, value)?)),
            ValueType::Object => self.describe_object(value),
            ValueType::Symbol => Ok(HostValue::Other { type_name: String::from("symbol"), handle: self.mark() }),
            _other => Ok(HostValue::Other { type_name: String::from("external"), handle: self.mark() }),
        }
    }

    /// B-1: an array, a Date, a Map and a plain object (its prototype Object.prototype or null) are their kinds; a typed
    /// array is outside the set; any other object is its handle with the name of its constructor, which the core judges.
    fn describe_object(&mut self, value: Unknown<'env>) -> napi::Result<HostValue> {
        let object: Object<'env> = unsafe { value.cast() }?;
        if value.is_array()? {
            let len = u64::from(object.get_array_length()?);
            return Ok(HostValue::List { handle: self.hold(Held::Items(object)), len });
        }
        if value.is_date()? {
            return Ok(HostValue::Date(self.mark()));
        }
        if value.is_typedarray()? {
            return Ok(HostValue::Other { type_name: js_constructor_name(object)?, handle: self.mark() });
        }
        let global = self.env.get_global()?;
        let map_class: Unknown<'_> = global.get_named_property("Map")?;
        if value.instanceof(map_class)? {
            let pairs: Object<'env> = js_global_member_call(self.env, "Array", "from", value)?;
            let len = u64::from(pairs.get_array_length()?);
            return Ok(HostValue::Map { handle: self.hold(Held::Pairs(pairs)), len });
        }
        let prototype = object.get_prototype()?;
        let object_class: Object<'_> = global.get_named_property_unchecked("Object")?;
        let object_prototype: Unknown<'_> = object_class.get_named_property("prototype")?;
        let plain = if prototype.get_type()? == ValueType::Null {
            Some(Prototype::Null)
        } else if self.env.strict_equals(prototype, object_prototype)? {
            Some(Prototype::Object)
        } else {
            None
        };
        if let Some(prototype) = plain {
            let keys: Object<'env> = js_global_member_call(self.env, "Object", "keys", value)?;
            let len = u64::from(keys.get_array_length()?);
            return Ok(HostValue::PlainObject { handle: self.hold(Held::Properties(object, keys)), len, prototype });
        }
        Ok(HostValue::Object { native: js_native(self.env, value)?, type_name: js_constructor_name(object)?, json_serializable: false })
    }
}

impl HostValues for JsHost<'_> {
    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, binding_core::Raised> {
        let array = match self.held.get(handle_position(list.raw())) {
            Some(Held::Items(array)) => *array,
            _ => return Err(raised_binding("B-1: no such list")),
        };
        let index = js_index(index).map_err(|fail| raised(Thrown::Binding(fail)))?;
        let item: Unknown<'_> = array.get_element(index).map_err(|error| raised(Thrown::Js(error)))?;
        self.describe(item).map_err(|error| raised(Thrown::Js(error)))
    }

    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), binding_core::Raised> {
        let index = js_index(index).map_err(|fail| raised(Thrown::Binding(fail)))?;
        let (key, value) = match self.held.get(handle_position(map.raw())) {
            Some(Held::Pairs(pairs)) => {
                let pair: Object<'_> = pairs.get_element(index).map_err(|error| raised(Thrown::Js(error)))?;
                let key: Unknown<'_> = pair.get_element(0).map_err(|error| raised(Thrown::Js(error)))?;
                let value: Unknown<'_> = pair.get_element(1).map_err(|error| raised(Thrown::Js(error)))?;
                (key, value)
            }
            Some(Held::Properties(object, keys)) => {
                let key: Unknown<'_> = keys.get_element(index).map_err(|error| raised(Thrown::Js(error)))?;
                // A getter runs here; its exception goes back to the caller unchanged (U-3).
                let value: Unknown<'_> = object.get_property(key).map_err(|error| raised(Thrown::Js(error)))?;
                (key, value)
            }
            _ => return Err(raised_binding("B-1: no such map")),
        };
        let key = self.describe(key).map_err(|error| raised(Thrown::Js(error)))?;
        let value = self.describe(value).map_err(|error| raised(Thrown::Js(error)))?;
        Ok((key, value))
    }

    fn read(&mut self, _value: Handle) -> Result<HostValue, binding_core::Raised> {
        Err(raised_binding("B-1: no value class is read"))
    }
}

/// A function of the global object called with one value, such as String(value).
fn js_global_call<'env, T: FromNapiValue>(env: &'env Env, name: &str, value: Unknown<'env>) -> napi::Result<T> {
    let function: Function<'env, FnArgs<(Unknown<'env>,)>, T> = env.get_global()?.get_named_property(name)?;
    function.call(FnArgs::from((value,)))
}

/// A member function of a global object called with one value, such as Array.from(value).
fn js_global_member_call<'env, T: FromNapiValue>(env: &'env Env, object: &str, name: &str, value: Unknown<'env>) -> napi::Result<T> {
    // A global class is a function, which an Object of napi refuses unless unchecked.
    let holder: Object<'env> = env.get_global()?.get_named_property_unchecked(object)?;
    let function: Function<'env, FnArgs<(Unknown<'env>,)>, T> = holder.get_named_property(name)?;
    function.apply(holder, FnArgs::from((value,)))
}

/// The name of the constructor of an object, as JavaScript reports it; "Object" when it has none.
fn js_constructor_name(object: Object<'_>) -> napi::Result<String> {
    let constructor: Unknown<'_> = object.get_named_property("constructor")?;
    if constructor.get_type()? != ValueType::Function {
        return Ok(String::from("Object"));
    }
    let constructor: Object<'_> = unsafe { constructor.cast() }?;
    let name: Unknown<'_> = constructor.get_named_property("name")?;
    if name.get_type()? != ValueType::String {
        return Ok(String::from("Object"));
    }
    unsafe { name.cast::<String>() }
}

/// U-7: a new Map, which make fills.
fn js_new_map(env: &Env) -> napi::Result<Object<'_>> {
    let class: Function<'_, (), Unknown<'_>> = env.get_global()?.get_named_property("Map")?;
    let map = class.new_instance(())?;
    unsafe { map.cast() }
}

fn js_map_set<'env>(map: Object<'env>, key: Unknown<'env>, value: Unknown<'env>) -> napi::Result<()> {
    let set: Function<'env, FnArgs<(Unknown<'env>, Unknown<'env>)>, Unknown<'env>> = map.get_named_property("set")?;
    set.apply(map, FnArgs::from((key, value))).map(|_map| ())
}

/// U-7: an integer as a bigint.
fn js_bigint(env: &Env, value: i64) -> Result<Unknown<'_>, Fail> {
    Ok(env.create_bigint_from_i64(value).map_err(internal)?.into_unknown(env).map_err(internal)?)
}

/// U-7: the literal token of a number (F-1 (a)) as a bigint, without loss.
fn js_literal_bigint<'env>(env: &'env Env, literal: &str) -> Result<Unknown<'env>, Fail> {
    let text = out_text(env, literal)?;
    js_global_call(env, "BigInt", text).map_err(internal)
}

/// U-7: the literal token of a number as a JavaScript number, the nearest double.
fn js_literal_number<'env>(env: &'env Env, literal: &str) -> Result<Unknown<'env>, Fail> {
    match literal.parse::<f64>() {
        Ok(number) => out_float(env, number),
        Err(_token) => Err(binding_error(BindingError::Internal { detail: format!("U-7: {literal} is no number") })),
    }
}

/// U-7: bytes that are UTF-8 as a string.
fn js_utf8<'env>(env: &'env Env, bytes: &[u8]) -> Result<Unknown<'env>, Fail> {
    match std::str::from_utf8(bytes) {
        Ok(text) => out_text(env, text),
        Err(_bytes) => Err(binding_error(BindingError::Internal { detail: String::from("U-7: text of bytes that are not UTF-8") })),
    }
}

/// U-7: bytes as a Uint8Array.
fn js_bytes<'env>(env: &'env Env, bytes: &[u8]) -> Result<Unknown<'env>, Fail> {
    ToNapiValue::into_unknown(napi::bindgen_prelude::Uint8Array::from(bytes.to_vec()), env).map_err(internal)
}

/// A count or an index of the core as the u32 of a JavaScript array.
fn js_index(value: u64) -> Result<u32, Fail> {
    u32::try_from(value).map_err(|_wide| binding_error(BindingError::Internal { detail: format!("{value} is beyond the length of an array") }))
}

${ownedNatives('napi::UnknownRef<false>', 'release_references(references);')}
thread_local! {
    /// GN-6o: the env of the table of this thread, which releases its references.
    static NATIVE_ENV: std::cell::Cell<napi::sys::napi_env> = const { std::cell::Cell::new(std::ptr::null_mut()) };
}

/// GN-6o: releases references of the env of this thread. A reference that napi cannot delete stays with the env,
/// which frees it when it ends.
fn release_references(references: Vec<napi::UnknownRef<false>>) {
    let env = Env::from_raw(NATIVE_ENV.get());
    for reference in references {
        let _kept = reference.unref(&env);
    }
}

/// GN-6o: a JavaScript value that a core may keep, as a Native of the table of this thread; the cleanup hook of the
/// env is registered with the table.
fn js_native(env: &Env, value: Unknown<'_>) -> napi::Result<Native> {
    if OWNED.with_borrow(Option::is_none) {
        let Some((owner, generation)) = native_owner() else {
            return Err(napi::Error::from_reason("GN-6o: the table of the owners is poisoned"));
        };
        env.add_env_cleanup_hook((), |()| clean_up_native())?;
        NATIVE_ENV.set(env.raw());
        OWNED.with_borrow_mut(|owned| *owned = Some(Owned { owner, generation, next: 0, values: BTreeMap::new() }));
    }
    // SAFETY: the value is a live value of this env; from_napi_value creates a reference to it.
    let reference = unsafe { <napi::UnknownRef<false> as FromNapiValue>::from_napi_value(env.raw(), value.raw()) }?;
    keep_native(reference).ok_or_else(|| napi::Error::from_reason("GN-6o: this thread has no table"))
}

/// GN-6o: the JavaScript value that entered as the Native; one of an ended env, or of another thread, is kind internal.
fn native_object<'env>(env: &'env Env, native: &Native) -> Result<Unknown<'env>, Fail> {
    let found = native.downcast::<OwnedNative>().and_then(|native| {
        OWNED.with_borrow(|owned| match owned {
            Some(owned) if owned.owner == native.owner && owned.generation == native.generation => owned.values.get(&native.key).map(|reference| reference.get_value(env)),
            _ => None,
        })
    });
    match found {
        Some(value) => value.map_err(internal),
        None => Err(binding_error(BindingError::Internal { detail: String::from("GN-6o: the native value is gone") })),
    }
}

/// A count or an index of Rust as the u64 of a handle or a length (a usize fits a u64 on the targets of T-2).
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

/// U-3: an exception of JavaScript code, or a failure of the binding, while the core walks a value, as the Raised that
/// the caller throws again.
fn raised(error: Thrown) -> binding_core::Raised {
    let error = match error {
        Thrown::Js(error) if error.status != napi::Status::PendingException => Thrown::Binding(internal(error)),
        other => other,
    };
    let handle = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    THROWN.with_borrow_mut(|map| map.insert(handle, error));
    binding_core::Raised::from_generated(binding_core::Handle::new(handle))
}

fn raised_binding(detail: &str) -> binding_core::Raised {
    raised(Thrown::Binding(binding_error(BindingError::Internal { detail: detail.to_owned() })))
}

/// An exception of JavaScript code while the binding describes the value that the caller gave, thrown again unchanged;
/// a failure of napi itself is kind internal.
fn js_fail(error: napi::Error) -> Fail {
    if error.status != napi::Status::PendingException {
        return internal(error);
    }
    Fail { thrown: Some(error), ..binding_error(BindingError::Internal { detail: String::new() }) }
}
`).replace(/\n\n(?=[ }])/g, '\n');

// U-7 (a'): the failure of the `in` of a value alias of another repository. Its kind, status and errno are the owner's;
// its class is this repository's class of the category that the owner's E-1 gives the variant, by a match without a
// wildcard (I-2 (3)). An exception that language code raised while the owner's core walked the value is thrown again.
export function foreignFailureNode(model: Model): string {
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
    library_error(class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))
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
