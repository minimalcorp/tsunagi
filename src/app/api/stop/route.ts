import { NextResponse } from 'next/server';
import { stopAllProcesses } from '@/lib/claude-cli';
import { getAllNodeIds, updateNodeStatus } from '@/lib/node-manager';

// POST /api/stop - 全プロセスを停止
export async function POST() {
  try {
    // 全アクティブプロセスを停止
    const stoppedCount = stopAllProcesses();

    // 全ノードのステータスをidleに更新
    const nodeIds = await getAllNodeIds();
    await Promise.all(nodeIds.map((id) => updateNodeStatus(id, 'idle')));

    return NextResponse.json({
      success: true,
      stopped_count: stoppedCount,
    });
  } catch (error) {
    console.error('Failed to stop all processes:', error);
    return NextResponse.json({ error: 'Failed to stop all processes' }, { status: 500 });
  }
}
