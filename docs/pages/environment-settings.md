# 環境変数設定画面

環境変数設定画面のUI仕様について説明します。

詳細な環境変数管理の仕組みについては [docs/environment-variables.md](../environment-variables.md) を参照してください。

---

## 画面概要

環境変数を3つのスコープ（Global/Owner/Repo）で管理する設定画面です。

### 主な機能

- スコープ選択（Global/Owner/Repo）
- Owner/Repo選択（スコープに応じて）
- 環境変数一覧表示（Key/Value）
- 環境変数の追加・削除
- 値のマスキング表示（セキュリティ）

---

## レイアウト

```
+--------------------------------------------------+
| 環境変数設定                                      |
+--------------------------------------------------+
| スコープ: [Global ▼]  Owner: [____]  Repo: [____] |
+--------------------------------------------------+
| Key              | Value          | Actions      |
|------------------|----------------|--------------|
| API_KEY          | ********       | [Delete]     |
| DATABASE_URL     | ********       | [Delete]     |
+--------------------------------------------------+
| [+ Add Environment Variable]                      |
+--------------------------------------------------+
```

---

## コンポーネント構成

### スコープ選択

```tsx
<Select value={scope} onChange={setScope}>
  <option value="global">Global</option>
  <option value="owner">Owner</option>
  <option value="repo">Repo</option>
</Select>
```

**動作**:

- Globalの場合: Owner/Repo入力欄は非表示
- Ownerの場合: Owner入力欄のみ表示
- Repoの場合: Owner/Repo入力欄を表示

### Owner/Repo入力

```tsx
{
  scope !== 'global' && <Input type="text" placeholder="Owner" value={owner} onChange={setOwner} />;
}
{
  scope === 'repo' && <Input type="text" placeholder="Repo" value={repo} onChange={setRepo} />;
}
```

**バリデーション**:

- Owner: 必須（scope=owner/repoの場合）
- Repo: 必須（scope=repoの場合）

### 環境変数一覧

```tsx
<Table>
  <thead>
    <tr>
      <th>Key</th>
      <th>Value</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    {Object.entries(env).map(([key, value]) => (
      <tr key={key}>
        <td>{key}</td>
        <td>{'*'.repeat(value.length)}</td> {/* マスキング表示 */}
        <td>
          <Button onClick={() => handleDelete(key)}>Delete</Button>
        </td>
      </tr>
    ))}
  </tbody>
</Table>
```

**表示ルール**:

- Value: マスキング表示（`********`）
- セキュリティ上、平文では表示しない
- 削除ボタンで即座に削除（確認ダイアログ推奨）

### 新規追加フォーム

```tsx
<form onSubmit={handleSubmit}>
  <Input name="key" placeholder="Key" required />
  <Input name="value" placeholder="Value" required type="password" />
  <Button type="submit">Add</Button>
</form>
```

**バリデーション**:

- Key: 必須、環境変数名として有効（英数字・アンダースコア）
- Value: 必須
- 重複チェック: 同じKeyが既に存在する場合は上書き確認

---

## データフロー

### 読み込み

```typescript
async function loadEnv(scope: string, owner?: string, repo?: string) {
  const params = new URLSearchParams({ scope });
  if (owner) params.append('owner', owner);
  if (repo) params.append('repo', repo);

  const response = await fetch(`/api/env?${params}`);
  const variables = await response.json();
  return variables;
}
```

**APIエンドポイント**: `GET /api/env`

### 追加/更新

```typescript
async function setEnv(key: string, value: string, scope: string, owner?: string, repo?: string) {
  await fetch('/api/env', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value, scope, owner, repo }),
  });
}
```

**APIエンドポイント**: `POST /api/env`

### 削除

```typescript
async function deleteEnv(key: string, scope: string, owner?: string, repo?: string) {
  const params = new URLSearchParams({ key, scope });
  if (owner) params.append('owner', owner);
  if (repo) params.append('repo', repo);

  await fetch(`/api/env?${params}`, { method: 'DELETE' });
}
```

**APIエンドポイント**: `DELETE /api/env`

---

## セキュリティ

### 値のマスキング

- UI上では環境変数の値を平文で表示しない
- 常に `********` 形式でマスキング
- 入力時は `type="password"` を使用

### 確認ダイアログ

- 削除時は確認ダイアログを表示
- 「本当に削除しますか？この操作は取り消せません。」

---

## 実装例

```tsx
function EnvironmentSettings() {
  const [scope, setScope] = useState<'global' | 'owner' | 'repo'>('global');
  const [owner, setOwner] = useState<string>('');
  const [repo, setRepo] = useState<string>('');
  const [env, setEnv] = useState<Record<string, string>>({});

  const loadEnv = async () => {
    const variables = await fetch(`/api/env?scope=${scope}&owner=${owner}&repo=${repo}`).then((r) =>
      r.json()
    );
    setEnv(variables);
  };

  const handleSet = async (key: string, value: string) => {
    await fetch('/api/env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, scope, owner, repo }),
    });
    await loadEnv();
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete ${key}?`)) return;

    const params = new URLSearchParams({ key, scope });
    if (owner) params.append('owner', owner);
    if (repo) params.append('repo', repo);

    await fetch(`/api/env?${params}`, { method: 'DELETE' });
    await loadEnv();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const key = formData.get('key') as string;
    const value = formData.get('value') as string;
    await handleSet(key, value);
    e.currentTarget.reset();
  };

  useEffect(() => {
    loadEnv();
  }, [scope, owner, repo]);

  return (
    <div>
      {/* スコープ選択 */}
      <Select value={scope} onChange={(e) => setScope(e.target.value as any)}>
        <option value="global">Global</option>
        <option value="owner">Owner</option>
        <option value="repo">Repo</option>
      </Select>

      {/* Owner/Repo選択 */}
      {scope !== 'global' && (
        <Input
          type="text"
          placeholder="Owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        />
      )}
      {scope === 'repo' && (
        <Input
          type="text"
          placeholder="Repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
        />
      )}

      {/* 環境変数一覧 */}
      <Table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(env).map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{'*'.repeat(8)}</td> {/* マスキング */}
              <td>
                <Button onClick={() => handleDelete(key)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      {/* 新規追加 */}
      <form onSubmit={handleSubmit}>
        <Input name="key" placeholder="Key" required />
        <Input name="value" placeholder="Value" type="password" required />
        <Button type="submit">Add</Button>
      </form>
    </div>
  );
}
```

---

## UI/UX設計原則

全てのUI実装は [docs/design-principles.md](../design-principles.md) に従います。

- Ark UIコンポーネントを使用
- Tailwind CSSでスタイリング
- data-\*属性による状態管理
- レスポンシブ対応
