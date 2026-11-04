# Paper-style horizons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lists above the week stand on their own. The level above is shown as a literal folded sheet that unfolds beside the page for reading only, on the web and in the iPhone app (including iPhone Duo).

**Architecture:** On the web, a self-contained `PaperFold` component (pure spring, mode and sound modules plus one component and its CSS) wraps each horizon page's sheet. The level above becomes plain content passed into it. Every verb, drag and tie that moved items between levels is removed from the pages, the guided sessions and the guide's allowed writes; data columns stay. In the iPhone app, a SwiftUI `PaperFoldView` does the same around `PeriodPlanView` and `WeekPlanView`, using the existing `DockLayout.fold` for the Duo.

**Tech Stack:** React 18 + TypeScript + Vite + Vitest + Testing Library; Supabase edge function (Deno) `symphony-agent`; SwiftUI (iOS 17+, iOS 27.1 Duo APIs behind `#available`), Swift Testing.

**Spec:** `docs/superpowers/specs/2026-11-04-paper-style-horizons-design.md` (with `2026-11-01-guided-planning-sessions-design.md`). Visual, motion and sound reference: `docs/superpowers/specs/2026-11-04-paper-fold-prototype.html`. Copy its numbers, not just its spirit.

## Global Constraints

- Node 22 (`export PATH=~/.nvm/versions/node/v22.18.0/bin:$PATH`). Verify with `npx tsc -b tsconfig.app.json tsconfig.node.json`, `npx vitest run <paths>` and `npm run lint`.
- Work only in worktree `~/.claude-worktrees/symphonyOS/guided-planning-design`, branch `claude/guided-planning-design`. Never touch the main checkout.
- No migration and no new columns. `source_id`, `goal_task_id` and `is_goal` stay; the planning pages and the guide (in a session) stop writing ties.
- Outside the planning pages, leave these as they are: the task detail Goal row ("Part of…", "Make it a goal"), Choices, the capture review sheet, the paper-plan import, and the guide outside a session.
- Carry, Let go and Table act on **this period's commitment only**, never the whole item.
- Exact copy:
  - add line: "Write a 2026 goal", "Write a Fall goal", "Write a November goal" (period word from the page), "Write a task for this week"
  - sheet-above foot: "For reading. Write {period word} in its own words."
  - header line: "Planned {Ddd}, {Mmm} {d}" then " · Last week’s review" / " · Last month’s review" / " · Last season’s review" (link), then " · Energy: {level}" (link)
  - empty year above: "Nothing left open from {year}."
- Fold numbers:
  - spring k = 170 with damping c = 2·√k·0.78; snap when |target−p| < 0.0006 and |v| < 0.002; render p clamped to [−0.04, 1.04]
  - perspective 2200px
  - edge 34px wide (horizontal), 46px tall (vertical), 22px wide (Duo)
  - sheet above = clamp(220, 36% of spread, 340) px; this sheet = min(560, spread − above)
  - phones under 760px wide: vertical fold, sheet above up to 62% of the viewport height
  - Duo spread: above 38%
  - tap = movement < 4px; release snaps open when p + v·0.12 > 0.5
  - landing sound when |target−p| < 0.03
- Sound comes only from the generators in the prototype (swish, crinkle, land, pencil), with the same filter values and levels. No audio files on the web. Mute is stored in `localStorage['symphony-paper-sound']` ('off' | 'on', default on). Haptic is `navigator.vibrate(6)` on landing.
- Remembered state: `localStorage['symphony-fold:<horizon>']` ('open' | 'folded', default folded). iOS: `@AppStorage("planner.unfolded.<horizon>")`.
- Reduced motion: no spring and no swish. Jump to the state with a 160ms opacity crossfade, plus the landing sound.

## Review Focus

1. **Folded = unreachable.** When folded, the sheet above is `inert` and `aria-hidden`; Tab never lands in it, and screen readers skip it. Test in Task 2.
2. **Resizing across 760px or into or out of Duo mid-animation.** The layout recomputes, nothing is left half-rotated, and leaving Duo folds the sheet. Test in Task 2 (`detectFoldMode` table plus a resize test).
3. **Long or empty sheet above.** A 30-row Fall scrolls inside the sheet. An empty year shows "Nothing left open from 2025." with no list. Test in Task 3.
4. **Items already on several lists** (one task with season, month and week commitments). Each list shows it once with no tie line. Let go on November ends only the November commitment. Test in Task 4.
5. **No Web Audio** (`AudioContext` missing or throwing) or storage throwing. The fold still works silently, with no console errors. Test in Task 1.

---

### Task 1: Fold engine (spring, mode, paper sound)

**Files:**
- Create: `src/lib/fold/foldSpring.ts`, `src/lib/fold/foldMode.ts`, `src/lib/fold/paperSound.ts`
- Test: `src/lib/fold/foldSpring.test.ts`, `src/lib/fold/foldMode.test.ts`, `src/lib/fold/paperSound.test.ts`

**Interfaces:**
- Produces:
  - `export interface SpringState { p: number; v: number }`
  - `export function springStep(s: SpringState, target: 0 | 1, dt: number): SpringState`, with k and c from Global Constraints and dt capped at 0.032
  - `export function springSettled(s: SpringState, target: 0 | 1): boolean`
  - `export function releaseTarget(p: number, v: number): 0 | 1`
  - `export type FoldMode = 'h' | 'v' | 'duo'`
  - `export function detectFoldMode(i: { width: number; height: number; coarse: boolean; segments: boolean }): FoldMode`
  - `export function foldSizes(mode: FoldMode, spreadWidth: number, viewportHeight: number): { above: number; current: number; edge: number; maxAboveHeight: number }`
  - `export const paperSound: { readonly on: boolean; setOn(v: boolean): void; swish(): void; crinkle(n?: number, over?: number, level?: number): void; land(level?: number): void; pencil(): void }`, created lazily from the first user gesture

- [ ] **Step 1: Write failing tests.**
  - `springStep`: from {p:0,v:0} toward 1 at dt 1/60 settles within 90 steps; max p is between 1.005 and 1.04.
  - `releaseTarget(0.45, 1)` is 1; `releaseTarget(0.6, -2)` is 0.
  - `detectFoldMode` table:
    - {1316×904, fine} → 'h'
    - {700×900, fine} → 'v'
    - {626×890, coarse} → 'duo'
    - {466×678, coarse} → 'v'
    - {1000×800, fine, segments} → 'duo'
    - {744×1133, coarse} → 'duo'
  - `foldSizes('h', 820, 900)`: above 295, current 525; `foldSizes('h', 1000, 900)`: above 340, current 560; `foldSizes('duo', 606, 890)`: above 230, current 376.
  - `paperSound` with `window.AudioContext` undefined: every method returns without throwing. `setOn(false)` persists 'off', and a throwing `localStorage` is tolerated.
- [ ] **Step 2:** Run `npx vitest run src/lib/fold` and expect FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules. Port the sound generators from the prototype's `Sound` object exactly.
- [ ] **Step 4:** Run `npx vitest run src/lib/fold` and expect PASS.
- [ ] **Step 5:** Commit: `feat(fold): spring, layout modes and paper sounds for the folded sheet`.

### Task 2: `PaperFold` component

**Files:**
- Create: `src/components/plan/fold/PaperFold.tsx`, `src/components/plan/fold/paperFold.css`
- Test: `src/components/plan/fold/PaperFold.test.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  export function PaperFold(props: {
    horizon: 'year' | 'season' | 'month' | 'week'   // storage key + aria
    edgeLabel: string        // "Fall 2026"
    edgeCount?: number       // open items on the sheet above
    above: ReactNode         // read-only content (Task 3's AboveSheet)
    children: ReactNode      // this period's sheet
    className?: string
  }): JSX.Element
  ```
  Exposes `data-fold-mode` and `data-open` on its root for tests and CSS.

- [ ] **Step 1: Write failing tests.**
  - It renders a button named `"{edgeLabel}, {count} open. Unfold to read"` with `aria-expanded="false"`, and the above region is `inert` and `aria-hidden="true"`.
  - Enter on the edge (reduced motion mocked on) gives `aria-expanded="true"`, removes `inert`, and writes `localStorage['symphony-fold:month'] === 'open'`.
  - With `'open'` stored, it mounts open.
  - Pressing F on the document toggles it, but not while an input has focus.
  - A pointer down and up within 3px toggles; a 40px drag left (in 'h' mode) followed by release opens it.
  - Resizing `innerWidth` from 1316 to 700 sets `data-fold-mode="v"`.
- [ ] **Step 2:** Run `npx vitest run src/components/plan/fold` and expect FAIL.
- [ ] **Step 3:** Implement it.
  - Port the prototype's DOM, CSS and pointer logic to React: slot, edge (spine), flap with front and back faces, and grip.
  - The animation loop uses `requestAnimationFrame` with `springStep`, and writes `--p`, the slot size and the flap transform through refs, not state, so React doesn't re-render per frame.
  - The mode comes from `detectFoldMode` on mount and resize, with segments from `matchMedia('(horizontal-viewport-segments: 2)')`.
  - Duo: entering 'duo' from another mode animates open with sound; leaving 'duo' folds instantly.
  - Use `src/index.css` tokens (`--color-*`, `--font-family-display`, `--font-family-sans`) in place of the prototype's literals. The sheet above uses a warm paper derived by `color-mix` from `--color-bg-elevated`.
- [ ] **Step 4:** Run `npx vitest run src/components/plan/fold` and expect PASS.
- [ ] **Step 5:** Commit: `feat(fold): PaperFold, the sheet above folded behind the page`.

### Task 3: Year, Season and Month pages become sheets

**Files:**
- Create: `src/components/plan/fold/AboveSheet.tsx` (read-only list: kicker, title, rows, "N done", foot line)
- Modify:
  - `src/components/plan/constellation/ConstellationPage.tsx`:
    - verbs 446-492 and 767
    - ties 269-304, 364-412, 601-642, 695-743, 763-773, 781-811, 855-895, 1293, 1319, 1330-1344
    - strip 1420-1432
  - `src/components/plan/constellation/AboveStrip.tsx`: keep only `StripRoutineList` and a routines-only strip
  - Delete `src/components/plan/constellation/aboveDrag.ts`
  - `src/components/canvas/plan/PlanItemRow.tsx`: remove `quick`, `parentLabel` and `below`
  - `src/components/canvas/plan/ProposalRow.tsx`: remove `parentLabel`
  - `src/components/plan/constellation/PlanOrderList.tsx`: no `useFold` cap, so all rows show (the done fold stays)
  - `src/lib/explain/pageGuides.ts:35`: help text for the fold
- Test: `src/components/plan/constellation/ConstellationPage.test.tsx` (rewrite the tests named in the mapping: 162-410, 440-529, 1755-1775, 1947, 1997, 2007), `src/components/plan/fold/AboveSheet.test.tsx`

**Interfaces:**
- Consumes: `PaperFold` (Task 2).
- Produces: `export function AboveSheet(p: { kicker: string; title: string; rows: { id: string; title: string }[]; doneCount: number; foot: string; empty?: string }): JSX.Element`

- [ ] **Step 1: Write failing tests.**
  - Month with tasks {s: Fall 'Plan winter vacation' (quarter), m: Nov 'Pick dates' (month, sourceId s)} shows:
    - an edge named "Fall 2026, 1 open. Unfold to read"
    - the list ['Pick dates'], with no `.plan-item-parent` anywhere
    - no button named /^(This week|Done|Later|Let go|November|Fall)/ inside a row
    - no "+ Piece"
    - an input with placeholder "Write a November goal"
  - Typing "Book trains" and pressing Enter creates a month task with no `sourceId` and no `goalTaskId` (assert the create call).
  - Season with 30 rows shows all 30 (no "+N more").
  - Year with no open 2025 goals: the sheet above reads "Nothing left open from 2025.".
  - Month strip shows only the Routines tab; Season shows no strip.
  - Year rows show no "Fall" tag.
  - Review focus #3: the 30-row Fall above sheet has a scroll container (`.paper-fold-scroll`) rather than growing the page.
- [ ] **Step 2:** Run `npx vitest run src/components/plan/constellation src/components/plan/fold` and expect FAIL.
- [ ] **Step 3:** Implement.
  - Wrap `pageBody`'s list card in `PaperFold` with `above={<AboveSheet …/>}`, built from the existing `above` nodes: titles only, open ones, plus the done count.
  - `runCreate` from the page's add line passes `parent: null`.
  - Opening a row still opens its panel (Year: Done, Let go, Edit wording; Month and Season: task panel).
- [ ] **Step 4:** Run the tests, then `npx tsc -b tsconfig.app.json tsconfig.node.json`. Expect PASS and 0 errors.
- [ ] **Step 5:** Commit: `feat(plan): Year, Season and Month as sheets, the level above folded beside`.

### Task 4: The task panel for Month and Season acts on this period only

**Files:**
- Modify: `src/components/plan/constellation/horizonPanel.tsx` 85-154 (remove `forLine`, `MoveUnderMenu`, "Back to <above>"; keep "Later: <next period>"; replace "Off <period>" with "Let go", which ends this period's commitment), `src/apps/tasks/TaskDetailPanel.tsx` 271, 327, 460, `src/components/surface/TapContextPanel.tsx` 64, 160, 323, 395 (drop the props that no longer exist)
- Test: `src/components/plan/constellation/horizonPanel.test.tsx` (rewrite 59-101)

**Interfaces:**
- Produces: `useHorizonPanel(...)` returns `{ actions }` only (no `forLine`).

- [ ] **Step 1: Write failing tests.**
  - The panel for a month task shows "Later: December" and "Let go", and no "For", "Move under" or "Back to Fall".
  - Review focus #4: for task t with open commitments season 2026-10-01, month 2026-11-01 and week 2026-10-31, "Let go" on November drops only the month commitment (assert `dropCommitment` called with level 'month', 2026-11-01). The season and week commitments are untouched.
- [ ] **Step 2:** Run `npx vitest run src/components/plan/constellation/horizonPanel.test.tsx` and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the panel tests plus `src/apps/tasks src/components/surface`, then tsc. Expect PASS.
- [ ] **Step 5:** Commit: `feat(plan): a month or season item's panel carries or lets go of this period only`.

### Task 5: Week and Today agree, and the month folds beside the week

**Files:**
- Modify:
  - `src/components/canvas/week/WeekCanvas.tsx`: remove `pullLine`, `StripLine`, the `month` prop and tab, and the month drop on days (148-186, 316-322, 833-882). Wrap the days area in `PaperFold horizon="week"` with the month `AboveSheet`.
  - `src/components/home/week/WeekViewV2.tsx`: `stripMonth` becomes AboveSheet rows; remove `pullLine` (830-838), and pass the month sheet to WeekCanvas (917, 928).
  - `src/components/canvas/week/weekShelf.ts:92`: stop skipping `isGoal`.
  - `src/components/schedule/TriageWhenMenu.tsx:39-41` and `src/components/plan/guided/week/InboxStep.tsx:13-14`: remove "This month" and "Next month".
  - `src/components/canvas/week/CompactWeekList.tsx`, `compactWeek.ts`, `src/components/plan/v2/WeekListV2.tsx:97` and `AlongsideDay.tsx:137`: flat list, no grouping by parent.
  - `src/components/schedule/TodayWeekColumn.tsx` 26-77 and 128, `TodayView.tsx` 42-43 and 1208-1237, `TodaySectionList.tsx` 128-129 and 573-575: no serves line or parent.
  - Delete `src/components/schedule/ServesLine.tsx` and `src/lib/planning/parentLink.ts` if nothing else imports them.
- Test: `WeekCanvas.test.tsx` (188), `TodayWeekColumn.test.tsx` (60), `CompactWeekList.test.tsx` (11, 31, 49), `TodayView.connects.test.tsx` (85), new `src/components/canvas/week/weekShelf.test.ts` case

**Interfaces:**
- Consumes: `PaperFold`, `AboveSheet`.

- [ ] **Step 1: Write failing tests.**
  - `buildShelf` includes an `isGoal` task committed to this week with no day (#15).
  - The Week page shows an edge "November, N open. Unfold to read" and no "→ Week" button.
  - The When ▾ menu has no "This month" or "Next month".
  - TodayWeekColumn and CompactWeekList render tasks flat, with no group heading and no `.serves-line`.
  - For the same fixture, Today's week column titles equal the Week page's no-day titles (one shared fixture, both selectors).
- [ ] **Step 2:** Run the listed tests and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run src/components/canvas/week src/components/schedule src/components/home/week src/components/plan/v2`, then tsc. Expect PASS.
- [ ] **Step 5:** Commit: `feat(week): the month folds beside the week; Week and Today show the same week, flat`.

### Task 6: Plain words in headers and week labels

**Files:**
- Modify: `src/components/guide/PeriodSummaryLine.tsx` (plus its callers `TodayView.tsx:804` and `WeekV2.tsx:219`, which pass the level), plus the "Week N" labels: `TodayView.tsx` 417, 425, 1349-1387, 1517-1519, 1720; `TodayWeekColumn.tsx` 134-161; `AlongsideDay.tsx` 106, 145; `WeekViewV2.tsx:1390`; `WeekV2.tsx` 157, 259. Use the date range `Oct 31 – Nov 6` via the existing week-range formatter (find it in `src/lib/week/`; if none exists, add `formatWeekRange(start: Date): string` to `src/lib/week/weekRange.ts`).
- Test: `PeriodSummaryLine.test.tsx` (6, 21), `TodayView.test.tsx` (870-874), `TodayWeekColumn.test.tsx` (16-104)

**Interfaces:**
- Produces: `PeriodSummaryLine` props `{ plannedAt?: string; energy?: …; reviewed?: boolean; level: 'day' | 'week' | 'month' | 'season' | 'year'; onOpen? }`

- [ ] **Step 1: Write failing tests.**
  - Planned 2026-11-02, week, reviewed, energy medium renders exactly "Planned Mon, Nov 2 · Last week’s review · Energy: medium".
  - No text "looked back" anywhere.
  - TodayWeekColumn's heading reads "Oct 31 – Nov 6", not "Week 45".
- [ ] **Step 2:** Run them and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them plus tsc and expect PASS.
- [ ] **Step 5:** Commit: `fix(copy): planned lines in plain words; weeks named by their dates`.

### Task 7: Guided sessions write each level in its own words

**Files:**
- Modify:
  - `src/components/plan/guided/season/FromYear.tsx`: year goals read-only. Remove `onPick`; keep the Someday bring (`onBring`).
  - `ConstellationPage.tsx`: `fromYearBody` 1140-1153; `choose` 896-992 (remove `backToAbove`, `bringHere`, `backUp`, the `sourceId` from `addUnder`, and `onAddStep`); `chooseBody` 1127-1136 (the level above as `AboveSheet` plus the period's add line); `lookBackBody` 1074-1097 (Month: Done / Carry / Let go; Season and Year: Done / Carry / Table / Let go; all per period).
  - `src/components/plan/choose/ChoosePlan.tsx` 186-235: lines from above become read-only.
  - `src/components/plan/guided/month/PeriodLookBack.tsx` 33-61.
  - `src/components/plan/guided/week/WeekLookBack.tsx` 28-31 and 118: Done / Next week / Someday / Let go.
  - `src/lib/planning/useChooseWeek.ts`: remove `LATER` month options (61-66), `thisWeek` on month lines (148), `backUp` (92-99), the `sourceId` from `addUnder` (112-120), and `backTo` (222). Keep `smallerStep` only if it writes a week task with no tie.
  - `WeekViewV2.tsx` 1090-1102: no closing write back to the month.
  - `src/lib/guide/steps.ts` 151, 225, 259: step "writes" copy says "writes this {period}'s items in your words".
- Test: `FromYear.test.tsx` 12; `ChoosePlan.test.tsx` 54, 72; `useChooseWeek.test.ts` 56, 74; `PeriodLookBack.test.tsx` 34; `WeekLookBack.test.tsx` 49, 61, 100; `WeekViewV2.test.tsx` 1053, 1066; `GuidedWeek.test.tsx` 304; `ConstellationPage.test.tsx` 1188-1430

- [ ] **Step 1: Write failing tests.**
  - FromYear shows year goals with no button per goal.
  - Month look back offers exactly ['Done', 'Carry', 'Let go'], and Season offers ['Done', 'Carry', 'Table', 'Let go']. Carry on a November item opens December's commitment and ends November's only.
  - Week look back has no "Back to November".
  - Done planning the week leaves leftovers' week commitments in place (no drop).
  - `useChooseWeek` exposes no month destination.
- [ ] **Step 2:** Run the listed tests and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run src/components/plan src/lib/planning src/lib/guide src/components/home/week`, then tsc. Expect PASS.
- [ ] **Step 5:** Commit: `feat(sessions): each level written in its own words; look back acts on this period`.

### Task 8: The guide places items without ties during a session

**Files:**
- Modify: `supabase/functions/symphony-agent/guideMode.ts` (46, 66-69, 216, 225, 229), `changeSet.ts` (276, 424-427, 507-521, 549-551, 576-587, 694, 724-729), `index.ts` (119, 190-191, 213-216), `readPlan.ts` (204-206); `src/lib/canvas/applyChangeSet.ts` (348-351, 604-605, 693-701)
- Test: `guideMode.test.ts` (56, 59, 121, 129), `changeSet.test.ts` (492, 516), `src/lib/canvas/applyChangeSet.test.ts` (457)

- [ ] **Step 1: Write failing tests.**
  - In guide mode, `OPS_FOR_STEP['season:from-year']` and `['month:by-area']` contain no `plan_carry` and no `commit` across levels.
  - The system prompt has no "line above" filing instruction and no parent question.
  - A guide-mode change set with `parent_id` or `goal_id` is rejected with a question-free validation error.
  - `applyChangeSet` in a session writes no `sourceId`.
  - Outside guide mode, `symphony_link_plan_item` behaves as before (existing test unchanged).
- [ ] **Step 2:** Run `deno test supabase/functions/symphony-agent` and `npx vitest run src/lib/canvas`, and expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same commands and expect PASS.
- [ ] **Step 5:** Commit: `feat(guide): a session places items by level, area and date, never under a line`.

### Task 9: November's done count is November's

**Files:**
- Modify: `ConstellationPage.tsx` 1241-1243
- Test: `ConstellationPage.test.tsx` (638, 1025, plus a new case)

- [ ] **Step 1: Write a failing test.** A month list with 2 open rows, 1 row completed 2026-11-03, 1 row completed 2026-10-20 that still has a November commitment, and 1 row moved on to December renders "1 of 3 done".
- [ ] **Step 2:** Run it and expect FAIL.
- [ ] **Step 3:** Implement. Done counts `completedAt` inside the period's bounds. The total excludes rows moved on, and excludes rows completed before the period started.
- [ ] **Step 4:** Run it and expect PASS.
- [ ] **Step 5:** Commit: `fix(plan): a period's done count counts what was done in it`.

### Task 10: iPhone app (paper fold, no bring-down, write lines)

**Files:**
- Create:
  - `apple/SymphonyOS/SymphonyOS/Views/Planner/PaperFoldView.swift`: the fold, with spring `.spring(response: 0.48, dampingFraction: 0.78)`, `rotation3DEffect` about the hinge edge, perspective 0.45, drag, and `@AppStorage("planner.unfolded.<horizon>")`
  - `apple/SymphonyOS/SymphonyOS/Services/PaperSound.swift`: AVAudioEngine with a noise buffer, the same four sounds, respecting the silent switch through `.ambient`; mute in `@AppStorage("planner.paperSound")`
  - `apple/SymphonyOS/SymphonyOSTests/PaperFoldTests.swift`
- Modify:
  - `Views/Planner/PeriodPlanView.swift`: delete `bringDown` (139-167) and its use (132); add the add line ("Write a November goal" and so on) with a new `PlanWriter.createPeriodTask(title:level:periodStart:)`; wrap in `PaperFoldView` with the sheet above (Month ← season tasks, Season ← year goals, Year ← last year's open goals).
  - `Views/Planner/WeekPlanView.swift` 106-110: the month `CalmRow` becomes `PaperFoldView` with the month's items.
  - `Services/Planning/PlanWriter.swift`: add `createPeriodTask`, which inserts a task with bucket for the level and one commitment, with no `goalTaskId`.
  - The Duo layout: `PaperFoldView` reads `appState.dockLayout`. With width ≥ 600 it lays out as a spread (above 38%, or split at `fold.midX` when the fold is vertical and both sides are > 240pt, as in `TodayView.leftColumnWidth`). Otherwise it folds from the top edge.
  - `App/DemoMode.swift` 141-156: seed rows the fold can show.
  - `SymphonyOSUITests/PlannerScreensUITests.swift`: tap the edge, assert the sheet above is visible, and assert no "Plan" menu.
- Test: `PaperFoldTests.swift`
  - `FoldGeometry.split(width: 626, fold: nil)` returns (238, 388)
  - `split(width: 900, fold: CGRect(x: 448, y: 0, width: 4, height: 1000))` returns 450 and 450
  - width 466 → `.vertical`
  - `PlanWriter.createPeriodTask` makes one month commitment and `goalTaskId == nil`

- [ ] **Step 1:** Write the failing tests above.
- [ ] **Step 2:** Run `cd apple/SymphonyOS && xcodebuild test -scheme SymphonyOS -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:SymphonyOSTests/PaperFoldTests` (if that device is missing, use any listed by `xcrun simctl list devices available`). Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the full `SymphonyOSTests` and expect PASS. Build for the simulator and check that Month, Season, Year and Week open and fold in the demo mode (`-SymphonyDemo`).
- [ ] **Step 5:** Commit: `feat(ios): the sheet above folds beside the planner; iPhone Duo as a spread`.

### Task 11: Verify and ship

- [ ] **Step 1:** Run in the worktree:
  - `npx tsc -b tsconfig.app.json tsconfig.node.json`
  - `npx vitest run`
  - `npm run lint`
  - `npm run build`
  - `deno test supabase/functions/symphony-agent`

  Expect all green.
- [ ] **Step 2:** Visual check on `localhost:5181` against the real account, screenshots only (never click row verbs): Year, Season, Month and Week, each folded and open, at 1316px, 820px and 400px wide.
- [ ] **Step 3:** Rebase onto `origin/main`, then rerun Step 1.
- [ ] **Step 4:** Deploy in order: the migration is already applied (verified 2026-11-04). Then `supabase functions deploy symphony-agent` and `supabase functions deploy google-calendar-events`, then fast-forward `main` and push. The pre-push gate runs.
- [ ] **Step 5:** iOS: Xcode Cloud builds TestFlight from a branch set in App Store Connect, not in the repo. Ask Scott which branch it builds, then push there.
