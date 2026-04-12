# tsunagi ephemeral 環境用 Dockerfile
# apps/web/.devcontainer/Dockerfile をベースに、ephemeral 環境向けの調整を加えたもの

FROM node:24.12.0-bookworm AS base

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

RUN sed -i -e 's/# ja_JP.UTF-8 UTF-8/ja_JP.UTF-8 UTF-8/' /etc/locale.gen && \
    sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    locale-gen

ENV LANG=ja_JP.UTF-8 \
    LC_ALL=ja_JP.UTF-8

FROM base

RUN npm install -g npm@10.8.2

WORKDIR /workspace

RUN mkdir -p /workspace/node_modules && chown node:node /workspace/node_modules
RUN mkdir -p /home/node/.npm && chown -R node:node /home/node/.npm

# uv (Serena MCP 用)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/uv && \
    chmod 755 /usr/local/bin/uv && \
    mv /root/.local/bin/uvx /usr/local/bin/uvx && \
    chmod 755 /usr/local/bin/uvx

# GitHub MCP Server
RUN ARCH=$(dpkg --print-architecture) && \
    VERSION=v0.25.0 && \
    TARBALL="github-mcp-server_Linux_${ARCH}.tar.gz" && \
    wget -q "https://github.com/github/github-mcp-server/releases/download/${VERSION}/${TARBALL}" && \
    tar -xzf "${TARBALL}" -C /usr/local/bin && \
    rm "${TARBALL}" && \
    chmod 755 /usr/local/bin/github-mcp-server

# SSH: known_hosts 事前登録 + .ssh ディレクトリ作成
RUN mkdir -p /home/node/.ssh && \
    ssh-keyscan github.com >> /home/node/.ssh/known_hosts && \
    chown -R node:node /home/node/.ssh && \
    chmod 700 /home/node/.ssh && \
    chmod 644 /home/node/.ssh/known_hosts

USER node

# Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/node/.local/bin:$PATH"

RUN mkdir -p /home/node/.claude && \
    echo '{"hasCompletedOnboarding": true}' > /home/node/.claude.json && \
    echo '{"permissions": {"defaultMode": "bypassPermissions"}}' > /home/node/.claude/settings.json
