'use client';

import { useParams } from 'next/navigation';
import { ActiveTasksSidebar } from '@/components/task-detail/ActiveTasksSidebar';

/**
 * タスク詳細ページ共通のレイアウト。
 * サイドバーを layout に置くことで、タスク間の遷移でも購読・一覧を作り直さない。
 */
export default function TasksLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="h-screen flex bg-background">
      <ActiveTasksSidebar currentTaskId={id} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
