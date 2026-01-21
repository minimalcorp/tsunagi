# 環境変数管理

Tsunagiにおける環境変数の管理方法について説明します。グローバル、owner単位、repo単位で環境変数を設定でき、terminal/VSCode/Claude起動時に自動で読み込まれます。

---

## 概要

環境変数は以下の3つのレベルで設定可能です：

1. **グローバル**: 全てのリポジトリに適用
2. **Owner単位**: 特定のGitHub owner配下の全リポジトリに適用
3. **Repo単位**: 特定のリポジトリにのみ適用

優先順位: **Repo単位 > Owner単位 > グローバル**

---

## データモデル

### EnvironmentVariable

```typescript
interface EnvironmentVariable {
  key: string; // 環境変数名（例: "API_KEY"）
  value: string; // 環境変数値
  scope: 'global' | 'owner' | 'repo'; // スコープ
  owner?: string; // owner単位の場合に指定
  repo?: string; // repo単位の場合に指定
}
```

### EnvironmentConfig

```typescript
interface EnvironmentConfig {
  global: Record<string, string>; // グローバル環境変数
  owners: Record<string, Record<string, string>>; // owner単位の環境変数
  repos: Record<string, Record<string, string>>; // repo単位の環境変数
}
```

---

## ファイル構造

### 保存場所

```
~/.tsunagi/
├── env/
│   ├── global.env              # グローバル環境変数
│   ├── owners/
│   │   ├── minimalcorp.env     # minimalcorp配下の環境変数
│   │   └── otherorg.env        # otherorg配下の環境変数
│   └── repos/
│       ├── minimalcorp_tsunagi.env      # minimalcorp/tsunagi
│       └── minimalcorp_api-server.env   # minimalcorp/api-server
```

### ファイル形式

標準的な `.env` 形式：

```bash
# global.env
ANTHROPIC_API_KEY=sk-ant-xxx
DEFAULT_MODEL=claude-sonnet-4.5

# owners/minimalcorp.env
GITHUB_TOKEN=ghp_xxx
NPM_TOKEN=npm_xxx

# repos/minimalcorp_tsunagi.env
DATABASE_URL=postgresql://localhost:5432/tsunagi
API_PORT=3000
```

---

## 環境変数の解決

### 解決順序

特定のタスク（例: `minimalcorp/tsunagi @ feat/auth`）に対して環境変数を解決する場合：

1. **Repo単位**: `~/.tsunagi/env/repos/minimalcorp_tsunagi.env`
2. **Owner単位**: `~/.tsunagi/env/owners/minimalcorp.env`
3. **グローバル**: `~/.tsunagi/env/global.env`

同じキーが複数のスコープに存在する場合、Repo > Owner > Global の順で優先されます。

### 実装例

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function loadEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const env: Record<string, string> = {};

    for (const line of content.split('\n')) {
      // コメント行と空行をスキップ
      if (line.trim().startsWith('#') || !line.trim()) continue;

      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        env[key] = value;
      }
    }

    return env;
  } catch {
    return {};
  }
}

async function resolveEnvironmentVariables(
  owner: string,
  repo: string
): Promise<Record<string, string>> {
  const envDir = path.join(os.homedir(), '.tsunagi', 'env');

  // 1. グローバル環境変数を読み込み
  const globalEnv = await loadEnvFile(path.join(envDir, 'global.env'));

  // 2. Owner単位の環境変数を読み込み（上書き）
  const ownerEnv = await loadEnvFile(path.join(envDir, 'owners', `${owner}.env`));

  // 3. Repo単位の環境変数を読み込み（上書き）
  const repoEnv = await loadEnvFile(path.join(envDir, 'repos', `${owner}_${repo}.env`));

  // 優先順位に従ってマージ
  return {
    ...globalEnv,
    ...ownerEnv,
    ...repoEnv,
  };
}
```

---

## 環境変数の適用

### Terminal起動時

```typescript
async function openTerminal(task: Task): Promise<void> {
  const workingDirectory = getWorktreePath(task);
  const env = await resolveEnvironmentVariables(task.owner, task.repo);

  // 環境変数を設定してターミナルを起動
  const command = getTerminalCommand(workingDirectory, env);

  await exec(command);
}

function getTerminalCommand(cwd: string, env: Record<string, string>): string {
  const envString = Object.entries(env)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');

  switch (process.platform) {
    case 'darwin': // macOS
      return `osascript -e 'tell application "Terminal" to do script "cd ${cwd} && export ${envString} && exec $SHELL"'`;
    case 'linux':
      return `gnome-terminal --working-directory="${cwd}" -- bash -c "export ${envString} && exec bash"`;
    case 'win32':
      // Windowsでは環境変数を個別に設定
      const setCommands = Object.entries(env)
        .map(([key, value]) => `set ${key}=${value}`)
        .join(' && ');
      return `start cmd /k "cd /d ${cwd} && ${setCommands}"`;
    default:
      throw new Error('Unsupported platform');
  }
}
```

### VSCode起動時

VSCodeでは `.vscode/settings.json` に環境変数を設定することで対応：

```typescript
async function openVSCode(task: Task): Promise<void> {
  const workingDirectory = getWorktreePath(task);
  const env = await resolveEnvironmentVariables(task.owner, task.repo);

  // .vscode/settings.jsonを作成
  const vscodeDir = path.join(workingDirectory, '.vscode');
  await fs.mkdir(vscodeDir, { recursive: true });

  const settingsPath = path.join(vscodeDir, 'settings.json');
  const settings = {
    'terminal.integrated.env.osx': env,
    'terminal.integrated.env.linux': env,
    'terminal.integrated.env.windows': env,
  };

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

  // VSCodeを起動
  await exec(`code "${workingDirectory}"`);
}
```

**注意**: VSCodeの統合ターミナルでは環境変数が適用されますが、VSCode本体のプロセスには適用されません。

### Claude起動時

```typescript
async function executeClaude(task: Task, prompt: string): Promise<void> {
  const workingDirectory = getWorktreePath(task);
  const env = await resolveEnvironmentVariables(task.owner, task.repo);

  // Claudeを環境変数付きで実行
  await claudeClient.execute({
    prompt,
    workingDirectory,
    env, // 環境変数を渡す
    taskId: task.id,
  });
}
```

Claude実行時は、プロセスの環境変数として設定されます。

---

## CRUD操作

### 環境変数の取得

```typescript
// 特定スコープの環境変数を取得
async function getEnvironmentVariables(
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<Record<string, string>> {
  const envDir = path.join(os.homedir(), '.tsunagi', 'env');

  switch (scope) {
    case 'global':
      return await loadEnvFile(path.join(envDir, 'global.env'));
    case 'owner':
      if (!owner) throw new Error('Owner is required');
      return await loadEnvFile(path.join(envDir, 'owners', `${owner}.env`));
    case 'repo':
      if (!owner || !repo) throw new Error('Owner and repo are required');
      return await loadEnvFile(path.join(envDir, 'repos', `${owner}_${repo}.env`));
  }
}
```

### 環境変数の設定

```typescript
async function setEnvironmentVariable(
  key: string,
  value: string,
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<void> {
  const envDir = path.join(os.homedir(), '.tsunagi', 'env');

  let filePath: string;
  switch (scope) {
    case 'global':
      filePath = path.join(envDir, 'global.env');
      break;
    case 'owner':
      if (!owner) throw new Error('Owner is required');
      await fs.mkdir(path.join(envDir, 'owners'), { recursive: true });
      filePath = path.join(envDir, 'owners', `${owner}.env`);
      break;
    case 'repo':
      if (!owner || !repo) throw new Error('Owner and repo are required');
      await fs.mkdir(path.join(envDir, 'repos'), { recursive: true });
      filePath = path.join(envDir, 'repos', `${owner}_${repo}.env`);
      break;
  }

  // 既存の環境変数を読み込み
  const env = await loadEnvFile(filePath);

  // 更新
  env[key] = value;

  // 保存
  await saveEnvFile(filePath, env);
}

async function saveEnvFile(filePath: string, env: Record<string, string>): Promise<void> {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
}
```

### 環境変数の削除

```typescript
async function deleteEnvironmentVariable(
  key: string,
  scope: 'global' | 'owner' | 'repo',
  owner?: string,
  repo?: string
): Promise<void> {
  const envDir = path.join(os.homedir(), '.tsunagi', 'env');

  let filePath: string;
  switch (scope) {
    case 'global':
      filePath = path.join(envDir, 'global.env');
      break;
    case 'owner':
      if (!owner) throw new Error('Owner is required');
      filePath = path.join(envDir, 'owners', `${owner}.env`);
      break;
    case 'repo':
      if (!owner || !repo) throw new Error('Owner and repo are required');
      filePath = path.join(envDir, 'repos', `${owner}_${repo}.env`);
      break;
  }

  const env = await loadEnvFile(filePath);
  delete env[key];
  await saveEnvFile(filePath, env);
}
```

---

## UI統合

### 環境変数設定画面

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

  return (
    <div>
      {/* スコープ選択 */}
      <select value={scope} onChange={(e) => setScope(e.target.value as any)}>
        <option value="global">Global</option>
        <option value="owner">Owner</option>
        <option value="repo">Repo</option>
      </select>

      {/* Owner/Repo選択（必要に応じて） */}
      {scope !== 'global' && (
        <input
          type="text"
          placeholder="Owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        />
      )}
      {scope === 'repo' && (
        <input
          type="text"
          placeholder="Repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
        />
      )}

      {/* 環境変数一覧 */}
      <table>
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
              <td>{value}</td>
              <td>
                <button onClick={() => handleDelete(key)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 新規追加 */}
      <form onSubmit={handleSubmit}>
        <input name="key" placeholder="Key" />
        <input name="value" placeholder="Value" />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}
```

---

## セキュリティ

### 機密情報の保護

- 環境変数ファイルのパーミッションを `600` (rw-------) に設定
- Git管理対象外（`.gitignore`に追加）
- UIでは値をマスキング表示（`***`）
- 将来的には暗号化を検討

```typescript
async function ensureSecurePermissions(filePath: string): Promise<void> {
  await fs.chmod(filePath, 0o600);
}
```

---

## トラブルシューティング

### 環境変数が適用されない場合

1. ファイルパスが正しいか確認
2. ファイル形式が正しいか確認（`KEY=VALUE`）
3. スコープの優先順位を確認（Repo > Owner > Global）

### デバッグ

環境変数の解決結果を確認：

```typescript
const env = await resolveEnvironmentVariables('minimalcorp', 'tsunagi');
console.log('Resolved environment variables:', env);
```

---

## 将来の拡張

- 環境変数の暗号化（GPG、Age等）
- 環境変数のバージョン管理
- テンプレート機能（`.env.example`）
- 環境変数のインポート/エクスポート
