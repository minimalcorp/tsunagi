'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog as ArkDialog } from '@ark-ui/react/dialog';
import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/components/MarkdownComponents';
import { useTheme } from '@/contexts/ThemeContext';
import { Columns2, FileEdit, Eye, Loader2 } from 'lucide-react';

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

  const handleCancel = () => {
    onOpenChange({ open: false });
  };

  const handleEditorChange = (value: string | undefined) => {
    setEditedContent(value || '');
  };

  const title = `Edit ${PLAN_TITLES[planType]}`;

  const viewModes = [
    { value: 'split' as const, icon: Columns2, label: 'Split View' },
    { value: 'editor' as const, icon: FileEdit, label: 'Editor Only' },
    { value: 'viewer' as const, icon: Eye, label: 'Viewer Only' },
  ];

  return (
    <ArkDialog.Root open={open} onOpenChange={onOpenChange} modal trapFocus>
      <ArkDialog.Backdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
      <ArkDialog.Positioner className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <ArkDialog.Content className="bg-theme-card rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <ArkDialog.Title className="text-xl font-bold text-theme-fg">{title}</ArkDialog.Title>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-theme-hover rounded p-1">
                {viewModes.map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    onClick={() => setViewMode(value)}
                    className={`px-2 py-1 rounded text-sm cursor-pointer ${
                      viewMode === value
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-theme-muted hover:text-theme-fg'
                    }`}
                    title={label}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            <ArkDialog.CloseTrigger className="ml-auto p-1 rounded hover:bg-theme-hover text-theme-fg cursor-pointer">
              <span className="text-2xl leading-none">&times;</span>
            </ArkDialog.CloseTrigger>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-h-0 mb-6">
            <div className={`h-full ${viewMode === 'split' ? 'grid grid-cols-2 gap-4' : ''}`}>
              {/* Editor */}
              {(viewMode === 'split' || viewMode === 'editor') && (
                <div className="flex flex-col h-full min-h-0">
                  <h3 className="text-sm font-semibold text-theme-fg mb-2">Editor</h3>
                  <div className="flex-1 min-h-0 border border-theme rounded overflow-hidden">
                    <Editor
                      height="100%"
                      defaultLanguage="markdown"
                      value={editedContent}
                      onChange={handleEditorChange}
                      onMount={async (editor) => {
                        editorRef.current = editor;

                        // monaco-editorの型をインポート
                        const monaco = await import('monaco-editor');

                        // Cmd+Enter (Mac) / Ctrl+Enter (Windows/Linux) で保存
                        editor.addCommand(
                          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                          () => {
                            handleSaveRef.current();
                          },
                          'editorTextFocus'
                        );
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
                  <h3 className="text-sm font-semibold text-theme-fg mb-2">Preview</h3>
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden border border-theme rounded p-4 bg-[#1e1e1e]">
                    <div className="prose prose-pre:overflow-x-hidden prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:break-words prose-a:break-all max-w-none text-theme-fg text-sm break-words overflow-wrap-anywhere">
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
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2 bg-theme-card text-theme-fg rounded-lg hover:bg-theme-hover border border-theme font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-hover font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSaving ? 'Updating...' : 'Update'}
            </button>
          </div>
        </ArkDialog.Content>
      </ArkDialog.Positioner>
    </ArkDialog.Root>
  );
}
