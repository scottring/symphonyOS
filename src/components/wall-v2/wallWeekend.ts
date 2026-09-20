// src/components/wall-v2/wallWeekend.ts
//
// The weekend board: three DAY columns instead of one day's time axis.
//
// This is the screen version of a page Scott actually writes — three ruled
// columns headed SAT / SUN / MON, a handful of things under each, and the
// loose "maybe" items parked at the foot. It replaces the Gantt on Saturday
// and Sunday, because on a weekend morning the weekend IS the day's context.
//
// Two rules carry it, and they are both borrowed from what the day board
// learned the hard way:
//
//  1. NO TIME AXIS. Three continuous 14-hour tracks inside ~440px of board
//     height is ~31px an hour — every label clips, exactly the failure that
//     MIN_LABEL_PX exists to prevent on one track, now tripled. The time is
//     WRITTEN on the row ("10:00a Baseball"), which is one glance instead of
//     three, and is what the person lanes already proved at eight feet.
//
//  2. A DAY COLUMN IS NOT A PERSON ROW. The Gantt draws a bar per owner, so a
//     family dinner appears on four rows; that is right for rows and wrong
//     for a column, where it would simply repeat. Each item appears ONCE, and
//     whose it is rides on a colour stripe and a small name.
//
// What qualifies is unchanged from the day board — `routineEarnsTheWall`, so
// daily rhythm stays off and one-offs, appointments and rare routines draw.
// Zero new queries: `useWallData` already returns seven days.

import type { WallDayData } from '@/hooks/useWallData';
import type { TimelineItem } from '@/types/timeline';
import type { FamilyMember } from '@/types/family';
import type { Task } from '@/types/task';
import type { DaySection } from '@/lib/timeUtils';
import { routineEarnsTheWall } from '@/lib/routineUtils';
import { PREVIEW_SECTIONS } from '@/components/wall/today/tomorrowPreview';
import { HOUSEHOLD_ID } from './wallEventAttribution';
import { boardOwnersOf } from './wallGantt';

/** Day columns drawn: today plus the next two. Saturday gives SAT/SUN/MON. */
export const WEEKEND_COLUMNS = 3;

/**
 * Rows a column can hold before it counts the rest.
 *
 * MEASURED at 1024x768, not reasoned about — the first estimate said six and
 * the screenshot showed five, with the sixth row AND the "+2 more" line both
 * clipped away by the column's overflow rule. On a kiosk that is unreachable
 * content, not a scroll, so the count has to be honest.
 *
 * The budget: 768px less the 92px header, the 188px strip and 36px of gaps
 * and padding leaves ~440px of board. A column spends ~44px on its heading
 * (more when it carries an all-day special) and ~64px on the anytime band,
 * leaving ~308px. A row is ~42px, or ~58px with a sub-note, plus a 6px gap.
 * Five fits both shapes; six fits only the short one.
 *
 * The painter also keeps the overflow line OUTSIDE the clipped area, so if
 * this number is ever wrong again the board says "+N more" rather than
 * quietly shortening the day.
 */
export const COLUMN_ITEM_CAP = 5;

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Sections the board reads — the day's own order, plus untimed work. */
const BOARD_SECTIONS: DaySection[] = [...PREVIEW_SECTIONS, 'unscheduled'];

/** Default duration for an item with a start but no end (tasks have no end). */
const DEFAULT_DURATION_MIN = 60;

/** One commitment, as a column draws it. */
export interface WeekendItem {
  id: string;
  /** "10:00a" — written, because there is no axis to read it off. */
  time: string;
  title: string;
  /** The second line: location, prep, whatever the item carries. */
  note: string | null;
  /** Who owns it, or null when it belongs to the household. */
  ownerName: string | null;
  memberId: string;
  /** Index into PERSON_ACCENTS; -1 for the household's neutral stripe. */
  accentIndex: number;
  /** Already finished. Only ever true in today's column. */
  past: boolean;
  type: TimelineItem['type'];
}

/** A line at the foot of a column: no clock time, still this day's business. */
export interface WeekendAnytimeItem {
  id: string;
  title: string;
  kind: 'routine' | 'task' | 'homework';
}

export interface WeekendColumn {
  dateKey: string;
  /** "SAT" */
  dayLabel: string;
  /** "19 Sep" */
  dateLabel: string;
  isToday: boolean;
  /** All-day events — what the day IS, drawn under the heading. */
  specials: string[];
  items: WeekendItem[];
  /** Commitments past the cap, counted rather than clipped. */
  overflowCount: number;
  anytime: WeekendAnytimeItem[];
}

export interface WeekendBoard {
  columns: WeekendColumn[];
}

/**
 * Whether the wall shows the weekend board instead of the day board.
 *
 * Saturday and Sunday only. Scott's page is written on Saturday morning and
 * is spent by Monday; a weekend board on Wednesday would be a calendar.
 */
export function isWeekendBoardDay(now: Date): boolean {
  const d = now.getDay();
  return d === 0 || d === 6;
}

function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date): boolean {
  return dateKeyOf(a) === dateKeyOf(b);
}

/**
 * "10:00a" / "2:00p".
 *
 * The suffix is one character and it is not decoration: a column holding only
 * an evening commitment gives the reader no ordering to infer from, and "7:00"
 * alone is breakfast or dinner with equal probability. The wall's axis ticks
 * already say `9a` / `2p`, so this is the surface's own idiom.
 */
export function writtenTime(d: Date): string {
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}${h24 < 12 ? 'a' : 'p'}`;
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** True when an item cannot carry a time: untimed, or all-day. */
function isAnytimeItem(it: TimelineItem): boolean {
  return !it.startTime || !!it.allDay;
}

/**
 * Every item on a day that earns the wall, ONCE.
 *
 * The day board's `itemsFor` filters by member and is called once per row,
 * which is how a shared commitment lands on four rows. A column wants the
 * same qualifying rules with no member filter and no repetition.
 */
function qualifyingItems(day: WallDayData): TimelineItem[] {
  const out: TimelineItem[] = [];
  const seen = new Set<string>();
  for (const section of BOARD_SECTIONS) {
    for (const item of day.items[section] ?? []) {
      if (seen.has(item.id)) continue;
      // A collection step never draws on its own — the wall has no renderer
      // to hand it to. Dropped here, exactly as the day board drops it.
      if (item.type === 'routine' && item.originalRoutine?.parent_routine_id != null) continue;
      // A routine that runs most days is the week's shape, not news.
      if (item.type === 'routine' && !routineEarnsTheWall(item.recurrencePattern)) continue;
      // Done means gone — for a commitment. An all-day rotation or a free
      // stay is information, and it reads the same after someone ticks it.
      if (item.completed && !item.allDay && !item.isFree) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

function ownerOf(
  item: TimelineItem,
  members: FamilyMember[],
): { name: string | null; memberId: string; accentIndex: number } {
  const owners = boardOwnersOf(item, members);
  // More than one owner is the household's business, not a name to read: a
  // column has one stripe per row, and picking the first of three would be
  // arbitrary. The day board can say it on three rows; a column cannot.
  const single = owners.length === 1 ? owners[0] : HOUSEHOLD_ID;
  const idx = members.findIndex((m) => m.id === single);
  if (idx === -1) return { name: null, memberId: HOUSEHOLD_ID, accentIndex: -1 };
  return { name: members[idx].name, memberId: members[idx].id, accentIndex: idx };
}

function noteOf(item: TimelineItem): string | null {
  const raw = item.subtitle ?? item.location ?? null;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The board.
 *
 * `days` is `useWallData`'s seven-day array, today first. Anything shorter
 * (the array is empty until the first fetch resolves) yields fewer columns
 * rather than blank ones — an empty column claims the day has nothing in it,
 * which is a different and worse statement than "not loaded yet".
 */
export function adaptWeekendBoard(
  members: FamilyMember[],
  days: WallDayData[],
  now: Date,
  homework: Task[] = [],
): WeekendBoard {
  const window = days.slice(0, WEEKEND_COLUMNS);

  const columns = window.map((day, dayIdx): WeekendColumn => {
    const qualifying = qualifyingItems(day);

    const specials: string[] = [];
    const anytime: WeekendAnytimeItem[] = [];
    const timed: { item: TimelineItem; start: Date }[] = [];

    for (const it of qualifying) {
      if (isAnytimeItem(it)) {
        if (it.allDay) {
          // An all-day event says what the day IS — Labor Day, Picture Day.
          // Filing it under "anytime" would read as something to get to.
          specials.push(it.title);
        } else if (it.type === 'routine') {
          anytime.push({ id: it.id, title: it.title, kind: 'routine' });
        } else {
          // An untimed TASK. The day board sends these to the strip's "Due
          // today" card — but the strip only ever covers today, so on a
          // weekend board Sunday's untimed work would simply vanish. The
          // foot of its own column is where the paper page parks it.
          anytime.push({ id: it.id, title: it.title, kind: 'task' });
        }
        continue;
      }
      timed.push({ item: it, start: it.startTime! });
    }

    // Homework has no time and no day — it has a due date, and it nags until
    // it is done. It lands in the column of the day it is needed.
    for (const t of homework) {
      if (t.completed || !t.neededOn) continue;
      if (!sameDay(t.neededOn, day.date)) continue;
      anytime.push({ id: t.id, title: t.title, kind: 'homework' });
    }

    timed.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Only today has a past. A 23:00 glance at Saturday must not grey out the
    // whole of Sunday morning.
    const nowMin = day.isToday ? minutesOfDay(now) : -1;

    const drawn = timed.slice(0, COLUMN_ITEM_CAP).map(({ item: it, start }): WeekendItem => {
      const { name, memberId, accentIndex } = ownerOf(it, members);
      const endMin = it.endTime
        ? minutesOfDay(it.endTime)
        : minutesOfDay(start) + DEFAULT_DURATION_MIN;
      return {
        id: it.id,
        time: writtenTime(start),
        title: it.title,
        note: noteOf(it),
        ownerName: name,
        memberId,
        accentIndex,
        past: day.isToday && nowMin > endMin,
        type: it.type,
      };
    });

    return {
      dateKey: dateKeyOf(day.date),
      dayLabel: WEEKDAY[day.date.getDay()],
      dateLabel: `${day.date.getDate()} ${MONTH[day.date.getMonth()]}`,
      // `isToday` is the hook's own flag rather than a clock comparison here,
      // so a board rendered across midnight agrees with every other surface.
      isToday: day.isToday === true && dayIdx === 0,
      specials,
      items: drawn,
      overflowCount: Math.max(0, timed.length - COLUMN_ITEM_CAP),
      anytime,
    };
  });

  return { columns };
}

