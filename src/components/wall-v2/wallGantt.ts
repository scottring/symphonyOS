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
import { householdMember, titleForMember } from './wallEventAttribution';
import { ownersOf } from './wallLanes';

/** Hours of track. Below this a quiet day stretches two items across the wall. */
export const MIN_SPAN_H = 6;
/** Above this, blocks get too narrow to label — the mockup's failure. */
export const MAX_SPAN_H = 8;
/** Track width in px at 1024 wide, used to decide if a label fits inside. */
export const TRACK_PX = 810;
/**
 * A bar narrower than this cannot hold readable type at eight feet.
 *
 * Measured, not guessed: labels render at 1.05rem (~17px) with 24px of
 * horizontal padding, so a 101px bar — a one-hour block on an eight-hour
 * window — leaves ~77px, about six characters. "Food shopping" became
 * "GANTT Foo". 170px is roughly twelve characters, which is a real label.
 */
export const MIN_LABEL_PX = 170;
/** Default duration for an item with a start but no end. */
const DEFAULT_DURATION_MIN = 60;

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
  /** Items with no clock time. They have no position, so they get a chip. */
  allDay: string[];
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

function itemsFor(day: WallDayData, memberId: string, members: FamilyMember[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const section of PREVIEW_SECTIONS) {
    for (const item of day.items[section] ?? []) {
      if (!ownersOf(item, members).includes(memberId)) continue;
      if (item.completed) continue;
      // Same policy the lanes enforce: "brush teeth" is the day's background
      // rhythm, not a bar on the board.
      if (item.type === 'routine' && isEverydayRoutine(item.recurrencePattern)) continue;
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
        if (!it.startTime || it.allDay) continue;
        starts.push(minutesOfDay(it.startTime));
        ends.push(
          it.endTime ? minutesOfDay(it.endTime) : minutesOfDay(it.startTime) + DEFAULT_DURATION_MIN,
        );
      }
    }
  }

  const axis = computeAxis(starts, ends, now);
  const span = axis.endMin - axis.startMin;
  const nowMin = minutesOfDay(now);

  const tracks: GanttTrack[] = roster.map((m) => {
    const blocks: GanttBlock[] = [];
    const allDay: string[] = [];
    let laterCount = 0;

    for (const it of today ? itemsFor(today, m.id, members) : []) {
      // One calendar row can carry the whole family's rotation — "Specials —
      // Ella: Visual Art · Kaleb: PE". Attribution rightly puts it in both
      // kids' tracks; rendering the same string in both is what made it
      // useless. Each track shows only the words addressed to that person.
      const title = titleForMember(it.title, m.name);
      if (!it.startTime || it.allDay) { allDay.push(title); continue; }

      const s = minutesOfDay(it.startTime);
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
    return { memberId: m.id, name: m.name, blocks, allDay, laterCount };
  });

  return { axis, tracks };
}
