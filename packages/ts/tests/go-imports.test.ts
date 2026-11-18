// Tests of GN-4f: a generated Go test file imports a package exactly when its code tokens use it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goUses } from '../src/generate/tests_go.ts';

test('B2.546: a Go test file uses a package only by a selector in its code, not in a comment or a string (GN-4f)', () => {
  // orm: the comment of foreignRead named a value of a binding.Map, and go vet refused the import of internal/binding
  // in a test file whose code did not use it.
  const named = {
    'a line comment': 'func f() {\n\t// a value of a binding.Map\n}\n',
    'an end-of-line comment': 'func f() {\n\tx := 1 // binding.Map\n\t_ = x\n}\n',
    'a block comment': 'func f() {\n\t/* a value of a\n\tbinding.Map */\n}\n',
    'an interpreted string': 'func f() string {\n\treturn "the \\"binding.Map\\" of a value"\n}\n',
    'a raw string': 'func f() string {\n\treturn `a binding.Map\nof a value`\n}\n',
  };
  for (const [where, text] of Object.entries(named)) assert.equal(goUses(text, 'binding'), false, where);
  assert.equal(goUses('func f() {\n\tm := &binding.Map[any]{}\n\t_ = m\n}\n', 'binding'), true, 'a use in code');
  // The code after a comment, a string or a rune on the same line is read again.
  assert.equal(goUses('func f() {\n\t_ = "//" + string(\'"\'); m := binding.NewCall() /* x */; _ = m\n}\n', 'binding'), true, 'code after a string and a rune');
  // A selector of another name that ends with the name is no use of it.
  assert.equal(goUses('func f() {\n\t_ = mybinding.X\n}\n', 'binding'), false, 'another name');
});
