import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import type { PreToolUseHookCallback, HookOutput } from '@/types/hooks';

/**
 * Simple commands that are safe to run without sandbox
 */
const SAFE_COMMANDS = ['ls', 'pwd', 'echo', 'cat', 'which', 'env'];

/**
 * Check if command needs sandbox wrapping
 */
function needsSandbox(command: string): boolean {
  const trimmed = command.trim();
  const firstWord = trimmed.split(' ')[0];

  // Simple read-only commands without redirection
  if (SAFE_COMMANDS.includes(firstWord) && !trimmed.includes('>')) {
    return false;
  }

  return true;
}

/**
 * PreToolUse hook for Bash command sandboxing
 */
export const bashSandboxHook: PreToolUseHookCallback = async (input): Promise<HookOutput> => {
  // Only handle Bash tool
  if (input.tool_name !== 'Bash') {
    return {};
  }

  const originalCommand = (input.tool_input as Record<string, unknown>).command as string;

  // Skip sandbox for simple safe commands
  if (!needsSandbox(originalCommand)) {
    return {};
  }

  try {
    // Wrap command with sandbox
    const sandboxedCommand = await SandboxManager.wrapWithSandbox(originalCommand);

    // Return modified command
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        modifiedToolInput: {
          command: sandboxedCommand,
        },
      },
    };
  } catch (error) {
    console.error('Failed to wrap command with sandbox:', error);
    // Let the command proceed without sandbox if wrapping fails
    return {};
  }
};
