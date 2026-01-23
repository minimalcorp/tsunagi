import { query, type Query } from '@anthropic-ai/claude-agent-sdk';
import type { LogEntry } from './types';

export interface ExecuteOptions {
  sessionId: string;
  prompt: string;
  workingDirectory: string;
  env?: Record<string, string>;
  agentSessionId?: string;
  onLog?: (log: LogEntry) => void;
  onStatusChange?: (status: 'running' | 'completed' | 'failed') => void;
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

    // Log user message
    onLog?.({
      timestamp: new Date().toISOString(),
      type: 'message',
      content: prompt,
      metadata: { role: 'user' },
    });

    // Build query options
    const queryOptions: {
      cwd: string;
      env?: Record<string, string>;
      resume?: string;
    } = {
      cwd: workingDirectory,
    };

    if (env) {
      queryOptions.env = env;
    }

    // If agentSessionId is provided, resume the session
    if (agentSessionId) {
      queryOptions.resume = agentSessionId;
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

    // Session completed successfully
    activeQueries.delete(sessionId);
    onStatusChange?.('completed');
  } catch (error) {
    activeQueries.delete(sessionId);

    // Check if this was an abort
    if (error instanceof Error && error.name === 'AbortError') {
      // Session was interrupted, don't treat as error
      return;
    }

    onLog?.({
      timestamp: new Date().toISOString(),
      type: 'error',
      content: error instanceof Error ? error.message : 'Unknown error occurred',
      metadata: { error },
    });

    onStatusChange?.('failed');
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
