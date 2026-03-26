'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogContent, DialogTitle, DialogClose } from './ui/dialog-primitives';
import { Button } from './ui/button';
import { X } from 'lucide-react';

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
  const handleOpenChange = (openState: boolean) => {
    onOpenChange({ open: openState });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal>
      <DialogContent
        showCloseButton={false}
        className="bg-card rounded-xl shadow-xl max-w-4xl max-h-[80vh] overflow-hidden flex flex-col p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <DialogTitle className="text-lg font-semibold leading-none text-foreground">
            {title}
          </DialogTitle>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto text-foreground hover:bg-accent"
              />
            }
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        <div className="flex-1 overflow-y-auto prose prose-slate dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange({ open: false })}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
