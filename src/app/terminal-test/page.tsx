'use client';

import { TerminalView } from '@/components/TerminalView';

export default function TerminalTestPage() {
  return (
    <div className="flex flex-col h-screen bg-theme-bg text-theme-fg">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-theme flex-shrink-0">
        <h1 className="text-sm font-semibold">Terminal Test</h1>
        <span className="text-xs text-theme-muted">Fastify :2792 / PTY</span>
      </header>
      <div className="flex-1 min-h-0">
        <TerminalView />
      </div>
    </div>
  );
}
