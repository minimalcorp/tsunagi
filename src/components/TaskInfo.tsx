'use client';

import { useState } from 'react';
import type { Task } from '@/lib/types';

interface TaskInfoProps {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
}

export function TaskInfo({ task, onUpdate }: TaskInfoProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    title: task.title,
    description: task.description,
    plan: task.plan,
    status: task.status,
    effort: task.effort,
    order: task.order,
  });

  const handleSave = async () => {
    await onUpdate(task.id, formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({
      title: task.title,
      description: task.description,
      plan: task.plan,
      status: task.status,
      effort: task.effort,
      order: task.order,
    });
    setIsEditing(false);
  };

  return (
    <div className="border-b border-theme pb-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-theme-fg">Task Information</h2>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 text-primary hover:text-primary-600"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1 bg-primary text-white rounded hover:bg-primary-hover"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 bg-theme-hover text-theme-fg rounded hover:opacity-80"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-theme rounded h-24 text-theme-fg bg-theme-card"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Plan</label>
            <textarea
              value={formData.plan ?? ''}
              onChange={(e) => setFormData({ ...formData, plan: e.target.value || undefined })}
              className="w-full px-3 py-2 border border-theme rounded h-32 text-theme-fg bg-theme-card"
              placeholder="実行計画を記述してください..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Status</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as Task['status'] })
              }
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
            >
              <option value="backlog">Backlog</option>
              <option value="planning">Planning</option>
              <option value="tasking">Tasking</option>
              <option value="coding">Coding</option>
              <option value="reviewing">Reviewing</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Effort (hours)</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="40"
              value={formData.effort ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, effort: parseFloat(e.target.value) || undefined })
              }
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              placeholder="e.g. 2.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Order</label>
            <input
              type="number"
              min="0"
              value={formData.order ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, order: parseInt(e.target.value) || undefined })
              }
              className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              placeholder="e.g. 0 (highest priority)"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium text-theme-fg">Title:</span>{' '}
            <span className="text-theme-fg">{task.title}</span>
          </div>
          <div>
            <span className="font-medium text-theme-fg">Description:</span>{' '}
            <span className="text-theme-fg">{task.description || 'N/A'}</span>
          </div>
          <div>
            <span className="font-medium text-theme-fg">Plan:</span>
            <pre className="mt-1 whitespace-pre-wrap text-sm text-theme-muted">
              {task.plan || 'No plan yet'}
            </pre>
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
          <div>
            <span className="font-medium text-theme-fg">Claude State:</span>{' '}
            <span className="text-theme-fg">{task.claudeState}</span>
          </div>
          <div className="text-xs text-theme-muted">
            Created: {new Date(task.createdAt).toLocaleString()}
          </div>
          <div className="text-xs text-theme-muted">
            Updated: {new Date(task.updatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
