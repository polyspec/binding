// U-7: what the conversions of a value alias share across languages: the OutValue variant of each kind, the rows of a
// language selected by kind and `when`, and the parts of a container kind that a list or a map form reads.

import type { OutRow } from '../contract.ts';
import type { Lang } from '../contract.ts';
import { type Model, Unsupported, type ValueAlias, rustField } from './model.ts';

// The predicate methods of OutValue for a `when` of a row (binding_core::Predicate).
const PREDICATE: Record<string, string> = {
  utf8: 'Utf8', sequence_keys: 'SequenceKeys', safe_integer: 'SafeInteger', integral_float: 'IntegralFloat',
};

// The OutValue variant of each kind and how its content is bound in a match arm.
const VARIANT: Record<string, string> = {
  null: 'OutValue::Null', bool: 'OutValue::Bool(value)', int: 'OutValue::Int(value)', int64: 'OutValue::Int64(value)',
  float: 'OutValue::Float(value)', number: 'OutValue::Number(value)', text: 'OutValue::Text(value)', bytes: 'OutValue::Bytes(value)',
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
function byMember(model: Model, alias: ValueAlias, lang: Lang, make: string, kind: string, env: string): string {
  if (alias.library !== undefined) throw new Unsupported(`${alias.unit.id}: a ${lang} make by a member (${make}) is not generated yet`);
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
  return `out_${rustField(object.unit.name)}(${env}${factory.corePath}(${content.arg}))`;
}

// The match arms of the make function of one language: a row per kind, or a row per `when` of the kind. `env` is the
// first arguments of the out function of a class in the language, for a row that makes an instance by a member.
export function outArms(model: Model, alias: ValueAlias, lang: Lang, builtin: (form: string, kind: string) => string, noRow: string, env: string): string[] {
  const rows = (alias.unit.out ?? []).filter((row) => row.make[lang] !== undefined);
  const kinds = [...new Set(rows.map((row) => row.kind))];
  return kinds.map((kind) => {
    const variant = VARIANT[kind];
    if (variant === undefined) throw new Error(`no OutValue variant of the kind ${kind}`);
    const ofKind = rows.filter((row) => row.kind === kind);
    const form = (row: OutRow): string => {
      const make = row.make[lang];
      // T-2: a keyed map is made as a map, its keys of the kinds it lists through the rows of the alias, as its items.
      if (typeof make === 'object' && make !== null && 'keyed_map' in make && Object.keys(make).length === 1) return builtin('keyed_map', kind);
      if (typeof make !== 'string') throw new Unsupported(`${alias.unit.id}: a ${lang} make of the form ${JSON.stringify(make)} is not generated yet`);
      if (make.includes('.')) return byMember(model, alias, lang, make, kind, env);
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

// GN-6o: the owner table of Node and PHP. A Native holds the owner, its generation and the key of the table of the
// owner thread, which holds the language reference, because a reference of that thread cannot be released on another
// one. A drop queues the key for its owner and releases the queue of its own thread; every entry point releases it
// too (`release_queue` in `guard`), and the cleanup of the owner releases the table and raises its generation.
// `reference` is the Rust type of the reference, and `release` the statement that releases the Vec `references`.
export function ownedNatives(reference: string, release: string): string {
  return `
/// GN-6o: the owner of the language references of one thread: the generation of its table, which its cleanup raises,
/// and the keys of its Natives that were dropped, which the owner thread releases.
struct Owner {
    generation: u64,
    released: Vec<u64>,
}

/// GN-6o: the owners, under the index that their Natives name.
static OWNERS: Mutex<Vec<Owner>> = Mutex::new(Vec::new());

/// GN-6o: the language references that this thread holds for its Natives, under their keys.
struct Owned {
    owner: usize,
    generation: u64,
    next: u64,
    values: BTreeMap<u64, ${reference}>,
}

thread_local! {
    /// GN-6o: the index of the owner of this thread, which its later tables keep.
    static OWNER: std::cell::Cell<Option<usize>> = const { std::cell::Cell::new(None) };
    /// GN-6o: the table of this thread, until the cleanup of its owner.
    static OWNED: RefCell<Option<Owned>> = const { RefCell::new(None) };
}

/// GN-6o: what a Native of this binding holds: the owner, its generation and the key of the table of the owner.
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
            Some(owner) if owner.generation == self.generation => owner.released.push(self.key),
            _other => return,
        }
        drop(owners);
        release_queue();
    }
}

/// GN-6o: the owner of this thread and its generation; a thread is registered as an owner at its first Native.
fn native_owner() -> Option<(usize, u64)> {
    let mut owners = OWNERS.lock().ok()?;
    let owner = match OWNER.get() {
        Some(owner) => owner,
        None => {
            owners.push(Owner { generation: 0, released: Vec::new() });
            let owner = owners.len() - 1;
            OWNER.set(Some(owner));
            owner
        }
    };
    owners.get(owner).map(|found| (owner, found.generation))
}

/// GN-6o: keeps a reference in the table of this thread and gives its Native.
fn keep_native(reference: ${reference}) -> Option<Native> {
    OWNED.with_borrow_mut(|owned| {
        let owned = owned.as_mut()?;
        owned.next = owned.next.saturating_add(1);
        owned.values.insert(owned.next, reference);
        Some(Native::new(OwnedNative { owner: owned.owner, generation: owned.generation, key: owned.next }))
    })
}

/// GN-6o: releases on the owner thread the references whose Natives were dropped; the references are released after
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

/// GN-6o: the cleanup of the owner of this thread: it releases what the table holds and raises the generation, so that
/// a later drop of a Native of the table touches nothing and its out is kind internal.
fn clean_up_native() {
    let Ok(Some(owner)) = OWNER.try_with(std::cell::Cell::get) else {
        return;
    };
    if let Some(owner) = OWNERS.lock().as_mut().ok().and_then(|owners| owners.get_mut(owner)) {
        owner.generation = owner.generation.saturating_add(1);
        owner.released.clear();
    }
    let taken = OWNED.try_with(|owned| owned.try_borrow_mut().ok().and_then(|mut owned| owned.take()));
    if let Ok(Some(owned)) = taken {
        let references: Vec<${reference}> = owned.values.into_values().collect();
        ${release}
    }
}
`;
}

// U-3, GN-6m: a failure of the binding in a call of a function on a thread other than its owner (wrong_thread) is kept
// as its BindingError, which any thread may hold, under the handle of its Raised; the owner thread makes it its error.
export const elsewhereRust = (model: Model): string => `
static ELSEWHERE: Mutex<BTreeMap<u64, BindingError>> = Mutex::new(BTreeMap::new());

fn thrown_elsewhere(error: BindingError) -> binding_core::Failure<${model.coreError ?? '()'}> {
    let handle = NEXT_THROWN.fetch_add(1, Ordering::Relaxed);
    if let Ok(mut map) = ELSEWHERE.lock() {
        map.insert(handle, error);
    }
    binding_core::Failure::Raised(binding_core::Raised::from_generated(binding_core::Handle::new(handle)))
}

fn elsewhere(raised: &binding_core::Raised) -> Fail {
    match ELSEWHERE.lock().ok().and_then(|mut map| map.remove(&raised.handle().raw())) {
        Some(error) => binding_error(error),
        None => binding_error(BindingError::Internal { detail: String::from("U-3: the exception of the callback is gone") }),
    }
}
`;
