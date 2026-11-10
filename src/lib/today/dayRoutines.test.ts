import { describe, it, expect } from 'vitest'
import type { Routine } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import { splitDayRoutines, quietBands } from './dayRoutines'

const at = (h: number, m = 0) => new Date(2026, 10, 9, h, m)

function routine(id: string, h: number, m: number, over: Partial<Routine> = {}, item: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: `routine-${id}`, type: 'routine', title: id, startTime: at(h, m), endTime: null, completed: false,
    originalRoutine: { id, ...over } as Routine, ...item,
  } as TimelineItem
}
const event = (id: string, h: number) => ({ id: `event-${id}`, type: 'event', title: id, startTime: at(h), endTime: null, completed: false }) as TimelineItem
const task = (id: string, h: number) => ({ id: `task-${id}`, type: 'task', title: id, startTime: at(h), endTime: null, completed: false }) as TimelineItem
const ids = (xs: TimelineItem[]) => xs.map((x) => x.id)

describe('splitDayRoutines', () => {
  it('leaves events and tasks on the grid', () => {
    const { grid, checklist, quiet } = splitDayRoutines([event('boxing', 9), task('call', 10)], { placed: new Set() })
    expect(ids(grid)).toEqual(['event-boxing', 'task-call'])
    expect(checklist).toEqual([])
    expect(quiet).toEqual([])
  })

  it('moves a timed routine off the grid and onto the checklist', () => {
    const { grid, checklist } = splitDayRoutines([routine('school', 6, 45)], { placed: new Set() })
    expect(grid).toEqual([])
    expect(ids(checklist)).toEqual(['routine-school'])
  })

  it('keeps a routine pinned to the grid on the grid, and off the checklist', () => {
    const { grid, checklist, quiet } = splitDayRoutines([routine('dose', 7, 0, { show_on_day_grid: true })], { placed: new Set() })
    expect(ids(grid)).toEqual(['routine-dose'])
    expect(checklist).toEqual([])
    expect(quiet).toEqual([])
  })

  it('keeps a routine someone placed on this day on the grid', () => {
    const { grid, checklist } = splitDayRoutines([routine('library', 10, 0)], { placed: new Set(['library']) })
    expect(ids(grid)).toEqual(['routine-library'])
    expect(checklist).toEqual([])
  })

  it('draws a background routine in neither place, and still counts its time', () => {
    const { grid, checklist, quiet } = splitDayRoutines([routine('ffg', 17, 15, { background: true })], { placed: new Set() })
    expect(grid).toEqual([])
    expect(checklist).toEqual([])
    expect(ids(quiet)).toEqual(['routine-ffg'])
  })

  it('does not let a pin bring a background routine back', () => {
    const { grid, quiet } = splitDayRoutines([routine('ffg', 17, 15, { background: true, show_on_day_grid: true })], { placed: new Set() })
    expect(grid).toEqual([])
    expect(ids(quiet)).toEqual(['routine-ffg'])
  })

  it('counts checklist routines as taken time', () => {
    const { quiet } = splitDayRoutines([routine('school', 6, 45)], { placed: new Set() })
    expect(ids(quiet)).toEqual(['routine-school'])
  })

  it('reads a checklist of steps by its own routine', () => {
    const collection = routine('bed', 19, 30, {}, { id: 'routine-collection-bed', type: 'routine-collection' })
    expect(ids(splitDayRoutines([collection], { placed: new Set() }).checklist)).toEqual(['routine-collection-bed'])
    expect(ids(splitDayRoutines([collection], { placed: new Set(['bed']) }).grid)).toEqual(['routine-collection-bed'])
  })

  it('keeps each dose of a pinned routine on the grid', () => {
    const dose = routine('pt', 8, 0, { show_on_day_grid: true }, { id: 'routine-pt#1' })
    expect(ids(splitDayRoutines([dose], { placed: new Set() }).grid)).toEqual(['routine-pt#1'])
  })

  it('leaves a routine with a pending change card on the grid, where the card marks it', () => {
    const r = routine('school', 6, 45)
    const { grid, checklist } = splitDayRoutines([r], { placed: new Set(), keep: (x) => x.id === r.id })
    expect(ids(grid)).toEqual(['routine-school'])
    expect(checklist).toEqual([])
  })
})

describe('quietBands', () => {
  it('joins routines whose time overlaps into one band', () => {
    const bands = quietBands([routine('school', 6, 45), routine('jax', 7, 0)])
    expect(bands).toHaveLength(1)
    expect(bands[0]).toMatchObject({ count: 2, start: at(6, 45), end: at(7, 30) })
    expect(ids(bands[0].items)).toEqual(['routine-school', 'routine-jax'])
  })

  it('starts a new band across a gap', () => {
    const bands = quietBands([routine('school', 6, 45), routine('run', 8, 30)])
    expect(bands.map((b) => b.count)).toEqual([1, 1])
    expect(bands[1]).toMatchObject({ start: at(8, 30), end: at(9, 0) })
  })

  it('sorts by time and gives each band a stable id', () => {
    const bands = quietBands([routine('bed', 19, 30), routine('school', 6, 45)])
    expect(bands.map((b) => b.start)).toEqual([at(6, 45), at(19, 30)])
    expect(bands.map((b) => b.id)).toEqual(['quiet-routine-school', 'quiet-routine-bed'])
  })

  it('leaves out anything without a time', () => {
    expect(quietBands([routine('tidy', 0, 0, {}, { startTime: null })])).toEqual([])
  })
})
