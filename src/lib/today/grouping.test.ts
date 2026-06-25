import { describe, it, expect } from 'vitest'
import { buildGroupedSections } from './grouping'
import type { Task } from '@/types/task'

const matchAll = () => true
const empty = new Map<string, any>()
function task(p: Partial<Task>): Task {
  return { id: 'id', title: 't', completed: false, bucket: 'timed', scheduledFor: null, assignedTo: null,
    updatedAt: new Date(), subtasks: undefined, ...p } as Task
}

describe('buildGroupedSections', () => {
  it('groups a morning timed task into the morning section', () => {
    const t = task({ id: 't-m', title: 'AM', scheduledFor: new Date('2026-05-19T08:00:00') })
    const g = buildGroupedSections({
      timedTasks: [t], events: [], routines: [], viewedDate: new Date('2026-05-19T00:00:00'),
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: matchAll,
    })
    expect(g.morning.map(i => i.title)).toContain('AM')
    expect(g.evening).toEqual([])
  })

  it('places a subtask immediately after its parent within a section', () => {
    const parent = task({ id: 'p', title: 'Parent', scheduledFor: new Date('2026-05-19T08:00:00'),
      subtasks: [task({ id: 'c', title: 'Child', scheduledFor: new Date('2026-05-19T08:30:00') })] as Task[] })
    const child = (parent.subtasks as Task[])[0]
    const g = buildGroupedSections({
      timedTasks: [parent, child], events: [], routines: [], viewedDate: new Date('2026-05-19T00:00:00'),
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: matchAll,
    })
    const titles = g.morning.map(i => i.title)
    expect(titles.indexOf('Child')).toBe(titles.indexOf('Parent') + 1)
  })

  it('relocates a grouped event under its wrapper, across sections', () => {
    const date = new Date('2026-06-05T00:00:00Z')
    const wrapper = {
      id: 'w1', title: 'Morning', completed: false, isAllDay: true,
      scheduledFor: date, groupMembers: [{ type: 'event', id: 'evt1' }],
    } as any
    const event = {
      id: 'evt1', google_event_id: 'evt1', title: 'Standup',
      start_time: '2026-06-05T09:00:00Z', end_time: '2026-06-05T09:15:00Z', all_day: false,
    } as any
    const sections = buildGroupedSections({
      timedTasks: [wrapper], events: [event], routines: [], viewedDate: date,
      routineStatusMap: empty, eventStatusMap: empty, match: matchAll,
    })
    const flat = Object.values(sections).flat()
    const wrapperIdx = flat.findIndex(i => i.id === 'task-w1')
    const eventIdx = flat.findIndex(i => i.id === 'event-evt1')
    expect(eventIdx).toBe(wrapperIdx + 1)
    expect(flat[eventIdx].isSubtask).toBe(true)
    expect(flat[eventIdx].parentTaskId).toBe('w1')
    expect(sections.morning?.filter(i => i.id === 'event-evt1' && !i.isSubtask)).toEqual([])
  })

  it('relocates a grouped routine under its wrapper, across sections', () => {
    const date = new Date('2026-06-05T00:00:00Z')
    const wrapper = {
      id: 'w1', title: 'Morning', completed: false, isAllDay: true,
      scheduledFor: date, groupMembers: [{ type: 'routine', id: 'rt1' }],
    } as any
    const routine = {
      id: 'rt1', name: 'Workout', time_of_day: '09:00',
      recurrence_pattern: { type: 'daily' }, assigned_to: null,
    } as any
    const sections = buildGroupedSections({
      timedTasks: [wrapper], events: [], routines: [routine], viewedDate: date,
      routineStatusMap: empty, eventStatusMap: empty, match: matchAll,
    })
    const flat = Object.values(sections).flat()
    const wrapperIdx = flat.findIndex(i => i.id === 'task-w1')
    const routineIdx = flat.findIndex(i => i.id === 'routine-rt1')
    expect(routineIdx).toBe(wrapperIdx + 1)
    expect(flat[routineIdx].isSubtask).toBe(true)
    expect(flat[routineIdx].parentTaskId).toBe('w1')
    expect(sections.morning?.filter(i => i.id === 'routine-rt1' && !i.isSubtask)).toEqual([])
  })

  it('dosed routine yields one timeline item per dose, completion per slot', () => {
    const date = new Date('2026-06-24T00:00:00Z')
    const r = {
      id: 'rx', name: 'Median nerve glide', time_of_day: null,
      recurrence_pattern: { type: 'daily' }, assigned_to: null, assigned_to_all: null,
      times_per_day: ['09:00', '18:00'],
    } as any
    const inst = { entity_id: 'rx#0', status: 'completed', routine_id: 'rx' } as any
    const sections = buildGroupedSections({
      timedTasks: [], events: [], routines: [r], viewedDate: date,
      routineStatusMap: new Map([['rx#0', inst]]),
      eventStatusMap: new Map(), match: matchAll,
    })
    const items = Object.values(sections).flat().filter((i) => i.type === 'routine' && i.title === 'Median nerve glide')
    expect(items.map((i) => i.id).sort()).toEqual(['routine-rx#0', 'routine-rx#1'])
    expect(items.find((i) => i.id === 'routine-rx#0')!.completed).toBe(true)
    expect(items.find((i) => i.id === 'routine-rx#1')!.completed).toBeFalsy()
  })

  it('non-dosed routine still produces a single routine-<id> item (back-compat)', () => {
    const date = new Date('2026-06-24T00:00:00Z')
    const r = {
      id: 'r1', name: 'Morning stretch', time_of_day: '07:00',
      recurrence_pattern: { type: 'daily' }, assigned_to: null, assigned_to_all: null,
      times_per_day: null,
    } as any
    const sections = buildGroupedSections({
      timedTasks: [], events: [], routines: [r], viewedDate: date,
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: matchAll,
    })
    const items = Object.values(sections).flat().filter((i) => i.type === 'routine' && i.title === 'Morning stretch')
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('routine-r1')
  })

  it('a collection renders as one routine-collection item; steps are not top-level', () => {
    const date = new Date('2026-06-24T00:00:00')
    const hep = { id: 'hep', user_id: 'u', name: 'Shoulder HEP', recurrence_pattern: { type: 'daily' },
      parent_routine_id: null, assigned_to: null, assigned_to_all: null, show_on_timeline: true } as any
    const step = { id: 'chin', user_id: 'u', name: 'Chin Tuck', recurrence_pattern: { type: 'daily' },
      parent_routine_id: 'hep', times_per_day: ['09:00'], assigned_to: null, assigned_to_all: null, show_on_timeline: true } as any
    const g = buildGroupedSections({
      timedTasks: [], events: [], routines: [hep, step], viewedDate: date,
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: matchAll,
    })
    const flat = Object.values(g).flat()
    const coll = flat.filter(i => i.type === 'routine-collection')
    expect(coll.map(i => i.id)).toEqual(['routine-collection-hep'])
    // the step does NOT appear as its own top-level routine item
    expect(flat.some(i => i.id === 'routine-chin#0')).toBe(false)
    // the step lives nested in the collection (one exercise group, its doses inside)
    expect(coll[0].collectionSteps?.map(s => s.name)).toEqual(['Chin Tuck'])
    expect(coll[0].collectionSteps?.[0].doses.map(d => d.id)).toEqual(['routine-chin#0'])
  })

  it('a standalone routine still renders unchanged (backward-compat)', () => {
    const date = new Date('2026-06-24T00:00:00')
    const solo = { id: 'solo', user_id: 'u', name: 'Take meds', recurrence_pattern: { type: 'daily' },
      parent_routine_id: null, time_of_day: '08:00', assigned_to: null, assigned_to_all: null, show_on_timeline: true } as any
    const g = buildGroupedSections({
      timedTasks: [], events: [], routines: [solo], viewedDate: date,
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: matchAll,
    })
    const flat = Object.values(g).flat()
    expect(flat.find(i => i.type === 'routine')?.id).toBe('routine-solo')
    expect(flat.some(i => i.type === 'routine-collection')).toBe(false)
  })

  it('skips a dangling member ref (member not present)', () => {
    const date = new Date('2026-06-05T00:00:00Z')
    const wrapper = {
      id: 'w1', title: 'Morning', completed: false, isAllDay: true,
      scheduledFor: date, groupMembers: [{ type: 'event', id: 'gone' }],
    } as any
    const sections = buildGroupedSections({
      timedTasks: [wrapper], events: [], routines: [], viewedDate: date,
      routineStatusMap: empty, eventStatusMap: empty, match: matchAll,
    })
    expect(Object.values(sections).flat().filter(i => i.id === 'task-w1')).toHaveLength(1)
  })
})
