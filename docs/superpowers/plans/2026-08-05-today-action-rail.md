# Today Action Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six conditional trailing controls on a Today row with one fixed four-slot action rail, so the right edge of the page forms real columns.

**Architecture:** A new `RowActionRail` component owns a 4-cell CSS grid (28px cells, 4px gap) rendered unconditionally on every row. Slot 1 holds the row type's single verb (reschedule / skip / start meeting), slot 2 the overflow menu, slot 3 context, slot 4 assignee. Empty slots render as spacers so columns hold across row types. Promote-to-project and the discussion picker move into the overflow menu; the discussion *flag* moves to the title chip cluster, per the spec's rule that the title carries state and the rail carries actions.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-05-today-action-rail-design.md`

## Global Constraints

- Node must be **22.14.0** for tests. Run `node -v` first; if wrong, `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- `npm test` is **watch mode**. Always use `npx vitest run`.
- `npx tsc --noEmit` at the repo root is a **no-op**. Always use `npx tsc --noEmit -p tsconfig.app.json`.
- All work happens in the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/today-action-rail` on branch `today-action-rail`. Never edit or commit in the main worktree.
- No emoji in UI copy — lucide icons only.
- Rail cell size is exactly **28px** (`w-7 h-7`), gap exactly **4px** (`gap-1`). Icons inside are `w-4 h-4`.
- Scope is `ScheduleItem` only. Do not modify `InboxTaskCard`, `DenseInboxRow`, or `UpNextHero`.
- `ContextPicker` and `DiscussionPicker` are shared with `InboxTaskCard`; every change to them must default to current behaviour.

---

### Task 1: ContextPicker gets a size prop

`ContextPicker` is `p-2` + `w-5 h-5` = 36px. The rail needs 28px. It is shared with `InboxTaskCard` and `BulkActionToolbar`, so the new size must be opt-in.

**Files:**
- Modify: `src/components/triage/ContextPicker.tsx:5-8` (props), `:116-133` (trigger)
- Test: `src/components/triage/ContextPicker.test.tsx` (create)

**Interfaces:**
- Produces: `ContextPickerProps` gains `size?: 'sm' | 'md'`, default `'md'`. `'sm'` renders a `p-1.5` button with a `w-4 h-4` icon (28px box); `'md'` is today's `p-2` + `w-5 h-5` (36px box).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@/test/test-utils'
import { ContextPicker } from './ContextPicker'

describe('ContextPicker sizing', () => {
  it('defaults to the 36px trigger so existing call sites are unchanged', () => {
    const { getByLabelText } = render(<ContextPicker onChange={() => {}} />)
    expect(getByLabelText('Set context').className).toContain('p-2')
    expect(getByLabelText('Set context').querySelector('svg')?.getAttribute('class')).toContain('w-5')
  })

  it('renders a 28px trigger at size="sm" so it fits a rail cell', () => {
    const { getByLabelText } = render(<ContextPicker size="sm" onChange={() => {}} />)
    expect(getByLabelText('Set context').className).toContain('p-1.5')
    expect(getByLabelText('Set context').querySelector('svg')?.getAttribute('class')).toContain('w-4')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/triage/ContextPicker.test.tsx`
Expected: the `size="sm"` case FAILS — the prop does not exist, so the trigger still renders `p-2`.

- [ ] **Step 3: Implement**

In the props interface:

```tsx
interface ContextPickerProps {
  value?: TaskContext | null
  onChange: (context: TaskContext | undefined) => void
  /** 'sm' = 28px box for the Today action rail. 'md' (default) = 36px, every other call site. */
  size?: 'sm' | 'md'
}
```

In the signature: `export function ContextPicker({ value, onChange, size = 'md' }: ContextPickerProps) {`

Just above the `return`:

```tsx
  const isSmall = size === 'sm'
  const padClass = isSmall ? 'p-1.5' : 'p-2'
  const iconClass = isSmall ? 'w-4 h-4' : 'w-5 h-5'
```

Then in the trigger, replace `p-2` with `${padClass}` and `className="w-5 h-5 transition-colors"` with `` className={`${iconClass} transition-colors`} ``.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/triage/ContextPicker.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/triage/ContextPicker.tsx src/components/triage/ContextPicker.test.tsx
git commit -m "feat(triage): give ContextPicker an opt-in 28px size"
```

---

### Task 2: Extract DiscussionPopover from DiscussionPicker

The overflow menu needs the discussion note UI without the icon trigger, exactly as it already does for `WaitingForPopover`. `DiscussionPicker` stays intact because `InboxTaskCard:193` still uses it.

**Files:**
- Create: `src/components/triage/DiscussionPopover.tsx`
- Modify: `src/components/triage/DiscussionPicker.tsx:49-88` (render the extracted body)
- Modify: `src/components/triage/index.ts` (export)
- Test: `src/components/triage/DiscussionPopover.test.tsx` (create)

**Interfaces:**
- Produces: `DiscussionPopover({ flagged, note, onChange, onClose })` — `onChange: (next: { flagged: boolean; note: string }) => void`, `onClose: () => void`. Renders the panel body only, positioned `absolute right-0 top-full mt-1 z-50`. Auto-flags when the user types into an unflagged note, matching current behaviour.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { DiscussionPopover } from './DiscussionPopover'

describe('DiscussionPopover', () => {
  it('auto-flags when the user types a note on an unflagged item', () => {
    const onChange = vi.fn()
    const { getByPlaceholderText } = render(
      <DiscussionPopover flagged={false} note="" onChange={onChange} onClose={() => {}} />
    )
    fireEvent.change(getByPlaceholderText("What's the question?"), { target: { value: 'which vendor?' } })
    expect(onChange).toHaveBeenCalledWith({ flagged: true, note: 'which vendor?' })
  })

  it('clearing unflags, empties the note, and closes', () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    const { getByText } = render(
      <DiscussionPopover flagged note="which vendor?" onChange={onChange} onClose={onClose} />
    )
    fireEvent.click(getByText('Clear'))
    expect(onChange).toHaveBeenCalledWith({ flagged: false, note: '' })
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/triage/DiscussionPopover.test.tsx`
Expected: FAIL — cannot resolve `./DiscussionPopover`.

- [ ] **Step 3: Create the component**

```tsx
import { useEffect, useRef } from 'react'

interface DiscussionPopoverProps {
  flagged: boolean
  note: string
  onChange: (next: { flagged: boolean; note: string }) => void
  onClose: () => void
}

/**
 * The "needs discussion" panel body, with no trigger of its own. Split out of
 * DiscussionPicker so ScheduleItemActionsMenu can open it as a menu item —
 * the same shape WaitingForPopover already has.
 */
export function DiscussionPopover({ flagged, note, onChange, onClose }: DiscussionPopoverProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (flagged && textareaRef.current) textareaRef.current.focus()
  }, [flagged])

  return (
    <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-3 min-w-[260px]">
      <label className="flex items-center gap-2 text-sm text-neutral-700 mb-2">
        <input
          type="checkbox"
          checked={flagged}
          onChange={(e) => onChange({ flagged: e.target.checked, note })}
          className="rounded"
        />
        <span>Needs discussion</span>
      </label>
      <textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => {
          // If user starts typing in an unflagged state, auto-flag.
          const nextFlagged = flagged || e.target.value.length > 0
          onChange({ flagged: nextFlagged, note: e.target.value })
        }}
        placeholder="What's the question?"
        rows={3}
        className={`w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-200
                   focus:outline-none focus:ring-2 focus:ring-primary-500 ${flagged ? '' : 'opacity-60'}`}
      />
      {flagged && (
        <>
          <div className="border-t border-neutral-100 my-2" />
          <button
            onClick={() => { onChange({ flagged: false, note: '' }); onClose() }}
            className="w-full px-3 py-1.5 text-sm text-left rounded-lg hover:bg-red-50 text-red-600"
          >
            Clear
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Rewire DiscussionPicker to use it**

Replace the whole `{isOpen && ( ... )}` block (lines 49-88) with:

```tsx
      {isOpen && (
        <DiscussionPopover
          flagged={flagged}
          note={note}
          onChange={onChange}
          onClose={() => setIsOpen(false)}
        />
      )}
```

Add `import { DiscussionPopover } from './DiscussionPopover'`. Delete the now-unused `textareaRef` and the focus `useEffect` at lines 13 and 29-33 — `DiscussionPopover` owns focus now. Keep `containerRef` and the outside-click effect.

- [ ] **Step 5: Export it**

In `src/components/triage/index.ts`, after the `DiscussionPicker` line:

```ts
export { DiscussionPopover } from './DiscussionPopover'
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/components/triage/DiscussionPopover.test.tsx src/components/schedule/InboxTaskCard.test.tsx`
Expected: PASS. `InboxTaskCard` must still pass untouched — that is the regression guard for the shared component.

- [ ] **Step 7: Commit**

```bash
git add src/components/triage/DiscussionPopover.tsx src/components/triage/DiscussionPopover.test.tsx src/components/triage/DiscussionPicker.tsx src/components/triage/index.ts
git commit -m "refactor(triage): split DiscussionPopover out of DiscussionPicker"
```

---

### Task 3: Overflow menu absorbs promote and discussion

The two promote components own their modals internally. If their menu item lived inside the menu's `{open && ...}` block, closing the menu would unmount the modal. So the menu owns the open-state and renders the modals as siblings — exactly the `waitingOpen` / `WaitingForPopover` pattern already in this file.

**Files:**
- Modify: `src/components/schedule/PromoteTaskToProjectButton.tsx:66` (export the modal)
- Modify: `src/components/schedule/PromoteToProjectButton.tsx:83` (export the modal)
- Modify: `src/components/schedule/ScheduleItemActionsMenu.tsx`
- Test: `src/components/schedule/ScheduleItemActionsMenu.test.tsx` (extend)

**Interfaces:**
- Consumes: `DiscussionPopover` from Task 2.
- Produces: `ScheduleItemActionsMenu` props gain `onUpdateDiscussion?: (next: { needsDiscussion: boolean; discussionNote?: string }) => void`. Exports `ConvertTaskModal({ item, onClose })` and `PromoteToProjectModal({ item, onClose })`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/schedule/ScheduleItemActionsMenu.test.tsx`:

```tsx
  it('offers convert-to-project for an unlinked task', () => {
    const { getByLabelText, getByText } = renderMenu({ ...baseTask, projectId: null })
    fireEvent.click(getByLabelText('Item actions'))
    expect(getByText('Convert to project')).toBeInTheDocument()
  })

  it('offers view-project instead when the task is already linked', () => {
    const { getByLabelText, getByText, queryByText } = renderMenu({ ...baseTask, projectId: 'proj-1' })
    fireEvent.click(getByLabelText('Item actions'))
    expect(getByText('View project')).toBeInTheDocument()
    expect(queryByText('Convert to project')).toBeNull()
  })

  it('opens the discussion popover from the menu and reports the flag', () => {
    const onUpdateDiscussion = vi.fn()
    const { getByLabelText, getByText, getByPlaceholderText } = renderMenu(baseTask, { onUpdateDiscussion })
    fireEvent.click(getByLabelText('Item actions'))
    fireEvent.click(getByText('Flag for discussion…'))
    fireEvent.change(getByPlaceholderText("What's the question?"), { target: { value: 'ask Iris' } })
    expect(onUpdateDiscussion).toHaveBeenCalledWith({ needsDiscussion: true, discussionNote: 'ask Iris' })
  })
```

Adapt `renderMenu` to the helper already in that file — it must accept an optional second argument of extra props and spread them onto `ScheduleItemActionsMenu`. Read the file's existing helper before writing this; do not invent a new one.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/schedule/ScheduleItemActionsMenu.test.tsx`
Expected: the three new cases FAIL — no such menu items.

- [ ] **Step 3: Export the two modals**

In `PromoteTaskToProjectButton.tsx` change `function ConvertTaskModal` to `export function ConvertTaskModal`.
In `PromoteToProjectButton.tsx` change `function PromoteToProjectModal` to `export function PromoteToProjectModal`.

- [ ] **Step 4: Add the menu items**

In `ScheduleItemActionsMenu.tsx`, extend `Props`:

```tsx
interface Props {
  item: TimelineItem
  /** Opens the full detail panel. */
  onOpenDetail: () => void
  /** Tasks only — flag/unflag "needs discussion" and edit the note. */
  onUpdateDiscussion?: (next: { needsDiscussion: boolean; discussionNote?: string }) => void
}
```

Add state next to `waitingOpen`:

```tsx
  const [discussionOpen, setDiscussionOpen] = useState(false)
  const [promoteOpen, setPromoteOpen] = useState(false)
```

Add these menu items inside the `role="menu"` div, after the existing "Edit details" / "Reschedule" item:

```tsx
            {/* Promote to project — moved off the row, where it cost a full
                rail column for a rarely-taken action. */}
            {(isTask || isEvent) && (
              item.projectId ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={run(() => ctx.onOpenProject?.(item.projectId!))}
                  className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <FolderOpen className="w-4 h-4 text-neutral-400" />
                  View project
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); setPromoteOpen(true) }}
                  className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <FolderPlus className="w-4 h-4 text-neutral-400" />
                  {isTask ? 'Convert to project' : 'Promote to project'}
                </button>
              )
            )}

            {/* Needs discussion — the flag itself shows in the title cluster;
                this is where you set it. */}
            {isTask && onUpdateDiscussion && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); setOpen(false); setDiscussionOpen(true) }}
                className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <MessageCircle className={`w-4 h-4 ${item.needsDiscussion ? 'text-primary-500' : 'text-neutral-400'}`} />
                {item.needsDiscussion ? 'Edit discussion note' : 'Flag for discussion…'}
              </button>
            )}
```

Add the siblings, next to the existing `{waitingOpen && ...}` block:

```tsx
      {discussionOpen && onUpdateDiscussion && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => { e.stopPropagation(); setDiscussionOpen(false) }}
          />
          <DiscussionPopover
            flagged={item.needsDiscussion ?? false}
            note={item.discussionNote ?? ''}
            onChange={({ flagged, note }) => onUpdateDiscussion({
              needsDiscussion: flagged,
              discussionNote: flagged ? note : undefined,
            })}
            onClose={() => setDiscussionOpen(false)}
          />
        </>
      )}

      {promoteOpen && isTask && (
        <ConvertTaskModal item={item} onClose={() => setPromoteOpen(false)} />
      )}
      {promoteOpen && isEvent && (
        <PromoteToProjectModal item={item} onClose={() => setPromoteOpen(false)} />
      )}
```

Update the imports:

```tsx
import { MoreHorizontal, Redo2, Clock, Trash2, CalendarCog, Hourglass, FolderPlus, FolderOpen, MessageCircle } from 'lucide-react'
import { DiscussionPopover } from '@/components/triage'
import { ConvertTaskModal } from './PromoteTaskToProjectButton'
import { PromoteToProjectModal } from './PromoteToProjectButton'
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/schedule/ScheduleItemActionsMenu.test.tsx`
Expected: PASS, including the three new cases.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/ScheduleItemActionsMenu.tsx src/components/schedule/ScheduleItemActionsMenu.test.tsx src/components/schedule/PromoteTaskToProjectButton.tsx src/components/schedule/PromoteToProjectButton.tsx
git commit -m "feat(today): move promote-to-project and discussion into the row menu"
```

---

### Task 4: Build RowActionRail

**Files:**
- Create: `src/components/schedule/RowActionRail.tsx`
- Test: `src/components/schedule/RowActionRail.test.tsx` (create)

**Interfaces:**
- Consumes: `ContextPicker` `size="sm"` from Task 1; `ScheduleItemActionsMenu` with `onUpdateDiscussion` from Task 3.
- Produces:

```tsx
interface RowActionRailProps {
  item: TimelineItem
  variant: 'full' | 'minimal'
  onSelect: () => void
  onContextChange?: (context: TaskContext | undefined) => void
  onUpdateDiscussion?: (next: { needsDiscussion: boolean; discussionNote?: string }) => void
  onAssign?: (memberId: string | null) => void
  onAssignAll?: (memberIds: string[]) => void
  familyMembers: FamilyMember[]
  assignedTo?: string | null
  assignedToAll: string[]
}
export function RowActionRail(props: RowActionRailProps): JSX.Element
```

`StartMeetingButton` and `SkipRoutineButton` move here from `ScheduleItem.tsx:176-232` verbatim, except each drops `opacity-0 group-hover:opacity-100`/`shrink-0` from its own class string — the rail cell now owns layout, and the verb slot is always visible.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@/test/test-utils'
import { RowActionRail } from './RowActionRail'
import type { TimelineItem } from '@/types/timeline'

vi.mock('@/contexts/ScheduleActionsContext', () => ({
  useScheduleActionsContext: () => ({
    onStartMeeting: vi.fn(),
    onSkipRoutine: vi.fn(),
    onOpenProject: vi.fn(),
    projectsMap: new Map(),
  }),
  ScheduleActionsProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const base: TimelineItem = { /* copy the baseTask literal from ScheduleItem.test.tsx */ } as TimelineItem

function renderRail(item: Partial<TimelineItem>, variant: 'full' | 'minimal' = 'full') {
  return render(
    <RowActionRail
      item={{ ...base, ...item } as TimelineItem}
      variant={variant}
      onSelect={() => {}}
      onContextChange={() => {}}
      onUpdateDiscussion={() => {}}
      onAssignAll={() => {}}
      familyMembers={[]}
      assignedToAll={[]}
    />
  )
}

describe('RowActionRail', () => {
  const cells = (c: HTMLElement) => c.querySelectorAll('[data-rail-slot]')

  it('renders exactly four slots for a task', () => {
    const { container } = renderRail({ type: 'task' })
    expect(cells(container)).toHaveLength(4)
  })

  it('renders exactly four slots for a routine on the minimal variant', () => {
    const { container } = renderRail({ type: 'routine', id: 'routine-1' }, 'minimal')
    expect(cells(container)).toHaveLength(4)
  })

  it('renders exactly four slots for a timed event', () => {
    const { container } = renderRail({ type: 'event', id: 'event-1', allDay: false })
    expect(cells(container)).toHaveLength(4)
  })

  it('renders exactly four slots for a completed task', () => {
    const { container } = renderRail({ type: 'task', completed: true })
    expect(cells(container)).toHaveLength(4)
  })

  it('puts reschedule in the verb slot for an open task', () => {
    const { container } = renderRail({ type: 'task' })
    expect(cells(container)[0].querySelector('[aria-label="Reschedule"]')).toBeTruthy()
  })

  it('puts skip in the verb slot for an open routine', () => {
    const { container } = renderRail({ type: 'routine', id: 'routine-1' })
    expect(cells(container)[0].querySelector('[aria-label="Skip today"]')).toBeTruthy()
  })

  it('leaves the verb slot empty on a completed task', () => {
    const { container } = renderRail({ type: 'task', completed: true })
    expect(cells(container)[0].querySelector('button')).toBeNull()
  })
})
```

Check `RescheduleButton`'s actual `aria-label` before asserting on it and use the real string.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/schedule/RowActionRail.test.tsx`
Expected: FAIL — cannot resolve `./RowActionRail`.

- [ ] **Step 3: Implement**

```tsx
import { Video, CircleSlash } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { ContextPicker } from '@/components/triage'
import { MultiAssigneeDropdown, AssigneeDropdown } from '@/components/family'
import { RescheduleButton } from './RescheduleButton'
import { ScheduleItemActionsMenu } from './ScheduleItemActionsMenu'

/**
 * The row's trailing controls, as a FIXED four-cell grid.
 *
 * Every cell is 28px and every gap is 4px on every row, whatever the row's
 * type — empty cells render as spacers rather than collapsing. That is the
 * whole point: these controls used to be six conditional flex siblings, so a
 * task showed six, an event five, a routine three, and nothing lined up down
 * the page. Reserve the shape and the columns hold.
 *
 * Slot order is fixed: verb | overflow | context | assignee. Exactly one verb
 * exists per row type (task reschedules, routine skips, timed event starts),
 * so they share one slot without ever competing for it.
 */

const SLOT = 'w-7 h-7 flex items-center justify-center'

function StartMeetingButton({ item }: { item: TimelineItem }) { /* moved from ScheduleItem.tsx:176-204, minus the opacity/shrink classes */ }
function SkipRoutineButton({ item }: { item: TimelineItem }) { /* moved from ScheduleItem.tsx:211-232, minus the shrink class */ }

export function RowActionRail({ item, variant, onSelect, onContextChange, onUpdateDiscussion, onAssign, onAssignAll, familyMembers, assignedTo, assignedToAll }: RowActionRailProps) {
  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isEvent = item.type === 'event'
  const isOpen = !item.completed && !item.skipped

  const verb =
    isTask && !item.completed && variant !== 'minimal' ? <RescheduleButton item={item} />
    : isRoutine && isOpen ? <SkipRoutineButton item={item} />
    : isEvent && isOpen && !item.allDay ? <StartMeetingButton item={item} />
    : null

  const menu = variant !== 'minimal' && (isTask || isRoutine || isEvent)
    ? <ScheduleItemActionsMenu item={item} onOpenDetail={onSelect} onUpdateDiscussion={onUpdateDiscussion} />
    : null

  const context = onContextChange ? (
    <div
      className={isEvent || item.context ? 'transition-opacity' : 'opacity-0 group-hover:opacity-100 transition-opacity'}
      onClick={(e) => e.stopPropagation()}
    >
      <ContextPicker size="sm" value={item.context ?? undefined} onChange={onContextChange} />
    </div>
  ) : null

  const who = familyMembers.length > 0 && onAssignAll ? (
    <div onClick={(e) => e.stopPropagation()}>
      <MultiAssigneeDropdown
        members={familyMembers}
        selectedIds={assignedToAll}
        onSelect={onAssignAll}
        size="sm"
        label={isEvent ? "Who's attending?" : "Who's responsible?"}
      />
    </div>
  ) : familyMembers.length > 0 && onAssign ? (
    <div onClick={(e) => e.stopPropagation()}>
      <AssigneeDropdown members={familyMembers} selectedId={assignedTo} onSelect={onAssign} size="sm" />
    </div>
  ) : null

  return (
    <div className="shrink-0 flex items-center gap-1">
      {[verb, menu, context, who].map((slot, i) => (
        <div key={i} data-rail-slot className={SLOT}>{slot}</div>
      ))}
    </div>
  )
}
```

Copy the two moved button bodies verbatim from `ScheduleItem.tsx`; do not retype them from memory. Import `AssigneeDropdown` from wherever `ScheduleItem.tsx` currently imports it — check that import line rather than assuming.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/schedule/RowActionRail.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/RowActionRail.tsx src/components/schedule/RowActionRail.test.tsx
git commit -m "feat(today): add the fixed four-slot RowActionRail"
```

---

### Task 5: Wire the rail into ScheduleItem

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx` — delete `:176-232` (the two moved buttons), delete `:754-850` (the six trailing siblings), render `<RowActionRail>`, add the discussion indicator to the title cluster
- Test: `src/components/schedule/ScheduleItem.test.tsx` (extend)

**Interfaces:**
- Consumes: `RowActionRail` from Task 4.

- [ ] **Step 1: Write the failing test**

Add to `ScheduleItem.test.tsx`:

```tsx
  it('shows a discussion indicator in the title cluster when the task is flagged', () => {
    const { getByLabelText } = renderItem({ ...baseTask, needsDiscussion: true, discussionNote: 'ask Iris' })
    expect(getByLabelText('Needs discussion: ask Iris')).toBeInTheDocument()
  })

  it('shows no discussion indicator when the task is not flagged', () => {
    const { queryByLabelText } = renderItem({ ...baseTask, needsDiscussion: false })
    expect(queryByLabelText(/Needs discussion/)).toBeNull()
  })
```

Use the file's existing render helper. Note this file forces `useMobile: () => true`; if the indicator is desktop-only, add these cases to `ScheduleItemSkipButton.test.tsx` instead, which forces mobile off.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/schedule/ScheduleItem.test.tsx`
Expected: the two new cases FAIL — no indicator exists.

- [ ] **Step 3: Add the discussion indicator to the title cluster**

In the title chip cluster (after the coaching sparkle, before the subtask chip):

```tsx
            {/* Flagged for discussion — STATE, so it lives with the title
                chips. The control that sets it is in the row's '...' menu. */}
            {item.needsDiscussion && (
              <span
                className="hidden md:inline shrink-0 text-primary-500"
                aria-label={item.discussionNote ? `Needs discussion: ${item.discussionNote}` : 'Needs discussion'}
                title={item.discussionNote || 'Needs discussion'}
              >
                <MessageCircle className="w-3.5 h-3.5" />
              </span>
            )}
```

Add `MessageCircle` to the lucide import.

- [ ] **Step 4: Replace the trailing block**

Delete lines 754-850 entirely (`StartMeetingButton` through the closing `</div>` of the "Right indicators" group) and replace with:

```tsx
        <RowActionRail
          item={item}
          variant={variant}
          onSelect={onSelect}
          onContextChange={onContextChange}
          onUpdateDiscussion={onUpdateDiscussion}
          onAssign={onAssign}
          onAssignAll={onAssignAll}
          familyMembers={familyMembers}
          assignedTo={assignedTo}
          assignedToAll={assignedToAll}
        />
```

Then delete the two moved function definitions at 176-232 and drop the now-unused imports: `RescheduleButton`, `PromoteToProjectButton`, `PromoteTaskToProjectButton`, `ScheduleItemActionsMenu`, `ContextPicker`, `DiscussionPicker`, `MultiAssigneeDropdown`, `AssigneeDropdown`, `Video`, `CircleSlash`. Add `RowActionRail`. Let `tsc` tell you which are genuinely unused rather than guessing — several are used elsewhere in the file.

The `isSuggestedPromotion` prop becomes unused once `PromoteToProjectButton` leaves the row. Leave the prop in place (callers pass it) but do not invent a new use for it; note it in the commit message.

- [ ] **Step 5: Run the whole schedule suite**

Run: `npx vitest run src/components/schedule/`
Expected: PASS. Where a test fails because a control moved into the menu, update it to open the menu first — do not delete the assertion.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx src/components/schedule/ScheduleItem.test.tsx
git commit -m "feat(today): give every row the same four-slot action rail"
```

---

### Task 6: Full verification

Type-checks are not inspection. The complaint was visual; the fix is not done until the page has been looked at.

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: no new failures against the pre-change baseline. If anything fails, capture the baseline with `git stash` first rather than assuming it is pre-existing.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: both clean. Lint runs in CI even though the pre-push hook skips it.

- [ ] **Step 3: Look at the page**

Start `npm run dev` (port 5173) and open Today. Confirm on real rows:
- Four columns down the right edge, aligned across task, event, and routine rows.
- Even spacing across the whole rail — no 12px/2px break.
- A flagged task shows its indicator next to the title.
- Reschedule, skip, and start-meeting are still one tap.
- `⋯` contains convert/promote-to-project and the discussion item, and both still open.

Restart the dev server before trusting anything — worktree HMR corrupts across branch switches.

- [ ] **Step 4: Report**

Summarise what shipped, what moved, and anything looked at and found wanting. Do not claim the visual fix works without having looked.
