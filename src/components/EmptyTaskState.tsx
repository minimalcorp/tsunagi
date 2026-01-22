'use client';

import { ClipboardList } from 'lucide-react';

interface EmptyTaskStateProps {
  onAddTaskClick: () => void;
}

export function EmptyTaskState({ onAddTaskClick }: EmptyTaskStateProps) {
  return (
    <div className="flex items-center justify-center p-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-4">
          <ClipboardList className="w-16 h-16 text-gray-400" />
        </div>
        <h3 className="text-xl font-semibold text-black mb-2">タスクがありません</h3>
        <p className="text-gray-600 mb-6">
          最初のタスクを作成して
          <br />
          Claudeに開発を依頼しましょう
        </p>
        <button
          onClick={onAddTaskClick}
          className="px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-600 transition-colors"
        >
          + 最初のタスクを作成
        </button>
      </div>
    </div>
  );
}
