import { describe, it, expect } from 'vitest'
import { selectDayPlan, type DayPlanInput } from './dayPlan'
import { computeTodayData } from './computeTodayData'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'
import { ALL_LAYERS } from '@/lib/domains'
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { Task } from '@/types/task'

// Saturday Sep 19, 2026 — a weekend, the day the overload was reported.
const SAT = new Date(2026, 8, 19, 10, 0)
const SAT_YMD = '2026-09-19'
const WEEK = new Date(2026, 8, 13) // Sunday week start

function input(over: Partial<DayPlanInput> = {}): DayPlanInput {
  return {
    tasks: [], routines: [], dateInstances: [], viewedDate: SAT,
    selectedAssignee: [], hideRoutines: false, layers: ALL_LAYERS, weekStart: WEEK,
    ...over,
  }
}

function inst(entityId: string, over: Partial<ActionableInstance> = {}): ActionableInstance {
  return {
    id: `i-${entityId}`, user_id: 'u', entity_type: 'routine', entity_id: entityId, date: SAT_YMD,
    status: 'pending', assignee: null, assigned_to_override: null, deferred_to: null,
    completed_at: null, skipped_at: null, progress: null, created_at: '', updated_at: '',
    ...over,
  }
}

const weekend = (over: Partial<Routine>) => createMockRoutine({
  time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat', 'sun'] }, ...over,
})

describe('selectDayPlan — dated vs chosen tasks', () => {
  const dated = (over: Partial<Task> = {}) => createMockTask({
    id: 'd1', title: 'Pick up foot meds', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 19), ...over,
  })

  it('an untimed task merely DATED today waits in "Scheduled today" — a commitment, counted, off the main list', () => {
    const plan = selectDayPlan(input({ tasks: [dated()] }))
    expect(plan.scheduled.map((e) => e.title)).toEqual(['Pick up foot meds'])
    expect(plan.scheduled[0]).toMatchObject({ planned: false, group: 'scheduled' })
    expect(plan.offMainTaskIds.has('d1')).toBe(false)
    expect(plan.counts.scheduled).toBe(1)
  })

  it('once CHOSEN for today it is on the main list, and marked planned (not unfinished) in its group', () => {
    const plan = selectDayPlan(input({ tasks: [dated({ plannedOn: new Date(2026, 8, 19) })] }))
    expect(plan.offMainTaskIds.has('d1')).toBe(false)
    expect(plan.scheduled[0].planned).toBe(true)
    expect(plan.counts.scheduled).toBe(0)
  })

  it('a choice made for yesterday has expired — the date, not a flag, decides', () => {
    const plan = selectDayPlan(input({ tasks: [dated({ plannedOn: new Date(2026, 8, 18) })] }))
    expect(plan.offMainTaskIds.has('d1')).toBe(false)
    expect(plan.counts.scheduled).toBe(1)
  })

  it('a time is a commitment the main list keeps — never sent to the pin', () => {
    const plan = selectDayPlan(input({ tasks: [dated({ isAllDay: false, scheduledFor: new Date(2026, 8, 19, 14, 0) })] }))
    expect(plan.scheduled).toEqual([])
    expect(plan.offMainTaskIds.size).toBe(0)
  })

  it('a week-list task chosen for today joins the main list and KEEPS its week membership', () => {
    const t = createMockTask({ id: 'w1', title: 'Book the plumber', bucket: 'week', weekStart: WEEK, plannedOn: new Date(2026, 8, 19) })
    const plan = selectDayPlan(input({ tasks: [t] }))
    expect(plan.plannedExtraTasks.map((x) => x.id)).toEqual(['w1'])
    expect(plan.week).toEqual([expect.objectContaining({ id: 'w1', planned: true })])
    expect(t.bucket).toBe('week')
  })

  it('each entry appears once, in its most specific group', () => {
    const plan = selectDayPlan(input({
      tasks: [
        dated(),
        createMockTask({ id: 'w1', title: 'Week thing', bucket: 'week', weekStart: WEEK }),
        createMockTask({ id: 'm1', title: 'Month thing', bucket: 'month', monthStart: new Date(2026, 8, 1) }),
      ],
    }))
    const keys = [...plan.scheduled, ...plan.available, ...plan.week, ...plan.month].map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(plan.week.map((e) => e.id)).toEqual(['w1'])
    expect(plan.month.map((e) => e.id)).toEqual(['m1'])
  })
})

describe('selectDayPlan — routine occurrences', () => {
  it('an untimed weekend routine is AVAILABLE today, not expanded onto the main list', () => {
    const plan = selectDayPlan(input({ routines: [weekend({ id: 'r1', name: 'Kids clean rooms' })] }))
    expect(plan.available.map((e) => e.title)).toEqual(['Kids clean rooms'])
    expect(plan.offMainRoutineItemIds.has('routine-r1')).toBe(true)
    expect(plan.counts.available).toBe(1)
  })

  it('choosing the occurrence (its instance, not the routine) puts it on the main list', () => {
    const plan = selectDayPlan(input({
      routines: [weekend({ id: 'r1', name: 'Kids clean rooms' })],
      dateInstances: [inst('r1', { planned_on: SAT_YMD })],
    }))
    expect(plan.offMainRoutineItemIds.size).toBe(0)
    expect(plan.available[0].planned).toBe(true)
  })

  it('a done occurrence reads done and is not counted as outstanding', () => {
    const plan = selectDayPlan(input({
      routines: [weekend({ id: 'r1' })],
      dateInstances: [inst('r1', { status: 'completed' })],
    }))
    expect(plan.available[0].completed).toBe(true)
    expect(plan.counts.available).toBe(0)
  })

  it('a timed routine and a tracked obligation stay on the main list', () => {
    const plan = selectDayPlan(input({
      routines: [
        weekend({ id: 't', name: 'Timed', time_of_day: '19:30:00' }),
        weekend({ id: 'pt', name: 'PT exercises', pin_to_timeline: true }),
      ],
    }))
    expect(plan.available).toEqual([])
  })

  // Scott's Today screenshot showed "Food planning" both at 7:30 PM and in
  // Anytime: two different routines (weekend untimed, and Saturday 7:30 PM).
  // Distinct occurrences are never merged by title.
  it('two routines with the same title are two occurrences', () => {
    const plan = selectDayPlan(input({
      routines: [
        weekend({ id: 'fp-weekend', name: 'Food planning' }),
        weekend({ id: 'fp-sat', name: 'Food planning', time_of_day: '19:30:00', recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
      ],
    }))
    expect(plan.available.map((e) => e.id)).toEqual(['fp-weekend'])
    const today = computeTodayData({ ...input(), events: [], routines: [
      weekend({ id: 'fp-weekend', name: 'Food planning' }),
      weekend({ id: 'fp-sat', name: 'Food planning', time_of_day: '19:30:00', recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
    ] })
    const mainRoutines = Object.values(today.grouped).flat().filter((i) => i.type === 'routine')
    expect(mainRoutines.map((i) => i.id)).toEqual(['routine-fp-sat'])
  })

  it('does not turn hidden daily routines back on', () => {
    const daily = createMockRoutine({ id: 'd', name: 'Brush teeth', time_of_day: null, recurrence_pattern: { type: 'daily' } })
    expect(selectDayPlan(input({ routines: [daily], hideRoutines: true })).available).toEqual([])
    expect(selectDayPlan(input({ routines: [daily], hideRoutines: false })).available.map((e) => e.id)).toEqual(['d'])
  })

  it('an occurrence moved to another day is not today\'s at all', () => {
    const plan = selectDayPlan(input({
      routines: [weekend({ id: 'r1' })],
      dateInstances: [inst('r1', { status: 'deferred', deferred_to: new Date(2026, 8, 20, 9).toISOString() })],
    }))
    expect(plan.available).toEqual([])
  })

  it('a biweekly routine is available on its week and absent on the off week', () => {
    const biweekly = createMockRoutine({
      id: 'bw', name: 'Wash the car', time_of_day: null,
      recurrence_pattern: { type: 'weekly', days: ['sat'], interval: 2, start_date: '2026-09-05' },
    })
    expect(selectDayPlan(input({ routines: [biweekly] })).available.map((e) => e.id)).toEqual(['bw'])
    const offWeek = new Date(2026, 8, 12, 10, 0)
    expect(selectDayPlan(input({ routines: [biweekly], viewedDate: offWeek })).available).toEqual([])
  })
})

describe('selectDayPlan — filters apply to rows AND counts', () => {
  it('the assignee lens narrows both, and counts match the rows shown', () => {
    const plan = selectDayPlan(input({
      selectedAssignee: ['me'],
      tasks: [
        createMockTask({ id: 'mine', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 19), assignedTo: 'me' }),
        createMockTask({ id: 'theirs', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 19), assignedTo: 'iris' }),
      ],
      routines: [weekend({ id: 'r-mine', assigned_to: 'me' }), weekend({ id: 'r-theirs', assigned_to: 'iris' })],
    }))
    expect(plan.scheduled.map((e) => e.id)).toEqual(['mine'])
    expect(plan.available.map((e) => e.id)).toEqual(['r-mine'])
    expect(plan.counts).toEqual({ scheduled: 1, available: 1 })
  })

  it('a routine in an unchecked life area is neither shown nor counted', () => {
    const plan = selectDayPlan(input({
      layers: new Set(['personal']) as never,
      routines: [weekend({ id: 'w', context: 'work' }), weekend({ id: 'p', context: 'personal' })],
    }))
    expect(plan.available.map((e) => e.id)).toEqual(['p'])
    expect(plan.counts.available).toBe(1)
  })
})

describe('computeTodayData — the main list is the chosen day', () => {
  const base = { ...input(), events: [], selectedAssignee: [] }

  // Scott, 2026-09-21: Today shows what you scheduled for today plus what you
  // chose. A dated task is on the page without being chosen again; focus
  // marks the row and orders it first, it never gates visibility.
  it('draws dated, chosen and timed work; a dated-only task is on the page too, and chosen rows lead', () => {
    const d = computeTodayData({
      ...base,
      tasks: [
        createMockTask({ id: 'dated', title: 'Dated only', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 19) }),
        createMockTask({ id: 'chosen', title: 'Chosen', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 19), plannedOn: new Date(2026, 8, 19) }),
        createMockTask({ id: 'timed', title: 'At two', bucket: 'timed', isAllDay: false, scheduledFor: new Date(2026, 8, 19, 14) }),
        createMockTask({ id: 'week', title: 'From the week list', bucket: 'week', weekStart: WEEK, plannedOn: new Date(2026, 8, 19) }),
      ],
    })
    const titles = Object.values(d.grouped).flat().map((i) => i.title)
    expect(titles).toEqual(expect.arrayContaining(['Chosen', 'Dated only', 'At two', 'From the week list']))
    // Focus is marked on the row itself, so the journal can lead with it.
    const chosen = Object.values(d.grouped).flat().find((i) => i.title === 'Chosen')
    const datedOnly = Object.values(d.grouped).flat().find((i) => i.title === 'Dated only')
    expect(chosen?.focused).toBe(true)
    expect(datedOnly?.focused).toBeUndefined()
    // A chosen week-list task has no time invented for it.
    expect(d.grouped.unscheduled.map((i) => i.title)).toContain('From the week list')
    // Nothing dated is kept off the page.
    expect(d.dayPlan.offMainTaskIds.size).toBe(0)
  })

  it('an untimed routine occurrence chosen for the day renders once, and the pin marks it planned', () => {
    const d = computeTodayData({
      ...base,
      routines: [weekend({ id: 'r1', name: 'Family reading time' })],
      dateInstances: [inst('r1', { planned_on: SAT_YMD })],
    })
    expect(Object.values(d.grouped).flat().filter((i) => i.title === 'Family reading time')).toHaveLength(1)
    expect(d.dayPlan.available).toEqual([expect.objectContaining({ id: 'r1', planned: true })])
  })

  it('a carried-over task chosen for today is not drawn twice', () => {
    const now = new Date()
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); yesterday.setHours(0, 0, 0, 0)
    const today = new Date(now); today.setHours(0, 0, 0, 0)
    const t = createMockTask({ id: 'c', title: 'Carried', bucket: 'timed', isAllDay: true, scheduledFor: yesterday, plannedOn: today })
    const d = computeTodayData({ ...base, viewedDate: now, tasks: [t] })
    expect(d.overdueTasks).toEqual([])
    expect(Object.values(d.grouped).flat().filter((i) => i.title === 'Carried')).toHaveLength(1)
  })
})

describe('toPlan — the week list stays whole (guided planning, Phase 2)', () => {
  const onWeek = (over: Partial<Task>) => createMockTask({ bucket: 'week', weekStart: WEEK, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }], ...over })

  it('a row picked for today stays on the list, marked planned', () => {
    const t = onWeek({ id: 'w1', title: 'Book the plumber', bucket: 'timed', scheduledFor: new Date(2026, 8, 19), isAllDay: true,
      focus: [{ userId: 'me', date: new Date(2026, 8, 19) }] })
    const plan = selectDayPlan(input({ tasks: [t], userId: 'me' }))
    expect(plan.toPlan.map((e) => [e.id, e.planned])).toEqual([['w1', true]])
  })

  it('a ticked row stays on the list, completed', () => {
    const t = onWeek({ id: 'w2', title: 'Done thing', completed: true, commitments: [{ level: 'week', periodStart: WEEK, status: 'done' }] })
    const plan = selectDayPlan(input({ tasks: [t] }))
    expect(plan.toPlan.map((e) => [e.id, e.completed])).toEqual([['w2', true]])
  })

  it('a row given a day this week stays, with its day as context', () => {
    const t = onWeek({ id: 'w3', bucket: 'timed', scheduledFor: new Date(2026, 8, 17), isAllDay: true })
    const plan = selectDayPlan(input({ tasks: [t] }))
    expect(plan.toPlan[0]).toMatchObject({ id: 'w3', context: 'Thu' })
  })

  it('a month task copied down says where it came from', () => {
    const t = onWeek({ id: 'w4', commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }, { level: 'month', periodStart: new Date(2026, 8, 1), status: 'open' }] })
    expect(selectDayPlan(input({ tasks: [t] })).toPlan[0].context).toBe('from September')
  })

  it('a goal is never on the week list', () => {
    const g = onWeek({ id: 'g', isGoal: true })
    expect(selectDayPlan(input({ tasks: [g] })).toPlan).toEqual([])
  })
})

// Today's chooser (Scott via Codex, 2026-09-22): this week's tasks, and the
// day's routine occurrences in their own section — the flexible ones to
// choose, the timed ones already on the day (marked, never offered twice),
// and weekly routines with no day yet. Present even when the week is empty.
describe('chooser — this week\'s tasks and today\'s routines', () => {
  const onWeek = (over: Partial<Task>) => createMockTask({ bucket: 'week', weekStart: WEEK, commitments: [{ level: 'week', periodStart: WEEK, status: 'open' }], ...over })

  it('the tasks are the week list, whole — chosen and ticked rows stay', () => {
    const chosen = onWeek({ id: 'w1', title: 'Book the plumber', focus: [{ userId: 'me', date: SAT }] })
    const done = onWeek({ id: 'w2', title: 'Done thing', completed: true, commitments: [{ level: 'week', periodStart: WEEK, status: 'done' }] })
    const plan = selectDayPlan(input({ tasks: [chosen, done], userId: 'me' }))
    expect(plan.chooserTasks.map((e) => [e.id, e.planned, e.completed])).toEqual([['w1', true, false], ['w2', false, true]])
    expect(plan.chooserTasks.every((e) => e.kind === 'task')).toBe(true)
  })

  it('a flexible occurrence is offered with its cadence; a chosen one stays, marked', () => {
    const plan = selectDayPlan(input({
      routines: [weekend({ id: 'r1', name: 'Kids clean rooms' }), weekend({ id: 'r2', name: 'Family reading time' })],
      dateInstances: [inst('r2', { planned_on: SAT_YMD })],
    }))
    expect(plan.chooserRoutines.map((e) => [e.id, e.planned, e.onToday ?? false, e.context])).toEqual([
      ['r1', false, false, 'Weekly routine'],
      ['r2', true, false, 'Weekly routine'],
    ])
  })

  it('a timed occurrence is on today by its own rule: listed once, marked, with its time — never offered', () => {
    const plan = selectDayPlan(input({
      routines: [
        weekend({ id: 't', name: 'Boxing', time_of_day: '09:00:00' }),
        weekend({ id: 'pt', name: 'PT exercises', pin_to_timeline: true }),
      ],
    }))
    const boxing = plan.chooserRoutines.find((e) => e.id === 't')
    expect(boxing).toMatchObject({ onToday: true, planned: true, context: 'Weekly routine · 9a' })
    expect(plan.chooserRoutines.filter((e) => e.id === 't')).toHaveLength(1)
    expect(plan.chooserRoutines.find((e) => e.id === 'pt')).toMatchObject({ onToday: true })
    // The main list still draws them; the available (choosable) list does not.
    expect(plan.available).toEqual([])
  })

  it('routines stay when the week\'s list is empty; a routine with no day of its own is last', () => {
    const unhomed = createMockRoutine({ id: 'u', name: 'Pack the bike bags', time_of_day: null, recurrence_pattern: { type: 'weekly', days: [] } })
    const plan = selectDayPlan(input({ routines: [weekend({ id: 'r1', name: 'Kids clean rooms' })], unhomedRoutines: [unhomed] }))
    expect(plan.chooserTasks).toEqual([])
    expect(plan.chooserRoutines.map((e) => e.id)).toEqual(['r1', 'u'])
    expect(plan.chooserRoutines[1]).toMatchObject({ routine: unhomed, context: 'Weekly routine · no set day' })
  })
})
