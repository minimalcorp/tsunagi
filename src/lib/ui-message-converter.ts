import type { UIMessage, AssistantMessageBlock, ToolExecution, UIMessageMetadata } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * SDK Message type definitions
 */
interface SDKMessageBase {
  type: string;
  uuid?: string;
  created_at?: string;
}

interface SDKContentBlock {
  type: string;
  [key: string]: unknown;
}

interface SDKTextBlock extends SDKContentBlock {
  type: 'text';
  text: string;
}

interface SDKThinkingBlock extends SDKContentBlock {
  type: 'thinking';
  thinking: string;
}

interface SDKToolUseBlock extends SDKContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface SDKUserMessage extends SDKMessageBase {
  type: 'user';
  message: {
    content: string | SDKContentBlock[];
  };
}

interface SDKAssistantMessage extends SDKMessageBase {
  type: 'assistant';
  message: {
    content: SDKContentBlock[];
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

interface SDKSystemMessage extends SDKMessageBase {
  type: 'system';
  subtype?: string;
  model?: string;
}

interface SDKResultMessage extends SDKMessageBase {
  type: 'result';
  subtype?: string;
  result?: string;
  is_error?: boolean;
  errors?: string[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

type SDKMessage = SDKUserMessage | SDKAssistantMessage | SDKSystemMessage | SDKResultMessage;

/**
 * Claude SDKのraw messagesをUI表示用のUIMessagesに変換するクラス
 */
export class UIMessageConverter {
  /**
   * Raw messages配列からUIMessages配列に変換
   */
  convert(rawMessages: unknown[]): UIMessage[] {
    const uiMessages: UIMessage[] = [];
    const toolExecutionMap = new Map<string, ToolExecution>();

    for (const rawMsg of rawMessages) {
      const msg = rawMsg as SDKMessage;

      if (!msg || !msg.type) continue;

      switch (msg.type) {
        case 'user': {
          const userMsg = msg as SDKUserMessage;
          // Skip tool_result messages (they will be processed separately)
          if (this.isToolResultMessage(userMsg)) {
            this.processToolResult(userMsg, toolExecutionMap, uiMessages);
          } else {
            uiMessages.push(this.convertUserMessage(userMsg));
          }
          break;
        }

        case 'assistant':
          const assistantMsg = this.convertAssistantMessage(
            msg as SDKAssistantMessage,
            toolExecutionMap
          );
          if (assistantMsg) {
            uiMessages.push(assistantMsg);
          }
          break;

        case 'system':
          if ((msg as SDKSystemMessage).subtype === 'init') {
            uiMessages.push(this.convertSystemInit(msg as SDKSystemMessage));
          }
          break;

        case 'result':
          const resultMsg = this.convertResultMessage(msg as SDKResultMessage);
          if (resultMsg) {
            uiMessages.push(resultMsg);
          }
          break;
      }
    }

    return uiMessages;
  }

  private isToolResultMessage(msg: SDKUserMessage): boolean {
    if (!msg.message || !Array.isArray(msg.message.content)) {
      return false;
    }
    return msg.message.content.some((block) => block.type === 'tool_result');
  }

  private processToolResult(
    msg: SDKUserMessage,
    toolExecutionMap: Map<string, ToolExecution>,
    uiMessages: UIMessage[]
  ): void {
    if (!msg.message || !Array.isArray(msg.message.content)) {
      return;
    }

    for (const block of msg.message.content) {
      if (block.type === 'tool_result') {
        const toolResultBlock = block as {
          type: 'tool_result';
          tool_use_id: string;
          content: string | Array<{ type: string; [key: string]: unknown }>;
          is_error?: boolean;
        };

        const toolUseId = toolResultBlock.tool_use_id;
        const isError = toolResultBlock.is_error || false;

        // Extract result content
        let resultContent = '';
        if (typeof toolResultBlock.content === 'string') {
          resultContent = toolResultBlock.content;
        } else if (Array.isArray(toolResultBlock.content)) {
          resultContent = toolResultBlock.content
            .map((c) => (c.type === 'text' ? (c as { text?: string }).text || '' : ''))
            .join('\n');
        }

        // Find and update the corresponding tool_use in uiMessages
        for (let i = uiMessages.length - 1; i >= 0; i--) {
          const uiMsg = uiMessages[i];
          if (uiMsg.type === 'assistant_message' && uiMsg.content.type === 'assistant_message') {
            // Check if this message contains the target tool_use
            const hasTargetToolUse = uiMsg.content.blocks.some(
              (block) => block.type === 'tool_use' && block.info.id === toolUseId
            );

            if (hasTargetToolUse) {
              const updatedBlocks = uiMsg.content.blocks.map((block) => {
                if (block.type === 'tool_use' && block.info.id === toolUseId) {
                  return {
                    ...block,
                    info: {
                      ...block.info,
                      result: resultContent,
                      status: isError ? ('error' as const) : ('success' as const),
                      error: isError ? resultContent : undefined,
                      endTime: new Date().toISOString(),
                    },
                  };
                }
                return block;
              });

              uiMessages[i] = {
                ...uiMsg,
                content: {
                  ...uiMsg.content,
                  blocks: updatedBlocks,
                },
              };
              break;
            }
          }
        }
      }
    }
  }

  private convertUserMessage(msg: SDKUserMessage): UIMessage {
    // messageフィールドからコンテンツを抽出
    let text = '';

    if (msg.message) {
      if (typeof msg.message.content === 'string') {
        text = msg.message.content;
      } else if (Array.isArray(msg.message.content)) {
        // content配列からtextを結合
        text = msg.message.content
          .filter((block): block is SDKTextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
      }
    }

    return {
      id: uuidv4(),
      timestamp: msg.created_at || new Date().toISOString(),
      type: 'user_message',
      content: {
        type: 'user_message',
        text,
      },
      metadata: {
        sdkMessageUuids: msg.uuid ? [msg.uuid] : [],
        role: 'user',
      },
    };
  }

  private convertAssistantMessage(
    msg: SDKAssistantMessage,
    toolExecutionMap: Map<string, ToolExecution>
  ): UIMessage | null {
    const blocks: AssistantMessageBlock[] = [];

    if (!msg.message || !msg.message.content) {
      return null;
    }

    const content = msg.message.content;

    if (!Array.isArray(content)) {
      return null;
    }

    // content配列を順番に処理
    for (const block of content) {
      if (block.type === 'thinking') {
        const thinkingBlock = block as SDKThinkingBlock;
        blocks.push({
          type: 'thinking',
          content: thinkingBlock.thinking || '',
          isRedacted: false,
        });
      } else if (block.type === 'redacted_thinking') {
        blocks.push({
          type: 'thinking',
          content: '[Redacted for safety]',
          isRedacted: true,
        });
      } else if (block.type === 'text') {
        const textBlock = block as SDKTextBlock;
        blocks.push({
          type: 'text',
          content: textBlock.text || '',
        });
      } else if (block.type === 'tool_use') {
        const toolUseBlock = block as SDKToolUseBlock;
        const toolExecution: ToolExecution = {
          id: toolUseBlock.id,
          toolName: toolUseBlock.name,
          input: toolUseBlock.input,
          status: 'pending',
          startTime: new Date().toISOString(),
        };

        // tool_use_idでマップに保存（後でtool_resultと紐付け）
        toolExecutionMap.set(toolUseBlock.id, toolExecution);

        blocks.push({
          type: 'tool_use',
          info: toolExecution,
        });
      }
    }

    if (blocks.length === 0) {
      return null;
    }

    const metadata: UIMessageMetadata = {
      sdkMessageUuids: msg.uuid ? [msg.uuid] : [],
      role: 'assistant',
      model: msg.message.model,
      stopReason: msg.message.stop_reason,
    };

    if (msg.message.usage) {
      metadata.usage = {
        inputTokens: msg.message.usage.input_tokens || 0,
        outputTokens: msg.message.usage.output_tokens || 0,
      };
    }

    return {
      id: uuidv4(),
      timestamp: msg.created_at || new Date().toISOString(),
      type: 'assistant_message',
      content: {
        type: 'assistant_message',
        blocks,
      },
      metadata,
    };
  }

  private convertSystemInit(msg: SDKSystemMessage): UIMessage {
    return {
      id: uuidv4(),
      timestamp: msg.created_at || new Date().toISOString(),
      type: 'system_event',
      content: {
        type: 'system_event',
        event: 'session_init',
        description: `Session initialized with model: ${msg.model || 'unknown'}`,
      },
      metadata: {
        sdkMessageUuids: msg.uuid ? [msg.uuid] : [],
        model: msg.model,
      },
    };
  }

  private convertResultMessage(msg: SDKResultMessage): UIMessage | null {
    const isError = msg.is_error || msg.subtype === 'error';
    const isSuccess = msg.subtype === 'success';

    if (!isSuccess && !isError) {
      return null;
    }

    if (isError) {
      // エラーの場合
      const errorMessage = msg.errors?.join('\n') || msg.result || 'Session failed';
      return {
        id: uuidv4(),
        timestamp: msg.created_at || new Date().toISOString(),
        type: 'error',
        content: {
          type: 'error',
          message: errorMessage,
        },
        metadata: {
          sdkMessageUuids: msg.uuid ? [msg.uuid] : [],
        },
      };
    } else {
      // 成功の場合
      return {
        id: uuidv4(),
        timestamp: msg.created_at || new Date().toISOString(),
        type: 'system_event',
        content: {
          type: 'system_event',
          event: 'session_completed',
          description: msg.result || 'Session completed successfully',
        },
        metadata: {
          sdkMessageUuids: msg.uuid ? [msg.uuid] : [],
        },
      };
    }
  }
}

/**
 * Tool resultを使ってToolExecutionのstatusを更新する
 */
export function updateToolExecutionStatus(
  uiMessages: UIMessage[],
  toolUseId: string,
  result: string,
  isError: boolean
): UIMessage[] {
  return uiMessages.map((msg) => {
    if (msg.type === 'assistant_message' && msg.content.type === 'assistant_message') {
      const blocks = msg.content.blocks.map((block) => {
        if (block.type === 'tool_use' && block.info.id === toolUseId) {
          return {
            ...block,
            info: {
              ...block.info,
              result,
              status: isError ? ('error' as const) : ('success' as const),
              error: isError ? result : undefined,
              endTime: new Date().toISOString(),
            },
          };
        }
        return block;
      });

      return {
        ...msg,
        content: {
          ...msg.content,
          blocks,
        },
        metadata: {
          ...msg.metadata,
          updatedAt: new Date().toISOString(),
        },
      };
    }
    return msg;
  });
}
