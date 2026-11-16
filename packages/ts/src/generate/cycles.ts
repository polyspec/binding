// GN-6bt: the cycles of records and variants of a contract, whose conversions walk a value with a work stack on the
// heap. A conversion that called the conversion of the unit of each place used native stack in proportion to the depth
// of the value, which a debug WASM module of 1 MiB of stack ran out of at 62 levels of a variant.

import type { Field, Type, Unit } from '../contract.ts';
import { type Model, holdsCallback, holdsFunction, libraryOf, rustField, unitOf, UNIT_CASE_ALLOW } from './model.ts';

export interface Cycle {
  index: number;
  units: Unit[];
}

const fieldsOf = (unit: Unit): Field[] => (unit.kind === 'record' ? (unit.fields ?? []) : unit.kind === 'variant' ? (unit.cases ?? []).flatMap((c) => c.fields) : []);

// The records and variants of this contract that a type names, inside any list, optional, map or tuple.
function unitsIn(model: Model, type: Type): Unit[] {
  if (typeof type === 'string') return [];
  if ('list' in type) return unitsIn(model, type.list);
  if ('optional' in type) return unitsIn(model, type.optional);
  if ('map' in type) return unitsIn(model, type.map);
  if ('keyed_map' in type) return unitsIn(model, type.keyed_map);
  if ('tuple' in type) return type.tuple.flatMap((part) => unitsIn(model, part));
  if (!('unit' in type) || libraryOf(type) !== undefined) return [];
  const unit = unitOf(model, type);
  return unit !== undefined && (unit.kind === 'record' || unit.kind === 'variant') ? [unit] : [];
}

// Whether a type holds a unit of the members inside a tuple, which the core may hold as an array (GN-6ac); such a
// cycle keeps the conversions that call each other.
function tupleHolds(model: Model, members: readonly Unit[], type: Type): boolean {
  if (typeof type === 'string') return false;
  if ('tuple' in type) return type.tuple.some((part) => unitsIn(model, part).some((u) => members.some((m) => m.id === u.id)));
  if ('list' in type) return tupleHolds(model, members, type.list);
  if ('optional' in type) return tupleHolds(model, members, type.optional);
  if ('map' in type) return tupleHolds(model, members, type.map);
  if ('keyed_map' in type) return tupleHolds(model, members, type.keyed_map);
  return false;
}

// GN-6bt: the cycles among the records and variants whose conversions a target generates (`emitted`), each a strongly
// connected set of units of which one reaches itself through the types of fields; a cycle whose fields hold a
// callback or a function keeps the conversions that call each other, because its core types carry a lifetime of the
// call.
export function cycles(model: Model, emitted: readonly Unit[]): Cycle[] {
  const ids = new Set(emitted.map((u) => u.id));
  const edges = new Map(emitted.map((u) => [u.id, [...new Set(fieldsOf(u).flatMap((f) => unitsIn(model, f.type)).filter((n) => ids.has(n.id)).map((n) => n.id))]]));
  const byId = new Map(emitted.map((u) => [u.id, u]));
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const found: Unit[][] = [];
  let next = 0;
  const visit = (id: string): void => {
    index.set(id, next);
    low.set(id, next);
    next += 1;
    stack.push(id);
    on.add(id);
    for (const to of edges.get(id) ?? []) {
      if (!index.has(to)) {
        visit(to);
        low.set(id, Math.min(low.get(id) ?? 0, low.get(to) ?? 0));
      } else if (on.has(to)) low.set(id, Math.min(low.get(id) ?? 0, index.get(to) ?? 0));
    }
    if (low.get(id) !== index.get(id)) return;
    const members: string[] = [];
    for (;;) {
      const top = stack.pop();
      if (top === undefined) break;
      on.delete(top);
      members.push(top);
      if (top === id) break;
    }
    const recurs = members.length > 1 || (edges.get(id) ?? []).includes(id);
    if (recurs) found.push(emitted.filter((u) => members.includes(u.id)));
  };
  for (const unit of emitted) if (!index.has(unit.id)) visit(unit.id);
  const units = new Map(model.contract.units.map((u) => [u.id, u]));
  return found
    .filter((members) => !members.some((u) => fieldsOf(u).some((f) => holdsCallback(units, f.type) || holdsFunction(f.type) || tupleHolds(model, members, f.type))))
    .map((members) => members.filter((u) => byId.has(u.id)))
    .sort((a, b) => emitted.indexOf(a[0] as Unit) - emitted.indexOf(b[0] as Unit))
    .map((members, i) => ({ index: i, units: members }));
}

export const cycleOf = (all: readonly Cycle[], unit: Unit): Cycle | undefined => all.find((c) => c.units.some((u) => u.id === unit.id));

// Whether a type names a unit of the cycle.
export const holdsCycle = (model: Model, cycle: { units: readonly Unit[] }, type: Type): boolean => unitsIn(model, type).some((u) => cycle.units.some((c) => c.id === u.id));

// The model of a conversion of a unit of the cycle in one mode.
export const walkModel = (model: Model, cycle: Cycle, mode: 'out' | 'in' | 'kids'): Model => ({ ...model, cycleWalk: { units: cycle.units, index: cycle.index, mode, base: model.cycleWalk?.base ?? model } });

// The number of a unit in its cycle, when the conversion being generated walks the cycle of the unit.
export function walkUnit(model: Model, type: Type): number | undefined {
  const walk = model.cycleWalk;
  if (walk === undefined || typeof type === 'string' || !('unit' in type) || libraryOf(type) !== undefined) return undefined;
  const at = walk.units.findIndex((u) => u.id === type.unit);
  return at < 0 ? undefined : at;
}

// The language side of a target, which the walk of the cycle is generated for.
export interface CycleHost {
  // The value of the language that a frame of the walk in owns, and the type that the conversion out makes.
  lang: string;
  made: string;
  // The value that the conversion in of a unit takes, and the doc line of the conversions in and out of a unit.
  inValue: string;
  // The argument of the conversion in of a unit from the owned value, and the owned value from a place.
  give: (owned: string) => string;
  own: (place: string) => string;
  // The result type of a conversion, and a failure of kind internal.
  result: (type: string) => string;
  internal: (detail: string) => string;
  // The generic parameters, the leading parameters and their arguments of the conversions in and out.
  inGenerics: string;
  inParams: string;
  // The context that the place of a closure passes to kid_in, which the closure takes and the lints deny unused.
  kidContext?: { param: string; arg: string };
  inArgs: string;
  outGenerics: string;
  outParams: string;
  outArgs: string;
}

const MISSING = 'GN-6bt: a conversion of a cycle found no made value of a place';

// The expression of a place of a unit of the cycle in a conversion of the cycle: the value made before (out, in), or
// the value of the language, kept for the walk (kids).
export function cycleLeaf(model: Model, host: CycleHost, type: Type, value: string, subject: string): string | undefined {
  const at = walkUnit(model, type);
  const walk = model.cycleWalk;
  if (at === undefined || walk === undefined) return undefined;
  if (walk.mode === 'kids') return `kid_in(${host.kidContext?.arg ?? ''}kids, ${host.own(value)}, ${at}, ${subject})`;
  if (walk.mode === 'in') return `cycle${walk.index}_u${at}(made_next(made, ${value})).ok_or_else(|| ${host.internal(MISSING)})`;
  return `made_next(made, ${value}).ok_or_else(|| ${host.internal(MISSING)})`;
}

// The signature of the conversion of a unit of the cycle in a mode: the parameters that follow the value, and the
// name.
export const madeParam = (host: CycleHost, cycle: Cycle, mode: 'out' | 'in' | 'kids'): string =>
  mode === 'out' ? `made: &std::cell::RefCell<std::vec::IntoIter<${host.made}>>` : mode === 'in' ? `made: &std::cell::RefCell<std::vec::IntoIter<Cycle${cycle.index}Made>>` : `kids: &std::cell::RefCell<Vec<(${host.lang}, usize, String)>>`;

// The Rust walk of the core values of a cycle, which no language takes part in: the reference to a value of a unit of
// the cycle, and the values of units of the cycle that it holds in the order of its fields.
export function coreWalk(model: Model, cycle: Cycle): string {
  const k = cycle.index;
  // The expression is a reference (an item, a field of a case) or a place of a record field, which the loop of a list
  // or a map walks as it is and the other places borrow: `&value.body.iter()` would borrow the iterator (B2.390).
  const walk = (type: Type, expr: string, depth: number, place = false): string[] => {
    if (!holdsCycle(model, cycle, type) || typeof type === 'string') return [];
    const item = `item${depth}`;
    const ref = place ? `&${expr}` : expr;
    if ('list' in type) return [`for ${item} in ${expr}.iter() {`, ...walk(type.list, item, depth + 1).map((l) => `    ${l}`), '}'];
    if ('optional' in type) return [`if let Some(${item}) = ${ref} {`, ...walk(type.optional, item, depth + 1).map((l) => `    ${l}`), '}'];
    if ('map' in type) return [`for (_key, ${item}) in ${expr}.iter() {`, ...walk(type.map, item, depth + 1).map((l) => `    ${l}`), '}'];
    if ('keyed_map' in type) return [`for (_key, ${item}) in ${expr}.iter() {`, ...walk(type.keyed_map, item, depth + 1).map((l) => `    ${l}`), '}'];
    const at = cycle.units.findIndex((u) => 'unit' in type && u.id === type.unit);
    return at < 0 ? [] : [`kids.push(Cycle${k}::U${at}(${ref}));`];
  };
  const arms = cycle.units.map((unit, at) => {
    const core = unit.core_type ?? '';
    if (unit.kind === 'record') {
      const lines = (unit.fields ?? []).flatMap((f) => walk(f.type, `value.${rustField(f.name)}`, 0, true));
      return `        Cycle${k}::U${at}(value) => {\n${lines.map((l) => `            ${l}`).join('\n')}\n        }`;
    }
    const variant = model.variants.find((v) => v.unit.id === unit.id);
    const cases = (variant?.cases ?? []).map((kase) => {
      const fields = (kase.unit.fields ?? []).map((field, i) => ({ field, variable: `field${i}` }));
      const held = fields.filter((f) => holdsCycle(model, cycle, f.field.type));
      if (fields.length === 0) return `            ${UNIT_CASE_ALLOW}\n            ${core}::${kase.rust} {} => {}`;
      if (held.length === 0) return `            ${core}::${kase.rust} { .. } => {}`;
      const pattern = `${core}::${kase.rust} { ${held.map((f) => `${rustField(f.field.name)}: ${f.variable}`).join(', ')}${held.length < fields.length ? ', ..' : ''} }`;
      const lines = held.flatMap((f) => walk(f.field.type, f.variable, 0));
      return `            ${pattern} => {\n${lines.map((l) => `                ${l}`).join('\n')}\n            }`;
    });
    return `        Cycle${k}::U${at}(value) => match value {\n${cases.join('\n')}\n        },`;
  });
  const made = cycle.units.map((unit, at) => `    U${at}(Box<${unit.core_type ?? ''}>),`);
  const takes = cycle.units.map((unit, at) => `
/// GN-6bt: the made value of ${unit.id}, when the value is one.
fn cycle${k}_u${at}(made: Option<Cycle${k}Made>) -> Option<${unit.core_type ?? ''}> {
    ${cycle.units.length === 1 ? `made.map(|Cycle${k}Made::U${at}(value)| *value)` : `match made {\n        Some(Cycle${k}Made::U${at}(value)) => Some(*value),\n        _ => None,\n    }`}
}
`);
  return `
/// GN-6bt: a value of a unit of the cycle ${cycle.units.map((u) => u.id).join(', ')}, by reference.
#[derive(Clone, Copy)]
enum Cycle${k}<'a> {
${cycle.units.map((unit, at) => `    U${at}(&'a ${unit.core_type ?? ''}),`).join('\n')}
}

/// GN-6bt: a made value of a unit of the cycle ${cycle.units.map((u) => u.id).join(', ')}.
enum Cycle${k}Made {
${made.join('\n')}
}

/// GN-6bt: the values of the units of the cycle that a value holds, in the order of its fields, in which its
/// conversion takes them.
fn cycle${k}_kids(node: Cycle${k}<'_>) -> Vec<Cycle${k}<'_>> {
    let mut kids = Vec::new();
    match node {
${arms.join('\n')}
    }
    kids
}
${takes.join('')}`;
}

// GN-6bt: the helpers of the walks that every cycle of the crate uses, written once.
export const cycleShared = (host: CycleHost): string => `
/// GN-6bt: the next made value of a conversion of a cycle, for its next place of a unit of the cycle, whose value
/// was converted before.
fn made_next<M, V>(made: &std::cell::RefCell<std::vec::IntoIter<M>>, _value: V) -> Option<M> {
    made.borrow_mut().next()
}

/// GN-6bt: the value of a place of a unit of a cycle that the walk in converts before the value that holds it.
struct CycleFound;

/// GN-6bt: keeps the value of the language of a place of a unit of a cycle, with the number of the unit and the
/// subject of the place.
fn kid_in${host.inGenerics}(${host.kidContext?.param ?? ''}kids: &std::cell::RefCell<Vec<(${host.lang}, usize, String)>>, value: ${host.lang}, unit: usize, subject: &str) -> ${host.result('CycleFound')} {
    kids.borrow_mut().push((value, unit, subject.to_owned()));
    Ok(CycleFound)
}

/// GN-6bt: a frame of the walk in: a value of the language, the values of the units of the cycle that it holds and
/// are not converted yet, those converted, and the failure of its own fields after them.
struct CycleFrame<L, M, E> {
    value: L,
    unit: usize,
    subject: String,
    kids: std::vec::IntoIter<(L, usize, String)>,
    made: Vec<M>,
    error: Option<E>,
}
`;

// GN-6bt: the walks of a cycle in a target: the conversion out makes the values of the units bottom up in the order
// of cycle_kids, the conversion in first finds the values of the language of the units that a value holds (kids_*),
// converts them, and then converts the value with them; each keeps one frame on the heap for each level.
export function cycleWalks(model: Model, host: CycleHost, cycle: Cycle, errorType: string): string {
  const k = cycle.index;
  const internal = (detail: string): string => host.internal(`GN-6bt: ${detail}`);
  const outArms = cycle.units.map((unit, at) => `            Cycle${k}::U${at}(value) => node_out_${rustField(unit.name)}(${host.outArgs}value, &made)?,`);
  const kidsArms = cycle.units.map((unit, at) => `        ${at} => kids_${rustField(unit.name)}(${host.inArgs}${host.give('value')}, &subject, &kids),`);
  const inArms = cycle.units.map((unit, at) => `            ${at} => Cycle${k}Made::U${at}(Box::new(node_in_${rustField(unit.name)}(${host.inArgs}${host.give('frame.value')}, &frame.subject, &made)?)),`);
  const wrappers = cycle.units.map((unit, at) => {
    const name = rustField(unit.name);
    const core = unit.core_type ?? '';
    return `
fn out_${name}${host.outGenerics}(${host.outParams}value: impl Borrow<${core}>) -> ${host.result(host.made)} {
    cycle${k}_out(${host.outArgs}Cycle${k}::U${at}(value.borrow()))
}
`;
  });
  return `${coreWalk(model, cycle)}
/// GN-6bt: the conversion out of a value of the cycle: each value of a unit of the cycle is made after those that it
/// holds, from a work stack on the heap.
fn cycle${k}_out${host.outGenerics}(${host.outParams}root: Cycle${k}<'_>) -> ${host.result(host.made)} {
    let mut stack = vec![(root, cycle${k}_kids(root).into_iter(), Vec::new())];
    loop {
        let Some(top) = stack.last_mut() else {
            return Err(${internal('the walk out has no frame')});
        };
        if let Some(kid) = top.1.next() {
            stack.push((kid, cycle${k}_kids(kid).into_iter(), Vec::new()));
            continue;
        }
        let Some((node, _kids, made)) = stack.pop() else {
            return Err(${internal('the walk out has no frame')});
        };
        let made = std::cell::RefCell::new(made.into_iter());
        let value = match node {
${outArms.join('\n')}
        };
        match stack.last_mut() {
            Some(parent) => parent.2.push(value),
            None => return Ok(value),
        }
    }
}

/// GN-6bt: the frame of a value of the language of a unit of the cycle, with the values of units of the cycle that it
/// holds, found in the order of its fields, and the failure of a field after them.
fn cycle${k}_found${host.inGenerics}(${host.inParams}value: ${host.lang}, unit: usize, subject: String) -> CycleFrame<${host.lang}, Cycle${k}Made, ${errorType}> {
    let kids = std::cell::RefCell::new(Vec::new());
    let found = match unit {
${kidsArms.join('\n')}
        _ => Err(${internal('no unit of the cycle has this number')}),
    };
    CycleFrame { value, unit, subject, kids: kids.into_inner().into_iter(), made: Vec::new(), error: found.err() }
}

/// GN-6bt: the conversion in of a value of the cycle: each value of a unit of the cycle is converted after those that
/// it holds, from a work stack on the heap.
fn cycle${k}_in${host.inGenerics}(${host.inParams}root: ${host.lang}, unit: usize, subject: &str) -> ${host.result(`Cycle${k}Made`)} {
    let mut stack = vec![cycle${k}_found(${host.inArgs}root, unit, subject.to_owned())];
    loop {
        let Some(top) = stack.last_mut() else {
            return Err(${internal('the walk in has no frame')});
        };
        if let Some((value, unit, subject)) = top.kids.next() {
            let frame = cycle${k}_found(${host.inArgs}value, unit, subject);
            stack.push(frame);
            continue;
        }
        let Some(frame) = stack.pop() else {
            return Err(${internal('the walk in has no frame')});
        };
        if let Some(error) = frame.error {
            return Err(error);
        }
        let made = std::cell::RefCell::new(frame.made.into_iter());
        let value = match frame.unit {
${inArms.join('\n')}
            _ => return Err(${internal('no unit of the cycle has this number')}),
        };
        match stack.last_mut() {
            Some(parent) => parent.made.push(value),
            None => return Ok(value),
        }
    }
}
${wrappers.join('')}`;
}

// The conversion in of a unit of the cycle, which the places outside the cycle call.
export const cycleInWrapper = (host: CycleHost, cycle: Cycle, unit: Unit, signature: string): string => {
  const at = cycle.units.findIndex((u) => u.id === unit.id);
  return `
${signature} {
    cycle${cycle.index}_u${at}(Some(cycle${cycle.index}_in(${host.inArgs}${host.own('value')}, ${at}, subject)?)).ok_or_else(|| ${host.internal('GN-6bt: the walk in made a value of another unit')})
}
`;
};

// GN-6bt: the conversions of a unit of a cycle, from the bodies of a mode: node_in and node_out take the made values
// of the places of units of the cycle, kids keeps their values of the language, and in and out walk the cycle; the
// first unit of the cycle writes the walks, and the first cycle the helpers they share.
export function cycleUnitRust(model: Model, host: CycleHost, unit: Unit, cycle: Cycle, errorType: string, parts: (typed: Model, mode: 'in' | 'kids') => { ins: string; outs: string }, inParams = host.inParams): string {
  const name = rustField(unit.name);
  const core = unit.core_type ?? '';
  const { outs } = parts(walkModel(model, cycle, 'out'), 'in');
  const { ins } = parts(walkModel(model, cycle, 'in'), 'in');
  const { ins: kids } = parts(walkModel(model, cycle, 'kids'), 'kids');
  const first = cycle.units[0]?.id === unit.id;
  return `${first && cycle.index === 0 ? cycleShared(host) : ''}${first ? cycleWalks(model, host, cycle, errorType) : ''}
/// GN-6bt: the value of ${unit.id} of the cycle, made from the made values of the places of units of the cycle.
fn node_out_${name}${host.outGenerics}(${host.outParams}value: impl Borrow<${core}>, ${madeParam(host, cycle, 'out')}) -> ${host.result(host.made)} {
${outs}
}

/// GN-6bt: the value of ${unit.id} of the cycle, converted with the made values of the places of units of the cycle.
fn node_in_${name}${host.inGenerics}(${inParams}value: ${host.inValue}, subject: &str, ${madeParam(host, cycle, 'in')}) -> ${host.result(core)} {
${ins}
}

/// GN-6bt: judges the value of ${unit.id} of the cycle as node_in does and keeps the values of the places of units of
/// the cycle, which are converted before it.
fn kids_${name}${host.inGenerics}(${inParams}value: ${host.inValue}, subject: &str, ${madeParam(host, cycle, 'kids')}) -> ${host.result('()')} {
${kids}
}
${cycleInWrapper(host, cycle, unit, `/// T-4, T-9: a value of ${unit.id}, judged as it enters (T-8); the walk of the cycle converts it (GN-6bt).
fn in_${name}${host.inGenerics}(${inParams}value: ${host.inValue}, subject: &str) -> ${host.result(core)}`)}`;
}
