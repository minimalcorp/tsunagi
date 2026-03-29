import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ tab_id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { tab_id } = await params;

  try {
    const tab = await prisma.tab.findUnique({
      where: { tabId: tab_id },
      select: { todos: true },
    });

    if (!tab) {
      return NextResponse.json({ error: 'Tab not found' }, { status: 404 });
    }

    const todos = tab.todos ? JSON.parse(tab.todos) : [];
    return NextResponse.json({ data: { todos } });
  } catch (error) {
    console.error('Failed to get tab todos:', error);
    return NextResponse.json({ error: 'Failed to get todos' }, { status: 500 });
  }
}
