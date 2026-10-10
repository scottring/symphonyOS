import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { PLAN_MIME } from '@/lib/planning/planDrag'
import type { Task } from '@/types/task'
import { TodayWeekColumn } from './TodayWeekColumn'

const day = new Date(2026, 9, 7)
const entry: DayPlanEntry = { key: 'task:t1', kind: 'task', id: 't1', title: 'Call the bank', completed: false, planned: false, group: 'week' } as DayPlanEntry
const plan = { chooserTasks: [entry], chooserRoutines: [] } as unknown as DayPlan

// Scott, 2026-10-07: the week beside the day should drag onto it.
describe('TodayWeekColumn', () => {
  it('lets a week row be dragged, carrying what it is and the day', () => {
    render(<MemoryRouter><TodayWeekColumn plan={plan} day={day} weekNo={41} weekStart={day} actions={{ choose: vi.fn() } as never} /></MemoryRouter>)
    const row = screen.getByText('Call the bank').closest('li')!
    expect(row).toHaveAttribute('draggable', 'true')
    const set: Record<string, string> = {}
    fireEvent.dragStart(row, { dataTransfer: { setData: (k: string, v: string) => { set[k] = v }, effectAllowed: '' } })
    expect(JSON.parse(set[PLAN_MIME])).toEqual({ kind: 'task', id: 't1', date: '2026-10-07', title: 'Call the bank' })
  })

  // Scott, 2026-10-07: check off a week item from Today without choosing it first.
  it('checks a week row off from Today, through the same writer the chooser uses', () => {
    const complete = vi.fn()
    render(<MemoryRouter><TodayWeekColumn plan={plan} day={day} weekNo={41} weekStart={day} actions={{ choose: vi.fn(), complete } as never} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call the bank' }))
    expect(complete).toHaveBeenCalledWith(entry)
  })

  // Review, 2026-10-07: the week competes with the day once you're working.
  it('folds itself away from its own header, and says what the check does', () => {
    const onHide = vi.fn()
    render(<MemoryRouter><TodayWeekColumn plan={plan} day={day} weekNo={41} weekStart={day} actions={{ choose: vi.fn() } as never} onHide={onHide} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Hide week 41' }))
    expect(onHide).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Complete Call the bank' })).toHaveAttribute('title', 'Mark done')
  })

  // Canvas design, 2026-10-10: the compact list, shared with AlongsideDay.
  describe('compact week list', () => {
    const today = new Date()
    const month = { id: 'm', title: 'Plan the autumn trip', isGoal: false } as Task
    const t = (id: string, title: string, x: Partial<Task> = {}) => ({ id, title, completed: false, createdAt: today, sourceId: 'm', ...x }) as Task
    const e = (task: Task, x: Partial<DayPlanEntry> = {}): DayPlanEntry => ({ key: `task:${task.id}`, kind: 'task', id: task.id, title: task.title, completed: task.completed, planned: false, group: 'week', task, ...x }) as DayPlanEntry
    const at2 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14)
    const rows = [
      e(t('a', 'Book the cabin')),
      e(t('b', 'Pack the car', { scheduledFor: at2, isAllDay: false })),
      e(t('c', 'Call the bank', { sourceId: undefined })),
      e(t('d', 'Buy maps', { completed: true }), { completed: true }),
    ]
    const find = (id: string) => (id === 'm' ? month : undefined)
    const view = (props: Partial<Parameters<typeof TodayWeekColumn>[0]> = {}) => render(<MemoryRouter>
      <TodayWeekColumn plan={{ chooserTasks: rows, chooserRoutines: [] } as unknown as DayPlan} day={today} weekNo={41} weekStart={today}
        actions={{ choose: vi.fn(), unchoose: vi.fn(), complete: vi.fn(), open: vi.fn() } as never} findTask={find} {...props} />
    </MemoryRouter>)

    it('groups rows under their month line, marks what is already on today, and keeps done rows behind a reveal', () => {
      view()
      const group = screen.getByRole('region', { name: 'Plan the autumn trip' })
      expect(within(group).getByText('Book the cabin')).toBeInTheDocument()
      const onToday = within(group).getByText('Pack the car').closest('li')!
      expect(onToday).toHaveClass('is-on-today')
      expect(within(onToday).getByText('Today 2p')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add Pack the car to today' })).toBeNull()
      expect(within(screen.getByRole('region', { name: 'Unlinked' })).getByText('Call the bank')).toBeInTheDocument()
      expect(screen.queryByText('Buy maps')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Show done' }))
      expect(screen.getByText('Buy maps')).toBeInTheDocument()
    })

    it('adds a row to today through the page’s own chooser', async () => {
      const chooseTask = vi.fn().mockResolvedValue(true)
      view({ chooseTask })
      fireEvent.click(screen.getByRole('button', { name: 'Add Book the cabin to today' }))
      await waitFor(() => expect(chooseTask).toHaveBeenCalledWith('a'))
    })

    it('falls back to the panel action when no async chooser is given', () => {
      const choose = vi.fn()
      view({ actions: { choose, unchoose: vi.fn(), complete: vi.fn() } as never })
      fireEvent.click(screen.getByRole('button', { name: 'Add Book the cabin to today' }))
      expect(choose).toHaveBeenCalledWith(rows[0])
    })

    it('folds the day’s routines to one line that opens in place', () => {
      const routine = { key: 'routine:r', kind: 'routine', id: 'r', title: 'Water the plants', completed: false, planned: false, group: 'available' } as DayPlanEntry
      render(<MemoryRouter><TodayWeekColumn plan={{ chooserTasks: [], chooserRoutines: [routine] } as unknown as DayPlan} day={today} weekNo={41} weekStart={today} actions={{ choose: vi.fn() } as never} /></MemoryRouter>)
      expect(screen.queryByText('Water the plants')).toBeNull()
      const fold = screen.getByRole('button', { name: /Routines today/ })
      expect(fold).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(fold)
      expect(screen.getByText('Water the plants')).toBeInTheDocument()
    })

    it('draws next week read-only on the week’s last day', () => {
      const next = e(t('n', 'Order firewood'))
      view({ nextWeek: { weekNo: 42, weekStart: today, entries: [next] } })
      const section = screen.getByRole('region', { name: 'Week 42, starts tomorrow' })
      expect(within(section).getByText('Order firewood').closest('li')).toHaveAttribute('draggable', 'false')
      expect(within(section).queryByRole('button', { name: /Add Order firewood/ })).toBeNull()
      expect(within(section).getByRole('button', { name: 'Open week 42 →' })).toBeInTheDocument()
    })
  })
})
