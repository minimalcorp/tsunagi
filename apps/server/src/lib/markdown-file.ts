import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Markdown Viewer が扱うローカルファイルの検証。
 *
 * 任意パス読み取りにならないよう、絶対パス・拡張子・ファイル種別を realpath 解決後に検証する
 * （symlink で拡張子を偽装されても実体の拡張子で判定する）。
 */

export const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
export const MARKDOWN_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export class LocalFileError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 413,
    message: string
  ) {
    super(message);
  }
}

export interface ResolvedLocalFile {
  realPath: string;
  size: number;
  mtimeMs: number;
}

async function resolveLocalFile(
  rawPath: unknown,
  allowedExtensions: Set<string>,
  maxBytes: number
): Promise<ResolvedLocalFile> {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new LocalFileError(400, 'path is required');
  }
  if (!path.isAbsolute(rawPath)) {
    throw new LocalFileError(400, 'path must be absolute');
  }

  let realPath: string;
  try {
    realPath = await realpath(rawPath);
  } catch {
    throw new LocalFileError(404, 'File not found');
  }

  if (!allowedExtensions.has(path.extname(realPath).toLowerCase())) {
    throw new LocalFileError(400, 'Unsupported file type');
  }

  const info = await stat(realPath).catch(() => null);
  if (!info || !info.isFile()) {
    throw new LocalFileError(404, 'File not found');
  }
  if (info.size > maxBytes) {
    throw new LocalFileError(413, 'File too large');
  }

  return { realPath, size: info.size, mtimeMs: info.mtimeMs };
}

export function resolveMarkdownFile(rawPath: unknown): Promise<ResolvedLocalFile> {
  return resolveLocalFile(rawPath, MARKDOWN_EXTENSIONS, MARKDOWN_MAX_BYTES);
}

export function resolveImageFile(rawPath: unknown): Promise<ResolvedLocalFile> {
  return resolveLocalFile(rawPath, new Set(Object.keys(IMAGE_CONTENT_TYPES)), IMAGE_MAX_BYTES);
}

/** Markdown Viewer の単体ページ URL（Claude/Codex への返却用。PTY と同一マシン前提で localhost） */
export function markdownViewerUrl(realPath: string): string {
  const port = Number(process.env.TSUNAGI_SERVER_PORT) || 2791;
  return `http://localhost:${port}/markdown-viewer?path=${encodeURIComponent(realPath)}`;
}
