import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TendDrawer } from './TendDrawer'
import { groupSuggestionKey } from './tendHeuristics'
import type { RhythmCard } from './rhythmModel'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'

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

const cluster: RhythmCard = {
  kind: 'cluster', id: 'cluster-a', name: null,
  startTime: '19:01:00', endTime: '19:06:00', suggestedName: 'Bedtime',
  routines: [mk({ id: 'a', name: 'Hamper' }), mk({ id: 'b', name: 'Reading' })],
}

const base = {
  open: true,
  onClose: vi.fn(),
  clusters: [] as RhythmCard[],
  findings: [],
  routines: [] as Routine[],
  looseItems: [] as Routine[],
  sleepers: [] as Routine[],
  foldTargets: [] as { id: string; name: string }[],
  familyMembers: [],
  onNameGroup: vi.fn(),
  onFoldInto: vi.fn(),
  onDismiss: vi.fn(),
  onMerge: vi.fn(),
  onStampDomain: vi.fn(),
  onRename: vi.fn(),
  onLetGo: vi.fn(),
  onWakeAll: vi.fn(),
  onOpenRoutine: vi.fn(),
}

describe('groupSuggestionKey', () => {
  it('is order-independent over member ids', () => {
    expect(groupSuggestionKey(cluster)).toBe('g:a.b')
  })
})

describe('TendDrawer', () => {
  it('renders nothing when closed', () => {
    render(<TendDrawer {...base} open={false} clusters={[cluster]} />)
    expect(screen.queryByText(/tend/i)).not.toBeInTheDocument()
  })

  it('shows the empty state when there is nothing to tend', () => {
    render(<TendDrawer {...base} />)
    expect(screen.getByText(/nothing to tend/i)).toBeInTheDocument()
  })

  it('names a group: submits via onNameGroup with the typed name', () => {
    const onNameGroup = vi.fn()
    render(<TendDrawer {...base} clusters={[cluster]} onNameGroup={onNameGroup} />)
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'Evening reset' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNameGroup).toHaveBeenCalledWith(cluster, 'Evening reset')
  })

  it('folds into an existing routine when the typed name matches exactly', () => {
    const onNameGroup = vi.fn()
    const onFoldInto = vi.fn()
    render(<TendDrawer {...base} clusters={[cluster]} onNameGroup={onNameGroup} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'kids bedtime routine' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['a', 'b'])
    expect(onNameGroup).not.toHaveBeenCalled()
  })

  it('folds via a suggestion button filtered by typed text', () => {
    const onFoldInto = vi.fn()
    render(<TendDrawer {...base} clusters={[cluster]} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }, { id: 'x', name: 'Camp Mornings' }]} />)
    fireEvent.change(screen.getByPlaceholderText('Name this rhythm'), { target: { value: 'bedtime' } })
    expect(screen.queryByRole('button', { name: 'Camp Mornings' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kids Bedtime Routine' }))
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['a', 'b'])
  })

  it('dismisses a group suggestion with its g: key', () => {
    const onDismiss = vi.fn()
    render(<TendDrawer {...base} clusters={[cluster]} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss.*bedtime/i }))
    expect(onDismiss).toHaveBeenCalledWith('g:a.b')
  })

  it('moves a loose item into a chosen routine', () => {
    const onFoldInto = vi.fn()
    const walk = mk({ id: 'walk', name: 'Walk Jax' })
    render(<TendDrawer {...base} looseItems={[walk]} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'walk', name: 'Walk Jax' }, { id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    fireEvent.change(screen.getByLabelText(/move walk jax into/i), { target: { value: 'bed' } })
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['walk'])
    // the routine itself must not be offered as its own target
    expect(screen.queryByRole('option', { name: 'Walk Jax' })).not.toBeInTheDocument()
  })

  it('renders assignee avatars on a loose item', () => {
    const walk = mk({ id: 'walk', name: 'Walk Jax', assigned_to_all: ['iris'] })
    const familyMembers = [
      { id: 'iris', name: 'Iris', initials: 'IR', color: 'purple' } as unknown as FamilyMember,
    ]
    render(<TendDrawer {...base} looseItems={[walk]} familyMembers={familyMembers} />)
    expect(screen.getByText('IR')).toBeInTheDocument()
  })

  it('renders the sleeping section with wake-all', () => {
    const onWakeAll = vi.fn()
    render(<TendDrawer {...base} sleepers={[mk({ name: 'Walk kids to school', visibility: 'reference' })]}
      onWakeAll={onWakeAll} />)
    expect(screen.getByText(/walk kids to school/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /wake all/i }))
    expect(onWakeAll).toHaveBeenCalled()
  })
})
