/**
 * 更新を適用するための再起動。Fastify はこの終了コードで終了し、apps/cli の app が残りを止めて
 * 同じコードで終了すると、entry が新しいバージョンで起動し直す（apps/cli/src/versions.ts と合わせる）。
 */
export const RESTART_EXIT_CODE = 75;

let handler: (() => void) | null = null;

/** index.ts が終了処理を登録する */
export function onRestartRequested(fn: () => void): void {
  handler = fn;
}

export function requestRestart(): void {
  handler?.();
}
