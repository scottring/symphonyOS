# Symphony: Claude Code instructions

## Communication

- Default to 2–4 sentences. Use at most 3 bullets when helpful.
- Lead with the result or blocker. Skip recaps and self-commentary.
- Report tests briefly; explain failures and unverified behavior.
- Expand when asked or when a decision needs more context.
- Do the full work; keep the reporting brief.

## Working safely

- Never edit, commit, or switch branches in the main worktree.
- Use a separate feature worktree based on a freshly fetched origin/main.
- Preserve other sessions’ changes. Do not reset or clean up their work.
- Work autonomously within the requested scope.
- Ask before destructive actions or changes that expand the scope.
- When a UI preview is requested, show it before implementation.

## Deployment

- Pushing to main deploys production.
- Get Scott’s approval before pushing to main or deploying.
- Before deployment, rebase onto origin/main and resolve conflicts.
- Run the required build and tests. Never bypass the pre-push checks.
- Distinguish clearly between implemented, tested, and deployed.

## Product purpose

Symphony connects what matters in life with what needs doing today,
including the information needed to do it.

Planning connects year, custom season, month, week, and Today.
Users can capture urgent work directly; the cascade is not mandatory.

- Inbox is for unprocessed captures.
- Goals describe desired outcomes; tasks describe concrete actions.
- Planning a task for today should preserve its broader commitments.
- Weeks and other periods have explicit dates.
- Routines are repeating patterns; occurrences are individual commitments.
- Reviews preserve history and make carry-forward decisions deliberate.

These are product principles, not claims that every feature is implemented.

## Privacy and shared views

- Work and Personal are private. Family content is shared as authorized.
- Domain filters show only data the signed-in user may access.
- Apply the same filters to rendered items and their counts.
- Assignment and permission are different concepts.
- Never use a service-role client to bypass user permissions in the app.
- Mocked filtering tests do not prove database privacy.
- Verify access changes with real authenticated accounts.

## Implementation

- Read the relevant code before changing it.
- Prefer existing components, selectors, and helpers.
- Keep changes focused; avoid unrelated refactors.
- Verify current types and database policies rather than trusting
  old documentation or migrations alone.
- Do not present an assumption as a verified finding.
- Add meaningful regression tests for bugs.
- Check UI changes visually, including narrow screens.

## Project basics

- React, TypeScript, Vite, Tailwind, and Supabase.
- Use @/ for imports from src/.
- Follow the existing Nordic Journal design in src/index.css.
- Keep useful context—notes, contacts, links, locations—close to tasks.

Common commands:
- npm run dev
- npm run build
- npm run lint
- npm test

Check package.json for current scripts and targeted test commands.

## Documentation and memory

- Keep this file short and durable.
- Put detailed architecture, plans, and incident history in separate docs.
- Update documentation when behavior changes.
- Personal memory belongs in ~/Documents/scotts-world, following
  that vault’s instructions; do not duplicate it in this repository.
- Consult VISION.md and POSITIONING.md for product background,
  while checking them against Scott’s current instructions.
