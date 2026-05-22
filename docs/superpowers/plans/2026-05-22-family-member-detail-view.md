# Family Member Detail View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a member in the Today rail's Family Snapshot opens a per-member page (their open/upcoming tasks + read-only profile) instead of the Home Registry.

**Architecture:** A new URL-routed view `/family/:memberId` mirrors the existing `/projects/:id` and `/contacts/:id` patterns. A pure helper splits a member's tasks into open vs upcoming; a presentational `MemberView` component renders them plus a read-only profile. App.tsx owns routing/derivation; AppShell repoints the rail's member click; ViewRouter renders the view.

**Tech Stack:** React 19 + TypeScript (strict), React Router, Vitest + React Testing Library, Tailwind v4 (Nordic Journal), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-05-22-family-member-detail-view-design.md`

**Worktree:** Work happens in `.worktrees/family-member` (branch `feat/family-member-detail`), already created off current `main`.

---

## File Structure

- **Create** `src/lib/memberTasks.ts` — pure `selectMemberTasks` helper. One responsibility: task partitioning for a member.
- **Create** `src/lib/memberTasks.test.ts` — unit tests for the helper.
- **Create** `src/components/family/MemberView.tsx` — presentational page (header + tasks + profile). Takes data via props, no data fetching.
- **Create** `src/components/family/MemberView.test.tsx` — component tests.
- **Modify** `src/components/layout/Sidebar.tsx` — add `'family-member'` to the `ViewType` union.
- **Modify** `src/App.tsx` — params, `activeView`, `isUrlBased`, `selectedMember`, `handleOpenMember`; pass new props to AppShell + ViewRouter.
- **Modify** `src/components/layout/ViewRouter.tsx` — props + render block for `MemberView`.
- **Modify** `src/components/layout/AppShell.tsx` — `onOpenMember` prop; rewire `onSelectMember` and `onViewAllFamily`.

**Key field facts (verified against current code):**
- `Task` is camelCase: `assignedTo?: string` (legacy single), `assignedToAll?: string[]` (multi), `scheduledFor?: Date`, `completed: boolean`, `createdAt: Date`.
- The Family Snapshot badge (`src/lib/familySnapshot.ts`) counts **only `assignedTo`**. To keep page and badge in agreement, this feature filters on `assignedTo` only and ignores `assignedToAll`.
- `FamilyMember` (camelCase mix): `id`, `name`, `initials`, `color`, `role_label?`, `age_range?`, `allergies?: string[]`, `medications?: {name}[]`, `dietary_restrictions?: string[]`, `health_conditions?: string[]`, `mobility_needs?`, `typical_involvement?`, `is_full_user`.
- `useFamilyMembers()` exposes `members` (passed through App as `familyMembers`) and `getCurrentUserMember()`.

---

## Task 1: `selectMemberTasks` pure helper

**Files:**
- Create: `src/lib/memberTasks.ts`
- Test: `src/lib/memberTasks.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/memberTasks.test.ts
import { describe, it, expect } from 'vitest'
import { selectMemberTasks } from './memberTasks'
import type { Task } from '@/types/task'

const NOW = new Date('2026-05-22T12:00:00')

function makeTask(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'task',
    completed: false,
    createdAt: new Date('2026-01-01T00:00:00'),
    updatedAt: new Date('2026-01-01T00:00:00'),
    ...over,
  }
}

describe('selectMemberTasks', () => {
  it('includes only incomplete tasks assigned to the member', () => {
    const tasks = [
      makeTask({ id: 'mine', assignedTo: 'm1' }),
      makeTask({ id: 'others', assignedTo: 'm2' }),
      makeTask({ id: 'done', assignedTo: 'm1', completed: true }),
      makeTask({ id: 'unassigned' }),
    ]
    const { open, upcoming } = selectMemberTasks(tasks, 'm1', NOW)
    const ids = [...open, ...upcoming].map((t) => t.id)
    expect(ids).toEqual(['mine'])
  })

  it('does NOT count assignedToAll (matches the snapshot badge)', () => {
    const tasks = [makeTask({ id: 'multi', assignedToAll: ['m1', 'm2'] })]
    const { open, upcoming } = selectMemberTasks(tasks, 'm1', NOW)
    expect([...open, ...upcoming]).toHaveLength(0)
  })

  it('puts unscheduled, overdue, and today tasks in open; future in upcoming', () => {
    const tasks = [
      makeTask({ id: 'unscheduled', assignedTo: 'm1' }),
      makeTask({ id: 'overdue', assignedTo: 'm1', scheduledFor: new Date('2026-05-20T09:00:00') }),
      makeTask({ id: 'today', assignedTo: 'm1', scheduledFor: new Date('2026-05-22T18:00:00') }),
      makeTask({ id: 'tomorrow', assignedTo: 'm1', scheduledFor: new Date('2026-05-23T08:00:00') }),
    ]
    const { open, upcoming } = selectMemberTasks(tasks, 'm1', NOW)
    expect(open.map((t) => t.id)).toEqual(['overdue', 'today', 'unscheduled'])
    expect(upcoming.map((t) => t.id)).toEqual(['tomorrow'])
  })

  it('sorts open by scheduledFor (nulls last) then createdAt, upcoming ascending', () => {
    const tasks = [
      makeTask({ id: 'b-up', assignedTo: 'm1', scheduledFor: new Date('2026-05-25') }),
      makeTask({ id: 'a-up', assignedTo: 'm1', scheduledFor: new Date('2026-05-24') }),
    ]
    const { upcoming } = selectMemberTasks(tasks, 'm1', NOW)
    expect(upcoming.map((t) => t.id)).toEqual(['a-up', 'b-up'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/lib/memberTasks.test.ts`
Expected: FAIL — "Failed to resolve import './memberTasks'" / `selectMemberTasks is not a function`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/memberTasks.ts
import type { Task } from '@/types/task'

export interface MemberTasks {
  /** Incomplete, assigned to member, and unscheduled / overdue / due today. */
  open: Task[]
  /** Incomplete, assigned to member, and scheduled strictly after today. */
  upcoming: Task[]
}

function startOfDay(d: Date): number {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

function byScheduledThenCreated(a: Task, b: Task): number {
  const as = a.scheduledFor ? a.scheduledFor.getTime() : Infinity
  const bs = b.scheduledFor ? b.scheduledFor.getTime() : Infinity
  if (as !== bs) return as - bs
  return a.createdAt.getTime() - b.createdAt.getTime()
}

/**
 * Splits a member's tasks into Open (unscheduled / overdue / today) and
 * Upcoming (scheduled after today). Counts only the legacy single `assignedTo`
 * field so this view agrees with the Family Snapshot badge (which ignores
 * `assignedToAll`). `now` is injectable for deterministic tests.
 */
export function selectMemberTasks(
  tasks: Task[],
  memberId: string,
  now: Date = new Date(),
): MemberTasks {
  const todayStart = startOfDay(now)
  const assigned = tasks.filter((t) => !t.completed && t.assignedTo === memberId)

  const isUpcoming = (t: Task) =>
    t.scheduledFor != null && startOfDay(t.scheduledFor) > todayStart

  return {
    open: assigned.filter((t) => !isUpcoming(t)).sort(byScheduledThenCreated),
    upcoming: assigned
      .filter(isUpcoming)
      .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime()),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/lib/memberTasks.test.ts`
Expected: PASS — 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memberTasks.ts src/lib/memberTasks.test.ts
git commit -m "feat(family): selectMemberTasks helper (open vs upcoming)"
```

---

## Task 2: `MemberView` component

**Files:**
- Create: `src/components/family/MemberView.tsx`
- Test: `src/components/family/MemberView.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/family/MemberView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { MemberView } from './MemberView'
import type { FamilyMember } from '@/types/family'
import type { Task } from '@/types/task'

function makeMember(over: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id: 'm1', user_id: 'u1', name: 'Iris', initials: 'IR', color: 'purple',
    avatar_url: null, is_full_user: false, display_order: 0,
    created_at: '', member_type: 'core', role_label: 'parent', ...over,
  }
}

function makeTask(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2), title: 'task', completed: false,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  }
}

describe('MemberView', () => {
  it('renders the member name and role', () => {
    render(<MemberView member={makeMember()} tasks={[]} onBack={vi.fn()} onSelectTask={vi.fn()} onEditInSettings={vi.fn()} />)
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.getByText('parent')).toBeInTheDocument()
  })

  it('lists open tasks and fires onSelectTask when one is clicked', () => {
    const onSelectTask = vi.fn()
    const tasks = [makeTask({ id: 't1', title: 'Call dentist', assignedTo: 'm1' })]
    render(<MemberView member={makeMember()} tasks={tasks} onBack={vi.fn()} onSelectTask={onSelectTask} onEditInSettings={vi.fn()} />)
    fireEvent.click(screen.getByText('Call dentist'))
    expect(onSelectTask).toHaveBeenCalledWith('t1')
  })

  it('shows an empty state when there are no open tasks', () => {
    render(<MemberView member={makeMember()} tasks={[]} onBack={vi.fn()} onSelectTask={vi.fn()} onEditInSettings={vi.fn()} />)
    expect(screen.getByText('No open tasks.')).toBeInTheDocument()
  })

  it('omits profile fields that have no value', () => {
    render(<MemberView member={makeMember({ allergies: [] })} tasks={[]} onBack={vi.fn()} onSelectTask={vi.fn()} onEditInSettings={vi.fn()} />)
    expect(screen.queryByText('Allergies')).not.toBeInTheDocument()
  })

  it('renders profile fields that have values', () => {
    render(<MemberView member={makeMember({ allergies: ['peanuts'] })} tasks={[]} onBack={vi.fn()} onSelectTask={vi.fn()} onEditInSettings={vi.fn()} />)
    expect(screen.getByText('Allergies')).toBeInTheDocument()
    expect(screen.getByText('peanuts')).toBeInTheDocument()
  })

  it('fires onBack and onEditInSettings', () => {
    const onBack = vi.fn(); const onEditInSettings = vi.fn()
    render(<MemberView member={makeMember()} tasks={[]} onBack={onBack} onSelectTask={vi.fn()} onEditInSettings={onEditInSettings} />)
    fireEvent.click(screen.getByText('Back'))
    fireEvent.click(screen.getByText('Edit in Settings'))
    expect(onBack).toHaveBeenCalled()
    expect(onEditInSettings).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/components/family/MemberView.test.tsx`
Expected: FAIL — cannot resolve `./MemberView`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/family/MemberView.tsx
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react'
import type { FamilyMember, FamilyMemberColor } from '@/types/family'
import { FAMILY_COLORS } from '@/types/family'
import type { Task } from '@/types/task'
import { selectMemberTasks } from '@/lib/memberTasks'

interface MemberViewProps {
  member: FamilyMember
  tasks: Task[]
  onBack: () => void
  onSelectTask: (taskId: string) => void
  onEditInSettings: () => void
}

export function MemberView({ member, tasks, onBack, onSelectTask, onEditInSettings }: MemberViewProps) {
  const { open, upcoming } = selectMemberTasks(tasks, member.id)
  const colors = FAMILY_COLORS[member.color as FamilyMemberColor] ?? FAMILY_COLORS.blue

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-medium ${colors.bg} ${colors.text}`}>
          {member.initials}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-display text-neutral-800">{member.name}</h1>
          {member.role_label && <p className="text-sm text-neutral-500 capitalize">{member.role_label}</p>}
        </div>
      </div>

      <section className="mb-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Open tasks</h2>
        {open.length === 0 ? (
          <p className="text-sm text-neutral-400">No open tasks.</p>
        ) : (
          <ul className="space-y-1">
            {open.map((task) => (
              <li key={task.id}>
                <button
                  onClick={() => onSelectTask(task.id)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-50 text-sm text-neutral-800"
                >
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Upcoming</h2>
          <ul className="space-y-1">
            {upcoming.map((task) => (
              <li key={task.id}>
                <button
                  onClick={() => onSelectTask(task.id)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-50 text-sm flex justify-between gap-3"
                >
                  <span className="text-neutral-800">{task.title}</span>
                  {task.scheduledFor && (
                    <span className="text-neutral-400 shrink-0">
                      {task.scheduledFor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Profile</h2>
          <button
            onClick={onEditInSettings}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"
          >
            <SettingsIcon className="w-3.5 h-3.5" /> Edit in Settings
          </button>
        </div>
        <dl className="space-y-2 text-sm">
          <ProfileRow label="Role" value={member.role_label} />
          <ProfileRow label="Age range" value={member.age_range} />
          <ProfileRow label="Allergies" value={member.allergies?.join(', ')} />
          <ProfileRow label="Medications" value={member.medications?.map((m) => m.name).join(', ')} />
          <ProfileRow label="Dietary" value={member.dietary_restrictions?.join(', ')} />
          <ProfileRow label="Conditions" value={member.health_conditions?.join(', ')} />
          <ProfileRow label="Mobility" value={member.mobility_needs} />
          <ProfileRow label="Involvement" value={member.typical_involvement} />
        </dl>
      </section>
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-neutral-400">{label}</dt>
      <dd className="text-neutral-800 capitalize">{value}</dd>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/components/family/MemberView.test.tsx`
Expected: PASS — 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/family/MemberView.tsx src/components/family/MemberView.test.tsx
git commit -m "feat(family): MemberView page (tasks + read-only profile)"
```

---

## Task 3: Routing plumbing in App.tsx + ViewType

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:44` (the `ViewType` union)
- Modify: `src/App.tsx` (params ~376, `activeView` memo ~382-399, `isUrlBased` effect ~422-435, new `selectedMember` memo near ~578, new `handleOpenMember` near ~654)

- [ ] **Step 1: Add `'family-member'` to the ViewType union**

In `src/components/layout/Sidebar.tsx` line 44, append `| 'family-member'` to the union:

```typescript
export type ViewType = 'agent' | 'home' | 'home-app' | 'today' | 'inbox' | 'goals' | 'projects' | 'routines' | 'lists' | 'notes' | 'contacts' | 'history' | 'task-detail' | 'contact-detail' | 'settings' | 'meals' | 'morning' | 'bedtime' | 'family-member'
```

- [ ] **Step 2: Extend the params type** (`src/App.tsx` ~376)

```typescript
const params = useParams<{ projectId?: string; routineId?: string; contactId?: string; memberId?: string }>()
```

- [ ] **Step 3: Add the `/family/` branch to the `activeView` memo** (`src/App.tsx`, inside the memo after the contacts checks)

```typescript
    if (path.startsWith('/contacts/')) return 'contact-detail'
    if (path.startsWith('/family/')) return 'family-member'
```

- [ ] **Step 4: Mark `/family` as URL-based** (`src/App.tsx`, in the `isUrlBased` effect)

Add a line to the `isUrlBased` boolean so the stateView-clearing effect treats `/family` as URL-routed:

```typescript
      path.startsWith('/contacts') ||
      path.startsWith('/family') ||
      path.startsWith('/meals') ||
```

- [ ] **Step 5: Derive `selectedMember`** (`src/App.tsx`, near the `selectedProject` memo)

```typescript
  const selectedMember = useMemo(() => {
    const memberId = params.memberId
    if (!memberId) return null
    return familyMembers.find((m) => m.id === memberId) ?? null
  }, [params.memberId, familyMembers])
```

- [ ] **Step 6: Add `handleOpenMember`** (`src/App.tsx`, near `handleOpenProject` / `handleOpenContact`)

Self-click routes to the home/today URL instead of a redundant self-page.

```typescript
  // Open a family member's detail page (self-click → today)
  const handleOpenMember = useCallback((memberId: string) => {
    if (memberId === getCurrentUserMember()?.id) {
      setStateView(null)
      navigate('/')
      return
    }
    setSelectedItemId(null)
    setSelectedTaskId(null)
    setRecipeUrl(null)
    navigate(`/family/${memberId}`)
  }, [navigate, getCurrentUserMember])
```

- [ ] **Step 7: Verify it compiles**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx tsc --noEmit`
Expected: No errors. (`selectedMember` and `handleOpenMember` are defined but unused until Task 4/5 — that's fine; `tsc` does not error on unused `const`. If ESLint `no-unused-vars` fires later, Tasks 4–5 consume them.)

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(family): route /family/:memberId + open-member handler"
```

---

## Task 4: Render MemberView in ViewRouter

**Files:**
- Modify: `src/components/layout/ViewRouter.tsx` (imports, `ViewRouterProps`, a new render block; the `contact-detail` block ~310 is the structural template)
- Modify: `src/App.tsx` (pass `selectedMember` and `onEditMemberInSettings` to `<ViewRouter>`)

- [ ] **Step 1: Import MemberView** (top of `src/components/layout/ViewRouter.tsx`)

```typescript
import { MemberView } from '@/components/family/MemberView'
```

- [ ] **Step 2: Add the two new props to `ViewRouterProps`** (near `selectedContactForView: Contact | null`)

```typescript
  selectedMember: FamilyMember | null
  onEditMemberInSettings: () => void
```

(`FamilyMember` is already imported in this file.)

- [ ] **Step 3: Add the render block** (place after the `contact-detail` block, ~line 333)

```tsx
      {props.activeView === 'family-member' && props.selectedMember && (
        <MemberView
          member={props.selectedMember}
          tasks={props.tasks}
          onBack={() => navigate('/')}
          onSelectTask={props.onSelectItem}
          onEditInSettings={props.onEditMemberInSettings}
        />
      )}
```

- [ ] **Step 4: Pass the props from App.tsx** (where `<ViewRouter ... />` is rendered, ~line 1820+; add alongside `selectedContactForView`/`selectedProject`)

```tsx
          selectedMember={selectedMember}
          onEditMemberInSettings={() => handleViewChange('settings')}
```

- [ ] **Step 5: Verify it compiles**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ViewRouter.tsx src/App.tsx
git commit -m "feat(family): render MemberView at /family/:memberId"
```

---

## Task 5: Repoint the Family Snapshot click in AppShell

**Files:**
- Modify: `src/components/layout/AppShell.tsx` (`AppShellProps` ~81, destructure ~140, the `onSelectMember` / `onViewAllFamily` handlers ~583-590)
- Modify: `src/App.tsx` (pass `onOpenMember={handleOpenMember}` to `<AppShell>`)

- [ ] **Step 1: Add the `onOpenMember` prop** to `AppShellProps` (near `onRailSelectTask`)

```typescript
  /** Opens a family member's detail page — used by the rail's Family Snapshot. */
  onOpenMember?: (id: string) => void
```

- [ ] **Step 2: Destructure it** in the `AppShell({ ... })` parameter list (near `onRailSelectTask,`)

```typescript
  onOpenMember,
```

- [ ] **Step 3: Rewire the rail handlers** (`src/components/layout/AppShell.tsx`, the TodayRail `onSelectMember` and `onViewAllFamily`)

```tsx
            onSelectMember={(id) => {
              if (onOpenMember) onOpenMember(id)
              else onViewChange('home-app')
            }}
            onViewAllFamily={() => onViewChange('settings')}
```

- [ ] **Step 4: Pass the handler from App.tsx** (where `<AppShell ... />` is rendered, alongside `onPinNavigate={handlePinNavigate}`)

```tsx
        onOpenMember={handleOpenMember}
```

- [ ] **Step 5: Verify it compiles**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/AppShell.tsx src/App.tsx
git commit -m "feat(family): Family Snapshot opens member page; See all → Settings"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the new unit + component tests**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx vitest run src/lib/memberTasks.test.ts src/components/family/MemberView.test.tsx`
Expected: PASS — 10 tests total.

- [ ] **Step 2: Typecheck + lint + build**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npx tsc --noEmit && npm run lint && npm run build`
Expected: All pass, no errors.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; npm run dev` (in the worktree). In the browser:
- On the Today view, the right rail's Family Snapshot lists members. Click a **non-self** member → URL becomes `/family/<id>` and the member page renders with their open tasks + profile.
- Click a task row → its detail opens.
- Click **Edit in Settings** → Settings view opens.
- Click **Back** → returns to Today.
- Click the member who is yourself → lands on Today (no self-page).
- Click **See all** on the snapshot → Settings opens (not the Home Registry).

Expected: all behaviors as described.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(family): verify member detail view end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** routing (`/family/:memberId`, Tasks 3–4), tasks-first-then-profile layout + assigned-only scope + open/upcoming split (Tasks 1–2), read-only profile + Edit-in-Settings (Task 2/4), self-click → today (Task 3), See-all → Settings (Task 5), tests (Tasks 1–2, 6). All covered.
- **Assignment field:** filters on `assignedTo` only, matching `familySnapshot.ts` — page count and snapshot badge agree. `assignedToAll` explicitly excluded (Task 1 test asserts this).
- **Type consistency:** `selectMemberTasks(tasks, memberId, now?)` and `MemberTasks { open, upcoming }` are used identically in helper, tests, and `MemberView`. `MemberViewProps` matches the ViewRouter render block. `onOpenMember`/`selectedMember`/`onEditMemberInSettings` names are consistent across App/AppShell/ViewRouter.
- **No placeholders.**
