// GN-14l: the release form of a run of the end-to-end check. A repository of tests/e2e names another one by a path, a
// development form (GN-3e), so its manifests name the package of that library without a version and the steps of the
// development form install no release form. After those steps the run therefore writes the release form into the copy
// and installs it, the four ecosystems together: it rewrites each such line of a core to `version = "=X.Y.Z"` with the
// version of the dependency of the run and gives Cargo the path by a `[patch.crates-io]` of the root workspace, so
// binding scaffold writes the manifests of a release; the Go module of each dependency stands at its tag in a remote
// of the run before that scaffold, which writes go.sum from it (GN-15l, GN-14f). The functions here are the text of
// those changes, the order of the steps, the tags of the remotes, the settings that keep Git and Go off the network
// and the reading of what was written and installed; the run (scripts/e2e.mts) writes the files and runs the commands.
// No source of the generator is imported here (GN-14b): the run gives its functions as arguments.

// A dependency of the run that a core of the repository names: its core crate, the version of that crate, the
// directory of that crate in the copy of the dependency, and its library.
export interface Sibling {
  crate: string;
  library: string;
  version: string;
  path: string;
}

// The crates among `crates` that the `[dependencies]` of a core manifest name by a path, each on one line; these are
// the lines that the run rewrites, and a run whose cores name none writes no release form.
export function namedByPath(manifest: string, crates: readonly string[]): string[] {
  let section = '';
  const found: string[] = [];
  for (const line of manifest.split('\n')) {
    const header = /^\[([^\]]+)\]\s*$/.exec(line);
    if (header !== null) section = header[1] ?? '';
    else if (section === 'dependencies') {
      const crate = crates.find((name) => line.startsWith(`${name} = `) || line.startsWith(`${name}=`));
      if (crate !== undefined && /\bpath\s*=/.test(line)) found.push(crate);
    }
  }
  return found;
}

// The core manifest with each line of `[dependencies]` that names a sibling by a path in the release form: the field
// `path` becomes `version = "=X.Y.Z"` and every other field of the line stays. `rewritten` names the crates whose line
// changed; a sibling that the manifest names in another form (a tag, a branch, a version) or not at all is left as it
// is and is not among them. A path line that is not one inline table on one line is a named failure, because the
// rewrite would leave it a development form unseen.
export function releaseFormCore(manifest: string, siblings: readonly Sibling[]): { text: string; rewritten: string[] } {
  const rewritten: string[] = [];
  let section = '';
  const lines = manifest.split('\n').map((line) => {
    const header = /^\[([^\]]+)\]\s*$/.exec(line);
    if (header !== null) {
      section = header[1] ?? '';
      const table = /^dependencies\.(.+)$/.exec(section)?.[1];
      if (table !== undefined && siblings.some((s) => s.crate === table)) throw new Error(`the dependency ${table} is a table [dependencies.${table}], not one line, so the run cannot write its release form (GN-14l)`);
      return line;
    }
    if (section !== 'dependencies') return line;
    const sibling = siblings.find((s) => line.startsWith(`${s.crate} = `) || line.startsWith(`${s.crate}=`));
    if (sibling === undefined || !/\bpath\s*=/.test(line)) return line;
    const inline = /^([A-Za-z0-9_-]+\s*=\s*\{)(.*)(\}\s*)$/.exec(line);
    const path = /\bpath\s*=\s*"[^"]*"/;
    if (inline === null || !path.test(inline[2] ?? '')) throw new Error(`the dependency line of ${sibling.crate} names a path in a form that is not one inline table, so the run cannot write its release form (GN-14l): ${line.trim()}`);
    rewritten.push(sibling.crate);
    return `${inline[1] ?? ''}${(inline[2] ?? '').replace(path, `version = "=${sibling.version}"`)}${inline[3] ?? ''}`;
  });
  return { text: lines.join('\n'), rewritten };
}

// The root manifest of the workspace with the patch that gives Cargo each sibling at its path: a line `=X.Y.Z` names
// the registry, which holds no polyspec crate, and the patch puts the crate of that path in its place, which Cargo
// takes only when its version is the one that the line names. A manifest that already patches crates.io is a named
// failure, because two tables of one name are no TOML.
export function workspacePatch(root: string, siblings: readonly Sibling[]): string {
  if (/^\[patch\.crates-io\]\s*$/m.test(root)) throw new Error('the root Cargo.toml already holds [patch.crates-io], so the run cannot add the patch of the release form (GN-14l)');
  const lines = siblings.map((s) => `${s.crate} = { path = ${JSON.stringify(s.path)} }\n`);
  return `${root.endsWith('\n') ? root : `${root}\n`}\n# GN-14l: the release form of the run; the crate of each dependency of the run in place of the registry.\n[patch.crates-io]\n${lines.join('')}`;
}

// The steps of the release form of a run, in their order, each with the targets that it is a step of. The remote of
// the Go module of each dependency comes first, because binding scaffold of the release form writes go.sum from the
// tag of that module (GN-15l); the manifests are written and checked before a package is built from them; each
// package is installed before its tests; and the Go module of the repository, whose go.mod and go.sum the scaffold
// wrote, is carried after it and before the consumer that fetches it. PHP has no install of its own (GN-3h): its
// manifest is written and checked with the others.
export type ReleaseStep = 'go-dependencies' | 'rewrite' | 'scaffold' | 'check' | 'python-install' | 'python-tests' | 'npm-install' | 'node-tests' | 'wasm-tests' | 'go-repository' | 'go-consumer';
export interface ReleaseStepOf {
  id: ReleaseStep;
  targets: string[];
  what: string;
}
export function releaseSteps(targets: readonly string[]): ReleaseStepOf[] {
  const has = (t: string): boolean => targets.includes(t);
  const of = (...names: string[]): string[] => names.filter(has);
  const all: ReleaseStepOf[] = [
    { id: 'go-dependencies', targets: of('go'), what: 'the release form: the Go module of each dependency at the tag of its version in a remote of the run, which Git reads in place of GitHub (GN-14f, GN-14l)' },
    { id: 'rewrite', targets: [...targets], what: 'the release form: the dependency lines of the cores name the version of each dependency, and the workspace patches the registry with its path (GN-14l)' },
    { id: 'scaffold', targets: [...targets], what: 'the release form: binding scaffold writes the manifests of a release, go.sum from the remote of the run among them (GN-3e, GN-15l, GN-14l)' },
    { id: 'check', targets: [...targets], what: 'the release form: binding check passes, Cargo.lock is unchanged and each manifest names each dependency at its version (GN-3e, GN-14l)' },
    { id: 'python-install', targets: of('python'), what: 'the release form: build the wheel and install every wheel by its URL in one pip install (GN-3h, GN-14l)' },
    { id: 'python-tests', targets: of('python'), what: 'the release form: the generated tests on unittest' },
    { id: 'npm-install', targets: of('node', 'wasm'), what: 'the release form: pack the npm package and install every package by its URL in the root manifest (GN-3h, GN-14l)' },
    { id: 'node-tests', targets: of('node'), what: 'the release form: the generated tests on node --test' },
    { id: 'wasm-tests', targets: of('wasm'), what: 'the release form: the generated tests on node --test through the subpath ./wasm' },
    { id: 'go-repository', targets: of('go'), what: 'the release form: the Go module of the repository, with the go.mod and the go.sum of a release, at its tag in a remote of the run (GN-14f, GN-14l)' },
    { id: 'go-consumer', targets: of('go'), what: 'the released form of the Go module in the release form: the tests of a consumer that requires it at its tag, and of the fetched modules (GN-14f, GN-14l)' },
  ];
  return all.filter((step) => step.targets.length > 0);
}

// GN-14f: the configuration of Git of the Go steps of a run, the one configuration that their Git reads
// (GIT_CONFIG_GLOBAL, goRunEnv): the identity of the commits, and the directory of the remotes of the run in place of
// GitHub, whatever the owner, so a repository or a tag that the run did not make fails by the path of the run.
export function goRunGitConfig(remotes: string): string {
  return `[user]\n\tname = binding e2e\n\temail = e2e@example.invalid\n[init]\n\tdefaultBranch = main\n[url "file://${remotes}/"]\n\tinsteadOf = https://github.com/\n`;
}

// GN-14f: the environment of every Git and Go command of the Go steps of a run. Git reads the configuration of the
// run alone: no system file, no variable of the Git dependency of Cargo (GIT_CONFIG_COUNT 0) and no prompt; and it
// opens no transport but a file (GIT_ALLOW_PROTOCOL), so a URL that the configuration does not turn into a directory
// of the run, also when the file of the configuration is missing, is refused before any connection. Go reads no
// setting of the machine (GOENV off) and no other toolchain, asks no proxy and no checksum database, and fetches a
// module from its repository, which Git reads from the remotes of the run; the library is the one that a module
// carries, so GOFLAGS and CGO_LDFLAGS are empty.
export function goRunEnv(gitConfig: string, modcache: string): Record<string, string> {
  return {
    GIT_CONFIG_COUNT: '0', GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file',
    GOENV: 'off', GOTOOLCHAIN: 'local', GOWORK: 'off', GOPROXY: 'direct', GOSUMDB: 'off', GOMODCACHE: modcache, GOFLAGS: '', CGO_LDFLAGS: '',
  };
}

// A Go module of the run: its module path and the version of its core, X.Y.Z.
export interface GoModuleOf {
  module: string;
  version: string;
}

// A Go module that a remote of the run carries, at the version of its tag.
export interface GoCarried {
  module: string;
  // vX.Y.Z, or v0.0.0 for a dependency in a development form that the run does not rewrite.
  version: string;
  // Whether it is a module of the repository of the run, which the consumer requires.
  main: boolean;
}

// GN-14f: the Go modules that the remotes of a run carry and the version of the tag of each. A module of the
// repository stands at the version of its core. A dependency is carried when a go.mod of the repository requires it:
// at the version of its own core when the run writes the release form of its line (`released`, GN-14l), which is the
// version that the go.mod of the release form then requires, and otherwise at the version that the go.mod requires,
// `v0.0.0` of a development form.
export function goCarried(mains: readonly GoModuleOf[], dependencies: readonly GoModuleOf[], goMods: readonly string[], released: readonly string[], requiredVersion: (goMod: string, module: string) => string | undefined): GoCarried[] {
  const carried: GoCarried[] = mains.map((m) => ({ module: m.module, version: `v${m.version}`, main: true }));
  for (const d of dependencies) {
    const required = goMods.map((goMod) => requiredVersion(goMod, d.module)).find((found) => found !== undefined);
    if (required !== undefined) carried.push({ module: d.module, version: released.includes(d.module) ? `v${d.version}` : required, main: false });
  }
  return carried;
}

// GN-14f: the tags of the remotes of a run, by repository `<owner>/<repository>`: the tag of each carried module, as
// `remoteOf` gives it (goRemote of the generator). In the release form the remotes of the dependencies are made
// before those of the repository, each in one commit, so a repository that holds both a module of the repository of
// the run and a module of a dependency is a named failure.
export function goRemoteTags(carried: readonly GoCarried[], remoteOf: (module: string, version: string) => { owner: string; repository: string; tag: string }): Map<string, string[]> {
  const tags = new Map<string, string[]>();
  const kind = new Map<string, boolean>();
  for (const c of carried) {
    const remote = remoteOf(c.module, c.version);
    const key = `${remote.owner}/${remote.repository}`;
    if (kind.has(key) && kind.get(key) !== c.main) throw new Error(`the repository ${key} holds a Go module of the repository of the run and one of a dependency (${c.module}), which are two repositories (GN-14f)`);
    kind.set(key, c.main);
    tags.set(key, [...(tags.get(key) ?? []), remote.tag]);
  }
  return tags;
}

// GN-14l: what a fetch of a module whose repository the run has not made must give: a failure of Go that names the
// directory of the remotes of the run, which shows that Git read the run's configuration and went nowhere else.
// undefined when it did; otherwise the sentence of the failure of the step.
export function missingRemoteProblem(status: number | null, output: string, remotes: string): string | undefined {
  if (status === 0) return 'Go fetched a module whose repository the run has not made, so it did not read the remotes of the run (GN-14l)';
  if (!output.includes(`${remotes}/`)) return `Go failed to fetch a module whose repository the run has not made without naming the remotes of the run, ${remotes}, so the run cannot tell that Git read them and no network (GN-14l): ${output.trim().split('\n')[0] ?? ''}`;
  return undefined;
}

// The names by which the manifests of a repository name a dependency of the run: its npm package, its Composer
// package and its Go module, each absent when the dependency has no such target.
export interface SiblingNames {
  library: string;
  version: string;
  npm?: string | undefined;
  composer?: string | undefined;
  goModule?: string | undefined;
}

// The manifests of one contract that binding scaffold writes, each absent when the contract has no such target.
export interface Manifests {
  packageJson?: string | undefined;
  composerJson?: string | undefined;
  pyproject?: string | undefined;
  goMod?: string | undefined;
  goSum?: string | undefined;
}

const pythonDependencies = (pyproject: string): string[] => [...(/^dependencies = \[(.*)\]$/m.exec(pyproject)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => (m[1] ?? '').replaceAll(' ', ''));
const jsonTable = (text: string, key: string): Record<string, string> => (JSON.parse(text) as Record<string, Record<string, string> | undefined>)[key] ?? {};

// GN-3e, GN-14l: the manifests of the release form against those of the development form of the same contract. Each
// manifest that named a dependency of the run without the version of a release (`*`, the name alone, `v0.0.0`) names
// it at its version X.Y.Z: package.json and composer.json the version, pyproject.toml `polyspec-<library>==X.Y.Z`,
// go.mod `require <module> vX.Y.Z` with no `replace` line, and go.sum the two hashes of that module. `named` holds one
// line for each requirement that is in the release form and `problems` one for each that is not; which manifests name
// a dependency is a matter of the contract (GN-3e), so the development form says where a release form is due.
export function releaseFormManifests(development: Manifests, release: Manifests, siblings: readonly SiblingNames[], requiredVersion: (goMod: string, module: string) => string | undefined): { named: string[]; problems: string[] } {
  const named: string[] = [];
  const problems: string[] = [];
  const judge = (file: string, what: string, found: string | undefined, wanted: string): void => {
    if (found === wanted) named.push(`${file} names ${what} ${wanted}`);
    else problems.push(`${file} names ${found === undefined ? `no ${what}` : `${what} ${found}`}, not ${what} ${wanted} of the release form (GN-3e)`);
  };
  for (const s of siblings) {
    if (s.npm !== undefined && development.packageJson !== undefined && jsonTable(development.packageJson, 'dependencies')[s.npm] !== undefined) {
      judge('package.json', s.npm, jsonTable(release.packageJson ?? '{}', 'dependencies')[s.npm], s.version);
    }
    if (s.composer !== undefined && development.composerJson !== undefined && jsonTable(development.composerJson, 'require')[s.composer] !== undefined) {
      judge('composer.json', s.composer, jsonTable(release.composerJson ?? '{}', 'require')[s.composer], s.version);
    }
    const python = `polyspec-${s.library}`;
    if (development.pyproject !== undefined && pythonDependencies(development.pyproject).some((d) => d === python || d.startsWith(`${python}=`))) {
      const found = pythonDependencies(release.pyproject ?? '').find((d) => d === python || d.startsWith(`${python}=`));
      if (found === `${python}==${s.version}`) named.push(`pyproject.toml names ${found}`);
      else problems.push(`pyproject.toml names ${found ?? `no ${python}`}, not ${python}==${s.version} of the release form (GN-3e)`);
    }
    if (s.goModule !== undefined && development.goMod !== undefined && requiredVersion(development.goMod, s.goModule) !== undefined) {
      const goMod = release.goMod ?? '';
      judge('go.mod', s.goModule, requiredVersion(goMod, s.goModule), `v${s.version}`);
      if (/^replace /m.test(goMod)) problems.push('go.mod holds a replace line, which a consumer of the tag of the Go module cannot resolve (GN-15f)');
      for (const line of [`${s.goModule} v${s.version} h1:`, `${s.goModule} v${s.version}/go.mod h1:`]) {
        if ((release.goSum ?? '').split('\n').some((sum) => sum.startsWith(line))) named.push(`go.sum holds ${line}`);
        else problems.push(`go.sum holds no line ${line}, which binding scaffold writes from the tag of the module in the remote of the run (GN-15l)`);
      }
    }
  }
  return { named, problems };
}

// GN-3e: the requirement that a pyproject.toml of the release form holds on the Python package of a sibling.
export function pythonReleaseRequirement(sibling: { library: string; version: string }): string {
  return `polyspec-${sibling.library}==${sibling.version}`;
}

// The siblings whose release-form requirement the installed distribution does not hold, from the lines `Requires-Dist`
// of its metadata; each is named with what the metadata holds of it.
export function missingPythonRequirements(requires: readonly string[], siblings: readonly { library: string; version: string }[]): string[] {
  const held = requires.map((line) => line.replaceAll(' ', ''));
  return siblings.filter((s) => !held.includes(pythonReleaseRequirement(s))).map((s) => {
    const found = held.filter((line) => line === `polyspec-${s.library}` || line.startsWith(`polyspec-${s.library}=`) || line.startsWith(`polyspec-${s.library}@`));
    return `the installed distribution requires ${found.length === 0 ? `no polyspec-${s.library}` : found.join(', ')}, not ${pythonReleaseRequirement(s)} (GN-3e)`;
  });
}
