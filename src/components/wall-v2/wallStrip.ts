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
import { withoutKindPrefix } from './wallEventAttribution';

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

/** Days below which "shows up on most of them" is not a signal, just a run. */
const BACKGROUND_MIN_DAYS = 3;

/**
 * Joins two items on one day.
 *
 * A middot cannot be used: family calendar titles already contain one
 * ("Specials — Ella: Music · Kaleb: Library"), so joining with the same glyph
 * made an item boundary indistinguishable from punctuation inside a title —
 * the line read as one long run-on. The bullet is a rank above the middot
 * both semantically and visually, which is exactly the relationship.
 */
const JOIN = ' • ';

/** The day's candidate lines, deduped, in section order. */
function titlesOf(day: WallDayData, members: FamilyMember[]): string[] {
  const seen = new Set<string>();
  for (const it of Object.values(day.items).flat()) {
    if (it.completed || it.type === 'routine') continue;
    const title = withoutKindPrefix(it.title.trim(), members);
    if (title) seen.add(title);
  }
  return [...seen];
}

/**
 * The next few days, one line each. Not a second timeline: a day gets the
 * headline items joined by a separator, so the card answers "is this week
 * heavy?" at a glance and nothing more.
 *
 * Which is why the week's BACKGROUND is dropped. "School — Ella & Kaleb" ran
 * on every weekday, so it took a slot in three of five rows and said nothing
 * about what made any of them different — it crowded out the things that did.
 * A title on more than half the summarised days is scenery, not news.
 *
 * A day whose only content IS the scenery keeps it rather than vanishing from
 * the card: an absent Thursday reads as broken, where a repeated line only
 * reads as a quiet day.
 */
export function adaptComingUpRows(
  days: WallDayData[],
  members: FamilyMember[] = [],
  limit = STRIP_ROWS,
  perDay = 2,
): ComingUpRow[] {
  const upcoming = days.filter((d) => !d.isToday).slice(0, limit);
  const perDayTitles = upcoming.map((d) => titlesOf(d, members));

  const runs = new Map<string, number>();
  for (const titles of perDayTitles) {
    for (const title of titles) runs.set(title, (runs.get(title) ?? 0) + 1);
  }
  const isBackground = (title: string) =>
    upcoming.length >= BACKGROUND_MIN_DAYS && (runs.get(title) ?? 0) * 2 > upcoming.length;

  return upcoming
    .map((d, i) => {
      const titles = perDayTitles[i];
      const news = titles.filter((t) => !isBackground(t));
      const headline = (news.length ? news : titles).slice(0, perDay);
      return {
        dateKey: `${d.date.getFullYear()}-${d.date.getMonth() + 1}-${d.date.getDate()}`,
        dayLabel: DAY_NAMES[d.date.getDay()],
        summary: headline.join(JOIN),
      };
    })
    .filter((r) => r.summary.length > 0);
}
