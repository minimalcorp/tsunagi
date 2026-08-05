import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commandExistsOnWindows,
  getWindowsLanIp,
  getWindowsTsunagiDir,
  runPowerShell,
  spawnWindowsProcess,
  toWindowsPath,
} from './windows-interop.js';

const WHISPER_PORT = 8765;
const STARTUP_TIMEOUT_MS = 60_000;
const STDERR_TAIL_MAX_CHARS = 4000;

// このファイルは apps/cli/src/inference (dev, tsxでsrcを直接実行) または
// apps/cli/dist/inference (npm配布物) のいずれかにいる。ネストの深さが異なるため
// (bundle.mjsがapps/server由来のファイルとは違い、apps/cli自身のdistは1階層浅い)、
// 両方の候補を試す。
function findWrapperDirWsl(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', '..', '..', 'whisper-server-windows'), // dev
    path.join(here, '..', '..', 'whisper-server-windows'), // prod(bundled)
  ];
  return candidates.find((c) => fs.existsSync(path.join(c, 'server.py'))) ?? null;
}

function findWindowsPython(): string | null {
  for (const cand of ['python', 'python3']) {
    if (commandExistsOnWindows(cand)) return cand;
  }
  return null;
}

function venvMarkerPathWsl(venvDirWsl: string): string {
  return path.join(venvDirWsl, '.requirements.sha256');
}

function requirementsHash(requirementsFileWsl: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(requirementsFileWsl)).digest('hex');
}

// venvの存在チェック・requirements.txtとの整合性チェックはWSL2側から/mnt/c経由で
// 直接ファイルシステムを読めるため、Node標準のfsで完結できる
// (Windowsプロセスの起動が必要なのは venv作成・pip install・サーバー起動そのものだけ)。
function isVenvUpToDate(venvDirWsl: string, requirementsFileWsl: string): boolean {
  const venvPythonWsl = path.join(venvDirWsl, 'Scripts', 'python.exe');
  if (!fs.existsSync(venvPythonWsl)) return false;

  const marker = venvMarkerPathWsl(venvDirWsl);
  if (!fs.existsSync(marker)) return false;
  return fs.readFileSync(marker, 'utf-8').trim() === requirementsHash(requirementsFileWsl);
}

function runWindowsCommandSync(
  exe: string,
  args: string[]
): { code: number | null; stderr: string } {
  // spawnSync相当だが、標準出力もリアルタイムで表示したいのでpowershell経由ではなく
  // spawnWindowsProcessを使い自前でPromise化する形にはしない(venv構築等の同期待ちが
  // 多いためSyncで十分)。ここではpowershell.exe経由でコマンドを組み立てて実行する。
  const quoted = [exe, ...args].map((a) => `"${a.replace(/"/g, '`"')}"`).join(' ');
  const result = runPowerShell(`& ${quoted}`, 10 * 60 * 1000);
  return { code: result.code, stderr: result.stderr };
}

async function setupVenv(
  wrapperDirWsl: string
): Promise<{ venvDirWindows: string } | { error: string }> {
  const requirementsFileWsl = path.join(wrapperDirWsl, 'requirements.txt');
  let tsunagiWindowsDirWsl: string;
  try {
    tsunagiWindowsDirWsl = getWindowsTsunagiDir();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  const venvDirWsl = path.join(tsunagiWindowsDirWsl, 'whisper', 'venv');

  if (!isVenvUpToDate(venvDirWsl, requirementsFileWsl)) {
    console.log('[tsunagi whisper] Windows側にPython venvをセットアップしています...');
    const pythonBin = findWindowsPython();
    if (!pythonBin) {
      return {
        error:
          'Windows側にPython 3.10以上が見つかりませんでした。https://www.python.org/downloads/windows/ からインストールしてください。',
      };
    }

    fs.mkdirSync(path.dirname(venvDirWsl), { recursive: true });
    fs.rmSync(venvDirWsl, { recursive: true, force: true });
    const venvDirWindows = toWindowsPath(venvDirWsl);

    const createResult = runWindowsCommandSync(pythonBin, ['-m', 'venv', venvDirWindows]);
    if (createResult.code !== 0) {
      return { error: `venv作成に失敗しました: ${createResult.stderr}` };
    }

    const venvPythonWindows = `${venvDirWindows}\\Scripts\\python.exe`;
    const requirementsWindows = toWindowsPath(requirementsFileWsl);
    console.log('[tsunagi whisper] 依存関係をインストールしています... (数分かかる場合があります)');
    const pipResult = runWindowsCommandSync(venvPythonWindows, [
      '-m',
      'pip',
      'install',
      '-r',
      requirementsWindows,
    ]);
    if (pipResult.code !== 0) {
      return { error: `依存関係のインストールに失敗しました: ${pipResult.stderr}` };
    }

    fs.writeFileSync(venvMarkerPathWsl(venvDirWsl), requirementsHash(requirementsFileWsl));
  }

  return { venvDirWindows: toWindowsPath(venvDirWsl) };
}

async function checkHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWhisperCommand(): Promise<void> {
  const wrapperDirWsl = findWrapperDirWsl();
  if (!wrapperDirWsl) {
    console.error('[tsunagi whisper] whisper-server-windowsディレクトリが見つかりませんでした。');
    console.error('[tsunagi whisper] インストールが壊れている可能性があります。');
    process.exitCode = 1;
    return;
  }

  const venvResult = await setupVenv(wrapperDirWsl);
  if ('error' in venvResult) {
    console.error(`[tsunagi whisper] ${venvResult.error}`);
    process.exitCode = 1;
    return;
  }

  const lanIp = getWindowsLanIp();
  if (!lanIp) {
    console.error('[tsunagi whisper] WindowsホストのLAN上のIPv4アドレスを取得できませんでした。');
    process.exitCode = 1;
    return;
  }
  const url = `http://${lanIp}:${WHISPER_PORT}`;

  const venvPythonWindows = `${venvResult.venvDirWindows}\\Scripts\\python.exe`;
  const serverPyWindows = toWindowsPath(path.join(wrapperDirWsl, 'server.py'));

  console.log(
    '[tsunagi whisper] サーバーを起動しています... (モデルのロードに数十秒かかる場合があります)'
  );
  const managedProcess = spawnWindowsProcess(venvPythonWindows, [serverPyWindows]);
  let stderrTail = '';
  managedProcess.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
  managedProcess.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
    stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_MAX_CHARS);
  });

  let exitInfo: string | null = null;
  managedProcess.on('exit', (code, signal) => {
    exitInfo = `exit code=${code} signal=${signal}`;
  });
  managedProcess.on('error', (err) => {
    exitInfo = `spawn error: ${err.message}`;
  });

  const start = Date.now();
  let healthy = false;
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    if (exitInfo) {
      console.error(`[tsunagi whisper] サーバーが起動中に終了しました (${exitInfo})`);
      if (stderrTail) console.error(stderrTail);
      console.error(
        '[tsunagi whisper] モデル未キャッシュの場合はREADME(apps/whisper-server-windows)記載の手順で先にダウンロードしてください。'
      );
      process.exitCode = 1;
      return;
    }
    if (await checkHealth(url)) {
      healthy = true;
      break;
    }
    await sleep(1000);
  }
  if (!healthy) {
    console.error(
      `[tsunagi whisper] ${STARTUP_TIMEOUT_MS / 1000}秒待っても起動を確認できませんでした。`
    );
    managedProcess.kill();
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('[tsunagi whisper] 起動しました。以下のURLをtsunagi(Mac)側のSettings > 音声入力');
  console.log('[tsunagi whisper] > リモートモードのURL欄に入力してください:');
  console.log('');
  console.log(`    ${url}`);
  console.log('');
  console.log('[tsunagi whisper] Ctrl+C で終了します。');

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[tsunagi whisper] 終了しています...');
    managedProcess.kill();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
