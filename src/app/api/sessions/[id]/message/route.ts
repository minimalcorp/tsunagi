import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';

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

    // TODO: Phase 6 - Implement Claude Agent SDK integration
    // For now, just add the message to logs
    const newLog = {
      timestamp: new Date().toISOString(),
      type: 'message' as const,
      content,
      metadata: {},
    };

    await sessionRepo.updateSession(id, {
      logs: [...session.logs, newLog],
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('POST /api/sessions/[id]/message error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
