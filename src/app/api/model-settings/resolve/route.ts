import { NextResponse } from 'next/server';
import { resolveModelSettings, getModelSource } from '@/lib/model-resolver';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!owner || !repo) {
      return NextResponse.json(
        {
          error: 'owner and repo are required',
        },
        { status: 400 }
      );
    }

    const resolved = await resolveModelSettings(owner, repo);

    // 各モデルの解決元を取得
    const sources = {
      backlogModel: await getModelSource('backlog', owner, repo),
      planningModel: await getModelSource('planning', owner, repo),
      codingModel: await getModelSource('coding', owner, repo),
      reviewingModel: await getModelSource('reviewing', owner, repo),
    };

    return NextResponse.json({
      data: {
        resolved,
        sources,
      },
    });
  } catch (error) {
    console.error('Failed to resolve model settings:', error);
    return NextResponse.json(
      {
        error: 'Failed to resolve model settings',
      },
      { status: 500 }
    );
  }
}
