'use client';

import { Package, Check } from 'lucide-react';

interface RepositoryOnboardingOverlayProps {
  hasRepositories?: boolean;
  hasEnvVars?: boolean;
  hasTasks?: boolean;
}

export function RepositoryOnboardingOverlay({
  hasRepositories = false,
  hasEnvVars = false,
  hasTasks = false,
}: RepositoryOnboardingOverlayProps) {
  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center">
      <div className="bg-card rounded-xl p-8 shadow-2xl max-w-xs text-center">
        <div className="flex justify-center mb-4">
          <Package className="w-12 h-12 text-primary" />
        </div>
        <h2 className="text-lg font-semibold leading-none text-foreground mb-6">セットアップ</h2>

        <div className="space-y-2 mb-6 text-sm">
          {/* Step 1: 認証設定 */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded border ${
              hasEnvVars ? 'bg-success/10 border-success/30' : 'bg-warning/10 border-warning/30'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold ${
                hasEnvVars ? 'bg-success' : 'bg-warning'
              }`}
            >
              {hasEnvVars ? <Check className="w-3 h-3" /> : '1'}
            </span>
            <span className={hasEnvVars ? 'text-success' : 'font-medium text-muted-foreground'}>
              認証設定（Global）
            </span>
          </div>

          {/* Step 2: リポジトリクローン */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded border ${
              hasRepositories ? 'bg-success/10 border-success/30' : 'bg-muted border-border'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center ${
                hasRepositories ? 'bg-success font-bold' : 'bg-muted-foreground'
              }`}
            >
              {hasRepositories ? <Check className="w-3 h-3" /> : '2'}
            </span>
            <span className={hasRepositories ? 'text-success' : 'text-muted-foreground'}>
              リポジトリクローン
            </span>
          </div>

          {/* Step 3: タスク作成 */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded border ${
              hasTasks ? 'bg-success/10 border-success/30' : 'bg-muted border-border'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center ${
                hasTasks ? 'bg-success font-bold' : 'bg-muted-foreground'
              }`}
            >
              {hasTasks ? <Check className="w-3 h-3" /> : '3'}
            </span>
            <span className={hasTasks ? 'text-success' : 'text-muted-foreground'}>タスク作成</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <span>上部の「Settings」ボタンをクリック</span>
        </div>
      </div>
    </div>
  );
}
