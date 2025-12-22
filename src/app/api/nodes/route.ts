import { NextRequest, NextResponse } from 'next/server';
import { getAllNodes, createNode } from '@/lib/node-manager';
import type { NodeSettings } from '@/lib/types';

// GET /api/nodes - 全ノード一覧を取得
export async function GET() {
  try {
    const nodes = await getAllNodes();
    return NextResponse.json({ nodes });
  } catch (error) {
    console.error('Failed to get nodes:', error);
    return NextResponse.json({ error: 'Failed to get nodes' }, { status: 500 });
  }
}

// POST /api/nodes - 新規ノード作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, model = 'sonnet', arcs = [] } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Node ID is required' }, { status: 400 });
    }

    // IDのバリデーション（英数字とハイフン、アンダースコアのみ）
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid node ID format' }, { status: 400 });
    }

    const settings: NodeSettings = { model, arcs };
    const node = await createNode(id, settings);

    return NextResponse.json({ success: true, node });
  } catch (error) {
    console.error('Failed to create node:', error);
    return NextResponse.json({ error: 'Failed to create node' }, { status: 500 });
  }
}
