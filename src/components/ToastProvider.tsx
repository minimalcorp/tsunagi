'use client';

import { Toaster } from '@ark-ui/react/toast';
import { Portal } from '@ark-ui/react/portal';
import { toaster } from '@/lib/toaster';
import { Toast } from '@/components/Toast';

export function ToastProvider() {
  return (
    <Portal>
      <Toaster toaster={toaster}>
        {(toast) => (
          <Toast
            key={toast.id}
            type={toast.type as 'loading' | 'success' | 'error' | 'info'}
            title={toast.title as string}
            description={toast.description as string}
            duration={toast.duration}
          />
        )}
      </Toaster>
    </Portal>
  );
}
