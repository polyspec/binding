// Name conversion of design N-2: a name is a list of words, and each language has one rule per kind of symbol.

import type { Lang, Name, Word } from './contract.ts';

export type Role = 'class' | 'callable' | 'variable' | 'constant';

const text = (word: Word): string => (typeof word === 'string' ? word : word.acronym);
const isAcronym = (word: Word): boolean => typeof word !== 'string';
const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

// PascalCase. allCaps: an acronym is written in capitals (Go, Python classes, PEP 8); otherwise it is one word with a
// capital first letter (PHP, Node).
function pascal(name: Name, allCaps: boolean): string {
  return name.map((word) => (allCaps && isAcronym(word) ? text(word).toUpperCase() : capital(text(word)))).join('');
}

function camel(name: Name): string {
  const [first, ...rest] = name;
  if (first === undefined) return '';
  return text(first) + rest.map((word) => capital(text(word))).join('');
}

function snake(name: Name): string {
  return name.map(text).join('_');
}

// The name of a symbol in a language. role: 'class' for units, 'callable' for functions, methods and properties,
// 'variable' for parameters and record fields.
export function convert(name: Name, lang: Lang | 'rust', role: Role): string {
  // A constant is UPPER_SNAKE_CASE in PHP (PSR-1), Python (PEP 8), JavaScript and Rust, and PascalCase in Go.
  if (role === 'constant') return lang === 'go' ? pascal(name, true) : snake(name).toUpperCase();
  switch (lang) {
    case 'rust':
      return role === 'class' ? pascal(name, false) : snake(name);
    case 'go':
      return pascal(name, true);
    case 'python':
      return role === 'class' ? pascal(name, true) : snake(name);
    case 'php':
    case 'node':
    case 'wasm':
      return role === 'class' ? pascal(name, false) : camel(name);
  }
}

export function sameName(a: Name, b: Name): boolean {
  return a.length === b.length && a.every((word, index) => {
    const other = b[index];
    return other !== undefined && text(word) === text(other) && isAcronym(word) === isAcronym(other);
  });
}

// P-1, E-2: the name of a library as words. A repository name is lower-case words joined by '-'; the words that are
// acronyms (N-2), which a repository name cannot mark, are binding's closed table. The class form of the result is the
// <Library> of P-1 and E-2 in each language: PHP and Node HttpCookie, Python and Go HTTPCookie.
export const LIBRARY_ACRONYMS: ReadonlySet<string> = new Set([
  'api', 'crud', 'csrf', 'css', 'fsm', 'html', 'http', 'id', 'io', 'json', 'orm', 'php', 'sql', 'ui', 'uri', 'url', 'xml',
]);

export const libraryName = (library: string): Name => library.split('-').map((word) => (LIBRARY_ACRONYMS.has(word) ? { acronym: word } : word));
