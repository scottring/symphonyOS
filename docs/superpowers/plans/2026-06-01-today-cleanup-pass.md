# Today Cleanup Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish hierarchy on Today — Clarity moves to the sidebar, done/week recede, the date anchors a centered column, email becomes a triage zone, and rows stop popping suggestion chips on hover.

**Architecture:** Clarity is rendered by a new presentational `SidebarClarity` (Sidebar computes `useSystemHealth` from `entities` and passes the color). done/week stay in `StatsRow` but demoted; Clarity is removed from `StatsRow`/`TodayView` (the orphaned clarity-ring construction + `useSystemHealth` are removed via compiler guidance). `HomeView` centers the `HomeHeader` wrapper only on Today. `EmailActionsBanner` is reframed as an Inbox/triage zone. The hover suggestion-chip `ExpandingPanel`s in `ScheduleItem` and `OverdueSection` are removed (proactive engine/props stay).

**Tech Stack:** React 19 + TS, Tailwind v4, Vitest + RTL, lucide icons. Tests: `npx vitest run <path>` (NOT `npm test`). Always from the worktree with PATH set:
`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/moor-header`

---

### Task 1: SidebarClarity component + mount in sidebar

`useSystemHealth.healthColor` ∈ `'excellent' | 'good' | 'fair' | 'needsAttention'`. The label map (from TodayView) is: excellent→Excellent, good→Good, fair→Fair, needsAttention→Needs attention.

**Files:**
- Create: `src/components/layout/SidebarClarity.tsx` + `SidebarClarity.test.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/SidebarClarity.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SidebarClarity } from './SidebarClarity'

describe('SidebarClarity', () => {
  it('renders the label for each health color', () => {
    render(<SidebarClarity healthColor="fair" />)
    expect(screen.getByText('Clarity')).toBeInTheDocument()
    expect(screen.getByText('Fair')).toBeInTheDocument()
  })
  it('maps needsAttention to "Needs attention"', () => {
    render(<SidebarClarity healthColor="needsAttention" />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/SidebarClarity.test.tsx`
Expected: FAIL — cannot resolve `./SidebarClarity`.

- [ ] **Step 3: Implement the component**

Create `src/components/layout/SidebarClarity.tsx`:

```tsx
import type { SystemHealthMetrics } from '@/hooks/useSystemHealth'

const LABEL: Record<SystemHealthMetrics['healthColor'], string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  needsAttention: 'Needs attention',
}

const DOT: Record<SystemHealthMetrics['healthColor'], string> = {
  excellent: 'bg-primary-500',
  good: 'bg-sage-500',
  fair: 'bg-amber-500',
  needsAttention: 'bg-orange-500',
}

/** Compact Clarity readout for the sidebar (moved out of the Today stats row). */
export function SidebarClarity({ healthColor }: { healthColor: SystemHealthMetrics['healthColor'] }) {
  return (
    <div className="px-5 pb-3 flex items-center gap-2 text-[13px]">
      <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[healthColor]}`} />
      <span className="text-neutral-500">Clarity</span>
      <span className="text-neutral-700 font-medium">{LABEL[healthColor]}</span>
    </div>
  )
}
```

(If `SystemHealthMetrics` is not exported from `useSystemHealth.ts`, export the interface there — it's already a named interface per the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/SidebarClarity.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount it in the sidebar under the greeting**

In `src/components/layout/Sidebar.tsx`:
- Add imports:
```tsx
import { useSystemHealth } from '@/hooks/useSystemHealth'
import { SidebarClarity } from './SidebarClarity'
```
- Compute health near the top of the component body (alongside `firstName`):
```tsx
  const health = useSystemHealth({
    tasks: entities?.tasks ?? [],
    projects: entities?.projects ?? [],
    projectsWithLinkedEvents: new Set(),
  })
```
- Render `<SidebarClarity>` immediately after the greeting block's closing `)}` (after line ~207), gated like the greeting:
```tsx
      {!collapsed && <SidebarClarity healthColor={health.healthColor} />}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` (expect clean)
```bash
git add src/components/layout/SidebarClarity.tsx src/components/layout/SidebarClarity.test.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(sidebar): add compact Clarity readout under the greeting"
```

---

### Task 2: Remove Clarity from the stats row; demote done/week

**Files:**
- Modify: `src/components/schedule/StatsRow.tsx`
- Modify: `src/components/schedule/TodayView.tsx`
- Test: `src/components/schedule/TodayView.test.tsx`

- [ ] **Step 1: Update tests to assert the new state**

In `src/components/schedule/TodayView.test.tsx`, find any assertion that the Today stats row shows "Clarity" and change it to assert Clarity is ABSENT from the main content while done/week remain. Add/adjust:

```tsx
  it('does not render Clarity in the content stats row (moved to sidebar)', () => {
    // render Today (use the file's existing render helper)
    expect(screen.queryByText('Clarity')).not.toBeInTheDocument()
    expect(screen.getByText(/done today/i)).toBeInTheDocument()
  })
```

(If an existing test asserts `Clarity` present, update it to `queryByText(...).not...`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/schedule/TodayView.test.tsx`
Expected: FAIL — "Clarity" still present.

- [ ] **Step 3: Remove `clarityTrigger` from the StatsRow invocation and demote done/week**

In `src/components/schedule/TodayView.tsx`, in the `<StatsRow ... />` call: delete the `clarityTrigger={clarityTrigger}` line. Leave `dueToday`, `doneToday`, `weekTrigger`, `discussionTrigger`, `weatherTrigger`, `endControls`.

In `src/components/schedule/StatsRow.tsx`, demote the done/week spans to a muted, smaller weight. Change the two spans (lines ~25–32) from `text-[13px] text-neutral-500` parent context to explicitly muted: wrap done/week in `text-[12px] text-neutral-400`:

```tsx
      {/* Done today — desktop only, demoted */}
      <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-neutral-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-neutral-300" />
        {doneToday} of {dueToday} done today
      </span>

      {/* This week — desktop only, demoted */}
      <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-neutral-400">
        {weekTrigger ?? <>{thisWeek} {thisWeek === 1 ? 'task' : 'tasks'} this week</>}
      </span>
```

Also remove the `clarityTrigger` render block (the `{clarityTrigger && (...)}` span) and the `clarityTrigger?: React.ReactNode` prop from `StatsRowProps` + the destructure (it's no longer passed).

- [ ] **Step 4: Remove the orphaned clarity construction in TodayView (compiler-driven)**

In `src/components/schedule/TodayView.tsx`, the clarity-ring construction (the `clarityLabel`, `clarityRingColorClass`, `clarityStatusColorClass`, ring-geometry consts, `clarityRingTrigger`, and `clarityTrigger = <ClarityIndicator .../>` — roughly lines 235–296) is now unused. Remove that whole block. Then run `npx tsc --noEmit` and `npm run lint 2>&1 | rg "TodayView"` and remove whatever they now flag as unused — expected: the `ClarityIndicator` import, and the `useSystemHealth` import + `const health = useSystemHealth(...)` (line ~192) **if** `health` is referenced nowhere else in TodayView. Leave anything still referenced.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/components/schedule/TodayView.test.tsx` (expect PASS)
Run: `npx tsc --noEmit` (expect clean)

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/StatsRow.tsx src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): move Clarity to sidebar; demote done/week in stats row"
```

---

### Task 3: Align the Today date header to the content column

**Files:**
- Modify: `src/components/home/HomeView.tsx`

- [ ] **Step 1: Center the HomeHeader wrapper on Today only**

In `src/components/home/HomeView.tsx`, the header is rendered (when `!isMobile`) in `<div className="px-6 pt-4">`. Change that wrapper so on Today it matches TodayView's centered column (`max-w-[940px] mx-auto`, `px-8` to match TodayView's `md:px-8`), and stays full-width for week/month:

```tsx
      {!isMobile && (
        <div className={currentView === 'today' ? 'max-w-[940px] mx-auto px-8 pt-4' : 'px-6 pt-4'}>
          <HomeHeader
            currentView={currentView}
            onViewChange={handleViewChange}
            viewedDate={viewedDate}
            onDateChange={onDateChange}
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            monthStart={monthStart}
            onMonthChange={setMonthStart}
            onOpenWeeklyPlanning={onOpenWeeklyPlanning}
          />
        </div>
      )}
```

- [ ] **Step 2: Typecheck + visual verify**

Run: `npx tsc --noEmit` (expect clean).
Run `npm run dev`, open Today: the date "Monday, June 1" should now sit directly above the task list's left edge, and Day/Week/Month should align with the content's right edge. Switch to Week/Month: header stays full-width (unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/components/home/HomeView.tsx
git commit -m "feat(today): align date header to the centered content column"
```

---

### Task 4: Reframe the email card as an Inbox/triage zone

The `EmailActionsBanner` already renders above the timeline; reframe it visually as a triage input zone, distinct from the commitment timeline. Keep the actions and the 3-item/+N-more behavior.

**Files:**
- Modify: `src/components/schedule/EmailActionsBanner.tsx`
- Test: `src/components/schedule/EmailActionsBanner.test.tsx` (if present)

- [ ] **Step 1: Reframe the header + wrap the zone**

In `src/components/schedule/EmailActionsBanner.tsx`, change the outer container and header so it reads as a triage zone. Replace the outer `<div className="mb-8 animate-fade-in-up">` with a visually-distinct wrapper, and relabel the header from "From Email" to "Inbox":

```tsx
    <div className="mb-8 animate-fade-in-up rounded-2xl border border-neutral-200/70 bg-neutral-50/60 px-4 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="time-group-header mb-3 flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <ConceptIcon name="email" decorative />
        Inbox
        <span className="text-neutral-400 font-normal">{activeItems.length}</span>
        {urgentCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">
            {urgentCount} urgent
          </span>
        )}
      </button>
```

(The subtle border + tinted background separates this triage input zone from the commitment timeline below. Keep the rest of the component unchanged — item list, actions, expand toggle.)

- [ ] **Step 2: Update the test if it asserts "From Email"**

Run: `npx vitest run src/components/schedule/EmailActionsBanner.test.tsx`
If it fails on the old "From Email" label, update those assertions to "Inbox". If no test file exists, verify with `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/EmailActionsBanner.tsx src/components/schedule/EmailActionsBanner.test.tsx
git commit -m "feat(today): reframe email card as an Inbox triage zone"
```

---

### Task 5: ScheduleItem rows static — remove hover suggestion chips

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx`
- Test: `src/components/schedule/ScheduleItem.test.tsx` (if present)

- [ ] **Step 1: Remove the hover suggestion-chip panel**

In `src/components/schedule/ScheduleItem.tsx`, delete the entire proactive-suggestions block — the JSX guarded by `{suggestions && suggestions.length > 0 && !item.completed && !item.skipped && onActSuggestion && ( <ExpandingPanel open={isHovered && !isMobile} className="ml-[5.75rem]"> ... </ExpandingPanel> )}` (the block starting at the "Proactive suggestions — hover-only" comment, ~line 827 through its closing `)}` ~line 900).

Do NOT touch the `onlyLocation ? <ExpandingPanel open={isHovered && !isMobile}>...` location block (~line 822) or the Start-meeting button — those stay (per design).

- [ ] **Step 2: Compiler/lint cleanup of now-unused props**

Run `npx tsc --noEmit` and `npm run lint 2>&1 | rg "ScheduleItem"`. Remove from the destructure ONLY the props the linter now flags as unused (likely `suggestions`, `onActSuggestion`, `onDismissSuggestion`, `onOpenGuidedChat`, and the `ICON_CONCEPTS`/`ICON_FALLBACKS` imports if only the block used them). **Keep these in the `ScheduleItemProps` interface** so the many callers that pass them still typecheck — only remove them from the destructured parameter list / kill unused imports. Leave `isHovered` (still used by the location panel).

- [ ] **Step 3: Test rows stay static on hover**

In `src/components/schedule/ScheduleItem.test.tsx` (if present), add/confirm a test that, given suggestions, no suggestion chip renders even after hover. If the file has a render helper:

```tsx
  it('does not show proactive suggestion chips on hover', async () => {
    // render a ScheduleItem with suggestions=[{...}] and onActSuggestion
    // hover the row, then assert the suggestion title is not in the document
    // (suggestions no longer render anywhere on the row)
  })
```

If no test harness exists for ScheduleItem, rely on `npx tsc --noEmit` + the visual check, and note it.

Run: `npx vitest run src/components/schedule/ScheduleItem.test.tsx` (expect PASS) — or tsc clean if no test.

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx src/components/schedule/ScheduleItem.test.tsx
git commit -m "feat(today): stop ScheduleItem rows popping suggestion chips on hover"
```

---

### Task 6: Carried-over rows static — remove hover fallback suggestions

**Files:**
- Modify: `src/components/schedule/OverdueSection.tsx`

- [ ] **Step 1: Remove the hover fallback-suggestions from OverdueCard**

In `src/components/schedule/OverdueSection.tsx`, the `OverdueCard` wrapper (~lines 220–252) tracks `isHovered` and renders `{showFallbackSuggestions && (<ExpandingPanel open={isHovered}>{fallbackSuggestionsContent}</ExpandingPanel>)}`. Remove that hover panel. With the suggestions gone, simplify `OverdueCard` to drop the `isHovered` state + `onMouseEnter`/`onMouseLeave` + the `showFallbackSuggestions`/`fallbackSuggestionsContent` props:

```tsx
function OverdueCard({
  children,
  parentVisible,
}: {
  children: React.ReactNode
  parentVisible: boolean
}) {
  return (
    <div className={parentVisible ? 'ml-6 border-l-2 border-neutral-200 pl-2' : ''}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Update the OverdueCard call site + compiler cleanup**

At the `<OverdueCard>` usage, remove the `showFallbackSuggestions={...}` and `fallbackSuggestionsContent={<SuggestionChips .../>}` props (pass only `key`, `parentVisible`). Then run `npx tsc --noEmit` and `npm run lint 2>&1 | rg "OverdueSection"` and remove what they now flag as unused — expected: the local `SuggestionChips` component, the `getOverdueSuggestions`/`OverdueSuggestion` import, the `ExpandingPanel` import, and the `proactiveSuggs`/`fallbackSuggs` locals computed only for the fallback. Keep the proactive props threaded to `ScheduleItem` only if still used; remove if flagged.

- [ ] **Step 3: Typecheck + suite**

Run: `npx tsc --noEmit` (expect clean)
Run: `npx vitest run src/components/schedule/TodayView.test.tsx` (the Carried-over section renders within Today — expect PASS)

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/OverdueSection.tsx
git commit -m "feat(today): stop Carried-over rows popping suggestions on hover"
```

---

### Task 7: Full verification + push

- [ ] **Step 1: Strict build**

Run: `npm run build` — expect clean.

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run` — expect PASS (flaky `useNotes` may need one re-run).

- [ ] **Step 3: Lint**

Run: `npm run lint` — no NEW errors in touched files (pre-existing `extract-capture/lib/whatsapp.ts` errors are unrelated).

- [ ] **Step 4: Push**

```bash
git push -u origin feat/today-cleanup-pass
```

- [ ] **Step 5: Report back for the merge decision.** Do NOT merge to main automatically.

---

## Self-Review

**Spec coverage:**
- Clarity → sidebar (pure compute) → Task 1 (SidebarClarity + Sidebar `useSystemHealth`) + Task 2 (remove from row). ✅
- done/week demoted in place → Task 2 Step 3. ✅
- Date header aligned to content column (Today only) → Task 3. ✅
- Email → Inbox/triage zone (distinct framing, keep actions) → Task 4. ✅
- Rows static — hover suggestions off in BOTH renderers → Task 5 (ScheduleItem) + Task 6 (OverdueSection); location/Start-meeting kept (Task 5 Step 1). ✅
- Proactive engine/props kept → Tasks 5/6 keep interface props, only remove display + unused destructures. ✅
- Mobile unchanged → moved metrics were desktop-only; sidebar desktop-only; no mobile branches touched. ✅

**Placeholder scan:** No TBD/TODO. Tasks 2/4/5 reference "the file's existing render helper / if a test asserts X" deliberately (test edits depend on current assertions); the new assertions and the exact code edits are explicit.

**Type/name consistency:** `SidebarClarity({ healthColor })` defined in Task 1, used identically in Step 5. `healthColor` union matches `useSystemHealth`'s `SystemHealthMetrics['healthColor']`. `useSystemHealth({ tasks, projects, projectsWithLinkedEvents })` input matches TodayView's existing call. StatsRow `clarityTrigger` removed consistently (prop + render + TodayView pass). `OverdueCard` reduced prop set consistent between definition and call site.
