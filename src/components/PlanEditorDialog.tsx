'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogClose } from './ui/dialog-primitives';
import { Button } from './ui/button';
import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/components/MarkdownComponents';
import { useTheme } from '@/contexts/ThemeContext';
import { Columns2, FileEdit, Eye, Loader2, X } from 'lucide-react';

type ViewMode = 'split' | 'editor' | 'viewer';
type PlanType = 'requirement' | 'design' | 'procedure';

interface PlanEditorDialogProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  planType: PlanType;
  content: string;
  onSave: (content: string) => Promise<void>;
}

const PLAN_TITLES: Record<PlanType, string> = {
  requirement: 'Requirement',
  design: 'Design',
  procedure: 'Procedure',
};

export function PlanEditorDialog({
  open,
  onOpenChange,
  planType,
  content,
  onSave,
}: PlanEditorDialogProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [editedContent, setEditedContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { effectiveTheme } = useTheme();

  // Reset content when dialog opens or content changes
  useEffect(() => {
    setEditedContent(content);
    if (editorRef.current) {
      editorRef.current.setValue(content);
    }
  }, [content, open]);

  const handleSave = useCallback(async () => {
    if (isSaving) return; // 保存中は再実行しない
    setIsSaving(true);
    try {
      const currentContent = editorRef.current?.getValue() || editedContent;
      await onSave(currentContent);
      onOpenChange({ open: false });
    } catch (error) {
      console.error('Failed to save plan:', error);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, editedContent, onSave, onOpenChange]);

  // 常に最新のハンドラーを参照するためのref
  const handleSaveRef = useRef(handleSave);

  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // カスタムイベントリスナーの登録（Monaco Editorのキーバインディング用）
  useEffect(() => {
    const handleSaveEvent = () => {
      handleSaveRef.current();
    };

    window.addEventListener('monaco:planEditorSave', handleSaveEvent);

    return () => {
      window.removeEventListener('monaco:planEditorSave', handleSaveEvent);
    };
  }, []);

  const handleCancel = () => {
    onOpenChange({ open: false });
  };

  const handleEditorChange = (value: string | undefined) => {
    setEditedContent(value || '');
  };

  const handleOpenChange = (openState: boolean) => {
    onOpenChange({ open: openState });
  };

  const title = `Edit ${PLAN_TITLES[planType]}`;

  const viewModes = [
    { value: 'split' as const, icon: Columns2, label: 'Split View' },
    { value: 'editor' as const, icon: FileEdit, label: 'Editor Only' },
    { value: 'viewer' as const, icon: Eye, label: 'Viewer Only' },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal>
      <DialogContent
        showCloseButton={false}
        className="bg-card rounded-xl shadow-xl max-w-7xl h-[90vh] flex flex-col p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <DialogTitle className="text-lg font-semibold leading-none text-foreground">
              {title}
            </DialogTitle>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-accent rounded p-1">
              {viewModes.map(({ value, icon: Icon, label }) => (
                <Button
                  key={value}
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode(value)}
                  className={
                    viewMode === value
                      ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/80'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                  title={label}
                >
                  <Icon className="w-4 h-4" />
                </Button>
              ))}
            </div>
          </div>

          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto text-foreground hover:bg-accent"
              />
            }
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 mb-6">
          <div className={`h-full ${viewMode === 'split' ? 'grid grid-cols-2 gap-4' : ''}`}>
            {/* Editor */}
            {(viewMode === 'split' || viewMode === 'editor') && (
              <div className="flex flex-col h-full min-h-0">
                <h3 className="text-sm font-semibold text-foreground mb-2">Editor</h3>
                <div className="flex-1 min-h-0 border border-border rounded overflow-hidden">
                  <Editor
                    height="100%"
                    defaultLanguage="markdown"
                    defaultValue={content}
                    onChange={handleEditorChange}
                    onMount={async (editor) => {
                      editorRef.current = editor;

                      // Context Keyを設定（このエディタがPlan Editorであることを示す）
                      editor.createContextKey('isPlanEditor', true);

                      // コマンド登録は不要（ClaudePromptEditorで既に登録済み）
                    }}
                    options={{
                      minimap: { enabled: false },
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      fontSize: 14,
                      scrollBeyondLastLine: false,
                      readOnly: false,
                    }}
                    theme={effectiveTheme === 'dark' ? 'vs-dark' : 'vs-light'}
                  />
                </div>
              </div>
            )}

            {/* Viewer */}
            {(viewMode === 'split' || viewMode === 'viewer') && (
              <div className="flex flex-col h-full min-h-0">
                <h3 className="text-sm font-semibold text-foreground mb-2">Preview</h3>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden border border-border rounded p-4 bg-[#1e1e1e]">
                  <div className="prose prose-pre:overflow-x-hidden prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:break-words prose-a:break-all max-w-none text-foreground text-sm break-words overflow-wrap-anywhere">
                    <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                      {editedContent}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 flex-shrink-0">
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSaving ? 'Updating...' : 'Update'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
