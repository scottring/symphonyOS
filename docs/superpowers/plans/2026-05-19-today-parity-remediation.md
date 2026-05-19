# Today Parity Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Every implementation task AND the final review MUST also pass the §6 legacy-capability parity gate from the spec — a capability accepted as a prop but not rendered/wired = FAIL.**

**Goal:** Restore the 8 dropped legacy affordances into the live editorial `TodayView`, remove the duplicate Day/Week/Month control, and fix the dead Focus/Weather cards + cycling AI banner — all without re-denser-ifying the calm layout.

**Architecture:** Edit the live `TodayView` + its sub-pieces on `main` (seam already cut). Reuse on-disk components verbatim (`StagingFloat`, `AssigneeFilter`, `TodayAddInput`, `OverdueSection`, `EmailActionsBanner`) — wire-only. Extract `ClarityIndicator` from git as a faithful component. Data comes from the existing `useTodayData` (`data.weekTasks`, `data.overdueTasks`, `data.counts`). Worktree off latest `origin/main`; race-safe `git push origin HEAD:main` at the end.

**Tech Stack:** React 19 + TS strict, Vite, Vitest + RTL (`@/test/test-utils` `render` returns `{ user }`), Tailwind (Nordic tokens), lucide-react. `react-hooks/static-components`: factory icons via `createElement`.

**Spec:** `docs/superpowers/specs/2026-05-19-today-parity-remediation-design.md`.

---

## Pre-flight (not a code task)

- Worktree is `today-parity-remediation` off latest `origin/main` (has `TodayView`). Node PATH every command: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`. `cp /Users/scottkaufman/Developer/Developer/symphonyOS/.env .env`.
- Baseline: `npm test -- --run` → expect the one pre-existing flaky failure (`NotesPage`/`useSpaces`, mocked-Supabase, alternates per run); everything else green. Record which flaky test failed this run.
- Legacy reference (read-only): `git show 2e61ab5~1:src/components/schedule/TodaySchedule.tsx`.
- `data` (from `useTodayData(todayInput)` in `TodayView.tsx`) exposes: `data.weekTasks`, `data.overdueTasks`, `data.inboxTasks`, `data.grouped`, `data.sectionsOrder`, `data.counts.{completedCount,actionableCount,incompleteOverdue,totalItems,progressPercent}`, `data.isToday`. `ctx = useScheduleActionsContext()` exposes `onUpdateTask`, `onPushTask`, `onDeleteTask`, `onToggleTask`, `onCreateTask`, `onCreateFollowUp`, `onAssignTask`, `onAssignTaskAll`, `contactsMap`, `projectsMap`, `familyMembers`, `eventNotesMap`, `onOpenProject`.

---

## Task P0: Remove the duplicate Day/Week/Month control

**Files:** Modify `src/components/schedule/TodayHeader.tsx`, `src/components/schedule/TodayView.tsx`; Test `src/components/schedule/TodayView.test.tsx` (extend), `src/components/schedule/TodayHeader.test.tsx` (update).

- [ ] **Step 1: Update the failing test (regression guard)**

In `src/components/schedule/TodayView.test.tsx`, add inside the existing `describe('TodayView', …)`:

```tsx
it('renders NO Day/Week/Month control inside TodayView (HomeViewSwitcher owns it)', () => {
  renderView()
  expect(screen.queryByRole('button', { name: 'Week' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Month' })).not.toBeInTheDocument()
})
```
In `src/components/schedule/TodayHeader.test.tsx`, DELETE the existing test `'Week/Month buttons call onModeChange'` (the control is being removed) and any assertion referencing Week/Month buttons; keep the date-label + prev/next tests.

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest src/components/schedule/TodayView.test.tsx src/components/schedule/TodayHeader.test.tsx --run`
Expected: the new TodayView guard FAILS (Week/Month buttons still present).

- [ ] **Step 3: Remove D/W/M from `TodayHeader.tsx`**

Delete the D/W/M block (current lines ~34-44, the `<div className="flex rounded-lg bg-neutral-100 p-0.5">…</div>`). Remove `mode`, `onModeChange` from `TodayHeaderProps` and the `export type TodayMode`. The component keeps: serif date label, `‹ ›` prev/next, and the optional `onToggleWeather` button. Final `TodayHeaderProps`:

```tsx
interface TodayHeaderProps {
  viewedDate: Date
  onDateChange: (d: Date) => void
  onToggleWeather?: () => void
}
```
Remove `TodayMode` import/usages.

- [ ] **Step 4: Remove `mode` from `TodayView.tsx`**

Delete `const [mode, setMode] = useState<TodayMode>('day')` (~line 138-139) and the `TodayMode` import. Update the `<TodayHeader … />` render to drop `mode`/`onModeChange` props (pass only `viewedDate`, `onDateChange`).

- [ ] **Step 5: Run → PASS**

Run: `npx vitest src/components/schedule/TodayView.test.tsx src/components/schedule/TodayHeader.test.tsx --run`
Expected: PASS. Then `npx tsc --noEmit` (no `TodayMode`/`mode` dangling refs), `npx eslint src/components/schedule/TodayHeader.tsx src/components/schedule/TodayView.tsx --max-warnings=0`.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/TodayHeader.tsx src/components/schedule/TodayView.tsx src/components/schedule/TodayHeader.test.tsx src/components/schedule/TodayView.test.tsx
git commit -m "fix(today): remove duplicate D/W/M from TodayHeader (HomeViewSwitcher is the sole one)"
```

---

## Task P8: Fold completion progress into StatsRow

**Files:** Modify `src/components/schedule/StatsRow.tsx`, `src/components/schedule/TodayView.tsx`; Test `src/components/schedule/StatsRow.test.tsx` (extend).

- [ ] **Step 1: Failing test**

Add to `src/components/schedule/StatsRow.test.tsx`:

```tsx
it('shows completion as "N of M done today"', () => {
  render(<StatsRow dueToday={4} doneToday={1} thisWeek={2} total={9} clarityLabel="Good" aiAvailable={false} />)
  expect(screen.getByText('1 of 4 done today')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest src/components/schedule/StatsRow.test.tsx --run` (prop `doneToday` unknown / text absent).

- [ ] **Step 3: Implement**

In `StatsRow.tsx`, add `doneToday: number` to `StatsRowProps`. Replace the first "due today" span's text content so it reads `{doneToday} of {dueToday} done today` (keep the `CheckCircle2` icon + existing classes; only the text changes). Example for that span:

```tsx
<span className="inline-flex items-center gap-1.5">
  <CheckCircle2 className="w-4 h-4 text-primary-600 shrink-0" />
  {doneToday} of {dueToday} done today
</span>
```

- [ ] **Step 4: Wire in `TodayView.tsx`**

At the `<StatsRow … />` render, add `doneToday={data.counts.completedCount}` and keep `dueToday={data.counts.actionableCount}` (so it reads "completed of actionable done today"). Do not change other StatsRow props yet.

- [ ] **Step 5: Run → PASS** `npx vitest src/components/schedule/StatsRow.test.tsx src/components/schedule/TodayView.test.tsx --run`; `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/StatsRow.tsx src/components/schedule/TodayView.tsx src/components/schedule/StatsRow.test.tsx
git commit -m "feat(today): StatsRow shows 'N of M done today' (ProgressIndicator parity)"
```

---

## Task D2: Weather card expands hourly forecast on click

**Files:** Modify `src/components/schedule/WeatherCard.tsx`; Test `src/components/schedule/WeatherCard.test.tsx` (extend).

- [ ] **Step 1: Failing test**

Add to `WeatherCard.test.tsx` (it already mocks `@/hooks/useWeather`):

```tsx
it('expands an hourly forecast strip on click and collapses on second click', async () => {
  useWeatherMock.mockReturnValue({
    weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54,
      hourlyForecast: [{ hour: 14, temp: 71, code: 0 }, { hour: 15, temp: 73, code: 2 }] },
    loading: false, error: null, requestLocation: vi.fn(),
  })
  const { user } = render(<WeatherCard />)
  expect(screen.queryByTestId('weather-forecast')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /weather/i }))
  expect(screen.getByTestId('weather-forecast')).toBeInTheDocument()
  expect(screen.getByText('2p')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /weather/i }))
  expect(screen.queryByTestId('weather-forecast')).not.toBeInTheDocument()
})
it('is not clickable when forecast is empty', () => {
  useWeatherMock.mockReturnValue({
    weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54, hourlyForecast: [] },
    loading: false, error: null, requestLocation: vi.fn(),
  })
  render(<WeatherCard />)
  expect(screen.queryByRole('button', { name: /weather/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest src/components/schedule/WeatherCard.test.tsx --run`.

- [ ] **Step 3: Implement**

In `WeatherCard.tsx` (the populated branch): add `const [open, setOpen] = useState(false)`. If `weather.hourlyForecast.length > 0`, render the card root as a `<button type="button" aria-label="Weather" onClick={() => setOpen(o => !o)}>` wrapper (keep all existing inner markup/classes; add `w-full text-left`). When NOT clickable (empty forecast), keep the existing non-button `<div>`. When `open`, render below the card body:

```tsx
{open && (
  <div data-testid="weather-forecast" className="mt-3 pt-3 border-t border-neutral-200 flex gap-3 overflow-x-auto">
    {weather.hourlyForecast.map((h) => {
      const Icon = weatherIcon(h.code)
      const label = h.hour === 0 ? '12a' : h.hour === 12 ? '12p' : h.hour < 12 ? `${h.hour}a` : `${h.hour - 12}p`
      return (
        <div key={h.hour} className="flex flex-col items-center gap-0.5 text-[11px] text-neutral-500 shrink-0">
          <span>{label}</span>
          {createElement(weatherIcon(h.code), { className: 'w-4 h-4 text-amber-500' })}
          <span className="tabular-nums">{Math.round(h.temp)}°</span>
          <span className="sr-only">{Icon.name}</span>
        </div>
      )
    })}
  </div>
)}
```
Add `import { useState, createElement } from 'react'` (merge with existing react import). `weatherIcon` is already imported. The `Icon.name` sr-only line is only to keep `Icon` referenced if lint complains; if `weatherIcon` is used solely via `createElement`, drop the `const Icon` line and the sr-only span. Keep it lint-clean (no `react-hooks/static-components`).

- [ ] **Step 4: Run → PASS** `npx vitest src/components/schedule/WeatherCard.test.tsx --run`; `npx eslint src/components/schedule/WeatherCard.tsx --max-warnings=0`; `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/WeatherCard.tsx src/components/schedule/WeatherCard.test.tsx
git commit -m "feat(today): WeatherCard expands hourly forecast on click"
```

---

## Task D1: Today's Focus card scrolls to first item on click

**Files:** Modify `src/components/schedule/TodaysFocusCard.tsx`, `src/components/schedule/TodayView.tsx`; Test `src/components/schedule/TodaysFocusCard.test.tsx` (extend).

- [ ] **Step 1: Failing test**

Add to `TodaysFocusCard.test.tsx`:

```tsx
it('calls onActivate when clicked', async () => {
  const onActivate = vi.fn()
  const { user } = render(
    <TodaysFocusCard headline="x" priorities={1} meals={0} events={0} onActivate={onActivate} />
  )
  await user.click(screen.getByRole('button', { name: /today's focus/i }))
  expect(onActivate).toHaveBeenCalledTimes(1)
})
it('is a plain card (no button role) when onActivate is absent', () => {
  render(<TodaysFocusCard headline="x" priorities={1} meals={0} events={0} />)
  expect(screen.queryByRole('button', { name: /today's focus/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest src/components/schedule/TodaysFocusCard.test.tsx --run`.

- [ ] **Step 3: Implement card**

In `TodaysFocusCard.tsx`: add `onActivate?: () => void` to props. If `onActivate` is provided, render the root as `<button type="button" aria-label="Today's Focus" onClick={onActivate} className="<existing classes> w-full text-left">`; else keep the existing `<div>`. No other markup change.

- [ ] **Step 4: Wire scroll in `TodayView.tsx`**

Add a ref for the first actionable row. The simplest robust approach: a ref on the task-list container and scroll its first `[data-selectable]`/first item into view. Add near other refs:

```tsx
const listRef = useRef<HTMLDivElement>(null)
const handleFocusActivate = useCallback(() => {
  const el = listRef.current?.querySelector('[data-today-first]') as HTMLElement | null
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}, [])
```
Put `ref={listRef}` on the `.card` task-list container `<div>`. Add `data-today-first` to the FIRST rendered row: render the overdue group first if `data.isToday && data.overdueTasks.length > 0` — put `data-today-first` on its wrapper; otherwise put it on the first section's first item wrapper. Implement by computing a boolean `firstMarkerPlaced` ref/flag while rendering and tagging the first row's wrapping element with `data-today-first` exactly once. Pass `onActivate={handleFocusActivate}` to `<TodaysFocusCard>`. Import `useRef, useCallback` if not already imported.

- [ ] **Step 5: TodayView test**

Add to `TodayView.test.tsx`:

```tsx
it('focus card click scrolls the first item into view', async () => {
  const scrollSpy = vi.fn()
  // jsdom has no scrollIntoView
  window.HTMLElement.prototype.scrollIntoView = scrollSpy
  const today = new Date()
  renderView({ tasks: [{ id: 't1', title: 'First', completed: false, bucket: 'timed',
    scheduledFor: today, assignedTo: null, updatedAt: today } as never] })
  const { user } = await import('@testing-library/user-event').then(m => ({ user: m.default.setup() }))
  await user.click(screen.getByRole('button', { name: /today's focus/i }))
  expect(scrollSpy).toHaveBeenCalled()
})
```
> If `renderView` already returns `{ user }`, use that instead of re-importing. Adapt the task fixture shape to whatever `renderView`'s existing fixtures use (read the file).

- [ ] **Step 6: Run → PASS** `npx vitest src/components/schedule/TodaysFocusCard.test.tsx src/components/schedule/TodayView.test.tsx --run`; `npx tsc --noEmit`; eslint changed files.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule/TodaysFocusCard.tsx src/components/schedule/TodayView.tsx src/components/schedule/TodaysFocusCard.test.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): Focus card scrolls to first item on click"
```

---

## Task D3: AI banner client quality bar (investigate-then-remediate)

**Files:** Modify `src/components/schedule/AiSuggestionBanner.tsx`; Test `src/components/schedule/AiSuggestionBanner.test.tsx` (extend).

- [ ] **Step 1: Investigation (read-only, record findings in the commit body)**

Read `supabase/functions/proactive-engine/index.ts` (the generator). Identify: which `suggestionType`s it emits, the `confidence` values it assigns per generator, and which generators produce generic/low-value output (e.g. broad `do_today`/`stale`/`someday` with low confidence vs. actionable `call`/`text`/`email`/`navigate`/`open_link`/`followup` with phone/url payloads). From this, choose: `MIN_CONFIDENCE` (a number that excludes the low-value tier — justify from the engine's assigned values), and `ACTIONABLE_TYPES` (the allowlist of `SuggestionType`s that carry a concrete action). Write the findings + chosen constants in the commit message. If the engine file is absent/unreadable, default `MIN_CONFIDENCE = 0.6` and `ACTIONABLE_TYPES = ['call','text','email','open_link','navigate','followup','create_task']` and note that fallback.

- [ ] **Step 2: Failing test**

Replace/extend `AiSuggestionBanner.test.tsx` (it mocks `@/hooks/useProactiveSuggestions` via `hookMock`):

```tsx
const A = (o: Partial<Record<string, unknown>>) => ({ id: 'x', title: 'T', status: 'active',
  suggestionType: 'call', actionPayload: {}, confidence: 0.9, suggestionKey: 'k', ...o })

it('renders nothing when no suggestion clears the bar (low confidence)', () => {
  hookMock.mockReturnValue({ ...base, suggestions: [A({ confidence: 0.2 })], topSuggestions: [A({ confidence: 0.2 })] })
  const { container } = render(<AiSuggestionBanner />)
  expect(container.firstChild).toBeNull()
})
it('renders nothing for non-actionable types', () => {
  const s = A({ suggestionType: 'someday', confidence: 0.95 })
  hookMock.mockReturnValue({ ...base, suggestions: [s], topSuggestions: [s] })
  const { container } = render(<AiSuggestionBanner />)
  expect(container.firstChild).toBeNull()
})
it('picks the single highest-confidence actionable suggestion (deterministic, no cycling)', () => {
  const lo = A({ id: 'lo', title: 'Low', confidence: 0.7, suggestionKey: 'lo' })
  const hi = A({ id: 'hi', title: 'High', confidence: 0.95, suggestionKey: 'hi' })
  hookMock.mockReturnValue({ ...base, suggestions: [lo, hi], topSuggestions: [lo, hi] })
  const { rerender } = render(<AiSuggestionBanner />)
  expect(screen.getByText('High')).toBeInTheDocument()
  expect(screen.queryByText('Low')).not.toBeInTheDocument()
  rerender(<AiSuggestionBanner />)
  expect(screen.getByText('High')).toBeInTheDocument() // stable across re-render
})
it('a dismissed suggestionKey stays gone for the session', async () => {
  const dismiss = vi.fn()
  const s = A({ id: 's1', title: 'Solo', confidence: 0.9, suggestionKey: 'kk' })
  hookMock.mockReturnValue({ ...base, dismissSuggestion: dismiss, suggestions: [s], topSuggestions: [s] })
  const { user, rerender } = render(<AiSuggestionBanner />)
  await user.click(screen.getByRole('button', { name: /dismiss/i }))
  expect(dismiss).toHaveBeenCalledWith('s1')
  rerender(<AiSuggestionBanner />)
  expect(screen.queryByText('Solo')).not.toBeInTheDocument()
})
```
> `base` already exists in the file (`{ actOnSuggestion, dismissSuggestion, isLoading }`). Keep existing passing tests; adjust them if they relied on a sub-threshold/non-actionable suggestion rendering (those now correctly render nothing — update those expectations to reflect the new, correct behavior, do not weaken).

- [ ] **Step 3: Run → FAIL** `npx vitest src/components/schedule/AiSuggestionBanner.test.tsx --run`.

- [ ] **Step 4: Implement quality bar**

```tsx
// src/components/schedule/AiSuggestionBanner.tsx
import { useRef } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions'
import type { SuggestionType } from '@/types/proactiveSuggestion'

const MIN_CONFIDENCE = /* value chosen in Step 1 */ 0.6
const ACTIONABLE_TYPES: ReadonlySet<SuggestionType> = new Set(
  /* allowlist chosen in Step 1 */ ['call', 'text', 'email', 'open_link', 'navigate', 'followup', 'create_task'] as SuggestionType[]
)

export function AiSuggestionBanner() {
  const { topSuggestions, actOnSuggestion, dismissSuggestion } = useProactiveSuggestions()
  const dismissedKeys = useRef<Set<string>>(new Set())

  const s = topSuggestions
    .filter((x) =>
      x.status === 'active' &&
      x.confidence >= MIN_CONFIDENCE &&
      ACTIONABLE_TYPES.has(x.suggestionType) &&
      !dismissedKeys.current.has(x.suggestionKey))
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0]

  if (!s) return null

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-50/60 border border-primary-100">
      <Sparkles className="w-4 h-4 text-primary-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-600">AI suggestion</p>
        <p className="text-sm text-neutral-700 truncate">
          {s.title}{s.detail ? <span className="text-neutral-500"> — {s.detail}</span> : null}
        </p>
      </div>
      <button
        onClick={() => actOnSuggestion(s.id)}
        className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
      >
        Act
      </button>
      <button
        onClick={() => { dismissedKeys.current.add(s.suggestionKey); dismissSuggestion(s.id) }}
        aria-label="Dismiss suggestion"
        className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
```
Replace `MIN_CONFIDENCE`/`ACTIONABLE_TYPES` with the Step-1 chosen values. Note: dismissing adds the `suggestionKey` to the session-sticky ref BEFORE the hook call so a re-render filters it out even if the row lingers in `topSuggestions`.

- [ ] **Step 5: Run → PASS** `npx vitest src/components/schedule/AiSuggestionBanner.test.tsx --run`; `npx eslint src/components/schedule/AiSuggestionBanner.tsx --max-warnings=0`; `npx tsc --noEmit`.

- [ ] **Step 6: Commit** (put the Step-1 investigation findings + chosen constants in the body)

```bash
git add src/components/schedule/AiSuggestionBanner.tsx src/components/schedule/AiSuggestionBanner.test.tsx
git commit -m "fix(today): AI banner quality bar — one deterministic high-value suggestion, no cycling

Investigation: <engine generators + confidence tiers found>. Chosen
MIN_CONFIDENCE=<x>, ACTIONABLE_TYPES=<list>. Server engine quality is a
separate effort (spec non-goal)."
```

---

## Task P1: Extract `ClarityIndicator` + wire StatsRow Clarity trigger

**Files:** Create `src/components/schedule/ClarityIndicator.tsx`; Modify `src/components/schedule/StatsRow.tsx`, `src/components/schedule/TodayView.tsx`; Test `src/components/schedule/ClarityIndicator.test.tsx`, extend `StatsRow.test.tsx`.

- [ ] **Step 1: Recover legacy source**

Run: `git show 2e61ab5~1:src/components/schedule/TodaySchedule.tsx > /tmp/legacy-today.tsx`. Read lines ~46-359 — the inline `ClarityIndicator` function + its `ClarityIndicatorProps`. This is the verbatim behavior to port.

- [ ] **Step 2: Failing test**

```tsx
// src/components/schedule/ClarityIndicator.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ClarityIndicator } from './ClarityIndicator'

const baseProps = {
  tasks: [], projects: [], familyMembers: [],
  trigger: <span>Clarity Good</span>,
}

describe('ClarityIndicator', () => {
  it('renders the provided trigger and is collapsed by default', () => {
    render(<ClarityIndicator {...baseProps} />)
    expect(screen.getByText('Clarity Good')).toBeInTheDocument()
    expect(screen.queryByTestId('clarity-popover')).not.toBeInTheDocument()
  })
  it('opens the remediation popover on trigger click', async () => {
    const { user } = render(<ClarityIndicator {...baseProps} />)
    await user.click(screen.getByText('Clarity Good'))
    expect(screen.getByTestId('clarity-popover')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run → FAIL** `npx vitest src/components/schedule/ClarityIndicator.test.tsx --run`.

- [ ] **Step 4: Implement (port legacy verbatim, parameterize the trigger)**

Create `src/components/schedule/ClarityIndicator.tsx`. Port the legacy inline component's logic VERBATIM (the `useSystemHealth` usage, `unassignedTasks`/`emptyProjectsList` memos, the score ring, the expandable popover with its remediation sections + `MultiAssigneeDropdown` + empty-project buttons). Two adaptations only:
  1. Props interface (from legacy, plus an injected trigger so StatsRow controls the visible label):
  ```tsx
  interface ClarityIndicatorProps {
    tasks: Task[]
    projects: Project[]
    familyMembers: FamilyMember[]
    projectsWithLinkedEvents?: Set<string>
    onScrollToInbox?: () => void
    onClearAssigneeFilter?: () => void
    onOpenProject?: (projectId: string) => void
    onAssignTaskAll?: (taskId: string, memberIds: string[]) => void
    trigger: React.ReactNode
  }
  ```
  Render `props.trigger` inside the clickable button instead of the legacy mini-ring label (keep the `isExpanded` toggle behavior exactly). Add `data-testid="clarity-popover"` to the expanded popover container.
  2. Any factory icon → `createElement` (lint rule). Keep all imports it needs (`useSystemHealth`, `MultiAssigneeDropdown`, etc.) — they exist on disk; verify import paths compile.

- [ ] **Step 5: Wire into StatsRow + TodayView**

In `StatsRow.tsx`: change the Clarity segment from inert text to render a `clarityTrigger?: React.ReactNode` prop if provided, else the current text. Add `clarityTrigger?: React.ReactNode` to `StatsRowProps`; in the Clarity `<span>`, render `{clarityTrigger ?? <>…existing label…</>}`.

In `TodayView.tsx`: build the indicator and pass it as the trigger:
```tsx
const clarityTrigger = (
  <ClarityIndicator
    tasks={tasks}
    projects={projects ?? []}
    familyMembers={ctx.familyMembers}
    onOpenProject={ctx.onOpenProject}
    onAssignTaskAll={ctx.onAssignTaskAll}
    trigger={<span className="cursor-pointer">Clarity <span className="text-neutral-400">{clarityLabel}</span></span>}
  />
)
```
Pass `clarityTrigger={clarityTrigger}` to `<StatsRow>`. (`clarityLabel` already computed in TodayView for StatsRow.)

- [ ] **Step 6: Run → PASS** `npx vitest src/components/schedule/ClarityIndicator.test.tsx src/components/schedule/StatsRow.test.tsx src/components/schedule/TodayView.test.tsx --run`; `npx tsc --noEmit`; eslint changed files. If legacy code referenced symbols not importable on `main`, STOP → BLOCKED with the exact symbol (do not stub).

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule/ClarityIndicator.tsx src/components/schedule/ClarityIndicator.test.tsx src/components/schedule/StatsRow.tsx src/components/schedule/TodayView.tsx src/components/schedule/StatsRow.test.tsx
git commit -m "feat(today): restore Clarity remediation popover (extracted from legacy), StatsRow trigger"
```

---

## Task P2: Restore "This Week" StagingFloat via StatsRow trigger

**Files:** Modify `src/components/schedule/StatsRow.tsx`, `src/components/schedule/TodayView.tsx`; extend `TodayView.test.tsx`.

- [ ] **Step 1: Failing test**

Add to `TodayView.test.tsx`:

```tsx
it('renders the This Week staging trigger', () => {
  renderView()
  expect(screen.getByText(/this week/i)).toBeInTheDocument()
})
```
(If `renderView` yields no week tasks, StagingFloat still renders its trigger button "This week · 0"; assert the trigger is present as a button.)

- [ ] **Step 2: Run → FAIL/observe** `npx vitest src/components/schedule/TodayView.test.tsx --run` (passes only once StagingFloat trigger is rendered with that text via the week segment).

- [ ] **Step 3: Implement**

In `StatsRow.tsx`: add `weekTrigger?: React.ReactNode` to props; in the "this week" `<span>`, render `{weekTrigger ?? <>{thisWeek} tasks this week</>}`.

In `TodayView.tsx`, build StagingFloat (legacy wiring verbatim) and pass as `weekTrigger`:
```tsx
import { StagingFloat } from './StagingFloat'
…
const weekTrigger = (
  <StagingFloat
    weekTasks={data.weekTasks}
    projects={projects ?? []}
    familyMembers={ctx.familyMembers}
    onPullToToday={(taskId) => {
      const t = new Date(); t.setHours(0,0,0,0)
      ctx.onUpdateTask?.(taskId, { bucket: 'timed' as const, scheduledFor: t, isAllDay: true })
    }}
    onSelectTask={(taskId) => onSelectItem(`task-${taskId}`)}
    onCompleteTask={ctx.onToggleTask}
    onDeferTask={ctx.onPushTask ? (taskId, target) => ctx.onPushTask!(taskId, target) : undefined}
    onDeleteTask={ctx.onDeleteTask}
    onUpdateTask={ctx.onUpdateTask}
    inline
  />
)
```
Pass `weekTrigger={weekTrigger}` to `<StatsRow>`.

- [ ] **Step 4: Run → PASS** `npx vitest src/components/schedule/TodayView.test.tsx --run`; `npx tsc --noEmit`; eslint.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/StatsRow.tsx src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): restore This Week StagingFloat via StatsRow trigger"
```

---

## Task P3+P4: Assignee filter + routine toggle (quiet filter row)

**Files:** Modify `src/components/schedule/TodayView.tsx`; extend `TodayView.test.tsx`.

- [ ] **Step 1: Failing test**

```tsx
it('renders the assignee filter and a routines toggle; toggling hides routines', async () => {
  const { user } = renderView({
    assigneesWithTasks: [{ id: 'm1', name: 'Iris' } as never],
    hasUnassignedTasks: true,
    routines: [{ id: 'r1', name: 'Walk dog', /* minimal routine */ } as never],
  })
  expect(screen.getByRole('button', { name: /filter|assignee|all/i })).toBeInTheDocument()
  const toggle = screen.getByRole('button', { name: /hide daily activities|show daily activities/i })
  await user.click(toggle)
  // after hiding, the routine title should not be in the document
  expect(screen.queryByText('Walk dog')).not.toBeInTheDocument()
})
```
> Adapt the routine fixture to the minimal shape `useTodayData` needs to place it (read existing `renderView` fixtures / `TodayData` types). The assertion intent: toggling flips `hideRoutines` into the `useTodayData` input.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

In `TodayView.tsx`:
- Add `hideRoutines` state with localStorage persistence (legacy parity):
```tsx
const [hideRoutines, setHideRoutines] = useState(() => {
  try { return localStorage.getItem('symphony-hide-routines') === 'true' } catch { return false }
})
const toggleHideRoutines = useCallback(() => {
  setHideRoutines(v => { try { localStorage.setItem('symphony-hide-routines', String(!v)) } catch { /* ignore */ } return !v })
}, [])
```
- Change the `todayInput` memo: `hideRoutines: hideRoutines` (replace the hardcoded `false`) and add `hideRoutines` to its dep array.
- Render a quiet filter row directly under `<StatsRow>` (right-aligned, subtle):
```tsx
<div className="flex items-center justify-end gap-2 mb-4">
  {onSelectAssignee && (assigneesWithTasks?.length || hasUnassignedTasks) && (
    <AssigneeFilter
      selectedAssignees={selectedAssignee ? [selectedAssignee] : []}
      onSelectAssignees={(ids) => onSelectAssignee(ids.length > 0 ? ids[0] : null)}
      assigneesWithTasks={assigneesWithTasks ?? []}
      hasUnassignedTasks={!!hasUnassignedTasks}
    />
  )}
  <button
    onClick={toggleHideRoutines}
    title={hideRoutines ? 'Show daily activities' : 'Hide daily activities'}
    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all ${hideRoutines ? 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
  >
    {createElement(hideRoutines ? EyeOff : Eye, { className: 'w-4 h-4' })}
    <span className="hidden sm:inline">{hideRoutines ? 'Show daily' : 'Hide daily'}</span>
  </button>
</div>
```
Add imports: `import { AssigneeFilter } from '@/components/home/AssigneeFilter'`, `import { Eye, EyeOff } from 'lucide-react'`, ensure `useState, useCallback, createElement` imported.

- [ ] **Step 4: Run → PASS** `npx vitest src/components/schedule/TodayView.test.tsx --run`; `npx tsc --noEmit`; eslint.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): restore assignee filter + routine show/hide toggle"
```

---

## Task P5: Restore inline add (`TodayAddInput`) + section hover-"+" slots

**Files:** Modify `src/components/schedule/TodayView.tsx`; extend `TodayView.test.tsx`.

- [ ] **Step 1: Resolve handler origin (read-only)**

In `/tmp/legacy-today.tsx` (recovered legacy), find how legacy rendered the per-section hover-"+" timeline insert slots and the source of `onCreateTask` / `onCreateTaskAt` etc. Determine: does the live `HomeView` pass `onCreateTaskAt`/`onCreateEventAt`/`onCreateRoutineAt`/`onCreateNoteAt`/`onAppendNoteAt`/`onLinkNote`/`timelineNotes` to `<TodayView>` today? (It currently does NOT — confirm by reading `HomeView.tsx`.) Also find `ctx.onCreateTask` (in `ScheduleActionsContext`) for the simple `TodayAddInput`. If legacy had NO per-section insert slots (only `TodayAddInput`), scope P5 to `TodayAddInput` only and record that finding (the timeline-slot props were a never-wired forward-hook). If legacy DID render insert slots, port that exact JSX.

- [ ] **Step 2: Failing test**

```tsx
it('renders the inline "Add to today" input and creating fires onCreateTask', async () => {
  const onCreateTask = vi.fn()
  const { user } = renderView({}, { onCreateTask })  // see note on passing ctx override
  const input = screen.getByPlaceholderText(/add to today/i)
  await user.type(input, 'New thing{Enter}')
  expect(onCreateTask).toHaveBeenCalledWith('New thing')
})
```
> `renderView` wraps in `ScheduleActionsProvider value={ctxValue}`. Extend `renderView`/`ctxValue` so `onCreateTask` can be injected (read the test file; add an optional ctx-override param if not present, without weakening other tests). If `TodayAddInput`'s placeholder text differs, match the real one from `TodayAddInput.tsx`.

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement**

In `TodayView.tsx`, render below the filter row (and before the task-list `.card`), legacy parity:
```tsx
import { TodayAddInput } from './TodayAddInput'
…
{data.isToday && ctx.onCreateTask && (
  <div className="mb-4">
    <TodayAddInput onAdd={ctx.onCreateTask} />
  </div>
)}
```
If Step 1 found real per-section hover-"+" slots in legacy AND `HomeView` can supply the handlers: also forward `onCreateTaskAt` et al. from `HomeView`'s `<TodayView>` call site (add the same props legacy `<TodaySchedule>` received — compare git `2e61ab5~1:src/components/home/HomeView.tsx`) and render the slot JSX ported verbatim from legacy between sections. If Step 1 found legacy had only `TodayAddInput`, STOP after the input (do not invent slot UI) and note it in the commit body as the accurate parity outcome.

- [ ] **Step 5: Run → PASS** `npx vitest src/components/schedule/TodayView.test.tsx --run`; `npx tsc --noEmit`; eslint.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx src/components/home/HomeView.tsx 2>/dev/null
git commit -m "feat(today): restore inline TodayAddInput (+ section insert slots if legacy had them)"
```

---

## Task P6: Replace static overdue with real `OverdueSection`

**Files:** Modify `src/components/schedule/TodayView.tsx`; extend `TodayView.test.tsx`.

- [ ] **Step 1: Failing test**

```tsx
it('renders the rich OverdueSection (not plain rows) when there are overdue tasks', () => {
  const past = new Date(); past.setDate(past.getDate() - 2)
  renderView({ tasks: [{ id: 'o1', title: 'Old task', completed: false, bucket: 'timed',
    scheduledFor: past, assignedTo: null, updatedAt: past } as never] })
  expect(screen.getByText(/overdue/i)).toBeInTheDocument()
  expect(screen.getByText('Old task')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run → observe** (passes structurally only once `OverdueSection` replaces the inline rows; assert the "Overdue" header from the component).

- [ ] **Step 3: Implement**

In `TodayView.tsx`, delete the inline overdue-rows block (the `data.isToday && data.overdueTasks.length` map of `ScheduleItem`) and replace with the real component (legacy wiring; use only callbacks available from `ctx`/props — omit optional ones not available rather than invent):
```tsx
import { OverdueSection } from './OverdueSection'
…
{data.isToday && data.overdueTasks.length > 0 && (
  <OverdueSection
    tasks={data.overdueTasks}
    selectedItemId={selectedItemId}
    onSelectTask={onSelectItem}
    onToggleTask={onToggleTask}
    onPushTask={ctx.onPushTask}
    onUpdateTask={ctx.onUpdateTask}
    contactsMap={ctx.contactsMap}
    projectsMap={ctx.projectsMap}
    familyMembers={ctx.familyMembers}
    onAssignTask={ctx.onAssignTask}
    panelOpen={panelOpen}
    onClosePanel={onClosePanel}
    onDeleteTask={ctx.onDeleteTask}
  />
)}
```
Keep the `data-today-first` marker (Task D1) on the OverdueSection wrapper when overdue exists (so Focus-scroll still targets it). Preserve the section ordering (overdue before time sections).

- [ ] **Step 4: Run → PASS** `npx vitest src/components/schedule/TodayView.test.tsx --run`; `npx vitest src/components/schedule/ --run` (no regressions); `npx tsc --noEmit`; eslint.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): replace static overdue rows with rich OverdueSection"
```

---

## Task P7: Render `EmailActionsBanner`

**Files:** Modify `src/components/schedule/TodayView.tsx`; extend `TodayView.test.tsx`.

- [ ] **Step 1: Resolve the email-actions source (read-only)**

In `/tmp/legacy-today.tsx`, find how legacy obtained `emailActions` (the hook, e.g. `useEmailActionItems()` or similar — quote the import + usage: `emailActions.items/.acknowledge/.dismiss/.snooze`). Confirm that hook exists on disk.

- [ ] **Step 2: Failing test**

```tsx
it('renders the EmailActionsBanner area', () => {
  renderView()
  // EmailActionsBanner renders nothing when items empty (component self-hides);
  // assert it is mounted by checking it does not throw and the today list still renders.
  expect(screen.getByText(/Tuesday|due today|done today/i)).toBeInTheDocument()
})
```
> EmailActionsBanner self-hides on empty items, so a render-smoke test is the honest assertion here; the parity gate (review) verifies it's wired with the real hook.

- [ ] **Step 3: Implement**

In `TodayView.tsx`, using the hook found in Step 1 (e.g. `const emailActions = useEmailActionItems()`), render the banner at the top of the list area (legacy placement — above the overdue section), only when `data.isToday`:
```tsx
import { EmailActionsBanner } from './EmailActionsBanner'
import { useEmailActionItems } from '@/hooks/useEmailActionItems'   // use the REAL hook path from Step 1
…
{data.isToday && (
  <EmailActionsBanner
    items={emailActions.items}
    onAcknowledge={emailActions.acknowledge}
    onDismiss={emailActions.dismiss}
    onSnooze={emailActions.snooze}
  />
)}
```
Use the EXACT hook name/path/method names confirmed in Step 1; if they differ, use the real ones (do not guess).

- [ ] **Step 4: Run → PASS** `npx vitest src/components/schedule/TodayView.test.tsx --run`; `npx tsc --noEmit`; eslint.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): render EmailActionsBanner (parity)"
```

---

## Task FINAL: Parity gate + verification + race-safe push

**Files:** none (verification + delivery).

- [ ] **Step 1: §6 parity gate (self, then reviewer)**

Cross-check the spec §3 matrix P0-P8 + D1-D3 against the current `TodayView` render: for EACH, confirm it is functionally present and wired (clicking does the legacy thing), not just prop-compiled. Produce the checklist with file:line evidence. ANY "accepted-but-not-rendered" = not done; return to that task.

- [ ] **Step 2: Full verification**

Run: `npm run build` → clean.
Run: `npm test -- --run` → only the pre-existing flaky (`NotesPage`/`useSpaces`) may fail; zero NEW failures; `src/lib/today` parity suite green.
Run: `npx eslint src/components/schedule/TodayView.tsx src/components/schedule/StatsRow.tsx src/components/schedule/TodayHeader.tsx src/components/schedule/WeatherCard.tsx src/components/schedule/TodaysFocusCard.tsx src/components/schedule/AiSuggestionBanner.tsx src/components/schedule/ClarityIndicator.tsx --max-warnings=0` → clean.

- [ ] **Step 3: Manual smoke (note for executor)**

`npm run dev`, log in, desktop Today: confirm ONE D/W/M (top-right only), Clarity click → popover, "this week" click → StagingFloat, assignee filter + routine toggle work, "+ Add to today" works, overdue is the rich section, Weather click → forecast, Focus click → scrolls, AI banner shows ≤1 high-value suggestion (no cycling) or nothing. Stop the dev server after.

- [ ] **Step 4: Race-safe land on main**

```bash
git fetch origin main
# if HEAD's merge-base == origin/main → git push origin HEAD:main
# else replay onto latest origin/main in a temp worktree (established pattern) then push
```
Verify `origin/main` == pushed SHA. Then bring this spec + plan doc onto main if not already (cherry-pick the doc commits).

---

## Self-review notes (author)

- **Spec coverage:** P0→Task P0; P1→Task P1; P2→Task P2; P3+P4→Task P3+P4; P5→Task P5; P6→Task P6; P7→Task P7; P8→Task P8; D1→Task D1; D2→Task D2; D3→Task D3; §6 parity gate→Task FINAL Step 1 (and the plan header mandates it per-task). All spec rows mapped.
- **Placeholder scan:** D3's `MIN_CONFIDENCE`/`ACTIONABLE_TYPES` are explicitly investigation-derived with a stated concrete fallback (not a vague TBD — systematic-debugging requires deriving from evidence). P5's slot scope is conditional with a defined resolution + "do not invent" guard. P7 hook name is "confirm the real one in Step 1" with a concrete default to verify. No vague placeholders.
- **Type consistency:** `clarityTrigger`/`weekTrigger`/`doneToday`/`onActivate`/`clarityLabel` introduced and consumed consistently across P8/P1/P2/D1 and StatsRow/TodayView. `data.*`/`ctx.*` field names match the verbatim reference.
- **Open assumptions flagged for execution:** P5 (legacy slot existence + HomeView forwarding) and P7 (exact email-actions hook) each carry a read-only resolution step before code, with "use the real one / STOP if absent" — not guesses.
