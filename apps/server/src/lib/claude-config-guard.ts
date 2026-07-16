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
