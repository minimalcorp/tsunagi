'use client';

import { useEffect, useRef, useState, useId } from 'react';
import type { Components } from 'react-markdown';
import { ExternalLink } from 'lucide-react';
import { CodeBlock } from '@/components/CodeBlock';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, '-');

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!containerRef.current) return;
      try {
        const { svg } = await mermaid.render(`mermaid-${uniqueId}`, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Mermaid rendering failed');
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code, uniqueId]);

  if (error) {
    return (
      <div className="p-3 border border-destructive/50 rounded-md bg-destructive/10 text-destructive text-xs">
        <p className="font-medium mb-1">Mermaid Error</p>
        <pre className="whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  return <div ref={containerRef} className="my-2 overflow-x-auto" />;
}

// ReactMarkdown用の共通カスタムコンポーネント
export const markdownComponents: Components = {
  code: (props) => {
    const { className, children } = props;
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const codeString = String(children).replace(/\n$/, '');

    // inline属性がない場合はコードブロック（複数行）とみなす
    const isCodeBlock = className && className.startsWith('language-');

    if (language === 'mermaid' && codeString) {
      return <MermaidBlock code={codeString} />;
    }

    if (isCodeBlock && codeString) {
      return (
        <CodeBlock language={language} code={codeString}>
          {children}
        </CodeBlock>
      );
    }

    return <code {...props}>{children}</code>;
  },
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-primary hover:underline break-all"
    >
      {children}
      <ExternalLink
        className="inline-block flex-shrink-0"
        style={{ width: '1em', height: '1em' }}
      />
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2 w-fit max-w-full">
      <table className="border-collapse border border-border rounded-lg overflow-hidden text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-accent">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="border border-border px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
};
