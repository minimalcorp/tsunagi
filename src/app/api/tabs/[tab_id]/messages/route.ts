import { NextRequest, NextResponse } from 'next/server';
import * as tabRepo from '@/lib/repositories/tab';

type Params = {
  params: Promise<{ tab_id: string }>;
};

// GET /api/tabs/[tab_id]/messages
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tab_id } = await params;

    // Repository層でマージ済みメッセージを取得
    const messages = await tabRepo.getMergedMessages(tab_id);

    // ユーザーメッセージ数を取得
    const sessionData = await tabRepo.getSessionData(tab_id);
    const promptCount = sessionData?.prompts?.length ?? 0;

    return NextResponse.json({ data: { messages, promptCount } });
  } catch (error) {
    console.error('GET /api/tabs/[tab_id]/messages error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
