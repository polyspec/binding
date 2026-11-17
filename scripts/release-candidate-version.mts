// The version that `make release-candidate-assets` packs when no VERSION is given (B2.455): the version that the release
// of this commit would take, the title of the first `## X.Y.Z` of the change log that config/release.json names. It is
// read by the functions of the installed kit by which release-tag reads it (`loadConfig` and `releasedVersion` of
// release.mjs, which release-run.mjs calls), so the heading is parsed in one place. kit has no command that prints it
// and its package exports do not name release.mjs, so the module is imported by its path in node_modules, as the
// Makefile runs it by that path. The rule unreleased-empty-at-release is not given: on a commit that is not a version
// commit `## Unreleased` holds entries, the top version is the last released one, and the manifests still hold it.
//
//   node scripts/release-candidate-version.mts
//
// prints X.Y.Z, or fails with the reason of kit.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, releasedVersion } from '../node_modules/@polyspec/kit/dist/release.mjs';

// The version of the top section `## X.Y.Z` of the change log of the checkout `root`.
export function candidateVersion(root: string): string {
  const { changelog } = loadConfig(root);
  return releasedVersion(readFileSync(join(root, changelog), 'utf8'), changelog);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${candidateVersion(fileURLToPath(new URL('..', import.meta.url)))}\n`);
  } catch (failure) {
    process.stderr.write(`release-candidate-version: ${failure instanceof Error ? failure.message : String(failure)}\n`);
    process.exit(1);
  }
}
