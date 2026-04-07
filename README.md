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

| コマンド               | 説明                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Tsunagi 本体を開発モードで起動 (`-w @minimalcorp/tsunagi`) |
| `npm run docs:dev`     | ドキュメントサイトを開発モードで起動                       |
| `npm run build`        | 全ワークスペースをビルド                                   |
| `npm run build:dist`   | Tsunagi 本体の dist ビルド (`tsc -p tsconfig.dist.json`)   |
| `npm run lint`         | 全ワークスペースで ESLint を実行                           |
| `npm run type-check`   | 全ワークスペースで TypeScript 型チェック                   |
| `npm run format`       | Prettier で全ファイルをフォーマット                        |
| `npm run format:check` | Prettier でフォーマット差分チェック                        |

## リリース

GitHub Actions の `Release` workflow を手動実行することで、`@minimalcorp/tsunagi`
の npm 公開、および docs の GitHub Pages デプロイを統合的に行えます:

1. GitHub の Actions タブから `Release` workflow を選択
2. 以下を入力して Run:
   - **target**: `all` / `tsunagi` / `docs` のいずれか
   - **version**: `patch` / `minor` / `major` (tsunagi にのみ適用)

詳細は [.github/workflows/release.yml](./.github/workflows/release.yml) を参照。

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

## ライセンス

本リポジトリは [PolyForm Shield License 1.0.0](./LICENSE) のもとで公開されています。
これは source-available ライセンスであり、**競合製品化は禁止**されていますが、
個人利用・社内利用・通常の商用利用は自由です。詳細は [LICENSE](./LICENSE) を
参照してください。

## コントリビューション

Pull Request を送信する際は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照し、
CLA Assistant bot の指示に従って [CLA](./CLA.md) への同意をお願いします。
