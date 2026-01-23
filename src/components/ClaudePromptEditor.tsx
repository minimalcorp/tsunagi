'use client';

import { Editor } from '@monaco-editor/react';
import { useState } from 'react';
import type { ClaudeSession, Task } from '@/lib/types';
import { useTheme } from '@/contexts/ThemeContext';
import { ClaudeState } from '@/components/ClaudeState';

interface ClaudePromptEditorProps {
  session: ClaudeSession;
  task: Task;
  prompt: string;
  onExecute: (sessionId: string, prompt: string) => Promise<void>;
  onInterrupt: (sessionId: string) => Promise<void>;
  onResume: (sessionId: string) => Promise<void>;
  onPromptChange: (prompt: string) => void;
}

export function ClaudePromptEditor({
  session,
  task,
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
        <div className="flex items-center gap-2">
          <ClaudeState task={task} session={session} />

          {isPaused || !isRunning ? (
            <button
              onClick={isPaused ? handleResume : handleExecute}
              disabled={!canExecute && !isPaused}
              className="px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary-hover disabled:opacity-50"
            >
              ▶ Send
            </button>
          ) : null}

          {isRunning && (
            <button
              onClick={handleInterrupt}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-500"
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
    </div>
  );
}
