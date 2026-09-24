import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { PeriodShelves } from './PeriodShelves'
import { goalShelvesPeriod } from '@/lib/planning/goalShelves'
import type { PlanRowModel } from './PlanRow'
import type { PeriodCalendarEntry } from '@/lib/planning/periodCalendar'

vi.mock('./PlanRail', () => ({
  PlanRail: ({ title, subtitle, rows }: { title: string; subtitle: string; rows: PlanRowModel[] }) => (
    <section aria-label="rail">{title} · {subtitle} · {rows.length}</section>
  ),
}))

afterEach(cleanup)

const OCT = new Date(2026, 9, 1)
const entry = (o: Partial<PeriodCalendarEntry>): PeriodCalendarEntry =>
  ({ id: 'e', kind: 'event', title: 'E', at: OCT, allDay: true, ...o })

const base = {
  level: 'month' as const,
  bounds: { label: 'October 2026' },
  above: 'season' as const,
  railBounds: { label: 'Fall 2026' },
  railRows: [] as PlanRowModel[],
  noun: 'month',
  patterns: [],
  routinesHeading: 'Recurring commitments',
  routinesOpen: true,
  toggleRoutines: vi.fn(),
  dated: [] as PeriodCalendarEntry[],
  calendarOpen: true,
  toggleCalendar: vi.fn(),
  eventsAvailable: true,
  eventsCoverPeriod: true,
  onOpen: vi.fn(),
  onNavigate: vi.fn(),
  onClose: vi.fn(),
}

describe('PeriodShelves — the block lifted out of PeriodPlanPage (S2-18)', () => {
  it('names the period it belongs to, and the level above it', () => {
    render(<PeriodShelves {...base} />)
    expect(screen.getByRole('complementary', { name: 'Shelves' })).toBeInTheDocument()
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('rail')).toHaveTextContent('This Season · Fall 2026')
    expect(screen.getByText('Keep the season in view as you plan this month.')).toBeInTheDocument()
  })

  it('renders a season the same way, with the year above it', () => {
    render(<PeriodShelves {...base} level="season" above="year" noun="season"
      bounds={{ label: 'Fall 2026' }} railBounds={{ label: '2026' }} />)
    expect(screen.getByText('Fall 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('rail')).toHaveTextContent('This Year · 2026')
    expect(screen.getByText('Keep the year in view as you plan this season.')).toBeInTheDocument()
  })

  it('shows the calendar entries, events and dated tasks alike', () => {
    render(<PeriodShelves {...base} dated={[
      entry({ id: 'event-d', kind: 'event', title: 'Dentist appointment', at: new Date(2026, 9, 6, 14, 0), allDay: false }),
      entry({ id: 'task-a', kind: 'task', title: 'Buy game tickets', taskId: 'a', at: new Date(2026, 9, 8) }),
    ]} />)
    const section = within(screen.getByRole('region', { name: 'On the calendar' }))
    expect(section.getByText(/Dentist appointment/)).toBeInTheDocument()
    expect(section.getByText(/Buy game tickets/)).toBeInTheDocument()
  })

  it('a dated task is a link to the task; an event is not', () => {
    const onNavigate = vi.fn()
    render(<PeriodShelves {...base} onNavigate={onNavigate} dated={[
      entry({ id: 'task-a', kind: 'task', title: 'Buy game tickets', taskId: 'abc', at: new Date(2026, 9, 8) }),
      entry({ id: 'event-d', kind: 'event', title: 'Halloween', at: new Date(2026, 9, 31) }),
    ]} />)
    const section = within(screen.getByRole('region', { name: 'On the calendar' }))
    fireEvent.click(section.getByRole('button', { name: /Buy game tickets/ }))
    expect(onNavigate).toHaveBeenCalledWith('/task/abc')
    expect(section.queryByRole('button', { name: /Halloween/ })).toBeNull()
  })

  it('says so when the event window does not cover the period', () => {
    render(<PeriodShelves {...base} eventsCoverPeriod={false}
      dated={[entry({ id: 'task-a', kind: 'task', title: 'T', taskId: 'a' })]} />)
    expect(screen.getByText(/shown for the next few weeks only/)).toBeInTheDocument()
  })

  it('says so when the calendar could not be reached', () => {
    render(<PeriodShelves {...base} eventsAvailable={false}
      dated={[entry({ id: 'task-a', kind: 'task', title: 'T', taskId: 'a' })]} />)
    expect(screen.getByText(/Couldn't reach the calendar/)).toBeInTheDocument()
  })
})

describe('goalShelvesPeriod — which period a goal shows', () => {
  it('reads October from the goal itself, so a DIRECT open works', () => {
    // No navigation history, no ?start= — the case Scott asked to cover:
    // opening the goal's detail page directly, and after a reload.
    expect(goalShelvesPeriod({ monthStart: OCT })).toEqual({ level: 'month', anchor: OCT })
  })

  it('gives the same answer on every visit, so a reload cannot drift', () => {
    const first = goalShelvesPeriod({ monthStart: OCT })
    const second = goalShelvesPeriod({ monthStart: OCT })
    expect(first).toEqual(second)
  })

  it('reads a season goal as its season', () => {
    const fall = new Date(2026, 8, 1)
    expect(goalShelvesPeriod({ seasonStart: fall })).toEqual({ level: 'season', anchor: fall })
  })

  it('prefers the month when a goal carries both stamps', () => {
    expect(goalShelvesPeriod({ monthStart: OCT, seasonStart: new Date(2026, 8, 1) })?.level).toBe('month')
  })

  it('gives no period — and so no Shelves — for a goal with no stamp', () => {
    expect(goalShelvesPeriod({})).toBeNull()
  })
})
