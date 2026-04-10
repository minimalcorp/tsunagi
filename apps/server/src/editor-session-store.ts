interface EditorSession {
  filePath: string;
  content: string;
  status: 'pending' | 'done';
  createdAt: number;
  tabId: string | null;
}

export const editorSessionStore = new Map<string, EditorSession>();

// 完了済みセッションを10分後にクリーンアップ（編集中のセッションは保持）
setInterval(() => {
  const threshold = Date.now() - 10 * 60 * 1000;
  for (const [id, session] of editorSessionStore) {
    if (session.status === 'done' && session.createdAt < threshold) {
      editorSessionStore.delete(id);
    }
  }
}, 60 * 1000);
