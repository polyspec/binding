// GN-3c, GN-3h, GN-14: installs the npm packages of a run as a consumer of a release does. The run serves the directory
// of the tarballs over HTTP on the loopback, as the GitHub Release serves its assets (scripts/e2e-assets.mts), and
// installs them through one root package.json that names each by its URL, with allow-remote=root. Before the install it
// reads the manifest of each tarball: a requirement of the release form on another package of the run (GN-3e) needs the
// tarball of that version among them, and one that has none fails here with its name.
//
// usage: node scripts/e2e-npm-install.mts <assets> <consumer> <npm> <packages.json>
// where packages.json is a list of ConsumerPackage; the status is that of npm install.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand, serveAssets } from './e2e-assets.mts';
import { CONSUMER_NPMRC, consumerManifest, missingSiblingAssets, packFile, siblingReleaseForms, type ConsumerPackage, type PackedManifest } from './e2e-npm.mts';

const [assets, consumer, npm, list] = process.argv.slice(2);
if (assets === undefined || consumer === undefined || npm === undefined || list === undefined) {
  process.stderr.write('usage: node scripts/e2e-npm-install.mts <assets> <consumer> <npm> <packages.json>\n');
  process.exit(2);
}
const packages = JSON.parse(readFileSync(list, 'utf8')) as ConsumerPackage[];
for (const p of packages) {
  const file = join(assets, packFile(p.name, p.version, p.platform));
  if (!existsSync(file)) {
    process.stderr.write(`e2e-npm-install: ${file} is missing, which npm pack of ${p.name}${p.platform === undefined ? '' : ` for ${p.platform}`} names\n`);
    process.exit(1);
  }
}
// The manifest that each tarball carries, package/package.json, as npm reads it at the install.
const manifests = packages.map((p) => JSON.parse(execFileSync('tar', ['-xzOf', join(assets, packFile(p.name, p.version, p.platform)), 'package/package.json'], { encoding: 'utf8' })) as PackedManifest);
const missing = missingSiblingAssets(manifests, packages);
if (missing.length > 0) {
  process.stderr.write(`${missing.map((line) => `e2e-npm-install: ${line}\n`).join('')}`);
  process.exit(1);
}
for (const line of siblingReleaseForms(manifests, packages)) process.stdout.write(`release form: ${line}, which the root manifest satisfies by its URL (GN-3h)\n`);
process.exitCode = await serveAssets(assets, (base) => {
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify(consumerManifest(packages, base), null, 2)}\n`);
  writeFileSync(join(consumer, '.npmrc'), CONSUMER_NPMRC);
  process.stdout.write(`$ ${npm} install --no-audit --no-fund (assets at ${base})\n`);
  return runCommand(npm, ['install', '--no-audit', '--no-fund'], consumer, 'e2e-npm-install');
});
