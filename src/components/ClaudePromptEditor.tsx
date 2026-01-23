'use client';

import { Editor } from '@monaco-editor/react';
import { useState } from 'react';
import type { ClaudeSession } from '@/lib/types';
import { useTheme } from '@/contexts/ThemeContext';

interface ClaudePromptEditorProps {
  session: ClaudeSession;
  prompt: string;
  onExecute: (sessionId: string, prompt: string) => Promise<void>;
  onInterrupt: (sessionId: string) => Promise<void>;
  onResume: (sessionId: string) => Promise<void>;
  onPromptChange: (prompt: string) => void;
}

export function ClaudePromptEditor({
  session,
  prompt,
  onExecute,
  onInterrupt,
  onResume,
  onPromptChange,
}: ClaudePromptEditorProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const { effectiveTheme } = useTheme();

  const handleExecute = async () => {
    if (!prompt.trim() || isExecuting) return;
    try {
      setIsExecuting(true);
      await onExecute(session.id, prompt);
    } catch (error) {
      console.error('Failed to execute:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleInterrupt = async () => {
    try {
      await onInterrupt(session.id);
    } catch (error) {
      console.error('Failed to interrupt:', error);
    }
  };

  const handleResume = async () => {
    try {
      setIsExecuting(true);
      await onResume(session.id);
    } catch (error) {
      console.error('Failed to resume:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    onPromptChange(value || '');
  };

  const isRunning = session.status === 'running';
  const isPaused = session.status === 'paused';
  const canExecute = !isExecuting && !isRunning && prompt.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-theme-fg">Prompt</h3>
        <div className="flex gap-2">
          {isPaused ? (
            <button
              onClick={handleResume}
              disabled={isExecuting}
              className="px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary-hover disabled:opacity-50"
            >
              ▶ Resume
            </button>
          ) : (
            <button
              onClick={handleExecute}
              disabled={!canExecute}
              className="px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary-hover disabled:opacity-50"
            >
              ▶ Execute
            </button>
          )}

          {isRunning && (
            <button
              onClick={handleInterrupt}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              ■ Interrupt
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 border border-theme rounded overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="markdown"
          value={prompt}
          onChange={handleEditorChange}
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

      {isRunning && (
        <div className="mt-2 flex items-center text-primary-600 text-sm">
          <span className="animate-pulse mr-2">●</span>
          Running...
        </div>
      )}
    </div>
  );
}
