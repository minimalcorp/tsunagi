'use client';

import { useState } from 'react';
import { PaperAirplaneIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import type { Node } from '@/lib/types';

interface NodeDetailProps {
  node: Node;
  allNodes: Node[];
  onSendMessage: (content: string) => void;
  onClear: () => void;
  onDelete: () => void;
  onUpdateSettings: (model: string, arcs: string[]) => void;
}

const MODELS = ['opus', 'sonnet', 'haiku'];

export default function NodeDetail({
  node,
  allNodes,
  onSendMessage,
  onClear,
  onDelete,
  onUpdateSettings,
}: NodeDetailProps) {
  const [message, setMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState(node.model);
  const [selectedArcs, setSelectedArcs] = useState<string[]>(node.arcs);

  const otherNodes = allNodes.filter((n) => n.id !== node.id);

  const handleSend = () => {
    if (!message.trim()) return;
    onSendMessage(message);
    setMessage('');
  };

  const handleArcToggle = (nodeId: string) => {
    const newArcs = selectedArcs.includes(nodeId)
      ? selectedArcs.filter((id) => id !== nodeId)
      : [...selectedArcs, nodeId];
    setSelectedArcs(newArcs);
    onUpdateSettings(selectedModel, newArcs);
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    onUpdateSettings(model, selectedArcs);
  };

  return (
    <div className="p-4 space-y-4 text-foreground">
      <div>
        <h2 className="text-lg font-bold text-foreground">Node: {node.id}</h2>
        <hr className="my-2 border-border" />
      </div>

      {/* Model選択 */}
      <div>
        <label className="block text-sm font-medium mb-1 text-subtle">Model:</label>
        <select
          value={selectedModel}
          onChange={(e) => handleModelChange(e.target.value)}
          className="w-full border border-border rounded px-2 py-1 bg-hover text-foreground"
        >
          {MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      {/* Arcs選択 */}
      <div>
        <label className="block text-sm font-medium mb-1 text-subtle">Arcs:</label>
        <div className="space-y-1">
          {otherNodes.map((n) => (
            <label key={n.id} className="flex items-center gap-2 text-subtle">
              <input
                type="checkbox"
                checked={selectedArcs.includes(n.id)}
                onChange={() => handleArcToggle(n.id)}
                className="accent-secondary"
              />
              {n.id}
            </label>
          ))}
        </div>
      </div>

      {/* セッション情報 */}
      <div className="text-sm text-muted space-y-1">
        <div>Session: {node.session_id || 'None'}</div>
        <div>Cost: ${node.total_cost_usd.toFixed(4)}</div>
        <div className="flex items-center gap-2">
          Status:
          <span
            className={`w-2 h-2 rounded-full ${
              node.status === 'active' ? 'bg-success' : 'bg-muted'
            }`}
          />
          {node.status}
        </div>
      </div>

      {/* メッセージ送信 */}
      <div>
        <label className="block text-sm font-medium mb-1 text-subtle">Message:</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="メッセージを入力..."
          className="w-full border border-border rounded px-2 py-1 h-24 resize-none bg-hover text-foreground placeholder-muted"
        />

        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSend}
            disabled={!message.trim() || node.status === 'active'}
            className="px-3 py-1.5 bg-secondary text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
            Send
          </button>
          <button
            onClick={onClear}
            className="px-3 py-1.5 bg-subtle text-white rounded hover:opacity-90 flex items-center gap-1.5"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      {/* 削除ボタン */}
      <div className="pt-4 border-t border-border">
        <button
          onClick={onDelete}
          className="px-3 py-1.5 bg-error text-white rounded hover:opacity-90 flex items-center gap-1.5"
        >
          <TrashIcon className="w-4 h-4" />
          Delete Node
        </button>
      </div>
    </div>
  );
}
