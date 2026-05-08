# Sidebar Hierarchy — Design Spec

**Date:** 2026-05-08
**Author:** Scott + Claude
**Goal:** Tame the bloated left sidebar by introducing collapsible, GTD-flavored groupings. Reduce always-visible items from ~13 to 4 (plus 4 collapsed group headers).

---

## Current state

`src/components/layout/Sidebar.tsx` (541 lines) renders a flat list of 13 nav items plus a registry-driven "Apps" section. Items appear in this order:

Today, Inbox, Projects, Routines, Goals, AI (button), Wall (opens new tab), Notes, Home, Lists, Meals (with inline Shelf/Habits when active), Contacts, History, then registry "Apps" entries, then Settings/Sign-out at the bottom.

The pattern is uniform: each item is a button with an icon + label, identical styling. There is no visual hierarchy beyond a single "Reference" sub-header before Notes.

---

## Goal

A clean four-group hierarchy that:

- Collapses by default so first paint is calm.
- Surfaces frequent action items always (Today, Inbox).
- Persists each section's open/closed state per-user.
- Inlines contextual children when a group's view is active (Home → rooms, Meals → Shelf/Habits, Lists → recent lists).
- Frees the header for two icon-only launchers (Wall, AI) so they stop competing with daily nav.

---

## Structure

**Header strip (always visible):**
- Symphony logo + collapse toggle (existing)
- Search button (existing)
- **NEW:** Wall icon (opens `/wall` in new tab)
- **NEW:** AI icon (opens chat overlay) — only when `onOpenChat` is provided

**Pinned section** (existing): unchanged, at the top above all groups.

**"Do" — always open, no collapsible header:**
- Today
- Inbox

**"Plan" — collapsed by default:**
- Projects
- Routines
- Goals

**"Library" — collapsed by default:**
- Notes (gated by `FEATURES.notes`)
- Lists (gated by `FEATURES.lists`)
- Contacts
- History

**"Spaces" — collapsed by default:**
- Home
- Meals

**"Apps" — collapsed by default:**
- Registry-driven entries (Jobs, Tasks-new, etc.) sorted by `sidebar.order`

**Footer (existing):** Settings, Sign-out, greeting strip.

---

## Behavior

### Group header

Each collapsible group renders as a single button row:

```
[chevron] [label]               (count?)
```

Tapping toggles the group's expanded state. The chevron rotates (right when collapsed, down when open). When collapsed, child rows do not render.

When the sidebar itself is collapsed (`collapsed=true`), group headers and labels are hidden — only the always-visible items render as icons (mirroring current collapsed-sidebar behavior). Inline contextual children also hide.

### Inline contextual children

When the user's active view falls under a group, the group is forced-open and its active child shows nested children directly underneath it:

| Active view | Inline children rendered under it |
|-------------|-----------------------------------|
| `meals` | "Shelf", "Habits" (existing pattern) |
| `home-app` | Up to 5 rooms by `sortOrder`, then "All rooms →" link if more exist |
| `lists` | Up to 5 most-recently-updated lists, then "All lists →" link if more exist |

A group is considered "active" when `activeView` matches any of its child views. For example, `activeView ∈ {projects, routines, goals}` keeps "Plan" force-open; `activeView ∈ {home-app, meals}` keeps "Spaces" force-open.

For Home and Lists, the children are clickable and route via `onViewChange` plus a route change to the specific entity (e.g., `/home/space/<id>`, list selection state).

### Persistence

Each group's open/closed state is stored in `localStorage` under a single key:

```ts
localStorage.setItem(
  'symphony-sidebar-groups',
  JSON.stringify({ plan: false, library: false, spaces: false, apps: false })
)
```

Default state if absent: all four groups closed.

When the user activates a view inside a group, the group becomes open and the persisted state updates accordingly (so the group stays open after the user navigates back out).

### Header icons (Wall, AI)

A small icon strip lives next to the search button at the top of the sidebar. Each icon is 32×32 with a tooltip on hover:

- Wall icon: opens `/wall` in a new tab (matches current behavior).
- AI icon: invokes `onOpenChat()` (matches current behavior).

When the sidebar is collapsed, these icons stack vertically with the search button.

---

## Components

### New

- `SidebarGroup.tsx` — renders a group header button, chevron, count badge slot, and children. Accepts `id`, `label`, `defaultOpen`, `forceOpen` (for active-view forcing), `onToggle`, and children.

### Modified

- `Sidebar.tsx` — replace the flat nav with five groups (Do, Plan, Library, Spaces, Apps). Add header icon strip. Add localStorage persistence hook. Ensure inline-contextual-children behavior continues for Meals and is added for Home and Lists.

### Unchanged

- `PinnedSection.tsx`
- All target views (Today, Inbox, Projects, etc.)
- `appRegistry`

---

## Data flow

`Sidebar` props remain identical to today (`onViewChange`, `activeView`, `onOpenChat`, etc.) — no upstream changes. New internal state:

- `groupState: Record<'plan' | 'library' | 'spaces' | 'apps', boolean>` (open/closed)
- `groupState` derives from localStorage on mount, persists on change.

For inline contextual children:

- Home: read `useSpaces(home?.id).rooms` (top 5 by sortOrder)
- Lists: read `useLists().lists` (top 5 by updatedAt desc)
- Meals: hardcoded "Shelf" / "Habits" (existing)

These hooks are already imported elsewhere in the app; calling them inside Sidebar is acceptable (the sidebar is mounted under an authed shell where these hooks already work).

---

## Out of scope

- Reordering or hiding items via UI. (Pinning + collapsing covers most of that need.)
- Moving Settings/Sign-out into a group.
- Notes-view click routing fix (logged separately — clicking a task-attached note should show it in the center viewer instead of jumping to the parent task).
- Vault-sync filtering for the Notes view (separate follow-up).

---

## Testing

- Snapshot or render test that asserts default first-paint shows: Pinned (if any), Today, Inbox, then 4 collapsed group headers, then Footer.
- Click test for each group header toggles its `aria-expanded` state and renders/hides children.
- Test that activating a child view (e.g., setting `activeView='projects'`) force-opens the parent group ("Plan").
- Test that localStorage state survives a remount.
- Existing Sidebar tests must still pass.

---

## Migration / rollback

Pure UI change — no DB migration, no backend impact, no API changes. Reverting is `git revert`. No feature flag needed.
