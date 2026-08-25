import { describe, it, expect } from 'vitest'
import {
  computeAxis, adaptGanttBoard, MIN_SPAN_H, MAX_SPAN_H, MIN_LABEL_PX, TRACK_PX,
} from './wallGantt'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'

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

  it('never opens wider than the labelling limit, however long the day', () => {
    // The mockup's 7a-9p is 14h across ~810px: 58px/hour, five characters a
    // block. Capping the span is the whole reason labels survive.
    const axis = computeAxis([mins(9)], [mins(21)], at(9))
    expect((axis.endMin - axis.startMin) / 60).toBe(MAX_SPAN_H)
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
    expect(board.tracks[0].allDay).toEqual(['Book festival'])
    expect(board.tracks[0].blocks).toEqual([])
  })

  it('marks a finished block past, so it reads as context not commitment', () => {
    const board = adaptGanttBoard(members, [day([
      item({ id: 'done', title: 'Early', assignedTo: 'm-scott', startTime: at(8, 15), endTime: at(8, 45) }),
    ])], at(9, 30))
    expect(board.tracks[0].blocks[0].past).toBe(true)
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
    expect(board.tracks[0].allDay).toEqual(['Visual Art'])
    expect(board.tracks[1].allDay).toEqual(['PE'])
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
