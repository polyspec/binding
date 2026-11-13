// U-2, T-4: what the emitters share about a parameter or a field that the caller may leave out. The binding passes
// None for it and fills no value in (B-1); a {literal} or {const} default, which the declarations show, is asserted
// to equal the constant of the core that default_core names.

import type { Type } from '../contract.ts';
import { type Arg, type Fn, type Model, type Refusals, Unsupported } from './model.ts';
import { rustString } from './text.ts';

// Every argument of the model that has a default, with the member that takes it; a field of a record once per member.
const defaulted = (model: Model): { fn: Fn; arg: Arg }[] =>
  [...model.functions, ...model.objects.flatMap((o) => o.members)].flatMap((fn) => fn.args.filter((a) => a.default !== undefined).map((arg) => ({ fn, arg })));

// The value that a {literal} or {const} default declares, or undefined for another form.
export function declaredValue(model: Model, arg: Arg): { value: unknown; core?: string } | undefined {
  const declared = arg.default;
  if (declared === undefined) return undefined;
  if ('literal' in declared) return { value: declared.literal };
  if (!('const' in declared)) return undefined;
  const constant = model.constants.find((c) => c.member.id === declared.const);
  if (constant === undefined) throw new Unsupported(`the default {const: ${declared.const}} names no constant that is generated (U-2, U-5)`);
  return { value: constant.member.value, core: constant.member.core as string };
}

// U-2: the const assertions of the defaults: default_core equals the declared literal, or the constant of the core
// that the {const} member names. A text is compared by its bytes.
export function defaultAsserts(model: Model): string {
  const lines = new Set<string>();
  let text = false;
  for (const { arg } of defaulted(model)) {
    const declared = declaredValue(model, arg);
    if (declared === undefined || arg.defaultCore === undefined) continue;
    const core = arg.defaultCore;
    // A {const} default whose constant is default_core itself is asserted by the constant (U-5).
    if (declared.core === core) continue;
    if (arg.type === 'text') {
      text = true;
      lines.add(`const _: () = assert!(same_text(${core}, ${declared.core ?? rustString(String(declared.value))}));`);
    } else if (arg.type === 'bool' && declared.core === undefined) {
      lines.add(`const _: () = assert!(${declared.value === true ? '' : '!'}${core});`);
    } else if (arg.type === 'float' && declared.core === undefined) {
      lines.add(`const _: () = assert!(${core}.to_bits() == (${Number(declared.value)}_f64).to_bits());`);
    } else {
      lines.add(`const _: () = assert!(${core} == ${declared.core ?? String(declared.value)});`);
    }
  }
  if (lines.size === 0) return '';
  const same = text
    ? `
/// U-2: whether two texts have the same bytes, for the assertions of the defaults.
const fn same_text(left: &str, right: &str) -> bool {
    let (left, right) = (left.as_bytes(), right.as_bytes());
    if left.len() != right.len() {
        return false;
    }
    let mut index = 0;
    while index < left.len() {
        if left[index] != right[index] {
            return false;
        }
        index += 1;
    }
    true
}
`
    : '';
  return `
// U-2: a declared default is the constant of the core that the core uses for None.
${[...lines].join('\n')}
${same}`;
}

// G-5: the case value of the declared default of an argument, for the test that a call without the argument and a call
// with its default give the same; undefined for {computed}, which the contract case of its rule checks.
export function defaultCaseValue(model: Model, arg: Arg): { value: unknown } | undefined {
  const declared = arg.default;
  if (declared === undefined || 'computed' in declared) return undefined;
  if ('empty' in declared) return { value: [] };
  const found = declaredValue(model, arg);
  return found === undefined ? undefined : { value: found.value };
}
