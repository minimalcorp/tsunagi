import type { QuerySandboxConfig } from '@/types/sandbox';
import type { PreToolUseInput, HookOutput } from '@/types/hooks';

/**
 * PreToolUse hook for file access validation
 */
export async function fileAccessHook(
  input: PreToolUseInput,
  _toolUseId: string,
  context: { sandboxConfig: QuerySandboxConfig }
): Promise<HookOutput> {
  // Only handle Edit and Write tools
  if (!['Edit', 'Write'].includes(input.tool_name)) {
    return {};
  }

  const filePath = (input.tool_input as Record<string, unknown>).file_path as string;
  const allowedPaths = context.sandboxConfig.allowWrite;

  // Check if path is allowed
  const isAllowed = allowedPaths.some((path) => filePath.startsWith(path));

  if (!isAllowed) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `このディレクトリへの書き込みは禁止されています: ${filePath}`,
      },
    };
  }

  return {};
}
