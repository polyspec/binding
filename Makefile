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
