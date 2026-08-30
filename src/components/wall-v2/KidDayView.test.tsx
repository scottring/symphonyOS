import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'
import { emptySections } from '@/lib/today/types'

const mocks = vi.hoisted(() => ({
  markDone: vi.fn(),
  undoDone: vi.fn(),
  addProgress: vi.fn(),
  setProgress: vi.fn(),
}))
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => mocks,
}))

const historyMock = vi.hoisted(() => ({
  current: { history: [] as ActionableInstance[], loading: false, refresh: vi.fn() },
}))
vi.mock('./useMemberInstanceHistory', () => ({
  useMemberInstanceHistory: () => historyMock.current,
}))

import { KidDayView } from './KidDayView'

const KID = { id: 'kid-1', name: 'Kaleb' } as FamilyMember

let seq = 0
function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: `r-${++seq}`, user_id: 'u', name: 'Routine', description: null,
    default_assignee: null, assigned_to: KID.id, assigned_to_all: null,
    visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'daily' }, time_of_day: null,
    raw_input: null, show_on_timeline: true, scope: 'individual',
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
// Local YYYY-MM-DD, matching kidDayModel's toDateStr — avoids UTC/local
// timezone mismatch that ISOString().slice(0, 10) would risk near midnight.
function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function renderView(props: {
  routines?: Routine[]
  history?: ActionableInstance[]
  todayItems?: Partial<Record<string, TimelineItem[]>>
  onToggleTask?: (id: string, completed: boolean) => void
  onClose?: () => void
} = {}) {
  historyMock.current.history = props.history ?? []
  const onToggleTask = props.onToggleTask ?? vi.fn()
  const onClose = props.onClose ?? vi.fn()
  render(
    <KidDayView
      member={KID}
      routines={props.routines ?? []}
      todayItems={{ ...emptySections<TimelineItem>(), ...(props.todayItems ?? {}) }}
      onToggleTask={onToggleTask}
      onClose={onClose}
    />,
  )
  return { onToggleTask, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  historyMock.current.history = []
  historyMock.current.loading = false
})

describe('KidDayView', () => {
  it('renders collection card title and step rows', () => {
    const parent = routine({ name: 'Morning Steps', visibility: 'reference', time_of_day: '07:00' })
    const step1 = routine({ name: 'Brush teeth', parent_routine_id: parent.id, time_of_day: null })
    const step2 = routine({ name: 'Get dressed', parent_routine_id: parent.id, time_of_day: null })
    renderView({ routines: [parent, step1, step2] })
    expect(screen.getByText('Morning Steps')).toBeInTheDocument()
    expect(screen.getByText('Brush teeth')).toBeInTheDocument()
    expect(screen.getByText('Get dressed')).toBeInTheDocument()
  })

  it('renders band headings only for non-empty bands', () => {
    const morning = routine({ name: 'Morning Thing', time_of_day: '07:30' })
    renderView({ routines: [morning] })
    expect(screen.getByText('Morning')).toBeInTheDocument()
    expect(screen.queryByText('Afternoon')).not.toBeInTheDocument()
    expect(screen.queryByText('Evening')).not.toBeInTheDocument()
    expect(screen.queryByText('Anytime')).not.toBeInTheDocument()
  })

  it('plain routine tap calls markDone with (routine, id, date)', () => {
    const plain = routine({ name: 'Feed cat' })
    renderView({ routines: [plain] })
    fireEvent.click(screen.getByText('Feed cat'))
    expect(mocks.markDone).toHaveBeenCalledWith('routine', plain.id, expect.any(Date))
    expect(mocks.undoDone).not.toHaveBeenCalled()
  })

  it('tapping a done row calls undoDone', () => {
    const plain = routine({ name: 'Feed cat' })
    const todayStr = dateStr(new Date())
    renderView({ routines: [plain], history: [inst({ entity_id: plain.id, date: todayStr, status: 'completed' })] })
    fireEvent.click(screen.getByText('Feed cat'))
    expect(mocks.undoDone).toHaveBeenCalledWith('routine', plain.id, expect.any(Date))
    expect(mocks.markDone).not.toHaveBeenCalled()
  })

  it('target row shows "12 of 20 min" given a history instance with progress: 12', () => {
    const r = routine({ name: 'Read', target_amount: 20, target_unit: 'minutes' })
    const todayStr = dateStr(new Date())
    renderView({ routines: [r], history: [inst({ entity_id: r.id, date: todayStr, status: 'pending', progress: 12 })] })
    expect(screen.getByText('12 of 20 min')).toBeInTheDocument()
  })

  it('tapping a target row then +10 calls addProgress with (routine, id, date, 10, 20)', () => {
    const r = routine({ name: 'Read', target_amount: 20, target_unit: 'minutes' })
    renderView({ routines: [r] })
    fireEvent.click(screen.getByText('Read'))
    fireEvent.click(screen.getByText('+10'))
    expect(mocks.addProgress).toHaveBeenCalledWith('routine', r.id, expect.any(Date), 10, 20)
  })

  it('Exact… -> typing 18 -> Set calls setProgress(..., 18, 20)', () => {
    const r = routine({ name: 'Read', target_amount: 20, target_unit: 'minutes' })
    renderView({ routines: [r] })
    fireEvent.click(screen.getByText('Read'))
    fireEvent.click(screen.getByText('Exact…'))
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '18' } })
    fireEvent.click(screen.getByText('Set'))
    expect(mocks.setProgress).toHaveBeenCalledWith('routine', r.id, expect.any(Date), 18, 20)
  })

  it('streak line renders "3 days in a row" given qualifying history, and not when streak < 2', () => {
    const r = routine({ name: 'Read', target_amount: 20, target_unit: 'minutes', recurrence_pattern: { type: 'daily' } })
    const today = new Date()
    const todayStr = dateStr(today)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = dateStr(yesterday)
    const twoDaysAgo = new Date(today)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const twoDaysAgoStr = dateStr(twoDaysAgo)
    renderView({
      routines: [r],
      history: [
        inst({ entity_id: r.id, date: todayStr, status: 'completed', progress: 20 }),
        inst({ entity_id: r.id, date: yesterdayStr, status: 'completed', progress: 20 }),
        inst({ entity_id: r.id, date: twoDaysAgoStr, status: 'completed', progress: 20 }),
      ],
    })
    expect(screen.getByText('3 days in a row')).toBeInTheDocument()
  })

  it('does not render a streak line when streak < 2', () => {
    const r = routine({ name: 'Read', target_amount: 20, target_unit: 'minutes' })
    const todayStr = dateStr(new Date())
    renderView({ routines: [r], history: [inst({ entity_id: r.id, date: todayStr, status: 'completed', progress: 20 })] })
    expect(screen.queryByText(/days in a row/)).not.toBeInTheDocument()
  })

  it('task row tap calls onToggleTask(taskId, true/false)', () => {
    const undone = taskItem({ id: 'task-uuid-1', title: 'Pack bag', completed: false })
    const { onToggleTask } = renderView({ todayItems: { morning: [undone] } })
    fireEvent.click(screen.getByText('Pack bag'))
    expect(onToggleTask).toHaveBeenCalledWith('task-task-uuid-1', true)
  })

  it('task row tap calls onToggleTask with false when already done', () => {
    const done = taskItem({ id: 'task-uuid-2', title: 'Feed fish', completed: true })
    const { onToggleTask } = renderView({ todayItems: { morning: [done] } })
    fireEvent.click(screen.getByText('Feed fish'))
    expect(onToggleTask).toHaveBeenCalledWith('task-task-uuid-2', false)
  })

  it('renders empty-state copy when the model is empty', () => {
    renderView()
    expect(screen.getByText('Nothing on your list — go play.')).toBeInTheDocument()
  })

  it('back button calls onClose', () => {
    const { onClose } = renderView()
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
