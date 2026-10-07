'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ArrowUpCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RotateCw,
} from 'lucide-react';
import type { RestartBlocker, UpdateStatus } from '@minimalcorp/tsunagi-shared';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toaster } from '@/lib/toaster';
import { useRestartToUpdate, useUpdateStatus } from './UpdateStatusProvider';
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

/** 自動更新できない場合（npm 以外での実行等）・失敗した場合の手動更新の案内 */
function ManualUpdate() {
  return (
    <>
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
    </>
  );
}

/** インストール済みの新しいバージョンを、ユーザーが選んだタイミングの再起動で適用する */
function RestartToUpdate() {
  const { restarting, restart } = useRestartToUpdate();
  const [requesting, setRequesting] = useState(false);
  const [blockers, setBlockers] = useState<RestartBlocker[]>([]);

  const handleRestart = async () => {
    setRequesting(true);
    try {
      const result = await restart();
      setBlockers(result.ok ? [] : result.blockers);
    } catch (error) {
      toaster.create({
        type: 'error',
        title: 'Failed to restart',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRequesting(false);
    }
  };

  if (restarting) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Restarting...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={() => void handleRestart()} disabled={requesting}>
        {requesting ? <Loader2 className="animate-spin" /> : <RotateCw />}
        Restart to update
      </Button>
      {blockers.length > 0 ? (
        <div className="space-y-1 text-warning">
          <div className="flex items-center gap-1">
            <AlertCircle className="size-3.5" />
            Wait for running tasks to finish
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {blockers.map((blocker) => (
              <li key={blocker.taskId} className="truncate">
                {blocker.title}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground">Open terminal sessions will be closed.</p>
      )}
    </div>
  );
}

/** entry（`tsunagi` コマンド）が古いときの再インストールの案内。自動更新はこのまま続く */
function ReinstallNotice() {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1 text-warning">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        Reinstall tsunagi to keep auto-update up to date
      </div>
      <CopyableCommand command={UPDATE_COMMANDS[0]} />
    </div>
  );
}

function UpdateSteps({ status }: { status: UpdateStatus }) {
  const { state, version, error } = status.autoUpdate;
  if (state === 'ready') return <RestartToUpdate />;
  if (state === 'idle' || state === 'installing') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Downloading v{version ?? status.latest}...
      </div>
    );
  }
  return (
    <>
      {state === 'error' && error && (
        <div className="flex items-start gap-1 text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span className="line-clamp-3 break-all">{error}</span>
        </div>
      )}
      <ManualUpdate />
    </>
  );
}

/** 更新方法の Popover 本体（ヘッダーのバッジと Settings のバージョン表示で共用） */
export function UpdatePopoverContent({ status }: { status: UpdateStatus }) {
  const { state, version } = status.autoUpdate;
  // 用意できたのが latest より古い場合も、そのバージョンへの再起動を案内する
  const target = state === 'ready' && version ? version : status.latest;

  return (
    <PopoverContent align="end" className="w-80 gap-3">
      <PopoverHeader>
        <PopoverTitle>
          {status.updateAvailable ? 'New version available' : 'Reinstall recommended'}
        </PopoverTitle>
        {status.updateAvailable && (
          <PopoverDescription>
            v{status.current} → v{target}
          </PopoverDescription>
        )}
      </PopoverHeader>
      {status.updateAvailable && <UpdateSteps status={status} />}
      {status.entryOutdated && <ReinstallNotice />}
    </PopoverContent>
  );
}

/** 新しいバージョンがある間・再インストールを勧める間・更新の再起動中だけ表示する（dismiss 不可） */
export function UpdateIndicator({ className }: { className?: string }) {
  const status = useUpdateStatus();
  const { restarting } = useRestartToUpdate();

  if (restarting) {
    return (
      <Button
        variant="outline"
        size="lg"
        className={cn('border-info/50 text-info', className)}
        disabled
        title="Restarting to apply the update"
      >
        <Loader2 className="animate-spin" />
        Restarting
      </Button>
    );
  }
  if (!status || (!status.updateAvailable && !status.entryOutdated)) return null;

  const ready = status.autoUpdate.state === 'ready';
  const label = status.updateAvailable
    ? `v${ready && status.autoUpdate.version ? status.autoUpdate.version : status.latest}`
    : 'Reinstall';
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
            title={
              ready
                ? 'Restart to update'
                : status.updateAvailable
                  ? 'New version available'
                  : 'Reinstall recommended'
            }
          />
        }
      >
        {ready ? <RotateCw /> : <ArrowUpCircle />}
        {label}
        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-info" />
      </PopoverTrigger>
      <UpdatePopoverContent status={status} />
    </Popover>
  );
}
