// U-7: the PHP conversions of a value alias. A PHP value enters as a HostValue that the binding gives one level at a
// time (B-1) and the core's `in` function judges; a core value leaves as the OutValue that the core's `out` function
// gives, which the binding makes into PHP values by the alias's `out` rows (U-7 (d)). A PHP array is a value, not an
// object, so a handle that comes again is made again; a handle inside its own making is a cycle that only a reference
// can hold, which the out rows give as the kind reference.

import { type Model, type ValueAlias, langName, rustField, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported, errorMatched } from './model.ts';
import { container, outArms, ownedNatives, readAsVariants } from './alias_shared.ts';
import { type CaseTest, caseKey, phpFormless } from './samples.ts';
import { rustString } from './text.ts';
import { classIn, classMakes, type ReadCase } from './value_class.ts';
import { type Member, type Unit, variantPattern } from '../contract.ts';

// The PHP value of a built-in form, made from the content of the matched OutValue.
function builtin(alias: ValueAlias, form: string, kind: string): string {
  switch (form) {
    case 'null':
      return 'Ok(Zval::new())';
    case 'bool':
      return 'out_bool(value)';
    case 'int':
      if (kind === 'number') return 'php_literal_int(&value)';
      return kind === 'int64' ? 'out_int(value)' : 'out_int(value.value())';
    case 'float':
      if (kind === 'number') return 'php_literal_float(&value)';
      if (kind === 'float') return 'out_float(value.value())';
      // An integer as the nearest double, by its decimal text: R-1 refuses an as conversion.
      return `php_literal_float(&${kind === 'int64' ? 'value' : 'value.value()'}.to_string())`;
    case 'text':
      return kind === 'bytes' ? 'php_utf8(value.value())' : 'out_text(value)';
    case 'bytes':
      return kind === 'text' ? 'out_bytes(value.as_bytes())' : 'out_bytes(value.value())';
    case 'list': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head}
            let mut array = ZendHashTable::new();
            php_enter(making, handle)?;
            for index in 0..len {
                let item = ${parts.item};
                array.push(make(item, source, making)?).map_err(php_failed)?;
            }
            making.entered.remove(&handle.raw());
            let mut zval = Zval::new();
            zval.set_hashtable(array);
            Ok(zval)
        }`;
    }
    case 'map':
    case 'keyed_map': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head}
            let mut array = ZendHashTable::new();
            php_enter(making, handle)?;
            for index in 0..len {
                let (key, item) = ${parts.entry};
                let item = make(item, source, making)?;
                php_insert(&mut array, key, item)?;
            }
            making.entered.remove(&handle.raw());
            let mut zval = Zval::new();
            zval.set_hashtable(array);
            Ok(zval)
        }`;
    }
    case 'php_object': {
      const parts = container(alias, kind, 'map');
      return `{
            ${parts.head}
            if let Some(object) = making.objects.get(&handle.raw()) {
                return Ok(php_shared_object(*object));
            }
            let mut zval = ZendObject::new_stdclass().into_zval(false).map_err(php_failed)?;
            let object = php_object_of(&mut zval)?;
            making.objects.insert(handle.raw(), object);
            for index in 0..len {
                let (key, item) = ${parts.entry};
                let item = make(item, source, making)?;
                php_property(object, key, item)?;
            }
            Ok(zval)
        }`;
    }
    case 'php_reference':
      return `{
            if let Some(reference) = making.references.get(&handle.raw()) {
                return Ok(php_shared_reference(*reference));
            }
            let (zval, reference) = php_new_reference()?;
            making.references.insert(handle.raw(), reference);
            let content = make(*value, source, making)?;
            php_set_reference(reference, content);
            Ok(zval)
        }`;
    case 'native':
      return 'native_object(&native)';
    default:
      throw new Unsupported(`${alias.unit.id}: the PHP form ${form} of the kind ${kind} is not generated yet`);
  }
}

// U-7: what a make has made so far under the handles of the out value. A PHP array is a value, so one inside its own
// making is a cycle; an object and a reference have an identity, so a handle that comes again is the same object or
// reference, a cycle included. A field is generated only when an out row makes that form.
export function phpMaking(model: Model): string {
  // A value class of another repository is made by the members of its owner, without the making of an alias.
  const own = model.aliases.filter((a) => a.owner === undefined);
  if (own.length === 0) return '';
  const makes = own.flatMap((a) => (a.unit.out ?? []).map((row) => row.make?.php));
  const forms = new Set(makes.map((form) => (typeof form === 'object' && 'keyed_map' in form ? 'keyed_map' : form)).filter((form) => typeof form === 'string'));
  const fields = [
    ['list', 'map', 'keyed_map'].some((form) => forms.has(form)) ? '    entered: BTreeSet<u64>,' : '',
    forms.has('php_object') ? '    objects: std::collections::BTreeMap<u64, *mut ZendObject>,' : '',
    forms.has('php_reference') ? '    references: std::collections::BTreeMap<u64, *mut ext_php_rs::ffi::zend_reference>,' : '',
  ].filter((field) => field !== '');
  return `
/// U-7: the arrays that a make has entered, and the objects and references that it has made, under their handles.
#[derive(Default)]
struct PhpMaking {
${fields.join('\n')}
}
`;
}

// GN-6x: the PHP name of a class of the owner of a value class of another repository.
function ownerName(alias: ValueAlias, unit: Unit): string {
  const namespace = (alias.owner?.packages['php'] as { namespace: string } | undefined)?.namespace ?? '';
  const module = unit.module === '' ? '' : `\\${unit.module.split('/').map((part) => langName('php', [part], 'class')).join('\\')}`;
  return `${namespace}${module}\\${langName('php', unit.name, 'class')}`;
}

// GN-6x: the PHP conversions of a value class of another repository: an instance enters as HostValue::Value, which the
// owner's in function reads through the read members of its in row; a core value leaves as the instance that the
// owner's members of its out rows make.
function valueClassPhp(alias: ValueAlias, name: string, core: string, failure: string): string {
  const label = langName('php', alias.unit.name, 'class');
  const own = ownerName(alias, alias.unit);
  const call = (member: Member, args: string): string =>
    `php_static(${rustString(`${own}::${langName('php', member.name, 'callable')}`)}, vec![${args}]).map_err(php_thrown)`;
  const arms = classMakes(alias, 'php').map((make) => {
    if (make.form === 'content') {
      if (make.kind === 'null') return `        OutValue::Null => ${call(make.member, '')},`;
      if (make.kind === 'text16') {
        // B2.81: the UTF-16 code units of the text as an array of integers, unpaired surrogates included, which a PHP
        // string cannot hold.
        return `        OutValue::Text16(value) => {
            let value: Vec<i64> = value.into_iter().map(i64::from).collect();
            ${call(make.member, '&value')}
        }`;
      }
      const variant = make.kind === 'bool' ? 'Bool' : make.kind === 'number' ? 'Number' : 'Text';
      return `        OutValue::${variant}(value) => ${call(make.member, '&value')},`;
    }
    if (make.form === 'list') {
      return `        OutValue::List { handle, len } => {
            let mut items = ZendHashTable::new();
            for index in 0..len {
                let item = source.item(handle, index);
                items.push(make(item, source)?).map_err(php_failed)?;
            }
            let items = items.into_zval(false).map_err(php_failed)?;
            ${call(make.member, '&items')}
        }`;
    }
    return `        OutValue::Map(value) => {
            let handle = value.handle();
            let len = value.len();
            let map = php_new(${rustString(ownerName(alias, make.map))}).map_err(php_thrown)?;
            for index in 0..len {
                let (key, item) = source.entry(handle, index);
                let key = make(key, source)?;
                let item = make(item, source)?;
                php_method(&map, ${rustString(langName('php', make.insert.name, 'callable'))}, vec![&key, &item]).map_err(php_thrown)?;
            }
            ${call(make.member, '&map')}
        }`;
  });
  return `
/// GN-6x: an instance of ${label} of ${alias.library ?? ''} enters as HostValue::Value, which the core of its owner judges.
fn in_${name}(value: &Zval, subject: &str) -> Result<${core}, Fail> {
    let instance = match (value.object(), ClassEntry::try_find(${rustString(own)})) {
        (Some(object), Some(class)) => object.instance_of(class),
        _ => false,
    };
    if !instance {
        return Err(binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(own)}) }));
    }
    let mut host = PhpHost { held: Vec::new(), marked: 0, owned: Vec::new(), values: Vec::new() };
    let described = host.describe(value)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// GN-6x: a core value of ${label} leaves as the instance that the members of its owner make.
fn out_${name}(value: impl Borrow<${core}>) -> Result<Zval, Fail> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    make_${name}(root, &mut source)
}

fn make_${name}(out: OutValue, source: &mut dyn OutValues) -> Result<Zval, Fail> {
    let make = make_${name};
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
  return `ReadAs::TextOr(${rustString(langName('php', kase.units.name, 'callable'))})`;
}

// GN-6x: the description of an instance of each value class of another repository by its in row, and of the values
// that its read members give, which the host owns because the calls made them.
function valueClassesPhpHost(model: Model): string {
  return readAsVariants(valueClassesPhpHostAll(model));
}

function valueClassesPhpHostAll(model: Model): string {
  const checks = model.aliases.filter((a) => a.owner !== undefined).flatMap((alias) => {
    const row = classIn(alias, 'php');
    const own = ownerName(alias, alias.unit);
    const arms = row.cases.map((kase) => {
      const read = kase.read === undefined ? 'None' : `Some((${rustString(langName('php', kase.read.name, 'callable'))}, ${readAs(kase)}))`;
      return `            ${rustString(kase.is)} => (ValueKind::${kase.kind}, ${read}),`;
    }).join('\n');
    return [`    if php_instance(value, ${rustString(own)}) {
        // I-3: a property of the owner is a method in PHP; a backed enum case gives its value.
        let by = php_method(value, ${rustString(langName('php', row.by.name, 'callable'))}, vec![]).map_err(php_thrown)?;
        let by: String = match by.object() {
            Some(case) => case.get_property::<String>("value").map_err(php_failed)?,
            None => match by.string() {
                Some(text) => text,
                None => return Err(binding_error(BindingError::Internal { detail: String::from(${rustString(`GN-6x: the kind of ${own} is no enum case`)}) })),
            },
        };
        let (kind, read) = match by.as_str() {
${arms}
            other => return Err(binding_error(BindingError::Internal { detail: format!(${rustString(`GN-6x: ${own} gives the kind {other}, which its in row has no case for`)}) })),
        };
        values.push((value.shallow_clone(), read));
        return Ok(Some(HostValue::Value { kind, handle: Handle::new(VALUE | handle_count(values.len() - 1)) }));
    }`, ...row.maps.map((map) => `    if php_instance(value, ${rustString(ownerName(alias, map.unit))}) {
        let iterator = php_method(value, "getIterator", vec![]).map_err(php_thrown)?;
        let mut entries = Vec::new();
        while php_method(&iterator, "valid", vec![]).map_err(php_thrown)?.is_true() {
            let key = php_method(&iterator, "key", vec![]).map_err(php_thrown)?;
            let item = php_method(&iterator, "current", vec![]).map_err(php_thrown)?;
            entries.push((key, item));
            php_method(&iterator, "next", vec![]).map_err(php_thrown)?;
        }
        let len = handle_count(entries.len());
        owned.push(entries);
        return Ok(Some(HostValue::Map { handle: Handle::new(HOST_OWNED | handle_count(owned.len() - 1)), len }));
    }`)];
  });
  return `
/// GN-6x: the bits of a handle of a value that the host owns: an instance of a value class of another repository, or
/// the entries of a value that a read member gave; any other handle is of a value that the caller lent.
const VALUE: u64 = 1 << 62;
const HOST_OWNED: u64 = 1 << 61;

/// GN-6x: whether a value is an instance of the class of that name of another repository's extension.
fn php_instance(value: &Zval, class: &str) -> bool {
    match (value.object(), ClassEntry::try_find(class)) {
        (Some(object), Some(class)) => object.instance_of(class),
        _ => false,
    }
}

/// GN-6x: a method of an object of another repository; its exception is the exception of the call.
fn php_method(object: &Zval, name: &str, args: Vec<&dyn ext_php_rs::convert::IntoZvalDyn>) -> Result<Zval, Thrown> {
    let Some(target) = object.object() else {
        return Err(Thrown::Binding(binding_error(BindingError::Internal { detail: String::from("GN-6x: no object") })));
    };
    let returned = target.try_call_method(name, args).map_err(|error| Thrown::Binding(php_failed(error)))?;
    if let Some(exception) = ExecutorGlobals::take_exception() {
        return Err(Thrown::Php(exception));
    }
    Ok(returned)
}

/// GN-6x: a static member of a class of another repository, named Class::member.
fn php_static(name: &str, args: Vec<&dyn ext_php_rs::convert::IntoZvalDyn>) -> Result<Zval, Thrown> {
    let callable = ext_php_rs::types::ZendCallable::try_from_name(name).map_err(|error| Thrown::Binding(php_failed(error)))?;
    let returned = callable.try_call(args).map_err(|error| Thrown::Binding(php_failed(error)))?;
    if let Some(exception) = ExecutorGlobals::take_exception() {
        return Err(Thrown::Php(exception));
    }
    Ok(returned)
}

/// GN-6x: a new instance of a class of another repository by its constructor without arguments.
fn php_new(name: &str) -> Result<Zval, Thrown> {
    let Some(class) = ClassEntry::try_find(name) else {
        return Err(Thrown::Binding(binding_error(BindingError::Internal { detail: format!("T-3: the class {name} is not loaded") })));
    };
    let object = ZendObject::new(class).into_zval(false).map_err(|error| Thrown::Binding(php_failed(error)))?;
    php_method(&object, "__construct", vec![])?;
    Ok(object)
}

/// GN-6x: the failure of a call into another repository: its PHP exception unchanged, or the binding's.
fn php_thrown(error: Thrown) -> Fail {
    match error {
        Thrown::Php(exception) => match exception.into_zval(false) {
            Ok(object) => PhpException::from_message(String::new()).with_object(object),
            Err(error) => php_failed(error),
        },
        Thrown::Binding(fail) => fail,
    }
}

/// GN-6x: an instance of a value class of another repository, described by the in row of the class, or an instance of
/// a class of its owner that a read member gives, as a map of the pairs of its iterator.
fn php_value_class(value: &Zval, values: &mut Vec<(Zval, Option<(&'static str, ReadAs)>)>, owned: &mut Vec<Vec<(Zval, Zval)>>) -> Result<Option<HostValue>, Fail> {
${checks.join('\n')}
    Ok(None)
}

impl PhpHost<'_> {
    /// GN-6x: a value that the host owns, which a read member gave: an array as its entries, an instance as describe
    /// gives it, and a scalar or a string as its kind.
    fn describe_owned(&mut self, value: Zval) -> Result<HostValue, Fail> {
        if let Some(described) = php_value_class(&value, &mut self.values, &mut self.owned)? {
            return Ok(described);
        }
        if let Some(array) = value.array() {
            let is_list = array.has_sequential_keys();
            let mut entries = Vec::new();
            let mut iterator = array.iter();
            while let Some((key, item)) = iterator.next_zval() {
                entries.push((key, item.shallow_clone()));
            }
            let len = handle_count(entries.len());
            self.owned.push(entries);
            return Ok(HostValue::PhpArray { handle: Handle::new(HOST_OWNED | handle_count(self.owned.len() - 1)), len, is_list });
        }
        if value.object().is_some() || value.array().is_some() {
            return Err(binding_error(BindingError::Internal { detail: String::from("GN-6x: a read member gave an object that no in row describes") }));
        }
        let mut scalar = PhpHost { held: Vec::new(), marked: 0, owned: Vec::new(), values: Vec::new() };
        scalar.describe(&value)
    }

    /// GN-6x: the item or the entry of a value that the host owns, its key described as an owned value.
    fn owned_entry(&mut self, handle: Handle, index: u64) -> Result<Option<(HostValue, HostValue)>, binding_core::Raised> {
        if handle.raw() & HOST_OWNED == 0 {
            return Ok(None);
        }
        let entry = self.owned.get(handle_position(handle.raw() & !HOST_OWNED)).and_then(|entries| entries.get(handle_position(index)));
        let Some((key, item)) = entry.map(|(key, item)| (key.shallow_clone(), item.shallow_clone())) else {
            return Err(raised(Thrown::Binding(binding_error(BindingError::Internal { detail: String::from("B-1: no such entry") }))));
        };
        let key = self.describe_owned(key).map_err(|fail| raised(Thrown::Binding(fail)))?;
        let item = self.describe_owned(item).map_err(|fail| raised(Thrown::Binding(fail)))?;
        Ok(Some((key, item)))
    }

    /// GN-6x: the content of an instance that describe held, which the read member of its in case gives.
    fn read_value(&mut self, value: Handle) -> Result<HostValue, Fail> {
        let held = match self.values.get(handle_position(value.raw() & !VALUE)) {
            Some((object, Some(read))) => Some((object.shallow_clone(), *read)),
            _ => None,
        };
        let Some((object, (read, read_as))) = held else {
            return Err(binding_error(BindingError::Internal { detail: String::from("B-1: no such value") }));
        };
        let content = php_method(&object, read, vec![]).map_err(php_thrown)?;
        match read_as {
            /*Units{*/
            // B2.81: the UTF-16 code units of a text of the kind text16, unpaired surrogates included.
            ReadAs::Units => Ok(HostValue::Text(HostText::Utf16(php_units(&content, read)?))),
            /*}Units*/
            /*TextOr{*/
            ReadAs::TextOr(units) => {
                // B2.89: null names a text with an unpaired surrogate, whose UTF-16 code units the member units gives,
                // so only such a text crosses as an array of integers; any other text is its string, UTF-8 bytes.
                if content.is_null() {
                    let content = php_method(&object, units, vec![]).map_err(php_thrown)?;
                    return Ok(HostValue::Text(HostText::Utf16(php_units(&content, units)?)));
                }
                self.describe_owned(content)
            }
            /*}TextOr*/
            /*Content{*/
            ReadAs::Content => self.describe_owned(content),
            /*}Content*/
        }
    }
}

/// B2.81: the UTF-16 code units that a member gives as an array of integers of 0 to 0xffff.
fn php_units(content: &Zval, read: &str) -> Result<Vec<u16>, Fail> {
    let Some(array) = content.array() else {
        return Err(binding_error(BindingError::Internal { detail: format!("GN-6x: {read} gives no array of units") }));
    };
    array.values().map(|unit| unit.long().and_then(|unit| u16::try_from(unit).ok()))
        .collect::<Option<Vec<u16>>>()
        .ok_or_else(|| binding_error(BindingError::Internal { detail: format!("GN-6x: {read} gives a unit that is no integer of 0 to 0xffff") }))
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
    TextOr(&'static str),
    /*}TextOr*/
}
`;
}

// B-1: the host of the PHP values, with the description of the value classes of other repositories (GN-6x).
export function phpHost(model: Model): string {
  if (!model.aliases.some((a) => a.owner !== undefined)) return PHP_HOST;
  const host = PHP_HOST
    .replace("    held: Vec<Vec<(HostValue, &'a Zval)>>,\n    marked: u64,\n}", "    held: Vec<Vec<(HostValue, &'a Zval)>>,\n    marked: u64,\n    owned: Vec<Vec<(Zval, Zval)>>,\n    values: Vec<(Zval, Option<(&'static str, ReadAs)>)>,\n}")
    .replace("        if let Some(object) = value.object() {\n            let type_name", "        if let Some(described) = php_value_class(value, &mut self.values, &mut self.owned)? {\n            return Ok(described);\n        }\n        if let Some(object) = value.object() {\n            let type_name")
    .replace("    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, binding_core::Raised> {\n", "    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, binding_core::Raised> {\n        if let Some((_key, item)) = self.owned_entry(list, index)? {\n            return Ok(item);\n        }\n")
    .replace("    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), binding_core::Raised> {\n", "    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), binding_core::Raised> {\n        if let Some(entry) = self.owned_entry(map, index)? {\n            return Ok(entry);\n        }\n")
    .replace(/    fn read\(&mut self, _value: Handle\)[^]*?\n    \}\n/, `    fn read(&mut self, value: Handle) -> Result<HostValue, binding_core::Raised> {
        self.read_value(value).map_err(|fail| raised(Thrown::Binding(fail)))
    }
`);
  return host + valueClassesPhpHost(model);
}

export function aliasPhp(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const label = langName('php', alias.unit.name, 'class');
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  if (alias.owner !== undefined) return valueClassPhp(alias, name, core, failure);
  const arms = outArms(model, alias, 'php', (form, kind) => builtin(alias, form, kind), 'Err(binding_error(BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', '');
  return `
/// U-7: a PHP value of ${label} enters as HostValue, which the core judges.
fn in_${name}(value: &Zval, _subject: &str) -> Result<${core}, Fail> {
    let mut host = PhpHost { held: Vec::new(), marked: 0${model.aliases.some((a) => a.owner !== undefined) ? ', owned: Vec::new(), values: Vec::new()' : ''} };
    let described = host.describe(value)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// U-7: a core value of ${label} leaves as the PHP values of its out rows.
fn out_${name}(value: impl Borrow<${core}>) -> Result<Zval, Fail> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    let mut making = PhpMaking::default();
    make_${name}(root, &mut source, &mut making)
}

fn make_${name}(out: OutValue, source: &mut dyn OutValues, making: &mut PhpMaking) -> Result<Zval, Fail> {
    let make = make_${name};
    match out.clone() {
${arms.join('\n')}
        other => Err(binding_error(BindingError::Internal { detail: format!("U-7: no out row of the kind {}", other.kind().as_str()) })),
    }
}
`;
}

// B-1: what a PHP value is as a HostValue, one level at a time; the children of an array or a stdClass are asked for
// through HostValues by the handles that describe gave.
// usedHelpers splits helpers at blank lines, so a block keeps none inside it.
export const PHP_HOST = (`
/// B-1: the entries of an array or of the properties of a stdClass whose children the core may ask for, under the
/// handles that describe gave, each key already described.
struct PhpHost<'a> {
    held: Vec<Vec<(HostValue, &'a Zval)>>,
    marked: u64,
}

impl<'a> PhpHost<'a> {
    fn hold(&mut self, table: &'a ZendHashTable) -> Handle {
        let mut entries = Vec::new();
        let mut iterator = table.iter();
        while let Some((key, value)) = iterator.next_zval() {
            let key = match (key.long(), key.zend_str()) {
                (Some(integer), _) => HostValue::Int(integer),
                (None, Some(text)) => HostValue::Text(HostText::Bytes(text.as_bytes().to_vec())),
                (None, None) => HostValue::Null,
            };
            entries.push((key, value));
        }
        self.held.push(entries);
        Handle::new(handle_count(self.held.len() - 1))
    }

    /// GN-6u: the handle of a value outside the closed set, its number in the order of the call.
    fn mark(&mut self) -> Handle {
        self.marked = self.marked.saturating_add(1);
        Handle::new(self.marked)
    }

    /// B-1: an element that is a reference is the reference with its identity, so that elements that share one share
    /// it (U-7 (g)); a scalar, a string (its bytes) and an array (with array_is_list) are their kinds; a stdClass is its
    /// properties; a Closure is a callable; any other object is its handle with its class name.
    fn describe(&mut self, value: &'a Zval) -> Result<HostValue, Fail> {
        let value = match value.indirect() {
            Some(target) => target,
            None => value,
        };
        if let Some(target) = value.reference() {
            let identity = Handle::new(handle_count(std::ptr::from_ref(target).addr()));
            let target = self.describe(target)?;
            return Ok(HostValue::PhpReference { identity, target: Box::new(target) });
        }
        if value.is_null() {
            return Ok(HostValue::Null);
        }
        if value.is_bool() {
            return Ok(HostValue::Bool(value.is_true()));
        }
        if let (true, Some(integer)) = (value.is_long(), value.long()) {
            return Ok(HostValue::Int(integer));
        }
        if let (true, Some(float)) = (value.is_double(), value.double()) {
            return Ok(HostValue::Float(float));
        }
        if let Some(text) = value.zend_str() {
            return Ok(HostValue::Text(HostText::Bytes(text.as_bytes().to_vec())));
        }
        if let Some(array) = value.array() {
            let is_list = array.has_sequential_keys();
            let len = handle_count(array.len());
            return Ok(HostValue::PhpArray { handle: self.hold(array), len, is_list });
        }
        if let Some(object) = value.object() {
            let type_name = object.get_class_name().map_err(php_failed)?;
            if type_name == "stdClass" {
                let properties = object.get_properties().map_err(php_failed)?;
                let len = handle_count(properties.len());
                return Ok(HostValue::StdClass { handle: self.hold(properties), len });
            }
            if type_name == "Closure" {
                return Ok(HostValue::Callable(php_native(value)?));
            }
            let json_serializable = match ClassEntry::try_find("JsonSerializable") {
                Some(class) => object.instance_of(class),
                None => false,
            };
            return Ok(HostValue::Object { native: php_native(value)?, type_name, json_serializable });
        }
        Ok(HostValue::Other { type_name: String::from("resource"), handle: self.mark() })
    }

    fn held_entry(&self, handle: Handle, index: u64) -> Result<(HostValue, &'a Zval), binding_core::Raised> {
        match self.held.get(handle_position(handle.raw())).and_then(|entries| entries.get(handle_position(index))) {
            Some((key, value)) => Ok((key.clone(), *value)),
            None => Err(raised(Thrown::Binding(binding_error(BindingError::Internal { detail: String::from("B-1: no such entry") })))),
        }
    }
}

impl HostValues for PhpHost<'_> {
    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, binding_core::Raised> {
        let (_key, value) = self.held_entry(list, index)?;
        self.describe(value).map_err(|fail| raised(Thrown::Binding(fail)))
    }

    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), binding_core::Raised> {
        let (key, value) = self.held_entry(map, index)?;
        let value = self.describe(value).map_err(|fail| raised(Thrown::Binding(fail)))?;
        Ok((key, value))
    }

    fn read(&mut self, _value: Handle) -> Result<HostValue, binding_core::Raised> {
        Err(raised(Thrown::Binding(binding_error(BindingError::Internal { detail: String::from("B-1: no value class is read") }))))
    }
}

/// U-7: a container that the make has entered; one inside its own making is a cycle, which a PHP array cannot hold.
fn php_enter(making: &mut PhpMaking, handle: Handle) -> Result<(), Fail> {
    if making.entered.insert(handle.raw()) {
        return Ok(());
    }
    Err(binding_error(BindingError::Internal { detail: String::from("U-7: a cycle that a PHP array cannot hold") }))
}

/// U-7 (c): an entry of an array under its key: an integer key, or a text or bytes key as a string key.
fn php_insert(array: &mut ZendHashTable, key: OutValue, item: Zval) -> Result<(), Fail> {
    match key {
        OutValue::Int(integer) => array.insert(integer.value(), item).map_err(php_failed),
        OutValue::Int64(integer) => array.insert(integer, item).map_err(php_failed),
        OutValue::Text(text) => array.insert(text.as_str(), item).map_err(php_failed),
        OutValue::Bytes(bytes) => {
            let name = ZendStr::new(bytes.value(), false);
            array.insert(ext_php_rs::types::ArrayKey::ZendString(&name), item).map_err(php_failed)
        }
        other => Err(binding_error(BindingError::Internal { detail: format!("U-7: an array key of the kind {}", other.kind().as_str()) })),
    }
}

/// U-7: the object that a zval made from a new stdClass holds.
fn php_object_of(zval: &mut Zval) -> Result<*mut ZendObject, Fail> {
    match zval.object_mut() {
        Some(object) => Ok(std::ptr::from_mut(object)),
        None => Err(binding_error(BindingError::Internal { detail: String::from("U-7: a stdClass that is no object") })),
    }
}

/// U-7: a property of a stdClass under its name, the bytes of a string key, which may hold any byte.
fn php_property(object: *mut ZendObject, key: OutValue, item: Zval) -> Result<(), Fail> {
    let name = match key {
        OutValue::Bytes(bytes) => ZendStr::new(bytes.value(), false),
        OutValue::Text(text) => ZendStr::new(text.as_bytes(), false),
        other => return Err(binding_error(BindingError::Internal { detail: format!("U-7: a property name of the kind {}", other.kind().as_str()) })),
    };
    // SAFETY: the object is a stdClass that this make created and the zval it returns holds; the engine gives its
    // table of properties, which it creates when the object has none and which no other value shares.
    let Some(table) = (unsafe { ext_php_rs::ffi::zend_std_get_properties(object).as_mut() }) else {
        return Err(binding_error(BindingError::Internal { detail: String::from("U-7: a stdClass without a table of properties") }));
    };
    table.insert(ext_php_rs::types::ArrayKey::ZendString(&name), item).map_err(php_failed)
}

/// U-7: an object that this make made before, once more: a zval that adds a reference count to it.
fn php_shared_object(object: *mut ZendObject) -> Zval {
    let mut zval = Zval::new();
    // SAFETY: the object is alive, because the zval that the make made first for it is held by the value being made.
    zval.set_object(unsafe { &mut *object });
    zval
}

/// U-7: a new reference that holds null until the make sets its value, as ZVAL_NEW_EMPTY_REF of Zend/zend_types.h, and
/// the zval that holds it.
fn php_new_reference() -> Result<(Zval, *mut ext_php_rs::ffi::zend_reference), Fail> {
    // GC_REFERENCE of Zend/zend_types.h: the type of a reference, which the cycle collector does not collect.
    const GC_REFERENCE: u32 = ext_php_rs::ffi::IS_REFERENCE | (1 << 4);
    let reference = ext_php_rs::alloc::emalloc(std::alloc::Layout::new::<ext_php_rs::ffi::zend_reference>()).cast::<ext_php_rs::ffi::zend_reference>();
    if reference.is_null() {
        return Err(binding_error(BindingError::Internal { detail: String::from("U-7: the engine gave no memory for a reference") }));
    }
    let content = ext_php_rs::ffi::zend_reference {
        gc: ext_php_rs::ffi::zend_refcounted_h { refcount: 1, u: ext_php_rs::ffi::_zend_refcounted_h__bindgen_ty_1 { type_info: GC_REFERENCE } },
        val: Zval::new(),
        sources: ext_php_rs::ffi::zend_property_info_source_list { ptr: std::ptr::null_mut() },
    };
    // SAFETY: the memory is a new allocation of the engine of the size and alignment of a reference.
    unsafe { reference.write(content) };
    Ok((php_reference_zval(reference), reference))
}

/// U-7: a zval that holds a reference, whose count the caller has taken for it.
fn php_reference_zval(reference: *mut ext_php_rs::ffi::zend_reference) -> Zval {
    let mut zval = Zval::new();
    zval.value.ref_ = reference;
    zval.u1.type_info = ext_php_rs::ffi::IS_REFERENCE_EX;
    zval
}

/// U-7: a reference that this make made before, once more: a zval that adds a reference count to it.
fn php_shared_reference(reference: *mut ext_php_rs::ffi::zend_reference) -> Zval {
    // SAFETY: the reference is alive, because the zval that the make made first for it is held by the value being made.
    unsafe { (*reference).gc.refcount += 1 };
    php_reference_zval(reference)
}

/// U-7: the value of a reference that the make made, set after its content was made, so that the content may hold it.
fn php_set_reference(reference: *mut ext_php_rs::ffi::zend_reference, content: Zval) {
    // SAFETY: the reference is alive, because the zval that the make made for it is held by the value being made; the
    // null that it held needs no release.
    unsafe { (*reference).val = content };
}

/// U-7: the literal token of a number as an int; one beyond the range of an int is kind internal.
fn php_literal_int(literal: &str) -> Result<Zval, Fail> {
    match literal.parse::<i64>() {
        Ok(integer) => out_int(integer),
        Err(_token) => Err(binding_error(BindingError::Internal { detail: format!("U-7: {literal} is no int") })),
    }
}

/// U-7: the literal token of a number as the nearest float.
fn php_literal_float(literal: &str) -> Result<Zval, Fail> {
    match literal.parse::<f64>() {
        Ok(float) => out_float(float),
        Err(_token) => Err(binding_error(BindingError::Internal { detail: format!("U-7: {literal} is no number") })),
    }
}

/// U-7: bytes that are UTF-8 as a string.
fn php_utf8(bytes: &[u8]) -> Result<Zval, Fail> {
    match std::str::from_utf8(bytes) {
        Ok(text) => out_text(text),
        Err(_bytes) => Err(binding_error(BindingError::Internal { detail: String::from("U-7: text of bytes that are not UTF-8") })),
    }
}

/// A count or an index of Rust as the u64 of a handle or a length (a usize fits a u64 on the targets of T-2).
fn handle_count(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

/// A u64 of a handle or an index as a position of Rust; one beyond usize finds nothing.
fn handle_position(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

/// U-3: a failure of the binding while the core walks a value, as the Raised that the caller throws again.
fn raised(error: Thrown) -> binding_core::Raised {
    keep_thrown(error)
}
`).replace(/\n\n(?=[ }])/g, '\n');

// U-7 (a'): the failure of the `in` of a value alias of another repository. Its kind, status and errno are the owner's;
// its class is this repository's class of the category that the owner's E-1 gives the variant, by a match without a
// wildcard (I-2 (3)). An exception that language code raised while the owner's core walked the value is thrown again.
export function foreignFailurePhp(model: Model): string {
  return foreignAliasLibraries(model).map((alias) => {
    const library = (alias.library ?? '').replaceAll('-', '_');
    const error = alias.error ?? { path: '', kinds: [] };
    const arms = error.kinds.map((k) => `        ${variantPattern(k.variant)} => ${model.classes.findIndex((c) => c.category === k.category)},`).join('\n');
    return `
/// U-7 (a'): a kind of ${alias.library ?? ''} in the class of its category here.
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn ${library}_error(error: ${error.path}) -> Fail {
    let class: usize = match ${errorMatched({ codeOf: error.code }, 'error')} {
${arms}
    };
    library_error(class, &error.to_string(), Kinds::kind(&error), Kinds::status(&error), Kinds::errno(&error))
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

// GN-13: the case-test entry points of the cases whose value has no PHP form. Each makes the value of its case as the
// host values that describe gives for a PHP value (B-1), held by CaseHost, and gives them to the in function of the
// alias, so the core judges them as it judges a PHP value; its failure is thrown as the failure of a call.
export function phpCaseTestEntries(model: Model, tests: CaseTest[], namespace: string): { entries: string; registers: string } {
  if (tests.length === 0) return { entries: '', registers: '' };
  const bytes = (data: Uint8Array): string => `HostValue::Text(HostText::Bytes(vec![${[...data].map((b) => `${b}_u8`).join(', ')}]))`;
  const hex = (raw: unknown): Uint8Array => Buffer.from(String((raw as { hex?: unknown } | null)?.['hex' as never] ?? (raw as { hex: string }).hex), 'hex');
  const key = (raw: unknown): string => caseKey(raw, (kind, held) => (kind === 'int' ? `HostValue::Int(${String(held)}_i64)` : kind === 'text' ? bytes(Buffer.from(String(held), 'utf8')) : bytes(hex(held))));
  const hold = (pairs: string[], variant: (len: number) => string): string => `{
            let entries = vec![${pairs.join(', ')}];
            let handle = host.hold(entries);
            ${variant(pairs.length)}
        }`;
  const value = (v: unknown): string => {
    const record = v as Record<string, unknown>;
    const held = record['value'];
    switch (record['kind']) {
      case 'null': return 'HostValue::Null';
      case 'bool': return `HostValue::Bool(${String(held === true)})`;
      // An integer outside 64 bits is the decimal token that Python and JavaScript describe for it.
      case 'int': return typeof held === 'string' && phpFormless(record) !== undefined ? `HostValue::Number(String::from(${rustString(held)}))` : `HostValue::Int(${String(held)}_i64)`;
      case 'float': {
        const number = Number(held);
        return `HostValue::Float(${Number.isInteger(number) ? `${String(number)}.0` : String(number)}_f64)`;
      }
      case 'text': return bytes(Buffer.from(String(held), 'utf8'));
      case 'bytes': return bytes(hex(held));
      case 'list': {
        if (record['repeat'] !== undefined) return `{
            let mut value = ${value(held)};
            for _ in 0..${String(record['repeat'])}_u32 {
                let handle = host.hold(vec![(HostValue::Int(0), value)]);
                value = HostValue::PhpArray { handle, len: 1, is_list: true };
            }
            value
        }`;
        const items = held as unknown[];
        return hold(items.map((item, i) => `(HostValue::Int(${i}), ${value(item)})`), (len) => `HostValue::PhpArray { handle, len: ${len}, is_list: true }`);
      }
      case 'map': {
        const pairs = held as unknown[][];
        const list = pairs.every((pair, i) => { const k = pair[0] as { int?: unknown } | null; return typeof k === 'object' && k !== null && k.int === i; });
        return hold(pairs.map((pair) => `(${key(pair[0])}, ${value(pair[1])})`), (len) => `HostValue::PhpArray { handle, len: ${len}, is_list: ${String(list)} }`);
      }
      case 'object': {
        // G-5: n objects, each the one property of the one around it, each held as its own object.
        if (record['repeat'] !== undefined) return `{
            let mut value = ${value(held)};
            for _ in 0..${String(record['repeat'])}_u32 {
                let handle = host.hold(vec![(${key(record['key'])}, value)]);
                value = HostValue::StdClass { handle, len: 1 };
            }
            value
        }`;
        // G-5: an object with an id is reserved before the value is made, filled at its first place and named by its
        // handle at every later one.
        if (record['id'] !== undefined) {
          const id = String(record['id']);
          const len = objects.get(id) ?? 0;
          if (!('value' in record)) return `HostValue::StdClass { handle: object_${id}, len: ${len} }`;
          const pairs = held as unknown[][];
          return `{
            let entries = vec![${pairs.map((pair) => `(${key(pair[0])}, ${value(pair[1])})`).join(', ')}];
            host.fill(object_${id}, entries);
            HostValue::StdClass { handle: object_${id}, len: ${len} }
        }`;
        }
        const pairs = held as unknown[][];
        return hold(pairs.map((pair) => `(${key(pair[0])}, ${value(pair[1])})`), (len) => `HostValue::StdClass { handle, len: ${len} }`);
      }
      case 'reference': {
        // G-5: a later place of a reference names its identity alone; the core does not read the target of an
        // identity that it has seen.
        const ref = held as Record<string, unknown>;
        const target = 'value' in ref ? value(ref['value']) : 'HostValue::Null';
        return `HostValue::PhpReference { identity: Handle::new(${String(ref['id'])}), target: Box::new(${target}) }`;
      }
      default:
        throw new Unsupported(`a case value of the kind ${String(record['kind'])} is not made as host values yet (GN-13)`);
    }
  };
  // The objects with an id of a value and the number of their properties, which every place of the id gives.
  let objects = new Map<string, number>();
  const scan = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) scan(item);
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    const record = v as Record<string, unknown>;
    if (record['kind'] === 'object' && record['id'] !== undefined && Array.isArray(record['value'])) objects.set(String(record['id']), record['value'].length);
    for (const inner of Object.values(record)) scan(inner);
  };
  const entries = tests.map((t, i) => {
    objects = new Map();
    scan(t.value);
    const reserved = [...objects.keys()].map((id) => `let object_${id} = host.reserve();\n            `).join('');
    const failure = `binding_core::Failure<${t.alias.error?.path ?? model.coreError ?? '()'}>`;
    return `
    /// GN-13: the case ${t.id} of ${t.fn?.member.id ?? `the alias ${t.alias.unit.id}`}, as the host values that PHP would describe, given to the in
    /// function of ${t.alias.unit.id}. Its value has no PHP form: ${t.reason}.
    #[cfg(feature = "case-test")]
    #[php_function]
    #[php(name = ${rustString(`${namespace}\\Internal\\caseTest${i}`)})]
    pub fn case_test_${i}() -> Result<(), PhpException> {
        guard(|| {
            let mut host = CaseHost::default();
            ${reserved}let value = ${value(t.value).replaceAll('\n', '\n    ')};
            let _value: ${t.alias.unit.core_type ?? ''} = ${t.alias.coreIn}(&mut host, value).map_err(|failure: ${failure}| ${aliasFailureFn(t.alias)}(failure))?;
            Ok(())
        })
    }
`;
  }).join('');
  const registers = tests.map((_t, i) => `
        #[cfg(feature = "case-test")]
        let module = module.function(wrap_function!(case_test_${i}));`).join('');
  return { entries: `${CASE_HOST}${entries}`, registers };
}

const CASE_HOST = `
    /// GN-13: the entries of the arrays and the objects that a case-test entry point made, under their handles.
    #[cfg(feature = "case-test")]
    #[derive(Default)]
    struct CaseHost {
        held: Vec<Vec<(HostValue, HostValue)>>,
    }

    #[cfg(feature = "case-test")]
    impl CaseHost {
        fn hold(&mut self, entries: Vec<(HostValue, HostValue)>) -> Handle {
            self.held.push(entries);
            Handle::new(handle_count(self.held.len() - 1))
        }

        /// G-5: the handle of an object with an id, before its properties are made.
        fn reserve(&mut self) -> Handle {
            self.hold(Vec::new())
        }

        fn fill(&mut self, handle: Handle, entries: Vec<(HostValue, HostValue)>) {
            if let Some(held) = self.held.get_mut(handle_position(handle.raw())) {
                *held = entries;
            }
        }

        fn entry(&self, handle: Handle, index: u64) -> Result<(HostValue, HostValue), binding_core::Raised> {
            match self.held.get(handle_position(handle.raw())).and_then(|entries| entries.get(handle_position(index))) {
                Some(entry) => Ok(entry.clone()),
                None => Err(raised(Thrown::Binding(binding_error(BindingError::Internal { detail: String::from("B-1: no such entry") })))),
            }
        }
    }

    #[cfg(feature = "case-test")]
    impl HostValues for CaseHost {
        fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, binding_core::Raised> {
            Ok(CaseHost::entry(self, list, index)?.1)
        }

        fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), binding_core::Raised> {
            CaseHost::entry(self, map, index)
        }

        fn read(&mut self, _value: Handle) -> Result<HostValue, binding_core::Raised> {
            Err(raised(Thrown::Binding(binding_error(BindingError::Internal { detail: String::from("B-1: no value class is read") }))))
        }
    }
`;

// GN-6u, GN-6z: the Natives of PHP, which a value alias and a function type hold: the owner table, released at the
// request shutdown, and the check of the thread of a call of a function.
// usedHelpers splits helpers at blank lines, so a block keeps none inside it.
export const PHP_NATIVE = (`${ownedNatives('Zval', 'drop(references);')}
/// GN-6u: a PHP value that a core may keep, as a Native of the table of this thread.
fn php_native(value: &Zval) -> Result<Native, Fail> {
    if OWNED.with_borrow(Option::is_none) {
        let Some((owner, generation)) = native_owner() else {
            return Err(binding_error(BindingError::Internal { detail: String::from("GN-6u: the table of the owners is poisoned") }));
        };
        OWNED.with_borrow_mut(|owned| *owned = Some(Owned { owner, generation, next: 0, values: BTreeMap::new() }));
    }
    keep_native(value.shallow_clone()).ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("GN-6u: this thread has no table") }))
}

/// GN-6u: the PHP value that entered as the Native; one of an ended request, or of another thread, is kind internal.
fn native_object(native: &Native) -> Result<Zval, Fail> {
    let found = native.downcast::<OwnedNative>().and_then(|native| {
        OWNED.with_borrow(|owned| match owned {
            Some(owned) if owned.owner == native.owner && owned.generation == native.generation => owned.values.get(&native.key).map(Zval::shallow_clone),
            _ => None,
        })
    });
    found.ok_or_else(|| binding_error(BindingError::Internal { detail: String::from("GN-6u: the native value is gone") }))
}

/// GN-6u: the engine frees the values of a request when the request ends, so the request shutdown releases the table
/// while the engine is alive.
extern "C" fn release_native(_kind: i32, _module: i32) -> i32 {
    clean_up_native();
    0
}

fn php_failed(error: ext_php_rs::error::Error) -> Fail {
    binding_error(BindingError::Internal { detail: error.to_string() })
}

/// GN-6z: a value of a function type is a Closure (kind invalid_argument_type), held as a Native.
fn in_function(value: &Zval, subject: &str) -> Result<Native, Fail> {
    let closure = match value.object() {
        Some(object) => object.get_class_name().map_err(php_failed)? == "Closure",
        None => false,
    };
    if !closure {
        return Err(binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from("a Closure") }));
    }
    php_native(value)
}

/// GN-6z: whether a call of the function of a Native may run here: a call on another thread is kind wrong_thread, and
/// a call after the request of the function ended is kind internal. The failure is a BindingError, which any thread may
/// keep, since a PHP error object is made on the owner thread only.
fn native_thread(native: &Native, subject: &str) -> Result<(), BindingError> {
    let Some(native) = native.downcast::<OwnedNative>() else {
        return Err(BindingError::Internal { detail: String::from("GN-6u: a native value that no PHP value entered as") });
    };
    if OWNER.get() != Some(native.owner) {
        return Err(BindingError::WrongThread { subject: subject.to_owned() });
    }
    if !OWNED.with_borrow(|owned| owned.as_ref().is_some_and(|owned| owned.generation == native.generation)) {
        return Err(BindingError::Internal { detail: String::from("GN-6u: the request of the function has ended") });
    }
    Ok(())
}
`).replace(/\n\n(?=[ }])/g, '\n');
