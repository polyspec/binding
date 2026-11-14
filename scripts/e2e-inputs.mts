// GN-14b: the files that a run of the end-to-end check reads from the checkout that starts it, and not from the tree
// of the commit that it checks. A run is evidence of the commit only when each of these files of the working tree is
// the file of the commit, without a committed, uncommitted or untracked change; otherwise the run is a diagnosis. The
// list is closed: every tracked file of binding outside packages/, tests/ and docs/ that is not a document is either
// read (READ_FROM_CHECKOUT) or not (NOT_READ), each with its reason, and a test of packages/ts fails a tracked file
// that is in neither, so a new file of the checkout cannot reach a run unseen.

export interface Input {
  path: string;
  why: string;
}

export const READ_FROM_CHECKOUT: readonly Input[] = [
  { path: 'Makefile', why: 'make e2e runs its recipe, which sets the environment of mise and the PATH of var/tools' },
  { path: 'scripts/e2e.mts', why: 'the script of the checkout writes the tree of the commit and starts the script of that tree' },
  { path: 'scripts/e2e-inputs.mts', why: 'the script of the checkout reads this list' },
  { path: 'scripts/e2e-lint.mts', why: 'the script of the checkout imports it, which names the lints of a binding crate' },
  { path: 'scripts/e2e-npm.mts', why: 'the script of the checkout imports it, which names the npm packages that a run packs' },
  { path: 'scripts/e2e-work.mts', why: 'the script of the checkout makes the work directory of the run with it and runs the commands of the run in it' },
  { path: 'scripts/go-test-events.mts', why: 'the script of the checkout imports it, which reads the events of go test -json' },
  { path: 'mise.toml', why: 'mise runs the tools of var/tools that it declares, and the run reads it as the global configuration of mise' },
  { path: 'mise.lock', why: 'it pins the digests of the tools of mise.toml that var/tools holds' },
  { path: '.mise/locks/npm-npm/12.2.0/package.json', why: 'mise installs the npm of mise.toml from it' },
  { path: '.mise/locks/npm-npm/12.2.0/aube-lock.yaml', why: 'it pins the integrity of the npm of mise.toml' },
  { path: 'rust-toolchain.toml', why: 'its channel is the Rust toolchain of every command (RUSTUP_TOOLCHAIN), with the components and targets that make install installs' },
  { path: '.php-version', why: 'the run compares the minor of var/tools/bin/php with it' },
  { path: 'config/toolchain.json', why: 'it pins the mise of var/tools and the release of PHPUnit' },
  { path: 'config/phpunit/composer.json', why: 'it declares the PHPUnit of var/tools/phpunit that runs the PHP tests' },
  { path: 'config/phpunit/composer.lock', why: 'it pins the PHPUnit of var/tools/phpunit' },
  { path: 'package.json', why: 'its devEngines name the npm, and it declares @polyspec/kit, which installs the tools of var/tools' },
  { path: 'package-lock.json', why: 'it pins @polyspec/kit, which installs the tools of var/tools' },
  { path: '.npmrc', why: 'it sets the npm that installs the packages of the checkout' },
  { path: '.gitignore', why: 'the run finds an untracked file of this list with git ls-files --exclude-standard, which reads it' },
];

export const NOT_READ: readonly Input[] = [
  { path: '.gitattributes', why: 'git archive reads the attributes of the tree of the commit, and git diff --name-only names a file whatever its attributes' },
  { path: '.githooks/commit-msg', why: 'Git runs it before a commit of a checkout where make hooks ran; a run of make e2e does not commit' },
  { path: '.github/actions/bootstrap/action.yml', why: 'GitHub runs it in a job of CI or of the release; a run of make e2e does not start it' },
  { path: '.github/workflows/ci.yml', why: 'GitHub runs it on a push or a manual run; a run of make e2e does not read it' },
  { path: '.github/workflows/release.yml', why: 'GitHub runs it after a successful CI run; a run of make e2e does not read it' },
  { path: 'config/checklist.json', why: 'make docs-check reads it to check the checklists of docs/plans; a run of make e2e does not' },
  { path: 'config/documents.json', why: 'make docs-check and make documents-stamp read it to select the documents; a run of make e2e does not' },
  { path: 'config/release.json', why: 'the release targets of the Makefile read it to classify and pack the package files; a run of make e2e does not' },
  { path: 'scripts/go-musl.sh', why: 'make go-musl-check runs it after a run, on the work directory that the run kept; a run of make e2e does not read it' },
];
