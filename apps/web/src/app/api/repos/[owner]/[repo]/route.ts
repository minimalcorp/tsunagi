import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as repoRepo from '@/lib/repositories/repository';
import * as taskRepo from '@/lib/repositories/task';

type Params = {
  params: Promise<{ owner: string; repo: string }>;
};

const WORKSPACES_ROOT = path.join(os.homedir(), '.tsunagi', 'workspaces');

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

    // Count associated tasks for response
    const tasks = await taskRepo.getTasks({ owner, repo, includeDeleted: false });
    const taskCount = tasks.length;

    // 1. Delete filesystem: entire workspace directory
    const workspacePath = path.join(WORKSPACES_ROOT, owner, repo);
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to delete workspace directory:', error);
      // Continue with DB deletion even if filesystem cleanup fails
    }

    // 2. DB cascade delete (Repository -> Tasks -> Tabs + EnvironmentVariables)
    const success = await repoRepo.deleteRepo(repository.id);

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete repository' }, { status: 500 });
    }

    // Clean up empty owner directory if no other repos exist
    try {
      const ownerPath = path.join(WORKSPACES_ROOT, owner);
      const entries = await fs.readdir(ownerPath);
      if (entries.length === 0) {
        await fs.rmdir(ownerPath);
      }
    } catch {
      // Ignore cleanup errors
    }

    return NextResponse.json({ data: { success: true, deletedTaskCount: taskCount } });
  } catch (error) {
    console.error('DELETE /api/repos/[owner]/[repo] error:', error);
    return NextResponse.json({ error: 'Failed to delete repository' }, { status: 500 });
  }
}
