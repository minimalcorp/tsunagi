import { NextResponse } from 'next/server';
import { getAvailableModels } from '@/lib/repositories/available-model';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const enabledParam = searchParams.get('enabled');
    const enabledOnly = enabledParam === null || enabledParam === 'true';

    const models = await getAvailableModels(enabledOnly);

    return NextResponse.json({
      data: {
        models,
      },
    });
  } catch (error) {
    console.error('Failed to get available models:', error);
    return NextResponse.json(
      {
        error: 'Failed to get available models',
      },
      { status: 500 }
    );
  }
}
