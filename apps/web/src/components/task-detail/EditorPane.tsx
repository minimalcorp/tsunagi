'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Editor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { useSubmitOnSend } from '@/hooks/useTaskViewMode';
import { MONACO_INDENT_OPTIONS } from '@/lib/monaco-options';
import { getFocusTarget, registerFocusTarget, setPaneFocusTarget } from '@/lib/focus-target';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

interface EditorPaneProps {
  value: string;
  onChange: (value: string) => void;
  /** 送信先のタブが接続中か */
  canSend: boolean;
  /** 入力先のタブが無い間は編集させない */
  readOnly: boolean;
  /** アクティブなタブへ送信する。送信できたら true */
  onSend: (text: string, submit: boolean) => boolean;
  /** 上部ツールバーの右端に出す要素。無ければツールバーを出さない */
  toolbarEnd?: ReactNode;
}

/** アクティブなタブへ送る Markdown を書くペイン */
export function EditorPane({
  value,
  onChange,
  canSend,
  readOnly,
  onSend,
  toolbarEnd,
}: EditorPaneProps) {
  const { effectiveTheme } = useTheme();
  const { submitOnSend, setSubmitOnSend } = useSubmitOnSend();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const isSendable = canSend && value.trim() !== '';

  function handleSend() {
    // state の反映を待たず、入力直後に押された場合も最新の内容を送る
    const text = editorRef.current?.getValue() ?? value;
    if (!canSend || text.trim() === '') return;
    if (onSend(text, submitOnSend)) onChange('');
  }

  // Monaco のキーハンドラはマウント時に一度だけ登録するため、最新の処理を ref で参照する
  const handleSendRef = useRef(handleSend);
  useLayoutEffect(() => {
    handleSendRef.current = handleSend;
  });

  useEffect(() => registerFocusTarget('editor', () => editorRef.current?.focus()), []);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden rounded-lg border border-border bg-card dark:rounded-none dark:border-0">
      {toolbarEnd && (
        <div className="flex items-center justify-end px-2 py-1 border-b border-border flex-shrink-0 bg-card">
          {toolbarEnd}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="markdown"
          value={value}
          onChange={(text) => onChange(text ?? '')}
          onMount={(instance, monaco) => {
            editorRef.current = instance;
            instance.onDidFocusEditorText(() => setPaneFocusTarget('editor'));
            instance.onKeyDown((e) => {
              if (e.keyCode === monaco.KeyCode.Enter && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.stopPropagation();
                handleSendRef.current();
              }
            });
            if (getFocusTarget() === 'editor') {
              // 表示直後は実サイズが未反映で focus が効かないため、先に layout する
              instance.layout();
              instance.focus();
            }
          }}
          options={{
            ...MONACO_INDENT_OPTIONS,
            minimap: { enabled: false },
            lineNumbers: 'on',
            wordWrap: 'on',
            fontSize: 13,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            readOnly,
          }}
          theme={effectiveTheme === 'dark' ? 'vs-dark' : 'vs-light'}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 p-2 border-t border-border flex-shrink-0">
        <span className="mr-auto text-xs text-muted-foreground">
          {isMac ? 'Cmd+Enter' : 'Ctrl+Enter'} で送信
        </span>
        <label
          className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none"
          title="ON: 送信後に Enter を押して確定します。OFF: テキストを入力するだけで確定しません"
        >
          <input
            type="checkbox"
            checked={submitOnSend}
            onChange={(e) => setSubmitOnSend(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          送信後にEnter
        </label>
        <Button size="sm" onClick={handleSend} disabled={!isSendable}>
          <SendHorizontal className="w-4 h-4" />
          送信
        </Button>
      </div>
    </div>
  );
}
