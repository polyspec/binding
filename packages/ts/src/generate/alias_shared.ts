// U-7: what the conversions of a value alias share across languages: the OutValue variant of each kind, the rows of a
// language selected by kind and `when`, and the parts of a container kind that a list or a map form reads.

import type { OutRow } from '../contract.ts';
import type { Lang } from '../contract.ts';
import { type Fn, type KeptClass, type KeptField, type Model, type ObjectClass, Unsupported, type ValueAlias, rustField } from './model.ts';

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
function byMember(model: Model, alias: ValueAlias, lang: Lang, make: string, kind: string, env: string, instance: string, keptMake?: KeptMake): string {
  if (alias.library !== undefined) throw new Unsupported(`${alias.unit.id}: a ${lang} make by a member (${make}) is not generated yet`);
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
  return `${instance}${rustField(object.unit.name)}(${env}${factory.corePath}(${content.arg}))`;
}

// The match arms of the make function of one language: a row per kind, or a row per `when` of the kind. `env` is the
// first arguments of the out function of a class in the language, for a row that makes an instance by a member, and
// `instance` the prefix of the name of that function.
export function outArms(model: Model, alias: ValueAlias, lang: Lang, builtin: (form: string, kind: string) => string, noRow: string, env: string, keptMake?: KeptMake, instance = 'out_'): string[] {
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
      if (make.includes('.')) return byMember(model, alias, lang, make, kind, env, instance, keptMake);
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
struct Owned {
    owner: usize,
    generation: u64,
    next: u64,
    values: BTreeMap<u64, ${reference}>,
}

thread_local! {
    /// GN-6u: the index of the owner of this thread, which its later tables keep.
    static OWNER: std::cell::Cell<Option<usize>> = const { std::cell::Cell::new(None) };
    /// GN-6u: the table of this thread, until the cleanup of its owner.
    static OWNED: RefCell<Option<Owned>> = const { RefCell::new(None) };
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
    let mut owners = OWNERS.lock().ok()?;
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
    let keys = match OWNERS.lock().as_mut().ok().and_then(|owners| owners.get_mut(owner)) {
        Some(owner) => std::mem::take(&mut owner.released),
        None => return,
    };
    if keys.is_empty() {
        return;
    }
    let taken = OWNED.try_with(|owned| {
        let mut owned = owned.try_borrow_mut().ok()?;
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
    if let Some(owner) = OWNERS.lock().as_mut().ok().and_then(|owners| owners.get_mut(owner)) {
        owner.generation = owner.generation.saturating_add(1);
        owner.released.clear();${wakes ? `
        abort_waker(owner);` : ''}
    }
    let taken = OWNED.try_with(|owned| owned.try_borrow_mut().ok().and_then(|mut owned| owned.take()));
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
            let removed = THROWN.try_with(|map| map.try_borrow_mut().ok().map(|mut map| map.remove(&self.key)));
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
    let taken = THROWN.try_with(|map| map.try_borrow_mut().ok().map(|mut map| keys.iter().filter_map(|key| map.remove(key)).collect::<Vec<Thrown>>()));
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
