import { NextRequest, NextResponse } from 'next/server';
import { clearNodeSession, getNode } from '@/lib/node-manager';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/nodes/:id/clear - セッションをクリア
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id: nodeId } = await params;

    // ノードの存在確認
    const node = await getNode(nodeId);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    await clearNodeSession(nodeId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to clear session:', error);
    return NextResponse.json({ error: 'Failed to clear session' }, { status: 500 });
  }
}
