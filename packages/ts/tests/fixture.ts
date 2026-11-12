// A contract that passes every check, and the contract of a library it depends on. Each test of
// contract-check.test.ts changes one thing in a fresh copy and expects the finding of the check that owns it.

const LANGS = ['php', 'python', 'node', 'go', 'wasm'] as const;
const each = <T>(make: (lang: (typeof LANGS)[number]) => T): Record<string, T> =>
  Object.fromEntries(LANGS.map((lang) => [lang, make(lang)]));

const classes = (base: string): Record<string, string> => ({
  php: `Polyspec\\Sample\\${base}`,
  python: `${base}`,
  node: `${base}`,
  wasm: `${base}`,
});

const STRING: Record<string, string> = { php: 'string', python: 'str', node: 'string', wasm: 'string', go: 'string' };
const INT: Record<string, string> = { php: 'int', python: 'int', node: 'number', wasm: 'number', go: 'int64' };

export function dependency(): any {
  return {
    schema: 'polyspec/interface@1',
    library: 'forms-dep',
    core: { crate: 'polyspec-forms-dep', path: 'packages/rust' },
    targets: ['php', 'python', 'node'],
    packages: {
      php: { package: 'polyspec/forms-dep', namespace: 'Polyspec\\FormsDep' },
      python: { package: 'polyspec-forms-dep', module: 'polyspec_forms_dep' },
      node: { package: '@polyspec/forms-dep', entries: { '.': { formats: ['import'] } } },
    },
    naming: { exceptions: [] },
    types: {},
    errors: {
      classes: Object.fromEntries(
        ['value', 'type', 'io', 'store', 'busy', 'internal'].map((c) => [
          c,
          { php: `Polyspec\\FormsDep\\${c}`, python: c, node: c },
        ]),
      ),
      fixed: [],
      kinds: [{ variant: 'forms_dep::Error::Limit', category: 'value', class: 'dep_error' }],
      binding: [],
      wrapped: [],
    },
    units: [
      {
        id: 'dep_error', name: ['dep', 'error'], module: 'errors', kind: 'error', visibility: 'public',
        origin: 'generated', category: 'value',
        members: [{ id: 'dep_error.field', name: ['field'], kind: 'property', visibility: 'public', returns: 'text' }],
      },
      {
        id: 'dep_reader', name: ['reader'], module: 'reader', kind: 'interface', visibility: 'public',
        origin: 'callback', core: 'forms_dep::Reader', thread: 'any',
        members: [{
          id: 'dep_reader.read', name: ['read'], kind: 'method', visibility: 'public', returns: 'bytes',
          parameters: [{ name: ['part'], type: { unit: 'dep_part' }, required: true }], async_allowed: false,
        }],
      },
      { id: 'dep_part', name: ['part'], module: 'reader', kind: 'record', visibility: 'public', origin: 'generated', fields: [{ name: ['size'], type: 'uint', required: true }] },
      {
        id: 'dep_parser', name: ['parser'], module: 'parser', kind: 'class', visibility: 'public', origin: 'generated',
        members: [],
      },
    ],
    changes: [],
    cases: [],
  };
}

export function contract(): any {
  return {
    schema: 'polyspec/interface@1',
    library: 'sample',
    core: { crate: 'polyspec-sample', path: 'packages/rust' },
    targets: [...LANGS],
    packages: {
      php: { package: 'polyspec/sample', namespace: 'Polyspec\\Sample' },
      python: { package: 'polyspec-sample', module: 'polyspec_sample' },
      node: {
        package: '@polyspec/sample',
        entries: { '.': { conditions: { node: 'napi', browser: 'wasm' }, formats: ['import', 'require'] } },
      },
      go: { module: 'github.com/polyspec/sample/packages/go' },
    },
    naming: {
      exceptions: [
        { lang: 'python', unit: 'session', member: 'session.load', name: 'load_file', reason: 'S1' },
      ],
    },
    types: {},
    errors: {
      classes: {
        value: classes('ValueError'),
        type: classes('TypeError'),
        io: classes('IoError'),
        store: classes('StoreError'),
        busy: classes('BusyError'),
        internal: classes('InternalError'),
      },
      fixed: [
        { lang: 'php', class: 'ArgumentCountError' },
        { lang: 'php', class: 'Error' },
        { lang: 'python', class: 'TypeError' },
        { lang: 'node', class: 'TypeError' },
        { lang: 'wasm', class: 'TypeError' },
      ],
      kinds: [
        { variant: 'sample::Error::TooLarge', category: 'value', class: 'too_large' },
        { variant: 'sample::Error::Store', category: 'store' },
      ],
      binding: [{ kind: 'invalid_number', class: 'form_error' }],
      wrapped: [],
    },
    units: [
      { id: 'form_error', name: ['form', 'error'], module: 'errors', kind: 'error', visibility: 'public', origin: 'generated', category: 'value', members: [] },
      {
        id: 'too_large', name: ['too', 'large'], module: 'errors', kind: 'error', visibility: 'public', origin: 'generated',
        category: 'value', parent: 'form_error', final: true,
        members: [{ id: 'too_large.limit', name: ['limit'], kind: 'property', visibility: 'public', returns: 'uint' }],
      },
      { id: 'store_error', name: ['store', 'failed'], module: 'errors', kind: 'error', visibility: 'public', origin: 'generated', category: 'store', members: [] },
      {
        id: 'value_type', name: ['value', 'type'], module: 'value', kind: 'enum', visibility: 'public', origin: 'generated',
        variants: [{ name: ['list'], value: 'list' }, { name: ['text'], value: 'text' }],
      },
      {
        id: 'value', name: ['value'], module: 'value', kind: 'class', visibility: 'public', origin: 'value',
        members: [
          { id: 'value.new', name: ['new'], kind: 'constructor', visibility: 'public', parameters: [], wait: 'none' },
          { id: 'value.type_of', name: ['type', 'of'], kind: 'method', visibility: 'public', returns: { unit: 'value_type' }, wait: 'none' },
          { id: 'value.items', name: ['items'], kind: 'method', visibility: 'public', returns: { list: { unit: 'value' } }, wait: 'none' },
          { id: 'value.text', name: ['text'], kind: 'property', visibility: 'public', returns: 'text', writable: true },
        ],
        out: [
          { kind: 'text', make: each(() => 'text') },
          { kind: 'list', make: each(() => 'value.new') },
          { kind: 'int', when: { predicate: 'safe_integer', is: true }, make: each(() => 'int') },
          {
            kind: 'int', when: { predicate: 'safe_integer', is: false },
            make: { php: 'int', python: 'bigint', node: 'bigint', wasm: 'bigint', go: 'int' },
          },
        ],
        in: [
          ...LANGS.map((lang) => ({
            [lang]: 'value', by: 'value.type_of',
            cases: [{ is: 'list', kind: 'list', read: 'value.items' }, { is: 'text', kind: 'text', read: 'value.text' }],
          })),
          ...LANGS.map((lang) => ({ [lang]: STRING[lang], cases: [{ kind: 'text', read: 'builtin' }] })),
          ...LANGS.map((lang) => ({ [lang]: INT[lang], cases: [{ kind: 'int', read: 'builtin' }] })),
          { node: 'bigint', cases: [{ kind: 'int', read: 'builtin' }] },
          { wasm: 'bigint', cases: [{ kind: 'int', read: 'builtin' }] },
        ],
      },
      {
        id: 'store', name: ['store'], module: 'session', kind: 'interface', visibility: 'public', origin: 'callback',
        core: 'sample::Store', thread: 'owner',
        members: [{
          id: 'store.read', name: ['read'], kind: 'method', visibility: 'public',
          parameters: [{ name: ['key'], type: 'text', required: true }],
          returns: { optional: 'bytes' }, optional_reason: 'HY-104',
          async_allowed: true, errors: { recognize: [{ unit: 'too_large' }], reason: 'HY-24' },
        }],
      },
      {
        id: 'session_options', name: ['session', 'options'], module: 'session', kind: 'record', visibility: 'public', origin: 'generated',
        fields: [
          { name: [{ acronym: 'csrf' }, 'token'], type: 'bool', default: { literal: true }, default_core: 'sample::CSRF_TOKEN' },
          { name: ['ttl'], type: 'uint', default: { const: 'session.limit' }, default_core: 'sample::LIMIT' },
        ],
      },
      {
        id: 'session', name: ['session'], module: 'session', kind: 'class', visibility: 'public', origin: 'generated',
        core_type: 'sample::Session', cleanup: 'session.close',
        members: [
          {
            id: 'session.new', name: ['new'], kind: 'constructor', visibility: 'public', wait: 'none',
            parameters: [
              { name: ['store'], type: { unit: 'store' }, required: true },
              { name: ['options'], type: { unit: 'session_options' }, required: true },
            ],
            core: { path: 'sample::Session::new' },
          },
          { id: 'session.close', name: ['close'], kind: 'method', visibility: 'public', wait: 'none', core: { path: 'sample::Session::close', receiver: 'self' } },
          {
            id: 'session.load', name: ['load'], kind: 'method', visibility: 'public', wait: 'blocking_io',
            parameters: [{ name: ['file'], type: 'path', required: true }], returns: 'self',
            core: { path: 'sample::Session::load', receiver: '&mut self' },
            only: { targets: ['php', 'python', 'node', 'go'], reason: 'Q-4' },
          },
          { id: 'session.limit', name: ['limit'], kind: 'constant', visibility: 'public', type: 'uint', value: 10, core: 'sample::LIMIT' },
        ],
      },
      {
        id: 'memory_store', name: ['memory', 'store'], module: 'session', kind: 'class', visibility: 'public', origin: 'generated',
        implements: [{ unit: 'store' }],
        members: [{ id: 'memory_store.read', name: ['read'], kind: 'method', visibility: 'public', wait: 'async_driver', returns: { optional: 'bytes' }, optional_reason: 'HY-104' }],
      },
      {
        id: 'forms', name: ['forms'], module: 'forms', kind: 'functions', visibility: 'public', origin: 'generated',
        members: [{
          id: 'forms.parse', name: ['parse'], kind: 'function', visibility: 'public', wait: 'none',
          parameters: [{ name: ['body'], type: 'bytes', required: true }], returns: { map: 'text' },
          raises: ['sample::Error::TooLarge'], core: { path: 'sample::parse' },
        }],
      },
    ],
    changes: [{ id: 'c1', rule: 'P-5', reason: 'T-4: options are a record', symbol: 'Session::open', from: { php: 'Session::open(array $options)' }, to: 'session.new' }],
    cases: [{ member: 'forms.parse', file: 'contracts/forms.json', group: 'parse' }],
  };
}

export const unit = (c: any, id: string): any => c.units.find((u: any) => u.id === id);
export const member = (c: any, id: string): any =>
  c.units.flatMap((u: any) => u.members ?? []).find((m: any) => m.id === id);
export const unitIndex = (c: any, id: string): number => c.units.findIndex((u: any) => u.id === id);
