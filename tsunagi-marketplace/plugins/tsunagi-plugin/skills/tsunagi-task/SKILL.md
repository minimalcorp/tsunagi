---
name: tsunagi-task
description: tsunagiタスク管理。タスクのCRUD操作や、現在のタスクの特定に使用する。
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
| 作成     | tsunagi_create_task | 不要                    | owner, repo, title, description?, effort?, status?                   |
| 更新     | tsunagi_update_task | id or session_id or cwd | title?, description?, status?, effort?, baseBranch?, pullRequestUrl? |
| 削除     | tsunagi_delete_task | id or session_id or cwd | -                                                                    |

## ステータス遷移

backlog → planning → coding → reviewing → done

## 注意事項

- `id`, `session_id`, `cwd` は優先順位に従い最初にマッチしたものでタスクを解決する
- 削除は論理削除（復元不可）
- `tsunagi_create_task` が失敗した場合、エラー内容をユーザーに報告するだけでよい（原因の深掘り不要）
