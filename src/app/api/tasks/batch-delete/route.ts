import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as taskRepo from '@/lib/repositories/task';
import * as worktreeManager from '@/lib/worktree-manager';
import { sseManager } from '@/lib/sse-manager';

// POST /api/tasks/batch-delete
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const daysAgo = body.daysAgo ?? 7;

    // バリデーション
    if (typeof daysAgo !== 'number' || daysAgo < 0) {
      return NextResponse.json({ error: 'Invalid daysAgo parameter' }, { status: 400 });
    }

    // 削除対象タスクの抽出（completedAt < now - daysAgo days かつ status = done）
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

    const allTasks = await taskRepo.getTasks({ includeDeleted: false });
    const targetTasks = allTasks.filter((task) => {
      if (task.status !== 'done' || !task.completedAt) {
        return false;
      }
      const completedDate = new Date(task.completedAt);
      return completedDate < cutoffDate;
    });

    const targetTaskIds = targetTasks.map((task) => task.id);
    const totalCount = targetTaskIds.length;

    // バッチIDを生成
    const batchId = uuidv4();

    // レスポンスを先に返す
    const response = NextResponse.json({
      data: {
        batchId,
        targetTaskIds,
        totalCount,
      },
    });

    // バックグラウンドで削除処理を実行
    // （Next.jsの制約上、ここで直接実行するが、本来はワーカーやキューを使うべき）
    setImmediate(async () => {
      for (const task of targetTasks) {
        try {
          // DBから削除
          const success = await taskRepo.deleteTask(task.id);

          if (success) {
            // worktreeとブランチを削除
            try {
              await worktreeManager.removeWorktree(task.owner, task.repo, task.branch, true);
            } catch (error) {
              console.error(`Failed to remove worktree for task ${task.id}:`, error);
            }

            // 削除完了イベントをbatchIdと共にbroadcast
            sseManager.broadcast('task:deleted', { id: task.id, batchId });
          }
        } catch (error) {
          console.error(`Failed to delete task ${task.id}:`, error);
          // エラーが発生してもbatchIdを含めてbroadcast（失敗として通知）
          sseManager.broadcast('task:delete:error', { id: task.id, batchId, error: String(error) });
        }
      }
    });

    return response;
  } catch (error) {
    console.error('POST /api/tasks/batch-delete error:', error);
    return NextResponse.json({ error: 'Failed to batch delete tasks' }, { status: 500 });
  }
}
