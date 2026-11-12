// The generated unittest module of the Python binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function.

import type { Model } from './model.ts';
import { langName, unitOf } from './model.ts';
import { type CallbackHow, type Context, type Receiver, callArgs, callbackArg, callables, fromJson, isNumber, placeholder, raisingCases, sampleReceiver, textKind, wrapText } from './samples.ts';
import type { Fn } from './model.ts';
import { pyHeader, pyString } from './text.ts';

const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['float("nan")', 'float("inf")', 'float("-inf")', '1.5', 'True', '"7"', '-1', '2**64'],
  int: ['float("nan")', 'float("inf")', '1.5', 'True', '"7"', '2**63'],
  int64: ['float("nan")', 'float("inf")', '1.5', 'True', '"7"', '2**63'],
  float: ['True', '"7"', '1'],
};

export function pythonTests(model: Model, module: string): string {
  const ctx: Context = { lang: 'python', enumRef: (name, value) => `pkg.${name}(${pyString(value)})`,
    callbackNew: (unit, how) => {
      const body = 'missing' in how ? '' : 'raise' in how ? `lambda self, *args: (_ for _ in ()).throw(${how.raise})` : how.returns === 'wrong' ? 'lambda self, *args: object()' : 'lambda self, *args: None';
      const members = 'missing' in how ? '' : (unit.members ?? []).map((m) => `${pyString(langName('python', m.name, 'callable'))}: ${body}`).join(', ');
      return `type(${pyString(langName('python', unit.name, 'class'))}, (), {${members}})()`;
    },
    recordNew: (unit, fields) =>
      `pkg.${langName('python', unit.name, 'class')}(${(unit.fields ?? []).map((f, i) => `${langName('python', f.name, 'variable')}=${fields[i] ?? ''}`).join(', ')})`,
  };
  const cls = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  const out: string[] = [];
  // The expression that calls a member: a function, a static member or the constructor of a class, or a method or
  // property of an instance that a factory makes (T-5).
  const made = (receiver: Receiver, value: (arg: Fn['args'][number]) => string): string => invoke(receiver.factory, callArgs(model, ctx, receiver.factory, value), '');
  const invoke = (fn: Fn, args: string, receiver: string): string => {
    const member = langName('python', fn.member.name, 'callable');
    const cls = `pkg.${langName('python', fn.unit.name, 'class')}`;
    if (fn.kind === 'function') return `pkg.${member}(${args})`;
    if (fn.kind === 'constructor') return `${cls}(${args})`;
    if (fn.kind === 'static') return `${cls}.${member}(${args})`;
    if (fn.kind === 'property') return `${receiver}.${member}`;
    return `${receiver}.${member}(${args})`;
  };
  for (const fn of callables(model)) {
    const name = fn.kind === 'function' ? langName('python', fn.member.name, 'callable') : `${langName('python', fn.unit.name, 'variable')}_${fn.kind === 'constructor' ? 'new' : langName('python', fn.member.name, 'callable')}`;
    const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
    const recv = sample === undefined ? '' : made(sample, (arg) => fromJson(model, ctx, arg.type, sample.args.get(arg) ?? null));
    const target = (args: string): string => invoke(fn, args, recv);
    const call = (override: Map<unknown, string>): string =>
      target(callArgs(model, ctx, fn, (arg) => override.get(arg) ?? placeholder(model, ctx, arg.type)));
    const reachable = fn.receiver === undefined || sample !== undefined;
    for (const arg of reachable ? fn.args : []) {
      const number = isNumber(arg.type);
      const argName = langName('python', arg.name, 'variable');
      if (number !== undefined) {
        out.push(`
    def test_b2_${name}_${argName}_refuses_what_is_not_${number}(self) -> None:
        for bad in [${(BAD_NUMBERS[number] ?? []).join(', ')}]:
            with self.subTest(bad=bad):
                with self.assertRaises(pkg.${cls('value')}) as caught:
                    ${call(new Map([[arg, 'bad']]))}
                self.assertIs(type(caught.exception), pkg.${cls('value')})
                self.assertEqual(caught.exception.kind, "invalid_number")`);
      }
      const text = textKind(arg.type);
      if (text !== undefined) {
        const bad = text === 'latin1' ? pyString('Ā') : '"\\ud800"';
        out.push(`
    def test_b3_${name}_${argName}_refuses_${text === 'latin1' ? 'a_character_above_u00ff' : 'an_unpaired_surrogate'}(self) -> None:
        with self.assertRaises(pkg.${cls('value')}) as caught:
            ${call(new Map([[arg, wrapText(arg.type, bad)]]))}
        self.assertEqual(caught.exception.kind, "invalid_text")`);
      }
    }
    for (const kase of raisingCases(model, fn)) {
      const receiver = kase.receiver === undefined ? '' : made(kase.receiver, (arg) => fromJson(model, ctx, arg.type, kase.receiver?.args.get(arg) ?? null));
      out.push(`
    def test_b4_${name}_${kase.id}(self) -> None:
        with self.assertRaises(pkg.${cls(kase.raises.category)}) as caught:
            ${invoke(fn, callArgs(model, ctx, fn, (arg) => fromJson(model, ctx, arg.type, kase.args.get(arg) ?? null)), receiver)}
        error = caught.exception
        self.assertIs(type(error), pkg.${cls(kase.raises.category)})
        self.assertIsInstance(error, ${pythonBaseOf(kase.raises.category)})
        self.assertEqual(error.kind, ${pyString(kase.raises.kind)})
        self.assertEqual(error.status, ${kase.raises.status === null ? 'None' : String(kase.raises.status)})
        self.assertIsNone(error.errno)`);
    }
    const values = (arg: { type: unknown }): string => placeholder(model, ctx, arg.type as never);
    const callback = callbackArg(model, fn);
    const cbUnit = callback === undefined ? undefined : unitOf(model, callback.type);
    if (callback !== undefined && cbUnit !== undefined && reachable) {
      const with_ = (how: CallbackHow): string =>
        target(callArgs(model, ctx, fn, (arg) => (arg === callback ? ctx.callbackNew(cbUnit, how) : placeholder(model, ctx, arg.type, true))));
      out.push(`
    def test_k2_${name}_refuses_a_callback_without_its_members(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${with_({ missing: true })}
        self.assertEqual(caught.exception.kind, "invalid_callback")

    def test_k2_${name}_lets_the_exception_of_a_callback_through(self) -> None:
        raised = LookupError("raised by the callback")
        with self.assertRaises(LookupError) as caught:
            ${with_({ raise: 'raised' })}
        self.assertIs(caught.exception, raised)

    def test_k2_${name}_refuses_a_callback_result_of_another_type(self) -> None:
        with self.assertRaises((${model.classes.map((c) => `pkg.${c.name}`).join(', ')})) as caught:
            ${with_({ returns: 'wrong' })}
        self.assertIn(caught.exception.kind, ("invalid_argument_type", "invalid_number", "invalid_text"))`);
    }
    if (fn.kind === 'property' || !reachable) continue;
    out.push(`
    def test_g7_${name}_counts_and_names_its_arguments(self) -> None:${fn.args.length === 0 ? '' : `
        with self.assertRaisesRegex(TypeError, "missing"):
            ${target('')}`}
        with self.assertRaisesRegex(TypeError, "positional"):
            ${target(callArgs(model, ctx, fn, values, 'None'))}
        with self.assertRaisesRegex(TypeError, "unexpected keyword"):
            ${target([callArgs(model, ctx, fn, values), 'not_a_parameter=1'].filter((a) => a !== '').join(', '))}`);
  }
  return `${pyHeader()}
"""The generated tests of the binding (G-5)."""

import unittest

import ${module} as pkg
from ${module} import _native


class GeneratedTest(unittest.TestCase):
    def test_b7_a_panic_is_kind_internal(self) -> None:
        with self.assertRaises(pkg.${cls('internal')}) as caught:
            _native._panic_test()
        self.assertEqual(caught.exception.kind, "internal")
        self.assertIsInstance(caught.exception, RuntimeError)
${out.join('\n')}


if __name__ == "__main__":
    unittest.main()
`;
}

const pythonBaseOf = (category: string): string =>
  ({ value: 'ValueError', type: 'TypeError', io: 'OSError', store: 'RuntimeError', busy: 'RuntimeError', internal: 'RuntimeError' })[category] ?? 'Exception';
