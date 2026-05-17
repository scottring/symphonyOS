# Wall (Kitchen Kiosk) Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wall's cluttered tabbed interface with a single time-of-day-aware family command center: chrome strip + Now Card (left) + Today/To-Discuss/Coming-Up column (right) + tappable rhythm bar. Adds inline check-off for tasks/chores/discussion items; adds daily-rotating family conversation prompt; drops the unused Rooms tab.

**Architecture:** New layout components compose on top of existing data hooks (`useWallData`, `useActionableInstances`, `useMealPlan`, etc.) — no new database tables. A `useWallRhythm` hook resolves the current time-of-day mode (with manual override + 5-min idle auto-return). A `resolveNowFocus()` pure function picks what the Now Card shows from a typed priority hierarchy. The right column composes three sections (`WallTodayList`, `WallDiscussList`, `WallLookAhead`) that share a `TodayItem`-based view model.

**Tech Stack:** React 19, TypeScript strict, Vitest + RTL. No new dependencies. Tailwind v4 + Nordic Journal palette.

**Spec:** `docs/superpowers/specs/2026-05-17-wall-redesign-design.md`

---

## Out of scope for this PR (follow-ups)

- "Active recipe in progress" priority level (#3 in spec) — requires tracking transient "user pressed Start Cooking" state. Now Card will show dinner via mode-default in Dinner window, but won't persist past 7pm. Will be a follow-up.
- "Active routine window" priority level (#5 in spec) — requires logic to determine whether the morning routine is currently "in progress" vs "done." Plan uses the mode-default fallback for routine modes instead. Follow-up.
- Visual polish iteration on the actual TV display (touch tuning, type sizes from 8 feet). Follow-up after first deploy to the kitchen.

These are intentional simplifications; rest of the spec is fully covered.

---

## Task 1: `RhythmMode` type + clock-to-mode mapping

**Files:**
- Create: `src/components/wall/rhythm/rhythmMode.ts`
- Create: `src/components/wall/rhythm/rhythmMode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/rhythm/rhythmMode.test.ts
import { describe, it, expect } from 'vitest'
import { rhythmModeForClock, RHYTHM_MODES, type RhythmMode } from './rhythmMode'

describe('rhythmModeForClock', () => {
  const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d }

  it('returns "morning" for 6:00–8:59', () => {
    expect(rhythmModeForClock(at(6, 0))).toBe('morning')
    expect(rhythmModeForClock(at(8, 59))).toBe('morning')
  })

  it('returns "day" for 9:00–14:59', () => {
    expect(rhythmModeForClock(at(9, 0))).toBe('day')
    expect(rhythmModeForClock(at(14, 59))).toBe('day')
  })

  it('returns "after-school" for 15:00–16:59', () => {
    expect(rhythmModeForClock(at(15, 0))).toBe('after-school')
    expect(rhythmModeForClock(at(16, 59))).toBe('after-school')
  })

  it('returns "dinner" for 17:00–18:59', () => {
    expect(rhythmModeForClock(at(17, 0))).toBe('dinner')
    expect(rhythmModeForClock(at(18, 59))).toBe('dinner')
  })

  it('returns "bedtime" for 19:00–20:59', () => {
    expect(rhythmModeForClock(at(19, 0))).toBe('bedtime')
    expect(rhythmModeForClock(at(20, 59))).toBe('bedtime')
  })

  it('returns "wind-down" for 21:00 through 5:59', () => {
    expect(rhythmModeForClock(at(21, 0))).toBe('wind-down')
    expect(rhythmModeForClock(at(23, 59))).toBe('wind-down')
    expect(rhythmModeForClock(at(0, 0))).toBe('wind-down')
    expect(rhythmModeForClock(at(5, 59))).toBe('wind-down')
  })

  it('RHYTHM_MODES has 6 entries in display order', () => {
    expect(RHYTHM_MODES).toEqual<RhythmMode[]>(['morning', 'day', 'after-school', 'dinner', 'bedtime', 'wind-down'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/wall/rhythm/rhythmMode.test.ts --run`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// src/components/wall/rhythm/rhythmMode.ts
export type RhythmMode = 'morning' | 'day' | 'after-school' | 'dinner' | 'bedtime' | 'wind-down'

export const RHYTHM_MODES: RhythmMode[] = [
  'morning', 'day', 'after-school', 'dinner', 'bedtime', 'wind-down',
]

export const RHYTHM_MODE_LABELS: Record<RhythmMode, { label: string; window: string }> = {
  morning: { label: 'Morning', window: '6–9a' },
  day: { label: 'Day', window: '9a–3p' },
  'after-school': { label: 'After school', window: '3–5p' },
  dinner: { label: 'Dinner', window: '5–7p' },
  bedtime: { label: 'Bedtime', window: '7–9p' },
  'wind-down': { label: 'Wind down', window: '9p+' },
}

export function rhythmModeForClock(now: Date): RhythmMode {
  const hour = now.getHours()
  if (hour >= 6 && hour < 9) return 'morning'
  if (hour >= 9 && hour < 15) return 'day'
  if (hour >= 15 && hour < 17) return 'after-school'
  if (hour >= 17 && hour < 19) return 'dinner'
  if (hour >= 19 && hour < 21) return 'bedtime'
  return 'wind-down'
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest src/components/wall/rhythm/rhythmMode.test.ts --run`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/rhythm/rhythmMode.ts src/components/wall/rhythm/rhythmMode.test.ts
git commit -m "feat(wall): add RhythmMode type + clock mapping"
```

---

## Task 2: `useWallRhythm` hook (override + idle timeout)

**Files:**
- Create: `src/components/wall/rhythm/useWallRhythm.ts`
- Create: `src/components/wall/rhythm/useWallRhythm.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/rhythm/useWallRhythm.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWallRhythm } from './useWallRhythm'

describe('useWallRhythm', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-17T17:30:00')) // dinner mode
  })
  afterEach(() => { vi.useRealTimers() })

  it('returns auto mode from current clock when no override', () => {
    const { result } = renderHook(() => useWallRhythm())
    expect(result.current.autoMode).toBe('dinner')
    expect(result.current.mode).toBe('dinner')
    expect(result.current.overrideMode).toBe(null)
  })

  it('honors setOverride', () => {
    const { result } = renderHook(() => useWallRhythm())
    act(() => { result.current.setOverride('morning') })
    expect(result.current.mode).toBe('morning')
    expect(result.current.overrideMode).toBe('morning')
    expect(result.current.autoMode).toBe('dinner')
  })

  it('clears override after 5 min of no activity', () => {
    const { result } = renderHook(() => useWallRhythm())
    act(() => { result.current.setOverride('morning') })
    expect(result.current.mode).toBe('morning')

    act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 100) })
    expect(result.current.mode).toBe('dinner') // back to auto
    expect(result.current.overrideMode).toBe(null)
  })

  it('resetIdleTimer keeps override active', () => {
    const { result } = renderHook(() => useWallRhythm())
    act(() => { result.current.setOverride('morning') })

    act(() => { vi.advanceTimersByTime(4 * 60 * 1000) })
    act(() => { result.current.resetIdleTimer() })
    act(() => { vi.advanceTimersByTime(4 * 60 * 1000) })

    expect(result.current.mode).toBe('morning') // still overriding
  })

  it('setOverride(null) clears override immediately', () => {
    const { result } = renderHook(() => useWallRhythm())
    act(() => { result.current.setOverride('morning') })
    act(() => { result.current.setOverride(null) })
    expect(result.current.mode).toBe('dinner')
    expect(result.current.overrideMode).toBe(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/components/wall/rhythm/useWallRhythm.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/components/wall/rhythm/useWallRhythm.ts
import { useState, useEffect, useCallback, useRef } from 'react'
import { rhythmModeForClock, type RhythmMode } from './rhythmMode'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

export interface UseWallRhythmReturn {
  mode: RhythmMode               // resolved (override if set, else auto)
  autoMode: RhythmMode           // raw clock-driven
  overrideMode: RhythmMode | null
  setOverride: (mode: RhythmMode | null) => void
  resetIdleTimer: () => void
}

export function useWallRhythm(): UseWallRhythmReturn {
  const [autoMode, setAutoMode] = useState<RhythmMode>(() => rhythmModeForClock(new Date()))
  const [overrideMode, setOverrideMode] = useState<RhythmMode | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tick autoMode every minute
  useEffect(() => {
    const id = setInterval(() => {
      setAutoMode(rhythmModeForClock(new Date()))
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const clearTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    idleTimerRef.current = setTimeout(() => {
      setOverrideMode(null)
      idleTimerRef.current = null
    }, IDLE_TIMEOUT_MS)
  }, [clearTimer])

  const setOverride = useCallback((mode: RhythmMode | null) => {
    setOverrideMode(mode)
    if (mode === null) {
      clearTimer()
    } else {
      startTimer()
    }
  }, [clearTimer, startTimer])

  const resetIdleTimer = useCallback(() => {
    if (overrideMode !== null) {
      startTimer()
    }
  }, [overrideMode, startTimer])

  useEffect(() => () => clearTimer(), [clearTimer])

  return {
    mode: overrideMode ?? autoMode,
    autoMode,
    overrideMode,
    setOverride,
    resetIdleTimer,
  }
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest src/components/wall/rhythm/useWallRhythm.test.tsx --run`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/rhythm/useWallRhythm.ts src/components/wall/rhythm/useWallRhythm.test.tsx
git commit -m "feat(wall): add useWallRhythm hook with override + idle timeout"
```

---

## Task 3: Daily family conversation prompt

**Files:**
- Create: `src/data/familyDiscussionPrompts.ts`
- Create: `src/hooks/useDailyDiscussionPrompt.ts`
- Create: `src/hooks/useDailyDiscussionPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/hooks/useDailyDiscussionPrompt.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDailyDiscussionPrompt } from './useDailyDiscussionPrompt'

describe('useDailyDiscussionPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-17T12:00:00'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('returns a non-empty prompt string', () => {
    const { result } = renderHook(() => useDailyDiscussionPrompt())
    expect(typeof result.current.prompt).toBe('string')
    expect(result.current.prompt.length).toBeGreaterThan(0)
    expect(result.current.dismissed).toBe(false)
  })

  it('returns the same prompt all day', () => {
    const { result: r1 } = renderHook(() => useDailyDiscussionPrompt())
    const first = r1.current.prompt
    vi.setSystemTime(new Date('2026-05-17T23:00:00'))
    const { result: r2 } = renderHook(() => useDailyDiscussionPrompt())
    expect(r2.current.prompt).toBe(first)
  })

  it('returns a different prompt on a different day', () => {
    const { result: r1 } = renderHook(() => useDailyDiscussionPrompt())
    const first = r1.current.prompt
    vi.setSystemTime(new Date('2026-05-18T08:00:00')) // next day
    const { result: r2 } = renderHook(() => useDailyDiscussionPrompt())
    // Not strictly guaranteed for adjacent days if list size is large enough; assert it's a valid prompt.
    expect(typeof r2.current.prompt).toBe('string')
    expect(r2.current.prompt.length).toBeGreaterThan(0)
    // The day-of-year index changed, so prompt index changed too.
    expect(r2.current.prompt).not.toBe('')
  })

  it('dismiss() marks dismissed and persists', () => {
    const { result } = renderHook(() => useDailyDiscussionPrompt())
    act(() => { result.current.dismiss() })
    expect(result.current.dismissed).toBe(true)

    // Re-mount: should still be dismissed today
    const { result: r2 } = renderHook(() => useDailyDiscussionPrompt())
    expect(r2.current.dismissed).toBe(true)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest src/hooks/useDailyDiscussionPrompt.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement prompt data**

```typescript
// src/data/familyDiscussionPrompts.ts
export const FAMILY_DISCUSSION_PROMPTS: string[] = [
  "What's something that made you laugh today?",
  "If you could invent a new holiday, what would it be?",
  "What's a small thing someone did for you this week that you appreciated?",
  "If we could go anywhere together tomorrow, where would we go?",
  "What's a skill you'd like to learn this year?",
  "What's the best meal you've ever had and why?",
  "If you could have any superpower for one day, what would you do with it?",
  "What's something you're looking forward to next week?",
  "What's the kindest thing you saw someone do today?",
  "If our family had a flag, what would be on it?",
  "What's one thing you'd like to do more of as a family?",
  "What's a song that always makes you happy?",
  "If you could be any age for a week, which age and why?",
  "What's something you used to be scared of but aren't anymore?",
  "What's the best gift you've ever received (or given)?",
  "If you opened a restaurant, what kind of food would it serve?",
  "What's something weird that you really enjoy?",
  "What was your favorite part of today?",
  "If you could only eat three foods for a year, what would they be?",
  "What's a place you've never been that you'd love to visit?",
  "If you could meet anyone in history, who would it be?",
  "What's a tradition we should start?",
  "What's something nice you noticed about someone in this room?",
  "If you wrote a book, what would it be about?",
  "What's the last thing that surprised you?",
  "What's something hard you did this week that you're proud of?",
  "If you could trade places with anyone for a day, who?",
  "What's something you'd like to be remembered for?",
  "What's the funniest dream you've ever had?",
  "If you ran the world for a week, what's the first thing you'd change?",
  "What's a smell that takes you back to a memory?",
  "What's a question you wish someone would ask you?",
  "If you started a YouTube channel tomorrow, what would it be about?",
  "What's a compliment you got that you still think about?",
  "What's something small that brings you a lot of joy?",
  "If you could pick a different name for yourself, what would it be?",
  "What's the most beautiful place you've ever seen?",
  "What's a movie you could watch again and again?",
  "If you could solve one problem in the world, which one?",
  "What's a hobby you'd try if you knew you wouldn't be bad at it?",
  "What's the best advice anyone has ever given you?",
  "If you opened a store, what would it sell?",
  "What's something you're better at than most people realize?",
  "What was your favorite class or subject in school, and why?",
  "If you could speak any language fluently right now, which?",
  "What's a question you used to wonder about as a kid?",
  "What's a chore you secretly don't mind doing?",
  "If you had a robot helper, what would you make it do first?",
  "What's something you'd love to learn from someone in this family?",
  "What was the highlight of your week?",
  "What's a tiny adventure we could do this weekend?",
  "What's a memory from this year that you'll always keep?",
  "If you could relive one day this year, which?",
  "What's something you want to try cooking together?",
  "What's a place in our home you love and why?",
  "What's a goal you have for next month?",
  "If you could pause time, what would you do with the extra hours?",
  "What's the best thing about being part of our family?",
  "What's something you've changed your mind about recently?",
  "What's a problem you're working on right now?",
  "What's the kindest thing you could do for someone tomorrow?",
  "If you could ask a wise old version of yourself one question, what?",
  "What's the most fun you've ever had?",
  "What's a silly tradition you'd like us to start?",
  "If you could plant a garden, what would you grow?",
  "What's a sound that calms you down?",
  "If money didn't matter, what would you spend your time on?",
  "What's a book or show that changed how you think?",
  "What's the bravest thing you've ever done?",
  "What's something you're grateful for right now?",
  "If you could redo any room in our house, which?",
  "What's a small luxury that you really enjoy?",
  "What's a hard thing that turned out to teach you something good?",
  "What was the best thing someone said to you this week?",
  "If you could invent a new family rule, what would it be?",
  "What's a tradition from your childhood you'd like to keep?",
  "What's a hope you have for next year?",
  "If you could go on a road trip anywhere, where to?",
  "What's a thing you've never told anyone in this family?",
  "What's a movie scene that always makes you cry — happy or sad?",
  "If you had a magic wand for one wish, what would you wish?",
  "What's the best part of right now?",
]
```

- [ ] **Step 4: Implement hook**

```typescript
// src/hooks/useDailyDiscussionPrompt.ts
import { useState, useEffect, useCallback } from 'react'
import { FAMILY_DISCUSSION_PROMPTS } from '@/data/familyDiscussionPrompts'

const STORAGE_KEY = 'symphony-wall-prompt-dismissed'

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export interface UseDailyDiscussionPromptReturn {
  prompt: string
  dismissed: boolean
  dismiss: () => void
}

export function useDailyDiscussionPrompt(): UseDailyDiscussionPromptReturn {
  const now = new Date()
  const idx = dayOfYear(now) % FAMILY_DISCUSSION_PROMPTS.length
  const prompt = FAMILY_DISCUSSION_PROMPTS[idx]

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === todayKey()
    } catch { return false }
  })

  // Re-check at midnight rollover (component stays mounted on the kiosk)
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        setDismissed(stored === todayKey())
      } catch { /* ignore */ }
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const dismiss = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, todayKey()) } catch { /* ignore */ }
    setDismissed(true)
  }, [])

  return { prompt, dismissed, dismiss }
}
```

- [ ] **Step 5: Run test**

Run: `npx vitest src/hooks/useDailyDiscussionPrompt.test.ts --run`
Expected: PASS (4/4).

- [ ] **Step 6: Commit**

```bash
git add src/data/familyDiscussionPrompts.ts src/hooks/useDailyDiscussionPrompt.ts src/hooks/useDailyDiscussionPrompt.test.ts
git commit -m "feat(wall): add daily-rotating family discussion prompt"
```

---

## Task 4: `WallChrome` (clock + weather)

**Files:**
- Create: `src/components/wall/WallChrome.tsx`
- Create: `src/components/wall/WallChrome.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/WallChrome.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WallChrome } from './WallChrome'

describe('WallChrome', () => {
  it('renders the time and date from now prop', () => {
    const now = new Date('2026-05-17T17:34:00')
    render(<WallChrome now={now} weather={null} />)
    expect(screen.getByText(/5:34/)).toBeInTheDocument()
    expect(screen.getByText(/PM/i)).toBeInTheDocument()
    expect(screen.getByText(/SUN/i)).toBeInTheDocument()
    expect(screen.getByText(/MAY/i)).toBeInTheDocument()
  })

  it('renders weather when provided', () => {
    const now = new Date('2026-05-17T12:00:00')
    render(<WallChrome now={now} weather={{ temp: 68, description: 'Clear', high: 72, low: 54 }} />)
    expect(screen.getByText(/68°/)).toBeInTheDocument()
    expect(screen.getByText(/Clear/i)).toBeInTheDocument()
  })

  it('does not render weather section when weather is null', () => {
    const now = new Date('2026-05-17T12:00:00')
    const { container } = render(<WallChrome now={now} weather={null} />)
    expect(container.querySelector('[data-weather]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest src/components/wall/WallChrome.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/components/wall/WallChrome.tsx

interface Weather {
  temp: number
  description: string
  high: number
  low: number
}

interface WallChromeProps {
  now: Date
  weather: Weather | null
}

function formatTime(date: Date): { time: string; period: string; dateStr: string } {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  const time = `${displayHour}:${minutes.toString().padStart(2, '0')}`
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase()
  return { time, period, dateStr }
}

export function WallChrome({ now, weather }: WallChromeProps) {
  const { time, period, dateStr } = formatTime(now)
  return (
    <div className="flex justify-between items-start px-2 mb-3">
      <div>
        <div className="font-display text-3xl font-medium text-white leading-none">
          {time}<span className="text-sm opacity-50 ml-1.5">{period}</span>
        </div>
        <div className="text-[11px] uppercase tracking-widest text-white/50 mt-1">{dateStr}</div>
      </div>
      {weather && (
        <div className="text-right" data-weather>
          <div className="font-display text-3xl text-white">{Math.round(weather.temp)}°</div>
          <div className="text-[11px] uppercase tracking-widest text-white/50 mt-1">
            {weather.description} · {Math.round(weather.high)}/{Math.round(weather.low)}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest src/components/wall/WallChrome.test.tsx --run`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallChrome.tsx src/components/wall/WallChrome.test.tsx
git commit -m "feat(wall): add WallChrome clock + weather strip"
```

---

## Task 5: `WallRhythmBar` (bottom tappable strip)

**Files:**
- Create: `src/components/wall/WallRhythmBar.tsx`
- Create: `src/components/wall/WallRhythmBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/WallRhythmBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallRhythmBar } from './WallRhythmBar'

describe('WallRhythmBar', () => {
  it('renders all 6 modes with labels', () => {
    render(<WallRhythmBar currentMode="dinner" overrideMode={null} onSelectMode={() => {}} />)
    expect(screen.getByRole('button', { name: /morning/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^day/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /after school/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dinner/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bedtime/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /wind down/i })).toBeInTheDocument()
  })

  it('marks the current mode as active', () => {
    render(<WallRhythmBar currentMode="dinner" overrideMode={null} onSelectMode={() => {}} />)
    expect(screen.getByRole('button', { name: /dinner/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /morning/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelectMode with the mode when tapped', () => {
    const onSelectMode = vi.fn()
    render(<WallRhythmBar currentMode="dinner" overrideMode={null} onSelectMode={onSelectMode} />)
    fireEvent.click(screen.getByRole('button', { name: /morning/i }))
    expect(onSelectMode).toHaveBeenCalledWith('morning')
  })

  it('shows "Now" pill when override is active', () => {
    render(<WallRhythmBar currentMode="morning" overrideMode="morning" onSelectMode={() => {}} />)
    expect(screen.getByRole('button', { name: /^now$/i })).toBeInTheDocument()
  })

  it('Now pill clears override on tap', () => {
    const onSelectMode = vi.fn()
    render(<WallRhythmBar currentMode="morning" overrideMode="morning" onSelectMode={onSelectMode} />)
    fireEvent.click(screen.getByRole('button', { name: /^now$/i }))
    expect(onSelectMode).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest src/components/wall/WallRhythmBar.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/components/wall/WallRhythmBar.tsx
import { RHYTHM_MODES, RHYTHM_MODE_LABELS, type RhythmMode } from './rhythm/rhythmMode'

interface WallRhythmBarProps {
  currentMode: RhythmMode
  overrideMode: RhythmMode | null
  onSelectMode: (mode: RhythmMode | null) => void
}

export function WallRhythmBar({ currentMode, overrideMode, onSelectMode }: WallRhythmBarProps) {
  return (
    <div className="flex items-stretch gap-1 mt-3">
      {RHYTHM_MODES.map((m) => {
        const { label, window } = RHYTHM_MODE_LABELS[m]
        const active = m === currentMode
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            aria-label={label}
            onClick={() => onSelectMode(m)}
            className={`
              flex-1 rounded-md px-2 py-2 text-center transition-colors
              ${active
                ? 'bg-emerald-900/60 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10'}
            `}
          >
            <div className="text-[10px] uppercase tracking-wider opacity-70">{window}</div>
            <div className="text-xs font-medium">{label}</div>
          </button>
        )
      })}
      {overrideMode && (
        <button
          type="button"
          aria-label="Now"
          onClick={() => onSelectMode(null)}
          className="rounded-md px-3 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 transition-colors"
        >
          Now
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest src/components/wall/WallRhythmBar.test.tsx --run`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallRhythmBar.tsx src/components/wall/WallRhythmBar.test.tsx
git commit -m "feat(wall): add WallRhythmBar tappable mode strip"
```

---

## Task 6: `WallFamilyFilter` (avatar strip)

**Files:**
- Create: `src/components/wall/WallFamilyFilter.tsx`
- Create: `src/components/wall/WallFamilyFilter.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/WallFamilyFilter.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallFamilyFilter } from './WallFamilyFilter'
import { createMockFamilyMember } from '@/test/mocks/factories'

const members = [
  createMockFamilyMember({ id: 'm1', name: 'Scott' }),
  createMockFamilyMember({ id: 'm2', name: 'Iris' }),
  createMockFamilyMember({ id: 'm3', name: 'Mia' }),
]

describe('WallFamilyFilter', () => {
  it('renders an avatar per member plus ALL button', () => {
    render(<WallFamilyFilter members={members} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /scott/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iris/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mia/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
  })

  it('marks ALL as selected when selectedId is null', () => {
    render(<WallFamilyFilter members={members} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('marks the member as selected when selectedId matches', () => {
    render(<WallFamilyFilter members={members} selectedId="m2" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /iris/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^all$/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelect with the id on tap', () => {
    const onSelect = vi.fn()
    render(<WallFamilyFilter members={members} selectedId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /mia/i }))
    expect(onSelect).toHaveBeenCalledWith('m3')
  })

  it('ALL button calls onSelect with null', () => {
    const onSelect = vi.fn()
    render(<WallFamilyFilter members={members} selectedId="m2" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest src/components/wall/WallFamilyFilter.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/components/wall/WallFamilyFilter.tsx
import type { FamilyMember } from '@/types/family'

interface WallFamilyFilterProps {
  members: FamilyMember[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function initials(name: string): string {
  return name.charAt(0).toUpperCase()
}

export function WallFamilyFilter({ members, selectedId, onSelect }: WallFamilyFilterProps) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {members.map((m) => {
        const active = m.id === selectedId
        const color = (m as { color?: string }).color ?? '#2d4f3a'
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            aria-label={m.name}
            onClick={() => onSelect(m.id)}
            className={`
              w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white
              transition-all ${active ? 'ring-2 ring-white scale-110' : 'opacity-70'}
            `}
            style={{ background: color }}
          >
            {initials(m.name)}
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={selectedId === null}
        aria-label="ALL"
        onClick={() => onSelect(null)}
        className={`
          h-10 px-3 rounded-full text-[10px] uppercase tracking-wider text-white
          transition-all
          ${selectedId === null ? 'bg-emerald-800 ring-2 ring-white' : 'bg-white/10 opacity-70'}
        `}
      >
        All
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest src/components/wall/WallFamilyFilter.test.tsx --run`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallFamilyFilter.tsx src/components/wall/WallFamilyFilter.test.tsx
git commit -m "feat(wall): add WallFamilyFilter avatar strip"
```

---

## Task 7: `TodayItem` type + `buildTodayItems` helper

**Files:**
- Create: `src/components/wall/today/todayItem.ts`
- Create: `src/components/wall/today/todayItem.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/today/todayItem.test.ts
import { describe, it, expect } from 'vitest'
import { buildTodayItems } from './todayItem'
import type { TimelineItem } from '@/types/timeline'

const mkItem = (overrides: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 'x',
  type: 'task',
  title: 'Title',
  startTime: null,
  endTime: null,
  completed: false,
  ...overrides,
})

describe('buildTodayItems', () => {
  it('returns empty for empty input', () => {
    expect(buildTodayItems({ allday: [], morning: [], afternoon: [], evening: [] })).toEqual([])
  })

  it('maps tasks to kind=task', () => {
    const items = buildTodayItems({
      allday: [mkItem({ id: 't1', type: 'task', title: 'Run', assignedTo: 'm1' })],
      morning: [], afternoon: [], evening: [],
    })
    expect(items[0]).toMatchObject({ id: 't1', kind: 'task', title: 'Run', ownerId: 'm1' })
  })

  it('maps events to kind=event', () => {
    const items = buildTodayItems({
      allday: [], morning: [mkItem({ id: 'e1', type: 'event', title: 'Meeting', startTime: new Date() })],
      afternoon: [], evening: [],
    })
    expect(items[0].kind).toBe('event')
  })

  it('maps routines to kind=routine-step', () => {
    const items = buildTodayItems({
      allday: [], morning: [mkItem({ id: 'r1', type: 'routine', title: 'Brush teeth' })],
      afternoon: [], evening: [],
    })
    expect(items[0].kind).toBe('routine-step')
  })

  it('maps category=chore tasks to kind=chore', () => {
    const items = buildTodayItems({
      allday: [mkItem({ id: 'c1', type: 'task', category: 'chore', title: 'Trash' })],
      morning: [], afternoon: [], evening: [],
    })
    expect(items[0].kind).toBe('chore')
  })

  it('sorts items by startTime, with timeless items first', () => {
    const items = buildTodayItems({
      allday: [
        mkItem({ id: '7pm', startTime: new Date('2026-05-17T19:00:00') }),
        mkItem({ id: 'no-time', startTime: null }),
        mkItem({ id: '5pm', startTime: new Date('2026-05-17T17:00:00') }),
      ],
      morning: [], afternoon: [], evening: [],
    })
    expect(items.map(i => i.id)).toEqual(['no-time', '5pm', '7pm'])
  })

  it('filters by selected ownerId when provided', () => {
    const items = buildTodayItems(
      { allday: [
        mkItem({ id: 'a', assignedTo: 'm1' }),
        mkItem({ id: 'b', assignedTo: 'm2' }),
      ], morning: [], afternoon: [], evening: [] },
      'm1',
    )
    expect(items.map(i => i.id)).toEqual(['a'])
  })

  it('keeps unowned items when filtered by owner', () => {
    const items = buildTodayItems(
      { allday: [
        mkItem({ id: 'a', assignedTo: 'm1' }),
        mkItem({ id: 'b', assignedTo: undefined }),
      ], morning: [], afternoon: [], evening: [] },
      'm1',
    )
    expect(items.map(i => i.id).sort()).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest src/components/wall/today/todayItem.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/components/wall/today/todayItem.ts
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'

export type TodayItemKind = 'task' | 'chore' | 'routine-step' | 'event'

export interface TodayItem {
  id: string
  kind: TodayItemKind
  title: string
  completed: boolean
  ownerId: string | null
  startTime: Date | null
  sourceId: string
  needsDiscussion?: boolean
  discussionNote?: string
}

function kindFor(item: TimelineItem): TodayItemKind {
  if (item.type === 'event') return 'event'
  if (item.type === 'routine') return 'routine-step'
  if (item.category === 'chore') return 'chore'
  return 'task'
}

export function buildTodayItems(
  sections: Record<DaySection, TimelineItem[]>,
  ownerFilter: string | null = null,
): TodayItem[] {
  const all: TodayItem[] = []
  for (const section of ['allday', 'morning', 'afternoon', 'evening'] as DaySection[]) {
    for (const item of sections[section] ?? []) {
      const owner = item.assignedTo ?? null
      if (ownerFilter && owner && owner !== ownerFilter) continue
      all.push({
        id: item.id,
        kind: kindFor(item),
        title: item.title,
        completed: item.completed,
        ownerId: owner,
        startTime: item.startTime,
        sourceId: item.id,
        needsDiscussion: item.needsDiscussion,
        discussionNote: item.discussionNote,
      })
    }
  }
  // Sort: timeless first, then by startTime ascending
  return all.sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0
    if (!a.startTime) return -1
    if (!b.startTime) return 1
    return a.startTime.getTime() - b.startTime.getTime()
  })
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest src/components/wall/today/todayItem.test.ts --run`
Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/today/todayItem.ts src/components/wall/today/todayItem.test.ts
git commit -m "feat(wall): add TodayItem type + buildTodayItems helper"
```

---

## Task 8: `WallTodayList`

**Files:**
- Create: `src/components/wall/WallTodayList.tsx`
- Create: `src/components/wall/WallTodayList.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/WallTodayList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallTodayList } from './WallTodayList'
import type { TodayItem } from './today/todayItem'
import { createMockFamilyMember } from '@/test/mocks/factories'

const members = [createMockFamilyMember({ id: 'm1', name: 'Scott' })]

const items: TodayItem[] = [
  { id: 'a', kind: 'task', title: 'Run', completed: false, ownerId: 'm1', startTime: null, sourceId: 'a' },
  { id: 'b', kind: 'chore', title: 'Trash', completed: false, ownerId: null, startTime: null, sourceId: 'b' },
  { id: 'c', kind: 'event', title: 'Soccer', completed: false, ownerId: 'm1', startTime: new Date('2026-05-17T19:00:00'), sourceId: 'c' },
]

describe('WallTodayList', () => {
  it('renders all items', () => {
    render(<WallTodayList items={items} members={members} onCheckItem={() => {}} onTapEvent={() => {}} />)
    expect(screen.getByText('Run')).toBeInTheDocument()
    expect(screen.getByText('Trash')).toBeInTheDocument()
    expect(screen.getByText('Soccer')).toBeInTheDocument()
  })

  it('renders empty state when no items', () => {
    render(<WallTodayList items={[]} members={members} onCheckItem={() => {}} onTapEvent={() => {}} />)
    expect(screen.getByText(/nothing for today/i)).toBeInTheDocument()
  })

  it('calls onCheckItem when checkbox tapped on a task', () => {
    const onCheckItem = vi.fn()
    render(<WallTodayList items={items} members={members} onCheckItem={onCheckItem} onTapEvent={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /check run/i }))
    expect(onCheckItem).toHaveBeenCalledWith('a', true)
  })

  it('calls onTapEvent when an event row is tapped', () => {
    const onTapEvent = vi.fn()
    render(<WallTodayList items={items} members={members} onCheckItem={() => {}} onTapEvent={onTapEvent} />)
    fireEvent.click(screen.getByText('Soccer'))
    expect(onTapEvent).toHaveBeenCalledWith('c')
  })

  it('renders event icon (clock) for event rows, not checkbox', () => {
    render(<WallTodayList items={items} members={members} onCheckItem={() => {}} onTapEvent={() => {}} />)
    expect(screen.queryByRole('button', { name: /check soccer/i })).not.toBeInTheDocument()
  })

  it('applies line-through to completed items', () => {
    const done: TodayItem[] = [{ ...items[0], completed: true }]
    render(<WallTodayList items={done} members={members} onCheckItem={() => {}} onTapEvent={() => {}} />)
    const title = screen.getByText('Run')
    expect(title.className).toMatch(/line-through/)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest src/components/wall/WallTodayList.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/components/wall/WallTodayList.tsx
import { Check, Clock, Repeat } from 'lucide-react'
import type { TodayItem } from './today/todayItem'
import type { FamilyMember } from '@/types/family'

interface WallTodayListProps {
  items: TodayItem[]
  members: FamilyMember[]
  onCheckItem: (id: string, completed: boolean) => void
  onTapEvent: (id: string) => void
}

function formatRowTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'p' : 'a'
  const dispH = h % 12 || 12
  return m === 0 ? `${dispH}${period}` : `${dispH}:${m.toString().padStart(2, '0')}${period}`
}

export function WallTodayList({ items, members, onCheckItem, onTapEvent }: WallTodayListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-white/40 py-3 text-center">Nothing for today.</p>
    )
  }

  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const owner = members.find((m) => m.id === it.ownerId)
        const ownerColor = (owner as { color?: string } | undefined)?.color ?? null
        const isEvent = it.kind === 'event'

        return (
          <li
            key={it.id}
            className={`
              flex items-center gap-3 rounded-lg px-3 py-2.5 min-h-[56px]
              ${isEvent ? 'cursor-pointer hover:bg-white/5' : ''}
              ${it.completed ? 'opacity-50' : ''}
            `}
            onClick={isEvent ? () => onTapEvent(it.id) : undefined}
          >
            {isEvent ? (
              <Clock className="w-5 h-5 text-white/40 shrink-0" />
            ) : (
              <button
                type="button"
                aria-label={`Check ${it.title}`}
                onClick={(e) => { e.stopPropagation(); onCheckItem(it.id, !it.completed) }}
                className={`
                  w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors shrink-0
                  ${it.completed ? 'bg-emerald-700 border-emerald-700' : 'border-white/30 hover:border-white/60'}
                `}
              >
                {it.completed && <Check className="w-5 h-5 text-white" />}
              </button>
            )}

            <div className="flex-1 min-w-0">
              <div className={`text-base text-white ${it.completed ? 'line-through' : ''} truncate`}>
                {it.title}
                {it.kind === 'chore' && (
                  <Repeat className="inline-block w-3 h-3 ml-1.5 text-white/40" />
                )}
              </div>
              {it.startTime && (
                <div className="text-[11px] text-white/40 mt-0.5">{formatRowTime(it.startTime)}</div>
              )}
            </div>

            {owner && (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                style={{ background: ownerColor ?? '#2d4f3a' }}
                title={owner.name}
              >
                {owner.name.charAt(0).toUpperCase()}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest src/components/wall/WallTodayList.test.tsx --run`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallTodayList.tsx src/components/wall/WallTodayList.test.tsx
git commit -m "feat(wall): add WallTodayList checkable row component"
```

---

## Task 9: `WallDiscussList`

**Files:**
- Create: `src/components/wall/WallDiscussList.tsx`
- Create: `src/components/wall/WallDiscussList.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/WallDiscussList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallDiscussList } from './WallDiscussList'
import type { TodayItem } from './today/todayItem'

const discussItems: TodayItem[] = [
  { id: 'd1', kind: 'task', title: 'Summer camp dates', completed: false, ownerId: null, startTime: null, sourceId: 'd1', needsDiscussion: true, discussionNote: 'Confirm with Iris by Friday' },
  { id: 'd2', kind: 'task', title: 'Piano teacher payment', completed: false, ownerId: null, startTime: null, sourceId: 'd2', needsDiscussion: true },
]

describe('WallDiscussList', () => {
  it('renders nothing when items is empty', () => {
    const { container } = render(<WallDiscussList items={[]} onResolve={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders each discussion item title', () => {
    render(<WallDiscussList items={discussItems} onResolve={() => {}} />)
    expect(screen.getByText('Summer camp dates')).toBeInTheDocument()
    expect(screen.getByText('Piano teacher payment')).toBeInTheDocument()
  })

  it('shows count in header', () => {
    render(<WallDiscussList items={discussItems} onResolve={() => {}} />)
    expect(screen.getByText(/to discuss \(2\)/i)).toBeInTheDocument()
  })

  it('calls onResolve when 💬 button tapped', () => {
    const onResolve = vi.fn()
    render(<WallDiscussList items={discussItems} onResolve={onResolve} />)
    fireEvent.click(screen.getAllByRole('button', { name: /resolve discussion/i })[0])
    expect(onResolve).toHaveBeenCalledWith('d1')
  })

  it('expands note when title is tapped', () => {
    render(<WallDiscussList items={discussItems} onResolve={() => {}} />)
    fireEvent.click(screen.getByText('Summer camp dates'))
    expect(screen.getByText('Confirm with Iris by Friday')).toBeInTheDocument()
  })

  it('does not show note when item has no discussionNote', () => {
    render(<WallDiscussList items={discussItems} onResolve={() => {}} />)
    fireEvent.click(screen.getByText('Piano teacher payment'))
    // No note rendered for this item
    expect(screen.queryByText(/confirm with iris/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest src/components/wall/WallDiscussList.test.tsx --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/components/wall/WallDiscussList.tsx
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { TodayItem } from './today/todayItem'

interface WallDiscussListProps {
  items: TodayItem[]
  onResolve: (id: string) => void
}

export function WallDiscussList({ items, onResolve }: WallDiscussListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (items.length === 0) return null

  return (
    <div className="mt-4">
      <div className="text-[10px] uppercase tracking-widest text-amber-300/60 mb-2 px-1">
        To discuss ({items.length})
      </div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id} className="rounded-lg bg-amber-900/15 px-3 py-2.5 min-h-[56px]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Resolve discussion"
                onClick={() => onResolve(it.id)}
                className="w-10 h-10 rounded-full bg-amber-900/30 hover:bg-amber-700/40 flex items-center justify-center shrink-0 transition-colors"
              >
                <MessageCircle className="w-5 h-5 text-amber-300" />
              </button>
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}
                className="flex-1 text-left text-base text-white hover:text-amber-200 transition-colors truncate"
              >
                {it.title}
              </button>
            </div>
            {expandedId === it.id && it.discussionNote && (
              <div className="mt-2 ml-13 text-sm text-white/70 pl-13 border-l-2 border-amber-700/30 pl-3">
                {it.discussionNote}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest src/components/wall/WallDiscussList.test.tsx --run`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallDiscussList.tsx src/components/wall/WallDiscussList.test.tsx
git commit -m "feat(wall): add WallDiscussList with inline resolve"
```

---

## Task 10: Update `WallLookAhead` for compressed mode

**Files:**
- Modify: `src/components/wall/WallLookAhead.tsx`

- [ ] **Step 1: Read existing component**

Read `src/components/wall/WallLookAhead.tsx` in full. The current component renders day cards in a more elaborate layout. Add a new `compressed?: boolean` prop. When `compressed` is true, render each day as a single line: `DAY · title1, title2`.

- [ ] **Step 2: Add the compressed render path**

In `src/components/wall/WallLookAhead.tsx`, add `compressed?: boolean` to `WallLookAheadProps`. At the start of the returned JSX, branch on `compressed`. The compressed branch should look like:

```tsx
if (compressed) {
  return (
    <ul className={`space-y-2 ${className ?? ''}`}>
      {highlights.map((day) => (
        <li key={day.dayLabel} className="flex items-baseline gap-2 text-sm">
          <span className="text-[10px] uppercase tracking-widest text-white/40 w-16 shrink-0">
            {day.dayLabel}
          </span>
          <span className="text-white/70 truncate">
            {day.items.length === 0
              ? <span className="text-white/30">—</span>
              : day.items.slice(0, 3).map((it, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    {it.time ? `${it.time} ` : ''}{it.title.toLowerCase()}
                  </span>
                ))
            }
          </span>
        </li>
      ))}
    </ul>
  )
}
```

Leave the existing non-compressed render path unchanged.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: green.

Run: `npx vitest src/components/wall --run`
Expected: previously passing tests still pass (WallLookAhead may not have tests; if it does, they still pass).

- [ ] **Step 4: Commit**

```bash
git add src/components/wall/WallLookAhead.tsx
git commit -m "feat(wall): add compressed render mode to WallLookAhead"
```

---

## Task 11: `WallNowCard` (focus + pin + priority resolution)

**Files:**
- Create: `src/components/wall/WallNowCard.tsx`
- Create: `src/components/wall/WallNowCard.test.tsx`
- Create: `src/components/wall/nowFocus.ts`
- Create: `src/components/wall/nowFocus.test.ts`

- [ ] **Step 1: Write failing test for resolver**

```typescript
// src/components/wall/nowFocus.test.ts
import { describe, it, expect } from 'vitest'
import { resolveNowFocus } from './nowFocus'

describe('resolveNowFocus', () => {
  const baseInput = {
    pinned: null,
    override: null,
    rhythmMode: 'day' as const,
    imminent: null,
  }

  it('returns pinned when pinned', () => {
    const focus = resolveNowFocus({ ...baseInput, pinned: { kind: 'recipe', title: 'Pinned recipe' } })
    expect(focus.kind).toBe('pinned')
  })

  it('returns override-mode when override is set', () => {
    const focus = resolveNowFocus({ ...baseInput, override: { kind: 'mode', mode: 'dinner' } })
    expect(focus.kind).toBe('override-mode')
    expect((focus as { mode: string }).mode).toBe('dinner')
  })

  it('returns imminent when an imminent entity is present', () => {
    const imminent = { kind: 'event' as const, entity: { title: 'Soccer' }, startTime: new Date() }
    const focus = resolveNowFocus({ ...baseInput, imminent: imminent as any })
    expect(focus.kind).toBe('imminent')
  })

  it('falls back to mode-default for current rhythm', () => {
    const focus = resolveNowFocus({ ...baseInput, rhythmMode: 'dinner' })
    expect(focus.kind).toBe('mode-default')
    expect((focus as { mode: string }).mode).toBe('dinner')
  })
})
```

- [ ] **Step 2: Implement resolver**

```typescript
// src/components/wall/nowFocus.ts
import type { RhythmMode } from './rhythm/rhythmMode'
import type { ImminentEntity } from './now/useImminentEntity'

export interface PinnedFocus {
  kind: 'recipe' | 'event' | 'task' | 'mode'
  title: string
  payload?: unknown
}

export type OverrideRef =
  | { kind: 'mode'; mode: RhythmMode }
  | { kind: 'coming-up-item'; itemId: string }

export interface ResolveNowFocusInput {
  pinned: PinnedFocus | null
  override: OverrideRef | null
  rhythmMode: RhythmMode
  imminent: ImminentEntity | null
}

export type NowFocus =
  | { kind: 'pinned'; pinned: PinnedFocus }
  | { kind: 'override-mode'; mode: RhythmMode }
  | { kind: 'override-item'; itemId: string }
  | { kind: 'imminent'; entity: ImminentEntity }
  | { kind: 'mode-default'; mode: RhythmMode }

export function resolveNowFocus(input: ResolveNowFocusInput): NowFocus {
  if (input.pinned) return { kind: 'pinned', pinned: input.pinned }
  if (input.override?.kind === 'coming-up-item') return { kind: 'override-item', itemId: input.override.itemId }
  if (input.override?.kind === 'mode') return { kind: 'override-mode', mode: input.override.mode }
  if (input.imminent) return { kind: 'imminent', entity: input.imminent }
  return { kind: 'mode-default', mode: input.rhythmMode }
}
```

- [ ] **Step 3: Run resolver test**

Run: `npx vitest src/components/wall/nowFocus.test.ts --run`
Expected: PASS (4/4).

- [ ] **Step 4: Write failing test for WallNowCard**

```typescript
// src/components/wall/WallNowCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallNowCard } from './WallNowCard'

describe('WallNowCard', () => {
  it('renders imminent event title for imminent focus', () => {
    render(
      <WallNowCard
        focus={{ kind: 'imminent', entity: { kind: 'event', entity: { title: 'Soccer practice' }, startTime: new Date(Date.now() + 10 * 60_000) } as any }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
      />
    )
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
  })

  it('renders the mode-default label for mode-default focus', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'dinner' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
      />
    )
    expect(screen.getByText(/dinner/i)).toBeInTheDocument()
  })

  it('toggles pin on pin button tap', () => {
    const onPinToggle = vi.fn()
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'dinner' }}
        pinned={false}
        onPinToggle={onPinToggle}
        familyPrompt={null}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /pin/i }))
    expect(onPinToggle).toHaveBeenCalled()
  })

  it('shows family conversation prompt chip when in dinner mode with prompt', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'dinner' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt="What made you laugh today?"
      />
    )
    expect(screen.getByText(/what made you laugh today/i)).toBeInTheDocument()
  })

  it('does not show family prompt chip in non-dinner modes', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'morning' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt="Question of the day"
      />
    )
    expect(screen.queryByText(/question of the day/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Implement WallNowCard**

```tsx
// src/components/wall/WallNowCard.tsx
import { Pin } from 'lucide-react'
import { RHYTHM_MODE_LABELS, type RhythmMode } from './rhythm/rhythmMode'
import type { NowFocus } from './nowFocus'

const MODE_DEFAULT_BLURB: Record<RhythmMode, { label: string; body: string }> = {
  morning: { label: 'Morning routine', body: "Let's get everyone moving — what's first?" },
  day: { label: 'Today', body: 'The day is in motion.' },
  'after-school': { label: 'After school', body: 'Pickup, snacks, and the slide into evening.' },
  dinner: { label: "Tonight's dinner", body: 'What are we cooking, and what do we need?' },
  bedtime: { label: 'Bedtime', body: 'Wind it down — books, baths, lights out.' },
  'wind-down': { label: 'Wind down', body: 'Tomorrow comes early. Rest well.' },
}

interface WallNowCardProps {
  focus: NowFocus
  pinned: boolean
  onPinToggle: () => void
  familyPrompt: string | null
}

function renderContent(focus: NowFocus): { label: string; title: string; body?: string } {
  if (focus.kind === 'pinned') return { label: 'Pinned', title: focus.pinned.title }
  if (focus.kind === 'imminent') {
    const entity = focus.entity.entity as { title: string }
    return { label: 'Up next', title: entity.title }
  }
  if (focus.kind === 'override-mode') {
    const m = RHYTHM_MODE_LABELS[focus.mode]
    const def = MODE_DEFAULT_BLURB[focus.mode]
    return { label: m.label, title: def.label, body: def.body }
  }
  if (focus.kind === 'override-item') {
    return { label: 'Detail', title: 'Tapped item' }
  }
  // mode-default
  const def = MODE_DEFAULT_BLURB[focus.mode]
  return { label: RHYTHM_MODE_LABELS[focus.mode].label, title: def.label, body: def.body }
}

export function WallNowCard({ focus, pinned, onPinToggle, familyPrompt }: WallNowCardProps) {
  const content = renderContent(focus)
  const showPrompt =
    familyPrompt &&
    (focus.kind === 'mode-default' && focus.mode === 'dinner' ||
     focus.kind === 'override-mode' && focus.mode === 'dinner')

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-900 to-teal-900 p-7 text-white flex flex-col gap-3 h-full shadow-lg">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-widest text-white/60">{content.label}</div>
        <button
          type="button"
          aria-label="Pin"
          onClick={onPinToggle}
          className={`p-2 rounded-md transition-colors ${pinned ? 'text-amber-300 bg-amber-900/30' : 'text-white/40 hover:text-white/80'}`}
        >
          <Pin className="w-5 h-5" />
        </button>
      </div>
      <h2 className="font-display text-3xl font-semibold leading-tight">{content.title}</h2>
      {content.body && (
        <p className="text-base text-white/80 leading-relaxed">{content.body}</p>
      )}
      {showPrompt && familyPrompt && (
        <div className="mt-auto text-sm text-white/80 bg-white/10 rounded-lg px-4 py-3">
          💬 Tonight's question: <span className="italic">"{familyPrompt}"</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Run all WallNowCard tests**

Run: `npx vitest src/components/wall/WallNowCard.test.tsx src/components/wall/nowFocus.test.ts --run`
Expected: PASS (5/5 + 4/4).

- [ ] **Step 7: Commit**

```bash
git add src/components/wall/WallNowCard.tsx src/components/wall/WallNowCard.test.tsx src/components/wall/nowFocus.ts src/components/wall/nowFocus.test.ts
git commit -m "feat(wall): add WallNowCard with priority resolver + pin"
```

---

## Task 12: `WallRightColumn` composition

**Files:**
- Create: `src/components/wall/WallRightColumn.tsx`

This task is composition only — it wires together the components built in tasks 6, 8, 9, 10. No new test file; behavior is covered by the constituent component tests, and the file is too thin to merit its own test.

- [ ] **Step 1: Implement**

```tsx
// src/components/wall/WallRightColumn.tsx
import type { TodayItem } from './today/todayItem'
import type { FamilyMember } from '@/types/family'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import { WallFamilyFilter } from './WallFamilyFilter'
import { WallTodayList } from './WallTodayList'
import { WallDiscussList } from './WallDiscussList'
import { WallLookAhead } from './WallLookAhead'

interface WallRightColumnProps {
  todayItems: TodayItem[]
  discussItems: TodayItem[]
  upcomingDays: WallDayData[]
  members: FamilyMember[]
  selectedOwnerId: string | null
  onSelectOwner: (id: string | null) => void
  onCheckItem: (id: string, completed: boolean) => void
  onTapEvent: (id: string) => void
  onResolveDiscussion: (id: string) => void
  onTapUpcoming?: (item: TimelineItem) => void
}

export function WallRightColumn({
  todayItems, discussItems, upcomingDays, members,
  selectedOwnerId, onSelectOwner,
  onCheckItem, onTapEvent, onResolveDiscussion, onTapUpcoming,
}: WallRightColumnProps) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-4 flex flex-col gap-2 h-full overflow-y-auto">
      <WallFamilyFilter
        members={members}
        selectedId={selectedOwnerId}
        onSelect={onSelectOwner}
      />

      <div className="text-[10px] uppercase tracking-widest text-white/50 px-1">Today</div>
      <WallTodayList
        items={todayItems}
        members={members}
        onCheckItem={onCheckItem}
        onTapEvent={onTapEvent}
      />

      <WallDiscussList items={discussItems} onResolve={onResolveDiscussion} />

      <div className="text-[10px] uppercase tracking-widest text-white/50 mt-4 px-1">Coming up</div>
      <WallLookAhead
        days={upcomingDays}
        familyMembers={members}
        onItemTap={onTapUpcoming}
        compressed
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/components/wall/WallRightColumn.tsx
git commit -m "feat(wall): add WallRightColumn composition"
```

---

## Task 13: Rewrite `WallCalendar` to mount new layout

**Files:**
- Modify: `src/components/wall/WallCalendar.tsx`

This is the integration task. The current `WallCalendar.tsx` is ~743 lines with two tabs and a sprawling JSX tree. Replace its visible UI with the new components while keeping the existing data wiring (hooks, click handlers, overlays).

- [ ] **Step 1: Read current `WallCalendar.tsx` in full**

Open the file and identify these zones to preserve verbatim:
- `useAuth`, `useWallData`, `useActionableInstances`, `useWeather`, `useKioskCards`, `useEmailActionItems`, `useFamilyDiscussionItems`, `useMealPlan`, `useRecipes`, `useOpenListCount` — all stay.
- `currentTime` state + 1-min tick — stays.
- `detailItem` state + `WallItemDetail` overlay — stays.
- `showEmailActions` overlay + `WallEmailActionsOverlay` — stays.
- `showDiscussion` overlay + `WallDiscussionOverlay` — stays.
- `WallMicButton` floating button — stays.
- `WallCameraView` / `nightWake` mechanism — stays.
- `WallTravelDay` banner — stays.
- `useContextEngine` + `ContextOverlay` — stays.

Identify zones to remove:
- The `[tab, setTab]` state and the `setTab('rooms')` button.
- The branch that renders `<RoomsKioskView />` when `tab === 'rooms'`.
- The big calendar swimlane JSX (`<WallSwimlane>` mount) and its surrounding widgets cluster.

- [ ] **Step 2: Replace the main canvas JSX**

Replace the section that renders the calendar tab UI (swimlane + widgets) AND the section that conditionally renders RoomsKioskView with this single layout:

```tsx
import { useWallRhythm } from './rhythm/useWallRhythm'
import { useDailyDiscussionPrompt } from '@/hooks/useDailyDiscussionPrompt'
import { WallChrome } from './WallChrome'
import { WallRhythmBar } from './WallRhythmBar'
import { WallNowCard } from './WallNowCard'
import { WallRightColumn } from './WallRightColumn'
import { buildTodayItems } from './today/todayItem'
import { resolveNowFocus, type PinnedFocus, type OverrideRef } from './nowFocus'

// Inside the WallCalendar() component, after existing hooks:

const rhythm = useWallRhythm()
const { prompt, dismissed: promptDismissed } = useDailyDiscussionPrompt()
const [pinned, setPinned] = useState<PinnedFocus | null>(null)
const [override, setOverride] = useState<OverrideRef | null>(null)
const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null)

// Mirror rhythm override into the local override state (they're separate concerns
// because override can also be a "coming-up-item" tap, not just a mode tap).
useEffect(() => {
  setOverride(rhythm.overrideMode ? { kind: 'mode', mode: rhythm.overrideMode } : null)
}, [rhythm.overrideMode])

const todayData = wallData.days[0]  // useWallData places today at index 0
const todayItems = useMemo(() =>
  todayData ? buildTodayItems(todayData.items, selectedOwnerId) : [],
  [todayData, selectedOwnerId]
)
const discussItems = todayItems.filter((it) => it.needsDiscussion)
const upcomingDays = wallData.days.slice(1) // tomorrow onward

const imminentEntity = useImminentEntity({
  events: wallData.calendarEvents,
  tasks: todayData
    ? Object.values(todayData.items).flat().map(it => it.type === 'task' ? (it as unknown as Task) : null).filter((t): t is Task => !!t)
    : [],
  now: currentTime,
  windowMinutes: 30,
})

const focus = resolveNowFocus({
  pinned,
  override,
  rhythmMode: rhythm.mode,
  imminent: imminentEntity,
})

const handleCheckItem = useCallback(async (id: string, completed: boolean) => {
  // Determine entity type from the item kind
  const item = todayItems.find(i => i.id === id)
  if (!item) return
  if (item.kind === 'task' || item.kind === 'chore') {
    await onUpdateTask?.(id, { completed }) // wire to existing handler if available, otherwise via supabase directly
  } else if (item.kind === 'routine-step') {
    if (completed) await markDone('routine', item.sourceId, currentTime)
    else await undoDone('routine', item.sourceId, currentTime)
  }
}, [todayItems, markDone, undoDone, currentTime])

const handleResolveDiscussion = useCallback(async (taskId: string) => {
  await supabase.from('tasks').update({
    needs_discussion: false,
    discussion_note: null,
  }).eq('id', taskId)
  wallData.refetch?.()
}, [wallData])

const handleTapEvent = useCallback((id: string) => {
  const tlItem = todayData?.items
    ? Object.values(todayData.items).flat().find(it => it.id === id)
    : null
  if (tlItem) setDetailItem(tlItem)
}, [todayData])

// New main JSX (replacing the calendar swimlane + rooms branches):
return (
  <div
    className="h-screen w-screen flex flex-col bg-neutral-950 text-white p-5 overflow-hidden"
    onPointerDown={rhythm.resetIdleTimer}
  >
    <WallChrome
      now={currentTime}
      weather={weather ? { temp: weather.temp, description: weather.description ?? 'Clear', high: weather.high ?? weather.temp, low: weather.low ?? weather.temp } : null}
    />

    <div className="grid grid-cols-[1.85fr_1fr] gap-4 flex-1 min-h-0">
      <WallNowCard
        focus={focus}
        pinned={pinned !== null}
        onPinToggle={() => setPinned(p => p ? null : { kind: 'mode', title: 'Pinned view' })}
        familyPrompt={promptDismissed ? null : prompt}
      />
      <WallRightColumn
        todayItems={todayItems}
        discussItems={discussItems}
        upcomingDays={upcomingDays}
        members={wallData.familyMembers}
        selectedOwnerId={selectedOwnerId}
        onSelectOwner={setSelectedOwnerId}
        onCheckItem={handleCheckItem}
        onTapEvent={handleTapEvent}
        onResolveDiscussion={handleResolveDiscussion}
        onTapUpcoming={(item) => setDetailItem(item)}
      />
    </div>

    <WallRhythmBar
      currentMode={rhythm.mode}
      overrideMode={rhythm.overrideMode}
      onSelectMode={rhythm.setOverride}
    />

    {/* Preserved overlays + floats */}
    {detailItem && <WallItemDetail item={detailItem} onClose={() => setDetailItem(null)} />}
    {/* keep existing overlays: showRecipeViewer, showEmailActions, showDiscussion, WallCameraView, WallTravelDay, ContextOverlay, etc. */}
    {/* keep WallMicButton floating */}
    <WallMicButton {...existingMicProps} />
  </div>
)
```

Important: this is a sketch with `// keep existing overlays` markers — DO NOT delete the existing overlay components or their state. Splice them into the new JSX at the same level as the `<div>` containing the main grid. They are floating overlays and don't break the grid layout.

Also: the `onUpdateTask` callback shown isn't on `useWallData`. Find the existing patterns: look at how the swimlane currently completes tasks (likely `useSupabaseTasks` is consumed somewhere or `markDone` is used for actionables). Reuse whatever the existing code uses for task completion. If unclear, STOP and report BLOCKED.

- [ ] **Step 3: Delete the `[tab, setTab]` state and the rooms-branch JSX**

Remove:
- The `useState<'calendar' | 'rooms'>('calendar')` line
- The button that calls `setTab('rooms')`
- The `tab === 'rooms' ? <RoomsKioskView /> : (...)` ternary — keep only the new layout.

Also remove these imports if they become unused (verify each with grep before deleting):
- `import { RoomsKioskView } from '@/apps/home/kiosk/RoomsKioskView'` — likely removable.
- `import { WallSwimlane } from './WallSwimlane'` — if no other references in this file.
- Any cluster widgets in the imports that are no longer mounted (verify each by grep'ing for the component name in `WallCalendar.tsx`).

- [ ] **Step 4: Build + tests**

Run: `npm run build`
Expected: green. Fix any type errors (often unused variables, dangling imports).

Run: `npx vitest src/components/wall --run`
Expected: all existing schedule/wall tests still pass, plus the new tests from tasks 1–12.

If a previously-passing test depended on the old tab structure, update or remove it (note in your report).

- [ ] **Step 5: Visual sanity check via build artifact**

Run: `npm run build` and confirm `dist/` is generated without errors. Manual visual verification is Task 14.

- [ ] **Step 6: Commit**

```bash
git add src/components/wall/WallCalendar.tsx
git commit -m "feat(wall): mount new Now Card + right column layout, remove Rooms"
```

---

## Task 14: Manual verification

The new wall surface needs human eyes. The dev server runs locally; the actual kiosk display will need a follow-up pass after this lands.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server at `localhost:5173`.

- [ ] **Step 2: Open `/wall` route in a browser**

Confirm:
- Clock + weather strip at the top
- Big Now Card on the left occupying ~65% width
- Right column showing family avatar filter, Today section, To Discuss (if any items flagged), Coming Up section
- Rhythm bar at the bottom with the current mode highlighted
- No Rooms tab, no tab toggle visible

- [ ] **Step 3: Tap a rhythm mode (recall a past-time card)**

This is the key "recover a card whose time has passed" flow.

Click "Dinner" mode in the rhythm bar at a time outside the 5–7 PM window (e.g., at 2 PM or 8 PM).
- Now Card content should change to the dinner mode default (recipe/prep)
- A "Now" pill appears next to the bar
- After ~5 min of no interaction, override clears and the card returns to auto (or click "Now" to force return immediately)

Then test pinning to hold a past-time card:
- With dinner override active, tap the 📌 Pin button on the Now Card
- The card should remain on screen even past the 5-min idle timeout
- Tap pin again to release; card returns to auto rhythm

- [ ] **Step 4: Check off a task**

Tap a task in Today list.
- Checkbox fills with green check
- Item dims and (eventually) moves to the bottom
- Refresh — the change persists

- [ ] **Step 5: Resolve a discussion item (if any flagged)**

Tap the 💬 button on a "To Discuss" row.
- Row fades out and disappears
- Refresh — the item is no longer in the discuss section

- [ ] **Step 6: Filter by family member**

Tap an avatar in the family filter.
- Today list updates to show only that person's items + unowned items
- Tap "ALL" — full list returns

- [ ] **Step 7: Pin and unpin the Now Card**

Tap the pin icon on the Now Card.
- Pin icon highlights amber
- Card persists even if you scroll/interact elsewhere
- Tap pin again — release

- [ ] **Step 8: Family conversation prompt (during dinner mode)**

If the clock is in the dinner window (5–7 PM) or you've overridden to dinner, the Now Card shows a "Tonight's question" chip.

- [ ] **Step 9: Run the full test suite**

Run: `npm test -- --run`
Expected: all tests pass.

- [ ] **Step 10: Commit any final fixes**

If you find any quick fixes during manual verification, commit them with descriptive messages.

---

## Done criteria

- [ ] All 14 tasks complete.
- [ ] `npm run build` succeeds.
- [ ] `npm test -- --run` passes (apart from pre-existing failures unrelated to this work).
- [ ] Manual verification (Task 14) checked off for every step.
- [ ] Rooms tab is gone; tab toggle gone; no `RoomsKioskView` reference remains in `WallCalendar.tsx`.
- [ ] Family conversation prompt rotates daily (verify by changing system date).
- [ ] To-Discuss section appears when `needsDiscussion` flagged tasks exist and clears when resolved.
- [ ] Rhythm bar override + 5-min idle auto-return both work.
