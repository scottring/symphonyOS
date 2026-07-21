import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RhythmPage } from './RhythmPage'
import type { Routine } from '@/types/actionable'

// Mock hooks pulled in by TapRoutinePanel so tests don't need Supabase auth.
vi.mock('@/hooks/useRoutineStats', () => ({
  useRoutineStats: () => ({ getStats: () => undefined }),
}))
vi.mock('@/hooks/useAttachments', () => ({
  useAttachments: () => ({
    getAttachments: () => [],
    getSignedUrl: vi.fn(),
    fetchAttachments: vi.fn(),
  }),
}))

let seq = 0
function mk(name: string, over: Partial<Routine> = {}): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name, description: null,
    default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: 'family',
    created_at: '', updated_at: '', ...over,
  }
}

const noop = { onCreateRoutine: vi.fn(), onAddStep: vi.fn(), onReorderSteps: vi.fn(), onPromoteStep: vi.fn() }

describe('RhythmPage', () => {
  it('renders all zones from a mixed routine set', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Walk Jax', { time_of_day: '06:30:00' }),
          mk('PT Exercises'),
          mk('Food shopping', { recurrence_pattern: { type: 'weekly', days: ['sun'] } }),
          mk('Pay FFG', { recurrence_pattern: { type: 'monthly', day_of_month: 1 } }),
          mk('Walk to school', { visibility: 'reference', paused_until: '2026-09-01T00:00:00Z' }),
        ]} />
    )
    expect(screen.getByRole('heading', { name: 'Routines' })).toBeInTheDocument()
    expect(screen.getByText('Every day')).toBeInTheDocument()
    expect(screen.getByText('Through the week')).toBeInTheDocument()
    expect(screen.getByText('Sometimes')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for September/)).toBeInTheDocument()
  })

  it('type-anywhere search dims non-matching routines', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' }),
          mk('Wash dishes', { id: 'dish', time_of_day: '20:00:00' }),
        ]} />
    )
    fireEvent.keyDown(window, { key: 'j' })
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.keyDown(window, { key: 'x' })
    expect(screen.getByTestId('arc-card-dish').className).toContain('opacity-30')
    expect(screen.getByTestId('arc-card-jax').className).not.toContain('opacity-30')
  })

  it('wake-all updates every seasonal routine', async () => {
    const onUpdateRoutine = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={onUpdateRoutine}
        routines={[
          mk('A', { id: 'a', visibility: 'reference' }),
          mk('B', { id: 'b', visibility: 'reference' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /wake all/i }))
    expect(onUpdateRoutine).toHaveBeenCalledWith('a', { visibility: 'active', paused_until: null })
    expect(onUpdateRoutine).toHaveBeenCalledWith('b', { visibility: 'active', paused_until: null })
  })

  it('person pill filters the arc', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        familyMembers={[{ id: 'iris', user_id: 'u1', name: 'Iris', initials: 'I', color: '#888', avatar_url: null, is_full_user: true, display_order: 1, created_at: '' } as never]}
        routines={[
          mk('Iris run', { id: 'run', time_of_day: '09:00:00', assigned_to_all: ['iris'] }),
          mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Iris' }))
    expect(screen.queryByTestId('arc-card-jax')).not.toBeInTheDocument()
    expect(screen.getByTestId('arc-card-run')).toBeInTheDocument()
  })

  it('naming a cluster calls onGroupIntoCollection with member ids', () => {
    const onGroupIntoCollection = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onGroupIntoCollection={onGroupIntoCollection}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Pajamas', { id: 'b', time_of_day: '19:02:00' }),
          mk('Reading', { id: 'c', time_of_day: '19:06:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /name this rhythm/i }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onGroupIntoCollection).toHaveBeenCalledWith('Bedtime', ['a', 'b', 'c'])
  })

  it('dismissing a tend suggestion hides it and persists to localStorage', () => {
    localStorage.removeItem('rhythm-tend-dismissed')
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Water plants', { id: 'a' }),
          mk('Water houseplants', { id: 'b' }),
        ]} />
    )
    expect(screen.getByText(/same job\?/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /dismiss suggestion/i }))
    expect(screen.queryByText(/same job\?/)).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('rhythm-tend-dismissed')!)).toEqual(['l:a.b'])
    localStorage.removeItem('rhythm-tend-dismissed')
  })
})
