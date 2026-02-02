import { NextRequest, NextResponse } from 'next/server';
import { sandboxedQuery } from '@/lib/sandbox';
import { getConfigForAction } from './config';

/**
 * POST /api/agent
 * Execute Claude query with sandbox restrictions
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, prompt } = body;

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 });
    }

    // Get sandbox configuration for the action
    const config = getConfigForAction(action || 'default');

    // Execute sandboxed query
    const result = await sandboxedQuery(prompt, config);

    return NextResponse.json({
      success: true,
      result,
      action,
      config: {
        allowWrite: config.allowWrite,
        allowedDomains: config.allowedDomains,
      },
    });
  } catch (error) {
    console.error('Agent API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
