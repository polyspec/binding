// The B-5c tests of the generated test modules (G-5, GN-13), as the calls that each language writes in its own form:
// for every class with a write place, the calls that must fail with kind internal after the poison entry point ran on
// an instance; for every member with a write receiver that takes its own class as a parameter, the call that takes the
// instance at both places and must fail with kind busy. Where the core function of such a member holds a fault
// injection point, the test arms it before the refused call: the next call takes the arming (GN-8a).

import { type Arg, type Fn, type Model, type ObjectClass, heldParam, kindText, places, pointName, unitOf } from './model.ts';
import { type Context, callArgs, placeholder } from './samples.ts';

export interface PoisonTest {
  object: ObjectClass;
  // The expression that makes the instance.
  instance: string;
  // A call that takes the instance as its receiver.
  receiver: string | undefined;
  // A call that takes the instance as an argument.
  parameter: string | undefined;
}

export interface BusyTest {
  fn: Fn;
  instance: string;
  // The call that takes the instance as its receiver and as an argument.
  call: string;
  // A call on the instance after the refused call, which must work: the refused call holds no lock.
  after: string | undefined;
  // GN-8a: the faults that the test arms for the member before the refused call, and the call that takes them: the
  // same receiver with another instance, which fails with the kind that the point fills.
  armed: { faults: string; again: string; kind: string; category: string } | undefined;
}

// T-5: whether the language can make an instance of the class: a constructor or a static member that returns it.
const hasFactory = (model: Model, object: ObjectClass): boolean =>
  object.members.some((m) => m.kind === 'constructor' || (m.kind === 'static' && unitOf(model, m.returns) === object.unit));

export function heldTests(
  model: Model,
  ctx: Context,
  invoke: (fn: Fn, args: string, receiver: string) => string,
  held: string,
): { poison: PoisonTest[]; busy: BusyTest[] } {
  const instanceOf = (object: ObjectClass): string => placeholder(model, ctx, { unit: object.unit.id });
  const objectOf = (fn: Fn): ObjectClass | undefined => model.objects.find((o) => o.unit === fn.unit);
  const takes = (fn: Fn, object: ObjectClass): Arg | undefined => fn.args.find((a) => !a.field && heldParam(model, a.type)?.unit === object.unit);
  const callWith = (fn: Fn, receiver: string, arg?: Arg): string =>
    invoke(fn, callArgs(model, ctx, fn, (a) => (a === arg ? held : placeholder(model, ctx, a.type))), receiver);
  // A member whose only place is its receiver: a call that fails for the receiver alone.
  const onReceiver = (object: ObjectClass): Fn | undefined =>
    object.members.find((m) => m.kind === 'property' && m.receiver !== undefined) ??
    object.members.find((m) => m.kind === 'method' && m.special === undefined && places(model, m).length === 1);
  const callables = [...model.functions, ...model.objects.flatMap((o) => o.members.filter((m) => m.kind !== 'iterate' && m.special === undefined))];
  const poison: PoisonTest[] = [];
  const busy: BusyTest[] = [];
  for (const object of model.objects) {
    if (object.lock?.writes !== true || !hasFactory(model, object)) continue;
    const receiverFn = onReceiver(object);
    const paramFn = callables.find((fn) => {
      if (takes(fn, object) === undefined) return false;
      const owner = objectOf(fn);
      return fn.receiver === undefined || (owner !== undefined && hasFactory(model, owner));
    });
    const paramOwner = paramFn === undefined ? undefined : objectOf(paramFn);
    poison.push({
      object,
      instance: instanceOf(object),
      receiver: receiverFn === undefined ? undefined : callWith(receiverFn, held),
      parameter: paramFn === undefined ? undefined : callWith(paramFn, paramFn.receiver === undefined || paramOwner === undefined ? '' : instanceOf(paramOwner), takes(paramFn, object)),
    });
    for (const fn of object.members) {
      const arg = takes(fn, object);
      if (arg === undefined || !places(model, fn).some((p) => p.param === undefined && p.write)) continue;
      // A point that fills one kind, whose class is the class of its category, by an injection that needs no value.
      const point = model.faults.find((p) => p.place === fn.corePath && p.fills.length === 1 && p.inject.some((i) => i !== 'short'));
      const filled = point === undefined ? undefined : model.kinds.find((k) => k.unit === undefined && kindText(k.variant) === point.fills[0]);
      const inject = point?.inject.find((i) => i !== 'short');
      const armed = point === undefined || filled === undefined || inject === undefined
        ? undefined
        : { faults: JSON.stringify([{ point: pointName(model, point), kind: inject }]), again: callWith(fn, held), kind: kindText(filled.variant), category: filled.category };
      busy.push({ fn, instance: instanceOf(object), call: callWith(fn, held, arg), after: receiverFn === undefined ? undefined : callWith(receiverFn, held), armed });
    }
  }
  return { poison, busy };
}
