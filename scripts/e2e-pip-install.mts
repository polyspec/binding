// GN-3h, GN-14: installs the wheels of a run as a consumer of a release does. The run serves the directory of the
// wheels over HTTP on the loopback, as the GitHub Release serves its assets (scripts/e2e-assets.mts), and gives pip
// every wheel by its URL in one install that reads no index, so a requirement of a wheel on another wheel of the run
// (GN-3e: the name alone, or polyspec-<library>==X.Y.Z of the release form) is satisfied by the URL of that wheel.
//
// usage: node scripts/e2e-pip-install.mts <wheels> <pip> <wheel file>...
// the status is that of pip install.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pipInstallArgs, runCommand, serveAssets } from './e2e-assets.mts';

const [wheels, pip, ...files] = process.argv.slice(2);
if (wheels === undefined || pip === undefined || files.length === 0) {
  process.stderr.write('usage: node scripts/e2e-pip-install.mts <wheels> <pip> <wheel file>...\n');
  process.exit(2);
}
for (const file of files) {
  if (!file.endsWith('.whl') || !existsSync(join(wheels, file))) {
    process.stderr.write(`e2e-pip-install: ${join(wheels, file)} is no wheel of the run\n`);
    process.exit(1);
  }
}
process.exitCode = await serveAssets(wheels, (base) => {
  const argv = pipInstallArgs(base, files);
  process.stdout.write(`$ ${pip} ${argv.join(' ')}\n`);
  return runCommand(pip, argv, undefined, 'e2e-pip-install');
});
