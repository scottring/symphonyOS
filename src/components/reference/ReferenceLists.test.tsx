import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Link, useLocation } from 'react-router-dom'
import { ReferenceListsProvider } from './ReferenceListsContext'
import { ReferenceListControls, ReferenceListsDock } from './ReferenceLists'
import type { Task } from '@/types/task'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

const data = vi.hoisted(() => ({ tasks: [] as Task[], allow: true, push: vi.fn(), update: vi.fn(), complete: vi.fn(), remove: vi.fn(async () => {}), removeRoutine: vi.fn(async () => true) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: data.tasks, loading: false, updateTask: data.update, updateTasksBulk: vi.fn(), pushTask: data.push, toggleTask: data.complete, deleteTask: data.remove }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ getCurrentUserMember: () => ({ id: 'me' }) }) }))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ layers: new Set(['personal']) }) }))
vi.mock('@/hooks/useGatedTaskActions', async (importOriginal) => ({ ...await importOriginal<typeof import('@/hooks/useGatedTaskActions')>(), useGatedTaskActions: () => ({ updateTask: data.update, pushTask: async (...args: unknown[]) => { if (!data.allow) return false; await data.push(...args); return true } }) }))
function task(id: string, bucket: 'week' | 'month' | 'timed', extra = {}): Task {
  return { id, title: id, bucket, context: 'personal', completed: false, createdAt: new Date(), updatedAt: new Date(), ...extra } as Task
}
function Page() {
  const location = useLocation()
  return <><Link to="/notes">Notes page</Link><Link to="/week">Week page</Link><p>{location.pathname}</p><ReferenceListControls /><ReferenceListsDock /></>
}
function mount(userId = 'one', initial = '/today') {
  return render(<MemoryRouter initialEntries={[initial]}><ReferenceListsProvider userId={userId}><Page /></ReferenceListsProvider></MemoryRouter>)
}
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks(); data.allow = true
  data.tasks = [task('Book a service visit', 'week'), task('Read a book', 'month')]
})
afterEach(() => vi.useRealTimers())

describe('Pinned reference lists', () => {
  it('keeps both lists alongside a different page without writing or navigating on pin', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Pin week list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin month list' }))
    fireEvent.click(screen.getByText('Notes page'))
    expect(screen.getByText('/notes')).toBeInTheDocument()
    expect(screen.getByText('Book a service visit')).toBeInTheDocument()
    expect(screen.getByText('Read a book')).toBeInTheDocument()
    expect(data.push).not.toHaveBeenCalled(); expect(data.update).not.toHaveBeenCalled(); expect(data.complete).not.toHaveBeenCalled()
  })
  it('restores period pins for the same user, never another account', () => {
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin month list' })); view.unmount()
    const restored = mount(); expect(screen.getByText('Read a book')).toBeInTheDocument(); restored.unmount()
    mount('two'); expect(screen.queryByText('Read a book')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('symphony-reference-lists:one')).not.toContain('Read a book')
  })
  it('uses domain, assignee and period filtering', () => {
    data.tasks.push(task('Private work', 'week', { context: 'work' }), task('Someone else', 'week', { assignedTo: 'other' }), task('Future month', 'month', { monthStart: new Date(2099, 0, 1) }))
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin week list' })); fireEvent.click(screen.getByRole('button', { name: 'Pin month list' }))
    expect(screen.queryByText('Private work')).not.toBeInTheDocument()
    expect(screen.queryByText('Someone else')).not.toBeInTheDocument()
    expect(screen.queryByText('Future month')).not.toBeInTheDocument()
  })
  // "Do today" is the Today command (S4): dated today AND chosen. The week
  // commitment stays — a date never erases it (placement module).
  it('chooses actual today only on explicit action, keeps the week list, and stays on the current page', async () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin week list' })); fireEvent.click(screen.getByText('Notes page'))
    fireEvent.click(screen.getByRole('button', { name: 'Do today' }))
    await waitFor(() => expect(data.update).toHaveBeenCalledTimes(1))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    expect(data.push).toHaveBeenCalledWith('Book a service visit', today)
    expect(data.update).toHaveBeenCalledWith('Book a service visit', { plannedOn: today })
    expect(screen.getByText('/notes')).toBeInTheDocument()
  })
  it('does not resolve a cancelled placement, and reports failed saves', async () => {
    // A month row's "This week" is a placement: it goes through the gate.
    data.allow = false; mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin month list' }))
    fireEvent.click(screen.getByRole('button', { name: 'This week' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'This week' })).toBeEnabled())
    expect(data.push).not.toHaveBeenCalled()
    data.allow = true
    fireEvent.click(screen.getByRole('button', { name: 'Pin week list' }))
    data.update.mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Do today' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save'))
    expect(screen.getByRole('button', { name: 'Do today' })).toBeEnabled()
  })
  // Carried fix (Phase 2 follow-up): the pinned Week list reads the same
  // `weekListTasks` definition the week page does, so a row picked for
  // today (bucket flips to 'timed', the week commitment record stays open)
  // is still on the pin — the old `selectHorizonPool` pool question was
  // `bucket === 'week'` only, and dropped it the moment it was picked.
  it('keeps a row picked for today (bucket: timed, week commitment record) on the pinned week list', () => {
    const week = weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)
    data.tasks.push(task('Pick up dry cleaning', 'timed', { commitments: [{ level: 'week', periodStart: week, status: 'open' }] }))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Pin week list' }))
    expect(screen.getByText('Pick up dry cleaning')).toBeInTheDocument()
  })
  it('does not draw a second copy of a list the page is already showing', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Pin week list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin month list' }))
    expect(screen.getByText('Book a service visit')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Week page'))
    // /week holds the week list and folds the month beneath it, so BOTH pinned
    // panels stand down — and the pins are kept, not dropped.
    expect(screen.queryByRole('complementary', { name: 'Pinned reference lists' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/on this page/)).toHaveLength(2)
    expect(data.push).not.toHaveBeenCalled(); expect(data.update).not.toHaveBeenCalled()
    // Navigating away brings the same pins straight back.
    fireEvent.click(screen.getByText('Notes page'))
    expect(screen.getByText('Book a service visit')).toBeInTheDocument()
    expect(screen.getByText('Read a book')).toBeInTheDocument()
  })
  it('keeps a pinned week list on /month, which does not show one', () => {
    mount('one', '/month')
    fireEvent.click(screen.getByRole('button', { name: 'Pin week list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin month list' }))
    expect(screen.getByText('Book a service visit')).toBeInTheDocument()
    expect(screen.queryByText('Read a book')).not.toBeInTheDocument()
  })
  it('unpins without changing tasks', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin week list' })); fireEvent.click(screen.getAllByRole('button', { name: 'Unpin week list' })[0])
    expect(screen.queryByRole('complementary', { name: 'Pinned reference lists' })).not.toBeInTheDocument()
    expect(data.update).not.toHaveBeenCalled()
  })
})

// ── The Today pin (2026-09-19) ─────────────────────────────────────────────
// Same pin system as Week and Month: a third pin, not a permanent sidebar.
const planMock = vi.hoisted(() => ({
  chooseTaskDay: vi.fn(), unchooseTask: vi.fn(), timeTask: vi.fn(), commitTask: vi.fn(),
  chooseRoutine: vi.fn(), drop: vi.fn(), toggleTask: vi.fn(), completeRoutine: vi.fn(async () => true),
  deleteTask: vi.fn(async () => {}), deleteRoutine: vi.fn(async () => true),
}))
vi.mock('@/hooks/usePlanActions', () => ({ usePlanActions: () => planMock }))
vi.mock('@/hooks/useDayPlan', () => ({
  useDayPlan: () => ({
    loading: false, error: false,
    plan: {
      carried: [],
      scheduled: [{ key: 'task:f', kind: 'task', id: 'f', title: 'Pick up foot meds', completed: false, planned: false, group: 'scheduled' }],
      available: [
        { key: 'routine:r1', kind: 'routine', id: 'r1', title: 'Kids clean rooms', completed: false, planned: false, group: 'available' },
        { key: 'routine:r2', kind: 'routine', id: 'r2', title: 'Family reading time', completed: false, planned: true, group: 'available' },
      ],
      week: [{ key: 'task:w', kind: 'task', id: 'w', title: 'Book the plumber', completed: false, planned: false, group: 'week' }],
      month: [{ key: 'task:m', kind: 'task', id: 'm', title: 'Plan the porch', completed: false, planned: false, group: 'month' }],
      // The ONE list: this week's undated task, then the routines (a chosen one stays, marked).
      toPlan: [
        { key: 'task:w', kind: 'task', id: 'w', title: 'Book the plumber', completed: false, planned: false, group: 'plan', context: 'September plan' },
        { key: 'routine:r1', kind: 'routine', id: 'r1', title: 'Kids clean rooms', completed: false, planned: false, group: 'plan', context: 'Weekly routine' },
        { key: 'routine:r2', kind: 'routine', id: 'r2', title: 'Family reading time', completed: false, planned: true, group: 'plan', context: 'Daily routine' },
      ],
      counts: { scheduled: 1, available: 1 },
      offMainTaskIds: new Set(), offMainRoutineItemIds: new Set(), plannedExtraTasks: [],
      // Today's chooser (2026-09-22): the week's tasks, then the routines.
      chooserTasks: [
        { key: 'task:w', kind: 'task', id: 'w', title: 'Book the plumber', completed: false, planned: false, group: 'plan', context: 'September plan' },
      ],
      chooserRoutines: [
        { key: 'routine:r1', kind: 'routine', id: 'r1', title: 'Kids clean rooms', completed: false, planned: false, group: 'available', context: 'Weekly routine' },
        { key: 'routine:r2', kind: 'routine', id: 'r2', title: 'Family reading time', completed: false, planned: true, group: 'available', context: 'Daily routine' },
      ],
    },
  }),
}))

describe('The Planning panel', () => {
  it('pins beside any page, next to the Week and Month pins, and writes nothing on pin', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Pin Planning' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin week list' }))
    const plan = screen.getByRole('region', { name: 'Choose tasks' })
    expect(plan).toHaveTextContent("This week's tasks")
    expect(plan).toHaveTextContent('Routines')
    expect(screen.getByText('Book a service visit')).toBeInTheDocument()
    expect(planMock.chooseTaskDay).not.toHaveBeenCalled()
    expect(data.update).not.toHaveBeenCalled()
  })

  it('restores with the other pins for the same user', () => {
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin Planning' })); view.unmount()
    mount()
    expect(screen.getByRole('region', { name: 'Choose tasks' })).toBeInTheDocument()
  })

  it('every drag has a button: choose for today, unchoose, set a day or time', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin Planning' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose Book the plumber for today' }))
    expect(planMock.chooseTaskDay).toHaveBeenCalledWith('w', expect.any(Date))
    // Choosing a routine selects this occurrence, never a new task and never
    // the repeating rule.
    fireEvent.click(screen.getByRole('button', { name: 'Choose Kids clean rooms for today' }))
    expect(planMock.chooseRoutine).toHaveBeenCalledWith('r1', expect.any(Date), true, 'Kids clean rooms')
    // A chosen occurrence reads "Today ✓"; pressing it again removes only today's choice.
    const chosen = screen.getByRole('button', { name: 'Unchoose Family reading time for today' })
    expect(chosen).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chosen)
    expect(planMock.chooseRoutine).toHaveBeenCalledWith('r2', expect.any(Date), false, 'Family reading time')
    fireEvent.click(screen.getByRole('button', { name: 'More for Book the plumber' }))
    expect(screen.getByRole('menuitem', { name: 'Schedule Book the plumber' })).toBeInTheDocument()
    // A task dated today is on Today's page, not waiting here.
    expect(screen.queryByText('Pick up foot meds')).not.toBeInTheDocument()
  })

  // Scott, 2026-09-22: "also need to be able to delete items from the chooser".
  it('Delete behind ⋯ hides the row behind an Undo line; Undo brings it back, the window closing deletes it', () => {
    vi.useFakeTimers()
    try {
      mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin Planning' }))
      fireEvent.click(screen.getByRole('button', { name: 'More for Book the plumber' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete: Book the plumber' }))
      expect(screen.queryByText('Book the plumber')).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent(/Deleted “Book the plumber”/)
      expect(planMock.deleteTask).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(screen.getByText('Book the plumber')).toBeInTheDocument()
      expect(planMock.deleteTask).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'More for Book the plumber' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete: Book the plumber' }))
      act(() => { vi.advanceTimersByTime(8500) })
      expect(planMock.deleteTask).toHaveBeenCalledWith('w')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      // A routine row deletes the routine the same way.
      fireEvent.click(screen.getByRole('button', { name: 'More for Kids clean rooms' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete routine: Kids clean rooms' }))
      expect(screen.queryByText('Kids clean rooms')).not.toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(8500) })
      expect(planMock.deleteRoutine).toHaveBeenCalledWith('r1')
    } finally { vi.useRealTimers() }
  })

  it('the header widens the chooser to half the screen for triage, and remembers it', () => {
    localStorage.removeItem('symphony.chooser.wide')
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin Planning' }))
    const dock = screen.getByRole('complementary', { name: 'Pinned reference lists' })
    expect(dock).not.toHaveClass('is-wide')
    const widen = screen.getByRole('button', { name: 'Widen the chooser for triage' })
    expect(widen).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(widen)
    expect(dock).toHaveClass('is-wide')
    // Wide: the row's moves are visible pills, not a ⋯ menu.
    expect(screen.queryByRole('button', { name: 'More for Book the plumber' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete: Book the plumber' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Narrow the chooser' })).toHaveAttribute('aria-pressed', 'true')
    view.unmount()
    mount()
    expect(screen.getByRole('complementary', { name: 'Pinned reference lists' })).toHaveClass('is-wide')
    localStorage.removeItem('symphony.chooser.wide')
  })

  it('two sections, each row with its context; no month browser beside Today', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin Planning' }))
    expect(screen.getByText('Book the plumber')).toBeInTheDocument()
    expect(screen.getByText('September plan')).toBeInTheDocument()
    expect(screen.getByText('Weekly routine')).toBeInTheDocument()
    expect(screen.queryByText(/Available today|Carried over/)).toBeNull()
    // Month-to-week selection belongs on the Week page (2026-09-22).
    expect(screen.queryByText('Plan the porch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Browse month plan/ })).toBeNull()
  })

  it('a row dropped on the pinned week list commits it to the week — no day invented', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin week list' }))
    const payload = JSON.stringify({ kind: 'task', id: 'f', date: '2026-09-19', title: 'Pick up foot meds' })
    const dataTransfer = { types: ['application/x-symphony-plan'], getData: (t: string) => (t === 'application/x-symphony-plan' ? payload : ''), dropEffect: '' }
    const list = screen.getByRole('region', { name: /^Week list/ })
    fireEvent.dragOver(list, { dataTransfer })
    fireEvent.drop(list, { dataTransfer })
    expect(planMock.drop).toHaveBeenCalledWith(expect.objectContaining({ id: 'f', kind: 'task' }), { type: 'period', period: 'week' })
  })
})
