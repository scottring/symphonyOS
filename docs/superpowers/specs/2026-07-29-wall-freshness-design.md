# Wall freshness indicator + silent-failure fix

**Date:** 2026-07-29
**Status:** approved
**Branch:** `wall-freshness`

## Problem

On 2026-07-29 the kitchen kiosk sat showing only a dinner card — no events, no
routines, no tasks — with **no indication anything was wrong**. Iris's "Ladies
Track Night" was on the shared family calendar and rendered correctly in a
browser the whole time. The Pi had dropped off WiFi.

This was the second occurrence of the same signature (first: 2026-07-21). Both
times the wall looked authoritative while being hours out of date, so the
failure was only discovered by a human noticing an expected item was absent.

### Root cause

`useWallData` **already detects** the failure correctly:

- supabase-js returns `{ data: null, error }` on network failure rather than
  throwing, so the `dataError` reduction at `useWallData.ts:220` catches it.
- The hook returns `error` and `lastRefresh` in its public value.

`WallV2Shell` **never reads either one.** It destructures `wallData` and
consumes only `wallData.calendarUnavailable`. `error` and `lastRefresh` are
returned by the hook and dropped on the floor, so nothing can render them.

The comment at `useWallData.ts:219` ("the already-rendered banner tells the
family the wall is stale") refers to a banner that belonged to the legacy
`/wall` route, deleted in `f38c9ebf`/`10d190ca` on 2026-07-28.

A prior hypothesis that `lib/quietHours.ts` suppressed the banner by skipping
polls was investigated and **disproved** — the detection runs fine; there is
simply no consumer.

### Second-order defect

On a failed fetch the hook still calls `setDays()`, `setAllTasks()` etc. with
empty arrays (`tasksRes.data || []`), so the wall goes **blank** rather than
stale. A banner claiming "showing older information" would sit above empty
sections. Preserving last-good data is therefore part of this fix, not a
separate concern.

## Design

### 1. `wallFreshness.ts` — pure logic

```ts
type FreshnessLevel = 'fresh' | 'stale' | 'critical'
computeFreshness({ lastRefresh, error, now }): {
  level: FreshnessLevel
  label: string        // "Updated 5:53 PM"
  minutesStale: number
}
```

No React, no imports from components — independently testable.

Thresholds as named constants (poll interval is 12 min, so 30 min is two missed
polls rather than one blip):

| Condition | Level |
|---|---|
| `lastRefresh === null` (cold boot) | `fresh` |
| age >= 30 min | `stale` |
| age >= 60 min | `critical` |
| `error` present | at least `stale`; `critical` past the 60-min mark |

**Quiet-hours rule.** Polling is deliberately suspended 23:00–06:00
(`lib/quietHours.ts`), so age-based escalation would false-positive *every
morning* — the wall would report ~7 hours stale at 06:00. During quiet hours,
**age-based escalation is suppressed but error-based escalation is kept**: a
fetch that actually failed is real signal at any hour, and no new fetches occur
overnight to generate spurious errors.

### 2. UI

- **`WallV2FreshnessLine`** — rail line under the weather card, above the quote.
  `WALL.muted` when fresh; `WALL.warn` + lucide `AlertTriangle` otherwise.
  Always visible, because the lesson of this incident is that the *absence* of a
  warning is not evidence of freshness.
- **`WallV2StaleBanner`** — full-width top bar, `critical` only. lucide
  `WifiOff`. Copy names the real state and the real timestamp.
- **`wallTheme.ts`** — add a `WALL.warn` light/`dark:` token pair. No warning
  token exists today; adding one avoids growing the hardcoded-hex debt already
  recorded against the warm redesign.

### 3. Layout

The shell is `h-screen overflow-hidden` over a fixed
`grid-rows-[minmax(0,1fr)_116px]`. Inserting a grid row would clip content, so
the outer element becomes `flex-col`: banner (conditional), then the existing
grid as `flex-1 min-h-0`. The grid shrinks naturally when the banner appears.

### 4. Preserve last-good data

In `useWallData`, when `dataError` is set and state already holds data, skip the
overwrite instead of blanking the wall. Keeps the banner's claim honest and
makes a network blip degrade gracefully rather than destructively.

## Testing

- `wallFreshness.test.ts` — each threshold boundary, error escalation,
  quiet-hours suppression of age but not error, null-`lastRefresh` cold boot.
- Component tests — freshness line muted vs warned; banner present only at
  `critical`. Follows `WallV2ScheduleBand.test.tsx` as precedent.
- Manual verification on the running app at 5173, not just a green `tsc`.

## Out of scope

- Changing the 12-minute poll interval or the quiet-hours window.
- Any Pi-side / kiosk.sh change.
- A wall-side heartbeat reported off-device.
