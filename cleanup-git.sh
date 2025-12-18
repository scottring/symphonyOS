#!/bin/bash

# Git cleanup script for Symphony OS
# This will merge feature/radical-redesign-v2 into main and push

set -e

echo "🧹 Git Cleanup Script"
echo "===================="
echo ""

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo "⚠️  Warning: You have uncommitted changes!"
  echo "   Please commit or stash them before running this script."
  exit 1
fi

# Show what will be merged
echo "📋 Commits to merge into main:"
git log origin/main..feature/radical-redesign-v2 --oneline
echo ""

# Confirm
read -p "Merge feature/radical-redesign-v2 into main? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Cancelled"
  exit 1
fi

# Switch to main
echo ""
echo "🔄 Switching to main branch..."
git checkout main

# Pull latest main (in case there are remote updates)
echo "📥 Pulling latest main..."
git pull origin main

# Merge feature branch
echo ""
echo "🔀 Merging feature/radical-redesign-v2 into main..."
git merge feature/radical-redesign-v2 --no-edit

# Push to origin
echo ""
echo "📤 Pushing main to origin..."
git push origin main

echo ""
echo "✅ Successfully merged and pushed!"
echo ""
echo "📊 Summary:"
echo "   - Merged feature/radical-redesign-v2 → main"
echo "   - Pushed main to origin"
echo ""
echo "🧹 Optional cleanup:"
echo "   - Delete local feature branch: git branch -d feature/radical-redesign-v2"
echo "   - Delete remote feature branch: git push origin --delete feature/radical-redesign-v2"
echo ""
read -p "Delete feature branch locally? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  git branch -d feature/radical-redesign-v2
  echo "✅ Deleted local feature branch"
fi

echo ""
echo "🎉 Done! You're now on main branch."
