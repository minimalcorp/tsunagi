import { type FSWatcher, watch } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/** Claude Code の設定ファイルの場所。CLAUDE_CONFIG_DIR 指定時は .claude.json もその中に置かれる */
function claudeJsonPath(configDir: string | undefined): string {
  return configDir ? path.join(configDir, '.claude.json') : path.join(os.homedir(), '.claude.json');
}

function userSettingsDir(configDir: string | undefined): string {
  return configDir ?? path.join(os.homedir(), '.claude');
}

/**
 * `claude logout` は ~/.claude.json の hasCompletedOnboarding を含む
 * first-launch setup state をリセットする。Tsunagi は全タブ/タスクの
 * claude プロセスが同一 HOME（同一 ~/.claude.json）を共有しているため、
 * どこか1セッションで logout すると以降全タブでオンボーディングウィザード
 * （対話UIではなく初回セットアップ画面）が起動してしまい、--resume/--session-id
 * を前提にした自動起動フローが止まる。claude 起動直前にこのフラグだけ補正する。
 * configDir はタブが使う Claude プロファイルの CLAUDE_CONFIG_DIR（未指定は ~/.claude.json）。
 */
export async function ensureClaudeOnboardingCompleted(configDir?: string): Promise<void> {
  const configPath = claudeJsonPath(configDir);

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

const USER_SETTINGS_FILE = 'settings.json';

/** 監視中の設定ディレクトリ（同じディレクトリを二重に監視しない） */
const watchedSettingsDirs = new Set<string>();

/**
 * ローカルLLMタブで /model の一覧から「ローカルLLM」を Enter で選ぶと、Claude Code は同じモデルへの
 * 切り替えとみなして PreModelSwitch フックを通さずに ~/.claude/settings.json の model に
 * 中継口の名前（localModelAlias）を保存する。そのままだと通常の Claude タブがその名前で起動して
 * 壊れるため取り除く。configDir はタブが使う Claude プロファイルの CLAUDE_CONFIG_DIR。
 */
export async function removeLocalModelFromUserSettings(
  localModelAlias: string,
  configDir?: string
): Promise<void> {
  const settingsPath = path.join(userSettingsDir(configDir), USER_SETTINGS_FILE);
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
 * settings.json の変更を監視し、中継口の名前が保存されたらすぐ取り除く。
 * Claude Code は tmp ファイル経由で置き換えることがあるため、ファイルではなくディレクトリを監視する。
 * configDir は Claude プロファイルの CLAUDE_CONFIG_DIR（未指定は外側 Terminal の設定 or ~/.claude）。
 */
export function watchUserSettingsForLocalModel(localModelAlias: string, configDir?: string): void {
  const effectiveDir = configDir ?? process.env.CLAUDE_CONFIG_DIR;
  const dir = userSettingsDir(effectiveDir);
  if (watchedSettingsDirs.has(dir)) return;
  let watcher: FSWatcher;
  try {
    watcher = watch(dir, (_event, filename) => {
      if (filename === USER_SETTINGS_FILE) {
        void removeLocalModelFromUserSettings(localModelAlias, effectiveDir);
      }
    });
  } catch {
    // ~/.claude がまだない（claude 未実行）場合は監視しない。起動前の補正で対応する
    return;
  }
  watchedSettingsDirs.add(dir);
  watcher.on('error', () => {
    watcher.close();
    watchedSettingsDirs.delete(dir);
  });
  watcher.unref();
}
