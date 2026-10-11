'use client';

import { useEffect, useState } from 'react';
import type { AgentAvailability } from '@minimalcorp/tsunagi-shared';
import { apiUrl } from '@/lib/api-url';

/**
 * エージェント CLI（claude / codex）の導入状況。取得前・取得失敗時は null。
 * 起動中に CLI を入れても拾えるよう、マウントのたびに問い合わせる（サーバー側で短時間キャッシュする）
 */
export function useAgentAvailability(): AgentAvailability[] | null {
  const [agents, setAgents] = useState<AgentAvailability[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('/api/agents'))
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: { agents: AgentAvailability[] } };
        if (!cancelled) setAgents(json.data.agents);
      })
      .catch((error: unknown) => console.error('Failed to fetch agent availability:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  return agents;
}
