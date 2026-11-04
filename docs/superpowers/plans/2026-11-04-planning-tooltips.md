# Planning as tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Planning sessions run as small paper tooltips on the everyday page. The ribbon, band, drop cards and guide-panel takeover go away. The floating Routines strip on Month and Year moves onto the calendar sheets.

**Architecture:** A `GuideCoach` (header plan chip plus an anchored tooltip) replaces `GuideRibbon` in GuidedPeriod, GuidedWeek and GuidedDay. Each step in `src/lib/guide/steps.ts` gains an `at` anchor id. Pages mark their anchors with `data-guide-anchor="<id>"`. Step editors move from drop cards to permanent page sections. PaperFold's `drive` still opens folds per step.

**Tech Stack:** React 18 + TypeScript + Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-04-paper-style-horizons-design.md`, section "Planning is a few tooltips on the everyday page". Reference: `docs/superpowers/specs/2026-11-04-paper-fold-prototype.html` (Today tab; `planChip`, `showCoach`, `placeCoach`, `.coach`, `.plan-chip` CSS).

## Global Constraints

- Node 22 (`export PATH=~/.nvm/versions/node/v22.18.0/bin:$PATH`). Worktree `~/.claude-worktrees/symphonyOS/plan-tooltips`, branch `claude/plan-tooltips`. Verify with `npx tsc -b tsconfig.app.json tsconfig.node.json`, `npx vitest run`, and eslint on the changed files.
- Copy:
  - chip: "Plan November" / "Plan today" / "Plan the week" / "Plan Fall" / "Plan 2026"; while planning, "Planning {word} · {n} of {m}" plus an ✕ labelled "Stop planning"
  - tooltip: "Step {n} of {m}"; the last step's button is "Done planning {word}"; the hide button is labelled "Hide the guide"
  - Today section: "From yesterday"; its choices are "Today" · "Back to the week" · "Done"
  - calendar sheets: "Routines this month" / "Routines this year"
- No band, no drop card, no bookmark tab. The guide's conversation panel never opens by itself during a session.
- Reduced motion: no tooltip entrance animation.
- No migrations.

## Review Focus

1. **A missing anchor:** if a step's anchor isn't on the page (empty section, phone layout), the tooltip falls back to the page title. It never shows at 0,0 or off-screen.
2. **Tooltip over its own anchor:** it never covers the control the step asks you to use (the write line, the + buttons, the energy chip).
3. **Stopping mid-session:** the ✕ on the chip, Escape, changing horizon, or navigating away ends the session (or just hides the tooltip), leaving no orphaned tooltip and no folds left driven open.
4. **The From yesterday section on real data:** with many leftovers, or none (the section is hidden), and old items more than a day old (only yesterday's).
5. **Calendar sheet routines:** a routine with several dates in the period lists each date once, compactly ("Sat Nov 7 · Sun Nov 8").

---

### Task A: GuideCoach replaces the ribbon

**Files:**
- Create: `src/components/guide/GuideCoach.tsx`, `src/components/guide/coach.css`, `src/components/guide/GuideCoach.test.tsx`
- Modify:
  - `src/lib/guide/steps.ts`: add `at: string` to each step. The anchor ids are `left`, `right`, `write`, `list`, `title`, `leftovers`, `day`, `energy`, `routines`, `inbox`, `dinner`, `family`, `menu`, `ideal-week`, `vision`, `landscape`, `areas`.
  - `src/components/plan/guided/GuidedPeriod.tsx`, `GuidedWeek.tsx`, `day/GuidedDay.tsx`: use GuideCoach.
  - The page headers on ConstellationPage, WeekV2 and TodayView: the plan chip replaces the Plan buttons and the bookmark.
  - The guide bar and shell: never auto-open the conversation panel when a session starts or a step changes.
- Delete: `GuideRibbon.tsx`, `GuideRibbon.test.tsx`, `ribbon.css`, `ribbonPlacement.test.ts`, and any bookmark-tab code.

- [ ] **Step 1: Write failing tests.**
  - On Month, the header chip "Plan November" starts a session.
  - The chip then reads "Planning November · 1 of 6".
  - A tooltip "Step 1 of 6" shows with the step title, Why and You.
  - Next moves to step 2, and on "Next 4–5 weeks" the calendar companion is driven open.
  - The tooltip's ✕ hides it while the chip stays. Clicking the chip shows it again.
  - The chip's ✕ ends the session and the folds return to their remembered state.
  - "Done planning November" stamps the sheet.
  - The tooltip is positioned at the element with `data-guide-anchor` matching the step's `at`. If none is found, it anchors to the page title.
  - There's no `.guide-band`, no ribbon tab, and the conversation panel isn't opened (assert the shell's open-panel call isn't made).
- [ ] **Step 2:** Run `npx vitest run src/components/guide src/components/plan/guided` and expect FAIL.
- [ ] **Step 3:** Implement. Port the prototype's `.coach` and `.plan-chip` styles onto Symphony tokens. Position the tooltip with `getBoundingClientRect`, following rAF for 900ms after a step change and on scroll and resize, as `placeCoach` does in the prototype.
- [ ] **Step 4:** Run the tests and tsc. Expect PASS.
- [ ] **Step 5:** Commit: `feat(sessions): planning is a few tooltips on the everyday page`.

### Task B: Step editors live on the page

**Files:**
- Today (`src/components/schedule/TodayView.tsx` and AlongsideDay):
  - Add a permanent **From yesterday** section at the top of the day's lists (anchor `leftovers`). It reuses the day look-back's data and actions (Today · Back to the week · Done) and is hidden when empty.
  - Add an **Energy** chip in the header (anchor `energy`). It cycles — / low / medium / high and writes the day's energy note the way the Energy step did.
  - Mark the timeline `day` and the week sheet's routines `routines`.
- Week (`WeekV2` / `WeekCanvas`):
  - Mark the days `day`, the no-day tray or composer `write`, the dinner row `dinner`, and the top bar's Inbox `inbox`.
  - Add a quiet "For the family this week" line (anchor `family`) that uses the existing Tell-the-family write.
- Season: the ideal week section is permanent (anchor `ideal-week`), and the Energy chip goes in the header.
- Year: vision, landscape and life-areas sections are permanent and editable (anchors `vision`, `landscape`, `areas`), reusing `YearVisionSection`, `YearLandscapeSection` and `AreasEditor`.
- Month: Fresh start goes in the page ⋯ menu (anchor `menu`).
- Remove the drop-card rendering from the guided components.
- Test: page tests for each new permanent section and anchor.

- [ ] **Step 1: Write failing tests.**
  - Today with two unfinished items from yesterday shows "From yesterday" with both, each with Today · Back to the week · Done. "Today" picks it for today. With none, the section is absent.
  - The Energy chip cycles and saves.
  - The Week page has "For the family this week".
  - The Year page renders vision, landscape and areas sections outside a session.
  - Every step id in steps.ts has an anchor that exists on its page in a fixture render (one table-driven test).
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run src/components src/lib/guide` and tsc. Expect PASS.
- [ ] **Step 5:** Commit: `feat(pages): each planning step has a home on the everyday page`.

### Task C: Routines onto the calendar sheets; no strip on Month and Year

**Files:**
- `src/components/plan/constellation/ConstellationPage.tsx`: remove the RoutinesStrip and its strip layout on Month and Year, so the spread centers.
- `src/components/plan/fold/CalendarSheet.tsx`: add "Routines this month" / "Routines this year", with each routine's dates in the period (from the same routine data the strip used, `StripRoutineList`'s source).
- `src/components/plan/constellation/AboveStrip.tsx`: delete it if unused.
- Test: `ConstellationPage.test.tsx`, `CalendarSheet.test.tsx`

- [ ] **Step 1: Write failing tests.**
  - Month has no strip (no "Routines" panel outside the sheets).
  - The November calendar sheet lists "Routines this month" with "Wash comforters · Sat Nov 7 · Sun Nov 8".
  - Year lists its routines under "Routines this year".
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and tsc. Expect PASS.
- [ ] **Step 5:** Commit: `feat(plan): routines live on the calendar sheet; the strip leaves Month and Year`.
