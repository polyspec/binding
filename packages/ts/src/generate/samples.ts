// Argument values of the generated tests (G-5): a placeholder value of each contract type, which the binding converts
// without failing, and the value of a contract case, which the case file gives as JSON (keys are the parameter names in
// snake_case, a record parameter is an object of its fields, an enum is its value text, latin1 is text of U+0000 to
// U+00FF).

import type { Type } from '../contract.ts';
import type { Unit } from '../contract.ts';
import { type Arg, type Fn, type Model, langName, unitOf } from './model.ts';
import { jsString, phpLatin1, phpText, pyString } from './text.ts';

export type Lang3 = 'python' | 'node' | 'php';

export interface Context {
  lang: Lang3;
  // How the generated test names an enum value: python `pkg.Enum("value")`, php `\Ns\Enum::from("value")`.
  enumRef: (enumName: string, value: string) => string;
  // How the generated test makes the result form of a record (T-4) from its fields in contract order.
  recordNew: (unit: Unit, fields: string[]) => string;
}

export function placeholder(model: Model, ctx: Context, type: Type): string {
  if (typeof type === 'string') {
    const table: Record<Lang3, Record<string, string>> = {
      python: { text: '"a"', latin1: '"a"', bool: 'False', uint: '0', int: '0', int64: '0', float: '0.0', bytes: 'b""' },
      node: { text: "'a'", latin1: "'a'", bool: 'false', uint: '0', int: '0', int64: '0', float: '0', bytes: 'new Uint8Array()' },
      php: { text: '"a"', latin1: '"a"', bool: 'false', uint: '0', int: '0', int64: '0', float: '0.0', bytes: '""' },
    };
    return table[ctx.lang][type] ?? 'null';
  }
  if ('list' in type) return '[]';
  if ('optional' in type) return ctx.lang === 'python' ? 'None' : 'null';
  const unit = unitOf(model, type);
  const first = unit?.variants?.[0];
  if (unit?.kind === 'enum' && first !== undefined) return ctx.enumRef(langName('python', unit.name, 'class'), first.value);
  if (unit?.kind === 'record') return ctx.recordNew(unit, (unit.fields ?? []).map((f) => placeholder(model, ctx, f.type)));
  throw new Error(`no placeholder for ${JSON.stringify(type)}`);
}

export function fromJson(model: Model, ctx: Context, type: Type, value: unknown): string {
  const none = ctx.lang === 'python' ? 'None' : 'null';
  if (value === null) return none;
  if (typeof type === 'string') {
    if (type === 'text' || type === 'latin1') {
      const text = String(value);
      if (ctx.lang === 'python') return pyString(text);
      if (ctx.lang === 'node') return jsString(text);
      return type === 'latin1' ? phpLatin1(text) : phpText(text);
    }
    if (type === 'bool') return ctx.lang === 'python' ? (value === true ? 'True' : 'False') : String(value === true);
    if (type === 'uint' || type === 'int' || type === 'int64' || type === 'float') return String(value);
    throw new Error(`no case value of the type ${type}`);
  }
  if ('optional' in type) return fromJson(model, ctx, type.optional, value);
  if ('list' in type) {
    const items = (value as unknown[]).map((item) => fromJson(model, ctx, type.list, item));
    return `[${items.join(', ')}]`;
  }
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return ctx.enumRef(langName('python', unit.name, 'class'), String(value));
  if (unit?.kind === 'record') {
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`a case value of the record ${unit.id} is not an object of its fields`);
    const fields = value as Record<string, unknown>;
    return ctx.recordNew(
      unit,
      (unit.fields ?? []).map((f) => {
        const key = langName('python', f.name, 'variable');
        if (!(key in fields)) throw new Error(`a case value of the record ${unit.id} has no field ${key}`);
        return fromJson(model, ctx, f.type, fields[key]);
      }),
    );
  }
  throw new Error(`no case value of the type ${JSON.stringify(type)}`);
}

// The arguments of a call in the form of each language: positional parameters, then the record's fields as Python
// keywords, PHP named arguments or one Node options object (T-4).
export function callArgs(model: Model, ctx: Context, fn: Fn, value: (arg: Arg) => string, extra?: string): string {
  const positional = fn.args.filter((a) => !a.field).map(value);
  if (extra !== undefined) positional.push(extra);
  const fields = fn.args.filter((a) => a.field);
  if (fields.length === 0) return positional.join(', ');
  if (ctx.lang === 'node') {
    const object = fields.map((a) => `${langName('node', a.name, 'variable')}: ${value(a)}`).join(', ');
    return [...positional, `{ ${object} }`].join(', ');
  }
  const named = fields.map((a) => `${langName(ctx.lang, a.name, 'variable')}${ctx.lang === 'python' ? '=' : ': '}${value(a)}`);
  return [...positional, ...named].join(', ');
}

// The cases of the contract that make a member raise, with the arguments the case gives (K-1).
export interface RaisingCase {
  id: string;
  args: Map<Arg, unknown>;
  raises: { kind: string; status: number | null; category: string };
}

export function raisingCases(model: Model, fn: Fn): RaisingCase[] {
  const out: RaisingCase[] = [];
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    const raises = record['raises'] as RaisingCase['raises'] | undefined;
    if (raises === undefined) continue;
    const args = new Map<Arg, unknown>();
    for (const arg of fn.args) {
      const snake = langName('python', arg.name, 'variable');
      const holderKey = arg.field && fn.record !== undefined ? langName('python', fn.record.param.name, 'variable') : undefined;
      const holder = holderKey === undefined ? record : record[holderKey];
      if (typeof holder !== 'object' || holder === null || !(snake in holder)) {
        throw new Error(`the case ${String(record['id'])} of ${fn.member.id} has no ${holderKey === undefined ? '' : `${holderKey}.`}${snake} (G-5: case keys are the parameter names in snake_case)`);
      }
      args.set(arg, (holder as Record<string, unknown>)[snake]);
    }
    out.push({ id: String(record['id']), args, raises });
  }
  return out;
}

export const isNumber = (type: Type): string | undefined => {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  return typeof base === 'string' && ['uint', 'int', 'int64', 'float'].includes(base) ? base : undefined;
};

export const textKind = (type: Type): 'text' | 'latin1' | undefined => {
  let base = type;
  while (typeof base === 'object' && ('optional' in base || 'list' in base)) base = 'optional' in base ? base.optional : base.list;
  return base === 'text' || base === 'latin1' ? base : undefined;
};

// A value of the type whose innermost text is `text`, for the B-3 tests.
export function wrapText(type: Type, text: string): string {
  if (typeof type === 'object' && 'list' in type) return `[${wrapText(type.list, text)}]`;
  if (typeof type === 'object' && 'optional' in type) return wrapText(type.optional, text);
  return text;
}
