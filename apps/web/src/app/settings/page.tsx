'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { apiUrl } from '@/lib/api-url';
import { EnvTreeNavigation, type SelectedNode } from '@/components/env/EnvTreeNavigation';
import { EnvVariableEditor } from '@/components/env/EnvVariableEditor';
import { ClaudeTokenSection } from '@/components/env/ClaudeTokenSection';
import { RepositoryManagement } from '@/components/settings/RepositoryManagement';
import { RemoveRepositorySection } from '@/components/settings/RemoveRepositorySection';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const router = useRouter();

  // Initialize selectedNode from localStorage or default to Global
  const getInitialNode = (): SelectedNode => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tsunagi:env-selected-node');
      if (saved) {
        try {
          return JSON.parse(saved) as SelectedNode;
        } catch (e) {
          console.error('Failed to parse selected node:', e);
        }
      }
    }
    return {
      scope: 'global',
      label: 'Global',
    };
  };

  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [onboardingStatus, setOnboardingStatus] = useState({
    completed: true,
    hasGlobalToken: true,
  });

  // Initialize on mount (one-time initialization from localStorage)
  useEffect(() => {
    fetch(apiUrl('/api/onboarding/status'))
      .then((r) => r.json())
      .then((data) => {
        const status = data.data;
        setOnboardingStatus(status);

        if (!status.completed && !status.hasGlobalToken) {
          setSelectedNode({ scope: 'global', label: 'Global' });
        } else {
          setSelectedNode(getInitialNode());
        }
      })
      .catch((error) => {
        console.error('Failed to fetch onboarding status:', error);
        setSelectedNode(getInitialNode());
      });
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

  const handleSwitchToGlobal = () => {
    setSelectedNode({ scope: 'global', label: 'Global' });
  };

  const handleRepoDeleted = () => {
    setSelectedNode({ scope: 'global', label: 'Global' });
    setTreeRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push('/')}
            className="text-primary font-medium hover:bg-primary/10 hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Board
          </Button>

          <h1 className="text-xl font-bold text-foreground absolute left-1/2 -translate-x-1/2">
            Settings
          </h1>
        </div>
      </div>

      {/* Split Layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel: Tree Navigation */}
        <div className="w-64 border-r border-border bg-card">
          <EnvTreeNavigation
            selectedNode={selectedNode}
            onNodeSelect={handleNodeSelect}
            refreshKey={treeRefreshKey}
          />
        </div>

        {/* Right Panel: Editor */}
        <div className="flex-1 bg-card p-4 overflow-y-auto">
          {selectedNode ? (
            <div className="space-y-6">
              {/* Claude Token Section (All scopes) */}
              <ClaudeTokenSection
                selectedNode={selectedNode}
                onboardingStatus={onboardingStatus}
                onSwitchToGlobal={handleSwitchToGlobal}
              />

              {/* Environment Variables Section */}
              <EnvVariableEditor selectedNode={selectedNode} />

              {/* Repository Management (Global scope only) */}
              {selectedNode.scope === 'global' && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">Repositories</h2>
                  <RepositoryManagement />
                </div>
              )}

              {/* Remove Repository (Repo scope only) */}
              {selectedNode.scope === 'repo' && selectedNode.owner && selectedNode.repo && (
                <RemoveRepositorySection
                  owner={selectedNode.owner}
                  repo={selectedNode.repo}
                  onDeleted={handleRepoDeleted}
                />
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Select a node from the left panel
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
