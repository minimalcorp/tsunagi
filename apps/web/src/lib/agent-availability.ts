import type { AgentAvailability } from '@minimalcorp/tsunagi-shared';

/** CLI が使えない理由（使えるなら undefined。導入状況が未取得の場合も undefined） */
export function agentDisabledReason(label: string, availability: AgentAvailability | undefined) {
  if (!availability) return undefined;
  if (!availability.installed) return `${label} の CLI が見つかりません`;
  if (!availability.supported) return agentOutdatedReason(label, availability);
  return undefined;
}

export function agentOutdatedReason(label: string, availability: AgentAvailability) {
  return `${label} ${availability.version ?? ''} は古いため使えません（${availability.minVersion} 以上が必要）`;
}
