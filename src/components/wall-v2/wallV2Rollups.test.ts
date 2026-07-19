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
