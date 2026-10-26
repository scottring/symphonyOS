import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act, createEvent } from '@testing-library/react'
import { useState } from 'react'
import { reorderTasksToIndex } from '@/lib/today/taskOrdering'
import { inDayOrder } from '@/lib/week/journalDays'
import type { Task } from '@/types/task'
import { WeekCanvas, type CanvasDay, type WeekCanvasWriters } from './WeekCanvas'
import { buildShelf, type ShelfGroup } from './weekShelf'
import { WEEK_PREF_KEYS } from '@/hooks/useWeekViewPrefs'

// The week composition (2026-10-10, calendar first 2026-10-12): seven equal
// days are the page; work with no day sits in one quiet "No day yet" line
// under the title; drag places it; done waits behind "Show done" in the
// header's ⋯ menu (calm pass 2).

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
  placeRoutine: vi.fn(), moveRoutine: vi.fn(), open: vi.fn(), foreignDrop: vi.fn(),
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

const show = (w = writers(), extra: Partial<Parameters<typeof WeekCanvas>[0]> = {}) => {
  render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[{ id: 'r1', title: 'Mow the lawn' }]}
    isCurrent writers={w} {...extra} />)
  return w
}

const dt = () => {
  const data: Record<string, string> = {}
  const t = { setData: (k: string, v: string) => { data[k] = v }, getData: (k: string) => data[k] ?? '', types: [] as string[], effectAllowed: '', dropEffect: '' }
  return { t, data, arm: () => { t.types = Object.keys(data) } }
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 3, 9)) })
afterEach(() => { vi.useRealTimers(); for (const k of Object.values(WEEK_PREF_KEYS)) localStorage.removeItem(k); for (const k of ['symphony-strip-tab:week', 'symphony-strip-open:week']) localStorage.removeItem(k) })

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

describe('WeekCanvas — drag', () => {
  // Scott 2026-10-19: a timed event drags to another day, keeping its time.
  const movableDays = (movable = true) => days().map((d, i) => i === 2
    ? { ...d, events: [{ id: 'event-e1', kind: 'event' as const, title: 'Dentist', time: new Date(2026, 9, 5, 9), end: new Date(2026, 9, 5, 10), completed: false, movable }] }
    : d)
  const dentist = () => screen.getByRole('button', { name: /Dentist/ })

  it('a movable event dragged to another day is handed to moveEvent with that day', () => {
    const w = { ...writers(), moveEvent: vi.fn() }
    render(<WeekCanvas weekStart={weekStart} days={movableDays()} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
    expect(dentist()).toHaveAttribute('draggable', 'true')
    const d = dt()
    fireEvent.dragStart(dentist(), { dataTransfer: d.t })
    d.arm()
    const target = screen.getByTestId(`journal-day-${key(dayOf(4))}`)
    fireEvent.dragOver(target, { dataTransfer: d.t })
    expect(target).toHaveClass('is-over')
    fireEvent.drop(target, { dataTransfer: d.t })
    expect(w.moveEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-e1', title: 'Dentist' }), dayOf(4))
    expect(w.foreignDrop).not.toHaveBeenCalled()
  })

  it('dropped back on its own day, an event does not move', () => {
    const w = { ...writers(), moveEvent: vi.fn() }
    render(<WeekCanvas weekStart={weekStart} days={movableDays()} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
    const d = dt()
    fireEvent.dragStart(dentist(), { dataTransfer: d.t })
    d.arm()
    fireEvent.drop(screen.getByTestId(`journal-day-${key(dayOf(2))}`), { dataTransfer: d.t })
    expect(w.moveEvent).not.toHaveBeenCalled()
  })

  it('an event that may not move (view-only, all-day) or a page that cannot write events does not drag', () => {
    const w = { ...writers(), moveEvent: vi.fn() }
    const { unmount } = render(<WeekCanvas weekStart={weekStart} days={movableDays(false)} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
    expect(dentist()).not.toHaveAttribute('draggable', 'true')
    unmount()
    render(<WeekCanvas weekStart={weekStart} days={movableDays()} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()} />)
    expect(dentist()).not.toHaveAttribute('draggable', 'true')
  })

  it('an event in flight is not a plan row: the No day yet line ignores it', () => {
    const w = { ...writers(), moveEvent: vi.fn() }
    render(<WeekCanvas weekStart={weekStart} days={movableDays()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={w} />)
    const d = dt()
    fireEvent.dragStart(dentist(), { dataTransfer: d.t })
    d.arm()
    expect(d.data['application/x-symphony-plan']).toBeUndefined()
    fireEvent.drop(screen.getByText(/^No day yet/).closest('.hs-drop')!, { dataTransfer: d.t })
    expect(w.unplaceTask).not.toHaveBeenCalled()
    expect(w.moveEvent).not.toHaveBeenCalled()
  })

  it('a day’s row dropped on the No day yet line loses its day', () => {
    const w = show()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Pick up the keys').closest('li')!, { dataTransfer: d.t })
    d.arm()
    const line = screen.getByText(/^No day yet/).closest('.hs-drop')!
    fireEvent.dragOver(line, { dataTransfer: d.t })
    expect(line).toHaveClass('is-over')
    fireEvent.drop(line, { dataTransfer: d.t })
    expect(w.unplaceTask).toHaveBeenCalledWith(placed)
  })

  it('with nothing unplaced the strip says so, and while a day’s row is dragged it takes the drop', () => {
    const w = writers()
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
    expect(screen.getByText('Everything on this week has a day.')).toBeInTheDocument()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Pick up the keys').closest('li')!, { dataTransfer: d.t })
    d.arm()
    const line = screen.getByText('Drop here to take its day away').closest('.hs-drop')!
    fireEvent.drop(line, { dataTransfer: d.t })
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
describe('WeekCanvas — the strip’s month tab', () => {
  it('a month line drags onto a day; a month goal never gets a day', async () => {
    const { MemoryRouter } = await import('react-router-dom')
    const w = { ...writers(), pullLine: vi.fn() }
    const line = task({ id: 'ml', title: 'Office clean up', bucket: 'month' })
    const goal = task({ id: 'mg', title: 'Get the paperwork in order', bucket: 'month', isGoal: true })
    render(<MemoryRouter><WeekCanvas weekStart={weekStart} days={days()} shelf={[]} routinesToPlace={[]} isCurrent writers={w}
      month={{ word: 'October', href: '/month', lines: [{ task: line, meta: null, onWeek: false }, { task: goal, meta: null, onWeek: false }] }} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('tab', { name: 'October' }))
    expect(screen.getByText('Get the paperwork in order').closest('li')).toHaveAttribute('draggable', 'false')
    for (const [id, title] of [['ml', 'Office clean up'], ['mg', 'Get the paperwork in order']]) {
      const d = dt()
      d.t.setData('application/x-symphony-plan', JSON.stringify({ kind: 'task', id, date: '2026-10-03', title }))
      d.arm()
      fireEvent.drop(screen.getByTestId('journal-day-2026-10-06'), { dataTransfer: d.t })
    }
    expect(w.pullLine).toHaveBeenCalledTimes(1)
    expect(w.pullLine).toHaveBeenCalledWith(line, dayOf(3))
  })
})

describe('WeekCanvas — deleting from No day yet', () => {
  it('When ▾ offers Delete, which hands the task to the page (it offers Undo)', () => {
    const w = { ...writers(), triageTask: vi.fn(), deleteTask: vi.fn() }
    show(w)
    fireEvent.click(screen.getByRole('button', { name: 'When for Call the bank' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'When for Call the bank' })).getByRole('button', { name: 'Delete' }))
    expect(w.deleteTask).toHaveBeenCalledWith(bank)
  })
})

describe('WeekCanvas — filing a task under a goal', () => {
  it('has no separate column of goals: the strip is the only side panel', () => {
    show()
    expect(screen.getAllByRole('complementary').map((c) => c.getAttribute('aria-label'))).toEqual(['Week strip'])
    expect(screen.queryByRole('button', { name: /Show October goals/ })).toBeNull()
  })
})

describe('WeekCanvas — the days', () => {
  it('draws seven equal days: events as chips with their time, placed work as rows', () => {
    show()
    const strip = screen.getByRole('region', { name: 'The days' })
    expect(within(strip).getAllByRole('region')).toHaveLength(7)
    expect(screen.getByTestId('journal-day-2026-10-03')).toHaveClass('is-today')
    expect(screen.getByTestId('journal-day-2026-10-04')).toHaveClass('is-empty')
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByRole('button', { name: /Dentist/ })).toHaveTextContent('9aDentist')
  })

  it('a day row has no ⋯ menu: tick, drag and tap-to-open only', () => {
    const w = writers()
    show(w)
    const row = screen.getByText('Pick up the keys').closest('li')!
    expect(within(row).queryByRole('button', { name: /more/i })).toBeNull()
    fireEvent.click(within(row).getByText('Pick up the keys'))
    expect(w.open).toHaveBeenCalled()
  })

  // Calm pass 2: the choice lives in the header's ⋯ menu; the page has no
  // link of its own.
  it('done work shows only once "Show done" is on', () => {
    show()
    expect(screen.queryByText('Old receipt')).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Show|Hide) done$/ })).toBeNull()
    act(() => { localStorage.setItem(WEEK_PREF_KEYS.done, 'shown'); window.dispatchEvent(new Event('symphony:week-view-prefs')) })
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

  it('selects the one day Symphony points at, once, and lets a tap choose another', () => {
    const d = days()
    const el = (pointing: Parameters<typeof WeekCanvas>[0]['pointing']) => (
      <WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} pointing={pointing} />
    )
    const { rerender } = render(el(null))
    rerender(el({ dates: new Set([d[4].key]), taskIds: new Set() }))
    expect(screen.getByTestId(`journal-day-${d[4].key}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Wednesday/, pressed: true })).toHaveClass('is-pointed')
    expect(screen.queryByTestId(`journal-day-${d[1].key}`)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(d[1].date.toLocaleDateString('en-US', { weekday: 'long' })) }))
    expect(screen.getByTestId(`journal-day-${d[1].key}`)).toBeInTheDocument()
  })

  // Calm pass 2: the week sentence and last week's progress moved to the
  // header's fact line (WeekV2); the phone canvas draws neither, nor a
  // Show done link.
  it('the phone canvas has no sentence, no progress line and no Show done', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 9)) // Wed
    show()
    expect(document.querySelector('.wc-week-sentence')).toBeNull()
    expect(screen.queryByText(/done last week/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Show|Hide) done$/ })).toBeNull()
  })

  it('a row of day chips picks the day shown; No day yet chips show and open on tap, but do not drag', () => {
    const w = show()
    const chips = within(screen.getByRole('group', { name: 'Days' }))
    expect(chips.getAllByRole('button')).toHaveLength(7)
    expect(chips.getByRole('button', { name: /Saturday, October 3/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Pick up the keys')).toBeNull()
    fireEvent.click(chips.getByRole('button', { name: /Wednesday, October 7/ }))
    expect(screen.getByText('Pick up the keys')).toBeInTheDocument()
    expect(screen.getByText('Book the cabin')).toHaveAttribute('draggable', 'false')
    fireEvent.click(screen.getByText('Book the cabin'))
    expect(w.open).toHaveBeenCalledWith('task-a')
    fireEvent.click(screen.getByRole('button', { name: 'Give Book the cabin a day' }))
    const inline = screen.getByRole('group', { name: 'Give it a day: Book the cabin' })
    fireEvent.click(within(inline).getByRole('button', { name: /Thursday, October 8/ }))
    expect(w.placeTask).toHaveBeenCalledWith(cabin, dayOf(5))
    fireEvent.click(screen.getByRole('button', { name: 'Give Mow the lawn a day' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Give it a day: Mow the lawn' })).getByRole('button', { name: /Sunday, October 4/ }))
    expect(w.placeRoutine).toHaveBeenCalledWith({ id: 'r1', title: 'Mow the lawn' }, dayOf(1))
  })
})

// Follow-up 2026-10-10: what the week page could do before, back inside the
// approved structure — secondary actions in the ⋯ menus, no new rows.
describe('WeekCanvas — restored functions', () => {
  // 2026-10-13 review: a month goal with nothing this week is a planning
  // decision, not the tray's. It shows only while a task is dragged, so the
  // task can still go under it.
  // Calm pass 2: weather is off until turned on (⋯), remembered per device.
  it('weather is hidden by default', () => {
    show()
    expect(within(screen.getByTestId('journal-day-2026-10-03')).queryByRole('img', { name: /Sunny, high 64°/ })).toBeNull()
  })

  it('turned on, each day wears its forecast, small, in its header', () => {
    localStorage.setItem(WEEK_PREF_KEYS.weather, 'shown')
    show()
    expect(within(screen.getByTestId('journal-day-2026-10-03')).getByRole('img', { name: /Sunny, high 64°/ })).toBeInTheDocument()
  })

  // The strip (2026-10-25): every-day routines are Today's; the Routines tab
  // names them in one line and the days carry no band.
  it('every-day routines are named once, in the Routines tab, as Today’s', async () => {
    const { MemoryRouter } = await import('react-router-dom')
    render(<MemoryRouter><WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()}
      rhythm={[
        { label: 'Every day', items: [{ title: '7:30p Kids bedtime', openId: 'routine-bed' }] },
        { label: 'Weekdays', items: [{ title: '6:45a School morning', openId: 'routine-school' }] },
      ]} /></MemoryRouter>)
    expect(document.querySelector('.wc-rhythm')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Routines/ }))
    expect(screen.getByText(/Every-day routines are on/)).toHaveTextContent('Every-day routines are on Today: 7:30p Kids bedtime, 6:45a School morning.')
  })
})

// Scott, 2026-10-12: a page left open showed last week as if it were this one.
describe('a past week says so', () => {
  it('names a past week and links back to this one; the current week does not', async () => {
    vi.setSystemTime(new Date(2026, 9, 12, 9)) // Mon Oct 12: Oct 3–9 is last week
    const { MemoryRouter } = await import('react-router-dom')
    const { unmount } = render(<MemoryRouter><WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]}
      isCurrent={false} writers={writers()} /></MemoryRouter>)
    expect(screen.getByText('Past week')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to this week' })).toHaveAttribute('href', '/week?view=alongside')
    unmount()
    vi.setSystemTime(new Date(2026, 9, 3, 9))
    show()
    expect(screen.queryByText('Past week')).toBeNull()
  })
})

// Scott, 2026-10-12: the days are the page. Work with no day waits under the
// days (2026-10-14), and the days follow the row rulebook.
describe('WeekCanvas — calendar first', () => {
  it('things with no day are listed in the strip, draggable; a routine that needs a day is in Routines', () => {
    show()
    expect(screen.queryByRole('region', { name: 'Still to place' })).toBeNull()
    expect(screen.getByText('No day yet · 3')).toBeInTheDocument()
    const noday = within(screen.getByRole('list', { name: 'No day yet' }))
    for (const t of ['Book the cabin', 'Call the bank', 'Service the car']) expect(noday.getByText(t)).toHaveAttribute('draggable', 'true')
    expect(noday.queryByText('Mow the lawn')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Routines/ }))
    expect(within(screen.getByRole('region', { name: 'Sometime this week' })).getByText('Mow the lawn')).toBeInTheDocument()
    // The week sentence is gone (calm pass 2): "Today: …" is the header's.
    expect(screen.queryByText(/wide open/)).toBeNull()
  })

  it('“place them one at a time” opens the deck on this week’s cards', () => {
    const onPlaceUnplaced = vi.fn()
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} onPlaceUnplaced={onPlaceUnplaced} />)
    fireEvent.click(screen.getByRole('button', { name: 'place them one at a time' }))
    expect(onPlaceUnplaced).toHaveBeenCalledTimes(1)
  })

  it('nothing without a day, nothing to place', () => {
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()} onPlaceUnplaced={vi.fn()} />)
    expect(screen.queryByRole('list', { name: 'No day yet' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'place them one at a time' })).toBeNull()
  })

  // The progress line is the header's fact line now (WeekV2).
  it('draws no progress line of its own', () => {
    show()
    expect(screen.queryByText(/done last week/)).toBeNull()
  })

  it('with nothing to place the strip says so in one line', () => {
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()} />)
    expect(screen.getByText('No day yet')).toBeInTheDocument()
    expect(screen.getByText('Everything on this week has a day.')).toBeInTheDocument()
  })

  it('a day’s rows show who carries them; an id the household doesn’t know shows nothing', () => {
    const d = days()
    d[4].items[0] = { ...d[4].items[0], people: ['ir', 'ghost'] }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()}
      members={[{ id: 'ir', name: 'Iris', initials: 'IR', color: 'purple' }]} />)
    const row = screen.getByText('Pick up the keys').closest('li')!
    expect(within(row).getByLabelText('Iris')).toBeInTheDocument()
    expect(within(row).getByText('IR')).toBeInTheDocument()
  })

  // Calm pass 2: free time is off until turned on (⋯), remembered per device.
  it('free time is hidden by default', () => {
    const d = days()
    d[2] = { ...d[2], free: 'Calendar clear 10a–9p' }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} />)
    expect(screen.queryByText(/Calendar clear/)).toBeNull()
  })

  it('turned on, names each day’s free time at its foot', () => {
    localStorage.setItem(WEEK_PREF_KEYS.freeTime, 'shown')
    const d = days()
    d[2] = { ...d[2], free: 'Calendar clear 10a–9p' }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} />)
    expect(within(screen.getByTestId('journal-day-2026-10-05')).getByText('Calendar clear 10a–9p')).toHaveClass('wk-free')
  })

  it('draws the kids’ specials as one chip each', () => {
    const d = days()
    d[3] = { ...d[3], specials: [{ who: 'Ella', special: 'Library' }, { who: 'Kaleb', special: 'Art' }] }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} />)
    const day = within(screen.getByTestId('journal-day-2026-10-06'))
    expect(day.getByText('Library').closest('.today-special-chip')).toHaveTextContent('EllaLibrary')
    expect(day.getByText('Art').closest('.today-special-chip')).toHaveTextContent('KalebArt')
  })

  it('a stay across days is one bar over its columns, still said in words for a screen reader', () => {
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()}
      spans={[{ id: 'event-safta', when: 'Thu–Fri', from: '2026-10-08', to: '2026-10-09', title: 'Safta visiting', tail: ', through Tue Oct 13' }]} />)
    const bar = screen.getByText('Safta visiting', { selector: '.wc-bar-title' }).closest('button')!
    expect(bar).toHaveStyle({ gridColumn: '6 / 8' })
    expect(within(bar).getByText('through Tue Oct 13')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Across these days' }).querySelector('li')).toHaveClass('has-bar')
  })

  // 2026-10-26: a routine on a day shows on that day too (Scott dragged one
  // onto Monday and it was nowhere on the grid); the tab is its overview.
  it('a routine on a day shows on its day and in the Routines tab under its day, done from there, and drags to another day', () => {
    const d = days()
    const piano = { id: 'routine-r2-day1', kind: 'routine' as const, title: 'Piano', completed: false, routineId: 'r2' }
    d[1].items = [piano]
    const w = writers()
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={w} />)
    expect(within(screen.getByTestId('journal-day-2026-10-04')).getByText('Piano')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Routines/ }))
    const group = within(screen.getByRole('region', { name: 'Sunday, October 4 routines' }))
    fireEvent.click(group.getByRole('button', { name: 'Done: Piano' }))
    expect(w.toggleRoutine).toHaveBeenCalledWith(piano, dayOf(1))
    const x = dt()
    fireEvent.dragStart(group.getByText('Piano').closest('li')!, { dataTransfer: x.t })
    x.arm()
    fireEvent.drop(screen.getByTestId('journal-day-2026-10-06'), { dataTransfer: x.t })
    expect(w.moveRoutine).toHaveBeenCalledWith(piano, '2026-10-04', dayOf(3))
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
    render(<WeekCanvas weekStart={weekStart} days={withWeekend()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} />)
    expect(screen.queryByTestId('journal-day-2026-10-03')).toBeNull()
    expect(screen.queryByTestId('journal-day-2026-10-04')).toBeNull()
    const fold = screen.getByRole('button', { name: /This past weekend/ })
    // One label: "This past weekend · Sat 3 – Sun 4 (open)", no Open link at the far end.
    expect(fold).toHaveTextContent('This past weekendSat 3 – Sun 4 (open)')
    expect(fold).toHaveTextContent('Kaleb’s baseball')
    expect(fold).not.toHaveTextContent('Not done')
    expect(fold).not.toHaveTextContent('Throw out umbrella')
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(fold)
    expect(screen.getByTestId('journal-day-2026-10-03')).toBeInTheDocument()
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    expect(fold).toHaveTextContent('Sat 3 – Sun 4 (fold)')
  })

  it('steps back the days gone by; today and the days ahead stay at full strength', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 9))
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} />)
    expect(screen.getByTestId('journal-day-2026-10-05')).toHaveClass('is-past')
    expect(screen.getByTestId('journal-day-2026-10-06')).toHaveClass('is-today')
    expect(screen.getByTestId('journal-day-2026-10-06')).not.toHaveClass('is-past')
    expect(screen.getByTestId('journal-day-2026-10-07')).not.toHaveClass('is-past')
  })

  it('a weekend still ahead stays open in full', () => {
    // Sat Oct 3 is today: the weekend has not passed.
    render(<WeekCanvas weekStart={weekStart} days={withWeekend()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} />)
    expect(screen.queryByRole('button', { name: /This past weekend/ })).toBeNull()
    expect(screen.getByTestId('journal-day-2026-10-03')).toBeInTheDocument()
    expect(screen.getByTestId('journal-day-2026-10-04')).toBeInTheDocument()
  })

  it('a week gone by folds nothing: it has no days ahead to make room for', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    const { MemoryRouter } = await import('react-router-dom')
    render(<MemoryRouter><WeekCanvas weekStart={weekStart} days={withWeekend()} shelf={shelf()} routinesToPlace={[]} isCurrent={false} writers={writers()} /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /This past weekend/ })).toBeNull()
    expect(screen.getByTestId('journal-day-2026-10-03')).toBeInTheDocument()
  })

  it('draws a proposed row dashed and inert', async () => {
    const { MemoryRouter } = await import('react-router-dom')
    const d = days()
    d[4].items.push({ id: 'proposed-s:0', kind: 'task', title: 'Reply to Christian', completed: false, proposed: true, time: new Date(2026, 9, 7, 9, 0) })
    const w = writers()
    render(<MemoryRouter><WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={w} /></MemoryRouter>)
    const row = screen.getByTestId('proposed-row')
    expect(row).toHaveTextContent('Reply to Christian')
    expect(row).toHaveTextContent('proposed, not saved yet')
    fireEvent.click(row)
    expect(w.open).not.toHaveBeenCalled()
  })

  it('a proposed skip is struck through and says why', async () => {
    const { MemoryRouter } = await import('react-router-dom')
    const d = days()
    d[4].items.push({ id: 'routine-bed-day4', kind: 'routine', routineId: 'bed', title: 'Bedtime', completed: false, proposed: true, struck: true, note: 'Skipped · this week' })
    render(<MemoryRouter><WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} /></MemoryRouter>)
    const row = screen.getByTestId('proposed-row')
    expect(row.querySelector('s')).toHaveTextContent('Bedtime')
    expect(row).toHaveTextContent('Skipped · this week')
  })
})

describe('what Symphony points at', () => {
  it('lights up the days and rows Symphony is talking about', () => {
    const d = days()
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()}
      pointing={{ dates: new Set([d[4].key]), taskIds: new Set(['p', 'c']) }} />)
    expect(screen.getByTestId(`journal-day-${d[4].key}`)).toHaveClass('is-pointed')
    expect(screen.getByTestId(`journal-day-${d[3].key}`)).not.toHaveClass('is-pointed')
    expect(screen.getByText('Pick up the keys').closest('li')).toHaveClass('is-pointed')
  })
})

describe('the dinner row', () => {
  it('a planned dinner opens its recipe; a calendar dinner opens its event', async () => {
    const { MemoryRouter } = await import('react-router-dom')
    const w = writers()
    const withDinners = days().map((d, i) => (i === 0
      ? { ...d, dinners: [{ id: 'meal-a', label: 'Butternut Squash Soup', href: '/meals/cook/r-soup' }] }
      : i === 1 ? { ...d, dinners: [{ id: 'event-g1', label: 'Tacos' }] } : d))
    render(<MemoryRouter><WeekCanvas weekStart={weekStart} days={withDinners} shelf={shelf()} routinesToPlace={[]} isCurrent writers={w} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Butternut Squash Soup' })).toHaveAttribute('href', '/meals/cook/r-soup')
    fireEvent.click(screen.getByRole('button', { name: 'Tacos' }))
    expect(w.open).toHaveBeenCalledWith('event-g1')
  })
})

// The phone keeps its No day yet list this stage.
describe('No day yet (phone)', () => {
  const original = window.matchMedia
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 767px'), media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => { window.matchMedia = original })
  it('a task with no day can be marked done from its ring', () => {
    const w = show()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call the bank' }))
    expect(w.toggleTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'c', title: 'Call the bank' }))
  })
  it('each task carries the when-chips (shown on hover); a pick sends it there', () => {
    const w = { ...writers(), triageTask: vi.fn(), scheduleTask: vi.fn() }
    show(w)
    expect(screen.queryByRole('button', { name: 'Triage' })).not.toBeInTheDocument()
    const actions = screen.getByRole('group', { name: 'When for Call the bank' })
    fireEvent.click(within(actions).getByRole('button', { name: /Someday/ }))
    expect(w.triageTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }), 'someday')
  })
  it('no when-chips without a way to triage, and none on routines', () => {
    show()
    expect(screen.queryByRole('group', { name: 'When for Call the bank' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'When for Mow the lawn' })).not.toBeInTheDocument()
  })
  it('a routine with no day has no check (it needs a day first)', () => {
    show()
    expect(screen.queryByRole('button', { name: 'Complete Mow the lawn' })).not.toBeInTheDocument()
  })
})

// Friday session, Stage 1: the page must never look endless; calm pass 2: a
// day shows its calendar events and at most two other things, timed or not.
// Your own name isn't news; the weekend gets more room.
describe('WeekCanvas — a few things a day', () => {
  const untimed = (n: number) => Array.from({ length: n }, (_, i) => {
    const t = task({ id: `u${i}`, title: `Errand ${i + 1}` })
    return { id: `task-u${i}`, kind: 'task' as const, title: t.title, completed: false, task: t }
  })

  it('a day with 7 untimed tasks shows 2 and "+5 more"; asked, all 7 and "Show less"', () => {
    const d = days()
    d[3] = { ...d[3], items: untimed(7) }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()} />)
    const day = screen.getByTestId('journal-day-2026-10-06')
    expect(within(day).getAllByText(/^Errand \d$/)).toHaveLength(2)
    fireEvent.click(within(day).getByRole('button', { name: '+5 more' }))
    expect(within(day).getAllByText(/^Errand \d$/)).toHaveLength(7)
    fireEvent.click(within(day).getByRole('button', { name: 'Show less' }))
    expect(within(day).getAllByText(/^Errand \d$/)).toHaveLength(2)
  })

  it('a day with 2 events and 5 tasks shows both events, 2 tasks and "+3 more"', () => {
    const d = days()
    const ev = (i: number) => ({ id: `event-y${i}`, kind: 'event' as const, title: `Appointment ${i + 1}`, time: new Date(2026, 9, 6, 9 + i), completed: false })
    d[3] = { ...d[3], events: [ev(0), ev(1)], items: untimed(5) }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()} />)
    const day = screen.getByTestId('journal-day-2026-10-06')
    expect(within(day).getAllByText(/^Appointment \d$/)).toHaveLength(2)
    expect(within(day).getAllByText(/^Errand \d$/)).toHaveLength(2)
    expect(within(day).getByRole('button', { name: '+3 more' })).toBeInTheDocument()
  })

  it('a timed event is never folded', () => {
    const d = days()
    const ev = (i: number) => ({ id: `event-x${i}`, kind: 'event' as const, title: `Meeting ${i + 1}`, time: new Date(2026, 9, 6, 9 + i), completed: false })
    d[3] = { ...d[3], events: Array.from({ length: 5 }, (_, i) => ev(i)), items: untimed(3) }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()} />)
    const day = screen.getByTestId('journal-day-2026-10-06')
    expect(within(day).getAllByText(/^Meeting \d$/)).toHaveLength(5)
    // Two things beside a full calendar.
    expect(within(day).getAllByText(/^Errand \d$/)).toHaveLength(2)
    expect(within(day).getByRole('button', { name: '+1 more' })).toBeInTheDocument()
  })

  it('a timed task folds: only calendar events always show', () => {
    const d = days()
    const at = (i: number) => { const t = task({ id: `w${i}`, title: `Timed ${i + 1}` }); return { id: `task-w${i}`, kind: 'task' as const, title: t.title, time: new Date(2026, 9, 6, 8 + i), completed: false, task: t } }
    d[3] = { ...d[3], items: [...Array.from({ length: 5 }, (_, i) => at(i)), ...untimed(3)] }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()} />)
    const day = screen.getByTestId('journal-day-2026-10-06')
    expect(within(day).getAllByText(/^Timed \d$/)).toHaveLength(2)
    expect(within(day).queryAllByText(/^Errand \d$/)).toHaveLength(0)
    expect(within(day).getByRole('button', { name: '+6 more' })).toBeInTheDocument()
  })

  it('no avatar when the viewer is the only one carrying it; another’s face shows', () => {
    const members = [{ id: 'me', name: 'Scott', initials: 'SK', color: 'blue' }, { id: 'ir', name: 'Iris', initials: 'IR', color: 'purple' }] as const
    const d = days()
    d[4].items[0] = { ...d[4].items[0], people: ['me'] }
    const { unmount } = render(<WeekCanvas weekStart={weekStart} days={d} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()}
      members={[...members]} viewerId="me" />)
    expect(within(screen.getByText('Pick up the keys').closest('li')!).queryByLabelText('Scott')).toBeNull()
    unmount()
    d[4].items[0] = { ...d[4].items[0], people: ['ir'] }
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()}
      members={[...members]} viewerId="me" />)
    expect(within(screen.getByText('Pick up the keys').closest('li')!).getByLabelText('Iris')).toBeInTheDocument()
  })

  it('a Saturday-first week: the first two columns (the weekend) are wider', () => {
    show()
    const strip = screen.getByTestId('journal-day-2026-10-03').parentElement!
    const cols = getComputedStyle(strip).gridTemplateColumns.replace(/\s+/g, '')
    expect(cols).toBe(['1.5fr', '1.5fr', '1fr', '1fr', '1fr', '1fr', '1fr'].map((f) => `minmax(0,${f})`).join(''))
  })
})

// Task 13 (Scott, 2026-10-18): with two things shown a day, the order IS the
// priority. Drag a task within its day to put it where it belongs: on the
// desk into the gap between two rows; on touch, press and hold, then drag.
describe('WeekCanvas — drag to order within a day', () => {
  const wed = dayOf(4) // Wed Oct 7
  const A = task({ id: 'ta', title: 'Alpha', scheduledFor: wed, isAllDay: true, sortOrder: 0 })
  const B = task({ id: 'tb', title: 'Bravo', scheduledFor: wed, isAllDay: true, sortOrder: 1000 })
  const C = task({ id: 'tc', title: 'Charlie', scheduledFor: wed, isAllDay: true, sortOrder: 2000 })
  const asItem = (t: Task) => ({ id: `task-${t.id}`, kind: 'task' as const, title: t.title, completed: t.completed, task: t })
  const dentist = { id: 'event-e2', kind: 'event' as const, title: 'Dentist', time: new Date(2026, 9, 7, 9), completed: false }
  const lunch = { id: 'event-e3', kind: 'event' as const, title: 'Lunch with Sam', time: new Date(2026, 9, 7, 12), completed: false }
  const withDay = (items: ReturnType<typeof asItem>[], events = [dentist, lunch]): CanvasDay[] =>
    days().map((d, i) => (i === 4 ? { ...d, events, items } : { ...d, items: [] }))
  const wedCol = () => screen.getByTestId('journal-day-2026-10-07')
  const shownTitles = () => within(within(wedCol()).getByRole('list', { name: 'Wednesday entries' })).getAllByRole('listitem')
    .map((li) => li.querySelector('.cw-title')?.textContent)
  // The rows stand 40px tall, one under another, from the top of the page.
  const layOut = () => {
    wedCol().querySelectorAll<HTMLElement>('li[data-order-id]').forEach((li, i) => {
      li.getBoundingClientRect = () => ({ top: i * 40, bottom: i * 40 + 40, left: 0, right: 100, width: 100, height: 40, x: 0, y: i * 40, toJSON: () => ({}) }) as DOMRect
    })
  }
  const dropAt = (target: Element, d: ReturnType<typeof dt>, clientY: number) => {
    const over = createEvent.dragOver(target, { dataTransfer: d.t })
    Object.defineProperty(over, 'clientY', { value: clientY })
    fireEvent(target, over)
    const drop = createEvent.drop(target, { dataTransfer: d.t })
    Object.defineProperty(drop, 'clientY', { value: clientY })
    fireEvent(target, drop)
  }
  const lift = (title: string) => {
    const d = dt()
    fireEvent.dragStart(within(wedCol()).getByText(title).closest('li')!, { dataTransfer: d.t })
    d.arm()
    return d
  }
  const orderWriters = () => ({ ...writers(), reorderTask: vi.fn() })

  it('dropping C between A and B asks to put C at place 1', () => {
    const w = orderWriters()
    render(<WeekCanvas weekStart={weekStart} days={withDay([A, B, C].map(asItem))} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
    fireEvent.click(within(wedCol()).getByRole('button', { name: '+1 more' }))
    layOut()
    const d = lift('Charlie')
    dropAt(wedCol(), d, 45)
    expect(w.reorderTask).toHaveBeenCalledWith(C, [A, B, C], 1)
    expect(w.moveTask).not.toHaveBeenCalled()
  })

  it('while dragging within its day, the gap it would land in is marked, not "Drop on"', () => {
    const w = orderWriters()
    render(<WeekCanvas weekStart={weekStart} days={withDay([A, B].map(asItem))} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
    layOut()
    const d = lift('Bravo')
    const over = createEvent.dragOver(wedCol(), { dataTransfer: d.t })
    Object.defineProperty(over, 'clientY', { value: 5 })
    fireEvent(wedCol(), over)
    expect(within(wedCol()).getByText('Alpha').closest('li')).toHaveClass('is-gap-above')
    expect(within(wedCol()).queryByText(/Drop on/)).toBeNull()
  })

  it('the day then shows the new top two', () => {
    function Page() {
      const [tasks, setTasks] = useState([A, B, C])
      const w = { ...writers(), reorderTask: (t: Task, dayTasks: Task[], to: number) => {
        const writes = reorderTasksToIndex(dayTasks.map((x) => x.id), t.id, to, new Map(dayTasks.map((x) => [x.id, x.sortOrder ?? null])))
        setTasks((was) => was.map((x) => { const hit = writes.find((wr) => wr.id === x.id); return hit ? { ...x, sortOrder: hit.sortOrder } : x }))
      } }
      return <WeekCanvas weekStart={weekStart} days={withDay(inDayOrder(tasks.map(asItem)))} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />
    }
    render(<Page />)
    expect(shownTitles()).toEqual(['Alpha', 'Bravo'])
    fireEvent.click(within(wedCol()).getByRole('button', { name: '+1 more' }))
    layOut()
    dropAt(wedCol(), lift('Charlie'), 5)
    fireEvent.click(within(wedCol()).getByRole('button', { name: 'Show less' }))
    expect(shownTitles()).toEqual(['Charlie', 'Alpha'])
    expect(within(wedCol()).getByRole('button', { name: '+1 more' })).toBeInTheDocument()
  })

  it('events that cannot move do not drag, and the order asked for holds tasks only', () => {
    const w = orderWriters()
    const walk = { id: 'routine-r9', kind: 'routine' as const, title: 'Walk Jax', time: new Date(2026, 9, 7, 7), completed: false, routineId: 'r9' }
    render(<WeekCanvas weekStart={weekStart} days={withDay([walk as never, ...[A, B].map(asItem)])} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
    // The routine shows on its day (2026-10-26) beside the two tasks.
    expect(within(wedCol()).getByText('Walk Jax')).toBeInTheDocument()
    const events = within(within(wedCol()).getByRole('list', { name: 'Wednesday events' })).getAllByRole('button')
    expect(events.map((b) => b.textContent)).toEqual(['9aDentist', '12pLunch with Sam'])
    for (const b of events) expect(b.closest('[draggable="true"]')).toBeNull()
    // The routine takes one of the day's two places; open the day to reach Bravo.
    fireEvent.click(within(wedCol()).getByRole('button', { name: /\+1 more/ }))
    layOut()
    dropAt(wedCol(), lift('Bravo'), 5)
    expect(w.reorderTask).toHaveBeenCalledWith(B, [A, B], 0)
    expect(within(within(wedCol()).getByRole('list', { name: 'Wednesday events' })).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['9aDentist', '12pLunch with Sam'])
  })

  it('dropping on another day still moves the task to that day, and orders nothing', () => {
    const w = orderWriters()
    render(<WeekCanvas weekStart={weekStart} days={withDay([A, B].map(asItem))} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
    const d = lift('Alpha')
    dropAt(screen.getByTestId('journal-day-2026-10-08'), d, 5)
    expect(w.moveTask).toHaveBeenCalledWith(A, dayOf(5))
    expect(w.reorderTask).not.toHaveBeenCalled()
  })

  describe('on touch', () => {
    const original = window.matchMedia
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('pointer: coarse'), media: query, onchange: null,
        addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia
      vi.useRealTimers()
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
      vi.setSystemTime(new Date(2026, 9, 3, 9))
    })
    afterEach(() => { window.matchMedia = original })
    const touch = (y: number) => ({ touches: [{ clientX: 10, clientY: y }], changedTouches: [{ clientX: 10, clientY: y }] })

    it('a press held for 250ms, then a move, starts the drag; the row does not use the browser’s own drag', () => {
      const w = orderWriters()
      render(<WeekCanvas weekStart={weekStart} days={withDay([A, B].map(asItem))} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
      const row = within(wedCol()).getByText('Alpha').closest('li')!
      expect(row).toHaveAttribute('draggable', 'false')
      fireEvent.touchStart(row, touch(10))
      act(() => { vi.advanceTimersByTime(260) })
      fireEvent.touchMove(document, touch(60))
      expect(screen.getByText('Drop here to take its day away')).toBeInTheDocument()
      expect(row).toHaveClass('is-lifted')
      fireEvent.touchEnd(document, touch(60))
      // dnd-kit takes its after-drag click guard off 50ms later.
      act(() => { vi.advanceTimersByTime(100) })
      expect(row).not.toHaveClass('is-lifted')
    })

    // Fix round 1: a trackpad or mouse on a touch device (the iPad's) drags
    // after 5px, as on Today, since the browser's own drag is off there.
    it('a mouse or trackpad on a touch device drags after a 5px move', () => {
      const w = orderWriters()
      render(<WeekCanvas weekStart={weekStart} days={withDay([A, B].map(asItem))} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
      const row = within(wedCol()).getByText('Alpha').closest('li')!
      fireEvent.mouseDown(row, { button: 0, clientX: 10, clientY: 10 })
      fireEvent.mouseMove(document, { clientX: 10, clientY: 30 })
      expect(row).toHaveClass('is-lifted')
      fireEvent.mouseUp(document, { clientX: 10, clientY: 30 })
      act(() => { vi.advanceTimersByTime(100) })
      expect(row).not.toHaveClass('is-lifted')
    })

    it('a quick tap still opens the task, and starts no drag', () => {
      const w = orderWriters()
      render(<WeekCanvas weekStart={weekStart} days={withDay([A, B].map(asItem))} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
      const title = within(wedCol()).getByRole('button', { name: 'Alpha' })
      fireEvent.touchStart(title, touch(10))
      act(() => { vi.advanceTimersByTime(100) })
      fireEvent.touchEnd(title, touch(10))
      fireEvent.click(title)
      act(() => { vi.advanceTimersByTime(300) })
      expect(w.open).toHaveBeenCalledWith('task-ta')
      expect(screen.queryByText('Drop here to take its day away')).toBeNull()
      expect(title.closest('li')).not.toHaveClass('is-lifted')
    })
  })
})
