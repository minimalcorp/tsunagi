import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';
import { sseManager } from '@/lib/sse-manager';

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/sessions/[id]
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await sessionRepo.getSession(id);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ data: session });
  } catch (error) {
    console.error('GET /api/sessions/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

// DELETE /api/sessions/[id]?cancel=true
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const shouldCancel = searchParams.get('cancel') === 'true';

    const session = await sessionRepo.getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // If cancel=true, interrupt the session before deleting
    if (shouldCancel && session.status === 'running') {
      // Note: We don't update status, just delete the session
      // The interrupt will be handled by the deletion itself
    }

    const success = await sessionRepo.deleteSession(id);

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }

    // SSE broadcast
    sseManager.broadcast('session:deleted', { id });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('DELETE /api/sessions/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
