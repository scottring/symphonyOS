// src/components/wall-v2/wallGantt.ts
//
// Geometry for the timeline board: person rows against a shared time axis.
//
// A Gantt on a kitchen wall lives or dies on ONE number — pixels per hour. The
// proposed mockup drew 7a–9p, fourteen hours across ~810px of track: 58px an
// hour, so a one-hour block holds about five characters and every label
// truncates ("Food shop…", "Dinner clea…"). At eight feet a clipped label is
// noise, not information.
//
// Two rules fix that, and they are the whole design:
//
//  1. THE WINDOW ROLLS. The board shows a span around now, not the calendar
//     day. Eight hours instead of fourteen is ~101px an hour — nearly double
//     the room per block — and a wall that advances through the day is more
//     useful than one that keeps rendering breakfast at 4pm. Anything past the
//     right edge is counted, never silently dropped.
//
//  2. A NARROW BLOCK PUTS ITS LABEL OUTSIDE. A 30-minute block is ~50px; no
//     type size makes a word fit there. Rather than clip, the label sits to the
//     right of the bar and the bar keeps its true width, so duration stays
//     honest and the words stay readable.

import type { WallDayData } from '@/hooks/useWallData';
import type { TimelineItem } from '@/types/timeline';
import type { FamilyMember } from '@/types/family';
import { isEverydayRoutine } from '@/lib/routineUtils';
import { PREVIEW_SECTIONS } from '@/components/wall/today/tomorrowPreview';
import type { DaySection } from '@/lib/timeUtils';
import { HOUSEHOLD_ID, householdMember, titleForMember } from './wallEventAttribution';
import { ownersOf } from './wallLanes';

/** Hours of track. Below this a quiet day stretches two items across the wall. */
export const MIN_SPAN_H = 6;
/**
 * Hard cap on the window.
 *
 * This was 8, on the reasoning that a wider window makes blocks too narrow to
 * label. Watching the real wall at 7:57am killed that: the window ran 6a-2p,
 * and Scott's whole evening sat past the right edge as "+2 later" while his
 * row read "Nothing scheduled". Hiding half the day is a worse failure than a
 * narrow bar, and it is no longer the trade it was — a bar too narrow for its
 * label now hands the label to the clear track beside it (see MIN_LABEL_PX),
 * so width costs legibility far more slowly than it used to.
 *
 * 14 hours is a waking day. The window still only opens as far as the day's
 * last item needs, so a genuinely short day still draws a tight board.
 */
export const MAX_SPAN_H = 14;
/** Track width in px at 1024 wide, used to decide if a label fits inside. */
export const TRACK_PX = 780;
/**
 * A bar narrower than this cannot hold readable type at eight feet.
 *
 * Measured, not guessed: labels render at 1.05rem (~17px) with 24px of
 * horizontal padding, so a 101px bar — a one-hour block on an eight-hour
 * window — leaves ~77px, about six characters. "Food shopping" became
 * "GANTT Foo". 170px is roughly twelve characters, which is a real label.
 */
export const MIN_LABEL_PX = 170;
/**
 * How far ahead a household rhythm earns a tag.
 *
 * "Routines look forward" used to mean "anything left today", and at 7:53am
 * that put the entire evening on the Everyone row — Feed Jax dinner, Walk Jax,
 * Feed and water the dog, Clean kitchen after dinner, Put clothes in hamper,
 * Get into bed for reading, all six scheduled 18:00-19:06, eleven hours early.
 * None of it was actionable at breakfast and all of it crowded out the morning.
 *
 * The board's TRACK already rolls with now; its tag line did not. Three hours
 * is roughly meal to meal: the dinner block appears mid-afternoon, in time to
 * be useful, and the row stays quiet the rest of the day.
 *
 * Nothing is counted at the edge here, deliberately. `laterCount` exists for
 * commitments that fall off the right of the axis; a rhythm is background, and
 * "+6 later" on a row of chores is a scoreboard, not information.
 */
export const RHYTHM_HORIZON_MIN = 180;
/**
 * The sections the board reads.
 *
 * PREVIEW_SECTIONS deliberately omits 'unscheduled', because an untimed item
 * can't be "the next thing" in a preview. The board is not a preview — its
 * untimed line is exactly where a task with no clock time belongs, and leaving
 * the section out is part of why rows read empty on a day with real work in
 * them.
 */
const BOARD_SECTIONS: DaySection[] = [...PREVIEW_SECTIONS, 'unscheduled'];

/** Default duration for an item with a start but no end. */
const DEFAULT_DURATION_MIN = 60;

/**
 * True when an item cannot be drawn as a bar and belongs on the untimed line.
 *
 * Everyday routines are here rather than filtered out entirely: they ARE the
 * shape of a weekday, and dropping them is what left 7a-9p looking bare. They
 * just can't be bars — see GanttTrack.anytime.
 */
function isAnytimeItem(it: TimelineItem): boolean {
  if (!it.startTime || it.allDay) return true;
  return it.type === 'routine' && isEverydayRoutine(it.recurrencePattern);
}

export interface GanttBlock {
  id: string;
  title: string;
  /** Percent of the track, 0–100. */
  leftPct: number;
  widthPct: number;
  /**
   * Where the label goes. 'in' when the bar can hold it; otherwise the side
   * with enough clear track before the neighbouring bar. A label placed
   * outside is why the bar can keep its TRUE width — duration stays honest
   * and the words stay readable, instead of trading one for the other.
   */
  labelSide: 'in' | 'right' | 'left';
  /** Room available to an outside label, as a percent of the track. */
  labelRoomPct: number;
  /** Already finished — drawn dimmer, because it is context, not a commitment. */
  past: boolean;
  type: TimelineItem['type'];
}

export interface GanttTrack {
  memberId: string;
  name: string;
  blocks: GanttBlock[];
  /**
   * What the row carries that cannot honestly be a bar, in time order.
   *
   * Two kinds land here. Items with no clock time, which have no position on
   * an axis. And everyday routines, which have a nominal time but essentially
   * no duration — measured on the real wall, "Brush teeth" came out THREE
   * PIXELS wide and "Put dirty clothes in hamper" one, a row of confetti
   * stacked at the same x. A rhythm is not a duration, so it gets words.
   */
  anytime: string[];
  /** Items that start after the window closes — counted, not dropped. */
  laterCount: number;
}

export interface GanttAxis {
  /** Minutes since local midnight. */
  startMin: number;
  endMin: number;
  ticks: { min: number; label: string; leftPct: number }[];
  /** Position of the current moment, or null when now is off the board. */
  nowPct: number | null;
}

export interface GanttBoard {
  axis: GanttAxis;
  tracks: GanttTrack[];
}

/**
 * Find a block's title by id, across every track.
 *
 * Belt-and-braces for WallV2Shell's tap handler: the primary lookup
 * (adaptTimelineSections' output) should always carry the same id a board
 * bar draws with, but if that ever drifts out of sync again, this recovers a
 * human-readable label from the board data already on screen — so the tap
 * flashes the item's title instead of dead-ending silently.
 *
 * This already does real work today, not just defensively: adaptTimelineSections'
 * dedupeRoutines collapses two same-title routines (e.g. two kids' "Get
 * undressed") onto ONE id, but this board draws a bar per instance with no
 * such dedupe — so the second kid's bar has an id `adaptTimelineSections`
 * never carries, and this is what turns that tap into a title flash instead
 * of a dead end.
 */
export function titleForBlockId(board: GanttBoard, itemId: string): string | null {
  for (const track of board.tracks) {
    const block = track.blocks.find((b) => b.id === itemId);
    if (block) return block.title;
  }
  return null;
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function hourLabel(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${h24 < 12 ? 'a' : 'p'}`;
}

/**
 * The visible span. Anchored one hour before now so the thing just finished
 * stays on screen, then widened to cover what is still ahead — up to the point
 * where blocks stop being labellable.
 */
export function computeAxis(itemStarts: number[], itemEnds: number[], now: Date): GanttAxis {
  const nowMin = minutesOfDay(now);
  const startMin = Math.max(0, Math.floor((nowMin - 60) / 60) * 60);

  const lastEnd = itemEnds.length ? Math.max(...itemEnds) : startMin;
  const needed = Math.ceil((lastEnd - startMin) / 60);
  const spanH = Math.min(MAX_SPAN_H, Math.max(MIN_SPAN_H, needed));
  const endMin = Math.min(24 * 60, startMin + spanH * 60);

  const span = endMin - startMin;
  const ticks: GanttAxis['ticks'] = [];
  // Every second hour: an hourly ruler at this density is more ink than signal.
  const step = spanH > 6 ? 120 : 60;
  for (let m = startMin; m <= endMin; m += step) {
    ticks.push({ min: m, label: hourLabel(m), leftPct: ((m - startMin) / span) * 100 });
  }

  const nowPct = nowMin >= startMin && nowMin <= endMin
    ? ((nowMin - startMin) / span) * 100
    : null;

  // itemStarts is unused for sizing today but kept in the signature so a future
  // "tighten to content on a quiet day" rule has what it needs.
  void itemStarts;
  return { startMin, endMin, ticks, nowPct };
}

/**
 * Which row draws an item.
 *
 * The lanes' rule (`ownersOf`) drops an unassigned task or routine on the
 * floor, so that a chore can never headline a person in the wall's largest
 * type. A board row is not a headline — every bar is the same size — so the
 * rule that protects a lane just empties a board. Two differences here:
 *
 *  - An unassigned task or routine falls to the household row rather than
 *    vanishing. An EVENT that matched nobody does not: `attributeEvent`
 *    returns [] only for calendars deliberately kept off the wall (holidays,
 *    the meal calendar the dinner card already draws), and resurrecting those
 *    would undo a decision, not fix a gap.
 *
 *  - Everyday routines go to the household row instead of being dropped.
 *    "Brush teeth" under a kid's face is noise, but the day's background
 *    rhythm is exactly what stops 7a-9p reading as an empty track, and it
 *    belongs to the house rather than to any one face.
 */
export function boardOwnersOf(item: TimelineItem, members: FamilyMember[]): string[] {
  if (item.type === 'routine' && isEverydayRoutine(item.recurrencePattern)) {
    return [HOUSEHOLD_ID];
  }
  const owners = ownersOf(item, members);
  if (owners.length > 0) return owners;
  return item.type === 'event' ? [] : [HOUSEHOLD_ID];
}

function itemsFor(day: WallDayData, memberId: string, members: FamilyMember[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const section of BOARD_SECTIONS) {
    for (const item of day.items[section] ?? []) {
      // A collection step (e.g. one exercise in "Camp Mornings") never draws
      // its own bar or anytime chip. The wall has no collection renderer to
      // hand it to, so a step is DROPPED here, not relocated to its parent —
      // without this, a step whose own recurrence isn't "everyday" slips past
      // isAnytimeItem and draws as a real timed bar.
      if (item.type === 'routine' && item.originalRoutine?.parent_routine_id != null) continue;
      if (!boardOwnersOf(item, members).includes(memberId)) continue;
      if (item.completed) continue;
      out.push(item);
    }
  }
  return out;
}

/**
 * The board. Today only — a time axis across more than one day is a calendar,
 * and the wall already has one of those.
 */
export function adaptGanttBoard(
  members: FamilyMember[],
  days: WallDayData[],
  now: Date,
  trackPx: number = TRACK_PX,
): GanttBoard {
  const today = days[0];
  const roster = [...members, householdMember()];

  const starts: number[] = [];
  const ends: number[] = [];
  if (today) {
    for (const m of roster) {
      for (const it of itemsFor(today, m.id, members)) {
        if (isAnytimeItem(it)) continue;
        starts.push(minutesOfDay(it.startTime!));
        ends.push(
          it.endTime ? minutesOfDay(it.endTime) : minutesOfDay(it.startTime!) + DEFAULT_DURATION_MIN,
        );
      }
    }
  }

  const axis = computeAxis(starts, ends, now);
  const span = axis.endMin - axis.startMin;
  const nowMin = minutesOfDay(now);

  const tracks: GanttTrack[] = roster.map((m) => {
    const blocks: GanttBlock[] = [];
    /** Kept with its time so the line can read in the order the day happens. */
    const anytimeItems: { title: string; at: number }[] = [];
    let laterCount = 0;

    for (const it of today ? itemsFor(today, m.id, members) : []) {
      // One calendar row can carry the whole family's rotation — "Specials —
      // Ella: Visual Art · Kaleb: PE". Attribution rightly puts it in both
      // kids' tracks; rendering the same string in both is what made it
      // useless. Each track shows only the words addressed to that person.
      const title = titleForMember(it.title, m.name);
      if (isAnytimeItem(it)) {
        const at = it.startTime ? minutesOfDay(it.startTime) : Number.MAX_SAFE_INTEGER;
        // A rhythm that has already happened is not information. At 8am the
        // line read "Put dirty clothes in hamper · Straighten up room · Brush
        // teeth" — three 6am routines — and hid the entire evening behind
        // "+12". Routines look forward; a task keeps its place whether or not
        // its hour has passed, because an unfinished task still stands.
        // A rhythm that has already happened is not information, and one
        // eleven hours out is not information YET. At 8am the line read "Put
        // dirty clothes in hamper · Straighten up room · Brush teeth" — three
        // 6am routines — and at 7:53am it read the whole 6-7pm chore block.
        // A tag earns the row by being near. A task keeps its place whether or
        // not its hour has passed, because an unfinished task still stands.
        if (it.type === 'routine' && it.startTime
            && (at < nowMin || at > nowMin + RHYTHM_HORIZON_MIN)) continue;
        // A routine the clause above cannot reach, because it has no hour to
        // compare: an untimed item sorts at MAX_SAFE_INTEGER, so at 7:33pm the
        // Everyone row still read "Eat breakfast · Read · Out the door · Camp
        // dropoff". Most of those inherit an hour from their collection now
        // (effectiveTimeOfDay) and never arrive here; what is left is a daily
        // habit with no hour anywhere, and a thing that happens every day at
        // no particular time can never be the thing still ahead of you.
        //
        // Deliberately narrow: a routine that is NOT everyday keeps its place.
        // "Do kitchen Laundry", weekly on Saturday with no time, IS Saturday —
        // background is what an everyday rhythm is, not what a weekly one is.
        if (it.type === 'routine' && !it.startTime && isEverydayRoutine(it.recurrencePattern)) continue;
        anytimeItems.push({ title, at });
        continue;
      }

      const s = minutesOfDay(it.startTime!);
      const e = it.endTime ? minutesOfDay(it.endTime) : s + DEFAULT_DURATION_MIN;

      if (s >= axis.endMin) { laterCount++; continue; }
      if (e <= axis.startMin) continue; // already over and off the left edge

      // Clamp to the window so a block that straddles an edge still reads as
      // running, rather than being dropped or drawn off-canvas.
      const cs = Math.max(s, axis.startMin);
      const ce = Math.min(e, axis.endMin);
      const widthPct = ((ce - cs) / span) * 100;

      blocks.push({
        id: it.id,
        title,
        leftPct: ((cs - axis.startMin) / span) * 100,
        widthPct,
        labelSide: 'in',
        labelRoomPct: 0,
        past: e <= nowMin,
        type: it.type,
      });
    }

    blocks.sort((a, b) => a.leftPct - b.leftPct);

    // Label placement needs every block's neighbours, so it runs after sorting.
    //
    // A gap can hold ONE label. Without reserving them, block A writes into the
    // gap on its right while block B writes into the same gap on its left, and
    // the two collide mid-air — "Free plaGANTT Piano practice". So walk left to
    // right and mark each gap as it is claimed.
    //
    // gaps[i] is the clear track immediately BEFORE block i; gaps[n] is the
    // run from the last block to the end of the track.
    const pxOf = (pct: number) => (pct / 100) * trackPx;
    const gaps: number[] = [];
    for (let i = 0; i <= blocks.length; i++) {
      const from = i === 0 ? 0 : blocks[i - 1].leftPct + blocks[i - 1].widthPct;
      const to = i === blocks.length ? 100 : blocks[i].leftPct;
      gaps.push(Math.max(0, to - from));
    }
    // A gap holds one label — unless it is wide enough for two, in which case
    // the block on each side takes half. Without sharing, the second bar in a
    // row kept falling back inside and truncating even though 400px of empty
    // track sat right beside it.
    const claims = new Array<number>(gaps.length).fill(0);
    const roomIn = (g: number, shares: number) => gaps[g] / shares;
    const canClaim = (g: number) =>
      pxOf(roomIn(g, claims[g] + 1)) >= MIN_LABEL_PX;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (pxOf(b.widthPct) >= MIN_LABEL_PX) continue;

      if (canClaim(i + 1)) {
        b.labelSide = 'right';
        claims[i + 1] += 1;
      } else if (canClaim(i)) {
        b.labelSide = 'left';
        claims[i] += 1;
      }
      // Neither side has room: the label stays in and truncates. Unavoidable
      // when short blocks sit back to back, and rare enough to accept.
    }

    // Room is divided only once every claim on a gap is known.
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.labelSide === 'right') b.labelRoomPct = roomIn(i + 1, claims[i + 1]);
      else if (b.labelSide === 'left') b.labelRoomPct = roomIn(i, claims[i]);
    }
    // Untimed things still happen in an order — breakfast before bedtime —
    // and the line reads as the day when it is sorted, as noise when it isn't.
    anytimeItems.sort((a, b) => a.at - b.at);

    return {
      memberId: m.id, name: m.name, blocks,
      anytime: anytimeItems.map((a) => a.title),
      laterCount,
    };
  });

  return { axis, tracks };
}
