'use client';

import { CheckCircle, RefreshCw, Unplug } from 'lucide-react';
import { useSSE } from '@/hooks/useSSE';

export function ConnectionStatus() {
  const { connectionState, reconnect } = useSSE();

  // アイコンとスタイルの設定
  const getStatusConfig = () => {
    switch (connectionState) {
      case 'connected':
        return {
          Icon: CheckCircle,
          color: 'text-green-500',
          label: '接続中',
          spin: false,
        };
      case 'connecting':
        return {
          Icon: RefreshCw,
          color: 'text-yellow-500',
          label: '接続確立中',
          spin: true,
        };
      case 'disconnected':
        return {
          Icon: Unplug,
          color: 'text-red-500',
          label: '切断',
          spin: false,
        };
    }
  };

  const { Icon, color, label, spin } = getStatusConfig();

  const handleClick = () => {
    if (connectionState === 'disconnected') {
      reconnect();
    }
  };

  const isClickable = connectionState === 'disconnected';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        onClick={handleClick}
        className={`connection-status-indicator group relative flex items-center justify-center w-10 h-10 rounded-lg shadow-lg transition-shadow ${
          isClickable ? 'cursor-pointer hover:shadow-xl' : 'cursor-default'
        }`}
        title={label}
      >
        <Icon className={`w-5 h-5 ${color} ${spin ? 'animate-spin' : ''}`} aria-hidden="true" />

        {/* Tooltip */}
        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block">
          <div className="connection-status-tooltip text-white text-xs rounded py-1 px-2 whitespace-nowrap">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}
