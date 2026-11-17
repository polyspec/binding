// GN-19g, B2.496, B2.505: the check of the sizes of the assets of a release. GitHub takes no empty asset and no asset
// of 2 GiB or more, so each such file is named. Every asset of a release is built after its tag, so the build recipes
// that CI runs on the same tree before any tag end with this check (release-candidate-assets of binding and
// release-assets-<job> of the generated recipes), and release-platform-assets runs it again before its upload.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The size from which GitHub refuses an asset of a release.
export const GITHUB_ASSET_LIMIT = 2 ** 31;

// Each file under the paths, a file itself or every file of a directory at any depth; a path that does not exist holds
// no asset.
function filesOf(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).sort().flatMap((name) => filesOf(join(path, name)));
}

// The problem of each file under the paths whose size GitHub does not take, in the order of the paths.
export function assetSizeProblems(paths: readonly string[], size: (file: string) => number = (file) => statSync(file).size): string[] {
  return paths.flatMap(filesOf).flatMap((file) => {
    const bytes = size(file);
    if (bytes === 0) return [`${file} is empty, and GitHub takes no empty asset`];
    if (bytes >= GITHUB_ASSET_LIMIT) return [`${file} is ${bytes} bytes, and GitHub takes no asset of 2 GiB or more`];
    return [];
  });
}

// binding asset-sizes --step <recipe> <path>...: prints each problem after the name of the recipe and ends with 1 when
// there is one.
export function assetSizesCommand(args: readonly string[]): never {
  const at = args.indexOf('--step');
  const step = at < 0 ? 'asset-sizes' : args[at + 1];
  const paths = args.filter((_, i) => at < 0 || (i !== at && i !== at + 1));
  if (step === undefined || step === '' || paths.length === 0) {
    process.stderr.write('usage: binding asset-sizes [--step <recipe>] <path>...\n');
    process.exit(2);
  }
  const problems = assetSizeProblems(paths);
  for (const problem of problems) process.stderr.write(`${step}: ${problem}\n`);
  process.exit(problems.length === 0 ? 0 : 1);
}
