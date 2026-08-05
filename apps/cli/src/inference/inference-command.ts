import { isRunningInWsl } from './windows-interop.js';

export type InferenceService = 'whisper' | 'llm';

// `tsunagi whisper`/`tsunagi llm` の共通エントリポイント。
export async function runInferenceCommand(service: InferenceService): Promise<void> {
  if (!isRunningInWsl()) {
    console.error(`[tsunagi ${service}] このコマンドはWindows + WSL2上での実行を想定しています。`);
    console.error(
      `[tsunagi ${service}] WSL2 (Ubuntu等)をセットアップし、その中でこのコマンドを実行してください。`
    );
    process.exitCode = 1;
    return;
  }

  if (service === 'llm') {
    const { runLlmCommand } = await import('./llm-command.js');
    await runLlmCommand();
  } else {
    const { runWhisperCommand } = await import('./whisper-command.js');
    await runWhisperCommand();
  }
}
