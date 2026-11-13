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
