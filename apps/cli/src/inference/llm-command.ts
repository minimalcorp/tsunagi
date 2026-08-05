import {
  commandExistsOnWindows,
  getWindowsLanIp,
  runPowerShell,
  spawnWindowsProcess,
} from './windows-interop.js';

const OLLAMA_PORT = 11434;
// Ollamaのモデルライブラリ上のタグ名は変わりうるため環境変数で上書き可能にしている。
// 未指定時のデフォルトはMac側ローカルモード(mlx-lm)で使っているQwen3-30B-A3B系に
// 近いモデルを想定した仮の値であり、実機でタグ名が異なる場合は要調整。
const DEFAULT_MODEL = process.env.TSUNAGI_OLLAMA_MODEL || 'qwen3:30b-a3b';
const HEALTH_CHECK_INTERVAL_MS = 30_000;

async function checkHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runLlmCommand(): Promise<void> {
  console.log('[tsunagi llm] Ollamaの状態を確認しています...');

  if (!commandExistsOnWindows('ollama')) {
    console.error('[tsunagi llm] Windows側にOllamaが見つかりませんでした。');
    console.error(
      '[tsunagi llm] https://ollama.com/download/windows からインストールしてください。'
    );
    process.exitCode = 1;
    return;
  }

  const listResult = runPowerShell('ollama list');
  if (listResult.code !== 0) {
    console.error('[tsunagi llm] `ollama list` の実行に失敗しました。');
    if (listResult.stderr) console.error(listResult.stderr);
    process.exitCode = 1;
    return;
  }
  if (!listResult.stdout.includes(DEFAULT_MODEL.split(':')[0])) {
    console.error(`[tsunagi llm] モデル "${DEFAULT_MODEL}" が見つかりませんでした。`);
    console.error(`[tsunagi llm] 先に \`ollama pull ${DEFAULT_MODEL}\` を実行してください。`);
    console.error(
      '[tsunagi llm] 別のモデルを使う場合は環境変数 TSUNAGI_OLLAMA_MODEL でタグ名を指定してください。'
    );
    process.exitCode = 1;
    return;
  }

  const lanIp = getWindowsLanIp();
  if (!lanIp) {
    console.error('[tsunagi llm] WindowsホストのLAN上のIPv4アドレスを取得できませんでした。');
    process.exitCode = 1;
    return;
  }
  const url = `http://${lanIp}:${OLLAMA_PORT}`;

  // Windows版OllamaはインストールするとバックグラウンドでOllama Appが常駐し、通常は
  // 既に`ollama serve`相当が起動済みであることが多い。まずは既存プロセスへの疎通を
  // 試し、それで届かない場合のみ自前でserveを起動する。
  let managedProcess: ReturnType<typeof spawnWindowsProcess> | null = null;
  if (!(await checkHealth(url))) {
    console.log(
      '[tsunagi llm] 既存のOllamaプロセスが見つからないため、`ollama serve` を起動します...'
    );
    managedProcess = spawnWindowsProcess('ollama.exe', ['serve']);
    managedProcess.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
    managedProcess.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));

    const start = Date.now();
    const STARTUP_TIMEOUT_MS = 30_000;
    let healthy = false;
    while (Date.now() - start < STARTUP_TIMEOUT_MS) {
      if (await checkHealth(url)) {
        healthy = true;
        break;
      }
      await sleep(1000);
    }
    if (!healthy) {
      console.error(
        `[tsunagi llm] ${STARTUP_TIMEOUT_MS / 1000}秒待っても起動を確認できませんでした。`
      );
      managedProcess.kill();
      process.exitCode = 1;
      return;
    }
  }

  console.log('');
  console.log('[tsunagi llm] 起動しました。以下のURLをtsunagi(Mac)側のSettings > ローカルLLM');
  console.log('[tsunagi llm] > リモートモードのURL欄に入力してください:');
  console.log('');
  console.log(`    ${url}`);
  console.log('');
  console.log('[tsunagi llm] Ctrl+C で終了します。');

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[tsunagi llm] 終了しています...');
    // このコマンドが自前で起動したプロセスのみ止める。Ollama Appが常駐起動していた
    // 場合(managedProcess === null)は、ユーザーが元々使っていたプロセスのため触らない。
    managedProcess?.kill();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // フォアグラウンドで居続け、定期的にヘルスチェックして状態を報告する。
  for (;;) {
    await sleep(HEALTH_CHECK_INTERVAL_MS);
    if (shuttingDown) return;
    const healthy = await checkHealth(url);
    if (!healthy) {
      console.warn(`[tsunagi llm] 警告: ${url} への疎通が確認できません。`);
    }
  }
}
