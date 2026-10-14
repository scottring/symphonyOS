import { describe, expect, it } from 'vitest'
import { buildWeekRoutineItems } from '@/components/home/week/weekRoutineItems'
import { createMockRoutine } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { ChangeOp } from '@/lib/canvas/changeCard'
import type { Routine } from '@/types/actionable'
import { buildOccurrences, layoutPicture, type Occurrence } from './routinesPicture'
import { previewPicture } from './routinesPreview'

// Sat Oct 10 – Fri Oct 16, 2026.
const WEEK = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 10 + i))
const r = (id: string, name: string, over: Partial<Routine> = {}) => createMockRoutine({ id, name, time_of_day: null, recurrence_pattern: { type: 'daily' }, ...over })

const bed = r('bed', 'Kids bedtime routine', { time_of_day: '19:30' })
const ffg = r('ffg', 'FFG pickup', { time_of_day: '17:15', assigned_to_all: ['scott'], recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu'] } })
const run = r('run', 'Monday run', { time_of_day: '08:30', recurrence_pattern: { type: 'weekly', days: ['mon'] } })
const cut = r('cut', 'Kaleb haircut', { recurrence_pattern: { type: 'weekly', days: ['thu'] } })
const long = r('long', 'Iris long run', { time_of_day: '08:00', recurrence_pattern: { type: 'weekly', days: ['sun'] } })
const ROUTINES = [bed, ffg, run, cut, long]

function preview(ops: Omit<ChangeOp, 'key'>[]) {
  const items = buildWeekRoutineItems({ routines: ROUTINES, weekStart: WEEK[0], dayCount: 7, instances: [], prefs: { hideRoutines: false, layers: ALL_LAYERS } })
  const stepCounts = new Map<string, number>()
  const occurrences = buildOccurrences({ items, days: WEEK, instances: [], stepCounts })
  const set = { key: 's', title: 'changes', ops: ops.map((o, i) => ({ ...o, key: `s:${i}` }) as ChangeOp) }
  const p = previewPicture({ occurrences, set, days: WEEK, routines: new Map(ROUTINES.map((x) => [x.id, x])), stepCounts })
  const picture = layoutPicture({ routines: ROUTINES, occurrences: p.occurrences, days: WEEK, stepCounts, lineMarks: p.lineMarks, newChips: p.newChips })
  return { p, picture }
}
const cell = (pic: ReturnType<typeof preview>['picture'], day: number, routineId?: string) =>
  Object.values(pic.days[day].bands).flat().filter((o) => !routineId || o.routineId === routineId)
const show = (os: Occurrence[]) => os.map((o) => [o.title, o.preview ?? null, o.previewNote ?? null])

describe('previewPicture — this week only', () => {
  it('a skip strikes that one occurrence, dashed teal, even for an every-day routine', () => {
    const { picture } = preview([{ op: 'routine_skip', routineId: 'bed', title: 'Kids bedtime routine', date: '2026-10-16' }])
    const fri = cell(picture, 6)
    expect(show(fri)).toEqual([['Kids bedtime routine', 'proposed', 'Skipped · this week']])
    expect(fri[0].struck).toBe(true)
    expect(cell(picture, 5, 'bed')).toEqual([]) // Thursday: still only on the Every day line
  })

  it('a move leaves its day grey and lands teal on the new one, keeping its time', () => {
    const { picture } = preview([{ op: 'routine_move', routineId: 'ffg', title: 'FFG pickup', date: '2026-10-15', toDate: '2026-10-16' }])
    expect(show(cell(picture, 5, 'ffg'))).toEqual([['FFG pickup', 'leaving', 'Moving · this week']])
    const fri = cell(picture, 6, 'ffg')
    expect(show(fri)).toEqual([['FFG pickup', 'proposed', 'From Thu · this week']])
    expect(fri[0].time?.getHours()).toBe(17)
  })

  it('who: that day, dashed teal, with the new person', () => {
    const { picture } = preview([{ op: 'routine_who', routineId: 'ffg', title: 'FFG pickup', date: '2026-10-15', assignee: 'iris', assigneeName: 'Iris' }])
    const thu = cell(picture, 5, 'ffg')[0]
    expect([thu.preview, thu.people, thu.previewNote]).toEqual(['proposed', ['iris'], 'Iris · this week'])
    expect(cell(picture, 4, 'ffg')[0].preview).toBeUndefined() // Wednesday as usual
  })
})

describe('previewPicture — from now on', () => {
  it('new days and a new name: the old slot goes grey, the new one is teal on its day', () => {
    const { picture } = preview([{ op: 'routine_change', routineId: 'run', title: 'Monday run', name: 'Tuesday run', days: ['tue'] }])
    expect(show(cell(picture, 2, 'run'))).toEqual([['Monday run', 'leaving', null]])
    const tue = cell(picture, 3, 'run')
    expect(show(tue)).toEqual([['Tuesday run', 'proposed', null]])
    expect(tue[0].time?.getHours()).toBe(8)
  })

  it('a new time for an every-day routine: its chip goes grey and the new one is teal on the Every day line', () => {
    const { picture } = preview([{ op: 'routine_change', routineId: 'bed', title: 'Kids bedtime routine', time: '19:45' }])
    expect(picture.everyDay.map((c) => [c.title, c.preview ?? null, c.time?.getMinutes()])).toEqual([
      ['Kids bedtime routine', 'leaving', 30],
      ['Kids bedtime routine', 'proposed', 45],
    ])
    expect(picture.days.every((d) => Object.values(d.bands).flat().length === 0 || !Object.values(d.bands).flat().some((o) => o.routineId === 'bed'))).toBe(true)
  })

  it('an every-day routine moved to some days leaves its line and appears in those cells', () => {
    const { picture } = preview([{ op: 'routine_change', routineId: 'bed', title: 'Kids bedtime routine', days: ['sun', 'mon', 'tue', 'wed', 'thu'] }])
    expect(picture.everyDay.map((c) => c.preview)).toEqual(['leaving'])
    expect(show(cell(picture, 1, 'bed'))).toEqual([['Kids bedtime routine', 'proposed', null]]) // Sun
    expect(cell(picture, 0, 'bed')).toEqual([]) // Sat
  })

  it('who from now on: every slot grey, every new slot teal with the new people', () => {
    const { picture } = preview([{ op: 'routine_change', routineId: 'ffg', title: 'FFG pickup', assignees: ['iris'], assigneeNames: ['Iris'] }])
    const mon = cell(picture, 2, 'ffg')
    expect(mon.map((o) => [o.preview, o.people])).toEqual([['leaving', ['scott']], ['proposed', ['iris']]])
  })

  it('rest: its slots go grey with the date it wakes', () => {
    const { picture } = preview([{ op: 'routine_rest', routineId: 'long', title: 'Iris long run', until: '2026-11-01' }])
    expect(show(cell(picture, 1, 'long'))).toEqual([['Iris long run', 'leaving', 'Resting until Nov 1']])
  })

  it('add: teal on its days, or on the No day yet line when it has none', () => {
    const { picture } = preview([
      { op: 'routine_add', title: 'Reading time', days: ['sun', 'mon'], time: '19:00' },
      { op: 'routine_add', title: 'Clean the gutters' },
    ])
    expect(show(picture.days[1].bands.evening)).toEqual([['Reading time', 'proposed', null]])
    expect(picture.noDay.map((c) => [c.title, c.preview])).toEqual([['Clean the gutters', 'proposed']])
  })

  it('nothing pending, nothing drawn', () => {
    const items = buildWeekRoutineItems({ routines: ROUTINES, weekStart: WEEK[0], dayCount: 7, instances: [], prefs: { hideRoutines: false, layers: ALL_LAYERS } })
    const occurrences = buildOccurrences({ items, days: WEEK, instances: [], stepCounts: new Map() })
    const p = previewPicture({ occurrences, set: null, days: WEEK, routines: new Map(), stepCounts: new Map() })
    expect(p.occurrences).toBe(occurrences)
    expect(p.newChips).toEqual([])
  })
})
