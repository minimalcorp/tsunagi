import type { Components } from 'react-markdown';
import { ExternalLink } from 'lucide-react';
import { CodeBlock } from '@/components/CodeBlock';

// ReactMarkdown用の共通カスタムコンポーネント
export const markdownComponents: Components = {
  code: (props) => {
    const { className, children } = props;
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const codeString = String(children).replace(/\n$/, '');

    // inline属性がない場合はコードブロック（複数行）とみなす
    const isCodeBlock = className && className.startsWith('language-');

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
      <table className="border-collapse border border-theme rounded-lg overflow-hidden text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-theme-hover">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="border border-theme px-3 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-theme px-3 py-2">{children}</td>,
};
