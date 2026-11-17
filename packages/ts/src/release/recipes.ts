// GN-19h: the release recipes of a repository that holds a binding. Every such repository builds the assets of its
// platforms with the same standard tools and the same steps (GN-19a to GN-19g); only the names of its crates, packages
// and labels differ, and those follow from its contract. So binding writes the recipes as a make file that the
// repository's Makefile includes, and `binding check` reports a Makefile that does not include them, that copies a
// recipe by hand, or a file of recipes that this binding would write otherwise (CK-94).
//
// The text holds no `${` of the shell: make passes `$$` to the shell, and every expansion of a variable of the shell is
// written `$$name`, so a template literal of this file interpolates only the values of the contract.

import { spawnSync } from 'node:child_process';
import type { Contract } from '../contract.ts';
import { addonName, componentBase, extensionName, MATURIN, NODE_PLATFORMS, place, WASM_BINDGEN } from '../generate/packages.ts';
import { CARRIED_LIBRARIES, goModulePlaceFinding } from './go-module.ts';

// The steps of a release in the order that GN-19h names them; a contract has those of its targets.
// GN-19c: the manylinux policy of a Linux wheel. The PEP 517 backend of maturin passes --compatibility off unless it is
// given one, which tags a wheel linux_<arch>, a tag that PyPI refuses and pip installs on no other system. Rust std links
// pthread_key_create and pthread_setspecific at GLIBC_2.34 against the glibc of the ubuntu-26.04 runners (GN-19a),
// so manylinux_2_34 is the lowest policy that their builds meet; maturin refuses a library that needs a later symbol.
export const MANYLINUX = 'manylinux_2_34';

export const RELEASE_STEPS = ['release-go-static', 'release-wheel', 'release-php-ext', 'release-npm-platform', 'release-npm', 'release-go-module', 'release-binding-check', 'release-platform-assets'] as const;

// GN-19i: the build recipe of each job of the workflow assets.yml, which the recipe ci-assets-<job> of the repository runs
// after make release-recipes.
export const ASSET_JOBS = ['release-assets-platform', 'release-assets-php', 'release-assets-npm'] as const;

// GN-3c: the recipe that puts the Node addon of a checkout beside the generated entry, which loads it from there when
// the platform package is not installed (B2.407).
export const CHECKOUT_STEPS = ['checkout-node-addon'] as const;

// GN-19f, B2.479: the recipe that rehearses a step of a release before the tag, with no commit and no tag.
export const REHEARSAL_STEPS = ['rehearse-go-module'] as const;

export interface Recipes {
  // The path of the file of recipes from the root of the repository, beside the packages of the contract.
  path: string;
  // The targets that the file defines for the contract, which the Makefile does not define by hand (CK-94).
  targets: string[];
  text: string;
}

// The platforms of a release (GN-19a): the Rust triple of the host, the napi name of its platform, the directory of the
// Go module, the part of the name of a PHP extension archive, the musl triple whose Go library a Linux host also builds
// (GN-19b), and the platform part of a wheel name that maturin writes (GN-19c). The napi name is that of the triple in
// NODE_PLATFORMS, the one table of the platform names of T-2, which the generated entry computes too (GN-3c).
const platformOf = (triple: string): string => {
  const found = NODE_PLATFORMS.find((p) => p.triple === triple);
  if (found === undefined) throw new Error(`${triple} is no platform of NODE_PLATFORMS`);
  return found.name;
};
const PLATFORMS = [
  { triple: 'x86_64-unknown-linux-gnu', go: 'linux_amd64', pie: 'x86_64-linux-glibc', musl: 'x86_64-unknown-linux-musl', wheel: '*manylinux*_x86_64.whl' },
  { triple: 'aarch64-unknown-linux-gnu', go: 'linux_arm64', pie: 'arm64-linux-glibc', musl: 'aarch64-unknown-linux-musl', wheel: '*manylinux*_aarch64.whl' },
  { triple: 'aarch64-apple-darwin', go: 'darwin_arm64', pie: 'arm64-darwin-bsdlibc', musl: '', wheel: '*macosx*_arm64.whl' },
].map((p) => ({ ...p, platform: platformOf(p.triple) }));
// GN-19b, B2.442: the musl targets of the release, and the part of the names of the variables of the C compiler and the
// archiver of a target, CC_<part> and AR_<part>: the target with its dashes as underscores, the second of the names
// that the crate cc reads for a target and the one that make and the shell can hold.
const MUSL_TARGETS = PLATFORMS.map((p) => p.musl).filter((musl) => musl !== '');
const muslEnv = (target: string): string => target.replaceAll('-', '_');

// GN-19d: the script of sed by which the recipes read the major release of LLVM from config/toolchain.json: the value of
// a line "version": "<major>" between a line "llvm": { and the next }. It reads the lines of the file, so a file on one
// line pins none for it. The check of a release reads the file with the same script (releaseSettingFindings).
export const LLVM_MAJOR_SED = String.raw`/"llvm": {/,/}/s/^ *"version": "\([0-9]*\)".*/\1/p`;
// What a recipe and the check of a release say of a config/toolchain.json from which that script reads no major. The
// text stands in single quotes of the shell in a line of make, so it holds no single quote and no $.
const NO_LLVM_MAJOR = 'config/toolchain.json pins no major release of LLVM (llvm.version), which the recipe reads from a line "version": "<major>" under a line "llvm": { (GN-19d)';

const SHARED = `# ---- Shared by the recipes of every contract of the repository ----------------------------------------------------
ifndef BINDING_RELEASE_SHARED
BINDING_RELEASE_SHARED := 1
# The assets of a release and the target directory of its builds, so that an asset holds nothing of a development build.
RELEASE_ASSETS ?= var/release/assets
RELEASE_TARGET ?= var/release/target
# The napi CLI of the devDependency @napi-rs/cli of the repository, the wasm-bindgen CLI and the maturin of mise.toml and
# the mise of the checkout, by their absolute paths (GN-19c, GN-19e).
NAPI ?= $(CURDIR)/node_modules/.bin/napi
WASM_BINDGEN ?= $(CURDIR)/var/tools/mise/shims/wasm-bindgen
MATURIN ?= $(CURDIR)/var/tools/mise/shims/maturin
MISE ?= $(CURDIR)/var/tools/bin/mise
# The go command, which binding starts for the go.sum of a go.mod that requires the release of another polyspec Go
# module (binding check, GN-15l) and for the consumer that proves the Go module of a release (binding release-go-module,
# GN-19f): the go of PATH unless it is given. binding names it and this variable when it needs Go and does not find it.
GO ?= go
# Cargo names a cdylib lib<name>.dylib on macOS and lib<name>.so on Linux.
BINDING_CDYLIB := $(if $(filter Darwin,$(shell uname -s)),dylib,so)
# The bindgen of ext-php-rs loads a libclang through clang-sys, which takes the libclang of the highest LLVM that it finds,
# and asks the clang of PATH for the directories of the headers that it includes; on a machine with several LLVM releases
# the two differ and the build fails. So the build takes the libclang (LIBCLANG_PATH) and the clang (CLANG_PATH) of the
# one LLVM whose major release config/toolchain.json pins (llvm.version), from LLVM_ROOT: /usr/lib/llvm-<major> on Linux
# and the Homebrew formula llvm@<major> on macOS unless it is given (GN-19d).
LLVM_MAJOR ?= $(shell sed -n '${LLVM_MAJOR_SED}' config/toolchain.json 2>/dev/null)
LLVM_ROOT ?= $(if $(filter Darwin,$(shell uname -s)),/opt/homebrew/opt/llvm@$(LLVM_MAJOR),/usr/lib/llvm-$(LLVM_MAJOR))
# binding_require stops the target $@ when the variable $(1) is empty, naming it and what it holds ($(2)).
binding_require = test -n "$($(1))" || { echo "$@ needs $(1): $(2); define it before the include of $(3) (GN-19h)" >&2; exit 2; }
# binding_release_host sets host to the Rust triple of the toolchain, platform to the napi name of its platform, go to the
# directory of the Go module, pie to the part of the name of a PHP extension archive and, on Linux, musl to the musl
# triple of its arch (GN-19a, GN-19b); it ends the recipe $(1) with 2 on a host that is no platform of the release.
binding_release_host = host=$$(rustc --print host-tuple) || exit 1; \\
	case "$$host" in \\
${PLATFORMS.map((p) => `	${p.triple}) platform=${p.platform} go=${p.go} pie=${p.pie} musl=${p.musl} ;; \\`).join('\n')}
	*) echo "$(1): the host $$host is no platform of the release: ${PLATFORMS.map((p) => p.triple).join(', ')}" >&2; exit 2 ;; \\
	esac
# binding_release_pack packs the npm package of the folder $(1) with npm pack --ignore-scripts into the fresh folder $(2),
# and renames each archive into RELEASE_ASSETS/npm from a copy of another name, so the assets never hold a half written one.
binding_release_pack = (cd $(1) && $(NPM) pack --ignore-scripts --pack-destination $(2)); \\
	mkdir -p $(RELEASE_ASSETS)/npm; \\
	for file in $(2)/*.tgz; do \\
	name=$$(basename "$$file"); \\
	cp "$$file" "$(RELEASE_ASSETS)/npm/.$$name.part"; \\
	mv "$(RELEASE_ASSETS)/npm/.$$name.part" "$(RELEASE_ASSETS)/npm/$$name"; \\
	done
endif
`;

// GN-19f, B2.488: the one push of the tags of the Go modules of a repository, which the files of recipes of its
// contracts share, as install-wasm-bindgen is shared.
const GO_MODULE_PUSH = `ifndef BINDING_RELEASE_GO_MODULE_PUSH
BINDING_RELEASE_GO_MODULE_PUSH := 1
# release-go-module-push pushes the tags of the Go modules of the release TAG that each release-go-module of the repository
# added to RELEASE_TARGET/go-module-refs, all of them with one git push --atomic, so the remote takes every tag or none:
# a release whose second Go module fails keeps no tag of the first on the remote, and the same recipes run again. A
# reference of another tag than TAG in the file stops it before the push (GN-19f, B2.488).
.PHONY: release-go-module-push
release-go-module-push:
	@test -n "$$TAG" || { echo 'release-go-module-push: TAG is required, for example make release-go-module-push TAG=v0.0.1' >&2; exit 2; }
	@refs=$(abspath $(RELEASE_TARGET))/go-module-refs; \\
	set -e; \\
	if [ ! -s "$$refs" ]; then echo "release-go-module-push: no tag of a Go module of $$TAG waits in $$refs"; exit 0; fi; \\
	list=$$(sort -u "$$refs"); \\
	for ref in $$list; do \\
	case "$$ref" in refs/tags/*/"$$TAG") ;; *) echo "release-go-module-push: $$refs names $$ref, which is no tag of a Go module of $$TAG" >&2; exit 1 ;; esac; \\
	done; \\
	(set -x; git push --atomic origin $$list); \\
	rm -f "$$refs"
endif
`;

const INSTALL_WASM_BINDGEN = `ifndef BINDING_RELEASE_WASM_BINDGEN
BINDING_RELEASE_WASM_BINDGEN := 1
# install-wasm-bindgen installs the wasm-bindgen CLI alone with the mise of the checkout at the digest of mise.lock, for a
# job that needs no other tool of mise.toml.
.PHONY: install-wasm-bindgen
install-wasm-bindgen:
	$(ONLINE) $(MISE) install --locked github:wasm-bindgen/wasm-bindgen
endif
`;

// GN-19a: the script of Node.js that prints the PHP minors of the extension, phpExtension.minors of config/toolchain.json of
// the repository, separated by spaces, and ends with 2 and names the file when the list is missing, empty or holds a value
// that is no <major>.<minor>. The text is one argument in single quotes of the shell and a line of make, so it holds no
// single quote and writes each $ as $$.
function minorsScript(step: string): string {
  return 'const fs = require("fs"); let minors; '
    + 'try { minors = JSON.parse(fs.readFileSync("config/toolchain.json", "utf8")).phpExtension?.minors; } catch (error) { minors = undefined; } '
    + 'if (!Array.isArray(minors) || minors.length === 0 || !minors.every((minor) => typeof minor === "string" && /^[0-9]+[.][0-9]+$$/.test(minor))) { '
    + `console.error("${step}: config/toolchain.json names no PHP minor of the extension in phpExtension.minors, a list such as [\\"8.4\\", \\"8.5\\"] (GN-19a)"); process.exit(2); } `
    + 'console.log(minors.join(" "));';
}

// The text of the recipes of a contract (GN-19h).
export function releaseRecipes(contract: Contract): Recipes {
  const base = componentBase(contract);
  const path = `${base}/release.mk`;
  // A component's targets carry its name, so that the recipes of two contracts of one repository do not meet.
  const suffix = base === 'packages' ? '' : `-${base.slice('packages/'.length)}`;
  const name = (step: string): string => `${step}${suffix}`;
  const targets = contract.targets;
  const has = (lang: string): boolean => (targets as readonly string[]).includes(lang);
  const contractPath = `$(CURDIR)/${contract.core.path}/interface.json`;
  const crate = (kind: string): string => `polyspec-${contract.library}-${kind}`;
  const extension = extensionName(contract);
  const label = `polyspec-${contract.library}`;
  // B2.471: each variable of the Makefile that a recipe requires, with what it holds, in the order of the recipes;
  // release-binding-check requires all those of the release recipes of the contract.
  const required = new Map<string, string>();
  const require = (variable: string, what: string): string => {
    required.set(variable, what);
    return `\t@$(call binding_require,${variable},${what},${path})`;
  };
  // GN-1d: every command of binding that runs Cargo, and every call of Cargo, takes the cargo command of the repository,
  // and a build takes its arguments right after the subcommand.
  const generate = (lang: string): string => `\t$(BINDING_RUN) generate --contract ${contractPath} --target ${lang} --cargo "$(CARGO)"`;
  const head = (step: string, comment: string, prerequisites = '$(BINDING_DEP)'): string =>
    `${comment.split('\n').map((line) => `# ${line}`).join('\n')}\n.PHONY: ${name(step)}\n${name(step)}:${prerequisites === '' ? '' : ` ${prerequisites}`}`;
  const sections: string[] = [];
  const defined: string[] = [];
  const add = (step: (typeof RELEASE_STEPS)[number] | (typeof ASSET_JOBS)[number] | (typeof CHECKOUT_STEPS)[number] | (typeof REHEARSAL_STEPS)[number], text: string): void => {
    defined.push(name(step));
    sections.push(text);
  };

  if (has('go')) {
    const lib = `lib${extension}_go.a`;
    add('release-go-static', `${head('release-go-static', `release-go-static builds the static library of the Go module of the platform of the host (GN-19b) and, on a Linux host,
the one of the musl target of its arch into linux_<arch>_musl, because binding release-go-module requires the libraries of
five Go platforms. It strips the debug sections of a copy of each with the llvm-strip of the component llvm-tools of the
pinned toolchain, never the strip of PATH, and the stripped copy enters the assets under another name and is renamed there.
$(CARGO) rustc builds each library with the print of rustc, and the native-static-libs that it printed enter the file
native-static-libs beside the library, which binding release-go-module writes into the link file of the platform (GN-15k).
A library that they name and that the Rust toolchain ships for the target in its self-contained directory, which no C
compiler of the platform brings (libunwind.a of musl), is copied from there beside the library (GN-15k).
The build of the musl target, and no other, takes the C compiler and the archiver of that target that the Makefile
declares, CC_<target> and AR_<target> with the dashes of the target as underscores, the names that the crate cc reads
(GN-19b). When one of the two is empty and $(CARGO) tree names the crate cc in the build of the Go crate for the musl
target, a dependency builds C there, and the recipe fails before a build and names what is missing (B2.442).`)}
${require('BINDING_RUN', 'the command that starts binding')}
${require('CARGO', 'the cargo command of the repository')}
${generate('go')}
	@$(call binding_release_host,${name('release-go-static')}); \\
	case "$$musl" in \\
${MUSL_TARGETS.map((musl) => `	${musl}) musl_env=${muslEnv(musl)}; musl_cc="$(CC_${muslEnv(musl)})"; musl_ar="$(AR_${muslEnv(musl)})" ;; \\`).join('\n')}
	*) musl_env=; musl_cc=; musl_ar= ;; \\
	esac; \\
	if [ -n "$$musl" ] && { [ -z "$$musl_cc" ] || [ -z "$$musl_ar" ]; }; then \\
	closure=$$($(CARGO) tree --locked -p ${crate('go')} --target "$$musl" -e normal,build --prefix none --format '{p}') || exit 1; \\
	if printf '%s\\n' "$$closure" | grep -q '^cc v'; then \\
	missing=; \\
	[ -n "$$musl_cc" ] || missing="$$missing CC_$$musl_env"; \\
	[ -n "$$musl_ar" ] || missing="$$missing AR_$$musl_env"; \\
	echo "${name('release-go-static')} needs$$missing: the C compiler CC_$$musl_env and the archiver AR_$$musl_env of the target $$musl, which the crate cc reads, because a dependency of ${crate('go')} builds C with that crate; define them before the include of ${path} (GN-19b)" >&2; \\
	exit 2; \\
	fi; \\
	fi; \\
	set -ex; \\
	publish() { \\
	copy=$(RELEASE_TARGET)/stripped/$$2; \\
	mkdir -p "$$copy"; \\
	cp "$$1/${lib}" "$$copy/${lib}"; \\
	"$$(rustc --print sysroot)/lib/rustlib/$$host/bin/llvm-strip" --strip-debug "$$copy/${lib}"; \\
	out=$(RELEASE_ASSETS)/go/$$2; \\
	mkdir -p "$$out"; \\
	cp "$$copy/${lib}" "$$out/.${lib}.part"; \\
	mv "$$out/.${lib}.part" "$$out/${lib}"; \\
	}; \\
	build() { \\
	mkdir -p $(RELEASE_TARGET); \\
	log=$(RELEASE_TARGET)/native-static-libs-$$2.log; \\
	status=0; \\
	( [ -z "$$5" ] || export "CC_$$7=$$5"; [ -z "$$6" ] || export "AR_$$7=$$6"; CARGO_TARGET_DIR=$(RELEASE_TARGET) $(CARGO) rustc $(CARGOFLAGS) --release --locked --color never -p ${crate('go')} $$3 --lib --crate-type staticlib -- --print native-static-libs ) 2> "$$log" || status=$$?; \\
	cat "$$log" >&2; \\
	test "$$status" = 0 || exit "$$status"; \\
	libs=$$(sed -n 's/^note: native-static-libs: *//p' "$$log"); \\
	test -n "$$libs" || { echo "${name('release-go-static')}: cargo printed no native-static-libs of ${crate('go')} for $$2 (GN-15k)" >&2; exit 1; }; \\
	publish "$$1" "$$2"; \\
	for carried in ${CARRIED_LIBRARIES.join(' ')}; do \\
	case " $$libs " in *" -l$$carried "*) cp "$$(rustc --print sysroot)/lib/rustlib/$$4/lib/self-contained/lib$$carried.a" "$(RELEASE_ASSETS)/go/$$2/lib$$carried.a" ;; esac; \\
	done; \\
	printf '%s\\n' "$$libs" > "$(RELEASE_ASSETS)/go/$$2/.native-static-libs.part"; \\
	mv "$(RELEASE_ASSETS)/go/$$2/.native-static-libs.part" "$(RELEASE_ASSETS)/go/$$2/native-static-libs"; \\
	}; \\
	build $(RELEASE_TARGET)/release "$$go" '' "$$host"; \\
	if [ -n "$$musl" ]; then \\
	build "$(RELEASE_TARGET)/$$musl/release" "$$go"_musl "--target $$musl" "$$musl" "$$musl_cc" "$$musl_ar" "$$musl_env"; \\
	fi
`);
  }

  if (has('python')) {
    const step = name('release-wheel');
    add('release-wheel', `${head('release-wheel', `release-wheel builds the abi3 wheel of the platform of the host (GN-19c) with the maturin of MATURIN, which the mise
of the checkout installs at the digest of mise.lock and which must be the release ${MATURIN} of mise.toml, not with a
build backend that a PEP 517 frontend resolves from the requires of pyproject.toml (B2.491). maturin builds for release
with --locked and, on Linux, for the policy ${MANYLINUX}, which it checks, and the time of the commit of HEAD dates the
files of the wheel.`)}
${require('BINDING_RUN', 'the command that starts binding')}
${require('CARGO', 'the cargo command of the repository')}
	$(ONLINE) $(MISE) install --locked github:PyO3/maturin
	@test "$$($(MATURIN) --version)" = "maturin ${MATURIN}" || { echo "${step}: $(MATURIN) is $$($(MATURIN) --version), not the release ${MATURIN} of mise.toml (GN-19c)" >&2; exit 2; }
${generate('python')}
	@$(call binding_release_host,${step}); \\
	set -ex; \\
	epoch=$$(git log -1 --format=%ct HEAD); \\
	CARGO_TARGET_DIR=$(RELEASE_TARGET) SOURCE_DATE_EPOCH=$$epoch $(MATURIN) build --release --locked --compatibility ${MANYLINUX} --interpreter python3 --manifest-path ${base}/python/Cargo.toml --out $(RELEASE_ASSETS)/wheel
`);
  }

  if (has('php')) {
    const step = name('release-php-ext');
    add('release-php-ext', `${head('release-php-ext', `release-php-ext builds the PHP extension of the platform of the host for the PHP of PHP (GN-19d), with the php-config of
PHP_CONFIG when the command line gives it and the one beside that PHP otherwise, both resolved to absolute paths, because
the build script of ext-php-rs refuses a PHP that it cannot find by the path that PHP names. It builds with the libclang
and the clang of the LLVM of config/toolchain.json, which it checks first. Each PHP minor and build builds in its own
target directory, because the extension is compiled against the headers of that PHP. The extension must load into that
PHP without a php.ini before it is packed under the name by which PIE finds a pre-packaged binary. Optional
EXPECTED_PHP_MINOR is the expected major.minor; the selected runtime and php-config header minor must agree before
Cargo builds, and the recipe records their full versions. This checks the minor, not every ABI or patch flag.`)}
${require('BINDING_RUN', 'the command that starts binding')}
${require('CARGO', 'the cargo command of the repository')}
	@test -n "$(PHP)" || { echo '${step} needs PHP: the PHP to build for, for example make ${step} PHP=php' >&2; exit 2; }
	@test -z "$(EXPECTED_PHP_MINOR)" || printf '%s\\n' "$(EXPECTED_PHP_MINOR)" | grep -Eq '^[0-9]+\\.[0-9]+$$' || { echo '${step}: EXPECTED_PHP_MINOR must be major.minor (for example 8.4)' >&2; exit 2; }
	@test -n "$(LLVM_MAJOR)" || { echo '${step}: ${NO_LLVM_MAJOR}' >&2; exit 2; }
	@test -x "$(LLVM_ROOT)/bin/clang" && ls "$(LLVM_ROOT)/lib" 2>/dev/null | grep -q '^libclang' || { echo '${step}: the bindgen of ext-php-rs needs the libclang and the clang of LLVM $(LLVM_MAJOR) (config/toolchain.json) in $(LLVM_ROOT), which the job provisions before the recipe (GN-19i)' >&2; exit 2; }
	@test "$$("$(LLVM_ROOT)/bin/clang" -dumpversion | cut -d. -f1)" = "$(LLVM_MAJOR)" || { echo "${step}: $(LLVM_ROOT)/bin/clang is clang $$("$(LLVM_ROOT)/bin/clang" -dumpversion), not $(LLVM_MAJOR) (config/toolchain.json)" >&2; exit 2; }
${generate('php')}
	@$(call binding_release_host,${step}); \\
	php=$$(command -v '$(PHP)') || { echo '${step}: no PHP $(PHP) on PATH' >&2; exit 2; }; \\
	case "$$php" in /*) ;; *) php=$(CURDIR)/$$php ;; esac; \\
	config=$$(command -v '$(if $(filter command line,$(origin PHP_CONFIG)),$(PHP_CONFIG),$(PHP)-config)') || { echo '${step}: no php-config on PATH' >&2; exit 2; }; \\
	case "$$config" in /*) ;; *) config=$(CURDIR)/$$config ;; esac; \\
	set -ex; \\
	minor=$$("$$php" -n -r 'echo PHP_MAJOR_VERSION, ".", PHP_MINOR_VERSION;'); \\
	runtime_version=$$("$$php" -n -r 'echo PHP_VERSION;'); \\
	test -z "$(EXPECTED_PHP_MINOR)" || test "$$minor" = "$(EXPECTED_PHP_MINOR)" || { echo "${step}: PHP runtime $$minor does not match EXPECTED_PHP_MINOR $(EXPECTED_PHP_MINOR); select the PHP executable for that minor with PHP" >&2; exit 2; }; \\
	config_version=$$("$$config" --version); \\
	config_minor=$$(printf '%s\\n' "$$config_version" | cut -d. -f1,2); \\
	test "$$config_minor" = "$$minor" || { echo "${step}: php-config $$config_version has minor $$config_minor, not PHP runtime $$minor; select matching headers with PHP_CONFIG" >&2; exit 2; }; \\
	printf '%s\\n' "${step}: PHP runtime $$runtime_version; php-config $$config_version"; \\
	build=$$("$$php" -n -r 'echo PHP_DEBUG ? "-debug" : "", "-", PHP_ZTS ? "zts" : "nts";'); \\
	target=$(abspath $(RELEASE_TARGET))/php$$minor$$build; \\
	PHP="$$php" PHP_CONFIG="$$config" LIBCLANG_PATH=$(LLVM_ROOT)/lib CLANG_PATH=$(LLVM_ROOT)/bin/clang CARGO_TARGET_DIR="$$target" $(CARGO) build $(CARGOFLAGS) --release --locked -p ${crate('php-ext')}; \\
	version=$$($(CARGO) pkgid -p ${crate('php-ext')} | sed 's/.*@//'); \\
	copy=$(abspath $(RELEASE_TARGET))/php-ext/php$$minor$$build; \\
	mkdir -p "$$copy"; \\
	cp "$$target/release/lib${extension}.$(BINDING_CDYLIB)" "$$copy/${extension}.so"; \\
	"$$php" -n -d extension="$$copy/${extension}.so" -r 'exit(extension_loaded("${extension}") ? 0 : 1);'; \\
	name=php_${extension}-v"$$version"_php$$minor-$$pie$$build.zip; \\
	rm -f "$$copy/$$name"; \\
	(cd "$$copy" && zip -q -9 -X "$$name" ${extension}.so); \\
	out=$(RELEASE_ASSETS)/php-ext; \\
	mkdir -p "$$out"; \\
	cp "$$copy/$$name" "$$out/.$$name.part"; \\
	mv "$$out/.$$name.part" "$$out/$$name"
`);
  }

  const npmDir = `${base}/ts`;
  const npm = (contract.packages['node'] as { package?: string } | undefined)?.package ?? '';
  if (has('node')) {
    add('release-npm-platform', `${head('release-npm-platform', `release-npm-platform builds the Node addon of the platform of the host and packs its npm platform package (GN-19e) with the
napi CLI, with a configuration of the run that names the triple of the host alone, because napi artifacts fails for a
configured platform whose addon another runner builds. The folder of the run is ${npmDir}/npm/<platform>, which the
repository ignores: napi create-npm-dirs refuses a folder outside the package of --package-json-path.`)}
${require('BINDING_RUN', 'the command that starts binding')}
${require('CARGO', 'the cargo command of the repository')}
${require('NPM', 'the npm of the checkout')}
	@test -x "$(NAPI)" || { echo '${name('release-npm-platform')}: no napi CLI at $(NAPI); the repository pins @napi-rs/cli as a devDependency' >&2; exit 2; }
${generate('node')}
	@$(call binding_release_host,${name('release-npm-platform')}); \\
	work=$(CURDIR)/${npmDir}/npm/$$platform; \\
	set -ex; \\
	rm -rf "$$work"; \\
	mkdir -p "$$work/pack"; \\
	printf '{"targets":["%s"]}\\n' "$$host" > "$$work/napi.json"; \\
	$(NAPI) build --platform --release --no-js --manifest-path ${place(contract, 'packages/ts/Cargo.toml')} --package-json-path ${npmDir}/package.json --target-dir $(RELEASE_TARGET) --output-dir "$$work/addons" --target "$$host" -- --locked; \\
	$(NAPI) create-npm-dirs --package-json-path ${npmDir}/package.json --config-path "$$work/napi.json" --npm-dir "$$work/npm"; \\
	$(NAPI) artifacts --package-json-path ${npmDir}/package.json --config-path "$$work/napi.json" --output-dir "$$work/addons" --npm-dir "$$work/npm"; \\
	$(call binding_release_pack,"$$work/npm/$$platform","$$work/pack")
`);
  }

  if (has('node') || has('wasm')) {
    const wasmDir = place(contract, 'packages/ts/wasm/generated').slice(npmDir.length + 1);
    // The copy holds the files that npm pack of the package lists, its manifest among them as it is tracked: no registry
    // holds a platform package before 0.1, so the consumer names each by its asset URL (GN-3c).
    // npm pack --dry-run --json of the npm that devEngines pins (12.2.0) writes an object keyed by the name of the
    // package, {"<name>": {"id": ..., "files": [{"path": ...}]}}; a list without the package is refused by name.
    const copy = 'const fs = require("fs"); const path = require("path"); const [from, list, to] = process.argv.slice(1); '
      + 'const p = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8")); '
      + 'const packed = JSON.parse(fs.readFileSync(list, "utf8"))[p.name]; '
      + 'if (packed === undefined || !Array.isArray(packed.files)) { console.error("release-npm: npm pack --dry-run --json of " + from + " lists no files of the package " + p.name + " in " + list); process.exit(1); } '
      + 'for (const file of packed.files.map((f) => f.path)) { fs.mkdirSync(path.dirname(path.join(to, file)), { recursive: true }); fs.copyFileSync(path.join(from, file), path.join(to, file)); }';
    add('release-npm', `${head('release-npm', `release-npm packs ${npm} itself (GN-19e, GN-3c) from a copy of the files that npm pack of ${npmDir} lists${has('wasm') ? `, with the WASM
module that cargo builds for release and the wasm-bindgen of WASM_BINDGEN binds, which must be the release ${WASM_BINDGEN} of the crate
of the generated manifests (GN-18)` : ''}. The manifest of the copy is the tracked one and names no platform package: the consumer names each
by its asset URL (GN-3c).`)}
${require('BINDING_RUN', 'the command that starts binding')}
${require('CARGO', 'the cargo command of the repository')}
${require('NODE', 'the Node.js of the checkout')}
${require('NPM', 'the npm of the checkout')}
${has('wasm') ? `	@test "$$($(WASM_BINDGEN) --version)" = "wasm-bindgen ${WASM_BINDGEN}" || { echo "${name('release-npm')}: $(WASM_BINDGEN) is $$($(WASM_BINDGEN) --version), not the release ${WASM_BINDGEN} of the crate of the generated manifests (GN-18)" >&2; exit 2; }\n` : ''}${has('node') ? `${generate('node')}\n` : ''}${has('wasm') ? `${generate('wasm')}\n` : ''}	@work=$(abspath $(RELEASE_TARGET))/npm/package${suffix}; \\
	set -ex; \\
	rm -rf "$$work"; \\
	mkdir -p "$$work/package" "$$work/pack"; \\
	(cd ${npmDir} && $(NPM) pack --dry-run --json --ignore-scripts) > "$$work/files.json"; \\
	$(NODE) -e '${copy}' ${npmDir} "$$work/files.json" "$$work/package"; \\
${has('wasm') ? `	CARGO_TARGET_DIR=$(RELEASE_TARGET) $(CARGO) build $(CARGOFLAGS) --release --locked -p ${crate('wasm')} --target wasm32-unknown-unknown; \\
	$(WASM_BINDGEN) --target web --out-dir "$$work/package/${wasmDir}" --out-name ${contract.library.replaceAll('-', '_')}_wasm $(RELEASE_TARGET)/wasm32-unknown-unknown/release/${extension}_wasm.wasm; \\
` : ''}	$(call binding_release_pack,"$$work/package","$$work/pack")
`);
  }

  if (has('go')) {
    const step = name('release-go-module');
    add('release-go-module', `${head('release-go-module', `release-go-module carries the Go module of the release TAG (GN-19f): on the checkout of that tag, after the generation of
the Go binding, binding release-go-module checks the library of each platform in RELEASE_ASSETS/go, proves a commit that adds
the generated files and the libraries to the tree of the tag with a consumer, and creates the annotated tag of the Go module
at it. The recipe pushes nothing: it adds the reference that the command prints to RELEASE_TARGET/go-module-refs, which
release-go-module-push pushes with the references of the other Go modules of the repository at once, and adds nothing when
the command prints none, because the remote holds that tag already (B2.488). The folder of the run is made writable before
it is removed, since Go writes its module cache read-only.`)}
	@test -n "$$TAG" || { echo '${step}: TAG is required, for example make ${step} TAG=v0.0.1' >&2; exit 2; }
${require('BINDING_RUN', 'the command that starts binding')}
${require('CARGO', 'the cargo command of the repository')}
${generate('go')}
	@work=$(abspath $(RELEASE_TARGET))/go-module${suffix}; \\
	set -e; \\
	if [ -d "$$work" ]; then chmod -R u+w "$$work"; rm -rf "$$work"; fi; \\
	mkdir -p "$$work"; \\
	echo "$(BINDING_RUN) release-go-module --contract ${contractPath} --tag $$TAG --libraries $(abspath $(RELEASE_ASSETS))/go --work $$work --go $(GO)"; \\
	ref=$$($(BINDING_RUN) release-go-module --contract ${contractPath} --tag "$$TAG" --libraries $(abspath $(RELEASE_ASSETS))/go --work "$$work" --go "$(GO)"); \\
	case "$$ref" in \\
	'') echo "${step}: the remote holds the tag of the Go module of $$TAG already" ;; \\
	refs/tags/*/"$$TAG") echo "$$ref" >> $(abspath $(RELEASE_TARGET))/go-module-refs; echo "${step}: $$ref waits for make release-go-module-push" ;; \\
	*) echo "${step}: binding printed $$ref, not the tag of the Go module of $$TAG" >&2; exit 1 ;; \\
	esac
`);
  }

  // rehearse-go-module is no step of a release, so the file names it after the steps and the recipes of the checkout.
  // It requires no variable itself: its prerequisite release-go-static requires those that it reads.
  const rehearse = (): void => {
    const step = name('rehearse-go-module');
    add('rehearse-go-module', `${head('rehearse-go-module', `rehearse-go-module rehearses release-go-module before the tag of a release (GN-19f, B2.479): for TAG, the tag that the release
will make, binding release-go-module --rehearsal runs the checks and the proof of the consumer on HEAD, with the library of
each platform that RELEASE_ASSETS/go holds, of which the one of the host, which release-go-static builds first, is required.
It makes no commit and no tag and pushes nothing, and its last lines name what it did not see, so it is no release. The
contracts of one repository share its folder: the rehearsal of a Go module that requires another one of the repository
reads the rehearsal of that module there, so the required module is rehearsed first, and never two at once.`, `$(BINDING_DEP) ${name('release-go-static')}`)}
	@test -n "$$TAG" || { echo '${step}: TAG is required, the tag that the release will make, for example make ${step} TAG=v0.0.1' >&2; exit 2; }
	$(BINDING_RUN) release-go-module --contract ${contractPath} --tag "$$TAG" --libraries $(abspath $(RELEASE_ASSETS))/go --work $(abspath $(RELEASE_TARGET))/go-module-rehearsal --go "$(GO)" --rehearsal
`);
  };

  // The text of release-binding-check is written after the other release recipes (bindingCheck), which it reads.
  const bindingCheckAt = sections.length;
  add('release-binding-check', '');
  const bindingCheck = (): string => `${head('release-binding-check', `release-binding-check runs the release check of binding on the contract (GN-19g, CK-70, CK-102), which a release runs
before it builds an asset of a tag. The check starts the go command of GO when the go.mod of the contract requires the
release of another polyspec Go module (GN-15l), and only then, so the job that runs it has Go. It first requires every
variable of the Makefile that a release recipe of the contract reads, so a variable that only a recipe after the tag
reads is missed here (B2.471).`)}
${[...required].map(([variable, what]) => `\t@$(call binding_require,${variable},${what},${path})`).join('\n')}
	$(BINDING_RUN) check ${contractPath} --release --cargo "$(CARGO)" --go "$(GO)"
`;
  require('BINDING_RUN', 'the command that starts binding');
  require('CARGO', 'the cargo command of the repository');

  // GN-19g: the assets of each platform with their labels, and the labels that the targets of the contract require, one
  // asset of each: a missing platform or PHP minor is named, and two files of one label do not stand for another.
  const loops: string[] = [];
  const wanted: string[] = [];
  if (has('python')) {
    loops.push(`	for file in "$$dir"/wheel/*.whl; do \\
	[ -e "$$file" ] || continue; \\
	case "$$file" in \\
${PLATFORMS.map((p) => `	${p.wheel}) platform=${p.platform} ;; \\`).join('\n')}
	*) fail "$$file is no wheel of a platform of the release" ;; \\
	esac; \\
	take "$$file" "${label}-python-$$version-$$platform"; set -- "$$@" "$$file#${label}-python-$$version-$$platform"; \\
	done; \\`);
    wanted.push(...PLATFORMS.map((p) => `${label}-python-$$version-${p.platform}`));
  }
  if (has('node') || has('wasm')) {
    const file = npm.replace(/^@/, '').replace('/', '-');
    loops.push(`	for file in "$$dir"/npm/*.tgz; do \\
	[ -e "$$file" ] || continue; \\
	case "$$(basename "$$file" .tgz)" in \\
	"${file}-$$version") label=${label}-ts-$$version ;; \\
${has('node') ? `${PLATFORMS.map((p) => `	"${file}-${p.platform}-$$version") label=${label}-ts-$$version-${p.platform} ;; \\`).join('\n')}\n` : ''}	*) fail "$$file is no npm package of the release $$version" ;; \\
	esac; \\
	take "$$file" "$$label"; set -- "$$@" "$$file#$$label"; \\
	done; \\`);
    wanted.push(`${label}-ts-$$version`, ...(has('node') ? PLATFORMS.map((p) => `${label}-ts-$$version-${p.platform}`) : []));
  }
  if (has('php')) {
    loops.push(`	for file in "$$dir"/php-ext/*.zip; do \\
	[ -e "$$file" ] || continue; \\
	name=$$(basename "$$file" .zip); \\
	case "$$name" in \\
${PLATFORMS.map((p) => `	php_${extension}-v"$$version"_php*-${p.pie}-*) platform=${p.platform} ;; \\`).join('\n')}
	*) fail "$$file is no PHP extension of the release $$version" ;; \\
	esac; \\
	minor=$$(echo "$$name" | sed 's/.*_php\\([0-9]*\\.[0-9]*\\)-.*/\\1/'); \\
	case " $$minors " in *" $$minor "*) ;; *) fail "$$file is for PHP $$minor, no PHP minor of phpExtension.minors of config/toolchain.json: $$minors" ;; esac; \\
	take "$$file" "${label}-php-ext-$$version-php$$minor-$$platform"; set -- "$$@" "$$file#${label}-php-ext-$$version-php$$minor-$$platform"; \\
	done; \\
	for minor in $$minors; do wanted="$$wanted ${PLATFORMS.map((p) => `${label}-php-ext-$$version-php$$minor-${p.platform}`).join(' ')}"; done; \\`);
  }
  const step = name('release-platform-assets');
  add('release-platform-assets', `${head('release-platform-assets', `release-platform-assets uploads the assets of each platform to the draft GitHub Release of TAG with gh (GN-19g), each
under the label ${label}-<runtime>-<version>-<platform>, or -php<X.Y>-<platform> for the PHP extension, and the npm package
without a platform under ${label}-ts-<version>. A file keeps the name that its packer gave, which PIE and the package
managers read. Before an upload it requires one asset of each label that the targets of the contract give: each platform${has('php') ? `,
and each PHP minor of phpExtension.minors of config/toolchain.json for the PHP extension` : ''}. It names the label of each
missing asset, and fails for a file that names no platform${has('php') ? ' or no such PHP minor' : ''} and for two files of one label.`, '')}
	@test -n "$$TAG" || { echo '${step}: TAG is required, for example make ${step} TAG=v0.0.1' >&2; exit 2; }
${has('php') ? `${require('NODE', 'the Node.js of the checkout')}\n` : ''}	@set -e; version=$$(echo "$$TAG" | sed 's/^v//'); dir=$(RELEASE_ASSETS); fail() { echo "${step}: $$1" >&2; exit 1; }; \\
	set --; seen=' '; wanted=; \\
	take() { case "$$seen" in *" $$2 "*) fail "$$1 has the label $$2 of another asset" ;; esac; seen="$$seen$$2 "; }; \\
${has('php') ? `	minors=$$($(NODE) -e '${minorsScript(step)}'); \\\n` : ''}${loops.join('\n')}
	missing=; for want in ${wanted.join(' ')} $$wanted; do case "$$seen" in *" $$want "*) ;; *) missing="$$missing $$want" ;; esac; done; \\
	test -z "$$missing" || fail "$$dir lacks$$missing"; \\
	set -x; \\
	gh release upload "$$TAG" "$$@"
`);


  // GN-19i: the build recipes of the jobs of assets.yml. Each build of a job runs as a make of its own to its end, and the
  // recipe names the builds that failed; an install that a build needs comes first and stops the recipe when it fails.
  // B2.457: the first step of each is the check of a release (release-binding-check), a make of its own, which stops the
  // recipe when it fails: the job of CI and the job of a release run this one recipe, so what fails after the tag fails
  // in CI first, and no Makefile and no workflow holds a condition that runs the check in a release alone.
  const check = `\t$(MAKE) --no-print-directory ${name('release-binding-check')}`;
  const runAll = (job: string, steps: string[]): string => `\t@failed=; for goal in ${steps.join(' ')}; do $(MAKE) --no-print-directory "$$goal" || failed="$$failed $$goal"; done; \\
\tif [ -n "$$failed" ]; then echo "${job}: failed:$$failed" >&2; exit 1; fi`;
  const platformSteps = [...(has('go') ? ['release-go-static'] : []), ...(has('python') ? ['release-wheel'] : []), ...(has('node') ? ['release-npm-platform'] : [])].map(name);
  if (platformSteps.length > 0) {
    const job = name('release-assets-platform');
    add('release-assets-platform', `${head('release-assets-platform', `release-assets-platform is the build of the job platform of assets.yml (GN-19i): ${platformSteps.join(', ')} on the
platform of the host, each to its end; it fails naming each build that failed. Its first step is
${name('release-binding-check')}, which stops it.`, '')}
${check}
${runAll(job, platformSteps)}
`);
  }
  if (has('php')) {
    const job = name('release-assets-php');
    add('release-assets-php', `${head('release-assets-php', `release-assets-php is the build of an entry of the job php of assets.yml (GN-19i): release-php-ext for the PHP of
PATH, which the job selects before the recipe, with EXPECTED_PHP_MINOR, the PHP minor of the matrix entry. Its first
step is ${name('release-binding-check')}.`, '')}
${check}
	@test -n "$(EXPECTED_PHP_MINOR)" || { echo '${job} needs EXPECTED_PHP_MINOR: the PHP minor of the entry, for example make ${job} EXPECTED_PHP_MINOR=8.4' >&2; exit 2; }
	$(MAKE) --no-print-directory ${name('release-php-ext')} PHP=php EXPECTED_PHP_MINOR=$(EXPECTED_PHP_MINOR)
`);
  }
  if (has('node') || has('wasm')) {
    add('release-assets-npm', `${head('release-assets-npm', `release-assets-npm is the build of the job npm of assets.yml (GN-19i): it runs ${name('release-binding-check')} first${has('wasm') ? ',\nthen installs the wasm-bindgen CLI and stops when that fails, then' : ', then'} runs ${name('release-npm')}.`, '')}
${check}
${has('wasm') ? '\t$(MAKE) --no-print-directory install-wasm-bindgen\n' : ''}	$(MAKE) --no-print-directory ${name('release-npm')}
`);
  }

  // The release recipes are written: release-binding-check requires the variables that they read, and not those of
  // the recipe of a checkout below.
  sections[bindingCheckAt] = bindingCheck();

  if (has('node')) {
    const step = name('checkout-node-addon');
    const entryDir = place(contract, 'packages/ts/generated');
    const file = `${addonName(contract)}.$$platform.node`;
    // The script of Node.js that prints target_directory of the output of cargo metadata on its standard input; one
    // argument in single quotes of the shell, so it holds no single quote.
    const targetDir = 'let d; try { d = JSON.parse(require("fs").readFileSync(0, "utf8")).target_directory; } catch (error) { d = undefined; } '
      + `if (typeof d !== "string") { console.error("${step}: cargo metadata named no target_directory"); process.exit(1); } console.log(d);`;
    add('checkout-node-addon', `${head('checkout-node-addon', `checkout-node-addon builds the Node addon of the checkout and puts it beside the generated entry as ${addonName(contract)}.<platform>.node,
which the entry loads when the platform package is not installed (GN-3c), so a repository and a consumer linked to its
checkout write no build, no platform name and no copy of their own. It is the build of the end-to-end check: a debug
build with every feature of the crate, the test features of GN-5, which the generated tests call; a release builds its
addon by release-npm-platform. The cdylib is taken from the target directory that cargo metadata names, and the
platform is the name of T-2 that the release recipes give the triple of the host.`)}
${require('BINDING_RUN', 'the command that starts binding')}
${require('CARGO', 'the cargo command of the repository')}
${require('NODE', 'the Node.js of the checkout')}
${generate('node')}
	@$(call binding_release_host,${step}); \\
	test -f ${entryDir}/index.cjs || { echo "${step}: binding generate wrote no entry ${entryDir}/index.cjs" >&2; exit 1; }; \\
	set -e; \\
	(set -x; $(CARGO) build $(CARGOFLAGS) --locked --all-features -p ${crate('node')}); \\
	metadata=$$($(CARGO) metadata --format-version 1 --no-deps --locked); \\
	target=$$(printf '%s' "$$metadata" | $(NODE) -e '${targetDir}'); \\
	set -x; \\
	cp "$$target/debug/lib${extension}_node.$(BINDING_CDYLIB)" "${entryDir}/.${file}.part"; \\
	mv "${entryDir}/.${file}.part" "${entryDir}/${file}"
`);
  }
  if (has('go')) rehearse();

  const header = `# Generated by binding release-recipes from ${contract.core.path}/interface.json; do not edit, and do not track it.
# The release recipes of the binding (binding GN-19h): the Makefile of the repository includes this file after it defines
# BINDING_RUN, the command that starts binding, CARGO, the cargo command of the repository, and CARGOFLAGS, the arguments
# of its builds (binding GN-1d), NODE and NPM, the tools of the checkout, and BINDING_DEP, the target that installs
# binding, if it has one; it runs binding release-recipes to write the file again. It may define GO, the go command that
# binding starts (binding GN-15l, GN-19f), which is the go of PATH when it does not, and MATURIN, the maturin of mise.toml
# (binding GN-19c), which is the shim of the mise of the checkout when it does not.${has('go') ? `
# A repository whose Go crate has a dependency that builds C defines the C compiler and the archiver of each musl target,
# ${MUSL_TARGETS.flatMap((musl) => [`CC_${muslEnv(musl)}`, `AR_${muslEnv(musl)}`]).join(', ')}
# (binding GN-19b), which release-go-static passes to the build of that target alone.` : ''}
`;
  const shared = `${SHARED}${has('wasm') ? `\n${INSTALL_WASM_BINDGEN}` : ''}${has('go') ? `\n${GO_MODULE_PUSH}` : ''}`;
  return { path, targets: defined, text: `${header}\n${shared}\n${sections.join('\n')}` };
}

// CK-102, B2.471: the settings of the repository that a release recipe of the contract reads and that are missing, each
// with its file from the root, read by the reader of the recipe itself, so the check cannot differ from the recipe: the
// script of Node.js of release-platform-assets for phpExtension.minors (minorsScript), the script of sed of the recipes
// for llvm.version (LLVM_MAJOR_SED), and the function of `binding release-go-module` for the place of the Go module
// (goModulePlaceFinding). Only the settings of the targets of the contract are read. node: the Node.js that runs the
// script, as $(NODE) runs it in the recipe.
export function releaseSettingFindings(contract: Contract, root: string, node: string = process.execPath): { path: string; message: string }[] {
  const base = componentBase(contract);
  const name = (step: string): string => `${step}${base === 'packages' ? '' : `-${base.slice('packages/'.length)}`}`;
  const has = (lang: string): boolean => (contract.targets as readonly string[]).includes(lang);
  const found: { path: string; message: string }[] = [];
  if (has('php')) {
    // The text of the script is a line of make, which writes each $ as $$.
    const minors = spawnSync(node, ['-e', minorsScript(name('release-platform-assets')).replaceAll('$$', '$')], { cwd: root, encoding: 'utf8' });
    if (minors.error !== undefined) throw new Error(`${node} did not start: ${minors.error.message}`);
    if (minors.status !== 0) found.push({ path: 'config/toolchain.json', message: minors.stderr.trim() });
    const llvm = spawnSync('sed', ['-n', LLVM_MAJOR_SED, 'config/toolchain.json'], { cwd: root, encoding: 'utf8' });
    if (llvm.error !== undefined) throw new Error(`sed did not start: ${llvm.error.message}`);
    if (llvm.stdout.trim() === '') found.push({ path: 'config/toolchain.json', message: `${name('release-php-ext')}: ${NO_LLVM_MAJOR}` });
  }
  if (has('go')) {
    const module = (contract.packages['go'] as { module?: unknown } | undefined)?.module;
    const misplaced = typeof module === 'string' ? goModulePlaceFinding(module, place(contract, 'packages/go')) : undefined;
    if (misplaced !== undefined) found.push({ path: `${contract.core.path}/interface.json`, message: `${name('release-go-module')}: ${misplaced}` });
  }
  return found;
}

// CK-94, GN-1d: each line of a file of recipes that runs Cargo in another way than GN-1d states, with its line from 1: the
// cargo of PATH and not $(CARGO), a build of $(CARGO) without $(CARGOFLAGS) right after its subcommand, and a command of
// binding that runs Cargo without --cargo "$(CARGO)". A line is read as the commands that the shell starts in it: each
// part after a separator of the shell, a subshell or the start of a substitution ($$( of make), but not after the $( of
// a variable of make, without the assignments of the environment that
// precede its command; a comment of make is no command.
export function cargoFindings(text: string): { line: number; message: string }[] {
  const found: { line: number; message: string }[] = [];
  text.split('\n').forEach((line, index) => {
    if (/^\s*#/.test(line)) return;
    for (const part of line.split(/;|&&|\|\||\||\$\$\(|(?<!\$)\(/)) {
      const command = part.replace(/^[\s@{-]+/, '').replace(/^([A-Za-z_][A-Za-z0-9_]*=("[^"]*"|\S*)\s+)+/, '');
      const build = /^\$\(CARGO\) (rustc|build)\b(.*)$/.exec(command);
      const binding = /^\$\(BINDING_RUN\) (check|scaffold|generate|go-link)\b/.exec(command);
      if (/^cargo\s/.test(command)) found.push({ line: index + 1, message: 'CK-94 runs cargo of PATH and not $(CARGO) (GN-1d)' });
      else if (build !== null && !/^ \$\(CARGOFLAGS\)(\s|$)/.test(build[2] ?? '')) found.push({ line: index + 1, message: `CK-94 runs the build $(CARGO) ${build[1] ?? ''} without $(CARGOFLAGS) right after its subcommand (GN-1d)` });
      else if (binding !== null && !command.includes('--cargo "$(CARGO)"')) found.push({ line: index + 1, message: `CK-94 runs binding ${binding[1] ?? ''}, which runs cargo, without --cargo "$(CARGO)" (GN-1d)` });
    }
  });
  return found;
}
