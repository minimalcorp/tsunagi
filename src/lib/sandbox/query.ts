import { query } from '@anthropic-ai/claude-agent-sdk';
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import type { QuerySandboxConfig } from '@/types/sandbox';
import { toSandboxRuntimeConfig } from './config';
import { bashSandboxHook, fileAccessHook } from './hooks';

/**
 * Execute a query with sandbox restrictions
 */
export async function sandboxedQuery(
  prompt: string,
  sandboxConfig: QuerySandboxConfig
): Promise<unknown> {
  // Initialize sandbox
  await SandboxManager.initialize(toSandboxRuntimeConfig(sandboxConfig));

  try {
    // Execute query with hooks
    const result = await query({
      prompt,
      options: {
        permissionMode: 'bypassPermissions',
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [bashSandboxHook as any] },
            {
              matcher: 'Edit',
              hooks: [
                async (input: any, _toolUseId: string): Promise<any> =>
                  fileAccessHook(input, _toolUseId, { sandboxConfig }),
              ],
            },
            {
              matcher: 'Write',
              hooks: [
                async (input: any, _toolUseId: string): Promise<any> =>
                  fileAccessHook(input, _toolUseId, { sandboxConfig }),
              ],
            },
          ],
        },
      },
    });

    return result;
  } finally {
    // Cleanup
    await SandboxManager.reset();
  }
}

/**
 * Helper function to execute a function with sandbox
 */
export async function withSandbox<T>(config: QuerySandboxConfig, fn: () => Promise<T>): Promise<T> {
  await SandboxManager.initialize(toSandboxRuntimeConfig(config));
  try {
    return await fn();
  } finally {
    await SandboxManager.reset();
  }
}
