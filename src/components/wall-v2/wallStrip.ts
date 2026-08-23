// src/components/wall-v2/wallStrip.ts
//
// Pure adapters for the bottom strip — meals, what's due today, and the
// look-ahead. The strip is the mockup's four bottom cards, resolved against
// what the kiosk can actually show: 1024x768, viewed from eight feet, and no
// way to scroll. That budget is the design constraint, so each adapter caps
// its own output rather than handing the component an unbounded list and
// hoping `overflow-hidden` catches it. A row the wall silently clips is worse
// than a row it never promised.

import type { MealDayRecipe } from '@/lib/mealDayRecipes';
import type { WallDayData } from '@/hooks/useWallData';
import type { TimelineItem } from '@/types/timeline';
import type { FamilyMember } from '@/types/family';

/** Rows a 200px-tall card can show at eight feet without shrinking type. */
export const STRIP_ROWS = 5;

export interface MealRow {
  dateKey: string;
  /** "Today" / "Tue" — never a bare date; the wall already says what today is. */
  dayLabel: string;
  title: string | null;
  isToday: boolean;
  /** Nothing planned. The wall calls this out rather than printing a blank. */
  isGap: boolean;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * The week of dinners, starting today. A day with no plan is a GAP and says
 * so — that is the one genuinely useful thing this card does, and it is why
 * it leads with today rather than with Monday.
 */
export function adaptMealRows(days: MealDayRecipe[], todayKey: string): MealRow[] {
  return days
    .filter((d) => d.dateKey >= todayKey)
    .slice(0, STRIP_ROWS + 2)
    .map((d) => {
      const isToday = d.dateKey === todayKey;
      const title = d.title?.trim() ? d.title.trim() : null;
      return {
        dateKey: d.dateKey,
        dayLabel: isToday ? 'Today' : DAY_NAMES[d.date.getDay()],
        title,
        isToday,
        isGap: !title,
      };
    });
}

export interface DueRow {
  id: string;
  title: string;
  /** Display name of whoever owns it, or null when it belongs to the house. */
  who: string | null;
  completed: boolean;
}

/**
 * Today's unfinished tasks. Routines and events are deliberately excluded —
 * they already have a lane, and repeating them here is what made the old
 * board of cards feel busy.
 */
export function adaptDueRows(
  today: WallDayData | undefined,
  members: FamilyMember[],
  limit = STRIP_ROWS,
): DueRow[] {
  if (!today) return [];
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const all: TimelineItem[] = Object.values(today.items).flat();

  return all
    .filter((it) => it.type === 'task' && !it.completed)
    .slice(0, limit)
    .map((it) => ({
      id: it.id,
      title: it.title,
      who: it.assignedTo ? nameOf.get(it.assignedTo) ?? null : null,
      completed: false,
    }));
}

export interface ComingUpRow {
  dateKey: string;
  dayLabel: string;
  /** One line summarising the day — the two or three things that define it. */
  summary: string;
}

/**
 * The next few days, one line each. Not a second timeline: a day gets the
 * headline items joined by a separator, so the card answers "is this week
 * heavy?" at a glance and nothing more.
 */
export function adaptComingUpRows(
  days: WallDayData[],
  limit = STRIP_ROWS,
  perDay = 2,
): ComingUpRow[] {
  return days
    .filter((d) => !d.isToday)
    .slice(0, limit)
    .map((d) => {
      const items = Object.values(d.items).flat();
      const headline = items
        .filter((it) => !it.completed && it.type !== 'routine')
        .slice(0, perDay)
        .map((it) => it.title.trim())
        .filter(Boolean);
      return {
        dateKey: `${d.date.getFullYear()}-${d.date.getMonth() + 1}-${d.date.getDate()}`,
        dayLabel: DAY_NAMES[d.date.getDay()],
        summary: headline.join(' · '),
      };
    })
    .filter((r) => r.summary.length > 0);
}
