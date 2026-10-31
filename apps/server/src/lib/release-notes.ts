import type { ReleaseNote } from '@minimalcorp/tsunagi-shared';
import { isNewer } from './update-check.js';

const RELEASES_URL = 'https://api.github.com/repos/minimalcorp/tsunagi/releases?per_page=100';
// docs-v* など、同じリポジトリの別パッケージのリリースを除外する
const TAG_PREFIX = 'tsunagi-v';
const FETCH_TIMEOUT_MS = 10_000;
// 未認証の GitHub API は 60 回/時（IP 単位）のため、失敗時や未作成時の再取得を抑える
const RETRY_COOLDOWN_MS = 5 * 60 * 1000;

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
}

interface CacheEntry {
  key: string;
  /** 取得失敗なら null */
  notes: ReleaseNote[] | null;
  /** 更新先の Release まで取得できた。以降は変わらないものとして再取得しない */
  complete: boolean;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

/** 自動生成ノートの定型部分を除く（見出しは UI 側で出し、差分は compare リンクで案内する） */
function cleanBody(body: string | null): string {
  return (body ?? '')
    .replace(/^## What's Changed[ \t]*\r?$/gm, '')
    .replace(/^\*\*Full Changelog\*\*.*$/gm, '')
    .trim();
}

async function fetchReleaseNotes(current: string, target: string): Promise<ReleaseNote[] | null> {
  try {
    const res = await fetch(RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'tsunagi',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const releases = (await res.json()) as GitHubRelease[];
    return releases
      .filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(TAG_PREFIX))
      .map((r) => ({
        version: r.tag_name.slice(TAG_PREFIX.length),
        url: r.html_url,
        body: cleanBody(r.body),
        publishedAt: r.published_at,
      }))
      .filter((n) => isNewer(n.version, current) && !isNewer(n.version, target))
      .sort((a, b) => (isNewer(a.version, b.version) ? -1 : 1));
  } catch {
    // オフライン等
    return null;
  }
}

/** current より新しく target 以下のリリースノートを新しい順に返す。取得できなければ null */
export async function getReleaseNotes(
  current: string,
  target: string
): Promise<ReleaseNote[] | null> {
  const key = `${current}..${target}`;
  if (cache?.key === key && (cache.complete || Date.now() - cache.fetchedAt < RETRY_COOLDOWN_MS)) {
    return cache.notes;
  }

  const notes = await fetchReleaseNotes(current, target);
  cache = {
    key,
    notes,
    // npm publish の後に Release が作られるため、更新先の Release がまだない場合がある
    complete: notes?.some((n) => n.version === target) ?? false,
    fetchedAt: Date.now(),
  };
  return notes;
}
