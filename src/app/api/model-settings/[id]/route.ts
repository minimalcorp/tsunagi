import { NextResponse } from 'next/server';
import { updateModelSetting, deleteModelSetting } from '@/lib/repositories/model-setting';

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const body = await request.json();

    const setting = await updateModelSetting(params.id, body);

    return NextResponse.json({
      data: {
        setting,
      },
    });
  } catch (error) {
    console.error('Failed to update model setting:', error);
    return NextResponse.json(
      {
        error: 'Failed to update model setting',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    await deleteModelSetting(params.id);

    return NextResponse.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    console.error('Failed to delete model setting:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete model setting',
      },
      { status: 500 }
    );
  }
}
