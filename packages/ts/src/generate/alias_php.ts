// U-7: the PHP conversions of a value alias. A PHP value enters as a HostValue that the binding gives one level at a
// time (B-1) and the core's `in` function judges; a core value leaves as the OutValue that the core's `out` function
// gives, which the binding makes into PHP values by the alias's `out` rows (U-7 (d)). A PHP array is a value, not an
// object, so a handle that comes again is made again; a handle inside its own making is a cycle that only a reference
// can hold, which the out rows give as the kind reference.

import { type Model, type ValueAlias, langName, rustField, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported } from './model.ts';
import { container, outArms, ownedNatives } from './alias_shared.ts';

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
            making.remove(&handle.raw());
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
            making.remove(&handle.raw());
            let mut zval = Zval::new();
            zval.set_hashtable(array);
            Ok(zval)
        }`;
    }
    case 'php_object': {
      const parts = container(alias, kind, 'map');
      return `{
            ${parts.head}
            let mut object = ZendObject::new_stdclass();
            php_enter(making, handle)?;
            for index in 0..len {
                let (key, item) = ${parts.entry};
                let item = make(item, source, making)?;
                let OutValue::Text(name) = key else {
                    return Err(binding_error(BindingError::Internal { detail: String::from("U-7: a property of a stdClass whose name is no text") }));
                };
                object.set_property(&name, item).map_err(php_failed)?;
            }
            making.remove(&handle.raw());
            object.into_zval(false).map_err(php_failed)
        }`;
    }
    case 'native':
      return 'native_object(&native)';
    default:
      throw new Unsupported(`${alias.unit.id}: the PHP form ${form} of the kind ${kind} is not generated yet`);
  }
}

export function aliasPhp(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const label = langName('php', alias.unit.name, 'class');
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  const arms = outArms(model, alias, 'php', (form, kind) => builtin(alias, form, kind), 'Err(binding_error(BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', '');
  return `
/// U-7: a PHP value of ${label} enters as HostValue, which the core judges.
fn in_${name}(value: &Zval, _subject: &str) -> Result<${core}, Fail> {
    let mut host = PhpHost { held: Vec::new(), marked: 0 };
    let described = host.describe(value)?;
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// U-7: a core value of ${label} leaves as the PHP values of its out rows.
fn out_${name}(value: impl Borrow<${core}>) -> Result<Zval, Fail> {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    let mut making = BTreeSet::new();
    make_${name}(root, &mut source, &mut making)
}

fn make_${name}(out: OutValue, source: &mut dyn OutValues, making: &mut BTreeSet<u64>) -> Result<Zval, Fail> {
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
fn php_enter(making: &mut BTreeSet<u64>, handle: Handle) -> Result<(), Fail> {
    if making.insert(handle.raw()) {
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
        other => Err(binding_error(BindingError::Internal { detail: format!("U-7: an array key of the kind {}", other.kind().as_str()) })),
    }
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
    const arms = error.kinds.map((k) => `        ${k.variant} { .. } => ${model.classes.findIndex((c) => c.category === k.category)},`).join('\n');
    return `
/// U-7 (a'): a kind of ${alias.library ?? ''} in the class of its category here.
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn ${library}_error(error: ${error.path}) -> Fail {
    let class: usize = match error {
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
