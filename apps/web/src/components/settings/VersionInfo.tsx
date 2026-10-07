'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  CircleHelp,
  RefreshCw,
  RotateCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { UpdatePopoverContent } from '@/components/UpdateIndicator';
import { useCheckForUpdate, useUpdateStatus } from '@/components/UpdateStatusProvider';
import { toaster } from '@/lib/toaster';
import { cn } from '@/lib/utils';

/** Settings 左パネル下部に常時表示する、実行中のバージョンと更新確認の状態 */
export function VersionInfo() {
  const status = useUpdateStatus();
  const checkForUpdate = useCheckForUpdate();
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await checkForUpdate();
    } catch (error) {
      toaster.create({
        type: 'error',
        title: 'Failed to check for updates',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="border-t border-border p-3 space-y-1 text-xs">
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium text-foreground">
          tsunagi {status?.current ? `v${status.current}` : 'dev'}
        </span>
        {/* dev 起動では実行中のバージョンが不明なため確認できない */}
        {status?.current && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void handleCheck()}
            disabled={checking}
            title="Check for updates"
            aria-label="Check for updates"
          >
            <RefreshCw className={cn(checking && 'animate-spin')} />
          </Button>
        )}
      </div>
      {status?.updateAvailable ? (
        <Popover>
          <PopoverTrigger className="flex items-center gap-1 rounded-sm text-info hover:underline cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            {status.autoUpdate.state === 'ready' ? (
              <>
                <RotateCw className="size-3.5" />
                Restart to update to v{status.autoUpdate.version}
              </>
            ) : (
              <>
                <ArrowUpCircle className="size-3.5" />v{status.latest} available
              </>
            )}
          </PopoverTrigger>
          <UpdatePopoverContent status={status} />
        </Popover>
      ) : status?.checkedAt ? (
        <div className="flex items-center gap-1 text-success">
          <CheckCircle2 className="size-3.5" />
          Up to date
        </div>
      ) : (
        <div className="flex items-center gap-1 text-muted-foreground">
          <CircleHelp className="size-3.5" />
          Not checked
        </div>
      )}
      {status?.entryOutdated && !status.updateAvailable && (
        <Popover>
          <PopoverTrigger className="flex items-center gap-1 rounded-sm text-warning hover:underline cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <AlertCircle className="size-3.5" />
            Reinstall recommended
          </PopoverTrigger>
          <UpdatePopoverContent status={status} />
        </Popover>
      )}
      {status?.checkedAt && (
        <div className="text-muted-foreground">
          Last checked: {new Date(status.checkedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
