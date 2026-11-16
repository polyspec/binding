// GN-14 (B2.402): the judgement of a check that the compiler must refuse. A repository of tests/e2e with refused.json
// names, for each target, the one rustc code with which `cargo check` of its binding crate must fail: a check that
// passes, that fails without that code, or that fails with another error too verifies nothing and fails the step.

// The reason that a run of cargo check is no refusal with code, or undefined when it is.
export function refusalProblem(status: number | null, stderr: string, code: string | undefined): string | undefined {
  if (code === undefined) return 'refused.json names no code for the target';
  if (status === 0) return `cargo check passed, but the binding must be refused with ${code}`;
  const errors = stderr.split('\n').filter((line) => /^error(\[|:)/.test(line)).map((line) => line.trim());
  const others = errors.filter((line) => !line.startsWith(`error[${code}]`) && !/^error: could not compile `/.test(line));
  if (!errors.some((line) => line.startsWith(`error[${code}]`))) return `cargo check failed without ${code}: ${others.join('; ') || `status ${String(status)}`}`;
  if (others.length > 0) return `cargo check failed with ${code} and another error: ${others.join('; ')}`;
  return undefined;
}
