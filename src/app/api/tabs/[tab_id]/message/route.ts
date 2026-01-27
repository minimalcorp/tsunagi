import { NextRequest, NextResponse } from 'next/server';
import * as taskRepo from '@/lib/task-repository';
import * as tabRepo from '@/lib/tab-repository';
import * as envRepo from '@/lib/env-repository';
import { executeSession } from '@/lib/claude-client';
import { normalizeBranchName } from '@/lib/branch-utils';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { sseManager } from '@/lib/sse-manager';

type Params = {
  params: Promise<{ tab_id: string }>;
};

// POST /api/tabs/[tab_id]/message
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { tab_id } = await params;
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: 'Missing required field: message' }, { status: 400 });
    }

    // タスクとタブを探す
    const tasks = await taskRepo.getTasks({ includeDeleted: false });
    let task = null;
    let tab = null;

    for (const t of tasks) {
      const foundTab = t.tabs?.find((tb) => tb.tab_id === tab_id);
      if (foundTab) {
        task = t;
        tab = foundTab;
        break;
      }
    }

    if (!task || !tab) {
      return NextResponse.json({ error: 'Tab not found' }, { status: 404 });
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

    // Debug: Log session info
    console.log('[Tab Message] Executing prompt for tab:', {
      tab_id,
      taskId: task.id,
      hasSessionId: !!tab.session_id,
      sessionId: tab.session_id,
      isResume: !!tab.session_id,
    });

    // Update tab status to running
    await taskRepo.updateTab(task.id, tab_id, { status: 'running' });

    // Update task claudeState to running
    await taskRepo.updateTask(task.id, { claudeState: 'running' });

    // ユーザープロンプトをsessions.jsonに保存
    await tabRepo.appendUserPrompt(tab_id, message);

    // SSE経由でブロードキャスト（マージ済みメッセージ）
    const messages = await tabRepo.getMergedMessages(tab_id);
    sseManager.broadcast('tab:messages:updated', {
      tab_id,
      messages,
    });

    // Execute Claude in background
    executeSession({
      sessionId: tab_id,
      prompt: message,
      workingDirectory,
      env,
      agentSessionId: tab.session_id,
      onRawMessage: async (rawMessage: unknown) => {
        // Raw messageをsessions.jsonに追加
        await tabRepo.appendMessage(tab_id, rawMessage);

        // SSE broadcast (tab messages updated)
        const messages = await tabRepo.getMergedMessages(tab_id);
        sseManager.broadcast('tab:messages:updated', {
          tab_id,
          messages,
        });
      },
      onStatusChange: async (status) => {
        // Update tab status
        await taskRepo.updateTab(task.id, tab_id, {
          status,
          ...(status === 'success' || status === 'error'
            ? { completedAt: new Date().toISOString() }
            : {}),
        });

        // Update task claudeState
        await taskRepo.updateTask(task.id, {
          claudeState: status === 'running' ? 'running' : 'idle',
        });

        // SSE broadcast (tab status changed)
        const updatedTab = await taskRepo.getTab(task.id, tab_id);
        if (updatedTab) {
          sseManager.broadcast('tab:updated', { taskId: task.id, tab: updatedTab });
        }

        // SSE broadcast (task claudeState changed)
        const updatedTask = await taskRepo.getTask(task.id);
        if (updatedTask) {
          sseManager.broadcast('task:updated', updatedTask);
        }
      },
      onAgentSessionId: async (agentSessionId: string) => {
        // Store the agent session ID for future resume
        console.log('[Tab Message] Storing agent session ID:', {
          tab_id,
          taskId: task.id,
          agentSessionId,
        });
        await taskRepo.updateTab(task.id, tab_id, { session_id: agentSessionId });

        // SSE broadcast
        const updatedTab = await taskRepo.getTab(task.id, tab_id);
        if (updatedTab) {
          console.log('[Tab Message] Tab updated with session_id:', {
            tab_id,
            session_id: updatedTab.session_id,
          });
          sseManager.broadcast('tab:updated', { taskId: task.id, tab: updatedTab });
        }
      },
    }).catch(async (error) => {
      console.error('Claude execution error:', error);
      await taskRepo.updateTab(task.id, tab_id, {
        status: 'error',
        completedAt: new Date().toISOString(),
      });
      await taskRepo.updateTask(task.id, { claudeState: 'idle' });
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('POST /api/tabs/[tab_id]/message error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
