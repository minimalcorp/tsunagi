import { NextRequest } from 'next/server';
import { executeClaudeStream } from '@/lib/claude-cli';
import {
  getNode,
  getNodeSession,
  updateNodeStatus,
  updateNodeFromResponse,
} from '@/lib/node-manager';
import type { StreamEvent } from '@/lib/types';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/nodes/:id/stream - ノードにメッセージを送信（SSEストリーム）
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: nodeId } = await params;

  let body: { content: string };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { content } = body;

  if (!content || typeof content !== 'string') {
    return new Response('Message content is required', { status: 400 });
  }

  // ノードの存在確認
  const node = await getNode(nodeId);
  if (!node) {
    return new Response('Node not found', { status: 404 });
  }

  // ステータスをactiveに更新
  await updateNodeStatus(nodeId, 'active');

  // セッションIDを取得
  const session = await getNodeSession(nodeId);

  // SSEストリームを作成
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: StreamEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      try {
        let lastSessionId: string | undefined;
        let totalCost = 0;

        // Claude CLIのストリームを処理
        for await (const event of executeClaudeStream({
          nodeId,
          prompt: content,
          sessionId: session.session_id,
        })) {
          sendEvent(event);

          // 完了イベントからセッション情報を取得
          if (event.type === 'complete') {
            lastSessionId = event.data.sessionId;
            totalCost = event.data.cost || 0;
          }
        }

        // セッション情報を更新
        if (lastSessionId) {
          await updateNodeFromResponse(nodeId, lastSessionId, totalCost);
        } else {
          await updateNodeStatus(nodeId, 'idle');
        }
      } catch (error) {
        console.error('[Stream] Error:', error);
        const errorEvent: StreamEvent = {
          type: 'error',
          nodeId,
          data: {
            content: error instanceof Error ? error.message : 'Unknown error',
          },
          timestamp: new Date().toISOString(),
        };
        sendEvent(errorEvent);
        await updateNodeStatus(nodeId, 'idle');
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
