import type { ClaudeTuiSettings } from '@minimalcorp/tsunagi-shared';
import { readAppSetting, writeAppSetting } from './local-llm-env.js';

/**
 * Claude Code の TUI レンダラ設定。
 *
 * 既定の classic レンダラは会話を通常画面に描くため、画面外へ流れた行を描き直せず、
 * 内容が縮んだときや PTY の幅が変わったときにスクロールバックへ同じ行が重複して残る。
 * fullscreen レンダラ（alt screen）ならこれが起きないため、tsunagi では既定で有効にする。
 */

const SETTING_KEY = 'claudeTui';

const DEFAULT_SETTINGS: ClaudeTuiSettings = { fullscreen: true };

export function getClaudeTuiSettings(): Promise<ClaudeTuiSettings> {
  return readAppSetting(SETTING_KEY, DEFAULT_SETTINGS);
}

export function saveClaudeTuiSettings(settings: ClaudeTuiSettings): Promise<ClaudeTuiSettings> {
  return writeAppSetting(SETTING_KEY, settings);
}

export function parseClaudeTuiSettings(
  value: unknown
): { settings: ClaudeTuiSettings } | { error: string } {
  const fullscreen = (value as { fullscreen?: unknown } | null)?.fullscreen;
  if (typeof fullscreen !== 'boolean') return { error: 'fullscreen must be a boolean' };
  return { settings: { fullscreen } };
}

/**
 * claude の起動時に渡す環境変数。OFF のときは何も渡さず、Claude Code 自身の設定（/tui）に任せる。
 * CLAUDE_CODE_NO_FLICKER は settings.json の tui より優先されるため、ON の間は tsunagi 内の claude は
 * 常に fullscreen になる（DB の環境変数で同名キーを設定すればそちらが優先される）
 */
export async function resolveClaudeTuiEnv(): Promise<Record<string, string>> {
  const { fullscreen } = await getClaudeTuiSettings();
  return fullscreen ? { CLAUDE_CODE_NO_FLICKER: '1' } : {};
}
