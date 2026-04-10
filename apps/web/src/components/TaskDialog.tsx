'use client';

import { useState, useEffect, useMemo, useRef, useCallback, type FormEvent } from 'react';
import type { Repository, Task } from '@minimalcorp/tsunagi-shared';
import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from './MarkdownComponents';
import { useTheme } from '@/contexts/ThemeContext';
import { LoadingSpinner } from './LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { Dialog } from './ui/Dialog';
import { Combobox } from './ui/Combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Code, Eye } from 'lucide-react';
import { apiUrl } from '@/lib/api-url';

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

interface DescriptionEditorViewerProps {
  value: string;
  onChange: (text: string) => void;
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
  theme: string;
  activeTab: 'editor' | 'preview';
  onTabChange: (tab: 'editor' | 'preview') => void;
  disabled?: boolean;
  onFocusChange?: (focused: boolean) => void;
}

function DescriptionEditorViewer({
  value,
  onChange,
  editorRef,
  theme,
  activeTab,
  onTabChange,
  disabled,
  onFocusChange,
}: DescriptionEditorViewerProps) {
  const handleEditorChange = useCallback(
    (text: string | undefined) => {
      onChange(text ?? '');
    },
    [onChange]
  );

  const editorElement = (
    <div className="border border-border rounded overflow-hidden h-full">
      <Editor
        height="100%"
        defaultLanguage="markdown"
        value={value}
        onChange={handleEditorChange}
        onMount={(editorInstance) => {
          editorRef.current = editorInstance;
          editorInstance.layout();
          // フォーカス状態を親に通知: ダイアログの Esc 閉じ制御に使用
          editorInstance.onDidFocusEditorText(() => onFocusChange?.(true));
          editorInstance.onDidBlurEditorText(() => onFocusChange?.(false));
        }}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'on',
          wordWrap: 'on',
          fontSize: 13,
          scrollBeyondLastLine: false,
          readOnly: disabled,
        }}
        theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
      />
    </div>
  );

  const previewElement = (
    <div className="border border-border rounded overflow-y-auto h-full p-4 prose prose-sm prose-slate dark:prose-invert max-w-none">
      {value ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {value}
        </ReactMarkdown>
      ) : (
        <p className="text-muted-foreground italic">No content</p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* SP: tab switcher */}
      <div className="flex gap-1 mb-2 md:hidden flex-shrink-0">
        <Button
          type="button"
          variant={activeTab === 'editor' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onTabChange('editor')}
        >
          <Code className="w-4 h-4 mr-1" />
          Editor
        </Button>
        <Button
          type="button"
          variant={activeTab === 'preview' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onTabChange('preview')}
        >
          <Eye className="w-4 h-4 mr-1" />
          Preview
        </Button>
      </div>

      {/* PC: side-by-side */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-4 flex-1 min-h-0">
        {editorElement}
        {previewElement}
      </div>

      {/* SP: single panel */}
      <div className="md:hidden flex-1 min-h-0">
        {activeTab === 'editor' ? editorElement : previewElement}
      </div>
    </div>
  );
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
  const [descriptionTab, setDescriptionTab] = useState<'editor' | 'preview'>('editor');
  // description の monaco editor にフォーカスがあるかどうか。フォーカス中は Esc 閉じを無効化する
  const [isDescriptionEditorFocused, setIsDescriptionEditorFocused] = useState(false);
  const descriptionEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { effectiveTheme } = useTheme();

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
        const response = await fetch(apiUrl(`/api/repos/${owner}/${repo}/branches`));
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
        const validateRes = await fetch(apiUrl('/api/tasks/validate'), {
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

        // 3. Create task async (notification is handled by useTaskEvents via Socket.IO)
        const notificationId = toast.loading('Creating task...', taskData.title);

        try {
          const response = await fetch(apiUrl('/api/tasks'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData),
          });

          if (!response.ok) {
            throw new Error('Failed to create task');
          }

          toast.dismiss(notificationId);
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
      maxWidth={isCreateMode ? '2xl' : '6xl'}
      fullScreen={!isCreateMode}
      showCloseButton={!isLoading}
      dismissOnEsc={!isDescriptionEditorFocused}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-card bg-opacity-90 rounded-lg flex items-center justify-center z-10">
          <LoadingSpinner
            size="lg"
            message={isCreateMode ? 'Creating task...' : 'Saving task...'}
          />
        </div>
      )}

      {fieldErrors.global && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/50 rounded text-destructive text-sm">
          {fieldErrors.global}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={
          isCreateMode ? 'space-y-4' : 'flex flex-col gap-4 flex-1 min-h-0 overflow-hidden'
        }
      >
        {/* Create mode: Repository選択 */}
        {isCreateMode && (
          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">Repository *</label>
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
          <label className="block text-sm font-medium mb-1 text-foreground">Title *</label>
          <Input
            type="text"
            required
            maxLength={200}
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full"
            disabled={isLoading}
          />
        </div>

        {/* Edit mode: Read-only info */}
        {!isCreateMode && task && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 bg-muted/50 rounded-md text-sm">
            <div>
              <span className="font-medium text-foreground">Repository</span>
              <p className="text-muted-foreground">
                {task.owner}/{task.repo}
              </p>
            </div>
            <div>
              <span className="font-medium text-foreground">Branch</span>
              <p className="text-muted-foreground">{task.branch}</p>
            </div>
            <div>
              <span className="font-medium text-foreground">Base Branch</span>
              <p className="text-muted-foreground">{task.baseBranch || 'N/A'}</p>
            </div>
            <div>
              <span className="font-medium text-foreground">Worktree</span>
              <p className="text-muted-foreground capitalize">{task.worktreeStatus}</p>
            </div>
          </div>
        )}

        {/* Description */}
        <div className={!isCreateMode ? 'flex flex-col flex-1 min-h-0' : ''}>
          <label className="block text-sm font-medium mb-1 text-foreground flex-shrink-0">
            Description
          </label>
          {!isCreateMode ? (
            <DescriptionEditorViewer
              value={formData.description}
              onChange={(text) => setFormData((prev) => ({ ...prev, description: text }))}
              editorRef={descriptionEditorRef}
              theme={effectiveTheme}
              activeTab={descriptionTab}
              onTabChange={setDescriptionTab}
              disabled={isLoading}
              onFocusChange={setIsDescriptionEditorFocused}
            />
          ) : (
            <Textarea
              maxLength={5000}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-24 w-full"
              disabled={isLoading}
            />
          )}
        </div>

        {/* Edit mode: Status, Effort, Order */}
        {!isCreateMode && (
          <div className="grid grid-cols-3 gap-4 flex-shrink-0">
            <div>
              <label className="block text-sm font-medium mb-1 text-foreground">Status</label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as Task['status'] })
                }
                className="w-full h-9 pl-3 pr-10 py-1 rounded-md border border-input bg-transparent text-sm shadow-xs text-foreground"
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
            <div>
              <label className="block text-sm font-medium mb-1 text-foreground">Effort (h)</label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="40"
                value={formData.effort ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, effort: parseFloat(e.target.value) || undefined })
                }
                className="w-full"
                placeholder="2.5"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-foreground">Order</label>
              <Input
                type="number"
                min="0"
                value={formData.order ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, order: parseInt(e.target.value) || undefined })
                }
                className="w-full"
                placeholder="0"
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        {/* Create mode: Base Branch */}
        {isCreateMode && (
          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">Base Branch *</label>
            {isFetchingBranches ? (
              <div className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-muted-foreground flex items-center gap-2">
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
              <div className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm text-muted-foreground flex items-center">
                {branchError || 'Select repository first'}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Your new branch will be created from this branch
            </p>
          </div>
        )}

        {/* Create mode: New Branch Name */}
        {isCreateMode && (
          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">
              New Branch Name *
            </label>
            <Input
              type="text"
              required
              maxLength={255}
              value={formData.branch}
              onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
              className={`w-full ${fieldErrors.branch ? 'border-destructive' : ''}`}
              placeholder="feature/new-feature"
              disabled={isLoading}
              aria-invalid={!!fieldErrors.branch}
            />
            {fieldErrors.branch && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.branch}</p>
            )}
            {!fieldErrors.branch && (
              <p className="text-xs text-muted-foreground mt-1">
                Will be created from {formData.baseBranch || 'base branch'}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            className="active:scale-95"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="lg"
            className="active:scale-95"
            disabled={isLoading || (isCreateMode && isFetchingBranches)}
          >
            {submitButtonText}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
