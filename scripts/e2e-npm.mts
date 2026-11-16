// GN-14: the npm packages that a run of the end-to-end check builds, packs and installs. The npm package of a library
// holds the entry of Node, whose addon is the package of the platform, and the WASM module behind the subpath ./wasm.
// The generated entry of a contract that names a type of another repository (T-3) imports the npm package of that
// repository on both, so a run packs the package of each repository of DEPS that a packed contract names, before the
// packages of the repository, as it installs the wheel, the extension and the static library of a dependency for the
// other targets. Nothing is planned from the working tree: the plan reads the contracts alone.

export interface NpmSource {
  library: string;
  // The targets of the contract.
  targets: readonly string[];
  // The other libraries whose types the contract names.
  names: readonly string[];
}

export interface NpmPacked<T extends NpmSource> {
  source: T;
  // Whether the run builds the Node addon and packs it as the package of the platform.
  addon: boolean;
  // Whether the run builds the WASM module and its glue into the package before it is packed.
  wasm: boolean;
}

// The contracts whose npm package a run packs, the dependencies first, each in the order given: every contract of the
// repository with the target node or wasm, and every contract of a dependency that one of them names, directly or
// through another dependency. A dependency is built for the targets of the contracts of the repository that need it; a
// dependency without such a target is a named failure, because the package of the repository would import a package
// that the run cannot build.
export function npmPacked<T extends NpmSource>(mains: readonly T[], dependencies: readonly T[]): NpmPacked<T>[] {
  const packedMains = mains.filter((main) => main.targets.includes('node') || main.targets.includes('wasm'));
  // What each library is needed for, and the first contract that names it for that target.
  const needs = new Map<string, Map<'node' | 'wasm', string>>();
  const need = (library: string, target: 'node' | 'wasm', by: string): boolean => {
    const found = needs.get(library) ?? new Map<'node' | 'wasm', string>();
    needs.set(library, found);
    if (found.has(target)) return false;
    found.set(target, by);
    return true;
  };
  const byLibrary = (library: string): T[] => dependencies.filter((dependency) => dependency.library === library);
  const visit = (source: T, target: 'node' | 'wasm'): void => {
    for (const library of source.names) {
      if (!need(library, target, source.library)) continue;
      for (const dependency of byLibrary(library)) visit(dependency, target);
    }
  };
  for (const main of packedMains) for (const target of ['node', 'wasm'] as const) if (main.targets.includes(target)) visit(main, target);
  const planned: NpmPacked<T>[] = [];
  for (const dependency of dependencies) {
    const needed = needs.get(dependency.library);
    if (needed === undefined) continue;
    for (const [target, by] of needed) {
      if (!dependency.targets.includes(target)) throw new Error(`the library ${dependency.library} has no target ${target}, which ${by} names it for (GN-14)`);
    }
    planned.push({ source: dependency, addon: needed.has('node'), wasm: needed.has('wasm') });
  }
  for (const main of packedMains) planned.push({ source: main, addon: main.targets.includes('node'), wasm: main.targets.includes('wasm') });
  return planned;
}

// GN-3c: the consumer of a release names the npm package of the library in dependencies and each platform package in
// optionalDependencies, each by the URL of its asset, because no registry holds a polyspec package before 0.1. The
// run installs its packages through one root manifest of that form.
export interface ConsumerPackage {
  // The npm name of the package, with its scope.
  name: string;
  version: string;
  // The napi-rs platform of a platform package, absent for the package of the library.
  platform?: string;
}

// The name that npm pack gives the tarball of a package: <scope>-<name>[-<platform>]-<version>.tgz, the scope without @.
export function packFile(name: string, version: string, platform?: string): string {
  return `${name.replace(/^@/, '').replace('/', '-')}${platform === undefined ? '' : `-${platform}`}-${version}.tgz`;
}

// The root manifest of a consumer whose assets are under base, a URL that ends with a slash: the package of each
// library in dependencies and each platform package in optionalDependencies, so npm installs the one of the machine.
export function consumerManifest(packages: readonly ConsumerPackage[], base: string): { private: true; dependencies: Record<string, string>; optionalDependencies: Record<string, string> } {
  const dependencies: Record<string, string> = {};
  const optionalDependencies: Record<string, string> = {};
  for (const p of packages) {
    if (p.platform === undefined) dependencies[p.name] = `${base}${packFile(p.name, p.version)}`;
    else optionalDependencies[`${p.name}-${p.platform}`] = `${base}${packFile(p.name, p.version, p.platform)}`;
  }
  return { private: true, dependencies, optionalDependencies };
}

// The .npmrc of the consumer: npm takes a URL for a root dependency alone (its default allow-remote=none takes none).
export const CONSUMER_NPMRC = 'allow-remote=root\n';
