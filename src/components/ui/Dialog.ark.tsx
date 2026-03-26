'use client';

import { Dialog as ArkDialog } from '@ark-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
  showCloseButton?: boolean;
  /** ダイアログを開いた時に最初にフォーカスする要素を返す関数 */
  initialFocusEl?: () => HTMLElement | null;
  /** フォーカストラップを有効にするか（デフォルト: true） */
  trapFocus?: boolean;
  /** ダイアログを閉じた時にフォーカスを元の要素に戻すか（デフォルト: true） */
  restoreFocus?: boolean;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
};

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  maxWidth = '2xl',
  showCloseButton = true,
  initialFocusEl,
  trapFocus = true,
  restoreFocus = true,
}: DialogProps) {
  return (
    <ArkDialog.Root
      open={open}
      onOpenChange={onOpenChange}
      modal
      trapFocus={trapFocus}
      restoreFocus={restoreFocus}
      initialFocusEl={initialFocusEl}
    >
      <ArkDialog.Backdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
      <ArkDialog.Positioner className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <ArkDialog.Content
          className={`bg-background rounded-lg border border-border shadow-lg w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] overflow-y-auto relative`}
        >
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              {title && (
                <ArkDialog.Title className="text-lg font-semibold leading-none text-foreground">
                  {title}
                </ArkDialog.Title>
              )}
              {showCloseButton && (
                <ArkDialog.CloseTrigger className="ml-auto size-8 rounded-md inline-flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <X className="size-4" />
                </ArkDialog.CloseTrigger>
              )}
            </div>
          )}
          <div className={title || showCloseButton ? 'px-6 pb-6 pt-2' : 'p-6'}>{children}</div>
        </ArkDialog.Content>
      </ArkDialog.Positioner>
    </ArkDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'default' | 'danger';
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'default',
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange({ open: false });
  };

  const confirmButtonClass =
    variant === 'danger'
      ? 'h-9 px-4 py-2 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95 transition-[color,background-color,transform] cursor-pointer'
      : 'h-9 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-[color,background-color,transform] cursor-pointer';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} maxWidth="md" showCloseButton={false}>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold leading-none text-foreground">{title}</h2>
        <div className="text-sm text-muted-foreground whitespace-pre-line">{message}</div>
        <div className="flex justify-end gap-2 pt-2">
          <ArkDialog.CloseTrigger asChild>
            <button className="h-9 px-4 py-2 rounded-md text-sm font-medium border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground active:scale-95 transition-[color,background-color,transform] cursor-pointer">
              {cancelLabel}
            </button>
          </ArkDialog.CloseTrigger>
          <button onClick={handleConfirm} className={confirmButtonClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
