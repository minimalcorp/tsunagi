import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/sessions/[id]/interrupt
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const session = await sessionRepo.getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'running') {
      return NextResponse.json({ error: 'Session is not running' }, { status: 400 });
    }

    // TODO: Phase 6 - Implement Claude Agent SDK interrupt
    await sessionRepo.updateSession(id, {
      status: 'paused',
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('POST /api/sessions/[id]/interrupt error:', error);
    return NextResponse.json({ error: 'Failed to interrupt session' }, { status: 500 });
  }
}
