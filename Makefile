COMPOSE     := docker compose -f docker/compose.yml
COMPOSE_PRD := docker compose -f docker/compose.prd.yml -p tsunagi-prd
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

# LM Studio の CLI（PATH になければ LM Studio 初回起動時に置かれる場所）
LMS := $(shell command -v lms 2>/dev/null || echo $(HOME)/.lmstudio/bin/lms)

# ---------------------------------------------------------------------------
# Dev environment
# ---------------------------------------------------------------------------
.PHONY: up down down-v logs ps

up: ## 起動 (初回 or down後)。LM Studio が入っていればホストで LM Studio サーバーも起動
	$(SSH_ENV) $(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory lmstudio-start

down: ## 停止 & container削除 (DB/worktreeは保持)。LM Studio サーバーも停止
	$(SSH_ENV) $(COMPOSE) down
	@$(MAKE) --no-print-directory lmstudio-stop

down-v: ## 停止 & container削除 + 全volume削除 (完全リセット)
	$(SSH_ENV) $(COMPOSE) down -v

logs: ## ログを follow 表示
	$(SSH_ENV) $(COMPOSE) logs -f

ps: ## サービス状態表示
	$(SSH_ENV) $(COMPOSE) ps

# ---------------------------------------------------------------------------
# Production build environment (本番同等の動作確認用)
# ---------------------------------------------------------------------------
.PHONY: up-prd down-prd down-v-prd logs-prd ps-prd

up-prd: ## 本番ビルド → CLI起動
	$(SSH_ENV) $(COMPOSE_PRD) up -d --build

down-prd: ## 停止 & container削除
	$(SSH_ENV) $(COMPOSE_PRD) down

down-v-prd: ## 停止 & container削除 + 全volume削除
	$(SSH_ENV) $(COMPOSE_PRD) down -v

logs-prd: ## ログを follow 表示
	$(SSH_ENV) $(COMPOSE_PRD) logs -f

ps-prd: ## サービス状態表示
	$(SSH_ENV) $(COMPOSE_PRD) ps

# ---------------------------------------------------------------------------
# whisper-server (音声入力)
# mlx-whisperはApple Silicon Mac専用でDocker(Linux)上では動作しないため、
# これだけはコンテナ経由ではなくホストマシン上で直接実行する。
# ---------------------------------------------------------------------------
.PHONY: whisper

whisper: ## ローカルWhisperサーバーをセットアップ・起動 (ホスト上で直接実行、要Apple Silicon Mac)
	cd apps/whisper-server && ./run.sh

# ---------------------------------------------------------------------------
# llm-server (音声入力の文字起こし結果をローカルLLMで整形)
# mlx-lmはApple Silicon Mac専用でDocker(Linux)上では動作しないため、
# これだけはコンテナ経由ではなくホストマシン上で直接実行する。
# ---------------------------------------------------------------------------
.PHONY: llm

llm: ## ローカルLLMサーバーをセットアップ・起動 (ホスト上で直接実行、要Apple Silicon Mac)
	cd apps/llm-server && ./run.sh

# ---------------------------------------------------------------------------
# LM Studio サーバー (ローカルLLMのプロバイダー)
# tsunagi は Settings から lms CLI でサーバーを起動・停止するが、lms は macOS 用で
# コンテナ内にはないため、Docker で動かす場合はホストで起動する。
# LM Studio が入っていない環境でも失敗しないよう、見つからなければ何もしない。
# ---------------------------------------------------------------------------
.PHONY: lmstudio-start lmstudio-stop

lmstudio-start: ## LM Studio サーバーをホストで起動 (lms がなければスキップ)
	@if [ -x "$(LMS)" ]; then \
		"$(LMS)" server start || echo "LM Studio サーバーを起動できませんでした（LM Studio を一度起動してから再実行してください）"; \
	else \
		echo "lms が見つからないため LM Studio サーバーの起動をスキップしました"; \
	fi

lmstudio-stop: ## LM Studio サーバーをホストで停止 (lms がなければスキップ)
	@if [ -x "$(LMS)" ]; then "$(LMS)" server stop || true; fi
