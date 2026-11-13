// The Rust crate of the C ABI of the Go binding (B-8): each entry point takes the encoded arguments, which the Go
// package writes, judges them as it decodes them (T-8), calls the core and gives back the encoded result or failure in
// a buffer that Go copies and frees. A class unit keeps the core values of its instances in a table of handles (T-5),
// a callback (U-3) and the walk of a value alias (U-7) call back into Go through the functions that package binding
// exports, and the test features add the entry points of the generated tests (GN-5).

import type { Name, Type, Unit } from '../contract.ts';
import { variantPattern } from '../contract.ts';
import { defaultAsserts } from './defaults.ts';
import { goErrorTypes, goName, goSubject } from './go.ts';
import {
  type Arg, type CallbackUnit, type Fn, type Model, type ObjectClass, type ValueAlias, Unsupported, aliasFailureFn, aliasFn, aliasKindsRust, aliasOf, aliasesWithKinds, argType, boxed, armedCall, borrowedItem, coreCallArgs, errorProperties, propertyValue, faultRust, foreignAliasLibraries, heldNew, heldParam, heldType, langName, libraryOf, lockLines, narrowed, narrows, nativeRoundTrip, objectUnit, pointed, poisoned, recordFn, resultLet, rustField, rustType, rustVariant, takesObject, unitOf, cleanupAsserts, cleanupMade, DRIVEN, drivenCall, waitsAsync, machineFunction, unitFn, libraryBlocks, type KeptClass, type KeptField,
  type Variant, caseFields, caseRead, caseStruct, caseType, caseValue, caseWritten, UNIT_CASE_ALLOW,
  errorMatched,
  recognizedFn,
  recognizedMatch,
  interfaceOf, implementorsOf,
} from './model.ts';
import { extensionName } from './packages.ts';
import { raisesAssertions } from './raises.ts';
import { type ValueRead, container, outArms, valueReads } from './alias_shared.ts';
import { classMakes } from './value_class.ts';
import { header, closure, optionRef, rustString, usedHelpers, INTO_CORE, PARTS, WIDEN, CORE_FORM } from './text.ts';

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

// GN-6ae: whether a member takes a function parameter or returns passthrough, and whether a model has such a member.
const passesFn = (fn: Fn): boolean => fn.params.some((p) => machineFunction(p.type)) || (typeof fn.returns === 'object' && 'passthrough' in fn.returns);
export const passes = (model: Model): boolean => [...model.functions, ...model.objects.flatMap((o) => o.members)].some(passesFn);

// Whether the core runs Go code through the trampoline of the callbacks: a callback unit (U-3), or a func (GN-6ae).
export const runsGo = (model: Model): boolean => model.callbacks.length > 0 || passes(model);

// Whether the model calls back into Go: Go code that the core runs, or the walk of a value alias.
export const callsBack = (model: Model): boolean => runsGo(model) || model.aliases.length > 0;

// ---- conversions ----

export function convertIn(model: Model, type: Type, input: string, subject: string): string {
  if (typeof type === 'string') {
    if (type === 'text') return `text_in(${input}, ${subject})`;
    if (type === 'latin1') return `latin1_in(${input}, ${subject})`;
    if (type === 'path') return `path_in(${input}, ${subject})`;
    // T-1: a source is a Go []byte, whose bytes the core judges.
    // GN-12a: an int or a uint of the contract is a safe integer, which the Go types do not hold to.
    if (type === 'int' || type === 'uint') return `safe_${type}_in(${input}, ${subject})`;
    const fn: Record<string, string> = { bytes: 'bytes_in', source: 'bytes_in', bool: 'bool_in', int64: 'int_in', float: 'float_in' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no Go input conversion for ${type}`);
    return `${name}(${input})`;
  }
  if ('list' in type) return `list_in(${input}, ${closure(['input'], boxed(model, type.list, convertIn(model, type.list, 'input', subject)))})`;
  if ('tuple' in type) {
    // T-2, GN-16: a tuple parameter or a tuple inside another type, its parts in order.
    return `tuple${type.tuple.length}_in(${input}, ${type.tuple.map((part) => closure(['input'], convertIn(model, part, 'input', subject))).join(', ')})`;
  }
  if ('map' in type) return `map_in(${input}, ${subject}, ${closure(['input'], convertIn(model, type.map, 'input', subject))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `keyed_map_in(${input}, ${subject}, &[${tags.join(', ')}], ${rustString(`a key of ${type.key.join(' or ')}`)}, ${closure(['input'], convertIn(model, type.keyed_map, 'input', subject))})`;
  }
  if ('optional' in type) return `optional_in(${input}, ${closure(['input'], boxed(model, type.optional, convertIn(model, type.optional, 'input', subject)))})`;
  const alias = aliasOf(model, type);
  if (alias !== undefined) return `${unitFn('in', alias.unit, alias.library)}(${input})`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return `in_${rustField(unit.name)}(${input}, ${subject})`;
  if (unit?.kind === 'variant') return `${unitFn('in', unit)}(${input}, ${subject})`;
  if (unit?.kind === 'record') return `${unitFn('in', unit, libraryOf(type))}(${input})`;
  if (unit !== undefined && objectUnit(model, type) !== undefined) return `in_${plainName(unit)}(${input}, ${subject})`;
  if (callbackOf(model, type) !== undefined && unit !== undefined) return `in_${plainName(unit)}(${input}, ${subject})`;
  if (unit !== undefined && interfaceOf(model, type) !== undefined) return `in_${plainName(unit)}(${input}, ${subject})`;
  throw new Unsupported(`no Go input conversion for ${JSON.stringify(type)}`);
}

export function convertOut(model: Model, type: Type, value: string): string {
  if (typeof type === 'string') {
    if (type === 'never') return `match ${value} {}`;
    const fn: Record<string, string> = { text: 'text_out', latin1: 'latin1_out', bytes: 'bytes_out', bool: 'bool_out', uint: 'uint_out', int: 'int_out', int64: 'int_out', float: 'float_out', path: 'path_out' };
    const name = fn[type];
    if (name === undefined) throw new Unsupported(`no Go output conversion for ${type}`);
    return `${name}(output, ${value})`;
  }
  if ('list' in type) return `list_out(output, ${value}, ${closure(['output', 'item'], convertOut(model, type.list, 'item'))})`;
  // The item of a map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('map' in type) return `map_out(output, ${value}, |output, item| ${convertOut(model, type.map, 'item')})`;
  if ('keyed_map' in type) return `keyed_map_out(output, ${value}, |output, item| ${convertOut(model, type.keyed_map, 'item')})`;
  // GN-16: an Option of a reference to the value of the core, so a generic item, such as int_out, takes one type.
  if ('optional' in type) return `optional_out(output, ${optionRef(value)}, ${closure(['output', 'value'], convertOut(model, type.optional, 'value'))})`;
  // GN-6ac: the core holds a tuple as a Rust tuple or, when its parts have one type, as an array; partsN reads either.
  if ('tuple' in type) {
    const names = type.tuple.map((_, i) => `part_${i}`);
    return `{ let (${names.join(', ')}${names.length === 1 ? ',' : ''}) = parts${type.tuple.length}(&${value}); ${type.tuple.map((t, i) => `${convertOut(model, t, names[i] ?? '')};`).join(' ')} }`;
  }
  // GN-6ae: a result passthrough crosses the C ABI as the handle of its value in the table of package binding.
  if ('passthrough' in type) return `passed_out(output, ${value})`;
  const alias = aliasOf(model, type);
  if (alias !== undefined) return `${unitFn('out', alias.unit, alias.library)}(output, ${value})`;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum' || unit?.kind === 'record' || unit?.kind === 'variant') return `${unitFn('out', unit, unit.kind === 'record' ? libraryOf(type) : undefined)}(output, ${value})`;
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

fn bool_in(input: &mut &[u8]) -> Result<bool, Fail> {
    read_tag(input)
}

fn uint_in(input: &mut &[u8]) -> Result<u64, Fail> {
    Ok(u64::from_le_bytes(read_word(input)?))
}

fn int_in(input: &mut &[u8]) -> Result<i64, Fail> {
    Ok(i64::from_le_bytes(read_word(input)?))
}

/// B-2, GN-12a: a uint of the contract is 0 to 2^53 - 1; a larger one is kind invalid_number.
fn safe_uint_in(input: &mut &[u8], subject: &str) -> Result<u64, Fail> {
    match uint_in(input)? {
        integer @ 0..=9_007_199_254_740_991 => Ok(integer),
        _ => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Uint })),
    }
}

/// B-2, GN-12a: an int of the contract is a safe integer; any other is kind invalid_number.
fn safe_int_in(input: &mut &[u8], subject: &str) -> Result<i64, Fail> {
    match int_in(input)? {
        integer if integer.unsigned_abs() <= 9_007_199_254_740_991 => Ok(integer),
        _ => Err(binding_error(BindingError::InvalidNumber { subject: subject.to_owned(), expected: NumberType::Int })),
    }
}

fn float_in(input: &mut &[u8]) -> Result<f64, Fail> {
    Ok(f64::from_le_bytes(read_word(input)?))
}

/// B-8: a Go string of the contract type text is UTF-8; other bytes are kind invalid_text.
fn text_in(input: &mut &[u8], subject: &str) -> Result<String, Fail> {
    String::from_utf8(read_bytes(input)?.to_vec())
        .map_err(|_not_utf8| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::NotUtf8 }))
}

/// B-8, T-1 latin1: a Go string of UTF-8 whose runes are U+0000 to U+00FF, one byte each; a rune above U+00FF is kind
/// invalid_text, as in every language.
fn latin1_in(input: &mut &[u8], subject: &str) -> Result<Vec<u8>, Fail> {
    let text = text_in(input, subject)?;
    text.chars()
        .map(|character| {
            u8::try_from(u32::from(character))
                .map_err(|_above| binding_error(BindingError::InvalidText { subject: subject.to_owned(), cause: TextCause::AboveLatin1 }))
        })
        .collect()
}

/// A []byte is its bytes; a source (T-1) is a []byte too, whose bytes the core judges.
fn bytes_in(input: &mut &[u8]) -> Result<Vec<u8>, Fail> {
    Ok(read_bytes(input)?.to_vec())
}

/// T-1 path, GN-6y: the bytes of a Go string, as they are, which binding_core judges.
fn path_in(input: &mut &[u8], subject: &str) -> Result<std::path::PathBuf, Fail> {
    binding_core::path_from_bytes(read_bytes(input)?.to_vec(), subject).map_err(binding_error)
}

fn list_in<'a, T>(input: &mut &'a [u8], item: impl Fn(&mut &'a [u8]) -> Result<T, Fail>) -> Result<Vec<T>, Fail> {
    let count = read_length(input)?;
    let mut items = Vec::new();
    for _ in 0..count {
        items.push(item(input)?);
    }
    Ok(items)
}

/// An optional value, and U-2 a parameter or a field with a default, which Go leaves out as nil: the core decides its
/// value.
fn optional_in<'a, T>(input: &mut &'a [u8], item: impl FnOnce(&mut &'a [u8]) -> Result<T, Fail>) -> Result<Option<T>, Fail> {
    if read_tag(input)? {
        item(input).map(Some)
    } else {
        Ok(None)
    }
}

/// T-2: an ordered map, its text keys each once; a key twice is a fault of the generated Go code (kind internal).
fn map_in<'a, T>(input: &mut &'a [u8], subject: &str, item: impl Fn(&mut &'a [u8]) -> Result<T, Fail>) -> Result<binding_core::OrderedMap<T>, Fail> {
    let count = read_length(input)?;
    let mut map = binding_core::OrderedMap::new();
    for _ in 0..count {
        let key = text_in(input, subject)?;
        let value = item(input)?;
        if map.insert(key, value).is_some() {
            return Err(malformed());
        }
    }
    Ok(map)
}

/// T-2: an ordered map, owned or borrowed, in its order.
fn map_out<T>(output: &mut Vec<u8>, value: impl Borrow<binding_core::OrderedMap<T>>, item: impl Fn(&mut Vec<u8>, &T)) {
    let map = value.borrow();
    write_length(output, map.len());
    for (key, value) in map.iter() {
        text_out(output, key);
        item(output, value);
    }
}

/// T-2, U-7 (c): a keyed map, its keys each once: kind 0 an integer, 1 a byte string, 2 a text; a key of a kind that
/// the contract does not list is kind invalid_argument_type, a key twice a fault of the generated Go code.
fn keyed_map_in<'a, T>(
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
            [0] => (0, binding_core::Key::Int(int_in(input)?)),
            [1] => (1, binding_core::Key::Bytes(bytes_in(input)?)),
            [2] => (2, binding_core::Key::Text(text_in(input, subject)?)),
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
fn keyed_map_out<T>(output: &mut Vec<u8>, value: impl Borrow<binding_core::KeyedMap<T>>, item: impl Fn(&mut Vec<u8>, &T)) {
    let map = value.borrow();
    write_length(output, map.len());
    for (key, value) in map.iter() {
        key_out(output, key);
        item(output, value);
    }
}

/// T-2: a key of a keyed map: its kind (0 an integer, 1 a byte string, 2 a text) and its value.
fn key_out(output: &mut Vec<u8>, key: &binding_core::Key) {
    match key {
        binding_core::Key::Int(integer) => {
            output.push(0);
            int_out(output, integer);
        }
        binding_core::Key::Bytes(bytes) => {
            output.push(1);
            bytes_out(output, bytes);
        }
        binding_core::Key::Text(text) => {
            output.push(2);
            text_out(output, text);
        }
    }
}

fn type_error(subject: &str, expected: &str) -> Fail {
    binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: expected.to_owned() })
}

fn write_length(output: &mut Vec<u8>, length: usize) {
    output.extend_from_slice(&length.to_le_bytes());
}

fn bytes_out(output: &mut Vec<u8>, value: impl AsRef<[u8]>) {
    let bytes = value.as_ref();
    write_length(output, bytes.len());
    output.extend_from_slice(bytes);
}

/// T-1 path, GN-6y: the bytes of the path, which a Go string holds as they are.
fn path_out(output: &mut Vec<u8>, value: impl AsRef<std::path::Path>) {
    bytes_out(output, binding_core::path_bytes(value.as_ref()));
}

fn text_out(output: &mut Vec<u8>, value: impl AsRef<str>) {
    bytes_out(output, value.as_ref().as_bytes());
}

/// T-1 latin1: each byte leaves as the rune of the same code point, so a Go string reads it as UTF-8.
fn latin1_out(output: &mut Vec<u8>, value: impl AsRef<[u8]>) {
    let text: String = value.as_ref().iter().map(|byte| char::from(*byte)).collect();
    text_out(output, text);
}

fn bool_out(output: &mut Vec<u8>, value: impl Borrow<bool>) {
    output.push(u8::from(*value.borrow()));
}

fn uint_out(output: &mut Vec<u8>, value: impl WideUint) {
    output.extend_from_slice(&value.widen_uint().to_le_bytes());
}

fn int_out(output: &mut Vec<u8>, value: impl WideInt) {
    output.extend_from_slice(&value.widen_int().to_le_bytes());
}

fn float_out(output: &mut Vec<u8>, value: impl Borrow<f64>) {
    output.extend_from_slice(&value.borrow().to_le_bytes());
}

fn list_out<T>(output: &mut Vec<u8>, value: impl IntoIterator<Item = T>, item: impl Fn(&mut Vec<u8>, T)) {
    let items: Vec<T> = value.into_iter().collect();
    write_length(output, items.len());
    for value in items {
        item(output, value);
    }
}

/// An optional value, owned or borrowed (\`&Option<T>\` is an \`Option<&T>\`).
fn optional_out<T>(output: &mut Vec<u8>, value: Option<T>, item: impl FnOnce(&mut Vec<u8>, T)) {
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
/// int64 as its decimal text, 4 a float, 5 a string, 6 a []byte, 7 a slice or an array, 8 a map, 9 a func with its
/// cgo.Handle (GN-6u), 10 any other value with its type name; a container with its handle and length.
fn read_host(input: &mut &[u8]) -> Result<HostValue, Fail> {
    Ok(match take(input, 1)? {
        [0] => HostValue::Null,
        [1] => HostValue::Bool(read_tag(input)?),
        [2] => HostValue::Int(int_in(input)?),
        [3] => HostValue::Number(text_in(input, "a number")?),
        [4] => HostValue::Float(float_in(input)?),
        [5] => HostValue::Text(HostText::Bytes(bytes_in(input)?)),
        [6] => HostValue::Bytes(bytes_in(input)?),
        [7] => HostValue::List { handle: Handle::new(uint_in(input)?), len: uint_in(input)? },
        [8] => HostValue::Map { handle: Handle::new(uint_in(input)?), len: uint_in(input)? },
        [9] => HostValue::Callable(go_native(uint_in(input)?)),
        [10] => {
            let type_name = text_in(input, "a type name")?;
            HostValue::Other { type_name, handle: Handle::new(uint_in(input)?) }
        }
        _ => return Err(malformed()),
    })
}

/// U-7: a value that the out rows of the alias give no Go form: a node that Go decodes as kind internal.
fn no_form_out(output: &mut Vec<u8>, reason: &str) {
    output.push(255);
    text_out(output, reason);
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
    text_out(output, text);
}
`;
}

const rustBytes = (text: string): string => `b${rustString(text)}`;

// T-9, GN-6v: a variant, the number of its case in the contract and then the fields of the case in order, matched
// without a wildcard; a number that names no case, which Go writes for a value that is no case struct, is kind
// invalid_argument_type.
function variantRust(model: Model, variant: Variant): string {
  const name = recordFn(variant.unit);
  const core = variant.unit.core_type ?? '';
  const goType = goName(variant.unit.name);
  const ins = variant.cases.map((kase, number) => {
    const fields = caseFields(model, variant, kase);
    const reads = fields.map((f) => {
      const subject = rustString(goName(f.field.name));
      return `            let ${f.variable}: ${caseType(model, f)} = ${caseRead(f, `${convertIn(model, f.field.type, 'input', subject)}?`)};${f.boxed === undefined && narrows(f.field.type) ? `\n            ${narrowed(f.variable, subject, 'binding_error')}` : ''}`;
    });
    const built = `Ok(${caseStruct(variant, kase, fields)})`;
    return `        ${number} => ${reads.length === 0 ? `${built},` : `{\n${reads.join('\n')}\n            ${built}\n        }`}`;
  });
  const arms = variant.cases.map((kase, number) => {
    const fields = caseFields(model, variant, kase);
    const writes = [`            uint_out(output, ${number}_u64);`, ...fields.map((f) => `            ${caseWritten(f, convertOut(model, f.field.type, caseValue(model, f)))};`)];
    return `${fields.length === 0 ? `        ${UNIT_CASE_ALLOW}\n` : ''}        ${caseStruct(variant, kase, fields)} => {\n${writes.join('\n')}\n        }`;
  });
  return `
/// T-9: a value of the variant ${goType}: the number of its case in the contract, then the fields of the case (B-8).
fn in_${name}(input: &mut &[u8], subject: &str) -> Result<${core}, Fail> {
    match uint_in(input)? {
${ins.join('\n')}
        _ => Err(binding_error(BindingError::InvalidArgumentType { subject: subject.to_owned(), expected: String::from(${rustString(goType)}) })),
    }
}

/// T-9: a value of the variant ${goType} leaves as the number of its case and the fields of the case.
fn out_${name}(output: &mut Vec<u8>, value: impl Borrow<${core}>) {
    match value.borrow() {
${arms.join('\n')}
    }
}
`;
}

// T-4, U-2: a record, its fields in contract order; a field with a default is Option<T>, None when Go leaves it nil.
// GN-15f, GN-4c: a record of another repository has the helpers in_<record> and out_<record> of the module of its
// library.
function recordRust(model: Model, unit: Unit, library?: string): string {
  const name = recordFn(unit);
  const core = unit.core_type ?? '';
  const fields = unit.fields ?? [];
  const reads = fields.map((f) => {
    const subject = rustString(goName(f.name));
    if (pointed(f)) return `    let ${rustField(f.name)}: Option<${rustType(model, f.type, true)}> = ${convertIn(model, { optional: f.type }, 'input', subject)}?;${narrows(f.type) ? `\n    ${narrowed(rustField(f.name), subject, 'binding_error')}` : ''}`;
    return `    let ${rustField(f.name)}: ${rustType(model, f.type, true)} = ${boxed(model, f.type, convertIn(model, f.type, 'input', subject))}?;${narrows(f.type) ? `\n    ${narrowed(rustField(f.name), subject, 'binding_error')}` : ''}`;
  });
  // GN-6l: a scalar field is passed by value, any other by reference.
  const scalar = (type: Type): boolean => typeof type === 'string' && ['bool', 'uint', 'int', 'int64', 'float'].includes(type);
  const writes = (): string[] => fields.map((f) => `    ${convertOut(model, pointed(f) ? { optional: f.type } : f.type, `${!pointed(f) && scalar(f.type) ? '' : '&'}value.${rustField(f.name)}`)};`);
  // GN-6aa: a record with a callback field has one lifetime and only enters.
  const entersOnly = fields.some((f) => unitOf(model, f.type)?.origin === 'callback');
  return `
/// T-4: the record ${goName(unit.name)}, its fields in contract order.
fn in_${name}(input: &mut &[u8]) -> Result<${entersOnly ? rustType(model, { unit: unit.id }) : core}, Fail> {
${reads.join('\n')}
    Ok(${core} { ${fields.map((f) => rustField(f.name)).join(', ')} })
}
${entersOnly ? '' : `
fn out_${name}(output: &mut Vec<u8>, value: impl Borrow<${core}>) {
    let value = value.borrow();
${writes().join('\n')}
}
`}`;
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
    let held = held_${plain}(uint_in(input)?, subject)?;${object.lock === undefined ? `
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
fn out_${plain}(output: &mut Vec<u8>, value: impl CoreForm<${core}>) {
    uint_out(output, insert_held(&${tableName(object.unit)}, ${heldNew(object, 'value.core_form()')}));
}

/// U-7, GN-15c: a value of ${goClass} that an out row of a value alias makes leaves as the number of the class and
/// the handle of a new instance, which the package of the class makes.
fn alias_out_${plain}(output: &mut Vec<u8>, value: ${core}) {
    output.push(10);
    uint_out(output, ${model.objects.indexOf(object)}u64);
    out_${plain}(output, value);
}
${nested}`;
}

// GN-6ap: a value of a generated interface is the position of its class among the classes that implement the
// interface, from 1, and the handle of the instance; the core takes the From of the value that the instance holds.
function interfaceRust(model: Model, iface: Unit): string {
  const goIface = langName('go', iface.name, 'class');
  const core = iface.core_type ?? '';
  return `
/// GN-6ap: a value of the interface ${goIface} is an instance of a class that implements it, whose value the core takes
/// as ${core}. Position 0 is a nil interface.
fn in_${plainName(iface)}(input: &mut &[u8], subject: &str) -> Result<${core}, Fail> {
    match uint_in(input)? {
${implementorsOf(model, iface).map((o, i) => `        ${i + 1} => in_${plainName(o.unit)}(input, subject).map(|held| <${core} as From<&${o.unit.core_type ?? ''}>>::from(&held)),
`).join('')}        _ => {
            uint_in(input)?;
            Err(type_error(subject, ${rustString(goIface)}))
        }
    }
}
`;
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
/// T-5: releases the value of an instance of ${goClass} that the Go runtime found unreachable (runtime.AddCleanup).${object.cleanup === undefined ? `
#[no_mangle]
pub extern "C" fn ${releaseSymbol(model, object.unit)}(handle: u64) {
    let released = lock(&${tableName(object.unit)}).values.remove(&handle);
    drop(released);
}` : `
/// GN-6p, B-10: the answer is 1 when the cleanup call did not consume the value, so that this release dropped it and
/// Go warns.
#[no_mangle]
pub extern "C" fn ${releaseSymbol(model, object.unit)}(handle: u64) -> i32 {
    let released = lock(&${tableName(object.unit)}).values.remove(&handle);
    i32::from(released.is_some_and(|held| !held.${cleanupMade(object)}()))
}`}
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
/// writable \`Buffer\` (B-8).${lines.some((l) => l.includes('panic!(')) ? '\n#[allow(clippy::panic, reason = "B-7: the entry point of the panic test panics on purpose, which its guard turns into kind internal")]' : ''}${feature === undefined ? '' : `\n#[cfg(feature = "${feature}")]`}
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
    lines.push(`        let held = held_${plainName(fn.unit)}(uint_in(&mut input)?, "receiver")?;`);
    if (!locked(model, fn)) lines.push(`        let this: &${fn.unit.core_type ?? ''} = &held;`);
  }
  for (const parameter of fn.params) {
    const variable = rustField(parameter.name);
    const subject = rustString(goSubject(parameter.name));
    const object = heldParam(model, parameter.type);
    if (object !== undefined) {
      lines.push(`        let ${variable} = held_${plainName(object.unit)}(uint_in(&mut input)?, ${subject})?;`);
      continue;
    }
    // GN-6ae: a function parameter is the closure that the machine of the member calls.
    if (machineFunction(parameter.type)) {
      lines.push(...functionClosure(model, parameter.type.function.parameters, variable, subject));
      continue;
    }
    const arg = fn.args.find((a: Arg) => !a.field && a.name === parameter.name);
    if (arg !== undefined && pointed(arg)) {
      lines.push(`        let ${variable}: ${argType(model, arg)} = ${convertIn(model, { optional: parameter.type }, '&mut input', subject)}?;`);
    } else {
      lines.push(`        let ${variable}: ${rustType(model, parameter.type)} = ${convertIn(model, parameter.type, '&mut input', subject)}?;`);
      // GN-6ac, GN-6ad: the core call chooses the core's own type, which IntoCore narrows to; a list is then a Vec of
      // the core's items, whose slice the core borrows.
      if (narrows(parameter.type)) lines.push(`        ${narrowed(variable, subject, 'binding_error')}`);
    }
  }
  lines.push('        finish_input(input)?;');
  lines.push(...lockLines(model, fn, (p) => rustField(p.name), 'held', 'binding_error', classLabel));
  return lines;
}

// GN-6ae: the lines that make the closure of a function parameter from a Go func, which entered as a callback of the
// call. Each call of the closure writes the arguments, a class argument as the handle of a new instance, and runs the
// func through the trampoline of the callbacks; what the func returned is a Passthrough, and its error a Raised.
function functionClosure(model: Model, parts: Type[], name: string, subject: string): string[] {
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  return [
    `        let ${name} = go_function(&mut input, ${subject})?;`,
    `        let ${name} = move |${parts.map((part, i) => `arg${i}: ${rustType(model, part)}`).join(', ')}| -> Result<binding_core::Passthrough, ${failure}> {`,
    ...(parts.length === 0 ? ['            let args = Vec::new();'] : [
      '            let mut args = Vec::new();',
      '            {',
      '                let output = &mut args;',
      ...parts.map((part, i) => `                ${convertOut(model, part, `arg${i}`)};`),
      '            }',
    ]),
    `            called(${name}, &args).map_err(binding_core::Failure::from)`,
    '        };',
  ];
}

// GN-6ae: the func of a function parameter as the closure reads it, its call through the trampoline of the callbacks,
// and the Passthrough of the value that package binding holds in its table: its release function, and the result
// that crosses the C ABI as its handle. GN-4c: a helper states its direction last, and in_<name> and out_<name> are the conversions of units.
function passingRust(model: Model): string {
  if (!passes(model)) return '';
  return `
/// GN-6ae: a func enters as the call and its index in it, as a callback does (GN-15b); a nil func is kind
/// invalid_callback.
fn go_function(input: &mut &[u8], subject: &str) -> Result<(u64, u64), Fail> {
    if !read_tag(input)? {
        return Err(binding_error(BindingError::InvalidCallback { subject: subject.to_owned(), member: String::new() }));
    }
    let call = uint_in(input)?;
    let callback = uint_in(input)?;
    Ok((call, callback))
}

/// GN-6ae: calls a func of Go code with the encoded arguments, on the thread of the call. What the func returned is
/// the Passthrough of the handle under which package binding holds it; the error that the func returned, which the
/// call keeps, or its panic, is a Raised.
fn called(function: (u64, u64), args: &[u8]) -> Result<binding_core::Passthrough, Raised> {
    let (call, callback) = function;
    let (status, bytes) = go_callback(call, callback, 0, args);
    if status != 0 {
        return Err(raised_by_go(call, &bytes));
    }
    let mut input: &[u8] = &bytes;
    match uint_in(&mut input).and_then(|handle| finish_input(input).map(|()| handle)) {
        Ok(handle) => Ok(binding_core::Passthrough::from_generated(Handle::new(handle), release_passed)),
        Err(fail) => Err(thrown(Thrown::Binding(fail))),
    }
}

/// GN-6ae: removes the value of a Passthrough that the core dropped from the table of package binding.
fn release_passed(handle: Handle) {
    // SAFETY: the export takes the handle by value and keeps no pointer.
    unsafe { ${prefix(model)}__go_release_passed(handle.raw()) };
}

/// GN-6ae: a result passthrough leaves as its handle; Go takes the value out of the table of package binding.
fn passed_out(output: &mut Vec<u8>, value: binding_core::Passthrough) {
    uint_out(output, value.into_handle().raw());
}
`;
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
  // GN-6n: the thread of the calling goroutine blocks on the future of an async member, on the runtime of binding_core.
  // GN-6ab: a member with machine drives the state machine of the core on that thread, and waits for each of its futures.
  const call = waitsAsync(fn) ? drivenCall(model, fn, coreCall(model, fn), (wait) => wait, 'binding_error') : armedCall(model, fn, coreCall(model, fn));
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
        let index = uint_in(&mut input)?;
        let kind = text_in(&mut input, "U-3: the kind of a recognized error")?;
        let message = text_in(&mut input, "U-3: the message of a recognized error")?;
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
    let call = uint_in(input)?;
    let callback = uint_in(input)?;
    Ok(${struct} { call, callback${cb.owner ? ', owner: std::thread::current().id()' : ''} })
}

impl ${cb.unit.core ?? ''} for ${struct} {${methods}
}
${recognizing}`;
}

// GN-6u: an out row of the Go form gives a native value back, so the crate gives Go a new handle of its func.
const givesNative = (model: Model): boolean => model.aliases.some((a) => (a.unit.out ?? []).some((row) => row.kind === 'native' && row.make?.go !== undefined));

// U-3, U-7: the calls into Go, the errors that Go code returned in a callback and the walk of a Go value.
function callBackRust(model: Model): string {
  const failing = [...model.functions, ...model.objects.flatMap((o) => o.members)].some((fn) => fn.failure) || model.aliases.some((a) => a.library === undefined);
  const p = prefix(model);
  const failure = `binding_core::Failure<${model.coreError ?? '()'}>`;
  const failureFn = failing ? `
/// E-1c: the failure of a core that calls back.
fn failure_error(failure: ${failure}) -> Fail {
    match failure {
        ${model.coreError === undefined ? 'binding_core::Failure::Kind(()) => binding_error(BindingError::Internal { detail: String::from("E-1c: this library names no kind, so no call gives one") })' : 'binding_core::Failure::Kind(error) => core_error(error)'},
        binding_core::Failure::Raised(raised) => ${callsBack(model) ? 'raised_fail(&raised)' : 'binding_error(BindingError::Internal { detail: raised.to_string() })'},
        binding_core::Failure::Callback(error) => binding_error(BindingError::Internal { detail: error.to_string() }),
    }
}
` : '';
  if (!callsBack(model)) return failureFn;
  const hosts = model.aliases.length === 0 ? '' : `
/// GN-6u: what a Native of Go holds: the cgo.Handle of the func, which the drop deletes on any thread.
#[derive(Debug)]
struct GoNative {
    handle: u64,
}

impl NativeObject for GoNative {}

impl Drop for GoNative {
    fn drop(&mut self) {
        // SAFETY: the handle is one that package binding made for this Native, and deleted here only.
        unsafe { ${p}__go_release(self.handle) };
        NATIVE_COUNT.fetch_sub(1, Ordering::SeqCst);
    }
}

/// GN-6u: the count of the live Natives, which the entry point of native-count-test gives.
static NATIVE_COUNT: AtomicU64 = AtomicU64::new(0);

thread_local! {
    /// GN-6u: the cgo.Handle of each func that the buffer being written gives Go, in the order of their indexes.
    static GIVEN: RefCell<Vec<u64>> = const { RefCell::new(Vec::new()) };
}
${!givesNative(model) ? '' : `
/// GN-6u: gives Go a new cgo.Handle of a func in the buffer being written, as its index in the list of the buffer.
fn give(handle: u64) -> usize {
    GIVEN.with_borrow_mut(|given| {
        given.push(handle);
        given.len() - 1
    })
}
`}
/// GN-6u: a buffer for Go: the list of the handles that it gives, which Go deletes before it decodes anything, then
/// its bytes.
fn given_first(bytes: Vec<u8>) -> Vec<u8> {
    let given = GIVEN.with_borrow_mut(std::mem::take);
    let mut output = Vec::new();
    write_length(&mut output, given.len());
    for handle in given {
        output.extend_from_slice(&handle.to_le_bytes());
    }
    output.extend_from_slice(&bytes);
    output
}

/// GN-6u: the func of a cgo.Handle that package binding made, as a Native.
fn go_native(handle: u64) -> Native {
    NATIVE_COUNT.fetch_add(1, Ordering::SeqCst);
    Native::new(GoNative { handle })
}

/// U-7: the walk of a Go value of a call, which package binding describes one level at a time (B-1).
struct GoHost {
    call: u64,
}

impl GoHost {
    /// The descriptions that Go gives for a question: the item of a list (op 0), the key and the value of an entry of
    /// a map (op 1), or the content of an instance of a value class (op 2, GN-6x, GN-6af).
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

${!readsValues(model) ? `    fn read(&mut self, _value: Handle) -> Result<HostValue, Raised> {
        Err(thrown(Thrown::Binding(binding_error(BindingError::Internal { detail: String::from("U-1: Go gives no value of a value class") }))))
    }` : `    /// GN-6x, GN-6af: the content of an instance of a value class, which its read member or its kept value gives (op 2).
    fn read(&mut self, value: Handle) -> Result<HostValue, Raised> {
        let mut values = self.ask(2, value, 0, 1)?;
        values.pop().ok_or_else(|| thrown(Thrown::Binding(malformed())))
    }`}
}
`;
  const callbackCall = !runsGo(model) ? '' : `
/// U-3: calls the member of a Go callback with the encoded arguments: 0 and the encoded result, or 1 and the index of
/// the error that the Go method returned.
fn go_callback(call: u64, callback: u64, member: u32, args: &[u8]) -> (i32, Vec<u8>) {
    let mut buffer = Buffer { ptr: std::ptr::null_mut(), len: 0, cap: 0 };
${model.aliases.length === 0 ? '' : `    // GN-6u: the arguments give the handles of their funcs first.
    let args = given_first(args.to_vec());
`}    // SAFETY: the call is alive while the entry point that named it runs, args is a slice and the buffer is writable.
    let status = unsafe { ${p}__go_callback(call, callback, member, args.as_ptr(), args.len(), &mut buffer) };
    (status, taken(buffer))
}

/// U-3: the error that a Go method returned, kept by Go in its call under the index that the bytes give.
fn raised_by_go(call: u64, bytes: &[u8]) -> Raised {
    let mut input = bytes;
    match uint_in(&mut input).and_then(|index| finish_input(input).map(|()| index)) {
        Ok(index) => thrown(Thrown::Go { call, index }),
        Err(fail) => thrown(Thrown::Binding(fail)),
    }
}
`;
  return `
extern "C" {${!runsGo(model) ? '' : `
    /// U-3: the function that package binding exports to run a member of a Go callback.
    fn ${p}__go_callback(call: u64, callback: u64, member: u32, args: *const u8, len: usize, result: *mut Buffer) -> i32;`}${!passes(model) ? '' : `
    /// GN-6ae: the function that package binding exports to remove a value from its table of passthroughs.
    fn ${p}__go_release_passed(handle: u64);`}${model.aliases.length === 0 ? '' : `
    /// U-7: the function that package binding exports to describe a child of a Go value.
    fn ${p}__go_host(call: u64, op: u32, handle: u64, index: u64, result: *mut Buffer) -> i32;
    /// GN-6u: the function that package binding exports to delete the cgo.Handle of a Native.
    fn ${p}__go_release(handle: u64);${!givesNative(model) ? '' : `
    /// GN-6u: the function that package binding exports to give a new cgo.Handle of the func of a Native.
    fn ${p}__go_native(handle: u64) -> u64;`}`}
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
enum Thrown {${!runsGo(model) ? '' : `
    Go { call: u64, index: u64 },`}
    Binding(Fail),
}

static THROWN: Mutex<BTreeMap<u64, Thrown>> = Mutex::new(BTreeMap::new());

static NEXT_THROWN: AtomicU64 = AtomicU64::new(1);

/// U-3, GN-6u: what a Raised holds: the key of what went wrong in THROWN, whose last drop removes it, so a failure
/// that the core drops is not kept.
#[derive(Debug)]
struct ThrownKey {
    key: u64,
}

impl NativeObject for ThrownKey {}

impl Drop for ThrownKey {
    fn drop(&mut self) {
        let taken = lock(&THROWN).remove(&self.key);
        drop(taken);
    }
}

fn thrown(error: Thrown) -> Raised {
    let key = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    lock(&THROWN).insert(key, error);
    Raised::from_generated(Native::new(ThrownKey { key }))
}

/// U-3: the failure of a Raised: the Go error, which the caller gets back unchanged, or the failure of the binding.
fn raised_fail(raised: &Raised) -> Fail {
    let taken = raised.native().downcast::<ThrownKey>().and_then(|thrown| lock(&THROWN).remove(&thrown.key));
    match taken {
${!runsGo(model) ? '' : `        Some(Thrown::Go { call, index }) => Fail { raised: Some((call, index)), ..binding_error(BindingError::Internal { detail: String::from("U-3: the error of a callback") }) },
`}        Some(Thrown::Binding(fail)) => fail,
        None => binding_error(BindingError::Internal { detail: String::from("U-3: the error of the callback is gone") }),
    }
}

${failureFn}${hosts}${callbackCall}${passingRust(model)}`;
}

// ---- value aliases (U-7) ----

// The Go form of a built-in make form, written from the content of the matched OutValue (the nodes of package binding:
// 0 nil, 1 bool, 2 int64, 3 float64, 4 string, 5 []byte, 6 []any, 7 map[string]any, 8 a container made before, 9
// *KeyedMap[any], 10 an instance of a class that a member makes, 11 the func of a Native by a new cgo.Handle, 255 no Go
// form).
function goBuiltin(model: Model, alias: ValueAlias, form: string, kind: string): string {
  switch (form) {
    case 'null':
      return 'output.push(0)';
    case 'bool':
      return '{\n            output.push(1);\n            bool_out(output, value);\n        }';
    case 'int':
      if (kind === 'int') return '{\n            output.push(2);\n            int_out(output, value.value());\n        }';
      if (kind === 'int64') return '{\n            output.push(2);\n            int_out(output, value);\n        }';
      break;
    case 'float':
      if (kind === 'float') return '{\n            output.push(3);\n            float_out(output, value.value());\n        }';
      if (kind === 'int' || kind === 'int64' || kind === 'number') {
        const text = kind === 'int' ? 'value.value().to_string()' : kind === 'int64' ? 'value.to_string()' : 'value';
        // An integer as the nearest double, by its decimal text: R-1 refuses an as conversion.
        return `match ${text}.parse::<f64>() {
            Ok(float) => {
                output.push(3);
                float_out(output, float);
            }
            Err(_never) => no_form_out(output, "U-7: an integer that is no number"),
        }`;
      }
      break;
    case 'text':
      if (kind === 'text') return '{\n            output.push(4);\n            text_out(output, value);\n        }';
      if (kind === 'bytes') {
        return `match std::str::from_utf8(value.value()) {
            Ok(text) => {
                output.push(4);
                text_out(output, text);
            }
            Err(_bytes) => no_form_out(output, "U-7: text of bytes that are not UTF-8"),
        }`;
      }
      break;
    case 'bytes':
      if (kind === 'bytes') return '{\n            output.push(5);\n            bytes_out(output, value.value());\n        }';
      if (kind === 'text') return '{\n            output.push(5);\n            bytes_out(output, value.as_bytes());\n        }';
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
            uint_out(output, len);
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
            uint_out(output, len);
            for index in 0..len {
                let (key, item) = ${parts.entry};
                make(output, key, source, made);
                make(output, item, source, made);
            }
        }`;
    }
    case 'native':
      // GN-6u: the bytes outlive the Native, so they carry a new cgo.Handle of the func, which the decoder deletes. The
      // node is 13: 11 is an instance of a value class of another repository (GN-6x) and 12 one of a value class without
      // core_type (GN-6af), and the decoder of Go is one switch.
      return `match native.downcast::<GoNative>() {
            Some(object) => {
                output.push(13);
                // SAFETY: the handle is the cgo.Handle of the Native, which is alive while the Native is.
                write_length(output, give(unsafe { ${prefix(model)}__go_native(object.handle) }));
            }
            None => no_form_out(output, "GN-6u: a native value that no Go func entered as"),
        }`;
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

// GN-6af, GN-15c: an instance of a value class without core_type leaves as node 12 with the number of the class and
// its content; the handle is marked before the content, so a later place of it is node 8, the same pointer in Go.
function keptMakeGo(model: Model, kept: KeptClass, field: KeptField, holds: 'entries' | 'value', head: string): string {
  const position = model.kept.indexOf(kept);
  if (holds === 'value' && !field.writable) throw new Unsupported(`${kept.unit.id}: a reference makes an instance of a value class whose property keeps the value it holds, which is writable (GN-6af)`);
  const first = `${head === '' ? '' : `${head}\n            `}if let Some(index) = made.get(&handle.raw()) {
                output.push(8);
                write_length(output, *index);
                return;
            }
            made.insert(handle.raw(), made.len());
            output.push(12);
            uint_out(output, ${position}u64);`;
  if (holds === 'value') {
    return `{
            ${first}
            make(output, *value, source, made);
        }`;
  }
  return `{
            ${first}
            uint_out(output, len);
            for index in 0..len {
                let (key, item) = source.entry(handle, index);
                make(output, key, source, made);
                make(output, item, source, made);
            }
        }`;
}

// GN-6af, GN-15c: the C ABI of the constructor of a value class without core_type: the call that walks the Go values,
// then each argument as package binding describes it, which the core judges; the entry returns nothing, because Go
// keeps the values.
function keptRust(model: Model, kept: KeptClass): string {
  const fn = kept.constructor;
  const lines = ['        let call = uint_in(&mut input)?;'];
  for (const f of kept.fields) {
    const subject = rustString(goSubject(f.name));
    const type = f.type;
    let read = 'read_host(input)';
    let rust = 'HostValue';
    if (typeof type === 'object' && 'keyed_map' in type) {
      const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
      read = `keyed_map_in(input, ${subject}, &[${tags.join(', ')}], ${rustString(`a key of ${type.key.join(' or ')}`)}, read_host)`;
      rust = 'binding_core::KeyedMap<HostValue>';
    } else if (typeof type === 'object' && 'list' in type) {
      read = 'list_in(input, read_host)';
      rust = 'Vec<HostValue>';
    }
    lines.push(f.default === undefined
      ? `        let ${rustField(f.name)}: ${rust} = ${read.replace('(input', '(&mut input')}?;`
      : `        let ${rustField(f.name)}: Option<${rust}> = optional_in(&mut input, ${closure(['input'], read)})?;`);
  }
  lines.push(
    '        finish_input(input)?;',
    '        let mut host = GoHost { call };',
    `        if let Err(failure) = ${fn.corePath}(&mut host, ${kept.fields.map((f) => rustField(f.name)).join(', ')}) {`,
    '            return Err(failure_error(failure));',
    '        }',
    '        Ok(Vec::new())',
  );
  return entry(model, cSymbol(model, fn), `GN-6af: the C ABI of ${fn.corePath}, which judges the arguments of the constructor of ${goName(kept.unit.name)} (contract member ${fn.member.id}).`, lines);
}

function aliasRust(model: Model, alias: ValueAlias): string {
  const name = aliasFn(alias);
  const core = alias.unit.core_type ?? '';
  const failure = `binding_core::Failure<${alias.error?.path ?? model.coreError ?? '()'}>`;
  if (alias.owner !== undefined) return valueClassRust(model, alias, name, core, failure);
  // U-7, GN-15c: a Go value leaves the core as a value of a built-in form, or as an instance that a member makes.
  const arms = outArms(model, alias, 'go', (form, kind) => goBuiltin(model, alias, form, kind), 'no_form_out(output, "U-7: no out row takes the value")', 'output, ', (kept, field, holds, head) => keptMakeGo(model, kept, field, holds, head), 'alias_out_');
  return `
/// U-7: a Go value of the alias ${alias.unit.id} enters as the call that walks it and its first level, which the core judges.
fn in_${name}(input: &mut &[u8]) -> Result<${core}, Fail> {
    let call = uint_in(input)?;
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
        other => no_form_out(output, &format!("U-7: no out row of the kind {}", other.kind().as_str())),
    }
}
`;
}

// GN-6x, GN-15c: a value class of another repository: an instance enters as HostValue::Value, which the owner's in
// function reads through the question read; a core value leaves as node 11 with the numbers of the class and of its Go
// out row and the content of the row, from which package binding makes the instance by the owner's function.
function valueClassRust(model: Model, alias: ValueAlias, name: string, core: string, failure: string): string {
  const number = valueClasses(model).indexOf(alias);
  const head = (row: number): string => `            output.push(11);\n            uint_out(output, ${number}_u64);\n            uint_out(output, ${row}_u64);`;
  const arms = classMakes(alias, 'go').map((make, row) => {
    if (make.form === 'content') {
      if (make.kind === 'null') return `        OutValue::Null => {\n${head(row)}\n        }`;
      if (make.kind === 'bool') return `        OutValue::Bool(value) => {\n${head(row)}\n            bool_out(output, value);\n        }`;
      if (make.kind === 'text16') {
        // B2.81: the UTF-16 code units of the text, unpaired surrogates included, as a list of integers.
        return `        OutValue::Text16(value) => {\n${head(row)}\n            list_out(output, value, |output, unit| uint_out(output, u64::from(unit)));\n        }`;
      }
      return `        OutValue::${make.kind === 'number' ? 'Number' : 'Text'}(value) => {\n${head(row)}\n            text_out(output, value);\n        }`;
    }
    if (make.form === 'list') {
      return `        OutValue::List { handle, len } => {
${head(row)}
            uint_out(output, len);
            for index in 0..len {
                let item = source.item(handle, index);
                make(output, item, source);
            }
        }`;
    }
    return `        OutValue::Map(value) => {
${head(row)}
            let handle = value.handle();
            let len = value.len();
            uint_out(output, len);
            for index in 0..len {
                let (key, item) = source.entry(handle, index);
                make(output, key, source);
                make(output, item, source);
            }
        }`;
  });
  return `
/// GN-6x: an instance of ${goName(alias.unit.name)} of ${alias.library ?? ''} enters as HostValue::Value, which the core of its owner judges.
fn in_${name}(input: &mut &[u8]) -> Result<${core}, Fail> {
    let call = uint_in(input)?;
    let described = read_host(input)?;
    let mut host = GoHost { call };
    ${alias.coreIn}(&mut host, described).map_err(|failure: ${failure}| ${aliasFailureFn(alias)}(failure))
}

/// GN-6x: a core value of ${goName(alias.unit.name)} leaves as the nodes from which package binding makes the instance.
fn out_${name}(output: &mut Vec<u8>, value: impl Borrow<${core}>) {
    let (root, mut source) = ${alias.coreOut}(value.borrow());
    make_${name}(output, root, &mut source);
}

fn make_${name}(output: &mut Vec<u8>, out: OutValue, source: &mut dyn OutValues) {
    let make = make_${name};
    match out {
${arms.join('\n')}
        other => no_form_out(output, &format!("GN-6x: no out row of the kind {}", other.kind().as_str())),
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
fn error_of_${library}(error: ${error.path}) -> Fail {
    let category: Category = match ${errorMatched({ codeOf: error.code }, 'error')} {
${arms}
    };
    Fail { category, message: error.to_string(), kind: Kinds::kind(&error), status: Kinds::status(&error), errno: Kinds::errno(&error), class: 0, properties: Vec::new(), raised: None }
}

fn failure_of_${library}(failure: binding_core::Failure<${error.path}>) -> Fail {
    match failure {
        binding_core::Failure::Kind(error) => error_of_${library}(error),
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
    latin1: has('latin1_in', 'latin1_out'),
    map: has('map_in', 'map_out', 'text_in', 'text_out'),
    keyed: has('keyed_map_in', 'keyed_map_out', 'text_in', 'text_out'),
  };
}

// GN-13g: the number types of the parameters of the contract, each with its number in the encoding of
// <prefix>__number_in, in that order.
export const NUMBER_TYPES = ['uint', 'int', 'int64', 'float'] as const;
export const numberTypes = (model: Model): (typeof NUMBER_TYPES)[number][] => {
  const used = new Set([...model.functions, ...model.objects.flatMap((o) => o.members)].flatMap((fn) => fn.params.map((p) => p.type)));
  return NUMBER_TYPES.filter((type) => used.has(type));
};

// GN-13g: the conversion of each number type of the parameters, for a Go value of any type. The value of the Go type of
// a number type passes the conversion that a parameter of that type uses; a value of another type is kind
// invalid_number. Every path is written in full, so that no import is used only under the feature codec-test.
function numberInRust(model: Model): string {
  const types = numberTypes(model);
  if (types.length === 0) return '';
  const arms = types.map((type) => {
    const code = NUMBER_TYPES.indexOf(type);
    const own = { uint: '(0, 1, Some(word)) => safe_uint_in(&mut &word[..], &subject).map(drop),', int: '(1, 1, Some(word)) => safe_int_in(&mut &word[..], &subject).map(drop),', int64: '(2, 1, Some(_word)) => Ok(()),', float: '(3, 3, Some(_word)) => Ok(()),' }[type];
    const expected = { uint: 'Uint', int: 'Int', int64: 'Int', float: 'Float' }[type];
    return `        ${own}\n        (${code}, _, _) => Err(invalid(binding_core::NumberType::${expected})),`;
  }).join('\n');
  return `
/// GN-13g: a Go value of any type judged by the conversion of a number type of the contract (B-2). The encoding is the
/// number type (0 uint, 1 int, 2 int64, 3 float), the subject and the host value: 0 a bool, 1 a Go integer in the range
/// of i64, 2 a Go integer above it and 3 a Go float, each of these three with a word, 4 a Go string with its bytes, and
/// 5 any other value.
fn number_in(input: &mut &[u8]) -> Result<(), Fail> {
    let expected = uint_in(input)?;
    let subject = String::from_utf8(read_bytes(input)?.to_vec()).map_err(|_not_utf8| malformed())?;
    let kind = uint_in(input)?;
    let word = match kind {
        0 | 5 => None,
        1..=3 => Some(read_word(input)?),
        4 => {
            read_bytes(input)?;
            None
        }
        _ => return Err(malformed()),
    };
    let invalid = |expected| binding_error(BindingError::InvalidNumber { subject: subject.clone(), expected });
    match (expected, kind, word) {
${arms}
        _ => Err(malformed()),
    }
}
`;
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
  if (echo.latin1) out.push(echoEntry('latin1', 'latin1_in(&mut input, "value")?', 'latin1_out(&mut buffer, &value)'));
  if (echo.map) out.push(echoEntry('map', 'map_in(&mut input, "value", |input| text_in(input, "value"))?', 'map_out(&mut buffer, &value, |output, item| text_out(output, item))'));
  if (echo.keyed) out.push(echoEntry('keyed_map', 'keyed_map_in(&mut input, "value", &[0, 1, 2], "a key", |input| text_in(input, "value"))?', 'keyed_map_out(&mut buffer, &value, |output, item| text_out(output, item))'));
  // U-7: the in function of a value alias with in_raises alone.
  for (const alias of aliasesWithKinds(model).filter((a) => a.library === undefined)) {
    out.push(entry(model, `${p}__alias_in_${aliasFn(alias)}`, `U-7: runs the in function of the alias ${alias.unit.id} alone, for the tests of its kinds.`, [
      `        let _value: ${alias.unit.core_type ?? ''} = ${unitFn('in', alias.unit, alias.library)}(&mut input)?;`,
      '        finish_input(input)?;',
      '        Ok(Vec::new())',
    ], 'codec-test'));
  }
  // GN-13g: a Go value of another type at a number parameter.
  if (numberTypes(model).length > 0) {
    out.push(entry(model, `${p}__number_in`, 'GN-13g: judges a Go value of any type by the conversion of a number type of the contract, for the tests of a value that the Go type of a parameter cannot hold.', [
      '        number_in(&mut input)?;',
      '        finish_input(input)?;',
      '        Ok(Vec::new())',
    ], 'codec-test'));
  }
  out.push(entry(model, `${p}__panic_test`, 'B-7: the entry point of the generated panic test.', ['        finish_input(input)?;', '        panic!("panic-test")'], 'panic-test'));
  if (nativeRoundTrip(model.contract, 'go') !== undefined) {
    out.push(entry(model, `${p}__native_count`, 'GN-6u: the entry point of the generated release test: the count of the live Natives.', ['        finish_input(input)?;', '        let mut output = Vec::new();', '        uint_out(&mut output, NATIVE_COUNT.load(Ordering::SeqCst));', '        Ok(output)'], 'native-count-test'));
  }
  // GN-5, GN-6h: the poison entry point of the B-5c test: a panic while the write guard of the instance is held.
  const written = model.objects.map((o, index) => ({ o, index })).filter(({ o }) => poisoned(model, o));
  if (written.length > 0) {
    const arms = written.map(({ o, index }) => `            ${index} => {
                let held = held_${plainName(o.unit)}(handle, "held")?;
                let _guard = held.write(${rustString(classLabel(o))}).map_err(binding_error)?;
                panic!("panic-test");
            }`).join('\n');
    out.push(entry(model, `${p}__panic_test_held`, 'B-5c: the entry point of the generated poison test, which panics while it holds the write guard of an instance.', [
      '        let class = uint_in(&mut input)?;',
      '        let handle = uint_in(&mut input)?;',
      '        finish_input(input)?;',
      `        match class {\n${arms}\n            _ => Err(binding_error(BindingError::Internal { detail: String::from("B-5c: no class with a write place has this index") })),\n        }`,
    ], 'panic-test'));
  }
  if (model.faults.length > 0) {
    out.push(entry(model, `${p}__arm_faults`, 'G-5: arms the faults of a case for the next call of the member on this thread, and gives the id of the arming.', [
      '        let member = text_in(&mut input, "member")?;',
      '        let faults = text_in(&mut input, "faults")?;',
      '        finish_input(input)?;',
      '        let id: u64 = binding_core::fault::arm(&member, &faults).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;',
      '        let mut buffer = Vec::new();',
      '        uint_out(&mut buffer, id);',
      '        Ok(buffer)',
    ], 'fault-test'));
    out.push(entry(model, `${p}__fault_left`, 'G-5: the points of an arming whose fault did not fire.', [
      '        let id = uint_in(&mut input)?;',
      '        finish_input(input)?;',
      '        let left = binding_core::fault::left(id).map_err(|error| binding_error(BindingError::Internal { detail: error.to_string() }))?;',
      '        let mut buffer = Vec::new();',
      '        list_out(&mut buffer, left, text_out);',
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
    ...model.kept.map((k) => keptRust(model, k)),
  ].join('');
}

// The Rust helpers that the contract's functions use.
function rustUsed(model: Model): string {
  const code = `${entries(model)}${model.callbacks.map((c, i) => callbackRust(model, c, i)).join('')}${callBackRust(model)}${coreErrorRust(model)}${foreignFailureRust(model)}`;
  const units = [
    ...model.enums.map(enumRust),
    ...model.records.map((u) => recordRust(model, u)),
    ...model.variants.map((v) => variantRust(model, v)),
    ...model.objects.map((o) => objectHelpers(model, o)),
    ...model.interfaces.map((i) => interfaceRust(model, i)),
    ...model.aliases.filter((a) => a.library === undefined).map((a) => aliasRust(model, a)),
  ].join('\n');
  const libraries = libraryBlocks(model, (unit, library) => recordRust(model, unit, library), (a) => aliasRust(model, a));
  const helpers = !readsValues(model) ? RUST_HELPERS : RUST_HELPERS.replace('        _ => return Err(malformed()),\n    })\n}', `${VALUE_CLASS_NODES}        _ => return Err(malformed()),\n    })\n}`);
  return usedHelpers(`${helpers}\n${WIDEN}\n${INTO_CORE}\n${PARTS}\n${DRIVEN}\n${CORE_FORM}\n${units}\n${tupleReaders(model)}\n${numberInRust(model)}`, code, testEntryUses(model), libraries);
}

// GN-6x: the value classes of other repositories of the model, in the order of their numbers in node 11 of a result.
export const valueClasses = (model: Model): ValueAlias[] => model.aliases.filter((a) => a.owner !== undefined);

// GN-6x, GN-15c: the binding_core::ValueKind of each number of node 11 of a description.
export const GO_VALUE_KINDS = ['Null', 'Bool', 'Int', 'Int64', 'Float', 'Number', 'Text', 'Bytes', 'List', 'Map', 'Object', 'Text16', 'Reference'];

// GN-6af, GN-15c: the in rows of Go that name a value class without core_type, whose instances package binding
// describes as node 11.
export const keptReads = (model: Model): ValueRead[] => (model.kept.length === 0 ? [] : valueReads(model, 'go').filter((r) => r.kept !== undefined));

// GN-6x, GN-6af: whether package binding describes an instance of a value class, of another repository or without
// core_type, which the question read (op 2) opens.
export const readsValues = (model: Model): boolean => valueClasses(model).length > 0 || keptReads(model).length > 0;

// GN-6x, GN-15c: node 11, an instance of a value class of another repository with the kind of its in case and its
// handle, and node 12, the error that a member of the owner returned, kept by Go in the call under its index.
const VALUE_CLASS_NODES = `        [11] => {
            let kind = match take(input, 1)? {
${GO_VALUE_KINDS.map((k, i) => `                [${i}] => ValueKind::${k},`).join('\n')}
                _ => return Err(malformed()),
            };
            HostValue::Value { kind, handle: Handle::new(uint_in(input)?) }
        }
        [13] => {
            // B2.81: the UTF-16 code units of a text of the kind text16, which the read member of its case gives.
            let len = uint_in(input)?;
            let mut units = Vec::new();
            for _ in 0..len {
                units.push(u16::try_from(uint_in(input)?).map_err(|_overflow| malformed())?);
            }
            HostValue::Text(HostText::Utf16(units))
        }
        [12] => {
            let call = uint_in(input)?;
            let index = uint_in(input)?;
            return Err(Fail { raised: Some((call, index)), ..binding_error(BindingError::Internal { detail: String::from("GN-6x: the error of a member of a value class") }) });
        }
`;

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
  for (const unit of [...model.records, ...model.variants.flatMap((v) => v.cases.map((c) => c.unit))]) for (const f of unit.fields ?? []) visit(f.type);
  for (const cb of model.callbacks) for (const m of cb.members) visit(m.returns);
  return [...arities].sort((a, b) => a - b).map((n) => {
    const names = Array.from({ length: n }, (_, i) => `T${i}`);
    return `/// T-2, GN-16: a tuple of ${n} parts, read in order.
fn tuple${n}_in<'a, ${names.join(', ')}>(
    input: &mut &'a [u8],
${names.map((t, i) => `    part${i}: impl FnOnce(&mut &'a [u8]) -> Result<${t}, Fail>,`).join('\n')}
) -> Result<(${names.join(', ')}${n === 1 ? ',' : ''}), Fail> {
    Ok((${names.map((_, i) => `part${i}(input)?`).join(', ')}${n === 1 ? ',' : ''}))
}`;
  }).join('\n\n');
}

// GN-4: the helpers that the test entry points of each feature use; a helper that only they use is compiled under
// their features.
const testEntryUses = (model: Model): Record<string, string> => ({
  'panic-test': model.objects.some((o) => poisoned(model, o)) ? 'uint_in' : '',
  'fault-test': model.faults.length > 0 ? 'uint_in uint_out text_in text_out list_out' : '',
  'codec-test': [...aliasesWithKinds(model).filter((a) => a.library === undefined).map((a) => unitFn('in', a.unit, a.library)), ...(numberTypes(model).length > 0 ? ['number_in'] : [])].join(' '),
});

export function libRust(model: Model): string {
  const constants = model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n') + defaultAsserts(model);
  const functions = entries(model);
  const callbacks = model.callbacks.map((c, i) => callbackRust(model, c, i)).join('');
  const used = rustUsed(model);
  const all = `${used}${functions}${callbacks}${callBackRust(model)}${coreErrorRust(model)}`;
  const categoryIndex = goErrorTypes(model.contract).map(([category], i) => `        Category::${category.charAt(0).toUpperCase()}${category.slice(1)} => ${i},`).join('\n');
  const usesMutex = model.objects.length > 0 || callsBack(model);
  const usesMap = model.objects.length > 0 || callsBack(model);
  const hostTypes = ['Handle', 'HostText', 'HostValue', 'HostValues', 'Native', 'NativeObject', 'OutValue', 'OutValues', 'Predicate', 'Raised', 'ValueKind'].filter((t) => new RegExp(`\\b${t}\\b`).test(all));
  return `${header('//')}
// The C ABI of the Go binding of ${model.contract.library} (B-8). Each function takes the encoded arguments, which the
// Go package writes, judges them as it decodes them (T-8), calls the core and gives back the encoded result or failure
// in a buffer that Go copies and frees with ${prefix(model)}__free.

use binding_core::{BindingError, Category, Kinds${/\bNumberType\b/.test(all) ? ', NumberType' : ''}${/\bTextCause\b/.test(all) ? ', TextCause' : ''}${hostTypes.map((t) => `, ${t}`).join('')}};
${/Borrow</.test(all) ? 'use std::borrow::Borrow;\n' : ''}${model.aliases.length > 0 ? 'use std::cell::RefCell;\n' : ''}${usesMap ? 'use std::collections::BTreeMap;\n' : ''}use std::mem::ManuallyDrop;
use std::panic::{catch_unwind, AssertUnwindSafe};
${model.objects.length > 0 ? 'use std::sync::Arc;\n' : ''}${callsBack(model) ? 'use std::sync::atomic::{AtomicU64, Ordering};\n' : ''}${usesMutex ? 'use std::sync::{Mutex, MutexGuard};\n' : ''}
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
${coreErrorRust(model)}${raisesAssertions(model)}${cleanupAsserts(model)}${aliasKindsRust(model)}
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
    let (status, bytes) = match outcome {${model.aliases.length === 0 ? `
        Ok(bytes) => (0, bytes),
        Err(fail) => (1, encode_fail(fail)),` : `
        Ok(bytes) => (0, given_first(bytes)),
        Err(fail) => (1, given_first(encode_fail(fail))),`}
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
