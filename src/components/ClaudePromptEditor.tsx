'use client';

import { Editor } from '@monaco-editor/react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { editor } from 'monaco-editor';
import type { ClaudeSession } from '@/lib/types';
import { useTheme } from '@/contexts/ThemeContext';
import { ClaudeState } from '@/components/ClaudeState';
import { getClaudeStatus } from '@/lib/claude-status';
import { Send, Square } from 'lucide-react';

interface ClaudePromptEditorProps {
  session: ClaudeSession;
  prompt: string;
  onExecute: (sessionId: string, prompt: string) => Promise<void>;
  onInterrupt: (sessionId: string) => Promise<void>;
  onPromptChange: (prompt: string) => void;
}

export function ClaudePromptEditor({
  session,
  prompt,
  onExecute,
  onInterrupt,
  onPromptChange,
}: ClaudePromptEditorProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { effectiveTheme } = useTheme();

  const handleExecute = useCallback(async () => {
    const prompt = editorRef.current?.getValue() || '';
    if (!prompt.trim() || isExecuting) return;
    try {
      setIsExecuting(true);
      await onExecute(session.id, prompt);
      // 親コンポーネントがpromptsをクリアし、useEffectがエディタを更新
    } catch (error) {
      console.error('Failed to execute:', error);
    } finally {
      setIsExecuting(false);
    }
  }, [isExecuting, onExecute, session.id]);

  const handleInterrupt = useCallback(async () => {
    try {
      await onInterrupt(session.id);
    } catch (error) {
      console.error('Failed to interrupt:', error);
    }
  }, [onInterrupt, session.id]);

  // 常に最新のハンドラーを参照するためのref
  const handleExecuteRef = useRef(handleExecute);
  const handleInterruptRef = useRef(handleInterrupt);

  useEffect(() => {
    handleExecuteRef.current = handleExecute;
  }, [handleExecute]);

  useEffect(() => {
    handleInterruptRef.current = handleInterrupt;
  }, [handleInterrupt]);

  // セッション切り替え時にエディタの内容を更新
  useEffect(() => {
    if (editorRef.current) {
      const currentValue = editorRef.current.getValue();
      if (currentValue !== prompt) {
        editorRef.current.setValue(prompt);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const status = getClaudeStatus(session);
  const isRunning = status === 'running';
  const canExecute = !isExecuting && !isRunning;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0 h-8">
        <h3 className="text-sm font-semibold text-theme-fg">Prompt</h3>
        <div className="flex items-center gap-2">
          <ClaudeState status={status} />

          {!isRunning && (
            <button
              onClick={handleExecute}
              disabled={!canExecute}
              className="px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary cursor-pointer flex items-center gap-1"
            >
              <Send className="w-3 h-3" />
              Send
            </button>
          )}

          {isRunning && (
            <button
              onClick={handleInterrupt}
              className="px-3 py-1 bg-red-700 text-white rounded text-sm hover:bg-red-600 cursor-pointer flex items-center gap-1"
            >
              <Square className="w-3 h-3" />
              Interrupt
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 border border-theme rounded overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="markdown"
          defaultValue=""
          onMount={async (editor) => {
            editorRef.current = editor;
            // マウント時に初期値を設定
            if (prompt) {
              editor.setValue(prompt);
            }

            // monaco-editorの型をインポート
            const monaco = await import('monaco-editor');

            // Cmd+Enter (Mac) / Ctrl+Enter (Windows/Linux) で Send
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
              handleExecuteRef.current();
            });

            // Esc で Interrupt
            editor.addCommand(monaco.KeyCode.Escape, () => {
              handleInterruptRef.current();
            });
          }}
          onChange={(value) => {
            onPromptChange(value || '');
          }}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            wordWrap: 'on',
            fontSize: 14,
            scrollBeyondLastLine: false,
            readOnly: isRunning,
          }}
          theme={effectiveTheme === 'dark' ? 'vs-dark' : 'vs-light'}
        />
      </div>
    </div>
  );
}
