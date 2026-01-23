import Anthropic from '@anthropic-ai/sdk';
import type { LogEntry } from './types';

export interface ClaudeClientOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export interface ExecuteOptions {
  sessionId: string;
  prompt: string;
  workingDirectory: string;
  env?: Record<string, string>;
  onLog?: (log: LogEntry) => void;
  onStatusChange?: (status: 'running' | 'completed' | 'failed') => void;
}

export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private abortControllers: Map<string, AbortController>;

  constructor(options: ClaudeClientOptions = {}) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model || 'claude-sonnet-4-5-20250929';
    this.maxTokens = options.maxTokens || 8192;
    this.abortControllers = new Map();
  }

  /**
   * Execute a Claude session with streaming
   */
  async executeSession(options: ExecuteOptions): Promise<void> {
    const { sessionId, prompt, workingDirectory, env, onLog, onStatusChange } = options;

    // Create abort controller for this session
    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    try {
      onStatusChange?.('running');

      // Log user message
      onLog?.({
        timestamp: new Date().toISOString(),
        type: 'message',
        content: prompt,
        metadata: { role: 'user' },
      });

      // Create system prompt with context
      const systemPrompt = this.buildSystemPrompt(workingDirectory, env);

      // Stream the response
      const stream = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          stream: true,
        },
        {
          signal: abortController.signal,
        }
      );

      let currentContent = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          currentContent = '';
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            currentContent += event.delta.text;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentContent) {
            onLog?.({
              timestamp: new Date().toISOString(),
              type: 'message',
              content: currentContent,
              metadata: { role: 'assistant' },
            });
            currentContent = '';
          }
        } else if (event.type === 'message_stop') {
          onStatusChange?.('completed');
        }
      }

      this.abortControllers.delete(sessionId);
    } catch (error) {
      this.abortControllers.delete(sessionId);

      if (error instanceof Error && error.name === 'AbortError') {
        // Session was interrupted
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
  async interruptSession(sessionId: string): Promise<void> {
    const abortController = this.abortControllers.get(sessionId);
    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(sessionId);
    }
  }

  /**
   * Resume a paused session (send additional message)
   */
  async resumeSession(options: ExecuteOptions): Promise<void> {
    // For now, resume is the same as execute with a new message
    // In a full implementation, this would include conversation history
    return this.executeSession(options);
  }

  /**
   * Build system prompt with working directory and environment context
   */
  private buildSystemPrompt(workingDirectory: string, env?: Record<string, string>): string {
    let prompt = `You are Claude, an AI assistant integrated into the Tsunagi task management system.

Working Directory: ${workingDirectory}

You have access to the file system within this directory. When making changes:
1. Read files before editing them
2. Make focused, incremental changes
3. Test your changes when possible
4. Document your work`;

    if (env && Object.keys(env).length > 0) {
      prompt += '\n\nAvailable Environment Variables:\n';
      for (const [key, value] of Object.entries(env)) {
        // Mask sensitive values
        const maskedValue =
          key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET') ? '***' : value;
        prompt += `- ${key}=${maskedValue}\n`;
      }
    }

    return prompt;
  }

  /**
   * Check if a session is currently running
   */
  isSessionRunning(sessionId: string): boolean {
    return this.abortControllers.has(sessionId);
  }
}

// Singleton instance
let claudeClientInstance: ClaudeClient | null = null;

export function getClaudeClient(options?: ClaudeClientOptions): ClaudeClient {
  if (!claudeClientInstance) {
    claudeClientInstance = new ClaudeClient(options);
  }
  return claudeClientInstance;
}
