// E-5, I-2 (GN-7b): binding reads no Rust source, so every generated crate holds an assertion for each variant that a
// member names in `raises`: the path is a variant of the error type that the member's core path returns. A path of
// another type, or one that names no variant, does not compile.

import { type Model, errorMatched, paramBorrow, unitOf, variantPattern } from './model.ts';

// The assertions of a crate, one for each variant that a member of the model raises, in the order the members first
// name them. Every member of a contract returns the one core error enum of E-1, so a variant is asserted once.
export function raisesAssertions(model: Model): string {
  return variantAssertions(model) + borrowAssertions(model);
}

function variantAssertions(model: Model): string {
  const source = model.coreError;
  if (source === undefined) return '';
  const variants: string[] = [];
  for (const fn of [...model.functions, ...model.objects.flatMap((o) => o.members)]) {
    for (const variant of fn.member.raises ?? []) {
      if (!variants.includes(variant)) variants.push(variant);
    }
  }
  if (variants.length === 0) return '';
  const assertions = variants.map((variant) => `#[allow(clippy::unneeded_struct_pattern, reason = "I-2")]
const _: fn(&${source}) -> bool = |error| matches!(${errorMatched(model, 'error', true)}, ${variantPattern(variant)});`);
  return `
// E-5: each variant that a member raises is a variant of the error that its core path returns (I-2). The pattern
// \`{ .. }\` matches a variant with or without data, which the generator does not see.
${assertions.join('\n')}
`;
}

// GN-6h, I-2: the borrows that a member's core takes of its receiver and of each class parameter that names one, as
// the type of a fn pointer that the core path coerces to; a parameter that names no borrow is `_`. A borrow that
// differs from the core does not compile, which the call alone does not find for a contract `&mut` over a core `&`.
function borrowAssertions(model: Model): string {
  const coreOf = (type: Parameters<typeof unitOf>[1]): string => unitOf(model, type)?.core_type ?? '_';
  const assertions = [...model.functions, ...model.objects.flatMap((o) => o.members)].flatMap((fn) => {
    if (!fn.params.some((p) => p.core !== undefined)) return [];
    const receiver = fn.receiver === undefined ? [] : [`${fn.receiver === '&mut self' ? '&mut ' : '&'}${fn.unit.core_type ?? '_'}`];
    const params = fn.params.map((p) => {
      if (p.core === undefined) return '_';
      const prefix: Record<ReturnType<typeof paramBorrow>, string> = { '&': '&', '&mut': '&mut ', value: '' };
      return `${prefix[paramBorrow(p)]}${coreOf(p.type)}`;
    });
    return [`const _: () = {\n    let _: fn(${[...receiver, ...params].join(', ')}) -> _ = ${fn.corePath};\n};`];
  });
  if (assertions.length === 0) return '';
  return `
// GN-6h: the borrow that the core takes of each class parameter that names one (I-2).
${assertions.join('\n')}
`;
}
