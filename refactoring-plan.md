# tsunagi monorepo 再編 + 起動エラー修正 Refactoring Plan

> **このドキュメントは context なしの新セッションで作業着手できるよう自己完結させてある。先頭の §A〜§D を読んでから §1 以降の作業を開始すること。**

---

## §A. TL;DR

`@minimalcorp/tsunagi@0.0.4` の `npm install -g` 後の起動エラーを根本解決するため、**apps/web 内に同居している Next.js (UI) と Fastify (API) を物理分離して proper monorepo 構成に再編** する。

- `apps/web` = Next.js UI 専用 (private、API routes ゼロ、DB/Prisma 依存ゼロ)
- `apps/server` = Fastify + Prisma + libSQL 専用 (private、全 API を所有、`/api/*` prefix 統一)
- `apps/cli` = publishable aggregator (`@minimalcorp/tsunagi`、server dist と web standalone を bundle)
- `apps/docs` = 既存 (変更なし)
- `packages/shared` = 共有型定義 (新設、ランタイムロジック無し)

最終的に v0.0.5 として publish し `npm install -g @minimalcorp/tsunagi@0.0.5` で正常起動することがゴール。

---

## §B. 重要な決定事項 (再議論しないこと)

これらは前セッションでユーザーと合意済み。**実装中に方針を変えたくなったらまずユーザーに確認すること**。

### B-1. apps/cli aggregator パターン

- `apps/web` (`@minimalcorp/tsunagi-web`) と `apps/server` (`@minimalcorp/tsunagi-server`) は **private**、npm に publish しない
- `apps/cli` (`@minimalcorp/tsunagi`) のみが **publishable**
- prepack で `apps/cli/scripts/bundle.mjs` が sibling workspace の build 成果物 (apps/server/dist, apps/web/.next/standalone, apps/server/prisma) を apps/cli/ 配下にコピーして tarball に含める
- `bin: tsunagi → ./dist/cli.js` の UX は維持

### B-2. dependencies 重複宣言は許容

apps/cli/package.json には Fastify / Prisma / libSQL / node-pty などの **runtime deps を全て宣言** する。apps/server/package.json と重複するが、これは **必須**:

- `apps/cli` は npm publish 時に sibling workspace を bundle するが、bundle される JS は `import 'fastify'` 等の bare import を含むので、user の install 環境で `node_modules/` から解決される必要がある
- apps/cli の dependencies に列挙されているものだけが install 時に解決される
- npm workspaces の hoist で開発時の lockfile は一本化される
- 同期は手動 (将来 `syncpack` 等の検討は別 PR)

### B-3. packages/shared は型のみ

- `packages/shared` は **interface / type 定義のみ** (現在は `types.ts`)
- 両 web / server から `import type { ... } from '@minimalcorp/tsunagi-shared'` の **type-only import** で参照
- tsc emit 時に完全 strip されるので runtime 依存ゼロ
- ランタイムロジック (utility 関数等) が必要になったら別途追加 (今回 PR では入れない)

### B-4. Phase 中間でビルドが一時的に壊れることを許容

- 各 phase の **完了時点** で lint / type-check / build が通ることを目標とする
- phase の **途中** では一時的に壊れていても OK
- `git bisect` の粒度は phase 単位

### B-5. Next.js rewrites は完全廃止、UI から Fastify を直接叩く

- `next.config.ts` に rewrites を **書かない**
- `apps/web/src/app/api/**` を **完全削除**
- UI コードは `apps/web/src/lib/api-url.ts` ヘルパ経由で `http://localhost:2792/api/*` を直接叩く
- Socket.IO も同様に `getServerUrl()` で直接接続
- Fastify 側は CORS で `http://localhost:2791` を origin 許可 (既存)
- **理由**: 完全な責任分離。Next.js を将来 static export にしても動く。Turbopack の余計な設定が不要になる
- **CORS preflight が走るが** local-only で性能影響は無視できる

### B-6. Claude plugin の hook URL / mcp URL 更新は、apps/cli/tsunagi-marketplace 移動後に実施

順序: Phase 5-x で plugin.json が apps/cli/tsunagi-marketplace/ に git mv された後に URL prefix を `/api/` に書き換える。

### B-7. apps/web の `"type": "module"` は **維持** する

事前調査の結果、API routes と server lib を完全削除した後の apps/web には:

- `.js` 拡張子付き相対 import: **無し** (現在の 2 件は server 側コード、削除対象)
- `require()` / `module.exports` / `__dirname` / `__filename`: **無し** (next.config.ts の `__dirname` は既に `fileURLToPath(import.meta.url)` 化済み)
- CJS-only な UI 系 npm 依存先: 数件あるが default import の使い方が正しいので Node ESM interop で問題なし
- mermaid (ESM native) の default import: 正しい
- socket.io-client: named import `{ io }` で利用なので問題なし

→ `"type": "module"` 維持で Next.js standalone build は特別な webpack/turbopack 設定なしで通る見込み。Phase 7-末の検証で万が一壊れたら fallback として `"type"` フィールド削除 (Next.js は CJS でも動く)。

### B-8. Prisma client の output 配置

- apps/server/src/generated/prisma/ に置く (`src/generated/` という命名で auto-generated を明示)
- schema.prisma の output: `../src/generated/prisma`
- tsc rootDir: `./src` で dist/generated/prisma/ にビルドされる
- 生成コードと hand-written の混在を避ける意図

### B-9. concurrently は apps/cli に集約

- root の `package.json` の scripts は alias のみ (`npm run dev -w @minimalcorp/tsunagi`)
- 実際の concurrently 起動は `apps/cli/src/with-plugin.ts` 内で行う
- 開発時: web (2791) + server (2792) + docs を並行起動 + Claude plugin clean install

### B-10. Migration の責任

| タイミング                      | 主体                           | コマンド                                                                     |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| 開発中 schema 変更時            | 開発者 (手動)                  | `npm run db:migrate -w @minimalcorp/tsunagi-server` (= `prisma migrate dev`) |
| CI / publish                    | **実行しない**                 | —                                                                            |
| ユーザー環境 (`tsunagi` 起動時) | `apps/cli/src/auto-migrate.ts` | `npx prisma migrate deploy`                                                  |

**重要**: 現状の `apps/web/package.json` の `postinstall` に `prisma generate` が入っているが、apps/cli では削除する。理由: apps/cli/dist/server/generated/prisma/client.js が tarball に bundle 済みなので、user 環境で再生成不要。

---

## §C. 推奨開始手順

### C-1. 現 worktree の状態確認

このブランチ `fix/tsunagi-runtime-esm-and-libsql-external` には **大量の in-flight 修正 (uncommitted)** が残っている。git log を見ると `main` から **commit が一つも進んでいない** ので、すべてのコミット履歴は捨てて良い。

```bash
git status         # 多数の modified ファイルがあるはず
git log --oneline main..HEAD   # 結果は空 (commit されていない)
```

In-flight な修正の中には残したい概念もあるが、**ファイル位置がほぼ全て変わる** ため、そのまま carry over できない。本ドキュメントの §11 (snippets) に必要な実装をすべて記載してあるので、以下を推奨:

### C-2. 推奨: refactoring-plan.md だけ残して git reset

```bash
# refactoring-plan.md を一時退避
cp refactoring-plan.md /tmp/refactoring-plan.md.backup

# 全リセット
git reset --hard main

# refactoring-plan.md を戻す
cp /tmp/refactoring-plan.md.backup refactoring-plan.md
git add refactoring-plan.md
git commit -m "docs: add refactoring-plan.md for monorepo migration"
```

### C-3. ベースライン install

```bash
npm install
```

これで `node_modules/` が再構築される。以降の phase は本ドキュメント §10 (Phase 別 commit plan) を順番に実施する。

---

## §D. このドキュメントの構造

| §   | 内容                                                                   |
| --- | ---------------------------------------------------------------------- |
| §1  | 背景 (起動エラーの詳細、なぜ大規模 refactor が必要か)                  |
| §2  | Before / After のディレクトリ構造                                      |
| §3  | エンドポイント inventory (28 Next.js + Fastify)                        |
| §4  | src/lib ファイル分類                                                   |
| §5  | UI 側 fetch / Socket.IO call site 完全リスト                           |
| §6  | Fastify 自己 HTTP 呼び出しサイト                                       |
| §7  | Claude plugin URL / MCP URL hardcode 箇所                              |
| §8  | エンドポイント移行マップ (52 endpoints)                                |
| §9  | Per-route 移行詳細 (28 Next.js routes)                                 |
| §10 | Phase 別 commit plan                                                   |
| §11 | 実装スニペット (新規ファイルの完全な内容)                              |
| §12 | リスクマトリクス                                                       |
| §13 | 検証チェックリスト                                                     |
| §14 | 既知の落とし穴 (Prisma 7 / fastify-socket.io / simple-git / WebSocket) |
| §15 | ドキュメントの寿命                                                     |

---

## §1. 背景

### 1.1 v0.0.4 で発生している起動エラー

`npm install -g @minimalcorp/tsunagi@0.0.4` 後、`tsunagi` 起動で 2 種類の問題が露出:

#### Error 1: Next.js standalone (Turbopack runtime)

```
Error: Failed to load external module @libsql/client-a0665382d71f31f0:
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@libsql/client-a0665382d71f31f0'
imported from /.../standalone/apps/web/.next/server/chunks/[turbopack]_runtime.js
```

**原因**: `next.config.ts` の `serverExternalPackages` が `['@prisma/client', 'better-sqlite3']` で、現在使用している `@libsql/client` / `@prisma/adapter-libsql` を列挙していない。Turbopack がこれらを bundle しようとしてハッシュ付き内部名で解決失敗。

#### Error 2: Fastify server (dist/generated/prisma/client.js)

```
file:///.../dist/generated/prisma/client.js:48
Object.defineProperty(exports, "__esModule", { value: true });
                      ^
ReferenceError: exports is not defined in ES module scope
[tsunagi] Fastify server exited with code 1
```

**原因**: Prisma 7 の `prisma-client` generator は `import.meta.url` を含む ESM ソースを吐く。これを tsc `module: commonjs` でビルドすると CJS と ESM が混在した壊れた `.js` が生成され、Node 22+ の `--experimental-detect-module` (デフォルト有効) が `import.meta.url` 文字列を見て ESM と判定し、`exports`/`require` が undefined になる。

### 1.2 表面的な ESM 設定修正では足りない理由

両 error は Fastify/Prisma を ESM 化すれば解消するように見えるが、その過程で以下の構造的問題が露出した:

1. **Next.js API routes 28 個が Prisma / libSQL / git 操作 lib に依存**している
2. これらの依存が `apps/web/src/lib/{db,repositories,services,worktree-manager}` 経由で **frontend と backend が共有**されている
3. apps/web に `"type": "module"` を入れた瞬間、Turbopack が `src/lib/**` 内部の `.js` 拡張子付き相対 import を literal 解決して **Module not found** で失敗する
4. Next.js 側を webpack に fallback したり extensionAlias を設定したりする回避策はあるが、**プロジェクト固有の workaround を増やすだけで本質的な責任分離になっていない**

### 1.3 ユーザー方針

> 「現在はweb, docsの2つになっていて、この構成は維持したい。web, server, docsの構成にするのは、APIをfastify側にまとめた後でも十分可能だと思う」
> 「basicに責務を完全に分けたくて、たとえばnext.jsからただのstatic fileによるUI構築に切り替わったとしても動作するような責任分離を行いたい」
> 「apps以下は web, server, docs の3ディレクトリ構成にして、packagesを新たに作成して shared を追加し、web, serverから参照する、ちゃんとしたmonorepo構成にシフトしてしまった方がいい」

→ proper monorepo 構成 (apps/{web,server,cli,docs} + packages/shared) に再編する。

---

## §2. Before / After のディレクトリ構造

### 2.1 Before (現状)

```
/
├── package.json              # tsunagi-monorepo (private, workspaces: ["apps/*"])
├── apps/
│   ├── web/                  # @minimalcorp/tsunagi (publishable, 0.0.4)
│   │   ├── package.json      # Next.js + Fastify + Prisma + CLI 全部入り
│   │   ├── next.config.ts    # rewrites: /api/terminal/:path* → :2792
│   │   ├── tsconfig.json     # Next.js (bundler resolution)
│   │   ├── tsconfig.dist.json # Fastify + scripts 用 (commonjs)
│   │   ├── eslint.config.mjs
│   │   ├── postcss.config.mjs
│   │   ├── components.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma  # generator output: ../generated/prisma
│   │   │   └── migrations/
│   │   ├── prisma.config.ts
│   │   ├── generated/prisma/  # Prisma client (Phase 中で再生成)
│   │   ├── server/            # Fastify (同居)
│   │   │   ├── index.ts
│   │   │   ├── pty-manager.ts
│   │   │   ├── editor-session-store.ts
│   │   │   ├── tsconfig.json
│   │   │   └── routes/
│   │   │       ├── tasks.ts        # /tasks/*, /tasks/validate
│   │   │       ├── terminal.ts     # /api/terminal/*
│   │   │       ├── editor.ts       # /api/editor/*
│   │   │       ├── hooks.ts        # /hooks/claude, /hooks/events, /internal/emit-status
│   │   │       └── mcp.ts          # /mcp
│   │   ├── scripts/
│   │   │   ├── cli.ts                  # CLI entry
│   │   │   ├── auto-migrate.ts
│   │   │   ├── plugin-lifecycle.ts
│   │   │   ├── single-instance-lock.ts
│   │   │   ├── with-plugin.ts
│   │   │   ├── db-backup.ts
│   │   │   ├── db-restore.ts
│   │   │   ├── migrate-to-sqlite.ts
│   │   │   ├── monaco-editor.sh
│   │   │   ├── fix-broken-worktrees.sh
│   │   │   └── fix-node-pty-permissions.cjs
│   │   ├── tsunagi-marketplace/
│   │   │   └── plugins/tsunagi-plugin/.claude-plugin/plugin.json
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx, page.tsx, settings/, tasks/[id]/
│   │       │   └── api/         # 28 routes (全て Prisma 依存)
│   │       ├── components/
│   │       ├── hooks/
│   │       └── lib/             # frontend + backend 混在
│   │           ├── db.ts                       # backend
│   │           ├── data-path.ts                # backend
│   │           ├── branch-utils.ts             # backend
│   │           ├── worktree-manager.ts         # backend
│   │           ├── repositories/{repository,task,environment}.ts  # backend
│   │           ├── services/task-service.ts    # backend
│   │           ├── types.ts                    # 共有 (型のみ)
│   │           ├── utils.ts                    # frontend
│   │           ├── toaster.ts                  # frontend
│   │           ├── claude-status.ts            # frontend
│   │           └── repo-colors.ts              # frontend
│   └── docs/                 # tsunagi-docs (Next.js docs、変更なし)
└── (no packages/)
```

### 2.2 After (目標)

```
/
├── package.json              # tsunagi-monorepo (private, workspaces: ["apps/*", "packages/*"])
│                             # scripts は alias のみ
├── apps/
│   ├── cli/                  # @minimalcorp/tsunagi (publishable, 0.0.5) ★NEW
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── eslint.config.mjs
│   │   ├── src/              # tsc compile 対象
│   │   │   ├── cli.ts
│   │   │   ├── auto-migrate.ts
│   │   │   ├── plugin-lifecycle.ts
│   │   │   ├── single-instance-lock.ts
│   │   │   └── with-plugin.ts        # dev 起動 (concurrently で web/server を spawn)
│   │   ├── scripts/          # 非 ts (compile 対象外)
│   │   │   ├── bundle.mjs            # prepack で sibling から成果物を集める
│   │   │   └── fix-node-pty-permissions.cjs
│   │   ├── tsunagi-marketplace/
│   │   │   └── plugins/tsunagi-plugin/.claude-plugin/plugin.json  # /api/hooks/claude, /api/mcp
│   │   ├── LICENSE
│   │   ├── README.md
│   │   └── (build/bundle 後に作られるもの)
│   │       ├── dist/cli.js, dist/auto-migrate.js, ...
│   │       ├── dist/server/**     # bundle.mjs が apps/server/dist からコピー
│   │       ├── prisma/            # bundle.mjs が apps/server/prisma からコピー
│   │       ├── prisma.config.ts   # bundle.mjs が apps/server からコピー
│   │       └── .next/standalone/  # bundle.mjs が apps/web/.next/standalone からコピー
│   ├── web/                  # @minimalcorp/tsunagi-web (private) ★TRIMMED
│   │   ├── package.json      # Next.js + UI deps のみ、private
│   │   ├── next.config.ts    # standalone + outputFileTracingRoot のみ (rewrites なし)
│   │   ├── tsconfig.json     # Next.js (bundler)
│   │   ├── eslint.config.mjs
│   │   ├── postcss.config.mjs
│   │   ├── components.json
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/                 # Pages + Layouts のみ (api/ 完全削除)
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── settings/page.tsx
│   │   │   │   └── tasks/[id]/page.tsx
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── lib/                 # frontend-only utilities
│   │   │       ├── api-url.ts       # ★NEW: Fastify URL ヘルパ
│   │   │       ├── utils.ts
│   │   │       ├── toaster.ts
│   │   │       ├── claude-status.ts
│   │   │       └── repo-colors.ts
│   │   └── .next/            # ビルド成果物
│   ├── server/               # @minimalcorp/tsunagi-server (private) ★NEW
│   │   ├── package.json      # Fastify + Prisma + libSQL + native deps
│   │   ├── tsconfig.json     # nodenext, rootDir: ./src
│   │   ├── eslint.config.mjs
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # generator output: ../src/generated/prisma
│   │   │   └── migrations/
│   │   ├── prisma.config.ts
│   │   ├── src/
│   │   │   ├── index.ts               # Fastify entry
│   │   │   ├── pty-manager.ts
│   │   │   ├── editor-session-store.ts
│   │   │   ├── routes/
│   │   │   │   ├── tasks.ts           # /api/tasks/*
│   │   │   │   ├── repos.ts           # /api/repos/*, /api/owners, /api/clone   ★NEW
│   │   │   │   ├── env.ts             # /api/env/*                              ★NEW
│   │   │   │   ├── worktrees.ts       # /api/worktrees/*                        ★NEW
│   │   │   │   ├── planner.ts         # /api/planner/*                          ★NEW
│   │   │   │   ├── commands.ts        # /api/commands/open                      ★NEW
│   │   │   │   ├── onboarding.ts      # /api/onboarding/status                  ★NEW
│   │   │   │   ├── internal.ts        # /api/internal/tabs/*, /api/internal/emit-status  ★NEW
│   │   │   │   ├── hooks.ts           # /api/hooks/claude, /api/hooks/events
│   │   │   │   ├── mcp.ts             # /api/mcp
│   │   │   │   ├── terminal.ts        # /api/terminal/*
│   │   │   │   └── editor.ts          # /api/editor/*
│   │   │   ├── lib/                   # backend-only libraries
│   │   │   │   ├── db.ts
│   │   │   │   ├── data-path.ts
│   │   │   │   ├── branch-utils.ts
│   │   │   │   ├── worktree-manager.ts
│   │   │   │   ├── repositories/
│   │   │   │   │   ├── repository.ts
│   │   │   │   │   ├── task.ts
│   │   │   │   │   └── environment.ts
│   │   │   │   └── services/
│   │   │   │       └── task-service.ts
│   │   │   └── generated/             # auto-generated
│   │   │       └── prisma/
│   │   │           └── (Prisma client output)
│   │   ├── scripts/                   # tsx 実行 (tsc compile 対象外)
│   │   │   ├── patch-prisma-generated.ts
│   │   │   ├── db-backup.ts
│   │   │   ├── db-restore.ts
│   │   │   └── migrate-to-sqlite.ts
│   │   └── dist/
│   │       ├── index.js
│   │       ├── pty-manager.js
│   │       ├── editor-session-store.js
│   │       ├── routes/**
│   │       ├── lib/**
│   │       └── generated/prisma/**
│   └── docs/                 # tsunagi-docs (変更なし)
└── packages/
    └── shared/               # @minimalcorp/tsunagi-shared (private) ★NEW
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts      # re-exports
        │   └── types.ts      # (旧 apps/web/src/lib/types.ts)
        └── dist/             # tsc 出力
```

### 2.3 Workspace package メタ情報

| package         | name                          | private         | type   | 役割                                          |
| --------------- | ----------------------------- | --------------- | ------ | --------------------------------------------- |
| root            | `tsunagi-monorepo`            | ✓               | —      | workspaces 宣言と alias scripts               |
| apps/cli        | `@minimalcorp/tsunagi`        | ✗ (publishable) | module | bin + server dist + web standalone aggregator |
| apps/web        | `@minimalcorp/tsunagi-web`    | ✓               | module | Next.js UI                                    |
| apps/server     | `@minimalcorp/tsunagi-server` | ✓               | module | Fastify API                                   |
| apps/docs       | `tsunagi-docs` (既存)         | ✓ (既存)        | (既存) | ドキュメント                                  |
| packages/shared | `@minimalcorp/tsunagi-shared` | ✓               | module | 型定義                                        |

### 2.4 ポート構成 (変更なし)

| コンポーネント        | ポート | 備考             |
| --------------------- | ------ | ---------------- |
| Next.js (apps/web)    | 2791   | UI 専用          |
| Fastify (apps/server) | 2792   | API + Socket.IO  |
| Socket.IO             | 2792   | Fastify に相乗り |

---

## §3. エンドポイント inventory

### 3.1 Next.js API routes (削除対象、全 28 ファイル)

```
apps/web/src/app/api/clone/route.ts
apps/web/src/app/api/commands/open/route.ts
apps/web/src/app/api/env/list/route.ts
apps/web/src/app/api/env/route.ts
apps/web/src/app/api/env/toggle/route.ts
apps/web/src/app/api/internal/tabs/[tab_id]/status/route.ts
apps/web/src/app/api/internal/tabs/[tab_id]/todos/route.ts
apps/web/src/app/api/onboarding/status/route.ts
apps/web/src/app/api/owners/route.ts
apps/web/src/app/api/planner/config/route.ts
apps/web/src/app/api/planner/tabs/route.ts
apps/web/src/app/api/repos/[owner]/[repo]/branches/route.ts
apps/web/src/app/api/repos/[owner]/[repo]/route.ts
apps/web/src/app/api/repos/route.ts
apps/web/src/app/api/tasks/[id]/complete/route.ts
apps/web/src/app/api/tasks/[id]/needs-rebase/route.ts
apps/web/src/app/api/tasks/[id]/rebase/route.ts
apps/web/src/app/api/tasks/[id]/route.ts
apps/web/src/app/api/tasks/[id]/status/route.ts
apps/web/src/app/api/tasks/[id]/tabs/[tab_id]/route.ts
apps/web/src/app/api/tasks/[id]/tabs/route.ts
apps/web/src/app/api/tasks/batch-delete/route.ts
apps/web/src/app/api/tasks/route.ts
apps/web/src/app/api/tasks/validate/route.ts
apps/web/src/app/api/worktrees/create/route.ts
apps/web/src/app/api/worktrees/delete/route.ts
apps/web/src/app/api/worktrees/init/route.ts
apps/web/src/app/api/worktrees/list/route.ts
```

### 3.2 Fastify routes 現状 (apps/web/server/routes/)

| ファイル      | 定義されている path                                                                                                               | 備考                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tasks.ts`    | `POST /tasks/validate`, `POST /tasks`                                                                                             | Next.js の `/api/tasks/validate`, `/api/tasks` POST と重複 (UI は Fastify 側を直叩き) |
| `terminal.ts` | `GET/POST /api/terminal/sessions`, `DELETE /api/terminal/sessions/:sessionId`, `GET /api/terminal/sessions/:sessionId/scrollback` | 既に `/api/terminal/*` prefix                                                         |
| `editor.ts`   | `POST /api/editor/session`, `GET /api/editor/session/:id`, `POST /api/editor/session/:id/complete`                                | 既に `/api/editor/*` prefix                                                           |
| `hooks.ts`    | `POST /hooks/claude`, `GET /hooks/events`, `POST /internal/emit-status`                                                           | prefix なし → `/api/*` に統一する                                                     |
| `mcp.ts`      | `GET /mcp`, `POST /mcp`                                                                                                           | prefix なし → `/api/mcp` に統一する                                                   |

### 3.3 server/index.ts の現状 register

```ts
await fastify.register(terminalRoutes);
await fastify.register(hooksRoutes);
await fastify.register(mcpRoutes);
await fastify.register(tasksRoutes);
await fastify.register(editorRoutes);
```

すべて prefix なしで register。**全 routes に `{ prefix: '/api' }` を付けるが、route 内部の path は調整必要** (詳細 §10 Phase 4-0)。

### 3.4 Fastify CORS 現状

```ts
await fastify.register(fastifyCors, {
  origin: ['http://localhost:2791'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
});
```

**修正必要**: PUT, PATCH を `methods` に追加 (Next.js API routes が PUT, PATCH を使っているため)。

---

## §4. src/lib ファイル分類

### 4.1 backend 専用 (apps/server/src/lib/ に移動)

| ファイル                                       | 説明                                   | 移動先                                            |
| ---------------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| `apps/web/src/lib/db.ts`                       | Prisma client 初期化                   | `apps/server/src/lib/db.ts`                       |
| `apps/web/src/lib/data-path.ts`                | `~/.tsunagi` パス解決                  | `apps/server/src/lib/data-path.ts`                |
| `apps/web/src/lib/branch-utils.ts`             | `normalizeBranchName`                  | `apps/server/src/lib/branch-utils.ts`             |
| `apps/web/src/lib/worktree-manager.ts`         | git worktree 操作 (simple-git)         | `apps/server/src/lib/worktree-manager.ts`         |
| `apps/web/src/lib/repositories/repository.ts`  | Prisma CRUD                            | `apps/server/src/lib/repositories/repository.ts`  |
| `apps/web/src/lib/repositories/task.ts`        | 同上                                   | `apps/server/src/lib/repositories/task.ts`        |
| `apps/web/src/lib/repositories/environment.ts` | 同上                                   | `apps/server/src/lib/repositories/environment.ts` |
| `apps/web/src/lib/services/task-service.ts`    | task high-level logic + Socket.IO emit | `apps/server/src/lib/services/task-service.ts`    |

### 4.2 共有 (packages/shared/src/ に移動)

| ファイル                    | 説明                                   | 移動先                         |
| --------------------------- | -------------------------------------- | ------------------------------ |
| `apps/web/src/lib/types.ts` | Task / Tab / Repository 等の interface | `packages/shared/src/types.ts` |

### 4.3 frontend 専用 (apps/web/src/lib/ に残す)

| ファイル                            | 説明                 |
| ----------------------------------- | -------------------- |
| `apps/web/src/lib/utils.ts`         | `cn()` (classnames)  |
| `apps/web/src/lib/toaster.ts`       | sonner wrapper       |
| `apps/web/src/lib/claude-status.ts` | UI 用 enum + getter  |
| `apps/web/src/lib/repo-colors.ts`   | リポジトリ色 mapping |

### 4.4 新規作成 (apps/web/src/lib/)

| ファイル                      | 説明                                |
| ----------------------------- | ----------------------------------- |
| `apps/web/src/lib/api-url.ts` | Fastify URL 解決ヘルパ (§11.8 参照) |

---

## §5. UI 側の fetch / Socket.IO 呼び出し全件

Phase 7 で `apiUrl()` ヘルパに置換する全箇所。`grep -rn 'fetch\|io(\|localhost:279' apps/web/src` で再確認可能。

### 5.1 `/api/*` を相対 URL で叩いている (Next.js rewrites 経由が前提)

| File                                                           | Line | 現在の URL                             |
| -------------------------------------------------------------- | ---- | -------------------------------------- |
| `apps/web/src/hooks/useBatchDelete.ts`                         | 26   | `/api/tasks/batch-delete`              |
| `apps/web/src/app/page.tsx`                                    | 108  | `/api/tasks`                           |
| `apps/web/src/app/page.tsx`                                    | 109  | `/api/owners`                          |
| `apps/web/src/app/page.tsx`                                    | 110  | `/api/env`                             |
| `apps/web/src/app/page.tsx`                                    | 259  | `/api/tasks/${task.id}`                |
| `apps/web/src/app/page.tsx`                                    | 273  | `/api/clone`                           |
| `apps/web/src/app/settings/page.tsx`                           | 43   | `/api/onboarding/status`               |
| `apps/web/src/app/tasks/[id]/page.tsx`                         | 56   | `/api/tasks/${id}`                     |
| `apps/web/src/app/tasks/[id]/page.tsx`                         | 66   | `/api/tasks/${id}/tabs`                |
| `apps/web/src/app/tasks/[id]/page.tsx`                         | 102  | `/api/tasks/${taskId}`                 |
| `apps/web/src/app/tasks/[id]/page.tsx`                         | 124  | `/api/tasks/${id}/tabs`                |
| `apps/web/src/app/tasks/[id]/page.tsx`                         | 150  | `/api/tasks/${id}/tabs/${tab_id}`      |
| `apps/web/src/app/tasks/[id]/page.tsx`                         | 173  | `/api/tasks/${task.id}`                |
| `apps/web/src/components/env/EnvVariableEditor.tsx`            | 37   | `/api/env/list?...`                    |
| `apps/web/src/components/env/EnvVariableEditor.tsx`            | 83   | `/api/env/toggle`                      |
| `apps/web/src/components/env/EnvVariableEditor.tsx`            | 119  | `/api/env?...`                         |
| `apps/web/src/components/env/EnvVariableEditor.tsx`            | 135  | `/api/env`                             |
| `apps/web/src/components/env/EnvVariableEditor.tsx`            | 197  | `/api/env`                             |
| `apps/web/src/components/env/EnvVariableEditor.tsx`            | 216  | `/api/env/list?...`                    |
| `apps/web/src/components/env/ClaudeTokenSection.tsx`           | 66   | `/api/env/list?...`                    |
| `apps/web/src/components/env/ClaudeTokenSection.tsx`           | 140  | `/api/env?...`                         |
| `apps/web/src/components/env/ClaudeTokenSection.tsx`           | 145  | `/api/env`                             |
| `apps/web/src/components/env/ClaudeTokenSection.tsx`           | 158  | `/api/env`                             |
| `apps/web/src/components/env/ClaudeTokenSection.tsx`           | 216  | `/api/env`                             |
| `apps/web/src/components/env/ClaudeTokenSection.tsx`           | 260  | `/api/env?...`                         |
| `apps/web/src/components/env/EnvTreeNavigation.tsx`            | 56   | `/api/owners`                          |
| `apps/web/src/components/EnvironmentSettingsDialog.tsx`        | 34   | `/api/env`                             |
| `apps/web/src/components/EnvironmentSettingsDialog.tsx`        | 35   | `/api/env/list`                        |
| `apps/web/src/components/EnvironmentSettingsDialog.tsx`        | 77   | `/api/env/toggle`                      |
| `apps/web/src/components/EnvironmentSettingsDialog.tsx`        | 90   | `/api/env/toggle`                      |
| `apps/web/src/components/EnvironmentSettingsDialog.tsx`        | 103  | `/api/env/toggle`                      |
| `apps/web/src/components/TaskActions.tsx`                      | 30   | `/api/commands/open`                   |
| `apps/web/src/components/TaskDialog.tsx`                       | 267  | `/api/repos/${owner}/${repo}/branches` |
| `apps/web/src/components/settings/RemoveRepositorySection.tsx` | 35   | `/api/repos/${owner}/${repo}`          |
| `apps/web/src/components/settings/RepositoryManagement.tsx`    | 19   | `/api/repos`                           |
| `apps/web/src/components/settings/RepositoryManagement.tsx`    | 20   | `/api/tasks`                           |
| `apps/web/src/components/settings/RepositoryManagement.tsx`    | 46   | `/api/repos/${owner}/${repo}`          |
| `apps/web/src/components/planner/PlannerPanel.tsx`             | 33   | `/api/planner/config`                  |
| `apps/web/src/components/planner/PlannerPanel.tsx`             | 34   | `/api/planner/tabs`                    |
| `apps/web/src/components/planner/PlannerPanel.tsx`             | 78   | `/api/planner/tabs`                    |
| `apps/web/src/components/planner/PlannerPanel.tsx`             | 119  | `/api/planner/tabs?tabId=${tabId}`     |

### 5.2 Fastify URL ハードコードしている箇所 (`http://localhost:2792`)

| File                                                | Line | 現在のコード                                                                           | 種別      |
| --------------------------------------------------- | ---- | -------------------------------------------------------------------------------------- | --------- |
| `apps/web/src/hooks/useTerminalTodos.ts`            | 14   | `const FASTIFY_API_BASE = 'http://localhost:2792';`                                    | const     |
| `apps/web/src/hooks/useTerminalTodos.ts`            | 28   | `io(FASTIFY_API_BASE, { transports: ['websocket'] })`                                  | Socket.IO |
| `apps/web/src/hooks/useTaskEvents.ts`               | 7    | `const FASTIFY_API_BASE = 'http://localhost:2792';`                                    | const     |
| `apps/web/src/hooks/useTaskEvents.ts`               | 24   | `io(FASTIFY_API_BASE, { transports: ['websocket'] })`                                  | Socket.IO |
| `apps/web/src/hooks/useTabStatusEvents.ts`          | 7    | `const FASTIFY_API_BASE = 'http://localhost:2792';`                                    | const     |
| `apps/web/src/hooks/useTabStatusEvents.ts`          | 46   | `io(FASTIFY_API_BASE, { transports: ['websocket'] })`                                  | Socket.IO |
| `apps/web/src/components/EditorSessionProvider.tsx` | 6    | `const FASTIFY_API_BASE = 'http://localhost:2792';`                                    | const     |
| `apps/web/src/components/EditorSessionProvider.tsx` | 47   | `fetch(\`${FASTIFY_API_BASE}/api/editor/session/${session.sessionId}/complete\`, ...)` | fetch     |
| `apps/web/src/components/EditorSessionProvider.tsx` | 59   | 同上                                                                                   | fetch     |
| `apps/web/src/components/TerminalView.tsx`          | 22   | `const FASTIFY_API_BASE = 'http://localhost:2792';`                                    | const     |
| `apps/web/src/components/TerminalView.tsx`          | 366  | `fetch(\`${FASTIFY_API_BASE}/api/terminal/sessions\`, ...)`                            | fetch     |
| `apps/web/src/components/TerminalView.tsx`          | 401  | `io(FASTIFY_API_BASE, { transports: ['websocket'] })`                                  | Socket.IO |
| `apps/web/src/components/TaskDialog.tsx`            | 297  | `fetch('http://localhost:2792/tasks/validate', ...)`                                   | fetch     |
| `apps/web/src/components/TaskDialog.tsx`            | 349  | `fetch('http://localhost:2792/tasks', ...)`                                            | fetch     |

**注**: TaskDialog.tsx の line 297, 349 は **既存の Fastify 重複 endpoint を直叩き** している (UI はずっと Fastify 側を使ってきたので Next.js `/api/tasks/validate` POST は dead)。Phase 4-1 で `/api/tasks/validate` 統合と同時に書き換える。

---

## §6. Fastify 自己 HTTP 呼び出しサイト

Phase 3 (旧 plan の Phase 1) で **prisma 直呼び** に置換する。

| File                                 | Line | 現在のコード                                                                                                         | 置換後                                                                                                                                   |
| ------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/server/routes/hooks.ts`    | 63   | `fetch(\`http://localhost:2791/api/internal/tabs/${sessionId}/status\`, { method: 'POST', ... })`                    | `prisma.tab.updateMany({ where: { tabId: sessionId }, data: { status, ...(todos !== undefined && { todos: JSON.stringify(todos) }) } })` |
| `apps/web/server/routes/mcp.ts`      | 346  | `fetch(\`http://localhost:2791/api/internal/tabs/${tabId}/todos\`)`(MCP tool`tsunagi_get_tab_todos`)                 | `prisma.tab.findUnique({ where: { tabId } })` → `JSON.parse(tab.todos ?? '[]')`                                                          |
| `apps/web/server/routes/terminal.ts` | 86   | `fetch(\`http://localhost:2791/api/internal/tabs/${sessionId}/status\`, { method: 'POST', ... })` (PTY exit handler) | hooks.ts と同じ pattern で `prisma.tab.updateMany({ ... })`                                                                              |

各 file で `import { prisma } from '../lib/db.js'` (移動後の path) を追加。

---

## §7. Claude plugin URL hardcode 箇所

`apps/web/tsunagi-marketplace/plugins/tsunagi-plugin/.claude-plugin/plugin.json` (Phase 5 で apps/cli/tsunagi-marketplace/ に git mv) の中身:

### 7.1 hook URL (22 イベント全て)

22 種類の hook event (`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `TeammateIdle`, `TaskCompleted`, `InstructionsLoaded`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, `ElicitationResult`) すべてに以下が hardcode:

```
"command": "curl -s -X POST http://localhost:2792/hooks/claude -H 'Content-Type: application/json' -d @-"
```

**置換後**:

```
"command": "curl -s -X POST http://localhost:2792/api/hooks/claude -H 'Content-Type: application/json' -d @-"
```

### 7.2 MCP server URL

```json
"mcpServers": {
  "tsunagi": {
    "type": "sse",
    "url": "http://localhost:2792/mcp"
  }
}
```

**置換後**:

```json
"mcpServers": {
  "tsunagi": {
    "type": "sse",
    "url": "http://localhost:2792/api/mcp"
  }
}
```

### 7.3 Phase 5-末の commit で sed で一括置換可能

```bash
cd apps/cli/tsunagi-marketplace/plugins/tsunagi-plugin/.claude-plugin
# 注意: BSD sed (macOS) と GNU sed で構文が異なる
sed -i.bak \
  -e 's|http://localhost:2792/hooks/claude|http://localhost:2792/api/hooks/claude|g' \
  -e 's|http://localhost:2792/mcp|http://localhost:2792/api/mcp|g' \
  plugin.json
rm plugin.json.bak
```

### 7.4 plugin URL 変更の影響範囲

- tsunagi CLI は起動時に `plugin uninstall + marketplace remove + marketplace add + plugin install` を実行する (`apps/cli/src/plugin-lifecycle.ts:ensureCleanPluginState`)
- ユーザは `tsunagi` を一度起動し直すだけで自動的に新 URL の plugin が install される
- 古い v0.0.4 をインストールしている既存ユーザも、v0.0.5 を install して `tsunagi` を起動すれば clean install で新 URL に切り替わる
- **追加対応不要**

---

## §8. エンドポイント移行マップ (52 endpoints)

すべて Fastify 側に集約、`/api/*` prefix で統一する。

### 8.1 Tasks (15)

| 新 path                       | HTTP   | 旧 Next.js path                 | 旧 Fastify path                  | 移行先                            |
| ----------------------------- | ------ | ------------------------------- | -------------------------------- | --------------------------------- |
| `/api/tasks`                  | GET    | `/api/tasks`                    | —                                | `apps/server/src/routes/tasks.ts` |
| `/api/tasks`                  | POST   | `/api/tasks`                    | `/tasks` (重複、Fastify が live) | `tasks.ts`                        |
| `/api/tasks/validate`         | POST   | `/api/tasks/validate` (dead)    | `/tasks/validate` (live)         | `tasks.ts`                        |
| `/api/tasks/batch-delete`     | POST   | `/api/tasks/batch-delete`       | —                                | `tasks.ts`                        |
| `/api/tasks/:id`              | GET    | `/api/tasks/[id]`               | —                                | `tasks.ts`                        |
| `/api/tasks/:id`              | PUT    | 同上                            | —                                | `tasks.ts`                        |
| `/api/tasks/:id`              | DELETE | 同上                            | —                                | `tasks.ts`                        |
| `/api/tasks/:id/status`       | PUT    | `/api/tasks/[id]/status`        | —                                | `tasks.ts`                        |
| `/api/tasks/:id/complete`     | POST   | `/api/tasks/[id]/complete`      | —                                | `tasks.ts`                        |
| `/api/tasks/:id/needs-rebase` | GET    | `/api/tasks/[id]/needs-rebase`  | —                                | `tasks.ts`                        |
| `/api/tasks/:id/rebase`       | POST   | `/api/tasks/[id]/rebase`        | —                                | `tasks.ts`                        |
| `/api/tasks/:id/tabs`         | GET    | `/api/tasks/[id]/tabs`          | —                                | `tasks.ts`                        |
| `/api/tasks/:id/tabs`         | POST   | 同上                            | —                                | `tasks.ts`                        |
| `/api/tasks/:id/tabs/:tab_id` | PUT    | `/api/tasks/[id]/tabs/[tab_id]` | —                                | `tasks.ts`                        |
| `/api/tasks/:id/tabs/:tab_id` | DELETE | 同上                            | —                                | `tasks.ts`                        |

### 8.2 Repos (7)

| 新 path                            | HTTP   | 旧 Next.js path                      | 移行先                            |
| ---------------------------------- | ------ | ------------------------------------ | --------------------------------- |
| `/api/repos`                       | GET    | `/api/repos`                         | `apps/server/src/routes/repos.ts` |
| `/api/repos`                       | POST   | `/api/repos`                         | `repos.ts`                        |
| `/api/repos/:owner/:repo`          | GET    | `/api/repos/[owner]/[repo]`          | `repos.ts`                        |
| `/api/repos/:owner/:repo`          | DELETE | 同上                                 | `repos.ts`                        |
| `/api/repos/:owner/:repo/branches` | GET    | `/api/repos/[owner]/[repo]/branches` | `repos.ts`                        |
| `/api/owners`                      | GET    | `/api/owners`                        | `repos.ts`                        |
| `/api/clone`                       | POST   | `/api/clone`                         | `repos.ts`                        |

### 8.3 Env (6)

| 新 path           | HTTP   | 旧 Next.js path   | 移行先   |
| ----------------- | ------ | ----------------- | -------- |
| `/api/env`        | GET    | `/api/env`        | `env.ts` |
| `/api/env`        | POST   | 同上              | `env.ts` |
| `/api/env`        | PUT    | 同上              | `env.ts` |
| `/api/env`        | DELETE | 同上              | `env.ts` |
| `/api/env/list`   | GET    | `/api/env/list`   | `env.ts` |
| `/api/env/toggle` | PATCH  | `/api/env/toggle` | `env.ts` |

### 8.4 Worktrees (4)

| 新 path                 | HTTP   | 旧 Next.js path         | 移行先         |
| ----------------------- | ------ | ----------------------- | -------------- |
| `/api/worktrees/list`   | GET    | `/api/worktrees/list`   | `worktrees.ts` |
| `/api/worktrees/create` | POST   | `/api/worktrees/create` | `worktrees.ts` |
| `/api/worktrees/delete` | DELETE | `/api/worktrees/delete` | `worktrees.ts` |
| `/api/worktrees/init`   | POST   | `/api/worktrees/init`   | `worktrees.ts` |

### 8.5 Planner (4)

| 新 path               | HTTP   | 旧 Next.js path       | 移行先       |
| --------------------- | ------ | --------------------- | ------------ |
| `/api/planner/config` | GET    | `/api/planner/config` | `planner.ts` |
| `/api/planner/tabs`   | GET    | `/api/planner/tabs`   | `planner.ts` |
| `/api/planner/tabs`   | POST   | 同上                  | `planner.ts` |
| `/api/planner/tabs`   | DELETE | 同上                  | `planner.ts` |

### 8.6 Other (3)

| 新 path                             | HTTP | 旧 Next.js path                      | 移行先          |
| ----------------------------------- | ---- | ------------------------------------ | --------------- |
| `/api/commands/open`                | POST | `/api/commands/open`                 | `commands.ts`   |
| `/api/onboarding/status`            | GET  | `/api/onboarding/status`             | `onboarding.ts` |
| `/api/internal/tabs/:tab_id/status` | POST | `/api/internal/tabs/[tab_id]/status` | `internal.ts`   |
| `/api/internal/tabs/:tab_id/todos`  | GET  | `/api/internal/tabs/[tab_id]/todos`  | `internal.ts`   |

### 8.7 Existing Fastify (移行対象外、prefix 統一のみ)

| 新 path                                        | HTTP   | 旧 Fastify path          | 移行先                                                                                                  |
| ---------------------------------------------- | ------ | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `/api/terminal/sessions`                       | GET    | `/api/terminal/sessions` | `terminal.ts` (path 内部変更不要)                                                                       |
| `/api/terminal/sessions`                       | POST   | 同上                     | `terminal.ts`                                                                                           |
| `/api/terminal/sessions/:sessionId`            | DELETE | 同上                     | `terminal.ts`                                                                                           |
| `/api/terminal/sessions/:sessionId/scrollback` | GET    | 同上                     | `terminal.ts`                                                                                           |
| `/api/editor/session`                          | POST   | `/api/editor/session`    | `editor.ts`                                                                                             |
| `/api/editor/session/:id`                      | GET    | 同上                     | `editor.ts`                                                                                             |
| `/api/editor/session/:id/complete`             | POST   | 同上                     | `editor.ts`                                                                                             |
| `/api/hooks/claude`                            | POST   | `/hooks/claude`          | `hooks.ts` (内部 path を `/hooks/claude` のままにして register prefix `/api` で `/api/hooks/claude` に) |
| `/api/hooks/events`                            | GET    | `/hooks/events`          | `hooks.ts`                                                                                              |
| `/api/internal/emit-status`                    | POST   | `/internal/emit-status`  | hooks.ts から `internal.ts` に移動、prefix 付き                                                         |
| `/api/mcp`                                     | GET    | `/mcp`                   | `mcp.ts`                                                                                                |
| `/api/mcp`                                     | POST   | 同上                     | `mcp.ts`                                                                                                |

**合計: 52 endpoints**

### 8.8 register 戦略

`apps/server/src/index.ts` で全 routes を `{ prefix: '/api' }` で register することで、各 routes 内部の path 宣言は `/api` を **書かない**。

例:

```ts
// apps/server/src/routes/tasks.ts
export const tasksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/tasks', async () => {
    /* ... */
  }); // → /api/tasks
  fastify.post('/tasks/validate', async () => {
    /* ... */
  }); // → /api/tasks/validate
  fastify.get('/tasks/:id', async () => {
    /* ... */
  }); // → /api/tasks/:id
  // ...
};
```

```ts
// apps/server/src/index.ts
await fastify.register(tasksRoutes, { prefix: '/api' });
```

**例外**: `terminal.ts` と `editor.ts` は **既存 path の中身が `/api/terminal/*`, `/api/editor/*` で hardcode されている**。これを Phase 4-0 で **path から `/api/` を取り除いて** `terminal.ts` 内では `/terminal/*`、`editor.ts` 内では `/editor/*` に書き換える (register prefix で `/api` が付与されて従来通りになる)。

---

## §9. Per-route 移行詳細 (28 Next.js routes)

各 route の実装ポイントは以下のテーブルにまとめる。**実装時は旧 route ファイルを参照しながら 1:1 で移植** すること。

| #   | path                                | method | 旧 file (削除対象)                                            | 主要依存                                                                  | request shape                                                               | response (success)                                 | response (error)                           | 移植時の注意                                                                                                                                                   |
| --- | ----------------------------------- | ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/api/clone`                        | POST   | `apps/web/src/app/api/clone/route.ts`                         | `repositories/repository`, `worktree-manager`, `repositories/environment` | `{ gitUrl: string }`                                                        | `{ data: { repository: RepoWithPath } }`           | `{ error: string }` 400/500                | 失敗時の `fs.rm` cleanup あり; GitHub PAT 認証 attempt                                                                                                         |
| 2   | `/api/commands/open`                | POST   | `apps/web/src/app/api/commands/open/route.ts`                 | `branch-utils`                                                            | `{ commandType: 'vscode' \| 'terminal', owner, repo, branch }`              | `{ success: true }`                                | `{ error: string }` 500                    | `child_process.exec` で `code`/`gnome-terminal`/`xterm` を spawn                                                                                               |
| 3   | `/api/env/list`                     | GET    | `apps/web/src/app/api/env/list/route.ts`                      | `repositories/environment`                                                | query: `scope, owner?, repo?`                                               | `{ data: { envVars: Record } }`                    | `{ error: string }` 400/500                | scope 検証 (global/owner/repo)                                                                                                                                 |
| 4   | `/api/env`                          | GET    | `apps/web/src/app/api/env/route.ts`                           | `repositories/environment`                                                | query                                                                       | `{ data: ... }`                                    | `{ error: string }`                        | —                                                                                                                                                              |
| 5   | `/api/env`                          | POST   | 同上                                                          | 同上                                                                      | `{ key, value, scope, owner?, repo? }`                                      | `{ data: { success: true } }` (201)                | 400/404/500                                | —                                                                                                                                                              |
| 6   | `/api/env`                          | PUT    | 同上                                                          | 同上                                                                      | 同上                                                                        | `{ data: { success: true } }`                      | 同上                                       | —                                                                                                                                                              |
| 7   | `/api/env`                          | DELETE | 同上                                                          | 同上                                                                      | query                                                                       | `{ data: { success: true } }`                      | 同上                                       | —                                                                                                                                                              |
| 8   | `/api/env/toggle`                   | PATCH  | `apps/web/src/app/api/env/toggle/route.ts`                    | 同上                                                                      | `{ key, scope, enabled, owner?, repo? }`                                    | `{ data: { success: true } }`                      | 400/500                                    | —                                                                                                                                                              |
| 9   | `/api/internal/tabs/:tab_id/status` | POST   | `apps/web/src/app/api/internal/tabs/[tab_id]/status/route.ts` | `db (prisma)`                                                             | `{ status: string, todos?: [] }`                                            | `{ data: { tabId, status } }`                      | 400/404                                    | `prisma.tab.updateMany` with optional todos JSON stringify。**Phase 3 で Fastify 自己呼び出しは関数化済みだが、UI が直接叩くのでこのエンドポイント自体は残す** |
| 10  | `/api/internal/tabs/:tab_id/todos`  | GET    | `apps/web/src/app/api/internal/tabs/[tab_id]/todos/route.ts`  | `db (prisma)`                                                             | path param                                                                  | `{ data: { todos: [] } }`                          | 404/500                                    | `JSON.parse(tab.todos ?? '[]')`                                                                                                                                |
| 11  | `/api/onboarding/status`            | GET    | `apps/web/src/app/api/onboarding/status/route.ts`             | `repositories/environment`                                                | none                                                                        | `{ data: { completed, hasGlobalToken } }`          | (none)                                     | `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` の存在チェック                                                                                                |
| 12  | `/api/owners`                       | GET    | `apps/web/src/app/api/owners/route.ts`                        | `repositories/repository`                                                 | none                                                                        | `{ data: { owners: [] with repositories } }`       | 500                                        | repos を owner で group                                                                                                                                        |
| 13  | `/api/planner/config`               | GET    | `apps/web/src/app/api/planner/config/route.ts`                | (none)                                                                    | none                                                                        | `{ data: { cwd } }`                                | (none)                                     | `~/.tsunagi` path を返すだけ                                                                                                                                   |
| 14  | `/api/planner/tabs`                 | GET    | `apps/web/src/app/api/planner/tabs/route.ts`                  | `db (prisma.plannerTab)`                                                  | none                                                                        | array                                              | 500                                        | orderBy asc                                                                                                                                                    |
| 15  | `/api/planner/tabs`                 | POST   | 同上                                                          | 同上                                                                      | `{ tabId }`                                                                 | `{ data: { tab: PlannerTab } }` (201)              | 400/500                                    | max(order)+1 で order 採番                                                                                                                                     |
| 16  | `/api/planner/tabs`                 | DELETE | 同上                                                          | 同上                                                                      | query: `tabId`                                                              | `{ data: { success: true } }`                      | 400/500                                    | —                                                                                                                                                              |
| 17  | `/api/repos`                        | GET    | `apps/web/src/app/api/repos/route.ts`                         | `repositories/repository`                                                 | none                                                                        | array                                              | 500                                        | —                                                                                                                                                              |
| 18  | `/api/repos`                        | POST   | 同上                                                          | 同上                                                                      | `{ owner, repo, cloneUrl }`                                                 | `{ data: RepoModel }` (201)                        | 400/409/500                                | 既存チェックで 409                                                                                                                                             |
| 19  | `/api/repos/:owner/:repo`           | GET    | `apps/web/src/app/api/repos/[owner]/[repo]/route.ts`          | `repositories/repository`, `task`                                         | path                                                                        | `{ data: Repository }`                             | 404/500                                    | —                                                                                                                                                              |
| 20  | `/api/repos/:owner/:repo`           | DELETE | 同上                                                          | 同上                                                                      | path                                                                        | `{ data: { success, deletedTaskCount } }`          | 404/500                                    | `fs.rm` でワークスペース削除 + cascade DB delete + 空 owner dir cleanup                                                                                        |
| 21  | `/api/repos/:owner/:repo/branches`  | GET    | `apps/web/src/app/api/repos/[owner]/[repo]/branches/route.ts` | `worktree-manager`                                                        | path                                                                        | `{ data: { branches, defaultBranch } }`            | 500                                        | `fetchRemote` + `getRemoteBranches` + `getDefaultBranch`                                                                                                       |
| 22  | `/api/tasks`                        | GET    | `apps/web/src/app/api/tasks/route.ts`                         | `services/task-service`                                                   | query: `status?, owner?, repo?, includeDeleted?`                            | array                                              | 500                                        | `listTasks`                                                                                                                                                    |
| 23  | `/api/tasks`                        | POST   | 同上                                                          | 同上                                                                      | `{ title, description, owner, repo, branch, baseBranch?, effort?, order? }` | `{ data: { task } }` (201)                         | 400/409/500                                | `createTask` with バリデーション。**既存 Fastify `/tasks` POST と統合**                                                                                        |
| 24  | `/api/tasks/validate`               | POST   | `apps/web/src/app/api/tasks/validate/route.ts`                | `repositories/task`                                                       | `{ title, owner, repo, branch }`                                            | `{ valid: true }`                                  | `{ valid: false, errors: [] }` 400/409/500 | branch 重複チェック。**既存 Fastify `/tasks/validate` と統合** (UI は Fastify 側を叩いていたので Next.js 側が dead だった)                                     |
| 25  | `/api/tasks/batch-delete`           | POST   | `apps/web/src/app/api/tasks/batch-delete/route.ts`            | `repositories/task`, `worktree-manager`                                   | `{ daysAgo?: 7 }`                                                           | `{ data: { batchId, targetTaskIds, totalCount } }` | 400/500                                    | **Background async deletion** (max 8 concurrent); `setImmediate` で worktree 削除も。**Fastify 移植時は unhandled rejection を防ぐ try/catch を徹底**          |
| 26  | `/api/tasks/:id`                    | GET    | `apps/web/src/app/api/tasks/[id]/route.ts`                    | `services/task-service`                                                   | path                                                                        | `{ data: { task } }`                               | 404/500                                    | `getTask`                                                                                                                                                      |
| 27  | `/api/tasks/:id`                    | PUT    | 同上                                                          | 同上                                                                      | path + body                                                                 | `{ data: { task } }`                               | 404/500                                    | `updateTask`                                                                                                                                                   |
| 28  | `/api/tasks/:id`                    | DELETE | 同上                                                          | 同上                                                                      | path                                                                        | `{ data: { success } }`                            | 404/500                                    | `deleteTask`                                                                                                                                                   |
| 29  | `/api/tasks/:id/complete`           | POST   | `apps/web/src/app/api/tasks/[id]/complete/route.ts`           | `repositories/task`                                                       | path                                                                        | `{ data: { task }, message }`                      | 404/500                                    | `completeTask` (PR merge logic)                                                                                                                                |
| 30  | `/api/tasks/:id/needs-rebase`       | GET    | `apps/web/src/app/api/tasks/[id]/needs-rebase/route.ts`       | `repositories/task`, `worktree-manager`                                   | path                                                                        | `{ data: { needsRebase: boolean } }`               | 404/500                                    | `worktreeStatus === 'created'` の時のみチェック                                                                                                                |
| 31  | `/api/tasks/:id/rebase`             | POST   | `apps/web/src/app/api/tasks/[id]/rebase/route.ts`             | `repositories/task`, `worktree-manager`                                   | path + `{ baseBranch?: string }`                                            | `{ data: { success, message } }`                   | `{ error, conflicts? }` 409/500            | `rebaseWorktree`; `tab.status !== 'running'` チェック                                                                                                          |
| 32  | `/api/tasks/:id/status`             | PUT    | `apps/web/src/app/api/tasks/[id]/status/route.ts`             | `repositories/task`                                                       | path + `{ status, pullRequestUrl? }`                                        | `{ data: { task } }`                               | 404/500                                    | `transitionTaskStatus` with valid status enum check                                                                                                            |
| 33  | `/api/tasks/:id/tabs`               | GET    | `apps/web/src/app/api/tasks/[id]/tabs/route.ts`               | `repositories/task`                                                       | path                                                                        | `{ data: { tabs } }`                               | 404/500                                    | `getTask`                                                                                                                                                      |
| 34  | `/api/tasks/:id/tabs`               | POST   | 同上                                                          | 同上                                                                      | path                                                                        | `{ data: { tab } }` (201)                          | 404/500                                    | `createTab`                                                                                                                                                    |
| 35  | `/api/tasks/:id/tabs/:tab_id`       | PUT    | `apps/web/src/app/api/tasks/[id]/tabs/[tab_id]/route.ts`      | 同上                                                                      | path + body                                                                 | `{ data: { tab } }`                                | 404/500                                    | `updateTab`                                                                                                                                                    |
| 36  | `/api/tasks/:id/tabs/:tab_id`       | DELETE | 同上                                                          | 同上                                                                      | path                                                                        | `{ data: { success } }`                            | 404/500                                    | `deleteTab`                                                                                                                                                    |
| 37  | `/api/worktrees/create`             | POST   | `apps/web/src/app/api/worktrees/create/route.ts`              | `worktree-manager`                                                        | `{ owner, repo, branch }`                                                   | `{ data: { worktreePath, success } }` (201)        | 400/500                                    | `fetchRemote` + `createWorktree`                                                                                                                               |
| 38  | `/api/worktrees/delete`             | DELETE | `apps/web/src/app/api/worktrees/delete/route.ts`              | 同上                                                                      | query: `owner, repo, branch, force?`                                        | `{ data: { success } }`                            | 400/500                                    | `removeWorktree`                                                                                                                                               |
| 39  | `/api/worktrees/init`               | POST   | `apps/web/src/app/api/worktrees/init/route.ts`                | `worktree-manager`, `repositories/repository`                             | `{ owner, repo }`                                                           | `{ data: { bareRepoPath, success } }` (201)        | 400/404/500                                | `getRepo` 検証 + `initBareRepository`                                                                                                                          |
| 40  | `/api/worktrees/list`               | GET    | `apps/web/src/app/api/worktrees/list/route.ts`                | `worktree-manager`                                                        | query: `owner, repo`                                                        | `{ data: Array<worktree> }`                        | 400/500                                    | `listWorktrees`                                                                                                                                                |

### 9.1 移植時の Next.js → Fastify 変換テンプレート

```ts
// Before (Next.js App Router)
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    // ...
    return NextResponse.json({ data: { task } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

```ts
// After (Fastify)
import type { FastifyPluginAsync } from 'fastify';

interface CreateBody {
  title: string;
  // ...
}

export const tasksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { id: string };
    Body: CreateBody;
  }>('/tasks/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const body = request.body;
      // ...
      return reply.code(201).send({ data: { task } });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });
};
```

**重要**: response の JSON shape (`{ data: ... }` / `{ error: ... }`) と HTTP status code を **完全に一致** させる。UI 側は既存の Next.js 実装を前提にしているため、shape が変わると画面が壊れる。

### 9.2 dynamic params の差異

- Next.js: `{ params }: { params: Promise<{ id: string }> }` → `await params`
- Fastify: `request.params as { id: string }` (型 generic は `Params` で指定)

### 9.3 query string の差異

- Next.js: `request.nextUrl.searchParams.get('foo')`
- Fastify: `request.query as { foo?: string }` (型 generic は `Querystring` で指定)

### 9.4 `request.json()` の差異

- Next.js: `await request.json()`
- Fastify: `request.body` (デフォルトで JSON parse される。空 body の場合は `null`)

---

## §10. Phase 別 commit plan

PR は 1 つだが、commit を意味のある単位に分割する。

### Phase 0: 起点を作る

**Commit 0-1: refactoring-plan.md commit (既に存在する場合は skip)**

`§C-2` の手順で `git reset --hard main` 後、refactoring-plan.md だけを commit。

```bash
git add refactoring-plan.md
git commit -m "docs: add monorepo refactoring plan"
```

### Phase 1: packages/shared を新設

**Commit 1-1: shared scaffold**

- `packages/shared/package.json` 新規 (§11.2 参照)
- `packages/shared/tsconfig.json` 新規 (§11.2 参照)
- `packages/shared/src/index.ts` 新規 (`export * from './types.js';`)
- root `package.json` の `workspaces` に `"packages/*"` を追加 (§11.1)
- `npm install`

```bash
mkdir -p packages/shared/src
# ファイル作成 (§11.2 のスニペットを使用)
npm install
git add packages/shared root/package.json
git commit -m "feat(shared): scaffold @minimalcorp/tsunagi-shared package"
```

**Commit 1-2: types.ts を packages/shared に移動**

```bash
git mv apps/web/src/lib/types.ts packages/shared/src/types.ts
git commit -m "refactor(shared): move types.ts from apps/web/src/lib to packages/shared"
```

**Commit 1-3: apps/web で types を `@minimalcorp/tsunagi-shared` から import**

- `apps/web/package.json` の `dependencies` に `"@minimalcorp/tsunagi-shared": "*"` を追加
- `apps/web/src/` 配下の `import type { ... } from '@/lib/types'` を `from '@minimalcorp/tsunagi-shared'` に grep / sed で置換
- 同様に `'../lib/types'` 等の相対 import も置換
- `npm install` で symlink 作成

```bash
cd apps/web
npm pkg set 'dependencies.@minimalcorp/tsunagi-shared=*'
cd ../..
# grep で残存箇所を確認しながら手動修正
# (api routes 内も対象だがどうせ削除するので Phase 4 まで残してもよい)
npm install
npm run lint -w @minimalcorp/tsunagi-web
npm run type-check -w @minimalcorp/tsunagi-web
git add apps/web
git commit -m "refactor(web): switch type imports to @minimalcorp/tsunagi-shared"
```

**Commit 1-4: shared の build 検証**

```bash
npm run build -w @minimalcorp/tsunagi-shared
# packages/shared/dist/index.js, types.js, *.d.ts が出力されることを確認
git add packages/shared/dist 2>/dev/null  # gitignore 対象なら add 不要
# add するものはなし、commit も skip
```

### Phase 2: apps/server を scaffold

**Commit 2-1: apps/server scaffold**

- `apps/server/package.json` 新規 (§11.3)
- `apps/server/tsconfig.json` 新規 (§11.3)
- `apps/server/eslint.config.mjs` 新規 (apps/web の eslint.config.mjs を copy して minimal に)
- 空の `apps/server/src/index.ts` (placeholder で `console.log('placeholder')`)
- `npm install` で symlink 作成

```bash
mkdir -p apps/server/src
# ファイル作成 (§11.3)
npm install
git add apps/server
git commit -m "feat(server): scaffold @minimalcorp/tsunagi-server package"
```

**Commit 2-2: Prisma アセットの移動 + schema.prisma の output path 変更**

```bash
git mv apps/web/prisma apps/server/prisma
git mv apps/web/prisma.config.ts apps/server/prisma.config.ts
# schema.prisma の generator output を変更
sed -i.bak 's|output   = "../generated/prisma"|output   = "../src/generated/prisma"|' \
  apps/server/prisma/schema.prisma
rm apps/server/prisma/schema.prisma.bak
git add apps/server/prisma apps/server/prisma.config.ts apps/web
git commit -m "refactor(server): move prisma schema and config from apps/web"
```

**Commit 2-3: scripts (db-backup, db-restore, migrate-to-sqlite, patch-prisma-generated) の移動**

- `apps/server/scripts/patch-prisma-generated.ts` を新規作成 (§11.4。**`generated` の path が `src/generated/prisma` に変わっている** ので script の `GENERATED_DIR` を `path.resolve(THIS_DIR, '..', 'src', 'generated', 'prisma')` に)
- `git mv apps/web/scripts/{db-backup,db-restore,migrate-to-sqlite}.ts apps/server/scripts/`
- 上記 ts file の中身も更新が必要なら (例: `migrate-to-sqlite.ts` が `../generated/prisma/client` を import している) `../src/generated/prisma/client.js` に修正

```bash
mkdir -p apps/server/scripts
# patch-prisma-generated.ts 新規作成 (§11.4 のスニペットを GENERATED_DIR に注意して使用)
git mv apps/web/scripts/db-backup.ts apps/server/scripts/db-backup.ts
git mv apps/web/scripts/db-restore.ts apps/server/scripts/db-restore.ts
git mv apps/web/scripts/migrate-to-sqlite.ts apps/server/scripts/migrate-to-sqlite.ts
# migrate-to-sqlite.ts の import path を編集
git add apps/server/scripts apps/web
git commit -m "refactor(server): move db scripts and add patch-prisma-generated"
```

**Commit 2-4: db:generate の検証**

```bash
cd apps/server
npm run db:generate    # prisma generate + patch-prisma-generated.ts
# apps/server/src/generated/prisma/client.ts などが作られることを確認
# ファイルの相対 import が .js 拡張子付きになっていることを確認
cd ../..
git add apps/server/src/generated 2>/dev/null  # generated は通常 gitignore
# .gitignore に apps/server/src/generated/ を追加
echo "" >> .gitignore
echo "# Prisma generated client (server)" >> .gitignore
echo "apps/server/src/generated/" >> .gitignore
git add .gitignore
git commit -m "build(server): ignore prisma generated client"
```

**Commit 2-5: Fastify entry & 関連の移動**

```bash
git mv apps/web/server/index.ts apps/server/src/index.ts
git mv apps/web/server/pty-manager.ts apps/server/src/pty-manager.ts
git mv apps/web/server/editor-session-store.ts apps/server/src/editor-session-store.ts
git mv apps/web/server/routes apps/server/src/routes
# apps/web/server/tsconfig.json を削除 (apps/server/tsconfig.json に統合)
rm apps/web/server/tsconfig.json
rmdir apps/web/server  # 空ディレクトリ削除
git add apps/web apps/server
git commit -m "refactor(server): move Fastify entry and routes from apps/web"
```

**Commit 2-6: server 責務 lib (db, repositories, services, worktree-manager, branch-utils, data-path) の移動**

```bash
mkdir -p apps/server/src/lib/repositories apps/server/src/lib/services
git mv apps/web/src/lib/db.ts apps/server/src/lib/db.ts
git mv apps/web/src/lib/data-path.ts apps/server/src/lib/data-path.ts
git mv apps/web/src/lib/branch-utils.ts apps/server/src/lib/branch-utils.ts
git mv apps/web/src/lib/worktree-manager.ts apps/server/src/lib/worktree-manager.ts
git mv apps/web/src/lib/repositories/repository.ts apps/server/src/lib/repositories/repository.ts
git mv apps/web/src/lib/repositories/task.ts apps/server/src/lib/repositories/task.ts
git mv apps/web/src/lib/repositories/environment.ts apps/server/src/lib/repositories/environment.ts
git mv apps/web/src/lib/services/task-service.ts apps/server/src/lib/services/task-service.ts
rmdir apps/web/src/lib/repositories apps/web/src/lib/services
git add apps/web apps/server
git commit -m "refactor(server): move backend lib files from apps/web/src/lib"
```

**Commit 2-7: apps/server 内部の import path 修正**

server/src 配下の全ての相対 import を nodenext (`.js` 拡張子付き) に修正し、外部 import も含めて以下を確認:

- `apps/server/src/index.ts`:
  - `./routes/{terminal,hooks,mcp,tasks,editor}.js` 形式に
  - fastify-socket.io の interop 処理 (§11.10) を入れる
  - CORS methods に PUT, PATCH 追加 (§11.9)

- `apps/server/src/routes/*.ts`:
  - `../../../src/lib/...` を `../lib/...` に
  - 例: `../../src/lib/repositories/task.js` → `../lib/repositories/task.js`
  - `import type { Task } from '../lib/types.js'` 等は `'@minimalcorp/tsunagi-shared'` に置換

- `apps/server/src/lib/repositories/*.ts`:
  - `../db.js` (相対 OK)
  - `import type { Task } from '../types.js'` → `'@minimalcorp/tsunagi-shared'`

- `apps/server/src/lib/services/task-service.ts`:
  - `../repositories/task.js` (相対 OK)
  - `../worktree-manager.js` (相対 OK)
  - `../branch-utils.js` (相対 OK)
  - `import type { Task, Repository } from '../types.js'` → `'@minimalcorp/tsunagi-shared'`
  - `simple-git` の named import: `import { simpleGit } from 'simple-git'`

- `apps/server/src/lib/db.ts`:
  - `../../generated/prisma/client.js` → `../generated/prisma/client.js`
  - `./data-path.js` (相対 OK)

- `apps/server/src/lib/worktree-manager.ts`:
  - `simple-git` の named import: `import { simpleGit, type SimpleGit } from 'simple-git'`
  - `./branch-utils.js` (相対 OK)

```bash
# 編集後
npm run db:generate -w @minimalcorp/tsunagi-server
npm run lint -w @minimalcorp/tsunagi-server
npm run type-check -w @minimalcorp/tsunagi-server
npm run build -w @minimalcorp/tsunagi-server
# dist/index.js, dist/routes/**, dist/lib/**, dist/generated/prisma/** が出ることを確認
node --input-type=module -e "import('./apps/server/dist/generated/prisma/client.js').then(m=>console.log(Object.keys(m).slice(0,5)))"
git add apps/server
git commit -m "refactor(server): adjust import paths and ESM interop"
```

**注: この時点で apps/web は import path が壊れているのでビルドできない**。Phase 4 で API routes を削除するまで apps/web の build は壊れていてよい。

### Phase 3: Fastify 自己 HTTP 呼び出しを関数呼び出しに置換

**Commit 3-1: hooks.ts と terminal.ts の `/api/internal/tabs/*/status` 呼び出しを prisma 直に**

`apps/server/src/routes/hooks.ts` の line 63 付近:

```ts
// Before
const response = await fetch(`http://localhost:2791/api/internal/tabs/${sessionId}/status`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status, todos }),
});
```

```ts
// After (上部に import を追加)
import { prisma } from '../lib/db.js';

// 該当箇所
await prisma.tab.updateMany({
  where: { tabId: sessionId },
  data: {
    status,
    ...(todos !== undefined && { todos: JSON.stringify(todos) }),
  },
});
```

`apps/server/src/routes/terminal.ts` の line 86 付近も同様に置換。

```bash
git add apps/server/src/routes/hooks.ts apps/server/src/routes/terminal.ts
git commit -m "refactor(server): replace /api/internal/tabs/:id/status fetch with prisma direct call"
```

**Commit 3-2: mcp.ts の `/api/internal/tabs/*/todos` 呼び出しを prisma 直に**

`apps/server/src/routes/mcp.ts` の line 346 付近 (MCP tool `tsunagi_get_tab_todos`):

```ts
// Before
const res = await fetch(`http://localhost:2791/api/internal/tabs/${tabId}/todos`);
// ...
```

```ts
// After
import { prisma } from '../lib/db.js';

const tab = await prisma.tab.findUnique({ where: { tabId } });
if (!tab) {
  // 既存のエラーレスポンス形式を維持
  return /* ... */;
}
const todos = JSON.parse(tab.todos ?? '[]');
```

```bash
git add apps/server/src/routes/mcp.ts
git commit -m "refactor(server): replace /api/internal/tabs/:id/todos fetch with prisma direct call"
```

**Commit 3-3: 検証**

```bash
npm run build -w @minimalcorp/tsunagi-server
grep -rn "localhost:2791" apps/server/src   # 結果が空であることを確認
# 何も commit するものなし
```

### Phase 4: Next.js API routes を Fastify に移植

**Commit 4-0: register prefix 統一の準備 + CORS 修正**

`apps/server/src/index.ts` を以下に書き換え (§11.10 参照):

```ts
import Fastify, { type FastifyPluginAsync, type FastifyPluginOptions } from 'fastify';
import fastifyCors from '@fastify/cors';
import * as fastifySocketIONs from 'fastify-socket.io';
const fastifySocketIO = ((
  fastifySocketIONs as unknown as { default?: FastifyPluginAsync<FastifyPluginOptions> }
).default ??
  (fastifySocketIONs as unknown as FastifyPluginAsync<FastifyPluginOptions>)) as FastifyPluginAsync<FastifyPluginOptions>;

import { tasksRoutes } from './routes/tasks.js';
import { reposRoutes } from './routes/repos.js';
import { envRoutes } from './routes/env.js';
import { worktreesRoutes } from './routes/worktrees.js';
import { plannerRoutes } from './routes/planner.js';
import { commandsRoutes } from './routes/commands.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { internalRoutes } from './routes/internal.js';
import { hooksRoutes } from './routes/hooks.js';
import { mcpRoutes } from './routes/mcp.js';
import { terminalRoutes } from './routes/terminal.js';
import { editorRoutes } from './routes/editor.js';

const PORT = 2792;

async function start() {
  const fastify = Fastify({ logger: true });

  await fastify.register(fastifyCors, {
    origin: ['http://localhost:2791'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifySocketIO, {
    transports: ['websocket'],
    cors: {
      origin: ['http://localhost:2791'],
    },
  });

  // 全 routes を /api prefix で register
  await fastify.register(tasksRoutes, { prefix: '/api' });
  await fastify.register(reposRoutes, { prefix: '/api' });
  await fastify.register(envRoutes, { prefix: '/api' });
  await fastify.register(worktreesRoutes, { prefix: '/api' });
  await fastify.register(plannerRoutes, { prefix: '/api' });
  await fastify.register(commandsRoutes, { prefix: '/api' });
  await fastify.register(onboardingRoutes, { prefix: '/api' });
  await fastify.register(internalRoutes, { prefix: '/api' });
  await fastify.register(hooksRoutes, { prefix: '/api' });
  await fastify.register(mcpRoutes, { prefix: '/api' });
  await fastify.register(terminalRoutes, { prefix: '/api' });
  await fastify.register(editorRoutes, { prefix: '/api' });

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Fastify server running on port ${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

そして以下の変更:

- `apps/server/src/routes/tasks.ts`: 既存 `/tasks`, `/tasks/validate` ハンドラを削除 (Phase 4-1 で全面再構築)
- `apps/server/src/routes/hooks.ts`: 内部 path `/hooks/claude`, `/hooks/events` のまま (prefix `/api` で `/api/hooks/...` になる)。`/internal/emit-status` は削除 (Phase 4-8 で internal.ts に移動)
- `apps/server/src/routes/mcp.ts`: 内部 path `/mcp` のまま (prefix `/api` で `/api/mcp` に)
- `apps/server/src/routes/terminal.ts`: 内部 path を `/api/terminal/*` から `/terminal/*` に変更:
  ```
  '/api/terminal/sessions'                          → '/terminal/sessions'
  '/api/terminal/sessions/:sessionId'               → '/terminal/sessions/:sessionId'
  '/api/terminal/sessions/:sessionId/scrollback'    → '/terminal/sessions/:sessionId/scrollback'
  ```
  例: `sed -i.bak 's|/api/terminal/|/terminal/|g' apps/server/src/routes/terminal.ts && rm apps/server/src/routes/terminal.ts.bak`
- `apps/server/src/routes/editor.ts`: 同様に `/api/editor/*` から `/editor/*` に変更:
  ```
  '/api/editor/session'                  → '/editor/session'
  '/api/editor/session/:id'              → '/editor/session/:id'
  '/api/editor/session/:id/complete'     → '/editor/session/:id/complete'
  ```
  例: `sed -i.bak 's|/api/editor/|/editor/|g' apps/server/src/routes/editor.ts && rm apps/server/src/routes/editor.ts.bak`

新規空ファイル作成 (各 routes 新ファイル):

```bash
# それぞれ以下のような最小プラグインで scaffold
cat > apps/server/src/routes/repos.ts <<'EOF'
import type { FastifyPluginAsync } from 'fastify';

export const reposRoutes: FastifyPluginAsync = async (fastify) => {
  // Phase 4-2 で /repos, /owners, /clone を実装
};
EOF
# 同じパターンで env.ts, worktrees.ts, planner.ts, commands.ts, onboarding.ts, internal.ts も作成
```

具体的に作成するファイル:

- `apps/server/src/routes/repos.ts` (export `reposRoutes`)
- `apps/server/src/routes/env.ts` (export `envRoutes`)
- `apps/server/src/routes/worktrees.ts` (export `worktreesRoutes`)
- `apps/server/src/routes/planner.ts` (export `plannerRoutes`)
- `apps/server/src/routes/commands.ts` (export `commandsRoutes`)
- `apps/server/src/routes/onboarding.ts`(export `onboardingRoutes`)
- `apps/server/src/routes/internal.ts` (export `internalRoutes`)

```bash
# index.ts と既存 routes 修正、空 route ファイル新規作成
npm run build -w @minimalcorp/tsunagi-server
git add apps/server
git commit -m "refactor(server): unify route registration with /api prefix and add CORS PUT/PATCH"
```

**Commit 4-1〜4-9: 各 route group の移植**

各 commit で 1 つの機能グループを Fastify に移植し、対応する Next.js API route file を削除する。

各 commit の共通フロー:

1. `apps/server/src/routes/<group>.ts` に該当 endpoint を実装 (§9 のテーブルを参照、原実装は `apps/web/src/app/api/<group>/**/route.ts` を読む)
2. `apps/web/src/app/api/<group>/**` を `rm -rf` で削除
3. `npm run build -w @minimalcorp/tsunagi-server` で型と build 確認
4. commit

**注**: Phase 7 で UI 側の fetch を `apiUrl()` に置換するまで、UI から該当 route を叩いた場合は失敗する (Next.js routes が無くなり、rewrites も無いため)。これは Phase 中間状態として許容 (B-4)。

#### Commit 4-1: `/api/tasks/*` 移植

`apps/server/src/routes/tasks.ts` に §9 の #22-#36 (15 endpoints) を実装:

- 旧 `/tasks`, `/tasks/validate` POST ハンドラを削除済み (Phase 4-0)
- 旧 Next.js route の実装は `apps/web/src/app/api/tasks/{route.ts,validate/route.ts,batch-delete/route.ts,[id]/route.ts,[id]/status/route.ts,[id]/complete/route.ts,[id]/needs-rebase/route.ts,[id]/rebase/route.ts,[id]/tabs/route.ts,[id]/tabs/[tab_id]/route.ts}` を参照
- 移植時は §9.1 の Next.js → Fastify 変換テンプレートに従う

```bash
# tasks.ts に実装を書く
rm -rf apps/web/src/app/api/tasks
npm run build -w @minimalcorp/tsunagi-server
git add apps/server/src/routes/tasks.ts apps/web/src/app/api/tasks
git commit -m "refactor(server): migrate /api/tasks/* from Next.js to Fastify"
```

#### Commit 4-2: `/api/repos/*`, `/api/owners`, `/api/clone` 移植

`apps/server/src/routes/repos.ts` に §9 の #1, #12, #17-#21 (7 endpoints) を実装。

旧 routes:

- `apps/web/src/app/api/repos/route.ts`
- `apps/web/src/app/api/repos/[owner]/[repo]/route.ts`
- `apps/web/src/app/api/repos/[owner]/[repo]/branches/route.ts`
- `apps/web/src/app/api/owners/route.ts`
- `apps/web/src/app/api/clone/route.ts`

```bash
# repos.ts に 7 endpoints 実装
rm -rf apps/web/src/app/api/repos apps/web/src/app/api/owners apps/web/src/app/api/clone
npm run build -w @minimalcorp/tsunagi-server
git add apps/server/src/routes/repos.ts apps/web/src/app/api
git commit -m "refactor(server): migrate /api/repos/*, /api/owners, /api/clone from Next.js to Fastify"
```

#### Commit 4-3: `/api/env/*` 移植

`apps/server/src/routes/env.ts` に §9 の #3-#8 (6 endpoints) を実装。

旧 routes:

- `apps/web/src/app/api/env/route.ts` (GET, POST, PUT, DELETE)
- `apps/web/src/app/api/env/list/route.ts`
- `apps/web/src/app/api/env/toggle/route.ts`

```bash
# env.ts に 6 endpoints 実装
rm -rf apps/web/src/app/api/env
npm run build -w @minimalcorp/tsunagi-server
git add apps/server/src/routes/env.ts apps/web/src/app/api/env
git commit -m "refactor(server): migrate /api/env/* from Next.js to Fastify"
```

#### Commit 4-4: `/api/worktrees/*` 移植

`apps/server/src/routes/worktrees.ts` に §9 の #37-#40 (4 endpoints) を実装。

旧 routes:

- `apps/web/src/app/api/worktrees/{list,create,delete,init}/route.ts`

```bash
# worktrees.ts に 4 endpoints 実装
rm -rf apps/web/src/app/api/worktrees
npm run build -w @minimalcorp/tsunagi-server
git add apps/server/src/routes/worktrees.ts apps/web/src/app/api/worktrees
git commit -m "refactor(server): migrate /api/worktrees/* from Next.js to Fastify"
```

#### Commit 4-5: `/api/planner/*` 移植

`apps/server/src/routes/planner.ts` に §9 の #13-#16 (4 endpoints) を実装。

旧 routes:

- `apps/web/src/app/api/planner/config/route.ts`
- `apps/web/src/app/api/planner/tabs/route.ts` (GET, POST, DELETE)

```bash
rm -rf apps/web/src/app/api/planner
npm run build -w @minimalcorp/tsunagi-server
git add apps/server/src/routes/planner.ts apps/web/src/app/api/planner
git commit -m "refactor(server): migrate /api/planner/* from Next.js to Fastify"
```

#### Commit 4-6: `/api/commands/open` 移植

`apps/server/src/routes/commands.ts` に §9 の #2 (1 endpoint) を実装。`child_process.exec` で `code`/`gnome-terminal`/`xterm` を起動するロジック。

旧 routes:

- `apps/web/src/app/api/commands/open/route.ts`

```bash
rm -rf apps/web/src/app/api/commands
npm run build -w @minimalcorp/tsunagi-server
git add apps/server/src/routes/commands.ts apps/web/src/app/api/commands
git commit -m "refactor(server): migrate /api/commands/open from Next.js to Fastify"
```

#### Commit 4-7: `/api/onboarding/status` 移植

`apps/server/src/routes/onboarding.ts` に §9 の #11 (1 endpoint) を実装。

旧 routes:

- `apps/web/src/app/api/onboarding/status/route.ts`

```bash
rm -rf apps/web/src/app/api/onboarding
npm run build -w @minimalcorp/tsunagi-server
git add apps/server/src/routes/onboarding.ts apps/web/src/app/api/onboarding
git commit -m "refactor(server): migrate /api/onboarding/status from Next.js to Fastify"
```

#### Commit 4-8: `/api/internal/*` 移植

`apps/server/src/routes/internal.ts` に §9 の #9, #10 (2 endpoints) と既存 Fastify `/internal/emit-status` を統合実装。

- `POST /internal/tabs/:tab_id/status` (UI から叩く)
- `GET /internal/tabs/:tab_id/todos` (UI から叩く)
- `POST /internal/emit-status` (Phase 4-0 で hooks.ts から削除済みの代替)

`apps/server/src/routes/hooks.ts` 内に旧 `/internal/emit-status` ハンドラがまだ残っている場合は削除する。

旧 routes:

- `apps/web/src/app/api/internal/tabs/[tab_id]/status/route.ts`
- `apps/web/src/app/api/internal/tabs/[tab_id]/todos/route.ts`

```bash
# internal.ts に 3 endpoints 実装、hooks.ts から /internal/emit-status を削除
rm -rf apps/web/src/app/api/internal
npm run build -w @minimalcorp/tsunagi-server
git add apps/server/src/routes/internal.ts apps/server/src/routes/hooks.ts apps/web/src/app/api/internal
git commit -m "refactor(server): migrate /api/internal/* from Next.js to Fastify and consolidate emit-status"
```

#### Commit 4-9: src/app/api/ 完全削除と確認

```bash
find apps/web/src/app/api -type f 2>/dev/null   # 結果空であることを確認
rm -rf apps/web/src/app/api 2>/dev/null         # ディレクトリ自体も削除
git status apps/web/src/app/api 2>/dev/null     # untracked 残骸が無いことを確認

# grep で漏れがないかスポットチェック
grep -rn "@/lib/db\|@/lib/repositories\|@/lib/services\|@/lib/worktree-manager\|@/lib/branch-utils" apps/web
# → ヒットゼロを期待

git add apps/web/src/app/api 2>/dev/null
git commit --allow-empty -m "chore(web): finalize removal of src/app/api directory"
```

### Phase 5: apps/cli を新設して aggregator に

**Commit 5-1: cli scaffold**

- `apps/cli/package.json` 新規 (§11.5)
- `apps/cli/tsconfig.json` 新規 (§11.5)
- `apps/cli/eslint.config.mjs` 新規

```bash
mkdir -p apps/cli/src apps/cli/scripts
# ファイル作成
npm install
git add apps/cli
git commit -m "feat(cli): scaffold @minimalcorp/tsunagi (publishable aggregator)"
```

**Commit 5-2: CLI スクリプト + tsunagi-marketplace 移動**

```bash
git mv apps/web/scripts/cli.ts apps/cli/src/cli.ts
git mv apps/web/scripts/auto-migrate.ts apps/cli/src/auto-migrate.ts
git mv apps/web/scripts/plugin-lifecycle.ts apps/cli/src/plugin-lifecycle.ts
git mv apps/web/scripts/single-instance-lock.ts apps/cli/src/single-instance-lock.ts
git mv apps/web/scripts/with-plugin.ts apps/cli/src/with-plugin.ts
git mv apps/web/scripts/fix-node-pty-permissions.cjs apps/cli/scripts/fix-node-pty-permissions.cjs
git mv apps/web/tsunagi-marketplace apps/cli/tsunagi-marketplace

# まだ apps/web に残っているスクリプト
ls apps/web/scripts/  # monaco-editor.sh, fix-broken-worktrees.sh
# これらは apps/server/scripts/ に移動 (server 用の補助 shell スクリプト)
git mv apps/web/scripts/monaco-editor.sh apps/server/scripts/monaco-editor.sh
git mv apps/web/scripts/fix-broken-worktrees.sh apps/server/scripts/fix-broken-worktrees.sh
rmdir apps/web/scripts  # 空になったはず

git add apps/cli apps/web apps/server
git commit -m "refactor: move CLI sources, marketplace, and shell scripts"
```

**Commit 5-3: CLI 内部の import / path 修正**

- `apps/cli/src/cli.ts`:
  - `__dirname` 系は既に `fileURLToPath(import.meta.url)` 化済み (in-flight 修正だが reset 後は再実装)
  - `import './plugin-lifecycle.js'` 等の相対 import (`.js` 拡張子付き)
  - パス計算:
    ```ts
    const DIST_DIR = path.dirname(fileURLToPath(import.meta.url));
    // dist/cli.js → DIST_DIR = <pkg>/dist
    const PACKAGE_ROOT = path.resolve(DIST_DIR, '..');
    // → <pkg>
    const AUTO_MIGRATE_JS = path.join(DIST_DIR, 'auto-migrate.js');
    const FASTIFY_ENTRY_JS = path.join(DIST_DIR, 'server', 'index.js');
    const NEXT_STANDALONE_ENTRY = path.join(
      PACKAGE_ROOT,
      '.next',
      'standalone',
      'apps',
      'web',
      'server.js'
    );
    ```

- `apps/cli/src/plugin-lifecycle.ts`:
  - `import.meta.url` から `THIS_DIR` を導出
  - tsunagi-marketplace の場所:
    ```ts
    const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
    // 開発時 (tsx): apps/cli/src/plugin-lifecycle.ts → THIS_DIR = apps/cli/src
    //   → ../tsunagi-marketplace = apps/cli/tsunagi-marketplace ✓
    // 本番 (dist): <pkg>/dist/plugin-lifecycle.js → THIS_DIR = <pkg>/dist
    //   → ../tsunagi-marketplace = <pkg>/tsunagi-marketplace ✓
    const candidates = [path.resolve(THIS_DIR, '..', 'tsunagi-marketplace')];
    ```

- `apps/cli/src/with-plugin.ts`:
  - dev mode で `concurrently` を使い `npm run dev -w @minimalcorp/tsunagi-web` と `npm run dev -w @minimalcorp/tsunagi-server` を起動
  - `plugin-lifecycle.ensureCleanPluginState()` を最初に呼ぶ

```bash
# 編集後
npm run build -w @minimalcorp/tsunagi
# apps/cli/dist/cli.js, plugin-lifecycle.js, ... が出ることを確認
git add apps/cli
git commit -m "refactor(cli): adjust CLI import paths and runtime path resolution"
```

**Commit 5-4: bundle.mjs 作成**

`apps/cli/scripts/bundle.mjs` を §11.6 のスニペットで新規作成。

```bash
# bundle.mjs 作成
npm run build -w @minimalcorp/tsunagi-shared
npm run build -w @minimalcorp/tsunagi-server
npm run build -w @minimalcorp/tsunagi-web   # ← Phase 6 までは Next.js build が壊れている可能性、後回し
# bundle 検証は Phase 8 で
git add apps/cli/scripts/bundle.mjs
git commit -m "feat(cli): add prepack bundle script"
```

**Commit 5-5: plugin.json の URL 更新**

`apps/cli/tsunagi-marketplace/plugins/tsunagi-plugin/.claude-plugin/plugin.json` を §7.3 の sed コマンドで一括置換。

```bash
cd apps/cli/tsunagi-marketplace/plugins/tsunagi-plugin/.claude-plugin
sed -i.bak \
  -e 's|http://localhost:2792/hooks/claude|http://localhost:2792/api/hooks/claude|g' \
  -e 's|http://localhost:2792/mcp|http://localhost:2792/api/mcp|g' \
  plugin.json
rm plugin.json.bak
cd ../../../../..
git add apps/cli/tsunagi-marketplace
git commit -m "fix(plugin): update Claude hook and mcp URLs to /api prefix"
```

### Phase 6: apps/web のクリーンアップ (UI 専用化)

**Commit 6-1: apps/web/package.json をトリム**

§11.7 を参照して以下を変更:

- `name` → `@minimalcorp/tsunagi-web`
- `private: true` を追加
- `version` → `0.0.0`
- `bin`, `files` フィールドを削除
- `dependencies` から server 関連を全削除 (§11.7 の after を参照)
- `scripts` から `db:*`, `postinstall`, `prepack`, `prepublishOnly`, `server:dev` などを削除
- `engines`, `os`, `keywords`, `homepage`, `repository`, `bugs`, `author`, `license` などの publish meta を削除

```bash
# package.json 編集
npm install   # workspace symlink 再構築
git add apps/web/package.json package-lock.json
git commit -m "refactor(web): trim package.json to UI-only deps and mark as private"
```

**Commit 6-2: next.config.ts のクリーンアップ**

§11.7 の after を参照。

- `serverExternalPackages` 削除
- `rewrites` 削除
- `output: 'standalone'`, `outputFileTracingRoot`, `turbopack.root` のみ残す

```bash
git add apps/web/next.config.ts
git commit -m "refactor(web): remove rewrites and serverExternalPackages from next.config"
```

**Commit 6-3: tsconfig.dist.json 削除**

```bash
rm apps/web/tsconfig.dist.json
git add apps/web/tsconfig.dist.json
git commit -m "chore(web): remove tsconfig.dist.json (no longer needed)"
```

**Commit 6-4: apps/web type-check / build 検証**

```bash
npm run type-check -w @minimalcorp/tsunagi-web
npm run lint -w @minimalcorp/tsunagi-web
npm run build -w @minimalcorp/tsunagi-web
# .next/standalone/apps/web/server.js が出ることを確認
```

**もし `"type": "module"` で build が壊れる場合の fallback**:

```bash
cd apps/web
npm pkg delete type
cd ../..
npm run build -w @minimalcorp/tsunagi-web
git add apps/web/package.json
git commit -m "fix(web): remove type:module due to build incompatibility"
```

### Phase 7: UI から Fastify を直接叩くように

**Commit 7-1: api-url.ts 新設**

§11.8 のスニペットで `apps/web/src/lib/api-url.ts` 新規作成。

```bash
git add apps/web/src/lib/api-url.ts
git commit -m "feat(web): add api-url helper for Fastify direct access"
```

**Commit 7-2: 全 fetch 呼び出しを apiUrl() に置換**

§5.1 のリスト全件を `fetch(apiUrl('/api/...'))` に置換。
§5.2 のリスト全件を以下のように置換:

- `http://localhost:2792/tasks/validate` → `apiUrl('/api/tasks/validate')`
- `http://localhost:2792/tasks` → `apiUrl('/api/tasks')`
- `${FASTIFY_API_BASE}/api/...` → `apiUrl('/api/...')`
- `const FASTIFY_API_BASE = 'http://localhost:2792'` を削除し `import { apiUrl, getServerUrl } from '@/lib/api-url'`

各ファイルで `import { apiUrl } from '@/lib/api-url'` を追加。

```bash
# 編集後
npm run lint -w @minimalcorp/tsunagi-web
npm run type-check -w @minimalcorp/tsunagi-web
npm run build -w @minimalcorp/tsunagi-web
git add apps/web/src
git commit -m "refactor(web): route all fetch calls through api-url helper"
```

**Commit 7-3: Socket.IO の URL 透過化**

`useTerminalTodos.ts`, `useTaskEvents.ts`, `useTabStatusEvents.ts`, `TerminalView.tsx` の `io(FASTIFY_API_BASE, ...)` を `io(getServerUrl(), ...)` に置換。各ファイルで `import { getServerUrl } from '@/lib/api-url'`。

```bash
git add apps/web/src
git commit -m "refactor(web): use getServerUrl() for Socket.IO connections"
```

**Commit 7-4: 検証**

```bash
grep -rn "localhost:2792" apps/web/src   # api-url.ts のみがヒットすればOK
grep -rn "localhost:2791" apps/web/src   # ヒットゼロを期待
npm run lint -w @minimalcorp/tsunagi-web
npm run type-check -w @minimalcorp/tsunagi-web
npm run build -w @minimalcorp/tsunagi-web
```

### Phase 8: 統合検証 + リリース準備

**Commit 8-1: root package.json 更新**

§11.1 を参照して root scripts を整理。

```bash
git add package.json
git commit -m "build(root): update workspace orchestration scripts"
```

**Commit 8-2: 全体 build**

```bash
# クリーンビルド
rm -rf packages/shared/dist apps/server/dist apps/web/.next apps/cli/dist apps/cli/.next apps/cli/prisma apps/cli/prisma.config.ts

# 順番に build
npm run build -w @minimalcorp/tsunagi-shared
npm run build -w @minimalcorp/tsunagi-server
npm run build -w @minimalcorp/tsunagi-web
npm run build -w @minimalcorp/tsunagi
node apps/cli/scripts/bundle.mjs

# 成果物確認
ls packages/shared/dist/
ls apps/server/dist/
ls apps/server/dist/generated/prisma/
ls apps/web/.next/standalone/apps/web/
ls apps/cli/dist/
ls apps/cli/dist/server/
ls apps/cli/dist/server/generated/prisma/
ls apps/cli/.next/standalone/apps/web/
ls apps/cli/prisma/
cat apps/cli/prisma.config.ts
cat apps/cli/tsunagi-marketplace/plugins/tsunagi-plugin/.claude-plugin/plugin.json | grep -E "hooks/claude|mcp"

# Prisma client が ESM で load 可能か
node --input-type=module -e "import('./apps/cli/dist/server/generated/prisma/client.js').then(m=>console.log(Object.keys(m).slice(0,5)))"
```

**Commit 8-3: npm pack ドライラン**

```bash
cd apps/cli
npm pack --dry-run
# 期待する files が全て含まれていることを確認:
# - dist/cli.js, dist/auto-migrate.js, ...
# - dist/server/index.js, dist/server/lib/**, dist/server/generated/prisma/**
# - .next/standalone/apps/web/server.js
# - prisma/schema.prisma, prisma/migrations/**
# - prisma.config.ts
# - tsunagi-marketplace/plugins/**/plugin.json
# - scripts/fix-node-pty-permissions.cjs
# - LICENSE, README.md
cd ../..
```

**Commit 8-4: 別ディレクトリ install テスト**

```bash
cd apps/cli
npm pack
mv minimalcorp-tsunagi-*.tgz /tmp/

mkdir -p /tmp/tsunagi-0.0.5-test
cd /tmp/tsunagi-0.0.5-test
npm install -g /tmp/minimalcorp-tsunagi-*.tgz

export TSUNAGI_DATA_DIR=/tmp/tsunagi-0.0.5-data
tsunagi
# Fastify 起動: "Fastify server running on port 2792"
# Next.js 起動: "Local: http://localhost:2791"
# ブラウザで http://localhost:2791 を開いて手動検証 (§13)
```

**Commit 8-5: バージョン bump**

```bash
cd apps/cli
npm pkg set version=0.0.5
cd ../..
git add apps/cli/package.json
git commit -m "chore(release): bump @minimalcorp/tsunagi to 0.0.5"
```

**Commit 8-6: refactoring-plan.md の扱い**

PR review 中は plan を残す。マージ前に削除するか docs/ に移動するかをユーザーと相談。

---

## §11. 実装スニペット (新規ファイル / 修正の完全版)

### §11.1. root package.json

```json
{
  "name": "tsunagi-monorepo",
  "version": "0.0.0",
  "private": true,
  "description": "Monorepo for Tsunagi — multi-repo GitHub project management with Claude AI integration.",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/minimalcorp/tsunagi.git"
  },
  "author": "minimalcorp",
  "license": "SEE LICENSE IN LICENSE",
  "engines": {
    "node": ">=20"
  },
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev -w @minimalcorp/tsunagi",
    "web:dev": "npm run dev -w @minimalcorp/tsunagi-web",
    "server:dev": "npm run dev -w @minimalcorp/tsunagi-server",
    "docs:dev": "npm run dev -w tsunagi-docs",
    "build": "npm run build -w @minimalcorp/tsunagi-shared && npm run build -w @minimalcorp/tsunagi-server && npm run build -w @minimalcorp/tsunagi-web && npm run build -w @minimalcorp/tsunagi && node apps/cli/scripts/bundle.mjs",
    "lint": "npm run lint --workspaces --if-present",
    "type-check": "npm run type-check --workspaces --if-present",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "prepare": "husky"
  },
  "devDependencies": {
    "concurrently": "^9.2.1",
    "husky": "^9.1.7",
    "lint-staged": "^16.2.7",
    "prettier": "^3.7.4"
  },
  "lint-staged": {
    "**/*.{js,jsx,ts,tsx,cjs,mjs,json,md,mdx,css,yml,yaml}": ["prettier --write"]
  }
}
```

### §11.2. packages/shared

**package.json**:

```json
{
  "name": "@minimalcorp/tsunagi-shared",
  "version": "0.0.0",
  "private": true,
  "description": "Shared TypeScript types for tsunagi monorepo",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist/**/*", "src/**/*"],
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "type-check": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  }
}
```

**tsconfig.json**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**src/index.ts**:

```ts
export * from './types.js';
```

**src/types.ts**: 旧 `apps/web/src/lib/types.ts` の内容をそのまま (interface 定義のみ)。

### §11.3. apps/server

**package.json**:

```json
{
  "name": "@minimalcorp/tsunagi-server",
  "version": "0.0.0",
  "private": true,
  "description": "Fastify API server for tsunagi",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "npm run db:generate && tsc -p tsconfig.json",
    "clean": "rm -rf dist src/generated",
    "db:generate": "prisma generate && tsx scripts/patch-prisma-generated.ts",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "db:backup": "tsx scripts/db-backup.ts",
    "db:restore": "tsx scripts/db-restore.ts",
    "db:migrate-from-json": "tsx scripts/migrate-to-sqlite.ts",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@fastify/cors": "^11.2.0",
    "@libsql/client": "0.8.1",
    "@minimalcorp/tsunagi-shared": "*",
    "@modelcontextprotocol/sdk": "^1.27.1",
    "@prisma/adapter-libsql": "^7.3.0",
    "@prisma/client": "^7.3.0",
    "dotenv": "^17.2.3",
    "fastify": "^5.8.2",
    "fastify-socket.io": "^5.1.0",
    "node-pty": "^1.1.0",
    "prisma": "^7.3.0",
    "simple-git": "^3.30.0",
    "socket.io": "^4.8.3",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.19.30",
    "@types/uuid": "^10.0.0",
    "eslint": "^9",
    "tsx": "^4.21.0",
    "typescript": "5.9.3"
  }
}
```

**tsconfig.json**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "declaration": false,
    "sourceMap": false,
    "resolveJsonModule": true,
    "noEmit": false,
    "allowJs": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**eslint.config.mjs**: apps/web の eslint.config.mjs から `eslint-config-next` 系を除いて Node.js 用に minimal 化。

**prisma/schema.prisma の冒頭**:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlite"
}

// (以下既存の model 定義は変更なし)
```

### §11.4. apps/server/scripts/patch-prisma-generated.ts

```ts
/**
 * Patch Prisma 7 generated client files to add `.js` extensions to relative imports.
 *
 * Why: Prisma 7.6 の `prisma-client` generator は ESM 前提 (`import.meta.url` を
 * 使用) で .ts を生成するが、相対 import に `.js` 拡張子を付けないため
 * `moduleResolution: nodenext` + `"type": "module"` 環境では型解決に失敗し、
 * `@ts-nocheck` の影響で型エラーが握りつぶされて全てが `any` になる。
 *
 * This script rewrites every relative `import` / `export` specifier in
 * `src/generated/prisma/**\/*.ts` to append `.js`, making the files valid for
 * NodeNext resolution. Idempotent.
 *
 * 呼び出し元: `db:generate` npm script (prisma generate 直後に実行)。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
// apps/server/scripts/patch-prisma-generated.ts → ../src/generated/prisma
const GENERATED_DIR = path.resolve(THIS_DIR, '..', 'src', 'generated', 'prisma');

// Matches `from '...'` / `from "..."` specifiers that are relative (start with
// `./` or `../`) and do NOT already end with `.js` / `.mjs` / `.cjs` / `.json`.
const IMPORT_RE = /(\bfrom\s*['"])(\.\.?\/[^'"]*?)(['"])/g;

function patchFile(filePath: string): boolean {
  const original = fs.readFileSync(filePath, 'utf8');
  const patched = original.replace(IMPORT_RE, (match, prefix, spec, suffix) => {
    if (/\.(js|mjs|cjs|json)$/.test(spec)) return match;
    return `${prefix}${spec}.js${suffix}`;
  });
  if (patched !== original) {
    fs.writeFileSync(filePath, patched, 'utf8');
    return true;
  }
  return false;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(p));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

function main(): void {
  if (!fs.existsSync(GENERATED_DIR)) {
    console.error(`[patch-prisma-generated] No generated dir at ${GENERATED_DIR}`);
    process.exit(1);
  }

  const files = walk(GENERATED_DIR);
  let changed = 0;
  for (const file of files) {
    if (patchFile(file)) changed += 1;
  }
  console.log(`[patch-prisma-generated] patched ${changed}/${files.length} file(s)`);
}

main();
```

### §11.5. apps/cli

**package.json**:

```json
{
  "name": "@minimalcorp/tsunagi",
  "version": "0.0.5",
  "description": "Multi-repo GitHub project management with Claude AI integration, designed for visualizing and controlling AI-driven development locally.",
  "keywords": [
    "tsunagi",
    "claude",
    "claude-code",
    "ai",
    "agent",
    "task-management",
    "worktree",
    "github",
    "developer-tools"
  ],
  "homepage": "https://github.com/minimalcorp/tsunagi#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/minimalcorp/tsunagi.git"
  },
  "bugs": {
    "url": "https://github.com/minimalcorp/tsunagi/issues"
  },
  "author": "minimalcorp",
  "license": "SEE LICENSE IN LICENSE",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "os": ["darwin", "linux"],
  "bin": {
    "tsunagi": "./dist/cli.js"
  },
  "files": [
    "dist/**/*",
    ".next/standalone/**/*",
    "prisma/**/*",
    "prisma.config.ts",
    "tsunagi-marketplace/**/*",
    "scripts/fix-node-pty-permissions.cjs",
    "LICENSE",
    "README.md"
  ],
  "scripts": {
    "dev": "tsx src/with-plugin.ts dev",
    "start": "tsx src/with-plugin.ts start",
    "build": "tsc -p tsconfig.json && chmod +x dist/cli.js",
    "bundle": "node scripts/bundle.mjs",
    "prepack": "node scripts/bundle.mjs",
    "postinstall": "node scripts/fix-node-pty-permissions.cjs",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@fastify/cors": "^11.2.0",
    "@libsql/client": "0.8.1",
    "@modelcontextprotocol/sdk": "^1.27.1",
    "@prisma/adapter-libsql": "^7.3.0",
    "@prisma/client": "^7.3.0",
    "dotenv": "^17.2.3",
    "fastify": "^5.8.2",
    "fastify-socket.io": "^5.1.0",
    "node-pty": "^1.1.0",
    "prisma": "^7.3.0",
    "simple-git": "^3.30.0",
    "socket.io": "^4.8.3",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.19.30",
    "@types/uuid": "^10.0.0",
    "concurrently": "^9.2.1",
    "eslint": "^9",
    "tsx": "^4.21.0",
    "typescript": "5.9.3"
  }
}
```

**tsconfig.json**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "declaration": false,
    "sourceMap": false,
    "resolveJsonModule": true,
    "noEmit": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### §11.6. apps/cli/scripts/bundle.mjs

```javascript
#!/usr/bin/env node
/**
 * prepack / bundle script for @minimalcorp/tsunagi (apps/cli).
 *
 * Copies build artifacts from sibling workspaces (apps/server, apps/web)
 * into apps/cli/ so that `npm pack` produces a self-contained tarball that
 * can be installed via `npm install -g @minimalcorp/tsunagi`.
 *
 * Required prior steps:
 *   1. npm run build -w @minimalcorp/tsunagi-shared
 *   2. npm run build -w @minimalcorp/tsunagi-server
 *   3. npm run build -w @minimalcorp/tsunagi-web
 *   4. npm run build -w @minimalcorp/tsunagi  (compiles dist/cli.js etc.)
 *
 * This script runs as the FINAL step (or via prepack) and only does file
 * copying, no compilation.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.resolve(SCRIPTS_DIR, '..');
const REPO_ROOT = path.resolve(CLI_DIR, '..', '..');

const SERVER_DIR = path.join(REPO_ROOT, 'apps/server');
const WEB_DIR = path.join(REPO_ROOT, 'apps/web');

function log(msg) {
  console.log(`[bundle] ${msg}`);
}

async function ensurePrereqs() {
  const requirements = [
    [
      path.join(CLI_DIR, 'dist/cli.js'),
      'apps/cli must be built (run `npm run build -w @minimalcorp/tsunagi`)',
    ],
    [
      path.join(SERVER_DIR, 'dist/index.js'),
      'apps/server must be built (run `npm run build -w @minimalcorp/tsunagi-server`)',
    ],
    [
      path.join(SERVER_DIR, 'dist/generated/prisma/client.js'),
      'apps/server prisma client must be generated and built',
    ],
    [
      path.join(WEB_DIR, '.next/standalone/apps/web/server.js'),
      'apps/web standalone build must exist (run `npm run build -w @minimalcorp/tsunagi-web`)',
    ],
    [path.join(WEB_DIR, '.next/static'), 'apps/web .next/static must exist'],
    [path.join(SERVER_DIR, 'prisma/schema.prisma'), 'apps/server/prisma/schema.prisma must exist'],
    [path.join(SERVER_DIR, 'prisma.config.ts'), 'apps/server/prisma.config.ts must exist'],
  ];
  for (const [p, msg] of requirements) {
    if (!existsSync(p)) {
      throw new Error(`[bundle] missing: ${p}\n  ${msg}`);
    }
  }
}

async function copyDir(src, dest) {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function cleanCliBundleDirs() {
  const dirs = [
    path.join(CLI_DIR, 'dist/server'),
    path.join(CLI_DIR, '.next'),
    path.join(CLI_DIR, 'prisma'),
  ];
  const files = [path.join(CLI_DIR, 'prisma.config.ts')];
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true });
  for (const f of files) await fs.rm(f, { force: true });
}

async function main() {
  log('checking prerequisites');
  await ensurePrereqs();

  log('cleaning previous bundle outputs');
  await cleanCliBundleDirs();

  log('copying apps/server/dist → apps/cli/dist/server');
  await copyDir(path.join(SERVER_DIR, 'dist'), path.join(CLI_DIR, 'dist/server'));

  log('copying apps/server/prisma → apps/cli/prisma');
  await copyDir(path.join(SERVER_DIR, 'prisma'), path.join(CLI_DIR, 'prisma'));

  log('copying apps/server/prisma.config.ts → apps/cli/prisma.config.ts');
  await copyFile(path.join(SERVER_DIR, 'prisma.config.ts'), path.join(CLI_DIR, 'prisma.config.ts'));

  log('copying apps/web/.next/standalone → apps/cli/.next/standalone');
  await copyDir(path.join(WEB_DIR, '.next/standalone'), path.join(CLI_DIR, '.next/standalone'));

  log('copying apps/web/.next/static → apps/cli/.next/standalone/apps/web/.next/static');
  await copyDir(
    path.join(WEB_DIR, '.next/static'),
    path.join(CLI_DIR, '.next/standalone/apps/web/.next/static')
  );

  log('done');
}

main().catch((err) => {
  console.error('[bundle] failed:', err);
  process.exit(1);
});
```

### §11.7. apps/web

**package.json (after)**:

```json
{
  "name": "@minimalcorp/tsunagi-web",
  "version": "0.0.0",
  "private": true,
  "description": "Next.js UI for tsunagi",
  "type": "module",
  "scripts": {
    "dev": "next dev -p 2791",
    "build": "next build",
    "start": "next start -p 2791",
    "lint": "eslint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@base-ui/react": "^1.3.0",
    "@hello-pangea/dnd": "^18.0.1",
    "@minimalcorp/tsunagi-shared": "*",
    "@monaco-editor/react": "^4.7.0",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/xterm": "^6.0.0",
    "@xyflow/react": "^12.10.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "lucide-react": "^0.562.0",
    "mermaid": "^11.14.0",
    "monaco-editor": "^0.55.1",
    "next": "^16.1.6",
    "next-themes": "^0.4.6",
    "react": "19.2.1",
    "react-dom": "19.2.1",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "shadcn": "^4.1.0",
    "socket.io-client": "^4.8.3",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20.19.30",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/trusted-types": "^2.0.7",
    "eslint": "^9",
    "eslint-config-next": "16.0.10",
    "eslint-config-prettier": "^10.1.8",
    "tailwindcss": "^4",
    "typescript": "5.9.3"
  }
}
```

**next.config.ts (after)**:

```ts
import type { NextConfig } from 'next';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(CONFIG_DIR, '..', '..');

const nextConfig: NextConfig = {
  // Emit a self-contained production build at .next/standalone so the npm
  // package can ship without bundling the full node_modules tree.
  output: 'standalone',
  // In npm workspaces, Turbopack and the standalone tracer must agree on a
  // single workspace root. The hoisted node_modules lives at the monorepo
  // root, so both have to anchor there. The resulting standalone layout is
  // nested at .next/standalone/apps/web/server.js.
  outputFileTracingRoot: MONOREPO_ROOT,
  turbopack: {
    root: MONOREPO_ROOT,
  },
};

export default nextConfig;
```

### §11.8. apps/web/src/lib/api-url.ts

```ts
/**
 * Resolve the base URL of the tsunagi-server (Fastify) instance.
 *
 * - Browser: ユーザがアクセスしている hostname + Fastify の固定ポート (2792)
 *   これにより localhost / LAN / SSH tunnel いずれの経路でも動く。
 * - Node.js (SSR / Server Components): 環境変数 `NEXT_PUBLIC_TSUNAGI_SERVER_URL` か
 *   フォールバックの `http://localhost:2792`。
 *
 * tsunagi は完全 local-only のアプリで、Web UI (port 2791) から Fastify
 * (port 2792) を直接呼ぶ。Next.js には rewrites を一切書かないため、UI
 * 側のすべての fetch / Socket.IO 接続はこのヘルパ経由にする。
 */

const FASTIFY_PORT = 2792;

export function getServerUrl(): string {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${FASTIFY_PORT}`;
  }
  return process.env.NEXT_PUBLIC_TSUNAGI_SERVER_URL ?? `http://localhost:${FASTIFY_PORT}`;
}

/**
 * Compose a fully qualified URL for an API endpoint.
 *
 * @example
 *   apiUrl('/api/tasks')                  → http://localhost:2792/api/tasks
 *   apiUrl('/api/tasks/' + id + '/tabs')  → http://localhost:2792/api/tasks/<id>/tabs
 */
export function apiUrl(pathWithLeadingSlash: string): string {
  return `${getServerUrl()}${pathWithLeadingSlash}`;
}
```

### §11.9. Fastify CORS update

`apps/server/src/index.ts` の CORS register:

```ts
await fastify.register(fastifyCors, {
  origin: ['http://localhost:2791'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
```

`PUT`, `PATCH` を追加 (旧 Next.js API routes が PUT/PATCH を使っていたため)。

### §11.10. fastify-socket.io interop

`apps/server/src/index.ts` の冒頭:

```ts
import Fastify, { type FastifyPluginAsync, type FastifyPluginOptions } from 'fastify';
import fastifyCors from '@fastify/cors';
// fastify-socket.io is CJS (`module.exports = __toCommonJS(...)`). Under
// `"type": "module"` + nodenext resolution, the default import evaluates to
// the whole `module.exports` namespace, not the `default` key, so we have to
// unwrap it manually to get the actual Fastify plugin callable.
import * as fastifySocketIONs from 'fastify-socket.io';
const fastifySocketIO = ((
  fastifySocketIONs as unknown as { default?: FastifyPluginAsync<FastifyPluginOptions> }
).default ??
  (fastifySocketIONs as unknown as FastifyPluginAsync<FastifyPluginOptions>)) as FastifyPluginAsync<FastifyPluginOptions>;
```

### §11.11. simple-git named import

`apps/server/src/lib/worktree-manager.ts`:

```ts
import { simpleGit, type SimpleGit } from 'simple-git';
```

`apps/server/src/lib/services/task-service.ts`:

```ts
import { simpleGit } from 'simple-git';
```

理由: `import simpleGit from 'simple-git'` (default import) は `"type": "module"` + nodenext で正しく callable にならない (CJS パッケージの module.exports 全体が返るため)。simple-git は named export `simpleGit` を提供しているので named import を使う。

### §11.12. apps/cli/src/with-plugin.ts (dev orchestration)

```ts
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { cleanupPluginState, ensureCleanPluginState } from './plugin-lifecycle.js';

/**
 * Development wrapper:
 *   1. Install Claude Code plugin (clean install)
 *   2. Spawn `npm run dev -w @minimalcorp/tsunagi-web` and
 *      `npm run dev -w @minimalcorp/tsunagi-server` concurrently
 *
 * Used by `npm run dev` (root) → `npm run dev -w @minimalcorp/tsunagi`
 * → `tsx src/with-plugin.ts dev`.
 */

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'start') {
  console.error('Usage: tsx src/with-plugin.ts <dev|start>');
  process.exit(1);
}

let cleanedUp = false;
function cleanup(): void {
  if (cleanedUp) return;
  cleanedUp = true;
  cleanupPluginState();
}

ensureCleanPluginState();

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});
process.on('exit', () => {
  cleanup();
});
process.on('uncaughtException', (err) => {
  console.error('[tsunagi] Uncaught exception:', err);
  cleanup();
  process.exit(1);
});

const webCmd =
  mode === 'dev'
    ? 'npm run dev -w @minimalcorp/tsunagi-web'
    : 'npm run start -w @minimalcorp/tsunagi-web';
const serverCmd =
  mode === 'dev'
    ? 'npm run dev -w @minimalcorp/tsunagi-server'
    : 'npm exec --workspace @minimalcorp/tsunagi-server tsx src/index.ts';

const child = spawn(
  'npx',
  [
    'concurrently',
    '--kill-others',
    '--names',
    'web,server',
    '--prefix-colors',
    'blue,green',
    `"${webCmd}"`,
    `"${serverCmd}"`,
  ],
  {
    stdio: 'inherit',
    shell: true,
  }
);

child.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
```

### §11.13. apps/cli/src/cli.ts のパス解決

```ts
#!/usr/bin/env node
import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupPluginState, ensureCleanPluginState } from './plugin-lifecycle.js';
import { acquireSingleInstanceLock } from './single-instance-lock.js';

/**
 * Production CLI entrypoint shipped as `bin` in @minimalcorp/tsunagi.
 *
 * Layout when installed via npm:
 *
 *   <pkg>/dist/cli.js                            ← this file
 *   <pkg>/dist/auto-migrate.js
 *   <pkg>/dist/plugin-lifecycle.js
 *   <pkg>/dist/single-instance-lock.js
 *   <pkg>/dist/server/index.js                   ← Fastify entry (bundled from apps/server/dist)
 *   <pkg>/dist/server/lib/**
 *   <pkg>/dist/server/generated/prisma/**
 *   <pkg>/.next/standalone/apps/web/server.js    ← Next.js standalone entry (bundled from apps/web/.next/standalone)
 *   <pkg>/.next/standalone/apps/web/.next/static/
 *   <pkg>/.next/standalone/node_modules/
 *   <pkg>/prisma/schema.prisma
 *   <pkg>/prisma.config.ts
 *   <pkg>/tsunagi-marketplace/plugins/tsunagi-plugin/.claude-plugin/plugin.json
 */

if (process.platform !== 'darwin' && process.platform !== 'linux') {
  console.error(`[tsunagi] Unsupported platform: ${process.platform}`);
  console.error('[tsunagi] Tsunagi currently supports macOS and Linux only.');
  process.exit(1);
}

acquireSingleInstanceLock();

const DIST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(DIST_DIR, '..');
const AUTO_MIGRATE_JS = path.join(DIST_DIR, 'auto-migrate.js');
const FASTIFY_ENTRY_JS = path.join(DIST_DIR, 'server', 'index.js');
const NEXT_STANDALONE_ENTRY = path.join(
  PACKAGE_ROOT,
  '.next',
  'standalone',
  'apps',
  'web',
  'server.js'
);

function runAutoMigrate(): void {
  if (!fs.existsSync(AUTO_MIGRATE_JS)) {
    console.error(`[tsunagi] Missing build artifact: ${AUTO_MIGRATE_JS}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [AUTO_MIGRATE_JS], {
    stdio: 'inherit',
    cwd: PACKAGE_ROOT,
  });
  if (result.status !== 0) {
    console.error('[tsunagi] Database migration failed.');
    process.exit(result.status ?? 1);
  }
}

runAutoMigrate();
ensureCleanPluginState();

function verifyArtifact(p: string, label: string): void {
  if (!fs.existsSync(p)) {
    console.error(`[tsunagi] Missing ${label}: ${p}`);
    console.error('[tsunagi] The package appears to be incomplete. Please reinstall.');
    process.exit(1);
  }
}

verifyArtifact(FASTIFY_ENTRY_JS, 'Fastify server artifact');
verifyArtifact(NEXT_STANDALONE_ENTRY, 'Next.js standalone artifact');

const fastifyChild: ChildProcess = spawn(process.execPath, [FASTIFY_ENTRY_JS], {
  stdio: 'inherit',
  cwd: PACKAGE_ROOT,
  env: process.env,
});

const nextChild: ChildProcess = spawn(process.execPath, [NEXT_STANDALONE_ENTRY], {
  stdio: 'inherit',
  cwd: path.dirname(NEXT_STANDALONE_ENTRY),
  env: { ...process.env, PORT: process.env.PORT ?? '2791' },
});

let shuttingDown = false;
function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of [fastifyChild, nextChild]) {
    if (child && !child.killed && child.exitCode === null) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  }

  cleanupPluginState();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

fastifyChild.on('exit', (code) => {
  console.error(`[tsunagi] Fastify server exited with code ${code}`);
  shutdown(code ?? 1);
});
nextChild.on('exit', (code) => {
  console.error(`[tsunagi] Next.js server exited with code ${code}`);
  shutdown(code ?? 1);
});
```

### §11.14. apps/cli/src/plugin-lifecycle.ts (完全版)

```ts
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Claude Code plugin lifecycle management.
 *
 * Strategy: clean install on startup, unconditional uninstall on shutdown.
 *
 * - Uses only the `claude` CLI commands; no direct manipulation of
 *   `~/.claude/settings.json` or other internal files.
 * - On startup, any pre-existing tsunagi marketplace / plugin is considered
 *   an orphan from a previous abnormal termination and is cleaned up before
 *   installing a fresh copy. This is safe because tsunagi enforces single
 *   instance via the PID lock.
 * - On shutdown, uninstall is attempted unconditionally and failures are
 *   ignored so that cleanup never blocks process exit.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
// dev (tsx): apps/cli/src/plugin-lifecycle.ts → THIS_DIR = apps/cli/src
//   → ../tsunagi-marketplace = apps/cli/tsunagi-marketplace ✓
// prod (compiled): <pkg>/dist/plugin-lifecycle.js → THIS_DIR = <pkg>/dist
//   → ../tsunagi-marketplace = <pkg>/tsunagi-marketplace ✓

const MARKETPLACE_NAME = 'tsunagi-marketplace';
const PLUGIN_REF = `tsunagi-plugin@${MARKETPLACE_NAME}`;

function getMarketplaceDir(): string {
  const candidate = path.resolve(THIS_DIR, '..', 'tsunagi-marketplace');
  if (fs.existsSync(path.join(candidate, '.claude-plugin'))) {
    return candidate;
  }
  // Fallback for unexpected layouts
  return candidate;
}

function log(msg: string): void {
  console.log(`[tsunagi:plugin] ${msg}`);
}

/**
 * Run a `claude` CLI command. Returns true on success, false on failure.
 * stderr/stdout are suppressed to keep the startup log clean.
 */
function runClaude(args: string): boolean {
  try {
    execSync(`claude ${args}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a clean plugin state by removing any pre-existing tsunagi plugin /
 * marketplace registrations and then installing fresh copies.
 *
 * Exits the process with code 1 on install failure.
 */
export function ensureCleanPluginState(): void {
  // Phase 1: best-effort cleanup of any orphaned state from a previous run.
  runClaude(`plugin uninstall ${PLUGIN_REF}`);
  runClaude(`plugin marketplace remove ${MARKETPLACE_NAME}`);

  // Phase 2: clean install. Failures here are fatal.
  const marketplaceDir = getMarketplaceDir();
  if (!runClaude(`plugin marketplace add ${marketplaceDir}`)) {
    console.error('[tsunagi:plugin] Failed to add Claude Code marketplace.');
    console.error('[tsunagi:plugin] Ensure the `claude` CLI is installed and available on PATH.');
    console.error(`[tsunagi:plugin] Marketplace path: ${marketplaceDir}`);
    process.exit(1);
  }
  log('Marketplace added');

  if (!runClaude(`plugin install ${PLUGIN_REF} --scope user`)) {
    console.error('[tsunagi:plugin] Failed to install Claude Code plugin.');
    runClaude(`plugin marketplace remove ${MARKETPLACE_NAME}`);
    process.exit(1);
  }
  log('Plugin installed');
}

/**
 * Best-effort cleanup. Called on process shutdown. Never throws.
 */
export function cleanupPluginState(): void {
  runClaude(`plugin uninstall ${PLUGIN_REF}`);
  runClaude(`plugin marketplace remove ${MARKETPLACE_NAME}`);
}
```

### §11.14b. apps/cli/src/single-instance-lock.ts (完全版)

```ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Single instance lock using PID file.
 *
 * - Writes current PID to `<TSUNAGI_DATA_DIR>/state/tsunagi.lock` on acquire
 * - On startup, if lock file exists and its PID is alive, exits with error
 * - Stale locks (PID not alive) are removed automatically
 * - Lock is released on SIGINT / SIGTERM / exit
 */

function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
}

function getLockFilePath(): string {
  return path.join(getTsunagiDataDir(), 'state', 'tsunagi.lock');
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

let released = false;

function releaseLock(): void {
  if (released) return;
  released = true;
  const lockFilePath = getLockFilePath();
  try {
    const content = fs.readFileSync(lockFilePath, 'utf-8').trim();
    const pid = Number.parseInt(content, 10);
    if (pid === process.pid) {
      fs.unlinkSync(lockFilePath);
    }
  } catch {
    // ignore
  }
}

export function acquireSingleInstanceLock(): void {
  const lockFilePath = getLockFilePath();
  const stateDir = path.dirname(lockFilePath);
  fs.mkdirSync(stateDir, { recursive: true });

  if (fs.existsSync(lockFilePath)) {
    let existingPid = NaN;
    try {
      const content = fs.readFileSync(lockFilePath, 'utf-8').trim();
      existingPid = Number.parseInt(content, 10);
    } catch {
      // treat as stale
    }

    if (isPidAlive(existingPid)) {
      console.error(`[tsunagi] Another tsunagi is running (PID ${existingPid}).`);
      console.error(`[tsunagi] Lock file: ${lockFilePath}`);
      process.exit(1);
    }

    try {
      fs.unlinkSync(lockFilePath);
    } catch {
      // ignore
    }
  }

  fs.writeFileSync(lockFilePath, String(process.pid), 'utf-8');

  process.on('SIGINT', () => {
    releaseLock();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    releaseLock();
    process.exit(0);
  });
  process.on('exit', () => {
    releaseLock();
  });
  process.on('uncaughtException', (err) => {
    console.error('[tsunagi] Uncaught exception:', err);
    releaseLock();
    process.exit(1);
  });
}
```

### §11.15. apps/cli/src/auto-migrate.ts

```ts
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const execAsync = promisify(exec);

function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
}

function getStateDir(): string {
  return path.join(getTsunagiDataDir(), 'state');
}

async function autoMigrate() {
  try {
    console.log('DB migration started');
    await fs.mkdir(getStateDir(), { recursive: true });

    const { stdout } = await execAsync('npx prisma migrate deploy');
    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('Prisma schema loaded'));
    if (lines.length > 0) console.log(lines.join('\n'));
  } catch (error) {
    console.error('DB migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

autoMigrate();
```

**注**: 旧 apps/web 版にあった `prisma generate` 呼び出しは **不要** (apps/cli の bundle で client.ts は既に dist に含まれているため)。

---

## §12. リスクマトリクス

| #   | リスク                                                                                         | 影響                                 | 軽減策                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | `NextResponse.json` ↔ `reply.send` の差異で response shape が崩れる                            | UI 画面が壊れる                      | §9 の per-route テーブルの response shape を完全一致させる。Phase 8 で UI 主要画面を手動検証                                                           |
| R2  | Fastify dynamic route param mismatch                                                           | runtime エラー                       | Phase 4 で各 route の params 型 generic を厳密に書く (`FastifyRequest<{ Params: { id: string } }>`)                                                    |
| R3  | Fastify が空 body の POST を 415 でリジェクト                                                  | 一部 endpoint が壊れる               | route 実装で body オプショナル前提のチェックを入れる、もしくは UI 側が常に `Content-Type: application/json` を送るようにする                           |
| R4  | CORS preflight 失敗 (PUT/PATCH 漏れ)                                                           | UI から特定 method が呼べない        | §11.9 の通り CORS methods に PUT, PATCH を追加                                                                                                         |
| R5  | Socket.IO の WebSocket transport が CORS で弾かれる                                            | realtime 更新が壊れる                | Fastify の `fastifySocketIO` register 時の `cors.origin` に http://localhost:2791 を含める (既存)                                                      |
| R6  | Prisma 7 generator が再生成のたびに `.js` 拡張子を上書き → ビルド壊れる                        | 間欠失敗                             | `db:generate` script で `prisma generate && tsx scripts/patch-prisma-generated.ts` の sequence。patch script は idempotent (既に `.js` 付きはスキップ) |
| R7  | apps/cli の `dependencies` と apps/server の `dependencies` のバージョンずれ                   | 二重 install / 不整合                | 手動で同期。Phase 8-2 の build で問題が出たら確認                                                                                                      |
| R8  | apps/cli の bundle 漏れで tarball に必要ファイルが入らない                                     | install 後に Missing artifact エラー | Phase 8-3 の `npm pack --dry-run` でファイル一覧を目視確認                                                                                             |
| R9  | Next.js standalone trace が apps/server を含めてしまう                                         | bundle 肥大 / runtime エラー         | Phase 6-4 の build で .next/standalone/ サイズ確認。apps/web 側に server import が無ければ trace されない                                              |
| R10 | `setImmediate` で起動した background ジョブ (`/api/tasks/batch-delete`) の unhandled rejection | プロセスが落ちる                     | try/catch 徹底、エラーログ出力                                                                                                                         |
| R11 | Claude plugin URL 変更で既存 install が壊れる                                                  | hook 受信失敗                        | tsunagi 起動時の plugin clean install で自動反映 (`apps/cli/src/plugin-lifecycle.ts`)。リリースノートで言及                                            |
| R12 | apps/web `"type": "module"` で予期せぬ build エラー                                            | Next.js build 失敗                   | Phase 6-4 で検証。最悪 `"type"` 削除で fallback (B-7 参照)                                                                                             |
| R13 | shared package を `import type` のみで参照する前提が崩れて value import が混入                 | runtime で module not found          | grep で `import .* from '@minimalcorp/tsunagi-shared'` (type なし) を検索して確認                                                                      |
| R14 | bundle.mjs がクロスプラットフォーム互換でない                                                  | macOS と Linux で動作差              | Node.js 組み込み `fs.cp({ recursive: true })` のみ使用 (Node 16+)                                                                                      |
| R15 | `git mv` で git history が追いにくくなる                                                       | コードレビューで困難                 | git mv を使う / `git log --follow` を使う                                                                                                              |
| R16 | Phase 中間で apps/web ビルドが壊れる期間に CI が失敗                                           | PR チェック失敗                      | CI は phase ごとにこまめに走らせるよりも PR 全体の最終 commit でのみ通す方針                                                                           |

---

## §13. 検証チェックリスト

### 13.1 Phase ごと (incremental)

各 phase 完了時:

- [ ] 該当 workspace の `npm run lint` 通過
- [ ] 該当 workspace の `npm run type-check` 通過
- [ ] 該当 workspace の `npm run build` 通過 (該当する場合)

### 13.2 Phase 8 自動検証

```bash
# クリーン状態から
git status   # clean (or 修正 in progress)
npm install
npm run format:check
npm run lint
npm run type-check
npm run build   # shared → server → web → cli → bundle
```

ファイル存在チェック:

- [ ] `packages/shared/dist/index.js`, `index.d.ts`
- [ ] `apps/server/dist/index.js`
- [ ] `apps/server/dist/routes/{tasks,repos,env,worktrees,planner,commands,onboarding,internal,hooks,mcp,terminal,editor}.js`
- [ ] `apps/server/dist/lib/db.js`, `dist/lib/repositories/*.js`, `dist/lib/services/*.js`
- [ ] `apps/server/dist/generated/prisma/client.js`
- [ ] `apps/web/.next/standalone/apps/web/server.js`
- [ ] `apps/web/.next/static/` (Phase 6 build 後)
- [ ] `apps/cli/dist/cli.js`, `dist/auto-migrate.js`, `dist/plugin-lifecycle.js`, `dist/single-instance-lock.js`, `dist/with-plugin.js`
- [ ] `apps/cli/dist/server/index.js` (bundle 後)
- [ ] `apps/cli/dist/server/generated/prisma/client.js` (bundle 後)
- [ ] `apps/cli/.next/standalone/apps/web/server.js` (bundle 後)
- [ ] `apps/cli/prisma/schema.prisma` (bundle 後)
- [ ] `apps/cli/prisma.config.ts` (bundle 後)
- [ ] `apps/cli/tsunagi-marketplace/plugins/tsunagi-plugin/.claude-plugin/plugin.json` の URL に `/api/hooks/claude`, `/api/mcp` が含まれる

ESM load チェック:

- [ ] `node --input-type=module -e "import('./apps/cli/dist/server/generated/prisma/client.js').then(m=>console.log(Object.keys(m).slice(0,5)))"` で `[ '$Enums', 'Prisma', 'PrismaClient' ]` のような出力

grep チェック:

- [ ] `grep -rn "localhost:2792" apps/web/src` → `apps/web/src/lib/api-url.ts` だけがヒット
- [ ] `grep -rn "localhost:2791" apps/server/src` → ヒットゼロ
- [ ] `grep -rn "@/lib/db\|@/lib/repositories\|@/lib/services\|@/lib/worktree-manager\|@/lib/branch-utils" apps/web` → ヒットゼロ
- [ ] `find apps/web/src/app/api -type f` → 結果空 (api/ は存在しない)

`npm pack --dry-run` チェック:

```bash
cd apps/cli
npm pack --dry-run | tee /tmp/pack-output.txt
# 期待ファイル一覧:
grep -E 'dist/cli\.js|dist/auto-migrate\.js|dist/server/index\.js|\.next/standalone/apps/web/server\.js|prisma/schema\.prisma|prisma\.config\.ts|tsunagi-marketplace/.+/plugin\.json|fix-node-pty-permissions\.cjs' /tmp/pack-output.txt
```

### 13.3 Phase 8 手動統合検証

```bash
cd apps/cli
npm pack
mv minimalcorp-tsunagi-*.tgz /tmp/

mkdir -p /tmp/tsunagi-0.0.5-test
cd /tmp/tsunagi-0.0.5-test
npm install -g /tmp/minimalcorp-tsunagi-*.tgz

export TSUNAGI_DATA_DIR=/tmp/tsunagi-0.0.5-data
tsunagi
```

- [ ] Fastify 起動ログ: `Fastify server running on port 2792`
- [ ] Next.js 起動ログ: `Local: http://localhost:2791`
- [ ] DB が `/tmp/tsunagi-0.0.5-data/state/tsunagi.db` に作成される
- [ ] http://localhost:2791 にブラウザでアクセス → トップ画面表示
- [ ] リポジトリ追加 (`POST /api/repos`)
- [ ] タスク作成 (`POST /api/tasks`)
- [ ] タスク詳細画面表示
- [ ] Worktree 作成 (`POST /api/worktrees/create`)
- [ ] Worktree 削除
- [ ] Terminal 接続 (Socket.IO 経由、PTY 起動、入出力)
- [ ] 環境変数の追加 / 更新 / 削除 / toggle
- [ ] Planner パネル表示 + planner tab の作成
- [ ] Editor session (monaco editor) 動作
- [ ] Claude CLI から `mcp__tsunagi__tsunagi_list_tasks` 実行 → tool 応答が返る
- [ ] Claude CLI でコード実装 → hook が `/api/hooks/claude` に届いて tab status が `running` に → UI に realtime 反映
- [ ] `TSUNAGI_DATA_DIR` 環境変数を有効にして再起動 → 別の DB に切り替わる

### 13.4 回帰テスト

- [ ] `/api/terminal/*` の動作 (既存)
- [ ] `/api/editor/*` の動作 (既存)
- [ ] Socket.IO の全イベント: `task:created`, `task:updated`, `task:deleted`, `status-changed`, `output`, `todos-updated`, `exit`, `editor:open`

---

## §14. 既知の落とし穴 (Troubleshooting)

### 14.1 Prisma 7 generator は ESM 前提の `.ts` を出すが `.js` 拡張子を付けない

- 症状: `dist/.../client.js` で `exports is not defined in ES module scope`
- 原因: tsc `module: nodenext` 解決に必要な `.js` 拡張子が generator 出力に無い → `@ts-nocheck` で型エラーが握りつぶされて型が `any` になり、prisma 関連 module 全てが any に
- 対策: `apps/server/scripts/patch-prisma-generated.ts` を `db:generate` の後に必ず実行 (§11.4)

### 14.2 `fastify-socket.io` の CJS default import 問題

- 症状: `'typeof import(".../fastify-socket.io/dist/index")' provides no match for the signature ...`
- 原因: fastify-socket.io は CJS で `module.exports = __toCommonJS(src_exports)`。`"type": "module"` + nodenext で default import すると `module.exports` namespace 全体が返る
- 対策: §11.10 の通り `import * as ns from 'fastify-socket.io'` 後に `.default ?? ns` でアンラップ

### 14.3 `simple-git` の default import がコール不能になる

- 症状: `Type 'typeof import(".../simple-git/dist/typings/index")' has no call signatures`
- 原因: 同上 (CJS dual package、nodenext で default 取得が違う)
- 対策: §11.11 の通り named import `import { simpleGit } from 'simple-git'` を使う

### 14.4 Next.js standalone の WebSocket 透過性

- 知見: Next.js rewrites は WebSocket upgrade を透過転送しない
- 対策: rewrites を一切使わない方針 (B-5)。UI から Fastify を直接叩く (`getServerUrl()` 経由)

### 14.5 Prisma `prisma.config.ts` の cwd 依存

- 知見: Prisma CLI は cwd 直下の `prisma.config.ts` を読みに行く
- runtime: `apps/cli/src/cli.ts` が `auto-migrate.js` を `cwd: PACKAGE_ROOT` で spawn するため、`<pkg>/prisma.config.ts` が読まれる (bundle.mjs で apps/server/prisma.config.ts をコピー)
- 開発時: `npm run db:migrate -w @minimalcorp/tsunagi-server` は cwd = apps/server なので apps/server/prisma.config.ts が読まれる

### 14.6 `postinstall` で `prisma generate` を実行してはいけない

- 旧 apps/web/package.json は `postinstall` に `prisma generate` を入れていた
- これは published package に対して **実行する必要なし** (client.ts は既に bundle 済み)
- apps/cli/package.json の postinstall は `node scripts/fix-node-pty-permissions.cjs` のみ

### 14.7 Next.js + `"type": "module"` + Turbopack の `.js` 拡張子問題

- 症状: `Module not found: Can't resolve './foo.js'`
- 原因: Turbopack は `.js` 拡張子を literal に解決するため、`.ts` ファイルにマップしない
- 本 PR では: apps/web 内で `.js` 拡張子付き相対 import が一切残らない (server lib を全て移動するため) → 問題は発生しない見込み
- 万が一発生したら: `apps/web` の `"type": "module"` を削除 (B-7 fallback)

### 14.8 Node.js の `--experimental-detect-module`

- Node 22+ ではデフォルト ON
- `import.meta` を含む `.js` ファイルは ESM と判定される
- これが Prisma 7 client.js 問題のトリガー (§14.1)
- apps/server を ESM 化することで解決 (`"type": "module"` + nodenext)

### 14.9 `apps/cli` の dependencies が apps/server と二重宣言

- これは設計上必要 (B-2 参照)
- 同期は手動。version mismatch があると lockfile で警告されるので随時直す

### 14.10 `git mv` で大量にファイルを動かすと git history が分かりにくい

- `git log --follow <file>` で追跡可能
- レビューでは `git diff -M` (rename detection) を使うことを reviewer に伝える

### 14.11 prisma migrate 実行タイミング

- CI / publish では実行しない
- ユーザ環境でのみ `tsunagi` 起動時に `auto-migrate.ts` が `npx prisma migrate deploy` を実行
- 開発者は schema 変更時に手動で `npm run db:migrate -w @minimalcorp/tsunagi-server` (`prisma migrate dev`)

---

## §15. ドキュメントの寿命

- PR review 中は `refactoring-plan.md` をリポジトリに残す
- PR マージ前にユーザと相談して以下のいずれか:
  - (a) 削除
  - (b) `docs/architecture/monorepo-migration.md` 等に移動して履歴として残す

## §16. 開始前チェックリスト

新セッションがこのドキュメントを読んで作業を始める前に確認:

- [ ] §A〜§D を読み、TL;DR と決定事項を理解した
- [ ] §C-2 の git reset を実行する (現 worktree の in-flight 修正は捨てて refactoring-plan.md だけ残す)
- [ ] `npm install` を実行
- [ ] §10 の Phase 1 から順に commit していく
- [ ] 各 phase 完了時に lint / type-check / build を実行
- [ ] Phase 8 で別ディレクトリに `npm install -g` してエンドツーエンド検証
- [ ] 不明点があれば、`git log` でこのドキュメントの変更履歴を見る or ユーザに確認
