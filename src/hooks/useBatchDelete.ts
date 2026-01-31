import { useState, useEffect, useCallback } from 'react';
import { useSSE } from './useSSE';

interface BatchDeleteState {
  batchId: string | null;
  totalCount: number;
  deletedCount: number;
  errorCount: number;
  isDeleting: boolean;
  isCompleted: boolean;
}

export function useBatchDelete() {
  const { eventSource } = useSSE();
  const [state, setState] = useState<BatchDeleteState>({
    batchId: null,
    totalCount: 0,
    deletedCount: 0,
    errorCount: 0,
    isDeleting: false,
    isCompleted: false,
  });

  // バッチ削除APIを呼び出す
  const startBatchDelete = useCallback(async (daysAgo: number = 7) => {
    try {
      const response = await fetch('/api/tasks/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysAgo }),
      });

      if (!response.ok) {
        throw new Error('Failed to start batch delete');
      }

      const result = await response.json();
      const { batchId, totalCount } = result.data;

      // 削除対象が0件の場合は状態を更新しない
      if (totalCount === 0) {
        return { batchId, totalCount };
      }

      setState({
        batchId,
        totalCount,
        deletedCount: 0,
        errorCount: 0,
        isDeleting: true,
        isCompleted: false,
      });

      return { batchId, totalCount };
    } catch (error) {
      console.error('Batch delete error:', error);
      throw error;
    }
  }, []);

  // 削除完了イベントと削除エラーイベントを購読
  useEffect(() => {
    if (!eventSource || !state.batchId) return;

    const handleTaskDeleted = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // このbatchIdに属するイベントのみカウント
        if (data.batchId === state.batchId) {
          setState((prev) => {
            const newDeletedCount = prev.deletedCount + 1;
            const processedCount = newDeletedCount + prev.errorCount;
            const isCompleted = processedCount >= prev.totalCount;

            return {
              ...prev,
              deletedCount: newDeletedCount,
              isCompleted,
              isDeleting: !isCompleted,
            };
          });
        }
      } catch (error) {
        console.error('Failed to parse task:deleted event:', error);
      }
    };

    const handleTaskDeleteError = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // このbatchIdに属するイベントのみカウント
        if (data.batchId === state.batchId) {
          setState((prev) => {
            const newErrorCount = prev.errorCount + 1;
            const processedCount = prev.deletedCount + newErrorCount;
            const isCompleted = processedCount >= prev.totalCount;

            return {
              ...prev,
              errorCount: newErrorCount,
              isCompleted,
              isDeleting: !isCompleted,
            };
          });
        }
      } catch (error) {
        console.error('Failed to parse task:delete:error event:', error);
      }
    };

    eventSource.addEventListener('task:deleted', handleTaskDeleted);
    eventSource.addEventListener('task:delete:error', handleTaskDeleteError);

    return () => {
      eventSource.removeEventListener('task:deleted', handleTaskDeleted);
      eventSource.removeEventListener('task:delete:error', handleTaskDeleteError);
    };
  }, [eventSource, state.batchId]);

  // リセット
  const reset = useCallback(() => {
    setState({
      batchId: null,
      totalCount: 0,
      deletedCount: 0,
      errorCount: 0,
      isDeleting: false,
      isCompleted: false,
    });
  }, []);

  return {
    ...state,
    startBatchDelete,
    reset,
  };
}
