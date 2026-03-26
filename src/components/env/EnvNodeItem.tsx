'use client';

import { Globe, Folder, GitBranch, ChevronRight, ChevronDown } from 'lucide-react';

export type TreeNodeType = 'global' | 'owner' | 'repo';

export interface TreeNode {
  id: string;
  type: TreeNodeType;
  label: string;
  scope: 'global' | 'owner' | 'repo';
  owner?: string;
  repo?: string;
  children?: TreeNode[];
}

interface EnvNodeItemProps {
  node: TreeNode;
  isSelected: boolean;
  isExpanded?: boolean;
  depth: number;
  onSelect: () => void;
  onToggle?: () => void;
}

export function EnvNodeItem({
  node,
  isSelected,
  isExpanded,
  depth,
  onSelect,
  onToggle,
}: EnvNodeItemProps) {
  const hasChildren = node.children && node.children.length > 0;

  const getIcon = () => {
    switch (node.type) {
      case 'global':
        return <Globe className="w-4 h-4" />;
      case 'owner':
        return <Folder className="w-4 h-4" />;
      case 'repo':
        return <GitBranch className="w-4 h-4" />;
    }
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggle) {
      onToggle();
    }
  };

  const handleNameClick = () => {
    onSelect();
    // 名前クリックは開く動作のみ（閉じない）
    if (hasChildren && onToggle && !isExpanded) {
      onToggle();
    }
  };

  return (
    <div
      onClick={handleNameClick}
      className={`
        flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
        transition-colors
        ${isSelected ? 'bg-accent' : 'hover:bg-accent'}
      `}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      {hasChildren && (
        <button onClick={handleChevronClick} className="p-0 hover:bg-accent rounded cursor-pointer">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
      )}
      {!hasChildren && <div className="w-3" />}
      <div className="text-foreground">{getIcon()}</div>
      <span className="text-sm text-foreground truncate">{node.label}</span>
    </div>
  );
}
