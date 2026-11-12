// L-2: the tracked package of each binding. It is thin: a Cargo manifest, an entry file that includes the generated
// source of `generated/`, and the language's own package manifest. binding writes these files (`binding scaffold`) and
// `binding check` compares them with what binding would write, so a repository builds its core without the generator
// and only the binding crates need `make bindings`. They depend on nothing but the library name, the targets and the
// core version, so a contract that the generator cannot generate yet still has them.

import type { Contract } from '../contract.ts';
import { type Files, GENERATED_LINTS, header } from './text.ts';

// Before its first release, binding is a Git dependency; the repository's Cargo.lock pins the commit.
// The binding crates make the tokens and handles that only generated code makes (feature construct: Raised, Io).
const BINDING_CORE = 'polyspec-binding-core = { git = "https://github.com/polyspec/binding.git", branch = "v1/rust-core", features = ["construct"] }';

function entry(what: string, allows: [string, string][]): string {
  return `${header('//')}
//! ${what}
//!
//! The source is generated into \`generated/lib.rs\` by \`make bindings\`; this file only includes it, because an included
//! file cannot hold the crate's attributes.
${allows.map(([lint, reason]) => `#![allow(${lint}, reason = ${JSON.stringify(reason)})]`).join('\n')}

include!(concat!(env!("CARGO_MANIFEST_DIR"), "/generated/lib.rs"));
`;
}

// T-3: the crates of the other repositories whose types the contract names, as the core's manifest gives them (the
// binding sits at the same depth as the core, so a relative path means the same place).
export type CoreDependencies = ReadonlyMap<string, unknown>;

const tomlValue = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(', ')}]`;
  return `{ ${Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k} = ${tomlValue(v)}`).join(', ')} }`;
};

export function namedLibraries(contract: Contract): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, key: string): void => {
    if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (typeof value === 'object' && value !== null) for (const [k, v] of Object.entries(value)) walk(v, k);
    else if (key === 'library' && typeof value === 'string' && value !== contract.library) found.add(value);
  };
  walk(contract.units, '');
  walk(contract.types, '');
  return [...found].sort();
}

function foreignCrates(contract: Contract, dependencies: CoreDependencies, host = false): string[] {
  return namedLibraries(contract).map((library) => {
    const crate = `polyspec-${library}`;
    const spec = dependencies.get(crate);
    if (spec === undefined) throw new Error(`${contract.core.path}/Cargo.toml does not depend on ${crate}, whose types the contract names (T-3)`);
    // L-2a: a native crate sits one directory deeper than the core, so a relative path climbs once more.
    const deeper = host && typeof spec === 'object' && spec !== null && typeof (spec as { path?: unknown }).path === 'string' && !(spec as { path: string }).path.startsWith('/')
      ? { ...(spec as Record<string, unknown>), path: `../${(spec as { path: string }).path}` }
      : spec;
    return `${crate} = ${tomlValue(deeper)}`;
  });
}

function manifest(contract: Contract, version: string, suffix: string, lib: string, dependencies: string[], extra = '', host = false): string {
  return `${header('#')}
[package]
name = ${JSON.stringify(`polyspec-${contract.library}-${suffix}`)}
version = ${JSON.stringify(version)}
edition = "2021"
rust-version = "1.99.0"
publish = false${extra}

[lib]
name = ${JSON.stringify(lib)}
path = "src/lib.rs"
crate-type = ["cdylib"]

[features]
panic-test = []

[dependencies]
${contract.core.crate} = { path = "${host ? '../../rust' : '../rust'}" }
${BINDING_CORE}
${dependencies.join('\n')}

${GENERATED_LINTS}`;
}

const MANY = ['clippy::too_many_arguments', 'T-4: a record parameter is one argument per field'] as [string, string];

// L-1: the binding packages sit beside their core: a core at packages/rust has packages/<python|ts|php-ext>, a core at
// packages/<component>/rust has packages/<component>/<python|ts|php-ext>. The writers name the first layout; place maps
// a path to the contract's.
export function componentBase(contract: Contract): string {
  const path = contract.core.path;
  if (!/^packages(\/[a-z0-9][a-z0-9-]*)?\/rust$/.test(path)) throw new Error(`core.path ${path} is neither packages/rust nor packages/<component>/rust (L-1)`);
  return path.slice(0, -'/rust'.length);
}

// L-2a: a language whose package is a host package has its binding crate in native/ of that package.
export const isHost = (contract: Contract, lang: 'php' | 'python' | 'node'): boolean =>
  (contract.packages[lang] as { host?: boolean } | undefined)?.host === true;

const LANG_DIRS: Record<string, 'php' | 'python' | 'node'> = { 'php-ext': 'php', python: 'python', ts: 'node' };

export const place = (contract: Contract, path: string): string => {
  const [, dir, rest] = /^packages\/([a-z-]+)(\/.*)?$/.exec(path) ?? [];
  const lang = dir === undefined ? undefined : LANG_DIRS[dir];
  const native = lang !== undefined && isHost(contract, lang) ? '/native' : '';
  return dir === undefined ? path : `${componentBase(contract)}/${dir}${native}${rest ?? ''}`;
};

export function placed(contract: Contract, files: Files): Files {
  return new Map([...files].map(([path, text]) => [place(contract, path), text]));
}

export const extensionName = (contract: Contract): string => `polyspec_${contract.library.replaceAll('-', '_')}`;

export function trackedPackages(contract: Contract, version: string, coreDependencies: CoreDependencies = new Map()): Files {
  const files: Files = new Map();
  const foreignOf = (lang: 'php' | 'python' | 'node'): string[] => foreignCrates(contract, coreDependencies, isHost(contract, lang));
  // L-2a: a host package's language manifest is the host's, which check only reads (hostRequirements).
  const languageManifest = (lang: 'php' | 'python' | 'node', path: string, text: string): void => {
    if (!isHost(contract, lang)) files.set(path, text);
  };
  if (contract.targets.includes('python')) {
    const python = contract.packages['python'] as { package: string; module: string };
    files.set('packages/python/Cargo.toml', manifest(contract, version, 'python', '_native', [...foreignOf('python'), 'pyo3 = { version = "=0.30.1", features = ["abi3-py314", "extension-module"] }'], '', isHost(contract, 'python')));
    files.set('packages/python/src/lib.rs', entry(`The native module ${python.module}._native.`, [MANY]));
    languageManifest('python', 'packages/python/pyproject.toml', `${header('#')}
[build-system]
requires = ["maturin>=1.16,<2"]
build-backend = "maturin"

[project]
name = ${JSON.stringify(python.package)}
version = ${JSON.stringify(version)}
requires-python = ">=3.14"${namedLibraries(contract).length === 0 ? '' : `
dependencies = [${namedLibraries(contract).map((library) => JSON.stringify(`polyspec-${library}`)).join(', ')}]`}

[tool.maturin]
module-name = ${JSON.stringify(`${python.module}._native`)}
python-source = "generated/python"
`);
  }
  if (contract.targets.includes('node')) {
    const npm = (contract.packages['node'] as { package: string }).package;
    files.set('packages/ts/Cargo.toml', manifest(contract, version, 'node', `polyspec_${contract.library.replaceAll('-', '_')}_node`, [
      ...foreignOf('node'),
      'napi = { version = "=3.16.2", default-features = false, features = ["napi8"] }',
      'napi-derive = "=3.7.1"',
    ], '\nbuild = "build.rs"', isHost(contract, 'node')).replace('\n[dependencies]', '\n[build-dependencies]\nnapi-build = "=2.6.0"\n\n[dependencies]'));
    files.set('packages/ts/build.rs', `${header('//')}\n// napi-build links the addon against the symbols that Node provides at load time.\n\nfn main() {\n    napi_build::setup();\n}\n`);
    files.set('packages/ts/src/lib.rs', entry(`The Node addon of ${npm}.`, [MANY, ['unsafe_code', 'napi: a value is cast to its type after its type was checked']]));
    languageManifest('node', 'packages/ts/package.json', `${JSON.stringify({
      name: npm,
      version,
      description: `The ${contract.library} library of polyspec for Node`,
      license: 'MIT',
      main: './generated/index.cjs',
      types: './generated/index.d.ts',
      exports: { '.': { types: './generated/index.d.ts', import: './generated/index.mjs', require: './generated/index.cjs' } },
      files: ['generated/index.cjs', 'generated/index.mjs', 'generated/index.d.ts', 'generated/*.node'],
    }, null, 2)}\n`);
  }
  if (contract.targets.includes('php')) {
    const php = contract.packages['php'] as { package: string };
    files.set('packages/php-ext/Cargo.toml', manifest(contract, version, 'php-ext', extensionName(contract), [...foreignOf('php'), 'ext-php-rs = "=0.16.4"'], '', isHost(contract, 'php')));
    files.set('packages/php-ext/src/lib.rs', entry(`The PHP extension ${extensionName(contract)}.`, [
      ['non_snake_case', 'G-7: a parameter is named as the PHP named argument, in camelCase'],
      MANY,
      ['unsafe_code', "B-4: the base classes are found in the engine's class table at module startup"],
    ]));
    languageManifest('php', 'packages/php-ext/composer.json', `${JSON.stringify({
      name: php.package,
      description: `The ${contract.library} library of polyspec as a PHP extension`,
      type: 'php-ext',
      license: 'MIT',
      require: { php: '>=8.4' },
      'php-ext': { 'extension-name': extensionName(contract) },
    }, null, 2)}\n`);
  }
  return placed(contract, files);
}

// L-2a: what a host package's hand-written manifest must say for its native module, checked by binding check (CK-19):
// the path of the manifest, the item and the value it must have.
export interface HostRequirement {
  path: string;
  item: string;
  want: string;
  found: (manifest: string) => unknown;
}

export function hostRequirements(contract: Contract, parseToml: (text: string) => unknown): HostRequirement[] {
  const out: HostRequirement[] = [];
  const toml = (text: string): Record<string, any> => parseToml(text) as Record<string, any>;
  const json = (text: string): Record<string, any> => JSON.parse(text) as Record<string, any>;
  if (contract.targets.includes('python') && isHost(contract, 'python')) {
    const python = contract.packages['python'] as { module: string };
    const path = place(contract, 'packages/python/pyproject.toml').replace('/native/', '/');
    out.push({ path, item: 'build-system.build-backend', want: 'maturin', found: (t) => toml(t)['build-system']?.['build-backend'] });
    out.push({ path, item: 'tool.maturin.module-name', want: `${python.module}._native`, found: (t) => toml(t)['tool']?.['maturin']?.['module-name'] });
    out.push({ path, item: 'tool.maturin.manifest-path', want: 'native/Cargo.toml', found: (t) => toml(t)['tool']?.['maturin']?.['manifest-path'] });
  }
  if (contract.targets.includes('node') && isHost(contract, 'node')) {
    const npm = (contract.packages['node'] as { package: string }).package;
    const path = place(contract, 'packages/ts/package.json').replace('/native/', '/');
    out.push({ path, item: 'name', want: npm, found: (t) => json(t)['name'] });
    // The addon file, <name>.<platform>-<arch>[-gnu].node in native/generated, is in the package.
    out.push({
      path, item: 'files (the addon)', want: 'native/generated/*.node',
      found: (t) => ((json(t)['files'] ?? []) as string[]).find((f) => f === 'native/generated/*.node'),
    });
  }
  if (contract.targets.includes('php') && isHost(contract, 'php')) {
    const path = place(contract, 'packages/php-ext/composer.json').replace('/native/', '/');
    out.push({ path, item: 'php-ext.extension-name', want: extensionName(contract), found: (t) => json(t)['php-ext']?.['extension-name'] });
  }
  return out;
}
