import { prisma } from '../db.js';
import type { Repository } from '@minimalcorp/tsunagi-shared';

type RepositoryRow = {
  id: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  order: number;
  createdAt: Date;
};

function mapRepo(repo: RepositoryRow): Repository {
  return {
    id: repo.id,
    owner: repo.owner,
    repo: repo.repo,
    cloneUrl: repo.cloneUrl,
    order: repo.order,
    createdAt: repo.createdAt.toISOString(),
  };
}

// リポジトリ一覧取得（表示順）
export async function getRepos(): Promise<Repository[]> {
  const repos = await prisma.repository.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });

  return repos.map(mapRepo);
}

// リポジトリ取得
export async function getRepo(owner: string, repo: string): Promise<Repository | null> {
  const repository = await prisma.repository.findFirst({
    where: { owner, repo },
  });

  if (!repository) return null;

  return mapRepo(repository);
}

// リポジトリ作成（表示順は末尾に追加）
export async function createRepo(
  repo: Omit<Repository, 'id' | 'order' | 'createdAt'>
): Promise<Repository> {
  const existing = await prisma.repository.findFirst({
    where: { owner: repo.owner, repo: repo.repo },
  });

  if (existing) {
    throw new Error(`Repository ${repo.owner}/${repo.repo} already exists`);
  }

  const last = await prisma.repository.findFirst({ orderBy: { order: 'desc' } });

  const newRepo = await prisma.repository.create({
    data: {
      owner: repo.owner,
      repo: repo.repo,
      cloneUrl: repo.cloneUrl,
      order: last ? last.order + 1 : 0,
    },
  });

  return mapRepo(newRepo);
}

// リポジトリ更新
export async function updateRepo(
  id: string,
  updates: Partial<Omit<Repository, 'id' | 'owner' | 'repo' | 'createdAt'>>
): Promise<Repository | null> {
  const repository = await prisma.repository.findUnique({ where: { id } });
  if (!repository) return null;

  const updatedRepo = await prisma.repository.update({
    where: { id },
    data: {
      ...(updates.cloneUrl && { cloneUrl: updates.cloneUrl }),
      ...(updates.order !== undefined && { order: updates.order }),
    },
  });

  return mapRepo(updatedRepo);
}

/**
 * 表示順を一括更新する。
 * 渡された id の並びをそのまま order 0..n-1 に割り当てるため、
 * タスクの order のような玉突き処理は不要。
 */
export async function reorderRepos(repoIds: string[]): Promise<Repository[]> {
  await prisma.$transaction(
    repoIds.map((id, index) => prisma.repository.update({ where: { id }, data: { order: index } }))
  );

  return getRepos();
}

// リポジトリ削除
export async function deleteRepo(id: string): Promise<boolean> {
  try {
    await prisma.repository.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
