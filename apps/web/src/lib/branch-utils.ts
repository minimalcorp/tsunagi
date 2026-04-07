// ブランチ名をディレクトリ名に正規化（スラッシュをハイフンに変換）
export function normalizeBranchName(branch: string): string {
  return branch.replace(/\//g, '-');
}
