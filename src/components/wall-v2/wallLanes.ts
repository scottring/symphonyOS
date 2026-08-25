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
import { attributeEvent, householdMember } from './wallEventAttribution';

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
  /** The one after next, rendered small and dim. Null when there isn't one. */
  then: { time: string | null; meridiem: string | null; dayLabel: string | null; label: string } | null;
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
/**
 * Who an item belongs to.
 *
 * Events go through attribution (calendar ownership, then a name in the title)
 * because nothing upstream assigns them.
 *
 * Tasks and routines are honoured ONLY when they carry an assignee. An
 * unassigned one used to fall to the household lane so that nothing was lost
 * when Keep Moving went — but that put "clean the mould out of the washing
 * machine" in the wall's largest type, speaking for the whole family. The
 * household lane is for shared COMMITMENTS ("Dinner at Grandma's", "Trash
 * day"), not for the chore backlog. Open tasks are still represented: the
 * at-a-glance card counts them ("N tasks open — M due today"), which is the
 * right altitude for a chore.
 */
export function ownersOf(item: TimelineItem, members: FamilyMember[]): string[] {
  if (item.type === 'event') {
    return attributeEvent(
      {
        title: item.title,
        calendar_id: item.originalEvent?.calendar_id,
        calendarId: item.originalEvent?.calendarId,
      },
      members,
      item.assignedTo,
    );
  }
  return item.assignedTo ? [item.assignedTo] : [];
}

/**
 * Every item on the day that belongs to this member, in the order the lane
 * should present them: timed items first by clock, all-day items after.
 *
 * (This used to return only the single best match. The lane now shows a second,
 * dimmer item — with one commitment per person the wall read as sparse — and
 * the ordering rule is the same either way, so it returns the whole ordered
 * list and lets the caller take what it needs.)
 */
function itemsOnDay(
  day: WallDayData,
  memberId: string,
  cutoff: Date | null,
  members: FamilyMember[],
): TimelineItem[] {
  const found: TimelineItem[] = [];
  for (const section of PREVIEW_SECTIONS) {
    for (const item of day.items[section] ?? []) {
      if (!ownersOf(item, members).includes(memberId)) continue;
      if (item.completed) continue;
      if (item.type === 'routine' && isEverydayRoutine(item.recurrencePattern)) continue;
      if (cutoff && item.startTime && item.startTime < cutoff) continue;
      found.push(item);
    }
  }
  // A timed item outranks an all-day one; among timed items, earliest wins.
  // All-day items only hold a slot when nothing timed is left.
  return found.sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.getTime() - b.startTime.getTime();
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return 0;
  });
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
  members: FamilyMember[] = [member],
): WallLane {
  const base: WallLane = {
    memberId: member.id, name: member.name,
    time: null, meridiem: null, dayLabel: null, label: null,
    isToday: false, allDay: false, isEmpty: true, itemId: null, type: null,
    then: null,
  };

  // Walk forward through the week collecting the first two matches. Two is
  // deliberate: it fills the lane's otherwise-dead right-hand space without
  // turning a lane back into the list the lanes replaced.
  const hits: { item: TimelineItem; isToday: boolean; date: Date }[] = [];
  for (let i = 0; i < days.length && hits.length < 2; i++) {
    const day = days[i];
    const isToday = i === 0;
    for (const item of itemsOnDay(day, member.id, isToday ? now : null, members)) {
      hits.push({ item, isToday, date: day.date });
      if (hits.length === 2) break;
    }
  }

  if (hits.length === 0) return base;

  const dayLabelFor = (h: { isToday: boolean; date: Date }) =>
    // Today needs no qualifier — the wall's rail already says what day it is.
    h.isToday ? null : h.date.toLocaleDateString('en-US', { weekday: 'short' });

  const [first, second] = hits;
  const timed = first.item.startTime ? splitTime(first.item.startTime) : null;
  const secondTimed = second?.item.startTime ? splitTime(second.item.startTime) : null;

  return {
    ...base,
    time: timed?.time ?? null,
    meridiem: timed?.meridiem ?? null,
    dayLabel: dayLabelFor(first),
    label: first.item.title,
    isToday: first.isToday,
    allDay: Boolean(first.item.allDay) || !first.item.startTime,
    isEmpty: false,
    itemId: first.item.id,
    type: first.item.type,
    then: second
      ? {
          time: secondTimed?.time ?? null,
          meridiem: secondTimed?.meridiem ?? null,
          dayLabel: dayLabelFor(second),
          label: second.item.title,
        }
      : null,
  };
}

export function adaptLanes(
  members: FamilyMember[],
  days: WallDayData[],
  now: Date,
): WallLane[] {
  // The household lane rides last: shared commitments that belong to nobody in
  // particular ("Dinner at Grandma's", "Trash day") would otherwise have no
  // home on a person-shaped wall and would simply vanish.
  return [...members, householdMember()].map((m) => adaptPersonLane(m, days, now, members));
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
