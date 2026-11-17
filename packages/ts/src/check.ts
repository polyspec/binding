// The contract check: every rule of a contract that the Rust compiler cannot judge (design I-2) and every rule that
// the design gives to the contract check. Each finding names its check id of docs/spec/contract-check.md.

import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import {
  CATEGORIES,
  type Category,
  type Contract,
  type Field,
  type Lang,
  type InRow,
  type Member,
  type OutRow,
  type When,
  type Name,
  type Parameter,
  type Service,
  type Type,
  type Unit,
  innerVariant,
  kindsOf,
  outerVariant,
} from './contract.ts';
import { carriers } from './generate/model.ts';
import { convert, libraryName, sameName, type Role } from './names.ts';
import { BUILTIN_FORMS, CONTENTLESS_KINDS, MADE_TYPE, PREDICATE_KINDS, builtinTypes, madePredicates } from './values.ts';

const LANG_KEYS = ['php', 'python', 'node', 'go', 'wasm'] as const;

export interface Finding {
  check: string;
  path: string;
  message: string;
}

export interface CheckOptions {
  // The contracts of the libraries that this contract names, by library name (T-3, E-1b). binding reads them from the
  // packages that Cargo resolved; the check takes them as values.
  dependencies?: ReadonlyMap<string, unknown>;
  // The case files that `cases` names, parsed, by their path from the repository root (K-1). Given, CK-22 also reads
  // the groups; binding check reads them from the repository.
  caseFiles?: ReadonlyMap<string, unknown>;
}

const schema: unknown = JSON.parse(
  readFileSync(new URL('../schema/interface.schema.json', import.meta.url), 'utf8'),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema as object);

// E-1a: the kinds of binding_core::BindingError and their fixed categories.
export const BINDING_KINDS: Readonly<Record<string, Category>> = {
  invalid_number: 'value',
  invalid_text: 'value',
  invalid_path: 'value',
  direct_construction: 'type',
  invalid_callback: 'type',
  consumed: 'type',
  invalid_argument_type: 'type',
  busy: 'busy',
  wrong_thread: 'busy',
  internal: 'internal',
};

// G-5: the symbol of an errno, which each target gives its value.
const ERRNO_SYMBOL = /^E[A-Z0-9]+$/;
// CK-22, B2.465 (GN-13): the kinds of a case value of a value alias for which the generator has a form.
const ALIAS_CASE_KINDS: ReadonlySet<string> = new Set(['null', 'bool', 'int', 'int64', 'float', 'text', 'bytes', 'list', 'map', 'object', 'reference']);
// G-5: a point is named <library>.<id> with the library in snake_case, as its crate's library name is.
export const pointLibrary = (library: string): string => library.replaceAll('-', '_');

const escape = (segment: string | number): string => String(segment).replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...segments: (string | number)[]): string => segments.map((s) => `/${escape(s)}`).join('');

// CK-2: the markers that `binding import` leaves (M-2).
function findTodos(value: unknown, path: string, out: string[]): void {
  if (value === 'todo') {
    out.push(path);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => findTodos(item, `${path}/${index}`, out));
  } else if (typeof value === 'object' && value !== null) {
    if (Object.hasOwn(value, 'todo')) {
      out.push(path);
      return;
    }
    for (const [key, item] of Object.entries(value)) findTodos(item, `${path}/${escape(key)}`, out);
  }
}

const related = (a: string, b: string): boolean => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

function schemaFindings(errors: readonly ErrorObject[], todos: readonly string[]): Finding[] {
  return errors
    .filter((error) => !todos.some((todo) => related(error.instancePath, todo)))
    .map((error) => ({
      check: 'CK-1',
      path: error.instancePath,
      message: `${error.message ?? 'is invalid'} (${error.schemaPath}${error.params === undefined ? '' : ` ${JSON.stringify(error.params)}`})`,
    }));
}

// CK-23: where each language reserves words for the names that a binding writes (N-2). PHP reserves its keywords and
// the names of its built-in types for a class and a function, case-insensitively, and allows them for a method, a
// property and a variable ($name); Python reserves its keywords everywhere; JavaScript reserves its reserved words, and
// in strict code eval and arguments, for a function, a class and a parameter, and allows them as a property name. Go
// writes every name with a capital, which no keyword has. The Rust names of the generated code escape a keyword (r#).
type Position = 'class' | 'function' | 'method' | 'field' | 'parameter' | 'constant';
const PHP_RESERVED = [
  '__halt_compiler', 'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone', 'const',
  'continue', 'declare', 'default', 'die', 'do', 'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach',
  'endif', 'endswitch', 'endwhile', 'enum', 'eval', 'exit', 'extends', 'final', 'finally', 'fn', 'for', 'foreach',
  'function', 'global', 'goto', 'if', 'implements', 'include', 'include_once', 'instanceof', 'insteadof', 'interface',
  'isset', 'list', 'match', 'namespace', 'new', 'or', 'print', 'private', 'protected', 'public', 'readonly', 'require',
  'require_once', 'return', 'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'xor', 'yield',
  'bool', 'false', 'float', 'int', 'iterable', 'mixed', 'never', 'null', 'object', 'parent', 'resource', 'self',
  'string', 'true', 'void', 'numeric',
];
const PYTHON_RESERVED = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or',
  'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
];
const JS_RESERVED = [
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum',
  'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import', 'in', 'instanceof',
  'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static', 'super', 'switch',
  'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'eval', 'arguments',
];
const RESERVED: Partial<Record<Lang, { words: ReadonlySet<string>; caseless: boolean; positions: readonly Position[] }>> = {
  php: { words: new Set(PHP_RESERVED), caseless: true, positions: ['class', 'function'] },
  python: { words: new Set(PYTHON_RESERVED), caseless: false, positions: ['class', 'function', 'method', 'field', 'parameter', 'constant'] },
  node: { words: new Set(JS_RESERVED), caseless: false, positions: ['class', 'function', 'parameter'] },
  wasm: { words: new Set(JS_RESERVED), caseless: false, positions: ['class', 'function', 'parameter'] },
};

// CK-96: the keys of a member case that G-5 gives a meaning, besides the parameters of the member and its result.
const CASE_META_KEYS: readonly string[] = ['id', 'rule', 'note', 'receiver', 'with', 'raises', 'after', 'then', 'faults', 'service', '@files', '@listener', 'repeat', 'awaits', 'targets'];

export function checkContract(raw: unknown, options: CheckOptions = {}): Finding[] {
  const todos: string[] = [];
  findTodos(raw, '', todos);
  const findings: Finding[] = todos.map((path) => ({
    check: 'CK-2',
    path,
    message: 'a todo of binding import is left; the contract is a draft (M-2)',
  }));
  if (validate(raw) !== true) findings.push(...schemaFindings(validate.errors ?? [], todos));
  if (findings.length > 0) return findings;
  return new Checker(raw as Contract, options).run();
}

interface Located<T> {
  value: T;
  path: string;
}

// GN-4b: the Cargo features of a core that gate the operations of platform I/O: paths of a file system, I/O that blocks
// the calling thread, waiting for another process and network sockets.
export const PLATFORM_FEATURES = ['fs', 'blocking-io', 'process', 'net'];

// GN-13f: what the calls of then of the instance values of a case arm: the kinds that their points fill, the libraries
// whose point internal they arm as broken, and whether any call arms a fault.
interface ThenFaults {
  fills: Set<string>;
  broken: Set<string>;
  any: boolean;
}

// CK-81: the names that package binding of a Go module declares itself, the types and the functions of the Go files that
// the generator writes for every contract (packages/ts/src/generate/go.ts); a test compares this list with that file.
export const GO_BINDING_NAMES: ReadonlySet<string> = new Set([
  'ArmFaults', 'BytesKey', 'Call', 'Callback', 'Cancel', 'Failed', 'FailedOf', 'FaultLeft', 'Function', 'IntKey', 'Kept', 'Key', 'KeyedMap', 'Malformed', 'Map', 'NativeCount', 'NewCall',
  'NewReader', 'NewRef', 'NewWriter', 'PanicTestHeld', 'Reader', 'RecognizeAs', 'Ref', 'TextKey', 'ThrownCount', 'Token', 'Writer',
]);

// GN-17: the words of a name in snake_case, the prefix of the C symbols of a contract, and whether Go takes a unit or
// a member by its `only`.
const goSnake = (name: Name): string => name.map((w) => (typeof w === 'string' ? w : w.acronym.toLowerCase())).join('_');
const goPrefix = (contract: Contract): string => `polyspec_${contract.library.replaceAll('-', '_')}_`;
const goTakes = (only: { targets: readonly string[] } | undefined): boolean => only === undefined || only.targets.includes('go');

class Checker {
  readonly contract: Contract;
  readonly dependencies: ReadonlyMap<string, unknown>;
  readonly findings: Finding[] = [];
  readonly units = new Map<string, Located<Unit>>();
  readonly members = new Map<string, { member: Member; unit: Unit; path: string }>();
  readonly dependencyContracts = new Map<string, Contract | null>();
  readonly caseFiles: ReadonlyMap<string, unknown> | undefined;

  constructor(contract: Contract, options: CheckOptions) {
    this.contract = contract;
    this.dependencies = options.dependencies ?? new Map();
    this.caseFiles = options.caseFiles;
  }

  report(check: string, path: string, message: string): void {
    this.findings.push({ check, path, message });
  }

  run(): Finding[] {
    this.index();
    this.references();
    this.namingExceptions();
    this.optionalReturns();
    this.cycles();
    this.valueUnits();
    this.aliasRaises();
    this.otherRepositories();
    this.errors();
    this.wrappedErrors();
    this.records();
    this.goNames();
    this.goSymbols();
    this.modules();
    this.wasmOnly();
    this.awaitableNames();
    this.reservedNames();
    this.variantTags();
    this.waitingMembers();
    this.constructibleClasses();
    this.keptClassTargets();
    this.keptCallbacks();
    this.variantCores();
    this.cleanupCases();
    this.callbacks();
    this.generatedInterfaces();
    this.packageNames();
    this.coreBuild();
    this.caseLinks();
    return this.findings;
  }

  // ---- shared helpers ----

  index(): void {
    this.contract.units.forEach((unit, u) => {
      const path = pointer('units', u);
      if (this.units.has(unit.id)) this.report('CK-3', `${path}/id`, `the unit id ${unit.id} is declared twice`);
      else this.units.set(unit.id, { value: unit, path });
      (unit.members ?? []).forEach((member, m) => {
        const memberPath = `${path}${pointer('members', m)}`;
        if (this.members.has(member.id) || this.units.has(member.id)) {
          this.report('CK-3', `${memberPath}/id`, `the id ${member.id} is declared twice`);
        } else {
          this.members.set(member.id, { member, unit, path: memberPath });
        }
      });
    });
  }

  unit(id: string): Unit | undefined {
    return this.units.get(id)?.value;
  }

  // E-1, E-1b: the contract of a library that the check was given, read without a finding; the checks that own a
  // reference to it report a missing one.
  given(library: string): Contract | undefined {
    const raw = this.dependencies.get(library);
    return raw !== undefined && validate(raw) === true ? (raw as Contract) : undefined;
  }

  // E-1, E-3: every kind that the core error gives, with its category. A row gives the kinds of its `kinds`, or the
  // one kind of its variant's name; a kind of a dependency (E-1b (a)) takes both from that library's row.
  kindCategories(): Map<string, Category | undefined> {
    const kinds = new Map<string, Category | undefined>();
    for (const row of this.contract.errors.kinds) {
      const owner = row.library === undefined ? row : this.given(row.library)?.errors.kinds.find((k) => k.variant === innerVariant(row.variant));
      for (const kind of kindsOf(owner ?? row)) kinds.set(kind, owner?.category);
    }
    return kinds;
  }

  dependency(library: string, path: string, check: string): Contract | null {
    const cached = this.dependencyContracts.get(library);
    if (cached !== undefined) return cached;
    const raw = this.dependencies.get(library);
    let contract: Contract | null = null;
    if (raw === undefined) {
      this.report(check, path, `the contract of the library ${library} is not available to the check`);
    } else if (validate(raw) !== true) {
      this.report(check, path, `the contract of the library ${library} does not pass the schema`);
    } else {
      contract = raw as Contract;
    }
    this.dependencyContracts.set(library, contract);
    return contract;
  }

  // The language name of a unit, member, parameter or field, after naming exceptions (N-2, N-3).
  langName(lang: Lang, unit: Unit, name: Name, role: Role, member?: Member, sub?: { parameter?: Name; field?: Name }): string {
    const exception = this.contract.naming.exceptions.find(
      (e) =>
        e.lang === lang &&
        e.unit === unit.id &&
        e.member === member?.id &&
        (sub?.parameter === undefined ? e.parameter === undefined : e.parameter !== undefined && sameName(e.parameter, sub.parameter)) &&
        (sub?.field === undefined ? e.field === undefined : e.field !== undefined && sameName(e.field, sub.field)),
    );
    return exception === undefined ? convert(name, lang, role) : exception.name;
  }

  memberRole(unit: Unit): Role {
    return unit.kind === 'record' ? 'variable' : 'callable';
  }

  // Every type position of a member with its path.
  *memberTypes(member: Member, path: string): Generator<Located<Type>> {
    for (const [p, parameter] of (member.parameters ?? []).entries()) {
      yield { value: parameter.type, path: `${path}${pointer('parameters', p, 'type')}` };
    }
    if (member.returns !== undefined) yield { value: member.returns, path: `${path}/returns` };
    if (member.type !== undefined) yield { value: member.type, path: `${path}/type` };
    if (member.yields !== undefined) {
      if (typeof member.yields === 'object' && 'key' in member.yields && 'value' in member.yields) {
        yield { value: member.yields.key, path: `${path}/yields/key` };
        yield { value: member.yields.value, path: `${path}/yields/value` };
      } else {
        yield { value: member.yields as Type, path: `${path}/yields` };
      }
    }
  }

  *unitFieldTypes(unit: Unit, path: string): Generator<Located<Type>> {
    for (const [f, field] of (unit.fields ?? []).entries()) yield { value: field.type, path: `${path}${pointer('fields', f, 'type')}` };
    for (const [c, kase] of (unit.cases ?? []).entries()) {
      for (const [f, field] of kase.fields.entries()) {
        yield { value: field.type, path: `${path}${pointer('cases', c, 'fields', f, 'type')}` };
      }
    }
  }

  // Every type position of the contract.
  *allTypes(): Generator<Located<Type>> {
    for (const { value: unit, path } of this.units.values()) {
      yield* this.unitFieldTypes(unit, path);
      for (const [m, member] of (unit.members ?? []).entries()) yield* this.memberTypes(member, `${path}${pointer('members', m)}`);
    }
  }

  // The direct parts of a type.
  static children(type: Type): Type[] {
    if (typeof type === 'string') return [];
    if ('list' in type) return [type.list];
    if ('map' in type) return [type.map];
    if ('optional' in type) return [type.optional];
    if ('keyed_map' in type) return [type.keyed_map];
    if ('tuple' in type) return type.tuple;
    if ('function' in type) return [...type.function.parameters, type.function.returns];
    return [];
  }

  static *walk(type: Type): Generator<Type> {
    yield type;
    for (const child of Checker.children(type)) yield* Checker.walk(child);
  }

  // ---- CK-3: references ----

  references(): void {
    const targets = new Set(this.contract.targets);
    const langOk = (lang: string, path: string, what: string): void => {
      if (!targets.has(lang as Lang)) this.report('CK-3', path, `${what} names ${lang}, which is not a target`);
    };
    const packageOf: Record<Lang, string> = { php: 'php', python: 'python', node: 'node', wasm: 'node', go: 'go' };
    for (const lang of this.contract.targets) {
      if (this.contract.packages[packageOf[lang]] === undefined) {
        this.report('CK-3', `/packages`, `the target ${lang} has no packages.${packageOf[lang]} entry (P-1)`);
      }
    }
    for (const { value: unit, path } of this.units.values()) {
      for (const lang of unit.only?.targets ?? []) langOk(lang, `${path}/only`, 'only');
      for (const lang of Object.keys(unit.native ?? {})) langOk(lang, `${path}/native/${lang}`, 'native');
      if (unit.parent !== undefined && this.unit(unit.parent) === undefined) {
        this.report('CK-3', `${path}/parent`, `the parent ${unit.parent} is not a unit`);
      }
      for (const [i, ref] of (unit.implements ?? []).entries()) {
        if (ref.library !== undefined && ref.library !== this.contract.library) continue;
        const target = this.unit(ref.unit);
        if (target === undefined) this.report('CK-3', `${path}/implements/${i}`, `${ref.unit} is not a unit`);
        else if (target.kind !== 'interface') {
          this.report('CK-3', `${path}/implements/${i}`, `${ref.unit} is a ${target.kind}, not an interface`);
        }
      }
      if (unit.cleanup !== undefined && this.members.get(unit.cleanup)?.unit !== unit) {
        this.report('CK-3', `${path}/cleanup`, `the cleanup ${unit.cleanup} is not a member of ${unit.id}`);
      }
      for (const [m, member] of (unit.members ?? []).entries()) {
        const memberPath = `${path}${pointer('members', m)}`;
        for (const lang of member.only?.targets ?? []) langOk(lang, `${memberPath}/only`, 'only');
        for (const lang of Object.keys(member.native ?? {})) langOk(lang, `${memberPath}/native/${lang}`, 'native');
        for (const [p, parameter] of (member.parameters ?? []).entries()) {
          this.defaultReference(parameter, `${memberPath}${pointer('parameters', p)}`);
        }
      }
      for (const [f, field] of (unit.fields ?? []).entries()) this.defaultReference(field, `${path}${pointer('fields', f)}`);
    }
    for (const { value: type, path } of this.allTypes()) {
      for (const part of Checker.walk(type)) {
        if (typeof part === 'string') {
          if ((part === 'json_value' || part === 'template_value' || part === 'php_value') && this.contract.types[part] === undefined) {
            this.report('CK-3', path, `${part} is used but types.${part} does not name its owner`);
          }
        } else if ('unit' in part && (part.library === undefined || part.library === this.contract.library)) {
          if (this.unit(part.unit) === undefined) this.report('CK-3', path, `${part.unit} is not a unit`);
        }
      }
    }
    for (const [i, kase] of this.contract.cases.entries()) {
      if (kase.member !== undefined) {
        if (!this.members.has(kase.member)) this.report('CK-3', `/cases/${i}/member`, `${kase.member} is not a member`);
      } else {
        const unit = this.unit(kase.alias);
        if (unit?.kind !== 'alias' || typeof unit.core !== 'object') this.report('CK-3', `/cases/${i}/alias`, `${kase.alias} is not a value alias with core: {in, out} (U-7)`);
      }
    }
    // G-5: a fault injection point is named by its id, and what it fills is a kind of the core error (E-1).
    const points = new Set<string>();
    const kinds = this.kindCategories();
    for (const [i, point] of (this.contract.faults ?? []).entries()) {
      if (points.has(point.id)) this.report('CK-3', `/faults/${i}/id`, `the fault injection point ${point.id} is declared twice`);
      points.add(point.id);
      for (const [f, kind] of point.fills.entries()) {
        if (!kinds.has(kind)) this.report('CK-3', `/faults/${i}/fills/${f}`, `${kind} is not a kind of errors.kinds (E-1)`);
      }
    }
    // CK-95, GN-13j: a service of the test run is named by its id.
    const services = new Set<string>();
    for (const [i, service] of (this.contract.services ?? []).entries()) {
      if (services.has(service.id)) this.report('CK-95', `/services/${i}/id`, `the service ${service.id} is declared twice (GN-13j)`);
      services.add(service.id);
    }
    for (const [i, change] of this.contract.changes.entries()) {
      for (const lang of Object.keys(change.from)) langOk(lang, `/changes/${i}/from/${lang}`, 'a change');
      if (typeof change.to === 'string' && !this.members.has(change.to) && !this.units.has(change.to)) {
        this.report('CK-3', `/changes/${i}/to`, `${change.to} is neither a unit nor a member`);
      }
    }
  }

  defaultReference(item: Parameter | Field, path: string): void {
    const declared = item.default;
    if (declared !== undefined && 'const' in declared) {
      const target = this.members.get(declared.const);
      if (target?.member.kind !== 'constant') this.report('CK-3', `${path}/default/const`, `${declared.const} is not a constant`);
    }
  }

  // ---- CK-4: naming exceptions (N-3) ----

  namingExceptions(): void {
    const seen = new Set<string>();
    for (const [i, exception] of this.contract.naming.exceptions.entries()) {
      const path = `/naming/exceptions/${i}`;
      if (!this.contract.targets.includes(exception.lang)) {
        this.report('CK-4', `${path}/lang`, `${exception.lang} is not a target`);
        continue;
      }
      const unit = this.unit(exception.unit);
      if (unit === undefined) {
        this.report('CK-4', `${path}/unit`, `${exception.unit} is not a unit`);
        continue;
      }
      let converted: string;
      if (exception.member !== undefined) {
        const located = this.members.get(exception.member);
        if (located === undefined || located.unit !== unit) {
          this.report('CK-4', `${path}/member`, `${exception.member} is not a member of ${unit.id}`);
          continue;
        }
        if (exception.parameter !== undefined) {
          const wanted = exception.parameter;
          const parameter = (located.member.parameters ?? []).find((p) => sameName(p.name, wanted));
          if (parameter === undefined) {
            this.report('CK-4', `${path}/parameter`, `${exception.member} has no such parameter`);
            continue;
          }
          converted = convert(parameter.name, exception.lang, 'variable');
        } else if (exception.field !== undefined) {
          this.report('CK-4', `${path}/field`, 'a field belongs to a record unit, not to a member');
          continue;
        } else {
          converted = convert(located.member.name, exception.lang, this.memberRole(unit));
        }
      } else if (exception.parameter !== undefined) {
        this.report('CK-4', `${path}/parameter`, 'a parameter exception names its member');
        continue;
      } else if (exception.field !== undefined) {
        const wanted = exception.field;
        const field = [...(unit.fields ?? []), ...(unit.cases ?? []).flatMap((c) => c.fields)].find((f) => sameName(f.name, wanted));
        if (field === undefined) {
          this.report('CK-4', `${path}/field`, `${unit.id} has no such field`);
          continue;
        }
        converted = convert(field.name, exception.lang, 'variable');
      } else {
        converted = convert(unit.name, exception.lang, unit.kind === 'functions' ? 'callable' : 'class');
      }
      if (converted === exception.name) {
        this.report('CK-4', `${path}/name`, `${exception.name} is the converted name itself, so the exception changes nothing`);
      }
      const key = JSON.stringify([exception.lang, exception.unit, exception.member, exception.parameter, exception.field]);
      if (seen.has(key)) this.report('CK-4', path, 'the same symbol has two exceptions in one language');
      seen.add(key);
    }
  }

  // ---- CK-5: optional returns (T-5) ----

  optionalReturns(): void {
    // T-4: a record field of type optional<T> states the rule that makes it optional, as an optional return does (T-5).
    for (const { value: unit, path } of this.units.values()) {
      const fields: Located<Field>[] = [
        ...(unit.fields ?? []).map((f, i) => ({ value: f, path: `${path}${pointer('fields', i)}` })),
        ...(unit.cases ?? []).flatMap((c, ci) => c.fields.map((f, i) => ({ value: f, path: `${path}${pointer('cases', ci, 'fields', i)}` }))),
      ];
      for (const { value: field, path: fieldPath } of fields) {
        const optional = typeof field.type === 'object' && 'optional' in field.type;
        if (optional && field.reason === undefined) {
          this.report('CK-5', fieldPath, 'a field of type optional<T> states the rule that makes it optional (T-4)');
        }
        if (!optional && field.reason !== undefined) {
          this.report('CK-5', `${fieldPath}/reason`, 'only a field of type optional<T> has a reason (T-4)');
        }
      }
    }
    for (const { member, path } of this.members.values()) {
      const optional = typeof member.returns === 'object' && 'optional' in member.returns;
      if (optional && member.optional_reason === undefined) {
        this.report('CK-5', `${path}/returns`, `${member.id} returns optional<T> without optional_reason (T-5)`);
      }
      if (!optional && member.optional_reason !== undefined) {
        this.report('CK-5', `${path}/optional_reason`, `${member.id} does not return optional<T>`);
      }
    }
  }

  // ---- CK-6: cycles of implements and parent (P-4) ----

  cycles(): void {
    const edges = (unit: Unit): string[] => [
      ...(unit.implements ?? []).filter((r) => r.library === undefined || r.library === this.contract.library).map((r) => r.unit),
      ...(unit.parent === undefined ? [] : [unit.parent]),
    ];
    const state = new Map<string, 'open' | 'done'>();
    const reported = new Set<string>();
    const visit = (id: string, stack: string[]): void => {
      const mark = state.get(id);
      if (mark === 'done') return;
      if (mark === 'open') {
        const cycle = stack.slice(stack.indexOf(id));
        const key = [...cycle].sort().join(',');
        if (!reported.has(key)) {
          reported.add(key);
          const located = this.units.get(id);
          this.report('CK-6', located?.path ?? '', `implements and parent form a cycle: ${[...cycle, id].join(' -> ')}`);
        }
        return;
      }
      const unit = this.unit(id);
      if (unit === undefined) return;
      state.set(id, 'open');
      for (const next of edges(unit)) visit(next, [...stack, id]);
      state.set(id, 'done');
    };
    for (const id of this.units.keys()) visit(id, []);
  }

  // ---- CK-8: value units (U-1) ----

  valueUnits(): void {
    for (const { member, unit, path } of this.members.values()) {
      if (member.writable === true && (unit.origin !== 'value' || member.kind !== 'property')) {
        this.report('CK-8', `${path}/writable`, 'only a property of a value unit is writable (U-1, U-2)');
      }
    }
    // U-1: the unit that represents a value type holds out and in: the class when the value type is one class, the
    // alias when it gathers several; a class that an alias gathers holds neither.
    const gathered = new Map<string, string>();
    for (const { value: unit } of this.units.values()) {
      if (unit.kind !== 'alias') continue;
      for (const row of unit.in ?? []) {
        const type = LANG_KEYS.map((l) => row[l]).find((t) => t !== undefined);
        if (type !== undefined && this.unit(type) !== undefined) gathered.set(type, unit.id);
      }
    }
    for (const { value: unit, path } of this.units.values()) {
      if (unit.kind === 'alias' && unit.origin !== 'value') {
        this.report('CK-8', `${path}/origin`, 'an alias names a union of value types; its origin is value (U-7 (a))');
      }
      if (unit.origin !== 'value') continue;
      const by = gathered.get(unit.id);
      const holds = unit.out !== undefined || unit.in !== undefined;
      if (by !== undefined && typeof unit.core === 'object' && unit.core !== null) {
        this.report('CK-8', `${path}/core`, `${unit.id} is gathered by the alias ${by}, which names core: {in, out} (U-1, GN-6x)`);
      }
      if (by !== undefined && holds) {
        this.report('CK-8', path, `${unit.id} is gathered by the alias ${by}, which holds the out and in tables (U-1)`);
      } else if (by === undefined && (unit.out === undefined || unit.in === undefined)) {
        this.report('CK-8', path, `${unit.id} represents its value type, so it holds out and in (U-1)`);
      }
      if (by === undefined && holds) this.valueUnit(unit, path, gathered);
    }
  }

  // GN-6x, B2.89: a case of the kind text of a class with by may name units, a member that gives the UTF-16 code units
  // of a text as a list of uint; its read then gives an optional text, none for a text with an unpaired surrogate.
  unitsCase(kase: InRow['cases'][number], read: Member | undefined, by: boolean, path: string): void {
    if (kase.kind !== 'text' || !by) {
      this.report('CK-8', `${path}/units`, `only a case of the kind text of a row with by names units, not a case of the kind ${kase.kind} (GN-6x)`);
      return;
    }
    const units = this.publicMember(kase.units ?? '', `${path}/units`, 'units');
    const returns = units?.returns;
    if (units !== undefined && !(typeof returns === 'object' && returns !== null && 'list' in returns && returns.list === 'uint')) {
      this.report('CK-8', `${path}/units`, `units ${kase.units ?? ''} gives no list of uint, the UTF-16 code units of a text (GN-6x)`);
    }
    const text = read?.returns;
    if (read !== undefined && !(typeof text === 'object' && text !== null && 'optional' in text && text.optional === 'text')) {
      this.report('CK-8', `${path}/read`, `read ${kase.read ?? ''} of a case with units gives no optional text, whose none names a text with an unpaired surrogate (GN-6x)`);
    }
  }

  publicMember(id: string, path: string, what: string, kinds?: readonly string[]): Member | undefined {
    const located = this.members.get(id);
    if (located === undefined) {
      this.report('CK-8', path, `${what} ${id} is not a member`);
      return undefined;
    }
    if (located.member.visibility !== 'public' || located.unit.visibility !== 'public') {
      this.report('CK-8', path, `${what} ${id} is not public`);
    }
    if (kinds !== undefined && !kinds.includes(located.member.kind)) {
      this.report('CK-8', path, `${what} ${id} is a ${located.member.kind}, not a ${kinds.join(' or ')}`);
    }
    return located.member;
  }

  // The rows or the cases of one kind select every value exactly once (U-1, U-7 (b), (f)): one without when; or a
  // predicate's true and false; or distinct predicate values and one else for the rest.
  partition(what: string, items: Located<{ when?: When }>[]): void {
    const first = items[0];
    if (first === undefined) return;
    if (items.length === 1) {
      const when = first.value.when;
      if (when !== undefined && when !== 'else') {
        this.report('CK-8', `${first.path}/when`, `the ${what} do not cover the case where ${when.predicate} is ${!when.is}`);
      }
      return;
    }
    const elses = items.filter((r) => r.value.when === 'else');
    const selective = items.flatMap((r) => (r.value.when === undefined || r.value.when === 'else' ? [] : [r.value.when]));
    if (selective.length + elses.length !== items.length) {
      this.report('CK-8', first.path, `one of the ${what} has no when beside others, so some values are selected twice`);
      return;
    }
    const keys = selective.map((w) => `${w.predicate}=${w.is}`);
    if (new Set(keys).size !== keys.length) {
      this.report('CK-8', first.path, `two of the ${what} select the same predicate value`);
      return;
    }
    if (elses.length > 1) {
      this.report('CK-8', first.path, `the ${what} have ${elses.length} else`);
    } else if (elses.length === 0) {
      const predicates = new Set(selective.map((w) => w.predicate));
      if (predicates.size !== 1 || selective.length !== 2) {
        this.report('CK-8', first.path, `the ${items.length} ${what} are neither a predicate's true and false nor rows with an else`);
      }
    }
  }

  valueUnit(unit: Unit, path: string, gathered: ReadonlyMap<string, string>): void {
    const targets = this.contract.targets;
    // U-7: a value alias is made and judged by the core functions that core names; a class judges its own values.
    if (unit.kind === 'alias' && (typeof unit.core !== 'object' || unit.core === null)) {
      this.report('CK-8', path, `the value alias ${unit.id} names the core functions that judge and give its values in core: {in, out} (U-7)`);
    }
    // GN-6x: the class that represents its value type may name the functions through which another repository takes
    // and gives its values, with the core type that they take and give.
    if (unit.kind !== 'alias' && typeof unit.core === 'object' && unit.core !== null && unit.core_type === undefined) {
      this.report('CK-8', path, `the value class ${unit.id} names core: {in, out} and no core_type (GN-6x)`);
    }
    // The unit types this representative may name: itself when it is a class, its gathered classes when it is an alias.
    const ownTypes = new Set(unit.kind === 'alias' ? [...gathered].filter(([, by]) => by === unit.id).map(([id]) => id) : [unit.id]);
    const rows = new Map<string, InRow>();
    for (const [r, row] of (unit.in ?? []).entries()) {
      const rowPath = `${path}${pointer('in', r)}`;
      const lang = LANG_KEYS.find((l) => row[l] !== undefined);
      if (lang === undefined) continue;
      const type = row[lang] as string;
      if (!targets.includes(lang)) this.report('CK-8', `${rowPath}/${lang}`, `${lang} is not a target`);
      const isBuiltin = builtinTypes(lang).has(type);
      if (!isBuiltin && !ownTypes.has(type)) {
        this.report('CK-8', `${rowPath}/${lang}`, `${type} is neither a built-in ${lang} type of binding nor ${unit.kind === 'alias' ? 'a class gathered by ' : ''}${unit.id}`);
      }
      const key = `${lang}\u0000${type}`;
      if (rows.has(key)) this.report('CK-8', rowPath, `${lang} ${type} has two in rows`);
      rows.set(key, row);
      if (row.by !== undefined) {
        const by = this.publicMember(row.by, `${rowPath}/by`, 'by');
        const returns = by?.returns;
        const enumUnit = typeof returns === 'object' && 'unit' in returns && returns.library === undefined ? this.unit(returns.unit) : undefined;
        if (by !== undefined && enumUnit?.kind !== 'enum') {
          this.report('CK-8', `${rowPath}/by`, `by ${row.by} does not return an enum unit of this contract`);
        }
        const seen = new Map<string, number>();
        for (const [c, kase] of row.cases.entries()) {
          if (kase.is === undefined) this.report('CK-8', `${rowPath}/cases/${c}`, 'a row with by gives every case its is');
          else seen.set(kase.is, (seen.get(kase.is) ?? 0) + 1);
          if (kase.when !== undefined) this.report('CK-8', `${rowPath}/cases/${c}/when`, 'a row with by selects its case by is, not by when');
        }
        for (const variant of enumUnit?.variants ?? []) {
          const count = seen.get(variant.value) ?? 0;
          if (count !== 1) {
            this.report('CK-8', `${rowPath}/cases`, `the enum value ${variant.value} of ${enumUnit?.id} appears ${count} times, not once`);
          }
          seen.delete(variant.value);
        }
        for (const extra of seen.keys()) {
          if (enumUnit !== undefined) this.report('CK-8', `${rowPath}/cases`, `${extra} is not a value of ${enumUnit.id}`);
        }
      } else {
        for (const [c, kase] of row.cases.entries()) {
          if (kase.is !== undefined) this.report('CK-8', `${rowPath}/cases/${c}/is`, 'a row without by has no is');
          if (kase.when !== undefined && !isBuiltin) {
            this.report('CK-8', `${rowPath}/cases/${c}/when`, 'only a built-in language type splits its cases by when (U-7 (f))');
          }
        }
        if (isBuiltin) {
          this.partition('cases', row.cases.map((kase, c) => ({ value: kase, path: `${rowPath}/cases/${c}` })));
        } else if (row.cases.length !== 1) {
          this.report('CK-8', `${rowPath}/cases`, 'a row without by has exactly one case');
        }
      }
      for (const [c, kase] of row.cases.entries()) {
        // U-1: a kind without content (null, and native, which the core never opens) has nothing to read.
        if (CONTENTLESS_KINDS.has(kase.kind)) {
          if (kase.read !== undefined) this.report('CK-8', `${rowPath}/cases/${c}/read`, `a case of kind ${kase.kind} has nothing to read (U-1)`);
          continue;
        }
        if (isBuiltin && kase.read !== 'builtin') {
          this.report('CK-8', `${rowPath}/cases/${c}`, 'a case of a built-in language type has read: builtin (U-7 (e))');
        }
        if (!isBuiltin && (kase.read === undefined || kase.read === 'builtin')) {
          this.report('CK-8', `${rowPath}/cases/${c}`, 'a case of a value unit type names its read member');
        }
        const read = kase.read !== undefined && kase.read !== 'builtin' ? this.publicMember(kase.read, `${rowPath}/cases/${c}/read`, 'read') : undefined;
        if (kase.units !== undefined) this.unitsCase(kase, read, row.by !== undefined, `${rowPath}/cases/${c}`);
      }
    }
    const byKind = new Map<string, Located<OutRow>[]>();
    for (const [r, row] of (unit.out ?? []).entries()) {
      const rowPath = `${path}${pointer('out', r)}`;
      byKind.set(row.kind, [...(byKind.get(row.kind) ?? []), { value: row, path: rowPath }]);
      if (row.when !== undefined && row.when !== 'else' && !PREDICATE_KINDS[row.when.predicate]?.includes(row.kind)) {
        this.report('CK-8', `${rowPath}/when`, `${row.when.predicate} applies to ${PREDICATE_KINDS[row.when.predicate]?.join(' or ')}, not to ${row.kind}`);
      }
      for (const lang of targets) {
        if (row.make[lang] === undefined) this.report('CK-8', `${rowPath}/make`, `the row makes no ${lang} value`);
      }
      for (const [lang, given] of Object.entries(row.make) as [Lang, NonNullable<OutRow['make'][Lang]>][]) {
        const makePath = `${rowPath}/make/${lang}`;
        if (!targets.includes(lang)) {
          this.report('CK-8', makePath, `${lang} is not a target`);
          continue;
        }
        // U-1: a value of another repository's value type is made by that repository's binding; the row's kind is
        // nested:<value type>, and the owning contract proves its own round trip.
        if (typeof given === 'object' && 'value' in given) {
          if (row.kind !== `nested:${given.value}`) {
            this.report('CK-8', makePath, `make {value: ${given.value}} belongs to the kind nested:${given.value}, not to ${row.kind}`);
          }
          continue;
        }
        if (row.kind.startsWith('nested:')) {
          this.report('CK-8', makePath, `the kind ${row.kind} is made by {value: ${row.kind.slice('nested:'.length)}}`);
          continue;
        }
        // U-7 (c): keyed_map is a built-in form with the key kinds it mixes.
        const make = typeof given === 'object' ? 'keyed_map' : given;
        let made: string | undefined;
        let form: string | undefined;
        // VAL-18: the form native and the kind native go together; a native value is the object that entered.
        if ((make === 'native') !== (row.kind === 'native')) {
          this.report('CK-8', makePath, row.kind === 'native' ? 'the kind native is made by the form native' : `the form native makes the kind native, not ${row.kind}`);
          continue;
        }
        if ((BUILTIN_FORMS as readonly string[]).includes(make)) {
          // GN-6x: the string of PHP and Go cannot hold an unpaired surrogate, so a member of a class makes text16.
          if (row.kind === 'text16') {
            this.report('CK-8', makePath, `the kind text16 is made by a member of a class, not by the built-in form ${make} (GN-6x)`);
            continue;
          }
          made = MADE_TYPE[lang][make];
          form = make;
          if (made === undefined) this.report('CK-8', makePath, `${lang} has no built-in ${make} value`);
        } else {
          const member = this.publicMember(make, makePath, 'make', ['constructor', 'static']);
          const owner = this.members.get(make)?.unit;
          if (member !== undefined && (owner === undefined || !ownTypes.has(owner.id))) {
            this.report('CK-8', makePath, `${make} is not a member of ${unit.kind === 'alias' ? 'a class gathered by ' : ''}${unit.id}`);
            continue;
          }
          made = owner?.id;
        }
        if (made === undefined) continue;
        const into = rows.get(`${lang}\u0000${made}`);
        if (into === undefined) {
          this.report('CK-8', makePath, `no in row of ${lang} classifies ${made}, so the value does not come back (P-3)`);
          continue;
        }
        const siblings = (unit.out ?? []).filter((other) => other !== row && other.kind === row.kind);
        this.roundTrip(row, makePath, into, lang, made, form, siblings);
      }
    }
    for (const [kind, kindRows] of byKind) this.partition(`out rows of ${kind}`, kindRows);
  }

  // U-7 (f): the in case that a made value meets. A built-in value's predicates come from binding's closed table (the
  // form and the out row's kind and when); the case is the first whose when holds. A value of a class is classified by
  // its by member at run time, so the row's kind must name exactly one case. Whether the case's kind is the row's kind
  // is the round trip (P-3); a check that passes when any case matches would pass a wrong classification.
  roundTrip(row: OutRow, path: string, into: InRow, lang: Lang, made: string, form: string | undefined, siblings: readonly OutRow[]): void {
    let chosen: string | undefined;
    if (into.by !== undefined) {
      // GN-6x, P-3, B2.89: a case of the kind text with units reads a text with an unpaired surrogate as its UTF-16 code
      // units, so it is also the case of the kind text16.
      const matching = into.cases.filter((c) => c.kind === row.kind || (row.kind === 'text16' && c.kind === 'text' && c.units !== undefined));
      if (matching.length !== 1) {
        this.report('CK-8', path, `${lang} ${made} has ${matching.length} cases of kind ${row.kind}; its by value cannot name one (P-3)`);
        return;
      }
      chosen = row.kind;
    } else {
      const known = madePredicates(form, row, siblings);
      const possible = new Set<string | undefined>();
      let reachable = true;
      let unknown: string | undefined;
      for (const kase of into.cases) {
        const when = kase.when;
        if (when === undefined || when === 'else') {
          possible.add(kase.kind);
          reachable = false;
          break;
        }
        const value = known.get(when.predicate);
        if (value === undefined) {
          if (!PREDICATE_KINDS[when.predicate]?.includes(row.kind)) {
            this.report('CK-8', path, `the ${lang} value of this row does not tell ${when.predicate}, which the in row of ${made} asks (U-7 (f))`);
            return;
          }
          // The matching path ends here. Only its opposite reaches later cases, so a repeated predicate must
          // agree with that constraint. No inference equates a large integral float with a fractional one.
          possible.add(kase.kind);
          known.set(when.predicate, !when.is);
          unknown ??= when.predicate;
        } else if (value === when.is) {
          possible.add(kase.kind);
          reachable = false;
          break;
        }
      }
      if (reachable) possible.add(undefined);
      if (possible.size > 1) {
        this.report('CK-8', path, `the ${lang} value of this row does not tell ${unknown ?? 'the predicate'}, which the in row of ${made} asks; reachable cases disagree or leave a value unclassified (U-7 (f))`);
        return;
      }
      chosen = possible.values().next().value;
    }
    if (chosen === undefined) {
      this.report('CK-8', path, `no case of the in row of ${lang} ${made} takes the value of this row (P-3)`);
    } else if (chosen !== row.kind) {
      this.report('CK-8', path, `${lang} ${made} comes back as ${chosen}, not as ${row.kind} (P-3)`);
    }
  }

  // ---- CK-9: units of other repositories (T-3) ----

  otherRepositories(): void {
    for (const { value: type, path } of this.allTypes()) {
      for (const part of Checker.walk(type)) {
        if (typeof part === 'object' && 'unit' in part && part.library !== undefined && part.library !== this.contract.library) {
          this.foreignUnit(part.library, part.unit, path, new Set());
        }
      }
    }
    for (const [name, owner] of Object.entries(this.contract.types)) {
      if (owner === undefined || owner.library === this.contract.library) {
        if (owner !== undefined && this.unit(owner.unit)?.origin !== 'value') {
          this.report('CK-9', `/types/${name}`, `${owner.unit} is not a value unit`);
        }
        continue;
      }
      const dependency = this.dependency(owner.library, `/types/${name}`, 'CK-9');
      const unit = dependency?.units.find((u) => u.id === owner.unit);
      if (dependency !== null && unit?.origin !== 'value') {
        this.report('CK-9', `/types/${name}`, `${owner.library} has no value unit ${owner.unit}`);
      }
    }
  }

  // A unit of another repository used in this contract: a value, callback, enum, record or variant unit, and a
  // callback's members use only types of their own repository (T-3).
  foreignUnit(library: string, id: string, path: string, seen: Set<string>): void {
    const key = `${library}\u0000${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const dependency = this.dependency(library, path, 'CK-9');
    if (dependency === null) return;
    const unit = dependency.units.find((u) => u.id === id);
    if (unit === undefined) {
      this.report('CK-9', path, `${library} has no unit ${id}`);
      return;
    }
    const allowed = unit.origin === 'value' || unit.origin === 'callback' || ['enum', 'record', 'variant'].includes(unit.kind);
    if (!allowed) {
      this.report('CK-9', path, `${library} ${id} is a ${unit.origin} ${unit.kind}; another repository's unit here is a value, callback, enum, record or variant unit (T-3, G-4)`);
      return;
    }
    if (unit.origin !== 'callback' && unit.kind !== 'record' && unit.kind !== 'variant') return;
    const inner: Type[] = [...(unit.fields ?? []), ...(unit.cases ?? []).flatMap((c) => c.fields)].map((f) => f.type);
    for (const member of unit.members ?? []) {
      for (const parameter of member.parameters ?? []) inner.push(parameter.type);
      if (member.returns !== undefined) inner.push(member.returns);
    }
    // A named type of the owner (types) is the unit that it names. A unit of a third library is checked by the same
    // rule against the contract of that library, which the check reads with the others (T-3).
    const named = dependency.types as Record<string, { library: string; unit: string } | undefined>;
    for (const type of inner) {
      for (const part of Checker.walk(type)) {
        const unitOf = typeof part === 'string' ? named[part] : typeof part === 'object' && 'unit' in part ? { library: part.library ?? library, unit: part.unit } : undefined;
        if (unitOf !== undefined) this.foreignUnit(unitOf.library, unitOf.unit, path, seen);
      }
    }
  }

  // ---- CK-10: errors (E-1, E-1a, E-2, E-7, U-1) ----

  errorUnit(id: string, path: string, category: Category | undefined): void {
    const unit = this.unit(id);
    if (unit?.kind !== 'error') {
      this.report('CK-10', path, `${id} is not an error unit`);
    } else if (category !== undefined && unit.category !== category) {
      this.report('CK-10', path, `${id} is of category ${unit.category}, but the kind is of category ${category} (E-2)`);
    }
  }

  errors(): void {
    for (const { value: unit, path } of this.units.values()) {
      if (unit.kind === 'error' && unit.category === undefined) this.report('CK-10', path, `the error unit ${unit.id} has no category (U-1)`);
      if (unit.kind !== 'error' && unit.category !== undefined) this.report('CK-10', `${path}/category`, 'only an error unit has a category (U-1)');
      if (unit.kind !== 'error' && unit.parent !== undefined) this.report('CK-10', `${path}/parent`, 'only an error unit has a parent (U-1)');
      if (unit.kind === 'error' && unit.parent !== undefined) {
        const parent = this.unit(unit.parent);
        if (parent !== undefined) {
          if (parent.kind !== 'error') this.report('CK-10', `${path}/parent`, `the parent ${parent.id} is not an error unit`);
          else if (parent.category !== unit.category) {
            this.report('CK-10', `${path}/parent`, `the parent ${parent.id} is of category ${parent.category}, not ${unit.category} (E-2)`);
          }
          if (parent.final === true) this.report('CK-10', `${path}/parent`, `the parent ${parent.id} is final (E-2)`);
        }
      }
    }
    const errors = this.contract.errors;
    const classLangs: Lang[] = this.contract.targets.filter((lang) => lang !== 'go');
    for (const category of CATEGORIES) {
      for (const lang of classLangs) {
        if (errors.classes[category]?.[lang] === undefined) {
          this.report('CK-10', `/errors/classes/${category}`, `the category ${category} has no ${lang} class (E-2)`);
        }
      }
      for (const lang of Object.keys(errors.classes[category] ?? {})) {
        if (!classLangs.includes(lang as Lang)) this.report('CK-10', `/errors/classes/${category}/${lang}`, `${lang} is not a target with a class table`);
      }
    }
    // E-2: a category class of the repository is <Library><Category>Error, with <Library> in the class form of each
    // language (N-2: PHP and Node HttpCookie, Python and Go HTTPCookie), so that it never takes the name of a language's
    // own class (Python ValueError); a PHP class is in the package namespace.
    const namespace = (this.contract.packages['php'] as { namespace?: string } | undefined)?.namespace;
    for (const category of CATEGORIES) {
      const row = errors.classes[category] ?? {};
      for (const [lang, name] of Object.entries(row) as [Lang, string][]) {
        const path = `/errors/classes/${category}/${lang}`;
        const want = `${convert(libraryName(libraryParts(this.contract).repository), lang === 'wasm' ? 'node' : lang, 'class')}${convert([category], 'go', 'class')}Error`;
        const last = name.slice(name.lastIndexOf('\\') + 1);
        if (last !== want) this.report('CK-10', path, `${name} is not ${want}, <Library><Category>Error (E-2)`);
        if (lang === 'php' && namespace !== undefined && name !== `${namespace}\\${last}`) {
          this.report('CK-10', path, `${name} is not in the namespace ${namespace} (E-2, P-1)`);
        }
      }
    }
    for (const [i, row] of errors.fixed.entries()) {
      if (!classLangs.includes(row.lang)) {
        this.report('CK-10', `/errors/fixed/${i}`, `${row.lang} has no runtime argument error class (G-7: Go fails at compile time)`);
      }
    }
    const variants = new Set<string>();
    for (const [i, row] of errors.kinds.entries()) {
      const path = `/errors/kinds/${i}`;
      const key = `${row.library ?? ''}\u0000${row.variant}`;
      if (variants.has(key)) this.report('CK-10', path, `${row.variant} is declared twice`);
      variants.add(key);
      let category = row.category;
      // GN-7c: a kind that the core passes on is <outer>/<inner>, and a kind of the core error itself names no inner.
      if (row.library !== undefined && outerVariant(row.variant) === undefined) {
        this.report('CK-10', `${path}/variant`, `${row.variant} names no variant of the core error that holds the error of ${row.library}; a kind that the core passes on is <outer>/<inner> (GN-7c, E-1b (a))`);
      }
      if (row.library === undefined && outerVariant(row.variant) !== undefined) {
        this.report('CK-10', `${path}/variant`, `${row.variant} names the inner variant of a dependency, but the row names no library (GN-7c)`);
      }
      if (row.library !== undefined) {
        const dependency = this.dependency(row.library, `${path}/library`, 'CK-10');
        const own = dependency?.errors.kinds.find((k) => k.variant === innerVariant(row.variant));
        if (dependency !== null && own === undefined) this.report('CK-10', `${path}/variant`, `${row.library} declares no kind ${innerVariant(row.variant)}`);
        category = own?.category;
      }
      if (row.class !== undefined) this.errorUnit(row.class, `${path}/class`, category);
    }
    const kinds = new Set<string>();
    for (const [i, row] of errors.binding.entries()) {
      if (kinds.has(row.kind)) this.report('CK-10', `/errors/binding/${i}`, `${row.kind} is overridden twice`);
      kinds.add(row.kind);
      this.errorUnit(row.class, `/errors/binding/${i}/class`, BINDING_KINDS[row.kind]);
    }
  }

  // ---- CK-11: properties of wrapped dependency errors (E-1b) ----

  wrappedErrors(): void {
    // E-1b: the libraries whose errors the contract passes on (a) or holds as the source of its own kinds (b).
    const libraries = new Set(this.contract.errors.kinds.flatMap((k) => [k.library, k.source].filter((l) => l !== undefined)));
    const rows = this.contract.errors.wrapped;
    const used = new Set<number>();
    for (const library of libraries) {
      const dependency = this.dependency(library, '/errors/kinds', 'CK-11');
      if (dependency === null) continue;
      for (const unit of dependency.units.filter((u) => u.kind === 'error')) {
        for (const property of (unit.members ?? []).filter((m) => m.kind === 'property')) {
          const index = rows.findIndex((r) => r.library === library && r.unit === unit.id && sameName(r.property, property.name));
          if (index < 0) {
            this.report('CK-11', '/errors/wrapped', `${library} ${unit.id} property ${property.name.map((w) => (typeof w === 'string' ? w : w.acronym)).join('_')} is neither forwarded nor dropped (E-1b, P-4)`);
            continue;
          }
          used.add(index);
          const row = rows[index];
          if (row?.forward === undefined) continue;
          const target = this.unit(row.forward);
          const path = `/errors/wrapped/${index}/forward`;
          if (target?.kind !== 'error') {
            this.report('CK-11', path, `${row.forward} is not an error unit`);
            continue;
          }
          const same = (target.members ?? []).find((m) => m.kind === 'property' && sameName(m.name, property.name));
          if (same === undefined) this.report('CK-11', path, `${row.forward} has no property of the same name`);
          else if (JSON.stringify(same.returns) !== JSON.stringify(property.returns)) {
            this.report('CK-11', path, `${row.forward} has the property with another type`);
          }
        }
      }
    }
    rows.forEach((row, index) => {
      if (!used.has(index)) this.report('CK-11', `/errors/wrapped/${index}`, `no wrapped kind of ${row.library} has the property this row names`);
    });
  }

  // ---- CK-12: record parameters (T-4) ----

  recordOf(type: Type): { unit: Unit } | null | undefined {
    if (typeof type !== 'object' || !('unit' in type)) return undefined;
    if (type.library === undefined || type.library === this.contract.library) {
      const unit = this.unit(type.unit);
      return unit?.kind === 'record' ? { unit } : undefined;
    }
    const raw = this.dependencies.get(type.library);
    if (raw === undefined || validate(raw) !== true) return null;
    const unit = (raw as Contract).units.find((u) => u.id === type.unit);
    return unit?.kind === 'record' ? { unit } : undefined;
  }

  records(): void {
    for (const { member, unit, path } of this.members.values()) {
      const parameters = member.parameters ?? [];
      const records = parameters.map((p, i) => ({ record: this.recordOf(p.type), index: i })).filter((r) => r.record !== undefined);
      if (records.length > 1) this.report('CK-12', `${path}/parameters`, `${member.id} takes ${records.length} records; a member takes at most one (T-4)`);
      for (const { record, index } of records) {
        if (index !== parameters.length - 1) {
          this.report('CK-12', `${path}${pointer('parameters', index)}`, 'a record parameter is the last parameter (T-4)');
        }
        if (record === null || record === undefined) continue;
        for (const lang of (['php', 'python'] as const).filter((l) => this.contract.targets.includes(l))) {
          const others = new Map<string, Parameter>();
          parameters.forEach((p, i) => {
            if (i !== index) others.set(this.langName(lang, unit, p.name, 'variable', member, { parameter: p.name }), p);
          });
          for (const field of record.unit.fields ?? []) {
            const fieldName = this.recordFieldName(lang, record.unit, field);
            if (others.has(fieldName)) {
              this.report('CK-12', `${path}${pointer('parameters', index)}`, `in ${lang} the field ${fieldName} of ${record.unit.id} has the name of another parameter of ${member.id} (T-4)`);
            }
          }
        }
      }
    }
  }

  recordFieldName(lang: Lang, record: Unit, field: Field): string {
    const local = this.unit(record.id) === record;
    return local ? this.langName(lang, record, field.name, 'variable', undefined, { field: field.name }) : convert(field.name, lang, 'variable');
  }

  // ---- CK-13: Go names (E-7, P-2) ----

  goNames(): void {
    if (!this.contract.targets.includes('go')) return;
    const categoryTypes = new Set(CATEGORIES.map((c) => convert([c, 'error'], 'go', 'class')));
    const byModule = new Map<string, Map<string, string>>();
    const declare = (module: string, name: string, path: string): void => {
      const names = byModule.get(module) ?? new Map<string, string>();
      byModule.set(module, names);
      const earlier = names.get(name);
      if (earlier !== undefined) this.report('CK-13', path, `the Go package ${module} declares ${name} twice (also at ${earlier})`);
      else names.set(name, path);
    };
    for (const { value: unit, path } of this.units.values()) {
      if (unit.origin === 'host' || (unit.only !== undefined && !unit.only.targets.includes('go'))) continue;
      const typeName = this.langName('go', unit, unit.name, 'class');
      if (unit.kind === 'error' && categoryTypes.has(typeName)) {
        this.report('CK-13', `${path}/name`, `the Go name ${typeName} of ${unit.id} is the name of a category error type (E-7)`);
      }
      if (unit.kind === 'functions') {
        for (const [m, member] of (unit.members ?? []).entries()) {
          if (member.only !== undefined && !member.only.targets.includes('go')) continue;
          declare(unit.module, this.langName('go', unit, member.name, 'callable', member), `${path}${pointer('members', m)}`);
        }
        continue;
      }
      declare(unit.module, typeName, path);
      const constructor = (unit.members ?? []).some((m) => m.kind === 'constructor');
      if (unit.kind === 'class' && unit.constructible !== false && constructor) declare(unit.module, `New${typeName}`, path);
      // GN-15a: the functions through which another module reaches a class or a callback.
      if (unit.kind === 'class') for (const name of [`${typeName}Handle`, `${typeName}FromHandle`]) declare(unit.module, name, path);
      if (unit.kind === 'interface' && unit.origin === 'callback') declare(unit.module, `Dispatch${typeName}`, path);
      if (unit.kind === 'variant') for (const name of [`Encode${typeName}`, `Decode${typeName}`]) declare(unit.module, name, path);
      // T-5: a static member is the function <Class><Member> of the package.
      for (const [m, member] of (unit.kind === 'class' ? unit.members ?? [] : []).entries()) {
        if (member.kind !== 'static' || (member.only !== undefined && !member.only.targets.includes('go'))) continue;
        declare(unit.module, `${typeName}${this.langName('go', unit, member.name, 'callable', member)}`, `${path}${pointer('members', m)}`);
      }
    }
  }

  // ---- CK-80, CK-81: the names of the C ABI of Go (GN-17); CK-79 is retired (B2.125) ----

  goSymbols(): void {
    if (!this.contract.targets.includes('go')) return;
    const prefix = goPrefix(this.contract);
    const releases = new Map<string, string>();
    for (const { value: unit } of this.units.values()) {
      if (unit.kind === 'class' && unit.origin !== 'host' && goTakes(unit.only)) releases.set(`Release${convert(unit.name, 'go', 'class')}`, unit.id);
    }
    for (const { value: unit, path } of this.units.values()) {
      if (unit.kind !== 'functions' || unit.module !== '' || unit.origin === 'host' || !goTakes(unit.only)) continue;
      for (const [m, member] of (unit.members ?? []).entries()) {
        if (member.kind !== 'function' || !goTakes(member.only)) continue;
        const at = `${path}${pointer('members', m)}/name`;
        const snake = goSnake(member.name);
        // CK-80: the result of every call of the C ABI is the C type <prefix>_buffer.
        if (snake === 'buffer') this.report('CK-80', at, `${member.id} has the C symbol ${prefix}_buffer, which is the C type of the result of the C ABI; rename the function (GN-17)`);
        // CK-81: the function of package binding of a function of the root module is its name in CamelCase.
        const name = convert(member.name, 'go', 'class');
        if (GO_BINDING_NAMES.has(name)) this.report('CK-81', at, `${member.id} is the function ${name} of package binding, which the package declares itself; rename the function (GN-17)`);
        const released = releases.get(name);
        if (released !== undefined) this.report('CK-81', at, `${member.id} is the function ${name} of package binding, which is the release of the class ${released}; rename the function or the class (GN-17)`);
      }
    }
  }

  // ---- CK-14: module paths (L-1) ----

  modules(): void {
    for (const { value: unit, path } of this.units.values()) {
      const first = unit.module.split('/')[0];
      if (first === 'host' || first === 'tests') {
        this.report('CK-14', `${path}/module`, `the module ${unit.module} starts with ${first}, a folder of hand-written Go code (L-1)`);
      }
      if (first === 'internal') {
        this.report('CK-14', `${path}/module`, `the module ${unit.module} starts with internal, the folder of the C ABI layer of the Go binding (L-1)`);
      }
    }
  }

  // ---- CK-15: members that WASM cannot run (Q-4) ----

  hasPath(type: Type, seen: Set<string>): boolean {
    for (const part of Checker.walk(type)) {
      if (part === 'path') return true;
      if (typeof part === 'object' && 'unit' in part && (part.library === undefined || part.library === this.contract.library)) {
        if (seen.has(part.unit)) continue;
        seen.add(part.unit);
        const unit = this.unit(part.unit);
        if (unit !== undefined && (unit.kind === 'record' || unit.kind === 'variant')) {
          for (const field of [...(unit.fields ?? []), ...(unit.cases ?? []).flatMap((c) => c.fields)]) {
            if (this.hasPath(field.type, seen)) return true;
          }
        }
      }
    }
    return false;
  }

  wasmOnly(): void {
    if (!this.contract.targets.includes('wasm')) return;
    for (const { member, unit, path } of this.members.values()) {
      const blocking = member.wait === 'blocking_io' || member.wait === 'process_wait';
      const usesPath = [...this.memberTypes(member, path)].some((t) => this.hasPath(t.value, new Set()));
      if (!blocking && !usesPath) continue;
      const only = member.only ?? unit.only;
      if (only === undefined || only.targets.includes('wasm')) {
        const cause = blocking ? `wait ${member.wait}` : 'a path';
        this.report('CK-15', path, `${member.id} has ${cause}, so it needs only without wasm and a reason (Q-4)`);
      }
    }
  }

  // ---- CK-73: members that do not wait (GN-6m, GN-6n, N-4) ----

  waitingMembers(): void {
    // The member that can wait in the place of each kind that cannot.
    const instead: Readonly<Record<string, string>> = {
      constructor: 'make the instance by a static member, which can wait',
      property: 'give the value by a method, which can wait',
      iterate: 'give the items by a method, which can wait',
    };
    const hooks = ['stringify', 'to_json', 'primitive'];
    const rules = { blocking_io: 'GN-6m', process_wait: 'GN-6m', async_driver: 'GN-6n' } as const;
    for (const { member, unit, path } of this.members.values()) {
      // A host unit is judged too: its code is written by hand (L-2a), and the language has no awaited form there either.
      if (member.wait === undefined || member.wait === 'none') continue;
      const hook = hooks.includes(member.kind);
      const remedy = hook ? 'the language calls this hook in its own protocol, so give the value by a method, which can wait' : instead[member.kind];
      if (remedy === undefined) continue;
      const article = member.kind === 'iterate' ? 'an' : 'a';
      this.report('CK-73', `${path}/wait`, `${member.id}: ${article} ${member.kind} does not wait (wait ${member.wait}); ${remedy} (${hook ? 'N-4, ' : ''}${rules[member.wait]})`);
    }
  }

  // ---- CK-74: constructible classes (U-1) ----

  constructibleClasses(): void {
    for (const { value: unit, path } of this.units.values()) {
      if (unit.kind !== 'class' || (unit.origin !== 'generated' && unit.origin !== 'value')) continue;
      if (unit.core_type === undefined || unit.abstract === true) continue;
      const made = (unit.members ?? []).find((m) => m.kind === 'constructor');
      if (unit.constructible !== false && made === undefined) {
        this.report('CK-74', path, `${unit.id}: a class without a constructor declares constructible: false, or one constructor (U-1)`);
      }
      if (unit.constructible === false && made !== undefined) {
        this.report('CK-74', `${path}/constructible`, `${unit.id}: a class with constructible: false has no constructor, so the constructor ${made.id} is a static member, or the class is constructible (U-1)`);
      }
    }
  }

  // ---- CK-78: a class without core_type on a target that does not generate it (GN-6af) ----

  keptClassTargets(): void {
    // GN-6af: Python, Node, WASM and Go generate a class that keeps language values. PHP takes its own stdClass and
    // references (GN-6e) and generates no such class, which is the rule of that target.
    const generated: readonly string[] = ['python', 'node', 'wasm', 'go'];
    for (const { value: unit, path } of this.units.values()) {
      if (unit.kind !== 'class' || (unit.origin !== 'generated' && unit.origin !== 'value') || unit.core_type !== undefined) continue;
      const missing = (unit.only?.targets ?? this.contract.targets).filter((target) => !generated.includes(target)).join(', ');
      if (missing === '') continue;
      this.report('CK-78', unit.only === undefined ? path : `${path}/only`, `${unit.id}: a class without core_type is not generated for ${missing}, so the unit names only without ${missing} and a reason (GN-6af, Q-4)`);
    }
  }

  // ---- CK-90: a parameter whose callback the core keeps (generator GN-6aa) ----

  keptCallbacks(): void {
    // Whether a type holds a callback unit, of this contract or of another repository: the unit itself, or a record, a
    // list, an optional, a map or a tuple that holds one. A unit of a contract that the check was not given is no
    // finding here: CK-9 reports it.
    const holds = (type: Type, seen: Set<string>): boolean => {
      // B2.378: a function that the core stores for a later call is kept as a callback is.
      if (typeof type === 'object' && 'function' in type) return true;
      if (typeof type === 'string' || 'passthrough' in type) return false;
      if ('list' in type) return holds(type.list, seen);
      if ('optional' in type) return holds(type.optional, seen);
      if ('map' in type) return holds(type.map, seen);
      if ('keyed_map' in type) return holds(type.keyed_map, seen);
      if ('tuple' in type) return type.tuple.some((part) => holds(part, seen));
      if (!('unit' in type)) return false;
      if (type.library !== undefined && type.library !== this.contract.library) {
        const raw = this.dependencies.get(type.library);
        if (raw === undefined || validate(raw) !== true) return true;
        const unit = (raw as Contract).units.find((u) => u.id === type.unit);
        return unit === undefined || unit.origin === 'callback';
      }
      const unit = this.units.get(type.unit)?.value;
      if (unit === undefined || seen.has(unit.id)) return false;
      if (unit.origin === 'callback') return true;
      seen.add(unit.id);
      return unit.kind === 'record' && (unit.fields ?? []).some((field) => holds(field.type, seen));
    };
    for (const { value: unit, path } of this.units.values()) {
      (unit.members ?? []).forEach((member, m) => {
        (member.parameters ?? []).forEach((parameter, p) => {
          if (parameter.keeps !== true || holds(parameter.type, new Set())) return;
          this.report('CK-90', `${path}/members/${m}/parameters/${p}/keeps`, `${member.id}.${convert(parameter.name, 'python', 'variable')}: keeps names a parameter whose type holds a callback unit or a function, and ${JSON.stringify(parameter.type)} holds none (GN-6aa)`);
        });
      });
    }
  }

  // ---- CK-75: the core enum of a variant (T-9) ----

  variantCores(): void {
    for (const { value: unit, path } of this.units.values()) {
      if (unit.kind === 'variant' && unit.origin === 'generated' && unit.core_type === undefined) {
        this.report('CK-75', path, `${unit.id}: a variant names its core enum in core_type (T-9)`);
      }
    }
  }

  // ---- CK-76: a cleanup that leaves its object (GN-6p) ----

  cleanupCases(): void {
    const files = this.caseFiles;
    // The rule reads the cases, so a check without the case files does not judge it.
    if (files === undefined) return;
    for (const { value: unit, path } of this.units.values()) {
      if (unit.kind !== 'class' || unit.cleanup === undefined) continue;
      const cleanup = this.members.get(unit.cleanup)?.member;
      if (cleanup === undefined || typeof cleanup.core !== 'object' || cleanup.core.receiver !== '&mut self') continue;
      const again = this.contract.cases.filter((row) => row.member === cleanup.id).some((row) => {
        const document = files.get(row.file);
        const group = typeof document === 'object' && document !== null ? (document as Record<string, unknown>)[row.group] : undefined;
        return (Array.isArray(group) ? group : []).some((kase: unknown) => {
          const record = typeof kase === 'object' && kase !== null ? (kase as Record<string, unknown>) : {};
          const receiver = typeof record['receiver'] === 'object' && record['receiver'] !== null ? (record['receiver'] as Record<string, unknown>) : {};
          const then = Array.isArray(receiver['then']) ? (receiver['then'] as unknown[]) : [];
          const calls = then.some((step) => typeof step === 'object' && step !== null && (step as Record<string, unknown>)['call'] === cleanup.id && (step as Record<string, unknown>)['raises'] === undefined);
          return calls && record['raises'] === undefined;
        });
      });
      if (!again) {
        this.report('CK-76', `${path}/cleanup`, `${unit.id}: the cleanup ${cleanup.id} leaves its object (receiver &mut self), so a case of ${cleanup.id} calls it a second time in the then of its receiver and names no raises; binding check reads no Rust source, so that the Drop of the core type releases the resource of an object whose cleanup was not called is the duty of the core (GN-6p)`);
      }
    }
  }

  // ---- CK-16: Python awaitable names (N-5, U-3) ----

  awaitableNames(): void {
    if (!this.contract.targets.includes('python')) return;
    for (const { value: unit, path } of this.units.values()) {
      const members = unit.members ?? [];
      const names = new Map(members.map((m) => [this.langName('python', unit, m.name, this.memberRole(unit), m), m.id]));
      for (const [m, member] of members.entries()) {
        const awaitable = unit.origin === 'callback' ? member.async_allowed === true : member.wait !== undefined && member.wait !== 'none';
        if (!awaitable) continue;
        const name = `a${this.langName('python', unit, member.name, this.memberRole(unit), member)}`;
        const other = names.get(name);
        if (other !== undefined) {
          this.report('CK-16', `${path}${pointer('members', m)}`, `the Python awaitable ${name} of ${member.id} is the name of ${other} (N-5)`);
        }
        // GN-6m: the generator writes the awaitable under this name, which a reserved word cannot be.
        if (PYTHON_RESERVED.includes(name)) {
          this.report('CK-16', `${path}${pointer('members', m)}`, `the Python awaitable ${name} of ${member.id} is a reserved word of Python (N-5, GN-6m)`);
        }
      }
    }
  }

  // ---- CK-23: reserved words of the target languages (N-2) ----

  // N-2: a name that a language reserves where the binding writes it fails the generated code only when it is
  // compiled or linted, so the check names it first; a naming exception (N-3) gives the language another name. The
  // generator generates no naming exception yet, so the remedy of the finding is the one that works: a rename.
  reservedNames(): void {
    const report = (lang: Lang, path: string, name: string, what: string, symbol: 'unit' | 'member' | 'parameter' | 'field'): void => {
      this.report('CK-23', path, `${name}, the ${lang} name of ${what}, is a reserved word of ${lang}; rename the ${symbol} in the contract (N-2)`);
    };
    for (const lang of this.contract.targets) {
      const reserved = RESERVED[lang];
      if (reserved === undefined) continue;
      const taken = (name: string, position: Position): boolean => reserved.positions.includes(position) && reserved.words.has(reserved.caseless ? name.toLowerCase() : name);
      for (const { value: unit, path } of this.units.values()) {
        // GN-6r: the generated code declares the names of an internal unit as those of a public one.
        if (unit.origin === 'host') continue;
        const generated = unit.kind !== 'functions' && unit.kind !== 'alias' && unit.kind !== 'variant';
        const className = this.langName(lang, unit, unit.name, 'class');
        if (generated && taken(className, 'class')) report(lang, path, className, `the unit ${unit.id}`, 'unit');
        for (const [f, field] of (unit.fields ?? []).entries()) {
          const name = this.langName(lang, unit, field.name, 'variable', undefined, { field: field.name });
          if (taken(name, 'field')) report(lang, `${path}${pointer('fields', f)}`, name, `the field ${unit.id}.${convert(field.name, 'rust', 'variable')}`, 'field');
        }
        for (const [m, member] of (unit.members ?? []).entries()) {
          const memberPath = `${path}${pointer('members', m)}`;
          const role = member.kind === 'constant' ? 'constant' : this.memberRole(unit);
          const name = this.langName(lang, unit, member.name, role, member);
          const position: Position = member.kind === 'constant' ? 'constant' : unit.kind === 'functions' ? 'function' : unit.kind === 'record' ? 'field' : 'method';
          if (taken(name, position)) report(lang, memberPath, name, member.id, 'member');
          for (const [p, parameter] of (member.parameters ?? []).entries()) {
            const param = this.langName(lang, unit, parameter.name, 'variable', member, { parameter: parameter.name });
            if (taken(param, 'parameter')) report(lang, `${memberPath}${pointer('parameters', p)}`, param, `a parameter of ${member.id}`, 'parameter');
          }
        }
      }
    }
  }

  // ---- CK-72: the tag of a variant (T-9) ----

  // T-9, GN-6v: the value of a case is an object whose tag member holds the case value, so a field with the name of
  // the tag would take its place; the names are compared by their words.
  variantTags(): void {
    for (const { value: unit, path } of this.units.values()) {
      if (unit.kind !== 'variant' || unit.tag === undefined) continue;
      const tag = convert(unit.tag, 'rust', 'variable');
      for (const [c, kase] of (unit.cases ?? []).entries()) {
        for (const [f, field] of kase.fields.entries()) {
          if (convert(field.name, 'rust', 'variable') !== tag) continue;
          this.report('CK-72', `${path}${pointer('cases', c, 'fields', f)}`, `the field ${tag} of the case ${kase.value} of ${unit.id} has the name of the tag of the variant; rename the field or the tag (T-9, GN-6v)`);
        }
      }
    }
  }

  // ---- CK-18: package names (P-1) ----

  packageNames(): void {
    const library = this.contract.library;
    const { repository, component } = libraryParts(this.contract);
    if (component !== undefined && library !== `${repository}-${component}`) {
      this.report('CK-18', '/library', `${library} is not <repository>-${component}, the library of the component at ${this.contract.core.path} (P-1, L-1)`);
    }
    // P-1: a component's PHP namespace and Python module are below the repository's (Polyspec\CrudUi\Validator,
    // polyspec.crud_ui.validator); the package names are the library's.
    const pascal = [repository, ...(component === undefined ? [] : [component])].map((part) => convert(libraryName(part), 'php', 'class')).join('\\');
    const module = [repository, ...(component === undefined ? [] : [component])].map((part) => part.replaceAll('-', '_')).join('.');
    const expected: [string, unknown, string][] = [
      ['/core/crate', this.contract.core.crate, `polyspec-${library}`],
    ];
    const packages = this.contract.packages as Record<string, Record<string, unknown> | undefined>;
    if (packages['php'] !== undefined) {
      expected.push(['/packages/php/package', packages['php']['package'], `polyspec/${library}`]);
      expected.push(['/packages/php/namespace', packages['php']['namespace'], `Polyspec\\${pascal}`]);
    }
    if (packages['python'] !== undefined) {
      expected.push(['/packages/python/package', packages['python']['package'], `polyspec-${library}`]);
      expected.push(['/packages/python/module', packages['python']['module'], `polyspec.${module}`]);
    }
    if (packages['node'] !== undefined) expected.push(['/packages/node/package', packages['node']['package'], `@polyspec/${library}`]);
    for (const [path, found, want] of expected) {
      if (found !== want) this.report('CK-18', path, `${String(found)} is not ${want}, the name that P-1 gives the library ${library}`);
    }
  }

  // ---- CK-22: every member runs contract cases (K-1) ----

  // K-1: a member that a binding generates names the case file and group that run it, because the tests of G-5 that
  // run cases (B-3 on a case's values, B-4) would otherwise be left out without a word. A constant has no cases.
  caseLinks(): void {
    const linked = new Set(this.contract.cases.map((kase) => kase.member));
    const unlinked: { member: Member; path: string }[] = [];
    for (const { member, unit, path } of this.members.values()) {
      if (member.kind === 'constant' || unit.kind === 'error' || unit.origin === 'callback' || unit.origin === 'host') continue;
      if (member.visibility !== 'public' || unit.visibility !== 'public') continue;
      if (!linked.has(member.id)) unlinked.push({ member, path });
    }
    if (this.caseFiles !== undefined) this.caseKinds(this.caseFiles);
    // B2.365: a member that a step of a function fixture or a call of after calls has a case there, so a member of a
    // class that only a callback gives needs no row of its own.
    for (const { member, path } of unlinked) {
      if (!this.stepCalled.has(member.id)) this.report('CK-22', path, `${member.id} names no case file and group in cases, and no step of a function fixture and no call of after of a case calls it (K-1)`);
    }
  }

  // K-1, B-4: every group that cases names is in its file, and a member has a case for each kind that its raises
  // gives. A case that arms fault injection points (G-5) fills only the kinds that its points fill, so an input rule
  // keeps its input case. A kind of the category internal needs no case of each member (X-1): the match that maps the
  // error enum is one for every member, so one case that arms <library>.internal checks it for the enum. The kinds
  // of a value alias's in function have their cases in the group of the alias (U-7).
  caseKinds(files: ReadonlyMap<string, unknown>): void {
    const raised = new Map<string, Set<string>>();
    const aliasRaised = new Map<string, Set<string>>();
    const categories = this.kindCategories();
    // X-1: the libraries whose point internal a case arms as broken and that raises a kind of the category internal.
    const mapped = new Set<string>();
    const groups = new Map<string, 'member' | 'alias'>();
    for (const [i, row] of this.contract.cases.entries()) {
      const document = files.get(row.file);
      const group = typeof document === 'object' && document !== null ? (document as Record<string, unknown>)[row.group] : undefined;
      if (!Array.isArray(group)) {
        this.report('CK-22', `/cases/${i}`, document === undefined ? `the file ${row.file} is not found` : `the file ${row.file} has no group ${row.group}`);
        continue;
      }
      // U-7: the cases of an alias are in a group of their own, because a case of a member has other keys.
      const key = `${row.file}\0${row.group}`;
      const what = row.member === undefined ? 'alias' : 'member';
      if ((groups.get(key) ?? what) !== what) this.report('CK-22', `/cases/${i}`, `the group ${row.group} of ${row.file} holds the cases of a member and of an alias (U-7)`);
      groups.set(key, what);
      if (row.member === undefined) {
        // CK-92, GN-13h: an only of the row names a target where its alias is generated.
        const aliasUnit = this.units.get(row.alias)?.value;
        const aliasTargets = this.contract.targets.filter((lang) => aliasUnit?.only === undefined || aliasUnit.only.targets.includes(lang));
        if (row.only !== undefined && aliasUnit !== undefined && !row.only.targets.some((lang) => aliasTargets.includes(lang))) {
          this.report('CK-92', `/cases/${i}`, `the row of the alias ${row.alias} names in only ${row.only.targets.join(', ')}, where ${row.alias} is not generated (GN-13h, Q-4)`);
        }
        const kinds = aliasRaised.get(row.alias) ?? new Set<string>();
        this.aliasCases(row.alias, group, `/cases/${i}`, kinds);
        aliasRaised.set(row.alias, kinds);
        continue;
      }
      const kinds = raised.get(row.member) ?? new Set<string>();
      this.caseFixtures(row.member, group, `/cases/${i}`);
      // CK-92, GN-13h: an only of the row names a target where its member is generated.
      if (row.only !== undefined && this.members.has(row.member) && !row.only.targets.some((lang) => this.targetsOf(row.member).includes(lang))) {
        this.report('CK-92', `/cases/${i}`, `the row of ${row.member} names in only ${row.only.targets.join(', ')}, where ${row.member} is not generated (GN-13h, Q-4)`);
      }
      this.caseTargets(row.member, group, row.result ?? 'result', row.only?.targets, `/cases/${i}`);
      for (const kase of group) {
        const record = typeof kase === 'object' && kase !== null ? (kase as Record<string, unknown>) : {};
        const armedThen = this.caseInstances(row.member, record, `/cases/${i}`, row.only?.targets);
        this.caseKeys(row.member, record, row.result ?? 'result', row.reads ?? [], `/cases/${i}`);
        this.caseRange(row.member, record, row.result ?? 'result', `/cases/${i}`);
        this.caseNoResult(row.member, record, row.result ?? 'result', `/cases/${i}`);
        this.caseCancel(row.member, record, `/cases/${i}`);
        this.caseScope(row.member, record, `/cases/${i}`);
        this.caseService(row.member, row.only?.targets, record, `/cases/${i}`);
        const raises = record['raises'];
        const expected = typeof raises === 'object' && raises !== null ? (raises as Record<string, unknown>) : {};
        const kind = expected['kind'];
        const where = `the case ${String(record['id'])} of ${row.member}`;
        if (typeof expected['errno'] === 'string' && !ERRNO_SYMBOL.test(expected['errno'])) {
          this.report('CK-22', `/cases/${i}`, `${where}: the errno ${expected['errno']} of raises is not the symbol of an errno, such as ENOSPC (G-5)`);
        }
        if (typeof kind === 'string') this.caseRaises(row.member, record, kind, expected['category'], record['faults'] !== undefined || armedThen.any, `/cases/${i}`);
        if (record['faults'] === undefined && !armedThen.any) {
          if (typeof kind === 'string') kinds.add(kind);
          continue;
        }
        // GN-13f: the points that the calls of then of its instance values arm are points that the case arms.
        const armed = record['faults'] === undefined ? { fills: new Set<string>(), broken: new Set<string>() } : this.caseFaults(record['faults'], where, `/cases/${i}`);
        for (const filled of armedThen.fills) armed.fills.add(filled);
        for (const library of armedThen.broken) armed.broken.add(library);
        if (typeof kind !== 'string') continue;
        if (!armed.fills.has(kind)) {
          this.report('CK-22', `/cases/${i}`, `${where}: no point that the case arms fills the kind ${kind}, so only a case without faults gives it (G-5)`);
          continue;
        }
        kinds.add(kind);
        if (categories.get(kind) === 'internal') for (const library of armed.broken) mapped.add(library);
      }
      raised.set(row.member, kinds);
    }
    const rows = new Map(this.contract.errors.kinds.map((row) => [row.variant, row]));
    // CK-22 (B2.376): a kind leaves every member of a library by the conversion of the core error that gives it, one
    // for each library whose kind it is (the library itself, or its owner, GN-7c) and each form of the call (a throw
    // of a call without wait, a rejection of one with wait). A case of any member that takes the same path shows the
    // kind for all of them.
    // B2.382: a kind of another library is shown for every kind of that library by one case, since the owner's
    // conversion gives each kind its class and its own CK-22 shows each kind; a kind of this library, one case each.
    const pathOf = (member: Member, row: { library?: string }, kind: string): string => `${member.wait === undefined || member.wait === 'none' ? 'sync' : 'async'} ${row.library ?? ''} ${row.library === undefined ? kind : '*'}`;
    // GN-7c: a row of a kind of a library takes its category and its kinds from the row of that library.
    const ownerRow = (row: (typeof this.contract.errors.kinds)[number]): (typeof this.contract.errors.kinds)[number] | undefined =>
      row.library === undefined ? row : this.given(row.library)?.errors.kinds.find((k) => k.variant === innerVariant(row.variant));
    const shown = new Set<string>();
    const kindsOfMember = (member: Member): Set<string> | undefined => {
      // GN-13o: a kind that a step or a call of after expects is a case of the member of that call.
      const own = raised.get(member.id);
      const called = this.callRaised.get(member.id);
      return own === undefined && called === undefined ? undefined : new Set([...(own ?? []), ...(called ?? [])]);
    };
    for (const { member } of this.members.values()) {
      const kinds = kindsOfMember(member);
      if (kinds === undefined) continue;
      for (const variant of member.raises ?? []) {
        const row = rows.get(variant);
        const owner = row === undefined ? undefined : ownerRow(row);
        if (row !== undefined && owner !== undefined) for (const kind of kindsOf(owner)) if (kinds.has(kind)) shown.add(pathOf(member, row, kind));
      }
    }
    for (const { member, unit, path } of this.members.values()) {
      const kinds = kindsOfMember(member);
      if (kinds === undefined || unit.origin === 'callback' || unit.origin === 'host') continue;
      for (const [r, variant] of (member.raises ?? []).entries()) {
        const row = rows.get(variant);
        const owner = row === undefined ? undefined : ownerRow(row);
        // X-1: a kind of the category internal has the one case of its enum, below.
        if (row === undefined || owner?.category === undefined || owner.category === 'internal') continue;
        for (const kind of kindsOf(owner)) {
          if (!shown.has(pathOf(member, row, kind))) {
            this.report('CK-22', `${path}/raises/${r}`, `no case of ${member.id} raises the kind ${kind}${row.category === 'io' ? ', by an input or by a fault injection point of faults that fills it' : ''} (K-1, B-4)`);
          }
        }
      }
    }
    // X-1: one case for each error enum whose kinds the contract gives: its own, and that of each library whose kinds
    // it passes on (E-1b (a)).
    const reported = new Set<string>();
    for (const [i, row] of this.contract.errors.kinds.entries()) {
      const library = row.library ?? this.contract.library;
      const category = row.library === undefined ? row.category : this.given(row.library)?.errors.kinds.find((k) => k.variant === innerVariant(row.variant))?.category;
      if (category !== 'internal' || mapped.has(library) || reported.has(library)) continue;
      reported.add(library);
      this.report('CK-22', `/errors/kinds/${i}`, `no case arms the point ${pointLibrary(library)}.internal as broken and raises a kind of the category internal, the one case that checks the class, kind and status of the error enum of ${library} (X-1, G-5)`);
    }
    // U-7: every kind of an alias's in function has a case of the alias.
    for (const { value: unit, path } of this.units.values()) {
      for (const [r, variant] of (unit.in_raises ?? []).entries()) {
        const row = rows.get(variant);
        if (row === undefined) continue;
        for (const kind of kindsOf(row)) {
          if (aliasRaised.get(unit.id)?.has(kind) !== true) this.report('CK-22', `${path}/in_raises/${r}`, `no case of the alias ${unit.id} raises the kind ${kind} (K-1, U-7)`);
        }
      }
    }
  }

  // CK-96: every key of a member case is a parameter of the member in snake_case, a parameter of a factory of its class
  // when the case gives its receiver by those, the key of its result, a key that the row names in reads because the
  // tests of the repository read it, or a key that G-5 gives a meaning; a key of
  // another name, such as a meta key without its @, would be left out of every generated test without a word.
  caseKeys(memberId: string, record: Record<string, unknown>, resultKey: string, reads: readonly string[], path: string): void {
    const found = this.members.get(memberId);
    if (found === undefined) return;
    const snake = (name: Name): string => convert(name, 'python', 'variable');
    const allowed = new Set<string>([...CASE_META_KEYS, resultKey, ...reads, ...(found.member.parameters ?? []).map((p) => snake(p.name))]);
    // A member with a receiver, or a member of a value class without core_type, which has no core path.
    const receives = (m: { kind: string; core?: unknown }): boolean => m.kind !== 'constructor' && (m.core === undefined || (typeof m.core === 'object' && m.core !== null && (m.core as { receiver?: unknown }).receiver !== undefined));
    if (receives(found.member) && record['receiver'] === undefined) {
      const factory = (m: { kind: string; core?: unknown }): boolean => m.kind === 'constructor' || !receives(m);
      for (const m of found.unit.members ?? []) if (factory(m)) for (const p of m.parameters ?? []) allowed.add(snake(p.name));
    }
    for (const key of Object.keys(record)) {
      if (!allowed.has(key)) this.report('CK-96', path, `the case ${String(record['id'])} of ${memberId} has the key ${key}, which is no parameter of ${memberId}, no key of its result and no key of a case (G-5)`);
    }
  }

  // G-5 (GN-13f): the instance values of a case: its receiver, and an argument of a class type that is given as one.
  // The receiver of a method is an instance value or, without the key receiver, the arguments of a factory of its
  // class among the keys of the case.
  // Gives what the calls of then of the instance values of the case arm (GN-13f).
  // `rowTargets`: the targets of the only of the row of cases that holds the case (GN-13h), when it has one.
  caseInstances(memberId: string, record: Record<string, unknown>, path: string, rowTargets?: readonly string[]): ThenFaults {
    const armed: ThenFaults = { fills: new Set<string>(), broken: new Set<string>(), any: false };
    const found = this.members.get(memberId);
    if (found === undefined) return armed;
    this.armedThen = armed;
    const named = new Set<string>();
    this.namedThen = named;
    const where = `the case ${String(record['id'])} of ${memberId}`;
    const report = (message: string): void => this.report('CK-22', path, `${where}: ${message} (G-5, GN-13f)`);
    const method = typeof found.member.core === 'object' && found.member.core.receiver !== undefined;
    if (record['receiver'] !== undefined) {
      if (!method) report(`${memberId} has no receiver, so the case gives none`);
      else this.instanceValue(found.unit.id, record['receiver'], report, 'the receiver');
    }
    this.instanceArgs(found.member, record, report, 'the case');
    // CK-22, B2.465: a case without the key receiver gives the arguments of a factory of its class among its own keys
    // (GN-13f), each read once as a case value where it holds a value alias.
    if (record['receiver'] === undefined && found.member.kind !== 'constructor') {
      const read = new Set((found.member.parameters ?? []).map((p) => convert(p.name, 'python', 'variable')));
      const receives = (m: Member): boolean => m.kind !== 'constructor' && (m.core === undefined || (typeof m.core === 'object' && m.core !== null && m.core.receiver !== undefined));
      if (receives(found.member)) {
        for (const factory of (found.unit.members ?? []).filter((m) => !receives(m))) {
          for (const parameter of factory.parameters ?? []) {
            const key = convert(parameter.name, 'python', 'variable');
            if (read.has(key) || !Object.hasOwn(record, key)) continue;
            read.add(key);
            this.aliasPlaces(parameter.type, record[key], `${key} of the case`, report);
          }
        }
      }
    }
    // GN-13pa: with names instance values of the case, which the test makes after the receiver.
    if (record['with'] !== undefined) {
      if (!method) report(`${memberId} has no receiver, so the case gives no with`);
      else for (const [name, value] of this.caseWith(record)) {
        if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name) || name === 'receiver') report(`the name ${JSON.stringify(name)} of with is not a snake_case name other than receiver`);
        else if (value === undefined) report(`with ${name} is no instance value {"new": <member id>, ...} of a member that makes a class of this contract`);
        else this.instanceValue(value.unit, value.value, report, `with ${name}`);
      }
    }
    this.armedThen = undefined;
    this.namedThen = undefined;
    // CK-92: the test of the case is generated for each target of its member and of its row, so every member that its
    // instance values call is generated there too; only that keeps such a member out of a target keeps the member of
    // the case, or the row of the case, out too.
    const own = this.targetsOf(memberId).filter((lang) => rowTargets === undefined || rowTargets.includes(lang));
    for (const id of named) {
      const missing = own.filter((lang) => !this.targetsOf(id).includes(lang));
      if (missing.length > 0) {
        this.report('CK-92', path, `${where}: its instance values call ${id}, which is not generated for ${missing.join(', ')}, where ${memberId} is; give ${memberId}, its unit or the row of the case an only without ${missing.join(', ')} (Q-4, GN-13f, GN-13h)`);
      }
    }
    // CK-93: a case that gives a value to a parameter, or to a field of a record, whose only leaves out a target of the
    // case is no case of that target, so the row of the case names that only (GN-13h) instead of the generator leaving
    // the case out by itself.
    const given: { what: string; only: { targets: readonly string[] } }[] = [];
    for (const parameter of found.member.parameters ?? []) {
      const key = convert(parameter.name, 'python', 'variable');
      if (!Object.hasOwn(record, key)) continue;
      if (parameter.only !== undefined) given.push({ what: `the parameter ${key}`, only: parameter.only });
      this.givenFields(parameter.type, record[key], given, new Set());
    }
    for (const { what, only } of given) {
      const missing = own.filter((lang) => !only.targets.includes(lang));
      if (missing.length > 0) {
        this.report('CK-93', path, `${where}: it gives ${what}, which only keeps out of ${missing.join(', ')}, where the case is generated; hold the case in a row of cases whose only names ${only.targets.join(', ')} alone (Q-4, GN-13h)`);
      }
    }
    return armed;
  }

  // CK-93: the fields with only of the records that a case value of a type gives, at any place of a list, an optional,
  // a map, a keyed map or a tuple.
  givenFields(type: Type, value: unknown, given: { what: string; only: { targets: readonly string[] } }[], seen: ReadonlySet<string>): void {
    if (typeof type === 'string' || value === null || typeof value !== 'object') return;
    if ('optional' in type) return this.givenFields(type.optional, value, given, seen);
    if ('list' in type) {
      if (Array.isArray(value)) for (const item of value) this.givenFields(type.list, item, given, seen);
      return;
    }
    if ('tuple' in type) {
      if (Array.isArray(value)) type.tuple.forEach((part, i) => this.givenFields(part, value[i], given, seen));
      return;
    }
    if ('map' in type) {
      for (const item of Object.values(value)) this.givenFields(type.map, item, given, seen);
      return;
    }
    if ('keyed_map' in type) {
      if (Array.isArray(value)) for (const entry of value) if (Array.isArray(entry)) this.givenFields(type.keyed_map, entry[1], given, seen);
      return;
    }
    if (!('unit' in type) || type.library !== undefined || Array.isArray(value)) return;
    const unit = this.contract.units.find((u) => u.id === type.unit);
    if (unit?.kind !== 'record' || seen.has(unit.id)) return;
    const fields = value as Record<string, unknown>;
    for (const field of unit.fields ?? []) {
      const key = convert(field.name, 'python', 'variable');
      if (!Object.hasOwn(fields, key)) continue;
      if (field.only !== undefined) given.push({ what: `the field ${key} of ${unit.id}`, only: field.only });
      this.givenFields(field.type, fields[key], given, new Set([...seen, unit.id]));
    }
  }

  // Q-4: the targets that generate a member: the targets of the contract that the only of its unit and its own only keep.
  targetsOf(memberId: string): Lang[] {
    const found = this.members.get(memberId);
    const keeps = (only: { targets: readonly string[] } | undefined, lang: string): boolean => only === undefined || only.targets.includes(lang);
    return this.contract.targets.filter((lang) => found !== undefined && keeps(found.unit.only, lang) && keeps(found.member.only, lang));
  }

  // GN-13pa: the values of with of a case by name, each with the class that the member of its new makes, or undefined
  // when the value is no such instance value; empty when with is no object.
  caseWith(record: Record<string, unknown>): Map<string, { unit: string; value: unknown } | undefined> {
    const given = record['with'];
    const out = new Map<string, { unit: string; value: unknown } | undefined>();
    if (typeof given !== 'object' || given === null || Array.isArray(given)) return out;
    for (const [name, value] of Object.entries(given)) {
      const id = typeof value === 'object' && value !== null ? (value as { new?: unknown }).new : undefined;
      const found = typeof id === 'string' ? this.members.get(id) : undefined;
      const returns = found?.member.returns;
      const unit = found === undefined ? undefined : found.member.kind === 'constructor' ? found.unit.id : typeof returns === 'object' && 'unit' in returns && returns.library === undefined ? returns.unit : undefined;
      out.set(name, unit === undefined || this.units.get(unit)?.value.kind !== 'class' ? undefined : { unit, value });
    }
    return out;
  }

  // CK-92: the members that the instance values of the case that caseInstances reads call, or undefined.
  private namedThen: Set<string> | undefined;

  // GN-13f: what the calls of then of the instance values of the case that caseInstances reads arm, or undefined.
  private armedThen: ThenFaults | undefined;

  // CK-97, GN-13bc: a case with targets names targets of its member, and the cases of the group with the same input,
  // each with targets, together name every target of the member, so no target leaves the input untested.
  caseTargets(memberId: string, group: unknown[], resultKey: string, only: readonly string[] | undefined, path: string): void {
    if (!this.members.has(memberId)) return;
    const all: string[] = this.targetsOf(memberId).filter((lang) => only === undefined || only.includes(lang));
    const outcome = new Set(['id', 'rule', 'note', 'raises', 'targets', 'after', resultKey]);
    const input = (record: Record<string, unknown>): string => JSON.stringify(Object.keys(record).filter((key) => !outcome.has(key)).sort().map((key) => [key, record[key]]), (_key, value: unknown) => (typeof value === 'bigint' ? `${String(value)}n` : value));
    const limited = group.flatMap((kase) => {
      const record = typeof kase === 'object' && kase !== null ? (kase as Record<string, unknown>) : undefined;
      const targets = record?.['targets'];
      return record !== undefined && targets !== undefined ? [{ record, targets }] : [];
    });
    for (const { record, targets } of limited) {
      const where = `the case ${String(record['id'])} of ${memberId}`;
      if (!Array.isArray(targets) || targets.length === 0 || targets.some((lang) => typeof lang !== 'string')) {
        this.report('CK-97', path, `${where}: targets is a non-empty list of targets`);
        continue;
      }
      const unknown = targets.filter((lang) => !all.includes(lang as string));
      if (unknown.length > 0) this.report('CK-97', path, `${where}: targets names ${unknown.join(', ')}, where ${memberId} has no case (GN-13bc)`);
      const covered = new Set(limited.filter((other) => Array.isArray(other.targets) && input(other.record) === input(record)).flatMap((other) => other.targets as string[]));
      const left = all.filter((lang) => !covered.has(lang));
      if (left.length > 0) this.report('CK-97', path, `${where}: no case of the same arguments gives the result of ${left.join(', ')}; a case with targets has a case for every other target (GN-13bc)`);
    }
  }

  // CK-64: an integer of a case at a place of the contract type int or uint is a safe integer, the range of T-1 that
  // every target gives (a Node number); a case file gives a larger one as its JSON token, which cli reads as a bigint.
  // Such a value is an int64 in one target and no int in another, so the case would expect two results; a member
  // that takes or gives the range of i64 declares int64 (GN-12a).
  caseRange(memberId: string, record: Record<string, unknown>, resultKey: string, path: string): void {
    const found = this.members.get(memberId);
    if (found === undefined) return;
    const where = `the case ${String(record['id'])} of ${memberId}`;
    // GN-12a, B2.359: every target refuses an int or uint argument outside the safe integers as kind invalid_number,
    // so a case that raises that kind gives one result; the argument stays in the range of i64, which every target
    // writes as an integer.
    const raises = record['raises'];
    const refusesNumber = typeof raises === 'object' && raises !== null && (raises as Record<string, unknown>)['kind'] === 'invalid_number';
    const writable = (value: bigint): boolean => value >= -(2n ** 63n) && value < 2n ** 63n;
    // CK-100, GN-13w, B2.397: a case that raises invalid_number or invalid_argument_type may give a value outside its
    // type anywhere inside an argument: the binding refuses it with that kind before the core runs, the dynamic targets
    // give it as its JSON kind and Go writes no test of the case. A result, and a case of another kind, a target writes.
    const refusesType = typeof raises === 'object' && raises !== null && ['invalid_number', 'invalid_argument_type'].includes(String((raises as Record<string, unknown>)['kind']));
    const shown = (value: unknown): string => (typeof value === 'bigint' ? String(value) : JSON.stringify(value));
    // CK-100: why a value is no value of a scalar type of T-1 in every target, or undefined when it is one. A value in
    // an object form ({"float": ...}, {"ill_formed": ...}, a service or a composed text) is judged where its form is.
    const outside = (type: string, value: unknown): string | undefined => {
      if (typeof value === 'object' || value === undefined) return undefined;
      const integer = typeof value === 'bigint' || (typeof value === 'number' && Number.isInteger(value));
      if (type === 'uint') return !integer ? 'no integer' : (value as number | bigint) < 0 ? 'a negative integer' : undefined;
      if (type === 'int') return integer ? undefined : 'no integer';
      if (type === 'int64') return !integer ? 'no integer' : typeof value === 'bigint' && !writable(value) ? 'outside the range of i64' : undefined;
      if (type === 'float') return typeof value === 'number' || typeof value === 'bigint' ? undefined : 'no number';
      if (type === 'bool') return typeof value === 'boolean' ? undefined : 'no bool';
      if (type === 'text' || type === 'latin1') return typeof value === 'string' ? undefined : 'no text';
      return undefined;
    };
    const fields = (list: readonly { name: Name; type: Type }[], value: unknown, what: string, argument: boolean): void => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
      const given = value as Record<string, unknown>;
      for (const field of list) {
        const key = convert(field.name, 'python', 'variable');
        if (Object.hasOwn(given, key)) walk(field.type, given[key], `${what}.${key}`, argument);
      }
    };
    const walk = (type: Type, value: unknown, what: string, argument: boolean): void => {
      if (typeof type === 'string') {
        if ((type === 'int' || type === 'uint') && typeof value === 'bigint' && !(refusesNumber && what.startsWith('the argument') && writable(value))) {
          this.report('CK-64', path, `${where}: ${what} ${value} is outside the safe integers, the range of the type ${type} (T-1); a value of the range of i64 is an int64`);
        }
        const why = outside(type, value);
        if (why !== undefined && !(argument && refusesType)) {
          this.report('CK-100', path, `${where}: ${what} ${shown(value)} is ${why}, no value of the type ${type} (T-1), which a target writes as a literal of that type; only a value inside an argument of a case that raises invalid_number or invalid_argument_type is outside its type (GN-13w)`);
        }
        return;
      }
      if ('optional' in type) {
        if (value !== null) walk(type.optional, value, what, argument);
      } else if ('list' in type) {
        const repeat = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
        if (Array.isArray(value)) for (const [k, item] of value.entries()) walk(type.list, item, `${what}[${k}]`, argument);
        else if (repeat?.['kind'] === 'list') walk(type.list, repeat['value'], `${what}[]`, argument);
      } else if ('tuple' in type) {
        if (Array.isArray(value)) for (const [k, item] of value.entries()) if (type.tuple[k] !== undefined) walk(type.tuple[k], item, `${what}[${k}]`, argument);
      } else if ('map' in type || 'keyed_map' in type) {
        const item = 'map' in type ? type.map : type.keyed_map;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) for (const [k, entry] of Object.entries(value)) walk(item, entry, `${what}.${k}`, argument);
        // G-5: a map given as an array of [key, value], whose order the case keeps.
        else if (Array.isArray(value)) for (const entry of value) if (Array.isArray(entry) && entry.length === 2) walk(item, entry[1], `${what}.${String(entry[0])}`, argument);
      } else if ('unit' in type && (type.library === undefined || type.library === this.contract.library)) {
        // CK-64, CK-100: a record is the object of its fields, and a variant the object of its tag and the fields of
        // the case that the tag names (T-9).
        const unit = this.unit(type.unit);
        if (unit?.kind === 'record') fields(unit.fields ?? [], value, what, argument);
        else if (unit?.kind === 'variant' && unit.tag !== undefined && typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const tag = (value as Record<string, unknown>)[convert(unit.tag, 'python', 'variable')];
          const kase = (unit.cases ?? []).find((c) => c.value === tag);
          if (kase !== undefined) fields(kase.fields, value, what, argument);
        }
      }
    };
    for (const parameter of found.member.parameters ?? []) {
      const key = convert(parameter.name, 'python', 'variable');
      if (Object.hasOwn(record, key)) walk(parameter.type, record[key], `the argument ${key}`, true);
    }
    const returns = found.member.returns;
    if (returns !== undefined && returns !== 'self' && Object.hasOwn(record, resultKey)) walk(returns, record[resultKey], `the result ${resultKey}`, false);
    // CK-22, B2.465: the case values of a value alias that the result holds; those of the arguments are read with
    // the arguments of every call (aliasArgs).
    if (returns !== undefined && returns !== 'self' && Object.hasOwn(record, resultKey)) this.aliasPlaces(returns, record[resultKey], `the result ${resultKey}`, (message) => this.report('CK-22', path, `${where}: ${message} (G-5, GN-13)`));
  }

  // CK-22, B2.465: the places of a value of the type that hold a value alias of this contract, at any depth of a
  // list, a map, a tuple, an optional, a record and a variant, each judged as a case value of that alias.
  aliasPlaces(type: Type, value: unknown, what: string, report: (message: string) => void, seen: ReadonlySet<string> = new Set()): void {
    if (typeof type === 'string' || value === null || value === undefined || 'function' in type || 'passthrough' in type) return;
    if ('optional' in type) return this.aliasPlaces(type.optional, value, what, report, seen);
    if ('list' in type) {
      if (Array.isArray(value)) for (const [k, item] of value.entries()) this.aliasPlaces(type.list, item, `${what}[${k}]`, report, seen);
      return;
    }
    if ('tuple' in type) {
      if (Array.isArray(value)) for (const [k, item] of value.entries()) if (type.tuple[k] !== undefined) this.aliasPlaces(type.tuple[k], item, `${what}[${k}]`, report, seen);
      return;
    }
    if ('map' in type || 'keyed_map' in type) {
      const item = 'map' in type ? type.map : type.keyed_map;
      if (Array.isArray(value)) {
        for (const entry of value) if (Array.isArray(entry) && entry.length === 2) this.aliasPlaces(item, entry[1], `${what}.${typeof entry[0] === 'string' ? entry[0] : JSON.stringify(entry[0])}`, report, seen);
      } else if (typeof value === 'object') {
        for (const [k, entry] of Object.entries(value)) this.aliasPlaces(item, entry, `${what}.${k}`, report, seen);
      }
      return;
    }
    if (type.library !== undefined && type.library !== this.contract.library) return;
    const unit = this.unit(type.unit);
    if (unit?.kind === 'alias') return this.aliasCaseValue(unit.id, value, what, report);
    if (unit === undefined || seen.has(unit.id) || typeof value !== 'object' || Array.isArray(value)) return;
    const inner = new Set([...seen, unit.id]);
    const given = value as Record<string, unknown>;
    const tag = unit.kind === 'variant' && unit.tag !== undefined ? given[convert(unit.tag, 'python', 'variable')] : undefined;
    const fields = unit.kind === 'record' ? (unit.fields ?? []) : unit.kind === 'variant' ? ((unit.cases ?? []).find((c) => c.value === tag)?.fields ?? []) : [];
    for (const field of fields) {
      const key = convert(field.name, 'python', 'variable');
      if (Object.hasOwn(given, key)) this.aliasPlaces(field.type, given[key], `${what}.${key}`, report, inner);
    }
  }

  // CK-22, B2.465: the case values of a value alias among the arguments `given` of a call of the member.
  aliasArgs(member: Member, given: Record<string, unknown>, what: string, report: (message: string) => void): void {
    for (const parameter of member.parameters ?? []) {
      const key = convert(parameter.name, 'python', 'variable');
      if (Object.hasOwn(given, key)) this.aliasPlaces(parameter.type, given[key], `${key} of ${what}`, report);
    }
  }

  // CK-22, B2.465 (GN-13): a case value {"kind": <kind>, "value": ...} of the value alias `aliasId` at `what`, and each
  // value inside it. Reported: a kind that the generator gives no form, a list that is no array and no repeat form,
  // and a map or an object that is no array of [key, value] pairs and no repeat form. A value that is no {"kind": ...}
  // object ({"host": <sort>}, a value of another JSON kind that the binding refuses) is not judged here.
  aliasCaseValue(aliasId: string, value: unknown, what: string, report: (message: string) => void): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    const kind = record['kind'];
    if (typeof kind !== 'string') return;
    const shown = (given: unknown): string => JSON.stringify(given, (_key, item: unknown) => (typeof item === 'bigint' ? String(item) : item)) ?? 'no value';
    if (!ALIAS_CASE_KINDS.has(kind)) return report(`${what} is a case value of the kind ${kind} of the alias ${aliasId}, for which the generator has no form: a case value is of the kind ${[...ALIAS_CASE_KINDS].join(', ')}`);
    const held = record['value'];
    const repeated = record['repeat'] !== undefined;
    if (kind === 'list') {
      if (repeated) return this.aliasCaseValue(aliasId, held, `${what}[]`, report);
      if (!Array.isArray(held)) return report(`${what} is a case value of the kind list of the alias ${aliasId} whose value is ${shown(held)}, not an array of case values or the form {"kind": "list", "repeat": <n>, "value": <value>}`);
      for (const [i, item] of held.entries()) this.aliasCaseValue(aliasId, item, `${what}[${i}]`, report);
    } else if (kind === 'map' || kind === 'object') {
      if (repeated) return this.aliasCaseValue(aliasId, held, `${what}.${shown(record['key'])}`, report);
      // An object that its id names again has no value.
      if (kind === 'object' && !Object.hasOwn(record, 'value') && record['id'] !== undefined) return;
      if (!Array.isArray(held) || !held.every((pair) => Array.isArray(pair) && pair.length === 2)) return report(`${what} is a case value of the kind ${kind} of the alias ${aliasId} whose value is ${shown(held)}, not an array of [key, value] pairs in order`);
      for (const [key, item] of held as [unknown, unknown][]) this.aliasCaseValue(aliasId, item, `${what}.${typeof key === 'string' ? key : shown(key)}`, report);
    } else if (kind === 'reference' && typeof held === 'object' && held !== null && !Array.isArray(held)) {
      this.aliasCaseValue(aliasId, (held as Record<string, unknown>)['value'], what, report);
    }
  }

  // G-5 (GN-13): a value of the type cancel is {"cancel": "fired"}, a cancellation that fired before the call, or
  // {"cancel": "open"}, one that does not fire; an optional of it may be null.
  caseCancel(memberId: string, record: Record<string, unknown>, path: string): void {
    const found = this.members.get(memberId);
    if (found === undefined) return;
    const where = `the case ${String(record['id'])} of ${memberId}`;
    for (const parameter of found.member.parameters ?? []) {
      const optional = typeof parameter.type === 'object' && 'optional' in parameter.type;
      const type = typeof parameter.type === 'object' && 'optional' in parameter.type ? parameter.type.optional : parameter.type;
      const key = convert(parameter.name, 'python', 'variable');
      if (type !== 'cancel' || !Object.hasOwn(record, key)) continue;
      const value = record[key];
      if (optional && value === null) continue;
      const form = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
      const state = form?.['cancel'];
      if (form === undefined || Object.keys(form).length !== 1 || (state !== 'fired' && state !== 'open')) {
        this.report('CK-22', path, `${where}: the argument ${key} is {"cancel": "fired" | "open"}${optional ? ' or null' : ''}, not ${JSON.stringify(value)} (G-5)`);
      }
    }
  }

  // The arguments of a member in an instance value or a case whose class type is given as an instance value.
  instanceArgs(member: Member, given: Record<string, unknown>, report: (message: string) => void, what: string): void {
    this.aliasArgs(member, given, what, report);
    for (const parameter of member.parameters ?? []) {
      const key = convert(parameter.name, 'python', 'variable');
      const value = given[key];
      const unit = typeof parameter.type === 'object' && 'unit' in parameter.type && parameter.type.library === undefined ? this.units.get(parameter.type.unit)?.value : undefined;
      if (unit?.kind === 'class' && typeof value === 'object' && value !== null && !Array.isArray(value)) this.instanceValue(unit.id, value, report, `${key} of ${what}`);
      else this.namedIn(parameter.type, value);
    }
  }

  // CK-92: the members that the instance values inside a value call: an instance value at the place of a class or an
  // interface in a list, an optional, a map or a field of a record, and the instance values of its own arguments. The
  // value itself is judged where its place is (instanceValue, codeValue).
  private namedIn(type: Type, value: unknown): void {
    if (this.namedThen === undefined || typeof type === 'string' || typeof value !== 'object' || value === null) return;
    if ('optional' in type) return this.namedIn(type.optional, value);
    if ('list' in type) {
      if (Array.isArray(value)) for (const item of value) this.namedIn(type.list, item);
      return;
    }
    if (Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if ('map' in type) {
      for (const item of Object.values(record)) this.namedIn(type.map, item);
      return;
    }
    if (!('unit' in type) || type.library !== undefined) return;
    const unit = this.units.get(type.unit)?.value;
    if (unit?.kind === 'record') {
      for (const field of unit.fields ?? []) this.namedIn(field.type, record[convert(field.name, 'python', 'variable')]);
      return;
    }
    if (unit?.kind !== 'class' && unit?.kind !== 'interface') return;
    const id = record['new'] ?? record['from'];
    const found = typeof id === 'string' ? this.members.get(id) : undefined;
    if (found === undefined) return;
    this.namedThen.add(found.member.id);
    if (found.unit.kind === 'class' && record['receiver'] !== undefined) this.namedIn({ unit: found.unit.id }, record['receiver']);
    const args = record['args'];
    if (typeof args !== 'object' || args === null || Array.isArray(args)) return;
    for (const parameter of found.member.parameters ?? []) this.namedIn(parameter.type, (args as Record<string, unknown>)[convert(parameter.name, 'python', 'variable')]);
  }

  // G-5 (GN-13f): an instance of the class unit `unitId`:
  //   {"new": <member id>, "receiver"?, "args"?, "then"?} or {"from": <member id>, "receiver"?, "args"?, "pick", "then"?}
  instanceValue(unitId: string, value: unknown, report: (message: string) => void, what: string): void {
    const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
    if (record === undefined) return report(`${what} is not an instance value {"new" | "from": <member id>, ...}`);
    const from = Object.hasOwn(record, 'from');
    for (const key of Object.keys(record)) {
      if (!['new', 'from', 'receiver', 'args', 'then', ...(from ? ['pick'] : [])].includes(key)) report(`${what} has no key ${key}`);
    }
    if (Object.hasOwn(record, 'new') === from) return report(`${what} names its member in new or in from, one of them`);
    const id = record[from ? 'from' : 'new'];
    const found = typeof id === 'string' ? this.members.get(id) : undefined;
    if (found === undefined) return report(`${what} names ${String(id)}, which is no member`);
    const { member } = found;
    this.namedThen?.add(member.id);
    const method = typeof member.core === 'object' && member.core.receiver !== undefined;
    // The type that the member gives, then each step of pick into it.
    // T-3: a named type of this repository (types) is the unit of this contract that it names.
    const named = this.contract.types as Record<string, { library: string; unit: string } | undefined>;
    const own = (type: Type | undefined): Type | undefined => {
      const owner = typeof type === 'string' ? named[type] : undefined;
      return owner !== undefined && owner.library === this.contract.library ? { unit: owner.unit } : type;
    };
    let at: Type | undefined = own(member.returns === undefined || member.returns === 'self' ? { unit: found.unit.id } : member.returns);
    const pick = record['pick'];
    if (from && !Array.isArray(pick)) return report(`${what} reads its instance from the result of ${member.id} by a pick, a list of steps`);
    for (const [i, step] of (Array.isArray(pick) ? pick : []).entries()) {
      const target: Type | undefined = at;
      if (target === undefined) break;
      // GN-13f: the step "?" takes the value of an optional, which the test requires to be present.
      if (step === '?') {
        if (typeof target !== 'object' || !('optional' in target)) return report(`step ${i} of the pick of ${what} takes the value of ${JSON.stringify(target)}, which is no optional`);
        at = own(target.optional);
        continue;
      }
      if (typeof step === 'string') {
        const unit: Unit | undefined = typeof target === 'object' && 'unit' in target && target.library === undefined ? this.units.get(target.unit)?.value : undefined;
        const field: Field | undefined = unit?.kind === 'record' ? (unit.fields ?? []).find((f: Field) => convert(f.name, 'python', 'variable') === step) : undefined;
        if (field === undefined) return report(`step ${i} of the pick of ${what} names the field ${step}, which ${JSON.stringify(target)} has not`);
        at = own(field.type);
        continue;
      }
      const index = typeof step === 'object' && step !== null && !Array.isArray(step) ? (step as Record<string, unknown>) : {};
      const n = index['index'] ?? index['tuple'];
      if (Object.keys(index).length !== 1 || typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return report(`step ${i} of the pick of ${what} is not a field name, {"index": n} or {"tuple": n}`);
      if ('index' in index) {
        if (typeof target !== 'object' || !('list' in target)) return report(`step ${i} of the pick of ${what} takes an item of ${JSON.stringify(target)}, which is no list`);
        at = own(target.list);
      } else {
        if (typeof target !== 'object' || !('tuple' in target) || n >= target.tuple.length) return report(`step ${i} of the pick of ${what} takes part ${n} of ${JSON.stringify(target)}, which is no tuple of that length`);
        at = own(target.tuple[n]);
      }
    }
    if (typeof at !== 'object' || !('unit' in at) || at.unit !== unitId || at.library !== undefined) report(`${what}: ${member.id}${from ? ' and its pick give' : ' gives'} ${JSON.stringify(at)}, not the class ${unitId}`);
    if (method && record['receiver'] === undefined) report(`${what}: ${member.id} is a method, so the value gives its receiver`);
    if (!method && record['receiver'] !== undefined) report(`${what}: ${member.id} has no receiver, so the value gives none`);
    if (method && record['receiver'] !== undefined) this.instanceValue(found.unit.id, record['receiver'], report, `the receiver of ${what}`);
    const args = (target: Member, given: unknown, whose: string): void => {
      const keys = callArgs(whose, given, target.parameters ?? [], target.id, 'call', report);
      if (keys !== undefined) this.instanceArgs(target, keys, report, whose);
    };
    args(member, record['args'], what);
    const then = record['then'];
    if (then !== undefined && !Array.isArray(then)) report(`the then of ${what} is not a list of calls`);
    for (const [i, item] of (Array.isArray(then) ? then : []).entries()) {
      const call = typeof item === 'object' && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      for (const key of Object.keys(call)) if (!['call', 'args', 'raises', 'faults', 'on', 'service', 'peer'].includes(key)) report(`then ${i} of ${what} has no key ${key}`);
      const step = typeof call['call'] === 'string' ? this.members.get(call['call']) : undefined;
      const stepMethod = step !== undefined && typeof step.member.core === 'object' && step.member.core.receiver !== undefined;
      // A call with on: receiver is a method of the class of the receiver of the value, called on that receiver.
      if (call['on'] !== undefined) {
        if (call['on'] !== 'receiver') {
          report(`then ${i} of ${what} calls on ${String(call['on'])}, but on names only receiver`);
          continue;
        }
        if (record['receiver'] === undefined) {
          report(`then ${i} of ${what} calls ${String(call['call'])} on its receiver, but ${member.id} gives the value without one`);
          continue;
        }
        if (step === undefined || step.unit.id !== found.unit.id || !stepMethod) {
          report(`then ${i} of ${what} calls ${String(call['call'])} on its receiver, which is no method of ${found.unit.id}`);
          continue;
        }
      } else if (step === undefined || step.unit.id !== unitId || !stepMethod) {
        report(`then ${i} of ${what} calls ${String(call['call'])}, which is no method of ${unitId}`);
        continue;
      }
      this.namedThen?.add(step.member.id);
      // The faults that the call arms for itself alone, in the form of the faults of a case.
      const faults = call['faults'] === undefined ? undefined : this.faultsOf(call['faults'], (message) => report(`the faults of then ${i} of ${what}: ${message}`));
      if (faults !== undefined && this.armedThen !== undefined) {
        this.armedThen.any = true;
        for (const filled of faults.fills) this.armedThen.fills.add(filled);
        for (const library of faults.broken) this.armedThen.broken.add(library);
      }
      args(step.member, call['args'], `then ${i} of ${what}`);
      // A call that fails with a kind of the member's raises; the instance stays for the next step.
      if (call['raises'] !== undefined) {
        const raises = call['raises'];
        const kind = typeof raises === 'object' && raises !== null && !Array.isArray(raises) && Object.keys(raises).length === 1 ? (raises as Record<string, unknown>)['kind'] : undefined;
        if (typeof kind !== 'string') {
          report(`then ${i} of ${what} expects ${step.member.id} to fail by {"kind": <kind>}, not ${JSON.stringify(raises)}`);
          continue;
        }
        const rows = new Map(this.contract.errors.kinds.map((row) => [row.variant, row]));
        const kinds = (step.member.raises ?? []).flatMap((variant) => { const row = rows.get(variant); return row === undefined ? [] : kindsOf(row); });
        if (!kinds.includes(kind)) report(`then ${i} of ${what} expects ${step.member.id} to fail with ${kind}, which is no kind of its raises`);
        else if (faults !== undefined && !faults.fills.has(kind)) report(`then ${i} of ${what} expects ${step.member.id} to fail with ${kind}, which no point that it arms fills`);
      }
    }
  }

  // G-5: the faults of a case, [{point: "<library>.<id>", kind, errno?, bytes?, nth?}]. A point is one of the faults
  // of this contract or of the library that the name gives, and takes the injection of its kind. Gives the kinds that
  // the armed points fill and the libraries whose point internal is armed as broken (X-1).
  caseFaults(given: unknown, where: string, path: string): { fills: Set<string>; broken: Set<string> } {
    return this.faultsOf(given, (message) => this.report('CK-22', path, `${where}: ${message} (G-5)`));
  }

  // G-5: the faults of a case or of a call of then (GN-13f), each finding given to report.
  faultsOf(given: unknown, report: (message: string) => void): { fills: Set<string>; broken: Set<string> } {
    const fills = new Set<string>();
    const broken = new Set<string>();
    if (!Array.isArray(given) || given.length === 0) {
      report('faults is not a list of {point, kind}');
      return { fills, broken };
    }
    const libraries = new Map<string, string>([this.contract.library, ...this.dependencies.keys()].map((library) => [pointLibrary(library), library]));
    for (const [f, item] of given.entries()) {
      const fault = typeof item === 'object' && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      const what = `fault ${f}`;
      for (const key of Object.keys(fault)) if (!['point', 'kind', 'errno', 'bytes', 'nth'].includes(key)) report(`${what} has no key ${key}`);
      const [, prefix, id] = /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/.exec(typeof fault['point'] === 'string' ? fault['point'] : '') ?? [];
      const library = prefix === undefined ? undefined : libraries.get(prefix);
      if (library === undefined || id === undefined) {
        report(`the point ${String(fault['point'])} of ${what} is not <library>.<id> of this contract or of a library that the check was given`);
        continue;
      }
      const owner = library === this.contract.library ? this.contract : this.given(library);
      const point = (owner?.faults ?? []).find((p) => p.id === id);
      if (point === undefined) {
        report(`${String(fault['point'])} is not a point of faults of ${library}`);
        continue;
      }
      const kind = fault['kind'];
      if (kind !== 'io' && kind !== 'short' && kind !== 'broken') {
        report(`the kind of ${what} is not io, short or broken`);
        continue;
      }
      if (!point.inject.includes(kind)) report(`the point ${String(fault['point'])} takes ${point.inject.join(', ')}, not ${kind}`);
      const natural = (value: unknown, least: number): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= least;
      if (kind === 'short' ? !natural(fault['bytes'], 0) : fault['bytes'] !== undefined) report(`${what}: bytes, a count of bytes, is given with the kind short and only with it`);
      if (fault['errno'] !== undefined && (kind !== 'io' || typeof fault['errno'] !== 'string' || !ERRNO_SYMBOL.test(fault['errno']))) {
        report(`${what}: errno is the symbol of an errno, such as ENOSPC, and is given with the kind io only`);
      }
      if (fault['nth'] !== undefined && !natural(fault['nth'], 1)) report(`${what}: nth counts from 1`);
      for (const filled of point.fills) fills.add(filled);
      if (id === 'internal' && kind === 'broken') broken.add(library);
    }
    return { fills, broken };
  }

  // U-7: a case of an alias is {id, value, raises}: the value that the in function refuses and the kind it gives,
  // one of in_raises of the alias.
  aliasCases(aliasId: string, group: unknown[], path: string, kinds: Set<string>): void {
    const rows = new Map(this.contract.errors.kinds.map((row) => [row.variant, row]));
    const declared = new Set((this.unit(aliasId)?.in_raises ?? []).flatMap((variant) => kindsOf(rows.get(variant) ?? { variant })));
    for (const kase of group) {
      const record = typeof kase === 'object' && kase !== null && !Array.isArray(kase) ? (kase as Record<string, unknown>) : {};
      const report = (message: string): void => this.report('CK-22', path, `the case ${String(record['id'])} of the alias ${aliasId}: ${message} (U-7)`);
      for (const key of Object.keys(record)) if (!['id', 'note', 'rule', 'value', 'raises'].includes(key)) report(`a case of an alias has no key ${key}`);
      if (!Object.hasOwn(record, 'value')) report('a case of an alias gives its value');
      const raises = record['raises'];
      const kind = typeof raises === 'object' && raises !== null ? (raises as Record<string, unknown>)['kind'] : undefined;
      if (typeof kind !== 'string') {
        report('a case of an alias raises a kind');
      } else if (!declared.has(kind)) {
        report(`the kind ${kind} is not of in_raises of ${aliasId}`);
      } else {
        kinds.add(kind);
      }
    }
  }

  // Whether a type holds a callback interface or a function, which a JSON case cannot give (U-3, T-2).
  // The callback unit that a type is, when the type is a callback unit of this contract itself.
  callbackOf(type: Type): Unit | undefined {
    if (typeof type !== 'object' || !('unit' in type) || type.library !== undefined) return undefined;
    const unit = this.units.get(type.unit)?.value;
    return unit?.origin === 'callback' ? unit : undefined;
  }

  // G-5: the values of language code in a case: a callback fixture at each place of a callback type, the parameter
  // itself, a field of a record, an item of a list or an optional, and a function value at each place of a function
  // type. A callback fixture is {"callback": {<callback member id>: [<row>]}, "calls": [{"member", "args"}]}; a row is
  // {"args": {<parameter>: <value>}} with "result", or "raise" {"error", "kind"} of a class that the member
  // recognizes, and "once" and "async". A function value is the function fixture of GN-6ae.
  caseFixtures(memberId: string, group: unknown[], path: string): void {
    const member = this.members.get(memberId)?.member;
    const snake = (name: Name): string => convert(name, 'python', 'variable');
    for (const kase of group) {
      const record = typeof kase === 'object' && kase !== null ? (kase as Record<string, unknown>) : {};
      const where = `the case ${String(record['id'])} of ${memberId}`;
      const report = (message: string): void => this.report('CK-22', path, `${where}: ${message} (G-5)`);
      // GN-13p: a step of a function fixture of the case may call on its receiver, an instance of the unit of a method.
      const found = this.members.get(memberId);
      const method = found !== undefined && typeof found.member.core === 'object' && found.member.core.receiver !== undefined;
      // GN-13pa: and on a value that the case names under with.
      const scope = new Map<string, string>(method ? [['receiver', found.unit.id]] : []);
      if (method) for (const [name, value] of this.caseWith(record)) if (value !== undefined) scope.set(name, value.unit);
      this.boundScope.push(scope);
      try {
        for (const parameter of member?.parameters ?? []) {
          const key = snake(parameter.name);
          // B2.489: a fixture of a callback unit of another library, whose raise rows may carry values.
          if (Object.hasOwn(record, key) && this.holdsForeignCallback(parameter.type)) this.foreignValue(parameter.type, record[key], key, report);
          if (!this.takesCode(parameter.type) || (!Object.hasOwn(record, key) && parameter.default !== undefined)) continue;
          this.codeValue(parameter.type, record[key], key, report);
        }
      } finally {
        this.boundScope.pop();
      }
    }
  }

  // G-5: a value at a place of the type that may hold language code.
  codeValue(type: Type, value: unknown, what: string, report: (message: string) => void): void {
    if (typeof type === 'string') return;
    if ('optional' in type) {
      if (value !== null) this.codeValue(type.optional, value, what, report);
      return;
    }
    if ('list' in type) {
      if (!Array.isArray(value)) return report(`${what} is not a list`);
      for (const [k, item] of value.entries()) this.codeValue(type.list, item, `${what}[${k}]`, report);
      return;
    }
    // GN-6ae: a function whose return is passthrough is the function of a member with machine, given as a function
    // fixture; any other function type is the value of GN-6z, given by its rows.
    if ('function' in type) return typeof type.function.returns === 'object' && 'passthrough' in type.function.returns ? this.functionValue(type.function, value, what, report) : this.functionRows(type.function.parameters, value, what, report);
    if (!('unit' in type) || type.library !== undefined) return;
    const unit = this.units.get(type.unit)?.value;
    // CK-77, GN-6ap: a value of a generated interface is an instance value of a class that implements it.
    if (unit?.kind === 'interface' && unit.origin === 'generated') {
      const instance = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
      const id = instance?.['new'] ?? instance?.['from'];
      const made = typeof id === 'string' ? this.members.get(id) : undefined;
      const returns = made?.member.returns;
      // The class of an instance made by new: that of its constructor, or the class that its factory returns.
      const at = made === undefined || instance?.['new'] === undefined ? undefined : returns === undefined || returns === 'self' ? made.unit.id : typeof returns === 'object' && 'unit' in returns && returns.library === undefined ? returns.unit : undefined;
      const implementer = at === undefined ? undefined : this.units.get(at)?.value;
      if (implementer === undefined || !(implementer.implements ?? []).some((ref) => ref.library === undefined && ref.unit === unit.id)) {
        return report(`${what} is no instance value, made by new, of a class that implements the generated interface ${unit.id} (CK-77, GN-6ap)`);
      }
      return this.instanceValue(implementer.id, value, report, what);
    }
    if (unit?.origin === 'callback') {
      // An instance of a class of this contract that implements the interface is given as an instance value (GN-13f).
      const instance = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
      const id = instance?.['new'] ?? instance?.['from'];
      if (typeof id === 'string') {
        const made = this.members.get(id);
        const returns = made?.member.returns;
        const at = returns === undefined || returns === 'self' ? made?.unit.id : typeof returns === 'object' && 'unit' in returns && returns.library === undefined ? returns.unit : undefined;
        const implementer = at === undefined ? undefined : this.units.get(at)?.value;
        if (implementer === undefined || !(implementer.implements ?? []).some((ref) => ref.library === undefined && ref.unit === unit.id)) {
          return report(`${what} is an instance value of ${String(at)}, which does not implement ${unit.id}`);
        }
        if (instance?.['from'] === undefined) return this.instanceValue(implementer.id, value, report, what);
        return report(`${what} is an instance of ${implementer.id} made by new, not read from a result`);
      }
      return this.callbackValue(unit, value, what, report);
    }
    if (unit?.kind === 'record') {
      const fields = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
      if (fields === undefined) return;
      for (const field of unit.fields ?? []) {
        const key = convert(field.name, 'python', 'variable');
        if (this.takesCode(field.type) && Object.hasOwn(fields, key)) this.codeValue(field.type, fields[key], `${what}.${key}`, report);
      }
    }
  }

  // G-5 (GN-6z): a function value, {"function": [<row>]}.
  functionRows(parameters: readonly Type[], value: unknown, what: string, report: (message: string) => void): void {
    const form = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
    const rows = form?.['function'];
    if (form === undefined || !Array.isArray(rows) || Object.keys(form).length !== 1) return report(`${what} is not {"function": [<row>]}`);
    const positions = parameters.map((_p, i) => String(i));
    for (const [r, item] of rows.entries()) {
      const row = typeof item === 'object' && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      const at = `row ${r} of ${what}`;
      for (const key of Object.keys(row)) if (!['args', 'result', 'once'].includes(key)) report(`${at} has no key ${key}`);
      if (parameters.some((p) => this.nativeArgument(p))) {
        report(`${at}: the function takes an object of the language, which a row cannot give`);
        continue;
      }
      const given = row['args'];
      const keys = typeof given === 'object' && given !== null && !Array.isArray(given) ? Object.keys(given) : undefined;
      if (keys === undefined || keys.length !== positions.length || positions.some((n) => !keys.includes(n))) report(`the args of ${at} are not the positions ${positions.join(', ')} of its parameters`);
    }
  }

  // G-5 (GN-6ae): a function fixture, {"function": {"calls": [<step>], "result": <value>}} or with "raise" in place
  // of "result". A step is {"on": "<position>", "call": "<member id>", "args": {...}}: a method of the class of the
  // parameter at that position, with exactly its parameters, where an argument of a function type is again a function
  // fixture; a step may name "result", the value that its call returns. "awaits": true marks a function that returns an
  // awaitable, of a function type with async_allowed, and inside a step only where the fixture of the step names it. "raise" is "exception" or {"error", "kind"} of an error unit that the function recognizes (U-3).
  functionValue(fn: Extract<Type, { function: unknown }>['function'], value: unknown, what: string, report: (message: string) => void): void {
    const record = (given: unknown): Record<string, unknown> | undefined => (typeof given === 'object' && given !== null && !Array.isArray(given) ? (given as Record<string, unknown>) : undefined);
    const form = record(value);
    const fixture = record(form?.['function']);
    if (form === undefined || fixture === undefined || Object.keys(form).length !== 1) return report(`${what} is not a function fixture {"function": {"calls": [<step>], "result" | "raise": <value>}}`);
    for (const key of Object.keys(fixture)) if (!['calls', 'result', 'raise', 'awaits', 'names'].includes(key)) report(`the function fixture ${what} has no key ${key}`);
    // GN-13n: names, a name for each parameter by position, which the steps of this fixture and of the fixtures inside
    // it give as on and as a value {"bound": <name>}.
    const scope = new Map<string, string>();
    const names = fixture['names'];
    if (names !== undefined && (!Array.isArray(names) || names.length > fn.parameters.length)) report(`the names of the function fixture ${what} are not a list of at most ${fn.parameters.length} names, one for each parameter by position`);
    else for (const [i, name] of (names ?? []).entries()) {
      const type = fn.parameters[i];
      const unit = typeof type === 'object' && 'unit' in type && type.library === undefined ? this.units.get(type.unit)?.value : undefined;
      if (typeof name !== 'string' || !/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) report(`the name ${JSON.stringify(name)} of the function fixture ${what} is not a snake_case name`);
      else if (unit === undefined || (unit.kind !== 'class' && unit.kind !== 'interface')) report(`the name ${name} of the function fixture ${what} names the parameter ${i}, whose type is no class or interface of this contract`);
      else if (scope.has(name) || this.boundScope.some((outer) => outer.has(name))) report(`the name ${name} of the function fixture ${what} is given by a function fixture around it too`);
      else scope.set(name, unit.id);
    }
    this.boundScope.push(scope);
    try {
      this.functionSteps(fn, fixture, what, report);
    } finally {
      this.boundScope.pop();
    }
  }

  // GN-13o: the kinds that the steps of function fixtures and the calls of after expect, by the member of the call,
  // which count as cases of that member (K-1).
  callRaised = new Map<string, Set<string>>();

  // B2.365: the members that a step of a function fixture or a call of after of a case calls, which have a case there.
  stepCalled = new Set<string>();

  // GN-13o: the raises of a step or of a call of after, {"kind": <kind>} of a kind of the raises of its member.
  // GN-13e, B2.466 (B2.374): the result of a member without a result is null wherever a case writes it, under `key`
  // of `holder`: the result key of a case, a call of after, a step of a function fixture and a row of a callback
  // fixture. Each language tests it as no value, so another value there has a test that fails.
  statesNoResult(member: Member, holder: Record<string, unknown>, key: string): boolean {
    return member.returns === 'none' && Object.hasOwn(holder, key) && holder[key] !== null;
  }

  // GN-13e, B2.466: the result of a case of a member without a result, which the case may leave out.
  caseNoResult(memberId: string, record: Record<string, unknown>, resultKey: string, path: string): void {
    const found = this.members.get(memberId);
    if (found === undefined || !this.statesNoResult(found.member, record, resultKey)) return;
    this.report('CK-22', path, `the case ${String(record['id'])} of ${memberId}: the ${resultKey} is ${JSON.stringify(record[resultKey], (_key, item: unknown) => (typeof item === 'bigint' ? String(item) : item))}, and ${memberId} has no result, so its result is null (G-5, GN-13e)`);
  }

  callRaises(member: Member, call: Record<string, unknown>, at: string, report: (message: string) => void): void {
    if (!Object.hasOwn(call, 'raises')) return;
    const raises = call['raises'];
    const kind = typeof raises === 'object' && raises !== null && !Array.isArray(raises) && Object.keys(raises).length === 1 ? (raises as { kind?: unknown }).kind : undefined;
    const rows = new Map(this.contract.errors.kinds.map((row) => [row.variant, row]));
    const kinds = new Set((member.raises ?? []).flatMap((variant) => { const row = rows.get(variant); return row === undefined ? [] : kindsOf(row); }));
    if (typeof kind !== 'string') return report(`the raises of ${at} is ${JSON.stringify(raises)}, not {"kind": <kind>}`);
    if (!kinds.has(kind)) return report(`${at} raises the kind ${kind}, which is no kind of the raises of ${member.id}`);
    if (Object.hasOwn(call, 'result')) report(`${at} names a result and raises, one of them`);
    const found = this.callRaised.get(member.id) ?? new Set<string>();
    found.add(kind);
    this.callRaised.set(member.id, found);
  }

  // GN-13o: the names that the function fixtures of a value of the type give, each to the id of the unit of its
  // parameter, at any depth of their steps.
  fixtureNames(type: Type, value: unknown, into: Map<string, string>): void {
    const record = (given: unknown): Record<string, unknown> | undefined => (typeof given === 'object' && given !== null && !Array.isArray(given) ? (given as Record<string, unknown>) : undefined);
    if (typeof type !== 'object' || !('function' in type)) return;
    const fixture = record(record(value)?.['function']);
    if (fixture === undefined) return;
    for (const [i, name] of (Array.isArray(fixture['names']) ? fixture['names'] : []).entries()) {
      const at = type.function.parameters[i];
      if (typeof name === 'string' && typeof at === 'object' && 'unit' in at && at.library === undefined) into.set(name, at.unit);
    }
    for (const item of Array.isArray(fixture['calls']) ? fixture['calls'] : []) {
      const step = record(item);
      const found = typeof step?.['call'] === 'string' ? this.members.get(step['call']) : undefined;
      const args = record(step?.['args']);
      for (const parameter of found?.member.parameters ?? []) this.fixtureNames(parameter.type, args?.[convert(parameter.name, 'python', 'variable')], into);
    }
  }

  // GN-13n: the names that the function fixtures around the value in reading give, the innermost last, each to the
  // id of the unit of its parameter.
  boundScope: Map<string, string>[] = [];

  // GN-13n: the unit of the parameter that a name of the function fixtures around the value gives, or undefined.
  boundUnit(name: string): string | undefined {
    for (const scope of [...this.boundScope].reverse()) if (scope.has(name)) return scope.get(name);
    return undefined;
  }

  // G-5 (GN-6ae): the steps of a function fixture.
  functionSteps(fn: Extract<Type, { function: unknown }>['function'], fixture: Record<string, unknown>, what: string, report: (message: string) => void): void {
    const record = (given: unknown): Record<string, unknown> | undefined => (typeof given === 'object' && given !== null && !Array.isArray(given) ? (given as Record<string, unknown>) : undefined);
    // GN-6ae: awaits, the marker of a function that returns an awaitable.
    const awaits = Object.hasOwn(fixture, 'awaits');
    if (awaits && fixture['awaits'] !== true) report(`the awaits of the function fixture ${what} is ${JSON.stringify(fixture['awaits'])}, not true`);
    else if (awaits && !fn.async_allowed) report(`the function fixture ${what} names awaits, and its function type has no async_allowed: true`);
    else if (awaits && this.stepAwaits === false) report(`the function fixture ${what} names awaits, and the fixture of its step does not`);
    if (Object.hasOwn(fixture, 'result') === Object.hasOwn(fixture, 'raise')) report(`the function fixture ${what} has a result or a raise, one of them`);
    const raise = fixture['raise'];
    if (Object.hasOwn(fixture, 'raise') && raise !== 'exception') {
      const error = record(raise)?.['error'];
      if (error === undefined || typeof record(raise)?.['kind'] !== 'string') report(`the function fixture ${what} raises ${JSON.stringify(raise)}, which is neither "exception" nor {"error", "kind"}`);
      else if (!(fn.errors?.recognize ?? []).some((ref) => ref.library === undefined && ref.unit === error)) report(`the function fixture ${what} raises ${String(error)}, which the function does not recognize (U-3)`);
      else this.unitKind(String(error), record(raise)?.['kind'], `the function fixture ${what}`, report);
    }
    const calls = fixture['calls'];
    if (!Array.isArray(calls)) return report(`the calls of ${what} are not a list of steps`);
    for (const [i, item] of calls.entries()) {
      const step = record(item) ?? {};
      const at = `step ${i} of ${what}`;
      for (const key of Object.keys(step)) if (!['on', 'call', 'args', 'result', 'raises'].includes(key)) report(`${at} has no key ${key}`);
      const on = step['on'];
      const type = typeof on === 'string' && /^(0|[1-9][0-9]*)$/.test(on) ? fn.parameters[Number(on)] : undefined;
      // GN-13n: on may be a name that this fixture or a fixture around it gives.
      const named = typeof on === 'string' && type === undefined ? this.boundUnit(on) : undefined;
      const unitId = named ?? (typeof type === 'object' && 'unit' in type && type.library === undefined ? type.unit : undefined);
      const unit = unitId === undefined ? undefined : this.units.get(unitId)?.value;
      if (unit?.kind !== 'class') {
        report(`${at} is on ${String(on)}, which is neither a parameter of the function whose type is a class of this contract nor a name of a function fixture around it whose parameter is one`);
        continue;
      }
      const outer = this.stepAwaits;
      this.stepAwaits = awaits;
      const called = this.methodCall(unit.id, step, at, report);
      if (called !== undefined) this.stepCalled.add(called.id);
      if (called !== undefined) this.callRaises(called, step, at, report);
      if (called !== undefined && this.statesNoResult(called, step, 'result')) report(`${at} calls ${called.id}, which has no result, so its result is null, not ${JSON.stringify(step['result'])} (GN-13e)`);
      this.stepAwaits = outer;
    }
  }

  // GN-6ae: whether the function fixture of the step in reading names awaits; undefined outside a step.
  stepAwaits: boolean | undefined = undefined;

  // G-5: a call {"call": "<member id>", "args": {...}} of a method of the class `unitId`, with exactly its parameters;
  // an argument that may hold language code is judged as the value of a case is. Gives the member.
  methodCall(unitId: string, call: Record<string, unknown>, at: string, report: (message: string) => void): Member | undefined {
    const found = typeof call['call'] === 'string' ? this.members.get(call['call']) : undefined;
    const method = found !== undefined && typeof found.member.core === 'object' && found.member.core.receiver !== undefined;
    if (found === undefined || found.unit.id !== unitId || !method) {
      report(`${at} calls ${String(call['call'])}, which is no method of ${unitId}`);
      return undefined;
    }
    const args = callArgs(at, call['args'], found.member.parameters ?? [], found.member.id, 'call', report);
    if (args === undefined) return found.member;
    this.aliasArgs(found.member, args, at, report);
    for (const parameter of found.member.parameters ?? []) {
      const key = convert(parameter.name, 'python', 'variable');
      // CK-101: a parameter with a default that the call leaves out has no value to judge.
      if (!Object.hasOwn(args, key)) continue;
      // B2.383: {"bound": <name>} is judged by GN-13n below, also for a parameter of a generated interface (CK-77).
      if (this.takesCode(parameter.type) && !(typeof args[key] === 'object' && args[key] !== null && !Array.isArray(args[key]) && Object.keys(args[key] as object).length === 1 && Object.hasOwn(args[key] as object, 'bound'))) this.codeValue(parameter.type, args[key], `${key} of ${at}`, report);
      // GN-13n: {"bound": <name>} is an argument that a function fixture around the call gives by that name, of the
      // class of the parameter or of a class that implements it.
      const given = args[key];
      const name = typeof given === 'object' && given !== null && !Array.isArray(given) && Object.keys(given).length === 1 ? (given as { bound?: unknown }).bound : undefined;
      if (name === undefined) continue;
      const bound = typeof name === 'string' ? this.boundUnit(name) : undefined;
      const wanted = typeof parameter.type === 'object' && 'unit' in parameter.type && parameter.type.library === undefined ? parameter.type.unit : undefined;
      if (bound === undefined) report(`${key} of ${at} is ${JSON.stringify(given)}, and no function fixture around it gives that name`);
      else if (wanted === undefined || (bound !== wanted && !(this.units.get(bound)?.value.implements ?? []).some((ref) => ref.library === undefined && ref.unit === wanted))) report(`${key} of ${at} is the argument ${String(name)} of the class ${bound}, which is no value of the type of ${key}`);
    }
    return found.member;
  }

  // G-5 (GN-6ae): whether a function fixture of the value, at any depth of its steps, raises an exception of the
  // language.
  raisesException(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    if (Array.isArray(value)) return value.some((item) => this.raisesException(item));
    const fixture = (value as Record<string, unknown>)['function'];
    if (typeof fixture === 'object' && fixture !== null && (fixture as Record<string, unknown>)['raise'] === 'exception') return true;
    return Object.values(value).some((item) => this.raisesException(item));
  }

  // CK-95, GN-13j: the service of a case is a service of services; its setup, its check and the changes of the calls of
  // then need the program of the state of that service; a value {"service": ...} and a change stand in a case with a
  // service; and the row of such a case holds for no target whose core has no socket (WASM).
  caseService(memberId: string, only: readonly Lang[] | undefined, record: Record<string, unknown>, path: string): void {
    const where = `the case ${String(record['id'])} of ${memberId}`;
    const report = (message: string): void => this.report('CK-95', path, `${where}: ${message} (GN-13j)`);
    // The values {"service": ...} of the case and the calls of then of its instance values that change the service; the
    // JSON of a state is the program's, so it is not read.
    let value: string | undefined;
    let changes = false;
    // GN-13q: the calls of then that step the peer of the service.
    let peers = false;
    const walk = (item: unknown): void => {
      if (Array.isArray(item)) {
        for (const each of item) walk(each);
        return;
      }
      if (typeof item !== 'object' || item === null) return;
      const object = item as Record<string, unknown>;
      if (Object.keys(object).length === 1 && (object['service'] === 'address' || object['service'] === 'scope')) {
        value ??= object['service'];
        return;
      }
      const instance = typeof object['new'] === 'string' || typeof object['from'] === 'string';
      for (const [key, inner] of Object.entries(object)) {
        if (instance && key === 'then' && Array.isArray(inner)) {
          for (const step of inner) {
            if (typeof step !== 'object' || step === null || Array.isArray(step)) continue;
            const { service, peer, ...rest } = step as Record<string, unknown>;
            if (service !== undefined) changes = true;
            if (peer !== undefined) peers = true;
            walk(rest);
          }
        } else walk(inner);
      }
    };
    for (const [key, item] of Object.entries(record)) if (key !== 'service') walk(item);
    const raw = record['service'];
    if (raw === undefined) {
      if (value !== undefined) report(`a case value {"service": "${value}"} stands in a case without service`);
      if (changes) report('a call of then changes the service, but the case has no service');
      if (peers) this.report('CK-95', path, `${where}: a call of then steps the peer, but the case has no service (GN-13q)`);
      return;
    }
    const object = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
    if (object === undefined || typeof object['id'] !== 'string' || Object.keys(object).some((key) => !['id', 'setup', 'peer', 'check'].includes(key))) {
      this.report('CK-95', path, `${where}: service of a case is {"id": "<service id>", "setup": <JSON>, "check": <JSON>} (GN-13j), not ${JSON.stringify(raw)}`);
      return;
    }
    const service: Service | undefined = (this.contract.services ?? []).find((s) => s.id === object['id']);
    if (service === undefined) {
      report(`the service ${String(object['id'])} is not one of services of the contract`);
      return;
    }
    if (service.state === undefined && (object['setup'] !== undefined || object['check'] !== undefined || changes)) {
      report(`the service ${service.id} has no state, so the case gives no setup, check or service of a call of then`);
    }
    // GN-13q: the peer is a process of the program of the state, and a call of then steps the peer of the case alone.
    if (service.state === undefined && object['peer'] !== undefined) this.report('CK-95', path, `${where}: the service ${service.id} has no state, so the case gives no peer (GN-13q)`);
    if (peers && object['peer'] === undefined) this.report('CK-95', path, `${where}: a call of then steps the peer, but the service ${service.id} of the case has no peer (GN-13q)`);
    if (this.targetsOf(memberId).includes('wasm') && (only === undefined || only.includes('wasm'))) {
      this.report('CK-95', path, `the row of ${memberId} holds the case ${String(record['id'])}, which runs against the service ${service.id}, for wasm, whose core has no socket; give the row an only without wasm (GN-13h, GN-13j)`);
    }
  }

  // B2.448 (GN-13bh): the category that the raises of a case writes is one of the six of E-1 and the category of its
  // kind, where the kind has one (errors.kinds, or the fixed category of E-1a); the generated test names the class of
  // that category, so another text left it with no class to name.
  // B2.449 (CK-22): the kind of the raises of a case is a kind that the call of the case can give: a kind of the
  // raises of its member; a kind of E-1a, which the binding raises itself; a kind of in_raises of a value alias that a
  // parameter holds, which the in function of the argument gives (U-7); for a case that makes its receiver from its
  // own keys and has neither faults nor after, a kind of the raises of a factory of the class (GN-13f); and for a case
  // that arms a fault injection point, a kind of the category internal (X-1).
  caseRaises(memberId: string, record: Record<string, unknown>, kind: string, category: unknown, arms: boolean, path: string): void {
    const found = this.members.get(memberId);
    if (found === undefined) return;
    const member = found.member;
    const where = `the case ${String(record['id'])} of ${member.id}`;
    if (category !== undefined) {
      const own = this.kindCategories().get(kind) ?? BINDING_KINDS[kind];
      if (typeof category !== 'string' || !(CATEGORIES as readonly string[]).includes(category)) {
        this.report('CK-22', path, `${where} raises the kind ${kind} with the category ${JSON.stringify(category)}, which is no category: a category is one of ${CATEGORIES.join(', ')} (CK-22, GN-13bh)`);
      } else if (own !== undefined && own !== category) {
        this.report('CK-22', path, `${where} raises the kind ${kind} with the category ${category}, but the kind ${kind} is of the category ${own} (CK-22, GN-13bh)`);
      }
    }
    // GN-7c: a row of a kind of a library takes its kinds from the row of that library.
    const kindsOfVariants = (variants: readonly string[], contract: Contract = this.contract): string[] => variants.flatMap((variant) => {
      const row = contract.errors.kinds.find((k) => k.variant === variant);
      if (row === undefined) return [];
      return kindsOf((row.library === undefined ? row : this.given(row.library)?.errors.kinds.find((k) => k.variant === innerVariant(row.variant))) ?? row);
    });
    if (kind in BINDING_KINDS || kindsOfVariants(member.raises ?? []).includes(kind)) return;
    // X-1: the match that maps the core error is one for every member, so a case of any member that arms a point
    // shows a kind of the category internal.
    if (arms && this.kindCategories().get(kind) === 'internal') return;
    // U-7: the in function of a value alias that an argument holds gives a kind of its in_raises.
    const aliasKinds = new Set<string>();
    const walk = (type: Type, seen: ReadonlySet<string>): void => {
      if (typeof type === 'string' || 'function' in type || 'passthrough' in type) return;
      if ('optional' in type) return walk(type.optional, seen);
      if ('list' in type) return walk(type.list, seen);
      if ('map' in type) return walk(type.map, seen);
      if ('keyed_map' in type) return walk(type.keyed_map, seen);
      if ('tuple' in type) return type.tuple.forEach((item) => walk(item, seen));
      const key = `${type.library ?? ''} ${type.unit}`;
      if (seen.has(key)) return;
      const owner = type.library === undefined ? this.contract : this.given(type.library);
      const unit = owner?.units.find((u) => u.id === type.unit);
      if (owner === undefined || unit === undefined) return;
      for (const each of kindsOfVariants(unit.in_raises ?? [], owner)) aliasKinds.add(each);
      const inner = new Set([...seen, key]);
      const fields = [...(unit.fields ?? []), ...(unit.cases ?? []).flatMap((c) => c.fields)];
      for (const field of fields) walk(type.library === undefined ? field.type : foreignType(field.type, type.library), inner);
    };
    // A type of a unit of another library names the units of that library.
    const foreignType = (type: Type, library: string): Type => {
      if (typeof type === 'string' || 'function' in type || 'passthrough' in type) return type;
      if ('optional' in type) return { optional: foreignType(type.optional, library) };
      if ('list' in type) return { list: foreignType(type.list, library) };
      if ('map' in type) return { map: foreignType(type.map, library) };
      if ('keyed_map' in type) return { keyed_map: foreignType(type.keyed_map, library), key: type.key };
      if ('tuple' in type) return { tuple: type.tuple.map((item) => foreignType(item, library)) };
      return { unit: type.unit, library: type.library ?? library };
    };
    // GN-13f: a member with a receiver whose case gives no receiver takes it from a factory of its class, by the keys
    // of the case, and the failure of the case is then that of the factory or of the call.
    const receives = (m: Member): boolean => m.kind !== 'constructor' && (m.core === undefined || (typeof m.core === 'object' && m.core.receiver !== undefined));
    const factories = receives(member) && record['receiver'] === undefined && !arms && record['after'] === undefined
      ? (found.unit.members ?? []).filter((m) => m.kind === 'constructor' || !receives(m))
      : [];
    for (const callable of [member, ...factories]) for (const parameter of callable.parameters ?? []) walk(parameter.type, new Set());
    if (aliasKinds.has(kind) || factories.some((m) => kindsOfVariants(m.raises ?? []).includes(kind))) return;
    this.report('CK-22', path, `${where} raises the kind ${kind}, which the call of the case does not give: it is no kind of the raises of ${member.id}, of E-1a, of in_raises of a value alias that a parameter holds, nor, for a case that makes its receiver from its keys, of the raises of a factory of ${found.unit.id} (CK-22, B2.449)`);
  }

  // G-5 (GN-6ae): raises "callback" of a case, and after, the calls that observe the receiver after the call.
  caseScope(memberId: string, record: Record<string, unknown>, path: string): void {
    const found = this.members.get(memberId);
    if (found === undefined) return;
    const report = (message: string): void => this.report('CK-22', path, `the case ${String(record['id'])} of ${memberId}: ${message} (G-5, GN-6ae)`);
    const raises = record['raises'];
    if (raises !== undefined && (typeof raises !== 'object' || raises === null || Array.isArray(raises))) {
      if (raises !== 'callback') report(`raises ${JSON.stringify(raises)}, which is neither {"kind": <kind>, ...} nor "callback"`);
      else if (!(found.member.parameters ?? []).some((p) => this.raisesException(record[convert(p.name, 'python', 'variable')]))) report('raises "callback", and no function fixture of its arguments raises "exception"');
    }
    // B2.433 (GN-13bd): a raises without a category takes the category of its kind from errors.kinds or E-1a, and a
    // kind of neither leaves its test with no class to name.
    if (typeof raises === 'object' && raises !== null && !Array.isArray(raises)) {
      const { kind, category } = raises as Record<string, unknown>;
      if (typeof kind === 'string' && category === undefined && !this.kindCategories().has(kind) && !(kind in BINDING_KINDS)) {
        this.report('CK-22', `${path}/raises`, `the case ${String(record['id'])} of ${memberId} raises the kind ${kind} without a category, which is no kind of errors.kinds nor of E-1a, so its test names no class (CK-22, GN-13bd)`);
      }
    }
    const after = record['after'];
    if (after === undefined) return;
    const method = typeof found.member.core === 'object' && found.member.core.receiver !== undefined;
    if (!Array.isArray(after)) return report('after is not a list of calls');
    // GN-13o: a call of after may be on an argument that a function fixture of the case names, kept after the function
    // returned, and may raise a kind in place of a result.
    const names = new Map<string, string>();
    // GN-13pa: or on a value that the case names under with.
    if (method) for (const [name, value] of this.caseWith(record)) if (value !== undefined) names.set(name, value.unit);
    for (const parameter of found.member.parameters ?? []) this.fixtureNames(parameter.type, record[convert(parameter.name, 'python', 'variable')], names);
    // B2.383: an argument of a call of after may be {"bound": <name>} of those names.
    this.boundScope.push(names);
    try {
    for (const [i, item] of after.entries()) {
      const call = typeof item === 'object' && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      for (const key of Object.keys(call)) if (!['call', 'args', 'result', 'on', 'raises'].includes(key)) report(`after ${i} has no key ${key}`);
      const on = call['on'];
      if (on === undefined && !method) {
        report(`${memberId} has no receiver, so after ${i} names on, an argument that a function fixture of the case names`);
        continue;
      }
      const unitId = on === undefined ? found.unit.id : typeof on === 'string' ? names.get(on) : undefined;
      if (unitId === undefined) {
        report(`after ${i} is on ${JSON.stringify(on)}, which no function fixture of the case and no with of the case names`);
        continue;
      }
      const called = this.methodCall(unitId, call, `after ${i}`, report);
      if (called === undefined) continue;
      this.stepCalled.add(called.id);
      if (Object.hasOwn(call, 'raises')) this.callRaises(called, call, `after ${i}`, report);
      else if (!Object.hasOwn(call, 'result')) report(`after ${i} names no result`);
      // B2.374: a member without a result states the result null, which each language tests as no value.
      else if (this.statesNoResult(called, call, 'result')) report(`after ${i} calls ${called.id}, which has no result, so its result is null`);
    }
    } finally {
      this.boundScope.pop();
    }
  }

  // G-5: a callback fixture of the callback interface `unit`.
  // GN-7a: the kind of a raise of a fixture is one of the kinds of its error unit, the kinds of the rows whose class it
  // is, which the constructor of the unit takes.
  unitKind(error: string, kind: unknown, at: string, report: (message: string) => void): void {
    const kinds = this.contract.errors.kinds.filter((row) => row.class === error).flatMap((row) => {
      const owner = row.library === undefined ? row : this.given(row.library)?.errors.kinds.find((k) => k.variant === innerVariant(row.variant));
      return kindsOf(owner ?? row);
    });
    if (!kinds.includes(String(kind))) report(`${at} raises ${error} with the kind ${JSON.stringify(kind)}, which is no kind of ${error} (GN-7a)`);
  }

  // B2.489 (GN-6s): whether a type holds a callback unit of another library, at any depth of this contract's records.
  holdsForeignCallback(type: Type, seen: ReadonlySet<string> = new Set()): boolean {
    if (typeof type === 'string') return false;
    if ('optional' in type) return this.holdsForeignCallback(type.optional, seen);
    if ('list' in type) return this.holdsForeignCallback(type.list, seen);
    if (!('unit' in type)) return false;
    if (type.library !== undefined) return this.given(type.library)?.units.find((u) => u.id === type.unit)?.origin === 'callback';
    if (seen.has(type.unit)) return false;
    const unit = this.units.get(type.unit)?.value;
    return unit?.kind === 'record' && (unit.fields ?? []).some((f) => this.holdsForeignCallback(f.type, new Set([...seen, type.unit])));
  }

  // B2.489 (CK-22, CK-106): the raise rows of a callback fixture of a unit of another library at a place of the type.
  // A row raises {"error", "kind"} of a unit that the member recognizes, judged by the owner's binding, or the kind of
  // the owner with values, {"library", "kind", "message", "status", "errno", "properties"}, judged here.
  foreignValue(type: Type, value: unknown, what: string, report: (message: string) => void): void {
    if (typeof type === 'string') return;
    if ('optional' in type) {
      if (value !== null) this.foreignValue(type.optional, value, what, report);
      return;
    }
    if ('list' in type) {
      if (Array.isArray(value)) for (const [k, item] of value.entries()) this.foreignValue(type.list, item, `${what}[${k}]`, report);
      return;
    }
    if (!('unit' in type)) return;
    const fields = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
    if (fields === undefined) return;
    if (type.library === undefined) {
      const unit = this.units.get(type.unit)?.value;
      if (unit?.kind !== 'record') return;
      for (const field of unit.fields ?? []) {
        const key = convert(field.name, 'python', 'variable');
        if (Object.hasOwn(fields, key) && this.holdsForeignCallback(field.type)) this.foreignValue(field.type, fields[key], `${what}.${key}`, report);
      }
      return;
    }
    const owner = this.given(type.library);
    const rows = fields['callback'];
    if (owner === undefined || typeof rows !== 'object' || rows === null || Array.isArray(rows)) return;
    for (const [member, list] of Object.entries(rows as Record<string, unknown>)) {
      for (const [r, item] of (Array.isArray(list) ? list : []).entries()) {
        const raise = typeof item === 'object' && item !== null ? (item as Record<string, unknown>)['raise'] : undefined;
        if (typeof raise === 'object' && raise !== null && Object.hasOwn(raise, 'library')) this.valuedRaise(type.library, owner, raise as Record<string, unknown>, `${what}: row ${r} of ${member}`, report);
      }
    }
  }

  // B2.489 (CK-22): a raise of a fixture of a callback unit of library L with values: the library is L, the kind is a
  // kind of a row of L, the message a text, status and errno integers, and properties the properties of L's class of
  // the kind.
  valuedRaise(library: string, owner: Contract, raise: Record<string, unknown>, at: string, report: (message: string) => void): void {
    for (const key of Object.keys(raise)) if (!['library', 'kind', 'message', 'status', 'errno', 'properties'].includes(key)) report(`${at} raises with the key ${key}, which a raise with values has not`);
    if (raise['library'] !== library) return report(`${at} raises an error of ${JSON.stringify(raise['library'])}, but its callback unit is of ${library} (GN-6s)`);
    const row = owner.errors.kinds.find((k) => kindsOf(k).includes(String(raise['kind'])));
    if (row === undefined) return report(`${at} raises the kind ${JSON.stringify(raise['kind'])}, which is no kind of ${library}`);
    if (typeof raise['message'] !== 'string') report(`${at} raises ${String(raise['kind'])} without a message text`);
    for (const key of ['status', 'errno']) {
      if (Object.hasOwn(raise, key) && !Number.isSafeInteger(raise[key])) report(`${at} raises ${String(raise['kind'])} with the ${key} ${JSON.stringify(raise[key])}, which is no integer`);
    }
    const given = raise['properties'];
    if (given === undefined) return;
    if (typeof given !== 'object' || given === null || Array.isArray(given)) return report(`${at} raises ${String(raise['kind'])} with properties that are no object`);
    // GN-7a: the properties of the class of the kind, its error unit and its parents.
    const names = new Set<string>();
    for (let unit = owner.units.find((u) => u.id === row.class && u.kind === 'error'); unit !== undefined; unit = owner.units.find((u) => u.id === unit?.parent && u.kind === 'error')) {
      for (const m of unit.members ?? []) if (m.kind === 'property') names.add(convert(m.name, 'python', 'variable'));
    }
    for (const key of Object.keys(given)) if (!names.has(key)) report(`${at} raises ${String(raise['kind'])} with the property ${key}, which the class of ${library} for that kind does not have`);
  }

  callbackValue(unit: Unit, value: unknown, what: string, report: (message: string) => void): void {
    const snake = (name: Name): string => convert(name, 'python', 'variable');
    const members = new Map((unit.members ?? []).map((m) => [m.id, m]));
    const fixture = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
    const rows = fixture?.['callback'];
    if (fixture === undefined || typeof rows !== 'object' || rows === null || Array.isArray(rows)) {
      report(`${what} is not {"callback": {<member of ${unit.id}>: [<row>]}}`);
      return;
    }
    for (const key of Object.keys(fixture)) if (key !== 'callback' && key !== 'calls') report(`a callback value has no key ${key}`);
    const args = (owner: string, given: unknown, at: string): void => {
      const found = members.get(owner);
      if (found === undefined) return report(`${owner} is no member of ${unit.id}`);
      if ((found.parameters ?? []).some((p) => this.nativeArgument(p.type))) return report(`${owner} takes an object of the language, which a row cannot give`);
      callArgs(at, given, found.parameters ?? [], owner, 'received', report);
    };
    for (const [owner, list] of Object.entries(rows as Record<string, unknown>)) {
      if (!Array.isArray(list)) {
        report(`the rows of ${owner} are not a list`);
        continue;
      }
      for (const [r, item] of list.entries()) {
        const row = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
        const at = `row ${r} of ${owner}`;
        args(owner, row['args'], at);
        for (const key of Object.keys(row)) if (!['args', 'result', 'raise', 'once', 'async'].includes(key)) report(`${at} has no key ${key}`);
        if (row['result'] !== undefined && row['raise'] !== undefined) report(`${at} has a result and a raise`);
        const found = members.get(owner);
        if (found !== undefined && this.statesNoResult(found, row, 'result')) report(`${at} is of ${owner}, which has no result, so its result is null, not ${JSON.stringify(row['result'])} (GN-13e)`);
        if (row['async'] === true && found?.async_allowed !== true) report(`${at} is async, which ${owner} does not allow`);
        const raise = row['raise'];
        if (typeof raise === 'object' && raise !== null && Object.hasOwn(raise, 'library')) {
          report(`${at} raises an error of ${JSON.stringify((raise as Record<string, unknown>)['library'])} with values, which only a fixture of a callback unit of that library does (B2.489)`);
        } else if (raise !== undefined && raise !== 'exception') {
          const error = typeof raise === 'object' && raise !== null ? (raise as Record<string, unknown>)['error'] : undefined;
          const recognized = (found?.errors?.recognize ?? []).some((ref) => ref.library === undefined && ref.unit === error);
          if (!recognized) report(`${at} raises ${String(error)}, which ${owner} does not recognize (U-3)`);
          else this.unitKind(String(error), (raise as Record<string, unknown>)['kind'], at, report);
        }
      }
    }
    const calls = fixture['calls'];
    if (calls !== undefined && !Array.isArray(calls)) report('calls is not a list');
    for (const [c, item] of (Array.isArray(calls) ? calls : []).entries()) {
      const call = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
      args(String(call['member']), call['args'], `call ${c}`);
    }
  }

  // Whether a row of a fixture cannot give a value of the type: an object of the language (a class instance, a
  // callback, a function or a host value).
  nativeArgument(type: Type): boolean {
    if (typeof type === 'string') return type === 'host_value';
    if ('function' in type || 'passthrough' in type) return true;
    if ('optional' in type) return this.nativeArgument(type.optional);
    if ('list' in type) return this.nativeArgument(type.list);
    if ('map' in type) return this.nativeArgument(type.map);
    if ('keyed_map' in type) return this.nativeArgument(type.keyed_map);
    if ('tuple' in type) return type.tuple.some((part) => this.nativeArgument(part));
    if ('unit' in type && type.library === undefined) {
      const unit = this.units.get(type.unit)?.value;
      return unit?.kind === 'class' || unit?.origin === 'callback';
    }
    return false;
  }

  takesCode(type: Type, seen: ReadonlySet<string> = new Set()): boolean {
    if (typeof type === 'string') return false;
    if ('function' in type) return true;
    if ('optional' in type) return this.takesCode(type.optional, seen);
    if ('list' in type) return this.takesCode(type.list, seen);
    if ('unit' in type && type.library === undefined && !seen.has(type.unit)) {
      const unit = this.units.get(type.unit)?.value;
      if (unit?.origin === 'callback') return true;
      // CK-77: a value of a generated interface is an instance value, judged as a value of language code is.
      if (unit?.kind === 'interface' && unit.origin === 'generated') return true;
      if (unit?.kind === 'record') return (unit.fields ?? []).some((f) => this.takesCode(f.type, new Set([...seen, type.unit])));
    }
    return false;
  }

  // ---- CK-8: the kinds of a value alias's in function (U-7, E-5) ----

  aliasRaises(): void {
    const own = new Set(this.contract.errors.kinds.filter((row) => row.library === undefined).map((row) => row.variant));
    for (const { value: unit, path } of this.units.values()) {
      if (unit.in_raises === undefined) continue;
      if (unit.kind !== 'alias' || typeof unit.core !== 'object') {
        this.report('CK-8', `${path}/in_raises`, `only a value alias with core: {in, out} has in_raises (U-7)`);
        continue;
      }
      for (const [r, variant] of unit.in_raises.entries()) {
        if (!own.has(variant)) this.report('CK-8', `${path}/in_raises/${r}`, `${variant} is not a variant of errors.kinds of this contract (U-7, E-1)`);
      }
    }
  }

  // ---- CK-21: the build of the core and exclusive members (I-1, U-6) ----

  coreBuild(): void {
    // E-1c: a core that returns no Result has no variant to return and no place for the failure of a callback.
    // E-1c, GN-6h: the error is a Failure only where language code can fail: a parameter that holds a callback or a
    // function, or a receiver that keeps language code.
    // GN-7: a parameter with keeps is kept for a later call, so it allows core.failure true and requires neither a Result
    // nor a Failure.
    const keeps = carriers(this.contract.units).classes;
    for (const { member, unit, path } of this.members.values()) {
      if (typeof member.core !== 'object') continue;
      const failure = member.core.failure;
      const takes = (member.parameters ?? []).some((p) => this.takesCode(p.type));
      const calls = (member.parameters ?? []).some((p) => p.keeps !== true && this.takesCode(p.type));
      const receiver = member.core.receiver !== undefined && keeps.has(unit.id);
      if (failure === true && !receiver && !takes) this.report('CK-21', `${path}/core/failure`, `${member.id} reaches no language code, a callback or a function that it takes or that its receiver keeps, so its core error is no Failure (E-1c)`);
      if (failure === false && calls) this.report('CK-21', `${path}/core/failure`, `${member.id} takes a callback or a function, so its core error is a Failure (E-1c)`);
      if (failure === true && member.core.result === false) this.report('CK-21', `${path}/core/failure`, `${member.id} has core.failure, so its core returns a Result (E-1c)`);
    }
    for (const { member, path } of this.members.values()) {
      if (typeof member.core !== 'object' || member.core.result !== false) continue;
      if ((member.raises ?? []).length > 0) this.report('CK-21', `${path}/core/result`, `${member.id} has raises, so its core returns a Result (E-1c)`);
      if ((member.parameters ?? []).some((p) => p.keeps !== true && this.takesCode(p.type))) {
        this.report('CK-21', `${path}/core/result`, `${member.id} takes a callback or a function, so its core returns a Result (E-1c)`);
      }
    }
    for (const lang of Object.keys(this.contract.core.features ?? {}) as Lang[]) {
      if (!this.contract.targets.includes(lang)) this.report('CK-21', `/core/features/${lang}`, `${lang} is not a target (I-1)`);
    }
    // GN-4b: the WASM core builds without the features of platform I/O, which a browser does not have.
    for (const [i, feature] of (this.contract.core.features?.wasm ?? []).entries()) {
      if (PLATFORM_FEATURES.includes(feature)) this.report('CK-63', `/core/features/wasm/${i}`, `wasm builds the core with ${feature}, a feature of platform I/O, which WebAssembly in a browser does not have (GN-4b)`);
    }
    for (const { member, unit, path } of this.members.values()) {
      if (member.exclusive === undefined) continue;
      const receiver = typeof member.core === 'object' ? member.core.receiver : undefined;
      if (unit.kind !== 'class' || unit.origin !== 'generated' || receiver !== '&self') {
        this.report('CK-21', `${path}/exclusive`, `only a member with the receiver &self of a generated class is exclusive (U-6)`);
      }
    }
    // CK-67, GN-6h: only an instance of a class is a place whose borrow the core takes, and every such place names it.
    for (const { member, unit: owner, path } of this.members.values()) {
      for (const [i, parameter] of (member.parameters ?? []).entries()) {
        const type = typeof parameter.type === 'object' && 'optional' in parameter.type ? parameter.type.optional : parameter.type;
        const unit = typeof type === 'object' && 'unit' in type && type.library === undefined ? this.unit(type.unit) : undefined;
        const place = unit?.kind === 'class' && unit.origin === 'generated' && owner.origin !== 'callback';
        const at = `${path}/parameters/${i}/core`;
        if (parameter.core !== undefined && !place) this.report('CK-67', at, `${member.id}.${parameter.name.join('_')} is no class or optional of a class, so the core takes no borrow of it (GN-6h)`);
        if (parameter.core === undefined && place) this.report('CK-67', at, `${member.id}.${parameter.name.join('_')} is a class parameter, which names the borrow that the core takes in core (GN-6h)`);
      }
    }
    // CK-68, GN-6ab: a member with async_driver that reaches language code drives a state machine of its core, and
    // binding reads no Rust source to tell a machine from a future.
    const carrying = carriers(this.contract.units);
    for (const { member, unit, path } of this.members.values()) {
      const reaches = (member.parameters ?? []).some((p) => carrying.carries(p.type)) || (member.kind === 'method' && carrying.classes.has(unit.id));
      const needs = member.wait === 'async_driver' && reaches;
      const machine = typeof member.core === 'object' && member.core.machine === true;
      if (needs && !machine) this.report('CK-68', `${path}/core`, `${member.id} waits with async_driver and reaches language code, so its core path gives a state machine, which core names by machine: true (GN-6ab)`);
      if (machine && !needs) this.report('CK-68', `${path}/core/machine`, `${member.id} is no member with async_driver that reaches language code, so its core path gives no state machine (GN-6ab)`);
      // CK-69, GN-6ae: the core of a method with machine takes a clone of the value of the instance.
      const receiver = typeof member.core === 'object' ? member.core.receiver : undefined;
      if (machine && needs && member.kind === 'method' && receiver !== '&self') this.report('CK-69', `${path}/core/receiver`, `${member.id} has a state machine, which takes a clone of the value of its instance, so its receiver is &self (GN-6ae)`);
    }
  }

  // ---- CK-77: generated interfaces (generator GN-6ap) ----

  generatedInterfaces(): void {
    const names = (type: unknown, id: string): boolean => {
      if (Array.isArray(type)) return type.some((part) => names(part, id));
      if (typeof type !== 'object' || type === null) return false;
      const record = type as Record<string, unknown>;
      if (record['unit'] === id && record['library'] === undefined) return true;
      return Object.values(record).some((part) => names(part, id));
    };
    for (const { value: unit, path } of this.units.values()) {
      if (unit.kind !== 'interface' || unit.origin !== 'generated') continue;
      if (unit.core_type === undefined) this.report('CK-77', path, `the generated interface ${unit.id} names in core_type the type that the core takes (GN-6ap)`);
      if (unit.core !== undefined) this.report('CK-77', `${path}/core`, `the generated interface ${unit.id} declares no core, because the core does not call it (GN-6ap)`);
      let implemented = false;
      for (const { value: other, path: at } of this.units.values()) {
        const index = (other.implements ?? []).findIndex((ref) => ref.library === undefined && ref.unit === unit.id);
        if (index < 0) continue;
        implemented = true;
        if (other.kind !== 'class' || other.origin !== 'generated' || other.core_type === undefined) {
          this.report('CK-77', `${at}/implements/${index}`, `${other.id} implements the generated interface ${unit.id}, so it is a generated class with a core_type (GN-6ap)`);
        }
      }
      if (!implemented) this.report('CK-77', path, `no class of this contract implements the generated interface ${unit.id} (GN-6ap)`);
      const only = `the binding converts an instance to ${unit.core_type ?? 'the core type'} only as it enters a call (GN-6ap)`;
      for (const { member, unit: owner, path: at } of this.members.values()) {
        for (const [i, parameter] of (member.parameters ?? []).entries()) {
          const inner = typeof parameter.type === 'object' && 'optional' in parameter.type ? parameter.type.optional : parameter.type;
          const direct = typeof inner === 'object' && 'unit' in inner && inner.library === undefined && inner.unit === unit.id;
          if (direct && owner.origin === 'callback') this.report('CK-77', `${at}/parameters/${i}/type`, `a member of a callback interface names the generated interface ${unit.id}; ${only}`);
          else if (!direct && names(parameter.type, unit.id)) this.report('CK-77', `${at}/parameters/${i}/type`, `${member.id}.${parameter.name.join('_')} names the generated interface ${unit.id} inside another type; ${only}`);
        }
        for (const key of ['returns', 'type', 'yields'] as const) {
          if (names(member[key], unit.id)) this.report('CK-77', `${at}/${key}`, `${member.id} names the generated interface ${unit.id} in its ${key}; ${only}`);
        }
      }
      for (const { value: other, path: at } of this.units.values()) {
        for (const located of this.unitFieldTypes(other, at)) {
          if (names(located.value, unit.id)) this.report('CK-77', located.path, `a field of ${other.id} names the generated interface ${unit.id}; ${only}`);
        }
      }
    }
  }

  // ---- CK-17: callbacks (U-3, T-3) ----

  // CK-98: whether a literal is a value of a type: a bool, an integer, a number, a text, the value of a variant of an
  // enum, or null or a value of the inner type of an optional. A literal of no other type exists.
  private literalOf(type: Type, value: unknown): boolean {
    if (type === 'bool') return typeof value === 'boolean';
    if (type === 'int' || type === 'int64') return Number.isInteger(value);
    if (type === 'uint') return Number.isInteger(value) && (value as number) >= 0;
    if (type === 'float') return typeof value === 'number';
    if (type === 'text' || type === 'latin1') return typeof value === 'string';
    if (typeof type !== 'object') return false;
    if ('optional' in type) return value === null || this.literalOf(type.optional, value);
    if ('unit' in type && (type.library === undefined || type.library === this.contract.library)) {
      const unit = this.unit(type.unit);
      return unit?.kind === 'enum' && (unit.variants ?? []).some((v) => v.value === value);
    }
    return false;
  }

  callbacks(): void {
    for (const { member, unit, path } of this.members.values()) {
      const callback = unit.origin === 'callback';
      if (callback && typeof unit.core !== 'string') this.report('CK-17', path, `the callback ${unit.id} names its core trait in core (U-3)`);
      if (!callback && member.async_allowed !== undefined) this.report('CK-17', `${path}/async_allowed`, 'only a callback member has async_allowed (U-3)');
      if (!callback && member.errors !== undefined) this.report('CK-17', `${path}/errors`, 'only a callback member has errors (U-3)');
      if (callback && member.async_allowed === undefined) this.report('CK-17', path, `the callback member ${member.id} does not state async_allowed (U-3)`);
      // U-3: the generated struct implements the core trait, whose receiver binding cannot read from Rust source.
      const receiver = typeof member.core === 'object' ? member.core.receiver : undefined;
      if (callback && receiver !== '&self' && receiver !== '&mut self') {
        this.report('CK-17', path, `the callback member ${member.id} does not name its trait method and receiver in core: {path, receiver: "&self" | "&mut self"} (U-3)`);
      }
      // CK-98, GN-6d: a default of a member is the value that a callback member gives when the host object leaves it out.
      if (member.default !== undefined) {
        if (!callback) this.report('CK-98', `${path}/default`, `only a member of a callback interface has a default; ${member.id} is a member of ${unit.id} (U-3, GN-6d)`);
        else if (!this.literalOf(member.returns ?? 'none', member.default.literal)) {
          this.report('CK-98', `${path}/default`, `the default ${JSON.stringify(member.default.literal)} of ${member.id} is no value of its return type ${JSON.stringify(member.returns ?? 'none')} (U-3, GN-6d)`);
        }
      }
      // CK-98, B2.409: the core passes every argument to a callback, so a parameter of a callback member has no default.
      if (callback) {
        for (const [p, parameter] of (member.parameters ?? []).entries()) {
          if (parameter.default === undefined) continue;
          this.report('CK-98', `${path}${pointer('parameters', p)}/default`, `the parameter ${parameter.name.join('_')} of the callback member ${member.id} of ${unit.id} has a default; the core passes every argument to a callback (U-3, CK-101)`);
        }
      }
      for (const [i, ref] of (member.errors?.recognize ?? []).entries()) {
        const refPath = `${path}/errors/recognize/${i}`;
        if (ref.library === undefined || ref.library === this.contract.library) {
          if (this.unit(ref.unit)?.kind !== 'error') this.report('CK-17', refPath, `${ref.unit} is not an error unit`);
          // GN-6d: the core error of a recognized kind is made by the function that the contract names.
          else if (this.contract.errors.recognized === undefined) this.report('CK-17', refPath, `${member.id} recognizes ${ref.unit}, but errors.recognized names no function that makes the core error of its kind (GN-6d)`);
        } else {
          const dependency = this.dependency(ref.library, refPath, 'CK-17');
          if (dependency !== null && dependency.units.find((u) => u.id === ref.unit)?.kind !== 'error') {
            this.report('CK-17', refPath, `${ref.library} has no error unit ${ref.unit}`);
          }
        }
      }
    }
    // T-2: a function type has the attributes of a callback member (U-3).
    for (const { value, path } of this.allTypes()) {
      for (const type of Checker.walk(value)) {
        if (typeof type !== 'object' || !('function' in type)) continue;
        if (type.function.async_allowed === undefined) this.report('CK-17', path, 'a function type does not state async_allowed (T-2, U-3)');
        for (const ref of type.function.errors?.recognize ?? []) {
          if (ref.library === undefined || ref.library === this.contract.library) {
            if (this.unit(ref.unit)?.kind !== 'error') this.report('CK-17', path, `${ref.unit} is not an error unit`);
          } else {
            const dependency = this.dependency(ref.library, path, 'CK-17');
            if (dependency !== null && dependency.units.find((u) => u.id === ref.unit)?.kind !== 'error') {
              this.report('CK-17', path, `${ref.library} has no error unit ${ref.unit}`);
            }
          }
        }
      }
    }
    // T-3: a generated class that implements a callback of this contract with a member that waits makes the callback
    // member async_allowed, because that implementation returns a Promise or an awaitable.
    for (const { value: unit } of this.units.values()) {
      if (unit.origin !== 'generated') continue;
      for (const ref of unit.implements ?? []) {
        if (ref.library !== undefined && ref.library !== this.contract.library) continue;
        const callback = this.units.get(ref.unit);
        if (callback?.value.origin !== 'callback') continue;
        for (const member of unit.members ?? []) {
          if (member.wait === undefined || member.wait === 'none') continue;
          const index = (callback.value.members ?? []).findIndex((m) => sameName(m.name, member.name));
          const declared = callback.value.members?.[index];
          if (declared !== undefined && declared.async_allowed !== true) {
            this.report('CK-17', `${callback.path}${pointer('members', index)}`, `${unit.id} implements ${declared.id} with wait ${member.wait}, so ${declared.id} is async_allowed (T-3)`);
          }
        }
      }
    }
  }
}

// L-1, P-1: the repository and the component of a contract. A core at packages/<component>/rust is the library
// <repository>-<component>; a core at packages/rust is the library of the whole repository.
export function libraryParts(contract: Contract): { repository: string; component?: string } {
  const match = /^packages\/([a-z0-9][a-z0-9-]*)\/rust$/.exec(contract.core.path);
  const component = match?.[1];
  if (component === undefined || !contract.library.endsWith(`-${component}`)) return { repository: contract.library };
  return { repository: contract.library.slice(0, -component.length - 1), component };
}

// G-5, CK-101: the args `given` of a call of `owner` at `at`, judged by one rule for every form, or undefined when they
// are no object. A call that the test makes (`call`) gives only parameters and every parameter without a default; the
// arguments that the core passes (`received`) are every parameter. In both, args that are left out are {}.
function callArgs(at: string, given: unknown, parameters: readonly Parameter[], owner: string, form: 'call' | 'received', report: (message: string) => void): Record<string, unknown> | undefined {
  const args = given === undefined ? {} : typeof given === 'object' && given !== null && !Array.isArray(given) ? (given as Record<string, unknown>) : undefined;
  if (args === undefined) {
    report(`the args of ${at} are not an object of the parameters of ${owner}`);
    return undefined;
  }
  const names = parameters.map((p) => convert(p.name, 'python', 'variable'));
  for (const key of Object.keys(args)) if (!names.includes(key)) report(`the args of ${at} have no parameter ${key} of ${owner}`);
  for (const [i, parameter] of parameters.entries()) {
    const key = names[i] as string;
    if ((form === 'received' || parameter.default === undefined) && !Object.hasOwn(args, key)) report(`the args of ${at} give no ${key} of ${owner}`);
  }
  return args;
}
