import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// mlx/mlx-lm/mlx-whisper の固定バージョンが requires-python >=3.10 のため、venv作成に
// 使う python3 自体も 3.10 以上でなければ pip install がそもそも失敗する。`python3` という
// 名前が PATH 上のどのバージョンを指すかは環境依存(古い macOS 付属 Python 等)なため、
// 候補を新しい順に探して最初に見つかった 3.10 以上を使う。
const MIN_PYTHON_VERSION = '3.10';
const PYTHON_CANDIDATES = [
  'python3.14',
  'python3.13',
  'python3.12',
  'python3.11',
  'python3.10',
  'python3',
];

function pythonVersion(bin: string): string | null {
  try {
    return execFileSync(bin, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function versionAtLeast(version: string, min: string): boolean {
  const [vMajor, vMinor] = version.split('.').map(Number);
  const [mMajor, mMinor] = min.split('.').map(Number);
  return vMajor !== mMajor ? vMajor > mMajor : vMinor >= mMinor;
}

export function findPython(): string | null {
  for (const cand of PYTHON_CANDIDATES) {
    const version = pythonVersion(cand);
    if (version && versionAtLeast(version, MIN_PYTHON_VERSION)) return cand;
  }
  return null;
}

export const PYTHON_NOT_FOUND_MESSAGE = `Python ${MIN_PYTHON_VERSION}以上が見つかりません。'brew install python@3.12' 等でインストールしてください。`;

function venvMarkerPath(venvDir: string): string {
  return path.join(venvDir, '.requirements.sha256');
}

function requirementsHash(requirementsFile: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(requirementsFile)).digest('hex');
}

// venvが「存在するだけ」でなく、実際に使えるかを検証する。
// - venv作成に使われた python が 3.10 未満だと mlx 系のインストールに失敗するバージョンのまま放置される
// - requirements.txt のバージョン指定を後から変更しても、既存venvには反映されない
// のいずれかが起きていないかを、venv自身のpythonバージョンと記録済みハッシュから判定する。
export function isVenvUpToDate(venvDir: string, requirementsFile: string): boolean {
  const venvPython = path.join(venvDir, 'bin', 'python3');
  if (!fs.existsSync(venvPython)) return false;

  const version = pythonVersion(venvPython);
  if (!version || !versionAtLeast(version, MIN_PYTHON_VERSION)) return false;

  const marker = venvMarkerPath(venvDir);
  if (!fs.existsSync(marker)) return false;
  return fs.readFileSync(marker, 'utf8').trim() === requirementsHash(requirementsFile);
}

export function writeVenvMarker(venvDir: string, requirementsFile: string): void {
  fs.writeFileSync(venvMarkerPath(venvDir), requirementsHash(requirementsFile));
}
