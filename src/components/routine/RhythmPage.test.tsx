import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

function mkDT(): DataTransfer {
  return new DataTransfer()
}

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
    expect(screen.getByRole('heading', { name: 'Every day' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Through the week' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sometimes' })).toBeInTheDocument()
    // Resting routines now live in the Tend drawer, not the page body.
    fireEvent.click(screen.getByRole('button', { name: /tend/i }))
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
    // Resting routines + wake-all now live in the Tend drawer.
    fireEvent.click(screen.getByRole('button', { name: /tend/i }))
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

  it('naming a group via the canvas popover calls onGroupIntoCollection with time opts', () => {
    const onGroupIntoCollection = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onGroupIntoCollection={onGroupIntoCollection}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Pajamas', { id: 'b', time_of_day: '19:02:00' }),
          mk('Reading', { id: 'c', time_of_day: '19:06:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bedtime' }))
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'Wind-down' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onGroupIntoCollection).toHaveBeenCalledWith('Wind-down', ['a', 'b', 'c'],
      { time_of_day: '19:01', recurrence_pattern: { type: 'daily' } })
  })

  it('folding a group into an existing routine via the canvas popover calls onAddToCollection', () => {
    const onAddToCollection = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onAddToCollection={onAddToCollection}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Pajamas', { id: 'b', time_of_day: '19:02:00' }),
          mk('Reading', { id: 'c', time_of_day: '19:06:00' }),
          mk('Kids Bedtime Routine', { id: 'bed', recurrence_pattern: { type: 'weekly', days: ['sun'] } }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Bedtime' }))
    fireEvent.change(screen.getByPlaceholderText('Name this rhythm'), { target: { value: 'Kids Bedtime' } })
    // "Kids Bedtime Routine" also renders as a WeekStrip chip (untimed, Sunday
    // only) — disambiguate to the popover's fold suggestion button.
    const foldButtons = screen.getAllByRole('button', { name: 'Kids Bedtime Routine' })
    fireEvent.click(foldButtons.find(b => b.className.includes('bg-emerald-50'))!)
    expect(onAddToCollection).toHaveBeenCalledWith('bed', ['a', 'b', 'c'])
  })

  it('shows a Tend badge counting findings only (not nameable groups)', () => {
    const { rerender } = render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Water plants', { id: 'x', context: null }),
        ]} />
    )
    // one missing-domain finding → badge shows exactly 1
    const badge = within(screen.getByRole('button', { name: /tend/i })).getByText('1')
    expect(badge.textContent).toBe('1')

    // a nameable cluster with no findings should NOT show a badge
    rerender(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Pajamas', { id: 'b', time_of_day: '19:02:00' }),
        ]} />
    )
    expect(within(screen.getByRole('button', { name: /tend/i })).queryByText(/^\d+$/)).not.toBeInTheDocument()
  })

  it('executes an add-steps drop end to end', () => {
    const onAddToCollection = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onAddToCollection={onAddToCollection}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Kids Bedtime', { id: 'bed', time_of_day: '19:15:00' }),
          mk('Read', { id: 'read', time_of_day: null, parent_routine_id: 'bed' }),
        ]} />
    )
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'routine', id: 'a' }))
    dt.setData('text/rhythm-kind-routine', '1')
    fireEvent.drop(screen.getByTestId('arc-card-bed'), { dataTransfer: dt })
    expect(onAddToCollection).toHaveBeenCalledWith('bed', ['a'])
  })

  it('executes a stand-alone-at drop: promote then retime daily', () => {
    const onPromoteStep = vi.fn()
    const onUpdateRoutine = vi.fn()
    render(
      <RhythmPage {...noop} onPromoteStep={onPromoteStep} onUpdateRoutine={onUpdateRoutine}
        routines={[
          mk('Walk Jax', { id: 'walk', time_of_day: '06:30:00' }),
          mk('Camp Mornings', { id: 'camp', time_of_day: '07:00:00' }),
          mk('Pack bags', { id: 'pack', parent_routine_id: 'camp' }),
        ]} />
    )
    const dt = mkDT()
    dt.setData('text/rhythm-payload', JSON.stringify({ kind: 'step', id: 'pack' }))
    dt.setData('text/rhythm-kind-step', '1')
    fireEvent.drop(screen.getByTestId('arc-axis'), { dataTransfer: dt })
    expect(onPromoteStep).toHaveBeenCalledWith('pack')
    expect(onUpdateRoutine).toHaveBeenCalledWith('pack', { time_of_day: '06:00', recurrence_pattern: { type: 'daily' } })
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
    fireEvent.click(screen.getByRole('button', { name: /tend/i }))
    expect(screen.getByText(/same job\?/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /dismiss suggestion/i }))
    expect(screen.queryByText(/same job\?/)).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('rhythm-tend-dismissed')!)).toEqual(['l:a.b'])
    localStorage.removeItem('rhythm-tend-dismissed')
  })
})

describe('day focus', () => {
  it("clicking a week day shows that day's weekly routines on the arc", () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Walk Jax', { id: 'walk', time_of_day: '06:30:00' }),
          mk('Kids Bedtime', { id: 'bed', recurrence_pattern: { type: 'weekly', days: ['wed'] }, time_of_day: '19:15:00' }),
        ]} />
    )
    // before focusing, the weekly routine appears only as a week chip
    expect(screen.getByRole('heading', { name: 'Every day' })).toBeInTheDocument()
    expect(screen.getAllByText('Kids Bedtime')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /^WED/ }))
    expect(screen.getByRole('heading', { name: /wednesday — the whole day/i })).toBeInTheDocument()
    expect(screen.getAllByText('Kids Bedtime').length).toBeGreaterThan(1)

    fireEvent.click(screen.getByRole('button', { name: /^WED/ }))
    expect(screen.getByRole('heading', { name: 'Every day' })).toBeInTheDocument()
  })
})
