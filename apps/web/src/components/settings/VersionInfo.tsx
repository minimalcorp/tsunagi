'use client';

import { ArrowUpCircle, CheckCircle2, CircleHelp } from 'lucide-react';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { UpdatePopoverContent } from '@/components/UpdateIndicator';
import { useUpdateStatus } from '@/components/UpdateStatusProvider';

/** Settings 左パネル下部に常時表示する、実行中のバージョンと更新確認の状態 */
export function VersionInfo() {
  const status = useUpdateStatus();
  const checkedAt = status?.checkedAt
    ? `Last checked: ${new Date(status.checkedAt).toLocaleString()}`
    : undefined;

  return (
    <div className="border-t border-border p-3 space-y-1 text-xs">
      <div className="font-medium text-foreground">
        tsunagi {status?.current ? `v${status.current}` : 'dev'}
      </div>
      {status?.updateAvailable ? (
        <Popover>
          <PopoverTrigger
            className="flex items-center gap-1 rounded-sm text-info hover:underline cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            title={checkedAt}
          >
            <ArrowUpCircle className="size-3.5" />v{status.latest} available
          </PopoverTrigger>
          <UpdatePopoverContent status={status} />
        </Popover>
      ) : status?.checkedAt ? (
        <div className="flex items-center gap-1 text-success" title={checkedAt}>
          <CheckCircle2 className="size-3.5" />
          Up to date
        </div>
      ) : (
        <div className="flex items-center gap-1 text-muted-foreground">
          <CircleHelp className="size-3.5" />
          Not checked
        </div>
      )}
    </div>
  );
}
