# Docker Ephemeral Environment

本番 tsunagi (2791/2792) を稼働させたまま、Docker container で別インスタンスを起動して動作確認するための環境。

## ポートマッピング

| サービス         | ホスト | container |
| ---------------- | ------ | --------- |
| Web (Next.js)    | 2891   | 2791      |
| Server (Fastify) | 2892   | 2792      |
| Docs             | 2893   | 2793      |

## 前提条件

- Docker Desktop (macOS) or Docker Engine (Linux)
- macOS: SSH 鍵が macOS system SSH agent にロードされていること

### macOS の SSH 鍵確認

```bash
# system agent に鍵がロードされているか確認
ssh-add -l

# 鍵が表示されない場合、Keychain から読み込む
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
```

Docker Desktop は macOS の system SSH agent (`launchd` 管理) のみを container に転送する。カスタム SSH agent を使っている場合は、上記コマンドで system agent にも鍵を追加する必要がある。

## 使い方

### 起動

```bash
make up
```

初回は Docker image ビルド + `npm ci` で数分かかる。2 回目以降はキャッシュにより高速。

起動後:

- Web UI: http://localhost:2891
- API: http://localhost:2892
- Docs: http://localhost:2893

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
ssh-add --apple-use-keychain ~/.ssh/id_ed25519

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
