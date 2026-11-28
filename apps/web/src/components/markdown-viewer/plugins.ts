import { headingId } from './markdown-utils';

/**
 * Markdown Viewer 用の remark / rehype プラグイン。
 * unist 系ユーティリティは直接依存に無いため、必要最小限の木構造型と走査をここで持つ。
 */

interface UnistNode {
  type: string;
  children?: UnistNode[];
  position?: { start: { offset?: number } };
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

interface MdText extends UnistNode {
  type: 'text';
  value: string;
}

interface HastElement extends UnistNode {
  type: 'element';
  tagName: string;
  properties: Record<string, unknown>;
  children: UnistNode[];
}

function walk(node: UnistNode, visit: (node: UnistNode) => void) {
  visit(node);
  node.children?.forEach((child) => walk(child, visit));
}

export const ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i;

/**
 * GitHub alert 記法（`> [!NOTE]` 等）を `<div data-alert="note">` に変換する。
 * 先頭段落の先頭テキストがマーカーで始まる blockquote のみ対象。
 */
export function remarkGithubAlerts() {
  return (tree: unknown) => {
    walk(tree as UnistNode, (node) => {
      if (node.type !== 'blockquote') return;
      const paragraph = node.children?.[0];
      if (paragraph?.type !== 'paragraph' || !paragraph.children?.length) return;
      const first = paragraph.children[0];
      if (first.type !== 'text') return;
      const text = first as MdText;
      const match = ALERT_MARKER.exec(text.value);
      if (!match) return;

      text.value = text.value.slice(match[0].length);
      if (text.value === '') paragraph.children.shift();
      if (paragraph.children[0]?.type === 'break') paragraph.children.shift();
      if (paragraph.children.length === 0) node.children!.shift();

      node.data = {
        ...node.data,
        hName: 'div',
        hProperties: { dataAlert: match[1].toLowerCase() },
      };
    });
  };
}

function findCheckbox(node: HastElement): HastElement | null {
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    const el = child as HastElement;
    if (el.tagName === 'input' && el.properties.type === 'checkbox') return el;
    // loose list では checkbox が先頭の <p> 内に入る
    if (el.tagName === 'p') return findCheckbox(el);
    return null;
  }
  return null;
}

const BLOCK_TAGS = new Set([
  'p',
  'ul',
  'ol',
  'pre',
  'blockquote',
  'div',
  'table',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

/** タスク項目の本文（checkbox の後ろ〜最初のブロック要素の前）を span.task-label で包む */
function markTaskLabel(li: HastElement, checkbox: HastElement) {
  const index = li.children.indexOf(checkbox);
  if (index === -1) {
    // loose list: checkbox は先頭 <p> の中
    const paragraph = li.children.find(
      (child) => child.type === 'element' && (child as HastElement).tagName === 'p'
    ) as HastElement | undefined;
    if (paragraph) paragraph.properties.className = ['task-label'];
    return;
  }
  let end = index + 1;
  while (end < li.children.length) {
    const child = li.children[end];
    if (child.type === 'element' && BLOCK_TAGS.has((child as HastElement).tagName)) break;
    end += 1;
  }
  const labelChildren = li.children.slice(index + 1, end);
  // checkbox 直後の空白は取り消し線がはみ出すので落とす（間隔は CSS の margin で取る）
  const first = labelChildren[0] as MdText | undefined;
  if (first?.type === 'text') first.value = first.value.replace(/^\s+/, '');
  const label: HastElement = {
    type: 'element',
    tagName: 'span',
    properties: { className: ['task-label'] },
    children: labelChildren,
  };
  li.children.splice(index + 1, end - index - 1, label);
}

/**
 * - タスクリストの checkbox に、元 Markdown 上の list item 位置（data-task-offset）を付ける
 * - タスク項目に完了状態（data-checked）と本文 span（.task-label）を付ける
 * - 見出しに出現順の id を付ける（extractOutline の目次と対応）
 */
export function rehypeMarkdownViewer() {
  return (tree: unknown) => {
    let headingIndex = 0;
    walk(tree as UnistNode, (node) => {
      if (node.type !== 'element') return;
      const el = node as HastElement;
      if (/^h[1-6]$/.test(el.tagName)) {
        el.properties.id = headingId(headingIndex++);
        return;
      }
      if (el.tagName !== 'li') return;
      const offset = el.position?.start.offset;
      if (offset === undefined) return;
      const checkbox = findCheckbox(el);
      if (!checkbox) return;
      checkbox.properties.dataTaskOffset = offset;
      el.properties.dataChecked = Boolean(checkbox.properties.checked);
      markTaskLabel(el, checkbox);
    });
  };
}
