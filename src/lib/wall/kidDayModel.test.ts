import { describe, it, expect } from 'vitest'
import { buildMemberDayModel, streakFor, bandForTime } from './kidDayModel'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { emptySections } from '@/lib/today/types'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import type { WallNotice } from '@/hooks/useWallData'

const KID = { id: 'kid-1', name: 'Kaleb' } as FamilyMember
const TODAY = new Date('2026-08-30T10:00:00') // a Sunday

let seq = 0
function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: `r-${++seq}`, user_id: 'u', name: 'Routine', description: null,
    default_assignee: null, assigned_to: KID.id, assigned_to_all: null,
    visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null,
    raw_input: null, show_on_timeline: true, scope: 'individual',
    // Every routine on this page is family-context in practice — kid
    // routines land here already filtered to the family layer (rule 2's
    // "rung-4-no-op" prefs). Set explicitly so each test isolates the rule
    // it's actually checking instead of tripping the domain-lens rung.
    context: 'family',
    created_at: '', updated_at: '',
    ...over,
  } as Routine
}
function inst(over: Partial<ActionableInstance> = {}): ActionableInstance {
  return {
    id: `i-${++seq}`, user_id: 'u', entity_type: 'routine', entity_id: 'r-1',
    date: '2026-08-30', status: 'pending', assignee: null,
    assigned_to_override: null, deferred_to: null, completed_at: null,
    skipped_at: null, progress: null, created_at: '', updated_at: '',
    ...over,
  } as ActionableInstance
}
function taskItem(over: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: `t-${++seq}`, type: 'task', title: 'Task', startTime: null, endTime: null,
    completed: false, assignedTo: KID.id,
    ...over,
  } as TimelineItem
}
function task(over: Partial<Task> = {}): Task {
  return {
    id: `k-${++seq}`, title: 'Needed thing', completed: false,
    createdAt: TODAY, updatedAt: TODAY,
    assignedTo: KID.id, context: 'family', category: 'task',
    ...over,
  } as Task
}
function build(
  routines: Routine[],
  history: ActionableInstance[] = [],
  items: Partial<Record<string, TimelineItem[]>> = {},
  neededTasks: Task[] = [],
  now: Date = TODAY,
  homeworkTasks: Task[] = [],
  notices: WallNotice[] = [],
) {
  return buildMemberDayModel({
    member: KID,
    date: TODAY,
    now,
    routines,
    history,
    todayItems: { ...emptySections<TimelineItem>(), ...items },
    neededTasks,
    homeworkTasks,
    notices,
  })
}

describe('buildMemberDayModel', () => {
  it('bands loose routines by effective time', () => {
    const morning = routine({ time_of_day: '07:30' })
    const afternoon = routine({ time_of_day: '14:00' })
    const evening = routine({ time_of_day: '19:00' })
    const anytime = routine({ time_of_day: null })
    const model = build([morning, afternoon, evening, anytime])
    expect(model.bands.morning.map((r) => r.id)).toEqual([morning.id])
    expect(model.bands.afternoon.map((r) => r.id)).toEqual([afternoon.id])
    expect(model.bands.evening.map((r) => r.id)).toEqual([evening.id])
    expect(model.bands.anytime.map((r) => r.id)).toEqual([anytime.id])
  })

  it('excludes routines owned by someone else', () => {
    const other = routine({ assigned_to: 'other-parent' })
    const model = build([other])
    expect(model.isEmpty).toBe(true)
    expect(model.bands.anytime).toEqual([])
  })

  it('shows a kid routine hidden by show_on_timeline=false', () => {
    const hidden = routine({ show_on_timeline: false, time_of_day: null })
    const model = build([hidden])
    expect(model.bands.anytime.map((r) => r.id)).toEqual([hidden.id])
  })

  it('hides resting and not-today routines', () => {
    const resting = routine({ visibility: 'reference' })
    const notToday = routine({ recurrence_pattern: { type: 'weekly', days: ['mon'] } })
    const model = build([resting, notToday])
    expect(model.isEmpty).toBe(true)
  })

  it('renders a collection with its applicable steps despite reference parent', () => {
    const parent = routine({ name: 'Morning Steps', visibility: 'reference', time_of_day: '07:00' })
    const step1 = routine({ name: 'Brush teeth', parent_routine_id: parent.id, time_of_day: null })
    const step2 = routine({ name: 'Get dressed', parent_routine_id: parent.id, time_of_day: null })
    const model = build([parent, step1, step2])
    expect(model.collections).toHaveLength(1)
    expect(model.collections[0]).toMatchObject({ id: parent.id, title: 'Morning Steps', timeOfDay: '07:00' })
    expect(model.collections[0].rows.map((r) => r.id).sort()).toEqual([step1.id, step2.id].sort())
    expect(model.collections[0].rows.every((r) => r.timeOfDay === '07:00')).toBe(true)
  })

  it('drops a collection whose steps none apply today', () => {
    const parent = routine({ name: 'Weekday Routine', visibility: 'reference', time_of_day: '07:00' })
    const step = routine({
      name: 'Only Mondays',
      parent_routine_id: parent.id,
      time_of_day: null,
      recurrence_pattern: { type: 'weekly', days: ['mon'] },
    })
    const model = build([parent, step])
    expect(model.collections).toHaveLength(0)
    expect(model.isEmpty).toBe(true)
  })

  it('marks done from today instance', () => {
    const done = routine({ name: 'Done Thing' })
    const pending = routine({ name: 'Pending Thing' })
    const history = [
      inst({ entity_id: done.id, date: '2026-08-30', status: 'completed' }),
      inst({ entity_id: pending.id, date: '2026-08-30', status: 'pending' }),
    ]
    const model = build([done, pending], history)
    expect(model.bands.anytime.find((r) => r.id === done.id)?.done).toBe(true)
    expect(model.bands.anytime.find((r) => r.id === pending.id)?.done).toBe(false)
  })

  it('builds target rows with progress from today instance', () => {
    // Not 'Read': a reading target is the page's own card (see kidDaySchool.test).
    const r = routine({ name: 'Piano', target_amount: 20, target_unit: 'minutes' })
    const history = [inst({ entity_id: r.id, date: '2026-08-30', status: 'pending', progress: 12 })]
    const model = build([r], history)
    const row = model.bands.anytime.find((x) => x.id === r.id)
    expect(row?.target).toEqual({
      amount: 20,
      unit: 'minutes',
      progress: 12,
      streak: streakFor(r, history, TODAY),
    })
  })

  it('assigned tasks band by section and never target', () => {
    // ids use the real adapter shape (taskToTimelineItem's `task-${task.id}`)
    // — the model must strip that prefix, so assertions check the raw id.
    const earlyTask = taskItem({ id: 'task-early' })
    const afternoonTask = taskItem({ id: 'task-aft' })
    const nightTask = taskItem({ id: 'task-night', completed: true })
    const unscheduledTask = taskItem({ id: 'task-unsched' })
    const othersTask = taskItem({ id: 'task-other', assignedTo: 'someone-else' })
    const model = build([], [], {
      earlyMorning: [earlyTask],
      afternoon: [afternoonTask],
      night: [nightTask],
      unscheduled: [unscheduledTask],
      morning: [othersTask],
    })
    expect(model.bands.morning.map((r) => r.id)).toEqual(['early'])
    expect(model.bands.afternoon.map((r) => r.id)).toEqual(['aft'])
    expect(model.bands.evening.map((r) => r.id)).toEqual(['night'])
    expect(model.bands.anytime.map((r) => r.id)).toEqual(['unsched'])
    expect(model.bands.evening.find((r) => r.id === 'night')?.done).toBe(true)
    expect(model.bands.morning.find((r) => r.id === 'early')?.target).toBeNull()
    expect(model.bands.morning.some((r) => r.id === 'other')).toBe(false)
  })

  it('strips the task- adapter prefix so KidRow.id is the raw task uuid', () => {
    const task = taskItem({ id: 'task-abc' })
    const model = build([], [], { morning: [task] })
    expect(model.bands.morning).toHaveLength(1)
    expect(model.bands.morning[0].id).toBe('abc')
  })

  it('isEmpty when nothing applies', () => {
    const model = build([])
    expect(model.isEmpty).toBe(true)
    expect(model.collections).toEqual([])
    expect(model.needed).toEqual([])
    expect(model.bands).toEqual({ morning: [], afternoon: [], evening: [], anytime: [] })
  })
})

describe('buildMemberDayModel — needed today', () => {
  const TOMORROW = new Date('2026-08-31T09:00:00')
  const EVENING = new Date('2026-08-30T18:00:00')

  it("lists this member's task needed on the viewed day", () => {
    const t = task({ id: 'n-1', title: 'Library book', neededOn: TODAY })
    const model = build([], [], {}, [t])
    expect(model.needed).toEqual([{ id: 'n-1', title: 'Library book', tomorrow: false }])
    expect(model.isEmpty).toBe(false)
  })

  it("excludes another member's needed task", () => {
    const t = task({ id: 'n-2', neededOn: TODAY, assignedTo: 'other-kid' })
    const model = build([], [], {}, [t])
    expect(model.needed).toEqual([])
    expect(model.isEmpty).toBe(true)
  })

  it('excludes a completed needed task', () => {
    const t = task({ id: 'n-3', neededOn: TODAY, completed: true })
    const model = build([], [], {}, [t])
    expect(model.needed).toEqual([])
  })

  it('excludes a task needed on another day entirely', () => {
    const t = task({ id: 'n-4', neededOn: new Date('2026-09-04T09:00:00') })
    const model = build([], [], {}, [t], EVENING)
    expect(model.needed).toEqual([])
  })

  it("omits tomorrow's needed task before 17:00", () => {
    const t = task({ id: 'n-5', title: 'Gym shoes', neededOn: TOMORROW })
    const model = build([], [], {}, [t], TODAY)
    expect(model.needed).toEqual([])
  })

  it("includes tomorrow's needed task from 17:00, flagged tomorrow", () => {
    const t = task({ id: 'n-6', title: 'Gym shoes', neededOn: TOMORROW })
    const model = build([], [], {}, [t], EVENING)
    expect(model.needed).toEqual([{ id: 'n-6', title: 'Gym shoes', tomorrow: true }])
  })

  it("puts today's needs before tomorrow's", () => {
    const later = task({ id: 'n-7', title: 'Gym shoes', neededOn: TOMORROW })
    const now = task({ id: 'n-8', title: 'Library book', neededOn: TODAY })
    const model = build([], [], {}, [later, now], EVENING)
    expect(model.needed.map((n) => n.id)).toEqual(['n-8', 'n-7'])
  })
})

describe('bandForTime', () => {
  it('null time of day is anytime', () => {
    expect(bandForTime(null)).toBe('anytime')
  })
  it('before noon is morning', () => {
    expect(bandForTime('11:59')).toBe('morning')
  })
  it('noon lands in afternoon', () => {
    expect(bandForTime('12:00')).toBe('afternoon')
  })
  it('just before 17:00 is still afternoon', () => {
    expect(bandForTime('16:59')).toBe('afternoon')
  })
  it('17:00 and later is evening', () => {
    expect(bandForTime('17:00')).toBe('evening')
  })
})

describe('streakFor', () => {
  const WEEKLY = { type: 'weekly' as const, days: ['sat', 'sun'] }

  it('counts consecutive met recurring days, skipping non-recurring days between them', () => {
    const r = routine({ recurrence_pattern: WEEKLY })
    const history = [
      inst({ entity_id: r.id, date: '2026-08-30', status: 'completed' }), // today, Sun
      inst({ entity_id: r.id, date: '2026-08-29', status: 'completed' }), // yesterday, Sat
    ]
    expect(streakFor(r, history, TODAY)).toBe(2)
  })

  it('an unmet today does not break the streak (the day is not over)', () => {
    const r = routine({ recurrence_pattern: WEEKLY })
    const history = [
      inst({ entity_id: r.id, date: '2026-08-29', status: 'completed' }), // yesterday, Sat
    ]
    expect(streakFor(r, history, TODAY)).toBe(1)
  })

  it('an unmet past recurring day breaks the streak', () => {
    const r = routine({ recurrence_pattern: WEEKLY })
    const history = [
      inst({ entity_id: r.id, date: '2026-08-30', status: 'completed' }), // today, met
      // 2026-08-29 (Sat) has no instance -> unmet -> breaks the walk here
      inst({ entity_id: r.id, date: '2026-08-23', status: 'completed' }), // older Sun, unreachable
    ]
    expect(streakFor(r, history, TODAY)).toBe(1)
  })

  it('non-recurring days between recurring ones are skipped, not counted or breaking', () => {
    const r = routine({ recurrence_pattern: WEEKLY })
    const history = [
      inst({ entity_id: r.id, date: '2026-08-30', status: 'completed' }),
      inst({ entity_id: r.id, date: '2026-08-29', status: 'completed' }),
      inst({ entity_id: r.id, date: '2026-08-28', status: 'pending' }), // Friday, not a recurring day
    ]
    expect(streakFor(r, history, TODAY)).toBe(2)
  })
})

describe('homework + notices', () => {
  it('lists open homework for the member, ordered, with due + notes', () => {
    const model = build([], [], {}, [], TODAY, [
      task({ id: 'h-undated', title: 'Reading log', category: 'homework' }),
      task({ id: 'h-late', title: 'Blue sheet', category: 'homework', neededOn: new Date('2026-08-28T00:00:00'), notes: 'Permission slip, $12' }),
      task({ id: 'h-other', title: 'Not mine', category: 'homework', assignedTo: 'kid-2' }),
      task({ id: 'h-done', title: 'Done', category: 'homework', completed: true }),
    ])
    expect(model.homework).toEqual([
      { id: 'h-late', title: 'Blue sheet', due: 'Late', late: true, notes: 'Permission slip, $12' },
      { id: 'h-undated', title: 'Reading log', due: null, late: false, notes: null },
    ])
    expect(model.isEmpty).toBe(false)
  })

  it('a homework task due today is NOT also a needed row', () => {
    const t = task({ id: 'h1', category: 'homework', neededOn: TODAY })
    const model = build([], [], {}, [t], TODAY, [t])
    expect(model.needed).toEqual([])
    expect(model.homework.map((h) => h.id)).toEqual(['h1'])
  })

  it('a homework task on the timeline is NOT also a band row', () => {
    const model = build([], [], { morning: [taskItem({ id: 'task-h1', title: 'HW', category: 'homework' })] }, [], TODAY,
      [task({ id: 'h1', title: 'HW', category: 'homework' })])
    expect(model.bands.morning).toEqual([])
    expect(model.homework).toHaveLength(1)
  })

  it('notices: mine or everyone, newest first; they never make the page non-empty', () => {
    const model = build([], [], {}, [], TODAY, [], [
      { id: 'n-old', familyMemberId: null, text: 'Old', senderLabel: 'School', receivedOn: new Date('2026-08-20T00:00:00') },
      { id: 'n-mine', familyMemberId: 'kid-1', text: 'PE is Tue/Thu', senderLabel: 'School', receivedOn: new Date('2026-08-29T00:00:00') },
      { id: 'n-other', familyMemberId: 'kid-2', text: 'Not mine', senderLabel: null, receivedOn: new Date('2026-08-29T00:00:00') },
    ])
    expect(model.notices.map((n) => n.id)).toEqual(['n-mine', 'n-old'])
    expect(model.isEmpty).toBe(true)
  })
})
