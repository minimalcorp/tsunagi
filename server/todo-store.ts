export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

class TodoStore {
  private store = new Map<string, Todo[]>();

  set(sessionId: string, todos: Todo[]): void {
    this.store.set(sessionId, todos);
  }

  get(sessionId: string): Todo[] {
    return this.store.get(sessionId) ?? [];
  }

  delete(sessionId: string): void {
    this.store.delete(sessionId);
  }
}

export const todoStore = new TodoStore();
