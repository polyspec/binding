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

// I-1: a target with a row in core.features builds the core with those features only.
function coreFeatures(contract: Contract, suffix: string): string {
  const lang = ({ python: 'python', node: 'node', 'php-ext': 'php', go: 'go', wasm: 'wasm' } as const)[suffix as 'python' | 'node' | 'php-ext' | 'go' | 'wasm'];
  const features = contract.core.features?.[lang];
  return features === undefined ? '' : `, default-features = false, features = [${features.map((f) => JSON.stringify(f)).join(', ')}]`;
}

// GN-5: the test features of a binding crate beside panic-test. fault-test turns on the feature of the core whose
// fault injection points the contract names (G-5); codec-test adds the entry points that run the in function of a
// value alias with in_raises alone (U-7). Go and WASM have neither yet.
function testFeatures(contract: Contract, suffix: string): string {
  if (suffix === 'go' || suffix === 'wasm') return '';
  const faults = (contract.faults ?? []).length > 0 ? `fault-test = ["${contract.core.crate}/fault-test"]\n` : '';
  const codec = contract.units.some((unit) => (unit.in_raises ?? []).length > 0) ? 'codec-test = []\n' : '';
  return `${faults}${codec}`;
}

// crate: the crate type and the path of the core, for a binding crate that is not a cdylib beside the core (the Go
// staticlib at packages/go/internal/ffi, the WASM crate at packages/ts/wasm).
function manifest(contract: Contract, version: string, suffix: string, lib: string, dependencies: string[], extra = '', host = false, crate?: { type: string; core: string }): string {
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
crate-type = ["${crate?.type ?? 'cdylib'}"]

[features]
panic-test = []
${testFeatures(contract, suffix)}
[dependencies]
${contract.core.crate} = { path = "${crate?.core ?? (host ? '../../rust' : '../rust')}"${coreFeatures(contract, suffix)} }
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

// L-2a, one form for every host package:
// - Python: the binding crate is native/ of the host package, and the generated Python package is the subpackage
//   <module>._binding in the host's source root src/ (maturin python-source), which binding owns whole; its native
//   module is <module>._binding._native.
// - Node: the binding crate and its generated entry and addon are native/ of the host package, which packs them.
// - PHP: an extension is a Composer package of its own (type php-ext), <host package>-native, at native/ of the host
//   library php/ (the crate and its composer.json), and the host's composer.json requires ext-<extension name>; a
//   host layout has no php-ext/ directory.
export const HOST_PYTHON_SUBPACKAGE = '_binding';

export const place = (contract: Contract, path: string): string => {
  const [, dir, rest] = /^packages\/([a-z-]+)(\/.*)?$/.exec(path) ?? [];
  if (dir === undefined) return path;
  const base = `${componentBase(contract)}/${dir}`;
  const lang = LANG_DIRS[dir];
  if (lang === undefined || !isHost(contract, lang)) return `${base}${rest ?? ''}`;
  if (lang === 'php') return `${componentBase(contract)}/php/native${rest ?? ''}`;
  const sources = '/generated/python/';
  if (lang === 'python' && rest?.startsWith(sources) === true) return `${base}/src/${rest.slice(sources.length)}`;
  return `${base}/native${rest ?? ''}`;
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
    // L-2a: the native module of a host package is in the generated subpackage of its module.
    const nativeModule = isHost(contract, 'python') ? `${python.module}.${HOST_PYTHON_SUBPACKAGE}._native` : `${python.module}._native`;
    files.set('packages/python/src/lib.rs', entry(`The native module ${nativeModule}.`, [MANY]));
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
    languageManifest('node', 'packages/ts/package.json', npmManifest(contract, version));
  }
  if (contract.targets.includes('wasm')) {
    if (!contract.targets.includes('node')) files.set('packages/ts/package.json', npmManifest(contract, version));
    // L-1, P-5: the WASM crate is packages/ts/wasm in the npm package of Node; wasm-bindgen writes its module and glue
    // into packages/ts/wasm/generated beside the generated entry.
    files.set('packages/ts/wasm/Cargo.toml', manifest(contract, version, 'wasm', `${extensionName(contract)}_wasm`, [
      `wasm-bindgen = "=${WASM_BINDGEN}"`,
      'js-sys = "=0.3.107"',
    ], '', false, { type: 'cdylib', core: '../../rust' }));
    files.set('packages/ts/wasm/src/lib.rs', entry(`The WebAssembly module of ${(contract.packages['node'] as { package: string }).package}.`, [MANY]));
  }
  if (contract.targets.includes('php')) {
    const php = contract.packages['php'] as { package: string };
    files.set('packages/php-ext/Cargo.toml', manifest(contract, version, 'php-ext', extensionName(contract), [...foreignOf('php'), 'ext-php-rs = "=0.16.4"'], '', isHost(contract, 'php')));
    files.set('packages/php-ext/src/lib.rs', entry(`The PHP extension ${extensionName(contract)}.`, [
      ['non_snake_case', 'G-7: a parameter is named as the PHP named argument, in camelCase'],
      MANY,
      ['unsafe_code', "B-4: the base classes are found in the engine's class table at module startup"],
    ]));
    files.set('packages/php-ext/composer.json', `${JSON.stringify({
      // L-2a: the extension of a host package is the package <host package>-native.
      name: isHost(contract, 'php') ? `${php.package}-native` : php.package,
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
    files.set('packages/go/internal/ffi/Cargo.toml', manifest(contract, version, 'go', `${extensionName(contract)}_go`, [], '', false, { type: 'staticlib', core: '../../../rust' })
      // GW-4, T-2: the test entry points that give back a value through the conversions, for the round-trip tests.
      .replace('panic-test = []\n', 'panic-test = []\ncodec-test = []\n'));
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
      ...(node ? ['generated/index.cjs', 'generated/index.mjs', 'generated/index.d.ts'] : []),
      ...(wasm ? ['wasm/generated/*.mjs', 'wasm/generated/*.js', 'wasm/generated/*.d.ts', 'wasm/generated/*.wasm'] : []),
    ],
    ...(node ? { optionalDependencies: Object.fromEntries(NODE_PLATFORMS.map((p) => [platformPackage(npm.package, p.name), version])) } : {}),
  }, null, 2)}\n`;
}

// T-2: the platforms of a release, as napi-rs names them, and the npm package of each that holds the Node addon. The
// npm package of a library (or its host package, L-2a) holds no addon; it names these packages in
// optionalDependencies at its own version, and npm installs the one of the machine's platform.
export const NODE_PLATFORMS = [
  { name: 'linux-x64-gnu', os: 'linux', cpu: 'x64', libc: 'glibc' },
  { name: 'linux-arm64-gnu', os: 'linux', cpu: 'arm64', libc: 'glibc' },
  { name: 'darwin-arm64', os: 'darwin', cpu: 'arm64' },
] as const;

export const platformPackage = (npm: string, platform: string): string => `${npm}-${platform}`;

// The Go release of the go directive of the Go module, the release that every polyspec Go module pins.
export const GO_VERSION = '1.27.3';

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
    const path = `${componentBase(contract)}/python/pyproject.toml`;
    out.push({ path, item: 'build-system.build-backend', want: 'maturin', found: (t) => toml(t)['build-system']?.['build-backend'] });
    out.push({ path, item: 'tool.maturin.manifest-path', want: 'native/Cargo.toml', found: (t) => toml(t)['tool']?.['maturin']?.['manifest-path'] });
    out.push({ path, item: 'tool.maturin.python-source', want: 'src', found: (t) => toml(t)['tool']?.['maturin']?.['python-source'] });
    out.push({
      path, item: 'tool.maturin.module-name', want: `${python.module}.${HOST_PYTHON_SUBPACKAGE}._native`,
      found: (t) => toml(t)['tool']?.['maturin']?.['module-name'],
    });
  }
  if (contract.targets.includes('node') && isHost(contract, 'node')) {
    const npm = (contract.packages['node'] as { package: string }).package;
    const path = `${componentBase(contract)}/ts/package.json`;
    out.push({ path, item: 'name', want: npm, found: (t) => json(t)['name'] });
    // The generated entry, its declarations and the addon (<name>.<platform>-<arch>[-gnu].node) are in the package.
    for (const platform of NODE_PLATFORMS) {
      const dependency = platformPackage(npm, platform.name);
      out.push({
        path, item: `optionalDependencies.${dependency}`, want: 'the version of the package',
        found: (t) => (json(t)['optionalDependencies']?.[dependency] === json(t)['version'] ? 'the version of the package' : json(t)['optionalDependencies']?.[dependency]),
      });
    }
    for (const file of ['native/generated/index.cjs', 'native/generated/index.mjs', 'native/generated/index.d.ts']) {
      out.push({ path, item: `files (${file})`, want: file, found: (t) => ((json(t)['files'] ?? []) as string[]).find((f) => f === file) });
    }
  }
  if (contract.targets.includes('php') && isHost(contract, 'php')) {
    const path = `${componentBase(contract)}/php/composer.json`;
    const extension = `ext-${extensionName(contract)}`;
    out.push({ path, item: `require.${extension}`, want: '*', found: (t) => json(t)['require']?.[extension] });
  }
  return out;
}
