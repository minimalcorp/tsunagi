import { NextRequest, NextResponse } from 'next/server';
import * as repoRepo from '@/lib/repositories/repository';

// GET /api/repos
export async function GET() {
  try {
    const repos = await repoRepo.getRepos();
    return NextResponse.json({ data: repos });
  } catch (error) {
    console.error('GET /api/repos error:', error);
    return NextResponse.json({ error: 'Failed to fetch repositories' }, { status: 500 });
  }
}

// POST /api/repos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, repo, cloneUrl } = body;

    // Validation
    if (!owner || !repo || !cloneUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: owner, repo, cloneUrl' },
        { status: 400 }
      );
    }

    const newRepo = await repoRepo.createRepo({
      owner,
      repo,
      cloneUrl,
    });

    return NextResponse.json({ data: newRepo }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('POST /api/repos error:', error);
    return NextResponse.json({ error: 'Failed to create repository' }, { status: 500 });
  }
}
