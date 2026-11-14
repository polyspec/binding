// GN-19h: the release recipes of a repository that holds a binding. Every such repository builds the assets of its
// platforms with the same standard tools and the same steps (GN-19a to GN-19g); only the names of its crates, packages
// and labels differ, and those follow from its contract. So binding writes the recipes as a make file that the
// repository's Makefile includes, and `binding check` reports a Makefile that does not include them, that copies a
// recipe by hand, or a file of recipes that this binding would write otherwise (CK-94).
//
// The text holds no `${` of the shell: make passes `$$` to the shell, and every expansion of a variable of the shell is
// written `$$name`, so a template literal of this file interpolates only the values of the contract.

import type { Contract } from '../contract.ts';
import { componentBase, extensionName, NODE_PLATFORMS, place, WASM_BINDGEN } from '../generate/packages.ts';

// The steps of a release in the order that GN-19h names them; a contract has those of its targets.
export const RELEASE_STEPS = ['release-go-static', 'release-wheel', 'release-php-ext', 'release-npm-platform', 'release-npm', 'release-go-module', 'release-binding-check', 'release-platform-assets'] as const;

export interface Recipes {
  // The path of the file of recipes from the root of the repository, beside the packages of the contract.
  path: string;
  // The targets that the file defines for the contract, which the Makefile does not define by hand (CK-94).
  targets: string[];
  text: string;
}

// The platforms of a release (GN-19a): the Rust triple of the host, the napi name of its platform, the directory of the
// Go module, the part of the name of a PHP extension archive, the musl triple whose Go library a Linux host also builds
// (GN-19b), and the platform part of a wheel name that maturin writes (GN-19c).
const PLATFORMS = [
  { triple: 'x86_64-unknown-linux-gnu', platform: 'linux-x64-gnu', go: 'linux_amd64', pie: 'x86_64-linux-glibc', musl: 'x86_64-unknown-linux-musl', wheel: '*manylinux*_x86_64.whl' },
  { triple: 'aarch64-unknown-linux-gnu', platform: 'linux-arm64-gnu', go: 'linux_arm64', pie: 'arm64-linux-glibc', musl: 'aarch64-unknown-linux-musl', wheel: '*manylinux*_aarch64.whl' },
  { triple: 'aarch64-apple-darwin', platform: 'darwin-arm64', go: 'darwin_arm64', pie: 'arm64-darwin-bsdlibc', musl: '', wheel: '*macosx*_arm64.whl' },
] as const;

const SHARED = `# ---- Shared by the recipes of every contract of the repository ----------------------------------------------------
ifndef BINDING_RELEASE_SHARED
BINDING_RELEASE_SHARED := 1
# The assets of a release and the target directory of its builds, so that an asset holds nothing of a development build.
RELEASE_ASSETS ?= var/release/assets
RELEASE_TARGET ?= var/release/target
# The napi CLI of the devDependency @napi-rs/cli of the repository, the wasm-bindgen CLI of mise.toml and the mise of the
# checkout, by their absolute paths (GN-19e).
NAPI ?= $(CURDIR)/node_modules/.bin/napi
WASM_BINDGEN ?= $(CURDIR)/var/tools/mise/shims/wasm-bindgen
MISE ?= $(CURDIR)/var/tools/bin/mise
# Cargo names a cdylib lib<name>.dylib on macOS and lib<name>.so on Linux.
BINDING_CDYLIB := $(if $(filter Darwin,$(shell uname -s)),dylib,so)
# The bindgen of ext-php-rs loads a libclang through clang-sys, which takes the libclang of the highest LLVM that it finds,
# and asks the clang of PATH for the directories of the headers that it includes; on a machine with several LLVM releases
# the two differ and the build fails. So the build takes the libclang (LIBCLANG_PATH) and the clang (CLANG_PATH) of the
# one LLVM whose major release config/toolchain.json pins (llvm.version), from LLVM_ROOT: /usr/lib/llvm-<major> on Linux
# and the Homebrew formula llvm@<major> on macOS unless it is given (GN-19d).
LLVM_MAJOR ?= $(shell sed -n '/"llvm": {/,/}/s/^ *"version": "\\([0-9]*\\)".*/\\1/p' config/toolchain.json 2>/dev/null)
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

const INSTALL_LLVM = `ifndef BINDING_RELEASE_LLVM
BINDING_RELEASE_LLVM := 1
# install-llvm installs the LLVM of config/toolchain.json with the package manager of the platform, which the build of the
# PHP extension needs: the formula llvm@<major> of Homebrew on macOS, and clang-<major> and libclang-<major>-dev of apt on
# Linux, where a runner holds them already.
.PHONY: install-llvm
install-llvm:
	@test -n "$(LLVM_MAJOR)" || { echo 'install-llvm: config/toolchain.json pins no major release of LLVM (llvm.version)' >&2; exit 2; }
	@if test -x "$(LLVM_ROOT)/bin/clang" && ls "$(LLVM_ROOT)/lib" | grep -q '^libclang'; then echo "install-llvm: LLVM $(LLVM_MAJOR) is installed in $(LLVM_ROOT)"; \\
	elif test "$$(uname -s)" = Darwin; then set -x; $(ONLINE) brew install llvm@$(LLVM_MAJOR); \\
	else set -x; sudo apt-get install --yes clang-$(LLVM_MAJOR) libclang-$(LLVM_MAJOR)-dev; fi
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
  const require = (variable: string, what: string): string => `\t@$(call binding_require,${variable},${what},${path})`;
  const generate = (lang: string): string => `\t$(BINDING_RUN) generate --contract ${contractPath} --target ${lang}`;
  const head = (step: string, comment: string, prerequisites = '$(BINDING_DEP)'): string =>
    `${comment.split('\n').map((line) => `# ${line}`).join('\n')}\n.PHONY: ${name(step)}\n${name(step)}:${prerequisites === '' ? '' : ` ${prerequisites}`}`;
  const sections: string[] = [];
  const defined: string[] = [];
  const add = (step: (typeof RELEASE_STEPS)[number], text: string): void => {
    defined.push(name(step));
    sections.push(text);
  };

  if (has('go')) {
    const lib = `lib${extension}_go.a`;
    add('release-go-static', `${head('release-go-static', `release-go-static builds the static library of the Go module of the platform of the host (GN-19b) and, on a Linux host,
the one of the musl target of its arch into linux_<arch>_musl, because binding release-go-module requires the libraries of
five Go platforms. It strips the debug sections of a copy of each with the llvm-strip of the component llvm-tools of the
pinned toolchain, never the strip of PATH, and the stripped copy enters the assets under another name and is renamed there.`)}
${require('BINDING_RUN', 'the command that starts binding')}
${generate('go')}
	@$(call binding_release_host,${name('release-go-static')}); \\
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
	CARGO_TARGET_DIR=$(RELEASE_TARGET) cargo build --release --locked -p ${crate('go')}; \\
	publish $(RELEASE_TARGET)/release "$$go"; \\
	if [ -n "$$musl" ]; then \\
	CARGO_TARGET_DIR=$(RELEASE_TARGET) cargo build --release --locked -p ${crate('go')} --target "$$musl"; \\
	publish "$(RELEASE_TARGET)/$$musl/release" "$$go"_musl; \\
	fi
`);
  }

  if (has('python')) {
    add('release-wheel', `${head('release-wheel', `release-wheel builds the abi3 wheel of the platform of the host (GN-19c) with the uv of the checkout: maturin builds
with --locked, and the time of the commit of HEAD dates the files of the wheel.`)}
${require('BINDING_RUN', 'the command that starts binding')}
${require('UV', 'the uv of the checkout')}
${generate('python')}
	@$(call binding_release_host,${name('release-wheel')}); \\
	set -ex; \\
	epoch=$$(git log -1 --format=%ct HEAD); \\
	CARGO_TARGET_DIR=$(RELEASE_TARGET) MATURIN_PEP517_ARGS=--locked SOURCE_DATE_EPOCH=$$epoch $(UV) build --wheel --python python3 --out-dir $(RELEASE_ASSETS)/wheel ${base}/python
`);
  }

  if (has('php')) {
    const step = name('release-php-ext');
    add('release-php-ext', `${head('release-php-ext', `release-php-ext builds the PHP extension of the platform of the host for the PHP of PHP (GN-19d), with the php-config of
PHP_CONFIG when the command line gives it and the one beside that PHP otherwise, both resolved to absolute paths, because
the build script of ext-php-rs refuses a PHP that it cannot find by the path that PHP names. It builds with the libclang
and the clang of the LLVM of config/toolchain.json, which it checks first. Each PHP minor and build builds in its own
target directory, because the extension is compiled against the headers of that PHP. The extension must load into that
PHP without a php.ini before it is packed under the name by which PIE finds a pre-packaged binary.`)}
${require('BINDING_RUN', 'the command that starts binding')}
	@test -n "$(PHP)" || { echo '${step} needs PHP: the PHP to build for, for example make ${step} PHP=php' >&2; exit 2; }
	@test -n "$(LLVM_MAJOR)" || { echo '${step}: config/toolchain.json pins no major release of LLVM (llvm.version)' >&2; exit 2; }
	@test -x "$(LLVM_ROOT)/bin/clang" && ls "$(LLVM_ROOT)/lib" 2>/dev/null | grep -q '^libclang' || { echo '${step}: the bindgen of ext-php-rs needs the libclang and the clang of LLVM $(LLVM_MAJOR) (config/toolchain.json) in $(LLVM_ROOT); make install-llvm installs it' >&2; exit 2; }
	@test "$$("$(LLVM_ROOT)/bin/clang" -dumpversion | cut -d. -f1)" = "$(LLVM_MAJOR)" || { echo "${step}: $(LLVM_ROOT)/bin/clang is clang $$("$(LLVM_ROOT)/bin/clang" -dumpversion), not $(LLVM_MAJOR) (config/toolchain.json)" >&2; exit 2; }
${generate('php')}
	@$(call binding_release_host,${step}); \\
	php=$$(command -v '$(PHP)') || { echo '${step}: no PHP $(PHP) on PATH' >&2; exit 2; }; \\
	case "$$php" in /*) ;; *) php=$(CURDIR)/$$php ;; esac; \\
	config=$$(command -v '$(if $(filter command line,$(origin PHP_CONFIG)),$(PHP_CONFIG),$(PHP)-config)') || { echo '${step}: no php-config on PATH' >&2; exit 2; }; \\
	case "$$config" in /*) ;; *) config=$(CURDIR)/$$config ;; esac; \\
	set -ex; \\
	minor=$$("$$php" -n -r 'echo PHP_MAJOR_VERSION, ".", PHP_MINOR_VERSION;'); \\
	build=$$("$$php" -n -r 'echo PHP_DEBUG ? "-debug" : "", "-", PHP_ZTS ? "zts" : "nts";'); \\
	target=$(abspath $(RELEASE_TARGET))/php$$minor$$build; \\
	PHP="$$php" PHP_CONFIG="$$config" LIBCLANG_PATH=$(LLVM_ROOT)/lib CLANG_PATH=$(LLVM_ROOT)/bin/clang CARGO_TARGET_DIR="$$target" cargo build --release --locked -p ${crate('php-ext')}; \\
	version=$$(cargo pkgid -p ${crate('php-ext')} | sed 's/.*@//'); \\
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
    const platforms = has('node') ? ` ${PLATFORMS.map((p) => p.platform).join(' ')}` : '';
    // The copy holds the files that npm pack of the package lists, and a manifest that names the platform packages.
    const copy = 'const fs = require("fs"); const path = require("path"); const [from, list, to, ...platforms] = process.argv.slice(1); '
      + 'for (const file of JSON.parse(fs.readFileSync(list, "utf8"))[0].files.map((f) => f.path)) { fs.mkdirSync(path.dirname(path.join(to, file)), { recursive: true }); fs.copyFileSync(path.join(from, file), path.join(to, file)); } '
      + 'const p = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8")); '
      + 'if (platforms.length > 0) p.optionalDependencies = Object.fromEntries(platforms.map((platform) => [p.name + "-" + platform, p.version])); '
      + 'fs.writeFileSync(path.join(to, "package.json"), JSON.stringify(p, null, 2) + "\\n");';
    add('release-npm', `${head('release-npm', `release-npm packs ${npm} itself (GN-19e, GN-3c) from a copy of the files that npm pack of ${npmDir} lists${has('wasm') ? `, with the WASM
module that cargo builds for release and the wasm-bindgen of WASM_BINDGEN binds, which must be the release ${WASM_BINDGEN} of the crate
of the generated manifests (GN-18)` : ''}. ${has('node') ? 'The manifest of the copy names the platform package of each platform of the release at the version of the package in\noptionalDependencies; the tracked manifest names none.' : 'The package has no Node addon, so it names no platform package.'}`)}
${require('BINDING_RUN', 'the command that starts binding')}
${require('NODE', 'the Node.js of the checkout')}
${require('NPM', 'the npm of the checkout')}
${has('wasm') ? `	@test "$$($(WASM_BINDGEN) --version)" = "wasm-bindgen ${WASM_BINDGEN}" || { echo "${name('release-npm')}: $(WASM_BINDGEN) is $$($(WASM_BINDGEN) --version), not the release ${WASM_BINDGEN} of the crate of the generated manifests (GN-18)" >&2; exit 2; }\n` : ''}${has('node') ? `${generate('node')}\n` : ''}${has('wasm') ? `${generate('wasm')}\n` : ''}	@work=$(abspath $(RELEASE_TARGET))/npm/package${suffix}; \\
	set -ex; \\
	rm -rf "$$work"; \\
	mkdir -p "$$work/package" "$$work/pack"; \\
	(cd ${npmDir} && $(NPM) pack --dry-run --json --ignore-scripts) > "$$work/files.json"; \\
	$(NODE) -e '${copy}' ${npmDir} "$$work/files.json" "$$work/package"${platforms}; \\
${has('wasm') ? `	CARGO_TARGET_DIR=$(RELEASE_TARGET) cargo build --release --locked -p ${crate('wasm')} --target wasm32-unknown-unknown; \\
	$(WASM_BINDGEN) --target web --out-dir "$$work/package/${wasmDir}" --out-name ${contract.library.replaceAll('-', '_')}_wasm $(RELEASE_TARGET)/wasm32-unknown-unknown/release/${extension}_wasm.wasm; \\
` : ''}	$(call binding_release_pack,"$$work/package","$$work/pack")
`);
  }

  if (has('go')) {
    const step = name('release-go-module');
    add('release-go-module', `${head('release-go-module', `release-go-module carries the Go module of the release TAG (GN-19f): on the checkout of that tag, after the generation of
the Go binding, binding release-go-module checks the library of each platform in RELEASE_ASSETS/go, proves a commit that adds
the generated files and the libraries to the tree of the tag with a consumer, and creates the annotated tag of the Go module
at it. The recipe pushes the reference that the command prints, and nothing when it prints none, because the remote holds
that tag already. The folder of the run is made writable before it is removed, since Go writes its module cache read-only.`)}
	@test -n "$$TAG" || { echo '${step}: TAG is required, for example make ${step} TAG=v0.0.1' >&2; exit 2; }
${require('BINDING_RUN', 'the command that starts binding')}
${generate('go')}
	@work=$(abspath $(RELEASE_TARGET))/go-module${suffix}; \\
	set -e; \\
	if [ -d "$$work" ]; then chmod -R u+w "$$work"; rm -rf "$$work"; fi; \\
	mkdir -p "$$work"; \\
	echo "$(BINDING_RUN) release-go-module --contract ${contractPath} --tag $$TAG --libraries $(abspath $(RELEASE_ASSETS))/go --work $$work"; \\
	ref=$$($(BINDING_RUN) release-go-module --contract ${contractPath} --tag "$$TAG" --libraries $(abspath $(RELEASE_ASSETS))/go --work "$$work"); \\
	case "$$ref" in \\
	'') echo "${step}: the remote holds the tag of the Go module of $$TAG already" ;; \\
	refs/tags/*/"$$TAG") set -x; git push origin "$$ref" ;; \\
	*) echo "${step}: binding printed $$ref, not the tag of the Go module of $$TAG" >&2; exit 1 ;; \\
	esac
`);
  }

  add('release-binding-check', `${head('release-binding-check', `release-binding-check runs the release check of binding on the contract (GN-19g, CK-70), which a release runs before it
builds an asset of a tag.`)}
${require('BINDING_RUN', 'the command that starts binding')}
	$(BINDING_RUN) check ${contractPath} --release
`);

  // GN-19g: the assets of each platform with their labels, and the counts that the targets of the contract give.
  const loops: string[] = [];
  const counts: string[] = [];
  if (has('python')) {
    loops.push(`	for file in "$$dir"/wheel/*.whl; do \\
	[ -e "$$file" ] || continue; \\
	case "$$file" in \\
${PLATFORMS.map((p) => `	${p.wheel}) platform=${p.platform} ;; \\`).join('\n')}
	*) fail "$$file is no wheel of a platform of the release" ;; \\
	esac; \\
	set -- "$$@" "$$file#${label}-python-$$version-$$platform"; wheels=$$((wheels + 1)); \\
	done; \\`);
    counts.push(`	test "$$wheels" -eq ${PLATFORMS.length} || fail "$$dir/wheel holds $$wheels wheels, not one of each of the ${PLATFORMS.length} platforms"; \\`);
  }
  if (has('node') || has('wasm')) {
    const file = npm.replace(/^@/, '').replace('/', '-');
    loops.push(`	for file in "$$dir"/npm/*.tgz; do \\
	[ -e "$$file" ] || continue; \\
	case "$$(basename "$$file" .tgz)" in \\
	"${file}-$$version") label=${label}-ts-$$version ;; \\
${has('node') ? `${PLATFORMS.map((p) => `	"${file}-${p.platform}-$$version") label=${label}-ts-$$version-${p.platform} ;; \\`).join('\n')}\n` : ''}	*) fail "$$file is no npm package of the release $$version" ;; \\
	esac; \\
	set -- "$$@" "$$file#$$label"; npm=$$((npm + 1)); \\
	done; \\`);
    const want = has('node') ? PLATFORMS.length + 1 : 1;
    counts.push(`	test "$$npm" -eq ${want} || fail "$$dir/npm holds $$npm packages, not ${has('node') ? `the package and one of each of the ${PLATFORMS.length} platforms` : 'the package'}"; \\`);
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
	set -- "$$@" "$$file#${label}-php-ext-$$version-php$$minor-$$platform"; php=$$((php + 1)); \\
	done; \\`);
    counts.push(`	test "$$php" -gt 0 && test $$((php % ${PLATFORMS.length})) -eq 0 || fail "$$dir/php-ext holds $$php extensions, not one of each of the ${PLATFORMS.length} platforms for each PHP minor"; \\`);
  }
  const step = name('release-platform-assets');
  add('release-platform-assets', `${head('release-platform-assets', `release-platform-assets uploads the assets of each platform to the draft GitHub Release of TAG with gh (GN-19g), each
under the label ${label}-<runtime>-<version>-<platform>, or -php<X.Y>-<platform> for the PHP extension, and the npm package
without a platform under ${label}-ts-<version>. A file keeps the name that its packer gave, which PIE and the package
managers read. It fails before an upload when an asset of a platform is missing or a file names no platform.`, '')}
	@test -n "$$TAG" || { echo '${step}: TAG is required, for example make ${step} TAG=v0.0.1' >&2; exit 2; }
	@set -e; version=$$(echo "$$TAG" | sed 's/^v//'); dir=$(RELEASE_ASSETS); fail() { echo "${step}: $$1" >&2; exit 1; }; \\
	set --; wheels=0; npm=0; php=0; \\
${loops.join('\n')}
${counts.join('\n')}
	set -x; \\
	gh release upload "$$TAG" "$$@"
`);

  const header = `# Generated by binding release-recipes from ${contract.core.path}/interface.json; do not edit, and do not track it.
# The release recipes of the binding (binding GN-19h): the Makefile of the repository includes this file after it defines
# BINDING_RUN, the command that starts binding, NODE, NPM and UV, the tools of the checkout, and BINDING_DEP, the target
# that installs binding, if it has one; it runs binding release-recipes to write the file again.
`;
  const shared = `${SHARED}${has('php') ? `\n${INSTALL_LLVM}` : ''}${has('wasm') ? `\n${INSTALL_WASM_BINDGEN}` : ''}`;
  return { path, targets: defined, text: `${header}\n${shared}\n${sections.join('\n')}` };
}
