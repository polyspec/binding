// CK-20: the commit that this binding was checked out at, which check compares with the commit that a Cargo.lock pins.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// The commit of the binding whose package directory (packages/ts) is packageDir: the commit that git archive wrote
// into archive-commit (export-subst, GN-14b), the HEAD of its Git checkout, or the commit that the npm lock of the
// project that installed it from Git resolved.
export function ownCommit(packageDir: string): string | undefined {
  const archived = join(packageDir, 'archive-commit');
  if (existsSync(archived)) {
    const text = readFileSync(archived, 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(text)) return text;
  }
  // The checkout of binding itself (packages/ts is two levels below its root), not a project that holds it in
  // node_modules.
  const top = spawnSync('git', ['-C', packageDir, 'rev-parse', '--show-toplevel', 'HEAD'], { encoding: 'utf8' });
  const [toplevel, head] = top.status === 0 ? top.stdout.trim().split('\n') : [];
  if (toplevel !== undefined && resolve(toplevel) === resolve(packageDir, '..', '..')) return head;
  for (let dir = packageDir; dir !== dirname(dir); dir = dirname(dir)) {
    const npmLock = join(dir, 'package-lock.json');
    if (!existsSync(npmLock)) continue;
    const packages = (JSON.parse(readFileSync(npmLock, 'utf8')) as { packages?: Record<string, { resolved?: string }> }).packages ?? {};
    const resolved = packages['node_modules/@polyspec/binding']?.resolved;
    if (resolved?.startsWith('git+') === true) return resolved.slice(resolved.lastIndexOf('#') + 1);
  }
  return undefined;
}

// CK-20: what a Git source of polyspec-binding-core in a Cargo.lock (`git+<url>?<reference>#<commit>`) differs in from
// the running binding of the version `version` and the commit `mine`, or undefined when it names this binding. A
// binding that knows its commit compares it with the commit of the source. A binding that knows no commit is the
// archive of a release, the one form that carries no commit, and a release of the version X.Y.Z is the annotated tag
// vX.Y.Z, which no step moves, so a source that names the tag of its version names it.
export function gitPinDiffers(source: string, version: string, mine: string | undefined): string | undefined {
  const hash = source.lastIndexOf('#');
  const commit = source.slice(hash + 1);
  if (mine !== undefined) return mine === commit ? undefined : `Cargo.lock pins polyspec-binding-core at the commit ${commit}, not ${mine}`;
  const query = source.slice(0, hash < 0 ? undefined : hash).split('?')[1] ?? '';
  const tag = new URLSearchParams(query).get('tag');
  if (tag === `v${version}`) return undefined;
  return `Cargo.lock pins polyspec-binding-core at the commit ${commit}${tag === null ? '' : ` of the tag ${tag}`}, and this binding knows no commit of its own; as the archive of the release ${version} it is the tag v${version}`;
}
