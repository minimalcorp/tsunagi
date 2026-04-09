import { NextResponse } from 'next/server';
import * as os from 'os';
import * as path from 'path';

// GET /api/planner/config
export async function GET() {
  const cwd = path.join(os.homedir(), '.tsunagi');
  return NextResponse.json({ data: { cwd } });
}
