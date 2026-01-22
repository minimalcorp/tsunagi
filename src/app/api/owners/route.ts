import { NextResponse } from 'next/server';
import { getRepos } from '@/lib/repo-repository';

export async function GET() {
  try {
    const repos = await getRepos();

    // Ownerごとにグループ化
    const ownersMap = new Map<
      string,
      {
        name: string;
        repositories: typeof repos;
      }
    >();

    for (const repo of repos) {
      if (!ownersMap.has(repo.owner)) {
        ownersMap.set(repo.owner, {
          name: repo.owner,
          repositories: [],
        });
      }
      ownersMap.get(repo.owner)!.repositories.push(repo);
    }

    const owners = Array.from(ownersMap.values());

    return NextResponse.json({
      data: { owners },
    });
  } catch (error) {
    console.error('Failed to get owners:', error);
    return NextResponse.json(
      {
        error: 'Failed to get owners',
      },
      { status: 500 }
    );
  }
}
