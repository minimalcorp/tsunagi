import { prisma } from '../db';
import type { Repository } from '../types';

// リポジトリ一覧取得
export async function getRepos(): Promise<Repository[]> {
  const repos = await prisma.repository.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return repos.map((repo) => ({
    id: repo.id,
    owner: repo.owner,
    repo: repo.repo,
    cloneUrl: repo.cloneUrl,
    createdAt: repo.createdAt.toISOString(),
  }));
}

// リポジトリ取得
export async function getRepo(owner: string, repo: string): Promise<Repository | null> {
  const repository = await prisma.repository.findFirst({
    where: { owner, repo },
  });

  if (!repository) return null;

  return {
    id: repository.id,
    owner: repository.owner,
    repo: repository.repo,
    cloneUrl: repository.cloneUrl,
    createdAt: repository.createdAt.toISOString(),
  };
}

// リポジトリ作成
export async function createRepo(repo: Omit<Repository, 'id' | 'createdAt'>): Promise<Repository> {
  const existing = await prisma.repository.findFirst({
    where: { owner: repo.owner, repo: repo.repo },
  });

  if (existing) {
    throw new Error(`Repository ${repo.owner}/${repo.repo} already exists`);
  }

  const newRepo = await prisma.repository.create({
    data: {
      owner: repo.owner,
      repo: repo.repo,
      cloneUrl: repo.cloneUrl,
    },
  });

  return {
    id: newRepo.id,
    owner: newRepo.owner,
    repo: newRepo.repo,
    cloneUrl: newRepo.cloneUrl,
    createdAt: newRepo.createdAt.toISOString(),
  };
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
    },
  });

  return {
    id: updatedRepo.id,
    owner: updatedRepo.owner,
    repo: updatedRepo.repo,
    cloneUrl: updatedRepo.cloneUrl,
    createdAt: updatedRepo.createdAt.toISOString(),
  };
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
