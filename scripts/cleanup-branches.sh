#!/bin/bash

# Git branch cleanup script
set -e

echo "🧹 Git Branch Cleanup"
echo "===================="
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

# Local branches to delete (excluding main and current)
LOCAL_BRANCHES=$(git branch | grep -v "^\*" | grep -v "main" | sed 's/^[ ]*//')

if [ -z "$LOCAL_BRANCHES" ]; then
  echo "✅ No local branches to clean up (except main)"
else
  echo "📋 Local branches to delete:"
  echo "$LOCAL_BRANCHES" | while read branch; do
    echo "   - $branch"
  done
  echo ""
  
  read -p "Delete these local branches? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "$LOCAL_BRANCHES" | while read branch; do
      echo "🗑️  Deleting local branch: $branch"
      git branch -D "$branch" 2>/dev/null || git branch -d "$branch" 2>/dev/null || echo "   ⚠️  Could not delete $branch (may have unmerged changes)"
    done
    echo ""
  else
    echo "❌ Skipped local branch deletion"
    echo ""
  fi
fi

# Remote branches
echo "📡 Remote branches:"
REMOTE_BRANCHES=$(git branch -r | grep -v "origin/HEAD" | grep -v "origin/main" | sed 's|origin/||' | sed 's/^[ ]*//')

if [ -z "$REMOTE_BRANCHES" ]; then
  echo "✅ No remote branches to clean up (except main)"
else
  echo "📋 Remote branches that could be deleted:"
  echo "$REMOTE_BRANCHES" | while read branch; do
    echo "   - origin/$branch"
  done
  echo ""
  
  read -p "Delete these remote branches? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "$REMOTE_BRANCHES" | while read branch; do
      echo "🗑️  Deleting remote branch: origin/$branch"
      git push origin --delete "$branch" 2>/dev/null || echo "   ⚠️  Could not delete origin/$branch"
    done
    echo ""
  else
    echo "❌ Skipped remote branch deletion"
    echo ""
  fi
fi

# Prune stale remote tracking branches
echo "🧹 Pruning stale remote tracking branches..."
git remote prune origin

echo ""
echo "✅ Branch cleanup complete!"
echo ""
echo "📊 Remaining branches:"
git branch -a
