'use client';

import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyTaskStateProps {
  onAddTaskClick: () => void;
}

export function EmptyTaskState({ onAddTaskClick }: EmptyTaskStateProps) {
  return (
    <div className="flex items-center justify-center p-12 bg-accent rounded-lg border-2 border-dashed border-border">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-4">
          <ClipboardList className="w-16 h-16 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">タスクがありません</h3>
        <p className="text-muted-foreground mb-6">
          最初のタスクを作成して
          <br />
          Claudeに開発を依頼しましょう
        </p>
        <Button size="lg" onClick={onAddTaskClick} className="px-6 shadow-lg">
          + 最初のタスクを作成
        </Button>
      </div>
    </div>
  );
}
