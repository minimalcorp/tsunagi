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

### CI（検証コマンド）は必ず Docker 内で実行する

- **CI（format / lint / type-check）はホストマシンで実行しない。必ず Docker container 内で実行する。**
- ホストには依存（node_modules）をインストールせず、`docker/compose.yml` の container 内に閉じる。
- 起動: `make up`（初回はビルド + `npm ci` で数分）。`node_modules` は named volume に保持される。
- 実行は `docker exec docker-tsunagi-1 ...` で container 内コマンドを叩く（下記「実行例」参照）。

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

CI は **Docker container 内**で実行する（ホストでは実行しない）。

```bash
# 起動（未起動の場合のみ。node_modules は volume に保持される）
make up

# フォーマット
docker exec docker-tsunagi-1 npm run format

# Lint
docker exec docker-tsunagi-1 npm run lint

# 型チェック
docker exec docker-tsunagi-1 npm run type-check
```

エラーがある場合はホスト側のファイルを修正し（リポジトリは container に mount 済み）、再度実行する。

## ローカル生成AI（画像・3D・効果音）との連携

tsunagiからComfyUI経由でローカルの画像/3D/効果音生成AIを呼び出す機能（`feat-local-llm-skill`）に関する方針。

### WSL2 / Windows ネイティブの役割分担

- **tsunagi本体・Claude Code CLIなど「直接使うツール」→ WSL2**（現状tsunagiはWSL2上でしか動作しない）
- **重いローカル推論（ComfyUI, Ollama, LM Studio等）→ Windowsネイティブ**
  - 理由1: WSL2は`.wslconfig`の`memory=`設定でRAMが絞られていることが多い（物理RAMの一部のみ）。モデルロードで大量RAMを使う処理はWSL内だと詰みやすい
  - 理由2: GPUドライバ自体はWindows本体のものをWSL2も共有するため、GPU処理はどちらでも動く。制約になるのは主にシステムRAM側
- **接続方法**: `.wslconfig`に`networkingMode=mirrored`を設定しておけば、WSL2から`http://localhost:8188`のようにポートフォワード不要で直接Windowsネイティブのサービスに到達できる
- **設計原則**: 「何を・どう生成するか」の判断ロジック（モデル選定、ワークフロー構築、パラメータ決定）はClaude Code（WSL2）側に置き、ComfyUI（Windowsネイティブ）は生成の実行エンジンとしてAPI越しに使う。ComfyUI本体を各プロジェクトのWSL内に個別インストールする旧パターン（`fumi-indoor-sprites`等）は非推奨・廃止

### 検証済みモデル（2026-09-29時点、RTX 3080 Ti / VRAM 12GB環境）

- **画像生成**: Z-Image Turbo（INT8量子化）。8 step・数秒で高品質。Apache系ライセンスで商用利用も可
  - 直近の新モデル候補Qwen-Image-2.1はResearch License（商用不可）のため不採用
- **3Dモデル生成（画像→3D）**: TRELLIS.2 + Pixal3D（ComfyUI 0.34+に同梱の60ノード超ワークフロー）。Hunyuan3D 2.1はテクスチャ込みでVRAM 29GB要求のため12GB環境では不採用
- **効果音生成**: Stable Audio Open 1.0。1秒前後の短いSFX生成に使用可能

### 参考実装

- `~/projects/comfyui-notes/comfy_api.py`: ComfyUI HTTP APIの薄いクライアント（`submit`/`wait`/`run`、SDXL系・DiT系(FLUX.2/Z-Image Turbo)ワークフロービルダー）。tsunagiからの呼び出し実装のベースとして再利用予定
- 複雑なワークフロー（サブグラフ・動的コンボを含むもの）をComfyUIの「Templates」からそのままAPI実行するには、UIグラフJSON→API実行形式（ノードid→{class_type, inputs}）への変換が必要。移植時の注意点:
  - `widgets_values`は、対応する入力がリンクで上書きされていても、スロットを1つ消費する（スキップしない）
  - INT型で`control_after_generate: true`が付く入力（例: KSamplerのseed）は、直後にUI専用のcombo値（"fixed"/"randomize"等）が1つ挿入される。これはバックエンドには渡らない
  - `COMFY_DYNAMICCOMBO_V3`型（例: RemeshMeshのsign_mode）は、選択値に応じて追加のサブフィールドが続く。API上のキー名は`親フィールド名.サブフィールド名`のドット区切り文字列になる

## Serena (MCP) 使用時の注意

- **Serenaはdockerで動いているため、プロジェクトのactivateは常に `.` を指定**
