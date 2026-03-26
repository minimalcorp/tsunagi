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
    <div className="border-b border-border py-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left py-2 hover:bg-accent rounded-md px-2 -mx-2 cursor-pointer"
      >
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-foreground" />
        )}
        <h3 className="text-base font-medium text-foreground">Task Details</h3>
      </button>

      {isExpanded && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="font-medium text-foreground">Description:</span>{' '}
            <span className="text-foreground">{task.description || 'N/A'}</span>
          </div>
          <div>
            <span className="font-medium text-foreground">Status:</span>{' '}
            <span className="capitalize text-foreground">{task.status}</span>
          </div>
          <div>
            <span className="font-medium text-foreground">Repository:</span>{' '}
            <span className="text-foreground">
              {task.owner}/{task.repo}
            </span>
          </div>
          <div>
            <span className="font-medium text-foreground">Branch:</span>{' '}
            <span className="text-foreground">{task.branch}</span>
          </div>
          <div>
            <span className="font-medium text-foreground">Effort:</span>{' '}
            <span className="text-foreground">
              {task.effort ? `${task.effort}h` : 'Not estimated'}
            </span>
          </div>
          <div>
            <span className="font-medium text-foreground">Order:</span>{' '}
            <span className="text-foreground">
              {task.order !== undefined ? task.order : 'Not set'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
