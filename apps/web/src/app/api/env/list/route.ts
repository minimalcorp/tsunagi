import { NextRequest, NextResponse } from 'next/server';
import { getAllEnv } from '@/lib/repositories/environment';

// GET /api/env/list?scope=global&owner=...&repo=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const scope = (searchParams.get('scope') as 'global' | 'owner' | 'repo' | null) || 'global';
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (scope === 'owner' && !owner) {
      return NextResponse.json(
        { error: 'Missing required query parameter: owner for scope=owner' },
        { status: 400 }
      );
    }

    if (scope === 'repo' && (!owner || !repo)) {
      return NextResponse.json(
        { error: 'Missing required query parameters: owner, repo for scope=repo' },
        { status: 400 }
      );
    }

    const envVars = await getAllEnv(scope, owner || undefined, repo || undefined);

    return NextResponse.json({ data: { envVars } });
  } catch (error) {
    console.error('GET /api/env/list error:', error);
    return NextResponse.json({ error: 'Failed to fetch environment variables' }, { status: 500 });
  }
}
