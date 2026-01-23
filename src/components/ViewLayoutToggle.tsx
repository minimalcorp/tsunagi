'use client';

export type ViewMode = 'split' | 'editor' | 'logs';

interface ViewLayoutToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewLayoutToggle({ mode, onChange }: ViewLayoutToggleProps) {
  return (
    <div className="flex items-center gap-2 mb-4 p-2 bg-theme-hover rounded-lg">
      <span className="text-sm font-medium mr-2 text-theme-fg">View:</span>

      <button
        onClick={() => onChange('split')}
        className={`
          px-3 py-1 rounded transition-colors
          ${
            mode === 'split'
              ? 'bg-primary text-white'
              : 'bg-theme-card text-theme-fg hover:bg-theme-hover'
          }
        `}
        title="Split view"
      >
        ⚌ Split
      </button>

      <button
        onClick={() => onChange('editor')}
        className={`
          px-3 py-1 rounded transition-colors
          ${
            mode === 'editor'
              ? 'bg-primary text-white'
              : 'bg-theme-card text-theme-fg hover:bg-theme-hover'
          }
        `}
        title="Editor only"
      >
        ◧ Editor
      </button>

      <button
        onClick={() => onChange('logs')}
        className={`
          px-3 py-1 rounded transition-colors
          ${
            mode === 'logs'
              ? 'bg-primary text-white'
              : 'bg-theme-card text-theme-fg hover:bg-theme-hover'
          }
        `}
        title="Logs only"
      >
        ≡ Logs
      </button>
    </div>
  );
}
