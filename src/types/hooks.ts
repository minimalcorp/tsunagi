/**
 * PreToolUse hook input types
 */
export interface PreToolUseInput {
  tool_name: string;
  tool_input: unknown;
}

/**
 * Hook context type
 */
export interface HookContext {
  signal?: AbortSignal;
  [key: string]: unknown;
}

/**
 * Hook output for modifying tool input
 */
export interface ModifiedToolInputOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    modifiedToolInput: Record<string, unknown>;
  };
}

/**
 * Hook output for denying permission
 */
export interface DenyPermissionOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'deny';
    permissionDecisionReason: string;
  };
}

/**
 * Hook output type
 */
export type HookOutput = ModifiedToolInputOutput | DenyPermissionOutput | Record<string, never>;

/**
 * PreToolUse hook callback type
 */
export type PreToolUseHookCallback = (
  input: PreToolUseInput,
  toolUseId: string,
  context: HookContext
) => Promise<HookOutput>;
