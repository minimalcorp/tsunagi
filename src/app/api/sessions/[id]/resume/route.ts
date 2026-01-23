import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/sessions/[id]/resume
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    let message: string | undefined;

    try {
      const body = await request.json();
      message = body.message;
    } catch {
      // Empty body is acceptable
      message = undefined;
    }

    const session = await sessionRepo.getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'paused') {
      return NextResponse.json({ error: 'Session is not paused' }, { status: 400 });
    }

    // TODO: Phase 6 - Implement Claude Agent SDK resume
    const logs = [...session.logs];
    if (message) {
      logs.push({
        timestamp: new Date().toISOString(),
        type: 'message' as const,
        content: message,
        metadata: {},
      });
    }

    await sessionRepo.updateSession(id, {
      status: 'running',
      logs,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('POST /api/sessions/[id]/resume error:', error);
    return NextResponse.json({ error: 'Failed to resume session' }, { status: 500 });
  }
}
