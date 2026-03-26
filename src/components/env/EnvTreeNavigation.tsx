'use client';

import { useState, useEffect } from 'react';
import { EnvNodeItem, type TreeNode } from './EnvNodeItem';

export interface SelectedNode {
  scope: 'global' | 'owner' | 'repo';
  owner?: string;
  repo?: string;
  label: string;
}

interface EnvTreeNavigationProps {
  selectedNode: SelectedNode | null;
  onNodeSelect: (node: SelectedNode) => void;
}

interface Owner {
  name: string;
  repositories: Array<{ owner: string; repo: string }>;
}

export function EnvTreeNavigation({ selectedNode, onNodeSelect }: EnvTreeNavigationProps) {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // localStorage から展開状態を復元
  useEffect(() => {
    const saved = localStorage.getItem('tsunagi:env-tree-expanded');
    if (saved) {
      try {
        const expanded = JSON.parse(saved);
        setExpandedOwners(new Set(expanded));
      } catch (e) {
        console.error('Failed to parse expanded owners:', e);
      }
    }
  }, []);

  // 展開状態を localStorage に保存
  useEffect(() => {
    localStorage.setItem('tsunagi:env-tree-expanded', JSON.stringify([...expandedOwners]));
  }, [expandedOwners]);

  // ツリーデータをロード
  useEffect(() => {
    const loadTree = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/owners');
        if (!response.ok) throw new Error('Failed to fetch owners');

        const data = await response.json();
        const owners: Owner[] = data.data.owners || [];

        // ツリー構造を構築
        const globalNode: TreeNode = {
          id: 'global',
          type: 'global',
          label: 'Global',
          scope: 'global',
        };

        const ownerNodes: TreeNode[] = owners.map((owner) => ({
          id: `owner:${owner.name}`,
          type: 'owner',
          label: owner.name,
          scope: 'owner',
          owner: owner.name,
          children: owner.repositories.map((repo) => ({
            id: `repo:${repo.owner}/${repo.repo}`,
            type: 'repo',
            label: repo.repo,
            scope: 'repo',
            owner: repo.owner,
            repo: repo.repo,
          })),
        }));

        setTreeData([globalNode, ...ownerNodes]);
      } catch (error) {
        console.error('Failed to load tree:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTree();
  }, []);

  const handleToggle = (nodeId: string) => {
    setExpandedOwners((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleSelect = (node: TreeNode) => {
    const selectedNode: SelectedNode = {
      scope: node.scope,
      owner: node.owner,
      repo: node.repo,
      label: node.label,
    };
    onNodeSelect(selectedNode);
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isSelected =
      selectedNode?.scope === node.scope &&
      selectedNode?.owner === node.owner &&
      selectedNode?.repo === node.repo;
    const isExpanded = expandedOwners.has(node.id);

    return (
      <div key={node.id}>
        <EnvNodeItem
          node={node}
          isSelected={isSelected}
          isExpanded={isExpanded}
          depth={depth}
          onSelect={() => handleSelect(node)}
          onToggle={() => handleToggle(node.id)}
        />
        {isExpanded && node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  if (isLoading) {
    return <div className="p-4 text-muted-foreground text-sm">Loading...</div>;
  }

  if (treeData.length === 0) {
    return <div className="p-4 text-muted-foreground text-sm">No repositories found</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-2">{treeData.map((node) => renderNode(node))}</div>
    </div>
  );
}
