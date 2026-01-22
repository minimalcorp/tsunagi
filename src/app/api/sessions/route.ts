import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';
import type { ClaudeSession } from '@/lib/types';

// GET /api/sessions?status=...&taskId=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const taskId = searchParams.get('taskId');
    const status = searchParams.get('status') as ClaudeSession['status'] | null;

    let sessions = await sessionRepo.getSessions(taskId || undefined);

    // Filter by status if provided
    if (status) {
      sessions = sessions.filter((s) => s.status === status);
    }

    return NextResponse.json({ data: sessions });
  } catch (error) {
    console.error('GET /api/sessions error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
