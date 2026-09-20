import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Link, useLocation } from 'react-router-dom'
import { ReferenceListsProvider } from './ReferenceListsContext'
import { ReferenceListControls, ReferenceListsDock } from './ReferenceLists'
import type { Task } from '@/types/task'

const data = vi.hoisted(() => ({ tasks: [] as Task[], allow: true, push: vi.fn(), update: vi.fn(), complete: vi.fn() }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: data.tasks, loading: false, updateTask: data.update, updateTasksBulk: vi.fn(), pushTask: data.push, toggleTask: data.complete }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ getCurrentUserMember: () => ({ id: 'me' }) }) }))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ layers: new Set(['personal']) }) }))
vi.mock('@/hooks/useGatedTaskActions', async (importOriginal) => ({ ...await importOriginal<typeof import('@/hooks/useGatedTaskActions')>(), useGatedTaskActions: () => ({ updateTask: data.update, pushTask: async (...args: unknown[]) => { if (!data.allow) return false; await data.push(...args); return true } }) }))
function task(id: string, bucket: 'week' | 'month', extra = {}): Task {
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
  // "Do today" CHOOSES the day (planned_on); the task keeps its week list,
  // because choosing a day never erases the broader commitment (2026-09-19).
  it('chooses actual today only on explicit action, keeps the week list, and stays on the current page', async () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Pin week list' })); fireEvent.click(screen.getByText('Notes page'))
    fireEvent.click(screen.getByRole('button', { name: 'Do today' }))
    await waitFor(() => expect(data.update).toHaveBeenCalledTimes(1))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    expect(data.update).toHaveBeenCalledWith('Book a service visit', { plannedOn: today })
    expect(data.push).not.toHaveBeenCalled()
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
      month: [],
      counts: { scheduled: 1, available: 1 },
      offMainTaskIds: new Set(), offMainRoutineItemIds: new Set(), plannedExtraTasks: [],
    },
  }),
}))

describe('The Today pin', () => {
  it('pins beside any page, next to the Week and Month pins, and writes nothing on pin', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: "Pin today's plan" }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin week list' }))
    const plan = screen.getByRole('region', { name: "Today's plan" })
    expect(plan).toHaveTextContent('Scheduled today')
    expect(plan).toHaveTextContent('Pick up foot meds')
    expect(screen.getByText('Book a service visit')).toBeInTheDocument()
    expect(planMock.chooseTaskDay).not.toHaveBeenCalled()
    expect(data.update).not.toHaveBeenCalled()
  })

  it('restores with the other pins for the same user', () => {
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: "Pin today's plan" })); view.unmount()
    mount()
    expect(screen.getByRole('region', { name: "Today's plan" })).toBeInTheDocument()
  })

  it('every drag has a button: choose for today, move back, set a day or time', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: "Pin today's plan" }))
    fireEvent.click(screen.getByRole('button', { name: 'Plan Pick up foot meds for today' }))
    expect(planMock.chooseTaskDay).toHaveBeenCalledWith('f', expect.any(Date))
    fireEvent.click(screen.getByRole('button', { name: 'Plan Kids clean rooms for today' }))
    expect(planMock.chooseRoutine).toHaveBeenCalledWith('r1', expect.any(Date), true, 'Kids clean rooms')
    // A chosen occurrence is marked, not listed again as unfinished.
    expect(screen.getByText('Planned today')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Move Family reading time back off today' }))
    expect(planMock.chooseRoutine).toHaveBeenCalledWith('r2', expect.any(Date), false, 'Family reading time')
    expect(screen.getByRole('button', { name: 'Set a day or time for Pick up foot meds' })).toBeInTheDocument()
  })

  it('folds the broader lists until asked', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: "Pin today's plan" }))
    const week = screen.getByRole('button', { name: /^This week/ })
    expect(week).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Book the plumber')).not.toBeInTheDocument()
    fireEvent.click(week)
    expect(screen.getByText('Book the plumber')).toBeInTheDocument()
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
