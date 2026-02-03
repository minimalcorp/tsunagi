'use client';

import { Editor } from '@monaco-editor/react';
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  memo,
} from 'react';
import type { editor } from 'monaco-editor';
import type { Tab } from '@/lib/types';
import { useTheme } from '@/contexts/ThemeContext';
import { getClaudeStatus } from '@/lib/claude-status';
import { Send, Square } from 'lucide-react';

interface ClaudePromptEditorProps {
  tab: Tab;
  onExecute: (tabId: string, prompt: string) => Promise<void>;
  onInterrupt: (tabId: string) => Promise<void>;
}

export interface ClaudePromptEditorHandle {
  getCurrentPrompt: () => string;
  setPrompt: (value: string) => void;
  clearPrompt: () => void;
}

const ClaudePromptEditorComponent = forwardRef<ClaudePromptEditorHandle, ClaudePromptEditorProps>(
  ({ tab, onExecute, onInterrupt }, ref) => {
    const [isExecuting, setIsExecuting] = useState(false);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const { effectiveTheme } = useTheme();

    // 親コンポーネントに公開するメソッド
    useImperativeHandle(ref, () => ({
      getCurrentPrompt: () => editorRef.current?.getValue() || '',
      setPrompt: (value: string) => {
        if (editorRef.current) {
          editorRef.current.setValue(value);
        }
      },
      clearPrompt: () => {
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

    const status = getClaudeStatus(tab);
    const isRunning = status === 'running';
    // Streaming Input Modeでは処理中でも送信可能（キューイング）
    const canExecute = !isExecuting;

    // 常に最新のハンドラーと状態を参照するためのref
    const handleExecuteRef = useRef(handleExecute);
    const handleInterruptRef = useRef(handleInterrupt);
    const isRunningRef = useRef(isRunning);
    const canExecuteRef = useRef(canExecute);

    useEffect(() => {
      handleExecuteRef.current = handleExecute;
    }, [handleExecute]);

    useEffect(() => {
      handleInterruptRef.current = handleInterrupt;
    }, [handleInterrupt]);

    useEffect(() => {
      isRunningRef.current = isRunning;
    }, [isRunning]);

    useEffect(() => {
      canExecuteRef.current = canExecute;
    }, [canExecute]);

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between mb-2 flex-shrink-0 h-8">
          <h3 className="text-sm font-semibold text-theme-fg">Prompt</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExecute}
              disabled={isExecuting}
              className="px-3 py-1 bg-primary-600 text-white rounded text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-600 cursor-pointer flex items-center gap-1"
            >
              <Send className="w-3 h-3" />
              Send
            </button>

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

              // monaco-editorの型をインポート
              const monaco = await import('monaco-editor');

              // Cmd+Enter (Mac) / Ctrl+Enter (Windows/Linux) で Send
              // Claude stateがidleの時のみ実行可能
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => {
                  if (canExecuteRef.current) {
                    handleExecuteRef.current();
                  }
                },
                'editorTextFocus'
              );

              // Esc で Interrupt
              // 条件1: エディタのウィジェットが表示されていない場合のみ
              //   - findWidgetVisible: 検索ウィジェット
              //   - suggestWidgetVisible: サジェスト（入力補完）
              //   - parameterHintsVisible: パラメータヒント
              //   - renameInputVisible: リネーム入力
              // 条件2: Claude stateがrunningの時のみ
              editor.addCommand(
                monaco.KeyCode.Escape,
                () => {
                  if (isRunningRef.current) {
                    handleInterruptRef.current();
                  }
                },
                'editorTextFocus && !findWidgetVisible && !suggestWidgetVisible && !parameterHintsVisible && !renameInputVisible'
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
    );
  }
);

ClaudePromptEditorComponent.displayName = 'ClaudePromptEditor';

export const ClaudePromptEditor = memo(ClaudePromptEditorComponent, (prevProps, nextProps) => {
  // タブIDとステータスが変わらなければ再レンダリングしない
  return (
    prevProps.tab.tab_id === nextProps.tab.tab_id && prevProps.tab.status === nextProps.tab.status
  );
});
