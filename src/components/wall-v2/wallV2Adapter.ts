// src/components/wall-v2/wallV2Adapter.ts
//
// Pure adapters: turn live data (TimelineItems, WeatherData, FamilyMembers,
// meal events) into the view-shape types in `types.ts`. Each adapter accepts
// already-fetched data and returns the same view shape the static mock uses,
// so the WallV2Shell render path stays identical whether we're showing live
// data or the design payload.
//
// Why pure functions? They're trivially testable and they keep the shell
// component free of branching/transform logic.

import {
  Backpack, Bath, Briefcase, Calendar, Car, Check, ChefHat, ClipboardList,
  Coffee, Croissant, Heart, Moon, Music, Plane, Plug, RotateCw, ShoppingBag,
  Sparkles, Sun, Sunrise, Trophy, Users, UtensilsCrossed, Clock, AlertCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { WeatherData } from '@/hooks/useWeather';
import type { TimelineItem } from '@/types/timeline';
import type { FamilyMember } from '@/types/family';
import type { CalendarEvent } from '@/hooks/useGoogleCalendar';
import type { WallDayData } from '@/hooks/useWallData';
import { extractRecipeNameHint, resolveRecipeUrl } from '@/lib/recipeDetection';
import { isEverydayRoutine, isPinnedToTimeline } from '@/lib/routineUtils';
import { SECTIONS_ORDER } from '@/lib/today/types';
import { PREVIEW_SECTIONS } from '@/components/wall/today/tomorrowPreview';

import type {
  WallV2MemberBubble,
  WallV2ScheduleBandData,
  WallV2TimelineEvent,
  WallV2TimelineSection,
  WallV2Tint,
  WallV2WeatherData,
} from './types';

// ────────────────────────────────────────────────────────────────────────────
// Family member → avatar/tint helpers
// ────────────────────────────────────────────────────────────────────────────

const COLOR_TO_TINT: Record<string, WallV2Tint> = {
  blue: 'sky',
  purple: 'lavender',
  green: 'sage',
  orange: 'peach',
  pink: 'rose',
  teal: 'mint',
};

function memberTint(m: FamilyMember | undefined): WallV2Tint {
  if (!m) return 'sand';
  return COLOR_TO_TINT[m.color] ?? 'sand';
}

export function memberBubble(m: FamilyMember): WallV2MemberBubble {
  return {
    id: m.id,
    initials: m.initials,
    tint: memberTint(m),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Weather
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pick a lucide icon to match a WMO weather code. Falls back to Sun for clear
 * conditions and a soft default for everything else.
 */
function weatherIconForCode(code: number): LucideIcon {
  if (code === 0) return Sun;
  if (code <= 3) return Sun; // partly cloudy → still bright
  if (code <= 48) return Sun; // foggy — no perfect lucide; lean bright
  if (code <= 65) return Sun; // rain — could swap CloudRain
  if (code <= 86) return Sun; // snow — could swap Snowflake
  return Sun;
}

export function adaptWeather(w: WeatherData | null): WallV2WeatherData | null {
  if (!w) return null;
  return {
    temp: w.currentTemp,
    high: w.highTemp,
    low: w.lowTemp,
    condition: w.condition,
    rainChance: 0, // useWeather doesn't surface precip probability yet
    sentence: undefined,
    icon: weatherIconForCode(w.weatherCode),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Timeline items → event cards
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pick an icon + tint for a TimelineItem based on its title and type. The
 * matchers are intentionally light — they cover the common keywords visible
 * in the mockup; fall-through items get a sensible default.
 */
function iconForItem(item: TimelineItem): { icon: LucideIcon; tint: WallV2Tint } {
  const t = item.title.toLowerCase();

  // Strong keyword matches (most specific first)
  if (/dinner|breakfast|lunch|meal|stir.?fry|recipe/.test(t)) {
    return { icon: UtensilsCrossed, tint: 'peach' };
  }
  if (/shower|bath|hygiene/.test(t)) return { icon: Bath, tint: 'sky' };
  if (/pickup|pick up|drop off|drive|drop\s+off/.test(t)) {
    return { icon: Car, tint: 'peach' };
  }
  if (/soccer|practice|game|tournament/.test(t)) {
    return { icon: Trophy, tint: 'sky' };
  }
  if (/therapy|appointment|doctor|dentist|caitlin/.test(t)) {
    return { icon: Calendar, tint: 'sage' };
  }
  if (/school|field trip|class/.test(t)) {
    return { icon: Backpack, tint: 'sage' };
  }
  if (/work|meeting|standup|sync/.test(t)) {
    return { icon: Briefcase, tint: 'sky' };
  }
  if (/cook|prep|chef/.test(t)) return { icon: ChefHat, tint: 'peach' };
  if (/wind down|read|bedtime|sleep/.test(t)) {
    return { icon: Moon, tint: 'lavender' };
  }
  if (/morning|wake|coffee/.test(t)) return { icon: Coffee, tint: 'honey' };
  if (/flight|travel|trip/.test(t)) return { icon: Plane, tint: 'lavender' };
  if (/music|piano|practice/.test(t)) return { icon: Music, tint: 'lavender' };

  // By type
  if (item.type === 'event') return { icon: Calendar, tint: 'sage' };
  if (item.type === 'routine') return { icon: RotateCw, tint: 'mint' };
  if (item.category === 'errand') return { icon: ShoppingBag, tint: 'peach' };

  return { icon: Check, tint: 'sand' };
}

function durationMeta(item: TimelineItem): string | undefined {
  if (!item.startTime || !item.endTime) return undefined;
  const minutes = Math.round(
    (item.endTime.getTime() - item.startTime.getTime()) / 60_000,
  );
  if (minutes <= 0) return undefined;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export function adaptTimelineEvent(
  item: TimelineItem,
  members: FamilyMember[],
): WallV2TimelineEvent {
  const { icon, tint } = iconForItem(item);
  const assigned = item.assignedTo
    ? members.find((m) => m.id === item.assignedTo)
    : undefined;
  const memberBubbles = assigned ? [memberBubble(assigned)] : undefined;
  return {
    id: item.id,
    kind: item.type === 'routine-collection' ? 'routine' : item.type,
    icon,
    tint,
    title: item.title,
    // Teams/Zoom put the join URL in the location field; show a friendly
    // "Video call" label instead of a raw URL (which also blows out the row).
    subtitle: /^https?:\/\//i.test(item.location ?? '')
      ? 'Video call'
      : item.location || (item.type === 'routine' ? 'Routine' : item.type === 'event' ? 'Event' : 'Task'),
    meta: durationMeta(item),
    members: memberBubbles,
    completed: item.completed,
    // Carry the rich context through so the tap action sheet can surface it.
    // (Events keep their read-only Google description as the notes fallback.)
    phoneNumber: item.phoneNumber,
    location: item.location,
    locationPlaceId: item.locationPlaceId,
    notes: item.notes || item.googleDescription,
    links: item.links,
    meetingUrl: item.meetingUrl,
  };
}

// Two kids doing the same evening routine (e.g. "Get undressed", "Brush teeth")
// produce one TimelineItem per kid. On the wall that reads as duplicates, so
// we collapse identical routines into a single card with merged avatars.
// Non-routine items stay separate even if their titles happen to match.
function dedupeRoutines(
  items: TimelineItem[],
  members: FamilyMember[],
): WallV2TimelineEvent[] {
  const events: WallV2TimelineEvent[] = [];
  const routineIndex = new Map<string, number>();

  for (const item of items) {
    const isRoutine = item.type === 'routine';
    // A collection step (e.g. one exercise in "Camp Mornings") never renders
    // as its own row — the collection carries it. useWallData does not filter
    // this (out of scope pending the show_on_timeline audit), so the adapter
    // is the only place left that knows parent_routine_id.
    if (isRoutine && item.originalRoutine?.parent_routine_id != null) continue;
    const key = isRoutine ? item.title.trim().toLowerCase() : null;

    if (key !== null && routineIndex.has(key)) {
      const card = events[routineIndex.get(key)!];
      const assigned = item.assignedTo
        ? members.find((m) => m.id === item.assignedTo)
        : undefined;
      if (!assigned) continue;
      const next = memberBubble(assigned);
      const existing = card.members ?? [];
      if (!existing.some((b) => b.id === next.id)) {
        card.members = [...existing, next];
      }
      continue;
    }

    const event = adaptTimelineEvent(item, members);
    if (key !== null) routineIndex.set(key, events.length);
    events.push(event);
  }

  return events;
}

// ────────────────────────────────────────────────────────────────────────────
// Schedule band — prioritized timed agenda (events + timed tasks)
// ────────────────────────────────────────────────────────────────────────────

function formatBandTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Sort key for band rows by their formatted time; rows without a time sink to the end. */
function bandTimeKey(e: WallV2TimelineEvent): number {
  if (!e.time) return Number.POSITIVE_INFINITY;
  const m = e.time.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return Number.POSITIVE_INFINITY;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

/** True for the prioritized band: a timed commitment (event or task with a real clock time). Routines never qualify. */
export function isCommitment(item: TimelineItem): boolean {
  if (item.type !== 'event' && item.type !== 'task') return false;
  return item.startTime != null && !item.allDay;
}

/**
 * Build the prioritized Schedule band from today's items:
 *   - all-day calendar events → `allDay` strip
 *   - timed events + timed tasks → `timed`, sorted ascending by start time,
 *     each tagged with a formatted `time`
 *   - the structured dinner/breakfast events (if any) → special meal cards
 *     placed by time, replacing any raw "dinner"/"breakfast" event so the
 *     meal isn't shown twice
 * Routines and untimed tasks are excluded entirely (they belong to the rhythm zone).
 */
export function adaptScheduleBand(
  today: WallDayData | undefined,
  members: FamilyMember[],
  _now: Date,
  dinnerEvent: CalendarEvent | null,
  breakfastEvent: CalendarEvent | null = null,
): WallV2ScheduleBandData {
  if (!today) return { allDay: [], timed: [] };

  // Every section, via SECTIONS_ORDER — a literal list here used to omit
  // earlyMorning and night, so a 7:00 AM dropoff and a 9:30 PM commitment both
  // dropped out of the prioritized band.
  const all: TimelineItem[] = SECTIONS_ORDER.flatMap((s) => today.items[s] ?? []);

  const allDay = all
    .filter((i) => i.type === 'event' && i.allDay)
    .map((i) => adaptTimelineEvent(i, members));

  const timedItems = all
    .filter(isCommitment)
    .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime());

  let timed: WallV2TimelineEvent[] = timedItems.map((i) => ({
    ...adaptTimelineEvent(i, members),
    time: formatBandTime(i.startTime!),
  }));

  // Promote a structured meal event to a highlighted card: drop any raw event
  // for the same meal so it isn't listed twice, insert the card, re-sort.
  const promoteMeal = (
    event: CalendarEvent,
    meal: 'dinner' | 'breakfast',
    icon: LucideIcon,
    tint: WallV2Tint,
  ) => {
    const startStr = event.start_time || event.startTime;
    const start = startStr ? new Date(startStr) : null;
    const card: WallV2TimelineEvent = {
      id: `${meal}-${event.id}`,
      icon,
      tint,
      title: meal === 'dinner' ? 'Family dinner' : 'Family breakfast',
      subtitle: extractRecipeNameHint(event.title) || event.title,
      highlight: tint,
      members: members.slice(0, 4).map(memberBubble),
      recipeUrl: resolveRecipeUrl(event.description),
      time: start ? formatBandTime(start) : undefined,
    };
    const raw = new RegExp(meal, 'i');
    timed = timed.filter((e) => !raw.test(e.title));
    timed.push(card);
    timed.sort((a, b) => bandTimeKey(a) - bandTimeKey(b));
  };

  if (dinnerEvent) promoteMeal(dinnerEvent, 'dinner', UtensilsCrossed, 'peach');
  if (breakfastEvent) promoteMeal(breakfastEvent, 'breakfast', Croissant, 'honey');

  return { allDay, timed };
}

/**
 * Turn today's items into the wall's rhythm sections, one per day band.
 * Every band from DAY_SECTION_BOUNDS gets read directly out of
 * `today.items` — no re-deriving a band by re-splitting its neighbour, which
 * is how Night silently stopped rendering. Empty bands are omitted.
 */
export function adaptTimelineSections(
  today: WallDayData | undefined,
  members: FamilyMember[],
  now: Date,
  _dinnerEvent: CalendarEvent | null,
  hideDailyRoutines: boolean,
  overdueTasks: TimelineItem[],
): WallV2TimelineSection[] {
  // Compute overdue first so it survives the no-today early return below.
  // Without this, a transient data race (today missing in days, overdue
  // populated) would silently drop the user's overdue list on the wall.
  const overdueOnlyEarly = adaptOverdueSection(overdueTasks, members, now);
  if (!today) return overdueOnlyEarly ? [overdueOnlyEarly] : [];

  // Rhythm zone = routines (always) + untimed/all-day tasks. Calendar events and
  // timed tasks are pulled into the prioritized Schedule band (adaptScheduleBand),
  // so drop them here to avoid showing a commitment in two places.
  //
  // "Hide daily" then drops routines that effectively recur every weekday (daily +
  // weekday-only weeklies). One-off routines (since-last, monthly, etc.) stay
  // visible because they're never "noise."
  const isVisible = (i: TimelineItem) => {
    if (i.type === 'event') return false;            // all events → band (timed or all-day strip)
    if (isCommitment(i)) return false;               // timed tasks → band
    if (i.type !== 'routine') return true;
    if (!hideDailyRoutines) return true;
    // Rung 7's pin escape, which the wall never had: a pinned or dosed routine
    // is a tracked obligation (PT exercises), not ambient noise.
    if (i.originalRoutine && isPinnedToTimeline(i.originalRoutine)) return true;
    return !isEverydayRoutine(i.recurrencePattern);
  };

  // Whole-day view: render every section in order (All-day, Early morning,
  // Morning, Afternoon, Evening, Night). No forward-only filtering —
  // earlier-today items still show (completed ones render checked) so the wall
  // reflects the full day rather than only what's next.
  const pick = (items: TimelineItem[] | undefined) =>
    dedupeRoutines((items ?? []).filter(isVisible), members);

  const alldayItems = pick(today.items.allday);
  const earlyMorningItems = pick(today.items.earlyMorning);
  const morningItems = pick(today.items.morning);
  const afternoonItems = pick(today.items.afternoon);

  // Timeless routines (e.g. weekly "plan meals", "change sheets") have no
  // time_of_day, so getDaySection drops them into the 'unscheduled' bucket.
  // The Today view surfaces these; the wall must too, or non-daily routines
  // silently vanish from the kiosk. Routines only — any non-routine here is a
  // bucketed/untriaged task that shouldn't spam the wall.
  const anytimeItems = pick(
    (today.items.unscheduled ?? []).filter((i) => i.type === 'routine'),
  );

  // Evening and Night are real buckets now — read them, don't re-derive. This
  // used to re-split `items.evening` on `hour >= 21`, which became dead code
  // the moment the evening band was capped at hour 20: nothing could ever
  // match, so Night rendered never and 21:00+ items vanished from the wall.
  const eveningItems = pick(today.items.evening);
  const nightItems = pick(today.items.night);

  const baseSections: WallV2TimelineSection[] = [];
  if (alldayItems.length > 0) {
    baseSections.push({ id: 'allday', label: 'All day', icon: Calendar, tint: 'sage', events: alldayItems });
  }
  if (earlyMorningItems.length > 0) {
    baseSections.push({ id: 'earlyMorning', label: 'Early morning', icon: Sunrise, tint: 'lavender', events: earlyMorningItems });
  }
  if (morningItems.length > 0) {
    baseSections.push({ id: 'morning', label: 'Morning', icon: Sunrise, tint: 'sky', events: morningItems });
  }
  if (afternoonItems.length > 0) {
    baseSections.push({ id: 'afternoon', label: 'Afternoon', icon: Sun, tint: 'honey', events: afternoonItems });
  }
  if (eveningItems.length > 0) {
    baseSections.push({ id: 'evening', label: 'Evening', icon: Moon, tint: 'lavender', events: eveningItems });
  }
  if (nightItems.length > 0) {
    baseSections.push({ id: 'night', label: 'Night', icon: Moon, tint: 'sand', events: nightItems });
  }
  // Timeless routines sit at the end — they're "sometime today", not tied to a
  // part of the day, so they read naturally after the timed sections.
  if (anytimeItems.length > 0) {
    baseSections.push({ id: 'anytime', label: 'Anytime', icon: Clock, tint: 'mint', events: anytimeItems });
  }
  // Reuse the overdue computation from the top of the function — same
  // inputs, same output, no point computing twice.
  return overdueOnlyEarly ? [overdueOnlyEarly, ...baseSections] : baseSections;
}

// ────────────────────────────────────────────────────────────────────────────
// Glance cards
// ────────────────────────────────────────────────────────────────────────────

/**
 * Whether an item may headline a member's glance card. Not a visibility
 * question — a routine can be on the wall and still be the wrong thing to lead
 * with. Everyday routines are the day's background rhythm ("brush teeth"), so
 * they only headline when the user has chosen to see everyday routines at all.
 */
function canHeadline(item: TimelineItem, prefs: { hideRoutines: boolean }): boolean {
  if (item.type !== 'routine') return true;
  if (!isEverydayRoutine(item.recurrencePattern)) return true;
  return !prefs.hideRoutines;
}

/**
 * Build a per-member "next thing today" glance card. Falls back to a generic
 * "All set" line if the member has no upcoming item.
 */
export function adaptGlanceForMember(
  member: FamilyMember,
  today: WallDayData | undefined,
  now: Date,
  hideDailyRoutines: boolean,
) {
  if (!today) return null;
  let next: TimelineItem | null = null;
  // PREVIEW_SECTIONS, not SECTIONS_ORDER: 'unscheduled' is an
  // untriaged/untimed task, and a member's glance card shouldn't be
  // headlined by one — same policy adaptTimelineSections enforces for the
  // rhythm zone below.
  for (const section of PREVIEW_SECTIONS) {
    for (const item of today.items[section] ?? []) {
      // Routine items carry every owner (routineToTimelineItem -> routineOwners).
      // assignedTo is the legacy single column and stays the fallback for item
      // types that do not populate owners yet.
      const itemOwners = item.owners?.length ? item.owners : item.assignedTo ? [item.assignedTo] : [];
      if (!itemOwners.includes(member.id)) continue;
      if (!canHeadline(item, { hideRoutines: hideDailyRoutines })) continue;
      if (item.startTime && item.startTime < now) continue;
      if (!next || (item.startTime && next.startTime && item.startTime < next.startTime)) {
        next = item;
      }
    }
  }
  if (!next) return null;

  const { icon, tint } = iconForItem(next);
  const time = next.startTime?.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });

  return {
    id: `glance-${member.id}`,
    icon,
    tint,
    title: member.name,
    primary: next.title,
    secondary: time,
  };
}

// Decorative export so adapter consumers can hint the AI Insight card with a
// fresh sparkle when surfaced (kept here so the icon import lives in one place).
export const INSIGHT_ICON: LucideIcon = Sparkles;
export const PLUG_ICON: LucideIcon = Plug;
export const HEART_ICON: LucideIcon = Heart;
export const CHECKLIST_ICON: LucideIcon = ClipboardList;
export const SUNRISE_ICON: LucideIcon = Sunrise;
export const USERS_ICON: LucideIcon = Users;

// ────────────────────────────────────────────────────────────────────────────
// Overdue
// ────────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Family-readable distance from `scheduledFor` to `now`.
 *   1 day  → "Was due yesterday"
 *   2–6    → "N days ago"
 *   ≥ 7    → "N weeks ago" (rounded to the nearest whole week)
 *
 * Internal helper for `adaptOverdueSection`; not part of the wall's
 * public adapter surface.
 *
 * NOTE on DST: setHours(0,0,0,0) floors to the engine's local timezone.
 * A DST transition between scheduledFor and now can shift the delta by
 * ±1h, which may push a boundary day (e.g. 6.5 days) into the wrong
 * round-bucket twice a year. Acceptable for a family wall label; would
 * not be acceptable for billing or SLA logic.
 */
function overdueLabel(scheduledFor: Date, now: Date): string {
  // Compare day floors so a task scheduled for "yesterday 11pm" reads as
  // "Was due yesterday" rather than "less than a day ago."
  const startOfNow = new Date(now);
  startOfNow.setHours(0, 0, 0, 0);
  const startOfScheduled = new Date(scheduledFor);
  startOfScheduled.setHours(0, 0, 0, 0);
  // Clamp to 1 so same-day stragglers (which shouldn't reach here per
  // useWallData's `scheduled_for < today` filter) don't render as
  // "0 days ago." If this ever returns 1 for a today-task, the caller's
  // filter is the bug, not this function.
  const days = Math.max(1, Math.round((startOfNow.getTime() - startOfScheduled.getTime()) / MS_PER_DAY));

  if (days === 1) return 'Was due yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
}

/**
 * Build the wall's "Overdue" timeline section from the already-filtered
 * `overdueTasks` returned by useWallData. Returns null when there's nothing
 * to show — the caller should omit the section entirely.
 *
 * The data layer (useWallData.ts) already filters to family-context,
 * incomplete, scheduled-before-today tasks. This function only re-shapes,
 * sorts oldest-first, and attaches bubbles. No UI cap — the Timeline
 * column handles long lists via scroll.
 */
export function adaptOverdueSection(
  overdueTasks: TimelineItem[],
  members: FamilyMember[],
  now: Date,
): WallV2TimelineSection | null {
  // Defensive: ignore items missing a startTime — they can't be overdue
  // in any meaningful sense.
  const dated = overdueTasks.filter((t) => t.startTime instanceof Date);
  if (dated.length === 0) return null;

  // Oldest first so the most-overdue item lands at the top of the section.
  const sorted = [...dated].sort(
    (a, b) => (a.startTime!.getTime() - b.startTime!.getTime()),
  );

  // No cap — the wall's Timeline column owns scrolling
  // (overflow-y-auto on WallV2Timeline's inner section), so a long
  // overdue list is reachable by scroll. The family's "let me scroll"
  // ask defeats a UI cap.
  const events: WallV2TimelineEvent[] = sorted.map((t) => {
    const assignee = t.assignedTo ? members.find((m) => m.id === t.assignedTo) : undefined;
    return {
      id: t.id,
      icon: AlertCircle,            // calm warning glyph per row
      tint: 'honey',                // warm muted; not red
      title: t.title,
      subtitle: overdueLabel(t.startTime!, now),
      members: assignee ? [memberBubble(assignee)] : undefined,
      kind: 'task' as const,
      completed: false,
    };
  });

  return {
    id: 'overdue',
    label: 'Overdue',
    icon: Clock,                    // section icon
    tint: 'honey',
    events,
  };
}
