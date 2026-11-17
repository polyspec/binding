// GN-3h, GN-14: the assets of a run of the end-to-end check, served on the loopback as a GitHub Release serves the
// assets of a tag, and the one pip install that takes every wheel of the run by its URL.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assetFile, assetUrl, pipInstallArgs, serveAssets } from '../../../scripts/e2e-assets.mts';

test('B2.458: pip takes every wheel of the run by its URL in one install that reads no index and no directory (GN-3h)', () => {
  const base = 'http://127.0.0.1:4000/';
  assert.deepEqual(pipInstallArgs(base, ['polyspec_sample-0.0.3-cp314-abi3-manylinux_2_34_x86_64.whl', 'polyspec_consumer-0.0.1-cp314-abi3-manylinux_2_34_x86_64.whl']), [
    'install', '-q', '--no-index',
    'http://127.0.0.1:4000/polyspec_sample-0.0.3-cp314-abi3-manylinux_2_34_x86_64.whl',
    'http://127.0.0.1:4000/polyspec_consumer-0.0.1-cp314-abi3-manylinux_2_34_x86_64.whl',
  ]);
  assert.ok(!pipInstallArgs(base, ['a-1-py3-none-any.whl']).includes('--find-links'));
  // A local version holds a plus sign, which a URL writes encoded.
  assert.equal(assetUrl(base, 'a-1+local-py3-none-any.whl'), 'http://127.0.0.1:4000/a-1%2Blocal-py3-none-any.whl');
});

test('B2.458: a request names a tarball or a wheel of the directory of the assets by its base name, and nothing else (GN-14)', () => {
  assert.equal(assetFile('/run/assets', '/polyspec-sample-0.0.3.tgz'), '/run/assets/polyspec-sample-0.0.3.tgz');
  assert.equal(assetFile('/run/assets', '/a-1%2Blocal-py3-none-any.whl'), '/run/assets/a-1+local-py3-none-any.whl');
  // No file outside the directory, and no file of another kind.
  assert.equal(assetFile('/run/assets', '/../secret/polyspec-sample-0.0.3.tgz'), '/run/assets/polyspec-sample-0.0.3.tgz');
  assert.equal(assetFile('/run/assets', '/%2E%2E%2Fother.whl'), '/run/assets/other.whl');
  assert.equal(assetFile('/run/assets', '/package.json'), undefined);
  assert.equal(assetFile('/run/assets', '/'), undefined);
});

test('B2.458: the server of the assets gives a wheel and a tarball by their URLs, answers 404 for another file, and ends with the status of its body (GN-14)', async (t) => {
  const assets = mkdtempSync(join(tmpdir(), 'e2e-assets-'));
  t.after(() => rmSync(assets, { recursive: true, force: true }));
  writeFileSync(join(assets, 'a-1-py3-none-any.whl'), 'wheel');
  writeFileSync(join(assets, 'a-1.tgz'), 'tarball');
  writeFileSync(join(assets, 'notes.txt'), 'notes');
  const seen: Record<string, string> = {};
  let served = '';
  const status = await serveAssets(assets, async (base) => {
    served = base;
    for (const file of ['a-1-py3-none-any.whl', 'a-1.tgz', 'notes.txt', 'absent.whl']) {
      const response = await fetch(assetUrl(base, file));
      seen[file] = `${String(response.status)} ${await response.text()}`;
    }
    return 7;
  });
  assert.equal(status, 7);
  assert.match(served, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.deepEqual(seen, { 'a-1-py3-none-any.whl': '200 wheel', 'a-1.tgz': '200 tarball', 'notes.txt': '404 ', 'absent.whl': '404 ' });
  // The server is closed: the port answers no more.
  await assert.rejects(fetch(assetUrl(served, 'a-1.tgz')));
  assert.equal(readFileSync(join(assets, 'a-1.tgz'), 'utf8'), 'tarball');
});

test('B2.458: the end-to-end check installs the wheels through the install by URL, and its script holds no --find-links (GN-3h, GN-14a)', () => {
  const script = String(readFileSync(new URL('../../../scripts/e2e.mts', import.meta.url)));
  assert.match(script, /scripts\/e2e-pip-install\.mts/);
  assert.doesNotMatch(script, /--find-links/);
});
