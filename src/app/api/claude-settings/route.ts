import { NextRequest, NextResponse } from 'next/server';
import * as settingsRepo from '@/lib/repositories/claude-setting';

/**
 * GET /api/claude-settings?scope=xxx&owner=xxx&repo=xxx
 * 設定を取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') as 'global' | 'owner' | 'repo' | null;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!scope) {
      return NextResponse.json({ error: 'scope parameter is required' }, { status: 400 });
    }

    const sources = await settingsRepo.getSettingSources(
      scope,
      owner || undefined,
      repo || undefined
    );

    return NextResponse.json({ data: { sources } });
  } catch (error) {
    console.error('[API] Failed to get claude settings:', error);
    return NextResponse.json({ error: 'Failed to get claude settings' }, { status: 500 });
  }
}

/**
 * POST /api/claude-settings
 * 設定を保存
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scope, sources, owner, repo } = body;

    if (!scope || !Array.isArray(sources)) {
      return NextResponse.json({ error: 'scope and sources are required' }, { status: 400 });
    }

    // sourcesの検証
    const validSources = ['user', 'project', 'local'];
    if (!sources.every((s) => validSources.includes(s))) {
      return NextResponse.json({ error: 'Invalid sources value' }, { status: 400 });
    }

    await settingsRepo.setSettingSources(scope, sources, owner, repo);

    return NextResponse.json({ data: { success: true } }, { status: 201 });
  } catch (error) {
    console.error('[API] Failed to set claude settings:', error);
    return NextResponse.json({ error: 'Failed to set claude settings' }, { status: 500 });
  }
}

/**
 * DELETE /api/claude-settings?scope=xxx&owner=xxx&repo=xxx
 * 設定を削除
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') as 'global' | 'owner' | 'repo' | null;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!scope) {
      return NextResponse.json({ error: 'scope parameter is required' }, { status: 400 });
    }

    await settingsRepo.deleteSettingSources(scope, owner || undefined, repo || undefined);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('[API] Failed to delete claude settings:', error);
    return NextResponse.json({ error: 'Failed to delete claude settings' }, { status: 500 });
  }
}
