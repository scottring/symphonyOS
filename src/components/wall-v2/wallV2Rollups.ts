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
