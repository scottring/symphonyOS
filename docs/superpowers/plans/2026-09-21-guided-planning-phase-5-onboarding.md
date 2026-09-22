# Guided Planning Phase 5: Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new household's first week teaches the planning chain the app now has: "Your first week" on Today gains the step that starts it ("Plan your year"), each planning page explains itself once, and `docs/onboarding.md` walks Year → Season → Month → Week → Today as the guided path with copy that matches the screens exactly. The walkthrough of the wiped demo account (the `/walkthrough` skill) is Scott's to run; this phase prepares it and stops there.

**Architecture:** No new surfaces. The first-week checklist (`src/lib/firstWeek.ts`, DB-signal driven) gains one step whose "done" signal is a saved `annual` planning session (read through `usePlanningSessionsIndex` from Phase 4). The three planning pages' empty states point at their session ("Plan <period>"), reusing existing copy slots. The onboarding document is rewritten from the shipped UI, one step per screen, with the exact button names.

**Tech Stack:** React 19, TypeScript strict, Vitest and Testing Library; Markdown for the doc.

**Spec:** `docs/superpowers/specs/2026-09-21-guided-planning-design.md` (Phase 5) and `docs/superpowers/specs/2026-09-21-core-journeys-design.md` ("Onboarding explains working behaviour"; "No new setup wizard"; journey 4 "Plan" onboarding step). Existing draft: `docs/onboarding.md` (Steps 0–12 with Status lines).

## Global Constraints

- Worktree `.claude/worktrees/guided-planning-onboarding`, branch `claude/guided-planning-onboarding`, STACKED on `claude/guided-planning-guidance` (Phase 4). One PR.
- Node/env as the earlier phases (`export PATH=$HOME/.nvm/versions/node/v22.14.0/bin:$PATH`; `npx vitest run`; `npx tsc --noEmit -p tsconfig.app.json`; `npx eslint`).
- **No new setup wizard** (S2). **Onboarding explains working behaviour** and never papers over a known gap: every step's "You'll see" must be true on the shipped build; where a walkthrough finding is still open, the step keeps a `Status: needs #N` line.
- Copy in the doc uses the exact on-screen strings (button names, headings) from Phases 1–4.
- No counts or scores; the first-week card never says how many steps remain (it already does not).
- The `/walkthrough` skill is never run without Scott (memory). This phase ends with the doc and the card ready for it.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/firstWeek.ts` (modify) | Fifth step `plan-year`: "Plan your year" → `/year`; done when an `annual` session for this year is saved |
| `src/hooks/useFirstWeekSignals.ts` (modify) | Adds `yearPlanned: boolean` from `planning_sessions` (horizon `annual`, token = this year, `notes.savedAt`) |
| `src/components/schedule/FirstWeekCard.tsx` (no change expected; verify it renders five steps) | |
| `src/components/plan/PeriodPlanPage.tsx`, `src/components/home/week/WeekList.tsx` (modify) | Empty-state lines point at the session: "Nothing on this list yet. Plan <period> →" |
| `docs/onboarding.md` (rewrite Steps 4–8, add Step 4a) | The guided path |
| `docs/superpowers/specs/2026-09-21-guided-planning-design.md` (modify) | Phase 5 shipped note |

---

### Task 0: "Plan your year" on the first-week card

**Files:** `src/lib/firstWeek.ts` (+ test `src/lib/firstWeek.test.ts`), `src/hooks/useFirstWeekSignals.ts` (+ test), `src/components/schedule/FirstWeekCard.test.tsx` (extend)

**Interfaces:**
- `FirstWeekSignals` gains `yearPlanned: boolean`. `useFirstWeekSignals` reads it with one more `head: true`-style query: `planning_sessions` where `horizon = 'annual'` and `period_token = String(new Date().getFullYear())` — but a saved row needs `notes.savedAt`, so select `notes` for those rows (few) and test `!!notes?.savedAt`.
- `firstWeekSteps(signals)` gains, as the FIRST step (the chain starts here), `{ id: 'plan-year', label: 'Plan your year', hint: 'One thing you want to be true by December.', to: '/year', done: signals.yearPlanned }`. Existing four steps unchanged and in the same order after it. `shouldShowFirstWeek` unchanged (≥2 undone steps).
- Tests: `firstWeekSteps` order and `done` from `yearPlanned`; the hook maps a saved `annual` row to `true` and an unsaved one (no `savedAt`) to `false`; `FirstWeekCard` renders the new step with its link.

- [ ] Failing tests → implement → `npx vitest run src/lib/firstWeek.test.ts src/hooks/useFirstWeekSignals.test.ts src/components/schedule/FirstWeekCard.test.tsx` → tsc/eslint → commit `feat(onboarding): the first week starts with the year`.

---

### Task 1: Empty states point at the session

**Files:** `src/components/plan/PeriodPlanPage.tsx` (month/season/year empty lines: "Nothing on this season's list yet." etc.), `src/components/home/week/WeekList.tsx` (already "Nothing on this week's list yet. Plan this week →" from Phase 2 — verify only), tests in `PeriodPlanPage.test.tsx`.

**Interfaces:** For a current or future period with an empty list and no saved session, the empty line reads `Nothing on <period>'s list yet.` followed by a text button `Plan <period> →` that calls the same `startSession` the status row uses (disabled until `sessionReady`). When a session IS saved and the list is empty, the line stays plain (the plan was saved empty on purpose). Goals section for the year: `Nothing yet. Plan 2027 →`.

- [ ] Tests (empty + unplanned → button present and opens the session; empty + planned → no button), implement, run `src/components/plan`, commit `feat(plan): an empty period invites its session`.

---

### Task 2: `docs/onboarding.md` — the guided path

**Files:** `docs/onboarding.md`

The draft is NOT on this branch or on main; it lives only on branch `claude/walkthrough-2026-09-21`. First bring it in unchanged (`git show claude/walkthrough-2026-09-21:docs/onboarding.md > docs/onboarding.md`, commit `docs(onboarding): bring the walkthrough draft onto the branch`), then rewrite Steps 4–8 and insert the chain, keeping the document's format (Where you are / Why it exists / Do this / You'll see / Status / Agent notes). Copy must use the shipped strings. Draft (the implementer reads the components to confirm every quoted string):

- **Step 4 · Year** — Do this: On `/year`, press **Plan 2026** (or **Plan 2027** from November). Write one goal you want true by December and press **Save 2026**. You'll see: "Planned <date>", the goal on the year page, and the line "2026 is planned. When you're ready, plan the season with 2026 beside you. Plan the season → · optional". Status: reads cleanly (Phase 3).
- **Step 5 · Season** — Do this: **Plan Fall 2026**. If last season had a list, choose Keep / Done / Someday / Drop for each open item; then add a season goal "for" your year goal and one task "toward" it; **Save Fall 2026**. You'll see: the goal and task on the season page; the year's goals in the column beside the session while you write.
- **Step 6 · Month** — Do this: **Plan October**. Look back at September; press **+ Add to October** on a season task or type a task; **Save October**. You'll see: "Planned <date>", the season row marked "in October", and "Plan the week → · optional".
- **Step 7 · Week** — Do this: **Plan this week**. Look back at last week's list; **+ Add to this week** on an October task; give a time-sensitive task a day with "Any day ▾"; **Save this week**. You'll see: "This week's list" above the days, each row saying where it came from, and "Each day, pick from this list."
- **Step 8 · Today** — Do this: On Today, open **Choose tasks** and press **Plan for today** on one row. You'll see: the row on Today's Tasks, still on the week list marked "Planned today"; ticking it on Today strikes it on the week list too.
- **Step 8a · The nudge** — Where you are: Today, on a Saturday or the last days of a month. You'll see one quiet line ("The week of … isn't planned yet. Plan the week → · optional · Not now"). Status: reads cleanly (Phase 4).
- Keep Steps 0–3 and 9–12 as they are; update Step 1 ("Today, empty") to mention the "Your first week" card's first step, "Plan your year".
- Top of the doc: replace "This draft is being written during a guided walkthrough" with a one-line pointer that the planning chain (Steps 4–8) is the guided path and the rest is optional.

- [ ] Rewrite, read each quoted string against the component source (grep), commit `docs(onboarding): the guided path is the planning chain`.

---

### Task 3: Verify, document, PR

- Full suite (only the known connectors file may fail), tsc, lint, build.
- Demo walk on `vite preview --port 5196`: Today shows "Your first week" with "Plan your year" first (the demo has `annual 2027` saved but not `2026` → step undone); an empty future period (e.g. `/month` next month) shows "Nothing on November's list yet. Plan November →"; the doc's Steps 4–8 strings each exist on screen.
- Spec: Phase 5 shipped note. Ledger: "Walkthrough on the wiped demo: Scott runs `/walkthrough` (never without him)".
- Draft PR "Guided planning, phase 5: onboarding".

## Self-review
- Spec coverage: Phase 5 = `docs/onboarding.md` gains the planning chain as its guided path (Task 2) and is walked with `/walkthrough` (prepared, left to Scott — Global Constraints). The in-app pieces (Tasks 0–1) make "You'll see" true on day one without a wizard (S2).
- Placeholders: none; the doc draft names exact strings and the implementer verifies each.
- Type consistency: `FirstWeekSignals.yearPlanned`, step id `plan-year`, `startSession` reuse — consistent across tasks.
