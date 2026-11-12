// The generated unittest module of the Python binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function.

import type { Model } from './model.ts';
import { langName } from './model.ts';
import { type Context, callArgs, fromJson, isNumber, placeholder, raisingCases, textKind, wrapText } from './samples.ts';
import { pyHeader, pyString } from './text.ts';

const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['float("nan")', 'float("inf")', 'float("-inf")', '1.5', 'True', '"7"', '-1', '2**64'],
  int: ['float("nan")', 'float("inf")', '1.5', 'True', '"7"', '2**63'],
  int64: ['float("nan")', 'float("inf")', '1.5', 'True', '"7"', '2**63'],
  float: ['True', '"7"', '1'],
};

export function pythonTests(model: Model, module: string): string {
  const ctx: Context = { lang: 'python', enumRef: (name, value) => `pkg.${name}(${pyString(value)})` };
  const cls = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  const out: string[] = [];
  for (const fn of model.functions) {
    const name = langName('python', fn.member.name, 'callable');
    const call = (override: Map<unknown, string>): string =>
      `pkg.${name}(${callArgs(model, ctx, fn, (arg) => override.get(arg) ?? placeholder(model, ctx, arg.type))})`;
    for (const arg of fn.args) {
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
      out.push(`
    def test_b4_${name}_${kase.id}(self) -> None:
        with self.assertRaises(pkg.${cls(kase.raises.category)}) as caught:
            ${`pkg.${name}(${callArgs(model, ctx, fn, (arg) => fromJson(model, ctx, arg.type, kase.args.get(arg) ?? null))})`}
        error = caught.exception
        self.assertIs(type(error), pkg.${cls(kase.raises.category)})
        self.assertIsInstance(error, ${pythonBaseOf(kase.raises.category)})
        self.assertEqual(error.kind, ${pyString(kase.raises.kind)})
        self.assertEqual(error.status, ${kase.raises.status === null ? 'None' : String(kase.raises.status)})
        self.assertIsNone(error.errno)`);
    }
    const values = (arg: { type: unknown }): string => placeholder(model, ctx, arg.type as never);
    out.push(`
    def test_g7_${name}_counts_and_names_its_arguments(self) -> None:
        with self.assertRaisesRegex(TypeError, "missing"):
            pkg.${name}()
        with self.assertRaisesRegex(TypeError, "positional"):
            pkg.${name}(${callArgs(model, ctx, fn, values, 'None')})
        with self.assertRaisesRegex(TypeError, "unexpected keyword"):
            pkg.${name}(${callArgs(model, ctx, fn, values)}, not_a_parameter=1)`);
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
