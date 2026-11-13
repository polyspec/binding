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
e2e: ## Run the end-to-end check of the generator: REPO=<checkout> WORK=<directory> [BINDING=<commit>] [DEPS="<checkout>..."]
	$(ONLINE) $(NODE) scripts/e2e.mts --binding $(BINDING) --repo $(REPO) --work $(WORK)$(foreach dep,$(DEPS), --dep $(dep))

# The checks of this checkout. A target of several checks runs each to its end and then fails, naming each failed
# check (HR-86): run_all starts each goal of $(1) as a make of its own and prints the goals that failed.
define run_all
	@failed=""; for goal in $(1); do $(MAKE) --no-print-directory $$goal || failed="$$failed $$goal"; done; \
	if [ -n "$$failed" ]; then printf 'failed:%s\n' "$$failed" >&2; exit 1; fi; printf 'passed: %s\n' "$(strip $(1))"
endef
# binding_core, the Rust crate of packages/core/rust, built by the cargo of rust-toolchain.toml.
CORE_MANIFEST := --manifest-path packages/core/rust/Cargo.toml
.PHONY: check test-ts typecheck-ts unit-ts test-rust test-rust-features test-rust-plain lint-rust clippy-rust clippy-rust-features fmt-rust

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

lint-rust: ## Run clippy on binding_core with all features and with none, and check its format
	$(call run_all,clippy-rust-features clippy-rust fmt-rust)
clippy-rust-features:
	cargo clippy --locked $(CORE_MANIFEST) --all-targets --all-features -- -D warnings
clippy-rust:
	cargo clippy --locked $(CORE_MANIFEST) --all-targets -- -D warnings
fmt-rust:
	cargo fmt $(CORE_MANIFEST) --check
