---
name: markdown-viewer
description: 手順書・チェックリスト・作業計画など、ユーザーが読んだり手作業で進めたりする Markdown ファイルを作成・更新した時に使う。tsunagi の Markdown Viewer（GFM のタスクリスト・mermaid・alert 対応、チェックはファイルへ書き戻し）をタスク詳細のタブとして開き、URL を提示する。
---

## いつ使うか

ユーザー向けの Markdown ファイル（手順書・runbook・チェックリスト・作業計画・調査メモ等）を**ファイルとして書き出した直後**、または内容を大きく更新した時。

- コード中の README やドキュメント修正のような「リポジトリの成果物」には使わない（ユーザーが求めた場合を除く）
- tsunagi タスクの実装計画は従来どおり `tsunagi_update_task` の `description` に書く（ファイルは作らない）

## 書き方

GitHub Flavored Markdown で書く。Viewer は以下を表示できる。

- 手作業の手順は**タスクリスト**にする: `- [ ] 手順`（ユーザーが Viewer でチェックすると元ファイルの `[ ]` が `[x]` に書き換わる）
- 見出し `##` で手順を区切る（Viewer の目次とセクション別進捗になる）
- 注意書きは alert: `> [!NOTE]` / `> [!TIP]` / `> [!IMPORTANT]` / `> [!WARNING]` / `> [!CAUTION]`
- 流れや構成は ` ```mermaid ` で図にする（Viewer 内でパン・ズームできる）
- コマンドはコードブロック、比較は表
- 画像・他の .md へのリンクは相対パスで書ける

## 開き方

1. ファイルを書き出したら、絶対パスで `tsunagi_open_markdown` を呼ぶ
   - 現在のタスクの指定は `tsunagi-task` skill と同じ（`session_id` に環境変数 `TSUNAGI_SESSION_ID`、無ければ `cwd`）
   - 同じファイルのタブがあれば再利用される。ユーザーの表示中タブは切り替わらず、タブに未読ドットが付く
2. 返却された `viewerUrl` をユーザーに提示する（ターミナルからクリックで単体ページを開ける）

`tsunagi_open_markdown` が使えない環境では、次の URL を提示する（パスは URL エンコードする）:

```
http://localhost:${TSUNAGI_SERVER_PORT:-2791}/markdown-viewer?path=<絶対パス>
```

## 進捗の扱い

ユーザーが Viewer でチェックした結果はファイルに保存される。進捗を確認・報告する時、続きの作業をする時は**ファイルを読み直してから**判断する（記憶している内容は古い可能性がある）。ファイルを編集すると Viewer に自動で反映される。
