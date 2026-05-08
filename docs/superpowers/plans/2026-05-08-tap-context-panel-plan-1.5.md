# TapContextPanel Plan 1.5 — Close Daily-Use Gap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the daily-use gap on `<TapContextPanel />` so the new panel becomes a real replacement for `DetailPanelRedesign` instead of a structural demo. Adds the five most-used features that Plan 1 deliberately deferred: real Schedule popover, More menu (Pin + Delete), subtasks, rich-text notes, and links list.

**Architecture:** Add new section components alongside the existing eight, reuse already-built helpers (`SchedulePopover`, `TiptapEditor`, `pinnedItems` context, existing task hooks). No new abstractions. Plan 2 will generalize the panel to other entity types after these features stabilize.

**Tech Stack:** Same as Plan 1.

**Related:**
- Plan 1: `docs/superpowers/plans/2026-05-08-tap-context-panel-tasks.md`
- Design spec: `docs/superpowers/specs/2026-05-08-surface-design.md`

---

## File Structure

**New files:**
```
src/components/surface/sections/
├── PanelSubtasks.tsx + .test.tsx
├── PanelLinks.tsx + .test.tsx
├── PanelMoreMenu.tsx + .test.tsx
```

**Modified files:**
```
src/components/surface/
├── TapContextPanel.tsx          # adds new sections, new handlers
├── sections/
│   ├── PanelActions.tsx         # Schedule button hosts SchedulePopover
│   ├── PanelWhy.tsx             # textarea → TiptapEditor
src/App.tsx                       # wires real handlers (delete, pin, schedule, subtasks, links)
```

---

## Task 1: Real Schedule popover

Replace the Schedule button stub with the existing `SchedulePopover`. Anchored to the button.

**Files:**
- Modify: `src/components/surface/sections/PanelActions.tsx`
- Modify: `src/components/surface/sections/PanelActions.test.tsx`
- Modify: `src/components/surface/TapContextPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update PanelActions to accept current schedule + scheduling callback**

The current `onSchedule: () => void` prop signature is too narrow. Change to accept a Date.

In `src/components/surface/sections/PanelActions.tsx`, change the interface:

```tsx
interface PanelActionsProps {
  completed: boolean
  phoneNumber?: string
  scheduledFor?: Date
  isAllDay?: boolean
  onToggleComplete: () => void
  onSchedule: (date: Date, isAllDay: boolean) => void
  onClearSchedule?: () => void
  onMore: () => void
}
```

Update the Schedule button to host the `SchedulePopover`:

```tsx
import { SchedulePopover } from '@/components/triage/SchedulePopover'

// inside the component, replace the existing Schedule button:
<SchedulePopover
  value={scheduledFor}
  isAllDay={isAllDay}
  onSchedule={onSchedule}
  onClear={onClearSchedule}
>
  <button
    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
  >
    📅 Schedule
  </button>
</SchedulePopover>
```

(Confirm the `SchedulePopover` API by reading `src/components/triage/SchedulePopover.tsx` — the children-as-trigger pattern is what existing call sites use.)

- [ ] **Step 2: Update tests**

The existing test "calls onToggleComplete when Done clicked" remains unchanged. The schedule test in Plan 1 was simple; replace it with a test that the SchedulePopover trigger renders:

```tsx
it('renders Schedule trigger', () => {
  render(<PanelActions
    completed={false}
    onToggleComplete={vi.fn()}
    onSchedule={vi.fn()}
    onMore={vi.fn()}
  />)
  expect(screen.getByText(/schedule/i)).toBeInTheDocument()
})
```

(The popover's interactive behavior is tested in `SchedulePopover.test.tsx` — don't duplicate.)

- [ ] **Step 3: Run tests**

Run: `npx vitest src/components/surface/sections/PanelActions.test.tsx --run` (with PATH export)
Expected: 5 PASS (one renamed but same count).

- [ ] **Step 4: Wire scheduledFor + isAllDay through TapContextPanel**

In `src/components/surface/TapContextPanel.tsx`:

```tsx
// In TapContextPanelProps, change onSchedule signature:
onSchedule: (date: Date, isAllDay: boolean) => void
onClearSchedule?: () => void

// In the JSX, update PanelActions usage:
<PanelActions
  completed={task.completed}
  phoneNumber={task.phoneNumber || linked.contact?.phone}
  scheduledFor={task.scheduledFor || undefined}
  isAllDay={task.isAllDay}
  onToggleComplete={props.onToggleComplete}
  onSchedule={props.onSchedule}
  onClearSchedule={props.onClearSchedule}
  onMore={props.onMore}
/>
```

- [ ] **Step 5: Wire the real handler in App.tsx**

Find the existing `<TapContextPanel … onSchedule={() => {}}>` integration and replace with:

```tsx
onSchedule={(date, isAllDay) =>
  updateTask(selectedItem.originalTask!.id, {
    bucket: 'timed',
    scheduledFor: date,
    isAllDay,
  })
}
onClearSchedule={() =>
  updateTask(selectedItem.originalTask!.id, {
    bucket: 'inbox',
    scheduledFor: undefined,
    isAllDay: undefined,
  })
}
```

- [ ] **Step 6: Type-check, run full surface suite**

```bash
npx tsc --noEmit
npx vitest src/components/surface --run
```
Expected: no errors, 46 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/surface/sections/PanelActions.tsx src/components/surface/sections/PanelActions.test.tsx src/components/surface/TapContextPanel.tsx src/App.tsx
git commit -m "feat(surface): wire SchedulePopover into TapContextPanel"
```

---

## Task 2: PanelMoreMenu — Pin + Delete

Replace the More button stub with a kebab menu containing Pin/Unpin and Delete.

**Files:**
- Create: `src/components/surface/sections/PanelMoreMenu.tsx`
- Test: `src/components/surface/sections/PanelMoreMenu.test.tsx`
- Modify: `src/components/surface/sections/PanelActions.tsx`
- Modify: `src/components/surface/TapContextPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelMoreMenu.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelMoreMenu } from './PanelMoreMenu'

describe('PanelMoreMenu', () => {
  const baseProps = {
    isPinned: false,
    onTogglePin: vi.fn(),
    onDelete: vi.fn(),
  }

  it('opens menu on trigger click', async () => {
    const { user } = render(<PanelMoreMenu {...baseProps} />)
    await user.click(screen.getByLabelText('More actions'))
    expect(screen.getByText(/pin/i)).toBeInTheDocument()
    expect(screen.getByText(/delete/i)).toBeInTheDocument()
  })

  it('shows "Unpin" when isPinned is true', async () => {
    const { user } = render(<PanelMoreMenu {...baseProps} isPinned />)
    await user.click(screen.getByLabelText('More actions'))
    expect(screen.getByText(/unpin/i)).toBeInTheDocument()
  })

  it('calls onTogglePin and closes when Pin is clicked', async () => {
    const onTogglePin = vi.fn()
    const { user } = render(<PanelMoreMenu {...baseProps} onTogglePin={onTogglePin} />)
    await user.click(screen.getByLabelText('More actions'))
    await user.click(screen.getByText(/^pin$/i))
    expect(onTogglePin).toHaveBeenCalledOnce()
    // Menu should close (item not in DOM after click)
    expect(screen.queryByText(/^pin$/i)).not.toBeInTheDocument()
  })

  it('asks for confirmation before delete', async () => {
    const onDelete = vi.fn()
    const { user } = render(<PanelMoreMenu {...baseProps} onDelete={onDelete} />)
    await user.click(screen.getByLabelText('More actions'))
    await user.click(screen.getByText(/delete/i))
    expect(onDelete).not.toHaveBeenCalled() // first click → confirm prompt
    expect(screen.getByText(/confirm/i)).toBeInTheDocument()
    await user.click(screen.getByText(/confirm/i))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to confirm fail**

Run: `npx vitest src/components/surface/sections/PanelMoreMenu.test.tsx --run`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelMoreMenu.tsx
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react'

interface PanelMoreMenuProps {
  isPinned: boolean
  onTogglePin: () => void
  onDelete: () => void
}

export function PanelMoreMenu({ isPinned, onTogglePin, onDelete }: PanelMoreMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function close() {
    setOpen(false)
    setConfirming(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(prev => !prev)}
        aria-label="More actions"
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] bg-white rounded-xl border border-neutral-200 shadow-lg p-1.5 min-w-[170px]"
          style={{ top: pos.top, right: pos.right }}
        >
          <button
            onClick={() => { onTogglePin(); close() }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            <span>{isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
          <div className="border-t border-neutral-100 my-1" />
          {confirming ? (
            <button
              onClick={() => { onDelete(); close() }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors font-semibold"
            >
              <Trash2 className="w-4 h-4" />
              <span>Confirm delete</span>
            </button>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
```

- [ ] **Step 4: Run tests, expect 4 PASS**

Run: `npx vitest src/components/surface/sections/PanelMoreMenu.test.tsx --run`

- [ ] **Step 5: Replace the More button in PanelActions**

In `src/components/surface/sections/PanelActions.tsx`, change the interface to remove `onMore` and instead accept the more menu props:

```tsx
interface PanelActionsProps {
  completed: boolean
  phoneNumber?: string
  scheduledFor?: Date
  isAllDay?: boolean
  isPinned: boolean
  onToggleComplete: () => void
  onSchedule: (date: Date, isAllDay: boolean) => void
  onClearSchedule?: () => void
  onTogglePin: () => void
  onDelete: () => void
}
```

Replace the `<button onClick={onMore} aria-label="More actions">···</button>` with `<PanelMoreMenu isPinned={isPinned} onTogglePin={onTogglePin} onDelete={onDelete} />`.

- [ ] **Step 6: Update PanelActions tests**

Replace the "calls onMore" assertion (no longer applies). Add a stub assertion that the PanelMoreMenu trigger renders:

```tsx
it('renders More menu trigger', () => {
  render(<PanelActions
    completed={false}
    isPinned={false}
    onToggleComplete={vi.fn()}
    onSchedule={vi.fn()}
    onTogglePin={vi.fn()}
    onDelete={vi.fn()}
  />)
  expect(screen.getByLabelText('More actions')).toBeInTheDocument()
})
```

- [ ] **Step 7: Update TapContextPanel orchestrator props**

Replace `onMore` with `isPinned`, `onTogglePin`, `onDelete` in `TapContextPanelProps`. Pass them through to PanelActions.

- [ ] **Step 8: Wire into App.tsx**

Replace the `onMore={() => {}}` line. Add the real handlers using existing `pinnedItems` context and `deleteTask`:

```tsx
isPinned={pinnedItems.isPinned('task', selectedItem.originalTask.id)}
onTogglePin={() => {
  const id = selectedItem.originalTask!.id
  if (pinnedItems.isPinned('task', id)) pinnedItems.unpin('task', id)
  else pinnedItems.pin('task', id)
}}
onDelete={() => {
  deleteTask(selectedItem.originalTask!.id)
  setSelectedItemId(null)
}}
```

(Verify the `pinnedItems` context API by reading `src/contexts/...` or searching: `grep -rn "isPinned\|pinnedItems" src/App.tsx`. Use whatever method names exist — adjust accordingly.)

- [ ] **Step 9: Type-check + full surface suite**

```bash
npx tsc --noEmit
npx vitest src/components/surface --run
```

- [ ] **Step 10: Commit**

```bash
git add src/components/surface/ src/App.tsx
git commit -m "feat(surface): PanelMoreMenu with Pin and Delete affordances"
```

---

## Task 3: PanelSubtasks section

Subtasks list + inline add. Placed after PanelWhy (about-this-task) and before PanelPeople.

**Files:**
- Create: `src/components/surface/sections/PanelSubtasks.tsx`
- Test: `src/components/surface/sections/PanelSubtasks.test.tsx`
- Modify: `src/components/surface/TapContextPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelSubtasks.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelSubtasks } from './PanelSubtasks'
import { createMockTask } from '@/test/mocks/factories'

describe('PanelSubtasks', () => {
  const handlers = {
    onToggleSubtask: vi.fn(),
    onAddSubtask: vi.fn(),
  }

  it('renders nothing when no subtasks and onAddSubtask not provided', () => {
    const { container } = render(<PanelSubtasks subtasks={[]} onToggleSubtask={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the section even when empty if onAddSubtask is provided', () => {
    render(<PanelSubtasks subtasks={[]} {...handlers} />)
    expect(screen.getByText(/subtasks/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/add a subtask/i)).toBeInTheDocument()
  })

  it('renders subtasks with completion state', () => {
    const subs = [
      createMockTask({ id: 's1', title: 'Step one', completed: false }),
      createMockTask({ id: 's2', title: 'Step two', completed: true }),
    ]
    render(<PanelSubtasks subtasks={subs} {...handlers} />)
    expect(screen.getByText('Step one')).toBeInTheDocument()
    expect(screen.getByText('Step two')).toBeInTheDocument()
  })

  it('calls onToggleSubtask when checkbox clicked', async () => {
    const onToggleSubtask = vi.fn()
    const subs = [createMockTask({ id: 's1', title: 'Step one', completed: false })]
    const { user } = render(<PanelSubtasks subtasks={subs} onToggleSubtask={onToggleSubtask} onAddSubtask={vi.fn()} />)
    await user.click(screen.getByLabelText(/mark step one/i))
    expect(onToggleSubtask).toHaveBeenCalledWith('s1')
  })

  it('calls onAddSubtask when Enter pressed in input', async () => {
    const onAddSubtask = vi.fn()
    const { user } = render(<PanelSubtasks subtasks={[]} onToggleSubtask={vi.fn()} onAddSubtask={onAddSubtask} />)
    const input = screen.getByPlaceholderText(/add a subtask/i)
    await user.type(input, 'New step{Enter}')
    expect(onAddSubtask).toHaveBeenCalledWith('New step')
  })
})
```

- [ ] **Step 2: Run tests, expect FAIL (module not found)**

Run: `npx vitest src/components/surface/sections/PanelSubtasks.test.tsx --run`

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelSubtasks.tsx
import { useState } from 'react'
import type { Task } from '@/types/task'

interface PanelSubtasksProps {
  subtasks: Task[]
  onToggleSubtask: (id: string) => void
  onAddSubtask?: (title: string) => void
}

export function PanelSubtasks({ subtasks, onToggleSubtask, onAddSubtask }: PanelSubtasksProps) {
  const [draft, setDraft] = useState('')

  if (subtasks.length === 0 && !onAddSubtask) return null

  function commit() {
    const text = draft.trim()
    if (text && onAddSubtask) {
      onAddSubtask(text)
      setDraft('')
    }
  }

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Subtasks</div>
      <div className="flex flex-col gap-1.5">
        {subtasks.map(sub => (
          <button
            key={sub.id}
            onClick={() => onToggleSubtask(sub.id)}
            aria-label={`Mark ${sub.title} ${sub.completed ? 'incomplete' : 'complete'}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-100/60 text-left"
          >
            <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] flex-shrink-0
              ${sub.completed ? 'bg-primary-600 border-primary-600 text-white' : 'border-neutral-300 text-transparent'}`}
            >
              ✓
            </span>
            <span className={`text-sm flex-1 ${sub.completed ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>
              {sub.title}
            </span>
          </button>
        ))}
        {onAddSubtask && (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
            onBlur={commit}
            placeholder="+ Add a subtask…"
            className="text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50"
          />
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run tests, expect 5 PASS**

- [ ] **Step 5: Wire into TapContextPanel**

Add the `subtasks` prop and `onToggleSubtask` / `onAddSubtask` handlers to `TapContextPanelProps`, then render `<PanelSubtasks ... />` between `<PanelWhy />` and `<PanelPeople />` in the section order.

```tsx
// In TapContextPanelProps:
onToggleSubtask: (id: string) => void
onAddSubtask: (title: string) => void

// In JSX, after PanelWhy:
<PanelSubtasks
  subtasks={task.subtasks ?? []}
  onToggleSubtask={props.onToggleSubtask}
  onAddSubtask={props.onAddSubtask}
/>
```

- [ ] **Step 6: Wire in App.tsx**

Add to the TapContextPanel call site:

```tsx
onToggleSubtask={(id) => handleToggleTask(id)}
onAddSubtask={(title) => addSubtask(selectedItem.originalTask!.id, title)}
```

(Check the actual signature of `addSubtask` in `useSupabaseTasks` — it might be `addSubtask(parentId, title)` or `addSubtask(title, parentId)`. Adjust to match.)

- [ ] **Step 7: Update existing TapContextPanel test**

Add a test verifying subtasks render:

```tsx
it('renders subtasks when present', () => {
  const sub = createMockTask({ id: 's1', title: 'Sub one', parentTaskId: 't1' })
  const task = createMockTask({ id: 't1', title: 'Parent', subtasks: [sub] })
  render(<TapContextPanel
    task={task}
    contacts={[]} projects={[]} events={[]} familyMembers={[]} siblingTaskCandidates={[]} allTasks={[task]}
    {...baseHandlers}
    onToggleSubtask={vi.fn()}
    onAddSubtask={vi.fn()}
  />)
  expect(screen.getByText('Sub one')).toBeInTheDocument()
})
```

(Add `onToggleSubtask` and `onAddSubtask` to baseHandlers.)

- [ ] **Step 8: Type-check + full surface suite**

- [ ] **Step 9: Commit**

```bash
git add src/components/surface/ src/App.tsx
git commit -m "feat(surface): PanelSubtasks with inline add"
```

---

## Task 4: Rich-text notes via TiptapEditor

Replace `PanelWhy`'s plain `<textarea>` with the existing `TiptapEditor`.

**Files:**
- Modify: `src/components/surface/sections/PanelWhy.tsx`
- Modify: `src/components/surface/sections/PanelWhy.test.tsx`

- [ ] **Step 1: Update the implementation to use TiptapEditor**

```tsx
// src/components/surface/sections/PanelWhy.tsx
import { useState, useEffect } from 'react'
import { TiptapEditor } from '@/components/notes/TiptapEditor'

interface PanelWhyProps {
  notes: string | undefined
  onChange?: (next: string) => void
  /** Override the default "Why" label. Used by Plan 2 for events ("What to bring"). */
  label?: string
}

export function PanelWhy({ notes, onChange, label = 'Why' }: PanelWhyProps) {
  const [editing, setEditing] = useState(false)

  if (!notes && !onChange) return null

  // Reset editing state when notes prop changes (e.g. switching tasks)
  useEffect(() => { setEditing(false) }, [notes])

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-1">{label}</div>
      {editing ? (
        <div className="rounded-md border border-primary-200 bg-white p-2">
          <TiptapEditor
            content={notes ?? ''}
            onChange={(html) => onChange?.(html)}
            placeholder="Add notes…"
            autoFocus
          />
        </div>
      ) : (
        <button
          onClick={() => onChange && setEditing(true)}
          disabled={!onChange}
          className="w-full text-left text-sm italic text-neutral-600 border-l-2 border-neutral-300 pl-3 py-1 hover:text-neutral-900"
        >
          {notes
            ? <div dangerouslySetInnerHTML={{ __html: notes }} className="prose-sm" />
            : <span className="not-italic text-neutral-400">Add notes…</span>}
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Update tests**

The earlier "calls onChange with new value on blur" test relied on textarea + .blur(). Tiptap's onChange fires per-keystroke so the test pattern changes. Update:

```tsx
// src/components/surface/sections/PanelWhy.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelWhy } from './PanelWhy'

describe('PanelWhy', () => {
  it('renders notes when present', () => {
    render(<PanelWhy notes="<p>ear pulling 3 days</p>" onChange={vi.fn()} />)
    expect(screen.getByText(/ear pulling 3 days/)).toBeInTheDocument()
  })

  it('renders nothing when notes are empty and onChange not given', () => {
    const { container } = render(<PanelWhy notes="" onChange={undefined as any} />)
    expect(container.firstChild).toBeNull()
  })

  it('switches to editor when clicked', async () => {
    const { user } = render(<PanelWhy notes="<p>hello</p>" onChange={vi.fn()} />)
    await user.click(screen.getByText(/hello/))
    // Tiptap mounts a contenteditable; find by role
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('does not switch to editor when read-only (no onChange)', async () => {
    const { user } = render(<PanelWhy notes="<p>hello</p>" />)
    await user.click(screen.getByText(/hello/))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest src/components/surface/sections/PanelWhy.test.tsx --run`
Expected: 4 PASS.

(If Tiptap doesn't render with role="textbox" in jsdom, fall back to `screen.getByText(/hello/)` checks plus a check on a Tiptap-specific class like `.tiptap` or `.ProseMirror`.)

- [ ] **Step 4: Type-check + full surface suite**

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelWhy.tsx src/components/surface/sections/PanelWhy.test.tsx
git commit -m "feat(surface): rich-text notes in PanelWhy via Tiptap"
```

---

## Task 5: PanelLinks section (task.links array)

Render the `task.links` array (vendor websites, articles, reservations). Inline add. Placed after PanelLinked in section order.

**Files:**
- Create: `src/components/surface/sections/PanelLinks.tsx`
- Test: `src/components/surface/sections/PanelLinks.test.tsx`
- Modify: `src/components/surface/TapContextPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/surface/sections/PanelLinks.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelLinks } from './PanelLinks'

describe('PanelLinks', () => {
  it('renders nothing when no links and onAddLink not provided', () => {
    const { container } = render(<PanelLinks links={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders links with title and url', () => {
    render(<PanelLinks
      links={[
        { url: 'https://example.com', title: 'Example' },
        { url: 'https://docs.example.com' },
      ]}
    />)
    expect(screen.getByText('Example')).toBeInTheDocument()
    expect(screen.getByText('docs.example.com')).toBeInTheDocument() // hostname when no title
  })

  it('renders empty section with add input when onAddLink provided', () => {
    render(<PanelLinks links={[]} onAddLink={vi.fn()} />)
    expect(screen.getByText(/links/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/paste a url/i)).toBeInTheDocument()
  })

  it('calls onAddLink with url after Enter', async () => {
    const onAddLink = vi.fn()
    const { user } = render(<PanelLinks links={[]} onAddLink={onAddLink} />)
    const input = screen.getByPlaceholderText(/paste a url/i)
    await user.type(input, 'https://added.com{Enter}')
    expect(onAddLink).toHaveBeenCalledWith('https://added.com')
  })
})
```

- [ ] **Step 2: Run tests, expect FAIL**

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelLinks.tsx
import { useState } from 'react'
import type { TaskLink } from '@/types/task'

interface PanelLinksProps {
  links: TaskLink[] | undefined
  onAddLink?: (url: string) => void
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function PanelLinks({ links, onAddLink }: PanelLinksProps) {
  const [draft, setDraft] = useState('')
  const list = links ?? []

  if (list.length === 0 && !onAddLink) return null

  function commit() {
    const url = draft.trim()
    if (url && onAddLink) {
      onAddLink(url)
      setDraft('')
    }
  }

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Links</div>
      {list.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-sky-100 text-sm">📎</span>
          <span className="flex-1 text-sm text-neutral-800 truncate">
            {link.title || hostname(link.url)}
          </span>
        </a>
      ))}
      {onAddLink && (
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
          onBlur={commit}
          placeholder="Paste a URL…"
          className="w-full text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50"
        />
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run tests, expect 4 PASS**

- [ ] **Step 5: Wire into TapContextPanel**

In `TapContextPanelProps` add `onAddLink: (url: string) => void`. Render `<PanelLinks links={task.links} onAddLink={props.onAddLink} />` after `<PanelLinked />`.

- [ ] **Step 6: Wire in App.tsx**

```tsx
onAddLink={(url) => {
  const t = selectedItem.originalTask!
  const next = [...(t.links ?? []), { url }]
  updateTask(t.id, { links: next })
}}
```

- [ ] **Step 7: Type-check + full surface suite**

- [ ] **Step 8: Commit**

```bash
git add src/components/surface/ src/App.tsx
git commit -m "feat(surface): PanelLinks for task.links array"
```

---

## Self-review notes

- **Spec coverage:** Tasks 1–5 close the five most-used daily-use gaps: real schedule, real more menu (Pin + Delete), subtasks, rich notes, links. Attachments, prep tasks, follow-up tasks remain deferred (Plan 1.6 or fold into Plan 2).
- **Placeholder check:** All steps include code blocks. Step 8 of Task 2 has a "verify the API" instruction but with concrete fallback grep guidance.
- **Type consistency:** `onSchedule(date, isAllDay)` signature flows through PanelActions → TapContextPanel → App.tsx. `onMore` removed everywhere; replaced by `isPinned`/`onTogglePin`/`onDelete`. `subtasks`, `onToggleSubtask`, `onAddSubtask` thread through. `onAddLink` wired top-down.
- **No ambiguity:** Section order is explicit — PanelSubtasks goes between PanelWhy and PanelPeople; PanelLinks goes after PanelLinked.
