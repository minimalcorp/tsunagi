import * as fs from 'fs/promises';
import * as path from 'path';
import type { Node, NodeSettings, NodeSession } from './types';

const SOLO_DIR = path.join(process.cwd(), '.solo');

/**
 * 全ノードIDを取得
 */
export async function getAllNodeIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(SOLO_DIR, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * ノードの設定を読み込む
 */
export async function getNodeSettings(nodeId: string): Promise<NodeSettings> {
  const settingsPath = path.join(SOLO_DIR, nodeId, 'settings.json');
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { model: 'sonnet', arcs: [] };
  }
}

/**
 * ノードのセッション状態を読み込む
 */
export async function getNodeSession(nodeId: string): Promise<NodeSession> {
  const sessionPath = path.join(SOLO_DIR, nodeId, 'session.json');
  try {
    const content = await fs.readFile(sessionPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { status: 'idle', total_cost_usd: 0 };
  }
}

/**
 * ノードのセッション状態を保存
 */
export async function saveNodeSession(nodeId: string, session: NodeSession): Promise<void> {
  const sessionPath = path.join(SOLO_DIR, nodeId, 'session.json');
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
}

/**
 * ノードの設定を保存
 */
export async function saveNodeSettings(nodeId: string, settings: NodeSettings): Promise<void> {
  const settingsPath = path.join(SOLO_DIR, nodeId, 'settings.json');
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * ノード全体の情報を取得
 */
export async function getNode(nodeId: string): Promise<Node | null> {
  const nodeDir = path.join(SOLO_DIR, nodeId);
  try {
    await fs.access(nodeDir);
  } catch {
    return null;
  }

  const [settings, session] = await Promise.all([getNodeSettings(nodeId), getNodeSession(nodeId)]);

  return {
    id: nodeId,
    model: settings.model,
    arcs: settings.arcs,
    status: session.status,
    session_id: session.session_id,
    total_cost_usd: session.total_cost_usd,
    position: settings.position,
  };
}

/**
 * 全ノードの情報を取得
 */
export async function getAllNodes(): Promise<Node[]> {
  const nodeIds = await getAllNodeIds();
  const nodes = await Promise.all(nodeIds.map(getNode));
  return nodes.filter((node): node is Node => node !== null);
}

/**
 * 新規ノードを作成
 */
export async function createNode(nodeId: string, settings: NodeSettings): Promise<Node> {
  const nodeDir = path.join(SOLO_DIR, nodeId);

  // ディレクトリ作成
  await fs.mkdir(nodeDir, { recursive: true });

  // settings.json作成
  await saveNodeSettings(nodeId, settings);

  // role.md作成（空）
  await fs.writeFile(path.join(nodeDir, 'role.md'), '');

  // mcp.json作成
  await fs.writeFile(path.join(nodeDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2));

  return {
    id: nodeId,
    model: settings.model,
    arcs: settings.arcs,
    status: 'idle',
    total_cost_usd: 0,
  };
}

/**
 * ノードを削除
 */
export async function deleteNode(nodeId: string): Promise<boolean> {
  const nodeDir = path.join(SOLO_DIR, nodeId);
  try {
    await fs.rm(nodeDir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * ノードのセッションをクリア
 */
export async function clearNodeSession(nodeId: string): Promise<void> {
  const session: NodeSession = {
    status: 'idle',
    total_cost_usd: 0,
  };
  await saveNodeSession(nodeId, session);
}

/**
 * ノードのステータスを更新
 */
export async function updateNodeStatus(nodeId: string, status: 'idle' | 'active'): Promise<void> {
  const session = await getNodeSession(nodeId);
  session.status = status;
  if (status === 'active') {
    session.last_active = new Date().toISOString();
  }
  await saveNodeSession(nodeId, session);
}

/**
 * ノードのセッション情報を更新（Claude応答後）
 */
export async function updateNodeFromResponse(
  nodeId: string,
  sessionId: string,
  cost: number
): Promise<void> {
  const session = await getNodeSession(nodeId);
  session.session_id = sessionId;
  session.total_cost_usd += cost;
  session.last_active = new Date().toISOString();
  session.status = 'idle';
  await saveNodeSession(nodeId, session);
}
