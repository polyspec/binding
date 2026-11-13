// HR-84: a test target of binding_core that needs a feature names it in required-features, so cargo test without the
// feature does not build it, and a run of the target runs its tests; a file that compiled to no test under a
// crate-level cfg would pass while it checked nothing (docs/core-api.md).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const manifest = new URL('../../core/rust/Cargo.toml', import.meta.url).pathname;

interface Target {
  name: string;
  kind: string[];
  src_path: string;
  'required-features'?: string[];
}

test('a test target of binding_core that needs a feature requires it and has no crate-level cfg (HR-84)', () => {
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--no-deps', '--offline', '--format-version', '1', '--manifest-path', manifest], { encoding: 'utf8' })) as { packages: { targets: Target[] }[] };
  const targets = (metadata.packages[0]?.targets ?? []).filter((t) => t.kind.includes('test'));
  assert.ok(targets.length > 0, 'cargo metadata named no test target');
  for (const target of targets) {
    const gated = [...readFileSync(target.src_path, 'utf8').matchAll(/^#!\[cfg\(feature = "([a-z-]+)"\)\]/gm)].map((m) => m[1]);
    assert.deepEqual(gated, [], `${target.name}: a crate-level cfg compiles to no test without its feature`);
  }
  const required = new Map(targets.map((t) => [t.name, t['required-features'] ?? []]));
  assert.deepEqual(required.get('lock'), ['lock']);
  assert.deepEqual(required.get('driver'), ['driver']);
});
