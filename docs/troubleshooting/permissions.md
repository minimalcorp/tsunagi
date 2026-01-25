# 権限エラーのトラブルシューティング

## bypassPermissions設定

SDK要件（3つ同時必須）:

- `permissionMode: 'bypassPermissions'`
- `allowDangerouslySkipPermissions: true`
- `bypassPermissions: true`

設定箇所: `src/lib/claude-client.ts:38-53`

## 環境変数

`.env.local`:

```env
CLAUDE_BYPASS_PERMISSIONS=true  # 権限バイパス（MVP推奨）
CLAUDE_DEBUG_MODE=true           # デバッグログ出力
```

## よくある問題

### "Permission denied" エラー

**原因**: SDK設定不完全
**対処**: 3つの設定を確認

### セッション実行時に権限エラー

**原因**: queryOptions設定が伝播していない
**対処**: デバッグモードでログ確認

```bash
CLAUDE_DEBUG_MODE=true docker logs tsunagi-app-1 -f
```

## デバッグ手順

```bash
# 1. ログ確認
docker logs tsunagi-app-1 2>&1 | grep -E "\[DEBUG\]|\[ERROR\]"

# 2. セッション作成テスト
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"workspaceId":"test","workingDirectory":"/workspace"}'

# 3. 設定確認
cat src/lib/claude-client.ts | grep -A 10 "const queryOptions"
```

## 関連ファイル

- `src/lib/claude-client.ts` - SDK設定
- `.env.local` - 環境変数
- `docs/apis/sessions.md` - 設計仕様（bypass permissions前提）
