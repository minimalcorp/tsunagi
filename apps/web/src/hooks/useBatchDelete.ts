import { useState, useCallback } from 'react';

interface BatchDeleteState {
  batchId: string | null;
  totalCount: number;
  deletedCount: number;
  errorCount: number;
  isDeleting: boolean;
  isCompleted: boolean;
}

// バッチ削除フック（フェーズ3でsocket.ioによる進捗通知に再実装予定）
export function useBatchDelete() {
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

      // SSE廃止により進捗追跡はできないため、即座に完了とする
      setState({
        batchId,
        totalCount,
        deletedCount: totalCount,
        errorCount: 0,
        isDeleting: false,
        isCompleted: true,
      });

      return { batchId, totalCount };
    } catch (error) {
      console.error('Batch delete error:', error);
      throw error;
    }
  }, []);

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
