'use client';

import { Dialog as ArkDialog } from '@ark-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showCloseButton?: boolean;
  /** ダイアログを開いた時に最初にフォーカスする要素を返す関数 */
  initialFocusEl?: () => HTMLElement | null;
  /** フォーカストラップを有効にするか（デフォルト: true） */
  trapFocus?: boolean;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
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
}: DialogProps) {
  return (
    <ArkDialog.Root
      open={open}
      onOpenChange={onOpenChange}
      modal
      trapFocus={trapFocus}
      initialFocusEl={initialFocusEl}
    >
      <ArkDialog.Backdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
      <ArkDialog.Positioner className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <ArkDialog.Content
          className={`bg-theme-card rounded-lg shadow-xl w-full ${maxWidthClasses[maxWidth]} max-h-[90vh] overflow-y-auto relative`}
        >
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between p-6 pb-4">
              {title && (
                <ArkDialog.Title className="text-xl font-bold text-theme-fg">
                  {title}
                </ArkDialog.Title>
              )}
              {showCloseButton && (
                <ArkDialog.CloseTrigger className="ml-auto p-1 rounded hover:bg-theme-hover text-theme-fg cursor-pointer">
                  <X className="w-5 h-5" />
                </ArkDialog.CloseTrigger>
              )}
            </div>
          )}
          <div className={title || showCloseButton ? 'px-6 pb-6' : 'p-6'}>{children}</div>
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
      ? 'px-4 py-2 bg-red-700 text-white rounded hover:bg-red-600 active:scale-95 transition-transform cursor-pointer'
      : 'px-4 py-2 bg-primary text-white rounded hover:bg-primary-hover active:scale-95 transition-transform cursor-pointer';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} maxWidth="md" showCloseButton={false}>
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-theme-fg">{title}</h2>
        <div className="text-theme-fg whitespace-pre-line">{message}</div>
        <div className="flex justify-end gap-2 pt-2">
          <ArkDialog.CloseTrigger asChild>
            <button className="px-4 py-2 border border-theme rounded text-theme-fg hover:bg-theme-hover active:scale-95 transition-transform cursor-pointer">
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
