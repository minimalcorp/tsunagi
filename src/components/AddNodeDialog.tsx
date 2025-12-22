'use client';

import { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface AddNodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (id: string, model: string) => void;
}

const MODELS = ['opus', 'sonnet', 'haiku'];

export default function AddNodeDialog({ isOpen, onClose, onAdd }: AddNodeDialogProps) {
  const [nodeId, setNodeId] = useState('');
  const [model, setModel] = useState('sonnet');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!nodeId.trim()) {
      setError('Node IDを入力してください');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(nodeId)) {
      setError('Node IDは英数字、ハイフン、アンダースコアのみ使用できます');
      return;
    }

    onAdd(nodeId.toLowerCase(), model);
    setNodeId('');
    setModel('sonnet');
    setError('');
    onClose();
  };

  const handleClose = () => {
    setNodeId('');
    setModel('sonnet');
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70" aria-hidden="true" />

      {/* Full-screen container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="bg-card rounded-lg p-6 w-96 border border-border">
          <div className="flex items-center justify-between mb-4">
            <DialogTitle className="text-lg font-bold text-foreground">Add New Node</DialogTitle>
            <button onClick={handleClose} className="text-muted hover:text-foreground">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-subtle">Node ID:</label>
              <input
                type="text"
                value={nodeId}
                onChange={(e) => {
                  setNodeId(e.target.value);
                  setError('');
                }}
                placeholder="例: cto, designer"
                className="w-full border border-border rounded px-3 py-2 bg-hover text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-subtle">Model:</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full border border-border rounded px-3 py-2 bg-hover text-foreground focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent"
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {error && <div className="text-error text-sm">{error}</div>}

            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-border rounded hover:opacity-80 text-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-secondary text-white rounded hover:opacity-90"
              >
                Add
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
