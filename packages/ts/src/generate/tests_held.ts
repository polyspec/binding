// The B-5c tests of the generated test modules (G-5, GN-13), as the calls that each language writes in its own form:
// for every class with a write place, the calls that must fail with kind internal after the poison entry point ran on
// an instance; for every member with a write receiver that takes its own class as a parameter, the call that takes the
// instance at both places and must fail with kind busy. Where the core function of such a member holds a fault
// injection point, the test arms it before the refused call: the next call takes the arming (GN-8a).

import { type Arg, type Fn, type Model, type ObjectClass, unitOf } from './model.ts';
import { type Context, callArgs, classCaseArgs, otherValue, placeholder, sampleInstance } from './samples.ts';
import { heldMembers } from './tests_shared.ts';

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

// GN-13l: each test is made when its target writes it, because the expressions of a test mark the root of the case
// texts of the test that is being written; a test made before the one written earlier would mark that one (orm: the
// instance of StepRunner took the root that only the B-5c test of Query set, B2.493).
export function heldTests(
  model: Model,
  ctx: Context,
  invoke: (fn: Fn, args: string, receiver: string) => string,
  held: string,
): { poison: (() => PoisonTest)[]; busy: (() => BusyTest)[] } {
  // GN-13t: an instance of the class is made from the first case of the class that does not raise, because the core
  // may refuse the placeholder arguments of its first factory (orm: Schema.load of three texts "a"); the placeholder
  // of GN-13 stands only when no case of the class makes an instance.
  const instanceOf = (object: ObjectClass): string => {
    const sample = sampleInstance(model, object);
    return sample === undefined || ctx.instanceNew === undefined ? placeholder(model, ctx, { unit: object.unit.id }) : ctx.instanceNew(sample);
  };
  // The call that gives the argument `arg` the value `value`, and every other argument its value of GN-13t.
  const callWith = (fn: Fn, receiver: string, arg?: Arg, value: string = held): string => {
    const classGiven = classCaseArgs(model, fn);
    return invoke(fn, callArgs(model, ctx, fn, (a) => (a === arg ? value : otherValue(model, ctx, a, classGiven))), receiver);
  };
  const callables = [...model.functions, ...model.objects.flatMap((o) => o.members.filter((m) => m.kind !== 'iterate' && m.special === undefined))];
  const poison: (() => PoisonTest)[] = [];
  const busy: (() => BusyTest)[] = [];
  for (const object of model.objects) {
    if (object.lock?.writes !== true || !hasFactory(model, object)) continue;
    const members = heldMembers(model, object, callables, (owner) => hasFactory(model, owner));
    const receiverFn = members.receiver;
    const param = members.param;
    poison.push(() => ({
      object,
      instance: instanceOf(object),
      receiver: receiverFn === undefined ? undefined : callWith(receiverFn, held),
      parameter: param === undefined ? undefined : callWith(param.fn, param.fn.receiver === undefined || param.owner === undefined ? '' : instanceOf(param.owner), param.arg),
    }));
    for (const { fn, arg, armed } of members.busy) {
      busy.push(() => {
        // The call of the arming is made first, as the test reads it last: its expressions come before the others.
        const armedTest = armed === undefined ? undefined : { ...armed, again: callWith(fn, held, arg, instanceOf(object)) };
        return { fn, instance: instanceOf(object), call: callWith(fn, held, arg), after: receiverFn === undefined ? undefined : callWith(receiverFn, held), armed: armedTest };
      });
    }
  }
  return { poison, busy };
}
