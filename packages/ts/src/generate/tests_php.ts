// The generated PHPUnit test of the PHP binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run with the
// extension loaded.

import type { Member, Unit } from '../contract.ts';
import { type Model, callsCode, Unsupported, machineFunction, POISON_ENTRY, cleanupWarning, errorUnitOfKind, hookCall, langName, memberName, unitOf, nativeRoundTrip, takesFunction } from './model.ts';
import { heldTests } from './tests_held.ts';
import { type PhpLayout, phpNamespace } from './php.ts';
import { type After, type CallbackHow, type Context, type MadeForm, type Receiver, FIXTURE_RAISED, callbackCases, isPath, isPlain, madeLines, callArgs, casePascal, checkCaseNames, caseRefusal, callbackArg, callables, bytesKind, caseValue, isNumber, placeholder, fixtureValues, fixturesOf, aliasCases, aliasRepresentative, expectedErrno, fromJson, judgesCallbackResult, phpCaseTests, raisingCases, refusedKeyMap, unsafeKeyMap, resultCases, expectedText, PHP_TOKENS, samePairs, sampleReceiver, stringCases, textKind, wrapText, functionFixturesOf, stepExpected } from './samples.ts';
import type { Fn } from './model.ts';
import { header, phpText } from './text.ts';

const BAD_NUMBERS: Record<string, string[]> = {
  uint: ['NAN', 'INF', '-INF', '1.5', 'true', "'7'", '-1', '2 ** 53', 'null'],
  int: ['NAN', 'INF', '-INF', '1.5', 'true', "'7'", '2 ** 53', '-(2 ** 53)', 'null'],
  float: ['true', "'7'", '1', 'null'],
};

const phpBase = (category: string): string => ({ value: 'InvalidArgumentException', type: 'TypeError' })[category] ?? 'RuntimeException';

// G-5: the object of a callback fixture: a call that no row answers is recorded and throws, so a core that swallows the
// exception still fails the test, which reads the record.
function phpFixture(values: { members: string[]; rows: string[][] }): string {
  return `new class([${values.rows.map((row) => `[${row.join(', ')}]`).join(', ')}]) {
            public array $unexpected = [];
            public array $calls = [];
            public function __construct(private array $rows) {}
${values.members.map((member) => `            public function ${member.slice(1, -1)}(mixed ...$args): mixed { return $this->answer(${member}, $args); }`).join('\n')}
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
        }`;
}

// GN-6y: the directory of a test, in which a case resolves its relative paths; PHPUnit makes an instance per test, and
// tearDown removes the directory.
const PHP_CASE_PATH = `
    private ?string $caseDir = null;

    private function casePath(string $relative): string
    {
        if ($this->caseDir === null) {
            $this->caseDir = sys_get_temp_dir() . '/case-' . bin2hex(random_bytes(8));
            mkdir($this->caseDir);
        }
        return $this->caseDir . '/' . $relative;
    }

    protected function tearDown(): void
    {
        if ($this->caseDir === null) {
            return;
        }
        $files = new \\RecursiveIteratorIterator(new \\RecursiveDirectoryIterator($this->caseDir, \\FilesystemIterator::SKIP_DOTS), \\RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($files as $file) {
            $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
        }
        rmdir($this->caseDir);
        $this->caseDir = null;
    }
`;

export function phpTests(model: Model, layout: PhpLayout): string {
  checkCaseNames(model, casePascal, true);
  const caseTestList = phpCaseTests(model);
  const enumRef = (name: string, value: string): string => {
    const unit = model.enums.find((u) => langName('python', u.name, 'class') === name);
    const ns = unit === undefined ? layout.namespace : phpNamespace(layout, unit.module);
    return `\\${ns}\\${langName('php', unit?.name ?? [name], 'class')}::from(${phpText(value)})`;
  };
  // T-3, GN-6c: a record of another repository is the class of the namespace of that repository.
  const recordOwner = (unit: Unit): PhpLayout => {
    const library = model.foreignRecords.find((r) => r.unit === unit)?.library;
    return library === undefined ? layout : { ...layout, namespace: (model.foreign.get(library)?.packages['php'] as { namespace: string }).namespace };
  };
  const recordNew = (unit: Unit, fields: string[]): string =>
    `new \\${phpNamespace(recordOwner(unit), unit.module)}\\${langName('php', unit.name, 'class')}(${(unit.fields ?? []).map((f, i) => `${langName('php', f.name, 'variable')}: ${fields[i] ?? ''}`).join(', ')})`;
  const callbackNew = (unit: Unit, how: CallbackHow): string => {
    if ('missing' in how) return 'new class {}';
    const body = 'raise' in how ? `throw ${how.raise};` : how.returns === 'wrong' ? 'return new \\stdClass();' : 'return null;';
    return `new class { ${(unit.members ?? []).map((m) => `public function ${langName('php', m.name, 'callable')}(mixed ...$args): mixed { ${body} }`).join(' ')} }`;
  };
  // GN-6x: a class of another repository, by the namespace of the owner's package.
  const foreignClass = (library: string, unit: Unit): string => {
    const namespace = (model.foreign.get(library)?.packages['php'] as { namespace: string } | undefined)?.namespace ?? '';
    return `\\${namespace}${unit.module === '' ? '' : `\\${unit.module.split('/').map((part) => langName('php', [part], 'class')).join('\\')}`}\\${langName('php', unit.name, 'class')}`;
  };
  // GN-13: an instance of an error unit with a kind, by the constructor of its category class (GN-10).
  const errorNew = (unit: Unit, kind: string, message: string): string =>
    `new \\${phpNamespace(layout, unit.module)}\\${langName('php', unit.name, 'class')}(${phpText(message)}, ${phpText(kind)})`;
  const ctx: Context = { lang: 'php', enumRef, recordNew, callbackNew, errorNew, foreignClass, casePath: (relative) => `$this->casePath(${phpText(relative)})` };
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
    arm: (local, member, faults) => `$${local} = \\${layout.namespace}\\Internal\\armFaults(${phpText(member)}, ${phpText(faults)});`,
    left: (local, what) => `self::assertSame([], \\${layout.namespace}\\Internal\\faultLeft($${local}), ${phpText(`G-5: ${what}`)});`,
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
  // GN-6aa: a callback value inside another value is the object of a fixture, whose unexpected call throws.
  ctx.fixtureNew = (values) => {
    usesFixture = true;
    return phpFixture(values);
  };
  // GN-6z: a function value inside another value is the call of a fixture as a Closure, whose unexpected call throws.
  ctx.functionMember = 'call';
  ctx.functionNew = (rows) => {
    usesFixture = true;
    return `${phpFixture({ members: [phpText('call')], rows })}->call(...)`;
  };
  let usesOutcome = false;
  let usesSame = false;
  let usesTokens = false;
  // GN-6ae: the function of a function fixture: each step calls a method on one of its arguments, and a step that
  // names a result requires it by an assertion, whose failure is an exception of the function; it then returns its
  // result, throws the instance of an error unit, or throws the exception that the test of the case holds. PHP has no
  // awaitable, so a fixture with awaits is the same plain function.
  let usesRaised = false;
  ctx.machineFunctionNew = (fixture) => {
    const steps = fixture.steps.map((step) => {
      const call = invoke(step.fn, step.args, `$args[${step.on}]`);
      if (step.expected === undefined) return `${call}; `;
      if ('refused' in step.expected) return `self::fail(${phpText(step.expected.refused)}); `;
      usesSame = true;
      return `self::assertSame(self::same(${step.expected.text}), self::same(${call})); `;
    }).join('');
    usesRaised ||= 'exception' in fixture.end;
    const end = 'result' in fixture.end ? `return ${fixture.end.result};` : 'raise' in fixture.end ? `throw ${fixture.end.raise};` : 'throw self::$raised;';
    return `function (mixed ...$args): mixed { ${steps}${end} }`;
  };
  // GN-6ae: after a case of a member that takes a callback or a function, the table of the crate keeps nothing that
  // was thrown, which the entry point of thrown-count-test counts.
  const kept = (fn: Fn): string => {
    if (!callsCode(model, fn)) return '';
    return `\n        self::assertSame(0, \\${layout.namespace}\\Internal\\thrownCount());`;
  };
  // GN-6ae: the calls of after of a case, each on the receiver of the case, with the result that the case names.
  const afterChecks = (after: After[] | undefined, receiver: string): string =>
    (after ?? []).map((call) => {
      const expected = stepExpected(model, ctx, call.fn, call.result);
      if ('refused' in expected) return `\n        self::fail(${phpText(expected.refused)});`;
      usesSame = true;
      return `\n        self::assertSame(self::same(${expected.text}), self::same(${invoke(call.fn, callArgs(model, ctx, call.fn, (arg) => caseValue(model, ctx, arg, call.args)), receiver)}));`;
    }).join('');
  for (const fn of callables(model)) {
    const name = fn.kind === 'function' ? langName('php', fn.member.name, 'callable') : `${langName('php', fn.unit.name, 'class')}${fn.kind === 'constructor' ? 'Construct' : langName('php', fn.member.name, 'class')}`;
    const sample = fn.receiver === undefined ? undefined : sampleReceiver(model, fn);
    const recv = sample === undefined ? '' : made(sample);
    const qualified = (args: string): string => invoke(fn, args, recv);
    const call = (override: Map<unknown, string>): string =>
      qualified(callArgs(model, ctx, fn, (arg) => override.get(arg) ?? placeholder(model, ctx, arg.type)));
    const reachable = fn.receiver === undefined || sample !== undefined;
    // GN-6z: a value of a function type that is not a Closure is refused as it enters.
    const functionArg = fn.args.find((a) => typeof a.type === 'object' && 'function' in a.type && !machineFunction(a.type));
    if (functionArg !== undefined && reachable) {
      methods.push(`
    public function testGn6z${name}Refuses${langName('php', functionArg.name, 'class')}ThatIsNotAClosure(): void
    {
        try {
            ${call(new Map([[functionArg, '0']]))};
            self::fail('no error');
        } catch (${cls('type')} $error) {
            self::assertSame('invalid_argument_type', $error->kind());
        }
    }`);
    }
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
      const unsafeKey = unsafeKeyMap(model, ctx, arg.type);
      if (unsafeKey !== undefined) {
        methods.push(`
    public function testB2${name}${argName}RefusesAKeyOutsideTheSafeIntegers(): void
    {
        try {
            ${call(new Map([[arg, unsafeKey]]))};
            self::fail('no error');
        } catch (${cls('value')} $error) {
            self::assertSame('invalid_number', $error->kind());
        }
    }`);
      }
      // GN-6y: a path with a NUL byte is kind invalid_path, and a value that is no string kind invalid_argument_type.
      if (isPath(arg.type)) {
        methods.push(`
    public function testT1${name}${argName}RefusesANulByte(): void
    {
        try {
            ${call(new Map([[arg, '"a\\x00b"']]))};
            self::fail('no error');
        } catch (${cls('value')} $error) {
            self::assertSame('invalid_path', $error->kind());
        }
    }

    public function testT1${name}${argName}RefusesWhatIsNoString(): void
    {
        try {
            ${call(new Map([[arg, '1']]))};
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
    // GN-6ae: a parameter of a function type takes a callable, and any other value is kind invalid_callback.
    for (const arg of reachable ? fn.args.filter((a) => machineFunction(a.type)) : []) {
      methods.push(`
    public function testGn6ae${name}${langName('php', arg.name, 'class')}RefusesWhatIsNoCallable(): void
    {
        try {
            ${call(new Map([[arg, '1']]))};
            self::fail('no error');
        } catch (${cls('type')} $error) {
            self::assertSame('invalid_callback', $error->kind());
        }
    }`);
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
      // GN-6z: a function value of a case is the call of a fixture whose one member is the call, as a Closure.
      const fixtures = [
        ...fixturesOf(model, fn, id, args).map((fixture, i) => ({ fixture, name: `$fixture${i}`, values: fixtureValues(model, ctx, fixture) as { members: string[]; rows: string[][]; calls: string[][] | undefined }, use: `$fixture${i}` })),
        ...functionFixturesOf(model, ctx, fn, id, args, 'call').map((f, i) => ({ fixture: { arg: f.arg }, name: `$function${i}`, values: { members: f.members, rows: f.rows, calls: undefined as string[][] | undefined }, use: `$function${i}->call(...)` })),
      ];
      usesFixture ||= fixtures.length > 0;
      const before = fixtures
        .map(
          (f) => `
        ${f.name} = ${phpFixture(f.values)};`,
        )
        .join('');
      const after = fixtures
        .map((f) => `\n        self::assertSame([], ${f.name}->unexpected);${f.values.calls === undefined ? '' : `\n        self::assertSame([${f.values.calls.map((call) => `[${call.join(', ')}]`).join(', ')}], ${f.name}->calls);`}`)
        .join('');
      return { fixtures, before, after };
    };
    // GN-13: a case whose value has no PHP form runs the in function of its alias on the value as host values, through
    // the entry point of the feature case-test.
    const caseTestOf = (caseId: string): number => caseTestList.findIndex((t) => t.fn === fn && t.id === caseId);
    for (const kase of raisingCases(model, fn)) {
      const id = casePascal(kase.id);
      const entry = caseTestOf(kase.id);
      if (entry >= 0) {
        const errno = expectedErrno(kase);
        // GN-8a: the value of an errno symbol is read from the extension.
        const errnoValue = errno === null ? 'null' : 'symbol' in errno ? `\\${layout.namespace}\\Internal\\errnoOf(${phpText(errno.symbol)})` : String(errno.value);
        methods.push(`
    /**
     * GN-13: the in function of ${caseTestList[entry]?.alias.unit.id ?? ''} runs on the value of the case as host values,
     * because the value has no PHP form: ${caseTestList[entry]?.reason ?? ''}.
     */
    public function testB4${name}${id}(): void
    {
        try {
            \\${layout.namespace}\\Internal\\caseTest${entry}();
            self::fail('no error');
        } catch (${cls(kase.raises.category)} $error) {
            self::assertSame(${exactClass(kase.raises)}::class, $error::class);
            self::assertInstanceOf(\\${phpBase(kase.raises.category)}::class, $error);
            self::assertSame(${phpText(kase.raises.kind)}, $error->kind());
            self::assertSame(${kase.raises.status === null ? 'null' : String(kase.raises.status)}, $error->status());
            ${errno === null ? 'self::assertNull($error->errno());' : `self::assertSame(${errnoValue}, $error->errno());`}
        }
    }`);
        continue;
      }
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
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.use;
      };
      // G-5: a case that arms faults makes its receiver and arguments first, so no call but the one under test runs
      // between the arming and that call, and requires every armed fault to have fired.
      const receiverMade = receiverOfCase(kase.receiver);
      // GN-13f: the receiver is made before the block that expects the failure, so a receiver that cannot be made fails
      // the test: a receiver that no line made yet is held. GN-6ae: a case with after holds its receiver, which the
      // calls of after observe.
      // A receiver whose factory raises the kind of the case is made inside, since the case may fail there.
      const held = kase.faults === undefined && receiverMade.expr !== '' && (kase.after !== undefined || (receiverMade.lines === '' && kase.receiverFails === undefined));
      if (held) receiverMade.lines += `\n        $receiver = ${receiverMade.expr};`;
      const made_ = held ? '$receiver' : receiverMade.expr;
      const locals = kase.faults === undefined ? [] : [...(made_ === '' ? [] : [['$receiver', made_]]), ...fn.args.flatMap((arg, i) => { const value = caseArg(arg); return value === undefined ? [] : [[`$arg${i}`, value]]; })];
      const arming = kase.faults === undefined ? '' : `${locals.map(([local, value]) => `\n        ${local} = ${value};`).join('')}\n        $armed = \\${layout.namespace}\\Internal\\armFaults(${phpText(fn.member.id)}, ${phpText(kase.faults)});`;
      const call = kase.faults === undefined ? invoke(fn, callArgs(model, ctx, fn, caseArg), made_) : invoke(fn, callArgs(model, ctx, fn, (arg) => (caseArg(arg) === undefined ? undefined : `$arg${fn.args.indexOf(arg)}`)), made_ === '' ? '' : '$receiver');
      const errno = expectedErrno(kase);
      // GN-8a: PHP has no table of the errno symbols of its machine, so the test reads the value of a symbol from the
      // extension, whose entry point is of the feature panic-test that every test build turns on.
      const errnoValue = errno === null ? 'null' : 'symbol' in errno ? `\\${layout.namespace}\\Internal\\errnoOf(${phpText(errno.symbol)})` : String(errno.value);
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
            ${errno === null ? 'self::assertNull($error->errno());' : `self::assertSame(${errnoValue}, $error->errno());`}
        }${kase.faults === undefined ? '' : `\n        self::assertSame([], \\${layout.namespace}\\Internal\\faultLeft($armed));`}${after}${afterChecks(kase.after, '$receiver')}${kept(fn)}
    }`);
    }
    // GN-6ae: a case whose function fixture raises an exception of the language gets the same object.
    for (const kase of callbackCases(model, fn)) {
      const id = casePascal(kase.id);
      const refusal = caseRefusal(model, ctx, fn, kase, receiverOfCase);
      if (refusal !== undefined) {
        methods.push(`
    public function testGn6ae${name}${id}(): void
    {
        self::fail(${phpText(refusal)});
    }`);
        continue;
      }
      const receiverMade = receiverOfCase(kase.receiver);
      const call = invoke(fn, callArgs(model, ctx, fn, (arg) => caseValue(model, ctx, arg, kase.args)), receiverMade.expr === '' ? '' : '$receiver');
      usesRaised = true;
      methods.push(`
    public function testGn6ae${name}${id}(): void
    {${receiverMade.lines}${receiverMade.expr === '' ? '' : `\n        $receiver = ${receiverMade.expr};`}
        self::$raised = new \\LogicException(${phpText(FIXTURE_RAISED)});
        try {
            ${call};
            self::fail('no error');
        } catch (\\LogicException $error) {
            self::assertSame(self::$raised, $error);
        }${afterChecks(kase.after, '$receiver')}${kept(fn)}
    }`);
    }
    // GN-13e: every case that does not raise runs, and its result is compared with the value that the case gives.
    for (const kase of resultCases(model, fn)) {
      const id = casePascal(kase.id);
      if (kase.refused !== undefined) {
        methods.push(`
    public function testGn13e${name}${id}(): void
    {
        self::fail(${phpText(kase.refused)});
    }`);
        continue;
      }
      const entry = caseTestOf(kase.id);
      if (entry >= 0) {
        methods.push(`
    /**
     * GN-13: the in function of ${caseTestList[entry]?.alias.unit.id ?? ''} runs on the value of the case as host values,
     * because the value has no PHP form: ${caseTestList[entry]?.reason ?? ''}.
     */
    public function testGn13e${name}${id}(): void
    {
        \\${layout.namespace}\\Internal\\caseTest${entry}();
        self::addToAssertionCount(1);
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
      // GN-6ae: a case with after holds its receiver, which the calls of after observe.
      if (kase.after !== undefined && receiverMade.expr !== '') {
        receiverMade.lines += `\n        $receiver = ${receiverMade.expr};`;
        receiverMade.expr = '$receiver';
      }
      const call = invoke(fn, callArgs(model, ctx, fn, (arg) => {
        const found = fixtures.find((f) => f.fixture.arg === arg);
        return found === undefined ? caseValue(model, ctx, arg, kase.args) : found.use;
      }), receiverMade.expr);
      const expected = kase.expected === undefined ? undefined : expectedText(model, ctx, fn, kase.expected.value);
      usesSame ||= expected !== undefined && 'text' in expected;
      usesTokens ||= expected !== undefined && 'tokens' in expected;
      const check = expected === undefined
        ? `\n        ${call};\n        self::addToAssertionCount(1);`
        : 'refused' in expected
          ? `\n        self::fail(${phpText(expected.refused)});`
          : 'tokens' in expected
            ? expected.round === undefined
              ? `\n        self::assertSame(json_decode(${phpText(expected.tokens)}, true, 512, JSON_THROW_ON_ERROR), self::tokens(${call}));`
              : `\n        $result = ${call};\n        $expected = json_decode(${phpText(expected.tokens)}, true, 512, JSON_THROW_ON_ERROR);\n        self::assertSame($expected, self::tokens($result));\n        self::assertSame($expected, self::tokens(\\${layout.namespace}\\Internal\\aliasRound${langName('php', expected.round, 'class')}($result)));`
            : `\n        self::assertSame(self::same(${expected.text}), self::same(${call}));`;
      methods.push(`
    public function testGn13e${name}${id}(): void
    {${receiverMade.lines}${before}${check}${after}${afterChecks(kase.after, '$receiver')}${kept(fn)}
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
    public function testN4${name}${casePascal(kase.id)}(): void
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
  // GN-6u: an object goes through the native row and back as the same object, and the binding releases its Native at
  // the next entry point.
  const roundTrip = nativeRoundTrip(model.contract, 'php');
  const roundFn = roundTrip === undefined ? undefined : model.functions.find((f) => f.member.id === roundTrip.id);
  if (roundFn !== undefined) {
    const same = (value: string): string => invoke(roundFn, value, '');
    methods.push(`
    public function testGn6u${langName('php', roundFn.member.name, 'class')}GivesBackTheSameObjectAndReleasesIt(): void
    {
        ${same('new class {}')};
        $before = \\${layout.namespace}\\Internal\\nativeCount();
        $subject = new class {};
        self::assertSame($subject, ${same('$subject')});
        ${same('new class {}')};
        self::assertSame($before, \\${layout.namespace}\\Internal\\nativeCount());
    }`);
  }
  // U-3, GN-6z: a function of the language called on a thread other than its owner is kind wrong_thread, through the
  // entry point of the feature thread-test.
  if (takesFunction(model)) {
    methods.push(`
    public function testU3AFunctionCalledOnAnotherThreadIsKindWrongThread(): void
    {
        self::assertSame('wrong_thread', \\${layout.namespace}\\Internal\\threadTest(static fn () => null));
    }`);
  }
  // GN-6o: a method with the receiver self leaves its object consumed, whatever the call gives.
  for (const fn of callables(model).filter((f) => f.receiver === 'self')) {
    const sample = sampleReceiver(model, fn);
    if (sample === undefined) continue;
    const args = callArgs(model, ctx, fn, (arg) => placeholder(model, ctx, arg.type));
    methods.push(`
    public function testGn6o${langName('php', fn.unit.name, 'class')}${langName('php', fn.member.name, 'class')}ConsumesItsObject(): void
    {
        $held = ${made(sample)};
        try {
            ${invoke(fn, args, '$held')};
        } catch (\\Throwable) {
            // GN-6o: the value is taken also when the core fails.
        }${refused('type', 'consumed', invoke(fn, args, '$held'))}
    }`);
  }
  // GN-6p, B-10: an object freed without its cleanup call raises E_WARNING, and after it none.
  for (const object of model.objects) {
    const cleanup = object.cleanup;
    const sample = cleanup === undefined ? undefined : sampleReceiver(model, cleanup);
    if (cleanup === undefined || sample === undefined) continue;
    const label = `${langName('php', object.unit.name, 'class')}`;
    const warned = (call: string, expected: string): string => `
        $held = ${made(sample)};
        $warnings = [];
        set_error_handler(function (int $level, string $message) use (&$warnings): bool {
            $warnings[] = [$level, $message];
            return true;
        });
        try {${call}
            unset($held);
        } finally {
            restore_error_handler();
        }
        ${expected}`;
    // GN-6p: PHP puts the name of the running function before the message of a warning, which ends with the B-10 text.
    methods.push(`
    public function testB10${label}WarnsWithout${langName('php', cleanup.member.name, 'class')}(): void
    {${warned('', `self::assertCount(1, $warnings);
        self::assertSame(E_WARNING, $warnings[0][0]);
        self::assertStringEndsWith(${phpText(cleanupWarning(label, memberName('php', cleanup)))}, $warnings[0][1]);`)}
    }

    public function testB10${label}DoesNotWarnAfter${langName('php', cleanup.member.name, 'class')}(): void
    {${warned(`
            try {
                ${invoke(cleanup, callArgs(model, ctx, cleanup, (arg) => placeholder(model, ctx, arg.type)), '$held')};
            } catch (\\Throwable) {
                // B-10: the cleanup call consumed the value whatever it gave.
            }`, 'self::assertSame([], $warnings);')}
    }`);
  }
  // U-7: the cases of an alias run its in function alone, through the entry point of the feature codec-test.
  for (const kase of aliasCases(model)) {
    const alias = langName('php', kase.alias.unit.name, 'class');
    // GN-13: a value of the case that has no PHP form runs through the entry point of the feature case-test.
    const entry = caseTestList.findIndex((t) => t.fn === undefined && t.alias === kase.alias && t.id === kase.id);
    const call = entry >= 0
      ? `\\${layout.namespace}\\Internal\\caseTest${entry}()`
      : `\\${layout.namespace}\\Internal\\aliasIn${alias}(${fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)})`;
    methods.push(`${entry >= 0 ? `
    /**
     * GN-13: the in function of ${kase.alias.unit.id} runs on the value of the case as host values, because the value
     * has no PHP form: ${caseTestList[entry]?.reason ?? ''}.
     */` : ''}
    public function testU7${alias}In${casePascal(kase.id)}(): void
    {
        try {
            ${call};
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
{${methods.some((m) => m.includes('$this->casePath(')) ? PHP_CASE_PATH : ''}${usesRaised ? `
    /** GN-6ae: the exception that a function fixture of the test in progress raises. */
    private static ?\\Throwable $raised = null;
` : ''}
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
${methods.join('\n')}${usesTokens ? PHP_TOKENS : ''}${usesSame ? `

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
