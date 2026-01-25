import { NextRequest, NextResponse } from 'next/server';
import * as sessionRepo from '@/lib/session-repository';
import * as taskRepo from '@/lib/task-repository';
import * as envRepo from '@/lib/env-repository';
import { executeSession } from '@/lib/claude-client';
import { normalizeBranchName } from '@/lib/branch-utils';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { sseManager } from '@/lib/sse-manager';

type Params = {
  params: Promise<{ id: string }>;
};

// POST /api/sessions/[id]/message
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: 'Missing required field: message' }, { status: 400 });
    }

    const session = await sessionRepo.getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
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
      normalizeBranchName(task.branch)
    );

    // Ensure working directory exists
    if (!fs.existsSync(workingDirectory)) {
      fs.mkdirSync(workingDirectory, { recursive: true });
    }

    // Get environment variables for this task
    const env = await envRepo.getEnv('repo', task.owner, task.repo);

    // Create user message for rawMessages (SDK format)
    const userRawMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: message,
      },
      session_id: session.agentSessionId || '',
      uuid: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    await sessionRepo.updateSession(id, {
      rawMessages: [...(session.rawMessages || []), userRawMessage],
    });

    // Update session status to running
    await sessionRepo.updateSession(id, { status: 'running' });

    // SSE broadcast (session updated with user message)
    const updatedSession = await sessionRepo.getSession(id);
    if (updatedSession) {
      sseManager.broadcast('session:updated', updatedSession);
    }

    // Update task claudeState to running
    await taskRepo.updateTask(task.id, { claudeState: 'running' });

    // Execute Claude in background
    executeSession({
      sessionId: id,
      prompt: message,
      workingDirectory,
      env,
      agentSessionId: session.agentSessionId,
      onRawMessage: async (rawMessage: unknown) => {
        // Raw messageを永続化（タイムスタンプを追加）
        const currentSession = await sessionRepo.getSession(id);
        if (currentSession) {
          const messageWithTimestamp =
            typeof rawMessage === 'object' && rawMessage !== null
              ? { ...(rawMessage as Record<string, unknown>), created_at: new Date().toISOString() }
              : rawMessage;
          await sessionRepo.updateSession(id, {
            rawMessages: [...(currentSession.rawMessages || []), messageWithTimestamp],
          });

          // SSE broadcast (session updated with new message)
          const updatedSession = await sessionRepo.getSession(id);
          if (updatedSession) {
            sseManager.broadcast('session:updated', updatedSession);
          }
        }
      },
      onStatusChange: async (status) => {
        // Update session status
        await sessionRepo.updateSession(id, {
          status,
          ...(status === 'success' || status === 'error'
            ? { completedAt: new Date().toISOString() }
            : {}),
        });

        // Update task claudeState
        await taskRepo.updateTask(task.id, {
          claudeState: status === 'running' ? 'running' : 'idle',
        });

        // SSE broadcast (session status changed)
        const updatedSession = await sessionRepo.getSession(id);
        if (updatedSession) {
          sseManager.broadcast('session:updated', updatedSession);
        }

        // SSE broadcast (task claudeState changed)
        const updatedTask = await taskRepo.getTask(task.id);
        if (updatedTask) {
          sseManager.broadcast('task:updated', updatedTask);
        }
      },
      onAgentSessionId: async (agentSessionId: string) => {
        // Store the agent session ID for future resume
        await sessionRepo.updateSession(id, { agentSessionId });
      },
    }).catch(async (error) => {
      console.error('Claude execution error:', error);
      await sessionRepo.updateSession(id, {
        status: 'error',
        completedAt: new Date().toISOString(),
      });
      await taskRepo.updateTask(task.id, { claudeState: 'idle' });
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('POST /api/sessions/[id]/message error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
