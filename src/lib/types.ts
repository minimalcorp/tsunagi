// ノード設定（settings.json）
export interface NodeSettings {
  model: string;
  arcs: string[];
  position?: { x: number; y: number };
}

// セッション状態（session.json）
export interface NodeSession {
  session_id?: string;
  status: 'idle' | 'active';
  last_active?: string;
  total_cost_usd: number;
}

// ノード全体の情報
export interface Node {
  id: string;
  model: string;
  arcs: string[];
  status: 'idle' | 'active';
  session_id?: string;
  total_cost_usd: number;
  position?: { x: number; y: number };
}

// Claude CLI の出力
export interface ClaudeResponse {
  type: string;
  subtype: string;
  session_id: string;
  result: string;
  total_cost_usd: number;
  is_error: boolean;
}

// ログエントリ
export interface LogEntry {
  time: string;
  nodeId: string;
  direction: 'send' | 'receive';
  content: string;
  eventType?: StreamEventType;
}

// SSEストリームイベントタイプ
export type StreamEventType =
  | 'status'
  | 'message'
  | 'tool_use'
  | 'tool_result'
  | 'complete'
  | 'error';

// SSEストリームイベント
export interface StreamEvent {
  type: StreamEventType;
  nodeId: string;
  data: {
    content?: string;
    toolName?: string;
    targetNodeId?: string;
    cost?: number;
    sessionId?: string;
  };
  timestamp: string;
}

// Claude CLI stream-json イベント
export interface ClaudeStreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: {
    role: string;
    content: string | { type: string; text: string }; // contentはオブジェクトの場合もある
  };
  tool_use?: {
    name: string;
    input: Record<string, unknown>;
  };
  tool_result?: {
    content: string | { type: string; text: string }; // contentはオブジェクトの場合もある
  };
  result?: string;
  total_cost_usd?: number;
  is_error?: boolean;
}

// メッセージ送信リクエスト
export interface MessageRequest {
  content: string;
  target?: string;
}

// メッセージ送信レスポンス
export interface MessageResponse {
  response: string;
  session_id?: string;
  cost: number;
}

// システムプロンプト構築用オプション
export interface PromptOptions {
  currentNodeId: string;
  baseRole: string;
  connectedNodes: Array<{ nodeId: string; role: string }>;
  apiEndpoint: string;
}

// 接続ノード情報
export interface ConnectedNodeInfo {
  nodeId: string;
  role: string;
}
