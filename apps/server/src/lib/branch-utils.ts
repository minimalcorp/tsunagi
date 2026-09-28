// ブランチ名をディレクトリ名に正規化（スラッシュをハイフンに変換）
export function normalizeBranchName(branch: string): string {
  return branch.replace(/\//g, '-');
}

// git check-ref-format --branch 相当のルールでブランチ名を検証する。
// 問題なければ null、不正ならエラーメッセージを返す。
// ※ apps/web/src/lib/branch-utils.ts と同一実装を保つこと
export function validateBranchName(branch: string): string | null {
  if (!branch) return 'Branch name is required';
  if (branch === '@' || branch === 'HEAD') return `"${branch}" cannot be used as a branch name`;
  if (branch.startsWith('-')) return 'Branch name cannot start with "-"';
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(branch)) {
    return 'Branch name cannot contain spaces or any of ~ ^ : ? * [ \\';
  }
  if (branch.includes('..')) return 'Branch name cannot contain ".."';
  if (branch.includes('@{')) return 'Branch name cannot contain "@{"';
  if (branch.startsWith('/') || branch.endsWith('/') || branch.includes('//')) {
    return 'Branch name cannot start or end with "/" or contain "//"';
  }
  if (branch.endsWith('.')) return 'Branch name cannot end with "."';
  for (const component of branch.split('/')) {
    if (component.startsWith('.')) return 'Each "/"-separated part cannot start with "."';
    if (component.endsWith('.lock')) return 'Each "/"-separated part cannot end with ".lock"';
  }
  return null;
}
