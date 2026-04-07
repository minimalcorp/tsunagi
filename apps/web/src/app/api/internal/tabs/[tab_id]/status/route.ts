import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ tab_id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { tab_id } = await params;
  const body = (await request.json()) as { status: string; todos?: unknown[] };
  const { status, todos } = body;

  if (!status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  const result = await prisma.tab.updateMany({
    where: { tabId: tab_id },
    data: {
      status,
      ...(todos !== undefined && { todos: JSON.stringify(todos) }),
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: 'Tab not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { tabId: tab_id, status } });
}
