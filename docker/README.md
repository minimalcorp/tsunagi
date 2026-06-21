# Docker Ephemeral Environment

本番 tsunagi (2791/2792) を稼働させたまま、Docker container で別インスタンスを起動して動作確認するための環境。

## ポートマッピング

Fastify (container 2791 → host 2891) が単一入口。Web/API/WebSocket をまとめて配信し、
それ以外は内部 Next.js (2792) へプロキシする。**アクセスは host:2891 のみ**でよい。

| サービス           | ホスト | container | 備考                                 |
| ------------------ | ------ | --------- | ------------------------------------ |
| 単一入口 (Fastify) | 2891   | 2791      | Web/API/WS をここで配信。アクセス先  |
| Next.js (内部)     | 2892   | 2792      | Fastify がプロキシ。直接アクセス不要 |
| Docs               | 2893   | 2793      |                                      |

## 前提条件

- Docker Desktop (macOS) or Docker Engine (Linux)
- macOS: SSH 鍵が macOS system SSH agent にロードされていること

### macOS の SSH 鍵確認

```bash
# system agent に鍵がロードされているか確認
ssh-add -l

# 鍵が表示されない場合、Keychain から読み込む
ssh-add --apple-use-keychain ~/.ssh/<your-github-key>
```

Docker Desktop は macOS の system SSH agent (`launchd` 管理) のみを container に転送する。カスタム SSH agent を使っている場合は、上記コマンドで system agent にも鍵を追加する必要がある。

## 使い方

### 起動

```bash
make up
```

初回は Docker image ビルド + `npm ci` で数分かかる。2 回目以降はキャッシュにより高速。

起動後:

- Web UI / API / WebSocket: http://localhost:2891 （すべてここ経由）
- Docs: http://localhost:2893

### Basic 認証付きで起動（cloudflared 等で外部公開する場合）

外部公開時は認証なしだと脆弱なため、Basic 認証を有効化して起動する。
`TSUNAGI_BASIC_AUTH_USER` と `TSUNAGI_BASIC_AUTH_PASSWORD` の **両方** を渡すと有効化される
（どちらか欠けると無効）。

```bash
TSUNAGI_BASIC_AUTH_USER=tsunagi TSUNAGI_BASIC_AUTH_PASSWORD=xxxx make up
```

- 外部（cloudflared 経由）からのアクセスはページ/API/WS すべて認証必須になる
- ローカルマシン上の Claude Code 連携 (hooks / MCP) や死活監視は認証なしで通る
- 本番ビルド版でも同様に渡せる: `TSUNAGI_BASIC_AUTH_USER=tsunagi TSUNAGI_BASIC_AUTH_PASSWORD=xxxx make up-prd`
- 値はコミットされない（compose は環境変数を参照するだけ）。リポジトリ root の `.env`（gitignore 対象）に書いてもよい

### ログ確認

```bash
make logs
```

### サービス状態確認

```bash
make ps
```

### 停止

```bash
# container 削除（DB/worktree データは保持、次回 make up で復元）
make down

# 完全リセット（DB/worktree/node_modules 全て削除）
make down-v
```

## SSH agent forwarding の仕組み

### macOS

Docker Desktop の組み込み機構 `/run/host-services/ssh-auth.sock` を使用。macOS の system SSH agent を自動的に container 内に転送する。追加のツールは不要。

### Linux

ホストの `$SSH_AUTH_SOCK` を container に直接マウント。Docker が VM を介さずネイティブ動作するため、Unix socket がそのまま使える。

### トラブルシューティング

**container 内で git clone が失敗する場合:**

```bash
# 1. ホスト側で SSH agent に鍵がロードされているか確認
ssh-add -l

# 2. 鍵がない場合は追加 (macOS)
ssh-add --apple-use-keychain ~/.ssh/<your-github-key>

# 3. container を再起動
make down && make up
```

**container 内から確認:**

```bash
# SSH agent の鍵一覧
docker exec docker-tsunagi-1 runuser -u node -- ssh-add -l

# GitHub への SSH 認証テスト
docker exec docker-tsunagi-1 runuser -u node -- ssh -T git@github.com
```
