// The generated PHPUnit test of the PHP binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run with the
// extension loaded.

import type { Unit } from '../contract.ts';
import { type Model, Unsupported, POISON_ENTRY, errorUnitOfKind, hookCall, langName, unitOf } from './model.ts';
import { heldTests } from './tests_held.ts';
import { type PhpLayout, phpNamespace } from './php.ts';
import { type CallbackHow, type Context, type MadeForm, type Receiver, isPlain, madeLines, callArgs, caseRefusal, callbackArg, callables, bytesKind, caseValue, isNumber, placeholder, fixtureValues, fixturesOf, aliasCases, aliasRepresentative, expectedErrno, fromJson, judgesCallbackResult, raisingCases, refusedKeyMap, resultCases, expectedText, samePairs, sampleReceiver, stringCases, textKind, wrapText } from './samples.ts';
import type { Fn } from './model.ts';
import { header, phpText } from './text.ts';

const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['NAN', 'INF', '-INF', '1.5', 'true', "'7'", '-1', 'null'],
  int: ['NAN', 'INF', '-INF', '1.5', 'true', "'7'", 'null'],
  float: ['true', "'7'", '1', 'null'],
};

const phpBase = (category: string): string => ({ value: 'InvalidArgumentException', type: 'TypeError' })[category] ?? 'RuntimeException';

export function phpTests(model: Model, layout: PhpLayout): string {
  const enumRef = (name: string, value: string): string => {
    const unit = model.enums.find((u) => langName('python', u.name, 'class') === name);
    const ns = unit === undefined ? layout.namespace : phpNamespace(layout, unit.module);
    return `\\${ns}\\${langName('php', unit?.name ?? [name], 'class')}::from(${phpText(value)})`;
  };
  const recordNew = (unit: Unit, fields: string[]): string =>
    `new \\${phpNamespace(layout, unit.module)}\\${langName('php', unit.name, 'class')}(${(unit.fields ?? []).map((f, i) => `${langName('php', f.name, 'variable')}: ${fields[i] ?? ''}`).join(', ')})`;
  const callbackNew = (unit: Unit, how: CallbackHow): string => {
    if ('missing' in how) return 'new class {}';
    const body = 'raise' in how ? `throw ${how.raise};` : how.returns === 'wrong' ? 'return new \\stdClass();' : 'return null;';
    return `new class { ${(unit.members ?? []).map((m) => `public function ${langName('php', m.name, 'callable')}(mixed ...$args): mixed { ${body} }`).join(' ')} }`;
  };
  // GN-13: an instance of an error unit with a kind, which PHP code sets in the scope of the class of its category,
  // the class that declares kind, because no constructor of the classes takes a kind.
  const errorNew = (unit: Unit, kind: string, message: string): string => {
    const name = `\\${phpNamespace(layout, unit.module)}\\${langName('php', unit.name, 'class')}`;
    const scope = `\\${layout.namespace}\\${model.classes.find((c) => c.category === unit.category)?.name ?? ''}`;
    return `(static function (): ${name} { $error = new ${name}(${phpText(message)}); (static fn () => $error->kind = ${phpText(kind)})->bindTo(null, ${scope}::class)(); return $error; })()`;
  };
  const ctx: Context = { lang: 'php', enumRef, recordNew, callbackNew, errorNew };
  const cls = (category: string): string => `\\${layout.namespace}\\${model.classes.find((c) => c.category === category)?.name ?? ''}`;
  // E-2: the exact class of a kind is the class of the error unit that its row names, or the class of its category.
  // E-2, B-4: the exact class of a failure of a case: the class of the error unit of its kind, or of its category.
  const exactClass = (raises: { kind: string; category: string }): string => {
    const unit = errorUnitOfKind(model, raises.kind);
    return unit === undefined ? cls(raises.category) : `\\${phpNamespace(layout, unit.unit.module)}\\${langName('php', unit.unit.name, 'class')}`;
  };
  const methods: string[] = [];
  let usesFixture = false;
  const invoke = (fn: Fn, args: string, receiver: string): string => {
    const hook = hookCall('php', fn, receiver);
    if (hook !== undefined) return hook;
    const member = langName('php', fn.member.name, 'callable');
    const ns = phpNamespace(layout, fn.module);
    const cls = `\\${ns}\\${langName('php', fn.unit.name, 'class')}`;
    if (fn.kind === 'function') return `\\${ns}\\${member}(${args})`;
    if (fn.kind === 'constructor') return `new ${cls}(${args})`;
    if (fn.kind === 'static') return `${cls}::${member}(${args})`;
    // U-2: a property is a method in PHP.
    return `${receiver}->${member}(${args})`;
  };
  ctx.objectNew = (factory, args) => invoke(factory, args, '');

  // GN-13f: the statements that make the receiver of a case, each on a line of the test, and its expression.
  const form: MadeForm = {
    ctx,
    invoke,
    bind: (local, expr) => `$${local} = ${expr};`,
    name: (local) => `$${local}`,
    run: (expr) => `${expr};`,
    fails: (expr, kind, what) => {
      usesOutcome = true;
      return `self::assertStringContainsString(${phpText(`'kind' => '${kind}'`)}, self::outcome(fn () => ${expr}), ${phpText(`G-5: ${what}`)});`;
    },
    pick: (expr, step) => ('field' in step ? `${expr}->${langName('php', step.field.split('_'), 'variable')}` : `${expr}[${'index' in step ? step.index : step.tuple}]`),
  };
  const receiverOfCase = (receiver: Receiver | undefined): { lines: string; expr: string } => {
    if (receiver === undefined) return { lines: '', expr: '' };
    const built = madeLines(model, form, receiver);
    return { lines: built.lines.map((line) => `\n        ${line}`).join(''), expr: built.expr };
  };
  // GN-13f: a receiver as one expression; an instance value is made in a closure that the expression calls.
  const made = (receiver: Receiver): string => {
    if (isPlain(receiver)) return invoke(receiver.factory, callArgs(model, ctx, receiver.factory, (arg) => caseValue(model, ctx, arg, receiver.args)), '');
    const built = madeLines(model, form, receiver);
    return `(function () { ${built.lines.join(' ')} return ${built.expr}; })()`;
  };
  ctx.instanceNew = made;
  let usesOutcome = false;
  let usesSame = false;
  for (const fn of callables(model)) {
    const name = fn.kind === 'function' ? langName('php', fn.member.name, 'callable') : `${langName('php', fn.unit.name, 'class')}${fn.kind === 'constructor' ? 'Construct' : langName('php', fn.member.name, 'class')}`;
    const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
    const recv = sample === undefined ? '' : made(sample);
    const qualified = (args: string): string => invoke(fn, args, recv);
    const call = (override: Map<unknown, string>): string =>
      qualified(callArgs(model, ctx, fn, (arg) => override.get(arg) ?? placeholder(model, ctx, arg.type)));
    const reachable = fn.receiver === undefined || sample !== undefined;
    for (const arg of reachable ? fn.args : []) {
      const argName = langName('php', arg.name, 'variable');
      const number = isNumber(arg.type);
      if (number !== undefined) {
        // U-2: null is an argument with a default that was left out (GN-10), so it is no bad number of one.
        const bad = (BAD_NUMBERS[number] ?? []).filter((b) => !(b === 'null' && ((typeof arg.type === 'object' && 'optional' in arg.type) || arg.default !== undefined)));
        methods.push(`
    public function testB2${name}${argName}RefusesWhatIsNot${number}(): void
    {
        foreach ([${bad.join(', ')}] as $bad) {
            try {
                ${call(new Map([[arg, '$bad']]))};
                self::fail('no error for ' . var_export($bad, true));
            } catch (${cls('value')} $error) {
                self::assertSame(${cls('value')}::class, $error::class);
                self::assertSame('invalid_number', $error->kind());
            }
        }
    }`);
      }
      const refused = refusedKeyMap(model, ctx, arg.type);
      if (refused !== undefined) {
        methods.push(`
    public function testT2${name}${argName}RefusesA${refused.kind.charAt(0).toUpperCase()}${refused.kind.slice(1)}Key(): void
    {
        try {
            ${call(new Map([[arg, refused.value]]))};
            self::fail('no error');
        } catch (${cls('type')} $error) {
            self::assertSame('invalid_argument_type', $error->kind());
        }
    }`);
      }
      const bytes = bytesKind(arg.type);
      if (bytes !== undefined) {
        methods.push(`
    public function testT7${name}${argName}RefusesWhatIsNoString(): void
    {
        try {
            ${call(new Map([[arg, '1']]))};
            self::fail('no error');
        } catch (${cls('type')} $error) {
            self::assertSame('invalid_argument_type', $error->kind());
        }
    }`);
      }
      // U-7: a kind of an alias's in function reaches the caller of a member that takes the alias.
      const refusedValue = aliasRepresentative(model, ctx, arg.type);
      if (refusedValue !== undefined) {
        methods.push(`
    public function testU7${name}${argName}GivesTheKindOf${langName('php', refusedValue.kase.alias.unit.name, 'class')}(): void
    {
        try {
            ${call(new Map([[arg, refusedValue.value]]))};
            self::fail('no error');
        } catch (${cls(refusedValue.kase.category)} $error) {
            self::assertSame(${cls(refusedValue.kase.category)}::class, $error::class);
            self::assertSame(${phpText(refusedValue.kase.kind)}, $error->kind());
        }
    }`);
      }
      if (textKind(arg.type) === 'text') {
        methods.push(`
    public function testB3${name}${argName}RefusesBytesThatAreNotUtf8(): void
    {
        try {
            ${call(new Map([[arg, wrapText(arg.type, '"\\xff"')]]))};
            self::fail('no error');
        } catch (${cls('value')} $error) {
            self::assertSame('invalid_text', $error->kind());
        }
    }`);
      }
    }
    for (const pair of reachable ? samePairs(model, ctx, fn) : []) {
      usesOutcome = true;
      methods.push(`
    public function testU2${name}${langName('php', pair.arg.name, 'class')}LeftOutIsItsDefault(): void
    {
        self::assertSame(
            self::outcome(static fn (): mixed => ${qualified(callArgs(model, ctx, fn, pair.left))}),
            self::outcome(static fn (): mixed => ${qualified(callArgs(model, ctx, fn, pair.right))}),
        );
    }`);
    }
    // G-5: a callback parameter is the fixture of the case, whose record of calls the test reads after the call. A
    // call that no row answers is recorded and throws, so a core that swallows the exception still fails the test.
    const fixturesFor = (id: string, args: Map<Fn['args'][number], unknown>) => {
      const fixtures = fixturesOf(model, fn, id, args).map((fixture, i) => ({ fixture, name: `$fixture${i}`, values: fixtureValues(model, ctx, fixture) }));
      usesFixture ||= fixtures.length > 0;
      const before = fixtures
        .map(
          (f) => `
        ${f.name} = new class([${f.values.rows.map((row) => `[${row.join(', ')}]`).join(', ')}]) {
            public array $unexpected = [];
            public array $calls = [];
            public function __construct(private array $rows) {}
${f.values.members.map((member) => `            public function ${member.slice(1, -1)}(mixed ...$args): mixed { return $this->answer(${member}, $args); }`).join('\n')}
            private function answer(string $name, array $args): mixed
            {
                $this->calls[] = [$name, $args];
                foreach ($this->rows as $at => $row) {
                    if ($row[0] === $name && $row[1] === $args) {
                        if ($row[3]) {
                            unset($this->rows[$at]);
                        }
                        if ($row[4] !== null) {
                            throw $row[4];
                        }
                        return $row[2];
                    }
                }
                $this->unexpected[] = [$name, $args];
                throw new UnexpectedCall($name);
            }
        };`,
        )
        .join('');
      const after = fixtures
        .map((f) => `\n        self::assertSame([], ${f.name}->unexpected);${f.values.calls === undefined ? '' : `\n        self::assertSame([${f.values.calls.map((call) => `[${call.join(', ')}]`).join(', ')}], ${f.name}->calls);`}`)
        .join('');
      return { fixtures, before, after };
    };
    for (const kase of raisingCases(model, fn)) {
      const id = kase.id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        methods.push(`
    public function testB4${name}${id}(): void
    {
        self::fail(${phpText(refusal)});
    }`);
        continue;
      }
      const { fixtures, before, after } = fixturesFor(kase.id, kase.args);
      const caseArg = (arg: Fn['args'][number]): string | undefined => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.name;
      };
      // G-5: a case that arms faults makes its receiver and arguments first, so no call but the one under test runs
      // between the arming and that call, and requires every armed fault to have fired.
      const receiverMade = receiverOfCase(kase.receiver);
      const made_ = receiverMade.expr;
      const locals = kase.faults === undefined ? [] : [...(made_ === '' ? [] : [['$receiver', made_]]), ...fn.args.flatMap((arg, i) => { const value = caseArg(arg); return value === undefined ? [] : [[`$arg${i}`, value]]; })];
      const arming = kase.faults === undefined ? '' : `${locals.map(([local, value]) => `\n        ${local} = ${value};`).join('')}\n        $armed = \\${layout.namespace}\\Internal\\armFaults(${phpText(fn.member.id)}, ${phpText(kase.faults)});`;
      const call = kase.faults === undefined ? invoke(fn, callArgs(model, ctx, fn, caseArg), made_) : invoke(fn, callArgs(model, ctx, fn, (arg) => (caseArg(arg) === undefined ? undefined : `$arg${fn.args.indexOf(arg)}`)), made_ === '' ? '' : '$receiver');
      const errno = expectedErrno(kase);
      // PHP has no table of the errno symbols of its machine, and where a test reads their values is not decided.
      if (errno !== null && 'symbol' in errno) throw new Unsupported(`the case ${kase.id} of ${fn.member.id}: the errno symbol ${errno.symbol} is not compared in PHP yet (G-5)`);
      methods.push(`
    public function testB4${name}${id}(): void
    {${receiverMade.lines}${before}${arming}
        try {
            ${call};
            self::fail('no error');
        } catch (${cls(kase.raises.category)} $error) {
            self::assertSame(${exactClass(kase.raises)}::class, $error::class);
            self::assertInstanceOf(\\${phpBase(kase.raises.category)}::class, $error);
            self::assertSame(${phpText(kase.raises.kind)}, $error->kind());
            self::assertSame(${kase.raises.status === null ? 'null' : String(kase.raises.status)}, $error->status());
            ${errno === null ? 'self::assertNull($error->errno());' : `self::assertSame(${String(errno.value)}, $error->errno());`}
        }${kase.faults === undefined ? '' : `\n        self::assertSame([], \\${layout.namespace}\\Internal\\faultLeft($armed));`}${after}
    }`);
    }
    // GN-13e: every case that does not raise runs, and its result is compared with the value that the case gives.
    for (const kase of resultCases(model, fn)) {
      const id = kase.id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      if (kase.refused !== undefined) {
        methods.push(`
    public function testGn13e${name}${id}(): void
    {
        self::fail(${phpText(kase.refused)});
    }`);
        continue;
      }
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        methods.push(`
    public function testGn13e${name}${id}(): void
    {
        self::fail(${phpText(refusal)});
    }`);
        continue;
      }
      const { fixtures, before, after } = fixturesFor(kase.id, kase.args);
      const receiverMade = receiverOfCase(kase.receiver);
      const call = invoke(fn, callArgs(model, ctx, fn, (arg) => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.name;
      }), receiverMade.expr);
      const expected = kase.expected === undefined ? undefined : expectedText(model, ctx, fn, kase.expected.value);
      usesSame ||= expected !== undefined && 'text' in expected;
      const check = expected === undefined
        ? `\n        ${call};\n        self::addToAssertionCount(1);`
        : 'refused' in expected ? `\n        self::fail(${phpText(expected.refused)});` : `\n        self::assertSame(self::same(${expected.text}), self::same(${call}));`;
      methods.push(`
    public function testGn13e${name}${id}(): void
    {${receiverMade.lines}${before}${check}${after}
    }`);
    }
    const values = (arg: { type: unknown }): string => placeholder(model, ctx, arg.type as never);
    const callback = callbackArg(model, fn);
    const cbUnit = callback === undefined ? undefined : unitOf(model, callback.type);
    if (callback !== undefined && cbUnit !== undefined && reachable) {
      const with_ = (how: CallbackHow): string =>
        qualified(callArgs(model, ctx, fn, (arg) => (arg === callback ? ctx.callbackNew(cbUnit, how) : placeholder(model, ctx, arg.type, true))));
      methods.push(`
    public function testK2${name}RefusesACallbackWithoutItsMembers(): void
    {
        try {
            ${with_({ missing: true })};
            self::fail('no error');
        } catch (${cls('type')} $error) {
            self::assertSame('invalid_callback', $error->kind());
        }
    }

    public function testK2${name}LetsTheExceptionOfACallbackThrough(): void
    {
        $raised = new \\LogicException('raised by the callback');
        try {
            ${with_({ raise: '$raised' }).replace('new class {', 'new class($raised) { public function __construct(private \\Throwable $raised) {} ').replaceAll('throw $raised;', 'throw $this->raised;')};
            self::fail('no error');
        } catch (\\LogicException $error) {
            self::assertSame($raised, $error);
        }
    }${judgesCallbackResult(model, cbUnit) ? `

    public function testK2${name}RefusesACallbackResultOfAnotherType(): void
    {
        try {
            ${with_({ returns: 'wrong' })};
            self::fail('no error');
        } catch (\\Throwable $error) {
            self::assertContains($error->kind(), ['invalid_argument_type', 'invalid_number', 'invalid_text']);
        }
    }` : ''}`);
    }
    for (const kase of stringCases(model, fn)) {
      // GN-6g: PHP gives Stringable to a class that has __toString.
      methods.push(`
    public function testN4${name}${kase.id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}(): void
    {${receiverOfCase(kase.receiver).lines}
        self::assertInstanceOf(\\Stringable::class, ${receiverOfCase(kase.receiver).expr});
        self::assertSame(${phpText(kase.result)}, ${invoke(fn, '', receiverOfCase(kase.receiver).expr)});
    }`);
    }
    // N-4: a hook takes the arguments of the language's protocol, so it has no G-7 test.
    if (fn.kind === 'property' || fn.special !== undefined || !reachable) continue;
    methods.push(`
    public function testG7${name}CountsAndNamesItsArguments(): void
    {${fn.args.every((a) => a.default !== undefined) ? '' : `
        try {
            ${qualified('')};
            self::fail('no error for no argument');
        } catch (\\ArgumentCountError $error) {
            self::assertStringContainsString('expects', $error->getMessage());
        }`}
        try {
            ${qualified([...fn.args.map(values), 'null'].join(', '))};
            self::fail('no error for one argument more');
        } catch (\\ArgumentCountError $error) {
            self::assertStringContainsString('expects', $error->getMessage());
        }
        try {
            ${qualified([callArgs(model, ctx, fn, values), 'notAParameter: 1'].filter((a) => a !== '').join(', '))};
            self::fail('no error for an unknown name');
        } catch (\\Error $error) {
            self::assertSame(\\Error::class, $error::class);
            self::assertStringContainsString('Unknown named parameter', $error->getMessage());
        }
    }`);
  }
  // B-5c (GN-6h): a poisoned object is refused at every place, and an instance at a write place and another is busy.
  const held = heldTests(model, ctx, invoke, '$held');
  const refused = (category: string, kind: string, call: string): string => `
        try {
            ${call};
            self::fail('no error');
        } catch (${cls(category)} $error) {
            self::assertSame(${cls(category)}::class, $error::class);
            self::assertSame('${kind}', $error->kind());
        }`;
  for (const test of held.poison) {
    methods.push(`
    public function testB5c${langName('php', test.object.unit.name, 'class')}RefusesAPoisonedObject(): void
    {
        $held = ${test.instance};${[`\\${layout.namespace}\\Internal\\${POISON_ENTRY.php}($held)`, test.receiver, test.parameter].filter((call) => call !== undefined).map((call) => refused('internal', 'internal', call)).join('')}
    }`);
  }
  for (const test of held.busy) {
    methods.push(`
    public function testB5c${langName('php', test.fn.unit.name, 'class')}${langName('php', test.fn.member.name, 'class')}RefusesTheInstanceAtTwoPlaces(): void
    {
        $held = ${test.instance};${test.armed === undefined ? '' : `\n        $armed = \\${layout.namespace}\\Internal\\armFaults(${phpText(test.fn.member.id)}, ${phpText(test.armed.faults)});`}${refused('busy', 'busy', test.call)}${test.after === undefined ? '' : `\n        ${test.after};`}${test.armed === undefined ? '' : `
        // GN-8a: the refused call did not reach the core, so the next call takes the arming.${refused(test.armed.category, test.armed.kind, test.armed.again)}
        self::assertSame([], \\${layout.namespace}\\Internal\\faultLeft($armed));`}
    }`);
  }
  // U-7: the cases of an alias run its in function alone, through the entry point of the feature codec-test.
  for (const kase of aliasCases(model)) {
    const alias = langName('php', kase.alias.unit.name, 'class');
    methods.push(`
    public function testU7${alias}In${kase.id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}(): void
    {
        try {
            \\${layout.namespace}\\Internal\\aliasIn${alias}(${fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)});
            self::fail('no error');
        } catch (${cls(kase.category)} $error) {
            self::assertSame(${cls(kase.category)}::class, $error::class);
            self::assertSame(${phpText(kase.kind)}, $error->kind());
        }
    }`);
  }
  return `<?php

// ${header('').trim()}

declare(strict_types=1);

namespace ${layout.namespace}\\Tests;

use PHPUnit\\Framework\\TestCase;

/** The generated tests of the binding (G-5). */
final class GeneratedTest extends TestCase
{
    public function testB7APanicIsKindInternal(): void
    {
        try {
            \\${layout.namespace}\\Internal\\panicTest();
            self::fail('no error');
        } catch (${cls('internal')} $error) {
            self::assertSame('internal', $error->kind());
            self::assertInstanceOf(\\RuntimeException::class, $error);
        }
    }

    public function testAnErrorHasTheFileAndLineOfItsCall(): void
    {
        try {
            $line = __LINE__ + 1;
            \\${layout.namespace}\\Internal\\panicTest();
            self::fail('no error');
        } catch (${cls('internal')} $error) {
            self::assertSame(__FILE__, $error->getFile());
            self::assertSame($line, $error->getLine());
        }
    }
${methods.join('\n')}${usesSame ? `

    /**
     * GN-13e: a result in a form that assertSame compares: an object other than an enum case is its class and its
     * properties, and NaN is a text, because NaN is not identical to itself.
     */
    private static function same(mixed $value): mixed
    {
        if (\\is_float($value) && \\is_nan($value)) {
            return 'NAN';
        }
        if (\\is_array($value)) {
            return \\array_map(self::same(...), $value);
        }
        if (\\is_object($value) && !$value instanceof \\UnitEnum) {
            return [$value::class, self::same(\\get_object_vars($value))];
        }
        return $value;
    }` : ''}${usesOutcome ? `

    /**
     * G-5: what a call gives: its result, or the class and the kind of its failure, as the text that states the types.
     *
     * @param \\Closure(): mixed $call
     */
    private static function outcome(\\Closure $call): string
    {
        try {
            return var_export(['result' => $call()], true);
        } catch (\\Throwable $error) {
            return var_export(['error' => $error::class, 'kind' => \\method_exists($error, 'kind') ? $error->kind() : null], true);
        }
    }` : ''}
}
${usesFixture ? `
/** A call that no row of a callback fixture answers (G-5). */
final class UnexpectedCall extends \\LogicException
{
}
` : ''}`;
}
