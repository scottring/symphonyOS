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
  adaptScheduleBand,
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
    const result = adaptTimelineSections(undefined, members, now, null, false, []);
    expect(result).toEqual([]);
  });

  it('places 9 PM+ items into a separate "night" section', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [], afternoon: [],
        evening: [
          makeItem({ id: 'wind', type: 'routine', title: 'Wind down', startTime: new Date(2026, 4, 20, 22, 0) }),
          makeItem({ id: 'shower', type: 'routine', title: 'Kids shower', startTime: new Date(2026, 4, 20, 19, 30) }),
        ],
        unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, members, now, null, false, []);
    const labels = result.map((s) => s.label);
    expect(labels).toContain('Evening');
    expect(labels).toContain('Night');
    const night = result.find((s) => s.label === 'Night')!;
    expect(night.events.map((e) => e.title)).toEqual(['Wind down']);
  });

  it('surfaces timeless (unscheduled) routines in an "Anytime" section', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [], afternoon: [], evening: [],
        unscheduled: [
          makeItem({ id: 'r-meals', type: 'routine', title: 'Plan meals', startTime: null }),
          makeItem({ id: 'r-sheets', type: 'routine', title: 'Change sheets', startTime: null }),
          // A non-routine in the unscheduled bucket must NOT leak onto the wall.
          makeItem({ id: 't-buy', type: 'task', title: 'Buy stamps', startTime: null }),
        ],
      },
    });
    const result = adaptTimelineSections(today, members, now, null, false, []);
    const anytime = result.find((s) => s.label === 'Anytime');
    expect(anytime).toBeDefined();
    expect(anytime!.events.map((e) => e.title).sort()).toEqual(['Change sheets', 'Plan meals']);
  });

  it('hides timeless daily routines when hideDailyRoutines is on, keeps weekly ones', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [], afternoon: [], evening: [],
        unscheduled: [
          makeItem({ id: 'r-daily', type: 'routine', title: 'Tidy up', startTime: null, recurrencePattern: { type: 'daily' } }),
          makeItem({ id: 'r-weekly', type: 'routine', title: 'Plan meals', startTime: null, recurrencePattern: { type: 'weekly', days: ['sunday'] } }),
        ],
      },
    });
    const result = adaptTimelineSections(today, members, now, null, true, []);
    const anytime = result.find((s) => s.label === 'Anytime');
    expect(anytime!.events.map((e) => e.title)).toEqual(['Plan meals']);
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
    const result = adaptTimelineSections(today, [kaleb, ella], now, null, false, []);
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
          makeItem({ id: 't1', type: 'task', title: 'Walk the dog', startTime: null }),
          makeItem({ id: 't2', type: 'task', title: 'Walk the dog', startTime: null }),
        ],
        unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, [], now, null, false, []);
    const evening = result.find((s) => s.label === 'Evening')!;
    expect(evening.events).toHaveLength(2);
  });

  it('renders Morning and All-day sections', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [makeItem({ id: 'a', type: 'task', title: 'All day thing', startTime: null, allDay: true })],
        morning: [makeItem({ id: 'm', type: 'routine', title: 'Morning routine', startTime: new Date(2026, 4, 20, 9, 0) })],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, members, now, null, false, []);
    const labels = result.map((s) => s.label);
    expect(labels).toContain('Morning');
    expect(labels).toContain('All day');
    const morning = result.find((s) => s.label === 'Morning')!;
    expect(morning.events.map((e) => e.title)).toContain('Morning routine');
  });

  it('carries completed state through to the wall event', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [makeItem({ id: 'routine-1', type: 'routine', title: 'Done thing', completed: true, startTime: new Date(2026, 4, 20, 9, 0) })],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, members, now, null, false, []);
    expect(result.find((s) => s.label === 'Morning')!.events[0].completed).toBe(true);
  });

  it('shows earlier-today items (whole day, not forward-only)', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [],
        // 10am is in the past relative to now (1pm) — must still appear.
        afternoon: [makeItem({ id: 'p', type: 'routine', title: 'Past task', startTime: new Date(2026, 4, 20, 10, 0) })],
        evening: [], unscheduled: [],
      },
    });
    const result = adaptTimelineSections(today, members, now, null, false, []);
    const afternoon = result.find((s) => s.label === 'Afternoon')!;
    expect(afternoon.events.map((e) => e.title)).toContain('Past task');
  });

  it('keeps the dinner event out of the rhythm sections (it moves to the Schedule band)', () => {
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [], afternoon: [],
        evening: [
          makeItem({ id: 'r-shower', type: 'routine', title: 'Kids shower', startTime: new Date(2026, 4, 20, 19, 30) }),
        ],
        unscheduled: [],
      },
    });
    const dinner: CalendarEvent = {
      id: 'dn-1',
      title: 'Crispy tofu stir fry',
      description: 'Recipe: https://example.com/recipes/crispy-tofu',
      startTime: new Date(2026, 4, 20, 18, 30),
      endTime: new Date(2026, 4, 20, 19, 30),
      allDay: false,
    } as unknown as CalendarEvent;

    const result = adaptTimelineSections(today, members, now, dinner, false, []);
    const evening = result.find((s) => s.label === 'Evening')!;
    // Dinner now lives in the Schedule band, not the rhythm sections.
    expect(evening.events.map((e) => e.title)).not.toContain('Family dinner');
    expect(evening.events.map((e) => e.title)).toContain('Kids shower');
  });

  it('prepends the Overdue section before all other sections when there are overdue tasks', () => {
    const now = new Date('2026-05-28T09:00:00');
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const overdueTask = makeItem({
      id: 'task-od-1',
      type: 'task',
      title: 'Pay water bill',
      startTime: yesterday,
      completed: false,
    });

    // A minimal today with one morning rhythm item so we can verify ordering.
    const morningItem = makeItem({
      id: 'routine-am',
      type: 'routine',
      title: 'Standup',
      startTime: new Date('2026-05-28T08:30:00'),
    });
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [morningItem], afternoon: [], evening: [], unscheduled: [],
      },
    });

    const sections = adaptTimelineSections(today, [], now, null, false, [overdueTask]);

    // First section should be Overdue, then Morning. The concrete
    // .toBe('morning') (not just .not.toBe('overdue')) catches the
    // silent-regression where morning gets dropped during the prepend.
    expect(sections[0].id).toBe('overdue');
    expect(sections[0].events[0].title).toBe('Pay water bill');
    expect(sections[1].id).toBe('morning');
  });

  it('omits the Overdue section entirely when overdueTasks is empty', () => {
    const now = new Date('2026-05-28T09:00:00');
    const morningItem = makeItem({
      id: 'task-am',
      type: 'task',
      title: 'Standup',
      startTime: new Date('2026-05-28T08:30:00'),
    });
    const today = makeDay({
      isToday: true,
      items: {
        allday: [], morning: [morningItem], afternoon: [], evening: [], unscheduled: [],
      },
    });

    const sections = adaptTimelineSections(today, [], now, null, false, []);

    expect(sections.find((s) => s.id === 'overdue')).toBeUndefined();
  });

  it('returns the Overdue section alone when today data is missing but overdueTasks are present', () => {
    // Edge case: a transient data race (today not yet matched in days,
    // overdue already loaded). The early return must NOT silently swallow
    // the overdue list — the family needs to see it even with no day data.
    const now = new Date('2026-05-28T09:00:00');
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const overdueTask = makeItem({
      id: 'task-od-stale',
      type: 'task',
      title: 'Pay water bill',
      startTime: yesterday,
      completed: false,
    });

    const sections = adaptTimelineSections(undefined, [], now, null, false, [overdueTask]);

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('overdue');
    expect(sections[0].events[0].title).toBe('Pay water bill');
  });

  it('returns an empty array when both today and overdueTasks are absent', () => {
    const now = new Date('2026-05-28T09:00:00');
    const sections = adaptTimelineSections(undefined, [], now, null, false, []);
    expect(sections).toEqual([]);
  });
});

describe('adaptScheduleBand', () => {
  const members: FamilyMember[] = [];
  const now = new Date('2026-06-03T12:00:00');

  it('returns empty band when there is no today data', () => {
    expect(adaptScheduleBand(undefined, members, now, null)).toEqual({ allDay: [], timed: [] });
  });

  it('collects timed events + timed tasks into one chronological list, with formatted time', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [makeItem({ id: 'task-1', type: 'task', title: 'Call plumber', startTime: new Date('2026-06-03T09:30:00') })],
        afternoon: [makeItem({ id: 'event-1', type: 'event', title: 'Dentist', startTime: new Date('2026-06-03T14:00:00') })],
        evening: [],
        unscheduled: [],
      },
    });
    const band = adaptScheduleBand(day, members, now, null);
    expect(band.timed.map((e) => e.title)).toEqual(['Call plumber', 'Dentist']);
    expect(band.timed[0].time).toBe('9:30 AM');
    expect(band.timed[1].time).toBe('2:00 PM');
  });

  it('routes all-day events to the allDay strip, never the timed list', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [makeItem({ id: 'event-2', type: 'event', title: 'Field trip', allDay: true })],
        morning: [], afternoon: [], evening: [], unscheduled: [],
      },
    });
    const band = adaptScheduleBand(day, members, now, null);
    expect(band.allDay.map((e) => e.title)).toEqual(['Field trip']);
    expect(band.timed).toEqual([]);
  });

  it('excludes routines and untimed tasks from the band entirely', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [
          makeItem({ id: 'routine-1', type: 'routine', title: 'Brush teeth', startTime: new Date('2026-06-03T07:30:00') }),
          makeItem({ id: 'task-2', type: 'task', title: 'Untimed task', startTime: null }),
        ],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const band = adaptScheduleBand(day, members, now, null);
    expect(band.timed).toEqual([]);
    expect(band.allDay).toEqual([]);
  });

  it('inserts the dinner card by time and drops a duplicate dinner event', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [], afternoon: [],
        evening: [makeItem({ id: 'event-d', type: 'event', title: 'Family dinner', startTime: new Date('2026-06-03T18:30:00') })],
        unscheduled: [],
      },
    });
    const dinner = { id: 'd1', title: 'Stir-fry', description: '', start_time: '2026-06-03T18:30:00' } as unknown as CalendarEvent;
    const band = adaptScheduleBand(day, members, now, dinner);
    const dinnerCards = band.timed.filter((e) => e.id.startsWith('dinner-'));
    expect(dinnerCards).toHaveLength(1);
    // The raw "Family dinner" event is replaced by the dinner card, not shown twice.
    expect(band.timed.filter((e) => /dinner/i.test(e.title))).toHaveLength(1);
  });
});

describe('adaptTimelineSections — rhythm only', () => {
  const now = new Date('2026-06-03T12:00:00');

  it('excludes calendar events and timed tasks (they belong to the band)', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [
          makeItem({ id: 'event-1', type: 'event', title: 'Dentist', startTime: new Date('2026-06-03T14:00:00') }),
          makeItem({ id: 'task-1', type: 'task', title: 'Call plumber', startTime: new Date('2026-06-03T09:30:00') }),
          makeItem({ id: 'routine-1', type: 'routine', title: 'Brush teeth', startTime: new Date('2026-06-03T07:30:00') }),
        ],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const sections = adaptTimelineSections(day, [], now, null, false, []);
    const titles = sections.flatMap((s) => s.events.map((e) => e.title));
    expect(titles).toContain('Brush teeth'); // routine stays — even though it has a time
    expect(titles).not.toContain('Dentist'); // event → band
    expect(titles).not.toContain('Call plumber'); // timed task → band
  });

  it('keeps untimed tasks in the rhythm zone', () => {
    const day = makeDay({
      isToday: true,
      items: {
        allday: [],
        morning: [makeItem({ id: 'task-2', type: 'task', title: 'Untimed chore', startTime: null })],
        afternoon: [], evening: [], unscheduled: [],
      },
    });
    const sections = adaptTimelineSections(day, [], now, null, false, []);
    const titles = sections.flatMap((s) => s.events.map((e) => e.title));
    expect(titles).toContain('Untimed chore');
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

  it('renders every overdue task — no UI cap (Timeline column owns scrolling)', () => {
    const tasks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((d) => makeOverdueTask(d));
    const section = adaptOverdueSection(tasks, [], now);
    // The Timeline column has overflow-y-auto and handles long lists by
    // scroll; capping here would defeat the family's "let me reach all
    // overdue" intent.
    expect(section!.events).toHaveLength(12);
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
