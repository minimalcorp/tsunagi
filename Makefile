.PHONY: help up down logs ps shell rebuild clean install dev build lint format type-check

# デフォルトターゲット
help:
	@echo "Available targets:"
	@echo "  make up          - Start Docker containers in detached mode"
	@echo "  make down        - Stop and remove Docker containers"
	@echo "  make logs        - Follow container logs"
	@echo "  make ps          - List running containers"
	@echo "  make shell       - Open shell in app container"
	@echo "  make rebuild     - Rebuild images and start containers"
	@echo "  make clean       - Stop containers and remove volumes"
	@echo ""
	@echo "  make install     - Install dependencies (npm ci)"
	@echo "  make dev         - Start development server"
	@echo "  make build       - Build production bundle"
	@echo "  make lint        - Run ESLint"
	@echo "  make format      - Run Prettier"
	@echo "  make type-check  - Run TypeScript type check"

# Docker操作
up:
	docker compose --profile dev-container up -d

down:
	docker compose --profile dev-container down

logs:
	docker compose --profile dev-container logs -f

ps:
	docker compose ps

shell:
	docker compose exec app bash

rebuild:
	docker compose --profile dev-container up -d --build

clean:
	docker compose --profile dev-container down -v

# 開発コマンド（コンテナ内で実行）
install:
	npm ci

dev:
	npm run dev

build:
	npm run build

lint:
	npm run lint

format:
	npm run format

type-check:
	npm run type-check
