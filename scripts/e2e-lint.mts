// GN-14, GN-5: the lints of one binding crate in the end-to-end check. The crate is linted with the test features of
// its manifest, which the tests of the run build, and without a feature, which a release builds: an import or a helper
// whose only users are entry points of a test feature is unused in the second build alone, and the lints of the
// workspace deny it.

export interface Lint {
  // What the lint read, for the outcome of the target.
  what: string;
  // The arguments of cargo.
  argv: string[];
}

export function bindingLints(manifest: string, crate: string, features: string): Lint[] {
  const clippy = (extra: string[]): string[] => ['clippy', '--manifest-path', manifest, '-p', crate, '--all-targets', ...extra, '--', '-D', 'warnings'];
  return [
    { what: 'with its test features', argv: clippy(['--features', features]) },
    { what: 'without features', argv: clippy([]) },
  ];
}

// GN-5, GN-17: the line of `llvm-nm --defined-only` that defines a test entry point of the Go static library of a
// contract. A test entry point is the prefix of the contract, two underscores and the name of the entry; the symbol of
// a member has a name of the contract after one underscore, so the member echo_x of a class, <prefix>_<unit>__echo_x,
// is no test entry point, and neither is a symbol of another library whose prefix only starts with this one.
export function testEntrySymbol(prefix: string): RegExp {
  return new RegExp(` [A-Z] _?${prefix}__(panic_test|echo_|arm_faults|fault_left|alias_in_|native_count|thrown_count|number_in)`);
}
