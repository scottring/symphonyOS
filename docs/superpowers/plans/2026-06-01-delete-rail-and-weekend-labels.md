# Delete the Today Rail + Weekend Label Clarity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the always-on Today right rail (giving the space to a centered timeline, with For Discussion surviving as a stats-row badge), and make the weekend scheduling presets show their resolved dates.

**Architecture:** All work is in the **legacy** `App.tsx` → `AppShell` Today path (the working default; the new Shell is parked with a blank-Today bug — out of scope). The rail (`TodayRail` + 4 sections) is deleted; `For Discussion` becomes a small badge in the existing stats row, computed from the same `lib/discussionItems`. Weekend labels get a shared `formatShortDate` helper. `ScratchpadPane`, `useScratchpadHidden`, and `lib/discussionItems` are kept (used elsewhere / by the badge).

**Tech Stack:** React 19 + TypeScript, Tailwind v4, Vitest + React Testing Library, lucide-react icons. Run tests with `npx vitest run <path>` (NOT `npm test` — watch mode). Always run from the worktree with PATH set:
`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/delete-rail`

**No-emoji rule:** the badge uses the lucide `MessageSquare` icon, never a literal 💬.

---

### Task 1: `formatShortDate` helper

A pure, non-relative date formatter ("Sat, Jun 6") for the weekend labels — distinct from `formatDateLabel` which returns "Today"/"Tomorrow" (we don't want relative words on a weekend chip).

**Files:**
- Modify: `src/lib/dateHelpers.ts`
- Test: `src/lib/dateHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/dateHelpers.test.ts` (import `formatShortDate` in the existing import from `./dateHelpers`):

```ts
describe('formatShortDate', () => {
  it('formats as weekday, short month, day with no relative words', () => {
    // Sat Jun 6 2026
    expect(formatShortDate(new Date(2026, 5, 6))).toBe('Sat, Jun 6')
  })
  it('never returns Today/Tomorrow', () => {
    const today = new Date()
    expect(formatShortDate(today)).not.toBe('Today')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dateHelpers.test.ts`
Expected: FAIL — `formatShortDate is not a function` / not exported.

- [ ] **Step 3: Implement the helper**

Add to `src/lib/dateHelpers.ts` (near `formatDateLabel`):

```ts
/** Non-relative compact label, e.g. "Sat, Jun 6". Unlike formatDateLabel, never returns Today/Tomorrow. */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dateHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dateHelpers.ts src/lib/dateHelpers.test.ts
git commit -m "feat(dates): add formatShortDate helper for weekend labels"
```

---

### Task 2: Weekend labels in WhenPicker

**Files:**
- Modify: `src/components/triage/WhenPicker.tsx`
- Test: `src/components/triage/WhenPicker.test.tsx`

- [ ] **Step 1: Update the test mock + add failing assertions**

In `src/components/triage/WhenPicker.test.tsx`, add `formatShortDate` to the `vi.mock('@/lib/dateHelpers', () => ({ ... }))` factory:

```tsx
  formatShortDate: (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
```

Then add this test inside the existing `describe`:

```tsx
    it('weekend buttons show their resolved dates', () => {
      render(<WhenPicker onChange={vi.fn()} />)
      fireEvent.click(screen.getByLabelText('Set when'))
      // labels now read "This Weekend · <date>" / "Next Weekend · <date>"
      expect(screen.getByText(/This Weekend ·/)).toBeInTheDocument()
      expect(screen.getByText(/Next Weekend ·/)).toBeInTheDocument()
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/triage/WhenPicker.test.tsx`
Expected: FAIL — no element matching `/This Weekend ·/` (label is still plain "This Weekend").

- [ ] **Step 3: Implement — import helper and append dates to labels**

In `src/components/triage/WhenPicker.tsx`, add `formatShortDate` to the dateHelpers import (line 3):

```tsx
import { getBaseDate, getNextWeekend, getWeekendAfterNext, parseDateInput, parseTimeInput, formatDateLabel, formatShortDate } from '@/lib/dateHelpers'
```

Replace the two weekend buttons (currently labeled `This Weekend` / `Next Weekend`) so each computes its date once and shows it. The "This Weekend" button becomes:

```tsx
              <button
                onClick={() => handleBucketSelect('timed', getNextWeekend())}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                This Weekend <span className="text-neutral-400">· {formatShortDate(getNextWeekend())}</span>
              </button>
```

and the "Next Weekend" button becomes:

```tsx
              <button
                onClick={() => handleBucketSelect('timed', getWeekendAfterNext())}
                className="w-full px-3 py-2 text-sm text-left rounded-lg hover:bg-primary-50 text-neutral-700"
              >
                Next Weekend <span className="text-neutral-400">· {formatShortDate(getWeekendAfterNext())}</span>
              </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/triage/WhenPicker.test.tsx`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/components/triage/WhenPicker.tsx src/components/triage/WhenPicker.test.tsx
git commit -m "feat(triage): show resolved dates on WhenPicker weekend presets"
```

---

### Task 3: Weekend labels in SchedulePopover

No test harness exists for this portal component; verify by typecheck (the date math is covered by `dateHelpers.test.ts`).

**Files:**
- Modify: `src/components/triage/SchedulePopover.tsx`

- [ ] **Step 1: Add `formatShortDate` to the dateHelpers import**

In `src/components/triage/SchedulePopover.tsx`, add `formatShortDate` to the existing `from '@/lib/dateHelpers'` import block:

```tsx
import {
  getBaseDate,
  getNextWeekend,
  getWeekendAfterNext,
  getNextMonday,
  parseDateInput,
  formatDateLabel,
  formatShortDate,
} from '@/lib/dateHelpers'
```

- [ ] **Step 2: Append the resolved date to both weekend button labels**

Find the "This Weekend" button's label `<span>This Weekend</span>` and replace with:

```tsx
                  <span>This Weekend · {formatShortDate(getNextWeekend())}</span>
```

Find the "Next Weekend" button's label `<span>Next Weekend</span>` and replace with:

```tsx
                  <span>Next Weekend · {formatShortDate(getWeekendAfterNext())}</span>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/triage/SchedulePopover.tsx
git commit -m "feat(schedule): show resolved dates on SchedulePopover weekend presets"
```

---

### Task 4: DiscussionBadge component

A standalone badge: shows `MessageSquare` + count, opens a popover listing the discussion tasks; clicking a row selects the task. Mirrors the old `ForDiscussion` list shape.

**Files:**
- Create: `src/components/schedule/DiscussionBadge.tsx`
- Test: `src/components/schedule/DiscussionBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/DiscussionBadge.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscussionBadge } from './DiscussionBadge'
import type { DiscussionItem } from '@/lib/discussionItems'

const items: DiscussionItem[] = [
  { id: 'a', title: 'Check finances with Iris', note: null },
  { id: 'b', title: 'Plan trip', note: 'flights vs train' },
]

describe('DiscussionBadge', () => {
  it('shows the count', () => {
    render(<DiscussionBadge items={items} onSelectItem={vi.fn()} />)
    expect(screen.getByText('2 to discuss')).toBeInTheDocument()
  })

  it('opens a popover listing items and selects on click', () => {
    const onSelectItem = vi.fn()
    render(<DiscussionBadge items={items} onSelectItem={onSelectItem} />)
    fireEvent.click(screen.getByRole('button', { name: /to discuss/i }))
    fireEvent.click(screen.getByText('Check finances with Iris'))
    expect(onSelectItem).toHaveBeenCalledWith('task-a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/DiscussionBadge.test.tsx`
Expected: FAIL — cannot resolve `./DiscussionBadge`.

- [ ] **Step 3: Implement the component**

Create `src/components/schedule/DiscussionBadge.tsx`:

```tsx
import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import type { DiscussionItem } from '@/lib/discussionItems'

interface DiscussionBadgeProps {
  items: DiscussionItem[]
  /** Open a flagged task's detail view. Receives the item id namespaced as `task-<id>`. */
  onSelectItem: (id: string) => void
}

/**
 * Glanceable "N to discuss" badge for the Today stats row. Replaces the
 * old right-rail ForDiscussion panel. Renders nothing when there is nothing
 * to discuss (caller also gates, but guard here too).
 */
export function DiscussionBadge({ items, onSelectItem }: DiscussionBadgeProps) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
        aria-label={`${items.length} to discuss`}
      >
        <MessageSquare className="w-4 h-4 text-amber-500" />
        {items.length} to discuss
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 w-72 bg-white rounded-xl border border-neutral-200 shadow-lg p-2"
          onMouseLeave={() => setOpen(false)}
        >
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => { onSelectItem(`task-${item.id}`); setOpen(false) }}
                  className="w-full flex items-start gap-2 text-left rounded-md px-2 py-1.5 hover:bg-neutral-50"
                >
                  <MessageSquare className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-neutral-800 leading-tight truncate">{item.title}</p>
                    {item.note && (
                      <p className="text-[12px] text-neutral-500 leading-snug line-clamp-2 mt-0.5">{item.note}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/DiscussionBadge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/DiscussionBadge.tsx src/components/schedule/DiscussionBadge.test.tsx
git commit -m "feat(today): add DiscussionBadge (replaces rail For Discussion panel)"
```

---

### Task 5: Wire the badge into the stats row

**Files:**
- Modify: `src/components/schedule/StatsRow.tsx`
- Modify: `src/components/schedule/TodayView.tsx`
- Test: `src/components/schedule/TodayView.test.tsx`

- [ ] **Step 1: Add a `discussionTrigger` slot to StatsRow**

In `src/components/schedule/StatsRow.tsx`, add to `StatsRowProps`:

```tsx
  /** Glanceable "N to discuss" badge, rendered among the stats. */
  discussionTrigger?: React.ReactNode
```

Add `discussionTrigger` to the destructured params, and render it after the Clarity span (before `endControls`):

```tsx
      {discussionTrigger && (
        <span className="hidden md:inline-flex items-center gap-1.5">
          {discussionTrigger}
        </span>
      )}
```

- [ ] **Step 2: Add a failing TodayView test**

In `src/components/schedule/TodayView.test.tsx`, add a test that a discussion-flagged task surfaces the badge. Reuse the file's existing render helper/fixture pattern; the key assertion:

```tsx
  it('shows the discussion badge when a task needs discussion', () => {
    // render Today with a task that has needsDiscussion: true (use the file's
    // existing render helper; add `needsDiscussion: true` to one task fixture)
    // then:
    expect(screen.getByText(/to discuss/i)).toBeInTheDocument()
  })
```

(Match the existing test's fixture/render approach in this file — add one task with `needsDiscussion: true, completed: false` and assert the badge text appears.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/TodayView.test.tsx`
Expected: FAIL — no `/to discuss/i` text (badge not wired yet).

- [ ] **Step 4: Compute items and pass the badge into StatsRow**

In `src/components/schedule/TodayView.tsx`:

Add imports:

```tsx
import { discussionItems } from '@/lib/discussionItems'
import { DiscussionBadge } from './DiscussionBadge'
```

Compute the items (near other derived values, after `tasks` is in scope):

```tsx
  const discussion = discussionItems(tasks)
```

Pass the trigger into the existing `<StatsRow ... />` (it begins at line ~443) by adding this prop alongside `clarityTrigger`/`weekTrigger`:

```tsx
          discussionTrigger={discussion.length > 0 ? <DiscussionBadge items={discussion} onSelectItem={onSelectItem} /> : undefined}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/TodayView.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/StatsRow.tsx src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): surface For Discussion as a stats-row badge"
```

---

### Task 6: Center the timeline

**Files:**
- Modify: `src/components/schedule/TodayView.tsx:439`

- [ ] **Step 1: Center the content container**

Replace line 439:

```tsx
    <div className="max-w-[940px] w-full px-0 py-2 md:pl-10 md:pr-8 md:py-8">
```

with (centered, symmetric padding — keep the readable max width, don't widen):

```tsx
    <div className="max-w-[940px] w-full mx-auto px-0 py-2 md:px-8 md:py-8">
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/TodayView.tsx
git commit -m "feat(today): center the timeline (rail space reclaimed)"
```

---

### Task 7: Remove the rail from AppShell + App.tsx

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/App.tsx:1518-1519`

- [ ] **Step 1: Remove the rail `<aside>` and the show-scratchpad tab**

In `src/components/layout/AppShell.tsx`, delete the entire `{scratchpadVisible && ( <aside ...> <TodayRail .../> </aside> )}` block (the "Today rail" comment + aside, ~lines 571–597) AND the `{scratchpadSlot && scratchpadHidden && ( <button ...> <PanelRightOpen/> </button> )}` show-scratchpad tab block (~lines 599–608).

- [ ] **Step 2: Remove the rail margin branch**

In the `<main>` `style` `marginRight` ternary, delete the line:

```tsx
                : scratchpadVisible ? '380px'
```

(so when no detail/chat/focus panel is open, `marginRight` falls through to `'0'`).

- [ ] **Step 3: Remove now-dead rail state and props**

- Delete the two derived consts:
  ```tsx
  const scratchpadSlot = !isMobile && !rightPanelVisible && activeView === 'today'
  const scratchpadVisible = scratchpadSlot && !scratchpadHidden
  ```
- Delete the `useScratchpadHidden()` line (`const { hidden: scratchpadHidden, setHidden: setScratchpadHidden } = useScratchpadHidden()`).
- Remove the `railFamilyMembers` and `onRailSelectTask` entries from the props interface (~lines 79, 81) and the destructured params (~lines 140, 141).

- [ ] **Step 4: Remove the now-orphaned props passed from App.tsx**

In `src/App.tsx`, delete the two lines (1518–1519):

```tsx
      railFamilyMembers={familyMembers}
      onRailSelectTask={(taskId) => {
```

…and the rest of that `onRailSelectTask` arrow body/closing through its `}}`. (Inspect the few lines after 1519 to remove the complete prop.)

- [ ] **Step 5: Let the compiler/linter find remaining orphans, then clean them**

Run: `npx tsc --noEmit`
Then: `npm run lint 2>&1 | rg "AppShell|App.tsx"`
Remove any now-unused imports/vars they flag — expected candidates: `import { TodayRail } ...` (line 4), `import { useScratchpadHidden } ...` (line 5), and the `PanelRightOpen` import if it was only used by the show-scratchpad tab. (Only remove imports the tools report as unused; `onOpenMember`/`onPinNavigate` may still be used elsewhere — leave anything still referenced.)
Expected after cleanup: `tsc` clean, no new lint errors in these two files.

- [ ] **Step 6: Verify the app still renders without the rail**

Run: `npx vitest run src/App.test.tsx src/components/schedule/TodayView.test.tsx`
Expected: PASS.
Also confirm no stray references remain:
Run: `rg -n "TodayRail|scratchpadVisible|scratchpadSlot|railFamilyMembers|onRailSelectTask" src/components/layout/AppShell.tsx src/App.tsx`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/AppShell.tsx src/App.tsx
git commit -m "feat(today): remove the right rail from AppShell"
```

---

### Task 8: Delete the dead rail components

Now that nothing renders the rail, delete the rail-only components. `ForDiscussion`'s data source (`lib/discussionItems`) stays — only the component goes.

**Files (delete):**
- `src/components/today/TodayRail.tsx`
- `src/components/today/AtAGlance.tsx` + `src/components/today/AtAGlance.test.tsx`
- `src/components/today/FamilySnapshot.tsx` (+ test if present)
- `src/components/today/ActiveProjects.tsx` (+ test if present)
- `src/components/today/ForDiscussion.tsx` (+ test if present)

- [ ] **Step 1: Re-verify each is unused before deleting (guard against parallel sessions)**

Run:
```bash
for c in TodayRail AtAGlance FamilySnapshot ActiveProjects ForDiscussion; do
  echo "--- $c ---"; rg -l "\b$c\b" src -g '*.tsx' -g '*.ts' | grep -v "/$c\.\(tsx\|ts\)$" | grep -v "/$c\.test\."
done
```
Expected: no importers for any of them (only self/test). If any other importer appears, STOP and report — do not delete.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/today/TodayRail.tsx \
       src/components/today/AtAGlance.tsx src/components/today/AtAGlance.test.tsx \
       src/components/today/FamilySnapshot.tsx \
       src/components/today/ActiveProjects.tsx \
       src/components/today/ForDiscussion.tsx
```
(If `FamilySnapshot.test.tsx` / `ActiveProjects.test.tsx` / `ForDiscussion.test.tsx` exist, include them in the `git rm`. Run `ls src/components/today/` first to confirm exact files.)

- [ ] **Step 3: Typecheck + full suite (confirm no dangling imports)**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx vitest run`
Expected: PASS (deleting `AtAGlance.test.tsx` etc. removes those tests; no other file should import the deleted components).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(today): delete dead rail components"
```

---

### Task 9: Full verification + push

- [ ] **Step 1: Strict build (Vercel-equivalent)**

Run: `npm run build`
Expected: builds clean (no `tsc -b` errors).

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: PASS (a known-flaky `useNotes` test may need one re-run).

- [ ] **Step 3: Lint (no new errors)**

Run: `npm run lint`
Expected: no NEW errors in touched files. (Pre-existing errors in `supabase/functions/extract-capture/lib/whatsapp.ts` are unrelated — ignore.)

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/delete-rail
```

- [ ] **Step 5: Report back for the merge-to-main decision**

Do NOT merge to `main` automatically (auto-deploys to prod). Surface the branch + preview for review; merge only on explicit approval.

---

## Self-Review

**Spec coverage:**
- Weekend labels show resolved date in both pickers → Tasks 1–3. ✅
- Delete rail (aside + margin + dead state/props) → Task 7. ✅
- Center timeline (don't widen) → Task 6. ✅
- For Discussion → stats-row badge, hidden when empty, popover→TapContextPanel via `task-<id>` select → Tasks 4–5. ✅
- Delete dead components (TodayRail, AtAGlance, FamilySnapshot, ActiveProjects, ForDiscussion) → Task 8. ✅
- Keep `ScratchpadPane`, `useScratchpadHidden`, `lib/discussionItems` → none are deleted (Task 8 deletes only the 5 named; Task 7 removes AppShell's *usage* of `useScratchpadHidden`, not the hook). ✅
- Mobile unchanged → rail blocks are desktop-only (`!isMobile`); no mobile code touched. ✅
- New shell / blank-Today / assistant → untouched (out of scope). ✅

**Placeholder scan:** No TBD/TODO. Task 5 Step 2 references "the file's existing render helper" rather than inlining a full fixture — this is deliberate (the test file has an established harness the engineer must match); the assertion and the required fixture change (`needsDiscussion: true`) are explicit.

**Type/name consistency:** `formatShortDate(date: Date): string` defined in Task 1, used identically in Tasks 2–3. `DiscussionBadge` props `{ items: DiscussionItem[]; onSelectItem: (id: string) => void }` defined in Task 4, used identically in Task 5. `discussionItems(tasks)` matches the real signature. `onSelectItem('task-<id>')` namespacing matches the existing `onSelectItem(\`task-${taskId}\`)` pattern in TodayView. `discussionTrigger` prop name consistent across Task 5 Steps 1 and 4.
