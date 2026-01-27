import { NextResponse } from 'next/server';
import * as envRepo from '@/lib/env-repository';

export async function GET() {
  const globalEnv = await envRepo.getEnv('global');
  const hasGlobalToken = Boolean(globalEnv.ANTHROPIC_API_KEY || globalEnv.CLAUDE_CODE_OAUTH_TOKEN);

  return NextResponse.json({
    data: { completed: hasGlobalToken, hasGlobalToken },
  });
}
