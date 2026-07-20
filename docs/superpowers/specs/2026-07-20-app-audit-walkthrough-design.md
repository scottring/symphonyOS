# App Audit Walkthrough — Design

**Date:** 2026-07-20
**Goal:** Systematically find every broken or janky behavior in Symphony OS ("little things and not so little") via a guided, joint walkthrough of the whole app from a true first-run state.

## Approach

A fresh-account walkthrough done together: Scott drives the app in his browser while Claude follows in the automation browser on the same account, reproducing and diagnosing each reported bug live. Findings are logged to a punch list and fixed in prioritized batches between sessions.

## The test account

- **Account:** `symphonygoals@gmail.com` (auth user id `f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7`), the existing demo account.
- **Reset to true zero** via the Supabase service key: delete all content rows for this user/household — tasks, projects, goals + horizon plans/sessions, routines, notes, event notes, lists + list items, meals (plans/recipes/entries), contacts, family members beyond the account itself, attachments, agent/chat history, med tracker data.
- **Clear `user_profiles.onboarding_completed_at`** so the walkthrough starts at the real first-run onboarding.
- Scott logs in fresh in his own browser; Claude mints a parallel session in the automation browser using the service-key headless login recipe (temp password → GoTrue token → localStorage `sb-mwadppyrqzuzgstmwpuy-auth-token`, assignee filter set to Everyone).

## Walkthrough structure

Sessions follow the new-user journey, ~30–60 min each, stop anytime:

| Session | Coverage |
|---------|----------|
| S1 — First run | Onboarding flow → first captures → inbox triage → first scheduled day |
| S2 — Today deep pass | Timeline, drag/schedule, complete/undo, detail panels, quick capture, domain switcher, assignee filter |
| S3 — Planning | Five Horizons wizard, goals, month/year grids, week→today cascade |
| S4 — Structure | Projects, routines, lists, contacts/family |
| S5 — Life systems | Meals, morning/bedtime, meds, history, settings |
| S6 — Mobile pass | Same account on phone: responsive layer, capture, bottom-sheet panels |

**Cross-cutting throughout:** ⌘K assistant, quick capture from anywhere, realtime sync (parallel screens test this implicitly — a change that doesn't appear on the other screen is a finding).

**Exclusions:** physical wall Pi and kid-phone (tied to the real household — `/wall-v2` gets a browser-only smoke check); Google Calendar flows (demo account has no calendar connected — known gap, test later on the real account).

## Findings log

Single living punch list at `tasks/app-audit-punchlist.md`. Each finding:

- **Surface** (session/screen), **repro steps**, **expected vs. actual**
- **Severity:** P0 blocker · P1 broken · P2 janky · P3 polish
- **Diagnosis notes** from live reproduction (console/network/code pointers)
- **Status:** open · fixing · fixed+verified

The punch list's section structure doubles as a reusable per-surface checklist for future re-runs.

## Fix cadence

- **Log first, fix in batches.** Between sessions, fix in priority order in a feature worktree → push to main (auto-deploys) → verify the fix on the demo account before marking fixed+verified.
- **Exception:** anything that blocks the walkthrough from proceeding gets fixed on the spot.

## Error handling / gotchas (from prior sessions)

- Seeded/agent-created data invisible ≠ missing: check the assignee filter ("my tasks" hides unassigned), onboarding gate, and `bucket='timed'` invariant before logging a data bug.
- Wiping is destructive but scoped to the demo account only — never Scott's real account. Deletes go through the service key by user_id/household_id.
- Automation browser may hold a stale session — verify the greeting/JWT shows Alex Chen before diagnosing.
- PostgREST bulk ops: heterogeneous rows one at a time.

## Success criteria

1. Every surface in the router visited with a pass/fail note.
2. Every reported issue captured with repro + severity — nothing lives only in chat.
3. P0/P1 fixed and verified on prod; P2/P3 triaged with a decision (fix / park / won't-fix).
