// U-7: what the conversions of a value alias share across languages: the OutValue variant of each kind, the rows of a
// language selected by kind and `when`, and the parts of a container kind that a list or a map form reads.

import type { Contract, Member, OutRow, Type, Unit } from '../contract.ts';
import type { Lang } from '../contract.ts';
import { type Fn, type KeptClass, type KeptField, type Model, type ObjectClass, Unsupported, type ValueAlias, resolveNamedTypes, rustField } from './model.ts';

// The predicate methods of OutValue for a `when` of a row (binding_core::Predicate).
const PREDICATE: Record<string, string> = {
  utf8: 'Utf8', sequence_keys: 'SequenceKeys', safe_integer: 'SafeInteger', integral_float: 'IntegralFloat',
};

// The OutValue variant of each kind and how its content is bound in a match arm.
const VARIANT: Record<string, string> = {
  null: 'OutValue::Null', bool: 'OutValue::Bool(value)', int: 'OutValue::Int(value)', int64: 'OutValue::Int64(value)',
  float: 'OutValue::Float(value)', number: 'OutValue::Number(value)', text: 'OutValue::Text(value)', text16: 'OutValue::Text16(value)', bytes: 'OutValue::Bytes(value)',
  list: 'OutValue::List { handle, len }', map: 'OutValue::Map(value)', object: 'OutValue::Object { handle, len }',
  reference: 'OutValue::Reference { handle, value }', safe_text: 'OutValue::SafeText(value)', native: 'OutValue::Native(native)',
};

// A container kind as a list or a map form reads it: the statements that bind `handle` and `len`, and the expressions of
// the item and of the entry at `index`. A list form takes the values of a map or an object in order (U-7 (c)).
export interface Container {
  head: string;
  item: string;
  entry: string;
}

export function container(alias: ValueAlias, kind: string, form: string): Container {
  switch (kind) {
    case 'list':
      if (form !== 'list') break;
      return { head: '', item: 'source.item(handle, index)', entry: '' };
    case 'map':
      return { head: 'let handle = value.handle();\n            let len = value.len();', item: 'source.entry(handle, index).1', entry: 'source.entry(handle, index)' };
    case 'object':
      return { head: '', item: 'source.entry(handle, index).1', entry: 'source.entry(handle, index)' };
    default:
      break;
  }
  throw new Unsupported(`${alias.unit.id}: the form ${form} of the kind ${kind} is not generated yet`);
}

// U-7, T-5: the argument that the content of a kind gives to the one parameter of a factory, by the contract type of the
// parameter, as GN-6 passes it: a text borrowed, a number or a bool by value.
const CONTENT: Record<string, { type: string; arg: string }> = {
  bool: { type: 'bool', arg: 'value' }, int: { type: 'int', arg: 'value.value()' }, int64: { type: 'int64', arg: 'value' },
  float: { type: 'float', arg: 'value.value()' }, text: { type: 'text', arg: '&value' }, bytes: { type: 'bytes', arg: 'value.value()' },
};

// U-7, T-5: an out row that names a member makes an instance of a class of this contract: the content of the kind is the
// one argument of the core path of the class's constructor or static factory, which cannot fail, and the value it gives
// leaves as the class's instance (out_<class>, whose first arguments are `env`).
function byMember(model: Model, alias: ValueAlias, lang: Lang, make: string, kind: string, env: string, instance: string, keptMake?: KeptMake, foreignMake?: ForeignMakeWriter, leaf: (made: string) => string = (made) => made): string {
  if (alias.library !== undefined) {
    // GN-6ar: the class is of the owner of the alias, whose constructor the language of the target calls.
    if (foreignMake === undefined) throw new Unsupported(`${alias.unit.id}: a ${lang} make by a member (${make}) is not generated yet`);
    return foreignMake(foreignMakeOf(model, alias, lang, make, kind), kind, kind === 'map' ? container(alias, kind, 'map').head : '');
  }
  // GN-6af: the constructor of a value class without core_type makes an instance from the content, without the core.
  const kept = model.kept.find((k) => k.constructor.member.id === make);
  if (kept !== undefined) {
    const [field, ...more] = kept.fields;
    const holds = field === undefined || more.length > 0 ? undefined
      : (kind === 'object' || kind === 'map') && typeof field.type === 'object' && 'keyed_map' in field.type ? 'entries'
        : kind === 'reference' && typeof field.type === 'object' && 'unit' in field.type ? 'value'
          : undefined;
    if (holds === undefined || keptMake === undefined) throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} is not generated: a value class without core_type is made from an object or a map into its one keyed map, or from a reference into its one value (GN-6af)`);
    return keptMake(kept, field as KeptField, holds, kind === 'map' ? container(alias, kind, 'map').head : '');
  }
  const object = model.objects.find((o) => o.members.some((fn) => fn.member.id === make));
  const factory = object?.members.find((fn) => fn.member.id === make);
  const returns = factory?.returns;
  const makes = typeof returns === 'object' && 'unit' in returns && returns.unit === object?.unit.id && returns.library === undefined;
  if (object === undefined || factory === undefined || factory.receiver !== undefined || !makes) {
    throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} is no constructor or static member of a generated class that returns it (U-7)`);
  }
  const content = CONTENT[kind];
  const param = factory.params.length === 1 ? factory.params[0]?.type : undefined;
  if (content === undefined || param !== content.type) {
    throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} takes ${factory.params.map((p) => (typeof p.type === 'string' ? p.type : JSON.stringify(p.type))).join(', ') || 'no parameter'}, not the content of the kind (U-7)`);
  }
  if (factory.fallible || factory.failure) throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} can fail, which a make by a member is not generated for yet (U-7)`);
  return leaf(`${instance}${rustField(object.unit.name)}(${env}${factory.corePath}(${content.arg}))`);
}

// The match arms of the make function of one language: a row per kind, or a row per `when` of the kind. `env` is the
// first arguments of the out function of a class in the language, for a row that makes an instance by a member, and
// `instance` the prefix of the name of that function. `leaf` writes what an arm gives for the instance of a class that
// a member of this contract made, where the arms of a language give another type than the made value (GN-6as).
export function outArms(model: Model, alias: ValueAlias, lang: Lang, builtin: (form: string, kind: string) => string, noRow: string, env: string, keptMake?: KeptMake, instance = 'out_', foreignMake?: ForeignMakeWriter, leaf?: (made: string) => string): string[] {
  const rows = (alias.unit.out ?? []).filter((row) => row.make[lang] !== undefined);
  const kinds = [...new Set(rows.map((row) => row.kind))];
  return kinds.map((kind) => {
    const variant = VARIANT[kind];
    if (variant === undefined) throw new Unsupported(`no OutValue variant of the kind ${kind}`);
    const ofKind = rows.filter((row) => row.kind === kind);
    const form = (row: OutRow): string => {
      const make = row.make[lang];
      // T-2: a keyed map is made as a map, its keys of the kinds it lists through the rows of the alias, as its items.
      if (typeof make === 'object' && make !== null && 'keyed_map' in make && Object.keys(make).length === 1) return builtin('keyed_map', kind);
      if (typeof make !== 'string') throw new Unsupported(`${alias.unit.id}: a ${lang} make of the form ${JSON.stringify(make)} is not generated yet`);
      if (make.includes('.')) return byMember(model, alias, lang, make, kind, env, instance, keptMake, foreignMake, leaf);
      return builtin(make, kind);
    };
    const sameForm = new Set(ofKind.map((row) => JSON.stringify(row.make[lang]))).size === 1;
    const body = sameForm || ofKind.every((row) => row.when === undefined)
      ? form(ofKind[0] as OutRow)
      : ofKind.map((row, index) => {
        const when = row.when;
        const test = when === undefined || when === 'else'
          ? 'true'
          : `out.predicate(Predicate::${PREDICATE[when.predicate] ?? ''}) == Some(${String(when.is)})`;
        return `${index === 0 ? '' : 'else '}if ${test} { ${form(row)} }`;
      }).join(' ') + ` else { ${noRow} }`;
    return `        ${variant} => ${body},`;
  });
}

// GN-6af: how a language makes an instance of a value class without core_type from the content of an out row: the
// entries of an object or a map into its keyed map, or the value of a reference; head binds the handle and the length
// of a map, which the arm of an object binds itself.
export type KeptMake = (kept: KeptClass, field: KeptField, holds: 'entries' | 'value', head: string) => string;

// GN-6af, U-1: an in row of a value alias that names a class of the contract: an instance of the class is
// HostValue::Value with the kind of the row, and read gives the property that the row names.
export interface ValueRead {
  kind: string;
  // The Rust variant of ValueKind.
  variant: string;
  kept?: { unit: KeptClass; field: KeptField };
  object?: { unit: ObjectClass; property: Fn };
}

export function valueReads(model: Model, lang: Lang): ValueRead[] {
  const reads: ValueRead[] = [];
  for (const alias of model.aliases.filter((a) => a.library === undefined)) {
    for (const row of alias.unit.in ?? []) {
      const named = row[lang];
      if (typeof named !== 'string') continue;
      const kept = model.kept.find((k) => k.unit.id === named);
      const object = model.objects.find((o) => o.unit.id === named);
      if (kept === undefined && object === undefined) continue;
      const cases = row.cases ?? [];
      const [only] = cases;
      if (only === undefined || cases.length > 1 || only.when !== undefined) throw new Unsupported(`${alias.unit.id}: the ${lang} in row of the class ${named} has one case without when (GN-6af)`);
      const kind = only.kind;
      const variant = `ValueKind::${kind.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
      if (reads.some((r) => (r.kept?.unit ?? r.object?.unit) === (kept ?? object))) continue;
      if (kept !== undefined) {
        const field = kept.fields.find((f) => f.property?.id === only.read);
        if (field === undefined) throw new Unsupported(`${alias.unit.id}: the ${lang} in row of the class ${named} reads ${String(only.read)}, which is no property of the class (GN-6af)`);
        reads.push({ kind, variant, kept: { unit: kept, field } });
      } else if (object !== undefined) {
        const property = object.members.find((fn) => fn.member.id === only.read && fn.kind === 'property' && fn.receiver === '&self');
        if (property === undefined || typeof property.returns !== 'string' || !['bool', 'int', 'int64', 'float'].includes(property.returns)) {
          throw new Unsupported(`${alias.unit.id}: the ${lang} in row of the class ${named} reads ${String(only.read)}, which is no property of the class with &self that gives a bool, an integer or a float (GN-6af)`);
        }
        reads.push({ kind, variant, object: { unit: object, property } });
      }
    }
  }
  return reads;
}

// GN-6ar: the value aliases of other repositories, whose rows may name a class of their owner. A value class of another
// repository is no such alias: its rows name its own members (GN-6x).
const foreignAliases = (model: Model): ValueAlias[] => model.aliases.filter((a) => a.library !== undefined && a.owner === undefined);

const sameUnit = (type: Type | undefined, id: string): boolean => typeof type === 'object' && 'unit' in type && type.unit === id && type.library === undefined;

// GN-6ar: an out row of a value alias of another repository that names the constructor of a class of the owner: the
// constructor takes the content of the kind, the keyed map of the entries of an object or a map, or the value of a
// reference, which the writable property `set` of the class takes after the instance is made.
export interface ForeignMake {
  library: string;
  owner: Contract;
  unit: Unit;
  holds: 'content' | 'entries' | 'value';
  set?: Member;
}

// GN-6ar: how a language makes an instance of a class of the owner from the content of an out row; head binds the
// handle and the length of a map, which the arm of an object binds itself.
export type ForeignMakeWriter = (make: ForeignMake, kind: string, head: string) => string;

// GN-6ar: the content of a kind that a constructor of the owner takes as its one parameter, by its contract type.
const FOREIGN_CONTENT: Record<string, string> = { bool: 'bool', int: 'int', int64: 'int64', float: 'float' };

export function foreignMakeOf(model: Model, alias: ValueAlias, lang: Lang, make: string, kind: string): ForeignMake {
  const library = alias.library ?? '';
  const found = model.foreign.get(library);
  if (found === undefined) throw new Unsupported(`${alias.unit.id}: the contract of ${library} is not found, so the ${lang} make ${make} is not generated (GN-6ar)`);
  const owner = resolveNamedTypes(found);
  const unit = owner.units.find((u) => u.kind === 'class' && (u.members ?? []).some((m) => m.id === make));
  const member = (unit?.members ?? []).find((m) => m.id === make);
  if (unit === undefined || member === undefined || member.kind !== 'constructor' || member.visibility !== 'public' || unit.visibility !== 'public') {
    throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} is no public constructor of a public class of ${library}, and any other member is not generated yet (GN-6ar)`);
  }
  if (unit.only !== undefined && !unit.only.targets.includes(lang)) throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} names the class ${unit.id} of ${library}, which is not generated for ${lang} (GN-6ar, GN-6af)`);
  const parameters = member.parameters ?? [];
  const type = parameters.length === 1 ? parameters[0]?.type : undefined;
  if (type !== undefined && FOREIGN_CONTENT[kind] !== undefined && type === FOREIGN_CONTENT[kind]) return { library, owner, unit, holds: 'content' };
  if (type !== undefined && (kind === 'object' || kind === 'map') && typeof type === 'object' && 'keyed_map' in type && sameUnit(type.keyed_map, alias.unit.id)) return { library, owner, unit, holds: 'entries' };
  if (type !== undefined && kind === 'reference' && sameUnit(type, alias.unit.id)) {
    const name = JSON.stringify(parameters[0]?.name);
    const set = (unit.members ?? []).find((m) => m.kind === 'property' && m.writable === true && m.visibility === 'public' && JSON.stringify(m.name) === name);
    if (set === undefined) throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind reference needs a writable property of ${unit.id} with the name of the parameter, which takes the value after the reference is made (GN-6ar)`);
    return { library, owner, unit, holds: 'value', set };
  }
  throw new Unsupported(`${alias.unit.id}: the ${lang} make ${make} of the kind ${kind} takes ${parameters.map((p) => (typeof p.type === 'string' ? p.type : JSON.stringify(p.type))).join(', ') || 'no parameter'}, which is not generated: a constructor of a class of another repository takes a bool, an integer or a float of its kind, the keyed map of an object or a map, or the value of a reference (GN-6ar)`);
}

// GN-6ar: an in row of a value alias of another repository that names a class of the owner: an instance of the class
// is HostValue::Value with the kind of the row, and read gives the public property that the row names, as the
// HostValue of its type when that is a bool, an integer or a float, and described by the rules of the language
// otherwise.
export interface ForeignRead {
  alias: ValueAlias;
  library: string;
  owner: Contract;
  unit: Unit;
  // The Rust variant of ValueKind.
  variant: string;
  read: Member;
  as: 'Content' | 'Bool' | 'Int' | 'Float';
}

export function foreignReads(model: Model, lang: Lang): ForeignRead[] {
  const reads: ForeignRead[] = [];
  for (const alias of foreignAliases(model)) {
    const library = alias.library ?? '';
    const found = model.foreign.get(library);
    if (found === undefined) continue;
    const owner = resolveNamedTypes(found);
    for (const row of alias.unit.in ?? []) {
      const named = row[lang];
      // A class that is not generated for the language (GN-6af) is no class there: the row names a type of the language.
      const unit = typeof named === 'string' ? owner.units.find((u) => u.id === named && u.kind === 'class' && (u.only === undefined || u.only.targets.includes(lang))) : undefined;
      if (unit === undefined || reads.some((r) => r.unit.id === unit.id && r.library === library)) continue;
      const cases = row.cases ?? [];
      const [only] = cases;
      if (only === undefined || cases.length > 1 || only.when !== undefined) throw new Unsupported(`${alias.unit.id}: the ${lang} in row of the class ${unit.id} of ${library} has one case without when (GN-6ar)`);
      const read = (unit.members ?? []).find((m) => m.id === only.read && m.kind === 'property' && m.visibility === 'public');
      if (read === undefined) throw new Unsupported(`${alias.unit.id}: the ${lang} in row of the class ${unit.id} of ${library} reads ${String(only.read)}, which is no public property of the class (GN-6ar)`);
      const variant = `ValueKind::${only.kind.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
      const as = read.returns === 'bool' ? 'Bool' : read.returns === 'int' || read.returns === 'int64' ? 'Int' : read.returns === 'float' ? 'Float' : 'Content';
      reads.push({ alias, library, owner, unit, variant, read, as });
    }
  }
  return reads;
}

// GN-6ar: the classes of the owners that the rows of the value aliases of other repositories name for a language, in
// the order of the aliases: the classes of the in rows, then the classes of the out rows.
export function foreignRowClasses(model: Model, lang: Lang): { library: string; owner: Contract; unit: Unit }[] {
  const classes: { library: string; owner: Contract; unit: Unit }[] = foreignReads(model, lang).map((r) => ({ library: r.library, owner: r.owner, unit: r.unit }));
  for (const alias of foreignAliases(model)) {
    for (const row of alias.unit.out ?? []) {
      const make = row.make[lang];
      if (typeof make !== 'string' || !make.includes('.')) continue;
      const made = foreignMakeOf(model, alias, lang, make, row.kind);
      if (!classes.some((c) => c.library === made.library && c.unit.id === made.unit.id)) classes.push({ library: made.library, owner: made.owner, unit: made.unit });
    }
  }
  return classes;
}

// GN-6ar: a target that does not generate the class rows of a value alias of another repository refuses each by name.
export function refuseForeignReads(model: Model, lang: Lang): void {
  const [first] = foreignReads(model, lang);
  if (first !== undefined) throw new Unsupported(`${first.alias.unit.id}: the ${lang} in row of the class ${first.unit.id} of ${first.library} is not generated yet (GN-6ar)`);
}

// GN-6af: the HostValue of the value that the core path of a property gives, by its contract type.
export const readValue = (type: string): string => ({ bool: 'HostValue::Bool(value)', int: 'HostValue::Int(value)', int64: 'HostValue::Int(value)', float: 'HostValue::Float(value)' })[type] ?? '';

// GN-6u: the owner table of Node and PHP. A Native holds the owner, its generation and the key of the table of the
// owner thread, which holds the language reference, because a reference of that thread cannot be released on another
// one. A drop queues the key for its owner and releases the queue of its own thread; every entry point releases it
// too (`release_queue` in `guard`), and the cleanup of the owner releases the table and raises its generation.
// `reference` is the Rust type of the reference, and `release` the statement that releases the Vec `references`.
// `wakes` (Node) gives the owner a threadsafe function, which a drop on another thread calls to empty the queue on the
// owner thread, and which the cleanup aborts under the lock of the owners.
// GN-6u: the threadsafe function of a Node owner. A drop on another thread calls it, under the lock of the owners and
// for the generation of the function, so a call never reaches a function that the cleanup aborted.
const NODE_WAKER = `
/// GN-6u: the threadsafe function of an owner, or null before its table.
struct Waker(napi::sys::napi_threadsafe_function);

// SAFETY: napi allows napi_call_threadsafe_function from any thread, and the lock of the owners orders every call
// before the abort of the cleanup, which runs on the owner thread.
unsafe impl Send for Waker {}

/// GN-6u: wakes the owner thread to empty its queue, after a drop on another thread.
fn wake(owner: &Owner) {
    if owner.waker.0.is_null() || owner.thread == std::thread::current().id() {
        return;
    }
    // SAFETY: the function is alive while the generation of its owner is, which the caller checked under the lock of
    // the owners; a full or closing queue only gives its status, and the next entry point empties the queue.
    let _status: napi::sys::napi_status = unsafe { napi::sys::napi_call_threadsafe_function(owner.waker.0, std::ptr::null_mut(), napi::sys::ThreadsafeFunctionCallMode::nonblocking) };
}

/// GN-6u: the cleanup of the owner aborts its threadsafe function, which no later drop calls.
fn abort_waker(owner: &mut Owner) {
    let waker = std::mem::replace(&mut owner.waker, Waker(std::ptr::null_mut()));
    if waker.0.is_null() {
        return;
    }
    // SAFETY: the env cleanup hook runs on the owner thread before napi finalizes the function, which the owner made
    // before it added the hook.
    let _status: napi::sys::napi_status = unsafe { napi::sys::napi_release_threadsafe_function(waker.0, napi::sys::ThreadsafeFunctionReleaseMode::abort) };
}

/// GN-6u: the call of the threadsafe function on the owner thread, which empties the release queue.
extern "C" fn release_on_owner(_env: napi::sys::napi_env, _function: napi::sys::napi_value, _context: *mut std::ffi::c_void, _data: *mut std::ffi::c_void) {
    release_queue();
}
`;

export function ownedNatives(reference: string, release: string, wakes = false): string {
  return `
/// GN-6u: the owner of the language references of one thread: the generation of its table, which its cleanup raises,
/// and the keys of its Natives that were dropped, which the owner thread releases.${wakes ? ' The owner also keeps its\n/// thread and the threadsafe function that wakes it.' : ''}
struct Owner {
    generation: u64,
    released: Vec<u64>,${wakes ? `
    thread: std::thread::ThreadId,
    waker: Waker,` : ''}
}
${wakes ? NODE_WAKER : ''}
/// GN-6u: the owners, under the index that their Natives name.
static OWNERS: Mutex<Vec<Owner>> = Mutex::new(Vec::new());

/// GN-6u: the language references that this thread holds for its Natives, under their keys.
struct OwnerTable {
    owner: usize,
    generation: u64,
    next: u64,
    values: BTreeMap<u64, ${reference}>,
}

thread_local! {
    /// GN-6u: the index of the owner of this thread, which its later tables keep.
    static OWNER: std::cell::Cell<Option<usize>> = const { std::cell::Cell::new(None) };
    /// GN-6u: the table of this thread, until the cleanup of its owner.
    static OWNED: RefCell<Option<OwnerTable>> = const { RefCell::new(None) };
}

/// GN-6u: what a Native of this binding holds: the owner, its generation and the key of the table of the owner.
#[derive(Debug)]
struct OwnedNative {
    owner: usize,
    generation: u64,
    key: u64,
}

impl NativeObject for OwnedNative {}

impl Drop for OwnedNative {
    fn drop(&mut self) {
        let Ok(mut owners) = OWNERS.lock() else {
            return;
        };
        match owners.get_mut(self.owner) {
            Some(owner) if owner.generation == self.generation => ${wakes ? `{
                owner.released.push(self.key);
                wake(owner);
            }` : 'owner.released.push(self.key),'}
            _other => return,
        }
        drop(owners);
        release_queue();
    }
}

/// GN-6u: the owner of this thread and its generation; a thread is registered as an owner at its first Native.
fn native_owner() -> Option<(usize, u64)> {
    // A poisoned table of the owners gives no owner, which the caller reports as kind internal.
    let Ok(mut owners) = OWNERS.lock() else {
        return None;
    };
    let owner = match OWNER.get() {
        Some(owner) => owner,
        None => {
            owners.push(Owner { generation: 0, released: Vec::new()${wakes ? ', thread: std::thread::current().id(), waker: Waker(std::ptr::null_mut())' : ''} });
            let owner = owners.len() - 1;
            OWNER.set(Some(owner));
            owner
        }
    };
    owners.get(owner).map(|found| (owner, found.generation))
}

/// GN-6u: keeps a reference in the table of this thread and gives its Native.
fn keep_native(reference: ${reference}) -> Option<Native> {
    OWNED.with_borrow_mut(|owned| {
        let owned = owned.as_mut()?;
        owned.next = owned.next.saturating_add(1);
        owned.values.insert(owned.next, reference);
        Some(Native::new(OwnedNative { owner: owned.owner, generation: owned.generation, key: owned.next }))
    })
}

/// GN-6u: releases on the owner thread the references whose Natives were dropped; the references are released after
/// the table is no longer borrowed, since releasing one may run language code.
fn release_queue() {
    let Ok(Some(owner)) = OWNER.try_with(std::cell::Cell::get) else {
        return;
    };
    let keys = match OWNERS.lock() {
        Ok(mut owners) => match owners.get_mut(owner) {
            Some(owner) => std::mem::take(&mut owner.released),
            None => return,
        },
        // A poisoned table of the owners releases nothing here; the cleanup of the thread releases its table.
        Err(_poisoned) => return,
    };
    if keys.is_empty() {
        return;
    }
    let taken = OWNED.try_with(|owned| {
        // A table that is borrowed now keeps the references; the cleanup of the thread releases them.
        let Ok(mut owned) = owned.try_borrow_mut() else {
            return None;
        };
        let owned = owned.as_mut()?;
        Some(keys.iter().filter_map(|key| owned.values.remove(key)).collect::<Vec<${reference}>>())
    });
    if let Ok(Some(references)) = taken {
        ${release}
    }
}

/// GN-6u: the cleanup of the owner of this thread: it releases what the table holds and raises the generation, so that
/// a later drop of a Native of the table touches nothing and its out is kind internal.
fn clean_up_native() {
    let Ok(Some(owner)) = OWNER.try_with(std::cell::Cell::get) else {
        return;
    };
    // A poisoned table of the owners has no generation to raise; the table of this thread is still released below.
    if let Ok(mut owners) = OWNERS.lock() {
        if let Some(owner) = owners.get_mut(owner) {
            owner.generation = owner.generation.saturating_add(1);
            owner.released.clear();${wakes ? `
            abort_waker(owner);` : ''}
        }
    }
    let taken = OWNED.try_with(|owned| match owned.try_borrow_mut() {
        Ok(mut owned) => owned.take(),
        // A table that is borrowed at the cleanup cannot be taken; the raised generation keeps a later drop of one of
        // its Natives from touching it.
        Err(_borrowed) => None,
    });
    if let Ok(Some(owned)) = taken {
        let references: Vec<${reference}> = owned.values.into_values().collect();
        ${release}
    }
}
`;
}

// U-3, GN-6z: a failure of the binding in a call of a function on a thread other than its owner (wrong_thread) is held
// by its Raised as its BindingError, which any thread may hold; the owner thread makes it its error.
export const elsewhereRust = (model: Model): string => `
/// U-3, GN-6z: what the Raised of a failure of the binding on another thread holds.
#[derive(Debug)]
struct Elsewhere(BindingError);

impl binding_core::NativeObject for Elsewhere {}

fn thrown_elsewhere(error: BindingError) -> binding_core::Failure<${model.coreError ?? '()'}> {
    binding_core::Failure::Raised(binding_core::Raised::from_generated(binding_core::Native::new(Elsewhere(error))))
}

fn elsewhere(raised: &binding_core::Raised) -> Fail {
    match raised.native().downcast::<Elsewhere>() {
        Some(error) => binding_error(error.0.clone()),
        None => binding_error(BindingError::Internal { detail: String::from("U-3: the exception of the callback is gone") }),
    }
}
`;

// U-3, GN-6u: the thrown objects of Node and PHP, which belong to the thread that threw them. A Raised holds the number
// of that thread and the key of the object in its table THROWN; its last drop removes the entry on that thread, or,
// on another thread, queues the key for that thread while it lives. The thread removes its queued keys when it next
// keeps or throws again an exception, and its end discards its queue.
export const THREAD_THROWN = `
/// U-3, GN-6u: the threads that keep thrown objects, and the keys of the Raised that were dropped on another thread,
/// with the thread that keeps each.
struct Dropped {
    live: BTreeSet<u64>,
    keys: Vec<(u64, u64)>,
}

static DROPPED: Mutex<Dropped> = Mutex::new(Dropped { live: BTreeSet::new(), keys: Vec::new() });

static NEXT_THREAD: AtomicU64 = AtomicU64::new(1);

/// U-3, GN-6u: the number of a thread that keeps thrown objects; its end discards the keys queued for it.
struct ThrownThread(u64);

impl ThrownThread {
    fn new() -> Self {
        let number = NEXT_THREAD.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut dropped) = DROPPED.lock() {
            dropped.live.insert(number);
        }
        Self(number)
    }
}

impl Drop for ThrownThread {
    fn drop(&mut self) {
        if let Ok(mut dropped) = DROPPED.lock() {
            dropped.live.remove(&self.0);
            dropped.keys.retain(|&(thread, _key)| thread != self.0);
        }
    }
}

thread_local! {
    static THROWN_THREAD: ThrownThread = ThrownThread::new();
}

/// U-3, GN-6u: the number of this thread; 0, which no thread has, when the thread is ending.
fn thrown_thread() -> u64 {
    let Ok(thread) = THROWN_THREAD.try_with(|thread| thread.0) else {
        return 0;
    };
    thread
}

/// U-3, GN-6u: what a Raised holds: the thread that keeps the thrown object and its key in THROWN.
#[derive(Debug)]
struct ThrownKey {
    thread: u64,
    key: u64,
}

impl binding_core::NativeObject for ThrownKey {}

impl Drop for ThrownKey {
    fn drop(&mut self) {
        if thrown_thread() == self.thread {
            let removed = THROWN.try_with(|map| match map.try_borrow_mut() {
                Ok(mut map) => Some(map.remove(&self.key)),
                // A table that is borrowed now cannot take the removal, so the key goes to DROPPED below.
                Err(_borrowed) => None,
            });
            if let Ok(Some(taken)) = removed {
                drop(taken);
                return;
            }
        }
        if let Ok(mut dropped) = DROPPED.lock() {
            if dropped.live.contains(&self.thread) {
                dropped.keys.push((self.thread, self.key));
            }
        }
    }
}

/// U-3, GN-6u: removes the thrown objects of this thread whose Raised were dropped on another thread.
fn release_dropped() {
    let thread = thrown_thread();
    let mut keys = Vec::new();
    if let Ok(mut dropped) = DROPPED.lock() {
        dropped.keys.retain(|&(owner, key)| {
            if owner == thread {
                keys.push(key);
            }
            owner != thread
        });
    }
    if keys.is_empty() {
        return;
    }
    let taken = THROWN.try_with(|map| match map.try_borrow_mut() {
        Ok(mut map) => keys.iter().filter_map(|key| map.remove(key)).collect::<Vec<Thrown>>(),
        // A table that is borrowed now keeps those objects until the cleanup of the thread releases it.
        Err(_borrowed) => Vec::new(),
    });
    drop(taken);
}

/// U-3: keeps what was thrown on this thread and gives the Raised that names it.
fn keep_thrown(error: Thrown) -> binding_core::Raised {
    release_dropped();
    let key = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    THROWN.with_borrow_mut(|map| map.insert(key, error));
    binding_core::Raised::from_generated(binding_core::Native::new(ThrownKey { thread: thrown_thread(), key }))
}

/// U-3: takes what was thrown under the Raised, when it is of this thread.
fn take_thrown(raised: &binding_core::Raised) -> Option<Thrown> {
    release_dropped();
    let thrown = raised.native().downcast::<ThrownKey>()?;
    if thrown.thread != thrown_thread() {
        return None;
    }
    THROWN.with_borrow_mut(|map| map.remove(&thrown.key))
}
`;

// GN-6x: the enum ReadAs of a host has the variants that an in case of the contract constructs, and the match of the
// read has their arms: a variant that no case constructs is dead code, which the lints deny. The text of a host marks
// the arm and the variant of each name, and a name that the text constructs nowhere else is left out with them.
export function readAsVariants(host: string): string {
  return ['Content', 'Units', 'TextOr', 'Items', 'Bool', 'Int', 'Float'].reduce((text, variant) => {
    const marked = new RegExp(`[ \\t]*/\\*${variant}\\{\\*/\\n([\\s\\S]*?\\n)[ \\t]*/\\*\\}${variant}\\*/\\n`, 'g');
    const constructed = text.replace(marked, '').includes(`ReadAs::${variant}`);
    return text.replace(marked, constructed ? '$1' : '');
  }, host);
}

// GN-6as: a make function walks the OutValue of the core in a loop with a work stack, and never calls itself. The items
// of the walk are items of the make function, so they share no name with an item of the crate: OutLevel, a container
// whose children are made next; OutFill, the container of the language that takes them; and OutStep, what the walk does next.
// An arm of the match of an OutValue gives an OutStep: Put for a value without children, and Enter for a container.
export interface LevelParts {
  // Whether the children are read from the source by the handle of the container, one for each index below its length.
  walks: boolean;
  // The OutValue that is made first: the one value of a reference.
  waiting?: string;
  fill: string;
  // The value of the language that the container is, where it is made before its children.
  made?: string;
}

export interface Walk {
  // What an arm gives for a made value, and for the Result of a made value.
  put: (value: string) => string;
  leaf: (made: string) => string;
  level: (parts: LevelParts) => string;
}

// A container of the language that takes made children: its variant of OutFill, how a made child is put, and the next
// child that the walk makes, which is None for a container that takes the one value of a reference.
export interface Fill {
  name: string;
  doc: string;
  type: string;
  pattern: string;
  put: string;
  next?: string;
}

export const PUT_ENTRY = (set: string): string => `match key.take() {
    Some(key) => {
        ${set}
        level.index = level.index.saturating_add(1);
    }
    None => *key = Some(value),
}`;

export const NEXT_ENTRY = `{
    let (key, value) = source.entry(level.handle, level.index);
    level.waiting = Some(value);
    Some(key)
}`;

const indent = (text: string, by: number): string => text.split('\n').map((line) => (line === '' ? '' : `${' '.repeat(by)}${line}`)).join('\n');

// One statement for each variant of OutFill: a match, or a let where OutFill has one variant, whose match clippy
// refuses as a match of one arm that cannot fail.
const perFill = (fills: Fill[], on: string, body: (fill: Fill) => string, pattern: (fill: Fill) => string = (fill) => fill.pattern): string => {
  const [only, ...more] = fills;
  if (only !== undefined && more.length === 0) return `let ${pattern(only)} = ${on};\n${body(only)}`;
  return `match ${on} {\n${fills.map((fill) => `    ${pattern(fill)} => {\n${indent(body(fill), 8)}\n    }`).join('\n')}\n}`;
};

// GN-6as: how the make function of a language is written: its generic parameters, the type arguments of the items of
// the walk, the first parameters and arguments of the language, the type of a made value, the Result of a type, the
// failure of kind internal with a detail, and the name of the language for the comments.
export interface WalkShape {
  generics: string;
  life: string;
  anon: string;
  env: { params: string; args: string };
  value: string;
  result: (type: string) => string;
  internal: (detail: string) => string;
  language: string;
}

// GN-6as: the make function of a value alias: the items of the walk, the function that opens one OutValue by the arms of
// the alias, and the loop. `arms` writes the arms with the Walk that they give their steps through; `kept` is the
// extra parameter of the function, the made containers by their handles, with which the arms read the OutValue again
// for a `when`; and `close` writes the value of a container that a member makes from its made children, for each variant.
export function walkRust(shape: WalkShape, name: string, fills: Fill[], arms: (walk: Walk) => string, tail: string, opened: string, kept?: { name: string; type: string }, close?: { head: string; of: (fill: Fill) => string }): string {
  const { generics, life, anon, env, value: made_, result } = shape;
  const plain: Walk = { put: (value) => `Ok(${value})`, leaf: (made) => made, level: () => '' };
  const probe = arms({ put: (value) => `Ok(OutStep::Put(${value}))`, leaf: (made) => `${made}.map(OutStep::Put)`, level: (parts) => `OutStep::Enter(${parts.fill})` });
  const used = fills.filter((fill) => probe.includes(`OutFill::${fill.name}(`));
  if (used.length === 0) {
    // No row makes a container, so the value has no children and the function has no walk.
    return `
fn make_${name}${generics}(${env.params}out: OutValue, _source: &mut dyn OutValues${kept === undefined ? '' : `, _${kept.name}: ${kept.type}`}) -> ${result(made_)} {
${opened === '' ? '' : `    ${opened}\n`}    match out${kept === undefined ? '' : '.clone()'} {
${arms(plain)}
        ${tail}
    }
}
`;
  }
  const walked = used.some((fill) => fill.next !== undefined);
  const made = close === undefined;
  const walk: Walk = {
    put: (value) => `Ok(OutStep::Put(${value}))`,
    leaf: (result) => `${result}.map(OutStep::Put)`,
    level: (parts) => `Ok(OutStep::Enter(OutLevel { ${walked ? `handle, ${parts.walks ? 'len' : 'len: 0'}, index: 0, ` : ''}waiting: ${parts.waiting ?? 'None'}, fill: ${parts.fill}${made ? `, made: ${parts.made ?? ''}` : ''} }))`,
  };
  const body = arms(walk);
  const next = walked
    ? `if level.index >= level.len {
    return None;
}
${used.length === 1
    ? (used[0]?.next ?? 'None')
    : `match level.fill {\n${used.map((fill) => `    OutFill::${fill.name}(..) => ${indent(fill.next ?? 'None', 4).trimStart()}${(fill.next ?? '').startsWith('{') ? '' : ','}`).join('\n')}\n}`}`
    : '';
  const closed = close === undefined ? '' : `
    // GN-6as: the value of a level whose children are all made, which a member of the owner makes from them.
    fn close_level${generics}(${env.params}level: OutLevel${life}) -> ${result(made_)} {
${close.head === '' ? '' : `        ${close.head}\n`}${indent(perFill(used, 'level.fill', close.of, (fill) => fill.pattern.replace(', key)', ', _key)')), 8)}
    }`;
  return `
fn make_${name}${generics}(${env.params}out: OutValue, ${walked ? 'source' : '_source'}: &mut dyn OutValues${kept === undefined ? '' : `, ${kept.name}: ${kept.type}`}) -> ${result(made_)} {
    // GN-6as: a container whose children are made next: an entry of the work stack of the walk.${walked ? ' The children are\n    // read from the source by the handle, one for each index below the length.' : ''} waiting is the value that
    // is made first: the value of the entry whose key was made, or the one value of a reference.
    struct OutLevel${life} {${walked ? `
        handle: Handle,
        len: u64,
        index: u64,` : ''}
        waiting: Option<OutValue>,
        fill: OutFill${life},${made ? `
        made: ${made_},` : ''}
    }
    // GN-6as: the container of ${shape.language} that takes the made children of a level.
    enum OutFill${life} {
${used.map((fill) => `        // ${fill.doc}\n        ${fill.name}(${fill.type}),`).join('\n')}
    }
    // GN-6as: what the walk does next: it opens a value, enters a container, puts a made value into the level that
    // waits for it, or asks the innermost level for its next child.
    enum OutStep${life} {
        Open(OutValue),
        Enter(OutLevel${life}),
        Put(${made_}),
        Next,
    }
    // GN-6as: one value: a value without children is made, and a container is entered before its children are made.
    fn open_level${generics}(${env.params}out: OutValue${kept === undefined ? '' : `, ${kept.name}: ${kept.type}`}) -> ${result(`OutStep${life}`)} {
${opened === '' ? '' : `        ${opened}\n`}        match out${kept === undefined ? '' : '.clone()'} {
${indent(body, 4)}
            ${tail}
        }
    }
    // GN-6as: the next child of a level that the walk makes, or None when every child is made.
    fn next_child(level: &mut OutLevel${anon}${walked ? ', source: &mut dyn OutValues' : ''}) -> Option<OutValue> {
${walked ? `        if let Some(waiting) = level.waiting.take() {
            return Some(waiting);
        }
${indent(next, 8)}` : '        level.waiting.take()'}
    }
    // GN-6as: a made child goes into the container of the level that waits for it.
    fn put_child${generics}(level: &mut OutLevel${life}, value: ${made_}) -> ${result('()')} {
${indent(perFill(used, '&mut level.fill', (fill) => fill.put), 8)}
        Ok(())
    }${closed}
    let mut levels: Vec<OutLevel${life}> = Vec::new();
    let mut step = OutStep::Open(out);
    loop {
        step = match step {
            OutStep::Open(out) => open_level(${env.args}out${kept === undefined ? '' : `, ${kept.name}`})?,
            OutStep::Enter(level) => {
                levels.push(level);
                OutStep::Next
            }
            OutStep::Put(value) => match levels.last_mut() {
                Some(level) => {
                    put_child(level, value)?;
                    OutStep::Next
                }
                None => return Ok(value),
            },
            OutStep::Next => match levels.pop() {
                Some(mut level) => match next_child(&mut level${walked ? ', source' : ''}) {
                    Some(child) => {
                        levels.push(level);
                        OutStep::Open(child)
                    }
                    None => OutStep::Put(${made ? 'level.made' : `close_level(${env.args}level)?`}),
                },
                None => return ${shape.internal('String::from("GN-6as: the walk has no level to fill")')},
            },
        };
    }
}
`;
}
