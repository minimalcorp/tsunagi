import { execFile } from 'node:child_process';

// 指定ポートでLISTENしているプロセスを探して停止する。tsunagi自身が起動した
// 場合はchild_processのハンドルで直接killできるが、`make whisper`/`make llm`
// のようにtsunagi外で手動起動された場合はハンドルを持たないため、
// ポート番号を手がかりにOS側から見つけて停止する。
export function killProcessOnPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('lsof', ['-ti', `:${port}`, '-sTCP:LISTEN'], (_error, stdout) => {
      const pids = (stdout || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (pids.length === 0) {
        resolve(false);
        return;
      }
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGTERM');
        } catch {
          // 既に終了している等は無視
        }
      }
      resolve(true);
    });
  });
}
