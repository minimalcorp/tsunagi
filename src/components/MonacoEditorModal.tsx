'use client';

import { useRef, useEffect, useLayoutEffect } from 'react';
import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useTheme } from '@/contexts/ThemeContext';
import { Dialog } from '@/components/ui/Dialog';

export interface MonacoEditorModalProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  /** 編集確定時のコールバック。テキストを受け取り呼び出し元が処理する */
  onSubmit: (text: string) => void;
  initialValue?: string;
  title?: string;
  /** 確定ボタンのラベル（デフォルト: "Submit"） */
  submitLabel?: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

export function MonacoEditorModal({
  open,
  onOpenChange,
  onSubmit,
  initialValue = '',
  title = 'Editor',
  submitLabel = 'Submit',
}: MonacoEditorModalProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const handleSubmitRef = useRef<() => void>(() => {});
  const handleCancelRef = useRef<() => void>(() => {});
  const { effectiveTheme } = useTheme();

  function handleSubmit() {
    const text = editorRef.current?.getValue() ?? '';
    onSubmit(text);
  }
  function handleCancel() {
    editorRef.current?.setValue('');
    onOpenChange({ open: false });
  }
  useLayoutEffect(() => {
    handleSubmitRef.current = handleSubmit;
    handleCancelRef.current = handleCancel;
  });

  // open または initialValue が変化したとき、既にマウント済みのエディタに反映
  useEffect(() => {
    if (open && editorRef.current) {
      editorRef.current.setValue(initialValue ?? '');
      // カーソルを先頭に移動してフォーカス
      editorRef.current.setPosition({ lineNumber: 1, column: 1 });
      editorRef.current.focus();
    }
  }, [open, initialValue]);

  return (
    <Dialog
      open={open}
      onOpenChange={(details) => {
        if (!details.open) {
          editorRef.current?.setValue('');
          onOpenChange(details);
        }
      }}
      title={title}
      maxWidth="xl"
      showCloseButton={true}
      trapFocus={false}
    >
      <div className="space-y-4">
        <div className="border border-theme rounded overflow-hidden" style={{ height: '300px' }}>
          <Editor
            height="300px"
            defaultLanguage="plaintext"
            defaultValue=""
            onMount={(editorInstance, monacoInstance) => {
              editorRef.current = editorInstance;
              // 初期コンテンツをセットしカーソルを先頭に
              editorInstance.setValue(initialValue ?? '');
              editorInstance.setPosition({ lineNumber: 1, column: 1 });
              editorInstance.focus();
              editorInstance.onKeyDown((e) => {
                // Cmd/Ctrl+Enter: 送信
                if (e.keyCode === monacoInstance.KeyCode.Enter && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmitRef.current();
                }
                // Esc: キャンセル（Monaco がイベントを消費するため明示的に処理）
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
        <p className="text-xs text-theme-muted">
          {isMac ? 'Cmd+Enter' : 'Ctrl+Enter'} で{submitLabel}、Esc でキャンセル
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-theme rounded text-theme-fg hover:bg-theme-hover cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-hover cursor-pointer"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
