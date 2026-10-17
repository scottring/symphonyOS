# Symphony: agent instructions

Read CLAUDE.md before starting. Its rules apply to every agent working in
this repository, including Codex.

## Merge before deploying

- Production is always built from main. Every push to main redeploys it,
  so anything deployed from another branch is reverted by the next push.
- Never deploy production from an unmerged branch or worktree. This
  includes `vercel --prod`, `vercel promote` and changing production
  aliases. Merge to main first. The push to main deploys the app.
- Merge Supabase function, migration and worker changes to main before or
  together with deploying them, so main matches what is live.
- Preview deploys from branches are fine.
- A release is not done until its commits are on origin/main.
