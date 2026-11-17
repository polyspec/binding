// The parts of the binding generators node, wasm, php and python that they write alike: each is written here once and
// takes what differs between the languages as its arguments (GN-14o).

import type { Lang, Type, Unit } from '../contract.ts';
import { functionGiven, givenRust, placeSubject } from './callback_arguments.ts';
import { type Cycle, type CycleHost, cycles, holdsCycle } from './cycles.ts';
import { declaredValue, defaultAsserts } from './defaults.ts';
import { aliasOf, awaits, categoryClass, implementorsOf, implementsClause, isInternal, memberName, type KeptClass, libraryOf, unitOf, takenCallbacks, conversionsOf, convertedClassBase, type ObjectClass, ownerErrorClasses, type CaseField, caseFields, caseRead, caseStruct, caseType, UNIT_CASE_ALLOW, type Variant, absentInits, type Arg, argType, type CallbackUnit, callStruct, type ErrorUnit, keepsAny, lentCallbacks, usesNative, machineFunction, ownerRecognizedUnits, borrowedItem, boxed, caseLeftOut, type Fn, keptModel, leftOut, rustField, keptFunctionType, langName, type Model, narrowed, narrows, recordFn, recordInit, recordLocal, rustType, traitParam, tupleIn, tupleOut, Unsupported } from './model.ts';
import { closure, jsString, optionRef, rustString } from './text.ts';

// T-1: the input conversion of a scalar, by the helper of its name in the crate; overrides gives the helpers of a
// language that differ, and undefined for a scalar that the language does not take.
export function scalarIn(type: string, value: string, subject: string, lang: string, lead = '', overrides: Readonly<Record<string, string | undefined>> = {}): string {
  const fn: Record<string, string | undefined> = { text: 'text_in', latin1: 'latin1_in', bool: 'bool_in', uint: 'uint_in', int: 'int_in', int64: 'int64_in', float: 'float_in', bytes: 'bytes_in', source: 'source_in', path: 'path_in', cancel: 'cancel_in', ...overrides };
  const name = fn[type];
  if (name === undefined) throw new Unsupported(`no ${lang} input conversion for ${type}`);
  return `${name}(${lead}${value}, ${subject})`;
}

// T-2: the output conversion of a scalar, by the helper of its name in the crate; none is the value of none in the
// language, and overrides gives the helpers of a language that differ, undefined for a scalar it does not give.
export function scalarOut(type: string, value: string, lang: string, none: string, lead = '', overrides: Readonly<Record<string, string | undefined>> = {}): string {
  // T-2 never: the core's Infallible has no value, so the call has failed before.
  if (type === 'never') return `match ${value} {}`;
  if (type === 'none') return none;
  const fn: Record<string, string | undefined> = { text: 'text_out', latin1: 'latin1_out', bool: 'bool_out', uint: 'uint_out', int: 'int_out', int64: 'int64_out', float: 'float_out', bytes: 'bytes_out', path: 'path_out', ...overrides };
  const name = fn[type];
  if (name === undefined) throw new Unsupported(`no ${lang} output conversion for ${type}`);
  return `${name}(${lead}${value})`;
}

// GN-6z: what the body of the Rust closure of a function reads: its result type, the names of its arguments, and the
// subject of the conversion of its result.
export interface FunctionParts {
  readonly result: string;
  readonly names: string[];
  readonly returns: string;
}

// GN-6z: a function holds the function of the language that entered as holder; the Rust closure takes the arguments
// of the core and runs body, which each language writes. lead is the argument of kept_function_in before the value.
export function keptFunctionIn(model: Model, type: FunctionType, value: string, subject: string, lead: string, holder: string, body: (parts: FunctionParts) => string): string {
  const names = type.parameters.map((_p, i) => `argument_${String(i)}`);
  const result = type.returns === 'none' ? '()' : rustType(model, type.returns);
  const params = type.parameters.map((p, i) => `${names[i] ?? ''}: ${traitParam(model, p)}`);
  const returns = subject.startsWith('"') ? `${subject.slice(0, -1)} returns"` : '"the function returns"';
  return `kept_function_in(${lead}${value}, ${subject}, ${givenRust(functionGiven(type))}).map(|${holder}| -> ${rustType(model, keptFunctionType(type))} {
            Box::new(move |${params.join(', ')}| -> Result<${result}, binding_core::Failure<${model.coreError ?? '()'}>> {
${body({ result, names, returns })}
            })
        })`;
}

// T-1: the type of a function of a contract.
export type FunctionType = { parameters: Type[]; returns: Type; async_allowed?: boolean };

// GN-6bt: the host of the walks of a cycle in a language whose value is lang alone, with no lifetime and no token,
// and which keeps a value of the language by own.
export const plainCycleHost = (lang: string, own: (place: string) => string): CycleHost => ({
  lang,
  made: lang,
  inValue: `&${lang}`,
  give: (owned) => `&${owned}`,
  own,
  result: (type) => `Result<${type}, Fail>`,
  internal: (detail) => `binding_error(BindingError::Internal { detail: String::from(${rustString(detail)}) })`,
  inGenerics: '',
  inParams: '',
  inArgs: '',
  outGenerics: '',
  outParams: '',
  outArgs: '',
});

// GN-6bt: the cycles of the records and variants whose conversions the crate holds.
export const resultCycles = (model: Model): Cycle[] => cycles(model, [...model.resultRecords, ...model.variants.map((v) => v.unit)]);

// T-4: what the conversions of a record in node and wasm differ by: the place of a member that a field is read from,
// the conversion in, the line that writes a field to the object, the line that makes the object and the end that
// gives it.
export interface RecordForm {
  readonly lang: 'node' | 'wasm';
  readonly place: (member: string) => string;
  readonly convert: (model: Model, type: Type, value: string, subject: string) => string;
  readonly write: (model: Model, field: NonNullable<Unit['fields']>[number]) => string;
  readonly object: string;
  readonly made: string;
}

// The bodies of the conversions of a record: in, or the walk of the places of units of its cycle (kids, GN-6bt), and
// out.
export function recordParts(model: Model, unit: Unit, mode: 'in' | 'kids', form: RecordForm): { ins: string; outs: string } {
  const writes = (unit.fields ?? []).map((f) => form.write(model, f));
  return {
    ins: recordIns(model, unit, mode === 'kids', form.lang, form.place, form.convert),
    outs: `    let value = value.borrow();\n    ${form.object}\n${writes.join('\n')}\n    ${form.made}`,
  };
}

// T-9: what the conversions of a variant in node and wasm differ by, besides those of a record: the line that sets a
// member of the object, the converted value of a field, and the text of the tag.
export interface VariantForm {
  readonly lang: 'node' | 'wasm';
  readonly place: (member: string) => string;
  readonly convert: (model: Model, type: Type, value: string, subject: string) => string;
  readonly set: (key: string, value: string) => string;
  readonly field: (model: Model, field: CaseField) => string;
  readonly text: (literal: string) => string;
  readonly object: string;
  readonly made: string;
}

// The bodies of the conversions of a variant: in, or the walk of the places of units of its cycle (kids, GN-6bt), and
// out.
export function variantParts(model: Model, variant: Variant, mode: 'in' | 'kids', form: VariantForm): { ins: string; outs: string } {
  const jsName = langName(form.lang, variant.unit.name, 'class');
  const tag = langName(form.lang, variant.unit.tag ?? [], 'variable');
  const kids = mode === 'kids';
  const insArms = variant.cases.map((kase) => {
    const fields = caseFields(model, variant, kase);
    const reads = fields.map((f) => {
      const member = langName(form.lang, f.field.name, 'variable');
      // GN-6v: a field that may be left out is null when its member is missing or undefined.
      const read = caseLeftOut(f.field) ? `default_in(${form.place(member)}, |value| ${form.convert(model, f.field.type, 'value', rustString(member))}).map(Option::flatten)` : form.convert(model, f.field.type, form.place(member), rustString(member));
      const held = kids && model.cycleWalk !== undefined && holdsCycle(model, model.cycleWalk, f.field.type);
      const variable = `${kids ? '_' : ''}${f.variable}`;
      return `            let ${variable}${held ? '' : `: ${caseType(model, f)}`} = ${held ? `${read}?` : caseRead(f, `${read}?`)};${f.boxed === undefined && narrows(f.field.type) && !kids ? `\n            ${narrowed(variable, rustString(member), 'binding_error')}` : ''}`;
    });
    const built = kids ? 'Ok(())' : `Ok(${caseStruct(variant, kase, fields)})`;
    return `        ${rustString(kase.value)} => ${reads.length === 0 ? `${built},` : `{\n${reads.join('\n')}\n            ${built}\n        }`}`;
  });
  const arms = variant.cases.map((kase) => {
    const fields = caseFields(model, variant, kase);
    const writes = [form.set(tag, form.text(rustString(kase.value))), ...fields.map((f) => form.set(langName(form.lang, f.field.name, 'variable'), form.field(model, f)))];
    return `${fields.length === 0 ? `        ${UNIT_CASE_ALLOW}\n` : ''}        ${caseStruct(variant, kase, fields)} => {\n${writes.join('\n')}\n        }`;
  });
  return {
    ins: `    let tag = text_in(${form.place(tag)}, ${rustString(tag)})?;
    match tag.as_str() {
${insArms.join('\n')}
        _ => Err(type_error(subject, ${rustString(jsName)})),
    }`,
    outs: `    ${form.object}
    match value.borrow() {
${arms.join('\n')}
    }
    ${form.made}`,
  };
}

// T-9: the conversions in and out of a variant, whose signatures in and out the language gives.
export function variantFns(lang: 'node' | 'wasm', variant: Variant, inParams: string, outSignature: string, parts: { ins: string; outs: string }): string {
  const jsName = langName(lang, variant.unit.name, 'class');
  return `
/// T-9: a value of the variant ${jsName} is an object whose member ${langName(lang, variant.unit.tag ?? [], 'variable')} is the text of one of its cases, with the fields of that case, judged as they enter (T-8).
fn in_${recordFn(variant.unit)}(${inParams}, subject: &str) -> Result<${variant.unit.core_type ?? ''}, Fail> {
${parts.ins}
}

/// T-9: a value of the variant ${jsName} leaves as the object of its case.
fn out_${recordFn(variant.unit)}${outSignature} {
${parts.outs}
}
`;
}

// T-4: the conversions in and out of a record, whose signatures in and out the language gives.
export const recordFns = (lang: 'node' | 'wasm', unit: Unit, inParams: string, outSignature: string, parts: { ins: string; outs: string }): string => `
/// T-4: a value of the record ${langName(lang, unit.name, 'class')} is an object with a member per field, judged as it enters (T-8).
fn in_${recordFn(unit)}(${inParams}, subject: &str) -> Result<${unit.core_type ?? ''}, Fail> {
${parts.ins}
}

fn out_${recordFn(unit)}${outSignature} {
${parts.outs}
}
`;

// T-4, GN-6bt: the conversion in of the fields of a record in node and wasm, or the walk of the places of units of its
// cycle (kids): each field is read from its member, which place gives as the argument of the conversion.
function recordIns(model: Model, unit: Unit, kids: boolean, lang: 'node' | 'wasm', place: (member: string) => string, convert: (model: Model, type: Type, value: string, subject: string) => string): string {
  const fields = unit.fields ?? [];
  const reads = fields.map((f) => {
    const member = langName(lang, f.name, 'variable');
    // GN-6a: a field that may be left out is null when its member is missing or undefined.
    const read = caseLeftOut(f) ? `default_in(${place(member)}, |value| ${convert(model, f.type, 'value', rustString(member))}).map(Option::flatten)` : convert(model, f.type, place(member), rustString(member));
    const local = `${kids ? '_' : ''}${recordLocal(f.name)}`;
    const held = kids && model.cycleWalk !== undefined && holdsCycle(model, model.cycleWalk, f.type);
    return `    let ${local}${held ? '' : `: ${rustType(model, f.type)}`} = ${read}?;${narrows(f.type) && !kids ? `\n    ${narrowed(local, rustString(member), 'binding_error')}` : ''}`;
  });
  return `${reads.join('\n')}\n    ${kids ? 'Ok(())' : `Ok(${unit.core_type ?? ''} { ${fields.map((f) => recordInit(f.name)).join(', ')}${absentInits(unit)} })`}`;
}

// U-2: the conversion in of an argument; one that may be left out is undefined when it is, and its variable an Option.
export type ArgIn = (arg: Arg | undefined, type: Type, raw: string, subject: string, typed: Model) => string;
export const argIn = (convert: (model: Model, type: Type, value: string, subject: string) => string): ArgIn => (arg, type, raw, subject, typed) =>
  arg?.default === undefined ? convert(typed, type, raw, subject) : leftOut(arg, `default_in(${raw}, ${closure(['value'], convert(typed, type, 'value', subject))})`);

// GN-6aa: the lines that read the fields of a record parameter in node and wasm, each from the member that raw gives,
// and make the record; the callbacks of the fields of a record parameter with keeps are held as Natives, and the
// record is 'static.
export function recordParamLines(model: Model, fn: Fn, parameter: Fn['params'][number], lang: 'node' | 'wasm', raw: (member: string) => string, converted: ArgIn): string[] {
  const record = fn.record;
  if (record === undefined) return [];
  const lines: string[] = [];
  const typed = (fn.member.parameters ?? []).some((p) => p.name === parameter.name && p.keeps === true) ? keptModel(model) : model;
  for (const field of record.unit.fields ?? []) {
    const name = langName(lang, field.name, 'variable');
    const arg = fn.args.find((a) => a.field && a.name === field.name);
    lines.push(`        let ${rustField(field.name)}: ${arg === undefined ? rustType(typed, field.type) : argType(typed, arg)} = ${boxed(typed, field.type, converted(arg, field.type, raw(name), placeSubject(lang, model, fn, field.type, name), typed))}?;`);
    if (narrows(field.type)) lines.push(`        ${narrowed(rustField(field.name), rustString(name), 'binding_error')}`);
  }
  lines.push(`        let ${rustField(parameter.name)}: ${rustType(typed, { unit: record.unit.id })} = ${record.unit.core_type ?? ''} { ${(record.unit.fields ?? []).map((f) => rustField(f.name)).join(', ')}${absentInits(record.unit)} };`);
  return lines;
}

// GN-6s: the index of the class of an error unit that a callback unit recognizes; an error unit of the owner of a
// callback unit of another repository is registered after the library classes.
export function recognizedClassIndex(model: Model, cb: CallbackUnit): (u: ErrorUnit) => number {
  const ownerUnits = ownerRecognizedUnits(model);
  return (u) => cb.library === undefined
    ? model.classes.length + model.errorUnits.indexOf(u)
    : model.classes.length + model.errorUnits.length + ownerUnits.findIndex((o) => o.library === cb.library && o.unit.id === u.unit.id);
}

// U-3: the signature of the Rust method of a member of a callback unit, which returns the failure of the core.
export function callbackSignature(model: Model, m: CallbackUnit['members'][number]): string {
  const params = m.params.map((p) => `, ${rustField(p.name)}: ${traitParam(model, p.type)}`).join('');
  return `fn ${rustField(m.member.name)}(${m.receiver}${params}) -> Result<${m.returns === 'none' ? '()' : rustType(model, m.returns)}, binding_core::Failure<${model.coreError ?? '()'}>>`;
}

// GN-6aa: the methods of a kept callback: reach gives the lines that make the borrowed callback struct of the call,
// with its mutability, and the method calls the member on it as the callback of a call does.
export function keptMethods(model: Model, cb: CallbackUnit, reach: (m: CallbackUnit['members'][number], mutable: string) => string): string {
  const struct = callStruct(model, cb);
  return cb.members.map((m) => {
    const passed = m.params.map((p) => rustField(p.name)).join(', ');
    const mutable = m.receiver === '&mut self' ? 'mut ' : '';
    return `
    ${callbackSignature(model, m)} {
${reach(m, mutable)}
        ${lentCallbacks(model).includes(cb) ? cb.unit.core ?? '' : struct}::${rustField(m.member.name)}(&${mutable}borrowed${passed === '' ? '' : `, ${passed}`})
    }`;
  }).join('\n');
}

// B2.489 (GN-7c): the members with a conversion table, and the failure of the core that their functions take.
export function convertingFns(model: Model): { fns: Fn[]; failure: string } {
  return { fns: [...model.functions, ...model.objects.flatMap((o) => o.members)].filter((fn) => conversionsOf(model, fn).length > 0), failure: `binding_core::Failure<${model.coreError ?? '()'}>` };
}

// B2.489 (GN-7c): the arms of the match of the kinds of a conversion in node and wasm: the class of the row, after the
// classes of the categories for an error unit, its kind, and the members of its forwarded properties.
export function convertedArms(model: Model, c: ReturnType<typeof conversionsOf>[number], lang: 'node' | 'wasm'): string[] {
  return c.rows.flatMap((row) => {
    const target = row.kind.unit === undefined ? model.classes.findIndex((k) => k.category === row.kind.category) : model.classes.length + model.errorUnits.indexOf(row.kind.unit);
    const properties = row.properties.map(({ property }) => rustString(langName(lang, property.member.name, 'variable')));
    return row.kinds.map((kind) => `            ${rustString(kind)} => Some((${target}, ${rustString(kind)}, &[${properties.join(', ')}])),`);
  });
}

// B2.489 (GN-7c): the lookup of each conversion of a member in node and wasm: lookup takes the range of the classes of
// the owner of the conversion and the arms of its kinds.
export const conversionLookups = (model: Model, fn: Fn, lang: 'node' | 'wasm', lookup: (range: string, arms: string[]) => string): string[] =>
  conversionsOf(model, fn).map((c) => {
    const base = convertedClassBase(model, c.library, lang);
    return lookup(`${base}..${base + ownerErrorClasses(c.owner, lang).length}`, convertedArms(model, c, lang));
  });

// B2.489 (GN-7c): the functions of the members with a conversion table in node and wasm, each written by table from
// its lookups and the failure of the core; undefined when no member converts.
export function convertedTables(model: Model, lang: 'node' | 'wasm', lookup: (range: string, arms: string[]) => string, table: (fn: Fn, lookups: string[], failure: string) => string): string | undefined {
  const { fns, failure } = convertingFns(model);
  if (fns.length === 0) return undefined;
  return fns.map((fn) => table(fn, conversionLookups(model, fn, lang, lookup), failure)).join('');
}

// GN-5, GN-6h: the arms of the poison entry point of the B-5c test, one for each class whose lock is written, with its
// class name in the language.
export const poisonArms = (model: Model, lang: Lang, arm: (object: ObjectClass, cls: string) => string): string[] =>
  model.objects.filter((o) => o.lock?.writes === true).map((o) => arm(o, langName(lang, o.unit.name, 'class')));

// E-2: the index of the class of a category in the classes of the crate, as the text of the crate.
export const categoryIndex = (model: Model): ((category: string) => string) => (category) => String(model.classes.findIndex((c) => c.category === category));

// The checks of the crate that each constant has the value of its contract, and the defaults of the contract.
export const constantAsserts = (model: Model): string => model.constants.map((c) => `const _: () = assert!(${c.member.core as string} == ${String(c.member.value)});`).join('\n') + defaultAsserts(model);

// T-4, T-9: the conversions of the enums, the result records and the variants of the crate, in that order.
export const resultUnits = (model: Model, enumRust: (unit: Unit) => string, recordRust: (model: Model, unit: Unit) => string, variantRust: (model: Model, variant: Variant) => string): string[] =>
  [...model.enums.map((u) => enumRust(u)), ...model.resultRecords.map((u) => recordRust(model, u)), ...model.variants.map((v) => variantRust(model, v))];

// U-3: whether a callback unit that the core takes recognizes an error unit.
export const recognizesAny = (model: Model): boolean => takenCallbacks(model).some((c) => c.members.some((m) => m.recognized !== undefined));

// U-3: the names of a callback unit in the crate: its Rust name, its struct and its class in the language. GN-6s: a
// callback unit of another repository is the trait of its core, whose methods return the failure of the core error of
// that repository.
export const callbackNames = (model: Model, cb: CallbackUnit, lang: Lang): { name: string; struct: string; label: string } =>
  ({ name: rustField(cb.unit.name), struct: callStruct(model, cb), label: langName(lang, cb.unit.name, 'class') });

// U-3: the impl block of the methods of a callback struct: of the trait of the core for a lent callback (GN-6w), of
// the struct otherwise; lifetime is the lifetime parameter of the struct, or ''.
export const callbackImpl = (model: Model, cb: CallbackUnit, struct: string, lifetime: string, methods: string): string =>
  `${lentCallbacks(model).includes(cb) ? `impl${lifetime} ${cb.unit.core ?? ''} for ${struct}${lifetime} {` : `impl${lifetime} ${struct}${lifetime} {`}${methods}
}`;

// U-3: the members of a callback unit that recognize error units, each with the function that reads an exception of it
// into the core error; doc is the first lines of the comment of that function, after which the language says what
// becomes of any other exception.
export const recognizing = (cb: CallbackUnit, body: (m: CallbackUnit['members'][number], doc: string) => string): string =>
  cb.members.filter((m) => m.recognized !== undefined).map((m) => body(m, `/// U-3: an exception of ${m.member.id}: an instance of an error unit that it recognizes, with one of the kinds of that
/// unit, is the core error of the kind (GN-6d); any other exception`)).join('');

// GN-6u, GN-6aa: whether the binding holds Natives: for a value alias, a function type or a callback that the core
// keeps.
export const holdsNative = (model: Model): boolean => usesNative(model) || keepsAny(model);

// GN-6ae: whether a member takes a function parameter or returns passthrough, and whether a contract has such a member.
export const passes = (fn: Fn): boolean => fn.params.some((p) => machineFunction(p.type)) || (typeof fn.returns === 'object' && 'passthrough' in fn.returns);
export const passesAny = (model: Model): boolean => [...model.functions, ...model.objects.flatMap((o) => o.members)].some(passes);

// GN-6ae: the first lines of the closure of a function parameter: the function of the language that callable checks,
// and the closure that takes the arguments of the core.
export function functionClosureHead(model: Model, type: Type & { function: unknown }, name: string, callable: string, subject: string): { parts: Type[]; head: string[] } {
  const parts = (type as { function: { parameters: Type[] } }).function.parameters;
  return { parts, head: [
    `        let ${name} = callable_in(${callable}, ${subject}, ${givenRust(functionGiven({ parameters: parts }))})?;`,
    `        let ${name} = move |${parts.map((part, i) => `arg${i}: ${rustType(model, part)}`).join(', ')}| -> Result<binding_core::Passthrough, binding_core::Failure<${model.coreError ?? '()'}>> {`,
  ] };
}

// The initializer of a field of a Rust struct from a variable, shortened when they have one name.
export const fieldInit = (field: string, variable: string): string => (field === variable ? field : `${field}: ${variable}`);

// N-4 iterate: what an iteration yields, and the conversion out of an item of it, borrowed where the place is.
export function iterateItems(model: Model, fn: Fn, convert: (model: Model, type: Type, value: string) => string): { yields: NonNullable<Fn['yields']>; item: (type: Type, value: string) => string } {
  return { yields: fn.yields ?? { value: 'none' }, item: (type, value) => `${convert(model, type, borrowedItem(model, type, value))}?` };
}

// G-7: the lines of a JavaScript entry that check the count of its arguments; U-2: the parameters that may be left
// out are the last ones, a record parameter with {empty: "object"} too.
export function countCheck(fn: Fn, label: string): string[] {
  const count = fn.params.length;
  const least = fn.params.filter((p) => p.default === undefined).length;
  const takes = least === count ? `${count} argument${count === 1 ? '' : 's'}` : `${least} to ${count} arguments`;
  return [`  if (${least === count ? `args.length !== ${count}` : `args.length < ${least} || args.length > ${count}`}) {`, `    throw new TypeError(\`${label} takes ${takes}, \${args.length} given\`);`, '  }'];
}

// GN-6af: the JavaScript class of a value class without core_type in node and wasm: the count of the arguments (G-7),
// the check of the binding, which check writes from the class name and the crossed arguments, and the kept values as
// own enumerable data properties. A keyed map crosses as the Map itself, which the binding reads and judges (GN-12).
export function keptClass(kept: KeptClass, lang: 'node' | 'wasm', prefix: string, check: (cls: string, crossed: string) => string): string {
  const cls = langName(lang, kept.unit.name, 'class');
  const count = kept.fields.length;
  const least = kept.fields.filter((f) => f.default === undefined).length;
  const takes = least === count ? `${count} argument${count === 1 ? '' : 's'}` : `${least} to ${count} arguments`;
  const crossed = kept.fields.map((f, i) => (typeof f.type === 'object' && 'list' in f.type ? `toList(args[${i}])` : `args[${i}]`));
  const empty = { null: 'null', map: 'new Map()', list: '[]' };
  const defined = kept.fields.map((f, i) => {
    const value = f.default === undefined ? `args[${i}]` : `args[${i}] === undefined ? ${empty[f.default]} : args[${i}]`;
    return `    Object.defineProperty(this, ${jsString(langName(lang, f.name, 'variable'))}, { value: ${value}, writable: ${String(f.writable)}, enumerable: true });`;
  });
  return `
${prefix}class ${cls} {
  constructor(...args) {
    if (${least === count ? `args.length !== ${count}` : `args.length < ${least} || args.length > ${count}`}) {
      throw new TypeError(\`new ${cls}() takes ${takes}, \${args.length} given\`);
    }
    ${check(cls, crossed.join(', '))};
${defined.join('\n')}
  }
}`;
}

// The base class of the error class of a category in JavaScript.
export const jsErrorBase = (category: string): string => ({ value: 'RangeError', type: 'TypeError' })[category] ?? 'Error';

// G-7: the members of a record parameter in JavaScript, and those of them that may not be left out.
export function recordMembers(record: Unit, lang: 'node' | 'wasm'): { names: string[]; required: string[] } {
  return {
    names: (record.fields ?? []).map((f) => langName(lang, f.name, 'variable')),
    required: (record.fields ?? []).filter((f) => f.default === undefined).map((f) => langName(lang, f.name, 'variable')),
  };
}

// The TypeScript type of a contract type in the declarations of node and wasm. GN-6s: a callback unit of another
// repository is the interface that its package declares, the WASM subpath of it for wasm; wasm takes no path.
export function tsType(model: Model, type: Type, input: boolean, lang: 'node' | 'wasm'): string {
  const common = tsCommon(type, input, (inner, given) => tsType(model, inner, given, lang), lang === 'node');
  if (common !== undefined || typeof type === 'string') return common ?? 'unknown';
  const unit = unitOf(model, type);
  const library = libraryOf(type);
  if (unit?.origin === 'callback' && library !== undefined) {
    return `import(${JSON.stringify(`${(model.foreign.get(library)?.packages['node'] as { package: string }).package}${lang === 'wasm' ? '/wasm' : ''}`)}).${langName(lang, unit.name, 'class')}`;
  }
  // T-3: a record of another repository is a plain object, declared here by its fields.
  if (unit?.kind === 'record' && libraryOf(type) !== undefined) {
    return `{ ${(unit.fields ?? []).map((f) => `readonly ${langName(lang, f.name, 'variable')}: ${tsType(model, f.type, input, lang)}`).join('; ')} }`;
  }
  // U-7: a value alias is any value that its core judges.
  if (unit === undefined || aliasOf(model, type) !== undefined) return 'unknown';
  return langName(lang, unit.name, 'class');
}

// GN-6ae: the type parameters of a member, one per name of a passthrough of its parameters and of its result.
export const typeParameters = (fn: Fn): string => {
  const names = [...new Set([...JSON.stringify([fn.params.map((p) => p.type), fn.returns]).matchAll(/\{"passthrough":"([^"]+)"\}/g)].map((found) => found[1] ?? ''))];
  return names.length === 0 ? '' : `<${names.join(', ')}>`;
};

// The parts of the TypeScript declarations of node and wasm, which the two write alike; base is the base class of the
// error class of a category, and the functions, which each writes, take param and returned.
export function declarations(model: Model, lang: 'node' | 'wasm', base: (category: string) => string): Record<'classes' | 'errorUnits' | 'enums' | 'records' | 'variants' | 'objects' | 'kept' | 'callbacks' | 'interfaces' | 'constants', string> & {
  shown: (a: Arg | undefined) => string;
  param: (fn: Fn, p: Fn['params'][number]) => string;
  returned: (fn: Fn) => string;
} {
  const ts = (type: Type, input: boolean): string => tsType(model, type, input, lang);
  const name = (n: Unit['name'], role: 'class' | 'callable' | 'variable' | 'constant'): string => langName(lang, n, role);
  // GN-6r: the JSDoc of a declaration of an internal unit holds @internal.
  const tag = (unit: Unit): string => (isInternal(unit) ? ' @internal' : '');
  // U-2: a parameter or a member that may be left out; the declaration shows a {literal} or {const} default.
  const shown = (a: Arg | undefined): string => {
    if (a?.default === undefined) return '';
    const value = a === undefined ? undefined : declaredValue(model, a)?.value;
    return value === undefined ? ' The core decides its value when it is left out (U-2).' : ` Its default is ${JSON.stringify(value)} (U-2).`;
  };
  // GN-6m: a member that waits returns a Promise of its result.
  // GN-6ae: the promise of the entry takes the state of a result passthrough that is a thenable.
  const returned = (fn: Fn): string => {
    const result = typeof fn.returns === 'object' && 'passthrough' in fn.returns ? `Awaited<${fn.returns.passthrough}>` : ts(fn.returns, false);
    return awaits(fn) ? `Promise<${result}>` : result;
  };
  const param = (_fn: Fn, p: Fn['params'][number]): string => `${name(p.name, 'variable')}${p.default === undefined ? '' : '?'}: ${ts(p.type, true)}`;
  const params = (fn: Fn): string => fn.params.map((p) => param(fn, p)).join(', ');
  const classes = model.classes.map((c) => `
/** The errors of category ${c.category} (E-2). */
export declare class ${c.name} extends ${base(c.category)} {
  readonly kind: string;
  readonly status: number | null;
  readonly errno: number | null;
}`).join('\n');
  const errorUnits = model.errorUnits.map((u) => `
/** The errors of the unit ${u.unit.id} (E-2). */
export declare class ${name(u.unit.name, 'class')} extends ${u.parent === undefined ? categoryClass(model, u.category) : name(u.parent.unit.name, 'class')} {${u.properties.map((p) => `\n  readonly ${name(p.member.name, 'variable')}: ${ts(p.returns, false)};`).join('')}
}`).join('\n');
  const enums = model.enums.map((u) => `
/** T-6.${tag(u)} */
export type ${name(u.name, 'class')} = ${(u.variants ?? []).map((v) => jsString(v.value)).join(' | ')};`).join('\n');
  // T-9, GN-6v: an interface per case, whose tag member is the text of the case, and the union of the cases.
  const variants = model.variants.map((v) => `${v.cases.map((kase) => `
/** T-9: the case ${kase.value} of the variant ${name(v.unit.name, 'class')}. */
export interface ${name(kase.unit.name, 'class')} {
  readonly ${name(v.unit.tag ?? [], 'variable')}: ${jsString(kase.value)};
${(kase.unit.fields ?? []).map((f) => `  readonly ${name(f.name, 'variable')}${caseLeftOut(f) ? '?' : ''}: ${ts(f.type, false)};\n`).join('')}}`).join('\n')}

/** T-9. */
export type ${name(v.unit.name, 'class')} = ${v.cases.map((kase) => name(kase.unit.name, 'class')).join(' | ')};`).join('\n');
  const records = model.records.map((u) => `
/** T-4: the options record; a member whose value is undefined is absent.${tag(u)} */
export interface ${name(u.name, 'class')} {
${(u.fields ?? []).map((f) => `${f.default === undefined ? '' : `  /**${shown({ name: f.name, type: f.type, field: true, default: f.default })} */\n`}  readonly ${name(f.name, 'variable')}${f.default === undefined ? '' : '?'}: ${ts(f.type, true)};`).join('\n')}
}`).join('\n');
  const constants = model.constants.map((c) => `${isInternal(c.unit) ? '/** @internal */\n' : ''}export declare const ${name(c.member.name, 'constant')}: ${JSON.stringify(c.member.value)};`).join('\n');
  const objects = model.objects.map((o) => {
    const lines = o.members.map((fn) => {
      const member = memberName(lang, fn);
      if (fn.kind === 'constructor') return `  constructor(${params(fn)});`;
      if (fn.kind === 'static') return `  static ${member}${typeParameters(fn)}(${params(fn)}): ${returned(fn)};`;
      if (fn.kind === 'property') return `  get ${member}(): ${ts(fn.returns, false)};`;
      if (fn.kind === 'iterate') {
        const yields = fn.yields ?? { value: 'none' };
        const item = yields.key === undefined ? ts(yields.value, false) : `[${ts(yields.key, false)}, ${ts(yields.value, false)}]`;
        return `  [Symbol.iterator](): IterableIterator<${item}>;`;
      }
      return `  ${member}${typeParameters(fn)}(${params(fn)}): ${returned(fn)};`;
    });
    if (!o.constructible) lines.unshift('  private constructor();');
    return `
/** T-5.${tag(o.unit)} */
export declare class ${name(o.unit.name, 'class')}${implementsClause(model, o, lang)} {
${lines.join('\n')}
}`;
  }).join('\n');
  // GN-6af: the constructor keeps its arguments, each an own property, which a writable property also sets.
  const kept = model.kept.map((k) => `
/** GN-6af: keeps the values that its constructor takes. */
export declare class ${name(k.unit.name, 'class')} {
  constructor(${k.fields.map((f) => `${name(f.name, 'variable')}${f.default === undefined ? '' : '?'}: ${ts(f.type, true)}`).join(', ')});
${k.fields.map((f) => `  ${f.writable ? '' : 'readonly '}${name(f.name, 'variable')}: ${ts(f.type, false)};`).join('\n')}
}`).join('\n');
  const callbacks = model.callbacks.map((cb) => `
/** U-3: a callback that JavaScript code implements.${tag(cb.unit)} */
export interface ${name(cb.unit.name, 'class')} {
${cb.members.map((m) => `  ${name(m.member.name, 'callable')}${m.absent === undefined ? '' : '?'}(${m.params.map((p) => `${name(p.name, 'variable')}: ${ts(p.type, false)}`).join(', ')}): ${ts(m.returns, true)};`).join('\n')}
}`).join('\n');
  // GN-6ap: a generated interface, which the classes that implement it name.
  const interfaces = model.interfaces.map((i) => `
/** GN-6ap: the interface of ${implementorsOf(model, i).map((o) => name(o.unit.name, 'class')).join(', ')}; a parameter of it takes an instance of one of them.${tag(i)} */
export interface ${name(i.name, 'class')} {}`).join('\n');
  return { classes, errorUnits, enums, records, variants, objects, kept, callbacks, interfaces, constants, shown, param, returned };
}

// T-1, T-2: the TypeScript type of a scalar or a container in node and wasm, which differ by whether a path is
// taken; undefined for a unit. ts is the type of the language for an inner type.
function tsCommon(type: Type, input: boolean, ts: (type: Type, input: boolean) => string, path: boolean): string | undefined {
  if (typeof type === 'string') {
    const map: Record<string, string> = { text: 'string', latin1: 'string', bool: 'boolean', uint: 'number', int: 'number', float: 'number', int64: input ? 'number | bigint' : 'bigint', bytes: 'Uint8Array', source: 'string | Uint8Array', ...(path ? { path: 'string | Uint8Array' } : {}), cancel: 'AbortSignal', none: 'void', never: 'never' };
    return map[type] ?? 'unknown';
  }
  // GN-6ae: a function of the caller takes the values that the core gives it, and a passthrough is a type parameter of
  // the member.
  if (machineFunction(type)) return `(${type.function.parameters.map((part, i) => `arg${i}: ${ts(part, false)}`).join(', ')}) => ${ts(type.function.returns, true)}`;
  if ('passthrough' in type) return type.passthrough;
  if ('list' in type) return input ? `Iterable<${ts(type.list, input)}>` : `readonly (${ts(type.list, input)})[]`;
  if ('map' in type) return `ReadonlyMap<string, ${ts(type.map, input)}>`;
  if ('keyed_map' in type) return `ReadonlyMap<${type.key.map((k) => ({ int: 'number', text: 'string' })[k] ?? 'never').join(' | ')}, ${ts(type.keyed_map, input)}>`;
  if ('optional' in type) return `${ts(type.optional, input)} | null`;
  if ('tuple' in type) return `readonly [${type.tuple.map((t) => ts(t, input)).join(', ')}]`;
  // GN-6z: a function takes the arguments that the core gives and returns a value that the binding judges.
  if ('function' in type) return `((${type.function.parameters.map((p, i) => `argument${String(i)}: ${ts(p, false)}`).join(', ')}) => ${ts(type.function.returns, true)})`;
  return undefined;
}

// T-2: what the output conversion of a container differs by between the languages.
export interface ContainersOut {
  // The token of the language that every conversion takes first ('env_', 'py_'), or ''.
  readonly env: string;
  // The output of an optional, when the language does not write it by optional_out.
  readonly optional?: (value: string, inner: Type) => string;
  // The place of a part of a tuple, and the tuple made of the converted parts.
  readonly part?: (type: Type, name: string) => string;
  readonly tuple: (parts: string[]) => string;
  readonly convert: (model: Model, type: Type, value: string) => string;
}

// T-2: the output conversion of a passthrough, a list, a map, a keyed map, an optional or a tuple; undefined for any
// other type.
export function containerOut(model: Model, type: Type, value: string, form: ContainersOut): string | undefined {
  if (typeof type === 'string') return undefined;
  const lead = form.env === '' ? '' : `${form.env}, `;
  const params = (name: string): string[] => (form.env === '' ? [name] : [form.env, name]);
  const convert = (inner: Type, place: string): string => form.convert(model, inner, place);
  // GN-6ae: a result passthrough leaves the table of the binding as the value that the function returned.
  if ('passthrough' in type) return `passed_out(${lead}${value})`;
  if ('list' in type) return `list_out(${lead}${value}, ${closure(params('item'), convert(type.list, 'item'))})`;
  // The value of a keyed map is a reference of any lifetime, which a closure takes and a generic function item does not.
  if ('map' in type) return `map_out(${lead}${value}, |${params('item').join(', ')}| ${convert(type.map, 'item')})`;
  if ('keyed_map' in type) return `keyed_map_out(${lead}${value}, |${params('item').join(', ')}| ${convert(type.keyed_map, 'item')})`;
  if ('optional' in type) return form.optional?.(value, type.optional) ??`optional_out(${lead}${optionRef(value)}, ${closure(params('value'), convert(type.optional, 'value'))})`;
  if ('tuple' in type) return tupleOut(type.tuple, value, (t, name) => convert(t, form.part?.(t, name) ?? name), form.tuple);
  return undefined;
}

// T-1: what the input conversion of a container differs by between the languages.
export interface ContainersIn {
  // The arguments before the value of a conversion of a container: '' or the token of the language ('py_, ').
  readonly lead: string;
  // The parameters of the closure that converts an item.
  readonly item: string[];
  // The message of a keyed map of a wrong key, before the names of its kinds of key, and those names.
  readonly keyed: string;
  readonly keyNames: Readonly<Record<string, string>>;
  // The place of a part of a tuple that the conversion of the part reads.
  readonly part: (name: string) => string;
  // The input conversion of the language, and that of a function.
  readonly convert: (model: Model, type: Type, value: string, subject: string) => string;
  readonly functionIn: (model: Model, type: FunctionType, value: string, subject: string) => string;
}

// T-1: the containers of node and wasm, which differ by the place of a part of a tuple alone.
export const JS_CONTAINERS: Pick<ContainersIn, 'lead' | 'item' | 'keyed' | 'keyNames'> = { lead: '', item: ['item'], keyed: 'a Map whose keys are', keyNames: { int: 'safe integers', text: 'strings' } };

// T-1: the input conversion of a list, a map, a keyed map, an optional, a function or a tuple; undefined for any other
// type.
export function containerIn(model: Model, type: Type, value: string, subject: string, form: ContainersIn): string | undefined {
  if (typeof type === 'string') return undefined;
  const { lead, item } = form;
  const convert = (inner: Type, place: string): string => form.convert(model, inner, place, subject);
  if ('list' in type) return `list_in(${lead}${value}, ${subject}, ${closure(item, boxed(model, type.list, convert(type.list, 'item')))})`;
  if ('map' in type) return `map_in(${lead}${value}, ${subject}, ${closure(item, convert(type.map, 'item'))})`;
  if ('keyed_map' in type) {
    const tags = (['int', 'bytes', 'text'] as const).map((kind, tag) => (type.key.includes(kind) ? String(tag) : '')).filter((t) => t !== '');
    return `keyed_map_in(${lead}${value}, ${subject}, &[${tags.join(', ')}], ${rustString(`${form.keyed} ${type.key.map((k) => form.keyNames[k] ?? k).join(' or ')}`)}, ${closure(item, convert(type.keyed_map, 'item'))})`;
  }
  if ('optional' in type) return `optional_in(${value}, ${closure(['value'], boxed(model, type.optional, convert(type.optional, 'value')))})`;
  if ('function' in type) return form.functionIn(model, type.function, value, subject);
  if ('tuple' in type) return tupleIn(type.tuple, `tuple_in(${lead}${value}, ${subject})`, (part, name) => convert(part, form.part(name)));
  return undefined;
}
