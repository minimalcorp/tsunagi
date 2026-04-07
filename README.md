# Tsunagi Monorepo

**Tsunagi (繋ぎ)** — 複数 GitHub 組織のプロジェクトをローカルで統合管理し、
Claude AI による AI 駆動開発を可視化・制御する Web UI ツール。

このリポジトリは npm workspaces ベースの monorepo です。

## パッケージ

| パッケージ                           | 場所         | npm 公開 | 説明                                                             |
| ------------------------------------ | ------------ | -------- | ---------------------------------------------------------------- |
| [`@minimalcorp/tsunagi`](./apps/web) | `apps/web/`  | ✅       | Tsunagi 本体 (Next.js + Fastify + Prisma)                        |
| [`tsunagi-docs`](./apps/docs)        | `apps/docs/` | ❌       | ユーザー向けドキュメントサイト (Nextra, GitHub Pages にデプロイ) |

## クイックスタート（エンドユーザー向け）

Tsunagi を使いたいだけの場合は、npm から直接起動できます:

```bash
npx @minimalcorp/tsunagi
```

詳細は [apps/web/README.md](./apps/web/README.md) または
[ドキュメントサイト](https://minimalcorp.github.io/tsunagi/) を参照してください。

## 開発セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/minimalcorp/tsunagi.git
cd tsunagi

# 依存関係インストール（全ワークスペース）
npm install

# Tsunagi 本体を開発モードで起動
npm run dev

# ドキュメントサイトを開発モードで起動
npm run docs:dev
```

## よく使うコマンド（ルートから実行）

| コマンド               | 説明                                                     |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev`          | web + docs を並列起動（Ctrl+C で両方停止）               |
| `npm run web:dev`      | Tsunagi 本体のみ開発モードで起動                         |
| `npm run docs:dev`     | ドキュメントサイトのみ開発モードで起動                   |
| `npm run build`        | 全ワークスペースをビルド                                 |
| `npm run build:dist`   | Tsunagi 本体の dist ビルド (`tsc -p tsconfig.dist.json`) |
| `npm run lint`         | 全ワークスペースで ESLint を実行                         |
| `npm run type-check`   | 全ワークスペースで TypeScript 型チェック                 |
| `npm run format`       | Prettier で全ファイルをフォーマット                      |
| `npm run format:check` | Prettier でフォーマット差分チェック                      |

## リリース

GitHub Actions の `Release` workflow を手動実行することで、`@minimalcorp/tsunagi`
の npm 公開、および docs の GitHub Pages デプロイを統合的に行えます:

1. GitHub の Actions タブから `Release` workflow を選択
2. 以下を入力して Run:
   - **target**: `all` / `tsunagi` / `docs` のいずれか
   - **version**: `patch` / `minor` / `major` (tsunagi にのみ適用)

詳細は [.github/workflows/release.yml](./.github/workflows/release.yml) を参照。

### 初回実行前の必須セットアップ

初めて `Release` workflow を実行する前に、以下を手動で設定しておく必要があります。

1. **npm Automation Token の登録**
   - npmjs.com で `@minimalcorp` organization を作成し、Automation タイプの Access Token を発行
   - GitHub リポジトリの Settings → Secrets and variables → Actions で `NPM_TOKEN` という名前の secret として登録

2. **GitHub Pages を Actions ソースに設定**
   - Settings → Pages → Source: `GitHub Actions` を選択（`Deploy from a branch` ではない）

3. **`main` ブランチ保護の bypass 設定**（保護ルールを設定している場合）
   - `Release` workflow は `npm version` で bump した commit と tag を `main` に直接 push する
   - main に `Require a pull request before merging` 等の保護ルールがある場合、push がブロックされる
   - 対応: Settings → Rules → Rulesets で main 保護 ruleset を作成し、**Bypass list に `Repository admin` role または `Deploy key` を追加**する
     - `github-actions[bot]` が該当権限として扱われるため、これで workflow からの push が許可される
   - 保護ルールを main に設定していない場合は不要

これらを設定せずに workflow を実行すると、途中で失敗してバージョン番号だけが bump された中途半端な状態になる可能性があるので、**必ず事前に設定してください**。

## リポジトリ構成

```
tsunagi/
├── apps/
│   ├── web/                  # @minimalcorp/tsunagi (Tsunagi 本体)
│   └── docs/                 # tsunagi-docs (Nextra ドキュメントサイト)
├── .github/workflows/
│   ├── ci.yml                # PR CI (format / lint / type-check / build)
│   ├── release.yml           # 統合リリース (npm publish + Pages deploy)
│   └── cla.yml               # CLA Assistant bot
├── .husky/                   # Git hooks
├── package.json              # monorepo root (workspaces)
├── .prettierrc.json          # monorepo 共通 Prettier 設定
├── LICENSE                   # PolyForm Shield 1.0.0
├── CLA.md                    # Contributor License Agreement
├── CONTRIBUTING.md           # コントリビューションガイド
└── CLAUDE.md                 # Claude AI 向け作業ルール
```

## 対応 OS

- macOS
- Linux
- Windows は**非サポート**（WSL2 経由で動作する可能性はありますが保証されません）

## 必須ランタイム

- **Node.js ≥ 20**
- **Git ≥ 2.42**（空リポジトリを扱うため `git worktree add --orphan` を使用）
- **Claude Code CLI**（`claude` コマンドが PATH 上に必要）

## ライセンス

本リポジトリは [PolyForm Shield License 1.0.0](./LICENSE) のもとで公開されています。
これは source-available ライセンスであり、**競合製品化は禁止**されていますが、
個人利用・社内利用・通常の商用利用は自由です。詳細は [LICENSE](./LICENSE) を
参照してください。

## コントリビューション

Pull Request を送信する際は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照し、
CLA Assistant bot の指示に従って [CLA](./CLA.md) への同意をお願いします。
