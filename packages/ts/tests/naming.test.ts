// N-2 conversion against the vectors that bindgen_core's Rust conversion also reads (packages/core/rust/src/naming.rs).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Lang, Word } from '../src/contract.ts';
import { convert, type Role } from '../src/names.ts';

const vectors = JSON.parse(readFileSync(new URL('./vectors/naming.json', import.meta.url), 'utf8')) as [string, Lang | 'rust', Role, string][];

test('the shared naming vectors', () => {
  assert.ok(vectors.length >= 10);
  for (const [text, lang, role, expected] of vectors) {
    const name: Word[] = text.split(' ').map((w) => (w.startsWith('!') ? { acronym: w.slice(1) } : w));
    assert.equal(convert(name, lang, role), expected, `${text} ${lang} ${role}`);
  }
});
