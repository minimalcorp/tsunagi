'use client';

import { useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Node as FlowNode,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Node } from '@/lib/types';

interface NodeGraphProps {
  nodes: Node[];
  selectedNodeId?: string;
  onNodeSelect: (nodeId: string) => void;
  activeEdgeIds?: string[]; // アクティブなエッジ（ノード間通信中）
}

export default function NodeGraph({
  nodes,
  selectedNodeId,
  onNodeSelect,
  activeEdgeIds = [],
}: NodeGraphProps) {
  // ノードをReact Flow形式に変換
  const flowNodes: FlowNode[] = useMemo(() => {
    const nodeCount = nodes.length;
    const radius = 150;
    const centerX = 200;
    const centerY = 200;

    return nodes.map((node, index) => {
      // 保存された位置があればそれを使用、なければ円形レイアウトで計算
      let x, y;
      if (node.position) {
        x = node.position.x;
        y = node.position.y;
      } else {
        const angle = (2 * Math.PI * index) / nodeCount - Math.PI / 2;
        x = centerX + radius * Math.cos(angle);
        y = centerY + radius * Math.sin(angle);
      }

      return {
        id: node.id,
        position: { x, y },
        data: {
          label: (
            <div className="flex flex-col items-center">
              <span className="font-bold">{node.id.toUpperCase()}</span>
              <span
                className={`w-2 h-2 rounded-full mt-1 ${
                  node.status === 'active' ? 'bg-success' : 'bg-muted'
                }`}
              />
            </div>
          ),
        },
        style: {
          background: selectedNodeId === node.id ? 'var(--secondary)' : 'var(--card-background)',
          color: selectedNodeId === node.id ? '#FFFFFF' : 'var(--foreground)',
          border:
            selectedNodeId === node.id ? '2px solid var(--secondary)' : '1px solid var(--border)',
          borderRadius: '8px',
          padding: '10px 20px',
          cursor: 'pointer',
        },
      };
    });
  }, [nodes, selectedNodeId]);

  // エッジ（接続線）を生成
  const flowEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    nodes.forEach((node) => {
      node.arcs.forEach((targetId) => {
        const edgeId = `${node.id}-${targetId}`;
        // 両端のノードがactiveかチェック
        const targetNode = nodes.find((n) => n.id === targetId);
        const bothNodesActive = node.status === 'active' && targetNode?.status === 'active';
        // activeEdgeIdsに含まれるか、または両ノードがactiveならアクティブ表示
        const isActive = activeEdgeIds.includes(edgeId) || bothNodesActive;
        edges.push({
          id: edgeId,
          source: node.id,
          target: targetId,
          animated: isActive,
          style: {
            stroke: isActive ? 'var(--success)' : 'var(--muted)',
            strokeWidth: isActive ? 2 : 1,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isActive ? 'var(--success)' : 'var(--muted)',
            width: 20,
            height: 20,
          },
        });
      });
    });
    return edges;
  }, [nodes, activeEdgeIds]);

  const [reactFlowNodes, setReactFlowNodes, onNodesChange] = useNodesState(flowNodes);
  const [reactFlowEdges, setReactFlowEdges, onEdgesChange] = useEdgesState(flowEdges);

  // flowNodesが変更されたら内部状態を同期
  useEffect(() => {
    setReactFlowNodes(flowNodes);
  }, [flowNodes, setReactFlowNodes]);

  // flowEdgesが変更されたら内部状態を同期
  useEffect(() => {
    setReactFlowEdges(flowEdges);
  }, [flowEdges, setReactFlowEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      onNodeSelect(node.id);
    },
    [onNodeSelect]
  );

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: FlowNode) => {
    // ノードの新しい位置を取得
    const newPosition = { x: node.position.x, y: node.position.y };

    // APIで位置を保存
    fetch(`/api/nodes/${node.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: newPosition }),
    }).catch((error) => {
      console.error('Failed to save node position:', error);
    });
  }, []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Controls className="!bg-[var(--card-background)] !border-[var(--border)] !shadow-lg [&>button]:!bg-[var(--hover-background)] [&>button]:!border-[var(--border)] [&>button]:!fill-[var(--subtle)] [&>button:hover]:!bg-[var(--muted)]" />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
