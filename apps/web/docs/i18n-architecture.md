# 多言語対応（i18n）アーキテクチャ

## 概要

Tsunagiアプリケーションに英語・日本語の多言語対応を実装する設計ドキュメント。

## ライブラリ選定

### 選択: next-intl

**理由**:

- Next.js App Router完全対応
- TypeScript完全サポート
- シンプルなAPI
- パフォーマンス最適化済み（RSC対応）
- 軽量

**代替案**:

- react-i18next: より機能豊富だが、App Routerサポートが限定的
- next-i18next: Pages Router向け

## アーキテクチャ設計

### ディレクトリ構造

```
/workspace
├── messages/           # 翻訳ファイル
│   ├── en.json        # 英語
│   └── ja.json        # 日本語
├── src/
│   ├── i18n/
│   │   ├── config.ts  # i18n設定
│   │   └── request.ts # リクエストベースi18n設定
│   ├── contexts/
│   │   └── LocaleContext.tsx  # 言語切り替えコンテキスト
│   └── components/
│       └── LanguageToggle.tsx # 言語切り替えUI
```

### 翻訳ファイル構造

```json
{
  "common": {
    "loading": "Loading...",
    "save": "Save",
    "cancel": "Cancel"
  },
  "header": {
    "cloneRepository": "Clone Repository",
    "addTask": "Add Task",
    "settings": "Settings"
  },
  "tasks": {
    "title": "Title",
    "description": "Description",
    "status": "Status"
  }
}
```

## 実装フェーズ

### Phase 1: 基盤実装 ✓

- [x] next-intlインストール
- [x] 基本設定ファイル作成
- [x] LocaleContext作成
- [x] LanguageToggle UI作成

### Phase 2: 翻訳ファイル作成

- [ ] 全コンポーネントの文字列を抽出
- [ ] en.json作成（英語翻訳）
- [ ] ja.json作成（日本語翻訳）
- [ ] 翻訳キーの命名規則統一

### Phase 3: コンポーネント更新

- [ ] Header.tsx
- [ ] TaskCard.tsx
- [ ] AddTaskDialog.tsx
- [ ] CloneRepositoryDialog.tsx
- [ ] EnvironmentSettingsDialog.tsx
- [ ] RepositoryOnboardingOverlay.tsx
- [ ] EmptyTaskState.tsx
- [ ] その他のコンポーネント

### Phase 4: API/バックエンド

- [ ] エラーメッセージの翻訳
- [ ] バリデーションメッセージの翻訳

## 使用方法

### コンポーネントでの使用例

```tsx
'use client';

import { useTranslations } from 'next-intl';

export function MyComponent() {
  const t = useTranslations('common');

  return <button>{t('save')}</button>;
}
```

### サーバーコンポーネントでの使用例

```tsx
import { useTranslations } from 'next-intl/server';

export async function ServerComponent() {
  const t = await useTranslations('common');

  return <div>{t('loading')}</div>;
}
```

## 言語切り替え

### LocalStorage連携

- ユーザーの言語設定を`localStorage`に保存
- 初回訪問時はブラウザの言語設定を使用
- 手動選択後は選択した言語を優先

### URL戦略（将来的な拡張）

現在はクライアント側の状態管理のみだが、将来的にSEO対応が必要な場合：

- `/en/...`
- `/ja/...`

のようなURL構造への移行も可能。

## TypeScript型安全性

next-intlはTypeScript型推論をサポート:

```tsx
const t = useTranslations('header');
t('cloneRepository'); // ✓ 型安全
t('nonExistentKey'); // ✗ TypeScriptエラー
```

## パフォーマンス考慮事項

1. **Code Splitting**: 翻訳ファイルは必要な言語のみロード
2. **Tree Shaking**: 使用されていない翻訳キーは削除
3. **キャッシング**: 翻訳はメモリにキャッシュ

## テスト戦略

1. 翻訳キーの存在確認テスト
2. 言語切り替え機能テスト
3. 翻訳ファイルのJSON構造検証

## マイグレーション計画

1. 既存コンポーネントを1つずつ段階的に移行
2. 各コンポーネント移行後に動作確認
3. 全移行完了後に未使用の日本語文字列を削除

## 備考

- **優先順位**: UI表示テキストを優先、エラーメッセージは次フェーズ
- **メンテナンス**: 新機能追加時は必ず翻訳ファイルも更新
- **レビュー**: 翻訳の品質レビューは専門家に依頼推奨
