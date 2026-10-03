# Week planning in steps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn Week's planning session into four obvious steps — Look back · Fixed points · Fill the week · The plan — each reshaping the page for its job.

**Architecture:**
- **The step bar.** `PlanMeetingBar` takes a list of steps instead of a fixed 1|2 pair. Month and Season keep their two steps, unchanged.
- **The days.** WeekV2 no longer receives the days as a finished node. It gets `renderDays(opts)` from WeekViewV2, so each step can ask the days for what it needs: only the fixed points; everything with routines unfolded; or read-only.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, dnd-kit.

**Spec (Scott, 2026-10-03):** "stepwise instructions for planning sessions … first you'd be asked to review your last week's outstanding items, and then [review your hard landscape / calendar events / time-based tasks], and then … drag routines to the week canvas, and then the display will optimize for the different amounts of content from each of the steps and present you the final plan for the week." Scott confirmed the order and chose to go straight to building, with no mockup. Month and Season keep their sessions for now and can adopt the same bar later.

## Global Constraints

- **Code conventions:** `@/` imports; typecheck with `npx tsc --noEmit -p tsconfig.app.json`; PATH prefix `$HOME/.nvm/versions/node/v22.14.0/bin`.
- **Outside a session:** the page looks exactly as it does now (#126).
- **Look back:** when last week left nothing open, the steps start at Fixed points (no empty step).
- **Moving between steps:** every step can be reached from the bar. Next / Back move one step. "Leave for now" and "Mark week N planned" stay where they are.
- **Copy:** speak like the app. Step labels: "Look back", "Fixed points", "Fill the week", "The plan".

## Design: what each step shows

| Step | Asked | Page |
|---|---|---|
| 1 Look back | Decide last week's leftovers and earlier work | CloseOut cards (unchanged) |
| 2 Fixed points | "These can't move: appointments, events, timed work. Add anything missing." | The days only: notes (holidays, specials), events and timed entries. No untimed tasks, no routine fold, no Sometime. "+ Add" stays on each day. No sources. |
| 3 Fill the week | "Pull this week's work from October, then drag work and routines onto days." | October + this week's list on top, the days below. Each day's routines are unfolded. Everything drags. |
| 4 The plan | "This is your week. Mark it planned when it looks right." | The days only, read-only: no drag, no "+ Add", no timing control. Routines folded. |

## Review Focus

1. **A week with no look-back.** It starts at Fixed points, and the bar shows only steps 2–4, numbered 1–3.
2. **Leaving the session** mid-step returns the page to its normal layout.
3. **Month and Season** still show their own two steps ("Look back at …", "Plan …").
4. **In Fixed points,** a day with nothing fixed still shows its date and "+ Add". It does not collapse.
5. **The plan step is read-only.** No row has `data-movable="true"`.

---

### Task 1: PlanMeetingBar takes a list of steps

**Files:** Modify `src/components/plan/v2/PlanStatus.tsx`. Test: `src/components/plan/v2/PlanMeetingBar.test.tsx` (new).

**Interfaces — Produces:**
```ts
export interface MeetingStep { key: string; label: string }
PlanMeetingBar props: steps?: MeetingStep[]; stepKey?: string; onStepKey?: (key: string) => void
// When `steps` is given: one button per step (numbered 1..n), Back/Next around them, and the save
// button is primary only on the last step. Without `steps`: today's 1|2 behaviour, unchanged.
```
- **Tests:**
  1. Given four steps on step 2, it renders four numbered buttons, `aria-current` on the second, and Back and Next.
  2. Clicking Next calls `onStepKey` with the third key.
  3. On the last step, Next is absent and the save button has class `pv2-btn`.
  4. Without `steps`, the legacy two-step render is unchanged ("Look back at last month", "Plan October").

### Task 2: The days answer each step

**Files:** Modify `src/components/home/week/WeekJournal.tsx`. Test: `src/components/home/week/WeekJournal.steps.test.tsx` (new).

**Interfaces — Produces:**
```ts
WeekJournal props: show?: 'all' | 'fixed'   // 'fixed': notes + events + timed entries only; no fold, no Sometime cell
                   routinesOpen?: boolean    // every day's routine fold starts open (not remembered)
                   readOnly?: boolean        // no drag, no + Add, no timing control
export type DaysOptions = { show?: 'all' | 'fixed'; routinesOpen?: boolean; readOnly?: boolean }
```
- **Tests (grid layout, Saturday-start week):**
  1. `show="fixed"`: a day with a 9a event, an untimed task and a folded routine shows only the event, with no "Routines ·" button and no Sometime cell. A day with nothing fixed still renders its header and "+ Add".
  2. `routinesOpen`: the folded routines are listed without a click.
  3. `readOnly`: no row is movable, there is no "Add to" button, and the timing control is absent.

### Task 3: Week's four-step session

**Files:**
- Modify `src/components/plan/v2/WeekV2.tsx`: the meeting state, per-step layout, the `renderDays` prop, and why-text per step.
- Modify `src/components/home/week/WeekViewV2.tsx`: pass `renderDays` (both the desktop and narrow v2 paths).
- Test: `src/components/plan/v2/WeekV2.steps.test.tsx` (new).

**Interfaces:**
- **Consumes:** `MeetingStep` (Task 1) and `DaysOptions` (Task 2).
- **Produces:** the WeekV2 prop `renderDays?: (opts: DaysOptions) => ReactNode`. The `days` prop stays as the fallback for tests and for any other caller.
- **Meeting state:** `{ step: 'lookback' | 'fixed' | 'fill' | 'plan'; candidateIds }`. It starts at `'lookback'` when there are candidates, else `'fixed'`.

- **Per step:**
  - **lookback:** CloseOut, unchanged.
  - **fixed:** days only, `renderDays({ show: 'fixed' })`.
  - **fill:** sources + days, `renderDays({ routinesOpen: true })`.
  - **plan:** days only, `renderDays({ readOnly: true })`.

- **Tests:**
  1. Starting a session with no look-back opens on Fixed points, and the bar shows three steps.
  2. Next goes Fixed points → Fill the week: the October column appears and `renderDays` is called with `routinesOpen`.
  3. On The plan, `renderDays` is called with `readOnly`, and the sources are absent.
  4. "Leave for now" brings back the normal layout, with the sources present.

### Task 4: Docs, browser check, ship

- **Docs:** update `docs/design-system/LAYOUT-SYSTEM.md` §8 with a "Planning a week, in steps" paragraph.
- **Browser check:** a local preview on Scott's data. Start the session and walk all four steps at 1720px and 390px. Nothing gets written; "Leave for now" at the end.
- **Ship:** full suite, lint and build, then a PR. Deploy only with Scott's go-ahead.
