# The recipes of binding. They run the utilities of the installed @polyspec/kit (node_modules/@polyspec/kit) with explicit
# arguments and include no recipe of kit.
KIT := $(CURDIR)/node_modules/@polyspec/kit/dist
KIT_TOOLS := $(CURDIR)/var/tools
NODE := $(KIT_TOOLS)/bin/node
NPM := $(KIT_TOOLS)/bin/npm
# The bootstrap installs the node of var/tools, so it starts with the Node.js of the machine.
BOOTSTRAP_NODE := node
# The mise that make install-tools TOOLS=npm installs keeps its data, cache, state and configuration in var/tools/mise and reads
# mise.toml as its global configuration, whose [settings] state that it runs only what mise.lock pins; the shims of
# var/tools/mise read these directories, so every recipe runs with them, and with var/tools/bin and the shims first on PATH.
export MISE_DATA_DIR := $(KIT_TOOLS)/mise
export MISE_CACHE_DIR := $(KIT_TOOLS)/mise/cache
export MISE_STATE_DIR := $(KIT_TOOLS)/mise/state
export MISE_CONFIG_DIR := $(KIT_TOOLS)/mise/config
export MISE_GLOBAL_CONFIG_FILE := $(CURDIR)/mise.toml
export MISE_GLOBAL_CONFIG_ROOT := $(CURDIR)
export PATH := $(KIT_TOOLS)/bin:$(KIT_TOOLS)/mise/shims:$(PATH)
# Go uses the go of mise.toml and never downloads another toolchain for a go directive; rustup installs no toolchain on
# first use, so a toolchain that make install-tools did not install fails instead of being fetched.
export GOTOOLCHAIN := local
export RUSTUP_AUTO_INSTALL := 0
# The recipes that download run their command with $(ONLINE); binding sets no offline setting yet, so it lifts none.
ONLINE :=

.DEFAULT_GOAL := help
.PHONY: help bootstrap install install-tools install-packages dist toolchain-lock

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

# The npm that devEngines of package.json names installs the lock, @polyspec/kit included, before the tools of the checkout
# exist. It runs outside the checkout with --prefix, since an npm of another release refuses a folder whose devEngines names
# npm 12.2.0 (EBADDEVENGINES); npm reads allow-remote of the .npmrc of the checkout.
BOOTSTRAP_NPM := $(abspath $(shell command -v npm))
bootstrap: ## Install package-lock.json with the npm of devEngines before the tools of the checkout exist; ONLINE
	root="$$PWD"; version="$$(node -p 'require("./package.json").devEngines.packageManager.version')"; \
	cd "$${TMPDIR:-/tmp}" && npm_config_cache="$$root/var/bootstrap/npm-cache" "$(BOOTSTRAP_NPM)" exec --yes --package="npm@$$version" -- npm --prefix "$$root" ci --ignore-scripts

# install installs, in order, the mise, node and npm of mise.toml, the packages of package-lock.json and of packages/ts, and the
# other tools: those of mise.toml at the digests of mise.lock, the Rust toolchain of rust-toolchain.toml with its targets, the
# PHP of the machine (.php-version) and the PHPUnit of config/phpunit, all into var/tools of this checkout. It is the one
# command of a new checkout or worktree (B2.447): where node_modules does not hold the bootstrap of @polyspec/kit yet,
# which install-tools TOOLS=npm runs, it runs bootstrap first; a checkout that holds it runs no bootstrap again.
install: ## Install the pinned tools and the packages into this checkout, a new one too; ONLINE
	$(if $(wildcard $(KIT)/bootstrap/bootstrap.mjs),,$(MAKE) --no-print-directory bootstrap)
	$(MAKE) --no-print-directory install-tools TOOLS=npm
	$(MAKE) --no-print-directory install-packages
	$(MAKE) --no-print-directory install-tools

# The home and the cache of the Composer that install-tools runs for the project of config/phpunit.
COMPOSER_TOOL_ENV = COMPOSER_HOME=$(KIT_TOOLS)/composer/home COMPOSER_CACHE_DIR=$(KIT_TOOLS)/composer/cache
# TOOLS=npm runs the bootstrap of kit, which imports only Node.js built-ins, with the Node.js of the machine; any other TOOLS
# names tools of kit, such as go or rust, and no TOOLS installs every declared tool.
install-tools: ## Install every declared tool or the tools of TOOLS; TOOLS=npm runs the bootstrap; ONLINE
ifeq ($(TOOLS),npm)
	$(ONLINE) $(BOOTSTRAP_NODE) $(KIT)/bootstrap/bootstrap.mjs
else
	$(COMPOSER_TOOL_ENV) $(ONLINE) $(NODE) $(KIT)/install-tools.mjs --no-self-update $(TOOLS)
	$(if $(or $(if $(TOOLS),,all),$(filter php,$(TOOLS))),$(NODE) scripts/php-minor.mts)
endif

install-packages: ## Install package-lock.json and packages/ts/package-lock.json with the npm of var/tools; ONLINE
	$(ONLINE) $(NPM) ci
	$(ONLINE) $(NPM) ci --prefix packages/ts

# dist writes packages/ts/dist with the tsc of the checkout and gives the bin the mode that npm install gives the bin of a
# release: a consumer that links this checkout runs node_modules/.bin/binding, and tsc writes dist/cli.js 0644 (GN-14j).
dist: ## Build packages/ts/dist and make its bin dist/cli.js executable, for a consumer that links this checkout; offline
	$(NPM) run --prefix packages/ts build
	chmod 0755 packages/ts/dist/cli.js

# toolchain-lock writes mise.lock with the mise of var/tools for the platforms of the deployment targets (plan T-2).
TOOLCHAIN_LOCK_PLATFORMS := linux-x64,linux-arm64,macos-arm64
toolchain-lock: ## Write mise.lock for the platforms of the deployment targets; ONLINE
	$(ONLINE) $(KIT_TOOLS)/bin/mise lock --global --platform $(TOOLCHAIN_LOCK_PLATFORMS)

# The end-to-end check of the generator (GN-14) on the Node.js of the checkout, with the tools of var/tools: BINDING is
# the commit of binding that the run checks (GN-14b), REPO the checkout of a repository, WORK the directory of its
# copies and DEPS the checkouts of the repositories whose types the contract names; the run checks the targets of the
# contract. It writes its record into var/report/e2e and downloads the crates and packages that the copies lock; ONLINE.
BINDING ?= HEAD
.PHONY: e2e
e2e: ## Run the end-to-end check of the generator: REPO=<checkout> [WORK=<directory>] [BINDING=<commit>] [DEPS="<checkout>..."]
	$(ONLINE) $(NODE) scripts/e2e.mts --binding $(BINDING) --repo $(REPO)$(if $(WORK), --work $(WORK))$(foreach dep,$(DEPS), --dep $(dep))

# B2.432: the lint of the generated crates of the repositories of tests/e2e before a commit, a gate of AGENTS.md: the
# end-to-end check of HEAD of each repository of the matrix of the job e2e with its DEPS (scripts/e2e-lint-repos.mts),
# stopped after cargo clippy -D warnings of each binding crate with its test features and without them; no package is
# built and no test runs. npm runs offline. Cargo is not offline: it takes binding_core at HEAD from this checkout by
# Git (url.<base>.insteadOf of scripts/e2e.mts), which the offline mode of Cargo forbids for a commit that its cache does
# not hold, and it reads the index of the registry to resolve each copy; ONLINE. Records in var/report/e2e-lint. REPOS
# names some of those repositories, every one by default.
.PHONY: e2e-lint
e2e-lint: ## Lint the generated crates of the repositories of tests/e2e with the CLI of HEAD, no test: [REPOS="tests/e2e/<name>..."]
	$(ONLINE) npm_config_offline=true $(NODE) scripts/e2e-lint-repos.mts $(REPOS)

# GN-14f, GN-15g: the consumer of the released form of a Go module on musl. WORK is the work directory of a run of make e2e
# on Linux on the machine of DOCKER_HOST; scripts/go-musl.sh runs go test -tags musl of its consumer in an Alpine
# container there. It downloads the Go of mise.lock and the packages of Alpine of config/toolchain.json; ONLINE.
.PHONY: go-musl-check
go-musl-check: ## Run the consumer of the released Go module of a Linux e2e run on musl: WORK=<work directory on the machine of DOCKER_HOST>
	$(ONLINE) sh scripts/go-musl.sh "$(WORK)" "$(CURDIR)/mise.lock" "$(CURDIR)/config/toolchain.json"

# GN-14i: the compile check of the generated bindings of consumer repositories with the CLI and the binding_core of this
# tree. DIRS names consumer checkouts or package directories inside one (packages/<component>); each committed tree is
# copied outside its checkout, and the run writes var/report/consumers/<run>. The run is evidence of EXPECT, of the commit
# of the MANIFEST.txt of DIST, or else of the HEAD of this checkout, and stops before the first consumer when this tree
# is another commit or has changes. It fetches the crates of each consumer's lock with cargo fetch --locked and runs
# every other command offline; ONLINE.
.PHONY: consumers-check
consumers-check: ## Compile the generated bindings of consumers with this tree and print a consumer x target table: DIRS="<dir>..." [EXPECT=<commit> | DIST=<dir>]
	@test -n "$(DIRS)" || { echo 'consumers-check: DIRS is required, for example make consumers-check DIRS="../json ../hyper"' >&2; exit 2; }
	$(ONLINE) $(NODE) scripts/consumers-check.mts$(foreach dir,$(DIRS), --dir $(dir))$(if $(EXPECT), --expect $(EXPECT))$(if $(DIST), --dist $(DIST))

# GN-14m: the consumer gate of a release. JOB names a job of config/consumers.json; each consumer of the job is cloned
# at its release tag into WORK (or a new directory under the temporary directory), takes polyspec-binding-core of this
# tree by the path patch of Cargo and the CLI dist/cli.js, which make dist builds, and runs its own goals: its install,
# bindings, test-bindings offline, then release-recipes, the release builds of the host and rehearse-go-module with no
# cache. Records in var/report/consumer-gate/<JOB>; ONLINE.
.PHONY: consumer-gate
consumer-gate: ## Run the consumers of a job of config/consumers.json at their release tags with this tree: JOB=<job> [WORK=<directory>]
	@test -n "$(JOB)" || { echo 'consumer-gate: JOB is required, for example make consumer-gate JOB=small' >&2; exit 2; }
	$(ONLINE) $(NODE) scripts/consumer-gate-run.mts --job $(JOB)$(if $(WORK), --work $(WORK))

# The checks of this checkout. A target of several checks runs each to its end and then fails, naming each failed
# check (HR-86): run_all starts each goal of $(1) as a make of its own and prints the goals that failed.
define run_all
	@failed=""; for goal in $(1); do $(MAKE) --no-print-directory $$goal || failed="$$failed $$goal"; done; \
	if [ -n "$$failed" ]; then printf 'failed:%s\n' "$$failed" >&2; exit 1; fi; printf 'passed: %s\n' "$(strip $(1))"
endef
# binding_core, the Rust crate of packages/core/rust, built by the cargo of rust-toolchain.toml.
CORE_MANIFEST := --manifest-path packages/core/rust/Cargo.toml
.PHONY: check test-ts typecheck-ts unit-ts test-rust test-rust-features test-rust-plain lint-rust clippy-rust clippy-rust-features fmt-rust fmt-e2e

check: ## Run test-ts, test-rust and lint-rust, each to its end, and name each failed one
	$(call run_all,test-ts test-rust lint-rust)

test-ts: ## Type-check packages/ts and run its tests on node --test
	$(call run_all,typecheck-ts unit-ts)
typecheck-ts:
	$(NPM) run --prefix packages/ts typecheck
unit-ts:
	$(NPM) test --prefix packages/ts

test-rust: ## Test binding_core with all features and with none
	$(call run_all,test-rust-features test-rust-plain)
test-rust-features:
	cargo test --locked $(CORE_MANIFEST) --all-features
test-rust-plain:
	cargo test --locked $(CORE_MANIFEST)

lint-rust: ## Run clippy on binding_core with all features and with none, and check its format and that of the e2e cores
	$(call run_all,clippy-rust-features clippy-rust fmt-rust fmt-e2e)
clippy-rust-features:
	cargo clippy --locked $(CORE_MANIFEST) --all-targets --all-features -- -D warnings
clippy-rust:
	cargo clippy --locked $(CORE_MANIFEST) --all-targets -- -D warnings
fmt-rust:
	cargo fmt $(CORE_MANIFEST) --check
# The cores of the repositories of the end-to-end check are in the form that rustfmt gives with its defaults. rustfmt
# reads each source alone, because cargo fmt reads a workspace whose binding crates only a run writes (GN-14d).
E2E_RUST := $(sort $(wildcard tests/e2e/*/packages/rust/src/*.rs))
fmt-e2e:
	$(if $(E2E_RUST),rustfmt --check --edition 2021 $(E2E_RUST),$(error fmt-e2e: no Rust source under tests/e2e/*/packages/rust/src))

# ---- Documents (config/documents.json, config/checklist.json) ---------------------------------------------------------
# docs-check reads each document of config/documents.json on its own with the utility of kit: links, anchors, fences, the
# changelogs, private paths and the checklists of docs/plans/<plan>/; documents-stamp writes the source-sha256 of each
# English document into its Korean twin after the translation is reviewed, for PATHS or for every twin whose source moved.
.PHONY: docs-check documents-stamp
docs-check: ## Check the documents, the changelogs and the checklists; offline
	$(NODE) $(KIT)/check-documents.mjs --checklist-place --private-path /Users/ --private-path /home/ --kit-rows

# duplication-check runs the duplication-check of kit (jscpd) over the code of the checkout by config/duplication.json:
# the TypeScript of packages/ts/src and scripts, a piece of 6 lines or more. It fails on today's tree until the
# duplications that its first run found are removed (B2.517 to B2.521); then the check job of ci.yml runs it (B2.515).
.PHONY: duplication-check
duplication-check: ## Fail on a piece of 6 lines or more of code that exists twice outside the globs of config/duplication.json; offline
	$(NODE) $(KIT)/duplication-check.mjs

documents-stamp: ## Write the source-sha256 of each English document into the Korean twins of PATHS, or of every twin whose source moved; offline
	$(NODE) $(KIT)/documents-stamp.mjs $(PATHS)

# ---- Git hooks (.githooks) ---------------------------------------------------------------------------------------------
# The hook commit-msg of .githooks refuses a message with the footer or the identity line of an AI tool, through the rules
# commit-ai-footer and commit-ai-identity of check-commits of kit, before the commit exists: a push publishes what a
# commit holds, and a commit that was pushed is not written again. make hooks points core.hooksPath of the checkout, and
# so of each of its worktrees, at .githooks and makes the hook executable; hooks-check fails a checkout without it.
.PHONY: hooks hooks-check twin-merge commit-msg-hook
# The changelogs and the checklists merge with the drivers of kit (K354): a union keeps a task row twice when one side
# changes its state, and leaves the revision marker of a Korean twin stale (B2.424).
TWIN_MERGE_DRIVER := make --no-print-directory twin-merge MERGE="%O %A %B %P"
HOOK_DECLARATION := --hooks-path .githooks --hook commit-msg --merge 'CHANGELOG.md=kit-changelog' --merge 'CHANGELOG.ko.md=kit-twin' \
	--merge 'docs/plans/*/checklist.md=kit-checklist' --merge 'docs/plans/*/checklist.ko.md=kit-twin' \
	--driver 'kit-twin=$(TWIN_MERGE_DRIVER)' --driver 'kit-changelog=$(TWIN_MERGE_DRIVER)' --driver 'kit-checklist=$(TWIN_MERGE_DRIVER)'
hooks: ## Point core.hooksPath at .githooks, whose commit-msg refuses an AI footer or identity line, and declare the merge drivers; offline
	$(NODE) $(KIT)/git-hooks.mjs install $(HOOK_DECLARATION)

hooks-check: ## Fail unless core.hooksPath points at .githooks, its hooks are executable and the merge drivers are declared; offline
	$(NODE) $(KIT)/git-hooks.mjs check $(HOOK_DECLARATION)

twin-merge: ## The merge drivers of a Korean twin, a changelog and a checklist; git runs it with MERGE="<base> <ours> <theirs> <path>"; offline
	@$(NODE) $(KIT)/twin-merge.mjs $(MERGE)

commit-msg-hook: ## Check the message of the commit in MESSAGE, a file, as the hook commit-msg does; offline
	$(NODE) $(KIT)/check-commits.mjs --message $(MESSAGE) --rules commit-ai-footer,commit-ai-identity

# ---- CI (.github/workflows/ci.yml) -------------------------------------------------------------------------------------
# ci-targets runs TARGETS past failures with the utility of kit and writes CI_REPORT: the log of each target, record.json
# and summary.md; ci-summary writes summary.md again, also for a run that stopped; ci-passed, the last job of the
# workflow, fails unless every job of RESULTS, the JSON of toJSON(needs), has the result success.
CI_REPORT ?= var/report/ci-targets
.PHONY: ci-targets ci-summary ci-passed
ci-targets: ## Run TARGETS past failures and write CI_REPORT (logs, record.json, summary.md)
	$(NODE) $(KIT)/ci-targets.mjs -k $(CI_REPORT) $(TARGETS)

ci-summary: ## Write summary.md of CI_REPORT again from its record, also for a run that stopped
	$(NODE) $(KIT)/ci-targets.mjs --summary $(CI_REPORT)

ci-passed: ## Fail unless every job of RESULTS, the JSON of toJSON(needs), has the result success
	$(NODE) $(KIT)/ci-passed.mjs

# The jobs of ci.yml. Each job of the workflow runs one recipe, make ci-<job> with the values of its matrix entry as make
# variables, and a local run is the same call: the recipe holds the order and the conditions of the job, so a run
# needs no runner of GitHub. A recipe installs first and stops when an install fails, then runs its checks, each to its
# end, then cleans up and reports in every case; its status is that of its installs and its checks.
#
# ci-check installs the tools of TOOLS and runs TARGETS with ci-targets into the report var/ci/<NAME>, then writes
# summary.md with ci-summary in every case, naming the install as the setup step tools with its outcome (CI_STEPS).
.PHONY: ci-check ci-e2e ci-e2e-amd64 ci-consumers
ci-check: ## Run the check job of ci.yml: NAME=<entry> TARGETS="<target>..." [TOOLS="<tool>..."]
	@test -n "$(NAME)" && test -n "$(TARGETS)" || { echo 'ci-check: NAME and TARGETS are required, for example make ci-check NAME=ts TOOLS=rust TARGETS="typecheck-ts unit-ts"' >&2; exit 2; }
	@tools=success; status=1; \
	$(MAKE) --no-print-directory install-tools TOOLS="$(TOOLS)" || tools=failure; \
	if [ "$$tools" = success ]; then $(MAKE) --no-print-directory ci-targets TARGETS="$(TARGETS)" CI_REPORT=var/ci/$(NAME) && status=0; fi; \
	CI_STEPS="{\"tools\":{\"outcome\":\"$$tools\"}}" $(MAKE) --no-print-directory ci-summary CI_REPORT=var/ci/$(NAME) || status=1; \
	exit $$status

# ci-e2e installs every tool, then runs make e2e of REPO with DEPS in a work directory of its own under the temporary
# directory of the system, outside the checkout, and make go-musl-check on that directory only after make e2e passed,
# because it reads what the run of make e2e wrote there (GN-14f, GN-15g). A refusal fixture, a REPO with refused.json,
# runs no go-musl-check: its run ends at the refusal of the compiler and makes no released form of a Go module (GN-14k,
# GN-14g). It removes the work directory at its end, at
# its failure and on SIGINT and SIGTERM, after the command that uses it has ended (HR-87). The record of make e2e is in
# var/report/e2e. The directory is named by its real path, as scripts/e2e-work.mts names one.
ci-e2e: ## Run the e2e job of ci.yml: REPO=<repository of tests/e2e> [DEPS="<repository>..."]
	@test -n "$(REPO)" || { echo 'ci-e2e: REPO is required, for example make ci-e2e REPO=tests/e2e/sample' >&2; exit 2; }
	$(MAKE) --no-print-directory install-tools
	@work="$$(cd "$$(mktemp -d "$${TMPDIR:-/tmp}/binding-ci-e2e.XXXXXX")" && pwd -P)" || exit 1; \
	trap 'rm -rf "$$work"' EXIT; trap 'exit 130' INT; trap 'exit 143' TERM; \
	echo "ci-e2e: work directory $$work"; \
	$(MAKE) --no-print-directory e2e REPO=$(REPO) DEPS="$(DEPS)" WORK="$$work" || exit $$?; \
	if [ -f "$(REPO)/refused.json" ]; then \
	echo "ci-e2e: $(REPO) is a refusal fixture (refused.json), whose run makes no released form of a Go module, so go-musl-check does not run (GN-14k)"; \
	else $(MAKE) --no-print-directory go-musl-check WORK="$$work"; fi

# GN-14g, GN-15g: the job e2e-amd64 runs the job e2e of the sample on linux/amd64.
ci-e2e-amd64: ## Run the e2e-amd64 job of ci.yml: the e2e job of tests/e2e/sample
	$(MAKE) --no-print-directory ci-e2e REPO=tests/e2e/sample DEPS=

# GN-14m: the job consumers runs make ci-consumers for each job of config/consumers.json: it builds dist, the CLI that
# each consumer runs, stops when the build fails, and runs make consumer-gate of JOB in a work directory of its own
# under the temporary directory, which it removes at its end, at its failure and on SIGINT and SIGTERM (HR-87). The
# consumers install their own tools from their own checkouts. The record of the run is in var/report/consumer-gate.
ci-consumers: ## Run the consumers job of ci.yml: JOB=<job of config/consumers.json>
	@test -n "$(JOB)" || { echo 'ci-consumers: JOB is required, for example make ci-consumers JOB=small' >&2; exit 2; }
	$(MAKE) --no-print-directory dist
	@work="$$(cd "$$(mktemp -d "$${TMPDIR:-/tmp}/binding-ci-consumers.XXXXXX")" && pwd -P)" || exit 1; \
	trap 'rm -rf "$$work"' EXIT; trap 'exit 130' INT; trap 'exit 143' TERM; \
	echo "ci-consumers: work directory $$work"; \
	$(MAKE) --no-print-directory consumer-gate JOB=$(JOB) WORK="$$work"

# ---- Release (config/release.json, .github/workflows/release.yml) -----------------------------------------------------
# The steps of release.yml, in this order: release-tag tags the commit of the successful CI run RUN of ci.yml on main with
# vX.Y.Z of the top section of CHANGELOG.md and appends TAG and VERSION to GITHUB_ENV; release-checkout checks that tag
# out; release-prepare installs the packages of packages/ts, whose prepack script builds dist with tsc; release-tools
# installs the tools that config/release.json needs and release-tools-path puts var/tools/bin and the shims of mise on the
# PATH of the later steps; release-assets builds the archive of every package into var/release/assets; release-publish
# creates the draft GitHub Release and release-undraft makes it public. release-coverage requires every package file of
# the checkout to be classified in config/release.json. release-candidate-assets is no step of release.yml: the check
# job of ci.yml and the gates before a version-bump commit run it.
.PHONY: release-tag release-checkout release-prepare release-tools release-tools-path release-assets release-publish release-undraft release-coverage
release-tag: ## Tag the commit of the successful CI run RUN of ci.yml on main with vX.Y.Z of the change log; AUTO=1 releases only a version commit; reads the run with gh
	@test -n "$$RUN" || { echo "release-tag: RUN is required, for example make release-tag RUN=123"; exit 1; }
	RELEASE_MAIN=origin/main $(NODE) $(KIT)/release-run.mjs tag "$$RUN"$(if $(AUTO), --auto)

release-checkout: ## Check out the tag TAG that release-tag created
	@test -n "$$TAG" || { echo "release-checkout: TAG is required, for example make release-checkout TAG=v0.0.1"; exit 1; }
	git checkout --quiet "$$TAG"

release-prepare: ## Install the locked packages of the checkout and of packages/ts, for a release; ONLINE
	$(MAKE) --no-print-directory install-packages

release-tools: ## Install the tools that config/release.json needs for the release; ONLINE
	$(ONLINE) $(NODE) $(KIT)/release-tools.mjs

release-tools-path: ## Append var/tools/bin and the shims of mise to GITHUB_PATH and the environment of mise to GITHUB_ENV
	@test -n "$$GITHUB_PATH" && test -n "$$GITHUB_ENV" || { echo 'release-tools-path: GITHUB_PATH and GITHUB_ENV are set only between the steps of a workflow'; exit 1; }
	printf '%s\n%s\n' "$(KIT_TOOLS)/bin" "$(KIT_TOOLS)/mise/shims" >> "$$GITHUB_PATH"
	printf 'MISE_DATA_DIR=%s\nMISE_CACHE_DIR=%s\nMISE_STATE_DIR=%s\nMISE_CONFIG_DIR=%s\nMISE_GLOBAL_CONFIG_FILE=%s\nMISE_GLOBAL_CONFIG_ROOT=%s\n' \
		"$(MISE_DATA_DIR)" "$(MISE_CACHE_DIR)" "$(MISE_STATE_DIR)" "$(MISE_CONFIG_DIR)" "$(MISE_GLOBAL_CONFIG_FILE)" "$(MISE_GLOBAL_CONFIG_ROOT)" >> "$$GITHUB_ENV"

release-assets: ## Build the archive of every package of TAG into var/release/assets; ONLINE
	@test -n "$$TAG" || { echo "release-assets: TAG is required, for example make release-assets TAG=v0.0.1"; exit 1; }
	RELEASE_ASSETS=var/release/assets $(ONLINE) $(NODE) $(KIT)/release.mjs assets "$$TAG"

# release-candidate-assets runs the archive steps of release-assets on the committed HEAD with no tag (B2.455): the
# release creates and pushes the tag before it builds the archive, so without this target a failure of those steps first
# shows after the tag. kit refuses a checkout with a changed or an untracked path and a version that is not the one of
# the manifest of packages/ts. Without VERSION it packs the version that the release would take, the top `## X.Y.Z` of
# the change log, which scripts/release-candidate-version.mts reads with the functions of kit. npm pack runs the prepack
# build with the packages that are installed and downloads nothing. The steps that need the tag and GitHub
# (release-tag, release-publish, release-undraft) are not run. It ends with the check of the sizes of GN-19g on the
# archives that it built (B2.505): every archive of a release is built after the tag, so CI, which runs this target on the
# same tree before any tag, is where an empty archive or one of 2 GiB or more fails without burning a tag. Only a VERSION of the command line counts, so a VERSION
# that the environment of a machine happens to hold does not replace the version of the change log.
.PHONY: release-candidate-assets
release-candidate-assets: ## Build the archive of every package from the committed HEAD into var/release-candidate/assets, with no tag: [VERSION=X.Y.Z], else the top version of the change log; offline
	@version="$(if $(filter command line,$(origin VERSION)),$(VERSION))"; \
	if [ -z "$$version" ]; then version="$$($(NODE) scripts/release-candidate-version.mts)" || exit 1; fi; \
	echo "release-candidate-assets: VERSION $$version"; \
	RELEASE_ASSETS=var/release-candidate/assets $(NODE) $(KIT)/release.mjs candidate-assets "$$version"
	$(NODE) packages/ts/src/cli.ts asset-sizes --step release-candidate-assets var/release-candidate/assets

release-publish: ## Create the GitHub Release of TAG as a draft with the archives of release-assets
	@test -n "$$TAG" || { echo "release-publish: TAG is required, for example make release-publish TAG=v0.0.1"; exit 1; }
	RELEASE_ASSETS=var/release/assets RELEASE_RECORDS=var/release $(NODE) $(KIT)/release.mjs publish "$$TAG"

release-undraft: ## Make the draft release of TAG public
	@test -n "$$TAG" || { echo "release-undraft: TAG is required, for example make release-undraft TAG=v0.0.1"; exit 1; }
	RELEASE_RECORDS=var/release $(NODE) $(KIT)/release.mjs undraft "$$TAG"

# ci-release is the one job of release.yml (B2.278): it tags the commit of the CI run RUN (AUTO=1 releases only a version
# commit), and when a tag was created, checks it out, installs the lock, the packages and the tools of the tagged tree,
# builds the archives, creates the draft release and makes it public, each step only after the one before it passed.
# release-tag writes TAG into a file of this run, which the recipe reads and removes, so no step reads a variable that
# the runner keeps between steps. Each later step is a make of its own, which reads the Makefile of the tag. A run
# that creates no tag ends with status 0.
.PHONY: ci-release
ci-release: ## Run the release job of release.yml: RUN=<id of a successful CI run> [AUTO=1]; reads and writes GitHub with gh
	@test -n "$(RUN)" || { echo 'ci-release: RUN is required, for example make ci-release RUN=123' >&2; exit 2; }
	@env_file="$$(mktemp "$${TMPDIR:-/tmp}/binding-ci-release.XXXXXX")" || exit 1; \
	trap 'rm -f "$$env_file"' EXIT; trap 'exit 130' INT; trap 'exit 143' TERM; \
	GITHUB_ENV="$$env_file" RUN="$(RUN)" $(MAKE) --no-print-directory release-tag RUN="$(RUN)" AUTO="$(AUTO)" || exit 1; \
	tag="$$(sed -n 's/^TAG=//p' "$$env_file" | tail -n 1)"; \
	if [ -z "$$tag" ]; then echo 'ci-release: release-tag created no tag; nothing to release'; exit 0; fi; \
	TAG="$$tag" $(MAKE) --no-print-directory release-checkout && \
	$(MAKE) --no-print-directory bootstrap && \
	$(MAKE) --no-print-directory install-tools TOOLS=npm && \
	$(MAKE) --no-print-directory release-prepare && \
	$(MAKE) --no-print-directory release-tools && \
	TAG="$$tag" $(MAKE) --no-print-directory release-assets && \
	TAG="$$tag" $(MAKE) --no-print-directory release-publish && \
	TAG="$$tag" $(MAKE) --no-print-directory release-undraft

release-coverage: ## Require every package file of the checkout to be classified in config/release.json; offline
	$(NODE) $(KIT)/release.mjs coverage
