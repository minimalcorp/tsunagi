import { MessagesSquare, Megaphone, Palette, ListTodo } from 'lucide-react';

export type DocumentViewMode = 'logs' | 'requirement' | 'design' | 'procedure';

interface DocumentViewToggleProps {
  mode: DocumentViewMode;
  onChange: (mode: DocumentViewMode) => void;
}

export function DocumentViewToggle({ mode, onChange }: DocumentViewToggleProps) {
  const buttons: { mode: DocumentViewMode; icon: typeof MessagesSquare; label: string }[] = [
    { mode: 'logs', icon: MessagesSquare, label: 'Logs' },
    { mode: 'requirement', icon: Megaphone, label: 'Requirement' },
    { mode: 'design', icon: Palette, label: 'Design' },
    { mode: 'procedure', icon: ListTodo, label: 'Procedure' },
  ];

  return (
    <div className="bg-theme-hover rounded p-1 inline-flex gap-0.5">
      {buttons.map(({ mode: buttonMode, icon: Icon, label }) => (
        <button
          key={buttonMode}
          onClick={() => onChange(buttonMode)}
          className={`px-2 py-1 rounded text-sm flex items-center gap-1.5 transition-colors cursor-pointer ${
            mode === buttonMode
              ? 'bg-primary text-white shadow-sm'
              : 'text-theme-muted hover:text-theme-fg'
          }`}
          title={label}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
