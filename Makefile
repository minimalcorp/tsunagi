COMPOSE := docker compose -f docker/compose.yml
UNAME := $(shell uname)

ifeq ($(UNAME), Darwin)
  # macOS: Docker Desktop の組み込み SSH agent forwarding を使用
  SSH_SOCK_HOST := /run/host-services/ssh-auth.sock
else
  # Linux: ホストの SSH agent socket を直接 mount
  SSH_SOCK_HOST := $(SSH_AUTH_SOCK)
endif

SSH_SOCK_CONTAINER := /ssh-agent
SSH_ENV := SSH_SOCK_HOST=$(SSH_SOCK_HOST) SSH_SOCK_CONTAINER=$(SSH_SOCK_CONTAINER)

.PHONY: up down down-v logs ps

up: ## 起動 (初回 or down後)
	$(SSH_ENV) $(COMPOSE) up -d --build

down: ## 停止 & container削除 (DB/worktreeは保持)
	$(SSH_ENV) $(COMPOSE) down

down-v: ## 停止 & container削除 + 全volume削除 (完全リセット)
	$(SSH_ENV) $(COMPOSE) down -v

logs: ## ログを follow 表示
	$(SSH_ENV) $(COMPOSE) logs -f

ps: ## サービス状態表示
	$(SSH_ENV) $(COMPOSE) ps
