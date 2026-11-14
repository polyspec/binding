// U-7: the Node conversions of a value alias. A JavaScript value enters as a HostValue that the binding gives one level
// at a time (B-1) and the core's `in` function judges; a core value leaves as the OutValue that the core's `out`
// function gives, which the binding makes into JavaScript values by the alias's `out` rows, the same handle as the same
// object (U-7 (d)). What a JavaScript value is as a HostValue is binding's rule, the same for every alias; which kinds
// an alias takes is its core's.

import { type KeptClass, type KeptField, type Model, type ValueAlias, langName, rustField, rustIdent, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported, errorMatched } from './model.ts';
import { type Fill, type ForeignMake, type Walk, type WalkShape, NEXT_ENTRY, PUT_ENTRY, foreignReads, foreignRowClasses, container, outArms, ownedNatives, readAsVariants, readValue, valueReads, walkRust } from './alias_shared.ts';
import { classIn, classMakes, type ReadCase } from './value_class.ts';
import { jsString, rustString } from './text.ts';
import { type Member, type Unit, variantPattern } from '../contract.ts';

const PUT_INDEXED = (array: string): string => `${array}.set(js_index(level.index)?, value).map_err(internal)?;
level.index = level.index.saturating_add(1);`;

// U-7: the containers that the walk of a value alias fills.
const ALIAS_FILLS: Fill[] = [
  { name: 'Items', doc: 'An array that takes the items of a list.', type: "Array<'env>", pattern: 'OutFill::Items(array)', put: PUT_INDEXED('array'), next: 'Some(source.item(level.handle, level.index))' },
  { name: 'Values', doc: 'An array that takes the values of the entries of a map or an object (U-7 (c)).', type: "Array<'env>", pattern: 'OutFill::Values(array)', put: PUT_INDEXED('array'), next: 'Some(source.entry(level.handle, level.index).1)' },
  { name: 'Entries', doc: 'A Map that takes the entries of a map or an object, with the made key of the entry whose value is made next.', type: "Object<'env>, Option<Unknown<'env>>", pattern: 'OutFill::Entries(map, key)', put: PUT_ENTRY('js_map_set(*map, key, value).map_err(internal)?;'), next: NEXT_ENTRY },
  { name: 'Defined', doc: 'GN-6af: an instance of a value class, whose property takes the value of a reference.', type: "Object<'env>, &'static str", pattern: 'OutFill::Defined(instance, name)', put: 'value_define(instance, name, value, true)?;' },
  { name: 'Property', doc: 'GN-6ar: an instance of a class of another repository, whose writable property takes the value of a reference.', type: "Object<'env>, &'static str", pattern: 'OutFill::Property(object, name)', put: 'object.set_named_property(name, value).map_err(js_fail)?;' },
];

// GN-6as: the make function of Node.
const NODE_WALK: WalkShape = {
  generics: "<'env>", life: "<'env>", anon: "<'_>", env: { params: "env: &'env Env, ", args: 'env, ' }, value: "Unknown<'env>",
  result: (type) => `Result<${type}, Fail>`, internal: (detail) => `Err(binding_error(BindingError::Internal { detail: ${detail} }))`, language: 'JavaScript',
};
const NODE_MADE = { name: 'made', type: "&mut BTreeMap<u64, Unknown<'env>>" };

// The JavaScript value of a built-in form, made from the content of the matched OutValue.
function builtin(alias: ValueAlias, form: string, kind: string, { leaf, level }: Walk): string {
  switch (form) {
    case 'null':
      return leaf('null_out(env)');
    case 'bool':
      return leaf('bool_out(env, value)');
    case 'int':
      if (kind === 'number') return leaf('js_literal_number(env, &value)');
      return leaf(kind === 'int64' ? 'int_out(env, value)' : 'int_out(env, value.value())');
    case 'bigint':
      if (kind === 'number') return leaf('js_literal_bigint(env, &value)');
      return leaf(kind === 'int64' ? 'js_bigint(env, value)' : 'js_bigint(env, value.value())');
    case 'float':
      if (kind === 'number') return leaf('js_literal_number(env, &value)');
      if (kind === 'float') return leaf('float_out(env, value.value())');
      // An integer as the nearest double, by its decimal text: R-1 refuses an as conversion.
      return leaf(`js_literal_number(env, &${kind === 'int64' ? 'value' : 'value.value()'}.to_string())`);
    case 'text':
      return leaf(kind === 'bytes' ? 'js_utf8(env, value.value())' : 'text_out(env, value)');
    case 'bytes':
      return leaf(kind === 'text' ? 'js_bytes(env, value.as_bytes())' : 'js_bytes(env, value.value())');
    case 'list': {
      const parts = container(alias, kind, form);
      // U-7 (c): a list form takes the items of a list, or the values of the entries of a map or an object.
      const fill = kind === 'list' ? 'Items' : 'Values';
      return `{
            ${parts.head === '' ? '' : `${parts.head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(*made));
            }
            let array = env.create_array(js_index(len)?).map_err(internal)?;
            made.insert(handle.raw(), array.to_unknown());
            ${level({ walks: true, fill: `OutFill::${fill}(array)`, made: 'array.to_unknown()' })}
        }`;
    }
    case 'map':
    case 'keyed_map': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head === '' ? '' : `${parts.head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(*made));
            }
            let map = js_new_map(env).map_err(internal)?;
            made.insert(handle.raw(), map.to_unknown());
            ${level({ walks: true, fill: 'OutFill::Entries(map, None)', made: 'map.to_unknown()' })}
        }`;
    }
    case 'native':
      return leaf('native_object(env, &native)');
    default:
      throw new Unsupported(`${alias.unit.id}: the Node form ${form} of the kind ${kind} is not generated yet`);
  }
}

// GN-6x: the classes of other repositories that the generated code calls: each value class of another repository and
// the classes of its owner that its read members give, in this order, which the JavaScript entry hands over.
export function foreignClasses(model: Model): { alias: ValueAlias; unit: Unit }[] {
  return model.aliases.filter((a) => a.owner !== undefined).flatMap((alias) => [
    { alias, unit: alias.unit },
    ...classIn(alias, 'node').maps.map((map) => ({ alias, unit: map.unit })),
  ]);
}

const classIndex = (model: Model, unit: Unit): number => foreignClasses(model).findIndex((c) => c.unit === unit);

// GN-6ar: the position of a class of the owner that a row of a value alias of another repository names, after the
// classes of GN-6x in the list that the JavaScript entry hands over.
const rowIndex = (model: Model, library: string, unit: Unit): number =>
  foreignClasses(model).length + foreignRowClasses(model, 'node').findIndex((c) => c.library === library && c.unit.id === unit.id);

// GN-6ar: an instance of a class of the owner made from the content of an out row, through the constructor that the
// JavaScript entry handed over: the content of the kind; the Map of the entries, which the instance keeps (GN-6af) and
// which is filled after the instance is made; or a reference made on null, whose writable property takes the made
// value. An object and a reference are the same instance at every position of their handle (U-7 (d)).
function foreignMakeNode(model: Model, make: ForeignMake, kind: string, head: string, { put, level }: Walk): string {
  const index = rowIndex(model, make.library, make.unit);
  const constructed = (type: string, argument: string): string => `let class = foreign_class(env, ${index}).map_err(internal)?;
            let constructor: Function<'env, FnArgs<(${type},)>, Unknown<'env>> = unsafe { class.to_unknown().cast() }.map_err(internal)?;
            let instance = constructor.new_instance(FnArgs::from((${argument},))).map_err(js_fail)?;`;
  if (make.holds === 'content') {
    const content = ({ bool: ['bool', 'value'], float: ['f64', 'value.value()'] } as Record<string, [string, string] | undefined>)[kind];
    if (content === undefined) throw new Unsupported(`the node make ${make.unit.id}.constructor of the kind ${kind} of ${make.library} is not generated yet: a constructor of a class of another repository takes a bool or a float in Node (GN-6ar)`);
    return `{
            ${constructed(content[0], content[1])}
            ${put('instance')}
        }`;
  }
  if (make.holds === 'value') {
    return `{
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(*made));
            }
            ${constructed("Unknown<'env>", 'null_out(env)?')}
            made.insert(handle.raw(), instance);
            let object: Object<'env> = unsafe { instance.cast() }.map_err(internal)?;
            ${level({ walks: false, waiting: 'Some(*value)', fill: `OutFill::Property(object, ${rustString(langName('node', make.set?.name ?? [], 'callable'))})`, made: 'instance' })}
        }`;
  }
  return `{
            ${head === '' ? '' : `${head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(*made));
            }
            let map = js_new_map(env).map_err(internal)?;
            ${constructed("Unknown<'env>", 'map.to_unknown()')}
            made.insert(handle.raw(), instance);
            ${level({ walks: true, fill: 'OutFill::Entries(map, None)', made: 'instance' })}
        }`;
}

// GN-6x: the JavaScript call of a member of the owner on an object: a property read or a method call, with the
// arguments `args` of the types `types`.
function jsCall(member: Member, object: string, args: string, types: string): string {
  const name = rustString(langName('node', member.name, 'callable'));
  if (member.kind === 'property') return `${object}.get_named_property::<Unknown<'env>>(${name}).map_err(js_fail)?`;
  const fnType = args === '' ? "Function<'env, (), Unknown<'env>>" : `Function<'env, FnArgs<(${types},)>, Unknown<'env>>`;
  return `${object}.get_named_property::<${fnType}>(${name}).and_then(|function| function.apply(${object}, ${args === '' ? '()' : `FnArgs::from((${args},))`})).map_err(js_fail)?`;
}

// GN-6x: the Node conversions of a value class of another repository: an instance enters as HostValue::Value, which
// the owner's in function reads through the read members of its in row; a core value leaves as the instance that the
// owner's members of its out rows make.
function valueClassNode(model: Model, alias: ValueAlias, name: string, core: string, failure: string): string {
  const label = langName('node', alias.unit.name, 'class');
  const own = classIndex(model, alias.unit);
  // GN-6as: the list and the map class of the owner take their made children, and the member of the out row makes the
  // instance from them when the last child is made.
  const fills: Fill[] = [];
  const closes = new Map<string, string>();
  const arms = (walk: Walk): string => classMakes(alias, 'node').map((make) => {
    if (make.form === 'content') {
      if (make.kind === 'null') return `        OutValue::Null => ${walk.put(jsCall(make.member, 'class', '', ''))},`;
      if (make.kind === 'text16') {
        // B2.81: the UTF-16 code units of the text as an array of numbers, unpaired surrogates included.
        return `        OutValue::Text16(value) => {
            let value: Vec<u32> = value.into_iter().map(u32::from).collect();
            ${walk.put(jsCall(make.member, 'class', 'value', 'Vec<u32>'))}
        }`;
      }
      const [variant, type] = make.kind === 'bool' ? ['Bool', 'bool'] : make.kind === 'number' ? ['Number', 'String'] : ['Text', 'String'];
      return `        OutValue::${variant}(value) => ${walk.put(jsCall(make.member, 'class', 'value', type))},`;
    }
    if (make.form === 'list') {
      if (!fills.some((fill) => fill.name === 'Items')) fills.push({ name: 'Items', doc: 'The array of the made items of a list.', type: "Array<'env>", pattern: 'OutFill::Items(items)', put: PUT_INDEXED('items'), next: 'Some(source.item(level.handle, level.index))' });
      closes.set('Items', `let items = items.to_unknown();
Ok(${jsCall(make.member, 'class', 'items', "Unknown<'env>")})`);
      return `        OutValue::List { handle, len } => {
            let items = env.create_array(js_index(len)?).map_err(internal)?;
            ${walk.level({ walks: true, fill: 'OutFill::Items(items)' })}
        }`;
    }
    const insert = `map.get_named_property::<Function<'env, FnArgs<(Unknown<'env>, Unknown<'env>)>, Unknown<'env>>>(${rustString(langName('node', make.insert.name, 'callable'))})
            .and_then(|insert| insert.apply(*map, FnArgs::from((key, value))))
            .map_err(js_fail)?;`;
    if (!fills.some((fill) => fill.name === 'Entries')) fills.push({ name: 'Entries', doc: 'The instance of the map class of the owner, with the made key of the entry whose value is made next.', type: "Object<'env>, Option<Unknown<'env>>", pattern: 'OutFill::Entries(map, key)', put: PUT_ENTRY(insert), next: NEXT_ENTRY });
    closes.set('Entries', `let map = map.to_unknown();
Ok(${jsCall(make.member, 'class', 'map', "Unknown<'env>")})`);
    return `        OutValue::Map(value) => {
            let handle = value.handle();
            let len = value.len();
            let map_class = foreign_class(env, ${classIndex(model, make.map) < 0 ? 0 : classIndex(model, make.map)}).map_err(internal)?;
            let constructor: Function<'env, (), Unknown<'env>> = unsafe { map_class.to_unknown().cast() }.map_err(internal)?;
            let map: Object<'env> = unsafe { constructor.new_instance(()).map_err(js_fail)?.cast() }.map_err(internal)?;
            ${walk.level({ walks: true, fill: 'OutFill::Entries(map, None)' })}
        }`;
  }).join('\n');
  // The arms are written once here, so that the containers that they fill are known to the walk.
  const ownClass = `let class = foreign_class(env, ${own}).map_err(internal)?;`;
  const opened = /\bclass\b/.test(arms({ put: (value) => value, leaf: (made) => made, level: () => '' })) ? ownClass : '';
  return `
/// GN-6x: an instance of ${label} of ${alias.library ?? ''} enters as HostValue::Value, which the core of its owner judges.
fn in_${name}<'env>(env: &'env Env, value: Unknown<'env>, subject: &str) -> Result<${core}, Fail> {
    let class = foreign_class(env, ${own}).map_err(internal)?;
    if value.get_type().map_err(internal)? != ValueType::Object || !value.instanceof(class).map_err(js_fail)? {
        return Err(type_error(subject, ${rustString(label)}));
    }
    let mut host = JsHost::new(env);
    let described = host.describe(value).map_err(js_fail)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// GN-6x: a core value of ${label} leaves as the instance that the members of its owner make.
fn out_${name}<'env>(env: &'env Env, value: impl Borrow<${core}>) -> Result<Unknown<'env>, Fail> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    make_${name}(env, root, &mut source)
}
${walkRust(NODE_WALK, name, fills, arms, 'other => Err(binding_error(BindingError::Internal { detail: format!("GN-6x: no out row of the kind {}", other.kind().as_str()) })),', opened, undefined, { head: ownClass, of: (fill) => closes.get(fill.name) ?? '' })}`;
}

// GN-6x: the ReadAs of an in case: its code units for the kind text16 (B2.81), a text or the code units that its units
// member gives (B2.89), or the content.
function readAs(kase: ReadCase): string {
  if (kase.kind === 'Text16') return 'ReadAs::Units';
  if (kase.units === undefined) return 'ReadAs::Content';
  return `ReadAs::TextOr(${rustString(langName('node', kase.units.name, 'callable'))}, ${String(kase.units.kind !== 'property')})`;
}

// GN-6x: the registry of the classes of other repositories and the description of their instances by the in rows.
function valueClassesNodeHost(model: Model): string {
  return readAsVariants(valueClassesNodeHostAll(model));
}

function valueClassesNodeHostAll(model: Model): string {
  const rows = foreignReads(model, 'node');
  const classes = [...foreignClasses(model), ...foreignRowClasses(model, 'node')];
  const checks = model.aliases.filter((a) => a.owner !== undefined).flatMap((alias) => {
    const row = classIn(alias, 'node');
    const label = langName('node', alias.unit.name, 'class');
    const arms = row.cases.map((kase) => {
      const read = kase.read === undefined ? 'None' : `Some((${rustString(langName('node', kase.read.name, 'callable'))}, ${String(kase.read.kind !== 'property')}, ${readAs(kase)}))`;
      return `                ${rustString(kase.is)} => (ValueKind::${kase.kind}, ${read}),`;
    }).join('\n');
    const by = row.by.kind === 'property'
      ? `object.get_named_property::<String>(${rustString(langName('node', row.by.name, 'callable'))})?`
      : `object.get_named_property::<Function<'env, (), String>>(${rustString(langName('node', row.by.name, 'callable'))})?.apply(object, ())?`;
    return [`        if value.instanceof(foreign_class(self.env, ${classIndex(model, alias.unit)})?)? {
            let by: String = ${by};
            let (kind, read) = match by.as_str() {
${arms}
                other => return Err(napi::Error::from_reason(format!("GN-6x: ${label} gives the kind {other}, which its in row has no case for"))),
            };
            return Ok(Some(HostValue::Value { kind, handle: self.hold(Held::Foreign(object, read)) }));
        }`, ...row.maps.map((map) => `        if value.instanceof(foreign_class(self.env, ${classIndex(model, map.unit)})?)? {
            let pairs: Object<'env> = js_global_member_call(self.env, "Array", "from", value)?;
            let len = u64::from(pairs.get_array_length()?);
            return Ok(Some(HostValue::Map { handle: self.hold(Held::Pairs(pairs)), len }));
        }`)];
  });
  // GN-6ar: an instance of a class of the owner that an in row of a value alias of another repository names. A class
  // that holds a bool, an integer or a float is a value; any other instance has one handle within the walk.
  for (const row of rows) {
    const read = `(${rustString(langName('node', row.read.name, 'callable'))}, false, ReadAs::${row.as})`;
    const index = rowIndex(model, row.library, row.unit);
    checks.push(row.as === 'Content'
      ? `        if value.instanceof(foreign_class(self.env, ${index})?)? {
            let handle = self.foreign_identity(object, ${read})?;
            return Ok(Some(HostValue::Value { kind: ${row.variant}, handle }));
        }`
      : `        if value.instanceof(foreign_class(self.env, ${index})?)? {
            return Ok(Some(HostValue::Value { kind: ${row.variant}, handle: self.hold(Held::Foreign(object, Some(${read}))) }));
        }`);
  }
  const identity = rows.some((row) => row.as === 'Content') ? `
    /// GN-6ar: the handle of an instance of a class of another repository, the same for the same instance within the
    /// walk, which a Map of the walk finds.
    fn foreign_identity(&mut self, object: Object<'env>, read: (&'static str, bool, ReadAs)) -> napi::Result<Handle> {
        let seen = match self.foreign_seen {
            Some(seen) => seen,
            None => {
                let seen = js_new_map(self.env)?;
                self.foreign_seen = Some(seen);
                seen
            }
        };
        let get: Function<'env, FnArgs<(Unknown<'env>,)>, Unknown<'env>> = seen.get_named_property("get")?;
        let found = get.apply(seen, FnArgs::from((object.to_unknown(),)))?;
        if found.get_type()? == ValueType::Number {
            let position = unsafe { found.cast::<u32>() }?;
            return Ok(Handle::new(u64::from(position)));
        }
        let handle = self.hold(Held::Foreign(object, Some(read)));
        let position = u32::try_from(handle.raw()).map_err(|_wide| napi::Error::from_reason("B-1: too many values in one walk"))?;
        js_map_set(seen, object.to_unknown(), ToNapiValue::into_unknown(position, self.env)?)?;
        Ok(handle)
    }
` : '';
  return `
/// GN-6x: the classes of other repositories that the JavaScript entry hands over when the module loads, in the order
/// of the generator: each value class and the classes of its owner that its read members give.
static FOREIGN: OnceLock<Vec<FunctionRef<(), ()>>> = OnceLock::new();

/// GN-6x: the module keeps a reference to each class of another repository when it loads; a missing class fails the
/// load.
#[napi(js_name = "__register_foreign")]
pub fn register_foreign(classes: Vec<Function<'_, (), ()>>) -> napi::Result<()> {
    if classes.len() != ${classes.length} {
        return Err(napi::Error::from_reason(format!("GN-6x: ${classes.length} classes of other repositories, {} given", classes.len())));
    }
    let references = classes.iter().map(Function::create_ref).collect::<napi::Result<Vec<_>>>()?;
    FOREIGN.set(references).map_err(|_registered| napi::Error::from_reason("GN-6x: the classes of other repositories are registered once"))
}

/// GN-6x: the class of another repository at its position, as the object that holds its static members.
fn foreign_class(env: &Env, index: usize) -> napi::Result<Object<'_>> {
    let Some(class) = FOREIGN.get().and_then(|classes| classes.get(index)) else {
        return Err(napi::Error::from_reason("GN-6x: the classes of other repositories are not registered"));
    };
    let function = class.borrow_back(env)?;
    unsafe { function.to_unknown().cast() }
}

impl<'env> JsHost<'env> {
    /// GN-6x: an instance of a value class of another repository, described by the in row of the class, or an instance
    /// of a class of its owner that a read member gives, as a map of the pairs of its iteration.
    fn value_class(&mut self, value: Unknown<'env>, object: Object<'env>) -> napi::Result<Option<HostValue>> {
${checks.join('\n')}
        Ok(None)
    }
${identity}
    /// GN-6x: the content of an instance that describe held, which the read member of its in case gives.
    fn read_value(&mut self, value: Handle) -> napi::Result<HostValue> {
        let held = match self.held.get(handle_position(value.raw())) {
            Some(Held::Foreign(object, Some(read))) => Some((*object, *read)),
            _ => None,
        };
        let Some((object, (name, call, read_as))) = held else {
            return Err(napi::Error::from_reason("B-1: no such value"));
        };
        let content = js_member(object, name, call)?;
        match read_as {
            /*Units{*/
            // B2.81: the UTF-16 code units of a text of the kind text16, unpaired surrogates included.
            ReadAs::Units => Ok(HostValue::Text(HostText::Utf16(js_units(content, name)?))),
            /*}Units*/
            /*TextOr{*/
            ReadAs::TextOr(units, units_call) => match content.get_type()? {
                // B2.89: none names a text with an unpaired surrogate, whose UTF-16 code units the member units gives,
                // so only such a text crosses as a list of numbers; any other text crosses as its UTF-8 bytes.
                ValueType::Null | ValueType::Undefined => Ok(HostValue::Text(HostText::Utf16(js_units(js_member(object, units, units_call)?, units)?))),
                ValueType::String => {
                    let text: String = unsafe { content.cast() }?;
                    Ok(HostValue::Text(HostText::Bytes(text.into_bytes())))
                }
                _ => Err(napi::Error::from_reason(format!("GN-6x: {name} gives no text and no null"))),
            },
            /*}TextOr*/
            /*Content{*/
            ReadAs::Content => self.describe(content),
            /*}Content*/
            /*Bool{*/
            // GN-6ar: the bool that a property of a class of another repository gives.
            ReadAs::Bool => Ok(HostValue::Bool(unsafe { content.cast::<bool>() }?)),
            /*}Bool*/
            /*Int{*/
            // GN-6ar: the integer that a property of a class of another repository gives.
            ReadAs::Int => Ok(HostValue::Int(unsafe { content.cast::<i64>() }?)),
            /*}Int*/
            /*Float{*/
            // GN-6ar: the float that a property of a class of another repository gives.
            ReadAs::Float => Ok(HostValue::Float(unsafe { content.cast::<f64>() }?)),
            /*}Float*/
        }
    }
}

/// GN-6x: the value of a member of an instance, a property or the result of a method without arguments.
fn js_member<'env>(object: Object<'env>, name: &str, call: bool) -> napi::Result<Unknown<'env>> {
    if call {
        object.get_named_property::<Function<'env, (), Unknown<'env>>>(name)?.apply(object, ())
    } else {
        object.get_named_property(name)
    }
}

/// B2.81: the UTF-16 code units that a member gives as an array of numbers of 0 to 0xffff.
fn js_units(content: Unknown<'_>, name: &str) -> napi::Result<Vec<u16>> {
    let units: Vec<u32> = unsafe { content.cast() }?;
    units.into_iter().map(u16::try_from).collect::<Result<Vec<u16>, _>>()
        .map_err(|_overflow| napi::Error::from_reason(format!("GN-6x: {name} gives a unit above 0xffff")))
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
`;
}

// GN-6x: the lines of the JavaScript entry that hand the classes of other repositories to the addon.
export function foreignRegistration(model: Model): string {
  // GN-6ar: after the classes of GN-6x, the classes that the rows of the value aliases of other repositories name.
  const classes = [...foreignClasses(model).map((c) => ({ library: c.alias.library ?? '', owner: c.alias.owner, unit: c.unit })), ...foreignRowClasses(model, 'node')];
  if (classes.length === 0) return '';
  const libraries = [...new Set(classes.map((c) => c.library))];
  const requires = libraries.map((library) => `const foreign_${library.replaceAll('-', '_')} = require(${jsString((classes.find((c) => c.library === library)?.owner?.packages['node'] as { package: string } | undefined)?.package ?? library)});`).join('\n');
  return `
// GN-6x: the addon calls the classes of the value classes of other repositories; it keeps them from here on.
${requires}
addon.__register_foreign([${classes.map((c) => `foreign_${c.library.replaceAll('-', '_')}.${langName('node', c.unit.name, 'class')}`).join(', ')}]);
`;
}

export function aliasNode(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const label = langName('node', alias.unit.name, 'class');
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  if (alias.owner !== undefined) return valueClassNode(model, alias, name, core, failure);
  const arms = (walk: Walk): string => outArms(model, alias, 'node', (form, kind) => builtin(alias, form, kind, walk), 'Err(binding_error(BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', 'env, ', (kept, field, holds, head) => keptMakeNode(model, kept, field, holds, head, walk), 'out_', (make, kind, head) => foreignMakeNode(model, make, kind, head, walk), walk.leaf).join('\n');
  return `
/// U-7: a JavaScript value of ${label} enters as HostValue, which the core judges.
fn in_${name}<'env>(env: &'env Env, value: Unknown<'env>, _subject: &str) -> Result<${core}, Fail> {
    let mut host = JsHost::new(env);
    let described = host.describe(value).map_err(js_fail)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// U-7: a core value of ${label} leaves as the JavaScript values of its out rows.
fn out_${name}<'env>(env: &'env Env, value: impl Borrow<${core}>) -> Result<Unknown<'env>, Fail> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    let mut made = BTreeMap::new();
    make_${name}(env, root, &mut source, &mut made)
}
${walkRust(NODE_WALK, name, ALIAS_FILLS, arms, 'other => Err(binding_error(BindingError::Internal { detail: format!("U-7: no out row of the kind {}", other.kind().as_str()) })),', '', NODE_MADE)}`;
}

// B-1: what a JavaScript value is as a HostValue, one level at a time; the children of a container are asked for
// through HostValues by the handles that describe gave.
// usedHelpers splits helpers at blank lines, so a block keeps none inside it.
const NODE_HOST = (`
/// B-1: the JavaScript values whose children the core may ask for, under the handles that describe gave: an array, the
/// [key, value] pairs of a Map, and a plain object with its own enumerable string keys.
enum Held<'env> {
    Items(Object<'env>),
    Pairs(Object<'env>),
    Properties(Object<'env>, Object<'env>),/*HELD*/
}

struct JsHost<'env> {
    env: &'env Env,
    held: Vec<Held<'env>>,
    marked: u64,/*SEEN*/
}

impl<'env> JsHost<'env> {
    fn new(env: &'env Env) -> Self {
        Self { env, held: Vec::new(), marked: 0/*NEW*/ }
    }

    fn hold(&mut self, held: Held<'env>) -> Handle {
        self.held.push(held);
        Handle::new(handle_count(self.held.len() - 1))
    }

    /// GN-6u: the handle of a Date or of a value outside the closed set, its number in the order of the call.
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

    /// B-1: an array, a Date, a Map and a plain object (its prototype Object.prototype or null) are their kinds; a
    /// Uint8Array is bytes and another typed array is outside the set; any other object is its handle with the name of its constructor, which the core judges.
    fn describe_object(&mut self, value: Unknown<'env>) -> napi::Result<HostValue> {
        let object: Object<'env> = unsafe { value.cast() }?;/*DESCRIBE*/
        if value.is_array()? {
            let len = u64::from(object.get_array_length()?);
            return Ok(HostValue::List { handle: self.hold(Held::Items(object)), len });
        }
        if value.is_date()? {
            return Ok(HostValue::Date(self.mark()));
        }
        if value.is_typedarray()? {
            // B-1: a Uint8Array is the bytes that the out row bytes makes, so a value that the binding gave enters again;
            // a typed array of another element type, which napi does not take as a Uint8Array, is outside the set.
            if let Ok(bytes) = unsafe { value.cast::<Uint8Array>() } {
                return Ok(HostValue::Bytes(bytes.to_vec()));
            }
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
        let item: Unknown<'_> = array.get_element(index).map_err(js_raised)?;
        self.describe(item).map_err(js_raised)
    }

    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), binding_core::Raised> {
        let index = js_index(index).map_err(|fail| raised(Thrown::Binding(fail)))?;
        let (key, value) = match self.held.get(handle_position(map.raw())) {
            Some(Held::Pairs(pairs)) => {
                let pair: Object<'_> = pairs.get_element(index).map_err(js_raised)?;
                let key: Unknown<'_> = pair.get_element(0).map_err(js_raised)?;
                let value: Unknown<'_> = pair.get_element(1).map_err(js_raised)?;
                (key, value)
            }
            Some(Held::Properties(object, keys)) => {
                let key: Unknown<'_> = keys.get_element(index).map_err(js_raised)?;
                // A getter runs here; its exception goes back to the caller unchanged (U-3).
                let value: Unknown<'_> = object.get_property(key).map_err(js_raised)?;
                (key, value)
            }
            _ => return Err(raised_binding("B-1: no such map")),
        };
        let key = self.describe(key).map_err(js_raised)?;
        let value = self.describe(value).map_err(js_raised)?;
        Ok((key, value))
    }

    fn read(&mut self, /*READ*/) -> Result<HostValue, binding_core::Raised> {
        /*READS*/
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
    ToNapiValue::into_unknown(BigInt::from(value), env).map_err(internal)
}

/// U-7: the literal token of a number (F-1 (a)) as a bigint, without loss.
fn js_literal_bigint<'env>(env: &'env Env, literal: &str) -> Result<Unknown<'env>, Fail> {
    let text = text_out(env, literal)?;
    js_global_call(env, "BigInt", text).map_err(internal)
}

/// U-7: the literal token of a number as a JavaScript number, the nearest double.
fn js_literal_number<'env>(env: &'env Env, literal: &str) -> Result<Unknown<'env>, Fail> {
    match literal.parse::<f64>() {
        Ok(number) => float_out(env, number),
        Err(_token) => Err(binding_error(BindingError::Internal { detail: format!("U-7: {literal} is no number") })),
    }
}

/// U-7: bytes that are UTF-8 as a string.
fn js_utf8<'env>(env: &'env Env, bytes: &[u8]) -> Result<Unknown<'env>, Fail> {
    match std::str::from_utf8(bytes) {
        Ok(text) => text_out(env, text),
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

/// U-3: an exception of JavaScript code while the core walks a value, as the Raised that the caller throws again; an
/// error of napi with no exception pending is a failure of the binding.
fn js_raised(error: napi::Error) -> binding_core::Raised {
    if error.status == napi::Status::PendingException {
        raised(Thrown::Js(error))
    } else {
        raised(Thrown::Binding(internal(error)))
    }
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
    const arms = error.kinds.map((k) => `        ${variantPattern(k.variant)} => ${model.classes.findIndex((c) => c.category === k.category)},`).join('\n');
    return `
/// U-7 (a'): a kind of ${alias.library ?? ''} in the class of its category here.
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn error_of_${library}(error: ${error.path}) -> Fail {
    let class: usize = match ${errorMatched({ codeOf: error.code }, 'error')} {
${arms}
    };
    library_error(class, error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))
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

// B-1, GN-6af: the JsHost of a model. An instance of a class that an in row of a value alias names is HostValue::Value
// with the kind of the row, held for read: an instance of a class without core_type, whose prototype is the one that
// the entry registered, under one handle within the walk (a Map of the walk finds it); an instance of a class of the
// addon by its type tag. read gives the property that the row names. GN-6x: an instance of a value class of another
// repository is HostValue::Value too, held as Held::Foreign with the read member of its in case, which read calls.
export function nodeHost(model: Model): string {
  const reads = valueReads(model, 'node');
  const rows = foreignReads(model, 'node');
  const rowSeen = rows.some((row) => row.as === 'Content');
  const foreign = rows.length > 0 || model.aliases.some((a) => a.owner !== undefined);
  const foreignHeld = foreign ? "\n    Foreign(Object<'env>, Option<(&'static str, bool, ReadAs)>)," : '';
  const foreignDescribe = foreign ? '\n        if let Some(described) = self.value_class(value, object)? {\n            return Ok(described);\n        }' : '';
  const foreignRead = 'self.read_value(value).map_err(js_raised)';
  const foreignHost = foreign ? valueClassesNodeHost(model) : '';
  if (reads.length === 0) {
    return NODE_HOST.replace('/*HELD*/', foreignHeld).replace('/*SEEN*/', rowSeen ? "\n    foreign_seen: Option<Object<'env>>," : '').replace('/*NEW*/', rowSeen ? ', foreign_seen: None' : '').replace('/*DESCRIBE*/', foreignDescribe).replace('/*READ*/', foreign ? 'value: Handle' : '_value: Handle')
      .replace('/*READS*/', foreign ? foreignRead : 'Err(raised_binding("B-1: no value class is read"))') + foreignHost;
  }
  const kept = reads.some((r) => r.kept !== undefined);
  const describe = reads.map((r, index) => {
    if (r.object !== undefined) {
      const name = rustField(r.object.unit.unit.name);
      const struct = langName('node', r.object.unit.unit.name, 'class');
      return `
        // SAFETY: napi unwraps the native object of an instance of the class by its type tag and refuses any other value.
        if unsafe { <ClassInstance<'_, class_${name}::${struct}> as FromNapiValue>::from_napi_value(self.env.raw(), value.raw()) }.is_ok() {
            let handle = self.hold(Held::Value(object, ${index}));
            return Ok(HostValue::Value { kind: ${r.variant}, handle });
        }`;
    }
    const position = model.kept.findIndex((k) => k === r.kept?.unit);
    return `
        if value_prototype(self.env, ${position}, object)? {
            let handle = self.identity(object, ${index})?;
            return Ok(HostValue::Value { kind: ${r.variant}, handle });
        }`;
  }).join('');
  const read = reads.map((r, index) => {
    if (r.kept !== undefined) {
      return `
            ${index} => {
                let kept: Unknown<'_> = object.get_named_property(${rustString(langName('node', r.kept.field.name, 'variable'))}).map_err(js_raised)?;
                self.describe(kept).map_err(js_raised)
            }`;
    }
    const o = r.object;
    if (o === undefined) return '';
    const name = rustField(o.unit.unit.name);
    const struct = langName('node', o.unit.unit.name, 'class');
    return `
            ${index} => {
                // SAFETY: napi unwraps the native object of an instance of the class by its type tag and refuses any other value.
                let instance = unsafe { <ClassInstance<'_, class_${name}::${struct}> as FromNapiValue>::from_napi_value(self.env.raw(), object.raw()) }.map_err(js_raised)?;
                ${o.unit.lock === undefined ? `let value = ${o.property.corePath}(&instance.inner);` : `let held = instance.inner.read(${rustString(struct)}, &[]).map_err(|error| raised(Thrown::Binding(binding_error(error))))?;
                let value = ${o.property.corePath}(&held);`}
                Ok(${readValue(o.property.returns as string)})
            }`;
  }).join('');
  const identity = kept ? `

    /// GN-6af: the handle of an instance of a value class, the same for the same instance within the walk.
    fn identity(&mut self, object: Object<'env>, read: usize) -> napi::Result<Handle> {
        let seen = match self.seen {
            Some(seen) => seen,
            None => {
                let seen = js_new_map(self.env)?;
                self.seen = Some(seen);
                seen
            }
        };
        let found = js_map_get(seen, object.to_unknown())?;
        if found.get_type()? == ValueType::Number {
            let position = unsafe { found.cast::<u32>() }?;
            return Ok(Handle::new(u64::from(position)));
        }
        let handle = self.hold(Held::Value(object, read));
        let position = u32::try_from(handle.raw()).map_err(|_wide| napi::Error::from_reason("B-1: too many values in one walk"))?;
        js_map_set(seen, object.to_unknown(), ToNapiValue::into_unknown(position, self.env)?)?;
        Ok(handle)
    }` : '';
  return NODE_HOST
    .replace('/*HELD*/', `\n    Value(Object<'env>, usize),${foreignHeld}`)
    .replace('/*SEEN*/', `${kept ? "\n    seen: Option<Object<'env>>," : ''}${rowSeen ? "\n    foreign_seen: Option<Object<'env>>," : ''}`)
    .replace('/*NEW*/', `${kept ? ', seen: None' : ''}${rowSeen ? ', foreign_seen: None' : ''}`)
    .replace("        Handle::new(handle_count(self.held.len() - 1))\n    }\n", `        Handle::new(handle_count(self.held.len() - 1))\n    }${identity}\n`)
    .replace('/*DESCRIBE*/', `${foreignDescribe}${describe}`)
    .replace('/*READ*/', 'value: Handle')
    .replace('/*READS*/', `${foreign ? `if let Some(Held::Foreign(..)) = self.held.get(handle_position(value.raw())) {
            return ${foreignRead};
        }
        ` : ''}let Some(Held::Value(object, read)) = self.held.get(handle_position(value.raw())) else {
            return Err(raised_binding("B-1: no such value"));
        };
        let (object, read) = (*object, *read);
        match read {${read}
            _ => Err(raised_binding("B-1: no such value")),
        }`) + (kept ? KEPT_NODE : '') + foreignHost;
}

// GN-6af: the prototypes of the value classes without core_type, which the entry registers, and what makes and reads
// their instances.
const KEPT_NODE = `
thread_local! {
    /// GN-6af: the prototypes of the value classes, in the order of the contract, which the entry registers once.
    static VALUE_PROTOTYPES: RefCell<Vec<napi::UnknownRef<false>>> = const { RefCell::new(Vec::new()) };
}

/// GN-6af: the entry registers the prototype of each value class when it loads.
#[napi(js_name = "__registerValues")]
pub fn register_values(env: &Env, prototypes: Vec<Unknown<'_>>) -> napi::Result<()> {
    let references = prototypes.iter().map(|prototype| unsafe { <napi::UnknownRef<false> as FromNapiValue>::from_napi_value(env.raw(), prototype.raw()) }).collect::<napi::Result<Vec<_>>>()?;
    VALUE_PROTOTYPES.with_borrow_mut(|registered| *registered = references);
    Ok(())
}

/// GN-6af: the registered prototype of a value class.
fn value_class<'env>(env: &'env Env, position: usize) -> napi::Result<Unknown<'env>> {
    VALUE_PROTOTYPES.with_borrow(|registered| match registered.get(position) {
        Some(prototype) => prototype.get_value(env),
        None => Err(napi::Error::from_reason("GN-6af: the value classes are not registered")),
    })
}

/// GN-6af: whether the prototype of an object is the prototype of the value class.
fn value_prototype(env: &Env, position: usize, object: Object<'_>) -> napi::Result<bool> {
    let prototype = object.get_prototype()?;
    env.strict_equals(prototype, value_class(env, position)?)
}

/// GN-6af: a new instance of a value class, whose properties make defines.
fn value_instance(env: &Env, position: usize) -> Result<Object<'_>, Fail> {
    let prototype = value_class(env, position).map_err(internal)?;
    js_global_member_call(env, "Object", "create", prototype).map_err(internal)
}

/// GN-6af: a kept value as the own enumerable data property of an instance, writable when the property is.
fn value_define<'env>(object: &mut Object<'env>, name: &str, value: Unknown<'env>, writable: bool) -> Result<(), Fail> {
    let attributes = if writable { PropertyAttributes::Enumerable | PropertyAttributes::Writable } else { PropertyAttributes::Enumerable };
    let property = Property::new().with_utf8_name(name).map_err(internal)?.with_value(&value).with_property_attributes(attributes);
    object.define_properties(&[property]).map_err(internal)
}

fn js_map_get<'env>(map: Object<'env>, key: Unknown<'env>) -> napi::Result<Unknown<'env>> {
    let get: Function<'env, FnArgs<(Unknown<'env>,)>, Unknown<'env>> = map.get_named_property("get")?;
    get.apply(map, FnArgs::from((key,)))
}
`;

// GN-6af: an instance of a value class without core_type made from the content of an out row, before the content, as
// the object of its handle.
function keptMakeNode(model: Model, kept: KeptClass, field: KeptField, holds: 'entries' | 'value', head: string, { level }: Walk): string {
  const position = model.kept.indexOf(kept);
  const name = rustString(langName('node', field.name, 'variable'));
  if (holds === 'value') {
    if (!field.writable) throw new Unsupported(`${kept.unit.id}: a reference makes an instance of a value class whose property keeps the value it holds, which is writable (GN-6af)`);
    return `{
            if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(*made));
            }
            let mut instance = value_instance(env, ${position})?;
            value_define(&mut instance, ${name}, null_out(env)?, true)?;
            made.insert(handle.raw(), instance.to_unknown());
            ${level({ walks: false, waiting: 'Some(*value)', fill: `OutFill::Defined(instance, ${name})`, made: 'instance.to_unknown()' })}
        }`;
  }
  return `{
            ${head === '' ? '' : `${head}\n            `}if let Some(made) = made.get(&handle.raw()) {
                return Ok(OutStep::Put(*made));
            }
            let mut instance = value_instance(env, ${position})?;
            let map = js_new_map(env).map_err(internal)?;
            value_define(&mut instance, ${name}, map.to_unknown(), ${String(field.writable)})?;
            made.insert(handle.raw(), instance.to_unknown());
            ${level({ walks: true, fill: 'OutFill::Entries(map, None)', made: 'instance.to_unknown()' })}
        }`;
}

// GN-6af: the check of the arguments of the constructor of a value class without core_type, which the JavaScript class
// of the entry calls before it keeps them: each is described as a HostValue and judged by the core path.
export function keptCheckNode(kept: KeptClass): string {
  const js = langName('node', kept.unit.name, 'class');
  const variable = (f: KeptField): string => rustIdent(langName('node', f.name, 'variable'));
  const params = kept.fields.map((f) => `, ${variable(f)}: Unknown<'env>`).join('');
  const describe = (f: KeptField, value: string): string => {
    const subject = rustString(langName('node', f.name, 'variable'));
    const type = f.type;
    if (typeof type === 'object' && 'keyed_map' in type) {
      const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
      return `{
                let given = keyed_map_in(${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`a Map whose keys are ${type.key.map((k) => ({ int: 'safe integers', text: 'strings', bytes: 'Uint8Array' })[k] ?? k).join(' or ')}`)}, Ok)?;
                let mut described = binding_core::KeyedMap::new();
                for (key, item) in given {
                    described.insert(key, host.describe(item).map_err(js_fail)?);
                }
                Ok(described)
            }`;
    }
    if (typeof type === 'object' && 'list' in type) {
      return `{
                let given = list_in(${value}, ${subject}, Ok)?;
                let mut described = Vec::new();
                for item in given {
                    described.push(host.describe(item).map_err(js_fail)?);
                }
                Ok(described)
            }`;
    }
    return `host.describe(${value}).map_err(js_fail)`;
  };
  const lines = kept.fields.map((f) => {
    const v = variable(f);
    return f.default === undefined
      ? `        let ${v} = ${describe(f, v)}?;`
      : `        let ${v} = default_in(${v}, |value| ${describe(f, 'value')})?;`;
  });
  return `
/// GN-6af: judges the arguments of the constructor of ${js}, which the class of the entry keeps.
#[napi(js_name = ${rustString(`__check${js}`)})]
pub fn check_${rustField(kept.unit.name).replace(/^r#/, '')}<'env>(env: &'env Env${params}) -> napi::Result<()> {
    guard(|| {
        let mut host = JsHost::new(env);
${lines.join('\n')}
        ${kept.constructor.corePath}(&mut host, ${kept.fields.map(variable).join(', ')}).map_err(failure_error)
    })
    .map_err(|fail| throw(env, fail))
}
`;
}

// GN-6u, GN-6z: the Natives of Node, which a value alias and a function type hold: the owner table, the env that
// releases its references and the call of a function on the owner thread.
// usedHelpers splits helpers at blank lines, so a block keeps none inside it.
export const NODE_NATIVE = (`${ownedNatives('napi::UnknownRef<false>', 'release_references(references);', true)}
thread_local! {
    /// GN-6u: the env of the table of this thread, which releases its references.
    static NATIVE_ENV: std::cell::Cell<napi::sys::napi_env> = const { std::cell::Cell::new(std::ptr::null_mut()) };
}

/// GN-6u: releases references of the env of this thread. A reference that napi cannot delete stays with the env,
/// which frees it when it ends.
fn release_references(references: Vec<napi::UnknownRef<false>>) {
    let env = Env::from_raw(NATIVE_ENV.get());
    for reference in references {
        let _kept = reference.unref(&env);
    }
}

/// GN-6u: the threadsafe function of the owner of this thread, without a JavaScript function, which does not keep the
/// event loop alive.
fn owner_waker(env: &Env) -> napi::Result<Waker> {
    let text = "polyspec-release";
    let length = isize::try_from(text.len()).map_err(|error| napi::Error::from_reason(error.to_string()))?;
    let mut name = std::ptr::null_mut();
    // SAFETY: the env is the live env of this thread and the text is UTF-8 of the length given.
    let status = unsafe { napi::sys::napi_create_string_utf8(env.raw(), text.as_ptr().cast(), length, &raw mut name) };
    if status != napi::sys::Status::napi_ok {
        return Err(napi::Error::from_reason("GN-6u: the name of the threadsafe function"));
    }
    let mut waker = std::ptr::null_mut();
    // SAFETY: the env is the live env of this thread; the function has no JavaScript function, so napi calls
    // release_on_owner, and the queue has no limit and one thread, the owner.
    let status = unsafe {
        napi::sys::napi_create_threadsafe_function(
            env.raw(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            name,
            0,
            1,
            std::ptr::null_mut(),
            None,
            std::ptr::null_mut(),
            Some(release_on_owner),
            &raw mut waker,
        )
    };
    if status != napi::sys::Status::napi_ok {
        return Err(napi::Error::from_reason("GN-6u: the threadsafe function of the owner"));
    }
    // SAFETY: the function was made on this thread, in this env.
    let status = unsafe { napi::sys::napi_unref_threadsafe_function(env.raw(), waker) };
    if status != napi::sys::Status::napi_ok {
        return Err(napi::Error::from_reason("GN-6u: the unref of the threadsafe function"));
    }
    Ok(Waker(waker))
}

/// GN-6u: a JavaScript value that a core may keep, as a Native of the table of this thread; the cleanup hook of the
/// env is registered with the table.
fn js_native(env: &Env, value: Unknown<'_>) -> napi::Result<Native> {
    if OWNED.with_borrow(Option::is_none) {
        let Some((owner, generation)) = native_owner() else {
            return Err(napi::Error::from_reason("GN-6u: the table of the owners is poisoned"));
        };
        // The function is made before the cleanup hook is added, so the hook, which napi runs in the reverse order of
        // the hooks, aborts it before napi finalizes it.
        let waker = owner_waker(env)?;
        match OWNERS.lock() {
            Ok(mut owners) => match owners.get_mut(owner) {
                Some(found) => found.waker = waker,
                None => return Err(napi::Error::from_reason("GN-6u: the table of the owners has no owner of this thread")),
            },
            Err(_poisoned) => return Err(napi::Error::from_reason("GN-6u: the table of the owners is poisoned")),
        }
        env.add_env_cleanup_hook((), |()| clean_up_native())?;
        NATIVE_ENV.set(env.raw());
        OWNED.with_borrow_mut(|owned| *owned = Some(OwnerTable { owner, generation, next: 0, values: BTreeMap::new() }));
    }
    // SAFETY: the value is a live value of this env; from_napi_value creates a reference to it.
    let reference = unsafe { <napi::UnknownRef<false> as FromNapiValue>::from_napi_value(env.raw(), value.raw()) }?;
    keep_native(reference).ok_or_else(|| napi::Error::from_reason("GN-6u: this thread has no table"))
}

/// GN-6u: the JavaScript value that entered as the Native; one of an ended env, or of another thread, is kind internal.
fn native_object<'env>(env: &'env Env, native: &Native) -> Result<Unknown<'env>, Fail> {
    let found = native.downcast::<OwnedNative>().and_then(|native| {
        OWNED.with_borrow(|owned| match owned {
            Some(owned) if owned.owner == native.owner && owned.generation == native.generation => owned.values.get(&native.key).map(|reference| reference.get_value(env)),
            _ => None,
        })
    });
    match found {
        Some(value) => value.map_err(internal),
        None => Err(binding_error(BindingError::Internal { detail: String::from("GN-6u: the native value is gone") })),
    }
}

/// GN-6z: a value of a function type is a function (kind invalid_argument_type), held as a Native.
fn kept_function_in(env: &Env, value: Unknown<'_>, subject: &str) -> Result<Native, Fail> {
    if value.get_type().map_err(internal)? != ValueType::Function {
        return Err(binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from("a function") }));
    }
    js_native(env, value).map_err(internal)
}

/// GN-6z: the env of the owner of a Native for a call of its function: a call on another thread is kind wrong_thread,
/// and a call after the cleanup of the env is kind internal. The failure is a BindingError, which any thread may keep.
fn native_env(native: &Native, subject: &str) -> Result<Env, BindingError> {
    let Some(native) = native.downcast::<OwnedNative>() else {
        return Err(BindingError::Internal { detail: String::from("GN-6u: a native value that no JavaScript value entered as") });
    };
    if OWNER.get() != Some(native.owner) {
        return Err(BindingError::WrongThread { subject: subject.to_owned() });
    }
    if !OWNED.with_borrow(|owned| owned.as_ref().is_some_and(|owned| owned.generation == native.generation)) {
        return Err(BindingError::Internal { detail: String::from("GN-6u: the env of the function has ended") });
    }
    Ok(Env::from_raw(NATIVE_ENV.get()))
}
`).replace(/\n\n(?=[ }])/g, '\n');
