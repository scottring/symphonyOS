# Today Rebuild — Combined Plan R1–R4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cohesive Today rebuild — Surface meal sections (R1), WeatherCard + AiSuggestionBanner (R2), the `TodayView` editorial shell (R3) — entirely behind the seam, then one cutover (R4) that swaps `HomeView` to `TodayView`, declutters the GCal banner, and retires legacy `TodaySchedule`.

**Architecture:** Reuse what exists. R1 extends the live Surface section system (`Panel*` components) per `2026-05-08-surface-design.md`. R2 wraps the existing `useWeather`/`useProactiveSuggestions` hooks. R3 composes the Phase-1 `useTodayData` (already on `main`) + salvaged PR#10 components into the §4 editorial shell. R4 is a mechanical cutover gated by the existing Phase-1 parity test. Nothing reaches the live `today` route until R4.

**Tech Stack:** React 19 + TS strict, Vite, Vitest + RTL (`@/test/test-utils` `render` returns `{ user }`), Tailwind (Nordic tokens), lucide-react.

**Spec:** `docs/superpowers/specs/2026-05-19-today-redesign-rebuild-design.md` (revised post-Phase-1).

---

## Pre-flight (not a code task)

- **Base branch.** Phase 1 (`useTodayData`, `src/lib/today/*`) is on `main`. Create a fresh worktree off the latest `origin/main` for R1–R4 (do NOT build on `worktree-today-redesign-layer1` — it carries the rejected additive Layer 1). Use the `EnterWorktree` tool / `superpowers:using-git-worktrees`. Branch name suggestion: `today-rebuild`.
- **Salvage cherry-pick (one-time, first task does this).** The clean PR#10 new-file pieces are on branch `worktree-today-redesign-layer1`. They are pure new files; cherry-pick the specific commits in Task R0.
- Node PATH for every command: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`. Copy env: `cp /Users/scottkaufman/Developer/Developer/symphonyOS/.env .env`.
- Baseline: `npm test -- --run` → expect the one pre-existing flaky failure (`NotesPage`/`useSpaces`, mocked-Supabase, varies per run) and the rest green. No NEW failures permitted.
- **Seam invariant (R1–R3):** do NOT modify `src/components/home/HomeView.tsx`, `src/components/layout/ViewRouter.tsx`, or `src/components/schedule/TodaySchedule.tsx` until R4. A verification step enforces this.

## Shared contracts (locked — referenced by all phases)

**Surface section component contract** (from `src/components/surface/sections/PanelLinks.tsx`):
- `export function PanelX(props: PanelXProps)`; returns `null` when there is nothing to show (and no add handler).
- Wrapper: `<section className="mb-4">`; eyebrow: `<div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">LABEL</div>`.
- Optional injected mutation handler (e.g. `onAddX?`) — when absent, the section is display-only (mirrors `PanelLinks` `onAddLink?`).
- Test pattern: `import { render } from '@/test/test-utils'`; `import { screen } from '@testing-library/react'`; "renders nothing" asserted via `const { container } = render(...); expect(container.firstChild).toBeNull()`.

**Existing section props (verbatim, for recomposition):**
- `PanelHeader`: `{ title: string; onTitleChange: (n: string) => void; onClose: () => void }`
- `PanelMetaRow`: `{ bucket: string; assigneeName?: string; createdByName?: string; domain?: 'work'|'family'|'personal' }`
- `PanelActions`: `{ completed: boolean; phoneNumber?: string; scheduledFor?: Date; isAllDay?: boolean; isPinned: boolean; onToggleComplete: () => void; onSchedule: (d: Date, allDay: boolean) => void; onClearSchedule?: () => void; onTogglePin: () => void; onDelete: () => void }`
- `PanelWhy`: `{ notes: string | undefined; onChange: (n: string) => void }` (rendered with `key` to reset on entity change)
- `PanelLinks`: `{ links: TaskLink[] | undefined; onAddLink?: (url: string) => void }`
- `PanelFooter`: `{ createdAt: Date; updatedAt: Date; createdByName?: string }`

**Existing hooks (verbatim):**
- `useWeather(): { weather: { currentTemp: number; weatherCode: number; condition: string; highTemp: number; lowTemp: number; hourlyForecast: {hour:number;temp:number;code:number}[] } | null; loading: boolean; error: string | null; requestLocation: () => Promise<void> }`
- `useProactiveSuggestions(): { suggestions: ProactiveSuggestion[]; topSuggestions: ProactiveSuggestion[]; actOnSuggestion: (id: string, detail?: string, outcome?: string) => Promise<void>; dismissSuggestion: (id: string) => Promise<void>; isLoading: boolean; ... }`. `ProactiveSuggestion` (from `src/types/proactiveSuggestion.ts`): `{ id, title, detail?, suggestionType, actionType?, actionPayload, status, confidence, ... }`.
- `useTodayData(input: TodayDataInput): TodayData` (on `main`, `src/hooks/useTodayData.ts`). `TodayData = { isToday, overdueTasks, inboxTasks, weekTasks, completedInboxTasks, grouped: Record<DaySection, TimelineItem[]>, sectionsOrder: DaySection[], counts: { completedCount, incompleteOverdue, actionableCount, totalItems, progressPercent } }`. `TodayDataInput` (from `src/lib/today/types.ts`): `{ tasks, events, routines, dateInstances, viewedDate, selectedAssignee, hideRoutines, eventNotesMap?, eventContextOverrides?, getDomainForCalendar? }`.

**Salvaged PR#10 signatures (cherry-picked in R0):**
- `greetingForHour(hour: number, name: string): string`
- `categoryIcon(category: string|undefined): { Icon: LucideIcon; tint: string }`
- `initialsFor(name: string): string`
- `daySectionMeta(section: DaySection): { label: string; range: string; Icon: LucideIcon }`
- `focusHeadline(state: 'excellent'|'good'|'fair'|'needsAttention'): string`
- `HouseIllustration({ className?: string })`
- `StatsRow({ dueToday: number; thisWeek: number; total: number; clarityLabel: string; aiAvailable: boolean })`
- `TodaysFocusCard({ headline: string; priorities: number; meals: number; events: number })`

---

## Task R0: Branch + salvage cherry-pick + baseline

**Files:** none authored (git ops only).

- [ ] **Step 1: Confirm worktree + base**

You are in a fresh worktree off `origin/main`. Run:
`git log --oneline -1 && git ls-files | grep -c 'src/lib/today/computeTodayData.ts'`
Expected: HEAD is a recent `main` commit; the grep prints `1` (Phase-1 `useTodayData` present).

- [ ] **Step 2: Cherry-pick the salvaged PR#10 new-file commits**

These commits add only new files (helpers + HouseIllustration + StatsRow + TodaysFocusCard). Apply them from the PR#10 branch:

```bash
git cherry-pick 72c7394 f609ba1 a58523b 255ac1a 5e89403 025a7cb
```

(Commits: `72c7394` greetingForHour, `f609ba1` categoryIcon, `a58523b` initialsFor, `255ac1a` daySectionMeta+TimeGroup, `5e89403` StatsRow, `025a7cb` TodaysFocusCard. `HouseIllustration` rides in `f2a82d5` which also edits Sidebar — do NOT take it; recreate `HouseIllustration` standalone in Step 3 instead.)

If any cherry-pick conflicts (e.g. `255ac1a`/`5e89403` touch `TodaySchedule.tsx`/`TimeGroup.tsx`), abort that pick and instead copy ONLY the new files from the PR#10 branch:
`git checkout worktree-today-redesign-layer1 -- src/lib/greeting.ts src/lib/greeting.test.ts src/lib/categoryIcon.tsx src/lib/categoryIcon.test.tsx src/lib/initials.ts src/lib/initials.test.ts src/lib/daySectionMeta.tsx src/lib/daySectionMeta.test.tsx src/lib/focusHeadline.ts src/lib/focusHeadline.test.ts src/components/schedule/StatsRow.tsx src/components/schedule/StatsRow.test.tsx src/components/schedule/TodaysFocusCard.tsx src/components/schedule/TodaysFocusCard.test.tsx`
then `git add -A && git commit -m "chore: salvage clean PR#10 helper/component files"`. Do NOT take `TodaySchedule.tsx`, `Sidebar.tsx`, `ScheduleItem.tsx`, or `TimeGroup.tsx` from that branch.

- [ ] **Step 3: Recreate `HouseIllustration` standalone**

Create `src/components/layout/HouseIllustration.tsx`:

```tsx
/** Calm Nordic-Journal house + landscape mark for the sidebar/shell foot. Decorative. */
export function HouseIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" role="img" aria-label="A small house among trees"
      className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="70" rx="52" ry="7" fill="hsl(140 20% 88%)" />
      <circle cx="30" cy="48" r="14" fill="hsl(150 25% 72%)" />
      <circle cx="92" cy="50" r="11" fill="hsl(150 25% 76%)" />
      <rect x="48" y="40" width="30" height="26" rx="2" fill="hsl(28 40% 86%)" />
      <path d="M45 41 L63 26 L81 41 Z" fill="hsl(14 45% 55%)" />
      <rect x="58" y="52" width="9" height="14" rx="1" fill="hsl(168 45% 30%)" />
      <rect x="51" y="45" width="7" height="7" rx="1" fill="hsl(45 60% 92%)" />
    </svg>
  )
}
```

- [ ] **Step 4: Verify salvage + baseline**

Run: `npx vitest src/lib/greeting.test.ts src/lib/categoryIcon.test.tsx src/lib/initials.test.ts src/lib/daySectionMeta.test.tsx src/lib/focusHeadline.test.ts src/components/schedule/StatsRow.test.tsx src/components/schedule/TodaysFocusCard.test.tsx --run`
Expected: all salvaged suites pass.
Run: `npm run build` → clean.
Run: `git diff --name-only origin/main...HEAD | grep -E 'TodaySchedule|HomeView|ViewRouter' || echo SEAM-CLEAN` → expect `SEAM-CLEAN`.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/HouseIllustration.tsx
git commit -m "chore: recreate HouseIllustration standalone for rebuild"
```

---

# R1 — Surface meal sections

## Task R1.1: `PanelIngredients` section

Renders a recipe's `ingredients: string[]` as a checklist (ephemeral local check state — the mockup shows checkboxes; checked-state persistence is not in the meal data model and is out of scope). Renders nothing when there are no ingredients. No add affordance in v1 (recipe mutation is out of scope; documented follow-up).

**Files:**
- Create: `src/components/surface/sections/PanelIngredients.tsx`
- Test: `src/components/surface/sections/PanelIngredients.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/surface/sections/PanelIngredients.test.tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelIngredients } from './PanelIngredients'

describe('PanelIngredients', () => {
  it('renders nothing when ingredients empty or undefined', () => {
    const a = render(<PanelIngredients ingredients={[]} />)
    expect(a.container.firstChild).toBeNull()
    const b = render(<PanelIngredients ingredients={undefined} />)
    expect(b.container.firstChild).toBeNull()
  })
  it('renders the INGREDIENTS eyebrow and each ingredient', () => {
    render(<PanelIngredients ingredients={['Pasta', 'Cannellini beans', 'Celery']} />)
    expect(screen.getByText(/ingredients/i)).toBeInTheDocument()
    expect(screen.getByText('Pasta')).toBeInTheDocument()
    expect(screen.getByText('Cannellini beans')).toBeInTheDocument()
    expect(screen.getByText('Celery')).toBeInTheDocument()
  })
  it('toggles a checkbox locally on click', async () => {
    const { user } = render(<PanelIngredients ingredients={['Pasta']} />)
    const cb = screen.getByRole('checkbox', { name: 'Pasta' })
    expect(cb).not.toBeChecked()
    await user.click(cb)
    expect(cb).toBeChecked()
  })
})
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest src/components/surface/sections/PanelIngredients.test.tsx --run` → FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelIngredients.tsx
import { useState } from 'react'

interface PanelIngredientsProps {
  ingredients: string[] | undefined
}

export function PanelIngredients({ ingredients }: PanelIngredientsProps) {
  const list = ingredients ?? []
  const [checked, setChecked] = useState<Set<number>>(new Set())
  if (list.length === 0) return null

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Ingredients</div>
      <ul className="space-y-1">
        {list.map((item, i) => (
          <li key={`${item}-${i}`} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={item}
              checked={checked.has(i)}
              onChange={() => toggle(i)}
              className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
            />
            <span className={`text-sm ${checked.has(i) ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Run → PASS (3 tests).** `npx vitest src/components/surface/sections/PanelIngredients.test.tsx --run`

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelIngredients.tsx src/components/surface/sections/PanelIngredients.test.tsx
git commit -m "feat(surface): PanelIngredients section"
```

## Task R1.2: `PanelWhatToBring` section

Mockup's "WHAT TO BRING" under a meal is a free-text notes area ("Add notes…"). `useMealPlan` exposes no notes writer, so v1 follows the `PanelWhy` shape: render notes text; accept an optional `onChange`. When no `onChange` is provided it is display-only (renders nothing if also empty). `TapMealPanel` passes `entry.notes` and omits `onChange` (no meal-notes write path exists yet — documented follow-up, same posture as the §6 weather_window rule).

**Files:**
- Create: `src/components/surface/sections/PanelWhatToBring.tsx`
- Test: `src/components/surface/sections/PanelWhatToBring.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/surface/sections/PanelWhatToBring.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelWhatToBring } from './PanelWhatToBring'

describe('PanelWhatToBring', () => {
  it('renders nothing when empty and no onChange', () => {
    const { container } = render(<PanelWhatToBring notes={undefined} />)
    expect(container.firstChild).toBeNull()
  })
  it('renders the WHAT TO BRING eyebrow and notes text (read-only)', () => {
    render(<PanelWhatToBring notes={'Navy beans if out of cannellini'} />)
    expect(screen.getByText(/what to bring/i)).toBeInTheDocument()
    expect(screen.getByText('Navy beans if out of cannellini')).toBeInTheDocument()
  })
  it('renders an editable textarea when onChange provided and calls it on blur', async () => {
    const onChange = vi.fn()
    const { user } = render(<PanelWhatToBring notes={''} onChange={onChange} />)
    const ta = screen.getByPlaceholderText(/add notes/i)
    await user.type(ta, 'salad bowl')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith('salad bowl')
  })
})
```

- [ ] **Step 2: Run → FAIL.** `npx vitest src/components/surface/sections/PanelWhatToBring.test.tsx --run`

- [ ] **Step 3: Implement**

```tsx
// src/components/surface/sections/PanelWhatToBring.tsx
import { useState } from 'react'

interface PanelWhatToBringProps {
  notes: string | undefined
  /** Optional. When absent the section is display-only (PanelLinks pattern). */
  onChange?: (next: string) => void
}

export function PanelWhatToBring({ notes, onChange }: PanelWhatToBringProps) {
  const [draft, setDraft] = useState(notes ?? '')
  const hasText = (notes ?? '').trim().length > 0
  if (!hasText && !onChange) return null

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">What to bring</div>
      {onChange ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== (notes ?? '')) onChange(draft) }}
          placeholder="Add notes…"
          rows={2}
          className="w-full text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50 resize-none"
        />
      ) : (
        <p className="text-sm text-neutral-700 whitespace-pre-wrap">{notes}</p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run → PASS (3 tests).**

- [ ] **Step 5: Commit**

```bash
git add src/components/surface/sections/PanelWhatToBring.tsx src/components/surface/sections/PanelWhatToBring.test.tsx
git commit -m "feat(surface): PanelWhatToBring section"
```

## Task R1.3: Recompose `TapMealPanel` to the mockup section order

Replace the ad-hoc "Recipe" block with the canonical Surface order: `PanelHeader → PanelMetaRow → PanelActions → PanelWhy(ABOUT) → PanelWhatToBring → PanelIngredients → PanelLinks(LINKS & FILES) → PanelFooter(CREATED)`. Keep the existing recipe swap/remove via the `RecipePickerModal` as the `PanelActions` "More"/edit path. Use only data already resolved in the file (`entry`, `recipe`, `useMealPlan`, `useRecipes`).

**Files:**
- Modify: `src/components/surface/TapMealPanel.tsx`
- Test: `src/components/surface/TapMealPanel.test.tsx` (extend existing)

- [ ] **Step 1: Read current `TapMealPanel.tsx` + its test**

Read both fully. Note: it resolves `entry = plan?.entries.find(e => e.id === entryId)` and `recipe = recipes.find(r => r.id === entry.recipeId)`; has `handleRemove` (removeMeal) and `setPickerOpen` (RecipePickerModal) already.

- [ ] **Step 2: Write failing test additions**

Append to `src/components/surface/TapMealPanel.test.tsx` (keep existing tests):

```tsx
// add to existing describe('TapMealPanel', ...) — uses the file's existing mock setup
it('renders ABOUT, INGREDIENTS, LINKS & FILES, CREATED sections for a recipe-backed meal', async () => {
  // The existing test file already mocks useMealPlan/useRecipes to yield a recipe
  // with ingredients + sourceUrl. Reuse that harness (do not invent a new one).
  // Assert the new section eyebrows render in order:
  const eyebrows = await screen.findAllByText(
    /about|what to bring|ingredients|links|created/i
  )
  expect(eyebrows.length).toBeGreaterThanOrEqual(2)
  expect(screen.getByText(/ingredients/i)).toBeInTheDocument()
})
```

> If the existing `TapMealPanel.test.tsx` mock recipe has no `ingredients`, extend that mock minimally to include `ingredients: ['Pasta','Celery']` and `sourceUrl`. Do not weaken existing assertions.

- [ ] **Step 3: Run → FAIL.** `npx vitest src/components/surface/TapMealPanel.test.tsx --run` (new assertion fails).

- [ ] **Step 4: Recompose the panel body**

In `TapMealPanel.tsx`, add imports:
```tsx
import { PanelActions } from './sections/PanelActions'
import { PanelWhy } from './sections/PanelWhy'
import { PanelWhatToBring } from './sections/PanelWhatToBring'
import { PanelIngredients } from './sections/PanelIngredients'
import { PanelLinks } from './sections/PanelLinks'
```
Replace the `<section>…Recipe…</section>` block (between `<PanelMetaRow … />` and `<PanelFooter … />`) with:

```tsx
<PanelActions
  completed={false}
  scheduledFor={startIso ? new Date(startIso) : undefined}
  isAllDay={false}
  isPinned={false}
  onToggleComplete={() => { /* meals are not completable here; no-op keeps the Done affordance inert until a meal-complete path exists */ }}
  onSchedule={() => { /* meal time derives from the plan slot; reschedule is via Change recipe flow */ }}
  onTogglePin={() => { /* meals are not pinnable */ }}
  onDelete={handleRemove}
/>
<PanelWhy key={entry?.id ?? event.id} notes={recipe?.title ? `Recipe: ${recipe.title}` : entry?.adHocTitle} onChange={() => { /* about derives from recipe; read-only here */ }} />
<PanelWhatToBring notes={entry?.notes} />
<PanelIngredients ingredients={recipe?.ingredients} />
<PanelLinks links={recipe?.sourceUrl ? [{ url: recipe.sourceUrl, title: recipe.title }] : undefined} />
```
Keep the `RecipePickerModal` at the end and a single small "Change recipe" affordance — move it to just below `PanelActions` (a `<button onClick={() => setPickerOpen(true)}>` styled like the existing one) so swap stays reachable. Keep `PanelHeader`, `PanelMetaRow`, `PanelFooter` exactly as they are.

> Rationale notes are inline so reviewers see the deliberate no-ops (meals have no complete/pin/notes-write path; documented in spec §6/§11). `PanelWhy` requires an `onChange`; the no-op keeps the contract while ABOUT stays derived. Empty sections self-hide (Surface contract).

- [ ] **Step 5: Run → PASS.** `npx vitest src/components/surface/TapMealPanel.test.tsx --run` (all green, old + new). Then `npx vitest src/components/surface/ --run` (no regressions across the surface suite). `npx tsc --noEmit` clean for the file.

- [ ] **Step 6: Commit**

```bash
git add src/components/surface/TapMealPanel.tsx src/components/surface/TapMealPanel.test.tsx
git commit -m "feat(surface): recompose TapMealPanel to mockup section order"
```

---

# R2 — WeatherCard + AiSuggestionBanner

## Task R2.1: `weatherIcon` helper (WMO code → lucide)

**Files:**
- Create: `src/lib/weatherIcon.tsx`
- Test: `src/lib/weatherIcon.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/lib/weatherIcon.test.tsx
import { describe, it, expect } from 'vitest'
import { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning } from 'lucide-react'
import { weatherIcon } from './weatherIcon'

describe('weatherIcon', () => {
  it('maps WMO codes to lucide icons', () => {
    expect(weatherIcon(0)).toBe(Sun)
    expect(weatherIcon(2)).toBe(CloudSun)
    expect(weatherIcon(3)).toBe(Cloud)
    expect(weatherIcon(45)).toBe(CloudFog)
    expect(weatherIcon(61)).toBe(CloudRain)
    expect(weatherIcon(73)).toBe(CloudSnow)
    expect(weatherIcon(95)).toBe(CloudLightning)
  })
  it('falls back to Cloud for unknown codes', () => {
    expect(weatherIcon(999)).toBe(Cloud)
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```tsx
// src/lib/weatherIcon.tsx
import { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning, type LucideIcon } from 'lucide-react'

/** WMO weather code → lucide icon. Ranges per Open-Meteo (used by useWeather). */
export function weatherIcon(code: number): LucideIcon {
  if (code >= 95) return CloudLightning
  if (code >= 71 && code <= 86) return CloudSnow
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if (code >= 45 && code <= 48) return CloudFog
  if (code === 3) return Cloud
  if (code === 1 || code === 2) return CloudSun
  if (code === 0) return Sun
  return Cloud
}
```

- [ ] **Step 4: Run → PASS (2 tests).**

- [ ] **Step 5: Commit**

```bash
git add src/lib/weatherIcon.tsx src/lib/weatherIcon.test.tsx
git commit -m "feat(weather): weatherIcon WMO→lucide helper"
```

## Task R2.2: `WeatherCard`

Consumes the existing `useWeather()`. Loading → skeleton; error/null → muted unavailable; populated → icon + temp + condition + High/Low. Matches the mockup weather card.

**Files:**
- Create: `src/components/schedule/WeatherCard.tsx`
- Test: `src/components/schedule/WeatherCard.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/components/schedule/WeatherCard.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeatherCard } from './WeatherCard'

const useWeatherMock = vi.fn()
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => useWeatherMock() }))
afterEach(() => useWeatherMock.mockReset())

describe('WeatherCard', () => {
  it('shows unavailable on error', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: false, error: 'api: Timeout', requestLocation: vi.fn() })
    render(<WeatherCard />)
    expect(screen.getByText(/weather unavailable/i)).toBeInTheDocument()
  })
  it('shows a skeleton while loading', () => {
    useWeatherMock.mockReturnValue({ weather: null, loading: true, error: null, requestLocation: vi.fn() })
    render(<WeatherCard />)
    expect(screen.getByTestId('weather-skeleton')).toBeInTheDocument()
  })
  it('renders temp, condition, high/low when populated', () => {
    useWeatherMock.mockReturnValue({
      weather: { currentTemp: 72, weatherCode: 0, condition: 'Clear', highTemp: 76, lowTemp: 54, hourlyForecast: [] },
      loading: false, error: null, requestLocation: vi.fn(),
    })
    render(<WeatherCard />)
    expect(screen.getByText('72°')).toBeInTheDocument()
    expect(screen.getByText('Clear')).toBeInTheDocument()
    expect(screen.getByText(/54°/)).toBeInTheDocument()
    expect(screen.getByText(/76°/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```tsx
// src/components/schedule/WeatherCard.tsx
import { useWeather } from '@/hooks/useWeather'
import { weatherIcon } from '@/lib/weatherIcon'

export function WeatherCard() {
  const { weather, loading, error } = useWeather()

  if (loading) {
    return (
      <div className="card px-5 py-4" data-testid="weather-skeleton">
        <div className="h-9 w-24 rounded bg-neutral-100 animate-pulse" />
      </div>
    )
  }
  if (error || !weather) {
    return (
      <div className="card px-5 py-4 text-[13px] text-neutral-400">
        Weather unavailable
      </div>
    )
  }
  const Icon = weatherIcon(weather.weatherCode)
  return (
    <div className="card px-5 py-4 flex items-center gap-4">
      <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 text-amber-500">
        <Icon className="w-6 h-6" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Weather</p>
        <p className="font-display text-2xl text-neutral-800 leading-tight">
          {Math.round(weather.currentTemp)}° <span className="text-base text-neutral-500 align-middle">{weather.condition}</span>
        </p>
        <p className="text-[12px] text-neutral-400">
          Low {Math.round(weather.lowTemp)}° · High {Math.round(weather.highTemp)}°
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run → PASS (3 tests).** `npx tsc --noEmit` clean for file.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/WeatherCard.tsx src/components/schedule/WeatherCard.test.tsx
git commit -m "feat(today): WeatherCard reusing existing useWeather"
```

## Task R2.3: `AiSuggestionBanner`

Renders the top active suggestion from the existing `useProactiveSuggestions()`. Empty → renders nothing (no fabricated copy). Dismiss → `dismissSuggestion`; primary action → `actOnSuggestion`.

**Files:**
- Create: `src/components/schedule/AiSuggestionBanner.tsx`
- Test: `src/components/schedule/AiSuggestionBanner.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/components/schedule/AiSuggestionBanner.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { AiSuggestionBanner } from './AiSuggestionBanner'

const hookMock = vi.fn()
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => hookMock() }))
afterEach(() => hookMock.mockReset())

const base = { actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }

describe('AiSuggestionBanner', () => {
  it('renders nothing when there are no suggestions', () => {
    hookMock.mockReturnValue({ ...base, suggestions: [], topSuggestions: [] })
    const { container } = render(<AiSuggestionBanner />)
    expect(container.firstChild).toBeNull()
  })
  it('renders the top suggestion title + detail', () => {
    const s = { id: 's1', title: 'You have 3 outdoor tasks', detail: 'Thursday looks ideal', status: 'active', suggestionType: 'do_today', actionPayload: {}, confidence: 0.9 }
    hookMock.mockReturnValue({ ...base, suggestions: [s], topSuggestions: [s] })
    render(<AiSuggestionBanner />)
    expect(screen.getByText('You have 3 outdoor tasks')).toBeInTheDocument()
    expect(screen.getByText('Thursday looks ideal')).toBeInTheDocument()
  })
  it('dismiss calls dismissSuggestion with the id', async () => {
    const dismiss = vi.fn()
    const s = { id: 's1', title: 'X', status: 'active', suggestionType: 'do_today', actionPayload: {}, confidence: 0.5 }
    hookMock.mockReturnValue({ ...base, dismissSuggestion: dismiss, suggestions: [s], topSuggestions: [s] })
    const { user } = render(<AiSuggestionBanner />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(dismiss).toHaveBeenCalledWith('s1')
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```tsx
// src/components/schedule/AiSuggestionBanner.tsx
import { Sparkles, X } from 'lucide-react'
import { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions'

export function AiSuggestionBanner() {
  const { topSuggestions, actOnSuggestion, dismissSuggestion } = useProactiveSuggestions()
  const s = topSuggestions.find((x) => x.status === 'active') ?? topSuggestions[0]
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
        onClick={() => dismissSuggestion(s.id)}
        aria-label="Dismiss suggestion"
        className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run → PASS (3 tests).** `npx tsc --noEmit` clean for file.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/AiSuggestionBanner.tsx src/components/schedule/AiSuggestionBanner.test.tsx
git commit -m "feat(today): AiSuggestionBanner rendering existing engine suggestions"
```

---

# R3 — TodayView editorial shell

> R3 builds the shell and its sub-pieces but does NOT wire it to the route (that is R4). It composes `useTodayData` (on `main`) + salvaged components. The exact prop set `TodayView` accepts mirrors the current `TodaySchedule` call site at `HomeView.tsx:276` (so R4 is a drop-in swap).

## Task R3.1: `EveningMealCard`

The peach-tinted meal card for the Evening section (image, title + sides, View recipe, avatars, "Add to plan", "Meal prep" tag). Presentational; data passed in.

**Files:**
- Create: `src/components/schedule/EveningMealCard.tsx`
- Test: `src/components/schedule/EveningMealCard.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/components/schedule/EveningMealCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { EveningMealCard } from './EveningMealCard'

describe('EveningMealCard', () => {
  it('renders title, sides, time and a View recipe link when recipeUrl present', () => {
    render(<EveningMealCard title="Pasta e fagioli" sides="wilted spinach · big green salad"
      timeLabel="6:30 PM" recipeUrl="https://r.co/x" onSelect={vi.fn()} />)
    expect(screen.getByText('Pasta e fagioli')).toBeInTheDocument()
    expect(screen.getByText(/wilted spinach/)).toBeInTheDocument()
    expect(screen.getByText('6:30 PM')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view recipe/i })).toHaveAttribute('href', 'https://r.co/x')
  })
  it('omits the recipe link when no recipeUrl', () => {
    render(<EveningMealCard title="Leftovers" timeLabel="6:30 PM" onSelect={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /view recipe/i })).not.toBeInTheDocument()
  })
  it('calls onSelect when the card body is clicked', async () => {
    const onSelect = vi.fn()
    const { user } = render(<EveningMealCard title="X" timeLabel="6:30 PM" onSelect={onSelect} />)
    await user.click(screen.getByText('X'))
    expect(onSelect).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```tsx
// src/components/schedule/EveningMealCard.tsx
import { UtensilsCrossed } from 'lucide-react'

interface EveningMealCardProps {
  title: string
  sides?: string
  timeLabel: string
  recipeUrl?: string
  imageUrl?: string
  onSelect: () => void
}

export function EveningMealCard({ title, sides, timeLabel, recipeUrl, imageUrl, onSelect }: EveningMealCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[hsl(28_55%_94%)] cursor-pointer hover:bg-[hsl(28_55%_92%)] transition-colors"
    >
      <span className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-[hsl(28_45%_86%)] flex items-center justify-center">
        {imageUrl
          ? <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          : <UtensilsCrossed className="w-6 h-6 text-[hsl(14_45%_50%)]" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[hsl(14_40%_45%)]">
          Dinner at {timeLabel}
        </p>
        <p className="font-display text-lg text-neutral-800 leading-tight truncate">{title}</p>
        {sides && <p className="text-[13px] text-neutral-500 truncate">{sides}</p>}
      </div>
      {recipeUrl && (
        <a
          href={recipeUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium bg-white/70 text-[hsl(14_40%_40%)] hover:bg-white"
        >
          View recipe →
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run → PASS (3 tests).**

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/EveningMealCard.tsx src/components/schedule/EveningMealCard.test.tsx
git commit -m "feat(today): EveningMealCard styled meal card"
```

## Task R3.2: `TodayHeader`

Date (serif) + `‹ ›` + Day/Week/Month segmented + weather toggle. Presentational; callbacks injected.

**Files:**
- Create: `src/components/schedule/TodayHeader.tsx`
- Test: `src/components/schedule/TodayHeader.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/components/schedule/TodayHeader.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TodayHeader } from './TodayHeader'

const d = new Date('2026-05-19T09:00:00')

describe('TodayHeader', () => {
  it('renders the formatted date and prev/next controls', () => {
    render(<TodayHeader viewedDate={d} onDateChange={vi.fn()} mode="day" onModeChange={vi.fn()} />)
    expect(screen.getByText(/Tuesday, May 19, 2026/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous day/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next day/i })).toBeInTheDocument()
  })
  it('prev/next shift the date by one day', async () => {
    const onDateChange = vi.fn()
    const { user } = render(<TodayHeader viewedDate={d} onDateChange={onDateChange} mode="day" onModeChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /next day/i }))
    const arg = onDateChange.mock.calls[0][0] as Date
    expect(arg.getDate()).toBe(20)
  })
  it('Week/Month buttons call onModeChange', async () => {
    const onModeChange = vi.fn()
    const { user } = render(<TodayHeader viewedDate={d} onDateChange={vi.fn()} mode="day" onModeChange={onModeChange} />)
    await user.click(screen.getByRole('button', { name: 'Week' }))
    expect(onModeChange).toHaveBeenCalledWith('week')
  })
})
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```tsx
// src/components/schedule/TodayHeader.tsx
import { ChevronLeft, ChevronRight, Sun } from 'lucide-react'

export type TodayMode = 'day' | 'week' | 'month'

interface TodayHeaderProps {
  viewedDate: Date
  onDateChange: (d: Date) => void
  mode: TodayMode
  onModeChange: (m: TodayMode) => void
  onToggleWeather?: () => void
}

function shift(d: Date, days: number): Date {
  const n = new Date(d); n.setDate(n.getDate() + days); return n
}

export function TodayHeader({ viewedDate, onDateChange, mode, onModeChange, onToggleWeather }: TodayHeaderProps) {
  const label = viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <header className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="font-display text-3xl md:text-4xl text-neutral-900 tracking-tight truncate">{label}</h1>
        <div className="flex items-center gap-1 shrink-0">
          <button aria-label="Previous day" onClick={() => onDateChange(shift(viewedDate, -1))}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button aria-label="Next day" onClick={() => onDateChange(shift(viewedDate, 1))}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex rounded-lg bg-neutral-100 p-0.5">
          {(['day', 'week', 'month'] as const).map((m) => (
            <button key={m} onClick={() => onModeChange(m)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                mode === m ? 'bg-primary-600 text-white' : 'text-neutral-500 hover:text-neutral-800'
              }`}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        {onToggleWeather && (
          <button aria-label="Toggle weather" onClick={onToggleWeather}
            className="p-1.5 rounded-md text-amber-400 hover:bg-amber-50">
            <Sun className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run → PASS (3 tests).**

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayHeader.tsx src/components/schedule/TodayHeader.test.tsx
git commit -m "feat(today): TodayHeader (date nav + mode toggle)"
```

## Task R3.3: `TodayView` shell composition

Composes everything. Accepts the SAME props `TodaySchedule` receives at `HomeView.tsx:276` (read that call site for the exact prop list/types) so R4 is a drop-in. Builds the §4 editorial shell: centered max-width column, `TodayHeader`, `StatsRow`, two-up `TodaysFocusCard` + `WeatherCard`, one bordered task-list card with `TimeGroup` sections + `ScheduleItem` rows + `EveningMealCard` for evening meal items + `OverdueGroup`, `AiSuggestionBanner` below.

**Files:**
- Create: `src/components/schedule/TodayView.tsx`
- Test: `src/components/schedule/TodayView.test.tsx`

- [ ] **Step 1: Read the exact `TodaySchedule` prop interface + `HomeView.tsx:276` call site**

Read `src/components/schedule/TodaySchedule.tsx` (its `TodayScheduleProps` interface) and `HomeView.tsx` lines ~274–298. `TodayView`'s props = that interface exactly (so R4 swaps `<TodaySchedule .../>` → `<TodayView .../>` with identical props). It reads `useScheduleActionsContext()` the same way TodaySchedule does.

- [ ] **Step 2: Write failing test**

```tsx
// src/components/schedule/TodayView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { TodayView } from './TodayView'

vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weather: null, loading: false, error: 'x', requestLocation: vi.fn() }) }))
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => ({ suggestions: [], topSuggestions: [], actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }) }))

const ctxValue = { onToggleTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] }

function renderView(props: Record<string, unknown> = {}) {
  return render(
    <ScheduleActionsProvider value={ctxValue}>
      <TodayView
        tasks={[]} events={[]} routines={[]} dateInstances={[]}
        selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
        onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
        viewedDate={new Date('2026-05-19T09:00:00')} onDateChange={vi.fn()}
        projects={[]} {...props}
      />
    </ScheduleActionsProvider>
  )
}

describe('TodayView', () => {
  it('renders the editorial header date', () => {
    renderView()
    expect(screen.getByText(/Tuesday, May 19, 2026/)).toBeInTheDocument()
  })
  it('renders exactly one stats row (regression guard vs the duplicate-row defect)', () => {
    renderView()
    expect(screen.getAllByText(/tasks? total/i)).toHaveLength(1)
  })
  it('shows the empty state when there are no items', () => {
    renderView()
    expect(screen.getByText(/your day is clear|nothing scheduled/i)).toBeInTheDocument()
  })
})
```

> If `ScheduleActionsProvider`'s prop name isn't `value`, use the real one (read `src/contexts/ScheduleActionsContext.tsx`).

- [ ] **Step 3: Run → FAIL.**

- [ ] **Step 4: Implement `TodayView`**

Build it composing the locked contracts. Key construction:
- `const data = useTodayData({ tasks, events, routines, dateInstances, viewedDate, selectedAssignee: selectedAssignee ?? null, hideRoutines: false, eventNotesMap: ctx.eventNotesMap, eventContextOverrides: ctx.eventContextOverrides, getDomainForCalendar: ctx.getDomainForCalendar })` — memoize the input object with `useMemo` over its fields (the hook deps on input identity; see Phase-1 note).
- Clarity label: reuse `useSystemHealth({ tasks, projects, projectsWithLinkedEvents: new Set() })` → map `healthColor` to label exactly as the salvaged StatsRow expects (`'excellent'→'Excellent'`,`'good'→'Good'`,`'fair'→'Fair'`,`'needsAttention'→'Needs attention'`) and to `focusHeadline`'s `ClarityState` (same union).
- Outer: `<div className="max-w-3xl mx-auto px-6 py-10">`.
- `<TodayHeader viewedDate onDateChange mode="day" onModeChange={(m) => { if (m !== 'day') onDateChange(viewedDate) /* Week/Month route via existing switch — wired in R4 to the real view switch; for now Day-only */ }} />`
- `<StatsRow dueToday={data.counts.actionableCount} thisWeek={data.weekTasks.length} total={tasks.filter(t => !t.completed).length} clarityLabel={clarityLabel} aiAvailable={false} />`
- Two-up: `<div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4 mb-6"><TodaysFocusCard headline={focusHeadline(health.healthColor)} priorities={data.grouped...counts} meals={...} events={...} /><WeatherCard /></div>` (counts: priorities = open timed tasks, meals = filteredEvents whose title matches `/breakfast|brunch|lunch|dinner|supper/i`, events = remaining events — reuse the Phase-1 `data` arrays; compute from `data.grouped` flattened).
- Task list: `<div className="card p-4">` then for each `section of data.sectionsOrder`: `<TimeGroup section={section} isEmpty={data.grouped[section].length === 0}>` mapping items to `<ScheduleItem .../>` (reuse the prop wiring pattern from `TodaySchedule`'s `sections.map` — read it; pass `onSelect={() => onSelectItem(item.id)}`, `onToggleComplete` per item type, etc.). For an evening item that is a meal event (`item.type === 'event'` and title matches the meal regex, or `item.id.startsWith('meal:')`), render `<EveningMealCard title=... timeLabel=... onSelect={() => onSelectItem(item.id)} />` instead of `<ScheduleItem>`.
- Overdue: if `data.isToday && data.overdueTasks.length` render an `OverdueGroup` (a small local sub-component: a quiet `<section>` with an eyebrow "Overdue" and `ScheduleItem` rows for `data.overdueTasks`).
- Empty state: if `data.counts.totalItems === 0` render the calm empty state (`<p className="font-display text-xl">Your day is clear</p>`).
- Below the card: `<div className="mt-6"><AiSuggestionBanner /></div>`.

Implement it fully (no placeholders) following the read `TodaySchedule` item-wiring for `ScheduleItem` props. Keep `TodayView` focused; if item-row wiring is sizable, extract a `TodayTaskRow` helper component in the same file or a sibling `TodayTaskList.tsx` (one responsibility per file preferred).

- [ ] **Step 5: Run → PASS (3 tests).** `npx vitest src/components/schedule/TodayView.test.tsx --run`. `npx tsc --noEmit` clean. `npm run build` clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx src/components/schedule/TodayTaskList.tsx 2>/dev/null
git commit -m "feat(today): TodayView editorial shell (behind the seam)"
```

- [ ] **Step 7: Seam-clean verification**

Run: `git diff --name-only origin/main...HEAD | grep -E 'HomeView|ViewRouter|schedule/TodaySchedule.tsx' || echo SEAM-CLEAN`
Expected: `SEAM-CLEAN` (R1–R3 must not have touched the seam).

---

# R4 — Cutover (first and only live-route change)

## Task R4.1: Swap the seam, declutter, retire legacy

**Files:**
- Modify: `src/components/home/HomeView.tsx` (the `<TodaySchedule .../>` call ~276)
- Modify: `src/components/layout/ViewRouter.tsx` (CalendarConnect banner ~176-181)
- Delete: `src/components/schedule/TodaySchedule.tsx`, `src/components/schedule/TodaySchedule.test.tsx`

- [ ] **Step 1: Pre-cutover gate**

Run the existing Phase-1 parity + full suite:
`npx vitest src/lib/today src/hooks/useTodayData.test.ts --run` → all green (legacy-equivalence guard).
`npm test -- --run` → only the known pre-existing flaky failure; no new failures.
If anything else fails, STOP — do not cut over.

- [ ] **Step 2: Swap HomeView**

In `src/components/home/HomeView.tsx`: change the import `import { TodaySchedule } from '@/components/schedule/TodaySchedule'` → `import { TodayView } from '@/components/schedule/TodayView'`, and the JSX `<TodaySchedule ... />` (~276-298) → `<TodayView ... />` with the identical prop list (TodayView's props are the same interface per R3).

- [ ] **Step 3: Declutter the GCal banner in ViewRouter**

In `src/components/layout/ViewRouter.tsx`, the today branch renders the `{!props.isConnected && (<div className="p-4 border-b border-neutral-100 shrink-0"><Suspense…><CalendarConnect/></Suspense></div>)}` block ABOVE HomeView. Move it so it no longer crowds the editorial header: wrap it as a dismissible compact strip BELOW the `ScheduleActionsProvider`'s `ActionQueueBar` (i.e., relocate the block to render after `<ActionQueueBar />` and before `<HomeView>`, with `className="px-4 pt-1 shrink-0"` and the inner `CalendarConnect` unchanged). Do not delete it — only relocate/compact. Keep the `!props.isConnected` gate.

- [ ] **Step 4: Delete legacy**

```bash
git rm src/components/schedule/TodaySchedule.tsx src/components/schedule/TodaySchedule.test.tsx
```
Then fix any now-broken imports the build surfaces (only `HomeView` should have referenced it; the grep in R0/R3 confirmed isolation). Run `npx tsc --noEmit` and resolve any TodaySchedule-import errors by removing the dead import lines.

- [ ] **Step 5: Full verification (the cutover gate)**

Run: `npm run build` → clean.
Run: `npm test -- --run` → only the known pre-existing flaky failure; **zero** new failures; the Phase-1 `src/lib/today` parity suite green.
Run: `npx eslint src/components/schedule/TodayView.tsx src/components/home/HomeView.tsx src/components/layout/ViewRouter.tsx --max-warnings=0` → clean for changed files.

- [ ] **Step 6: Manual smoke (note for executor)**

`npm run dev`, log in, desktop ≥768px Today view. Confirm against Image 1: editorial centered column, single stats row, Focus + Weather two-up, contained task-list card with sectioned items, evening meal card, AI banner (if any active suggestion), no GCal banner crowding the header, mobile unchanged. Stop the dev server when done.

- [ ] **Step 7: Commit the cutover**

```bash
git add -A
git commit -m "feat(today): cutover — TodayView replaces TodaySchedule, GCal banner decluttered, legacy retired"
```

---

## Self-review notes (author)

- **Spec coverage:** §4 shell → R3.2/R3.3; §5 Surface sections → R1.1/R1.2/R1.3 (extends `2026-05-08-surface-design.md`, no registry, no DetailPanelRedesign); §6 Weather/AI → R2.2/R2.3 (reuse existing hooks; no `weather_window` generator — documented out of scope); §7 `useTodayData` → consumed in R3.3 (already on `main`, not re-built); §8 salvage → R0; §12 phasing → R1–R4 with single R4 cutover; behind-the-seam invariant enforced by explicit `SEAM-CLEAN` checks in R0/R3.
- **Placeholder scan:** Section/component code is complete. The deliberate no-op handlers in R3.3/R1.3 are real, commented design decisions (meals have no complete/pin/notes-write path; documented in spec §6/§11), not stubs. R3.3 Step 4 instructs reading the live `TodaySchedule` item-wiring rather than reproducing ~200 lines speculatively — this is the one place the engineer must mirror existing code; the contracts (props, hooks) are fully specified so it is unambiguous.
- **Type consistency:** `TodayMode`, the Surface section props, `useWeather`/`useProactiveSuggestions`/`useTodayData` shapes, salvaged signatures are all locked in "Shared contracts" and referenced unchanged.
- **Open assumption flagged for execution:** R3.3's `ScheduleItem` per-item prop wiring must be mirrored from the live `TodaySchedule.tsx` `sections.map` (read in Step 1) — the plan specifies the contracts but not 200 lines of verbatim row wiring; the implementer ports it, exactly as Phase 1 ported memos. The `ScheduleActionsProvider` prop name is verified during R3.3 Step 2.
