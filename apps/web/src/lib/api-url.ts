/**
 * Resolve the base URL of the tsunagi-server (Fastify) instance.
 *
 * Fastify (port 2791) を単一の公開エンドポイントとし、API / Socket.IO は自前で
 * 処理、それ以外は内部の Next.js (port 2792) へリバースプロキシする構成。
 * これにより cloudflared など「単一ポートのみ公開」のトンネル越しでも、
 * Web・API・WebSocket がすべて同一オリジンで成立する。
 *
 * - Browser: ユーザがアクセスしているオリジンをそのまま使う（同一オリジン）。
 *   localhost / LAN / cloudflared / SSH tunnel いずれの経路でも動き、
 *   http/https・ws/wss も window.location.protocol から正しく導出される。
 * - Node.js (SSR / Server Components): 環境変数 `NEXT_PUBLIC_TSUNAGI_SERVER_URL`
 *   か、フォールバックの `http://localhost:2791`（同一マシンの Fastify）。
 *
 * 開発時も本番と同じく Fastify 入口 (localhost:2791 / docker は host:2891) に
 * アクセスする。HMR(WebSocket) は Fastify が Next へ透過リレーするため、同一
 * オリジンのまま動く。Next 直アクセス(2792)用の上書きは不要。
 * `NEXT_PUBLIC_TSUNAGI_SERVER_URL` は reverse proxy 等で別オリジンに向けたい
 * 場合の明示上書きとしてのみ残す。
 */

export function getServerUrl(): string {
  // 明示的な上書き（開発時の Next 直アクセス、reverse proxy 等）
  const override = process.env.NEXT_PUBLIC_TSUNAGI_SERVER_URL;
  if (override) return override;

  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location;
    // host はポート込み。同一オリジンなので追加のポート付与はしない。
    return `${protocol}//${host}`;
  }
  return 'http://localhost:2791';
}

/**
 * Compose a fully qualified URL for an API endpoint.
 *
 * @example
 *   apiUrl('/api/tasks')                  → <origin>/api/tasks
 *   apiUrl('/api/tasks/' + id + '/tabs')  → <origin>/api/tasks/<id>/tabs
 */
export function apiUrl(pathWithLeadingSlash: string): string {
  return `${getServerUrl()}${pathWithLeadingSlash}`;
}
