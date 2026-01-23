'use client';

import { Columns2, FileEdit, ScrollText } from 'lucide-react';

export type ViewMode = 'split' | 'editor' | 'logs';

interface ViewLayoutToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewLayoutToggle({ mode, onChange }: ViewLayoutToggleProps) {
  const views = [
    { value: 'split' as const, icon: Columns2, label: 'Split View' },
    { value: 'editor' as const, icon: FileEdit, label: 'Editor Only' },
    { value: 'logs' as const, icon: ScrollText, label: 'Logs Only' },
  ];

  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-sm font-medium text-theme-fg">View:</span>
      <div className="flex items-center gap-1 bg-theme-hover rounded p-1">
        {views.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={`px-2 py-1 rounded text-sm cursor-pointer ${
              mode === value
                ? 'bg-primary text-white shadow-sm'
                : 'text-theme-muted hover:text-theme-fg'
            }`}
            title={label}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
