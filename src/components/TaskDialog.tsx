'use client';

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import type { Repository, Task } from '@/lib/types';
import { LoadingSpinner } from './LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { Dialog } from './ui/Dialog';
import { Combobox } from './ui/Combobox';

interface FieldError {
  field: string;
  message: string;
}

interface CreateTaskData {
  title: string;
  description: string;
  owner: string;
  repo: string;
  branch: string;
  baseBranch: string;
}

interface UpdateTaskData {
  title: string;
  description: string;
  status: Task['status'];
  effort?: number;
  order?: number;
}

interface TaskDialogProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;

  // Create mode用
  repositories?: Repository[];

  // Edit mode用
  task?: Task;
  onUpdate?: (
    taskId: string,
    updates: UpdateTaskData
  ) => Promise<{ success: boolean; errors?: FieldError[] }>;
}

export function TaskDialog({
  mode,
  isOpen,
  onClose,
  repositories = [],
  task,
  onUpdate,
}: TaskDialogProps) {
  const toast = useToast();

  // Create mode用のstate
  const [combinedRepo, setCombinedRepo] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState('');
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);
  const [branchError, setBranchError] = useState('');

  // 共通のstate
  const [formData, setFormData] = useState<CreateTaskData & Partial<UpdateTaskData>>({
    title: '',
    description: '',
    owner: '',
    repo: '',
    branch: '',
    baseBranch: '',
    status: 'backlog',
    effort: undefined,
    order: undefined,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Edit modeの初期化
  useEffect(() => {
    if (mode === 'edit' && task) {
      setFormData({
        title: task.title,
        description: task.description,
        owner: task.owner,
        repo: task.repo,
        branch: task.branch,
        baseBranch: '',
        status: task.status,
        effort: task.effort,
        order: task.order,
      });
    }
  }, [mode, task, isOpen]);

  const repoOptions = useMemo(() => {
    return repositories.map((repo) => ({
      value: `${repo.owner}/${repo.repo}`,
      label: `${repo.owner}/${repo.repo}`,
    }));
  }, [repositories]);

  const branchOptions = useMemo(() => {
    return branches.map((branch) => ({
      value: branch,
      label: branch === defaultBranch ? `${branch} (default)` : branch,
    }));
  }, [branches, defaultBranch]);

  const handleRepositoryChange = (value: string | string[]) => {
    const selectedValue = Array.isArray(value) ? value[0] || '' : value;
    setCombinedRepo(selectedValue);

    if (selectedValue) {
      const [owner, repo] = selectedValue.split('/');
      setFormData((prev) => ({
        ...prev,
        owner,
        repo,
        baseBranch: '',
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        owner: '',
        repo: '',
        baseBranch: '',
      }));
    }
  };

  useEffect(() => {
    if (mode !== 'create') return;
    if (!combinedRepo) {
      setBranches([]);
      setDefaultBranch('');
      setFormData((prev) => ({ ...prev, baseBranch: '' }));
      return;
    }

    const fetchBranches = async () => {
      setIsFetchingBranches(true);
      setBranchError('');
      try {
        const [owner, repo] = combinedRepo.split('/');
        const response = await fetch(`/api/repos/${owner}/${repo}/branches`);
        if (!response.ok) throw new Error('Failed to fetch branches');

        const data = await response.json();
        setBranches(data.data.branches);
        setDefaultBranch(data.data.defaultBranch);
        setFormData((prev) => ({ ...prev, baseBranch: data.data.defaultBranch }));
      } catch (error) {
        console.error('Failed to fetch branches:', error);
        setBranchError('Failed to load branches. Repository may not be initialized.');
        setBranches([]);
        setDefaultBranch('');
      } finally {
        setIsFetchingBranches(false);
      }
    };

    fetchBranches();
  }, [combinedRepo, mode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    if (mode === 'create') {
      // Create mode: validation -> close dialog -> async create with notification
      setIsLoading(true);

      try {
        // 1. Validation API (blocking)
        const validateRes = await fetch('http://localhost:2792/tasks/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title,
            owner: formData.owner,
            repo: formData.repo,
            branch: formData.branch,
          }),
        });

        const validateData = await validateRes.json();

        if (!validateData.valid) {
          const errorsMap: Record<string, string> = {};
          validateData.errors.forEach((err: FieldError) => {
            errorsMap[err.field] = err.message;
          });
          setFieldErrors(errorsMap);
          setIsLoading(false);
          return;
        }

        // 2. Close dialog immediately after validation
        const taskData = {
          title: formData.title,
          description: formData.description,
          owner: formData.owner,
          repo: formData.repo,
          branch: formData.branch,
          baseBranch: formData.baseBranch,
        };

        onClose();
        setCombinedRepo('');
        setFormData({
          title: '',
          description: '',
          owner: '',
          repo: '',
          branch: '',
          baseBranch: '',
          status: 'backlog',
          effort: undefined,
          order: undefined,
        });
        setIsLoading(false);

        // 3. Create task async with notification
        const notificationId = toast.loading('Creating task...', taskData.title);

        try {
          const response = await fetch('http://localhost:2792/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData),
          });

          if (!response.ok) {
            throw new Error('Failed to create task');
          }

          toast.success(notificationId, 'Successfully created task', taskData.title);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          toast.error(notificationId, 'Failed to create task', errorMessage);
        }
      } catch (error) {
        setIsLoading(false);
        const errorMessage = error instanceof Error ? error.message : 'Validation failed';
        toast.error(undefined, 'Validation failed', errorMessage);
      }
    } else if (mode === 'edit' && onUpdate && task) {
      // Edit mode: use existing callback pattern
      setIsLoading(true);

      try {
        const result = await onUpdate(task.id, {
          title: formData.title,
          description: formData.description,
          status: formData.status!,
          effort: formData.effort,
          order: formData.order,
        });

        if (result.success) {
          onClose();
        } else if (result.errors) {
          const errorsMap: Record<string, string> = {};
          result.errors.forEach((err) => {
            errorsMap[err.field] = err.message;
          });
          setFieldErrors(errorsMap);
        }
      } catch (error) {
        console.error('Failed to update task:', error);
        setFieldErrors({
          global:
            error instanceof Error ? error.message : 'Failed to update task. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const isCreateMode = mode === 'create';
  const dialogTitle = isCreateMode ? 'Add New Task' : 'Edit Task';
  const submitButtonText = isCreateMode ? 'Create' : 'Save';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(details) => {
        if (!details.open && !isLoading) {
          onClose();
        }
      }}
      title={dialogTitle}
      showCloseButton={!isLoading}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-theme-card bg-opacity-90 rounded-lg flex items-center justify-center z-10">
          <LoadingSpinner
            size="lg"
            message={isCreateMode ? 'Creating task...' : 'Saving task...'}
          />
        </div>
      )}

      {fieldErrors.global && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-500 text-sm">
          {fieldErrors.global}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Create mode: Repository選択 */}
        {isCreateMode && (
          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Repository *</label>
            <Combobox
              options={repoOptions}
              value={combinedRepo}
              onChange={handleRepositoryChange}
              placeholder="Select repository"
              disabled={isLoading}
            />
          </div>
        )}

        {/* 共通: Title */}
        <div>
          <label className="block text-sm font-medium mb-1 text-theme-fg">Title *</label>
          <input
            type="text"
            required
            maxLength={200}
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border border-theme rounded text-theme-fg bg-theme-card"
            disabled={isLoading}
          />
        </div>

        {/* 共通: Description */}
        <div>
          <label className="block text-sm font-medium mb-1 text-theme-fg">Description</label>
          <textarea
            maxLength={5000}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-theme rounded h-24 text-theme-fg bg-theme-card"
            disabled={isLoading}
          />
        </div>

        {/* Edit mode: Status */}
        {!isCreateMode && (
          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Status</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as Task['status'] })
              }
              className="w-full pl-3 pr-10 py-2 border border-theme rounded text-theme-fg bg-theme-card"
              disabled={isLoading}
            >
              <option value="backlog">Backlog</option>
              <option value="planning">Planning</option>
              <option value="tasking">Tasking</option>
              <option value="coding">Coding</option>
              <option value="reviewing">Reviewing</option>
              <option value="done">Done</option>
            </select>
          </div>
        )}

        {/* Edit mode: Effort */}
        {!isCreateMode && (
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
              disabled={isLoading}
            />
          </div>
        )}

        {/* Edit mode: Order */}
        {!isCreateMode && (
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
              disabled={isLoading}
            />
          </div>
        )}

        {/* Create mode: Base Branch */}
        {isCreateMode && (
          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">Base Branch *</label>
            {isFetchingBranches ? (
              <div className="w-full h-10 px-3 border border-theme rounded text-theme-muted bg-theme-card flex items-center gap-2">
                <LoadingSpinner size="sm" />
                <span className="text-xs">Loading branches...</span>
              </div>
            ) : branches.length > 0 ? (
              <Combobox
                options={branchOptions}
                value={formData.baseBranch}
                onChange={(value) => {
                  const selectedValue = Array.isArray(value) ? value[0] || '' : value;
                  setFormData({ ...formData, baseBranch: selectedValue });
                }}
                placeholder="Select base branch"
                disabled={isLoading}
              />
            ) : (
              <div className="w-full h-10 px-3 border border-theme rounded text-sm text-theme-muted bg-theme-card flex items-center">
                {branchError || 'Select repository first'}
              </div>
            )}
            <p className="text-xs text-theme-muted mt-1">
              Your new branch will be created from this branch
            </p>
          </div>
        )}

        {/* Create mode: New Branch Name */}
        {isCreateMode && (
          <div>
            <label className="block text-sm font-medium mb-1 text-theme-fg">
              New Branch Name *
            </label>
            <input
              type="text"
              required
              maxLength={255}
              value={formData.branch}
              onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
              className={`w-full px-3 py-2 border rounded text-theme-fg bg-theme-card ${
                fieldErrors.branch ? 'border-red-500 input-error' : 'border-theme'
              }`}
              placeholder="feature/new-feature"
              disabled={isLoading}
            />
            {fieldErrors.branch && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.branch}</p>
            )}
            {!fieldErrors.branch && (
              <p className="text-xs text-theme-muted mt-1">
                Will be created from {formData.baseBranch || 'base branch'}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-theme rounded text-theme-fg active:scale-95 transition-transform cursor-pointer"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-white rounded active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            disabled={isLoading || (isCreateMode && isFetchingBranches)}
          >
            {submitButtonText}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
