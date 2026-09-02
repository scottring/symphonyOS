# "Free" Calendar Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a household mark a calendar event (or its whole recurring series) as "free" — visible on Today, the wall and iOS, but dimmed, unactionable, and excluded from prep/nudge/handoff logic.

**Architecture:** One new column `event_notes.is_free`. Recurring events store the flag on a note keyed by the series id; a single resolver (`isEventFree`) checks instance then series. Web panel toggle + Today row + wall rendering ship together on `main`; the iOS mirror ships on `ios-sliders` as a separate task.

**Tech Stack:** React 19 + TS, Vitest, Supabase (Postgres, RLS), wall-v2 components; Swift/SwiftUI/SwiftData for iOS.

**Spec:** `docs/superpowers/specs/2026-09-02-event-free-flag-design.md`

## Global Constraints

- Web work happens in the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/event-free` (branch `feat/event-free`, off `origin/main`). Never edit the main worktree. Node 22.14.0: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`. Tests: `npx vitest run <file>` (never bare `npm test`, it is watch mode). Type check: `npx tsc --noEmit -p tsconfig.app.json`.
- iOS work happens in `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders` (branch `ios-sliders`) AFTER the scope/coaching follow-up commits land there.
- Resolver rule, verbatim on both platforms: instance note wins if it exists (`isFree` true or false), else series note, else `false`.
- Series key = `recurring_event_id` (web `CalendarEvent.recurring_event_id ?? recurringEventId`; iOS `recurring_event_id` in the `google-calendar-events` payload).
- Copy: pill label "Free"; title "The kids just show up — no prep, no handoff, nothing for a parent to do." Recurring: append " Applies to every occurrence." Chip text on rows: "Free".
- A free event: no check circle / checkbox, no swipe-to-complete, 60% opacity, title NOT struck through. Lane attribution on the wall unchanged.
- The DDL is run by Scott (Claude's Management API DDL call is blocked). The migration file is still committed.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R`. Push to `main` only when the whole web branch is green (`git push origin HEAD:main` after rebasing on `origin/main`); the pre-push hook needs `connectors/node_modules` installed.

---

### Task 1: Column, type, hook, resolver

**Files:**
- Create: `supabase/migrations/2026-09-02_event_notes_is_free.sql`
- Modify: `src/hooks/useEventNotes.ts` (types, mapper, new `updateEventFree`)
- Create: `src/lib/today/eventFree.ts`
- Test: `src/lib/today/eventFree.test.ts`

**Interfaces:**
- Produces: `EventNote.isFree: boolean`, `DbEventNote.is_free: boolean`; `useEventNotes(...).updateEventFree(key: string, free: boolean)`; `seriesKey(event): string | undefined`; `freeKeyFor(event): string` (series id when recurring, else instance id); `isEventFree(event, notesMap): boolean`; `eventNoteKeys(events): string[]` (instance ids + series ids, deduped).

- [ ] **Step 1: Migration file**

```sql
-- "Free" events: the kids just shift over; nothing for a parent to do.
-- For a recurring series the flag lives on a note keyed by recurring_event_id.
alter table public.event_notes
  add column if not exists is_free boolean not null default false;
```
Hand this to Scott to run (SELECT-only calls are fine for Claude; DDL is not):
```
! SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d); curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"query": "alter table public.event_notes add column if not exists is_free boolean not null default false;"}'
```

- [ ] **Step 2: Failing resolver tests** — `src/lib/today/eventFree.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { isEventFree, freeKeyFor, eventNoteKeys } from './eventFree'
import type { EventNote } from '@/hooks/useEventNotes'

const note = (id: string, isFree: boolean): EventNote =>
  ({ id: 'n-' + id, googleEventId: id, notes: null, isFree, createdAt: new Date(0), updatedAt: new Date(0) }) as EventNote
const ev = (id: string, series?: string) => ({ id, google_event_id: id, title: 't', recurring_event_id: series ?? null }) as never

describe('isEventFree', () => {
  it('is false with no notes', () => { expect(isEventFree(ev('a'), undefined)).toBe(false) })
  it('reads the instance note', () => { expect(isEventFree(ev('a'), new Map([['a', note('a', true)]]))).toBe(true) })
  it('falls back to the series note', () => {
    expect(isEventFree(ev('a_1', 'a'), new Map([['a', note('a', true)]]))).toBe(true)
  })
  it('instance note wins over series, even when false', () => {
    const m = new Map([['a', note('a', true)], ['a_1', note('a_1', false)]])
    expect(isEventFree(ev('a_1', 'a'), m)).toBe(false)
  })
})
describe('freeKeyFor / eventNoteKeys', () => {
  it('uses the series id for recurring instances', () => { expect(freeKeyFor(ev('a_1', 'a'))).toBe('a') })
  it('uses the instance id otherwise', () => { expect(freeKeyFor(ev('a'))).toBe('a') })
  it('loads instance and series ids, deduped', () => {
    expect(eventNoteKeys([ev('a_1', 'a'), ev('a_2', 'a'), ev('b')])).toEqual(['a_1', 'a', 'a_2', 'b'])
  })
})
```
Run: `npx vitest run src/lib/today/eventFree.test.ts` → fails (module missing).

- [ ] **Step 3: Resolver** — `src/lib/today/eventFree.ts`

```ts
// "Free" events (spec docs/superpowers/specs/2026-09-02-event-free-flag-design.md).
// event_notes rows are keyed by the INSTANCE id; a recurring series stores the
// flag on a note keyed by the series id. Instance wins, then series, then false.
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'

type AnyEvent = Pick<CalendarEvent, 'id'> & { google_event_id?: string; recurring_event_id?: string | null; recurringEventId?: string | null }

export function instanceKey(event: AnyEvent): string { return event.google_event_id || event.id }
export function seriesKey(event: AnyEvent): string | undefined {
  return event.recurring_event_id ?? event.recurringEventId ?? undefined
}
/** Where the Free flag is WRITTEN: the series when recurring, else the instance. */
export function freeKeyFor(event: AnyEvent): string { return seriesKey(event) ?? instanceKey(event) }

export function isEventFree(event: AnyEvent, notes: Map<string, EventNote> | undefined): boolean {
  if (!notes) return false
  const instance = notes.get(instanceKey(event))
  if (instance && instance.isFree !== undefined) return !!instance.isFree
  const series = seriesKey(event)
  return series ? !!notes.get(series)?.isFree : false
}

/** Ids a list view must load notes for: every instance id plus every series id. */
export function eventNoteKeys(events: ReadonlyArray<AnyEvent>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of events) {
    for (const k of [instanceKey(e), seriesKey(e)]) {
      if (k && !seen.has(k)) { seen.add(k); out.push(k) }
    }
  }
  return out
}
```
Note: a note row that exists but was never marked keeps `is_free=false`; the "instance wins even when false" rule therefore only bites when someone explicitly un-frees one occurrence, which is the intended per-occurrence override.

- [ ] **Step 4: Hook** — in `src/hooks/useEventNotes.ts`: add `isFree?: boolean` to `EventNote`, `is_free: boolean` to `DbEventNote`, `isFree: dbNote.is_free` in `dbNoteToEventNote`, and `updateEventFree` modelled exactly on `updateEventSharedWithFamily` (optimistic map set, `upsert({ user_id, google_event_id: key, is_free: free }, { onConflict: 'user_id,google_event_id' })`, rollback on error). Export it from the hook's return object. `key` is whatever `freeKeyFor(event)` returns; the hook does not care that it may be a series id.

- [ ] **Step 5: Tests green, commit** — `npx vitest run src/lib/today/eventFree.test.ts src/hooks/useEventNotes.test.ts` (if the latter exists) and `npx tsc --noEmit -p tsconfig.app.json`. Commit `feat(events): is_free column, resolver, updateEventFree`.

---

### Task 2: Panel toggle and Today row

**Files:**
- Modify: `src/apps/tasks/HomeViewContainer.tsx` (`visibleEventIds`, timeline item stamping, panel wiring if the panel is rendered here), `src/apps/tasks/TaskDetailPanel.tsx` (event branch ~line 510), `src/components/surface/TapEventPanel.tsx`, `src/components/schedule/ScheduleItem.tsx`, `src/types/timeline.ts` (`TimelineItem.isFree?: boolean`), `src/lib/today/shareNudges.ts`, `src/components/schedule/ProactiveSuggestionChips.tsx` (or the suggestion source it reads)
- Test: `src/components/schedule/ScheduleItem.test.tsx` (add cases), `src/lib/today/shareNudges.test.ts` (add case)

**Interfaces:**
- Consumes Task 1's resolver + hook. Produces `TapEventPanelProps.free?: boolean`, `onToggleFree?: (free: boolean) => void`, `freeAppliesToSeries?: boolean`; `TimelineItem.isFree`.

- [ ] **Step 1: Load series notes** — `visibleEventIds = useMemo(() => eventNoteKeys(events), [events])`.
- [ ] **Step 2: Stamp items** — wherever events become `TimelineItem`s for Today (the `eventToTimelineItem` call sites in `HomeViewContainer`/`useScheduleFiltering`/grouping — grep `eventToTimelineItem(`), set `isFree: isEventFree(event, eventNotesMap)`. If `eventToTimelineItem` is the single seam, give it an optional second arg `notesMap` and set the field there.
- [ ] **Step 3: Panel** — in `TapEventPanel` add the pill to `actions` after `discuss`:

```ts
...(props.onToggleFree
  ? [{
      id: 'free',
      label: 'Free',
      kind: (props.free ? 'flagged' : 'default') as PanelAction['kind'],
      pressed: !!props.free,
      title: 'The kids just show up — no prep, no handoff, nothing for a parent to do.'
        + (props.freeAppliesToSeries ? ' Applies to every occurrence.' : ''),
      onClick: () => props.onToggleFree?.(!props.free),
    }]
  : []),
```
Hide the `complete` action and the prep-task input when `props.free`. Wire in `TaskDetailPanel`: `free={isEventFree(event, notes)}`, `freeAppliesToSeries={!!seriesKey(event)}`, `onToggleFree={(free) => updateEventFree(freeKeyFor(event), free)}` (get `updateEventFree` from the same `useEventNotes` instance that supplies `getNote`; if that instance is not list-loaded, call `fetchNote(freeKeyFor(event))` on open so the pill reflects the series note).
- [ ] **Step 4: Row** — in `ScheduleItem`: `const isFree = !!item.isFree`; `isActionable = (isTask || isRoutine || isEvent) && !isFree`; add `${isFree ? 'opacity-60' : ''}` to the two card classNames next to the completed/skipped rule (do not strike the title); render a chip `<span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 bg-neutral-100 rounded px-1.5 py-0.5">Free</span>` in the meta row; make `onCompleteSwipe` a no-op when free.
- [ ] **Step 5: Exclusions** — `shareNudges`: skip events where `isEventFree(event, eventNotesMap)`. Prep/suggestion chips: skip `calendar_event` suggestions whose event is free (the chips get suggestions from a hook — thread the notes map or filter at the call site in `HomeViewContainer`).
- [ ] **Step 6: Tests** — `ScheduleItem.test.tsx`: a free event renders the "Free" chip and no checkbox; a non-free event still renders the checkbox. `shareNudges.test.ts`: a free event produces no nudge. Run both files + `tsc`. Commit `feat(events): Free pill on the event panel; Today renders free events dimmed and unactionable`.
- [ ] **Step 7: Look** — `npm run dev` in the worktree, open Today, open a recurring event, press Free, confirm the row dims with the chip and the next occurrence (navigate a week ahead) is free too. Screenshot with Playwright or the browser tools; read it.

---

### Task 3: Wall

**Files:**
- Modify: `src/hooks/useWallData.ts` (fetch flags, stamp `isFree`), `src/components/wall-v2/types.ts` (`WallV2TimelineEvent.free?: boolean`), `src/components/wall-v2/wallV2Adapter.ts` (`free: item.isFree`), `src/components/wall-v2/WallV2Gantt.tsx` and the schedule-band card component (opacity + chip, no checkbox)
- Test: `src/components/wall-v2/wallV2Adapter.test.ts` (add: `isFree` → `free`)

- [ ] **Step 1:** In `fetchAllData`'s `Promise.all`, add `supabase.from('event_notes').select('google_event_id, is_free').eq('is_free', true)`; build `const freeKeys = new Set(rows.map(r => r.google_event_id))`; after `dayEvents.map(eventToTimelineItem)` set `item.isFree = freeKeys.has(instanceKey(ev)) || (seriesKey(ev) ? freeKeys.has(seriesKey(ev)!) : false)` (reuse the helpers from Task 1; `TimelineItem.originalEvent` carries `recurring_event_id`).
- [ ] **Step 2:** Adapter: `free: item.isFree`; Gantt bar: add `opacity-50` when `block.free` and a small "Free" label; schedule-band card: no touch checkbox when `free`, same chip. Attribution untouched.
- [ ] **Step 3:** Test + `tsc` + a wall render check (`/wall` route at 1024×768 in the browser; read the screenshot). Commit `feat(wall): free events dimmed with a Free chip, no checkbox`.

---

### Task 4: Ship web

- [ ] Rebase on `origin/main`; run `npx vitest run` (whole suite) and `tsc`; ensure `connectors/node_modules` exists; `git push origin HEAD:main`. Confirm the app deploy picked it up (`gh api repos/scottring/symphonyOS/deployments?per_page=2`). Remind Scott to run the migration BEFORE using the pill (the upsert fails until the column exists).

---

### Task 5: iOS mirror (in the `ios-sliders` worktree, after the scope/coaching follow-up)

**Files:**
- Modify: `SymphonyOS/Services/GoogleCalendarService.swift` (`recurringEventId` from `recurring_event_id`; pass into `TimelineItem`), `SymphonyOS/ViewModels/TimelineViewModel.swift` (`TimelineItem.recurringEventId`, `.isFree`; resolve in the events loop; `static func isFree(eventKey:seriesKey:notes:)`), `SymphonyOS/Models/EventNote.swift` (`isFree: Bool`), `Services/SyncEngine/RowMapper.swift` + `SyncEngine.swift` (`is_free` in/out), `Views/Event/EventDetailView.swift` (Free toggle; `recurringEventId` param; writes the series note), `Views/Timeline/TimelineItemCard.swift` (dim, "Free" pill, no CheckCircle, `onComplete: nil` for free events)
- Test: `SymphonyOSTests/TimelineEnrichmentTests.swift` (resolver precedence), `SyncSerializationTests.swift` (`is_free` present in `eventNoteRow`)

- [ ] Steps mirror Tasks 1–2: failing tests first; `isFree` resolution = instance note, then series note (an `EventNote` whose `googleEventId == recurringEventId`), else false; `EventDetailView` gets `recurringEventId: String?` from the card and upserts the note keyed by `recurringEventId ?? googleEventId` with `isFree` toggled (`queueSync` insert/update as `ensureNote()` does — but keyed by the series id, so add an `ensureNote(for key:)` variant); `SourcePill`-style chip "Free" in `textTertiary` on `bgSurface`; `SlideRow(onComplete: item.isFree ? nil : {...})`. Screenshot a free row via the harness. Commit `feat(ios): Free events — series-level flag, dimmed row, no completion`. Push `ios-sliders`.
