// GN-14f: the released form of a Go module in the end-to-end check. A release carries the Go module in a commit that
// the tag <directory of the Go module>/vX.Y.Z names (GN-15g); the run makes that commit and tag in a repository of its
// work directory, which Git reads in place of the remote, and a consumer module requires the Go module at that tag.

export interface GoRemote {
  owner: string;
  repository: string;
  // The directory of the Go module in its repository, '' for a module at the root.
  directory: string;
  // The tag that Go reads for the version of a module in that directory.
  tag: string;
}

// The repository, the directory and the tag of a Go module on GitHub, whose repository is the first three elements of
// the module path. A module of another form is refused by name: the run has no repository to stand for its remote.
export function goRemote(module: string, version: string): GoRemote {
  const [host, owner, repository, ...rest] = module.split('/');
  if (host !== 'github.com' || owner === undefined || owner === '' || repository === undefined || repository === '') {
    throw new Error(`${module}: the Go module is not github.com/<owner>/<repository>[/<directory>], so the run has no repository that stands for its remote (GN-14f)`);
  }
  const directory = rest.join('/');
  return { owner, repository, directory, tag: directory === '' ? version : `${directory}/${version}` };
}

// The version that a go.mod requires of a module, from a line `require <module> <version>` or a line of a block
// `require (...)`; undefined when it requires none.
export function requiredVersion(goMod: string, module: string): string | undefined {
  for (const line of goMod.split('\n')) {
    const words = line.trim().split(/\s+/);
    const at = words[0] === 'require' ? 1 : 0;
    if (words[at] === module && words[at + 1] !== undefined) return words[at + 1];
  }
  return undefined;
}

// GN-14d, GN-15f: the go.work of the run. A dependency line of the core in the development form (a branch, a commit, a
// range) gives a require of v0.0.0 and no replace in go.mod, which a development checkout resolves through its
// untracked go.work; the run resolves it in the same way, to the Go module of the copy of that repository in the run,
// as the other targets install the packages of the copies of DEPS. A module that go.mod replaces is resolved by the
// replace, and Go refuses a workspace module that go.mod also replaces, so it stays out. No such dependency: no file.
export function goWork(goMod: string, own: string, deps: readonly { module: string; dir: string }[]): string | undefined {
  const replaced = (module: string): boolean => goMod.split('\n').some((line) => {
    const words = line.trim().split(/\s+/);
    return words[words[0] === 'replace' ? 1 : 0] === module && words.includes('=>');
  });
  const used = deps.filter((d) => requiredVersion(goMod, d.module) === 'v0.0.0' && !replaced(d.module)).map((d) => d.dir);
  if (used.length === 0) return undefined;
  const version = /^go (\S+)$/m.exec(goMod)?.[1];
  if (version === undefined) throw new Error('the go.mod of the Go module names no Go version, which its go.work needs (GN-15)');
  return `go ${version}\n\nuse (\n${[own, ...used].map((dir) => `\t${dir}\n`).join('')})\n`;
}

export interface Required {
  module: string;
  version: string;
  // The packages of the module that a consumer can import, each by its directory in the module, '' for the root.
  packages: string[];
}

// The files of the consumer module: a go.mod that requires each module at its version and nothing else, with no
// replace, and a test that imports every package of each module, so the program of the test links each library.
export function consumerFiles(goVersion: string, required: readonly Required[]): Map<string, string> {
  const imports = required.flatMap((r) => r.packages.map((dir) => `\t_ "${dir === '' ? r.module : `${r.module}/${dir}`}"`));
  return new Map([
    ['go.mod', `module example.invalid/consumer\n\ngo ${goVersion}\n\n${required.map((r) => `require ${r.module} ${r.version}\n`).join('')}`],
    ['consumer_test.go', [
      'package consumer',
      '',
      'import (',
      '\t"testing"',
      '',
      ...imports,
      ')',
      '',
      '// TestLinked passes when the program of the consumer links the static library that each module carries.',
      'func TestLinked(t *testing.T) {}',
      '',
    ].join('\n')],
  ]);
}

// GN-15g: the debug sections of a static library, from the output of `llvm-size -A`, which gives for each member of the
// archive a line of each section with its name and its size. A section whose name holds `debug` after its leading
// dots or underscores (__debug_info of Mach-O, .debug_info and .zdebug_info of ELF) and whose size is not 0 is named
// once, in the order of the names.
export function debugSections(sizes: string): string[] {
  const found = new Set<string>();
  for (const line of sizes.split('\n')) {
    const [name, size] = line.trim().split(/\s+/);
    if (name !== undefined && /^[._]+z?debug/.test(name) && size !== undefined && /^[1-9][0-9]*$/.test(size)) found.add(name);
  }
  return [...found].sort();
}
