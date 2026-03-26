import { MessagesSquare, Megaphone, Palette, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="inline-flex gap-0.5 bg-input/20 dark:bg-input/30 rounded-md p-0.5">
      {buttons.map(({ mode: buttonMode, icon: Icon, label }) => (
        <Button
          key={buttonMode}
          variant="ghost"
          size="icon-lg"
          onClick={() => onChange(buttonMode)}
          className={
            mode === buttonMode
              ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/80 hover:text-primary-foreground dark:hover:bg-primary/80'
              : 'text-muted-foreground hover:text-foreground'
          }
          title={label}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}
