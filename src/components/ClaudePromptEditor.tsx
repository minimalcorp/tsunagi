'use client';

import { Editor } from '@monaco-editor/react';
import { useState } from 'react';
import type { ClaudeSession } from '@/lib/types';
import { useTheme } from '@/contexts/ThemeContext';
import { ClaudeState } from '@/components/ClaudeState';
import { getClaudeStatus } from '@/lib/claude-status';

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

  const handleEditorChange = (value: string | undefined) => {
    onPromptChange(value || '');
  };

  const status = getClaudeStatus(session);
  const isRunning = status === 'running';
  const canExecute = !isExecuting && !isRunning && prompt.trim().length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="text-sm font-semibold text-theme-fg">Prompt</h3>
        <div className="flex items-center gap-2">
          <ClaudeState status={status} />

          {!isRunning && (
            <button
              onClick={handleExecute}
              disabled={!canExecute}
              className="px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary cursor-pointer"
            >
              ▶ Send
            </button>
          )}

          {isRunning && (
            <button
              onClick={handleInterrupt}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-500 cursor-pointer"
            >
              ■ Interrupt
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 border border-theme rounded overflow-hidden">
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
