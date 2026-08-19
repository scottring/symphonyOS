// src/components/wall-v2/wallLanes.ts
//
// Pure reducer behind the wall's person lanes: for each family member, resolve
// the whole week down to ONE line — a time and a short label.
//
// The one-line constraint isn't a rendering detail, it's the design. A
// split-flap board only works on a short fixed token; a wrapping task title
// kills it. Forcing each person to a single line is what makes the wall
// answerable in the two seconds someone spends walking through the kitchen.
//
// Two rules earn their keep here:
//
//  1. A lane NEVER goes empty while the week holds anything. Three of four
//     lanes reading "—" on a quiet Saturday reads as broken, not calm, so a
//     lane falls forward through the 7 days useWallData already fetches. A
//     departure board shows tomorrow's trains too. (No extra fetching: the
//     days array is already in hand — the wall's egress history says don't
//     add a query for this.)
//
//  2. Everyday routines never headline a person. Same policy
//     `adaptGlanceForMember` enforces: "brush teeth" is the day's background
//     rhythm, not a commitment worth the wall's largest type.

import type { WallDayData } from '@/hooks/useWallData';
import type { TimelineItem } from '@/types/timeline';
import type { FamilyMember } from '@/types/family';
import { isEverydayRoutine } from '@/lib/routineUtils';
import { PREVIEW_SECTIONS } from '@/components/wall/today/tomorrowPreview';

export interface WallLane {
  memberId: string;
  name: string;
  /** Clock time, split from its meridiem so the flap board can animate digits only. */
  time: string | null;
  meridiem: string | null;
  /** Short label — "Fri" — when the item isn't today; null when it is. */
  dayLabel: string | null;
  label: string | null;
  isToday: boolean;
  allDay: boolean;
  isEmpty: boolean;
  /** Identity of the underlying item, so the flap board only flips on real change. */
  itemId: string | null;
  type: TimelineItem['type'] | null;
}

/** How many lanes must agree before the wall stops repeating itself. */
const ALIGN_THRESHOLD = 3;

function splitTime(d: Date): { time: string; meridiem: string } {
  // en-US always appends the meridiem to an hour/minute format; the flap board
  // animates digits only, so strip it and return it separately rather than
  // letting "PM" ride along inside the flipping field.
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(/\s*[AP]M$/i, '');
  const meridiem = d.getHours() >= 12 ? 'PM' : 'AM';
  return { time, meridiem };
}

/**
 * The member's next item on one day. `cutoff` is null for future days —
 * "already started" only makes sense against today's clock.
 */
function nextItemOnDay(
  day: WallDayData,
  memberId: string,
  cutoff: Date | null,
): TimelineItem | null {
  let best: TimelineItem | null = null;
  let bestIsTimed = false;

  for (const section of PREVIEW_SECTIONS) {
    for (const item of day.items[section] ?? []) {
      if (item.assignedTo !== memberId) continue;
      if (item.completed) continue;
      if (item.type === 'routine' && isEverydayRoutine(item.recurrencePattern)) continue;
      if (cutoff && item.startTime && item.startTime < cutoff) continue;

      const isTimed = Boolean(item.startTime);
      if (!best) { best = item; bestIsTimed = isTimed; continue; }
      // A timed item outranks an all-day one; among timed items, earliest wins.
      // All-day items only hold the slot when nothing timed is left.
      if (isTimed && !bestIsTimed) { best = item; bestIsTimed = true; continue; }
      if (isTimed && bestIsTimed && item.startTime! < best.startTime!) { best = item; }
    }
  }
  return best;
}

/**
 * One member → one lane. Never returns null: when the whole week is empty the
 * lane comes back flagged `isEmpty` so the component can render a resting
 * state rather than the caller having to handle a hole in the grid.
 */
export function adaptPersonLane(
  member: FamilyMember,
  days: WallDayData[],
  now: Date,
): WallLane {
  const base: WallLane = {
    memberId: member.id, name: member.name,
    time: null, meridiem: null, dayLabel: null, label: null,
    isToday: false, allDay: false, isEmpty: true, itemId: null, type: null,
  };

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const isToday = i === 0;
    const found = nextItemOnDay(day, member.id, isToday ? now : null);
    if (!found) continue;

    const timed = found.startTime ? splitTime(found.startTime) : null;
    return {
      ...base,
      time: timed?.time ?? null,
      meridiem: timed?.meridiem ?? null,
      // Today needs no qualifier — the wall's rail already says what day it is.
      dayLabel: isToday
        ? null
        : day.date.toLocaleDateString('en-US', { weekday: 'short' }),
      label: found.title,
      isToday,
      allDay: Boolean(found.allDay) || !found.startTime,
      isEmpty: false,
      itemId: found.id,
      type: found.type,
    };
  }

  return base;
}

export function adaptLanes(
  members: FamilyMember[],
  days: WallDayData[],
  now: Date,
): WallLane[] {
  return members.map((m) => adaptPersonLane(m, days, now));
}

export interface WallLaneAlignment {
  aligned: boolean;
  label: string | null;
  time: string | null;
  meridiem: string | null;
  memberIds: string[];
}

/**
 * When most of the household resolves to the same commitment, the wall should
 * say it once across the full width instead of printing it in four lanes.
 *
 * The animation people picture here is a slot machine, but the value is the
 * merge: four copies of "Dinner at Grandma's" is wasted wall. Matching is by
 * title+time rather than item id, because a shared commitment is usually four
 * separate rows (one per assignee), not one row with four owners.
 */
export function mergeAlignedLanes(lanes: WallLane[]): WallLaneAlignment {
  const none: WallLaneAlignment = {
    aligned: false, label: null, time: null, meridiem: null, memberIds: [],
  };

  const groups = new Map<string, WallLane[]>();
  for (const lane of lanes) {
    if (lane.isEmpty || !lane.label) continue; // four blanks are not an event
    const key = `${lane.label}@@${lane.time ?? 'allday'}@@${lane.dayLabel ?? 'today'}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(lane); else groups.set(key, [lane]);
  }

  for (const bucket of groups.values()) {
    if (bucket.length < ALIGN_THRESHOLD) continue;
    return {
      aligned: true,
      label: bucket[0].label,
      time: bucket[0].time,
      meridiem: bucket[0].meridiem,
      memberIds: bucket.map((l) => l.memberId),
    };
  }
  return none;
}
