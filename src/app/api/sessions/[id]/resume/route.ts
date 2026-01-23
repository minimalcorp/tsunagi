import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';
import * as taskRepo from '@/lib/task-repository';
import * as envRepo from '@/lib/env-repository';
import { getClaudeClient } from '@/lib/claude-client';
import * as path from 'path';
import * as os from 'os';
import type { LogEntry } from '@/lib/types';

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/sessions/[id]/resume
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    let message: string | undefined;

    try {
      const body = await request.json();
      message = body.message;
    } catch {
      // Empty body is acceptable
      message = undefined;
    }

    const session = await sessionRepo.getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'paused') {
      return NextResponse.json({ error: 'Session is not paused' }, { status: 400 });
    }

    // Get task to access owner/repo/branch info
    const task = await taskRepo.getTask(session.taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get working directory for the task
    const workingDirectory = path.join(
      os.homedir(),
      '.tsunagi',
      'workspaces',
      task.owner,
      task.repo,
      task.branch
    );

    // Get environment variables for this task
    const env = await envRepo.getEnv('repo', task.owner, task.repo);

    // Update session status to running
    await sessionRepo.updateSession(id, { status: 'running' });

    // Update task claudeState to running
    await taskRepo.updateTask(task.id, { claudeState: 'running' });

    // Resume Claude execution
    const claudeClient = getClaudeClient();
    const resumePrompt = message || 'Continue with the task.';

    // Execute asynchronously (don't await)
    claudeClient
      .resumeSession({
        sessionId: id,
        prompt: resumePrompt,
        workingDirectory,
        env,
        onLog: async (log: LogEntry) => {
          const currentSession = await sessionRepo.getSession(id);
          if (currentSession) {
            await sessionRepo.updateSession(id, {
              logs: [...currentSession.logs, log],
            });
          }
        },
        onStatusChange: async (status) => {
          await sessionRepo.updateSession(id, {
            status:
              status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'running',
            ...(status === 'completed' || status === 'failed'
              ? { completedAt: new Date().toISOString() }
              : {}),
          });

          await taskRepo.updateTask(task.id, {
            claudeState: status === 'running' ? 'running' : 'idle',
          });
        },
      })
      .catch(async (error) => {
        console.error('Claude resume error:', error);
        await sessionRepo.updateSession(id, {
          status: 'failed',
          completedAt: new Date().toISOString(),
        });
        await taskRepo.updateTask(task.id, { claudeState: 'idle' });
      });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('POST /api/sessions/[id]/resume error:', error);
    return NextResponse.json({ error: 'Failed to resume session' }, { status: 500 });
  }
}
