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
  const { type, title, description, duration } = options;
  const id = options.id ?? crypto.randomUUID();
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
  return id;
}

function updateToast(id: string, options: ToastOptions): void {
  createToast({ ...options, id });
}

export const toaster = {
  create: (options: ToastOptions): string => createToast(options),
  update: (id: string, options: ToastOptions): void => updateToast(id, options),
  dismiss: (id: string): void => {
    toast.dismiss(id);
  },
};
