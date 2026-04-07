# Release Setup Checklist

`feat/npm-1uq1` ブランチをマージして npm 公開・docs デプロイを行うために、**メンテナーが一度だけ手動で実施する必要がある作業**のチェックリスト。

本ブランチがマージされて `main` に入った後から順番に実施する。

---

## 1. GitHub リポジトリ設定

### 1-1. GitHub Pages を有効化（docs デプロイ用）

- [ ] `https://github.com/minimalcorp/tsunagi/settings/pages` にアクセス
- [ ] **Source**: `GitHub Actions` を選択（**`Deploy from a branch` ではない**）
- [ ] Save

これで `release.yml` の `deploy-docs` job が Pages にデプロイできるようになる。

### 1-2. cla-signatures ブランチの保護ルール設定

**注意**: このブランチは最初の外部コントリビューターの PR が来て CLA bot が動いた瞬間に自動生成される。事前には存在しないので、保護ルールはパターンマッチで事前登録しておくのがコツ。

- [ ] `https://github.com/minimalcorp/tsunagi/settings/rules/new?target=branch` にアクセス
- [ ] **Ruleset Name**: `Protect cla-signatures`
- [ ] **Enforcement status**: `Active`
- [ ] **Target branches** → `Add target` → `Include by pattern` → `cla-signatures` を入力 → Add
- [ ] **Branch rules** の中で有効にするもの:
  - ✅ `Restrict deletions`（ブランチ削除を禁止）
  - ✅ `Block force pushes`（force push を禁止）
- [ ] **無効のまま残すもの**（有効にすると bot 動作がブロックされる）:
  - ⬜ `Require a pull request before merging`
  - ⬜ `Require status checks to pass`
  - ⬜ `Require signed commits`
- [ ] **Bypass list**: 誰も追加しない
- [ ] Create

### 1-3. `main` ブランチ保護（未設定なら推奨）

tsunagi 本体のリリース自動化と整合するように設定する:

- [ ] `https://github.com/minimalcorp/tsunagi/settings/rules/new?target=branch` でもう一つ Ruleset 作成
- [ ] **Target branches**: `main`（Include default branch）
- [ ] 有効化:
  - ✅ `Restrict deletions`
  - ✅ `Block force pushes`
  - ✅ `Require a pull request before merging`（通常の開発フロー用）
- [ ] ただし `release.yml` workflow は `npm version` → commit → `git push --follow-tags` で main に直 push する。**Bypass list に `github-actions[bot]` (Repository admin として追加) または `Repository admin` role を追加**する必要があるかもしれない（最初のリリース実行時に push エラーが出たら設定を見直す）

---

## 2. npm registry 設定

### 2-1. npm アカウント / Organization 準備

- [ ] [npmjs.com](https://www.npmjs.com/) で `minimalcorp` の organization を作成（未作成の場合）
- [ ] `@minimalcorp/tsunagi` パッケージ名が未取得であることを確認（先に取られていれば別名要検討）
- [ ] 2FA を有効化（npm 公式推奨、`npm publish --provenance` の前提）

### 2-2. Automation Token を発行

- [ ] npmjs.com → Profile → Access Tokens → Generate New Token
- [ ] Type: **Automation** を選択
- [ ] Scope: `@minimalcorp/tsunagi` に書き込み権限
- [ ] トークン文字列をコピー（1回しか表示されない）

### 2-3. GitHub Secrets に登録

- [ ] `https://github.com/minimalcorp/tsunagi/settings/secrets/actions`
- [ ] `New repository secret`
- [ ] Name: `NPM_TOKEN`
- [ ] Value: 手順 2-2 のトークン
- [ ] Add secret

---

## 3. 初回リリース動作確認

### 3-1. tsunagi 初回 publish

- [ ] `https://github.com/minimalcorp/tsunagi/actions/workflows/release.yml` にアクセス
- [ ] `Run workflow` → **target**: `tsunagi`, **version**: `patch` を選択して Run
- [ ] 完了後の確認:
  - [ ] npmjs.com で `@minimalcorp/tsunagi@0.1.1`（または bump 後のバージョン）が公開されている
  - [ ] GitHub Releases に `v0.1.1` が作成されている
  - [ ] main ブランチに version bump commit が push されている
- [ ] 別 clean 環境で `npx @minimalcorp/tsunagi` が起動するか検証（macOS/Linux）

### 3-2. docs 初回デプロイ

- [ ] `release.yml` を再度 Run workflow → **target**: `docs`, **version**: `patch`（docs には無視されるがダミー必須）
- [ ] 完了後の確認:
  - [ ] `https://minimalcorp.github.io/tsunagi/` にアクセスしてページが表示される
  - [ ] index ページ / `getting-started/installation` ページの両方が表示される
  - [ ] サイドバー、検索、ダークモード切替が動作する

---

## 4. 任意: 追加の拡張

### 4-1. カスタムドメイン（docs）

`docs.tsunagi.dev` のようなドメインを当てたい場合:

- [ ] DNS プロバイダで `CNAME` レコードを `minimalcorp.github.io` に向ける
- [ ] Repository Settings → Pages → Custom domain にドメイン入力
- [ ] `apps/docs/public/CNAME` ファイルを作成してドメイン名だけ記載（永続化のため）
- [ ] `apps/docs/next.config.mjs` の `metadataBase` を新ドメインに更新

### 4-2. npm publish の README 表示

`@minimalcorp/tsunagi` の npmjs.com パッケージページに README を表示させるには、`apps/web/package.json` の `files` に `README.md` が含まれている必要がある（実装済み）。初回 publish 後に npmjs.com で確認する。

---

## 最小限の必須作業

公開するために**絶対に必要**なのは以下の3つだけ:

1. **GitHub Pages を `GitHub Actions` ソースに設定**（手順 1-1）
2. **npm Automation Token を発行して GitHub Secrets `NPM_TOKEN` に登録**（手順 2-2, 2-3）
3. **初回リリース workflow 実行**（手順 3-1, 3-2）

ブランチ保護（1-2, 1-3）はセキュリティ強化で推奨だが、動作自体には必須ではない。ただし CLA ブランチ保護は早めに設定しておかないと、最初の署名が入った後で設定すると既存 commit を保護対象に取り込む手間が増えるので、先に設定しておくのが望ましい。
