import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { YearRibbon } from './YearRibbon'
import { buildYearModel } from './yearModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null,
    recurrence_pattern: { type: 'yearly', month_of_year: 10, day_of_month: 1 },
    time_of_day: null, raw_input: null, show_on_timeline: true, scope: 'individual', context: null,
    created_at: '', updated_at: '', ...over,
  }
}

const NOW = new Date('2026-09-05T12:00:00')
const base = { matches: () => true, onOpenRoutine: vi.fn(), stepCounts: {} }

function modelOf(routines: Routine[]) {
  return buildYearModel({
    active: routines.filter(r => r.visibility !== 'reference'),
    resting: routines.filter(r => r.visibility === 'reference'),
  }, { now: NOW })
}

function mkDT() {
  const data: Record<string, string> = {}
  return {
    data,
    setData(k: string, v: string) { data[k] = v },
    getData(k: string) { return data[k] ?? '' },
    get types() { return Object.keys(data) },
    effectAllowed: 'none',
    dropEffect: 'none',
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('YearRibbon', () => {
  it('renders twelve months starting at the current one, and marks it', () => {
    render(<YearRibbon {...base} model={modelOf([])} />)

    expect(screen.getAllByText('quiet')).toHaveLength(12)
    expect(screen.getByTestId('year-month-2026-9').textContent).toContain('now')
    expect(screen.getByTestId('year-month-2027-8')).toBeInTheDocument()
  })

  it('puts a routine in its month and opens it on click', () => {
    const onOpenRoutine = vi.fn()
    const storm = mk({ name: 'Storm windows' })
    render(<YearRibbon {...base} onOpenRoutine={onOpenRoutine} model={modelOf([storm])} />)

    expect(screen.getByTestId('year-month-2026-10').textContent).toContain('Storm windows')
    fireEvent.click(screen.getByText('Storm windows'))
    expect(onOpenRoutine).toHaveBeenCalledWith(storm)
  })

  it('shows the every-month pool above the columns', () => {
    const ffg = mk({ name: 'Pay FFG', recurrence_pattern: { type: 'monthly', day_of_month: 1 } })
    render(<YearRibbon {...base} model={modelOf([ffg])} />)

    expect(screen.getByTestId('every-month').textContent).toContain('Pay FFG')
    expect(screen.getAllByText('quiet')).toHaveLength(12)
  })

  it('marks a drifting routine so the date does not read as fixed', () => {
    const haircut = mk({
      name: 'Kaleb haircut',
      recurrence_pattern: { type: 'since_last', interval: 6, unit: 'weeks' },
    })
    render(<YearRibbon {...base} model={modelOf([haircut])} />)

    expect(screen.getByTestId('year-month-2026-9').textContent).toContain('~Kaleb haircut')
  })

  it('offers Wake on a resting routine, in the month it wakes', () => {
    const onWake = vi.fn()
    const spigots = mk({
      id: 'spigots', name: 'Open the spigots',
      visibility: 'reference', paused_until: '2027-04-01T00:00:00Z',
    })
    render(<YearRibbon {...base} model={modelOf([spigots])} onWake={onWake} />)

    const april = screen.getByTestId('year-month-2027-4')
    expect(april.textContent).toContain('Open the spigots')
    fireEvent.click(screen.getByLabelText('Wake Open the spigots'))
    expect(onWake).toHaveBeenCalledWith('spigots')
  })

  it('switches to a pulse histogram and remembers the choice', () => {
    render(<YearRibbon {...base} model={modelOf([mk({ name: 'Storm windows' })])} />)

    fireEvent.click(screen.getByText('Pulse view'))
    expect(localStorage.getItem('rhythm-year-density')).toBe('pulse')
    expect(screen.getByLabelText('Storm windows')).toBeInTheDocument()
    expect(screen.queryByText('Storm windows')).not.toBeInTheDocument()
  })
})

describe('YearRibbon drag and drop', () => {
  it('sets a dropped routine to recur in that month', () => {
    const onDropIntent = vi.fn()
    render(
      <YearRibbon {...base} model={modelOf([mk({ id: 'storm', name: 'Storm windows' })])}
                  onDropIntent={onDropIntent} />,
    )

    const dt = mkDT()
    fireEvent.dragStart(screen.getByText('Storm windows'), { dataTransfer: dt })
    fireEvent.dragOver(screen.getByTestId('year-month-2026-12'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('year-month-2026-12'), { dataTransfer: dt })

    expect(onDropIntent).toHaveBeenCalledWith({ type: 'yearly-in', ids: ['storm'], month: 12 })
  })

  it('wakes a dropped resting routine rather than retiming it', () => {
    const onDropIntent = vi.fn()
    const spigots = mk({
      id: 'spigots', name: 'Open the spigots',
      visibility: 'reference', paused_until: '2027-04-01T00:00:00Z',
    })
    render(<YearRibbon {...base} model={modelOf([spigots])} onDropIntent={onDropIntent} />)

    const dt = mkDT()
    fireEvent.dragStart(screen.getByText('Open the spigots'), { dataTransfer: dt })
    fireEvent.drop(screen.getByTestId('year-month-2026-11'), { dataTransfer: dt })

    expect(onDropIntent).toHaveBeenCalledWith({ type: 'wake-in', id: 'spigots', month: 11, year: 2026 })
  })
})
