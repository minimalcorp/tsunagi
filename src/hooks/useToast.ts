'use client';

import { toaster } from '@/lib/toaster';
import type { ToastType } from '@/components/Toast';

export const useToast = () => {
  const loading = (title: string, description?: string): string => {
    return toaster.create({
      type: 'loading' as ToastType,
      title,
      description,
      duration: Infinity,
    });
  };

  const success = (id: string | undefined, title: string, description?: string): string => {
    if (id) {
      toaster.update(id, {
        type: 'success' as ToastType,
        title,
        description,
        duration: 5000,
      });
      return id;
    } else {
      return toaster.create({
        type: 'success' as ToastType,
        title,
        description,
        duration: 5000,
      });
    }
  };

  const error = (id: string | undefined, title: string, description?: string): string => {
    if (id) {
      toaster.update(id, {
        type: 'error' as ToastType,
        title,
        description,
        duration: Infinity,
      });
      return id;
    } else {
      return toaster.create({
        type: 'error' as ToastType,
        title,
        description,
        duration: Infinity,
      });
    }
  };

  const info = (title: string, description?: string): string => {
    return toaster.create({
      type: 'info' as ToastType,
      title,
      description,
      duration: 5000,
    });
  };

  const dismiss = (id: string) => {
    toaster.dismiss(id);
  };

  return { loading, success, error, info, dismiss };
};
