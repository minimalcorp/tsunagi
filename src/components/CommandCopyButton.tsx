'use client';

import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';

interface CommandCopyButtonProps {
  command: string;
  label: string;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary';
}

export function CommandCopyButton({
  command,
  label,
  icon,
  variant = 'secondary',
}: CommandCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`
        w-full px-4 py-2 rounded-lg font-medium text-sm
        ${
          variant === 'primary'
            ? 'bg-primary-600 hover:bg-primary-hover text-white'
            : 'bg-theme-card hover:bg-theme-hover text-theme-fg border border-theme'
        }
        ${copied ? 'ring-2 ring-green-500' : ''}
      `}
      title={command}
    >
      {copied ? (
        <span className="flex items-center justify-center gap-2">
          <Check className="w-4 h-4" />
          Copied!
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          {icon}
          {label}
        </span>
      )}
    </button>
  );
}
