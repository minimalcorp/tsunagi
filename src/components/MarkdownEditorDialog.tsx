'use client';

import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from './MarkdownComponents';
import { useTheme } from '@/contexts/ThemeContext';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';
import { Code, Eye } from 'lucide-react';

export interface MarkdownEditorDialogProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onSubmit: (text: string) => void;
  initialValue?: string;
  title?: string;
  submitLabel?: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

function moveCursorToEnd(instance: editor.IStandaloneCodeEditor) {
  const model = instance.getModel();
  if (!model) return;
  const lastLine = model.getLineCount();
  const lastColumn = model.getLineMaxColumn(lastLine);
  instance.setPosition({ lineNumber: lastLine, column: lastColumn });
}

interface EditorContentProps {
  initialValue: string;
  submitLabel: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

function EditorContent({ initialValue, submitLabel, onSubmit, onCancel }: EditorContentProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const handleSubmitRef = useRef<() => void>(() => {});
  const handleCancelRef = useRef<() => void>(() => {});
  const { effectiveTheme } = useTheme();

  const [preview, setPreview] = useState(initialValue);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  function handleSubmit() {
    const text = editorRef.current?.getValue() ?? '';
    onSubmit(text);
  }

  function handleCancel() {
    onCancel();
  }

  useLayoutEffect(() => {
    handleSubmitRef.current = handleSubmit;
    handleCancelRef.current = handleCancel;
  });

  // Focus editor on mount
  useEffect(() => {
    if (!editorRef.current) return;
    const timer = setTimeout(() => {
      editorRef.current?.layout();
      editorRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    setPreview(value ?? '');
  }, []);

  const editorElement = (
    <div className="border border-border rounded overflow-hidden h-full">
      <Editor
        height="100%"
        defaultLanguage="markdown"
        defaultValue={initialValue}
        onChange={handleEditorChange}
        onMount={(editorInstance, monacoInstance) => {
          editorRef.current = editorInstance;
          moveCursorToEnd(editorInstance);

          editorInstance.onDidLayoutChange(() => {
            if (!editorInstance.hasTextFocus()) {
              editorInstance.focus();
            }
          });

          editorInstance.layout();
          editorInstance.focus();

          editorInstance.onKeyDown((e) => {
            if (e.keyCode === monacoInstance.KeyCode.Enter && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.stopPropagation();
              handleSubmitRef.current();
            }
            if (e.keyCode === monacoInstance.KeyCode.Escape) {
              e.preventDefault();
              e.stopPropagation();
              handleCancelRef.current();
            }
          });
        }}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'on',
          wordWrap: 'on',
          fontSize: 13,
          scrollBeyondLastLine: false,
        }}
        theme={effectiveTheme === 'dark' ? 'vs-dark' : 'vs-light'}
      />
    </div>
  );

  const previewElement = (
    <div className="border border-border rounded overflow-y-auto h-full p-4 prose prose-sm prose-slate dark:prose-invert max-w-none">
      {preview ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {preview}
        </ReactMarkdown>
      ) : (
        <p className="text-muted-foreground italic">No content</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* SP: tab switcher */}
      <div className="flex gap-1 md:hidden">
        <Button
          type="button"
          variant={activeTab === 'editor' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('editor')}
        >
          <Code className="w-4 h-4 mr-1" />
          Editor
        </Button>
        <Button
          type="button"
          variant={activeTab === 'preview' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('preview')}
        >
          <Eye className="w-4 h-4 mr-1" />
          Preview
        </Button>
      </div>

      {/* PC: side-by-side */}
      <div
        className="hidden md:grid md:grid-cols-2 md:gap-4"
        style={{ height: 'clamp(300px, 55vh, 700px)' }}
      >
        {editorElement}
        {previewElement}
      </div>

      {/* SP: single panel */}
      <div className="md:hidden" style={{ height: 'clamp(250px, 50vh, 500px)' }}>
        {activeTab === 'editor' ? editorElement : previewElement}
      </div>

      <p className="text-xs text-muted-foreground">
        {isMac ? 'Cmd+Enter' : 'Ctrl+Enter'} で{submitLabel}、Esc でキャンセル
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="lg" onClick={handleCancel}>
          Cancel
        </Button>
        <Button size="lg" onClick={handleSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function MarkdownEditorDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValue = '',
  title = 'Edit Description',
  submitLabel = 'Apply',
}: MarkdownEditorDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(details) => {
        if (!details.open) {
          onOpenChange(details);
        }
      }}
      title={title}
      maxWidth="6xl"
      showCloseButton={true}
      trapFocus={false}
      restoreFocus={false}
    >
      {open && (
        <EditorContent
          initialValue={initialValue}
          submitLabel={submitLabel}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange({ open: false })}
        />
      )}
    </Dialog>
  );
}
