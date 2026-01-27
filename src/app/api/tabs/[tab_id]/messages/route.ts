import { NextRequest, NextResponse } from 'next/server';
import * as tabRepo from '@/lib/tab-repository';

type Params = {
  params: Promise<{ tab_id: string }>;
};

// GET /api/tabs/[tab_id]/messages
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tab_id } = await params;

    // Repository層でマージ済みメッセージを取得
    const messages = await tabRepo.getMergedMessages(tab_id);

    return NextResponse.json({ data: { messages } });
  } catch (error) {
    console.error('GET /api/tabs/[tab_id]/messages error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
