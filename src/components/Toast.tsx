'use client';

import { Toast as ArkToast, type ToastRootProps } from '@ark-ui/react/toast';
import { CheckCircle, CircleAlert, Info, Loader2, X } from 'lucide-react';

export type ToastType = 'loading' | 'success' | 'error' | 'info';

interface ToastProps extends ToastRootProps {
  type?: ToastType;
  title?: string;
  description?: string;
  duration?: number;
}

const getIcon = (type?: ToastType) => {
  switch (type) {
    case 'loading':
      return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    case 'success':
      return <CheckCircle className="h-5 w-5 text-success" />;
    case 'error':
      return <CircleAlert className="h-5 w-5 text-destructive" />;
    case 'info':
      return <Info className="h-5 w-5 text-info" />;
    default:
      return <Info className="h-5 w-5 text-info" />;
  }
};

const getProgressBarColor = (type?: ToastType) => {
  switch (type) {
    case 'success':
      return 'bg-success';
    case 'info':
      return 'bg-info';
    default:
      return '';
  }
};

export function Toast({ type, title, description, duration, ...props }: ToastProps) {
  const shouldShowProgress =
    (type === 'success' || type === 'info') && duration && duration !== Infinity;

  return (
    <ArkToast.Root
      className="relative bg-card border border-border rounded-xl shadow-lg p-4 min-w-[320px] max-w-md group"
      {...props}
    >
      {/* Progress Bar */}
      {shouldShowProgress && (
        <div
          className={`absolute top-0 left-0 h-0.5 ${getProgressBarColor(type)} rounded-tl-lg`}
          style={{
            animation: `progress ${duration}ms linear`,
            animationPlayState: 'running',
          }}
        />
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">{getIcon(type)}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <ArkToast.Title className="text-sm font-semibold text-foreground">
              {title}
            </ArkToast.Title>
          )}
          {description && (
            <ArkToast.Description className="text-sm text-muted-foreground mt-1 break-words">
              {description}
            </ArkToast.Description>
          )}
        </div>

        {/* Close Button */}
        <ArkToast.CloseTrigger className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </ArkToast.CloseTrigger>
      </div>

      {/* CSS for progress bar animation with pause on hover */}
      <style jsx>{`
        @keyframes progress {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }

        .group:hover div[style*='animation'] {
          animation-play-state: paused !important;
        }
      `}</style>
    </ArkToast.Root>
  );
}
