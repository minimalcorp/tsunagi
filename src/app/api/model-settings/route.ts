import { NextResponse } from 'next/server';
import { getModelSettings, createModelSetting } from '@/lib/repositories/model-setting';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') as 'global' | 'owner' | 'repo' | null;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    const settings = await getModelSettings({
      scope: scope || undefined,
      owner: owner || undefined,
      repo: repo || undefined,
    });

    return NextResponse.json({
      data: {
        settings,
      },
    });
  } catch (error) {
    console.error('Failed to get model settings:', error);
    return NextResponse.json(
      {
        error: 'Failed to get model settings',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const setting = await createModelSetting(body);

    return NextResponse.json({
      data: {
        setting,
      },
    });
  } catch (error) {
    console.error('Failed to create model setting:', error);
    return NextResponse.json(
      {
        error: 'Failed to create model setting',
      },
      { status: 500 }
    );
  }
}
