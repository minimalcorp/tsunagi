import { NextRequest, NextResponse } from 'next/server';
import { getNode, saveNodeSettings, deleteNode, getNodeSettings } from '@/lib/node-manager';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/nodes/:id - 特定ノードの情報を取得
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const node = await getNode(id);

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    return NextResponse.json({ node });
  } catch (error) {
    console.error('Failed to get node:', error);
    return NextResponse.json({ error: 'Failed to get node' }, { status: 500 });
  }
}

// PUT /api/nodes/:id - ノード設定を更新
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { model, arcs, position } = body;

    const currentSettings = await getNodeSettings(id);

    const newSettings = {
      model: model ?? currentSettings.model,
      arcs: arcs ?? currentSettings.arcs,
      position: position ?? currentSettings.position,
    };

    await saveNodeSettings(id, newSettings);

    const node = await getNode(id);
    return NextResponse.json({ success: true, node });
  } catch (error) {
    console.error('Failed to update node:', error);
    return NextResponse.json({ error: 'Failed to update node' }, { status: 500 });
  }
}

// DELETE /api/nodes/:id - ノードを削除
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const success = await deleteNode(id);

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete node:', error);
    return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 });
  }
}
