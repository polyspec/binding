// L-2: the tracked package of each binding. It is thin: a Cargo manifest, an entry file that includes the generated
// source of `generated/`, and the language's own package manifest. binding writes these files (`binding scaffold`) and
// `binding check` compares them with what binding would write, so a repository builds its core without the generator
// and only the binding crates need `make bindings`. They depend on nothing but the library name, the targets and the
// core version, so a contract that the generator cannot generate yet still has them.

import { posix } from 'node:path';
import type { Contract } from '../contract.ts';
import { type Files, header } from './text.ts';
import { holdsFunction, nativeRoundTrip, Unsupported } from './model.ts';

// GN-3e: the dependency line of a binding crate on polyspec-binding-core follows the line of the core on it: its source
// (git with branch or tag, version, or path, which climbs depth directories more to the place of the binding crate),
// and none that binding pins. Only a core without the line gets the development line of binding, which the check of a
// release reports (CK-70).
// The binding crates make the tokens and handles that only generated code makes (feature construct: Raised, Io).
// Every binding crate holds the core value of a class unit in the locks of the feature lock (GN-6h, GN-18a).
// GN-6n: the binding crate of a target that has a member with wait async_driver turns on the driver of binding_core,
// but WASM, whose futures the event loop of JavaScript polls (wasm-bindgen-futures) and which has no tokio runtime.
export const BINDING_CORE = 'polyspec-binding-core';
const BINDING_DEVELOPMENT = { git: 'https://github.com/polyspec/binding.git', branch: 'v1/rust-core' };
const SOURCE_KEYS = ['git', 'branch', 'tag', 'rev', 'version', 'path', 'registry'];
function bindingCore(spec: unknown, depth: number, driver: boolean): string {
  const fields = spec === undefined ? BINDING_DEVELOPMENT : typeof spec === 'object' && spec !== null ? spec as Record<string, unknown> : { version: spec };
  const source = Object.entries(fields).filter(([key]) => SOURCE_KEYS.includes(key)).map(([key, value]): [string, unknown] =>
    [key, key === 'path' && typeof value === 'string' && !value.startsWith('/') ? `${'../'.repeat(depth)}${value}` : value]);
  return `${BINDING_CORE} = ${tomlValue({ ...Object.fromEntries(source), features: ['construct', 'lock', ...(driver ? ['driver'] : [])] })}`;
}

// GN-6n: whether the crate of a target, named by its suffix, has a member with wait async_driver.
const SUFFIX_TARGET: Record<string, string> = { python: 'python', node: 'node', wasm: 'wasm', 'php-ext': 'php', go: 'go' };
export const drives = (contract: Contract, suffix: string): boolean =>
  contract.units.some((unit) => (unit.members ?? []).some((member) => {
    const only = member.only ?? unit.only;
    return member.wait === 'async_driver' && (only === undefined || only.targets.includes((SUFFIX_TARGET[suffix] ?? suffix) as (typeof only.targets)[number]));
  }));

// GN-3a: an allow attribute in a form that rustfmt keeps with its defaults and with the settings of a repository
// (use_small_heuristics = "Max", a wider max_width): on one line of at most 80 columns, which is narrower than the
// width of a function-like attribute of either. A reason that does not fit is the comment above the attribute, which
// then names its rule id alone.
function allow(lint: string, reason: string): string {
  const whole = `#![allow(${lint}, reason = ${JSON.stringify(reason)})]`;
  if (whole.length <= 80) return whole;
  const id = /^[A-Za-z]+-[0-9]+[a-z]?/.exec(reason)?.[0];
  if (id === undefined) throw new Error(`internal: the reason of ${lint} names no rule id: ${reason}`);
  return `// ${reason}\n#![allow(${lint}, reason = ${JSON.stringify(id)})]`;
}

function entry(what: string, allows: [string, string][]): string {
  return `${header('//')}
//! ${what}
//!
//! The source is generated into \`generated/lib.rs\` by \`make bindings\`; this file only includes it, because an included
//! file cannot hold the crate's attributes.
${allows.map(([lint, reason]) => allow(lint, reason)).join('\n')}

include!(concat!(env!("CARGO_MANIFEST_DIR"), "/generated/lib.rs"));
`;
}

// GN-3e: the reason that a tracked package is not written, which a contract or a manifest gives. scaffold names the
// package with it and writes the others, and check reports it (CK-19).
export class Refused extends Error {}

// GN-3e: the form of the dependency line of the core on another polyspec library. A line with the version =X.Y.Z or
// the tag vX.Y.Z and no branch or commit is the release form, whose version a manifest names; every other line is a
// development form, which named says in the words of a finding (CK-70). path is the path of a path dependency.
export function dependencyForm(spec: unknown): { version?: string; path?: string; named: string } {
  const fields = typeof spec === 'object' && spec !== null ? spec as { path?: unknown; version?: unknown; tag?: unknown; branch?: unknown; rev?: unknown; git?: unknown } : { version: spec };
  if (typeof fields.path === 'string') return { path: fields.path, named: `the path ${fields.path}` };
  if (typeof fields.branch === 'string') return { named: `the branch ${fields.branch}` };
  if (typeof fields.rev === 'string') return { named: `the commit ${fields.rev}` };
  const exact = typeof fields.version === 'string' ? /^=(\d+\.\d+\.\d+)$/.exec(fields.version)?.[1] : undefined;
  const tag = typeof fields.tag === 'string' ? /^v(\d+\.\d+\.\d+)$/.exec(fields.tag)?.[1] : undefined;
  const version = exact ?? tag;
  if (version !== undefined) return { version, named: `the version ${version}` };
  if (typeof fields.tag === 'string') return { named: `the tag ${fields.tag}` };
  if (typeof fields.version === 'string') return { named: `the version range ${fields.version}` };
  return { named: typeof fields.git === 'string' ? `the default branch of ${fields.git}` : 'no version' };
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

// T-3: the dependency lines of the cores of the libraries whose types the contract names, as the core names them.
// depth counts the directories that the binding crate sits below the level of the core: a relative path climbs as many
// more (L-2a: a native crate one; the WASM crate packages/ts/wasm one, two in native; the Go crate packages/go/internal/
// ffi two).
// G-5: also the cores of the other libraries whose fault injection points a case arms (armed), whose feature fault-test
// the binding crate turns on.
function foreignCrates(contract: Contract, dependencies: CoreDependencies, depth: number, armed: string[]): string[] {
  return [...new Set([...namedLibraries(contract), ...armed])].sort().map((library) => {
    const crate = `polyspec-${library}`;
    const spec = dependencies.get(crate);
    if (spec === undefined) throw new Refused(`${contract.core.path}/Cargo.toml does not depend on ${crate}, whose types the contract names or whose fault injection points a case arms (T-3, G-5)`);
    const deeper = depth > 0 && typeof spec === 'object' && spec !== null && typeof (spec as { path?: unknown }).path === 'string' && !(spec as { path: string }).path.startsWith('/')
      ? { ...(spec as Record<string, unknown>), path: `${'../'.repeat(depth)}${(spec as { path: string }).path}` }
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

// GN-5: the test features of a binding crate beside panic-test. fault-test turns on the feature fault-test of the core
// when the contract names fault injection points, and of each core of another library whose points a case arms (G-5);
// codec-test adds the entry points that run the in function of a
// value alias with in_raises alone (U-7); the Go crate has it always, for its round-trip entry points (GW-4, T-2).
function testFeatures(contract: Contract, suffix: string, armed: string[]): string {
  const cores = [...((contract.faults ?? []).length > 0 ? [contract.core.crate] : []), ...armed.map((library) => `polyspec-${library}`)];
  const faults = cores.length > 0 ? `fault-test = [${cores.map((crate) => JSON.stringify(`${crate}/fault-test`)).join(', ')}]\n` : '';
  const codec = suffix === 'go' || contract.units.some((unit) => (unit.in_raises ?? []).length > 0) ? 'codec-test = []\n' : '';
  // U-3, GN-6z: thread-test adds the entry point that calls a function of the language on another thread, in a target
  // that holds a function on its owner thread.
  const owned = suffix === 'node' || suffix === 'php-ext';
  const thread = owned && contract.units.some((unit) => (unit.members ?? []).some((member) => (member.parameters ?? []).some((p) => holdsFunction(p.type)))) ? 'thread-test = []\n' : '';
  // GN-6u: native-count-test adds the entry point that counts the Natives that the binding holds, in a target that
  // gives a Native back through a round trip.
  const lang = ({ node: 'node', 'php-ext': 'php', wasm: 'wasm', go: 'go' } as const)[suffix as 'node' | 'php-ext' | 'wasm' | 'go'];
  const count = lang !== undefined && nativeRoundTrip(contract, lang) !== undefined ? 'native-count-test = []\n' : '';
  return `${faults}${codec}${thread}${count}`;
}

// crate: the crate type and the path of the core, for a binding crate that is not a cdylib beside the core (the Go
// staticlib at packages/go/internal/ffi, the WASM crate at packages/ts/wasm). libExtra: lines of [lib] after its type.
// GN-3f: the version and the licence of the core, which the manifests of its binding packages carry.
interface Core {
  version: string;
  license: string | undefined;
  // GN-3e: the dependency line of the core on polyspec-binding-core, which the binding crates follow.
  binding: unknown;
}

function manifest(contract: Contract, core: Core, armed: string[], suffix: string, lib: string, dependencies: string[], extra = '', host = false, crate?: { type: string; core: string }, libExtra = ''): string {
  const corePath = crate?.core ?? (host ? '../../rust' : '../rust');
  return `${header('#')}
[package]
name = ${JSON.stringify(`polyspec-${contract.library}-${suffix}`)}
version = ${JSON.stringify(core.version)}
edition = "2021"
rust-version = "1.99.0"${core.license === undefined ? '' : `\nlicense = ${JSON.stringify(core.license)}`}
publish = false${extra}

[lib]
name = ${JSON.stringify(lib)}
path = "src/lib.rs"
crate-type = ["${crate?.type ?? 'cdylib'}"]${libExtra}

[features]
panic-test = []
${testFeatures(contract, suffix, armed)}
[dependencies]
${contract.core.crate} = { path = "${corePath}"${coreFeatures(contract, suffix)} }
${bindingCore(core.binding, corePath.split('../').length - 2, suffix !== 'wasm' && drives(contract, suffix))}
${dependencies.join('\n')}

[lints]
workspace = true
`;
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

// G-5: a library in a point name is in snake_case, as the library name of its crate is (pointLibrary of check.ts).
const pointName = (library: string): string => library.replaceAll('-', '_');

// G-5: the other libraries whose points a case arms, by the crates polyspec-<library> that the core depends on.
function armedLibraries(contract: Contract, coreDependencies: CoreDependencies, armedPoints: Iterable<string>): string[] {
  return [...new Set(armedPoints)].filter((prefix) => prefix !== pointName(contract.library)).sort().map((prefix) => {
    const crate = [...coreDependencies.keys()].find((name) => name.startsWith('polyspec-') && pointName(name.slice('polyspec-'.length)) === prefix);
    if (crate === undefined) throw new Refused(`a case arms a fault injection point of ${prefix}, whose crate ${contract.core.path}/Cargo.toml does not depend on (G-5)`);
    return crate.slice('polyspec-'.length);
  });
}

const developmentFinding = (crate: string, named: string): string =>
  `the dependency line of ${crate} names ${named}, a development form, and a release names the version =X.Y.Z or the tag vX.Y.Z (GN-3e)`;

// CK-70: the development forms among the dependency lines of the core on the libraries whose types the contract names
// or whose points a case arms, each a finding of the check of a release (GN-3e). A library that the core does not
// depend on is no finding here: no package is written for it, which CK-19 reports.
export function releaseFindings(contract: Contract, coreDependencies: CoreDependencies, armedPoints: Iterable<string>): string[] {
  let armed: string[] = [];
  try {
    armed = armedLibraries(contract, coreDependencies, armedPoints);
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
  }
  // The line on polyspec-binding-core of the core, when it has one; the lines of the binding crates are read from
  // their tracked manifests (bindingCoreFinding).
  return [BINDING_CORE, ...[...new Set([...namedLibraries(contract), ...armed])].sort().map((library) => `polyspec-${library}`)].flatMap((crate) => {
    if (!coreDependencies.has(crate)) return [];
    const form = dependencyForm(coreDependencies.get(crate));
    return form.version !== undefined ? [] : [developmentFinding(crate, form.named)];
  });
}

// GN-3e: the requirement of pyproject.toml on the Python package of another library: at the version of a release form of
// the dependency line of the core, and the name alone for a development form, which the development install resolves.
function pythonRequirement(library: string, dependencies: CoreDependencies): string {
  const version = dependencyForm(dependencies.get(`polyspec-${library}`)).version;
  return JSON.stringify(`polyspec-${library}${version === undefined ? '' : `==${version}`}`);
}

// CK-70: the finding of the line on polyspec-binding-core of a tracked binding crate, from its manifest as TOML; none
// for a release form and for a manifest without the line.
export function bindingCoreFinding(manifest: unknown): string | undefined {
  const dependencies = (manifest as { dependencies?: Record<string, unknown> } | undefined)?.dependencies ?? {};
  if (!(BINDING_CORE in dependencies)) return undefined;
  const form = dependencyForm(dependencies[BINDING_CORE]);
  return form.version !== undefined ? undefined : developmentFinding(BINDING_CORE, form.named);
}

// What scaffold writes: the tracked files, and each package that it cannot write with its reason (GN-3e).
export interface Tracked {
  files: Files;
  refused: { path: string; message: string }[];
}

// The tracked files alone, for a caller that takes no refused package: a refused package is thrown with its reason.
export function trackedPackages(...inputs: Parameters<typeof trackedResult>): Files {
  const { files, refused } = trackedResult(...inputs);
  if (refused.length > 0) throw new Unsupported(refused.map((r) => `${r.path}: not written: ${r.message}`));
  return files;
}

// armedPoints: the libraries, in the snake_case of a point name, of the fault injection points that the cases arm
// (casePointLibraries).
// foreign: the contracts of the libraries that the contract names, whose records go.mod requires (GN-15f).
// license: the licence of the core, which every manifest with a licence field carries (GN-3f); a core without one gives
// manifests without the field.
export function trackedResult(contract: Contract, version: string, coreDependencies: CoreDependencies = new Map(), armedPoints: Iterable<string> = [], foreign: ReadonlyMap<string, Contract> = new Map(), caseTargets: Iterable<string> = [], license?: string): Tracked {
  const core: Core = { version, license, binding: coreDependencies.get(BINDING_CORE) };
  // GN-13: a target with a case whose value has no form in its language has the feature case-test.
  const caseTest = new Set(caseTargets);
  const files: Files = new Map();
  const refused: Tracked['refused'] = [];
  // GN-3e: a package whose files a reason of the contract or of a manifest refuses is named and none of its files is
  // written; the packages of the other targets are.
  const packageOf = (dir: string, write: () => void): void => {
    const before = new Set(files.keys());
    try {
      write();
    } catch (error) {
      if (!(error instanceof Refused)) throw error;
      for (const path of [...files.keys()]) if (!before.has(path)) files.delete(path);
      refused.push({ path: place(contract, dir), message: error.message });
    }
  };
  let armed: string[];
  try {
    armed = armedLibraries(contract, coreDependencies, armedPoints);
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    // Every binding crate names the features of the armed cores, so none is written.
    return { files, refused: [{ path: componentBase(contract), message: error.message }] };
  }
  const foreignOf = (lang: 'php' | 'python' | 'node'): string[] => foreignCrates(contract, coreDependencies, isHost(contract, lang) ? 1 : 0, armed);
  // L-2a: the WASM crate is wasm/ of the Node package, native/wasm/ of a host Node package.
  const wasmDepth = isHost(contract, 'node') ? 2 : 1;
  // L-2a: a host package's language manifest is the host's, which check only reads (hostRequirements).
  const languageManifest = (lang: 'php' | 'python' | 'node', path: string, text: string): void => {
    if (!isHost(contract, lang)) files.set(path, text);
  };
  if (contract.targets.includes('python')) packageOf('packages/python', () => {
    const python = contract.packages['python'] as { package: string; module: string };
    files.set('packages/python/Cargo.toml', manifest(contract, core, armed, 'python', '_native', [...foreignOf('python'), 'pyo3 = { version = "=0.30.1", features = ["abi3-py314", "extension-module"] }'], '\nbuild = "build.rs"', isHost(contract, 'python')));
    files.set('packages/python/build.rs', PYTHON_BUILD);
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
requires-python = ">=3.14"${license === undefined ? '' : `\nlicense = ${JSON.stringify(license)}`}${namedLibraries(contract).length === 0 ? '' : `
dependencies = [${namedLibraries(contract).map((library) => pythonRequirement(library, coreDependencies)).join(', ')}]`}

[tool.maturin]
module-name = ${JSON.stringify(`${python.module}._native`)}
python-source = "generated/python"
`);
  });
  if (contract.targets.includes('node')) packageOf('packages/ts', () => {
    const npm = (contract.packages['node'] as { package: string }).package;
    files.set('packages/ts/Cargo.toml', manifest(contract, core, armed, 'node', `polyspec_${contract.library.replaceAll('-', '_')}_node`, [
      ...foreignOf('node'),
      // GN-6n: the future of a member with wait async_driver runs on the tokio runtime of napi.
      `napi = { version = "=3.16.2", default-features = false, features = [${['napi8', ...(drives(contract, 'node') ? ['tokio_rt'] : [])].map((f) => JSON.stringify(f)).join(', ')}] }`,
      'napi-derive = "=3.7.1"',
    ], '\nbuild = "build.rs"', isHost(contract, 'node')).replace('\n[dependencies]', '\n[build-dependencies]\nnapi-build = "=2.6.0"\n\n[dependencies]'));
    files.set('packages/ts/build.rs', `${header('//')}\n// napi-build links the addon against the symbols that Node provides at load time.\n\nfn main() {\n    napi_build::setup();\n}\n`);
    files.set('packages/ts/src/lib.rs', entry(`The Node addon of ${npm}.`, [MANY, ['unsafe_code', 'GN-4: napi casts a value to its type after its type was checked']]));
    languageManifest('node', 'packages/ts/package.json', npmManifest(contract, core));
  });
  if (contract.targets.includes('wasm')) packageOf('packages/ts/wasm', () => {
    if (!contract.targets.includes('node')) languageManifest('node', 'packages/ts/package.json', npmManifest(contract, core));
    // L-1, P-5: the WASM crate is packages/ts/wasm in the npm package of Node; wasm-bindgen writes its module and glue
    // into packages/ts/wasm/generated beside the generated entry.
    // T-3: the WASM crate depends on the core of each library whose records the contract names, as Node does.
    files.set('packages/ts/wasm/Cargo.toml', manifest(contract, core, armed, 'wasm', `${extensionName(contract)}_wasm`, [
      ...foreignCrates(contract, coreDependencies, wasmDepth, armed),
      `wasm-bindgen = "=${WASM_BINDGEN}"`,
      'js-sys = "=0.3.107"',
      // GN-6n: the promise of a member with wait async_driver; the release of wasm-bindgen and js-sys above.
      ...(drives(contract, 'wasm') ? ['wasm-bindgen-futures = "=0.4.80"'] : []),
    ], '', false, { type: 'cdylib', core: `${'../'.repeat(wasmDepth + 1)}rust` }));
    files.set('packages/ts/wasm/src/lib.rs', entry(`The WebAssembly module of ${(contract.packages['node'] as { package: string }).package}.`, [MANY]));
  });
  if (contract.targets.includes('php')) packageOf('packages/php-ext', () => {
    const php = contract.packages['php'] as { package: string };
    // BD-9: the extension links on macOS by its build script, and the crate has no Rust test target, whose executable
    // would need the symbols of PHP; the generated tests run in PHP, which loads the extension.
    files.set('packages/php-ext/Cargo.toml', manifest(contract, core, armed, 'php-ext', extensionName(contract), [...foreignOf('php'), 'ext-php-rs = "=0.16.4"'], '\nbuild = "build.rs"', isHost(contract, 'php'), undefined, '\ntest = false\ndoctest = false')
      .replace('panic-test = []\n', caseTest.has('php') ? 'panic-test = []\ncase-test = []\n' : 'panic-test = []\n'));
    files.set('packages/php-ext/build.rs', PHP_BUILD);
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
      ...(license === undefined ? {} : { license }),
      require: { php: '>=8.4' },
      // GN-3c, kit K1189: PIE installs the binary of the release for the PHP and the platform of the machine.
      'php-ext': { 'extension-name': extensionName(contract), 'download-url-method': ['pre-packaged-binary'] },
    }, null, 2)}\n`);
  });
  if (contract.targets.includes('go')) packageOf('packages/go', () => {
    const module = (contract.packages['go'] as { module: string }).module;
    // L-1, P-2: the Go module is packages/go; the C ABI crate of the Go binding is packages/go/internal/ffi, a folder
    // without Go files, so Go sees no package there, and inside internal, so no contract module takes its place (CK-14).
    files.set('packages/go/go.mod', `${header('//')}\nmodule ${module}\n\ngo ${GO_VERSION}\n${goRequires(contract, coreDependencies, foreign)}`);
    files.set('packages/go/internal/ffi/Cargo.toml', manifest(contract, core, armed, 'go', `${extensionName(contract)}_go`, foreignCrates(contract, coreDependencies, 2, armed), '', false, { type: 'staticlib', core: '../../../rust' }));
    files.set('packages/go/internal/ffi/src/lib.rs', entry(`The C ABI of the Go binding of ${contract.library}, a static library that the Go package links (B-8).`, [
      ['unsafe_code', 'B-8: the C ABI reads the argument buffer and writes the result buffer through raw pointers'],
    ]));
  });
  return { files: placed(contract, files), refused };
}

// GN-6u: the build script of the Python binding crate. The generated code reads the cfg pyo3_disable_reference_pool,
// which a build of PyO3 without its reference pool sets for every crate, and rustc refuses a cfg that no crate
// declares (unexpected_cfgs). The crate takes its lints from the workspace, so its manifest cannot declare the cfg.
const PYTHON_BUILD = `${header('//')}
// GN-6u: the generated code refuses a build with the cfg pyo3_disable_reference_pool,
// which this script declares, because rustc refuses a cfg that no crate declares.

fn main() {
    println!("cargo::rustc-check-cfg=cfg(pyo3_disable_reference_pool)");
}
`;

// BD-9: the build script of the PHP binding crate. PHP resolves the symbols of an extension when it loads it, so the
// macOS linker has to leave them undefined (-undefined dynamic_lookup). cargo:rustc-cdylib-link-arg applies to the
// cdylib of this crate alone, so the executables of the other crates still fail on a symbol that does not resolve,
// which RUSTFLAGS or rustflags of .cargo/config.toml would hide; and a build script is read wherever Cargo is started,
// which .cargo/config.toml is not. The OS is CARGO_CFG_TARGET_OS, the target's, because a build script runs on the
// host; without it the script fails (P-3).
const PHP_BUILD = `${header('//')}
// BD-9: PHP resolves the symbols of an extension when it loads it, so on macOS the linker
// leaves them undefined, for the cdylib of this crate alone. The target OS is the one that
// Cargo gives the build script, not the OS of the host.

const TARGET_OS: &str = "CARGO_CFG_TARGET_OS";

fn main() -> Result<(), String> {
    let os = std::env::var(TARGET_OS).map_err(|error| format!("{TARGET_OS}: {error}"))?;
    if os == "macos" {
        println!("cargo:rustc-cdylib-link-arg=-undefined");
        println!("cargo:rustc-cdylib-link-arg=dynamic_lookup");
    }
    Ok(())
}
`;

// The release of wasm-bindgen: the crate and the wasm-bindgen CLI that writes the glue are the same release.
export const WASM_BINDGEN = '0.2.130';

// The manifest of the npm package (P-5): the Node addon at its entries, and the WASM module at the subpath ./wasm and
// at each entry whose conditions choose it in the browser.
function npmManifest(contract: Contract, core: Core): string {
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
    version: core.version,
    description: `The ${contract.library} library of polyspec for ${[node ? 'Node' : '', wasm ? 'the browser' : ''].filter((x) => x !== '').join(' and ')}`,
    ...(core.license === undefined ? {} : { license: core.license }),
    // GN-3c: the only .js files of the package are the glue of wasm-bindgen --target web, an ES module.
    type: 'module',
    ...(node ? { main: './generated/index.cjs', types: './generated/index.d.ts' } : {}),
    exports,
    files: [
      ...(node ? ['generated/index.cjs', 'generated/index.mjs', 'generated/index.d.ts'] : []),
      ...(wasm ? ['wasm/generated/*.mjs', 'wasm/generated/*.js', 'wasm/generated/*.d.ts', 'wasm/generated/*.wasm'] : []),
    ],
    // GN-3c, kit K1189: the napi CLI of a release names the addon <binaryName>.<platform>.node, the file that the entry
    // loads, and builds it for the Rust triples of the platforms.
    ...(node ? { napi: { binaryName: npm.package.slice(npm.package.indexOf('/') + 1), targets: NODE_PLATFORMS.map((p) => p.triple) } } : {}),
  }, null, 2)}\n`;
}

// T-2: the platforms of a release, as napi-rs names them, and the npm package of each that holds the Node addon. The
// npm package of a library (or its host package, L-2a) holds no addon; the release writes these packages into
// optionalDependencies of the manifest it packs, and npm installs the one of the machine's platform (GN-3c).
export const NODE_PLATFORMS = [
  { name: 'linux-x64-gnu', os: 'linux', cpu: 'x64', libc: 'glibc', triple: 'x86_64-unknown-linux-gnu' },
  { name: 'linux-arm64-gnu', os: 'linux', cpu: 'arm64', libc: 'glibc', triple: 'aarch64-unknown-linux-gnu' },
  { name: 'darwin-arm64', os: 'darwin', cpu: 'arm64', triple: 'aarch64-apple-darwin' },
] as const;

// The Go release of the go directive of the Go module, the release that every polyspec Go module pins.
export const GO_VERSION = '1.27.3';

// GN-15f: the libraries of the records and of the value classes (GN-6x) that the contract names, each of whose Go
// module go.mod requires, because the Go binding imports the package of each (B2.87).
function recordLibraries(contract: Contract, foreign: ReadonlyMap<string, Contract>): string[] {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === 'object' && value !== null) {
      const { unit, library } = value as { unit?: unknown; library?: unknown };
      if (typeof unit === 'string' && typeof library === 'string' && library !== contract.library) {
        const owner = foreign.get(library);
        if (owner === undefined) throw new Refused(`${library}: the contract of the library is not found, so binding scaffold cannot tell whether go.mod requires its Go module (GN-15f)`);
        if (owner.units.some((u) => u.id === unit && (u.kind === 'record' || (u.kind === 'class' && u.origin === 'value')))) found.add(library);
      }
      Object.values(value).forEach(walk);
    }
  };
  walk(contract.units);
  walk(contract.types);
  return [...found].sort();
}

// GN-15f: the require lines of go.mod, a Go module of each library whose records or value classes the contract names, at the version of
// the dependency line of the core: an exact version or a tag, a path with v0.0.0 and a replace line to the Go module
// there, or another development form with v0.0.0 alone (GN-3e).
function goRequires(contract: Contract, dependencies: CoreDependencies, foreign: ReadonlyMap<string, Contract>): string {
  const requires: string[] = [];
  const replaces: string[] = [];
  for (const library of recordLibraries(contract, foreign)) {
    const owner = foreign.get(library) as Contract;
    const module = (owner.packages['go'] as { module?: string } | undefined)?.module;
    if (module === undefined) throw new Refused(`${library}: the library has no Go module (packages.go), whose record or value class the Go binding names (GN-15f)`);
    const crate = `polyspec-${library}`;
    const form = dependencyForm(dependencies.get(crate));
    if (form.path !== undefined) {
      const root = posix.normalize(posix.join(contract.core.path, form.path));
      if (!root.endsWith(`/${owner.core.path}`)) throw new Refused(`${crate}: the path ${form.path} of the dependency line of the core is not the core ${owner.core.path} of ${library} (GN-15f)`);
      const target = posix.join(root.slice(0, -owner.core.path.length), componentBase(owner), 'go');
      requires.push(`${module} v0.0.0`);
      replaces.push(`replace ${module} => ${posix.relative(`${componentBase(contract)}/go`, target)}`);
    } else {
      // GN-3e: a release form gives its version; another development form gives v0.0.0, which the development link of
      // the checkout resolves (go.work).
      requires.push(`${module} v${form.version ?? '0.0.0'}`);
    }
  }
  if (requires.length === 0) return '';
  const require = requires.length === 1 ? `require ${requires[0] ?? ''}\n` : `require (\n${requires.map((r) => `\t${r}`).join('\n')}\n)\n`;
  return `\n${require}${replaces.length === 0 ? '' : `\n${replaces.join('\n')}\n`}`;
}

// L-2a: what a host package's hand-written manifest must say for its native module, checked by binding check (CK-19):
// the path of the manifest, the item and the value it must have, compared deeply.
export interface HostRequirement {
  path: string;
  item: string;
  want: unknown;
  found: (manifest: string) => unknown;
}

// license: the licence of the core, which the host's manifest names too (GN-3f); a core without one asks for none, and
// CK-71 reports the core.
export function hostRequirements(contract: Contract, parseToml: (text: string) => unknown, license?: string): HostRequirement[] {
  const out: HostRequirement[] = [];
  const toml = (text: string): Record<string, any> => parseToml(text) as Record<string, any>;
  const json = (text: string): Record<string, any> => JSON.parse(text) as Record<string, any>;
  if (contract.targets.includes('python') && isHost(contract, 'python')) {
    const python = contract.packages['python'] as { module: string };
    const path = `${componentBase(contract)}/python/pyproject.toml`;
    if (license !== undefined) out.push({ path, item: 'project.license', want: license, found: (t) => toml(t)['project']?.['license'] });
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
    if (license !== undefined) out.push({ path, item: 'license', want: license, found: (t) => json(t)['license'] });
    // GN-3b: the host package is the package of a release, which reads the fields of GN-3c.
    out.push({ path, item: 'type', want: 'module', found: (t) => json(t)['type'] });
    out.push({ path, item: 'napi.binaryName', want: npm.slice(npm.indexOf('/') + 1), found: (t) => json(t)['napi']?.['binaryName'] });
    out.push({ path, item: 'napi.targets', want: NODE_PLATFORMS.map((p) => p.triple), found: (t) => json(t)['napi']?.['targets'] });
    // The generated entry, its declarations and the addon (<name>.<platform>-<arch>[-gnu].node) are in the package.
    // The module of WASM, its glue and its declarations are native/wasm/generated/ of the package (GN-3b).
    const wasmFiles = contract.targets.includes('wasm') ? ['native/wasm/generated/*.mjs', 'native/wasm/generated/*.js', 'native/wasm/generated/*.d.ts', 'native/wasm/generated/*.wasm'] : [];
    for (const file of ['native/generated/index.cjs', 'native/generated/index.mjs', 'native/generated/index.d.ts', ...wasmFiles]) {
      out.push({ path, item: `files (${file})`, want: file, found: (t) => ((json(t)['files'] ?? []) as string[]).find((f) => f === file) });
    }
  }
  if (contract.targets.includes('php') && isHost(contract, 'php')) {
    const path = `${componentBase(contract)}/php/composer.json`;
    const extension = `ext-${extensionName(contract)}`;
    out.push({ path, item: `require.${extension}`, want: '*', found: (t) => json(t)['require']?.[extension] });
    if (license !== undefined) out.push({ path, item: 'license', want: license, found: (t) => json(t)['license'] });
  }
  return out;
}

// G-5: the libraries, in the snake_case of a point name (<library>.<id>), of the fault injection points that the cases of
// a contract arm, read from its case files (K-1). A file or a group that is not there names none; CK-22 reports it.
export function casePointLibraries(contract: Contract, caseFiles: Map<string, unknown>): string[] {
  const found = new Set<string>();
  for (const row of contract.cases) {
    const document = caseFiles.get(row.file);
    const group = typeof document === 'object' && document !== null ? (document as Record<string, unknown>)[row.group] : undefined;
    for (const kase of Array.isArray(group) ? group : []) {
      const faults = typeof kase === 'object' && kase !== null ? (kase as Record<string, unknown>)['faults'] : undefined;
      for (const fault of Array.isArray(faults) ? faults : []) {
        const point = typeof fault === 'object' && fault !== null ? (fault as Record<string, unknown>)['point'] : undefined;
        const prefix = typeof point === 'string' && point.includes('.') ? point.slice(0, point.indexOf('.')) : undefined;
        if (prefix !== undefined) found.add(prefix);
      }
    }
  }
  return [...found].sort();
}
