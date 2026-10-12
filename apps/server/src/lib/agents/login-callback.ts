import { existsSync } from 'fs';

/**
 * ブラウザでの OAuth の戻り先（CLI が 127.0.0.1 で待ち受ける）にブラウザから届かない環境か。
 * コンテナ内の CLI にはホストのブラウザから届かない（ホストのポートを公開すると、ホストで動く CLI の
 * ログインとポートを取り合うため公開しない）
 */
export function needsLoginCallbackPaste(): boolean {
  return existsSync('/.dockerenv');
}

/**
 * ブラウザが開けなかった戻り先の URL（http://127.0.0.1:<port>/auth/callback?code=…）を、
 * 同じマシンで待ち受けている CLI に渡す。失敗したらエラーメッセージを返す
 */
export async function forwardLoginCallback(
  rawUrl: string,
  ports: number[]
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return 'URL の形式が正しくありません';
  }
  const port = Number(url.port);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !ports.includes(port)
  ) {
    return `http://127.0.0.1:${ports[0]}/… の URL を貼り付けてください`;
  }
  const get = (target: string) =>
    fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  try {
    const res = await get(`http://127.0.0.1:${port}${url.pathname}${url.search}`);
    if (res.status < 400) {
      // 成功すると完了ページへリダイレクトされる。CLI はローカルの完了ページが開かれてから終了するため、
      // 同じ待ち受け先へのリダイレクトだけ辿る（外部のページは開かない）
      const location = res.headers.get('location');
      const next = location ? new URL(location, `http://127.0.0.1:${port}`) : null;
      if (next && ['127.0.0.1', 'localhost'].includes(next.hostname) && next.port === url.port) {
        await get(`http://127.0.0.1:${port}${next.pathname}${next.search}`).catch(() => undefined);
      }
      return null;
    }
    const body = (await res.text().catch(() => '')).replace(/<[^>]+>/g, ' ').trim();
    return `ログインに失敗しました (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`;
  } catch (err) {
    return `ログインの待ち受けに接続できません: ${err instanceof Error ? err.message : String(err)}`;
  }
}
