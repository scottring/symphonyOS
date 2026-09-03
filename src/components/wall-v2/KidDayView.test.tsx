import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import type { WallNotice } from '@/hooks/useWallData'
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
const ledger = vi.hoisted(() => ({ syncEarned: vi.fn(async () => null) }))
vi.mock('./useReadingScreenTime', () => ({
  useReadingScreenTime: () => ledger,
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

function neededTask(over: Partial<Task> = {}): Task {
  const today = new Date()
  return {
    id: `k-${++seq}`, title: 'Needed thing', completed: false,
    createdAt: today, updatedAt: today,
    assignedTo: KID.id, context: 'family', category: 'task',
    neededOn: today,
    ...over,
  } as Task
}

function renderView(props: {
  routines?: Routine[]
  history?: ActionableInstance[]
  todayItems?: Partial<Record<string, TimelineItem[]>>
  neededTasks?: Task[]
  homeworkTasks?: Task[]
  notices?: WallNotice[]
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
      neededTasks={props.neededTasks ?? []}
      homeworkTasks={props.homeworkTasks ?? []}
      notices={props.notices ?? []}
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
    const r = routine({ name: 'Piano', target_amount: 20, target_unit: 'minutes' })
    const todayStr = dateStr(new Date())
    renderView({ routines: [r], history: [inst({ entity_id: r.id, date: todayStr, status: 'pending', progress: 12 })] })
    expect(screen.getByText('12 of 20 min')).toBeInTheDocument()
  })

  it('tapping a target row then +10 calls addProgress with (routine, id, date, 10, 20)', () => {
    const r = routine({ name: 'Piano', target_amount: 20, target_unit: 'minutes' })
    renderView({ routines: [r] })
    fireEvent.click(screen.getByText('Piano'))
    fireEvent.click(screen.getByText('+10'))
    expect(mocks.addProgress).toHaveBeenCalledWith('routine', r.id, expect.any(Date), 10, 20)
  })

  it('Exact… -> typing 18 -> Set calls setProgress(..., 18, 20)', () => {
    const r = routine({ name: 'Piano', target_amount: 20, target_unit: 'minutes' })
    renderView({ routines: [r] })
    fireEvent.click(screen.getByText('Piano'))
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

  it('task row tap calls onToggleTask(taskId, true/false) with a single task- prefix', () => {
    // id is in the real adapter shape (taskToTimelineItem's `task-${task.id}`)
    // — the model strips it and the view re-prefixes exactly once.
    const undone = taskItem({ id: 'task-uuid-1', title: 'Pack bag', completed: false })
    const { onToggleTask } = renderView({ todayItems: { morning: [undone] } })
    fireEvent.click(screen.getByText('Pack bag'))
    expect(onToggleTask).toHaveBeenCalledWith('task-uuid-1', true)
  })

  it('task row tap calls onToggleTask with false when already done', () => {
    const done = taskItem({ id: 'task-uuid-2', title: 'Feed fish', completed: true })
    const { onToggleTask } = renderView({ todayItems: { morning: [done] } })
    fireEvent.click(screen.getByText('Feed fish'))
    expect(onToggleTask).toHaveBeenCalledWith('task-uuid-2', false)
  })

  it('tapping a task row shows it done immediately (optimistic), before any refetch', () => {
    const undone = taskItem({ id: 'task-uuid-3', title: 'Walk dog', completed: false })
    renderView({ todayItems: { morning: [undone] } })
    const title = screen.getByText('Walk dog')
    expect(title.className).not.toContain('line-through')
    fireEvent.click(title)
    expect(screen.getByText('Walk dog').className).toContain('line-through')
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

describe('KidDayView — Needed today card', () => {
  it('renders the card with a tappable row for a task needed today', () => {
    renderView({ neededTasks: [neededTask({ id: 'need-1', title: 'Library book' })] })
    expect(screen.getByText('Needed today')).toBeInTheDocument()
    expect(screen.getByText('Library book')).toBeInTheDocument()
    expect(screen.queryByText('Nothing on your list — go play.')).not.toBeInTheDocument()
  })

  it('tapping a needed row completes it through onToggleTask, prefixed once', () => {
    const { onToggleTask } = renderView({
      neededTasks: [neededTask({ id: 'need-2', title: 'Gym shoes' })],
    })
    fireEvent.click(screen.getByText('Gym shoes'))
    expect(onToggleTask).toHaveBeenCalledWith('task-need-2', true)
  })

  it('shows no card when nothing is needed', () => {
    renderView()
    expect(screen.queryByText('Needed today')).not.toBeInTheDocument()
  })

  describe('after 5pm', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date('2026-08-30T18:00:00'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('groups a task needed tomorrow under a Tomorrow sub-heading', () => {
      renderView({
        neededTasks: [
          neededTask({ id: 'need-3', title: 'Library book', neededOn: new Date('2026-08-30T09:00:00') }),
          neededTask({ id: 'need-4', title: 'Swim kit', neededOn: new Date('2026-08-31T09:00:00') }),
        ],
      })
      expect(screen.getByText('Needed today')).toBeInTheDocument()
      expect(screen.getByText('Library book')).toBeInTheDocument()
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
      expect(screen.getByText('Swim kit')).toBeInTheDocument()
    })
  })
})

describe('Homework card', () => {
  it('renders rows with due text and checks off through onToggleTask', () => {
    const onToggleTask = vi.fn()
    renderView({ onToggleTask, homeworkTasks: [
      neededTask({ id: 'h1', title: 'Blue sheet', category: 'homework', neededOn: new Date() }),
    ] })
    expect(screen.getByText('Homework')).toBeInTheDocument()
    expect(screen.getByText('Due today')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark Blue sheet done' }))
    expect(onToggleTask).toHaveBeenCalledWith('task-h1', true)
  })

  it('expands notes on title tap', () => {
    renderView({ homeworkTasks: [
      neededTask({ id: 'h1', title: 'Blue sheet', category: 'homework', neededOn: undefined, notes: 'Permission slip, $12' }),
    ] })
    expect(screen.queryByText('Permission slip, $12')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Blue sheet' }))
    expect(screen.getByText('Permission slip, $12')).toBeInTheDocument()
  })

  it('does not render the card without homework', () => {
    renderView({})
    expect(screen.queryByText('Homework')).toBeNull()
  })
})

describe('From school card', () => {
  it('renders notices with sender and date, even on an otherwise empty page', () => {
    renderView({ notices: [
      { id: 'n1', familyMemberId: 'kid-1', text: 'PE is Tue/Thu', senderLabel: 'Hillside', receivedOn: new Date(2026, 8, 1) },
    ] })
    expect(screen.getByText('From school')).toBeInTheDocument()
    expect(screen.getByText('PE is Tue/Thu')).toBeInTheDocument()
    expect(screen.getByText('Hillside · Sep 1')).toBeInTheDocument()
    expect(screen.getByText(/go play/)).toBeInTheDocument()
  })
})

describe('KidDayView — the reading card', () => {
  beforeEach(() => { localStorage.clear(); ledger.syncEarned.mockClear(); mocks.addProgress.mockClear() })

  it('a Read target is its own card with a Start button, not a row in Anytime', () => {
    renderView({ routines: [routine({ name: 'Read', target_amount: 20, target_unit: 'minutes' })] })
    expect(screen.getByRole('button', { name: 'Start reading' })).toBeTruthy()
    expect(screen.queryByText('Anytime')).toBeNull()
  })

  it('+10 on the reading card logs progress AND moves the screen-time ledger to what it earned', () => {
    const r = routine({ name: 'Read', target_amount: 20, target_unit: 'minutes' })
    renderView({ routines: [r] })
    fireEvent.click(screen.getByText('+10'))
    expect(mocks.addProgress).toHaveBeenCalledWith('routine', r.id, expect.any(Date), 10, 20)
    expect(ledger.syncEarned).toHaveBeenCalledWith(KID.id, expect.any(String), 10)
    expect(screen.getByText('Screen time today')).toBeTruthy()
  })

  it('Start then Stop logs the minutes read, whole, at least one', () => {
    vi.useFakeTimers()
    try {
      const r = routine({ name: 'Read', target_amount: 20, target_unit: 'minutes' })
      renderView({ routines: [r] })
      fireEvent.click(screen.getByRole('button', { name: 'Start reading' }))
      expect(localStorage.length).toBe(1)
      vi.advanceTimersByTime(7 * 60_000 + 20_000)
      fireEvent.click(screen.getByRole('button', { name: 'Stop reading' }))
      expect(mocks.addProgress).toHaveBeenCalledWith('routine', r.id, expect.any(Date), 7, 20)
      expect(ledger.syncEarned).toHaveBeenCalledWith(KID.id, expect.any(String), 7)
      expect(localStorage.length).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('earned screen time is capped at the target', () => {
    const r = routine({ name: 'Read', target_amount: 20, target_unit: 'minutes' })
    renderView({ routines: [r], history: [inst({ entity_id: r.id, date: dateStr(new Date()), progress: 15 })] })
    fireEvent.click(screen.getByText('+10'))
    expect(ledger.syncEarned).toHaveBeenCalledWith(KID.id, expect.any(String), 20)
  })
})
