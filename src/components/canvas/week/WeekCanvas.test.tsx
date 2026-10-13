import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Task } from '@/types/task'
import { WeekCanvas, type CanvasDay, type WeekCanvasWriters } from './WeekCanvas'
import { buildShelf, type ShelfGroup } from './weekShelf'

// The week composition (2026-10-10, calendar first 2026-10-12): seven equal
// days are the page; Still to place waits behind one line and opens above
// them; + gives a row a day; drag places it; done waits behind one "Show
// done" for the week.

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
  putOnWeek: vi.fn(), assign: vi.fn(), setArea: vi.fn(), moveUnder: vi.fn(),
  moveUnderOptions: vi.fn((t: Task) => ({
    item: { key: `3:${t.id}`, id: t.id, title: t.title, level: 3, parent: t.sourceId ? `2:${t.sourceId}` : null, task: t },
    parents: [trip, paper].map((m) => ({ key: `2:${m.id}`, id: m.id, title: m.title, level: 2, parent: null, task: m })),
  })),
})

function days(): CanvasDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = dayOf(i)
    return {
      date: d, key: key(d),
      weather: i === 0 ? <span role="img" aria-label="Sunny, high 64°, low 51°">64°</span> : undefined,
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
    milestones: [{ id: 'm1', title: trip.title, completed: false, context: 'family' }, { id: 'm2', title: paper.title, completed: false }],
    now: new Date(2026, 9, 3, 9),
  })
}

// Most tests work on the shelf: open it, as a person would.
const show = (w = writers(), extra: Partial<Parameters<typeof WeekCanvas>[0]> = {}, open = true) => {
  render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[{ id: 'r1', title: 'Mow the lawn' }]}
    monthName="October" isCurrent writers={w} {...extra} />)
  if (open && !extra.focusAdd) fireEvent.click(screen.getByRole('button', { name: 'Show' }))
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

  it('a milestone put on the week itself stands in its own card, said quietly', () => {
    const itself = task({ ...trip, bucket: 'week' })
    const g = buildShelf({ weekTasks: [itself], tasks: [itself], weekStart, milestones: [{ id: 'm1', title: trip.title, completed: false, onWeek: true }], now: new Date(2026, 9, 3, 9) })
    expect(g[0].milestone?.id).toBe('m1')
    expect(g[0].rows[0]).toMatchObject({ task: itself, meta: 'the month goal itself' })
  })

  it('a day that passed undone comes back with a quiet “from Fri”', () => {
    const missed = task({ id: 'm', title: 'Return books', scheduledFor: new Date(2026, 9, 9), isAllDay: true })
    const g = buildShelf({ weekTasks: [missed], tasks: [missed], weekStart, milestones: [], now: new Date(2026, 9, 10, 9) })
    expect(g[0].rows[0].meta).toBe('from Fri')
  })
})

describe('WeekCanvas — Still to place', () => {
  it('groups actions under the milestone they serve, the no-goal card dashed and last, routines in their own card', () => {
    show()
    const region = screen.getByRole('region', { name: 'Still to place' })
    expect(within(region).getByText('Drag onto a day, or press + to give it a day')).toBeInTheDocument()
    const groups = within(region).getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(groups).toEqual(['Plan the autumn trip', 'Routines to place', 'Not under an October goal'])
    const tripCard = within(screen.getByRole('region', { name: 'Plan the autumn trip' }))
    expect(tripCard.getAllByText('Plan the autumn trip')).toHaveLength(1)
    expect(tripCard.getByText('Book the cabin')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Not under an October goal' })).toHaveClass('is-unlinked')
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
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add a task' }))
    const box = head().getByRole('textbox', { name: 'Add a task for Plan the autumn trip' })
    fireEvent.change(box, { target: { value: 'Pack the tent' } })
    fireEvent.submit(box.closest('form')!)
    expect(w.addAction).toHaveBeenCalledWith('Pack the tent', 'm1', 'family')
  })

  it('the no-goal card’s “+ Add” writes an action that serves nothing', () => {
    const w = show()
    fireEvent.click(within(screen.getByRole('region', { name: 'Not under an October goal' })).getByRole('button', { name: '+ Add' }))
    const box = screen.getByRole('textbox', { name: 'Add something for this week' })
    fireEvent.change(box, { target: { value: 'Fix the gate' } })
    fireEvent.submit(box.closest('form')!)
    expect(w.addAction).toHaveBeenCalledWith('Fix the gate', undefined, undefined)
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

// Scott, 2026-10-12: the column of October goals repeated the goal cards
// and, stacked full width, pushed the days off the screen. Each goal is
// named once, on its card, and a task is filed by dropping it on one.
describe('WeekCanvas — filing a task under a goal', () => {
  const card = (name: string) => screen.getByRole('region', { name })
  it('has no separate column of goals', () => {
    show()
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.queryByRole('button', { name: /Show October goals/ })).toBeNull()
  })
  it('a shelf row dropped on a goal card is filed under it; its own goal is not a target; folded goals open to take it', () => {
    const w = show()
    expect(screen.queryByRole('region', { name: 'Get the paperwork in order' })).toBeNull()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Book the cabin').closest('li')!, { dataTransfer: d.t })
    d.arm()
    expect(card('Plan the autumn trip')).not.toHaveClass('is-drop-ok')
    const target = card('Get the paperwork in order')
    expect(target).toHaveClass('is-drop-ok')
    fireEvent.dragOver(target, { dataTransfer: d.t }); fireEvent.drop(target, { dataTransfer: d.t })
    expect(w.moveUnder).toHaveBeenCalledWith(cabin, expect.objectContaining({ id: 'm2' }))
    expect(w.placeTask).not.toHaveBeenCalled()
  })
  it('a day’s task dropped on a goal card is filed, not taken off its day', () => {
    const w = show()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Pick up the keys').closest('li')!, { dataTransfer: d.t })
    d.arm()
    const target = card('Plan the autumn trip')
    fireEvent.dragOver(target, { dataTransfer: d.t }); fireEvent.drop(target, { dataTransfer: d.t })
    expect(w.moveUnder).toHaveBeenCalledWith(placed, expect.objectContaining({ id: 'm1' }))
    expect(w.unplaceTask).not.toHaveBeenCalled()
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
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent).slice(0, 4)).toEqual(['Move to another day', 'Back to still to place', 'Open', 'Complete'])
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

// Follow-up 2026-10-10: what the week page could do before, back inside the
// approved structure — secondary actions in the ⋯ menus, no new rows.
describe('WeekCanvas — restored functions', () => {
  // 2026-10-13 review: a month goal with nothing this week is a planning
  // decision, not the tray's. It shows only while a task is dragged, so the
  // task can still go under it.
  it('keeps a month goal with nothing this week out of the tray, except as a drop target while dragging', () => {
    show()
    expect(screen.queryByRole('region', { name: 'Get the paperwork in order' })).toBeNull()
    expect(screen.queryByText(/goals? with nothing this week/)).toBeNull()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Book the cabin').closest('li')!, { dataTransfer: d.t })
    expect(screen.getByRole('region', { name: 'Get the paperwork in order' })).toBeInTheDocument()
  })

  it('a card’s + Add starts in its milestone’s life area', () => {
    const w = show()
    const card = within(screen.getByRole('region', { name: 'Plan the autumn trip' }))
    fireEvent.click(card.getByRole('button', { name: '+ Add' }))
    const box = card.getByRole('textbox', { name: 'Add a task for Plan the autumn trip' })
    expect(box.closest('form')!.querySelector('.wc-composer-area')).not.toBeNull()
    fireEvent.change(box, { target: { value: 'Pack the tent' } })
    fireEvent.submit(box.closest('form')!)
    expect(w.addAction).toHaveBeenCalledWith('Pack the tent', 'm1', 'family')
  })

  it('the no-goal card’s + Add starts in the page’s add area', () => {
    const w = show(writers(), { defaultArea: 'work' })
    fireEvent.click(within(screen.getByRole('region', { name: 'Not under an October goal' })).getByRole('button', { name: '+ Add' }))
    const box = screen.getByRole('textbox', { name: 'Add something for this week' })
    fireEvent.change(box, { target: { value: 'Fix the gate' } })
    fireEvent.submit(box.closest('form')!)
    expect(w.addAction).toHaveBeenCalledWith('Fix the gate', undefined, 'work')
  })

  it('a milestone not yet on the week can be put on it from its ⋯', () => {
    const w = show()
    fireEvent.click(screen.getByRole('button', { name: 'More for Plan the autumn trip' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Put on this week' }))
    expect(w.putOnWeek).toHaveBeenCalledWith('m1')
  })

  it('a shelf row’s ⋯ sets its people, its life area, and the milestone it serves', () => {
    const w = show(writers(), { members: [{ id: 'sk', name: 'Scott' }, { id: 'ir', name: 'Iris' }] })
    const more = () => fireEvent.click(screen.getByRole('button', { name: 'More for Book the cabin' }))
    more()
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['People…', 'Life area…', 'Move under…'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'People…' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Iris' }))
    expect(w.assign).toHaveBeenCalledWith(cabin, ['ir'])
    fireEvent.keyDown(screen.getByRole('menu', { name: 'People for Book the cabin' }), { key: 'Escape' })
    more()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Life area…' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Work' }))
    expect(w.setArea).toHaveBeenCalledWith(cabin, 'work')
    more()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move under…' }))
    const menu = within(screen.getByRole('menu', { name: /Move Book the cabin under/ }))
    expect(menu.getByRole('menuitemradio', { name: 'Plan the autumn trip' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(menu.getByRole('menuitemradio', { name: 'Get the paperwork in order' }))
    expect(w.moveUnder).toHaveBeenCalledWith(cabin, expect.objectContaining({ id: 'm2' }))
  })

  it('a day’s task carries the same secondary actions in its ⋯', () => {
    show()
    fireEvent.click(within(screen.getByTestId('journal-day-2026-10-07')).getByRole('button', { name: 'More for Pick up the keys' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(
      ['Move to another day', 'Back to still to place', 'Open', 'Complete', 'People…', 'Life area…', 'Move under…'])
  })

  it('each day wears its forecast, small, in its header', () => {
    show()
    expect(within(screen.getByTestId('journal-day-2026-10-03')).getByRole('img', { name: /Sunny, high 64°/ })).toBeInTheDocument()
  })

  it('every-day routines are written once, with a quiet Show daily / Hide daily', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()}
      rhythm={[{ label: 'Every day', items: [{ title: 'Walk the dog', openId: 'routine-r9-day0' }] }]} daily={{ shown: false, onToggle }} />)
    expect(screen.getByText('Walk the dog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show daily' }))
    expect(onToggle).toHaveBeenCalled()
    rerender(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()}
      rhythm={[{ label: 'Every day', items: [] }]} daily={{ shown: true, onToggle }} />)
    expect(screen.getByText('Daily routines are in each day')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide daily' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('arriving to write opens the shelf with the no-goal box ready', () => {
    show(writers(), { focusAdd: true })
    expect(screen.getByRole('textbox', { name: 'Add something for this week' })).toBeInTheDocument()
  })
})

// Scott, 2026-10-12: a page left open showed last week as if it were this one.
describe('a past week says so', () => {
  it('names a past week and links back to this one; the current week does not', async () => {
    vi.setSystemTime(new Date(2026, 9, 12, 9)) // Mon Oct 12: Oct 3–9 is last week
    const { MemoryRouter } = await import('react-router-dom')
    const { unmount } = render(<MemoryRouter><WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]}
      monthName="October" isCurrent={false} writers={writers()} /></MemoryRouter>)
    expect(screen.getByText('Past week')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to this week' })).toHaveAttribute('href', '/week?view=alongside')
    unmount()
    vi.setSystemTime(new Date(2026, 9, 3, 9))
    show()
    expect(screen.queryByText('Past week')).toBeNull()
  })
})

// Scott, 2026-10-12: the days are the page. Work with no day waits behind one
// line under the title, and the days follow the row rulebook.
describe('WeekCanvas — calendar first', () => {
  it('opens on the days; the shelf is one line that says what has no day and opens in place', () => {
    show(writers(), {}, false)
    expect(screen.queryByRole('region', { name: 'Still to place' })).toBeNull()
    // Book the cabin, Call the bank, Service the car; and Mow the lawn.
    const line = screen.getByText(/^Still to place · 3 tasks · 1 routine ·/)
    // Inbox, last week and the month's goals are the planning session's.
    expect(screen.getByText('Inbox, last week and October’s goals come up when you plan.')).toBeInTheDocument()
    expect(screen.queryByText(/from last week/)).toBeNull()
    const toggle = within(line).getByRole('button', { name: 'Show' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('region', { name: 'Still to place' })).toBeInTheDocument()
    expect(within(line).getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(within(line).getByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('region', { name: 'Still to place' })).toBeNull()
  })

  it('with nothing to count, names the shelf without a number (the lists may still be loading)', () => {
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={[]} routinesToPlace={[]} monthName="October" isCurrent writers={writers()} />)
    expect(screen.getByText(/^Still to place ·/)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing/)).toBeNull()
  })

  it('a day’s rows show who carries them; an id the household doesn’t know shows nothing', () => {
    const d = days()
    d[4].items[0] = { ...d[4].items[0], people: ['ir', 'ghost'] }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()}
      members={[{ id: 'ir', name: 'Iris', initials: 'IR', color: 'purple' }]} />)
    const row = screen.getByText('Pick up the keys').closest('li')!
    expect(within(row).getByLabelText('Iris')).toBeInTheDocument()
    expect(within(row).getByText('IR')).toBeInTheDocument()
  })

  it('names each day’s free time at its foot', () => {
    const d = days()
    d[2] = { ...d[2], free: 'Calendar clear 10a–9p' }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()} />)
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByText('Calendar clear 10a–9p')).toHaveClass('wk-free')
  })

  it('draws the kids’ specials as one chip each', () => {
    const d = days()
    d[3] = { ...d[3], specials: [{ who: 'Ella', special: 'Library' }, { who: 'Kaleb', special: 'Art' }] }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()} />)
    const day = within(screen.getByTestId('journal-day-2026-10-06'))
    expect(day.getByText('Library').closest('.today-special-chip')).toHaveTextContent('EllaLibrary')
    expect(day.getByText('Art').closest('.today-special-chip')).toHaveTextContent('KalebArt')
  })

  it('a stay across days is one bar over its columns, still said in words for a screen reader', () => {
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()}
      spans={[{ id: 'event-safta', when: 'Thu–Fri', from: '2026-10-08', to: '2026-10-09', title: 'Safta visiting', tail: ', through Tue Oct 13' }]} />)
    const bar = screen.getByText('Safta visiting', { selector: '.wc-bar-title' }).closest('button')!
    expect(bar).toHaveStyle({ gridColumn: '6 / 8' })
    expect(within(bar).getByText('through Tue Oct 13')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Across these days' }).querySelector('li')).toHaveClass('has-bar')
  })

  it('a routine on a day is marked as one', () => {
    const d = days()
    d[1].items = [{ id: 'routine-r2-day1', kind: 'routine', title: 'Piano', completed: false, routineId: 'r2' }]
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()} />)
    expect(screen.getByText('Piano').closest('li')).toHaveClass('is-routine')
  })
})

// 2026-10-13 review: a weekend folds because it has passed — responsive to
// the date. An upcoming weekend stays open; a past week folds nothing.
describe('WeekCanvas — days gone by', () => {
  const withWeekend = () => {
    const d = days()
    d[0] = { ...d[0], events: [{ id: 'event-bb', kind: 'event', title: 'Kaleb’s baseball', completed: false }],
      items: [{ id: 'task-u', kind: 'task', title: 'Throw out umbrella', completed: false, task: task({ id: 'u', title: 'Throw out umbrella' }) }] }
    return d
  }

  it('this week’s weekend, once over, folds to one line that names what happened and what was left, and opens', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 9)) // Tue Oct 6: Sat 3 and Sun 4 are over
    render(<WeekCanvas weekStart={weekStart} days={withWeekend()} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()} />)
    expect(screen.queryByTestId('journal-day-2026-10-03')).toBeNull()
    expect(screen.queryByTestId('journal-day-2026-10-04')).toBeNull()
    const fold = screen.getByRole('button', { name: /Weekend/ })
    expect(fold).toHaveTextContent('Sat 3 – Sun 4')
    expect(fold).toHaveTextContent('Kaleb’s baseball')
    expect(fold).toHaveTextContent('Not done: Throw out umbrella')
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(fold)
    expect(screen.getByTestId('journal-day-2026-10-03')).toBeInTheDocument()
    expect(fold).toHaveAttribute('aria-expanded', 'true')
  })

  it('steps back the days gone by; today and the days ahead stay at full strength', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 9))
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()} />)
    expect(screen.getByTestId('journal-day-2026-10-05')).toHaveClass('is-past')
    expect(screen.getByTestId('journal-day-2026-10-06')).toHaveClass('is-today')
    expect(screen.getByTestId('journal-day-2026-10-06')).not.toHaveClass('is-past')
    expect(screen.getByTestId('journal-day-2026-10-07')).not.toHaveClass('is-past')
  })

  it('a weekend still ahead stays open in full', () => {
    // Sat Oct 3 is today: the weekend has not passed.
    render(<WeekCanvas weekStart={weekStart} days={withWeekend()} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent writers={writers()} />)
    expect(screen.queryByRole('button', { name: /^Weekend/ })).toBeNull()
    expect(screen.getByTestId('journal-day-2026-10-03')).toBeInTheDocument()
    expect(screen.getByTestId('journal-day-2026-10-04')).toBeInTheDocument()
  })

  it('a week gone by folds nothing: it has no days ahead to make room for', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    const { MemoryRouter } = await import('react-router-dom')
    render(<MemoryRouter><WeekCanvas weekStart={weekStart} days={withWeekend()} shelf={shelf()} routinesToPlace={[]} monthName="October" isCurrent={false} writers={writers()} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /^Weekend/ })).toBeNull()
    expect(screen.getByTestId('journal-day-2026-10-03')).toBeInTheDocument()
  })
})
