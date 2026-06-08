# Supform developer convenience commands

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## ---- Full stack ----
.PHONY: up
up: ## Start the full stack with docker compose
	docker compose up --build

.PHONY: down
down: ## Stop the stack
	docker compose down

## ---- Backend ----
.PHONY: backend
backend: ## Run the FastAPI dev server
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

.PHONY: backend-install
backend-install: ## Install backend deps
	cd backend && pip install -e ".[dev]"

.PHONY: migrate
migrate: ## Apply database migrations
	cd backend && alembic upgrade head

.PHONY: test-backend
test-backend: ## Run backend tests
	cd backend && pytest

.PHONY: lint-backend
lint-backend: ## Lint & format-check the backend
	cd backend && ruff check . && ruff format --check . && mypy app

## ---- Frontend ----
.PHONY: frontend
frontend: ## Run the Vite dev server
	cd frontend && npm run dev

.PHONY: frontend-install
frontend-install: ## Install frontend deps
	cd frontend && npm install

.PHONY: test-frontend
test-frontend: ## Run frontend tests
	cd frontend && npm test

## ---- SDK ----
.PHONY: sdk-install
sdk-install: ## Install the Python SDK in editable mode
	cd sdk/python && pip install -e ".[dev]"
