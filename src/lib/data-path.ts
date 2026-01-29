import * as path from 'path';
import * as os from 'os';

/**
 * Tsunagiのデータディレクトリを取得
 * 優先順位:
 * 1. 環境変数 TSUNAGI_DATA_DIR
 * 2. デフォルト: ~/.tsunagi
 */
export function getTsunagiDataDir(): string {
  return process.env.TSUNAGI_DATA_DIR || path.join(os.homedir(), '.tsunagi');
}

/**
 * データベースファイルのパスを取得
 */
export function getDatabasePath(): string {
  return path.join(getTsunagiDataDir(), 'state', 'tsunagi.db');
}

/**
 * 状態ファイルディレクトリのパスを取得
 */
export function getStateDir(): string {
  return path.join(getTsunagiDataDir(), 'state');
}
