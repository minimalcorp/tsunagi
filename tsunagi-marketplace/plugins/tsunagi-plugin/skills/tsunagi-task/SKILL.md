---
name: tsunagi-task
description: プロジェクトのタスク管理ツール。タスクの検索・詳細取得・作成・更新・削除、現在担当タスクの特定、実装計画のdescriptionへの記録に使用する。
---

## 現在のタスクを特定する

タスク操作には `id`, `session_id`, `cwd` のいずれかでタスクを指定する。
優先順位: id > session_id > cwd

### 推奨: session_id を使う

環境変数 `TSUNAGI_SESSION_ID` が設定されている場合、これを `session_id` パラメータとして渡す。
tsunagiのタブから起動されたClaudeセッションでは常にこの環境変数が利用可能。

### フォールバック: cwd を使う

`TSUNAGI_SESSION_ID` が未設定の場合（worktreeで直接claude起動時）、CWDを `cwd` パラメータとして渡す。

## タスク操作

| 操作     | ツール              | タスク指定              | その他パラメータ                                                     |
| -------- | ------------------- | ----------------------- | -------------------------------------------------------------------- |
| 一覧取得 | tsunagi_list_tasks  | 不要                    | owner?, repo?, status?                                               |
| 詳細取得 | tsunagi_get_task    | id or session_id or cwd | -                                                                    |
| 作成     | tsunagi_create_task | 不要                    | owner, repo, title, branch?, description?, effort?, status?          |
| 更新     | tsunagi_update_task | id or session_id or cwd | title?, description?, status?, effort?, baseBranch?, pullRequestUrl? |
| 削除     | tsunagi_delete_task | id or session_id or cwd | -                                                                    |

## ステータス遷移

backlog → planning → coding → reviewing → done

ステータスは以下の条件で自動的に更新する。

| ステータス  | 意味                                   | 遷移タイミング                                 |
| ----------- | -------------------------------------- | ---------------------------------------------- |
| `backlog`   | 備忘録的に作成されたタスク             | タスク作成時のデフォルト                       |
| `planning`  | 計画の対話中〜計画完了                 | ユーザーと計画の対話を開始した時点             |
| `coding`    | 実装中（未完了）                       | ユーザーが実装を指示、または実装を開始した時点 |
| `reviewing` | 実装完了、動作確認・コードレビュー待ち | 全ての実装・検証が完了した時点                 |
| `done`      | PR作成〜マージまで全て完了             | PRがマージされた時点                           |

## ブランチ命名規則

`branch`を省略するとtitleから自動生成されるが、短縮された意味不明な名前になりがちなため、**必ず`branch`を明示的に指定する**。

- タスク内容が一目でわかる具体的な名前にする
- `feat/`、`fix/`等のprefixを使用する
- 例: `feat/task-update-socket-notification`、`fix/duplicate-toast-on-create`

## 注意事項

- `id`, `session_id`, `cwd` は優先順位に従い最初にマッチしたものでタスクを解決する
- 削除は論理削除（復元不可）
- `tsunagi_create_task` が失敗した場合、エラー内容をユーザーに報告するだけでよい（原因の深掘り不要）

## 実装計画の管理

実装計画はタスクの `description` にPRD（Product Requirements Document）形式のmarkdownで記載・管理する。
ファイルシステム上に計画ファイルを作成しない。
`planning` 完了時点で `description` は完成していること。`coding` 中に計画変更があれば随時更新する。
