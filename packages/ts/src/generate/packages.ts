// L-2: the tracked package of each binding. It is thin: a Cargo manifest, an entry file that includes the generated
// source of `generated/`, and the language's own package manifest. bindgen writes these files (`bindgen scaffold`) and
// `bindgen check` compares them with what bindgen would write, so a repository builds its core without the generator
// and only the binding crates need `make bindings`. They depend on nothing but the library name, the targets and the
// core version, so a contract that the generator cannot generate yet still has them.

import type { Contract } from '../contract.ts';
import { type Files, GENERATED_LINTS, header } from './text.ts';

// Before its first release, bindgen is a Git dependency; the repository's Cargo.lock pins the commit.
const BINDGEN_CORE = 'polyspec-bindgen-core = { git = "https://github.com/polyspec/bindgen.git", branch = "v1/rust-core" }';

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

function manifest(contract: Contract, version: string, suffix: string, lib: string, dependencies: string[], extra = ''): string {
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
${contract.core.crate} = { path = "../rust" }
${BINDGEN_CORE}
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

export function trackedPackages(contract: Contract, version: string): Files {
  const files: Files = new Map();
  if (contract.targets.includes('python')) {
    const python = contract.packages['python'] as { package: string; module: string };
    files.set('packages/python/Cargo.toml', manifest(contract, version, 'python', '_native', ['pyo3 = { version = "=0.30.1", features = ["abi3-py314", "extension-module"] }']));
    files.set('packages/python/src/lib.rs', entry(`The native module ${python.module}._native.`, [MANY]));
    files.set('packages/python/pyproject.toml', `${header('#')}
[build-system]
requires = ["maturin>=1.16,<2"]
build-backend = "maturin"

[project]
name = ${JSON.stringify(python.package)}
version = ${JSON.stringify(version)}
requires-python = ">=3.14"

[tool.maturin]
module-name = ${JSON.stringify(`${python.module}._native`)}
python-source = "generated/python"
`);
  }
  if (contract.targets.includes('node')) {
    const npm = (contract.packages['node'] as { package: string }).package;
    files.set('packages/ts/Cargo.toml', manifest(contract, version, 'node', `polyspec_${contract.library.replaceAll('-', '_')}_node`, [
      'napi = { version = "=3.16.2", default-features = false, features = ["napi8"] }',
      'napi-derive = "=3.7.1"',
    ], '\nbuild = "build.rs"').replace('\n[dependencies]', '\n[build-dependencies]\nnapi-build = "=2.6.0"\n\n[dependencies]'));
    files.set('packages/ts/build.rs', `${header('//')}\n// napi-build links the addon against the symbols that Node provides at load time.\n\nfn main() {\n    napi_build::setup();\n}\n`);
    files.set('packages/ts/src/lib.rs', entry(`The Node addon of ${npm}.`, [MANY, ['unsafe_code', 'napi: a value is cast to its type after its type was checked']]));
    files.set('packages/ts/package.json', `${JSON.stringify({
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
    files.set('packages/php-ext/Cargo.toml', manifest(contract, version, 'php-ext', extensionName(contract), ['ext-php-rs = "=0.16.4"']));
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
  return placed(contract, files);
}
