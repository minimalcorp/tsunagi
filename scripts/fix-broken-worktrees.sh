#!/bin/bash
# 既存の破損したworktree（unborn branch）を修正するスクリプト

set -e

WORKSPACES_ROOT="$HOME/.tsunagi/workspaces"

echo "Checking for broken worktrees in $WORKSPACES_ROOT..."

# 全てのbare repositoryを検索
find "$WORKSPACES_ROOT" -type d -name ".bare" | while read -r bare_repo; do
  echo ""
  echo "Checking bare repository: $bare_repo"

  cd "$bare_repo"

  # デフォルトブランチを取得
  default_branch=$(git symbolic-ref HEAD | sed 's|refs/heads/||')
  default_commit=$(git rev-parse "$default_branch")

  echo "Default branch: $default_branch (commit: ${default_commit:0:7})"

  # worktreeのリストを取得
  git worktree list --porcelain | grep -E "^worktree |^branch " | while read -r line; do
    if [[ $line == worktree* ]]; then
      current_worktree=$(echo "$line" | cut -d' ' -f2-)
    elif [[ $line == branch* ]]; then
      branch_ref=$(echo "$line" | cut -d' ' -f2-)
      branch_name=$(echo "$branch_ref" | sed 's|refs/heads/||')

      # bare repositoryでブランチのrefが存在するか確認
      if ! git show-ref --verify --quiet "$branch_ref"; then
        echo "  ⚠️  Broken worktree found: $current_worktree"
        echo "     Branch: $branch_name (no commits)"

        # ブランチのrefを作成
        echo "     Fixing: Creating ref for $branch_name from $default_branch"
        git update-ref "$branch_ref" "$default_commit"

        echo "     ✅ Fixed!"
      fi
    fi
  done
done

echo ""
echo "Done! All broken worktrees have been fixed."
