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
  type Member,
  type Name,
  type Parameter,
  type Type,
  type Unit,
} from './contract.ts';
import { convert, sameName, type Role } from './names.ts';
import { BUILTIN_FORMS, MADE_TYPE, PREDICATE_KIND, builtinTypes } from './values.ts';

export interface Finding {
  check: string;
  path: string;
  message: string;
}

export interface CheckOptions {
  // The contracts of the libraries that this contract names, by library name (T-3, E-1b). bindgen reads them from the
  // packages that Cargo resolved; the check takes them as values.
  dependencies?: ReadonlyMap<string, unknown>;
}

const schema: unknown = JSON.parse(
  readFileSync(new URL('../../../schema/interface.schema.json', import.meta.url), 'utf8'),
);
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const validate = ajv.compile(schema as object);

// E-1a: the kinds of bindgen_core::BindingError and their fixed categories.
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

const escape = (segment: string | number): string => String(segment).replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...segments: (string | number)[]): string => segments.map((s) => `/${escape(s)}`).join('');

// CK-2: the markers that `bindgen import` leaves (M-2).
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

export function checkContract(raw: unknown, options: CheckOptions = {}): Finding[] {
  const todos: string[] = [];
  findTodos(raw, '', todos);
  const findings: Finding[] = todos.map((path) => ({
    check: 'CK-2',
    path,
    message: 'a todo of bindgen import is left; the contract is a draft (M-2)',
  }));
  if (validate(raw) !== true) findings.push(...schemaFindings(validate.errors ?? [], todos));
  if (findings.length > 0) return findings;
  return new Checker(raw as Contract, options).run();
}

interface Located<T> {
  value: T;
  path: string;
}

class Checker {
  readonly contract: Contract;
  readonly dependencies: ReadonlyMap<string, unknown>;
  readonly findings: Finding[] = [];
  readonly units = new Map<string, Located<Unit>>();
  readonly members = new Map<string, { member: Member; unit: Unit; path: string }>();
  readonly dependencyContracts = new Map<string, Contract | null>();

  constructor(contract: Contract, options: CheckOptions) {
    this.contract = contract;
    this.dependencies = options.dependencies ?? new Map();
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
    this.otherRepositories();
    this.errors();
    this.wrappedErrors();
    this.records();
    this.goNames();
    this.modules();
    this.wasmOnly();
    this.awaitableNames();
    this.callbacks();
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
      if (!this.members.has(kase.member)) this.report('CK-3', `/cases/${i}/member`, `${kase.member} is not a member`);
    }
    for (const [i, change] of this.contract.changes.entries()) {
      for (const lang of Object.keys(change.from)) langOk(lang, `/changes/${i}/from/${lang}`, 'a change');
      if (change.to !== null && !this.members.has(change.to) && !this.units.has(change.to)) {
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
    for (const { value: unit, path } of this.units.values()) {
      if (unit.origin === 'value') this.valueUnit(unit, path);
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

  valueUnit(unit: Unit, path: string): void {
    const targets = this.contract.targets;
    // in rows: (lang, language type) -> the kinds a value of that type is classified as
    const classified = new Map<string, { kinds: Set<string>; exact: boolean }>();
    for (const [r, row] of (unit.in ?? []).entries()) {
      const rowPath = `${path}${pointer('in', r)}`;
      const lang = (['php', 'python', 'node', 'go', 'wasm'] as const).find((l) => row[l] !== undefined);
      if (lang === undefined) continue;
      const type = row[lang] as string;
      if (!targets.includes(lang)) this.report('CK-8', `${rowPath}/${lang}`, `${lang} is not a target`);
      const typeUnit = this.unit(type);
      const isBuiltin = builtinTypes(lang).has(type);
      if (!isBuiltin && typeUnit?.origin !== 'value') {
        this.report('CK-8', `${rowPath}/${lang}`, `${type} is neither a built-in ${lang} type of bindgen nor a value unit`);
      }
      const key = `${lang}\u0000${type}`;
      if (classified.has(key)) this.report('CK-8', rowPath, `${lang} ${type} has two in rows`);
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
        if (row.cases.length !== 1) this.report('CK-8', `${rowPath}/cases`, 'a row without by has exactly one case');
        for (const [c, kase] of row.cases.entries()) {
          if (kase.is !== undefined) this.report('CK-8', `${rowPath}/cases/${c}/is`, 'a row without by has no is');
        }
      }
      for (const [c, kase] of row.cases.entries()) {
        if (isBuiltin && kase.read !== undefined) {
          this.report('CK-8', `${rowPath}/cases/${c}/read`, 'a built-in language type is read by bindgen, not by a member');
        }
        if (!isBuiltin && kase.read === undefined) {
          this.report('CK-8', `${rowPath}/cases/${c}`, 'a case of a value unit type names its read member');
        }
        if (kase.read !== undefined) this.publicMember(kase.read, `${rowPath}/cases/${c}/read`, 'read');
      }
      classified.set(key, { kinds: new Set(row.cases.map((c) => c.kind)), exact: row.by === undefined });
    }
    // out rows
    const byKind = new Map<string, Located<NonNullable<Unit['out']>[number]>[]>();
    for (const [r, row] of (unit.out ?? []).entries()) {
      const rowPath = `${path}${pointer('out', r)}`;
      byKind.set(row.kind, [...(byKind.get(row.kind) ?? []), { value: row, path: rowPath }]);
      if (row.when !== undefined && PREDICATE_KIND[row.when.predicate] !== row.kind) {
        this.report('CK-8', `${rowPath}/when`, `${row.when.predicate} applies to ${PREDICATE_KIND[row.when.predicate]}, not to ${row.kind}`);
      }
      for (const lang of targets) {
        if (row.make[lang] === undefined) this.report('CK-8', `${rowPath}/make`, `the row makes no ${lang} value`);
      }
      for (const [lang, make] of Object.entries(row.make) as [Lang, string][]) {
        const makePath = `${rowPath}/make/${lang}`;
        if (!targets.includes(lang)) {
          this.report('CK-8', makePath, `${lang} is not a target`);
          continue;
        }
        let made: string | undefined;
        if ((BUILTIN_FORMS as readonly string[]).includes(make)) {
          made = MADE_TYPE[lang][make];
          if (made === undefined) this.report('CK-8', makePath, `${lang} has no built-in ${make} value`);
        } else {
          const member = this.publicMember(make, makePath, 'make', ['constructor', 'static']);
          const owner = this.members.get(make)?.unit;
          if (member !== undefined && owner?.origin !== 'value') this.report('CK-8', makePath, `${make} is not a member of a value unit`);
          made = owner?.id;
        }
        if (made === undefined) continue;
        const into = classified.get(`${lang}\u0000${made}`);
        if (into === undefined) {
          this.report('CK-8', makePath, `no in row of ${lang} classifies ${made}, so the value does not come back (P-3)`);
        } else if (into.exact ? !(into.kinds.size === 1 && into.kinds.has(row.kind)) : !into.kinds.has(row.kind)) {
          this.report('CK-8', makePath, `${lang} ${made} comes back as ${[...into.kinds].join(' or ')}, not as ${row.kind} (P-3)`);
        }
      }
    }
    for (const [kind, rows] of byKind) {
      const first = rows[0];
      if (first === undefined) continue;
      if (rows.length === 1) {
        if (first.value.when !== undefined) this.report('CK-8', `${first.path}/when`, `the rows of ${kind} do not cover the case where ${first.value.when.predicate} is ${!first.value.when.is}`);
        continue;
      }
      const predicates = new Set(rows.map((r) => r.value.when?.predicate));
      const values = rows.map((r) => r.value.when?.is);
      if (predicates.size !== 1 || predicates.has(undefined) || rows.length !== 2 || values[0] === values[1]) {
        this.report('CK-8', first.path, `the ${rows.length} rows of ${kind} are not split by one predicate into its true and its false case`);
      }
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
    for (const type of inner) {
      for (const part of Checker.walk(type)) {
        if (typeof part !== 'object' || !('unit' in part)) continue;
        if (part.library !== undefined && part.library !== library) {
          this.report('CK-9', path, `${library} ${id} uses ${part.library} ${part.unit}; it may use only units of ${library} (T-3)`);
        } else {
          this.foreignUnit(library, part.unit, path, seen);
        }
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
      if (row.library !== undefined) {
        const dependency = this.dependency(row.library, `${path}/library`, 'CK-10');
        const own = dependency?.errors.kinds.find((k) => k.variant === row.variant);
        if (dependency !== null && own === undefined) this.report('CK-10', `${path}/variant`, `${row.library} declares no kind ${row.variant}`);
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
    const libraries = new Set(this.contract.errors.kinds.flatMap((k) => (k.library === undefined ? [] : [k.library])));
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
    }
  }

  // ---- CK-14: module paths (L-1) ----

  modules(): void {
    for (const { value: unit, path } of this.units.values()) {
      const first = unit.module.split('/')[0];
      if (first === 'host' || first === 'tests') {
        this.report('CK-14', `${path}/module`, `the module ${unit.module} starts with ${first}, a folder of hand-written Go code (L-1)`);
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
      }
    }
  }

  // ---- CK-17: callbacks (U-3, T-3) ----

  callbacks(): void {
    for (const { member, unit, path } of this.members.values()) {
      const callback = unit.origin === 'callback';
      if (!callback && member.async_allowed !== undefined) this.report('CK-17', `${path}/async_allowed`, 'only a callback member has async_allowed (U-3)');
      if (!callback && member.errors !== undefined) this.report('CK-17', `${path}/errors`, 'only a callback member has errors (U-3)');
      if (callback && member.async_allowed === undefined) this.report('CK-17', path, `the callback member ${member.id} does not state async_allowed (U-3)`);
      for (const [i, ref] of (member.errors?.recognize ?? []).entries()) {
        const refPath = `${path}/errors/recognize/${i}`;
        if (ref.library === undefined || ref.library === this.contract.library) {
          if (this.unit(ref.unit)?.kind !== 'error') this.report('CK-17', refPath, `${ref.unit} is not an error unit`);
        } else {
          const dependency = this.dependency(ref.library, refPath, 'CK-17');
          if (dependency !== null && dependency.units.find((u) => u.id === ref.unit)?.kind !== 'error') {
            this.report('CK-17', refPath, `${ref.library} has no error unit ${ref.unit}`);
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
