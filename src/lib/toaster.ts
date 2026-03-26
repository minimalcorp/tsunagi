'use client';

import type { ReactNode } from 'react';
import { toast } from 'sonner';

export type ToastType = 'loading' | 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  id?: string;
  type?: ToastType;
  title?: ReactNode;
  description?: ReactNode;
  duration?: number;
}

function createToast(options: ToastOptions): string {
  const { id, type, title, description, duration } = options;
  const opts = { id, description, duration };

  switch (type) {
    case 'loading':
      return String(toast.loading(title, opts));
    case 'success':
      return String(toast.success(title, opts));
    case 'error':
      return String(toast.error(title, opts));
    case 'warning':
      return String(toast.warning(title, opts));
    case 'info':
      return String(toast.info(title, opts));
    default:
      return String(toast(title, opts));
  }
}

function updateToast(id: string, options: ToastOptions): void {
  const { type, title, description, duration } = options;

  // sonner doesn't have a direct update method like Ark UI.
  // We dismiss and recreate with the same id to simulate update.
  toast.dismiss(id);

  // Use a microtask to ensure the dismiss is processed before creating
  queueMicrotask(() => {
    const opts = { id, description, duration };
    switch (type) {
      case 'loading':
        toast.loading(title, opts);
        break;
      case 'success':
        toast.success(title, opts);
        break;
      case 'error':
        toast.error(title, opts);
        break;
      case 'warning':
        toast.warning(title, opts);
        break;
      case 'info':
        toast.info(title, opts);
        break;
      default:
        toast(title, opts);
        break;
    }
  });
}

export const toaster = {
  create: (options: ToastOptions): string => createToast(options),
  update: (id: string, options: ToastOptions): void => updateToast(id, options),
  dismiss: (id: string): void => {
    toast.dismiss(id);
  },
};
