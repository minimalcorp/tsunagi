'use client';

import { useEffect, type ReactNode } from 'react';
import {
  Dialog as BaseDialog,
  DialogContent as BaseDialogContent,
  DialogTitle as BaseDialogTitle,
  DialogClose,
} from './dialog-primitives';
import { Button } from './button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '4xl': 'sm:max-w-4xl',
  '6xl': 'sm:max-w-6xl',
};

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  maxWidth = '2xl',
  showCloseButton = true,
  initialFocusEl,
}: DialogProps) {
  // Handle initialFocusEl by focusing the element after dialog opens
  useEffect(() => {
    if (open && initialFocusEl) {
      const rafId = requestAnimationFrame(() => {
        const el = initialFocusEl();
        if (el) {
          el.focus();
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [open, initialFocusEl]);

  const handleOpenChange = (openState: boolean) => {
    onOpenChange({ open: openState });
  };

  return (
    <BaseDialog open={open} onOpenChange={handleOpenChange} modal>
      <BaseDialogContent
        showCloseButton={false}
        className={cn(
          'bg-background rounded-lg border border-border shadow-lg max-h-[90vh] overflow-y-auto',
          'gap-0 p-0',
          maxWidthClasses[maxWidth]
        )}
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            {title && (
              <BaseDialogTitle className="text-lg font-semibold leading-none text-foreground">
                {title}
              </BaseDialogTitle>
            )}
            {showCloseButton && (
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto text-muted-foreground hover:text-foreground"
                  />
                }
              >
                <X className="size-4" />
              </DialogClose>
            )}
          </div>
        )}
        <div className={title || showCloseButton ? 'px-6 pb-6 pt-2' : 'p-6'}>{children}</div>
      </BaseDialogContent>
    </BaseDialog>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange} maxWidth="md" showCloseButton={false}>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold leading-none text-foreground">{title}</h2>
        <div className="text-sm text-muted-foreground whitespace-pre-line">{message}</div>
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose render={<Button variant="outline" className="cursor-pointer" />}>
            {cancelLabel}
          </DialogClose>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            className="cursor-pointer"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
