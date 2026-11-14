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
.PHONY: help bootstrap install install-tools install-packages toolchain-lock

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
# PHP of the machine (.php-version) and the PHPUnit of config/phpunit, all into var/tools of this checkout.
install: ## Install the pinned tools and the packages into this checkout; ONLINE
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
endif

install-packages: ## Install package-lock.json and packages/ts/package-lock.json with the npm of var/tools; ONLINE
	$(ONLINE) $(NPM) ci
	$(ONLINE) $(NPM) ci --prefix packages/ts

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

# GN-14f, GN-15g: the consumer of the released form of a Go module on musl. WORK is the work directory of a run of make e2e
# on Linux on the machine of DOCKER_HOST, and RUN_WORK its path in that run (WORK by default); scripts/go-musl.sh runs
# go test -tags musl of its consumer in an Alpine container there. It downloads the Go of mise.lock; ONLINE.
RUN_WORK ?= $(WORK)
.PHONY: go-musl-check
go-musl-check: ## Run the consumer of the released Go module of a Linux e2e run on musl: WORK=<work> [RUN_WORK=<path in the run>]
	$(ONLINE) sh scripts/go-musl.sh "$(WORK)" "$(RUN_WORK)" "$(CURDIR)/mise.lock"

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

documents-stamp: ## Write the source-sha256 of each English document into the Korean twins of PATHS, or of every twin whose source moved; offline
	$(NODE) $(KIT)/documents-stamp.mjs $(PATHS)

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

# ---- Release (config/release.json, .github/workflows/release.yml) -----------------------------------------------------
# The steps of release.yml, in this order: release-tag tags the commit of the successful CI run RUN of ci.yml on main with
# vX.Y.Z of the top section of CHANGELOG.md and appends TAG and VERSION to GITHUB_ENV; release-checkout checks that tag
# out; release-prepare installs the packages of packages/ts, whose prepack script builds dist with tsc; release-tools
# installs the tools that config/release.json needs and release-tools-path puts var/tools/bin and the shims of mise on the
# PATH of the later steps; release-assets builds the archive of every package into var/release/assets; release-publish
# creates the draft GitHub Release and release-undraft makes it public. release-coverage requires every package file of
# the checkout to be classified in config/release.json.
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

release-publish: ## Create the GitHub Release of TAG as a draft with the archives of release-assets
	@test -n "$$TAG" || { echo "release-publish: TAG is required, for example make release-publish TAG=v0.0.1"; exit 1; }
	RELEASE_ASSETS=var/release/assets RELEASE_RECORDS=var/release $(NODE) $(KIT)/release.mjs publish "$$TAG"

release-undraft: ## Make the draft release of TAG public
	@test -n "$$TAG" || { echo "release-undraft: TAG is required, for example make release-undraft TAG=v0.0.1"; exit 1; }
	RELEASE_RECORDS=var/release $(NODE) $(KIT)/release.mjs undraft "$$TAG"

release-coverage: ## Require every package file of the checkout to be classified in config/release.json; offline
	$(NODE) $(KIT)/release.mjs coverage
