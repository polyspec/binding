// GN-3c, GN-14: installs the npm packages of a run as a consumer of a release does. The run serves the directory of the
// tarballs over HTTP on the loopback, as the GitHub Release serves its assets, and installs them through one root
// package.json that names each by its URL, with the .npmrc of a consumer. The server and npm run in this one process,
// so the install is one command that its own work bounds.
//
// usage: node scripts/e2e-npm-install.mts <assets> <consumer> <npm> <packages.json>
// where packages.json is a list of ConsumerPackage; the status is that of npm install.

import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, join } from 'node:path';
import { CONSUMER_NPMRC, consumerManifest, packFile, type ConsumerPackage } from './e2e-npm.mts';

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
const server = createServer((request, response) => {
  const file = join(assets, basename(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)));
  if (!file.endsWith('.tgz') || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the server of the assets has no port');
  const base = `http://127.0.0.1:${String(address.port)}/`;
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify(consumerManifest(packages, base), null, 2)}\n`);
  writeFileSync(join(consumer, '.npmrc'), CONSUMER_NPMRC);
  process.stdout.write(`$ ${npm} install --no-audit --no-fund (assets at ${base})\n`);
  const child = spawn(npm, ['install', '--no-audit', '--no-fund'], { cwd: consumer, stdio: 'inherit' });
  child.on('error', (error) => {
    process.stderr.write(`e2e-npm-install: ${error.message}\n`);
    server.close();
    process.exitCode = 1;
  });
  child.on('exit', (status) => {
    server.close();
    process.exitCode = status ?? 1;
  });
});
