import { NextRequest, NextResponse } from 'next/server';
import * as tabRepo from '@/lib/tab-repository';

type Params = {
  params: Promise<{ tab_id: string }>;
};

// GET /api/tabs/[tab_id]/messages
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tab_id } = await params;

    const sessionData = await tabRepo.getSessionData(tab_id);
    if (!sessionData) {
      return NextResponse.json({ error: 'Tab not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { rawMessages: sessionData.rawMessages } });
  } catch (error) {
    console.error('GET /api/tabs/[tab_id]/messages error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
