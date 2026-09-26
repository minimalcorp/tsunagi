import { type FSWatcher, watch } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * `claude logout` は ~/.claude.json の hasCompletedOnboarding を含む
 * first-launch setup state をリセットする。Tsunagi は全タブ/タスクの
 * claude プロセスが同一 HOME（同一 ~/.claude.json）を共有しているため、
 * どこか1セッションで logout すると以降全タブでオンボーディングウィザード
 * （対話UIではなく初回セットアップ画面）が起動してしまい、--resume/--session-id
 * を前提にした自動起動フローが止まる。claude 起動直前にこのフラグだけ補正する。
 */
export async function ensureClaudeOnboardingCompleted(): Promise<void> {
  const configPath = path.join(os.homedir(), '.claude.json');

  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf-8');
  } catch {
    // 初回起動などファイルが存在しない場合は何もしない
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw);
  } catch {
    return;
  }

  if (config.hasCompletedOnboarding === true) {
    return;
  }

  config.hasCompletedOnboarding = true;

  // 他の claude プロセスによる同時書き込みと衝突しても部分書き込みにならないよう
  // tmpファイルに書いてから rename する。
  const tmpPath = `${configPath}.tsunagi-tmp-${process.pid}`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(config), 'utf-8');
    await fs.rename(tmpPath, configPath);
  } catch {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
  }
}

const USER_SETTINGS_DIR = path.join(os.homedir(), '.claude');
const USER_SETTINGS_FILE = 'settings.json';

/**
 * ローカルLLMタブで /model の一覧から「ローカルLLM」を Enter で選ぶと、Claude Code は同じモデルへの
 * 切り替えとみなして PreModelSwitch フックを通さずに ~/.claude/settings.json の model に
 * 中継口の名前（localModelAlias）を保存する。そのままだと通常の Claude タブがその名前で起動して
 * 壊れるため取り除く。
 */
export async function removeLocalModelFromUserSettings(localModelAlias: string): Promise<void> {
  const settingsPath = path.join(USER_SETTINGS_DIR, USER_SETTINGS_FILE);
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return;
  }
  if (settings.model !== localModelAlias) return;
  delete settings.model;

  const tmpPath = `${settingsPath}.tsunagi-tmp-${process.pid}`;
  try {
    await fs.writeFile(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
    await fs.rename(tmpPath, settingsPath);
  } catch {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
  }
}

/**
 * ~/.claude/settings.json の変更を監視し、中継口の名前が保存されたらすぐ取り除く。
 * Claude Code は tmp ファイル経由で置き換えることがあるため、ファイルではなくディレクトリを監視する。
 */
export function watchUserSettingsForLocalModel(localModelAlias: string): void {
  let watcher: FSWatcher;
  try {
    watcher = watch(USER_SETTINGS_DIR, (_event, filename) => {
      if (filename === USER_SETTINGS_FILE) void removeLocalModelFromUserSettings(localModelAlias);
    });
  } catch {
    // ~/.claude がまだない（claude 未実行）場合は監視しない。起動前の補正で対応する
    return;
  }
  watcher.on('error', () => watcher.close());
  watcher.unref();
}
