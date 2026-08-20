import { describe, it, expect } from 'vitest';
import { adaptPersonLane, adaptLanes, mergeAlignedLanes } from './wallLanes';
import type { WallDayData } from '@/hooks/useWallData';
import type { TimelineItem } from '@/types/timeline';
import type { FamilyMember } from '@/types/family';

const DAY0 = new Date(2026, 7, 19); // Wed 2026-08-19
const at = (dayOffset: number, h: number, m = 0) =>
  new Date(2026, 7, 19 + dayOffset, h, m);

function member(id: string, name: string): FamilyMember {
  return { id, name, initials: name.slice(0, 2).toUpperCase() } as FamilyMember;
}

function item(
  id: string,
  startTime: Date | null,
  over: Partial<TimelineItem> = {},
): TimelineItem {
  return {
    id, title: id, type: 'event', startTime,
    endTime: null, completed: false, ...over,
  } as TimelineItem;
}

function day(
  dayOffset: number,
  sections: Partial<Record<string, TimelineItem[]>> = {},
): WallDayData {
  const date = new Date(2026, 7, 19 + dayOffset);
  return {
    date, isToday: dayOffset === 0, birthdays: [], milestones: [],
    items: {
      allday: [], unscheduled: [], morning: [],
      afternoon: [], evening: [], night: [], ...sections,
    },
  } as unknown as WallDayData;
}

const SCOTT = member('m-scott', 'Scott');
const IRIS = member('m-iris', 'Iris');

describe('adaptPersonLane', () => {
  const now = at(0, 9, 0);

  it("shows today's next item for the member, with a time", () => {
    const days = [
      day(0, { afternoon: [item('soccer', at(0, 15, 45), { assignedTo: 'm-scott', title: 'Soccer pickup' })] }),
    ];
    const lane = adaptPersonLane(SCOTT, days, now);
    expect(lane.label).toBe('Soccer pickup');
    expect(lane.time).toBe('3:45');
    expect(lane.meridiem).toBe('PM');
    expect(lane.dayLabel).toBeNull(); // today needs no day qualifier
    expect(lane.isToday).toBe(true);
  });

  it('ignores items assigned to somebody else', () => {
    const days = [
      day(0, { afternoon: [item('hers', at(0, 15, 0), { assignedTo: 'm-iris' })] }),
    ];
    expect(adaptPersonLane(SCOTT, days, now).label).not.toBe('hers');
  });

  it('skips items that already started', () => {
    const days = [
      day(0, {
        morning: [item('past', at(0, 8, 0), { assignedTo: 'm-scott', title: 'Past' })],
        evening: [item('later', at(0, 18, 0), { assignedTo: 'm-scott', title: 'Later' })],
      }),
    ];
    expect(adaptPersonLane(SCOTT, days, now).label).toBe('Later');
  });

  // The empty-lane failure mode: a person-lane wall dies if three of four
  // lanes read "—" on a quiet Saturday. A departure board shows tomorrow's
  // trains, so a lane falls forward through the week rather than going blank.
  it('falls forward to a later day when today holds nothing left', () => {
    const days = [
      day(0),
      day(1),
      day(2, { morning: [item('dentist', at(2, 10, 30), { assignedTo: 'm-scott', title: 'Dentist' })] }),
    ];
    const lane = adaptPersonLane(SCOTT, days, now);
    expect(lane.label).toBe('Dentist');
    expect(lane.dayLabel).toBe('Fri');
    expect(lane.isToday).toBe(false);
  });

  it('prefers today over a later day even when the later item is earlier in clock time', () => {
    const days = [
      day(0, { evening: [item('tonight', at(0, 19, 0), { assignedTo: 'm-scott', title: 'Tonight' })] }),
      day(1, { morning: [item('tmw', at(1, 7, 0), { assignedTo: 'm-scott', title: 'Tomorrow' })] }),
    ];
    expect(adaptPersonLane(SCOTT, days, now).label).toBe('Tonight');
  });

  // Matches adaptGlanceForMember's existing policy: the day's background
  // rhythm ("brush teeth") must never headline a person.
  it('skips everyday routines', () => {
    const days = [
      day(0, {
        morning: [item('teeth', at(0, 10, 0), {
          assignedTo: 'm-scott', title: 'Brush teeth', type: 'routine',
          recurrencePattern: { type: 'daily' },
        })],
        evening: [item('real', at(0, 18, 0), { assignedTo: 'm-scott', title: 'Real thing' })],
      }),
    ];
    expect(adaptPersonLane(SCOTT, days, now).label).toBe('Real thing');
  });

  it('never returns null — an empty week still yields a lane', () => {
    const lane = adaptPersonLane(SCOTT, [day(0), day(1)], now);
    expect(lane.memberId).toBe('m-scott');
    expect(lane.name).toBe('Scott');
    expect(lane.label).toBeNull();
    expect(lane.time).toBeNull();
    expect(lane.isEmpty).toBe(true);
  });

  it('renders an all-day item without a clock time', () => {
    const days = [
      day(0, { allday: [item('trip', null, { assignedTo: 'm-scott', title: 'Camping', allDay: true })] }),
    ];
    const lane = adaptPersonLane(SCOTT, days, now);
    expect(lane.label).toBe('Camping');
    expect(lane.time).toBeNull();
    expect(lane.allDay).toBe(true);
  });
});

  it('carries the one after next as a dim secondary', () => {
    const days = [day(0, {
      afternoon: [item('a', at(0, 15), { assignedTo: 'm-scott', title: 'First' })],
      evening: [item('b', at(0, 18), { assignedTo: 'm-scott', title: 'Second' })],
    })];
    const lane = adaptPersonLane(SCOTT, days, at(0, 9));
    expect(lane.label).toBe('First');
    expect(lane.then?.label).toBe('Second');
    expect(lane.then?.time).toBe('6:00');
  });

  it('reaches into a later day for the secondary when today has only one left', () => {
    const days = [
      day(0, { evening: [item('a', at(0, 18), { assignedTo: 'm-scott', title: 'Tonight' })] }),
      day(1, { morning: [item('b', at(1, 8), { assignedTo: 'm-scott', title: 'Tomorrow' })] }),
    ];
    const lane = adaptPersonLane(SCOTT, days, at(0, 9));
    expect(lane.then?.label).toBe('Tomorrow');
    expect(lane.then?.dayLabel).toBe('Thu');
  });

  it('has no secondary when the week holds only one thing', () => {
    const days = [day(0, { evening: [item('a', at(0, 18), { assignedTo: 'm-scott', title: 'Only' })] })];
    expect(adaptPersonLane(SCOTT, days, at(0, 9)).then).toBeNull();
  });

describe('mergeAlignedLanes', () => {
  const now = at(0, 9, 0);

  // The payoff of the "slot machine" isn't the animation — it's that the wall
  // stops printing the same dinner four times.
  it('merges when three or more lanes resolve to the same item', () => {
    const shared = (assignee: string) =>
      item('grandma', at(0, 17, 0), { assignedTo: assignee, title: "Grandma's" });
    const days = [day(0, { evening: ['a', 'b', 'c'].map((_, i) => shared(`m-${i}`)) })];
    const members = [member('m-0', 'A'), member('m-1', 'B'), member('m-2', 'C')];
    const lanes = adaptLanes(members, days, now);
    const merged = mergeAlignedLanes(lanes);
    expect(merged.aligned).toBe(true);
    expect(merged.label).toBe("Grandma's");
    expect(merged.memberIds).toEqual(['m-0', 'm-1', 'm-2']);
  });

  it('does not merge when only two lanes agree', () => {
    const days = [day(0, {
      evening: [
        item('x', at(0, 17, 0), { assignedTo: 'm-0', title: 'Same' }),
        item('y', at(0, 17, 0), { assignedTo: 'm-1', title: 'Same' }),
        item('z', at(0, 18, 0), { assignedTo: 'm-2', title: 'Different' }),
      ],
    })];
    const members = [member('m-0', 'A'), member('m-1', 'B'), member('m-2', 'C')];
    const merged = mergeAlignedLanes(adaptLanes(members, days, now));
    expect(merged.aligned).toBe(false);
  });

  it('does not merge empty lanes — four blanks are not an event', () => {
    const members = [member('m-0', 'A'), member('m-1', 'B'), member('m-2', 'C')];
    const merged = mergeAlignedLanes(adaptLanes(members, [day(0)], now));
    expect(merged.aligned).toBe(false);
  });
});

describe('adaptLanes', () => {
  it('returns one lane per member in member order, then the household lane', () => {
    const lanes = adaptLanes([SCOTT, IRIS], [day(0)], at(0, 9));
    expect(lanes.map((l) => l.name)).toEqual(['Scott', 'Iris', 'Everyone']);
  });

  // The household lane is for shared COMMITMENTS, not the chore backlog. An
  // unassigned task headlining "Everyone" put things like "clean the mould out
  // of the washing machine" in the wall's largest type; at-a-glance counts
  // open tasks instead, which is the right altitude for a chore.
  it('keeps unassigned tasks out of the household lane', () => {
    const days = [day(0, {
      evening: [item('mould', at(0, 18), { title: 'Clean the washing machine', type: 'task' })],
    })];
    const lanes = adaptLanes([SCOTT], days, at(0, 9));
    expect(lanes[lanes.length - 1].isEmpty).toBe(true);
    expect(lanes[0].isEmpty).toBe(true);
  });

  it('still gives the household lane shared calendar events', () => {
    const days = [day(0, {
      evening: [item('gm', at(0, 17), { title: "Dinner at Grandma's", type: 'event' })],
    })];
    const lanes = adaptLanes([SCOTT], days, at(0, 9));
    const household = lanes[lanes.length - 1];
    expect(household.name).toBe('Everyone');
    expect(household.label).toBe("Dinner at Grandma's");
  });

  it('is stable across days array identity — same data, same lane keys', () => {
    const days = [day(0, { evening: [item('e', at(0, 18), { assignedTo: 'm-scott', title: 'E' })] })];
    const a = adaptLanes([SCOTT], days, at(0, 9));
    const b = adaptLanes([SCOTT], days, at(0, 9));
    expect(a[0].itemId).toBe(b[0].itemId);
  });
});

// Guards the assumption the whole fall-forward rests on.
describe('data assumptions', () => {
  it('DAY0 is a Wednesday, so +2 is Friday', () => {
    expect(DAY0.getDay()).toBe(3);
  });
});
