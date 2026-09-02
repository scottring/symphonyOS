import { describe, it, expect } from 'vitest'
import {
  computeAxis, adaptGanttBoard, titleForBlockId, MIN_SPAN_H, MAX_SPAN_H, MIN_LABEL_PX, TRACK_PX,
} from './wallGantt'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { Routine } from '@/types/actionable'
import { routineToTimelineItem } from '@/types/timeline'
import { effectiveTimeOfDay } from '@/lib/routineUtils'

const at = (h: number, m = 0) => new Date(2026, 7, 23, h, m)
const mins = (h: number, m = 0) => h * 60 + m

const member = (id: string, name: string): FamilyMember =>
  ({ id, name, user_id: 'u', initials: name.slice(0, 2), color: 'blue',
     avatar_url: null, is_full_user: true, display_order: 0, created_at: '' }) as FamilyMember

const item = (o: Partial<TimelineItem>): TimelineItem =>
  ({ id: Math.random().toString(36).slice(2), type: 'event', title: 'thing',
     startTime: null, endTime: null, completed: false, ...o }) as TimelineItem

/** Sections are real DaySection keys — the adapter walks PREVIEW_SECTIONS. */
const day = (items: TimelineItem[]): WallDayData =>
  ({
    date: at(0),
    isToday: true,
    items: {
      allday: items.filter((i) => i.allDay),
      morning: items.filter((i) => !i.allDay),
    },
    birthdays: [],
    milestones: [],
  }) as unknown as WallDayData

describe('computeAxis — the window is what makes a Gantt legible', () => {
  it('anchors one hour before now so the just-finished thing stays visible', () => {
    const axis = computeAxis([], [], at(9, 26))
    expect(axis.startMin).toBe(mins(8))
  })

  it('never opens wider than the cap, however long the day', () => {
    // From an 8am floor, an item running to midnight needs 16 hours.
    const axis = computeAxis([mins(9)], [mins(24)], at(9))
    expect((axis.endMin - axis.startMin) / 60).toBe(MAX_SPAN_H)
  })

  it('opens far enough to reach the evening, which the old 8h cap did not', () => {
    // The regression this cap change exists for: at 7:57am the window ran
    // 6a-2p, so an item at 4pm fell past the right edge and the row read
    // "Nothing scheduled" while showing "+1 later".
    const axis = computeAxis([mins(16)], [mins(17)], at(7, 57))
    expect(axis.startMin).toBe(mins(6))
    expect(axis.endMin).toBeGreaterThanOrEqual(mins(17))
  })

  it('never collapses narrower than the minimum on a quiet day', () => {
    const axis = computeAxis([mins(9)], [mins(9, 30)], at(9))
    expect((axis.endMin - axis.startMin) / 60).toBe(MIN_SPAN_H)
  })

  it('widens to cover what is still ahead, between those bounds', () => {
    // Window opens at 8a; content runs to 3p — seven hours, inside both bounds.
    const axis = computeAxis([mins(9)], [mins(15)], at(9))
    expect((axis.endMin - axis.startMin) / 60).toBe(7)
  })

  it('places now on the board, and reports null when it is off it', () => {
    const axis = computeAxis([], [], at(9))
    expect(axis.nowPct).toBeCloseTo((60 / (MIN_SPAN_H * 60)) * 100, 5)
    // 23:30 — the window is clamped at midnight, so now sits at the edge.
    expect(computeAxis([], [], at(23, 30)).nowPct).not.toBeNull()
  })

  it('labels ticks in kitchen time, not 24-hour', () => {
    const axis = computeAxis([], [], at(13))
    expect(axis.ticks[0].label).toBe('12p')
    expect(axis.ticks.map((t) => t.leftPct)[0]).toBe(0)
  })
})

describe('adaptGanttBoard', () => {
  const scott = member('m-scott', 'Scott')
  const members = [scott]

  it('positions a block as a share of the window', () => {
    // Window 8a-2p (6h). A 9a-10a block starts 1/6 in and is 1/6 wide.
    const board = adaptGanttBoard(members, [day([
      item({ id: 'shop', title: 'Food shopping', assignedTo: 'm-scott', startTime: at(9), endTime: at(10) }),
    ])], at(9, 30))

    const b = board.tracks[0].blocks[0]
    expect(b.leftPct).toBeCloseTo(100 / 6, 4)
    expect(b.widthPct).toBeCloseTo(100 / 6, 4)
  })

  it('puts a narrow block\'s label OUTSIDE rather than clipping it', () => {
    const board = adaptGanttBoard(members, [day([
      item({ id: 'q', title: 'Piano practice', assignedTo: 'm-scott', startTime: at(9), endTime: at(9, 30) }),
    ])], at(9))

    const b = board.tracks[0].blocks[0]
    expect((b.widthPct / 100) * TRACK_PX).toBeLessThan(MIN_LABEL_PX)
    expect(b.labelSide).toBe('right')
    expect((b.labelRoomPct / 100) * TRACK_PX).toBeGreaterThanOrEqual(MIN_LABEL_PX)
  })

  it('keeps a wide block\'s label inside', () => {
    const board = adaptGanttBoard(members, [day([
      item({ id: 'w', title: 'Food prep', assignedTo: 'm-scott', startTime: at(9), endTime: at(12) }),
    ])], at(9))
    expect(board.tracks[0].blocks[0].labelSide).toBe('in')
  })

  it('flips the label LEFT when the bar is up against the right edge', () => {
    // Window 8a-2p; a 1:30-2p block has nothing to its right to write into.
    const board = adaptGanttBoard(members, [day([
      item({ id: 'edge', title: 'Soccer drills', assignedTo: 'm-scott', startTime: at(13, 30), endTime: at(14) }),
    ])], at(9))
    expect(board.tracks[0].blocks[0].labelSide).toBe('left')
  })

  it('leaves the label inside when neither side has room', () => {
    // Two short blocks back to back, mid-track: nowhere to put either label.
    const board = adaptGanttBoard(members, [day([
      item({ id: 'a', title: 'One', assignedTo: 'm-scott', startTime: at(10), endTime: at(10, 30) }),
      item({ id: 'b', title: 'Two', assignedTo: 'm-scott', startTime: at(10, 30), endTime: at(11) }),
      item({ id: 'c', title: 'Three', assignedTo: 'm-scott', startTime: at(11), endTime: at(11, 30) }),
    ])], at(9, 30))
    expect(board.tracks[0].blocks[1].labelSide).toBe('in')
  })

  it('counts what falls past the right edge instead of dropping it silently', () => {
    const board = adaptGanttBoard(members, [day([
      item({ id: 'near', title: 'Now-ish', assignedTo: 'm-scott', startTime: at(9), endTime: at(10) }),
      item({ id: 'far', title: 'Late thing', assignedTo: 'm-scott', startTime: at(22), endTime: at(23) }),
    ])], at(8))

    const t = board.tracks[0]
    expect(t.blocks.map((b) => b.id)).toEqual(['near'])
    expect(t.laterCount).toBe(1)
  })

  it('clamps a block that straddles the left edge so it still reads as running', () => {
    const board = adaptGanttBoard(members, [day([
      item({ id: 'long', title: 'All morning', assignedTo: 'm-scott', startTime: at(6), endTime: at(11) }),
    ])], at(9))
    const b = board.tracks[0].blocks[0]
    expect(b.leftPct).toBe(0)
    expect(b.widthPct).toBeGreaterThan(0)
  })

  it('gives an untimed item a chip, since it has no position', () => {
    const board = adaptGanttBoard(members, [day([
      item({ id: 'ad', title: 'Book festival', assignedTo: 'm-scott', allDay: true, startTime: at(0) }),
    ])], at(9))
    expect(board.tracks[0].anytime).toEqual(['Book festival'])
    expect(board.tracks[0].blocks).toEqual([])
  })

  it('marks a finished block past, so it reads as context not commitment', () => {
    const board = adaptGanttBoard(members, [day([
      item({ id: 'done', title: 'Early', assignedTo: 'm-scott', startTime: at(8, 15), endTime: at(8, 45) }),
    ])], at(9, 30))
    expect(board.tracks[0].blocks[0].past).toBe(true)
  })

  it('carries isFree through to the block as `free`', () => {
    const board = adaptGanttBoard(members, [day([
      item({ id: 'ffg', title: 'FFG', assignedTo: 'm-scott', isFree: true, startTime: at(15), endTime: at(16) }),
    ])], at(9, 30))
    expect(board.tracks[0].blocks[0].free).toBe(true)
  })

  it('always ends with the household track, so shared items have a home', () => {
    const board = adaptGanttBoard(members, [day([])], at(9))
    expect(board.tracks.map((t) => t.name)).toEqual(['Scott', 'Everyone'])
  })

  it('survives a day with no data at all', () => {
    const board = adaptGanttBoard(members, [], at(9))
    expect(board.tracks.every((t) => t.blocks.length === 0)).toBe(true)
  })
})

describe('a gap holds one label, not two', () => {
  const scott = member('m-scott', 'Scott')

  it('does not let neighbouring blocks write into the same gap', () => {
    // Two short blocks with one wide gap between them: the first claims it
    // going right, so the second must not also claim it going left — that
    // rendered as "Free plaGANTT Piano practice" on the real board.
    const board = adaptGanttBoard([scott], [day([
      item({ id: 'a', title: 'Free play', assignedTo: 'm-scott', startTime: at(9), endTime: at(9, 30) }),
      item({ id: 'b', title: 'Piano practice', assignedTo: 'm-scott', startTime: at(12), endTime: at(12, 30) }),
    ])], at(8, 30))

    const [a, b] = board.tracks[0].blocks
    expect(a.labelSide).toBe('right')
    expect(b.labelSide).not.toBe('left')
  })
})

describe('a wide gap is shared rather than hogged', () => {
  const scott = member('m-scott', 'Scott')

  it('lets both neighbours label into a gap big enough for two', () => {
    // 10a-2p is four hours of an eight-hour window — ~405px, room for two
    // labels. Reserving it wholesale left the second bar truncating with
    // 400px of empty track beside it.
    const board = adaptGanttBoard([scott], [day([
      item({ id: 'a', title: 'Food shopping', assignedTo: 'm-scott', startTime: at(9), endTime: at(10) }),
      item({ id: 'b', title: 'Food prep', assignedTo: 'm-scott', startTime: at(14), endTime: at(15) }),
    ])], at(8, 30))

    const [a, b] = board.tracks[0].blocks
    expect(a.labelSide).toBe('right')
    expect(b.labelSide).toBe('left')
    // Half each, and each half still clears the readable minimum.
    expect((a.labelRoomPct / 100) * TRACK_PX).toBeGreaterThanOrEqual(MIN_LABEL_PX)
    expect((b.labelRoomPct / 100) * TRACK_PX).toBeGreaterThanOrEqual(MIN_LABEL_PX)
  })
})

describe('a rotation written on one row still reads per person', () => {
  // The real shared-calendar event, 2026-08-25. Both kids are named, so
  // attribution hands the SAME string to both tracks; without splitting it,
  // each chip renders "Specials — El…" and neither kid learns their special.
  const SPECIALS = 'Specials — Ella: Visual Art · Kaleb: PE'
  const KIDS = [member('ella', 'Ella'), member('kaleb', 'Kaleb')]

  it('gives each kid their own special, not the whole line', () => {
    const board = adaptGanttBoard(
      KIDS,
      [day([item({ title: SPECIALS, allDay: true })])],
      at(9),
    )
    expect(board.tracks[0].anytime).toEqual(['Visual Art'])
    expect(board.tracks[1].anytime).toEqual(['PE'])
  })

  it('leaves a genuinely shared commitment whole in both tracks', () => {
    const board = adaptGanttBoard(
      KIDS,
      [day([item({ title: 'School — Ella & Kaleb', startTime: at(9), endTime: at(14) })])],
      at(9),
    )
    expect(board.tracks[0].blocks[0].title).toBe('School — Ella & Kaleb')
    expect(board.tracks[1].blocks[0].title).toBe('School — Ella & Kaleb')
  })

  it('splits a timed block the same way', () => {
    const board = adaptGanttBoard(
      KIDS,
      [day([item({ title: 'Pickup · Ella: bus · Kaleb: aftercare', startTime: at(15) })])],
      at(14),
    )
    expect(board.tracks[0].blocks[0].title).toBe('bus')
    expect(board.tracks[1].blocks[0].title).toBe('aftercare')
  })
})

describe('what a row is allowed to draw', () => {
  const scott = member('s', 'Scott')
  const members = [scott]
  const household = (b: ReturnType<typeof adaptGanttBoard>) => b.tracks[b.tracks.length - 1]

  it('gives an unassigned task to the household row instead of dropping it', () => {
    // The lanes drop it on purpose — a chore must not headline a person in the
    // wall's largest type. A board row is not a headline.
    const t = item({ type: 'task', title: 'Wash bookbags', allDay: true })
    const board = adaptGanttBoard(members, [day([t])], at(9))
    expect(household(board).anytime).toContain('Wash bookbags')
    expect(board.tracks[0].anytime).not.toContain('Wash bookbags')
  })

  it('still drops an event that attribution deliberately excluded', () => {
    const e = item({
      type: 'event', title: 'Thanksgiving', allDay: true,
      originalEvent: { calendar_id: 'en.usa#holiday@group.v.calendar.google.com' },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([e])], at(9))
    for (const track of board.tracks) expect(track.anytime).not.toContain('Thanksgiving')
  })

  it('leaves an assigned one-off task under the person it belongs to', () => {
    const t = item({ type: 'task', title: 'Reference calls', assignedTo: 's', allDay: true })
    const board = adaptGanttBoard(members, [day([t])], at(9))
    expect(board.tracks[0].anytime).toContain('Reference calls')
    expect(household(board).anytime).not.toContain('Reference calls')
  })
})

describe('an everyday routine is words, not a bar', () => {
  const members = [member('s', 'Scott')]
  const last = (b: ReturnType<typeof adaptGanttBoard>) => b.tracks[b.tracks.length - 1]
  const routine = (title: string, h: number, m2 = 2) => item({
    type: 'routine', title, startTime: at(h), endTime: at(h, m2),
    recurrencePattern: { type: 'daily' },
  } as Partial<TimelineItem>)

  it('never draws one as a bar, however it is assigned', () => {
    // Measured on the real wall: these carry a nominal time and almost no
    // duration, so as bars they came out 1-3px wide, stacked at one x.
    const r = item({
      type: 'routine', title: 'Brush teeth', assignedTo: 's',
      startTime: at(20), endTime: at(20, 2), recurrencePattern: { type: 'daily' },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([r])], at(19))
    expect(last(board).anytime).toContain('Brush teeth')
    expect(last(board).blocks).toHaveLength(0)
    expect(board.tracks[0].anytime).not.toContain('Brush teeth')
  })

  it('reads the line in the order the day happens', () => {
    // Both inside the horizon, so this tests the ordering and nothing else.
    const board = adaptGanttBoard(members, [day([routine('Snack', 8), routine('Breakfast', 7)])], at(6))
    expect(last(board).anytime).toEqual(['Breakfast', 'Snack'])
  })

  it('drops one whose hour has already passed', () => {
    const board = adaptGanttBoard(members, [day([routine('Brush teeth', 6), routine('Snack', 9)])], at(8))
    expect(last(board).anytime).toEqual(['Snack'])
  })

  it('drops one whose hour is still hours away', () => {
    // The 7:53am board: six routines scheduled 18:00-19:06, eleven hours out,
    // filling the Everyone row at breakfast. A tag earns the row by being near.
    const board = adaptGanttBoard(
      members,
      [day([routine('Feed Jax dinner', 18), routine('Clean kitchen after dinner', 18, 45)])],
      at(7, 53),
    )
    expect(last(board).anytime).toEqual([])
  })

  it('lets the evening block in once it is near', () => {
    const board = adaptGanttBoard(members, [day([routine('Feed Jax dinner', 18)])], at(15, 30))
    expect(last(board).anytime).toEqual(['Feed Jax dinner'])
  })

  it('measures the horizon from now, not from the start of the window', () => {
    // The window opens an hour before now, so a rule written against
    // axis.startMin would quietly stretch to four hours.
    const board = adaptGanttBoard(members, [day([routine('Bedtime', 20)])], at(16, 30))
    expect(last(board).anytime).toEqual([])
    expect(last(adaptGanttBoard(members, [day([routine('Bedtime', 20)])], at(17, 30))).anytime)
      .toEqual(['Bedtime'])
  })

  it('holds an untimed weekly routine regardless — the horizon needs an hour to measure', () => {
    const weekly = item({
      type: 'routine', title: 'Do kitchen Laundry', startTime: null,
      recurrencePattern: { type: 'weekly', days: ['sat'] },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([weekly])], at(7, 53))
    expect(last(board).anytime).toContain('Do kitchen Laundry')
  })

  it('keeps an untimed TASK regardless — an unfinished task still stands', () => {
    const t = item({ type: 'task', title: 'Wash bookbags', allDay: true })
    const board = adaptGanttBoard(members, [day([t])], at(20))
    expect(last(board).anytime).toContain('Wash bookbags')
  })

  it('drops an everyday routine that carries no time at all', () => {
    // The 7:33pm wall read "Eat breakfast · Read · Out the door · Camp
    // dropoff" on the Everyone row. Those are Steps of a 7am collection whose
    // own time_of_day is null, so the looks-forward rule below could never
    // reach them: an untimed item sorts at MAX_SAFE_INTEGER, which is never
    // "already passed". A daily habit with no hour cannot be still ahead of
    // you, so it is not a tag.
    const untimed = item({
      type: 'routine', title: 'Pack bags', startTime: null,
      recurrencePattern: { type: 'daily' },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([untimed])], at(19))
    expect(last(board).anytime).not.toContain('Pack bags')
  })

  it('keeps an untimed routine that is NOT everyday — on its day it IS the day', () => {
    // "Do kitchen Laundry", weekly:sat, no time. On a Saturday that is the
    // day's distinguishing work, not background, and it stands all day.
    const weekly = item({
      type: 'routine', title: 'Do kitchen Laundry', startTime: null,
      recurrencePattern: { type: 'weekly', days: ['sat'] },
    } as Partial<TimelineItem>)
    const board = adaptGanttBoard(members, [day([weekly])], at(19))
    expect(last(board).anytime).toContain('Do kitchen Laundry')
  })

  it('does not let an item that will never be drawn stretch the window', () => {
    const real = item({ type: 'event', title: 'Dentist', startTime: at(9), endTime: at(10) })
    const board = adaptGanttBoard(members, [day([routine('Bedtime', 21), real])], at(9))
    expect((board.axis.endMin - board.axis.startMin) / 60).toBe(MIN_SPAN_H)
  })
})

describe('a Step of a routine collection, end to end', () => {
  // History: this originally tested a narrower fix for the 7:33pm bug — the
  // step showed on the Everyone row's anytime line before its collection
  // hour and disappeared after. Task 8a's fix round 1 superseded that: the
  // wall has no collection renderer to hand a step to (buildCollectionItem /
  // groupRoutineSteps are Today/RhythmPage-only), so itemsFor now drops any
  // item whose originalRoutine.parent_routine_id is set, before the
  // looks-forward rule ever runs. A step is DROPPED, not relocated — so it
  // must never appear, at ANY hour, not just after its collection's hour has
  // passed.
  const members = [member('s', 'Scott')]
  const last = (b: ReturnType<typeof adaptGanttBoard>) => b.tracks[b.tracks.length - 1]

  const collection = { id: 'p', name: 'Camp Mornings', time_of_day: '07:00:00',
    parent_routine_id: null } as unknown as Routine
  const step = { id: 's1', name: 'Eat breakfast', time_of_day: null, parent_routine_id: 'p',
    recurrence_pattern: { type: 'daily' }, context: 'family', assigned_to: null } as unknown as Routine

  const boardAt = (now: Date) => {
    const byId = new Map([[collection.id, collection]])
    const resolved = { ...step, time_of_day: effectiveTimeOfDay(step, byId) }
    return adaptGanttBoard(members, [day([routineToTimelineItem(resolved, at(0))])], now)
  }

  it('never appears before its collection hour either — dropped, not merely time-gated', () => {
    expect(last(boardAt(at(6))).anytime).not.toContain('Eat breakfast')
  })

  it('never appears in the evening — still true, now for a different reason than before', () => {
    expect(last(boardAt(at(19, 33))).anytime).not.toContain('Eat breakfast')
  })
})

describe('collection steps never draw on the live board (Task 8a fix round 1)', () => {
  // The bug this closes: itemsFor used to read day.items[section] directly
  // and never checked parent_routine_id. A Step whose OWN recurrence is not
  // "everyday" (e.g. inherited into a specific week, not daily) has a real
  // startTime once effectiveTimeOfDay inherits its collection's hour, so it
  // slipped past isAnytimeItem and drew as a genuine timed BAR — a step in
  // the wall's most prominent surface, and a bar nobody could tap
  // successfully (the tap-lookup array, built separately by
  // adaptTimelineSections, already dropped it — see wallV2Adapter's
  // dedupeRoutines — so a tap silently did nothing).
  const scott = member('m-scott', 'Scott');
  const members = [scott];

  const parentRoutine = {
    id: 'camp', name: 'Camp Mornings', time_of_day: '09:00:00', parent_routine_id: null,
    recurrence_pattern: { type: 'weekly', days: ['mon'] }, context: 'family', assigned_to: 'm-scott',
  } as unknown as Routine;
  const stepRoutine = {
    id: 'brush', name: 'Brush teeth', time_of_day: null, parent_routine_id: 'camp',
    // Deliberately NOT 'daily' — this is the shape that used to slip past
    // isAnytimeItem and draw as a bar. A daily step was already caught by
    // the "everyday routine" anytime-line rule; this is the gap that rule
    // could not close.
    recurrence_pattern: { type: 'weekly', days: ['mon'] }, context: 'family', assigned_to: 'm-scott',
  } as unknown as Routine;

  it('a step never draws a bar or an anytime chip; its collection PARENT still draws', () => {
    const byId = new Map([[parentRoutine.id, parentRoutine]]);
    const resolvedStep = { ...stepRoutine, time_of_day: effectiveTimeOfDay(stepRoutine, byId) };
    const stepItem = routineToTimelineItem(resolvedStep, at(0));
    const parentItem = routineToTimelineItem(parentRoutine, at(0));

    const board = adaptGanttBoard(members, [day([stepItem, parentItem])], at(9, 30));
    const track = board.tracks[0];
    const allTitles = board.tracks.flatMap((t) => [...t.blocks.map((b) => b.title), ...t.anytime]);

    // Positive control: the parent (parent_routine_id: null) is unaffected by
    // this fix and still draws — specifically as a BAR, proving the board
    // still renders real timed routines through this exact path.
    expect(track.blocks.map((b) => b.title)).toContain('Camp Mornings');
    // The step: gone from bars AND the anytime line, not merely relocated.
    expect(allTitles).not.toContain('Brush teeth');
  });
});

describe('multi-owner attribution reaches every board row (Task 8a fix round 1)', () => {
  // The live path for change 4: wallLanes.ownersOf, called through
  // wallGantt.boardOwnersOf -> itemsFor. wallLanes.adaptPersonLane/adaptLanes
  // (tested in wallParity.test.ts) has no production caller today — this is
  // the coverage that actually protects the wall.
  const scott = member('m-scott', 'Scott');
  const iris = member('m-iris', 'Iris');
  const members = [scott, iris];

  it('a routine assigned to two people draws in BOTH their rows, not just the legacy single assignee', () => {
    const shared = {
      id: 'dog', name: 'Walk the dog', time_of_day: '09:00:00', parent_routine_id: null,
      recurrence_pattern: { type: 'weekly', days: ['mon'] }, context: 'family',
      assigned_to: 'm-scott', assigned_to_all: ['m-scott', 'm-iris'],
    } as unknown as Routine;
    const sharedItem = routineToTimelineItem(shared, at(0));
    // Sanity check on the fixture itself, not the thing under test.
    expect(sharedItem.owners).toEqual(['m-scott', 'm-iris']);

    const board = adaptGanttBoard(members, [day([sharedItem])], at(9, 30));

    // Positive control: assignedTo alone ('m-scott') would only ever satisfy
    // Scott's row. Iris's row also drawing it proves boardOwnersOf reads
    // `owners`, not just the legacy single-column assignedTo.
    expect(board.tracks[0].blocks.map((b) => b.title)).toContain('Walk the dog');
    expect(board.tracks[1].blocks.map((b) => b.title)).toContain('Walk the dog');
  });
});

describe('the board is TODAY', () => {
  const members = [member('s', 'Scott')]
  const last = (b: ReturnType<typeof adaptGanttBoard>) => b.tracks[b.tracks.length - 1]

  it('reads the unscheduled section, which PREVIEW_SECTIONS leaves out', () => {
    // An untimed task scheduled for today lives in 'unscheduled'. It can't be
    // "the next thing" in a preview, but it IS scheduled for today, so it
    // belongs on the board's untimed line.
    const d = {
      date: at(0), isToday: true,
      items: { unscheduled: [item({ type: 'task', title: 'Finish the trip cleanup' })] },
      birthdays: [], milestones: [],
    } as unknown as WallDayData
    const board = adaptGanttBoard(members, [d], at(17))
    expect(last(board).anytime).toContain('Finish the trip cleanup')
  })

  it('draws only the day it was given — days[1..] never leak onto it', () => {
    // The adapter takes the whole week (the lanes need it) and must use only
    // days[0]. A time axis across more than one day is a calendar.
    const today = day([item({ title: 'Today thing', startTime: at(10), endTime: at(11) })])
    const tomorrow = day([item({ title: 'Tomorrow thing', startTime: at(10), endTime: at(11) })])
    const board = adaptGanttBoard(members, [today, tomorrow], at(9))
    const titles = board.tracks.flatMap((t) => [...t.blocks.map((b) => b.title), ...t.anytime])
    expect(titles).toContain('Today thing')
    expect(titles).not.toContain('Tomorrow thing')
  })
})

describe('titleForBlockId — the tap-handler fallback', () => {
  const members = [member('s', 'Scott'), member('k', 'Kaleb')]

  it('finds a block by id on another member\'s track, and returns null for an id no track carries', () => {
    const d = day([
      item({ id: 'dentist-1', title: 'Dentist', startTime: at(10), endTime: at(11), assignedTo: 's' }),
      item({ id: 'game-1', title: 'Soccer game', startTime: at(14), endTime: at(15), assignedTo: 'k' }),
    ])
    const board = adaptGanttBoard(members, [d], at(9))

    // Positive control on the SAME board: an id that is on the board is found
    // regardless of which track it lives on.
    expect(titleForBlockId(board, 'dentist-1')).toBe('Dentist')
    expect(titleForBlockId(board, 'game-1')).toBe('Soccer game')

    // An id nothing drew a bar for (the real-world case this fallback exists
    // for) comes back null rather than throwing or matching the wrong block.
    expect(titleForBlockId(board, 'no-such-id')).toBeNull()
  })
})
