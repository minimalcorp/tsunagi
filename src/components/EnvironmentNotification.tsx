'use client';

interface EnvironmentNotificationProps {
  hasAnthropicApiKey: boolean;
  hasClaudeCodeToken: boolean;
}

export function EnvironmentNotification({
  hasAnthropicApiKey,
  hasClaudeCodeToken,
}: EnvironmentNotificationProps) {
  if (hasAnthropicApiKey && hasClaudeCodeToken) return null;

  return (
    <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200">
      <div className="mx-6 py-2 flex items-center justify-center gap-2 text-sm text-amber-900">
        <span>⚠️</span>
        <span>必要なトークンを設定してください</span>
        <span className="text-xs">👆 Settings</span>
      </div>
    </div>
  );
}
