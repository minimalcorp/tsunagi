import { NextRequest, NextResponse } from 'next/server';
import * as envRepo from '@/lib/repositories/environment';

// GET /api/env?scope=global&owner=...&repo=...
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

    const env = await envRepo.getEnv(scope, owner || undefined, repo || undefined);

    return NextResponse.json({ data: { env } });
  } catch (error) {
    console.error('GET /api/env error:', error);
    return NextResponse.json({ error: 'Failed to fetch environment variables' }, { status: 500 });
  }
}

// POST /api/env
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, scope, owner, repo } = body;

    // Validation
    if (!key || !value || !scope) {
      return NextResponse.json(
        { error: 'Missing required fields: key, value, scope' },
        { status: 400 }
      );
    }

    if (scope === 'owner' && !owner) {
      return NextResponse.json(
        { error: 'Missing required field: owner for scope=owner' },
        { status: 400 }
      );
    }

    if (scope === 'repo' && (!owner || !repo)) {
      return NextResponse.json(
        { error: 'Missing required fields: owner, repo for scope=repo' },
        { status: 400 }
      );
    }

    await envRepo.setEnv(key, value, scope, owner, repo);
    return NextResponse.json({ data: { success: true } }, { status: 201 });
  } catch (error) {
    console.error('POST /api/env error:', error);
    return NextResponse.json({ error: 'Failed to set environment variable' }, { status: 500 });
  }
}

// PUT /api/env
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, scope, owner, repo } = body;

    // Validation
    if (!key || !value || !scope) {
      return NextResponse.json(
        { error: 'Missing required fields: key, value, scope' },
        { status: 400 }
      );
    }

    if (scope === 'owner' && !owner) {
      return NextResponse.json(
        { error: 'Missing required field: owner for scope=owner' },
        { status: 400 }
      );
    }

    if (scope === 'repo' && (!owner || !repo)) {
      return NextResponse.json(
        { error: 'Missing required fields: owner, repo for scope=repo' },
        { status: 400 }
      );
    }

    // Update the value (setEnv will overwrite if exists)
    await envRepo.setEnv(key, value, scope, owner, repo);
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('PUT /api/env error:', error);
    return NextResponse.json({ error: 'Failed to update environment variable' }, { status: 500 });
  }
}

// DELETE /api/env?key=...&scope=...&owner=...&repo=...
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const key = searchParams.get('key');
    const scope = searchParams.get('scope') as 'global' | 'owner' | 'repo' | null;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!key || !scope) {
      return NextResponse.json(
        { error: 'Missing required query parameters: key, scope' },
        { status: 400 }
      );
    }

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

    const success = await envRepo.deleteEnv(key, scope, owner || undefined, repo || undefined);

    if (!success) {
      return NextResponse.json({ error: 'Environment variable not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('DELETE /api/env error:', error);
    return NextResponse.json({ error: 'Failed to delete environment variable' }, { status: 500 });
  }
}
