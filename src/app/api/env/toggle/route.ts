import { NextResponse } from 'next/server';
import { toggleEnv } from '@/lib/env-repository';

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { key, scope, enabled, owner, repo } = body;

    if (!key || !scope || typeof enabled !== 'boolean') {
      return NextResponse.json(
        {
          error: 'key, scope, and enabled are required',
        },
        { status: 400 }
      );
    }

    await toggleEnv(key, scope, enabled, owner, repo);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('Failed to toggle environment variable:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to toggle environment variable',
      },
      { status: 500 }
    );
  }
}
