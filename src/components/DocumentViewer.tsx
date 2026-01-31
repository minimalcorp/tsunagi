import { ExecutionLogsChat } from './ExecutionLogsChat';
import type { Task, Tab } from '@/lib/types';
import type { DocumentViewMode } from './DocumentViewToggle';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/components/MarkdownComponents';

interface DocumentViewerProps {
  mode: DocumentViewMode;
  task: Task;
  rawMessages?: unknown[];
  tabId?: string;
  tab: Tab;
}

export function DocumentViewer({ mode, task, rawMessages, tabId, tab }: DocumentViewerProps) {
  if (mode === 'logs') {
    return <ExecutionLogsChat rawMessages={rawMessages || []} tabId={tabId} tab={tab} />;
  }

  // Document viewer for requirement/design/procedure
  const documentContent = task[mode];
  const documentTitle = mode.charAt(0).toUpperCase() + mode.slice(1);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0 h-8">
        <h3 className="text-sm font-semibold text-theme-fg">{documentTitle}</h3>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden border border-theme rounded p-4 bg-theme-hover">
        {documentContent ? (
          <div className="prose prose-pre:overflow-x-hidden prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:break-words prose-a:break-all max-w-none text-theme-fg text-sm break-words overflow-wrap-anywhere">
            <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
              {documentContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-theme-muted text-sm text-center mt-8">No {mode} yet</div>
        )}
      </div>
    </div>
  );
}
