import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';
import { randomUUID } from 'crypto';

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/sessions/[id]/message
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: 'Missing required field: content' }, { status: 400 });
    }

    const session = await sessionRepo.getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // 最初のメッセージ送信時にagentSessionIdを生成
    // TODO: Phase 6 - Replace with actual Claude Agent SDK session ID
    const updates: Partial<typeof session> = {};
    if (!session.agentSessionId) {
      updates.agentSessionId = `agent-${randomUUID()}`;
    }

    // For now, just add the message to logs
    const newLog = {
      timestamp: new Date().toISOString(),
      type: 'message' as const,
      content,
      metadata: { role: 'user' },
    };

    updates.logs = [...session.logs, newLog];

    await sessionRepo.updateSession(id, updates);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('POST /api/sessions/[id]/message error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
