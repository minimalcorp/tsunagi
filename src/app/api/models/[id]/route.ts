import { NextResponse } from 'next/server';
import {
  getAvailableModel,
  updateAvailableModel,
  deleteAvailableModel,
} from '@/lib/repositories/available-model';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const model = await getAvailableModel(params.id);

    if (!model) {
      return NextResponse.json(
        {
          error: 'Model not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        model,
      },
    });
  } catch (error) {
    console.error('Failed to get model:', error);
    return NextResponse.json(
      {
        error: 'Failed to get model',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const body = await request.json();

    const model = await updateAvailableModel(params.id, body);

    return NextResponse.json({
      data: {
        model,
      },
    });
  } catch (error) {
    console.error('Failed to update model:', error);
    return NextResponse.json(
      {
        error: 'Failed to update model',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    await deleteAvailableModel(params.id);

    return NextResponse.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    console.error('Failed to delete model:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete model',
      },
      { status: 500 }
    );
  }
}
