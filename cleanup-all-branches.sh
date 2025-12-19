#!/bin/bash

# Comprehensive branch cleanup script
set -e

echo "🧹 Comprehensive Git Branch Cleanup"
echo "===================================="
echo ""

# Make sure we're on main
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "⚠️  Warning: You're on branch '$CURRENT_BRANCH'"
  echo "   Switching to main..."
  git checkout main
fi

echo "📍 Current branch: $(git branch --show-current)"
echo ""

# Remove worktrees first (these are blocking branch deletion)
WORKTREE_DIR="$HOME/.claude-worktrees/symphonyOS"
if [ -d "$WORKTREE_DIR" ]; then
  echo "🗂️  Found worktrees directory"
  for worktree in "$WORKTREE_DIR"/*; do
    if [ -d "$worktree" ]; then
      BRANCH_NAME=$(basename "$worktree")
      echo "   Removing worktree: $BRANCH_NAME"
      git worktree remove "$worktree" --force 2>/dev/null || rm -rf "$worktree" 2>/dev/null || echo "     ⚠️  Could not remove worktree"
    fi
  done
  echo ""
fi

# Delete local branches
echo "🗑️  Deleting local branches..."
LOCAL_BRANCHES=(
  "admiring-aryabhata"
  "beautiful-knuth"
  "eloquent-meninsky"
  "exciting-austin"
  "claude/fix-project-status-01WZ8DPqoRMhpwgD7Gx3dtkY"
  "feature/timeline-companion-prototype"
  "feature/radical-redesign-v2"
)

for branch in "${LOCAL_BRANCHES[@]}"; do
  if git show-ref --verify --quiet refs/heads/"$branch"; then
    echo "   Deleting: $branch"
    git branch -D "$branch" 2>/dev/null || echo "     ⚠️  Could not delete $branch"
  else
    echo "   Skipping: $branch (doesn't exist)"
  fi
done
echo ""

# Prune stale remote tracking branches
echo "🧹 Pruning stale remote tracking branches..."
git remote prune origin 2>/dev/null || echo "   ⚠️  Could not prune (may need network access)"
echo ""

echo "✅ Local branch cleanup complete!"
echo ""
echo "📊 Remaining local branches:"
git branch
echo ""
echo "💡 To delete remote branches, run:"
echo "   git push origin --delete <branch-name>"
echo ""
echo "   Or delete multiple remote branches:"
for branch in "${LOCAL_BRANCHES[@]}"; do
  echo "   git push origin --delete $branch"
done
