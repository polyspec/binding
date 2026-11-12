// The generated PHPUnit test of the PHP binding (G-5): B-2, B-3, B-4, B-7 and G-7 for every function, run with the
// extension loaded.

import type { Unit } from '../contract.ts';
import { type Model, langName } from './model.ts';
import { type PhpLayout, phpNamespace } from './php.ts';
import { type Context, type Receiver, callArgs, callables, fromJson, isNumber, placeholder, raisingCases, sampleReceiver, textKind, wrapText } from './samples.ts';
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
  const ctx: Context = { lang: 'php', enumRef, recordNew };
  const cls = (category: string): string => `\\${layout.namespace}\\${model.classes.find((c) => c.category === category)?.name ?? ''}`;
  const methods: string[] = [];
  const invoke = (fn: Fn, args: string, receiver: string): string => {
    const member = langName('php', fn.member.name, 'callable');
    const ns = phpNamespace(layout, fn.module);
    const cls = `\\${ns}\\${langName('php', fn.unit.name, 'class')}`;
    if (fn.kind === 'function') return `\\${ns}\\${member}(${args})`;
    if (fn.kind === 'constructor') return `new ${cls}(${args})`;
    if (fn.kind === 'static') return `${cls}::${member}(${args})`;
    // U-2: a property is a method in PHP.
    return `${receiver}->${member}(${args})`;
  };
  const made = (receiver: Receiver): string =>
    invoke(receiver.factory, callArgs(model, ctx, receiver.factory, (arg) => fromJson(model, ctx, arg.type, receiver.args.get(arg) ?? null)), '');
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
        const bad = (BAD_NUMBERS[number] ?? []).filter((b) => !(b === 'null' && typeof arg.type === 'object' && 'optional' in arg.type));
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
    for (const kase of raisingCases(model, fn)) {
      const id = kase.id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      methods.push(`
    public function testB4${name}${id}(): void
    {
        try {
            ${invoke(fn, callArgs(model, ctx, fn, (arg) => fromJson(model, ctx, arg.type, kase.args.get(arg) ?? null)), kase.receiver === undefined ? '' : made(kase.receiver))};
            self::fail('no error');
        } catch (${cls(kase.raises.category)} $error) {
            self::assertSame(${cls(kase.raises.category)}::class, $error::class);
            self::assertInstanceOf(\\${phpBase(kase.raises.category)}::class, $error);
            self::assertSame(${phpText(kase.raises.kind)}, $error->kind());
            self::assertSame(${kase.raises.status === null ? 'null' : String(kase.raises.status)}, $error->status());
            self::assertNull($error->errno());
        }
    }`);
    }
    const values = (arg: { type: unknown }): string => placeholder(model, ctx, arg.type as never);
    if (fn.kind === 'property' || !reachable) continue;
    methods.push(`
    public function testG7${name}CountsAndNamesItsArguments(): void
    {${fn.args.length === 0 ? '' : `
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
${methods.join('\n')}
}
`;
}
