# Domain layers — filtering the way Google Calendar does

**Date:** 2026-08-29 · **Status:** approved design, pre-plan · **Origin:** Iris

## The realization

Everything in Symphony — tasks, events, routines, projects, notes — should filter
the way Google Calendar filters: a list of layers with a checkbox each. Tick the
layers you want, see the union. Two people who both have a layer ticked see the
same rows in it. There is no such thing as an item on no layer; getting an item
onto a layer *is* what processing it means.

Symphony already has the axis (`context`: `work | family | personal`), the
canonical filter helpers (`src/lib/today/domainFilter.ts`), and a header
switcher. What it has is a **radio button** where the model wants
**checkboxes**, a **second sharing axis** (`scope`) that has to be kept in sync
with the first by hand, and a **null** that is legal everywhere. This spec
closes those three gaps and nothing else.

## Decisions (made in the brainstorm)

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Is a domain the sharing unit, like a Google calendar? | **Yes.** `scope` is derived from domain, never user-set. |
| 2 | Fixed set or user-defined domains? | **Fixed three now**, built against a `DomainDef[]` list so a `domains` table later is a swap, not a rewrite. |
| 3 | Backfill of `family`-context rows still at `scope='individual'`? | **A person re-files each one.** No script shares anything. |
| 4 | Where does a private thought about a family matter live? | **Personal.** No fourth layer. |
| 5 | Existing `context = null` rows? | **They are Unsorted.** No migration; they are literally unprocessed. |

## 1. The model

### Domains

```ts
// src/lib/domains.ts  (new — the one place the list lives)
export type DomainId = 'work' | 'family' | 'personal'
export interface DomainDef {
  id: DomainId
  label: string
  icon: LucideIcon
  color: string        // dot + row tint; the same three colours DomainSwitcher uses today
  shared: boolean      // true → every household member subscribes
}
export const DOMAINS: readonly DomainDef[]   // work, family, personal — in this order
export const UNSORTED = 'unsorted' as const  // the pseudo-layer for context IS NULL
export type Layer = DomainId | typeof UNSORTED
```

`family.shared = true`; `work` and `personal` are `false`. Nothing else in
`src/` may enumerate the three literals for UI purposes — it iterates
`DOMAINS`. (Type narrowing on `TaskContext` in data code is fine.)

### Unsorted

`context IS NULL` is legal on exactly one kind of row: an item nobody has
triaged yet. It shows up in the picker as its own layer, **Unsorted**, visible
to its owner only. It is the *definition* of unprocessed. Nothing that has been
through any deliberate step (scheduled, assigned, put in a project, planned)
may remain null — see §3.

### Sharing is derived

`scope` stays as the DB column RLS reads (`individual | couple | compound`) —
the migration `2026-06-07_scope_axis.sql` and every policy on it are untouched.
What changes is that **no write path accepts a caller-supplied scope.** One
function computes it:

```ts
// src/lib/scope.ts — replaces defaultScopeForArea + scopeForContextChange
export function scopeForDomain(
  context: TaskContext | null | undefined,
  assignedTo: readonly string[] | null | undefined,   // member ids, excluding self
  selfMemberId: string | null,
): Scope {
  if (context === 'family') return 'compound'
  const others = (assignedTo ?? []).filter((id) => id !== selfMemberId)
  return others.length > 0 ? 'couple' : 'individual'
}
```

Two inputs, one output, no history: the row's scope is always exactly what its
current domain + assignees say. This keeps the one legitimate non-family share
Symphony has — *"I'm asking Iris to do this personal thing"* — as the
`couple` rung, still derived, still off the wall (which needs `compound`).

Consequences:

- `PanelClassify`'s scope control (Just me / Us / Everyone) is **removed**.
  `scope`/`onScopeChange` props go away; `UsView` reads scope, doesn't set it.
- `updateTask` / `updateTasksBulk` / `addTask` / wall insert / `captureInsert`
  / `usePhotoCapture` / `useRoutines` / `useProjects` / `useNotes` and the
  three edge functions (`extract-capture`, `symphony-agent`, `vault-sync`) all
  call `scopeForDomain` on every write that touches `context` or assignees.
  The `'scope' in updates` branches are deleted.
- The bulk unshare second-pass in `updateTasksBulk` (`:1374`) becomes
  unnecessary: bulk sets `context`, so each row's scope is recomputed in the
  same payload per row (one `.update().eq()` per distinct resulting scope —
  never a partial upsert, per repo rule).
- `src/lib/scopeDefaultCoverage.test.ts` widens: any `.insert`/`.update`/
  `.upsert` to `tasks | routines | projects | notes | events_notes` that
  writes `context` or an assignee column must write `scope` **via
  `scopeForDomain`**. A literal `scope:` value anywhere outside `scope.ts`
  fails the test.

### The assignee filter is untouched

Domain answers *what part of life*. Assignee answers *who does it*. The
assignee filter stays orthogonal, opt-in, default everyone
(`symphony-assignee-filter-v2`). CascadingRiverView keeps its stricter lane rule.

## 2. The picker

`DomainSwitcher` becomes a checkbox set. Same three render sites (`HomeHeader`,
`TodayHeader`, `ShellLayout`), same portalled click-to-open menu — the footprint
rule from `domain_switcher_click_menu_shipped` still applies.

```
┌────────────────────┐
│ ● Work           ✓ │
│ ● Family         ✓ │
│ ● Personal       ✓ │
│ ○ Unsorted       ✓ │
├────────────────────┤
│ Only this · All    │   ← "Only this" appears on hover/long-press of a row
└────────────────────┘
```

- Trigger chip shows: all four on → "All"; one on → that domain's icon +
  label; 2–3 on → stacked colour dots.
- **Default = all four on.** `universal` disappears as a value; it is just the
  full set.
- **Persists forever** (`symphony-layers`, a JSON array). The daily reset in
  `resolveInitialDomain` is **deleted** — it existed only because capture
  stamped the lens onto new rows (§3 ends that).
- Turning off every box is not allowed; the last checked box is disabled.

```ts
// useDomain.tsx
interface DomainContextType {
  layers: ReadonlySet<Layer>
  setLayers: (next: ReadonlySet<Layer>) => void
  toggle: (layer: Layer) => void
  only: (layer: Layer) => void
  /** The one domain to stamp on a deliberate create (RoutineBuilder, planning
   *  sessions, GoalsApp) when exactly one real domain is checked; else null. */
  soleDomain: DomainId | null
}
```

Every consumer of `currentDomain` (18 files) moves to `layers` or `soleDomain`.
`DomainPageOutline`, `GuidedSessionContainer`, `horizons/shared.tsx`, `GoalsApp`,
`ProjectsApp`, `RoutinesApp` — where they previously showed a per-domain page
outline or session — key off `soleDomain`, and when it is null behave as they
did for `universal`.

## 3. Capture and triage

### Every capture lands Unsorted

`context` is **not** stamped from the lens on any capture path:
`useShellChrome.ts:107,123`, `QuickCapture.tsx:87`, `InboxView.tsx:264`,
`captureInsert.ts`, `usePhotoCapture`, phone/Supernote/email paths through
`extract-capture` and `capture-to-inbox`. They write `context: null,
scope: 'individual'` (via `scopeForDomain(null, [], me)`).

Two exceptions, both "by construction":

- **Wall quick capture** writes `family` — the wall *is* the family layer.
- **Quick-parse** (`#work`, `@family` in the capture text) still stamps the
  parsed domain — the user said it.

Deliberate creates that already ask the user where the thing goes — the
routine builder, project creation, planning-session adds — keep pre-filling
from `soleDomain` (null → they show the domain chooser, no default).

### Triage = pick a domain

The row's `ContextPicker` (🏷) is the processing step. The `.tag-needs-context`
pulse stays on any Unsorted row, on every surface, until it has a domain.

**Any other process on an Unsorted item routes through the domain chooser
first.** Concretely: scheduling (SchedulePopover / WhenPicker), assigning,
adding to a project, or dragging onto Today/Week/Month from an Unsorted row
first opens the domain chooser inline (three buttons, same colours), then
applies the original action. Cancel = nothing happens. This is the mechanical
form of Iris's rule: *any process has to involve giving it a domain.* It also
guarantees the invariant "non-null `bucket !== 'inbox'` ⇒ non-null `context`"
for new rows, which is what lets a DB constraint land later (§5).

The inbox filter rules collapse: `filterTasksForPlanning` and
`filterTasksForDomainView` differed only in how they treated null. Now null is
a layer like any other, so:

```ts
export function matchesLayers(context: TaskContext | null | undefined, layers: ReadonlySet<Layer>): boolean {
  return layers.has(context ?? UNSORTED)
}
export function filterTasksForLayers(tasks, layers)
export function filterEventsForLayers(events, layers, deps)     // resolved via eventContext.ts; unmapped calendar ⇒ UNSORTED
export function filterRoutinesForLayers(routines, layers)
```

`filterTasksForPlanning`, `filterTasksForDomainView`, `matchesDomain`,
`PlanningDomain` are deleted. `domainSessionToken` takes a `DomainId`.

Events: an event whose calendar has no `calendar_domain_mappings` row resolves
to Unsorted. That is a visible nudge to map the calendar (today it silently
leaks into every domain). Mapping the calendar is the event's triage.

### The re-filing strip (decision 3)

A one-time strip at the top of `InboxView`, per owner: **"N items are marked
Family but only you can see them."** Each row shows the title and two buttons,
**Family** (→ `scopeForDomain('family')` = compound, shared) and **Personal**
(→ context personal, individual). The strip lists rows where
`context='family' AND scope='individual' AND user_id = me`. It disappears when
the query returns zero. No bulk action; that is the point.

Also listed there, same treatment: `context IN ('work','personal') AND
scope='compound'` — the reverse leak. Buttons: **Keep private** (recompute →
individual) / **Move to Family**.

## 4. Surfaces

| Surface | Change |
|---|---|
| Today / Week / Month / Inbox / River / Planning grid | Call the `*ForLayers` helpers. No other logic change. |
| Header pools (`HorizonPoolDropdown`) | Same helpers; still ignore the assignee filter. |
| Wall (`/wall-v2`) | **Unchanged.** Reads `context='family'`, no picker. |
| `/us` | Reads scope for display; the scope control is gone. |
| Assistant / context graph | Unchanged; they already mirror RLS. |
| iOS | Unchanged. Same columns; its own picker gets layers in a later spec. |
| Sidebar domain chips (`Sidebar.tsx`) | Reflect `layers`; clicking a chip = `only()`. |

## 5. Data layer

**No schema migration in this spec.** `scope` remains derived in app code and
verified by the tripwire test. Once the re-filing strip has drained for every
household member (query: `count(*) where context='family' and scope='individual'`
= 0 and the reverse = 0), a follow-up adds:

```sql
alter table tasks add constraint tasks_scope_matches_context
  check (context is distinct from 'family' or scope = 'compound');
-- same on routines, projects, notes
```

That DDL goes through Scott (the classifier blocks agent-run DDL). It is
explicitly **not** part of this plan.

## 6. Testing

- `domains.test.ts` — `DOMAINS` shape; `scopeForDomain` table: family→compound
  regardless of assignees; personal+other→couple; personal+self→individual;
  null→individual.
- `domainFilter.test.ts` — `matchesLayers` for each of the 16 layer subsets ×
  4 contexts; events with unmapped calendar ⇒ Unsorted.
- `useDomain.test.ts` — default all-on; persistence; `only`; last box cannot be
  unchecked; `soleDomain` semantics; **no** day-reset.
- `DomainSwitcher.test.tsx` — checkboxes toggle independently; menu still
  renders outside the trigger subtree (regression from the hover-strip bug).
- `scopeDefaultCoverage.test.ts` — widened as in §1; must fail on a literal
  `scope:` outside `scope.ts` (mutation-verify by hand once).
- `useSupabaseTasks.assignScope.test.ts` — rewritten against `scopeForDomain`:
  assigning a personal task to a partner → couple; un-assigning → individual;
  re-tagging family→personal on a compound row → individual (the August leak).
- Inbox: an Unsorted row's schedule action opens the domain chooser and does
  not write `scheduled_for` until a domain is chosen.
- Manual: sign in as both accounts, tick only Family on each, compare Today —
  same rows. That is the acceptance test Iris actually cares about.

## Out of scope

User-defined domains · per-domain colours on calendar events · the wall showing
non-family layers · iOS picker · the DB check constraint (§5) · reworking
`CascadingRiverView`'s lane rule.
