# Trim Today's Top Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Today's Focus card and demote the Weather card to a compact chip in the stats row, so the top of Today reads add-input → Carried over → timeline.

**Architecture:** In `TodayView`, remove the two-up `grid-cols-[1.6fr_1fr]` card block. A new compact `WeatherChip` (same `useWeather` hook, keeps the click→hourly-forecast popover) renders into a new `weatherTrigger` slot on `StatsRow`, next to the discussion badge. The `TodaysFocusCard` and `WeatherCard` components are deleted; the now-orphaned focus computations in `TodayView` are removed via compiler/linter guidance. `useWeather` and `weatherIcon` are kept.

**Tech Stack:** React 19 + TypeScript, Tailwind v4, Vitest + RTL, lucide-icon-based `weatherIcon`. Run tests with `npx vitest run <path>` (NOT `npm test`). Always from the worktree with PATH set:
`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/trim-today`

**No-emoji rule:** weather uses the `weatherIcon(code)` lucide component, never a literal emoji.

---

### Task 1: WeatherChip component

A compact inline weather chip (icon + temp + H/L) with a click→hourly-forecast popover. Same data source as the old card.

**Files:**
- Create: `src/components/schedule/WeatherChip.tsx`
- Test: `src/components/schedule/WeatherChip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/WeatherChip.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeatherChip } from './WeatherChip'

const useWeatherMock = vi.fn()
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => useWeatherMock() }))
afterEach(() => useWeatherMock.mockReset())

describe('WeatherChip', () => {
  it('renders nothing on error', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: false, error: 'api: Timeout' })
    render(<WeatherChip />)
    expect(screen.queryByLabelText('Weather')).not.toBeInTheDocument()
  })
  it('renders nothing while loading', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: true, error: null })
    render(<WeatherChip />)
    expect(screen.queryByLabelText('Weather')).not.toBeInTheDocument()
  })
  it('renders compact temp and high/low when populated', () => {
    useWeatherMock.mockReturnValue({
      weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54, hourlyForecast: [] },
      loading: false, error: null,
    })
    render(<WeatherChip />)
    expect(screen.getByText('72°')).toBeInTheDocument()
    expect(screen.getByText('H76/L54')).toBeInTheDocument()
  })
  it('opens an hourly forecast on click', async () => {
    useWeatherMock.mockReturnValue({
      weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54,
        hourlyForecast: [{ hour: 14, temp: 71, code: 0 }] },
      loading: false, error: null,
    })
    const { user } = render(<WeatherChip />)
    expect(screen.queryByTestId('weather-forecast')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /weather/i }))
    expect(screen.getByTestId('weather-forecast')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/WeatherChip.test.tsx`
Expected: FAIL — cannot resolve `./WeatherChip`.

- [ ] **Step 3: Implement the component**

Create `src/components/schedule/WeatherChip.tsx`:

```tsx
import { createElement, useState } from 'react'
import { useWeather } from '@/hooks/useWeather'
import { weatherIcon } from '@/lib/weatherIcon'

/**
 * Compact weather chip for the Today stats row. Replaces the old full-width
 * WeatherCard. Renders nothing while loading or on error (keeps the row calm).
 * Click toggles a small popover with the hourly forecast.
 */
export function WeatherChip() {
  const { weather, loading, error } = useWeather()
  const [open, setOpen] = useState(false)

  if (loading || error || !weather) return null

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
        aria-label="Weather"
      >
        {createElement(weatherIcon(weather.weatherCode), { className: 'w-4 h-4 text-amber-500' })}
        <span className="tabular-nums">{Math.round(weather.currentTemp)}°</span>
        <span className="text-neutral-400">H{Math.round(weather.highTemp)}/L{Math.round(weather.lowTemp)}</span>
      </button>

      {open && weather.hourlyForecast.length > 0 && (
        <div
          data-testid="weather-forecast"
          className="absolute left-0 top-full mt-2 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg p-2 flex gap-3 overflow-x-auto max-w-[20rem]"
          onMouseLeave={() => setOpen(false)}
        >
          {weather.hourlyForecast.map((h) => {
            const label = h.hour === 0 ? '12a' : h.hour === 12 ? '12p' : h.hour < 12 ? `${h.hour}a` : `${h.hour - 12}p`
            return (
              <div key={h.hour} className="flex flex-col items-center gap-0.5 text-[11px] text-neutral-500 shrink-0">
                <span>{label}</span>
                {createElement(weatherIcon(h.code), { className: 'w-4 h-4 text-amber-500' })}
                <span className="tabular-nums">{Math.round(h.temp)}°</span>
              </div>
            )
          })}
        </div>
      )}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/WeatherChip.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/WeatherChip.tsx src/components/schedule/WeatherChip.test.tsx
git commit -m "feat(today): add compact WeatherChip (replaces WeatherCard)"
```

---

### Task 2: Add `weatherTrigger` slot to StatsRow

**Files:**
- Modify: `src/components/schedule/StatsRow.tsx`

- [ ] **Step 1: Add the prop to the interface**

In `StatsRowProps`, after `discussionTrigger?: React.ReactNode`, add:

```tsx
  /** Compact weather chip, rendered among the stats. */
  weatherTrigger?: React.ReactNode
```

- [ ] **Step 2: Destructure and render it**

Add `weatherTrigger` to the destructured params of `export function StatsRow({ ... })`, and render it immediately after the `discussionTrigger` block:

```tsx
      {weatherTrigger && (
        <span className="hidden md:inline-flex items-center gap-1.5">
          {weatherTrigger}
        </span>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/StatsRow.tsx
git commit -m "feat(today): add weatherTrigger slot to StatsRow"
```

---

### Task 3: Wire WeatherChip into TodayView + remove the card block

**Files:**
- Modify: `src/components/schedule/TodayView.tsx`
- Test: `src/components/schedule/TodayView.test.tsx`

- [ ] **Step 1: Add the WeatherChip import; pass it into StatsRow**

In `src/components/schedule/TodayView.tsx`:
- Add: `import { WeatherChip } from './WeatherChip'`
- In the existing `<StatsRow ... />` invocation (where `discussionTrigger={...}` is passed), add:

```tsx
          weatherTrigger={<WeatherChip />}
```

- [ ] **Step 2: Remove the two-up card block**

Delete this entire block (currently ~lines 541–553):

```tsx
      {/* Two-up: Focus card + Weather — only shown when there is something to focus on */}
      {data.counts.totalItems > 0 && (
        <div className="hidden md:grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-4 mb-7 mt-6">
          <TodaysFocusCard
            headline={focusHeadline(health.healthColor)}
            priorities={focusPriorities}
            meals={focusMeals}
            events={focusEvents}
            onActivate={handleFocusActivate}
          />
          <WeatherCard />
        </div>
      )}
```

- [ ] **Step 3: Remove the now-dead card imports**

Delete these two imports:

```tsx
import { TodaysFocusCard } from './TodaysFocusCard'
import { WeatherCard } from './WeatherCard'
```

- [ ] **Step 4: Let the compiler/linter find orphaned focus vars, then remove them**

Run: `npx tsc --noEmit` and `npm run lint 2>&1 | rg "TodayView"`
The following fed ONLY the deleted `TodaysFocusCard` and should now be flagged unused — remove them:
- `import { focusHeadline } from '@/lib/focusHeadline'` (line ~53)
- the `const { focusPriorities, focusMeals, focusEvents } = useMemo(() => { ... }, [...])` block (lines ~326–340)
- the `handleFocusActivate` `useCallback` (line ~411)

Do **NOT** remove `useSystemHealth` / `health` — `health.healthColor` and `health.score` are still used by the clarity ring (lines ~240–255). Only remove what the compiler/linter reports as unused. Re-run `npx tsc --noEmit` until clean.

- [ ] **Step 5: Update / verify the TodayView test**

Run: `npx vitest run src/components/schedule/TodayView.test.tsx`
If a test referenced `TodaysFocusCard`/`WeatherCard` or the focus headline, update it to match the removal (the cards no longer render). The discussion-badge test added earlier must still pass. Confirm no `TodaysFocusCard`/`WeatherCard` import remains:
Run: `rg -n "TodaysFocusCard|WeatherCard" src/components/schedule/TodayView.tsx`
Expected: no output.
Expected test result: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): drop Focus/Weather card block; weather chip in stats row"
```

---

### Task 4: Delete the dead card components

**Files (delete):**
- `src/components/schedule/TodaysFocusCard.tsx` + `src/components/schedule/TodaysFocusCard.test.tsx`
- `src/components/schedule/WeatherCard.tsx` + `src/components/schedule/WeatherCard.test.tsx`

- [ ] **Step 1: Re-verify unused before deleting**

Run:
```bash
for c in TodaysFocusCard WeatherCard; do
  echo "--- $c ---"; rg -l "\b$c\b" src -g '*.tsx' -g '*.ts' | grep -v "/$c\.\(tsx\|ts\)" | grep -v "/$c\.test\."
done
```
Expected: no importers (only self/test). If any other importer appears, STOP and report.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/schedule/TodaysFocusCard.tsx src/components/schedule/TodaysFocusCard.test.tsx \
       src/components/schedule/WeatherCard.tsx src/components/schedule/WeatherCard.test.tsx
```

- [ ] **Step 3: Typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx vitest run`
Expected: PASS (deleting the two `.test` files removes their tests; nothing else imports the deleted components). Keep `weatherIcon.test` — it must still pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(today): delete dead Focus/Weather card components"
```

---

### Task 5: Full verification + push

- [ ] **Step 1: Strict build (Vercel-equivalent)**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: PASS (a known-flaky `useNotes` test may need one re-run).

- [ ] **Step 3: Lint (no new errors)**

Run: `npm run lint`
Expected: no NEW errors in touched files. (Pre-existing errors in `supabase/functions/extract-capture/lib/whatsapp.ts` are unrelated.)

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/trim-today-cards
```

- [ ] **Step 5: Report back for the merge-to-main decision**

Do NOT merge to `main` automatically. Surface the branch for review; merge only on explicit approval.

---

## Self-Review

**Spec coverage:**
- Delete Focus card (component + test + orphaned TodayView computations) → Tasks 3 (block + orphan cleanup) + 4 (delete files). ✅
- Weather → compact `WeatherChip` in stats row, same `useWeather`, keep hourly popover → Tasks 1 (component) + 2 (slot) + 3 (wire). ✅
- Remove the grid block → Task 3 Step 2. ✅
- Delete `WeatherCard` (+ test) → Task 4. ✅
- Keep `useWeather`, `weatherIcon`, `weatherIcon.test` → none deleted; `weatherIcon.test` explicitly preserved (Task 4 Step 3). ✅
- Mobile unchanged → block was `hidden md:grid`; `weatherTrigger` rendered in a `hidden md:inline-flex` span (desktop-only). ✅

**Placeholder scan:** No TBD/TODO. Task 3 Step 5 references the test file's existing pattern rather than a fixed diff (deliberate — depends on whether a test referenced the cards); the assertion + the no-import grep are explicit.

**Type/name consistency:** `WeatherChip` (no props) defined in Task 1, used identically in Task 3. `weatherTrigger?: React.ReactNode` defined in Task 2, used identically in Task 3. `useWeather` return shape (`{ weather, loading, error }` with `weather.currentTemp/weatherCode/condition/highTemp/lowTemp/hourlyForecast`) matches `src/hooks/useWeather.ts`. Forecast-hour label logic matches the old card's. `health`/`useSystemHealth` explicitly retained.
