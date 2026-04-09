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
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { Send, Square, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    const { isListening, isSupported, startListening, stopListening } = useSpeechRecognition({
      editorRef,
    });

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
    const canExecute = !isExecuting && !isRunning;

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
          <h3 className="text-sm font-semibold text-foreground">Prompt</h3>
          <div className="flex items-center gap-2">
            {isSupported && (
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={isListening ? stopListening : startListening}
                className="text-primary hover:bg-primary/10 hover:text-foreground"
                title={isListening ? 'Stop voice input' : 'Start voice input'}
              >
                {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
            )}

            {!isRunning && (
              <Button size="sm" onClick={handleExecute} disabled={!canExecute}>
                <Send className="w-3 h-3" />
                Send
              </Button>
            )}

            {isRunning && (
              <Button variant="destructive" size="sm" onClick={handleInterrupt}>
                <Square className="w-3 h-3" />
                Interrupt
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 border border-border rounded overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="markdown"
            defaultValue=""
            onMount={async (editor) => {
              editorRef.current = editor;

              // monaco-editorの型をインポート
              const monaco = await import('monaco-editor');

              // Context Keyを設定（このエディタがPrompt Editorであることを示す）
              editor.createContextKey('isPromptEditor', true);

              // Prompt Editor用: Cmd+Enter (Mac) / Ctrl+Enter (Windows/Linux) で Send
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => {
                  if (canExecuteRef.current) {
                    handleExecuteRef.current();
                  }
                },
                'editorTextFocus && isPromptEditor'
              );

              // Prompt Editor用: Esc で Interrupt
              editor.addCommand(
                monaco.KeyCode.Escape,
                () => {
                  if (isRunningRef.current) {
                    handleInterruptRef.current();
                  }
                },
                'editorTextFocus && isPromptEditor && !findWidgetVisible && !suggestWidgetVisible && !parameterHintsVisible && !renameInputVisible'
              );

              // Plan Editor用: Cmd+Enter でカスタムイベント発火（グローバル登録）
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => {
                  window.dispatchEvent(new CustomEvent('monaco:planEditorSave'));
                },
                'editorTextFocus && isPlanEditor'
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
