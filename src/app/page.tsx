'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowPathIcon,
  PlusIcon,
  StopIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/solid';
import NodeDetail from '@/components/NodeDetail';
import LogViewer from '@/components/LogViewer';
import AddNodeDialog from '@/components/AddNodeDialog';
import type { Node, LogEntry, StreamEvent } from '@/lib/types';

// ReactFlowはSSRに対応していないため、動的インポート
const NodeGraph = dynamic(() => import('@/components/NodeGraph'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center">Loading...</div>,
});

type TabType = 'settings' | 'logs';

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('settings');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeEdgeIds, setActiveEdgeIds] = useState<string[]>([]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const hasActiveNodes = nodes.some((n) => n.status === 'active');

  // ログを追加
  const addLog = useCallback((nodeId: string, direction: 'send' | 'receive', content: string) => {
    const entry: LogEntry = {
      time: new Date().toISOString(),
      nodeId,
      direction,
      content,
    };
    setLogs((prev) => [...prev, entry]);
  }, []);

  // ノード一覧を取得
  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes');
      const data = await res.json();
      setNodes(data.nodes || []);
      if (data.nodes?.length > 0 && !selectedNodeId) {
        setSelectedNodeId(data.nodes[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch nodes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedNodeId]);

  // 初回ロード
  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  // ノード追加
  const handleAddNode = async (id: string, model: string) => {
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, model, arcs: [] }),
      });
      if (res.ok) {
        await fetchNodes();
        setSelectedNodeId(id);
      }
    } catch (error) {
      console.error('Failed to add node:', error);
    }
  };

  // ストリームイベントをログに変換
  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      const entry: LogEntry = {
        time: event.timestamp,
        nodeId: event.nodeId,
        direction: 'receive',
        content: '',
        eventType: event.type,
      };

      switch (event.type) {
        case 'status':
          entry.content = event.data.content || 'Processing...';
          break;
        case 'message':
          entry.content = event.data.content || '';
          break;
        case 'tool_use':
          entry.content = `[Tool: ${event.data.toolName}] ${event.data.content || ''}`;
          // ターゲットノードへのエッジをアクティブにする
          if (event.data.targetNodeId) {
            const edgeId = `${event.nodeId}-${event.data.targetNodeId}`;
            setActiveEdgeIds((prev) => (prev.includes(edgeId) ? prev : [...prev, edgeId]));
          }
          break;
        case 'tool_result':
          entry.content = `[Result] ${event.data.content || ''}`;
          // tool_result後にエッジを非アクティブにする
          setActiveEdgeIds((prev) => prev.filter((id) => !id.startsWith(`${event.nodeId}-`)));
          break;
        case 'complete':
          entry.content = event.data.content || 'Completed';
          // 完了時にエッジをクリア
          setActiveEdgeIds((prev) => prev.filter((id) => !id.startsWith(`${event.nodeId}-`)));
          fetchNodes();
          break;
        case 'error':
          entry.content = `[Error] ${event.data.content || 'Unknown error'}`;
          // エラー時にエッジをクリア
          setActiveEdgeIds((prev) => prev.filter((id) => !id.startsWith(`${event.nodeId}-`)));
          fetchNodes();
          break;
      }

      if (entry.content) {
        setLogs((prev) => [...prev, entry]);
      }
    },
    [fetchNodes]
  );

  // メッセージ送信（ストリーミング）
  const handleSendMessage = async (content: string) => {
    if (!selectedNodeId) return;

    // 送信ログを追加
    addLog(selectedNodeId, 'send', content);

    // 即座にノードをactive状態に更新（オプティミスティック更新）
    setNodes((prev) =>
      prev.map((node) =>
        node.id === selectedNodeId ? { ...node, status: 'active' as const } : node
      )
    );

    try {
      const res = await fetch(`/api/nodes/${selectedNodeId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        addLog(selectedNodeId, 'receive', '[Error] Failed to start stream');
        await fetchNodes();
        return;
      }

      // SSEストリームを読み取る
      const reader = res.body?.getReader();
      if (!reader) {
        addLog(selectedNodeId, 'receive', '[Error] No stream available');
        await fetchNodes();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSEイベントをパース
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as StreamEvent;
              handleStreamEvent(event);
            } catch {
              console.error('Failed to parse SSE event:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      addLog(selectedNodeId, 'receive', '[Error] Request failed');
      await fetchNodes();
    }
  };

  // セッションクリア
  const handleClear = async () => {
    if (!selectedNodeId) return;

    try {
      await fetch(`/api/nodes/${selectedNodeId}/clear`, {
        method: 'POST',
      });
      await fetchNodes();
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  };

  // ノード削除
  const handleDelete = async () => {
    if (!selectedNodeId) return;
    if (!confirm(`Node "${selectedNodeId}" を削除しますか？`)) return;

    try {
      await fetch(`/api/nodes/${selectedNodeId}`, {
        method: 'DELETE',
      });
      setSelectedNodeId(undefined);
      await fetchNodes();
    } catch (error) {
      console.error('Failed to delete node:', error);
    }
  };

  // 設定更新
  const handleUpdateSettings = async (model: string, arcs: string[]) => {
    if (!selectedNodeId) return;

    try {
      await fetch(`/api/nodes/${selectedNodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, arcs }),
      });
      await fetchNodes();
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  // 全停止
  const handleStopAll = async () => {
    try {
      await fetch('/api/stop', { method: 'POST' });
      await fetchNodes();
    } catch (error) {
      console.error('Failed to stop all:', error);
    }
  };

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* ヘッダー */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card">
        <h1 className="text-xl font-bold text-foreground">Solo</h1>
        <div className="flex gap-2">
          <button
            onClick={() => fetchNodes()}
            className="px-3 py-1.5 bg-subtle text-white rounded hover:opacity-90 flex items-center gap-1.5"
            title="設定を再読み込み"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Reload
          </button>
          <button
            onClick={() => setIsAddDialogOpen(true)}
            className="px-3 py-1.5 bg-secondary text-white rounded hover:opacity-90 flex items-center gap-1.5"
          >
            <PlusIcon className="w-4 h-4" />
            Add Node
          </button>
          <button
            onClick={handleStopAll}
            disabled={!hasActiveNodes}
            className={`px-3 py-1.5 rounded flex items-center gap-1.5 ${
              hasActiveNodes
                ? 'bg-error text-white hover:opacity-90'
                : 'bg-subtle text-muted cursor-not-allowed'
            }`}
          >
            <StopIcon className="w-4 h-4" />
            Stop All
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左側: ノードグラフ */}
        <div className="flex-1 border-r border-border bg-background">
          {nodes.length > 0 ? (
            <NodeGraph
              nodes={nodes}
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
              activeEdgeIds={activeEdgeIds}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted">
              ノードがありません。「+ Add Node」で追加してください。
            </div>
          )}
        </div>

        {/* 右側: 詳細パネル */}
        <div className="w-96 flex flex-col bg-card">
          {/* タブ */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 py-2 text-center flex items-center justify-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'border-b-2 border-secondary font-medium text-secondary'
                  : 'text-muted hover:text-subtle'
              }`}
            >
              <Cog6ToothIcon className="w-4 h-4" />
              Settings
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex-1 py-2 text-center flex items-center justify-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'border-b-2 border-secondary font-medium text-secondary'
                  : 'text-muted hover:text-subtle'
              }`}
            >
              <DocumentTextIcon className="w-4 h-4" />
              Logs
            </button>
          </div>

          {/* タブコンテンツ */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'settings' && selectedNode ? (
              <NodeDetail
                key={selectedNode.id}
                node={selectedNode}
                allNodes={nodes}
                onSendMessage={handleSendMessage}
                onClear={handleClear}
                onDelete={handleDelete}
                onUpdateSettings={handleUpdateSettings}
              />
            ) : activeTab === 'settings' && !selectedNode ? (
              <div className="p-4 text-muted">ノードを選択してください</div>
            ) : (
              <LogViewer logs={logs} filterNodeId={selectedNodeId} />
            )}
          </div>
        </div>
      </div>

      {/* ダイアログ */}
      <AddNodeDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onAdd={handleAddNode}
      />
    </div>
  );
}
