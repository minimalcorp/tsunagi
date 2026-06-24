import crypto from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

/**
 * Basic 認証。`TSUNAGI_BASIC_AUTH_USER` と `TSUNAGI_BASIC_AUTH_PASSWORD` が
 * 両方設定されているときだけ有効化する（cloudflared 等で外部公開する際の保護）。
 *
 * 単一ポート集約の都合上、cloudflared はアプリと同じ `localhost` から Fastify へ
 * 接続するため、外部アクセスもローカルの内部連携も IP 上は loopback に見える。
 * そこで「外部 = Cloudflare 経由」を Cloudflare が付与するヘッダで判別し、外部からは
 * すべて認証必須にしつつ、ローカルマシン上の Claude Code プラグイン連携
 * (hooks / MCP) や cli の死活監視だけは認証なしで通す。
 */

// ローカルからのみ認証を免除する内部連携エンドポイント。外部(cloudflared)からは
// これらであっても認証必須にする。
// - /api/editor: Ctrl+G で起動する monaco-editor.sh が PTY 内(=同一マシン)から
//   localhost 経由で叩く。これを免除しないと Basic 認証有効時に 401 となり
//   Monaco Editor が開かない。外部ブラウザからの /complete は cf ヘッダが付くため
//   引き続き認証必須。
const LOCAL_EXEMPT_PREFIXES = ['/health', '/api/hooks', '/api/internal', '/api/mcp', '/api/editor'];

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export interface BasicAuth {
  /** クライアントへ返す WWW-Authenticate ヘッダ値 */
  readonly challenge: string;
  /** Authorization ヘッダが想定値と一致するか（定数時間比較） */
  isValidHeader(header: string | undefined): boolean;
  /** リクエストを通してよいか（認証成功 or ローカル内部連携の免除） */
  isAuthorized(
    headers: IncomingHttpHeaders,
    url: string | undefined,
    remoteAddress: string | undefined
  ): boolean;
}

export function createBasicAuth(env: NodeJS.ProcessEnv = process.env): BasicAuth | null {
  const user = env.TSUNAGI_BASIC_AUTH_USER;
  const password = env.TSUNAGI_BASIC_AUTH_PASSWORD;
  if (!user || !password) return null;

  const expected = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  const expectedBuf = Buffer.from(expected);

  const isValidHeader = (header: string | undefined): boolean => {
    if (!header) return false;
    const given = Buffer.from(header);
    // 長さが異なると timingSafeEqual が throw するため先にガード（長さ差のみ漏れる）。
    return given.length === expectedBuf.length && crypto.timingSafeEqual(given, expectedBuf);
  };

  // Cloudflare(cloudflared)経由のリクエストには Cloudflare が必ず付与するヘッダが付く。
  // Cloudflare はクライアント指定の cf-connecting-ip を上書きするため、外部からは
  // 「ローカルに偽装」できない。
  const isViaCloudflare = (headers: IncomingHttpHeaders): boolean =>
    Boolean(headers['cf-connecting-ip'] || headers['cf-ray'] || headers['x-forwarded-for']);

  const isLoopback = (remoteAddress: string | undefined): boolean =>
    !!remoteAddress && LOOPBACK_ADDRESSES.has(remoteAddress);

  const isLocalExemptPath = (url: string | undefined): boolean => {
    const path = (url ?? '').split('?')[0];
    return LOCAL_EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  };

  return {
    challenge: 'Basic realm="tsunagi", charset="UTF-8"',
    isValidHeader,
    isAuthorized(headers, url, remoteAddress) {
      if (isValidHeader(headers['authorization'])) return true;
      // 認証情報が無くても、loopback かつ Cloudflare 経由でない（=同一マシン直結の）
      // 内部連携エンドポイントだけは許可する。
      if (isLoopback(remoteAddress) && !isViaCloudflare(headers) && isLocalExemptPath(url)) {
        return true;
      }
      return false;
    },
  };
}
