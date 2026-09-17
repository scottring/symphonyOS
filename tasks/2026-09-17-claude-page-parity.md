# Bring Symphony pages to parity with the approved Today design

The user explicitly assigned this work to Claude Code. Implement the work, verify
it, and leave a concise completion report. This is a refinement pass, not a new
product direction.

## Workspace and baseline

Work in /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/daybook-design,
branch codex/daybook-design. This is already an isolated feature worktree created
from freshly fetched origin/main for this design task. Continue here; the existing
uncommitted changes ARE the approved baseline. Preserve them. Do not reset,
clean, switch branches, discard files, edit the main checkout, or replace the
baseline with origin/main. Read CLAUDE.md and applicable repository instructions.
The original Codex session is handing implementation ownership to you and will
not concurrently edit this worktree.

No deployment, push, merge to main, or publishing is authorized. Leave changes
reviewable in this worktree. Do not send messages to third parties.

## Approved design and product decisions

- Today is the main daily execution surface.
- Desktop supports planning and execution. Week/month commitments remain separate
  from explicitly scheduled work.
- Desktop reference lists can be pinned alongside the current page, surviving
  navigation. Opening/pinning/unpinning must never schedule or mutate items.
- Existing gated placement writers and copy-down lineage must remain intact.
- Phone primarily supports execution: Today and Inbox in main navigation; Week
  and Month remain accessible through More for occasional lookup. No pinned-list
  planning workspace on phones.
- Use paper white, deep ink blue and restrained vermilion accents. Sidebar is
  almost white: #fdfdfd, with no blue/gray haze. Preserve meaningful domain/person
  colors and semantic status colors.
- Large task/routine/list text is intentional: roughly 19–20px primary content;
  metadata and controls remain quieter. Comfortable spacing and touch targets.
- The Symphony wordmark shares the main viewport's Good morning heading font,
  weight and proportional tracking. See .daybook-title and .symphony-wordmark.
- Different page organizations should remain appropriate to their jobs. Do not
  turn every page into Today or add date numerals to unrelated library pages.

## Remaining work, in priority order

1. Week/Month (and related period pages) and Inbox:
   - Replace older rounded illustrated header cards with the open heading treatment
     established on Today, respecting each page's own navigation and controls.
   - Align content type sizes, spacing, surfaces, rules and accents.
   - Reconcile existing folded month/week reference lists with new desktop pinning
     so the same reference list is not redundantly shown in multiple competing
     places. Preserve period scoping, completed/placed state and lookup behavior;
     do not reduce a full period record to an incomplete-only task queue by accident.
2. Detail panels:
   - Align heading, body/field sizes, actions and section treatment.
   - Keep actionable context legible on phones and preserve editing behaviors.
3. Library pages: Notes, Documents, Lists, Contacts, Meals and Routines.
   - Larger primary entries, quieter metadata, consistent heading/actions.
   - Remove unnecessary card nesting, excessive shadows and old decorative washes.
4. Settings and History; other reachable pages if they still visibly conflict.
   - Keep work bounded to visual/interaction parity. Hidden/withheld apps and the
     wall kiosk are not part of this request.
5. Remove stray hardcoded warm backgrounds/green focus treatments where they are
   legacy decoration, without removing purposeful person, domain or state colors.
6. Verify desktop layouts with zero, one and two pinned lists, plus task details
   and assistant panels. Current reference panels temporarily yield to those side
   panels and return when closed. Check constrained desktop/tablet and phone widths.

## Starting points

- src/index.css
- src/components/layout/MastheadCard.tsx and PageMasthead.tsx
- src/components/reference/* and src/shell/ShellLayout.tsx
- docs/design-system/DESKTOP_REFERENCE_LISTS.md
- src/components/home/HomeHeader.tsx
- src/components/home/week/WeekMonthRail.tsx
- src/components/plan/PeriodPlanPage.tsx, PlanRail.tsx, PlanRow.tsx
- src/components/schedule/InboxView.tsx
- src/components/surface/* and their sections
- src/apps/notes/NotesApp.tsx and src/apps/documents/DocumentRow.tsx
- src/components/contact/ContactsList.tsx

Approved visual-review artifacts (fictional content, static previews):
- output/daybook/matched-heading.png (latest wordmark)
- output/daybook/final-desktop-1600.png
- output/daybook/final-mobile-390.png
These show the new design, not production deployment. Inspect actual components
as the source of truth. Older screenshots in output are superseded.

## Privacy

No personal planner photos or transcriptions are included in this handoff.
Do not access Downloads, private planner images, personal vaults, authenticated
user content, or unrelated personal files. Do not include personal entries in
code, tests, previews, documentation or external services. Use fictional examples
only. Do not read or print .env files or credentials. Use existing mocked data for
verification rather than copying real account data.

## Verification and environment

Production build passed before handoff. Last targeted run: 144 tests passed;
subsequent wordmark-only change also built successfully. Tests use:
NODE_OPTIONS=--no-experimental-webstorage npm exec vitest run <targeted files>
This avoids the installed Node 26 web-storage incompatibility with the test DOM.
node_modules is linked to the existing local installation. Git is available at
/Library/Developer/CommandLineTools/usr/bin/git; the default Apple git launcher
may instead stop at an Xcode license prompt.

Run a production build and relevant existing tests for changed interactions.
Add meaningful regression coverage where behavior changes. Visually inspect
rendered desktop and phone layouts, including long labels, empty states and pinned
references. Report limitations honestly; mocked filtering does not prove live
backend access control. Preserve the existing access-control and domain filters.

Write your final report to output/daybook/claude-parity-report.md with completed
changes, remaining gaps, verification, and preview paths. Do not deploy.
