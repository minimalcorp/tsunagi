# Claude作業ルール

このファイルは、Claudeがこのプロジェクトで作業する際の重要なルールを定義します。

## ドキュメント作成の原則

- **最小限の文字量で必要なことを伝える**
- 冗長な説明を避け、簡潔かつ明確に記述する
- 詳細が必要な場合は、専用ドキュメントへのリンクを使用する

## UI実装のルール

- **絵文字ではなくアイコンを使用する**
- lucide-reactのアイコンを優先的に使用してUIを構築する
- アイコンのみで情報が伝わる場合は、アイコンのみで表現する
- アイコンだけでは理解が難しい場合は、最低限のテキストで補助する
- 複雑な情報は「？」アイコン + Tooltipなどで補助情報を提供する

## Reactのベストプラクティス

### 非同期状態の表現

- **`requestAnimationFrame` や `setTimeout` で描画タイミングを操作しない**
- 非同期リソース（WebSocket・fetch等）の状態はstateで管理し、Reactのレンダリングサイクルに委ねる
- リソースが準備できていない場合はローディングUIを表示し、準備できたらコンテンツを表示する

```tsx
// ❌ 避けるべき実装
useEffect(() => {
  ws.onopen = () => {
    requestAnimationFrame(() => {
      // タイミングに依存した描画
      term.write(buffer);
    });
  };
}, []);

// ✅ 推奨実装
// 状態をstateで管理し、条件付きレンダリングで表現する
const [isConnected, setIsConnected] = useState(false);

if (!isConnected) return <LoadingUI />;
return <ConnectedUI />;
```

### 条件付きレンダリング

- コンポーネントが依存するリソースが未準備の場合、そのコンポーネント自体をレンダリングしない
- `status === 'connected'` のような状態フラグで表示・非表示を制御する
- 「表示しながら中身だけ変える」より「状態に応じて別コンポーネントを出し分ける」を優先する

## デザインシステム

shadcn/ui preset `b2W68tmsa` 準拠。

### カラー

- OKLCH色空間、セマンティックペア（background/foreground, card/card-foreground 等）
- ステータス: success(緑), warning(黄), error(赤), info(青)

### スペーシング

- ヘッダー: `h-14 px-4`
- ページコンテナ: `px-4 py-4` (mobile), `md:px-6` (desktop)
- カード: `p-3`
- カラム: `p-2`
- カード間: `space-y-2`
- ダイアログ: `p-6 gap-4`

### アニメーション

- 操作(hover/press/focus): `130ms cubic-bezier(0.4, 0, 0.2, 1)`
- テーマ切替: `200ms`
- hover: `hover:bg-accent`（brightness filter不使用）
- press: `active:scale-95`
- focus: `ring-[3px] ring-ring/50`

### ボタンパターン

- Primary: `h-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90`
- Outline: `h-9 rounded-md border border-input bg-background shadow-xs hover:bg-accent`
- Ghost: `h-9 rounded-md hover:bg-accent`
- Destructive: `h-9 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90`
- Icon: `size-8 rounded-md hover:bg-accent`

### 入力パターン

- `h-9 rounded-md border border-input bg-transparent shadow-xs`

## データベースマイグレーション前の必須手順

`prisma migrate`, `prisma db push`, `prisma migrate reset` 等のDB変更コマンドを実行する前に、**必ず** `npm run db:backup` を先に実行すること。

これは複数Claudeプロセスが単一DBを共有する開発環境で、マイグレーション失敗時の復旧手段を確保するため。

バックアップは `~/.tsunagi/backups/yyyyMMddHHmmss.db` として保存され、直近5件が保持される。

### 復元手順

migrationやデータ破壊が発生した場合、最新バックアップから復元できる:

1. tsunagi サーバーを停止（Ctrl+C）
2. `npm run db:restore` を実行
3. `npm run dev` で再起動

`db:restore` は最新のバックアップを自動選択し、現在のDBを `tsunagi.db.broken-<timestamp>` に退避した上で復元する。

## Git操作のルール

- **作業完了後に勝手にcommitしない**
- ユーザーの明示的な指示があった場合のみcommitする
- 変更内容の確認をユーザーに促す

## ファイル変更後の検証

ファイル変更が完了した後、必ず以下を実行する：

1. **Prettier**: コードフォーマット
2. **ESLint**: コード品質チェック
3. **TypeScript**: 型チェック（`tsc --noEmit`）

## 動作確認

動作確認の必要がある場合、実際のnextサーバーを利用して動作確認を行う。
claude外でnextサーバーが起動している可能性があるので、まずはサーバーが起動しているかを確認し、
起動していればそれを利用、起動していなければ起動して、動作確認を行う

### プロセス管理の重要なルール

- **Claude外で起動されているプロセス（特にサーバー）を勝手にkillしない**
- 既に使用されているポートで動作しているプロセスは、ユーザーが意図的に起動したものである
- セッション内で自分が起動したプロセスは、作業完了時に適切にクリーンアップする
- バックグラウンドで起動したプロセスは、`TaskStop`ツールなどで停止する

### エラー発生時の対応

- エラーが発生した場合、原因の調査と修正を**再帰的**に行う
- 全てのチェックがsuccessするまで繰り返す
- 全てsuccessしたら作業完了とする

### 実行例

```bash
# フォーマット
npm run format

# Lint
npm run lint

# 型チェック
npm run type-check
```

エラーがある場合は修正し、再度実行する。

## Serena (MCP) 使用時の注意

- **Serenaはdockerで動いているため、プロジェクトのactivateは常に `.` を指定**
