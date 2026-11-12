// L-2: the tracked package of each binding. It is thin: a Cargo manifest, an entry file that includes the generated
// source of `generated/`, and the language's own package manifest. binding writes these files (`binding scaffold`) and
// `binding check` compares them with what binding would write, so a repository builds its core without the generator
// and only the binding crates need `make bindings`. They depend on nothing but the library name, the targets and the
// core version, so a contract that the generator cannot generate yet still has them.

import type { Contract } from '../contract.ts';
import { type Files, GENERATED_LINTS, header } from './text.ts';

// Before its first release, binding is a Git dependency; the repository's Cargo.lock pins the commit.
const BINDING_CORE = 'polyspec-binding-core = { git = "https://github.com/polyspec/binding.git", branch = "v1/rust-core" }';

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

function foreignCrates(contract: Contract, dependencies: CoreDependencies): string[] {
  return namedLibraries(contract).map((library) => {
    const crate = `polyspec-${library}`;
    const spec = dependencies.get(crate);
    if (spec === undefined) throw new Error(`${contract.core.path}/Cargo.toml does not depend on ${crate}, whose types the contract names (T-3)`);
    return `${crate} = ${tomlValue(spec)}`;
  });
}

function manifest(contract: Contract, version: string, suffix: string, lib: string, dependencies: string[], extra = '', crate = { type: 'cdylib', core: '../rust' }): string {
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
crate-type = ["${crate.type}"]

[features]
panic-test = []

[dependencies]
${contract.core.crate} = { path = "${crate.core}" }
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

export const place = (contract: Contract, path: string): string => path.replace(/^packages\//, `${componentBase(contract)}/`);

export function placed(contract: Contract, files: Files): Files {
  return new Map([...files].map(([path, text]) => [place(contract, path), text]));
}

export const extensionName = (contract: Contract): string => `polyspec_${contract.library.replaceAll('-', '_')}`;

export function trackedPackages(contract: Contract, version: string, coreDependencies: CoreDependencies = new Map()): Files {
  const files: Files = new Map();
  const foreign = foreignCrates(contract, coreDependencies);
  if (contract.targets.includes('python')) {
    const python = contract.packages['python'] as { package: string; module: string };
    files.set('packages/python/Cargo.toml', manifest(contract, version, 'python', '_native', [...foreign, 'pyo3 = { version = "=0.30.1", features = ["abi3-py314", "extension-module"] }']));
    files.set('packages/python/src/lib.rs', entry(`The native module ${python.module}._native.`, [MANY]));
    files.set('packages/python/pyproject.toml', `${header('#')}
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
      ...foreign,
      'napi = { version = "=3.16.2", default-features = false, features = ["napi8"] }',
      'napi-derive = "=3.7.1"',
    ], '\nbuild = "build.rs"').replace('\n[dependencies]', '\n[build-dependencies]\nnapi-build = "=2.6.0"\n\n[dependencies]'));
    files.set('packages/ts/build.rs', `${header('//')}\n// napi-build links the addon against the symbols that Node provides at load time.\n\nfn main() {\n    napi_build::setup();\n}\n`);
    files.set('packages/ts/src/lib.rs', entry(`The Node addon of ${npm}.`, [MANY, ['unsafe_code', 'napi: a value is cast to its type after its type was checked']]));
  }
  if (contract.targets.includes('node') || contract.targets.includes('wasm')) files.set('packages/ts/package.json', npmManifest(contract, version));
  if (contract.targets.includes('wasm')) {
    // L-1, P-5: the WASM crate is packages/ts/wasm in the npm package of Node; wasm-bindgen writes its module and glue
    // into packages/ts/wasm/generated beside the generated entry.
    files.set('packages/ts/wasm/Cargo.toml', manifest(contract, version, 'wasm', `${extensionName(contract)}_wasm`, [
      `wasm-bindgen = "=${WASM_BINDGEN}"`,
      'js-sys = "=0.3.107"',
    ], '', { type: 'cdylib', core: '../../rust' }));
    files.set('packages/ts/wasm/src/lib.rs', entry(`The WebAssembly module of ${(contract.packages['node'] as { package: string }).package}.`, [MANY]));
  }
  if (contract.targets.includes('php')) {
    const php = contract.packages['php'] as { package: string };
    files.set('packages/php-ext/Cargo.toml', manifest(contract, version, 'php-ext', extensionName(contract), [...foreign, 'ext-php-rs = "=0.16.4"']));
    files.set('packages/php-ext/src/lib.rs', entry(`The PHP extension ${extensionName(contract)}.`, [
      ['non_snake_case', 'G-7: a parameter is named as the PHP named argument, in camelCase'],
      MANY,
      ['unsafe_code', "B-4: the base classes are found in the engine's class table at module startup"],
    ]));
    files.set('packages/php-ext/composer.json', `${JSON.stringify({
      name: php.package,
      description: `The ${contract.library} library of polyspec as a PHP extension`,
      type: 'php-ext',
      license: 'MIT',
      require: { php: '>=8.4' },
      'php-ext': { 'extension-name': extensionName(contract) },
    }, null, 2)}\n`);
  }
  if (contract.targets.includes('go')) {
    const module = (contract.packages['go'] as { module: string }).module;
    // L-1, P-2: the Go module is packages/go; the C ABI crate of the Go binding is packages/go/internal/ffi, a folder
    // without Go files, so Go sees no package there, and inside internal, so no contract module takes its place (CK-14).
    files.set('packages/go/go.mod', `${header('//')}\nmodule ${module}\n\ngo ${GO_VERSION}\n`);
    files.set('packages/go/internal/ffi/Cargo.toml', manifest(contract, version, 'go', `${extensionName(contract)}_go`, [], '', { type: 'staticlib', core: '../../../rust' }));
    files.set('packages/go/internal/ffi/src/lib.rs', entry(`The C ABI of the Go binding of ${contract.library}, a static library that the Go package links (B-8).`, [
      ['unsafe_code', 'B-8: the C ABI reads the argument buffer and writes the result buffer through raw pointers'],
    ]));
  }
  return placed(contract, files);
}

// The release of wasm-bindgen: the crate and the wasm-bindgen CLI that writes the glue are the same release.
export const WASM_BINDGEN = '0.2.130';

// The manifest of the npm package (P-5): the Node addon at its entries, and the WASM module at the subpath ./wasm and
// at each entry whose conditions choose it in the browser.
function npmManifest(contract: Contract, version: string): string {
  const npm = contract.packages['node'] as { package: string; entries: Record<string, { conditions?: unknown }> };
  const node = contract.targets.includes('node');
  const wasm = contract.targets.includes('wasm');
  const browser = { types: './wasm/generated/index.d.ts', default: './wasm/generated/index.mjs' };
  const exports: Record<string, unknown> = {};
  if (node) {
    exports['.'] = {
      ...(wasm && npm.entries['.']?.conditions !== undefined ? { browser } : {}),
      types: './generated/index.d.ts',
      import: './generated/index.mjs',
      require: './generated/index.cjs',
    };
  }
  if (wasm) exports['./wasm'] = browser;
  return `${JSON.stringify({
    name: npm.package,
    version,
    description: `The ${contract.library} library of polyspec for ${[node ? 'Node' : '', wasm ? 'the browser' : ''].filter((x) => x !== '').join(' and ')}`,
    license: 'MIT',
    ...(node ? { main: './generated/index.cjs', types: './generated/index.d.ts' } : {}),
    exports,
    files: [
      ...(node ? ['generated/index.cjs', 'generated/index.mjs', 'generated/index.d.ts', 'generated/*.node'] : []),
      ...(wasm ? ['wasm/generated/*.mjs', 'wasm/generated/*.js', 'wasm/generated/*.d.ts', 'wasm/generated/*.wasm'] : []),
    ],
  }, null, 2)}\n`;
}

// The Go release of the go directive of the Go module, the release that every polyspec Go module pins.
export const GO_VERSION = '1.27.3';
