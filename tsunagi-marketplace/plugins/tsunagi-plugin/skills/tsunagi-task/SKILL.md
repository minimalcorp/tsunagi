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

## 現在のタスクを特定する

タスク操作には `id`, `session_id`, `cwd` のいずれかでタスクを指定する。
優先順位: id > session_id > cwd

- **推奨**: 環境変数 `TSUNAGI_SESSION_ID` を `session_id` パラメータとして渡す
- **フォールバック**: `TSUNAGI_SESSION_ID` が未設定の場合、CWDを `cwd` パラメータとして渡す

## タスク操作

| 操作     | ツール              | タスク指定              | その他パラメータ                                                     |
| -------- | ------------------- | ----------------------- | -------------------------------------------------------------------- |
| 一覧取得 | tsunagi_list_tasks  | 不要                    | owner?, repo?, status?                                               |
| 詳細取得 | tsunagi_get_task    | id or session_id or cwd | -                                                                    |
| 作成     | tsunagi_create_task | 不要                    | owner, repo, title, branch?, description?, effort?, status?          |
| 更新     | tsunagi_update_task | id or session_id or cwd | title?, description?, status?, effort?, baseBranch?, pullRequestUrl? |
| 削除     | tsunagi_delete_task | id or session_id or cwd | -                                                                    |

## ブランチ命名規則

`branch`を省略するとtitleから自動生成されるが、短縮された意味不明な名前になりがちなため、**必ず`branch`を明示的に指定する**。

- タスク内容が一目でわかる具体的な名前にする
- `feat/`、`fix/`等のprefixを使用する
- 例: `feat/task-update-socket-notification`、`fix/duplicate-toast-on-create`

## 実装計画の管理

実装計画はタスクの `description` にPRD（Product Requirements Document）形式のmarkdownで記載・管理する。
ファイルシステム上に計画ファイルを作成しない。
`planning` 完了時点で `description` は完成していること。`coding` 中に計画変更があれば随時更新する。

## 注意事項

- `id`, `session_id`, `cwd` は優先順位に従い最初にマッチしたものでタスクを解決する
- 削除は論理削除（UIから復元する手段は提供されていない）
- `tsunagi_create_task` が失敗した場合、エラー内容をユーザーに報告するだけでよい（原因の深掘り不要）
