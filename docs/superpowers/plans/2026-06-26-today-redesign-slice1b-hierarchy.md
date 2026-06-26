# Today Redesign — Slice 1b (Front-page hierarchy + metadata hiding) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Turn the Today chrome from a stack of equal-weight panels into a "front page" that tells a story — Highlights dominate, Carried Over recedes, rows show metadata only when it disambiguates. Driven by Scott's design feedback on the slice-1 preview (8.7/10; "guided attention over organized information").

**Architecture:** Visual-weight + conditional-rendering changes to existing components (`FocusTodayRow`, `OverdueSection`, `ScheduleItem`, `TodayView`), plus two small pure helpers (`relativeStart`, `assigneeVisibility`) that are unit-tested. No data-layer changes.

**Tech Stack:** React 19 + TS strict, Tailwind v4 (Nordic Journal), Vitest + RTL, lucide-react.

## Global Constraints
- No emojis — lucide icons only.
- `@/` alias for `src/`.
- Tests: `npx vitest run <file>` (one-shot; never plain `npm test`).
- `npm run build` (tsc -b) must stay clean before any push to main.
- Branch stays preview-only; visual sign-off by Scott is the merge gate.
- Rename "FOCUS TODAY" → "HIGHLIGHTS" (Scott's call; easy to change later).
- Principle for metadata: **show it only when it disambiguates** (hide own-initials, drop redundant routine badge, don't reserve space for absent fields).

---

### Task 1: `relativeStart` helper + heroic "Highlights" tiles

**Files:**
- Create: `src/lib/today/relativeStart.ts`, `src/lib/today/relativeStart.test.ts`
- Modify: `src/components/schedule/FocusTodayRow.tsx`
- Modify: `src/components/schedule/FocusTodayRow.test.tsx`

**Interfaces:**
- Produces: `relativeStart(start: Date, now: Date): string` — `"Now"` if start within ±5 min of now; `"Starts in N min"` if 0<Δ≤90 min; `"Starts in N hr"` if >90 min same day; `""` if start is in the past beyond 5 min or null-ish. (Caller passes `now` so it's testable/deterministic.)

- [ ] **Step 1: failing test for `relativeStart`**
```typescript
import { describe, it, expect } from 'vitest'
import { relativeStart } from './relativeStart'
const at = (h: number, m = 0) => new Date(2026, 5, 24, h, m)
describe('relativeStart', () => {
  it('Now when within 5 min', () => { expect(relativeStart(at(9, 2), at(9, 0))).toBe('Now') })
  it('minutes when <=90 min away', () => { expect(relativeStart(at(9, 18), at(9, 0))).toBe('Starts in 18 min') })
  it('hours when >90 min away same day', () => { expect(relativeStart(at(13, 0), at(9, 0))).toBe('Starts in 4 hr') })
  it('empty when in the past', () => { expect(relativeStart(at(8, 0), at(9, 0))).toBe('') })
})
```
- [ ] **Step 2: run → fail** — `npx vitest run src/lib/today/relativeStart.test.ts`
- [ ] **Step 3: implement**
```typescript
export function relativeStart(start: Date, now: Date): string {
  const diffMin = Math.round((start.getTime() - now.getTime()) / 60000)
  if (Math.abs(diffMin) <= 5) return 'Now'
  if (diffMin < 0) return ''
  if (diffMin <= 90) return `Starts in ${diffMin} min`
  if (start.toDateString() === now.toDateString()) return `Starts in ${Math.round(diffMin / 60)} hr`
  return ''
}
```
- [ ] **Step 4: run → pass**
- [ ] **Step 5: Heroic tiles in `FocusTodayRow.tsx`** — make the cards read as tiles, not list rows:
  - Header label `FOCUS TODAY` → `HIGHLIGHTS`.
  - Increase card vertical padding substantially (e.g. `p-4` → `p-6`), larger title (`text-[15px]` → `text-[17px] md:text-[18px] font-medium`), more presence (stronger shadow/border-accent than ordinary cards).
  - Add a relative-start line for the soonest item: compute `relativeStart(item.startTime, new Date())` and render it (e.g. under the time) when non-empty; keep the existing time range. Guard `startTime != null`.
  - Keep the expander text but reword to `N highlights · M total events`.
- [ ] **Step 6: Update `FocusTodayRow.test.tsx`** — assert the header now reads `/highlights/i` (not /focus today/i), still renders one card per item, still calls `onSelectItem`. (Relative-start text depends on real `new Date()`, so don't assert its exact value — assert structure only.)
- [ ] **Step 7: run FocusTodayRow test → pass; `npx tsc --noEmit` clean**
- [ ] **Step 8: commit** — `git commit -am "feat(today): heroic Highlights tiles + relativeStart (rename Focus→Highlights)"`

---

### Task 2: Compact "Carried over" strip

**Files:**
- Modify: `src/components/schedule/OverdueSection.tsx`
- Modify: its test file if present (`OverdueSection.test.tsx`)

**Goal:** Demote Carried Over from a dominant panel to a quiet, compact strip so the morning doesn't lead with "what you failed to finish."

- [ ] **Step 1: Read `OverdueSection.tsx`** to see its current structure (it has collapse/expand). 
- [ ] **Step 2: Make the default (collapsed) presentation a one-line strip:** `↺ Carried over (N) · {first item title} · {second item title}` (lucide `RotateCcw` for the ↺), muted/low-weight typography (`text-[13px] text-neutral-500`), no large card chrome. Keep the existing expand affordance to reveal the full list with row actions. If it already collapses, just restyle the collapsed state to the compact strip and ensure it starts collapsed by default on Today.
- [ ] **Step 3:** Reduce its overall visual weight (no heavy card background; it should clearly sit below the Highlights in the hierarchy).
- [ ] **Step 4:** Update/adjust any test that asserted the old panel layout to the compact strip (keep coverage of: shows the count, lists items when expanded). Do not weaken into tautology.
- [ ] **Step 5:** `npx vitest run src/components/schedule/OverdueSection.test.tsx` (if it exists) → pass; `npx tsc --noEmit` clean.
- [ ] **Step 6: commit** — `git commit -am "feat(today): demote Carried Over to a compact strip"`

---

### Task 3: Metadata hiding on schedule rows

**Files:**
- Create: `src/lib/today/assigneeVisibility.ts`, `src/lib/today/assigneeVisibility.test.ts`
- Modify: `src/components/schedule/ScheduleItem.tsx`

**Goal:** Show metadata only when it disambiguates — hide the assignee chip when the item is the current user's alone; drop the routine streak/badge when it's noise; don't reserve space for absent fields.

- [ ] **Step 1: failing test for `assigneeVisibility`**
```typescript
import { describe, it, expect } from 'vitest'
import { shouldShowAssignee } from './assigneeVisibility'
describe('shouldShowAssignee', () => {
  const me = 'me-id'
  it('hides when assigned to me alone', () => { expect(shouldShowAssignee(['me-id'], me)).toBe(false) })
  it('hides when single assignee is me', () => { expect(shouldShowAssignee('me-id', me)).toBe(false) })
  it('shows when assigned to someone else', () => { expect(shouldShowAssignee(['iris-id'], me)).toBe(true) })
  it('shows when assigned to me + others', () => { expect(shouldShowAssignee(['me-id', 'iris-id'], me)).toBe(true) })
  it('hides when unassigned', () => { expect(shouldShowAssignee(null, me)).toBe(false) })
})
```
- [ ] **Step 2: run → fail**
- [ ] **Step 3: implement**
```typescript
export function shouldShowAssignee(
  assigned: string | string[] | null | undefined,
  currentMemberId: string | null,
): boolean {
  const ids = Array.isArray(assigned) ? assigned : assigned ? [assigned] : []
  if (ids.length === 0) return false
  if (ids.length === 1 && currentMemberId && ids[0] === currentMemberId) return false
  return true
}
```
- [ ] **Step 4: run → pass**
- [ ] **Step 5: Apply in `ScheduleItem.tsx`** — READ the component first; it's large and heavily used, so be surgical:
  - Find where the assignee chip (`AssigneeDropdown`/`MultiAssigneeDropdown`) renders. Gate its *display* on `shouldShowAssignee(assignedToAll ?? assignedTo, currentMemberId)`. The current member id must come from props/context already available — search the component and its callers (`TodayView` passes assignee data; there is a `selectedAssignees`/family-member context). If the current member id is NOT already available to ScheduleItem, thread it down from `TodayView` as a new optional prop `currentMemberId?: string | null` (TodayView/HomeView already know it). The dropdown must still be *reachable* for editing — only hide the always-on chip; keep an affordance to assign (e.g. it still appears on hover/tap or in the row menu). Do not remove the ability to (re)assign.
  - Drop the routine streak badge when `routineStreak` is absent/zero (don't render an empty badge); for routine rows, don't show a redundant "routine" type badge if one exists.
  - Ensure absent fields (no due time, no location) don't reserve layout space (no empty spacers).
- [ ] **Step 6:** `npx tsc --noEmit` clean. Run any existing `ScheduleItem` tests (`npx vitest run src/components/schedule/ScheduleItem.test.tsx` if present) → pass. If the assignee-display change is unit-testable at the component level, add a focused test; otherwise the helper test + visual review suffice.
- [ ] **Step 7: commit** — `git commit -am "feat(today): hide metadata unless it disambiguates (own-assignee, empty badges)"`

> If threading `currentMemberId` proves invasive or the assignee edit affordance is hard to preserve, report DONE_WITH_CONCERNS describing what's available rather than breaking assignment.

---

### Task 4: Hierarchy/weight pass + verify + push

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` (spacing/typography weight ramp)

- [ ] **Step 1:** Tune vertical rhythm and section-header weight in TodayView so the page reads top-to-bottom as: **Highlights (heaviest) → schedule → carried-over/routines (lightest)**. Concretely: more whitespace above/below the Highlights block; section labels (TODAY'S SCHEDULE, ROUTINES & HABITS) at a consistent quiet weight (`text-[12px] tracking-wide text-neutral-400/500`) so they don't compete with Highlights; ensure Carried Over (now compact) sits visually below Highlights in weight.
- [ ] **Step 2:** `npx tsc --noEmit` clean.
- [ ] **Step 3:** Full suite — `npx vitest run` → green.
- [ ] **Step 4:** `npm run build` → clean; `npm run lint` → no NEW errors in slice files.
- [ ] **Step 5:** commit — `git commit -am "feat(today): hierarchy/weight pass — Highlights dominate"` ; then `git push origin feat/today-redesign`.

## Self-review notes
- Spec coverage vs Scott's feedback: heroic Focus tiles + rename → Task 1; compact Carried Over → Task 2; metadata hiding → Task 3; visual-weight hierarchy → Tasks 1+4. Deferred to later slices (NOT in this plan): routines-panel-as-index with dose pills (also fixes the dosed-routine gap), the three-visual-languages system, and the ambient AI rail.
- Logic is TDD'd (`relativeStart`, `shouldShowAssignee`); visual changes are verified by tsc/build/suite + Scott's preview sign-off.
- Risk: `ScheduleItem` is large and shared — Task 3 must preserve the assign affordance; flagged in the task.
