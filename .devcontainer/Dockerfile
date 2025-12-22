# ステージ1: 各種ツールのインストール
FROM node:24.12.0-bookworm AS base

# 開発ツールのインストール
RUN apt-get update && apt-get install -y \
    openssh-client \
    ca-certificates \
    git \
    curl \
    wget \
    vim \
    less \
    locales \
    && rm -rf /var/lib/apt/lists/*

# ロケール設定（日本語サポート）
RUN sed -i -e 's/# ja_JP.UTF-8 UTF-8/ja_JP.UTF-8 UTF-8/' /etc/locale.gen && \
    sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen

# 環境変数でロケール設定
ENV LANG=ja_JP.UTF-8 \
    LC_ALL=ja_JP.UTF-8

# ステージ2: 最終イメージ
FROM base

# npm バージョン固定
RUN npm install -g npm@10.8.2

WORKDIR /workspace

# node_modules ディレクトリの事前作成と所有権設定
RUN mkdir -p /workspace/node_modules && chown node:node /workspace/node_modules

# npm キャッシュディレクトリの事前作成と所有権設定
RUN mkdir -p /home/node/.npm && chown -R node:node /home/node/.npm

# nodeユーザーに切り替え
USER node

# uvパッケージマネージャーのインストール（Serena MCP用）
USER root
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    chmod 755 /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod 755 /usr/local/bin/uvx
USER node

# GitHub MCP Server のインストール
USER root
RUN ARCH=$(dpkg --print-architecture) && \
    VERSION=v0.25.0 && \
    TARBALL="github-mcp-server_Linux_${ARCH}.tar.gz" && \
    wget -q "https://github.com/github/github-mcp-server/releases/download/${VERSION}/${TARBALL}" && \
    tar -xzf "${TARBALL}" -C /usr/local/bin && \
    rm "${TARBALL}" && \
    chmod 755 /usr/local/bin/github-mcp-server
USER node

# Claude Code のインストール（nodeユーザーとして実行）
RUN curl -fsSL https://claude.ai/install.sh | bash

# Claude Code の初期設定
RUN mkdir -p /home/node/.claude && \
    echo '{"hasCompletedOnboarding": true}' > /home/node/.claude.json && \
    echo '{"permissions": {"defaultMode": "bypassPermissions"}}' > /home/node/.claude/settings.json

# claude コマンドエイリアス（関数形式で引数をpass through）
RUN echo 'claude() { command claude --mcp-config /workspace/.devcontainer/.mcp.json "$@"; }' >> /home/node/.bashrc
