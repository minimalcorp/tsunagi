'use client';

import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useTheme } from '@/contexts/ThemeContext';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/button';

export interface MonacoEditorModalProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  /** 編集確定時のコールバック。テキストを受け取り呼び出し元が処理する */
  onSubmit: (text: string) => void;
  initialValue?: string;
  title?: string;
  /** 確定ボタンのラベル（デフォルト: "Submit"） */
  submitLabel?: string;
  /** Monaco editorの言語（デフォルト: "plaintext"） */
  language?: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

function moveCursorToEnd(instance: editor.IStandaloneCodeEditor) {
  const model = instance.getModel();
  if (!model) return;
  const lastLine = model.getLineCount();
  const lastColumn = model.getLineMaxColumn(lastLine);
  instance.setPosition({ lineNumber: lastLine, column: lastColumn });
}

export function MonacoEditorModal({
  open,
  onOpenChange,
  onSubmit,
  initialValue = '',
  title = 'Editor',
  submitLabel = 'Submit',
  language = 'plaintext',
}: MonacoEditorModalProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const handleSubmitRef = useRef<() => void>(() => {});
  const handleCancelRef = useRef<() => void>(() => {});
  // open 状態を ref で保持: onDidLayoutChange ハンドラから参照するため
  const openRef = useRef(open);
  // monaco editor にフォーカスがあるかどうか。フォーカス中は Esc でのダイアログ閉じを無効化する
  const [isEditorFocused, setIsEditorFocused] = useState(false);
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
    moveCursorToEnd(editorRef.current);
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
      maxWidth="4xl"
      showCloseButton={true}
      trapFocus={false}
      restoreFocus={false}
      dismissOnEsc={!isEditorFocused}
    >
      <div className="space-y-4">
        <div
          className="border border-border rounded overflow-hidden"
          style={{ height: 'clamp(200px, 50vh, 600px)' }}
        >
          <Editor
            height="100%"
            defaultLanguage={language}
            defaultValue=""
            onMount={(editorInstance, monacoInstance) => {
              editorRef.current = editorInstance;
              editorInstance.setValue(initialValue ?? '');
              moveCursorToEnd(editorInstance);

              // レイアウト変化時に自動フォーカス（Dialog 表示で 0→実サイズに変化した瞬間）
              editorInstance.onDidLayoutChange(() => {
                if (openRef.current && !editorInstance.hasTextFocus()) {
                  editorInstance.focus();
                }
              });

              // フォーカス状態を state に同期: Esc 無効化の判定に使用
              editorInstance.onDidFocusEditorText(() => setIsEditorFocused(true));
              editorInstance.onDidBlurEditorText(() => setIsEditorFocused(false));

              // 初回マウント時
              editorInstance.layout();
              editorInstance.focus();

              editorInstance.onKeyDown((e) => {
                if (e.keyCode === monacoInstance.KeyCode.Enter && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmitRef.current();
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
        <p className="text-xs text-muted-foreground">
          {isMac ? 'Cmd+Enter' : 'Ctrl+Enter'} で{submitLabel}
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
    </Dialog>
  );
}
