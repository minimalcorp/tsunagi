'use client';

import { toast } from 'sonner';

export const useToast = () => {
  const loading = (title: string, description?: string): string => {
    const id = crypto.randomUUID();
    toast.loading(title, { id, description, duration: Infinity });
    return id;
  };

  const success = (id: string | undefined, title: string, description?: string): string => {
    if (id) {
      toast.success(title, { id, description, duration: 5000 });
      return id;
    } else {
      const newId = crypto.randomUUID();
      toast.success(title, { id: newId, description, duration: 5000 });
      return newId;
    }
  };

  const error = (id: string | undefined, title: string, description?: string): string => {
    if (id) {
      toast.error(title, { id, description, duration: Infinity });
      return id;
    } else {
      const newId = crypto.randomUUID();
      toast.error(title, { id: newId, description, duration: Infinity });
      return newId;
    }
  };

  const info = (title: string, description?: string): string => {
    const id = crypto.randomUUID();
    toast.info(title, { id, description, duration: 5000 });
    return id;
  };

  const dismiss = (id: string) => {
    toast.dismiss(id);
  };

  return { loading, success, error, info, dismiss };
};
