'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog as ArkDialog } from '@ark-ui/react/dialog';

interface MarkdownViewerDialogProps {
  open: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  title: string;
  content: string;
}

export function MarkdownViewerDialog({
  open,
  onOpenChange,
  title,
  content,
}: MarkdownViewerDialogProps) {
  return (
    <ArkDialog.Root open={open} onOpenChange={onOpenChange} modal trapFocus>
      <ArkDialog.Backdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
      <ArkDialog.Positioner className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <ArkDialog.Content className="bg-card rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col p-6">
          <div className="flex items-center justify-between mb-4">
            <ArkDialog.Title className="text-lg font-semibold leading-none text-foreground">
              {title}
            </ArkDialog.Title>
            <ArkDialog.CloseTrigger className="ml-auto size-8 rounded-md inline-flex items-center justify-center hover:bg-accent transition-colors text-foreground cursor-pointer">
              <span className="text-2xl leading-none">&times;</span>
            </ArkDialog.CloseTrigger>
          </div>

          <div className="flex-1 overflow-y-auto prose prose-slate dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => onOpenChange({ open: false })}
              className="h-9 px-4 py-2 rounded-md text-sm font-medium border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground"
            >
              Close
            </button>
          </div>
        </ArkDialog.Content>
      </ArkDialog.Positioner>
    </ArkDialog.Root>
  );
}
