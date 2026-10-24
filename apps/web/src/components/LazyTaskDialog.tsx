'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { TaskDialogProps } from '@/components/TaskDialog';

const loadTaskDialog = () => import('@/components/TaskDialog');

const TaskDialog = dynamic(() => loadTaskDialog().then((m) => m.TaskDialog), { ssr: false });

/**
 * TaskDialog を初めて開くまでマウントしない。TaskDialog は Monaco / react-markdown / mermaid を
 * 引き連れており、トップや詳細ページの初期チャンクに含めると、ページ遷移のたびにボード表示より
 * 先にそのロードと評価を払うことになる。開いた後はマウントしたままにして、閉じるアニメーションと
 * 入力内容を保つ。
 */
export function LazyTaskDialog(props: TaskDialogProps) {
  const [hasOpened, setHasOpened] = useState(props.isOpen);
  if (props.isOpen && !hasOpened) setHasOpened(true);

  // 初回クリックで待たせないよう、画面が落ち着いてからチャンクだけ先読みする
  useEffect(() => {
    if (hasOpened) return;
    if (typeof window.requestIdleCallback !== 'function') {
      void loadTaskDialog();
      return;
    }
    const id = window.requestIdleCallback(() => void loadTaskDialog());
    return () => window.cancelIdleCallback(id);
  }, [hasOpened]);

  if (!hasOpened) return null;
  return <TaskDialog {...props} />;
}
