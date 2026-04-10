/**
 * Resolve the base URL of the tsunagi-server (Fastify) instance.
 *
 * - Browser: ユーザがアクセスしている hostname + Fastify の固定ポート (2792)
 *   これにより localhost / LAN / SSH tunnel いずれの経路でも動く。
 * - Node.js (SSR / Server Components): 環境変数 `NEXT_PUBLIC_TSUNAGI_SERVER_URL` か
 *   フォールバックの `http://localhost:2792`。
 *
 * tsunagi は完全 local-only のアプリで、Web UI (port 2791) から Fastify
 * (port 2792) を直接呼ぶ。Next.js には rewrites を一切書かないため、UI
 * 側のすべての fetch / Socket.IO 接続はこのヘルパ経由にする。
 */

const FASTIFY_PORT = 2792;

export function getServerUrl(): string {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${FASTIFY_PORT}`;
  }
  return process.env.NEXT_PUBLIC_TSUNAGI_SERVER_URL ?? `http://localhost:${FASTIFY_PORT}`;
}

/**
 * Compose a fully qualified URL for an API endpoint.
 *
 * @example
 *   apiUrl('/api/tasks')                  → http://localhost:2792/api/tasks
 *   apiUrl('/api/tasks/' + id + '/tabs')  → http://localhost:2792/api/tasks/<id>/tabs
 */
export function apiUrl(pathWithLeadingSlash: string): string {
  return `${getServerUrl()}${pathWithLeadingSlash}`;
}
