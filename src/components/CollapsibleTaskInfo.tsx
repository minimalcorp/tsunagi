'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Task } from '@/lib/types';

interface CollapsibleTaskInfoProps {
  task: Task;
  defaultExpanded?: boolean;
}

export function CollapsibleTaskInfo({ task, defaultExpanded = false }: CollapsibleTaskInfoProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b border-theme pb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left py-2 hover:bg-theme-hover rounded px-2 -mx-2 cursor-pointer"
      >
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-theme-fg" />
        ) : (
          <ChevronDown className="w-4 h-4 text-theme-fg" />
        )}
        <h3 className="text-base font-medium text-theme-fg">Task Details</h3>
      </button>

      {isExpanded && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="font-medium text-theme-fg">Description:</span>{' '}
            <span className="text-theme-fg">{task.description || 'N/A'}</span>
          </div>
          <div>
            <span className="font-medium text-theme-fg">Status:</span>{' '}
            <span className="capitalize text-theme-fg">{task.status}</span>
          </div>
          <div>
            <span className="font-medium text-theme-fg">Repository:</span>{' '}
            <span className="text-theme-fg">
              {task.owner}/{task.repo}
            </span>
          </div>
          <div>
            <span className="font-medium text-theme-fg">Branch:</span>{' '}
            <span className="text-theme-fg">{task.branch}</span>
          </div>
          <div>
            <span className="font-medium text-theme-fg">Effort:</span>{' '}
            <span className="text-theme-fg">
              {task.effort ? `${task.effort}h` : 'Not estimated'}
            </span>
          </div>
          <div>
            <span className="font-medium text-theme-fg">Order:</span>{' '}
            <span className="text-theme-fg">
              {task.order !== undefined ? task.order : 'Not set'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
