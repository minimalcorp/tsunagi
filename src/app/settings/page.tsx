'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { EnvTreeNavigation, type SelectedNode } from '@/components/env/EnvTreeNavigation';
import { EnvVariableEditor } from '@/components/env/EnvVariableEditor';
import { EnvAddDialog } from '@/components/env/EnvAddDialog';

export default function SettingsPage() {
  const router = useRouter();
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // localStorage から選択ノードを復元
  useEffect(() => {
    const saved = localStorage.getItem('tsunagi:env-selected-node');
    if (saved) {
      try {
        const node = JSON.parse(saved);
        setSelectedNode(node);
      } catch (e) {
        console.error('Failed to parse selected node:', e);
        // デフォルトで Global を選択
        setSelectedNode({
          scope: 'global',
          label: 'Global',
        });
      }
    } else {
      // デフォルトで Global を選択
      setSelectedNode({
        scope: 'global',
        label: 'Global',
      });
    }
  }, []);

  // 選択ノードを localStorage に保存
  useEffect(() => {
    if (selectedNode) {
      localStorage.setItem('tsunagi:env-selected-node', JSON.stringify(selectedNode));
    }
  }, [selectedNode]);

  const handleNodeSelect = (node: SelectedNode) => {
    setSelectedNode(node);
  };

  // 既存キーを取得
  useEffect(() => {
    if (!selectedNode) return;

    const loadExistingKeys = async () => {
      try {
        const params = new URLSearchParams({ scope: selectedNode.scope });
        if (selectedNode.owner) params.set('owner', selectedNode.owner);
        if (selectedNode.repo) params.set('repo', selectedNode.repo);

        const response = await fetch(`/api/env/list?${params}`);
        if (!response.ok) throw new Error('Failed to fetch environment variables');

        const data = await response.json();
        const keys = (data.data.envVars || []).map((v: { key: string }) => v.key);
        setExistingKeys(keys);
      } catch (err) {
        console.error('Failed to load existing keys:', err);
      }
    };

    loadExistingKeys();
  }, [selectedNode, refreshTrigger]);

  const handleAddVariable = async (key: string, value: string) => {
    try {
      const response = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          value,
          scope: selectedNode!.scope,
          owner: selectedNode!.owner,
          repo: selectedNode!.repo,
        }),
      });

      if (!response.ok) throw new Error('Failed to add environment variable');

      // リストを再取得
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to add environment variable:', err);
      throw err;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-theme-bg">
      {/* Header */}
      <div className="sticky top-0 z-50 p-4 border-b border-theme bg-theme-card">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-primary-light hover:brightness-110 font-medium flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Board
          </button>

          <h1 className="text-xl font-bold text-theme-fg absolute left-1/2 -translate-x-1/2">
            Settings
          </h1>
        </div>
      </div>

      {/* Split Layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel: Tree Navigation */}
        <div className="w-64 border-r border-theme bg-theme-card">
          <EnvTreeNavigation selectedNode={selectedNode} onNodeSelect={handleNodeSelect} />
        </div>

        {/* Right Panel: Editor */}
        <div className="flex-1 bg-theme-card p-4">
          {selectedNode ? (
            <EnvVariableEditor
              selectedNode={selectedNode}
              onAddClick={() => setShowAddDialog(true)}
              refreshTrigger={refreshTrigger}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-theme-muted text-sm">
              Select a node from the left panel
            </div>
          )}
        </div>
      </div>

      {/* Add Variable Dialog */}
      {selectedNode && (
        <EnvAddDialog
          isOpen={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          selectedNode={selectedNode}
          existingKeys={existingKeys}
          onAdd={handleAddVariable}
        />
      )}
    </div>
  );
}
