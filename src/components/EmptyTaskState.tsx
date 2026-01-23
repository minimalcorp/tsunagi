'use client';

import { ClipboardList } from 'lucide-react';

interface EmptyTaskStateProps {
  onAddTaskClick: () => void;
}

export function EmptyTaskState({ onAddTaskClick }: EmptyTaskStateProps) {
  return (
    <div className="flex items-center justify-center p-12 bg-theme-hover rounded-lg border-2 border-dashed border-theme">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-4">
          <ClipboardList className="w-16 h-16 text-theme-muted" />
        </div>
        <h3 className="text-xl font-semibold text-theme-fg mb-2">タスクがありません</h3>
        <p className="text-theme-muted mb-6">
          最初のタスクを作成して
          <br />
          Claudeに開発を依頼しましょう
        </p>
        <button
          onClick={onAddTaskClick}
          className="px-6 py-3 bg-primary text-white font-semibold rounded-lg shadow-lg hover:bg-primary-hover"
        >
          + 最初のタスクを作成
        </button>
      </div>
    </div>
  );
}
