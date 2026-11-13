// The Rust crate of the C ABI of the Go binding (B-8): each entry point takes the encoded arguments, which the Go
// package writes, judges them as it decodes them (T-8), calls the core and gives back the encoded result or failure in
// a buffer that Go copies and frees. A class unit keeps the core values of its instances in a table of handles (T-5),
// a callback (U-3) and the walk of a value alias (U-7) call back into Go through the functions that package binding
// exports, and the test features add the entry points of the generated tests (GN-5).

import type { Name, Type, Unit } from '../contract.ts';
import { defaultAsserts } from './defaults.ts';
import { goErrorTypes, goName, goSubject } from './go.ts';
import {
  type Arg, type CallbackUnit, type Fn, type Model, type ObjectClass, type ValueAlias, Unsupported, aliasFailureFn, aliasFn, aliasKindsRust,
  aliasOf, aliasesWithKinds, argType, armedCall, borrowedItem, coreCallArgs, DRIVEN, drivenCall, errorProperties, propertyValue, faultRust, foreignAliasLibraries, heldNew,
  heldParam, heldType, langName, libraryOf, lockLines, objectUnit, poisoned, recordFn, resultLet, rustField, rustType, rustVariant, takesObject, unitOf,
  variantPattern,
  errorMatched,
  recognizedFn,
  recognizedMatch,
} from './model.ts';
import { extensionName } from './packages.ts';
import { raisesAssertions } from './raises.ts';
import { container, outArms } from './alias_shared.ts';
import { header, closure, optionRef, rustString, usedHelpers, WIDEN } from './text.ts';

// The C symbol prefix of the static library: the PHP extension name of P-1, polyspec_<repository>.
export const prefix = (model: Model): string => extensionName(model.contract);

const moduleWords = (module: string): Name => module.split('/').filter((s) => s !== '').flatMap((s) => s.split(/[^a-z0-9]+/));

// The words of a member in the C ABI and in package binding: the module, the class of a member of a class unit, and
// the member name (new for the constructor).
export const fnWords = (fn: Fn): Name => [
  ...moduleWords(fn.module),
  ...(fn.kind === 'function' ? [] : fn.unit.name),
  ...(fn.kind === 'constructor' ? ['new'] : fn.member.name),
];
const snake = (words: Name): string => words.map((w) => (typeof w === 'string' ? w : w.acronym.toLowerCase())).join('_');
export const cSymbol = (model: Model, fn: Fn): string => `${prefix(model)}_${snake(fnWords(fn))}`;
export const bindingFn = (fn: Fn): string => goName(fnWords(fn));

// The snake_case name of a unit in the names that this file makes; a keyword needs no raw form inside a longer name.
export const plainName = (unit: Unit): string => rustField(unit.name).replace(/^r#/, '');
const tableName = (unit: Unit): string => `TABLE_${plainName(unit).toUpperCase()}`;
export const releaseSymbol = (model: Model, unit: Unit): string => `${prefix(model)}__release_${plainName(unit)}`;

// T-5: the Go name of a class in the message of kind busy, of a poisoned object and of a refused handle.
export const classLabel = (object: ObjectClass): string => goName(object.unit.name);

const callbackOf = (model: Model, type: Type): CallbackUnit | undefined => {
  const unit = unitOf(model, type);
  return unit === undefined ? undefined : model.callbacks.find((c) => c.unit === unit);
};

// Whether the model calls back into Go: a callback unit, or the walk of a value alias.
export const callsBack = (model: Model): boolean => model.callbacks.length > 0 || model.aliases.length > 0;

// ---- conversions ----

export function convertIn(model: Model, type: Type, input: string, subject: string): string {
  if (typeof type === 'string') {
    if (type === 'text') return `in_text(${input}, ${subject})`;
    if (type === 'latin1') return `in_latin1(${input}, ${subject})`;
    // T-1: a source is a Go []byte, whose bytes the core judges.
    // GN-12a: an int or a uint of the contract is a safe integer, which the Go types do not hold to.
    if (type === 'int' || type === 'uint') return `in_safe_${type}(${input}, ${subject})`;
    const fn: Record<string, string> = { bytes: 'in_bytes', source: 'in_bytes', bool: 'in_bool', int64: 'in_int', float: 'in_float' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no Go input conversion for ${type}`);
    return `${name}(${input})`;
  }
  if ('list' in type) return `in_list(${input}, ${closure(['input'], convertIn(model, type.list, 'input', subject))})`;
  if ('tuple' in type) {
    // T-2, GN-16: a tuple parameter or a tuple inside another type, its parts in order.
    return `in_tuple${type.tuple.length}(${input}, ${type.tuple.map((part) => closure(['input'], convertIn(model, part, 'input', subject))).join(', ')})`;
  }
  if ('map' in type) return `in_map(${input}, ${subject}, ${closure(['input'], convertIn(model, type.map, 'input', subject))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `in_keyed_map(${input}, ${subject}, &[${tags.join(', ')}], ${rustString(`a key of ${type.key.join(' or ')}`)}, ${closure(['input'], convertIn(model, type.keyed_map, 'input', subject))})`;
  }
  if ('optional' in type) return `in_optional(${input}, ${closure(['input'], convertIn(model, type.optional, 'input', subject))})`;
  const alias = aliasOf(model, type);
  if (alias !== undefined) return `in_${aliasFn(alias)}(${input})`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `in_${rustField(unit.name)}(${input}, ${subject})`;
  if (unit?.kind === 'record') return `in_${recordFn(unit, libraryOf(type))}(${input})`;
  if (unit !== undefined && objectUnit(model, type) !== undefined) return `in_${plainName(unit)}(${input}, ${subject})`;
  if (callbackOf(model, type) !== undefined && unit !== undefined) return `in_${plainName(unit)}(${input}, ${subject})`;
  throw new Unsupported(`no Go input conversion for ${JSON.stringify(type)}`);
}

export function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    if (type === 'never') return `match ${value} {}`;
    const fn: Record<string, string> = { text: 'out_text', latin1: 'out_latin1', bytes: 'out_bytes', bool: 'out_bool', uint: 'out_uint', int: 'out_int', int64: 'out_int', float: 'out_float' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no Go output conversion for ${type}`);
    return `${name}(output, ${value})`;
  }
  if ('list' in type) return `out_list(output, ${value}, ${closure(['output', 'item'], convertOut(model, type.list, 'item'))})`;
  // The item of a map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('map' in type) return `out_map(output, ${value}, |output, item| ${convertOut(model, type.map, 'item')})`;
  if ('keyed_map' in type) return `out_keyed_map(output, ${value}, |output, item| ${convertOut(model, type.keyed_map, 'item')})`;
  // GN-16: an Option of a reference to the value of the core, so a generic item, such as out_int, takes one type.
  if ('optional' in type) return `out_optional(output, ${optionRef(value)}, ${closure(['output', 'value'], convertOut(model, type.optional, 'value'))})`;
  if ('tuple' in type) return `{\n${type.tuple.map((t, i) => `            ${convertOut(model, t, `&${value}.${i}`)};`).join('\n')}\n        }`;
  const alias = aliasOf(model, type);
  if (alias !== undefined) return `out_${aliasFn(alias)}(output, ${value})`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum' || unit?.kind === 'record') return `out_${recordFn(unit, unit.kind === 'record' ? libraryOf(type) : undefined)}(output, ${value})`;
  if (unit !== undefined && objectUnit(model, type) !== undefined) return `out_${plainName(unit)}(output, ${value})`;
  throw new Unsupported(`no Go output conversion for ${JSON.stringify(type)}`);
}

const RUST_HELPERS = `
/// The encoded arguments do not follow the encoding, which only a fault of the generated code makes: kind internal.
fn malformed() -> Fail {
    binding_error(BindingError::Internal { detail: String::from("the encoded arguments do not follow the encoding of the binding") })
}

fn take<'a>(input: &mut &'a [u8], count: usize) -> Result<&'a [u8], Fail> {
    if count > input.len() {
        return Err(malformed());
    }
    let (head, tail) = input.split_at(count);
    *input = tail;
    Ok(head)
}

fn read_word(input: &mut &[u8]) -> Result<[u8; 8], Fail> {
    <[u8; 8]>::try_from(take(input, 8)?).map_err(|_length| malformed())
}

fn read_length(input: &mut &[u8]) -> Result<usize, Fail> {
    Ok(usize::from_le_bytes(read_word(input)?))
}

fn read_tag(input: &mut &[u8]) -> Result<bool, Fail> {
    match take(input, 1)? {
        [0] => Ok(false),
        [1] => Ok(true),
        _ => Err(malformed()),
    }
}

fn read_bytes<'a>(input: &mut &'a [u8]) -> Result<&'a [u8], Fail> {
    let length = read_length(input)?;
    take(input, length)
}

/// The arguments end where the last parameter ends.
fn finish_input(input: &[u8]) -> Result<(), Fail> {
    if input.is_empty() {
        Ok(())
    } else {
        Err(malformed())
    }
}

fn in_bool(input: &mut &[u8]) -> Result<bool, Fail> {
    read_tag(input)
}

fn in_uint(input: &mut &[u8]) -> Result<u64, Fail> {
    Ok(u64::from_le_bytes(read_word(input)?))
}

fn in_int(input: &mut &[u8]) -> Result<i64, Fail> {
    Ok(i64::from_le_bytes(read_word(input)?))
}

/// B-2, GN-12a: a uint of the contract is 0 to 2^53 - 1; a larger one is kind invalid_number.
fn in_safe_uint(input: &mut &[u8], subject: &str) -> Result<u64, Fail> {
    match in_uint(input)? {
        integer @ 0..=9_007_199_254_740_991 => Ok(integer),
        _ => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint })),
    }
}

/// B-2, GN-12a: an int of the contract is a safe integer; any other is kind invalid_number.
fn in_safe_int(input: &mut &[u8], subject: &str) -> Result<i64, Fail> {
    match in_int(input)? {
        integer if integer.unsigned_abs() <= 9_007_199_254_740_991 => Ok(integer),
        _ => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int })),
    }
}

fn in_float(input: &mut &[u8]) -> Result<f64, Fail> {
    Ok(f64::from_le_bytes(read_word(input)?))
}

/// B-8: a Go string of the contract type text is UTF-8; other bytes are kind invalid_text.
fn in_text(input: &mut &[u8], subject: &str) -> Result<String, Fail> {
    String::from_utf8(read_bytes(input)?.to_vec())
        .map_err(|_not_utf8| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::NotUtf8 }))
}

/// B-8, T-1 latin1: a Go string of UTF-8 whose runes are U+0000 to U+00FF, one byte each; a rune above U+00FF is kind
/// invalid_text, as in every language.
fn in_latin1(input: &mut &[u8], subject: &str) -> Result<Vec<u8>, Fail> {
    let text = in_text(input, subject)?;
    text.chars()
        .map(|character| {
            u8::try_from(u32::from(character))
                .map_err(|_above| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::AboveLatin1 }))
        })
        .collect()
}

/// A []byte is its bytes; a source (T-1) is a []byte too, whose bytes the core judges.
fn in_bytes(input: &mut &[u8]) -> Result<Vec<u8>, Fail> {
    Ok(read_bytes(input)?.to_vec())
}

fn in_list<'a, T>(input: &mut &'a [u8], item: impl Fn(&mut &'a [u8]) -> Result<T, Fail>) -> Result<Vec<T>, Fail> {
    let count = read_length(input)?;
    let mut items = Vec::new();
    for _ in 0..count {
        items.push(item(input)?);
    }
    Ok(items)
}

/// An optional value, and U-2 a parameter or a field with a default, which Go leaves out as nil: the core decides its
/// value.
fn in_optional<'a, T>(input: &mut &'a [u8], item: impl FnOnce(&mut &'a [u8]) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    if read_tag(input)? {
        item(input).map(Some)
    } else {
        Ok(None)
    }
}

/// T-2: an ordered map, its text keys each once; a key twice is a fault of the generated Go code (kind internal).
fn in_map<'a, T>(input: &mut &'a [u8], subject: &str, item: impl Fn(&mut &'a [u8]) -> Result<T, Fail>) -> Result<binding_core::OrderedMap<T>, Fail> {
    let count = read_length(input)?;
    let mut map = binding_core::OrderedMap::new();
    for _ in 0..count {
        let key = in_text(input, subject)?;
        let value = item(input)?;
        if map.insert(key, value).is_some() {
            return Err(malformed());
        }
    }
    Ok(map)
}

/// T-2: an ordered map, owned or borrowed, in its order.
fn out_map<T>(output: &mut Vec<u8>, value: impl Borrow<binding_core::OrderedMap<T>>, item: impl Fn(&mut Vec<u8>, &T)) {
    let map = value.borrow();
    write_length(output, map.len());
    for (key, value) in map.iter() {
        out_text(output, key);
        item(output, value);
    }
}

/// T-2, U-7 (c): a keyed map, its keys each once: kind 0 an integer, 1 a byte string, 2 a text; a key of a kind that
/// the contract does not list is kind invalid_argument_type, a key twice a fault of the generated Go code.
fn in_keyed_map<'a, T>(
    input: &mut &'a [u8],
    subject: &str,
    kinds: &[u8],
    expected: &str,
    item: impl Fn(&mut &'a [u8]) -> Result<T, Fail>,
) -> Result<binding_core::KeyedMap<T>, Fail> {
    let count = read_length(input)?;
    let mut map = binding_core::KeyedMap::new();
    for _ in 0..count {
        let (tag, key) = match take(input, 1)? {
            [0] => (0, binding_core::Key::Int(in_int(input)?)),
            [1] => (1, binding_core::Key::Bytes(in_bytes(input)?)),
            [2] => (2, binding_core::Key::Text(in_text(input, subject)?)),
            _ => return Err(malformed()),
        };
        if !kinds.contains(&tag) {
            return Err(type_error(subject, expected));
        }
        // GN-12a: an int key of a listed int is a safe integer, else kind invalid_number.
        if matches!(key, binding_core::Key::Int(integer) if integer.unsigned_abs() > 9_007_199_254_740_991) {
            return Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int }));
        }
        let value = item(input)?;
        if map.insert(key, value).is_some() {
            return Err(malformed());
        }
    }
    Ok(map)
}

/// T-2: a keyed map, owned or borrowed, in its order.
fn out_keyed_map<T>(output: &mut Vec<u8>, value: impl Borrow<binding_core::KeyedMap<T>>, item: impl Fn(&mut Vec<u8>, &T)) {
    let map = value.borrow();
    write_length(output, map.len());
    for (key, value) in map.iter() {
        out_key(output, key);
        item(output, value);
    }
}

/// T-2: a key of a keyed map: its kind (0 an integer, 1 a byte string, 2 a text) and its value.
fn out_key(output: &mut Vec<u8>, key: &binding_core::Key) {
    match key {
        binding_core::Key::Int(integer) => {
            output.push(0);
            out_int(output, integer);
        }
        binding_core::Key::Bytes(bytes) => {
            output.push(1);
            out_bytes(output, bytes);
        }
        binding_core::Key::Text(text) => {
            output.push(2);
            out_text(output, text);
        }
    }
}

fn type_error(subject: &str, expected: &str) -> Fail {
    binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: expected.to_owned() })
}

fn write_length(output: &mut Vec<u8>, length: usize) {
    output.extend_from_slice(&length.to_le_bytes());
}

fn out_bytes(output: &mut Vec<u8>, value: impl AsRef<[u8]>) {
    let bytes = value.as_ref();
    write_length(output, bytes.len());
    output.extend_from_slice(bytes);
}

fn out_text(output: &mut Vec<u8>, value: impl AsRef<str>) {
    out_bytes(output, value.as_ref().as_bytes());
}

/// T-1 latin1: each byte leaves as the rune of the same code point, so a Go string reads it as UTF-8.
fn out_latin1(output: &mut Vec<u8>, value: impl AsRef<[u8]>) {
    let text: String = value.as_ref().iter().map(|byte| char::from(*byte)).collect();
    out_text(output, text);
}

fn out_bool(output: &mut Vec<u8>, value: impl Borrow<bool>) {
    output.push(u8::from(*value.borrow()));
}

fn out_uint(output: &mut Vec<u8>, value: impl WideUint) {
    output.extend_from_slice(&value.widen_uint().to_le_bytes());
}

fn out_int(output: &mut Vec<u8>, value: impl WideInt) {
    output.extend_from_slice(&value.widen_int().to_le_bytes());
}

fn out_float(output: &mut Vec<u8>, value: impl Borrow<f64>) {
    output.extend_from_slice(&value.borrow().to_le_bytes());
}

fn out_list<T>(output: &mut Vec<u8>, value: impl IntoIterator<Item = T>, item: impl Fn(&mut Vec<u8>, T)) {
    let items: Vec<T> = value.into_iter().collect();
    write_length(output, items.len());
    for value in items {
        item(output, value);
    }
}

/// An optional value, owned or borrowed (\`&Option<T>\` is an \`Option<&T>\`).
fn out_optional<T>(output: &mut Vec<u8>, value: Option<T>, item: impl FnOnce(&mut Vec<u8>, T)) {
    match value {
        Some(value) => {
            output.push(1);
            item(output, value);
        }
        None => output.push(0),
    }
}

/// The guard of a mutex of this crate, whose holders do not panic while they hold it, so a poisoned guard holds whole
/// data.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

/// T-5: the value under a handle of a table: handle 0, the handle of the zero value of a Go class, is kind
/// invalid_argument_type; a handle that names no value is a fault of the generated Go code (kind internal).
fn held<T>(table: &Mutex<Table<T>>, handle: u64, subject: &str, class: &str) -> Result<Arc<T>, Fail> {
    if handle == 0 {
        return Err(type_error(subject, &format!("{class} made by the binding")));
    }
    lock(table).values.get(&handle).cloned().ok_or_else(|| binding_error(BindingError::Internal { detail: format!("T-5: no value of {class} has the handle {handle}") }))
}

/// T-5: keeps a value in a table and gives its handle, which is never 0.
fn insert_held<T>(table: &Mutex<Table<T>>, value: T) -> u64 {
    let mut table = lock(table);
    table.next += 1;
    let handle = table.next;
    table.values.insert(handle, Arc::new(value));
    handle
}

/// The bytes of a buffer that Go filled through the allocation of this crate.
fn taken(buffer: Buffer) -> Vec<u8> {
    if buffer.ptr.is_null() {
        return Vec::new();
    }
    // SAFETY: the buffer is the parts of a Vec<u8> that __alloc gave to Go, which gave it back once.
    unsafe { Vec::from_raw_parts(buffer.ptr, buffer.len, buffer.cap) }
}

/// U-7: one level of a Go value, as package binding describes it: 0 nil, 1 a bool, 2 an integer, 3 an integer beyond
/// int64 as its decimal text, 4 a float, 5 a string, 6 a []byte, 7 a slice or an array, 8 a map, 9 a func, 10 any other
/// value with its type name; a container with its handle and length.
fn read_host(input: &mut &[u8]) -> Result<HostValue, Fail> {
    Ok(match take(input, 1)? {
        [0] => HostValue::Null,
        [1] => HostValue::Bool(read_tag(input)?),
        [2] => HostValue::Int(in_int(input)?),
        [3] => HostValue::Number(in_text(input, "a number")?),
        [4] => HostValue::Float(in_float(input)?),
        [5] => HostValue::Text(HostText::Bytes(in_bytes(input)?)),
        [6] => HostValue::Bytes(in_bytes(input)?),
        [7] => HostValue::List { handle: Handle::new(in_uint(input)?), len: in_uint(input)? },
        [8] => HostValue::Map { handle: Handle::new(in_uint(input)?), len: in_uint(input)? },
        [9] => HostValue::Callable(Handle::new(in_uint(input)?)),
        [10] => {
            let type_name = in_text(input, "a type name")?;
            HostValue::Other { type_name, handle: Handle::new(in_uint(input)?) }
        }
        _ => return Err(malformed()),
    })
}

/// U-7: a value that the out rows of the alias give no Go form: a node that Go decodes as kind internal.
fn out_no_form(output: &mut Vec<u8>, reason: &str) {
    output.push(255);
    out_text(output, reason);
}
`;

function enumRust(unit: Unit): string {
  const name = rustField(unit.name);
  const core = unit.core_type ?? '';
  const arms = (unit.variants ?? []).map((v) => `        ${rustBytes(v.value)} => Ok(${core}::${rustVariant(v.name)}),`).join('\n');
  const outArmsText = (unit.variants ?? []).map((v) => `        ${core}::${rustVariant(v.name)} => ${rustString(v.value)},`).join('\n');
  return `
/// T-6: a value of ${goName(unit.name)} is one of its constants; any other string is kind invalid_argument_type.
fn in_${name}(input: &mut &[u8], subject: &str) -> Result<${core}, Fail> {
    match read_bytes(input)? {
${arms}
        _ => Err(type_error(subject, ${rustString(goName(unit.name))})),
    }
}

fn out_${name}(output: &mut Vec<u8>, value: impl Borrow<${core}>) {
    let text = match value.borrow() {
${outArmsText}
    };
    out_text(output, text);
}
`;
}

const rustBytes = (text: string): string => `b${rustString(text)}`;

// T-4, U-2: a record, its fields in contract order; a field with a default is Option<T>, None when Go leaves it nil.
// GN-15f: a record of another repository has the helpers in_<library>_<record> and out_<library>_<record>.
function recordRust(model: Model, unit: Unit, library?: string): string {
  const name = recordFn(unit, library);
  const core = unit.core_type ?? '';
  const fields = unit.fields ?? [];
  const reads = fields.map((f) => {
    const subject = rustString(goName(f.name));
    if (f.default !== undefined) return `    let ${rustField(f.name)}: Option<${rustType(model, f.type)}> = ${convertIn(model, { optional: f.type }, 'input', subject)}?;`;
    return `    let ${rustField(f.name)}: ${rustType(model, f.type)} = ${convertIn(model, f.type, 'input', subject)}?;`;
  });
  // GN-6l: a scalar field is passed by value, any other by reference.
  const scalar = (type: Type): boolean => typeof type === 'string' && ['bool', 'uint', 'int', 'int64', 'float'].includes(type);
  const writes = fields.map((f) => `    ${convertOut(model, f.default === undefined ? f.type : { optional: f.type }, `${f.default === undefined && scalar(f.type) ? '' : '&'}value.${rustField(f.name)}`)};`);
  return `
/// T-4: the record ${goName(unit.name)}, its fields in contract order.
fn in_${name}(input: &mut &[u8]) -> Result<${core}, Fail> {
${reads.join('\n')}
    Ok(${core} { ${fields.map((f) => rustField(f.name)).join(', ')} })
}

fn out_${name}(output: &mut Vec<u8>, value: impl Borrow<${core}>) {
    let value = value.borrow();
${writes.join('\n')}
}
`;
}

// ---- class units (T-5) ----

const locked = (model: Model, fn: Fn): boolean => model.objects.find((o) => o.unit === fn.unit)?.lock !== undefined;

// T-5: the helpers of a class unit: the value of a handle, a value that leaves as a new instance, and a value inside
// another type, which is read and cloned (GN-6h). The helper block keeps the ones that the entry points use.
function objectHelpers(model: Model, object: ObjectClass): string {
  const plain = plainName(object.unit);
  const goClass = classLabel(object);
  const core = object.unit.core_type ?? '';
  const nested = takesObject(model, object) ? `
/// T-5: a value of the class ${goClass} inside another type is the handle of an instance; the core takes a copy of its value.
fn in_${plain}(input: &mut &[u8], subject: &str) -> Result<${core}, Fail> {
    let held = held_${plain}(in_uint(input)?, subject)?;${object.lock === undefined ? `
    Ok(${core}::clone(&held))` : `
    let value = held.read(${rustString(goClass)}, &[]).map_err(binding_error)?;
    Ok(${core}::clone(&value))`}
}
` : '';
  return `
/// T-5: the value that an instance of ${goClass} holds${object.lock === undefined ? '' : ', in its lock (GN-6h)'}.
fn held_${plain}(handle: u64, subject: &str) -> Result<Arc<${heldType(object)}>, Fail> {
    held(&${tableName(object.unit)}, handle, subject, ${rustString(goClass)})
}

/// T-5: a value of ${goClass} leaves as the handle of a new instance, which Go makes around it.
fn out_${plain}(output: &mut Vec<u8>, value: ${core}) {
    out_uint(output, insert_held(&${tableName(object.unit)}, ${heldNew(object, 'value')}));
}

/// U-7, GN-15c: a value of ${goClass} that an out row of a value alias makes leaves as the number of the class and
/// the handle of a new instance, which the package of the class makes.
fn alias_out_${plain}(output: &mut Vec<u8>, value: ${core}) {
    output.push(10);
    out_uint(output, ${model.objects.indexOf(object)}u64);
    out_${plain}(output, value);
}
${nested}`;
}

function objectStatics(model: Model, object: ObjectClass): string {
  const goClass = classLabel(object);
  return `
/// T-5: the values of the instances of ${goClass}, each under the handle that its Go instance keeps.
static ${tableName(object.unit)}: Mutex<Table<${heldType(object)}>> = Mutex::new(Table::new());
${object.lock?.kind === 'shared' ? `
// GN-6h: calls read the value of ${goClass} at the same time, so its core type is Sync.
const _: () = {
    const fn sync<T: Sync>() {}
    sync::<${object.unit.core_type ?? ''}>();
};
` : ''}
/// T-5: releases the value of an instance of ${goClass} that the Go runtime found unreachable (runtime.AddCleanup).
#[no_mangle]
pub extern "C" fn ${releaseSymbol(model, object.unit)}(handle: u64) {
    let released = lock(&${tableName(object.unit)}).values.remove(&handle);
    drop(released);
}
`;
}

const TABLE = `
/// T-5: the values that the instances of a class hold, each under its handle. A call clones the Arc of the value it
/// reads, so no table is locked while the core runs.
struct Table<T> {
    values: BTreeMap<u64, Arc<T>>,
    next: u64,
}

impl<T> Table<T> {
    const fn new() -> Self {
        Self { values: BTreeMap::new(), next: 0 }
    }
}
`;

// N-4: the items of an iterate, which the core gives as an iterator or a collection; with faults, faultRust declares
// the same helper, which collects them inside with_faults.
const ITERATED = `
/// N-4: the items of an iterate, which the core gives as an iterator or a collection.
fn collected<I: IntoIterator>(items: I) -> Vec<I::Item> {
    items.into_iter().collect()
}
`;

// ---- entry points ----

function entry(model: Model, symbol: string, doc: string, lines: string[], feature?: string): string {
  // The arguments are read through a mutable slice, which an entry point without arguments does not need.
  const read = lines.some((l) => l.includes('&mut input'));
  const body = model.faults.length === 0
    ? `guard(|| {\n${read ? '        let mut input = input;\n' : ''}${lines.join('\n')}\n    })`
    : `guard(|| {\n        shielded(|| {\n${read ? '            let mut input = input;\n' : ''}${lines.map((l) => `    ${l}`).join('\n')}\n        })\n    })`;
  return `
/// ${doc}
///
/// # Safety
///
/// \`args\` points to \`len\` bytes that stay valid during the call, or is null with \`len\` 0, and \`result\` points to a
/// writable \`Buffer\` (B-8).${feature === undefined ? '' : `\n#[cfg(feature = "${feature}")]`}
#[no_mangle]
pub unsafe extern "C" fn ${symbol}(args: *const u8, len: usize, result: *mut Buffer) -> i32 {
    // SAFETY: the caller's contract above.
    let input = unsafe { arguments(args, len) };
    let outcome = ${body};
    // SAFETY: the caller's contract above.
    unsafe { respond(result, outcome) }
}
`;
}

// The lines that decode the receiver and the parameters of a member and take the locks of its places (GN-6h).
function argumentLines(model: Model, fn: Fn): string[] {
  const lines: string[] = [];
  if (fn.receiver !== undefined) {
    lines.push(`        let held = held_${plainName(fn.unit)}(in_uint(&mut input)?, "receiver")?;`);
    if (!locked(model, fn)) lines.push(`        let this: &${fn.unit.core_type ?? ''} = &held;`);
  }
  for (const parameter of fn.params) {
    const variable = rustField(parameter.name);
    const subject = rustString(goSubject(parameter.name));
    const object = heldParam(model, parameter.type);
    if (object !== undefined) {
      lines.push(`        let ${variable} = held_${plainName(object.unit)}(in_uint(&mut input)?, ${subject})?;`);
      continue;
    }
    const arg = fn.args.find((a: Arg) => !a.field && a.name === parameter.name);
    if (arg?.default !== undefined) {
      lines.push(`        let ${variable}: ${argType(model, arg)} = ${convertIn(model, { optional: parameter.type }, '&mut input', subject)}?;`);
    } else {
      lines.push(`        let ${variable}: ${rustType(model, parameter.type)} = ${convertIn(model, parameter.type, '&mut input', subject)}?;`);
    }
  }
  lines.push('        finish_input(input)?;');
  lines.push(...lockLines(model, fn, (p) => rustField(p.name), 'held', 'binding_error', classLabel));
  return lines;
}

// The core call of a member, the receiver first.
function coreCall(model: Model, fn: Fn): string {
  const args = coreCallArgs(model, fn, (p) => rustField(p.name), 'this');
  return `${fn.corePath}(${(fn.receiver === undefined || locked(model, fn) ? args : ['this', ...args.slice(1)]).join(', ')})`;
}

function functionRust(model: Model, fn: Fn): string {
  const lines = argumentLines(model, fn);
  const doc = `The C ABI of ${fn.corePath} (contract member ${fn.member.id}).`;
  if (fn.kind === 'iterate') {
    // N-4 iterate: the items, or the keys and values of the entries, converted when the iteration starts.
    const yields = fn.yields ?? { value: 'none' };
    const item = (type: Type, value: string): string => convertOut(model, type, borrowedItem(model, type, value));
    const call = armedCall(model, fn, coreCall(model, fn));
    lines.push(`        let items: Vec<_> = ${model.faults.length === 0 ? `collected(${call})` : call};`);
    lines.push('        let mut buffer = Vec::new();', '        let output = &mut buffer;', '        write_length(output, items.len());', '        for item in items {');
    if (yields.key === undefined) {
      lines.push(`            ${item(yields.value, 'item')};`);
    } else {
      lines.push('            let (key, value) = item;', `            ${item(yields.key, 'key')};`, `            ${item(yields.value, 'value')};`);
    }
    lines.push('        }', '        Ok(buffer)');
    return entry(model, cSymbol(model, fn), doc, lines);
  }
  // GN-6ab: the call of the C ABI drives the state machine of the core on its thread, and waits for each of its futures.
  const call = fn.machine === true ? drivenCall(model, fn, coreCall(model, fn), (wait) => wait, 'binding_error') : armedCall(model, fn, coreCall(model, fn));
  if (fn.fallible) {
    lines.push(`        ${resultLet(fn)} = match ${call} {\n            Ok(value) => value,\n            Err(error) => return Err(${fn.failure ? 'failure_error' : 'core_error'}(error)),\n        };`);
  } else {
    lines.push(`        ${resultLet(fn)} = ${call};`);
  }
  if (fn.returns === 'none') {
    lines.push('        Ok(Vec::new())');
  } else if (fn.returns === 'never') {
    // T-2 never: the core's Infallible has no value, so the call has failed before.
    lines.push('        match result {}');
  } else {
    lines.push('        let mut buffer = Vec::new();', '        let output = &mut buffer;', `        ${convertOut(model, fn.returns, 'result')};`, '        Ok(buffer)');
  }
  return entry(model, cSymbol(model, fn), doc, lines);
}

// ---- callbacks (U-3) ----

// T-1: the type of a trait method parameter: a type with two forms is borrowed, a Copy type by value.
function traitParam(model: Model, type: Type): string {
  if (typeof type === 'string') {
    const borrowed: Record<string, string> = { text: '&str', latin1: '&[u8]', bytes: '&[u8]', source: '&[u8]', path: '&std::path::Path' };
    return borrowed[type] ?? rustType(model, type);
  }
  if ('optional' in type && typeof type.optional === 'string' && ['text', 'latin1', 'bytes'].includes(type.optional)) return `Option<${traitParam(model, type.optional)}>`;
  if ('list' in type) return `&[${rustType(model, type.list)}]`;
  if (typeof type === 'object' && 'unit' in type && unitOf(model, type)?.kind === 'enum') return rustType(model, type);
  return `&${rustType(model, type)}`;
}

// U-3: a callback is a struct that names the Go object of the call that received it (the call and the index of the
// callback in it) and implements the core trait; each member calls into Go, which runs the method of the object.
function callbackRust(model: Model, cb: CallbackUnit, index: number): string {
  const plain = plainName(cb.unit);
  const struct = rustType(model, { unit: cb.unit.id });
  const goType = goName(cb.unit.name);
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  const methods = cb.members.map((m, memberIndex) => {
    const method = langName('go', m.member.name, 'callable');
    const params = m.params.map((p) => `, ${rustField(p.name)}: ${traitParam(model, p.type)}`).join('');
    const result = m.returns === 'none' ? '()' : rustType(model, m.returns);
    const writes = m.params.map((p) => `            ${convertOut(model, p.type, rustField(p.name))};`);
    const decode = m.returns === 'none'
      ? '            finish_input(&bytes)?;\n            Ok(())'
      : `            let mut input: &[u8] = &bytes;\n            let value: ${result} = ${convertIn(model, m.returns, '&mut input', rustString(`${goType}.${method}() returns`))}?;\n            finish_input(input)?;\n            Ok(value)`;
    return `
    fn ${rustField(m.member.name)}(${m.receiver}${params}) -> Result<${result}, ${failure}> {${cb.owner ? `
        if std::thread::current().id() != self.owner {
            return Err(thrown(Thrown::Binding(binding_error(BindingError::WrongThread { subject: String::from(${rustString(`${goType}.${method}()`)}) }))).into());
        }` : ''}
        let ${m.params.length === 0 ? '' : 'mut '}args = Vec::new();${m.params.length === 0 ? '' : `
        {
            let output = &mut args;
${writes.join('\n')}
        }`}
        let (status, bytes) = go_callback(self.call, self.callback, ${memberIndex}, &args);${m.recognized === undefined ? '' : `
        if status == 2 {
            return Err(${recognizedFn(cb, m)}(self.call, &bytes));
        }`}
        if status != 0 {
            return Err(raised_by_go(self.call, &bytes).into());
        }
        let read = || -> Result<${result}, Fail> {
${decode}
        };
        read().map_err(|fail| thrown(Thrown::Binding(fail)).into())
    }`;
  }).join('\n');
  void index;
  const recognizing = cb.members.filter((m) => m.recognized !== undefined).map((m) => `
/// U-3: an error of ${m.member.id} that it recognizes, which Go gave with its index, its kind and its message: a kind of
/// the unit is the core error of the kind (GN-6d); any other goes back to the caller as the same error.
fn ${recognizedFn(cb, m)}(call: u64, bytes: &[u8]) -> ${failure} {
    let mut input = bytes;
    let mut read = || -> Result<(u64, String, String), Fail> {
        let index = in_uint(&mut input)?;
        let kind = in_text(&mut input, "U-3: the kind of a recognized error")?;
        let message = in_text(&mut input, "U-3: the message of a recognized error")?;
        finish_input(input)?;
        Ok((index, kind, message))
    };
    let (index, kind, message) = match read() {
        Ok(read) => read,
        Err(fail) => return thrown(Thrown::Binding(fail)).into(),
    };
    let core = ${recognizedMatch(m, '    ')};
    match core {
        Some(core) => binding_core::Failure::Kind(core),
        None => thrown(Thrown::Go { call, index }).into(),
    }
}
`).join('');
  return `
/// U-3: ${goType}, a callback that Go code implements; the core calls it through ${cb.unit.core ?? ''}.
struct ${struct} {
    call: u64,
    callback: u64,${cb.owner ? '\n    owner: std::thread::ThreadId,' : ''}
}

/// U-3: a callback enters as the call and the index of the Go object in it; a nil interface is kind invalid_callback.
fn in_${plain}(input: &mut &[u8], subject: &str) -> Result<${struct}, Fail> {
    if !read_tag(input)? {
        return Err(binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::new() }));
    }
    let call = in_uint(input)?;
    let callback = in_uint(input)?;
    Ok(${struct} { call, callback${cb.owner ? ', owner: std::thread::current().id()' : ''} })
}

impl ${cb.unit.core ?? ''} for ${struct} {${methods}
}
${recognizing}`;
}

// U-3, U-7: the calls into Go, the errors that Go code returned in a callback and the walk of a Go value.
function callBackRust(model: Model): string {
  const failing = [...model.functions, ...model.objects.flatMap((o) => o.members)].some((fn) => fn.failure) || model.aliases.some((a) => a.library === undefined);
  const p = prefix(model);
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  const failureFn = failing ? `
/// E-1c: the failure of a core that calls back.
fn failure_error(failure: ${failure}) -> Fail {
    match failure {
        binding_core::Failure::Kind(error) => core_error(error),
        binding_core::Failure::Raised(raised) => ${callsBack(model) ? 'raised_fail(&raised)' : 'binding_error(BindingError::Internal { detail: raised.to_string() })'},
        binding_core::Failure::Callback(error) => binding_error(BindingError::Internal { detail: error.to_string() }),
    }
}
` : '';
  if (!callsBack(model)) return failureFn;
  const hosts = model.aliases.length === 0 ? '' : `
/// U-7: the walk of a Go value of a call, which package binding describes one level at a time (B-1).
struct GoHost {
    call: u64,
}

impl GoHost {
    /// The descriptions that Go gives for a question: the item of a list (op 0) or the key and the value of an entry
    /// of a map (op 1).
    fn ask(&self, op: u32, handle: Handle, index: u64, count: usize) -> Result<Vec<HostValue>, Raised> {
        let mut buffer = Buffer { ptr: std::ptr::null_mut(), len: 0, cap: 0 };
        // SAFETY: the call is alive while the entry point that named it runs, and the buffer is writable.
        let status = unsafe { ${p}__go_host(self.call, op, handle.raw(), index, &mut buffer) };
        let bytes = taken(buffer);
        let read = || -> Result<Vec<HostValue>, Fail> {
            if status != 0 {
                return Err(malformed());
            }
            let mut input: &[u8] = &bytes;
            let mut values = Vec::new();
            for _ in 0..count {
                values.push(read_host(&mut input)?);
            }
            finish_input(input)?;
            Ok(values)
        };
        read().map_err(|fail| thrown(Thrown::Binding(fail)))
    }
}

impl HostValues for GoHost {
    fn item(&mut self, list: Handle, index: u64) -> Result<HostValue, Raised> {
        let mut values = self.ask(0, list, index, 1)?;
        values.pop().ok_or_else(|| thrown(Thrown::Binding(malformed())))
    }

    fn entry(&mut self, map: Handle, index: u64) -> Result<(HostValue, HostValue), Raised> {
        let mut values = self.ask(1, map, index, 2)?;
        match (values.pop(), values.pop()) {
            (Some(value), Some(key)) => Ok((key, value)),
            _ => Err(thrown(Thrown::Binding(malformed()))),
        }
    }

    fn read(&mut self, _value: Handle) -> Result<HostValue, Raised> {
        Err(thrown(Thrown::Binding(binding_error(BindingError::Internal { detail: String::from("U-1: Go gives no value of a value class") }))))
    }
}
`;
  const callbackCall = model.callbacks.length === 0 ? '' : `
/// U-3: calls the member of a Go callback with the encoded arguments: 0 and the encoded result, or 1 and the index of
/// the error that the Go method returned.
fn go_callback(call: u64, callback: u64, member: u32, args: &[u8]) -> (i32, Vec<u8>) {
    let mut buffer = Buffer { ptr: std::ptr::null_mut(), len: 0, cap: 0 };
    // SAFETY: the call is alive while the entry point that named it runs, args is a slice and the buffer is writable.
    let status = unsafe { ${p}__go_callback(call, callback, member, args.as_ptr(), args.len(), &mut buffer) };
    (status, taken(buffer))
}

/// U-3: the error that a Go method returned, kept by Go in its call under the index that the bytes give.
fn raised_by_go(call: u64, bytes: &[u8]) -> Raised {
    let mut input = bytes;
    match in_uint(&mut input).and_then(|index| finish_input(input).map(|()| index)) {
        Ok(index) => thrown(Thrown::Go { call, index }),
        Err(fail) => thrown(Thrown::Binding(fail)),
    }
}
`;
  return `
extern "C" {${model.callbacks.length === 0 ? '' : `
    /// U-3: the function that package binding exports to run a member of a Go callback.
    fn ${p}__go_callback(call: u64, callback: u64, member: u32, args: *const u8, len: usize, result: *mut Buffer) -> i32;`}${model.aliases.length === 0 ? '' : `
    /// U-7: the function that package binding exports to describe a child of a Go value.
    fn ${p}__go_host(call: u64, op: u32, handle: u64, index: u64, result: *mut Buffer) -> i32;`}
}

/// U-3, U-7: gives Go a buffer of \`len\` bytes, which Go fills with the answer of a call back and this crate takes back.
///
/// # Safety
///
/// \`result\` points to a writable \`Buffer\`.
#[no_mangle]
pub unsafe extern "C" fn ${p}__alloc(len: usize, result: *mut Buffer) {
    let mut bytes = ManuallyDrop::new(vec![0_u8; len]);
    let buffer = Buffer { ptr: bytes.as_mut_ptr(), len: bytes.len(), cap: bytes.capacity() };
    // SAFETY: the caller's contract above.
    unsafe { result.write(buffer) };
}

/// U-3: what went wrong in a call back into Go: the error that a Go method returned, which the call keeps, or a
/// failure of the binding there; the core carries it as a Raised.
enum Thrown {${model.callbacks.length === 0 ? '' : `
    Go { call: u64, index: u64 },`}
    Binding(Fail),
}

static THROWN: Mutex<BTreeMap<u64, Thrown>> = Mutex::new(BTreeMap::new());

static NEXT_THROWN: AtomicU64 = AtomicU64::new(1);

fn thrown(error: Thrown) -> Raised {
    let handle = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    lock(&THROWN).insert(handle, error);
    Raised::from_generated(Handle::new(handle))
}

/// U-3: the failure of a Raised: the Go error, which the caller gets back unchanged, or the failure of the binding.
fn raised_fail(raised: &Raised) -> Fail {
    match lock(&THROWN).remove(&raised.handle().raw()) {
${model.callbacks.length === 0 ? '' : `        Some(Thrown::Go { call, index }) => Fail { raised: Some((call, index)), ..binding_error(BindingError::Internal { detail: String::from("U-3: the error of a callback") }) },
`}        Some(Thrown::Binding(fail)) => fail,
        None => binding_error(BindingError::Internal { detail: String::from("U-3: the error of the callback is gone") }),
    }
}

${failureFn}${hosts}${callbackCall}`;
}

// ---- value aliases (U-7) ----

// The Go form of a built-in make form, written from the content of the matched OutValue (the nodes of package binding:
// 0 nil, 1 bool, 2 int64, 3 float64, 4 string, 5 []byte, 6 []any, 7 map[string]any, 8 a container made before, 9
// *KeyedMap[any], 255 no Go form).
function goBuiltin(alias: ValueAlias, form: string, kind: string): string {
  switch (form) {
    case 'null':
      return 'output.push(0)';
    case 'bool':
      return '{\n            output.push(1);\n            out_bool(output, value);\n        }';
    case 'int':
      if (kind === 'int') return '{\n            output.push(2);\n            out_int(output, value.value());\n        }';
      if (kind === 'int64') return '{\n            output.push(2);\n            out_int(output, value);\n        }';
      break;
    case 'float':
      if (kind === 'float') return '{\n            output.push(3);\n            out_float(output, value.value());\n        }';
      if (kind === 'int' || kind === 'int64' || kind === 'number') {
        const text = kind === 'int' ? 'value.value().to_string()' : kind === 'int64' ? 'value.to_string()' : 'value';
        // An integer as the nearest double, by its decimal text: R-1 refuses an as conversion.
        return `match ${text}.parse::<f64>() {
            Ok(float) => {
                output.push(3);
                out_float(output, float);
            }
            Err(_never) => out_no_form(output, "U-7: an integer that is no number"),
        }`;
      }
      break;
    case 'text':
      if (kind === 'text') return '{\n            output.push(4);\n            out_text(output, value);\n        }';
      if (kind === 'bytes') {
        return `match std::str::from_utf8(value.value()) {
            Ok(text) => {
                output.push(4);
                out_text(output, text);
            }
            Err(_bytes) => out_no_form(output, "U-7: text of bytes that are not UTF-8"),
        }`;
      }
      break;
    case 'bytes':
      if (kind === 'bytes') return '{\n            output.push(5);\n            out_bytes(output, value.value());\n        }';
      if (kind === 'text') return '{\n            output.push(5);\n            out_bytes(output, value.as_bytes());\n        }';
      break;
    case 'list': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head}
            if let Some(index) = made.get(&handle.raw()) {
                output.push(8);
                write_length(output, *index);
                return;
            }
            made.insert(handle.raw(), made.len());
            output.push(6);
            out_uint(output, len);
            for index in 0..len {
                let item = ${parts.item};
                make(output, item, source, made);
            }
        }`;
    }
    case 'map':
    case 'keyed_map': {
      const parts = container(alias, kind, form);
      return `{
            ${parts.head}
            if let Some(index) = made.get(&handle.raw()) {
                output.push(8);
                write_length(output, *index);
                return;
            }
            made.insert(handle.raw(), made.len());
            output.push(${form === 'map' ? 7 : 9});
            out_uint(output, len);
            for index in 0..len {
                let (key, item) = ${parts.entry};
                make(output, key, source, made);
                make(output, item, source, made);
            }
        }`;
    }
    default:
      break;
  }
  throw new Unsupported(`${alias.unit.id}: the Go form ${form} of the kind ${kind} is not generated yet`);
}

// U-7, GN-15c: the classes whose instances the Go out rows of a value alias make by a member.
export function aliasInstances(model: Model, alias: ValueAlias): ObjectClass[] {
  const makes = new Set((alias.unit.out ?? []).map((row) => row.make['go']).filter((make): make is string => typeof make === 'string' && make.includes('.')));
  return model.objects.filter((o) => o.members.some((fn) => makes.has(fn.member.id)));
}

function aliasRust(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  // U-7, GN-15c: a Go value leaves the core as a value of a built-in form, or as an instance that a member makes.
  const arms = outArms(model, alias, 'go', (form, kind) => goBuiltin(alias, form, kind), 'out_no_form(output, "U-7: no out row takes the value")', 'output, ', 'alias_out_');
  return `
/// U-7: a Go value of the alias ${alias.unit.id} enters as the call that walks it and its first level, which the core judges.
fn in_${name}(input: &mut &[u8]) -> Result<${core}, Fail> {
    let call = in_uint(input)?;
    let described = read_host(input)?;
    let mut host = GoHost { call };
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// U-7: a core value of the alias ${alias.unit.id} leaves as the nodes of the Go values of its out rows.
fn out_${name}(output: &mut Vec<u8>, value: impl Borrow<${core}>) {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    let mut made = BTreeMap::new();
    make_${name}(output, root, &mut source, &mut made);
}

/// U-7: one value of the alias and its children; a container that the core gave before is the same Go value.
fn make_${name}(output: &mut Vec<u8>, out: OutValue, source: &mut dyn OutValues, made: &mut BTreeMap<u64, usize>) {
    let make = make_${name};
    match out.clone() {
${arms.join('\n')}
        other => out_no_form(output, &format!("U-7: no out row of the kind {}", other.kind().as_str())),
    }
}
`;
}

// U-7 (a'): the failure of the in of a value alias of another repository, in the class of its category here.
function foreignFailureRust(model: Model): string {
  return foreignAliasLibraries(model).map((alias) => {
    const library = (alias.library ?? '').replaceAll('-', '_');
    const error = alias.error ?? { path: '', kinds: [] };
    const variant = (category: string): string => `Category::${category.charAt(0).toUpperCase()}${category.slice(1)}`;
    const arms = error.kinds.map((k) => `        ${variantPattern(k.variant)} => ${variant(k.category)},`).join('\n');
    return `
/// U-7 (a'): a kind of ${alias.library ?? ''} in the category that its E-1 gives it.
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn ${library}_error(error: ${error.path}) -> Fail {
    let category: Category = match ${errorMatched({ codeOf: error.code }, 'error')} {
${arms}
    };
    Fail { category, message: error.to_string(), kind: Kinds::kind(&error), status: Kinds::status(&error), errno: Kinds::errno(&error), class: 0, properties: Vec::new(), raised: None }
}

fn ${library}_failure_error(failure: binding_core::Failure<${error.path}>) -> Fail {
    match failure {
        binding_core::Failure::Kind(error) => ${library}_error(error),
        binding_core::Failure::Raised(raised) => raised_fail(&raised),
        binding_core::Failure::Callback(error) => binding_error(BindingError::Internal { detail: error.to_string() }),
    }
}
`;
  }).join('');
}

// ---- errors ----

function coreErrorRust(model: Model): string {
  if (model.coreError === undefined) return '';
  const variant = (category: string): string => `Category::${category.charAt(0).toUpperCase()}${category.slice(1)}`;
  const arms = model.kinds.map((k) => `        ${variantPattern(k.variant)} => ${variant(k.category)},`).join('\n');
  const hasUnits = model.kinds.some((k) => k.unit !== undefined);
  const hasProperties = model.kinds.some((k) => k.unit !== undefined && errorProperties(k.unit).length > 0);
  // E-2, I-3: the class of the kind, 1 + the index of its error unit or 0 for its category, and the properties of the
  // unit and its parents, read from the core error by a second match without a wildcard.
  const classArms = model.kinds.map((k) => {
    if (k.unit === undefined) return `        ${variantPattern(k.variant)} => 0,`;
    const index = model.errorUnits.indexOf(k.unit) + 1;
    const properties = errorProperties(k.unit);
    if (properties.length === 0) return `        ${variantPattern(k.variant)} => ${index},`;
    return `        ${variantPattern(k.variant)} => {
            let output = &mut properties;
${properties.map(({ property }) => `            ${convertOut(model, property.returns, propertyValue(property, '&error', (failure) => `core_error(${failure})`))};`).join('\n')}
            ${index}
        }`;
  }).join('\n');
  const classLines = !hasUnits ? '    let class: u8 = 0;\n    let properties = Vec::new();' : `    ${hasProperties ? 'let mut properties = Vec::new();' : 'let properties = Vec::new();'}
    let class: u8 = match ${errorMatched(model, 'error')} {
${classArms}
    };`;
  return `
/// I-2 (3): the category and the class of each variant of the core error, by a match without a wildcard. The pattern
/// \`{ .. }\` matches a variant with or without data, which the generator does not see (I-2: binding reads no Rust
/// source).
#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
fn core_error(error: ${model.coreError}) -> Fail {
    let category: Category = match ${errorMatched(model, 'error')} {
${arms}
    };
${classLines}
    Fail { category, message: error.to_string(), kind: Kinds::kind(&error), status: Kinds::status(&error), errno: Kinds::errno(&error), class, properties, raised: None }
}
`;
}

// ---- test entry points ----

// GW-4, T-2: the conversions that the test entry points of the feature codec-test send back unchanged, for the
// round-trip tests: latin1 when the contract takes and gives it, map<text> when it takes and gives a map of text.
export interface Echoes {
  latin1: boolean;
  map: boolean;
  keyed: boolean;
}

export function echoes(model: Model): Echoes {
  const used = rustUsed(model);
  const has = (...names: string[]): boolean => names.every((name) => new RegExp(`\\bfn ${name}\\b`).test(used));
  return {
    latin1: has('in_latin1', 'out_latin1'),
    map: has('in_map', 'out_map', 'in_text', 'out_text'),
    keyed: has('in_keyed_map', 'out_keyed_map', 'in_text', 'out_text'),
  };
}

function testEntries(model: Model): string {
  const p = prefix(model);
  const echo = echoes(model);
  const echoEntry = (name: string, read: string, write: string): string =>
    entry(model, `${p}__echo_${name}`, 'GW-4, T-2: a test entry point that gives back the value it takes, through the conversions of the binding.', [
      `        let value = ${read};`,
      '        finish_input(input)?;',
      '        let mut buffer = Vec::new();',
      `        ${write};`,
      '        Ok(buffer)',
    ], 'codec-test');
  const out: string[] = [];
  if (echo.latin1) out.push(echoEntry('latin1', 'in_latin1(&mut input, "value")?', 'out_latin1(&mut buffer, &value)'));
  if (echo.map) out.push(echoEntry('map', 'in_map(&mut input, "value", |input| in_text(input, "value"))?', 'out_map(&mut buffer, &value, |output, item| out_text(output, item))'));
  if (echo.keyed) out.push(echoEntry('keyed_map', 'in_keyed_map(&mut input, "value", &[0, 1, 2], "a key", |input| in_text(input, "value"))?', 'out_keyed_map(&mut buffer, &value, |output, item| out_text(output, item))'));
  // U-7: the in function of a value alias with in_raises alone.
  for (const alias of aliasesWithKinds(model).filter((a) => a.library === undefined)) {
    out.push(entry(model, `${p}__alias_in_${aliasFn(alias)}`, `U-7: runs the in function of the alias ${alias.unit.id} alone, for the tests of its kinds.`, [
      `        let _value: ${alias.unit.core_type ?? ''} = in_${aliasFn(alias)}(&mut input)?;`,
      '        finish_input(input)?;',
      '        Ok(Vec::new())',
    ], 'codec-test'));
  }
  out.push(entry(model, `${p}__panic_test`, 'B-7: the entry point of the generated panic test.', ['        finish_input(input)?;', '        panic!("panic-test")'], 'panic-test'));
  // GN-5, GN-6h: the poison entry point of the B-5c test: a panic while the write guard of the instance is held.
  const written = model.objects.map((o, index) => ({ o, index })).filter(({ o }) => poisoned(model, o));
  if (written.length > 0) {
    const arms = written.map(({ o, index }) => `            ${index} => {
                let held = held_${plainName(o.unit)}(handle, "held")?;
                let _guard = held.write(${rustString(classLabel(o))}).map_err(binding_error)?;
                panic!("panic-test");
            }`).join('\n');
    out.push(entry(model, `${p}__panic_test_held`, 'B-5c: the entry point of the generated poison test, which panics while it holds the write guard of an instance.', [
      '        let class = in_uint(&mut input)?;',
      '        let handle = in_uint(&mut input)?;',
      '        finish_input(input)?;',
      `        match class {\n${arms}\n            _ => Err(binding_error(BindingError::Internal { detail: String::from("B-5c: no class with a write place has this index") })),\n        }`,
    ], 'panic-test'));
  }
  if (model.faults.length > 0) {
    out.push(entry(model, `${p}__arm_faults`, 'G-5: arms the faults of a case for the next call of the member on this thread, and gives the id of the arming.', [
      '        let member = in_text(&mut input, "member")?;',
      '        let faults = in_text(&mut input, "faults")?;',
      '        finish_input(input)?;',
      '        let id: u64 = binding_core::fault::arm(&member, &faults).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;',
      '        let mut buffer = Vec::new();',
      '        out_uint(&mut buffer, id);',
      '        Ok(buffer)',
    ], 'fault-test'));
    out.push(entry(model, `${p}__fault_left`, 'G-5: the points of an arming whose fault did not fire.', [
      '        let id = in_uint(&mut input)?;',
      '        finish_input(input)?;',
      '        let left = binding_core::fault::left(id).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;',
      '        let mut buffer = Vec::new();',
      '        out_list(&mut buffer, left, out_text);',
      '        Ok(buffer)',
    ], 'fault-test'));
  }
  return out.join('');
}

// ---- the crate ----

function entries(model: Model): string {
  return [
    ...model.functions.map((fn) => functionRust(model, fn)),
    ...model.objects.flatMap((o) => o.members.map((fn) => functionRust(model, fn))),
  ].join('');
}

// The Rust helpers that the contract's functions use.
function rustUsed(model: Model): string {
  const code = `${entries(model)}${model.callbacks.map((c, i) => callbackRust(model, c, i)).join('')}${callBackRust(model)}${coreErrorRust(model)}${foreignFailureRust(model)}`;
  const units = [
    ...model.enums.map(enumRust),
    ...model.records.map((u) => recordRust(model, u)),
    ...model.foreignRecords.map((r) => recordRust(model, r.unit, r.library)),
    ...model.objects.map((o) => objectHelpers(model, o)),
    ...model.aliases.map((a) => aliasRust(model, a)),
  ].join('\n');
  return usedHelpers(`${RUST_HELPERS}\n${WIDEN}\n${DRIVEN}\n${units}\n${tupleReaders(model)}`, `${code}${testEntryUses(model)}`);
}

// T-2, GN-16: a reader of a tuple of each arity of the model, its parts in order; the helpers that no conversion
// names are left out.
function tupleReaders(model: Model): string {
  const arities = new Set<number>();
  const visit = (type: Type): void => {
    if (typeof type === 'string') return;
    if ('tuple' in type) {
      arities.add(type.tuple.length);
      type.tuple.forEach(visit);
      return;
    }
    for (const key of ['list', 'optional', 'map', 'keyed_map'] as const) if (key in type) visit((type as Record<string, Type>)[key] as Type);
  };
  for (const fn of [...model.functions, ...model.objects.flatMap((o) => o.members)]) fn.params.forEach((p) => visit(p.type));
  for (const unit of model.records) for (const f of unit.fields ?? []) visit(f.type);
  for (const cb of model.callbacks) for (const m of cb.members) visit(m.returns);
  return [...arities].sort((a, b) => a - b).map((n) => {
    const names = Array.from({ length: n }, (_, i) => `T${i}`);
    return `/// T-2, GN-16: a tuple of ${n} parts, read in order.
fn in_tuple${n}<'a, ${names.join(', ')}>(
    input: &mut &'a [u8],
${names.map((t, i) => `    part${i}: impl FnOnce(&mut &'a [u8]) -> Result<${t}, Fail>,`).join('\n')}
) -> Result<(${names.join(', ')}${n === 1 ? ',' : ''}), Fail> {
    Ok((${names.map((_, i) => `part${i}(input)?`).join(', ')}${n === 1 ? ',' : ''}))
}`;
  }).join('\n\n');
}

// The helpers that the test entry points use, which count as uses, as the entry points compile with their features.
const testEntryUses = (model: Model): string =>
  `${model.objects.some((o) => poisoned(model, o)) ? 'in_uint' : ''} ${model.faults.length > 0 ? 'in_uint out_uint in_text out_text out_list' : ''} ${aliasesWithKinds(model).filter((a) => a.library === undefined).map((a) => `in_${aliasFn(a)}`).join(' ')}`;

export function libRust(model: Model): string {
  const constants = model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n') + defaultAsserts(model);
  const functions = entries(model);
  const callbacks = model.callbacks.map((c, i) => callbackRust(model, c, i)).join('');
  const used = rustUsed(model);
  const all = `${used}${functions}${callbacks}${callBackRust(model)}${coreErrorRust(model)}`;
  const categoryIndex = goErrorTypes(model.contract).map(([category], i) => `        Category::${category.charAt(0).toUpperCase()}${category.slice(1)} => ${i},`).join('\n');
  const usesMutex = model.objects.length > 0 || callsBack(model);
  const usesMap = model.objects.length > 0 || callsBack(model);
  const hostTypes = ['Handle', 'HostText', 'HostValue', 'HostValues', 'OutValue', 'OutValues', 'Predicate', 'Raised'].filter((t) => new RegExp(`\\b${t}\\b`).test(all));
  return `${header('//')}
// The C ABI of the Go binding of ${model.contract.library} (B-8). Each function takes the encoded arguments, which the
// Go package writes, judges them as it decodes them (T-8), calls the core and gives back the encoded result or failure
// in a buffer that Go copies and frees with ${prefix(model)}__free.

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(all) ? ', NumberType' : ''}${/\bTextCause\b/.test(all) ? ', TextCause' : ''}${hostTypes.map((t) => `, ${t}`).join('')}};
${/Borrow</.test(all) ? 'use std::borrow::Borrow;\n' : ''}${usesMap ? 'use std::collections::BTreeMap;\n' : ''}use std::mem::ManuallyDrop;
use std::panic::{catch_unwind, AssertUnwindSafe};
${model.objects.length > 0 ? 'use std::sync::Arc;\n' : ''}${model.callbacks.length > 0 || model.aliases.length > 0 ? 'use std::sync::atomic::{AtomicU64, Ordering};\n' : ''}${usesMutex ? 'use std::sync::{Mutex, MutexGuard};\n' : ''}
// U-5: the constants of the contract are the constants of the core.
${constants}

// The encoding writes a length as the eight bytes of a usize; every target of T-2 has a 64-bit usize.
const _: () = assert!(size_of::<usize>() == 8);

/// A buffer that Rust allocated: the encoded result or failure of a call, which Go copies and then frees (B-8).
#[repr(C)]
pub struct Buffer {
    ptr: *mut u8,
    len: usize,
    cap: usize,
}

/// A failure on its way to Go: the category, the message, the kind, the status and the errno (E-7), the class of
/// the kind (0 for the class of the category, or 1 + the index of its error unit, E-2) with the encoded properties of
/// the unit (I-3), and the call and the index of the error that a Go callback returned (U-3).
struct Fail {
    category: Category,
    message: String,
    kind: &'static str,
    status: Option<u16>,
    errno: Option<i32>,
    class: u8,
    properties: Vec<u8>,
    raised: Option<(u64, u64)>,
}

/// E-1a: an error that the binding raises itself, of its fixed category.
fn binding_error(error: BindingError) -> Fail {
    Fail { category: error.category(), message: error.to_string(), kind: error.kind(), status: error.status(), errno: error.errno(), class: 0, properties: Vec::new(), raised: None }
}
${coreErrorRust(model)}${raisesAssertions(model)}${aliasKindsRust(model)}
/// B-7, B-8: a panic of the call reaches Go as kind internal and never crosses the C ABI.
fn guard(body: impl FnOnce() -> Result<Vec<u8>, Fail>) -> Result<Vec<u8>, Fail> {
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

/// The argument buffer of Go.
///
/// # Safety
///
/// \`args\` points to \`len\` bytes that stay valid during the call, or is null.
unsafe fn arguments<'a>(args: *const u8, len: usize) -> &'a [u8] {
    if args.is_null() {
        &[]
    } else {
        // SAFETY: the caller's contract above.
        unsafe { std::slice::from_raw_parts(args, len) }
    }
}

/// The encoded failure: the category (its index in E-1), the message, the kind, the status, the errno, the class with
/// the properties, and the error of a callback.
fn encode_fail(fail: Fail) -> Vec<u8> {
    let category: u8 = match fail.category {
${categoryIndex}
    };
    let mut output = vec![category];
    for text in [fail.message.as_bytes(), fail.kind.as_bytes()] {
        output.extend_from_slice(&text.len().to_le_bytes());
        output.extend_from_slice(text);
    }
    match fail.status {
        Some(status) => {
            output.push(1);
            output.extend_from_slice(&u64::from(status).to_le_bytes());
        }
        None => output.push(0),
    }
    match fail.errno {
        Some(errno) => {
            output.push(1);
            output.extend_from_slice(&i64::from(errno).to_le_bytes());
        }
        None => output.push(0),
    }
    output.push(fail.class);
    output.extend_from_slice(&fail.properties.len().to_le_bytes());
    output.extend_from_slice(&fail.properties);
    match fail.raised {
        Some((call, index)) => {
            output.push(1);
            output.extend_from_slice(&call.to_le_bytes());
            output.extend_from_slice(&index.to_le_bytes());
        }
        None => output.push(0),
    }
    output
}

/// Writes the result or the failure into Go's result buffer: 0 for a result, 1 for a failure.
///
/// # Safety
///
/// \`result\` points to a writable \`Buffer\`.
unsafe fn respond(result: *mut Buffer, outcome: Result<Vec<u8>, Fail>) -> i32 {
    let (status, bytes) = match outcome {
        Ok(bytes) => (0, bytes),
        Err(fail) => (1, encode_fail(fail)),
    };
    let mut bytes = ManuallyDrop::new(bytes);
    let buffer = Buffer { ptr: bytes.as_mut_ptr(), len: bytes.len(), cap: bytes.capacity() };
    // SAFETY: the caller's contract above.
    unsafe { result.write(buffer) };
    status
}

/// Frees a buffer that a call gave to Go.
///
/// # Safety
///
/// \`buffer\` is a buffer that a function of this library wrote, freed once.
#[no_mangle]
pub unsafe extern "C" fn ${prefix(model)}__free(buffer: Buffer) {
    if !buffer.ptr.is_null() {
        // SAFETY: the buffer is the parts of a Vec<u8> that respond gave away (the caller's contract above).
        drop(unsafe { Vec::from_raw_parts(buffer.ptr, buffer.len, buffer.cap) });
    }
}
${model.objects.length > 0 ? TABLE : ''}${model.objects.map((o) => objectStatics(model, o)).join('')}${faultRust(model)}${model.faults.length === 0 && model.objects.some((o) => o.members.some((m) => m.kind === 'iterate')) ? ITERATED : ''}${callBackRust(model)}${foreignFailureRust(model)}${used}${callbacks}${functions}${testEntries(model)}`;
}
