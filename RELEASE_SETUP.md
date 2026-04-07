# Release Setup Checklist

`feat/npm-1uq1` ブランチを `main` にマージした後、npm 公開・docs デプロイ・CLA 運用を始めるために**メンテナーが一度だけ手動で実施する必要がある作業**のチェックリスト。

以下の順番で実施することを推奨します。依存関係があるため、順序を守ってください。

---

## 0. 作業全体像

| #               | 作業                                               | 必須度 | 所要時間 |
| --------------- | -------------------------------------------------- | ------ | -------- |
| 1               | npm 側のアカウント・Token 準備                     | 必須   | 10分     |
| 2               | GitHub リポジトリ設定                              | 必須   | 15分     |
| &nbsp;&nbsp;2-1 | GitHub Pages を Actions ソースに設定               | 必須   | 1分      |
| &nbsp;&nbsp;2-2 | `NPM_TOKEN` を Secrets に登録                      | 必須   | 2分      |
| &nbsp;&nbsp;2-3 | `production-release` Environment 作成 + 承認者設定 | 必須   | 3分      |
| &nbsp;&nbsp;2-4 | `main` ブランチ保護 + GitHub Actions bypass        | 必須   | 5分      |
| &nbsp;&nbsp;2-5 | `cla-signatures` ブランチ保護                      | 推奨   | 3分      |
| 3               | 初回リリース実行と動作検証                         | 必須   | 15分     |
| 4               | docs 用スクリーンショットの差し替え                | 必須   | 15分     |
| 5               | 任意の追加設定（カスタムドメイン等）               | 任意   | -        |

---

## 1. npm 側のアカウント・Token 準備

### 1-1. npm アカウント / Organization 準備

- [ ] [npmjs.com](https://www.npmjs.com/) にログイン（未登録なら作成）
- [ ] `minimalcorp` organization を作成（未作成の場合）
  - [https://www.npmjs.com/org/create](https://www.npmjs.com/org/create)
- [ ] `@minimalcorp/tsunagi` パッケージ名が未取得であることを確認（先に取られていたら別名を要検討）
- [ ] アカウントで **2FA を有効化**（npm 公式推奨、`npm publish --provenance` の前提条件）

### 1-2. Automation Token を発行

- [ ] npmjs.com の Profile → Access Tokens → `Generate New Token` → `Classic Token`
- [ ] Type: **Automation** を選択（Publish タイプではない）
- [ ] トークン文字列をコピー（1回しか表示されないので要保存）

---

## 2. GitHub リポジトリ設定

### 2-1. GitHub Pages を Actions ソースに設定（docs デプロイ用）

- [ ] `https://github.com/minimalcorp/tsunagi/settings/pages` にアクセス
- [ ] **Source**: `GitHub Actions` を選択（**`Deploy from a branch` ではない**）
- [ ] Save

これで `release.yml` の `deploy-docs` job が Pages にデプロイできるようになる。

### 2-2. `NPM_TOKEN` を GitHub Secrets に登録

- [ ] `https://github.com/minimalcorp/tsunagi/settings/secrets/actions` にアクセス
- [ ] `New repository secret` をクリック
- [ ] Name: `NPM_TOKEN`
- [ ] Value: 手順 1-2 で取得したトークン
- [ ] `Add secret`

### 2-3. `production-release` Environment 作成 + 承認者設定（必須）

`release.yml` の `publish-tsunagi` job はこの Environment 配下で実行されるように設定済み。人間の承認操作を介することで、意図しない内容のリリースを防ぐ。

- [ ] `https://github.com/minimalcorp/tsunagi/settings/environments` にアクセス
- [ ] `New environment` → 名前を `production-release` として作成
- [ ] **Required reviewers** にチェックを入れる
- [ ] 承認権限を持つメンバー（自分自身でも可）を追加（**1人以上必須**）
- [ ] `Save protection rules`

Environment を作成しないと、`publish-tsunagi` job が `environment: production-release` 指定に対して「Environment が存在しない」エラーで失敗する。

### 2-4. `main` ブランチ保護 + GitHub Actions bypass

`release.yml` は `npm version` → commit → `git push --follow-tags` で `main` に直接 push する。通常の保護ルールを設定する場合、Actions からの push を bypass 許可しないと workflow が失敗する。

- [ ] `https://github.com/minimalcorp/tsunagi/settings/rules/new?target=branch` にアクセス
- [ ] **Ruleset Name**: `Protect main`
- [ ] **Enforcement status**: `Active`
- [ ] **Target branches** → `Add target` → `Include default branch` を選択
- [ ] **Bypass list** で `Add bypass` をクリック:
  - [ ] `Repository admin` role を追加、または
  - [ ] `Deploy key` で専用の deploy key を設定（高度な用途）
  - → `github-actions[bot]` は `Repository admin` role として扱われるため、上記で workflow からの push が許可される
- [ ] **Branch rules** を設定:
  - ✅ `Restrict deletions`（ブランチ削除を禁止）
  - ✅ `Block force pushes`（force push を禁止）
  - ✅ `Require a pull request before merging`（通常の開発で PR 経由を必須化）
    - Required approvals などの詳細は運用方針に従って調整
- [ ] `Create`

**注意**: `main` に保護ルールを設定しない場合は 2-4 は不要だが、**保護ルールを設定するなら bypass の事前設定は必須**（初回リリースが必ず失敗する）。

### 2-5. `cla-signatures` ブランチ保護（推奨）

CLA bot は署名データを `cla-signatures` という独立 branch に commit する（同リポジトリ運用を採用）。署名履歴の改ざん・削除を防ぐため保護を設定する。

**注意**: このブランチは最初の外部コントリビューターの PR が来て CLA bot が動いた瞬間に自動生成される。事前には存在しないため、パターンマッチで事前登録しておくのがコツ。

- [ ] `https://github.com/minimalcorp/tsunagi/settings/rules/new?target=branch` にアクセス
- [ ] **Ruleset Name**: `Protect cla-signatures`
- [ ] **Enforcement status**: `Active`
- [ ] **Target branches** → `Add target` → `Include by pattern` → `cla-signatures` を入力 → `Add`
- [ ] **Branch rules** の中で有効にするもの:
  - ✅ `Restrict deletions`
  - ✅ `Block force pushes`
- [ ] **無効のまま残すもの**（有効にすると CLA bot の動作がブロックされる）:
  - ⬜ `Require a pull request before merging`
  - ⬜ `Require status checks to pass`
  - ⬜ `Require signed commits`
- [ ] **Bypass list**: 誰も追加しない
- [ ] `Create`

---

## 3. 初回リリース実行と動作検証

### 3-1. tsunagi 初回 publish

- [ ] `https://github.com/minimalcorp/tsunagi/actions/workflows/release.yml` にアクセス
- [ ] 右側の `Run workflow` ドロップダウンを開く
- [ ] 入力:
  - **Use workflow from**: `main`
  - **Release target**: `tsunagi`
  - **Version bump**: `patch`
- [ ] `Run workflow` をクリック
- [ ] workflow が **Waiting for review** 状態になるのを確認
- [ ] `Review deployments` → `production-release` にチェック → 承認コメントを記入 → `Approve and deploy`
  - ← このタイミングで main の最新状態（他 PR の merge 状況等）を目視確認すること
- [ ] workflow の各 step が成功するのを確認
- [ ] 完了後の最終確認:
  - [ ] [npmjs.com/package/@minimalcorp/tsunagi](https://www.npmjs.com/package/@minimalcorp/tsunagi) に `0.1.1` が公開されている
  - [ ] パッケージページに README が表示されている（`apps/web/README.md` の内容）
  - [ ] パッケージページに `provenance` バッジが表示されている
  - [ ] GitHub Releases に `v0.1.1` が作成されている
  - [ ] `main` ブランチに `chore: release @minimalcorp/tsunagi v0.1.1` の commit が push されている

### 3-2. クリーン環境での動作検証

- [ ] 別のマシン、または Docker コンテナ等のクリーン環境で以下を実行:
  ```bash
  npx @minimalcorp/tsunagi
  ```
- [ ] ブラウザで `http://localhost:2791` にアクセスして動作確認
- [ ] macOS と Linux の両方でテスト（Linux は Docker でも可）

### 3-3. docs 初回デプロイ

- [ ] `Run workflow` → **target**: `docs`, **version**: `patch`（docs には無視されるがダミー必須）で実行
- [ ] `production-release` Environment 承認は **publish-tsunagi job のみ**なので、`docs` ターゲット時は承認不要で即実行される
- [ ] 完了後の確認:
  - [ ] `https://minimalcorp.github.io/tsunagi/` にアクセスしてページが表示される
  - [ ] `index` ページ / `getting-started/installation` ページの両方が表示される
  - [ ] サイドバー、ヘッダーの GitHub link、ダークモード切替が動作する
  - [ ] docs の検索機能（あれば）が動作する

---

## 4. ドキュメント用スクリーンショットの差し替え（必須）

`apps/docs/` には現在 1×1 の透過 PNG プレースホルダーが配置されています。
公開前に実際の Tsunagi UI のスクリーンショットに差し替える必要があります。

### 撮影と配置

以下 8 枚を撮影して `apps/docs/public/screenshots/` に**同じファイル名で**
上書き配置してください。

| #   | ファイル名             | 撮影内容                                                    | 主な掲載先               |
| --- | ---------------------- | ----------------------------------------------------------- | ------------------------ |
| 1   | `hero.png`             | メイン画面全体（タスク一覧 + プランナーの両方が見える状態） | LP の Hero               |
| 2   | `task-list.png`        | 左側のタスクリストのアップ（複数タスクが並んでいる状態）    | Tutorial / Features      |
| 3   | `task-detail.png`      | タスク詳細画面（worktree、ターミナルタブが見える状態）      | LP / Tutorial            |
| 4   | `terminal-session.png` | Claude が動作中のターミナルセッション                       | Tutorial / Features      |
| 5   | `worktree-tabs.png`    | 複数タブで並列セッションが走っている様子                    | Tutorial / Features      |
| 6   | `mcp-task-create.png`  | Claude が MCP 経由でタスクを作成している様子                | Features (MCP)           |
| 7   | `settings-env.png`     | 環境変数設定画面                                            | Initial Setup / Features |
| 8   | `settings-repos.png`   | リポジトリ管理画面                                          | Initial Setup            |

### 撮影サイズ・フォーマット

- **横幅**: 1600〜2000px (Retina 対応)
- **フォーマット**: PNG (テキストが綺麗に出る)
- **圧縮**: ファイルサイズが大きい場合は `pngquant` 等で軽量化推奨
- **テーマ**: light / dark どちらか統一すること（混在は避ける）

### 撮影方法（macOS）

- `Cmd + Shift + 4` → スペースキー → ウィンドウクリック でウィンドウ単位の撮影
- `Cmd + Shift + 5` で範囲指定撮影
- 撮影後、ファイル名を上記表のとおりリネームして配置

### 配置先

```
apps/docs/public/screenshots/
├── hero.png
├── task-list.png
├── task-detail.png
├── terminal-session.png
├── worktree-tabs.png
├── mcp-task-create.png
├── settings-env.png
└── settings-repos.png
```

### 確認

- [ ] 8 枚すべてを差し替えた
- [ ] `npm run build -w tsunagi-docs` で再ビルドしてエラーが出ない
- [ ] `apps/docs/out/en/` 配下の各ページをブラウザで開き、画像が正しく表示されることを確認

> **Note**: 現在のプレースホルダー (1×1 透過 PNG) でもビルドは通りますが、
> 公開時に空白の箇所として表示されます。**docs を公開する前に必ず差し替えて
> ください。**

---

## 5. 任意: 追加の拡張

### 5-1. カスタムドメイン（docs）

`docs.tsunagi.dev` のようなドメインを当てたい場合:

- [ ] DNS プロバイダで `CNAME` レコードを `minimalcorp.github.io` に向ける
- [ ] Repository Settings → Pages → Custom domain にドメイン入力
- [ ] `apps/docs/public/CNAME` ファイルを作成してドメイン名だけ記載（永続化のため）
- [ ] `apps/docs/next.config.mjs` の `metadataBase` を新ドメインに更新し、再度 `docs` を release

### 5-2. 通知連携

release workflow 完了時に Slack 等に通知したい場合、`release.yml` に追加 job を書く。本チェックリストの範囲外。

---

## 最小限の必須作業サマリ

**公開するために絶対に必要**なのは以下:

1. **手順 1** (npm アカウント・Token 準備)
2. **手順 2-1** (GitHub Pages を Actions ソースに)
3. **手順 2-2** (`NPM_TOKEN` secret 登録)
4. **手順 2-3** (`production-release` Environment 作成 + 承認者設定)
5. **手順 2-4** (`main` 保護 + bypass ← 保護ルールを設定する場合のみ)
6. **手順 3** (初回リリース実行と動作検証)
7. **手順 4** (docs 用スクリーンショットの差し替え)

**推奨だが後回しでも可**:

- 手順 2-5 (`cla-signatures` 保護) ← 外部コントリビューターが出る前に済ませておく
- 手順 5 (カスタムドメイン等)

---

## トラブルシューティング

### `publish-tsunagi` job が `Environment not found` で失敗する

→ 手順 2-3 の Environment 作成を忘れている。先に作成してから workflow を再実行。

### `git push` が `protected branch hook declined` で失敗する

→ 手順 2-4 の bypass 設定が不足。`main` 保護 ruleset の Bypass list に `Repository admin` role を追加。

### `npm publish` が `403 Forbidden` で失敗する

→ `NPM_TOKEN` の type が間違っている可能性。**Automation** タイプであること、scope が `@minimalcorp/tsunagi` の書き込み権限を含むことを確認。

### workflow 途中で失敗してバージョンだけ bump された状態で止まった

→ `main` の最新 commit（`chore: release ...`）を revert する commit を作って merge し、再度 workflow を実行。npm 側は同じバージョンを二度 publish できないので、次回は1つ上のバージョンにする必要がある（例: `0.1.1` 失敗 → `0.1.2` でリトライ）。

### push が別 PR の merge と衝突した

→ workflow に組み込まれている retry ロジックが自動で rebase → 再 push を試みる（最大3回）。それでも失敗する場合は手動で rebase 操作が必要。
