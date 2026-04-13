-- session 終了時の todos クリア漏れで蓄積した stale データを一括リセット
-- idle/error 状態のタブは次回セッション開始まで参照されないため安全にクリアできる
-- success 状態（Stop 正常完了）のタブは累積プログレス表示のため意図的に残す
UPDATE "tabs" SET todos = '[]' WHERE status IN ('idle', 'error');
