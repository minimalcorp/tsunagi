'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { apiUrl } from '@/lib/api-url';

/**
 * ローカルLLM（Ollama / LM Studio / SearXNG）の設定欄で共通に使う小物。
 * 各欄は個別に最適化し、「状態の行」「項目」「詳細設定」の形だけ揃える。
 */

/** tsunagi API を呼び、`{ data }` を返す。失敗時は `{ error }` のメッセージで例外にする */
export async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  const body = (await res.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!res.ok || body?.data === undefined) {
    throw new Error(body?.error || `HTTPエラー: ${res.status}`);
  }
  return body.data;
}

export function putJson<T>(path: string, value: unknown): Promise<T> {
  return requestData<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** extraEnv を「KEY=VALUE」行のテキストに変換する */
export function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/** 「KEY=VALUE」行のテキストを extraEnv に変換する（空行・# 始まりは無視） */
export function textToEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

/** 状態の行（アイコン + 短い文 + 操作ボタン） */
export function StatusRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      {children}
    </div>
  );
}

/** ラベル付きの項目 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[0.65rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 折りたたみの詳細設定 */
export function AdvancedSettings({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        詳細設定
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3 border-l border-border pl-3">{children}</div>
      )}
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1">{children}</code>;
}
