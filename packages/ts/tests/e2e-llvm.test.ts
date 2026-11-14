// GN-14a: the LLVM of the PHP target. The bindgen of ext-php-rs loads a libclang (clang-sys) and asks a clang executable
// for the directories of the headers that it includes; a run gives both from the one LLVM that config/toolchain.json
// pins, so a machine with several LLVM releases cannot pair the libclang of one with the headers of another.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LLVM_BY_HAND, llvmOf } from '../../../scripts/e2e-llvm.mts';

const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('config/toolchain.json pins the major release of the LLVM of the PHP target (GN-14a)', () => {
  const toolchain = JSON.parse(read('config/toolchain.json')) as { llvm?: { version?: unknown } };
  assert.equal(toolchain.llvm?.version, '21');
});

test('the LLVM of a major release is the libclang and the clang of one installation of it (GN-14a)', () => {
  // Ubuntu and Debian install LLVM <major> under /usr/lib/llvm-<major>, Homebrew under its prefix as llvm@<major>.
  assert.deepEqual(llvmOf('linux', '21'), { libclang: '/usr/lib/llvm-21/lib', clang: '/usr/lib/llvm-21/bin/clang' });
  assert.deepEqual(llvmOf('darwin', '21'), { libclang: '/opt/homebrew/opt/llvm@21/lib', clang: '/opt/homebrew/opt/llvm@21/bin/clang' });
  assert.equal(llvmOf('win32', '21'), undefined);
});

test('a run gives the libclang and the clang of the pinned LLVM to its commands, and one given by hand makes it a diagnosis (GN-14a, GN-14b)', () => {
  const script = read('scripts/e2e.mts');
  assert.match(script, /process\.env\['LIBCLANG_PATH'\] = /);
  assert.match(script, /process\.env\['CLANG_PATH'\] = /);
  assert.deepEqual([...LLVM_BY_HAND], ['LIBCLANG_PATH', 'CLANG_PATH', 'LLVM_CONFIG_PATH', 'BINDGEN_EXTRA_CLANG_ARGS']);
  const byHand = /const BY_HAND = (\/.*\/);/.exec(script)?.[1] ?? '';
  for (const name of [...LLVM_BY_HAND, 'BINDGEN_EXTRA_CLANG_ARGS_x86_64-unknown-linux-gnu']) {
    assert.ok(new RegExp(byHand.slice(1, -1)).test(name), `${name} given by hand is not a diagnosis`);
  }
});
