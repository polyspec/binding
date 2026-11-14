// U-7: the WASM conversions of a value alias, as for Node (alias_node.ts): a JavaScript value enters as a HostValue
// that the module gives one level at a time (B-1) and the core's `in` function judges; a core value leaves as the
// OutValue that the core's `out` function gives, which the module makes into JavaScript values by the alias's `out`
// rows, the same handle as the same object (U-7 (d)). Every JavaScript operation that can run code of the value (a
// getter, a trap of a proxy, an iterator) is called with `catch`, so its exception comes back as a value that the
// module throws again unchanged and never unwinds through the WebAssembly frames.

import { type KeptClass, type KeptField, type Model, type ValueAlias, langName, rustField, rustIdent, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported, errorMatched } from './model.ts';
import { type Fill, type ForeignMake, type Walk, type WalkShape, NEXT_ENTRY, PUT_ENTRY, container, foreignReads, foreignRowClasses, outArms, readAsVariants, readValue, valueReads, walkRust } from './alias_shared.ts';
import { foreignClasses } from './alias_node.ts';
import { classIn, classMakes, type ReadCase } from './value_class.ts';
import { jsString, rustString } from './text.ts';
import { type Member, type Unit, variantPattern } from '../contract.ts';

// GN-6as: the containers that the walk of a value alias fills.
const PUT_INDEXED = `array.set(js_index(level.index)?, value);
level.index = level.index.saturating_add(1);`;

const ALIAS_FILLS: Fill[] = [
  { name: 'Items', doc: 'An array that takes the items of a list.', type: 'Array', pattern: 'OutFill::Items(array)', put: PUT_INDEXED, next: 'Some(source.item(level.handle, level.index))' },
  { name: 'Values', doc: 'An array that takes the values of the entries of a map or an object (U-7 (c)).', type: 'Array', pattern: 'OutFill::Values(array)', put: PUT_INDEXED, next: 'Some(source.entry(level.handle, level.index).1)' },
  { name: 'Entries', doc: 'A Map that takes the entries of a map or an object, with the made key of the entry whose value is made next.', type: 'js_sys::Map, Option<JsValue>', pattern: 'OutFill::Entries(map, key)', put: PUT_ENTRY('map.set(&key, &value);'), next: NEXT_ENTRY },
  { name: 'Defined', doc: 'GN-6af: an instance of a value class, whose property takes the value of a reference.', type: "Object, &'static str", pattern: 'OutFill::Defined(instance, name)', put: 'value_define(instance, name, &value, true)?;' },
  { name: 'Property', doc: 'GN-6ar: an instance of a class of another repository, whose writable property takes the value of a reference.', type: "JsValue, &'static str", pattern: 'OutFill::Property(object, name)', put: 'Reflect::set(object, &JsValue::from_str(name), &value).map_err(js_fail)?;' },
];

// GN-6as: the make function of WASM.
const WASM_WALK: WalkShape = {
  generics: '', life: '', anon: '', env: { params: '', args: '' }, value: 'JsValue',
  result: (type) => `Result<${type}, Fail>`, internal: (detail) => `Err(binding_error(BindingError::Internal { detail: ${detail} }))`, language: 'JavaScript',
};
const WASM_MADE = { name: 'made', type: '&mut BTreeMap<u64, JsValue>' };

// The JavaScript value of a built-in form, made from the content of the matched OutValue.
function builtin(alias: ValueAlias, form: string, kind: string, { put, leaf, level }: Walk): string {
  switch (form) {
    case 'null':
      return put('JsValue::NULL');
    case 'bool':
      return leaf('bool_out(value)');
    case 'int':
      if (kind === 'number') return leaf('js_literal_number(&value)');
      return leaf(kind === 'int64' ? 'int_out(value)' : 'int_out(value.value())');
    case 'bigint':
      if (kind === 'number') return leaf('js_literal_bigint(&value)');
      return leaf(kind === 'int64' ? 'js_bigint(value)' : 'js_bigint(value.value())');
    case 'float':
      if (kind === 'number') return leaf('js_literal_number(&value)');
      if (kind === 'float') return leaf('float_out(value.value())');
      // An integer as the nearest double, by its decimal text: R-1 refuses an as conversion.
      return leaf(`js_literal_number(&${kind === 'int64' ? 'value' : 'value.value()'}.to_string())`);
    case 'text':
      return leaf(kind === 'bytes' ? 'js_utf8(value.value())' : 'text_out(value)');
    case 'bytes':
      return leaf(kind === 'text' ? 'bytes_out(value.as_bytes())' : 'bytes_out(value.value())');
    case 'list': {
      const parts = container(alias, kind, form);
      // U-7 (c): a list form takes the items of a list, or the values of the entries of a map or an object.
      const fill = kind === 'list' ? 'Items' : 'Values';
      return `{
            ${parts.head === '' ? '' : `${parts.head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(made.clone()));
            }
            let array = Array::new_with_length(js_index(len)?);
            made.insert(handle.raw(), array.clone().into());
            ${level({ walks: true, fill: `OutFill::${fill}(array.clone())`, made: 'array.into()' })}
        }`;
    }
    case 'map':
    case 'keyed_map': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head === '' ? '' : `${parts.head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(made.clone()));
            }
            let map = js_sys::Map::new();
            made.insert(handle.raw(), map.clone().into());
            ${level({ walks: true, fill: 'OutFill::Entries(map.clone(), None)', made: 'map.into()' })}
        }`;
    }
    case 'native':
      return leaf('native_object(&native)');
    default:
      throw new Unsupported(`${alias.unit.id}: the WASM form ${form} of the kind ${kind} is not generated yet`);
  }
}

// GN-6x: the classes of other repositories that the module calls, in the order of foreignClasses.
const classIndex = (model: Model, unit: Unit): number => foreignClasses(model).findIndex((c) => c.unit === unit);

// GN-6ar: the position of a class of the owner that a row of a value alias of another repository names, after the
// classes of GN-6x in the list that the JavaScript entry hands over.
const rowIndex = (model: Model, library: string, unit: Unit): number =>
  foreignClasses(model).length + foreignRowClasses(model, 'wasm').findIndex((c) => c.library === library && c.unit.id === unit.id);

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
  // GN-6as: the list and the map class of the owner take their made children, and the member of the out row makes the
  // instance from them when the last child is made.
  const fills: Fill[] = [];
  const closes = new Map<string, string>();
  const arms = (walk: Walk): string => classMakes(alias, 'wasm').map((make) => {
    if (make.form === 'content') {
      if (make.kind === 'null') return `        OutValue::Null => ${walk.put(jsCall(make.member, '&class', []))},`;
      if (make.kind === 'text16') {
        // B2.81: the UTF-16 code units of the text as an array of numbers, unpaired surrogates included.
        return `        OutValue::Text16(value) => {
            let units: js_sys::Array = value.into_iter().map(JsValue::from).collect();
            ${walk.put(jsCall(make.member, '&class', ['&JsValue::from(units)']))}
        }`;
      }
      const [variant, arg] = make.kind === 'bool' ? ['Bool', '&JsValue::from_bool(value)'] : [make.kind === 'number' ? 'Number' : 'Text', '&JsValue::from_str(&value)'];
      return `        OutValue::${variant}(value) => ${walk.put(jsCall(make.member, '&class', [arg]))},`;
    }
    if (make.form === 'list') {
      if (!fills.some((fill) => fill.name === 'Items')) fills.push({ name: 'Items', doc: 'The array of the made items of a list.', type: 'Array', pattern: 'OutFill::Items(items)', put: 'items.push(&value);\nlevel.index = level.index.saturating_add(1);', next: 'Some(source.item(level.handle, level.index))' });
      closes.set('Items', `Ok(${jsCall(make.member, '&class', ['&items'])})`);
      return `        OutValue::List { handle, len } => ${walk.level({ walks: true, fill: 'OutFill::Items(Array::new())' })},`;
    }
    const insert = `let insert: Function = Reflect::get(map, &JsValue::from_str(${rustString(langName('wasm', make.insert.name, 'callable'))})).and_then(JsCast::dyn_into).map_err(js_fail)?;
        insert.call2(map, &key, &value).map_err(js_fail)?;`;
    if (!fills.some((fill) => fill.name === 'Entries')) fills.push({ name: 'Entries', doc: 'The instance of the map class of the owner, with the made key of the entry whose value is made next.', type: 'JsValue, Option<JsValue>', pattern: 'OutFill::Entries(map, key)', put: PUT_ENTRY(insert), next: NEXT_ENTRY });
    closes.set('Entries', `Ok(${jsCall(make.member, '&class', ['&map'])})`);
    return `        OutValue::Map(value) => {
            let handle = value.handle();
            let len = value.len();
            let map_class: Function = foreign_class(${classIndex(model, make.map)}).map_err(js_fail)?;
            let map = Reflect::construct(&map_class, &Array::new()).map_err(js_fail)?;
            ${walk.level({ walks: true, fill: 'OutFill::Entries(map, None)' })}
        }`;
  }).join('\n');
  const ownClass = `let class: JsValue = foreign_class(${own}).map_err(js_fail)?.into();`;
  const opened = /&class\b/.test(arms({ put: (value) => value, leaf: (made) => made, level: () => '' })) ? ownClass : '';
  return `
/// GN-6x: an instance of ${label} of ${alias.library ?? ''} enters as HostValue::Value, which the core of its owner judges.
fn in_${name}(value: &JsValue, subject: &str) -> Result<${core}, Fail> {
    let class = foreign_class(${own}).map_err(js_fail)?;
    if !value.is_object() || !foreign_instance(value, &class).map_err(js_fail)? {
        return Err(binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(label)}) }));
    }
    let mut host = JsHost::new();
    let described = host.describe(value).map_err(js_fail)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// GN-6x: a core value of ${label} leaves as the instance that the members of its owner make.
fn out_${name}(value: impl Borrow<${core}>) -> Result<JsValue, Fail> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    make_${name}(root, &mut source)
}
${walkRust(WASM_WALK, name, fills, arms, 'other => Err(binding_error(BindingError::Internal { detail: format!("GN-6x: no out row of the kind {}", other.kind().as_str()) })),', opened, undefined, { head: ownClass, of: (fill) => closes.get(fill.name) ?? '' })}`;
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
  return readAsVariants(valueClassesWasmHostAll(model));
}

function valueClassesWasmHostAll(model: Model): string {
  const classes = [...foreignClasses(model), ...foreignRowClasses(model, 'wasm')];
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
            return Ok(Some(HostValue::Value { kind, handle: self.hold(Held::Foreign(value.clone(), read)) }));
        }`, ...row.maps.map((map) => `        if foreign_instance(value, &foreign_class(${classIndex(model, map.unit)})?)? {
            let pairs = js::array_from(value)?;
            let len = u64::from(pairs.length());
            return Ok(Some(HostValue::Map { handle: self.hold(Held::Pairs(pairs)), len }));
        }`)];
  });
  // GN-6ar: an instance of a class of the owner that an in row of a value alias of another repository names. A class
  // that holds a bool, an integer or a float is a value; any other instance has one handle within the walk.
  const rows = foreignReads(model, 'wasm');
  for (const row of rows) {
    const read = `(${rustString(langName('wasm', row.read.name, 'callable'))}, false, ReadAs::${row.as})`;
    const index = rowIndex(model, row.library, row.unit);
    checks.push(row.as === 'Content'
      ? `        if foreign_instance(value, &foreign_class(${index})?)? {
            let handle = self.foreign_identity(value, ${read})?;
            return Ok(Some(HostValue::Value { kind: ${row.variant}, handle }));
        }`
      : `        if foreign_instance(value, &foreign_class(${index})?)? {
            return Ok(Some(HostValue::Value { kind: ${row.variant}, handle: self.hold(Held::Foreign(value.clone(), Some(${read}))) }));
        }`);
  }
  const identity = rows.some((row) => row.as === 'Content') ? `
    /// GN-6ar: the handle of an instance of a class of another repository, the same for the same instance within the
    /// walk; the Map of the walk keeps the handle as its decimal text.
    fn foreign_identity(&mut self, value: &JsValue, read: (&'static str, bool, ReadAs)) -> Result<Handle, JsValue> {
        let seen = self.seen.get_or_insert_with(js_sys::Map::new).clone();
        if let Some(found) = seen.get(value).as_string() {
            let raw = found.parse::<u64>().map_err(|_never| JsValue::from_str("B-1: no handle"))?;
            return Ok(Handle::new(raw));
        }
        let handle = self.hold(Held::Foreign(value.clone(), Some(read)));
        seen.set(value, &JsValue::from_str(&handle.raw().to_string()));
        Ok(handle)
    }
` : '';
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
${identity}
    /// GN-6x: the content of an instance that describe held, which the read member of its in case gives.
    fn read_value(&mut self, value: Handle) -> Result<HostValue, JsValue> {
        let held = match self.held.get(handle_position(value.raw())) {
            Some(Held::Foreign(object, Some(read))) => Some((object.clone(), *read)),
            _ => None,
        };
        let Some((object, (name, call, read_as))) = held else {
            return Err(JsValue::from_str("B-1: no such value"));
        };
        let content = js_member(&object, name, call)?;
        match read_as {
            /*Units{*/
            // B2.81: the UTF-16 code units of a text of the kind text16, unpaired surrogates included.
            ReadAs::Units => Ok(HostValue::Text(HostText::Utf16(js_units(&content, name)?))),
            /*}Units*/
            /*TextOr{*/
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
            /*}TextOr*/
            /*Content{*/
            ReadAs::Content => self.describe(&content),
            /*}Content*/
            /*Bool{*/
            // GN-6ar: the bool that a property of a class of another repository gives.
            ReadAs::Bool => content.as_bool().map(HostValue::Bool).ok_or_else(|| JsValue::from_str(&format!("GN-6ar: {name} gives no bool"))),
            /*}Bool*/
            /*Int{*/
            // GN-6ar: the integer that a property of a class of another repository gives, a number or a bigint.
            ReadAs::Int => {
                let wide = js_sys::BigInt::new(&content).map_err(JsValue::from)?;
                i64::try_from(wide).map(HostValue::Int).map_err(|_wide| JsValue::from_str(&format!("GN-6ar: {name} gives no integer of 64 bits")))
            }
            /*}Int*/
            /*Float{*/
            // GN-6ar: the float that a property of a class of another repository gives.
            ReadAs::Float => content.as_f64().map(HostValue::Float).ok_or_else(|| JsValue::from_str(&format!("GN-6ar: {name} gives no number"))),
            /*}Float*/
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
    /*Content{*/
    /// The content, described by the rules of the language.
    Content,
    /*}Content*/
    /*Units{*/
    /// The UTF-16 code units of a text of the kind text16 (B2.81).
    Units,
    /*}Units*/
    /*TextOr{*/
    /// A text, or null for a text whose UTF-16 code units the named member gives (B2.89).
    TextOr(&'static str, bool),
    /*}TextOr*/
    /*Bool{*/
    /// A bool (GN-6ar).
    Bool,
    /*}Bool*/
    /*Int{*/
    /// An integer (GN-6ar).
    Int,
    /*}Int*/
    /*Float{*/
    /// A float (GN-6ar).
    Float,
    /*}Float*/
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

// GN-6x: the lines of the JavaScript entry that hand the classes of other repositories to the module.
export function foreignRegistrationWasm(model: Model): { imports: string; register: string } {
  // GN-6ar: the classes of the rows of a value alias of another repository follow those of GN-6x.
  const classes = [...foreignClasses(model).map((c) => ({ library: c.alias.library ?? '', owner: c.alias.owner, unit: c.unit })), ...foreignRowClasses(model, 'wasm')];
  if (classes.length === 0) return { imports: '', register: '' };
  const libraries = [...new Set(classes.map((c) => c.library))];
  const imports = libraries.map((library) => `import * as foreign_${library.replaceAll('-', '_')} from ${jsString(`${(classes.find((c) => c.library === library)?.owner?.packages['node'] as { package: string } | undefined)?.package ?? library}/wasm`)};\n`).join('');
  const register = `// GN-6x, GN-6ar: the module calls the classes of other repositories; it keeps them from here on.
glue.__register_foreign([${classes.map((c) => `foreign_${c.library.replaceAll('-', '_')}.${langName('wasm', c.unit.name, 'class')}`).join(', ')}]);
`;
  return { imports, register };
}

export function aliasWasm(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const label = langName('wasm', alias.unit.name, 'class');
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  if (alias.owner !== undefined) return valueClassWasm(model, alias, name, core, failure);
  const arms = (walk: Walk): string => outArms(model, alias, 'wasm', (form, kind) => builtin(alias, form, kind, walk), 'Err(binding_error(BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', '', (kept, field, holds, head) => keptMakeWasm(model, kept, field, holds, head, walk), 'out_', (make, kind, head) => foreignMakeWasm(model, make, kind, head, walk), walk.leaf).join('\n');
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
${walkRust(WASM_WALK, name, ALIAS_FILLS, arms, 'other => Err(binding_error(BindingError::Internal { detail: format!("U-7: no out row of the kind {}", other.kind().as_str()) })),', '', WASM_MADE)}`;
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

    /// B-1: an array, a Date, a Map and a plain object (its prototype Object.prototype or null) are their kinds; a
    /// Uint8Array is bytes and another typed array is outside the set; any other object is its handle with the name of its constructor, which the core judges.
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
            // B-1: a Uint8Array is the bytes that the out row bytes makes, so a value that the binding gave enters again;
            // a typed array of another element type is outside the set.
            if let Some(bytes) = value.dyn_ref::<Uint8Array>() {
                return Ok(HostValue::Bytes(bytes.to_vec()));
            }
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

/// A count or an index of Rust as the u64 of a handle or a length.
fn handle_count(value: usize) -> u64 {
    // GN-6ac: usize is at most 64 bits wide on every target, which the assertion proves, so the else arm is never taken.
    const _: () = assert!(usize::BITS <= u64::BITS);
    let Ok(count) = u64::try_from(value) else {
        return u64::MAX;
    };
    count
}

/// A u64 of a handle or an index as a position of Rust.
fn handle_position(value: u64) -> usize {
    // A handle beyond usize names no position: usize::MAX is beyond the length of every table, so the lookup by it
    // finds nothing and gives the error of a missing entry.
    let Ok(position) = usize::try_from(value) else {
        return usize::MAX;
    };
    position
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

// B-1, GN-6af: the JsHost of a model, as for Node (nodeHost): an instance of a class without core_type, whose prototype
// is the one that the entry registered, under one handle within the walk; an instance of a class of the module by the
// handle that the ES module reads from it. read gives the property that the row names.
// GN-6x: an instance of a value class of another repository is HostValue::Value too, held as Held::Foreign with the
// read member of its in case, which read calls.
export function wasmHost(model: Model): string {
  const reads = valueReads(model, 'wasm');
  // GN-6ar: the classes of the rows of a value alias of another repository are read as those of GN-6x are, and an
  // instance read by its content has one handle within the walk, which the Map seen keeps.
  const foreign = model.aliases.some((a) => a.owner !== undefined) || foreignRowClasses(model, 'wasm').length > 0;
  const seen = foreignReads(model, 'wasm').some((row) => row.as === 'Content');
  const foreignHeld = foreign ? "\n    Foreign(JsValue, Option<(&'static str, bool, ReadAs)>)," : '';
  const foreignDescribe = foreign ? '\n        if let Some(described) = self.value_class(value)? {\n            return Ok(described);\n        }' : '';
  const foreignRead = 'self.read_value(value).map_err(js_raised)';
  const foreignHost = foreign ? valueClassesWasmHost(model) : '';
  if (reads.length === 0) {
    return WASM_HOST.replace('/*HELD*/', foreignHeld).replace('/*SEEN*/', seen ? '\n    seen: Option<js_sys::Map>,' : '').replace('/*NEW*/', seen ? ', seen: None' : '').replace('/*IDENTITY*/', '').replace('/*DESCRIBE*/', foreignDescribe).replace('/*READ*/', foreign ? 'value: Handle' : '_value: Handle')
      .replace('/*READS*/', foreign ? foreignRead : 'Err(raised_binding("B-1: no value class is read"))') + foreignHost;
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
    .replace('/*HELD*/', `\n    Value(JsValue, usize),${foreignHeld}`)
    .replace('/*SEEN*/', kept || seen ? '\n    seen: Option<js_sys::Map>,' : '')
    .replace('/*NEW*/', kept || seen ? ', seen: None' : '')
    .replace('/*IDENTITY*/', identity)
    .replace('/*DESCRIBE*/', `${foreignDescribe}${describe}`)
    .replace('/*READ*/', 'value: Handle')
    .replace('/*READS*/', `${foreign ? `if let Some(Held::Foreign(..)) = self.held.get(handle_position(value.raw())) {
            return ${foreignRead};
        }
        ` : ''}let Some(Held::Value(object, read)) = self.held.get(handle_position(value.raw())) else {
            return Err(raised_binding("B-1: no such value"));
        };
        let (object, read) = (object.clone(), *read);
        match read {${read}
            _ => Err(raised_binding("B-1: no such value")),
        }`) + (kept ? KEPT_WASM : '') + foreignHost;
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
function keptMakeWasm(model: Model, kept: KeptClass, field: KeptField, holds: 'entries' | 'value', head: string, { level }: Walk): string {
  const position = model.kept.indexOf(kept);
  const name = rustString(langName('wasm', field.name, 'variable'));
  if (holds === 'value') {
    if (!field.writable) throw new Unsupported(`${kept.unit.id}: a reference makes an instance of a value class whose property keeps the value it holds, which is writable (GN-6af)`);
    return `{
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(made.clone()));
            }
            let instance = value_instance(${position})?;
            value_define(&instance, ${name}, &JsValue::NULL, true)?;
            made.insert(handle.raw(), instance.clone().into());
            ${level({ walks: false, waiting: 'Some(*value)', fill: `OutFill::Defined(instance.clone(), ${name})`, made: 'instance.into()' })}
        }`;
  }
  return `{
            ${head === '' ? '' : `${head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(made.clone()));
            }
            let instance = value_instance(${position})?;
            let map = js_sys::Map::new();
            value_define(&instance, ${name}, &map, ${String(field.writable)})?;
            made.insert(handle.raw(), instance.clone().into());
            ${level({ walks: true, fill: 'OutFill::Entries(map, None)', made: 'instance.into()' })}
        }`;
}

// GN-6ar: an instance of a class of the owner made from the content of an out row, by Reflect.construct of the class
// that the JavaScript entry handed over: the content of the kind; the Map of the entries, which the instance keeps
// (GN-6af) and which is filled after the instance is made; or a reference made on null, whose writable property takes
// the made value by Reflect.set, as an assignment does. An object and a reference are the same instance at every
// position of their handle (U-7 (d)).
function foreignMakeWasm(model: Model, make: ForeignMake, kind: string, head: string, { put, level }: Walk): string {
  const constructed = (argument: string): string => `let class = foreign_class(${rowIndex(model, make.library, make.unit)}).map_err(js_fail)?;
            let instance = Reflect::construct(&class, &Array::of1(${argument})).map_err(js_fail)?;`;
  if (make.holds === 'content') {
    const content = ({ bool: '&JsValue::from_bool(value)', float: '&JsValue::from_f64(value.value())' } as Record<string, string | undefined>)[kind];
    if (content === undefined) throw new Unsupported(`the wasm make ${make.unit.id}.constructor of the kind ${kind} of ${make.library} is not generated yet: a constructor of a class of another repository takes a bool or a float in WASM (GN-6ar)`);
    return `{
            ${constructed(content)}
            ${put('instance')}
        }`;
  }
  if (make.holds === 'value') {
    return `{
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(made.clone()));
            }
            ${constructed('&JsValue::NULL')}
            made.insert(handle.raw(), instance.clone());
            ${level({ walks: false, waiting: 'Some(*value)', fill: `OutFill::Property(instance.clone(), ${rustString(langName('wasm', make.set?.name ?? [], 'callable'))})`, made: 'instance' })}
        }`;
  }
  return `{
            ${head === '' ? '' : `${head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(made.clone()));
            }
            let map = js_sys::Map::new();
            ${constructed('&map')}
            made.insert(handle.raw(), instance.clone());
            ${level({ walks: true, fill: 'OutFill::Entries(map, None)', made: 'instance' })}
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
                let given = keyed_map_in(${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`a Map whose keys are ${type.key.map((k) => ({ int: 'safe integers', text: 'strings', bytes: 'Uint8Array' })[k] ?? k).join(' or ')}`)}, |item| Ok(item.clone()))?;
                let mut described = binding_core::KeyedMap::new();
                for (key, item) in given {
                    described.insert(key, host.describe(&item).map_err(js_fail)?);
                }
                Ok(described)
            }`;
      }
      if (typeof type === 'object' && 'list' in type) {
        return `{
                let given = list_in(${value}, ${subject}, |item| Ok(item.clone()))?;
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
      return f.default === undefined ? `        let ${v} = ${describe(f, `&${v}`)}?;` : `        let ${v} = default_in(&${v}, |value| ${describe(f, 'value')})?;`;
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
        let released = NATIVE.try_with(|native| match native.try_borrow_mut() {
            Ok(mut native) => native.values.remove(&self.key),
            // A table that is borrowed at this drop keeps the value; no Native names its key again.
            Err(_borrowed) => None,
        });
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
fn kept_function_in(value: &JsValue, subject: &str) -> Result<Native, Fail> {
    if !value.is_function() {
        return Err(binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from("a function") }));
    }
    Ok(wasm_native(value))
}
`).replace(/\n\n(?=[ }])/g, '\n');
