# Fix: calendar events go stale in an open tab

## The report

"Appointment with Caitlin is not showing up on Today view, it's a calendar event
so should be there." (prod, app.symphony-os.com — other events *were* showing.)

## Root cause

Today fetched Google Calendar events **exactly once per mount** and never again.

- `HomeViewContainer` fetched on `[isConnected, viewedDate, fetchEvents]`, and
  `viewedDate` was `useState(() => new Date())` — seeded once at mount.
- There is no polling, no refetch on focus, and no realtime channel for Google
  events. (The wall has one — `useWallData.ts` listens to `visibilitychange` —
  Today did not.)

The Caitlin event was created in Google at 09:30Z, *after* the tab had loaded.
Events created before load ("Appointment with AiM", "Ladies Track Night") were in
the snapshot and rendered fine; the new one never could.

Ruled out along the way:

- Not the calendar→domain mapping filter (`google-calendar-events/index.ts:234`):
  the event Scott *could* see sits on the same calendar as the one he couldn't.
- Not the backend: invoking the edge function with his live prod session returned
  all three of the day's events, Caitlin included.
- Not a per-event filter: a fresh tab rendered all three correctly.

The same one-shot pattern had two more consequences:

- `viewedDate` never rolled over, so a tab open past midnight kept showing
  yesterday.
- The horizon rungs (`/week`, `/month`, …) took the same never-refreshed snapshot
  (`horizons/shared.tsx`).

## Changes

- [x] `src/hooks/useRefreshOnVisible.ts` — refetch when the user returns to a tab.
      Listens to `visibilitychange` *and* window `focus` (app-switching often
      fires only the latter), throttled to one refresh per 60s so alt-tabbing
      can't hammer the Google API. Does not fire on mount.
- [x] `src/hooks/useDayRollover.ts` — advance the viewed date across midnight,
      but only when the user is still on what *was* today; a date they
      deliberately navigated to is left alone. Interval-based so it also catches
      a machine that slept through the rollover.
- [x] Wire both into `HomeViewContainer`; de-duplicate the day-fetch into one
      `refetchViewedDayEvents` callback (reused by the inline event-create path).
- [x] Wire the refresh into `horizons/shared.tsx`, plus a request-token guard so
      a superseded response can't land on the wrong period.

## Verification

- 15 new unit tests across the two hooks; **mutation-tested** — removing the
  listeners or dropping the "still on today" guard turns 6 of them red.
- Full suite: 493 files / 4915 tests pass. `tsc -p tsconfig.app.json` clean.
  `npm run build` clean. ESLint clean on all changed files.
- In-browser on a real dev build signed in as Scott: instrumented `fetch` and
  confirmed a visibility return triggers exactly one `google-calendar-events`
  call, that 10 rapid returns are suppressed by the throttle, and that it
  refetches again once the window passes.

## Notes / not done

- `HomeViewContainer.tsx` has a **pre-existing** lint error (`'list' is never
  reassigned`, line 543 on main). Left alone — unrelated to this fix.
- Nothing here changes the fetch payload or the mapping rules, so egress is
  unchanged apart from at most one extra fetch per minute of active use.
