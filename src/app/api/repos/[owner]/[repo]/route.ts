import { NextRequest, NextResponse } from 'next/server';
import * as repoRepo from '@/lib/repositories/repository';

type Params = {
  params: Promise<{ owner: string; repo: string }>;
};

// GET /api/repos/[owner]/[repo]
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { owner, repo } = await params;
    const repository = await repoRepo.getRepo(owner, repo);

    if (!repository) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    return NextResponse.json({ data: repository });
  } catch (error) {
    console.error('GET /api/repos/[owner]/[repo] error:', error);
    return NextResponse.json({ error: 'Failed to fetch repository' }, { status: 500 });
  }
}

// DELETE /api/repos/[owner]/[repo]
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { owner, repo } = await params;
    const repository = await repoRepo.getRepo(owner, repo);

    if (!repository) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }

    const success = await repoRepo.deleteRepo(repository.id);

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete repository' }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('DELETE /api/repos/[owner]/[repo] error:', error);
    return NextResponse.json({ error: 'Failed to delete repository' }, { status: 500 });
  }
}
