'use client';

import { Editor } from '@monaco-editor/react';
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { editor } from 'monaco-editor';
import type { Tab } from '@/lib/types';
import { useTheme } from '@/contexts/ThemeContext';
import { ClaudeState } from '@/components/ClaudeState';
import { getClaudeStatus } from '@/lib/claude-status';
import { Send, Square } from 'lucide-react';

export interface ClaudePromptEditorRef {
  clearEditor: () => void;
}

interface ClaudePromptEditorProps {
  tab: Tab;
  initialPrompt: string;
  onExecute: (tabId: string, prompt: string) => Promise<void>;
  onInterrupt: (tabId: string) => Promise<void>;
  onPromptChange: (prompt: string) => void;
}

export const ClaudePromptEditor = forwardRef<ClaudePromptEditorRef, ClaudePromptEditorProps>(
  function ClaudePromptEditor({ tab, initialPrompt, onExecute, onInterrupt, onPromptChange }, ref) {
    const [isExecuting, setIsExecuting] = useState(false);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const { effectiveTheme } = useTheme();

    // 親コンポーネントから呼べるメソッドを公開
    useImperativeHandle(ref, () => ({
      clearEditor: () => {
        if (editorRef.current) {
          editorRef.current.setValue('');
        }
      },
    }));

    const handleExecute = useCallback(async () => {
      const prompt = editorRef.current?.getValue() || '';
      if (!prompt.trim() || isExecuting) return;
      try {
        setIsExecuting(true);
        await onExecute(tab.tab_id, prompt);
        // エディタのクリアは親コンポーネントからclearEditor()で実行される
      } catch (error) {
        console.error('Failed to execute:', error);
      } finally {
        setIsExecuting(false);
      }
    }, [isExecuting, onExecute, tab.tab_id]);

    const handleInterrupt = useCallback(async () => {
      try {
        await onInterrupt(tab.tab_id);
      } catch (error) {
        console.error('Failed to interrupt:', error);
      }
    }, [onInterrupt, tab.tab_id]);

    // 常に最新のハンドラーを参照するためのref
    const handleExecuteRef = useRef(handleExecute);
    const handleInterruptRef = useRef(handleInterrupt);

    useEffect(() => {
      handleExecuteRef.current = handleExecute;
    }, [handleExecute]);

    useEffect(() => {
      handleInterruptRef.current = handleInterrupt;
    }, [handleInterrupt]);

    // タブ切り替え時にエディタの内容を更新
    useEffect(() => {
      if (editorRef.current) {
        const currentValue = editorRef.current.getValue();
        if (currentValue !== initialPrompt) {
          editorRef.current.setValue(initialPrompt);
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab.tab_id]);

    const status = getClaudeStatus(tab);
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
              if (initialPrompt) {
                editor.setValue(initialPrompt);
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
              readOnly: false,
            }}
            theme={effectiveTheme === 'dark' ? 'vs-dark' : 'vs-light'}
          />
        </div>
      </div>
    );
  }
);
