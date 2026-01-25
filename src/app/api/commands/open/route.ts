import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import { normalizeBranchName } from '@/lib/branch-utils';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { commandType, owner, repo, branch } = await request.json();

    // パス構築（正規化を含む）
    const normalizedBranch = normalizeBranchName(branch);
    const worktreePath = path.join(
      os.homedir(),
      '.tsunagi',
      'workspaces',
      owner,
      repo,
      normalizedBranch
    );

    // コマンド実行
    if (commandType === 'vscode') {
      await execAsync(`code "${worktreePath}"`);
    } else if (commandType === 'terminal') {
      const platform = os.platform();
      if (platform === 'darwin') {
        // macOS
        await execAsync(`open -a Terminal "${worktreePath}"`);
      } else if (platform === 'linux') {
        // Linux: 複数のターミナルを試行
        try {
          await execAsync(`gnome-terminal --working-directory="${worktreePath}"`);
        } catch {
          await execAsync(`xterm -e "cd '${worktreePath}' && exec $SHELL"`);
        }
      } else {
        throw new Error('Unsupported platform');
      }
    } else {
      throw new Error('Invalid command type');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Command execution error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Command failed' },
      { status: 500 }
    );
  }
}
