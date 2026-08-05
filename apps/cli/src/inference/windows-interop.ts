import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';

// `tsunagi whisper`/`tsunagi llm` はWSL2上で実行され、WSL2のinterop機構
// (`interop.enabled`、デフォルト有効)経由でWindowsネイティブの実行ファイルを直接
// 起動する。CUDA仮想化層(WSL2のGPUパススルー)を経由しないため、ネイティブの
// GPU性能がそのまま出る想定。

// WSL2上で実行されているかを/proc/versionから判定する(WSL検出の標準的な方法)。
export function isRunningInWsl(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const version = fs.readFileSync('/proc/version', 'utf-8').toLowerCase();
    return version.includes('microsoft');
  } catch {
    return false;
  }
}

interface PowerShellResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

// WSL2のinterop経由でpowershell.exeを実行する。-NoProfileでユーザープロファイル
// 読み込みをスキップして起動を高速化し、-NonInteractiveで対話プロンプト発生を防ぐ。
export function runPowerShell(command: string, timeoutMs = 15_000): PowerShellResult {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf-8', timeout: timeoutMs }
  );
  return {
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    code: result.status,
  };
}

// WSL2側の絶対パスを、Windowsネイティブプロセスが解釈できるUNCパスに変換する
// (例: /home/user/foo → \\wsl.localhost\Ubuntu\home\user\foo)。
export function toWindowsPath(wslPath: string): string {
  const result = spawnSync('wslpath', ['-w', wslPath], { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`wslpathでの変換に失敗しました (${wslPath}): ${result.stderr}`);
  }
  return result.stdout.trim();
}

// Windows側の絶対パス(C:\...)を、WSL2からアクセス可能なパス(/mnt/c/...)に変換する。
export function toWslPath(windowsPath: string): string {
  const result = spawnSync('wslpath', ['-u', windowsPath], { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`wslpathでの変換に失敗しました (${windowsPath}): ${result.stderr}`);
  }
  return result.stdout.trim();
}

// Windowsホスト自身がLAN上で持つIPv4アドレスを取得する(ループバック/vEthernet/
// WSL用仮想アダプタ/リンクローカルは除外)。ネイティブWindowsプロセスが実際に
// bindするアドレスと一致させるため、WSL2側の仮想NIC(eth0等)のIPではなくこちらを使う。
export function getWindowsLanIp(): string | null {
  const script = `
    Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.IPAddress -ne '127.0.0.1'
      } |
      Select-Object -First 1 -ExpandProperty IPAddress
  `;
  const { stdout, code } = runPowerShell(script);
  if (code !== 0 || !stdout) return null;
  return stdout.split('\n')[0]?.trim() || null;
}

// Windows側のユーザープロファイルディレクトリ(C:\Users\<user>)を、WSL2から
// アクセス可能なパス(/mnt/c/Users/<user>)として返す。tsunagi用の設定・venv置き場は
// Windowsのネイティブファイルシステム上に作る(WSL2側のext4上に置くと、ネイティブ
// Windowsプロセス(python.exe等)からパス解決できないため)。
export function getWindowsTsunagiDir(): string {
  const { stdout, code } = runPowerShell('$env:USERPROFILE');
  if (code !== 0 || !stdout) {
    throw new Error('Windowsのユーザープロファイルディレクトリを取得できませんでした');
  }
  const profileWsl = toWslPath(stdout);
  return `${profileWsl}/.tsunagi-windows`;
}

// 実行ファイルがWindows側のPATHに存在するか確認する。
export function commandExistsOnWindows(exeName: string): boolean {
  const { stdout, code } = runPowerShell(
    `Get-Command ${exeName} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source`
  );
  return code === 0 && stdout.length > 0;
}

// ネイティブWindows実行ファイルをWSL2のinterop経由で起動する。cwdはWindows側の
// パス概念に依存するため受け付けない(呼び出し側は絶対パスの引数のみで完結させる)。
export function spawnWindowsProcess(exe: string, args: string[]): ChildProcess {
  return spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}
