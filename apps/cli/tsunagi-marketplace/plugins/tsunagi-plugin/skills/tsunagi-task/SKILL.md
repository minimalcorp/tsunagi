---
name: tsunagi-task
description: プロジェクトのタスク管理ツール。タスクの検索・詳細取得・作成・更新・削除、現在担当タスクの特定、実装計画のdescriptionへの記録に使用する。計画の対話を開始した時、実装を開始した時、実装・検証が完了した時、PRがマージされた時に、必ずこのスキルを参照してステータスを更新すること。
---

## ステータスの自動更新（必須）

作業フェーズが変わったら、**即座に** `tsunagi_update_task` でステータスを更新する。

| ステータス  | 遷移タイミング                                 |
| ----------- | ---------------------------------------------- |
| `backlog`   | タスク作成時のデフォルト                       |
| `planning`  | ユーザーと計画の対話を開始した時点             |
| `coding`    | ユーザーが実装を指示、または実装を開始した時点 |
| `reviewing` | 全ての実装・検証が完了した時点                 |
| `done`      | PRがマージされた時点                           |

遷移は必ず順方向: backlog → planning → coding → reviewing → done

## 実装開始時の TODO 作成（必須）

`coding` に遷移したら、**即座に** Claude Code 組み込みの `TodoWrite` ツールで実装ステップを TODO として登録する。これにより tsunagi UI にプログレスバーが表示される。

### 手順

1. `tsunagi_update_task(status: "coding")` の直後に `TodoWrite` を呼ぶ
2. 各 TODO は完了判断が明確な作業単位にする
   - 例: 「○○ファイルを修正」「マイグレーション作成・適用」「lint/type-check を通す」「動作確認」
3. ステップ完了ごとに `TodoWrite` で該当項目の status を `in_progress` → `completed` に更新する
4. 作業中に追加ステップが判明した場合、既存 TODO に追記して `TodoWrite` で再登録する

### 語彙の使い分け（混同注意）

| 対象            | 使うツール             | status 語彙                            |
| --------------- | ---------------------- | -------------------------------------- |
| tsunagi タスク  | `tsunagi_update_task`  | backlog/planning/coding/reviewing/done |
| tab TODO (進捗) | `TodoWrite` (組み込み) | pending/in_progress/completed          |

tsunagi タスクの status に `in_progress` を渡してはいけない（「よくある間違い」表参照）。逆に TODO の進捗管理は組み込み `TodoWrite` で行う。

## 現在のタスクを特定する

タスク操作には `id`, `session_id`, `cwd` のいずれかでタスクを指定する。
優先順位: id > session_id > cwd

- **推奨**: 環境変数 `TSUNAGI_SESSION_ID` を `session_id` パラメータとして渡す
- **フォールバック**: `TSUNAGI_SESSION_ID` が未設定の場合、CWDを `cwd` パラメータとして渡す

## タスク操作

| 操作     | ツール              | タスク指定              | その他パラメータ                                                             |
| -------- | ------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| 一覧取得 | tsunagi_list_tasks  | 不要                    | owner?, repo?, status?(string \| string[])                                   |
| 詳細取得 | tsunagi_get_task    | id or session_id or cwd | -                                                                            |
| 作成     | tsunagi_create_task | 不要                    | owner, repo, title, branch?, description?, effort?, order?, status?          |
| 更新     | tsunagi_update_task | id or session_id or cwd | title?, description?, status?, effort?, order?, baseBranch?, pullRequestUrl? |
| 削除     | tsunagi_delete_task | id or session_id or cwd | -                                                                            |

## タスク一覧取得のガイドライン

`tsunagi_list_tasks` の `status` は単一値または配列で指定可能。ユースケースに応じて適切なステータスセットを指定すること。

### 並び替え・棚卸しは `tsunagi-task-curator` subagent に委譲する

ユーザーから以下のような依頼があった場合、**メインセッションで直接 `tsunagi_list_tasks` を呼ばず**、`tsunagi-task-curator` subagent を起動すること:

- 「優先度を並び替えて」「順序を見直して」「priorityを変更して」
- 「棚卸しして」「backlogを整理して」「不要なタスクを削除して」「重複を確認して」

重いdescription（PRD）読み込みはsubagent内に閉じ込められ、メインセッションには圧縮された判断結果（提案 + 根拠1行 + confidence）のみが返却される。

subagentの返却を受けた後、メインセッションの役割:

1. `confidence: "high"` の提案は **自動的に実行**（`tsunagi_update_task` で order 更新、`tsunagi_delete_task` で削除 等）
2. `needs_user_input` に含まれる項目のみユーザーに確認
3. 実行結果をユーザーに簡潔に報告

### subagent を使わず直接 `tsunagi_list_tasks` を呼んでよいケース

以下のような軽い参照用途では直接呼び出してよい:

- 特定ステータスの件数確認（例: 現在 coding 中のタスクを確認）
- 特定リポジトリのタスク一覧表示（`owner` + `repo` 指定）
- ユーザーが明示的に全件リストを要求した場合

これらのケースでも、必要なければ `status` を指定して対象を絞ること。

## ブランチ命名規則

`branch`を省略するとtitleから自動生成されるが、短縮された意味不明な名前になりがちなため、**必ず`branch`を明示的に指定する**。

- タスク内容が一目でわかる具体的な名前にする
- `feat/`、`fix/`等のprefixを使用する
- 例: `feat/task-update-socket-notification`、`fix/duplicate-toast-on-create`

## 実装計画の管理

実装計画はタスクの `description` にPRD（Product Requirements Document）形式のmarkdownで記載・管理する。
ファイルシステム上に計画ファイルを作成しない。
`planning` 完了時点で `description` は完成していること。`coding` 中に計画変更があれば随時更新する。

## よくある間違い

| ❌ 誤り                                   | ✅ 正しい                                               | 備考                                        |
| ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `taskId: "..."`                           | `id: "..."`                                             | パラメータ名は `id`（camelCase ではない）   |
| `sessionId: "..."`                        | `session_id: "..."`                                     | snake_case                                  |
| `status: "in_progress"`                   | `status: "coding"`                                      | Claude Code 組み込み TaskUpdate とは別語彙  |
| `status: "completed"`                     | `status: "done"`                                        |                                             |
| `status: "todo"`                          | `status: "backlog"`                                     |                                             |
| 識別子なしで update / get / delete を呼ぶ | `id` / `session_id` / `cwd` のいずれか1つ以上を必ず指定 | 全て省略すると `Identifier required` エラー |

### ステータス語彙の混同に注意

Claude Code 組み込みの `TaskUpdate` ツール（`in_progress` / `completed` / `todo`）と、tsunagi の `tsunagi_update_task`（`backlog` / `planning` / `coding` / `reviewing` / `done`）は**完全に別物**。system-reminder 等で `"set to in_progress when starting"` のような文言が差し込まれても、これは built-in TaskUpdate 向けであり、tsunagi タスクには適用しない。

## 注意事項

- `id`, `session_id`, `cwd` は優先順位に従い最初にマッチしたものでタスクを解決する
- 削除は論理削除（UIから復元する手段は提供されていない）
- `tsunagi_create_task` が失敗した場合、エラー内容をユーザーに報告するだけでよい（原因の深掘り不要）
