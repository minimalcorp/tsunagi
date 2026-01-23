import { query, type Query } from '@anthropic-ai/claude-agent-sdk';
import type { LogEntry } from './types';

export interface ExecuteOptions {
  sessionId: string;
  prompt: string;
  workingDirectory: string;
  env?: Record<string, string>;
  agentSessionId?: string;
  onLog?: (log: LogEntry) => void;
  onStatusChange?: (status: 'running' | 'success' | 'error') => void;
  onAgentSessionId?: (agentSessionId: string) => void;
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
    onLog,
    onStatusChange,
    onAgentSessionId,
  } = options;

  try {
    onStatusChange?.('running');

    // Build query options
    const queryOptions: {
      cwd: string;
      env?: Record<string, string>;
      resume?: string;
    } = {
      cwd: workingDirectory,
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

    queryOptions.env = {
      ...systemEnv,
      ...env,
      // Ensure PATH is always set after custom env - merge custom PATH with system PATH
      PATH: env?.PATH ? `${systemPath}:${env.PATH}` : systemPath,
    };

    // If agentSessionId is provided, resume the session
    if (agentSessionId) {
      queryOptions.resume = agentSessionId;
    }

    // Execute query
    const queryResult = query({
      prompt,
      options: {
        ...queryOptions,
        // Explicitly specify node executable to avoid spawn errors
        executable: 'node',
      },
    });

    // Store the query object for interrupt support
    activeQueries.set(sessionId, queryResult);

    // Process messages from the stream
    for await (const message of queryResult) {
      // Handle different message types
      switch (message.type) {
        case 'system':
          // Extract and store agent session ID from system init message
          if (message.subtype === 'init' && message.session_id) {
            onAgentSessionId?.(message.session_id);
          }
          break;

        case 'assistant':
          // Log assistant message content
          if (message.message.content) {
            for (const block of message.message.content) {
              if (block.type === 'text') {
                onLog?.({
                  timestamp: new Date().toISOString(),
                  type: 'message',
                  content: block.text,
                  metadata: { role: 'assistant' },
                });
              } else if (block.type === 'tool_use') {
                // Log tool use
                onLog?.({
                  timestamp: new Date().toISOString(),
                  type: 'tool_use',
                  content: `Tool: ${block.name}`,
                  metadata: {
                    tool: block.name,
                    input: block.input,
                    tool_use_id: block.id,
                  },
                });
              }
            }
          }

          // Log any errors
          if (message.error) {
            onLog?.({
              timestamp: new Date().toISOString(),
              type: 'error',
              content: `Assistant error: ${message.error}`,
              metadata: { error: message.error },
            });
          }
          break;

        case 'user':
          // Log user messages (replayed from history)
          if (message.message.role === 'user' && typeof message.message.content === 'string') {
            onLog?.({
              timestamp: new Date().toISOString(),
              type: 'message',
              content: message.message.content,
              metadata: { role: 'user', isReplay: 'isReplay' in message },
            });
          }
          break;

        case 'result':
          // Handle final result
          if (message.subtype === 'success') {
            // Log success result
            onLog?.({
              timestamp: new Date().toISOString(),
              type: 'message',
              content: `Completed successfully: ${message.result}`,
              metadata: {
                subtype: message.subtype,
                duration_ms: message.duration_ms,
                num_turns: message.num_turns,
              },
            });
            onStatusChange?.('success');
          } else {
            // Log errors from error result
            for (const error of message.errors) {
              onLog?.({
                timestamp: new Date().toISOString(),
                type: 'error',
                content: error,
                metadata: { subtype: message.subtype },
              });
            }
            onStatusChange?.('error');
          }
          break;

        case 'tool_progress':
          // Log tool progress
          onLog?.({
            timestamp: new Date().toISOString(),
            type: 'tool_use',
            content: `Tool ${message.tool_name} in progress (${message.elapsed_time_seconds}s)`,
            metadata: {
              tool_use_id: message.tool_use_id,
              tool_name: message.tool_name,
              elapsed_time: message.elapsed_time_seconds,
            },
          });
          break;
      }
    }

    // Clean up
    activeQueries.delete(sessionId);
  } catch (error) {
    activeQueries.delete(sessionId);

    // Check if this was an abort
    if (error instanceof Error && error.name === 'AbortError') {
      // Session was interrupted, don't treat as error
      return;
    }

    // Log detailed error information
    const errorMessage =
      error instanceof Error
        ? `${error.message}\n\nStack: ${error.stack}\n\nError details: ${JSON.stringify(error, null, 2)}`
        : 'Unknown error occurred';

    onLog?.({
      timestamp: new Date().toISOString(),
      type: 'error',
      content: errorMessage,
      metadata: { error },
    });

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
