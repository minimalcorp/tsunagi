# Tsunagi - UI/UX設計原則

本ドキュメントは、Tsunagi全体のUI/UX設計における根本的な原則を定義します。
すべてのUI実装・ドキュメント作成において、これらの原則を厳守してください。

---

## 🎯 設計哲学

### 1. シンプルさを最優先

**原則**: 必要最小限の情報のみを表示する

- ✅ **DO**: 今すぐ必要な情報だけを表示
- ❌ **DON'T**: 将来使うかもしれない情報を表示
- ❌ **DON'T**: 説明的な補足文を長々と書く

**例**:

```tsx
// ❌ BAD: 不要な説明が多い
<p>
  まずはGitリポジトリをクローンして開発を始めましょう。
  リポジトリをクローンすることで、タスクを作成できるようになります。
</p>

// ✅ GOOD: 必要最小限
<p>Gitリポジトリをクローン</p>
```

---

### 2. 効率的な情報伝達

**原則**: 最短の文字数で最大の情報を伝える

- ✅ **DO**: 動詞で始める（「クローンする」「設定する」）
- ✅ **DO**: 箇条書き・ステップ番号を活用
- ❌ **DON'T**: 丁寧語・敬語で文を長くしない
- ❌ **DON'T**: 同じ意味を別の表現で繰り返さない

**例**:

```tsx
// ❌ BAD: 冗長
<div>
  <h3>開発を始めるまでの3つのステップについて</h3>
  <p>以下の手順に従って、開発環境をセットアップしてください:</p>
  <ol>
    <li>まずはGitリポジトリをクローンしてください</li>
    <li>次に認証情報を設定してください</li>
    <li>最後にタスクを作成してください</li>
  </ol>
</div>

// ✅ GOOD: 簡潔
<div>
  <p>セットアップ (3ステップ):</p>
  <ol>
    <li>リポジトリをクローン</li>
    <li>認証情報を設定</li>
    <li>タスクを作成</li>
  </ol>
</div>

// ✅ BEST: 最小限（アイコン活用）
<div>
  ① リポジトリクローン
  ② 認証設定
  ③ タスク作成
</div>
```

---

### 3. 視覚的な情報設計

**原則**: テキストよりも視覚情報を優先

- ✅ **DO**: アイコン・色・位置で状態を表現
- ✅ **DO**: 余白・グループ化で情報構造を明確化
- ❌ **DON'T**: すべてをテキストで説明しようとしない

**優先順位**:

1. **アイコン・色** → 一瞬で認識可能
2. **レイアウト・位置** → スキャンしやすい
3. **短い単語** → 読まずに認識可能
4. **短い文** → 最小限のテキスト
5. **長い文** → 極力避ける

**例**:

```tsx
// ❌ BAD: テキストで説明
<div>
  <p>このタスクは現在実行中です</p>
  <p>ステータス: 実行中</p>
</div>

// ✅ GOOD: 視覚的
<div className="flex items-center gap-2">
  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
  <span className="text-sm">実行中</span>
</div>

// ✅ BEST: アイコンのみ（tooltipで詳細）
<div className="text-xl" title="実行中">
  🔵
</div>
```

---

### 4. Tooltip活用による段階的情報開示

**原則**: 詳細情報は必要な時だけ表示（Progressive Disclosure）

- ✅ **DO**: 基本はアイコン・短い単語のみ
- ✅ **DO**: 詳細が必要なら`?`アイコン + tooltip
- ✅ **DO**: tooltipも簡潔に（1-2行、最大50文字）
- ❌ **DON'T**: 画面に全情報を常時表示

**Tooltip の文字数ガイドライン**:

- **理想**: 20文字以内
- **許容**: 50文字以内
- **最大**: 100文字（これを超える場合はリンクにする）

**例**:

```tsx
// ❌ BAD: 長い説明を常時表示
<div>
  <label>ANTHROPIC_API_KEY</label>
  <p className="text-xs text-gray-500">
    Claude APIキーを入力してください。
    https://console.anthropic.com/ から取得できます。
    sk-ant- で始まる文字列を入力してください。
  </p>
  <input type="password" />
</div>

// ✅ GOOD: 必要最小限 + tooltip
<div>
  <label className="flex items-center gap-1">
    API Key
    <span className="text-xs text-gray-400 cursor-help" title="console.anthropic.com から取得">
      ?
    </span>
  </label>
  <input type="password" placeholder="sk-ant-xxx" />
</div>

// ✅ BEST: 極限まで簡潔
<div>
  <label>API Key</label>
  <input type="password" placeholder="sk-ant-xxx" />
</div>
```

---

## 📏 具体的なガイドライン

### テキスト長の制限

| 要素             | 理想     | 許容   | 最大   |
| ---------------- | -------- | ------ | ------ |
| ボタンラベル     | 1-2単語  | 3単語  | 5単語  |
| 見出し           | 2-4単語  | 5単語  | 10単語 |
| 説明文（本文）   | 5-10単語 | 15単語 | 20単語 |
| Tooltip          | 3-5単語  | 10単語 | 15単語 |
| エラーメッセージ | 3-5単語  | 10単語 | 20単語 |

**文字数の目安**（日本語）:

- 理想: 20文字以内
- 許容: 50文字以内
- 最大: 100文字（これを超える場合は分割またはリンク）

---

### 情報の優先順位

表示する情報を以下の優先順位で判断:

1. **必須情報**: ユーザーが次のアクションを取るために絶対必要
2. **重要情報**: あると便利だが、なくても操作可能
3. **補足情報**: Tooltip・ヘルプページに移動
4. **不要情報**: 削除

**判断基準**:

- 「この情報がないと、ユーザーは次に何をすべきか分からないか？」→ YES なら必須
- 「この情報は今すぐ必要か、後で必要か？」→ 後でなら削除
- 「この情報はアイコン・色で表現できないか？」→ できるならテキスト削除

---

### 色の使用

**原則**: 色に意味を持たせ、テキスト説明を減らす

| 色               | 意味                   | 使用例                         |
| ---------------- | ---------------------- | ------------------------------ |
| **Blue**         | アクション・現在実行中 | ボタン、実行中ステータス       |
| **Green**        | 成功・完了・アイドル   | 完了ステータス、成功メッセージ |
| **Amber/Yellow** | 警告・注意が必要       | 未設定警告、注意事項           |
| **Red**          | エラー・失敗・危険     | エラーメッセージ、削除確認     |
| **Gray**         | 無効・非アクティブ     | 無効ボタン、未来のステップ     |

---

### アニメーション

**原則**: 動きで状態を伝え、テキスト説明を不要にする

- ✅ **DO**: `animate-pulse` で「注目」「実行中」を表現
- ✅ **DO**: `animate-spin` でローディング状態を表現
- ✅ **DO**: `transition-all` でスムーズな状態変化
- ❌ **DON'T**: 過度なアニメーションでユーザーを疲れさせない

---

## 🎨 実装例

### オンボーディング（Before/After）

**❌ BAD: 冗長で読みづらい**

```tsx
<div>
  <h2>Welcome to Tsunagi!</h2>
  <p>
    Tsunagiへようこそ！まずはGitリポジトリをクローンして開発を始めましょう。
    リポジトリをクローンすることで、タスクを作成できるようになります。
  </p>
  <p>開発を始めるまでには以下の3つのステップが必要です:</p>
  <ol>
    <li>Gitリポジトリをクローンしてください</li>
    <li>認証情報を設定してください</li>
    <li>タスクを作成してください</li>
  </ol>
  <p>
    上部のメニューバーにある「Clone Repository」ボタンをクリックして、クローンを開始してください。
  </p>
</div>
```

**✅ GOOD: 簡潔で視覚的**

```tsx
<div className="text-center">
  <div className="text-4xl mb-4">📦</div>
  <h2 className="text-xl font-bold mb-4">セットアップ</h2>

  <div className="space-y-2 mb-6">
    <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded">
      <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
        1
      </span>
      <span>リポジトリクローン</span>
      <span className="ml-auto">👈</span>
    </div>
    <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
      <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center">
        2
      </span>
      <span>認証設定</span>
    </div>
    <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
      <span className="w-5 h-5 rounded-full bg-gray-300 text-white text-xs flex items-center justify-center">
        3
      </span>
      <span>タスク作成</span>
    </div>
  </div>

  <div className="text-sm text-blue-600">👆 「Clone Repository」ボタン</div>
</div>
```

---

### エラーメッセージ（Before/After）

**❌ BAD: 長すぎる**

```tsx
<div className="text-red-600">
  エラーが発生しました。Gitリポジトリのクローンに失敗しました。
  入力されたURLが正しいか確認してください。また、プライベートリポジトリの場合は認証トークンが必要です。
  トークンを設定してから再度お試しください。
</div>
```

**✅ GOOD: 簡潔**

```tsx
<div className="flex items-center gap-2 text-red-600">
  <span>⚠️</span>
  <span>クローン失敗: URL確認</span>
  <button className="text-xs underline">詳細</button>
</div>
```

---

## 🔍 レビューチェックリスト

新しいUI実装・ドキュメント作成時に、以下を確認してください：

### 必須チェック

- [ ] **シンプル**: 不要な情報を削除したか？
- [ ] **簡潔**: 文字数を最小限にしたか？
- [ ] **視覚的**: テキストの代わりにアイコン・色を使えないか？
- [ ] **段階的**: 詳細情報をTooltip/リンクに移動できないか？

### 文字数チェック

- [ ] ボタンラベル: 5単語以内
- [ ] 見出し: 10単語以内
- [ ] 説明文: 20単語以内
- [ ] Tooltip: 15単語以内

### 削除できるか確認

以下のフレーズは削除可能なことが多い:

- 「〜してください」→ 動詞のみ
- 「まずは〜」→ 削除
- 「〜することで」→ 削除
- 「〜によって」→ 削除
- 「以下の〜」→ 削除

---

## 📚 参考資料

この設計原則は、以下の考え方に基づいています:

- **Progressive Disclosure** - 必要な時に必要な情報だけ
- **Visual Hierarchy** - 視覚的な優先順位
- **Cognitive Load Minimization** - 認知負荷の最小化
- **F-Pattern Reading** - ユーザーの視線の動き
- **Material Design** - Googleの視覚的ガイドライン

---

## ✅ まとめ

**TsunagiのUIは**:

- **簡潔** - 最小限の文字数
- **視覚的** - アイコン・色・レイアウト
- **効率的** - 一瞬で理解できる
- **段階的** - 必要な時に詳細を表示

**迷ったら**: 「もっと短くできないか？」「テキストを削除できないか？」を自問する
