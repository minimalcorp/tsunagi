import { execFile } from 'node:child_process';
import { watch, type FSWatcher } from 'node:fs';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import {
  IMAGE_CONTENT_TYPES,
  LocalFileError,
  resolveImageFile,
  resolveMarkdownFile,
} from '../lib/markdown-file.js';

const execFileAsync = promisify(execFile);

interface FastifyWithIO extends FastifyInstance {
  io: SocketIOServer;
}

interface ToggleBody {
  path?: string;
  offset?: number;
  checked?: boolean;
  mtimeMs?: number;
}

const LIST_LIMIT = 50;
const WATCH_DEBOUNCE_MS = 100;

/** list item の開始位置（mdast position.start.offset）から始まるタスクマーカーにマッチする */
const TASK_MARKER = /^(?:[-*+]|\d{1,9}[.)])[ \t]+\[([ xX])\]/;

/**
 * `offset` にある list item のチェック状態を書き換えた文字列を返す。マーカーが無ければ null。
 * Web 側（apps/web/src/components/markdown-viewer/task-toggle.ts）と同じロジック。
 */
export function toggleTaskAt(content: string, offset: number, checked: boolean): string | null {
  if (!Number.isInteger(offset) || offset < 0 || offset >= content.length) return null;
  const match = TASK_MARKER.exec(content.slice(offset, offset + 32));
  if (!match) return null;
  const boxIndex = offset + match[0].length - 2;
  return content.slice(0, boxIndex) + (checked ? 'x' : ' ') + content.slice(boxIndex + 1);
}

function sendFileError(reply: FastifyReply, error: unknown) {
  if (error instanceof LocalFileError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  throw error;
}

/** ファイル単位の監視。atomic rename（エディタの保存）でも追従できるよう親ディレクトリを監視する */
class MarkdownWatchHub {
  private readonly entries = new Map<
    string,
    { watcher: FSWatcher; count: number; timer: NodeJS.Timeout | null }
  >();

  constructor(private readonly io: SocketIOServer) {}

  static room(realPath: string) {
    return `md:${realPath}`;
  }

  acquire(realPath: string) {
    const entry = this.entries.get(realPath);
    if (entry) {
      entry.count += 1;
      return;
    }
    const fileName = path.basename(realPath);
    let watcher: FSWatcher;
    try {
      watcher = watch(path.dirname(realPath), (_event, changed) => {
        if (changed && changed.toString() !== fileName) return;
        const current = this.entries.get(realPath);
        if (!current) return;
        if (current.timer) clearTimeout(current.timer);
        current.timer = setTimeout(() => {
          current.timer = null;
          void this.notify(realPath);
        }, WATCH_DEBOUNCE_MS);
      });
    } catch {
      return;
    }
    watcher.on('error', () => this.dispose(realPath));
    this.entries.set(realPath, { watcher, count: 1, timer: null });
  }

  release(realPath: string) {
    const entry = this.entries.get(realPath);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) this.dispose(realPath);
  }

  private dispose(realPath: string) {
    const entry = this.entries.get(realPath);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.watcher.close();
    this.entries.delete(realPath);
  }

  private async notify(realPath: string) {
    const info = await stat(realPath).catch(() => null);
    this.io.to(MarkdownWatchHub.room(realPath)).emit('markdown:changed', {
      path: realPath,
      exists: Boolean(info?.isFile()),
      mtimeMs: info?.mtimeMs ?? null,
    });
  }

  closeAll() {
    for (const key of [...this.entries.keys()]) this.dispose(key);
  }
}

export async function markdownRoutes(fastify: FastifyInstance) {
  const io = (fastify as FastifyWithIO).io;
  const hub = new MarkdownWatchHub(io);
  fastify.addHook('onClose', async () => hub.closeAll());

  io.on('connection', (socket) => {
    // この socket が監視中のファイル（realpath）。disconnect 時に参照カウントを戻す
    const watching = new Set<string>();

    socket.on('markdown:watch', async ({ path: rawPath }: { path?: string } = {}) => {
      try {
        const { realPath } = await resolveMarkdownFile(rawPath);
        if (watching.has(realPath)) return;
        watching.add(realPath);
        await socket.join(MarkdownWatchHub.room(realPath));
        hub.acquire(realPath);
      } catch {
        // 不正なパスは監視しない（表示側は GET でエラーを受け取る）
      }
    });

    socket.on('markdown:unwatch', async ({ path: rawPath }: { path?: string } = {}) => {
      if (typeof rawPath !== 'string') return;
      const realPath = watching.has(rawPath) ? rawPath : await realpath(rawPath).catch(() => null);
      if (!realPath || !watching.has(realPath)) return;
      watching.delete(realPath);
      await socket.leave(MarkdownWatchHub.room(realPath));
      hub.release(realPath);
    });

    socket.on('disconnect', () => {
      for (const realPath of watching) hub.release(realPath);
      watching.clear();
    });
  });

  // GET /markdown?path=<absolute>
  fastify.get<{ Querystring: { path?: string } }>('/markdown', async (request, reply) => {
    try {
      const file = await resolveMarkdownFile(request.query.path);
      const content = await readFile(file.realPath, 'utf8');
      return reply.send({ data: { path: file.realPath, content, mtimeMs: file.mtimeMs } });
    } catch (error) {
      return sendFileError(reply, error);
    }
  });

  // POST /markdown/toggle  タスクリストのチェックを元ファイルへ書き戻す
  fastify.post<{ Body: ToggleBody }>('/markdown/toggle', async (request, reply) => {
    try {
      const { path: rawPath, offset, checked, mtimeMs } = request.body ?? {};
      if (typeof offset !== 'number' || typeof checked !== 'boolean') {
        return reply.status(400).send({ error: 'offset and checked are required' });
      }
      const file = await resolveMarkdownFile(rawPath);
      // 表示中の内容が古い（他所で変更済み）なら上書きしない
      if (typeof mtimeMs !== 'number' || mtimeMs !== file.mtimeMs) {
        return reply.status(409).send({ error: 'File has been modified' });
      }
      const content = await readFile(file.realPath, 'utf8');
      const next = toggleTaskAt(content, offset, checked);
      if (next === null) {
        return reply.status(409).send({ error: 'Task item not found at offset' });
      }
      await writeFile(file.realPath, next, 'utf8');
      const info = await stat(file.realPath);
      return reply.send({ data: { path: file.realPath, content: next, mtimeMs: info.mtimeMs } });
    } catch (error) {
      return sendFileError(reply, error);
    }
  });

  // GET /markdown/asset?path=<absolute>  相対参照の画像を配信する（画像拡張子のみ）
  fastify.get<{ Querystring: { path?: string } }>('/markdown/asset', async (request, reply) => {
    try {
      const file = await resolveImageFile(request.query.path);
      const contentType = IMAGE_CONTENT_TYPES[path.extname(file.realPath).toLowerCase()];
      const body = await readFile(file.realPath);
      reply
        .header('Content-Type', contentType)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'no-cache');
      // SVG を直接開かれてもスクリプトが動かないようにする
      if (contentType === 'image/svg+xml') reply.header('Content-Security-Policy', 'sandbox');
      return reply.send(body);
    } catch (error) {
      return sendFileError(reply, error);
    }
  });

  // GET /markdown/list?root=<absolute dir>  worktree 内の Markdown を更新が新しい順に返す
  fastify.get<{ Querystring: { root?: string } }>('/markdown/list', async (request, reply) => {
    const rawRoot = request.query.root;
    if (typeof rawRoot !== 'string' || !path.isAbsolute(rawRoot)) {
      return reply.status(400).send({ error: 'root must be absolute' });
    }
    const root = await realpath(rawRoot).catch(() => null);
    const rootInfo = root ? await stat(root).catch(() => null) : null;
    if (!root || !rootInfo?.isDirectory()) {
      return reply.status(404).send({ error: 'Directory not found' });
    }

    let relPaths: string[];
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['ls-files', '-z', '-co', '--exclude-standard', '--', '*.md', '*.markdown'],
        { cwd: root, maxBuffer: 16 * 1024 * 1024 }
      );
      relPaths = stdout.split('\0').filter(Boolean);
    } catch {
      // git 管理外は対象外
      return reply.send({ data: { root, files: [] } });
    }

    const files = (
      await Promise.all(
        [...new Set(relPaths)].map(async (rel) => {
          const abs = path.join(root, rel);
          const info = await stat(abs).catch(() => null);
          return info?.isFile() ? { path: abs, relativePath: rel, mtimeMs: info.mtimeMs } : null;
        })
      )
    )
      .filter((file): file is NonNullable<typeof file> => file !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, LIST_LIMIT);

    return reply.send({ data: { root, files } });
  });
}
