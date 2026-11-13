// U-7: the PHP conversions of a value alias. A PHP value enters as a HostValue that the binding gives one level at a
// time (B-1) and the core's `in` function judges; a core value leaves as the OutValue that the core's `out` function
// gives, which the binding makes into PHP values by the alias's `out` rows (U-7 (d)). A PHP array is a value, not an
// object, so a handle that comes again is made again; a handle inside its own making is a cycle that only a reference
// can hold, which the out rows give as the kind reference.

import { type Model, type ValueAlias, langName, rustField, aliasFn, aliasFailureFn, foreignAliasLibraries, Unsupported } from './model.ts';
import { container, outArms } from './alias_shared.ts';

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
      return 'native_object(handle)';
    default:
      throw new Unsupported(`${alias.unit.id}: the PHP form ${form} of the kind ${kind} is not generated yet`);
  }
}

// U-7: what a make has made so far under the handles of the out value. A PHP array is a value, so one inside its own
// making is a cycle; an object and a reference have an identity, so a handle that comes again is the same object or
// reference, a cycle included. A field is generated only when an out row makes that form.
export function phpMaking(model: Model): string {
  const makes = model.aliases.flatMap((a) => (a.unit.out ?? []).map((row) => row.make?.php));
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

export function aliasPhp(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const label = langName('php', alias.unit.name, 'class');
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  const arms = outArms(model, alias, 'php', (form, kind) => builtin(alias, form, kind), 'Err(binding_error(BindingError::Internal { detail: String::from("U-7: no out row takes the value") }))', '');
  return `
/// U-7: a PHP value of ${label} enters as HostValue, which the core judges.
fn in_${name}(value: &Zval, _subject: &str) -> Result<${core}, Fail> {
    let mut host = PhpHost { held: Vec::new() };
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
                return Ok(HostValue::Callable(native_handle(value)));
            }
            let json_serializable = match ClassEntry::try_find("JsonSerializable") {
                Some(class) => object.instance_of(class),
                None => false,
            };
            return Ok(HostValue::Object { handle: native_handle(value), type_name, json_serializable });
        }
        Ok(HostValue::Other { type_name: String::from("resource"), handle: native_handle(value) })
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

fn php_failed(error: ext_php_rs::error::Error) -> Fail {
    binding_error(BindingError::Internal { detail: error.to_string() })
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

thread_local! {
    /// U-7 (VAL-18): the PHP values that entered as handles in this request, which a native value gives back as the
    /// same value.
    static NATIVE: RefCell<Vec<Zval>> = const { RefCell::new(Vec::new()) };
    /// GN-6e: the count of the handles of the requests that ended. The handles of this request follow it, so a handle
    /// of an ended request finds no value.
    static RELEASED: std::cell::Cell<u64> = const { std::cell::Cell::new(0) };
}

fn native_handle(value: &Zval) -> Handle {
    NATIVE.with_borrow_mut(|native| {
        native.push(value.shallow_clone());
        Handle::new(RELEASED.get().saturating_add(handle_count(native.len() - 1)))
    })
}

fn native_object(handle: Handle) -> Result<Zval, Fail> {
    let position = handle.raw().checked_sub(RELEASED.get()).map(handle_position);
    NATIVE.with_borrow(|native| match position.and_then(|position| native.get(position)) {
        Some(value) => Ok(value.shallow_clone()),
        None => Err(binding_error(BindingError::Internal { detail: String::from("U-7: the native value is gone") })),
    })
}

/// GN-6e: the values that entered as handles are released when the request ends, while the engine that owns them is
/// alive. Kept longer, they are released by the thread after the engine is gone, which ends the process with a fault.
extern "C" fn release_native(_kind: i32, _module: i32) -> i32 {
    NATIVE.with_borrow_mut(|native| {
        RELEASED.set(RELEASED.get().saturating_add(handle_count(native.len())));
        native.clear();
    });
    0
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
    let handle = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    THROWN.with_borrow_mut(|map| map.insert(handle, error));
    binding_core::Raised::from_generated(binding_core::Handle::new(handle))
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
