// src/components/wall-v2/wallV2Adapter.test.ts
//
// Unit tests for the pure adapter functions. These cover the meaningful
// branches: weather pass-through, timeline section split (afternoon/evening/
// night), dinner-event promotion with recipe URL detection, and the upcoming
// "Tomorrow" / weekday labelling.

import { describe, it, expect } from 'vitest';
import type { TimelineItem } from '@/types/timeline';
import type { FamilyMember } from '@/types/family';
import type { CalendarEvent } from '@/hooks/useGoogleCalendar';
import type { WallDayData } from '@/hooks/useWallData';
import {
  adaptTimelineSections,
  adaptUpcoming,
  adaptWeather,
} from './wallV2Adapter';

function makeItem(partial: Partial<TimelineItem>): TimelineItem {
  return {
    id: partial.id ?? `t-${Math.random()}`,
    type: partial.type ?? 'event',
    title: partial.title ?? 'Untitled',
    startTime: partial.startTime ?? null,
    endTime: partial.endTime ?? null,
    completed: false,
    ...partial,
  };
}

function makeDay(partial: Partial<WallDayData>): WallDayData {
  return {
    date: partial.date ?? new Date(),
    isToday: partial.isToday ?? false,
    items: partial.items ?? {
      allday: [], morning: [], afternoon: [], evening: [], unscheduled: [],
    },
    birthdays: [],
    milestones: [],
  };
}

describe('adaptWeather', () => {
  it('passes temp / condition / hi-lo through', () => {
    const result = adaptWeather({
      currentTemp: 72,
      weatherCode: 0,
      condition: 'Clear',
      highTemp: 94,
      lowTemp: 70,
      hourlyForecast: [],
    });
    expect(result).toMatchObject({
      temp: 72, condition: 'Clear', high: 94, low: 70,
    });
  });

  it('returns null when weather is missing', () => {
    expect(adaptWeather(null)).toBeNull();
  });
});

describe('adaptTimelineSections', () => {
  const now = new Date(2026, 4, 20, 13, 0); // Wed May 20 2026, 1pm
  const members: FamilyMember[] = [];

  it('returns no sections when today data is missing', () => {
    const result = adaptTimelineSections(undefined, members, now, null);
    expect(result).toEqual([]);
  });

  it('places 9 PM+ items into a separate "night" section', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [], afternoon: [],
        evening: [
          makeItem({ id: 'wind', title: 'Wind down', startTime: new Date(2026, 4, 20, 22, 0) }),
          makeItem({ id: 'shower', title: 'Kids shower', startTime: new Date(2026, 4, 20, 19, 30) }),
        ],
        unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, members, now, null);
    const labels = result.map((s) => s.label);
    expect(labels).toContain('Evening');
    expect(labels).toContain('Night');
    const night = result.find((s) => s.label === 'Night')!;
    expect(night.events.map((e) => e.title)).toEqual(['Wind down']);
  });

  it('collapses identical routines into one card with merged avatars', () => {
    const kaleb: FamilyMember = { id: 'k', name: 'Kaleb', initials: 'KA', color: 'blue' } as FamilyMember;
    const ella: FamilyMember = { id: 'e', name: 'Ella', initials: 'EL', color: 'pink' } as FamilyMember;
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [], afternoon: [],
        evening: [
          makeItem({ id: 'r1', type: 'routine', title: 'Get undressed', assignedTo: 'k', startTime: new Date(2026, 4, 20, 19, 0) }),
          makeItem({ id: 'r2', type: 'routine', title: 'Get undressed', assignedTo: 'e', startTime: new Date(2026, 4, 20, 19, 0) }),
          makeItem({ id: 'r3', type: 'routine', title: 'Brush teeth', assignedTo: 'k', startTime: new Date(2026, 4, 20, 19, 30) }),
        ],
        unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, [kaleb, ella], now, null);
    const evening = result.find((s) => s.label === 'Evening')!;
    expect(evening.events.map((e) => e.title)).toEqual(['Get undressed', 'Brush teeth']);
    const undressed = evening.events.find((e) => e.title === 'Get undressed')!;
    expect(undressed.members?.map((m) => m.id).sort()).toEqual(['e', 'k']);
  });

  it('keeps non-routine items separate even if titles match', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [], afternoon: [],
        evening: [
          makeItem({ id: 't1', type: 'task', title: 'Walk the dog', startTime: new Date(2026, 4, 20, 19, 0) }),
          makeItem({ id: 't2', type: 'task', title: 'Walk the dog', startTime: new Date(2026, 4, 20, 20, 0) }),
        ],
        unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, [], now, null);
    const evening = result.find((s) => s.label === 'Evening')!;
    expect(evening.events).toHaveLength(2);
  });

  it('renders Morning and All-day sections', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [makeItem({ id: 'a', type: 'event', title: 'All day thing', startTime: null })],
        morning: [makeItem({ id: 'm', type: 'task', title: 'Morning task', startTime: new Date(2026, 4, 20, 9, 0) })],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, members, now, null);
    const labels = result.map((s) => s.label);
    expect(labels).toContain('Morning');
    expect(labels).toContain('All day');
    const morning = result.find((s) => s.label === 'Morning')!;
    expect(morning.events.map((e) => e.title)).toContain('Morning task');
  });

  it('shows earlier-today items (whole day, not forward-only)', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [],
        // 10am is in the past relative to now (1pm) — must still appear.
        afternoon: [makeItem({ id: 'p', type: 'task', title: 'Past task', startTime: new Date(2026, 4, 20, 10, 0) })],
        evening: [], unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, members, now, null);
    const afternoon = result.find((s) => s.label === 'Afternoon')!;
    expect(afternoon.events.map((e) => e.title)).toContain('Past task');
  });

  it('promotes a dinner event into Evening with recipe URL', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [], afternoon: [],
        evening: [
          makeItem({ id: 'shower', title: 'Kids shower', startTime: new Date(2026, 4, 20, 19, 30) }),
        ],
        unscheduled: [],
      },
    });
    // URL must match detectRecipeUrl's heuristic — either a known recipe
    // domain or contain "/recipe" in the path.
    const dinner: CalendarEvent = {
      id: 'dn-1',
      title: 'Crispy tofu stir fry',
      description: 'Recipe: https://example.com/recipes/crispy-tofu',
      startTime: new Date(2026, 4, 20, 18, 30),
      endTime: new Date(2026, 4, 20, 19, 30),
      allDay: false,
    } as unknown as CalendarEvent;

    const result = adaptTimelineSections(today, members, now, dinner);
    const evening = result.find((s) => s.label === 'Evening')!;
    expect(evening.events[0].title).toBe('Family dinner');
    expect(evening.events[0].recipeUrl).toBe('https://example.com/recipes/crispy-tofu');
  });
});

describe('adaptUpcoming', () => {
  const today = new Date(2026, 4, 20);

  it('labels the next day as "Tomorrow"', () => {
    const days: WallDayData[] = [
      makeDay({ date: today, isToday: true }),
      makeDay({
        date: new Date(2026, 4, 21),
        items: {
          allday: [], morning: [], afternoon: [],
          evening: [makeItem({ title: 'Early release 1:15 PM' })],
          unscheduled: [],
        },
      }),
    ];
    const result = adaptUpcoming(days, today);
    expect(result[0].label).toBe('Tomorrow');
    expect(result[0].detail).toBe('Early release 1:15 PM');
  });

  it('uses weekday name for days 2–6 out', () => {
    const days: WallDayData[] = [
      makeDay({ date: today, isToday: true }),
      makeDay({
        date: new Date(2026, 4, 22), // Friday
        items: {
          allday: [], morning: [],
          afternoon: [makeItem({ title: 'Field trip' })],
          evening: [], unscheduled: [],
        },
      }),
    ];
    const result = adaptUpcoming(days, today);
    expect(result[0].label).toBe('Friday');
  });

  it('skips upcoming days with no items', () => {
    const days: WallDayData[] = [
      makeDay({ date: today, isToday: true }),
      makeDay({ date: new Date(2026, 4, 21) }), // empty
    ];
    expect(adaptUpcoming(days, today)).toEqual([]);
  });
});
