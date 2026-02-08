import { NextResponse } from 'next/server';
import * as envRepo from '@/lib/repositories/environment';
import { seedDefaultModels } from '@/lib/repositories/available-model';
import { ensureGlobalModelSetting } from '@/lib/repositories/model-setting';

export async function GET() {
  // Seed default models if not already done
  await seedDefaultModels();

  // Ensure global model setting exists
  await ensureGlobalModelSetting();

  const globalEnv = await envRepo.getEnv('global');
  const hasGlobalToken = Boolean(globalEnv.ANTHROPIC_API_KEY || globalEnv.CLAUDE_CODE_OAUTH_TOKEN);

  return NextResponse.json({
    data: { completed: hasGlobalToken, hasGlobalToken },
  });
}
