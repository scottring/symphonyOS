# Family Member Detail View — Design Spec

**Date:** 2026-05-22
**Status:** Approved, ready for implementation plan

## Problem

The Today rail's **Family Snapshot** panel shows one row per core household
member with their open-task count ("Iris · 3 open"). Clicking a member — or the
"See all" link — navigates to `home-app`, which is the **Home Registry** (rooms,
assets, inventory). That's semantically wrong: the snapshot is about *people and
their workload*, but the click lands on a furniture/appliance catalog. The member
id is captured but discarded (`void id`) in `AppShell.tsx`.

There is no per-member detail view anywhere in the app today.

## Decisions

- **Viewer reality: single operator.** Scott is the sole logged-in user; every
  family member is a record he manages. The view shows what the household manager
  would reasonably see about a person. No per-user privacy gating is built yet
  (true multi-user, where "Iris has her own view," is long-term per CLAUDE.md).
  Design so nothing surfaced here would *break* under a future privacy model.
- **Layout: tasks first, profile below**, one scrollable page.
- **Task scope: `assigned_to == member.id`** only (what they own/should do). This
  matches the snapshot's "X open" badge exactly, so page and badge agree.
  Tasks *about* a member (`contact_id`) are out of scope.
- **Profile: read-only** here, with an "Edit in Settings" link. Settings already
  owns the add/edit/delete UI for member fields — single source of truth.
- **Self-click:** clicking the logged-in user routes to `/today` (their own day),
  not a redundant self-page.

## Routing & Navigation

- New `ViewType` value: `'family-member'`.
- New URL route: `/family/:memberId` (mirrors `/projects/:id`, `/contacts/:id`).

**`src/App.tsx`:**
- Add to the `activeView` memo (after the existing URL checks):
  `if (path.startsWith('/family/')) return 'family-member'`.
- Read `memberId` from `useParams` (extend the params type).
- Derive `selectedMember` from the `members` list by id (memoized, like
  `selectedProject`).
- Add `handleOpenMember(memberId)` → clears other selections, then
  `navigate('/family/' + memberId)` (mirrors `handleOpenProject`).
- Pass `handleOpenMember` down to `AppShell` as a new `onOpenMember` prop.

**`src/components/layout/AppShell.tsx`:**
- Add prop `onOpenMember?: (id: string) => void`.
- Rewire the Today rail's `onSelectMember`:
  ```tsx
  onSelectMember={(id) => {
    if (onOpenMember) onOpenMember(id)
    else onViewChange('home-app')
  }}
  ```
  (Self-detection lives in the handler / `handleOpenMember` — see below.)
- Rewire `onViewAllFamily` to `onViewChange('settings')` (was `'home-app'`).

**Self-click guard:** in `handleOpenMember` (App.tsx), if the member is the
logged-in user (`is_full_user`, or `auth_user_id`/`currentUserId` match), call
`navigate('/today')` instead of `/family/:id`.

**`src/components/layout/ViewRouter.tsx`:**
- Render `<MemberView>` when `activeView === 'family-member'` && `selectedMember`
  is present (conditional block, like the project/contact blocks).

## New Component — `MemberView`

**File:** `src/components/family/MemberView.tsx`. Patterned after
`ContactViewRedesign`. Full-page, Nordic Journal styling, three stacked sections.

**Props:**
```ts
interface MemberViewProps {
  member: FamilyMember
  tasks: Task[]
  onBack: () => void
  onSelectTask: (taskId: string) => void
  onEditInSettings: () => void
}
```

**Sections:**

1. **Header** — back button (→ `/today`), colored initials bubble (member
   `color` via `FAMILY_COLORS`), name, `role_label` if present, and an
   `Edit in Settings ›` affordance.

2. **Open tasks** — incomplete tasks where `assigned_to == member.id` that are
   **unscheduled, overdue, or due today**, sorted by `scheduled_for` (nulls last)
   then `created_at`. Reuse the existing task-row component used in `ProjectView`.
   Clicking a row calls `onSelectTask(id)`. Empty state: "No open tasks."

3. **Upcoming** — assigned tasks with a `scheduled_for` **strictly after today**,
   date-labeled. Mutually exclusive with Open tasks (a task is in exactly one
   section). No Google Calendar events (events aren't assigned to members yet —
   deferred). Hidden when empty.

4. **Profile (read-only)** — render only fields that have values:
   `role_label`, DOB / `age_range`, `allergies`, `medications`,
   `dietary_restrictions`, `health_conditions`, `mobility_needs`, and
   `typical_involvement` (guests). `Edit in Settings ›` calls `onEditInSettings`
   (→ `onViewChange('settings')`).

## Data / Logic

Pure, unit-testable helper (e.g. `src/lib/memberTasks.ts`):
```ts
selectMemberTasks(tasks: Task[], memberId: string): {
  open: Task[]      // incomplete, assigned_to === memberId, unscheduled/overdue/today
  upcoming: Task[]  // incomplete, assigned_to === memberId, scheduled after today
}
// open and upcoming are disjoint; completed and other-member tasks excluded.
```

## Testing

- **Unit:** `selectMemberTasks` — filters to the member only, splits open vs
  upcoming correctly, ignores completed and other-member tasks, sort order.
- **Component:** `MemberView` — renders assigned task rows, omits empty profile
  fields, shows the "No open tasks" empty state, fires `onSelectTask` /
  `onBack` / `onEditInSettings`.

## Out of Scope (deferred)

- Multi-user privacy fences (viewer→target gating).
- "About them" tasks (`contact_id == member`).
- Calendar-event assignment to members.
- Inline profile editing on this page.
- Deep-linking Settings to scroll to a specific member.
- A standalone family-members list view ("See all" points to Settings for now).
