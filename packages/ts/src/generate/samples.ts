// Argument values of the generated tests (G-5): a placeholder value of each contract type, which the binding converts
// without failing, and the value of a contract case, which the case file gives as JSON (keys are the parameter names in
// snake_case, a record parameter is an object of its fields, an enum is its value text, latin1 is text of U+0000 to
// U+00FF).

import type { Lang, Name, Type } from '../contract.ts';
import type { Category, Contract, Member, Service, Unit } from '../contract.ts';
import { jsArguments, jsDeclaredMember } from './callback_arguments.ts';
import { classMakes } from './value_class.ts';
import { computedRule, defaultCaseValue } from './defaults.ts';
import { BINDING_KINDS, type Arg, buildModel, caseName, type Fn, type KeptClass, type Model, type ObjectClass, type ValueAlias, type Variant, type VariantCase, Unsupported, aliasOf, interfaceOf, resolveNamedType, implementorsOf, caseFields, kindText, langName, libraryOf, objectUnit, unitOf, variantOf, caseLeftOut, machineFunction, makerOf } from './model.ts';
import { CATEGORIES, kindsOf } from '../contract.ts';
import { jsString, phpLatin1, phpText, pyString } from './text.ts';

export type Lang3 = 'python' | 'node' | 'php';

// A case value in a message: an integer outside the safe integers is a bigint (cli.ts reads the case files so), which
// JSON.stringify does not write.
export const shown = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? String(item) : item));

export interface Context {
  lang: Lang3;
  // How the generated test names an enum value: python `pkg.Enum("value")`, php `\Ns\Enum::from("value")`.
  enumRef: (enumName: string, value: string) => string;
  // How the generated test makes the result form of a record (T-4) from its fields in contract order.
  recordNew: (unit: Unit, fields: string[]) => string;
  // How the generated test makes a value of a case of a variant (T-9) from its fields in contract order: the result
  // form of the case as a record, when the language gives none of its own.
  variantNew?: (variant: Variant, kase: VariantCase, fields: string[]) => string;
  // GN-13: how the generated test makes an instance of an error unit with a kind and a message, as language code does.
  // GN-6s: an error unit of the owner of a callback unit of another repository names that library.
  errorNew?: (unit: Unit, kind: string, message: string, library?: string) => string;
  // How the generated test makes an object that implements a callback (U-3): every member returns null, or the
  // members are missing, or every member raises the exception `raise` names, or returns a value of no contract type.
  callbackNew: (unit: Unit, how: CallbackHow) => string;
  // How the generated test calls a factory of a class (a static member or the constructor) with its arguments (T-5).
  objectNew?: (factory: Fn, args: string) => string;
  // The target whose rows of make a value takes, when it is not lang: WASM writes its tests as Node does.
  target?: 'wasm';
  // GN-13f: the expression that makes the instance of an instance value of a case at any place of a class.
  instanceNew?: (receiver: Receiver) => string;
  // GN-6z: the expression of a function value of a case from its rows, where the test reads no record of its calls.
  // GN-6bu: with the count of the arguments of the function, which a JavaScript fixture declares.
  functionNew?: (rows: string[][], parameters: number) => string;
  // GN-6z: the member of the fixture that functionNew makes, which its rows name; `__call__` when the language names none.
  functionMember?: string;
  // GN-6aa: the expression of the object of a callback fixture inside another value, whose calls the test does not read.
  fixtureNew?: (values: { members: string[]; rows: string[][] }) => string;
  // GN-6x: how the generated test names a class of another repository, through the owner's package, which the test
  // imports: the value class and the classes that its out rows fill.
  foreignClass?: (library: string, unit: Unit) => string;
  // GN-13e: the steps that make a deep case value in local variables (Python), at the depth of the values in making.
  steps?: Steps | undefined;
  // GN-6ae: how the generated test writes the function of a function fixture.
  machineFunctionNew?: (fixture: FunctionFixture) => string;
  // GN-13n: the expression of the argument that a function fixture around the value keeps under the name.
  boundValue?: (name: string) => string;
  // GN-13p: the statement that keeps a value under a name, which boundValue then gives.
  boundSet?: (name: string, expr: string) => string;
  // GN-6y: the expression of a relative path of a case inside the directory of the test.
  casePath?: (relative: string) => string;
  // GN-13l: a text path uses the root captured by this case, including in private deferred helpers.
  caseTextPath?: (relative: string, jsonString: boolean) => string;
  // GN-13l: optional generator-only dependency scope. A writer tracks actual text-path use, not marker text.
  caseTextExpression?: (make: () => string) => string;
  // GN-13l: alias projections keep their closed value forms even when a constructor takes typed text.
  caseTextAlias?: boolean;
  // GN-6aq: the expression of a cancellation of the language that fired before the call, or one that never fires.
  cancelNew?: (fired: boolean) => string;
  // GN-13j: the expression of the address of the service of a case, which the test reads from its variable.
  serviceAddress?: (service: CaseService) => string;
  // GN-13r: the expression of the port of the listener of a case, as a text.
  listenerPort?: string;
}

// G-5, GN-6aq: the state of a case value of the type cancel, {"cancel": "fired"} or {"cancel": "open"}.
export function cancelState(value: unknown): boolean {
  const state = typeof value === 'object' && value !== null ? (value as { cancel?: unknown }).cancel : undefined;
  if (state !== 'fired' && state !== 'open') throw new Unsupported(`a case value of the type cancel is {"cancel": "fired" | "open"}, not ${shown(value)} (G-5)`);
  return state === 'fired';
}

// GN-6ae: a function fixture as its language writes it: each step calls the method `fn` on the argument at the position
// `on` with the arguments `args`, already in the language, and requires the value `expected` of the call when the step
// names a result (CK-22); the function then returns `result`, raises the instance of an error unit `raise`, or raises
// the exception of the language that the test of the case holds.
export interface FunctionFixture {
  parameters: number;
  // CK-22: the function returns an awaitable, in a language that has one.
  awaits: boolean;
  // GN-13n: the names of the parameters by position, which the function keeps in the store of the test.
  names: string[];
  // GN-13n: on is a position of a parameter, or a name that this fixture or one around it gives.
  steps: { on: number | string; fn: Fn; args: string; expected?: { text: string } | { refused: string }; raises?: string }[];
  end: { result: string } | { raise: string } | { exception: true };
}

// GN-6ae: the message of the exception and of the error that a function fixture raises.
export const FIXTURE_RAISED = 'raised by the function of the case';

// GN-13e: bind gives a value that reaches the bound of nesting a local variable and returns its name; done ends the
// whole value, in a function of the module when a step was bound; drop forgets the steps of a value that failed.
export interface Steps {
  depth: number;
  bind: (expr: string) => string;
  done: (expr: string) => string;
  drop: () => void;
}

export type CallbackHow = { returns: 'null' } | { missing: true } | { raise: string } | { returns: 'wrong' };

// rich: a list has one item rather than none, so that a member that calls a callback per item calls it (K-2).
export function placeholder(model: Model, ctx: Context, type: Type, rich = false): string {
  if (typeof type === 'string') {
    const table: Record<Lang3, Record<string, string>> = {
      python: { text: '"a"', latin1: '"a"', bool: 'False', uint: '0', int: '0', int64: '0', float: '0.0', bytes: 'b""', source: '"a"', path: '"a"' },
      node: { text: "'a'", latin1: "'a'", bool: 'false', uint: '0', int: '0', int64: '0', float: '0', bytes: 'new Uint8Array()', source: "'a'", path: "'a'" },
      php: { text: '"a"', latin1: '"a"', bool: 'false', uint: '0', int: '0', int64: '0', float: '0.0', bytes: '""', source: '"a"', path: '"a"' },
    };
    // GN-6aq: a cancellation that never fires.
    if (type === 'cancel' && ctx.cancelNew !== undefined) return ctx.cancelNew(false);
    return table[ctx.lang][type] ?? 'null';
  }
  if ('list' in type) return rich ? `[${placeholder(model, ctx, type.list, rich)}]` : '[]';
  // GN-6ae: a function that makes no step and returns no value.
  if (machineFunction(type) && ctx.machineFunctionNew !== undefined) return ctx.machineFunctionNew({ names: [], parameters: type.function.parameters.length, awaits: false, steps: [], end: { result: ctx.lang === 'python' ? 'None' : 'null' } });
  if ('keyed_map' in type || 'map' in type) return { python: '{}', node: 'new Map()', php: '[]' }[ctx.lang];
  if ('optional' in type) return ctx.lang === 'python' ? 'None' : 'null';
  // GN-6z: a function that returns the placeholder of its return type, whatever its arguments.
  if ('function' in type) {
    const returns = type.function.returns;
    const value = returns === 'none' ? { python: 'None', node: 'undefined', php: 'null' }[ctx.lang] : placeholder(model, ctx, returns, rich);
    // GN-6bu: the JavaScript function declares the arguments that the binding calls it with.
    return { python: `lambda *_arguments: ${value}`, node: `((${jsArguments(type.function.parameters.length)}) => ${value})`, php: `fn (...$arguments) => ${value}` }[ctx.lang];
  }
  // GN-6t: a value of a tuple is the sequence of the placeholders of its parts, a tuple in Python.
  if ('tuple' in type) {
    const parts = type.tuple.map((part) => placeholder(model, ctx, part, rich));
    return ctx.lang === 'python' ? `(${parts.map((part) => `${part},`).join(' ')})` : `[${parts.join(', ')}]`;
  }
  const unit = unitOf(model, type);
  const first = unit?.variants?.[0];
  if (unit?.kind === 'enum' && first !== undefined) return ctx.enumRef(langName('python', unit.name, 'class'), first.value);
  if (unit?.kind === 'record') return ctx.recordNew(unit, (unit.fields ?? []).map((f) => placeholder(model, ctx, f.type)));
  // GN-6v: a value of a variant is its first case that holds no Box of a value of its own type, whose fields are placeholders.
  const variant = variantOf(model, type);
  const plain = variant?.cases.find((kase) => caseFields(model, variant, kase).every((f) => f.boxed !== 'box'));
  if (variant !== undefined && plain !== undefined) return caseNew(ctx, variant, plain, (plain.unit.fields ?? []).map((f) => placeholder(model, ctx, f.type)));
  // GN-6ap: a value of a generated interface is an instance of the first class that implements it and has a factory.
  const iface = interfaceOf(model, type);
  if (iface !== undefined) {
    const made = implementorsOf(model, iface).find((o) => o.members.some((m) => m.kind === 'constructor' || (m.kind === 'static' && unitOf(model, m.returns) === o.unit)));
    if (made === undefined) throw new Unsupported(`no placeholder for ${shown(type)}: no class that implements ${iface.id} has a factory (G-5, GN-6ap)`);
    return placeholder(model, ctx, { unit: made.unit.id }, rich);
  }
  if (unit?.origin === 'callback') return ctx.callbackNew(unit, { returns: 'null' });
  // U-7: a value of a value alias is the value that its first out row of a built-in form makes for this language.
  if (unit?.kind === 'alias') {
    const forms: Record<Lang3, Record<string, string>> = {
      python: { null: 'None', bool: 'False', int: '0', bigint: '0', float: '0.0', text: '"a"', bytes: 'b""', list: '[]', map: '{}' },
      node: { null: 'null', bool: 'false', int: '0', bigint: '0n', float: '0', text: "'a'", bytes: 'new Uint8Array()', list: '[]', map: 'new Map()' },
      php: { null: 'null', bool: 'false', int: '0', float: '0.0', text: '"a"', bytes: '""', list: '[]', map: '[]' },
    };
    for (const row of unit.out ?? []) {
      const make = row.make[ctx.lang];
      const value = typeof make === 'string' ? forms[ctx.lang][make] : undefined;
      if (value !== undefined) return value;
    }
  }
  // GN-6x: a value of a value class of another repository is the value that its out row of the kind null makes.
  if (unit?.kind === 'class' && unit.origin === 'value' && typeof type === 'object' && 'unit' in type && type.library !== undefined && ctx.foreignClass !== undefined) {
    const alias = model.aliases.find((a) => a.unit === unit && a.library === type.library);
    const empty = alias === undefined ? undefined : classMakes(alias, ctx.target ?? ctx.lang).find((m) => m.form === 'content' && m.params === 0);
    if (empty !== undefined) return ownerCall(ctx, ctx.foreignClass(type.library, unit), empty.member, '');
  }
  // T-5, GN-13f: an instance of a class, made by its first factory whose arguments are placeholders, or by the first
  // function or static member of another class that returns it.
  const object = model.objects.find((o) => o.unit === unit);
  const factory = object === undefined ? undefined : makerOf(model, object);
  if (factory !== undefined && ctx.objectNew !== undefined) {
    return ctx.objectNew(factory, callArgs(model, ctx, factory, (arg) => placeholder(model, ctx, arg.type, rich)));
  }
  throw new Unsupported(`no placeholder for ${shown(type)} is written yet (G-5)`);
}

// GN-6y: a case value of a path is a relative path inside the directory of the test; an empty or absolute path and a
// part .. or a drive-qualified component could leave it.
export function casePathOf(value: unknown): string {
  const parts = typeof value === 'string' ? value.split('/') : [];
  if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\') || parts.includes('..') || parts.includes('') || parts.some((part) => /^[A-Za-z]:/.test(part))) {
    throw new Unsupported(`a case value of the type path is a relative path inside the directory of the test, without .. or drive-qualified components (GN-6y), not ${shown(value)}`);
  }
  return value;
}

const wellFormedCaseText = (text: string): boolean => !/[\uD800-\uDFFF]/u.test(text);

export type CaseTextPart = string | { relative: string; jsonString: boolean } | { listener: ListenerPort };

// GN-13r: the server of a case that accepts each connection and closes it at once. The value of @listener names what the
// server does; accept_and_close is the one that a case names today.
export const CASE_LISTENER = '@listener';
const LISTENER_KINDS: readonly string[] = ['accept_and_close'];
export function caseListenerOf(raw: unknown): 'accept_and_close' | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !LISTENER_KINDS.includes(raw)) throw new Unsupported(`${CASE_LISTENER} of a case is "accept_and_close" (GN-13r), not ${shown(raw)}`);
  return 'accept_and_close';
}

// GN-13r: a part {"listener": "port"} of a composed case text, with the @listener of its case, which withServices reads.
export class ListenerPort {
  readonly given: unknown;
  readonly declared: unknown;

  constructor(given: unknown, declared: unknown) {
    this.given = given;
    this.declared = declared;
  }

  toJSON(): unknown {
    return this.given;
  }

  // The part in a target, or the reason that fails the test of its case.
  check(): void {
    const record = this.given as Record<string, unknown>;
    if (Object.keys(record).length !== 1 || record['listener'] !== 'port') throw new Unsupported(`a listener part of a composed case text is {"listener": "port"} (GN-13r), not ${shown(this.given)}`);
    if (this.declared === undefined) throw new Unsupported(`a part {"listener": "port"} stands in a case without ${CASE_LISTENER} (GN-13r)`);
    caseListenerOf(this.declared);
  }
}

// GN-13l: recognize this form only at a typed text place. Records and maps do not reserve its keys.
export function caseTextParts(value: unknown): CaseTextPart[] | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !Object.hasOwn(value, 'text')) return undefined;
  const refused = (): never => { throw new Unsupported(`a composed case text is {"text": [<Unicode literal> | {"case_path": <relative>, "as"?: "json-string"}, ...]} with no other keys (GN-13l), not ${shown(value)}`); };
  const parts = (value as { text?: unknown }).text;
  if (Object.keys(value).length !== 1 || !Array.isArray(parts) || parts.length === 0) return refused();
  return parts.map((part): CaseTextPart => {
    if (typeof part === 'string') return wellFormedCaseText(part) ? part : refused();
    // GN-13r: the port of the listener of the case.
    if (part instanceof ListenerPort) return { listener: part };
    if (typeof part !== 'object' || part === null || Array.isArray(part)) return refused();
    const record = part as Record<string, unknown>;
    if (!Object.hasOwn(record, 'case_path') || Object.keys(record).some((key) => key !== 'case_path' && key !== 'as')) return refused();
    const relative = record['case_path'];
    if (typeof relative !== 'string' || !wellFormedCaseText(relative) || relative.includes('\0')) return refused();
    if (Object.hasOwn(record, 'as') && record['as'] !== 'json-string') return refused();
    return { relative: casePathOf(relative), jsonString: record['as'] === 'json-string' };
  });
}

// GN-13l: independent fixed UTF-8 byte oracles, not output of a target's quoting helper.
export const CASE_JSON_STRING_GOLDENS: readonly { inputHex: string; expectedHex: string }[] = [
  { inputHex: '225C2F3C3E26', expectedHex: '225C225C5C2F3C3E2622' },
  { inputHex: 'ED959CEAB880E280A8E280A9', expectedHex: '22ED959CEAB880E280A8E280A922' },
  { inputHex: '5C75323032385C7532303239', expectedHex: '225C5C75323032385C5C753230323922' },
  { inputHex: '5C7532303238E280A85C7532303239E280A9', expectedHex: '225c5c7532303238e280a85c5c7532303239e280a922' },
  { inputHex: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', expectedHex: '225c75303030305c75303030315c75303030325c75303030335c75303030345c75303030355c75303030365c75303030375c625c745c6e5c75303030625c665c725c75303030655c75303030665c75303031305c75303031315c75303031325c75303031335c75303031345c75303031355c75303031365c75303031375c75303031385c75303031395c75303031615c75303031625c75303031635c75303031645c75303031655c753030316622' },
].map(({ inputHex, expectedHex }) => ({ inputHex: inputHex.toLowerCase(), expectedHex: expectedHex.toLowerCase() }));

// GN-13i: the files of a case, which its test writes into the directory of the test before it makes the values of the
// case: an object from a relative path in the form of a case value of a path (GN-6y) to its bytes, a text for its UTF-8
// or {"hex": ...}. Each file is given as its path and the lower-case hex of its bytes, which every target decodes.
// The key of the files of a case begins with @, which no snake_case name has, so no parameter, field or expected value
// of a contract (which may be named files) is read as the files of a case.
export const CASE_FILES = '@files';
export interface CaseFile {
  path: string;
  hex: string;
  // GN-13i: the lower-case hex of the bytes of a path that names a file by bytes that are no Unicode.
  name?: string;
}

// GN-13i: the reason of the test of a case that names a file by bytes, which only a file system of Linux stores.
export const BYTE_NAME_LINUX = 'a case verified only on Linux: it names a file by bytes that are no Unicode, which only a file system of Linux stores (GN-13i)';

// GN-13i: the bytes of a path with the escape \xHH of a byte from 80 to ff, as lower-case hex, or undefined for a path
// without a backslash. A path whose bytes are UTF-8 is written as its text, so each name has one spelling.
function byteNameOf(path: string): string | undefined {
  if (!path.includes('\\')) return undefined;
  const pieces = path.split(/\\x([0-9a-f]{2})/);
  const bytes: Buffer[] = [];
  for (const [i, piece] of pieces.entries()) {
    if (i % 2 === 0) {
      if (piece.includes('\\')) return '';
      bytes.push(Buffer.from(piece, 'utf8'));
    } else {
      if (Number.parseInt(piece, 16) < 0x80) return '';
      bytes.push(Buffer.from(piece, 'hex'));
    }
  }
  const name = Buffer.concat(bytes);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(name);
    return '';
  } catch {
    return name.toString('hex');
  }
}
export function caseFilesOf(raw: unknown): CaseFile[] {
  if (raw === undefined) return [];
  const refused = (): never => {
    throw new Unsupported(`${CASE_FILES} of a case is an object from a relative path inside the directory of the test, without .., with \\xHH for a byte from 80 to ff of a name that is no UTF-8, to a text or {"hex": "<lower-case hex>"} (GN-13i), not ${shown(raw)}`);
  };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return refused();
  return Object.entries(raw as Record<string, unknown>).map(([path, content]): CaseFile => {
    const name = byteNameOf(path);
    if (name === '') return refused();
    try {
      casePathOf(name === undefined ? path : path.replaceAll(/\\x[0-9a-f]{2}/g, '_'));
    } catch (error) {
      if (error instanceof Unsupported) return refused();
      throw error;
    }
    const named = name === undefined ? {} : { name };
    if (typeof content === 'string') return { path, hex: Buffer.from(content, 'utf8').toString('hex'), ...named };
    const hex = typeof content === 'object' && content !== null && Object.keys(content).length === 1 ? (content as { hex?: unknown }).hex : undefined;
    if (typeof hex !== 'string' || !/^([0-9a-f]{2})*$/.test(hex)) return refused();
    return { path, hex, ...named };
  });
}

// GN-13j: the service of a case, which the contract declares in services: the environment variable of its address,
// that of the program of its state, the member and the case whose scope it names, and the JSON texts of setup and check.
export class CaseService {
  readonly id: string;
  readonly address: string;
  readonly state: string | undefined;
  readonly member: string;
  readonly caseId: string;
  readonly setup: string | undefined;
  readonly check: string | undefined;
  // GN-13q: the JSON text of the start of the peer session, which runs at the same time as the session of the case.
  readonly peer: string | undefined;

  constructor(declared: Service, member: string, caseId: string, setup: string | undefined, check: string | undefined, peer?: string) {
    this.id = declared.id;
    this.address = declared.address;
    this.state = declared.state;
    this.member = member;
    this.caseId = caseId;
    this.setup = setup;
    this.check = check;
    this.peer = peer;
  }

  // The scope of the case in a target: the space of the service that the case alone uses.
  scope(target: string): string {
    return `${target}:${this.member}:${this.caseId}:`;
  }
}

// GN-13j: a service of a case that the generator cannot run, with the reason that fails the test of the case.
export class ServiceRefused {
  readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }
}

// GN-13j: a case value {"service": "address" | "scope"}, with the service of its case.
export class ServiceValue {
  readonly which: 'address' | 'scope';
  readonly service: CaseService | ServiceRefused | undefined;

  constructor(which: 'address' | 'scope', service: CaseService | ServiceRefused | undefined) {
    this.which = which;
    this.service = service;
  }

  toJSON(): unknown {
    return { service: this.which };
  }
}

// GN-13j: the service of a call of then, the JSON text of the state that the call leaves to the program.
export class ServiceChange {
  readonly value: string;
  readonly service: CaseService | ServiceRefused | undefined;

  constructor(value: string, service: CaseService | ServiceRefused | undefined) {
    this.value = value;
    this.service = service;
  }
}

// GN-13j: the service of a case from its key service and the services of the contract; a service that the case cannot
// run is its reason.
function caseServiceOf(services: readonly Service[], member: string, record: Record<string, unknown>): CaseService | ServiceRefused | undefined {
  const raw = record['service'];
  if (raw === undefined) return undefined;
  const object = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
  if (object === undefined || typeof object['id'] !== 'string' || Object.keys(object).some((key) => !['id', 'setup', 'peer', 'check'].includes(key))) {
    return new ServiceRefused(`service of a case is {"id": "<service id>", "setup": <JSON>, "check": <JSON>} (GN-13j), not ${shown(raw)}`);
  }
  const declared = services.find((service) => service.id === object['id']);
  if (declared === undefined) return new ServiceRefused(`the service ${object['id']} is not one of services of the contract (GN-13j)`);
  const text = (value: unknown): string | undefined => (value === undefined ? undefined : shown(value));
  return new CaseService(declared, member, String(record['id']), text(object['setup']), text(object['check']), text(object['peer']));
}

// GN-13j: the case with its service read: the service of the case, each value {"service": ...} at any place of it, and
// the service of each call of then of an instance value. The JSON of setup, check and a change stays as the case gives
// it, because it is the state that the program of the service reads.
const listenerPart = (part: unknown): boolean => typeof part === 'object' && part !== null && !Array.isArray(part) && Object.hasOwn(part, 'listener');

export function withServices(services: readonly Service[], member: string, kase: unknown): unknown {
  if (typeof kase !== 'object' || kase === null || Array.isArray(kase)) return kase;
  const record = kase as Record<string, unknown>;
  const service = caseServiceOf(services, member, record);
  const named = (value: unknown): boolean =>
    typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 && ((value as Record<string, unknown>)['service'] === 'address' || (value as Record<string, unknown>)['service'] === 'scope');
  let found = false;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value !== 'object' || value === null) return value;
    // GN-13r: a part {"listener": ...} of a composed case text keeps the @listener of its case.
    const parts = (value as { text?: unknown }).text;
    if (Object.keys(value).length === 1 && Array.isArray(parts) && parts.some(listenerPart)) {
      found = true;
      return { text: parts.map((part) => (listenerPart(part) ? new ListenerPort(part, record[CASE_LISTENER]) : walk(part))) };
    }
    if (named(value)) {
      found = true;
      return new ServiceValue((value as { service: 'address' | 'scope' }).service, service);
    }
    const object = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(object)) {
      if (key === 'then' && isInstanceValue(object) && Array.isArray(item)) {
        out[key] = item.map((step) => {
          if (typeof step !== 'object' || step === null || Array.isArray(step) || !('service' in step || 'peer' in step)) return walk(step);
          const { service: change, peer, ...rest } = step as Record<string, unknown>;
          found = true;
          // GN-13q: the step of the peer after the call, which the peer of the service of the case reads.
          return { ...(walk(rest) as Record<string, unknown>), ...(change === undefined ? {} : { service: new ServiceChange(shown(change), service) }), ...(peer === undefined ? {} : { peer: new ServiceChange(shown(peer), service) }) };
        });
      } else out[key] = walk(item);
    }
    return out;
  };
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) out[key] = key === 'service' ? service : walk(item);
  return found || service !== undefined ? out : kase;
}

// GN-13j: whether a case runs against a service: it has service, or a value or a call of then that names one. A test
// that takes the values of a case without its lines takes none of such a case.
export function servesCase(record: Record<string, unknown>): boolean {
  const names = (value: unknown): boolean => {
    if (value instanceof ServiceValue || value instanceof ServiceChange || value instanceof ListenerPort) return true;
    if (Array.isArray(value)) return value.some(names);
    return typeof value === 'object' && value !== null && Object.values(value).some(names);
  };
  return record['service'] !== undefined || record[CASE_LISTENER] !== undefined || names(record);
}

// GN-13j: the service of a case that a test of the target runs, or the reason that fails the test of the case. The core
// of WASM has no socket, so it reaches no service.
export function serviceOf(given: unknown, target: string): CaseService | undefined {
  if (given === undefined) return undefined;
  if (given instanceof ServiceRefused) throw new Unsupported(given.reason);
  if (!(given instanceof CaseService)) throw new Unsupported(`service of a case is {"id": "<service id>", "setup": <JSON>, "check": <JSON>} (GN-13j), not ${shown(given)}`);
  if (target === 'wasm') throw new Unsupported('the core of WASM has no socket, so it reaches no service; the row of the case in cases has an only without wasm (GN-13j)');
  if (given.state === undefined && (given.setup !== undefined || given.check !== undefined)) throw new Unsupported(`the service ${given.id} has no state, so the case gives no setup, check or service of a call of then (GN-13j)`);
  if (given.state === undefined && given.peer !== undefined) throw new Unsupported(`the service ${given.id} has no state, so the case gives no peer (GN-13q)`);
  return given;
}

// GN-13j: the service that a value {"service": ...} or a change of a call of then names.
function namedService(service: CaseService | ServiceRefused | undefined, what: string, target: string): CaseService {
  if (service === undefined) throw new Unsupported(`${what} stands in a case without service (GN-13j)`);
  const found = serviceOf(service, target);
  if (found === undefined) throw new Unsupported(`${what} stands in a case without service (GN-13j)`);
  return found;
}

// GN-13j: a value {"service": ...} of a case in a target: the service whose address the test reads, or the scope.
export function serviceValueOf(value: ServiceValue, target: string): { address: CaseService } | { scope: string } {
  const service = namedService(value.service, `a case value {"service": "${value.which}"}`, target);
  return value.which === 'address' ? { address: service } : { scope: service.scope(target) };
}

// GN-13j: the change of a call of then in a target: the service, the program of its state and the JSON text.
export function serviceChangeOf(change: ServiceChange, target: string): { service: CaseService; state: string; value: string } {
  const service = namedService(change.service, 'the service of a call of then', target);
  if (service.state === undefined) throw new Unsupported(`the service ${service.id} has no state, so the case gives no setup, check or service of a call of then (GN-13j)`);
  return { service, state: service.state, value: change.value };
}

// GN-13q: the step of the peer after a call of then: the service and the JSON text that the peer reads as one line.
export function servicePeerOf(step: ServiceChange, target: string): { service: CaseService; value: string } {
  if (step.service === undefined) throw new Unsupported('the peer of a call of then stands in a case without service (GN-13q)');
  const service = namedService(step.service, 'the peer of a call of then', target);
  if (service.peer === undefined) throw new Unsupported(`a call of then steps the peer, but the service ${service.id} of the case has no peer (GN-13q)`);
  return { service, value: step.value };
}

// GN-13j: the steps of the program of the state of a service that a test runs: setup before the values of the case,
// check after its call; each with the variable of the program, the scope and the JSON text.
export interface ServiceSteps {
  service: CaseService;
  scope: string;
  setup?: { state: string; value: string };
  check?: { state: string; value: string };
  // GN-13q: the start of the peer, after setup; the test ends the peer before check.
  peer?: { state: string; value: string };
}
export function serviceSteps(given: unknown, target: string): ServiceSteps | undefined {
  const service = serviceOf(given, target);
  if (service === undefined) return undefined;
  const step = (value: string | undefined): { state: string; value: string } | undefined => (value === undefined || service.state === undefined ? undefined : { state: service.state, value });
  const setup = step(service.setup);
  const check = step(service.check);
  const peer = step(service.peer);
  return { service, scope: service.scope(target), ...(setup === undefined ? {} : { setup }), ...(check === undefined ? {} : { check }), ...(peer === undefined ? {} : { peer }) };
}

// `out`: the value as the binding gives it back, for the comparison of a result (GN-13e): an int64 is a bigint in Node
// and a tuple a tuple in Python.
// GN-13e: the expression of a case value in the language; where the language binds a deep value step by step (Python),
// each value is given to the steps, and the whole value to their end.
export function fromJson(model: Model, ctx: Context, type: Type, value: unknown, out = false): string {
  // GN-13n: {"bound": <name>}, the argument that a function fixture around the value keeps under the name.
  const bound = boundName(value);
  if (bound !== undefined) {
    if (ctx.boundValue === undefined) throw new Unsupported(`a case value {"bound": "${bound}"} names an argument of a function fixture, which this language does not keep yet (GN-13n)`);
    return ctx.boundValue(bound);
  }
  const make = (): string => {
    const steps = ctx.steps;
    if (steps === undefined) return valueForm(model, ctx, type, value, out);
    steps.depth += 1;
    try {
      const expr = valueForm(model, ctx, type, value, out);
      return steps.depth === 1 ? steps.done(expr) : steps.bind(expr);
    } finally {
      steps.depth -= 1;
      if (steps.depth === 0) steps.drop();
    }
  };
  return ctx.caseTextExpression === undefined ? make() : ctx.caseTextExpression(make);
}

// A synchronous alias projection may call writer closures that hold this same context. Restore the scope even
// when a named refusal interrupts rendering, so a later ordinary typed-TEXT case retains its supported form.
function aliasCaseProjection(ctx: Context, make: () => string): string {
  const previous = ctx.caseTextAlias;
  ctx.caseTextAlias = true;
  try {
    return make();
  } finally {
    if (previous === undefined) delete ctx.caseTextAlias;
    else ctx.caseTextAlias = previous;
  }
}

function valueForm(model: Model, ctx: Context, type: Type, value: unknown, out: boolean): string {
  const none = ctx.lang === 'python' ? 'None' : 'null';
  if (value === null) return none;
  if (value instanceof ServiceValue && type !== 'text' && type !== 'latin1' && !(typeof type === 'object' && 'optional' in type)) {
    throw new Unsupported(`a case value {"service": "${value.which}"} stands at a place of the type text or latin1 alone (GN-13j), not at ${shown(type)}`);
  }
  if (typeof type === 'string') {
    const composed = caseTextParts(value);
    if (composed !== undefined) {
      if (ctx.caseTextAlias === true) throw new Unsupported('a composed case text is not an aliased typed-text value (GN-13l)');
      if (type !== 'text') throw new Unsupported(`a composed case text belongs to type text only (GN-13l), not ${shown(type)}`);
      const literal = (part: string): string => ctx.lang === 'python' ? pyString(part) : ctx.lang === 'node' ? jsString(part) : phpText(part);
      const parts = composed.map((part) => {
        if (typeof part === 'string') return literal(part);
        if ('listener' in part) {
          part.listener.check();
          if (ctx.listenerPort === undefined) throw new Unsupported(`the port of the listener of a case is not generated for ${ctx.target ?? ctx.lang} (GN-13r)`);
          return ctx.listenerPort;
        }
        if (ctx.caseTextPath === undefined) throw new Unsupported(`a case-owned text path is not generated for ${ctx.target ?? ctx.lang} (GN-13l)`);
        return ctx.caseTextPath(part.relative, part.jsonString);
      });
      return `(${parts.join(ctx.lang === 'php' ? ' . ' : ' + ')})`;
    }
    // GN-13j: the address of the service of the case, or the scope of the case in the target.
    if ((type === 'text' || type === 'latin1') && value instanceof ServiceValue) {
      const given = serviceValueOf(value, ctx.target ?? ctx.lang);
      if ('scope' in given) return ctx.lang === 'python' ? pyString(given.scope) : ctx.lang === 'node' ? jsString(given.scope) : phpText(given.scope);
      if (ctx.serviceAddress === undefined) throw new Unsupported(`the address of a service is not generated for ${ctx.target ?? ctx.lang} (GN-13j)`);
      return ctx.serviceAddress(given.address);
    }
    // G-5: a text that is not well formed is {"ill_formed": "<text>"}: the text and then one code unit that no well-formed
    // text holds, an unpaired surrogate where a text is code points or UTF-16 and the byte 0xFF where it is bytes.
    if (type === 'text' && typeof value === 'object') {
      const text = (value as { ill_formed?: unknown }).ill_formed;
      if (typeof text !== 'string' || Object.keys(value).length !== 1) throw new Unsupported(`a case value of the type text is a text or {"ill_formed": "<text>"}, not ${shown(value)}`);
      if (ctx.lang === 'python') return `${pyString(text)} + "\\ud800"`;
      if (ctx.lang === 'node') return `${jsString(text)} + '\\uD800'`;
      return `${phpText(text)} . "\\xFF"`;
    }
    // B-4, G-5: a value of another JSON kind than the type, which a case gives for the binding to refuse, is written as
    // the value of its JSON kind, never converted to the type.
    const scalar = (): string => typeof value === 'string' ? (ctx.lang === 'python' ? pyString(value) : ctx.lang === 'node' ? jsString(value) : phpText(value))
      : typeof value === 'boolean' ? (ctx.lang === 'python' ? (value ? 'True' : 'False') : String(value)) : String(value);
    const numeric = type === 'uint' || type === 'int' || type === 'int64' || type === 'float';
    if ((numeric && (typeof value === 'string' || typeof value === 'boolean')) || ((type === 'text' || type === 'latin1' || type === 'bool') && (typeof value === 'number' || (type === 'bool' ? typeof value === 'string' : typeof value === 'boolean')))) return scalar();
    if (type === 'text' || type === 'latin1') {
      const text = String(value);
      if (ctx.lang === 'python') return pyString(text);
      if (ctx.lang === 'node') return jsString(text);
      return type === 'latin1' ? phpLatin1(text) : phpText(text);
    }
    if (type === 'bool') return ctx.lang === 'python' ? (value === true ? 'True' : 'False') : String(value === true);
    // GN-13bc, B2.360: {"float": "<decimal>"} is a float that JSON writes as an integer, such as 2.0 or -0.0, at any
    // number place: PHP and Python write their float literal, Node and WASM the number, which holds no float type.
    const decimal = typeof value === 'object' && value !== null ? floatToken(value) : undefined;
    if (numeric && decimal !== undefined) {
      if (ctx.lang === 'node') return Object.is(Number(decimal), -0) ? '-0' : String(Number(decimal));
      return /[.eE]/.test(decimal) ? decimal : `${decimal}.0`;
    }
    // G-5: a float that JSON cannot write is {"float": "nan" | "inf" | "-inf"}.
    if (type === 'float' && typeof value === 'object') {
      const name = (value as { float?: unknown }).float;
      const forms: Record<string, Record<Lang3, string>> = {
        nan: { python: 'float("nan")', node: 'NaN', php: 'NAN' },
        inf: { python: 'float("inf")', node: 'Infinity', php: 'INF' },
        '-inf': { python: 'float("-inf")', node: '-Infinity', php: '-INF' },
      };
      const form = typeof name === 'string' ? forms[name] : undefined;
      if (form === undefined) throw new Unsupported(`a case value of the type float is a number or {"float": "nan" | "inf" | "-inf" | "<decimal>"}, not ${shown(value)}`);
      return form[ctx.lang];
    }
    // T-1: an int64 is a bigint in Node, which takes a number of the safe integers too; a case gives an integer outside
    // them as a bigint (cli.ts), whose decimal token every language writes.
    if (type === 'int64' && ctx.lang === 'node' && (out || typeof value === 'bigint')) return `${String(value)}n`;
    // B-2, G-5: a float is a float literal in Python and PHP, which refuse an integer there, also where JSON writes an
    // integer; a negative zero keeps its sign, and an integer of 1e16 or more is written with its exponent, as Python
    // writes it.
    if (type === 'float' && typeof value === 'number') {
      if (Object.is(value, -0)) return ctx.lang === 'node' ? '-0' : '-0.0';
      if (ctx.lang === 'node' || !Number.isInteger(value)) return String(value);
      return Math.abs(value) >= 1e16 ? value.toExponential() : `${String(value)}.0`;
    }
    // T-1, B2.464: PHP gives the least int64 as \PHP_INT_MIN.
    if (type === 'uint' || type === 'int' || type === 'int64') return ctx.lang === 'php' ? phpInt(String(value)) : String(value);
    if (type === 'float') return String(value);
    // G-5: bytes are {"hex": "<two hex digits per byte>"}; a source is its text or, for bytes that are no text, the same.
    if (type === 'bytes' || type === 'source') {
      if (type === 'source' && typeof value === 'string') return ctx.lang === 'python' ? pyString(value) : ctx.lang === 'node' ? jsString(value) : phpText(value);
      const hex = typeof value === 'object' ? (value as { hex?: unknown }).hex : undefined;
      if (typeof hex !== 'string' || !/^([0-9a-f]{2})*$/.test(hex)) throw new Unsupported(`a case value of the type ${type} is {"hex": "<lower-case hex>"}, not ${shown(value)}`);
      if (ctx.lang === 'python') return `bytes.fromhex(${pyString(hex)})`;
      if (ctx.lang === 'node') return `new Uint8Array(Buffer.from(${jsString(hex)}, 'hex'))`;
      return `hex2bin(${phpText(hex)})`;
    }
    if (type === 'cancel') {
      if (ctx.cancelNew === undefined) throw new Unsupported(`a case value of the type cancel is not generated for ${ctx.target ?? ctx.lang} (GN-6aq)`);
      return ctx.cancelNew(cancelState(value));
    }
    if (type === 'path') {
      const relative = casePathOf(value);
      if (ctx.casePath === undefined) throw new Unsupported(`a case value of the type path is not generated for ${ctx.target ?? ctx.lang} (GN-6y)`);
      return ctx.casePath(relative);
    }
    throw new Unsupported(`no case value of the type ${type}`);
  }
  if ('optional' in type) return fromJson(model, ctx, type.optional, value, out);
  // GN-6ae: a function is its fixture, and a passthrough is a value of the language, given as a value of GN-13.
  if (machineFunction(type)) return functionFixture(model, ctx, type.function, value);
  if ('passthrough' in type) return valueFromJson(model, ctx, value, 'a passthrough');
  if ('tuple' in type) {
    if (!Array.isArray(value) || value.length !== type.tuple.length) throw new Unsupported(`a case value of the tuple ${shown(type)} is an array of ${type.tuple.length} values`);
    const items = type.tuple.map((part, i) => fromJson(model, ctx, part, value[i], out));
    return ctx.lang === 'python' ? `(${items.map((item) => `${item},`).join(' ')})` : `[${items.join(', ')}]`;
  }
  if ('list' in type) {
    const items = (value as unknown[]).map((item) => fromJson(model, ctx, type.list, item, out));
    return `[${items.join(', ')}]`;
  }
  if ('map' in type) {
    // G-5: a case gives a map as an object of its entries, or as an array of [key, value] in order.
    const entries = mapEntries(value).map(([key, item]) => {
      const k = fromJson(model, ctx, 'text', key);
      const v = fromJson(model, ctx, type.map, item, out);
      return ctx.lang === 'python' ? `${k}: ${v}` : ctx.lang === 'php' ? `${k} => ${v}` : `[${k}, ${v}]`;
    });
    return { python: `{${entries.join(', ')}}`, node: `new Map([${entries.join(', ')}])`, php: `[${entries.join(', ')}]` }[ctx.lang];
  }
  if ('keyed_map' in type) {
    // G-5: a case gives a keyed map as its entries in order, [key, value]: a key is a text, {"int": n} or {"hex": ...}.
    const entries = (value as [unknown, unknown][]).map(([key, item]) => {
      const k = caseKey(key, (kind, raw) => (kind === 'int' ? (ctx.lang === 'php' ? phpInt(String(raw)) : String(raw)) : fromJson(model, ctx, kind, raw)));
      const v = fromJson(model, ctx, type.keyed_map, item, out);
      return ctx.lang === 'python' ? `${k}: ${v}` : ctx.lang === 'php' ? `${k} => ${v}` : `[${k}, ${v}]`;
    });
    return { python: `{${entries.join(', ')}}`, node: `new Map([${entries.join(', ')}])`, php: `[${entries.join(', ')}]` }[ctx.lang];
  }
  const unit = unitOf(model, type);
  const alias = aliasOf(model, type);
  // GN-6x, GN-13: a value of a value class of another repository is an instance of the owner's class, which the
  // members of its out rows make; a result that holds one is compared with that instance, both read through the
  // members of the in row of the owner (GN-13e, B2.121).
  if (alias?.library !== undefined && alias.unit.kind === 'class') {
    const library = alias.library;
    return aliasCaseProjection(ctx, () => foreignClassValue(model, ctx, alias, library, value, `the class ${alias.unit.id} of ${library}`));
  }
  if (alias !== undefined) {
    const built = out && unit !== undefined ? madeAsBuilt(unit, ctx.lang, value) : value;
    return aliasCaseProjection(ctx, () => valueFromJson(model, ctx, built, `the alias ${String(unit?.id)}`, unit, alias.library));
  }
  if (unit?.kind === 'enum') return ctx.enumRef(langName('python', unit.name, 'class'), String(value));
  if (unit?.kind === 'record') {
    if (typeof value !== 'object' || Array.isArray(value)) throw new Unsupported(`a case value of the record ${unit.id} is not an object of its fields`);
    const fields = value as Record<string, unknown>;
    return leftOutNew(
      ctx,
      unit,
      (unit.fields ?? []).map((f) => {
        const key = caseName(f.name);
        // GN-6a: a field that may be left out is null when the case value leaves it out.
        if (!(key in fields) && caseLeftOut(f)) return out ? fromJson(model, ctx, f.type, null, out) : LEFT_OUT;
        if (!(key in fields)) throw new Unsupported(`a case value of the record ${unit.id} has no field ${key}`);
        return fromJson(model, ctx, f.type, fields[key], out);
      }),
    );
  }
  // G-5, GN-6v: a value of a variant is an object of its tag, whose value is the value of its case as the contract
  // states it, and its fields.
  const variant = variantOf(model, type);
  if (variant !== undefined) {
    const tag = caseName(variant.unit.tag ?? []);
    const fields = typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
    const kase = variant.cases.find((c) => c.value === fields?.[tag]);
    if (fields === undefined || kase === undefined) throw new Error(`a case value of the variant ${variant.unit.id} is an object whose ${tag} is the value of one of its cases, not ${shown(value)}`);
    const extra = Object.keys(fields).find((key) => key !== tag && !(kase.unit.fields ?? []).some((f) => caseName(f.name) === key));
    if (extra !== undefined) throw new Error(`a case value of the case ${kase.value} of the variant ${variant.unit.id} has no field ${extra}`);
    return caseNew(ctx, variant, kase, (kase.unit.fields ?? []).map((f) => {
      const key = caseName(f.name);
      // GN-6v: a field that may be left out is null when the case value leaves it out.
      if (!(key in fields) && caseLeftOut(f)) return out ? fromJson(model, ctx, f.type, null, out) : LEFT_OUT;
      if (!(key in fields)) throw new Error(`a case value of the case ${kase.value} of the variant ${variant.unit.id} has no field ${key}`);
      return fromJson(model, ctx, f.type, fields[key], out);
    }));
  }
  // GN-13f, GN-6w: an instance value of a class that implements a callback interface stands for the callback.
  if (unit?.origin === 'callback' && libraryOf(type) === undefined && isInstanceValue(value) && ctx.instanceNew !== undefined) {
    return ctx.instanceNew(implementerInstance(model, unit, value));
  }
  // GN-13f, GN-6ap: a value of a generated interface is an instance value of a class that implements it.
  const iface = interfaceOf(model, type);
  if (iface !== undefined && ctx.instanceNew !== undefined) return ctx.instanceNew(interfaceInstance(model, iface, value));
  // GN-13f: the value of a class is an instance value, at any place of the case.
  // GN-6aa: a callback value inside another value is the object of a fixture, whose unexpected call raises; an instance
  // value at a place of a callback is an instance of a class that implements it (GN-13f).
  if (unit?.origin === 'callback' && ctx.fixtureNew !== undefined && typeof value === 'object' && value !== null && 'callback' in value) {
    return ctx.fixtureNew(fixtureValues(model, ctx, fixtureOf(model, unit, value, 'a case value')));
  }
  if (unit?.origin === 'callback' && isInstanceValue(value) && ctx.instanceNew !== undefined) return ctx.instanceNew(callbackInstance(model, unit, libraryOf(type), value));
  // GN-6z: a function value at any other place of a case is a fixture of the call, whose unexpected call raises.
  if (typeof type === 'object' && 'function' in type && ctx.functionNew !== undefined) return ctx.functionNew(functionRows(model, ctx, type.function, value, 'a case value', ctx.functionMember ?? '__call__'), type.function.parameters.length);
  if (objectUnit(model, type) !== undefined && unit !== undefined && isInstanceValue(value) && ctx.instanceNew !== undefined) {
    return ctx.instanceNew(instanceOf(model, unit.id, value, `a case value of ${unit.id}`));
  }
  // U-1, GN-13: a value of a class of origin value is made by the member that its out row of the kind names.
  if (unit?.kind === 'class' && unit.origin === 'value' && !out) return aliasCaseProjection(ctx, () => valueClassFromJson(model, ctx, unit, value));
  // U-1, GN-13: a value of another class is the [key, value] pairs that fill it, as those of a kind map do.
  const filled = objectUnit(model, type);
  if (filled !== undefined && Array.isArray(value) && !out) return pairsInto(model, ctx, filled, value);
  // GN-13f: a class has one form of a case value, the instance value that a member of the contract makes.
  if (filled !== undefined && unit !== undefined && !out) throw new Unsupported(`a case value of the class ${unit.id} is an instance value {"new": "<member id>", "args": {...}} or {"from": ...}, not ${shown(value)} (G-5, GN-13f)`);
  throw new Unsupported(`no case value of the type ${shown(type)} is written yet (G-5)`);
}

// U-1, GN-13: a case value {"kind": <value kind>, "value": ...} of a class of origin value, as the call of the static
// member or constructor that the out row of the kind names for the language: a member without parameters for a kind
// without a value (null), and otherwise a member of one parameter, which takes the value of the case as a case value of
// its type (a list of the class for a list). A kind that no row makes by such a member is refused by name (G-4).
function valueClassFromJson(model: Model, ctx: Context, unit: Unit, value: unknown): string {
  const made = valueClassReceiver(model, ctx.target ?? ctx.lang, unit, value);
  if (ctx.objectNew === undefined) throw new Unsupported(`the kind of a case value of ${unit.id} is made by ${made.factory.member.id}, which this target does not call in a case yet (U-1, G-5)`);
  const [arg] = made.factory.args;
  if (arg === undefined) return ctx.objectNew(made.factory, '');
  const held = made.args.get(arg);
  const filled = objectUnit(model, arg.type);
  if ((value as Record<string, unknown>)['kind'] === 'map' && filled !== undefined && filled.unit !== unit) return ctx.objectNew(made.factory, callArgs(model, ctx, made.factory, () => pairsInto(model, ctx, filled, held)));
  return ctx.objectNew(made.factory, callArgs(model, ctx, made.factory, () => fromJson(model, ctx, arg.type, held)));
}

// U-1, GN-13: the call that makes a case value of a class of origin value in the language lang, as a receiver whose
// one argument, if any, is the value of the case; each target writes that argument as a case value of its type.
export function valueClassReceiver(model: Model, lang: string, unit: Unit, value: unknown): Receiver {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const kind = record?.['kind'];
  if (record === undefined || typeof kind !== 'string') throw new Unsupported(`a case value of ${unit.id} is {"kind": <value kind>, "value": ...}, not ${shown(value)} (G-5)`);
  const makes = [...new Set((unit.out ?? []).filter((row) => row.kind === kind).map((row) => (row.make as Record<string, unknown>)[lang]))];
  const make = makes[0];
  if (makes.length !== 1 || typeof make !== 'string') throw new Unsupported(`the kind ${kind} of ${unit.id} is made in ${lang} by ${makes.length === 0 ? 'no out row' : shown(makes)}, not by one member, so a case value of it is not written (U-1, G-5)`);
  const factory = model.objects.find((o) => o.unit === unit)?.members.find((m) => m.member.id === make && (m.kind === 'static' || m.kind === 'constructor'));
  if (factory === undefined) throw new Unsupported(`the kind ${kind} of ${unit.id} is made by ${make}, which is no static member or constructor of ${unit.id} (U-1, G-5)`);
  const given = 'value' in record;
  if (factory.args.length === 0) {
    if (given) throw new Unsupported(`a case value of the kind ${kind} of ${unit.id} has no value, because ${make} takes none (U-1, G-5)`);
    return { factory, args: new Map() };
  }
  const [arg, ...rest] = factory.args;
  if (arg === undefined || rest.length > 0 || arg.field) throw new Unsupported(`the kind ${kind} of ${unit.id} is made by ${make}, which takes more than one value, so a case value of it is not written (U-1, G-5)`);
  if (!given) throw new Unsupported(`a case value of the kind ${kind} of ${unit.id} holds the value that ${make} takes (U-1, G-5)`);
  return { factory, args: new Map([[arg, record['value']]]) };
}

// U-1, GN-13: the pairs of a case value of kind map, given to a make member that takes another class (Value.object of
// json takes an OrderedMap): the constructor of that class without parameters makes it, and its one member with the
// receiver &mut self and two parameters takes each pair, the key as a case value of its parameter (a key of text for a
// class of origin value) and the value as the case value of the pair.
function pairsInto(model: Model, ctx: Context, filled: ObjectClass, held: unknown): string {
  const made = pairsReceiver(model, filled, held);
  if (ctx.instanceNew === undefined) throw new Unsupported(`the pairs of a case value of kind map fill ${filled.unit.id}, which this target does not make in a case yet (G-5)`);
  return ctx.instanceNew(made);
}

// U-1, GN-13: the constructor and the inserts that fill a class with the pairs of a case, as a receiver with then.
export function pairsReceiver(model: Model, filled: ObjectClass, held: unknown): Receiver {
  const id = filled.unit.id;
  const constructor = filled.members.find((fn) => fn.kind === 'constructor' && fn.args.length === 0);
  if (constructor === undefined) throw new Unsupported(`the pairs of a case value of kind map fill ${id}, which has no constructor without parameters (U-1, G-5)`);
  const inserts = filled.members.filter((fn) => fn.receiver === '&mut self' && fn.args.length === 2 && fn.args.every((a) => !a.field));
  const insert = inserts[0];
  if (inserts.length !== 1 || insert === undefined) throw new Unsupported(`the pairs of a case value of kind map fill ${id}, which has ${inserts.length === 0 ? 'no member' : 'more than one member'} with the receiver &mut self and two parameters (U-1, G-5)`);
  if (!Array.isArray(held) || !held.every((pair) => Array.isArray(pair) && pair.length === 2)) throw new Unsupported(`a case value of kind map that fills ${id} is a list of [key, value] pairs, not ${shown(held)} (G-5)`);
  const [keyArg, valueArg] = insert.args as [Arg, Arg];
  const keyUnit = unitOf(model, keyArg.type);
  const keyOf = (key: unknown): unknown => (typeof key === 'string' && keyUnit?.kind === 'class' && keyUnit.origin === 'value' ? { kind: 'text', value: key } : key);
  const then = (held as [unknown, unknown][]).map(([key, value]) => ({ fn: insert, args: new Map<Arg, unknown>([[keyArg, keyOf(key)], [valueArg, value]]) }));
  return { factory: constructor, args: new Map(), then };
}

// GN-6x: the call of a member of the owner on a class of the owner (a constructor or a static member) or on an instance
// of it (any other member), in the language of the test.
function ownerCall(ctx: Context, on: string, member: Member, args: string): string {
  const name = langName(ctx.target ?? ctx.lang, member.name, 'callable');
  if (member.kind === 'constructor') return ctx.lang === 'python' ? `${on}(${args})` : `new ${on}(${args})`;
  if (member.kind === 'static') return `${on}${ctx.lang === 'php' ? '::' : '.'}${name}(${args})`;
  return `${on}${ctx.lang === 'php' ? '->' : '.'}${name}(${args})`;
}

// The kinds of a case value and the content that each holds, as a case writes it (G-5).
function foreignContent(kind: string, type: Type | undefined, held: unknown, where: string): void {
  const fail = (what: string): never => {
    throw new Unsupported(`a case value of the kind ${kind} of ${where} holds ${what}, not ${shown(held)} (G-5)`);
  };
  if (type === 'text' && typeof held !== 'string' && !(typeof held === 'object' && held !== null && 'ill_formed' in held)) fail('a text');
  if (type === 'bool' && typeof held !== 'boolean') fail('true or false');
  if (typeof type === 'object' && 'list' in type && type.list === 'uint' && !(Array.isArray(held) && held.every((unit) => typeof unit === 'number' && Number.isSafeInteger(unit) && unit >= 0))) fail('a list of integers of at least 0');
}

// GN-6x, GN-13: one step of the value of a case of a value class of another repository, which each target writes in
// its own form: the call of the member of the out row of the kind on the content of the case, on the values of a list,
// on one value n times (G-5: {"kind": "list", "repeat": n, "value": <value>}), or on an instance of the class that the
// row fills, whose constructor without parameters makes it and whose member takes each [key, value] pair. A text key of
// a pair is the value of the kind text, because that member takes two values of the class.
export type ForeignStep =
  | { form: 'content'; make: Member; type?: Type; held?: unknown }
  | { form: 'list'; make: Member; items: ForeignStep[] }
  | { form: 'repeat'; make: Member; repeat: number; inner: ForeignStep }
  | { form: 'map'; make: Member; map: Unit; construct: Member; insert: Member; pairs: [ForeignStep, ForeignStep][] };

// GN-13bc: the decimal token of a case value {"float": "<decimal>"}, or undefined for any other value.
export const floatToken = (value: object): string | undefined => {
  const keys = Object.keys(value);
  const token = (value as { float?: unknown }).float;
  return keys.length === 1 && typeof token === 'string' && /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(token) ? token : undefined;
};

// GN-6br: whether a case text holds an unpaired surrogate, which is no text of every language (B2.81).
const loneSurrogate = (value: unknown): value is string => typeof value === 'string' && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
const codeUnits = (text: string): number[] => Array.from({ length: text.length }, (_, at) => text.charCodeAt(at));

export function foreignSteps(alias: ValueAlias, lang: Lang, value: unknown, where: string): ForeignStep {
  let record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const given = record?.['kind'];
  if (record === undefined || typeof given !== 'string') throw new Unsupported(`a case value of ${where} is {"kind": <value kind>, "value": ...}, not ${shown(value)} (G-5)`);
  if (given === 'text' && caseTextParts(record['value']) !== undefined) throw new Unsupported('a composed case text is not an alias text value (GN-13l)');
  // GN-6br, B2.81: a text with an unpaired surrogate is made by the out row of the kind text16, from its UTF-16 code
  // units, where the owner has one: the make of a text would refuse it or, in PHP, replace it by U+FFFD.
  const lone = given === 'text' && loneSurrogate(record['value']) && classMakes(alias, lang).some((make) => make.kind === 'text16');
  const kind = lone ? 'text16' : given;
  if (lone) record = { ...record, value: codeUnits(String(record['value'])) };
  const makes = classMakes(alias, lang).filter((make) => make.kind === kind);
  const [make] = makes;
  if (make === undefined || makes.length > 1) throw new Unsupported(`the kind ${kind} of ${where} is made in ${lang} by ${makes.length === 0 ? 'no out row' : `${String(makes.length)} out rows`} of its owner, not by one member, so no case value of that kind is one of the class (GN-6x, G-5)`);
  const held = record['value'];
  if (make.form === 'content') {
    if (make.params === 0) {
      if ('value' in record) throw new Unsupported(`a case value of the kind ${kind} of ${where} has no value, because ${make.member.id} takes none (GN-6x, G-5)`);
      return { form: 'content', make: make.member };
    }
    if (!('value' in record)) throw new Unsupported(`a case value of the kind ${kind} of ${where} holds the value that ${make.member.id} takes (GN-6x, G-5)`);
    const type = make.member.parameters?.[0]?.type;
    foreignContent(kind, type, held, where);
    return { form: 'content', make: make.member, ...(type === undefined ? {} : { type }), held };
  }
  if (make.form === 'list') {
    if (record['repeat'] !== undefined) {
      const repeat = record['repeat'];
      if (typeof repeat !== 'number' || !Number.isSafeInteger(repeat) || repeat < 1 || Object.keys(record).length !== 3) throw new Unsupported(`a case value of ${where} is {"kind": "list", "repeat": <n of at least 1>, "value": <value>}, not ${shown(value)} (G-5)`);
      return { form: 'repeat', make: make.member, repeat, inner: foreignSteps(alias, lang, held, where) };
    }
    if (!Array.isArray(held)) throw new Unsupported(`a case value of the kind list of ${where} holds a list of values, not ${shown(held)} (G-5)`);
    return { form: 'list', make: make.member, items: held.map((item) => foreignSteps(alias, lang, item, where)) };
  }
  if (!Array.isArray(held) || !held.every((pair) => Array.isArray(pair) && pair.length === 2)) throw new Unsupported(`a case value of the kind map of ${where} holds a list of [key, value] pairs, not ${shown(held)} (G-5)`);
  const construct = (make.map.members ?? []).find((m) => m.kind === 'constructor' && (m.parameters ?? []).length === 0) as Member;
  const pairs = (held as [unknown, unknown][]).map(([key, item]): [ForeignStep, ForeignStep] => [
    foreignSteps(alias, lang, typeof key === 'string' ? { kind: 'text', value: key } : key, `a key of ${where}`),
    foreignSteps(alias, lang, item, where),
  ]);
  return { form: 'map', make: make.member, map: make.map, construct, insert: make.insert, pairs };
}

// GN-6x, GN-13: a case value of a value class of another repository as one expression of Python, Node, WASM or PHP: the
// calls of the owner's members through the owner's package, which the test imports.
function foreignClassValue(model: Model, ctx: Context, alias: ValueAlias, library: string, value: unknown, where: string): string {
  const sort = typeof value === 'object' && value !== null && 'host' in value ? (value as { host: unknown }).host : undefined;
  if (typeof sort === 'string' && Object.hasOwn(HOST_VALUES, sort)) return HOST_VALUES[sort as keyof typeof HOST_VALUES][ctx.lang];
  const named = ctx.foreignClass;
  if (named === undefined) throw new Unsupported(`a case value of ${where} is an instance of the class of its owner, which this target does not name in a test (GN-6x)`);
  const cls = named(library, alias.unit);
  const local = (name: string): string => (ctx.lang === 'php' ? `$${name}` : name);
  const write = (step: ForeignStep): string => {
    if (step.form === 'content') return ownerCall(ctx, cls, step.make, step.type === undefined ? '' : fromJson(model, { ...ctx, steps: undefined }, step.type, step.held));
    if (step.form === 'list') return ownerCall(ctx, cls, step.make, `[${step.items.map(write).join(', ')}]`);
    if (step.form === 'repeat') {
      const around = ownerCall(ctx, cls, step.make, `[${local('inner')}]`);
      const inner = write(step.inner);
      if (ctx.lang === 'python') return `__import__("functools").reduce(lambda inner, _: ${around}, range(${step.repeat}), ${inner})`;
      if (ctx.lang === 'node') return `Array.from({ length: ${step.repeat} }).reduce((inner) => ${around}, ${inner})`;
      return `array_reduce(array_fill(0, ${step.repeat}, null), fn ($inner) => ${around}, ${inner})`;
    }
    const filled = local('filled');
    const made = ownerCall(ctx, named(library, step.map), step.construct, '');
    const inserts = step.pairs.map(([key, item]) => ownerCall(ctx, filled, step.insert, `${write(key)}, ${write(item)}`));
    const given = ownerCall(ctx, cls, step.make, filled);
    if (ctx.lang === 'python') return `(lambda filled: (${[...inserts, given].map((call) => `${call},`).join(' ')})[-1])(${made})`;
    if (ctx.lang === 'node') return `(() => { const filled = ${made}; ${inserts.map((call) => `${call}; `).join('')}return ${given}; })()`;
    return `(static function () { $filled = ${made}; ${inserts.map((call) => `${call}; `).join('')}return ${given}; })()`;
  };
  return write(foreignSteps(alias, ctx.target ?? ctx.lang, value, where));
}

// GN-13e: a result of a value alias is compared with the value that valueFromJson makes, which is the value of the
// built-in form of each kind; a kind whose out rows make another form in the language is not compared yet.
const BUILT: Readonly<Record<string, string>> = { null: 'null', bool: 'bool', int: 'int', float: 'float', text: 'text', bytes: 'bytes', list: 'list', map: 'map' };
// B2.375: the row that makes a value is the row of its kind whose predicate the value holds (aliasOutForm), and a
// byte string that leaves as a text, the UTF-8 bytes of a row {"predicate": "utf8", "is": true}, is the text of its
// bytes in the language, which the expected value is.
function madeAsBuilt(unit: Unit, lang: Lang3, value: unknown): unknown {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const kind = record?.['kind'];
  if (record === undefined || typeof kind !== 'string') return value;
  if ((unit.out ?? []).some((r) => r.kind === kind)) {
    const make = aliasOutForm(unit, lang, kind, record);
    if (kind === 'bytes' && make === 'text') return { kind: 'text', value: caseBytes(record['value']).toString('utf8') };
    if (make !== BUILT[kind]) throw new Unsupported(`the kind ${kind} of ${unit.id} leaves ${lang} by the form ${shown(make)}, with which a result is not compared yet`);
  }
  const held = record['value'];
  if (kind === 'list' && record['repeat'] !== undefined) return { ...record, value: madeAsBuilt(unit, lang, held) };
  if (kind === 'list' && Array.isArray(held)) return { ...record, value: held.map((item) => madeAsBuilt(unit, lang, item)) };
  if (kind === 'map' && Array.isArray(held)) return { ...record, value: held.map((pair) => [(pair as unknown[])[0], madeAsBuilt(unit, lang, (pair as unknown[])[1])]) };
  return value;
}

// GN-13: a case whose value has no form in the language. It is an Unsupported, so the test of the case fails with
// the reason as caseRefusal names it (G-4).
export class CaseRefused extends Unsupported {}

// GN-13e: the expected result of a case in the language, or the reason why the generator cannot write it, which the
// test of the case fails with.
// GN-13e: `round` names the alias whose entry points of codec-test (in_raises) take the result back by its in function
// and give it again by its out function, so its test compares the texts of that value too.
// GN-6ae: the result that a step of a function fixture or a call of after requires, compared as a value of its type; a
// result of a value alias, which a case compares by its tokens (GN-13e), is refused by name there.
export function stepExpected(model: Model, ctx: Context, fn: Fn, value: unknown): { text: string } | { refused: string } {
  const expected = expectedText(model, ctx, fn, value);
  if ('tokens' in expected) throw new Unsupported(`the result of ${fn.member.id} in a step of a function fixture or in after is a value alias, which is not compared there yet (GN-6ae, GN-13e)`);
  return expected;
}

export function expectedText(model: Model, ctx: Context, fn: Fn, value: unknown): { text: string } | { tokens: string; round?: Name } | { refused: string } {
  // GN-13e, B2.466 (B2.374, CK-22): the result of a member without a result is the null of its case wherever the case
  // writes it, which is no value: Node and WASM give undefined for it, which the test requires, and Python and PHP
  // give None and null.
  if (fn.member.returns === 'none' && value === null && ctx.lang === 'node') return { text: 'undefined' };
  // GN-6af: a property of a value class without core_type gives the value that the language gave its constructor, so
  // the value is written as an argument is, not by the out rows of its alias.
  const kept = fn.kind === 'property' && model.kept.some((k) => k.members.includes(fn));
  try {
    // GN-13e: a result of a value alias is compared by the tokens of its places, which name the form of each place.
    // A value class of another repository is compared as the instance that its case value makes (B2.121).
    const alias = kept ? undefined : aliasOf(model, fn.returns);
    if (alias !== undefined && alias.unit.out !== undefined && !(alias.library !== undefined && alias.unit.kind === 'class')) {
      const tokens = JSON.stringify(aliasTokens(model, ctx.lang, alias.unit, value));
      return alias.inRaises.length > 0 ? { tokens, round: alias.unit.name } : { tokens };
    }
    return { text: fromJson(model, ctx, fn.returns, value, !kept) };
  } catch (error) {
    return { refused: `${fn.member.id}: ${error instanceof Error ? error.message : String(error)} (GN-13e)` };
  }
}

// GN-13n: the name of a case value {"bound": <name>}, or undefined for another value.
export function boundName(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const keys = Object.keys(value);
  const name = (value as { bound?: unknown }).bound;
  return keys.length === 1 && typeof name === 'string' ? name : undefined;
}

// GN-6ae: the function of a function fixture, {"function": {"calls": [<step>], "result" | "raise"}} (CK-22 has judged
// the form): a step is a call of a method of the class of the parameter at its position, whose arguments are case
// values of the parameters of that method, a function fixture among them.
function functionFixture(model: Model, ctx: Context, type: Extract<Type, { function: unknown }>['function'], value: unknown): string {
  const fixture = (value as { function?: Record<string, unknown> } | null)?.function;
  if (ctx.machineFunctionNew === undefined || typeof fixture !== 'object' || fixture === null) throw new Unsupported(`a case value of a function type is a function fixture, not ${shown(value)} (GN-6ae)`);
  const steps = (Array.isArray(fixture['calls']) ? (fixture['calls'] as Record<string, unknown>[]) : []).map((step) => {
    const fn = memberById(model, String(step['call']));
    const args = fn === undefined ? undefined : argsOf(fn, (step['args'] ?? {}) as Record<string, unknown>);
    if (fn === undefined || args === undefined) throw new Unsupported(`a step of a function fixture calls ${String(step['call'])} with ${shown(step['args'])}, which are not the parameters of a member (GN-6ae)`);
    const on = String(step['on']);
    // GN-13o: a step that names raises fails with that kind, which the function requires before its next step.
    const kind = (step['raises'] as { kind?: unknown } | undefined)?.kind;
    return { ...(typeof kind === 'string' ? { raises: kind } : {}), on: /^(0|[1-9][0-9]*)$/.test(on) ? Number(on) : on, fn, args: callArgs(model, ctx, fn, (arg) => caseValue(model, ctx, arg, args)), ...(Object.hasOwn(step, 'result') ? { expected: stepExpected(model, ctx, fn, step['result']) } : {}) };
  });
  const raise = fixture['raise'];
  const awaits = fixture['awaits'] === true;
  const names = Array.isArray(fixture['names']) ? fixture['names'].map(String) : [];
  if (raise === undefined) return ctx.machineFunctionNew({ names, parameters: type.parameters.length, awaits, steps, end: { result: fromJson(model, ctx, type.returns, fixture['result'] ?? null) } });
  if (raise === 'exception') return ctx.machineFunctionNew({ names, parameters: type.parameters.length, awaits, steps, end: { exception: true } });
  const { error, kind } = raise as { error: string; kind: string };
  const unit = model.contract.units.find((u) => u.id === error);
  if (unit === undefined || ctx.errorNew === undefined) throw new Unsupported(`a function fixture raises the error unit ${error}, which is not generated for this language yet (GN-6ae, GN-13)`);
  return ctx.machineFunctionNew({ names, parameters: type.parameters.length, awaits, steps, end: { raise: ctx.errorNew(unit, kind, FIXTURE_RAISED) } });
}

// GN-6ae (CK-22): whether an argument of a case is a function fixture that names awaits, so that the test of a language
// with awaitables calls the awaited form of the member.
export const awaitsFunction = (args: Map<Arg, unknown>): boolean =>
  [...args.values()].some((value) => (value as { function?: { awaits?: unknown } } | null)?.function?.awaits === true);

// GN-6ae: whether a value of a case holds a function fixture that raises the exception of the language.
export const raisesException = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some(raisesException);
  const fixture = (value as Record<string, unknown>)['function'];
  if (typeof fixture === 'object' && fixture !== null && (fixture as Record<string, unknown>)['raise'] === 'exception') return true;
  return Object.values(value).some(raisesException);
};
// GN-13e: the result of a member that returns a value alias is compared as the texts of its places in pre-order,
// depth first, which a loop writes on both sides, so a value nested deeper than a recursion takes is compared too. The
// generator writes the texts of the case value by the out rows of the alias (the row whose kind and predicate the
// value has, and its form in the language), and the test writes those of the result by the type of each place
// (ALIAS_TOKENS of each language). A text names the form: null; bool, true or false; int, its decimal (Python, PHP);
// number, the hex of the IEEE 754 bits or nan (Node, WASM); bigint, its decimal; float, the hex of the bits or nan
// (Python, PHP); text and bytes, the hex of the UTF-8 or the bytes (Python, Node, WASM), string in PHP; list n, then
// its items; map n, then each key and its value; and an instance of a value class of the out rows, a PHP object and a
// PHP reference, numbered together by their first place: `<unit> #k`, then its field, `php_object #k n`, then its
// pairs, `php_reference #k`, then its value, and `<form> again k` at a later place. A PHP reference whose id has one
// place is its value alone, because PHP keeps no reference that one place holds.
export type TokenForm = { unit: string; cls: string; field: string; library?: string };

// The value classes that the out rows of an alias name as `<unit>.constructor` in a language, with their field.
export function aliasKept(model: Model, lang: Lang3, alias: Unit): TokenForm[] {
  const forms: TokenForm[] = [];
  const library = model.aliases.find((a) => a.unit === alias)?.library;
  for (const row of alias.out ?? []) {
    const make = row.make[lang];
    if (typeof make !== 'string' || !make.endsWith('.constructor')) continue;
    const unit = make.slice(0, -'.constructor'.length);
    if (forms.some((f) => f.unit === unit)) continue;
    // The class of the form: its constructor takes one value, which a property of the same name gives back.
    // GN-6ar: the class of a row of an alias of another repository is a class of the contract of the owner.
    const cls = (library === undefined ? model.contract : model.foreign.get(library))?.units.find((u) => u.id === unit);
    const params = cls?.members?.find((m) => m.kind === 'constructor')?.parameters ?? [];
    const [param] = params;
    const property = param === undefined ? undefined : cls?.members?.find((m) => m.kind === 'property' && m.name.join('_') === param.name.join('_'));
    if (cls === undefined || param === undefined || params.length !== 1 || property === undefined) throw new Unsupported(`the out form ${make} of ${alias.id} is no class whose constructor takes one value that a property of its name gives back, with which a result is not compared yet`);
    forms.push({ unit, cls: langName(lang, cls.name, 'class'), field: langName(lang, param.name, 'variable'), ...(library === undefined ? {} : { library }) });
  }
  return forms;
}

// The bits of a float of a case as the tokens write them.
function floatBits(number: number): string {
  if (Number.isNaN(number)) return 'nan';
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, number);
  return view.getBigUint64(0).toString(16).padStart(16, '0');
}

// The number of a float or an int of a case: {"float": "nan" | "inf" | "-inf"}, a number, or a decimal text.
function caseNumber(raw: unknown): number {
  if (typeof raw === 'object' && raw !== null) return { nan: NaN, inf: Infinity, '-inf': -Infinity }[String((raw as { float?: unknown }).float)] ?? NaN;
  return Number(raw);
}

// The bytes of a text or bytes of a case, and of a key that is a text or {"hex"}.
function caseBytes(raw: unknown): Buffer {
  if (typeof raw === 'string') return Buffer.from(raw, 'utf8');
  return Buffer.from(String((raw as { hex?: unknown }).hex), 'hex');
}

function isUtf8(bytes: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

const SAFE = 2n ** 53n - 1n;

// GN-13e: whether a case value of the kind holds the predicate of an out row of the alias.
function holdsPredicate(alias: Unit, kind: string, node: Record<string, unknown>, predicate: string): boolean {
  const held = node['value'];
  switch (predicate) {
    case 'utf8':
      return kind === 'text' || isUtf8(caseBytes(held));
    case 'safe_integer':
      return kind === 'float' ? Number.isSafeInteger(caseNumber(held)) : BigInt(String(held)) >= -SAFE && BigInt(String(held)) <= SAFE;
    case 'integral_float': {
      const number = caseNumber(held);
      return Number.isFinite(number) && Number.isInteger(number);
    }
    case 'sequence_keys':
      if (kind !== 'list' && !Array.isArray(held)) throw new Unsupported(`a case value of the kind ${kind} of ${alias.id} is ${JSON.stringify(held)}, not an array of [key, value] pairs (G-5)`);
      return kind === 'list' || (held as unknown[][]).every((pair, i) => typeof pair[0] === 'object' && pair[0] !== null && String((pair[0] as { int?: unknown }).int) === String(i));
    default:
      throw new Unsupported(`the predicate ${predicate} of ${alias.id} is not judged for a result yet`);
  }
}

// GN-13e: the form in a language of the out row of the alias that makes a case value of the kind: the row of the kind
// whose predicate the value holds, or else its row without a predicate. A case value of the kind list or text is the
// map or the bytes of an alias whose out rows have no row of the kind.
export function aliasOutForm(alias: Unit, lang: string, kind: string, node: Record<string, unknown>): unknown {
  const rows = alias.out ?? [];
  const own = rows.filter((r) => r.kind === kind);
  const candidates = own.length > 0 ? own : rows.filter((r) => r.kind === ({ list: 'map', text: 'bytes' } as Record<string, string>)[kind]);
  const matched = candidates.find((r) => r.when !== undefined && r.when !== 'else' && holdsPredicate(alias, kind, node, r.when.predicate) === r.when.is)
    ?? candidates.find((r) => r.when === undefined || r.when === 'else');
  if (matched === undefined) throw new Unsupported(`no out row of ${alias.id} makes the kind ${kind} of a result`);
  return (matched.make as Record<string, unknown>)[lang];
}

// GN-13e: the form of a key of a case in a keyed map whose keys have the forms keys: an int key is an int; a text or a
// byte string is a text when the map takes texts and the bytes are UTF-8, and else bytes.
export function outKeyForm(key: unknown, keys: readonly string[]): { kind: 'int'; value: string } | { kind: 'text' | 'bytes'; value: Buffer } {
  if (typeof key === 'object' && key !== null && 'int' in key) return { kind: 'int', value: String((key as { int: unknown }).int) };
  const bytes = caseBytes(key);
  return { kind: keys.includes('text') && isUtf8(bytes) ? 'text' : 'bytes', value: bytes };
}

// GN-13e: the bytes of a text or bytes case value, and whether they are UTF-8.
export const caseValueBytes = (raw: unknown): { bytes: Buffer; utf8: boolean } => {
  const bytes = caseBytes(raw);
  return { bytes, utf8: isUtf8(bytes) };
};

// The tokens of a case value of an alias in a language (GN-13e).
export function aliasTokens(model: Model, lang: Lang3, alias: Unit, top: unknown): string[] {
  const kept = aliasKept(model, lang, alias);
  const out: string[] = [];
  class Key {
    readonly key: unknown;
    constructor(key: unknown) {
      this.key = key;
    }
  }
  const stack: unknown[] = [top];
  const objects = new Map<number, number>();
  const references = new Map<number, number>();
  // GN-13e: the places of each reference id; PHP keeps no reference that one place holds.
  const placesOfId = new Map<number, number>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    if (record['kind'] === 'reference' && typeof record['value'] === 'object' && record['value'] !== null) {
      const id = Number((record['value'] as Record<string, unknown>)['id']);
      placesOfId.set(id, (placesOfId.get(id) ?? 0) + 1);
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(top);
  let count = 0;
  const intToken = (decimal: string): string => {
    if (lang !== 'node') return `int ${decimal}`;
    const wide = BigInt(decimal);
    return wide >= -SAFE && wide <= SAFE ? `number ${floatBits(Number(wide))}` : `bigint ${decimal}`;
  };
  const textToken = (bytes: Buffer, text: boolean): string => `${lang === 'php' ? 'string' : text ? 'text' : 'bytes'} ${bytes.toString('hex')}`;
  const keyToken = (key: unknown, keys: readonly string[]): string => {
    if (typeof key === 'object' && key !== null && 'int' in key) return intToken(String((key as { int: unknown }).int));
    const bytes = caseBytes(key);
    // PHP makes a key that is the decimal text of an integer that integer.
    if (lang === 'php' && /^(0|-?[1-9][0-9]*)$/.test(bytes.toString('latin1')) && BigInt(bytes.toString('latin1')) >= -(2n ** 63n) && BigInt(bytes.toString('latin1')) < 2n ** 63n) return `int ${bytes.toString('latin1')}`;
    return textToken(bytes, keys.includes('text') && isUtf8(bytes));
  };
  const keyed = (make: unknown): readonly string[] => (typeof make === 'object' && make !== null && 'keyed_map' in make ? (make as { keyed_map: { key: string[] } }).keyed_map.key : ['int', 'text', 'bytes']);
  const formOf = (kind: string, node: Record<string, unknown>): unknown => aliasOutForm(alias, lang, kind, node);
  const keptOfForm = (form: unknown): TokenForm | undefined => (typeof form === 'string' && form.endsWith('.constructor') ? kept.find((k) => `${k.unit}.constructor` === form) : undefined);
  while (stack.length > 0) {
    const item = stack.pop();
    if (item instanceof Key) {
      out.push(item.key as string);
      continue;
    }
    const node = item as Record<string, unknown>;
    const kind = String(node['kind']);
    const held = node['value'];
    switch (kind) {
      case 'null':
        out.push('null');
        continue;
      case 'bool':
        out.push(`bool ${String(held === true)}`);
        continue;
      default:
        break;
    }
    const form = formOf(kind, node);
    const cls = keptOfForm(form);
    switch (kind) {
      case 'int':
        out.push(form === 'bigint' ? `bigint ${String(held)}` : intToken(String(held)));
        break;
      case 'float': {
        const bits = floatBits(caseNumber(held));
        const token = `${lang === 'node' ? 'number' : 'float'} ${bits}`;
        if (cls === undefined) out.push(token);
        else out.push(`${cls.unit} #${String(count++)}`, token);
        break;
      }
      case 'text':
      case 'bytes': {
        if (caseTextParts(held) !== undefined) throw new Unsupported(`a composed case text is not an alias ${kind} value (GN-13l)`);
        const bytes = caseBytes(held);
        out.push(textToken(bytes, form === 'text'));
        break;
      }
      case 'list':
      case 'map':
      case 'object': {
        if (kind === 'object' && !('value' in node)) {
          out.push(`${cls?.unit ?? 'php_object'} again ${String(objects.get(Number(node['id'])))}`);
          break;
        }
        const repeat = node['repeat'] === undefined ? undefined : Number(node['repeat']);
        let pairs: [unknown, unknown][];
        if (kind === 'list') {
          pairs = repeat === undefined ? (held as unknown[]).map((value, i) => [{ int: i }, value]) : [[{ int: 0 }, repeat > 1 ? { ...node, repeat: repeat - 1 } : held]];
        } else if (repeat !== undefined) {
          pairs = [[node['key'], repeat > 1 ? { kind, repeat: repeat - 1, key: node['key'], value: held } : held]];
        } else {
          pairs = held as [unknown, unknown][];
        }
        const push = (keys: readonly string[]): void => {
          for (let i = pairs.length - 1; i >= 0; i -= 1) stack.push(pairs[i]?.[1], new Key(keyToken(pairs[i]?.[0], keys)));
        };
        if (form === 'list') {
          out.push(`list ${String(pairs.length)}`);
          for (let i = pairs.length - 1; i >= 0; i -= 1) stack.push(pairs[i]?.[1]);
        } else if (form === 'map' || (typeof form === 'object' && form !== null && 'keyed_map' in form)) {
          out.push(`map ${String(pairs.length)}`);
          push(form === 'map' ? ['text'] : keyed(form));
        } else if (form === 'php_object' || cls !== undefined) {
          const number = count++;
          if (kind === 'object' && node['id'] !== undefined) objects.set(Number(node['id']), number);
          if (cls === undefined) {
            out.push(`php_object #${String(number)} ${String(pairs.length)}`);
            push(['int', 'bytes']);
          } else {
            out.push(`${cls.unit} #${String(number)}`, `map ${String(pairs.length)}`);
            push(keyedField(model, cls.unit));
          }
        } else {
          throw new Unsupported(`the out form ${shown(form)} of ${alias.id} is not compared yet`);
        }
        break;
      }
      case 'reference': {
        const ref = held as Record<string, unknown>;
        const name = cls?.unit ?? 'php_reference';
        const id = Number(ref['id']);
        if (cls === undefined && lang === 'php' && placesOfId.get(id) === 1) {
          stack.push(ref['value']);
          break;
        }
        if (!('value' in ref)) {
          out.push(`${name} again ${String(references.get(id))}`);
          break;
        }
        references.set(id, count);
        out.push(`${name} #${String(count++)}`);
        stack.push(ref['value']);
        break;
      }
      default:
        throw new Unsupported(`a result of the kind ${kind} of ${alias.id} is not compared yet`);
    }
  }
  return out;
}

// The key forms of the keyed map that the one field of a value class keeps.
export function keyedField(model: Model, unit: string): readonly string[] {
  const type = model.contract.units.find((u) => u.id === unit)?.members?.find((m) => m.kind === 'constructor')?.parameters?.[0]?.type;
  return typeof type === 'object' && 'keyed_map' in type ? type.key : ['int', 'text', 'bytes'];
}

// GN-13: a value of a value type, {"kind": <value kind>, "value": ...}, as the value that the built-in form of the kind
// makes in the language: null, bool, int (a number, or its decimal text outside the safe integers), float, text,
// bytes, list, map, object and reference. The other kinds are refused by name until a case needs them (G-4).
// G-5: a reference, and an object with an id, is named by its id after its first place. Each id is made once without
// content, then filled, in an expression that names it: a closure in PHP, whose references are variables that the
// places take by reference, an assignment expression of a tuple in Python and an arrow function in Node and WASM, so
// every place of an id holds the same instance and a later place inside the first makes a cycle.
function valueFromJson(model: Model, ctx: Context, value: unknown, where: string, alias?: Unit, library?: string): string {
  const sort = typeof value === 'object' && value !== null && 'host' in value ? (value as { host: unknown }).host : undefined;
  if (typeof sort === 'string' && Object.hasOwn(HOST_VALUES, sort)) return HOST_VALUES[sort as keyof typeof HOST_VALUES][ctx.lang];
  const making: Making = { made: [], fills: [], references: new Set(), objects: new Set(), alias, ...(library === undefined ? {} : { library }) };
  const value_ = valueOf(model, ctx, value, where, making, false);
  if (making.made.length === 0 && making.fills.length === 0) return value_;
  if (ctx.lang === 'python') return `(${[...making.made, ...making.fills, value_].join(', ')})[-1]`;
  if (ctx.lang === 'node') return `(() => { ${[...making.made, ...making.fills].join(' ')} return ${value_}; })()`;
  return `(static function () { ${[...making.made, ...making.fills].join(' ')} return ${value_}; })()`;
}

// G-5: the closed table of the values of a language that are no value of a value type, {"host": <sort>}: the value
// that each language makes for a sort. WASM takes the value of Node, and Go has its column in tests_go.ts
// (GO_HOST_VALUES). A Python test that makes a date imports datetime.
export const HOST_VALUES = {
  callable: { python: 'lambda: None', node: '() => null', php: 'static fn (): null => null' },
  date: { python: 'datetime.date(1970, 1, 1)', node: 'new Date(0)', php: "new \\DateTimeImmutable('@0')" },
  object: { python: 'object()', node: 'new (class Other {})()', php: 'new class {}' },
} as const satisfies Record<string, Record<Lang3, string>>;

// GN-13v: whether the PHP in rows of a value alias read an empty array, whose keys are sequence keys, as a list, and
// whether they read a stdClass as a map.
type PhpCase = { kind?: string; when?: { predicate?: string; is?: boolean } };
const phpRow = (alias: Unit, form: string): PhpCase[] | undefined => ((alias.in ?? []) as { php?: string; cases?: PhpCase[] }[]).find((row) => row.php === form)?.cases;
const emptyArrayIsList = (alias: Unit): boolean => (phpRow(alias, 'array') ?? []).some((c) => c.kind === 'list' && (c.when === undefined || (c.when.predicate === 'sequence_keys' && c.when.is === true)));
const stdClassIsMap = (alias: Unit): boolean => (phpRow(alias, 'stdClass') ?? []).some((c) => c.kind === 'map' && c.when === undefined);

// GN-13: what a case value makes before it is returned: the instances of its ids, in the order of their first places,
// the statements that fill them, in the order in which their first places end, and the ids that a place named.
interface Making {
  made: string[];
  fills: string[];
  references: Set<number>;
  objects: Set<number>;
  // GN-13: the value alias of the case value, whose out rows name the form of a float.
  alias: Unit | undefined;
  // GN-6ar: the library that owns the alias of the value, when it is another repository: an object and a reference
  // are then instances of the classes of that repository, which the test names through the package of the owner.
  library?: string;
}

// The id of a reference or of an object of a case value (G-5).
function idOf(raw: unknown, where: string): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) throw new Error(`an id of ${where} is a number of at least 0, not ${shown(raw)}`);
  return raw;
}

// GN-13: a value of valueFromJson, and slot says whether the value is the value of a place of an array or of a
// property, the one place where PHP holds a reference.
function valueOf(model: Model, ctx: Context, value: unknown, where: string, making: Making, slot: boolean): string {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const kind = record?.['kind'];
  if (record === undefined || typeof kind !== 'string') throw new Unsupported(`a case value of ${where} is {"kind": <value kind>, "value": ...}, not ${shown(value)}`);
  const held = record['value'];
  const lang = ctx.lang;
  const keyOf = (key: unknown): string => caseKey(key, (keyKind, raw) => (keyKind === 'int' ? intKey(lang, raw) : fromJson(model, ctx, keyKind, raw)));
  const fieldOf = (cls: KeptClass): string => langName(lang === 'python' ? 'python' : 'node', cls.fields[0]?.name ?? [], 'variable');
  // GN-6af, GN-6ar: the class that keeps the content, of this contract or of the owner of the alias, and its name in
  // the test: through pkg, or through the package of the owner.
  const keptClass = (holds: 'entries' | 'value'): KeptClass => keptOf(making.library === undefined ? model : ownerModel(model, making.library), holds, where);
  const classOf = (cls: KeptClass): string => {
    if (making.library === undefined) return `pkg.${langName(lang === 'python' ? 'python' : 'node', cls.unit.name, 'class')}`;
    if (ctx.foreignClass === undefined) throw new Unsupported(`a case value of ${where} is an instance of the class ${cls.unit.id} of ${making.library}, which this target does not name in a test (GN-6ar)`);
    return ctx.foreignClass(making.library, cls.unit);
  };
  if (kind === 'null') return lang === 'python' ? 'None' : 'null';
  if (kind === 'bool') return fromJson(model, ctx, 'bool', held);
  if (kind === 'text') {
    if (caseTextParts(held) !== undefined) throw new Unsupported('a composed case text is not an alias-text value (GN-13l)');
    return fromJson(model, ctx, 'text', held);
  }
  if (kind === 'bytes') return fromJson(model, ctx, 'bytes', held);
  if (kind === 'float') {
    const float = fromJson(model, ctx, 'float', held);
    // GN-13: a float that the out row of its alias gives as an instance of a value class (a Node integral float, which a
    // number would give as an int) is that instance, the form that the binding gives and takes back as the float.
    const form = making.alias !== undefined && lang !== 'php' && (making.alias.out ?? []).some((row) => row.kind === 'float') ? aliasOutForm(making.alias, ctx.target ?? lang, 'float', record) : undefined;
    const cls = typeof form === 'string' && form.endsWith('.constructor') ? model.contract.units.find((u) => `${u.id}.constructor` === form) : undefined;
    if (cls !== undefined) return lang === 'python' ? `pkg.${langName('python', cls.name, 'class')}(float(${float}))` : `new pkg.${langName('node', cls.name, 'class')}(${float})`;
    return lang === 'python' ? `float(${float})` : lang === 'php' ? `(float) ${float}` : float;
  }
  if (kind === 'int') {
    const token = typeof held === 'number' && Number.isSafeInteger(held) ? String(held) : typeof held === 'bigint' ? String(held) : typeof held === 'string' && /^-?(0|[1-9][0-9]*)$/.test(held) ? held : undefined;
    if (token === undefined) throw new Unsupported(`a case value of the kind int of ${where} is a safe integer or a decimal text, not ${shown(held)}`);
    if (typeof held === 'number' || lang === 'python') return token;
    if (lang === 'node') return `${token}n`;
    const wide = BigInt(token);
    if (wide < -(2n ** 63n) || wide >= 2n ** 63n) throw new Unsupported(`a case value of ${where}: the int ${token} is outside the int of PHP (G-5)`);
    return phpInt(token);
  }
  // G-5: {"kind": "list", "repeat": n, "value": <value>} is n lists, each the one item of the one around it, the
  // innermost holding the value; the test makes them in a loop, as a value nested deeper than a JSON reader takes.
  if (kind === 'list' && record['repeat'] !== undefined) {
    const repeat = record['repeat'];
    if (typeof repeat !== 'number' || !Number.isSafeInteger(repeat) || repeat < 1 || Object.keys(record).length !== 3) throw new Unsupported(`a case value of ${where} is {"kind": "list", "repeat": <n of at least 1>, "value": <value>}, not ${shown(value)}`);
    const inner = valueOf(model, ctx, held, where, making, false);
    if (lang === 'python') return `__import__("functools").reduce(lambda inner, _: [inner], range(${repeat}), ${inner})`;
    if (lang === 'node') return `Array.from({ length: ${repeat} }).reduce((inner) => [inner], ${inner})`;
    return `array_reduce(array_fill(0, ${repeat}, null), fn ($inner) => [$inner], ${inner})`;
  }
  if (kind === 'list' && Array.isArray(held)) return `[${held.map((item) => valueOf(model, ctx, item, where, making, true)).join(', ')}]`;
  if (kind === 'map' && Array.isArray(held)) {
    const entries = (held as [unknown, unknown][]).map(([key, item]) => {
      const k = keyOf(key);
      const v = valueOf(model, ctx, item, where, making, true);
      return lang === 'python' ? `${k}: ${v}` : lang === 'php' ? `${k} => ${v}` : `[${k}, ${v}]`;
    });
    // GN-13v: an empty PHP array has sequence keys, so a value alias whose in rows read such an array as a list takes
    // an empty map as the stdClass that a row reads as a map.
    if (lang === 'php' && entries.length === 0 && making.alias !== undefined && emptyArrayIsList(making.alias) && stdClassIsMap(making.alias)) return 'new \\stdClass()';
    return { python: `{${entries.join(', ')}}`, node: `new Map([${entries.join(', ')}])`, php: `[${entries.join(', ')}]` }[lang];
  }
  // GN-6af: an object is an instance of the value class that keeps a keyed map, and a reference one of the class that
  // keeps one value; PHP takes its own stdClass and its own references, the places that take a variable by reference.
  if (kind === 'object') {
    const cls = lang === 'php' ? undefined : keptClass('entries');
    const empty = cls === undefined ? 'new \\stdClass()' : lang === 'python' ? `${classOf(cls)}({})` : `new ${classOf(cls)}(new Map())`;
    const field = cls === undefined ? '' : fieldOf(cls);
    // G-5: n objects, each the one property key of the one around it; Python, Node and WASM make them from the
    // outermost in and fill each after it is made, so no constructor judges the objects inside it again.
    if (record['repeat'] !== undefined) {
      const repeat = record['repeat'];
      if (typeof repeat !== 'number' || !Number.isSafeInteger(repeat) || repeat < 1 || Object.keys(record).length !== 4 || !('key' in record)) throw new Error(`a case value of ${where} is {"kind": "object", "repeat": <n of at least 1>, "key": <key>, "value": <value>}, not ${shown(value)}`);
      const k = keyOf(record['key']);
      const inner = valueOf(model, ctx, held, where, making, true);
      if (lang === 'python') return `(lambda top: (lambda at: ([at.__setitem__(0, at[0].${field}.setdefault(${k}, ${empty})) for _ in range(${repeat - 1})], at[0].${field}.__setitem__(${k}, ${inner}), top)[-1])([top]))(${empty})`;
      if (lang === 'node') return `(() => { const top = ${empty}; let at = top; for (let i = 1; i < ${repeat}; i += 1) { const next = ${empty}; at.${field}.set(${k}, next); at = next; } at.${field}.set(${k}, ${inner}); return top; })()`;
      return `array_reduce(array_fill(0, ${repeat}, null), fn ($inner) => (object) [${k} => $inner], ${inner})`;
    }
    const name = (id: number): string => (lang === 'php' ? `$o${id}` : `o${id}`);
    if (record['id'] !== undefined) {
      const id = idOf(record['id'], where);
      if (!('value' in record)) {
        if (!making.objects.has(id)) throw new Error(`a case value of ${where} names the object ${id} before its first place (G-5)`);
        return name(id);
      }
      if (making.objects.has(id)) throw new Error(`a case value of ${where} gives the value of the object ${id} at two places (G-5)`);
      making.objects.add(id);
      making.made.push(lang === 'python' ? `o${id} := ${empty}` : lang === 'node' ? `const o${id} = ${empty};` : `$o${id} = ${empty};`);
      if (!Array.isArray(held)) throw new Error(`a case value of ${where} is an object of [key, value] pairs, not ${shown(held)}`);
      for (const [key, item] of held as [unknown, unknown][]) {
        const k = keyOf(key);
        const v = valueOf(model, ctx, item, where, making, true);
        making.fills.push(lang === 'python' ? `o${id}.${field}.__setitem__(${k}, ${v})` : lang === 'node' ? `o${id}.${field}.set(${k}, ${v});` : `$o${id}->{${k}} = ${v};`);
      }
      return name(id);
    }
    if (!Array.isArray(held)) throw new Error(`a case value of ${where} is an object of [key, value] pairs, not ${shown(held)}`);
    const entries = (held as [unknown, unknown][]).map(([key, item]) => {
      const k = keyOf(key);
      const v = valueOf(model, ctx, item, where, making, true);
      return lang === 'python' ? `${k}: ${v}` : lang === 'php' ? `${k} => ${v}` : `[${k}, ${v}]`;
    });
    if (cls === undefined) return `(object) [${entries.join(', ')}]`;
    return lang === 'python' ? `${classOf(cls)}({${entries.join(', ')}})` : `new ${classOf(cls)}(new Map([${entries.join(', ')}]))`;
  }
  if (kind === 'reference' && typeof held === 'object' && held !== null && !Array.isArray(held)) {
    const ref = held as Record<string, unknown>;
    const id = idOf(ref['id'], where);
    if (lang === 'php' && !slot) throw new CaseRefused(`a case value of ${where} holds a reference that is no place of an array or of a property, which PHP has no form of: a PHP reference is such a place (GN-13)`);
    const name = lang === 'php' ? `&$r${id}` : `r${id}`;
    if (!('value' in ref)) {
      if (!making.references.has(id)) throw new Error(`a case value of ${where} names the reference ${id} before its first place (G-5)`);
      return name;
    }
    if (making.references.has(id)) throw new Error(`a case value of ${where} gives the value of the reference ${id} at two places (G-5)`);
    making.references.add(id);
    if (lang === 'php') {
      making.fills.push(`$r${id} = ${valueOf(model, ctx, ref['value'], where, making, false)};`);
      return name;
    }
    const cls = keptClass('value');
    const field = fieldOf(cls);
    making.made.push(lang === 'python' ? `r${id} := ${classOf(cls)}()` : `const r${id} = new ${classOf(cls)}();`);
    const inner = valueOf(model, ctx, ref['value'], where, making, false);
    making.fills.push(lang === 'python' ? `setattr(r${id}, ${pyString(field)}, ${inner})` : `r${id}.${field} = ${inner};`);
    return name;
  }
  throw new Unsupported(`a case value of the kind ${kind} of ${where} is not generated yet (GN-13)`);
}

// G-5: an integer key of a case value: a safe integer as a number, a decimal text outside them as a bigint of
// JavaScript and as the integer of Python and PHP.
function intKey(lang: Lang3, raw: unknown): string {
  if (typeof raw === 'number') return String(raw);
  return lang === 'node' ? `${String(raw)}n` : lang === 'php' ? phpInt(String(raw)) : String(raw);
}

// T-1, B2.464: an integer of a case as PHP writes it. PHP reads -9223372036854775808 as the negation of the float
// 9223372036854775808, so the least int64 is \PHP_INT_MIN, at every place where the emitter writes an integer.
export function phpInt(token: string): string {
  return token === '-9223372036854775808' ? '\\PHP_INT_MIN' : token;
}

// GN-6af: the value class without core_type that keeps the content of a case value: a keyed map (an object) or one value
// (a reference).
export function keptOf(model: Model, holds: 'entries' | 'value', where: string): KeptClass {
  const found = model.kept.filter((k) => {
    const [field, ...more] = k.fields;
    if (field === undefined || more.length > 0) return false;
    return holds === 'entries' ? typeof field.type === 'object' && 'keyed_map' in field.type : typeof field.type === 'object' && 'unit' in field.type;
  });
  const [only] = found;
  if (only === undefined || found.length > 1) throw new Unsupported(`a case value of ${where}: ${found.length} value classes keep ${holds === 'entries' ? 'a keyed map' : 'one value'} (GN-6af)`);
  return only;
}

// The arguments of a call in the form of each language: positional parameters, then the record's fields as Python
// keywords, PHP named arguments or one Node options object (T-4).
// U-2: an argument whose value is undefined is left out: a positional one after it goes by its name in Python and PHP,
// and Node passes undefined in its place; a field is no member of the options record.
export function callArgs(model: Model, ctx: Context, fn: Fn, value: (arg: Arg) => string | undefined, extra?: string): string {
  const make = (): string => callArgsForm(model, ctx, fn, value, extra);
  return ctx.caseTextExpression === undefined ? make() : ctx.caseTextExpression(make);
}

function callArgsForm(model: Model, ctx: Context, fn: Fn, value: (arg: Arg) => string | undefined, extra?: string): string {
  const name = (a: Arg, text: string): string => `${langName(ctx.lang, a.name, 'variable')}${ctx.lang === 'python' ? '=' : ': '}${text}`;
  const positional: string[] = [];
  let skipped = false;
  for (const arg of fn.args.filter((a) => !a.field)) {
    const text = value(arg);
    if (text === undefined) {
      skipped = true;
      if (ctx.lang === 'node') positional.push('undefined');
    } else {
      positional.push(skipped && ctx.lang !== 'node' ? name(arg, text) : text);
    }
  }
  // U-2: only a trailing argument is missing; an argument left out before one that is given is undefined.
  const trailing = (): string[] => {
    const given = [...positional];
    while (ctx.lang === 'node' && given.at(-1) === 'undefined') given.pop();
    return given;
  };
  const fields = fn.args.filter((a) => a.field).flatMap((a) => {
    const text = value(a);
    return text === undefined ? [] : [{ arg: a, text }];
  });
  const tail = extra === undefined ? [] : [extra];
  if (fn.record === undefined) return [...trailing(), ...tail].join(', ');
  if (ctx.lang === 'node') {
    const object = fields.map((f) => `${langName('node', f.arg.name, 'variable')}: ${f.text}`).join(', ');
    // U-2 {empty: "object"}: a record without a field that is given is left out, when it may be.
    if (object === '' && fn.record.param.default !== undefined) return [...trailing(), ...tail].join(', ');
    return [...positional, ...tail, object === '' ? '{}' : `{ ${object} }`].join(', ');
  }
  return [...positional, ...tail, ...fields.map((f) => name(f.arg, f.text))].join(', ');
}

// The value of an argument in a case: undefined when the case leaves an argument with a default out (U-2).
export function caseValue(model: Model, ctx: Context, arg: Arg, args: ReadonlyMap<Arg, unknown>): string | undefined {
  if (arg.default !== undefined && !args.has(arg)) return undefined;
  return fromJson(model, ctx, arg.type, args.get(arg) ?? null);
}

// Whether the language compares two results of the type by their values: a class instance holds a core value, which
// only its members show, and a return of none shows nothing.
function comparable(model: Model, type: Type, seen: Set<string> = new Set()): boolean {
  if (type === 'none' || type === 'never') return false;
  if (typeof type === 'string') return true;
  if ('list' in type) return comparable(model, type.list, seen);
  if ('optional' in type) return comparable(model, type.optional, seen);
  if ('map' in type) return comparable(model, type.map, seen);
  if ('keyed_map' in type) return comparable(model, type.keyed_map, seen);
  if ('tuple' in type) return type.tuple.every((t) => comparable(model, t, seen));
  if ('unit' in type) {
    if (objectUnit(model, type) !== undefined) return false;
    const unit = unitOf(model, type);
    // A record or a variant that holds itself is compared as far as it is not compared already.
    if (unit === undefined || seen.has(unit.id)) return true;
    seen.add(unit.id);
    if (unit.kind === 'variant') return (unit.cases ?? []).every((c) => c.fields.every((f) => comparable(model, f.type, seen)));
    return unit.kind !== 'record' || (unit.fields ?? []).every((f) => comparable(model, f.type, seen));
  }
  return false;
}

// GN-6v: a value of a case in the form of the language.
// GN-6v: the value of a field that a case value of an input leaves out, which Python and JavaScript leave out of the
// value they make, and PHP gives as null at its place in the constructor.
const LEFT_OUT = '\u0000left out';
const leftOutFields = (ctx: Context, unit: Unit, fields: string[]): { unit: Unit; values: string[] } => {
  const all = unit.fields ?? [];
  const kept = ctx.lang === 'php' ? all : all.filter((_f, i) => fields[i] !== LEFT_OUT);
  const values = ctx.lang === 'php' ? fields.map((v) => (v === LEFT_OUT ? 'null' : v)) : fields.filter((v) => v !== LEFT_OUT);
  // The unit itself when no field is left out: a test names a record of another repository by the identity of its unit.
  return { unit: kept.length === all.length ? unit : { ...unit, fields: kept }, values };
};
const caseNew = (ctx: Context, variant: Variant, kase: VariantCase, fields: string[]): string => {
  const { unit, values } = leftOutFields(ctx, kase.unit, fields);
  return ctx.variantNew === undefined ? ctx.recordNew(unit, values) : ctx.variantNew(variant, { ...kase, unit }, values);
};
// GN-6a: a value of a record of the result form, whose fields that a case value of an input leaves out are left out as
// those of a case are.
const leftOutNew = (ctx: Context, record: Unit, fields: string[]): string => {
  const { unit, values } = leftOutFields(ctx, record, fields);
  return ctx.recordNew(unit, values);
};

// G-5: two calls of a member whose results the generated test requires to be the same (the outcome is the result, or
// the class and kind of the failure): for each argument with a {literal}, {const} or {empty} default, the call that
// leaves it out and the call that gives its default (U-2); for each source parameter, the call with a text and the
// call with its UTF-8 bytes (T-1; PHP has one string). The other arguments are those of the first case of the member
// that does not raise, or placeholders. A member whose result the language cannot compare, or that takes a callback,
// has no such test (GN-13a).
export interface SamePair {
  rule: 'U-2' | 'T-1';
  arg: Arg;
  left: (arg: Arg) => string | undefined;
  right: (arg: Arg) => string | undefined;
  // GN-13d: the rule id of a {computed} default, whose two calls, without the argument and with null, are compared by
  // their outcome alone (both without a failure, or the same class and kind of failure) and by no value.
  computed?: string;
}

export function samePairs(model: Model, ctx: Context, fn: Fn): SamePair[] {
  if (!comparable(model, fn.returns) || callbackArg(model, fn) !== undefined || fn.special !== undefined) return [];
  let given: Map<Arg, unknown> | undefined;
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    // GN-13j: the test runs no lines of a case, so it takes no case that runs against a service.
    if (record['raises'] !== undefined || servesCase(record)) continue;
    given = argsOf(fn, record);
    if (given !== undefined) break;
  }
  const other = (arg: Arg): string | undefined => (given === undefined ? placeholder(model, ctx, arg.type) : caseValue(model, ctx, arg, given));
  const pairs: SamePair[] = [];
  for (const arg of fn.args) {
    const declared = defaultCaseValue(model, arg);
    if (declared !== undefined) {
      const explicit = fromJson(model, ctx, arg.type, declared.value);
      pairs.push({ rule: 'U-2', arg, left: (a) => (a === arg ? undefined : other(a)), right: (a) => (a === arg ? explicit : other(a)) });
    }
    const computed = computedRule(arg);
    if (computed !== undefined) {
      const absent = fromJson(model, ctx, arg.type, null);
      pairs.push({ rule: 'U-2', arg, left: (a) => (a === arg ? undefined : other(a)), right: (a) => (a === arg ? absent : other(a)), computed });
    }
    const base = typeof arg.type === 'object' && 'optional' in arg.type ? arg.type.optional : arg.type;
    if (base === 'source' && ctx.lang !== 'php') {
      const text = fromJson(model, ctx, 'source', 'a\u00e9');
      const bytes = fromJson(model, ctx, 'source', { hex: '61c3a9' });
      pairs.push({ rule: 'T-1', arg, left: (a) => (a === arg ? text : other(a)), right: (a) => (a === arg ? bytes : other(a)) });
    }
  }
  return pairs;
}

// T-1, T-7: the base type of a parameter that takes bytes: bytes, or a source, which takes a text too.
// GN-6y: whether a parameter or a field is a path, also an optional one.
export const isPath = (type: Type): boolean => (typeof type === 'object' && 'optional' in type ? type.optional : type) === 'path';

export const bytesKind = (type: Type): 'bytes' | 'source' | undefined => {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  return base === 'bytes' || base === 'source' ? base : undefined;
};

// The cases of the contract that make a member raise, with the arguments the case gives (K-1).
export interface RaisingCase {
  id: string;
  args: Map<Arg, unknown>;
  raises: { kind: string; status?: number | null; category: string; errno?: unknown };
  // G-5: the faults that the case arms before its call, as the JSON text that the arming entry point takes.
  faults?: string;
  // GN-13i: the files of the case as the case gives them, which caseRefusal judges and caseFilesOf reads.
  files?: unknown;
  // GN-13r: the listener of the case, which caseRefusal judges and caseListenerOf reads.
  listener?: unknown;
  // GN-13j: the service of the case, which caseRefusal judges and serviceSteps reads.
  service?: unknown;
  // The instance that a method or property is called on, made by a static member or the constructor (T-5).
  receiver?: Receiver;
  // GN-6ae: the calls that observe the receiver after the call of the case.
  after?: After[];
  // GN-13f: the factory that makes the receiver from the keys of the case raises the kind that the case expects, so the
  // failure of the case is the failure of making the receiver or of the call; never with faults or after.
  receiverFails?: true;
}

// GN-13f: whether the factory of a receiver that the keys of a case give may raise the kind of the case: a variant of
// its raises whose row of errors.kinds gives that kind. A receiver of an instance value is made by its own steps.
function receiverMayRaise(model: Model, receiver: Receiver | undefined, record: Record<string, unknown>, kind: string): boolean {
  if (receiver === undefined || record['receiver'] !== undefined || receiver.on !== undefined || receiver.pick !== undefined || receiver.then !== undefined) return false;
  const raises = receiver.factory.member.raises ?? [];
  return model.contract.errors.kinds.some((row) => row.library === undefined && raises.includes(row.variant) && kindsOf(row).includes(kind));
}

// GN-6ae (CK-22): a call of `after` of a case: a method of the class of the receiver, its arguments and its result.
export interface After {
  fn: Fn;
  args: Map<Arg, unknown>;
  result: unknown;
  // GN-13o: the name of an argument that a function fixture of the case kept, on which the call is made after the
  // function returned, in place of the receiver of the case.
  on?: string;
  // GN-13o: the kind that the call fails with, in place of a result.
  raises?: string;
}

// The callables whose tests are generated: the functions, then the members of each class unit.
// An iterate has no arguments to test; it is iterated in the round trip of GN-13a. A stringify and a to_json are
// called by the name of the language's hook (N-4, memberName).
// GN-13: the members that the tests call, those of a value class without core_type (GN-6af) among them.
export const callables = (model: Model): Fn[] => [...model.functions, ...model.objects.flatMap((o) => o.members.filter((fn) => fn.kind !== 'iterate')), ...model.kept.flatMap((k) => k.members)];

// The members of the class of a member: a class unit or a value class without core_type.
const classMembers = (model: Model, unit: Unit): Fn[] => model.objects.find((o) => o.unit === unit)?.members ?? model.kept.find((k) => k.unit === unit)?.members ?? [];

export interface Receiver {
  factory: Fn;
  args: Map<Arg, unknown>;
  // GN-13p: the test keeps the receiver under the name receiver, which a step of a function fixture calls on.
  bound?: true;
  // GN-13pa: the instance values that the case names under with, which the test makes after the receiver, in the
  // order of the case, and keeps under their names for the steps of its function fixtures and its calls of after.
  with?: { name: string; receiver: Receiver }[];
  // G-5 (GN-13f): the instance value of a case. The instance that the factory is called on when it is a method, the
  // steps into its result when the result holds the instance (from), and the calls on the instance that prepare it.
  on?: Receiver;
  pick?: Pick[];
  // A call of then may fail with a kind, which the test requires before the next step; it may arm faults for itself
  // alone, as the JSON text that the arming entry point takes, and with on: receiver it calls the receiver of the value.
  // GN-13j: a call of then may change the state of the service of the case after it.
  // GN-13q: and it may step the peer of that service after it.
  then?: { fn: Fn; args: Map<Arg, unknown>; raises?: string; faults?: string; on?: 'receiver'; service?: ServiceChange; peer?: ServiceChange }[];
}

// GN-13f: whether a receiver, or a receiver that it is made on, has a call of then that arms faults.
export const armsFaults = (receiver: Receiver | undefined): boolean =>
  receiver !== undefined && ((receiver.then ?? []).some((step) => step.faults !== undefined) || armsFaults(receiver.on));

// G-5 (GN-13f): a step into a result: a field of a record, an item of a list, a part of a tuple, the value of an
// optional (present names the type of that value).
export type Pick = { field: string } | { index: number } | { tuple: number } | { present: Type };

// Whether a receiver is one factory call, which a test writes as one expression.
export const isPlain = (receiver: Receiver): boolean =>
  receiver.on === undefined && (receiver.pick ?? []).length === 0 && (receiver.then ?? []).length === 0 && ![...receiver.args.values()].some(isInstanceValue);

// G-5 (GN-13f): whether a case value is an instance value, {"new": ...} or {"from": ...}.
export const isInstanceValue = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && (typeof (value as Record<string, unknown>)['new'] === 'string' || typeof (value as Record<string, unknown>)['from'] === 'string');

// Every member of the model by its id: the functions and the members of the class units.
export const memberById = (model: Model, id: string): Fn | undefined =>
  [...model.functions, ...model.objects.flatMap((o) => o.members)].find((fn) => fn.member.id === id);

// The type that the steps of a pick reach from a type, or a reason.
export function pickedType(model: Model, type: Type, pick: readonly unknown[]): Type | string {
  let at = type;
  for (const [i, step] of pick.entries()) {
    const what = `step ${i} of pick`;
    if (step === '?') {
      if (typeof at !== 'object' || !('optional' in at)) return `${what} takes the value of ${shown(at)}, which is no optional`;
      at = at.optional;
      continue;
    }
    if (typeof at === 'object' && 'optional' in at) return `${what} reads an optional, which only the step "?" steps into`;
    if (typeof step === 'string') {
      const unit = unitOf(model, at);
      const field = unit?.kind === 'record' ? (unit.fields ?? []).find((f) => caseName(f.name) === step) : undefined;
      if (field === undefined) return `${what} names the field ${step}, which ${shown(at)} has not`;
      at = field.type;
      continue;
    }
    const record = typeof step === 'object' && step !== null && !Array.isArray(step) ? (step as Record<string, unknown>) : {};
    const n = record['index'] ?? record['tuple'];
    if (Object.keys(record).length !== 1 || typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return `${what} is not a field name, {"index": n} or {"tuple": n}`;
    if ('index' in record) {
      if (typeof at !== 'object' || !('list' in at)) return `${what} takes an item of ${shown(at)}, which is no list`;
      at = at.list;
    } else {
      if (typeof at !== 'object' || !('tuple' in at) || n >= at.tuple.length) return `${what} takes part ${n} of ${shown(at)}, which is no tuple of that length`;
      at = at.tuple[n] ?? 'none';
    }
  }
  return at;
}

// GN-13f: the type of the value of the optional that the steps before a step "?" reach.
function presentType(model: Model, type: Type, before: readonly unknown[]): Type {
  const at = pickedType(model, type, before);
  return typeof at === 'object' && 'optional' in at ? at.optional : 'none';
}

// G-5 (GN-13f): the instance of the class unit `unitId` that an instance value gives:
//   {"new": "<member id>", "receiver": <instance value>?, "args": {...}, "then": [{"call": "<member id>", "args": {...}}]}
//   {"from": "<member id>", "receiver": <instance value>?, "args": {...}, "pick": [<step>], "then": [...]}
// new names a member that returns the class; from a member whose result holds it, which pick reaches. receiver is
// the instance that the member is called on, when it is a method. Each call of then is a member of the class, called
// on the instance in order. The binding check reports every value that breaks this (CK-22); here it is an error.
// GN-13f, GN-6w: the instance of an instance value at the place of a callback, of the class that implements the
// callback interface and that the factory of the value makes.
export function implementerInstance(model: Model, callback: Unit, value: unknown): Receiver {
  const where = `a case value of ${callback.id}`;
  const implementer = model.objects.find((o) => (o.unit.implements ?? []).some((ref) => ref.library === undefined && ref.unit === callback.id) && (() => {
    try {
      instanceOf(model, o.unit.id, value, where);
      return true;
    } catch {
      return false;
    }
  })());
  if (implementer === undefined) throw new Error(`${where} is an instance value of no class that implements it (GN-13f, GN-6w)`);
  return instanceOf(model, implementer.unit.id, value, where);
}

// GN-6s, GN-13f: the model of the contract of another repository, whose members an instance value at a place of a
// callback unit of that repository names; each of its members names the library, so a test calls it through the
// package of that library. GN-6ar: it also gives the value classes without core_type of the owner of a value alias,
// whose instances a case value of that alias holds.
const ownerModels = new WeakMap<Contract, Model>();
export function ownerModel(model: Model, library: string): Model {
  const owner = model.foreign.get(library);
  if (owner === undefined) throw new Unsupported(`the contract of ${library} is not given (GN-6s, GN-13f)`);
  const kept = ownerModels.get(owner);
  if (kept !== undefined) return kept;
  let built: Model;
  try {
    built = buildModel(owner, '0.0.0', owner.library, new Map(), model.foreign);
  } catch (error) {
    throw new Unsupported(`the contract of ${library} gives no members to a case: ${error instanceof Error ? error.message : String(error)} (GN-6s, GN-13f)`);
  }
  for (const fn of [...built.functions, ...built.objects.flatMap((o) => o.members)]) fn.library = library;
  ownerModels.set(owner, built);
  return built;
}

// GN-13f, GN-6s: the instance of an instance value at a place of a callback unit: the class that its make member
// gives, a member of this contract or, when this contract has none of that id, of the owner of a callback unit of
// another repository, whose members take no unit, because the test reads a case value with this contract.
export function callbackInstance(model: Model, unit: Unit, library: string | undefined, value: unknown): Receiver {
  const where = `a case value of ${unit.id}`;
  const id = String((value as Record<string, unknown>)['new'] ?? (value as Record<string, unknown>)['from']);
  const of = (m: Model): string => {
    const made = memberById(m, id)?.returns;
    return typeof made === 'object' && 'unit' in made ? made.unit : unit.id;
  };
  if (library === undefined || memberById(model, id) !== undefined) return instanceOf(model, of(model), value, where);
  const owner = ownerModel(model, library);
  const receiver = instanceOf(owner, of(owner), value, where);
  const takesUnit = (type: unknown): boolean => typeof type === 'object' && type !== null && ('unit' in type || Object.values(type).some(takesUnit));
  const check = (r: Receiver): void => {
    for (const fn of [r.factory, ...(r.then ?? []).map((step) => step.fn)]) {
      if (fn.params.some((p) => takesUnit(p.type))) throw new Unsupported(`${where}: ${fn.member.id} of ${library} takes a unit, which a case value of this repository does not give (G-4, GN-6s, GN-13f)`);
    }
    if (r.on !== undefined) check(r.on);
  };
  check(receiver);
  return receiver;
}

// GN-13f, GN-6ap: the instance of an instance value at the place of a generated interface, of the first class of the
// target that implements the interface and that the factory of the value makes; a value that no such class makes is
// not written, which fails the test of its case by name (GN-13e).
export function interfaceInstance(model: Model, iface: Unit, value: unknown): Receiver {
  const where = `a case value of ${iface.id}`;
  for (const implementer of implementorsOf(model, iface)) {
    try {
      return instanceOf(model, implementer.unit.id, value, where);
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
    }
  }
  throw new Unsupported(`${where} is an instance value of no class of the target that implements it (G-5, GN-13f, GN-6ap)`);
}

export function instanceOf(model: Model, unitId: string, value: unknown, where: string): Receiver {
  const fail = (message: string): never => {
    throw new Unsupported(`${where}: ${message} (G-5, GN-13f)`);
  };
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail('an instance value is {"new" | "from": <member id>, ...}');
  const id = record['new'] ?? record['from'];
  const factory = typeof id === 'string' ? memberById(model, id) : undefined;
  if (factory === undefined) return fail(`${String(id)} is no member that the binding generates`);
  const pick = Array.isArray(record['pick']) ? record['pick'] : [];
  const reached = pickedType(model, factory.returns, 'from' in record ? pick : []);
  if (typeof reached === 'string') return fail(reached);
  if (typeof reached !== 'object' || !('unit' in reached) || reached.unit !== unitId || reached.library !== undefined) fail(`${factory.member.id} gives ${shown(reached)}, not the class ${unitId}`);
  const args = argsOf(factory, (record['args'] ?? {}) as Record<string, unknown>) ?? fail(`the args are not the parameters of ${factory.member.id}`);
  const on = factory.receiver === undefined ? undefined : instanceOf(model, factory.unit.id, record['receiver'] ?? fail(`${factory.member.id} is a method, so the value gives its receiver`), `${where}, the receiver of ${factory.member.id}`);
  const then = (Array.isArray(record['then']) ? record['then'] : []).map((item, i) => {
    const step = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const fn = typeof step['call'] === 'string' ? memberById(model, step['call']) : undefined;
    // on: receiver calls a method of the class of the receiver of the value, on that receiver.
    const onReceiver = step['on'] === 'receiver';
    if (step['on'] !== undefined && !onReceiver) return fail(`then ${i} calls on ${String(step['on'])}, but on names only receiver`);
    if (onReceiver && on === undefined) return fail(`then ${i} calls ${String(step['call'])} on its receiver, but ${factory.member.id} gives the value without one`);
    const callee = onReceiver ? factory.unit.id : unitId;
    if (fn === undefined || fn.unit.id !== callee || fn.receiver === undefined) return fail(`then ${i} calls ${String(step['call'])}, which is no method of ${callee}`);
    const faults = step['faults'];
    if (faults !== undefined && model.faults.length === 0) return fail(`then ${i} arms faults, but the contract names no fault injection point (G-5)`);
    const args = argsOf(fn, (step['args'] ?? {}) as Record<string, unknown>) ?? fail(`the args of then ${i} are not the parameters of ${fn.member.id}`);
    const kind = (step['raises'] as Record<string, unknown> | undefined)?.['kind'];
    if (step['raises'] !== undefined && typeof kind !== 'string') return fail(`then ${i} expects ${fn.member.id} to fail by {"kind": <kind>}`);
    const change = step['service'];
    if (change !== undefined && !(change instanceof ServiceChange)) return fail(`then ${i} changes the service by ${shown(change)}, which the generator does not read (GN-13j)`);
    const peer = step['peer'];
    if (peer !== undefined && !(peer instanceof ServiceChange)) return fail(`then ${i} steps the peer by ${shown(peer)}, which the generator does not read (GN-13q)`);
    return { fn, args, ...(typeof kind === 'string' ? { raises: kind } : {}), ...(faults === undefined ? {} : { faults: shown(faults) }), ...(onReceiver ? { on: 'receiver' as const } : {}), ...(change === undefined ? {} : { service: change }), ...(peer === undefined ? {} : { peer }) };
  });
  const picks = pick.map((step, i): Pick => (step === '?' ? { present: presentType(model, factory.returns, pick.slice(0, i)) } : typeof step === 'string' ? { field: step } : 'index' in (step as object) ? { index: (step as { index: number }).index } : { tuple: (step as { tuple: number }).tuple }));
  return { factory, args, ...(on === undefined ? {} : { on }), ...(picks.length === 0 ? {} : { pick: picks }), ...(then.length === 0 ? {} : { then }) };
}

// How a language writes the statements that make an instance (GN-13f).
export interface MadeForm {
  ctx: Context;
  invoke: (fn: Fn, args: string, receiver: string) => string;
  // The statement that binds a local name to an expression, and the name as an expression.
  bind: (name: string, expr: string) => string;
  name: (local: string) => string;
  // The statement that runs an expression for its effect.
  run: (expr: string) => string;
  // The statement that requires an expression to fail with a kind; `what` names the step in the message.
  fails: (expr: string, kind: string, what: string) => string;
  // The expression that steps into a value: a field (snake_case name), an item or a part of a tuple.
  pick: (expr: string, step: Pick) => string;
  // G-5: the statement that arms the faults (JSON text) for the next call of the member and binds the arming to a local,
  // and the statement that requires every fault of that arming to have fired; `what` names the step in the message.
  arm: (local: string, member: string, faults: string) => string;
  left: (local: string, what: string) => string;
  // GN-13u: the statement that closes an instance that the test made, at the end of the test and apart from its
  // assertions, by the cleanup member of its class (B-10); a target without it closes nothing.
  closing?: ((name: string, cleanup: Fn) => string) | undefined;
  // GN-13j: the statement that runs the program of the state of a service with a step, the scope and a JSON text.
  state?: (service: CaseService, state: string, step: 'setup' | 'change' | 'check', scope: string, value: string) => string;
  // GN-13q: the statement that writes the JSON text of a step to the peer of the scope and reads its line ready.
  peerNext?: (service: CaseService, scope: string, value: string) => string;
}

// GN-13f: the instance of an instance value at a place of a type: the class of the place, also inside an `optional`, or
// a class that implements the callback or the generated interface of the place (GN-6w, GN-6ap).
function instanceAt(model: Model, type: Type, value: unknown, where: string): Receiver {
  const inner = typeof type === 'object' && 'optional' in type ? type.optional : type;
  const unit = unitOf(model, inner);
  if (unit?.origin === 'callback' && libraryOf(inner) === undefined) return implementerInstance(model, unit, value);
  if (unit?.origin === 'callback') return callbackInstance(model, unit, libraryOf(inner), value);
  const iface = interfaceOf(model, inner);
  if (iface !== undefined) return interfaceInstance(model, iface, value);
  return instanceOf(model, unit?.id ?? '', value, where);
}

// G-5 (GN-13f): the statements that make an instance and the expression that names it. Every instance that the value
// makes, the receivers and the results that a pick reads from, is a local of the test, so none is reclaimed before the
// test ends; a plain receiver is one expression.
export function madeLines(model: Model, form: MadeForm, receiver: Receiver, prefix = 'made'): { lines: string[]; expr: string } {
  const lines: string[] = [];
  let count = 0;
  const fresh = (): string => `${prefix}${count++}`;
  const argsText = (fn: Fn, args: ReadonlyMap<Arg, unknown>): string =>
    callArgs(model, form.ctx, fn, (arg) => {
      const raw = args.get(arg);
      if (isInstanceValue(raw)) return make(instanceAt(model, arg.type, raw, `${fn.member.id}.${arg.name.join('_')}`));
      return caseValue(model, form.ctx, arg, args);
    });
  // GN-13u: an instance of a class with a cleanup member that the test made is closed at the end of the test.
  const closed = (local: string, fn: Fn, picked: boolean): void => {
    const cleanup = picked || form.closing === undefined ? undefined : objectUnit(model, fn.kind === 'constructor' ? { unit: fn.unit.id } : fn.returns)?.cleanup;
    if (cleanup !== undefined && form.closing !== undefined) lines.push(form.closing(form.name(local), cleanup));
  };
  const make = (r: Receiver): string => {
    if (isPlain(r)) {
      const local = fresh();
      lines.push(form.bind(local, form.invoke(r.factory, argsText(r.factory, r.args), '')));
      closed(local, r.factory, false);
      return form.name(local);
    }
    const on = r.on === undefined ? '' : make(r.on);
    let expr = form.invoke(r.factory, argsText(r.factory, r.args), on);
    const onName = on;
    for (const step of r.pick ?? []) {
      const local = fresh();
      lines.push(form.bind(local, expr));
      expr = form.pick(form.name(local), step);
    }
    const local = fresh();
    lines.push(form.bind(local, expr));
    closed(local, r.factory, (r.pick ?? []).length > 0);
    for (const [i, step] of (r.then ?? []).entries()) {
      const call = form.invoke(step.fn, argsText(step.fn, step.args), step.on === 'receiver' ? onName : form.name(local));
      // G-5: the faults of the call are armed for its member just before it, and every one must have fired after it.
      const armed = step.faults === undefined ? undefined : fresh();
      if (armed !== undefined && step.faults !== undefined) lines.push(form.arm(armed, step.fn.member.id, step.faults));
      lines.push(step.raises === undefined ? form.run(call) : form.fails(call, step.raises, `then ${i} fails with ${step.raises}`));
      if (armed !== undefined) lines.push(form.left(armed, `the faults of then ${i} fire`));
      // GN-13j: the call leaves the state of the service to the program, as another client of the service would.
      if (step.service !== undefined) {
        const target = form.ctx.target ?? form.ctx.lang;
        const change = serviceChangeOf(step.service, target);
        if (form.state === undefined) throw new Unsupported(`the state of a service is not generated for ${target} (GN-13j)`);
        lines.push(form.state(change.service, change.state, 'change', change.service.scope(target), change.value));
      }
      // GN-13q: the call is followed by the next step of the peer, which runs while the receiver holds its state.
      if (step.peer !== undefined) {
        const target = form.ctx.target ?? form.ctx.lang;
        const next = servicePeerOf(step.peer, target);
        if (form.peerNext === undefined) throw new Unsupported(`the peer of a service is not generated for ${target} (GN-13q)`);
        lines.push(form.peerNext(next.service, next.service.scope(target), next.value));
      }
    }
    return form.name(local);
  };
  const expr = isPlain(receiver) && receiver.with === undefined ? form.invoke(receiver.factory, argsText(receiver.factory, receiver.args), '') : make(receiver);
  // GN-13p: a receiver that a step of a function fixture calls on is kept under the name receiver.
  if (receiver.bound !== true && receiver.with === undefined) return { lines, expr };
  const { boundSet, boundValue } = form.ctx;
  if (boundSet === undefined || boundValue === undefined) throw new Unsupported(`a step of a function fixture calls on the receiver of the case or on a value of its with, which ${form.ctx.target ?? form.ctx.lang} does not keep yet (GN-13p, GN-13pa)`);
  if (receiver.bound === true) lines.push(boundSet('receiver', expr));
  // GN-13pa: each value of with is made after the receiver and kept under its name.
  for (const named of receiver.with ?? []) lines.push(boundSet(named.name, make(named.receiver)));
  return { lines, expr: receiver.bound === true ? boundValue('receiver') : expr };
}

// The arguments that a case gives to the parameters of a member, or undefined when a key is missing.
export function argsOf(fn: Fn, record: Record<string, unknown>): Map<Arg, unknown> | undefined {
  const args = new Map<Arg, unknown>();
  for (const arg of fn.args) {
    const snake = caseName(arg.name);
    const holderKey = arg.field && fn.record !== undefined ? caseName(fn.record.param.name) : undefined;
    // U-2 {empty: "object"}: a case without the key of a record that may be left out leaves out each of its fields.
    const holder = holderKey === undefined ? record : !(holderKey in record) && fn.record?.param.default !== undefined ? {} : record[holderKey];
    if (typeof holder !== 'object' || holder === null) return undefined;
    // U-2: a case that has no key of an argument with a default leaves it out.
    if (!(snake in holder)) {
      if (arg.default !== undefined) continue;
      return undefined;
    }
    args.set(arg, (holder as Record<string, unknown>)[snake]);
  }
  return args;
}

// GN-13f: the keys of a case that hold the arguments of a member: the key of each parameter, and the key of the record
// whose fields are its parameters.
function argumentKeys(fn: Fn): Set<string> {
  return new Set(fn.args.map((arg) => caseName(arg.field && fn.record !== undefined ? fn.record.param.name : arg.name)));
}

// T-5, GN-13f: the factory of a class unit whose parameters a case gives: a static member or the constructor that
// returns the class, the first in contract order. `of` is the member whose case the record is: a key of one of its
// parameters holds an argument of that member, so it gives no parameter of a factory; and a factory that takes no key
// of the case fits every case, so it is the factory only when no factory that takes a key is.
// GN-13p: whether a step of a function fixture of the value, at any depth, calls on the receiver of the case.
export const callsOnReceiver = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some(callsOnReceiver);
  const fixture = (value as { function?: { calls?: unknown } }).function;
  if (typeof fixture === 'object' && fixture !== null && Array.isArray(fixture.calls) && fixture.calls.some((step) => (step as { on?: unknown } | null)?.on === 'receiver')) return true;
  return Object.values(value).some(callsOnReceiver);
};

export function receiverOf(model: Model, fn: Fn, record: Record<string, unknown>, of: Fn = fn): Receiver | undefined {
  const made = receiverMade(model, fn, record, of);
  if (made === undefined || of !== fn) return made;
  // GN-13pa: the instance values that the case names under with.
  const named = withOf(model, fn, record);
  // GN-13p: the test keeps the receiver of a case whose function fixture calls on it.
  return { ...made, ...(callsOnReceiver(record) ? { bound: true as const } : {}), ...(named === undefined ? {} : { with: named }) };
}

// GN-13pa: the values of with of a case of a method, {"<name>": <instance value>}, each an instance of the class that
// the member of its new makes; undefined when the case has no with.
function withOf(model: Model, fn: Fn, record: Record<string, unknown>): { name: string; receiver: Receiver }[] | undefined {
  const given = record['with'];
  if (given === undefined) return undefined;
  const where = `the case ${String(record['id'])} of ${fn.member.id}`;
  if (typeof given !== 'object' || given === null || Array.isArray(given)) throw new Unsupported(`${where}: with is {"<name>": <instance value>} (GN-13pa)`);
  return Object.entries(given).map(([name, value]) => {
    const id = (value as { new?: unknown } | null)?.new;
    const factory = typeof id === 'string' ? memberById(model, id) : undefined;
    const returns = factory?.returns;
    const unitId = factory?.kind === 'constructor' ? factory.unit.id : typeof returns === 'object' && 'unit' in returns && returns.library === undefined ? returns.unit : '';
    return { name, receiver: instanceOf(model, unitId, value, `${where}, with ${name}`) };
  });
}

function receiverMade(model: Model, fn: Fn, record: Record<string, unknown>, of: Fn): Receiver | undefined {
  if (fn.receiver === undefined) return undefined;
  // GN-13f: a case that gives its receiver as an instance value.
  if (record['receiver'] !== undefined) return instanceOf(model, fn.unit.id, record['receiver'], `the case ${String(record['id'])} of ${fn.member.id}`);
  const taken = argumentKeys(of);
  const given = Object.fromEntries(Object.entries(record).filter(([key]) => !taken.has(key)));
  let bare: Receiver | undefined;
  for (const factory of classMembers(model, fn.unit)) {
    const returns = factory.returns;
    const makes = typeof returns === 'object' && 'unit' in returns && returns.unit === fn.unit.id && returns.library === undefined;
    if (factory.receiver !== undefined || !makes) continue;
    // A case of the factory itself gives the arguments of the factory.
    const args = argsOf(factory, factory === of ? record : given);
    if (args === undefined) continue;
    if (args.size > 0) return { factory, args };
    bare ??= { factory, args };
  }
  return bare;
}

// An instance for the tests of a method that need any valid receiver: the factory arguments of the first case of the
// class's members that does not raise.
export function sampleReceiver(model: Model, fn: Fn): Receiver | undefined {
  for (const member of classMembers(model, fn.unit)) {
    for (const kase of model.cases.get(member.member.id) ?? []) {
      const record = kase as Record<string, unknown>;
      // GN-13i: a test that needs any receiver writes no files, so it takes none of a case that gives files.
      // GN-13j: nor of a case that runs against a service, whose lines it does not run.
      if (record['raises'] !== undefined || record[CASE_FILES] !== undefined || servesCase(record)) continue;
      const found = receiverOf(model, fn, record, member);
      // GN-13f: a test that needs any receiver takes none that arms faults, which would fire in its calls.
      if (found !== undefined && !armsFaults(found)) return found;
    }
  }
  return undefined;
}

// GN-13t: an instance of a class for a test that needs any instance of it (B-5c): the receiver of sampleReceiver of
// its first member that has a receiver, or undefined when no case of the class makes one.
export function sampleInstance(model: Model, object: ObjectClass): Receiver | undefined {
  const member = object.members.find((m) => m.receiver !== undefined);
  return member === undefined ? undefined : sampleReceiver(model, member);
}

// N-4: the cases of a stringify that do not raise, each with the instance of its factory arguments and the text that
// the language's string form gives.
export function stringCases(model: Model, fn: Fn): { id: string; receiver: Receiver; result: string }[] {
  if (fn.special !== 'stringify') return [];
  const out: { id: string; receiver: Receiver; result: string }[] = [];
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    if (record['raises'] !== undefined) continue;
    hookWithoutFiles(fn, record);
    const receiver = receiverOf(model, fn, record);
    const result = record['result'];
    if (receiver === undefined || typeof result !== 'string') {
      throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} gives ${receiver === undefined ? `no arguments of a factory of ${fn.unit.id}` : 'no text as its result'} (G-5, N-4)`);
    }
    out.push({ id: String(record['id']), receiver, result });
  }
  return out;
}

// GN-13i: the tests of a hook (N-4) write no files, so a case of a hook that gives files is refused by name (G-4).
function hookWithoutFiles(fn: Fn, record: Record<string, unknown>): void {
  if (record[CASE_FILES] !== undefined) throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} gives ${CASE_FILES}, which the test of a hook does not write (N-4, GN-13i)`);
  // GN-13j: nor runs the lines of a service.
  if (record[CASE_LISTENER] !== undefined) throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} gives ${CASE_LISTENER}, which the test of a hook does not start (N-4, GN-13r)`);
  if (servesCase(record)) throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} runs against a service, which the test of a hook does not reach (N-4, GN-13j)`);
}

// G-4, GN-13e: the reason why the generator cannot write the receiver or an argument of a case in the
// language, which the test of the case fails with, so that one value that is not written yet fails its own test by
// name and the other tests of the target run; undefined when every value of the case is written.
export function caseRefusal(model: Model, ctx: Context, fn: Fn, kase: { id: string; args: Map<Arg, unknown>; receiver?: Receiver; files?: unknown; listener?: unknown; service?: unknown }, receiver: (made: Receiver | undefined) => unknown): string | undefined {
  // A row of a callback fixture that is not generated yet refuses the target (G-4), as the emitters read the fixtures.
  const fixed = new Set(fixturesOf(model, fn, kase.id, kase.args).map((fixture) => fixture.arg));
  // The probe writes no steps of a deep value (GN-13e), which the test of the case writes when it makes the value.
  const steps = ctx.steps;
  ctx.steps = undefined;
  try {
    caseFilesOf(kase.files);
    caseListenerOf(kase.listener);
    serviceSteps(kase.service, ctx.target ?? ctx.lang);
    receiver(kase.receiver);
    for (const arg of fn.args) if (!fixed.has(arg)) caseValue(model, ctx, arg, kase.args);
    return undefined;
  } catch (error) {
    if (!(error instanceof Unsupported)) throw error;
    return `the case ${kase.id} of ${fn.member.id}: ${error.message}`;
  } finally {
    ctx.steps = steps;
  }
}

// GN-6ae (CK-22): the calls of `after` of a case.
function afterOf(model: Model, fn: Fn, record: Record<string, unknown>): { after?: After[] } {
  const given = record['after'];
  if (!Array.isArray(given)) return {};
  return {
    after: (given as Record<string, unknown>[]).map((call) => {
      const method = memberById(model, String(call['call']));
      const args = method === undefined ? undefined : argsOf(method, (call['args'] ?? {}) as Record<string, unknown>);
      if (method === undefined || args === undefined) throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id}: after calls ${String(call['call'])} with ${shown(call['args'])}, which are not the parameters of a member (GN-6ae)`);
      const kind = (call['raises'] as { kind?: unknown } | undefined)?.kind;
      return { fn: method, args, result: call['result'], ...(typeof call['on'] === 'string' ? { on: call['on'] } : {}), ...(typeof kind === 'string' ? { raises: kind } : {}) };
    }),
  };
}

// GN-6ae: the cases that expect the exception of the language that a function fixture of the case raises
// (raises: "callback"), with the arguments, the receiver and the calls of after.
export function callbackCases(model: Model, fn: Fn): { id: string; args: Map<Arg, unknown>; receiver?: Receiver; after?: After[]; files?: unknown; listener?: unknown; service?: unknown }[] {
  const out: { id: string; args: Map<Arg, unknown>; receiver?: Receiver; after?: After[]; files?: unknown; listener?: unknown; service?: unknown }[] = [];
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    if (record['raises'] !== 'callback') continue;
    const id = String(record['id']);
    const args = argsOf(fn, record);
    const receiver = receiverOf(model, fn, record);
    if (args === undefined || (fn.receiver !== undefined && receiver === undefined)) throw new Unsupported(`the case ${id} of ${fn.member.id} gives ${args === undefined ? 'not every parameter' : `no arguments of a factory of ${fn.unit.id}`} (G-5)`);
    out.push({ id, args, ...(receiver === undefined ? {} : { receiver }), ...afterOf(model, fn, record), ...filesOf(record) });
  }
  return out;
}

// GN-13i: the files of a case as the case gives them, absent when it gives none.
// GN-13j: the service of the case as withServices reads it, absent when the case has none.
// A case that runs against a service is marked serves, which a test that takes the values of a case without its lines
// reads.
const filesOf = (record: Record<string, unknown>): { files?: unknown; listener?: unknown; service?: unknown; serves?: true } => ({
  ...(record[CASE_FILES] === undefined ? {} : { files: record[CASE_FILES] }),
  ...(record[CASE_LISTENER] === undefined ? {} : { listener: record[CASE_LISTENER] }),
  ...(record['service'] === undefined ? {} : { service: record['service'] }),
  ...(servesCase(record) ? { serves: true as const } : {}),
});

// GN-13d: a parameter with a default for which an explicit null is a refused value: every default but {literal: null},
// whose declared value is that null.
export const refusesNull = (arg: Arg): boolean =>
  arg.default !== undefined && !(typeof arg.default === 'object' && arg.default !== null && 'literal' in arg.default && arg.default.literal === null);

// N-4: the cases of a primitive that do not raise, each with the instance of its factory arguments and the number that
// the language's number form gives, written as the language writes it; a case without result takes the form alone.
export function primitiveCases(model: Model, ctx: Context, fn: Fn): { id: string; receiver: Receiver; result: string | undefined }[] {
  if (fn.special !== 'primitive') return [];
  const out: { id: string; receiver: Receiver; result: string | undefined }[] = [];
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    if (record['raises'] !== undefined) continue;
    hookWithoutFiles(fn, record);
    const receiver = receiverOf(model, fn, record);
    if (receiver === undefined) throw new Error(`the case ${String(record['id'])} of ${fn.member.id} gives no arguments of a factory of ${fn.unit.id} (G-5, N-4)`);
    out.push({ id: String(record['id']), receiver, result: 'result' in record ? fromJson(model, ctx, fn.returns, record['result'], true) : undefined });
  }
  return out;
}

// G-5: the entries of a case value of a map<T>: an object of JSON gives them in the order of its keys, which puts a key
// that is an integer before the others, and an array of [key, value] gives them in the order of the case.
export function mapEntries(value: unknown): [string, unknown][] {
  if (!Array.isArray(value)) return Object.entries(value as Record<string, unknown>);
  return value.map((entry: unknown): [string, unknown] => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') throw new Unsupported(`a case value of a map is an object of its entries or an array of [key, value] whose keys are texts, not ${shown(value)}`);
    return [entry[0], entry[1]];
  });
}

// B2.372 (K-1, E-1): the raises of a case with the category of its kind, which the case may leave out, since the
// contract gives every kind its category (errors.kinds); a case that writes it keeps its own. B2.433 (GN-13bd): a kind
// that the binding raises itself takes its fixed category of E-1a, and a kind of neither names no class.
// B2.448 (GN-13bh): a category that the case writes is one of the six of E-1 and is the category of its kind, where
// the kind has one; another is refused by the case, the kind and the category, so no test names an empty class or the
// class of another category.
export function withCategory<T extends { kind: string; category?: unknown }>(model: Model, raises: T, at: string): T & { category: string } {
  // A row of this library whose class was refused, which the model leaves out, still gives its category.
  const own = model.contract.errors.kinds.find((row) => row.library === undefined && kindsOf(row).includes(raises.kind))?.category;
  const category = model.kinds.find((k) => kindText(k.variant) === raises.kind)?.category ?? own ?? (Object.keys(BINDING_KINDS) as Category[]).find((c) => BINDING_KINDS[c].includes(raises.kind));
  const written = raises.category;
  if (written !== undefined) {
    if (typeof written !== 'string' || !(CATEGORIES as readonly string[]).includes(written)) {
      throw new Unsupported(`${at} raises the kind ${raises.kind} with the category ${JSON.stringify(written)}, which is no category: a category is one of ${CATEGORIES.join(', ')} (GN-13bh, E-1)`);
    }
    if (category !== undefined && category !== written) {
      throw new Unsupported(`${at} raises the kind ${raises.kind} with the category ${written}, but the kind ${raises.kind} is of the category ${category} (GN-13bh, E-1)`);
    }
    return raises as T & { category: string };
  }
  if (category === undefined) throw new Unsupported(`${at} raises the kind ${raises.kind} without a category, which is no kind of errors.kinds nor of E-1a (GN-13bd)`);
  return { ...raises, category };
}

export function raisingCases(model: Model, fn: Fn): RaisingCase[] {
  const out: RaisingCase[] = [];
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    const given = record['raises'] as RaisingCase['raises'] | 'callback' | undefined;
    // GN-6ae: a case that expects the exception of a function fixture is one of callbackCases.
    if (given === undefined || given === 'callback') continue;
    const raises = withCategory(model, given, `the case ${String(record['id'])} of ${fn.member.id}`);
    const args = argsOf(fn, record);
    if (args === undefined) {
      const missing = fn.args.map((a) => caseName(a.name)).filter((name) => !(name in record));
      throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} has no ${missing.join(', ') || 'record field'} (G-5: case keys are the parameter names in snake_case)`);
    }
    const receiver = receiverOf(model, fn, record);
    if (fn.receiver !== undefined && receiver === undefined) {
      throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} gives no arguments of a factory of ${fn.unit.id} (G-5, T-5)`);
    }
    const faults = record['faults'];
    if (faults !== undefined && model.faults.length === 0) throw new Unsupported(`the case ${String(record['id'])} of ${fn.member.id} arms faults, but the contract names no fault injection point (G-5)`);
    // GN-5: a point of another library is armed as a point of the contract is, by the arming of the member: its core
    // is linked into the binding crate, whose fault-test turns on the points of that core.
    // A case that arms faults or holds after makes its receiver first, as the faults and the calls of after need it.
    const fails = faults === undefined && record['after'] === undefined && receiverMayRaise(model, receiver, record, raises.kind);
    out.push({ id: String(record['id']), args, raises, ...(faults === undefined ? {} : { faults: shown(faults) }), ...(receiver === undefined ? {} : { receiver }), ...afterOf(model, fn, record), ...filesOf(record), ...(fails ? { receiverFails: true as const } : {}) });
  }
  return out;
}

// GN-13e: a case that does not raise, with the arguments the case gives, its receiver and the result it expects: the
// value of the key that the row of `cases` names (`result` by default), absent when the case has no such key. A case
// that the generator cannot run carries the reason, which its test fails with (G-4).
export interface ResultCase {
  id: string;
  args: Map<Arg, unknown>;
  receiver?: Receiver;
  expected?: { value: unknown };
  refused?: string;
  // GN-6ae: the calls that observe the receiver after the call of the case.
  after?: After[];
  // GN-13i: the files of the case as the case gives them.
  files?: unknown;
  // GN-13r: the listener of the case.
  listener?: unknown;
  // GN-13j: the service of the case, and whether the case runs against a service.
  service?: unknown;
  serves?: true;
}

// GN-13e: whether the language compares a result of the type with the value of a case: a class has no case value
// form, and a return of none or never has no result.
export function comparableResult(model: Model, type: Type, seen: Set<string> = new Set()): string | undefined {
  if (type === 'none' || type === 'never') return 'a member that returns nothing has no result to compare';
  if (typeof type === 'string') return undefined;
  if ('list' in type) return comparableResult(model, type.list, seen);
  if ('optional' in type) return comparableResult(model, type.optional, seen);
  if ('map' in type) return comparableResult(model, type.map, seen);
  if ('keyed_map' in type) return comparableResult(model, type.keyed_map, seen);
  if ('tuple' in type) return type.tuple.map((t) => comparableResult(model, t, seen)).find((reason) => reason !== undefined);
  if (objectUnit(model, type) !== undefined) return 'a class has no case value form';
  // GN-6ae: a passthrough is the value that the function fixture returned, a value of GN-13.
  if ('passthrough' in type) return undefined;
  // A value alias is compared where its out rows make the built-in form of each kind (expectedText).
  if (aliasOf(model, type) !== undefined) return undefined;
  const unit = unitOf(model, type);
  if (unit?.kind === 'enum') return undefined;
  // A record or a variant that holds itself is judged as far as it is not judged already.
  if ((unit?.kind === 'record' || unit?.kind === 'variant') && seen.has(unit.id)) return undefined;
  if (unit?.kind === 'record') {
    seen.add(unit.id);
    return (unit.fields ?? []).map((f) => comparableResult(model, f.type, seen)).find((reason) => reason !== undefined);
  }
  if (unit?.kind === 'variant') {
    seen.add(unit.id);
    return (unit.cases ?? []).flatMap((c) => c.fields).map((f) => comparableResult(model, f.type, seen)).find((reason) => reason !== undefined);
  }
  return `a result of ${shown(type)} is not compared yet`;
}

export function resultCases(model: Model, fn: Fn): ResultCase[] {
  const out: ResultCase[] = [];
  const keys = model.resultKeys?.get(fn.member.id);
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    // A hook's cases are its own tests (N-4), and a case with faults that does not raise is not generated yet (GN-13a).
    if (record['raises'] !== undefined || record['faults'] !== undefined || fn.special !== undefined) continue;
    const id = String(record['id']);
    const key = keys?.get(kase) ?? 'result';
    const args = argsOf(fn, record);
    if (args === undefined) {
      const missing = fn.args.map((a) => caseName(a.name)).filter((name) => !(name in record));
      out.push({ id, args: new Map(), refused: `the case ${id} of ${fn.member.id} has no ${missing.join(', ') || 'record field'} (G-5: case keys are the parameter names in snake_case)` });
      continue;
    }
    const receiver = receiverOf(model, fn, record);
    if (fn.receiver !== undefined && receiver === undefined) {
      out.push({ id, args, refused: `the case ${id} of ${fn.member.id} gives no arguments of a factory of ${fn.unit.id} (G-5, T-5)` });
      continue;
    }
    const base = { id, args, ...(receiver === undefined ? {} : { receiver }), ...afterOf(model, fn, record), ...filesOf(record) };
    if (!(key in record)) {
      out.push(base);
      continue;
    }
    // GN-13e, B2.466: the result of a member that returns none is null wherever a case writes it, which each language
    // tests as no value (expectedText); another value has no form.
    if (fn.returns === 'none') {
      out.push(record[key] === null ? { ...base, expected: { value: null } } : { ...base, refused: `the case ${id} of ${fn.member.id} gives ${key} ${shown(record[key])}, but ${fn.member.id} returns none, whose result is null alone (GN-13e)` });
      continue;
    }
    // GN-13e: the result null of an optional has a case form whatever the optional holds.
    const absent = record[key] === null && typeof fn.returns === 'object' && 'optional' in fn.returns;
    const reason = absent ? undefined : comparableResult(model, fn.returns);
    out.push(reason === undefined ? { ...base, expected: { value: record[key] } } : { ...base, refused: `the case ${id} of ${fn.member.id} gives ${key}, but ${reason} (GN-13e)` });
  }
  return out;
}

export const isNumber = (type: Type): string | undefined => {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  return typeof base === 'string' && ['uint', 'int', 'int64', 'float'].includes(base) ? base : undefined;
};

// GN-12a: whether a null at a number parameter is a value of another type, which the B-2 test gives: an optional takes
// it as the absent value (GN-6i), and a parameter with a default as the argument left out (GN-10).
export const numberRefusesNull = (arg: Arg): boolean => !(typeof arg.type === 'object' && 'optional' in arg.type) && arg.default === undefined;

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

// T-2: a keyed map with one key of a kind that the contract type does not list, in the language's form, or undefined
// when the language has no such key: a PHP string key is a text when it is UTF-8 and text is listed, else a byte
// string, so PHP has a refused string key only when bytes are not listed.
export function refusedKeyMap(model: Model, ctx: Context, type: Type): { kind: string; value: string } | undefined {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  // T-2: map<T> has text keys only; a PHP int key is its decimal text, so PHP has no refused key of a map.
  if (typeof base === 'object' && 'map' in base) {
    const value = placeholder(model, ctx, base.map);
    const literal = { python: `{1: ${value}}`, node: `new Map([[1, ${value}]])`, php: undefined }[ctx.lang];
    return literal === undefined ? undefined : { kind: 'int', value: literal };
  }
  if (typeof base !== 'object' || !('keyed_map' in base)) return undefined;
  const value = placeholder(model, ctx, base.keyed_map);
  const literals: Record<Lang3, Record<string, string>> = {
    python: { int: `{1: ${value}}`, bytes: `{b"k": ${value}}`, text: `{"k": ${value}}` },
    node: { int: `new Map([[1, ${value}]])`, bytes: `new Map([[new Uint8Array([107]), ${value}]])`, text: `new Map([['k', ${value}]])` },
    php: { int: `[1 => ${value}]`, bytes: base.key.includes('text') ? `["\\xff" => ${value}]` : `["k" => ${value}]` },
  };
  const kind = ['int', 'bytes', 'text'].find((k) => !base.key.includes(k) && literals[ctx.lang][k] !== undefined);
  return kind === undefined ? undefined : { kind, value: literals[ctx.lang][kind] ?? '' };
}

// GN-12a: a keyed_map parameter whose contract lists int keys, given the key 2^53, which is no safe integer.
export function unsafeKeyMap(model: Model, ctx: Context, type: Type): string | undefined {
  const base = typeof type === 'object' && 'optional' in type ? type.optional : type;
  if (typeof base !== 'object' || !('keyed_map' in base) || !base.key.includes('int')) return undefined;
  const value = placeholder(model, ctx, base.keyed_map);
  return { python: `{2**53: ${value}}`, node: `new Map([[2 ** 53, ${value}]])`, php: `[2 ** 53 => ${value}]` }[ctx.lang];
}

// U-3: the first parameter of a member that is a callback, for the tests of K-2.
// G-5 callback fixture: the value of a callback parameter in a case, {"callback": {<callback member id>: [<row>]},
// "calls": [{"member", "args"}]}. A row is {"args": {...}} with "result" (absent for a return of none) and "once".
export interface Fixture {
  arg: Arg;
  unit: Unit;
  // The rows of each member of the callback unit, by its position in the unit: the arguments in parameter order, the
  // result and whether the row is used once, each a case value.
  // GN-13: a row raises an instance of an error unit with its kind, or, by "exception", an exception of the language
  // that is no error of the library.
  rows: { member: number; args: unknown[]; result: unknown; once: boolean; raise?: { unit: Unit; kind: string; library?: string } | 'exception' }[];
  // The calls that the core makes in order, when the case names them.
  calls?: { member: number; args: unknown[] }[];
}

// The fixtures of a case: one for each callback parameter of the member. The contract check has judged the form
// (CK-22); a row that the generated fixture cannot run is refused by name (G-4).
export function fixturesOf(model: Model, fn: Fn, id: string, args: Map<Arg, unknown>): Fixture[] {
  const out: Fixture[] = [];
  for (const arg of fn.args) {
    const unit = unitOf(model, arg.type);
    if (unit?.origin !== 'callback') continue;
    const where = `the case ${id} of ${fn.member.id}`;
    const value = args.get(arg) as { callback?: unknown } | null | undefined;
    // GN-6w: an instance of a class that implements the interface stands for a fixture, as a value of the case.
    if (isInstanceValue(value)) continue;
    if (typeof value !== 'object' || value === null || typeof value.callback !== 'object' || value.callback === null) {
      throw new Unsupported(`${where} gives no {"callback": ...} for ${caseName(arg.name)} (G-5)`);
    }
    out.push({ arg, ...fixtureOf(model, unit, value, where) });
  }
  return out;
}

// T-3: the contract of the repository that owns a callback unit of another repository, or undefined for a unit of
// this contract.
export function fixtureOwner(model: Model, unit: Unit): Contract | undefined {
  const library = model.foreignCallbacks.find((c) => c.unit === unit || (c.library !== undefined && c.unit.id === unit.id && model.foreign.get(c.library)?.units.includes(unit) === true))?.library;
  return library === undefined ? undefined : model.foreign.get(library);
}

// T-3: the types of the members of a callback unit as this contract names them: a type that the contract of the owner
// of a unit of another repository names is resolved there, to a unit of its library.
export function fixtureType(model: Model, unit: Unit): (type: Type) => Type {
  const owner = fixtureOwner(model, unit);
  return (type) => (owner === undefined ? type : resolveNamedType({ ...owner, library: '' }, type));
}

// G-5: the rows and the calls of a callback value {"callback": {...}, "calls": [...]} of the unit.
export function fixtureOf(model: Model, unit: Unit, given: unknown, where: string): Omit<Fixture, 'arg'> {
  const value = given as { callback: Record<string, unknown[]>; calls?: { member: string; args?: Record<string, unknown> }[] };
  const members = unit.members ?? [];
  // GN-6s: the library of a callback unit of another repository, whose own error units its rows raise.
  const library = model.foreignCallbacks.find((c) => c.unit === unit || (c.library !== undefined && c.unit.id === unit.id && model.foreign.get(c.library)?.units.includes(unit) === true))?.library;
  const position = (memberId: string): number => {
    const found = members.findIndex((m) => m.id === memberId);
    if (found < 0) throw new Unsupported(`${where} names ${memberId}, which is no member of ${unit.id} (G-5)`);
    return found;
  };
  const ordered = (member: number, args: Record<string, unknown> | undefined): unknown[] =>
    (members[member]?.parameters ?? []).map((p) => {
      const key = caseName(p.name);
      if (args === undefined || !(key in args)) throw new Unsupported(`${where} gives no ${key} in the args of ${members[member]?.id ?? ''} (G-5)`);
      return args[key];
    });
  const rows: Fixture['rows'] = [];
  for (const [memberId, list] of Object.entries(value.callback)) {
    const member = position(memberId);
    for (const row of list as Record<string, unknown>[]) {
      if (row['async'] === true) throw new Unsupported(`${where}: an async row of a callback fixture is not generated yet`);
      // GN-13: a raise row throws an instance of its error unit with its kind, which the member recognizes (U-3).
      const given = row['raise'] as { error: string; kind: string } | 'exception' | undefined;
      const base = { member, args: ordered(member, row['args'] as Record<string, unknown> | undefined), result: row['result'] ?? null, once: row['once'] === true };
      if (given === 'exception') {
        rows.push({ ...base, raise: 'exception' });
        continue;
      }
      const raise = given;
      // GN-6s: a row of a callback unit of another repository raises an error unit of that repository.
      const raised = raise === undefined ? undefined : library === undefined ? model.errorUnits.find((u) => u.unit.id === raise.error)?.unit : model.foreign.get(library)?.units.find((u) => u.id === raise.error && u.kind === 'error');
      if (raise !== undefined && raised === undefined) throw new Unsupported(`${where}: the raise row names ${raise.error}, which is no error unit that is generated (GN-13)`);
      rows.push({ ...base, ...(raise === undefined || raised === undefined ? {} : { raise: { unit: raised, kind: raise.kind, ...(library === undefined ? {} : { library }) } }) });
    }
  }
  const calls = value.calls?.map((call) => ({ member: position(call.member), args: ordered(position(call.member), call.args) }));
  return { unit, rows, ...(calls === undefined ? {} : { calls }) };
}

// GN-13: the message of the exception of a callback row whose raise is "exception".
export const ROW_EXCEPTION = 'G-5: exception';

// The rows and the expected calls of a fixture as the values of a language: the member name, the arguments, and for a
// row the result and whether it is used once.
export function fixtureValues(model: Model, ctx: Context, fixture: Omit<Fixture, 'arg'>): { members: string[]; rows: string[][]; calls: string[][] | undefined } {
  const members = fixture.unit.members ?? [];
  const name = (member: number): string => langName(ctx.lang, members[member]?.name ?? [], 'callable');
  // T-3: a callback unit of another repository names the types of its owner's contract, which resolve there.
  const typed = fixtureType(model, fixture.unit);
  // GN-13be: an argument that the binding hands to the callback, in a row and in an expected call, leaves the binding
  // as a result does, so it takes the out rows of an alias.
  const argsOf = (member: number, args: unknown[]): string[] => (members[member]?.parameters ?? []).map((p, i) => fromJson(model, ctx, typed(p.type), args[i] ?? null, true));
  const none = ctx.lang === 'python' ? 'None' : 'null';
  const flag = (on: boolean): string => (ctx.lang === 'python' ? (on ? 'True' : 'False') : String(on));
  const list = (items: string[]): string => (ctx.lang === 'python' ? `(${items.map((i) => `${i},`).join(' ')})` : `[${items.join(', ')}]`);
  const text = (value: string): string => (ctx.lang === 'python' ? pyString(value) : ctx.lang === 'node' ? jsString(value) : phpText(value));
  return {
    // GN-6d, G-5: a member with a default that no row and no call of the case names is left out of the object, which
    // the binding answers with the default.
    // GN-6bu: a member of a JavaScript fixture declares the arguments that the binding calls it with.
    members: members.flatMap((m, i) => (m.default !== undefined && !fixture.rows.some((row) => row.member === i) && !(fixture.calls ?? []).some((call) => call.member === i) ? [] : [ctx.lang === 'node' ? jsDeclaredMember(text(name(i)), (m.parameters ?? []).length) : text(name(i))])),
    rows: fixture.rows.map((row) => {
      const returns = members[row.member]?.returns ?? 'none';
      const result = row.result === null || returns === 'none' ? none : fromJson(model, ctx, typed(returns), row.result);
      const raise = row.raise;
      if (raise !== undefined && raise !== 'exception' && ctx.errorNew === undefined) throw new Unsupported(`a raise row of ${fixture.unit.id} is not generated for ${ctx.target ?? ctx.lang} yet`);
      const exception = ctx.lang === 'python' ? `RuntimeError(${pyString(ROW_EXCEPTION)})` : ctx.lang === 'node' ? `new Error(${jsString(ROW_EXCEPTION)})` : `new \\RuntimeException(${phpText(ROW_EXCEPTION)})`;
      const raised = raise === undefined ? none : raise === 'exception' ? exception : ctx.errorNew === undefined ? none : ctx.errorNew(raise.unit, raise.kind, `G-5: ${raise.kind}`, raise.library);
      return [text(name(row.member)), list(argsOf(row.member, row.args)), result, flag(row.once), raised];
    }),
    calls: fixture.calls?.map((call) => [text(name(call.member)), list(argsOf(call.member, call.args))]),
  };
}

// GN-6z: the function value of a case, {"function": [<row>]}: a row is {"args": {"0": ..., "1": ...}} by position,
// with "result" (absent for a return of none) and "once". The contract check has judged the form (CK-22). The rows are
// given as those of a fixture of one member, the call itself, whose name `call` each language gives.
export function functionRows(model: Model, ctx: Context, type: { parameters: Type[]; returns: Type }, value: unknown, what: string, call: string): string[][] {
  const none = ctx.lang === 'python' ? 'None' : 'null';
  const flag = (on: boolean): string => (ctx.lang === 'python' ? (on ? 'True' : 'False') : String(on));
  const list = (items: string[]): string => (ctx.lang === 'python' ? `(${items.map((i) => `${i},`).join(' ')})` : `[${items.join(', ')}]`);
  const text = (name: string): string => (ctx.lang === 'python' ? pyString(name) : ctx.lang === 'php' ? phpText(name) : jsString(name));
  const rows = (value as { function?: unknown } | null)?.function;
  if (!Array.isArray(rows)) throw new Error(`${what} gives no {"function": [...]} (G-5)`);
  return (rows as Record<string, unknown>[]).map((row) => {
    const given = (row['args'] ?? {}) as Record<string, unknown>;
    const values = type.parameters.map((p, i) => {
      if (!(String(i) in given)) throw new Error(`${what} gives no argument ${String(i)} in a row (G-5)`);
      // GN-13be: an argument that the binding hands to the function leaves the binding as a result does.
      return fromJson(model, ctx, p, given[String(i)], true);
    });
    const result = row['result'] === undefined || row['result'] === null || type.returns === 'none' ? none : fromJson(model, ctx, type.returns, row['result']);
    // A row of a function raises nothing: its last value is that of a fixture row without `raise` (GN-13).
    return [text(call), list(values), result, flag(row['once'] === true), none];
  });
}

// GN-6z: the function value of a case for each parameter of a function type, as a fixture whose record the test reads.
export function functionFixturesOf(model: Model, ctx: Context, fn: Fn, id: string, args: Map<Arg, unknown>, call: string): { arg: Arg; members: string[]; rows: string[][] }[] {
  const text = (name: string): string => (ctx.lang === 'python' ? pyString(name) : ctx.lang === 'php' ? phpText(name) : jsString(name));
  return fn.args.flatMap((arg) => {
    const type = arg.type;
    // GN-6ae: the function of a member with machine is a function fixture, which the test writes with its own hook.
    if (typeof type !== 'object' || !('function' in type) || machineFunction(type)) return [];
    const what = `the case ${id} of ${fn.member.id} for ${caseName(arg.name)}`;
    // GN-6bu: the call of a JavaScript fixture declares the arguments that the binding calls the function with.
    return [{ arg, members: [ctx.lang === 'node' ? jsDeclaredMember(text(call), type.function.parameters.length) : text(call)], rows: functionRows(model, ctx, type.function, args.get(arg), what, call) }];
  });
}

// GN-13y, K-2: the arguments of the K-2 tests of a member that takes a callback: those of its first case whose callback
// fixture lists the calls that the core made with them, or undefined, where the tests give placeholders. A core may
// judge another argument before it calls the callback (crud-ui validator: a null data is invalid_form_input).
export function callbackReachingArgs(model: Model, fn: Fn): ReadonlyMap<Arg, unknown> | undefined {
  const callback = callbackArg(model, fn);
  if (callback === undefined) return undefined;
  // B2.385: a case whose callback rows all give a result comes first: with it the core passes on what the callback
  // gives, while a core may answer a raise of the callback itself (sample tolerant swallows it for a key ?a).
  let raising: ReadonlyMap<Arg, unknown> | undefined;
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    if (record['receiver'] !== undefined || record['faults'] !== undefined || record['files'] !== undefined || record['service'] !== undefined) continue;
    const args = argsOf(fn, record);
    const given = args?.get(callback);
    // A fixture whose calls are listed was called with these arguments, whatever the case then raises.
    const fixture = typeof given === 'object' && given !== null && 'callback' in given ? (given as { callback?: unknown; calls?: unknown[] }) : undefined;
    const calls = fixture?.calls;
    if (args === undefined || calls === undefined || calls.length === 0) continue;
    const rows = typeof fixture?.callback === 'object' && fixture.callback !== null ? Object.values(fixture.callback).flat() : [];
    if (rows.every((row) => typeof row !== 'object' || row === null || !Object.hasOwn(row, 'raise'))) return args;
    raising ??= args;
  }
  return raising;
}

// GN-13t: the arguments of the first case of a member that gives every argument, arms no faults, writes no files and
// runs against no service, one that does not raise before one that raises, or undefined. A test that gives one argument
// a value of its own gives an argument of a class this case value, because the core of a class may refuse the
// placeholder arguments of its first constructor (crud-ui: FormTemplate.from_json of a JSON null).
export function classCaseArgs(model: Model, fn: Fn): ReadonlyMap<Arg, unknown> | undefined {
  if (!fn.args.some((a) => objectUnit(model, a.type) !== undefined)) return undefined;
  let raising: ReadonlyMap<Arg, unknown> | undefined;
  for (const kase of model.cases.get(fn.member.id) ?? []) {
    const record = kase as Record<string, unknown>;
    if (record['faults'] !== undefined || record[CASE_FILES] !== undefined || servesCase(record)) continue;
    const args = argsOf(fn, record);
    if (args === undefined) continue;
    if (record['raises'] === undefined) return args;
    raising ??= args;
  }
  return raising;
}

// GN-13t: the value of another argument of a test that gives one argument a value of its own: the case value of an
// argument of a class in the case of classCaseArgs, and the placeholder of GN-13 otherwise.
export function otherValue(model: Model, ctx: Context, arg: Arg, given: ReadonlyMap<Arg, unknown> | undefined, rich = false): string {
  if (given !== undefined && given.has(arg) && objectUnit(model, arg.type) !== undefined) {
    // G-4: a case value that the generator does not write in the target fails the test of its own case by name
    // (GN-13e) and supplies no value here, so the placeholder stands, as when no case exists.
    try {
      const value = caseValue(model, ctx, arg, given);
      if (value !== undefined) return value;
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
    }
  }
  return placeholder(model, ctx, arg.type, rich);
}

export function callbackArg(model: Model, fn: Fn): Arg | undefined {
  return fn.args.find((a) => unitOf(model, a.type)?.origin === 'callback');
}

// K-2: whether a result of another type is a failure of the binding. A member that returns a value alias gives every
// value to the alias's core, which judges it (B-1), so the kind of a refused result is the alias's, not the binding's.
export function judgesCallbackResult(model: Model, callback: Unit): boolean {
  const namesAlias = (type: Type): boolean => {
    if (typeof type === 'string') return false;
    if ('list' in type) return namesAlias(type.list);
    if ('map' in type) return namesAlias(type.map);
    if ('keyed_map' in type) return namesAlias(type.keyed_map);
    if ('optional' in type) return namesAlias(type.optional);
    if ('tuple' in type) return type.tuple.some(namesAlias);
    return unitOf(model, type)?.kind === 'alias';
  };
  return !(callback.members ?? []).some((m) => namesAlias(m.returns ?? 'none'));
}

// G-5: the key of a keyed map in a case: a text, {"int": n} or {"hex": "<lower-case hex>"} for a byte string.
export function caseKey<T>(key: unknown, make: (kind: 'int' | 'text' | 'bytes', value: unknown) => T): T {
  if (typeof key === 'string') return make('text', key);
  if (typeof key === 'object' && key !== null && 'int' in key && Number.isSafeInteger((key as { int: unknown }).int)) return make('int', (key as { int: number }).int);
  // G-5: an integer key outside the safe integers is its decimal text, which the reader of the case files may give as a
// bigint.
  if (typeof key === 'object' && key !== null && 'int' in key && typeof (key as { int: unknown }).int === 'bigint') return make('int', String((key as { int: bigint }).int));
  if (typeof key === 'object' && key !== null && 'int' in key && typeof (key as { int: unknown }).int === 'string' && /^-?(0|[1-9][0-9]*)$/.test((key as { int: string }).int)) return make('int', (key as { int: string }).int);
  if (typeof key === 'object' && key !== null && 'hex' in key) return make('bytes', key);
  throw new Unsupported(`a key of a keyed map in a case is a text, {"int": n} or {"hex": ...}, not ${shown(key)}`);
}

// G-5: the errno that a raising case expects: none, a number, or the symbol of an errno, whose value each language
// gives on the target.
export function expectedErrno(kase: { id: string; raises: { errno?: unknown } }): { symbol: string } | { value: number } | null {
  const errno = kase.raises.errno;
  if (errno === undefined || errno === null) return null;
  if (typeof errno === 'string') return { symbol: errno };
  if (typeof errno === 'number') return { value: errno };
  throw new Unsupported(`the errno of the case ${kase.id} is neither a symbol nor a number (G-5)`);
}

// U-7: a case of the in function of a value alias: the value that the alias refuses and the kind it gives, with the
// category of the kind (E-1).
export interface AliasCase {
  alias: ValueAlias;
  id: string;
  value: unknown;
  kind: string;
  category: string;
  raises: { status?: number | null; errno?: unknown };
}

// GN-13e: the words of the id of a case, split at every run of characters other than ASCII letters and digits, which
// the name of its test holds in a language whose tests are functions or methods.
export const caseWords = (id: string): string[] => id.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
// GN-13e: the words of an id capitalized and joined (PHP, Go), or joined by _ (Python).
export const casePascal = (id: string): string => caseWords(id).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
export const caseSnake = (id: string): string => caseWords(id).join('_');

// GN-13e: two ids of the cases of one member, or of one value alias, that give one test name refuse the target, PHP
// comparing the names without case as it does for its methods; an id without a word gives no name.
// GN-6ae (G-4): a test generator that does not write the calls of after and the case of raises "callback" yet refuses
// the cases that name them, so that no such case is left out of the tests of its target unseen.
export function refuseScopedCases(model: Model, target: string): void {
  for (const [member, cases] of model.cases) {
    for (const kase of cases) {
      const record = kase as Record<string, unknown>;
      if (record['after'] !== undefined || record['raises'] === 'callback') throw new Unsupported(`the case ${String(record['id'])} of ${member}: after and raises "callback" are not written in the test of ${target} yet (GN-6ae)`);
    }
  }
}

export function checkCaseNames(model: Model, name: (id: string) => string, caseless: boolean): void {
  const groups: [string, unknown[]][] = [...model.cases.entries(), ...[...model.aliasCases.entries()].map(([id, cases]): [string, unknown[]] => [`the alias ${id}`, cases])];
  for (const [owner, cases] of groups) {
    const seen = new Map<string, string>();
    for (const kase of cases) {
      const id = String((kase as Record<string, unknown>)['id']);
      const made = name(id);
      if (caseWords(id).length === 0) throw new Unsupported(`the case ${id} of ${owner} has no letter or digit for the name of its test (GN-13e)`);
      const key = caseless ? made.toLowerCase() : made;
      const other = seen.get(key);
      if (other !== undefined && other !== id) throw new Unsupported(`the cases ${other} and ${id} of ${owner} give one test name ${made} (GN-13e)`);
      seen.set(key, id);
    }
  }
}

export function aliasCases(model: Model): AliasCase[] {
  const out: AliasCase[] = [];
  for (const alias of model.aliases) {
    for (const kase of model.aliasCases.get(alias.unit.id) ?? []) {
      const record = kase as Record<string, unknown>;
      const where = `the case ${String(record['id'])} of the alias ${alias.unit.id}`;
      const kind = (record['raises'] as Record<string, unknown> | undefined)?.['kind'];
      const row = model.contract.errors.kinds.find((k) => typeof kind === 'string' && k.library === undefined && kindsOf(k).includes(kind));
      if (typeof kind !== 'string' || row?.category === undefined) throw new Unsupported(`${where} raises no kind of errors.kinds (U-7)`);
      const value = record['value'];
      // G-5: a value of the language that is no value of the alias is {"host": <sort>} of the closed table HOST_VALUES.
      const sort = typeof value === 'object' && value !== null && 'host' in value ? (value as { host: unknown }).host : undefined;
      if (sort !== undefined && (typeof sort !== 'string' || !Object.hasOwn(HOST_VALUES, sort) || Object.keys(value as object).length !== 1)) {
        throw new Error(`${where}: a value {"host"} is ${Object.keys(HOST_VALUES).map((k) => JSON.stringify(k)).join(', ').replace(/, ([^,]*)$/, ' or $1')}, not ${shown(sort)} (G-5)`);
      }
      out.push({ alias, id: String(record['id']), value, kind, category: row.category, raises: record['raises'] as AliasCase['raises'] });
    }
  }
  return out;
}

// U-7: the value that shows a kind of an alias coming up through a member: the value of the first case of the alias,
// at the place of the alias in the parameter type. The place is the parameter itself, an optional of it, or the first
// item of a list of it; any other place is an open item (GN-13a).
export function aliasRepresentative(model: Model, ctx: Context, type: Type): { kase: AliasCase; value: string } | undefined {
  const wrap = (inner: Type): ((value: string) => string) | undefined => {
    if (typeof inner !== 'object') return undefined;
    if ('optional' in inner) return wrap(inner.optional);
    if ('list' in inner) {
      const item = wrap(inner.list);
      return item === undefined ? undefined : (value) => `[${item(value)}]`;
    }
    return aliasOf(model, inner) === undefined ? undefined : (value) => value;
  };
  const inner = (found: Type): Type => (typeof found === 'object' && 'optional' in found ? inner(found.optional) : typeof found === 'object' && 'list' in found ? inner(found.list) : found);
  const place = wrap(type);
  const alias = aliasOf(model, inner(type));
  const kase = alias === undefined ? undefined : aliasCases(model).find((c) => c.alias === alias);
  if (place === undefined || kase === undefined) return undefined;
  return { kase, value: place(fromJson(model, ctx, { unit: kase.alias.unit.id }, kase.value)) };
}

// GN-13: why a case value has no PHP form, or undefined when it has one. A PHP reference is a place of an array or of a
// property, so a reference that is the value itself or the value of a reference has none.
export function phpFormless(value: unknown, slot = false): string | undefined {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  const held = record?.['value'];
  switch (record?.['kind']) {
    case 'list':
      if (record?.['repeat'] !== undefined) return phpFormless(held, false);
      return Array.isArray(held) ? held.map((item) => phpFormless(item, true)).find((reason) => reason !== undefined) : undefined;
    case 'map':
    case 'object':
      if (record?.['repeat'] !== undefined) return phpFormless(held, true);
      return Array.isArray(held) ? (held as unknown[][]).map((pair) => phpFormless(pair[1], true)).find((reason) => reason !== undefined) : undefined;
    case 'reference':
      if (!slot) return 'a reference that is no place of an array or of a property, which PHP has no form of: a PHP reference is such a place';
      return phpFormless((held as Record<string, unknown> | undefined)?.['value'], false);
    case 'int':
      return typeof held === 'string' && /^-?[0-9]+$/.test(held) && (BigInt(held) < -(2n ** 63n) || BigInt(held) >= 2n ** 63n) ? 'an integer outside 64 bits, which PHP has no form of: a PHP int is 64 bits' : undefined;
    default:
      return undefined;
  }
}

// GN-13: a case whose value of a value alias has no form in PHP. Its test calls the entry point of the feature
// case-test, which makes the value as the host values that PHP would describe and gives them to the in function of the
// alias, so the rule of the core that refuses the value runs in the binding. raises is what the case expects.
export interface CaseTest {
  // The member of the case, or none for a case of the alias itself (U-7).
  fn?: Fn;
  id: string;
  alias: ValueAlias;
  value: unknown;
  reason: string;
  raises?: RaisingCase['raises'] | 'callback';
}

export function phpCaseTests(model: Model): CaseTest[] {
  const out: CaseTest[] = [];
  for (const fn of callables(model)) {
    // The cases are read as the case files give them, without the checks of raisingCases and resultCases, so that
    // binding scaffold, which reads no contract of another library, finds them too.
    for (const record of (model.cases.get(fn.member.id) ?? []) as Record<string, unknown>[]) {
      const args = fn.special === undefined ? argsOf(fn, record) : undefined;
      const given = record['raises'] as RaisingCase['raises'] | 'callback' | undefined;
      // GN-6ae: raises "callback" names no kind, and the case still raises.
      const raises = given === undefined || given === 'callback' ? given : withCategory(model, given, `the case ${String(record['id'])} of ${fn.member.id}`);
      if (args === undefined || (raises === undefined && record['faults'] !== undefined)) continue;
      const kase = { id: String(record['id']), args, ...(raises === undefined ? {} : { raises }) };
      for (const [arg, value] of kase.args) {
        const alias = aliasOf(model, arg.type);
        const reason = alias === undefined ? undefined : phpFormless(value);
        if (alias === undefined || reason === undefined) continue;
        out.push({ fn, id: kase.id, alias, value, reason, ...(kase.raises === undefined ? {} : { raises: kase.raises }) });
      }
    }
  }
  for (const kase of aliasCases(model)) {
    const reason = phpFormless(kase.value);
    if (reason !== undefined) out.push({ id: kase.id, alias: kase.alias, value: kase.value, reason });
  }
  return out;
}

// GN-13e: the value classes of the out rows of the aliases of the contract, which a result of an alias holds.
export function tokenForms(model: Model, lang: Lang3): TokenForm[] {
  const forms: TokenForm[] = [];
  // GN-6ar: a value alias of another repository gives the classes of its owner, a value class of another repository
  // (GN-6x) gives none of these.
  for (const alias of model.aliases.filter((a) => a.unit.kind !== 'class' && a.unit.out !== undefined)) {
    let kept: TokenForm[];
    try {
      kept = aliasKept(model, lang, alias.unit);
    } catch (error) {
      // A row of an alias of another repository whose class has no such form refuses the result of each case that
      // holds the alias by name (GN-13e), so it gives no form here.
      if (alias.library === undefined || !(error instanceof Unsupported)) throw error;
      kept = [];
    }
    for (const form of kept) if (!forms.some((f) => f.unit === form.unit && f.library === form.library)) forms.push(form);
  }
  return forms;
}

// The name of the module that holds the class of a form in a test: pkg, or the package of the owner (GN-6ar).
const tokenOwner = (form: TokenForm): string => (form.library === undefined ? 'pkg' : `foreign_${form.library.replaceAll('-', '_')}`);

// GN-13e: the tokens of a result in Node and WASM, as aliasTokens writes those of a case value.
export function nodeTokens(forms: TokenForm[]): string {
  return `
// GN-13e: the texts of the places of a value in pre-order, depth first, which a loop writes: the form of each place,
// a container with its count, and an instance numbered by its first place.
const KEPT = [${forms.map((f) => `[${tokenOwner(f)}.${f.cls}, ${jsString(f.unit)}, ${jsString(f.field)}]`).join(', ')}];
function tokens(top) {
  const out = [];
  const stack = [top];
  const numbers = new Map();
  const bits = (number) => {
    if (Number.isNaN(number)) return 'nan';
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, number);
    return view.getBigUint64(0).toString(16).padStart(16, '0');
  };
  const hex = (bytes) => Buffer.from(bytes).toString('hex');
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null) out.push('null');
    else if (typeof value === 'boolean') out.push(\`bool \${String(value)}\`);
    else if (typeof value === 'number') out.push(\`number \${bits(value)}\`);
    else if (typeof value === 'bigint') out.push(\`bigint \${String(value)}\`);
    else if (typeof value === 'string') out.push(\`text \${hex(new TextEncoder().encode(value))}\`);
    else if (value instanceof Uint8Array) out.push(\`bytes \${hex(value)}\`);
    else if (Array.isArray(value)) {
      out.push(\`list \${value.length}\`);
      for (let i = value.length - 1; i >= 0; i -= 1) stack.push(value[i]);
    } else if (value instanceof Map) {
      const pairs = [...value];
      out.push(\`map \${pairs.length}\`);
      for (let i = pairs.length - 1; i >= 0; i -= 1) stack.push(pairs[i][1], pairs[i][0]);
    } else {
      const kept = KEPT.find(([cls]) => value instanceof cls);
      if (kept === undefined) {
        out.push(\`other \${typeof value}\`);
      } else if (numbers.has(value)) {
        out.push(\`\${kept[1]} again \${numbers.get(value)}\`);
      } else {
        numbers.set(value, numbers.size);
        out.push(\`\${kept[1]} #\${numbers.get(value)}\`);
        stack.push(value[kept[2]]);
      }
    }
  }
  return out;
}
`;
}

// GN-13e: the tokens of a result in Python, as aliasTokens writes those of a case value.
export function pythonTokens(forms: TokenForm[]): string {
  return `

# GN-13e: the texts of the places of a value in pre-order, depth first, which a loop writes: the form of each place,
# a container with its count, and an instance numbered by its first place.
_KEPT = (${forms.map((f) => `(${tokenOwner(f)}.${f.cls}, ${pyString(f.unit)}, ${pyString(f.field)}), `).join('')})


def _tokens(top):
    out = []
    stack = [top]
    numbers = {}
    held = []
    while stack:
        value = stack.pop()
        if value is None:
            out.append("null")
        elif isinstance(value, bool):
            out.append("bool true" if value else "bool false")
        elif type(value) is int:
            out.append(f"int {value}")
        elif type(value) is float:
            out.append("float nan" if value != value else "float " + struct.pack(">d", value).hex())
        elif type(value) is str:
            out.append("text " + value.encode("utf-8", "surrogatepass").hex())
        elif type(value) is bytes:
            out.append("bytes " + value.hex())
        elif type(value) is list:
            out.append(f"list {len(value)}")
            stack.extend(reversed(value))
        elif type(value) is dict:
            out.append(f"map {len(value)}")
            for key, item in reversed(list(value.items())):
                stack.append(item)
                stack.append(key)
        else:
            kept = next((k for k in _KEPT if isinstance(value, k[0])), None)
            if kept is None:
                out.append("other " + type(value).__name__)
            elif id(value) in numbers:
                out.append(f"{kept[1]} again {numbers[id(value)]}")
            else:
                numbers[id(value)] = len(numbers)
                held.append(value)
                out.append(f"{kept[1]} #{numbers[id(value)]}")
                stack.append(getattr(value, kept[2]))
    return out
`;
}

// GN-13e: the tokens of a result in PHP, as aliasTokens writes those of a case value: a stdClass is php_object, and a
// place of an array or of an object that is a PHP reference is php_reference before its value.
export const PHP_TOKENS = `

    /**
     * GN-13e: the texts of the places of a value in pre-order, depth first, which a loop writes: the form of each
     * place, a container with its count, and an object or a reference numbered by its first place.
     *
     * @return list<string>
     */
    private static function tokens(mixed $top): array
    {
        $out = [];
        $stack = [[$top, null]];
        $numbers = [];
        $count = 0;
        while ($stack !== []) {
            [$value, $place] = array_pop($stack);
            if ($place === 'key') {
                $out[] = is_int($value) ? 'int ' . $value : 'string ' . bin2hex($value);
                continue;
            }
            if ($place instanceof \\ReflectionReference) {
                $id = 'reference ' . $place->getId();
                if (isset($numbers[$id])) {
                    $out[] = 'php_reference again ' . $numbers[$id];
                    continue;
                }
                $numbers[$id] = $count++;
                $out[] = 'php_reference #' . $numbers[$id];
            }
            if ($value === null) {
                $out[] = 'null';
            } elseif (is_bool($value)) {
                $out[] = 'bool ' . ($value ? 'true' : 'false');
            } elseif (is_int($value)) {
                $out[] = 'int ' . $value;
            } elseif (is_float($value)) {
                $out[] = 'float ' . (is_nan($value) ? 'nan' : bin2hex(pack('E', $value)));
            } elseif (is_string($value)) {
                $out[] = 'string ' . bin2hex($value);
            } elseif (is_array($value)) {
                $list = array_is_list($value);
                $out[] = ($list ? 'list ' : 'map ') . count($value);
                self::places($value, $list, $stack);
            } elseif ($value instanceof \\stdClass) {
                $id = 'object ' . spl_object_id($value);
                if (isset($numbers[$id])) {
                    $out[] = 'php_object again ' . $numbers[$id];
                    continue;
                }
                $numbers[$id] = $count++;
                $properties = (array) $value;
                $out[] = 'php_object #' . $numbers[$id] . ' ' . count($properties);
                self::places($properties, false, $stack);
            } else {
                $out[] = 'other ' . get_debug_type($value);
            }
        }
        return $out;
    }

    /**
     * GN-13e: the places of an array on the stack of tokens, each with its key unless the array is a list, and with
     * the PHP reference that the place is.
     *
     * @param array<int|string, mixed> $array
     * @param list<array{mixed, mixed}> $stack
     */
    private static function places(array $array, bool $list, array &$stack): void
    {
        foreach (array_reverse(array_keys($array)) as $key) {
            $stack[] = [$array[$key], \\ReflectionReference::fromArrayElement($array, $key)];
            if (!$list) {
                $stack[] = [$key, 'key'];
            }
        }
    }
`;
