import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const MARKETPLACE_DIR = path.resolve(__dirname, '..', 'tsunagi-marketplace');
const MARKETPLACE_NAME = 'tsunagi-marketplace';
const PLUGIN_REF = `tsunagi-plugin@${MARKETPLACE_NAME}`;

let cleanedUp = false;

function log(msg: string) {
  console.log(`[with-plugin] ${msg}`);
}

function runClaude(args: string): boolean {
  try {
    execSync(`claude ${args}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * marketplace を登録する
 * CLI: `claude plugin marketplace add ./tsunagi-marketplace`
 * フォールバック: ~/.claude/settings.json の extraKnownMarketplaces に直接書き込み
 */
function addMarketplace(): boolean {
  // まず CLI コマンドを試行
  if (runClaude(`plugin marketplace add ${MARKETPLACE_DIR}`)) {
    log('Marketplace added via CLI');
    return true;
  }

  // フォールバック: settings.json に直接書き込み
  log('CLI marketplace add failed, falling back to settings.json');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // パースエラーは無視
    }
  }

  const marketplaces = (settings.extraKnownMarketplaces ?? {}) as Record<string, unknown>;
  marketplaces[MARKETPLACE_NAME] = { source: MARKETPLACE_DIR };
  settings.extraKnownMarketplaces = marketplaces;

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  log('Marketplace added via settings.json');
  return true;
}

/**
 * marketplace 登録を削除する
 */
function removeMarketplace(): void {
  // CLI で削除を試行
  if (runClaude(`plugin marketplace remove ${MARKETPLACE_NAME}`)) {
    return;
  }

  // フォールバック: settings.json から削除
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) return;

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    const marketplaces = settings.extraKnownMarketplaces as Record<string, unknown> | undefined;
    if (marketplaces && MARKETPLACE_NAME in marketplaces) {
      delete marketplaces[MARKETPLACE_NAME];
      if (Object.keys(marketplaces).length === 0) {
        delete settings.extraKnownMarketplaces;
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    }
  } catch {
    // 無視
  }
}

function installPlugin(): boolean {
  if (runClaude(`plugin install ${PLUGIN_REF} --scope user`)) {
    log('Plugin installed');
    return true;
  }
  log('Plugin install failed');
  return false;
}

function uninstallPlugin(): boolean {
  if (runClaude(`plugin uninstall ${PLUGIN_REF}`)) {
    log('Plugin uninstalled');
    return true;
  }
  log('Plugin uninstall failed');
  return false;
}

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;

  log('Cleaning up...');
  uninstallPlugin();
  removeMarketplace();
  log('Cleanup complete');
}

// --- main ---

const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'start') {
  console.error('Usage: tsx scripts/with-plugin.ts <dev|start>');
  process.exit(1);
}

// 1. marketplace 登録 & plugin install
addMarketplace();
installPlugin();

// 2. シグナルハンドラ登録
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});
process.on('exit', () => {
  cleanup();
});
process.on('uncaughtException', (err) => {
  console.error('[with-plugin] Uncaught exception:', err);
  cleanup();
  process.exit(1);
});

// 3. concurrently でサーバー起動
const nextCmd = mode === 'dev' ? 'next dev -p 2791' : 'next start -p 2791';
const fastifyCmd = mode === 'dev' ? 'tsx watch server/index.ts' : 'tsx server/index.ts';

const child = spawn(
  'npx',
  [
    'concurrently',
    '--kill-others',
    '--names',
    'next,fastify',
    '--prefix-colors',
    'blue,green',
    `"${nextCmd}"`,
    `"${fastifyCmd}"`,
  ],
  {
    stdio: 'inherit',
    shell: true,
  }
);

child.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
