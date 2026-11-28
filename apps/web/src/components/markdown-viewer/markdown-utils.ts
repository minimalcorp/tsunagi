/**
 * Markdown Viewer の純粋関数群（パス解決・タスク切替・目次抽出）。
 */

const MARKDOWN_EXT = /\.(md|markdown)$/i;

/** list item の開始位置（mdast position.start.offset）から始まるタスクマーカー */
const TASK_MARKER = /^(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\]/;

/**
 * `offset` にある list item のチェック状態を書き換えた文字列を返す。マーカーが無ければ null。
 * サーバー側（apps/server/src/routes/markdown.ts の toggleTaskAt）と同じロジック。
 */
export function toggleTaskAt(content: string, offset: number, checked: boolean): string | null {
  if (!Number.isInteger(offset) || offset < 0 || offset >= content.length) return null;
  const match = TASK_MARKER.exec(content.slice(offset, offset + 32));
  if (!match) return null;
  const boxIndex = offset + match[0].length - 2;
  return content.slice(0, boxIndex) + (checked ? 'x' : ' ') + content.slice(boxIndex + 1);
}

/** 単体ページ（/markdown-viewer）の URL */
export function viewerHref(filePath: string): string {
  return `/markdown-viewer?path=${encodeURIComponent(filePath)}`;
}

export function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXT.test(filePath);
}

export function basename(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf('/') + 1);
}

export function dirname(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index <= 0 ? '/' : filePath.slice(0, index);
}

/** ホームディレクトリ配下を `~` で短縮して表示する（表示専用） */
export function shortenHome(filePath: string): string {
  const match = /^(\/Users\/[^/]+|\/home\/[^/]+)(\/.*)?$/.exec(filePath);
  return match ? `~${match[2] ?? ''}` : filePath;
}

/** スキーム付き（http: / mailto: 等）や protocol-relative の URL か */
export function isExternalUrl(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
}

/**
 * Markdown ファイルからの相対参照（`./a.md`, `../img/x.png`, `/abs/path.md`）を絶対パスへ解決する。
 * クエリ・フラグメントは落とす。外部 URL・ページ内アンカーは null。
 */
export function resolveLocalReference(fromFile: string, href: string): string | null {
  if (!href || href.startsWith('#') || isExternalUrl(href)) return null;
  const withoutSuffix = href.split(/[?#]/)[0];
  if (!withoutSuffix) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    decoded = withoutSuffix;
  }
  const joined = decoded.startsWith('/') ? decoded : `${dirname(fromFile)}/${decoded}`;
  const parts: string[] = [];
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

export interface OutlineSection {
  /** 見出しの通し番号から作る id（rehype プラグインが振る id と一致する） */
  id: string;
  title: string;
  done: number;
  total: number;
}

export interface MarkdownOutline {
  /** h2 単位の目次（h2 が無ければ h1） */
  sections: OutlineSection[];
  done: number;
  total: number;
}

export function headingId(index: number): string {
  return `md-heading-${index}`;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const TASK_LINE = /^\s*(?:>\s*)*(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\](?:[ \t]|$)/;

function plainHeadingText(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}

/**
 * 目次と進捗を行単位で抽出する（フェンスドコード内は除外）。
 * 見出しは出現順に通し番号を振り、rehype 側の id 付与と対応させる。
 */
export function extractOutline(content: string): MarkdownOutline {
  const headings: { level: number; id: string; title: string; done: number; total: number }[] = [];
  let fence: string | null = null;
  let headingIndex = 0;
  let done = 0;
  let total = 0;
  let current: (typeof headings)[number] | null = null;
  let currentH1: (typeof headings)[number] | null = null;

  for (const line of content.split('\n')) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const heading = ATX_HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const entry = {
        level,
        id: headingId(headingIndex++),
        title: plainHeadingText(heading[2] ?? ''),
        done: 0,
        total: 0,
      };
      headings.push(entry);
      if (level === 1) currentH1 = entry;
      if (level === 2) current = entry;
      if (level === 1) current = null;
      continue;
    }

    const task = TASK_LINE.exec(line);
    if (task) {
      const checked = task[1] !== ' ';
      total += 1;
      if (checked) done += 1;
      const owner = current ?? currentH1;
      if (owner) {
        owner.total += 1;
        if (checked) owner.done += 1;
      }
    }
  }

  const h2 = headings.filter((h) => h.level === 2);
  const sections = (h2.length > 0 ? h2 : headings.filter((h) => h.level === 1)).map(
    ({ id, title, done: d, total: t }) => ({ id, title, done: d, total: t })
  );
  return { sections, done, total };
}
