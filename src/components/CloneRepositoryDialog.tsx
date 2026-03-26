'use client';

import { useState, type FormEvent } from 'react';
import { useToast } from '@/hooks/useToast';
import { Dialog } from './ui/Dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CloneRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onClone: (data: { gitUrl: string }) => Promise<void>;
  isOnboarding?: boolean;
}

export function CloneRepositoryDialog({
  isOpen,
  onClose,
  onClone,
  isOnboarding = false,
}: CloneRepositoryDialogProps) {
  const [gitUrl, setGitUrl] = useState('');
  const toast = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // ダイアログを即座に閉じる
    onClose();
    const url = gitUrl;
    setGitUrl('');

    // 非同期でclone処理を実行し、通知で進捗を表示
    const notificationId = toast.loading('Cloning repository...', url);

    try {
      await onClone({ gitUrl: url });
      toast.success(notificationId, 'Successfully cloned repository', url);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(notificationId, 'Failed to clone repository', errorMessage);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(details) => {
        if (!details.open && !isOnboarding) {
          onClose();
        }
      }}
      title="Clone Repository"
      maxWidth="md"
      showCloseButton={!isOnboarding}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-foreground">Git URL *</label>
          <Input
            type="text"
            required
            placeholder="https://github.com/owner/repo.git"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground mt-1">
            HTTPS or SSH形式のGit URLを入力してください
          </p>
        </div>

        <div className="flex justify-end gap-2">
          {!isOnboarding && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onClose}
              className="active:scale-95"
            >
              Cancel
            </Button>
          )}
          <Button type="submit" size="lg" className="active:scale-95">
            Clone
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
