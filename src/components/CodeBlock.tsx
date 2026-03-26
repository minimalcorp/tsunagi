'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeBlockProps {
  language?: string;
  code: string;
  children: React.ReactNode;
}

export function CodeBlock({ language, code, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  return (
    <div className="relative group">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-80 hover:opacity-100"
        title={copied ? 'Copied!' : 'Copy code'}
        aria-label={copied ? 'Copied to clipboard' : 'Copy code to clipboard'}
      >
        {copied ? (
          <Check className="w-4 h-4 text-success" />
        ) : (
          <Copy className="w-4 h-4 text-foreground" />
        )}
      </Button>
      <pre>
        <code className={language ? `language-${language}` : ''}>{children}</code>
      </pre>
    </div>
  );
}
