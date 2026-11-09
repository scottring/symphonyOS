import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DayPlan, DayPlanEntry } from '@/lib/today/dayPlan'
import { PLAN_MIME } from '@/lib/planning/planDrag'
import type { Task } from '@/types/task'
import { TodayWeekFold } from './TodayWeekColumn'
import { selectDayPlan } from '@/lib/today/dayPlan'
import { weekListTasks } from '@/lib/planning/weekList'
import { buildShelf } from '@/components/canvas/week/weekShelf'
import { ALL_LAYERS } from '@/lib/domains'
import { createMockTask } from '@/test/mocks/factories'

// Today gets the fold (Scott, 2026-11-04: "add today with the + on the week
// sheet"): the week folds beside the day, in place of the This week column.
// Its rows keep their + and their drag onto the day.

const FOOT = 'Pick three to five for today.'
const now = new Date(2026, 10, 4, 9) // Wed Nov 4
const weekStart = new Date(2026, 9, 31) // Sat Oct 31 – Fri Nov 6

const t = (id: string, title: string, x: Partial<Task> = {}) => ({ id, title, completed: false, createdAt: now, ...x }) as Task
const e = (task: Task, x: Partial<DayPlanEntry> = {}): DayPlanEntry => ({ key: `task:${task.id}`, kind: 'task', id: task.id, title: task.title, completed: task.completed, planned: false, group: 'week', task, ...x }) as DayPlanEntry

const at2 = new Date(2026, 10, 4, 14)
const rows = [
  e(t('a', 'Book the cabin')),
  e(t('b', 'Pack the car', { scheduledFor: at2, isAllDay: false })), // on today already
  e(t('c', 'Call the bank')),
  e(t('d', 'Buy maps', { completed: true }), { completed: true }),
  e(t('f', 'Fix the gate', { scheduledFor: new Date(2026, 10, 5), isAllDay: true })), // on Thursday
]
const plan = { chooserTasks: rows, chooserRoutines: [] } as unknown as DayPlan

function view(props: Partial<Parameters<typeof TodayWeekFold>[0]> = {}) {
  const actions = { choose: vi.fn(), unchoose: vi.fn(), complete: vi.fn(), open: vi.fn() }
  const r = render(<MemoryRouter>
    <TodayWeekFold plan={plan} day={now} weekStart={weekStart} actions={actions as never} {...props}>
      <p>The day</p>
    </TodayWeekFold>
  </MemoryRouter>)
  return { ...r, actions }
}
const unfold = () => fireEvent.click(screen.getByRole('button', { name: /Unfold to read$/ }))
const manyRows = (n: number) => Array.from({ length: n }, (_, i) => e(t(`m${i}`, `Task ${i + 1}`)))

// Reduced motion: the fold jumps to its state, so a tap opens it at once.
const originalMatchMedia = window.matchMedia
const reduceMotion = ((query: string) => ({
  matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
  addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
})) as typeof window.matchMedia
beforeEach(() => { localStorage.clear(); window.matchMedia = reduceMotion; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { vi.useRealTimers(); window.matchMedia = originalMatchMedia })

describe('TodayWeekFold: the week folded beside the day', () => {
  it('wraps the day, with an edge named for the week’s dates and its open no-day count', () => {
    view()
    expect(screen.getByText('The day')).toBeInTheDocument()
    // Open with no day: Book the cabin, Call the bank. Pack the car is on
    // today, Fix the gate on Thursday, Buy maps done.
    expect(screen.getByRole('button', { name: 'Oct 31 – Nov 6, 2 open. Unfold to read' })).toBeInTheDocument()
    expect(document.querySelector('.paper-fold[data-horizon="day"]')).not.toBeNull()
  })

  it('unfolded, the sheet lists the week’s no-day tasks, says what is done, and reads the foot', () => {
    view()
    unfold()
    const list = screen.getByRole('list', { name: 'Oct 31 – Nov 6' })
    expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('.above-sheet-row-title')?.textContent)).toEqual(['Book the cabin', 'Call the bank'])
    expect(screen.getByText('Week')).toBeInTheDocument()
    expect(screen.getByText('1 done')).toBeInTheDocument()
    expect(screen.getByText(FOOT)).toBeInTheDocument()
    // The column's hide control is gone: folding is how it goes away.
    expect(screen.queryByRole('button', { name: /^Hide week/ })).toBeNull()
  })

  it('remembers the fold under symphony-fold:day', () => {
    view()
    unfold()
    expect(localStorage.getItem('symphony-fold:day')).toBe('open')
  })

  it('"+" plans the task for today through the page’s own chooser', async () => {
    const chooseTask = vi.fn().mockResolvedValue(true)
    view({ chooseTask })
    unfold()
    fireEvent.click(screen.getByRole('button', { name: 'Plan Book the cabin for today' }))
    await waitFor(() => expect(chooseTask).toHaveBeenCalledWith('a'))
  })

  it('"+" falls back to the panel action when no async chooser is given', () => {
    const { actions } = view()
    unfold()
    fireEvent.click(screen.getByRole('button', { name: 'Plan Call the bank for today' }))
    expect(actions.choose).toHaveBeenCalledWith(rows[2])
  })

  it('a row drags onto the day, carrying what it is and the day', () => {
    view()
    unfold()
    const row = screen.getByText('Book the cabin').closest('li')!
    expect(row).toHaveAttribute('draggable', 'true')
    const set: Record<string, string> = {}
    fireEvent.dragStart(row, { dataTransfer: { setData: (k: string, v: string) => { set[k] = v }, effectAllowed: '' } })
    expect(JSON.parse(set[PLAN_MIME])).toEqual({ kind: 'task', id: 'a', date: '2026-11-04', title: 'Book the cabin' })
  })

  it('a title tap opens the task, as the column did', () => {
    const { actions } = view()
    unfold()
    fireEvent.click(screen.getByRole('button', { name: 'Book the cabin' }))
    expect(actions.open).toHaveBeenCalledWith(rows[0])
  })

  it('on another day, the + names that day', () => {
    view({ day: new Date(2026, 10, 6) })
    unfold()
    expect(screen.getByRole('button', { name: 'Plan Book the cabin for Friday' })).toBeInTheDocument()
  })

  it('names its sheet for picking, not reading', () => {
    view()
    unfold()
    expect(screen.getByRole('region', { name: 'Oct 31 – Nov 6, to pick from' })).toBeInTheDocument()
  })

  // Fix round 1: the column's "Routines today" lives on the sheet, below the
  // week's tasks, with the column's own + (toToday's routine branch).
  describe('Routines to pick from', () => {
    it('lies wide enough for its checks, people and +', () => {
      view()
      expect(document.querySelector<HTMLElement>('.paper-fold-flap')?.style.width).toBe('357px')
    })

    it('assigns a task from the sheet', async () => {
      const restoreTask = vi.fn()
      view({ members: [{ id: 'iris', name: 'Iris', initials: 'IR', color: 'purple' }] as never, restoreTask })
      unfold()
      fireEvent.click(screen.getByRole('button', { name: /^Assign people to Book the cabin/ }))
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Iris/ }))
      await waitFor(() => expect(restoreTask).toHaveBeenCalledWith('a', { assignedToAll: ['iris'], assignedTo: 'iris' }))
    })

    it('a task checks off from the sheet', async () => {
      const complete = vi.fn()
      view({ actions: { choose: vi.fn(), unchoose: vi.fn(), complete, open: vi.fn() } as never })
      unfold()
      fireEvent.click(screen.getByRole('button', { name: 'Mark Book the cabin complete' }))
      await waitFor(() => expect(complete).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' })))
    })

    it('shows the week’s first five tasks and folds the rest', () => {
      view({ plan: { chooserTasks: manyRows(19), chooserRoutines: [] } as unknown as DayPlan })
      unfold()
      expect(document.querySelectorAll('.above-sheet-list > li')).toHaveLength(5)
      expect(screen.getByRole('button', { name: '14 more' })).toBeInTheDocument()
    })

    const occ = { key: 'routine:r', kind: 'routine', id: 'r', title: 'Water the plants', completed: false, planned: false, group: 'available' } as DayPlanEntry
    const weekly = { key: 'routine:w', kind: 'routine', id: 'w', title: 'Mow the lawn', completed: false, planned: false, group: 'available', routine: { id: 'w' } } as unknown as DayPlanEntry
    const chosen = { key: 'routine:c', kind: 'routine', id: 'c', title: 'Feed the fish', completed: false, planned: true, group: 'available' } as DayPlanEntry
    const withRoutines = { chooserTasks: rows, chooserRoutines: [occ, weekly, chosen] } as unknown as DayPlan

    it('lists the day’s open routines below the tasks; + chooses an occurrence and places a weekly one', () => {
      const placeRoutine = vi.fn()
      const actions = { choose: vi.fn(), unchoose: vi.fn(), complete: vi.fn(), open: vi.fn(), placeRoutine }
      view({ plan: withRoutines, actions: actions as never })
      unfold()
      const list = screen.getByRole('list', { name: 'Routines to pick from' })
      expect(within(list).getAllByRole('listitem').map((li) => li.querySelector('.above-sheet-row-title')?.textContent)).toEqual(['Water the plants', 'Mow the lawn'])
      // Below the week's tasks, above the foot.
      const tasks = screen.getByRole('list', { name: 'Oct 31 – Nov 6' })
      expect(tasks.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(list.compareDocumentPosition(screen.getByText(FOOT)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      fireEvent.click(within(list).getByRole('button', { name: 'Plan Water the plants for today' }))
      expect(actions.choose).toHaveBeenCalledWith(occ)
      fireEvent.click(within(list).getByRole('button', { name: 'Plan Mow the lawn for today' }))
      expect(placeRoutine).toHaveBeenCalledWith(weekly, now)
      // The edge counts the week's tasks, not the day's routines.
      expect(screen.getByRole('button', { name: /^Fold Oct 31 – Nov 6 away$/ })).toBeInTheDocument()
    })

    it('a routine row drags onto the day as a routine', () => {
      view({ plan: withRoutines })
      unfold()
      const set: Record<string, string> = {}
      fireEvent.dragStart(screen.getByText('Water the plants').closest('li')!, { dataTransfer: { setData: (k: string, v: string) => { set[k] = v }, effectAllowed: '' } })
      expect(JSON.parse(set[PLAN_MIME])).toEqual({ kind: 'routine', id: 'r', date: '2026-11-04', title: 'Water the plants' })
    })

    it('says nothing about routines when there are none', () => {
      view()
      unfold()
      expect(screen.queryByRole('list', { name: 'Routines to pick from' })).toBeNull()
      expect(screen.queryByText(/^Routines to pick from$/)).toBeNull()
    })
  })

  it('draws next week read-only on the week’s last day', () => {
    const next = e(t('n', 'Order firewood'))
    const { actions } = view({ nextWeek: { weekStart: new Date(2026, 10, 7), entries: [next] } })
    unfold()
    const section = screen.getByRole('region', { name: 'Nov 7 – Nov 13, starts tomorrow' })
    expect(within(section).getByText('Nov 7 – Nov 13')).toBeInTheDocument()
    expect(within(section).getByText('Starts tomorrow')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Week \d+/)
    expect(within(section).queryByRole('button', { name: /^Plan Order firewood/ })).toBeNull()
    expect(within(section).getByText('Order firewood').closest('li')).not.toHaveAttribute('draggable', 'true')
    fireEvent.click(within(section).getByRole('button', { name: 'Order firewood' }))
    expect(actions.open).toHaveBeenCalledWith(next)
  })
})

// Finding #15 (spec 2026-11-04): Today's week and the Week page's "No day
// yet" read one week — for the same tasks, the same titles in the same order.
describe('Today and Week agree on the week', () => {
  const wkStart = new Date(2026, 10, 1) // Sun Nov 1 – Sat Nov 7
  const onWeek = [{ level: 'week', periodStart: wkStart, status: 'open' }] as Task['commitments']
  let n = 0
  const wk = (title: string, x: Partial<Task> = {}) => createMockTask({ id: `w${++n}`, title, bucket: 'week', weekStart: wkStart, commitments: onWeek, createdAt: new Date(2026, 9, n), ...x })
  // No weekend-only and no scope-filtered tasks: both pages show them all.
  const tasks = [
    wk('Book the cabin', { sourceId: 'm1', commitments: [...onWeek!, { level: 'month', periodStart: new Date(2026, 10, 1), status: 'open' }] as Task['commitments'] }),
    wk('Plan winter vacation', { isGoal: true, bucket: 'month', monthStart: new Date(2026, 10, 1), commitments: [...onWeek!, { level: 'month', periodStart: new Date(2026, 10, 1), status: 'open' }] as Task['commitments'] }),
    wk('Call the bank'),
    wk('Service the car', { goalTaskId: 'm1' }),
    wk('Fix the gate', { bucket: 'timed', scheduledFor: new Date(2026, 10, 6), isAllDay: true }),
  ]

  it('the sheet’s titles equal the Week page’s No day yet titles', () => {
    const plan = selectDayPlan({
      tasks, routines: [], dateInstances: [], viewedDate: now, selectedAssignee: null, hideRoutines: false,
      layers: new Set(ALL_LAYERS), weekStart: wkStart, userId: 'u1', now,
    })
    render(<MemoryRouter><TodayWeekFold plan={plan} day={now} weekStart={wkStart} actions={{ choose: vi.fn() } as never}><p>day</p></TodayWeekFold></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Nov 1 – Nov 7, 4 open. Unfold to read' })).toBeInTheDocument()
    unfold()
    const items = within(screen.getByRole('list', { name: 'Nov 1 – Nov 7' })).getAllByRole('listitem')
    const today = items.map((li) => li.querySelector('.above-sheet-row-title')?.textContent)
    const week = buildShelf({ weekTasks: weekListTasks(tasks, wkStart, null, { isCurrent: true }), weekStart: wkStart, now }).flatMap((g) => g.rows).map((r) => r.task.title)
    expect(week).toEqual(['Book the cabin', 'Plan winter vacation', 'Call the bank', 'Service the car'])
    expect(today).toEqual(week)
  })
})
