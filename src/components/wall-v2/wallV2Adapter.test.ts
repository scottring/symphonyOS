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
  adaptOverdueSection,
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

  it('carries completed state through to the wall event', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [makeItem({ id: 'task-1', type: 'task', title: 'Done thing', completed: true, startTime: new Date(2026, 4, 20, 9, 0) })],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, members, now, null);
    expect(result.find((s) => s.label === 'Morning')!.events[0].completed).toBe(true);
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

describe('adaptOverdueSection', () => {
  const now = new Date('2026-05-28T09:00:00');

  function makeMember(partial: Partial<FamilyMember>): FamilyMember {
    return {
      id: partial.id ?? 'm-1',
      name: partial.name ?? 'Iris',
      initials: partial.initials ?? 'IK',
      color: partial.color ?? '#cc8855',
      member_type: partial.member_type ?? 'core',
      display_order: partial.display_order ?? 0,
      ...partial,
    } as FamilyMember;
  }

  function makeOverdueTask(daysAgo: number, partial: Partial<TimelineItem> = {}): TimelineItem {
    const start = new Date(now);
    start.setDate(start.getDate() - daysAgo);
    return makeItem({
      id: partial.id ?? `task-od-${daysAgo}`,
      type: 'task',
      title: partial.title ?? `Overdue ${daysAgo}d ago`,
      startTime: start,
      completed: false,
      ...partial,
    });
  }

  it('returns null when there are no overdue tasks', () => {
    expect(adaptOverdueSection([], [], now)).toBeNull();
  });

  it('builds a section with the right id, label, and tint when one task is overdue', () => {
    const section = adaptOverdueSection([makeOverdueTask(3)], [], now);
    expect(section).not.toBeNull();
    expect(section!.id).toBe('overdue');
    expect(section!.label).toBe('Overdue');
    expect(section!.tint).toBe('honey');
    expect(section!.events).toHaveLength(1);
  });

  it('caps the section at 5 rows even when more tasks are overdue', () => {
    const tasks = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => makeOverdueTask(d));
    const section = adaptOverdueSection(tasks, [], now);
    expect(section!.events).toHaveLength(5);
  });

  it('sorts rows oldest first regardless of input order', () => {
    const t1 = makeOverdueTask(1, { id: 'task-yesterday' });
    const t7 = makeOverdueTask(7, { id: 'task-week' });
    const t3 = makeOverdueTask(3, { id: 'task-threed' });
    const section = adaptOverdueSection([t1, t7, t3], [], now);
    expect(section!.events.map((e) => e.id)).toEqual([
      'task-week',
      'task-threed',
      'task-yesterday',
    ]);
  });

  it('uses "Was due yesterday" for a 1-day-old task', () => {
    const section = adaptOverdueSection([makeOverdueTask(1)], [], now);
    expect(section!.events[0].subtitle).toBe('Was due yesterday');
  });

  it('uses "N days ago" for 2–6 days', () => {
    const section = adaptOverdueSection(
      [makeOverdueTask(2), makeOverdueTask(6)],
      [],
      now,
    );
    // After oldest-first sort: 6 days, then 2 days.
    expect(section!.events.map((e) => e.subtitle)).toEqual(['6 days ago', '2 days ago']);
  });

  it('uses "N weeks ago" rounded for 7+ days', () => {
    const section = adaptOverdueSection(
      [makeOverdueTask(7), makeOverdueTask(10), makeOverdueTask(14), makeOverdueTask(20)],
      [],
      now,
    );
    // After oldest-first sort: 20, 14, 10, 7.
    // 20 days ≈ 3 weeks (rounded from 2.86), 14 = 2 weeks, 10 ≈ 1 week,
    // 7 = 1 week.
    expect(section!.events.map((e) => e.subtitle)).toEqual([
      '3 weeks ago',
      '2 weeks ago',
      '1 week ago',
      '1 week ago',
    ]);
  });

  it('attaches the assignee bubble when the task has an assignee in the family', () => {
    const iris = makeMember({ id: 'm-iris', name: 'Iris', initials: 'IK', color: '#cc8855' });
    const task = makeOverdueTask(2, { assignedTo: 'm-iris' });
    const section = adaptOverdueSection([task], [iris], now);
    expect(section!.events[0].members).toHaveLength(1);
    expect(section!.events[0].members![0].id).toBe('m-iris');
    expect(section!.events[0].members![0].initials).toBe('IK');
  });

  it('leaves members undefined when the task has no assignee', () => {
    const section = adaptOverdueSection([makeOverdueTask(2)], [], now);
    expect(section!.events[0].members).toBeUndefined();
  });

  it('leaves members undefined when the assignee id is not in the family list', () => {
    const task = makeOverdueTask(2, { assignedTo: 'm-not-here' });
    const section = adaptOverdueSection([task], [], now);
    expect(section!.events[0].members).toBeUndefined();
  });

  it("marks rows with kind='task' and completed=false so the action sheet routes correctly", () => {
    const section = adaptOverdueSection([makeOverdueTask(2)], [], now);
    expect(section!.events[0].kind).toBe('task');
    expect(section!.events[0].completed).toBe(false);
  });

  it('skips tasks with no startTime (defensive — a task without a scheduled date is not overdue)', () => {
    const noStart = makeItem({ id: 'task-no-start', type: 'task', startTime: null, completed: false });
    const ok = makeOverdueTask(3);
    const section = adaptOverdueSection([noStart, ok], [], now);
    expect(section!.events).toHaveLength(1);
    expect(section!.events[0].id).toBe(ok.id);
  });
});
