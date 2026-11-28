'use client';

import { memo, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  ExternalLink,
  Info,
  Lightbulb,
  MessageSquareWarning,
  OctagonAlert,
} from 'lucide-react';
import { CodeBlock } from '@/components/CodeBlock';
import { apiUrl } from '@/lib/api-url';
import { MermaidPanZoom } from './MermaidPanZoom';
import { isExternalUrl, isMarkdownPath, resolveLocalReference, viewerHref } from './markdown-utils';
import { remarkGithubAlerts, rehypeMarkdownViewer, type AlertType } from './plugins';

const ALERTS: Record<AlertType, { label: string; icon: ReactNode }> = {
  note: { label: 'Note', icon: <Info /> },
  tip: { label: 'Tip', icon: <Lightbulb /> },
  important: { label: 'Important', icon: <MessageSquareWarning /> },
  warning: { label: 'Warning', icon: <AlertTriangle /> },
  caution: { label: 'Caution', icon: <OctagonAlert /> },
};

const remarkPlugins = [remarkGfm, remarkGithubAlerts];

interface HastLike {
  type: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastLike[];
}

/** react-markdown が渡す hast の node を DOM 属性に流さないよう取り除く */
function withoutNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

function textOf(node: HastLike | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}
const rehypePlugins = [rehypeMarkdownViewer];

interface MarkdownDocumentProps {
  /** 表示中ファイルの絶対パス（相対参照の解決基準） */
  filePath: string;
  content: string;
  onToggleTask: (offset: number, checked: boolean) => void;
  /** 相対リンクで別の Markdown を開く */
  onNavigate: (filePath: string) => void;
}

export const MarkdownDocument = memo(function MarkdownDocument({
  filePath,
  content,
  onToggleTask,
  onNavigate,
}: MarkdownDocumentProps) {
  const components = useMemo<Components>(
    () => ({
      input: (inputProps) => {
        const props = withoutNode(inputProps);
        if (props.type !== 'checkbox') return <input {...props} />;
        const rawOffset = (props as Record<string, unknown>)['data-task-offset'];
        const offset = typeof rawOffset === 'number' ? rawOffset : Number(rawOffset);
        if (!Number.isFinite(offset))
          return <input type="checkbox" checked={props.checked} disabled />;
        const checked = Boolean(props.checked);
        return (
          <input
            type="checkbox"
            className="task-checkbox"
            checked={checked}
            aria-label={checked ? '完了を取り消す' : '完了にする'}
            onChange={() => onToggleTask(offset, !checked)}
          />
        );
      },
      a: (anchorProps) => {
        const { href, children, ...props } = withoutNode(anchorProps);
        if (!href) return <a {...props}>{children}</a>;
        if (href.startsWith('#')) {
          return (
            <a href={href} {...props}>
              {children}
            </a>
          );
        }
        if (isExternalUrl(href)) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
              <ExternalLink className="ml-0.5 inline-block size-[0.9em] align-[-0.1em]" />
            </a>
          );
        }
        const target = resolveLocalReference(filePath, href);
        if (target && isMarkdownPath(target)) {
          return (
            <a
              href={viewerHref(target)}
              title={target}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onNavigate(target);
              }}
              {...props}
            >
              {children}
            </a>
          );
        }
        // Markdown 以外のローカルファイルは開けないため、リンクにしない
        return (
          <span className="local-link" title={target ?? href}>
            {children}
          </span>
        );
      },
      img: (imageProps) => {
        const { src, alt, ...props } = withoutNode(imageProps);
        if (typeof src !== 'string') return null;
        const local = resolveLocalReference(filePath, src);
        const resolved = local
          ? apiUrl(`/api/markdown/asset?path=${encodeURIComponent(local)}`)
          : src;
        // eslint-disable-next-line @next/next/no-img-element -- ローカルファイルを API 経由で表示するため next/image は使えない
        return <img src={resolved} alt={alt ?? ''} loading="lazy" {...props} />;
      },
      // コードブロック（<pre><code>）。インラインコードは既定の <code> のまま
      pre: ({ node }) => {
        const codeNode = node?.children[0] as HastLike | undefined;
        const classNames = codeNode?.properties?.className;
        const language =
          (Array.isArray(classNames) ? classNames : [])
            .map(String)
            .find((name) => name.startsWith('language-'))
            ?.slice('language-'.length) ?? '';
        const code = textOf(codeNode).replace(/\n$/, '');
        if (language === 'mermaid' && code) return <MermaidPanZoom code={code} />;
        return (
          <CodeBlock language={language} code={code}>
            {code}
          </CodeBlock>
        );
      },
      div: (divProps) => {
        const { children, ...props } = withoutNode(divProps);
        const alert = (props as Record<string, unknown>)['data-alert'] as AlertType | undefined;
        if (alert && alert in ALERTS) {
          const { label, icon } = ALERTS[alert];
          return (
            <div className="markdown-alert" data-alert={alert}>
              <p className="markdown-alert-title">
                {icon}
                {label}
              </p>
              {children}
            </div>
          );
        }
        return <div {...props}>{children}</div>;
      },
      table: (tableProps) => {
        const { children, ...props } = withoutNode(tableProps);
        return (
          <div className="table-wrapper">
            <table {...props}>{children}</table>
          </div>
        );
      },
    }),
    [filePath, onNavigate, onToggleTask]
  );

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
