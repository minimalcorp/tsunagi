import { query, type Query } from '@anthropic-ai/claude-agent-sdk';
import * as settingsRepo from './repositories/claude-setting';

export interface ExecuteOptions {
  sessionId: string;
  prompt: string;
  workingDirectory: string;
  env?: Record<string, string>;
  agentSessionId?: string;
  onRawMessage?: (message: unknown) => void; // Raw messagesの永続化用
  onStatusChange?: (status: 'running' | 'success' | 'error') => void;
  onAgentSessionId?: (agentSessionId: string) => void;
  owner?: string; // タスクのowner
  repo?: string; // タスクのrepo
}

/**
 * Active Query objects for interrupt support
 */
const activeQueries = new Map<string, Query>();

/**
 * Execute a Claude session using the Agent SDK
 */
export async function executeSession(options: ExecuteOptions): Promise<void> {
  const {
    sessionId,
    prompt,
    workingDirectory,
    env,
    agentSessionId,
    onRawMessage,
    onStatusChange,
    onAgentSessionId,
    owner,
    repo,
  } = options;

  try {
    onStatusChange?.('running');

    // settingSourcesをプロジェクト設定から取得
    let settingSources: Array<'user' | 'project' | 'local'> | undefined;

    if (owner && repo) {
      const resolvedSettings = await settingsRepo.resolveSettings({ owner, repo });
      settingSources = resolvedSettings.settingSources;
    } else {
      // owner/repoが指定されていない場合はglobal設定を使用
      settingSources = await settingsRepo.getSettingSources('global');
    }

    // Build query options
    const queryOptions: {
      cwd: string;
      env?: Record<string, string>;
      resume?: string;
      permissionMode?: 'bypassPermissions';
      allowDangerouslySkipPermissions?: boolean;
      bypassPermissions?: boolean;
      settingSources?: Array<'user' | 'project' | 'local'>;
    } = {
      cwd: workingDirectory,
      permissionMode:
        process.env.CLAUDE_BYPASS_PERMISSIONS !== 'false'
          ? ('bypassPermissions' as const)
          : undefined,
      allowDangerouslySkipPermissions: process.env.CLAUDE_BYPASS_PERMISSIONS !== 'false',
      bypassPermissions: process.env.CLAUDE_BYPASS_PERMISSIONS !== 'false',
      settingSources, // 追加（undefinedの場合はisolationモード）
    };

    // Merge custom env with system environment to ensure node and other binaries are accessible
    // Filter out undefined values from process.env
    const systemEnv = Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined)
    ) as Record<string, string>;

    // Ensure PATH is always set - critical for spawning processes
    const defaultPath =
      '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/workspace/node_modules/.bin:/home/node/.local/bin';

    const systemPath = systemEnv.PATH || defaultPath;

    // Merge env and remove all undefined values
    const mergedEnv = {
      ...systemEnv,
      ...env,
    };

    // Remove undefined values completely to avoid spawn errors
    const cleanedEnv = Object.fromEntries(
      Object.entries(mergedEnv).filter(([, v]) => v !== undefined)
    ) as Record<string, string>;

    queryOptions.env = {
      ...cleanedEnv,
      // Ensure PATH is always set after custom env - merge custom PATH with system PATH
      PATH: env?.PATH ? `${systemPath}:${env.PATH}` : systemPath,
    };

    // If agentSessionId is provided, resume the session
    if (agentSessionId) {
      console.log('[Session] Resuming session:', { sessionId, agentSessionId });
      queryOptions.resume = agentSessionId;
    }

    // Debug logging
    if (process.env.CLAUDE_DEBUG_MODE === 'true') {
      console.log('[DEBUG] Query options:', {
        sessionId,
        cwd: queryOptions.cwd,
        permissionMode: queryOptions.permissionMode,
        allowDangerouslySkipPermissions: queryOptions.allowDangerouslySkipPermissions,
        bypassPermissions: queryOptions.bypassPermissions,
        hasResume: !!queryOptions.resume,
        settingSources: queryOptions.settingSources,
      });
    }

    // Execute query
    const queryResult = query({
      prompt,
      options: queryOptions,
    });

    // Store the query object for interrupt support
    activeQueries.set(sessionId, queryResult);

    // Process messages from the stream
    for await (const message of queryResult) {
      // Raw messageを保存（永続化用）
      onRawMessage?.(message);

      // Handle system and result messages for session management
      switch (message.type) {
        case 'system':
          // Extract and store agent session ID from system init message
          if (message.subtype === 'init' && message.session_id) {
            console.log('[Session] Agent session ID stored:', {
              sessionId,
              agentSessionId: message.session_id,
            });
            onAgentSessionId?.(message.session_id);
          }
          break;

        case 'result':
          // Handle final result for status change
          if (message.subtype === 'success') {
            onStatusChange?.('success');
          } else {
            onStatusChange?.('error');
          }
          break;
      }
    }

    // Clean up
    activeQueries.delete(sessionId);
  } catch (error) {
    activeQueries.delete(sessionId);

    // Check if this was an abort/interrupt (intentional)
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('was aborted'))
    ) {
      return;
    }

    // 権限エラーの特定
    const isPermissionError =
      error instanceof Error &&
      (error.message.toLowerCase().includes('permission') ||
        error.message.includes('EACCES') ||
        error.message.includes('EPERM'));

    if (isPermissionError) {
      console.error('[ERROR] Permission denied:', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        hint: 'Check bypassPermissions settings in src/lib/claude-client.ts:38-53',
      });
      onStatusChange?.('error');
      throw new Error(
        `Permission error: ${error instanceof Error ? error.message : String(error)}. ` +
          'Check bypassPermissions settings in claude-client.ts'
      );
    }

    // Debug logging for other errors
    console.error('[Claude Client] Error occurred:');
    console.error('- Error type:', error instanceof Error ? error.name : typeof error);
    console.error('- Error message:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error) {
      console.error('- Error stack:', error.stack);
    }

    onStatusChange?.('error');
    throw error;
  }
}

/**
 * Interrupt a running session
 */
export async function interruptSession(sessionId: string): Promise<void> {
  const queryObject = activeQueries.get(sessionId);
  if (queryObject) {
    await queryObject.interrupt();
    activeQueries.delete(sessionId);
  }
}

/**
 * Check if a session is currently running
 */
export function isSessionRunning(sessionId: string): boolean {
  return activeQueries.has(sessionId);
}
