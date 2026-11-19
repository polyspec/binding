#!/usr/bin/env node
// binding check <interface.json> --cargo <command> [--go <command>] [--release]
//   The contract check (I-1, I-2), with the contracts of the libraries the contract names, and the comparison of the
//   tracked binding packages with what `binding scaffold` writes (L-2). --release adds the check of a release (CK-70).
// binding scaffold [--root <repository> | --contract <interface.json>] --cargo <command> [--go <command>]
//   Writes the tracked thin package of each binding (L-2): its Cargo manifest, its entry file and its language manifest.
//   --go of check, scaffold and release-go-module is the go command, the value of $(GO), `go` of PATH when it is not
//   given; check and scaffold start it only for the go.sum of a go.mod that requires a release (GN-15l).
// binding generate [--root <repository> | --contract <interface.json>] [--out <directory>] --cargo <command>
//   Writes the generated sources into the directories that binding owns (L-1). --out writes the same files under another
//   directory, for the comparison of I-5. --cargo of check, scaffold, generate and go-link is the cargo command of the
//   repository, the value of $(CARGO), which runs every call of Cargo (GN-1d).
// binding release-go-module (--root <repository> | --contract <interface.json>) --tag vX.Y.Z --libraries <directory>
//     --work <directory> [--remote <name>] [--go <command>] [--rehearsal]
//   Makes the commit and the tag of the Go module with its static libraries (GN-19f) and prints the reference to push.
//   --rehearsal makes no commit and no tag: it runs the checks and the proof on HEAD with the platforms that are there
//   and ends with what it did not see.
// binding go-link --cargo <command> [--cargo-flags <arguments>] --manifest <Cargo.toml of the Go crate>
//     --target-dir <directory> [--features <features>]
//   Builds the static library of the host with the print of rustc and prints the value of CGO_LDFLAGS for the Go tests
//   of the checkout (GN-15k).
// binding release-recipes [--root <repository> | --contract <interface.json>] [--out <directory>]
//   Writes the release recipes of the binding, the make file that the Makefile of the repository includes (GN-19h).

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'smol-toml';
import { cargoMetadataFailure } from './cargo-metadata.ts';
import { bindingCoreTagFinding, checkContract } from './check.ts';
import { gitPinDiffers, ownCommit } from './commit.ts';
import type { Contract, Lang } from './contract.ts';
import { caseTestTargets, generate, generatedDirs, goModuleDir, isGoGenerated } from './generate/index.ts';
import { generateOnStack } from './generate/stack.ts';
import { Unsupported } from './generate/model.ts';
import { BINDING_CORE, bindingCoreFinding, casePointLibraries, componentBase, extensionName, goModGraph, hostRequirements, inheritedLines, manifestReleaseFindings, releaseFindings, releaseJudged, releaseRequires, sumRequires, type GoDownload, type Tracked, trackedResult } from './generate/packages.ts';
import { goCommand } from './go-command.ts';
import { goModUnusedOf, goStaticBuildArgs, nativeStaticLibs, Refused, rehearsalReport, releaseGoModule } from './release/go-module.ts';
import { cargoFindings, releaseRecipes, releaseSettingFindings } from './release/recipes.ts';
import { assetSizesCommand } from './release/asset-sizes.ts';

function libraries(contract: unknown): Set<string> {
  const found = new Set<string>();
  const own = (contract as { library?: unknown }).library;
  const walk = (value: unknown, key: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    } else if ((key === 'library' || key === 'source' || key === 'from') && typeof value === 'string' && value !== own) {
      found.add(value);
    }
  };
  for (const [key, value] of Object.entries(contract as object)) {
    if (key !== 'library') walk(value, key);
  }
  return found;
}

// The contracts of the named libraries, read from the packages that Cargo resolved for the crate beside the contract:
// each library's crate is polyspec-<library> (P-1) and ships its interface.json (I-1). No other checkout is read (S15).
// GN-15f: cargo metadata resolves the workspace, so it fails where Cargo cannot: without network for a Git dependency
// that the machine has not fetched, or for a manifest that names a crate that no longer exists. The failure is given
// back with what to run, so that scaffold can name the Go module alone.
function cargoContracts(contract: unknown, crateDir: string, cargo: readonly string[]): { found: Map<string, unknown>; failure?: string } {
  const wanted = libraries(contract);
  const found = new Map<string, unknown>();
  if (wanted.size === 0) return { found };
  // Cargo writes the metadata into a file rather than a pipe, so its size (megabytes for a workspace with the binding
  // crates) meets no buffer limit of the child process.
  const scratch = mkdtempSync(join(tmpdir(), 'binding-metadata-'));
  let metadata: { packages: { name: string; manifest_path: string }[] };
  try {
    const out = join(scratch, 'metadata.json');
    const fd = openSync(out, 'w');
    try {
      // GN-15f: --locked reads the Cargo.lock of the repository as it is and never writes it, and --offline reads only
      // the crates that the machine fetched, so the contracts that a check reads depend on no network.
      // GN-1d: the cargo command of the repository, so that a development link of the repository resolves the crates
      // of the libraries to their linked checkouts, whose interface.json is then read.
      const [program = 'cargo', ...words] = cargo;
      const run = spawnSync(program, [...words, 'metadata', '--locked', '--offline', '--format-version', '1', '--manifest-path', join(crateDir, 'Cargo.toml')], {
        // B2.552: the error of Cargo is read so that the refusal gives it and names the fetch only for its cause.
        stdio: ['ignore', fd, 'pipe'],
        encoding: 'utf8',
      });
      if (run.error !== undefined) throw run.error;
      if (run.status !== 0) return { found, failure: cargoMetadataFailure(run.status, run.stderr) };
    } finally {
      closeSync(fd);
    }
    metadata = JSON.parse(readFileSync(out, 'utf8')) as typeof metadata;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  // T-3: the contract of a library names the libraries of its own types, so the contracts are read to the closure: a
  // library that only a unit of another library names, such as the value that a callback of that library gives, is a
  // package of the same resolution of Cargo.
  closure(contract, found, (library) => {
    const crate = metadata.packages.find((p) => p.name === `polyspec-${library}`);
    return crate === undefined ? undefined : JSON.parse(readFileSync(join(dirname(crate.manifest_path), 'interface.json'), 'utf8')) as unknown;
  });
  return { found };
}

// T-3: reads into found the contract of each library that the contract names and of each library that one of those
// contracts names, to the closure; read gives the contract of a library, with the libraries that named it from the
// contract of the command on, or undefined when it is not found. Libraries that name each other in a cycle are refused
// by name: Cargo resolves no cycle of crates, so such contracts describe no cores.
function closure(contract: unknown, found: Map<string, unknown>, read: (library: string, from: string[]) => unknown): void {
  const own = String((contract as { library?: unknown }).library);
  const visit = (of: unknown, path: string[]): void => {
    for (const library of libraries(of)) {
      if (path.includes(library)) fail(`the contracts of the libraries ${[...path.slice(path.indexOf(library)), library].join(' -> ')} name each other in a cycle, which is not generated (T-3)`);
      if (found.has(library)) continue;
      const other = read(library, path);
      if (other === undefined) continue;
      found.set(library, other);
      visit(other, [...path, library]);
    }
  };
  visit(contract, [own]);
}

// check and generate read the contracts for every target, so a failure of Cargo stops them.
function dependencies(contract: unknown, crateDir: string, cargo: readonly string[]): Map<string, unknown> {
  const { found, failure } = cargoContracts(contract, crateDir, cargo);
  if (failure !== undefined) fail(failure);
  return found;
}

// GN-1c: a failure that is no error of the command line, such as a refused target or a manifest that is not the crate
// of the contract, has status 1 and no usage line; only an error of the command line prints the usage, with status 2.
function fail(message: string): never {
  process.stderr.write(`binding: ${message}\n`);
  process.exit(1);
}

// GN-1d: the words of the value of --cargo, --cargo-flags or --go, as the shell splits $(CARGO) of a recipe line at
// white space; a value that the shell would read otherwise (a quote or a backslash) is refused, and so is a command of
// no word.
const VARIABLES: Record<string, string> = { '--cargo': 'CARGO', '--cargo-flags': 'CARGOFLAGS', '--go': 'GO' };
function words(option: string, value: string, command: boolean): string[] {
  const split = value.split(/\s+/).filter((word) => word !== '');
  if (/["'\\]/.test(value) || (command && split.length === 0)) usage(`${option} ${value} is no list of words: give the value of $(${VARIABLES[option] ?? ''}), which the shell splits at white space (GN-1d)`);
  return split;
}

// GN-15l, GN-19f: the words of --go, the go command that a command which may start Go takes; without the option the
// command is the go of PATH. Whether it is there is asked only where Go is about to start (goCommand).
function goOf(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : words('--go', value, true);
}

// GN-1d: the cargo command that a command which runs Cargo requires.
function cargoOf(command: string, value: string | undefined): string[] {
  if (value === undefined) usage(`${command} takes --cargo <command>, the cargo command of the repository (GN-1d)`);
  return words('--cargo', value, true);
}

function usage(message: string): never {
  process.stderr.write(`binding: ${message}\nusage: binding check <interface.json> --cargo <command> [--go <command>] [--release] | binding scaffold [--root <repository> | --contract <interface.json>] [--out <directory>] --cargo <command> [--go <command>] | binding generate [--root <repository> | --contract <interface.json>] [--out <directory>] [--target <target>[,<target>...]] --cargo <command> | binding release-go-module (--root <repository> | --contract <interface.json>) --tag vX.Y.Z --libraries <directory> --work <directory> [--remote <name>] [--go <command>] [--rehearsal] | binding go-link --cargo <command> [--cargo-flags <arguments>] --manifest <Cargo.toml of the Go crate> --target-dir <directory> [--features <features>] | binding release-recipes [--root <repository> | --contract <interface.json>] [--out <directory>]\n`);
  process.exit(2);
}

// GN-1c: the sentences of a failure that a contract, a case file or a manifest causes, which the generator throws as a
// refusal or as an Error with its sentence. Any other error is a defect of binding and keeps its stack trace.
function sentences(error: unknown): string[] {
  if (error instanceof Unsupported) return error.refusals;
  if (error instanceof Error && error.constructor === Error && !error.message.startsWith('internal:')) return [error.message];
  throw error;
}

// GN-19f: the commit and the tag of the Go module of a release. The command reads from the contract only where the Go
// module is and how its library is named; the checks of the contract are those of `binding check --release`, which the
// recipe of a release runs before it (GN-19g).
function releaseGoModuleCommand(all: string[]): never {
  const given = new Map<string, string>();
  // B2.479: --rehearsal takes no value, as --release of check takes none.
  const rehearsal = all.includes('--rehearsal');
  const argv = all.filter((argument) => argument !== '--rehearsal');
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === undefined || value === undefined || !['--root', '--contract', '--tag', '--libraries', '--work', '--remote', '--go'].includes(key)) usage(`unknown argument ${key ?? ''}`);
    given.set(key, value);
  }
  const go = goOf(given.get('--go'));
  const tag = given.get('--tag');
  const libraries = given.get('--libraries');
  const work = given.get('--work');
  if (tag === undefined || libraries === undefined || work === undefined) usage('release-go-module takes --tag, --libraries and --work');
  const contractOption = given.get('--contract');
  if (contractOption !== undefined && given.has('--root')) usage('give --root or --contract, not both');
  const path = contractOption !== undefined ? resolve(contractOption) : join(resolve(given.get('--root') ?? '.'), 'packages/rust/interface.json');
  const contract = JSON.parse(readFileSync(path, 'utf8')) as Contract;
  const module = (contract.packages?.['go'] as { module?: unknown } | undefined)?.module;
  if (typeof module !== 'string') fail(`${path} names no Go module (packages.go), so the repository has no Go module to release`);
  let released;
  try {
    released = releaseGoModule({
      root: resolve(dirname(path), ...contract.core.path.split('/').map(() => '..')),
      directory: goModuleDir(contract),
      module,
      tag,
      library: `${contract.core.crate}-go`.replaceAll('-', '_'),
      prefix: extensionName(contract),
      libraries: resolve(libraries),
      work: resolve(work),
      remote: given.get('--remote') ?? 'origin',
      go,
      env: process.env,
      log: (line) => {
        if (line !== '') process.stderr.write(`${line}\n`);
      },
      rehearsal,
    });
  } catch (error) {
    if (error instanceof Refused) {
      for (const finding of error.findings) process.stderr.write(`binding: ${finding}\n`);
      process.stderr.write(rehearsal ? 'binding: the rehearsal of the Go module stopped at these checks, and it made no commit and no tag (GN-19f)\n' : 'binding: no commit and no tag of the Go module was made (GN-19f)\n');
      process.exit(1);
    }
    for (const sentence of sentences(error)) process.stderr.write(`binding: ${sentence}\n`);
    process.exit(1);
  }
  // B2.479: a rehearsal prints no reference, so no recipe pushes one, and its last lines are what it did not see.
  if (released.unseen !== undefined) {
    for (const line of rehearsalReport(module, tag, released.unseen)) process.stderr.write(`binding: ${line}\n`);
    process.exit(0);
  }
  const reference = `refs/tags/${goModuleDir(contract)}/${tag}`;
  process.stderr.write(`binding: ${reference} names the commit ${released.commit}${released.reference === undefined ? ', and the remote holds it already' : '; the recipe pushes it'}\n`);
  // The standard output is the reference that the recipe pushes, and nothing else.
  if (released.reference !== undefined) process.stdout.write(`${released.reference}\n`);
  process.exit(0);
}

// GN-19h: the release recipes of the binding, which depend on the names of the contract alone, so the command checks
// only what it reads: the schema and the names (CK-1, CK-18), as scaffold does. The file is written whole under another
// name beside it and renamed into place, so a make that reads it never reads a part.
function releaseRecipesCommand(argv: string[]): never {
  const given = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === undefined || value === undefined || !['--root', '--contract', '--out'].includes(key)) usage(`unknown argument ${key ?? ''}`);
    given.set(key, value);
  }
  const contractOption = given.get('--contract');
  if (contractOption !== undefined && given.has('--root')) usage('give --root or --contract, not both');
  const path = contractOption !== undefined ? resolve(contractOption) : join(resolve(given.get('--root') ?? '.'), 'packages/rust/interface.json');
  const contract = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const findings = checkContract(contract, { dependencies: new Map(), caseFiles: new Map() }).filter((f) => f.check === 'CK-1' || f.check === 'CK-18');
  for (const f of findings) process.stderr.write(`${path}#${f.path}: ${f.check} ${f.message}\n`);
  if (findings.length > 0) process.exit(1);
  const checkedContract = contract as Contract;
  const top = resolve(dirname(path), ...checkedContract.core.path.split('/').map(() => '..'));
  let recipes;
  try {
    recipes = releaseRecipes(checkedContract);
  } catch (error) {
    for (const sentence of sentences(error)) process.stderr.write(`binding: ${sentence}\n`);
    process.exit(1);
  }
  const target = join(resolve(given.get('--out') ?? top), recipes.path);
  mkdirSync(dirname(target), { recursive: true });
  const part = `${target}.part`;
  writeFileSync(part, recipes.text);
  renameSync(part, target);
  process.exit(0);
}

// GN-15k: the static library of the host, built by cargo rustc with the print of rustc into the target directory, and
// GN-1d: with the cargo command of --cargo and the arguments of a build of --cargo-flags right after rustc,
// the value of CGO_LDFLAGS for the Go tests of the checkout on stdout. Both streams of cargo go to stderr, so stdout
// holds the value alone; a failed build ends with the status of cargo. The directory is made absolute, because cgo
// reads a relative -L from the directory of each package.
// GN-15k: the name of the static library of a Go crate, the name of [lib] of its manifest, which the scaffold writes.
function staticLibraryOf(manifest: string): string {
  let text: string;
  try {
    text = readFileSync(manifest, 'utf8');
  } catch (error) {
    fail(`cannot read ${manifest}: ${(error as Error).message} (GN-15k)`);
  }
  const name = /^\[lib\]\n(?:[^[\n][^\n]*\n)*?name = "([^"]+)"$/m.exec(text)?.[1];
  if (name === undefined) fail(`${manifest} names no library in [lib] (GN-15k)`);
  return name;
}

function goLinkCommand(argv: string[]): never {
  const given = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === undefined || value === undefined || !['--cargo', '--cargo-flags', '--manifest', '--target-dir', '--features'].includes(key)) usage(`unknown argument ${key ?? ''}`);
    given.set(key, value);
  }
  const [program = 'cargo', ...prefix] = cargoOf('go-link', given.get('--cargo'));
  const flags = words('--cargo-flags', given.get('--cargo-flags') ?? '', false);
  const manifestOption = given.get('--manifest');
  const targetOption = given.get('--target-dir');
  if (manifestOption === undefined || targetOption === undefined) usage('go-link takes --manifest and --target-dir');
  const manifest = resolve(manifestOption);
  const targetDir = resolve(targetOption);
  const library = staticLibraryOf(manifest);
  const ran = spawnSync(program, [...prefix, ...goStaticBuildArgs({ manifest, targetDir, features: given.get('--features'), flags })], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['inherit', 'pipe', 'pipe'] });
  if (ran.error !== undefined) fail(`cargo did not start: ${ran.error.message}`);
  process.stderr.write(ran.stdout);
  process.stderr.write(ran.stderr);
  if (ran.status !== 0) process.exit(ran.status ?? 1);
  const libs = nativeStaticLibs(ran.stderr);
  if (libs === undefined) fail(`cargo printed no native-static-libs of the static library of ${manifest} (GN-15k)`);
  // B2.414: cgo puts CGO_LDFLAGS before every #cgo LDFLAGS of a package, so the library comes first in the value and
  // the libraries that it needs follow it; a linker that reads in order, GNU ld with --as-needed, needs them after it.
  process.stdout.write(`-L${join(targetDir, 'debug')} -l${library} ${libs}\n`);
  process.exit(0);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'go-link') goLinkCommand(rest);
if (command === 'release-go-module') releaseGoModuleCommand(rest);
if (command === 'release-recipes') releaseRecipesCommand(rest);
if (command === 'asset-sizes') assetSizesCommand(rest);
if (command !== 'check' && command !== 'scaffold' && command !== 'generate') usage(`unknown command ${command ?? ''}`);
const options = new Map<string, string>();
let contractPath: string;
if (command === 'check') {
  // CK-70: --release, which the recipe of a release passes (GN-19g), adds the check of a release.
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const argument = rest[i] as string;
    if (argument === '--release') options.set('--release', 'true');
    else if ((argument === '--cargo' || argument === '--go') && rest[i + 1] !== undefined) options.set(argument, rest[(i += 1)] as string);
    else positional.push(argument);
  }
  const [path, ...extra] = positional;
  if (path === undefined || path.startsWith('--') || extra.length > 0) usage('check takes the path of one interface.json and the options --cargo, --go and --release');
  contractPath = resolve(path);
} else {
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (key === undefined || value === undefined || !['--root', '--contract', '--out', '--cargo', ...(command === 'generate' ? ['--target'] : ['--go'])].includes(key)) usage(`unknown argument ${key ?? ''}`);
    options.set(key, value);
  }
  // L-1: a core at packages/<component>/rust names its contract with --contract; --root finds packages/rust.
  const given = options.get('--contract');
  if (given !== undefined && options.has('--root')) usage('give --root or --contract, not both');
  contractPath = given !== undefined ? resolve(given) : join(resolve(options.get('--root') ?? '.'), 'packages/rust/interface.json');
}
const cargo = cargoOf(command, options.get('--cargo'));
const go = goOf(options.get('--go'));
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as unknown;
// scaffold writes the thin packages from the package and name items alone (the schema, CK-1, and the names, CK-18), so
// no other finding stops it, such as a unit that is still todo (CK-2); check and generate report those. It does not ask
// Cargo for the workspace either: a binding manifest that an earlier scaffold wrote, which this one rewrites, may no
// longer resolve (the core crate was renamed), and that must not stop the rewrite. Only the go.mod of a contract with the
// target go needs the contracts of other libraries, which scaffold reads below (GN-15f).
const foreign = command === 'scaffold' ? new Map<string, unknown>() : dependencies(contract, dirname(contractPath), cargo);
// G-5: an integer of a case file outside the safe integers is read as a bigint from its token, so it keeps its value
// (an int64 such as 9223372036854775807); a number with a fraction or an exponent stays a number.
const caseNumber = (_key: string, value: unknown, context?: { source?: string }): unknown =>
  typeof value === 'number' && !Number.isSafeInteger(value) && context?.source !== undefined && /^-?(0|[1-9][0-9]*)$/.test(context.source) ? BigInt(context.source) : value;
// K-1: the case files that cases names, from the repository root, for CK-22; a file that does not parse is left out
// and reported as not found.
const caseFiles = new Map<string, unknown>();
{
  const raw = contract as { core?: { path?: unknown }; cases?: { file?: unknown }[] };
  const corePath = typeof raw.core?.path === 'string' ? raw.core.path : undefined;
  if (corePath !== undefined && Array.isArray(raw.cases)) {
    const top = resolve(dirname(contractPath), ...corePath.split('/').map(() => '..'));
    for (const row of raw.cases) {
      if (typeof row.file !== 'string' || caseFiles.has(row.file)) continue;
      try {
        caseFiles.set(row.file, JSON.parse(readFileSync(join(top, row.file), 'utf8'), caseNumber));
      } catch {
        // not found or not JSON: CK-22 reports the file
      }
    }
  }
}
const findings = checkContract(contract, { dependencies: foreign, caseFiles }).filter((f) => command !== 'scaffold' || f.check === 'CK-1' || f.check === 'CK-18');
for (const f of findings) process.stderr.write(`${contractPath}#${f.path}: ${f.check} ${f.message}\n`);
// check runs CK-19 and CK-20 past the findings of the contract and stops each only where it reads what a failed check
// gives (contract-check.md): CK-20 reads core.path (CK-1), CK-19 what scaffold writes from the packages and names (CK-1,
// CK-18). generate and scaffold read the contract, so a finding stops them.
const failedChecks = new Set(findings.map((f) => f.check));
if (findings.length > 0 && command !== 'check') process.exit(1);
if (failedChecks.has('CK-1')) {
  process.stderr.write(`${contractPath}: CK-19 and CK-20 did not run: they read the contract, which fails CK-1\n`);
  process.exit(1);
}
const checked = contract as Contract;
// The repository root: the contract is packages/rust/interface.json of the core crate (I-1).
const root = resolve(dirname(contractPath), ...checked.core.path.split('/').map(() => '..'));

// The version and the library name of the core crate from its manifest (T-3), read as TOML: a version inherited from the
// workspace (version.workspace = true) is the root manifest's workspace.package.version.
const manifest = parse(readFileSync(join(root, checked.core.path, 'Cargo.toml'), 'utf8')) as {
  package?: { name?: string; version?: string | { workspace?: boolean }; license?: string | { workspace?: boolean } };
  lib?: { name?: string };
  dependencies?: Record<string, unknown>;
  'dev-dependencies'?: Record<string, unknown>;
};
const core = manifest.package;
let version = core?.version;
// GN-3f: the licence of the core, which every manifest of its binding packages carries, read as the version is.
let license = core?.license;
if ((typeof version === 'object' && version.workspace === true) || (typeof license === 'object' && license.workspace === true)) {
  const workspace = parse(readFileSync(join(root, 'Cargo.toml'), 'utf8')) as { workspace?: { package?: { version?: string; license?: string } } };
  if (typeof version === 'object') version = workspace.workspace?.package?.version;
  if (typeof license === 'object') license = workspace.workspace?.package?.license;
}
const coreLicense = typeof license === 'string' ? license : undefined;
if (core?.name !== checked.core.crate || typeof version !== 'string') fail(`${checked.core.path}/Cargo.toml is not the crate ${checked.core.crate} with a version`);
// G-5: the binding crates turn on fault-test of each core whose fault injection points a case arms.
// GN-15f: go.mod requires the Go module of each library whose records the contract names, so scaffold of a contract
// with the target go reads the contracts of the libraries it names: the contract of a path dependency of the core is
// the interface.json of that path, which needs no Cargo, and one of any other dependency is found through Cargo, as
// generate finds it.
let metadataFailure: string | undefined;
function scaffolded(): Map<string, unknown> {
  const found = new Map<string, unknown>();
  // The directory of the core of each library that a path names, from the directory of the core that names it.
  const dirs = new Map<string, string>([[checked.library, join(root, checked.core.path)]]);
  let others = false;
  closure(contract, found, (library, from) => {
    const dir = dirs.get(from[from.length - 1] ?? '');
    if (dir === undefined) return undefined;
    let spec: unknown;
    try {
      spec = (parse(readFileSync(join(dir, 'Cargo.toml'), 'utf8')) as { dependencies?: Record<string, unknown> }).dependencies?.[`polyspec-${library}`];
    } catch {
      spec = undefined;
    }
    const path = typeof spec === 'object' && spec !== null ? (spec as { path?: unknown }).path : undefined;
    // A contract that is not there is not found: the package that reads it is then named as not written (GN-3e), and
    // the other packages are written. B2.548: a relative path is read from the directory of the core that names it and an
    // absolute one as it is, as Cargo reads both.
    const at = typeof path === 'string' ? resolve(dir, path) : undefined;
    const file = at === undefined ? undefined : join(at, 'interface.json');
    if (at !== undefined && file !== undefined && existsSync(file)) {
      dirs.set(library, at);
      return JSON.parse(readFileSync(file, 'utf8')) as unknown;
    }
    if (typeof path !== 'string') others = true;
    return undefined;
  });
  // A failure of Cargo leaves the contracts of the other dependencies not found: the Go module is then named as not
  // written with the failure, and the other packages are written with the libraries that the contract itself names.
  if (others) {
    const read = cargoContracts(contract, join(root, checked.core.path), cargo);
    metadataFailure = read.failure;
    for (const [library, other] of read.found) if (!found.has(library)) found.set(library, other);
  }
  return found;
}
// B2.457: the root manifest, for [workspace.dependencies], whose line a dependency line with workspace = true has
// (GN-3e), and for [patch], which CK-70 reads. A root without a manifest, or with one that is no TOML, gives none.
let rootManifest: { workspace?: { dependencies?: Record<string, unknown> } } = {};
try {
  rootManifest = parse(readFileSync(join(root, 'Cargo.toml'), 'utf8')) as typeof rootManifest;
} catch {
  // Cargo names the file
}
const workspaceDependencies = rootManifest.workspace?.dependencies;
const coreDependencies = inheritedLines(manifest.dependencies ?? {}, workspaceDependencies);
// GN-3e: the running generator, whose own line on polyspec-binding-core the binding crates of a core without that line
// get: the version of its package and the commit that it knows of itself (CK-20).
const packageDir = resolve(dirname(new URL(import.meta.url).pathname), '..');
const generator = { version: (JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { version: string }).version, commit: ownCommit(packageDir) };
// GN-3e: the tracked packages, which check and scaffold read and generate does not. A package that cannot be written is
// named with its reason, and so is a failure of the whole that the contract, a case file or a manifest causes.
function trackedOf(): Tracked {
  try {
    const result = trackedResult(checked, version as string, coreDependencies, casePointLibraries(checked, caseFiles), (command === 'scaffold' ? scaffolded() : foreign) as ReadonlyMap<string, Contract>, caseTestTargets({ contract: checked, caseFiles, foreign: foreign as ReadonlyMap<string, Contract> }), coreLicense, generator);
    const failure = metadataFailure;
    return failure === undefined ? result : { files: result.files, refused: result.refused.map((r) => (r.path === goModuleDir(checked) ? { path: r.path, message: `${r.message}: ${failure}` } : r)) };
  } catch (error) {
    return { files: new Map(), refused: sentences(error).map((message) => ({ path: componentBase(checked), message })) };
  }
}
// GN-15l: the go.sum beside a go.mod that requires a release holds the sums that `go mod download -json all` gives for
// a module of those requirements, with GOPROXY, GOFLAGS and the module cache of the environment: offline it reads the
// cache alone. A module that Go cannot give refuses the go.sum with the cause; no empty or partial go.sum is written.
// B2.456: only such a go.mod needs Go, so the go command is looked for here and not before; a run that does not find it
// ends with the sentence of goCommand, before it writes or compares a file.
// B2.488: the go.mod takes a line `// indirect` of each module of its graph (goModGraph), which the same downloads give,
// and the tracked go.mod of a module of the same repository is read from its directory in the checkout.
function withGoSum(t: Tracked): Tracked {
  const goModPath = `${goModuleDir(checked)}/go.mod`;
  const goMod = t.files.get(goModPath);
  // B2.460: a module of the same repository has no line in the tracked go.sum (sumRequires), so it starts no Go.
  if (goMod === undefined || releaseRequires(goMod).length === 0) return t;
  const goSumPath = `${goModuleDir(checked)}/go.sum`;
  const own = /^module (\S+)$/m.exec(goMod)?.[1] ?? '';
  // B2.529: the directory is made once the go is found, so a refusal for a go that is not found, which ends the process
  // without its finally, leaves none behind.
  let dir: string | undefined;
  try {
    const download = (module: string): GoDownload[] => {
      const resolved = goCommand(go, process.env, `${join(root, goModPath)} requires the release ${sumRequires(module).join(', ')} of another polyspec Go module, so its go.sum is written from \`go mod download\` (GN-15l)`);
      if ('refusal' in resolved) fail(resolved.refusal);
      const [program, ...prefix] = resolved.command;
      dir ??= mkdtempSync(join(tmpdir(), 'binding-go-sum-'));
      writeFileSync(join(dir, 'go.mod'), module);
      const ran = spawnSync(program, [...prefix, 'mod', 'download', '-json', 'all'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GOWORK: 'off', GOFLAGS: '-mod=mod' } });
      if (ran.error !== undefined) throw new Error(`go mod download did not start: ${ran.error.message}`);
      const text = ran.stdout.trim();
      const downloads = text === '' ? [] : (JSON.parse(`[${text.replace(/\}\s*\{/g, '},{')}]`) as GoDownload[]);
      if (ran.status !== 0 && !downloads.some((d) => d.Error !== undefined)) throw new Error(`go mod download (status ${String(ran.status)}): ${ran.stderr.trim()}`);
      return downloads;
    };
    // GN-14f: a module of the same repository is at the directory of its module path below the root.
    const sibling = (module: string): string | undefined => {
      const path = join(root, module.split('/').slice(3).join('/'), 'go.mod');
      return module.split('/').slice(0, 3).join('/') === own.split('/').slice(0, 3).join('/') && existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    };
    const graph = goModGraph(goMod, download, sibling);
    const files = new Map([...t.files, [goModPath, graph.goMod]]);
    if (graph.goSum !== undefined) files.set(goSumPath, graph.goSum);
    return { files, refused: t.refused };
  } catch (error) {
    return { files: t.files, refused: [...t.refused, { path: goSumPath, message: error instanceof Error ? error.message : String(error) }] };
  } finally {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
}
const tracked: Tracked = command === 'generate' ? { files: new Map(), refused: [] } : withGoSum(trackedOf());

if (command === 'check') {
  // L-2: each tracked file of the binding packages is what binding scaffold writes.
  let differs = false;
  // CK-20: the polyspec-binding-core that the repository's Cargo.lock pins is the one of this binding, because one
  // release gives both and the generated code is written for that crate (L-2): of its version for a release, and of
  // the commit that this binding was checked out at for a git dependency.
  const own = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  const lockPath = join(root, 'Cargo.lock');
  const lock = existsSync(lockPath) ? (parse(readFileSync(lockPath, 'utf8')) as { package?: { name: string; version: string; source?: string }[] }) : undefined;
  const pins = (lock?.package ?? []).filter((p) => p.name === 'polyspec-binding-core');
  const pinned = pins.map((p) => p.version);
  if (pinned.length !== 1 || pinned[0] !== own) {
    differs = true;
    const found = lock === undefined ? 'there is no Cargo.lock' : pinned.length === 0 ? 'Cargo.lock pins no polyspec-binding-core' : `Cargo.lock pins polyspec-binding-core ${pinned.join(', ')}`;
    process.stderr.write(`${lockPath}: CK-20 ${found}, not ${own}, the version of this binding (L-2)\n`);
  } else if (pins[0]?.source?.startsWith('git+') === true) {
    const finding = gitPinDiffers(pins[0].source, own, ownCommit(resolve(dirname(new URL(import.meta.url).pathname), '..')));
    if (finding !== undefined) {
      differs = true;
      process.stderr.write(`${lockPath}: CK-20 ${finding} (L-2)\n`);
    }
  }
  // CK-65 (GN-5): a core with fault injection points has itself as a dev-dependency with fault-test, so cargo test of
  // the core without flags arms them, in every repository alike.
  if ((checked.faults ?? []).length > 0) {
    const coreDir = join(root, checked.core.path);
    const own = (manifest['dev-dependencies'] ?? {})[checked.core.crate];
    const entry = typeof own === 'object' && own !== null ? (own as { path?: unknown; features?: unknown }) : undefined;
    const itself = typeof entry?.path === 'string' && resolve(coreDir, entry.path) === resolve(coreDir);
    const armed = Array.isArray(entry?.features) && entry.features.includes('fault-test');
    if (!itself || !armed) {
      differs = true;
      process.stderr.write(`${join(coreDir, 'Cargo.toml')}: CK-65 the core ${checked.core.crate} has fault injection points, but its [dev-dependencies] name no ${checked.core.crate} = { path = ".", features = ["fault-test"] }, so cargo test without flags does not arm them (GN-5)\n`);
    }
  }
  // CK-109 (GN-3e): the line of the core on polyspec-binding-core names no tag of another version than this binding.
  const tagFinding = bindingCoreTagFinding(coreDependencies.get(BINDING_CORE), generator.version);
  if (tagFinding !== undefined) {
    differs = true;
    process.stderr.write(`${join(root, checked.core.path, 'Cargo.toml')}: ${tagFinding}\n`);
  }
  // CK-71 (GN-3f): the core names the licence that the manifests of its binding packages carry.
  if (coreLicense === undefined) {
    differs = true;
    process.stderr.write(`${join(root, checked.core.path, 'Cargo.toml')}: CK-71 the core ${checked.core.crate} names no license, which every manifest of its binding packages carries (GN-3f)\n`);
  }
  // CK-91 (GN-15i): the release profile that builds the Go static library turns on no LTO, which puts the standard
  // library into the one object of the library, so that two such libraries do not link in one Go program.
  if (checked.targets.includes('go')) {
    for (const file of [join(root, 'Cargo.toml'), join(root, '.cargo/config.toml')]) {
      if (!existsSync(file)) continue;
      let lto: unknown;
      try {
        lto = (parse(readFileSync(file, 'utf8')) as { profile?: { release?: { lto?: unknown } } }).profile?.release?.lto;
      } catch {
        // not TOML: Cargo names the file
        continue;
      }
      if (lto === undefined || lto === false || lto === 'off') continue;
      differs = true;
      process.stderr.write(`${file}: CK-91 [profile.release] turns on LTO (lto = ${JSON.stringify(lto)}), which puts the standard library into the one object of the Go static library, so that a Go program cannot link it with the static library of another repository (GN-15i)\n`);
    }
  }
  // CK-94 (GN-19h): the Makefile of the repository includes the release recipes that binding writes and copies none of
  // them, and a file of recipes that a run wrote is the one that this binding writes. The file is not tracked, so a
  // checkout without it is no finding: the release writes it before it runs a recipe.
  {
    const recipes = releaseRecipes(checked);
    const fragment = join(root, recipes.path);
    if (existsSync(fragment) && readFileSync(fragment, 'utf8') !== recipes.text) {
      differs = true;
      process.stderr.write(`${fragment}: CK-94 differs from what binding release-recipes writes for the contract; binding release-recipes writes it again (GN-19h)\n`);
    }
    if (existsSync(fragment)) {
      for (const f of cargoFindings(readFileSync(fragment, 'utf8'))) {
        differs = true;
        process.stderr.write(`${fragment}:${String(f.line)}: ${f.message}\n`);
      }
    }
    const makefile = join(root, 'Makefile');
    if (existsSync(makefile)) {
      const lines = readFileSync(makefile, 'utf8').split('\n');
      const file = recipes.path.replaceAll('.', '\\.');
      if (!lines.some((line) => new RegExp(`^\\s*-?include\\s+(.*[\\s/])?${file}(\\s|$)`).test(line))) {
        differs = true;
        process.stderr.write(`${makefile}: CK-94 includes no ${recipes.path}, the release recipes that binding release-recipes writes for the contract (GN-19h)\n`);
      }
      // A rule of a target of the recipes with a recipe of its own is a copy by hand; a rule that adds a prerequisite is none.
      const own = new Set(recipes.targets);
      lines.forEach((line, i) => {
        const rule = /^([^\s:=#.][^:=#]*?)\s*::?(?!=)(.*)$/.exec(line);
        if (rule === null) return;
        const recipe = (rule[2] ?? '').includes(';') || (lines[i + 1] ?? '').startsWith('\t');
        for (const target of (rule[1] ?? '').split(/\s+/)) {
          if (!recipe || !own.has(target)) continue;
          differs = true;
          process.stderr.write(`${makefile}: CK-94 defines the recipe of ${target}, which ${recipes.path} holds; the Makefile includes the recipes that binding writes and copies none of them (GN-19h)\n`);
        }
      });
    }
  }
  // CK-70: the check of a release reports each dependency line of the core on another library in a development form.
  if (options.has('--release')) {
    const armedPoints = casePointLibraries(checked, caseFiles);
    // B2.457: beside the lines from which scaffold writes the manifests, every other polyspec line of the manifest of
    // the core, in each table that names a crate ([dev-dependencies] and the tables of a target among them).
    for (const message of [
      ...releaseFindings(checked, coreDependencies, armedPoints, foreign as ReadonlyMap<string, Contract>),
      ...manifestReleaseFindings(manifest, checked.core.path, new Set(releaseJudged(checked, coreDependencies, armedPoints, foreign as ReadonlyMap<string, Contract>)), workspaceDependencies),
    ]) {
      differs = true;
      process.stderr.write(`${join(root, checked.core.path, 'Cargo.toml')}: CK-70 ${message}\n`);
    }
    // The line on polyspec-binding-core of each tracked binding crate, as the repository holds it, and its other
    // polyspec lines; then those of the root manifest, [patch] among them.
    for (const path of [...[...tracked.files.keys()].filter((file) => file.endsWith('/Cargo.toml')), 'Cargo.toml']) {
      let messages: string[] = [];
      try {
        const read: unknown = existsSync(join(root, path)) ? parse(readFileSync(join(root, path), 'utf8')) : undefined;
        const own = path === 'Cargo.toml' ? undefined : bindingCoreFinding(read, workspaceDependencies);
        messages = read === undefined ? [] : [...(own === undefined ? [] : [own]), ...manifestReleaseFindings(read, path === 'Cargo.toml' ? '.' : path.slice(0, -'/Cargo.toml'.length), new Set(path === 'Cargo.toml' ? [] : ['polyspec-binding-core']), workspaceDependencies)];
      } catch {
        // not TOML: CK-19 reports the file
      }
      for (const message of messages) {
        differs = true;
        process.stderr.write(`${join(root, path)}: CK-70 ${message}\n`);
      }
    }
  }
  // CK-102 (B2.471): the check of a release reads the settings that the release recipes of the contract read, with the
  // readers of the recipes, so a setting that only a recipe after the tag reads is missed before the tag.
  if (options.has('--release')) {
    for (const { path, message } of releaseSettingFindings(checked, root)) {
      differs = true;
      process.stderr.write(`${join(root, path)}: CK-102 ${message}\n`);
    }
    // B2.473: each requirement of the go.mod of the Go module is imported by a file that the released form carries,
    // judged by the function of `binding release-go-module` on the generated files as binding writes them, so a
    // requirement that only a test or a program uses fails before a tag.
    if (checked.targets.includes('go')) {
      const goModPath = join(root, goModuleDir(checked), 'go.mod');
      try {
        const prefix = `${goModuleDir(checked)}/`;
        const written = generateOnStack({ contract: checked, version: version as string, coreLib: manifest.lib?.name ?? (core?.name ?? '').replaceAll('-', '_'), caseFiles, foreign: foreign as ReadonlyMap<string, Contract>, targets: ['go'] });
        const generated = new Map([...written].filter(([path]) => path.startsWith(prefix) && isGoGenerated(path)).map(([path, text]) => [path.slice(prefix.length), String(text)]));
        const judged = goModUnusedOf(join(root, goModuleDir(checked)), generated);
        for (const finding of judged?.findings ?? []) {
          differs = true;
          process.stderr.write(`${goModPath}: CK-102 release-go-module: ${finding}\n`);
        }
        for (const line of judged?.notJudged ?? []) process.stderr.write(`${goModPath}: CK-102 release-go-module: ${line}\n`);
      } catch (error) {
        differs = true;
        for (const sentence of sentences(error)) process.stderr.write(`${goModPath}: CK-102 release-go-module: the requirements of go.mod are not judged, because the Go binding is not generated: ${sentence}\n`);
      }
    }
  }
  const names = failedChecks.has('CK-18');
  if (names) process.stderr.write(`${contractPath}: CK-19 did not run: it compares with what binding scaffold writes, which needs the package names of CK-18\n`);
  // GN-3e: a package that scaffold cannot write is a finding with its reason.
  for (const { path, message } of names ? [] : tracked.refused) {
    differs = true;
    process.stderr.write(`${join(root, path)}: CK-19 binding scaffold does not write it: ${message} (L-2)\n`);
  }
  for (const [path, text] of names ? [] : tracked.files) {
    const full = join(root, path);
    const found = existsSync(full) ? readFileSync(full, 'utf8') : undefined;
    if (found !== text) {
      differs = true;
      process.stderr.write(`${full}: CK-19 ${found === undefined ? 'is missing' : 'differs from what binding scaffold writes'} (L-2)\n`);
    }
  }
  // L-2a: a host package's manifest holds what its native module and its release need (GN-3b).
  for (const requirement of names ? [] : hostRequirements(checked, parse, coreLicense, foreign as ReadonlyMap<string, Contract>)) {
    const full = join(root, requirement.path);
    let found: unknown;
    try {
      found = existsSync(full) ? requirement.found(readFileSync(full, 'utf8')) : undefined;
    } catch {
      found = undefined;
    }
    if (!isDeepStrictEqual(found, requirement.want)) {
      differs = true;
      process.stderr.write(`${full}: CK-19 ${requirement.item} is ${found === undefined ? 'missing' : JSON.stringify(found)}, not ${JSON.stringify(requirement.want)}, which the native module and its release need (L-2a, GN-3f)\n`);
    }
  }
  process.exit(differs || findings.length > 0 ? 1 : 0);
}

if (command === 'scaffold') {
  // --out writes the same files under another directory, as for generate.
  const target = resolve(options.get('--out') ?? root);
  // GN-3e: without the contracts that Cargo finds, the libraries that only a callback unit names and the Go modules of
  // the libraries are not known, so scaffold writes no file rather than manifests that read as complete.
  if (metadataFailure !== undefined) {
    process.stderr.write(`binding: the contracts of the libraries that the contract names are not all found, so binding scaffold writes no file (GN-3e): ${metadataFailure}\n`);
    process.exit(1);
  }
  for (const [path, text] of tracked.files) {
    mkdirSync(dirname(join(target, path)), { recursive: true });
    writeFileSync(join(target, path), text);
  }
  // GN-3e: a package that cannot be written is named with its reason after the others are written.
  for (const { path, message } of tracked.refused) process.stderr.write(`binding: ${path}: not written: ${message}\n`);
  process.exit(tracked.refused.length > 0 ? 1 : 0);
}

const lib = { name: manifest.lib?.name ?? core.name.replaceAll('-', '_') };
// GN-1b: --target generates those targets of the contract alone and writes their directories; the others are kept.
const targets = options.get('--target')?.split(',') as Lang[] | undefined ?? checked.targets;
const notTargets = targets.filter((target) => !checked.targets.includes(target));
if (notTargets.length > 0) usage(`--target names ${notTargets.join(', ')}, which the contract does not name in targets`);
// GN-1c: each target is generated by itself, so a target that the generator refuses does not stop another; the files of
// every target that refuses nothing are written, and each refused target is named with its items (G-4).
const files: ReturnType<typeof generate> = new Map();
const refused: { target: Lang; refusals: string[] }[] = [];
for (const target of targets) {
  try {
    // GN-1c, GN-13e: on a thread whose stack holds the nesting of any case value.
    for (const [path, text] of generateOnStack({ contract: checked, version, coreLib: lib.name, caseFiles, foreign: foreign as ReadonlyMap<string, Contract>, targets: [target] })) files.set(path, text);
  } catch (error) {
    refused.push({ target, refusals: sentences(error) });
  }
}
const out = resolve(options.get('--out') ?? root);
const owned = generatedDirs(checked);
const goDir = goModuleDir(checked);
const ownedFile = (path: string): boolean => path.startsWith(`${goDir}/`) && isGoGenerated(path);
for (const path of files.keys()) {
  if (!owned.some((dir) => path.startsWith(`${dir}/`)) && !ownedFile(path)) fail(`internal: ${path} is outside the generated directories`);
}
// Each owned directory of a target is written whole into a staging directory and then renamed into place, so a reader
// never sees a part of it and no file of an earlier generation stays.
for (const dir of owned) {
  if (![...files.keys()].some((path) => path.startsWith(`${dir}/`))) continue;
  const staging = join(out, `${dir}.staging`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  for (const [path, text] of files) {
    if (!path.startsWith(`${dir}/`)) continue;
    const target = join(staging, path.slice(dir.length + 1));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  rmSync(join(out, dir), { recursive: true, force: true });
  renameSync(staging, join(out, dir));
}
// L-1: the tracked Go files zz_generated_*.go. Every one under the Go module is removed, so none of an earlier generation
// stays, and the new ones are written; the other files of the module (go.mod, host, tests) are not touched.
if (targets.includes('go') && !refused.some((r) => r.target === 'go')) {
  const remove = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) remove(path);
      else if (isGoGenerated(entry.name)) rmSync(path);
    }
  };
  remove(join(out, goDir));
  for (const [path, text] of files) {
    if (!ownedFile(path)) continue;
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), text);
  }
}
// G-4: a refused target fails the generation after the other targets are written, each item on its own line.
if (refused.length > 0) {
  const lines = refused.map(({ target, refusals }) => `${target}: not generated (G-4), ${refusals.length} item${refusals.length === 1 ? '' : 's'}:\n${refusals.map((line) => `  ${line}\n`).join('')}`);
  const written = targets.filter((target) => !refused.some((r) => r.target === target));
  fail(`${lines.join('')}${written.length === 0 ? 'no target was generated' : `generated: ${written.join(', ')}`}`);
}
