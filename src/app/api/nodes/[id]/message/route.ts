import { NextRequest, NextResponse } from 'next/server';
import { executeClaudePrompt } from '@/lib/claude-cli';
import {
  getNode,
  getNodeSession,
  updateNodeStatus,
  updateNodeFromResponse,
} from '@/lib/node-manager';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/nodes/:id/message - ノードにメッセージを送信
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: nodeId } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    // ノードの存在確認
    const node = await getNode(nodeId);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // ステータスをactiveに更新
    await updateNodeStatus(nodeId, 'active');

    // セッションIDを取得
    const session = await getNodeSession(nodeId);

    // Claude CLIを実行
    const response = await executeClaudePrompt({
      nodeId,
      prompt: content,
      sessionId: session.session_id,
    });

    // セッション情報を更新
    await updateNodeFromResponse(nodeId, response.session_id, response.total_cost_usd);

    return NextResponse.json({
      response: response.result,
      session_id: response.session_id,
      cost: response.total_cost_usd,
    });
  } catch (error) {
    console.error('Failed to send message:', error);

    // エラー時にステータスをidleに戻す
    const { id: nodeId } = await params;
    await updateNodeStatus(nodeId, 'idle');

    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
