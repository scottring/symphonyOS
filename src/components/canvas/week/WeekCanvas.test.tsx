import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Task } from '@/types/task'
import { WeekCanvas, type CanvasDay, type WeekCanvasWriters } from './WeekCanvas'
import { buildShelf, type ShelfGroup } from './weekShelf'

// The approved week composition (2026-10-10): Still to place above seven
// equal days; + gives a row a day; drag places it; done waits behind one
// "Show done" for the week.

const weekStart = new Date(2026, 9, 3) // Sat Oct 3 – Fri Oct 9
const dayOf = (i: number) => new Date(2026, 9, 3 + i)
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const task = (x: Partial<Task>) => ({ id: 't', title: 'T', completed: false, createdAt: new Date(2026, 8, 1), ...x }) as Task

const trip = task({ id: 'm1', title: 'Plan the autumn trip', bucket: 'month' })
const paper = task({ id: 'm2', title: 'Get the paperwork in order', bucket: 'month' })
const cabin = task({ id: 'a', title: 'Book the cabin', sourceId: 'm1' })
const car = task({ id: 'b', title: 'Service the car', sourceId: 'm1' })
const bank = task({ id: 'c', title: 'Call the bank' })
const maps = task({ id: 'd', title: 'Buy maps', sourceId: 'm1', completed: true })
const placed = task({ id: 'p', title: 'Pick up the keys', scheduledFor: dayOf(4), isAllDay: true })

const writers = (): WeekCanvasWriters => ({
  placeTask: vi.fn(), moveTask: vi.fn(), unplaceTask: vi.fn(), toggleTask: vi.fn(), toggleRoutine: vi.fn(),
  placeRoutine: vi.fn(), moveRoutine: vi.fn(), addAction: vi.fn(async () => true), milestoneDone: vi.fn(), open: vi.fn(), foreignDrop: vi.fn(),
})

function days(): CanvasDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = dayOf(i)
    return {
      date: d, key: key(d),
      events: i === 2 ? [{ id: 'event-e1', kind: 'event', title: 'Dentist', time: new Date(2026, 9, 5, 9), completed: false }] : [],
      items: i === 4 ? [
        { id: 'task-p', kind: 'task', title: placed.title, completed: false, task: placed },
        { id: 'task-x', kind: 'task', title: 'Old receipt', completed: true, task: task({ id: 'x', title: 'Old receipt', completed: true }) },
      ] : [],
    }
  })
}

function shelf(): ShelfGroup[] {
  return buildShelf({
    weekTasks: [cabin, bank, car, maps, placed], tasks: [trip, paper, cabin, bank, car, maps, placed], weekStart,
    milestones: [{ id: 'm1', title: trip.title, completed: false }, { id: 'm2', title: paper.title, completed: false }],
    now: new Date(2026, 9, 3, 9),
  })
}

const show = (w = writers(), extra: Partial<Parameters<typeof WeekCanvas>[0]> = {}) => {
  render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[{ id: 'r1', title: 'Mow the lawn' }]}
    monthName="October" isCurrent writers={w} {...extra} />)
  return w
}

const dt = () => {
  const data: Record<string, string> = {}
  const t = { setData: (k: string, v: string) => { data[k] = v }, getData: (k: string) => data[k] ?? '', types: [] as string[], effectAllowed: '', dropEffect: '' }
  return { t, data, arm: () => { t.types = Object.keys(data) } }
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 3, 9)) })
afterEach(() => { vi.useRealTimers() })

describe('weekShelf', () => {
  it('leaves placed work on its day, names the milestone once, offers empty milestones, and puts Unlinked last', () => {
    const g = shelf()
    expect(g.map((x) => x.milestone?.id ?? 'unlinked')).toEqual(['m1', 'm2', 'unlinked'])
    expect(g[0].rows.map((r) => r.task.id)).toEqual(['a', 'b'])
    expect(g[0].done.map((r) => r.task.id)).toEqual(['d'])
    expect(g[1].rows).toEqual([])
    expect(g[2].rows.map((r) => r.task.id)).toEqual(['c'])
    expect(g.flatMap((x) => x.rows).some((r) => r.task.id === 'p')).toBe(false)
  })

  it('a day that passed undone comes back with a quiet “from Fri”', () => {
    const missed = task({ id: 'm', title: 'Return books', scheduledFor: new Date(2026, 9, 9), isAllDay: true })
    const g = buildShelf({ weekTasks: [missed], tasks: [missed], weekStart, milestones: [], now: new Date(2026, 9, 10, 9) })
    expect(g[0].rows[0].meta).toBe('from Fri')
  })
})

describe('WeekCanvas — Still to place', () => {
  it('groups actions under the milestone they serve, Unlinked dashed and last, routines in their own card', () => {
    show()
    const region = screen.getByRole('region', { name: 'Still to place' })
    expect(within(region).getByText('Drag onto a day, or press + to give it a day')).toBeInTheDocument()
    const groups = within(region).getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(groups).toEqual(['Plan the autumn trip', 'Get the paperwork in order', 'Routines to place', 'Unlinked'])
    const tripCard = within(screen.getByRole('region', { name: 'Plan the autumn trip' }))
    expect(tripCard.getAllByText('Plan the autumn trip')).toHaveLength(1)
    expect(tripCard.getByText('Book the cabin')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Unlinked' })).toHaveClass('is-unlinked')
    expect(within(screen.getByRole('region', { name: 'Routines to place' })).getByText('Mow the lawn')).toBeInTheDocument()
    // Placed work is on its day, not here too.
    expect(within(region).queryByText('Pick up the keys')).toBeNull()
  })

  it('+ opens “Give it a day”: the week’s seven days, past ones refused; picking one places it', () => {
    const w = show()
    fireEvent.click(screen.getByRole('button', { name: 'Give Book the cabin a day' }))
    const picker = within(screen.getByRole('group', { name: 'Give it a day: Book the cabin' }))
    expect(picker.getAllByRole('button').map((b) => b.textContent)).toEqual(['Sat 3', 'Sun 4', 'Mon 5', 'Tue 6', 'Wed 7', 'Thu 8', 'Fri 9'])
    fireEvent.keyDown(picker.getByRole('button', { name: /Saturday, October 3/ }), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(picker.getByRole('button', { name: /Sunday, October 4/ }))
    fireEvent.click(picker.getByRole('button', { name: /Tuesday, October 6/ }))
    expect(w.placeTask).toHaveBeenCalledWith(cabin, dayOf(3))
    expect(screen.queryByRole('group', { name: /Give it a day/ })).toBeNull()
  })

  it('refuses a day already behind us', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 9))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Give Book the cabin a day' }))
    expect(screen.getByRole('button', { name: /Monday, October 5/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Tuesday, October 6/ })).not.toBeDisabled()
  })

  it('a weekly routine that needs a day is given one the same way', () => {
    const w = show()
    fireEvent.click(screen.getByRole('button', { name: 'Give Mow the lawn a day' }))
    fireEvent.click(screen.getByRole('button', { name: /Sunday, October 4/ }))
    expect(w.placeRoutine).toHaveBeenCalledWith({ id: 'r1', title: 'Mow the lawn' }, dayOf(1))
  })

  it('the milestone ⋯ menu marks it done, opens it, or starts an action for it', async () => {
    const w = show()
    const head = () => within(screen.getByRole('region', { name: 'Plan the autumn trip' }))
    fireEvent.click(head().getByRole('button', { name: 'More for Plan the autumn trip' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark done' }))
    expect(w.milestoneDone).toHaveBeenCalledWith('m1')
    fireEvent.click(head().getByRole('button', { name: 'More for Plan the autumn trip' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open details' }))
    expect(w.open).toHaveBeenCalledWith('task-m1')
    fireEvent.click(head().getByRole('button', { name: 'More for Plan the autumn trip' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add an action' }))
    const box = head().getByRole('textbox', { name: 'Add an action for Plan the autumn trip' })
    fireEvent.change(box, { target: { value: 'Pack the tent' } })
    fireEvent.submit(box.closest('form')!)
    expect(w.addAction).toHaveBeenCalledWith('Pack the tent', 'm1')
  })

  it('Unlinked’s “+ Add” writes an action that serves nothing', () => {
    const w = show()
    fireEvent.click(within(screen.getByRole('region', { name: 'Unlinked' })).getByRole('button', { name: '+ Add' }))
    const box = screen.getByRole('textbox', { name: 'Add something for this week' })
    fireEvent.change(box, { target: { value: 'Fix the gate' } })
    fireEvent.submit(box.closest('form')!)
    expect(w.addAction).toHaveBeenCalledWith('Fix the gate', undefined)
  })
})

describe('WeekCanvas — drag', () => {
  it('a shelf row carries the plan payload; its card lights; the day says where it lands; the drop places it', () => {
    const w = show()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Book the cabin').closest('li')!, { dataTransfer: d.t })
    expect(JSON.parse(d.data['application/x-symphony-plan'])).toEqual({ kind: 'task', id: 'a', date: '2026-10-03', title: 'Book the cabin' })
    expect(screen.getByRole('region', { name: 'Plan the autumn trip' })).toHaveClass('is-source')
    d.arm()
    const mon = screen.getByTestId('journal-day-2026-10-05')
    fireEvent.dragOver(mon, { dataTransfer: d.t })
    expect(mon).toHaveClass('is-over')
    expect(within(mon).getByText('Drop on Mon 5')).toBeInTheDocument()
    fireEvent.drop(mon, { dataTransfer: d.t })
    expect(w.placeTask).toHaveBeenCalledWith(cabin, dayOf(2))
    expect(screen.getByRole('region', { name: 'Plan the autumn trip' })).not.toHaveClass('is-source')
  })

  it('a day’s row dropped on the shelf goes back to Still to place', () => {
    const w = show()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Pick up the keys').closest('li')!, { dataTransfer: d.t })
    d.arm()
    const region = screen.getByRole('region', { name: 'Still to place' })
    fireEvent.dragOver(region, { dataTransfer: d.t })
    fireEvent.drop(region, { dataTransfer: d.t })
    expect(w.unplaceTask).toHaveBeenCalledWith(placed)
  })

  it('a plan row from elsewhere (the Today pin) is handed to the page’s own drop', () => {
    const w = show()
    const d = dt()
    d.t.setData('application/x-symphony-plan', JSON.stringify({ kind: 'task', id: 'zz', date: '2026-10-03', title: 'From the pin' }))
    d.arm()
    fireEvent.drop(screen.getByTestId('journal-day-2026-10-06'), { dataTransfer: d.t })
    expect(w.foreignDrop).toHaveBeenCalledWith(dayOf(3), { kind: 'task', id: 'zz', date: '2026-10-03', title: 'From the pin' })
  })
})

describe('WeekCanvas — the days', () => {
  it('draws seven equal days: events as chips with their time, placed work as rows with a ⋯ menu', () => {
    const w = show()
    const strip = screen.getByRole('region', { name: 'The days' })
    expect(within(strip).getAllByRole('region')).toHaveLength(7)
    expect(screen.getByTestId('journal-day-2026-10-03')).toHaveClass('is-today')
    expect(screen.getByTestId('journal-day-2026-10-04')).toHaveClass('is-empty')
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByRole('button', { name: /Dentist/ })).toHaveTextContent('9aDentist')
    const wed = within(screen.getByTestId('journal-day-2026-10-07'))
    fireEvent.click(wed.getByRole('button', { name: 'More for Pick up the keys' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Move to another day', 'Back to still to place', 'Open', 'Complete'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Back to still to place' }))
    expect(w.unplaceTask).toHaveBeenCalledWith(placed)
  })

  it('one “Show done” reveals done work on the shelf and in the days', () => {
    show()
    expect(screen.queryByText('Buy maps')).toBeNull()
    expect(screen.queryByText('Old receipt')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show done' }))
    expect(screen.getByText('Buy maps')).toBeInTheDocument()
    expect(screen.getByText('Old receipt')).toBeInTheDocument()
  })
})

describe('WeekCanvas — phone', () => {
  const original = window.matchMedia
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 767px'), media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => { window.matchMedia = original })

  it('a row of day chips picks the day shown; + opens the days inline; rows do not drag', () => {
    const w = show()
    const chips = within(screen.getByRole('group', { name: 'Days' }))
    expect(chips.getAllByRole('button')).toHaveLength(7)
    expect(chips.getByRole('button', { name: /Saturday, October 3/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Pick up the keys')).toBeNull()
    fireEvent.click(chips.getByRole('button', { name: /Wednesday, October 7/ }))
    expect(screen.getByText('Pick up the keys')).toBeInTheDocument()
    expect(screen.getByText('Book the cabin').closest('li')).toHaveAttribute('draggable', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Give Book the cabin a day' }))
    const inline = screen.getByRole('group', { name: 'Give it a day: Book the cabin' })
    expect(inline).toHaveClass('is-inline')
    fireEvent.click(within(inline).getByRole('button', { name: /Thursday, October 8/ }))
    expect(w.placeTask).toHaveBeenCalledWith(cabin, dayOf(5))
  })
})
