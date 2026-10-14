import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Task } from '@/types/task'
import { WeekCanvas, type CanvasDay, type WeekCanvasWriters } from './WeekCanvas'
import { buildShelf, type ShelfGroup } from './weekShelf'

// The week composition (2026-10-10, calendar first 2026-10-12): seven equal
// days are the page; work with no day sits in one quiet "No day yet" line
// under the title; drag places it; done waits behind one "Show done".

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

describe('WeekCanvas — drag', () => {
  it('a No day yet chip carries the plan payload; the day says where it lands; the drop places it', () => {
    const w = show()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Book the cabin'), { dataTransfer: d.t })
    expect(JSON.parse(d.data['application/x-symphony-plan'])).toEqual({ kind: 'task', id: 'a', date: '2026-10-03', title: 'Book the cabin' })
    d.arm()
    const mon = screen.getByTestId('journal-day-2026-10-05')
    fireEvent.dragOver(mon, { dataTransfer: d.t })
    expect(mon).toHaveClass('is-over')
    expect(within(mon).getByText('Drop on Mon 5')).toBeInTheDocument()
    fireEvent.drop(mon, { dataTransfer: d.t })
    expect(w.placeTask).toHaveBeenCalledWith(cabin, dayOf(2))
  })

  it('a weekly routine chip drags onto a day and is placed there', () => {
    const w = show()
    const d = dt()
    const chip = within(screen.getByRole('list', { name: 'No day yet' })).getByText('Mow the lawn')
    fireEvent.dragStart(chip, { dataTransfer: d.t })
    expect(JSON.parse(d.data['application/x-symphony-plan'])).toMatchObject({ kind: 'routine', id: 'r1' })
    d.arm()
    fireEvent.drop(screen.getByTestId('journal-day-2026-10-05'), { dataTransfer: d.t })
    expect(w.placeRoutine).toHaveBeenCalledWith({ id: 'r1', title: 'Mow the lawn' }, dayOf(2))
  })

  it('a day’s row dropped on the No day yet line loses its day', () => {
    const w = show()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Pick up the keys').closest('li')!, { dataTransfer: d.t })
    d.arm()
    const line = screen.getByRole('list', { name: 'No day yet' }).parentElement!
    fireEvent.dragOver(line, { dataTransfer: d.t })
    expect(line).toHaveClass('is-over')
    fireEvent.drop(line, { dataTransfer: d.t })
    expect(w.unplaceTask).toHaveBeenCalledWith(placed)
  })

  it('with nothing unplaced the line is absent until a day’s row is dragged, then it takes the drop', () => {
    const w = writers()
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={[]} routinesToPlace={[]} isCurrent writers={w} />)
    expect(screen.queryByRole('list', { name: 'No day yet' })).toBeNull()
    const d = dt()
    fireEvent.dragStart(screen.getByText('Pick up the keys').closest('li')!, { dataTransfer: d.t })
    d.arm()
    const line = screen.getByRole('list', { name: 'No day yet' }).parentElement!
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
describe('WeekCanvas — filing a task under a goal', () => {
  it('has no separate column of goals', () => {
    show()
    expect(screen.queryByRole('complementary')).toBeNull()
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

  it('one “Show done” reveals done work in the days', () => {
    show()
    expect(screen.queryByText('Old receipt')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show done' }))
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

  // 2026-10-14 browser check: at 390px the line said "Friday is wide open"
  // while Friday had four calendar events. The sentence must read the same
  // days at every width.
  it('the week sentence counts events on the phone as it does on the desk', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 9)) // Wed
    const evt = (id: string, title: string) => ({ id, kind: 'event' as const, title, completed: false })
    const week = days().map((d, i) => i === 6
      ? { ...d, events: [evt('e1', 'No School'), evt('e2', 'iPhone Pre-order'), evt('e3', 'Kami PT'), evt('e4', 'Grampappa')] }
      : i === 4 ? { ...d, events: [evt('c1', 'CEPI standby')] } : d)
    show(writers(), { days: week })
    const line = document.querySelector('.wc-week-sentence')
    expect(line?.textContent).toContain('Today: CEPI standby.')
    expect(line?.textContent).toContain('Friday is the full one.')
    expect(line?.textContent).not.toMatch(/Friday is wide open/)
  })

  // Final review 2026-10-14 #5: while the week was still loading, the line
  // said every day was wide open.
  it('the week sentence waits until the week has loaded', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 9)) // Wed
    show(writers(), { loaded: false })
    expect(document.querySelector('.wc-week-sentence')).toBeNull()
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
  it('each day wears its forecast, small, in its header', () => {
    show()
    expect(within(screen.getByTestId('journal-day-2026-10-03')).getByRole('img', { name: /Sunny, high 64°/ })).toBeInTheDocument()
  })

  it('every-day routines are written once, with a quiet Show daily / Hide daily', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()}
      rhythm={[{ label: 'Every day', items: [{ title: 'Walk the dog', openId: 'routine-r9-day0' }] }]} daily={{ shown: false, onToggle }} />)
    expect(screen.getByText('Walk the dog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show daily' }))
    expect(onToggle).toHaveBeenCalled()
    rerender(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()}
      rhythm={[{ label: 'Every day', items: [] }]} daily={{ shown: true, onToggle }} />)
    expect(screen.getByText('Daily routines are in each day')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide daily' })).toHaveAttribute('aria-pressed', 'true')
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
  it('things with no day sit in one quiet line, draggable onto a day; no tray', () => {
    const w = show()
    expect(screen.queryByRole('region', { name: 'Still to place' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull()
    const line = screen.getByRole('list', { name: 'No day yet' })
    expect(within(line).getByText('Book the cabin')).toBeInTheDocument()
    expect(within(line).getByText('Call the bank')).toBeInTheDocument()
    expect(within(line).getByText('Service the car')).toBeInTheDocument()
    expect(within(line).queryByText('Pick up the keys')).toBeNull()
    expect(within(line).getByText('Book the cabin').closest('[draggable="true"]')).not.toBeNull()
    expect(within(line).getByText('Mow the lawn')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Give .* a day/ })).toBeNull()
    fireEvent.click(within(line).getByText('Call the bank'))
    expect(w.open).toHaveBeenCalledWith('task-c')
    expect(screen.getByText('3 days ahead are wide open.')).toBeInTheDocument()
  })

  // Scott, 2026-10-14: sixteen chips across the top were busy and
  // overwhelming. No day yet sits under the days; more than four fold.
  it('more than four with no day fold to one line under the days; Show opens them, Fold closes', () => {
    const routines = ['Mow the lawn', 'Water plants', 'Clean gutters'].map((title, i) => ({ id: `r${i}`, title }))
    const w = writers()
    const { container } = render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={routines} isCurrent writers={w} />)
    const strip = container.querySelector('.wc-strip')!
    const fold = screen.getByRole('button', { name: /No day yet/ })
    expect(strip.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(fold).toHaveTextContent('6')
    expect(fold).toHaveTextContent('and 4 more')
    expect(screen.queryByRole('list', { name: 'No day yet' })).toBeNull()
    fireEvent.click(fold)
    const list = screen.getByRole('list', { name: 'No day yet' })
    expect(within(list).getByText('Clean gutters')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fold' }))
    expect(screen.queryByRole('list', { name: 'No day yet' })).toBeNull()
  })

  it('a folded line opens by itself when Symphony points at something in it, and takes a day’s row dropped on it', () => {
    const routines = ['Mow the lawn', 'Water plants', 'Clean gutters'].map((title, i) => ({ id: `r${i}`, title }))
    const w = writers()
    const { rerender } = render(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={routines} isCurrent writers={w} />)
    const d = dt()
    fireEvent.dragStart(screen.getByText('Pick up the keys').closest('li')!, { dataTransfer: d.t })
    d.arm()
    const fold = screen.getByRole('button', { name: /No day yet/ })
    expect(fold).toHaveTextContent('Drop here to take its day away')
    fireEvent.drop(fold.parentElement!, { dataTransfer: d.t })
    expect(w.unplaceTask).toHaveBeenCalledWith(placed)
    rerender(<WeekCanvas weekStart={weekStart} days={days()} shelf={shelf()} routinesToPlace={routines} isCurrent writers={w}
      pointing={{ dates: new Set(), taskIds: new Set(['c']) }} />)
    expect(within(screen.getByRole('list', { name: 'No day yet' })).getByText('Call the bank').closest('li')).toHaveClass('is-pointed')
  })

  it('with nothing to place there is no line at all', () => {
    render(<WeekCanvas weekStart={weekStart} days={days()} shelf={[]} routinesToPlace={[]} isCurrent writers={writers()} />)
    expect(screen.queryByText('No day yet')).toBeNull()
    expect(screen.queryByText(/Nothing/)).toBeNull()
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

  it('names each day’s free time at its foot', () => {
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

  it('a routine on a day is marked as one', () => {
    const d = days()
    d[1].items = [{ id: 'routine-r2-day1', kind: 'routine', title: 'Piano', completed: false, routineId: 'r2' }]
    render(<WeekCanvas weekStart={weekStart} days={d} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} />)
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
    render(<WeekCanvas weekStart={weekStart} days={withWeekend()} shelf={shelf()} routinesToPlace={[]} isCurrent writers={writers()} />)
    expect(screen.queryByTestId('journal-day-2026-10-03')).toBeNull()
    expect(screen.queryByTestId('journal-day-2026-10-04')).toBeNull()
    const fold = screen.getByRole('button', { name: /This past weekend/ })
    // One label: "This past weekend · Sat 3 – Sun 4 (open)", no Open link at the far end.
    expect(fold).toHaveTextContent('This past weekendSat 3 – Sun 4 (open)')
    expect(fold).toHaveTextContent('Kaleb’s baseball')
    expect(fold).toHaveTextContent('Not done: Throw out umbrella')
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
    expect(screen.getByText('Call the bank').closest('li')).toHaveClass('is-pointed')
    expect(screen.getByText('Book the cabin').closest('li')).not.toHaveClass('is-pointed')
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

describe('No day yet', () => {
  it('a task with no day can be marked done from its ring', () => {
    const w = show()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call the bank' }))
    expect(w.toggleTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'c', title: 'Call the bank' }))
  })
  it('a routine with no day has no check (it needs a day first)', () => {
    show()
    expect(screen.queryByRole('button', { name: 'Complete Mow the lawn' })).not.toBeInTheDocument()
  })
})
