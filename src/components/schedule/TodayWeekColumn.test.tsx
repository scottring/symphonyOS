import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { PLAN_MIME } from '@/lib/planning/planDrag'
import type { Task } from '@/types/task'
import { TodayWeekColumn } from './TodayWeekColumn'
import { selectDayPlan } from '@/lib/today/dayPlan'
import { weekListTasks } from '@/lib/planning/weekList'
import { buildShelf } from '@/components/canvas/week/weekShelf'
import { ALL_LAYERS } from '@/lib/domains'
import { createMockTask } from '@/test/mocks/factories'

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
    const t = (id: string, title: string, x: Partial<Task> = {}) => ({ id, title, completed: false, createdAt: today, sourceId: 'm', ...x }) as Task
    const e = (task: Task, x: Partial<DayPlanEntry> = {}): DayPlanEntry => ({ key: `task:${task.id}`, kind: 'task', id: task.id, title: task.title, completed: task.completed, planned: false, group: 'week', task, ...x }) as DayPlanEntry
    const at2 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 14)
    const rows = [
      e(t('a', 'Book the cabin')),
      e(t('b', 'Pack the car', { scheduledFor: at2, isAllDay: false })),
      e(t('c', 'Call the bank', { sourceId: undefined })),
      e(t('d', 'Buy maps', { completed: true }), { completed: true }),
    ]
    const view = (props: Partial<Parameters<typeof TodayWeekColumn>[0]> = {}) => render(<MemoryRouter>
      <TodayWeekColumn plan={{ chooserTasks: rows, chooserRoutines: [] } as unknown as DayPlan} day={today} weekNo={41} weekStart={today}
        actions={{ choose: vi.fn(), unchoose: vi.fn(), complete: vi.fn(), open: vi.fn() } as never} {...props} />
    </MemoryRouter>)

    // Paper-style horizons (spec 2026-11-04): the week flat, as on Week —
    // no heading for the month line, no "Unlinked", no serves line.
    it('lists rows flat, marks what is already on today, and keeps done rows behind a reveal', () => {
      view()
      const list = screen.getByRole('group', { name: 'Week 41’s list' })
      expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('.cw-title')?.textContent)).toEqual(['Book the cabin', 'Pack the car', 'Call the bank'])
      expect(screen.queryByRole('region', { name: 'Plan the autumn trip' })).toBeNull()
      expect(screen.queryByRole('region', { name: 'Unlinked' })).toBeNull()
      expect(screen.queryByText('Plan the autumn trip')).toBeNull()
      expect(document.querySelector('.cw-parent, .serves-line, .today-serves')).toBeNull()
      const onToday = screen.getByText('Pack the car').closest('li')!
      expect(onToday).toHaveClass('is-on-today')
      expect(within(onToday).getByText('Today 2p')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add Pack the car to today' })).toBeNull()
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

// Finding #15 (spec 2026-11-04): Today's week column held November's own
// lines that the Week's list did not. Both now read one week: for the same
// tasks, Today's column and Week's "No day yet" list the same titles, in the
// same order.
describe('Today and Week agree on the week', () => {
  const now = new Date(2026, 10, 4, 9) // Wed Nov 4
  const weekStart = new Date(2026, 10, 1) // Sun Nov 1 – Sat Nov 7
  const onWeek = [{ level: 'week', periodStart: weekStart, status: 'open' }] as Task['commitments']
  let n = 0
  const wk = (title: string, x: Partial<Task> = {}) => createMockTask({ id: `w${++n}`, title, bucket: 'week', weekStart, commitments: onWeek, createdAt: new Date(2026, 9, n), ...x })
  // No weekend-only and no scope-filtered tasks: both pages show them all.
  const tasks = [
    wk('Book the cabin', { sourceId: 'm1', commitments: [...onWeek!, { level: 'month', periodStart: new Date(2026, 10, 1), status: 'open' }] as Task['commitments'] }),
    wk('Plan winter vacation', { isGoal: true, bucket: 'month', monthStart: new Date(2026, 10, 1), commitments: [...onWeek!, { level: 'month', periodStart: new Date(2026, 10, 1), status: 'open' }] as Task['commitments'] }),
    wk('Call the bank'),
    wk('Service the car', { goalTaskId: 'm1' }),
  ]

  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
  afterEach(() => { vi.useRealTimers() })

  it('Today’s week column titles and notes equal the Week page’s No day yet titles and notes', () => {
    const plan = selectDayPlan({
      tasks, routines: [], dateInstances: [], viewedDate: now, selectedAssignee: null, hideRoutines: false,
      layers: new Set(ALL_LAYERS), weekStart, userId: 'u1', now,
    })
    render(<MemoryRouter><TodayWeekColumn plan={plan} day={now} weekNo={45} weekStart={weekStart} actions={{ choose: vi.fn() } as never} /></MemoryRouter>)
    const items = within(screen.getByRole('group', { name: 'Week 45’s list' })).getAllByRole('listitem')
    const today = items.map((li) => li.querySelector('.cw-title')?.textContent)
    const rows = buildShelf({ weekTasks: weekListTasks(tasks, weekStart, null, { isCurrent: true }), weekStart, now }).flatMap((g) => g.rows)
    const week = rows.map((r) => r.task.title)
    expect(week).toEqual(['Book the cabin', 'Plan winter vacation', 'Call the bank', 'Service the car'])
    expect(today).toEqual(week)
    // The notes agree too: no "from November" on Today for a row that is
    // also on the month (a tie line, ruled out 2026-11-04).
    expect(items.map((li) => li.querySelector('.cw-sub')?.textContent ?? null)).toEqual(rows.map((r) => r.meta))
    expect(screen.queryByText(/from November/)).toBeNull()
  })
})
