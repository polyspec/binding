// U-7: the WASM conversions of a value alias, as for Node (alias_node.ts): a JavaScript value enters as a HostValue
// that the module gives one level at a time (B-1) and the core's `in` function judges; a core value leaves as the
// OutValue that the core's `out` function gives, which the module makes into JavaScript values by the alias's `out`
// rows, the same handle as the same object (U-7 (d)). Every JavaScript operation that can run code of the value (a
// getter, a trap of a proxy, an iterator) is called with `catch`, so its exception comes back as a value that the
// module throws again unchanged and never unwinds through the WebAssembly frames.

import { type Model, type ValueAlias, langName, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported } from './model.ts';
import { container, outArms } from './alias_shared.ts';
import { foreignClasses } from './alias_node.ts';
import { classIn, classMakes, type ReadCase } from './value_class.ts';
import { jsString, rustString } from './text.ts';
import type { Member, Unit } from '../contract.ts';

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
      return 'native_object(handle)';
    default:
      throw new Unsupported(`${alias.unit.id}: the WASM form ${form} of the kind ${kind} is not generated yet`);
  }
}

// GN-6x: the classes of other repositories that the module calls, in the order of foreignClasses.
const classIndex = (model: Model, unit: Unit): number => foreignClasses(model).findIndex((c) => c.unit === unit);

// GN-6x: the JavaScript call of a member of the owner on an object: a property read or a method call.
function jsCall(member: Member, object: string, args: string[]): string {
  const name = `&JsValue::from_str(${rustString(langName('wasm', member.name, 'callable'))})`;
  if (member.kind === 'property') return `Reflect::get(${object}, ${name}).map_err(js_fail)?`;
  const call = args.length === 0 ? 'call0(object)' : `call${args.length}(object, ${args.join(', ')})`;
  return `{
                let object = ${object};
                let function: Function = Reflect::get(object, ${name}).and_then(JsCast::dyn_into).map_err(js_fail)?;
                function.${call}.map_err(js_fail)?
            }`;
}

// GN-6x: the WASM conversions of a value class of another repository, as in Node (GN-18b): an instance enters as
// HostValue::Value, which the owner's in function reads through the read members of its in row; a core value leaves as
// the instance that the owner's members of its out rows make.
function valueClassWasm(model: Model, alias: ValueAlias, name: string, core: string, failure: string): string {
  const label = langName('wasm', alias.unit.name, 'class');
  const own = classIndex(model, alias.unit);
  const arms = classMakes(alias, 'wasm').map((make) => {
    if (make.form === 'content') {
      if (make.kind === 'null') return `        OutValue::Null => Ok(${jsCall(make.member, '&class', [])}),`;
      if (make.kind === 'text16') {
        // B2.81: the UTF-16 code units of the text as an array of numbers, unpaired surrogates included.
        return `        OutValue::Text16(value) => {
            let units: js_sys::Array = value.into_iter().map(JsValue::from).collect();
            Ok(${jsCall(make.member, '&class', ['&JsValue::from(units)'])})
        }`;
      }
      const [variant, arg] = make.kind === 'bool' ? ['Bool', '&JsValue::from_bool(value)'] : [make.kind === 'number' ? 'Number' : 'Text', '&JsValue::from_str(&value)'];
      return `        OutValue::${variant}(value) => Ok(${jsCall(make.member, '&class', [arg])}),`;
    }
    if (make.form === 'list') {
      return `        OutValue::List { handle, len } => {
            let items = Array::new();
            for index in 0..len {
                let item = source.item(handle, index);
                items.push(&make(item, source)?);
            }
            Ok(${jsCall(make.member, '&class', ['&items'])})
        }`;
    }
    return `        OutValue::Map(value) => {
            let handle = value.handle();
            let len = value.len();
            let map_class: Function = foreign_class(${classIndex(model, make.map)}).map_err(js_fail)?;
            let map = Reflect::construct(&map_class, &Array::new()).map_err(js_fail)?;
            for index in 0..len {
                let (key, item) = source.entry(handle, index);
                let key = make(key, source)?;
                let item = make(item, source)?;
                let insert: Function = Reflect::get(&map, &JsValue::from_str(${rustString(langName('wasm', make.insert.name, 'callable'))})).and_then(JsCast::dyn_into).map_err(js_fail)?;
                insert.call2(&map, &key, &item).map_err(js_fail)?;
            }
            Ok(${jsCall(make.member, '&class', ['&map'])})
        }`;
  });
  return `
/// GN-6x: an instance of ${label} of ${alias.library ?? ''} enters as HostValue::Value, which the core of its owner judges.
fn in_${name}(value: &JsValue, subject: &str) -> Result<${core}, Fail> {
    let class = foreign_class(${own}).map_err(js_fail)?;
    if !value.is_object() || !foreign_instance(value, &class).map_err(js_fail)? {
        return Err(binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(label)}) }));
    }
    let mut host = JsHost { held: Vec::new() };
    let described = host.describe(value).map_err(js_fail)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// GN-6x: a core value of ${label} leaves as the instance that the members of its owner make.
fn out_${name}(value: impl Borrow<${core}>) -> Result<JsValue, Fail> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    make_${name}(root, &mut source)
}

fn make_${name}(out: OutValue, source: &mut dyn OutValues) -> Result<JsValue, Fail> {
    let make = make_${name};
    let class: JsValue = foreign_class(${own}).map_err(js_fail)?.into();
    match out {
${arms.join('\n')}
        other => Err(binding_error(BindingError::Internal { detail: format!("GN-6x: no out row of the kind {}", other.kind().as_str()) })),
    }
}
`;
}

// GN-6x: the ReadAs of an in case: its code units for the kind text16 (B2.81), a text or the code units that its units
// member gives (B2.89), or the content.
function readAs(kase: ReadCase): string {
  if (kase.kind === 'Text16') return 'ReadAs::Units';
  if (kase.units === undefined) return 'ReadAs::Content';
  return `ReadAs::TextOr(${rustString(langName('wasm', kase.units.name, 'callable'))}, ${String(kase.units.kind !== 'property')})`;
}

// GN-6x: the registry of the classes of other repositories and the description of their instances by the in rows.
function valueClassesWasmHost(model: Model): string {
  const classes = foreignClasses(model);
  const checks = model.aliases.filter((a) => a.owner !== undefined).flatMap((alias) => {
    const row = classIn(alias, 'wasm');
    const label = langName('wasm', alias.unit.name, 'class');
    const arms = row.cases.map((kase) => {
      const read = kase.read === undefined ? 'None' : `Some((${rustString(langName('wasm', kase.read.name, 'callable'))}, ${String(kase.read.kind !== 'property')}, ${readAs(kase)}))`;
      return `                ${rustString(kase.is)} => (ValueKind::${kase.kind}, ${read}),`;
    }).join('\n');
    const byName = `&JsValue::from_str(${rustString(langName('wasm', row.by.name, 'callable'))})`;
    const by = row.by.kind === 'property'
      ? `Reflect::get(value, ${byName})?`
      : `Reflect::get(value, ${byName})?.dyn_into::<Function>()?.call0(value)?`;
    return [`        if foreign_instance(value, &foreign_class(${classIndex(model, alias.unit)})?)? {
            let Some(by) = ${by}.as_string() else {
                return Err(JsValue::from_str("GN-6x: the kind of ${label} is no string"));
            };
            let (kind, read) = match by.as_str() {
${arms}
                other => return Err(JsValue::from_str(&format!("GN-6x: ${label} gives the kind {other}, which its in row has no case for"))),
            };
            return Ok(Some(HostValue::Value { kind, handle: self.hold(Held::Value(value.clone(), read)) }));
        }`, ...row.maps.map((map) => `        if foreign_instance(value, &foreign_class(${classIndex(model, map.unit)})?)? {
            let pairs = js::array_from(value)?;
            let len = u64::from(pairs.length());
            return Ok(Some(HostValue::Map { handle: self.hold(Held::Pairs(pairs)), len }));
        }`)];
  });
  return `
thread_local! {
    /// GN-6x: the classes of other repositories that the JavaScript entry hands over when the module loads, in the
    /// order of the generator: each value class and the classes of its owner that its read members give.
    static FOREIGN: RefCell<Vec<Function>> = const { RefCell::new(Vec::new()) };
}

/// GN-6x: the module keeps each class of another repository when it loads; a missing class fails the load.
#[allow(clippy::disallowed_methods, reason = "GN-18: the wasm_bindgen expansion")]
mod foreign_exports {
    use super::*;

    #[wasm_bindgen(js_name = "__register_foreign")]
    pub fn register_foreign(classes: Vec<Function>) -> Result<(), JsValue> {
        if classes.len() != ${classes.length} {
            return Err(JsValue::from_str(&format!("GN-6x: ${classes.length} classes of other repositories, {} given", classes.len())));
        }
        FOREIGN.with(|registered| registered.replace(classes));
        Ok(())
    }
}

/// GN-6x: the class of another repository at its position.
fn foreign_class(index: usize) -> Result<Function, JsValue> {
    match FOREIGN.with(|classes| classes.borrow().get(index).cloned()) {
        Some(class) => Ok(class),
        None => Err(JsValue::from_str("GN-6x: the classes of other repositories are not registered")),
    }
}

/// GN-6x: value instanceof class, as JavaScript runs it.
fn foreign_instance(value: &JsValue, class: &Function) -> Result<bool, JsValue> {
    let has_instance: Function = Reflect::get(class, &js_sys::Symbol::has_instance())?.dyn_into()?;
    Ok(has_instance.call1(class, value)?.is_truthy())
}

impl JsHost {
    /// GN-6x: an instance of a value class of another repository, described by the in row of the class, or an instance
    /// of a class of its owner that a read member gives, as a map of the pairs of its iteration.
    fn value_class(&mut self, value: &JsValue) -> Result<Option<HostValue>, JsValue> {
${checks.join('\n')}
        Ok(None)
    }

    /// GN-6x: the content of an instance that describe held, which the read member of its in case gives.
    fn read_value(&mut self, value: Handle) -> Result<HostValue, JsValue> {
        let held = match self.held.get(handle_position(value.raw())) {
            Some(Held::Value(object, Some(read))) => Some((object.clone(), *read)),
            _ => None,
        };
        let Some((object, (name, call, read_as))) = held else {
            return Err(JsValue::from_str("B-1: no such value"));
        };
        let content = js_member(&object, name, call)?;
        match read_as {
            // B2.81: the UTF-16 code units of a text of the kind text16, unpaired surrogates included.
            ReadAs::Units => Ok(HostValue::Text(HostText::Utf16(js_units(&content, name)?))),
            ReadAs::TextOr(units, units_call) => {
                // B2.89: null names a text with an unpaired surrogate, whose UTF-16 code units the member units gives,
                // so only such a text crosses as a list of numbers; any other text crosses as its UTF-8 bytes.
                if content.is_null() || content.is_undefined() {
                    return Ok(HostValue::Text(HostText::Utf16(js_units(&js_member(&object, units, units_call)?, units)?)));
                }
                let Some(text) = content.as_string() else {
                    return Err(JsValue::from_str(&format!("GN-6x: {name} gives no text and no null")));
                };
                Ok(HostValue::Text(HostText::Bytes(text.into_bytes())))
            }
            ReadAs::Content => self.describe(&content),
        }
    }
}

/// GN-6x: the value of a member of an instance, a property or the result of a method without arguments.
fn js_member(object: &JsValue, name: &str, call: bool) -> Result<JsValue, JsValue> {
    let content = Reflect::get(object, &JsValue::from_str(name))?;
    if call { content.dyn_into::<Function>()?.call0(object) } else { Ok(content) }
}

/// B2.81: the UTF-16 code units that a member gives as an array of numbers of 0 to 0xffff.
fn js_units(content: &JsValue, name: &str) -> Result<Vec<u16>, JsValue> {
    js_sys::Array::from(content).iter().map(|unit| js_unit(&unit)).collect::<Option<Vec<u16>>>()
        .ok_or_else(|| JsValue::from_str(&format!("GN-6x: {name} gives a unit that is no integer of 0 to 0xffff")))
}

/// GN-6x: how the read member of an in case gives the content of an instance.
#[derive(Clone, Copy)]
enum ReadAs {
    /// The content, described by the rules of the language.
    Content,
    /// The UTF-16 code units of a text of the kind text16 (B2.81).
    Units,
    /// A text, or null for a text whose UTF-16 code units the named member gives (B2.89).
    TextOr(&'static str, bool),
}

/// B2.81: a JavaScript number that is a UTF-16 code unit, an integer of 0 to 0xffff.
fn js_unit(unit: &JsValue) -> Option<u16> {
    let unit = unit.as_f64()?;
    if unit.fract() != 0.0 || !(0.0..=f64::from(u16::MAX)).contains(&unit) {
        return None;
    }
    #[allow(clippy::as_conversions, clippy::cast_possible_truncation, clippy::cast_sign_loss, reason = "B2.81: an integer of the range of u16, checked above")]
    let unit = unit as u16;
    Some(unit)
}
`;
}

// B-1: the host of the JavaScript values, with the description of the value classes of other repositories (GN-6x).
export function wasmHost(model: Model): string {
  if (!model.aliases.some((a) => a.owner !== undefined)) return WASM_HOST;
  const host = WASM_HOST
    .replace("    Properties(JsValue, Array),\n}", "    Properties(JsValue, Array),\n    Value(JsValue, Option<(&'static str, bool, ReadAs)>),\n}")
    .replace("    fn describe_object(&mut self, value: &JsValue) -> Result<HostValue, JsValue> {\n", "    fn describe_object(&mut self, value: &JsValue) -> Result<HostValue, JsValue> {\n        if let Some(described) = self.value_class(value)? {\n            return Ok(described);\n        }\n")
    .replace(/    fn read\(&mut self, _value: Handle\)[^]*?\n    \}\n/, `    fn read(&mut self, value: Handle) -> Result<HostValue, binding_core::Raised> {
        self.read_value(value).map_err(js_raised)
    }
`);
  return host + valueClassesWasmHost(model);
}

// GN-6x: the lines of the JavaScript entry that hand the classes of other repositories to the module.
export function foreignRegistrationWasm(model: Model): { imports: string; register: string } {
  const classes = foreignClasses(model);
  if (classes.length === 0) return { imports: '', register: '' };
  const libraries = [...new Set(classes.map((c) => c.alias.library ?? ''))];
  const imports = libraries.map((library) => `import * as foreign_${library.replaceAll('-', '_')} from ${jsString(`${(classes.find((c) => c.alias.library === library)?.alias.owner?.packages['node'] as { package: string } | undefined)?.package ?? library}/wasm`)};\n`).join('');
  const register = `// GN-6x: the module calls the classes of the value classes of other repositories; it keeps them from here on.
glue.__register_foreign([${classes.map((c) => `foreign_${(c.alias.library ?? '').replaceAll('-', '_')}.${langName('wasm', c.unit.name, 'class')}`).join(', ')}]);
`;
  return { imports, register };
}

export function aliasWasm(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const label = langName('wasm', alias.unit.name, 'class');
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  if (alias.owner !== undefined) return valueClassWasm(model, alias, name, core, failure);
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
            // B2.89: a string that isWellFormed crosses as its UTF-8 bytes; any other as its UTF-16 units.
            if text.is_well_formed() {
                return Ok(HostValue::Text(HostText::Bytes(String::from(text).into_bytes())));
            }
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
