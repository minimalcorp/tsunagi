import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Repository } from './types';

const REPOS_FILE = path.join(os.homedir(), '.tsunagi', 'state', 'repos.json');

// Queue機構（レースコンディション対策）
class Queue {
  private queue: (() => Promise<void>)[] = [];
  private running = false;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) await task();
    }

    this.running = false;
  }
}

const queue = new Queue();

// ファイルの原子的な読み込み
async function readRepos(): Promise<Repository[]> {
  try {
    const content = await fs.readFile(REPOS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// ファイルの原子的な書き込み
async function writeRepos(repos: Repository[]): Promise<void> {
  const dir = path.dirname(REPOS_FILE);
  await fs.mkdir(dir, { recursive: true });

  const tmpFile = `${REPOS_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(repos, null, 2), 'utf-8');
  await fs.rename(tmpFile, REPOS_FILE);
}

// リポジトリ一覧取得
export async function getRepos(): Promise<Repository[]> {
  return queue.add(async () => {
    return await readRepos();
  });
}

// リポジトリ取得
export async function getRepo(owner: string, repo: string): Promise<Repository | null> {
  return queue.add(async () => {
    const repos = await readRepos();
    return repos.find((r) => r.owner === owner && r.repo === repo) || null;
  });
}

// リポジトリ作成
export async function createRepo(repo: Omit<Repository, 'id' | 'createdAt'>): Promise<Repository> {
  return queue.add(async () => {
    const repos = await readRepos();
    const existing = repos.find((r) => r.owner === repo.owner && r.repo === repo.repo);
    if (existing) {
      throw new Error(`Repository ${repo.owner}/${repo.repo} already exists`);
    }

    const newRepo: Repository = {
      ...repo,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    repos.push(newRepo);
    await writeRepos(repos);
    return newRepo;
  });
}

// リポジトリ更新
export async function updateRepo(
  id: string,
  updates: Partial<Omit<Repository, 'id' | 'owner' | 'repo' | 'createdAt'>>
): Promise<Repository | null> {
  return queue.add(async () => {
    const repos = await readRepos();
    const index = repos.findIndex((repo) => repo.id === id);
    if (index === -1) return null;

    const updatedRepo: Repository = {
      ...repos[index],
      ...updates,
    };
    repos[index] = updatedRepo;
    await writeRepos(repos);
    return updatedRepo;
  });
}

// リポジトリ削除
export async function deleteRepo(id: string): Promise<boolean> {
  return queue.add(async () => {
    const repos = await readRepos();
    const index = repos.findIndex((repo) => repo.id === id);
    if (index === -1) return false;

    repos.splice(index, 1);
    await writeRepos(repos);
    return true;
  });
}
