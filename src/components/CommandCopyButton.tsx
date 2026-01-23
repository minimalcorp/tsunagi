'use client';

import { useState } from 'react';

interface CommandCopyButtonProps {
  command: string;
  label: string;
  icon?: string;
  variant?: 'primary' | 'secondary';
}

export function CommandCopyButton({
  command,
  label,
  icon = '📋',
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
            : 'bg-theme-hover hover:opacity-80 text-theme-fg'
        }
        ${copied ? 'ring-2 ring-green-500' : ''}
      `}
      title={command}
    >
      {copied ? (
        <>✓ Copied!</>
      ) : (
        <>
          {icon} {label}
        </>
      )}
    </button>
  );
}
