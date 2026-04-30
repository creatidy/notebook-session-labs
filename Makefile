# ── Notebook Session Labs — Makefile ─────────────────────────────────
#
# Usage:
#   make              Show this help
#   make ext          Build & package the VS Code extension (.vsix)
#   make docker-all   Build, tag & push the Docker image
#   make version VERSION=x.y.z   Bump version across all packages
#
# Docker image tag is auto-detected from the root package.json.

.DEFAULT_GOAL := help

# ── Auto-detected version ────────────────────────────────────────────
VERSION ?= $(shell node -e "console.log(require('./package.json').version)")
IMAGE   := ghcr.io/creatidy/notebook-session-labs-mcp

# ── Phony targets ────────────────────────────────────────────────────
.PHONY: help install build ext \
        docker docker-tag docker-push docker-all \
        version test lint format format-check typecheck clean

# ── Help ─────────────────────────────────────────────────────────────
help: ## Show this help
	@echo "Notebook Session Labs — available targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Docker image version (auto): \033[33m$(VERSION)\033[0m"
	@echo "Override: make docker-tag VERSION=x.y.z"

# ── Install & Build ──────────────────────────────────────────────────
install: ## Install dependencies (pnpm install)
	pnpm install

build: ## Build all packages
	pnpm build

ext: install build ## Build & package VS Code extension (.vsix)
	cd packages/vscode-extension && npx vsce package --no-dependencies

# ── Docker ───────────────────────────────────────────────────────────
docker: ## Build Docker image (tagged :local)
	docker build -t $(IMAGE):local .

docker-tag: ## Tag image with current version
	docker tag $(IMAGE):local $(IMAGE):$(VERSION)

docker-push: ## Push the version-tagged image
	docker push $(IMAGE):$(VERSION)

docker-all: docker docker-tag docker-push ## Build, tag & push Docker image

# ── Version ──────────────────────────────────────────────────────────
version: ## Bump version (usage: make version VERSION=x.y.z)
	@if [ -z "$(VERSION)" ] || [ "$(VERSION)" = "" ]; then \
		echo "Usage: make version VERSION=x.y.z"; exit 1; \
	fi
	bash scripts/version-bump.sh "$(VERSION)"

# ── Quality ──────────────────────────────────────────────────────────
test: ## Run tests (vitest)
	pnpm test

lint: ## Lint source files
	pnpm lint

format: ## Format code (prettier --write)
	pnpm format

format-check: ## Check formatting (CI-friendly)
	pnpm format:check

typecheck: ## TypeScript type checking
	pnpm typecheck

# ── Clean ────────────────────────────────────────────────────────────
clean: ## Remove all build artifacts
	pnpm clean