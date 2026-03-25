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
  // open 状態を ref で保持: onDidLayoutChange ハンドラから参照するため
  const openRef = useRef(open);
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
    openRef.current = open;
  });

  // open が true になったとき editor.layout() を呼ぶ。
  // layout() によりサイズが 0→実サイズに変わると onDidLayoutChange が発火し、
  // そこで focus() が呼ばれる（onMount で登録済み）。
  useEffect(() => {
    if (!open || !editorRef.current) return;
    editorRef.current.setValue(initialValue ?? '');
    editorRef.current.setPosition({ lineNumber: 1, column: 1 });
    // layout() → onDidLayoutChange → focus() のチェーンを起動
    editorRef.current.layout();

    // フォールバック: onDidLayoutChange が発火しない場合（サイズ変化なし等）に備える
    const timer = setTimeout(() => {
      if (openRef.current) {
        editorRef.current?.layout();
        editorRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
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
              editorInstance.setValue(initialValue ?? '');
              editorInstance.setPosition({ lineNumber: 1, column: 1 });

              // レイアウト変化時に自動フォーカス（Dialog 表示で 0→実サイズに変化した瞬間）
              editorInstance.onDidLayoutChange(() => {
                if (openRef.current && !editorInstance.hasTextFocus()) {
                  editorInstance.focus();
                }
              });

              // 初回マウント時
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
