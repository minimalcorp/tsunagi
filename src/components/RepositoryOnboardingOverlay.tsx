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
      <div className="bg-white rounded-xl p-8 shadow-2xl max-w-xs text-center">
        <div className="flex justify-center mb-4">
          <Package className="w-12 h-12 text-blue-500" />
        </div>
        <h2 className="text-xl font-bold text-black mb-6">セットアップ</h2>

        <div className="space-y-2 mb-6 text-sm">
          {/* Step 1: リポジトリクローン */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded border ${
              hasRepositories ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold ${
                hasRepositories ? 'bg-green-500' : 'bg-amber-500'
              }`}
            >
              {hasRepositories ? <Check className="w-3 h-3" /> : '1'}
            </span>
            <span className={hasRepositories ? 'text-green-700' : 'font-medium text-gray-700'}>
              リポジトリクローン
            </span>
          </div>

          {/* Step 2: 認証設定 */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded border ${
              hasEnvVars ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center ${
                hasEnvVars ? 'bg-green-500 font-bold' : 'bg-gray-300'
              }`}
            >
              {hasEnvVars ? <Check className="w-3 h-3" /> : '2'}
            </span>
            <span className={hasEnvVars ? 'text-green-700' : 'text-gray-400'}>認証設定</span>
          </div>

          {/* Step 3: タスク作成 */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded border ${
              hasTasks ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center ${
                hasTasks ? 'bg-green-500 font-bold' : 'bg-gray-300'
              }`}
            >
              {hasTasks ? <Check className="w-3 h-3" /> : '3'}
            </span>
            <span className={hasTasks ? 'text-green-700' : 'text-gray-400'}>タスク作成</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 text-xs text-gray-500">
          <span>上部の「Clone Repository」ボタンをクリック</span>
        </div>
      </div>
    </div>
  );
}
