'use client';

import { useState } from 'react';
import { ArrowUpCircle, Check, Copy, ExternalLink } from 'lucide-react';
import type { UpdateStatus } from '@minimalcorp/tsunagi-shared';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useUpdateStatus } from './UpdateStatusProvider';
import { cn } from '@/lib/utils';

const NPM_URL = 'https://www.npmjs.com/package/@minimalcorp/tsunagi';
const UPDATE_COMMANDS = [
  'npm i -g @minimalcorp/tsunagi@latest',
  'npx @minimalcorp/tsunagi@latest',
] as const;

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy command:', error);
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted/50 pl-2">
      <code className="flex-1 truncate font-mono text-xs">{command}</code>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy command'}
        aria-label={copied ? 'Copied to clipboard' : 'Copy command to clipboard'}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}

/** 更新方法の Popover 本体（ヘッダーのバッジと Settings のバージョン表示で共用） */
export function UpdatePopoverContent({ status }: { status: UpdateStatus }) {
  return (
    <PopoverContent align="end" className="w-80 gap-3">
      <PopoverHeader>
        <PopoverTitle>New version available</PopoverTitle>
        <PopoverDescription>
          v{status.current} → v{status.latest}
        </PopoverDescription>
      </PopoverHeader>
      <div className="space-y-1.5">
        {UPDATE_COMMANDS.map((command) => (
          <CopyableCommand key={command} command={command} />
        ))}
      </div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>Restart tsunagi to apply</span>
        <a
          href={NPM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          npm
          <ExternalLink className="size-3" />
        </a>
      </div>
    </PopoverContent>
  );
}

/** 新しいバージョンが公開されている間だけ表示する（dismiss 不可） */
export function UpdateIndicator({ className }: { className?: string }) {
  const status = useUpdateStatus();
  if (!status?.updateAvailable) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className={cn(
              'relative border-info/50 text-info hover:text-info active:scale-95',
              className
            )}
            title="New version available"
          />
        }
      >
        <ArrowUpCircle />v{status.latest}
        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-info" />
      </PopoverTrigger>
      <UpdatePopoverContent status={status} />
    </Popover>
  );
}
