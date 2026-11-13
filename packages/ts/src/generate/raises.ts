// E-5, I-2 (GN-7b): binding reads no Rust source, so every generated crate holds an assertion for each variant that a
// member names in `raises`: the path is a variant of the error type that the member's core path returns. A path of
// another type, or one that names no variant, does not compile.

import { variantPattern } from '../contract.ts';
import type { Model } from './model.ts';

// The assertions of a crate, one for each variant that a member of the model raises, in the order the members first
// name them. Every member of a contract returns the one core error enum of E-1, so a variant is asserted once.
export function raisesAssertions(model: Model): string {
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
const _: fn(&${source}) -> bool = |error| matches!(error, ${variantPattern(variant)});`);
  return `
// E-5: each variant that a member raises is a variant of the error that its core path returns (I-2). The pattern
// \`{ .. }\` matches a variant with or without data, which the generator does not see; a kind that the core passes on
// is the inner variant of its outer variant (GN-7c).
${assertions.join('\n')}
`;
}
