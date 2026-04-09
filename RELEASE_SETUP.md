# Release Setup Checklist

`feat/npm-1uq1` ブランチを `main` にマージした後、npm 公開・docs デプロイ・CLA 運用を始めるために**メンテナーが一度だけ手動で実施する必要がある作業**のチェックリスト。

以下の順番で実施することを推奨します。依存関係があるため、順序を守ってください。

---

## 前提条件

- [ ] PR #123 (`feat/npm-1uq1`) が `main` に merge 済み

---

## 0. 作業全体像

| #               | 作業                                                | 必須度 | 所要時間 |
| --------------- | --------------------------------------------------- | ------ | -------- |
| 1               | npm 側のアカウント準備                              | 必須   | 5分      |
| 2               | GitHub リポジトリ設定                               | 必須   | 15分     |
| &nbsp;&nbsp;2-1 | GitHub Pages を Actions ソースに設定                | 必須   | 1分      |
| &nbsp;&nbsp;2-2 | `production-release` Environment 作成 + 承認者設定  | 必須   | 3分      |
| &nbsp;&nbsp;2-3 | `main` ブランチ保護 + GitHub Actions bypass         | 必須   | 5分      |
| &nbsp;&nbsp;2-4 | `cla-signatures` ブランチ保護                       | 推奨   | 3分      |
| 3               | npm Trusted Publisher を事前登録                    | 必須   | 3分      |
| 4               | 初回リリース実行と動作検証                          | 必須   | 15分     |
| 5               | docs 用スクリーンショット (配置済み / リファレンス) | -      | -        |
| 6               | 任意の追加設定（カスタムドメイン等）                | 任意   | -        |

---

## 1. npm 側のアカウント準備

### 1-1. npm アカウント / Organization 準備

- [x] [npmjs.com](https://www.npmjs.com/) にログイン（未登録なら作成）
- [x] `minimalcorp` organization を作成（未作成の場合）
  - [https://www.npmjs.com/org/create](https://www.npmjs.com/org/create)
- [x] `@minimalcorp/tsunagi` パッケージ名が未取得であることを確認（先に取られていたら別名を要検討）
- [x] アカウントで **2FA を有効化**（npm 公式推奨、アカウント保護のため）
  - なお本 workflow は **npm Trusted Publishing (OIDC)** で publish するため、2FA 設定は publish 自体には影響しません（2FA はインタラクティブ操作の保護のみ）

> **本 workflow は Automation Token を使用しません。** 代わりに GitHub Actions
> の OIDC token を使う **Trusted Publishing** (2025-07 GA) を採用しています。
> 長期 token を secrets に保存する必要がなく、漏洩しても悪用できません。

---

## 2. GitHub リポジトリ設定

### 2-1. GitHub Pages を Actions ソースに設定（docs デプロイ用）

- [ ] `https://github.com/minimalcorp/tsunagi/settings/pages` にアクセス
- [ ] **Source**: `GitHub Actions` を選択（**`Deploy from a branch` ではない**）
- [ ] Save

これで `release.yml` の `deploy-docs` job が Pages にデプロイできるようになる。
また、この設定を有効にすると `github-pages` Environment が自動で作成される
（`deploy-docs` job の `environment: github-pages` で使用）。

### 2-2. `production-release` Environment 作成 + 承認者設定（必須）

`release.yml` の `approve` job はこの Environment 配下で実行されるように設定済み。
`approve` job を経由することで、`publish-tsunagi` と `deploy-docs` の両方が
人間の承認操作を介して初めて実行される（target=all でも承認は 1 回で両方カバー）。

- [ ] `https://github.com/minimalcorp/tsunagi/settings/environments` にアクセス
- [ ] `New environment` → 名前を `production-release` として作成
- [ ] **Required reviewers** にチェックを入れる
- [ ] 承認権限を持つメンバー（自分自身でも可）を追加（**1人以上必須**）
- [ ] `Save protection rules`

Environment を作成しないと、`approve` job が `environment: production-release`
指定に対して「Environment が存在しない」エラーで失敗する。

### 2-3. `main` ブランチ保護 + GitHub Actions bypass

`release.yml` は `npm version` → commit → `git push --follow-tags` で `main`
に直接 push する。通常の保護ルールを設定する場合、`github-actions[bot]` の
push を明示的に bypass 許可しないと workflow が失敗する。

- [ ] `https://github.com/minimalcorp/tsunagi/settings/rules/new?target=branch` にアクセス
- [ ] **Ruleset Name**: `Protect main`
- [ ] **Enforcement status**: `Active`
- [ ] **Target branches** → `Add target` → `Include default branch` を選択
- [ ] **Bypass list** で `Add bypass` をクリックし、**以下のいずれかを設定**:
  - **推奨: Deploy key 方式** — 独立した SSH deploy key を作成し Bypass に追加。workflow の `checkout` で SSH key を設定する形に変更が必要。高セキュリティ。
  - **簡便: 自分のユーザー + Repository admin role** — 自分自身を admin role として bypass に追加。ただし**この場合、workflow を自分が `workflow_dispatch` で起動することが必須**。他の admin が起動した場合も bypass が効く。
  - **代替: PAT (Personal Access Token) 方式** — admin ユーザーで classic PAT (scope: `repo`) を発行 → `PAT_TOKEN` secret に登録 → `release.yml` の `checkout` step の `token:` を `${{ secrets.PAT_TOKEN }}` に変更。PAT の期限管理が必要。
- [ ] **Branch rules** を設定:
  - ✅ `Restrict deletions`（ブランチ削除を禁止）
  - ✅ `Block force pushes`（force push を禁止）
  - ✅ `Require a pull request before merging`（通常の開発で PR 経由を必須化）
    - Required approvals などの詳細は運用方針に従って調整
- [ ] `Create`

> **注意**: `main` に保護ルールを設定しない場合は 2-3 は不要だが、
> **保護ルールを設定するなら bypass の事前設定は必須**（初回リリースが必ず失敗する）。
>
> **重要**: `github-actions[bot]` は GitHub App 由来の identity であり、
> user role (Repository admin 等) を自動的には持ちません。Ruleset の
> "Repository admin role" bypass は**実ユーザーが手動で push した時にのみ**効き、
> bot による push には効きません。上記のいずれかの方法で明示的に許可する
> 必要があります。

### 2-4. `cla-signatures` ブランチ保護（推奨）

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

## 3. npm Trusted Publisher を事前登録（必須）

本 workflow は **npm Trusted Publishing (OIDC)** で publish する。`NPM_TOKEN` は
使用しない代わりに、npmjs.com 側で「このリポジトリのこの workflow からの publish
のみ受け付ける」という **Trusted Publisher 設定** を事前に行う必要がある。

**初回 publish 前の設定** (パッケージがまだ存在しなくても "Pending Trusted Publisher" として事前登録可能):

- [ ] [npmjs.com にログイン](https://www.npmjs.com/login) → 右上の avatar → **`Packages`** または **`Trusted Publishers`** (pending 登録ページ)
- [ ] `@minimalcorp/tsunagi` がまだ存在しない場合: **"Add trusted publisher for a new package"** (pending) を選択
- [ ] 既に存在する場合: パッケージページ → `Settings` → `Trusted Publisher` → `Add`
- [ ] 以下を入力:
  - **Publisher**: `GitHub Actions`
  - **Organization or user**: `minimalcorp`
  - **Repository**: `tsunagi`
  - **Workflow filename**: `release.yml`
  - **Environment name**: `production-release`
- [ ] `Save`

> Environment 名が一致しない場合、OIDC 認証が通らず publish が失敗します。
> `release.yml` の `approve` job が `environment: production-release` を使って
> いるのはこのためです（approve を通過した場合のみ後続 job が同じ workflow
> context として trusted publishing の対象となる）。

---

## 4. 初回リリース実行と動作検証

### 4-1. tsunagi 初回 publish

- [ ] `https://github.com/minimalcorp/tsunagi/actions/workflows/release.yml` にアクセス
- [ ] 右側の `Run workflow` ドロップダウンを開く
- [ ] 入力:
  - **Use workflow from**: `main`
  - **Release target**: `tsunagi`
  - **Version bump**: `patch`
- [ ] `Run workflow` をクリック
- [ ] `approve` job が **Waiting for review** 状態になるのを確認
- [ ] `Review deployments` → `production-release` にチェック → 承認コメントを記入 → `Approve and deploy`
  - ← このタイミングで main の最新状態（他 PR の merge 状況等）を目視確認すること
- [ ] `publish-tsunagi` の各 step が成功するのを確認
  - 内部で `prepack` hook が `build:dist && next build` を、`prepublishOnly` hook が `lint && type-check` を自動実行するため、workflow には明示的な build step は無い
- [ ] 完了後の最終確認:
  - [ ] [npmjs.com/package/@minimalcorp/tsunagi](https://www.npmjs.com/package/@minimalcorp/tsunagi) に `0.0.1` が公開されている
  - [ ] パッケージページに README が表示されている（`apps/web/README.md` の内容）
  - [ ] パッケージページに **`Provenance`** バッジが表示されている（Trusted Publishing 経由で自動付与）
  - [ ] GitHub Releases に `v0.0.1` が作成されている
  - [ ] `main` ブランチに `chore: release @minimalcorp/tsunagi v0.0.1` の commit が push されている

### 4-2. クリーン環境での動作検証

- [ ] 別のマシン、または Docker コンテナ等のクリーン環境で以下を実行:
  ```bash
  npx @minimalcorp/tsunagi
  ```
- [ ] ブラウザで `http://localhost:2791` にアクセスして動作確認
- [ ] macOS と Linux の両方でテスト（Linux は Docker でも可）

### 4-3. docs 初回デプロイ

- [ ] `Run workflow` → **target**: `docs`, **version**: `patch`（docs には無視されるがダミー必須）で実行
- [ ] `approve` job が **Waiting for review** になるので、`production-release` で承認
- [ ] `deploy-docs` job が自動で走り、`github-pages` Environment にデプロイされる
- [ ] 完了後の確認:
  - [ ] `https://minimalcorp.github.io/tsunagi/` にアクセスしてページが表示される
  - [ ] `index` ページ / `getting-started/installation` ページの両方が表示される
  - [ ] サイドバー、ヘッダーの GitHub link、ダークモード切替が動作する
  - [ ] 検索機能が動作する

---

## 5. ドキュメント用スクリーンショット (リファレンス)

UI に変更があった場合にスクリーンショットを更新する手順を記載します。

### フォーマット方針

- **WebP lossless** (`cwebp -lossless -q 100 -m 6 -mt`)
- **横幅**: 1600〜2000px (Retina 対応)
- **テーマ**: light / dark どちらか統一すること（混在は避ける）
- lossless モードなので PNG とピクセル単位で同じ画質、ファイルサイズのみ
  20〜30% に圧縮される

### 撮影・更新手順 (macOS)

1. 撮影:
   - `Cmd + Shift + 4` → スペースキー → ウィンドウクリック (ウィンドウ単位)
   - または `Cmd + Shift + 5` で範囲指定
2. PNG として `~/Desktop/<name>.png` に一時保存
3. WebP lossless に変換して配置:
   ```bash
   cwebp -lossless -q 100 -m 6 -mt ~/Desktop/<name>.png \
     -o apps/docs/public/screenshots/<name>.webp
   ```
4. ビルドで確認:
   ```bash
   npm run build -w tsunagi-docs
   ```

`cwebp` は `brew install webp` でインストールできます。

### 配置先

`apps/docs/public/screenshots/`

---

## 6. 任意: 追加の拡張

### 6-1. カスタムドメイン（docs）

`docs.tsunagi.dev` のようなドメインを当てたい場合:

- [ ] DNS プロバイダで `CNAME` レコードを `minimalcorp.github.io` に向ける
- [ ] Repository Settings → Pages → Custom domain にドメイン入力
- [ ] `apps/docs/public/CNAME` ファイルを作成してドメイン名だけ記載（永続化のため）
- [ ] `apps/docs/next.config.mjs` に `metadataBase: new URL('https://docs.tsunagi.dev')` を**追加**（現状は未設定のため更新ではなく新規追加）
- [ ] カスタムドメイン運用は root に配信されるため、`basePath` が空（`NEXT_PUBLIC_BASE_PATH=""`）になるよう `actions/configure-pages` の出力が `/` になることを確認
- [ ] 再度 `docs` を release

### 6-2. 通知連携

release workflow 完了時に Slack 等に通知したい場合、`release.yml` に追加 job を書く。本チェックリストの範囲外。

---

## 最小限の必須作業サマリ

**公開するために絶対に必要**なのは以下:

1. **手順 1** (npm アカウント・Organization 準備)
2. **手順 2-1** (GitHub Pages を Actions ソースに)
3. **手順 2-2** (`production-release` Environment 作成 + 承認者設定)
4. **手順 2-3** (`main` 保護 + bypass ← 保護ルールを設定する場合のみ)
5. **手順 3** (npm Trusted Publisher 事前登録)
6. **手順 4** (初回リリース実行と動作検証)

**推奨だが後回しでも可**:

- 手順 2-4 (`cla-signatures` 保護) ← 外部コントリビューターが出る前に済ませておく
- 手順 6 (カスタムドメイン等)

---

## トラブルシューティング

### `approve` job が `Environment not found` で失敗する

→ 手順 2-2 の Environment 作成を忘れている。先に作成してから workflow を再実行。

### `git push` が `protected branch hook declined` で失敗する

→ 手順 2-3 の bypass 設定が不足。`github-actions[bot]` は user role を持たない
ので、Bypass list に明示的に Deploy key / PAT / 管理者ユーザー経由での起動
のいずれかを設定する必要がある。

### `npm publish` が `404 Not Found` または `401 Unauthorized` で失敗する

→ 手順 3 の Trusted Publisher 設定が不足している、または設定内容が mismatch
している可能性。以下を確認:

- **Organization** が `minimalcorp` になっているか
- **Repository** が `tsunagi` になっているか
- **Workflow filename** が `release.yml` になっているか（フルパスではなくファイル名のみ）
- **Environment name** が `production-release` になっているか（`approve` job が使う environment と一致）

Trusted Publisher 設定を保存した直後は反映まで数分かかる場合あり。

### `npm publish` が `ENEEDAUTH` で失敗する

→ npm CLI のバージョンが古い (< 11.5.1) 可能性。workflow の
`Ensure npm >= 11.5.1` step が正常に走っているか確認。手動で runner に入って
`npm --version` を実行するには、workflow に `run: npm --version` を挟んで確認。

### workflow 途中で失敗してバージョンだけ bump された状態で止まった

→ `main` の最新 commit（`chore: release ...`）を revert する commit を作って merge し、再度 workflow を実行。npm 側は同じバージョンを二度 publish できないので、次回は1つ上のバージョンにする必要がある（例: `0.0.1` 失敗 → `0.0.2` でリトライ）。

### push が別 PR の merge と衝突した

→ workflow に組み込まれている retry ロジックが自動で rebase → 再 push を試みる（最大3回）。それでも失敗する場合は手動で rebase 操作が必要。
