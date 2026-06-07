# Phase 2a — Shell Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the app-registry Shell so it is the single app shell, retiring the
legacy `App.tsx` monolith + `ViewRouter` + `AppShell` — *without* breaking any live
surface (especially the kitchen wall and mobile).

**Architecture:** Symphony already has a clean registry Shell (`src/shell/`,
`AppDef` contract, global URL-driven `DetailPanel`, `chromeless` kiosk surfaces).
Today only `tasks` (Today/Inbox/task), `wall`, `wall-v2`, `jobs` run through it; the
other ~12 views still render via `App.tsx`/`ViewRouter`. This plan extracts each
remaining view into a registered `AppDef` (copying the live `tasks` app template),
migrates the chrome (FAB, mobile nav) from `AppShell` into `ShellLayout`, then
deletes the `useNewTasks` flag and the legacy monolith.

**Tech Stack:** React 19 + TS (strict), React Router v6, Vite, Vitest. Worktree
`/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/foundation` (branch `feat/foundation`).

---

## Invariants & safety net (DO NOT VIOLATE)

1. **The Shell mounts at a splat (`/*`), never an exact path.** Exact mounting
   renders blank (locked by `src/shell/cutoverRouting.test.tsx:33-44`).
2. **An explicit legacy `<Route path="/x">` wins over the Shell catch-all `/*`** (React
   Router specificity). This is the migration safety net: a view not yet extracted
   keeps working via its explicit legacy route. Remove a legacy route ONLY after its
   Shell replacement is verified.
3. **Verify on desktop during migration; do the chrome migration (Task C) BEFORE the
   final cutover (Task D)** — `ShellLayout` currently renders no mobile chrome, so
   flipping `/` to the Shell without Task C is a mobile regression.
4. After every task: `npm run build` green + `npx vitest run` green + manual smoke of
   the touched surface. Push to `main` only at the per-task commit points (each is
   independently shippable and behind its own route).

---

## The extraction template (copy the live `tasks` app)

Canonical example to mirror: `src/apps/tasks/` (`index.ts`, `TasksApp.tsx`,
`HomeViewContainer.tsx`, `TaskDetailPanel.tsx`) registered in
`src/shell/appRegistry.ts:54-59`. `AppDef` contract: `src/shell/types.ts`.

For a view `X` rendering legacy component `<XView>`:

1. **`src/apps/<x>/<X>Container.tsx`** — call the data hooks `App.tsx` currently
   prop-drills (e.g. `useProjects`, `useContacts`); if it has selection, use
   `useSelection()` and map `SelectionRef {kind,id}` ↔ legacy `selectedItemId`
   (`<kind>-<id>`) like `HomeViewContainer.tsx:59-87`; render the **unchanged**
   `<XView>` with hook-sourced props. Do not modify the view component.
2. **`src/apps/<x>/<X>App.tsx`** — internal `<Routes>` matching **relative** segments
   (Shell mounts at `<route>/*`), wrapping any needed providers; if a view uses
   `HomeHeader`, supply the no-op `AppShellChromeContext` value as `TasksApp.tsx:31-44`.
3. **`src/apps/<x>/<Kind>DetailPanel.tsx`** (only if it has a detail/selection) —
   `({ selection }: { selection: SelectionRef })` rendering a `fixed right-0` aside
   with the shared container + `onBack={clearSelection}`, like `TaskDetailPanel.tsx`.
4. **`src/apps/<x>/index.ts`** — the `AppDef`:
   ```ts
   import type { AppDef } from '@/shell/types'
   import { XApp } from './XApp'
   export const xAppDef: AppDef = {
     id: 'x',
     route: '/x',
     Component: XApp,
     // DetailPanelComponent: XDetailPanel,   // if it has selection
     // ownsSelectionKinds: ['x'],            // if it has selection; must be unique
     sidebar: { label: 'X', icon: SomeLucideIcon, order: NN }, // if it should show in nav
   }
   ```
5. **Register** — add `xAppDef` to `createRegistry([...])` in `appRegistry.ts:54-59`.
6. **Add the Shell route** to `src/main.tsx`: `<Route path="/x/*" element={<Shell />} />`
   alongside `/jobs/*` (main.tsx:143-146).
7. **Verify** (build + tests + desktop smoke at `/x`). The legacy `/x` route still
   shadows for the bare path while present — verify via the app's sub-routes or by
   temporarily checking the catch-all; then **remove the legacy `/x` route** from
   `main.tsx` and the view's branch from `ViewRouter.tsx` + props from
   `ViewRouterProps` + its case in `App.tsx` `handleViewChange`/`activeView`.
8. **Commit.**

---

## Tasks

> Order = simplest first (proves the template, lowest risk), hardest + retirement last.

### Task 1: Extract Morning (template proof)
**Files:** Create `src/apps/morning/MorningApp.tsx`, `src/apps/morning/index.ts`. Modify `src/shell/appRegistry.ts`, `src/main.tsx`, `src/components/layout/ViewRouter.tsx`, `src/App.tsx`.
- `MorningPage` is a self-contained page, no props, no selection → the simplest possible extraction.
- [ ] `MorningApp.tsx`: `import { MorningPage } from '@/pages/MorningPage'`; render `<Routes><Route path="" element={<MorningPage/>} /></Routes>`.
- [ ] `index.ts`: `morningAppDef` `{ id:'morning', route:'/morning', Component: MorningApp }` (no sidebar — it's a ritual entry, reached programmatically).
- [ ] Register `morningAppDef` in `appRegistry.ts`.
- [ ] `main.tsx`: add `<Route path="/morning/*" element={<Shell />} />`; **remove** the legacy `<Route path="/morning" element={<App/>} />`.
- [ ] Remove the `morning` branch from `ViewRouter.tsx:507` + its `activeView` plumbing in `App.tsx`.
- [ ] Verify: `npm run build`, `npx vitest run`, dev-server smoke `/morning`. Commit `feat(shell): extract Morning into a registered app`.

### Task 2: Extract Bedtime
Same shape as Task 1 with `BedtimePage` / route `/bedtime` (ViewRouter.tsx:508). Commit.

### Task 3: Extract House (rooms)
- `HomeApp` (`apps/home`, already app-shaped, owns `/home/*` internal routing, no global selection).
- [ ] `homeAppDef` `{ id:'home', route:'/home', Component: <wrap apps/home HomeApp>, sidebar: { label:'House', icon: Home, order: 70 } }`.
- [ ] Register + `main.tsx` `/home/*` already Shell? It currently routes to `<App/>` (main.tsx category B). Swap that to `<Shell/>`.
- [ ] Remove `home-app` branch from `ViewRouter.tsx:505`. Verify + commit.

### Task 4: Extract Meals
- 8 subpages (`PlannerPage`, `MemoryShelfPage`, `TodayPage`, `StandingHabitsPage`, `DayDetailPage`, `CookPage`, `GramTrackingPage`, `TonightPage`), already URL-shaped under `/meals/*` (ViewRouter.tsx:462-503).
- [ ] `MealsApp.tsx`: internal `<Routes>` for `plan|shelf|brief|today|habits|grams|tonight|day/:date|cook/:recipeId` (relative segments) rendering the existing pages.
- [ ] `mealsAppDef` `{ id:'meals', route:'/meals', Component: MealsApp, sidebar:{ label:'Meals', icon: UtensilsCrossed, order: 60 } }`.
- [ ] Register; `main.tsx` swap the 8 `/meals/*` legacy routes → one `<Route path="/meals/*" element={<Shell/>} />`. Remove `meals` ViewRouter branch. Verify (smoke each meal subpage) + commit.

### Task 5: Extract Settings (state-based → real route)
- `SettingsPage`, currently `stateView='settings'` with no URL. Give it `/settings`.
- [ ] `SettingsApp.tsx` rendering `<SettingsPage/>`; `settingsAppDef` `{ id:'settings', route:'/settings', Component: SettingsApp }` (sidebar entry handled in Task C's sidebar rework, or add `sidebar:{label:'Settings',icon:Settings,order:200}`).
- [ ] Register + `main.tsx` `/settings/*` Shell route. Update the sidebar footer "Settings" button to `navigate('/settings')`. Remove `settings` from `stateView`/ViewRouter. Verify + commit.

### Task 6: Extract History
- `CompletedTasksView`, state-based; route `/history`; selects tasks → reuse the `task` selection kind (cross-app: `setSelection({kind:'task',id})` then navigate is fine; do NOT register a new kind). Verify + commit.

### Task 7: Extract Lists
- `ListsList`/`ListView`, state-based, internal selection + `ListsProvider`; route `/lists`. Wrap provider in `ListsApp`. Verify + commit.

### Task 8: Extract Contacts (+ contact selection kind)
- `ContactsList` + `ContactView`, URL-routed `/contacts`, `/contacts/:id`.
- [ ] Add `ownsSelectionKinds:['contact']` + a `ContactDetailPanel` (or keep ContactView full-page — match current UX, which is full-page → no panel, just routes). Verify + commit.

### Task 9: Extract Routines
- `RoutinesList` + `RoutineInput` (`/routines/new`) + `RoutineForm` (`/routines/:id`). Internal sub-routes. Verify + commit.

### Task 10: Extract Projects (+ project selection)
- `ProjectsList` + `ProjectView` (`/projects`, `/projects/:id`). `ProjectView` selects tasks (cross-app `task` selection). Verify + commit.

### Task 11: Extract Goals
- `GoalsList`/`GoalView`/`GoalPlanningChat` via `GoalsSection`'s 3-way state machine + `GoalsProvider`. Most internal state of the URL-routed set. Verify + commit.

### Task 12: Extract Family member
- `MemberView` (`/family/:memberId`), selects tasks. Verify + commit.

### Task 13: Extract Weekly Planning + day Planning session
- `WeeklyPlanningSession` (state `weekly-planning`) and `PlanningSession` (the `planningOpen` overlay). Most coupled to App.tsx state; these become a `planning` app (or routes within tasks). Verify + commit.

### Task 14: Extract Agent
- `AgentHomeView` (state `agent`, Scott-only); route `/agent`. Verify + commit.

### Task C: Migrate chrome AppShell → ShellLayout (BEFORE cutover)
**Files:** `src/shell/ShellLayout.tsx`, `src/shell/Shell.tsx`, `src/components/layout/AppShell.tsx` (reference).
Bring the chrome `ShellLayout` lacks (from `AppShell`): the QuickCapture **FAB + parser**, the **mobile bottom nav** (4 tabs) + `MoreSheet` + mobile header, the **DomainSwitcher + AI/Help** topbar for non-Today views, **pins** wiring into `Sidebar`, and the **Help overlay**. Decide `SidebarKinetic`: drop it (Scott is on nordic). Verify desktop + mobile smoke. Commit. (Can run in parallel with view extractions; MUST precede Task D.)

### Task D: Flip the cutover (delete the flag)
**Files:** `src/main.tsx`, `src/main.tsx` routing block (121-170), `src/apps/tasks/TasksApp.tsx`.
Once every category-B view is extracted (Tasks 1-14) and chrome migrated (Task C):
- [ ] Delete the `useNewTasks` read (main.tsx:102-104) and collapse the routing to: explicit always-Shell prefix routes + a single `<Route path="/*" element={cutoverShell} />`. Now `/`, `/today`, `/inbox`, `/task/:id` and unknowns hit the Shell unconditionally.
- [ ] Remove the `/tasks-new/*` parallel routes (TasksApp.tsx:54-58, main.tsx:146).
- [ ] Verify full smoke (every route, desktop + mobile, wall untouched). Commit.

### Task E: Retire the monolith
**Files:** delete `src/App.tsx` (bulk), `src/components/layout/ViewRouter.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/SidebarKinetic.tsx` (if dropped), `src/hooks/useLocalTasks.ts` (if dead).
- [ ] Once nothing imports them (grep to confirm), delete. Keep any still-referenced helpers (extract them first if needed).
- [ ] Final `npm run build` + `npx vitest run` + full manual smoke. Commit `refactor(shell): retire App.tsx monolith + ViewRouter + AppShell`.

---

## Self-review notes
- **Spec coverage:** Tasks 1-14 cover every legacy view in the inventory; C covers the chrome gap; D the flag; E the retirement. Today/Inbox already done.
- **Invariant safety:** every view keeps its explicit legacy route until its Shell replacement is verified (invariant 2); chrome precedes cutover (invariant 3).
- **Wall untouched:** `/wall/*` + `/wall-v2/*` already Shell + chromeless; this plan does not modify them (the `context='family'`→scope wall migration is tracked separately in #10).
- **Out of scope (Phase 2b, needs design):** the radical-collapse sidebar, the adaptive Plan entry, and the reworked triage home are built AFTER this consolidation, over the now-uniform registry.
