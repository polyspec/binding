// The generated unittest module of the Python binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function.

import type { Model } from './model.ts';
import { POISON_ENTRY, Unsupported, cleanupWarning, errorUnitOfKind, hookCall, isInternal, langName, memberName, unitOf, takesNull, nativeRoundTrip } from './model.ts';
import { internalModule } from './python.ts';
import type { Unit } from '../contract.ts';
import { heldTests } from './tests_held.ts';
import { type CallbackHow, type Context, type MadeForm, type Receiver, callArgs, caseRefusal, caseSnake, checkCaseNames, callbackArg, isPath, isPlain, madeLines, callables, bytesKind, caseValue, fromJson, isNumber, placeholder, fixtureValues, fixturesOf, aliasCases, HOST_VALUES, aliasRepresentative, expectedErrno, judgesCallbackResult, raisingCases, refusedKeyMap, unsafeKeyMap, resultCases, expectedText, pythonTokens, tokenForms, samePairs, sampleReceiver, refusesNull, stringCases, textKind, wrapText, functionFixturesOf } from './samples.ts';
import type { Arg, Fn } from './model.ts';
import { bracketDepth, pyHeader, pyString } from './text.ts';

const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['float("nan")', 'float("inf")', 'float("-inf")', '1.5', 'True', '"7"', '-1', '2**53', '2**64'],
  int: ['float("nan")', 'float("inf")', '1.5', 'True', '"7"', '2**53', '-(2**53)', '2**63'],
  int64: ['float("nan")', 'float("inf")', '1.5', 'True', '"7"', '2**63'],
  float: ['True', '"7"', '1'],
};

// G-5: the callback fixture. A call that no row answers is recorded and raises, so a core that swallows the exception
// still fails the test, which reads the record.
const PYTHON_FIXTURE = `

class _UnexpectedCall(Exception):
    """A call that no row of a callback fixture answers (G-5)."""


def _fixture(members, rows):
    unexpected = []
    calls = []
    left = list(rows)

    def member(name):
        def call(self, *args):
            calls.append((name, args))
            for row in left:
                if row[0] == name and row[1] == args:
                    if row[3]:
                        left.remove(row)
                    return row[2]
            unexpected.append((name, args))
            raise _UnexpectedCall(f"{name}{args!r}")

        return call

    return type("Fixture", (), {name: member(name) for name in members})(), unexpected, calls
`;

// GN-13e: whether a result is the value of a case: the same type at every level, a dict with the same entries in the
// same order, NaN where the case has NaN, and a record with the same fields.
const PYTHON_SAME = `

def _same(actual, expected):
    if isinstance(expected, float) and expected != expected:
        return isinstance(actual, float) and actual != actual
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, dict):
        return len(actual) == len(expected) and all(
            _same(key, other_key) and _same(value, other_value)
            for (key, value), (other_key, other_value) in zip(actual.items(), expected.items())
        )
    if isinstance(expected, (list, tuple)):
        return len(actual) == len(expected) and all(_same(item, other) for item, other in zip(actual, expected))
    if dataclasses.is_dataclass(expected):
        return all(_same(getattr(actual, field.name), getattr(expected, field.name)) for field in dataclasses.fields(expected))
    return actual == expected
`;

// G-5: what a call gives: its result, or the class and the kind of its failure.
const PYTHON_OUTCOME = `

def _outcome(call):
    try:
        return ("result", call())
    except Exception as error:
        return ("error", type(error), getattr(error, "kind", None))
`;

// GN-6y: the directory of a test, in which a case resolves its relative paths; unittest makes an instance per test,
// and the directory is removed at its end.
const PYTHON_CASE_PATH = `
    def _case_path(self, relative: str) -> str:
        if not hasattr(self, "_case_dir"):
            self._case_dir = tempfile.TemporaryDirectory()
            self.addCleanup(self._case_dir.cleanup)
        return os.path.join(self._case_dir.name, *relative.split("/"))
`;

export function pythonTests(model: Model, module: string): string {
  checkCaseNames(model, caseSnake, false);
  // GN-6r: a name of an internal unit is called in the module of the internal names of its module, which the test
  // imports when it is not the root module.
  const internalModules = new Set<string>();
  const ref = (unit: Unit | undefined): string => {
    if (unit === undefined || !isInternal(unit)) return 'pkg.';
    if (unit.module !== '') internalModules.add(internalModule(unit.module));
    return `pkg.${internalModule(unit.module)}.`;
  };
  const enumUnit = (name: string): Unit | undefined => model.enums.find((u) => langName('python', u.name, 'class') === name);
  const ctx: Context = { lang: 'python', enumRef: (name, value) => `${ref(enumUnit(name))}${name}(${pyString(value)})`,
    casePath: (relative) => `self._case_path(${pyString(relative)})`,
    callbackNew: (unit, how) => {
      const body = 'missing' in how ? '' : 'raise' in how ? `lambda self, *args: (_ for _ in ()).throw(${how.raise})` : how.returns === 'wrong' ? 'lambda self, *args: object()' : 'lambda self, *args: None';
      const members = 'missing' in how ? '' : (unit.members ?? []).map((m) => `${pyString(langName('python', m.name, 'callable'))}: ${body}`).join(', ');
      return `type(${pyString(langName('python', unit.name, 'class'))}, (), {${members}})()`;
    },
    recordNew: (unit, fields) =>
      `${ref(unit)}${langName('python', unit.name, 'class')}(${(unit.fields ?? []).map((f, i) => `${langName('python', f.name, 'variable')}=${fields[i] ?? ''}`).join(', ')})`,
  };
  const cls = (category: string): string => model.classes.find((c) => c.category === category)?.name ?? '';
  // E-2: the exact class of a kind is the class of the error unit that its row names, or the class of its category.
  // E-2, B-4: the exact class of a failure of a case: the class of the error unit of its kind, or of its category.
  const exactClass = (raises: { kind: string; category: string }): string => {
    const unit = errorUnitOfKind(model, raises.kind);
    return unit === undefined ? cls(raises.category) : langName('python', unit.unit.name, 'class');
  };
  const out: string[] = [];
  let usesFixture = false;
  // GN-6z: a function value of a case is a fixture whose one member is the call itself (__call__).
  type Made = { fixture: { arg: Arg }; name: string; values: { members: string[]; rows: string[][]; calls: string[][] | undefined } };
  const withFunctions = (fixtures: Made[], fn: Fn, id: string, args: Map<Arg, unknown>): Made[] => [
    ...fixtures,
    ...functionFixturesOf(model, ctx, fn, id, args, '__call__').map((f, i) => ({ fixture: { arg: f.arg }, name: `function_${String(i)}`, values: { members: f.members, rows: f.rows, calls: undefined } })),
  ];
  let usesErrno = false;
  // The expression that calls a member: a function, a static member or the constructor of a class, or a method or
  // property of an instance that a factory makes (T-5).
  ctx.objectNew = (factory, args) => invoke(factory, args, '');
  // GN-13f: a receiver as one expression; an instance value is made in a function of the module that the expression
  // calls.
  const helpers: string[] = [];
  const made = (receiver: Receiver, value: (arg: Fn['args'][number]) => string | undefined): string => {
    if (isPlain(receiver)) return invoke(receiver.factory, callArgs(model, ctx, receiver.factory, value), '');
    const built = steps.apart(() => madeLines(model, madeForm, receiver));
    const helper = `_made_${helpers.length}`;
    helpers.push(`\n\ndef ${helper}():  # noqa: ANN202\n${built.lines.map((line) => `    ${line}\n`).join('')}    return ${built.expr}\n`);
    return `${helper}()`;
  };
  ctx.instanceNew = (receiver) => made(receiver, (arg) => caseValue(model, ctx, arg, receiver.args));
  // GN-13e: the parser of Python refuses brackets nested 200 deep, so a value that reaches DEEP is a local variable of a
  // function of the module, which the next step takes; the values inside a function of an instance value are its own.
  const DEEP = 50;
  let pending: string[] = [];
  let deepFunctions = 0;
  const steps = {
    depth: 0,
    bind: (expr: string): string => {
      if (bracketDepth(expr) <= DEEP) return expr;
      const name = `step_${pending.length}`;
      pending.push(`${name} = ${expr}`);
      return name;
    },
    done: (expr: string): string => {
      const last = steps.bind(expr);
      if (pending.length === 0) return last;
      const helper = `_deep_${deepFunctions++}`;
      helpers.push(`\n\ndef ${helper}():  # noqa: ANN202\n${pending.map((line) => `    ${line}\n`).join('')}    return ${last}\n`);
      pending = [];
      return `${helper}()`;
    },
    drop: (): void => {
      pending = [];
    },
    apart: <T>(make: () => T): T => {
      const [depth, kept] = [steps.depth, pending];
      steps.depth = 0;
      pending = [];
      try {
        return make();
      } finally {
        steps.depth = depth;
        pending = kept;
      }
    },
  };
  ctx.steps = steps;
  // GN-6aa: a callback value inside another value is the object of a fixture, whose unexpected call raises.
  ctx.fixtureNew = (values) => {
    usesFixture = true;
    return `_fixture((${values.members.map((m) => `${m},`).join(' ')}), [${values.rows.map((row) => `(${row.join(', ')})`).join(', ')}])[0]`;
  };
  // GN-6z: a function value inside another value is the callable of a fixture, whose unexpected call raises.
  ctx.functionNew = (rows) => {
    usesFixture = true;
    return `_fixture(("__call__",), [${rows.map((row) => `(${row.join(', ')})`).join(', ')}])[0]`;
  };
  // GN-13f: the statements that make the receiver of a case, each on a line of the test, and its expression.
  const madeForm: MadeForm = {
    ctx,
    invoke: (fn, args, receiver) => invoke(fn, args, receiver),
    bind: (local, expr) => `${local} = ${expr}`,
    name: (local) => local,
    run: (expr) => expr,
    fails: (expr, kind, what) => {
      usesOutcome = true;
      return `assert _outcome(lambda: ${expr})[::2] == ("error", ${pyString(kind)}), ${pyString(`G-5: ${what}`)}`;
    },
    pick: (expr, step) => ('field' in step ? `${expr}.${step.field}` : `${expr}[${'index' in step ? step.index : step.tuple}]`),
    arm: (local, member, faults) => `${local} = _native._arm_faults(${pyString(member)}, ${pyString(faults)})`,
    left: (local, what) => `assert _native._fault_left(${local}) == [], ${pyString(`G-5: ${what}`)}`,
  };
  const receiverOfCase = (receiver: Receiver | undefined): { lines: string; expr: string } => {
    if (receiver === undefined) return { lines: '', expr: '' };
    const built = madeLines(model, madeForm, receiver);
    return { lines: built.lines.map((line) => `\n        ${line}`).join(''), expr: built.expr };
  };
  let usesOutcome = false;
  let usesAsyncio = false;
  let usesSame = false;
  let usesTokens = false;
  const invoke = (fn: Fn, args: string, receiver: string): string => {
    const hook = hookCall('python', fn, receiver);
    if (hook !== undefined) return hook;
    const member = langName('python', fn.member.name, 'callable');
    const cls = `${ref(fn.unit)}${langName('python', fn.unit.name, 'class')}`;
    if (fn.kind === 'function') return `${ref(fn.unit)}${member}(${args})`;
    if (fn.kind === 'constructor') return `${cls}(${args})`;
    if (fn.kind === 'static') return `${cls}.${member}(${args})`;
    if (fn.kind === 'property') return `${receiver}.${member}`;
    return `${receiver}.${member}(${args})`;
  };
  for (const fn of callables(model)) {
    const name = fn.kind === 'function' ? langName('python', fn.member.name, 'callable') : `${langName('python', fn.unit.name, 'variable')}_${fn.kind === 'constructor' ? 'new' : langName('python', fn.member.name, 'callable')}`;
    const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
    const recv = sample === undefined ? '' : made(sample, (arg) => caseValue(model, ctx, arg, sample.args));
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
      const refused = refusedKeyMap(model, ctx, arg.type);
      if (refused !== undefined) {
        out.push(`
    def test_t2_${name}_${argName}_refuses_a_${refused.kind}_key(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${call(new Map([[arg, refused.value]]))}
        self.assertEqual(caught.exception.kind, "invalid_argument_type")`);
      }
      const unsafeKey = unsafeKeyMap(model, ctx, arg.type);
      if (unsafeKey !== undefined) {
        out.push(`
    def test_b2_${name}_${argName}_refuses_a_key_outside_the_safe_integers(self) -> None:
        with self.assertRaises(pkg.${cls('value')}) as caught:
            ${call(new Map([[arg, unsafeKey]]))}
        self.assertEqual(caught.exception.kind, "invalid_number")`);
      }
      // GN-13d: an optional or a value type takes null as a value, so only another type refuses it.
      if (refusesNull(arg) && !takesNull(model, arg.type)) {
        out.push(`
    def test_u2_${name}_${argName}_takes_none_as_a_value(self) -> None:
        with self.assertRaises((pkg.${cls('value')}, pkg.${cls('type')})) as caught:
            ${call(new Map([[arg, 'None']]))}
        self.assertIn(caught.exception.kind, ("invalid_argument_type", "invalid_number", "invalid_text"))`);
      }
      // GN-6y: a path with a NUL byte is kind invalid_path, and a value that os.fsencode refuses by its type is kind
      // invalid_argument_type.
      if (isPath(arg.type)) {
        out.push(`
    def test_t1_${name}_${argName}_refuses_a_nul_byte(self) -> None:
        with self.assertRaises(pkg.${cls('value')}) as caught:
            ${call(new Map([[arg, '"a\\x00b"']]))}
        self.assertEqual(caught.exception.kind, "invalid_path")

    def test_t1_${name}_${argName}_refuses_what_is_no_path(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${call(new Map([[arg, '1']]))}
        self.assertEqual(caught.exception.kind, "invalid_argument_type")`);
      }
      const bytes = bytesKind(arg.type);
      if (bytes !== undefined) {
        out.push(`
    def test_t7_${name}_${argName}_refuses_what_is_not_${bytes === 'source' ? 'a_text_or_bytes' : 'bytes'}(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${call(new Map([[arg, '1']]))}
        self.assertEqual(caught.exception.kind, "invalid_argument_type")`);
      }
      if (bytes === 'source') {
        out.push(`
    def test_b3_${name}_${argName}_refuses_an_unpaired_surrogate(self) -> None:
        with self.assertRaises(pkg.${cls('value')}) as caught:
            ${call(new Map([[arg, '"\\ud800"']]))}
        self.assertEqual(caught.exception.kind, "invalid_text")`);
      }
      // U-7: a kind of an alias's in function reaches the caller of a member that takes the alias.
      const refusedValue = aliasRepresentative(model, ctx, arg.type);
      if (refusedValue !== undefined) {
        out.push(`
    def test_u7_${name}_${argName}_gives_the_kind_of_${langName('python', refusedValue.kase.alias.unit.name, 'variable')}(self) -> None:
        with self.assertRaises(pkg.${cls(refusedValue.kase.category)}) as caught:
            ${call(new Map([[arg, refusedValue.value]]))}
        self.assertIs(type(caught.exception), pkg.${cls(refusedValue.kase.category)})
        self.assertEqual(caught.exception.kind, ${pyString(refusedValue.kase.kind)})`);
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
    for (const pair of reachable ? samePairs(model, ctx, fn) : []) {
      usesOutcome = true;
      const argName = langName('python', pair.arg.name, 'variable');
      out.push(`
    def test_${pair.rule === 'U-2' ? `u2_${name}_${argName}_left_out_is_its_default` : `t1_${name}_${argName}_takes_a_text_as_its_utf8_bytes`}(self) -> None:
        self.assertEqual(
            _outcome(lambda: ${target(callArgs(model, ctx, fn, pair.left))}),
            _outcome(lambda: ${target(callArgs(model, ctx, fn, pair.right))}),
        )`);
    }
    for (const kase of raisingCases(model, fn)) {
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        out.push(`
    def test_b4_${name}_${caseSnake(kase.id)}(self) -> None:
        self.fail(${pyString(refusal)})`);
        continue;
      }
      const receiverMade = receiverOfCase(kase.receiver);
      const receiver = receiverMade.expr;
      // G-5: a callback parameter is the fixture of the case, whose record of calls the test reads after the call.
      const fixtures = withFunctions(fixturesOf(model, fn, kase.id, kase.args).map((fixture, i) => ({ fixture, name: `fixture_${i}`, values: fixtureValues(model, ctx, fixture) })), fn, kase.id, kase.args);
      usesFixture ||= fixtures.length > 0;
      const tuple = (items: string[]): string => `(${items.map((item) => `${item},`).join(' ')})`;
      const before = fixtures.map((f) => `\n        ${f.name}, ${f.name}_unexpected, ${f.name}_calls = _fixture(${tuple(f.values.members)}, [${f.values.rows.map((row) => `(${row.join(', ')})`).join(', ')}])`).join('');
      const after = fixtures
        .map((f) => `\n        self.assertEqual(${f.name}_unexpected, [])${f.values.calls === undefined ? '' : `\n        self.assertEqual(${f.name}_calls, [${f.values.calls.map((call) => `(${call.join(', ')})`).join(', ')}])`}`)
        .join('');
      const caseArg = (arg: Fn['args'][number]): string | undefined => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.name;
      };
      // G-5: a case that arms faults makes its receiver and arguments first, so no call but the one under test runs
      // between the arming and that call, and requires every armed fault to have fired.
      const locals = kase.faults === undefined ? [] : [...(receiver === '' ? [] : [['receiver', receiver]]), ...fn.args.flatMap((arg, i) => { const value = caseArg(arg); return value === undefined ? [] : [[`arg_${i}`, value]]; })];
      const arming = kase.faults === undefined ? '' : `${locals.map(([local, value]) => `\n        ${local} = ${value}`).join('')}\n        armed = _native._arm_faults(${pyString(fn.member.id)}, ${pyString(kase.faults)})`;
      const armedCall = invoke(fn, callArgs(model, ctx, fn, (arg) => (caseArg(arg) === undefined ? undefined : `arg_${fn.args.indexOf(arg)}`)), receiver === '' ? '' : 'receiver');
      const errno = expectedErrno(kase);
      usesErrno ||= errno !== null && 'symbol' in errno;
      out.push(`
    def test_b4_${name}_${caseSnake(kase.id)}(self) -> None:${receiverMade.lines}${before}${arming}
        with self.assertRaises(pkg.${cls(kase.raises.category)}) as caught:
            ${kase.faults === undefined ? invoke(fn, callArgs(model, ctx, fn, caseArg), receiver) : armedCall}${kase.faults === undefined ? '' : '\n        self.assertEqual(_native._fault_left(armed), [])'}
        error = caught.exception
        self.assertIs(type(error), pkg.${exactClass(kase.raises)})
        self.assertIsInstance(error, ${pythonBaseOf(kase.raises.category)})
        self.assertEqual(error.kind, ${pyString(kase.raises.kind)})
        self.assertEqual(error.status, ${kase.raises.status === null ? 'None' : String(kase.raises.status)})
        ${errno === null ? 'self.assertIsNone(error.errno)' : `self.assertEqual(error.errno, ${'symbol' in errno ? `errno.${errno.symbol}` : String(errno.value)})`}${after}`);
    }
    // GN-13e: every case that does not raise runs, and its result is compared with the value that the case gives.
    for (const kase of resultCases(model, fn)) {
      if (kase.refused !== undefined) {
        out.push(`
    def test_gn13e_${name}_${caseSnake(kase.id)}(self) -> None:
        self.fail(${pyString(kase.refused)})`);
        continue;
      }
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        out.push(`
    def test_gn13e_${name}_${caseSnake(kase.id)}(self) -> None:
        self.fail(${pyString(refusal)})`);
        continue;
      }
      const fixtures = withFunctions(fixturesOf(model, fn, kase.id, kase.args).map((fixture, i) => ({ fixture, name: `fixture_${i}`, values: fixtureValues(model, ctx, fixture) })), fn, kase.id, kase.args);
      usesFixture ||= fixtures.length > 0;
      const tuple = (items: string[]): string => `(${items.map((item) => `${item},`).join(' ')})`;
      const before = fixtures.map((f) => `\n        ${f.name}, ${f.name}_unexpected, ${f.name}_calls = _fixture(${tuple(f.values.members)}, [${f.values.rows.map((row) => `(${row.join(', ')})`).join(', ')}])`).join('');
      const after = fixtures
        .map((f) => `\n        self.assertEqual(${f.name}_unexpected, [])${f.values.calls === undefined ? '' : `\n        self.assertEqual(${f.name}_calls, [${f.values.calls.map((call) => `(${call.join(', ')})`).join(', ')}])`}`)
        .join('');
      const receiverMade = receiverOfCase(kase.receiver);
      const receiver = receiverMade.expr;
      const call = invoke(fn, callArgs(model, ctx, fn, (arg) => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.name;
      }), receiver);
      const expected = kase.expected === undefined ? undefined : expectedText(model, ctx, fn, kase.expected.value);
      usesSame ||= expected !== undefined && 'text' in expected;
      usesTokens ||= expected !== undefined && 'tokens' in expected;
      const check = expected === undefined
        ? `\n        ${call}`
        : 'refused' in expected
          ? `\n        self.fail(${pyString(expected.refused)})`
          : 'tokens' in expected
            ? expected.round === undefined
              ? `\n        self.assertEqual(_tokens(${call}), json.loads(${pyString(expected.tokens)}))`
              : `\n        result = ${call}\n        expected = json.loads(${pyString(expected.tokens)})\n        self.assertEqual(_tokens(result), expected)\n        self.assertEqual(_tokens(_native._alias_round_${langName('python', expected.round, 'variable')}(result)), expected)`
            : `\n        result = ${call}\n        expected = ${expected.text}\n        self.assertTrue(_same(result, expected), f"{result!r} is not {expected!r}")`;
      out.push(`
    def test_gn13e_${name}_${caseSnake(kase.id)}(self) -> None:${receiverMade.lines}${before}${check}${after}`);
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
        self.assertIs(caught.exception, raised)${judgesCallbackResult(model, cbUnit) ? `

    def test_k2_${name}_refuses_a_callback_result_of_another_type(self) -> None:
        with self.assertRaises((${model.classes.map((c) => `pkg.${c.name}`).join(', ')})) as caught:
            ${with_({ returns: 'wrong' })}
        self.assertIn(caught.exception.kind, ("invalid_argument_type", "invalid_number", "invalid_text"))` : ''}`);
      // GN-6q: a member that reaches language code calls the callback on the worker thread of asyncio.to_thread.
      if (fn.reaches === true) {
        usesAsyncio = true;
        const args = callArgs(model, ctx, fn, (arg) => (arg === callback ? ctx.callbackNew(cbUnit, { raise: 'raised' }) : placeholder(model, ctx, arg.type, true)));
        const awaited = invoke(fn, args, recv).replace(/(\.)([a-z_0-9]+)\(/, (_all, dot: string, member: string) => `${dot}a${member}(`);
        out.push(`
    def test_gn6q_${name}_awaits_a_callback_on_the_thread_of_to_thread(self) -> None:
        raised = LookupError("raised by the callback")
        with self.assertRaises(LookupError) as caught:
            asyncio.run(${awaited})
        self.assertIs(caught.exception, raised)`);
      }
    }
    // GN-6z: a value of a function type that is not callable is refused as it enters.
    const functionArg = fn.args.find((a) => typeof a.type === 'object' && 'function' in a.type);
    if (functionArg !== undefined && reachable) {
      out.push(`
    def test_gn6z_${name}_refuses_a_${langName('python', functionArg.name, 'variable')}_that_is_not_callable(self) -> None:
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${target(callArgs(model, ctx, fn, (arg) => (arg === functionArg ? '0' : placeholder(model, ctx, arg.type, true))))}
        self.assertEqual(caught.exception.kind, "invalid_argument_type")`);
    }
    for (const kase of stringCases(model, fn)) {
      out.push(`
    def test_n4_${name}_${caseSnake(kase.id)}(self) -> None:${receiverOfCase(kase.receiver).lines}
        self.assertEqual(${invoke(fn, '', receiverOfCase(kase.receiver).expr)}, ${pyString(kase.result)})`);
    }
    // N-4: a hook takes the arguments of the language's protocol, so it has no G-7 test. A member without parameters is
    // a function of no arguments in CPython, which says so for a positional and for a keyword argument; a constructor
    // without parameters is the __new__ of PyO3, which counts the positional arguments and names the keyword.
    if (fn.kind === 'property' || fn.special !== undefined || !reachable) continue;
    const bare = fn.args.length === 0;
    const pyo3New = bare && fn.kind === 'constructor';
    const extra = pyo3New ? 'takes 0 positional arguments' : bare ? 'takes no arguments' : 'positional';
    const unknown = pyo3New ? 'unexpected keyword argument' : bare ? 'takes no keyword arguments' : 'unexpected keyword';
    out.push(`
    def test_g7_${name}_counts_and_names_its_arguments(self) -> None:${fn.args.every((a) => a.default !== undefined) ? '' : `
        with self.assertRaisesRegex(TypeError, "missing"):
            ${target('')}`}
        with self.assertRaisesRegex(TypeError, "${extra}"):
            ${target(callArgs(model, ctx, fn, values, 'None'))}
        with self.assertRaisesRegex(TypeError, "${unknown}"):
            ${target([callArgs(model, ctx, fn, values), 'not_a_parameter=1'].filter((a) => a !== '').join(', '))}`);
  }
  // B-5c (GN-6h): a poisoned object is refused at every place, and an instance at a write place and another is busy.
  const held = heldTests(model, ctx, invoke, 'held');
  const refused = (category: string, kind: string, call: string): string => `
        with self.assertRaises(pkg.${cls(category)}) as caught:
            ${call}
        self.assertIs(type(caught.exception), pkg.${cls(category)})
        self.assertEqual(caught.exception.kind, ${pyString(kind)})`;
  for (const test of held.poison) {
    out.push(`
    def test_b5c_${langName('python', test.object.unit.name, 'variable')}_refuses_a_poisoned_object(self) -> None:
        held = ${test.instance}${[`_native.${POISON_ENTRY.python}(held)`, test.receiver, test.parameter].filter((call) => call !== undefined).map((call) => refused('internal', 'internal', call)).join('')}`);
  }
  for (const test of held.busy) {
    out.push(`
    def test_b5c_${langName('python', test.fn.unit.name, 'variable')}_${langName('python', test.fn.member.name, 'callable')}_refuses_the_instance_at_two_places(self) -> None:
        held = ${test.instance}${test.armed === undefined ? '' : `\n        armed = _native._arm_faults(${pyString(test.fn.member.id)}, ${pyString(test.armed.faults)})`}${refused('busy', 'busy', test.call)}${test.after === undefined ? '' : `\n        ${test.after}`}${test.armed === undefined ? '' : `
        # GN-8a: the refused call did not reach the core, so the next call takes the arming.${refused(test.armed.category, test.armed.kind, test.armed.again)}
        self.assertEqual(_native._fault_left(armed), [])`}`);
  }
  // GN-6o: a method with the receiver self leaves its object consumed, whatever the call gives.
  for (const fn of callables(model).filter((f) => f.receiver === 'self')) {
    const sample = sampleReceiver(model, fn);
    if (sample === undefined) continue;
    usesOutcome = true;
    const args = callArgs(model, ctx, fn, (arg) => placeholder(model, ctx, arg.type));
    out.push(`
    def test_gn6o_${langName('python', fn.unit.name, 'variable')}_${langName('python', fn.member.name, 'callable')}_consumes_its_object(self) -> None:
        held = ${made(sample, (arg) => caseValue(model, ctx, arg, sample.args))}
        _outcome(lambda: ${invoke(fn, args, 'held')})
        with self.assertRaises(pkg.${cls('type')}) as caught:
            ${invoke(fn, args, 'held')}
        self.assertEqual(caught.exception.kind, "consumed")`);
  }
  // GN-6p, B-10: an object destroyed without its cleanup call warns with ResourceWarning, and after it does not.
  let usesWarnings = false;
  for (const object of model.objects) {
    const cleanup = object.cleanup;
    const sample = cleanup === undefined ? undefined : sampleReceiver(model, cleanup);
    if (cleanup === undefined || sample === undefined) continue;
    usesWarnings = true;
    usesOutcome = true;
    const variable = langName('python', object.unit.name, 'variable');
    const callName = langName('python', cleanup.member.name, 'callable');
    const recv = made(sample, (arg) => caseValue(model, ctx, arg, sample.args));
    const warned = 'self.assertEqual([str(w.message) for w in caught if issubclass(w.category, ResourceWarning)], ';
    out.push(`
    def test_b10_${variable}_warns_without_${callName}(self) -> None:
        held = ${recv}
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            del held
        ${warned}[${pyString(cleanupWarning(langName('python', object.unit.name, 'class'), memberName('python', cleanup)))}])

    def test_b10_${variable}_does_not_warn_after_${callName}(self) -> None:
        held = ${recv}
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            _outcome(lambda: ${invoke(cleanup, callArgs(model, ctx, cleanup, (arg) => placeholder(model, ctx, arg.type)), 'held')})
            del held
        ${warned}[])`);
  }
  // U-7: the cases of an alias run its in function alone, through the entry point of the feature codec-test.
  for (const kase of aliasCases(model)) {
    out.push(`
    def test_u7_${langName('python', kase.alias.unit.name, 'variable')}_in_${caseSnake(kase.id)}(self) -> None:
        with self.assertRaises(pkg.${cls(kase.category)}) as caught:
            _native._alias_in_${langName('python', kase.alias.unit.name, 'variable')}(${fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)})
        self.assertIs(type(caught.exception), pkg.${cls(kase.category)})
        self.assertEqual(caught.exception.kind, ${pyString(kase.kind)})`);
  }
  // G-5: a value of the language of the sort date (HOST_VALUES) is a date of the module datetime.
  const usesDatetime = out.some((line) => line.includes(HOST_VALUES.date.python));
  // GN-6u: an object goes through the native row and back as the same object, and the binding keeps no reference to it.
  const roundTrip = nativeRoundTrip(model.contract, 'python');
  const roundFn = roundTrip === undefined ? undefined : model.functions.find((f) => f.member.id === roundTrip.id);
  if (roundFn !== undefined) {
    const name = langName('python', roundFn.member.name, 'variable');
    const same = (value: string): string => invoke(roundFn, value, '');
    out.push(`
    def test_gn6u_${name}_gives_back_the_same_object_and_releases_it(self) -> None:
        ${same('_Subject()')}
        subject = _Subject()
        before = sys.getrefcount(subject)
        self.assertIs(${same('subject')}, subject)
        ${same('_Subject()')}
        self.assertEqual(sys.getrefcount(subject), before)
        alive = weakref.ref(subject)
        del subject
        self.assertIsNone(alive())`);
  }
  const usesCasePath = out.some((block) => block.includes('self._case_path('));
  return `${pyHeader()}
"""The generated tests of the binding (G-5)."""

${usesAsyncio ? 'import asyncio\n' : ''}${usesSame ? 'import dataclasses\n' : ''}${usesDatetime ? 'import datetime\n' : ''}${usesErrno ? 'import errno\n' : ''}${usesCasePath ? 'import os\nimport tempfile\n' : ''}${usesTokens ? 'import json\nimport struct\n' : ''}${roundFn === undefined ? '' : 'import sys\n'}import unittest
${usesWarnings ? 'import warnings\n' : ''}${roundFn === undefined ? '' : 'import weakref\n'}
import ${module} as pkg
${[...internalModules].sort().map((m) => `import ${module}.${m}\n`).join('')}from ${module} import _native
${usesFixture ? PYTHON_FIXTURE : ''}${usesOutcome ? PYTHON_OUTCOME : ''}${usesSame ? PYTHON_SAME : ''}${roundFn === undefined ? '' : PYTHON_SUBJECT}${usesTokens ? pythonTokens(tokenForms(model, 'python')) : ''}${helpers.join('')}

class GeneratedTest(unittest.TestCase):${usesCasePath ? PYTHON_CASE_PATH : ''}
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

// GN-6u: the subject of the round-trip test, an instance of a class of the test, since a built-in value may be
// interned or cached.
const PYTHON_SUBJECT = `

class _Subject:
    """An object that only the test makes."""
`;

const pythonBaseOf = (category: string): string =>
  ({ value: 'ValueError', type: 'TypeError', io: 'OSError', store: 'RuntimeError', busy: 'RuntimeError', internal: 'RuntimeError' })[category] ?? 'Exception';
