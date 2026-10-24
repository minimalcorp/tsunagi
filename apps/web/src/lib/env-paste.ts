/**
 * 環境変数を設定する形式のテキスト（AWS SSO の Access Keys モーダルでコピーできるもの等）を
 * key/value の配列に変換する。
 *
 * 対応形式:
 *   export KEY="value"        (macOS / Linux)
 *   KEY=value                 (.env / AWS credentials ファイル。[section] 行は無視)
 *   SET KEY=value             (Windows CMD)
 *   $Env:KEY="value"          (PowerShell)
 */

export interface EnvEntry {
  key: string;
  value: string;
}

export interface ParsedEnvText {
  entries: EnvEntry[];
  /** 変数定義として解釈できなかった行数（空行・コメント・[section] は含まない） */
  unparsedLineCount: number;
}

const ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const PREFIX_RE = /^(?:export\s+|set\s+|\$env:)/i;

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseEnvText(text: string): ParsedEnvText {
  const byKey = new Map<string, string>();
  let unparsedLineCount = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith(';')) continue;
    if (/^\[.*\]$/.test(line)) continue;

    const match = ASSIGNMENT_RE.exec(line.replace(PREFIX_RE, ''));
    if (!match) {
      unparsedLineCount++;
      continue;
    }

    const value = unquote(match[2]);
    // 空値、および `abc==` のような値のみの文字列（key=abc, value="=" と誤認する）は除外
    if (!value || value.startsWith('=')) {
      unparsedLineCount++;
      continue;
    }

    // 後勝ち。挿入順を保つため一度削除してから入れ直す
    const key = match[1].toUpperCase();
    byKey.delete(key);
    byKey.set(key, value);
  }

  return {
    entries: Array.from(byKey, ([key, value]) => ({ key, value })),
    unparsedLineCount,
  };
}

/** ペーストされたテキスト全体が環境変数定義とみなせるか */
export function isEnvText(parsed: ParsedEnvText): boolean {
  return parsed.entries.length > 0 && parsed.unparsedLineCount === 0;
}
