---
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git push), Bash(vercel:*), Bash(curl:*)
description: Analyze changes, write commit message, push to remote, and deploy to Vercel production
---

# Deploy to Production

Automatically analyzes your changes, writes an appropriate commit message following conventional commits format, pushes to remote, and deploys to Vercel production.

## Workflow

1. Analyze current changes (git status, git diff)
2. Review recent commit history for context and style
3. Generate a clear, concise commit message following conventional commits
4. Stage all changes
5. Create commit with generated message
6. Push to remote repository
7. Deploy to Vercel production environment

## Usage

```
/deploy
```

That's it! No arguments needed.

## Implementation Steps

### Step 1: Analyze Changes

Run these commands in parallel to understand what changed:

```bash
git status
git diff --cached
git diff
git log --oneline -5
```

### Step 2: Generate Commit Message

Based on the changes:
- Use conventional commits format (feat:, fix:, refactor:, etc.)
- Write a clear, concise summary (50 chars or less)
- Focus on the "why" not the "what"
- Match the style of recent commits in the repository
- Keep it professional and descriptive

### Step 3: Commit, Push, Deploy

Stage changes:
```bash
git add .
```

Create commit with your generated message:
```bash
git commit -m "$(cat <<'EOF'
[Your generated commit message here]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

Push to remote:
```bash
git push
```

Deploy to Vercel production:
```bash
vercel deploy --prod
```

### Step 4: Refresh Kiosk

After a successful deploy, send a remote refresh to the wall kiosk via Supabase Realtime broadcast:

```bash
curl -s -X POST "https://mwadppyrqzuzgstmwpuy.supabase.co/realtime/v1/api/broadcast" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13YWRwcHlycXp1emdzdG13cHV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzU0MjcsImV4cCI6MjA4MDExMTQyN30._bWsOu6D-UAMKsxEMzN7PhMM4ENIXr2uZWdVLcoILk4" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"topic":"realtime:wall-refresh","event":"broadcast","payload":{"type":"broadcast","event":"refresh","payload":{}}}]}'
```

### Step 5: Confirm Success

Show the user:
- The commit message you created
- The deployment URL from Vercel
- Confirmation that kiosk refresh was sent
