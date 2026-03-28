import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/planner/tabs
export async function GET() {
  try {
    const tabs = await prisma.plannerTab.findMany({
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({
      data: {
        tabs: tabs.map((tab) => ({
          tab_id: tab.tabId,
          order: tab.order,
          status: tab.status,
          startedAt: tab.startedAt.toISOString(),
          completedAt: tab.completedAt?.toISOString(),
          updatedAt: tab.updatedAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/planner/tabs error:', error);
    return NextResponse.json({ error: 'Failed to fetch planner tabs' }, { status: 500 });
  }
}

// POST /api/planner/tabs
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tabId } = body;

    if (!tabId) {
      return NextResponse.json({ error: 'tabId is required' }, { status: 400 });
    }

    // Get max order
    const maxOrderTab = await prisma.plannerTab.findFirst({
      orderBy: { order: 'desc' },
    });
    const order = (maxOrderTab?.order ?? 0) + 1;

    const tab = await prisma.plannerTab.create({
      data: {
        tabId,
        order,
        status: 'idle',
        startedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        data: {
          tab: {
            tab_id: tab.tabId,
            order: tab.order,
            status: tab.status,
            startedAt: tab.startedAt.toISOString(),
            completedAt: tab.completedAt?.toISOString(),
            updatedAt: tab.updatedAt.toISOString(),
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/planner/tabs error:', error);
    return NextResponse.json({ error: 'Failed to create planner tab' }, { status: 500 });
  }
}

// DELETE /api/planner/tabs
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const tabId = searchParams.get('tabId');

    if (!tabId) {
      return NextResponse.json({ error: 'tabId query parameter is required' }, { status: 400 });
    }

    await prisma.plannerTab.delete({ where: { tabId } });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('DELETE /api/planner/tabs error:', error);
    return NextResponse.json({ error: 'Failed to delete planner tab' }, { status: 500 });
  }
}
