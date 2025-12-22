import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ClaudeResponse, ClaudeStreamEvent, StreamEvent } from './types';
import { getNodeSettings } from './node-manager';

const SOLO_DIR = path.join(process.cwd(), '.solo');
const CLAUDE_PATH = process.env.CLAUDE_PATH || '/Users/jigengineer/.local/bin/claude';
const TIMEOUT_MS = 120000; // 2分

export interface ExecuteOptions {
  nodeId: string;
  prompt: string;
  sessionId?: string;
}

// アクティブなプロセスを追跡
const activeProcesses: Map<string, ChildProcess> = new Map();

/**
 * ノードのrole.mdを読み込む
 */
async function getRolePrompt(nodeId: string): Promise<string> {
  const rolePath = path.join(SOLO_DIR, nodeId, 'role.md');
  try {
    return await fs.readFile(rolePath, 'utf-8');
  } catch {
    return '';
  }
}

interface PromptOptions {
  currentNodeId: string;
  baseRole: string;
  connectedNodes: Array<{ nodeId: string; role: string }>;
  apiEndpoint: string;
}

/**
 * システムプロンプトを構築
 */
function constructSystemPrompt(options: PromptOptions): string {
  const { currentNodeId, baseRole, connectedNodes, apiEndpoint } = options;

  let prompt = `# ノード実行環境\n`;
  prompt += `あなたは現在「${currentNodeId}」ノードで実行されています。\n\n`;

  prompt += `# あなたの役割\n`;
  prompt += `${baseRole}\n\n`;

  // 接続先ノード情報
  prompt += `# 連携可能なノード\n`;
  prompt += `あなたは以下のノードに作業を委任できます。適切なタスクは積極的に委任してください。\n\n`;

  connectedNodes.forEach(({ nodeId, role }) => {
    prompt += `## ノード: ${nodeId}\n`;
    prompt += `${role}\n\n`;
  });

  // API呼び出し方法
  prompt += `# タスク委任方法\n`;
  prompt += `連携ノードにタスクを委任するには、Bashツールでcurlコマンドを使用してください。\n\n`;
  prompt += `## API呼び出し例\n`;
  prompt += `\`\`\`bash\n`;
  prompt += `curl -X POST ${apiEndpoint}/api/nodes/{nodeId}/message \\\n`;
  prompt += `  -H "Content-Type: application/json" \\\n`;
  prompt += `  -d '{"content": "実行してほしいタスクの内容"}'\n`;
  prompt += `\`\`\`\n\n`;

  prompt += `## レスポンス形式\n`;
  prompt += `\`\`\`json\n`;
  prompt += `{\n`;
  prompt += `  "response": "ノードからの応答テキスト",\n`;
  prompt += `  "session_id": "セッションID",\n`;
  prompt += `  "cost": 0.0123\n`;
  prompt += `}\n`;
  prompt += `\`\`\`\n\n`;

  // 委任ガイドライン
  prompt += `# 委任ガイドライン\n`;
  prompt += `1. タスクが連携ノードの専門分野に該当する場合は、必ず委任してください\n`;
  prompt += `2. 委任時は、明確で具体的な指示を送信してください\n`;
  prompt += `3. レスポンスを受け取ったら、必要に応じて結果を統合・要約してください\n`;
  prompt += `4. 委任先ノードが応答できない場合は、エラーを処理して代替案を提示してください\n`;
  prompt += `5. JSONレスポンスはjqコマンドやPythonでパースしてください\n\n`;

  return prompt;
}

/**
 * ノードIDと接続先情報を含む拡張システムプロンプトを生成
 */
async function generateEnhancedSystemPrompt(nodeId: string): Promise<string> {
  // 1. 基本role.mdを読み込み
  const baseRole = await getRolePrompt(nodeId);

  // 2. settings.jsonからarcsを取得
  const settings = await getNodeSettings(nodeId);

  // 3. arcsが空なら基本roleのみ返す（後方互換性）
  if (!settings.arcs || settings.arcs.length === 0) {
    return baseRole;
  }

  // 4. 各接続先ノードのrole.mdを並列読み込み
  const connectedNodeRoles = await Promise.all(
    settings.arcs.map(async (arcNodeId) => ({
      nodeId: arcNodeId,
      role: (await getRolePrompt(arcNodeId)) || `ノードID: ${arcNodeId} (役割未定義)`,
    }))
  );

  // 5. 拡張プロンプトを構築
  return constructSystemPrompt({
    currentNodeId: nodeId,
    baseRole,
    connectedNodes: connectedNodeRoles,
    apiEndpoint: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  });
}

/**
 * ノードのmcp.jsonのパスを取得
 */
function getMcpConfigPath(nodeId: string): string {
  return path.join(SOLO_DIR, nodeId, 'mcp.json');
}

/**
 * Claude CLIを実行
 */
export async function executeClaudePrompt(options: ExecuteOptions): Promise<ClaudeResponse> {
  const { nodeId, prompt, sessionId } = options;

  const rolePrompt = await generateEnhancedSystemPrompt(nodeId);
  const mcpConfigPath = getMcpConfigPath(nodeId);

  const args: string[] = ['-p', '--output-format', 'json'];

  // セッション継続の場合
  if (sessionId) {
    args.push('--resume', sessionId);
  }

  // システムプロンプト追加
  if (rolePrompt) {
    args.push('--append-system-prompt', rolePrompt);
  }

  // MCP設定（実際にMCPサーバーが設定されている場合のみ）
  try {
    const mcpContent = await fs.readFile(mcpConfigPath, 'utf-8');
    const mcpConfig = JSON.parse(mcpContent);
    if (mcpConfig.mcpServers && Object.keys(mcpConfig.mcpServers).length > 0) {
      args.push('--mcp-config', mcpConfigPath);
    }
  } catch {
    // mcp.jsonが存在しない、または読み込みエラーの場合はスキップ
  }

  // プロンプトを引数として追加
  args.push(prompt);

  // デバッグログ
  console.log('[Claude CLI] Executing:', CLAUDE_PATH);
  console.log('[Claude CLI] Args:', JSON.stringify(args));
  console.log('[Claude CLI] Node:', nodeId, 'Session:', sessionId || 'new');

  return new Promise((resolve, reject) => {
    const claude = spawn(CLAUDE_PATH, args, {
      env: { ...process.env, PATH: process.env.PATH || '' },
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log('[Claude CLI] Process spawned, PID:', claude.pid);
    console.log('[Claude CLI] stdout exists:', !!claude.stdout);
    console.log('[Claude CLI] stderr exists:', !!claude.stderr);
    console.log('[Claude CLI] stdin exists:', !!claude.stdin);
    activeProcesses.set(nodeId, claude);

    // stdinを閉じる（入力待ちを防ぐ）
    if (claude.stdin) {
      claude.stdin.end();
      console.log('[Claude CLI] stdin closed');
    }

    // タイムアウト処理
    const timeout = setTimeout(() => {
      console.error('[Claude CLI] Timeout after', TIMEOUT_MS / 1000, 'seconds');
      claude.kill('SIGTERM');
      activeProcesses.delete(nodeId);
      reject(new Error(`Claude CLI timeout after ${TIMEOUT_MS / 1000} seconds`));
    }, TIMEOUT_MS);

    let stdout = '';
    let stderr = '';

    if (claude.stdout) {
      claude.stdout.on('data', (data) => {
        const chunk = data.toString();
        console.log('[Claude CLI] stdout chunk received, length:', chunk.length);
        stdout += chunk;
      });
    }

    if (claude.stderr) {
      claude.stderr.on('data', (data) => {
        const chunk = data.toString();
        console.log('[Claude CLI] stderr chunk:', chunk.substring(0, 200));
        stderr += chunk;
      });
    }

    claude.on('close', (code) => {
      clearTimeout(timeout);
      activeProcesses.delete(nodeId);

      console.log('[Claude CLI] Process closed with code:', code);
      console.log('[Claude CLI] Final stdout length:', stdout.length);
      console.log('[Claude CLI] Final stderr length:', stderr.length);

      if (code !== 0) {
        console.error('[Claude CLI] Error:', stderr);
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        console.log('[Claude CLI] Raw stdout length:', stdout.length);
        console.log('[Claude CLI] Raw stdout preview:', stdout.substring(0, 500));
        const response = JSON.parse(stdout) as ClaudeResponse;
        console.log('[Claude CLI] Success, session_id:', response.session_id);
        console.log('[Claude CLI] Result preview:', response.result?.substring(0, 200));
        console.log('[Claude CLI] Cost:', response.total_cost_usd);
        resolve(response);
      } catch {
        console.error('[Claude CLI] Failed to parse response:', stdout.substring(0, 500));
        reject(new Error(`Failed to parse Claude response: ${stdout}`));
      }
    });

    claude.on('error', (err) => {
      clearTimeout(timeout);
      activeProcesses.delete(nodeId);
      console.error('[Claude CLI] Spawn error:', err.message);
      reject(err);
    });
  });
}

/**
 * Claude CLIをストリーミングモードで実行
 * AsyncIterableを返す
 */
export function executeClaudeStream(options: ExecuteOptions): AsyncIterable<StreamEvent> {
  const { nodeId, prompt, sessionId } = options;

  return {
    [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
      const eventQueue: StreamEvent[] = [];
      let resolveNext: ((value: IteratorResult<StreamEvent>) => void) | null = null;
      let isComplete = false;
      let isStarted = false;
      let buffer = '';
      let claude: ChildProcess | null = null;

      const enqueueEvent = (event: StreamEvent) => {
        if (resolveNext) {
          resolveNext({ value: event, done: false });
          resolveNext = null;
        } else {
          eventQueue.push(event);
        }
      };

      const processLine = (line: string) => {
        if (!line.trim()) return;

        try {
          const event = JSON.parse(line) as ClaudeStreamEvent;
          const streamEvent = convertToStreamEvent(nodeId, event);
          if (streamEvent) {
            enqueueEvent(streamEvent);
          }
        } catch {
          console.error('[Claude Stream] Failed to parse line:', line.substring(0, 100));
        }
      };

      const startProcess = async () => {
        const rolePrompt = await generateEnhancedSystemPrompt(nodeId);
        const mcpConfigPath = getMcpConfigPath(nodeId);

        const args: string[] = ['-p', '--verbose', '--output-format', 'stream-json'];

        if (sessionId) {
          args.push('--resume', sessionId);
        }

        if (rolePrompt) {
          args.push('--append-system-prompt', rolePrompt);
        }

        try {
          const mcpContent = await fs.readFile(mcpConfigPath, 'utf-8');
          const mcpConfig = JSON.parse(mcpContent);
          if (mcpConfig.mcpServers && Object.keys(mcpConfig.mcpServers).length > 0) {
            args.push('--mcp-config', mcpConfigPath);
          }
        } catch {
          // mcp.jsonが存在しない場合はスキップ
        }

        args.push(prompt);

        console.log('[Claude Stream] Starting:', nodeId);

        claude = spawn(CLAUDE_PATH, args, {
          env: { ...process.env, PATH: process.env.PATH || '' },
          cwd: process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        activeProcesses.set(nodeId, claude);

        if (claude.stdin) {
          claude.stdin.end();
        }

        // 開始イベント
        enqueueEvent({
          type: 'status',
          nodeId,
          data: { content: 'Processing started' },
          timestamp: new Date().toISOString(),
        });

        if (claude.stdout) {
          claude.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              processLine(line);
            }
          });
        }

        if (claude.stderr) {
          claude.stderr.on('data', (data) => {
            console.error('[Claude Stream] stderr:', data.toString().substring(0, 200));
          });
        }

        claude.on('close', (code) => {
          activeProcesses.delete(nodeId);
          if (buffer.trim()) {
            processLine(buffer);
          }
          isComplete = true;
          if (resolveNext) {
            resolveNext({ value: undefined as unknown as StreamEvent, done: true });
            resolveNext = null;
          }
          console.log('[Claude Stream] Process closed with code:', code);
        });

        claude.on('error', (err) => {
          activeProcesses.delete(nodeId);
          isComplete = true;
          enqueueEvent({
            type: 'error',
            nodeId,
            data: { content: err.message },
            timestamp: new Date().toISOString(),
          });
        });
      };

      return {
        async next(): Promise<IteratorResult<StreamEvent>> {
          if (!isStarted) {
            isStarted = true;
            await startProcess();
          }

          if (eventQueue.length > 0) {
            return { value: eventQueue.shift()!, done: false };
          }

          if (isComplete) {
            return { value: undefined as unknown as StreamEvent, done: true };
          }

          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        },
      };
    },
  };
}

/**
 * contentから文字列を抽出
 * Claude CLIはcontentを {type: string, text: string} 形式で返すことがある
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content && typeof content === 'object' && 'text' in content) {
    return (content as { text: string }).text;
  }
  return JSON.stringify(content);
}

/**
 * Claude CLIのイベントをStreamEventに変換
 */
function convertToStreamEvent(nodeId: string, event: ClaudeStreamEvent): StreamEvent | null {
  const timestamp = new Date().toISOString();

  // resultイベント（完了）
  if (event.type === 'result') {
    return {
      type: 'complete',
      nodeId,
      data: {
        content: event.result,
        cost: event.total_cost_usd,
        sessionId: event.session_id,
      },
      timestamp,
    };
  }

  // messageイベント（アシスタントからのメッセージ）
  if (event.type === 'assistant' && event.message) {
    return {
      type: 'message',
      nodeId,
      data: { content: extractTextContent(event.message.content) },
      timestamp,
    };
  }

  // tool_useイベント
  if (event.type === 'tool_use' && event.tool_use) {
    // inputを読みやすい形式でフォーマット
    const formatInput = (input: Record<string, unknown>): string => {
      const entries = Object.entries(input);
      if (entries.length === 0) return '(引数なし)';
      if (entries.length === 1) {
        const [key, value] = entries[0];
        return `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
      }
      return entries
        .map(
          ([key, value]) => `  ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`
        )
        .join('\n');
    };

    return {
      type: 'tool_use',
      nodeId,
      data: {
        toolName: event.tool_use.name,
        content: formatInput(event.tool_use.input),
      },
      timestamp,
    };
  }

  // tool_resultイベント
  if (event.type === 'tool_result' && event.tool_result) {
    return {
      type: 'tool_result',
      nodeId,
      data: { content: extractTextContent(event.tool_result.content) },
      timestamp,
    };
  }

  return null;
}

/**
 * 特定ノードのプロセスを停止
 */
export function stopNodeProcess(nodeId: string): boolean {
  const process = activeProcesses.get(nodeId);
  if (process) {
    process.kill('SIGTERM');
    activeProcesses.delete(nodeId);
    return true;
  }
  return false;
}

/**
 * 全プロセスを停止
 */
export function stopAllProcesses(): number {
  let count = 0;
  for (const [nodeId, process] of activeProcesses) {
    process.kill('SIGTERM');
    activeProcesses.delete(nodeId);
    count++;
  }
  return count;
}

/**
 * アクティブなプロセスのノードIDを取得
 */
export function getActiveNodeIds(): string[] {
  return Array.from(activeProcesses.keys());
}
