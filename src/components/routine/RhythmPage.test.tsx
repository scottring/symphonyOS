import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
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
// The current user's family_member row — RhythmPage asks this for "which pill
// is me" so an unassigned routine you made still shows under your own lens.
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    getCurrentUserMember: () => ({ id: 'me', user_id: 'u1', name: 'Scott' }),
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


/** UTC midnight on the 1st, N months from now — the shape `paused_until` stores. */
function wakeInMonths(n: number): string {
  const d = new Date()
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + n, 1)).toISOString()
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
          mk('Swap the closets', { recurrence_pattern: { type: 'quarterly' } }),
          mk('Renew passports', { recurrence_pattern: { type: 'yearly', month_of_year: 3 } }),
          mk('Repaint the deck', { recurrence_pattern: { type: 'yearly', interval: 3 } }),
          // Derived from the wall clock rather than hardcoded, so the suite
          // can't rot on a date drifting past.
          mk('Walk to school', { visibility: 'reference', paused_until: wakeInMonths(2) }),
        ]} />
    )
    expect(screen.getByRole('heading', { name: 'Routines' })).toBeInTheDocument()
    // Every rung the same shape now — the arc and the day strip are gone.
    expect(screen.getByRole('heading', { name: 'Daily' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Weekly' })).toBeInTheDocument()
    // Past the week, each cadence is its own rung — a monthly routine and a
    // once-every-three-years one are not the same commitment.
    expect(within(screen.getByRole('region', { name: 'Monthly' })).getByText('Pay FFG')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Seasonal' })).getByText('Swap the closets')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Yearly' })).getByText('Renew passports')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Less often' })).getByText('Repaint the deck')).toBeInTheDocument()
    // A sleeper isn't a commitment — it waits behind a disclosure at the foot,
    // and says when it wakes.
    fireEvent.click(screen.getByRole('button', { name: /Resting routines/ }))
    const resting = screen.getByRole('region', { name: 'Resting' })
    expect(within(resting).getByText('Walk to school')).toBeInTheDocument()
    const wake = new Date()
    wake.setMonth(wake.getMonth() + 2)
    expect(resting.textContent).toContain(`wakes ${wake.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`)
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
    const dish = screen.getByText('Wash dishes').closest('li')!
    const jax = screen.getByText('Walk Jax').closest('li')!
    expect(dish.className).toContain('opacity-40')
    expect(jax.className).not.toContain('opacity-40')
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

  it('person pill filters the list', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        familyMembers={[{ id: 'iris', user_id: 'u1', name: 'Iris', initials: 'I', color: '#888', avatar_url: null, is_full_user: true, display_order: 1, created_at: '' } as never]}
        routines={[
          mk('Iris run', { id: 'run', time_of_day: '09:00:00', assigned_to_all: ['iris'] }),
          mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Iris' }))
    expect(screen.queryByText('Walk Jax')).not.toBeInTheDocument()
    expect(screen.getByText('Iris run')).toBeInTheDocument()
  })

  // Scott, 2026-09-07: "can we multiselect whose week in Routines?" Two pills
  // on means both weeks laid over each other, and clicking one off leaves the
  // other standing rather than dropping back to Everyone.
  it('holds several people at once, and drops one at a time', () => {
    const members = [
      { id: 'ella', user_id: 'u1', name: 'Ella', initials: 'E', color: '#888', avatar_url: null, is_full_user: true, display_order: 1, created_at: '' },
      { id: 'kaleb', user_id: 'u1', name: 'Kaleb', initials: 'K', color: '#888', avatar_url: null, is_full_user: true, display_order: 2, created_at: '' },
    ] as never[]
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        familyMembers={members}
        routines={[
          mk('Ella piano', { id: 'piano', time_of_day: '09:00:00', assigned_to_all: ['ella'] }),
          mk('Kaleb swim', { id: 'swim', time_of_day: '10:00:00', assigned_to_all: ['kaleb'] }),
          mk('Walk Jax', { id: 'jax', time_of_day: '06:30:00' }),
        ]} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ella' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kaleb' }))
    expect(screen.getByText('Ella piano')).toBeInTheDocument()
    expect(screen.getByText('Kaleb swim')).toBeInTheDocument()
    expect(screen.queryByText('Walk Jax')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ella' })).toHaveAttribute('aria-pressed', 'true')

    // Dropping Ella leaves Kaleb's week, not Everyone's.
    fireEvent.click(screen.getByRole('button', { name: 'Ella' }))
    expect(screen.queryByText('Ella piano')).not.toBeInTheDocument()
    expect(screen.getByText('Kaleb swim')).toBeInTheDocument()
    expect(screen.queryByText('Walk Jax')).not.toBeInTheDocument()

    // Everyone clears the whole set.
    fireEvent.click(screen.getByRole('button', { name: 'Everyone' }))
    expect(screen.getByText('Walk Jax')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kaleb' })).toHaveAttribute('aria-pressed', 'false')
  })

  // Demo run 2026-09-06: switching "Whose week" to yourself hid your own
  // routines the moment they had no explicit assignee — an unassigned routine
  // you made is still yours under your own lens.
  it('an unassigned routine you made shows under your own "Whose week" lens', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        familyMembers={[{ id: 'me', user_id: 'u1', name: 'Scott', initials: 'S', color: '#888', avatar_url: null, is_full_user: true, display_order: 0, created_at: '' } as never]}
        routines={[
          mk('My unassigned chore', { id: 'mine', time_of_day: '07:00:00', user_id: 'u1' }),
          mk('Someone else made this', { id: 'other', time_of_day: '08:00:00', user_id: 'u2' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Scott' }))
    expect(screen.getByText('My unassigned chore')).toBeInTheDocument()
    expect(screen.queryByText('Someone else made this')).not.toBeInTheDocument()
  })

  // Demo run 2026-09-06: the routine panel was taller than the viewport and
  // had no way to scroll to its Delete/Done footer.
  it('caps the routine panel to the viewport and scrolls its body', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Water plants', { id: 'x', time_of_day: '09:00:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Water plants' }))
    const dialog = screen.getByTestId('routine-panel-dialog')
    expect(dialog.className).toContain('max-h-[calc(100vh-2rem)]')
    expect(dialog.className).toContain('flex-col')
    const body = screen.getByTestId('routine-panel-body')
    expect(body.className).toContain('overflow-y-auto')
    expect(body.className).toContain('min-h-0')
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


describe('first step on a step-less routine', () => {
  it('Escape closes an open routine panel and keeps the routine', () => {
    const onDelete = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onDelete={onDelete}
        routines={[
          mk('Kids shower routine', { id: 'shower', recurrence_pattern: { type: 'weekly', days: ['tue'] }, time_of_day: '19:00:00' }),
          mk('Walk Jax', { id: 'walk', time_of_day: '06:30:00' }),
        ]} />
    )
    fireEvent.click(screen.getByText('Kids shower routine'))
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  // Walkthrough 2026-09-21, B20: "New routine" used to insert a live row on
  // click, which showed on Today's rungs and in the Planning panel while the
  // editor was still open. Nothing is written until Save now.
  it('"New routine" writes nothing on click, and closing without Save writes nothing', async () => {
    const onCreateCollection = vi.fn()
    const onUpdateRoutine = vi.fn()
    const onDelete = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={onUpdateRoutine} onDelete={onDelete}
        onCreateCollection={onCreateCollection}
        routines={[mk('Walk Jax', { id: 'walk', time_of_day: '06:30:00' })]} />
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'New routine' })[0])
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument()
    expect(onCreateCollection).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(onCreateCollection).not.toHaveBeenCalled()
    expect(onUpdateRoutine).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('"New routine" is created once, on Save, with the name typed in the panel', async () => {
    const created = mk('Sunday reset', { id: 'created' })
    const onCreateCollection = vi.fn().mockResolvedValue(created)
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onDelete={vi.fn()}
        onCreateCollection={onCreateCollection}
        routines={[]} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'New routine' }))
    await screen.findByRole('button', { name: 'Close' })
    // PanelHeader shows the title as a button; click to enter edit mode.
    const titleButtons = screen.getAllByRole('button', { name: 'New routine' })
    fireEvent.click(titleButtons[titleButtons.length - 1])
    const title = screen.getByDisplayValue('New routine')
    fireEvent.change(title, { target: { value: 'Sunday reset' } })
    fireEvent.blur(title)
    expect(onCreateCollection).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save & close' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument())
    expect(onCreateCollection).toHaveBeenCalledTimes(1)
    expect(onCreateCollection.mock.calls[0][0]).toBe('Sunday reset')
    expect(onCreateCollection.mock.calls[0][1]).toMatchObject({ recurrence_pattern: { type: 'daily' }, visibility: 'active' })
  })

  it('shows the add-step input on a step-less routine panel and adds through it', () => {
    const onAddStep = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onAddStep={onAddStep} onAddToCollection={vi.fn()}
        routines={[
          mk('Kids shower routine', { id: 'shower', recurrence_pattern: { type: 'weekly', days: ['tue'] }, time_of_day: '19:00:00' }),
          mk('Walk Jax', { id: 'walk', time_of_day: '06:30:00' }),
        ]} />
    )
    fireEvent.click(screen.getByText('Kids shower routine'))
    const input = screen.getByLabelText('Add a step')
    fireEvent.change(input, { target: { value: 'Rinse and brush hair' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAddStep).toHaveBeenCalledWith('shower', 'Rinse and brush hair')
    // step-less routines still offer "Make this a step of" alongside
    expect(screen.getByLabelText(/make this a step of/i)).toBeInTheDocument()
  })
})
