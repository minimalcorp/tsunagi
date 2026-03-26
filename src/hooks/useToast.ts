'use client';

import { toast } from 'sonner';

export const useToast = () => {
  const loading = (title: string, description?: string): string => {
    return String(toast.loading(title, { description, duration: Infinity }));
  };

  const success = (id: string | undefined, title: string, description?: string): string => {
    if (id) {
      toast.success(title, { id, description, duration: 5000 });
      return id;
    } else {
      return String(toast.success(title, { description, duration: 5000 }));
    }
  };

  const error = (id: string | undefined, title: string, description?: string): string => {
    if (id) {
      toast.error(title, { id, description, duration: Infinity });
      return id;
    } else {
      return String(toast.error(title, { description, duration: Infinity }));
    }
  };

  const info = (title: string, description?: string): string => {
    return String(toast.info(title, { description, duration: 5000 }));
  };

  const dismiss = (id: string) => {
    toast.dismiss(id);
  };

  return { loading, success, error, info, dismiss };
};
