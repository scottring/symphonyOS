import { describe, it, expect } from 'vitest'
import { buildGroupedSections } from './grouping'
import type { Task } from '@/types/task'

const all = () => true
function task(p: Partial<Task>): Task {
  return { id: 'id', title: 't', completed: false, bucket: 'timed', scheduledFor: null, assignedTo: null,
    updatedAt: new Date(), subtasks: undefined, ...p } as Task
}

describe('buildGroupedSections', () => {
  it('groups a morning timed task into the morning section', () => {
    const t = task({ id: 't-m', title: 'AM', scheduledFor: new Date('2026-05-19T08:00:00') })
    const g = buildGroupedSections({
      timedTasks: [t], events: [], routines: [], viewedDate: new Date('2026-05-19T00:00:00'),
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: all,
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
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: all,
    })
    const titles = g.morning.map(i => i.title)
    expect(titles.indexOf('Child')).toBe(titles.indexOf('Parent') + 1)
  })
})

function noMatch() { return true }
const empty = new Map<string, any>()

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
    routineStatusMap: empty, eventStatusMap: empty, match: noMatch,
  })
  const all = Object.values(sections).flat()
  const wrapperIdx = all.findIndex(i => i.id === 'task-w1')
  const eventIdx = all.findIndex(i => i.id === 'event-evt1')
  expect(eventIdx).toBe(wrapperIdx + 1)
  expect(all[eventIdx].isSubtask).toBe(true)
  expect(all[eventIdx].parentTaskId).toBe('w1')
  expect(sections.morning?.filter(i => i.id === 'event-evt1' && !i.isSubtask)).toEqual([])
})

it('skips a dangling member ref (member not present)', () => {
  const date = new Date('2026-06-05T00:00:00Z')
  const wrapper = {
    id: 'w1', title: 'Morning', completed: false, isAllDay: true,
    scheduledFor: date, groupMembers: [{ type: 'event', id: 'gone' }],
  } as any
  const sections = buildGroupedSections({
    timedTasks: [wrapper], events: [], routines: [], viewedDate: date,
    routineStatusMap: empty, eventStatusMap: empty, match: noMatch,
  })
  expect(Object.values(sections).flat().filter(i => i.id === 'task-w1')).toHaveLength(1)
})
