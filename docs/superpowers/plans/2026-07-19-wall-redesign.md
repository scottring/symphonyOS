# Wall Redesign (Warm Nordic Kiosk) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/wall-v2` kiosk presentation layer in the approved warm Nordic aesthetic (spec: `docs/superpowers/specs/2026-07-19-wall-redesign-design.md`) with zero backend changes.

**Architecture:** `WallV2Shell` keeps every hook, handler, and overlay; only presentation components are rebuilt. New token module (`wallTheme.ts`) + new pure rollup helpers (`wallV2Rollups.ts`) feed rebuilt rail / timeline / right-column / family-strip components. Old dock, per-person glance strip, and grocery placeholder retire.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 (arbitrary-value classes off spec hexes), Vitest + React Testing Library, lucide-react.

## Global Constraints

- Work in worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/wall-redesign` (branch `wall-redesign`). Never edit the main worktree.
- Before any npm/npx command: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- Tests: `npx vitest run <file>` (never bare `npm test` — it's watch mode).
- Viewport target is exactly **1024×768**. No responsive breakpoints on wall components.
- Every scrollable region: `ref={useDragScroll<HTMLDivElement>()}` + `overflow-y-auto` + `min-h-0`. Signature: `useDragScroll<T extends HTMLElement>(): RefObject<T>` from `@/hooks/useDragScroll`.
- **Lucide icons only — no emoji** anywhere in rendered UI.
- Serif = existing `font-display` class only; never hardcode a font family. Serif appears ONLY in: weekday/date, clock, weather temp, dinner meal name, family-member names, quote.
- Timeline must keep rendering the `anytime` (unscheduled routines) section.
- Do not touch: `useWallData`, RLS/queries, `useBuildAutoReload`, `AuthForm` fallback, `pushPresetToUpdates`, action-sheet/recipe/discussion/phone/caller-ID logic.
- Commit after every task (conventional commits, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` footer).
- Palette hexes come from spec §4.2/§4.3 — copy exactly; light value + `dark:` warm-dark twin live together in each token string.

---

### Task 1: Theme tokens + quotes (`wallTheme.ts`)

**Files:**
- Create: `src/components/wall-v2/wallTheme.ts`
- Test: `src/components/wall-v2/wallTheme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `WALL: { root: string; rail: string; card: string; cardInset: string; label: string; muted: string; ink: string; inkStrong: string; dinnerCard: string; dinnerLabel: string; prepChip: string; nowAccent: string }` — Tailwind class strings, each containing light + `dark:` twin.
  - `PERSON_ACCENTS: string[]` (length 4, `border-l-[…]` classes) and `personAccent(index: number): string` (cycles).
  - `wallQuote(date: Date): { text: string; author: string }` — deterministic per calendar day.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/wall-v2/wallTheme.test.ts
import { describe, it, expect } from 'vitest';
import { WALL, PERSON_ACCENTS, personAccent, wallQuote } from './wallTheme';

describe('wallTheme', () => {
  it('tokens pair a light value with a warm-dark twin', () => {
    for (const token of [WALL.root, WALL.rail, WALL.card, WALL.cardInset, WALL.dinnerCard]) {
      expect(token).toContain('dark:');
    }
  });
  it('personAccent cycles through the 4 accents', () => {
    expect(personAccent(0)).toBe(PERSON_ACCENTS[0]);
    expect(personAccent(4)).toBe(PERSON_ACCENTS[0]);
    expect(personAccent(5)).toBe(PERSON_ACCENTS[1]);
  });
  it('wallQuote is deterministic per day and rotates across days', () => {
    const a1 = wallQuote(new Date('2026-07-19T08:00:00'));
    const a2 = wallQuote(new Date('2026-07-19T22:00:00'));
    expect(a1).toEqual(a2);
    const texts = new Set(
      [0, 1, 2, 3, 4].map((d) => wallQuote(new Date(2026, 6, 19 + d)).text),
    );
    expect(texts.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall-v2/wallTheme.test.ts`
Expected: FAIL — `Cannot find module './wallTheme'`

- [ ] **Step 3: Write the implementation**

```ts
// src/components/wall-v2/wallTheme.ts
//
// Warm Nordic token strings for the kiosk (spec 2026-07-19-wall-redesign).
// Each token carries its light value AND its warm-dark twin so components
// never assemble theme classes ad hoc. Hexes are the spec's §4.2/§4.3 values.

export const WALL = {
  root: 'bg-[linear-gradient(170deg,#F8F3E9,#F5EFE2)] dark:bg-[linear-gradient(170deg,#262019,#211B14)] text-[#3D362C] dark:text-[#EFE7D8]',
  rail: 'bg-[#F1EADB] dark:bg-[#2C251B] border border-[#E1D7C2] dark:border-[#3B3226]',
  card: 'bg-[#FDFAF3] dark:bg-[#2E2820] border border-[#E5DAC5] dark:border-[#3E362A] rounded-2xl shadow-[0_1px_4px_rgba(90,75,55,.07)]',
  cardInset: 'bg-[#FBF7EE] dark:bg-[#332C22] border border-[#EDE3CF] dark:border-[#3E362A] rounded-xl',
  label: 'text-[0.7rem] font-bold uppercase tracking-[0.15em] text-[#8A7D68] dark:text-[#A79A82]',
  muted: 'text-[#8A7D68] dark:text-[#A79A82]',
  ink: 'text-[#3D362C] dark:text-[#EFE7D8]',
  inkStrong: 'text-[#2F291F] dark:text-[#F7F1E4]',
  dinnerCard: 'bg-[#FCF5E7] dark:bg-[#332A1D] border border-[#E9D8B4] dark:border-[#4A3D28] rounded-2xl shadow-[0_1px_4px_rgba(90,75,55,.07)]',
  dinnerLabel: 'text-[0.7rem] font-bold uppercase tracking-[0.15em] text-[#A8743F] dark:text-[#D8BC85]',
  prepChip: 'bg-[#F2E4C4] dark:bg-[#4A3D28] text-[#7A5A2E] dark:text-[#D8BC85] rounded-lg px-3 py-1.5 text-[0.8rem] font-bold',
  nowAccent: 'border-l-4 border-l-[#2E4638] dark:border-l-[#4E7261]',
} as const;

export const PERSON_ACCENTS = [
  'border-l-[#7A8E7E]',
  'border-l-[#C9A96B]',
  'border-l-[#D97F5E]',
  'border-l-[#7C93A8]',
] as const satisfies readonly string[];

export function personAccent(index: number): string {
  return PERSON_ACCENTS[index % PERSON_ACCENTS.length];
}

const QUOTES = [
  { text: 'The days are long, but the years are short.', author: 'Gretchen Rubin' },
  { text: 'How we spend our days is, of course, how we spend our lives.', author: 'Annie Dillard' },
  { text: 'The little things? The little moments? They aren’t little.', author: 'Jon Kabat-Zinn' },
  { text: 'We do not remember days, we remember moments.', author: 'Cesare Pavese' },
  { text: 'Enjoy the little things, for one day you may look back and realize they were the big things.', author: 'Robert Brault' },
] as const;

/** Deterministic daily rotation — same quote all day, next quote tomorrow. */
export function wallQuote(date: Date): { text: string; author: string } {
  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  return QUOTES[dayIndex % QUOTES.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall-v2/wallTheme.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/wallTheme.ts src/components/wall-v2/wallTheme.test.ts
git commit -m "feat(wall): warm Nordic theme tokens + daily quote rotation"
```

---

### Task 2: Pure rollup helpers (`wallV2Rollups.ts`)

**Files:**
- Create: `src/components/wall-v2/wallV2Rollups.ts`
- Test: `src/components/wall-v2/wallV2Rollups.test.ts`

**Interfaces:**
- Consumes: `WallDayData` from `@/hooks/useWallData` (`{ date: Date; isToday: boolean; items: Record<DaySection, TimelineItem[]> }`), `TimelineItem` from `@/types/timeline` (`{ id, title, type, startTime: Date|null, endTime, completed, allDay? }`).
- Produces:
  - `computePrepWindow(dinnerStart: Date, prepMinutes?: number): { start: Date; end: Date; label: string }` — default 45 min; label like `"4:45 – 5:30"`.
  - `adaptTomorrowMorning(days: WallDayData[], now: Date): { id: string; time: string; title: string }[]` — tomorrow's first 3 items starting before noon; if none, tomorrow's first 3 timed items of any hour; `[]` if tomorrow empty/absent.
  - `adaptAtAGlanceRollup(today: WallDayData | undefined, dinnerStart: Date | null, dinnerName: string | null, now: Date): { id: string; icon: 'calendar' | 'tasks' | 'dinner' | 'home'; text: string }[]` — icon is a semantic key (the component maps it to a lucide icon; keeps this module render-free).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/wall-v2/wallV2Rollups.test.ts
import { describe, it, expect } from 'vitest';
import { computePrepWindow, adaptTomorrowMorning, adaptAtAGlanceRollup } from './wallV2Rollups';
import type { WallDayData } from '@/hooks/useWallData';
import type { TimelineItem } from '@/types/timeline';

const at = (h: number, m = 0) => new Date(2026, 6, 20, h, m);

function item(id: string, startTime: Date | null, over: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id, title: id, type: 'task', startTime,
    endTime: null, completed: false, ...over,
  } as TimelineItem;
}

function day(date: Date, isToday: boolean, sections: Partial<Record<string, TimelineItem[]>>): WallDayData {
  return {
    date, isToday, birthdays: [], milestones: [],
    items: { allday: [], unscheduled: [], morning: [], afternoon: [], evening: [], night: [], ...sections },
  } as unknown as WallDayData;
}

describe('computePrepWindow', () => {
  it('defaults to 45 minutes ending at dinner start', () => {
    const w = computePrepWindow(new Date(2026, 6, 19, 17, 30));
    expect(w.end.getHours()).toBe(17); expect(w.end.getMinutes()).toBe(30);
    expect(w.start.getHours()).toBe(16); expect(w.start.getMinutes()).toBe(45);
    expect(w.label).toBe('4:45 – 5:30');
  });
  it('honors explicit prep minutes', () => {
    const w = computePrepWindow(new Date(2026, 6, 19, 18, 0), 30);
    expect(w.label).toBe('5:30 – 6:00');
  });
});

describe('adaptTomorrowMorning', () => {
  const now = new Date(2026, 6, 19, 10, 0);
  it('returns tomorrow items before noon, capped at 3', () => {
    const tomorrow = day(new Date(2026, 6, 20), false, {
      morning: [item('a', at(7)), item('b', at(7, 30)), item('c', at(8, 15)), item('d', at(9))],
    });
    const rows = adaptTomorrowMorning([day(new Date(2026, 6, 19), true, {}), tomorrow], now);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows[0].time).toBe('7:00');
  });
  it('falls back to first 3 timed items when morning is empty', () => {
    const tomorrow = day(new Date(2026, 6, 20), false, {
      afternoon: [item('x', at(14))], evening: [item('y', at(18))],
    });
    const rows = adaptTomorrowMorning([tomorrow], now);
    expect(rows.map((r) => r.id)).toEqual(['x', 'y']);
  });
  it('returns [] when tomorrow is missing or empty', () => {
    expect(adaptTomorrowMorning([day(new Date(2026, 6, 19), true, {})], now)).toEqual([]);
  });
});

describe('adaptAtAGlanceRollup', () => {
  const now = new Date(2026, 6, 19, 10, 0);
  it('rolls up events, tasks, dinner, and everyone-home', () => {
    const today = day(new Date(2026, 6, 19), true, {
      morning: [item('swim', at(10, 30), { type: 'event' } as Partial<TimelineItem>)],
      afternoon: [item('errand', null, { type: 'task' } as Partial<TimelineItem>)],
    });
    const rows = adaptAtAGlanceRollup(today, new Date(2026, 6, 19, 17, 30), 'Grilled Salmon', now);
    const byIcon = Object.fromEntries(rows.map((r) => [r.icon, r.text]));
    expect(byIcon.calendar).toContain('1 event');
    expect(byIcon.tasks).toContain('1 task');
    expect(byIcon.dinner).toContain('5:30');
    expect(byIcon.home).toBe('Everyone home tonight');
  });
  it('omits everyone-home when an event starts at/after 6pm', () => {
    const today = day(new Date(2026, 6, 19), true, {
      evening: [item('practice', at(18, 30), { type: 'event' } as Partial<TimelineItem>)],
    });
    const rows = adaptAtAGlanceRollup(today, null, null, now);
    expect(rows.find((r) => r.icon === 'home')).toBeUndefined();
    expect(rows.find((r) => r.icon === 'dinner')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall-v2/wallV2Rollups.test.ts`
Expected: FAIL — `Cannot find module './wallV2Rollups'`

- [ ] **Step 3: Write the implementation**

```ts
// src/components/wall-v2/wallV2Rollups.ts
//
// Pure, render-free rollups for the redesigned right column. Kept out of
// wallV2Adapter.ts so that file doesn't keep growing; same spirit: view-shaped
// outputs computed from data the shell already holds.

import type { WallDayData } from '@/hooks/useWallData';
import type { TimelineItem } from '@/types/timeline';

const clock = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');

export function computePrepWindow(dinnerStart: Date, prepMinutes = 45): { start: Date; end: Date; label: string } {
  const start = new Date(dinnerStart.getTime() - prepMinutes * 60_000);
  return { start, end: dinnerStart, label: `${clock(start)} – ${clock(dinnerStart)}` };
}

function allItems(day: WallDayData): TimelineItem[] {
  return Object.values(day.items).flat();
}

function isTomorrow(day: WallDayData, now: Date): boolean {
  const t = new Date(now); t.setDate(t.getDate() + 1);
  return day.date.getFullYear() === t.getFullYear()
    && day.date.getMonth() === t.getMonth()
    && day.date.getDate() === t.getDate();
}

export function adaptTomorrowMorning(
  days: WallDayData[], now: Date,
): { id: string; time: string; title: string }[] {
  const tomorrow = days.find((d) => isTomorrow(d, now));
  if (!tomorrow) return [];
  const timed = allItems(tomorrow)
    .filter((i): i is TimelineItem & { startTime: Date } => !!i.startTime && !i.completed)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const morning = timed.filter((i) => i.startTime.getHours() < 12);
  return (morning.length > 0 ? morning : timed)
    .slice(0, 3)
    .map((i) => ({ id: i.id, time: clock(i.startTime), title: i.title }));
}

export interface GlanceRollupRow {
  id: string;
  icon: 'calendar' | 'tasks' | 'dinner' | 'home';
  text: string;
}

export function adaptAtAGlanceRollup(
  today: WallDayData | undefined,
  dinnerStart: Date | null,
  dinnerName: string | null,
  now: Date,
): GlanceRollupRow[] {
  if (!today) return [];
  const items = allItems(today);
  const rows: GlanceRollupRow[] = [];

  const events = items.filter((i) => i.type === 'event' && !i.completed);
  const nextEvent = events
    .filter((i): i is TimelineItem & { startTime: Date } => !!i.startTime && i.startTime >= now)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];
  if (events.length > 0) {
    rows.push({
      id: 'events', icon: 'calendar',
      text: `${events.length} event${events.length === 1 ? '' : 's'} today${nextEvent ? ` — next: ${nextEvent.title} at ${clock(nextEvent.startTime)}` : ''}`,
    });
  }

  const openTasks = items.filter((i) => i.type === 'task' && !i.completed);
  const dueToday = openTasks.filter((i) => !!i.startTime);
  if (openTasks.length > 0) {
    rows.push({
      id: 'tasks', icon: 'tasks',
      text: `${openTasks.length} task${openTasks.length === 1 ? '' : 's'} open${dueToday.length > 0 ? ` — ${dueToday.length} due today` : ''}`,
    });
  }

  if (dinnerStart) {
    rows.push({ id: 'dinner', icon: 'dinner', text: `Dinner at ${clock(dinnerStart)}${dinnerName ? ` — ${dinnerName}` : ''}` });
  }

  const eveningOut = events.some((i) => !!i.startTime && i.startTime.getHours() >= 18);
  if (!eveningOut) rows.push({ id: 'home', icon: 'home', text: 'Everyone home tonight' });

  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall-v2/wallV2Rollups.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/wallV2Rollups.ts src/components/wall-v2/wallV2Rollups.test.ts
git commit -m "feat(wall): prep-window, tomorrow-morning, at-a-glance rollup helpers"
```

---

### Task 3: Treeline asset + rail rebuild (`WallV2DateColumn`)

**Files:**
- Create: `public/wall/treeline.svg`
- Modify: `src/components/wall-v2/WallV2DateColumn.tsx` (full rewrite)
- Test: `src/components/wall-v2/WallV2DateColumn.test.tsx`

**Interfaces:**
- Consumes: `WALL`, `wallQuote` from `./wallTheme` (Task 1).
- Produces: `WallV2DateColumn(props)` — props UNCHANGED from current file (`weekday, fullDate, time, weatherIcon, weatherTint, temp, condition, high, low`) **plus new** `date: Date` (for the quote). The shell already has all of these.

- [ ] **Step 1: Create the treeline asset**

```xml
<!-- public/wall/treeline.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 130" preserveAspectRatio="none">
  <path d="M0,130 L20,95 L35,110 L55,70 L70,95 L90,55 L105,85 L125,45 L140,80 L160,60 L175,90 L195,50 L210,80 L230,40 L245,75 L265,58 L280,88 L300,48 L315,78 L335,62 L350,92 L365,72 L380,95 L380,130 Z" fill="#7A8E7E" opacity="0.4"/>
</svg>
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/wall-v2/WallV2DateColumn.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sun } from 'lucide-react';
import { WallV2DateColumn } from './WallV2DateColumn';

const props = {
  weekday: 'Saturday', fullDate: 'July 19, 2026', time: '10:04 AM',
  date: new Date(2026, 6, 19),
  weatherIcon: Sun, weatherTint: { bg: 'bg-amber-50', fg: 'text-amber-700' },
  temp: 72, condition: 'Partly cloudy', high: 77, low: 60,
};

describe('WallV2DateColumn', () => {
  it('renders date, clock, weather, tagline, and a quote with author', () => {
    render(<WallV2DateColumn {...props} />);
    expect(screen.getByText('Saturday')).toBeInTheDocument();
    expect(screen.getByText('10:04 AM')).toBeInTheDocument();
    expect(screen.getByText('72°')).toBeInTheDocument();
    expect(screen.getByText(/shape of your day/i)).toBeInTheDocument();
    expect(screen.getByText(/—/)).toBeInTheDocument(); // quote author line
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2DateColumn.test.tsx`
Expected: FAIL — no `date` prop / no tagline or quote in current component.

- [ ] **Step 4: Rewrite the component**

```tsx
// src/components/wall-v2/WallV2DateColumn.tsx
//
// The rail: serif weekday/date, tagline, serif clock, weather chip, and the
// daily quote pinned to the bottom. Fills the shell's left grid column.

import type { LucideIcon } from 'lucide-react';
import { WALL, wallQuote } from './wallTheme';

interface Props {
  weekday: string;
  fullDate: string;
  time: string;
  date: Date;
  weatherIcon: LucideIcon;
  weatherTint: { bg: string; fg: string };
  temp: number;
  condition: string;
  high: number;
  low: number;
}

export function WallV2DateColumn({
  weekday, fullDate, time, date, weatherIcon: WeatherIcon, weatherTint,
  temp, condition, high, low,
}: Props) {
  const quote = wallQuote(date);
  return (
    <div className={`${WALL.rail} rounded-2xl h-full flex flex-col p-5`}>
      <div className="font-display italic text-[2.3rem] leading-[1.05] text-[#2E4638] dark:text-[#4E7261]">
        {weekday},<br />{fullDate.replace(/, \d{4}$/, '')}
      </div>
      <div className={`mt-2 ${WALL.label}`}>Here's the shape of your day</div>
      <div className={`mt-4 font-display text-[2.75rem] leading-none tabular-nums ${WALL.ink}`}>
        {time}
      </div>
      <div className={`mt-4 ${WALL.cardInset} p-3`}>
        <div className="flex items-center gap-2.5">
          <div className={`grid place-items-center w-11 h-11 rounded-xl ${weatherTint.bg} ${weatherTint.fg}`}>
            <WeatherIcon className="w-6 h-6" />
          </div>
          <div className="leading-tight">
            <div className="flex items-baseline gap-1.5">
              <span className={`font-display text-[1.7rem] leading-none ${WALL.inkStrong}`}>{Math.round(temp)}°</span>
              <span className={`text-[0.85rem] ${WALL.muted}`}>{condition}</span>
            </div>
            <div className={`text-[0.75rem] mt-0.5 ${WALL.muted}`}>↑ {Math.round(high)}° · ↓ {Math.round(low)}°</div>
          </div>
        </div>
      </div>
      <div className={`mt-auto pt-4 font-display italic text-center text-[0.85rem] leading-relaxed ${WALL.muted}`}>
        "{quote.text}"<br />— {quote.author}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/wall-v2/WallV2DateColumn.test.tsx`
Expected: PASS. (The shell doesn't compile against this yet — it still passes old props minus `date`; TypeScript will flag it. That's fixed in Task 9; for now confirm only this test file.)

- [ ] **Step 6: Commit**

```bash
git add public/wall/treeline.svg src/components/wall-v2/WallV2DateColumn.tsx src/components/wall-v2/WallV2DateColumn.test.tsx
git commit -m "feat(wall): warm rail with clock, weather chip, daily quote + treeline asset"
```

---

### Task 4: Keep Moving card (`WallV2KeepMoving`)

**Files:**
- Create: `src/components/wall-v2/WallV2KeepMoving.tsx`
- Test: `src/components/wall-v2/WallV2KeepMoving.test.tsx`

**Interfaces:**
- Consumes: `WallV2TimelineEvent` from `./types`, `WALL` from `./wallTheme`, `useDragScroll`.
- Produces: `WallV2KeepMoving({ tasks: WallV2TimelineEvent[]; onToggleComplete: (id: string, completed: boolean) => void; onTapTask: (id: string) => void })`. The shell will feed it task-kind timeline events (overdue + today's tasks) it already assembles for the timeline.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/wall-v2/WallV2KeepMoving.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipboardList } from 'lucide-react';
import { WallV2KeepMoving } from './WallV2KeepMoving';
import type { WallV2TimelineEvent } from './types';

const task = (id: string, title: string): WallV2TimelineEvent => ({
  id, title, icon: ClipboardList, tint: 'sage', kind: 'task', completed: false,
});

describe('WallV2KeepMoving', () => {
  it('renders the label and one row per task', () => {
    render(<WallV2KeepMoving tasks={[task('task-1', 'Grocery pickup'), task('task-2', 'Science fair materials')]} onToggleComplete={() => {}} onTapTask={() => {}} />);
    expect(screen.getByText('Keep moving')).toBeInTheDocument();
    expect(screen.getByText('Grocery pickup')).toBeInTheDocument();
    expect(screen.getByText('Science fair materials')).toBeInTheDocument();
  });
  it('checkbox toggles completion; row tap opens the task', () => {
    const onToggle = vi.fn(); const onTap = vi.fn();
    render(<WallV2KeepMoving tasks={[task('task-1', 'Grocery pickup')]} onToggleComplete={onToggle} onTapTask={onTap} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /grocery pickup/i }));
    expect(onToggle).toHaveBeenCalledWith('task-1', true);
    fireEvent.click(screen.getByText('Grocery pickup'));
    expect(onTap).toHaveBeenCalledWith('task-1');
  });
  it('renders empty state when no tasks', () => {
    render(<WallV2KeepMoving tasks={[]} onToggleComplete={() => {}} onTapTask={() => {}} />);
    expect(screen.getByText(/nothing pressing/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2KeepMoving.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/wall-v2/WallV2KeepMoving.tsx
//
// "Keep Moving" — today's open family tasks in a fixed-height card at the
// bottom of the center column. Rows drag-scroll (Pi sends mouse events).

import { useDragScroll } from '@/hooks/useDragScroll';
import { WALL } from './wallTheme';
import { TINTS } from './tints';
import type { WallV2TimelineEvent } from './types';

interface Props {
  tasks: WallV2TimelineEvent[];
  onToggleComplete: (id: string, completed: boolean) => void;
  onTapTask: (id: string) => void;
}

export function WallV2KeepMoving({ tasks, onToggleComplete, onTapTask }: Props) {
  const scrollRef = useDragScroll<HTMLDivElement>();
  return (
    <div className={`${WALL.card} h-full min-h-0 flex flex-col px-4 py-3`}>
      <div className={WALL.label}>Keep moving</div>
      {tasks.length === 0 ? (
        <div className={`flex-1 grid place-items-center text-[0.9rem] ${WALL.muted}`}>
          Nothing pressing — enjoy the day.
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto mt-1">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-1.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={!!t.completed}
                aria-label={t.title}
                onClick={() => onToggleComplete(t.id, !t.completed)}
                className="shrink-0 w-9 h-9 grid place-items-center"
              >
                <span className={`w-[18px] h-[18px] rounded-full border-2 ${t.completed ? 'bg-[#2E4638] border-[#2E4638] dark:bg-[#4E7261] dark:border-[#4E7261]' : 'border-[#B9AB90] dark:border-[#6B5F4A]'}`} />
              </button>
              <button
                type="button"
                onClick={() => onTapTask(t.id)}
                className={`flex-1 min-w-0 text-left text-[0.95rem] font-semibold truncate ${t.completed ? `line-through ${WALL.muted}` : WALL.inkStrong}`}
              >
                {t.title}
              </button>
              {t.chips?.[0] && (
                <span className={`shrink-0 text-[0.65rem] font-bold tracking-[0.06em] px-2 py-0.5 rounded-md ${TINTS[t.chips[0].tint ?? 'sage'].bg} ${TINTS[t.chips[0].tint ?? 'sage'].fg}`}>
                  {t.chips[0].label.toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall-v2/WallV2KeepMoving.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/WallV2KeepMoving.tsx src/components/wall-v2/WallV2KeepMoving.test.tsx
git commit -m "feat(wall): Keep Moving open-tasks card"
```

---

### Task 5: Dinner hero (`WallV2DinnerCard`)

**Files:**
- Create: `src/components/wall-v2/WallV2DinnerCard.tsx`
- Test: `src/components/wall-v2/WallV2DinnerCard.test.tsx`

**Interfaces:**
- Consumes: `computePrepWindow` (Task 2), `WALL` (Task 1), `UtensilsCrossed` from lucide.
- Produces: `WallV2DinnerCard({ mealName: string | null; subtitle?: string | null; dinnerStart: Date | null; prepMinutes?: number; photoUrl?: string | null; onTap?: () => void })`. `mealName === null` renders the empty state. Shell supplies `dinnerMealName`, `dinnerEvent?.startTime`, and `onTap` → existing recipe-viewer path.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/wall-v2/WallV2DinnerCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2DinnerCard } from './WallV2DinnerCard';

describe('WallV2DinnerCard', () => {
  it('renders meal name, subtitle, and prep window from dinner start', () => {
    render(<WallV2DinnerCard mealName="Grilled Salmon" subtitle="with couscous & roasted vegetables" dinnerStart={new Date(2026, 6, 19, 17, 30)} onTap={() => {}} />);
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument();
    expect(screen.getByText(/couscous/)).toBeInTheDocument();
    expect(screen.getByText(/4:45 – 5:30/)).toBeInTheDocument();
  });
  it('fires onTap when tapped', () => {
    const onTap = vi.fn();
    render(<WallV2DinnerCard mealName="Tacos" dinnerStart={null} onTap={onTap} />);
    fireEvent.click(screen.getByText('Tacos'));
    expect(onTap).toHaveBeenCalled();
  });
  it('renders quiet empty state when no dinner is planned', () => {
    render(<WallV2DinnerCard mealName={null} dinnerStart={null} />);
    expect(screen.getByText(/no dinner planned/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2DinnerCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/wall-v2/WallV2DinnerCard.tsx
//
// Dinner hero for the right column: photo band (or warm gradient), serif meal
// name, prep-window chip. Tap = shell's existing recipe-viewer behavior.

import { UtensilsCrossed } from 'lucide-react';
import { WALL } from './wallTheme';
import { computePrepWindow } from './wallV2Rollups';

interface Props {
  mealName: string | null;
  subtitle?: string | null;
  dinnerStart: Date | null;
  prepMinutes?: number;
  photoUrl?: string | null;
  onTap?: () => void;
}

export function WallV2DinnerCard({ mealName, subtitle, dinnerStart, prepMinutes, photoUrl, onTap }: Props) {
  if (!mealName) {
    return (
      <div className={`${WALL.dinnerCard} p-4`}>
        <div className={WALL.dinnerLabel}>Dinner plan</div>
        <div className={`mt-2 text-[0.9rem] ${WALL.muted}`}>No dinner planned — plan on the meals page.</div>
      </div>
    );
  }
  const prep = dinnerStart ? computePrepWindow(dinnerStart, prepMinutes) : null;
  return (
    <button type="button" onClick={onTap} className={`${WALL.dinnerCard} w-full text-left overflow-hidden block`}>
      <div
        className="h-[88px] bg-[radial-gradient(circle_at_30%_35%,#F2C296,transparent_55%),linear-gradient(135deg,#E8A87C,#C9694C)] bg-cover bg-center"
        style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
      />
      <div className="p-3.5">
        <div className={`flex items-center gap-1.5 ${WALL.dinnerLabel}`}>
          <UtensilsCrossed className="w-3.5 h-3.5" /> Dinner plan
        </div>
        <div className={`font-display italic text-[1.5rem] leading-tight mt-1 ${WALL.inkStrong}`}>{mealName}</div>
        {subtitle && <div className={`text-[0.8rem] mt-0.5 ${WALL.muted}`}>{subtitle}</div>}
        {prep && <div className={`inline-block mt-2 ${WALL.prepChip}`}>Prep window · {prep.label}</div>}
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall-v2/WallV2DinnerCard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/WallV2DinnerCard.tsx src/components/wall-v2/WallV2DinnerCard.test.tsx
git commit -m "feat(wall): dinner hero card with prep window"
```

---

### Task 6: Right column rebuild (tomorrow + at-a-glance + question)

**Files:**
- Create: `src/components/wall-v2/WallV2TomorrowCard.tsx`
- Create: `src/components/wall-v2/WallV2GlanceRollupCard.tsx`
- Modify: `src/components/wall-v2/WallV2RightColumn.tsx` (full rewrite)
- Modify: `src/components/wall-v2/WallV2QuestionCard.tsx` (token pass only — swap its container/label classes to `WALL.card` / `WALL.label`; keep props and behavior identical)
- Test: `src/components/wall-v2/WallV2RightColumn.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2, 5 exports; `WallV2QuestionCard({ question, onTap })` (existing).
- Produces:
  - `WallV2TomorrowCard({ rows: { id: string; time: string; title: string }[] })` — renders `null` when `rows.length === 0`.
  - `WallV2GlanceRollupCard({ rows: GlanceRollupRow[] })` — maps semantic icon keys: `calendar→CalendarDays`, `tasks→CircleCheckBig`, `dinner→UtensilsCrossed`, `home→House` (all lucide).
  - `WallV2RightColumn({ dinner: { mealName, subtitle, dinnerStart, photoUrl, onTap }, tomorrowRows, glanceRows, question, onTapQuestion })` — replaces the old `{grocery, upcoming, question}` props. **Old `WallV2GroceryCard` and `WallV2UpcomingCard` imports drop out of the column.**

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/wall-v2/WallV2RightColumn.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WallV2RightColumn } from './WallV2RightColumn';

const baseProps = {
  dinner: { mealName: 'Grilled Salmon', subtitle: null, dinnerStart: new Date(2026, 6, 19, 17, 30), photoUrl: null, onTap: () => {} },
  tomorrowRows: [{ id: 'a', time: '7:00', title: 'Breakfast & pack lunches' }],
  glanceRows: [
    { id: 'events', icon: 'calendar' as const, text: '2 events today — next: Swim at 10:30' },
    { id: 'home', icon: 'home' as const, text: 'Everyone home tonight' },
  ],
  question: 'What made you laugh today?',
  onTapQuestion: () => {},
};

describe('WallV2RightColumn', () => {
  it('stacks dinner, tomorrow, at-a-glance, and question', () => {
    render(<WallV2RightColumn {...baseProps} />);
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow morning')).toBeInTheDocument();
    expect(screen.getByText(/pack lunches/)).toBeInTheDocument();
    expect(screen.getByText('Everyone home tonight')).toBeInTheDocument();
    expect(screen.getByText(/laugh today/)).toBeInTheDocument();
  });
  it('hides tomorrow card when empty and question when null', () => {
    render(<WallV2RightColumn {...baseProps} tomorrowRows={[]} question={null} />);
    expect(screen.queryByText('Tomorrow morning')).not.toBeInTheDocument();
    expect(screen.queryByText(/laugh today/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2RightColumn.test.tsx`
Expected: FAIL — props mismatch with old column.

- [ ] **Step 3: Write the two new cards**

```tsx
// src/components/wall-v2/WallV2TomorrowCard.tsx
// Tomorrow-morning preview: up to 3 rows, time in honey, hidden when empty.

import { Sunrise } from 'lucide-react';
import { WALL } from './wallTheme';

interface Props { rows: { id: string; time: string; title: string }[] }

export function WallV2TomorrowCard({ rows }: Props) {
  if (rows.length === 0) return null;
  return (
    <div className={`${WALL.card} px-4 py-3`}>
      <div className={`flex items-center gap-1.5 ${WALL.label}`}>
        <Sunrise className="w-3.5 h-3.5" /> Tomorrow morning
      </div>
      <div className="mt-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex gap-2.5 py-1 text-[0.9rem]">
            <span className="w-10 shrink-0 font-bold text-[0.8rem] text-[#A8743F] dark:text-[#D8BC85] tabular-nums">{r.time}</span>
            <span className={`truncate ${WALL.ink}`}>{r.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// src/components/wall-v2/WallV2GlanceRollupCard.tsx
// "At a glance" — day rollup rows with lucide icons mapped from semantic keys.

import { CalendarDays, CircleCheckBig, House, UtensilsCrossed } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WALL } from './wallTheme';
import type { GlanceRollupRow } from './wallV2Rollups';

const ICONS: Record<GlanceRollupRow['icon'], LucideIcon> = {
  calendar: CalendarDays, tasks: CircleCheckBig, dinner: UtensilsCrossed, home: House,
};

export function WallV2GlanceRollupCard({ rows }: { rows: GlanceRollupRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className={`${WALL.card} px-4 py-3`}>
      <div className={WALL.label}>At a glance</div>
      <div className="mt-1.5">
        {rows.map((r) => {
          const Icon = ICONS[r.icon];
          return (
            <div key={r.id} className={`flex items-center gap-2.5 py-1 text-[0.9rem] ${WALL.ink}`}>
              <Icon className={`w-4 h-4 shrink-0 ${WALL.muted}`} />
              <span className="truncate">{r.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the column + token-pass the question card**

```tsx
// src/components/wall-v2/WallV2RightColumn.tsx
//
// Right column: dinner hero, tomorrow-morning preview, at-a-glance rollup,
// tonight's question. Drag-scrolls when content exceeds the column.
// Phase 2 reserves the slot ABOVE the dinner card for "Symphony Noticed".

import { useDragScroll } from '@/hooks/useDragScroll';
import { WallV2DinnerCard } from './WallV2DinnerCard';
import { WallV2TomorrowCard } from './WallV2TomorrowCard';
import { WallV2GlanceRollupCard } from './WallV2GlanceRollupCard';
import { WallV2QuestionCard } from './WallV2QuestionCard';
import type { GlanceRollupRow } from './wallV2Rollups';

interface Props {
  dinner: {
    mealName: string | null;
    subtitle?: string | null;
    dinnerStart: Date | null;
    photoUrl?: string | null;
    onTap?: () => void;
  };
  tomorrowRows: { id: string; time: string; title: string }[];
  glanceRows: GlanceRollupRow[];
  question: string | null;
  onTapQuestion?: () => void;
}

export function WallV2RightColumn({ dinner, tomorrowRows, glanceRows, question, onTapQuestion }: Props) {
  const scrollRef = useDragScroll<HTMLDivElement>();
  return (
    <div ref={scrollRef} className="flex flex-col gap-3 h-full min-h-0 overflow-y-auto pr-1 -mr-1">
      <WallV2DinnerCard
        mealName={dinner.mealName}
        subtitle={dinner.subtitle}
        dinnerStart={dinner.dinnerStart}
        photoUrl={dinner.photoUrl}
        onTap={dinner.onTap}
      />
      <WallV2TomorrowCard rows={tomorrowRows} />
      <WallV2GlanceRollupCard rows={glanceRows} />
      {question && <WallV2QuestionCard question={question} onTap={onTapQuestion} />}
    </div>
  );
}
```

In `WallV2QuestionCard.tsx`, change ONLY the container and label classNames: outer card container → `` `${WALL.card} px-4 py-3` ``, its heading class → `WALL.label`, body text → keep size but color `WALL.ink`. Import `{ WALL } from './wallTheme'`. Do not change props, copy, or tap behavior.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/wall-v2/WallV2RightColumn.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/wall-v2/WallV2TomorrowCard.tsx src/components/wall-v2/WallV2GlanceRollupCard.tsx src/components/wall-v2/WallV2RightColumn.tsx src/components/wall-v2/WallV2QuestionCard.tsx src/components/wall-v2/WallV2RightColumn.test.tsx
git commit -m "feat(wall): right column — dinner hero, tomorrow morning, at-a-glance, question"
```

---

### Task 7: Family strip + dock cluster (`WallV2FamilyStrip`)

**Files:**
- Create: `src/components/wall-v2/WallV2FamilyStrip.tsx`
- Test: `src/components/wall-v2/WallV2FamilyStrip.test.tsx`

**Interfaces:**
- Consumes: `FamilyMember` from `@/types/family` (`{ id: string; name: string; … }`), `WallDayData`, `adaptGlanceForMember` from `./wallV2Adapter` (returns `{ title, primary, secondary } | null`), `personAccent`/`WALL` (Task 1), lucide `Plus, MessagesSquare, Phone, Settings`.
- Produces: `WallV2FamilyStrip({ familyMembers: FamilyMember[]; today: WallDayData | undefined; now: Date; onDockAction: (id: 'task' | 'discuss' | 'phone' | 'utilities') => void })`. Portraits load from `/wall/portrait-<member.id>.png`; `onError` flips to the monogram medallion. Cap 5 member cards.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/wall-v2/WallV2FamilyStrip.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2FamilyStrip } from './WallV2FamilyStrip';
import type { FamilyMember } from '@/types/family';

const members = [
  { id: 'm1', name: 'Scott' }, { id: 'm2', name: 'Iris' },
] as FamilyMember[];

describe('WallV2FamilyStrip', () => {
  it('renders one card per member with monogram fallback and all-clear line', () => {
    render(<WallV2FamilyStrip familyMembers={members} today={undefined} now={new Date()} onDockAction={() => {}} />);
    expect(screen.getByText('Scott')).toBeInTheDocument();
    expect(screen.getByText('Iris')).toBeInTheDocument();
    expect(screen.getAllByText(/all clear today/i)).toHaveLength(2);
    // portraits attempt the naming convention
    expect(screen.getByAltText('Scott')).toHaveAttribute('src', '/wall/portrait-m1.png');
  });
  it('fires dock actions', () => {
    const onDock = vi.fn();
    render(<WallV2FamilyStrip familyMembers={members} today={undefined} now={new Date()} onDockAction={onDock} />);
    fireEvent.click(screen.getByLabelText('Add a task'));
    expect(onDock).toHaveBeenCalledWith('task');
    fireEvent.click(screen.getByLabelText('Utilities'));
    expect(onDock).toHaveBeenCalledWith('utilities');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2FamilyStrip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/wall-v2/WallV2FamilyStrip.tsx
//
// Bottom band: one warm card per family member (watercolor portrait when the
// asset exists at /wall/portrait-<id>.png, monogram medallion otherwise, name
// in serif, their next thing today) + the 2×2 dock cluster on the right.
// Replaces WallV2ActionDock and the old WallV2AtAGlance strip.

import { useState } from 'react';
import { MessagesSquare, Phone, Plus, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { WallDayData } from '@/hooks/useWallData';
import { adaptGlanceForMember } from './wallV2Adapter';
import { WALL, personAccent } from './wallTheme';

export type WallDockActionId = 'task' | 'discuss' | 'phone' | 'utilities';

const DOCK: { id: WallDockActionId; label: string; icon: LucideIcon }[] = [
  { id: 'task', label: 'Add a task', icon: Plus },
  { id: 'discuss', label: 'Discuss', icon: MessagesSquare },
  { id: 'phone', label: 'Phone', icon: Phone },
  { id: 'utilities', label: 'Utilities', icon: Settings },
];

function Portrait({ member }: { member: FamilyMember }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-[60px] h-[60px] shrink-0 rounded-xl border-2 border-[#EEE1C7] dark:border-[#4A3D28] bg-[radial-gradient(circle_at_35%_28%,#F4E5CA,#DCC49A)] dark:bg-[radial-gradient(circle_at_35%_28%,#4A3D28,#332C22)] grid place-items-center font-display text-[1.4rem] text-[#6E5A3A] dark:text-[#D8BC85]">
        {member.name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={`/wall/portrait-${member.id}.png`}
      alt={member.name}
      onError={() => setFailed(true)}
      className="w-[60px] h-[60px] shrink-0 rounded-xl border-2 border-[#EEE1C7] dark:border-[#4A3D28] object-cover"
    />
  );
}

interface Props {
  familyMembers: FamilyMember[];
  today: WallDayData | undefined;
  now: Date;
  onDockAction: (id: WallDockActionId) => void;
}

export function WallV2FamilyStrip({ familyMembers, today, now, onDockAction }: Props) {
  return (
    <div className="h-full flex gap-2.5">
      {familyMembers.slice(0, 5).map((member, i) => {
        const glance = adaptGlanceForMember(member, today, now);
        return (
          <div key={member.id} className={`${WALL.card} border-l-4 ${personAccent(i)} flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2`}>
            <Portrait member={member} />
            <div className="min-w-0">
              <div className={`font-display text-[1.1rem] leading-tight truncate ${WALL.inkStrong}`}>{member.name}</div>
              <div className={`text-[0.78rem] truncate ${WALL.muted}`}>
                {glance ? `${glance.primary}${glance.secondary ? ` · ${glance.secondary}` : ''}` : 'All clear today'}
              </div>
            </div>
          </div>
        );
      })}
      <div className={`${WALL.rail} rounded-2xl shrink-0 w-[124px] grid grid-cols-2 gap-1.5 p-2`}>
        {DOCK.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={label}
            onClick={() => onDockAction(id)}
            className={`${WALL.card} grid place-items-center text-[#2E4638] dark:text-[#4E7261] active:scale-95 transition-transform`}
          >
            <Icon className="w-5 h-5" />
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall-v2/WallV2FamilyStrip.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/WallV2FamilyStrip.tsx src/components/wall-v2/WallV2FamilyStrip.test.tsx
git commit -m "feat(wall): family strip with portrait fallback + dock cluster"
```

---

### Task 8: Utility sheet (`WallV2UtilitySheet`)

**Files:**
- Create: `src/components/wall-v2/WallV2UtilitySheet.tsx`
- Test: `src/components/wall-v2/WallV2UtilitySheet.test.tsx`

**Interfaces:**
- Consumes: `WALL` (Task 1); lucide `ImageOff, RefreshCw, Eye, EyeOff, Moon, Sun, X`.
- Produces: `WallV2UtilitySheet({ hideRoutines: boolean; isDark: boolean; refreshing: boolean; onGuestMode: () => void; onRefresh: () => void; onToggleHideRoutines: () => void; onToggleTheme: () => void; onClose: () => void })` — full-screen scrim + bottom sheet of four ≥80px rows; guest-mode row also closes the sheet (shell handles via its callback), scrim tap closes.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/wall-v2/WallV2UtilitySheet.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallV2UtilitySheet } from './WallV2UtilitySheet';

const props = () => ({
  hideRoutines: false, isDark: false, refreshing: false,
  onGuestMode: vi.fn(), onRefresh: vi.fn(), onToggleHideRoutines: vi.fn(),
  onToggleTheme: vi.fn(), onClose: vi.fn(),
});

describe('WallV2UtilitySheet', () => {
  it('renders all four utilities and fires their callbacks', () => {
    const p = props();
    render(<WallV2UtilitySheet {...p} />);
    fireEvent.click(screen.getByText('Guest mode'));
    expect(p.onGuestMode).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Refresh'));
    expect(p.onRefresh).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/hide daily routines/i));
    expect(p.onToggleHideRoutines).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/night theme/i));
    expect(p.onToggleTheme).toHaveBeenCalled();
  });
  it('closes on scrim tap', () => {
    const p = props();
    render(<WallV2UtilitySheet {...p} />);
    fireEvent.click(screen.getByTestId('utility-scrim'));
    expect(p.onClose).toHaveBeenCalled();
  });
  it('labels flip with state', () => {
    const p = { ...props(), hideRoutines: true, isDark: true };
    render(<WallV2UtilitySheet {...p} />);
    expect(screen.getByText(/show daily routines/i)).toBeInTheDocument();
    expect(screen.getByText(/day theme/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall-v2/WallV2UtilitySheet.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/wall-v2/WallV2UtilitySheet.tsx
//
// Bottom sheet for the four wall utilities (was: floating corner buttons).
// Touch-first: 80px rows, scrim tap closes, no fine targets.

import { Eye, EyeOff, ImageOff, Moon, RefreshCw, Sun, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WALL } from './wallTheme';

interface Props {
  hideRoutines: boolean;
  isDark: boolean;
  refreshing: boolean;
  onGuestMode: () => void;
  onRefresh: () => void;
  onToggleHideRoutines: () => void;
  onToggleTheme: () => void;
  onClose: () => void;
}

export function WallV2UtilitySheet({
  hideRoutines, isDark, refreshing,
  onGuestMode, onRefresh, onToggleHideRoutines, onToggleTheme, onClose,
}: Props) {
  const rows: { id: string; label: string; icon: LucideIcon; spin?: boolean; onTap: () => void }[] = [
    { id: 'guest', label: 'Guest mode', icon: ImageOff, onTap: onGuestMode },
    { id: 'refresh', label: 'Refresh', icon: RefreshCw, spin: refreshing, onTap: onRefresh },
    { id: 'routines', label: hideRoutines ? 'Show daily routines' : 'Hide daily routines', icon: hideRoutines ? Eye : EyeOff, onTap: onToggleHideRoutines },
    { id: 'theme', label: isDark ? 'Day theme' : 'Night theme', icon: isDark ? Sun : Moon, onTap: onToggleTheme },
  ];
  return (
    <div className="fixed inset-0 z-40">
      <div data-testid="utility-scrim" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className={`absolute bottom-0 inset-x-0 ${WALL.root} rounded-t-3xl p-5 pb-7`}>
        <div className="flex items-center justify-between mb-3">
          <div className={WALL.label}>Wall utilities</div>
          <button type="button" aria-label="Close" onClick={onClose} className={`${WALL.card} grid place-items-center w-12 h-12`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {rows.map(({ id, label, icon: Icon, spin, onTap }) => (
            <button key={id} type="button" onClick={onTap} className={`${WALL.card} flex items-center gap-3 px-5 h-[80px] text-left`}>
              <Icon className={`w-6 h-6 shrink-0 ${spin ? 'animate-spin' : ''} ${WALL.muted}`} />
              <span className={`text-[1.05rem] font-semibold ${WALL.inkStrong}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall-v2/WallV2UtilitySheet.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/wall-v2/WallV2UtilitySheet.tsx src/components/wall-v2/WallV2UtilitySheet.test.tsx
git commit -m "feat(wall): utility bottom sheet replacing floating corner buttons"
```

---

### Task 9: Shell integration (new grid, wire everything, retire old pieces)

**Files:**
- Modify: `src/components/wall-v2/WallV2Shell.tsx`
- Delete: `src/components/wall-v2/WallV2ActionDock.tsx`, `src/components/wall-v2/WallV2AtAGlance.tsx`, `src/components/wall-v2/WallV2GroceryCard.tsx`, `src/components/wall-v2/WallV2GlanceCard.tsx`, `src/components/wall-v2/WallV2UpcomingCard.tsx`
- Test: existing suite must pass; `src/components/wall-v2/pushPresetToUpdates.test.ts` untouched.

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: the live `/wall-v2` shell. No export-shape change (`WallV2Shell()` + `pushPresetToUpdates` stay).

- [ ] **Step 1: Rewire data plumbing in `WallV2Shell.tsx`**

Keep ALL existing hooks/state/handlers. Make these changes only:

1. Remove imports: `WallV2AtAGlance`, `WallV2ActionDock`, `MOCK_ACTIONS`, `Eye, EyeOff, Moon, Sun, RefreshCw, ImageOff` from lucide, `PLACEHOLDER_GROCERY` const, `adaptGlanceForMember`-based `glance` memo, `adaptUpcoming`/`upcoming` memo, `WallV2GroceryData` type import.
2. Add imports:

```tsx
import { WallV2KeepMoving } from './WallV2KeepMoving';
import { WallV2FamilyStrip, type WallDockActionId } from './WallV2FamilyStrip';
import { WallV2UtilitySheet } from './WallV2UtilitySheet';
import { adaptTomorrowMorning, adaptAtAGlanceRollup } from './wallV2Rollups';
```

3. Add state + memos (near the other overlay state):

```tsx
const [showUtilities, setShowUtilities] = useState(false);

const tomorrowRows = useMemo(
  () => adaptTomorrowMorning(wallData.days, now),
  [wallData.days, now],
);
const glanceRows = useMemo(
  () => adaptAtAGlanceRollup(todayData, dinnerEvent?.startTime ?? null, dinnerEvent ? dinnerMealName : null, now),
  [todayData, dinnerEvent, dinnerMealName, now],
);
// Keep Moving = task-kind items from every timeline section, incomplete first.
const keepMovingTasks = useMemo(
  () => timeline.flatMap((s) => s.events).filter((e) => e.kind === 'task'),
  [timeline],
);
```

4. Replace `handleAction` with the typed dock handler (same behaviors, fewer branches — `reminder`/`grocery`/`event` placeholders retire):

```tsx
const handleDockAction = useCallback((id: WallDockActionId) => {
  switch (id) {
    case 'task': setShowQuickCapture(true); break;
    case 'discuss':
      if (discussionItems.length > 0) setShowDiscussion(true);
      else showFlash('Nothing flagged for discussion right now');
      break;
    case 'phone': setShowPhone(true); break;
    case 'utilities': setShowUtilities(true); break;
  }
}, [discussionItems.length, showFlash]);
```

- [ ] **Step 2: Replace the render tree**

Root div className becomes (keep `dark` prefix logic and `wall-touch-root relative h-screen w-screen overflow-hidden transition-colors`):

```tsx
<div className={`${isDark ? 'dark ' : ''}wall-touch-root relative h-screen w-screen overflow-hidden transition-colors ${WALL.root}`}>
  <img src="/wall/treeline.svg" alt="" aria-hidden className="absolute top-0 right-0 w-[340px] h-[110px] opacity-30 dark:opacity-15 pointer-events-none" />
  <div className="h-full w-full p-4 grid grid-cols-[220px_minmax(0,1fr)_264px] grid-rows-[minmax(0,1fr)_116px] gap-3">
    {/* Row 1 — rail */}
    <div className="row-span-1 col-start-1 min-h-0">
      <WallV2DateColumn
        weekday={weekday} fullDate={fullDate} time={clock} date={now}
        weatherIcon={weatherData.icon ?? Sun} weatherTint={{ bg: TINTS.honey.bg, fg: TINTS.honey.fg }}
        temp={weatherData.temp} condition={weatherData.condition}
        high={weatherData.high} low={weatherData.low}
      />
    </div>
    {/* Row 1 — center: NOW + timeline + Keep Moving */}
    <div className="row-span-1 col-start-2 flex flex-col gap-3 min-h-0 min-w-0">
      <WallV2NowNext today={todayData} familyMembers={wallData.familyMembers} now={now} />
      <div className="min-h-0 flex-1">
        <WallV2Timeline
          band={scheduleBand}
          calendarUnavailable={wallData.calendarUnavailable}
          sections={timeline}
          onTapEvent={handleTapEvent}
          onToggleComplete={handleToggleComplete}
          onTapFullDay={handleTapFullDay}
        />
      </div>
      <div className="h-[104px] shrink-0">
        <WallV2KeepMoving tasks={keepMovingTasks} onToggleComplete={handleToggleComplete} onTapTask={handleTapEvent} />
      </div>
    </div>
    {/* Row 1 — right column */}
    <div className="row-span-1 col-start-3 min-h-0">
      <WallV2RightColumn
        dinner={{
          mealName: dinnerEvent ? dinnerMealName : null,
          dinnerStart: dinnerEvent?.startTime ?? null,
          photoUrl: null,
          onTap: () => handleTapEvent(`dinner-${dinnerEvent?.id ?? 'none'}`),
        }}
        tomorrowRows={tomorrowRows}
        glanceRows={glanceRows}
        question={tonightQuestion}
      />
    </div>
    {/* Row 2 — family strip + dock cluster */}
    <div className="row-start-2 col-span-3 relative min-h-0">
      {flashMessage && (
        <div role="status" className="animate-fade-in-up absolute -top-9 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-stone-800/90 dark:bg-stone-200/90 text-white dark:text-stone-900 text-[0.85rem] font-bold shadow-lg backdrop-blur-md whitespace-nowrap">
          {flashMessage}
        </div>
      )}
      <WallV2FamilyStrip familyMembers={wallData.familyMembers} today={todayData} now={now} onDockAction={handleDockAction} />
    </div>
  </div>
  {/* …existing overlays unchanged, plus: */}
  {showUtilities && (
    <WallV2UtilitySheet
      hideRoutines={hideRoutines} isDark={isDark} refreshing={wallData.loading}
      onGuestMode={() => { setShowUtilities(false); setGuestMode(true); }}
      onRefresh={() => { void wallData.refetch(); showFlash('Refreshing…'); }}
      onToggleHideRoutines={toggleHideRoutines}
      onToggleTheme={toggleTheme}
      onClose={() => setShowUtilities(false)}
    />
  )}
</div>
```

Notes: `dinnerEvent` here is the object returned by `findDinnerEvent` — confirm its start field name in `WallDinnerWidget.tsx` (`startTime` on `CalendarEvent`) and adjust if it's `start`. Keep every existing overlay block verbatim. Import `WALL` from `./wallTheme`.

- [ ] **Step 3: Delete retired components**

```bash
git rm src/components/wall-v2/WallV2ActionDock.tsx src/components/wall-v2/WallV2AtAGlance.tsx src/components/wall-v2/WallV2GroceryCard.tsx src/components/wall-v2/WallV2GlanceCard.tsx src/components/wall-v2/WallV2UpcomingCard.tsx
```

Then fix any leftover imports (`MOCK_ACTIONS` in `wallV2Mock.ts` may keep its data — only delete the mock's dock/glance/grocery/upcoming entries if TypeScript complains about their deleted types; `WallV2GroceryData`, `WallV2ActionDef`, `WallV2GlanceCard`, `WallV2UpcomingItem` types in `types.ts` and their adapter functions `adaptGlanceForMember` — KEEP `adaptGlanceForMember` (family strip uses it) and KEEP `WallV2GlanceCard` type (it's its return shape); remove `adaptUpcoming` + `WallV2UpcomingItem` + `WallV2GroceryData` + `WallV2ActionDef` and the mock entries that used them, plus `firstUpcomingItem`/`dayLabel`/`UPCOMING_TINTS` if now unused).

- [ ] **Step 4: Typecheck + full wall test suite**

Run: `npx tsc --noEmit && npx vitest run src/components/wall-v2/`
Expected: tsc clean; all wall tests pass (adapter, event card, action sheet, now/next, schedule band, guest screen, phone screen, caller-id, pushPresetToUpdates, plus Tasks 1–8 tests). Fix compile fallout from deletions before moving on — the failure mode to expect is a stale import in `wallV2Mock.ts` or `wallV2Adapter.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/wall-v2/
git commit -m "feat(wall): new shell grid — rail, timeline, right column, family strip; retire dock/glance/grocery"
```

---

### Task 10: Timeline + NOW + event-card token pass

**Files:**
- Modify: `src/components/wall-v2/WallV2Timeline.tsx`, `src/components/wall-v2/WallV2EventCard.tsx`, `src/components/wall-v2/WallV2ScheduleBand.tsx`, `src/components/wall-v2/WallV2NowNext.tsx`
- Test: existing tests for these files must keep passing.

**Interfaces:** No prop changes anywhere in this task. Presentation-only.

- [ ] **Step 1: Apply the token map**

In all four files, import `{ WALL } from './wallTheme'` and replace container/label/typography classes. Exact substitutions (apply to the outermost card container, section labels, and text colors; leave layout, refs — including `useDragScroll` — and handlers untouched):

| Old pattern (stone/emerald palette) | New |
|---|---|
| `bg-white … border-stone-200 … rounded-*xl shadow*` card containers | `WALL.card` |
| inset rows `bg-stone-50 … border-stone-100` | `WALL.cardInset` |
| section labels `text-stone-400 … uppercase tracking-*` | `WALL.label` |
| body text `text-stone-800 dark:text-stone-100` | `WALL.inkStrong` |
| secondary `text-stone-500 dark:text-stone-400` | `WALL.muted` |
| NOW container accent (`WallV2NowNext` outer card) | append `` `${WALL.nowAccent}` `` and use `WALL.card` base |

The `TINTS` icon-chip classes stay as they are (the pastel chips already read well on cream and have dark twins).

- [ ] **Step 2: Run the affected tests**

Run: `npx vitest run src/components/wall-v2/WallV2EventCard.test.tsx src/components/wall-v2/WallV2ScheduleBand.test.tsx src/components/wall-v2/WallV2NowNext.test.tsx`
Expected: PASS. If a test asserts on a replaced class string, update the assertion to the new token value — behavior assertions must not change.

- [ ] **Step 3: Commit**

```bash
git add src/components/wall-v2/WallV2Timeline.tsx src/components/wall-v2/WallV2EventCard.tsx src/components/wall-v2/WallV2ScheduleBand.tsx src/components/wall-v2/WallV2NowNext.tsx
git commit -m "style(wall): timeline, schedule band, event cards, NOW card on warm tokens"
```

---

### Task 11: Overlay token pass (guest screen + action sheet + phone)

**Files:**
- Modify: `src/components/wall-v2/WallV2GuestScreen.tsx`, `src/components/wall-v2/WallV2ItemActionSheet.tsx`, `src/components/wall-v2/WallV2PhoneScreen.tsx`
- Test: their existing test files must keep passing.

**Interfaces:** No prop changes. Presentation-only, same substitution table as Task 10. Guest screen additionally: its full-screen background becomes `WALL.root`, its clock/date use `font-display` (serif), and its weather line uses `WALL.muted`. Do NOT touch `WallRecipeViewer`, `WallDiscussionOverlay`, `CallerIdTakeover` (shared with old wall surfaces; out of scope).

- [ ] **Step 1: Apply the token map** (as Task 10 Step 1, three files)

- [ ] **Step 2: Run the affected tests**

Run: `npx vitest run src/components/wall-v2/WallV2GuestScreen.test.tsx src/components/wall-v2/WallV2ItemActionSheet.test.tsx src/components/wall-v2/WallV2PhoneScreen.test.tsx`
Expected: PASS (update class-string assertions only, never behavior).

- [ ] **Step 3: Commit**

```bash
git add src/components/wall-v2/WallV2GuestScreen.tsx src/components/wall-v2/WallV2ItemActionSheet.tsx src/components/wall-v2/WallV2PhoneScreen.tsx
git commit -m "style(wall): guest screen, action sheet, phone screen on warm tokens"
```

---

### Task 12: Full verification + live check + ship

**Files:** none (verification only; small fixes as fallout).

- [ ] **Step 1: Full gates**

```bash
npm run build          # must succeed — Vercel parity (pre-push tsc is NOT enough)
npm run lint           # CI runs lint; pre-push doesn't
npx vitest run         # entire unit suite
```

Expected: all green. Fix fallout, amend/commit as needed.

- [ ] **Step 2: Live check at wall size**

Start `npm run dev` in the worktree (worktree already has `.env`; a blank screen means the `.env` copy is missing). Open a 1024×768 browser window (or use browser automation with `resize_window` to exactly 1024×768) on `/wall-v2` and verify, in BOTH themes:
- rail (date, clock, weather, quote), treeline visible top-right
- NOW card pinned; timeline drag-scrolls; Anytime section present when a timeless routine exists
- Keep Moving rows toggle + open the action sheet
- dinner card (or empty state), tomorrow morning, at a glance, question
- family strip monogram fallbacks; dock cluster opens QuickCapture / discuss / phone / utility sheet; utility sheet's four actions work
- no horizontal overflow, nothing unreachable below the fold

- [ ] **Step 3: Ship**

```bash
git fetch origin && git rebase origin/main
git push origin HEAD:main   # pre-push hook runs tsc + unit tests
```

Then verify deploy picked up (`gh api repos/{owner}/{repo}/deployments --jq '.[0].sha'` vs `git rev-parse HEAD`) — pushes have silently missed the deploy webhook before. The Pi self-updates within ~3 minutes (`useBuildAutoReload`); confirm with an SSH screenshot:

```bash
ssh pi@symphony-wall.local 'XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 grim /tmp/wall.png' && scp pi@symphony-wall.local:/tmp/wall.png /tmp/wall-after.png
```

Inspect the screenshot: new warm layout, correct data, no blank white (stale tab) state.

- [ ] **Step 4: Post-ship cleanup**

Portrait assets are NOT part of this plan (Scott generates them per spec §7 recipe; strip falls back to monograms until then). Remove the worktree after merge confirmation: `git worktree remove .worktrees/wall-redesign` (from the main worktree, only after push verified).

---

## Self-Review Notes

- **Spec coverage:** §4 tokens → Task 1; §5 rail/NOW/timeline/KeepMoving/right-column/strip/dock/utilities → Tasks 3–9; §5 removals → Task 9; overlays → Tasks 10–11; §7 assets → Tasks 3 & 7 (portraits deferred to Scott by design); §8 testing → per-task + Task 12; §9 rollout → Task 12. Phase 2 (§10) intentionally has no tasks.
- **Known judgment calls for the implementer:** `findDinnerEvent`'s return field for start time (Task 9 note); mock-file fallout from type deletions (Task 9 Step 3 lists exactly which types stay vs go).
- **Type consistency:** `WallDockActionId` defined once (Task 7), consumed in Task 9. `GlanceRollupRow` defined once (Task 2), consumed in Tasks 6/9. `WALL` tokens defined once (Task 1), consumed everywhere.
