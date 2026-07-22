import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeekStrip } from './WeekStrip'
import type { DayKey } from './rhythmModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'weekly', days: ['sat'] },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

const empty: Record<DayKey, Routine[]> = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] }
const base = { stepCounts: {}, matches: () => true, todayKey: 'mon' as DayKey, onOpenRoutine: vi.fn(), sometime: [] }

describe('WeekStrip', () => {
  it('marks quiet days, full days, and today', () => {
    const sat = [mk({}), mk({}), mk({}), mk({})]
    render(<WeekStrip {...base} days={{ ...empty, sat }} />)
    expect(screen.getAllByText('quiet').length).toBeGreaterThan(0)
    expect(screen.getByText(/full/)).toBeInTheDocument()
    expect(screen.getByTestId('day-mon').className).toContain('border-')
  })

  it('labels biweekly routines and opens on click', () => {
    const onOpenRoutine = vi.fn()
    const lib = mk({ name: 'Library trip', recurrence_pattern: { type: 'weekly', days: ['thu'], interval: 2 } })
    render(<WeekStrip {...base} onOpenRoutine={onOpenRoutine} days={{ ...empty, thu: [lib] }} />)
    expect(screen.getByText(/every 2 wks/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Library trip'))
    expect(onOpenRoutine).toHaveBeenCalledWith(lib)
  })

  it('ghosts resting routines with a one-tap wake flick', () => {
    const onWake = vi.fn()
    const sleeping = mk({ name: 'Walk kids to school', visibility: 'reference' })
    render(<WeekStrip {...base} days={empty} restingDays={{ ...empty, mon: [sleeping] }} onWake={onWake} />)
    expect(screen.getByText('Walk kids to school')).toBeInTheDocument()
    expect(screen.getByText('asleep')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /wake walk kids to school/i }))
    expect(onWake).toHaveBeenCalledWith(sleeping)
  })

  it('renders the sometime-this-week pocket', () => {
    render(<WeekStrip {...base} days={empty} sometime={[mk({ name: 'Clara nails', recurrence_pattern: { type: 'weekly' } })]} />)
    expect(screen.getByText(/sometime this week/i)).toBeInTheDocument()
    expect(screen.getByText('Clara nails')).toBeInTheDocument()
  })

  it('hides resting items behind the header toggle', () => {
    localStorage.removeItem('rhythm-week-show-resting')
    const sleeping = mk({ name: 'Walk kids to school', visibility: 'reference' })
    render(<WeekStrip {...base} days={empty} restingDays={{ ...empty, mon: [sleeping] }} onWake={vi.fn()} />)
    expect(screen.getByText('Walk kids to school')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide resting items' }))
    expect(screen.queryByText('Walk kids to school')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /show resting items \(1\)/i }))
    expect(screen.getByText('Walk kids to school')).toBeInTheDocument()
  })

  it('quick-adds a routine on a specific day column', () => {
    const onQuickAdd = vi.fn()
    render(<WeekStrip {...base} days={empty} onQuickAdd={onQuickAdd} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a routine on TUE' }))
    const input = screen.getByPlaceholderText('New on TUE')
    fireEvent.change(input, { target: { value: 'Soccer practice' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onQuickAdd).toHaveBeenCalledWith('Soccer practice', 'tue')
  })

  it('adds a step inline from an expanded collection chip', () => {
    const onAddStep = vi.fn()
    const bedtime = mk({ id: 'bed', name: 'Kids Bedtime Routine' })
    const steps = [mk({ name: 'Brush teeth', parent_routine_id: 'bed' })]
    render(<WeekStrip {...base} days={{ ...empty, thu: [bedtime] }} stepCounts={{ bed: 1 }}
                      collectionSteps={{ bed: steps }} onAddStep={onAddStep} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show steps' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add step to Kids Bedtime Routine' }))
    const input = screen.getByPlaceholderText('New step')
    fireEvent.change(input, { target: { value: 'Read a book' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAddStep).toHaveBeenCalledWith('bed', 'Read a book')
  })
})
