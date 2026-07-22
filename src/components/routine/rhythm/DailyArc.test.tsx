import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DailyArc } from './DailyArc'
import type { RhythmCard } from './rhythmModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

const base = {
  familyMembers: [],
  matches: () => true,
  nowMinutes: 12 * 60,
  onOpenCollection: vi.fn(),
  onOpenRoutine: vi.fn(),
}

describe('DailyArc', () => {
  it('renders cluster cards with time range and members', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'cluster-1', name: null,
      startTime: '06:30:00', endTime: '07:00:00', suggestedName: 'Morning',
      routines: [mk({ name: 'Walk Jax', time_of_day: '06:30:00' }), mk({ name: 'Feed Jax', time_of_day: '07:00:00' })],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    expect(screen.getByText('Walk Jax')).toBeInTheDocument()
    expect(screen.getByText('6:30 – 7')).toBeInTheDocument()
  })

  it('titles auto-groups with the daypart as plain text — no rename affordance', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'cluster-1', name: null,
      startTime: '19:00:00', endTime: '19:10:00', suggestedName: 'Bedtime',
      routines: [mk({}), mk({}), mk({})],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    const title = screen.getByText('Bedtime')
    expect(title.closest('button')).toBeNull()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/name this rhythm/i)).not.toBeInTheDocument()
  })

  it('styles auto-groups exactly like named cards (no dashed amber border)', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'c1', name: null,
      startTime: '19:00:00', endTime: '19:10:00', suggestedName: 'Bedtime',
      routines: [mk({}), mk({})],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    const el = screen.getByTestId('arc-card-c1')
    expect(el.className).not.toContain('border-dashed')
    expect(el.className).toContain('border-neutral-100')
  })

  it('opens the collection panel from a collection card title', () => {
    const onOpenCollection = vi.fn()
    const parent = mk({ id: 'coll', name: 'Camp Mornings' })
    const card: RhythmCard = {
      kind: 'collection', id: 'coll', name: 'Camp Mornings',
      startTime: '07:00:00', endTime: '07:00:00',
      routines: [mk({ name: 'Eat breakfast' })], routine: parent,
    }
    render(<DailyArc {...base} onOpenCollection={onOpenCollection} cards={[card]} anytime={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Camp Mornings' }))
    expect(onOpenCollection).toHaveBeenCalledWith('coll')
  })

  it('renders anytime pills and opens the routine on click — no quick-add', () => {
    const onOpenRoutine = vi.fn()
    const pt = mk({ name: 'PT Exercises' })
    render(<DailyArc {...base} onOpenRoutine={onOpenRoutine} cards={[]} anytime={[pt]} />)
    fireEvent.click(screen.getByText('PT Exercises'))
    expect(onOpenRoutine).toHaveBeenCalledWith(pt)
    expect(screen.queryByLabelText(/add an every-day routine/i)).not.toBeInTheDocument()
  })

  it('dims non-matching routines when searching', () => {
    const card: RhythmCard = {
      kind: 'single', id: 'a', name: 'Walk Jax', startTime: '06:30:00', endTime: '06:30:00',
      routines: [mk({ id: 'a', name: 'Walk Jax' })],
    }
    render(<DailyArc {...base} matches={() => false} cards={[card]} anytime={[]} />)
    expect(screen.getByTestId('arc-card-a').className).toContain('opacity-30')
  })
})
