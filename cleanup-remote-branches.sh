#!/bin/bash

# Script to delete remote branches
# Run this after cleanup-all-branches.sh to clean up remote branches

echo "🗑️  Deleting remote branches..."
echo ""

REMOTE_BRANCHES=(
  "admiring-aryabhata"
  "beautiful-knuth"
  "eloquent-meninsky"
  "exciting-austin"
  "claude/fix-project-status-01WZ8DPqoRMhpwgD7Gx3dtkY"
  "feature/timeline-companion-prototype"
  "feature/radical-redesign-v2"
)

for branch in "${REMOTE_BRANCHES[@]}"; do
  echo "Deleting: origin/$branch"
  git push origin --delete "$branch" 2>/dev/null && echo "  ✅ Deleted" || echo "  ⚠️  Branch doesn't exist on remote"
done

echo ""
echo "✅ Remote branch cleanup complete!"
