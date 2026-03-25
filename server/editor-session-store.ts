interface EditorSession {
  filePath: string;
  content: string;
  status: 'pending' | 'done';
  createdAt: number;
}

export const editorSessionStore = new Map<string, EditorSession>();

// 10分以上経過したセッションを定期クリーンアップ
setInterval(() => {
  const threshold = Date.now() - 10 * 60 * 1000;
  for (const [id, session] of editorSessionStore) {
    if (session.createdAt < threshold) {
      editorSessionStore.delete(id);
    }
  }
}, 60 * 1000);
