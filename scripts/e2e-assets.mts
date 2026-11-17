// GN-3c, GN-3h, GN-14: the assets of a run, served as a GitHub Release serves the assets of a tag. A consumer of a
// release names each npm package and each wheel by the URL of its asset, so the run serves the directory of its
// tarballs or of its wheels over HTTP on the loopback and installs them by their URLs. The server and the installer
// run in one process, so the install is one command that its own work bounds.

import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, join } from 'node:path';

// The files that a release holds as the archives of a package manager of these steps: a tarball of npm pack and a wheel.
export const ASSET_TYPES: readonly string[] = ['.tgz', '.whl'];

// The file of the directory of the assets that the path of a request names, or undefined for a path that names no
// asset: only the base name is read, so no request reaches a file outside the directory.
export function assetFile(assets: string, requestUrl: string): string | undefined {
  const name = basename(decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname));
  return ASSET_TYPES.some((type) => name.endsWith(type)) ? join(assets, name) : undefined;
}

// The URL of an asset under base, a URL that ends with a slash.
export function assetUrl(base: string, file: string): string {
  return `${base}${encodeURIComponent(file)}`;
}

// GN-3h: the arguments of the one pip install that takes every wheel of the run by its URL and reads no index.
export function pipInstallArgs(base: string, wheels: readonly string[]): string[] {
  return ['install', '-q', '--no-index', ...wheels.map((wheel) => assetUrl(base, wheel))];
}

// Serves the assets on a port of the loopback that the system gives, runs body with the base URL, which ends with a
// slash, and closes the server when body ends; the result is the status that body gives.
export function serveAssets(assets: string, body: (base: string) => Promise<number>): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer((request, response) => {
      const file = assetFile(assets, request.url ?? '/');
      if (file === undefined || !existsSync(file)) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      createReadStream(file).pipe(response);
    });
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        fail(new Error('the server of the assets has no port'));
        return;
      }
      const close = (status: number): void => {
        // npm and pip keep their connections open; the server ends them with the install.
        server.closeAllConnections();
        server.close(() => done(status));
      };
      body(`http://127.0.0.1:${String(address.port)}/`).then(close, (error: unknown) => {
        server.closeAllConnections();
        server.close(() => fail(error instanceof Error ? error : new Error(String(error))));
      });
    });
  });
}

// Runs a command with the output of the run; the result is its status, and 1 with the error on stderr when it does not
// start.
export function runCommand(command: string, argv: readonly string[], cwd: string | undefined, name: string): Promise<number> {
  return new Promise((done) => {
    const child = spawn(command, [...argv], { ...(cwd === undefined ? {} : { cwd }), stdio: 'inherit' });
    child.on('error', (error) => {
      process.stderr.write(`${name}: ${error.message}\n`);
      done(1);
    });
    child.on('exit', (status) => done(status ?? 1));
  });
}
