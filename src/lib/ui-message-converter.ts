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

interface SDKPromptMessage extends SDKMessageBase {
  type: 'prompt';
  message: {
    content: string;
  };
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

type SDKMessage =
  | SDKPromptMessage
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKSystemMessage
  | SDKResultMessage;

/**
 * Claude SDKのraw messagesをUI表示用のUIMessagesに変換するクラス
 */
export class UIMessageConverter {
  /**
   * assistantメッセージがtool_useのみで構成されているかチェック
   */
  private isToolUseOnlyMessage(msg: SDKAssistantMessage): boolean {
    if (!msg.message || !Array.isArray(msg.message.content)) {
      return false;
    }
    const content = msg.message.content;
    if (content.length === 0) {
      return false;
    }
    // すべてのブロックがtool_useである場合のみtrue
    return content.every((block) => block.type === 'tool_use');
  }

  /**
   * assistantメッセージからToolExecution配列を抽出
   */
  private extractToolExecutions(msg: SDKAssistantMessage): ToolExecution[] {
    const executions: ToolExecution[] = [];
    if (!msg.message || !Array.isArray(msg.message.content)) {
      return executions;
    }

    for (const block of msg.message.content) {
      if (block.type === 'tool_use') {
        const toolUseBlock = block as SDKToolUseBlock;
        executions.push({
          id: toolUseBlock.id,
          toolName: toolUseBlock.name,
          input: toolUseBlock.input,
          status: 'pending',
          startTime: new Date().toISOString(),
        });
      }
    }

    return executions;
  }

  /**
   * バッファからtool_use_groupを含むUIMessageを作成
   */
  private createToolUseGroupMessage(
    messages: SDKAssistantMessage[],
    toolExecutions: ToolExecution[]
  ): UIMessage {
    const firstMessage = messages[0];
    const blocks: AssistantMessageBlock[] = [];

    // 単一のtool_useの場合は個別に、複数の場合はグループ化
    if (toolExecutions.length === 1) {
      blocks.push({
        type: 'tool_use',
        info: toolExecutions[0],
      });
    } else {
      blocks.push({
        type: 'tool_use_group',
        executions: toolExecutions,
      });
    }

    const metadata: UIMessageMetadata = {
      sdkMessageUuids: messages.map((m) => m.uuid).filter((uuid): uuid is string => !!uuid),
      role: 'assistant',
      model: firstMessage.message?.model,
      stopReason: firstMessage.message?.stop_reason,
    };

    // usage情報は最初のメッセージから取得
    if (firstMessage.message?.usage) {
      metadata.usage = {
        inputTokens: firstMessage.message.usage.input_tokens || 0,
        outputTokens: firstMessage.message.usage.output_tokens || 0,
      };
    }

    return {
      id: uuidv4(),
      timestamp: firstMessage.created_at || new Date().toISOString(),
      type: 'assistant_message',
      content: {
        type: 'assistant_message',
        blocks,
      },
      metadata,
    };
  }

  /**
   * Raw messages配列からUIMessages配列に変換
   */
  convert(rawMessages: unknown[]): UIMessage[] {
    const uiMessages: UIMessage[] = [];
    const toolExecutionMap = new Map<string, ToolExecution>();

    // 連続するtool_useのみのassistantメッセージをバッファリング
    let assistantToolUseBuffer: {
      messages: SDKAssistantMessage[];
      toolExecutions: ToolExecution[];
    } | null = null;

    const flushAssistantToolUseBuffer = () => {
      if (assistantToolUseBuffer && assistantToolUseBuffer.toolExecutions.length > 0) {
        // バッファのtool_useをグループ化して1つのUIMessageに変換
        const groupMessage = this.createToolUseGroupMessage(
          assistantToolUseBuffer.messages,
          assistantToolUseBuffer.toolExecutions
        );
        uiMessages.push(groupMessage);

        // toolExecutionMapにも登録（後でtool_resultと紐付けるため）
        for (const exec of assistantToolUseBuffer.toolExecutions) {
          toolExecutionMap.set(exec.id, exec);
        }

        assistantToolUseBuffer = null;
      }
    };

    for (const rawMsg of rawMessages) {
      const msg = rawMsg as SDKMessage;

      if (!msg || !msg.type) continue;

      switch (msg.type) {
        case 'prompt': {
          flushAssistantToolUseBuffer();
          const promptMsg = msg as SDKPromptMessage;
          uiMessages.push(this.convertPromptMessage(promptMsg));
          break;
        }

        case 'user': {
          const userMsg = msg as SDKUserMessage;

          if (this.isToolResultMessage(userMsg)) {
            // tool_resultの場合はバッファをフラッシュせずに処理
            // （連続するtool_useの流れを継続）
            this.processToolResult(userMsg, toolExecutionMap, uiMessages);
          } else {
            // 通常のuserメッセージ（text）の場合のみフラッシュ
            flushAssistantToolUseBuffer();
            uiMessages.push(this.convertUserMessage(userMsg));
          }
          break;
        }

        case 'assistant': {
          const assistantMsg = msg as SDKAssistantMessage;

          // tool_useのみのメッセージの場合はバッファに追加
          if (this.isToolUseOnlyMessage(assistantMsg)) {
            if (!assistantToolUseBuffer) {
              assistantToolUseBuffer = { messages: [], toolExecutions: [] };
            }
            assistantToolUseBuffer.messages.push(assistantMsg);
            const executions = this.extractToolExecutions(assistantMsg);
            assistantToolUseBuffer.toolExecutions.push(...executions);
          } else {
            // thinking/textを含むメッセージの場合はバッファをフラッシュしてから処理
            flushAssistantToolUseBuffer();
            const convertedMsg = this.convertAssistantMessage(assistantMsg, toolExecutionMap);
            if (convertedMsg) {
              uiMessages.push(convertedMsg);
            }
          }
          break;
        }

        case 'system':
          flushAssistantToolUseBuffer();
          if ((msg as SDKSystemMessage).subtype === 'init') {
            uiMessages.push(this.convertSystemInit(msg as SDKSystemMessage));
          }
          break;

        case 'result':
          flushAssistantToolUseBuffer();
          const resultMsg = this.convertResultMessage(msg as SDKResultMessage);
          if (resultMsg) {
            uiMessages.push(resultMsg);
          }
          break;
      }
    }

    // 最後にバッファが残っていたらフラッシュ
    flushAssistantToolUseBuffer();

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
            // Check if this message contains the target tool_use (in tool_use or tool_use_group)
            const hasTargetToolUse = uiMsg.content.blocks.some((block) => {
              if (block.type === 'tool_use' && block.info.id === toolUseId) {
                return true;
              }
              if (block.type === 'tool_use_group') {
                return block.executions.some((exec) => exec.id === toolUseId);
              }
              return false;
            });

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
                if (block.type === 'tool_use_group') {
                  return {
                    ...block,
                    executions: block.executions.map((exec) => {
                      if (exec.id === toolUseId) {
                        return {
                          ...exec,
                          result: resultContent,
                          status: isError ? ('error' as const) : ('success' as const),
                          error: isError ? resultContent : undefined,
                          endTime: new Date().toISOString(),
                        };
                      }
                      return exec;
                    }),
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

  private convertPromptMessage(msg: SDKPromptMessage): UIMessage {
    // PromptメッセージはuserPromptsから生成され、contentは常に文字列
    const text = msg.message.content;

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

    // content配列を順番に処理し、連続するtool_useをグループ化
    let toolUseBuffer: ToolExecution[] = [];

    const flushToolUseBuffer = () => {
      if (toolUseBuffer.length > 0) {
        if (toolUseBuffer.length === 1) {
          // 単一のtool_useはそのまま追加
          blocks.push({
            type: 'tool_use',
            info: toolUseBuffer[0],
          });
        } else {
          // 複数のtool_useはtool_use_groupとして追加
          blocks.push({
            type: 'tool_use_group',
            executions: toolUseBuffer,
          });
        }
        toolUseBuffer = [];
      }
    };

    for (const block of content) {
      if (block.type === 'thinking') {
        flushToolUseBuffer(); // tool_useバッファをフラッシュ
        const thinkingBlock = block as SDKThinkingBlock;
        blocks.push({
          type: 'thinking',
          content: thinkingBlock.thinking || '',
          isRedacted: false,
        });
      } else if (block.type === 'redacted_thinking') {
        flushToolUseBuffer(); // tool_useバッファをフラッシュ
        blocks.push({
          type: 'thinking',
          content: '[Redacted for safety]',
          isRedacted: true,
        });
      } else if (block.type === 'text') {
        flushToolUseBuffer(); // tool_useバッファをフラッシュ
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

        // バッファに追加（連続するtool_useを集める）
        toolUseBuffer.push(toolExecution);
      }
    }

    // 残りのtool_useをフラッシュ
    flushToolUseBuffer();

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
