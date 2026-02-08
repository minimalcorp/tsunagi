import { NextResponse } from 'next/server';
import { syncModelsFromAnthropicAPI } from '@/lib/repositories/available-model';

export async function POST() {
  try {
    const result = await syncModelsFromAnthropicAPI();

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    console.error('Failed to sync models:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync models',
      },
      { status: 500 }
    );
  }
}
